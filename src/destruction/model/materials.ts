// Physical material table: densities, stiffness, failure modes and strengths (gameplay-tuned
// but physically ordered), plus presentation hooks (interior surface, sound/dust/micro
// profiles). PURE MODULE. Owned by the destruction agent after the contract phase.
//
// Energy model recap (see docs/ARCHITECTURE.md §4):
//   global failure  E >= u · V / clamp(aspect/6, 0.5, 4)
//   local breakout  E  = G · 2π r · min(t, r)   → breakout radius r (fracture if r >= rMin)
//   ductile dents   r_d = dentRadius · (E/100)^(1/3),  depth = E / (yieldY · π r_d²)

import type { SurfaceName } from "../../render/surfaces.ts";

export type MaterialId =
  | "glass"
  | "temperedGlass"
  | "ceramic"
  | "tile"
  | "stone"
  | "concrete"
  | "gypsum"
  | "plaster"
  | "softwood"
  | "hardwood"
  | "plywood"
  | "mdf"
  | "particleboard"
  | "steelSheet"
  | "steel"
  | "aluminum"
  | "castIron"
  | "copper"
  | "plastic"
  | "acrylic"
  | "pcb"
  | "lcd"
  | "rubber"
  | "fabric"
  | "foam"
  | "paper"
  | "cardboard"
  | "insulation"
  | "soil"
  | "food"
  | "flesh"; // the player's fists/feet (absorbs most energy)

export type FailureMode = "shatter" | "dice" | "splinter" | "crumble" | "crack" | "bend" | "soft";

/** Audio profile ids understood by src/audio. */
export type SoundProfile =
  | "glass"
  | "ceramic"
  | "stone"
  | "concrete"
  | "drywall"
  | "wood"
  | "metal"
  | "metalThin"
  | "plastic"
  | "electronics"
  | "soft"
  | "paper"
  | "flesh";

export type DustKind = "drywall" | "concrete" | "wood" | "plaster" | "ceramic" | "insulation";
export type MicroKind = "glass" | "ceramic" | "wood" | "gypsum" | "concrete" | "plastic" | "metal" | "foam" | "paper" | "soil" | "none";

export interface MaterialDef {
  id: MaterialId;
  /** kg/m³ */
  density: number;
  friction: number;
  restitution: number;
  /** Relative contact stiffness: the softer side of an impact absorbs more energy. */
  stiffness: number;
  mode: FailureMode;
  /** Global failure strain-energy density (J/m³). */
  u: number;
  /** Local breakout toughness (J/m²). */
  G: number;
  /** Minimum breakout radius (m) for a local fracture to happen. */
  rMin: number;
  /** Fraction of the failure energy at which visible cracks appear. */
  crackFraction: number;
  /** 0..1 propensity to chip tiny pieces on sub-threshold hits. */
  chip: number;
  /** Seed count range for a full (global) fracture. */
  fragments: [number, number];
  /** Grain anisotropy (1 = isotropic, 4 = cells 4x longer along the grain). */
  anisotropy: number;
  /** Fragments with largest extent below this (m) become micro-debris. */
  minFragment: number;
  /** Damage accumulation factor (fatigue). */
  fatigue: number;
  /** Ductile: dent radius scale (m) at 100 J. */
  dentRadius: number;
  /** Ductile: plastic yield energy density (J/m³). */
  yieldY: number;
  /** Ductile: max dent depth as a fraction of the part's smallest extent (sheets may exceed 1: crumple). */
  maxDent: number;
  /** Fraction of contact energy dissipated (soft materials absorb). */
  loss: number;
  interiorSurf: SurfaceName;
  sound: SoundProfile;
  dust: DustKind | null;
  sparks: boolean;
  micro: MicroKind;
}

const base = {
  friction: 0.6,
  restitution: 0.2,
  rMin: 0.02,
  crackFraction: 0.35,
  chip: 0,
  fragments: [4, 10] as [number, number],
  anisotropy: 1,
  minFragment: 0.02,
  fatigue: 1.0,
  dentRadius: 0,
  yieldY: 0,
  maxDent: 0,
  loss: 0.8,
  dust: null as DustKind | null,
  sparks: false,
};

const M = (d: Partial<MaterialDef> & Pick<MaterialDef, "id" | "density" | "stiffness" | "mode" | "u" | "G" | "interiorSurf" | "sound" | "micro">): MaterialDef => ({
  ...base,
  ...d,
});

export const MATERIALS: Readonly<Record<MaterialId, MaterialDef>> = {
  glass: M({ id: "glass", density: 2500, stiffness: 9, mode: "shatter", u: 8000, G: 100000, restitution: 0.15, friction: 0.4, rMin: 0.005, crackFraction: 0.3, fragments: [18, 40], minFragment: 0.015, interiorSurf: "glass_edge", sound: "glass", micro: "glass" }),
  temperedGlass: M({ id: "temperedGlass", density: 2500, stiffness: 9, mode: "dice", u: 10000, G: 300000, restitution: 0.15, friction: 0.4, rMin: 0.005, crackFraction: 0.9, fragments: [150, 400], minFragment: 0.03, interiorSurf: "glass_edge", sound: "glass", micro: "glass" }),
  ceramic: M({ id: "ceramic", density: 2400, stiffness: 8, mode: "shatter", u: 11400, G: 9000, restitution: 0.1, friction: 0.5, rMin: 0.008, chip: 0.5, fragments: [5, 12], minFragment: 0.012, interiorSurf: "ceramic_bisque", sound: "ceramic", dust: "ceramic", micro: "ceramic" }),
  tile: M({ id: "tile", density: 2300, stiffness: 8, mode: "shatter", u: 7000, G: 7000, restitution: 0.1, rMin: 0.01, chip: 0.5, fragments: [3, 8], minFragment: 0.015, interiorSurf: "ceramic_bisque", sound: "ceramic", dust: "ceramic", micro: "ceramic" }),
  stone: M({ id: "stone", density: 2700, stiffness: 10, mode: "shatter", u: 4000, G: 40000, restitution: 0.1, rMin: 0.015, chip: 0.4, fragments: [3, 7], minFragment: 0.02, interiorSurf: "stone_broken", sound: "stone", dust: "concrete", micro: "concrete" }),
  concrete: M({ id: "concrete", density: 2400, stiffness: 10, mode: "crumble", u: 60000, G: 200000, restitution: 0.05, friction: 0.8, rMin: 0.02, chip: 0.7, fragments: [6, 14], minFragment: 0.025, fatigue: 1.6, interiorSurf: "concrete_broken", sound: "concrete", dust: "concrete", micro: "concrete" }),
  gypsum: M({ id: "gypsum", density: 700, stiffness: 1, mode: "crumble", u: 2200, G: 11000, restitution: 0.05, friction: 0.7, rMin: 0.025, chip: 0.6, fragments: [8, 18], minFragment: 0.03, fatigue: 1.4, interiorSurf: "gypsum", sound: "drywall", dust: "drywall", micro: "gypsum" }),
  plaster: M({ id: "plaster", density: 1100, stiffness: 1.5, mode: "crumble", u: 1000, G: 12000, restitution: 0.05, rMin: 0.02, chip: 0.6, fragments: [6, 14], minFragment: 0.025, fatigue: 1.4, interiorSurf: "gypsum", sound: "drywall", dust: "plaster", micro: "gypsum" }),
  softwood: M({ id: "softwood", density: 500, stiffness: 4, mode: "splinter", u: 33333, G: 60000, restitution: 0.25, friction: 0.55, rMin: 0.015, fragments: [4, 9], anisotropy: 4.5, minFragment: 0.02, fatigue: 1.2, interiorSurf: "wood_fiber", sound: "wood", dust: "wood", micro: "wood" }),
  hardwood: M({ id: "hardwood", density: 700, stiffness: 5, mode: "splinter", u: 50000, G: 90000, restitution: 0.25, friction: 0.5, rMin: 0.015, fragments: [4, 8], anisotropy: 4, minFragment: 0.02, fatigue: 1.1, interiorSurf: "wood_fiber", sound: "wood", dust: "wood", micro: "wood" }),
  plywood: M({ id: "plywood", density: 600, stiffness: 4, mode: "splinter", u: 80000, G: 40000, restitution: 0.2, rMin: 0.015, fragments: [4, 9], anisotropy: 2, minFragment: 0.02, interiorSurf: "wood_fiber", sound: "wood", dust: "wood", micro: "wood" }),
  mdf: M({ id: "mdf", density: 750, stiffness: 3.5, mode: "crumble", u: 57000, G: 25000, restitution: 0.15, rMin: 0.015, fragments: [4, 10], minFragment: 0.02, fatigue: 1.3, interiorSurf: "mdf", sound: "wood", dust: "wood", micro: "wood" }),
  particleboard: M({ id: "particleboard", density: 650, stiffness: 3, mode: "crumble", u: 40000, G: 18000, restitution: 0.15, rMin: 0.015, fragments: [4, 10], minFragment: 0.02, fatigue: 1.4, interiorSurf: "particleboard", sound: "wood", dust: "wood", micro: "wood" }),
  steelSheet: M({ id: "steelSheet", density: 7850, stiffness: 7, mode: "bend", u: 0, G: 0, restitution: 0.25, friction: 0.45, dentRadius: 0.05, yieldY: 7e5, maxDent: 45, interiorSurf: "metal_raw", sound: "metalThin", micro: "metal" }),
  steel: M({ id: "steel", density: 7850, stiffness: 10, mode: "bend", u: 0, G: 0, restitution: 0.3, friction: 0.45, dentRadius: 0.02, yieldY: 4e7, maxDent: 0.3, interiorSurf: "metal_raw", sound: "metal", micro: "metal" }),
  aluminum: M({ id: "aluminum", density: 2700, stiffness: 6, mode: "bend", u: 0, G: 0, restitution: 0.25, friction: 0.45, dentRadius: 0.04, yieldY: 8e5, maxDent: 4, interiorSurf: "aluminum", sound: "metalThin", micro: "metal" }),
  castIron: M({ id: "castIron", density: 7200, stiffness: 10, mode: "shatter", u: 40000, G: 200000, restitution: 0.2, rMin: 0.02, fragments: [3, 6], minFragment: 0.02, interiorSurf: "metal_raw", sound: "metal", micro: "metal" }),
  copper: M({ id: "copper", density: 8900, stiffness: 6, mode: "bend", u: 0, G: 0, restitution: 0.2, dentRadius: 0.02, yieldY: 6e6, maxDent: 1, interiorSurf: "copper", sound: "metalThin", micro: "metal" }),
  plastic: M({ id: "plastic", density: 1050, stiffness: 2.5, mode: "crack", u: 600000, G: 250000, restitution: 0.3, friction: 0.5, rMin: 0.01, fragments: [2, 5], minFragment: 0.015, dentRadius: 0.02, yieldY: 6e6, maxDent: 0.5, interiorSurf: "plastic", sound: "plastic", micro: "plastic" }),
  acrylic: M({ id: "acrylic", density: 1190, stiffness: 3, mode: "crack", u: 60000, G: 50000, restitution: 0.25, rMin: 0.01, fragments: [3, 7], minFragment: 0.015, interiorSurf: "acrylic_white", sound: "plastic", micro: "plastic" }),
  pcb: M({ id: "pcb", density: 1850, stiffness: 4, mode: "crack", u: 1.5e6, G: 200000, restitution: 0.2, rMin: 0.008, fragments: [2, 4], minFragment: 0.01, interiorSurf: "pcb", sound: "electronics", sparks: true, micro: "plastic" }),
  lcd: M({ id: "lcd", density: 2500, stiffness: 9, mode: "shatter", u: 4000, G: 80000, restitution: 0.1, rMin: 0.004, crackFraction: 0.15, fragments: [10, 24], minFragment: 0.015, interiorSurf: "glass_edge", sound: "glass", sparks: true, micro: "glass" }),
  rubber: M({ id: "rubber", density: 1200, stiffness: 0.5, mode: "soft", u: 0, G: 0, restitution: 0.7, friction: 0.9, loss: 0.3, interiorSurf: "rubber", sound: "soft", micro: "none" }),
  fabric: M({ id: "fabric", density: 300, stiffness: 0.3, mode: "soft", u: 0, G: 0, restitution: 0.05, friction: 0.8, loss: 0.95, interiorSurf: "foam", sound: "soft", micro: "foam" }),
  foam: M({ id: "foam", density: 40, stiffness: 0.2, mode: "soft", u: 0, G: 0, restitution: 0.05, friction: 0.8, loss: 0.97, interiorSurf: "foam", sound: "soft", micro: "foam" }),
  paper: M({ id: "paper", density: 700, stiffness: 0.8, mode: "soft", u: 0, G: 0, restitution: 0.1, friction: 0.6, loss: 0.9, interiorSurf: "paper", sound: "paper", micro: "paper" }),
  cardboard: M({ id: "cardboard", density: 250, stiffness: 1, mode: "soft", u: 0, G: 0, restitution: 0.1, friction: 0.6, loss: 0.9, interiorSurf: "cardboard", sound: "paper", micro: "paper" }),
  insulation: M({ id: "insulation", density: 30, stiffness: 0.1, mode: "soft", u: 0, G: 0, restitution: 0.02, friction: 0.9, loss: 0.99, interiorSurf: "insulation", sound: "soft", dust: "insulation", micro: "foam" }),
  soil: M({ id: "soil", density: 1300, stiffness: 0.5, mode: "soft", u: 0, G: 0, restitution: 0.02, friction: 0.9, loss: 0.98, interiorSurf: "soil", sound: "soft", micro: "soil" }),
  food: M({ id: "food", density: 950, stiffness: 0.6, mode: "soft", u: 0, G: 0, restitution: 0.15, friction: 0.7, loss: 0.9, interiorSurf: "food", sound: "soft", micro: "none" }),
  flesh: M({ id: "flesh", density: 1050, stiffness: 2, mode: "soft", u: 0, G: 0, restitution: 0.1, friction: 0.8, loss: 0.9, interiorSurf: "food", sound: "flesh", micro: "none" }),
};

/** Default bond strengths in joules when BondDef.strength is omitted. `fused` uses the material (G × shared area). */
export const BOND_DEFAULTS: Readonly<Record<string, number>> = {
  glue: 60,
  screw: 35,
  nail: 30,
  dowel: 80,
  weld: 70,
  bolt: 250,
  press: 2,
  clip: 6,
  mortar: 25,
  fused: -1,
  friction: 4,
  hinge: 90,
  slider: 50,
  latch: 40,
};

export function material(id: MaterialId): MaterialDef {
  const m = MATERIALS[id];
  if (!m) throw new Error(`unknown material '${id}'`);
  return m;
}
