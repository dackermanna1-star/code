import * as THREE from 'three';
import { SEAT, SEAT_LIST, DEG } from '../core/constants.js';
import { clamp, damp, smoothstep } from '../core/util.js';
import { MotionFeel } from './motion.js';
import { Walker } from './walker.js';
import { Headroom } from './headroom.js';
import { Focus } from './focus.js';
import { ZoneTracker } from './zones.js';
import { PathTransition } from './transition.js';
import { Cinematic, SHOTS } from './cinematic.js';
import { wrapAngle, easeInOutSine } from './springs.js';

// =============================================================================
// PLAYER: the first-person passenger (body, head, camera) and the optional
// cinematic exterior camera.
//
//   * walking (WASD / arrows, Shift faster, C / Ctrl toggles crouch), mouse look
//     (pointer lock; settings.mouseSensitivity / invertY), collisions
//   * sitting in any seat with an eased path from the aisle (Space / X stands up),
//     seated look limits, automatic lean towards the window, wheel = lean in
//   * aircraft motion feel (head inertia, vibration, turbulence, touchdown…)
//   * focus mode for the seatback screen (IFE) – focusOn / releaseFocus
//   * cabin zones (player:zone) for acoustics and lav lighting
//   * cinematic exterior view: V toggles, 1–6 pick shots, 0 = auto cycle
//
// Camera pose is written at update priority 50; interactions are raycast from
// the camera at priority 60.
// =============================================================================

const HEAD = new THREE.Vector3(0, 0.075, -0.085);   // eye relative to the neck pivot (head frame)
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const SEATED_YAW = 120 * DEG;
const SEATED_PITCH = [-70 * DEG, 60 * DEG];
const STAND_PITCH = 85 * DEG;
const LOOK_SPEED = 0.0022;          // rad per pixel at sensitivity 1
const START = { x: 0, z: -13.6, yaw: Math.PI };
const STAND_KEYS = new Set(['Space', 'KeyX']);
const CROUCH_KEYS = new Set(['KeyC', 'ControlLeft', 'ControlRight']);

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _e2 = new THREE.Euler(0, 0, 0, 'XYZ');
const _qv = new THREE.Quaternion();
const _qm = new THREE.Quaternion();
const _qh = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export async function init(app) {
  const player = new Player(app);
  return player.api;
}

class Player {
  constructor(app) {
    this.app = app;
    this.cam = app.camera;
    this.feel = new MotionFeel(app);
    this.headroom = new Headroom(app);
    this.walker = new Walker(app, this.headroom);
    this.focus = new Focus(app);
    this.zones = new ZoneTracker(app);
    this.trans = new PathTransition();
    this.cine = new Cinematic(app, (info) => this._emitView(info));

    this.yaw = START.yaw;
    this.pitch = 0;
    this.seat = null;              // SeatDescriptor while seated
    this.pending = null;           // seat being sat down into / stood up from
    this.view = 'first-person';
    this.lean = new THREE.Vector3();
    this.manualLean = 0;
    this._eye = new THREE.Vector3();
    this._bodyEye = new THREE.Vector3(START.x, SEAT.standingEyeHeight, START.z);   // eye before the neck model
    this._feetOut = new THREE.Vector3(START.x, 0, START.z);
    this._ctl = { forward: 0, strafe: 0, sprint: false };
    this._fade = null;
    this._fallbackSeats = new Map();
    this._hintShown = false;
    this._prevInputMode = 'play';

    this.walker.place(START.x, START.z);
    this._applyDebugPose();
    this._makeStandProxy();
    this._bindEvents();
    this._buildApi();

    app.addUpdate((dt, t) => this.update(dt, t), 50, 'player');
    app.addUpdate(() => { try { app.interactions.update(this.cam); } catch (e) { console.warn('[player] interactions', e); } }, 60, 'player:interactions');
    // first pose immediately (so the very first rendered frame is right)
    this.update(0, 0);
  }

  // =============================================================================
  // seats
  // =============================================================================
  _seat(id) {
    if (!id) return null;
    const key = String(id).trim().toUpperCase();
    let s = null;
    try { s = this.app.seats?.byId?.(key) || null; } catch { s = null; }
    if (s && s.eye && s.eye.isVector3) return s;
    if (this._fallbackSeats.has(key)) return this._fallbackSeats.get(key);
    const d = SEAT_LIST.find((x) => x.id === key);
    if (!d) return null;
    const dims = d.cls === 'business' ? SEAT.business : SEAT.economy;
    const fb = {
      ...d,
      position: new THREE.Vector3(d.x, dims.cushionY, d.z),
      eye: new THREE.Vector3(d.x, SEAT.seatedEyeHeight, d.z + 0.12),
      standPoint: new THREE.Vector3(0, 0, d.z + 0.1),
      screenAnchor: null,
      screenSize: { w: 0.256, h: 0.16 },
      state: { tray: 0, recline: 0, belt: false, armrests: [0, 0], occupied: false },
    };
    this._fallbackSeats.set(key, fb);
    return fb;
  }

  _standPoint(seat, out) {
    const sp = seat.standPoint;
    if (sp && sp.isVector3) return out.set(sp.x, 0, sp.z);
    return out.set(0, 0, seat.z + 0.1);
  }

  _setOccupied(seat, on) { try { if (seat && seat.state) seat.state.occupied = on; } catch { /* ignore */ } }

  _occupy(seat) {
    this.seat = seat;
    this.pending = null;
    this._setOccupied(seat, true);
    this.yaw = clamp(wrapAngle(this.yaw), -SEATED_YAW, SEATED_YAW);
    this.lean.set(0, 0, 0);
    this.manualLean = 0;
    this._updateStandProxy();
    this.app.events.emit('player:sit', { seatId: seat.id });
    if (!this._hintShown && this.app.started) {
      this._hintShown = true;
      try { this.app.hud?.toast?.('Space or X to stand up · Scroll to lean', 3200); } catch { /* optional */ }
    }
  }

  _vacate(seat) {
    if (!seat) return;
    this._setOccupied(seat, false);
    if (this.seat === seat) this.seat = null;
    this._updateStandProxy();
    this.app.events.emit('player:stand', { seatId: seat.id });
  }

  _play(name, pos, volume = 1) {
    try { this.app.audio?.play?.(name, { position: pos ? pos.clone() : undefined, volume }); } catch { /* optional */ }
  }

  /** Sit down in seat `id`. opts: {instant, yaw, pitch}. Returns false if the seat does not exist. */
  sit(id, opts = {}) {
    const seat = this._seat(id);
    if (!seat) return false;
    if (this.view === 'cinematic') this.setView('first-person');
    if (this.focus.target) this.focus.release({ instant: true });
    if (this.seat === seat && !this.trans.active) return true;
    if (this._fade) return false;
    if (this.trans.active) this._abortTransition();
    const from = this.seat;
    if (from && from !== seat) this._vacate(from);

    if (opts.instant) {
      this._occupy(seat);
      this.yaw = Number.isFinite(opts.yaw) ? clamp(opts.yaw, -SEATED_YAW, SEATED_YAW) : 0;
      this.pitch = Number.isFinite(opts.pitch) ? clamp(opts.pitch, SEATED_PITCH[0], SEATED_PITCH[1]) : -4 * DEG;
      return true;
    }
    const sp = this._standPoint(seat, _v2);
    const eye = this._bodyEye;
    const sameRow = from && Math.abs(from.z - seat.z) < 0.3 && from.side === seat.side;
    const dist = Math.hypot(eye.x - sp.x, eye.z - sp.z);
    if (!sameRow && (dist > 4.5 || (from && !sameRow))) {
      // far away (HUD seat map): quick fade, teleport into the aisle next to the row, sit down
      const spc = sp.clone();
      this._fadeTeleport(() => {
        this.walker.place(spc.x, spc.z);
        this.walker.eyeHeight = this.walker.standHeight;
        this.yaw = 0;
        this.pitch = 0;
        this._bodyEye.set(spc.x, this.walker.standHeight, spc.z);
        this._startSit(seat, null);
      });
      this.pending = seat;
      this._setOccupied(seat, true);
      return true;
    }
    this._startSit(seat, sameRow ? from : null);
    return true;
  }

  _startSit(seat, fromSeat) {
    const sp = this._standPoint(seat, new THREE.Vector3());
    const standH = this.walker.standHeight;
    const start = this._bodyEye;
    const pts = [start.clone()];
    let startX, walk = 0;
    if (fromSeat) {
      pts.push(new THREE.Vector3(fromSeat.x, 1.3, fromSeat.z - 0.12), new THREE.Vector3(fromSeat.x, 1.42, seat.z - 0.3));
      startX = fromSeat.x;
    } else {
      walk = Math.hypot(start.x - sp.x, start.z - sp.z);
      if (walk > 0.2) pts.push(new THREE.Vector3(sp.x, Math.min(standH, start.y + 0.02), sp.z));
      startX = sp.x;
    }
    const rowZ = seat.z - 0.3;
    const lateral = Math.abs(seat.x - startX);
    if (lateral > 0.32) pts.push(new THREE.Vector3((startX + seat.x) * 0.5, 1.47, rowZ - 0.02));
    pts.push(new THREE.Vector3(seat.x, 1.42, rowZ), new THREE.Vector3(seat.x, 1.3, seat.z - 0.12));
    const end = seat.eye.clone();
    pts.push(end);
    // drop duplicated points (CatmullRom dislikes them)
    for (let i = pts.length - 1; i > 0; i--) if (pts[i].distanceTo(pts[i - 1]) < 0.03) pts.splice(i, 1);
    if (pts.length < 2) pts.unshift(start.clone().add(new THREE.Vector3(0, 0.01, 0)));
    const duration = 0.8 + 0.55 * lateral + walk / 1.25;
    // yaw: turn towards the seat side while shuffling in, then face forward (unwrapped keys)
    const y0 = wrapAngle(this.yaw);
    const sideYaw = (seat.x < startX ? 1 : -1) * (lateral > 0.32 ? 38 : 15) * DEG;
    const ym = y0 + wrapAngle(sideYaw - y0);
    const y1 = ym + wrapAngle(0 - ym);
    this.pending = seat;
    this._setOccupied(seat, true);
    const seatPos = seat.position && seat.position.isVector3 ? seat.position : end;
    this.trans.start({
      kind: 'sit', points: pts, duration, ease: easeInOutSine,
      yaw: [{ u: 0, v: y0 }, { u: 0.42, v: ym }, { u: 1, v: y1 }],
      pitch: [{ u: 0, v: this.pitch }, { u: 0.4, v: -14 * DEG }, { u: 0.82, v: -9 * DEG }, { u: 1, v: -4 * DEG }],
      events: [{ u: 0.74, fn: () => this._play('seat_sit', seatPos, 0.9) }],
      onDone: () => {
        this.yaw = 0; this.pitch = -4 * DEG;
        this._occupy(seat);
        const k = this.feel.shake();
        this.feel.seatY.kick(-0.07 * k);    // settling into the cushion
      },
    });
  }

  /** Stand up from the current seat. opts: {instant}. */
  stand(opts = {}) {
    if (this.trans.active && this.trans.kind === 'sit' && this.pending) {
      // changed our mind half way: finish sitting, then stand
      this.trans.finish();
    }
    const seat = this.seat;
    if (!seat || this._fade) return false;
    if (this.view === 'cinematic' && !opts.instant) this.setView('first-person');
    if (this.focus.target) this.focus.release({ instant: true });
    const sp = this._standPoint(seat, new THREE.Vector3());
    const finalYaw = Math.abs(wrapAngle(this.yaw)) <= 100 * DEG ? 0 : Math.PI;
    if (opts.instant) {
      this._vacate(seat);
      this.walker.place(sp.x, sp.z);
      this.walker.eyeHeight = this.walker.standHeight;
      this.yaw = finalYaw; this.pitch = 0;
      return true;
    }
    const standH = this.walker.standHeight;
    const rowZ = seat.z - 0.3;
    const pts = [this._bodyEye.clone(), new THREE.Vector3(seat.x, 1.3, seat.z - 0.12), new THREE.Vector3(seat.x, 1.42, rowZ)];
    const lateral = Math.abs(seat.x - sp.x);
    if (lateral > 0.32) pts.push(new THREE.Vector3((seat.x + sp.x) * 0.5, 1.47, rowZ - 0.02));
    pts.push(new THREE.Vector3(sp.x, standH, sp.z));
    for (let i = pts.length - 1; i > 0; i--) if (pts[i].distanceTo(pts[i - 1]) < 0.03) pts.splice(i, 1);
    const y0 = wrapAngle(this.yaw);
    const aisleYaw = (sp.x < seat.x ? 1 : -1) * (lateral > 0.32 ? 40 : 20) * DEG;
    const ym = y0 + wrapAngle(aisleYaw - y0);
    const y1 = ym + wrapAngle(finalYaw - ym);
    this._vacate(seat);
    this.pending = seat;
    const seatPos = seat.position && seat.position.isVector3 ? seat.position : seat.eye;
    this._play('seat_stand', seatPos, 0.9);
    this.trans.start({
      kind: 'stand', points: pts, duration: 0.75 + 0.5 * lateral, ease: easeInOutSine,
      yaw: [{ u: 0, v: y0 }, { u: 0.45, v: ym }, { u: 1, v: y1 }],
      pitch: [{ u: 0, v: this.pitch }, { u: 0.3, v: -12 * DEG }, { u: 1, v: 0 }],
      onDone: () => {
        this.pending = null;
        this.walker.place(sp.x, sp.z);
        this.walker.eyeHeight = standH;
        this.walker.resolveEnabled = true;
        this.yaw = wrapAngle(finalYaw); this.pitch = 0;
        try { this.app.colliders.resolve(this.walker.feet, this.walker.radius); } catch { /* ignore */ }
      },
    });
    return true;
  }

  _abortTransition() {
    const kind = this.trans.kind, seat = this.pending;
    this.trans.cancel();
    if (kind === 'sit' && seat) this._setOccupied(seat, false);
    this.pending = null;
    // continue standing where the eye currently is
    this.walker.place(clamp(this._bodyEye.x, -1.4, 1.4), this._bodyEye.z);
    this.walker.eyeHeight = clamp(this._bodyEye.y, 0.95, this.walker.standHeight);
  }

  _fadeTeleport(mid) {
    this._fade = { t: 0, phase: 'out', out: 0.28, in: 0.45, mid };
  }

  _finishFade() {
    const f = this._fade;
    if (!f) return;
    this._fade = null;
    if (f.phase === 'out') { try { f.mid(); } catch (e) { console.warn('[player] teleport failed', e); } }
    if (this.app.pipeline) this.app.pipeline.fade = 0;
  }

  _updateFade(dt) {
    const f = this._fade;
    if (!f) return;
    f.t += dt;
    const pl = this.app.pipeline;
    if (f.phase === 'out') {
      if (pl) pl.fade = clamp(f.t / f.out, 0, 1);
      if (f.t >= f.out) {
        f.phase = 'in'; f.t = 0;
        try { f.mid(); } catch (e) { console.warn('[player] teleport failed', e); }
      }
    } else {
      if (pl) pl.fade = 1 - clamp(f.t / f.in, 0, 1);
      if (f.t >= f.in) { if (pl) pl.fade = 0; this._fade = null; }
    }
  }

  // "Stand up" interaction: an invisible proxy in the aisle next to the occupied row
  _makeStandProxy() {
    const geo = new THREE.BoxGeometry(0.52, 0.9, 0.62);
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    const m = new THREE.Mesh(geo, mat);
    m.name = 'player:standProxy';
    m.visible = false;
    m.userData.noHeadroom = true;
    m.userData.noCollide = true;
    m.frustumCulled = false;
    this.standProxy = m;
    try {
      this.app.cabinRoot.add(m);
      this.app.interactions.add({
        object: m, label: 'Stand up', maxDistance: 2.4, priority: -5,
        enabled: () => !!this.seat && !this.trans.active && !this.focus.engaged,
        onInteract: () => this.stand(),
      });
    } catch (e) { console.warn('[player] stand proxy', e); }
  }

  _updateStandProxy() {
    const m = this.standProxy;
    if (!m) return;
    if (this.seat) {
      const sp = this._standPoint(this.seat, _v);
      m.position.set(sp.x, 0.45, this.seat.z - 0.05);
      m.visible = true;
    } else m.visible = false;
    m.updateMatrixWorld();
  }

  // =============================================================================
  // pose / debug
  // =============================================================================
  setPose(pos, yawRad = this.yaw, pitchRad = this.pitch, opts = {}) {
    if (this.trans.active) this._abortTransition();
    if (this.focus.target) this.focus.release({ instant: true });
    if (this.seat) this._vacate(this.seat);
    if (this.pending) { this._setOccupied(this.pending, false); this.pending = null; }
    const x = pos && Number.isFinite(pos.x) ? pos.x : (Array.isArray(pos) ? pos[0] : this.walker.feet.x);
    const z = pos && Number.isFinite(pos.z) ? pos.z : (Array.isArray(pos) ? pos[2] : this.walker.feet.z);
    this.walker.place(x, z);
    this.walker.resolveEnabled = opts.resolve !== false;
    if (Number.isFinite(opts.eyeHeight)) { this.walker.standHeight = clamp(opts.eyeHeight, 0.5, 2.1); this.walker.eyeHeight = this.walker.standHeight; }
    if (Number.isFinite(yawRad)) this.yaw = wrapAngle(yawRad);
    if (Number.isFinite(pitchRad)) this.pitch = clamp(pitchRad, -STAND_PITCH, STAND_PITCH);
    return true;
  }

  _applyDebugPose() {
    const d = this.app.debug || {};
    if (Array.isArray(d.pos) && d.pos.length >= 3 && d.pos.every(Number.isFinite)) {
      const eyeH = d.pos[1] > 0.5 ? d.pos[1] : SEAT.standingEyeHeight;
      this.walker.place(d.pos[0], d.pos[2]);
      this.walker.standHeight = clamp(eyeH, 0.5, 2.1);
      this.walker.eyeHeight = this.walker.standHeight;
      this.walker.resolveEnabled = false;      // exactly where asked until the player moves
    }
    if (Array.isArray(d.look) && d.look.length >= 1 && Number.isFinite(d.look[0])) {
      this.yaw = wrapAngle(d.look[0] * DEG);
      this.pitch = clamp((d.look[1] || 0) * DEG, -STAND_PITCH, STAND_PITCH);
    }
  }

  _onReady() {
    const d = this.app.debug || {};
    if (d.seat) {
      const ok = this.sit(d.seat, {
        instant: true,
        yaw: Array.isArray(d.look) ? d.look[0] * DEG : undefined,
        pitch: Array.isArray(d.look) ? (d.look[1] || 0) * DEG : undefined,
      });
      if (!ok) console.warn('[player] debug seat not found:', d.seat);
    }
    this.headroom.invalidate();
    this.zones.update(this._feetOut.x, this._feetOut.z, 0, true);
    if (d.cam) {
      const c = String(d.cam).toLowerCase();
      const m = /^(?:cinematic|exterior|cine)?[-:]?(\w+)?$/.exec(c);
      let shot = null;
      if (m && m[1] && m[1] !== 'cinematic') shot = m[1];
      if (c === 'cinematic' || c === 'exterior' || c === 'cine') shot = null;
      if (c !== 'first-person' && c !== 'fp') this.setView('cinematic', shot);
    }
  }

  // =============================================================================
  // views
  // =============================================================================
  setView(mode, shot) {
    const app = this.app;
    const cine = mode === 'cinematic' || mode === 'exterior' || mode === 'cine';
    if (cine) {
      if (this.view !== 'cinematic') {
        if (this.trans.active) this.trans.finish();
        if (this._fade) this._finishFade();
        if (this.focus.target) this.focus.release({ instant: true, keepMode: true });
        this._prevInputMode = app.input.mode;
        this.view = 'cinematic';
        app.view.mode = 'cinematic';
        app.pipeline.renderCabin = false;
        try { app.exterior?.setFuselageVisible?.(true); } catch (e) { console.warn(e); }
        if (app.input.mode !== 'menu') app.input.setMode('cinematic');
        this.cine.enter(shot);   // emits view:mode
      } else if (shot != null) {
        this.cine.select(shot, true);
      }
      return true;
    }
    if (this.view === 'first-person') return true;
    this.cine.exit();
    this.view = 'first-person';
    app.view.mode = 'first-person';
    app.view.shot = null;
    app.pipeline.renderCabin = true;
    try { app.exterior?.setFuselageVisible?.(false); } catch (e) { console.warn(e); }
    const fov = Number(app.settings.get('fov')) || 72;
    this.cam.fov = fov; this.cam.updateProjectionMatrix();
    if (app.input.mode === 'cinematic') app.input.setMode('play');
    app.events.emit('view:mode', { mode: 'first-person', shot: null });
    this.update(0, app.time);
    return true;
  }

  _emitView(info) {
    this.app.view.shot = info.shotId;
    this.app.events.emit('view:mode', { mode: 'cinematic', ...info });
  }

  // =============================================================================
  // events
  // =============================================================================
  _bindEvents() {
    const app = this.app, ev = app.events;
    ev.on('app:ready', () => this._onReady());
    ev.on('input:keydown', ({ code, event }) => {
      if (event && (event.ctrlKey || event.metaKey) && code !== 'ControlLeft' && code !== 'ControlRight') return;
      const mode = app.input.mode;
      if (code === 'KeyV' && (mode === 'play' || mode === 'cinematic')) {
        this.setView(this.view === 'cinematic' ? 'first-person' : 'cinematic');
        return;
      }
      if (this.view === 'cinematic') {
        if (mode !== 'cinematic') return;
        const m = /^(?:Digit|Numpad)([0-9])$/.exec(code);
        if (m) {
          const n = Number(m[1]);
          if (n === 0) this.cine.setAuto(true);
          else if (n <= SHOTS.length) this.cine.select(n, true);
        }
        return;
      }
      if (this.focus.engaged) {
        if (code === 'Escape' || code === 'Tab') this.releaseFocus();
        return;
      }
      if (mode !== 'play' || this._fade) return;
      if (this.seat && !this.trans.active && STAND_KEYS.has(code)) { this.stand(); return; }
      if (!this.seat && !this.trans.active && CROUCH_KEYS.has(code)) this.walker.crouch = !this.walker.crouch;
    });
    ev.on('input:mousedown', ({ button, locked }) => {
      if (this.focus.engaged && button === 2) { this.releaseFocus(); return; }
      if (this.view === 'first-person' && app.input.mode === 'play' && !locked && button === 0 && app.started) app.input.requestLock();
    });
    ev.on('input:wheel', ({ delta }) => {
      if (this.view === 'cinematic') { this.cine.wheel(delta); return; }
      if (this.seat && app.input.mode === 'play' && !this.focus.engaged) this.manualLean = clamp(this.manualLean - delta * 0.25, 0, 1);
    });
    ev.on('input:mode', ({ mode }) => {
      // somebody (e.g. the HUD resuming from the pause menu) asked for 'play' while we are outside
      if (this.view === 'cinematic' && mode === 'play') queueMicrotask(() => { if (this.view === 'cinematic' && app.input.mode === 'play') app.input.setMode('cinematic'); });
      if (mode === 'play' && this.focus.engaged) this.focus.release({ keepMode: true });
    });
    ev.on('settings:changed', ({ key }) => { if (key === 'fov' && this.view === 'first-person' && !this.focus.target) this.update(0, app.time); });
  }

  // =============================================================================
  // per-frame
  // =============================================================================
  /**
   * Neck model: the eye sits in front of / above the neck pivot, so looking around
   * moves it naturally. seated (0..1): 1 = the torso faces forward (seat), 0 = the
   * whole body turns with the view (standing).
   */
  _neck(eye, yaw, pitch, seated) {
    _e.set(pitch, yaw, 0, 'YXZ');
    _qh.setFromEuler(_e);
    _v.copy(HEAD).applyQuaternion(_qh);
    _v2.copy(HEAD);
    if (seated < 1) _v2.applyAxisAngle(Y_AXIS, yaw * (1 - seated));
    eye.add(_v.sub(_v2));
  }

  _seatedEye(out, dt) {
    const s = this.seat;
    out.copy(s.eye);
    const rec = clamp(Number(s.state && s.state.recline) || 0, 0, 1);
    if (rec > 0 && !s.eyeIncludesRecline) { out.y -= 0.03 * rec; out.z += 0.11 * rec; }
    let lx = 0, ly = 0, lz = 0;
    if (!this.focus.engaged) {
      const ml = this.manualLean;
      if (s.isWindow) {
        const toward = s.side === 'left' ? this.yaw : -this.yaw;
        const w = smoothstep(25 * DEG, 75 * DEG, toward) * (1 - smoothstep(40 * DEG, 65 * DEG, Math.abs(this.pitch)));
        const sg = s.side === 'left' ? -1 : 1;
        lx = sg * (0.075 + 0.02 * ml) * w;
        ly = 0.006 * w - 0.035 * ml * (1 - w);
        lz = -0.04 * w - 0.1 * ml * (1 - w);
      } else { ly = -0.035 * ml; lz = -0.1 * ml; }
    }
    const k = 1 - Math.exp(-3.2 * dt);
    this.lean.x += (lx - this.lean.x) * k;
    this.lean.y += (ly - this.lean.y) * k;
    this.lean.z += (lz - this.lean.z) * k;
    out.add(this.lean);
  }

  update(dt, time) {
    const app = this.app, input = app.input, cam = this.cam;
    const simDt = app.paused ? 0 : dt;
    this._updateFade(dt);
    if (this.view === 'cinematic') {
      input.consumeMouseDelta();
      try { this.cine.update(dt); } catch (e) { console.error('[player] cinematic camera failed, back to first person', e); this.setView('first-person'); }
      return;
    }
    const mode = input.mode;
    const playing = mode === 'play' && !this._fade;
    const md = input.consumeMouseDelta();
    if (playing && !this.trans.active && !this.focus.engaged && (md.dx || md.dy)) {
      const sens = LOOK_SPEED * (Number(app.settings.get('mouseSensitivity')) || 1);
      const inv = app.settings.get('invertY') ? -1 : 1;
      this.yaw -= md.dx * sens;
      this.pitch -= md.dy * sens * inv;
    }
    if (!this.trans.active) {
      if (this.seat) {
        this.yaw = clamp(this.yaw, -SEATED_YAW, SEATED_YAW);   // never wraps while seated
        this.pitch = clamp(this.pitch, SEATED_PITCH[0], SEATED_PITCH[1]);
      } else {
        this.yaw = wrapAngle(this.yaw);
        this.pitch = clamp(this.pitch, -STAND_PITCH, STAND_PITCH);
      }
    }

    // ---- body → base eye -------------------------------------------------------
    const eye = this._eye, w = this.walker;
    let posture = 'standing', bobPitch = 0, bobRoll = 0;
    if (this.trans.active) this.trans.update(dt);
    if (this.trans.active) {
      posture = 'transition';
      this.yaw = this.trans.yaw; this.pitch = this.trans.pitch;
      eye.copy(this.trans.eye);
      this._bodyEye.copy(eye);
      const u = this.trans.u;
      const seatedness = this.trans.kind === 'sit' ? smoothstep(0.55, 1, u) : 1 - smoothstep(0, 0.45, u);
      this._neck(eye, this.yaw, this.pitch, seatedness);
      this._feetOut.set(eye.x, 0, eye.z);
    } else if (this.seat) {
      posture = 'seated';
      this._seatedEye(eye, dt);
      this._bodyEye.copy(eye);
      this._neck(eye, this.yaw, this.pitch, 1);
      this._feetOut.set(this.seat.x, 0, this.seat.z);
    } else {
      const ctl = this._ctl;
      if (playing && !this.focus.engaged) {
        ctl.forward = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
        ctl.strafe = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
        ctl.sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
      } else { ctl.forward = 0; ctl.strafe = 0; ctl.sprint = false; }
      w.update(dt, this.yaw, ctl, this.feel, time);
      eye.set(w.feet.x, w.eyeHeight, w.feet.z);
      this._bodyEye.copy(eye);
      this._neck(eye, this.yaw, this.pitch, 0);
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
      eye.x += w.bob.x * c; eye.z -= w.bob.x * s; eye.y += w.bob.y;
      bobPitch = w.bobPitch + w.nod; bobRoll = w.bobRoll;
      this._feetOut.copy(w.feet);
    }
    if (app.settings.get('headBob') !== false) {
      // breathing / postural sway – barely perceptible, keeps the view alive
      eye.y += 0.0011 * Math.sin(time * 1.37) + 0.0004 * Math.sin(time * 0.61 + 1.3);
      bobRoll += 0.0006 * Math.sin(time * 0.43 + 0.7);
    }

    // ---- aircraft motion feel -----------------------------------------------------
    this.feel.update(simDt, { posture, eyeZ: eye.z });

    // ---- orientation + focus blend ------------------------------------------------
    _e.set(this.pitch + bobPitch, this.yaw, bobRoll, 'YXZ');
    _qv.setFromEuler(_e);
    this.focus.update(dt);
    const fw = this.focus.target ? this.focus.weight : 0;
    if (fw > 0) { eye.lerp(this.focus.eye, fw); _qv.slerp(this.focus.quat, fw); }
    const ms = 1 - 0.55 * fw;
    const r = this.feel.rot;
    _e2.set(r.x * ms, r.y * ms, r.z * ms, 'XYZ');
    _qm.setFromEuler(_e2);
    cam.quaternion.multiplyQuaternions(_qm, _qv);
    cam.position.copy(eye).addScaledVector(this.feel.pos, ms);
    const base = Number(app.settings.get('fov')) || 72;
    const fov = fw > 0 ? base + (this.focus.fov - base) * fw : base;
    if (Math.abs(cam.fov - fov) > 1e-4) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();

    // ---- zones ----------------------------------------------------------------------
    if (dt > 0) this.zones.update(this._feetOut.x, this._feetOut.z, dt);
  }

  // =============================================================================
  // public API
  // =============================================================================
  focusOn(object3D, opts) {
    if (this.view === 'cinematic') return false;
    if (this.trans.active) this.trans.finish();
    return this.focus.focusOn(object3D, opts);
  }

  releaseFocus(opts) { return this.focus.release(opts); }

  _buildApi() {
    const self = this;
    this.api = {
      sit: (id, opts) => self.sit(id, opts),
      stand: (opts) => self.stand(opts),
      get seat() { return self.seat ? self.seat.id : (self.trans.active && self.trans.kind === 'sit' && self.pending ? self.pending.id : null); },
      get seatDescriptor() { return self.seat; },
      get position() { return self._feetOut; },
      get eye() { return self.cam.position; },
      get yaw() { return self.yaw; },
      get pitch() { return self.pitch; },
      setPose: (pos, yaw, pitch, opts) => self.setPose(pos, yaw, pitch, opts),
      setView: (mode, shot) => self.setView(mode, shot),
      get view() { return self.view; },
      get shot() { return self.view === 'cinematic' ? self.cine.shot : null; },
      focusOn: (o, opts) => self.focusOn(o, opts),
      releaseFocus: (opts) => self.releaseFocus(opts),
      isFocused: () => self.focus.engaged,
      get focused() { return self.focus.engaged; },
      get zone() { return self.zones.zone; },
      get crouching() { return !self.seat && self.walker.crouch; },
      set crouching(v) { self.walker.crouch = !!v; },
      get busy() { return self.trans.active || !!self._fade; },
      get speed() { return self.seat ? 0 : self.walker.speed; },
      cinematic: {
        shots: SHOTS,
        select: (shot) => self.view === 'cinematic' ? self.cine.select(shot, true) : self.setView('cinematic', shot),
        next: () => self.cine.next(),
        setAuto: (on) => self.cine.setAuto(on),
        get auto() { return self.cine.auto; },
        get label() { return self.cine.label; },
      },
      // internals for tests / tuning
      _internal: self,
    };
  }
}
