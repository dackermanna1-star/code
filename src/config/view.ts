// The fixed gameplay camera, as plain math (no three.js) so game logic can
// use the exact projection: play-area limits, spawn/escape edges and the
// view-consistent hit test all follow what is actually on screen.
/** Camera pitch below the horizon (degrees). */
export const CAMERA_PITCH_DEG = 32;

/** Logical design size of the 4:3 frame (original resolution). */
export const DESIGN_W = 640;
export const DESIGN_H = 480;
/** Vertical field of view (degrees). Narrow, so the view is near-orthographic like the sprites. */
export const CAMERA_FOV = 11;
/** Ground point under the centre of the frame. */
export const CAMERA_TARGET = { x: 0, y: 0, z: -7.4 } as const;
/** Distance from the target: the visible width at the target is 40 m. */
export const CAMERA_DISTANCE = 20 / ((4 / 3) * Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180));

const DEG = Math.PI / 180;
const SP = Math.sin(CAMERA_PITCH_DEG * DEG);
const CP = Math.cos(CAMERA_PITCH_DEG * DEG);
const TV = Math.tan((CAMERA_FOV * DEG) / 2);
const TH = TV * (DESIGN_W / DESIGN_H);

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
  // forward (0,-sp,-cp), right (1,0,0), up (0,cp,-sp)
  const depth = -dy * SP - dz * CP;
  const cx = dx;
  const cy = dy * CP - dz * SP;
  return { u: 0.5 + (cx / (depth * TH)) * 0.5, v: 0.5 - (cy / (depth * TV)) * 0.5 };
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
 * cross a creature standing at zc.
 */
export function viewHeightAt(y: number, zRay: number, zc: number): number {
  const t = (zc - CAMERA_POS.z) / (zRay - CAMERA_POS.z);
  return CAMERA_POS.y + t * (y - CAMERA_POS.y);
}

/** Ground depth for an original screen row (0..480) at the frame centre. */
export function rowToZ(row: number): number {
  return screenToGround(0.5, row / DESIGN_H)[1];
}
