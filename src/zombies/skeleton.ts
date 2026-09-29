/**
 * Voxel-style body definitions. Every body has 11 parts driven either by the
 * procedural animator (alive) or by physics (ragdoll).
 *
 * Part frames: each part has a pivot (joint) and its box extends from the pivot
 * by `center` (so rotating a part rotates about its joint). Rest pose = all
 * local rotations identity, character faces +Z, feet on y = 0.
 */

export const enum P {
  Pelvis = 0,
  Torso = 1,
  Head = 2,
  UArmL = 3,
  LArmL = 4,
  UArmR = 5,
  LArmR = 6,
  ULegL = 7,
  LLegL = 8,
  ULegR = 9,
  LLegR = 10,
}
export const PART_COUNT = 11;

/** Part "types" share one instanced mesh (L/R limbs share geometry). */
export const enum PT {
  Pelvis = 0,
  Torso = 1,
  Head = 2,
  UArm = 3,
  LArm = 4,
  ULeg = 5,
  LLeg = 6,
}
export const PART_TYPE_COUNT = 7;
export const PART_TO_TYPE = [PT.Pelvis, PT.Torso, PT.Head, PT.UArm, PT.LArm, PT.UArm, PT.LArm, PT.ULeg, PT.LLeg, PT.ULeg, PT.LLeg];
/** Index of this part among parts of the same type (0 = left/single, 1 = right). */
export const PART_SIDE = [0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1];
export const PART_PARENT = [-1, P.Pelvis, P.Torso, P.Torso, P.UArmL, P.Torso, P.UArmR, P.Pelvis, P.ULegL, P.Pelvis, P.ULegR];
export const PART_NAMES = ['pelvis', 'torso', 'head', 'uarmL', 'larmL', 'uarmR', 'larmR', 'ulegL', 'llegL', 'ulegR', 'llegR'];

export interface PartDef {
  /** Box size in meters (w, h, d). */
  size: [number, number, number];
  /** Pixel dims of the skin unwrap (W, H, D). */
  px: [number, number, number];
  /** Unwrap origin (pixels) inside the 128x64 skin cell, per side (L, R). */
  uv: [number, number][];
  /** Offset from pivot to box center (meters). */
  center: [number, number, number];
  /** Pivot position relative to the parent's pivot in rest pose (per side). */
  pivot: [number, number, number][];
  /** Extra box merged into the geometry (feet, snouts): size, center rel. pivot, pixel unwrap dims+origin. */
  extra?: { size: [number, number, number]; center: [number, number, number]; px: [number, number, number]; uv: [number, number] };
}

export interface BodyDef {
  id: 'human' | 'dog';
  parts: PartDef[]; // indexed by PT
  /** Pelvis pivot height above the feet in rest pose. */
  hipHeight: number;
  height: number;
  radius: number;
  /** Joint limits for ragdolls, per part index (child of joint): [xmin,xmax,ymin,ymax,zmin,zmax]. */
  limits: number[][];
  /** Revolute (hinge about local X) joints. */
  hinge: boolean[];
  /** Ragdoll density per part type. */
  density: number[];
}

export const SKIN_W = 128;
export const SKIN_H = 64;

// Human: ~1.85m tall. L = +X side (character faces +Z).
export const HUMAN: BodyDef = {
  id: 'human',
  hipHeight: 0.93,
  height: 1.85,
  radius: 0.28,
  parts: [
    { size: [0.34, 0.2, 0.2], px: [12, 6, 7], uv: [[84, 0]], center: [0, 0, 0], pivot: [[0, 0.93, 0]] },
    { size: [0.4, 0.52, 0.22], px: [14, 18, 8], uv: [[40, 0]], center: [0, 0.26, 0], pivot: [[0, 0.1, 0]] },
    { size: [0.3, 0.3, 0.3], px: [10, 10, 10], uv: [[0, 0]], center: [0, 0.15, 0], pivot: [[0, 0.52, 0]] },
    { size: [0.11, 0.33, 0.11], px: [4, 11, 4], uv: [[0, 26], [16, 26]], center: [0, -0.165, 0], pivot: [[0.255, 0.47, 0], [-0.255, 0.47, 0]] },
    { size: [0.1, 0.35, 0.1], px: [4, 12, 4], uv: [[32, 26], [48, 26]], center: [0, -0.175, 0], pivot: [[0, -0.33, 0], [0, -0.33, 0]] },
    { size: [0.145, 0.42, 0.145], px: [5, 14, 5], uv: [[64, 26], [84, 26]], center: [0, -0.21, 0], pivot: [[0.09, -0.07, 0], [-0.09, -0.07, 0]] },
    {
      size: [0.135, 0.43, 0.135], px: [5, 14, 5], uv: [[104, 26], [0, 45]], center: [0, -0.215, 0], pivot: [[0, -0.42, 0], [0, -0.42, 0]],
      extra: { size: [0.14, 0.08, 0.24], center: [0, -0.4, 0.05], px: [5, 3, 8], uv: [84, 13] },
    },
  ],
  limits: [
    [],
    [-0.5, 1.0, -0.5, 0.5, -0.4, 0.4], // spine
    [-0.7, 0.8, -1.0, 1.0, -0.5, 0.5], // neck
    [-3.0, 1.0, -1.0, 1.0, -0.3, 2.6], // shoulder L
    [-2.5, 0.05, 0, 0, 0, 0], // elbow L (hinge)
    [-3.0, 1.0, -1.0, 1.0, -2.6, 0.3], // shoulder R
    [-2.5, 0.05, 0, 0, 0, 0], // elbow R
    [-2.0, 0.6, -0.5, 0.5, -0.15, 1.0], // hip L
    [-0.05, 2.5, 0, 0, 0, 0], // knee L
    [-2.0, 0.6, -0.5, 0.5, -1.0, 0.15], // hip R
    [-0.05, 2.5, 0, 0, 0, 0], // knee R
  ],
  hinge: [false, false, false, false, true, false, true, false, true, false, true],
  density: [1000, 1000, 380, 1050, 1050, 1050, 1050],
};

// Dog: parts reinterpreted as a quadruped. Pelvis = hindquarters, torso = chest
// (horizontal, pointing +Z), "arms" = front legs, "legs" = hind legs.
export const DOG: BodyDef = {
  id: 'dog',
  hipHeight: 0.56,
  height: 0.8,
  radius: 0.26,
  parts: [
    { size: [0.28, 0.26, 0.3], px: [8, 8, 9], uv: [[84, 0]], center: [0, 0, 0], pivot: [[0, 0.56, 0]] },
    { size: [0.3, 0.3, 0.44], px: [9, 9, 13], uv: [[40, 0]], center: [0, 0.03, 0.22], pivot: [[0, 0.02, 0.14]] },
    {
      size: [0.24, 0.22, 0.24], px: [7, 7, 7], uv: [[0, 0]], center: [0, 0.05, 0.1], pivot: [[0, 0.1, 0.42]],
      extra: { size: [0.14, 0.11, 0.16], center: [0, 0.0, 0.28], px: [4, 3, 5], uv: [64, 45] },
    },
    { size: [0.09, 0.26, 0.09], px: [3, 8, 3], uv: [[0, 26], [16, 26]], center: [0, -0.13, 0], pivot: [[0.1, -0.06, 0.34], [-0.1, -0.06, 0.34]] },
    { size: [0.08, 0.26, 0.08], px: [3, 8, 3], uv: [[32, 26], [48, 26]], center: [0, -0.13, 0], pivot: [[0, -0.26, 0], [0, -0.26, 0]] },
    { size: [0.1, 0.26, 0.11], px: [3, 8, 3], uv: [[64, 26], [84, 26]], center: [0, -0.13, 0], pivot: [[0.1, -0.06, -0.06], [-0.1, -0.06, -0.06]] },
    { size: [0.08, 0.26, 0.08], px: [3, 8, 3], uv: [[104, 26], [0, 45]], center: [0, -0.13, 0], pivot: [[0, -0.26, 0], [0, -0.26, 0]] },
  ],
  limits: [
    [],
    [-0.4, 0.4, -0.4, 0.4, -0.3, 0.3],
    [-0.7, 0.7, -0.9, 0.9, -0.5, 0.5],
    [-1.6, 1.0, -0.4, 0.4, -0.2, 0.6],
    [-0.05, 2.0, 0, 0, 0, 0],
    [-1.6, 1.0, -0.4, 0.4, -0.6, 0.2],
    [-0.05, 2.0, 0, 0, 0, 0],
    [-1.2, 1.2, -0.4, 0.4, -0.2, 0.6],
    [-2.0, 0.05, 0, 0, 0, 0],
    [-1.2, 1.2, -0.4, 0.4, -0.6, 0.2],
    [-2.0, 0.05, 0, 0, 0, 0],
  ],
  hinge: [false, false, false, false, true, false, true, false, true, false, true],
  density: [700, 700, 500, 900, 900, 900, 900],
};

export const BODIES = { human: HUMAN, dog: DOG };
export type BodyId = keyof typeof BODIES;
export const BODY_LIST: BodyDef[] = [HUMAN, DOG];

export function partDef(body: BodyDef, part: number): PartDef {
  return body.parts[PART_TO_TYPE[part]];
}
export function partPivot(body: BodyDef, part: number): [number, number, number] {
  const d = partDef(body, part);
  return d.pivot[Math.min(PART_SIDE[part], d.pivot.length - 1)];
}
