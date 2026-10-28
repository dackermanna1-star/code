import { Vec3, Quat } from '../physics/math.js';

const _d = new Vec3();
const _n = new Vec3();
const _k = new Vec3();
const _u1 = new Vec3();
const _u2 = new Vec3();
const _a = new Vec3();
const _f2 = new Vec3();
const _f3 = new Vec3();
const _qb = new Quat();
const _qn = new Quat();

/**
 * Build the rotation that maps a bind-pose bone (direction `bindDir`, hinge axis `bindAxis`) onto a
 * new bone direction `dir` with hinge axis `axis`. All vectors are world-space; result is the world
 * orientation of a segment whose bind orientation is identity.
 */
export function boneRotation(bindDir, bindAxis, dir, axis, out) {
  // bind basis
  _u1.copy(bindDir).normalize();
  _f2.copy(bindAxis).addScaled(_u1, -bindAxis.dot(_u1)).normalize();
  _f3.crossVectors(_u1, _f2);
  _qb.setFromBasis(_u1, _f2, _f3);
  // new basis
  _u2.copy(dir).normalize();
  _a.copy(axis).addScaled(_u2, -axis.dot(_u2));
  if (_a.lengthSq() < 1e-10) _u2.anyPerpendicular(_a);
  _a.normalize();
  _f3.crossVectors(_u2, _a);
  _qn.setFromBasis(_u2, _a, _f3);
  return out.multiplyConjB(_qn, _qb);
}

/**
 * Analytic two-bone IK.
 * root: world position of the proximal joint (hip / shoulder)
 * target: desired world position of the distal joint (ankle / wrist)
 * L1, L2: bone lengths; pole: world direction the middle joint should bend toward
 * hingeSign: +1 if positive flexion bends toward the pole, -1 otherwise (sets hinge axis direction)
 * Writes mid (knee/elbow position), dir1 (upper bone dir), dir2 (lower bone dir), axis (hinge axis).
 * Returns the reach ratio (>1 means the target was out of reach and was clamped).
 */
export function twoBoneIK(root, target, L1, L2, pole, out, minBend = 0.0) {
  _d.subVectors(target, root);
  let D = _d.length();
  const reach = D / (L1 + L2);
  const maxD = (L1 + L2) * Math.cos(minBend * 0.5) - 1e-4;
  const minD = Math.abs(L1 - L2) + 0.02;
  if (D < 1e-6) {
    _d.set(0, -1, 0);
    D = minD;
  } else {
    _d.scale(1 / D);
  }
  D = Math.min(Math.max(D, minD), maxD);
  // pole component perpendicular to the root->target line
  _n.copy(pole).addScaled(_d, -pole.dot(_d));
  if (_n.lengthSq() < 1e-10) _d.anyPerpendicular(_n);
  _n.normalize();
  const cosA = (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D);
  const ca = Math.min(1, Math.max(-1, cosA));
  const sa = Math.sqrt(1 - ca * ca);
  out.mid.copy(root).addScaled(_d, L1 * ca).addScaled(_n, L1 * sa);
  out.end.copy(root).addScaled(_d, D);
  out.dir1.subVectors(out.mid, root).normalize();
  out.dir2.subVectors(out.end, out.mid).normalize();
  // hinge axis = pole x boneDir (matches anatomical LAT = FWD x DOWN in bind)
  out.axis.crossVectors(_n, _d).normalize();
  out.reach = reach;
  return out;
}

export function makeIKResult() {
  return { mid: new Vec3(), end: new Vec3(), dir1: new Vec3(), dir2: new Vec3(), axis: new Vec3(), reach: 0 };
}
