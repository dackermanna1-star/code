// Printed artwork (book covers, paintings, posters, photos, labels, control panels, clock
// faces, displays, the persian rug, printed pages) is drawn as ONE complete picture per
// 256² tile, unlike tileable material textures. A face carrying it must show exactly one
// tile; with the builder's random per-part uv offset it would otherwise show the picture
// wrapped around a tile seam (sky below the meadow, book titles split in half).
// PURE MODULE (no Babylon): used by the batcher and unit-tested in Node.
//
// Two mechanisms:
//  1. printedFaceUV() — the proper, fracture-stable fix for builders: a UVMap for a face such
//     that the face spans exactly one tile. The map lives in the face attributes, which
//     fracture preserves, so fragments keep showing their piece of the picture.
//  2. fitPrintedUVs() — the batcher's fallback for faces that were not mapped that way: each
//     connected face (component of printed-surface triangles) whose uv bounds CROSS a tile
//     seam and plausibly cover one whole picture (0.5..1.5 tiles in both directions) is
//     remapped onto exactly one tile (stretched to the face's aspect, inset by half a texel so
//     REPEAT filtering does not bleed the opposite edge in). Faces already inside one tile
//     (e.g. mapped by printedFaceUV, intact or fractured), narrow strips (cylinder label tiles,
//     book spines) and large intentionally tiled areas are left untouched.

import type { SurfaceDef } from "./surfaces.ts";

/** Texture names whose art fills one whole tile. Surfaces registered later with these textures are printed too. */
export const PRINTED_TEXTURES: ReadonlySet<string> = new Set<string>([
  "proc:book_cover_0",
  "proc:book_cover_1",
  "proc:book_cover_2",
  "proc:book_cover_3",
  "proc:painting_0",
  "proc:painting_1",
  "proc:poster_0",
  "proc:photo_0",
  "proc:rug_pattern",
  "proc:clock_face",
  "proc:label_food",
  "proc:label_bottle",
  "proc:paper_printed",
  "proc:panel_microwave",
  "proc:panel_appliance",
  "proc:display_digits",
]);

export function isPrintedSurface(s: Pick<SurfaceDef, "tex">): boolean {
  return PRINTED_TEXTURES.has(s.tex);
}

/** Texel inset (in tile units) for fitted faces: half a texel of a 256² layer. */
export const FIT_INSET = 0.5 / 256;

interface V3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Builder helper (fracture-stable): UVMap {u, v, u0, v0} for a planar face such that
 * uv = (p·u + u0, p·v + v0) spans exactly one tile of a surface with `worldSize` (metres),
 * the picture upright (image up = `up` projected onto the face, default +Y, or −Z for faces
 * looking up/down, matching geom autoUV) and not mirrored when seen from outside.
 * `points` are the face's vertices, `n` its outward unit normal.
 */
export function printedFaceUV(points: readonly V3[], n: V3, worldSize: number, up?: V3): { u: V3; v: V3; u0: number; v0: number } {
  const ws = worldSize > 1e-6 ? worldSize : 1;
  // image up axis V: projected `up` (default world up; floors/ceilings use −Z like autoUV)
  let ux = up?.x ?? 0,
    uy = up?.y ?? 1,
    uz = up?.z ?? 0;
  if (!up && Math.abs(n.y) > 0.9) {
    ux = 0;
    uy = 0;
    uz = n.y > 0 ? 1 : -1;
  }
  const d = ux * n.x + uy * n.y + uz * n.z;
  let vx = ux - n.x * d,
    vy = uy - n.y * d,
    vz = uz - n.z * d;
  let vl = Math.hypot(vx, vy, vz);
  if (vl < 1e-9) {
    // degenerate up: pick any axis perpendicular to n
    vx = Math.abs(n.x) < 0.9 ? 1 : 0;
    vy = Math.abs(n.x) < 0.9 ? 0 : 1;
    vz = 0;
    const dd = vx * n.x + vy * n.y;
    vx -= n.x * dd;
    vy -= n.y * dd;
    vz -= n.z * dd;
    vl = Math.hypot(vx, vy, vz) || 1;
  }
  vx /= vl;
  vy /= vl;
  vz /= vl;
  // right axis U = cross(n, V)  (api-notes §1.4: upright + unmirrored from outside)
  const rx = n.y * vz - n.z * vy,
    ry = n.z * vx - n.x * vz,
    rz = n.x * vy - n.y * vx;
  let a0 = Infinity,
    a1 = -Infinity,
    b0 = Infinity,
    b1 = -Infinity;
  for (const p of points) {
    const a = p.x * rx + p.y * ry + p.z * rz,
      b = p.x * vx + p.y * vy + p.z * vz;
    if (a < a0) a0 = a;
    if (a > a1) a1 = a;
    if (b < b0) b0 = b;
    if (b > b1) b1 = b;
  }
  const span = ws * (1 - 2 * FIT_INSET);
  const su = a1 - a0 > 1e-9 ? span / (a1 - a0) : 1;
  const sv = b1 - b0 > 1e-9 ? span / (b1 - b0) : 1;
  return {
    u: { x: rx * su, y: ry * su, z: rz * su },
    v: { x: vx * sv, y: vy * sv, z: vz * sv },
    u0: ws * FIT_INSET - a0 * su,
    v0: ws * FIT_INSET - b0 * sv,
  };
}

/** Reusable scratch for fitPrintedUVs (grown on demand). */
export class PrintedFitScratch {
  parent = new Int32Array(256);
  bounds = new Float64Array(256 * 4);
  ensure(vc: number): void {
    if (this.parent.length < vc) {
      this.parent = new Int32Array(vc * 2);
      this.bounds = new Float64Array(vc * 8);
    }
  }
}

function find(parent: Int32Array, i: number): number {
  let r = i;
  while (parent[r] !== r) r = parent[r];
  while (parent[i] !== r) {
    const n = parent[i];
    parent[i] = r;
    i = n;
  }
  return r;
}

/**
 * Writes tile-unit uvs (raw uv × invWorldSize, printed faces fitted, see header) for every
 * vertex of a geom into `out` (2 floats per vertex). `invWS(s)` returns 1/worldSize of surface
 * s and `printed(s)` whether it carries printed art. Returns the number of fitted faces.
 */
export function fitPrintedUVs(
  uvs: Float32Array,
  surf: Uint16Array,
  indices: Uint32Array,
  vc: number,
  invWS: (s: number) => number,
  printed: (s: number) => boolean,
  out: Float32Array,
  scratch: PrintedFitScratch,
): number {
  scratch.ensure(vc);
  const parent = scratch.parent;
  for (let v = 0; v < vc; v++) {
    const k = invWS(surf[v]);
    out[v * 2] = uvs[v * 2] * k;
    out[v * 2 + 1] = uvs[v * 2 + 1] * k;
    parent[v] = printed(surf[v]) ? v : -1;
  }
  // connected faces: union the vertices of triangles that are entirely one printed surface
  const nIdx = indices.length - (indices.length % 3);
  for (let t = 0; t < nIdx; t += 3) {
    const a = indices[t],
      b = indices[t + 1],
      c = indices[t + 2];
    if (a >= vc || b >= vc || c >= vc) continue;
    if (parent[a] < 0 || parent[b] < 0 || parent[c] < 0) continue;
    if (surf[a] !== surf[b] || surf[a] !== surf[c]) continue;
    const ra = find(parent, a),
      rb = find(parent, b),
      rc = find(parent, c);
    if (rb !== ra) parent[rb] = ra;
    if (rc !== ra) parent[rc] = ra;
  }
  // per-component uv bounds, stored at the root's slot: clear, then accumulate
  const B = scratch.bounds;
  for (let v = 0; v < vc; v++) {
    if (parent[v] < 0 || find(parent, v) !== v) continue;
    const o = v * 4;
    B[o] = Infinity;
    B[o + 1] = -Infinity;
    B[o + 2] = Infinity;
    B[o + 3] = -Infinity;
  }
  for (let v = 0; v < vc; v++) {
    if (parent[v] < 0) continue;
    const o = find(parent, v) * 4;
    const u = out[v * 2],
      w = out[v * 2 + 1];
    if (u < B[o]) B[o] = u;
    if (u > B[o + 1]) B[o + 1] = u;
    if (w < B[o + 2]) B[o + 2] = w;
    if (w > B[o + 3]) B[o + 3] = w;
  }
  // decide per component, then remap its vertices
  let fitted = 0;
  const EPS = 1e-4;
  for (let v = 0; v < vc; v++) {
    if (parent[v] < 0 || find(parent, v) !== v) continue;
    const o = v * 4;
    const u0 = B[o],
      u1 = B[o + 1],
      w0 = B[o + 2],
      w1 = B[o + 3];
    const eu = u1 - u0,
      ew = w1 - w0;
    const insideU = Math.floor(u0 + EPS) === Math.floor(u1 - EPS);
    const insideV = Math.floor(w0 + EPS) === Math.floor(w1 - EPS);
    const plausible = eu >= 0.5 && eu <= 1.5 && ew >= 0.5 && ew <= 1.5;
    if ((insideU && insideV) || !plausible) {
      B[o] = NaN; // marker: leave this component as is
      continue;
    }
    fitted++;
  }
  if (fitted === 0) return 0;
  const span = 1 - 2 * FIT_INSET;
  for (let v = 0; v < vc; v++) {
    if (parent[v] < 0) continue;
    const o = find(parent, v) * 4;
    const u0 = B[o];
    if (u0 !== u0) continue;
    const eu = B[o + 1] - u0,
      ew = B[o + 3] - B[o + 2];
    out[v * 2] = FIT_INSET + ((out[v * 2] - u0) / eu) * span;
    out[v * 2 + 1] = FIT_INSET + ((out[v * 2 + 1] - B[o + 2]) / ew) * span;
  }
  return fitted;
}
