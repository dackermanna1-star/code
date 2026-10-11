// Pose maths for authoring choreography: poses are {p:[x,y,z], r:[pitch,yaw,roll]}
// (degrees, Euler YXZ) in a node's parent frame - the same values animation
// keys use. Lets a generator say "the hand holds the magazine like this, so when
// the magazine is there the hand is here" and get exact keys out.

import * as THREE from 'three';
import { DEG, poseMatrix } from './builder.js';

const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

export const P0 = { p: [0, 0, 0], r: [0, 0, 0] };
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function mat(pose) {
  return poseMatrix(pose.p, pose.r, 1, new THREE.Matrix4());
}

// Wrap Euler angles so they are the closest equivalent to `ref` (no 350 deg spins
// when keys are interpolated).
export function unwrap(r, ref) {
  return r.map((v, i) => v + 360 * Math.round(((ref ? ref[i] : 0) - v) / 360));
}

export function fromMat(m, ref) {
  m.decompose(_p, _q, _s);
  _e.setFromQuaternion(_q, 'YXZ');
  const r = [_e.x / DEG, _e.y / DEG, _e.z / DEG];
  return { p: [_p.x, _p.y, _p.z], r: ref ? unwrap(r, ref) : r };
}

/** a * b (b expressed in a's frame). */
export function chain(a, b, ref) { return fromMat(mat(a).multiply(mat(b)), ref); }
export function inverse(a) { return fromMat(mat(a).invert()); }
/** Pose of b relative to a: inv(a) * b. */
export function rel(a, b) { return fromMat(mat(a).invert().multiply(mat(b))); }

/** Offset-track semantics: rest pose + offset (positions and Euler angles add). */
export function offset(rest, off) {
  return { p: add(rest.p, off.p || [0, 0, 0]), r: add(rest.r, off.r || [0, 0, 0]) };
}

/** Offset that rotates a node by `r` about `pivot` (node-local), for a node whose rest rotation is zero. */
export function rotAbout(r, pivot, extra = [0, 0, 0]) {
  const m = poseMatrix([0, 0, 0], r, 1, new THREE.Matrix4());
  const v = new THREE.Vector3(...pivot).applyMatrix4(m);
  return { p: add(sub(pivot, [v.x, v.y, v.z]), extra), r: [...r] };
}

/** Direction `dir` (view space) expressed in the frame of `node`'s parent chain up to the body,
 *  with optional extra rotation offsets per node name (e.g. the reload tilt on 'rig'). */
export function dirIn(nodes, nodeName, dir, extraR = {}) {
  const qs = [];
  let n = nodes[nodeName];
  while (n && n.name !== 'body' && n.name !== 'vm_root') {
    const rest = n.userData.rest || { r: [0, 0, 0] };
    const r = extraR[n.name] ? add(rest.r, extraR[n.name]) : rest.r;
    qs.push(new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'YXZ')));
    n = n.parent;
  }
  const q = new THREE.Quaternion();
  for (let i = qs.length - 1; i >= 0; i--) q.multiply(qs[i]);
  const v = new THREE.Vector3(...dir).applyQuaternion(q.invert());
  return [v.x, v.y, v.z];
}

/** Make the rotations of a key list continuous (abs or offset keys, nulls kept). */
export function unwrapKeys(keys) {
  let ref = null;
  for (const k of keys) {
    if (!k[2]) continue;
    if (ref) k[2] = unwrap(k[2], ref);
    ref = k[2];
  }
  return keys;
}

/** Sort keys by time and drop keys that come before an earlier one (generators splice phases). */
export function tidy(keys) {
  const out = [];
  for (const k of keys.slice().sort((a, b) => a[0] - b[0])) {
    if (out.length && k[0] <= out[out.length - 1][0] + 1e-6) out[out.length - 1] = k;
    else out.push(k);
  }
  return unwrapKeys(out);
}
