// Render-geometry generation from convex polyhedra: triangulation, optional tessellation of
// large faces (so deformable sheets can dent), dent fields, crack-line overlays. PURE MODULE.
// Contract owned by the orchestrator; implementation by the geometry agent.

import type { Vec3 } from "./vec.ts";
import type { ConvexPoly } from "./poly.ts";
import type { Rng } from "../core/rng.ts";

/**
 * Raw triangle soup for one part, in the part's (island) frame. Triangles use the winding
 * Babylon treats as front-facing with default backFaceCulling (the implementation verifies
 * this with a runtime probe and documents it). Flat faces get duplicated vertices so
 * normals are crisp; smoothing groups / per-vertex normals share normals.
 */
export interface RenderGeom {
  positions: Float32Array; // xyz
  normals: Float32Array; // xyz
  uvs: Float32Array; // uv in METRES (batcher divides by surface world size)
  surf: Uint16Array; // surface index per vertex
  tint: Uint32Array; // 0xRRGGBB per vertex (face tint, possibly darkened by damage)
  indices: Uint32Array;
  vertexCount: number;
}

/** Procedural dent stored on a part: vertices near p are pushed along dir with a smooth falloff. */
export interface Dent {
  p: Vec3;
  /** Unit push direction (usually the impact direction, i.e. into the surface). */
  dir: Vec3;
  /** Falloff radius (m). */
  r: number;
  /** Peak displacement (m). */
  depth: number;
}

/** A crack drawn on a surface: a polyline lying on the face (slightly offset along n when rendered). */
export interface Crack {
  points: Vec3[];
  /** Surface normal at the crack (unit). */
  n: Vec3;
  /** Line width (m). */
  width: number;
}

export interface MeshGenOptions {
  /** If > 0, faces larger than this cell size (m) are subdivided into a grid (for denting). */
  tessCell?: number;
  dents?: Dent[];
  cracks?: Crack[];
  /** Surface index used to render crack lines (dark). */
  crackSurf?: number;
  /** Multiply tint towards black near dents (scuffing) by this factor (0..1). Default 0.25. */
  dentDarken?: number;
}

/** Triangulate a convex poly (+ tessellation, dents applied to vertices, crack overlays). */
export function polyToRenderGeom(poly: ConvexPoly, opts?: MeshGenOptions): RenderGeom {
  throw new Error("geom/meshgen.ts: polyToRenderGeom not implemented");
}

/** Concatenate several geoms (indices rebased). */
export function mergeRenderGeoms(geoms: RenderGeom[]): RenderGeom {
  throw new Error("geom/meshgen.ts: mergeRenderGeoms not implemented");
}

/** Apply dents to arbitrary positions in place (used for collider refresh after big bends). */
export function applyDents(positions: Float32Array, dents: Dent[]): void {
  throw new Error("geom/meshgen.ts: applyDents not implemented");
}

/**
 * Grow branching crack polylines on the surface of `poly` starting at `impact` (on/near the
 * face whose normal best matches -dir). `severity` 0..1 controls count/length; `radial`
 * gives a glass-style star + concentric rings. Cracks stay on the hit face (clipped to it).
 */
export function growCracks(
  poly: ConvexPoly,
  impact: Vec3,
  dir: Vec3,
  severity: number,
  rng: Rng,
  opts?: { radial?: boolean; maxLength?: number; width?: number },
): Crack[] {
  throw new Error("geom/meshgen.ts: growCracks not implemented");
}
