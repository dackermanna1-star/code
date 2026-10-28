// Event-style features: sparks (electronics), power (electrical panel), stuffing (cushions,
// mattresses, insulation), liquid (bottles), soil (plant pots), alarm (smoke detector).

import { Vector3 } from "@babylonjs/core";
import { Layer, type VfxKind } from "../../core/context.ts";
import type { Vec3 } from "../../geom/vec.ts";
import type { FeatureDef } from "../model/types.ts";
import type { Assembly, Bond, Part } from "../runtime/types.ts";
import { BaseFeature } from "./base.ts";
import type { DamageInfo, FractureInfo } from "./feature.ts";
import type { FeatureSystem } from "./system.ts";

const UP: Vec3 = { x: 0, y: 1, z: 0 };
const tA = new Vector3();
const tB = new Vector3();

/** Electronics spark when damaged (only while energised). VFX/audio react to the event. */
export class SparksFeature extends BaseFeature {
  private last = -1;

  private get chance(): number {
    const c = (this.def as Extract<FeatureDef, { type: "sparks" }>).chance;
    return c !== undefined && Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0.35;
  }

  private spark(pos: Vec3 | null, intensity: number, p: number): void {
    if (!pos || !this.fs.powered || this.now - this.last < 0.25) return;
    if (this.fs.w.rng.next() > p) return;
    this.last = this.now;
    this.fs.w.events.emit("feature", { kind: "sparks", pos: { ...pos }, intensity: Math.min(1, Math.max(0.15, intensity)) });
  }

  onDamage(ev: DamageInfo): void {
    if (ev.energy < 4 && ev.absorbed < 1.5) return;
    this.spark(ev.pos, ev.energy / 60, this.chance);
  }

  onFracture(_old: Part, _f: Part[], ev: FractureInfo): void {
    this.spark(ev.pos, 0.6 + ev.energy / 100, 1);
  }

  onBondBroken(): void {
    this.spark(this.worldPos(), 0.4, 0.5);
  }
}

/** The electrical panel: destroying it (fracture, heavy battering, ripping it out) cuts mains. */
export class PowerFeature extends BaseFeature {
  private cut(): void {
    if (this.fs.powered) this.fs.setPower(false, this.worldPos());
  }

  onDamage(ev: DamageInfo): void {
    if (ev.part.absorbed > 400 || (ev.dent > 0 && ev.part.dents.length > 6 && ev.part.absorbed > 150)) this.cut();
  }

  onFracture(): void {
    this.cut();
  }

  onPartKilled(): void {
    this.cut();
  }

  onBondBroken(_b: Bond, part: Part): void {
    if (part === this.part && part.bonds.length === 0) this.cut();
  }
}

const STUFF_VFX: Record<string, VfxKind> = { feathers: "feathers", foam: "foam", fiber: "insulationFluff", paper: "paper" };

/** Soft furnishings release stuffing when torn (sharp strikes / cracks) or broken apart. */
export class StuffingFeature extends BaseFeature {
  private last = -1;

  private get kind(): VfxKind {
    return STUFF_VFX[(this.def as Extract<FeatureDef, { type: "stuffing" }>).kind] ?? "foam";
  }

  private burst(pos: Vec3, normal: Vec3, intensity: number): void {
    if (this.now - this.last < 0.08) return;
    this.last = this.now;
    this.fs.w.vfx.burst(this.kind, pos, normal, Math.min(3, Math.max(0.1, intensity)));
  }

  onDamage(ev: DamageInfo): void {
    const torn = ev.crack > 0 || (ev.sharpness >= 2 && ev.energy > 5);
    if (torn) this.burst(ev.pos, ev.normal, ev.energy / 80);
    else if (ev.strike && ev.energy > 30) this.burst(ev.pos, ev.normal, 0.15); // a puff of dust/fluff from a hard whack
  }

  onFracture(_old: Part, _f: Part[], ev: FractureInfo): void {
    this.last = -1;
    this.burst(ev.pos, { x: -ev.dir.x, y: -ev.dir.y, z: -ev.dir.z }, 0.6 + ev.energy / 100);
  }
}

/** Liquid containers splash and leave a puddle when they break (once). */
export class LiquidFeature extends BaseFeature {
  private spilled = false;

  private spill(pos: Vec3 | null): void {
    if (this.spilled || !pos) return;
    this.spilled = true;
    const d = this.def as Extract<FeatureDef, { type: "liquid" }>;
    const litres = Number.isFinite(d.litres) ? Math.max(0.02, d.litres) : 0.5;
    this.fs.w.vfx.burst("liquid", pos, UP, Math.min(3, 0.4 + litres), { tint: d.color });
    tA.set(pos.x, pos.y + 0.05, pos.z);
    tB.set(pos.x, pos.y - 3, pos.z);
    const hit = this.fs.w.physics.raycast(tA, tB, Layer.STATIC);
    if (hit) this.fs.w.vfx.decal("puddle", { x: hit.point.x, y: hit.point.y + 0.002, z: hit.point.z }, UP, Math.min(1.6, 0.25 + Math.sqrt(litres) * 0.6));
  }

  onFracture(_old: Part, _f: Part[], ev: FractureInfo): void {
    this.spill(ev.pos);
  }

  onPartKilled(): void {
    this.spill(this.worldPos());
  }
}

/** Plant pots spill their soil when broken (once per fracture of the host). */
export class SoilFeature extends BaseFeature {
  private bursts = 0;

  onFracture(_old: Part, _f: Part[], ev: FractureInfo): void {
    if (this.bursts++ > 3) return;
    this.fs.w.vfx.burst("soil", ev.pos, UP, Math.min(3, 0.6 + ev.energy / 80));
  }
}

/** Smoke detector chirps when damaged (until destroyed). Audio reacts to `alarm` events. */
export class AlarmFeature extends BaseFeature {
  private last = -10;
  private dead = false;

  constructor(fs: FeatureSystem, asm: Assembly, def: FeatureDef, part: Part) {
    super(fs, asm, def, part);
  }

  private chirp(pos: Vec3 | null): void {
    if (this.dead || !pos || this.now - this.last < 1.5) return;
    this.last = this.now;
    this.fs.w.events.emit("feature", { kind: "alarm", pos: { ...pos } });
  }

  onDamage(ev: DamageInfo): void {
    if (ev.energy > 1.5 || ev.absorbed > 0.5) this.chirp(ev.pos);
  }

  onFracture(_old: Part, _f: Part[], ev: FractureInfo): void {
    this.chirp(ev.pos);
    this.dead = true;
  }

  onBondBroken(): void {
    this.chirp(this.worldPos());
  }
}
