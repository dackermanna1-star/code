// Extra per-material damage tuning that is private to the damage model (kept out of
// MaterialDef so the shared material contract stays stable). PURE MODULE.
//
// Physical background of the numbers (see damage.ts header for the full model):
//  * gSep  — "separation toughness" (J/m²): energy per unit area to drive ONE clean crack
//            through a part's cross-section. It gives brittle parts a physically motivated
//            size effect (energy ∝ L² instead of ∝ L³): small shards and lathe tiles survive
//            light knocks, large panes/panels fail at plausible energies.
//  * flaw  — Weibull-like strength scatter (log-normal σ) of brittle materials; every part gets a
//            deterministic flaw factor from its id, so "every object breaks differently".
//  * tear  — energy (J) a sharp strike must concentrate to tear a soft part.
//  * hard  — 0..1 hardness for tool recoil / punch pain.

import type { FailureMode, MaterialId } from "./materials.ts";

export interface MaterialTuning {
  gSep: number;
  flaw: number;
  tear: number;
  hard: number;
}

const T = (gSep: number, flaw: number, tear: number, hard: number): MaterialTuning => ({ gSep, flaw, tear, hard });

export const TUNING: Readonly<Record<MaterialId, MaterialTuning>> = {
  glass: T(3500, 0.2, 0, 0.9),
  temperedGlass: T(12000, 0.2, 0, 0.95),
  ceramic: T(11000, 0.15, 0, 0.9),
  tile: T(7000, 0.15, 0, 0.9),
  stone: T(6000, 0.15, 0, 1),
  concrete: T(50000, 0.12, 0, 1),
  gypsum: T(3000, 0.1, 0, 0.3),
  plaster: T(3000, 0.12, 0, 0.4),
  softwood: T(6000, 0.12, 0, 0.5),
  hardwood: T(8000, 0.12, 0, 0.6),
  plywood: T(8000, 0.1, 0, 0.5),
  mdf: T(6000, 0.1, 0, 0.45),
  particleboard: T(4000, 0.12, 0, 0.4),
  steelSheet: T(0, 0.05, 0, 0.75),
  steel: T(0, 0.05, 0, 1),
  aluminum: T(0, 0.05, 0, 0.7),
  castIron: T(50000, 0.15, 0, 1),
  copper: T(0, 0.05, 0, 0.75),
  plastic: T(60000, 0.1, 0, 0.35),
  acrylic: T(20000, 0.12, 0, 0.45),
  pcb: T(40000, 0.1, 0, 0.5),
  lcd: T(3000, 0.2, 0, 0.85),
  rubber: T(0, 0.1, 60, 0.05),
  fabric: T(0, 0.1, 20, 0.02),
  foam: T(0, 0.1, 10, 0),
  paper: T(0, 0.1, 15, 0.1),
  cardboard: T(0, 0.1, 10, 0.1),
  insulation: T(0, 0.1, 3, 0),
  soil: T(0, 0.1, 2, 0.05),
  food: T(0, 0.1, 5, 0.05),
  flesh: T(0, 0.1, 30, 0.1),
};

/** Fragment kick presentation per failure mode: radial spread factor and speed cap (m/s). */
export const KICK: Readonly<Record<FailureMode, { spread: number; vmax: number }>> = {
  shatter: { spread: 0.8, vmax: 7 },
  dice: { spread: 1.2, vmax: 4 },
  splinter: { spread: 0.5, vmax: 5 },
  crumble: { spread: 0.35, vmax: 4 },
  crack: { spread: 0.4, vmax: 5 },
  bend: { spread: 0.3, vmax: 4 },
  soft: { spread: 0.4, vmax: 3 },
};

/** Model constants (documented where used in damage.ts). */
export const K = {
  /** Contact radius (m) assumed for passive collisions (contactRadius 0). */
  defaultContact: 0.01,
  /** Reference contact radius (m) for the crater depth ratio α = √(rRef / r_c). */
  contactRef: 0.02,
  /** A blunt contact cannot punch out a plug smaller than this fraction of its own radius. */
  bluntPlug: 0.75,
  /** Breakout radius above this fraction of the smallest in-plane extent → global failure. */
  globalFrac: 0.6,
  /** Hits below this fraction of the fracture threshold leave no fatigue (endurance limit). */
  enduranceLo: 0.02,
  enduranceHi: 0.1,
  /** Bond loads below this fraction of the bond's capacity do no damage (elastic). */
  bondEndurance: 0.03,
  /** Fused seam strength = G × area × fusedFactor (weaker than the bulk). */
  fusedFactor: 0.5,
  /** Tempered glass: hits within this distance of an edge use edgeFactor × threshold. */
  edgeDist: 0.03,
  edgeFactor: 0.3,
  /** Max damage points remembered per part. */
  maxDmgPoints: 16,
  /** Max seeds of one (non-dice) fracture, coarse dice cells, and expanded dice micro cubes. */
  maxSeeds: 48,
  maxDiceCoarse: 200,
  maxDiceMicro: 900,
  /** Crumple metric threshold (Σ depth·r² / (ext0·ext1·ext2)). */
  crumple: 1,
} as const;
