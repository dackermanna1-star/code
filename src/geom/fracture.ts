// Voronoi fracture of convex polyhedra + material seed patterns. PURE MODULE.
// Contract owned by the orchestrator; implementation by the geometry agent.

import type { Vec3 } from "./vec.ts";
import type { ConvexPoly, FaceAttr } from "./poly.ts";
import type { Rng } from "../core/rng.ts";

export interface FractureCell {
  poly: ConvexPoly;
  seed: Vec3;
  volume: number;
  centroid: Vec3;
  /** Neighbouring cells (indices into the returned array) with the shared face area in m². */
  neighbors: Array<{ cell: number; area: number }>;
  /** Largest principal extent (m) — used to classify micro-debris. */
  maxExtent: number;
}

export interface VoronoiOptions {
  /** Attribute for new cut faces (the material's interior surface). uv auto-derived per cut. */
  interiorAttr: FaceAttr;
  /** Optional anisotropy: distances along `axis` are divided by `factor` (>1 → cells elongated along axis: wood splinters). */
  anisotropy?: { axis: Vec3; factor: number };
  /** Grain axis used to orient interior-face UVs (wood fibre texture along the grain). */
  grain?: Vec3;
  /** Drop cells whose volume is below this (m³). Default 1e-8. */
  minVolume?: number;
}

/**
 * Split `poly` into the Voronoi cells of `seeds` (seeds outside the poly are allowed; empty
 * cells are dropped). Cells exactly tile the input (sum of volumes == input volume within 1e-6
 * relative). Must be robust to near-coplanar seeds and seeds on faces.
 */
export function voronoiFracture(poly: ConvexPoly, seeds: Vec3[], opts: VoronoiOptions): FractureCell[] {
  throw new Error("geom/fracture.ts: voronoiFracture not implemented");
}

export type SeedPattern =
  /** Annealed glass: rays from the impact in the pane plane with geometric radii + jitter, sparse far seeds. */
  | "radial"
  /** Tempered glass: jittered grid over the whole part with cell size `cell`. */
  | "dice"
  /** Ceramic/stone: seeds within `radius` of the impact plus `far` seeds elsewhere. */
  | "chunks"
  /** Wood: seeds in an ellipsoid elongated along `grain` (use with anisotropy). */
  | "splinter"
  /** Gypsum/concrete/MDF: many small seeds near the impact (crumbs) + medium chunks. */
  | "crumble"
  /** Plastic/PCB: few seeds spread across the whole part. */
  | "crack";

export interface SeedOptions {
  pattern: SeedPattern;
  /** Impact point (poly frame). */
  impact: Vec3;
  /** Impact direction (into the part, unit). */
  dir: Vec3;
  /** Breakout radius (m). Seeds of the inner cluster lie within it. */
  radius: number;
  /** Total seed count target. */
  count: number;
  /** Number of sparse "far" seeds that become the large remaining cells (default pattern-specific). */
  far?: number;
  /** Plane normal for planar parts (glass pane normal); auto-detected from the thinnest axis when omitted. */
  planeNormal?: Vec3;
  /** Wood grain axis. */
  grain?: Vec3;
  /** Grid cell for "dice". */
  cell?: number;
  rng: Rng;
}

/** Generate seed points for a pattern; all returned seeds lie inside `poly`. */
export function generateSeeds(poly: ConvexPoly, opts: SeedOptions): Vec3[] {
  throw new Error("geom/fracture.ts: generateSeeds not implemented");
}
