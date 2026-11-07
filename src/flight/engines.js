// =============================================================================
// CFM56-7B engine model: starter motoring -> light-off -> acceleration to idle,
// spool dynamics (slow from idle, fast at high N1), N2/EGT/fuel-flow relations
// and spool-down after fuel cut-off. Mutates the state.engines[] entries
// ({ running, starting, n1, n2, egt, fuelFlow }) owned by the flight state.
// =============================================================================
import { RHO0, clamp, clamp01, smoothstep } from './fmath.js';

export const GROUND_IDLE_N1 = 20.5;

export class Engines {
  constructor(list) {
    this.list = list;                       // state.engines
    this.int = list.map(() => ({ stage: 0, t: 0, target: GROUND_IDLE_N1, n1v: 0 }));
  }
  /** stage: 0 off/spooling down, 1 starter motoring, 2 light-off & accelerating, 3 running */
  stage(i) { return this.int[i].stage; }
  running(i) { return this.int[i].stage === 3; }
  allRunning() { return this.int.every((e) => e.stage === 3); }
  anyTurning() { return this.list.some((e) => e.n2 > 1); }

  start(i) {
    const k = this.int[i];
    if (k.stage === 0) { k.stage = 1; k.t = 0; this.list[i].starting = true; return true; }
    return false;
  }
  shutdown(i) {
    const k = this.int[i];
    if (k.stage !== 0) { k.stage = 0; k.t = 0; this.list[i].running = false; this.list[i].starting = false; return true; }
    return false;
  }
  /** Commanded N1 (%) for engine i (or both if i is undefined). Clamped to idle by the model. */
  setTarget(n1, i) {
    if (i === undefined) { for (const k of this.int) k.target = n1; } else this.int[i].target = n1;
  }

  /** Instantly set both engines to a steady condition: 'off' | 'idle' | number (N1 %). */
  snap(mode, ambientC = 15, rho = RHO0) {
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i], k = this.int[i];
      if (mode === 'off') {
        k.stage = 0; e.running = false; e.starting = false; e.n1 = 0; e.n2 = 0; e.egt = ambientC; e.fuelFlow = 0; k.target = GROUND_IDLE_N1;
      } else {
        const n1 = mode === 'idle' ? GROUND_IDLE_N1 : mode;
        k.stage = 3; e.running = true; e.starting = false; e.n1 = n1; e.n2 = n2For(n1); k.target = n1;
        e.egt = egtFor(n1, ambientC); e.fuelFlow = ffFor(n1, rho);
      }
      k.n1v = 0; k.t = 0;
    }
  }

  step(dt, { ambientC = 15, rho = RHO0, idleN1 = GROUND_IDLE_N1, maxN1 = 101 } = {}) {
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i], k = this.int[i];
      k.t += dt;
      if (k.stage === 0) {
        // fuel off: spool down (fan keeps windmilling slowly on the ground)
        e.n2 = Math.max(0, e.n2 - e.n2 * dt / 7.5 - 0.15 * dt);
        e.n1 = Math.max(0, e.n1 - e.n1 * dt / 11 - 0.06 * dt);
        e.egt += (ambientC - e.egt) * (1 - Math.exp(-dt / 45));
        e.fuelFlow = 0; e.running = false; e.starting = false;
      } else if (k.stage === 1) {
        // starter motoring (air from the APU): N2 -> ~25 % in ~15 s
        e.starting = true;
        e.n2 += (33 - e.n2) / 10 * dt;
        e.n1 += (e.n2 * 0.2 - e.n1) * dt / 2.5;
        e.egt += (ambientC + 5 - e.egt) * (1 - Math.exp(-dt / 6));
        e.fuelFlow = 0;
        if (e.n2 >= 25) { k.stage = 2; k.t = 0; }
      } else if (k.stage === 2) {
        // fuel + ignition: light-off EGT spike, accelerate to ground idle (~27 s)
        e.n2 += (0.35 + (62 - e.n2) * 0.06) * dt;
        const n1Target = 5 + clamp01((e.n2 - 25) / 34.5) * (GROUND_IDLE_N1 - 5);
        e.n1 += (n1Target - e.n1) * dt / 2.2;
        const egtT = k.t < 9 ? ambientC + 640 : egtFor(e.n1, ambientC) + 60 * Math.exp(-(k.t - 9) / 6);
        e.egt += (egtT - e.egt) * (1 - Math.exp(-dt / 2.4));
        e.fuelFlow = 120 + 160 * clamp01(k.t / 10);
        if (e.n2 >= 59.5) { k.stage = 3; k.t = 0; e.running = true; e.starting = false; }
      } else {
        // running: spool dynamics (slow out of idle, quick above ~55 %)
        const tgt = clamp(k.target, idleN1, maxN1);
        const up = 2.6 + 13 * smoothstep(22, 52, e.n1);
        const down = 3 + 6 * smoothstep(30, 80, e.n1);
        let rate = (tgt - e.n1) * 1.4;
        rate = clamp(rate, -down, up);
        // a little inertia on the rate itself (no instantaneous spool changes)
        k.n1v += (rate - k.n1v) * (1 - Math.exp(-dt * 3.5));
        e.n1 += k.n1v * dt;
        e.n2 += (n2For(e.n1) - e.n2) * (1 - Math.exp(-dt / 0.7));
        e.egt += (egtFor(e.n1, ambientC) - e.egt) * (1 - Math.exp(-dt / 2.6));
        e.fuelFlow = ffFor(e.n1, rho);
        e.running = true; e.starting = false;
      }
    }
  }
}

export const n2For = (n1) => 60 + (n1 - GROUND_IDLE_N1) * 0.48;
export const egtFor = (n1, ambientC) => ambientC + 380 + 520 * Math.pow(clamp01((n1 - 20) / 75), 1.4);
export const ffFor = (n1, rho) => 280 + 3300 * Math.pow(clamp01((n1 - 20) / 75), 2) * (0.35 + 0.65 * rho / RHO0);
