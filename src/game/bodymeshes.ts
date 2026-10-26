// GPU meshes + transforms for dynamic bodies.
import { Body } from '../physics/body';
import { meshVolume, padGrid, QuadBuffer } from '../world/mesher';
import { PAL_TRANSPARENT } from '../world/materials';
import { Renderer, BodyDraw } from '../render/renderer';
import { QuadPool } from '../render/quadpool';
import { Vec3, Quat } from '../engine/math';

const op = new QuadBuffer(4096), tr = new QuadBuffer(256);
let padBuf = new Uint8Array(0);
let combine = new Uint32Array(0);
const rowsCur = new Float32Array(12), rowsPrev = new Float32Array(12);
const ip = new Vec3(), iq = new Quat();

export class BodyMeshes {
  draws: BodyDraw[] = [];
  private drawPool: BodyDraw[] = [];

  constructor(readonly renderer: Renderer) {}

  /** (Re)build the mesh of a body. */
  build(b: Body): void {
    const r = this.renderer;
    if (b.slot < 0) {
      b.slot = r.allocSlot();
      if (b.slot < 0) return;
    }
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
    b.meshDirty = false;
  }

  release(b: Body): void {
    const r = this.renderer;
    if (b.meshStart >= 0) { r.pool.free(b.meshStart, b.meshAlloc); b.meshStart = -1; b.meshAlloc = 0; }
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
      if (b.slot < 0 || b.nOp + b.nTr === 0) continue;
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
      const d = this.drawPool.pop() ?? { slot: 0, start: 0, nOp: 0, nTr: 0, x: 0, y: 0, z: 0, r: 0 };
      d.slot = b.slot; d.start = b.meshStart; d.nOp = b.nOp; d.nTr = b.nTr;
      d.x = ip.x; d.y = ip.y; d.z = ip.z; d.r = b.radius; d.vm = b === viewModel;
      this.draws.push(d);
    }
  }
}
