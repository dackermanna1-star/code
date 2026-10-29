// Feature registry and dispatcher: creates feature instances for spawned assemblies, routes
// part events (damage, fracture, bond breaks, island changes, removal) to the features of the
// affected part, re-binds features to the surviving fragment after a fracture, owns the global
// mains power state and the room light switches.

import type { AudioSystem } from "../../core/context.ts";
import type { Vec3 } from "../../geom/vec.ts";
import type { FeatureDef } from "../model/types.ts";
import type { JointSystem } from "../runtime/joints.ts";
import type { Assembly, Bond, Island, Part } from "../runtime/types.ts";
import type { World } from "../runtime/world.ts";
import { AlarmFeature, LiquidFeature, PowerFeature, SoilFeature, SparksFeature, StuffingFeature } from "./effects.ts";
import type { DamageInfo, FractureInfo, PartFeature } from "./feature.ts";
import { LightFeature } from "./light.ts";
import { HumFeature, MotorFeature } from "./motor.ts";
import { ScreenFeature, type ScreenVisualFactory } from "./screen.ts";
import { WaterFeature } from "./water.ts";

export class FeatureSystem {
  readonly w: World;
  readonly joints: JointSystem;
  readonly all = new Set<PartFeature>();
  /** Features with per-step / per-frame work. */
  private readonly active = new Set<PartFeature>();
  /** Features whose assembly lost bonds since the last fixed step (see onAsmBondsBroken). */
  private readonly connectivity = new Set<PartFeature>();
  powered = true;
  screenFactory: ScreenVisualFactory | null = null;
  private readonly audioGetter: () => AudioSystem | null;

  constructor(w: World, joints: JointSystem, audio: () => AudioSystem | null) {
    this.w = w;
    this.joints = joints;
    this.audioGetter = audio;
  }

  audio(): AudioSystem | null {
    try {
      return this.audioGetter();
    } catch {
      return null;
    }
  }

  activate(f: PartFeature): void {
    this.active.add(f);
  }

  deactivate(f: PartFeature): void {
    this.active.delete(f);
  }

  get activeCount(): number {
    return this.active.size;
  }

  // ------------------------------------------------------------------ lifecycle

  attach(asm: Assembly): void {
    for (const def of asm.def.features ?? []) {
      const part = asm.byName.get((def as { part: string }).part);
      if (!part) {
        this.w.warnOnce(`feat:${asm.type}:${def.type}`, `${asm.type}: ${def.type} feature references unknown part '${(def as { part: string }).part}'`);
        continue;
      }
      let f: PartFeature | null = null;
      try {
        f = this.create(asm, def, part);
      } catch (e) {
        this.w.warnOnce(`featc:${asm.type}:${def.type}`, `${asm.type}: ${def.type} feature failed: ${(e as Error).message}`);
      }
      if (!f) continue;
      this.bind(f, part);
      asm.features.push(f);
      this.all.add(f);
    }
  }

  private create(asm: Assembly, def: FeatureDef, part: Part): PartFeature | null {
    switch (def.type) {
      case "light":
        return new LightFeature(this, asm, def, part);
      case "screen":
        return new ScreenFeature(this, asm, def, part);
      case "water":
        return new WaterFeature(this, asm, def, part);
      case "sparks":
        return new SparksFeature(this, asm, def, part);
      case "power":
        return new PowerFeature(this, asm, def, part);
      case "stuffing":
        return new StuffingFeature(this, asm, def, part);
      case "liquid":
        return new LiquidFeature(this, asm, def, part);
      case "soil":
        return new SoilFeature(this, asm, def, part);
      case "motor":
        return new MotorFeature(this, asm, def, part);
      case "hum":
        return new HumFeature(this, asm, def, part);
      case "alarm":
        return new AlarmFeature(this, asm, def, part);
      default:
        return null;
    }
  }

  private bind(f: PartFeature, part: Part | null): void {
    const old = f.part;
    if (old && old.features) {
      const i = old.features.indexOf(f);
      if (i >= 0) old.features.splice(i, 1);
      if (!old.features.length) old.features = null;
    }
    f.part = part;
    if (part) (part.features ??= []).push(f);
  }

  disposeAssembly(asm: Assembly): void {
    for (const f of asm.features) {
      try {
        f.dispose();
      } catch (e) {
        this.w.warnOnce("featd", `feature dispose failed: ${(e as Error).message}`);
      }
      this.bind(f, null);
      this.all.delete(f);
      this.active.delete(f);
      this.connectivity.delete(f);
    }
    asm.features.length = 0;
  }

  hasFeatures(island: Island): boolean {
    for (const p of island.parts) if (p.features && p.features.length) return true;
    return false;
  }

  /**
   * Must this island keep its own meshes (no cell-batch consolidation)? Hosts of animated
   * features: motors (spinning rotors) and screens. Lights only swap surfaces (a mesh rebuild,
   * which restores a consolidated island) and the other features only emit effects/sounds.
   */
  pinsMeshes(island: Island): boolean {
    for (const p of island.parts) {
      const fs = p.features;
      if (!fs) continue;
      for (const f of fs) if (f.def.type === "motor" || f.def.type === "screen") return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- part events

  onDamage(part: Part, info: Omit<DamageInfo, "part">): void {
    const fs = part.features;
    if (!fs) return;
    const ev: DamageInfo = { part, ...info };
    for (const f of fs.slice()) safe(this.w, () => f.onDamage?.(ev));
  }

  /** Host fractured: notify, then re-bind each feature to the fragment that carries it on. */
  onFracture(old: Part, fragments: Part[], info: FractureInfo): void {
    const fs = old.features;
    if (!fs) return;
    for (const f of fs.slice()) {
      safe(this.w, () => f.onFracture?.(old, fragments, info));
      const anchor = (f as { local?: Vec3 }).local ?? old.centroid;
      this.bind(f, successor(fragments, anchor));
    }
  }

  onBondBroken(bond: Bond): void {
    for (const p of [bond.a, bond.b]) {
      if (!p || !p.features) continue;
      for (const f of p.features.slice()) safe(this.w, () => f.onBondBroken?.(bond, p));
    }
    const all = bond.asm.features;
    for (let i = 0; i < all.length; i++) if (all[i].onAsmBondsBroken) this.connectivity.add(all[i]);
  }

  onPartMoved(part: Part, island: Island): void {
    if (!part.features) return;
    for (const f of part.features.slice()) safe(this.w, () => f.onIslandChanged?.(part, island));
  }

  onPartKilled(part: Part, fragments: boolean): void {
    if (fragments || !part.features) return; // fracture is handled by onFracture
    for (const f of part.features.slice()) {
      safe(this.w, () => f.onPartKilled?.(part));
      this.bind(f, null);
    }
  }

  // ----------------------------------------------------------------- power & use

  setPower(on: boolean, pos: Vec3 | null = null): void {
    if (this.powered === on) return;
    this.powered = on;
    this.w.render.setPower(on);
    this.w.events.emit("feature", { kind: on ? "powerOn" : "powerOut", pos: pos ?? { x: 0, y: 1.5, z: 0 }, intensity: 1 });
    for (const f of this.all) safe(this.w, () => f.onPower?.(on));
  }

  /** `switch:<roomId>` part: toggle every light of that room (all on if any is off). */
  toggleSwitch(part: Part): boolean {
    const tag = part.tags.find((t) => t.startsWith("switch:"));
    if (!tag) return false;
    const room = tag.slice(7);
    const lights: LightFeature[] = [];
    for (const f of this.all) if (f instanceof LightFeature && f.alive && f.room === room) lights.push(f);
    // the switch itself must be wired: a smashed switch does nothing
    if (!part.alive || part.bonds.length === 0) return false;
    if (!lights.length) return true; // click, nothing happens (no fixture or all broken)
    const anyOn = lights.some((l) => l.on);
    for (const l of lights) {
      if (l.on === anyOn) l.toggle();
    }
    return true;
  }

  private screenOf(part: Part): ScreenFeature | null {
    const isl = part.island;
    for (const f of part.features ?? []) if (f instanceof ScreenFeature) return f;
    if (isl) for (const p of isl.parts) for (const f of p.features ?? []) if (f instanceof ScreenFeature) return f;
    return null;
  }

  private faucetOf(part: Part): WaterFeature | null {
    for (const f of part.features ?? []) if (f instanceof WaterFeature && isFaucetPart(part)) return f;
    return null;
  }

  hasScreen(part: Part): boolean {
    const s = this.screenOf(part);
    return !!s && !s.dead;
  }

  hasFaucet(part: Part): boolean {
    return !!this.faucetOf(part);
  }

  toggleScreen(part: Part): boolean {
    return this.screenOf(part)?.toggle() ?? false;
  }

  toggleFaucet(part: Part): boolean {
    return this.faucetOf(part)?.toggleFaucet() ?? false;
  }

  // ---------------------------------------------------------------------- ticks

  // Set iteration tolerates features (de)activating themselves while being ticked.
  fixedUpdate(dt: number): void {
    if (this.connectivity.size) {
      for (const f of this.connectivity) if (f.part || f.asm.alive) safe(this.w, () => f.onAsmBondsBroken!());
      this.connectivity.clear();
    }
    if (!this.active.size) return;
    for (const f of this.active) {
      if (!f.fixedUpdate) continue;
      try {
        f.fixedUpdate(dt);
      } catch (e) {
        this.w.warnOnce(`feature:${(e as Error).message}`, `feature tick failed: ${(e as Error).stack ?? e}`);
      }
    }
  }

  update(dt: number): void {
    if (!this.active.size) return;
    for (const f of this.active) {
      if (!f.update) continue;
      try {
        f.update(dt);
      } catch (e) {
        this.w.warnOnce(`feature:${(e as Error).message}`, `feature update failed: ${(e as Error).stack ?? e}`);
      }
    }
  }
}

/** Faucets are water features on parts tagged "faucet" (or named like one). */
export function isFaucetPart(part: Part): boolean {
  return part.hasTag("faucet") || /faucet|tap|spout|mixer/i.test(part.name);
}

/** Fragment that inherits a feature: nearest to its anchor, preferring still-bonded ones. */
function successor(fragments: Part[], anchor: Vec3): Part | null {
  let best: Part | null = null;
  let bestD = Infinity;
  for (const p of fragments) {
    if (!p.alive) continue;
    const d = (p.centroid.x - anchor.x) ** 2 + (p.centroid.y - anchor.y) ** 2 + (p.centroid.z - anchor.z) ** 2;
    const score = d * (p.bonds.length ? 1 : 3);
    if (score < bestD) {
      bestD = score;
      best = p;
    }
  }
  return best;
}

function safe(w: World, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    w.warnOnce(`feature:${(e as Error).message}`, `feature handler failed: ${(e as Error).stack ?? e}`);
  }
}
