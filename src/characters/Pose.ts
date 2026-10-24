import * as THREE from 'three';
import { PART_COUNT } from './Rig';

export const J = {
  pelvis: 0,
  torso: 1,
  head: 2,
  uarmL: 3,
  larmL: 4,
  uarmR: 5,
  larmR: 6,
  thighL: 7,
  shinL: 8,
  thighR: 9,
  shinR: 10,
} as const;
export type JointName = keyof typeof J;
export const JOINT_NAMES = Object.keys(J) as JointName[];

/** Pose authoring format: Euler degrees [x, y, z], applied in XZY (intrinsic) order. */
export type PoseDef = Partial<Record<JointName, [number, number, number]>> & {
  /** pelvis translation offset from bind (meters, character-local) */
  root?: [number, number, number];
};

const D2R = Math.PI / 180;
const _e = new THREE.Euler(0, 0, 0, 'XZY');

export class Pose {
  q: THREE.Quaternion[] = [];
  root = new THREE.Vector3();
  /** per-joint flag: does this pose define the joint (for masked blending) */
  has: boolean[] = [];
  hasRoot = false;
  constructor() {
    for (let i = 0; i < PART_COUNT; i++) {
      this.q.push(new THREE.Quaternion());
      this.has.push(false);
    }
  }
  copy(o: Pose): this {
    for (let i = 0; i < PART_COUNT; i++) {
      this.q[i].copy(o.q[i]);
      this.has[i] = o.has[i];
    }
    this.root.copy(o.root);
    this.hasRoot = o.hasRoot;
    return this;
  }
  identity(): this {
    for (let i = 0; i < PART_COUNT; i++) {
      this.q[i].identity();
      this.has[i] = true;
    }
    this.root.set(0, 0, 0);
    this.hasRoot = true;
    return this;
  }
  setJoint(j: number, xDeg: number, yDeg: number, zDeg: number): this {
    _e.set(xDeg * D2R, yDeg * D2R, zDeg * D2R, 'XZY');
    this.q[j].setFromEuler(_e);
    this.has[j] = true;
    return this;
  }
  /** Blend toward `o` by weight w on the joints `o` defines (and mask allows). */
  blend(o: Pose, w: number, mask?: ArrayLike<number>): this {
    if (w <= 0) return this;
    for (let i = 0; i < PART_COUNT; i++) {
      if (!o.has[i]) continue;
      const mw = mask ? mask[i] * w : w;
      if (mw <= 0) continue;
      if (mw >= 1) this.q[i].copy(o.q[i]);
      else this.q[i].slerp(o.q[i], mw);
    }
    if (o.hasRoot) {
      const mw = mask ? (mask as any).root ?? mask[0] : 1;
      const rw = Math.min(1, w * mw);
      if (rw > 0) this.root.lerp(o.root, rw);
    }
    return this;
  }
}

export function poseFromDef(def: PoseDef): Pose {
  const p = new Pose();
  for (const name of JOINT_NAMES) {
    const v = def[name];
    if (v) p.setJoint(J[name], v[0], v[1], v[2]);
  }
  if (def.root) {
    p.root.set(def.root[0], def.root[1], def.root[2]);
    p.hasRoot = true;
  }
  return p;
}

/** Merge pose defs (later overrides earlier). */
export function mergeDefs(...defs: PoseDef[]): PoseDef {
  const out: PoseDef = {};
  for (const d of defs) Object.assign(out, d);
  return out;
}

/** Mirror a pose def left<->right. */
export function mirrorDef(def: PoseDef): PoseDef {
  const out: PoseDef = {};
  const swap: Record<string, JointName> = {
    uarmL: 'uarmR',
    uarmR: 'uarmL',
    larmL: 'larmR',
    larmR: 'larmL',
    thighL: 'thighR',
    thighR: 'thighL',
    shinL: 'shinR',
    shinR: 'shinL',
  };
  for (const name of JOINT_NAMES) {
    const v = def[name];
    if (!v) continue;
    const target = (swap[name] ?? name) as JointName;
    out[target] = [v[0], -v[1], -v[2]];
  }
  if (def.root) out.root = [-def.root[0], def.root[1], def.root[2]];
  return out;
}

// ---------------------------------------------------------------- masks
function mask(joints: JointName[], root = 0): Float32Array & { root?: number } {
  const m = new Float32Array(PART_COUNT) as Float32Array & { root?: number };
  for (const j of joints) m[J[j]] = 1;
  m.root = root;
  return m;
}
export const MASK = {
  full: mask(JOINT_NAMES as JointName[], 1),
  upper: mask(['torso', 'head', 'uarmL', 'larmL', 'uarmR', 'larmR']),
  arms: mask(['uarmL', 'larmL', 'uarmR', 'larmR']),
  armsHead: mask(['uarmL', 'larmL', 'uarmR', 'larmR', 'head']),
  rArm: mask(['uarmR', 'larmR']),
  lArm: mask(['uarmL', 'larmL']),
  legs: mask(['pelvis', 'thighL', 'shinL', 'thighR', 'shinR'], 1),
  upperLegs: mask(['torso', 'head', 'uarmL', 'larmL', 'uarmR', 'larmR', 'thighL', 'shinL', 'thighR', 'shinR'], 1),
};
export type MaskName = keyof typeof MASK;
