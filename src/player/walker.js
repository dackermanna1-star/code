import * as THREE from 'three';
import { SEAT, ZONES } from '../core/constants.js';
import { clamp, damp } from '../core/util.js';
import { zoneAt, surfaceAt } from './zones.js';

// =============================================================================
// WALKER: the standing / walking passenger body.
//  * velocity-based movement with eased acceleration/deceleration
//    (walk 1.25 m/s, Shift 1.8 m/s, crouched 0.62 m/s),
//  * aircraft attitude/acceleration: walking uphill (towards the nose in a
//    climb) is slower, downhill faster; turbulence slows you down; sudden
//    accelerations make a standing passenger stumble (passive push),
//  * vertical cylinder (r 0.2 m) resolved against app.colliders on 4 cm
//    sub-steps, plus a safety clamp to the pressure hull,
//  * crouch (eye 1.15 m), stooping under bins/sidewall (headroom probe),
//  * head bob + footsteps with natural cadence.
// =============================================================================

const HULL_X = 1.6;          // inner lining at floor level (≈ innerHalfWidthAt(0) - lining)
const STEP = 0.04;           // collision sub-step (m)

export class Walker {
  constructor(app, headroom) {
    this.app = app;
    this.headroom = headroom;
    this.feet = new THREE.Vector3(0, 0, -13.6);
    this.vel = new THREE.Vector3();
    this.pushVel = new THREE.Vector3();
    this.crouch = false;
    this.standHeight = SEAT.standingEyeHeight;
    this.eyeHeight = SEAT.standingEyeHeight;
    this.radius = 0.2;
    this.resolveEnabled = true;       // false right after a debug pose until the player moves
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.bob = new THREE.Vector3();   // x = lateral (view right), y = vertical
    this.bobPitch = 0;
    this.bobRoll = 0;
    this.nod = 0;                     // start/stop head pitch (inertia of the walk itself)
    this.speed = 0;
    this._lastFwdSpeed = 0;
    this._footRand = 0.5;
  }

  /** Place the body (feet) instantly. */
  place(x, z) {
    this.feet.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.pushVel.set(0, 0, 0);
    this.bobAmp = 0;
  }

  clampHull(p, r) {
    const lim = HULL_X - r;
    if (p.x < -lim) p.x = -lim; else if (p.x > lim) p.x = lim;
    const zMin = ZONES.flightDeckDoorZ + r, zMax = ZONES.aftBulkheadZ - r;
    if (p.z < zMin) p.z = zMin; else if (p.z > zMax) p.z = zMax;
  }

  /**
   * @param {number} dt
   * @param {number} yaw  view yaw (rad)
   * @param {{forward:number, strafe:number, sprint:boolean}} ctl  input (-1..1)
   * @param {import('./motion.js').MotionFeel} feel
   * @param {number} time
   */
  update(dt, yaw, ctl, feel, time) {
    if (!(dt > 0)) return;
    const app = this.app;
    // ---- wish direction in the cabin frame ----------------------------------------
    let fx = ctl.strafe, fz = -ctl.forward;
    const len = Math.hypot(fx, fz);
    let wx = 0, wz = 0;
    if (len > 1e-6) {
      fx /= len; fz /= len;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      wx = fx * c + fz * s;
      wz = -fx * s + fz * c;
      if (!this.resolveEnabled) this.resolveEnabled = true;
    }
    let speed = this.crouch ? 0.62 : (ctl.sprint ? 1.8 : 1.25);
    // walking uphill / downhill on a pitched floor (or against a sustained acceleration)
    const uphill = wx * feel.floorTilt.x + wz * feel.floorTilt.z;
    speed *= clamp(1 - 1.15 * uphill, 0.5, 1.25);
    // bracing yourself in turbulence
    speed *= 1 - 0.5 * clamp(feel.turbulence * 1.2, 0, 1);
    const tx = wx * speed, tz = wz * speed;
    const accel = len > 1e-6 ? 7.5 : 9.5;
    const k = 1 - Math.exp(-accel * dt);
    const pvx = this.vel.x, pvz = this.vel.z;
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;
    // passive push from sudden accelerations / turbulence (only while standing)
    this.pushVel.x = damp(this.pushVel.x, feel.push.x, 4, dt);
    this.pushVel.z = damp(this.pushVel.z, feel.push.z, 4, dt);

    // ---- move with collision sub-steps --------------------------------------------
    const dx = (this.vel.x + this.pushVel.x) * dt, dz = (this.vel.z + this.pushVel.z) * dt;
    const moveLen = Math.hypot(dx, dz);
    const r = this.crouch ? 0.18 : this.radius;
    const h = this.crouch ? 1.25 : 1.7;
    const p = this.feet;
    const sx = p.x, sz = p.z;
    const cols = app.colliders;
    if (moveLen > 1e-7) {
      const n = Math.min(12, Math.max(1, Math.ceil(moveLen / STEP)));
      for (let i = 0; i < n; i++) {
        p.x += dx / n; p.z += dz / n;
        if (this.resolveEnabled && cols) cols.resolve(p, r, h);
        this.clampHull(p, r);
      }
      // kill velocity into walls (all colliders are axis aligned)
      const ax = p.x - sx, az = p.z - sz;
      if (Math.abs(dx) > 1e-6 && Math.abs(ax) < Math.abs(dx) * 0.98) {
        const f = clamp(ax / dx, 0, 1); this.vel.x *= f; this.pushVel.x *= f;
      }
      if (Math.abs(dz) > 1e-6 && Math.abs(az) < Math.abs(dz) * 0.98) {
        const f = clamp(az / dz, 0, 1); this.vel.z *= f; this.pushVel.z *= f;
      }
    } else if (this.resolveEnabled && cols) {
      cols.resolve(p, r, h);    // doors closing on us etc.
      this.clampHull(p, r);
    }
    p.y = 0;

    // ---- eye height: stand / crouch / stoop -----------------------------------------
    let target = this.crouch ? 1.15 : this.standHeight;
    const lim = this.headroom ? this.headroom.maxEye(p.x, p.z, time) : 9;
    target = Math.max(0.95, Math.min(target, lim));
    this.eyeHeight = damp(this.eyeHeight, target, target < this.eyeHeight ? 9 : 5, dt);

    // ---- head bob & footsteps ----------------------------------------------------------
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.speed = sp;
    const stepLen = this.crouch ? 0.48 : (sp > 1.45 ? 0.78 : 0.68);
    const prev = this.bobPhase;
    this.bobPhase += (sp / stepLen) * Math.PI * dt;
    this.bobAmp = damp(this.bobAmp, clamp(sp / 1.25, 0, 1.35), 6, dt);
    if (sp > 0.22 && Math.floor(this.bobPhase / Math.PI) !== Math.floor(prev / Math.PI)) this.footstep(sp);
    const bobOn = app.settings.get('headBob') !== false;
    const a = bobOn ? this.bobAmp * (this.crouch ? 0.6 : 1) : 0;
    const ph = this.bobPhase;
    this.bob.set(a * 0.0085 * Math.sin(ph), a * 0.0068 * -Math.cos(2 * ph), 0);
    this.bobRoll = a * 0.0032 * Math.sin(ph);
    this.bobPitch = a * 0.0022 * Math.cos(2 * ph + 0.6);
    // forward acceleration of the walk itself nods the head (stop = slight dip forward)
    const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw);
    const fwdSpeed = this.vel.x * fwdX + this.vel.z * fwdZ;
    const aFwd = (fwdSpeed - this._lastFwdSpeed) / dt;
    this._lastFwdSpeed = fwdSpeed;
    this.nod = damp(this.nod, bobOn ? clamp(aFwd * 0.0016, -0.012, 0.012) : 0, 10, dt);
  }

  footstep(sp) {
    const app = this.app;
    this._footRand = (this._footRand * 9301 + 49297) % 233280 / 233280;
    const zone = zoneAt(this.feet.x, this.feet.z);
    try {
      app.audio?.play?.('footstep', {
        position: new THREE.Vector3(this.feet.x, 0.02, this.feet.z),
        volume: (this.crouch ? 0.22 : 0.32) + 0.45 * clamp(sp / 1.8, 0, 1),
        rate: 0.92 + 0.16 * this._footRand,
        surface: surfaceAt(zone),
      });
    } catch { /* audio is optional */ }
  }
}
