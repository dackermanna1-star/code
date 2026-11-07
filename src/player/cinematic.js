import * as THREE from 'three';
import { DEPARTURE, ARRIVAL } from '../world/layout.js';
import { DEG } from '../core/constants.js';
import { clamp, damp, noise1, rng } from '../core/util.js';
import { Spring, dampAngle, wrapAngle } from './springs.js';

// =============================================================================
// CINEMATIC CAMERA – exterior shots of our aircraft (outside scene only).
//
// All cameras are expressed in AIRCRAFT-LOCAL space every frame (the outside
// scene is rendered around the aircraft at the origin). World-anchored cameras
// (spotter, flyby) keep a fixed WORLD point and convert it with
// app.world.toLocal each frame; "up" is the world up vector in local space, so
// the horizon stays level while the aircraft banks in frame.
//
//   1 Chase cam   – behind & above, lagging the heading/pitch and accelerations
//   2 Wing view   – mounted on the fuselage aft of the wing, looking out along
//                   the wing and engine (alternates sides)
//   3 Tail cam    – on top of the fin looking forward over the fuselage
//   4 Spotter     – long-lens ground photographer at curated spots of the
//                   current airport (gate, taxiway, runway side, under the
//                   approach…); becomes an air-to-air camera ship when high
//   5 Flyby       – placed ahead on the trajectory, the aircraft passes;
//                   a slow ground-level walkaround when parked
//   6 Free orbit  – mouse drag + wheel zoom, slow auto-rotation when idle
// =============================================================================

export const SHOTS = [
  { id: 'chase', key: 1, name: 'Chase cam' },
  { id: 'wing', key: 2, name: 'Wing view' },
  { id: 'tail', key: 3, name: 'Tail cam' },
  { id: 'spotter', key: 4, name: 'Spotter' },
  { id: 'flyby', key: 5, name: 'Flyby' },
  { id: 'orbit', key: 6, name: 'Free orbit' },
];
const SHOT_IDS = SHOTS.map((s) => s.id);

const ORDER = {
  parked: ['spotter', 'orbit', 'wing', 'flyby', 'chase', 'tail'],
  ground: ['chase', 'spotter', 'wing', 'flyby', 'tail', 'orbit'],
  runway: ['spotter', 'wing', 'chase', 'flyby', 'tail'],
  air: ['chase', 'wing', 'flyby', 'tail', 'spotter', 'orbit'],
};
function phaseGroup(phase) {
  switch (phase) {
    case 'gate': case 'arrived': return 'parked';
    case 'pushback': case 'taxi_out': case 'taxi_in': return 'ground';
    case 'lineup': case 'takeoff': case 'landing': return 'runway';
    default: return 'air';
  }
}

// Spotter positions in airport-local coordinates: [x, height above ground, z]
// (runway along x, centreline z = 0, terminal to the north at z ≈ -470).
const SPOTS = {
  departure: [
    [34, 9, -462],                                   // terminal window, own gate B7
    [-300, 1.7, -322], [-650, 1.7, -320],            // apron edge / taxilane
    [-745, 1.7, -280],                               // corner onto B
    [-1050, 1.7, -165], [-1350, 1.7, -240],          // taxiway A
    [-1560, 1.7, -130],                              // holding point 09
    [-1100, 1.7, 100], [-450, 1.7, 100], [250, 1.7, 100], [900, 1.7, -105], // runway side
    [2300, 1.7, 180], [3800, 1.7, -240], [5600, 2.0, 300],                    // climb-out
  ],
  arrival: [
    [-6200, 3, 160], [-4000, 3, -140], [-2650, 1.7, 75],                      // under the approach
    [-1250, 1.7, 100], [-650, 1.7, -105], [250, 1.7, 100],                    // touchdown zone
    [520, 1.7, -110],                                                          // rapid exit
    [680, 1.7, -280], [420, 1.7, -322],                                        // taxi in
    [284, 9, -462],                                                            // terminal window, gate C10
  ],
};

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Cinematic {
  constructor(app, onChange) {
    this.app = app;
    this.onChange = onChange || (() => {});
    this.active = false;
    this.shot = 'chase';
    this.auto = true;
    this.label = '';
    this.timer = 0;
    this.nextCut = 15;
    this.rand = rng(9071);

    // per-frame aircraft frame
    this.P = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.qi = new THREE.Quaternion();
    this.upL = new THREE.Vector3(0, 1, 0);
    this.fwdW = new THREE.Vector3(0, 0, -1);
    this.headingYaw = 0;
    this.vel = new THREE.Vector3();
    this.speed = 0;
    this.accW = new THREE.Vector3();
    this._prevVel = new THREE.Vector3();
    this._haveVel = false;

    // camera output (aircraft-local)
    this.eye = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.fov = 50;
    this.fovS = null;
    this.jitter = 0;

    // shot state
    this.chase = { yaw: 0, pitch: 0, dist: 46, lx: new Spring(2.4, 0.85), ly: new Spring(2.4, 0.85), lz: new Spring(2.4, 0.85) };
    this.wingSide = -1;
    this.spot = { world: new THREE.Vector3(), kind: 'ground', aim: new THREE.Vector3(0, 0, -1), check: 0, index: -1, airYaw: 0, side: 1, region: '' };
    this.fly = { world: new THREE.Vector3(), placed: 0, life: 10, mode: 'pass', angle: 0, side: 1 };
    this.orbit = { az: 140 * DEG, el: 12 * DEG, dist: 58, yaw: 0, idle: 99, lastX: 0, lastY: 0, dragging: false };
    this._time = 0;
    this._phase = null;

    app.events.on('flight:skip', () => this._teleported());
    app.events.on('flight:restart', () => this._teleported());
  }

  _teleported() {
    this._haveVel = false;
    this.spot.check = 0; this.spot.index = -1;
    this.fly.placed = -1e9;
    this.fovS = null;
  }

  // --------------------------------------------------------------------------------
  enter(shot) {
    this.active = true;
    this.timer = 0;
    this.nextCut = 13 + this.rand() * 5;
    this._haveVel = false;
    this._frame(0);
    const id = this._resolveShot(shot);
    this.auto = shot == null;
    this._begin(id || this._orderFor()[0]);
  }

  exit() { this.active = false; }

  _resolveShot(shot) {
    if (shot == null || shot === '') return null;
    if (typeof shot === 'number' || /^\d+$/.test(String(shot))) {
      const i = Number(shot) - 1;
      return SHOT_IDS[clamp(Math.round(i), 0, SHOT_IDS.length - 1)];
    }
    const s = String(shot).toLowerCase();
    return SHOT_IDS.includes(s) ? s : null;
  }

  /** Pick a shot (1-6 or id). manual = true disables the auto cycle. */
  select(shot, manual = true) {
    const id = this._resolveShot(shot);
    if (!id) return false;
    if (manual) this.auto = false;
    this._begin(id);
    return true;
  }

  setAuto(on) { this.auto = !!on; this.timer = 0; this._emit(true); }

  next() {
    const order = this._orderFor();
    const i = order.indexOf(this.shot);
    this._begin(order[(i + 1) % order.length]);
  }

  _orderFor() { return ORDER[phaseGroup(this.app.flight.state.phase)] || ORDER.air; }

  _begin(id) {
    const prev = this.shot;
    this.shot = id;
    this.timer = 0;
    this.nextCut = 13 + this.rand() * 5;
    this.fovS = null;
    const st = this.app.flight.state;
    if (id === 'chase') {
      const c = this.chase;
      c.yaw = this.headingYaw; c.pitch = clamp(st.pitch || 0, -0.3, 0.4) * 0.6;
      c.lx.reset(); c.ly.reset(); c.lz.reset();
    } else if (id === 'wing') {
      if (prev === 'wing' || this._wingUsed) this.wingSide = -this.wingSide;
      this._wingUsed = true;
    } else if (id === 'spotter') {
      this._pickSpot(true);
    } else if (id === 'flyby') {
      this._placeFlyby();
    } else if (id === 'orbit') {
      this._initOrbitFromCamera(prev !== 'orbit');
    }
    this._emit(true);
  }

  _labelFor() {
    if (this.shot === 'spotter') return this.spot.kind === 'air' ? 'Air-to-air' : 'Spotter';
    if (this.shot === 'flyby') return this.fly.mode === 'walk' ? 'Walkaround' : 'Flyby';
    return SHOTS.find((s) => s.id === this.shot)?.name || this.shot;
  }

  _emit(force) {
    const label = this._labelFor();
    if (!force && label === this.label) return;
    this.label = label;
    this.onChange({ shot: label, shotId: this.shot, index: SHOT_IDS.indexOf(this.shot) + 1, auto: this.auto });
  }

  // --------------------------------------------------------------------------------
  _gh(x, z) {
    try {
      const h = this.app.world.groundHeight(x, z);
      return Number.isFinite(h) ? Math.max(0, h) : 0;
    } catch { return 0; }
  }

  _frame(dt) {
    const st = this.app.flight.state;
    this.P.copy(st.position);
    this.q.copy(st.quaternion);
    this.qi.copy(this.q).invert();
    this.upL.copy(UP).applyQuaternion(this.qi);
    this.fwdW.set(0, 0, -1).applyQuaternion(this.q);
    const h = Math.hypot(this.fwdW.x, this.fwdW.z);
    if (h > 1e-4) this.headingYaw = Math.atan2(-this.fwdW.x, -this.fwdW.z);
    this.vel.copy(st.velocity);
    this.speed = this.vel.length();
    if (dt > 0) {
      if (!this._haveVel) { this._prevVel.copy(this.vel); this._haveVel = true; }
      _v.subVectors(this.vel, this._prevVel).divideScalar(dt);
      if (_v.lengthSq() > 400) _v.set(0, 0, 0);
      this.accW.lerp(_v, 1 - Math.exp(-3 * dt));
      this._prevVel.copy(this.vel);
    }
    const ph = st.phase;
    if (ph !== this._phase) { this._phase = ph; this.spot.check = 0; }
  }

  /**
   * World point -> aircraft-local. Same transform as app.world.toLocal, but built from
   * the flight state of this very frame (also valid before the first core world sync).
   */
  _toLocal(world, out) { return out.copy(world).sub(this.P).applyQuaternion(this.qi); }
  _dirToLocal(dirW, out) { return out.copy(dirW).applyQuaternion(this.qi); }

  /** vertical fov (deg) framing an object of `size` m at `dist` m to `fill` of the frame width */
  _frameFov(dist, fill = 0.6, size = 40, min = 0.8, max = 55) {
    const aspect = this.app.camera.aspect || 16 / 9;
    const tanH = (size * 0.5) / (fill * Math.max(1, dist));
    return clamp(2 * Math.atan(tanH / aspect) / DEG, min, max);
  }

  // --------------------------------------------------------------------------------
  update(dt) {
    if (!this.active) return;
    this._time += dt;
    this._frame(dt);
    this._handleMouse(dt);
    if (this.auto && !this.app.paused) {
      this.timer += dt;
      if (this.timer >= this.nextCut) this.next();
    }
    switch (this.shot) {
      case 'chase': this._chase(dt); break;
      case 'wing': this._wing(dt); break;
      case 'tail': this._tail(dt); break;
      case 'spotter': this._spotter(dt); break;
      case 'flyby': this._flyby(dt); break;
      case 'orbit': this._orbit(dt); break;
      default: this._chase(dt);
    }
    this._apply(dt);
    this._emit(false);
  }

  _apply(dt) {
    const cam = this.app.camera;
    cam.position.copy(this.eye);
    _m.lookAt(this.eye, this.target, this.up);
    cam.quaternion.setFromRotationMatrix(_m);
    if (this.jitter > 0) {
      const t = this._time, j = this.jitter;
      _e.set(j * noise1(t * 1.7 + 3.3), j * noise1(t * 1.3 + 7.7), j * 0.4 * noise1(t * 0.9 + 1.1), 'YXZ');
      _q.setFromEuler(_e);
      cam.quaternion.multiply(_q);
    }
    this.fovS = this.fovS == null ? this.fov : damp(this.fovS, this.fov, 2.2, dt);
    if (Math.abs(cam.fov - this.fovS) > 1e-4) { cam.fov = this.fovS; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }

  _airframeShake(scale) {
    const st = this.app.flight.state;
    const k = Number(this.app.settings.get('cameraShake'));
    const shake = Number.isFinite(k) ? clamp(k, 0, 1.5) : 1;
    return shake * scale * (0.0006 * (st.vibration || 0) + 0.0035 * (st.runwayRumble || 0) + 0.002 * (st.buffet || 0) + 0.0012 * (st.turbulence || 0));
  }

  // 1 ------------------------------------------------------------------------------
  _chase(dt) {
    const c = this.chase, st = this.app.flight.state;
    c.yaw = dampAngle(c.yaw, this.headingYaw, 1.3, dt);
    c.pitch = damp(c.pitch, clamp(st.pitch || 0, -0.3, 0.4) * 0.6, 1.0, dt);
    const back = c.dist, up = c.dist * 0.2;
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const y = up * cp - back * sp, z = up * sp + back * cp;
    _w.set(z * Math.sin(c.yaw), y, z * Math.cos(c.yaw));
    // lag on accelerations (the camera car / chase plane can't respond instantly)
    const a = this.accW;
    _w.x += clamp(c.lx.step(-a.x * 0.45, dt), -6, 6);
    _w.y += clamp(c.ly.step(-a.y * 0.45, dt), -6, 6);
    _w.z += clamp(c.lz.step(-a.z * 0.45, dt), -6, 6);
    _w.add(this.P);
    _w.y = Math.max(_w.y, this._gh(_w.x, _w.z) + 2.0);
    this._toLocal(_w, this.eye);
    this.target.set(0, 1.2, -5);
    this.up.copy(this.upL);
    this.fov = 48;
    this.jitter = 0.0004 + this._airframeShake(0.15);
  }

  // 2 ------------------------------------------------------------------------------
  _wing() {
    const s = this.wingSide;
    this.eye.set(s * 2.1, 1.2, 6.8);
    this.target.set(s * 9.6, -0.95, -1.6);
    this.up.set(0, 1, 0);
    this.fov = 54;
    this.jitter = this._airframeShake(0.6);
  }

  // 3 ------------------------------------------------------------------------------
  _tail() {
    this.eye.set(0, 10.45, 17.35);
    this.target.set(0, 1.3, -14);
    this.up.set(0, 1, 0);
    this.fov = 60;
    this.jitter = this._airframeShake(1.0);
  }

  // 4 ------------------------------------------------------------------------------
  _airportOrigin(region) {
    return region === 'arrival' ? this.app.world.arrivalOrigin : this.app.world.departureOrigin;
  }

  _regionGuess() {
    const st = this.app.flight.state;
    if (st.region === 'arrival' || st.region === 'departure') return st.region;
    // nearest airport
    const dep = this.app.world.departureOrigin, arr = this.app.world.arrivalOrigin;
    return this.P.distanceToSquared(arr) < this.P.distanceToSquared(dep) ? 'arrival' : 'departure';
  }

  _pickSpot(force) {
    const sp = this.spot, st = this.app.flight.state;
    const agl = Number.isFinite(st.altitudeAGL) ? st.altitudeAGL : this.P.y - this._gh(this.P.x, this.P.z);
    const prevKind = sp.kind, prevIndex = sp.index, prevRegion = sp.region;
    if (agl > 1100) {
      if (sp.kind !== 'air' || force) {
        sp.kind = 'air'; sp.index = -1; sp.airYaw = this.headingYaw; sp.side = this.rand() < 0.5 ? -1 : 1;
        this.fovS = null;
      }
      return;
    }
    const region = this._regionGuess();
    const origin = this._airportOrigin(region);
    const list = SPOTS[region];
    // where will the aircraft be in a few seconds? (anticipate the roll / approach)
    const grp = phaseGroup(st.phase);
    const minSpeed = grp === 'runway' ? 40 : (st.phase === 'approach' ? 70 : 0);
    const look = 7;
    _v2.copy(this.vel).setY(0);
    const vh = _v2.length();
    if (vh < minSpeed) { _v2.set(this.fwdW.x, 0, this.fwdW.z).normalize().multiplyScalar(minSpeed); }
    _v.copy(this.P).addScaledVector(_v2, look);
    let best = -1, bestD = Infinity;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const wx = origin.x + s[0], wz = origin.z + s[2];
      const dNow = Math.hypot(wx - this.P.x, wz - this.P.z);
      if (dNow < 40 || dNow > 7000) continue;
      const d = Math.hypot(wx - _v.x, wz - _v.z);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) {
      if (sp.kind !== 'air') { sp.kind = 'air'; sp.airYaw = this.headingYaw; sp.side = this.rand() < 0.5 ? -1 : 1; this.fovS = null; }
      sp.index = -1;
      return;
    }
    if (!force && sp.kind === 'ground' && best === prevIndex && region === prevRegion) return;
    const s = list[best];
    sp.kind = 'ground'; sp.index = best; sp.region = region;
    const wx = origin.x + s[0], wz = origin.z + s[2];
    sp.world.set(wx, origin.y + this._gh(wx, wz) + s[1], wz);
    _w.copy(this.P).sub(sp.world).normalize();
    sp.aim.copy(_w);
    if (prevKind !== sp.kind || prevIndex !== sp.index) this.fovS = null;
  }

  _spotter(dt) {
    const sp = this.spot, st = this.app.flight.state;
    sp.check -= dt;
    if (sp.check <= 0) {
      sp.check = 0.5;
      if (sp.kind === 'air') {
        const agl = Number.isFinite(st.altitudeAGL) ? st.altitudeAGL : 9999;
        if (agl < 800) this._pickSpot(false);
      } else {
        const d = this.P.distanceTo(sp.world);
        _v.copy(this.P).sub(sp.world);
        const receding = _v.dot(this.vel) > 0 && this.speed > 2;
        const agl = Number.isFinite(st.altitudeAGL) ? st.altitudeAGL : 0;
        if (d > 6500 || (receding && d > 950) || agl > 1500) this._pickSpot(false);
      }
    }
    // camera position
    if (sp.kind === 'air') {
      sp.airYaw = dampAngle(sp.airYaw, this.headingYaw, 0.6, dt);
      const t = this._time;
      const lat = sp.side * 62, up = 6 + 3 * Math.sin(t * 0.09), fwd = -8 + 16 * Math.sin(t * 0.05);
      const c = Math.cos(sp.airYaw), s = Math.sin(sp.airYaw);
      // heading frame: x right, z aft  -> world
      _w.set(lat * c + fwd * s, up, -lat * s + fwd * c).add(this.P);
    } else {
      _w.copy(sp.world);
    }
    this._track(_w, dt, sp.kind === 'air' ? 4 : 6.5, sp.kind === 'air' ? 0.75 : 0.62, sp.kind === 'air' ? [16, 45] : [0.9, 55]);
    this.jitter += sp.kind === 'air' ? 0.0006 : 0;
  }

  /** Common tracking camera: fixed world eye, smoothed aim at the aircraft, framing zoom. */
  _track(eyeWorld, dt, aimLambda, fill, fovRange) {
    // aircraft centre (slightly forward of the wing) in world
    _v.set(0, 0.6, -1.5).applyQuaternion(this.q).add(this.P);
    _v2.copy(_v).sub(eyeWorld);
    const dist = Math.max(1, _v2.length());
    _v2.divideScalar(dist);
    const aim = this._aim || (this._aim = new THREE.Vector3(0, 0, -1));
    if (this.fovS == null || !this._aimInit) { aim.copy(_v2); this._aimInit = true; } else {
      aim.lerp(_v2, 1 - Math.exp(-aimLambda * dt)).normalize();
    }
    this._toLocal(eyeWorld, this.eye);
    _w.copy(eyeWorld).addScaledVector(aim, 50);
    this._toLocal(_w, this.target);
    this.up.copy(this.upL);
    this.fov = this._frameFov(dist, fill, 40, fovRange[0], fovRange[1]);
    // long lens: tiny hand-held / tripod wobble proportional to the field of view
    this.jitter = this.fov * DEG * 0.0035;
  }

  // 5 ------------------------------------------------------------------------------
  _placeFlyby() {
    const f = this.fly, st = this.app.flight.state;
    f.placed = this._time;
    if (this.speed < 3) {
      f.mode = 'walk';
      f.angle = (this.rand() < 0.5 ? 1 : -1) * (40 + this.rand() * 40) * DEG;
      f.life = 1e9;
      this.fovS = null;
      return;
    }
    f.mode = 'pass';
    _v.copy(this.vel).divideScalar(this.speed);                 // travel direction
    _v2.crossVectors(_v, UP);
    if (_v2.lengthSq() < 1e-6) _v2.set(1, 0, 0);
    _v2.normalize();
    f.side = this.rand() < 0.5 ? -1 : 1;
    const ahead = clamp(this.speed * 5.5, 70, 1500);
    const onGround = !!st.onGround || (st.altitudeAGL ?? 1e9) < 15;
    const lateral = onGround ? 50 + this.rand() * 15 : clamp(32 + this.speed * 0.12, 35, 70);
    f.world.copy(this.P).addScaledVector(_v, ahead).addScaledVector(_v2, lateral * f.side);
    const gh = this._gh(f.world.x, f.world.z);
    if (onGround) f.world.y = gh + 1.7;
    else {
      f.world.y += this.rand() < 0.55 ? -(6 + this.rand() * 8) : 5 + this.rand() * 6;
      f.world.y = Math.max(f.world.y, gh + 3);
    }
    f.life = ahead / this.speed + 4.5;
    this.fovS = null;
  }

  _flyby(dt) {
    const f = this.fly;
    if (f.mode === 'walk') {
      if (this.speed > 4) { this._placeFlyby(); } else {
        f.angle += dt * 2.6 * DEG;
        const r = 36, a = this.headingYaw + f.angle;
        _w.set(this.P.x - Math.sin(a) * r, 0, this.P.z - Math.cos(a) * r);
        _w.y = this._gh(_w.x, _w.z) + 1.65;
        this._track(_w, dt, 5, 0.85, [20, 62]);
        return;
      }
    }
    const age = this._time - f.placed;
    const d = this.P.distanceTo(f.world);
    _v.copy(this.P).sub(f.world);
    const receding = _v.dot(this.vel) > 0;
    if (age > f.life || (receding && d > Math.max(170, this.speed * 3.5)) || d > 4000) this._placeFlyby();
    this._track(f.world, dt, 9, 0.55, [12, 62]);
  }

  // 6 ------------------------------------------------------------------------------
  _initOrbitFromCamera(fromOther) {
    const o = this.orbit;
    o.yaw = this.headingYaw;
    o.idle = 0;
    if (!fromOther) return;
    // continue from wherever the previous camera was (relative to the aircraft, world axes)
    _w.copy(this.app.camera.position).applyQuaternion(this.q);
    const dist = _w.length();
    if (dist > 8 && dist < 600) {
      const c = Math.cos(-o.yaw), s = Math.sin(-o.yaw);
      const x = _w.x * c + _w.z * s, z = -_w.x * s + _w.z * c;
      o.dist = clamp(dist, 14, 400);
      o.el = clamp(Math.asin(clamp(_w.y / dist, -1, 1)), -8 * DEG, 80 * DEG);
      o.az = Math.atan2(x, z);
    }
  }

  wheel(delta) {
    if (this.shot === 'orbit') this.orbit.dist = clamp(this.orbit.dist * Math.pow(1.12, delta), 14, 400);
    else if (this.shot === 'chase') this.chase.dist = clamp(this.chase.dist * Math.pow(1.1, delta), 22, 160);
    this.orbit.idle = 0;
  }

  _handleMouse() {
    const m = this.app.input.mouse, o = this.orbit;
    const down = (m.buttons & 1) || (m.buttons & 2);
    if (down) {
      if (!o.dragging) { o.dragging = true; o.lastX = m.x; o.lastY = m.y; o.moved = 0; return; }
      const dx = m.x - o.lastX, dy = m.y - o.lastY;
      o.lastX = m.x; o.lastY = m.y;
      o.moved += Math.abs(dx) + Math.abs(dy);
      if (this.shot !== 'orbit') {
        if (o.moved > 6) { this.auto = false; this._begin('orbit'); }
        return;
      }
      const sens = 0.0055 * (Number(this.app.settings.get('mouseSensitivity')) || 1);
      o.az -= dx * sens;
      o.el = clamp(o.el + dy * sens * (this.app.settings.get('invertY') ? -1 : 1), -8 * DEG, 80 * DEG);
      o.idle = 0;
    } else o.dragging = false;
  }

  _orbit(dt) {
    const o = this.orbit;
    o.idle += dt;
    o.yaw = dampAngle(o.yaw, this.headingYaw, 2, dt);
    if (o.idle > 4) o.az = wrapAngle(o.az + dt * 2.2 * DEG * Math.min(1, (o.idle - 4) / 2));
    const a = o.yaw + o.az, ce = Math.cos(o.el);
    _w.set(Math.sin(a) * ce * o.dist, Math.sin(o.el) * o.dist, Math.cos(a) * ce * o.dist).add(this.P);
    const gh = this._gh(_w.x, _w.z) + 1.5;
    if (_w.y < gh) _w.y = gh;
    this._toLocal(_w, this.eye);
    this.target.set(0, 0.6, -1);
    this.up.copy(this.upL);
    this.fov = 45;
    this.jitter = 0;
  }
}
