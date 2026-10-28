// Curved-shape helpers that decompose non-convex objects into convex tiles (bowls, basins,
// tubs, rings, cushions, bottles). Each tile is a ConvexPoly; callers bond tiles together with
// `fused` bonds so the object behaves as one solid until it breaks along tile seams (and tiles
// themselves can further fracture). PURE MODULE. Implementation by the geometry agent.

import type { Vec3, Xform } from "./vec.ts";
import type { ConvexPoly, FaceAttr } from "./poly.ts";

export interface Tile {
  poly: ConvexPoly;
  /** Grid coordinates of the tile (ring index around, row index along the profile). */
  i: number;
  j: number;
}

export interface LatheOptions {
  /** Profile as [radius, y] points from bottom to top (the outer surface). */
  profile: Array<[number, number]>;
  /** Wall thickness (m), measured inward along the profile normal. */
  thickness: number;
  /** Segments around the axis. */
  segments: number;
  /** Optional angular range (radians) for partial lathes (e.g. a basin's back cut-off). Default full 2π. */
  angleStart?: number;
  angleEnd?: number;
  /** Close the bottom with a cap tile set (bowls, cups). */
  capBottom?: boolean;
  outer: FaceAttr; // smooth group should be non-zero
  inner: FaceAttr;
  edge: FaceAttr; // rim / seams
  xf?: Xform;
}

/** Thick-walled surface of revolution split into convex tiles (segments × profile spans). */
export function latheTiles(opts: LatheOptions): Tile[] {
  throw new Error("geom/primitives.ts: latheTiles not implemented");
}

/** Ring / torus segment tiles (toilet seat, steering-wheel-like rings, pipe elbows). */
export function torusTiles(
  majorR: number,
  minorR: number,
  segments: number,
  sides: number,
  attr: FaceAttr,
  xf?: Xform,
  arc?: number,
): Tile[] {
  throw new Error("geom/primitives.ts: torusTiles not implemented");
}

/** Curved panel (cylindrical arc) of given radius/arc/height/thickness split into convex strips. */
export function arcPanelTiles(
  radius: number,
  arc: number,
  height: number,
  thickness: number,
  segments: number,
  outer: FaceAttr,
  inner: FaceAttr,
  edge: FaceAttr,
  xf?: Xform,
): Tile[] {
  throw new Error("geom/primitives.ts: arcPanelTiles not implemented");
}

/** Convex approximation of an ellipsoid (smooth shaded) — fruit, knobs, bulbs. */
export function polyEllipsoid(radii: Vec3, segments: number, rings: number, attr: FaceAttr, xf?: Xform): ConvexPoly {
  throw new Error("geom/primitives.ts: polyEllipsoid not implemented");
}

/** Rounded "pillow" box (convex, smooth shaded): cushions, mattresses, pillows. */
export function polyPillow(size: Vec3, roundness: number, attr: FaceAttr, xf?: Xform): ConvexPoly {
  throw new Error("geom/primitives.ts: polyPillow not implemented");
}

/** Hollow rectangular frame (picture frame, window frame, door casing) as 4 convex bars with mitred ends. */
export function frameBars(
  outerW: number,
  outerH: number,
  bar: number,
  depth: number,
  attr: FaceAttr,
  xf?: Xform,
): ConvexPoly[] {
  throw new Error("geom/primitives.ts: frameBars not implemented");
}

/** Split a box-shaped slab into an nx × ny grid of convex boxes (tiles, pre-scored panels). */
export function slabGrid(size: Vec3, nx: number, ny: number, gap: number, attr: FaceAttr, xf?: Xform): Tile[] {
  throw new Error("geom/primitives.ts: slabGrid not implemented");
}
