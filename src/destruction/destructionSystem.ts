// DestructionSystem implementation — the heart of the sandbox (docs/ARCHITECTURE.md §4).
//
//   new Destruction(ctx)        uses ctx.physics, ctx.render, ctx.vfx, ctx.events, ctx.time,
//                               ctx.settings, ctx.rng, ctx.scene (ctx.audio lazily, optional,
//                               for appliance hum loops only)
//
// Per fixed step (src/core/game.ts order):
//   player.fixedUpdate   → strike()/pry()/pull()/use() are applied immediately
//   beforePhysics(dt)    → joint latches, self-closing springs, fan motors
//   physics.step         → collision reports buffered via physics.onImpact
//   afterPhysics(dt)     → impacts → damage → fracture queue (time-budgeted) → splits /
//                          static→dynamic / joints → features → debris lifecycle → meshes →
//                          damage accounting events
// Per frame: update(dt) → feature visuals (water emitters, flicker), cosmetic mesh rebuilds.
//
// Module map (src/destruction/runtime): world.ts (parts, bonds, islands, shapes, meshes,
// splitting), impacts.ts (impact/strike → damage model), fracture.ts (plan application),
// joints.ts (hinges/sliders/latches/motors), interact.ts (pry/pull/use/target), debris.ts
// (consolidation, fell-out), accounting.ts (repair bill); features/* (lights, screens, water…).

import type { PhysicsBody, Vector3 } from "@babylonjs/core";
import type { DestructionStats, DestructionSystem, GameContext, StrikeInput, StrikeResult, TargetInfo } from "../core/context.ts";
import type { Vec3, Xform } from "../geom/vec.ts";
import type { MaterialId } from "./model/materials.ts";
import type { AssemblyDef } from "./model/types.ts";
import { Layer } from "../core/context.ts";
import { Accounting } from "./runtime/accounting.ts";
import { DebrisSystem } from "./runtime/debris.ts";
import { FractureSystem, FRACTURE_BUDGET_MS } from "./runtime/fracture.ts";
import { ImpactSystem } from "./runtime/impacts.ts";
import { Interactions } from "./runtime/interact.ts";
import { JointSystem } from "./runtime/joints.ts";
import type { Assembly, Island, Part } from "./runtime/types.ts";
import { World } from "./runtime/world.ts";
import { FeatureSystem } from "./features/system.ts";
import { renderScreenFactory, type ScreenVisualFactory } from "./features/screen.ts";
import { polyPoints } from "../geom/poly.ts";
import { applyDents } from "../geom/meshgen.ts";

/** Cosmetic (dent/crack) mesh rebuild budgets (ms). */
const MESH_BUDGET_STEP = 1.5;
const MESH_BUDGET_FRAME = 2.5;
const BATCH_BUDGET = 2;

export type DestructionContext = Pick<GameContext, "physics" | "render" | "vfx" | "events" | "time" | "settings" | "rng" | "scene"> & Partial<Pick<GameContext, "audio">>;

export class Destruction implements DestructionSystem {
  readonly world: World;
  readonly impacts: ImpactSystem;
  readonly fracture: FractureSystem;
  readonly joints: JointSystem;
  readonly interact: Interactions;
  readonly debris: DebrisSystem;
  readonly features: FeatureSystem;
  readonly accounting: Accounting;
  private msLastStep = 0;
  private readonly crumpleQueue = new Set<Part>();

  constructor(ctx: DestructionContext) {
    const w = (this.world = new World({
      physics: ctx.physics,
      render: ctx.render,
      vfx: ctx.vfx,
      events: ctx.events,
      time: ctx.time,
      settings: ctx.settings,
      rng: ctx.rng,
      scene: ctx.scene,
    }));
    this.joints = new JointSystem(w);
    this.accounting = new Accounting(w);
    this.features = new FeatureSystem(w, this.joints, () => (ctx as Partial<GameContext>).audio ?? null);
    this.features.screenFactory = renderScreenFactory(ctx.scene);
    this.debris = new DebrisSystem(w, {
      hasFeatures: (isl) => this.features.hasFeatures(isl),
      fellOut: (isl, emit) => this.fellOut(isl, emit),
    });
    this.fracture = new FractureSystem(w, {
      onFracture: (old, frags, info) => this.features.onFracture(old, frags, info),
      markDamage: (p) => this.accounting.markDirty(p.asm),
      dynamicCount: () => this.debris.tracked,
    });
    this.impacts = new ImpactSystem(w, {
      enqueueFracture: (part, plan, energy, pos, dir, strike) => this.fracture.enqueue(part, plan, energy, pos, dir, strike),
      settleNow: () => {
        this.fracture.process(true);
        this.settle();
      },
      restore: (isl) => this.debris.restore(isl),
      onDamage: (part, info) => this.features.onDamage(part, info),
      markDamage: (p) => this.accounting.markDirty(p.asm),
      crumpled: (p) => this.crumpleQueue.add(p),
    });
    this.interact = new Interactions(w, {
      joints: this.joints,
      settle: () => this.settle(),
      restore: (isl) => this.debris.restore(isl),
      toggleSwitch: (p) => this.features.toggleSwitch(p),
      toggleScreen: (p) => this.features.toggleScreen(p),
      toggleFaucet: (p) => this.features.toggleFaucet(p),
      hasScreen: (p) => this.features.hasScreen(p),
      hasFaucet: (p) => this.features.hasFaucet(p),
    });
    w.hooks = {
      islandCreated: (isl) => this.debris.onIslandCreated(isl),
      islandDisposing: (isl) => {
        this.joints.detachIsland(isl);
        this.debris.onIslandDisposing(isl);
      },
      islandMotionChanged: (isl) => {
        this.debris.onIslandMotionChanged(isl);
        this.joints.markIsland(isl);
      },
      partMoved: (p, to) => this.features.onPartMoved(p, to),
      bondBroken: (b) => {
        this.joints.onBondBroken(b);
        this.features.onBondBroken(b);
        this.accounting.markDirty(b.asm);
      },
      jointBondsChanged: (g) => this.joints.markDirty(g),
      partKilled: (p, frags) => this.features.onPartKilled(p, frags),
    };
    ctx.physics.onImpact((e) => this.impacts.onRaw(e));
  }

  /** Plug the render module's screen visuals in (see features/screen.ts). */
  setScreenFactory(f: ScreenVisualFactory | null): void {
    this.features.screenFactory = f;
  }

  // ============================================================================= spawn

  /**
   * Spawn an assembly. An engine failure part-way releases everything already created for it
   * (bodies, shapes, meshes, constraints, features) and rethrows — nothing half-built stays.
   */
  spawn(def: AssemblyDef, xf: Xform): number {
    const asm = this.world.spawn(def, xf); // rolls itself back on failure
    try {
      this.accounting.register(asm);
      this.joints.register(asm);
      this.joints.refreshDirty();
      this.features.attach(asm);
      this.world.rebuildMeshes(0);
    } catch (e) {
      this.despawn(asm.id);
      throw e;
    }
    return asm.id;
  }

  /** Remove an assembly and release every engine resource it holds. */
  despawn(id: number): boolean {
    const asm = this.world.assemblies.get(id);
    if (!asm) return false;
    this.features.disposeAssembly(asm);
    for (const g of asm.groups.values()) this.joints.removeGroup(g);
    this.accounting.unregister(asm);
    this.world.despawn(asm);
    this.fracture.purge();
    for (const p of [...this.crumpleQueue]) if (!p.alive) this.crumpleQueue.delete(p);
    this.debris.rebuildBatches(0); // drop its consolidated geometry now (may run outside a step)
    return true;
  }

  /** Remove everything (tests / level reload). */
  dispose(): void {
    for (const id of [...this.world.assemblies.keys()]) this.despawn(id);
    this.debris.dispose();
  }

  // ===================================================================== interactions

  strike(s: StrikeInput): StrikeResult {
    try {
      return this.impacts.strike(s);
    } catch (e) {
      this.world.warnOnce(`strike:${(e as Error).message}`, `strike failed: ${(e as Error).stack ?? e}`);
      return { energy: 0, impulse: 0, hardness: 0.5, targetMat: null, partName: null, assemblyName: null, broke: false };
    }
  }

  pry(body: PhysicsBody, point: Vector3, dir: Vector3, force: number, dt: number): number {
    return this.guard("pry", 0, () => this.interact.pry(body, point, dir, force, dt));
  }

  pull(body: PhysicsBody, point: Vector3, force: Vector3, dt: number): void {
    this.guard("pull", undefined, () => this.interact.pull(body, point, force, dt));
  }

  use(body: PhysicsBody, point: Vector3, from: Vector3): boolean {
    return this.guard("use", false, () => this.interact.use(body, point, from));
  }

  target(body: PhysicsBody, point: Vector3, childIndex: number): TargetInfo | null {
    return this.guard("target", null, () => this.interact.target(body, point, childIndex));
  }

  massOf(body: PhysicsBody): number | null {
    return this.interact.massOf(body);
  }

  isStatic(body: PhysicsBody): boolean {
    return this.interact.isStatic(body);
  }

  materialAt(body: PhysicsBody, point: Vector3, childIndex: number): MaterialId | null {
    return this.guard("materialAt", null, () => this.interact.materialAt(body, point, childIndex));
  }

  private guard<T>(name: string, fallback: T, fn: () => T): T {
    try {
      return fn();
    } catch (e) {
      this.world.warnOnce(`${name}:${(e as Error).message}`, `${name} failed: ${(e as Error).stack ?? e}`);
      return fallback;
    }
  }

  // ============================================================================ ticks

  /** Splits, static→dynamic transitions, container syncs, joint re-creation. */
  private settle(): void {
    this.world.flushTopology();
    this.joints.refreshDirty();
  }

  beforePhysics(dt: number): void {
    try {
      this.joints.beforePhysics(dt);
    } catch (e) {
      this.world.warnOnce(`before:${(e as Error).message}`, `beforePhysics failed: ${(e as Error).stack ?? e}`);
    }
  }

  afterPhysics(dt: number): void {
    const t0 = performance.now();
    const w = this.world;
    try {
      this.impacts.process();
      this.joints.jointLoads(dt);
      // break work under the shared step budget: islands of pieces that broke off in earlier
      // steps first (they are invisible until created), then queued fractures, then splits
      w.createPendingIslands();
      this.fracture.process(true);
      this.settle();
      this.refreshCrumpled();
      this.features.fixedUpdate(dt);
      this.debris.fixedUpdate();
      w.refineShapes(); // leftover budget: stand-in boxes → hulls
      this.settle();
      w.rebuildMeshes(MESH_BUDGET_STEP);
      this.debris.rebuildBatches(BATCH_BUDGET);
      this.accounting.update();
    } catch (e) {
      w.warnOnce(`after:${(e as Error).message}`, `afterPhysics failed: ${(e as Error).stack ?? e}`);
    }
    w.endStep();
    this.msLastStep = performance.now() - t0;
  }

  update(dt: number): void {
    try {
      this.features.update(dt);
      this.world.rebuildMeshes(MESH_BUDGET_FRAME);
      this.debris.rebuildBatches(BATCH_BUDGET);
    } catch (e) {
      this.world.warnOnce(`update:${(e as Error).message}`, `update failed: ${(e as Error).stack ?? e}`);
    }
  }

  /** Big global bends: refresh the collider from the dented vertices (rate-limited per part). */
  private refreshCrumpled(): void {
    if (!this.crumpleQueue.size) return;
    const now = this.world.now;
    for (const p of [...this.crumpleQueue]) {
      if (!p.alive || !p.island) {
        this.crumpleQueue.delete(p);
        continue;
      }
      if (now - p.colliderTime < 0.5) continue;
      this.crumpleQueue.delete(p);
      p.colliderTime = now;
      if (!p.dents.length) continue;
      const pts = polyPoints(p.poly);
      applyDents(pts, p.dents);
      this.world.refreshCollider(p, pts);
    }
  }

  // ============================================================================ stats

  stats(): DestructionStats {
    let dyn = 0,
      debris = 0;
    for (const isl of this.world.islands) {
      if (isl.isStatic) continue;
      dyn++;
      if (isl.layer === Layer.DEBRIS) debris++;
    }
    return {
      assemblies: this.world.assemblies.size,
      islands: this.world.islands.size,
      dynamicIslands: dyn,
      parts: this.world.partCount,
      fractures: this.world.fractures,
      bondsBroken: this.world.bondsBroken,
      debrisIslands: debris,
      consolidated: this.debris.consolidated,
      valueDestroyed: this.accounting.valueDestroyed,
      totalValue: this.accounting.totalValue,
      msLastStep: this.msLastStep,
    };
  }

  list(): Array<{ id: number; type: string; name: string; damage: number; islands: number; parts: number; pos: Vec3 }> {
    const out = [];
    for (const asm of this.world.assemblies.values()) {
      out.push({ id: asm.id, type: asm.type, name: asm.name, damage: asm.fraction, islands: asm.islands.size, parts: asm.parts.size, pos: this.positionOf(asm.id) ?? { ...asm.xf.p } });
    }
    return out;
  }

  /** World centre of mass of an assembly's first (original) island. */
  positionOf(id: number): Vec3 | null {
    const asm = this.world.assemblies.get(id);
    if (!asm) return null;
    const isl = firstIsland(asm);
    if (!isl) return null;
    if (isl.metricsDirty) this.world.updateMetrics(isl);
    return this.world.toWorldVec(isl, isl.com);
  }

  /** Assembly by id (debug/tests). */
  assembly(id: number): Assembly | undefined {
    return this.world.assemblies.get(id);
  }

  get fractureBudgetMs(): number {
    return this.fracture.budgetMs;
  }

  set fractureBudgetMs(v: number) {
    this.fracture.budgetMs = Number.isFinite(v) && v > 0 ? v : FRACTURE_BUDGET_MS;
  }

  /**
   * The fell-out handler: event (only for a real fall — a non-finite body is dropped silently,
   * it has no position to report), feature cleanup, full release.
   */
  private fellOut(isl: Island, emit: boolean): void {
    const w = this.world;
    if (!isl.alive) return;
    const pos = w.toWorldVec(isl, isl.com);
    if (emit && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)) {
      let main: Part | null = null;
      for (const p of isl.parts) if (!main || p.mass > main.mass) main = p;
      w.events.emit("fellOut", { pos, mass: isl.mass, mat: main ? main.matId : "plastic" });
    }
    w.removeIsland(isl);
    this.accounting.markDirty(isl.asm);
    this.joints.refreshDirty();
  }
}

function firstIsland(asm: Assembly): Island | null {
  let best: Island | null = null;
  for (const isl of asm.islands) if (!best || isl.id < best.id) best = isl;
  return best;
}
