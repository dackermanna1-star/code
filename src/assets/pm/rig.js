// Skeleton definition + a tiny pose solver (FK in model space, analytic 2-bone IK).
// Model space = the PlayerModel's local frame: feet at origin, facing +X, Z up, +Y = model's left.
// Every bone's bind rotation is identity; limbs hang along -Z from their joint.
import * as THREE from 'three';

export const BONE_DEFS = [
  // name, parent, bind position (model space)
  ['root', null, [0, 0, 0]],
  ['pelvis', 'root', [0, 0, 39]],
  ['spine', 'pelvis', [0, 0, 44]],
  ['chest', 'spine', [0, 0, 50.5]],
  ['neck', 'chest', [0, 0, 60]],
  ['head', 'neck', [0.3, 0, 62.8]],
  ['upperarm_r', 'chest', [0, -8, 57.5]],
  ['forearm_r', 'upperarm_r', [0, -8, 45]],
  ['hand_r', 'forearm_r', [0, -8, 34.2]],
  ['upperarm_l', 'chest', [0, 8, 57.5]],
  ['forearm_l', 'upperarm_l', [0, 8, 45]],
  ['hand_l', 'forearm_l', [0, 8, 34.2]],
  ['thigh_r', 'pelvis', [0, -4.2, 37]],
  ['shin_r', 'thigh_r', [0, -4.2, 20]],
  ['foot_r', 'shin_r', [0, -4.2, 3.5]],
  ['thigh_l', 'pelvis', [0, 4.2, 37]],
  ['shin_l', 'thigh_l', [0, 4.2, 20]],
  ['foot_l', 'shin_l', [0, 4.2, 3.5]],
];

export const BONE_INDEX = Object.fromEntries(BONE_DEFS.map((d, i) => [d[0], i]));

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const DEG = Math.PI / 180;

export const qZYX = (yaw, pitch, roll, out = new THREE.Quaternion()) => {
  // intrinsic yaw (Z) then pitch (Y) then roll (X); degrees
  const e = new THREE.Euler(roll * DEG, pitch * DEG, yaw * DEG, 'ZYX');
  return out.setFromEuler(e);
};

export function quatFromBasis(x, y, z, out = new THREE.Quaternion()) {
  _m.makeBasis(x, y, z);
  return out.setFromRotationMatrix(_m);
}

/**
 * Hand orientation from a finger direction (wrist -> knuckles) and a palm normal.
 * Hand local frame: -Z = fingers, +X = thumb side, palm normal = +Y (right) / -Y (left).
 */
export function handQuat(fingers, palm, left, out = new THREE.Quaternion()) {
  const z = _z.copy(fingers).normalize().negate();
  const y = _y.copy(palm).normalize();
  if (left) y.negate();
  y.sub(_v.copy(z).multiplyScalar(y.dot(z))).normalize();
  const x = _x.crossVectors(y, z).normalize();
  return quatFromBasis(x, y, z, out);
}

export class Rig {
  constructor() {
    this.bones = BONE_DEFS.map(([name, parent, pos], i) => ({
      name, i,
      parent: parent ? BONE_INDEX[parent] : -1,
      bind: new THREE.Vector3(...pos),
      off: new THREE.Vector3(),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      wp: new THREE.Vector3(),
      wq: new THREE.Quaternion(),
    }));
    for (const b of this.bones) {
      if (b.parent >= 0) b.off.copy(b.bind).sub(this.bones[b.parent].bind);
      else b.off.copy(b.bind);
      b.p.copy(b.off);
    }
    this.b = Object.fromEntries(this.bones.map((b) => [b.name, b]));
    this.reset();
  }

  reset() {
    for (const b of this.bones) { b.p.copy(b.off); b.q.identity(); }
    this.fkAll();
  }

  fk(b) {
    if (b.parent < 0) { b.wq.copy(b.q); b.wp.copy(b.p); return; }
    const p = this.bones[b.parent];
    b.wq.multiplyQuaternions(p.wq, b.q);
    b.wp.copy(b.p).applyQuaternion(p.wq).add(p.wp);
  }

  fkAll() { for (const b of this.bones) this.fk(b); }

  /** Set a bone's model-space rotation (its parent must be up to date). */
  setRot(b, qModel) {
    const p = b.parent >= 0 ? this.bones[b.parent] : null;
    if (p) b.q.copy(p.wq).invert().multiply(qModel);
    else b.q.copy(qModel);
    this.fk(b);
  }

  /** Set a bone's model-space position (its parent must be up to date). */
  setPos(b, pModel) {
    const p = b.parent >= 0 ? this.bones[b.parent] : null;
    if (p) b.p.copy(pModel).sub(p.wp).applyQuaternion(_q.copy(p.wq).invert());
    else b.p.copy(pModel);
    this.fk(b);
  }

  /** Model-space position of a point given in a bone's local frame. */
  point(b, local, out = new THREE.Vector3()) {
    return out.copy(local).applyQuaternion(b.wq).add(b.wp);
  }

  /**
   * Analytic two-bone IK. upper/lower/end are bone records; the end bone's position is
   * placed at `target` (clamped to reach); `pole` is where the middle joint should point.
   * kind 'arm': lower bone flexes toward its local +X; 'leg': toward local -X.
   */
  ik(upper, lower, end, target, pole, kind) {
    this.fk(upper);
    const S = upper.wp;
    const a = lower.off.length(), b = end.off.length();
    const d = _v.copy(target).sub(S);
    let dist = d.length();
    const n = dist > 1e-6 ? d.multiplyScalar(1 / dist) : d.set(0, 0, -1);
    dist = Math.min(Math.max(dist, Math.abs(a - b) + 0.05), (a + b) * 0.9995);
    const cosA = Math.min(1, Math.max(-1, (a * a + dist * dist - b * b) / (2 * a * dist)));
    const sinA = Math.sqrt(1 - cosA * cosA);
    const m = new THREE.Vector3().copy(pole).addScaledVector(n, -pole.dot(n));
    if (m.lengthSq() < 1e-8) m.set(n.z, 0, -n.x); // arbitrary perpendicular
    m.normalize();
    const E = new THREE.Vector3().copy(S).addScaledVector(n, a * cosA).addScaledVector(m, a * sinA);
    const T = new THREE.Vector3().copy(S).addScaledVector(n, dist);
    const du = new THREE.Vector3().subVectors(E, S).normalize();
    const dl = new THREE.Vector3().subVectors(T, E).normalize();
    const bend = new THREE.Vector3().copy(dl).addScaledVector(du, -dl.dot(du));
    if (bend.lengthSq() < 1e-6) bend.copy(m).negate().addScaledVector(du, m.dot(du));
    bend.normalize();
    // upper basis: -Z along the bone, X toward the flex direction
    const zU = new THREE.Vector3().copy(du).negate();
    const xU = kind === 'arm' ? bend.clone() : bend.clone().negate();
    const yU = new THREE.Vector3().crossVectors(zU, xU).normalize();
    xU.crossVectors(yU, zU).normalize();
    this.setRot(upper, quatFromBasis(xU, yU, zU, new THREE.Quaternion()));
    const zL = new THREE.Vector3().copy(dl).negate();
    const xL = new THREE.Vector3().crossVectors(yU, zL).normalize();
    this.setRot(lower, quatFromBasis(xL, yU, zL, new THREE.Quaternion()));
    this.fk(end);
    return T;
  }
}
