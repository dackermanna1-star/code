// Inverse kinematics + bone-space helpers working in world space on three.js bone hierarchies.
// Rig-agnostic: everything is expressed with world positions/directions, never with local bone axes.
import * as THREE from 'three';

const _pq = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _s = new THREE.Vector3();
const _endT = new THREE.Vector3();

/** World quaternion of an object (requires up-to-date matrixWorld). */
export function worldQuat(o: THREE.Object3D, out: THREE.Quaternion): THREE.Quaternion {
  o.matrixWorld.decompose(_s, out, _s);
  return out;
}

export function worldPos(o: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
  return out.setFromMatrixPosition(o.matrixWorld);
}

/** Set a bone's world rotation (keeps its position); updates its matrixWorld and descendants. */
export function setWorldQuat(bone: THREE.Object3D, q: THREE.Quaternion, updateChildren = true): void {
  const parent = bone.parent;
  if (parent) {
    worldQuat(parent, _pq);
    bone.quaternion.copy(_pq.invert()).multiply(q);
  } else bone.quaternion.copy(q);
  bone.updateMatrix();
  if (updateChildren) bone.updateMatrixWorld(true);
  else bone.matrixWorld.multiplyMatrices(parent ? parent.matrixWorld : bone.matrix, bone.matrix);
}

/** Pre-multiply a world-space rotation delta onto a bone (rotate it about its pivot in world space). */
export function rotateWorld(bone: THREE.Object3D, delta: THREE.Quaternion, updateChildren = true): void {
  worldQuat(bone, _wq);
  _dq.copy(delta).multiply(_wq);
  setWorldQuat(bone, _dq, updateChildren);
}

/** Rotate `bone` so the direction from its pivot to `childWorldPos` aligns with `targetDir` (world). */
export function aimBone(bone: THREE.Object3D, childWorldPos: THREE.Vector3, targetDir: THREE.Vector3, weight = 1, updateChildren = true): void {
  worldPos(bone, _v1);
  _v2.copy(childWorldPos).sub(_v1);
  const len = _v2.length();
  if (len < 1e-6) return;
  _v2.divideScalar(len);
  _dq.setFromUnitVectors(_v2, _v1.copy(targetDir).normalize());
  if (weight < 1) _dq.slerp(IDENTITY, 1 - weight);
  rotateWorld(bone, _dq, updateChildren);
}

const IDENTITY = new THREE.Quaternion();

/**
 * Pure two-bone solve: given root a, current mid b, current end c (positions), a target and a pole point,
 * compute the new mid and end positions (bone lengths preserved). Returns the reach ratio (|t-a| / (l1+l2)).
 */
export function solveTwoBone(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  outMid: THREE.Vector3,
  outEnd: THREE.Vector3,
): number {
  const l1 = a.distanceTo(b);
  const l2 = b.distanceTo(c);
  _dir.copy(target).sub(a);
  let d = _dir.length();
  const reach = d / Math.max(1e-6, l1 + l2);
  if (d < 1e-6) {
    _dir.set(0, -1, 0);
    d = 1e-6;
  } else _dir.divideScalar(d);
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  // Angle at the root (law of cosines).
  const cosA = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  // Bend direction: pole projected onto the plane orthogonal to the reach direction.
  _perp.copy(pole).sub(a);
  _perp.addScaledVector(_dir, -_perp.dot(_dir));
  if (_perp.lengthSq() < 1e-10) {
    // Pole on the line: keep the current bend plane.
    _perp.copy(b).sub(a);
    _perp.addScaledVector(_dir, -_perp.dot(_dir));
    if (_perp.lengthSq() < 1e-10) _perp.set(0, 0, 1).addScaledVector(_dir, -_dir.z);
  }
  _perp.normalize();
  outMid.copy(a).addScaledVector(_dir, l1 * cosA).addScaledVector(_perp, l1 * sinA);
  outEnd.copy(a).addScaledVector(_dir, d);
  return reach;
}

/**
 * Apply two-bone IK to bones (upper → lower → end) so the end reaches `target`, bending toward `pole`.
 * `weight` blends with the incoming (animated) pose.
 */
export function applyTwoBoneIK(
  upper: THREE.Object3D,
  lower: THREE.Object3D,
  end: THREE.Object3D,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  weight = 1,
): number {
  if (weight <= 0) return 0;
  worldPos(upper, _a);
  worldPos(lower, _b);
  worldPos(end, _c);
  let tgt = target;
  if (weight < 1) tgt = _v2.copy(_c).lerp(target, weight);
  const reach = solveTwoBone(_a, _b, _c, tgt, pole, _mid, _endT);
  const endTarget = _endT;
  aimBone(upper, _b, _dir.copy(_mid).sub(_a), 1, true);
  worldPos(lower, _b);
  worldPos(end, _c);
  aimBone(lower, _c, _dir.copy(endTarget).sub(_b), 1, true);
  return reach;
}

/** Build a world rotation from a forward (+Z of the frame) and up (+Y) vector. */
export function quatFromBasis(forward: THREE.Vector3, up: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  const z = _v1.copy(forward).normalize();
  const x = _v2.copy(up).cross(z);
  if (x.lengthSq() < 1e-10) x.set(1, 0, 0);
  x.normalize();
  const y = _perp.copy(z).cross(x).normalize();
  const m = _m.makeBasis(x, y, z);
  return out.setFromRotationMatrix(m);
}
const _m = new THREE.Matrix4();
