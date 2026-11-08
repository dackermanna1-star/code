import * as THREE from 'three';
import { V3, Q, clamp, lerp, smoothstep, deg, wrapAngle, damp, Spring, basisQuat, fbm1, noise1 } from './math.js';
import { SIDES, X, Y, Z } from './Rig.js';

const _q = Q(), _q2 = Q(), _q3 = Q(), _v = V3(), _v2 = V3(), _v3 = V3();
const _e = new THREE.Euler();

function qYawRollPitch(yaw, roll, pitch, out = Q()) {
  // yaw about Y, then roll about Z (forward), then pitch about X
  _e.set(pitch, yaw, roll, 'YZX');
  return out.setFromEuler(_e);
}

/**
 * Everything above the legs: pelvis rotations, spine counter-rotation and
 * lean, breathing, arm swing pendulums, relaxed hands, head stabilisation and
 * gaze, blinking, idle weight shifts and micro-movements.
 */
export class BodyLayer {
  constructor(rig, loco, character) {
    this.rig = rig;
    this.loco = loco;
    this.c = character;
    this.t = 0;
    this.activity = 0;           // 0 idle … 1 walking (smoothed)
    this.actState = { v: 0 };
    // secondary motion springs
    this.leanFwd = new Spring(1.1, 0.75);
    this.leanSide = new Spring(1.0, 0.8);
    this.armSpring = { l: new Spring(2.4, 0.62), r: new Spring(2.4, 0.62) };
    this.armAbd = { l: new Spring(1.6, 0.6), r: new Spring(1.6, 0.6) };
    this.elbow = { l: new Spring(1.8, 0.55, 14 * deg), r: new Spring(1.8, 0.55, 14 * deg) };
    this.wristLag = { l: new Spring(2.4, 0.35), r: new Spring(2.4, 0.35) };
    this.headNod = new Spring(3.0, 0.45);
    this.breastSpring = new Spring(2.6, 0.18);
    this.breastV = 0;
    this.prevPelvisY = null;
    this.pelvisVY = 0;
    // gaze / idle
    this.look = { yaw: 0, pitch: 0, ty: 0, tp: 0, next: 1.5 };
    this.lookYawS = { v: 0 }; this.lookPitchS = { v: 0 };
    this.headYaw = 0; this.headPitch = 0;
    this.eye = { yaw: 0, pitch: 0, ty: 0, tp: 0, next: 0.5 };
    this.blink = { t: 0, next: 2.0, dur: 0.16, value: 0 };
    this.breath = 0;
    this.breathRate = 0.25;      // Hz
    this.exertion = 0;
    this.idle = { shiftTarget: 0.35, next: 4, freeLift: 0 };
    this.smile = 0;
  }

  update(dt, input, gaitMods) {
    const L = this.loco, R = this.rig, g = L.gait;
    this.t += dt;
    const walking = L.active ? clamp(L.speed / 0.6, 0, 1) : 0;
    this.activity = damp(this.activity, L.active ? Math.max(walking, 0.25) : 0, this.actState, 0.25, dt);
    const act = this.activity;
    const sp = clamp(L.speed / 1.3, 0, 1.5);
    const ph = L.phase;
    const TAU = Math.PI * 2;

    // ------------------------------------------------ idle behaviour
    this._idle(dt);

    // ------------------------------------------------ pelvis orientation (model space)
    const yawAmp = g.pelvisYaw * clamp(0.35 + 0.65 * sp, 0, 1.3) * act;
    const rollAmp = g.pelvisRoll * clamp(0.5 + 0.5 * sp, 0, 1.2) * act;
    const tiltAmp = g.pelvisTilt * sp * act;
    let pYaw = -yawAmp * Math.cos(TAU * ph);
    let pRoll = rollAmp * Math.cos(TAU * (ph - 0.1));
    let pTilt = g.tiltBase + tiltAmp * Math.cos(2 * TAU * (ph - 0.42));
    // standing: hip hikes on the loaded side, pelvis faces between the feet
    const idleW = 1 - act;
    const fl = L.feet.l, fr = L.feet.r;
    pRoll += idleW * L.idleShift * 3.2 * deg;
    const feetYaw = wrapAngle(((fl.plantYaw - g.standToeOut) + (fr.plantYaw + g.standToeOut)) * 0.5 - L.heading);
    pYaw += idleW * clamp(feetYaw, -0.5, 0.5) * 0.6 - idleW * L.idleShift * 2.5 * deg;
    // micro sway while standing
    pRoll += idleW * fbm1(this.t * 0.31, 1) * 0.6 * deg;
    pYaw += idleW * fbm1(this.t * 0.23, 2) * 1.2 * deg;
    this.pelvisAngles = { yaw: pYaw, roll: pRoll, tilt: pTilt };

    // ------------------------------------------------ trunk lean (momentum & turns)
    const accF = L.accel.dot(_v.set(Math.sin(L.heading), 0, Math.cos(L.heading)));
    const leanTarget = (1.5 + 2.2 * sp) * deg * act + clamp(accF / 9.81, -0.15, 0.15) * 0.9 - g.trunkUpright * deg;
    const leanF = this.leanFwd.update(leanTarget, dt);
    const centripetal = L.speed * L.angVel;
    const leanS = this.leanSide.update(clamp(-centripetal / 9.81, -0.2, 0.2) * 0.7, dt);

    // breathing
    const bRate = lerp(0.24, 0.42, this.exertion);
    this.breath += dt * bRate * TAU;
    this.exertion = damp(this.exertion, clamp(L.speed / 1.6, 0, 1), this._ex ||= { v: 0 }, L.speed > 0.3 ? 8 : 20, dt);
    const breathS = Math.sin(this.breath);
    const breathIn = 0.5 + 0.5 * breathS;

    // ------------------------------------------------ write pelvis
    const pelvisQ = qYawRollPitch(pYaw, pRoll + leanS * 0.3, pTilt, _q);
    R.setQ('pelvis', pelvisQ);
    R.setQ('Root', _q2.identity());
    R.pelvisPos.set(L.pelvis.lat, L.pelvis.y, L.pelvis.fwd);
    // pelvis lateral position in model space is relative to the root path
    this.pelvisQ = pelvisQ.clone();

    // ------------------------------------------------ thorax (counter-rotation)
    const thYaw = -0.75 * pYaw * act + idleW * (-0.35 * pYaw) + this.headYaw * 0.12;
    const thRoll = -0.65 * pRoll + leanS + idleW * (-L.idleShift * 1.8 * deg);
    const thPitch = leanF - (pTilt - g.tiltBase) * 0.8 - g.tiltBase * 0.7 - breathIn * 1.1 * deg - g.trunkUpright * 0.6 * deg;
    const thoraxQ = qYawRollPitch(thYaw, thRoll, thPitch, _q2);
    // distribute along the spine
    const s1 = pelvisQ.clone().slerp(thoraxQ, 0.3);
    const s2 = pelvisQ.clone().slerp(thoraxQ, 0.62);
    const s3 = thoraxQ.clone();
    R.setQ('spine_01', s1); R.setQ('spine_02', s2); R.setQ('spine_03', s3);

    // breasts: subtle inertial bounce from vertical pelvis acceleration
    const py = L.pelvis.y;
    if (this.prevPelvisY !== null) {
      const vy = (py - this.prevPelvisY) / Math.max(dt, 1e-4);
      const ay = (vy - this.pelvisVY) / Math.max(dt, 1e-4);
      this.pelvisVY = vy;
      const b = this.breastSpring.update(clamp(-ay * 0.0016, -0.04, 0.04), dt);
      this.breastV = b;
    }
    this.prevPelvisY = py;
    for (const s of SIDES) {
      _q3.setFromAxisAngle(X, this.breastV * 0.9);
      R.setQ('breast_' + s, s3.clone().multiply(_q3));
      this.breastLocal = _q3.clone();
    }

    // ------------------------------------------------ head & neck: stabilised gaze
    this._gaze(dt, input);
    const headYaw = this.headYaw;
    const nod = this.headNod.update(-(py - (this._pyAvg ?? py)) * 2.2, dt);
    this._pyAvg = lerp(this._pyAvg ?? py, py, 1 - Math.exp(-dt / 0.5));
    const headPitch = this.headPitch + nod + 1.5 * deg * act - 2 * deg;
    // head stays nearly level: cancel most of thorax roll
    const headQ = qYawRollPitch(headYaw + pYaw * 0.15 * act, -thRoll * 0.15 + leanS * 0.4, headPitch, _q3);
    const neckQ = s3.clone().slerp(headQ, 0.45);
    // breathing lifts the chin a touch
    R.setQ('neck_01', neckQ);
    R.setQ('head', headQ.clone());

    // ------------------------------------------------ arms
    this._arms(dt, s3, act, sp, ph, breathIn, gaitMods);

    // ------------------------------------------------ eyes & face
    this._eyes(dt);
    this.c.setMorph('smile', this.smile);
  }

  _idle(dt) {
    const L = this.loco;
    const id = this.idle;
    if (L.active) {
      id.next = Math.max(id.next, 2.5 + Math.random() * 3);
      L.idleShift = damp(L.idleShift, 0, id._s ||= { v: 0 }, 0.4, dt);
      for (const f of Object.values(L.feet)) f.idleLift = 0;
      return;
    }
    id.next -= dt;
    if (id.next <= 0) {
      // alternate weight shifts (contrapposto), varying how relaxed she stands
      const prev = id.shiftTarget;
      id.shiftTarget = (prev > 0 ? -1 : 1) * (0.45 + Math.random() * 0.5);
      if (Math.random() < 0.18) id.shiftTarget = (Math.random() - 0.5) * 0.25; // neutral stance
      id.next = 4.5 + Math.random() * 7;
    }
    // smooth, slightly slow weight transfer
    L.idleShift = damp(L.idleShift, id.shiftTarget, id._s ||= { v: 0 }, 0.75, dt);
    const free = L.idleShift > 0 ? L.feet.r : L.feet.l;
    const loaded = free === L.feet.r ? L.feet.l : L.feet.r;
    const relax = clamp(Math.abs(L.idleShift) - 0.3, 0, 1);
    free.idleLift = (2.5 + 9 * relax) * deg;
    loaded.idleLift = 0;
  }

  _gaze(dt, input) {
    const L = this.loco;
    const lk = this.look;
    lk.next -= dt;
    if (L.active) {
      // look where we're going; the head leads into turns
      const want = input.dir && input.dir.lengthSq() > 0 ? Math.atan2(input.dir.x, input.dir.z) : L.heading;
      lk.ty = clamp(wrapAngle(want - L.heading) * 0.65, -55 * deg, 55 * deg);
      lk.tp = 3 * deg + Math.sin(this.t * 0.4) * 1.5 * deg;
      if (lk.next <= 0) lk.next = 2 + Math.random() * 3;
    } else if (lk.next <= 0) {
      // occasional glances around
      const r = Math.random();
      if (r < 0.45) { lk.ty = 0; lk.tp = (Math.random() - 0.3) * 6 * deg; }
      else { lk.ty = (Math.random() - 0.5) * 70 * deg; lk.tp = (Math.random() - 0.4) * 16 * deg; }
      if (input.cameraYaw !== undefined && Math.random() < 0.3) {
        // now and then she glances towards the camera
        lk.ty = clamp(wrapAngle(input.cameraYaw - L.heading), -60 * deg, 60 * deg);
        lk.tp = 2 * deg;
      }
      lk.next = 1.8 + Math.random() * 4.5;
      // eyes lead the head
      this.eye.ty = clamp(lk.ty - this.headYaw, -25 * deg, 25 * deg);
      this.eye.tp = clamp(lk.tp - this.headPitch, -15 * deg, 15 * deg);
      this.eye.lead = 0.25;
      this.blink.next = Math.min(this.blink.next, 0.05 + Math.random() * 0.1); // blink with gaze shifts
    }
    const st = L.active ? 0.22 : 0.32;
    this.headYaw = damp(this.headYaw, lk.ty, this.lookYawS, st, dt);
    this.headPitch = damp(this.headPitch, lk.tp, this.lookPitchS, st, dt);
  }

  _eyes(dt) {
    const R = this.rig;
    const e = this.eye;
    e.next -= dt;
    if (e.lead > 0) e.lead -= dt;
    else {
      // eyes settle relative to the head + micro-saccades
      if (e.next <= 0) {
        e.ty = (Math.random() - 0.5) * 6 * deg;
        e.tp = (Math.random() - 0.5) * 4 * deg;
        e.next = 0.4 + Math.random() * 1.6;
      }
    }
    // saccades are fast
    e.yaw += (e.ty - e.yaw) * (1 - Math.exp(-dt / 0.03));
    e.pitch += (e.tp - e.pitch) * (1 - Math.exp(-dt / 0.03));
    const headQ = R.Qm.head;
    _q.setFromEuler(_e.set(-e.pitch, e.yaw, 0, 'YXZ'));
    this.eyeLocal = _q.clone();
    R.setQ('eye_l', headQ.clone().multiply(_q));
    R.setQ('eye_r', headQ.clone().multiply(_q));
    // blinking: ~15/min, quick close, slower open; upper lids follow downward gaze
    const b = this.blink;
    b.next -= dt;
    if (b.next <= 0 && b.t <= 0) { b.t = b.dur; b.next = 2 + Math.random() * 4.5; if (Math.random() < 0.12) b.next = 0.25; }
    let v = 0;
    if (b.t > 0) {
      const x = 1 - b.t / b.dur;
      v = x < 0.35 ? x / 0.35 : 1 - (x - 0.35) / 0.65;
      b.t -= dt;
    }
    v = Math.max(v, clamp(-e.pitch / (25 * deg), 0, 0.35));
    this.c.setMorph('blink', clamp(v, 0, 1));
  }

  _arms(dt, thoraxQ, act, sp, ph, breathIn, gaitMods) {
    const R = this.rig, L = this.loco, g = L.gait;
    const TAU = Math.PI * 2;
    for (const s of SIDES) {
      const A = R.arm[s];
      const sign = A.sign;
      // contralateral to the leg: left arm forward when right leg forward (φ≈0.5)
      const legOff = s === 'l' ? 0.5 : 0.0;
      const lag = 0.04;
      const amp = (5 + 10 * sp) * deg * g.armSwing * act;
      const swingTarget = amp * Math.cos(TAU * (ph - legOff - lag)) - 5 * deg * act;
      // idle: arms hang, tiny drift
      const idle = (1 - act) * (fbm1(this.t * 0.2, s === 'l' ? 11 : 13) * 2.5 * deg);
      const swing = this.armSpring[s].update(swingTarget + idle, dt);
      const abd = this.armAbd[s].update((9.5 + 2.0 * act + (gaitMods.armOut || 0)) * deg + 1.2 * deg * breathIn, dt);
      // clavicle: slight protraction with forward swing, elevation on inhale
      const clavQ = thoraxQ.clone().multiply(_q.setFromEuler(_e.set(0, -sign * clamp(swing, -0.3, 0.3) * 0.12, sign * (breathIn * 0.6 * deg + 0.5 * deg), 'XYZ')));
      R.setQ('clavicle_' + s, clavQ);

      // upper arm direction in thorax space
      const dir = _v.set(sign * Math.sin(abd), -Math.cos(abd), 0);
      // forward swing: rotate about the lateral axis
      _q2.setFromAxisAngle(X, -swing);
      dir.applyQuaternion(_q2);
      // elbow bends forward and slightly inward
      const bend = _v2.set(-sign * 0.32, 0, 1).applyQuaternion(_q2).normalize();
      dir.applyQuaternion(thoraxQ); bend.applyQuaternion(thoraxQ);
      const upperQ = basisQuat(A.up, A.bend, dir, bend, Q());
      R.setQ('upperarm_' + s, upperQ);

      // elbow flexion: more flexed in forward swing, increases with speed
      const flexT = (12 + 10 * sp * act) * deg + Math.max(0, swing) * 0.65 + (gaitMods.elbowFlex || 0) * deg;
      const flex = this.elbow[s].update(flexT, dt);
      const foreQ = upperQ.clone().multiply(_q3.setFromAxisAngle(A.flexAxis, flex - A.restFlex));

      // hand: palm faces the thigh (slightly backward), wrist trails the swing
      const foreDir = _v3.copy(A.fo).applyQuaternion(foreQ);
      const wl = this.wristLag[s].update(-swing * 0.35, dt);
      const handDir = foreDir.clone();
      const palmT = V3(-sign, 0, -0.35).applyQuaternion(thoraxQ);
      palmT.addScaledVector(handDir, -palmT.dot(handDir)).normalize();
      // wrist flexion toward the palm + lag
      const wristFlex = 10 * deg + wl;
      const flexAx = V3().crossVectors(handDir, palmT).normalize();
      handDir.applyAxisAngle(flexAx, wristFlex);
      const handQ = basisQuat(A.handDir, A.palm, handDir, palmT, Q());
      // split forearm twist between forearm and hand to spread skin deformation
      const rel = foreQ.clone().invert().multiply(handQ);
      const twistAxis = A.fo;
      const tw = new THREE.Quaternion(rel.x, rel.y, rel.z, rel.w);
      const p = twistAxis.dot(_v.set(tw.x, tw.y, tw.z));
      const twist = Q().set(twistAxis.x * p, twistAxis.y * p, twistAxis.z * p, tw.w).normalize();
      const halfTwist = Q().identity().slerp(twist, 0.5);
      const foreQ2 = foreQ.clone().multiply(halfTwist);
      R.setQ('lowerarm_' + s, foreQ2);
      R.setQ('hand_' + s, handQ);

      // fingers: relaxed natural curl (more towards the little finger)
      this._fingers(s, act);
    }
  }

  _fingers(s, act) {
    const R = this.rig;
    const F = R.fingers[s];
    const t = this.t;
    const relax = (name, k) => {
      const base = { index: [12, 22, 12], middle: [16, 28, 16], ring: [20, 32, 18], pinky: [24, 34, 20], thumb: [8, 12, 14] }[name][k - 1];
      return (base + 3 * act + 2 * noise1(t * 0.15, name.length + k)) * deg;
    };
    for (const name of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
      for (let k = 1; k <= 3; k++) {
        const bn = `${name}_0${k}_${s}`;
        const fd = F[bn];
        R.local[bn] = Q().setFromAxisAngle(fd.axis, relax(name, k));
      }
    }
  }
}
