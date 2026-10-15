// Rig: maps a loaded skeleton (Mixamo names, "mixamorig:" prefixed, or UE/UAL names) onto canonical joints
// and records rest-pose data in character-root space (+Z forward, +X = character LEFT, +Y up).
// All procedural animation is expressed against this data, so it works for identity-rest rigs (the shipped
// characters) and arbitrary-rest rigs (the Soldier fallback) alike.
import * as THREE from 'three';
import { worldPos, worldQuat } from './IK';

export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
export type Finger = (typeof FINGERS)[number];
export type Side = 'L' | 'R';

export type BoneKey =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'upperChest'
  | 'neck'
  | 'head'
  | 'headTop'
  | `shoulder${Side}`
  | `upperArm${Side}`
  | `lowerArm${Side}`
  | `hand${Side}`
  | `upperLeg${Side}`
  | `lowerLeg${Side}`
  | `foot${Side}`
  | `toes${Side}`
  | `toeEnd${Side}`
  | `${Finger}${1 | 2 | 3}${Side}`;

const MIXAMO: Record<string, BoneKey> = {
  hips: 'hips',
  spine: 'spine',
  spine1: 'chest',
  spine2: 'upperChest',
  neck: 'neck',
  head: 'head',
  headtop_end: 'headTop',
};
const UE: Record<string, BoneKey> = {
  pelvis: 'hips',
  spine_01: 'spine',
  spine_02: 'chest',
  spine_03: 'upperChest',
  neck_01: 'neck',
  head: 'head',
};
for (const [S, s, side] of [
  ['left', 'l', 'L'],
  ['right', 'r', 'R'],
] as const) {
  Object.assign(MIXAMO, {
    [`${S}shoulder`]: `shoulder${side}`,
    [`${S}arm`]: `upperArm${side}`,
    [`${S}forearm`]: `lowerArm${side}`,
    [`${S}hand`]: `hand${side}`,
    [`${S}upleg`]: `upperLeg${side}`,
    [`${S}leg`]: `lowerLeg${side}`,
    [`${S}foot`]: `foot${side}`,
    [`${S}toebase`]: `toes${side}`,
    [`${S}toe_end`]: `toeEnd${side}`,
  });
  Object.assign(UE, {
    [`clavicle_${s}`]: `shoulder${side}`,
    [`upperarm_${s}`]: `upperArm${side}`,
    [`lowerarm_${s}`]: `lowerArm${side}`,
    [`hand_${s}`]: `hand${side}`,
    [`thigh_${s}`]: `upperLeg${side}`,
    [`calf_${s}`]: `lowerLeg${side}`,
    [`foot_${s}`]: `foot${side}`,
    [`ball_${s}`]: `toes${side}`,
  });
  for (const f of FINGERS) {
    const F = f[0].toUpperCase() + f.slice(1);
    for (const k of [1, 2, 3] as const) {
      MIXAMO[`${S}hand${F.toLowerCase()}${k}`] = `${f}${k}${side}` as BoneKey;
      UE[`${f}_0${k}_${s}`] = `${f}${k}${side}` as BoneKey;
    }
  }
}

function normalizeName(n: string): string {
  return n
    .replace(/^mixamorig[:_]?/i, '')
    .replace(/^armature[|:]/i, '')
    .toLowerCase();
}

export interface LimbRest {
  /** Rest direction (root space) from this bone to its child joint. */
  dir: THREE.Vector3;
  length: number;
}

export interface HandRest {
  /** Rest finger direction (hand → middle knuckle), root space. */
  finger: THREE.Vector3;
  /** Rest palm normal (out of the palm), root space. */
  palm: THREE.Vector3;
  /** The same two vectors in the hand bone's local frame. */
  fingerLocal: THREE.Vector3;
  palmLocal: THREE.Vector3;
}

const _q = new THREE.Quaternion();
const _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4();

export class Rig {
  readonly bones: Partial<Record<BoneKey, THREE.Bone>> = {};
  /** Rest local quaternions (to restore bones not driven by any clip). */
  readonly restLocal = new Map<THREE.Object3D, THREE.Quaternion>();
  readonly restLocalPos = new Map<THREE.Object3D, THREE.Vector3>();
  /** Rest joint positions in root space. */
  readonly restPos: Partial<Record<BoneKey, THREE.Vector3>> = {};
  /** Rest bone matrices in root space (for attachments defined relative to the rest pose). */
  readonly restMatrix: Partial<Record<BoneKey, THREE.Matrix4>> = {};
  readonly hand: Partial<Record<Side, HandRest>> = {};
  /** Distance from the ground to the hips joint in rest pose. */
  hipHeight = 0.95;
  /** Overall rest height (feet to head top). */
  height = 1.8;
  legLength = 0.9;
  armLength = 0.6;
  ok = false;

  constructor(readonly modelRoot: THREE.Object3D) {
    modelRoot.traverse((o) => {
      if (!(o as THREE.Bone).isBone) return;
      const n = normalizeName(o.name);
      const key = MIXAMO[n] ?? UE[n];
      if (key && !this.bones[key]) this.bones[key] = o as THREE.Bone;
      this.restLocal.set(o, o.quaternion.clone());
      this.restLocalPos.set(o, o.position.clone());
    });
    this.ok = !!(this.bones.hips && this.bones.spine && this.bones.head && this.bones.upperArmL && this.bones.upperArmR && this.bones.upperLegL && this.bones.upperLegR && this.bones.handL && this.bones.handR && this.bones.footL && this.bones.footR && this.bones.lowerLegL && this.bones.lowerArmL);
  }

  /**
   * Measure rest data. `root` is the character root (identity transform at measure time); the model may
   * contain its own axis/scale conversion nodes, which are preserved.
   */
  measure(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    _inv.copy(root.matrixWorld).invert();
    for (const [key, bone] of Object.entries(this.bones) as [BoneKey, THREE.Bone][]) {
      _m.multiplyMatrices(_inv, bone.matrixWorld);
      this.restMatrix[key] = _m.clone();
      this.restPos[key] = new THREE.Vector3().setFromMatrixPosition(_m);
    }
    const rp = this.restPos;
    if (!rp.headTop && rp.head && rp.neck) {
      // Estimate the head top from the neck→head direction.
      rp.headTop = rp.head.clone().add(rp.head.clone().sub(rp.neck).normalize().multiplyScalar(0.2));
    }
    const footY = Math.min(rp.footL?.y ?? 0, rp.footR?.y ?? 0) - 0.08;
    this.hipHeight = (rp.hips?.y ?? 0.95) - footY;
    this.height = (rp.headTop?.y ?? 1.75) - footY;
    if (rp.upperLegL && rp.lowerLegL && rp.footL) this.legLength = rp.upperLegL.distanceTo(rp.lowerLegL) + rp.lowerLegL.distanceTo(rp.footL);
    if (rp.upperArmL && rp.lowerArmL && rp.handL) this.armLength = rp.upperArmL.distanceTo(rp.lowerArmL) + rp.lowerArmL.distanceTo(rp.handL);
    for (const side of ['L', 'R'] as const) this.measureHand(root, side);
  }

  private measureHand(root: THREE.Object3D, side: Side): void {
    const rp = this.restPos;
    const hand = rp[`hand${side}`];
    const mid = rp[`middle1${side}`] ?? rp[`index1${side}`];
    const idx = rp[`index1${side}`];
    const pinky = rp[`pinky1${side}`] ?? rp[`ring1${side}`];
    const handBone = this.bones[`hand${side}`];
    if (!hand || !handBone) return;
    const finger = new THREE.Vector3();
    const across = new THREE.Vector3();
    if (mid) finger.copy(mid).sub(hand).normalize();
    else {
      const lower = rp[`lowerArm${side}`]!;
      finger.copy(hand).sub(lower).normalize();
    }
    if (idx && pinky) across.copy(pinky).sub(idx).normalize();
    else across.set(0, 0, -1);
    // Palm normal: right hand = finger × (index→pinky); left hand mirrored.
    const palm = side === 'R' ? new THREE.Vector3().crossVectors(finger, across) : new THREE.Vector3().crossVectors(across, finger);
    palm.normalize();
    // Local-frame versions.
    root.updateMatrixWorld(true);
    worldQuat(handBone, _q);
    const rootQ = worldQuat(root, new THREE.Quaternion());
    // bone rest quat in root space
    const boneRootQ = rootQ.invert().multiply(_q);
    const invB = boneRootQ.clone().invert();
    this.hand[side] = {
      finger,
      palm,
      fingerLocal: finger.clone().applyQuaternion(invB),
      palmLocal: palm.clone().applyQuaternion(invB),
    };
  }

  /** Restore rest local rotations for all bones. */
  resetToRest(): void {
    for (const [b, q] of this.restLocal) b.quaternion.copy(q);
    for (const [b, p] of this.restLocalPos) b.position.copy(p);
  }

  private snapshot: { b: THREE.Object3D; q: THREE.Quaternion; p: THREE.Vector3 }[] | null = null;

  /**
   * Save the pose written by the mixer. three.js' PropertyMixer skips writing values that did not change
   * since its previous update, so before the next mixer update the bones must hold exactly what the
   * mixer last wrote (not the procedurally edited pose) — see restorePostMixer().
   */
  savePostMixer(): void {
    if (!this.snapshot) {
      this.snapshot = [];
      for (const b of this.restLocal.keys()) this.snapshot.push({ b, q: new THREE.Quaternion(), p: new THREE.Vector3() });
    }
    for (const e of this.snapshot) {
      e.q.copy(e.b.quaternion);
      e.p.copy(e.b.position);
    }
  }

  /** Undo last frame's procedural edits (back to the last mixer output; rest pose before the first). */
  restorePostMixer(): void {
    if (!this.snapshot) {
      this.resetToRest();
      return;
    }
    for (const e of this.snapshot) {
      e.b.quaternion.copy(e.q);
      e.b.position.copy(e.p);
    }
  }

  bonePos(key: BoneKey, out: THREE.Vector3): THREE.Vector3 | null {
    const b = this.bones[key];
    return b ? worldPos(b, out) : null;
  }
}

/** Find which way a model faces: +1 if toes point to +Z (asset convention), -1 if -Z. */
export function detectFacing(rig: Rig): number {
  const rp = rig.restPos;
  const foot = rp.footL ?? rp.footR;
  const toe = rp.toesL ?? rp.toesR ?? rp.toeEndL;
  if (!foot || !toe) return 1;
  return toe.z - foot.z >= 0 ? 1 : -1;
}

