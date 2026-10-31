// The target skeleton for the offline tools: the engine's own ragdoll (bind pose, joints, limits),
// pose helpers on plain arrays, joint-limit measurement / clamping with the engine's swing-twist
// decomposition, and forward kinematics shared with the runtime player.
import { World } from '../../src/physics/world.js';
import { Quat } from '../../src/physics/math.js';
import { Ragdoll } from '../../src/human/ragdoll.js';
import { landmark } from '../../src/human/anatomy.js';
import { decomposeSwingTwist, composeSwingTwist } from '../../src/physics/joints.js';
import { skeleton, fk } from '../../src/tower/anim/skeleton.js';
import { qmul, qconj, qnorm } from './rig.mjs';

export const RD = new Ragdoll(new World());
export const SK = skeleton(RD);
export const N = SK.n;
export const BIND = SK.bind; // body centres of mass (bind)
export const LM = (name) => {
  const v = landmark(name);
  return [v.x, v.y, v.z];
};

/** A pose: rot Float64Array(N*4) (segment world rotations), pelvis [x,y,z] (body position). */
export function newPose() {
  const rot = new Float64Array(N * 4);
  for (let i = 0; i < N; i++) rot[i * 4 + 3] = 1;
  return { rot, pelvis: [BIND[0], BIND[1], BIND[2]] };
}

export function clonePose(p) {
  return { rot: Float64Array.from(p.rot), pelvis: p.pelvis.slice() };
}

export const getQ = (pose, i) => [pose.rot[i * 4], pose.rot[i * 4 + 1], pose.rot[i * 4 + 2], pose.rot[i * 4 + 3]];
export const setQ = (pose, i, q) => {
  qnorm(q);
  pose.rot.set(q, i * 4);
};

/** World joint positions and body positions of a pose: { J: Float64Array(N*3), P: Float64Array(N*3) }. */
export function poseFK(pose) {
  const J = new Float64Array(N * 3), P = new Float64Array(N * 3);
  fk(SK, pose.rot, pose.pelvis[0], pose.pelvis[1], pose.pelvis[2], BIND, J, P);
  return { J, P };
}
export const at = (arr, i) => [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];

const _q = new Quat(), _qp = new Quat(), _qc = new Quat();

function setBodies(pose) {
  for (let i = 0; i < N; i++) {
    const b = RD.segList[i].body;
    b.rot.set(pose.rot[i * 4], pose.rot[i * 4 + 1], pose.rot[i * 4 + 2], pose.rot[i * 4 + 3]);
  }
}

/** Limit excess per joint (radians beyond the range, ellipse metric), name -> excess. */
export function limitExcess(pose) {
  setBodies(pose);
  const out = {};
  for (const j of RD.jointList) {
    j.jointRotation(_q);
    out[j.name] = excessOf(j, decomposeSwingTwist(_q.canonical(), j.swingInChildFrame, { twist: 0, sx: 0, sz: 0 }));
  }
  return out;
}

export function excessOf(j, d) {
  const L = j.limits;
  let e = 0;
  if (L.twist) e = Math.max(e, L.twist[0] - d.twist, d.twist - L.twist[1]);
  if (L.mode === 'box') {
    e = Math.max(e, L.swingX[0] - d.sx, d.sx - L.swingX[1], L.swingZ[0] - d.sz, d.sz - L.swingZ[1]);
  } else {
    const axm = d.sx >= 0 ? L.swingX[1] : -L.swingX[0];
    const azm = d.sz >= 0 ? L.swingZ[1] : -L.swingZ[0];
    const ex = d.sx / Math.max(axm, 1e-4), ez = d.sz / Math.max(azm, 1e-4);
    const r = Math.sqrt(ex * ex + ez * ez);
    if (r > 1) e = Math.max(e, Math.hypot(d.sx, d.sz) * (1 - 1 / r));
  }
  return Math.max(e, 0);
}

/**
 * Clamp every joint into its limits shrunk by `margin` (fraction of the range kept free), from the
 * root outward: each segment keeps its world orientation unless its joint is out of range.
 */
export function clampPose(pose, margin = 0.04) {
  setBodies(pose);
  for (const j of RD.jointList) {
    const L = j.limits;
    j.jointRotation(_q);
    _q.canonical();
    const d = decomposeSwingTwist(_q, j.swingInChildFrame, { twist: 0, sx: 0, sz: 0 });
    let { twist, sx, sz } = d;
    let changed = false;
    const shrink = (r) => {
      const c = (r[0] + r[1]) / 2, h = ((r[1] - r[0]) / 2) * (1 - margin);
      return [c - h, c + h];
    };
    const tw = shrink(L.twist);
    if (twist < tw[0]) { twist = tw[0]; changed = true; }
    if (twist > tw[1]) { twist = tw[1]; changed = true; }
    if (L.mode === 'box') {
      const X = shrink(L.swingX), Z = shrink(L.swingZ);
      if (sx < X[0]) { sx = X[0]; changed = true; }
      if (sx > X[1]) { sx = X[1]; changed = true; }
      if (sz < Z[0]) { sz = Z[0]; changed = true; }
      if (sz > Z[1]) { sz = Z[1]; changed = true; }
    } else {
      const axm = (sx >= 0 ? L.swingX[1] : -L.swingX[0]) * (1 - margin);
      const azm = (sz >= 0 ? L.swingZ[1] : -L.swingZ[0]) * (1 - margin);
      const ex = sx / Math.max(axm, 1e-4), ez = sz / Math.max(azm, 1e-4);
      const e2 = ex * ex + ez * ez;
      if (e2 > 1) {
        const s = 1 / Math.sqrt(e2);
        sx *= s;
        sz *= s;
        changed = true;
      }
    }
    if (!changed) continue;
    composeSwingTwist(twist, sx, sz, j.swingInChildFrame, _q);
    // child = P * frameP * qj * frameC^-1
    _qp.multiplyQuats(j.parent.rot, j.frameP);
    _qc.multiplyQuats(_qp, _q);
    _qc.multiplyConjB(_qc, j.frameC).normalize();
    j.child.rot.copy(_qc);
    // descendants keep their world rotation (their joints are checked next, in parent-first order)
  }
  for (let i = 0; i < N; i++) {
    const r = RD.segList[i].body.rot;
    pose.rot[i * 4] = r.x;
    pose.rot[i * 4 + 1] = r.y;
    pose.rot[i * 4 + 2] = r.z;
    pose.rot[i * 4 + 3] = r.w;
  }
  return pose;
}

/** Rotate the subtree rooted at segment `i` by world rotation q about its proximal joint. */
export function rotateSubtree(pose, i, q) {
  for (let k = 0; k < N; k++) {
    if (!isInSubtree(k, i)) continue;
    setQ(pose, k, qmul(q, getQ(pose, k)));
  }
  if (i === 0) {
    // the pelvis turns about its own body position: nothing else to move
  }
  return pose;
}

export function isInSubtree(k, root) {
  while (k >= 0) {
    if (k === root) return true;
    k = SK.parent[k];
  }
  return false;
}

/** Slerp-free blend of two poses (nlerp per segment, lerp pelvis). */
export function blendPoses(a, b, w) {
  const out = clonePose(a);
  for (let i = 0; i < N; i++) {
    const qa = getQ(a, i), qb = getQ(b, i);
    const d = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];
    const s = d < 0 ? -1 : 1;
    setQ(out, i, [0, 1, 2, 3].map((c) => qa[c] * (1 - w) + qb[c] * w * s));
  }
  out.pelvis = a.pelvis.map((v, c) => v * (1 - w) + b.pelvis[c] * w);
  return out;
}

export { qmul, qconj };
