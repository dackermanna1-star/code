// Texture atlas layout shared by the body geometry (UVs) and the skin painter.
// Regions are [x, y, w, h] in canvas pixels of a 512x512 skin. Lofted parts map
// u (around the part, 0.5 = front / +X, 0.25 = right side, 0.75 = left side, 0|1 = back)
// across the width and their bind-pose height (z, GoldSrc units) down the height.
export const TEX = 512;

export const REG = {
  torso: [0, 0, 256, 176],
  head: [256, 0, 256, 128],
  handR: [256, 128, 32, 48],
  handL: [288, 128, 32, 48],
  footR: [320, 128, 96, 48],
  footL: [416, 128, 96, 48],
  armR: [0, 176, 96, 224],
  armL: [96, 176, 96, 224],
  legR: [192, 176, 128, 224],
  legL: [320, 176, 128, 224],
  can: [448, 176, 64, 112],
  emit: [448, 288, 64, 56],
  pouch: [448, 344, 64, 56],
  helmet: [0, 400, 192, 112],
  visor: [192, 400, 128, 112],
  misc: [320, 400, 160, 112],
  misc2: [480, 400, 32, 112],
};

// Height ranges (bind pose, GoldSrc units) mapped to v = 0..1 of each region.
export const ZR = {
  torso: [34.2, 64.0],
  head: [61.4, 72.2],
  arm: [34.0, 60.6],
  hand: [28.0, 35.4],
  leg: [3.0, 41.2],
  foot: [-3.9, 9.8], // along X (heel -> toe)
  helmet: [66.0, 73.4],
  visor: [62.0, 69.6],
  misc: [68.6, 72.6],
};

export const vOf = (range, z) => (z - range[0]) / (range[1] - range[0]);
