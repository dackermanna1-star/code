// GPU meshes + transforms for dynamic bodies.
// Ordinary bodies are meshed in one piece on the main thread. Big ones (a building cut loose) are meshed
// in 32^3 blocks on the mesh worker pool: damage then only remeshes the blocks it touched, and each block
// keeps drawing its old mesh until the new one arrives.
import { Body, BodyBlock } from '../physics/body';
import { meshVolume, padGrid, QuadBuffer } from '../world/mesher';
import { PAL_TRANSPARENT } from '../world/materials';
import { Renderer, BodyDraw } from '../render/renderer';
import { QuadPool } from '../render/quadpool';
import type { RegionMeshes } from '../world/meshmanager';
import { Vec3, Quat } from '../engine/math';

const op = new QuadBuffer(4096), tr = new QuadBuffer(256);
let padBuf = new Uint8Array(0);
let combine = new Uint32Array(0);
const rowsCur = new Float32Array(12), rowsPrev = new Float32Array(12);
const ip = new Vec3(), iq = new Quat();

const BLOCK = 32;
/** grid volume above which a body is meshed in blocks on the workers (a full main-thread mesh takes ~10 ms there) */
const BLOCK_MODE_VOLUME = 64 * 64 * 64;
/** frames the world keeps drawing a detached big piece at most, if its body mesh is late */
const WORLD_HOLD_FRAMES = 45;

export function bodyUsesBlocks(b: Body): boolean { return b.sx * b.sy * b.sz > BLOCK_MODE_VOLUME; }

export class BodyMeshes {
  draws: BodyDraw[] = [];
  private drawPool: BodyDraw[] = [];

  constructor(readonly renderer: Renderer, private readonly regions: RegionMeshes | null = null) {}

  /** (Re)build the mesh of a body. */
  build(b: Body): void {
    const r = this.renderer;
    if (b.slot < 0) {
      b.slot = r.allocSlot();
      if (b.slot < 0) return;
    }
    if (bodyUsesBlocks(b)) { this.buildBlocks(b); return; }
    if (b.blocks) this.freeBlocks(b);
    const need = (b.sx + 2) * (b.sy + 2) * (b.sz + 2);
    if (padBuf.length < need) padBuf = new Uint8Array(need * 2);
    const pad = padGrid(b.vox, b.sx, b.sy, b.sz, padBuf);
    op.reset(); tr.reset();
    meshVolume(pad, b.sx, b.sy, b.sz, PAL_TRANSPARENT, 0, 0, 0, b.slot, op, tr);
    const total = op.count + tr.count;
    if (b.meshStart >= 0 && (QuadPool.roundSize(total) > QuadPool.roundSize(b.meshAlloc) || total === 0)) {
      r.pool.free(b.meshStart, b.meshAlloc);
      b.meshStart = -1; b.meshAlloc = 0;
    }
    if (total > 0) {
      if (b.meshStart < 0) { b.meshStart = r.pool.alloc(total); b.meshAlloc = total; }
      if (combine.length < total * 4) combine = new Uint32Array(total * 8);
      combine.set(op.data.subarray(0, op.count * 4), 0);
      combine.set(tr.data.subarray(0, tr.count * 4), op.count * 4);
      r.pool.upload(b.meshStart, combine, total);
    }
    b.nOp = op.count; b.nTr = tr.count;
    b.meshDirty = false; b.meshBox = null;
    this.releaseWorld(b);
  }

  /** Queue the blocks of a big body that changed (all of them on the first build or after a re-trim). */
  private buildBlocks(b: Body): void {
    const nbx = Math.ceil(b.sx / BLOCK), nby = Math.ceil(b.sy / BLOCK), nbz = Math.ceil(b.sz / BLOCK);
    let box = b.meshBox;
    if (!b.blocks || b.blockDims[0] !== nbx || b.blockDims[1] !== nby || b.blockDims[2] !== nbz) {
      this.freeBlocks(b);
      if (b.meshStart >= 0) { this.renderer.pool.free(b.meshStart, b.meshAlloc); b.meshStart = -1; b.meshAlloc = 0; }
      b.nOp = 0; b.nTr = 0;
      b.blocks = [];
      for (let i = 0; i < nbx * nby * nbz; i++) b.blocks.push({ start: -1, alloc: 0, nOp: 0, nTr: 0, seq: 0, ready: false });
      b.blockDims = [nbx, nby, nbz];
      box = null;
    }
    // a voxel on a block border also changes the neighbouring block's faces and ambient occlusion
    const bx0 = box ? Math.max(0, Math.floor((box[0] - 1) / BLOCK)) : 0, bx1 = box ? Math.min(nbx - 1, Math.floor((box[3] + 1) / BLOCK)) : nbx - 1;
    const by0 = box ? Math.max(0, Math.floor((box[1] - 1) / BLOCK)) : 0, by1 = box ? Math.min(nby - 1, Math.floor((box[4] + 1) / BLOCK)) : nby - 1;
    const bz0 = box ? Math.max(0, Math.floor((box[2] - 1) / BLOCK)) : 0, bz1 = box ? Math.min(nbz - 1, Math.floor((box[5] + 1) / BLOCK)) : nbz - 1;
    for (let by = by0; by <= by1; by++) for (let bz = bz0; bz <= bz1; bz++) for (let bx = bx0; bx <= bx1; bx++) {
      this.dispatchBlock(b, bx + nbx * (bz + nbz * by), bx * BLOCK, by * BLOCK, bz * BLOCK);
    }
    b.meshDirty = false; b.meshBox = null;
  }

  private dispatchBlock(b: Body, i: number, x0: number, y0: number, z0: number): void {
    const blocks = b.blocks!;
    const seq = ++blocks[i].seq;
    const nx = Math.min(BLOCK, b.sx - x0), ny = Math.min(BLOCK, b.sy - y0), nz = Math.min(BLOCK, b.sz - z0);
    const pad = gatherPadded(b, x0, y0, z0, nx, ny, nz);
    const done = (o: Uint32Array, t: Uint32Array) => this.applyBlock(b, blocks, i, seq, o, t);
    if (this.regions && this.regions.meshPadded(pad, nx, ny, nz, x0, y0, z0, b.slot, done)) return;
    op.reset(); tr.reset();
    meshVolume(pad, nx, ny, nz, PAL_TRANSPARENT, x0, y0, z0, b.slot, op, tr);
    done(op.data.slice(0, op.count * 4), tr.data.slice(0, tr.count * 4));
  }

  private applyBlock(b: Body, blocks: BodyBlock[], i: number, seq: number, o: Uint32Array, t: Uint32Array): void {
    if (b.removed || b.blocks !== blocks) return;
    const blk = blocks[i];
    if (seq !== blk.seq) return; // a newer job for this block is on its way
    const pool = this.renderer.pool;
    const nOp = o.length >> 2, nTr = t.length >> 2, total = nOp + nTr;
    if (blk.start >= 0 && (QuadPool.roundSize(total) > QuadPool.roundSize(blk.alloc) || total === 0)) {
      pool.free(blk.start, blk.alloc);
      blk.start = -1; blk.alloc = 0;
    }
    if (total > 0) {
      if (blk.start < 0) { blk.start = pool.alloc(total); blk.alloc = total; }
      if (combine.length < total * 4) combine = new Uint32Array(total * 8);
      combine.set(o, 0);
      combine.set(t, nOp * 4);
      pool.upload(blk.start, combine, total);
    }
    blk.nOp = nOp; blk.nTr = nTr; blk.ready = true;
    if (b.worldDirtyBox && blocks.every((k) => k.ready)) this.releaseWorld(b);
  }

  private freeBlocks(b: Body): void {
    if (!b.blocks) return;
    for (const blk of b.blocks) if (blk.start >= 0) this.renderer.pool.free(blk.start, blk.alloc);
    b.blocks = null;
  }

  /** The body's own mesh is ready (or it is gone): the world stops drawing the voxels it was cut from. */
  private releaseWorld(b: Body): void {
    const w = b.worldDirtyBox;
    if (!w) return;
    b.worldDirtyBox = null;
    this.regions?.world.markBoxDirty(w[0], w[1], w[2], w[3], w[4], w[5]);
  }

  release(b: Body): void {
    const r = this.renderer;
    if (b.meshStart >= 0) { r.pool.free(b.meshStart, b.meshAlloc); b.meshStart = -1; b.meshAlloc = 0; }
    this.freeBlocks(b);
    this.releaseWorld(b);
    if (b.slot >= 0) { r.freeSlot(b.slot); b.slot = -1; }
  }

  /** Update transforms (interpolated with alpha between previous and current physics state) and the draw list. */
  update(bodies: Body[], alpha: number, viewModel: Body | null = null): void {
    const r = this.renderer;
    for (const d of this.draws) this.drawPool.push(d);
    this.draws.length = 0;
    const n = bodies.length + (viewModel ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const b = i < bodies.length ? bodies[i] : viewModel!;
      if (b.meshDirty) this.build(b);
      if (b.worldDirtyBox && ((b as any)._worldHold = ((b as any)._worldHold || 0) + 1) > WORLD_HOLD_FRAMES) this.releaseWorld(b);
      if (b.slot < 0 || (!b.blocks && b.nOp + b.nTr === 0)) continue;
      // previous rendered transform is kept in the renderer's xform table (rows 3..5) via lastRows
      const lr = (b as any)._lastRows as Float32Array | undefined;
      if (b.sleeping && lr && (b as any)._xfSlot === b.slot && (b as any)._xfStill) {
        // at rest and already written with current = previous: the renderer's rows are up to date
        ip.copy(b.pos);
      } else {
        ip.copy(b.prevPos).lerp(b.pos, alpha);
        iq.copy(b.prevRot).slerp(b.rot, alpha);
        b.modelRows(rowsCur, ip, iq);
        let still = !!lr;
        if (lr) { for (let k = 0; k < 12 && still; k++) still = lr[k] === rowsCur[k]; rowsPrev.set(lr); } else rowsPrev.set(rowsCur);
        r.setXform(b.slot, rowsCur, rowsPrev);
        if (!lr) (b as any)._lastRows = new Float32Array(rowsCur);
        else lr.set(rowsCur);
        (b as any)._xfSlot = b.slot; (b as any)._xfStill = still;
      }
      if (b.blocks) {
        for (const blk of b.blocks) if (blk.nOp + blk.nTr > 0) this.pushDraw(b, blk.start, blk.nOp, blk.nTr, b === viewModel);
      } else this.pushDraw(b, b.meshStart, b.nOp, b.nTr, b === viewModel);
    }
  }

  private pushDraw(b: Body, start: number, nOp: number, nTr: number, vm: boolean): void {
    const d = this.drawPool.pop() ?? { slot: 0, start: 0, nOp: 0, nTr: 0, x: 0, y: 0, z: 0, r: 0 };
    d.slot = b.slot; d.start = start; d.nOp = nOp; d.nTr = nTr;
    d.x = ip.x; d.y = ip.y; d.z = ip.z; d.r = b.radius; d.vm = vm;
    this.draws.push(d);
  }
}

/** Copy a block of a body's grid with a 1-voxel border (empty outside the grid), as padGrid lays it out. */
function gatherPadded(b: Body, x0: number, y0: number, z0: number, nx: number, ny: number, nz: number): Uint8Array {
  const PX = nx + 2, PZ = nz + 2;
  const out = new Uint8Array(PX * (ny + 2) * PZ);
  const { sx, sy, sz, vox } = b;
  const xa = Math.max(-1, -x0), xb = Math.min(nx, sx - 1 - x0); // block-local x range inside the grid
  for (let y = -1; y <= ny; y++) {
    const gy = y0 + y;
    if (gy < 0 || gy >= sy) continue;
    for (let z = -1; z <= nz; z++) {
      const gz = z0 + z;
      if (gz < 0 || gz >= sz) continue;
      const si = x0 + xa + sx * (gz + sz * gy);
      out.set(vox.subarray(si, si + xb - xa + 1), xa + 1 + PX * (z + 1 + PZ * (y + 1)));
    }
  }
  return out;
}
