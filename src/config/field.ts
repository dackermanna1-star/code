// Ice-floe layout.
//
// The floe outline is traced from the original game's ice art (640x480 frame,
// see docs/reference/field_original.png) as screen fractions (u = x / width,
// v = y / height) and projected through the gameplay camera onto the ice plane
// (y = 0), so the 3D floe lands exactly where the original drew it. If the
// camera constants in Stage.ts change, the world outline follows automatically.
//
// World units: metres, x right, z towards the camera, y up, ice top at y = 0.
import { CAMERA_PITCH_DEG } from './constants';
import { CAMERA_DISTANCE, CAMERA_FOV, CAMERA_TARGET, DESIGN_H, DESIGN_W } from '../render/Stage';

export type XZ = [number, number];
export type UV = [number, number];

/** Y of the ice top surface. */
export const FLOE_TOP_Y = 0;
/** Y of the sea surface around the floe. */
export const WATER_LEVEL = -3.5;
/** Y where the floe's cliff walls end (below the sea, so the waterline is a clean cut). */
export const FLOE_BOTTOM_Y = -4.5;
/** Half width of the floe in x (it extends well past both frame edges). */
export const FLOE_HALF_EXTENT_X = 30;

/**
 * Back (far) edge, left to right, in frame fractions. Points outside 0..1 are
 * straight extrapolations of the first/last visible segment. The triangular
 * notch is B (0.525,0.325) -> C (0.486,0.354) -> D (0.566,0.368): the wall under
 * B-C faces the camera and shows as the small lit triangle, and the vertical
 * corner under B is the short black stroke of the original.
 * (D sits at v=0.368 instead of the art's 0.374 to keep ~0.7 m of ice behind
 * the players' back limit.)
 */
export const FLOE_BACK_SCREEN: UV[] = [
  [-0.12, 0.3187],
  [0.0, 0.3083],
  [0.275, 0.2844],
  [0.3883, 0.3313],
  [0.525, 0.325],
  [0.4859, 0.3542],
  [0.5664, 0.368],
  [0.7367, 0.3083],
  [0.8422, 0.326],
  [1.0, 0.3083],
  [1.12, 0.2949],
];

/**
 * Front (near) edge, left to right, in frame fractions. Every interior vertex is
 * a vertical cliff corner (black stroke in the original at u = 0.10, 0.36, 0.47, 0.63).
 */
export const FLOE_FRONT_SCREEN: UV[] = [
  [-0.03, 0.9031],
  [0.1, 0.9396],
  [0.3609, 0.9104],
  [0.4711, 0.9604],
  [0.6266, 0.9042],
  [1.04, 0.9757],
];

const DEG = Math.PI / 180;

/**
 * Project a point of the 4:3 frame (u right, v down, 0..1) onto the horizontal
 * plane at height `y` through the fixed gameplay camera. Returns world [x, z].
 */
export function screenToGround(u: number, v: number, y = 0): XZ {
  const pitch = CAMERA_PITCH_DEG * DEG;
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  const tv = Math.tan((CAMERA_FOV * DEG) / 2);
  const th = tv * (DESIGN_W / DESIGN_H);
  const px = CAMERA_TARGET.x;
  const py = CAMERA_TARGET.y + sp * CAMERA_DISTANCE;
  const pz = CAMERA_TARGET.z + cp * CAMERA_DISTANCE;
  const nx = 2 * u - 1;
  const ny = 1 - 2 * v;
  // forward (0,-sp,-cp), right (1,0,0), up (0,cp,-sp)
  const dx = nx * th;
  const dy = -sp + ny * tv * cp;
  const dz = -cp - ny * tv * sp;
  const t = (y - py) / dy;
  return [px + t * dx, pz + t * dz];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function edgeToWorld(screen: UV[]): XZ[] {
  const pts = screen.map(([u, v]) => screenToGround(u, v)).map(([x, z]) => [r2(x), r2(z)] as XZ);
  const first = pts[0];
  const last = pts[pts.length - 1];
  return [[-FLOE_HALF_EXTENT_X, first[1]], ...pts, [FLOE_HALF_EXTENT_X, last[1]]];
}

/** Back edge of the ice top in world XZ, left to right (x = -30 .. +30). */
export const FLOE_BACK: XZ[] = edgeToWorld(FLOE_BACK_SCREEN);
/** Front edge of the ice top in world XZ, left to right (x = -30 .. +30). */
export const FLOE_FRONT: XZ[] = edgeToWorld(FLOE_FRONT_SCREEN);

/**
 * Closed outline of the ice top (last vertex connects to the first), counter-
 * clockwise seen from above (+y): front edge left to right, then back edge
 * right to left. The outward normal of edge a->b is (-dz, dx) for d = b - a.
 */
export const FLOE_OUTLINE: XZ[] = [...FLOE_FRONT, ...FLOE_BACK.slice().reverse()];

/** True if (x, z) lies on the ice top (inside FLOE_OUTLINE). */
export function pointInFloe(x: number, z: number, outline: XZ[] = FLOE_OUTLINE): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, zi] = outline[i];
    const [xj, zj] = outline[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Signed distance (m) from (x, z) to the floe outline: positive inside the
 * floe, negative outside.
 */
export function floeEdgeDistance(x: number, z: number, outline: XZ[] = FLOE_OUTLINE): number {
  let best = Infinity;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [ax, az] = outline[j];
    const [bx, bz] = outline[i];
    const ex = bx - ax;
    const ez = bz - az;
    const len2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / len2));
    const dx = x - (ax + ex * t);
    const dz = z - (az + ez * t);
    best = Math.min(best, dx * dx + dz * dz);
  }
  const d = Math.sqrt(best);
  return pointInFloe(x, z, outline) ? d : -d;
}
