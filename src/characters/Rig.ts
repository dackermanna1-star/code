import * as THREE from 'three';

/** Body part indices. Order matters: parents precede children. */
export const P = {
  PELVIS: 0,
  TORSO: 1,
  HEAD: 2,
  UARM_L: 3,
  LARM_L: 4,
  UARM_R: 5,
  LARM_R: 6,
  THIGH_L: 7,
  SHIN_L: 8,
  THIGH_R: 9,
  SHIN_R: 10,
} as const;
export const PART_COUNT = 11;
export const PART_NAMES = ['pelvis', 'torso', 'head', 'uarmL', 'larmL', 'uarmR', 'larmR', 'thighL', 'shinL', 'thighR', 'shinR'];
export const PARENT = [-1, 0, 1, 1, 3, 1, 5, 0, 7, 0, 9];

export type PartKind = 'pelvis' | 'torso' | 'head' | 'uarm' | 'larm' | 'thigh' | 'shin';
export const PART_KIND: PartKind[] = ['pelvis', 'torso', 'head', 'uarm', 'larm', 'uarm', 'larm', 'thigh', 'shin', 'thigh', 'shin'];
export const IS_LEFT = [false, false, false, true, true, false, false, true, true, false, false];
export const IS_LIMB = [false, false, false, true, true, true, true, true, true, true, true];

/** Face indices, matching THREE.BoxGeometry group order. */
export const F = { PX: 0, NX: 1, PY: 2, NY: 3, PZ: 4, NZ: 5 } as const;

export interface Build {
  height: number; // uniform scale 0.88..1.15
  bulk: number; // width of torso/limbs 0.85..1.4
  belly: number; // torso depth 1..1.5
  headScale: number; // 0.95..1.08
}

export interface RigDims {
  /** joint position relative to parent joint at bind pose (pelvis: relative to feet) */
  joint: THREE.Vector3[];
  /** box size */
  size: THREE.Vector3[];
  /** box center relative to own joint at bind */
  center: THREE.Vector3[];
  /** voxel grid resolution */
  vox: [number, number, number][];
  /** world-space (feet-relative) bind position of each joint */
  bindWorld: THREE.Vector3[];
  /** grip point in LARM local space */
  grip: THREE.Vector3;
  height: number;
  hipHeight: number;
  eyeHeight: number;
}

export function makeRig(b: Build): RigDims {
  const s = b.height;
  const k = b.bulk;
  const hs = b.headScale;
  const torsoW = 0.46 * k;
  const torsoD = 0.26 * Math.max(k * 0.9, 1) * b.belly;
  const armW = 0.14 * (0.85 + 0.15 * k * 1.15);
  const larmW = armW * 0.93;
  const thighW = 0.18 * (0.8 + 0.2 * k);
  const shinW = thighW * 0.9;
  const pelvisW = 0.4 * (0.85 + 0.15 * k);
  const headSize = 0.34 * hs;

  const size = [
    new THREE.Vector3(pelvisW, 0.2, Math.max(0.24, torsoD * 0.92)),
    new THREE.Vector3(torsoW, 0.48, torsoD),
    new THREE.Vector3(headSize, headSize, headSize),
    new THREE.Vector3(armW, 0.32, armW),
    new THREE.Vector3(larmW, 0.36, larmW),
    new THREE.Vector3(armW, 0.32, armW),
    new THREE.Vector3(larmW, 0.36, larmW),
    new THREE.Vector3(thighW, 0.48, thighW),
    new THREE.Vector3(shinW, 0.46, shinW * 1.12),
    new THREE.Vector3(thighW, 0.48, thighW),
    new THREE.Vector3(shinW, 0.46, shinW * 1.12),
  ];
  const shoulderX = torsoW / 2 + armW / 2 - 0.005;
  const hipX = Math.max(thighW / 2 + 0.012, pelvisW / 2 - thighW / 2);
  const joint = [
    new THREE.Vector3(0, 0.95, 0),
    new THREE.Vector3(0, 0.14, 0),
    new THREE.Vector3(0, 0.48, 0),
    new THREE.Vector3(shoulderX, 0.41, 0),
    new THREE.Vector3(0, -0.29, 0),
    new THREE.Vector3(-shoulderX, 0.41, 0),
    new THREE.Vector3(0, -0.29, 0),
    new THREE.Vector3(hipX, -0.03, 0),
    new THREE.Vector3(0, -0.46, 0),
    new THREE.Vector3(-hipX, -0.03, 0),
    new THREE.Vector3(0, -0.46, 0),
  ];
  const center = [
    new THREE.Vector3(0, 0.04, 0),
    new THREE.Vector3(0, 0.24, 0),
    new THREE.Vector3(0, headSize / 2 + 0.005, 0.0),
    new THREE.Vector3(0, -0.13, 0),
    new THREE.Vector3(0, -0.17, 0),
    new THREE.Vector3(0, -0.13, 0),
    new THREE.Vector3(0, -0.17, 0),
    new THREE.Vector3(0, -0.22, 0),
    new THREE.Vector3(0, -0.23, shinW * 0.06),
    new THREE.Vector3(0, -0.22, 0),
    new THREE.Vector3(0, -0.23, shinW * 0.06),
  ];
  for (let i = 0; i < PART_COUNT; i++) {
    size[i].multiplyScalar(s);
    joint[i].multiplyScalar(s);
    center[i].multiplyScalar(s);
  }
  const vox: [number, number, number][] = size.map((sz, i) => {
    const vs = i === P.HEAD ? sz.x / 12 : 0.038 * s;
    return [
      Math.max(3, Math.round(sz.x / vs)),
      Math.max(3, Math.round(sz.y / vs)),
      Math.max(3, Math.round(sz.z / vs)),
    ] as [number, number, number];
  });
  const bindWorld: THREE.Vector3[] = [];
  for (let i = 0; i < PART_COUNT; i++) {
    const p = PARENT[i];
    bindWorld[i] = p < 0 ? joint[i].clone() : bindWorld[p].clone().add(joint[i]);
  }
  const headTop = bindWorld[P.HEAD].y + center[P.HEAD].y + size[P.HEAD].y / 2;
  return {
    joint,
    size,
    center,
    vox,
    bindWorld,
    grip: new THREE.Vector3(0, -0.3 * s, 0.0),
    height: headTop,
    hipHeight: bindWorld[P.THIGH_L].y,
    eyeHeight: bindWorld[P.HEAD].y + center[P.HEAD].y + size[P.HEAD].y * 0.06,
  };
}

/**
 * Map a point on the surface of a part box (part-local, box centered) to the
 * face index and normalized face coordinates (s: left->right, t: top->bottom
 * as seen from outside). Returns face index.
 */
export function boxFaceCoords(
  x: number,
  y: number,
  z: number,
  hx: number,
  hy: number,
  hz: number,
  out: { s: number; t: number },
  forceFace = -1,
): number {
  let face = forceFace;
  if (face < 0) {
    // choose face by largest normalized coordinate
    const ax = Math.abs(x) / hx;
    const ay = Math.abs(y) / hy;
    const az = Math.abs(z) / hz;
    if (ax >= ay && ax >= az) face = x > 0 ? F.PX : F.NX;
    else if (ay >= az) face = y > 0 ? F.PY : F.NY;
    else face = z > 0 ? F.PZ : F.NZ;
  }
  switch (face) {
    case F.PZ:
      out.s = (x + hx) / (2 * hx);
      out.t = (hy - y) / (2 * hy);
      break;
    case F.NZ:
      out.s = (hx - x) / (2 * hx);
      out.t = (hy - y) / (2 * hy);
      break;
    case F.PX:
      out.s = (hz - z) / (2 * hz);
      out.t = (hy - y) / (2 * hy);
      break;
    case F.NX:
      out.s = (z + hz) / (2 * hz);
      out.t = (hy - y) / (2 * hy);
      break;
    case F.PY:
      out.s = (x + hx) / (2 * hx);
      out.t = (z + hz) / (2 * hz);
      break;
    case F.NY:
      out.s = (x + hx) / (2 * hx);
      out.t = (hz - z) / (2 * hz);
      break;
  }
  out.s = Math.min(0.9999, Math.max(0, out.s));
  out.t = Math.min(0.9999, Math.max(0, out.t));
  return face;
}
