// =============================================================================
// COACH VEHICLE DYNAMICS (pure JS, used by the autopilot AND manual driving).
//
//  * Engine: 12.9 l inline-six diesel, 353 kW / 2300 Nm (1100-1400 rpm), turbo
//    boost lag, governor, motoring drag + engine (exhaust) brake, coolant/fan,
//    start / stop (cranking).
//  * 6-speed torque-converter automatic (ZF-EcoLife-like ratios), lock-up from
//    2nd gear, load / throttle dependent shift map, kickdown, hill holding,
//    retarder downshifts, shift sequence with torque dip + rpm sweep.
//  * Longitudinal: tractive force, rolling resistance, aero drag, grade, air
//    service brakes, hydrodynamic retarder (prop-shaft speed dependent),
//    spring parking brake, static friction at standstill.
//  * Lateral: kinematic bicycle model on the drive axle (wheelbase 6.1 m) with
//    an understeer gradient and a yaw lag, steering actuator rate limits,
//    integrated in Frenet coordinates along the route (s, lat, heading error).
//  * Air system: compressor cut-in/out, consumers (brakes, doors, kneeling,
//    parking brake, levelling), air-dryer purge.
//  * Air suspension body model: heave / pitch / roll damped springs driven by
//    road inputs at the axles, longitudinal / lateral load transfer, kneeling,
//    impulses from road events.
// =============================================================================
import { clamp, clamp01, lerp, smoothstep, damp, approach, curve, spring } from './util.js';

export const G = 9.80665;
const RPM = 60 / (2 * Math.PI);

export const VEH = {
  mass: 18000,                // kg (coach + fuel + driver + luggage)
  wheelR: 0.535,              // 295/80 R22.5
  wheelbase: 6.1,             // front axle -> drive axle
  frontAxleZ: -3.85, driveAxleZ: 2.25, tagAxleZ: 3.62,   // bus-local z
  refZ: 2.25,                 // kinematic reference = drive axle (origin is 2.25 m ahead of it)
  track: 2.06,
  cdA: 0.55 * 8.3,
  crr: 0.0062,
  rho: 1.2,
  idleRpm: 620, governorRpm: 2100, cutRpm: 2250, stallRpm: 1480,
  // full-load torque (Nm) vs rpm, flat [rpm, Nm, ...]
  torque: [450, 700, 600, 1250, 800, 1850, 1000, 2250, 1100, 2300, 1400, 2300, 1600, 2190, 1800, 1960, 1900, 1820, 2000, 1640, 2100, 1380, 2200, 650, 2300, 0],
  friction: [0, 0, 600, -75, 1000, -115, 1400, -165, 1800, -225, 2200, -300],
  engineBrake: [600, -140, 1000, -480, 1400, -860, 1800, -1150, 2100, -1300, 2300, -1350],
  ratios: [0, 3.36, 1.91, 1.42, 1.0, 0.72, 0.62],
  reverse: 4.24, axle: 3.9, eta: 0.91,
  shiftTime: 0.82,
  retarderTorque: 3200, retarderPower: 420000,
  brakeDecel: 6.5,            // service brakes at full pedal (m/s²)
  parkDecel: 3.2,
  steerMax: 0.80,             // road-wheel angle (rad, ≈ 46°)
  steerRatio: 18,
  understeer: 0.0042,         // rad per m/s² lateral acceleration
  airCutIn: 8.6, airCutOut: 10.0, airMax: 10.4,
  rideHeight: 1.32,           // deck above the road (static)
  kneelDrop: 0.075,           // right-side drop at full kneel (m)
};

export const gearLabel = (i) => (i < 0 ? 'R' : i === 0 ? 'N' : String(i));

/** Full-load torque at rpm (Nm). */
export const torqueAt = (rpm) => curve(VEH.torque, rpm);

export class Vehicle {
  constructor(onEvent = () => {}) {
    this.emit = onEvent;
    this.reset();
  }

  reset() {
    // Frenet state of the kinematic reference point (drive axle)
    this.sR = 0; this.latR = 1.75; this.epsi = 0;
    this.v = 0; this.a = 0; this.aFilt = 0;
    this.r = 0;                // yaw rate (rad/s, + = turning right)
    this.delta = 0;            // road-wheel angle (rad, + = right)
    this.aLat = 0;
    // driveline
    this.selector = 'N';       // 'D' | 'N' | 'R'
    this.gear = 0;             // -1 R, 0 N, 1..6
    this.shift = null;         // { from, to, t }
    this.lastShift = -10;
    this.time = 0;
    this.thrF = 0;             // filtered throttle (shift map)
    this.converter = true;
    // engine
    this.running = true; this.cranking = 0; this.rpm = VEH.idleRpm;
    this.engineTorque = 0; this.load = 0; this.turbo = 0;
    this.coolant = 84; this.fan = false; this.powerAvg = 0;
    this.throttle = 0; this.brake = 0; this.retarder = 0; this.parking = true;
    this.engineBrake = 0;
    // forces (for the controller)
    this.Fdrive = 0; this.Fres = 0; this.Fbrake = 0; this.Fret = 0; this.stuck = true;
    // air
    this.air = 8.5; this.compressor = false; this._prevBrake = 0;
    this.wheelAngle = 0;
  }

  /** Total gear ratio from the engine to the wheels (signed: negative in reverse). */
  ratioOf(g) { return g > 0 ? VEH.ratios[g] * VEH.axle : g < 0 ? -VEH.reverse * VEH.axle : 0; }
  /** Engine rpm the wheels impose in gear g at speed v. */
  rpmIn(g, v = this.v) { return Math.abs(v / VEH.wheelR * this.ratioOf(g)) * RPM; }
  get shifting() { return this.shift ? Math.sin(Math.PI * clamp01(this.shift.t / VEH.shiftTime)) : 0; }
  get massEff() { const i = this.ratioOf(this.gear); return VEH.mass * (1.03 + 0.0011 * i * i); }

  /** Resistive forces opposing forward motion at speed v on a grade (N, + = decelerating). */
  resistance(v, grade, crrExtra = 0) {
    const th = Math.atan(grade);
    const roll = (VEH.crr + crrExtra) * VEH.mass * G * Math.cos(th) * clamp(v / 0.3, -1, 1);
    const aero = 0.5 * VEH.rho * VEH.cdA * v * Math.abs(v);
    return VEH.mass * G * Math.sin(th) + roll + aero;
  }

  /** Tractive force range at the wheels in the current gear [drag at zero throttle, full throttle] (N). */
  driveForceRange(out) {
    const g = this.gear;
    if (g === 0 || !this.running) { out[0] = 0; out[1] = 0; return out; }
    const i = Math.abs(this.ratioOf(g)), k = i * VEH.eta / VEH.wheelR;
    const rpm = Math.max(this.rpm, VEH.idleRpm);
    let tr = 1;
    if (this.converter) { const sr = clamp01(this.rpmIn(g) / Math.max(rpm, 1)); tr = sr < 0.86 ? 1.9 - 0.9 * sr / 0.86 : 1; }
    out[0] = this.converter ? 0 : curve(VEH.friction, rpm) * k;
    out[1] = torqueAt(rpm) * tr * k * (1 - 0.8 * this.shifting);
    return out;
  }

  /** Maximum retarder force at the current speed (N). */
  retarderForceMax(v = this.v) {
    const prop = Math.abs(v) / VEH.wheelR * VEH.axle;              // rad/s
    const T = Math.min(VEH.retarderTorque * Math.pow(clamp01(prop * RPM / 750), 1.6), VEH.retarderPower / Math.max(prop, 1));
    return T * VEH.axle / VEH.wheelR;
  }

  setSelector(sel) {
    if (sel === this.selector) return;
    if (sel === 'R' && Math.abs(this.v) > 0.6) return;   // interlock
    if (sel === 'D' && this.v < -0.6) return;
    this.selector = sel;
    const g = sel === 'N' ? 0 : sel === 'R' ? -1 : 1;
    if (g !== this.gear) { const from = this.gear; this.gear = g; this.shift = null; this.emit('trip:gear', { gearIndex: g, up: g > from, selector: sel }); }
  }

  // ------------------------------------------------------------------ gearbox
  _gearbox(h, ctl, grade) {
    this.thrF = damp(this.thrF, ctl.throttle, 2.2, h);
    if (this.selector !== 'D') return;
    if (this.gear <= 0) { this.gear = 1; this.emit('trip:gear', { gearIndex: 1, up: true }); }
    if (this.shift) {
      this.shift.t += h;
      if (this.shift.t >= VEH.shiftTime) this.shift = null;
      return;
    }
    const g = this.gear, v = this.v, rpm = this.rpmIn(g), thr = this.thrF;
    const since = this.time - this.lastShift;
    // stopped / crawling: back to 1st (skip shifts allowed at low speed)
    if (v < 1.2 && g > 1) { this._startShift(1); return; }
    if (v < 4.5 && g > 2) { this._startShift(2); return; }
    const braking = ctl.retarder > 0.3 || ctl.brake > 0.18;
    const upRpm = braking ? 2050 : lerp(1320, 1870, Math.pow(clamp01(thr), 1.25));
    const downRpm = braking ? 1350 : lerp(880, 1220, clamp01(thr));
    if (g < 6 && rpm > upRpm && since > 1.6 && !braking) {
      // hill logic: only upshift if the next gear can still pull the load
      const n = g + 1, rpmN = this.rpmIn(n);
      const Fnext = torqueAt(rpmN) * VEH.ratios[n] * VEH.axle * VEH.eta / VEH.wheelR;
      const need = this.resistance(v, grade) + VEH.mass * 0.12;
      if (rpmN > VEH.idleRpm + 260 && (Fnext * (0.55 + 0.4 * thr) > need || thr < 0.25)) { this._startShift(n); return; }
    }
    if (g > 1 && since > 1.0) {
      const kick = thr > 0.9 && this.rpmIn(g - 1) < 1780 && rpm < 1550;
      const lug = rpm < downRpm;
      const brakeDown = braking && this.rpmIn(g - 1) < 1900 && rpm < 1550 && v > 4;
      if (kick || lug || brakeDown) this._startShift(g - 1);
    }
  }
  _startShift(to) {
    const from = this.gear;
    if (to === from) return;
    this.shift = { from, to, t: 0, rpmFrom: this.rpm };
    this.gear = to;
    this.lastShift = this.time;
    this.emit('trip:gear', { gearIndex: to, up: to > from });
  }

  // ------------------------------------------------------------------ engine
  _engine(h, ctl) {
    const want = ctl.engineOn !== false;
    if (want && !this.running && this.cranking <= 0) { this.cranking = 1e-6; this.emit('trip:engine', { running: false, starting: true }); }
    if (!want && this.running) { this.running = false; this.cranking = 0; this.emit('trip:engine', { running: false, starting: false }); }
    if (this.cranking > 0) {
      this.cranking += h;
      if (this.cranking > 1.35) { this.cranking = 0; this.running = true; this.rpm = Math.max(this.rpm, 520); this.emit('trip:engine', { running: true, starting: false }); }
    }
    const g = this.gear, v = this.v;
    const thrIn = this.running ? clamp01(ctl.throttle) : 0;
    // smoke limiter: torque command rises at a finite rate
    this.throttle = approach(this.throttle, thrIn, (thrIn > this.throttle ? 1.4 : 3.5) * h);
    const thr = this.throttle;
    const wheelRpm = Math.abs(v) / VEH.wheelR * RPM;
    let target;
    this.converter = g === 1 ? v < 3.2 || (this.converter && v < 3.6) : g === -1;
    if (!this.running) target = this.cranking > 0 ? 170 + 40 * Math.sin(this.cranking * 38) : 0;
    else if (g === 0) target = VEH.idleRpm + thr * 0.7 * (VEH.governorRpm - VEH.idleRpm);
    else {
      const turb = this.rpmIn(g);
      if (this.converter) target = Math.max(turb / 0.97, VEH.idleRpm + thr * (VEH.stallRpm - VEH.idleRpm) * (1 - 0.35 * clamp01(turb / VEH.stallRpm)));
      else target = Math.max(turb, VEH.idleRpm * 0.92);
      if (this.shift) {
        const s = this.shift, u = smoothstep(0.18, 0.78, s.t / VEH.shiftTime);
        const rTo = Math.max(VEH.idleRpm, this.rpmIn(s.to)), rFrom = Math.max(VEH.idleRpm, wheelRpm * Math.abs(this.ratioOf(s.from)));
        target = lerp(rFrom, rTo, u) + (s.to < s.from ? 60 : 0) * Math.sin(Math.PI * u);
      }
    }
    const coupled = this.running && g !== 0 && !this.converter && !this.shift;
    if (coupled) this.rpm = damp(this.rpm, target, 30, h);
    else this.rpm = damp(this.rpm, target, this.running ? (target > this.rpm ? 5 : 3.2) : 2.2, h);
    if (this.running && this.rpm < VEH.idleRpm * 0.8 && !this.cranking) this.rpm = damp(this.rpm, VEH.idleRpm, 6, h);
    // engine torque
    const rpm = this.rpm;
    // turbo boost follows the load with a lag (spool-up ~1 s)
    const boostT = clamp01(thr * smoothstep(750, 1450, rpm) * 1.05);
    this.turbo = damp(this.turbo, boostT, boostT > this.turbo ? 1.1 : 1.8, h);
    const Tmax = torqueAt(rpm) * (0.6 + 0.4 * this.turbo);
    let thrEff = thr;
    if (rpm > VEH.governorRpm) thrEff *= clamp01((VEH.cutRpm - rpm) / (VEH.cutRpm - VEH.governorRpm));
    const eb = this.running ? clamp01(this.engineBrake) : 0;
    const drag = curve(VEH.friction, rpm) + eb * (curve(VEH.engineBrake, rpm) - curve(VEH.friction, rpm));
    let Te = this.running ? thrEff * Tmax + (1 - thrEff) * drag : 0;
    this.engineTorque = Te;
    this.load = this.running ? clamp01(Te / Math.max(1, torqueAt(rpm))) : 0;
    // torque at the wheels
    let Tw = 0;
    if (g !== 0 && this.running) {
      const i = this.ratioOf(g);
      if (this.converter) {
        const sr = clamp01(this.rpmIn(g) / Math.max(rpm, 1));
        const tr = sr < 0.86 ? 1.9 - 0.9 * sr / 0.86 : 1;
        const pump = Math.max(thrEff * Tmax, 0) + 130 * (1 - sr) * (1 - thrEff);   // creep at idle
        Tw = pump * tr * i;
      } else Tw = Te * i;
      Tw *= VEH.eta * (1 - 0.8 * this.shifting);
    }
    this.Fdrive = Tw / VEH.wheelR;
    // power (cooling / fan)
    const P = Math.max(0, Te) * rpm / RPM;
    this.powerAvg = damp(this.powerAvg, P / 353000, 0.02, h);
    const cT = 82 + 15 * this.powerAvg - 3 * smoothstep(5, 25, Math.abs(v)) + (this.running ? 0 : -6);
    this.coolant = damp(this.coolant, cT, 0.012, h);
    if (this.coolant > 92.5) this.fan = true; else if (this.coolant < 88) this.fan = false;
  }

  // ------------------------------------------------------------------ step
  /**
   * Advance by h seconds.
   * ctl: { throttle, brake, retarder, engineBrake, steer (road-wheel target, rad), steerRate (rad/s),
   *        parking (bool), engineOn }
   * env: { kappa (curvature at the reference point, 1/m), grade, crrExtra }
   */
  step(h, ctl, env) {
    this.time += h;
    this.parking = !!ctl.parking;
    this.engineBrake = ctl.engineBrake || 0;
    this._gearbox(h, ctl, env.grade);
    this._engine(h, ctl);
    // brakes & retarder (pneumatic / hydraulic lag)
    this.brake = approach(this.brake, clamp01(ctl.brake), (ctl.brake > this.brake ? 2.6 : 3.2) * h);
    this.retarder = approach(this.retarder, clamp01(ctl.retarder), 2.0 * h);
    // --- longitudinal
    const m = VEH.mass, me = this.massEff, v = this.v;
    const th = Math.atan(env.grade);
    const crr = VEH.crr + (env.crrExtra || 0);
    const Fgrade = -m * G * Math.sin(th);
    const Faero = -0.5 * VEH.rho * VEH.cdA * v * Math.abs(v);
    const Fext = this.Fdrive + Fgrade + Faero;
    this.Fret = this.retarderForceMax(v) * this.retarder;
    this.Fbrake = this.brake * m * VEH.brakeDecel;
    const Fpark = this.parking ? m * VEH.parkDecel : 0;
    const Froll = crr * m * G * Math.cos(th);
    const Fopp = this.Fbrake + Fpark + this.Fret + Froll;
    this.Fres = m * G * Math.sin(th) + Froll * clamp(v / 0.3, -1, 1) - Faero;
    let a;
    if (Math.abs(v) < 0.03 && Math.abs(Fext) <= Fopp) { a = 0; this.v = 0; this.stuck = true; }
    else {
      this.stuck = false;
      const dir = Math.abs(v) >= 0.03 ? Math.sign(v) : Math.sign(Fext);
      const rollSm = Math.abs(v) >= 0.3 ? 1 : Math.abs(v) / 0.3;
      a = (Fext - dir * (this.Fbrake + Fpark + this.Fret + Froll * Math.max(rollSm, Math.abs(v) < 0.03 ? 1 : 0))) / me;
      let nv = v + a * h;
      if (v !== 0 && Math.sign(nv) !== Math.sign(v) && Math.abs(Fext) <= Fopp) { nv = 0; a = -v / h; }
      this.v = nv;
    }
    this.a = a;
    this.aFilt = damp(this.aFilt, a, 12, h);
    // --- lateral: steering actuator + bicycle model
    const sMax = VEH.steerMax;
    const st = clamp(ctl.steer || 0, -sMax, sMax);
    this.delta = approach(this.delta, st, (ctl.steerRate || 0.5) * h);
    const V = this.v, L = VEH.wheelbase;
    const rss = V * Math.tan(this.delta) / (L + VEH.understeer * V * V);
    const lag = 0.04 + 0.13 * smoothstep(3, 20, Math.abs(V));
    this.r = damp(this.r, rss, 1 / lag, h);
    this.aLat = V * this.r;
    // --- Frenet integration of the reference point
    const k = env.kappa || 0;
    const den = Math.max(0.25, 1 - k * this.latR);
    const sdot = V * Math.cos(this.epsi) / den;
    this.sR += sdot * h;
    this.latR += V * Math.sin(this.epsi) * h;
    this.epsi += (this.r - k * sdot) * h;
    this.wheelAngle = (this.wheelAngle + V / VEH.wheelR * h) % (Math.PI * 2);
    // --- air system
    this._air(h);
  }

  _air(h) {
    let P = this.air;
    const dB = this.brake - this._prevBrake;
    if (dB > 0) P -= 0.2 * dB;
    this._prevBrake = this.brake;
    P -= (0.0006 + 0.0012 * smoothstep(1, 20, Math.abs(this.v))) * h;    // leaks + levelling valves
    if (!this.compressor && P < VEH.airCutIn && this.running) { this.compressor = true; this.emit('trip:compressor', { on: true }); }
    if (this.compressor) {
      if (!this.running) { this.compressor = false; this.emit('trip:compressor', { on: false }); }
      else {
        P += 0.05 * clamp(this.rpm / 1400, 0.45, 1.4) * h;
        if (P >= VEH.airCutOut) { P = VEH.airCutOut; this.compressor = false; this.emit('trip:compressor', { on: false }); this.emit('trip:airDryer', { purge: true }); }
      }
    }
    this.air = clamp(P, 0, VEH.airMax);
  }
  useAir(bar) { this.air = Math.max(0, this.air - bar); }
}

// =============================================================================
// Air-suspension body motion relative to the chassis (road plane).
// =============================================================================
export class Suspension {
  constructor() {
    this.heave = { x: 0, v: 0, a: 0 };
    this.pitch = { x: 0, v: 0, a: 0 };   // rad, + = nose up
    this.roll = { x: 0, v: 0, a: 0 };    // rad, + = right side down
    this.prev = { h: 0, p: 0, r: 0, init: false };
  }
  reset(eqH = 0, eqP = 0, eqR = 0) {
    this.heave.x = eqH; this.pitch.x = eqP; this.roll.x = eqR;
    this.heave.v = this.pitch.v = this.roll.v = 0;
    this.prev.init = false;
  }
  /**
   * inp: { aLong, aLat, kneel, roadH, roadP, roadR }  (road inputs: heave m, pitch rad, roll rad)
   */
  step(h, inp) {
    const pr = this.prev;
    if (!pr.init) { pr.h = inp.roadH; pr.p = inp.roadP; pr.r = inp.roadR; pr.init = true; }
    const dH = (inp.roadH - pr.h) / h, dP = (inp.roadP - pr.p) / h, dR = (inp.roadR - pr.r) / h;
    pr.h = inp.roadH; pr.p = inp.roadP; pr.r = inp.roadR;
    const kn = inp.kneel;
    const kneelRoll = Math.atan(VEH.kneelDrop / VEH.track) * kn;
    // load transfer: braking dips the nose (≈0.45°/(m/s²)), cornering rolls outward (≈1.3°/(m/s²))
    const eqP = inp.roadP + 0.0078 * clamp(inp.aLong, -4, 3) - 0.0035 * kn;
    const eqR = inp.roadR - 0.0228 * clamp(inp.aLat, -4, 4) + kneelRoll;
    const eqH = inp.roadH - VEH.kneelDrop * 0.5 * kn - 0.004 * Math.abs(inp.aLat);
    spring(this.heave, eqH, dH, h, 2 * Math.PI * 1.25, 0.28);
    spring(this.pitch, eqP, dP, h, 2 * Math.PI * 1.1, 0.32);
    spring(this.roll, eqR, dR, h, 2 * Math.PI * 0.88, 0.3);
  }
  /** Impulse from a road event at axle z (bus-local) on side (-1 left, 0 both, +1 right), intensity I. */
  kick(axleZ, side, I) {
    const arm = -axleZ / 3.2;                  // front axle -> nose up first
    this.heave.v += 0.07 * I;
    this.pitch.v += 0.03 * I * clamp(arm, -1.3, 1.3);
    this.roll.v += -side * 0.055 * I;
  }
}
