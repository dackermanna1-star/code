// =============================================================================
// AIR MOVER — point-mass flight integrator with "autopilot" style guidance.
// State: position (world), true airspeed V, air-mass flight-path angle γ,
// heading ψ (compass radians), bank φ. Turns are coordinated (ψ' = g tanφ / V,
// zero sideslip), bank is rate/acceleration limited (smooth roll in/out),
// γ' is load-factor limited (passenger comfort), speed changes are jerk limited.
// Wind is added to get the ground velocity (crosswind blended in after liftoff).
// Guidance: track hold (bank ∝ track error), L1 nonlinear path following for
// routes, vertical speed / altitude / path targets converted to γ commands.
// =============================================================================
import { DEG, G } from '../core/constants.js';
import { clamp, approach, follow, wrap180, wrapPi, pathPoint, projectOnPath } from './fmath.js';

export class AirMover {
  constructor() {
    this.x = 0; this.y = 0; this.z = 0;
    this.V = 100; this.Vdot = 0;            // TAS m/s, m/s²
    this.gam = 0; this.gamRate = 0;          // rad, rad/s
    this.psi = Math.PI / 2;                  // heading (rad, compass)
    this.bank = { x: 0, v: 0, a: 0 };        // rad (+ right wing down)
    this.windK = 1;                          // 0 = crosswind not yet applied (just lifted off)
    this.wx = 0; this.wz = 0;                // wind (world, m/s, direction the air moves)
    this.vx = 0; this.vy = 0; this.vz = 0;   // ground velocity
    this.gs = 0; this.track = 90;            // ground speed (m/s), ground track (deg)
    this.decrab = 0;                         // extra body yaw (rad) used in the flare (sideslip)
    this.decrabV = 0;
    this._p = { x: 0, z: 0, heading: 0, i: 0 };
    this._l1 = { bank: 0, s: 0 };
  }

  /** Recompute the ground velocity from V, γ, ψ and the wind. */
  groundVelocity() {
    const ch = Math.cos(this.gam) * this.V;
    const dx = Math.sin(this.psi), dz = -Math.cos(this.psi);
    const wAlong = this.wx * dx + this.wz * dz;
    const k = this.windK;
    this.vx = ch * dx + wAlong * dx + k * (this.wx - wAlong * dx);
    this.vz = ch * dz + wAlong * dz + k * (this.wz - wAlong * dz);
    this.vy = this.V * Math.sin(this.gam);
    this.gs = Math.hypot(this.vx, this.vz);
    this.track = ((Math.atan2(this.vx, -this.vz) / DEG) % 360 + 360) % 360;
  }

  /**
   * Integrate one step.
   * cmd = { bank (rad), phiMax, rollRate, rollAcc,
   *         gam (rad) | gamRate (rad/s, direct = physics mode), nMax (g), gamGain, gamTau,
   *         V (target TAS) | Vdot (direct), accel, decel, vJerk }
   */
  step(dt, cmd) {
    const phiMax = cmd.phiMax ?? 25 * DEG;
    follow(this.bank, clamp(cmd.bank ?? 0, -phiMax, phiMax), dt, cmd.bankWn ?? 1.15, cmd.rollRate ?? 3.2 * DEG, cmd.rollAcc ?? 3.5 * DEG);
    const V = Math.max(this.V, 30);
    if (cmd.gamRate != null) {
      this.gamRate = cmd.gamRate;
    } else {
      const gmax = (cmd.nMax ?? 0.08) * G / V;
      const want = clamp(((cmd.gam ?? 0) - this.gam) * (cmd.gamGain ?? 0.55), -gmax, gmax);
      this.gamRate = approach(this.gamRate, want, gmax / (cmd.gamTau ?? 1.4) * dt);
    }
    if (cmd.Vdot != null) {
      this.Vdot = cmd.Vdot;
    } else {
      const want = clamp(((cmd.V ?? this.V) - this.V) * (cmd.vGain ?? 0.16), -(cmd.decel ?? 0.6), cmd.accel ?? 0.6);
      this.Vdot = approach(this.Vdot, want, (cmd.vJerk ?? 0.22) * dt);
    }
    this.V = Math.max(30, this.V + this.Vdot * dt);
    this.gam = clamp(this.gam + this.gamRate * dt, -0.35, 0.4);
    this.psi = wrapPi(this.psi + G * Math.tan(this.bank.x) / Math.max(this.V, 30) * dt);
    if (this.psi < 0) this.psi += 2 * Math.PI;
    this.groundVelocity();
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
  }

  /** Bank command to hold a ground track (deg). Gain: 1.25 rad of bank per rad of error. */
  trackBank(trackDeg, phiMax = 25 * DEG) {
    const e = wrap180(trackDeg - this.track) * DEG;
    return clamp(e * 1.25, -phiMax, phiMax);
  }

  /**
   * L1 nonlinear guidance along a path (world coordinates). Returns { bank, s } where s is the
   * along-path position of the aircraft. hintS keeps the projection local.
   */
  l1Bank(path, hintS, phiMax = 25 * DEG, period = 11) {
    const s = projectOnPath(path, this.x, this.z, hintS, 30);
    const L1 = clamp(this.gs * period, 500, 4200);
    const p = pathPoint(path, Math.min(path.length, s + L1), this._p);
    const rx = p.x - this.x, rz = p.z - this.z;
    const ang = Math.atan2(rx, -rz) - Math.atan2(this.vx, -this.vz);
    const eta = wrapPi(ang);
    const dist = Math.max(L1, Math.hypot(rx, rz));
    const acc = 2 * this.gs * this.gs * Math.sin(eta) / dist;
    this._l1.bank = clamp(Math.atan(acc / G), -phiMax, phiMax); this._l1.s = s;
    return this._l1;
  }
}

/** Flight-path angle for a vertical speed at true airspeed V. */
export const gamFor = (vs, V) => Math.asin(clamp(vs / Math.max(V, 30), -0.3, 0.38));
/** Smooth minimum of a and b (blend width k). Returns [value, weight of b]. */
const _sm = { v: 0, wb: 0 };
export function softMin(a, b, k) {
  const d = a - b, r = Math.sqrt(d * d + k * k);
  _sm.v = 0.5 * (a + b - r); _sm.wb = 0.5 * (1 + d / r);
  return _sm;
}
