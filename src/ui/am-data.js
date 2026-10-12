// am_map.c palette ranges and vector shapes (map units; arrow points east).

export const REDS = 256 - 5 * 16;
export const REDRANGE = 16;
export const BLUES = 256 - 4 * 16 + 8;
export const GREENS = 7 * 16;
export const GRAYS = 6 * 16;
export const GRAYSRANGE = 16;
export const BROWNS = 4 * 16;
export const YELLOWS = 256 - 32 + 7;
export const WHITE = 256 - 47;
export const GRIDCOLORS = GRAYS + GRAYSRANGE / 2;
export const XHAIRCOLORS = GRAYS;

// Boom-style key colours for the iddt things view, by doomednum.
export const KEY_COLORS = new Map([
  [5, BLUES], [40, BLUES], // blue keycard / skull key
  [6, YELLOWS], [39, YELLOWS], // yellow
  [13, REDS], [38, REDS], // red
]);

// Each entry is [ax, ay, bx, by].
const R = (8 * 16) / 7;
export const PLAYER_ARROW = [
  [-R + R / 8, 0, R, 0], // -----
  [R, 0, R - R / 2, R / 4], // ----->
  [R, 0, R - R / 2, -R / 4],
  [-R + R / 8, 0, -R - R / 8, R / 4], // >---->
  [-R + R / 8, 0, -R - R / 8, -R / 4],
  [-R + 3 * R / 8, 0, -R + R / 8, R / 4], // >>--->
  [-R + 3 * R / 8, 0, -R + R / 8, -R / 4],
];

export const CHEAT_PLAYER_ARROW = [
  [-R + R / 8, 0, R, 0], // -----
  [R, 0, R - R / 2, R / 6], // ----->
  [R, 0, R - R / 2, -R / 6],
  [-R + R / 8, 0, -R - R / 8, R / 6], // >----->
  [-R + R / 8, 0, -R - R / 8, -R / 6],
  [-R + 3 * R / 8, 0, -R + R / 8, R / 6], // >>----->
  [-R + 3 * R / 8, 0, -R + R / 8, -R / 6],
  [-R / 2, 0, -R / 2, -R / 6], // >>-d--->
  [-R / 2, -R / 6, -R / 2 + R / 6, -R / 6],
  [-R / 2 + R / 6, -R / 6, -R / 2 + R / 6, R / 4],
  [-R / 6, 0, -R / 6, -R / 6], // >>-dd-->
  [-R / 6, -R / 6, 0, -R / 6],
  [0, -R / 6, 0, R / 4],
  [R / 6, R / 4, R / 6, -R / 7], // >>-ddt->
  [R / 6, -R / 7, R / 6 + R / 32, -R / 7 - R / 32],
  [R / 6 + R / 32, -R / 7 - R / 32, R / 6 + R / 10, -R / 7],
];

// Unit triangle for things, scaled by the caller (16 units).
export const THINTRIANGLE_GUY = [
  [-0.5, -0.7, 1, 0],
  [1, 0, -0.5, 0.7],
  [-0.5, 0.7, -0.5, -0.7],
];
