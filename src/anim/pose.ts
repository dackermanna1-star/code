import * as THREE from 'three';
import { BONE_COUNT, PARENT, SkeletonDef } from './skeleton';

/** Joint-space pose: local rotations for every bone + hips position (root space). */
export class Pose {
  q: THREE.Quaternion[] = [];
  hips = new THREE.Vector3();
  constructor() {
    for (let i = 0; i < BONE_COUNT; i++) this.q.push(new THREE.Quaternion());
  }
  copy(o: Pose) {
    for (let i = 0; i < BONE_COUNT; i++) this.q[i].copy(o.q[i]);
    this.hips.copy(o.hips);
    return this;
  }
  setRest(def: SkeletonDef) {
    for (let i = 0; i < BONE_COUNT; i++) this.q[i].identity();
    this.hips.copy(def.offsets[1]);
    return this;
  }
  /** Normalized lerp/slerp blend into this. */
  blend(a: Pose, b: Pose, t: number) {
    for (let i = 0; i < BONE_COUNT; i++) this.q[i].slerpQuaternions(a.q[i], b.q[i], t);
    this.hips.lerpVectors(a.hips, b.hips, t);
    return this;
  }
}

/** World (root-space) transforms computed from a pose. */
export class PoseFK {
  pos: THREE.Vector3[] = [];
  rot: THREE.Quaternion[] = [];
  constructor() {
    for (let i = 0; i < BONE_COUNT; i++) {
      this.pos.push(new THREE.Vector3());
      this.rot.push(new THREE.Quaternion());
    }
  }
  compute(pose: Pose, def: SkeletonDef) {
    for (let i = 0; i < BONE_COUNT; i++) {
      const p = PARENT[i];
      if (p < 0) {
        this.pos[i].set(0, 0, 0);
        this.rot[i].copy(pose.q[i]);
      } else if (i === 1) {
        this.pos[i].copy(pose.hips);
        this.rot[i].copy(this.rot[p]).multiply(pose.q[i]);
      } else {
        this.pos[i].copy(def.offsets[i]).applyQuaternion(this.rot[p]).add(this.pos[p]);
        this.rot[i].copy(this.rot[p]).multiply(pose.q[i]);
      }
    }
    return this;
  }
}

/** Apply a pose to three.js bones. */
export function applyPoseToBones(pose: Pose, bones: THREE.Bone[]) {
  for (let i = 0; i < BONE_COUNT; i++) bones[i].quaternion.copy(pose.q[i]);
  bones[1].position.copy(pose.hips);
}
