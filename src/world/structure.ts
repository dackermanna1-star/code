// Structural connectivity: after voxels are removed, find solid parts that are no longer connected to the
// ground (anchors = voxels below ANCHOR_Y, or outside the map) and detach them as dynamic bodies.
//
// Each seed starts a best-first flood fill that always expands the lowest voxel first, so for intact
// structures it races down the nearest wall/column and terminates quickly. Searches that exhaust their
// component without touching an anchor have found a floating piece.

import { World, ANCHOR_Y, CS_SHIFT } from './world';

const MAX_VISIT = 1_600_000;

export interface DetachedPiece {
  vox: Uint8Array;
  sx: number; sy: number; sz: number;
  /** world voxel coordinate of grid origin */
  ox: number; oy: number; oz: number;
  count: number;
}

export class Structure {
  private seeds: number[] = [];
  /** time budget per process() call (ms); remaining seeds continue next frame */
  budgetMs = 6;
  private passStart = 0;
  private passActive = false;
  private seedsAddedDuringPass = false;
  private queue: number[] = [];
  /** per-chunk search stamps */
  private stamps = new Map<number, Uint32Array>();
  private stampId = 1;
  private anchoredStamps = new Set<number>();
  private buckets: number[][] = [];
  private visitXZ: number[] = [];
  private visitY: number[] = [];
  stats = { searches: 0, visited: 0, detached: 0, ms: 0 };

  constructor(readonly world: World, readonly onDetach: (p: DetachedPiece) => void) {
    for (let y = 0; y < world.sy; y++) this.buckets.push([]);
  }

  private key(x: number, y: number, z: number): number { return x + this.world.sx * (z + this.world.sz * y); }

  /** Add the solid 6-neighbours of a removed voxel as seeds. */
  noteRemoved(x: number, y: number, z: number): void {
    const w = this.world;
    const s = this.seeds;
    if (w.get(x + 1, y, z)) s.push(this.key(x + 1, y, z));
    if (w.get(x - 1, y, z)) s.push(this.key(x - 1, y, z));
    if (y + 1 < w.sy && w.get(x, y + 1, z)) s.push(this.key(x, y + 1, z));
    if (y > 0 && w.get(x, y - 1, z)) s.push(this.key(x, y - 1, z));
    if (w.get(x, y, z + 1)) s.push(this.key(x, y, z + 1));
    if (w.get(x, y, z - 1)) s.push(this.key(x, y, z - 1));
    if (this.passActive) this.seedsAddedDuringPass = true;
  }

  addSeed(x: number, y: number, z: number): void {
    if (this.world.inBounds(x, y, z) && this.world.get(x, y, z)) { this.seeds.push(this.key(x, y, z)); if (this.passActive) this.seedsAddedDuringPass = true; }
  }

  get pending(): number { return this.seeds.length + this.queue.length; }

  private stampArr(ci: number): Uint32Array {
    let a = this.stamps.get(ci);
    if (!a) { a = new Uint32Array(4096); this.stamps.set(ci, a); }
    return a;
  }

  /** Process queued seeds (time-sliced; leftovers continue on the next call). */
  process(): void {
    if (this.seeds.length === 0 && this.queue.length === 0) return;
    const t0 = performance.now();
    const w = this.world;
    const sx = w.sx, sz = w.sz;
    // new removals invalidate "anchored" knowledge: start a fresh pass including the unfinished queue
    if (!this.passActive || this.seedsAddedDuringPass) {
      if (this.stampId > 4_000_000_000 || this.stamps.size > 6000) { this.stamps.clear(); this.stampId = 1; }
      this.anchoredStamps.clear();
      this.passStart = this.stampId + 1;
      const all = this.queue.concat(this.seeds);
      this.seeds.length = 0;
      // lowest seeds first (pop() takes from the end): bucket by height, highest first
      const sxz = sx * sz;
      const byY: number[][] = [];
      for (const k of all) { const y = Math.floor(k / sxz); (byY[y] || (byY[y] = [])).push(k); }
      const sorted: number[] = [];
      for (let y = byY.length - 1; y >= 0; y--) { const b = byY[y]; if (b) for (const k of b) sorted.push(k); }
      this.queue = sorted;
      this.passActive = true;
      this.seedsAddedDuringPass = false;
    }
    const q = this.queue;
    const passStart = this.passStart;
    while (q.length) {
      const k = q.pop()!;
      const x = k % sx, rest = (k - x) / sx, z = rest % sz, y = (rest - z) / sz;
      if (!w.get(x, y, z)) continue;
      const ci = (x >> CS_SHIFT) + w.ncx * ((z >> CS_SHIFT) + w.ncz * (y >> CS_SHIFT));
      const li = (x & 15) | ((z & 15) << 4) | ((y & 15) << 8);
      const st = this.stampArr(ci)[li];
      if (st >= passStart) continue; // already classified in this pass
      this.search(x, y, z, passStart);
      if (this.seedsAddedDuringPass) break; // a detach removed voxels: restart with fresh knowledge
      if (performance.now() - t0 > this.budgetMs) break;
    }
    if (q.length === 0 && !this.seedsAddedDuringPass) this.passActive = false;
    this.stats.ms = performance.now() - t0;
  }

  private search(x0: number, y0: number, z0: number, passStart: number): void {
    const w = this.world;
    const sx = w.sx, sy = w.sy, sz = w.sz, ncx = w.ncx, ncz = w.ncz;
    const id = ++this.stampId;
    this.stats.searches++;
    const buckets = this.buckets;
    const vxz = this.visitXZ, vy = this.visitY;
    vxz.length = 0; vy.length = 0;
    let lowest = y0, highest = y0;
    let lastCi = -1;
    let lastArr: Uint32Array = this.stampArr((x0 >> 4) + ncx * ((z0 >> 4) + ncz * (y0 >> 4)));
    lastArr[(x0 & 15) | ((z0 & 15) << 4) | ((y0 & 15) << 8)] = id;
    lastCi = (x0 >> 4) + ncx * ((z0 >> 4) + ncz * (y0 >> 4));
    buckets[y0].push(x0 + sx * z0);
    vxz.push(x0 + sx * z0); vy.push(y0);
    let anchored = false;
    let count = 1;
    let minX = x0, maxX = x0, minY = y0, maxY = y0, minZ = z0, maxZ = z0;
    outer: while (true) {
      while (lowest <= highest && buckets[lowest].length === 0) lowest++;
      if (lowest > highest) break;
      const y = lowest;
      const xz = buckets[y].pop()!;
      const x = xz % sx, z = (xz - x) / sx;
      if (y < ANCHOR_Y) { anchored = true; break; }
      for (let n = 0; n < 6; n++) {
        let nx = x, ny = y, nz = z;
        if (n === 0) nx++; else if (n === 1) nx--; else if (n === 2) ny--; else if (n === 3) ny++; else if (n === 4) nz++; else nz--;
        if (nx < 0 || nz < 0 || nx >= sx || nz >= sz) {
          // outside the map the terrain continues: treat as anchored if solid
          if (ny >= 0 && w.get(nx, ny, nz)) { anchored = true; break outer; }
          continue;
        }
        if (ny < 0) { anchored = true; break outer; }
        if (ny >= sy) continue;
        if (!w.get(nx, ny, nz)) continue;
        const ci = (nx >> 4) + ncx * ((nz >> 4) + ncz * (ny >> 4));
        if (ci !== lastCi) { lastCi = ci; lastArr = this.stampArr(ci); }
        const li = (nx & 15) | ((nz & 15) << 4) | ((ny & 15) << 8);
        const prev = lastArr[li];
        if (prev === id) continue;
        lastArr[li] = id;
        if (prev >= passStart && this.anchoredStamps.has(prev)) { anchored = true; break outer; }
        buckets[ny].push(nx + sx * nz);
        if (ny < lowest) lowest = ny;
        if (ny > highest) highest = ny;
        vxz.push(nx + sx * nz); vy.push(ny);
        if (nx < minX) minX = nx; if (nx > maxX) maxX = nx;
        if (ny < minY) minY = ny; if (ny > maxY) maxY = ny;
        if (nz < minZ) minZ = nz; if (nz > maxZ) maxZ = nz;
        if (++count > MAX_VISIT) { anchored = true; break outer; }
      }
    }
    // clear the buckets that were used
    for (let y = Math.min(lowest, minY); y <= highest; y++) if (buckets[y].length) buckets[y].length = 0;
    this.stats.visited += count;
    if (anchored) { this.anchoredStamps.add(id); return; }
    // ---- detached component: extract into a grid and remove from the world
    const gx = maxX - minX + 1, gy = maxY - minY + 1, gz = maxZ - minZ + 1;
    const vox = new Uint8Array(gx * gy * gz);
    for (let i = 0; i < vxz.length; i++) {
      const xz = vxz[i], y = vy[i];
      const x = xz % sx, z = (xz - x) / sx;
      vox[(x - minX) + gx * ((z - minZ) + gz * (y - minY))] = w.get(x, y, z);
    }
    for (let i = 0; i < vxz.length; i++) {
      const xz = vxz[i], y = vy[i];
      const x = xz % sx, z = (xz - x) / sx;
      w.set(x, y, z, 0);
    }
    this.stats.detached++;
    this.onDetach({ vox, sx: gx, sy: gy, sz: gz, ox: minX, oy: minY, oz: minZ, count: vxz.length });
  }
}
