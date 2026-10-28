// Render-geometry generation from convex polyhedra: triangulation, optional tessellation of
// large faces (so deformable sheets can dent), dent fields, crack-line overlays. PURE MODULE.
// Contract owned by the orchestrator; implementation by the geometry agent.
//
// WINDING CONVENTION (verified at runtime by tests/probes/geom-winding.probe.ts):
//   PolyFace loops are CCW seen from outside (cross(p1-p0, p2-p0) points along +n). Babylon's
//   default left-handed scene sets mesh.sideOrientation = CounterClockWise, i.e. gl.frontFace =
//   CCW in *screen* space, which for a left-handed view is CLOCKWISE seen from the front in
//   world space. RenderGeom therefore emits every triangle REVERSED: for each triangle (a,b,c)
//   of a face, normalize(cross(pb-pa, pc-pa)) == -n. Use the data as-is with default
//   backFaceCulling / sideOrientation; do not flip again in the batcher. (A right-handed scene,
//   scene.useRightHandedSystem = true, flips Babylon's default and would need reversed indices.)
//
// Tessellation (tessCell > 0) is watertight: every polyhedron edge (and every T-junction
// sub-edge) is split into ceil(len / tessCell) segments with points computed canonically from
// the lower to the higher vertex index, so both faces of an edge get bit-identical boundary
// points; interior points are a grid kept >= tessCell/2 from the boundary; each face is
// triangulated by a constrained Delaunay scheme that never alters the boundary. Dents are a
// continuous displacement field of position only, so coincident vertices of adjacent faces
// move identically and no cracks open.

import type { Vec3 } from "./vec.ts";
import type { ConvexPoly, PolyFace } from "./poly.ts";
import type { Rng } from "../core/rng.ts";
import { ConvexTriangulator } from "./tess.ts";
import { growCracksImpl, faceFrame, clipPolyline2D, to3D, type FaceFrame } from "./cracks.ts";
import { scaleOfPoints, polygonArea } from "./util.ts";

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

/** Offset of crack ribbons above their face (m). */
export const CRACK_OFFSET = 0.0005;
/** Approximate maximum number of tessellation vertices per part (huge slabs get coarser cells). */
export const TESS_VERTEX_BUDGET = 12000;
/** Tint used for crack ribbons when no crackSurf is given (texture of the face, darkened). */
const CRACK_TINT = 0x1c1916;

// ====================================================================== output accumulator
class Acc {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  surf: number[] = [];
  tint: number[] = [];
  idx: number[] = [];
  get count(): number {
    return this.surf.length;
  }
}

function pack(a: Acc): RenderGeom {
  return {
    positions: new Float32Array(a.pos),
    normals: new Float32Array(a.nrm),
    uvs: new Float32Array(a.uv),
    surf: new Uint16Array(a.surf),
    tint: new Uint32Array(a.tint),
    indices: new Uint32Array(a.idx),
    vertexCount: a.surf.length,
  };
}

// ====================================================================== dents
interface DentField {
  px: Float64Array;
  py: Float64Array;
  pz: Float64Array;
  dx: Float64Array;
  dy: Float64Array;
  dz: Float64Array;
  r2: Float64Array;
  depth: Float64Array;
  n: number;
}

function dentField(dents: Dent[] | undefined): DentField | null {
  if (!dents || dents.length === 0) return null;
  const ok = dents.filter(
    (d) =>
      d &&
      Number.isFinite(d.p?.x) &&
      Number.isFinite(d.p?.y) &&
      Number.isFinite(d.p?.z) &&
      Number.isFinite(d.dir?.x) &&
      Number.isFinite(d.dir?.y) &&
      Number.isFinite(d.dir?.z) &&
      d.r > 0 &&
      Number.isFinite(d.r) &&
      Number.isFinite(d.depth) &&
      d.depth !== 0,
  );
  if (!ok.length) return null;
  const n = ok.length;
  const f: DentField = {
    px: new Float64Array(n),
    py: new Float64Array(n),
    pz: new Float64Array(n),
    dx: new Float64Array(n),
    dy: new Float64Array(n),
    dz: new Float64Array(n),
    r2: new Float64Array(n),
    depth: new Float64Array(n),
    n,
  };
  for (let i = 0; i < n; i++) {
    const d = ok[i];
    const l = Math.hypot(d.dir.x, d.dir.y, d.dir.z) || 1;
    f.px[i] = d.p.x;
    f.py[i] = d.p.y;
    f.pz[i] = d.p.z;
    f.dx[i] = d.dir.x / l;
    f.dy[i] = d.dir.y / l;
    f.dz[i] = d.dir.z / l;
    f.r2[i] = d.r * d.r;
    f.depth[i] = d.depth;
  }
  return f;
}

const DISP = new Float64Array(5); // dx, dy, dz, wAll, wStruck

/**
 * Displacement of a point by the dent field into DISP. Falloff w = (1 - (d/r)²)², C1 at the
 * rim. wStruck = max falloff of dents pushing INTO a face with normal (nx,ny,nz) (scuff tint).
 */
function displace(F: DentField, x: number, y: number, z: number, nx: number, ny: number, nz: number): void {
  let ox = 0,
    oy = 0,
    oz = 0,
    wa = 0,
    ws = 0;
  for (let i = 0; i < F.n; i++) {
    const ex = x - F.px[i],
      ey = y - F.py[i],
      ez = z - F.pz[i];
    const d2 = ex * ex + ey * ey + ez * ez;
    if (d2 >= F.r2[i]) continue;
    const s = 1 - d2 / F.r2[i];
    const w = s * s;
    const k = F.depth[i] * w;
    ox += F.dx[i] * k;
    oy += F.dy[i] * k;
    oz += F.dz[i] * k;
    if (w > wa) wa = w;
    if (w > ws && F.dx[i] * nx + F.dy[i] * ny + F.dz[i] * nz < -0.2) ws = w;
  }
  DISP[0] = ox;
  DISP[1] = oy;
  DISP[2] = oz;
  DISP[3] = wa;
  DISP[4] = ws;
}

function darkenTint(tint: number, k: number): number {
  if (k <= 0) return tint;
  const f = Math.max(0, 1 - k);
  const r = Math.round(((tint >> 16) & 255) * f),
    g = Math.round(((tint >> 8) & 255) * f),
    b = Math.round((tint & 255) * f);
  return (r << 16) | (g << 8) | b;
}

// ====================================================================== smoothing groups
/** Angle-weighted vertex normals per smoothing group (faces without explicit vn). */
function groupNormals(poly: ConvexPoly): Map<number, Float64Array> | null {
  let map: Map<number, Float64Array> | null = null;
  const V = poly.verts;
  for (const f of poly.faces) {
    const g = f.attr.smooth;
    if (!g || (f.vn && f.vn.length === f.idx.length)) continue;
    map ??= new Map();
    let acc = map.get(g);
    if (!acc) map.set(g, (acc = new Float64Array(V.length * 3)));
    const m = f.idx.length;
    for (let k = 0; k < m; k++) {
      const p = V[f.idx[(k + m - 1) % m]],
        c = V[f.idx[k]],
        q = V[f.idx[(k + 1) % m]];
      const ax = p.x - c.x,
        ay = p.y - c.y,
        az = p.z - c.z;
      const bx = q.x - c.x,
        by = q.y - c.y,
        bz = q.z - c.z;
      const la = Math.hypot(ax, ay, az),
        lb = Math.hypot(bx, by, bz);
      let w = 0;
      if (la > 0 && lb > 0) w = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / (la * lb))));
      const i = f.idx[k];
      acc[3 * i] += f.n.x * w;
      acc[3 * i + 1] += f.n.y * w;
      acc[3 * i + 2] += f.n.z * w;
    }
  }
  return map;
}

// ====================================================================== T-junctions
/**
 * For directed face edges without a matching reverse edge, the poly vertices lying on them
 * (sorted along the edge). Keys: a * nV + b. Null when the poly is a clean manifold.
 */
function tJunctions(poly: ConvexPoly, scale: number): Map<number, number[]> | null {
  const V = poly.verts;
  const nV = V.length;
  const edges = new Set<number>();
  for (const f of poly.faces) {
    const m = f.idx.length;
    for (let k = 0; k < m; k++) edges.add(f.idx[k] * nV + f.idx[(k + 1) % m]);
  }
  let out: Map<number, number[]> | null = null;
  const tol = 1e-6 * scale;
  for (const f of poly.faces) {
    const m = f.idx.length;
    for (let k = 0; k < m; k++) {
      const a = f.idx[k],
        b = f.idx[(k + 1) % m];
      if (edges.has(b * nV + a)) continue;
      const A = V[a],
        B = V[b];
      const ex = B.x - A.x,
        ey = B.y - A.y,
        ez = B.z - A.z;
      const el2 = ex * ex + ey * ey + ez * ez;
      if (!(el2 > 0)) continue;
      const hits: Array<[number, number]> = [];
      for (let i = 0; i < nV; i++) {
        if (i === a || i === b) continue;
        const P = V[i];
        const t = ((P.x - A.x) * ex + (P.y - A.y) * ey + (P.z - A.z) * ez) / el2;
        if (t <= 1e-9 || t >= 1 - 1e-9) continue;
        const qx = A.x + ex * t - P.x,
          qy = A.y + ey * t - P.y,
          qz = A.z + ez * t - P.z;
        if (qx * qx + qy * qy + qz * qz <= tol * tol) hits.push([t, i]);
      }
      if (hits.length) {
        hits.sort((p, q) => p[0] - q[0]);
        (out ??= new Map()).set(a * nV + b, hits.map((h) => h[1]));
      }
    }
  }
  return out;
}

// ====================================================================== main entry
const TRI = new ConvexTriangulator();
const NO_UV = { u: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 }, u0: 0, v0: 0 };

/** Triangulate a convex poly (+ tessellation, dents applied to vertices, crack overlays). */
export function polyToRenderGeom(poly: ConvexPoly, opts: MeshGenOptions = {}): RenderGeom {
  const acc = new Acc();
  const V = poly.verts;
  if (!V.length || !poly.faces.length) return pack(acc);
  const scale = scaleOfPoints(V);
  const tc = opts.tessCell;
  // tessellation cell, guarded against absurdly small values (≤ 1000 segments per edge) and
  // capped by a per-part vertex budget. The effective cell is chosen once per poly so both
  // faces of every edge still get identical subdivisions (watertight).
  let tess = tc !== undefined && tc > 0 && Number.isFinite(tc) ? Math.max(tc, scale * 1e-3) : 0;
  if (tess > 0) {
    let area = 0;
    for (const f of poly.faces) area += polygonArea(V, f.idx);
    tess = Math.max(tess, Math.sqrt(area / TESS_VERTEX_BUDGET));
  }
  const dents = dentField(opts.dents);
  const darken = Math.min(1, Math.max(0, opts.dentDarken ?? 0.25));
  const groups = groupNormals(poly);
  const tj = tJunctions(poly, scale);
  for (const f of poly.faces) {
    if (f.idx.length < 3) continue;
    emitFace(acc, poly, f, tess, dents, darken, groups, tj);
  }
  if (opts.cracks && opts.cracks.length) emitCracks(acc, poly, opts.cracks, opts.crackSurf, dents, scale);
  return pack(acc);
}

// scratch buffers for the general face path
let BX = new Float64Array(256),
  BY = new Float64Array(256),
  BZ = new Float64Array(256),
  BT = new Float64Array(256);
let BK = new Int32Array(256);
let XS = new Float64Array(512),
  YS = new Float64Array(512);
/** Grow a typed array preserving its contents. */
function grow<T extends Float64Array | Int32Array>(a: T, n: number): T {
  const b = new (a.constructor as { new (n: number): T })(Math.max(n, a.length * 2));
  b.set(a);
  return b;
}
function ensureB(n: number): void {
  if (BX.length >= n) return;
  BX = grow(BX, n);
  BY = grow(BY, n);
  BZ = grow(BZ, n);
  BT = grow(BT, n);
  BK = grow(BK, n);
}
function ensureXY(n: number): void {
  if (XS.length >= n) return;
  XS = grow(XS, n);
  YS = grow(YS, n);
}

function emitFace(
  acc: Acc,
  poly: ConvexPoly,
  f: PolyFace,
  tess: number,
  dents: DentField | null,
  darken: number,
  groups: Map<number, Float64Array> | null,
  tj: Map<number, number[]> | null,
): void {
  const V = poly.verts;
  const idx = f.idx;
  const m = idx.length;
  const nV = V.length;
  const n = f.n;
  const uv = f.attr.uv ?? NO_UV; // defensive: hand-made polys from other modules may omit uv
  const surf = f.attr.surf & 0xffff;
  const tint = f.attr.tint >>> 0;
  // corner base normals
  const cn: number[] = new Array(m * 3);
  const vn = f.vn && f.vn.length === m ? f.vn : null;
  const gacc = !vn && f.attr.smooth && groups ? groups.get(f.attr.smooth) : undefined;
  let smoothFace = false;
  for (let k = 0; k < m; k++) {
    let x = n.x,
      y = n.y,
      z = n.z;
    if (vn) {
      x = vn[k].x;
      y = vn[k].y;
      z = vn[k].z;
      smoothFace = true;
    } else if (gacc) {
      const i = idx[k];
      const l = Math.hypot(gacc[3 * i], gacc[3 * i + 1], gacc[3 * i + 2]);
      if (l > 1e-12) {
        x = gacc[3 * i] / l;
        y = gacc[3 * i + 1] / l;
        z = gacc[3 * i + 2] / l;
        smoothFace = true;
      }
    }
    cn[3 * k] = x;
    cn[3 * k + 1] = y;
    cn[3 * k + 2] = z;
  }
  // does this face need the general path?
  let maxEdge2 = 0;
  let hasTJ = false;
  for (let k = 0; k < m; k++) {
    const a = idx[k],
      b = idx[(k + 1) % m];
    const A = V[a],
      B = V[b];
    const l2 = (B.x - A.x) ** 2 + (B.y - A.y) ** 2 + (B.z - A.z) ** 2;
    if (l2 > maxEdge2) maxEdge2 = l2;
    if (tj && tj.has(a * nV + b)) hasTJ = true;
  }
  const doTess = tess > 0 && maxEdge2 > tess * tess * 1.0002;

  if (!doTess && !hasTJ) {
    // ---- fast path: one vertex per corner, fan triangulation
    const base = acc.count;
    for (let k = 0; k < m; k++) {
      const p = V[idx[k]];
      acc.pos.push(p.x, p.y, p.z);
      acc.nrm.push(cn[3 * k], cn[3 * k + 1], cn[3 * k + 2]);
      acc.uv.push(p.x * uv.u.x + p.y * uv.u.y + p.z * uv.u.z + uv.u0, p.x * uv.v.x + p.y * uv.v.y + p.z * uv.v.z + uv.v0);
      acc.surf.push(surf);
      acc.tint.push(tint);
    }
    const tris: number[] = [];
    for (let k = 1; k + 1 < m; k++) tris.push(0, k, k + 1);
    if (dents) applyFaceDents(acc, base, m, tris, f, dents, darken, tint);
    for (let t = 0; t < tris.length; t += 3) acc.idx.push(base + tris[t], base + tris[t + 2], base + tris[t + 1]);
    return;
  }

  // ---- general path: boundary points (T-junction vertices + edge subdivisions)
  let nb = 0;
  const pushB = (x: number, y: number, z: number, k: number, t: number) => {
    ensureB(nb + 1);
    BX[nb] = x;
    BY[nb] = y;
    BZ[nb] = z;
    BK[nb] = k;
    BT[nb] = t;
    nb++;
  };
  for (let k = 0; k < m; k++) {
    const a = idx[k],
      b = idx[(k + 1) % m];
    const A = V[a],
      B = V[b];
    const ex = B.x - A.x,
      ey = B.y - A.y,
      ez = B.z - A.z;
    const el2 = ex * ex + ey * ey + ez * ez || 1;
    const mid = tj ? tj.get(a * nV + b) : undefined;
    const chain = mid ? [a, ...mid, b] : [a, b];
    for (let c = 0; c + 1 < chain.length; c++) {
      const p = chain[c],
        q = chain[c + 1];
      const P = V[p],
        Q = V[q];
      const tp = ((P.x - A.x) * ex + (P.y - A.y) * ey + (P.z - A.z) * ez) / el2;
      pushB(P.x, P.y, P.z, k, c === 0 ? 0 : tp);
      if (tess > 0) {
        const len = Math.hypot(Q.x - P.x, Q.y - P.y, Q.z - P.z);
        const segs = Math.ceil(len / tess - 1e-9);
        if (segs > 1) {
          const lo = p < q ? p : q,
            hi = p < q ? q : p;
          const L = V[lo],
            H = V[hi];
          for (let s = 1; s < segs; s++) {
            const tt = p < q ? s / segs : (segs - s) / segs; // canonical parameter from lo to hi
            const x = L.x + (H.x - L.x) * tt,
              y = L.y + (H.y - L.y) * tt,
              z = L.z + (H.z - L.z) * tt;
            const te = ((x - A.x) * ex + (y - A.y) * ey + (z - A.z) * ez) / el2;
            pushB(x, y, z, k, te);
          }
        }
      }
    }
  }
  // 2D frame (e1 along the longest polygon edge, e2 = n × e1 → CCW stays CCW)
  const fr = faceFrame(poly, f);
  let npts = nb;
  ensureXY(nb + 16);
  for (let i = 0; i < nb; i++) {
    const dx = BX[i] - fr.o.x,
      dy = BY[i] - fr.o.y,
      dz = BZ[i] - fr.o.z;
    XS[i] = dx * fr.e1.x + dy * fr.e1.y + dz * fr.e1.z;
    YS[i] = dx * fr.e2.x + dy * fr.e2.y + dz * fr.e2.z;
  }
  // interior grid, >= tess/2 away from every edge
  let xmin = Infinity,
    xmax = -Infinity,
    ymin = Infinity,
    ymax = -Infinity;
  for (let k = 0; k < m; k++) {
    xmin = Math.min(xmin, fr.px[k]);
    xmax = Math.max(xmax, fr.px[k]);
    ymin = Math.min(ymin, fr.py[k]);
    ymax = Math.max(ymax, fr.py[k]);
  }
  if (tess > 0 && xmax - xmin > tess && ymax - ymin > tess) {
    const margin = 0.5 * tess;
    const nxg = Math.floor((xmax - xmin) / tess),
      nyg = Math.floor((ymax - ymin) / tess);
    const x0 = xmin + (xmax - xmin - nxg * tess) / 2,
      y0 = ymin + (ymax - ymin - nyg * tess) / 2;
    // edge lines (inward unit normals)
    const el: number[] = [];
    for (let k = 0; k < m; k++) {
      const ax = fr.px[k],
        ay = fr.py[k];
      const bx = fr.px[(k + 1) % m],
        by = fr.py[(k + 1) % m];
      const l = Math.hypot(bx - ax, by - ay);
      if (!(l > 0)) continue;
      el.push(-(by - ay) / l, (bx - ax) / l, ax, ay);
    }
    for (let gi = 0; gi <= nxg; gi++) {
      const x = x0 + gi * tess;
      for (let gj = 0; gj <= nyg; gj++) {
        const y = y0 + gj * tess;
        let ok = true;
        for (let e = 0; e < el.length && ok; e += 4) if (el[e] * (x - el[e + 2]) + el[e + 1] * (y - el[e + 3]) < margin) ok = false;
        if (!ok) continue;
        ensureXY(npts + 1);
        XS[npts] = x;
        YS[npts] = y;
        npts++;
      }
    }
  }
  const faceSize = Math.max(xmax - xmin, ymax - ymin, 1e-9);
  const nt = TRI.run(XS, YS, nb, npts, faceSize);
  if (nt === 0) return;
  const tris: number[] = [];
  TRI.emit(tris);
  // vertices
  const base = acc.count;
  for (let i = 0; i < npts; i++) {
    let x: number, y: number, z: number;
    let nx = n.x,
      ny = n.y,
      nz = n.z;
    if (i < nb) {
      x = BX[i];
      y = BY[i];
      z = BZ[i];
      if (smoothFace) {
        const k = BK[i],
          k1 = (k + 1) % m,
          t = BT[i];
        nx = cn[3 * k] * (1 - t) + cn[3 * k1] * t;
        ny = cn[3 * k + 1] * (1 - t) + cn[3 * k1 + 1] * t;
        nz = cn[3 * k + 2] * (1 - t) + cn[3 * k1 + 2] * t;
      }
    } else {
      const p = to3D(fr, XS[i], YS[i]);
      x = p.x;
      y = p.y;
      z = p.z;
      if (smoothFace) {
        const w = mvc(fr, XS[i], YS[i]);
        nx = ny = nz = 0;
        for (let k = 0; k < m; k++) {
          nx += cn[3 * k] * w[k];
          ny += cn[3 * k + 1] * w[k];
          nz += cn[3 * k + 2] * w[k];
        }
      }
    }
    if (smoothFace) {
      const l = Math.hypot(nx, ny, nz);
      if (l > 1e-12) {
        nx /= l;
        ny /= l;
        nz /= l;
      } else {
        nx = n.x;
        ny = n.y;
        nz = n.z;
      }
    }
    acc.pos.push(x, y, z);
    acc.nrm.push(nx, ny, nz);
    acc.uv.push(x * uv.u.x + y * uv.u.y + z * uv.u.z + uv.u0, x * uv.v.x + y * uv.v.y + z * uv.v.z + uv.v0);
    acc.surf.push(surf);
    acc.tint.push(tint);
  }
  if (dents) applyFaceDents(acc, base, npts, tris, f, dents, darken, tint);
  for (let t = 0; t < tris.length; t += 3) acc.idx.push(base + tris[t], base + tris[t + 2], base + tris[t + 1]);
}

/** Mean value coordinates of (x,y) w.r.t. the face polygon corners (convex, (x,y) inside). */
function mvc(fr: FaceFrame, x: number, y: number): number[] {
  const m = fr.px.length;
  const w = new Array<number>(m).fill(0);
  const r: number[] = new Array(m);
  const tanHalf: number[] = new Array(m);
  for (let k = 0; k < m; k++) {
    const dx = fr.px[k] - x,
      dy = fr.py[k] - y;
    r[k] = Math.hypot(dx, dy);
    if (r[k] < 1e-14) {
      w[k] = 1;
      return w;
    }
  }
  for (let k = 0; k < m; k++) {
    const k1 = (k + 1) % m;
    const ax = fr.px[k] - x,
      ay = fr.py[k] - y,
      bx = fr.px[k1] - x,
      by = fr.py[k1] - y;
    const cr = ax * by - ay * bx;
    const dt = ax * bx + ay * by;
    const den = r[k] * r[k1] + dt;
    tanHalf[k] = den > 1e-300 ? cr / den : 1e6; // tan(α/2) = |a×b| / (|a||b| + a·b)
  }
  let sum = 0;
  for (let k = 0; k < m; k++) {
    const km = (k + m - 1) % m;
    w[k] = (tanHalf[km] + tanHalf[k]) / r[k];
    sum += w[k];
  }
  if (!(sum > 0) || !Number.isFinite(sum)) {
    w.fill(1 / m);
    return w;
  }
  for (let k = 0; k < m; k++) w[k] /= sum;
  return w;
}

/**
 * Apply the dent field to `count` face vertices starting at `base`: displace positions, rebuild
 * normals from the displaced face triangles (keeping smooth base normals' character), darken tint.
 */
function applyFaceDents(
  acc: Acc,
  base: number,
  count: number,
  tris: number[],
  f: PolyFace,
  dents: DentField,
  darken: number,
  tint: number,
): void {
  let any = false;
  for (let i = 0; i < count; i++) {
    const j = 3 * (base + i);
    displace(dents, acc.pos[j], acc.pos[j + 1], acc.pos[j + 2], f.n.x, f.n.y, f.n.z);
    if (DISP[3] > 0) {
      any = true;
      acc.pos[j] += DISP[0];
      acc.pos[j + 1] += DISP[1];
      acc.pos[j + 2] += DISP[2];
      if (darken > 0 && DISP[4] > 0) acc.tint[base + i] = darkenTint(tint, darken * DISP[4]);
    }
  }
  if (!any) return;
  // geometric normals of the displaced face (triangles are CCW from outside here)
  const g = new Float64Array(count * 3);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t],
      b = tris[t + 1],
      c = tris[t + 2];
    const ja = 3 * (base + a),
      jb = 3 * (base + b),
      jc = 3 * (base + c);
    const ux = acc.pos[jb] - acc.pos[ja],
      uy = acc.pos[jb + 1] - acc.pos[ja + 1],
      uz = acc.pos[jb + 2] - acc.pos[ja + 2];
    const vx2 = acc.pos[jc] - acc.pos[ja],
      vy2 = acc.pos[jc + 1] - acc.pos[ja + 1],
      vz2 = acc.pos[jc + 2] - acc.pos[ja + 2];
    const nx = uy * vz2 - uz * vy2,
      ny = uz * vx2 - ux * vz2,
      nz = ux * vy2 - uy * vx2;
    for (const q of [a, b, c]) {
      g[3 * q] += nx;
      g[3 * q + 1] += ny;
      g[3 * q + 2] += nz;
    }
  }
  for (let i = 0; i < count; i++) {
    let gx = g[3 * i],
      gy = g[3 * i + 1],
      gz = g[3 * i + 2];
    const l = Math.hypot(gx, gy, gz);
    if (!(l > 0)) continue;
    gx /= l;
    gy /= l;
    gz /= l;
    const j = 3 * (base + i);
    // base normal + (displaced geometric − flat): preserves smooth-surface curvature, adds dent tilt
    let nx = acc.nrm[j] + gx - f.n.x,
      ny = acc.nrm[j + 1] + gy - f.n.y,
      nz = acc.nrm[j + 2] + gz - f.n.z;
    const ln = Math.hypot(nx, ny, nz);
    if (ln > 1e-9) {
      nx /= ln;
      ny /= ln;
      nz /= ln;
    } else {
      nx = gx;
      ny = gy;
      nz = gz;
    }
    acc.nrm[j] = nx;
    acc.nrm[j + 1] = ny;
    acc.nrm[j + 2] = nz;
  }
}

// ====================================================================== cracks
function emitCracks(acc: Acc, poly: ConvexPoly, cracks: Crack[], crackSurf: number | undefined, dents: DentField | null, scale: number): void {
  const frames = new Map<number, FaceFrame>();
  const tolP = 1e-4 * scale + 1e-5;
  for (const c of cracks) {
    if (!c || !c.points || c.points.length < 2 || !(c.width > 0)) continue;
    const p0 = c.points[0];
    if (!Number.isFinite(p0.x + p0.y + p0.z)) continue;
    // face holding the crack: same orientation and plane
    let fi = -1,
      bd = Infinity;
    for (let i = 0; i < poly.faces.length; i++) {
      const f = poly.faces[i];
      if (f.n.x * c.n.x + f.n.y * c.n.y + f.n.z * c.n.z < 0.9) continue;
      let worst = 0;
      for (const p of c.points) worst = Math.max(worst, Math.abs(f.n.x * p.x + f.n.y * p.y + f.n.z * p.z - f.d));
      if (worst <= tolP && worst < bd) {
        bd = worst;
        fi = i;
      }
    }
    if (fi < 0) continue;
    const f = poly.faces[fi];
    let fr = frames.get(fi);
    if (!fr) frames.set(fi, (fr = faceFrame(poly, f)));
    const runs = clipPolyline2D(fr, c.points);
    for (const run of runs) ribbon(acc, fr, f, run, c.width, crackSurf, dents);
  }
}

function ribbon(acc: Acc, fr: FaceFrame, f: PolyFace, run: Array<[number, number]>, width: number, crackSurf: number | undefined, dents: DentField | null): void {
  // drop near-duplicate points
  const pts: Array<[number, number]> = [];
  for (const p of run) {
    const q = pts[pts.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) pts.push(p);
  }
  if (pts.length < 2) return;
  const K = pts.length;
  let total = 0;
  const sAt: number[] = [0];
  for (let k = 1; k < K; k++) {
    total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    sAt.push(total);
  }
  const surf = (crackSurf ?? f.attr.surf) & 0xffff;
  const tint = crackSurf !== undefined ? 0xffffff : CRACK_TINT;
  const n = f.n;
  const base = acc.count;
  for (let k = 0; k < K; k++) {
    // tangent (average of adjacent segments), side = perpendicular in the face plane
    const a = pts[Math.max(0, k - 1)],
      b = pts[Math.min(K - 1, k + 1)];
    let tx = b[0] - a[0],
      ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    let sx = -ty,
      sy = tx;
    // miter: keep the ribbon width constant across the joint
    let miter = 1;
    if (k > 0 && k < K - 1) {
      const ex = pts[k][0] - pts[k - 1][0],
        ey = pts[k][1] - pts[k - 1][1];
      const el = Math.hypot(ex, ey) || 1;
      const dotp = (-ey / el) * sx + (ex / el) * sy;
      miter = 1 / Math.max(0.4, Math.abs(dotp));
    }
    const w = width * (1 - 0.55 * (sAt[k] / (total || 1))) * miter * 0.5;
    sx *= w;
    sy *= w;
    for (const side of [1, -1]) {
      const p = to3D(fr, pts[k][0] + side * sx, pts[k][1] + side * sy);
      let x = p.x,
        y = p.y,
        z = p.z;
      if (dents) {
        displace(dents, x, y, z, n.x, n.y, n.z);
        x += DISP[0];
        y += DISP[1];
        z += DISP[2];
      }
      acc.pos.push(x + n.x * CRACK_OFFSET, y + n.y * CRACK_OFFSET, z + n.z * CRACK_OFFSET);
      acc.nrm.push(n.x, n.y, n.z);
      acc.uv.push(sAt[k], side * w);
      acc.surf.push(surf);
      acc.tint.push(tint);
    }
  }
  // vertex 2k = left (+side), 2k+1 = right; CCW-from-outside quads (R_k, R_k+1, L_k), (L_k, R_k+1, L_k+1)
  for (let k = 0; k + 1 < K; k++) {
    const L0 = base + 2 * k,
      R0 = L0 + 1,
      L1 = L0 + 2,
      R1 = L0 + 3;
    // emitted reversed (Babylon front face, see header)
    acc.idx.push(R0, L0, R1, L0, L1, R1);
  }
}

// ====================================================================== other exports

/** Concatenate several geoms (indices rebased). */
export function mergeRenderGeoms(geoms: RenderGeom[]): RenderGeom {
  let nv = 0,
    ni = 0;
  for (const g of geoms) {
    nv += g.vertexCount;
    ni += g.indices.length;
  }
  const out: RenderGeom = {
    positions: new Float32Array(nv * 3),
    normals: new Float32Array(nv * 3),
    uvs: new Float32Array(nv * 2),
    surf: new Uint16Array(nv),
    tint: new Uint32Array(nv),
    indices: new Uint32Array(ni),
    vertexCount: nv,
  };
  let vo = 0,
    io = 0;
  for (const g of geoms) {
    out.positions.set(g.positions.subarray(0, g.vertexCount * 3), vo * 3);
    out.normals.set(g.normals.subarray(0, g.vertexCount * 3), vo * 3);
    out.uvs.set(g.uvs.subarray(0, g.vertexCount * 2), vo * 2);
    out.surf.set(g.surf.subarray(0, g.vertexCount), vo);
    out.tint.set(g.tint.subarray(0, g.vertexCount), vo);
    for (let i = 0; i < g.indices.length; i++) out.indices[io + i] = g.indices[i] + vo;
    vo += g.vertexCount;
    io += g.indices.length;
  }
  return out;
}

/** Apply dents to arbitrary positions in place (used for collider refresh after big bends). */
export function applyDents(positions: Float32Array, dents: Dent[]): void {
  const F = dentField(dents);
  if (!F) return;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    displace(F, positions[i], positions[i + 1], positions[i + 2], 0, 0, 0);
    positions[i] += DISP[0];
    positions[i + 1] += DISP[1];
    positions[i + 2] += DISP[2];
  }
}

/**
 * Grow branching crack polylines on the surface of `poly` starting at `impact` (on/near the
 * face whose normal best matches -dir). `severity` 0..1 controls count/length; `radial`
 * gives a glass-style star + concentric rings. Cracks stay on the hit face (clipped to it).
 *
 * Defaults: width 1.2 mm, maxLength = clamp(0.5 × face diameter, 2 cm, 0.8 m). Points lie
 * exactly on the face plane; meshgen offsets the rendered ribbon by CRACK_OFFSET along n.
 */
export function growCracks(
  poly: ConvexPoly,
  impact: Vec3,
  dir: Vec3,
  severity: number,
  rng: Rng,
  opts?: { radial?: boolean; maxLength?: number; width?: number },
): Crack[] {
  return growCracksImpl(poly, impact, dir, severity, rng, opts);
}
