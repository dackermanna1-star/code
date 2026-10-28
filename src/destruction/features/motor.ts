// `motor` (ceiling fan, turntable) and `hum` (fridge/aquarium) features.

import type { LoopHandle } from "../../core/context.ts";
import type { FeatureDef } from "../model/types.ts";
import type { Assembly, JointGroup, Part } from "../runtime/types.ts";
import { BaseFeature } from "./base.ts";
import type { FeatureSystem } from "./system.ts";

type MotorDef = Extract<FeatureDef, { type: "motor" }>;
type HumDef = Extract<FeatureDef, { type: "hum" }>;

/**
 * Velocity motor on a hinge group (the joint system applies the torque each step). Stops when
 * mains power is cut or the motor part is destroyed; friction then spins it down.
 */
export class MotorFeature extends BaseFeature {
  declare readonly def: MotorDef;
  readonly group: JointGroup | null;
  private broken = false;

  constructor(fs: FeatureSystem, asm: Assembly, def: FeatureDef, part: Part) {
    super(fs, asm, def, part);
    this.group = resolveGroup(asm, (def as MotorDef).joint);
    if (!this.group) fs.w.warnOnce(`motor:${asm.type}`, `${asm.type}: motor joint '${(def as MotorDef).joint}' not found`);
    else {
      this.group.motorSpeed = Number.isFinite(this.def.speed) ? this.def.speed : 0;
      // enough torque to spin the moving side up over a few seconds, not enough to hurt anyone
      let m = 0;
      for (const b of this.group.bonds) if (b.a.island) m = Math.max(m, b.a.island.mass);
      this.group.motorTorque = 0.4 + 0.08 * m;
      this.fs.joints.motors.add(this.group);
    }
    this.apply();
  }

  private apply(): void {
    if (!this.group) return;
    const on = !this.broken && (!this.mains || this.fs.powered);
    if (this.group.motorOn && !on) {
      const pos = this.worldPos();
      if (pos) this.fs.w.events.emit("feature", { kind: "motorStop", pos });
    }
    this.group.motorOn = on;
  }

  onFracture(old: Part): void {
    if (old === this.part) {
      this.broken = true;
      this.apply();
    }
  }

  onPartKilled(): void {
    this.broken = true;
    this.apply();
  }

  onPower(): void {
    this.apply();
  }

  override dispose(): void {
    if (this.group) {
      this.group.motorOn = false;
      this.fs.joints.motors.delete(this.group);
    }
    super.dispose();
  }
}

/** Find a joint group by id, by "<moving part>#…" prefix, or by its moving part's name. */
export function resolveGroup(asm: Assembly, key: string): JointGroup | null {
  if (!key) return null;
  const exact = asm.groups.get(key);
  if (exact) return exact;
  for (const [id, g] of asm.groups) if (id.startsWith(`${key}#`)) return g;
  for (const g of asm.groups.values()) if (g.bonds.some((b) => b.a.name === key)) return g;
  return null;
}

/** Appliance hum loop while powered and intact (audio optional). */
export class HumFeature extends BaseFeature {
  declare readonly def: HumDef;
  private loop: LoopHandle | null = null;
  private broken = false;

  constructor(fs: FeatureSystem, asm: Assembly, def: FeatureDef, part: Part) {
    super(fs, asm, def, part);
    fs.activate(this);
  }

  private get wanted(): boolean {
    return !this.broken && !!this.part && (!this.mains || this.fs.powered);
  }

  update(): void {
    if (!this.wanted) {
      this.stop();
      return;
    }
    const pos = this.worldPos();
    if (!pos) return;
    if (!this.loop) {
      const audio = this.fs.audio();
      if (!audio) return;
      try {
        this.loop = audio.loop(this.def.sound, pos, { gain: 0.5 });
      } catch {
        this.loop = null;
      }
      return;
    }
    this.loop.setPosition(pos);
  }

  private stop(): void {
    if (this.loop) {
      this.loop.stop(0.4);
      this.loop = null;
    }
    if (!this.wanted) this.fs.deactivate(this);
  }

  onFracture(old: Part): void {
    if (old === this.part) {
      this.broken = true;
      this.stop();
    }
  }

  onPartKilled(): void {
    this.broken = true;
    this.stop();
  }

  onPower(on: boolean): void {
    if (on && this.wanted) this.fs.activate(this);
    else this.stop();
  }

  override dispose(): void {
    this.broken = true;
    this.stop();
    super.dispose();
  }
}
