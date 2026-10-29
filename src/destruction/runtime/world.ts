// Core of the destruction runtime: owns parts, bonds, islands and their engine resources
// (TransformNode + PhysicsBody + container shape + chunked render meshes) and performs the
// structural operations everything else is built from: spawning assemblies, moving parts
// between islands, breaking bonds, splitting islands into connected components, static →
// dynamic transitions and leak-free disposal.
//
// Engine-resource policy
//  * Child shapes belong to parts and are reused when parts move between islands; containers
//    belong to islands. Static islands edit their container IN PLACE (remove/add children —
//    ~0.1 ms even for walls with hundreds of parts); dynamic islands rebuild their container
//    and re-assign it (mass/COM/inertia are only recomputed on assignment), then get their
//    exact mass via setMassProperties (sum of part masses, so decimated hulls don't matter).
//  * Render geometry is cached per part (RenderGeom in island frame) and batched per CHUNK:
//    small islands have one chunk (one draw call), big static islands (walls, floors) are
//    split into 2 m spatial chunks so a dent or a hole only rebuilds the touched chunk.
//  * Structural changes (membership) rebuild meshes in the same step; cosmetic changes
//    (dents/cracks) are rebuilt under a per-step time budget.
//
// Break work is spread over fixed steps under one shared budget (`work`, default 4 ms per step,
// also used by the fracture queue): hull colliders (the dominant cost) fall back to cheap
// oriented boxes once the budget is spent and are refined to hulls in later steps
// (refineShapes); islands of pieces detached by a split are created up to the budget (at least
// MIN_ISLANDS_PER_STEP per step) and the rest wait in `pendingGroups` (no body, no mesh) until
// a later step, appearing with the pose and velocity they had when they broke off. Engine
// resource creation is exception-safe: hull failures degrade to boxes, and island creation /
// spawning roll back everything they created when the engine throws.

import { AbstractMesh, Quaternion, TransformNode, Vector3, type PhysicsBody, type PhysicsShape, type Scene } from "@babylonjs/core";
import { Layer, type IslandMeshes, type PhysicsSystem, type RenderSystem, type ShapeOpts, type VfxSystem } from "../../core/context.ts";
import type { EventBus, GameEvents } from "../../core/events.ts";
import type { Rng } from "../../core/rng.ts";
import type { Settings } from "../../core/settings.ts";
import type { Time } from "../../core/time.ts";
import { polyBounds, polyCentroid, polyClosestPoint, polyExtents, polyPoints, polyVolume, type ConvexPoly } from "../../geom/poly.ts";
import { polyToRenderGeom, type RenderGeom } from "../../geom/meshgen.ts";
import type { Vec3, Xform } from "../../geom/vec.ts";
import { S } from "../../render/surfaces.ts";
import { fusedStrength } from "../model/damage.ts";
import { BOND_DEFAULTS, MATERIALS, material, type MaterialDef } from "../model/materials.ts";
import type { AssemblyDef, BondDef, BondKind, JointDef, PartDef } from "../model/types.ts";
import { planSplit, type GraphBond } from "./graph.ts";
import { PartGrid } from "./partGrid.ts";
import { detectBox, quatFromBasis, sharedFaceArea, signedDistance } from "./polyUtil.ts";
import { Assembly, Bond, Chunk, Island, JointGroup, Part, type PendingGroup } from "./types.ts";

// ------------------------------------------------------------------------------ constants
/** Debris layer: lighter than this (kg)… */
export const DEBRIS_MASS = 1.5;
/** …or smaller than this (m, largest extent) while lighter than DEBRIS_EXTENT_MAX_MASS. */
export const DEBRIS_EXTENT = 0.2;
/** A dense 20 cm lump (kettlebell, brick stack) still shoves the player: cap the extent rule. */
export const DEBRIS_EXTENT_MAX_MASS = 8;
/** Minimum island mass handed to Havok (kg) — tiny shards stay numerically stable. */
export const MIN_ISLAND_MASS = 0.01;
/** Islands with more parts use a spatial grid for hit-part lookup. */
export const GRID_MIN_PARTS = 24;
/** Islands with more parts (and big enough) get chunked render batches. */
export const CHUNK_MIN_PARTS = 40;
export const CHUNK_SIZE = 2.0;
/** Fragments smaller than this (largest extent, m) get an oriented-box collider instead of a hull. */
export const SMALL_FRAGMENT_BOX = 0.05;
/** In-place container edits beyond this many removals fall back to a rebuild. */
const MAX_INPLACE_REMOVALS = 32;
/** Default per-step budget (ms) for break work: fracture application, colliders, new islands. */
export const WORK_BUDGET_MS = 4;
/** Islands created per step from deferred split pieces even when the budget is spent. */
export const MIN_ISLANDS_PER_STEP = 4;
/**
 * While break work keeps the budget busy, hull refinement waits at most this many steps before
 * doing one anyway (each refinement step re-assigns a static island's container — about one
 * hull build of extra cost on a big wall — so it is batched into quieter steps).
 */
const REFINE_MAX_WAIT_STEPS = 8;

export interface WorldServices {
  physics: PhysicsSystem;
  render: RenderSystem;
  vfx: VfxSystem;
  events: EventBus<GameEvents>;
  time: Time;
  settings: Settings;
  rng: Rng;
  scene: Scene;
}

/** Callbacks into the other destruction subsystems (set by the Destruction facade). */
export interface WorldHooks {
  islandCreated(island: Island): void;
  /** Called before an island's resources are released. */
  islandDisposing(island: Island): void;
  /** Static ↔ dynamic switch or a layer change. */
  islandMotionChanged(island: Island): void;
  /** A part changed island (split / fracture). */
  partMoved(part: Part, to: Island): void;
  bondBroken(bond: Bond, energy: number): void;
  /** A bond endpoint was re-pointed to a fragment, or a joint bond changed islands. */
  jointBondsChanged(group: JointGroup): void;
  partKilled(part: Part, fragments: boolean): void;
}

const NOOP_HOOKS: WorldHooks = {
  islandCreated() {},
  islandDisposing() {},
  islandMotionChanged() {},
  partMoved() {},
  bondBroken() {},
  jointBondsChanged() {},
  partKilled() {},
};

/** World pose of an island node (the assembly frame). */
export interface IslandPose {
  p: Vec3;
  q: { x: number; y: number; z: number; w: number };
}

export interface PartInit {
  name: string;
  matId: PartDef["mat"];
  poly: ConvexPoly;
  grain?: Vec3;
  tessCell?: number;
  supported?: boolean;
  strength?: number;
  /** Explicit mass (kg); default volume × density. */
  mass?: number;
  noCollide?: boolean;
  tags?: readonly string[];
  gen?: number;
  /** Precomputed geometry (fragments come with volume/centroid from the fracture plan). */
  volume?: number;
  centroid?: Vec3;
}

const tmpV = new Vector3();
const tmpW = new Vector3();
const tmpV2 = new Vector3();
const sCom: Vec3 = { x: 0, y: 0, z: 0 };
const EMPTY_TAGS: readonly string[] = Object.freeze([]);

export class World {
  readonly physics: PhysicsSystem;
  readonly render: RenderSystem;
  readonly vfx: VfxSystem;
  readonly events: EventBus<GameEvents>;
  readonly time: Time;
  readonly settings: Settings;
  readonly rng: Rng;
  readonly scene: Scene;
  hooks: WorldHooks = NOOP_HOOKS;

  readonly assemblies = new Map<number, Assembly>();
  readonly islands = new Set<Island>();
  private readonly bodyMap = new Map<PhysicsBody, Island>();
  private nextAsmId = 1;
  private nextIslandId = 1;
  private nextPartId = 1;
  private nextBondId = 1;
  partCount = 0;
  fractures = 0;
  bondsBroken = 0;
  /** Fixed-step counter (advanced by endStep). */
  stepIndex = 0;
  /** Break-work budget of the current fixed step (ms spent / allowed). */
  readonly work = { used: 0, budgetMs: WORK_BUDGET_MS, islands: 0, refines: 0 };
  private lastRefineStep = 0;
  /** Nesting depth of beginWork()/endWork() (only the outermost scope is timed). */
  private workScope = 0;
  private workT0 = 0;
  /** Split pieces waiting for their island (created under the work budget, oldest first). */
  readonly pendingGroups: PendingGroup[] = [];
  /** Parts with a stand-in box collider waiting for their hull. */
  readonly refineQueue = new Set<Part>();
  /** Edit static containers in place (disabled automatically if the physics shapes don't support it). */
  inPlaceEdits = true;
  private nextBirth = 1;

  /** Islands needing a connectivity check (bond broken / parts replaced). */
  readonly topoDirty = new Set<Island>();
  /** Islands with dirty render chunks. */
  readonly meshDirty = new Set<Island>();
  /** Islands with pending container edits (pendingAdd / pendingRemove / rebuildContainer). */
  readonly containerDirty = new Set<Island>();
  /** Child shapes to release after containers are synced. */
  private deadShapes: PhysicsShape[] = [];
  private warned = new Set<string>();
  private readonly gb: GraphBond[] = [];

  constructor(s: WorldServices) {
    this.physics = s.physics;
    this.render = s.render;
    this.vfx = s.vfx;
    this.events = s.events;
    this.time = s.time;
    this.settings = s.settings;
    this.rng = s.rng;
    this.scene = s.scene;
  }

  get now(): number {
    return this.time.simTime;
  }

  warnOnce(key: string, msg: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(`[destruction] ${msg}`);
  }

  islandOf(body: PhysicsBody | null | undefined): Island | undefined {
    return body ? this.bodyMap.get(body) : undefined;
  }

  // =================================================================================== spawn

  /**
   * Build an assembly: parts, bonds, joint groups, islands with bodies. If the engine throws
   * part-way, everything created so far is released and the error is rethrown (no half-built
   * assembly stays registered).
   */
  spawn(def: AssemblyDef, xf: Xform): Assembly {
    const asm = new Assembly(this.nextAsmId++, def, { p: { ...xf.p }, q: { ...xf.q } });
    this.assemblies.set(asm.id, asm);
    try {
      this.buildAssembly(asm, def);
    } catch (e) {
      this.despawn(asm);
      throw e;
    }
    return asm;
  }

  private buildAssembly(asm: Assembly, def: AssemblyDef): void {
    for (const pd of def.parts) {
      if (asm.byName.has(pd.name)) {
        this.warnOnce(`dup:${def.type}:${pd.name}`, `${def.type}: duplicate part '${pd.name}' ignored`);
        continue;
      }
      let part: Part;
      try {
        part = this.createPart(asm, {
          name: pd.name,
          matId: pd.mat,
          poly: pd.poly,
          grain: pd.grain,
          tessCell: pd.tessCell,
          supported: pd.supported,
          strength: pd.strength,
          mass: pd.mass,
          noCollide: pd.noCollide,
          tags: pd.tags,
        });
      } catch (e) {
        this.warnOnce(`part:${def.type}:${pd.name}`, `${def.type}: part '${pd.name}' skipped (${(e as Error).message})`);
        continue;
      }
      asm.byName.set(pd.name, part);
    }
    // bonds (latches attach to their hinge/slider group after all joint bonds exist)
    const latches: Bond[] = [];
    let autoGroup = 0;
    for (const bd of def.bonds) {
      const a = asm.byName.get(bd.a);
      const b = bd.b === "world" ? null : asm.byName.get(bd.b);
      if (!a || (bd.b !== "world" && !b) || a === b) {
        this.warnOnce(`bond:${def.type}:${bd.a}:${bd.b}`, `${def.type}: bond ${bd.a}–${bd.b} skipped (unknown part)`);
        continue;
      }
      const strength = this.bondStrength(bd, a, b ?? null);
      const anchor = bd.anchor ? { x: bd.anchor.x, y: bd.anchor.y, z: bd.anchor.z } : this.autoAnchor(a, b ?? null);
      const isJoint = bd.kind === "hinge" || bd.kind === "slider";
      if ((isJoint || bd.kind === "latch") && !bd.joint) {
        this.warnOnce(`joint:${def.type}:${bd.a}`, `${def.type}: ${bd.kind} bond ${bd.a}–${bd.b} lacks a joint def`);
        continue;
      }
      const bond = this.createBond(asm, bd.kind, a, b ?? null, strength, anchor, bd.joint ?? null, true);
      if (isJoint) {
        const gid = bd.joint!.group ?? `${a.name}#${bd.kind}${autoGroup++}`;
        let g = asm.groups.get(gid);
        if (!g) {
          g = new JointGroup(gid, bd.kind as "hinge" | "slider", asm, bd.joint!);
          asm.groups.set(gid, g);
        }
        g.bonds.push(bond);
        bond.group = g;
      } else if (bd.kind === "latch") latches.push(bond);
    }
    for (const l of latches) {
      const gid = l.joint?.group;
      let g = gid ? asm.groups.get(gid) : undefined;
      if (!g) {
        // fall back to a group whose moving part matches the latch's jointed part
        for (const cand of asm.groups.values()) {
          if (cand.bonds.some((b) => b.a === l.a)) {
            g = cand;
            break;
          }
        }
      }
      if (g && !g.latch) {
        g.latch = l;
        l.group = g;
      }
    }
    // islands = components of the rigid bond graph
    const parts = [...asm.parts];
    const index = new Map<Part, number>();
    parts.forEach((p, i) => index.set(p, i));
    const gb: GraphBond[] = [];
    for (const b of asm.bonds) {
      if (!b.rigid) continue;
      gb.push({ a: index.get(b.a)!, b: b.b ? index.get(b.b)! : -1, rigid: true, alive: true });
    }
    const plan = planSplit(
      parts.length,
      parts.map((p) => p.mass),
      gb,
    );
    const startAsleep = def.startAsleep ?? true;
    for (let c = 0; c < plan.count; c++) {
      const members = plan.members[c].map((i) => parts[i]);
      this.createIsland(asm, members, plan.anchored[c], null, !plan.anchored[c] && startAsleep);
    }
    // accounting baseline (only blueprint bonds exist yet: all `original`)
    let vol = 0;
    for (const p of asm.parts) vol += p.volume;
    asm.initialVolume = Math.max(vol, 1e-9);
    asm.initialBonds = asm.bonds.size;
  }

  private bondStrength(bd: BondDef, a: Part, b: Part | null): number {
    if (bd.strength !== undefined && Number.isFinite(bd.strength) && bd.strength > 0) return bd.strength;
    if (bd.kind === "fused") {
      let area: number;
      if (b) {
        area = sharedFaceArea(a.poly, b.poly);
        if (!(area > 0)) area = 0.3 * Math.min(a.ext[1] * a.ext[2], b.ext[1] * b.ext[2]);
      } else area = 0.5 * a.ext[0] * a.ext[1];
      let s = this.fused(a.mat, area, a.strength);
      if (b) s = Math.min(s, this.fused(b.mat, area, b.strength));
      return Number.isFinite(s) && s > 0 ? s : 60;
    }
    const d = BOND_DEFAULTS[bd.kind];
    return d !== undefined && d > 0 ? d : 30;
  }

  /** fusedStrength with a defensive fallback (G × area) if the model is unavailable. */
  fused(m: MaterialDef, area: number, mul = 1): number {
    try {
      const s = fusedStrength(m, area, mul);
      if (Number.isFinite(s) && s > 0) return s;
    } catch {
      /* model not ready */
    }
    return Math.max(1, (m.G > 0 ? m.G : 20000) * area * 0.5 * mul);
  }

  private autoAnchor(a: Part, b: Part | null): Vec3 {
    if (!b) return { x: (a.bounds.min.x + a.bounds.max.x) / 2, y: a.bounds.min.y, z: (a.bounds.min.z + a.bounds.max.z) / 2 };
    try {
      const pb = polyClosestPoint(b.poly, a.centroid);
      const pa = polyClosestPoint(a.poly, pb);
      const pb2 = polyClosestPoint(b.poly, pa);
      return { x: (pa.x + pb2.x) / 2, y: (pa.y + pb2.y) / 2, z: (pa.z + pb2.z) / 2 };
    } catch {
      return { x: (a.centroid.x + b.centroid.x) / 2, y: (a.centroid.y + b.centroid.y) / 2, z: (a.centroid.z + b.centroid.z) / 2 };
    }
  }

  // ============================================================================ parts/bonds

  /** Create and register a part (spawn). */
  createPart(asm: Assembly, init: PartInit): Part {
    const part = this.newPart(asm, init);
    this.adoptPart(part);
    return part;
  }

  /** Register a part made by newPart() with its assembly. */
  adoptPart(part: Part): void {
    part.asm.parts.add(part);
    this.partCount++;
  }

  /** A part object (geometry/mass derived) that is NOT registered yet — see adoptPart(). */
  newPart(asm: Assembly, init: PartInit): Part {
    const mat = MATERIALS[init.matId] ?? material(init.matId);
    const volume = init.volume ?? polyVolume(init.poly);
    if (!(volume > 1e-12) || !Number.isFinite(volume)) throw new Error(`degenerate volume ${volume}`);
    const centroid = init.centroid ? { ...init.centroid } : polyCentroid(init.poly);
    const ex = polyExtents(init.poly).ext;
    const ext: [number, number, number] = [Math.max(ex[0], 1e-4), Math.max(ex[1], 1e-4), Math.max(ex[2], 1e-4)];
    const bounds = polyBounds(init.poly);
    const mass = init.mass !== undefined && init.mass > 0 && Number.isFinite(init.mass) ? init.mass : volume * mat.density;
    const part = new Part({
      id: this.nextPartId++,
      name: init.name,
      asm,
      matId: mat.id,
      mat,
      poly: init.poly,
      volume,
      mass: Math.max(mass, 1e-6),
      centroid,
      ext,
      bounds,
      grain: init.grain,
      tessCell: init.tessCell ?? 0,
      supported: !!init.supported,
      strength: init.strength !== undefined && init.strength > 0 ? init.strength : 1,
      noCollide: !!init.noCollide,
      tags: init.tags && init.tags.length ? init.tags : EMPTY_TAGS,
      gen: init.gen ?? 0,
      box: detectBox(init.poly),
    });
    return part;
  }

  /** `original` = blueprint bond (spawn); fracture-made bonds don't count in the damage share. */
  createBond(asm: Assembly, kind: BondKind, a: Part, b: Part | null, strength: number, anchor: Vec3, joint: JointDef | null, original = false): Bond {
    const bond = new Bond(this.nextBondId++, asm, kind, a, b, strength, anchor, joint, original);
    a.bonds.push(bond);
    if (b) b.bonds.push(bond);
    asm.bonds.add(bond);
    return bond;
  }

  /**
   * Apply damage (J) to a bond; breaks it when health is exhausted. Returns true if it broke.
   * Structural consequences (splits, joints) are deferred to flushTopology().
   */
  damageBond(bond: Bond, amount: number): boolean {
    if (!bond.alive || !(amount > 0) || !Number.isFinite(amount)) return false;
    bond.health -= amount;
    if (bond.health <= 0) {
      this.breakBond(bond);
      return true;
    }
    return false;
  }

  breakBond(bond: Bond, energy = bond.max): void {
    if (!bond.alive) return;
    bond.alive = false;
    bond.health = 0;
    removeFrom(bond.a.bonds, bond);
    if (bond.b) removeFrom(bond.b.bonds, bond);
    bond.asm.bonds.delete(bond);
    if (bond.original) bond.asm.brokenBonds++;
    this.bondsBroken++;
    const isl = bond.a.island ?? bond.b?.island ?? null;
    const pos = isl ? this.toWorldVec(isl, bond.anchor) : { ...bond.anchor };
    this.events.emit("bondBreak", { pos, kind: bond.kind, matA: bond.a.matId, matB: bond.b ? bond.b.matId : null, energy: bond.max });
    if (bond.rigid) {
      if (bond.a.island) this.topoDirty.add(bond.a.island);
      if (bond.b?.island) this.topoDirty.add(bond.b.island);
    }
    this.hooks.bondBroken(bond, energy);
  }

  /** Re-point a bond endpoint from `from` to `to` (fracture transfer). */
  repointBond(bond: Bond, from: Part, to: Part): void {
    if (bond.a === from) bond.a = to;
    else if (bond.b === from) bond.b = to;
    else return;
    removeFrom(from.bonds, bond);
    to.bonds.push(bond);
    if (bond.group) this.hooks.jointBondsChanged(bond.group);
  }

  // ================================================================================ islands

  /**
   * Create an island for `parts` (already created, not in any island). Its node starts at the
   * assembly spawn transform, or at `pose` (world pose of the assembly frame — split pieces).
   * `approx`: colliders may be stand-in boxes once the step's work budget is spent (refined
   * later). Exception-safe: if the engine throws, the node/container/body made here are
   * released, the parts are left island-less and the error is rethrown.
   */
  createIsland(asm: Assembly, parts: Part[], isStatic: boolean, pose: IslandPose | null, startAsleep: boolean, approx = false): Island {
    const node = new TransformNode(`d${asm.id}.i${this.nextIslandId}`, this.scene);
    node.rotationQuaternion = new Quaternion();
    if (pose) {
      node.position.set(pose.p.x, pose.p.y, pose.p.z);
      node.rotationQuaternion.set(pose.q.x, pose.q.y, pose.q.z, pose.q.w);
    } else {
      node.position.set(asm.xf.p.x, asm.xf.p.y, asm.xf.p.z);
      node.rotationQuaternion.set(asm.xf.q.x, asm.xf.q.y, asm.xf.q.z, asm.xf.q.w);
    }
    node.rotationQuaternion.normalize();
    node.computeWorldMatrix(true);
    const island = new Island(this.nextIslandId++, asm, node, isStatic);
    for (const p of parts) {
      p.island = island;
      p.limbo = false;
      island.parts.push(p);
    }
    let body: PhysicsBody | null = null;
    let container: PhysicsShape | null = null;
    try {
      this.updateMetrics(island);
      island.layer = this.classifyLayer(island);
      const coll = this.collidable(island);
      for (const p of coll) this.ensureShape(p, island.layer, approx);
      container = this.physics.containerShape(
        coll.map((p) => p.shape!),
        { layer: island.layer },
      );
      body = this.physics.createBody(node, isStatic ? "static" : "dynamic", startAsleep);
      this.physics.setShape(body, container);
      island.container = container;
      island.body = body;
      island.childParts = coll.slice();
      for (const p of coll) p.inContainer = true;
      this.bodyMap.set(body, island);
      if (!isStatic) this.applyMass(island);
    } catch (e) {
      if (body) {
        this.bodyMap.delete(body);
        try {
          this.physics.disposeBody(body);
        } catch {
          /* already gone */
        }
      }
      if (container) container.dispose(); // children belong to the parts
      for (const p of parts) {
        if (p.island === island) p.island = null;
        p.inContainer = false;
      }
      island.alive = false;
      node.dispose();
      throw e;
    }
    island.awake = !startAsleep && !isStatic;
    this.setupChunks(island);
    asm.islands.add(island);
    this.islands.add(island);
    this.hooks.islandCreated(island);
    return island;
  }

  /** Collidable parts of an island (an island made only of noCollide details collides anyway). */
  collidable(island: Island): Part[] {
    const out: Part[] = [];
    for (const p of island.parts) if (!p.noCollide) out.push(p);
    return out.length ? out : island.parts.slice();
  }

  classifyLayer(island: Island): number {
    if (island.isStatic) return Layer.STATIC;
    if (island.mass < DEBRIS_MASS || (island.extent < DEBRIS_EXTENT && island.mass < DEBRIS_EXTENT_MAX_MASS)) return Layer.DEBRIS;
    return Layer.DYNAMIC;
  }

  updateMetrics(island: Island): void {
    let m = 0,
      cx = 0,
      cy = 0,
      cz = 0;
    let x0 = Infinity,
      y0 = Infinity,
      z0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity,
      z1 = -Infinity;
    for (const p of island.parts) {
      m += p.mass;
      cx += p.centroid.x * p.mass;
      cy += p.centroid.y * p.mass;
      cz += p.centroid.z * p.mass;
      const b = p.bounds;
      if (b.min.x < x0) x0 = b.min.x;
      if (b.min.y < y0) y0 = b.min.y;
      if (b.min.z < z0) z0 = b.min.z;
      if (b.max.x > x1) x1 = b.max.x;
      if (b.max.y > y1) y1 = b.max.y;
      if (b.max.z > z1) z1 = b.max.z;
    }
    island.mass = m;
    if (m > 0) island.com = { x: cx / m, y: cy / m, z: cz / m };
    if (island.parts.length) island.bounds = { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } };
    island.extent = island.parts.length === 1 ? island.parts[0].ext[0] : Math.max(x1 - x0, y1 - y0, z1 - z0, 0);
    island.metricsDirty = false;
  }

  /** Mass Havok simulates the island with (kg): tiny shards are clamped for solver stability. */
  physMass(island: Island): number {
    return island.isStatic ? Infinity : Math.max(island.mass, MIN_ISLAND_MASS);
  }

  /** Exact island mass on the Havok body (COM/inertia still come from the child shapes). */
  applyMass(island: Island): void {
    if (!island.body || island.isStatic) return;
    island.body.setMassProperties({ mass: Math.max(island.mass, MIN_ISLAND_MASS) });
    // let the physics module re-read it (its impact gating caches body masses)
    (this.physics as PhysicsSystem & { refreshMass?(b: PhysicsBody): void }).refreshMass?.(island.body);
  }

  /**
   * Create (or re-layer) a part's child collision shape. Box parts get exact boxes, tiny
   * fragments oriented boxes; everything else a convex hull — or, with `approx` once the step's
   * work budget is spent, a stand-in oriented box queued for refinement (refineShapes). A hull
   * the engine fails to build degrades to the oriented box (then to a sphere) instead of
   * throwing, so a physics error never leaves a part without a collider.
   */
  ensureShape(part: Part, layer: number, approx = false): PhysicsShape {
    if (part.shape) {
      if (part.shapeLayer !== layer) {
        this.physics.setLayer(part.shape, layer);
        part.shapeLayer = layer;
      }
      return part.shape;
    }
    const opts = this.shapeOpts(part, layer);
    let shape: PhysicsShape;
    if (part.box) shape = this.safeShape(part, opts, () => this.physics.boxShape(part.box!.center, part.box!.rot, part.box!.size, opts));
    else if (part.gen > 0 && part.ext[0] < SMALL_FRAGMENT_BOX) shape = this.safeShape(part, opts, () => this.obbShape(part, opts));
    else if (approx && this.overBudget()) {
      shape = this.safeShape(part, opts, () => this.obbShape(part, opts));
      part.approxShape = true;
      this.refineQueue.add(part);
    } else if (approx) {
      this.beginWork();
      try {
        shape = this.safeShape(part, opts, () => this.physics.hullShape(polyPoints(part.poly), opts));
      } finally {
        this.endWork();
      }
    } else shape = this.safeShape(part, opts, () => this.physics.hullShape(polyPoints(part.poly), opts));
    part.shape = shape;
    part.shapeLayer = layer;
    return shape;
  }

  private shapeOpts(part: Part, layer: number): ShapeOpts {
    return {
      density: Math.max(part.mass / part.volume, 1),
      friction: part.mat.friction,
      restitution: part.mat.restitution,
      layer,
    };
  }

  /** Build a shape; on an engine error fall back to the oriented box, then to a sphere. */
  private safeShape(part: Part, opts: ShapeOpts, make: () => PhysicsShape): PhysicsShape {
    try {
      return make();
    } catch (e) {
      this.warnOnce(`shape:${(e as Error).message}`, `collider for '${part.name}' failed (${(e as Error).message}); using a box`);
    }
    try {
      return this.obbShape(part, opts);
    } catch {
      /* fall through */
    }
    const r = Math.max(0.005, Math.cbrt((3 * part.volume) / (4 * Math.PI)));
    return this.physics.sphereShape(part.centroid, r, opts);
  }

  /** The per-step break-work budget is used up (including the operation in progress). */
  overBudget(): boolean {
    const inflight = this.workScope > 0 ? performance.now() - this.workT0 : 0;
    return this.work.used + inflight >= this.work.budgetMs;
  }

  /** Measure budgeted work (nestable: only the outermost scope is timed). */
  beginWork(): void {
    if (this.workScope++ === 0) this.workT0 = performance.now();
  }

  endWork(): void {
    if (this.workScope > 0 && --this.workScope === 0) this.work.used += performance.now() - this.workT0;
  }

  /**
   * Oriented box from principal axes standing in for the part's hull. Flat cells (sheet
   * fragments) keep their full thickness and shrink in-plane to the cell's area; chunky ones
   * shrink uniformly to its volume. Sizes the physics module builds natively are ~100× cheaper
   * than a hull (smaller ones become 8-point hulls, still about half the cost).
   */
  private obbShape(part: Part, opts: ShapeOpts): PhysicsShape {
    const { ext, axes } = polyExtents(part.poly);
    const w = cross3(axes[0], axes[1]);
    const boxVol = Math.max(ext[0] * ext[1] * ext[2], 1e-12);
    const fill = Math.min(1, part.volume / boxVol);
    let k0: number, k2: number;
    if (ext[2] < 0.3 * ext[1]) {
      k0 = Math.min(1, Math.max(0.65, Math.sqrt(fill)));
      k2 = 1;
    } else k0 = k2 = Math.min(1, Math.max(0.6, Math.cbrt(fill)));
    const size = { x: Math.max(ext[0] * k0, 0.004), y: Math.max(ext[1] * k0, 0.004), z: Math.max(ext[2] * k2, 0.004) };
    return this.physics.boxShape(part.centroid, quatFromBasis(axes[0], axes[1], w), size, opts);
  }

  /**
   * Replace stand-in boxes by hulls while the step's work budget lasts (when break work keeps
   * it busy, one at least every REFINE_MAX_WAIT_STEPS steps). Static islands first (they define
   * holes the player sees and walks past), then pieces heavy enough to matter; small debris
   * keeps its box. The container swaps happen in the next syncContainer (flushTopology), once
   * per island and step.
   */
  refineShapes(): void {
    if (!this.refineQueue.size) return;
    if (this.overBudget() && this.stepIndex - this.lastRefineStep < REFINE_MAX_WAIT_STEPS) return;
    let pass = 0;
    while (pass < 2 && this.refineQueue.size) {
      for (const p of this.refineQueue) {
        if (this.work.refines > 0 && this.overBudget()) return;
        const isl = p.island;
        if (!p.alive || !p.approxShape || !p.shape) {
          this.refineQueue.delete(p);
          p.approxShape = false;
          continue;
        }
        if (!isl) continue; // in limbo: refined once it has an island again
        if (pass === 0 && !isl.isStatic) continue;
        if (!isl.isStatic && isl.layer === Layer.DEBRIS) {
          this.refineQueue.delete(p); // debris keeps its box (cost saving, visually equivalent)
          p.approxShape = false;
          continue;
        }
        this.refineQueue.delete(p);
        p.approxShape = false;
        this.lastRefineStep = this.stepIndex;
        let hull: PhysicsShape;
        this.beginWork();
        try {
          hull = this.physics.hullShape(polyPoints(p.poly), this.shapeOpts(p, p.shapeLayer));
        } catch (e) {
          this.warnOnce(`refine:${(e as Error).message}`, `hull refinement for '${p.name}' failed: ${(e as Error).message}`);
          continue; // keep the box
        } finally {
          this.endWork();
          this.work.refines++;
        }
        this.deadShapes.push(p.shape);
        p.shape = hull;
        if (p.inContainer) {
          isl.pendingRemove.add(p);
          isl.pendingAdd.push(p);
          this.containerDirty.add(isl);
        }
      }
      pass++;
    }
  }

  /** Recreate a part's collider from its (dented) render vertices after a big crumple. */
  refreshCollider(part: Part, points: Float32Array): void {
    const island = part.island;
    if (!island) return;
    const old = part.shape;
    const opts = this.shapeOpts(part, island.layer);
    part.shape = this.safeShape(part, opts, () => this.physics.hullShape(points, opts));
    part.shapeLayer = island.layer;
    part.approxShape = false;
    this.refineQueue.delete(part);
    if (old) this.deadShapes.push(old);
    if (part.inContainer) {
      // swap the child (in place for static islands, rebuild for dynamic ones)
      island.pendingRemove.add(part);
      island.pendingAdd.push(part);
      this.containerDirty.add(island);
    }
    this.syncContainer(island);
    this.releaseDeadShapes();
  }

  // ------------------------------------------------------------------------ membership

  /** Add a (new or moved) part to an island: render chunk + pending container insertion. */
  addPartToIsland(island: Island, part: Part): void {
    part.island = island;
    island.parts.push(part);
    island.pendingAdd.push(part);
    this.containerDirty.add(island);
    island.metricsDirty = true;
    island.gridDirty = true;
    this.chunkAdd(island, part);
  }

  /** Remove a part from its island (container removal is deferred to syncContainer). */
  detachPart(part: Part): void {
    const island = part.island;
    if (!island) return;
    removeFrom(island.parts, part);
    if (part.inContainer) {
      island.pendingRemove.add(part);
      this.containerDirty.add(island);
    } else removeFrom(island.pendingAdd, part);
    this.chunkRemove(island, part);
    island.metricsDirty = true;
    island.gridDirty = true;
    part.island = null;
  }

  /** Destroy a part (fractured into fragments, fell out, despawned). Its bonds must be gone. */
  killPart(part: Part, fragments: boolean): void {
    if (!part.alive) return;
    this.hooks.partKilled(part, fragments);
    this.detachPart(part);
    part.alive = false;
    for (const b of part.bonds.slice()) this.breakBond(b);
    part.asm.parts.delete(part);
    this.partCount--;
    if (part.shape) {
      this.deadShapes.push(part.shape);
      part.shape = null;
    }
    if (part.approxShape) {
      part.approxShape = false;
      this.refineQueue.delete(part);
    }
    part.limbo = false;
    part.geom = null;
  }

  // ------------------------------------------------------------------------ containers

  /** Apply pending container changes (in place for static islands, rebuild otherwise). */
  syncContainer(island: Island): void {
    if (!island.body || !island.alive) return;
    const pending = island.pendingAdd.length > 0 || island.pendingRemove.size > 0;
    if (!pending && !island.rebuildContainer) return;
    const c = island.container as (PhysicsShape & { removeChild?(i: number): void; addChild?(s: PhysicsShape): void }) | null;
    const inPlace =
      this.inPlaceEdits &&
      island.isStatic &&
      !island.rebuildContainer &&
      !!c &&
      typeof c.removeChild === "function" &&
      typeof c.addChild === "function" &&
      island.pendingRemove.size <= MAX_INPLACE_REMOVALS &&
      island.pendingRemove.size < island.childParts.length &&
      island.parts.some((p) => !p.noCollide);
    if (inPlace) {
      // Re-assigning the container makes the physics module re-read its child list (raycast
      // childIndex) — it does so when the child COUNT changed. Each assignment also recomputes
      // mass properties over all children (~1 hull build for a wall of hundreds of parts, wasted
      // on a static body), so assign once, plus once in between only when the removals and
      // additions cancel out (the count would look unchanged).
      let removed = 0;
      if (island.pendingRemove.size) {
        for (let i = island.childParts.length - 1; i >= 0; i--) {
          const p = island.childParts[i];
          if (!island.pendingRemove.has(p)) continue;
          c!.removeChild!(i);
          island.childParts.splice(i, 1);
          p.inContainer = false;
          removed++;
        }
      }
      let addable = 0;
      for (const p of island.pendingAdd) if (p.alive && p.island === island && !p.inContainer && !p.noCollide) addable++;
      if (removed > 0 && addable === removed) this.physics.setShape(island.body, c!);
      let added = 0;
      for (const p of island.pendingAdd) {
        if (!p.alive || p.island !== island || p.inContainer || p.noCollide) continue;
        c!.addChild!(this.ensureShape(p, island.layer, true));
        island.childParts.push(p);
        p.inContainer = true;
        added++;
      }
      if (added > 0 || (removed > 0 && addable !== removed)) this.physics.setShape(island.body, c!);
    } else {
      const coll = this.collidable(island);
      for (const p of coll) this.ensureShape(p, island.layer, true);
      // build + assign before touching the bookkeeping: an engine error leaves the old
      // container in place and the pending edits queued for a retry
      const container = this.physics.containerShape(
        coll.map((p) => p.shape!),
        { layer: island.layer },
      );
      try {
        this.physics.setShape(island.body, container);
      } catch (e) {
        container.dispose();
        throw e;
      }
      for (const p of island.childParts) p.inContainer = false;
      island.container = container;
      island.childParts = coll;
      for (const p of coll) p.inContainer = true;
      if (!island.isStatic) this.applyMass(island);
    }
    island.pendingAdd.length = 0;
    island.pendingRemove.clear();
    island.rebuildContainer = false;
    this.containerDirty.delete(island);
  }

  // ------------------------------------------------------------------------- topology

  markTopo(island: Island | null | undefined): void {
    if (island && island.alive) this.topoDirty.add(island);
  }

  /** Process every pending connectivity change: splits, static→dynamic, container syncs. */
  flushTopology(): void {
    let guard = 0;
    while (this.topoDirty.size && guard++ < 8) {
      const list = [...this.topoDirty];
      this.topoDirty.clear();
      for (const isl of list) if (isl.alive) this.splitIsland(isl);
    }
    if (this.pendingGroups.length) this.createPendingIslands();
    if (this.containerDirty.size) {
      for (const isl of [...this.containerDirty]) this.syncContainer(isl);
      this.containerDirty.clear();
    }
    this.releaseDeadShapes();
  }

  releaseDeadShapes(): void {
    if (!this.deadShapes.length) return;
    for (const s of this.deadShapes) this.releaseShape(s);
    this.deadShapes.length = 0;
  }

  /** Dispose a child shape now (it must not be in any container any more). */
  releaseShape(s: PhysicsShape): void {
    const ext = this.physics as PhysicsSystem & { disposeShape?(s: PhysicsShape): void };
    try {
      if (typeof ext.disposeShape === "function") ext.disposeShape(s);
      else s.dispose();
    } catch (e) {
      this.warnOnce(`dispose:${(e as Error).message}`, `shape dispose failed: ${(e as Error).message}`);
    }
  }

  /**
   * Connected components of the island over intact rigid bonds. The heaviest component keeps
   * the body; others get new islands starting at the current world pose with velocities
   * v = v_old + ω_old × (com_new − com_old), ω = ω_old. Components without world bonds become
   * dynamic. Pending fragment kicks are added. Emits `split`.
   */
  splitIsland(island: Island): void {
    // snapshot: detachPart() below mutates island.parts
    const parts = island.parts.slice();
    if (parts.length === 0) {
      this.disposeIsland(island);
      return;
    }
    const n = parts.length;
    for (let i = 0; i < n; i++) parts[i].tmp = i;
    const gb = this.gb;
    gb.length = 0;
    for (let i = 0; i < n; i++) {
      const p = parts[i];
      for (const b of p.bonds) {
        if (!b.rigid || !b.alive) continue;
        if (!b.b) {
          gb.push({ a: i, b: -1, rigid: true, alive: true });
          continue;
        }
        const o = b.a === p ? b.b : b.a;
        if (o.island !== island || o.id < p.id) continue;
        gb.push({ a: i, b: o.tmp, rigid: true, alive: true });
      }
    }
    const masses = new Float64Array(n);
    for (let i = 0; i < n; i++) masses[i] = parts[i].mass;
    const plan = planSplit(n, masses, gb);
    gb.length = 0;

    if (plan.count === 1) {
      if (island.metricsDirty) this.updateMetrics(island);
      if (island.isStatic && !plan.anchored[0]) this.makeDynamic(island);
      else {
        if (!island.isStatic) this.reclassify(island);
        this.syncContainer(island);
      }
      // fragment kicks (also clears them on islands that stay static, so none go stale)
      this.applyKicks(island);
      return;
    }

    // velocities of the old body
    const wasStatic = island.isStatic;
    const vOld = { x: 0, y: 0, z: 0 },
      wOld = { x: 0, y: 0, z: 0 };
    if (!wasStatic && island.body) {
      island.body.getLinearVelocityToRef(tmpV);
      island.body.getAngularVelocityToRef(tmpW);
      vOld.x = tmpV.x;
      vOld.y = tmpV.y;
      vOld.z = tmpV.z;
      wOld.x = tmpW.x;
      wOld.y = tmpW.y;
      wOld.z = tmpW.z;
    }
    if (island.metricsDirty) this.updateMetrics(island);
    const comOld = this.toWorldVec(island, island.com);
    const asm = island.asm;

    // detach the non-keeper components first so the old container no longer holds their shapes
    const groups: Array<{ parts: Part[]; anchored: boolean; mass: number }> = [];
    let newMass = 0;
    let cx = 0,
      cy = 0,
      cz = 0;
    for (let c = 0; c < plan.count; c++) {
      if (c === plan.keeper) continue;
      const g = plan.members[c].map((i) => parts[i]);
      for (const p of g) {
        this.detachPart(p);
        newMass += p.mass;
        cx += p.centroid.x * p.mass;
        cy += p.centroid.y * p.mass;
        cz += p.centroid.z * p.mass;
        // fragments of a fractured part that break away count as broken volume
        if (p.gen > 0 && !p.counted) {
          asm.brokenVolume += p.volume;
          p.counted = true;
        }
      }
      groups.push({ parts: g, anchored: plan.anchored[c], mass: plan.mass[c] });
    }
    groups.sort((a, b) => b.mass - a.mass); // heaviest pieces get their islands first
    // the break happens now, whenever the pieces' islands get created: announce it now
    if (newMass > 0) {
      const c = this.toWorldVec(island, { x: cx / newMass, y: cy / newMass, z: cz / newMass });
      this.events.emit("split", { pos: c, mass: newMass, pieces: groups.length });
    }
    // snapshot of the parent pose/motion: deferred pieces appear where and how they broke off
    const node = island.node;
    const q = node.rotationQuaternion;
    const birth = this.nextBirth++;
    const snap = (g: { parts: Part[]; anchored: boolean; mass: number }): PendingGroup => ({
      asm,
      parts: g.parts,
      anchored: g.anchored,
      mass: g.mass,
      birth,
      birthTime: this.now,
      px: node.position.x,
      py: node.position.y,
      pz: node.position.z,
      qx: q ? q.x : 0,
      qy: q ? q.y : 0,
      qz: q ? q.z : 0,
      qw: q ? q.w : 1,
      v: vOld,
      w: wOld,
      com: comOld,
    });
    const pending = groups.map(snap);

    this.updateMetrics(island);
    if (island.isStatic && !plan.anchored[plan.keeper]) this.makeDynamic(island, false);
    else {
      if (!island.isStatic) this.reclassify(island);
      this.syncContainer(island);
    }
    if (!island.isStatic) this.setPieceVelocity(island, vOld, wOld, comOld);
    // siblings of one split start in contact: their mutual impacts are ignored briefly
    island.birth = birth;
    island.birthTime = this.now;
    this.applyKicks(island);
    this.markJointsOf(island);

    // islands for the detached pieces: now while the step's budget lasts, the rest later.
    // Anchored pieces (wall remnants) and pieces carrying features (lights, screens, water)
    // never wait.
    for (const g of pending) {
      if (g.anchored || this.canCreateIsland() || g.parts.some((p) => p.features && p.features.length)) this.realizeGroup(g);
      else {
        for (const p of g.parts) p.limbo = true;
        this.pendingGroups.push(g);
      }
    }
  }

  /** Another island may be created this step (budget left, or below the per-step minimum). */
  canCreateIsland(): boolean {
    return this.work.islands < MIN_ISLANDS_PER_STEP || !this.overBudget();
  }

  /** Create islands for deferred split pieces, oldest first, while the step's budget lasts. */
  createPendingIslands(): void {
    const q = this.pendingGroups;
    let i = 0;
    for (; i < q.length; i++) {
      if (!this.canCreateIsland()) break;
      const g = q[i];
      if (g.asm.alive) this.realizeGroup(g);
    }
    if (i > 0) q.splice(0, i);
  }

  /** Deferred break work (debug / probes): islands and pieces waiting, colliders to refine. */
  pendingWork(): { islands: number; pieces: number; refine: number } {
    let n = 0;
    for (const g of this.pendingGroups) n += g.parts.length;
    return { islands: this.pendingGroups.length, pieces: n, refine: this.refineQueue.size };
  }

  /**
   * Give a detached group its island at the pose / velocity of the split (+ fragment kicks).
   * If the engine fails, the pieces are removed (they cannot exist without a body).
   */
  private realizeGroup(g: PendingGroup): Island | null {
    const parts: Part[] = [];
    for (const p of g.parts) {
      p.limbo = false;
      if (p.alive && !p.island) parts.push(p);
    }
    if (!parts.length) return null;
    let isl: Island;
    this.beginWork();
    try {
      isl = this.createIsland(g.asm, parts, g.anchored, { p: { x: g.px, y: g.py, z: g.pz }, q: { x: g.qx, y: g.qy, z: g.qz, w: g.qw } }, false, true);
    } catch (e) {
      this.warnOnce(`island:${(e as Error).message}`, `island for ${parts.length} split piece(s) of ${g.asm.type} failed: ${(e as Error).stack ?? e}`);
      for (const p of parts) this.killPart(p, false);
      return null;
    } finally {
      this.endWork();
      this.work.islands++;
    }
    isl.birth = g.birth;
    isl.birthTime = g.birthTime;
    if (!isl.isStatic) this.setPieceVelocity(isl, g.v, g.w, g.com);
    for (const p of parts) this.hooks.partMoved(p, isl);
    this.applyKicks(isl);
    this.markJointsOf(isl);
    return isl;
  }

  /** Forget deferred pieces of an assembly being torn down. */
  private purgePending(asm: Assembly): void {
    const q = this.pendingGroups;
    let j = 0;
    for (let i = 0; i < q.length; i++) {
      if (q[i].asm === asm) {
        for (const p of q[i].parts) p.limbo = false;
      } else q[j++] = q[i];
    }
    q.length = j;
  }

  /** End of a fixed step: reset the work budget. */
  endStep(): void {
    this.workScope = 0;
    this.work.used = 0;
    this.work.islands = 0;
    this.work.refines = 0;
    this.stepIndex++;
  }

  /** Re-evaluate the collision layer of a dynamic island after its mass/extent changed. */
  reclassify(island: Island): void {
    const layer = this.classifyLayer(island);
    if (layer === island.layer) return;
    island.layer = layer;
    island.rebuildContainer = true;
    this.containerDirty.add(island);
    this.hooks.islandMotionChanged(island);
  }

  /** A static island lost its last world bond: switch to dynamic, wake, emit `split`. */
  makeDynamic(island: Island, emit = true): void {
    if (!island.isStatic || !island.body) return;
    island.isStatic = false;
    if (island.metricsDirty) this.updateMetrics(island);
    island.layer = this.classifyLayer(island);
    island.rebuildContainer = true;
    this.syncContainer(island); // new container with dynamic layers + mass
    this.physics.setMotion(island.body, "dynamic");
    this.applyMass(island);
    this.physics.wake(island.body);
    island.awake = true;
    island.sleepTime = 0;
    this.hooks.islandMotionChanged(island);
    this.markJointsOf(island);
    if (emit) this.events.emit("split", { pos: this.toWorldVec(island, island.com), mass: island.mass, pieces: 1 });
  }

  private setPieceVelocity(isl: Island, vOld: Vec3, wOld: Vec3, comOld: Vec3): void {
    if (!isl.body) return;
    const c = this.toWorldVec(isl, isl.com);
    const rx = c.x - comOld.x,
      ry = c.y - comOld.y,
      rz = c.z - comOld.z;
    tmpV.set(vOld.x + (wOld.y * rz - wOld.z * ry), vOld.y + (wOld.z * rx - wOld.x * rz), vOld.z + (wOld.x * ry - wOld.y * rx));
    tmpW.set(wOld.x, wOld.y, wOld.z);
    isl.body.setLinearVelocity(tmpV);
    isl.body.setAngularVelocity(tmpW);
  }

  /** Add the mass-weighted pending fragment kicks of the island's parts to its velocity. */
  private applyKicks(isl: Island): void {
    let kx = 0,
      ky = 0,
      kz = 0,
      km = 0;
    for (const p of isl.parts) {
      if (!p.pendingKick) continue;
      kx += p.pendingKick.x * p.mass;
      ky += p.pendingKick.y * p.mass;
      kz += p.pendingKick.z * p.mass;
      km += p.mass;
      p.pendingKick = null;
    }
    if (km <= 0 || isl.isStatic || !isl.body || isl.mass <= 0) return;
    const inv = 1 / isl.mass;
    const k = this.dirToWorldVec(isl, { x: kx * inv, y: ky * inv, z: kz * inv });
    const kl = Math.hypot(k.x, k.y, k.z);
    if (!(kl > 1e-4) || !Number.isFinite(kl)) return;
    isl.body.getLinearVelocityToRef(tmpV);
    tmpV.x += k.x;
    tmpV.y += k.y;
    tmpV.z += k.z;
    isl.body.setLinearVelocity(tmpV);
    // fracture forces are never perfectly central: a little tumble proportional to the kick
    // (kept moderate: fast-spinning thin shards tunnel through thin static parts)
    const spin = Math.min(12, (kl / Math.max(isl.extent, 0.02)) * 0.3);
    const r = this.rng.onSphere();
    isl.body.getAngularVelocityToRef(tmpW);
    tmpW.x += r.x * spin;
    tmpW.y += r.y * spin;
    tmpW.z += r.z * spin;
    isl.body.setAngularVelocity(tmpW);
    this.physics.wake(isl.body);
  }

  private markJointsOf(island: Island): void {
    for (const p of island.parts) {
      for (const b of p.bonds) if (b.group) this.hooks.jointBondsChanged(b.group);
    }
  }

  // ------------------------------------------------------------------------- disposal

  disposeIsland(island: Island): void {
    if (!island.alive) return;
    this.hooks.islandDisposing(island);
    island.alive = false;
    for (const ch of island.chunks.values()) {
      if (ch.meshes) this.render.disposeIsland(ch.meshes);
      ch.meshes = null;
    }
    island.chunks.clear();
    const container = island.container;
    if (island.body) {
      this.bodyMap.delete(island.body);
      this.physics.disposeBody(island.body);
      island.body = null;
    }
    if (container) container.dispose(); // idempotent if disposeBody released it already
    island.container = null;
    for (const p of island.childParts) p.inContainer = false;
    island.childParts.length = 0;
    island.pendingAdd.length = 0;
    island.pendingRemove.clear();
    for (const ch of island.node.getChildren()) {
      // anything still parented here belongs to a feature that should have moved it
      if (!(ch instanceof AbstractMesh)) {
        this.warnOnce("orphan", `island ${island.id}: orphaned child '${ch.name}' detached on dispose`);
        (ch as TransformNode).parent = null;
      }
    }
    island.node.dispose();
    island.asm.islands.delete(island);
    this.islands.delete(island);
    this.topoDirty.delete(island);
    this.meshDirty.delete(island);
    this.containerDirty.delete(island);
  }

  /**
   * Remove an island and all its parts (fell out of the world): bonds to other islands break
   * normally, bonds inside the island vanish silently, everything is released.
   */
  removeIsland(island: Island): void {
    if (!island.alive) return;
    const parts = island.parts.slice();
    for (const p of parts) {
      for (const b of p.bonds.slice()) {
        const o = b.other(p);
        if (o && o.island === island) continue;
        this.breakBond(b);
      }
    }
    for (const p of parts) {
      for (const b of p.bonds) {
        b.alive = false;
        b.asm.bonds.delete(b);
        const o = b.other(p);
        if (o) removeFrom(o.bonds, b);
      }
      p.bonds.length = 0;
      if (!p.counted) {
        island.asm.brokenVolume += p.volume;
        p.counted = true;
      }
    }
    // parts first (features release their lights/emitters while the node still exists)
    for (const p of parts) this.killPart(p, false);
    this.disposeIsland(island);
    this.releaseDeadShapes();
  }

  /** Remove an assembly completely (bodies, shapes, meshes, constraints, features). */
  despawn(asm: Assembly): void {
    if (!asm.alive) return;
    asm.alive = false;
    this.purgePending(asm);
    // silent teardown: no bondBreak / split events
    for (const b of asm.bonds) b.alive = false;
    asm.bonds.clear();
    for (const p of asm.parts) p.bonds.length = 0;
    for (const isl of [...asm.islands]) this.disposeIsland(isl);
    for (const p of [...asm.parts]) {
      p.island = null;
      this.killPart(p, false);
    }
    if (asm.anchorBody) {
      this.physics.disposeBody(asm.anchorBody);
      asm.anchorBody = null;
    }
    if (asm.anchorNode) {
      asm.anchorNode.dispose();
      asm.anchorNode = null;
    }
    this.assemblies.delete(asm.id);
    this.releaseDeadShapes();
  }

  // ---------------------------------------------------------------------------- meshes

  private chunkKeyOf(island: Island, p: Part): number {
    if (!island.chunked) return 0;
    const c = p.centroid;
    const ix = Math.floor(c.x / CHUNK_SIZE) + 512,
      iy = Math.floor(c.y / CHUNK_SIZE) + 512,
      iz = Math.floor(c.z / CHUNK_SIZE) + 512;
    return ((ix & 1023) * 1024 + (iy & 1023)) * 1024 + (iz & 1023);
  }

  private setupChunks(island: Island): void {
    const b = island.bounds;
    island.chunked = island.parts.length > CHUNK_MIN_PARTS && Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) > CHUNK_SIZE;
    for (const p of island.parts) this.chunkAdd(island, p);
  }

  private chunkAdd(island: Island, p: Part): void {
    const key = this.chunkKeyOf(island, p);
    let ch = island.chunks.get(key);
    if (!ch) {
      ch = new Chunk(key);
      island.chunks.set(key, ch);
    }
    ch.parts.add(p);
    p.chunkKey = key;
    ch.dirty = true;
    ch.structural = true;
    this.meshDirty.add(island);
  }

  private chunkRemove(island: Island, p: Part): void {
    const ch = island.chunks.get(p.chunkKey);
    if (!ch) return;
    ch.parts.delete(p);
    ch.dirty = true;
    ch.structural = true;
    this.meshDirty.add(island);
  }

  /** Part render geometry changed (dents, cracks, surface swap). */
  markGeom(part: Part, structural = false): void {
    part.geomDirty = true;
    const island = part.island;
    if (!island) return;
    const ch = island.chunks.get(part.chunkKey);
    if (!ch) return;
    ch.dirty = true;
    if (structural) ch.structural = true;
    this.meshDirty.add(island);
  }

  partGeom(p: Part): RenderGeom {
    if (!p.geom || p.geomDirty) {
      p.geom = polyToRenderGeom(p.poly, {
        tessCell: p.tessCell > 0 ? p.tessCell : undefined,
        dents: p.dents.length ? p.dents : undefined,
        cracks: p.cracks.length ? p.cracks : undefined,
        crackSurf: S.crack_line,
      });
      p.geomDirty = false;
    }
    return p.geom;
  }

  private rebuildChunk(island: Island, ch: Chunk): void {
    const geoms: RenderGeom[] = [];
    for (const p of ch.parts) geoms.push(this.partGeom(p));
    if (!geoms.length) {
      if (ch.meshes) this.render.disposeIsland(ch.meshes);
      ch.meshes = null;
      island.chunks.delete(ch.key);
    } else {
      ch.meshes = this.render.buildIsland(island.node, geoms, ch.meshes, `${island.asm.type}#${island.asm.id}/${island.id}/${ch.key}`);
    }
    ch.dirty = false;
    ch.structural = false;
  }

  /**
   * Rebuild dirty render chunks: structural ones always, cosmetic ones while the time budget
   * (ms) lasts. Consolidated islands keep their geometry in the debris batch.
   */
  rebuildMeshes(cosmeticBudgetMs: number): void {
    if (!this.meshDirty.size) return;
    const t0 = performance.now();
    for (const island of this.meshDirty) {
      if (!island.alive) {
        this.meshDirty.delete(island);
        continue;
      }
      if (island.consolidated && island.consolidated.inBatch) continue;
      let remaining = false;
      for (const ch of island.chunks.values()) {
        if (!ch.dirty) continue;
        if (!ch.structural && performance.now() - t0 > cosmeticBudgetMs) {
          remaining = true;
          continue;
        }
        this.rebuildChunk(island, ch);
      }
      if (!remaining) this.meshDirty.delete(island);
    }
  }

  /** Build all chunk meshes of an island now (restore from consolidation). */
  rebuildAllChunks(island: Island): void {
    for (const ch of island.chunks.values()) this.rebuildChunk(island, ch);
    this.meshDirty.delete(island);
  }

  /** Dispose all chunk meshes of an island (consolidation) but keep chunk membership. */
  disposeChunkMeshes(island: Island): void {
    for (const ch of island.chunks.values()) {
      if (ch.meshes) this.render.disposeIsland(ch.meshes);
      ch.meshes = null;
      ch.dirty = true;
      ch.structural = true;
    }
  }

  // ------------------------------------------------------------------------ hit lookup

  private candBuf: number[] = [];

  /**
   * The part of `island` hit at island-frame point `p`: the container child `childIndex` when it
   * is valid and plausible (≤ 1.5 cm from its surface), else the nearest part by signed distance
   * (spatial grid for large islands). noCollide details are never hit by collisions.
   */
  locatePart(island: Island, p: Vec3, childIndex = -1): Part | null {
    if (childIndex >= 0 && childIndex < island.childParts.length) {
      const c = island.childParts[childIndex];
      // a stale index (container edited since the query) can only point at a part this close
      if (c.alive && c.island === island && signedDistance(c.poly, p) < 0.015) return c;
    }
    const parts = island.parts;
    if (!parts.length) return null;
    const allNoCollide = !parts.some((q) => !q.noCollide);
    if (parts.length <= GRID_MIN_PARTS) return nearestOf(parts, p, allNoCollide);
    if (island.gridDirty || !island.grid) {
      island.gridParts = parts.slice();
      island.grid = new PartGrid(
        island.gridParts.map((q) => q.bounds),
        0.01,
      );
      island.gridDirty = false;
    }
    const cand = island.grid.query(p, this.candBuf, 0);
    let best = pickNearest(island.gridParts, cand, p, allNoCollide);
    if (!best) {
      island.grid.query(p, cand, 0.3);
      best = pickNearest(island.gridParts, cand, p, allNoCollide);
    }
    return best ?? nearestOf(parts, p, allNoCollide);
  }

  // ------------------------------------------------------------------------ transforms

  /** Island-frame point → world (allocates the result). */
  toWorldVec(island: Island, p: Vec3): Vec3 {
    const o = { x: 0, y: 0, z: 0 };
    nodeToWorld(island.node, p, o);
    return o;
  }

  dirToWorldVec(island: Island, d: Vec3): Vec3 {
    const o = { x: 0, y: 0, z: 0 };
    rotate(island.node.rotationQuaternion, d, o, false);
    return o;
  }

  /** World point → island frame into `out`. */
  toLocal(island: Island, p: Vec3, out: Vec3): Vec3 {
    const t = island.node.position;
    out.x = p.x - t.x;
    out.y = p.y - t.y;
    out.z = p.z - t.z;
    rotate(island.node.rotationQuaternion, out, out, true); // rotate() reads v before writing out
    return out;
  }

  dirToLocal(island: Island, d: Vec3, out: Vec3): Vec3 {
    rotate(island.node.rotationQuaternion, d, out, true);
    return out;
  }

  /** World velocity of a world point rigidly attached to the island. */
  pointVelocity(island: Island, worldP: Vec3, out: Vec3): Vec3 {
    out.x = out.y = out.z = 0;
    if (island.isStatic || !island.body) return out;
    island.body.getLinearVelocityToRef(tmpV);
    island.body.getAngularVelocityToRef(tmpW);
    const c = nodeToWorld(island.node, island.com, sCom);
    const rx = worldP.x - c.x,
      ry = worldP.y - c.y,
      rz = worldP.z - c.z;
    out.x = tmpV.x + (tmpW.y * rz - tmpW.z * ry);
    out.y = tmpV.y + (tmpW.z * rx - tmpW.x * rz);
    out.z = tmpV.z + (tmpW.x * ry - tmpW.y * rx);
    return out;
  }

  /** Linear velocity of the island's body (zero for static). */
  linearVelocity(island: Island): Vector3 {
    tmpV2.set(0, 0, 0);
    if (!island.isStatic && island.body) island.body.getLinearVelocityToRef(tmpV2);
    return tmpV2;
  }
}

// ============================================================================== helpers

function removeFrom<T>(arr: T[], x: T): void {
  const i = arr.indexOf(x);
  if (i >= 0) arr.splice(i, 1);
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function nearestOf(parts: readonly Part[], p: Vec3, includeNoCollide: boolean): Part | null {
  let best: Part | null = null;
  let bestD = Infinity;
  for (const q of parts) {
    if (q.noCollide && !includeNoCollide) continue;
    const d = signedDistance(q.poly, p);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

function pickNearest(parts: readonly Part[], idx: readonly number[], p: Vec3, includeNoCollide: boolean): Part | null {
  let best: Part | null = null;
  let bestD = Infinity;
  for (const i of idx) {
    const q = parts[i];
    if (!q.alive || (q.noCollide && !includeNoCollide)) continue;
    const d = signedDistance(q.poly, p);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best && bestD < 0.25 ? best : null;
}

/** Rotate v by q (or its inverse) into out — q may be a Babylon Quaternion (x,y,z,w). */
export function rotate(q: { x: number; y: number; z: number; w: number } | null, v: Vec3, out: Vec3, inverse: boolean): Vec3 {
  if (!q) {
    out.x = v.x;
    out.y = v.y;
    out.z = v.z;
    return out;
  }
  const qx = inverse ? -q.x : q.x,
    qy = inverse ? -q.y : q.y,
    qz = inverse ? -q.z : q.z,
    qw = q.w;
  const tx = 2 * (qy * v.z - qz * v.y);
  const ty = 2 * (qz * v.x - qx * v.z);
  const tz = 2 * (qx * v.y - qy * v.x);
  const x = v.x + qw * tx + (qy * tz - qz * ty);
  const y = v.y + qw * ty + (qz * tx - qx * tz);
  const z = v.z + qw * tz + (qx * ty - qy * tx);
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

/** Island-frame point → world using an unparented node's position + rotationQuaternion. */
export function nodeToWorld(node: TransformNode, p: Vec3, out: Vec3): Vec3 {
  rotate(node.rotationQuaternion, p, out, false);
  out.x += node.position.x;
  out.y += node.position.y;
  out.z += node.position.z;
  return out;
}

export type { IslandMeshes };
