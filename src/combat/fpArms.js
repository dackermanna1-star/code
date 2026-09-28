// Runtime glue between the viewmodel and the first-person hand rig:
// builds both skinned arms for the survivor, solves / caches grips per weapon
// model, anchors each hand to its grip (so hands ride pumps, slides and the
// dual pistols' own recoil), blends finger poses (trigger finger on/off the
// trigger, off-hand grabbing magazines, shells, charging handles) and aims the
// forearms. Off-hand targets from the viewmodel's animation timeline use the
// legacy "grip hand" frame (grip axis +Y, front -Z, back of hand +X) and are
// converted to the wrist frame here.
import * as THREE from 'three';
import { FPArm, POSE_LEN, B, CHAIN_BONE } from './fpHands.js';
import { solveGrips, GRIP_SPECS, mkPose, lerpPose, HandFK } from './gripPoses.js';

// legacy grip-hand frame -> wrist frame (right hand; the left is its mirror)
const OLD_R = { p: new THREE.Vector3(0.03, 0.004, 0.075), q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.05, -1).normalize(), new THREE.Vector3(1, 0, 0).cross(new THREE.Vector3(0, 0.05, -1).normalize()))) };
const OLD_L = { p: new THREE.Vector3(-0.03, 0.004, 0.075), q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0.05, -1).normalize(), new THREE.Vector3(-1, 0, 0).cross(new THREE.Vector3(0, 0.05, -1).normalize()))) };
const OLD_Li = { p: OLD_L.p.clone().negate().applyQuaternion(OLD_L.q.clone().invert()), q: OLD_L.q.clone().invert() };

// generic hand shapes for animation phases (anatomical angles)
export const HAND_POSES = {
  relax: mkPose({ spread: [0.1, 0.02, -0.06, -0.14], mcp: [0.35, 0.42, 0.48, 0.55], pip: [0.45, 0.55, 0.6, 0.65], dip: [0.25, 0.3, 0.32, 0.35], thumb: [0.25, 0.35, 0.3, 0.2, 0.25], cup: 0.15 }),
  mag: mkPose({ spread: [0.04, 0.0, -0.04, -0.08], mcp: [0.75, 0.85, 0.9, 0.95], pip: [1.05, 1.15, 1.2, 1.2], dip: [0.6, 0.65, 0.7, 0.7], thumb: [0.55, 0.75, 0.8, 0.25, 0.35], cup: 0.35 }),
  pinch: mkPose({ spread: [0.08, 0.0, -0.05, -0.1], mcp: [0.7, 1.15, 1.25, 1.3], pip: [0.75, 1.45, 1.5, 1.5], dip: [0.45, 0.9, 0.95, 0.95], thumb: [0.6, 0.65, 0.85, 0.35, 0.45], cup: 0.3 }),
  shell: mkPose({ spread: [0.08, 0.0, -0.05, -0.1], mcp: [0.55, 1.2, 1.3, 1.35], pip: [0.7, 1.5, 1.55, 1.55], dip: [0.4, 0.95, 1.0, 1.0], thumb: [0.55, 0.6, 0.8, 0.3, 0.35], cup: 0.3 }),
  fist: mkPose({ spread: [0.04, 0.0, -0.04, -0.08], mcp: [1.35, 1.4, 1.45, 1.5], pip: [1.6, 1.65, 1.65, 1.6], dip: [0.9, 0.95, 0.95, 0.9], thumb: [0.7, 0.55, 0.9, 0.55, 0.5], cup: 0.35 }),
};

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4();
const _y = new THREE.Vector3(), _e = new THREE.Vector3(), _d = new THREE.Vector3(), _pa = new THREE.Vector3(), _qa = new THREE.Quaternion();
// object -> holder-space transform (walks the parents up to the holder)
function toHolder(obj, holder, lp, lq, outP, outQ) {
  outP.copy(lp); outQ.copy(lq);
  for (let o = obj; o && o !== holder; o = o.parent) {
    o.updateMatrix();
    outP.applyMatrix4(o.matrix);
    outQ.premultiply(o.quaternion);
  }
}

export class FPArms {
  constructor(root) {
    this.root = root; // camera-space group the arms live in (viewmodel root)
    this.R = null; this.L = null; this.char = null;
    this.grips = null;
    this.poseR = new Float32Array(POSE_LEN); this.poseL = new Float32Array(POSE_LEN);
    this.tgtR = new Float32Array(POSE_LEN); this.tgtL = new Float32Array(POSE_LEN);
    this.init = false;
    this.trig = 1;
  }
  setCharacter(char) {
    if (this.char === char) return;
    this.char = char;
    if (this.R) { this.root.remove(this.R.root); this.root.remove(this.L.root); }
    this.R = new FPArm(char, 1);
    this.L = new FPArm(char, -1);
    this.root.add(this.R.root, this.L.root);
    this.grips = null; this.model = null; this.init = false;
  }
  get lookId() { return this.R?.look.id; }
  // solve (or fetch) the grips for a weapon model
  setModel(model, type) {
    this.model = model; this.type = type;
    this.grips = null;
    if (!model || !this.R) return;
    const ud = model.userData;
    const cache = ud.fpGrips || (ud.fpGrips = {});
    const key = this.lookId;
    if (!cache[key]) {
      const spec = GRIP_SPECS[type];
      cache[key] = spec ? solveGrips(model, type, this.R.A, this.R.S, spec) : null;
      const g = cache[key];
      if (g?.R && !g.R.poseIdle) g.R.poseIdle = g.R.pose;
    }
    this.grips = cache[key];
    this.init = false;
  }
  hasGrip(side) { return !!this.grips?.[side]; }
  // solved rest grip of a hand in holder space (wrist frame)
  gripHolder(side, holder, outP, outQ) {
    const g = this.grips?.[side];
    if (!g) return false;
    toHolder(g.anchor, holder, g.pos, g.quat, outP, outQ);
    return true;
  }
  // the same, expressed in the legacy grip-hand frame (for the animation code)
  gripHolderLegacy(side, holder, outP, outQ) {
    if (!this.gripHolder(side, holder, outP, outQ)) return false;
    const T = side === 'R' ? { p: OLD_R.p.clone().negate().applyQuaternion(OLD_R.q.clone().invert()), q: OLD_R.q.clone().invert() } : OLD_Li;
    outP.add(_v.copy(T.p).applyQuaternion(outQ));
    outQ.multiply(T.q);
    return true;
  }
  // legacy grip-hand pose (holder space) -> wrist pose (holder space)
  static fromLegacy(side, p, q, outP, outQ) {
    const T = side === 'R' ? OLD_R : OLD_L;
    outQ.copy(q).multiply(T.q);
    outP.copy(p).add(_v.copy(T.p).applyQuaternion(q));
  }
  // Per frame. o: {holder, dt, trig (0..1 index on trigger), offP/offQ (legacy
  // frame, holder space; null = rest grip), offPose (name), offK (0..1 away
  // from the rest grip), hideL, rP/rQ (legacy override for the right hand)}
  update(o) {
    if (!this.R) return;
    const holder = o.holder, dt = o.dt ?? 0.016;
    holder.updateMatrix();
    const hm = holder.matrix, hq = holder.quaternion;
    const k = this.init ? 1 - Math.exp(-(o.fast ? 30 : 18) * dt) : 1;
    // ---- right hand
    const gR = this.grips?.R;
    let rp = _p, rq = _q;
    if (o.rP) FPArms.fromLegacy('R', o.rP, o.rQ, rp, rq);
    else if (gR) toHolder(gR.anchor, holder, gR.pos, gR.quat, rp, rq);
    else { rp.set(0.03, -0.03, 0.07); rq.identity(); }
    const tr = this.trig += ((o.trig ?? 1) - this.trig) * (this.init ? 1 - Math.exp(-14 * dt) : 1);
    if (gR) { lerpPose(gR.poseIdle, gR.pose, tr, this.tgtR); if (o.rPose) lerpPose(this.tgtR, HAND_POSES[o.rPose], o.rPoseK ?? 1, this.tgtR); }
    else this.tgtR.set(o.rPose ? HAND_POSES[o.rPose] : HAND_POSES.fist);
    lerpPose(this.poseR, this.tgtR, k, this.poseR);
    this.R.setPose(this.poseR);
    this.placeArm(this.R, rp, rq, hm, hq, 1, 0, gR?.elbow);
    // ---- left hand
    const gL = this.grips?.L;
    const showL = !o.hideL && (gL || o.offP);
    this.L.root.visible = !!showL;
    this.R.root.visible = true;
    if (showL) {
      const lp = _v.set(0, 0, 0), lq = _q2;
      const P = new THREE.Vector3();
      if (o.offP) FPArms.fromLegacy('L', o.offP, o.offQ, P, lq);
      else toHolder(gL.anchor, holder, gL.pos, gL.quat, P, lq);
      const away = gL ? clamp01(o.offK ?? (o.offP ? 1 : 0)) : 1;
      if (gL) lerpPose(gL.pose, HAND_POSES[o.offPose || 'relax'], away, this.tgtL);
      else this.tgtL.set(HAND_POSES[o.offPose || 'relax']);
      lerpPose(this.poseL, this.tgtL, k, this.poseL);
      this.L.setPose(this.poseL);
      const reach = gL?.reach ?? 0;
      this.placeArm(this.L, P, lq, hm, hq, -1, reach * (1 - away), gL?.elbow);
    }
    this.init = true;
  }
  // holder-space wrist pose -> root (camera) space. The elbow sits below and
  // behind the wrist, out of view (reach = 1 when the arm stretches forward to
  // a fore-end); the wrist bend is limited so the forearm stays believable.
  placeArm(arm, p, q, hm, hq, side, reach = 0, elbow = null) {
    const P = _pa.copy(p).applyMatrix4(hm);
    const Q = _qa.copy(hq).multiply(q);
    const E = _e.set(P.x + side * 0.08 * (1 - reach) - 0.17 * reach, P.y - 0.2 - 0.02 * reach, P.z + 0.2 + 0.07 * reach);
    if (elbow) E.add(_v.set(elbow[0], elbow[1], elbow[2]));
    const d = _d.subVectors(P, E).normalize();
    const hy = _y.set(0, 1, 0).applyQuaternion(Q);
    const ang = d.angleTo(hy), max = 1.15;
    if (ang > max) d.lerp(hy, 1 - max / ang).normalize();
    arm.place(P, Q, d);
  }
  // attach an object (e.g. a shotgun shell) between the left thumb and index tips
  attachToLeft(obj, pose = HAND_POSES.shell) {
    if (!this.L) return;
    const fk = new HandFK(this.L.A, this.L.S, -1).set(new THREE.Vector3(), new THREE.Quaternion(), pose);
    const a = fk.jp[0][3], b = fk.jp[1][3];
    this.L.bones[B.HAND].add(obj);
    obj.position.copy(a).lerp(b, 0.5);
    obj.rotation.set(-Math.PI / 2, 0, 0); // shell axis towards the thumb side (the old grip axis)
    obj.traverse((o) => o.layers.set(1));
  }
  setVisible(v) { if (this.R) { this.R.root.visible = v; this.L.root.visible = v; } }
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
