export const TILE = 2.5;
export const PIT_DEPTH = 3.2;
export const LAVA_DEPTH = 0.55;
export const CORRIDOR_CEIL = 3.4;

export const C = {
  SOLID: 0,
  FLOOR: 1,
  PIT: 2,
  LAVA: 3,
};

export const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export const cellToWorld = (cx, cy) => [(cx + 0.5) * TILE, (cy + 0.5) * TILE];
export const worldToCell = (x, z) => [Math.floor(x / TILE), Math.floor(z / TILE)];
