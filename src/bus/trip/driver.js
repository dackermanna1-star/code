// =============================================================================
// AUTOPILOT — "Marco", the coach driver.
//
// Longitudinal: the minimum of several desired accelerations
//   * static speed profile (limits x driver factor, curves, grades, humps),
//     read slightly ahead, with a feed-forward of the profile's own slope,
//   * a stop trajectory (stops, signals, the final bay) with a soft release
//     just before standstill (gentle final stop, small pitch rebound),
//   * IDM car following behind a leader (app.traffic.leaderAhead),
// then jerk limited (≈0.7 m/s³) and turned into pedal commands through the
// vehicle's force model (feed-forward of resistances + PI on speed): engine
// first, then retarder, then the air brakes. Pedals have human rate limits.
//
// Lateral: pure pursuit on the drive axle towards a point on the desired lane
// path (lane centre + a gentle human wander of ±10-15 cm, stop lay-bys, lane
// changes), with speed-dependent look-ahead and steering-rate limits.
// =============================================================================
import { clamp, clamp01, lerp, smoothstep, damp, approach, curve, fbm, vnoise } from './util.js';
import { VEH, G } from './vehicle.js';
import { A_UP, stopSpeed, stopDecel } from './plan.js';

export class Autopilot {
  constructor(plan) {
    this.plan = plan;
    this.reset(0);
    this._fr = [0, 0];
  }
  reset(v = 0) {
    this.aCmd = 0; this.vRef = v; this.eInt = 0;
    this.thr = 0; this.brk = 0; this.ret = 0;
    this.steer = 0;
    this.aDes = 0;
    this.limiting = 'profile';
  }

  /** Lateral wander of a human driver (m), deterministic in s. */
  wander(s) { return 0.1 * fbm(s / 190, 17, 2) + 0.035 * vnoise(s / 47, 29); }

  /**
   * Longitudinal control. ctx = { s, v, grade, stopD, stopB, signalD, leaderGap, leaderV, vCap, hold }
   * Writes ctl.throttle / brake / retarder.
   */
  longitudinal(h, veh, ctx, ctl) {
    const P = this.plan, v = Math.max(0, veh.v);
    // 1) static profile, read ahead
    const lead = clamp(v * 0.9, 2, 30);
    const vT = Math.min(P.profileAt(ctx.s + lead), ctx.vCap ?? Infinity);
    const vT2 = Math.min(P.profileAt(ctx.s + lead + 6), ctx.vCap ?? Infinity);
    const slope = (vT2 * vT2 - vT * vT) / 12;              // = dv/dt along the profile at its own speed
    const ff = v > vT - 1.2 ? Math.min(0, slope) : 0;
    const aUp = curve(A_UP, v);
    let a = clamp(ff + 0.5 * (vT - v), -1.5, aUp);
    let why = 'profile';
    // 2) stop target (stops, bay, red signal)
    if (ctx.stopD < 1e5) {
      const b = ctx.stopB || 1.0;
      const d = ctx.stopD;
      const vS = stopSpeed(d, b);
      const ffS = v > vS - 0.5 ? -stopDecel(d, b) : 0;
      const aS = clamp(ffS + 0.9 * (vS - v), -3.0, aUp);
      if (aS < a) { a = aS; why = 'stop'; }
    }
    // 3) leader (IDM)
    if (ctx.leaderGap < 400) {
      const s0 = 4.5, T = 1.7, am = 0.9, bc = 1.4;
      const dv = v - ctx.leaderV;
      const sStar = s0 + Math.max(0, v * T + v * dv / (2 * Math.sqrt(am * bc)));
      const gap = Math.max(0.5, ctx.leaderGap);
      const aL = clamp(am * (1 - (sStar / gap) * (sStar / gap)), -3.5, aUp);
      if (aL < a) { a = aL; why = 'leader'; }
    }
    if (ctx.hold) { a = Math.min(a, -0.6); why = 'hold'; }
    this.aDes = a; this.limiting = why;
    // jerk limit (comfort); faster when we must brake harder than planned
    const up = a > this.aCmd;
    const jerk = up ? (this.aCmd < 0 ? 1.1 : 0.7) : (a < this.aCmd - 1.0 ? 2.6 : 1.0);
    this.aCmd = approach(this.aCmd, a, jerk * h);
    // reference speed + PI
    this.vRef = clamp(this.vRef + this.aCmd * h, v - 1.0, v + 1.0);
    if (v < 0.05 && this.aCmd <= 0) this.vRef = 0;
    const e = this.vRef - v;
    this.eInt = clamp(this.eInt + e * h, -2.5, 2.5);
    if (v < 0.05 && this.aCmd <= 0) this.eInt = 0;
    const aTot = this.aCmd + 0.6 * e + 0.12 * this.eInt;
    // force allocation
    const Fneed = veh.massEff * aTot + veh.resistance(v, ctx.grade);
    const fr = veh.driveForceRange(this._fr);
    let thr = 0, ret = 0, brk = 0;
    const standing = v < 0.12 && this.aCmd <= 0.02;
    if (standing) { brk = ctx.hold ? 0.32 : 0.22; }
    else if (Fneed >= fr[0]) {
      thr = fr[1] > fr[0] + 1 ? clamp01((Fneed - fr[0]) / (fr[1] - fr[0])) : (Fneed > 0 ? 1 : 0);
      if (veh.gear <= 0 && veh.selector === 'D') thr = Math.min(thr, 0.3);
    } else {
      let deficit = fr[0] - Fneed;
      const Fr = veh.retarderForceMax(v);
      if (v > 3.5 && Fr > 500) { ret = clamp01(deficit / Fr); deficit -= ret * Fr; }
      if (deficit > 0) brk = clamp01(deficit / (VEH.mass * VEH.brakeDecel));
      // drivers don't stab the retarder for tiny corrections at low speed
      if (v < 8) { brk += ret * Fr / (VEH.mass * VEH.brakeDecel); ret = 0; }
    }
    // human pedal rates
    this.thr = approach(this.thr, thr, (thr > this.thr ? 0.9 : 2.2) * h);
    this.brk = approach(this.brk, brk, (brk > this.brk ? 1.4 : 2.0) * h);
    this.ret = approach(this.ret, ret, 1.6 * h);
    if (this.brk > 0.04 && this.thr > 0) this.thr = approach(this.thr, 0, 3 * h);
    ctl.throttle = this.thr;
    ctl.brake = this.brk;
    ctl.retarder = this.ret;
    // exhaust brake with the retarder on long descents (coolant permitting)
    ctl.engineBrake = this.ret > 0.55 && ctx.grade < -0.035 ? 1 : 0;
  }

  /**
   * Lateral control (pure pursuit on the drive axle). target(sAhead) -> desired lat at that s;
   * pp = { x, z, heading (deg) } of the drive axle; pointFn(s, lat, out) -> world point.
   */
  lateral(h, veh, sR, pp, targetLatAt, pointFn, tmp, ctl) {
    const v = Math.abs(veh.v);
    const Ld = clamp(5.5 + 0.8 * v, 7, 28);
    const lat = targetLatAt(sR + Ld);
    const q = pointFn(sR + Ld, lat, tmp);
    const hr = pp.heading * Math.PI / 180;
    const dx = q.x - pp.x, dz = q.z - pp.z;
    const yl = dx * Math.cos(hr) + dz * Math.sin(hr);       // + = right
    const xl = dx * Math.sin(hr) - dz * Math.cos(hr);       // forward
    const d2 = Math.max(4, xl * xl + yl * yl);
    let delta = Math.atan(2 * VEH.wheelbase * yl / d2);
    // understeer compensation (the bicycle model needs a little more lock at speed)
    delta *= 1 + VEH.understeer * v * v / VEH.wheelbase;
    delta = clamp(delta, -VEH.steerMax, VEH.steerMax);
    // the driver's hands: smooth target, rate limited (hand-over-hand in town, fingertips on the highway)
    this.steer = damp(this.steer, delta, v < 6 ? 6 : 3.2, h);
    ctl.steer = this.steer;
    ctl.steerRate = lerp(0.55, 0.06, smoothstep(4, 24, v));
  }
}
