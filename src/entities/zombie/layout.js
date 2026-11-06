// Shared constants for the zombie body: Minecraft-style skin layout (64×64), bones, visibility groups,
// per-variant proportions.
//
// Skin layout follows the classic Minecraft 64×64 skin (base layer + overlay layer). Unused areas hold
// gore / mouth / accessory swatches:
//   gore  (0,0)  8×8   stump caps         mouth (24,0) 8×8  palate (rows 0-3) + tongue (rows 4-7)
//   accA (56,0) 8×8   hat brims / visors  accB (56,16) 8×16 backpack     accC (56,32) 8×16 pustules
// Base-layer pixels with alpha ≈ 230 are rendered as faint glow (zombie eyes).

/** metres per skin pixel: 32 px tall body = 1.8 m */
export const PX = 1.8 / 32;
export const SKIN = 64;

export const REGIONS = {
  head: { base: [0, 0], over: [32, 0], dims: [8, 8, 8] },
  torso: { base: [16, 16], over: [16, 32], dims: [8, 12, 4] },
  armR: { base: [40, 16], over: [40, 32], dims: [4, 12, 4] },
  armL: { base: [32, 48], over: [48, 48], dims: [4, 12, 4] },
  legR: { base: [0, 16], over: [0, 32], dims: [4, 12, 4] },
  legL: { base: [16, 48], over: [0, 48], dims: [4, 12, 4] },
};

export const FREE = {
  gore: [0, 0, 8, 8],
  mouth: [24, 0, 8, 8],
  accA: [56, 0, 8, 8],
  accB: [56, 16, 8, 16],
  accC: [56, 32, 8, 16],
};

export const FACES = ['top', 'bottom', 'right', 'front', 'left', 'back'];

/** Image-space rect [x, y, w, h] of a box face in the Minecraft box UV layout. */
export function faceRect(u, v, w, h, d, face) {
  switch (face) {
    case 'top': return [u + d, v, w, d];
    case 'bottom': return [u + d + w, v, w, d];
    case 'right': return [u, v + d, d, h];
    case 'front': return [u + d, v + d, w, h];
    case 'left': return [u + d + w, v + d, d, h];
    default: return [u + 2 * d + w, v + d, w, h]; // back
  }
}

// Bones (index into the bone matrix array)
export const BONE = {
  torso: 0, head: 1, jaw: 2,
  armUR: 3, armLR: 4, armUL: 5, armLL: 6,
  legUR: 7, legLR: 8, legUL: 9, legLL: 10,
};
export const NUM_BONES = 11;

// Visibility groups (bits of the uHidden mask)
export const GROUP = {
  torso: 0, head: 1, jaw: 2,
  armUR: 3, armLR: 4, armUL: 5, armLL: 6,
  legUR: 7, legLR: 8, legUL: 9, legLL: 10,
  stumpNeck: 11, stumpShR: 12, stumpElR: 13, stumpShL: 14, stumpElL: 15,
  stumpHipR: 16, stumpKnR: 17, stumpHipL: 18, stumpKnL: 19,
  backpack: 20, visor: 21, brim: 22, pustules: 23, hat: 24,
};
export const STUMP_MASK = (1 << GROUP.stumpNeck) | (1 << GROUP.stumpShR) | (1 << GROUP.stumpElR) |
  (1 << GROUP.stumpShL) | (1 << GROUP.stumpElL) | (1 << GROUP.stumpHipR) | (1 << GROUP.stumpKnR) |
  (1 << GROUP.stumpHipL) | (1 << GROUP.stumpKnL);
export const ACCESSORY_MASK = (1 << GROUP.backpack) | (1 << GROUP.visor) | (1 << GROUP.brim) | (1 << GROUP.pustules);

/** Per-variant body proportions in skin pixels (geometry is stretched, UVs stay Minecraft-sized). */
export const VARIANT_DIMS = {
  walker: { torso: [8, 12, 4], arm: [4, 4], leg: [4, 4], scale: 1.0 },
  runner: { torso: [7, 12, 3.4], arm: [3.2, 3.2], leg: [3.4, 3.4], scale: 1.0 },
  crawler: { torso: [8, 12, 4], arm: [4, 4], leg: [4, 4], scale: 1.0 },
  brute: { torso: [10.5, 12, 6], arm: [5.2, 5.2], leg: [5, 5], scale: 1.3 },
  screamer: { torso: [7, 12, 3.2], arm: [3, 3], leg: [3.2, 3.2], scale: 1.02 },
  bloater: { torso: [10, 12, 6], arm: [4.6, 4.6], leg: [4.8, 4.8], scale: 1.05, belly: [9.6, 1, 2.6, 9.6, 4.2] },
};

/** Joint layout (pixels, unscaled) derived from the variant dims. */
export function jointLayout(dims) {
  const [tw, th] = dims.torso;
  const aw = dims.arm[0];
  return {
    hipY: 12,
    neckY: th,
    shoulderX: tw / 2 + aw / 2,
    shoulderY: th - 2,
    legX: tw / 4,
    elbowY: -4,
    kneeY: -6,
    jaw: [0, 2, -3.5],
  };
}
