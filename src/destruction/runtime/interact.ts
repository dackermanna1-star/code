// Player interaction APIs on destructible bodies: crowbar prying, sustained pulling (rip doors
// off hinges, tear things off walls), the use key (doors, drawers, switches, TVs, faucets) and
// target/material queries for the HUD, footsteps and tools.
//
// Bond loading model for pry/pull (energy-based like every bond):
//   pry : the bonds within PRY_RADIUS of the crowbar tip take leverage damage at a rate
//         force × PRY_RATE (J/s per N), concentrated on the nearest bond (w ∝ 1/(d+2 cm)²),
//         times the damage model's bond-kind factor;
//   pull: the force component the joints/anchors must resist (the free swing/slide direction
//         of an unlatched joint within its limits costs nothing) is shared among the resisting
//         bonds by proximity; each bond yields above its elastic holding force
//         F_hold = HOLD_N_PER_J × strength and is damaged at (F_b − F_hold) × PULL_CREEP.

import { Vector3, type PhysicsBody } from "@babylonjs/core";
import type { TargetInfo } from "../../core/context.ts";
import type { Vec3 } from "../../geom/vec.ts";
import { bondKindFactor } from "../model/damage.ts";
import type { MaterialId } from "../model/materials.ts";
import type { BondKind } from "../model/types.ts";
import type { JointSystem } from "./joints.ts";
import type { Bond, Island, JointGroup, Part } from "./types.ts";
import type { World } from "./world.ts";

export const PRY_RADIUS = 0.15;
/** Pry damage rate per newton of lever force (J/s/N): 3000 N crowbar ≈ 36 J/s. */
export const PRY_RATE = 0.012;
/** Elastic holding force of a bond per joule of strength (N/J). */
export const HOLD_N_PER_J = 1.2;
/**
 * Creep speed converting excess force into bond damage (J/s per N, before the damage model's
 * bond-kind factor): yanking a door past its stop (≈ 450 N) tears its nearest 90 J hinge out
 * in ≈ 4 s, a 40 J latch in under a second.
 */
export const PULL_CREEP = 0.3;
/** Pulls weaker than this (N) do nothing (casual handling). */
const PULL_MIN_FORCE = 40;
const STRAIN_INTERVAL = 0.12;
const MAX_ANCHOR_BONDS = 8;

export interface InteractDeps {
  joints: JointSystem;
  settle(): void;
  restore(island: Island): void;
  /** Toggle room lights from a `switch:<roomId>` part. Returns true if anything toggled. */
  toggleSwitch(part: Part): boolean;
  /** Screen / faucet features on the part or its island. */
  toggleScreen(part: Part): boolean;
  toggleFaucet(part: Part): boolean;
  hasScreen(part: Part): boolean;
  hasFaucet(part: Part): boolean;
}

const tmpI = new Vector3();
const tmpP = new Vector3();

export class Interactions {
  private readonly w: World;
  private readonly deps: InteractDeps;
  private lastStrain = -1;
  private readonly lp: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(w: World, deps: InteractDeps) {
    this.w = w;
    this.deps = deps;
  }

  private island(body: PhysicsBody): Island | null {
    const isl = this.w.islandOf(body);
    if (!isl || !isl.alive) return null;
    if (isl.consolidated) this.deps.restore(isl);
    return isl;
  }

  private partAt(isl: Island, point: Vec3, childIndex = -1): Part | null {
    return this.w.locatePart(isl, this.w.toLocal(isl, point, this.lp), childIndex);
  }

  // ======================================================================== queries

  massOf(body: PhysicsBody): number | null {
    const isl = this.w.islandOf(body);
    return isl && isl.alive ? isl.mass : null;
  }

  isStatic(body: PhysicsBody): boolean {
    const isl = this.w.islandOf(body);
    return !!isl && isl.alive && isl.isStatic;
  }

  materialAt(body: PhysicsBody, point: Vector3, childIndex: number): MaterialId | null {
    const isl = this.w.islandOf(body);
    if (!isl || !isl.alive) return null;
    const p = this.w.locatePart(isl, this.w.toLocal(isl, point, this.lp), childIndex);
    return p ? p.matId : null;
  }

  target(body: PhysicsBody, point: Vector3, childIndex: number): TargetInfo | null {
    const isl = this.w.islandOf(body);
    if (!isl || !isl.alive) return null;
    const p = this.w.locatePart(isl, this.w.toLocal(isl, point, this.lp), childIndex);
    if (!p) return null;
    const asm = isl.asm;
    let usable: TargetInfo["usable"] = null;
    const g = this.deps.joints.movingGroupOf(isl);
    if (p.tags.some((t) => t.startsWith("switch:"))) usable = "switch";
    else if (this.deps.hasScreen(p)) usable = "tv";
    else if (this.deps.hasFaucet(p)) usable = "faucet";
    else if (g) usable = g.kind === "hinge" ? "door" : "drawer";
    const structural = p.mat.id === "concrete" || p.mat.id === "stone";
    const grabbable = !isl.isStatic || (!structural && p.bonds.length > 0 && p.mass < 400);
    return {
      assemblyId: asm.id,
      assemblyType: asm.type,
      assemblyName: asm.name,
      partName: p.name,
      mat: p.matId,
      damage: asm.fraction,
      mass: isl.mass,
      isStatic: isl.isStatic,
      grabbable,
      usable,
    };
  }

  // ============================================================================ pry

  pry(body: PhysicsBody, point: Vector3, dir: Vector3, force: number, dt: number): number {
    const isl = this.island(body);
    if (!isl || !(force > 0) || !(dt > 0)) return 0;
    const w = this.w;
    const lp = w.toLocal(isl, point, { x: 0, y: 0, z: 0 });
    // candidate bonds: every live bond of parts near the tip whose anchor is within reach
    const cands: Array<{ b: Bond; d: number }> = [];
    const seen = new Set<Bond>();
    for (const p of isl.parts) {
      const bb = p.bounds;
      if (lp.x < bb.min.x - PRY_RADIUS || lp.x > bb.max.x + PRY_RADIUS || lp.y < bb.min.y - PRY_RADIUS || lp.y > bb.max.y + PRY_RADIUS || lp.z < bb.min.z - PRY_RADIUS || lp.z > bb.max.z + PRY_RADIUS) continue;
      for (const b of p.bonds) {
        if (!b.alive || seen.has(b)) continue;
        seen.add(b);
        const d = Math.hypot(b.anchor.x - lp.x, b.anchor.y - lp.y, b.anchor.z - lp.z);
        if (d <= PRY_RADIUS) cands.push({ b, d });
      }
    }
    if (!cands.length) return 0;
    cands.sort((a, b) => a.d - b.d);
    let wsum = 0;
    const wts = cands.map((c) => {
      const x = 1 / (c.d + 0.02) ** 2;
      wsum += x;
      return x;
    });
    const total = force * PRY_RATE * dt;
    let stress = 0;
    let broke: Bond | null = null;
    let brokePart: Part | null = null;
    for (let i = 0; i < cands.length; i++) {
      const b = cands[i].b;
      const amount = total * (wts[i] / wsum) * kindFactor(b.kind);
      const sideOf = b.a.island === isl ? b.a : b.b && b.b.island === isl ? b.b : b.a;
      const other = b.other(sideOf);
      if (w.damageBond(b, amount)) {
        stress = 1;
        if (!broke) {
          broke = b;
          // the part that pops is the one on the weaker / unanchored side
          brokePart = other && other.island && !other.island.isStatic ? other : sideOf;
        }
      } else stress = Math.max(stress, 1 - b.health / b.max);
    }
    this.strain(point, stress, cands[0].b);
    if (broke) {
      this.deps.settle();
      // pop the freed piece a little along the pry direction
      const p = brokePart;
      if (p && p.island && !p.island.isStatic && p.island.body) {
        const J = Math.min(25, p.island.mass * 0.8);
        const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
        tmpI.set((dir.x / dl) * J, (dir.y / dl) * J, (dir.z / dl) * J);
        tmpP.set(point.x, point.y, point.z);
        p.island.body.applyImpulse(tmpI, tmpP);
        w.physics.wake(p.island.body);
      }
    }
    return Math.min(1, Math.max(0, stress));
  }

  private strain(pos: Vec3, stress: number, b: Bond): void {
    const now = this.w.now;
    if (now - this.lastStrain < STRAIN_INTERVAL || stress <= 0) return;
    this.lastStrain = now;
    this.w.events.emit("strain", { pos: { x: pos.x, y: pos.y, z: pos.z }, stress: Math.min(1, stress), kind: b.kind, mat: b.a.matId });
  }

  // =========================================================================== pull

  pull(body: PhysicsBody, point: Vector3, force: Vector3, dt: number): void {
    const isl = this.island(body);
    if (!isl || !(dt > 0)) return;
    const F = { x: force.x, y: force.y, z: force.z };
    const fmag = Math.hypot(F.x, F.y, F.z);
    if (!(fmag >= PULL_MIN_FORCE) || !Number.isFinite(fmag)) return;
    const w = this.w;
    const lp = w.toLocal(isl, point, { x: 0, y: 0, z: 0 });
    const loads: Array<{ b: Bond; f: number }> = [];
    if (isl.isStatic) {
      const part = this.partAt(isl, point);
      if (!part) return;
      // (a) the grabbed part's own bonds hold it to the rest; (b) the island's anchors hold it all
      this.share(loads, part.bonds.filter((b) => b.alive), lp, fmag);
      if (part.bonds.every((b) => !b.world)) {
        const anchors = this.nearestWorldBonds(isl, lp, MAX_ANCHOR_BONDS);
        this.share(loads, anchors, lp, fmag);
      }
    } else {
      // dynamic: only joints hold it — find groups where this island is the moving side
      const groups = new Set<JointGroup>();
      for (const p of isl.parts) for (const b of p.bonds) if (b.group && b.alive && b.a.island === isl) groups.add(b.group);
      for (const g of groups) {
        const jc = g.constraints.find((c) => c.moving === isl);
        if (!jc) continue;
        const { axis, pivot } = this.deps.joints.worldAxis(g, jc);
        let resisted = { ...F };
        let toLatch = 0;
        if (g.kind === "hinge" && jc.kind !== "ball") {
          const r = { x: point.x - pivot.x, y: point.y - pivot.y, z: point.z - pivot.z };
          const t = cross(axis, r);
          const tl = Math.hypot(t.x, t.y, t.z);
          if (tl > 1e-4) {
            const th = { x: t.x / tl, y: t.y / tl, z: t.z / tl };
            const ft = F.x * th.x + F.y * th.y + F.z * th.z; // + opens towards +θ
            const theta = this.deps.joints.coordinate(g) ?? 0;
            const lo = Number.isFinite(g.def.min) ? g.def.min : -Infinity,
              hi = Number.isFinite(g.def.max) ? g.def.max : Infinity;
            const atLimit = (ft > 0 && theta >= hi - 0.035) || (ft < 0 && theta <= lo + 0.035);
            const latched = jc.latched && g.latchIntact;
            if (latched) toLatch = Math.abs(ft);
            if (latched || !atLimit) {
              // tangential component is free (or taken by the latch), not by the hinges
              resisted = { x: F.x - ft * th.x, y: F.y - ft * th.y, z: F.z - ft * th.z };
            }
          }
        } else if (g.kind === "slider") {
          const fa = F.x * axis.x + F.y * axis.y + F.z * axis.z;
          const s = this.deps.joints.coordinate(g) ?? 0;
          const lo = Number.isFinite(g.def.min) ? g.def.min : -Infinity,
            hi = Number.isFinite(g.def.max) ? g.def.max : Infinity;
          const atLimit = (fa > 0 && s >= hi - 0.01) || (fa < 0 && s <= lo + 0.01);
          const latched = jc.latched && g.latchIntact;
          if (latched) toLatch = Math.abs(fa);
          if (latched || !atLimit) resisted = { x: F.x - fa * axis.x, y: F.y - fa * axis.y, z: F.z - fa * axis.z };
        }
        const rmag = Math.hypot(resisted.x, resisted.y, resisted.z);
        this.share(
          loads,
          jc.bonds.filter((b) => b.alive),
          lp,
          rmag,
        );
        if (toLatch > 0 && g.latch && g.latch.alive) loads.push({ b: g.latch, f: toLatch });
      }
    }
    if (!loads.length) return;
    let stress = 0;
    let broke = false;
    let worst: Bond | null = null;
    for (const { b, f } of loads) {
      if (!b.alive) continue;
      const hold = HOLD_N_PER_J * b.max;
      const excess = f - hold;
      if (excess <= 0) continue;
      const amount = excess * PULL_CREEP * dt * kindFactor(b.kind);
      if (w.damageBond(b, amount)) broke = true;
      const s = b.alive ? 1 - b.health / b.max : 1;
      if (s >= stress) {
        stress = s;
        worst = b;
      }
    }
    if (worst) this.strain(point, Math.max(stress, 0.05), worst);
    if (broke) this.deps.settle();
  }

  /** Distribute `force` over bonds by proximity to the grab point (w ∝ 1/(d + 10 cm)²). */
  private share(out: Array<{ b: Bond; f: number }>, bonds: Bond[], lp: Vec3, force: number): void {
    if (!bonds.length || !(force > 0)) return;
    let wsum = 0;
    const wts = bonds.map((b) => {
      const d = Math.hypot(b.anchor.x - lp.x, b.anchor.y - lp.y, b.anchor.z - lp.z);
      const x = 1 / (d + 0.1) ** 2;
      wsum += x;
      return x;
    });
    for (let i = 0; i < bonds.length; i++) out.push({ b: bonds[i], f: (force * wts[i]) / wsum });
  }

  private nearestWorldBonds(isl: Island, lp: Vec3, k: number): Bond[] {
    const list: Array<{ b: Bond; d: number }> = [];
    for (const p of isl.parts) {
      for (const b of p.bonds) {
        if (!b.alive || !b.world || !b.rigid) continue;
        list.push({ b, d: (b.anchor.x - lp.x) ** 2 + (b.anchor.y - lp.y) ** 2 + (b.anchor.z - lp.z) ** 2 });
      }
    }
    list.sort((a, b) => a.d - b.d);
    return list.slice(0, k).map((x) => x.b);
  }

  // ============================================================================ use

  use(body: PhysicsBody, point: Vector3, from: Vector3): boolean {
    const isl = this.island(body);
    if (!isl) return false;
    const part = this.partAt(isl, point);
    if (!part) return false;
    if (part.tags.some((t) => t.startsWith("switch:"))) return this.deps.toggleSwitch(part);
    if (this.deps.hasScreen(part)) return this.deps.toggleScreen(part);
    if (this.deps.hasFaucet(part)) return this.deps.toggleFaucet(part);
    const g = this.deps.joints.movingGroupOf(isl);
    if (g) return this.deps.joints.use(g, isl, { x: point.x, y: point.y, z: point.z }, { x: from.x, y: from.y, z: from.z });
    return false;
  }
}

function kindFactor(kind: BondKind): number {
  try {
    const k = bondKindFactor(kind);
    return Number.isFinite(k) && k > 0 ? k : 1;
  } catch {
    return 1;
  }
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
