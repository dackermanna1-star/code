// Feature framework: behaviours attached to parts (lights, screens, water, sparks, power,
// stuffing, liquid, soil, motors, hum, alarms — docs/ARCHITECTURE.md §4.9). Features react to
// what happens to their host part; they never poke physics directly except through the
// FeatureContext services.

import type { Vec3 } from "../../geom/vec.ts";
import type { FeatureDef } from "../model/types.ts";
import type { Assembly, Bond, Island, Part } from "../runtime/types.ts";

export interface DamageInfo {
  part: Part;
  /** Energy absorbed by the part (J). */
  absorbed: number;
  /** Energy delivered to the part (J). */
  energy: number;
  /** World contact point / outward surface normal. */
  pos: Vec3;
  normal: Vec3;
  /** New crack severity (0 = none) and dent depth (m). */
  crack: number;
  dent: number;
  /** Deliberate strike (tool/fist) vs passive collision. */
  strike: boolean;
  sharpness: number;
}

export interface FractureInfo {
  global: boolean;
  energy: number;
  /** World impact position and direction. */
  pos: Vec3;
  dir: Vec3;
  brokenVolume: number;
}

export interface PartFeature {
  readonly def: FeatureDef;
  readonly asm: Assembly;
  /** Current host part (follows fragments; null once destroyed). */
  part: Part | null;
  onDamage?(ev: DamageInfo): void;
  /** Host fractured; `fragments` are the live non-micro fragment parts (remain + loose). */
  onFracture?(old: Part, fragments: Part[], ev: FractureInfo): void;
  onBondBroken?(bond: Bond, part: Part): void;
  /**
   * Bonds of the feature's assembly broke since the last fixed step (connectivity checks:
   * hard-wired fixtures). Deferred to the next fixedUpdate so it never sees a half-applied
   * fracture (bonds being re-pointed to fragments).
   */
  onAsmBondsBroken?(): void;
  /** Host part now belongs to another island (split / restore). */
  onIslandChanged?(part: Part, island: Island): void;
  /** Host part removed without fragments (fell out / despawn / all micro). */
  onPartKilled?(part: Part): void;
  onPower?(on: boolean): void;
  fixedUpdate?(dt: number): void;
  update?(dt: number): void;
  dispose(): void;
}
