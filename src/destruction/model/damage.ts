// Damage model contract (PURE): turns an impact on a part into an outcome (dents, cracks,
// damage accumulation, bond damage, fracture plan). The runtime applies outcomes to its
// objects. Contract owned by the orchestrator; implementation by the destruction-model agent.
// See docs/ARCHITECTURE.md §4.2–4.7 for the formulas.

import type { Vec3 } from "../../geom/vec.ts";
import type { ConvexPoly } from "../../geom/poly.ts";
import type { Dent, Crack } from "../../geom/meshgen.ts";
import type { Rng } from "../../core/rng.ts";
import type { MaterialDef, MaterialId, FailureMode, MicroKind } from "./materials.ts";
import type { BondKind } from "./types.ts";

/** A past impact remembered on a part for fatigue (island frame). */
export interface DamagePoint {
  p: Vec3;
  /** Accumulated effective energy (J) at this point. */
  e: number;
}

export interface BondState {
  id: number;
  kind: BondKind;
  /** Island-frame anchor. */
  anchor: Vec3;
  health: number;
  max: number;
  /** Mass (kg) on the far side of the bond (approx.: the other part's island-local cluster mass). */
  farMass: number;
  /** True if the bond goes to the world (static building). */
  world: boolean;
}

export interface PartState {
  id: number;
  mat: MaterialDef;
  poly: ConvexPoly; // island frame
  volume: number;
  mass: number;
  centroid: Vec3;
  /** Principal extents [largest, middle, smallest] (m). */
  ext: [number, number, number];
  grain?: Vec3;
  supported: boolean;
  /** Strength multiplier. */
  strength: number;
  dmg: DamagePoint[];
  dents: Dent[];
  cracks: Crack[];
  /** Fracture generation (0 = original part). */
  gen: number;
  bonds: BondState[];
}

export interface ImpactOnPart {
  /** Contact point (island frame), on or near the part surface. */
  point: Vec3;
  /** Unit direction INTO the part (island frame). */
  dir: Vec3;
  /** Energy share delivered to this part (J). */
  energy: number;
  /** Normal impulse (N·s) of the impact. */
  impulse: number;
  /** Mass of the island containing the part (kg; Infinity for static). */
  islandMass: number;
  /** Contact radius (m); 0 = unknown (use a material default). */
  contactRadius: number;
  /** Sharpness multiplier (1 blunt). */
  sharpness: number;
  /** True for deliberate strikes (tools/fists/kicks) vs passive collisions. */
  strike: boolean;
}

export type CellRole = "remain" | "loose" | "micro";

export interface PlannedCell {
  poly: ConvexPoly; // island frame
  volume: number;
  centroid: Vec3;
  maxExtent: number;
  role: CellRole;
  /** Extra velocity (m/s, island frame) to add to loose/micro cells. */
  kick: Vec3;
}

export interface FracturePlan {
  global: boolean;
  mode: FailureMode;
  center: Vec3;
  radius: number;
  cells: PlannedCell[];
  /** Bonds between 'remain' cells (indices into cells), strength in J. */
  internalBonds: Array<{ a: number; b: number; strength: number; anchor: Vec3 }>;
  /** Where each of the part's bonds goes: a cell index, or -1 if the bond broke. */
  bondTransfer: Array<{ bondId: number; cell: number }>;
  micro: MicroKind;
  /** Volume broken loose (m³) — for audio/VFX scale. */
  brokenVolume: number;
}

export interface PartOutcome {
  /** Energy actually absorbed by the part (J). */
  absorbed: number;
  addDents: Dent[];
  addCracks: Crack[];
  /** Updated damage points (replace the part's list). */
  dmg: DamagePoint[];
  /** Damage to apply to bonds (J) by bond id. */
  bondDamage: Array<{ bondId: number; amount: number }>;
  /** Tiny chips spawned (no fracture): micro-debris positions/velocities/sizes (island frame). */
  chips: Array<{ p: Vec3; v: Vec3; size: number }>;
  fracture: FracturePlan | null;
  /** Events for presentation. */
  crackSeverity: number; // 0 = no new crack
  dentDepth: number; // 0 = no dent
  /** Global bend/crumple applied (sheet metal) — runtime may refresh the collider. */
  crumpled: boolean;
}

export interface ImpactEnergy {
  /** Total dissipated energy (J). */
  E: number;
  /** Fraction delivered to side A (B gets 1 - shareA). */
  shareA: number;
  /** Reduced mass (kg). */
  mu: number;
}

const NI = (n: string): never => {
  throw new Error(`destruction/model/damage.ts: ${n} not implemented`);
};

/**
 * Energy dissipated by an impact with normal impulse J between masses mA, mB (Infinity for
 * static) made of matA/matB; shareA by relative stiffness (softer absorbs more) and loss.
 */
export function impactEnergy(J: number, mA: number, mB: number, matA: MaterialDef, matB: MaterialDef | null): ImpactEnergy {
  return NI("impactEnergy");
}

/** Energy needed for a global failure of the part (J). Infinity for ductile/soft. */
export function globalFailureEnergy(part: PartState): number {
  return NI("globalFailureEnergy");
}

/** Breakout radius (m) for effective energy E at a point with thickness t along dir. */
export function breakoutRadius(part: PartState, E: number, t: number): number {
  return NI("breakoutRadius");
}

/** Effective energy including fatigue from nearby damage points. */
export function effectiveEnergy(part: PartState, p: Vec3, E: number): number {
  return NI("effectiveEnergy");
}

/** Main entry: decide and plan the part's response to an impact. Deterministic for a given rng. */
export function respond(part: PartState, imp: ImpactOnPart, rng: Rng): PartOutcome {
  return NI("respond");
}

/**
 * Inertial bond loading for the rest of an island when it receives impulse J at a point:
 * returns extra damage per bond id for bonds NOT on the impacted part.
 */
export function inertialBondDamage(J: number, islandMass: number, bonds: Array<{ id: number; farMass: number; kind: BondKind }>): Array<{ bondId: number; amount: number }> {
  return NI("inertialBondDamage");
}

/** Strength (J) of a `fused` bond between two cells of material m sharing `area` m². */
export function fusedStrength(m: MaterialDef, area: number, strengthMul?: number): number {
  return NI("fusedStrength");
}

/** Kind multiplier: how much of a direct/inertial load a bond kind takes (nails weak in pull-out...). */
export function bondKindFactor(kind: BondKind): number {
  return NI("bondKindFactor");
}

/** Hardness 0..1 of a material for tool recoil / punch pain. */
export function hardness(mat: MaterialId): number {
  return NI("hardness");
}
