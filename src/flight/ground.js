// =============================================================================
// GROUND MOVER — drives the aircraft origin exactly along a layout.js path
// (buildPath samples, same fillet radii as the pavement) with:
//  * a curvature-limited speed profile (lateral accel limit) planned with a
//    backward pass, jerk-limited acceleration and a soft "stop on the mark" law,
//  * strut dynamics: nose-down under braking / nose-up under thrust, body roll
//    to the outside of turns, main-gear oleo heave (touchdown absorption, the
//    struts extending as the wings take the weight on the takeoff roll),
//  * rotation about the main-gear contact point (takeoff rotation / landing
//    derotation), nosewheel steering angle and wheel rpm.
// Paths are airport-local; the mover adds the airport origin.
// =============================================================================
import { AIRCRAFT, DEG, G } from '../core/constants.js';
import { clamp, clamp01, approach, damp, spring, pathPoint, chordHeading, pathKappa, wrap360 } from './fmath.js';

export const GEAR_Z = AIRCRAFT.gear.mainZ;                       // main gear 2.1 m aft of the origin
export const WHEELBASE = AIRCRAFT.gear.mainZ - AIRCRAFT.gear.noseZ; // 17.7 m
export const H0 = AIRCRAFT.groundHeight;                           // 2.62 m
export const STRUT_EXT = 0.18;                                      // oleo extension with the weight off the wheels
export const WHEEL_RADIUS = 0.565;                                  // H44.5x16.5-21 main tyre

/** Height of the aircraft origin above the main-gear contact patch for body pitch θ and strut extension e. */
export const originAboveContact = (theta, e) => (H0 + e) * Math.cos(theta) + GEAR_Z * Math.sin(theta);
/** Forward shift (m, negative = aft) of the origin, relative to its level position, when pitched up about the main gear. */
export const originForwardShift = (theta, e) => GEAR_Z * Math.cos(theta) - (H0 + e) * Math.sin(theta) - GEAR_Z;

export class GroundMover {
  constructor() {
    this.path = null;
    this.ox = 0; this.oz = 0;                 // airport origin (world)
    this.s = 0; this.v = 0; this.a = 0;       // along-path distance, speed, acceleration (travel direction)
    this.stopped = true;
    this.vlim = null; this.profStep = 2;
    // outputs (world)
    this.x = 0; this.z = 0; this.heading = 0; this.travelHeading = 0;
    this.kappa = 0; this.aLat = 0;            // signed curvature (travel, + right) and body lateral accel (+ right)
    this.aFwd = 0;                            // acceleration along the nose direction
    // dynamics
    this.pitchS = { x: 0, v: 0, a: 0 };       // strut pitch (rad, + nose up)
    this.rollS = { x: 0, v: 0, a: 0 };        // body roll on the gear (rad, + right wing down)
    this.heave = { x: 0, v: 0, a: 0 };        // main-gear strut extension (m)
    this.theta = 0; this.thetaV = 0;          // rotation about the main gear (rad)
    this.steer = 0;                           // nosewheel angle (rad, + right)
    this.liftFrac = 0;
    this.joint = 0;                           // index of the last pavement joint crossed
    this.bumpCount = 0;
    this._p = { x: 0, z: 0, heading: 0, i: 0 };
  }

  /** Put the mover on a prepared path. origin = {x, z} of the airport (world). */
  setPath(path, origin, s = 0) {
    this.path = path;
    this.ox = origin.x; this.oz = origin.z;
    this.s = clamp(s, 0, path.length);
    this.vlim = null;
    this.joint = Math.floor(this.s / 7.5);
    this._pose();
  }

  /**
   * Plan the speed limit along the path: min(vmax(s), sqrt(alat / |κ|)) with a backward pass for
   * the planning deceleration. vmax may be a number or a function of s.
   */
  buildProfile({ vmax = 10, alat = 0.1 * G, decel = 0.6, endSpeed = 0 } = {}) {
    const L = this.path.length, step = this.profStep;
    const n = Math.max(2, Math.ceil(L / step) + 1);
    const v = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = Math.min(L, i * step);
      const k = Math.abs(pathKappa(this.path, s));
      const vm = typeof vmax === 'function' ? vmax(s) : vmax;
      v[i] = Math.min(vm, k > 1e-5 ? Math.sqrt(alat / k) : vm);
    }
    v[n - 1] = Math.min(v[n - 1], endSpeed);
    for (let i = n - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * decel * step));
    this.vlim = v;
  }
  profileAt(s) {
    if (!this.vlim) return Infinity;
    const f = clamp(s, 0, this.path.length) / this.profStep;
    const i = Math.min(this.vlim.length - 2, Math.floor(f));
    const t = clamp01(f - i);
    return this.vlim[i] + (this.vlim[i + 1] - this.vlim[i]) * t;
  }
  get remaining() { return this.path ? this.path.length - this.s : 0; }

  /**
   * Advance one step. c = { hold, cap, capFn(dEnd), stopAtEnd, stopDecel, amax, bmax, jerk, gain,
   *   aExternal (number: forced acceleration), aMinBrake (number: at least this deceleration),
   *   liftFrac (0..1 weight carried by the wing), joints (pavement joint spacing m), bump (m/s kick) }
   */
  step(dt, c) {
    const L = this.path.length;
    let aCmd;
    if (c.hold) {
      aCmd = this.v > 0.02 ? -(c.bmax ?? 1.2) : 0;
      if (this.v <= 0.02) { this.v = 0; this.a = 0; }
    } else if (c.aExternal != null) {
      aCmd = c.aExternal;
    } else {
      const look = this.s + Math.max(2, this.v * 1.2);
      let vt = Math.min(c.cap ?? Infinity, this.profileAt(this.s), this.profileAt(look));
      const dEnd = L - this.s;
      if (c.stopAtEnd) { const b = c.stopDecel ?? 0.45; vt = Math.min(vt, Math.sqrt(2 * b * dEnd + 0.1225) - 0.35); }
      if (c.capFn) vt = Math.min(vt, c.capFn(dEnd));
      aCmd = clamp((vt - this.v) * (c.gain ?? 1.0), -(c.bmax ?? 1.0), c.amax ?? 0.5);
      if (c.aMinBrake != null) aCmd = Math.min(aCmd, -c.aMinBrake);
    }
    if (c.aExternal != null) this.a = aCmd;
    else this.a = approach(this.a, aCmd, (c.jerk ?? 0.4) * dt);
    this.v += this.a * dt;
    if (this.v <= 0) { this.v = 0; if (this.a < 0) this.a = 0; }
    this.s += this.v * dt;
    if (this.s >= L) {
      this.s = L;
      if (c.stopAtEnd || c.aExternal == null) { this.v = 0; this.a = 0; }
    }
    if (c.stopAtEnd && L - this.s < 0.03 && this.v < 0.08) { this.v = 0; this.a = 0; this.s = L; }
    this.stopped = this.v < 0.01;
    this._pose();

    // ---- nosewheel steering (from curvature; the tug steers it during pushback)
    const sgn = this.path.reverse ? -1 : 1;
    if (this.v > 0.02) this.steer = damp(this.steer, Math.atan(WHEELBASE * this.kappa) * sgn, 5, dt);

    // ---- strut / body dynamics
    this.aFwd = this.a * sgn;
    this.aLat = this.v * this.v * this.kappa * sgn;
    this.liftFrac = clamp01(c.liftFrac ?? 0);
    const noseOn = this.theta < 0.004;
    const pitchT = noseOn ? clamp(0.0055 * this.aFwd, -0.022, 0.012) : 0;
    spring(this.pitchS, pitchT, dt, 5.2, 0.32);
    spring(this.rollS, clamp(-0.0065 * this.aLat, -0.02, 0.02), dt, 4.4, 0.3);
    let kick = 0;
    if (c.joints && this.v > 0.5) {
      const j = Math.floor(this.s / c.joints);
      if (j !== this.joint) {
        this.joint = j;
        kick = -(c.bump ?? 0.0025) * Math.min(1, this.v / 12) * (0.6 + 0.4 * Math.sin(j * 12.9898));
        this.bumpCount++;
        if (noseOn) this.pitchS.v += kick * 0.35;
      }
    }
    spring(this.heave, STRUT_EXT * this.liftFrac, dt, 2.4, 0.62);
    this.heave.v += kick;
  }

  _pose() {
    const p = pathPoint(this.path, this.s, this._p);
    this.heading = chordHeading(this.path, this.s, 3);
    this.travelHeading = this.path.reverse ? wrap360(this.heading + 180) : this.heading;
    this.kappa = pathKappa(this.path, this.s);
    const shift = originForwardShift(this.theta, this.heave.x);
    const h = this.heading * DEG;
    this.x = this.ox + p.x + Math.sin(h) * shift;
    this.z = this.oz + p.z - Math.cos(h) * shift;
  }

  /** Origin height above the ground and its vertical velocity. */
  height() { return originAboveContact(this.theta, this.heave.x); }
  heightRate() {
    const e = this.heave.x, th = this.theta;
    return this.heave.v * Math.cos(th) + (-(H0 + e) * Math.sin(th) + GEAR_Z * Math.cos(th)) * this.thetaV;
  }
  wheelRpm() { return this.v / (2 * Math.PI * WHEEL_RADIUS) * 60; }
}
