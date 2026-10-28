// `water` feature: a pipe / faucet / supply line / tank. When its part fractures, loses a bond
// or vanishes, water sprays from the feature position along its direction (a VFX emitter that
// follows the island holding the supply side; the VFX system grows the puddle). Finite
// sources (tanks) run dry. Intact faucets can be turned on/off with the use key (gentle
// stream). Audio reacts to the `waterStart` / `waterStop` feature events.

import type { EmitterHandle } from "../../core/context.ts";
import type { Vec3 } from "../../geom/vec.ts";
import type { FeatureDef } from "../model/types.ts";
import type { Assembly, Bond, Island, Part } from "../runtime/types.ts";
import { BaseFeature } from "./base.ts";
import type { FeatureSystem } from "./system.ts";

type WaterDef = Extract<FeatureDef, { type: "water" }>;

export class WaterFeature extends BaseFeature {
  declare readonly def: WaterDef;
  leaking = false;
  /** Faucet turned on with the use key (intact fixture). */
  running = false;
  litres: number;
  private emitter: EmitterHandle | null = null;
  /** Island whose node carries the spray (supply side). */
  private anchor: Island | null = null;
  /** Litres released so far. */
  spilled = 0;
  private dir: Vec3;

  constructor(fs: FeatureSystem, asm: Assembly, def: FeatureDef, part: Part) {
    super(fs, asm, def, part);
    const d = def as WaterDef;
    this.litres = d.litres !== undefined && Number.isFinite(d.litres) ? Math.max(0, d.litres) : Infinity;
    const l = Math.hypot(d.dir.x, d.dir.y, d.dir.z);
    this.dir = l > 1e-9 ? { x: d.dir.x / l, y: d.dir.y / l, z: d.dir.z / l } : { x: 0, y: -1, z: 0 };
  }

  private get pressure(): number {
    const p = this.def.pressure;
    return Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0.6;
  }

  /** Litres per second of the current flow. */
  private get flow(): number {
    if (this.leaking) return 0.05 + 0.35 * this.pressure;
    if (this.running) return 0.1;
    return 0;
  }

  get flowing(): boolean {
    return (this.leaking || this.running) && this.litres > 0;
  }

  /** Intact fixtures toggle a gentle stream; broken ones keep spraying. */
  toggleFaucet(): boolean {
    if (this.leaking || !this.part || !this.part.alive) return false;
    if (this.running) {
      this.running = false;
      this.stopEmitter(true);
    } else if (this.litres > 0) {
      this.running = true;
      this.startEmitter(0.25);
    }
    return true;
  }

  private startLeak(): void {
    if (this.leaking || this.litres <= 0) return;
    this.leaking = true;
    if (this.running) this.stopEmitter(false);
    this.running = false;
    this.startEmitter(1);
  }

  private startEmitter(strength: number): void {
    this.anchor = this.chooseAnchor();
    const pos = this.sprayPos();
    if (!pos) return;
    const dir = this.sprayDir();
    // VFX emitter rate is a strength multiplier (1 = nominal burst mains pipe, ≈ 0.25 L/s);
    // the VFX system also grows the puddle where the spray lands
    const rate = (0.35 + 0.95 * this.pressure) * strength;
    this.emitter = this.fs.w.vfx.emitter("water", pos, dir, rate);
    this.fs.w.events.emit("feature", { kind: "waterStart", pos, intensity: this.pressure * strength });
    this.fs.activate(this);
  }

  private stopEmitter(emit: boolean): void {
    const pos = this.sprayPos();
    if (this.emitter) {
      this.emitter.stop();
      this.emitter = null;
    }
    if (emit && pos) this.fs.w.events.emit("feature", { kind: "waterStop", pos });
    this.fs.deactivate(this);
  }

  /** The supply side: the host part's island, else the nearest surviving part (static preferred). */
  private chooseAnchor(): Island | null {
    const host = this.part?.island;
    if (host && host.alive) return host;
    let best: Island | null = null;
    let bestScore = Infinity;
    for (const p of this.asm.parts) {
      const isl = p.island;
      if (!isl || !isl.alive) continue;
      const d = (p.centroid.x - this.local.x) ** 2 + (p.centroid.y - this.local.y) ** 2 + (p.centroid.z - this.local.z) ** 2;
      const score = d * (isl.isStatic ? 1 : 4);
      if (score < bestScore) {
        bestScore = score;
        best = isl;
      }
    }
    return best;
  }

  private sprayPos(): Vec3 | null {
    let isl = this.anchor;
    if (!isl || !isl.alive) isl = this.anchor = this.chooseAnchor();
    if (!isl) return null;
    return this.fs.w.toWorldVec(isl, this.local);
  }

  private sprayDir(): Vec3 {
    const isl = this.anchor;
    return isl && isl.alive ? this.fs.w.dirToWorldVec(isl, this.dir) : { ...this.dir };
  }

  fixedUpdate(dt: number): void {
    if (!this.flowing) {
      if (this.emitter) this.stopEmitter(true);
      return;
    }
    const q = this.flow * dt;
    this.litres -= q;
    this.spilled += q;
    if (this.litres <= 0) {
      this.litres = 0;
      this.stopEmitter(true);
    }
  }

  update(): void {
    if (!this.emitter) return;
    const pos = this.sprayPos();
    if (!pos) return;
    this.emitter.setPosition(pos);
    this.emitter.setDirection(this.sprayDir());
  }

  onFracture(old: Part): void {
    if (old === this.part) this.startLeak();
  }

  onBondBroken(_b: Bond, part: Part): void {
    if (part === this.part) this.startLeak();
  }

  onPartKilled(part: Part): void {
    if (part === this.part) this.startLeak();
  }

  onIslandChanged(): void {
    // keep spraying from the supply side; re-evaluated lazily in sprayPos()
    if (this.anchor && !this.anchor.alive) this.anchor = null;
  }

  override dispose(): void {
    if (this.emitter) {
      this.emitter.stop();
      this.emitter = null;
    }
    super.dispose();
  }
}
