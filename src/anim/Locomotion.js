import * as THREE from 'three';
import { V3, Q, clamp, lerp, smoothstep, deg, wrapAngle, damp, hermiteStep } from './math.js';
import { SIDES } from './Rig.js';

/**
 * Biomechanical gait engine.
 *
 * - The body's centre of mass (root) moves with momentum: acceleration and
 *   deceleration are limited, heading turns at human rates.
 * - A gait phase drives alternating steps.  Each swing foot continuously
 *   re-plans where it will land from the *predicted* body position at heel
 *   strike, so starts, stops, turns and speed changes produce correct steps.
 * - Stance feet are locked to the floor (zero sliding) and roll heel → flat →
 *   ball → toe.  Swing feet follow smooth Hermite trajectories with toe
 *   clearance.
 * - Pelvis height emerges from the supporting legs (inverted pendulum with
 *   loading-response knee flexion), lateral shift follows the loaded foot, and
 *   pelvic rotation / obliquity / tilt follow clinical gait curves.
 */

export const BASE_GAIT = {
  stepWidth: 0.105,        // lateral distance between ankle centres (m)
  standWidth: 0.15,
  toeOut: 7 * deg,
  standToeOut: 9 * deg,
  hsAngle: 17 * deg,       // foot pitch (toes up) at heel strike, at 1.3 m/s
  toAngle: 50 * deg,       // foot pitch (heel up) at toe off
  toeMax: 40 * deg,        // max MTP dorsiflexion before pivoting on the toe tip
  strideScale: 1.0,
  cadenceScale: 1.0,
  liftHeight: 0.05,
  clearance: 0.016,
  pelvisYaw: 5.5 * deg,
  pelvisRoll: 4.5 * deg,
  pelvisTilt: 1.6 * deg,
  tiltBase: 3.0 * deg,
  lateralShift: 0.55,
  armSwing: 1.0,
  loadingFlex: 15 * deg,
  midFlex: 5 * deg,
  footFlatAt: 0.17,
  heelOffAt: 0.56,
  heel: 0, sole: 0,         // shoe heel height / forefoot sole thickness (m)
  bounce: 1.0,
  trunkUpright: 0,
  maxSpeed: 1.9,
};

const UP = V3(0, 1, 0);

function fwdOf(yaw, out = V3()) { return out.set(Math.sin(yaw), 0, Math.cos(yaw)); }
function leftOf(yaw, out = V3()) { return out.set(Math.cos(yaw), 0, -Math.sin(yaw)); }

export class Locomotion {
  constructor(rig) {
    this.rig = rig;
    this.pos = V3();          // centre-of-mass ground projection (world)
    this.heading = 0;
    this.vel = V3();
    this.speed = 0;
    this.angVel = 0;
    this.accel = V3();
    this.desiredVel = V3();
    this.desiredSpeed = 0;
    this.phase = 0;
    this.rate = 0;
    this.active = false;
    this.time = 0;
    this.gait = { ...BASE_GAIT };
    this.targetGait = { ...BASE_GAIT };
    this.events = [];

    this.feet = {};
    for (const s of SIDES) {
      const sign = s === 'l' ? 1 : -1;
      this.feet[s] = {
        side: s, sign, off: s === 'l' ? 0 : 0.5,
        stance: true,
        plantP: V3(sign * this.gait.standWidth / 2, 0, 0), plantYaw: sign * this.gait.standToeOut,
        hsAlpha: 0, alpha: 0, toeBend: 0, toAlphaAmp: 0,
        swingP: V3(), swingV: V3(), swingYaw0: 0, alphaTO: 0,
        targetP: V3(), targetYaw: 0, hsTarget: 0,
        ankle: V3(), prevAnkle: V3(), ankleVel: V3(), footQ: Q(),
        load: 0.5, u: 0, s: 0, idleLift: 0,
      };
    }
    this.pelvis = { y: rig.restModel.pelvis.y, yv: { v: 0 }, lat: 0, latv: { v: 0 }, fwd: 0, fwdv: { v: 0 } };
    this.hipDrop = rig.restModel.pelvis.y - rig.restModel.thigh_l.y;
    this.hipHalf = Math.abs(rig.restModel.thigh_l.x);
    this.idleShift = 0;      // −1 … 1 weight on right … left (idle contrapposto)
    this.firstSwing = null;
    this.lastStepTime = 0;
  }

  /** Place the character standing at p facing yaw. */
  teleport(p, yaw) {
    this.pos.copy(p); this.heading = yaw; this.vel.set(0, 0, 0);
    for (const f of Object.values(this.feet)) {
      this._standTarget(f, this.pos, this.heading, f.plantP);
      f.plantYaw = this.heading + f.sign * this.gait.standToeOut;
      f.stance = true; f.alpha = 0; f.hsAlpha = 0;
    }
    this.active = false;
  }

  _standTarget(f, p, yaw, out) {
    const l = leftOf(yaw);
    return out.copy(p).addScaledVector(l, f.sign * this.gait.standWidth / 2)
      .addScaledVector(fwdOf(yaw), f.sign * this.idleShift * 0 + (f === this._freeFoot ? 0.03 : 0));
  }

  cadence(v) {
    // steps per minute; women ~5% higher cadence than men at equal speed
    const c = 72 + 34 * clamp(v, 0, 2.2);
    return c * this.gait.cadenceScale;
  }

  duty(v) { return clamp(0.655 - 0.04 * (v - 0.8), 0.585, 0.67); }

  // ------------------------------------------------------------------ root motion
  _updateRoot(dt, input) {
    const g = this.gait;
    const wantSpeed = Math.min(input.speed, g.maxSpeed) * g.strideScale ** 0.5;
    const hasDir = input.dir.lengthSq() > 1e-6 && wantSpeed > 0.01;
    let targetHeading = this.heading;
    if (hasDir) targetHeading = Math.atan2(input.dir.x, input.dir.z);
    if (input.face !== undefined && input.face !== null) targetHeading = input.face;
    const err = wrapAngle(targetHeading - this.heading);
    const moving = this.speed > 0.25;
    const maxTurn = moving ? 2.6 : input.urgent ? 4.2 : 2.0;
    const desiredAng = clamp(err * (moving ? 3.2 : 4.0), -maxTurn, maxTurn);
    this.angVel = damp(this.angVel, desiredAng, this._angState ||= { v: 0 }, 0.14, dt);
    this.heading = wrapAngle(this.heading + this.angVel * dt);

    // walk where she faces; slow down for sharp turns
    const align = hasDir ? Math.max(0, Math.cos(wrapAngle(targetHeading - this.heading))) : 0;
    const spd = hasDir ? wantSpeed * align ** 2 : 0;
    this.desiredSpeed = spd;
    fwdOf(this.heading, this.desiredVel).multiplyScalar(spd);

    const dv = V3().subVectors(this.desiredVel, this.vel);
    const speeding = this.desiredVel.length() > this.vel.length();
    const maxA = speeding ? 1.25 + 0.4 * this.speed : 2.3;
    const k = speeding ? 2.6 : 4.2;
    const a = dv.multiplyScalar(k);
    if (a.length() > maxA) a.setLength(maxA);
    // first steps from rest are slower (needs a weight shift)
    if (!this.active) a.multiplyScalar(0.35);
    this.accel.lerp(a, 1 - Math.exp(-dt / 0.08));
    this.vel.addScaledVector(this.accel, dt);
    // velocity direction follows heading (no moon-walking sideways)
    const sp = this.vel.length();
    if (sp > 1e-4) {
      const curYaw = Math.atan2(this.vel.x, this.vel.z);
      const yawErr = wrapAngle(this.heading - curYaw);
      const ny = curYaw + yawErr * (1 - Math.exp(-dt / 0.12));
      this.vel.set(Math.sin(ny) * sp, 0, Math.cos(ny) * sp);
    }
    if (!hasDir && sp < 0.02) this.vel.set(0, 0, 0);
    this.speed = this.vel.length();
    this.pos.addScaledVector(this.vel, dt);
    if (!this.active && !hasDir) {
      // standing: the centre of mass settles over the base of support
      const fl = this.feet.l.plantP, fr = this.feet.r.plantP;
      const cx = (fl.x + fr.x) * 0.5, cz = (fl.z + fr.z) * 0.5;
      const k = 1 - Math.exp(-dt / 0.5);
      this.pos.x += (cx - this.pos.x) * k;
      this.pos.z += (cz - this.pos.z) * k;
    }
  }

  /** Predicted root position/heading `t` seconds ahead. */
  _predict(t, outP) {
    const sp0 = this.speed;
    const target = this.desiredSpeed;
    const acc = target > sp0 ? 1.25 : 2.3;
    const tReach = Math.abs(target - sp0) / acc;
    let dist;
    if (t <= tReach) dist = sp0 * t + 0.5 * Math.sign(target - sp0) * acc * t * t;
    else dist = (sp0 + target) * 0.5 * tReach + target * (t - tReach);
    const yaw = this.heading + clamp(this.angVel * t, -1.2, 1.2) * 0.5;
    outP.copy(this.pos).addScaledVector(fwdOf(this.heading + clamp(this.angVel * t, -1.2, 1.2) * 0.25), dist);
    const vEnd = Math.max(0, t <= tReach ? sp0 + Math.sign(target - sp0) * acc * t : target);
    return { yaw: this.heading + clamp(this.angVel * t, -1.4, 1.4), vEnd, yawMid: yaw };
  }

  // ------------------------------------------------------------------ foot geometry
  /** World ankle position + foot orientation for a plant frame and roll. */
  footPose(side, plantP, plantYaw, alpha, outAnkle, outQ) {
    const L = this.rig.leg[side];
    const g = this.gait;
    const H = g.heel, S = g.sole;
    const bz = L.b.z, hz = L.h.z;
    // shoe "flat" pitch: the heel is raised by (heel - sole) about the ball
    const theta = Math.asin(clamp((H - S) / (bz - hz), 0, 0.95));
    // rotation about the lateral (X) axis through (cy, cz); positive = heel up
    const rotX = (y, z, ang, cy, cz) => {
      const c = Math.cos(ang), s = Math.sin(ang);
      const yy = y - cy, zz = z - cz;
      return [cy + yy * c - zz * s, cz + yy * s + zz * c];
    };
    let [ay, az] = rotX(L.a.y, L.a.z, theta, 0, bz);
    ay += S;
    const heelC = rotX(0, hz, theta, 0, bz)[1];   // heel tip contact (z) in shoe frame
    let toeBend = theta;
    if (alpha < 0) {
      [ay, az] = rotX(ay, az, alpha, 0, heelC);
    } else if (alpha > 0) {
      const tm = Math.max(0, g.toeMax);
      const a1 = Math.min(alpha, tm);
      [ay, az] = rotX(ay, az, a1, 0, bz);
      toeBend += a1;
      if (alpha > tm) [ay, az] = rotX(ay, az, alpha - tm, 0, L.t.z);
    }
    const c = Math.cos(plantYaw), s = Math.sin(plantYaw);
    const lx = L.a.x;
    outAnkle.set(plantP.x + lx * c + az * s, ay, plantP.z - lx * s + az * c);
    _qy.setFromAxisAngle(UP, plantYaw);
    _qx.setFromAxisAngle(_X, theta + alpha);
    outQ.copy(_qy).multiply(_qx);
    return toeBend;
  }

  /** Toe tip and heel heights for clearance tests. */
  _footExtremes(side, ankle, q) {
    const L = this.rig.leg[side];
    _t1.set(L.t.x - L.a.x, -L.a.y, L.toeTip - L.a.z).applyQuaternion(q).add(ankle);
    _t2.set(0, -L.a.y, L.heelBack - L.a.z).applyQuaternion(q).add(ankle);
    return [_t1.y - this.gait.sole, _t2.y - this.gait.heel];
  }

  // ------------------------------------------------------------------ main update
  update(dt, input) {
    this.time += dt;
    this.events.length = 0;
    // smooth gait-style transitions (e.g. changing shoes mid-walk)
    for (const k in this.targetGait) {
      const t = this.targetGait[k];
      if (typeof t === 'number') this.gait[k] = lerp(this.gait[k], t, 1 - Math.exp(-dt / 0.35));
    }
    const g = this.gait;
    this._updateRoot(dt, input);

    const fwd = fwdOf(this.heading), left = leftOf(this.heading);
    const v = this.speed;
    const vRef = Math.max(v, this.desiredSpeed);
    const beta = this.duty(vRef);
    this.beta = beta;

    // ---- decide whether the gait runs
    const need = this._stepNeed();
    if (!this.active) {
      if (this.desiredSpeed > 0.05 || need.err > (input.urgent ? 0.7 : 1.6)) this._startGait(need);
    }

    const prevPhase = this.phase;
    if (this.active) {
      const cad = this.desiredSpeed > 0.05 || v > 0.15 ? this.cadence(vRef) : 92 * g.cadenceScale;
      this.rate = cad / 120;
      this.phase += this.rate * dt;
      if (this.phase >= 1) this.phase -= 1;
    } else {
      this.rate = 0;
    }

    const stepLen = Math.max(vRef, 0.0) / Math.max(this.cadence(vRef) / 60, 0.5);
    this.stepLen = stepLen;
    const sp = clamp(vRef / 1.3, 0, 1.5);

    for (const s of SIDES) {
      const f = this.feet[s];
      f.prevAnkle.copy(f.ankle);
      if (!this.active) {
        f.stance = true;
        f.u = 0.5;
        // idle: the unloaded leg may lift its heel a little (relaxed knee)
        f.alpha = damp(f.alpha, f.idleLift, f._ia ||= { v: 0 }, 0.35, dt);
        f.toeBend = this.footPose(s, f.plantP, f.plantYaw, f.alpha, f.ankle, f.footQ);
        continue;
      }
      const psi = ((this.phase - f.off) % 1 + 1) % 1;
      const prevPsi = ((prevPhase - f.off) % 1 + 1) % 1;
      const wasStance = f.stance;
      // ---- events
      if (wasStance && psi >= beta && prevPsi < beta) this._toeOff(f);
      if (!wasStance && psi < prevPsi) this._heelStrike(f);

      if (f.stance) {
        const u = clamp(psi / beta, 0, 1);
        f.u = u;
        // roll: heel rocker -> flat -> forefoot rocker
        let a = 0;
        if (u < g.footFlatAt) {
          const x = u / g.footFlatAt;
          a = -f.hsAlpha * (1 - x) * (1 - x) * (1 + 0.6 * x);
        } else if (u > g.heelOffAt) {
          // amplitude grows with how far behind the body the foot is
          const rel = _t3.subVectors(f.plantP, this.pos).dot(fwd);
          const behind = clamp(-rel / Math.max(0.42 * Math.max(stepLen, 0.25), 0.1), 0, 1.15);
          f.toAlphaAmp = lerp(f.toAlphaAmp, behind, 1 - Math.exp(-dt / 0.06));
          const x = (u - g.heelOffAt) / (1 - g.heelOffAt);
          a = g.toAngle * clamp(0.45 + 0.6 * sp, 0.4, 1.1) * f.toAlphaAmp * Math.pow(x, 1.7);
        }
        f.alpha = a;
        f.toeBend = this.footPose(s, f.plantP, f.plantYaw, a, f.ankle, f.footQ);
      } else {
        // ---- swing
        const sw = clamp((psi - beta) / (1 - beta), 0, 1);
        f.s = sw;
        const remaining = (1 - psi) / Math.max(this.rate, 1e-3);
        if (sw < 0.82) this._planLanding(f, remaining, stepLen);
        // landing configuration
        const A1 = _t4;
        const qTmp = _q1;
        this.footPose(s, f.targetP, f.targetYaw, -f.hsTarget, A1, qTmp);
        const V1 = _t5.copy(fwd).multiplyScalar(0.12 * v).addScaledVector(UP, -0.06 * sp);
        hermiteStep(f.swingP, f.swingV, A1, V1, remaining, dt, f.swingP, f.swingV);
        // pitch through swing
        let a;
        if (sw < 0.5) a = f.alphaTO * (1 - smoothstep(0, 0.55, sw)) * (1 + 0.15 * Math.sin(Math.PI * sw * 2));
        else a = -f.hsTarget * smoothstep(0.45, 1.0, sw);
        f.alpha = a;
        const yaw = f.swingYaw0 + wrapAngle(f.targetYaw - f.swingYaw0) * smoothstep(0.05, 0.85, sw);
        _q1.setFromAxisAngle(UP, yaw);
        // foot orientation from pitch (shoe flat angle included)
        const L = this.rig.leg[s];
        const theta = Math.asin(clamp((g.heel - g.sole) / (L.b.z - L.h.z), 0, 0.95));
        _q2.setFromAxisAngle(_X, theta + a);
        f.footQ.copy(_q1).multiply(_q2);
        // toes relax back to neutral early in swing
        f.toeBend = theta + Math.max(0, a) * (1 - smoothstep(0, 0.35, sw)) * 0.6 + 4 * deg * Math.sin(Math.PI * sw);
        f.ankle.copy(f.swingP);
        // lift for toe clearance (biased early: knee flexion peak at ~70% of the cycle)
        const lift = g.liftHeight * clamp(0.4 + 0.7 * sp, 0.3, 1.2) * Math.sin(Math.PI * Math.pow(sw, 0.8));
        f.ankle.y += lift;
        const [toeY, heelY] = this._footExtremes(s, f.ankle, f.footQ);
        const clr = g.clearance * Math.sin(Math.PI * sw);
        const low = Math.min(toeY, heelY);
        if (low < clr) f.ankle.y += clr - low;
      }
      f.ankleVel.subVectors(f.ankle, f.prevAnkle).divideScalar(Math.max(dt, 1e-4));
    }

    // ---- loads (for pelvis height & lateral shift)
    for (const s of SIDES) {
      const f = this.feet[s];
      if (!this.active) {
        const target = 0.5 + 0.5 * f.sign * this.idleShift;
        f.load = damp(f.load, target, f._ls ||= { v: 0 }, 0.25, dt);
      } else if (f.stance) {
        const u = f.u;
        f.load = u < 0.18 ? smoothstep(0, 0.18, u) : u > 0.8 ? 1 - smoothstep(0.8, 1.0, u) : 1;
      } else f.load = 0;
    }

    this._updatePelvis(dt, fwd, left, sp);

    // ---- stop when settled
    if (this.active && this.events.includes('hs') && this.desiredSpeed < 0.05 && this.speed < 0.18) {
      const n = this._stepNeed();
      if (n.err < 1.0) {
        this.active = false;
        this.vel.multiplyScalar(0.5);
        this.events.push('stop');
      }
    }
  }

  _stepNeed() {
    // how far each foot is from its comfortable standing placement (normalised)
    let err = 0, worst = null;
    for (const f of Object.values(this.feet)) {
      const p = this._standTarget(f, this.pos, this.heading, _t6);
      const dp = p.distanceTo(f.plantP) / 0.075;
      const dy = Math.abs(wrapAngle(this.heading + f.sign * this.gait.standToeOut - f.plantYaw)) / (24 * deg);
      const e = Math.max(dp, dy);
      if (e > err) { err = e; worst = f; }
    }
    return { err, worst };
  }

  _startGait(need) {
    // the foot that steps first: the unloaded one, or the one furthest from its target
    let first;
    if (this.desiredSpeed > 0.05) {
      first = this.feet.l.load < this.feet.r.load ? this.feet.l : this.feet.r;
      if (Math.abs(this.feet.l.load - this.feet.r.load) < 0.1) {
        // turning: step with the foot on the inside of the turn first
        const turn = wrapAngle(Math.atan2(this.desiredVel.x, this.desiredVel.z) - this.heading);
        first = Math.abs(turn) > 0.3 ? (turn > 0 ? this.feet.l : this.feet.r) : this.feet.r;
      }
    } else first = need.worst || this.feet.r;
    const beta = this.duty(Math.max(this.speed, this.desiredSpeed));
    this.phase = ((first.off + beta - 0.06) % 1 + 1) % 1;
    for (const f of Object.values(this.feet)) {
      f.stance = true; f.hsAlpha = 0; f.toAlphaAmp = 0;
    }
    this.active = true;
    this.events.push('start');
  }

  _toeOff(f) {
    f.stance = false;
    // natural stride-to-stride variability (~2% length, ~1 cm width, ~1.5° toe-out)
    const r = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    f.var = { len: 1 + 0.022 * r(), wid: 0.008 * r(), yaw: 0.025 * r() };
    f.swingP.copy(f.ankle);
    f.swingV.copy(f.ankleVel);
    if (f.swingV.length() > 1.5) f.swingV.setLength(1.5);
    f.swingYaw0 = f.plantYaw;
    f.alphaTO = f.alpha;
    f.targetP.copy(f.plantP);
    f.targetYaw = f.plantYaw;
    this.events.push('to_' + f.side);
  }

  _heelStrike(f) {
    f.stance = true;
    f.plantP.copy(f.targetP);
    f.plantYaw = f.targetYaw;
    f.hsAlpha = f.hsTarget;
    f.toAlphaAmp = 0;
    this.events.push('hs', 'hs_' + f.side);
    this.lastStepTime = this.time;
  }

  _planLanding(f, remaining, stepLen) {
    const g = this.gait;
    const pred = this._predict(remaining, _t7);
    const yaw = pred.yaw;
    const fw = fwdOf(yaw, _t8), lf = leftOf(yaw, _t9);
    const vEnd = pred.vEnd;
    const L = vEnd / Math.max(this.cadence(vEnd) / 60, 0.5);
    const walking = clamp((vEnd - 0.08) / 0.35, 0, 1);
    const width = lerp(g.standWidth, g.stepWidth, walking);
    const toeOut = lerp(g.standToeOut, g.toeOut, walking);
    const v = f.var || { len: 1, wid: 0, yaw: 0 };
    const ahead = 0.55 * L * v.len;
    const tp = _t10.copy(_t7).addScaledVector(fw, ahead).addScaledVector(lf, f.sign * (width / 2 + v.wid * walking));
    // smooth target changes to avoid jitter
    if (f.s < 0.02) f.targetP.copy(tp); else f.targetP.lerp(tp, 0.35);
    f.targetYaw = yaw + f.sign * (toeOut + v.yaw * walking);
    // heel-strike angle only when actually stepping forward
    const sp = clamp(vEnd / 1.3, 0, 1.4);
    f.hsTarget = g.hsAngle * clamp(0.35 + 0.65 * sp, 0, 1.15) * smoothstep(0.03, 0.18, ahead);
  }

  _updatePelvis(dt, fwd, left, sp) {
    const g = this.gait;
    const rig = this.rig;
    // ---- height from supporting legs
    let sumW = 0, sumH = 0, cap = Infinity;
    const hipY0 = this.pelvis.y - this.hipDrop;
    for (const s of SIDES) {
      const f = this.feet[s];
      const L = rig.leg[s];
      const hip = _t11.copy(this.pos).addScaledVector(left, f.sign * this.hipHalf + this.pelvis.lat).addScaledVector(fwd, this.pelvis.fwd);
      const dx = f.ankle.x - hip.x, dz = f.ankle.z - hip.z;
      const dh2 = dx * dx + dz * dz;
      if (f.stance) {
        let kneeFlex = g.midFlex;
        if (this.active) {
          const u = f.u;
          if (u < 0.45) kneeFlex = lerp(g.midFlex, g.loadingFlex, Math.sin(Math.PI * clamp(u / 0.45, 0, 1)) * clamp(f.hsAlpha / (8 * deg), 0.3, 1));
          else kneeFlex = lerp(g.midFlex, g.midFlex * 0.5, smoothstep(0.45, 0.8, u));
        } else {
          // idle: loaded leg straighter, free leg relaxed
          kneeFlex = lerp(11 * deg, 2.5 * deg, f.load);
        }
        const Le = Math.sqrt(L.l1 * L.l1 + L.l2 * L.l2 + 2 * L.l1 * L.l2 * Math.cos(kneeFlex));
        const h = f.ankle.y + Math.sqrt(Math.max(0, Le * Le - dh2));
        const w = Math.max(f.load, 1e-3);
        sumW += w; sumH += h * w;
        // the leading/loaded leg must be able to reach the floor
        if (!this.active || f.u < 0.5) {
          const Lm = L.len * 0.9975;
          cap = Math.min(cap, f.ankle.y + Math.sqrt(Math.max(0, Lm * Lm - dh2)));
        }
      }
    }
    let hipTarget = sumW > 0 ? sumH / sumW : hipY0;
    // soft-min with reach cap
    if (cap < Infinity) {
      // polynomial smooth-min: only bites when the reach limit is (nearly) active
      const k = 0.004;
      const h = Math.max(k - Math.abs(hipTarget - cap), 0) / k;
      hipTarget = Math.min(hipTarget, cap) - h * h * k * 0.25;
    }
    // vertical oscillation amount style factor (heels: flatter)
    const base = this._hipStand ?? hipTarget;
    this._hipStand = lerp(base, hipTarget, 1 - Math.exp(-dt / 0.6));
    hipTarget = this._hipStand + (hipTarget - this._hipStand) * g.bounce;
    const py = damp(this.pelvis.y, hipTarget + this.hipDrop, this.pelvis.yv, 0.045, dt);
    this.pelvis.y = py;

    // ---- lateral shift over the loaded foot
    let latT = 0, wsum = 0;
    for (const s of SIDES) {
      const f = this.feet[s];
      const rel = _t12.subVectors(f.plantP, this.pos).dot(left);
      latT += f.load * rel; wsum += f.load;
    }
    latT = wsum > 0 ? latT / wsum : 0;
    const shift = this.active ? g.lateralShift * clamp(1.1 - 0.25 * sp, 0.6, 1.1) : 0.62;
    this.pelvis.lat = damp(this.pelvis.lat, latT * shift, this.pelvis.latv, this.active ? 0.11 : 0.35, dt);
    // small fore-aft surge: slowest at mid-stance (top of the arc)
    const ph = this.phase;
    const surge = this.active ? -0.007 * sp * Math.sin(4 * Math.PI * (ph - 0.3)) : 0;
    this.pelvis.fwd = damp(this.pelvis.fwd, surge, this.pelvis.fwdv, 0.05, dt);
  }
}

const _X = V3(1, 0, 0);
const _qy = Q(), _qx = Q(), _q1 = Q(), _q2 = Q();
const _t1 = V3(), _t2 = V3(), _t3 = V3(), _t4 = V3(), _t5 = V3(), _t6 = V3(), _t7 = V3(), _t8 = V3(), _t9 = V3(), _t10 = V3(), _t11 = V3(), _t12 = V3();
void THREE;
