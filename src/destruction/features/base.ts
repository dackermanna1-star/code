// Shared plumbing for part features: host tracking, world positions, rate limits.

import type { Vec3 } from "../../geom/vec.ts";
import type { FeatureDef } from "../model/types.ts";
import type { Assembly, Part } from "../runtime/types.ts";
import type { PartFeature } from "./feature.ts";
import type { FeatureSystem } from "./system.ts";

export abstract class BaseFeature implements PartFeature {
  readonly def: FeatureDef;
  readonly asm: Assembly;
  part: Part | null;
  protected readonly fs: FeatureSystem;
  /** Feature anchor in the assembly frame (def.pos when given, else the host centroid). */
  readonly local: Vec3;

  constructor(fs: FeatureSystem, asm: Assembly, def: FeatureDef, part: Part) {
    this.fs = fs;
    this.asm = asm;
    this.def = def;
    this.part = part;
    const p = (def as { pos?: Vec3 }).pos;
    this.local = p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) ? { x: p.x, y: p.y, z: p.z } : { ...part.centroid };
  }

  /** World position of the feature anchor via the host's island (null if detached). */
  worldPos(): Vec3 | null {
    const isl = this.part?.island;
    if (!isl || !isl.alive) return null;
    return this.fs.w.toWorldVec(isl, this.local);
  }

  /** World direction of an assembly-frame vector via the host's island. */
  worldDir(d: Vec3): Vec3 {
    const isl = this.part?.island;
    if (!isl) return { ...d };
    return this.fs.w.dirToWorldVec(isl, d);
  }

  /** Mains-powered features stop when the panel is destroyed. */
  get mains(): boolean {
    return (this.def as { mains?: boolean }).mains !== false;
  }

  get now(): number {
    return this.fs.w.now;
  }

  dispose(): void {
    this.fs.deactivate(this);
  }
}
