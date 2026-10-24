// Engine, automatic clutch, gearbox and differentials. The clutch and
// differentials are solved as velocity-level friction constraints each
// substep, which stays stable with stiff couplings at 2 kHz.

import type { VehicleDef } from './defs.ts';
import { Curve } from './shape.ts';
import { clamp, smoothstep } from '../math.ts';

const RPM = 60 / (2 * Math.PI);

export class Drivetrain {
  readonly def: VehicleDef;
  private curve: Curve;
  readonly peakTorque: number;
  omega: number; // engine rad/s
  gear = 1;
  clutch = 0;
  shiftTimer = 0;
  pendingGear = 1;
  automatic = true;
  running = true;
  /** 0..1 engine health; below ~0.05 the engine dies. */
  health = 1;
  /** Throttle actually applied after limiter/idle control. */
  appliedThrottle = 0;
  engineTorque = 0;
  clutchTorque = 0;
  limiterCut = 0;
  misfire = 0;
  /** Drive torque per wheel (FL, FR, RL, RR). */
  readonly wheelTorque = new Float64Array(4);
  /** Torque share per wheel of the transmission output. */
  readonly share = new Float64Array(4);
  readonly lockCap: number;
  private misfireTimer = 0;

  constructor(def: VehicleDef) {
    this.def = def;
    this.curve = new Curve(def.engine.torque);
    this.peakTorque = Math.max(...def.engine.torque.map((p) => p[1]));
    this.omega = def.engine.idleRpm / RPM;
    const s = this.share;
    if (def.drive === 'FWD') {
      s[0] = s[1] = 0.5;
    } else if (def.drive === 'RWD') {
      s[2] = s[3] = 0.5;
    } else {
      s[0] = s[1] = def.awdFront * 0.5;
      s[2] = s[3] = (1 - def.awdFront) * 0.5;
    }
    this.lockCap = def.diff === 'locked' ? Infinity : def.diff === 'lsd' ? 1 : 0;
  }

  get rpm(): number {
    return this.omega * RPM;
  }

  get gearCount(): number {
    return this.def.trans.gears.length;
  }

  /** Signed overall ratio for current gear (0 in neutral). */
  ratio(gear = this.gear): number {
    const t = this.def.trans;
    if (gear === 0) return 0;
    if (gear < 0) return -t.reverse * t.final;
    return t.gears[gear - 1] * t.final;
  }

  maxTorqueAt(rpm: number): number {
    return Math.max(0, this.curve.at(clamp(rpm, 0, this.def.engine.maxRpm)));
  }

  shift(to: number): void {
    const n = this.gearCount;
    to = clamp(to, -1, n);
    if (to === this.gear && this.shiftTimer <= 0) return;
    this.pendingGear = to;
    this.shiftTimer = this.def.trans.shiftTime;
  }

  reset(): void {
    this.omega = this.def.engine.idleRpm / RPM;
    this.gear = 1;
    this.pendingGear = 1;
    this.clutch = 0;
    this.shiftTimer = 0;
    this.running = true;
    this.health = 1;
    this.wheelTorque.fill(0);
  }

  start(): boolean {
    if (this.health < 0.05) return false;
    this.running = true;
    this.omega = Math.max(this.omega, this.def.engine.idleRpm / RPM);
    return true;
  }

  /**
   * Advance one substep. `wOmega` are wheel spin rates, `wInertia` their
   * inertias, `attached` mask of wheels still connected.
   */
  step(dt: number, throttle: number, wOmega: Float64Array, wInertia: Float64Array, attached: ArrayLike<boolean>, rnd: number): void {
    const e = this.def.engine;
    const t = this.def.trans;
    // gear change in progress
    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
      if (this.shiftTimer <= t.shiftTime * 0.5 && this.gear !== this.pendingGear) this.gear = this.pendingGear;
    }
    const G = this.ratio();
    // output shaft speed and effective inertia
    let wOut = 0, invI = 0, shareSum = 0;
    for (let i = 0; i < 4; i++) {
      const s = attached[i] ? this.share[i] : 0;
      shareSum += s;
    }
    for (let i = 0; i < 4; i++) {
      const s = attached[i] && shareSum > 0 ? this.share[i] / shareSum : 0;
      wOut += s * wOmega[i];
      if (s > 0) invI += (s * s) / wInertia[i];
    }
    const rpmE = this.omega * RPM;
    const rpmW = Math.abs(G * wOut) * RPM;

    // throttle shaping
    let thr = this.running ? throttle : 0;
    if (this.running && rpmE < e.idleRpm) thr = Math.max(thr, clamp((e.idleRpm - rpmE) / 300, 0, 0.6));
    if (rpmE > e.redline) this.limiterCut = 0.03;
    if (this.limiterCut > 0) {
      this.limiterCut -= dt;
      thr = 0;
    }
    if (this.health < 0.6 && this.running) {
      this.misfireTimer -= dt;
      if (this.misfireTimer <= 0) {
        this.misfireTimer = 0.04 + rnd * 0.25 * (0.4 + this.health);
        this.misfire = rnd < (0.6 - this.health) * 0.9 ? 0.06 : 0;
      }
      if (this.misfire > 0) {
        this.misfire -= dt;
        thr *= 0.1;
      }
    }
    this.appliedThrottle = thr;
    const healthFactor = 0.35 + 0.65 * this.health;
    const fric = (12 + e.friction * (rpmE / e.redline)) * (1 - thr * 0.85);
    let Te = thr * this.maxTorqueAt(rpmE) * healthFactor - fric;
    if (!this.running && rpmE < 30) Te = Math.max(Te, 0);
    this.engineTorque = Te;

    // automatic clutch engagement
    let target = 0;
    if (G !== 0 && this.shiftTimer <= 0) {
      const launch = throttle > 0.02 ? smoothstep(e.idleRpm + 100, e.idleRpm + 1300, rpmE) : 0;
      const rolling = smoothstep(e.idleRpm - 200, e.idleRpm + 250, rpmW);
      target = Math.max(launch, rolling);
      if (!this.running) target = rolling;
    }
    const rate = target > this.clutch ? 6 : 25;
    this.clutch += clamp(target - this.clutch, -rate * dt, rate * dt);
    const cap = this.clutch * this.peakTorque * 1.9;

    // clutch constraint
    const Ie = e.inertia;
    const wStar = this.omega + (Te * dt) / Ie;
    let Tc = 0;
    if (G !== 0 && cap > 0 && invI > 0) {
      Tc = (wStar - G * wOut) / (dt * (1 / Ie + G * G * invI));
      Tc = clamp(Tc, -cap, cap);
    }
    this.clutchTorque = Tc;
    this.omega = wStar - (Tc * dt) / Ie;
    if (this.omega < 0) this.omega = 0;
    if (!this.running && this.omega < 50 / RPM) this.omega *= 1 - dt * 3;
    // stall when lugged too low with the clutch engaged
    if (this.running && this.omega * RPM < 250 && this.clutch > 0.9) this.running = false;
    if (this.health < 0.05) this.running = false;

    const Tout = Tc * G * t.efficiency;
    for (let i = 0; i < 4; i++) {
      const s = attached[i] && shareSum > 0 ? this.share[i] / shareSum : 0;
      this.wheelTorque[i] = s * Tout;
    }
    // limited-slip / locked differentials per axle
    if (this.lockCap > 0) {
      for (const [l, r] of [[0, 1], [2, 3]]) {
        if (!attached[l] || !attached[r]) continue;
        if (this.share[l] === 0) continue;
        const diff = wOmega[l] - wOmega[r];
        let T = diff / (dt * (1 / wInertia[l] + 1 / wInertia[r]));
        const axleT = Math.abs(this.wheelTorque[l] + this.wheelTorque[r]);
        const lim = this.lockCap === Infinity ? 8000 : this.def.lsdPreload + this.def.lsdRatio * axleT;
        T = clamp(T, -lim, lim) * 0.5;
        this.wheelTorque[l] -= T;
        this.wheelTorque[r] += T;
      }
    }
  }

  /** Automatic shift logic, run per frame. */
  autoShift(throttle: number, speedRpm: number, sliding: boolean, braking = false): void {
    if (!this.automatic || this.shiftTimer > 0 || this.gear <= 0) return;
    const e = this.def.engine;
    const n = this.gearCount;
    let rpmNow = speedRpm * Math.abs(this.ratio());
    if (this.clutch > 0.95) rpmNow = Math.max(rpmNow, this.rpm);
    const up = e.idleRpm + (e.redline * 0.95 - e.idleRpm) * clamp(0.42 + throttle * 0.58, 0, 1);
    const down = e.idleRpm + (e.redline * 0.55 - e.idleRpm) * clamp(throttle, 0.15, 1);
    if (rpmNow > up && this.gear < n && !sliding && (!braking || rpmNow > e.redline * 0.97)) {
      this.shift(this.gear + 1);
    } else if (this.gear > 1) {
      const rpmLower = speedRpm * Math.abs(this.ratio(this.gear - 1));
      if (rpmNow < down && rpmLower < e.redline * 0.88) this.shift(this.gear - 1);
    }
  }
}
