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
setCap(Mat.Metal, 12000, 1200, 1200); // voxel members stand for I-sections, not solid steel
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
// Non-structural parts carry no load: thin sheet metal (cladding, roofing, grates, container walls) and
// plaster partitions hang on the frame rather than hold it up. Treating them as load paths let 1 mm
// cladding "support" a roof whose columns were cut, and let partitions pull slab loads around damage.
// Their weight still counts where they are attached to structure.
for (let i = 1; i < 256; i++) {
  const thin = (PAL_MAT[i] === Mat.Metal || PAL_MAT[i] === Mat.Explosive) && PAL_DENSITY[i] < 0.7;
  const c = PAL_NOLOAD[i] || thin || PAL_MAT[i] === Mat.Plaster ? [0, 0, 0] : CAP[PAL_MAT[i]] || CAP[Mat.Concrete];
  P_COMP[i] = c[0]; P_SHEAR[i] = c[1]; P_TENS[i] = c[2];
}

const HALF = 120;      // domain half size (voxels) -> 24 m wide
const CORE = 84;       // failures are only applied inside this half size
const PREF = [0.7, 0.7, 0.35, 1.0, 0.7, 0.7]; // flow preference per direction (+X,-X,+Y,-Y,+Z,-Z)
const COST = [2, 2, 4, 1, 2, 2];
/** bending capacity factor: moment capacity of a link = capacity x member depth (cells) x BEND (cells) */
const BEND = 1.0;
/** path cost of structure held from outside the analysis domain */
const EDGE_COST = 48;

export interface StressFailure { x: number; y: number; z: number; dir: number; ratio: number; bend?: boolean }

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
  private moment = new Float32Array(0);
  private cellPos = new Int32Array(0);
  private cellIdx = new Int32Array(0);
  private edge = new Uint8Array(0);
  private owner = new Int32Array(0);
  /** load-weighted path growth carried by each cell's flow (see snaps) */
  private gw = new Float32Array(0);
  private queue2 = new Int32Array(0);
  /** path length of each node in the pre-damage snapshot (-1: not part of the structure then) */
  private prev = new Int32Array(0);
  private nn = 0;
  enabled = true;
  /**
   * Load-path length of every cell in a tile just before the tile was first damaged. A link may only fail
   * when the damage made its cell's path to the ground substantially longer (it lost its direct support):
   * cutting columns does, a hole in a wall that loads can simply walk around does not. Without this,
   * small holes re-route flows far away and the cracks wander through the whole building.
   */
  private snaps = new Map<number, { keys: Int32Array; dist: Uint16Array }>();
  /** minimum growth of a cell's load path (cost units: ~2 per extra horizontal cell) before it may fail */
  growMin = 12;
  /** time budget (ms) of the structural work done per update; longer analyses resume on the next update */
  sliceMs = 4;
  /** the analysis in progress (time-sliced): a damage request, or the baseline of tile `base` */
  private job: { it: Generator<void, StressFailure[], void>; req: Req | null; base: number; ms: number } | null = null;
  private deadline = Infinity;
  /** for tuning: path growth of every failure found by the last analysis */
  lastGrowth: number[] = [];
  stats = { analyses: 0, nodes: 0, failures: 0, ms: 0, baselines: 0 };
  /** capacity multipliers for links that are already overloaded in the intact structure */
  private reinforce = new Map<number, number>();
  /** same for bending (moment) capacities */
  private reinforceM = new Map<number, number>();
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
    // damage analyses come first; baselines wait until they are done
    if (!this.enabled) return false;
    if ((this.job && this.job.req) || this.reqs.some((r) => r.t <= 0)) return true;
    this.deadline = t0 + budgetMs;
    for (;;) {
      if (!this.job) {
        while (this.order.length && this.baselineDone.has(this.order[0])) this.order.shift();
        const k = this.order.shift();
        if (k === undefined) return false;
        this.job = { it: this.run((k % 1000) * 128 + 64, ((k / 1000) | 0) * 128 + 64, true, false), req: null, base: k, ms: 0 };
      }
      if (!this.stepJob()) return true;
      if (performance.now() > this.deadline) return true;
    }
  }
  private order: number[] | null = null;

  /** Baselines for every tile a request at (x, z) will analyse (call before damaging voxels). */
  prepare(x: number, z: number): void {
    if (x < 0 || z < 0 || x >= this.world.sx || z >= this.world.sz) return;
    const tx0 = (x - 32) >> 7, tx1 = (x + 32) >> 7, tz0 = (z - 32) >> 7, tz1 = (z + 32) >> 7;
    for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
      const cx = tx * 128 + 64, cz = tz * 128 + 64;
      if (cx < 0 || cz < 0 || cx >= this.world.sx || cz >= this.world.sz) continue;
      this.ensureBaseline(cx, cz);
      if (!this.snaps.has(tx + 1000 * tz)) this.analyze(cx, cz, false, true);
    }
  }

  get pending(): number { return this.reqs.length + (this.job && this.job.req ? 1 : 0); }

  /**
   * Make sure the intact structure around (x, z) has been analysed once before it gets damaged: any link
   * that is already over capacity is reinforced, so undamaged structures always stand and collapses
   * are driven by load redistribution after damage.
   */
  ensureBaseline(x: number, z: number): void {
    if (!this.enabled || x < 0 || z < 0 || x >= this.world.sx || z >= this.world.sz) return;
    const tk = (x >> 7) + 1000 * (z >> 7);
    if (this.baselineDone.has(tk)) return;
    this.analyze((x >> 7) * 128 + 64, (z >> 7) * 128 + 64, true);
    this.baselineDone.add(tk);
    this.stats.baselines++;
  }

  private linkKey(n: number, d: number): number {
    const px = this.cellPos[n * 3] >> 2, py = this.cellPos[n * 3 + 1] >> 2, pz = this.cellPos[n * 3 + 2] >> 2;
    return (px + 640 * (pz + 640 * py)) * 6 + d;
  }

  /**
   * Runs due analyses for at most `sliceMs`: a large domain takes several updates instead of stalling one
   * frame, so damage and long collapses cost a bounded amount per frame.
   */
  update(dt: number): void {
    for (const r of this.reqs) r.t -= dt;
    this.work(this.sliceMs);
  }

  /** Extra analysis time when the frame has some to spare (collapses then progress faster). */
  idle(ms: number): void { this.work(ms); }

  private work(ms: number): void {
    if (!this.reqs.length && !(this.job && this.job.req)) return;
    this.deadline = performance.now() + ms;
    for (;;) {
      if (!this.job || !this.job.req) {
        const i = this.reqs.findIndex((r) => r.t <= 0);
        if (i < 0) return;
        this.dropJob(); // a baseline in progress starts over later
        const r = this.reqs.splice(i, 1)[0];
        this.job = { it: this.run(r.x, r.z, false, false), req: r, base: -1, ms: 0 };
      }
      if (!this.stepJob()) return;
      if (performance.now() > this.deadline) return;
    }
  }

  /** Advances the current job until the deadline. Returns true when it finished (and was handled). */
  private stepJob(): boolean {
    const job = this.job!;
    const t = performance.now();
    const res = job.it.next();
    job.ms += performance.now() - t;
    if (!res.done) return false;
    this.job = null;
    this.stats.ms = job.ms;
    if (!job.req) { this.baselineDone.add(job.base); this.stats.baselines++; return true; }
    const r = job.req, fails = res.value;
    if (fails.length && r.gen < 80) {
      for (const f of fails) this.onFail?.(f);
      // progressive collapse: look again shortly
      this.request(r.x, r.y, r.z, 0.1, r.gen + 1);
    }
    return true;
  }

  /** Abandons the sliced analysis in progress (its buffers are about to be reused); it is redone later. */
  private dropJob(): void {
    const job = this.job;
    if (!job) return;
    this.job = null;
    if (job.req) {
      let found = false;
      for (const r of this.reqs) if (r.x === job.req.x && r.z === job.req.z) { r.t = 0; r.gen = Math.min(r.gen, job.req.gen); found = true; }
      if (!found) this.reqs.unshift({ ...job.req, t: 0 });
    } else if (this.order) this.order.unshift(job.base);
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
    this.capL = grow(this.capL, c * 6); this.dist = grow(this.dist, c); this.load = grow(this.load, c); this.moment = grow(this.moment, c); this.cellPos = grow(this.cellPos, c * 3); this.cellIdx = grow(this.cellIdx, c); this.edge = grow(this.edge, c); this.owner = grow(this.owner, c); this.gw = grow(this.gw, c); this.queue2 = grow(this.queue2, c); this.prev = grow(this.prev, c);
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
      if (v && !PAL_NOLOAD[v]) m[((i >> 2) & 3) | (((i >> 6) & 3) << 2) | ((i >> 10) << 4)] += PAL_DENSITY[v];
    }
    return m;
  }

  /**
   * Link capacities of the 64 cells of a chunk towards their +X / +Z / +Y neighbours (shear, shear,
   * compression, tension per cell), from the voxel pairs across each face. Damage analyses keep them per
   * chunk until the chunk or a neighbour it links into changes; one-off analyses use a scratch array.
   */
  private linkCache = new Map<number, { st: Uint32Array; L: Float32Array }>();
  private linkScratch: Float32Array = new Float32Array(256);
  private chunkLinks(ci: number, cache: boolean): Float32Array {
    const w = this.world, nxz = w.ncx * w.ncz;
    const cx = ci % w.ncx, cz = Math.floor(ci / w.ncx) % w.ncz, cy = Math.floor(ci / nxz);
    const iX = cx + 1 < w.ncx ? ci + 1 : -1, iZ = cz + 1 < w.ncz ? ci + w.ncx : -1, iY = cy + 1 < w.ncy ? ci + nxz : -1;
    let L = this.linkScratch;
    if (cache) {
      const s0 = w.stamp[ci], s1 = iX >= 0 ? w.stamp[iX] : 0, s2 = iZ >= 0 ? w.stamp[iZ] : 0, s3 = iY >= 0 ? w.stamp[iY] : 0;
      let e = this.linkCache.get(ci);
      if (e && e.st[0] === s0 && e.st[1] === s1 && e.st[2] === s2 && e.st[3] === s3) return e.L;
      if (!e) {
        if (this.linkCache.size > 16384) this.linkCache.clear();
        e = { st: new Uint32Array(4), L: new Float32Array(256) };
        this.linkCache.set(ci, e);
      }
      e.st[0] = s0; e.st[1] = s1; e.st[2] = s2; e.st[3] = s3;
      L = e.L;
    }
    L.fill(0);
    const A = w.data[ci];
    if (!A) return L; // emptied since the cells were gathered
    const BX = iX >= 0 ? w.data[iX] : null, BZ = iZ >= 0 ? w.data[iZ] : null, BY = iY >= 0 ? w.data[iY] : null;
    const cm = this.chunkMasses(ci);
    for (let c = 0; c < 64; c++) {
      if (cm[c] <= 0) continue; // not a node
      const lx = (c & 3) << 2, lz = ((c >> 2) & 3) << 2, ly = (c >> 4) << 2;
      const base = lx | (lz << 4) | (ly << 8);
      // +X
      let B = lx === 12 ? BX : A;
      if (B) {
        const ob = lx === 12 ? base - 12 : base + 4;
        let s = 0;
        for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
          const o = (a << 8) | (b << 4);
          const va = A[base + 3 + o]; if (!va) continue;
          const vb = B[ob + o]; if (!vb) continue;
          s += Math.min(P_SHEAR[va], P_SHEAR[vb]);
        }
        L[c * 4] = s;
      }
      // +Z
      B = lz === 12 ? BZ : A;
      if (B) {
        const ob = lz === 12 ? base - (12 << 4) : base + (4 << 4);
        let s = 0;
        for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
          const o = a | (b << 8);
          const va = A[base + (3 << 4) + o]; if (!va) continue;
          const vb = B[ob + o]; if (!vb) continue;
          s += Math.min(P_SHEAR[va], P_SHEAR[vb]);
        }
        L[c * 4 + 1] = s;
      }
      // +Y
      B = ly === 12 ? BY : A;
      if (B) {
        const ob = ly === 12 ? base - (12 << 8) : base + (4 << 8);
        let comp = 0, tens = 0;
        for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
          const o = a | (b << 4);
          const va = A[base + (3 << 8) + o]; if (!va) continue;
          const vb = B[ob + o]; if (!vb) continue;
          comp += Math.min(P_COMP[va], P_COMP[vb]);
          tens += Math.min(P_TENS[va], P_TENS[vb]);
        }
        L[c * 4 + 2] = comp; L[c * 4 + 3] = tens;
      }
    }
    return L;
  }

  /** Number of vertically stacked cells (up to 12) that share the horizontal link of n in direction d. */
  private memberDepth(n: number, d: number, idx: Int32Array, cellOf: (x: number, y: number, z: number) => number, x1: number, z1: number): number {
    const px = this.cellPos[n * 3], py = this.cellPos[n * 3 + 1], pz = this.cellPos[n * 3 + 2];
    let depth = 1;
    for (const dy of [4, -4]) {
      for (let k = 1; k < 12; k++) {
        const y = py + dy * k;
        if (y < 0 || y >= this.world.sy) break;
        const m = idx[cellOf(px, y, pz)];
        if (m === undefined || m < 0 || this.nb[m * 6 + d] < 0) break;
        depth++;
      }
    }
    return Math.min(12, depth);
  }

  /** Analyze the domain centred at voxel (cx, cz) right away. Returns failures (strongest first). */
  analyze(cx: number, cz: number, baseline = false, snapshot = false): StressFailure[] {
    this.dropJob();
    const t0 = performance.now(), dl = this.deadline; // may be called from a failure handler inside work()
    this.deadline = Infinity;
    const it = this.run(cx, cz, baseline, snapshot);
    let r = it.next();
    while (!r.done) r = it.next();
    this.deadline = dl;
    this.stats.ms = performance.now() - t0;
    return r.value;
  }

  /**
   * The analysis itself, as a generator that yields whenever `deadline` has passed. Voxels may change
   * between slices; the result then reflects a slightly older state, and the damage queues a new request.
   */
  private *run(cx: number, cz: number, baseline: boolean, snapshot: boolean): Generator<void, StressFailure[], void> {
    const w = this.world;
    let tick = 0;
    const x0 = Math.max(0, (cx - HALF) & ~3), z0 = Math.max(0, (cz - HALF) & ~3);
    const x1 = Math.min(w.sx, (cx + HALF + 3) & ~3), z1 = Math.min(w.sz, (cz + HALF + 3) & ~3);
    const NX = (x1 - x0) >> 2, NZ = (z1 - z0) >> 2, NY = w.sy >> 2;
    const ncell = NX * NY * NZ;
    // cell -> node map: only the entries of the previous analysis need resetting
    if (this.idx.length < ncell) this.idx = new Int32Array(ncell).fill(-1);
    else for (let n = 0; n < this.nn; n++) this.idx[this.cellIdx[n]] = -1;
    const idx = this.idx;
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
      this.cellIdx[n] = ci;
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
      if ((++tick & 15) === 0 && performance.now() > this.deadline) yield;
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
    if (nn === 0) return [];
    // ---- links between neighbouring cells, from the per-chunk link capacities (nodes of a chunk are
    // contiguous, so each chunk is looked up once)
    let lastCi = -1, L: Float32Array = this.linkScratch;
    const ncx = w.ncx, cacheLinks = !baseline && !snapshot;
    for (let n = 0; n < nn; n++) {
      if ((++tick & 255) === 0 && performance.now() > this.deadline) yield;
      const px = this.cellPos[n * 3], py = this.cellPos[n * 3 + 1], pz = this.cellPos[n * 3 + 2];
      const ci = (px >> 4) + ncx * ((pz >> 4) + w.ncz * (py >> 4));
      if (ci !== lastCi) { lastCi = ci; L = this.chunkLinks(ci, cacheLinks); }
      const c = (((px & 15) >> 2) | (((pz & 15) >> 2) << 2) | (((py & 15) >> 2) << 4)) * 4;
      const sx = L[c], sz = L[c + 1], comp = L[c + 2];
      if (sx > 0 && px + 4 < x1) {
        const m = idx[cellOf(px + 4, py, pz)];
        if (m >= 0) { this.nb[n * 6 + 0] = m; this.nb[m * 6 + 1] = n; this.capL[n * 6 + 0] = sx; this.capL[m * 6 + 1] = sx; }
      }
      if (sz > 0 && pz + 4 < z1) {
        const m = idx[cellOf(px, py, pz + 4)];
        if (m >= 0) { this.nb[n * 6 + 4] = m; this.nb[m * 6 + 5] = n; this.capL[n * 6 + 4] = sz; this.capL[m * 6 + 5] = sz; }
      }
      // +Y (n below, m above)
      if (comp > 0 && py + 4 < w.sy) {
        const m = idx[cellOf(px, py + 4, pz)];
        if (m >= 0) { this.nb[n * 6 + 2] = m; this.nb[m * 6 + 3] = n; this.capL[n * 6 + 2] = L[c + 3]; this.capL[m * 6 + 3] = comp; }
      }
    }
    // cells resting directly on the ground (the cell below is virtual terrain): anchored through the bottom
    for (let n = 0; n < nn; n++) {
      if ((++tick & 255) === 0 && performance.now() > this.deadline) yield;
      if (this.anchor[n] || this.nb[n * 6 + 3] >= 0) continue;
      const px = this.cellPos[n * 3], py = this.cellPos[n * 3 + 1], pz = this.cellPos[n * 3 + 2];
      if (py >= 4 && py - 1 < t.heightAt(px + 2, pz + 2)) {
        let any = false;
        for (let a = 0; a < 4 && !any; a++) for (let b = 0; b < 4; b++) if (w.get(px + a, py, pz + b) && w.get(px + a, py - 1, pz + b)) { any = true; break; }
        if (any) this.anchor[n] = 1;
      }
    }
    // non-structural cells (cladding, roofing, partitions with no load-carrying link) hand their weight to the
    // nearest structure they are attached to: a roof's sheeting loads its trusses, cladding its frame
    {
      const owner = this.owner, q = this.queue2;
      let qh = 0, qt = 0;
      for (let n = 0; n < nn; n++) {
        let structural = this.anchor[n] === 1;
        for (let d = 0; d < 6 && !structural; d++) if (this.nb[n * 6 + d] >= 0) structural = true;
        owner[n] = structural ? n : -1;
        if (structural) q[qt++] = n;
      }
      while (qh < qt) {
        if ((++tick & 255) === 0 && performance.now() > this.deadline) yield;
        const n = q[qh++];
        const px = this.cellPos[n * 3], py = this.cellPos[n * 3 + 1], pz = this.cellPos[n * 3 + 2];
        for (let d = 0; d < 6; d++) {
          const x = px + (d === 0 ? 4 : d === 1 ? -4 : 0), y = py + (d === 2 ? 4 : d === 3 ? -4 : 0), z = pz + (d === 4 ? 4 : d === 5 ? -4 : 0);
          if (x < x0 || x >= x1 || z < z0 || z >= z1 || y < 0 || y >= w.sy) continue;
          const m = idx[cellOf(x, y, z)];
          if (m < 0 || owner[m] >= 0) continue;
          owner[m] = owner[n];
          q[qt++] = m;
        }
      }
      for (let n = 0; n < nn; n++) if (owner[n] >= 0 && owner[n] !== n) { this.mass[owner[n]] += this.mass[n]; this.mass[n] = 0; }
    }
    // structure continuing past the domain edge is held from outside, but only through a long arm: those
    // edge cells start at a high path cost, so whatever loses its local support routes out there with a
    // much longer path (and can fail) instead of silently dropping out of the analysis
    const edge = this.edge;
    for (let n = 0; n < nn; n++) {
      if ((++tick & 255) === 0 && performance.now() > this.deadline) yield;
      edge[n] = 0;
      if (this.anchor[n]) continue;
      const px = this.cellPos[n * 3], py = this.cellPos[n * 3 + 1], pz = this.cellPos[n * 3 + 2];
      let ox = 0, oz = 0;
      if (px === x0 && x0 > 0) ox = -1; else if (px + 4 >= x1 && x1 < w.sx) ox = 4;
      if (pz === z0 && z0 > 0) oz = -1; else if (pz + 4 >= z1 && z1 < w.sz) oz = 4;
      if (!ox && !oz) continue;
      for (let a = 0; a < 4 && !edge[n]; a++) for (let b = 0; b < 4; b++) {
        const v1 = ox ? w.get(px + ox, py + a, pz + b) : 0, v2 = oz ? w.get(px + b, py + a, pz + oz) : 0;
        if (P_SHEAR[v1] > 0 || P_SHEAR[v2] > 0) { edge[n] = 1; break; }
      }
    }
    // ---- distances to the anchors (Dijkstra with small integer costs via bucket queue)
    const dist = this.dist;
    const INF = 0x3fffffff;
    const buckets: number[][] = [];
    for (let n = 0; n < nn; n++) {
      if (this.anchor[n]) { dist[n] = 0; (buckets[0] || (buckets[0] = [])).push(n); }
      else if (edge[n]) { dist[n] = EDGE_COST; (buckets[EDGE_COST] || (buckets[EDGE_COST] = [])).push(n); }
      else dist[n] = INF;
    }
    for (let dcur = 0; dcur < buckets.length; dcur++) {
      const bk = buckets[dcur];
      if (!bk) continue;
      for (let k = 0; k < bk.length; k++) {
        if ((++tick & 255) === 0 && performance.now() > this.deadline) yield;
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
    const tileKey = (cx >> 7) + 1000 * (cz >> 7);
    if (snapshot || baseline) {
      // compact copy of every cell's path length: sorted cell indices + distances
      const packed: number[] = [];
      for (let n = 0; n < nn; n++) if (dist[n] < INF) packed.push(this.cellIdx[n] * 65536 + Math.min(65535, dist[n]));
      packed.sort((a, b) => a - b);
      const keys = new Int32Array(packed.length), dd = new Uint16Array(packed.length);
      for (let i = 0; i < packed.length; i++) { keys[i] = Math.floor(packed[i] / 65536); dd[i] = packed[i] % 65536; }
      this.snaps.set(tileKey, { keys, dist: dd });
      if (snapshot) return [];
    }
    const snap = baseline ? undefined : this.snaps.get(tileKey);
    const growMin = this.growMin;
    this.lastGrowth.length = 0;
    // ---- push loads from the farthest cells towards the anchors
    // Besides the force through each link, horizontal transfer accumulates a bending moment
    // (load x lever arm in cells) that the member has to resist; its capacity grows with the
    // member's depth, so deep trusses and slabs span far while slender beams and rails do not.
    const load = this.load, moment = this.moment, gw = this.gw, prev = this.prev;
    prev.fill(-1, 0, nn);
    if (snap) for (let i = 0; i < snap.keys.length; i++) { const n = idx[snap.keys[i]]; if (n >= 0) prev[n] = snap.dist[i]; }
    for (let n = 0; n < nn; n++) {
      load[n] = this.mass[n]; moment[n] = 0;
      gw[n] = prev[n] >= 0 && dist[n] < INF ? Math.max(0, dist[n] - prev[n]) * this.mass[n] : 0;
    }
    const fails: StressFailure[] = [];
    const icx0 = cx - CORE, icx1 = cx + CORE, icz0 = cz - CORE, icz1 = cz + CORE;
    const fail = (n: number, d: number, ratio: number, bend: boolean) => {
      const px = this.cellPos[n * 3], pz = this.cellPos[n * 3 + 2];
      if (px < icx0 || px > icx1 || pz < icz0 || pz > icz1) return;
      if (snap) {
        // how much longer the load through this link has to travel than before the damage
        // (load-weighted, so a link overloaded by cargo from cells that lost their support qualifies)
        const own = prev[n] < 0 ? 0 : dist[n] - prev[n];
        const growth = Math.max(own, gw[n] / Math.max(load[n], 1e-6));
        this.lastGrowth.push(growth);
        if (growth < growMin) return;
      }
      fails.push({ x: px, y: this.cellPos[n * 3 + 1], z: pz, dir: d, ratio, bend });
    };
    for (let dcur = buckets.length - 1; dcur > 0; dcur--) {
      const bk = buckets[dcur];
      if (!bk) continue;
      for (const n of bk) {
        if ((++tick & 255) === 0 && performance.now() > this.deadline) yield;
        if (dist[n] !== dcur) continue;
        if (edge[n] && dcur === EDGE_COST) continue; // carried by the structure outside the domain
        let wsum = 0;
        for (let d = 0; d < 6; d++) {
          const m = this.nb[n * 6 + d];
          if (m < 0 || dist[m] >= dcur) continue;
          wsum += this.capL[n * 6 + d] * PREF[d];
        }
        if (wsum <= 0) continue;
        const L = load[n], M = moment[n];
        for (let d = 0; d < 6; d++) {
          const m = this.nb[n * 6 + d];
          if (m < 0 || dist[m] >= dcur) continue;
          const c0 = this.capL[n * 6 + d];
          const share = (c0 * PREF[d]) / wsum;
          const f = L * share;
          load[m] += f;
          gw[m] += gw[n] * share;
          if (f > c0) {
            const key = this.linkKey(n, d);
            const rf = this.reinforce.get(key) ?? 1;
            const c = c0 * rf;
            if (f > c) {
              if (baseline) this.reinforce.set(key, (f / c0) * 1.35);
              else fail(n, d, f / c, false);
            }
          }
          if (d === 3) continue; // carried down into a support: the moment ends here
          const mc = M * share + (d === 2 ? 0 : f);
          moment[m] += mc;
          if (d === 2 || mc <= 0) continue;
          // bending capacity of the member at this link (at least that of a single cell)
          if (mc <= c0 * BEND) continue;
          const cap = c0 * this.memberDepth(n, d, idx, cellOf, x1, z1) * BEND;
          if (mc > cap) {
            const key = this.linkKey(n, d);
            const rf = this.reinforceM.get(key) ?? 1;
            if (mc > cap * rf) {
              if (baseline) this.reinforceM.set(key, (mc / cap) * 1.35);
              else fail(n, d, mc / (cap * rf), true);
            }
          }
        }
      }
    }
    this.stats.analyses++;
    this.stats.nodes = nn;
    // the most overloaded links break first (cracks start where loads converge, so structures come
    // apart in large pieces); the load then redistributes and the next pass continues the crack.
    // Force and bending overloads scale differently, so each kind is ranked against its own worst case.
    const out: StressFailure[] = [];
    const seen = new Set<number>();
    const lists = [fails.filter((f) => !f.bend), fails.filter((f) => f.bend)];
    for (const l of lists) l.sort((a, b) => b.ratio - a.ratio);
    const cut = lists.map((l) => (l.length ? Math.max(1, l[0].ratio * 0.45) : 1));
    const pos = [0, 0];
    while (out.length < 48) {
      let progressed = false;
      for (let k = 0; k < 2 && out.length < 48; k++) {
        const l = lists[k];
        while (pos[k] < l.length) {
          const f = l[pos[k]++];
          if (f.ratio < cut[k]) { pos[k] = l.length; break; }
          const key = (f.x >> 2) + 1000 * ((f.z >> 2) + 1000 * (f.y >> 2));
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(f);
          progressed = true;
          break;
        }
      }
      if (!progressed) break;
    }
    this.stats.failures += out.length;
    return out;
  }
}

