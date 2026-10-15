// Template joint poses (root space: +Z forward, +X = character LEFT, +Y up) used for hitboxes before the
// skinned model is loaded/animated. The animated skeleton replaces these as soon as it is available.
import { JOINT_COUNT, JOINT_INDEX, type PoseJoint, type PosePoints } from '../anim/types';

type J = Partial<Record<PoseJoint, [number, number, number]>>;

/** Rifle-ready standing pose. Left-side joints are given; right side mirrors X unless overridden. */
const STAND: J = {
  hips: [0, 0.98, 0],
  spine: [0, 1.1, 0],
  chest: [0, 1.24, 0.01],
  upperChest: [0, 1.36, 0.0],
  neck: [0, 1.52, 0.0],
  head: [0, 1.6, 0.02],
  headTop: [0, 1.8, 0.03],
  upperArmL: [0.19, 1.42, 0],
  lowerArmL: [0.22, 1.18, 0.12],
  handL: [0.06, 1.24, 0.36],
  fingersL: [0.03, 1.24, 0.44],
  upperArmR: [-0.19, 1.42, 0],
  lowerArmR: [-0.27, 1.17, -0.02],
  handR: [-0.12, 1.12, 0.17],
  fingersR: [-0.1, 1.11, 0.25],
  upperLegL: [0.1, 0.93, 0],
  lowerLegL: [0.11, 0.5, 0.02],
  footL: [0.12, 0.08, -0.04],
  toesL: [0.13, 0.03, 0.12],
};

function build(j: J): PosePoints {
  const out = new Float32Array(JOINT_COUNT * 3);
  for (const [name, idx] of Object.entries(JOINT_INDEX) as [PoseJoint, number][]) {
    let p = j[name];
    if (!p && name.endsWith('R')) {
      const l = j[(name.slice(0, -1) + 'L') as PoseJoint];
      if (l) p = [-l[0], l[1], l[2]];
    }
    if (!p) p = [0, 0, 0];
    out[idx * 3] = p[0];
    out[idx * 3 + 1] = p[1];
    out[idx * 3 + 2] = p[2];
  }
  return out;
}

function transform(src: PosePoints, fn: (x: number, y: number, z: number, joint: PoseJoint) => [number, number, number]): PosePoints {
  const out = new Float32Array(src.length);
  for (const [name, idx] of Object.entries(JOINT_INDEX) as [PoseJoint, number][]) {
    const r = fn(src[idx * 3], src[idx * 3 + 1], src[idx * 3 + 2], name);
    out[idx * 3] = r[0];
    out[idx * 3 + 1] = r[1];
    out[idx * 3 + 2] = r[2];
  }
  return out;
}

const isLeg = (j: PoseJoint) => j.startsWith('upperLeg') || j.startsWith('lowerLeg') || j.startsWith('foot') || j.startsWith('toes');

export const TEMPLATE_STAND = build(STAND);

/** Crouch: hips at 0.62, knees forward, upper body leaning slightly forward. */
export const TEMPLATE_CROUCH = transform(TEMPLATE_STAND, (x, y, z, j) => {
  if (isLeg(j)) {
    if (j.startsWith('upperLeg')) return [x, 0.6, z];
    if (j.startsWith('lowerLeg')) return [x, 0.5, z + 0.36];
    if (j.startsWith('foot')) return [x, 0.08, z + 0.02];
    return [x, 0.03, z + 0.18];
  }
  const dy = y - 0.98;
  return [x, 0.62 + dy * 0.95, z + dy * 0.18];
});

/** Prone: body lying along +Z (head forward), centered on the root. */
export const TEMPLATE_PRONE = transform(TEMPLATE_STAND, (x, y, z, j) => {
  // Rotate the standing pose forward by 90° about the hips (y → z), lower to the ground.
  const hipY = 0.98;
  const along = y - hipY; // + toward the head
  let nz = along - 0.05;
  let ny = 0.17 - z * 0.6;
  if (j.startsWith('hand') || j.startsWith('fingers') || j.startsWith('lowerArm')) {
    // Arms forward holding the weapon.
    ny = 0.22;
    nz = j.startsWith('lowerArm') ? 0.55 : j.startsWith('hand') ? 0.75 : 0.83;
    x = x * 0.9;
  }
  if (j === 'head' || j === 'headTop') ny = 0.3 + (j === 'headTop' ? 0.08 : 0);
  return [x, Math.max(0.06, ny), nz];
});

/** Knocked: kneeling, torso forward, one hand on the ground. */
export const TEMPLATE_KNOCKED = transform(TEMPLATE_CROUCH, (x, y, z, j) => {
  if (j.startsWith('lowerLeg')) return [x, 0.1, z];
  if (j.startsWith('upperLeg')) return [x, 0.5, z - 0.05];
  if (j.startsWith('foot')) return [x, 0.12, z - 0.45];
  if (j.startsWith('toes')) return [x, 0.05, z - 0.55];
  if (isLeg(j)) return [x, y, z];
  const dy = y - 0.62;
  return [x, 0.5 + dy * 0.75, z + dy * 0.45];
});

/** Seated (vehicle): hips at the root origin + 0.5, thighs forward. */
export const TEMPLATE_SEATED = transform(TEMPLATE_STAND, (x, y, z, j) => {
  if (j.startsWith('upperLeg')) return [x, 0.5, z];
  if (j.startsWith('lowerLeg')) return [x, 0.5, z + 0.44];
  if (j.startsWith('foot')) return [x, 0.08, z + 0.5];
  if (j.startsWith('toes')) return [x, 0.04, z + 0.64];
  return [x, y - 0.48, z];
});

export function templateFor(state: 'stand' | 'crouch' | 'prone' | 'knocked' | 'seated'): PosePoints {
  switch (state) {
    case 'crouch':
      return TEMPLATE_CROUCH;
    case 'prone':
      return TEMPLATE_PRONE;
    case 'knocked':
      return TEMPLATE_KNOCKED;
    case 'seated':
      return TEMPLATE_SEATED;
    default:
      return TEMPLATE_STAND;
  }
}
