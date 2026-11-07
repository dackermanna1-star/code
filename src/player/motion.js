import * as THREE from 'three';
import { G } from '../core/constants.js';
import { clamp, smoothstep, noise1, fbm1, rng } from '../core/util.js';
import { Spring } from './springs.js';

// =============================================================================
// AIRCRAFT MOTION FEEL
//
// The cabin is rendered static at the origin, so everything the passenger
// "feels" has to be expressed as small camera offsets in the aircraft frame:
//
//  * head inertia: the head is a damped spring on the body/seat, driven by the
//    felt specific force (derived from the aircraft's world velocity &
//    attitude, so the conventions are unambiguous) and by the angular rate
//    (the head lags rotations a little);
//  * turbulence: coherent fractal noise (vertical heave, roll, a little pitch)
//    plus occasional jolts that kick an under-damped "seat cushion" spring;
//  * high-frequency vibration: engines, rolling on pavement, buffet, reverse;
//  * runway / taxiway slab joints: discrete thumps from the nose gear and,
//    17.7 m later, the main gear (stronger near the respective gear);
//  * one-off events: touchdown (mains, then the nose gear on derotation),
//    liftoff unloading, gear retraction / extension clunks.
//
// Everything is scaled by settings.cameraShake (0 = reduced motion: no camera
// motion at all). Outputs (aircraft frame): `pos` (metres) and `rot`
// (radians: x pitch, y yaw, z roll), plus `floorTilt` (the effective uphill
// direction of the floor in g, for the walker) and `push` (m/s target for the
// passive stumble of a standing passenger).
// =============================================================================

const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _aw = new THREE.Vector3();

export class MotionFeel {
  constructor(app) {
    this.app = app;
    this.pos = new THREE.Vector3();
    this.rot = new THREE.Vector3();
    this.floorTilt = new THREE.Vector3();
    this.push = new THREE.Vector3();
    this.turbulence = 0;

    // head inertia (aircraft frame) – soft, slightly under-damped
    this.hx = new Spring(9, 0.55); this.hy = new Spring(10, 0.5); this.hz = new Spring(8.5, 0.6);
    this.rp = new Spring(8, 0.62); this.ry = new Spring(7, 0.7); this.rr = new Spring(7.5, 0.6);
    // seat cushion / body (touchdown, jolts, gear thunks) – bouncy
    this.seatY = new Spring(12.5, 0.3); this.seatP = new Spring(11, 0.34); this.seatR = new Spring(9.5, 0.38);
    // airframe bumps (slab joints, clunks) – stiff, quick
    this.bumpY = new Spring(30, 0.27); this.bumpP = new Spring(26, 0.3);

    this.f = new THREE.Vector3(0, 1, 0);        // felt specific force, local, g (lightly filtered)
    this.fSlow = new THREE.Vector3(0, 1, 0);    // ~1.4 s low-pass (steady attitude / sustained accel)
    this.omega = new THREE.Vector3();           // local angular velocity (rad/s), filtered
    this._prevVel = new THREE.Vector3();
    this._prevQ = new THREE.Quaternion();
    this._have = false;
    this._accelSeen = false;
    this._wv = new THREE.Vector3();

    this.t = 0;
    this.rand = rng(73129);
    this.nextJolt = 0;
    this.rollDist = 0;
    this.rattle = 0;            // temporary vibration boost (decays)
    this.reverseOn = false;
    this.awaitNose = null;      // {t, intensity} after a main-gear touchdown
    this.scheduled = [];        // [{t, fn}] one-off delayed effects
    this.eyeZ = 0;

    const ev = app.events;
    ev.on('flight:touchdown', (p) => this.onTouchdown(p || {}));
    ev.on('flight:liftoff', () => { const k = this.shake(); this.seatY.kick(0.035 * k); this.bumpY.kick(0.02 * k); });
    ev.on('flight:gear', (p) => this.onGear(!!(p && p.down)));
    ev.on('flight:reverse', (p) => { this.reverseOn = !!(p && p.on); if (this.reverseOn) this.rattle = Math.max(this.rattle, 0.6); });
    ev.on('flight:spoilers', (p) => { if (p && p.deployed) this.rattle = Math.max(this.rattle, 0.35); });
    ev.on('flight:restart', () => this.reset());
    ev.on('flight:skip', () => this.reset());
    ev.on('flight:phase', () => { this._have = false; });
  }

  shake() {
    const s = Number(this.app.settings.get('cameraShake'));
    return Number.isFinite(s) ? clamp(s, 0, 1.5) : 1;
  }

  reset() {
    this._have = false;
    for (const s of [this.hx, this.hy, this.hz, this.rp, this.ry, this.rr, this.seatY, this.seatP, this.seatR, this.bumpY, this.bumpP]) s.reset();
    this.f.set(0, 1, 0); this.fSlow.set(0, 1, 0); this.omega.set(0, 0, 0);
    this.scheduled.length = 0; this.awaitNose = null; this.rattle = 0;
    this.pos.set(0, 0, 0); this.rot.set(0, 0, 0); this.push.set(0, 0, 0);
  }

  schedule(delay, fn) { this.scheduled.push({ t: this.t + delay, fn }); }

  onTouchdown({ intensity, verticalSpeed }) {
    let I = Number(intensity);
    if (!Number.isFinite(I)) I = clamp(Math.abs(Number(verticalSpeed) || 1.0) / 3, 0, 1);
    I = clamp(I, 0, 1);
    const k = this.shake();
    this.seatY.kick(-(0.12 + 0.42 * I) * k);
    this.bumpY.kick(-(0.08 + 0.22 * I) * k);
    this.seatP.kick(-(0.015 + 0.05 * I) * k);
    this.seatR.kick((this.rand() - 0.5) * 0.04 * I * k);
    this.rattle = Math.max(this.rattle, 0.5 + 0.5 * I);
    this.awaitNose = { t: this.t, intensity: I };
  }

  onGear(down) {
    if (!down) {
      // retraction: uplock release clunk, then wheels braked + gear in the wells & doors closing
      this.schedule(0.5, () => { const k = this.shake(); this.bumpY.kick(-0.035 * k); this.rattle = Math.max(this.rattle, 0.25); });
      this.schedule(6.2, () => { const k = this.shake(); this.seatY.kick(-0.06 * k); this.bumpY.kick(-0.07 * k); this.seatP.kick(0.012 * k); this.rattle = Math.max(this.rattle, 0.35); });
    } else {
      // extension: free-fall thud, then the downlock + gear doors, then the air-flow rumble (director buffet)
      this.schedule(0.35, () => { const k = this.shake(); this.seatY.kick(-0.07 * k); this.bumpY.kick(-0.05 * k); this.rattle = Math.max(this.rattle, 0.45); });
      this.schedule(4.0, () => { const k = this.shake(); this.bumpY.kick(-0.06 * k); this.rattle = Math.max(this.rattle, 0.25); });
    }
  }

  /**
   * @param {number} dt simulation dt (0 while paused: offsets freeze)
   * @param {{posture: 'seated'|'standing'|'transition', eyeZ: number}} ctx
   */
  update(dt, ctx) {
    if (!(dt > 0)) return;
    const app = this.app;
    const st = app.flight && app.flight.state;
    if (!st) return;
    this.t += dt;
    const t = this.t;
    const shake = this.shake();
    const standing = ctx.posture !== 'seated';
    this.eyeZ = ctx.eyeZ || 0;

    // ---- 1. felt specific force (aircraft-local, g) -------------------------------
    const q = st.quaternion;
    if (!this._have) { this._prevVel.copy(st.velocity); this._prevQ.copy(q); this._have = true; }
    const acc = st.acceleration;
    if (acc && acc.lengthSq() > 1e-8) this._accelSeen = true;
    if (this._accelSeen && acc) _aw.copy(acc);
    else {
      _aw.subVectors(st.velocity, this._prevVel).divideScalar(dt);
      if (_aw.lengthSq() > 25 * 25) _aw.set(0, 0, 0); // discontinuity (skip / teleport)
    }
    this._prevVel.copy(st.velocity);
    if (_aw.lengthSq() > 12 * 12) _aw.setLength(12);
    _v.copy(_aw).divideScalar(G); _v.y += 1;
    _qi.copy(q).invert();
    _v.applyQuaternion(_qi);
    _v.x = clamp(_v.x, -1.2, 1.2); _v.y = clamp(_v.y, -0.5, 2.8); _v.z = clamp(_v.z, -1.2, 1.2);
    this.f.lerp(_v, 1 - Math.exp(-22 * dt));
    this.fSlow.lerp(this.f, 1 - Math.exp(-0.7 * dt));

    // ---- 2. angular velocity from successive attitudes (local axes) ----------------
    _q.copy(this._prevQ).invert().multiply(q);
    if (_q.w < 0) { _q.x = -_q.x; _q.y = -_q.y; _q.z = -_q.z; _q.w = -_q.w; }
    const ang = 2 * Math.acos(Math.min(1, _q.w));
    const sn = Math.sqrt(Math.max(0, 1 - _q.w * _q.w));
    if (sn > 1e-7 && ang < 0.4) this._wv.set(_q.x / sn, _q.y / sn, _q.z / sn).multiplyScalar(ang / dt);
    else this._wv.set(0, 0, 0);
    if (this._wv.lengthSq() > 1) this._wv.setLength(1);
    this.omega.lerp(this._wv, 1 - Math.exp(-10 * dt));
    this._prevQ.copy(q);

    // floor tilt (effective "uphill" vector, g) and the passive stumble push
    const fy = Math.max(0.3, this.fSlow.y);
    this.floorTilt.set(this.fSlow.x / fy, 0, this.fSlow.z / fy);
    let hpX = this.f.x - this.fSlow.x, hpZ = this.f.z - this.fSlow.z;
    const hpL = Math.hypot(hpX, hpZ), dead = 0.025;
    if (hpL < dead) { hpX = 0; hpZ = 0; } else { const s = (hpL - dead) / hpL; hpX *= s; hpZ *= s; }

    // ---- 3. head inertia targets ------------------------------------------------------
    const dx = this.f.x, dy = this.f.y - 1, dz = this.f.z, w = this.omega;
    let tx = -dx * (standing ? 0.07 : 0.04);
    let ty = -dy * (standing ? 0.032 : 0.025);
    let tz = -dz * (dz < 0 ? (standing ? 0.06 : 0.03) : (standing ? 0.085 : 0.065)); // headrest limits the backward travel
    let tp = -dz * 0.03 - w.x * 0.1;
    let tyw = -w.y * 0.08;
    let tr = dx * (standing ? 0.05 : 0.03) - w.z * 0.1;

    // ---- 4. turbulence: coherent heave/roll + random jolts ------------------------------
    const T = clamp(Number(st.turbulence) || 0, 0, 1);
    this.turbulence = T;
    let pushTX = 0, pushTZ = 0;
    if (T > 0.002) {
      ty += T * (0.011 * fbm1(t * 1.15 + 3.1, 3) + 0.0045 * fbm1(t * 2.9 + 9.7, 2));
      tx += T * 0.004 * fbm1(t * 0.75 + 21.3, 3) * (standing ? 2.2 : 1);
      tr += T * 0.009 * fbm1(t * 0.55 + 41.9, 3) * (standing ? 1.6 : 1);
      tp += T * 0.004 * fbm1(t * 0.95 + 61.7, 3);
      tyw += T * 0.0025 * fbm1(t * 0.45 + 81.3, 2);
      if (standing) { pushTX += T * 0.32 * fbm1(t * 0.32 + 5.5, 3); pushTZ += T * 0.12 * fbm1(t * 0.27 + 15.5, 2); }
      if (this.nextJolt === 0) this.nextJolt = t + 2 + this.rand() * 4;
      if (t >= this.nextJolt) {
        if (T > 0.1) this.jolt(T * shake, standing);
        const rate = 0.05 + 0.6 * T * T;
        this.nextJolt = t - Math.log(1 - this.rand() * 0.999) / rate;
      }
    } else this.nextJolt = 0;

    this.push.set(clamp(-hpX * 1.8 + pushTX, -0.7, 0.7), 0, clamp(-hpZ * 1.8 + pushTZ, -0.7, 0.7)).multiplyScalar(standing ? shake : 0);

    // ---- 5. integrate springs -------------------------------------------------------
    this.hx.step(tx * shake, dt); this.hy.step(ty * shake, dt); this.hz.step(tz * shake, dt);
    this.rp.step(tp * shake, dt); this.ry.step(tyw * shake, dt); this.rr.step(tr * shake, dt);
    this.seatY.step(0, dt); this.seatP.step(0, dt); this.seatR.step(0, dt);
    this.bumpY.step(0, dt); this.bumpP.step(0, dt);

    // ---- 6. scheduled one-offs, nose gear after touchdown -----------------------------
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      const s = this.scheduled[i];
      if (t >= s.t) { this.scheduled.splice(i, 1); try { s.fn(); } catch (e) { console.warn('[player] motion event failed', e); } }
    }
    if (this.awaitNose) {
      const el = t - this.awaitNose.t;
      if (el > 1.0 && (Math.abs(st.pitch || 0) < 0.022 || el > 4.5)) {
        const I = this.awaitNose.intensity;
        this.bumpY.kick(-(0.06 + 0.08 * I) * shake);
        this.seatP.kick(-(0.03 + 0.03 * I) * shake);
        this.seatY.kick(-0.05 * shake);
        this.rattle = Math.max(this.rattle, 0.3);
        this.awaitNose = null;
      }
    }

    // ---- 7. slab-joint thumps when rolling ------------------------------------------
    const gs = Math.max(0, Number(st.groundSpeed) || 0);
    let rumble = clamp(Number(st.runwayRumble) || 0, 0, 1);
    if (app.flight.stub && st.onGround) rumble = Math.max(rumble, 0.8 * smoothstep(1, 40, gs));
    if (st.onGround && gs > 0.3) {
      const prev = this.rollDist;
      this.rollDist += gs * dt;
      const L = 6.1, gearGap = 17.7;
      const amp = shake * (0.3 + 0.7 * rumble) * 0.085 * smoothstep(0.5, 6, gs) / (1 + gs / 28);
      const z = this.eyeZ;
      const noseF = 0.35 + 0.65 * clamp((2.1 - z) / 17.7, 0, 1);
      const mainF = 0.55 + 0.45 * clamp(1 - Math.abs(z - 2.1) / 15, 0, 1);
      if (Math.floor(this.rollDist / L) !== Math.floor(prev / L)) {
        this.bumpY.kick(-amp * noseF * (0.8 + 0.4 * this.rand()));
        this.bumpP.kick(amp * 1.1 * noseF);
      }
      if (Math.floor((this.rollDist - gearGap) / L) !== Math.floor((prev - gearGap) / L)) {
        this.bumpY.kick(-amp * mainF * (0.8 + 0.4 * this.rand()));
        this.bumpP.kick(-amp * 0.5 * mainF);
      }
    }

    // ---- 8. compose + high-frequency vibration ----------------------------------------
    this.rattle = Math.max(0, this.rattle - dt * 0.8);
    const vib = clamp(Number(st.vibration) || 0, 0, 1), buf = clamp(Number(st.buffet) || 0, 0, 1);
    const rev = clamp(Number(st.reverser) || 0, 0, 1);
    const spN = 0.3 + 0.7 * smoothstep(2, 75, gs);
    const hfRot = shake * (0.0007 * vib + 0.0030 * rumble * spN + 0.0018 * buf + 0.0012 * rev + 0.0016 * this.rattle);
    const hfPos = shake * (0.00025 * vib + 0.0013 * rumble * spN + 0.0008 * buf + 0.0005 * rev + 0.0008 * this.rattle);

    const p = this.pos, r = this.rot;
    p.set(this.hx.x, this.hy.x + this.seatY.x * 0.6 + this.bumpY.x * 0.45, this.hz.x);
    r.set(this.rp.x + this.seatP.x + this.bumpP.x * 0.35, this.ry.x, this.rr.x + this.seatR.x);
    if (hfPos > 1e-6) {
      p.y += hfPos * (0.6 * noise1(t * 21.0) + 0.4 * noise1(t * 13.3 + 5.1));
      p.x += hfPos * 0.5 * noise1(t * 17.1 + 11.7);
      r.x += hfRot * 0.55 * noise1(t * 19.3 + 17.9);
      r.z += hfRot * 0.7 * noise1(t * 15.7 + 23.3);
      r.y += hfRot * 0.25 * noise1(t * 11.9 + 29.1);
    }
    // physical limits (comfort): a few centimetres / ~2.5 degrees
    p.x = clamp(p.x, -0.06, 0.06); p.y = clamp(p.y, -0.07, 0.05); p.z = clamp(p.z, -0.07, 0.05);
    r.x = clamp(r.x, -0.045, 0.045); r.y = clamp(r.y, -0.03, 0.03); r.z = clamp(r.z, -0.045, 0.045);
  }

  jolt(s, standing) {
    const r = this.rand;
    const down = r() < 0.68 ? -1 : 1;
    this.seatY.kick(down * (0.09 + 0.16 * r()) * s);
    this.seatR.kick((r() - 0.5) * 0.14 * s);
    this.seatP.kick((r() - 0.5) * 0.05 * s);
    this.bumpY.kick(down * 0.04 * s);
    if (standing) this.hx.kick((r() - 0.5) * 0.25 * s);
    this.rattle = Math.max(this.rattle, 0.25 * s);
  }
}
