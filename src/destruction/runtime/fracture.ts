// Fracture application (docs/ARCHITECTURE.md §4.6, §4.8): fracture plans produced by the damage
// model are queued and applied under the per-step break-work budget (World.work, shared with
// collider and island creation), most energetic first (always at least one per step). Applying
// a plan replaces the part with its Voronoi cells:
//   remain → parts in the same island, bonded to each other by the plan's internal bonds and
//            inheriting the transferred bonds of the original part (holes in doors/drywall);
//   loose  → parts that split off (own islands, created under the budget) with the plan's kick;
//   micro  → micro-debris particles (no bodies).
// Bonds whose anchor fragment detached break (bondBreak events).
//
// Application is two-phase and exception-safe: fragment parts and the colliders the island
// needs right away (remain cells; loose cells get theirs with their island) are built first —
// nothing is registered and on an engine error every collider made so far is released and the
// part stays intact — then the result is committed (pure bookkeeping).
//
// Debris saturation valve: passive collisions keep breaking small debris into smaller debris
// (each piece a body). Loose cells of passive debris fractures that are tiny, or any while the
// scene already holds more dynamic bodies than the quality preset affords, become micro-debris
// particles instead of new bodies — bounded body counts, same visual outcome.

import { Layer } from "../../core/context.ts";
import type { Vec3 } from "../../geom/vec.ts";
import type { ConvexPoly } from "../../geom/poly.ts";
import { S } from "../../render/surfaces.ts";
import type { FracturePlan, PlannedCell } from "../model/damage.ts";
import { resolveBondTransfers } from "./graph.ts";
import { filterCracks, largestFace } from "./polyUtil.ts";
import { DEBRIS_MASS, WORK_BUDGET_MS, type World } from "./world.ts";
import type { FractureRequest, Island, Part } from "./types.ts";
import type { FractureInfo } from "../features/feature.ts";

export const FRACTURE_BUDGET_MS = WORK_BUDGET_MS;
/** Loose cells of passive debris fractures smaller than this (m) become micro-debris. */
export const LOOSE_MIN_EXTENT = 0.03;
/** Dynamic body budget per micro-debris capacity unit of the quality preset (see bodyCap). */
const BODIES_PER_MICRO = 0.1;
const MIN_BODY_CAP = 150;

export interface FractureDeps {
  onFracture(old: Part, fragments: Part[], info: FractureInfo): void;
  markDamage(part: Part): void;
  /** Dynamic islands currently simulated (debris saturation valve). */
  dynamicCount(): number;
}

type Role = PlannedCell["role"];

export class FractureSystem {
  private readonly w: World;
  private readonly deps: FractureDeps;
  readonly queue: FractureRequest[] = [];
  private seq = 0;
  // scratch (reused per application)
  private cellParts: Array<Part | null> = [];
  private roles: Role[] = [];

  constructor(w: World, deps: FractureDeps) {
    this.w = w;
    this.deps = deps;
  }

  /** Per-step budget (ms) — shared with the world's other break work. */
  get budgetMs(): number {
    return this.w.work.budgetMs;
  }

  set budgetMs(v: number) {
    this.w.work.budgetMs = Number.isFinite(v) && v > 0 ? v : FRACTURE_BUDGET_MS;
  }

  enqueue(part: Part, plan: FracturePlan, energy: number, pos: Vec3, dir: Vec3, strike = false): void {
    this.queue.push({ part, plan, energy: Number.isFinite(energy) ? energy : 0, pos, dir, strike, seq: this.seq++ });
  }

  get pending(): number {
    return this.queue.length;
  }

  /**
   * Apply queued fractures, most energetic first, until the step's work budget is used up.
   * `atLeastOne` guarantees progress even when the budget is already spent. Requests of parts
   * waiting for their island (deferred split) stay queued.
   */
  process(atLeastOne: boolean): number {
    const q = this.queue;
    if (!q.length) return 0;
    if (q.length > 1) q.sort((a, b) => b.energy - a.energy || a.seq - b.seq);
    let applied = 0;
    let j = 0;
    let i = 0;
    for (; i < q.length; i++) {
      const req = q[i];
      if (req.part.limbo && req.part.alive) {
        q[j++] = req; // retry once the part has an island again
        continue;
      }
      if ((applied > 0 || !atLeastOne) && this.w.overBudget()) break;
      this.w.beginWork();
      try {
        this.apply(req);
      } catch (e) {
        req.part.pendingFracture = false;
        this.w.warnOnce(`fracture:${(e as Error).message}`, `fracture failed: ${(e as Error).stack ?? e}`);
      } finally {
        this.w.endWork();
      }
      applied++;
    }
    for (; i < q.length; i++) q[j++] = q[i];
    q.length = j;
    return applied;
  }

  /** Drop queued requests of parts that no longer exist (assembly despawned...). */
  purge(): void {
    let j = 0;
    for (let i = 0; i < this.queue.length; i++) {
      const r = this.queue[i];
      if (r.part.alive && (r.part.island || r.part.limbo)) this.queue[j++] = r;
      else r.part.pendingFracture = false;
    }
    this.queue.length = j;
  }

  /** Dynamic body budget derived from the quality preset's micro-debris capacity. */
  private bodyCap(): number {
    const m = this.w.settings.quality.microDebrisMax;
    return Math.max(MIN_BODY_CAP, (Number.isFinite(m) ? m : 3000) * BODIES_PER_MICRO);
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
    const n = cells.length;
    const density = P.mass / P.volume;
    const cellParts = this.cellParts;
    const roles = this.roles;
    cellParts.length = n;
    roles.length = n;
    // ---- valve: passive breaks of debris don't multiply bodies without bound
    const passiveDebris = !req.strike && !island.isStatic && (P.gen > 0 || island.layer === Layer.DEBRIS);
    const saturated = passiveDebris && this.deps.dynamicCount() >= this.bodyCap();
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      let role: Role = c.role === "micro" || !(c.volume > 1e-12) ? "micro" : c.role;
      if (role === "loose" && passiveDebris) {
        const ext = Number.isFinite(c.maxExtent) ? c.maxExtent : 0;
        if (ext < LOOSE_MIN_EXTENT || (saturated && c.volume * density < DEBRIS_MASS)) role = "micro";
      }
      roles[i] = role;
      cellParts[i] = null;
    }

    // ---- phase 1: fragment parts (geometry only, nothing registered)
    const fragments: Part[] = [];
    const remainFrags: Part[] = [];
    let loose = 0;
    let remainVol = 0;
    for (let i = 0; i < n; i++) {
      const role = roles[i];
      if (role === "micro") continue;
      let np: Part;
      try {
        np = this.createFragment(P, cells[i], i, density, role);
      } catch {
        roles[i] = "micro"; // degenerate cell: its volume simply vanishes (below visual relevance)
        continue;
      }
      if (role === "loose") {
        const k = cells[i].kick;
        np.pendingKick = isFinite3(k) ? { x: k.x, y: k.y, z: k.z } : null;
        np.counted = true; // broke away: counted below as part of P's broken volume
        loose++;
      } else {
        np.counted = P.counted;
        remainVol += np.volume;
        remainFrags.push(np);
      }
      cellParts[i] = np;
      fragments.push(np);
    }

    // ---- phase 2: colliders the island needs now (remain cells; loose ones come with their
    // islands). ensureShape degrades hull failures to boxes; anything still thrown aborts the
    // whole fracture with every collider made here released.
    try {
      for (const np of remainFrags) w.ensureShape(np, island.layer, true);
    } catch (e) {
      for (const np of fragments) {
        if (np.shape) w.releaseShape(np.shape);
        np.shape = null;
        if (np.approxShape) w.refineQueue.delete(np);
      }
      throw e;
    }

    // ---- phase 3: commit
    for (const np of fragments) w.adoptPart(np);
    // bonds between remaining cells
    for (const ib of plan.internalBonds) {
      const a = cellParts[ib.a],
        b = cellParts[ib.b];
      if (!a || !b || a === b) continue;
      const s = Number.isFinite(ib.strength) && ib.strength > 0 ? ib.strength : w.fused(P.mat, 1e-4, P.strength);
      w.createBond(asm, "fused", a, b, s, isFinite3(ib.anchor) ? { ...ib.anchor } : midpoint(a.centroid, b.centroid), null);
    }
    // transfer / break the original bonds (a bond assigned to a cell that became micro breaks)
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
    // accounting: what left the part's remaining material (loose + micro) is broken volume,
    // once — fragments of an already counted part (debris breaking again) add nothing
    if (!P.counted) asm.brokenVolume += Math.max(0, P.volume - remainVol);
    // replace the part by its fragments (container edits happen in flushTopology)
    w.killPart(P, true);
    for (const np of fragments) w.addPartToIsland(island, np);
    w.markTopo(island);
    w.fractures++;
    this.deps.markDamage(fragments[0] ?? P);
    // micro-debris last (presentation only)
    const microDensity = w.settings.quality.microDebris;
    const vel = { x: 0, y: 0, z: 0 };
    let micro = 0;
    for (let i = 0; i < n; i++) if (roles[i] === "micro" && this.spawnMicro(island, P, cells[i], microDensity, vel)) micro++;
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
    cellParts.length = 0;
  }

  private createFragment(P: Part, cell: PlannedCell, idx: number, density: number, role: Role): Part {
    const w = this.w;
    const remain = role === "remain";
    const tags = remain ? P.tags : P.tags.filter((t) => !t.startsWith("switch:"));
    const np = w.newPart(P.asm, {
      name: `${P.name}#${P.gen + 1}.${idx}`,
      matId: P.matId,
      poly: unlit(cell.poly),
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
      surf = f.attr.surf === S.bulb_on ? S.bulb_off : f.attr.surf;
      tint = f.attr.tint;
    }
    const size = Number.isFinite(cell.maxExtent) && cell.maxExtent > 0 ? cell.maxExtent : 0.01;
    w.vfx.micro(kind, pos, { x: vel.x, y: vel.y, z: vel.z }, size, surf, tint);
    return true;
  }
}

/** A shattered bulb or lamp lens never glows again: emissive bulb faces → unlit (copy-on-write). */
function unlit(poly: ConvexPoly): ConvexPoly {
  if (!poly.faces.some((f) => f.attr.surf === S.bulb_on)) return poly;
  return { verts: poly.verts, faces: poly.faces.map((f) => (f.attr.surf === S.bulb_on ? { ...f, attr: { ...f.attr, surf: S.bulb_off } } : f)) };
}

function isFinite3(v: Vec3 | undefined | null): v is Vec3 {
  return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}
