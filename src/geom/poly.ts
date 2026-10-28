// Convex polyhedra with per-face appearance attributes — the representation used for part
// collision hulls, fracture (Voronoi via half-space clipping) and render-geometry generation.
// PURE MODULE: no Babylon imports. Contract owned by the orchestrator; implementation by the
// geometry agent. Keep signatures stable (other modules compile against them).

import type { Vec3, Xform } from "./vec.ts";

/**
 * Planar texture mapping in METRES: uv = (dot(p, u) + u0, dot(p, v) + v0) with p in the
 * polyhedron's own frame. The batcher divides by the surface's texture world size, so
 * geometry never needs to know texture scales. For wood, `u` points along the grain.
 */
export interface UVMap {
  u: Vec3;
  v: Vec3;
  u0: number;
  v0: number;
}

/** Appearance attributes of one face. Preserved through clipping/transforming. */
export interface FaceAttr {
  /** Surface index (see src/render/surfaces.ts `SURF`). */
  surf: number;
  /** Packed 0xRRGGBB tint multiplier (0xffffff = no tint). */
  tint: number;
  uv: UVMap;
  /** True for faces created by fracture cuts (shows the material's interior surface). */
  interior: boolean;
  /** Smoothing group: faces with the same non-zero group get averaged vertex normals. 0 = flat. */
  smooth: number;
}

export interface PolyFace {
  /** Indices into ConvexPoly.verts, counter-clockwise seen from OUTSIDE: normalize(cross(v1-v0, v2-v0)) == n. */
  idx: number[];
  /** Outward unit normal. */
  n: Vec3;
  /** Plane offset: face points satisfy dot(n, p) == d; interior points satisfy dot(n, p) < d. */
  d: number;
  attr: FaceAttr;
  /** Optional per-vertex normals (same order as idx) for smooth curved surfaces (lathe tiles, cylinders). */
  vn?: Vec3[];
}

export interface ConvexPoly {
  verts: Vec3[];
  faces: PolyFace[];
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

const NI = (name: string): never => {
  throw new Error(`geom/poly.ts: ${name} not implemented`);
};

/**
 * Planar UV map (metres) for a face with unit normal n:
 *  - if `grain` is given and not (nearly) parallel to n: u = grain projected onto the face plane
 *    (normalised), v = cross(n, u) — wood texture grain runs along the board;
 *  - else for walls (|n.y| < 0.9): u = horizontal tangent normalize(cross(Y, n)) flipped so that
 *    u is consistent around a box, v = +Y (textures upright on vertical faces);
 *  - else (floors/ceilings): u = +X, v = +Z (sign-adjusted by n.y so it is not mirrored).
 * u0/v0 = offsets (metres) to decorrelate identical parts.
 */
export function autoUV(n: Vec3, offsetU = 0, offsetV = 0, grain?: Vec3): UVMap {
  return NI("autoUV");
}

/** Make a FaceAttr quickly (uv auto-derived per face when `uv` omitted at construction sites). */
export function faceAttr(surf: number, tint = 0xffffff, opts: Partial<FaceAttr> = {}): FaceAttr {
  return NI("faceAttr");
}

/**
 * Axis-aligned box of full size `size` centred at the origin, then transformed by `xf`.
 * `attrs` is either one attr for all faces or 6 attrs in order +X,-X,+Y,-Y,+Z,-Z.
 * UV maps are derived per face (in metres) unless the attr carries a non-zero uv.u.
 */
export function polyBox(size: Vec3, attrs: FaceAttr | FaceAttr[], xf?: Xform): ConvexPoly {
  return NI("polyBox");
}

/** Box with chamfered edges (still convex). bevel in metres. */
export function polyBeveledBox(size: Vec3, bevel: number, attrs: FaceAttr | FaceAttr[], xf?: Xform): ConvexPoly {
  return NI("polyBeveledBox");
}

/**
 * Cylinder (or frustum when rTop != rBottom) along local +Y, centred at the origin.
 * Side faces share smoothing group `side.smooth` (set it non-zero for smooth shading).
 */
export function polyCylinder(
  rBottom: number,
  rTop: number,
  height: number,
  segments: number,
  side: FaceAttr,
  caps: FaceAttr,
  xf?: Xform,
): ConvexPoly {
  return NI("polyCylinder");
}

/** Convex 2D polygon (x,y pairs, any winding) extruded along local Z by `depth`, centred. */
export function polyPrism(profile: Array<[number, number]>, depth: number, side: FaceAttr, caps: FaceAttr, xf?: Xform): ConvexPoly {
  return NI("polyPrism");
}

/** Convex hull of points (quickhull). Coplanar faces are merged. attr may depend on the face normal. */
export function polyFromHull(points: Vec3[], attr: FaceAttr | ((n: Vec3) => FaceAttr)): ConvexPoly {
  return NI("polyFromHull");
}

/** Rigidly transform (UV maps are carried along so textures stay attached to the surface). */
export function polyTransform(poly: ConvexPoly, xf: Xform): ConvexPoly {
  return NI("polyTransform");
}

/**
 * Clip by the half-space dot(n, p) <= d (keeps the inside). Returns null if nothing remains
 * (or the remainder is degenerate, volume < 1e-9). If `cap` is given, the new cut face gets
 * that attr; if cap.uv.u is the zero vector a planar map is auto-derived from n (using
 * `grain` for the u axis when supplied). If the plane does not cut, returns the input unchanged.
 */
export function polyClip(poly: ConvexPoly, n: Vec3, d: number, cap: FaceAttr | null, grain?: Vec3): ConvexPoly | null {
  return NI("polyClip");
}

export function polyVolume(poly: ConvexPoly): number {
  return NI("polyVolume");
}

export function polyCentroid(poly: ConvexPoly): Vec3 {
  return NI("polyCentroid");
}

export function polyBounds(poly: ConvexPoly): Bounds {
  return NI("polyBounds");
}

/** Width of the polyhedron along a unit direction (max-min of projections). */
export function polyWidth(poly: ConvexPoly, dir: Vec3): number {
  return NI("polyWidth");
}

/** Principal extents: sorted [largest, middle, smallest] widths along the poly's principal axes, plus those axes. */
export function polyExtents(poly: ConvexPoly): { ext: [number, number, number]; axes: [Vec3, Vec3, Vec3] } {
  return NI("polyExtents");
}

/** Signed distance proxy: max over faces of dot(n,p) - d (<= 0 inside). */
export function polySignedDist(poly: ConvexPoly, p: Vec3): number {
  return NI("polySignedDist");
}

/** Closest point on/in the polyhedron to p (p itself if inside). */
export function polyClosestPoint(poly: ConvexPoly, p: Vec3): Vec3 {
  return NI("polyClosestPoint");
}

/** Unique vertex positions packed xyz (for Havok convex-hull shapes). */
export function polyPoints(poly: ConvexPoly): Float32Array {
  return NI("polyPoints");
}

/** Area of the intersection face between two touching cells along plane (n,d) — used for bond strength. */
export function polyFaceAreaOnPlane(poly: ConvexPoly, n: Vec3, d: number, eps?: number): number {
  return NI("polyFaceAreaOnPlane");
}

/** Deep copy. */
export function polyClone(poly: ConvexPoly): ConvexPoly {
  return NI("polyClone");
}
