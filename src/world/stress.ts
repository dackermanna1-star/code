// Structural stress analysis for progressive collapse.
//
// The world around a damage site is coarsened into 4x4x4-voxel cells (0.4 m). Each cell has a mass and
// links to its 6 neighbours whose capacities come from the voxel pairs touching across the shared face
// (compression for loads flowing down, shear for horizontal flow, tension for hanging loads), using
// the weaker material of each pair. Cells below the original ground surface are anchors; structures leaving the
// analysis domain are truncated.
//
// Glass, lamps and foliage carry no load. Loads are routed towards the anchors along the cheapest paths (down < sideways < up), accumulating
// from the farthest cells inwards. Links whose flow exceeds their capacity fail: the face layer of voxels
// crumbles, the connectivity system detaches whatever lost its support, and a follow-up analysis is
// scheduled so collapses progress over time.

import { World, CK } from './world';
import { PAL_MAT, Mat, PAL_DENSITY, PAL_NOLOAD } from './materials';

// capacities in kg per voxel pair: [compression, shear, tension]
const CAP: number[][] = [];
const setCap = (m: Mat, c: number, s: number, t: number) => { CAP[m] = [c, s, t]; };
setCap(Mat.Air, 0, 0, 0);
setCap(Mat.Concrete, 12000, 700, 260);
setCap(Mat.Brick, 9000, 420, 130);
setCap(Mat.Plaster, 1200, 110, 50);
setCap(Mat.Wood, 3000, 260, 260);
setCap(Mat.Metal, 50000, 5000, 5000);
setCap(Mat.HeavyMetal, 100000, 15000, 15000);
setCap(Mat.Glass, 0, 0, 0);      // glass is never load bearing (its weight is ignored)
setCap(Mat.Dirt, 5000, 0, 0);   // loose materials only carry compression
setCap(Mat.Grass, 5000, 0, 0);
setCap(Mat.Gravel, 5000, 0, 0);
setCap(Mat.Rock, 20000, 400, 150);
setCap(Mat.Asphalt, 2000, 150, 60);
setCap(Mat.Plastic, 400, 200, 200);
setCap(Mat.Foliage, 0, 0, 0);
setCap(Mat.Rubber, 700, 400, 400);
setCap(Mat.Explosive, 6000, 4000, 4000);
setCap(Mat.Fabric, 1500, 0, 0);
setCap(Mat.Light, 0, 0, 0);
setCap(Mat.Bedrock, 1e9, 1e9, 1e9);
setCap(Mat.Rubble, 3000, 0, 0);
setCap(Mat.Char, 100, 0, 0);

// flat tables per palette index
const P_COMP = new Float32Array(256), P_SHEAR = new Float32Array(256), P_TENS = new Float32Array(256);
// thin sheet metal (cladding, roofing, grates, containers) is far weaker than structural steel sections
const SHEET = [4000, 220, 220];
for (let i = 1; i < 256; i++) {
  const thin = (PAL_MAT[i] === Mat.Metal || PAL_MAT[i] === Mat.Explosive) && PAL_DENSITY[i] < 0.7;
  const c = PAL_NOLOAD[i] ? [0, 0, 0] : thin ? SHEET : CAP[PAL_MAT[i]] || CAP[Mat.Concrete];
  P_COMP[i] = c[0]; P_SHEAR[i] = c[1]; P_TENS[i] = c[2];
}

const HALF = 120;      // domain half size (voxels) -> 24 m wide
const CORE = 84;       // failures are only applied inside this half size
const PREF = [0.7, 0.7, 0.35, 1.0, 0.7, 0.7]; // flow preference per direction (+X,-X,+Y,-Y,+Z,-Z)
const COST = [2, 2, 4, 1, 2, 2];

export interface StressFailure { x: number; y: number; z: number; dir: number; ratio: number }

interface Req { x: number; y: number; z: number; t: number; gen: number }

export class Stress {
  private reqs: Req[] = [];
  // node storage (reused)
  private idx = new Int32Array(0);
  private cap = 0;
  private mass = new Float32Array(0);
  private anchor = new Uint8Array(0);
  private nb = new Int32Array(0);
  private capL = new Float32Array(0);
  private dist = new Int32Array(0);
  private load = new Float32Array(0);
  private cellPos = new Int32Array(0);
  private nn = 0;
  enabled = true;
  stats = { analyses: 0, nodes: 0, failures: 0, ms: 0, baselines: 0 };
  /** capacity multipliers for links that are already overloaded in the intact structure */
  private reinforce = new Map<number, number>();
  private baselineDone = new Set<number>();
  /** called to crumble the face layer of a cell towards a neighbour */
  onFail: ((f: StressFailure) => void) | null = null;

  constructor(readonly world: World) {}

  /**
   * Ask for an analysis of the tile(s) around a voxel position after `delay` seconds. Domains are always
   * centred on a fixed 12.8 m tile grid so that post-damage analyses see the same domain as the baseline.
   */
  request(x: number, y: number, z: number, delay = 0.12, gen = 0): void {
    if (!this.enabled || x < 0 || z < 0 || x >= this.world.sx || z >= this.world.sz) return;
    const tx0 = (x - 32) >> 7, tx1 = (x + 32) >> 7, tz0 = (z - 32) >> 7, tz1 = (z + 32) >> 7;
    for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
      const cx = tx * 128 + 64, cz = tz * 128 + 64;
      if (cx < 0 || cz < 0 || cx >= this.world.sx || cz >= this.world.sz) continue;
      let found = false;
      for (const r of this.reqs) if (r.x === cx && r.z === cz) { r.t = Math.min(r.t, delay); r.y = Math.max(r.y, y); r.gen = Math.min(r.gen, gen); found = true; break; }
      if (!found) this.reqs.push({ x: cx, y, z: cz, t: delay, gen });
    }
  }

  /** Tiles still lacking a baseline, nearest to (x, z) first. Returns false when all are done. */
  baselineStep(x: number, z: number, budgetMs: number): boolean {
    const t0 = performance.now();
    const ntx = Math.ceil(this.world.sx / 128), ntz = Math.ceil(this.world.sz / 128);
    if (!this.order) {
      const list: number[] = [];
      for (let tz = 0; tz < ntz; tz++) for (let tx = 0; tx < ntx; tx++) list.push(tx + 1000 * tz);
      const cx = x >> 7, cz = z >> 7;
      list.sort((a, b) => Math.hypot((a % 1000) - cx, ((a / 1000) | 0) - cz) - Math.hypot((b % 1000) - cx, ((b / 1000) | 0) - cz));
      this.order = list;
    }
    while (this.order.length) {
      const k = this.order[0];
      if (!this.baselineDone.has(k)) {
        this.ensureBaseline((k % 1000) * 128 + 64, ((k / 1000) | 0) * 128 + 64);
        if (performance.now() - t0 > budgetMs) { this.order.shift(); return true; }
      }
      this.order.shift();
    }
    return false;
  }
  private order: number[] | null = null;

  /** Baselines for every tile a request at (x, z) will analyse (call before damaging voxels). */
  prepare(x: number, z: number): void {
    if (x < 0 || z < 0 || x >= this.world.sx || z >= this.world.sz) return;
    const tx0 = (x - 32) >> 7, tx1 = (x + 32) >> 7, tz0 = (z - 32) >> 7, tz1 = (z + 32) >> 7;
    for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) this.ensureBaseline(tx * 128 + 64, tz * 128 + 64);
  }

  get pending(): number { return this.reqs.length; }

  /**
   * Make sure the intact structure around (x, z) has been analysed once before it gets damaged: any link
   * that is already over capacity is reinforced, so undamaged structures always stand and collapses
   * are driven by load redistribution after damage.
   */
  ensureBaseline(x: number, z: number): void {
    if (!this.enabled || x < 0 || z < 0 || x >= this.world.sx || z >= this.world.sz) return;
    const tk = (x >> 7) + 1000 * (z >> 7);
    if (this.baselineDone.has(tk)) return;
    this.baselineDone.add(tk);
    this.analyze((x >> 7) * 128 + 64, (z >> 7) * 128 + 64, true);
    this.stats.baselines++;
  }

  private linkKey(n: number, d: number): number {
    const px = this.cellPos[n * 3] >> 2, py = this.cellPos[n * 3 + 1] >> 2, pz = this.cellPos[n * 3 + 2] >> 2;
    return (px + 640 * (pz + 640 * py)) * 6 + d;
  }

  update(dt: number): void {
    if (!this.reqs.length) return;
    for (const r of this.reqs) r.t -= dt;
    // at most one analysis per update
    const i = this.reqs.findIndex((r) => r.t <= 0);
    if (i < 0) return;
    const r = this.reqs.splice(i, 1)[0];
    const fails = this.analyze(r.x, r.z);
    if (fails.length && r.gen < 80) {
      for (const f of fails) this.onFail?.(f);
      // progressive collapse: look again shortly
      this.request(r.x, r.y, r.z, 0.1, r.gen + 1);
    }
  }

  private ensure(n: number): void {
    if (this.cap >= n) return;
    const c = Math.max(n, this.cap * 2, 4096);
    const grow = <T extends Float32Array | Int32Array | Uint8Array>(a: T, size: number): T => {
      const b = new (a.constructor as any)(size) as T;
      b.set(a);
      return b;
    };
    this.mass = grow(this.mass, c); this.anchor = grow(this.anchor, c); this.nb = grow(this.nb, c * 6);
    this.capL = grow(this.capL, c * 6); this.dist = grow(this.dist, c); this.load = grow(this.load, c); this.cellPos = grow(this.cellPos, c * 3);
    this.cap = c;
  }

  /** Per-chunk masses of its 64 cells (4^3 voxels each), cached until the chunk changes. */
  private massCache = new Map<number, { stamp: number; m: Float32Array }>();
  private chunkMasses(ci: number): Float32Array {
    const w = this.world;
    const st = w.stamp[ci];
    let e = this.massCache.get(ci);
    if (e && e.stamp === st) return e.m;
    if (!e) { e = { stamp: st, m: new Float32Array(64) }; this.massCache.set(ci, e); }
    e.stamp = st;
    const m = e.m;
    m.fill(0);
    const d = w.data[ci] as Uint8Array;
    for (let i = 0; i < 4096; i++) {
      const v = d[i];
      if (v) m[((i >> 2) & 3) | (((i >> 6) & 3) << 2) | ((i >> 10) << 4)] += PAL_DENSITY[v];
    }
    return m;
  }

  /** Analyze the domain centred at voxel (cx, cz). Returns failures (strongest first). */
  analyze(cx: number, cz: number, baseline = false): StressFailure[] {
    const t0 = performance.now();
    const w = this.world;
    const x0 = Math.max(0, (cx - HALF) & ~3), z0 = Math.max(0, (cz - HALF) & ~3);
    const x1 = Math.min(w.sx, (cx + HALF + 3) & ~3), z1 = Math.min(w.sz, (cz + HALF + 3) & ~3);
    const NX = (x1 - x0) >> 2, NZ = (z1 - z0) >> 2, NY = w.sy >> 2;
    const ncell = NX * NY * NZ;
    if (this.idx.length < ncell) this.idx = new Int32Array(ncell);
    const idx = this.idx;
    idx.fill(-1, 0, ncell);
    this.nn = 0;
    const t = w.terrain;
    // ---- gather cells: mass per cell from the chunks of the domain
    const cellOf = (x: number, y: number, z: number) => ((x - x0) >> 2) + NX * (((z - z0) >> 2) + NZ * (y >> 2));
    const addNode = (ci: number, x: number, y: number, z: number): number => {
      let n = idx[ci];
      if (n >= 0) return n;
      n = this.nn++;
      this.ensure(this.nn);
      idx[ci] = n;
      this.mass[n] = 0;
      const cxl = x & ~3, cyl = y & ~3, czl = z & ~3;
      this.cellPos[n * 3] = cxl; this.cellPos[n * 3 + 1] = cyl; this.cellPos[n * 3 + 2] = czl;
      // anchor: below the original ground surface. Structures leaving the domain are simply truncated
      // (their load paths outside are unknown, which errs on the side of stability).
      const top = cyl + 3;
      const gh = t.heightAt(cxl + 2, czl + 2);
      this.anchor[n] = top < gh || cyl < 8 ? 1 : 0;
      for (let d = 0; d < 6; d++) { this.nb[n * 6 + d] = -1; this.capL[n * 6 + d] = 0; }
      return n;
    };
    for (let cy = 0; cy < w.ncy; cy++) for (let czc = z0 >> 4; czc <= (z1 - 1) >> 4; czc++) for (let cxc = x0 >> 4; cxc <= (x1 - 1) >> 4; cxc++) {
      const ci = cxc + w.ncx * (czc + w.ncz * cy);
      // virtual terrain chunks are entirely ground: only cells resting on them matter (anchored below)
      if (w.kind[ci] !== CK.Dense || w.count[ci] === 0) continue;
      const cm = this.chunkMasses(ci);
      const bx = cxc << 4, by = cy << 4, bz = czc << 4;
      for (let c = 0; c < 64; c++) {
        const m = cm[c];
        if (m <= 0) continue;
        const x = bx + ((c & 3) << 2), z = bz + (((c >> 2) & 3) << 2), y = by + ((c >> 4) << 2);
        if (x < x0 || x >= x1 || z < z0 || z >= z1) continue;
        const n = addNode(cellOf(x, y, z), x, y, z);
        this.mass[n] += m;
      }
    }
    const nn = this.nn;
    if (nn === 0) { this.stats.ms = performance.now() - t0; return []; }
    // ---- links: voxel pairs across the +X/+Y/+Z faces of each cell. Every node lies in a dense chunk
    // (cells never straddle chunks), so voxels are read straight from the chunk arrays.
    const data = w.data, ncx = w.ncx, nxz = w.ncx * w.ncz;
    for (let n = 0; n < nn; n++) {
      const px = this.cellPos[n * 3], py = this.cellPos[n * 3 + 1], pz = this.cellPos[n * 3 + 2];
      const ci = (px >> 4) + ncx * ((pz >> 4) + w.ncz * (py >> 4));
      const A = data[ci] as Uint8Array;
      const lx = px & 15, ly = py & 15, lz = pz & 15;
      const base = lx | (lz << 4) | (ly << 8);
      // +X
      if (px + 4 < x1) {
        const m = idx[cellOf(px + 4, py, pz)];
        if (m >= 0) {
          const B = lx === 12 ? data[ci + 1] as Uint8Array : A;
          const ob = lx === 12 ? base - 12 : base + 4;
          let s = 0;
          for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
            const o = (a << 8) | (b << 4);
            const va = A[base + 3 + o]; if (!va) continue;
            const vb = B[ob + o]; if (!vb) continue;
            s += Math.min(P_SHEAR[va], P_SHEAR[vb]);
          }
          if (s > 0) { this.nb[n * 6 + 0] = m; this.nb[m * 6 + 1] = n; this.capL[n * 6 + 0] = s; this.capL[m * 6 + 1] = s; }
        }
      }
      // +Z
      if (pz + 4 < z1) {
        const m = idx[cellOf(px, py, pz + 4)];
        if (m >= 0) {
          const B = lz === 12 ? data[ci + ncx] as Uint8Array : A;
          const ob = lz === 12 ? base - (12 << 4) : base + (4 << 4);
          let s = 0;
          for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
            const o = a | (b << 8);
            const va = A[base + (3 << 4) + o]; if (!va) continue;
            const vb = B[ob + o]; if (!vb) continue;
            s += Math.min(P_SHEAR[va], P_SHEAR[vb]);
          }
          if (s > 0) { this.nb[n * 6 + 4] = m; this.nb[m * 6 + 5] = n; this.capL[n * 6 + 4] = s; this.capL[m * 6 + 5] = s; }
        }
      }
      // +Y (n below, m above)
      if (py + 4 < w.sy) {
        const m = idx[cellOf(px, py + 4, pz)];
        if (m >= 0) {
          const B = ly === 12 ? data[ci + nxz] as Uint8Array : A;
          const ob = ly === 12 ? base - (12 << 8) : base + (4 << 8);
          let comp = 0, tens = 0;
          for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
            const o = a | (b << 4);
            const va = A[base + (3 << 8) + o]; if (!va) continue;
            const vb = B[ob + o]; if (!vb) continue;
            comp += Math.min(P_COMP[va], P_COMP[vb]);
            tens += Math.min(P_TENS[va], P_TENS[vb]);
          }
          if (comp > 0) { this.nb[n * 6 + 2] = m; this.nb[m * 6 + 3] = n; this.capL[n * 6 + 2] = tens; this.capL[m * 6 + 3] = comp; }
        }
      }
    }
    // cells resting directly on the ground (the cell below is virtual terrain): anchored through the bottom
    for (let n = 0; n < nn; n++) {
      if (this.anchor[n] || this.nb[n * 6 + 3] >= 0) continue;
      const px = this.cellPos[n * 3], py = this.cellPos[n * 3 + 1], pz = this.cellPos[n * 3 + 2];
      if (py >= 4 && py - 1 < t.heightAt(px + 2, pz + 2)) {
        let any = false;
        for (let a = 0; a < 4 && !any; a++) for (let b = 0; b < 4; b++) if (w.get(px + a, py, pz + b) && w.get(px + a, py - 1, pz + b)) { any = true; break; }
        if (any) this.anchor[n] = 1;
      }
    }
    // ---- distances to the anchors (Dijkstra with small integer costs via bucket queue)
    const dist = this.dist;
    const INF = 0x3fffffff;
    const buckets: number[][] = [];
    for (let n = 0; n < nn; n++) {
      if (this.anchor[n]) { dist[n] = 0; (buckets[0] || (buckets[0] = [])).push(n); } else dist[n] = INF;
    }
    for (let dcur = 0; dcur < buckets.length; dcur++) {
      const bk = buckets[dcur];
      if (!bk) continue;
      for (let k = 0; k < bk.length; k++) {
        const n = bk[k];
        if (dist[n] !== dcur) continue;
        for (let d = 0; d < 6; d++) {
          const m = this.nb[n * 6 + d];
          if (m < 0 || this.anchor[m]) continue;
          // edge m -> n carries load in direction opposite to d; use the cost of that direction
          const back = d ^ 1;
          if (this.capL[m * 6 + back] <= 0) continue;
          const nd = dcur + COST[back];
          if (nd < dist[m]) { dist[m] = nd; (buckets[nd] || (buckets[nd] = [])).push(m); }
        }
      }
    }
    // ---- push loads from the farthest cells towards the anchors
    const load = this.load;
    for (let n = 0; n < nn; n++) load[n] = this.mass[n];
    const fails: StressFailure[] = [];
    const icx0 = cx - CORE, icx1 = cx + CORE, icz0 = cz - CORE, icz1 = cz + CORE;
    for (let dcur = buckets.length - 1; dcur > 0; dcur--) {
      const bk = buckets[dcur];
      if (!bk) continue;
      for (const n of bk) {
        if (dist[n] !== dcur) continue;
        let wsum = 0;
        for (let d = 0; d < 6; d++) {
          const m = this.nb[n * 6 + d];
          if (m < 0 || dist[m] >= dcur) continue;
          wsum += this.capL[n * 6 + d] * PREF[d];
        }
        if (wsum <= 0) continue;
        const L = load[n];
        for (let d = 0; d < 6; d++) {
          const m = this.nb[n * 6 + d];
          if (m < 0 || dist[m] >= dcur) continue;
          const c0 = this.capL[n * 6 + d];
          const f = (L * c0 * PREF[d]) / wsum;
          load[m] += f;
          if (f > c0) {
            const key = this.linkKey(n, d);
            const rf = this.reinforce.get(key) ?? 1;
            const c = c0 * rf;
            if (f > c) {
              if (baseline) this.reinforce.set(key, (f / c0) * 1.35);
              else {
                const px = this.cellPos[n * 3], pz = this.cellPos[n * 3 + 2];
                if (px >= icx0 && px <= icx1 && pz >= icz0 && pz <= icz1) fails.push({ x: px, y: this.cellPos[n * 3 + 1], z: pz, dir: d, ratio: f / c });
              }
            }
          }
        }
      }
    }
    fails.sort((a, b) => b.ratio - a.ratio);
    this.stats.analyses++;
    this.stats.nodes = nn;
    this.stats.ms = performance.now() - t0;
    // the most overloaded links break first (cracks start where loads converge, so structures come
    // apart in large pieces); the load then redistributes and the next pass continues the crack
    const out: StressFailure[] = [];
    const seen = new Set<number>();
    const cutoff = fails.length ? Math.max(1, fails[0].ratio * 0.45) : 1;
    for (const f of fails) {
      if (out.length >= 48 || f.ratio < cutoff) break;
      const k = (f.x >> 2) + 1000 * ((f.z >> 2) + 1000 * (f.y >> 2));
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(f);
    }
    this.stats.failures += out.length;
    return out;
  }
}
