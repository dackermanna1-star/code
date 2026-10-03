import * as THREE from 'three';

/**
 * Humanoid skeleton. In the bind pose every bone is world-aligned (identity
 * rotation), the character faces +Z, its left side is +X, and limbs hang
 * straight down along -Y.
 */
export const BONES = [
  'root',
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'clavL',
  'uArmL',
  'fArmL',
  'handL',
  'clavR',
  'uArmR',
  'fArmR',
  'handR',
  'thighL',
  'shinL',
  'footL',
  'toeL',
  'thighR',
  'shinR',
  'footR',
  'toeR',
] as const;
export type CoreBone = (typeof BONES)[number];
/** Core bones plus per-character extras (cloth, the wheel). */
export type BoneName = CoreBone | 'sleeveL' | 'sleeveR' | 'skirtF' | 'skirtB' | 'skirtL' | 'skirtR' | 'skirtF2' | 'skirtB2' | 'skirtL2' | 'skirtR2' | 'tailL' | 'tailR' | 'wheel';

export interface ExtraBone {
  name: BoneName;
  parent: BoneName;
  /** bind-pose world position */
  at: THREE.Vector3;
}

const PARENT: Record<CoreBone, CoreBone | null> = {
  root: null,
  hips: 'root',
  spine: 'hips',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  clavL: 'chest',
  uArmL: 'clavL',
  fArmL: 'uArmL',
  handL: 'fArmL',
  clavR: 'chest',
  uArmR: 'clavR',
  fArmR: 'uArmR',
  handR: 'fArmR',
  thighL: 'hips',
  shinL: 'thighL',
  footL: 'shinL',
  toeL: 'footL',
  thighR: 'hips',
  shinR: 'thighR',
  footR: 'shinR',
  toeR: 'footR',
};

/** Joint heights and lengths (metres) for a figure facing +Z. */
export interface Proportions {
  hips: number;
  spine: number;
  chest: number;
  neck: number;
  head: number;
  clavX: number;
  clavY: number;
  shoulderX: number;
  uArm: number;
  fArm: number;
  hipX: number;
  thighTop: number;
  thigh: number;
  shin: number;
  toe: number;
  ankle: number;
}

/** Satoru Gojo: 190 cm, long-legged. */
export const PROP_GOJO: Proportions = {
  hips: 1.02,
  spine: 1.13,
  chest: 1.3,
  neck: 1.54,
  head: 1.62,
  clavX: 0.03,
  clavY: 1.5,
  shoulderX: 0.2,
  uArm: 0.31,
  fArm: 0.27,
  hipX: 0.095,
  thighTop: 0.99,
  thigh: 0.47,
  shin: 0.44,
  toe: 0.14,
  ankle: 0.08,
};

export function scaleProps(p: Proportions, k: number): Proportions {
  const o = { ...p };
  for (const key of Object.keys(o) as (keyof Proportions)[]) o[key] *= k;
  return o;
}

/** Bind-pose world positions of each joint. */
export function jointPositions(p: Proportions): Record<CoreBone, THREE.Vector3> {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const kneeY = p.thighTop - p.thigh;
  const ankleY = kneeY - p.shin;
  const elbowY = p.clavY - p.uArm;
  const wristY = elbowY - p.fArm;
  return {
    root: V(0, 0, 0),
    hips: V(0, p.hips, 0),
    spine: V(0, p.spine, -0.01),
    chest: V(0, p.chest, -0.015),
    neck: V(0, p.neck, -0.02),
    head: V(0, p.head, -0.005),
    clavL: V(p.clavX, p.clavY, -0.02),
    uArmL: V(p.shoulderX, p.clavY - 0.01, -0.02),
    fArmL: V(p.shoulderX, elbowY, -0.025),
    handL: V(p.shoulderX, wristY, -0.01),
    clavR: V(-p.clavX, p.clavY, -0.02),
    uArmR: V(-p.shoulderX, p.clavY - 0.01, -0.02),
    fArmR: V(-p.shoulderX, elbowY, -0.025),
    handR: V(-p.shoulderX, wristY, -0.01),
    thighL: V(p.hipX, p.thighTop, 0),
    shinL: V(p.hipX, kneeY, 0.005),
    footL: V(p.hipX, ankleY, -0.01),
    toeL: V(p.hipX, 0.025, p.toe),
    thighR: V(-p.hipX, p.thighTop, 0),
    shinR: V(-p.hipX, kneeY, 0.005),
    footR: V(-p.hipX, ankleY, -0.01),
    toeR: V(-p.hipX, 0.025, p.toe),
  };
}

export class Rig {
  readonly bones = {} as Record<BoneName, THREE.Bone>;
  readonly list: THREE.Bone[] = [];
  readonly names: BoneName[] = [];
  readonly joints: Record<BoneName, THREE.Vector3>;
  readonly skeleton: THREE.Skeleton;
  /** Rest local positions (for squash and root motion). */
  readonly rest = {} as Record<BoneName, THREE.Vector3>;

  constructor(
    readonly p: Proportions,
    extras: ExtraBone[] = [],
  ) {
    this.joints = jointPositions(p) as Record<BoneName, THREE.Vector3>;
    const parents = { ...PARENT } as Record<BoneName, BoneName | null>;
    for (const e of extras) {
      this.joints[e.name] = e.at.clone();
      parents[e.name] = e.parent;
    }
    const names = [...BONES, ...extras.map((e) => e.name)] as BoneName[];
    for (const n of names) {
      const b = new THREE.Bone();
      b.name = n;
      this.bones[n] = b;
      this.list.push(b);
      this.names.push(n);
    }
    for (const n of names) {
      const par = parents[n];
      const b = this.bones[n];
      const w = this.joints[n];
      if (par) {
        b.position.subVectors(w, this.joints[par]);
        this.bones[par].add(b);
      } else b.position.copy(w);
      this.rest[n] = b.position.clone();
    }
    this.bones.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.list);
  }

  index(n: BoneName) {
    return this.names.indexOf(n);
  }

  has(n: BoneName) {
    return this.names.includes(n);
  }
}
