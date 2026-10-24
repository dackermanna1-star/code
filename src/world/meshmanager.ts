// Keeps GPU meshes of the static world's 32^3 render regions up to date.
// Dirty regions are gathered on the main thread, meshed in a worker pool, and uploaded into the QuadPool.
// Distant regions are meshed from downsampled voxels (level of detail): 2x2x2 cells beyond lodDist[0],
// 4x4x4 cells beyond lodDist[1], where a single voxel already covers less than a pixel.

import workerSrc from 'worker:../workers/mesh.worker.ts';
import { World, RS, RS_SHIFT, VOXEL } from './world';
import { meshVolume, downsample, QuadBuffer } from './mesher';
import { PAL_TRANSPARENT } from './materials';
import { QuadPool } from '../render/quadpool';

const MAX_LOD = 2;
const PADN = (RS + 2 * (1 << MAX_LOD)) ** 3;
const NONE = 255;

interface Job { ri: number; seq: number; worker: number }

export class RegionMeshes {
  readonly start: Int32Array;
  readonly nOp: Int32Array;
  readonly nTr: Int32Array;
  readonly allocN: Int32Array;
  /** level of detail of each region's current mesh */
  readonly lod: Uint8Array;
  /** per region bounds in meters: minx,miny,minz,maxx,maxy,maxz */
  readonly bounds: Float32Array;
  /** regions that currently have geometry */
  readonly active: number[] = [];
  /** LOD switch distances in meters (0 disables LOD) */
  lodDist = [60, 130];
  private activePos: Int32Array;
  /** regions with visible content at their last gather (candidates for LOD changes) */
  private meshable: number[] = [];
  private meshablePos: Int32Array;
  /** LOD a queued LOD job will produce (NONE = not queued) */
  private want: Uint8Array;
  private lodQueue: number[] = [];
  private lodCamX = 1e9; private lodCamY = 1e9; private lodCamZ = 1e9;
  private inflight: Uint8Array;
  private seq: Uint32Array;
  private applied: Uint32Array;
  private workers: Worker[] = [];
  private load: number[] = [];
  private static readonly MAX_INFLIGHT = 6;
  private jobs = new Map<number, Job>();
  private nextJob = 1;
  private bufPool: Uint8Array[] = [];
  private sortedLen = -1;
  private opBuf = new QuadBuffer(8192);
  private trBuf = new QuadBuffer(1024);
  private lodBuf = new Uint8Array(18 * 18 * 18);
  private combine = new Uint32Array(4096 * 4);
  /** stats */
  meshedCount = 0;
  quadCount = 0;
  private camX = 0; private camY = 0; private camZ = 0;

  constructor(readonly world: World, readonly pool: QuadPool, workerCount: number) {
    const n = world.nregions;
    this.start = new Int32Array(n).fill(-1);
    this.nOp = new Int32Array(n);
    this.nTr = new Int32Array(n);
    this.allocN = new Int32Array(n);
    this.lod = new Uint8Array(n);
    this.bounds = new Float32Array(n * 6);
    this.activePos = new Int32Array(n).fill(-1);
    this.meshablePos = new Int32Array(n).fill(-1);
    this.want = new Uint8Array(n).fill(NONE);
    this.inflight = new Uint8Array(n);
    this.seq = new Uint32Array(n);
    this.applied = new Uint32Array(n);
    try {
      const url = URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' }));
      for (let i = 0; i < workerCount; i++) {
        const w = new Worker(url);
        w.postMessage({ type: 'init', transparent: PAL_TRANSPARENT });
        const wi = i;
        w.onmessage = (e) => this.onResult(wi, e.data);
        w.onerror = (e) => { console.error('mesh worker error', e.message); };
        this.workers.push(w);
        this.load.push(0);
      }
    } catch (e) {
      console.warn('Mesh workers unavailable, meshing on main thread', e);
    }
  }

  get pending(): number { return this.world.dirtyQueue.length + this.jobs.size; }
  /** queued level-of-detail changes */
  get pendingLod(): number { return this.lodQueue.length; }

  private getBuf(): Uint8Array { return this.bufPool.pop() ?? new Uint8Array(PADN); }

  private regionDistSq(ri: number, camX: number, camY: number, camZ: number): number {
    const w = this.world;
    const rx = ri % w.nrx, rest = (ri / w.nrx) | 0, rz = rest % w.nrz, ry = (rest / w.nrz) | 0;
    const s = RS * VOXEL;
    const dx = (rx + 0.5) * s - camX, dy = (ry + 0.5) * s - camY, dz = (rz + 0.5) * s - camZ;
    return dx * dx + dy * dy + dz * dz;
  }

  /** LOD for a region at squared distance d2, keeping cur unless it is clearly outside its band (hysteresis). */
  private lodFor(d2: number, cur: number): number {
    const D = this.lodDist;
    if (!(D[0] > 0)) return 0;
    const d = Math.sqrt(d2), h = 4;
    const fine = d < D[0] + h ? 0 : d < D[1] + h ? 1 : 2;   // finest level allowed at this distance
    const coarse = d < D[0] - h ? 0 : d < D[1] - h ? 1 : 2; // coarsest level allowed
    if (cur === NONE) return d < D[0] ? 0 : d < D[1] ? 1 : 2;
    return Math.min(Math.max(cur, fine), coarse);
  }

  /** Force every region to be re-evaluated for LOD (after changing lodDist). */
  refreshLod(): void { this.lodCamX = 1e9; }

  private scanLod(camX: number, camY: number, camZ: number): void {
    this.lodCamX = camX; this.lodCamY = camY; this.lodCamZ = camZ;
    const q = this.lodQueue;
    for (const ri of this.meshable) {
      if (this.world.regionDirty[ri]) continue; // will be meshed at the right LOD anyway
      const cur = this.want[ri] !== NONE ? this.want[ri] : this.lod[ri];
      const l = this.lodFor(this.regionDistSq(ri, camX, camY, camZ), cur);
      if (l === cur) continue;
      if (this.want[ri] === NONE) q.push(ri);
      this.want[ri] = l;
    }
    // nearest last (popped first)
    const keyed = q.map((ri) => ({ ri, d: this.regionDistSq(ri, camX, camY, camZ) }));
    keyed.sort((a, b) => b.d - a.d);
    for (let i = 0; i < q.length; i++) q[i] = keyed[i].ri;
  }

  /** Dispatch dirty regions to the workers (nearest first), then pending LOD changes. */
  update(camX: number, camY: number, camZ: number, maxSync = 2): void {
    const w = this.world;
    const dq = w.dirtyQueue;
    if (Math.abs(camX - this.lodCamX) + Math.abs(camY - this.lodCamY) + Math.abs(camZ - this.lodCamZ) > 3) this.scanLod(camX, camY, camZ);
    if (dq.length === 0 && this.lodQueue.length === 0) return;
    const moved = Math.abs(camX - this.camX) + Math.abs(camY - this.camY) + Math.abs(camZ - this.camZ) > 8;
    if (dq.length > 0 && (dq.length !== this.sortedLen || moved)) {
      this.camX = camX; this.camY = camY; this.camZ = camZ;
      const keyed = dq.map((ri) => ({ ri, d: this.regionDistSq(ri, camX, camY, camZ) }));
      keyed.sort((a, b) => b.d - a.d); // nearest last
      for (let i = 0; i < dq.length; i++) dq[i] = keyed[i].ri;
    }
    const deferred: number[] = [];
    let sync = 0;
    const useWorker = this.workers.length > 0;
    for (;;) {
      let wi = -1;
      if (useWorker) {
        let best = RegionMeshes.MAX_INFLIGHT;
        for (let i = 0; i < this.load.length; i++) if (this.load[i] < best) { best = this.load[i]; wi = i; }
        if (wi < 0) break;
      } else if (sync >= maxSync) break;
      let ri: number, lod: number;
      if (dq.length > 0) {
        ri = dq.pop()!;
        if (this.inflight[ri]) { deferred.push(ri); continue; }
        w.regionDirty[ri] = 0;
        const cur = this.want[ri] !== NONE ? this.want[ri] : (this.meshablePos[ri] >= 0 ? this.lod[ri] : NONE);
        lod = this.lodFor(this.regionDistSq(ri, camX, camY, camZ), cur);
        if (this.want[ri] !== NONE) this.want[ri] = lod; // the queued LOD job becomes a no-op
      } else if (this.lodQueue.length > 0) {
        ri = this.lodQueue[this.lodQueue.length - 1];
        if (this.inflight[ri]) break; // wait for the running job of this region
        this.lodQueue.pop();
        lod = this.want[ri];
        this.want[ri] = NONE;
        if (lod === NONE || this.meshablePos[ri] < 0 || lod === this.lod[ri] || w.regionDirty[ri]) continue;
      } else break;
      const rx = ri % w.nrx, rest = (ri / w.nrx) | 0, rz = rest % w.nrz, ry = (rest / w.nrz) | 0;
      const f = 1 << lod, n = RS >> lod;
      const buf = this.getBuf();
      const cls = w.gatherRegion(rx, ry, rz, buf, f);
      const seq = ++this.seq[ri];
      if (cls !== 1) {
        this.bufPool.push(buf);
        this.setMeshable(ri, false);
        this.apply(ri, seq, null, null, 0);
        continue;
      }
      this.setMeshable(ri, true);
      const ox = (rx << RS_SHIFT) >> lod, oy = (ry << RS_SHIFT) >> lod, oz = (rz << RS_SHIFT) >> lod;
      if (useWorker) {
        const id = this.nextJob++;
        this.jobs.set(id, { ri, seq, worker: wi });
        this.inflight[ri] = 1 + lod;
        this.load[wi]++;
        this.workers[wi].postMessage({ type: 'mesh', id, vox: buf, sx: n, sy: n, sz: n, ox, oy, oz, slot: 0, lod }, [buf.buffer]);
      } else {
        this.opBuf.reset(); this.trBuf.reset();
        let src = buf;
        if (lod > 0) { downsample(buf, n, f, PAL_TRANSPARENT, this.lodBuf); src = this.lodBuf; }
        meshVolume(src, n, n, n, PAL_TRANSPARENT, ox, oy, oz, 0, this.opBuf, this.trBuf, lod);
        this.bufPool.push(buf);
        this.apply(ri, seq, this.opBuf.data.subarray(0, this.opBuf.count * 4), this.trBuf.data.subarray(0, this.trBuf.count * 4), lod);
        sync++;
      }
    }
    for (const ri of deferred) dq.push(ri);
    this.sortedLen = dq.length;
  }

  private onResult(wi: number, msg: { id: number; opaque: Uint32Array; trans: Uint32Array; vox: Uint8Array }): void {
    const job = this.jobs.get(msg.id);
    this.load[wi]--;
    if (msg.vox && msg.vox.length === PADN) this.bufPool.push(msg.vox);
    if (!job) return;
    this.jobs.delete(msg.id);
    const lod = this.inflight[job.ri] - 1;
    this.inflight[job.ri] = 0;
    this.apply(job.ri, job.seq, msg.opaque, msg.trans, lod);
  }

  private apply(ri: number, seq: number, opaque: Uint32Array | null, trans: Uint32Array | null, lod: number): void {
    if (seq < this.applied[ri]) return;
    this.applied[ri] = seq;
    const nOp = opaque ? opaque.length >> 2 : 0, nTr = trans ? trans.length >> 2 : 0;
    const total = nOp + nTr;
    this.quadCount += total - this.nOp[ri] - this.nTr[ri];
    this.meshedCount++;
    this.lod[ri] = lod;
    if (total === 0) {
      if (this.start[ri] >= 0) { this.pool.free(this.start[ri], this.allocN[ri]); this.start[ri] = -1; this.allocN[ri] = 0; }
      this.nOp[ri] = 0; this.nTr[ri] = 0;
      this.setActive(ri, false);
      return;
    }
    // (re)allocate
    const cap = this.allocN[ri];
    if (this.start[ri] < 0 || QuadPool.roundSize(total) > QuadPool.roundSize(cap) || QuadPool.roundSize(cap) > QuadPool.roundSize(total) * 2 + 64) {
      if (this.start[ri] >= 0) this.pool.free(this.start[ri], cap);
      this.start[ri] = this.pool.alloc(total);
      this.allocN[ri] = total;
    }
    if (this.combine.length < total * 4) this.combine = new Uint32Array(Math.max(total * 4, this.combine.length * 2));
    const c = this.combine;
    if (opaque) c.set(opaque, 0);
    if (trans) c.set(trans, nOp * 4);
    this.pool.upload(this.start[ri], c, total);
    this.nOp[ri] = nOp; this.nTr[ri] = nTr;
    computeBounds(c, total, this.bounds, ri * 6, VOXEL * (1 << lod));
    this.setActive(ri, true);
  }

  private setActive(ri: number, on: boolean): void {
    listSet(this.active, this.activePos, ri, on);
  }

  private setMeshable(ri: number, on: boolean): void {
    listSet(this.meshable, this.meshablePos, ri, on);
  }
}

/** Add/remove an index from an unordered list with a position table. */
function listSet(list: number[], pos: Int32Array, i: number, on: boolean): void {
  const p = pos[i];
  if (on) {
    if (p < 0) { pos[i] = list.length; list.push(i); }
  } else if (p >= 0) {
    const last = list.pop()!;
    if (last !== i) { list[p] = last; pos[last] = p; }
    pos[i] = -1;
  }
}

// U/V axes per face (index into xyz)
const FACE_U = [1, 2, 2, 0, 0, 1];
const FACE_V = [2, 1, 0, 2, 1, 0];

function computeBounds(q: Uint32Array, n: number, out: Float32Array, o: number, unit: number): void {
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  const p = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const a = q[i * 4], b = q[i * 4 + 1], c = q[i * 4 + 2];
    p[0] = a & 0xffff; p[1] = a >>> 16; p[2] = b & 0xffff;
    const w = ((b >>> 16) & 0xff) + 1, h = (b >>> 24) + 1;
    const f = (c >>> 8) & 7;
    if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[2] < z0) z0 = p[2];
    p[FACE_U[f]] += w; p[FACE_V[f]] += h;
    if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; if (p[2] > z1) z1 = p[2];
  }
  out[o] = x0 * unit; out[o + 1] = y0 * unit; out[o + 2] = z0 * unit;
  out[o + 3] = x1 * unit; out[o + 4] = y1 * unit; out[o + 5] = z1 * unit;
}
