import * as THREE from 'three';

/**
 * Canonical humanoid skeleton used by every character.
 * Character space: faces +Z, up +Y, character's LEFT is +X.
 * Every bone's rest (bind) world orientation is identity; only offsets differ.
 */
export const B = {
  root: 0, hips: 1, spine: 2, chest: 3, neck: 4, head: 5,
  clavL: 6, uarmL: 7, farmL: 8, handL: 9,
  clavR: 10, uarmR: 11, farmR: 12, handR: 13,
  thighL: 14, shinL: 15, footL: 16, toeL: 17,
  thighR: 18, shinR: 19, footR: 20, toeR: 21,
} as const;
export type BoneId = (typeof B)[keyof typeof B];
export const BONE_COUNT = 22;
export const BONE_NAMES = Object.keys(B) as (keyof typeof B)[];
export const PARENT: number[] = [
  -1, 0, 1, 2, 3, 4,
  3, 6, 7, 8,
  3, 10, 11, 12,
  1, 14, 15, 16,
  1, 18, 19, 20,
];

/** Body build parameters. All multipliers default to 1. */
export interface BodySpec {
  height: number; // overall scale (1 = 1.80 m)
  shoulders: number; // shoulder width multiplier
  hipsW: number; // pelvis width multiplier
  arms: number; // arm length multiplier
  legs: number; // leg length multiplier
  neckLen: number;
  headSize: number;
  bulk: number; // muscle mass (radius multiplier for limbs/torso)
  gut: number; // belly
  chestDepth: number;
  armsDownDeg: number; // A-pose angle
}
export const DEFAULT_BODY: BodySpec = {
  height: 1, shoulders: 1, hipsW: 1, arms: 1, legs: 1, neckLen: 1, headSize: 1, bulk: 1, gut: 0, chestDepth: 1, armsDownDeg: 48,
};

export interface SkeletonDef {
  spec: BodySpec;
  /** Rest offset of each bone from its parent (character space). */
  offsets: THREE.Vector3[];
  /** Rest world positions (character space). */
  rest: THREE.Vector3[];
  /** Primary bone axis at rest (unit), used by IK/retarget. */
  restDir: THREE.Vector3[];
  /** Secondary axis at rest (elbow/knee pointing direction, back of hand, ...). */
  restUp: THREE.Vector3[];
  lenUpperArm: number;
  lenForeArm: number;
  lenThigh: number;
  lenShin: number;
  ankleHeight: number;
  footLen: number; // ankle -> ball
  hipHeight: number;
  headTop: number;
  scale: number;
}

export function buildSkeletonDef(specIn: Partial<BodySpec> = {}): SkeletonDef {
  const spec: BodySpec = { ...DEFAULT_BODY, ...specIn };
  const s = spec.height;
  const L = spec.legs;
  const A = spec.arms;
  const off: THREE.Vector3[] = [];
  for (let i = 0; i < BONE_COUNT; i++) off.push(new THREE.Vector3());

  const thighLen = 0.435 * L * s;
  const shinLen = 0.415 * L * s;
  const ankleH = 0.075 * s;
  const hipJointY = ankleH + thighLen + shinLen; // ~0.925
  const hipsY = hipJointY + 0.06 * s;

  off[B.hips].set(0, hipsY, 0);
  off[B.spine].set(0, 0.11 * s, -0.005 * s);
  off[B.chest].set(0, 0.2 * s, 0.0);
  off[B.neck].set(0, 0.245 * s, -0.012 * s);
  off[B.head].set(0, 0.09 * s * spec.neckLen, 0.012 * s);

  const shoulderX = 0.152 * s * spec.shoulders;
  const ang = spec.armsDownDeg * (Math.PI / 180);
  const ux = Math.cos(ang), uy = -Math.sin(ang);
  const upperArm = 0.29 * A * s;
  const foreArm = 0.26 * A * s;
  for (const side of [1, -1]) {
    const cl = side > 0 ? B.clavL : B.clavR;
    const ua = side > 0 ? B.uarmL : B.uarmR;
    const fa = side > 0 ? B.farmL : B.farmR;
    const ha = side > 0 ? B.handL : B.handR;
    off[cl].set(0.03 * side * s, 0.16 * s, 0.012 * s);
    off[ua].set(shoulderX * side, 0.012 * s, -0.025 * s);
    off[fa].set(ux * upperArm * side, uy * upperArm, 0);
    off[ha].set(ux * foreArm * side, uy * foreArm, 0);

    const th = side > 0 ? B.thighL : B.thighR;
    const sh = side > 0 ? B.shinL : B.shinR;
    const ft = side > 0 ? B.footL : B.footR;
    const to = side > 0 ? B.toeL : B.toeR;
    off[th].set(0.092 * side * s * spec.hipsW, -0.06 * s, 0.0);
    off[sh].set(0, -thighLen, 0.012 * s);
    off[ft].set(0, -shinLen + 0.0, -0.012 * s);
    off[to].set(0, -0.05 * s, 0.13 * s);
  }

  const rest: THREE.Vector3[] = [];
  for (let i = 0; i < BONE_COUNT; i++) {
    const p = off[i].clone();
    if (PARENT[i] >= 0) p.add(rest[PARENT[i]]);
    rest.push(p);
  }

  const restDir: THREE.Vector3[] = [];
  const restUp: THREE.Vector3[] = [];
  for (let i = 0; i < BONE_COUNT; i++) {
    restDir.push(new THREE.Vector3(0, 1, 0));
    restUp.push(new THREE.Vector3(0, 0, 1));
  }
  const childOf: Record<number, number> = {
    [B.uarmL]: B.farmL, [B.farmL]: B.handL, [B.uarmR]: B.farmR, [B.farmR]: B.handR,
    [B.thighL]: B.shinL, [B.shinL]: B.footL, [B.thighR]: B.shinR, [B.shinR]: B.footR,
    [B.clavL]: B.uarmL, [B.clavR]: B.uarmR,
  };
  for (const k of Object.keys(childOf)) {
    const i = Number(k);
    restDir[i].copy(off[childOf[i]]).normalize();
  }
  // Hands continue the forearm direction; back of hand faces up/out.
  restDir[B.handL].copy(restDir[B.farmL]);
  restDir[B.handR].copy(restDir[B.farmR]);
  restUp[B.handL].set(-uy, ux, 0).normalize(); // perpendicular, pointing up-out for left
  restUp[B.handR].set(uy, ux, 0).normalize();
  // Elbows point backwards, knees forward.
  for (const i of [B.uarmL, B.farmL, B.uarmR, B.farmR]) restUp[i].set(0, 0, -1);
  for (const i of [B.thighL, B.shinL, B.thighR, B.shinR]) restUp[i].set(0, 0, 1);
  restUp[B.clavL].set(0, 1, 0);
  restUp[B.clavR].set(0, 1, 0);

  return {
    spec,
    offsets: off,
    rest,
    restDir,
    restUp,
    lenUpperArm: upperArm,
    lenForeArm: foreArm,
    lenThigh: thighLen,
    lenShin: Math.hypot(off[B.footL].y, off[B.footL].z),
    ankleHeight: ankleH,
    footLen: 0.14 * s,
    hipHeight: hipsY,
    headTop: rest[B.head].y + 0.2 * s * spec.headSize,
    scale: s,
  };
}

/** Create three.js bones in rest pose (identity rotations). */
export function createBones(def: SkeletonDef): THREE.Bone[] {
  const bones: THREE.Bone[] = [];
  for (let i = 0; i < BONE_COUNT; i++) {
    const b = new THREE.Bone();
    b.name = BONE_NAMES[i];
    b.position.copy(def.offsets[i]);
    bones.push(b);
    if (PARENT[i] >= 0) bones[PARENT[i]].add(b);
  }
  return bones;
}

export const isLeftBone = (i: number) =>
  i === B.clavL || i === B.uarmL || i === B.farmL || i === B.handL || i === B.thighL || i === B.shinL || i === B.footL || i === B.toeL;

/** Mirror map L<->R. */
export const MIRROR: number[] = (() => {
  const m = Array.from({ length: BONE_COUNT }, (_, i) => i);
  const pairs: [number, number][] = [
    [B.clavL, B.clavR], [B.uarmL, B.uarmR], [B.farmL, B.farmR], [B.handL, B.handR],
    [B.thighL, B.thighR], [B.shinL, B.shinR], [B.footL, B.footR], [B.toeL, B.toeR],
  ];
  for (const [a, b] of pairs) {
    m[a] = b;
    m[b] = a;
  }
  return m;
})();
