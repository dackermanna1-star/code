// Voronoi fracture of convex polyhedra + material seed patterns. PURE MODULE.
// Contract owned by the orchestrator; implementation by the geometry agent.
//
// voronoiFracture: each cell = the input poly clipped by the bisector half-spaces of nearby
// seeds, processed in increasing (metric) distance with the classic early-out: once a seed is
// farther than twice the current cell radius its bisector cannot touch the cell. Anisotropy uses
// the metric M = I − (1 − 1/f²)·a·aᵀ (distances along a divided by f), whose bisector normal is
// n = M·(s_j − s_i) through the seeds' midpoint. Each cut face remembers which seed produced it,
// which yields the neighbour graph and shared-face areas (symmetrised). Coincident seeds are
// deduplicated (the first one keeps the cell).

import type { Vec3 } from "./vec.ts";
import type { ConvexPoly, FaceAttr } from "./poly.ts";
import type { Rng } from "../core/rng.ts";
import { polyEps, convexFromW, cloneAttr, hasUV, autoUV, polyVolume, polyExtents, polySignedDist, polyClosestPoint, polyChord, polyCentroid } from "./poly.ts";
import { wpolyFromConvex, wpolyClone, wpolyClip, wfaceArea, wpolyMass, CLIP_EMPTY, CLIP_CUT, type WPoly } from "./wpoly.ts";
import { scaleOfPoints } from "./util.ts";

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

const vx = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/**
 * Split `poly` into the Voronoi cells of `seeds` (seeds outside the poly are allowed; empty
 * cells are dropped). Cells exactly tile the input (sum of volumes == input volume within 1e-6
 * relative). Must be robust to near-coplanar seeds and seeds on faces.
 *
 * Notes: the default minVolume is min(1e-8, 1e-4 × input volume) so tiny parts are not wiped
 * out; cut faces get `interiorAttr` (interior = true) with a planar uv (u along `grain` when
 * given) unless interiorAttr carries an explicit uv; neighbour lists are symmetric.
 */
export function voronoiFracture(poly: ConvexPoly, seeds: Vec3[], opts: VoronoiOptions): FractureCell[] {
  if (!poly.faces.length || !seeds.length) return [];
  const [planeEps, weldEps] = polyEps(poly);
  const scale = scaleOfPoints(poly.verts);
  const template = wpolyFromConvex(poly);
  const inputVol = polyVolume(poly);
  const minVol = opts.minVolume ?? Math.min(1e-8, 1e-4 * inputVol);

  // ---- metric: L = I + kL·a·aᵀ (scales the a-component by 1/f), M = L² = I + kM·a·aᵀ
  let ax = 0,
    ay = 0,
    az = 0,
    kL = 0,
    kM = 0;
  const an = opts.anisotropy;
  if (an && Number.isFinite(an.factor) && an.factor > 0 && Math.abs(an.factor - 1) > 1e-6) {
    const l = Math.hypot(an.axis.x, an.axis.y, an.axis.z);
    if (l > 1e-12 && Number.isFinite(l)) {
      ax = an.axis.x / l;
      ay = an.axis.y / l;
      az = an.axis.z / l;
      kL = 1 / an.factor - 1;
      kM = 1 / (an.factor * an.factor) - 1;
    }
  }

  // ---- seeds (finite only) in original and metric coordinates
  const idxMap: number[] = [];
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    if (s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z)) idxMap.push(i);
  }
  const N = idxMap.length;
  if (N === 0) return [];
  const SX = new Float64Array(N),
    SY = new Float64Array(N),
    SZ = new Float64Array(N);
  const TX = new Float64Array(N),
    TY = new Float64Array(N),
    TZ = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const s = seeds[idxMap[i]];
    SX[i] = s.x;
    SY[i] = s.y;
    SZ[i] = s.z;
    const da = (s.x * ax + s.y * ay + s.z * az) * kL;
    TX[i] = s.x + ax * da;
    TY[i] = s.y + ay * da;
    TZ[i] = s.z + az * da;
  }
  const dupEps2 = weldEps * weldEps * 100;
  const order = makeNeighborOrder(TX, TY, TZ, N);

  // ---- cells
  const cells: Array<{ w: WPoly; seed: number } | null> = new Array(N).fill(null);
  for (let i = 0; i < N; i++) {
    const w = wpolyClone(template);
    let R = cellRadius(w, SX[i], SY[i], SZ[i], ax, ay, az, kL);
    let empty = false;
    order.visit(i, (j: number, d2: number): number => {
      // returns: 0 continue, 1 stop (cell finished or empty); called in ~increasing distance
      if (d2 <= dupEps2) {
        if (j < i) {
          empty = true; // duplicate of an earlier seed: that one owns the cell
          return 1;
        }
        return 0;
      }
      if (d2 > 4 * R * R * (1 + 1e-9)) return 0;
      const dx = SX[j] - SX[i],
        dy = SY[j] - SY[i],
        dz = SZ[j] - SZ[i];
      const da = (dx * ax + dy * ay + dz * az) * kM;
      let nx = dx + ax * da,
        ny = dy + ay * da,
        nz = dz + az * da;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (!(nl > 0)) return 0;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      const d = (nx * (SX[i] + SX[j]) + ny * (SY[i] + SY[j]) + nz * (SZ[i] + SZ[j])) * 0.5;
      const r = wpolyClip(w, nx, ny, nz, d, -(j + 1), planeEps, weldEps);
      if (r === CLIP_EMPTY) {
        empty = true;
        return 1;
      }
      if (r === CLIP_CUT) R = cellRadius(w, SX[i], SY[i], SZ[i], ax, ay, az, kL);
      return 0;
    }, () => R);
    if (!empty) cells[i] = { w, seed: i };
  }

  // ---- convert, measure, filter
  const interiorBase = opts.interiorAttr;
  const out: FractureCell[] = [];
  const outOfSeed = new Int32Array(N).fill(-1);
  const rawNb: Array<Map<number, number>> = [];
  for (let i = 0; i < N; i++) {
    const c = cells[i];
    if (!c) continue;
    const m = wpolyMass(c.w);
    if (!(m.volume >= minVol) || m.volume <= 0) continue;
    const nb = new Map<number, number>();
    for (const f of c.w.faces) {
      if (f.tag < 0) {
        const j = -f.tag - 1;
        nb.set(j, (nb.get(j) ?? 0) + wfaceArea(c.w, f));
      }
    }
    const cp = convexFromW(c.w, (f) => {
      if (f.tag >= 0) return cloneAttr(poly.faces[f.tag].attr);
      const n = vx(f.nx, f.ny, f.nz);
      const a = hasUV(interiorBase) ? cloneAttr(interiorBase) : cloneAttr(interiorBase, autoUV(n, 0, 0, opts.grain));
      a.interior = true;
      return a;
    });
    outOfSeed[i] = out.length;
    rawNb.push(nb);
    out.push({
      poly: cp,
      seed: vx(SX[i], SY[i], SZ[i]),
      volume: m.volume,
      centroid: vx(m.cx, m.cy, m.cz),
      neighbors: [],
      maxExtent: polyExtents(cp).ext[0],
    });
  }

  // ---- symmetric neighbour graph
  const areaTol = 1e-10 * scale * scale;
  const pair = new Map<number, { sum: number; cnt: number }>();
  const M = out.length;
  for (let c = 0; c < M; c++) {
    for (const [j, a] of rawNb[c]) {
      const cj = outOfSeed[j];
      if (cj < 0 || cj === c) continue;
      const lo = c < cj ? c : cj,
        hi = c < cj ? cj : c;
      const key = lo * M + hi;
      const e = pair.get(key);
      if (e) {
        e.sum += a;
        e.cnt++;
      } else pair.set(key, { sum: a, cnt: 1 });
    }
  }
  for (const [key, e] of pair) {
    const area = e.sum / e.cnt;
    if (!(area > areaTol)) continue;
    const lo = Math.floor(key / M),
      hi = key - lo * M;
    out[lo].neighbors.push({ cell: hi, area });
    out[hi].neighbors.push({ cell: lo, area });
  }
  for (const c of out) c.neighbors.sort((p, q) => p.cell - q.cell);
  return out;
}

/** Metric radius of a cell around seed s: max over vertices of |L(v − s)|. */
function cellRadius(w: WPoly, sx: number, sy: number, sz: number, ax: number, ay: number, az: number, kL: number): number {
  const p = w.p;
  let r2 = 0;
  for (let k = 0; k < p.length; k += 3) {
    let dx = p[k] - sx,
      dy = p[k + 1] - sy,
      dz = p[k + 2] - sz;
    if (kL !== 0) {
      const da = (dx * ax + dy * ay + dz * az) * kL;
      dx += ax * da;
      dy += ay * da;
      dz += az * da;
    }
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r2) r2 = d2;
  }
  return Math.sqrt(r2);
}

// ====================================================================== neighbour ordering

interface NeighborOrder {
  /**
   * Visit candidate seeds j != i in roughly increasing metric distance, calling fn(j, d²) until
   * it returns 1 or no unvisited seed can be closer than 2·radius() (early-out).
   */
  visit(i: number, fn: (j: number, d2: number) => number, radius: () => number): void;
}

function makeNeighborOrder(TX: Float64Array, TY: Float64Array, TZ: Float64Array, N: number): NeighborOrder {
  if (N <= 48) {
    const d2 = new Float64Array(N);
    const ids: number[] = [];
    return {
      visit(i, fn, radius) {
        ids.length = 0;
        for (let j = 0; j < N; j++) {
          if (j === i) continue;
          const dx = TX[j] - TX[i],
            dy = TY[j] - TY[i],
            dz = TZ[j] - TZ[i];
          d2[j] = dx * dx + dy * dy + dz * dz;
          ids.push(j);
        }
        ids.sort((a, b) => d2[a] - d2[b]);
        for (const j of ids) {
          // sorted by distance and the radius only shrinks: nothing after this can cut the cell
          const R = radius();
          if (d2[j] > 4 * R * R * (1 + 1e-9)) return;
          if (fn(j, d2[j]) === 1) return;
        }
      },
    };
  }
  // uniform grid in metric space with ~1 seed per cell
  let x0 = Infinity,
    y0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity,
    z1 = -Infinity;
  for (let i = 0; i < N; i++) {
    x0 = Math.min(x0, TX[i]);
    x1 = Math.max(x1, TX[i]);
    y0 = Math.min(y0, TY[i]);
    y1 = Math.max(y1, TY[i]);
    z0 = Math.min(z0, TZ[i]);
    z1 = Math.max(z1, TZ[i]);
  }
  const ex = Math.max(x1 - x0, 1e-12),
    ey = Math.max(y1 - y0, 1e-12),
    ez = Math.max(z1 - z0, 1e-12);
  const sorted = [ex, ey, ez].sort((a, b) => b - a);
  let h = Math.cbrt((sorted[0] * sorted[1] * sorted[2]) / N);
  if (sorted[2] < h) h = Math.sqrt((sorted[0] * sorted[1]) / N);
  if (sorted[1] < h) h = sorted[0] / N;
  h = Math.max(h, sorted[0] * 1e-6);
  const nx = Math.min(1024, Math.max(1, Math.ceil(ex / h))),
    ny = Math.min(1024, Math.max(1, Math.ceil(ey / h))),
    nz = Math.min(1024, Math.max(1, Math.ceil(ez / h)));
  const cellOf = new Int32Array(N);
  const nCells = nx * ny * nz;
  const start = new Int32Array(nCells + 1);
  const cx = (x: number) => Math.min(nx - 1, Math.floor((x - x0) / h));
  const cy = (y: number) => Math.min(ny - 1, Math.floor((y - y0) / h));
  const cz = (z: number) => Math.min(nz - 1, Math.floor((z - z0) / h));
  for (let i = 0; i < N; i++) {
    const c = (cz(TZ[i]) * ny + cy(TY[i])) * nx + cx(TX[i]);
    cellOf[i] = c;
    start[c + 1]++;
  }
  for (let c = 0; c < nCells; c++) start[c + 1] += start[c];
  const items = new Int32Array(N);
  const fill = start.slice(0, nCells);
  for (let i = 0; i < N; i++) items[fill[cellOf[i]]++] = i;
  const cand: number[] = [];
  const cd2 = new Float64Array(N);
  const maxRing = Math.max(nx, ny, nz);
  return {
    visit(i, fn, radius) {
      const gx = cx(TX[i]),
        gy = cy(TY[i]),
        gz = cz(TZ[i]);
      for (let r = 0; r <= maxRing; r++) {
        cand.length = 0;
        const xa = Math.max(0, gx - r),
          xb = Math.min(nx - 1, gx + r);
        const ya = Math.max(0, gy - r),
          yb = Math.min(ny - 1, gy + r);
        const za = Math.max(0, gz - r),
          zb = Math.min(nz - 1, gz + r);
        for (let z = za; z <= zb; z++) {
          const onZ = z === gz - r || z === gz + r;
          for (let y = ya; y <= yb; y++) {
            const onY = onZ || y === gy - r || y === gy + r;
            for (let x = xa; x <= xb; x++) {
              if (!onY && x !== gx - r && x !== gx + r) continue; // interior of the shell cube
              const c = (z * ny + y) * nx + x;
              for (let k = start[c]; k < start[c + 1]; k++) {
                const j = items[k];
                if (j === i) continue;
                const dx = TX[j] - TX[i],
                  dy = TY[j] - TY[i],
                  dz = TZ[j] - TZ[i];
                cd2[j] = dx * dx + dy * dy + dz * dz;
                cand.push(j);
              }
            }
          }
        }
        if (cand.length) {
          cand.sort((a, b) => cd2[a] - cd2[b]);
          for (const j of cand) if (fn(j, cd2[j]) === 1) return;
        }
        // seeds in rings > r are at least r·h away
        const R = radius();
        if (r * h > 2 * R * (1 + 1e-9)) return;
        if (xa === 0 && ya === 0 && za === 0 && xb === nx - 1 && yb === ny - 1 && zb === nz - 1) return;
      }
    },
  };
}

// ====================================================================== seed patterns

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

/**
 * Generate seed points for a pattern; all returned seeds lie inside `poly`.
 *
 * Details per pattern (defaults for `far`): radial 3, chunks 2, splinter 2, crumble 2, dice 0,
 * crack 0 (one seed near the impact, the rest spread across the part).
 *  - Planar parts (planeNormal given, or thinnest principal extent < 0.3 × middle extent) get
 *    their seeds on the mid-surface of the plate (cells then span the full thickness, like real
 *    cracks through a pane/board/sheet) and inner clusters are discs instead of balls.
 *  - radial: 6–12 rays (from the inner count), rings at geometric radii (×1.8) ending at
 *    `radius`, ±20 % radial and angular jitter, far seeds beyond 1.2 × radius (best-candidate).
 *  - dice: jittered (±35 %) grid with spacing `cell` (default from count) over the whole part;
 *    `count` acts as a budget: if the grid would exceed it by > 25 % the cell is enlarged.
 *  - chunks: inner seeds in the ball/disc of `radius` (denser towards the centre).
 *  - splinter: inner seeds in an ellipsoid with semi-axes 2.5·radius along the grain and
 *    0.6·radius across (grain default = longest principal axis).
 *  - crumble: 65 % crumbs within 0.5·radius, 35 % medium chunks between 0.5 and 1.3·radius.
 *  - crack: one seed within min(radius, 0.25 × length) of the impact, the rest spread out.
 * Seeds that fall outside are resampled, then clamped slightly inside.
 */
export function generateSeeds(poly: ConvexPoly, opts: SeedOptions): Vec3[] {
  const count = Math.max(0, Math.floor(Number.isFinite(opts.count) ? opts.count : 0));
  if (count === 0 || poly.faces.length === 0 || polyVolume(poly) <= 0) return [];
  const g = new SeedGen(poly, opts);
  switch (opts.pattern) {
    case "radial":
      g.radial(count);
      break;
    case "dice":
      g.dice(count);
      break;
    case "chunks":
      g.cluster(count, opts.far ?? 2, (r) => g.ballPoint(g.impact, r, 0.5));
      break;
    case "splinter":
      g.splinter(count);
      break;
    case "crumble":
      g.crumble(count);
      break;
    case "crack":
    default:
      g.crackPattern(count);
      break;
  }
  return g.seeds;
}

class SeedGen {
  readonly poly: ConvexPoly;
  readonly rng: Rng;
  readonly seeds: Vec3[] = [];
  readonly impact: Vec3;
  readonly radius: number;
  readonly planar: boolean;
  readonly n: Vec3; // pattern plane normal
  readonly e1: Vec3;
  readonly e2: Vec3;
  readonly centroid: Vec3;
  readonly ext: [number, number, number];
  readonly axes: [Vec3, Vec3, Vec3];
  readonly margin: number;
  readonly opts: SeedOptions;
  /** OBB of the poly (centre + half extents along axes) for uniform sampling. */
  private obbLo: [number, number, number] = [0, 0, 0];
  private obbHi: [number, number, number] = [0, 0, 0];

  constructor(poly: ConvexPoly, opts: SeedOptions) {
    this.poly = poly;
    this.opts = opts;
    this.rng = opts.rng;
    const E = polyExtents(poly);
    this.ext = E.ext;
    this.axes = E.axes;
    this.centroid = polyCentroid(poly);
    const scale = scaleOfPoints(poly.verts);
    this.margin = Math.max(1e-9 * scale, Math.min(1e-4 * scale, 0.02 * Math.max(E.ext[2], 1e-9)));
    const imp = opts.impact && Number.isFinite(opts.impact.x + opts.impact.y + opts.impact.z) ? opts.impact : this.centroid;
    this.radius = Math.max(Number.isFinite(opts.radius) && opts.radius > 0 ? opts.radius : 0.1 * E.ext[0], 1e-6);
    let pn = opts.planeNormal ? unit(opts.planeNormal) : null;
    if (pn && !(Math.hypot(pn.x, pn.y, pn.z) > 0.5)) pn = null;
    this.planar = !!pn || E.ext[2] < 0.3 * E.ext[1];
    if (pn) this.n = pn;
    else if (this.planar) this.n = E.axes[2];
    else {
      const d = opts.dir ? unit(opts.dir) : vx(0, 0, 0);
      this.n = Math.hypot(d.x, d.y, d.z) > 0.5 ? d : E.axes[2];
    }
    // in-plane basis: e1 = principal axis 0 projected, e2 = n × e1
    let a = E.axes[0];
    if (Math.abs(dot(a, this.n)) > 0.9) a = E.axes[1];
    const ad = dot(a, this.n);
    this.e1 = unit(vx(a.x - this.n.x * ad, a.y - this.n.y * ad, a.z - this.n.z * ad));
    this.e2 = cross(this.n, this.e1);
    // impact projected to the mid-surface for planar parts
    this.impact = this.planar ? this.midSurface(imp) ?? polyClosestPoint(poly, imp) : imp;
    // OBB along principal axes
    for (let k = 0; k < 3; k++) {
      let lo = Infinity,
        hi = -Infinity;
      for (const v of poly.verts) {
        const s = dot(v, this.axes[k]);
        if (s < lo) lo = s;
        if (s > hi) hi = s;
      }
      this.obbLo[k] = lo;
      this.obbHi[k] = hi;
    }
  }

  // ------------------------------------------------------------------ geometry helpers
  inside(p: Vec3): boolean {
    return polySignedDist(this.poly, p) < -this.margin;
  }

  /** Project p onto the plate's mid-surface along n (null if the normal line misses the part). */
  midSurface(p: Vec3): Vec3 | null {
    const c = polyChord(this.poly, p, this.n);
    if (!c || c.tMax - c.tMin <= 2 * this.margin) return null;
    const t = (c.tMin + c.tMax) / 2;
    return vx(p.x + this.n.x * t, p.y + this.n.y * t, p.z + this.n.z * t);
  }

  /** Make a candidate valid: mid-surface for planar parts, inside test; null if rejected. */
  accept(p: Vec3): Vec3 | null {
    const q = this.planar ? this.midSurface(p) : p;
    return q && this.inside(q) ? q : null;
  }

  /** Clamp a point slightly inside the part. */
  clampInside(p: Vec3): Vec3 {
    let q = this.planar ? (this.midSurface(p) ?? p) : p;
    if (this.inside(q)) return q;
    q = polyClosestPoint(this.poly, q);
    const c = this.centroid;
    for (let k = 1; k <= 30; k++) {
      const t = Math.min(1, (this.margin * 4 * k) / (Math.hypot(c.x - q.x, c.y - q.y, c.z - q.z) || 1));
      const r = vx(q.x + (c.x - q.x) * t, q.y + (c.y - q.y) * t, q.z + (c.z - q.z) * t);
      const m = this.planar ? (this.midSurface(r) ?? r) : r;
      if (this.inside(m)) return m;
    }
    return vx(c.x, c.y, c.z);
  }

  /**
   * Minimum spacing for a clamped seed: clamping maps every outside candidate in a region onto
   * the same closest-point/centroid path, so without this check corner/edge impacts (or a
   * breakout radius larger than the part) pile seeds up as exact duplicates, which
   * voronoiFracture then silently drops (fewer fragments than requested).
   */
  private sepCache = -1;
  minSep(): number {
    if (this.sepCache < 0) {
      const n = Math.max(1, this.opts.count);
      const s = Math.min(0.1 * this.radius, 0.1 * this.ext[0]) / Math.sqrt(n);
      this.sepCache = Math.max(4 * this.margin, s);
    }
    return this.sepCache;
  }

  /** True when p is within `sep` of an existing seed. */
  crowded(p: Vec3, sep: number): boolean {
    const s2 = sep * sep;
    for (const s of this.seeds) {
      const dx = s.x - p.x,
        dy = s.y - p.y,
        dz = s.z - p.z;
      if (dx * dx + dy * dy + dz * dz < s2) return true;
    }
    return false;
  }

  /**
   * A clamped fallback seed that is not a (near-)duplicate: try the clamped point, then random
   * candidates around it in growing balls/discs, then a best-candidate point anywhere.
   */
  placeClamped(p: Vec3): Vec3 {
    const q = this.clampInside(p);
    const sep = this.minSep();
    if (!this.crowded(q, sep)) return q;
    for (let t = 0; t < 24; t++) {
      const r = sep * (1.5 + t * 0.5);
      const c = this.accept(this.ballPoint(q, r, 0));
      if (c && !this.crowded(c, sep)) return c;
    }
    return this.spreadPoint(0);
  }

  /** Try `gen` up to `tries` times; clamp the last candidate (de-duplicated) if all fail. */
  sample(gen: () => Vec3, tries = 30): Vec3 {
    let last = gen();
    for (let t = 0; t < tries; t++) {
      const q = this.accept(last);
      if (q) return q;
      last = gen();
    }
    return this.placeClamped(last);
  }

  push(p: Vec3): void {
    this.seeds.push(p);
  }

  /** Random point in the disc (planar) / ball of radius r around c; density ∝ r^(-bias). */
  ballPoint(c: Vec3, r: number, bias = 0): Vec3 {
    const rng = this.rng;
    if (this.planar) {
      const a = rng.range(0, Math.PI * 2);
      const rr = r * Math.pow(rng.next(), (1 + bias) / 2);
      return this.inPlane(c, rr * Math.cos(a), rr * Math.sin(a));
    }
    const d = rng.onSphere();
    const rr = r * Math.pow(rng.next(), (1 + bias) / 3);
    return vx(c.x + d.x * rr, c.y + d.y * rr, c.z + d.z * rr);
  }

  inPlane(c: Vec3, u: number, v: number): Vec3 {
    return vx(c.x + this.e1.x * u + this.e2.x * v, c.y + this.e1.y * u + this.e2.y * v, c.z + this.e1.z * u + this.e2.z * v);
  }

  /** Uniform point in the part's oriented bounding box. */
  obbPoint(): Vec3 {
    const rng = this.rng;
    const s = [rng.range(this.obbLo[0], this.obbHi[0]), rng.range(this.obbLo[1], this.obbHi[1]), rng.range(this.obbLo[2], this.obbHi[2])];
    const A = this.axes;
    return vx(A[0].x * s[0] + A[1].x * s[1] + A[2].x * s[2], A[0].y * s[0] + A[1].y * s[1] + A[2].y * s[2], A[0].z * s[0] + A[1].z * s[1] + A[2].z * s[2]);
  }

  /**
   * Best-candidate (Mitchell) point inside the part: maximises the distance to existing seeds
   * (and to the impact when minR > 0); candidates closer than minR to the impact are penalised.
   */
  spreadPoint(minR: number, k = 12): Vec3 {
    let best: Vec3 | null = null,
      bestScore = -Infinity;
    let tries = 0;
    for (let t = 0; t < 200 && tries < k; t++) {
      const q = this.accept(this.obbPoint());
      if (!q) continue;
      tries++;
      const di = dist(q, this.impact);
      let dmin = minR > 0 ? di : Infinity;
      for (const s of this.seeds) dmin = Math.min(dmin, dist(q, s));
      const score = (Number.isFinite(dmin) ? dmin : 0) - (di < minR ? 1e3 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = q;
      }
    }
    return best ?? this.clampInside(this.obbPoint());
  }

  // ------------------------------------------------------------------ patterns
  radial(count: number): void {
    const rng = this.rng;
    const nFar = Math.min(count - 1, Math.max(0, this.opts.far ?? 3));
    const nIn = Math.max(1, count - nFar);
    const R = nIn < 6 ? nIn : Math.min(12, Math.max(6, Math.round(Math.sqrt(nIn * 1.6))));
    const K = Math.max(1, Math.ceil(nIn / R));
    const base = rng.range(0, Math.PI * 2);
    let made = 0;
    for (let k = 0; k < K && made < nIn; k++) {
      const rk = this.radius * Math.pow(1.8, k - (K - 1));
      const ringJ = rng.range(-0.5, 0.5); // rings are slightly rotated → zig-zag radial cracks
      for (let j = 0; j < R && made < nIn; j++) {
        const a = base + ((j + 0.5 + ringJ * 0.35 + rng.range(-0.15, 0.15)) * Math.PI * 2) / R;
        const r = rk * rng.range(0.8, 1.2);
        const c = this.impact;
        // in the pattern plane (pane mid-surface for planar parts, ⟂ dir otherwise). The first
        // tries keep the ray angle; if the ray leaves the part (edge/corner impacts) the angle
        // is resampled too, so the seed lands in the in-part sector instead of being clamped.
        let tryNo = 0;
        this.push(this.sample(() => {
          const t = tryNo++;
          const rr = r * rng.range(0.9, 1.1) * (t < 3 ? 1 : rng.range(0.5, 1));
          const aa = t < 3 ? a : rng.range(0, Math.PI * 2);
          return this.inPlane(c, rr * Math.cos(aa), rr * Math.sin(aa));
        }, 12));
        made++;
      }
    }
    for (let f = 0; f < nFar; f++) this.push(this.spreadPoint(1.2 * this.radius));
  }

  dice(count: number): void {
    const rng = this.rng;
    const area = this.ext[0] * this.ext[1];
    const vol = Math.max(polyVolume(this.poly), 1e-18);
    let cell = this.opts.cell && this.opts.cell > 0 ? this.opts.cell : this.planar ? Math.sqrt(area / count) : Math.cbrt(vol / count);
    const est = () => (this.planar ? area / (cell * cell) : vol / (cell * cell * cell));
    if (est() > 1.25 * count) cell *= this.planar ? Math.sqrt(est() / count) : Math.cbrt(est() / count);
    if (this.planar) {
      // 2D grid in (e1, e2) over the projected extent, seeds on the mid-surface
      let ulo = Infinity,
        uhi = -Infinity,
        vlo = Infinity,
        vhi = -Infinity;
      const c = this.centroid;
      for (const p of this.poly.verts) {
        const d = vx(p.x - c.x, p.y - c.y, p.z - c.z);
        ulo = Math.min(ulo, dot(d, this.e1));
        uhi = Math.max(uhi, dot(d, this.e1));
        vlo = Math.min(vlo, dot(d, this.e2));
        vhi = Math.max(vhi, dot(d, this.e2));
      }
      const nu = Math.max(1, Math.round((uhi - ulo) / cell)),
        nv = Math.max(1, Math.round((vhi - vlo) / cell));
      const cu = (uhi - ulo) / nu,
        cv = (vhi - vlo) / nv;
      for (let i = 0; i < nu; i++) {
        for (let j = 0; j < nv; j++) {
          const u = ulo + (i + 0.5 + rng.range(-0.35, 0.35)) * cu;
          const v = vlo + (j + 0.5 + rng.range(-0.35, 0.35)) * cv;
          const q = this.accept(this.inPlane(c, u, v));
          if (q) this.push(q);
        }
      }
    } else {
      const n = [0, 1, 2].map((k) => Math.max(1, Math.round((this.obbHi[k] - this.obbLo[k]) / cell)));
      const A = this.axes;
      for (let i = 0; i < n[0]; i++)
        for (let j = 0; j < n[1]; j++)
          for (let k = 0; k < n[2]; k++) {
            const s = [i, j, k].map((q, a) => this.obbLo[a] + ((q + 0.5 + rng.range(-0.35, 0.35)) * (this.obbHi[a] - this.obbLo[a])) / n[a]);
            const p = vx(A[0].x * s[0] + A[1].x * s[1] + A[2].x * s[2], A[0].y * s[0] + A[1].y * s[1] + A[2].y * s[2], A[0].z * s[0] + A[1].z * s[1] + A[2].z * s[2]);
            const q = this.accept(p);
            if (q) this.push(q);
          }
    }
    if (this.seeds.length === 0) this.push(this.clampInside(this.centroid));
  }

  /** Inner cluster from `gen(radius)` + far seeds. */
  cluster(count: number, far: number, gen: (r: number) => Vec3): void {
    const nFar = Math.min(count - 1, Math.max(0, far));
    const nIn = Math.max(1, count - nFar);
    for (let i = 0; i < nIn; i++) this.push(this.sample(() => gen(this.radius)));
    for (let f = 0; f < nFar; f++) this.push(this.spreadPoint(1.2 * this.radius));
  }

  splinter(count: number): void {
    const rng = this.rng;
    let gr = this.opts.grain ? unit(this.opts.grain) : this.axes[0];
    if (!(Math.hypot(gr.x, gr.y, gr.z) > 0.5)) gr = this.axes[0];
    const nFar = Math.min(count - 1, Math.max(0, this.opts.far ?? 2));
    const nIn = Math.max(1, count - nFar);
    const along = 2.5 * this.radius,
      across = 0.6 * this.radius;
    // orthonormal frame (g, b1, b2); for planar parts the grain is projected into the plate
    let g = gr;
    if (this.planar) {
      const gd = dot(g, this.n);
      const p = vx(g.x - this.n.x * gd, g.y - this.n.y * gd, g.z - this.n.z * gd);
      g = Math.hypot(p.x, p.y, p.z) > 1e-6 ? unit(p) : this.e1;
    }
    const b1 = this.planar ? cross(this.n, g) : unit(cross(g, Math.abs(g.x) < 0.9 ? vx(1, 0, 0) : vx(0, 1, 0)));
    const b2 = cross(g, b1);
    const c = this.impact;
    for (let i = 0; i < nIn; i++) {
      this.push(this.sample(() => {
        const s = rng.inSphere();
        const z = this.planar ? 0 : s.z * across;
        return vx(
          c.x + g.x * s.x * along + b1.x * s.y * across + b2.x * z,
          c.y + g.y * s.x * along + b1.y * s.y * across + b2.y * z,
          c.z + g.z * s.x * along + b1.z * s.y * across + b2.z * z,
        );
      }));
    }
    for (let f = 0; f < nFar; f++) this.push(this.spreadPoint(1.2 * this.radius));
  }

  crumble(count: number): void {
    const rng = this.rng;
    const nFar = Math.min(count - 1, Math.max(0, this.opts.far ?? 2));
    const nIn = Math.max(1, count - nFar);
    const crumbs = Math.max(1, Math.round(0.65 * nIn));
    const medium = nIn - crumbs;
    for (let i = 0; i < crumbs; i++) this.push(this.sample(() => this.ballPoint(this.impact, 0.5 * this.radius, 0.4)));
    for (let i = 0; i < medium; i++) {
      this.push(this.sample(() => {
        const r = this.radius * rng.range(0.5, 1.3);
        if (this.planar) {
          const a = rng.range(0, Math.PI * 2);
          return this.inPlane(this.impact, r * Math.cos(a), r * Math.sin(a));
        }
        const d = rng.onSphere();
        return vx(this.impact.x + d.x * r, this.impact.y + d.y * r, this.impact.z + d.z * r);
      }));
    }
    for (let f = 0; f < nFar; f++) this.push(this.spreadPoint(1.2 * this.radius));
  }

  crackPattern(count: number): void {
    const n = Math.max(1, count);
    const r0 = Math.min(this.radius, 0.25 * this.ext[0]);
    this.push(this.sample(() => this.ballPoint(this.impact, r0, 0)));
    for (let i = 1; i < n; i++) this.push(this.spreadPoint(0));
  }
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return vx(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
function unit(a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z);
  return l > 1e-300 && Number.isFinite(l) ? vx(a.x / l, a.y / l, a.z / l) : vx(0, 0, 0);
}
function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
