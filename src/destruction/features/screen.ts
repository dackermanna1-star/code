// `screen` feature: TV / monitor / laptop / phone / microwave display. State machine:
// on ↔ off (use key), cracked (glitching) once the panel is cracked or heavily jolted, dead once
// it is broken or ripped out. The visual is created through a pluggable factory (default:
// src/render/screens.ts createScreen, an emissive dynamic-texture quad on the part's front
// face, parented to the island node); mains power is handled by the render module.

import type { Scene } from "@babylonjs/core";
import { createScreen } from "../../render/screens.ts";
import type { FeatureDef } from "../model/types.ts";
import type { Assembly, Bond, Island, Part } from "../runtime/types.ts";
import { BaseFeature } from "./base.ts";
import type { DamageInfo } from "./feature.ts";
import type { FeatureSystem } from "./system.ts";

type ScreenDef = Extract<FeatureDef, { type: "screen" }>;
export type ScreenState = "on" | "off" | "cracked" | "dead";

export interface ScreenVisual {
  setState(s: ScreenState): void;
  /** Re-parent to another island node after a split (placement is in the shared frame). */
  setIsland(island: Island): void;
  dispose(): void;
}

export type ScreenVisualFactory = (args: { part: Part; island: Island; kind: ScreenDef["content"]; state: ScreenState; mains: boolean; seed: number }) => ScreenVisual | null;

/** Default factory: render-core's emissive screens (src/render/screens.ts). */
export function renderScreenFactory(scene: Scene): ScreenVisualFactory {
  return ({ part, island, kind, state, mains, seed }) => {
    const h = createScreen(scene, { parent: island.node, poly: part.poly }, kind, { state, mains, seed });
    return {
      setState: (s) => h.setState(s),
      setIsland: (isl) => h.setParent(isl.node),
      dispose: () => h.dispose(),
    };
  };
}

export class ScreenFeature extends BaseFeature {
  declare readonly def: ScreenDef;
  on: boolean;
  cracked = false;
  dead = false;
  private visual: ScreenVisual | null = null;
  private shown: ScreenState | null = null;

  constructor(fs: FeatureSystem, asm: Assembly, def: FeatureDef, part: Part) {
    super(fs, asm, def, part);
    this.on = (def as ScreenDef).on !== false;
    this.build();
  }

  /** Battery devices keep working without mains power. */
  override get mains(): boolean {
    const m = this.def.mains;
    if (m !== undefined) return m;
    return this.def.content !== "laptop" && this.def.content !== "phone";
  }

  get state(): ScreenState {
    if (this.dead) return "dead";
    if (!this.on) return "off";
    return this.cracked ? "cracked" : "on";
  }

  private build(): void {
    const part = this.part;
    const isl = part?.island;
    const factory = this.fs.screenFactory;
    if (!part || !isl || !factory || this.visual) return;
    try {
      this.visual = factory({ part, island: isl, kind: this.def.content, state: this.state, mains: this.mains, seed: part.id });
      this.shown = this.state;
    } catch (e) {
      this.fs.w.warnOnce("screen", `screen visual failed: ${(e as Error).message}`);
      this.visual = null;
    }
  }

  sync(): void {
    const s = this.state;
    if (s === this.shown) return;
    this.shown = s;
    this.visual?.setState(s);
  }

  toggle(): boolean {
    if (this.dead) return false;
    this.on = !this.on;
    this.sync();
    return true;
  }

  private kill(geometryGone: boolean): void {
    if (!this.dead) {
      this.dead = true;
      const pos = this.worldPos();
      if (pos) this.fs.w.events.emit("feature", { kind: "screenBroken", pos, intensity: 1 });
      this.sync();
    }
    if (geometryGone && this.visual) {
      // the panel shattered: its fragments show the broken LCD, the quad must not float on
      this.visual.dispose();
      this.visual = null;
    }
  }

  onDamage(ev: DamageInfo): void {
    if (this.dead) return;
    if (ev.part === this.part && (ev.crack > 0 || ev.part.cracks.length > 0) && !this.cracked) {
      this.cracked = true;
      this.fs.w.events.emit("feature", { kind: "screenBroken", pos: { ...ev.pos }, intensity: 0.5 });
      this.sync();
    } else if (ev.energy > 120 && !this.cracked) {
      // a heavy blow to the set scrambles the panel even without visible cracks
      this.cracked = true;
      this.sync();
    }
  }

  onFracture(old: Part): void {
    if (old === this.part) this.kill(true);
  }

  onPartKilled(part: Part): void {
    if (part === this.part) this.kill(true);
  }

  onBondBroken(_b: Bond, part: Part): void {
    if (part === this.part && part.bonds.length === 0) this.kill(false);
  }

  onIslandChanged(_part: Part, island: Island): void {
    this.visual?.setIsland(island);
  }

  override dispose(): void {
    this.visual?.dispose();
    this.visual = null;
    super.dispose();
  }
}
