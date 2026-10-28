// Fracture application (docs/ARCHITECTURE.md §4.6, §4.8): fracture plans produced by the damage
// model are queued and applied under a per-step time budget, most energetic first (always at
// least one per step). Applying a plan replaces the part with its Voronoi cells:
//   remain → parts in the same island, bonded to each other by the plan's internal bonds and
//            inheriting the transferred bonds of the original part (holes in doors/drywall);
//   loose  → parts that split off (own islands) with the plan's kick velocity;
//   micro  → micro-debris particles (no bodies).
// Bonds whose anchor fragment detached break (bondBreak events). Collision shapes of the new
// fragments are created here, inside the budget (hull creation is the expensive part).

import { Layer } from "../../core/context.ts";
import type { Vec3 } from "../../geom/vec.ts";
import type { FracturePlan, PlannedCell } from "../model/damage.ts";
import { resolveBondTransfers } from "./graph.ts";
import { filterCracks, largestFace } from "./polyUtil.ts";
import { DEBRIS_EXTENT, DEBRIS_EXTENT_MAX_MASS, DEBRIS_MASS, type World } from "./world.ts";
import type { FractureRequest, Island, Part } from "./types.ts";
import type { FractureInfo } from "../features/feature.ts";

export const FRACTURE_BUDGET_MS = 4;

export interface FractureDeps {
  onFracture(old: Part, fragments: Part[], info: FractureInfo): void;
  markDamage(part: Part): void;
}

export class FractureSystem {
  private readonly w: World;
  private readonly deps: FractureDeps;
  readonly queue: FractureRequest[] = [];
  private seq = 0;
  /** Milliseconds of fracture work already spent in the current fixed step. */
  budgetUsed = 0;
  budgetMs = FRACTURE_BUDGET_MS;

  constructor(w: World, deps: FractureDeps) {
    this.w = w;
    this.deps = deps;
  }

  enqueue(part: Part, plan: FracturePlan, energy: number, pos: Vec3, dir: Vec3): void {
    this.queue.push({ part, plan, energy: Number.isFinite(energy) ? energy : 0, pos, dir, seq: this.seq++ });
  }

  get pending(): number {
    return this.queue.length;
  }

  /**
   * Apply queued fractures, most energetic first, until the step budget is used up.
   * `atLeastOne` guarantees progress even when the budget is already spent.
   */
  process(atLeastOne: boolean): number {
    const q = this.queue;
    if (!q.length) return 0;
    if (q.length > 1) q.sort((a, b) => b.energy - a.energy || a.seq - b.seq);
    const t0 = performance.now();
    let i = 0;
    for (; i < q.length; i++) {
      const spent = performance.now() - t0;
      if ((i > 0 || !atLeastOne) && this.budgetUsed + spent >= this.budgetMs) break;
      const req = q[i];
      try {
        this.apply(req);
      } catch (e) {
        req.part.pendingFracture = false;
        this.w.warnOnce(`fracture:${(e as Error).message}`, `fracture failed: ${(e as Error).stack ?? e}`);
      }
    }
    this.budgetUsed += performance.now() - t0;
    q.splice(0, i);
    return i;
  }

  /** Drop queued requests of parts that no longer exist (assembly despawned...). */
  purge(): void {
    let j = 0;
    for (let i = 0; i < this.queue.length; i++) {
      const r = this.queue[i];
      if (r.part.alive && r.part.island) this.queue[j++] = r;
      else r.part.pendingFracture = false;
    }
    this.queue.length = j;
  }

  private apply(req: FractureRequest): void {
    const P = req.part;
    P.pendingFracture = false;
    if (!P.alive || !P.island || !P.island.alive) return;
    const w = this.w;
    const island = P.island;
    const asm = P.asm;
    const plan = req.plan;
    const cells = plan.cells;
    if (!cells.length) return;
    const density = P.mass / P.volume;
    const cellParts: Array<Part | null> = new Array(cells.length).fill(null);
    const fragments: Part[] = [];
    let micro = 0;
    let loose = 0;
    const microDensity = w.settings.quality.microDebris;
    const vel = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.role === "micro" || !(cell.volume > 1e-12)) {
        if (cell.role === "micro" && this.spawnMicro(island, P, cell, microDensity, vel)) micro++;
        continue;
      }
      let np: Part;
      try {
        np = this.createFragment(P, cell, i, density);
      } catch {
        continue; // degenerate cell: its volume simply vanishes (below visual relevance)
      }
      if (cell.role === "loose") {
        np.pendingKick = isFinite3(cell.kick) ? { x: cell.kick.x, y: cell.kick.y, z: cell.kick.z } : null;
        loose++;
      }
      cellParts[i] = np;
      fragments.push(np);
      // collider now (inside the budget); loose cells will likely be their own small islands
      const layer =
        cell.role === "remain"
          ? island.layer
          : np.mass < DEBRIS_MASS || (np.ext[0] < DEBRIS_EXTENT && np.mass < DEBRIS_EXTENT_MAX_MASS)
            ? Layer.DEBRIS
            : Layer.DYNAMIC;
      w.ensureShape(np, layer);
    }
    // bonds between remaining cells
    for (const ib of plan.internalBonds) {
      const a = cellParts[ib.a],
        b = cellParts[ib.b];
      if (!a || !b || a === b) continue;
      const s = Number.isFinite(ib.strength) && ib.strength > 0 ? ib.strength : w.fused(P.mat, 1e-4, P.strength);
      w.createBond(asm, "fused", a, b, s, isFinite3(ib.anchor) ? { ...ib.anchor } : midpoint(a.centroid, b.centroid), null);
    }
    // transfer / break the original bonds
    const bonds = P.bonds.slice();
    const target = resolveBondTransfers(bonds, plan.bondTransfer, cells);
    for (let k = 0; k < bonds.length; k++) {
      const b = bonds[k];
      if (!b.alive) continue;
      const np = target[k] >= 0 ? cellParts[target[k]] : null;
      if (np) w.repointBond(b, P, np);
      else w.breakBond(b);
    }
    const info: FractureInfo = { global: plan.global, energy: req.energy, pos: req.pos, dir: req.dir, brokenVolume: plan.brokenVolume };
    this.deps.onFracture(P, fragments, info);
    // replace the part by its fragments (container edits happen in flushTopology)
    w.killPart(P, true);
    for (const np of fragments) w.addPartToIsland(island, np);
    w.markTopo(island);
    w.fractures++;
    asm.brokenVolume += Number.isFinite(plan.brokenVolume) ? Math.max(0, plan.brokenVolume) : 0;
    this.deps.markDamage(fragments[0] ?? P);
    w.events.emit("fracture", {
      pos: { ...req.pos },
      dir: { ...req.dir },
      mat: P.matId,
      mode: plan.mode,
      energy: req.energy,
      volume: Number.isFinite(plan.brokenVolume) ? plan.brokenVolume : 0,
      pieces: loose,
      micro,
      global: plan.global,
      size: P.ext[0],
      assembly: asm.name,
    });
  }

  private createFragment(P: Part, cell: PlannedCell, idx: number, density: number): Part {
    const w = this.w;
    const remain = cell.role === "remain";
    const tags = remain ? P.tags : P.tags.filter((t) => !t.startsWith("switch:"));
    const np = w.createPart(P.asm, {
      name: `${P.name}#${P.gen + 1}.${idx}`,
      matId: P.matId,
      poly: cell.poly,
      grain: P.grain,
      tessCell: P.tessCell,
      supported: remain && P.supported,
      strength: P.strength,
      mass: cell.volume * density,
      noCollide: false,
      tags,
      gen: P.gen + 1,
      volume: cell.volume,
      centroid: isFinite3(cell.centroid) ? cell.centroid : undefined,
    });
    // fragments keep the deformation and crack lines that lie on them
    if (P.dents.length) {
      const b = np.bounds;
      for (const d of P.dents) {
        const dx = Math.max(b.min.x - d.p.x, 0, d.p.x - b.max.x);
        const dy = Math.max(b.min.y - d.p.y, 0, d.p.y - b.max.y);
        const dz = Math.max(b.min.z - d.p.z, 0, d.p.z - b.max.z);
        if (dx * dx + dy * dy + dz * dz <= d.r * d.r) np.dents.push({ p: { ...d.p }, dir: { ...d.dir }, r: d.r, depth: d.depth });
      }
    }
    if (P.cracks.length) np.cracks = filterCracks(P.cracks, cell.poly);
    if (P.dmg.length) {
      const b = np.bounds;
      const m = 0.05;
      for (const d of P.dmg) {
        if (d.p.x < b.min.x - m || d.p.x > b.max.x + m || d.p.y < b.min.y - m || d.p.y > b.max.y + m || d.p.z < b.min.z - m || d.p.z > b.max.z + m) continue;
        np.dmg.push({ p: { ...d.p }, e: d.e });
      }
      np.dmgTime = P.dmgTime;
    }
    return np;
  }

  private spawnMicro(island: Island, P: Part, cell: PlannedCell, density: number, vel: Vec3): boolean {
    const w = this.w;
    const kind = P.mat.micro;
    if (kind === "none") return false;
    if (density < 1 && w.rng.next() > density) return false;
    if (!isFinite3(cell.centroid)) return false;
    const pos = w.toWorldVec(island, cell.centroid);
    w.pointVelocity(island, pos, vel);
    if (isFinite3(cell.kick)) {
      const k = w.dirToWorldVec(island, cell.kick);
      vel.x += k.x;
      vel.y += k.y;
      vel.z += k.z;
    }
    let surf = 0,
      tint = 0xffffff;
    if (cell.poly && cell.poly.faces.length) {
      const f = cell.poly.faces[largestFace(cell.poly)];
      surf = f.attr.surf;
      tint = f.attr.tint;
    }
    const size = Number.isFinite(cell.maxExtent) && cell.maxExtent > 0 ? cell.maxExtent : 0.01;
    w.vfx.micro(kind, pos, { x: vel.x, y: vel.y, z: vel.z }, size, surf, tint);
    return true;
  }
}

function isFinite3(v: Vec3 | undefined | null): v is Vec3 {
  return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}
