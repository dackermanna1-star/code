// The fixed gameplay camera as plain math (no three.js), so the game logic can
// use the exact projection: play-area limits, spawn/escape edges and the
// view-consistent hit test all follow what is actually on screen.
//
// Last Ferry keeps Seal Hunter's fixed, angled camera (the "diorama" feel) but
// with a 16:9 frame and a little more perspective so the pier has depth.

/** Camera pitch below the horizon (degrees). */
export const CAMERA_PITCH_DEG = 36;
/** Logical design size of the 16:9 frame (UI design pixels). */
export const DESIGN_W = 1280;
export const DESIGN_H = 720;
/** Vertical field of view (degrees). */
export const CAMERA_FOV = 24;
/** Ground point under the centre of the frame. */
export const CAMERA_TARGET = { x: 0, y: 0, z: -1.2 } as const;
/** Visible width (m) of the deck at the target depth. */
export const VIEW_WIDTH = 47;
export const CAMERA_DISTANCE = VIEW_WIDTH / 2 / ((DESIGN_W / DESIGN_H) * Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180));

const DEG = Math.PI / 180;
const SP = Math.sin(CAMERA_PITCH_DEG * DEG);
const CP = Math.cos(CAMERA_PITCH_DEG * DEG);
const TV = Math.tan((CAMERA_FOV * DEG) / 2);
const TH = TV * (DESIGN_W / DESIGN_H);
export const TAN_PITCH = SP / CP;

export const CAMERA_POS = {
  x: CAMERA_TARGET.x,
  y: CAMERA_TARGET.y + SP * CAMERA_DISTANCE,
  z: CAMERA_TARGET.z + CP * CAMERA_DISTANCE,
} as const;

/** Project a world point to frame fractions (u right, v down). */
export function worldToScreen(x: number, y: number, z: number): { u: number; v: number } {
  const dx = x - CAMERA_POS.x;
  const dy = y - CAMERA_POS.y;
  const dz = z - CAMERA_POS.z;
  const depth = -dy * SP - dz * CP;
  const cy = dy * CP - dz * SP;
  return { u: 0.5 + (dx / (depth * TH)) * 0.5, v: 0.5 - (cy / (depth * TV)) * 0.5 };
}

/** Intersect the camera ray through frame point (u, v) with the plane at height y. Returns [x, z]. */
export function screenToGround(u: number, v: number, y = 0): [number, number] {
  const nx = 2 * u - 1;
  const ny = 1 - 2 * v;
  const dx = nx * TH;
  const dy = -SP + ny * TV * CP;
  const dz = -CP - ny * TV * SP;
  const t = (y - CAMERA_POS.y) / dy;
  return [CAMERA_POS.x + dx * t, CAMERA_POS.z + dz * t];
}

/** Half of the visible frame width at ground depth z (height y). */
export function visibleHalfWidth(z: number, y = 0): number {
  const depth = -(y - CAMERA_POS.y) * SP - (z - CAMERA_POS.z) * CP;
  return depth * TH;
}

/**
 * Height at which the camera ray through world point (y, zRay) crosses the
 * vertical plane at depth zc — i.e. where a tracer at (y, zRay) appears to
 * cross a creature standing at zc. This is Seal Hunter's view-consistent hit
 * rule: what looks like a hit on screen is a hit.
 */
export function viewHeightAt(y: number, zRay: number, zc: number): number {
  const t = (zc - CAMERA_POS.z) / (zRay - CAMERA_POS.z);
  return CAMERA_POS.y + t * (y - CAMERA_POS.y);
}

/**
 * Lane (z of a gun line at height y0) that appears to cross depth zc at
 * height h: the inverse of viewHeightAt. Aim helpers (bot, crane, overlay).
 */
export function laneFor(y0: number, h: number, zc: number): number {
  const k = (y0 - CAMERA_POS.y) / (h - CAMERA_POS.y);
  return CAMERA_POS.z + (zc - CAMERA_POS.z) * k;
}
