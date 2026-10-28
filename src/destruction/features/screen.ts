// `screen` feature: TV / monitor / laptop / phone / microwave display. State machine:
// on ↔ off (use key, power), cracked (glitching) once the panel is cracked, dead once it is
// broken or ripped out. The visual (emissive dynamic-texture quad over the panel's front face)
// is created through a pluggable factory so the render module owns the look.

import type { Vec3 } from "../../geom/vec.ts";
import type { FeatureDef } from "../model/types.ts";
import { faceArea } from "../runtime/polyUtil.ts";
import type { Assembly, Bond, Island, Part } from "../runtime/types.ts";
import { BaseFeature } from "./base.ts";
import type { DamageInfo } from "./feature.ts";
import type { FeatureSystem } from "./system.ts";

type ScreenDef = Extract<FeatureDef, { type: "screen" }>;
export type ScreenState = "on" | "off" | "cracked" | "dead";

/** Where the display sits on its part, in the island (assembly) frame. */
export interface ScreenPlacement {
  center: Vec3;
  /** Outward unit normal of the display face. */
  normal: Vec3;
  /** Unit in-plane axes (width along `right`, height along `up`). */
  right: Vec3;
  up: Vec3;
  width: number;
  height: number;
}

export interface ScreenVisual {
  setState(s: ScreenState): void;
  /** Re-parent to another island node after a split. */
  setIsland(island: Island): void;
  dispose(): void;
}

export type ScreenVisualFactory = (args: { part: Part; island: Island; placement: ScreenPlacement; kind: ScreenDef["content"]; name: string }) => ScreenVisual | null;

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
    this.sync();
  }

  get state(): ScreenState {
    if (this.dead) return "dead";
    if (!this.on || (this.mains && !this.fs.powered)) return "off";
    return this.cracked ? "cracked" : "on";
  }

  private build(): void {
    const part = this.part;
    const isl = part?.island;
    const factory = this.fs.screenFactory;
    if (!part || !isl || !factory || this.visual) return;
    try {
      this.visual = factory({ part, island: isl, placement: screenPlacement(part), kind: this.def.content, name: `screen.${this.asm.type}#${this.asm.id}` });
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

  private kill(): void {
    if (this.dead) return;
    this.dead = true;
    const pos = this.worldPos();
    if (pos) this.fs.w.events.emit("feature", { kind: "screenBroken", pos, intensity: 1 });
    this.sync();
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
    if (old === this.part) this.kill();
  }

  onPartKilled(part: Part): void {
    if (part === this.part) this.kill();
  }

  onBondBroken(_b: Bond, part: Part): void {
    if (part === this.part && part.bonds.length === 0) this.kill();
  }

  onIslandChanged(_part: Part, island: Island): void {
    this.visual?.setIsland(island);
  }

  onPower(): void {
    this.sync();
  }

  override dispose(): void {
    this.visual?.dispose();
    this.visual = null;
    super.dispose();
  }
}

/**
 * Display placement: the part's largest face facing the object's front (+Z in the assembly
 * frame per builder conventions), else its largest face.
 */
export function screenPlacement(part: Part): ScreenPlacement {
  const poly = part.poly;
  let best = -1,
    bestA = -1;
  for (let pass = 0; pass < 2 && best < 0; pass++) {
    for (let i = 0; i < poly.faces.length; i++) {
      const f = poly.faces[i];
      if (pass === 0 && f.n.z < 0.5) continue;
      const a = faceArea(poly, f);
      if (a > bestA) {
        bestA = a;
        best = i;
      }
    }
  }
  const f = poly.faces[Math.max(0, best)];
  const n = f.n;
  // in-plane axes: right ⟂ world-up when possible
  let right = { x: n.z, y: 0, z: -n.x };
  let rl = Math.hypot(right.x, right.y, right.z);
  if (rl < 1e-3) {
    right = { x: 1, y: 0, z: 0 };
    rl = 1;
  }
  right = { x: right.x / rl, y: right.y / rl, z: right.z / rl };
  const up = { x: n.y * right.z - n.z * right.y, y: n.z * right.x - n.x * right.z, z: n.x * right.y - n.y * right.x };
  let minR = Infinity,
    maxR = -Infinity,
    minU = Infinity,
    maxU = -Infinity,
    cx = 0,
    cy = 0,
    cz = 0;
  for (const k of f.idx) {
    const p = poly.verts[k];
    const r = p.x * right.x + p.y * right.y + p.z * right.z;
    const u = p.x * up.x + p.y * up.y + p.z * up.z;
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    cx += p.x;
    cy += p.y;
    cz += p.z;
  }
  const m = f.idx.length || 1;
  return { center: { x: cx / m, y: cy / m, z: cz / m }, normal: { ...n }, right, up, width: Math.max(0.01, maxR - minR), height: Math.max(0.01, maxU - minU) };
}
