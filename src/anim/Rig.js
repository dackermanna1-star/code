import * as THREE from 'three';
import { V3, Q, basisQuat, clamp } from './math.js';

const SIDES = ['l', 'r'];
const _v = V3(), _v2 = V3(), _v3 = V3(), _q = Q(), _q2 = Q();
const X = V3(1, 0, 0), Y = V3(0, 1, 0), Z = V3(0, 0, 1);

/**
 * Model-space posing on top of an identity-rest skeleton.
 *
 * Every frame the animation layers write model-space orientations into
 * `this.Qm[bone]` (and the pelvis position).  `apply()` converts them into
 * local bone transforms.  Bones that were not written inherit their parent's
 * orientation plus an optional local offset (`this.local[bone]`).
 */
export class Rig {
  constructor(character) {
    this.c = character;
    this.bones = character.bones;
    this.order = [];
    character.model.traverse((o) => { if (o.isBone) this.order.push(o.name); });
    this.restLocal = character.restLocal;
    this.restModel = character.restModel;
    this.parent = {};
    for (const n of this.order) this.parent[n] = this.bones[n].parent && this.bones[n].parent.isBone ? this.bones[n].parent.name : null;

    this.Qm = {};
    this.set = {};
    this.local = {};
    this.Pm = {};
    for (const n of this.order) { this.Qm[n] = Q(); this.Pm[n] = V3(); this.local[n] = null; }
    this.pelvisPos = this.restModel.pelvis.clone();

    // ---------------- legs & feet
    const lm = character.meta.landmarks;
    this.leg = {};
    for (const s of SIDES) {
      const hip = this.restModel['thigh_' + s], knee = this.restModel['calf_' + s];
      const ankle = this.restModel['foot_' + s], ball = this.restModel['ball_' + s];
      const fl = lm['foot_' + s];
      const O = V3(ankle.x, 0, ankle.z);
      const leg = {
        side: s, sign: s === 'l' ? 1 : -1,
        hip, knee, ankle, ball,
        l1: hip.distanceTo(knee), l2: knee.distanceTo(ankle),
        thighDir: V3().subVectors(knee, hip).normalize(),
        calfDir: V3().subVectors(ankle, knee).normalize(),
        // foot points relative to the plant origin (ankle projected to the floor)
        a: V3().subVectors(ankle, O),
        b: V3(ball.x - O.x, 0, ball.z - O.z),
        h: V3(0, 0, fl.heel_back_z + 0.022 - O.z),
        t: V3(ball.x - O.x, 0, fl.toe_tip_z - 0.012 - O.z),
        heelBack: fl.heel_back_z - O.z,
        toeTip: fl.toe_tip_z - O.z,
        restYaw: Math.atan2(ball.x - ankle.x, ball.z - ankle.z),
      };
      leg.len = leg.l1 + leg.l2;
      this.leg[s] = leg;
    }
    this.legLength = this.leg.l.len;
    this.hipHeight = this.restModel.thigh_l.y;

    // ---------------- arms & hands
    this.arm = {};
    for (const s of SIDES) {
      const sh = this.restModel['upperarm_' + s], el = this.restModel['lowerarm_' + s], wr = this.restModel['hand_' + s];
      const up = V3().subVectors(el, sh).normalize();
      const fo = V3().subVectors(wr, el).normalize();
      const bend = V3().copy(fo).addScaledVector(up, -fo.dot(up)).normalize();
      const restFlex = Math.acos(clamp(fo.dot(up), -1, 1));
      const flexAxis = V3().crossVectors(up, bend).normalize();
      const idx = this.restModel['index_01_' + s], pk = this.restModel['pinky_01_' + s], mid = this.restModel['middle_01_' + s];
      const handDir = V3().subVectors(mid, wr).normalize();
      let palm = V3().crossVectors(V3().subVectors(idx, wr), V3().subVectors(pk, wr)).normalize();
      // palm normal must point out of the palm: away from the back of the hand.
      // For the left hand the cross product above points to the back of the hand.
      if (s === 'l') palm.negate();
      this.arm[s] = {
        sign: s === 'l' ? 1 : -1, sh, el, wr, up, fo, bend, restFlex, flexAxis, handDir, palm,
        l1: sh.distanceTo(el), l2: el.distanceTo(wr),
      };
    }
    // fingers: flexion axes per segment
    this.fingers = {};
    for (const s of SIDES) {
      const palm = this.arm[s].palm;
      const f = {};
      for (const name of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
        for (let k = 1; k <= 3; k++) {
          const bn = `${name}_0${k}_${s}`;
          const head = this.restModel[bn], tail = character.tailModel[bn];
          const dir = V3().subVectors(tail, head).normalize();
          let axis;
          if (name === 'thumb') {
            // thumb flexes across the palm towards the little finger
            const across = V3().subVectors(this.restModel['pinky_01_' + s], this.restModel['index_01_' + s]).normalize();
            axis = V3().crossVectors(dir, across.lerp(palm, 0.5).normalize()).normalize();
          } else {
            axis = V3().crossVectors(dir, palm).normalize();
          }
          f[bn] = { dir, axis };
        }
      }
      this.fingers[s] = f;
    }
  }

  reset() {
    for (const n of this.order) { this.set[n] = false; this.local[n] = null; }
  }

  setQ(name, q) { this.Qm[name].copy(q); this.set[name] = true; }

  /** Compute model-space orientation/position for the hierarchy (fills unset bones). */
  solveFK() {
    for (const n of this.order) {
      const p = this.parent[n];
      if (!this.set[n]) {
        if (p) this.Qm[n].copy(this.Qm[p]); else this.Qm[n].identity();
        if (this.local[n]) this.Qm[n].multiply(this.local[n]);
      }
      if (n === 'pelvis') this.Pm[n].copy(this.pelvisPos);
      else if (p) this.Pm[n].copy(this.restLocal[n]).applyQuaternion(this.Qm[p]).add(this.Pm[p]);
      else this.Pm[n].copy(this.restLocal[n] || this.restModel[n]);
    }
  }

  /** Model-space position of a bone given only its ancestors are final. */
  posOf(name) {
    const p = this.parent[name];
    if (name === 'pelvis') return _v.copy(this.pelvisPos);
    return V3().copy(this.restLocal[name]).applyQuaternion(this.Qm[p]).add(this.Pm[p]);
  }

  apply() {
    this.solveFK();
    for (const n of this.order) {
      const b = this.bones[n];
      const p = this.parent[n];
      if (p) b.quaternion.copy(this.Qm[p]).invert().multiply(this.Qm[n]);
      else b.quaternion.copy(this.Qm[n]);
      if (n === 'pelvis') b.position.copy(this.pelvisPos).sub(this.Pm.Root || this.restModel.Root);
    }
  }

  // ------------------------------------------------------------------ IK
  /**
   * Two-bone leg IK in model space.
   * hip: model position of the hip joint, target: desired ankle position,
   * pole: direction the knee should point to.  Returns the reached ankle pos.
   */
  solveLeg(side, hip, target, pole, footQ, toeBend) {
    const L = this.leg[side];
    const l1 = L.l1, l2 = L.l2;
    const d = _v.subVectors(target, hip);
    let dist = d.length();
    const dir = d.clone().divideScalar(dist || 1);
    // soft IK: avoid knee "pop" as the leg straightens
    const maxL = l1 + l2;
    const soft = 0.012;
    const dsoft = maxL - soft;
    if (dist > dsoft) dist = dsoft + soft * (1 - Math.exp(-(dist - dsoft) / soft));
    dist = clamp(dist, Math.abs(l1 - l2) + 1e-3, maxL - 1e-5);
    const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const perp = _v2.copy(pole).addScaledVector(dir, -pole.dot(dir));
    if (perp.lengthSq() < 1e-8) perp.copy(Z);
    perp.normalize();
    const knee = V3().copy(hip).addScaledVector(dir, l1 * cosA).addScaledVector(perp, l1 * sinA);
    const ankle = V3().copy(hip).addScaledVector(dir, dist);

    const thighDir = V3().subVectors(knee, hip).normalize();
    const calfDir = V3().subVectors(ankle, knee).normalize();
    // twist: the knee's forward (rest +Z) maps onto the bend direction
    basisQuat(L.thighDir, Z, thighDir, perp, this.Qm['thigh_' + side]);
    const kneeFwd = _v3.copy(perp);
    basisQuat(L.calfDir, Z, calfDir, kneeFwd, this.Qm['calf_' + side]);
    this.set['thigh_' + side] = this.set['calf_' + side] = true;
    this.Qm['foot_' + side].copy(footQ); this.set['foot_' + side] = true;
    _q.setFromAxisAngle(X, -toeBend);
    this.Qm['ball_' + side].copy(footQ).multiply(_q); this.set['ball_' + side] = true;
    return ankle;
  }
}

export { SIDES, X, Y, Z };
