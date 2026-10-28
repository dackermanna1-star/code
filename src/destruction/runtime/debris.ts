// Debris lifecycle (docs/ARCHITECTURE.md §4.8):
//  * activity tracking — dynamic islands are checked round-robin (≈ every 0.5 s each) so the
//    cost stays O(K) per step even with thousands of pieces;
//  * consolidation — small islands (mass < 20 kg, extent < 0.6 m, no joints/features) that have
//    slept for settings.quality.consolidateAfter seconds lose their own meshes; their
//    world-space geometry is appended to a static batch per 2 m world cell (draw-call
//    consolidation). Bodies stay in Havok (asleep, Babylon sync disabled) so they still
//    collide and wake; any impact/strike or a wake detected by the round-robin restores them;
//  * fell-out removal — islands whose centre of mass drops below y = −30 m (thrown off the
//    balcony) are removed completely (`fellOut` event).

import { TransformNode, type PhysicsBody } from "@babylonjs/core";
import type { IslandMeshes } from "../../core/context.ts";
import type { RenderGeom } from "../../geom/meshgen.ts";
import type { Island } from "./types.ts";
import type { World } from "./world.ts";

export const CONSOLIDATE_MAX_MASS = 20;
export const CONSOLIDATE_MAX_EXTENT = 0.6;
export const FELL_OUT_Y = -30;
export const DEBRIS_CELL = 2.0;
/** Max vertices per consolidated batch mesh (bounded rebuild cost). */
const BATCH_MAX_VERTS = 30000;
/** Each tracked island is checked about every this many steps. */
const CHECK_PERIOD_STEPS = 30;

interface Batch {
  index: number;
  islands: Map<Island, RenderGeom[]>;
  verts: number;
  meshes: IslandMeshes | null;
  dirty: boolean;
  /** Contains removals (must rebuild this step to avoid ghost geometry). */
  urgent: boolean;
}

interface DebrisCell {
  key: string;
  node: TransformNode;
  batches: Batch[];
}

export interface DebrisDeps {
  /** Island hosts features that must keep their own meshes (screens, lights...). */
  hasFeatures(island: Island): boolean;
  /** Island is about to be removed for falling out of the world. */
  fellOut(island: Island): void;
}

interface SyncPlugin {
  sync?(body: PhysicsBody): void;
}

export class DebrisSystem {
  private readonly w: World;
  private readonly deps: DebrisDeps;
  private rr: Island[] = [];
  private rrPos = 0;
  readonly cells = new Map<string, DebrisCell>();
  private dirtyBatches = new Set<Batch>();
  private cellOf = new Map<Batch, DebrisCell>();
  consolidated = 0;
  /** Disable consolidation entirely (tests/debug). */
  enabled = true;

  constructor(w: World, deps: DebrisDeps) {
    this.w = w;
    this.deps = deps;
  }

  get tracked(): number {
    return this.rr.length;
  }

  // ------------------------------------------------------------------ tracking

  onIslandCreated(isl: Island): void {
    if (!isl.isStatic) this.track(isl);
  }

  onIslandDisposing(isl: Island): void {
    if (isl.consolidated) this.unconsolidate(isl, false);
    this.untrack(isl);
  }

  onIslandMotionChanged(isl: Island): void {
    if (isl.isStatic) this.untrack(isl);
    else this.track(isl);
  }

  private track(isl: Island): void {
    if (isl.rrIndex >= 0) return;
    isl.rrIndex = this.rr.length;
    this.rr.push(isl);
    isl.lastCheck = this.w.now;
    isl.sleepTime = 0;
  }

  private untrack(isl: Island): void {
    const i = isl.rrIndex;
    if (i < 0) return;
    const last = this.rr.pop()!;
    if (last !== isl) {
      this.rr[i] = last;
      last.rrIndex = i;
    }
    isl.rrIndex = -1;
  }

  /** Round-robin activity check: sleep time, consolidation, wake restore, fell-out. */
  fixedUpdate(): void {
    const n = this.rr.length;
    if (!n) return;
    const k = Math.min(n, Math.max(8, Math.ceil(n / CHECK_PERIOD_STEPS)));
    for (let i = 0; i < k && this.rr.length; i++) {
      if (this.rrPos >= this.rr.length) this.rrPos = 0;
      const isl = this.rr[this.rrPos++];
      this.check(isl);
    }
  }

  private check(isl: Island): void {
    const w = this.w;
    const now = w.now;
    const elapsed = Math.max(0, now - isl.lastCheck);
    isl.lastCheck = now;
    if (!isl.alive || !isl.body || isl.isStatic) return;
    const c = w.toWorldVec(isl, isl.com);
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.z)) {
      // a body whose state became non-finite can only poison the simulation: drop it
      w.warnOnce(`nan:${isl.asm.type}`, `${isl.asm.type}: island ${isl.id} has a non-finite pose; removed`);
      this.deps.fellOut(isl);
      return;
    }
    if (c.y < FELL_OUT_Y) {
      this.deps.fellOut(isl);
      return;
    }
    const awake = w.physics.isAwake(isl.body);
    if (awake) {
      isl.awake = true;
      isl.sleepTime = 0;
      if (isl.consolidated) this.restore(isl);
      return;
    }
    isl.awake = false;
    isl.sleepTime += elapsed;
    if (this.enabled && !isl.consolidated && isl.sleepTime >= w.settings.quality.consolidateAfter && this.eligible(isl)) this.consolidate(isl);
  }

  eligible(isl: Island): boolean {
    if (isl.isStatic || isl.mass >= CONSOLIDATE_MAX_MASS || isl.extent >= CONSOLIDATE_MAX_EXTENT) return false;
    if (isl.parts.length === 0 || isl.parts.length > 64) return false;
    for (const p of isl.parts) for (const b of p.bonds) if (!b.rigid && b.alive) return false;
    return !this.deps.hasFeatures(isl);
  }

  // ------------------------------------------------------------- consolidation

  consolidate(isl: Island): void {
    if (isl.consolidated || !isl.body) return;
    const w = this.w;
    const geoms: RenderGeom[] = [];
    let verts = 0;
    for (const p of isl.parts) {
      const g = toWorldGeom(w.partGeom(p), isl.node);
      geoms.push(g);
      verts += g.vertexCount;
    }
    const c = w.toWorldVec(isl, isl.com);
    const key = `${Math.floor(c.x / DEBRIS_CELL)},${Math.floor(c.y / DEBRIS_CELL)},${Math.floor(c.z / DEBRIS_CELL)}`;
    let cell = this.cells.get(key);
    if (!cell) {
      const node = new TransformNode(`debris.${key}`, w.scene);
      cell = { key, node, batches: [] };
      this.cells.set(key, cell);
    }
    let batch = cell.batches[cell.batches.length - 1];
    if (!batch || batch.verts + verts > BATCH_MAX_VERTS) {
      batch = { index: cell.batches.length, islands: new Map(), verts: 0, meshes: null, dirty: true, urgent: false };
      cell.batches.push(batch);
      this.cellOf.set(batch, cell);
    }
    batch.islands.set(isl, geoms);
    batch.verts += verts;
    batch.dirty = true;
    this.dirtyBatches.add(batch);
    isl.consolidated = { cellKey: key, batch: batch.index, inBatch: false };
    isl.savedDisableSync = isl.body.disableSync;
    isl.body.disableSync = true;
    this.consolidated++;
  }

  /** Bring a consolidated island back to life (its own meshes, Babylon sync). */
  restore(isl: Island): void {
    this.unconsolidate(isl, true);
  }

  private unconsolidate(isl: Island, rebuildOwn: boolean): void {
    const ref = isl.consolidated;
    if (!ref) return;
    isl.consolidated = null;
    this.consolidated--;
    const cell = this.cells.get(ref.cellKey);
    const batch = cell?.batches[ref.batch];
    if (batch) {
      const g = batch.islands.get(isl);
      if (g) for (const x of g) batch.verts -= x.vertexCount;
      batch.islands.delete(isl);
      batch.dirty = true;
      if (ref.inBatch) batch.urgent = true;
      this.dirtyBatches.add(batch);
    }
    if (isl.body) {
      isl.body.disableSync = isl.savedDisableSync;
      // catch up with any motion that happened while sync was off
      const plugin = this.w.scene.getPhysicsEngine()?.getPhysicsPlugin() as SyncPlugin | undefined;
      if (plugin && typeof plugin.sync === "function" && !isl.body.isDisposed) plugin.sync(isl.body);
    }
    isl.sleepTime = 0;
    isl.awake = true;
    isl.lastCheck = this.w.now;
    if (rebuildOwn && ref.inBatch && isl.alive) this.w.rebuildAllChunks(isl);
    if (batch && batch.urgent) this.rebuildBatch(batch);
  }

  /** Rebuild dirty batches: removals immediately, additions within the budget (ms). */
  rebuildBatches(budgetMs: number): void {
    if (!this.dirtyBatches.size) return;
    const t0 = performance.now();
    for (const b of this.dirtyBatches) {
      if (!b.urgent && performance.now() - t0 > budgetMs) continue;
      this.rebuildBatch(b);
    }
  }

  private rebuildBatch(b: Batch): void {
    const cell = this.cellOf.get(b);
    this.dirtyBatches.delete(b);
    b.dirty = false;
    b.urgent = false;
    if (!cell) return;
    const geoms: RenderGeom[] = [];
    for (const g of b.islands.values()) for (const x of g) geoms.push(x);
    if (!geoms.length) {
      if (b.meshes) this.w.render.disposeIsland(b.meshes);
      b.meshes = null;
      // the whole cell emptied: release its node (cells are recreated on demand)
      if (cell.batches.every((x) => x.islands.size === 0 && !x.meshes)) {
        for (const x of cell.batches) {
          this.dirtyBatches.delete(x);
          this.cellOf.delete(x);
        }
        cell.node.dispose();
        this.cells.delete(cell.key);
      }
    } else {
      b.meshes = this.w.render.buildIsland(cell.node, geoms, b.meshes, `debris:${cell.key}/${b.index}`);
    }
    // the batch now shows these islands: drop their own meshes
    for (const isl of b.islands.keys()) {
      const ref = isl.consolidated;
      if (ref && !ref.inBatch) {
        this.w.disposeChunkMeshes(isl);
        ref.inBatch = true;
      }
    }
  }

  dispose(): void {
    for (const cell of this.cells.values()) {
      for (const b of cell.batches) {
        if (b.meshes) this.w.render.disposeIsland(b.meshes);
        b.meshes = null;
      }
      cell.node.dispose();
    }
    this.cells.clear();
    this.cellOf.clear();
    this.dirtyBatches.clear();
    this.rr.length = 0;
  }
}

/** Copy of a geom with positions/normals transformed into world space by an unparented node. */
export function toWorldGeom(g: RenderGeom, node: TransformNode): RenderGeom {
  const q = node.rotationQuaternion;
  const t = node.position;
  const qx = q ? q.x : 0,
    qy = q ? q.y : 0,
    qz = q ? q.z : 0,
    qw = q ? q.w : 1;
  const n = g.vertexCount;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const P = g.positions,
    N = g.normals;
  for (let i = 0; i < n * 3; i += 3) {
    for (let pass = 0; pass < 2; pass++) {
      const src = pass === 0 ? P : N;
      const vx = src[i],
        vy = src[i + 1],
        vz = src[i + 2];
      const tx = 2 * (qy * vz - qz * vy);
      const ty = 2 * (qz * vx - qx * vz);
      const tz = 2 * (qx * vy - qy * vx);
      const rx = vx + qw * tx + (qy * tz - qz * ty);
      const ry = vy + qw * ty + (qz * tx - qx * tz);
      const rz = vz + qw * tz + (qx * ty - qy * tx);
      if (pass === 0) {
        pos[i] = rx + t.x;
        pos[i + 1] = ry + t.y;
        pos[i + 2] = rz + t.z;
      } else {
        nrm[i] = rx;
        nrm[i + 1] = ry;
        nrm[i + 2] = rz;
      }
    }
  }
  return { positions: pos, normals: nrm, uvs: g.uvs, surf: g.surf, tint: g.tint, indices: g.indices, vertexCount: n };
}
