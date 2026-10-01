// The walker: slow, deliberate movement with eased acceleration, gait phase
// driving head bob / sway / roll, heel+toe footstep events placed at the
// planted foot, collision sliding, mouse / keyboard / gamepad / touch.
// Two cameras (V, R3 or a double tap toggles): first person from her eyes, or
// third person over her right shoulder, where she turns to walk wherever you
// steer and faces where you look while she has something to aim.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// third-person camera: distance behind the shoulder pivot, its offset to her right
const TP = { dist: 2.45, aimDist: 1.5, side: 0.42, aimSide: 0.5, height: 1.5 };
const smooth01 = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Player {
  constructor(engine, opts = {}) {
    this.engine = engine;
    this.camera = engine.camera;
    this.pos = new THREE.Vector3(opts.x ?? 0.15, 0, opts.z ?? 1.2);
    this.vel = new THREE.Vector3();
    this.yaw = opts.yaw ?? 0;
    this.pitch = opts.pitch ?? -0.02;
    this.yawT = this.yaw;
    this.pitchT = this.pitch;
    this.radius = 0.24;
    this.eyeHeight = 1.62;
    this.keys = new Set();
    this.enabled = false;
    this.phase = 0; // counts steps; integer = heel strike
    this.stepIndex = 0;
    this.speed = 0;
    this.groundY = 0;
    this.listeners = [];
    this.pending = []; // scheduled toe events
    this.feetYaw = this.yaw;
    this.shuffle = 0;
    this.time = 0;
    this.lookDX = 0;
    this.lookDY = 0;
    this.stride = { L: new THREE.Vector3(), R: new THREE.Vector3() };
    this.rhythm = 1;
    // crouch (picking things up off the ground): 0 standing .. 1 down
    this.crouch = 0;
    this.crouchV = 0;
    this.crouchTarget = 0;
    this.gait = { phase: 0, speed: 0, stepLen: 0.6, plantL: new THREE.Vector3(), plantR: new THREE.Vector3(), bodyYaw: this.yaw };
    this.touch = { move: null, look: null, lastTap: 0 };
    // camera: 'third' (over the shoulder) or 'first' (her eyes); viewK blends 0 first .. 1 third
    this.view = opts.view ?? 'third';
    this.viewK = this.view === 'third' ? 1 : 0;
    this.bodyYaw = this.yaw; // which way she faces (third person: where she walks)
    this.aiming = false; // set by the tools: face where the camera looks and strafe
    this.aimZoom = false; // set by the tools: pull the camera in over the shoulder
    this.aimK = 0;
    this.padR3 = false;
    this.tp = { pivot: new THREE.Vector3(), pv: new THREE.Vector3(), dist: TP.dist, side: TP.side, init: false, hit: { point: new THREE.Vector3(), normal: new THREE.Vector3(), dist: 0, kind: '' } };
    this._f = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this._o = new THREE.Vector3();
    this.bindInput();
  }

  onStep(cb) {
    this.listeners.push(cb);
  }

  emitStep(e) {
    for (const l of this.listeners) l(e);
  }

  /** Switch between her eyes and the over-the-shoulder camera. */
  setView(v) {
    if (v !== 'first' && v !== 'third') return;
    if (v === this.view) return;
    this.view = v;
    if (v === 'third') {
      this.tp.init = false;
      this.bodyYaw = this.feetYaw;
    }
    for (const cb of this.viewListeners ?? []) cb(v);
  }

  toggleView() {
    this.setView(this.view === 'third' ? 'first' : 'third');
  }

  onView(cb) {
    (this.viewListeners ??= []).push(cb);
  }

  bindInput() {
    const el = this.engine.canvas;
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyV' && this.enabled && !e.repeat && !this.inputLocked) this.toggleView();
      if (e.code === 'KeyF' && this.enabled) {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
        else document.exitFullscreen?.();
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === el || this.dragLook) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      }
    });
    el.addEventListener('mousedown', () => {
      if (this.enabled && document.pointerLockElement !== el) this.dragLook = true;
    });
    addEventListener('mouseup', () => (this.dragLook = false));
    // touch: left half = walk stick, right half = look
    el.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && !this.touch.move) this.touch.move = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY };
        else if (!this.touch.look) this.touch.look = { id: t.identifier, x: t.clientX, y: t.clientY, x0: t.clientX, y0: t.clientY, t0: performance.now() };
      }
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (this.touch.move?.id === t.identifier) {
          this.touch.move.x = t.clientX;
          this.touch.move.y = t.clientY;
        } else if (this.touch.look?.id === t.identifier) {
          this.lookDX += (t.clientX - this.touch.look.x) * 2.2;
          this.lookDY += (t.clientY - this.touch.look.y) * 2.2;
          this.touch.look.x = t.clientX;
          this.touch.look.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (this.touch.move?.id === t.identifier) this.touch.move = null;
        if (this.touch.look?.id === t.identifier) {
          // a double tap on the look side switches the camera
          const L = this.touch.look, now = performance.now();
          if (now - L.t0 < 250 && Math.hypot(t.clientX - L.x0, t.clientY - L.y0) < 14) {
            if (now - this.touch.lastTap < 380 && this.enabled) {
              this.toggleView();
              this.touch.lastTap = 0;
            } else this.touch.lastTap = now;
          }
          this.touch.look = null;
        }
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  readInput() {
    const k = this.keys;
    let f = 0, s = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
    let brisk = k.has('ShiftLeft') || k.has('ShiftRight');
    if (this.touch.move) {
      const dx = (this.touch.move.x - this.touch.move.x0) / 60, dy = (this.touch.move.y - this.touch.move.y0) / 60;
      f -= Math.max(-1, Math.min(1, dy));
      s += Math.max(-1, Math.min(1, dx));
    }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      s += dz(p.axes[0] ?? 0);
      f -= dz(p.axes[1] ?? 0);
      this.lookDX += dz(p.axes[2] ?? 0) * 14;
      this.lookDY += dz(p.axes[3] ?? 0) * 10;
      if (p.buttons[10]?.pressed || p.buttons[4]?.pressed) brisk = true;
      const r3 = !!p.buttons[11]?.pressed;
      if (r3 && !this.padR3) this.toggleView();
      this.padR3 = r3;
    }
    return { f: Math.max(-1, Math.min(1, f)), s: Math.max(-1, Math.min(1, s)), brisk };
  }

  update(dt) {
    this.time += dt;
    const world = this.engine.world;
    // inputLocked: an overlay (the paint menu) has the mouse and keyboard
    const inp = this.enabled && !this.inputLocked ? this.readInput() : { f: 0, s: 0, brisk: false };
    if (this.inputLocked) this.lookDX = this.lookDY = 0;

    // ── look (slightly weighted) ──
    const sens = 0.0019;
    this.yawT -= this.lookDX * sens;
    this.pitchT -= this.lookDY * sens;
    this.lookDX = this.lookDY = 0;
    const third = this.view === 'third';
    this.viewK += ((third ? 1 : 0) - this.viewK) * (1 - Math.exp(-dt / 0.14));
    if (Math.abs((third ? 1 : 0) - this.viewK) < 1e-3) this.viewK = third ? 1 : 0;
    this.pitchT = Math.max(third ? -1.12 : -1.32, Math.min(third ? 0.95 : 1.25, this.pitchT));
    const lk = 1 - Math.exp(-dt / 0.045);
    const prevYaw = this.yaw;
    this.yaw += (this.yawT - this.yaw) * lk;
    this.pitch += (this.pitchT - this.pitch) * lk;
    // lean very slightly into turns (more when walking)
    const yawRate = dt > 0 ? (this.yaw - prevYaw) / dt : 0;
    const leanT = Math.max(-1, Math.min(1, yawRate * 0.35)) * THREE.MathUtils.degToRad(0.7) * (0.35 + 0.65 * Math.min(1, this.speed));
    this.lean = (this.lean ?? 0) + (leanT - (this.lean ?? 0)) * (1 - Math.exp(-dt / 0.25));

    // ── movement ──
    const len = Math.hypot(inp.f, inp.s);
    const fwdSpeed = inp.brisk ? 1.65 : 1.18;
    // third person: she walks wherever you steer and turns to face it, unless
    // she is aiming something (then she faces the view and side-steps)
    this.aimK += ((this.aimZoom && third ? 1 : 0) - this.aimK) * (1 - Math.exp(-dt / 0.22));
    const free = third && !this.aiming;
    let wishX = 0, wishZ = 0;
    if (len > 0.01) {
      const nf = inp.f / Math.max(1, len), ns = inp.s / Math.max(1, len);
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      let spd;
      if (free) {
        // slow while the body is still coming round to the new heading
        const dirYaw = Math.atan2(-(fx * nf + rx * ns), -(fz * nf + rz * ns));
        const off = Math.abs(wrapPi(dirYaw - this.bodyYaw));
        spd = fwdSpeed * Math.min(1, len) * (0.35 + 0.65 * smooth01(2.4, 0.6, off));
      } else {
        // walking backwards / sideways is slower and more careful
        const sp = nf >= 0 ? fwdSpeed : 0.72;
        spd = sp * (Math.abs(ns) > Math.abs(nf) ? 0.72 : 1) * Math.min(1, len);
      }
      wishX = (fx * nf + rx * ns) * spd;
      wishZ = (fz * nf + rz * ns) * spd;
    }
    // which way she faces
    {
      let faceT = this.yaw;
      if (free) {
        faceT = this.bodyYaw;
        const wl = Math.hypot(wishX, wishZ);
        if (wl > 0.05) faceT = Math.atan2(-wishX, -wishZ);
      }
      const d = wrapPi(faceT - this.bodyYaw);
      const rate = !third ? 30 : free ? 3.6 + 3 * Math.min(1, this.speed) : 7;
      this.bodyYaw += Math.max(-rate * dt, Math.min(rate * dt, d * (1 - Math.exp(-dt * (third ? 9 : 30)))));
      this.bodyYaw = wrapPi(this.bodyYaw);
    }
    // crouching: a critically damped spring; she barely moves while down
    {
      const w = 12.5;
      this.crouchV += ((this.crouchTarget - this.crouch) * w * w - 2 * w * this.crouchV) * dt;
      this.crouch = Math.max(-0.05, Math.min(1.05, this.crouch + this.crouchV * dt));
      const k = 1 - 0.85 * Math.max(0, Math.min(1, this.crouch));
      wishX *= k;
      wishZ *= k;
    }
    const accel = Math.hypot(wishX, wishZ) > this.speed ? 0.5 : 0.36;
    const a = 1 - Math.exp(-dt / accel);
    // kept for the step planner: where the body will be when a foot comes down
    this.wishX = wishX;
    this.wishZ = wishZ;
    this.accelTau = accel;
    this.vel.x += (wishX - this.vel.x) * a;
    this.vel.z += (wishZ - this.vel.z) * a;
    const coll = world.collision;
    if (coll) {
      const np = coll.move(this.pos.x, this.pos.z, this.vel.x * dt, this.vel.z * dt, this.radius);
      const mx = (np.x - this.pos.x) / Math.max(dt, 1e-5), mz = (np.z - this.pos.z) / Math.max(dt, 1e-5);
      this.pos.x = np.x;
      this.pos.z = np.z;
      // lose velocity into walls
      this.vel.x = mx;
      this.vel.z = mz;
    } else {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // ── ground ──
    const gy = world.groundHeight ? world.groundHeight(this.pos.x, this.pos.z) : 0;
    this.groundY += (gy - this.groundY) * (1 - Math.exp(-dt / 0.12));

    // ── gait ──
    // small natural irregularity in rhythm
    this.rhythm += (1 + 0.06 * Math.sin(this.time * 0.37) * Math.sin(this.time * 0.11) - this.rhythm) * dt;
    // side-steps are shorter and quicker than forward strides
    const latC = this.speed > 0.05 ? Math.abs(this.vel.x * Math.cos(this.feetYaw) - this.vel.z * Math.sin(this.feetYaw)) / this.speed : 0;
    // in heels: shortish steps, quicker rather than longer as she speeds up
    const stepLen = (0.5 + 0.11 * smooth01(0.6, 1.7, this.speed)) * this.rhythm * (1 - 0.32 * latC);
    const prevPhase = this.phase;
    if (this.speed > 0.07) {
      this.phase += (this.speed * dt) / stepLen;
      this.settling = true;
    } else if (this.settling) {
      // finish the current step so feet come together
      const frac = this.phase - Math.floor(this.phase);
      if (frac > 0.02) this.phase += dt * 1.6;
      else this.settling = false;
    }
    // turning on the spot: shuffle steps
    let yawDiff = this.bodyYaw - this.feetYaw;
    yawDiff = Math.atan2(Math.sin(yawDiff), Math.cos(yawDiff));
    if (this.speed > 0.2) this.feetYaw = this.bodyYaw;
    else if (Math.abs(yawDiff) > 0.7 && !this.settling) {
      this.feetYaw += yawDiff * 0.55;
      this.shuffle = 2;
    }
    // standing with a foot left out wide or ahead (stopped short, bumped a wall): step it back in
    if (this.speed < 0.07 && !this.settling && this.shuffle === 0 && this.gait.L) {
      const rx = Math.cos(this.feetYaw), rz = -Math.sin(this.feetYaw);
      for (const [F, side] of [[this.gait.L, -1], [this.gait.R, 1]]) {
        const d = Math.hypot(F.pos.x - (this.pos.x + rx * side * 0.085), F.pos.z - (this.pos.z + rz * side * 0.085));
        if (d > 0.24) this.shuffle = 2;
      }
    }
    if (this.shuffle > 0 && !this.settling) {
      this.phase += dt * 2.4;
      if (Math.floor(this.phase) > Math.floor(prevPhase)) this.shuffle--;
    }
    if (Math.floor(this.phase) > Math.floor(prevPhase)) this.heelStrike(stepLen);
    this.planFeet(dt);

    // scheduled toe contacts
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.emitStep(p.e);
        this.pending.splice(i, 1);
      }
    }

    // ── camera ──
    const s = this.phase - Math.floor(this.phase);
    const strideP = ((Math.floor(this.phase) % 2) + s) / 2;
    const amp = smooth01(0.04, 1.2, this.speed) + (this.shuffle > 0 ? 0.25 : 0);
    let bobY = -0.017 * amp * Math.cos(TAU * s) - 0.005 * amp * Math.exp(-s * 22);
    const swayX = 0.012 * amp * Math.sin(TAU * strideP);
    const roll = THREE.MathUtils.degToRad(0.32) * amp * Math.sin(TAU * strideP);
    const nod = THREE.MathUtils.degToRad(0.35) * amp * (Math.exp(-s * 18) - 0.12);
    const idle = 1 - smooth01(0.0, 0.4, this.speed);
    bobY += idle * 0.0028 * Math.sin(this.time * 1.55);
    const idleSway = idle * 0.002 * Math.sin(this.time * 0.43);

    const cam = this.camera;
    const pitch = this.pitch + nod;
    // neck pivot: eyes sit forward/above the pivot, so looking down moves them forward
    const cr = this.crouch;
    const neckY = this.groundY + this.eyeHeight - 0.11 + bobY - 0.6 * cr;
    // looking down, the head also tilts forward on the neck, bringing the eyes past the chest
    const down = Math.max(0, -Math.sin(pitch));
    const eyeFwd = 0.085 + 0.11 * down * down + 0.13 * Math.max(0, cr), eyeUp = 0.11;
    const cy = Math.cos(pitch), sy = Math.sin(pitch);
    const ox = 0, oy = eyeUp * cy + eyeFwd * sy, oz = -eyeFwd * cy + eyeUp * sy;
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    const lat = swayX + idleSway;
    cam.position.set(
      this.pos.x + cosY * lat + (ox * cosY + oz * sinY),
      neckY + oy,
      this.pos.z - sinY * lat + (-ox * sinY + oz * cosY),
    );
    cam.rotation.set(pitch, this.yaw, roll + (this.lean ?? 0), 'YXZ');
    if (this.viewK > 0) this.thirdPersonCamera(dt);
    cam.updateMatrixWorld();

    this.gait.phase = this.phase;
    this.gait.speed = this.speed;
    this.gait.stepLen = stepLen;
    this.gait.bodyYaw = this.feetYaw;
    this.gait.bobY = bobY;
  }

  /**
   * Over-the-shoulder camera: orbits a pivot above her shoulders that follows
   * her with a little lag, sits off to her right, pulls in when aiming, and is
   * kept out of walls and props (snapping in at once, easing back out).
   * Blends from the first-person camera by viewK.
   */
  thirdPersonCamera(dt) {
    const cam = this.camera, tp = this.tp;
    const ray = this.engine.spray?.ray;
    const cr = Math.max(0, this.crouch);
    // pivot: critically damped follow, quicker sideways than up and down
    const tx = this.pos.x, ty = this.groundY + TP.height - 0.5 * cr, tz = this.pos.z;
    if (!tp.init) {
      tp.pivot.set(tx, ty, tz);
      tp.pv.set(0, 0, 0);
      tp.dist = TP.dist;
      tp.side = TP.side;
      tp.init = true;
    }
    const n = Math.max(1, Math.ceil(dt * 120));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const wH = 11, wV = 8;
      tp.pv.x += ((tx - tp.pivot.x) * wH * wH - 2 * wH * tp.pv.x) * h;
      tp.pv.z += ((tz - tp.pivot.z) * wH * wH - 2 * wH * tp.pv.z) * h;
      tp.pv.y += ((ty - tp.pivot.y) * wV * wV - 2 * wV * tp.pv.y) * h;
      tp.pivot.addScaledVector(tp.pv, h);
    }
    const ak = this.aimK;
    const brisk = smooth01(1.2, 1.65, this.speed);
    const pitch = this.pitch;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const f = this._f.set(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
    const r = this._r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    // shoulder point, kept out of the wall on her right
    let side = TP.side + (TP.aimSide - TP.side) * ak;
    if (ray) {
      const hit = ray.cast(tp.pivot, r, side + 0.25, tp.hit);
      if (hit) side = Math.max(0, hit.dist - 0.25);
    }
    tp.side += (side - tp.side) * (side < tp.side ? 1 : 1 - Math.exp(-dt * 4));
    const o = this._o.copy(tp.pivot).addScaledVector(r, tp.side);
    o.y += 0.06;
    // back along the view, short of anything in the way and above the ground
    let want = TP.dist + (TP.aimDist - TP.dist) * ak + 0.25 * brisk;
    if (sp > 0.05) want = Math.min(want, Math.max(0.45, (o.y - this.groundY - 0.22) / sp));
    let dist = want;
    if (ray) {
      f.negate();
      const hit = ray.cast(o, f, want + 0.22, tp.hit);
      f.negate();
      if (hit) dist = Math.max(0.3, hit.dist - 0.22);
    }
    tp.dist = dist < tp.dist ? dist : tp.dist + (dist - tp.dist) * (1 - Math.exp(-dt * 3));
    const k = this.viewK * this.viewK * (3 - 2 * this.viewK);
    const x = o.x - f.x * tp.dist, y = o.y - f.y * tp.dist, z = o.z - f.z * tp.dist;
    cam.position.set(cam.position.x + (x - cam.position.x) * k, cam.position.y + (y - cam.position.y) * k, cam.position.z + (z - cam.position.z) * k);
    // level out here: no walking roll or nod
    cam.rotation.set(pitch + (cam.rotation.x - pitch) * (1 - k), this.yaw, cam.rotation.z * (1 - k), 'YXZ');
  }

  /** Distance from the camera to her head (how much further the view centre must reach). */
  get camReach() {
    return this.view === 'third' ? this.tp.dist + 0.3 : 0;
  }

  /** A foot of the step plan read by the walker's animation (ground point under the ankle, world). */
  newFoot() {
    return { pos: new THREE.Vector3(), from: new THREE.Vector3(), yaw: this.feetYaw, swing: 0, style: 1, stride: 0, load: 1, contact: 0 };
  }

  /**
   * Plan where the next foot lands, as it lifts off: under the body's predicted position
   * at contact, led in the direction of travel, kept on its own side of the standing foot
   * (side-steps close in instead of crossing over). The animation (character/animate.js) poses the legs from this.
   */
  planStep(F, O, side, tl, liftoff = true) {
    const g = this.gait;
    if (liftoff) F.from.copy(F.pos);
    const yaw = this.feetYaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const sp = this.speed;
    const mvx = sp > 0.05 ? this.vel.x / sp : 0, mvz = sp > 0.05 ? this.vel.z / sp : 0;
    const fwdC = mvx * fx + mvz * fz, latC = mvx * rx + mvz * rz;
    // body position at contact: velocity easing toward the wish (exponential, time constant tau)
    const tau = this.accelTau ?? 0.5, ek = tau * (1 - Math.exp(-tl / tau));
    const wx = this.wishX ?? this.vel.x, wz = this.wishZ ?? this.vel.z;
    let bx = this.pos.x + wx * tl + (this.vel.x - wx) * ek, bz = this.pos.z + wz * tl + (this.vel.z - wz) * ek;
    // ...but not through a wall she is walking into
    const coll = this.engine.world?.collision;
    if (coll && tl > 0) {
      const np = coll.move(this.pos.x, this.pos.z, bx - this.pos.x, bz - this.pos.z, this.radius);
      bx = np.x;
      bz = np.z;
    }
    const lead = sp > 0.07 ? g.stepLen * 0.5 * (0.45 + 0.55 * Math.abs(fwdC)) : 0;
    const w = 0.055 + 0.05 * Math.abs(latC);
    let tx = bx + mvx * lead + rx * side * w, tz = bz + mvz * lead + rz * side * w;
    const sep = ((tx - O.pos.x) * rx + (tz - O.pos.z) * rz) * side;
    const minSep = 0.1 + 0.035 * Math.abs(latC);
    if (sep < minSep) {
      tx += rx * side * (minSep - sep);
      tz += rz * side * (minSep - sep);
    }
    // a foot travels a whole stride (two steps) per swing; cap it a little beyond that
    const dx = tx - F.from.x, dz = tz - F.from.z, d = Math.hypot(dx, dz);
    const maxD = Math.max(0.8, 2.3 * g.stepLen);
    if (d > maxD) {
      tx = F.from.x + (dx * maxD) / d;
      tz = F.from.z + (dz * maxD) / d;
    }
    const world = this.engine.world;
    F.pos.set(tx, world?.groundHeight ? world.groundHeight(tx, tz) : this.groundY, tz);
    F.yaw = yaw + side * 0.05;
    F.stride = Math.hypot(F.pos.x - F.from.x, F.pos.z - F.from.z);
    F.style = sp > 0.07 ? fwdC : 1;
  }

  planFeet(dt) {
    const g = this.gait;
    const DS = 0.08; // double support after each contact (steps)
    if (!g.L) {
      g.L = this.newFoot();
      g.R = this.newFoot();
      const rx = Math.cos(this.feetYaw), rz = -Math.sin(this.feetYaw);
      for (const [F, side] of [[g.L, -1], [g.R, 1]]) {
        F.pos.set(this.pos.x + rx * side * 0.085, this.groundY, this.pos.z + rz * side * 0.085);
        F.from.copy(F.pos);
        F.contact = Math.floor(this.phase) - 1;
      }
      g.planned = -1;
      g.active = 0;
    }
    const stepping = this.speed > 0.07 || this.settling || this.shuffle > 0;
    const s = this.phase - Math.floor(this.phase);
    const nextIdx = this.stepIndex + 1;
    const next = nextIdx % 2 === 0 ? 'L' : 'R';
    g.next = next;
    const F = g[next], O = g[next === 'L' ? 'R' : 'L'];
    const q = stepping ? Math.min(1, Math.max(0, (s - DS) / (1 - DS))) : 0;
    if (q > 0 && (g.planned !== nextIdx || q < 0.7)) {
      // planned at lift-off, then steered through most of the swing as the body
      // speeds up or slows down, so it still lands where the hips will be
      const tl = ((1 - s) * g.stepLen) / Math.max(this.speed, 0.15);
      this.planStep(F, O, next === 'L' ? -1 : 1, tl, g.planned !== nextIdx);
      g.planned = nextIdx;
    }
    F.swing = q > 0 && g.planned === nextIdx ? Math.max(q, 1e-3) : 0;
    O.swing = 0;
    for (const X of [g.L, g.R]) X.load = Math.min(1, Math.max(0, (this.phase - X.contact) / 0.25));
    g.active += ((stepping ? 1 : 0) - g.active) * (1 - Math.exp(-dt / 0.25));
    g.weight = 0.55 * Math.sin(this.time * 0.23) * Math.sin(this.time * 0.11 + 1.3);
    const sp = this.speed;
    const latC = sp > 0.05 ? (this.vel.x * Math.cos(this.feetYaw) - this.vel.z * Math.sin(this.feetYaw)) / sp : 0;
    g.heading = Math.max(-0.3, Math.min(0.3, latC * 0.3)) * g.active;
  }

  heelStrike(stepLen) {
    this.stepIndex++;
    const foot = this.stepIndex % 2 === 0 ? 'L' : 'R';
    const g = this.gait;
    // the foot lands where it was planned at lift-off (plan it now if it never lifted)
    if (g.L) {
      const F = g[foot], O = g[foot === 'L' ? 'R' : 'L'];
      if (g.planned !== this.stepIndex) {
        this.planStep(F, O, foot === 'L' ? -1 : 1, 0);
        g.planned = this.stepIndex;
      }
      F.swing = 0;
      F.contact = Math.floor(this.phase);
    }
    const side = foot === 'L' ? -1 : 1;
    const fwdX = -Math.sin(this.feetYaw), fwdZ = -Math.cos(this.feetYaw);
    const rx = Math.cos(this.feetYaw), rz = -Math.sin(this.feetYaw);
    // the planted foot lands roughly half a step ahead of the hips
    const ahead = this.speed > 0.07 ? stepLen * 0.45 : 0.05;
    const P = g.L ? g[foot].pos : null;
    const px = P ? P.x : this.pos.x + fwdX * ahead + rx * side * 0.085;
    const pz = P ? P.z : this.pos.z + fwdZ * ahead + rz * side * 0.085;
    const surface = this.engine.world.surfaceAt ? this.engine.world.surfaceAt(px, pz) : 'asphalt';
    const intensity = Math.min(1, 0.35 + this.speed * 0.5) * (this.shuffle > 0 || !this.speed ? 0.55 : 1);
    const position = { x: px, y: this.groundY, z: pz };
    (foot === 'L' ? this.gait.plantL : this.gait.plantR).set(px, this.groundY, pz);
    this.emitStep({ foot, part: 'heel', surface, intensity, position, speed: this.speed });
    const cadence = Math.max(1.2, this.speed / Math.max(0.3, stepLen));
    this.pending.push({ t: 0.085 + 0.06 / cadence + Math.random() * 0.012, e: { foot, part: 'toe', surface, intensity: intensity * 0.7, position, speed: this.speed } });
  }
}
