// Keeps GPU meshes of the static world's 32^3 render regions up to date.
// Dirty regions are gathered on the main thread, meshed in a worker pool, and uploaded into the QuadPool.

import workerSrc from 'worker:../workers/mesh.worker.ts';
import { World, RS, RS_SHIFT, VOXEL } from './world';
import { meshVolume, QuadBuffer } from './mesher';
import { PAL_TRANSPARENT } from './materials';
import { QuadPool } from '../render/quadpool';

const P2 = RS + 2;
const PADN = P2 * P2 * P2;

interface Job { ri: number; seq: number; worker: number }

export class RegionMeshes {
  readonly start: Int32Array;
  readonly nOp: Int32Array;
  readonly nTr: Int32Array;
  readonly allocN: Int32Array;
  /** per region bounds in meters: minx,miny,minz,maxx,maxy,maxz */
  readonly bounds: Float32Array;
  /** regions that currently have geometry */
  readonly active: number[] = [];
  private activePos: Int32Array;
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
    this.bounds = new Float32Array(n * 6);
    this.activePos = new Int32Array(n).fill(-1);
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

  private getBuf(): Uint8Array { return this.bufPool.pop() ?? new Uint8Array(PADN); }

  /** Dispatch dirty regions to the workers (nearest first). */
  update(camX: number, camY: number, camZ: number, maxSync = 2): void {
    const w = this.world;
    const q = w.dirtyQueue;
    if (q.length === 0) return;
    const moved = Math.abs(camX - this.camX) + Math.abs(camY - this.camY) + Math.abs(camZ - this.camZ) > 8;
    if (q.length !== this.sortedLen || moved) {
      this.camX = camX; this.camY = camY; this.camZ = camZ;
      const nrx = w.nrx, nrz = w.nrz;
      const s = RS * VOXEL;
      const dist = (ri: number) => {
        const rx = ri % nrx, rest = (ri / nrx) | 0, rz = rest % nrz, ry = (rest / nrz) | 0;
        const dx = (rx + 0.5) * s - camX, dy = (ry + 0.5) * s - camY, dz = (rz + 0.5) * s - camZ;
        return dx * dx + dy * dy + dz * dz;
      };
      const keyed = q.map((ri) => ({ ri, d: dist(ri) }));
      keyed.sort((a, b) => b.d - a.d); // nearest last
      for (let i = 0; i < q.length; i++) q[i] = keyed[i].ri;
    }
    const deferred: number[] = [];
    let sync = 0;
    while (q.length > 0) {
      const useWorker = this.workers.length > 0;
      let wi = -1;
      if (useWorker) {
        let best = RegionMeshes.MAX_INFLIGHT;
        for (let i = 0; i < this.load.length; i++) if (this.load[i] < best) { best = this.load[i]; wi = i; }
        if (wi < 0) break;
      }
      if (!useWorker && sync >= maxSync) break;
      const ri = q.pop()!;
      if (this.inflight[ri]) { deferred.push(ri); continue; }
      w.regionDirty[ri] = 0;
      const rx = ri % w.nrx, rest = (ri / w.nrx) | 0, rz = rest % w.nrz, ry = (rest / w.nrz) | 0;
      const buf = this.getBuf();
      const cls = w.gatherRegion(rx, ry, rz, buf);
      const seq = ++this.seq[ri];
      if (cls !== 1) {
        this.bufPool.push(buf);
        this.apply(ri, seq, null, null);
        continue;
      }
      if (useWorker) {
        const id = this.nextJob++;
        this.jobs.set(id, { ri, seq, worker: wi });
        this.inflight[ri] = 1;
        this.load[wi]++;
        this.workers[wi].postMessage({ type: 'mesh', id, vox: buf, sx: RS, sy: RS, sz: RS, ox: rx << RS_SHIFT, oy: ry << RS_SHIFT, oz: rz << RS_SHIFT, slot: 0 }, [buf.buffer]);
      } else {
        this.opBuf.reset(); this.trBuf.reset();
        meshVolume(buf, RS, RS, RS, PAL_TRANSPARENT, rx << RS_SHIFT, ry << RS_SHIFT, rz << RS_SHIFT, 0, this.opBuf, this.trBuf);
        this.bufPool.push(buf);
        this.apply(ri, seq, this.opBuf.data.subarray(0, this.opBuf.count * 4), this.trBuf.data.subarray(0, this.trBuf.count * 4));
        sync++;
      }
    }
    for (const ri of deferred) q.push(ri);
    this.sortedLen = q.length;
  }

  private onResult(wi: number, msg: { id: number; opaque: Uint32Array; trans: Uint32Array; vox: Uint8Array }): void {
    const job = this.jobs.get(msg.id);
    this.load[wi]--;
    if (msg.vox && msg.vox.length === PADN) this.bufPool.push(msg.vox);
    if (!job) return;
    this.jobs.delete(msg.id);
    this.inflight[job.ri] = 0;
    this.apply(job.ri, job.seq, msg.opaque, msg.trans);
  }

  private apply(ri: number, seq: number, opaque: Uint32Array | null, trans: Uint32Array | null): void {
    if (seq < this.applied[ri]) return;
    this.applied[ri] = seq;
    const nOp = opaque ? opaque.length >> 2 : 0, nTr = trans ? trans.length >> 2 : 0;
    const total = nOp + nTr;
    this.quadCount += total - this.nOp[ri] - this.nTr[ri];
    this.meshedCount++;
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
    computeBounds(c, total, this.bounds, ri * 6);
    this.setActive(ri, true);
  }

  private setActive(ri: number, on: boolean): void {
    const pos = this.activePos[ri];
    if (on) {
      if (pos < 0) { this.activePos[ri] = this.active.length; this.active.push(ri); }
    } else if (pos >= 0) {
      const last = this.active.pop()!;
      if (last !== ri) { this.active[pos] = last; this.activePos[last] = pos; }
      this.activePos[ri] = -1;
    }
  }
}

// U/V axes per face (index into xyz)
const FACE_U = [1, 2, 2, 0, 0, 1];
const FACE_V = [2, 1, 0, 2, 1, 0];

function computeBounds(q: Uint32Array, n: number, out: Float32Array, o: number): void {
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
  out[o] = x0 * VOXEL; out[o + 1] = y0 * VOXEL; out[o + 2] = z0 * VOXEL;
  out[o + 3] = x1 * VOXEL; out[o + 4] = y1 * VOXEL; out[o + 5] = z1 * VOXEL;
}
