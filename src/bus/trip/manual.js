// =============================================================================
// MANUAL DRIVING — the player in the driver's seat.
//   W / ArrowUp      throttle (analog ramp)
//   S / ArrowDown    brake pedal: first ~25 % = retarder (blended braking like a
//                    real coach), deeper = air service brakes
//   A / D (arrows)   steering wheel (speed-sensitive rate, self-centring)
//   1 / 2 / 3        selector D / N / R          Space  parking brake
//   Q / E            indicators left / right     H      horn (hold)
//   L                lights off / low / high     K      wipers 0..3
// Door interlock (no throttle with a door open), auto-hold at standstill, a
// 100 km/h speed limiter and a 9 km/h reverse limiter.
// =============================================================================
import { clamp, clamp01, lerp, smoothstep, approach } from './util.js';
import { VEH } from './vehicle.js';

export class ManualDriver {
  constructor() { this.reset(); }
  reset(veh) {
    this.thr = 0; this.pedal = 0;
    this.sw = veh ? veh.delta * VEH.steerRatio : 0;      // steering-wheel angle (rad)
  }
  /** inp = { up, down, left, right } (booleans or 0..1), opts = { doorsOpen, offroad } */
  update(h, inp, veh, ctl, opts = {}) {
    const v = veh.v, av = Math.abs(v);
    const up = +inp.up || 0, down = +inp.down || 0;
    this.thr = up > 0 && !down ? approach(this.thr, up, 0.85 * h) : approach(this.thr, 0, 3.0 * h);
    this.pedal = down > 0 ? approach(this.pedal, down, 1.3 * h) : approach(this.pedal, 0, 3.2 * h);
    let thr = this.thr;
    // limiters
    if (veh.selector === 'D') thr *= clamp01((27.8 - v) / 1.2);              // 100 km/h limiter
    if (veh.selector === 'R') thr = Math.min(thr, 0.35) * clamp01((2.5 + v) / 0.8);
    let brake = 0, ret = 0;
    if (av > 2.5) { ret = clamp01(this.pedal / 0.25); brake = clamp01((this.pedal - 0.22) / 0.78); }
    else brake = this.pedal;
    // auto-hold at standstill, door interlock
    if (av < 0.15 && thr < 0.03) brake = Math.max(brake, 0.3);
    if (opts.doorsOpen) { thr = 0; brake = Math.max(brake, av < 2 ? 0.5 : brake); }
    ctl.throttle = thr; ctl.brake = brake; ctl.retarder = ret; ctl.engineBrake = 0;
    // steering wheel
    const steerIn = (+inp.right || 0) - (+inp.left || 0);
    const swMax = VEH.steerMax * VEH.steerRatio;
    if (steerIn !== 0) {
      const rate = lerp(5.5, 1.3, smoothstep(0, 24, av));
      this.sw = clamp(this.sw + steerIn * rate * h, -swMax, swMax);
    } else {
      // caster self-centring (only while rolling)
      const rc = (0.4 + 3.2 * smoothstep(0.3, 10, av)) * h;
      this.sw = approach(this.sw, 0, rc * (0.4 + Math.min(1, Math.abs(this.sw) / 3)));
    }
    ctl.steer = this.sw / VEH.steerRatio;
    ctl.steerRate = 2.0;
  }
}
