// Pose editing for the stylisation and procedural clips: rotate a joint (and everything beyond
// it), aim a limb, two-bone IK for arms and legs with hinge-preserving bone frames.
import { SK, N, getQ, setQ, poseFK, at, LM, isInSubtree } from './target.mjs';
import { qmul, qconj, qrot, vsub, vadd, vscale, vdot, vcross, vlen, vnorm } from './rig.mjs';
import { boneRot } from './retarget.mjs';

const I = SK.index;

export const axisAngle = (axis, ang) => {
  const a = vnorm(axis), s = Math.sin(ang / 2);
  return [a[0] * s, a[1] * s, a[2] * s, Math.cos(ang / 2)];
};

/** Shortest rotation taking unit a onto unit b. */
export function fromTo(a, b) {
  const d = vdot(a, b);
  if (d < -0.999999) {
    const ax = Math.abs(a[0]) < 0.9 ? vcross(a, [1, 0, 0]) : vcross(a, [0, 1, 0]);
    return axisAngle(ax, Math.PI);
  }
  const c = vcross(a, b);
  const q = [c[0], c[1], c[2], 1 + d];
  const l = Math.hypot(...q);
  return q.map((v) => v / l);
}

export function slerpQ(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) {
    d = -d;
    bb = b.map((v) => -v);
  }
  if (d > 0.9995) {
    const q = a.map((v, i) => v + (bb[i] - v) * t);
    const l = Math.hypot(...q);
    return q.map((v) => v / l);
  }
  const th = Math.acos(d), s = Math.sin(th);
  const ka = Math.sin((1 - t) * th) / s, kb = Math.sin(t * th) / s;
  return a.map((v, i) => v * ka + bb[i] * kb);
}

/**
 * Rotate segment `name` and all its descendants by `angle` about `axis`. The axis is given in the
 * frame of the segment's parent (local) unless `world` is set.
 */
export function rotJoint(pose, name, axis, angle, world = false) {
  const i = I[name];
  const p = SK.parent[i];
  const ax = world || p < 0 ? axis : qrot(getQ(pose, p), axis);
  const q = axisAngle(ax, angle);
  for (let k = 0; k < N; k++) if (isInSubtree(k, i)) setQ(pose, k, qmul(q, getQ(pose, k)));
  return pose;
}

/** Bone direction (unit, world) of a limb segment in a pose: its joint -> its child's joint. */
export function boneDir(pose, name, fkr = poseFK(pose)) {
  const i = I[name];
  const child = SK.names.findIndex((_, k) => SK.parent[k] === i);
  return vnorm(vsub(at(fkr.J, child), at(fkr.J, i)));
}

/**
 * Turn a limb (segment `name` + descendants) about its proximal joint so its bone points along
 * `dir` (world), blended by weight w (minimal rotation, keeps twist).
 */
export function aimLimb(pose, name, dir, w = 1) {
  const cur = boneDir(pose, name);
  let q = fromTo(cur, vnorm(dir));
  if (w < 1) q = slerpQ([0, 0, 0, 1], q, w);
  const i = I[name];
  for (let k = 0; k < N; k++) if (isInSubtree(k, i)) setQ(pose, k, qmul(q, getQ(pose, k)));
  return pose;
}

/**
 * Two-bone IK for a leg ('L' | 'R'): place the ankle at `target` (world, pose space) with the knee
 * bending toward the leg's current knee direction; keeps the foot's world rotation unless `footRot`.
 */
export function legIK(pose, side, target, footRot = null) {
  const leg = SK.legs[side];
  const fkr = poseFK(pose);
  const hip = at(fkr.J, leg.thigh);
  const qT = getQ(pose, leg.thigh);
  const kAxis = qrot(qT, [1, 0, 0]); // knee flexion axis (bind +X)
  const r = twoBone(hip, target, leg.L1, leg.L2, kAxis);
  const t0 = vnorm(vsub(LM('knee' + side), LM('hip' + side)));
  const s0 = vnorm(vsub(LM('ankle' + side), LM('knee' + side)));
  const foot = footRot || getQ(pose, leg.foot);
  setQ(pose, leg.thigh, boneRot(t0, [1, 0, 0], r.d1, r.axis));
  setQ(pose, leg.shin, boneRot(s0, [1, 0, 0], r.d2, r.axis));
  setQ(pose, leg.foot, foot.slice());
  return r;
}

/** Two-bone IK for an arm: wrist to `target`, elbow bending toward `pole` (world direction). */
export function armIK(pose, side, target, pole, handRot = null) {
  const fkr = poseFK(pose);
  const up = I['upperArm' + side], fo = I['forearm' + side], ha = I['hand' + side];
  const sh = at(fkr.J, up);
  const S = LM('shoulder' + side), E = LM('elbow' + side), W = LM('wrist' + side);
  const L1 = vlen(vsub(E, S)), L2 = vlen(vsub(W, E));
  const u0 = vnorm(vsub(E, S)), f0 = vnorm(vsub(W, E));
  const h0 = vnorm(vcross(u0, [0, 0, 1]));
  // elbow flexion axis such that the forearm folds toward the front: axis = cross(upper, fore)
  const r = twoBoneArm(sh, target, L1, L2, pole);
  const hand = handRot || getQ(pose, ha);
  setQ(pose, up, boneRot(u0, h0, r.d1, r.axis));
  setQ(pose, fo, boneRot(f0, h0, r.d2, r.axis));
  setQ(pose, ha, hand.slice());
  return r;
}

/** Generic two-bone solve: knee/elbow toward `pole`; returns bone dirs and flexion axis. */
function solve(root, target, L1, L2, pole) {
  let d = vsub(target, root);
  let D = vlen(d);
  d = D > 1e-9 ? vscale(d, 1 / D) : [0, -1, 0];
  D = Math.min(Math.max(D, Math.abs(L1 - L2) + 0.01), L1 + L2 - 1e-4);
  let n = vsub(pole, vscale(d, vdot(pole, d)));
  if (vlen(n) < 1e-8) n = Math.abs(d[0]) < 0.9 ? vcross(d, [1, 0, 0]) : vcross(d, [0, 1, 0]);
  n = vnorm(n);
  const ca = Math.min(1, Math.max(-1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D)));
  const sa = Math.sqrt(1 - ca * ca);
  const mid = vadd(vadd(root, vscale(d, L1 * ca)), vscale(n, L1 * sa));
  const end = vadd(root, vscale(d, D));
  return { mid, end, d1: vnorm(vsub(mid, root)), d2: vnorm(vsub(end, mid)), n, d };
}

function twoBone(root, target, L1, L2, kAxis) {
  // the knee points to the front of the flexion axis: pole = legDir x axis (forward for a hanging leg)
  const pole = vnorm(vcross(vnorm(vsub(target, root)), kAxis));
  const s = solve(root, target, L1, L2, pole);
  let axis = vcross(s.d1, s.d2);
  axis = vlen(axis) > 0.05 ? vnorm(axis) : kAxis;
  if (vdot(axis, kAxis) < 0) axis = vscale(axis, -1);
  return { ...s, axis };
}

function twoBoneArm(root, target, L1, L2, pole) {
  const s = solve(root, target, L1, L2, pole);
  // forearm folds toward the pole side: flexion axis = cross(upper, fore)
  let axis = vcross(s.d1, s.d2);
  if (vlen(axis) < 0.05) axis = vcross(s.d1, vnorm(pole));
  return { ...s, axis: vnorm(axis) };
}

export { I, getQ, setQ, poseFK, at, qmul, qconj, qrot, vsub, vadd, vscale, vdot, vcross, vlen, vnorm };
