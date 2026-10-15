// Shared per-frame pose context for the procedural layers: body frame vectors in world space and helpers
// to rotate/translate bones in world space.
import * as THREE from 'three';
import type { Rig, BoneKey } from './Rig';
import { rotateWorld, worldPos, worldQuat, setWorldQuat } from './IK';

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

export class PoseContext {
  /** Body frame (world): forward, right, up of the visual root. */
  readonly fwd = new THREE.Vector3();
  readonly right = new THREE.Vector3();
  readonly up = new THREE.Vector3(0, 1, 0);
  /** Visual root world position (feet / body center on the ground). */
  readonly origin = new THREE.Vector3();
  /** View (aim) direction in world space and its frame. */
  readonly aimDir = new THREE.Vector3();
  readonly aimRight = new THREE.Vector3();
  readonly aimUp = new THREE.Vector3();
  /** Scale of the rig relative to a 1.8 m reference human. */
  scale = 1;

  constructor(readonly rig: Rig) {}

  setFrame(root: THREE.Object3D, bodyYaw: number, aimYaw: number, aimPitch: number): void {
    root.getWorldPosition(this.origin);
    this.fwd.set(-Math.sin(bodyYaw), 0, -Math.cos(bodyYaw));
    this.right.set(Math.cos(bodyYaw), 0, -Math.sin(bodyYaw));
    const cp = Math.cos(aimPitch);
    this.aimDir.set(-Math.sin(aimYaw) * cp, Math.sin(aimPitch), -Math.cos(aimYaw) * cp);
    this.aimRight.set(Math.cos(aimYaw), 0, -Math.sin(aimYaw));
    this.aimUp.crossVectors(this.aimRight, this.aimDir).normalize();
    this.scale = this.rig.height / 1.8;
  }

  bone(k: BoneKey): THREE.Bone | undefined {
    return this.rig.bones[k];
  }

  pos(k: BoneKey, out: THREE.Vector3): THREE.Vector3 {
    const b = this.rig.bones[k];
    return b ? worldPos(b, out) : out.copy(this.origin);
  }

  /** Rotate a bone about a world axis by `angle` (radians). */
  rotate(k: BoneKey, axis: THREE.Vector3, angle: number, updateChildren = true): void {
    const b = this.rig.bones[k];
    if (!b || Math.abs(angle) < 1e-5) return;
    _q.setFromAxisAngle(axis, angle);
    rotateWorld(b, _q, updateChildren);
  }

  rotateQ(k: BoneKey, q: THREE.Quaternion, updateChildren = true): void {
    const b = this.rig.bones[k];
    if (b) rotateWorld(b, q, updateChildren);
  }

  getWorldQuat(k: BoneKey, out: THREE.Quaternion): THREE.Quaternion {
    const b = this.rig.bones[k];
    return b ? worldQuat(b, out) : out.identity();
  }

  setWorldQuat(k: BoneKey, q: THREE.Quaternion, updateChildren = true): void {
    const b = this.rig.bones[k];
    if (b) setWorldQuat(b, q, updateChildren);
  }

  /** Move a bone to a world position (sets its local position through the parent). */
  setWorldPos(k: BoneKey, p: THREE.Vector3, updateChildren = true): void {
    const b = this.rig.bones[k];
    if (!b || !b.parent) return;
    _v.copy(p);
    b.parent.worldToLocal(_v);
    b.position.copy(_v);
    b.updateMatrix();
    if (updateChildren) b.updateMatrixWorld(true);
  }

  /** Refresh world matrices from a bone down (after several non-propagating edits). */
  refresh(k: BoneKey = 'hips'): void {
    this.rig.bones[k]?.updateMatrixWorld(true);
  }
}
