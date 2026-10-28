// Event → sound mapping (pure): loudness laws, layer plans per gameplay event, rate limiters
// and the propagation formulas shared by the engine. No Web Audio here, so every rule is
// unit-testable in Node.
//
// Loudness model: the bank is loudness-normalised (−16 dBFS on a weighted 50 ms RMS), so a
// layer's `db` is its level at 1 m relative to that reference. Energies use a compressed
// log law: an impact dissipating E joules plays at 8·log10(E/300 J) dB, i.e. a charged
// sledgehammer (300 J) at 0 dB, a punch (60 J) at −5.6, a dropped mug (3 J) at −16 and a
// falling pen (0.05 J) at −30 — "every hit matters" but tiny things stay tiny.

import { MATERIALS, type MaterialId, type SoundProfile } from "../destruction/model/materials.ts";
import type { BondKind } from "../destruction/model/types.ts";
import type { FractureEv, ImpactEv } from "../core/events.ts";
import { BALCONY_FLOOR_Y, FLOOR_Y } from "../world/structure/levels.ts";

export type DebrisProfile = "glass" | "ceramic" | "wood" | "drywall" | "concrete" | "metal" | "plastic";

/** One sound layer of an event plan. */
export interface Layer {
  /** Sound id or size family (see bank.ts). */
  id: string;
  /** Level (dB) at 1 m relative to the bank reference. */
  db: number;
  /** Object size (m) for size-family selection / pitch. */
  size?: number;
  /** Extra playback-rate multiplier. */
  rate?: number;
  /** Delay after the event (s). Delayed layers become separate voices. */
  delay?: number;
  /** Excitation low-pass (Hz): soft strikers do not excite high modes. */
  cutoff?: number;
  /** CC0 sample layer key to blend in when available. */
  sample?: string;
}

export const E_REF = 300;
const log10 = (x: number): number => Math.log10(Math.max(x, 1e-12));
/** NaN-safe clamp (NaN → lo). */
const clamp = (x: number, lo: number, hi: number): number => (x >= lo ? (x <= hi ? x : hi) : lo);
const fin = (x: number | undefined | null, d: number): number => (typeof x === "number" && Number.isFinite(x) ? x : d);

/** Level (dB) of an impact dissipating `energy` J. */
export function energyDb(energy: number, slope = 8, ref = E_REF): number {
  return clamp(slope * log10(Math.max(fin(energy, 0), 1e-9) / ref), -60, 6);
}

export function profileOf(mat: MaterialId | null | undefined): SoundProfile {
  return (mat && MATERIALS[mat]?.sound) || "concrete";
}

export function stiffnessOf(mat: MaterialId | null | undefined): number {
  return (mat && MATERIALS[mat]?.stiffness) || 10;
}

/** Radiation efficiency per profile (dB): sheet metal rings loud, soft things barely radiate. */
export const PROFILE_DB: Readonly<Record<SoundProfile, number>> = {
  metal: 1,
  metalThin: 2,
  glass: 0,
  ceramic: 0,
  stone: -2,
  concrete: -4,
  drywall: -3,
  wood: -1,
  plastic: -3,
  electronics: -3,
  soft: -14,
  paper: -10,
  flesh: -9,
};

/** Bigger radiators are louder (±): 4·log10(size/0.3) dB, clamped. */
export function sizeDb(size: number): number {
  return clamp(4 * log10(Math.max(fin(size, 0.3), 0.005) / 0.3), -6, 3);
}

/**
 * Excitation bandwidth of a contact (Hz): stiffer contacts are shorter and excite higher
 * modes. Uses the series stiffness of both materials (soft strikers → dull hits).
 */
export function contactCutoff(matA: MaterialId | null, matB: MaterialId | null): number {
  const kA = stiffnessOf(matA);
  const kB = matB ? stiffnessOf(matB) : 10;
  const keff = (kA * kB) / Math.max(kA + kB, 1e-6);
  return clamp(2400 * Math.pow(keff, 1.3), 400, 20000);
}

export function debrisOf(p: SoundProfile): DebrisProfile | null {
  switch (p) {
    case "glass":
      return "glass";
    case "ceramic":
      return "ceramic";
    case "stone":
    case "concrete":
      return "concrete";
    case "drywall":
      return "drywall";
    case "wood":
      return "wood";
    case "metal":
    case "metalThin":
      return "metal";
    case "plastic":
    case "electronics":
      return "plastic";
    default:
      return null;
  }
}

/** CC0 sample layer used for modal impacts of a profile. */
export const SAMPLE_FOR_PROFILE: Readonly<Partial<Record<SoundProfile, string>>> = {
  glass: "impact.glass",
  ceramic: "impact.ceramic",
  stone: "impact.concrete",
  concrete: "impact.concrete",
  wood: "impact.wood",
  metal: "impact.metal",
  metalThin: "impact.metalThin",
  plastic: "impact.plastic",
  electronics: "impact.plastic",
  soft: "impact.soft",
  paper: "impact.paper",
  flesh: "punch",
};

/** CC0 sample layer blended with specific synthesized sounds. */
export const SAMPLE_FOR_ID: Readonly<Record<string, string>> = {
  "step.wood": "step.wood",
  "step.tile": "step.tile",
  "step.carpet": "step.carpet",
  "step.concrete": "step.concrete",
  "punch.thud": "punch",
  "kick.thud": "punch",
  ouch: "punch",
  "shatter.glass.s": "shatter.glass",
  "shatter.glass.l": "shatter.glass",
  "shatter.tempered": "shatter.glass",
  "break.wood.snap": "break.wood",
  "break.wood.crack": "break.wood",
  "break.wood.splinter": "break.wood",
  "break.concrete.crumble": "debris.rock",
  "break.drywall.crumble": "debris.generic",
  "door.slam": "door.slam",
  "door.creak": "creak.door",
  "door.latch": "door.latch",
  "creak.hinge": "creak.door",
  "creak.wood": "creak.wood",
  "cloth.grab": "cloth",
  "cloth.throw": "cloth",
  "cloth.drop": "cloth",
  "spark.crackle": "spark",
  "elec.clunk": "elec.switch",
};

/** Parts larger than this behave like locally responding surfaces (walls, floors, slabs). */
export const STRUCTURE_SIZE = 1.5;

/**
 * Profiles with a damped "surface" variant in the bank: heavy, bonded structure (tiled floor,
 * laminate, wall, slab, mounted pane) clacks or thuds locally instead of ringing like a free
 * object of the same size.
 */
export const SURFACE_PROFILES: readonly SoundProfile[] = ["wood", "ceramic", "stone", "concrete", "drywall", "glass", "metal", "metalThin", "plastic"];
const SURFACE_SET = new Set<SoundProfile>(SURFACE_PROFILES);

/**
 * Level of a bonded surface relative to a free radiator of the same material (dB). Floors and
 * slabs are heavily damped (−4); a drywall partition is a stud-framed drum over an air cavity
 * and radiates nearly fully; mounted panes and sheet metal are in between.
 */
const SURFACE_DB: Readonly<Partial<Record<SoundProfile, number>>> = { drywall: 0, glass: -2, metal: -2, metalThin: -2 };

// ============================================================================ impacts

/**
 * Layers for an impact: both colliding materials ring (layered), pitch from each part's
 * size, loudness from energy, excitation bandwidth from the contact stiffness.
 */
export function impactLayers(ev: ImpactEv, out: Layer[] = []): Layer[] {
  out.length = 0;
  const E = fin(ev.energy, 0);
  if (!(E > 2e-3)) return out;
  const base = energyDb(E);
  const cutoff = contactCutoff(ev.matA, ev.matB);
  const surf = surfaceSides(ev);
  addImpactSide(out, ev.matA, ev.sizeA, base, cutoff, E, false, (surf & 1) !== 0);
  if (ev.matB) {
    // Strikes report the striker (tool head / fist) as side B with idB = −1: it rings less
    // (held, damped by the hand).
    const striker = isStrike(ev);
    addImpactSide(out, ev.matB, ev.sizeB, base + (striker ? -6 : 0), cutoff, E, striker, (surf & 2) !== 0);
  }
  return out;
}

/** Player strike: side B is the striker (tool head / fist / boot), reported with idB = −1. */
export function isStrike(ev: ImpactEv): boolean {
  return ev.idB === -1 && !!ev.matB && fin(ev.sizeB, 1) < 0.15;
}

/**
 * Structure-like part: large and heavy (floor/wall/slab regions), or very large. A 25 kg door
 * or a table top is large but still rings like a free panel.
 */
export function isStructure(size: number, mass: number): boolean {
  return (size > STRUCTURE_SIZE && (!Number.isFinite(mass) || mass > 60)) || size > 3;
}

/**
 * Bonded finish materials and the minimum part size (m) from which a part of that material is
 * a piece of building fabric (floor tile, wall/ceiling board, slab) rather than a loose object.
 * Static islands report their PART mass (a 0.3 m floor tile weighs ~2 kg, a drywall panel
 * ~27 kg), so mass alone cannot tell a bonded finish from a free radiator.
 */
const FINISH_MIN_SIZE: Readonly<Partial<Record<MaterialId, number>>> = {
  tile: 0.25,
  gypsum: 0.6,
  plaster: 0.6,
  concrete: 0.6,
};

/** Floor-finish materials laid at the finished-floor plane (laminate planks, thresholds, tiles). */
const FLOOR_FINISH = new Set<MaterialId>(["hardwood", "tile", "concrete", "plaster"]);

/** Contact point on a finished floor (indoor y = FLOOR_Y, balcony slab a step lower). */
function onFloorPlane(ev: ImpactEv): boolean {
  const y = ev.pos ? ev.pos.y : NaN;
  if (!Number.isFinite(y)) return false;
  const ny = ev.normal ? fin(ev.normal.y, 0) : 0;
  return y >= Math.min(FLOOR_Y, BALCONY_FLOOR_Y) - 0.04 && y <= FLOOR_Y + 0.04 && Math.abs(ny) >= 0.7;
}

/**
 * Which sides of an impact are bonded building surfaces (bit 1 = A, bit 2 = B): they get the
 * damped `surface.*` response and are exempt from per-island rate limiting.
 *
 * Uses the explicit static flags when the destruction runtime provides them (requested
 * contract addition `staticA/staticB` on ImpactEv); otherwise infers it from size × mass
 * (slabs, big structure), from bonded-finish materials (tile, gypsum, plaster, concrete
 * boards) and from contacts on the finished-floor plane (laminate planks). Strikers never count.
 */
export function surfaceSides(ev: ImpactEv): number {
  const x = ev as ImpactEv & { staticA?: boolean; staticB?: boolean };
  const strike = isStrike(ev);
  let a = false;
  let b = false;
  if (typeof x.staticA === "boolean" || typeof x.staticB === "boolean") {
    a = x.staticA === true;
    b = x.staticB === true && !strike;
  } else {
    a = surfaceGuess(ev.matA, ev.sizeA, ev.massA);
    b = !!ev.matB && !strike && surfaceGuess(ev.matB, ev.sizeB, ev.massB);
    if (!a || !b) {
      // Floor plane: a laminate plank (1.2 m, 1.9 kg) is far below the structure thresholds.
      const floor = onFloorPlane(ev);
      const fa = !a && floor && floorFinish(ev.matA, ev.sizeA, ev.massA);
      const fb = !b && floor && !!ev.matB && !strike && floorFinish(ev.matB, ev.sizeB, ev.massB);
      if (fa && fb) {
        // Both could be floor (a loose board dropped on the planks): the heavier one is the floor.
        if (fin(ev.massA, 0) >= fin(ev.massB, 0)) a = true;
        else b = true;
      } else {
        a ||= fa;
        b ||= fb;
      }
    }
  }
  return (a ? 1 : 0) | (b ? 2 : 0);
}

function surfaceGuess(mat: MaterialId, size0: number, mass: number): boolean {
  const size = fin(size0, 0);
  if (!(size > 0)) return false;
  if (isStructure(size, mass)) return true;
  const min = FINISH_MIN_SIZE[mat];
  return min !== undefined && size >= min;
}

function floorFinish(mat: MaterialId, size0: number, mass: number): boolean {
  return FLOOR_FINISH.has(mat) && fin(size0, 0) >= 0.25 && fin(mass, 0) < 60;
}

function addImpactSide(out: Layer[], mat: MaterialId, size0: number, base: number, cutoff: number, E: number, striker: boolean, surface: boolean): void {
  const prof = profileOf(mat);
  let size = fin(size0, 0.3);
  if (!(size > 0)) size = 0.3;
  const structure = !striker && surface;
  if (structure && SURFACE_SET.has(prof)) {
    // Massive, bonded surface: local damped response, quieter than a free radiator.
    out.push({ id: `surface.${prof}`, db: base + PROFILE_DB[prof] + (SURFACE_DB[prof] ?? -4), cutoff, sample: SAMPLE_FOR_PROFILE[prof] });
    return;
  }
  const eff = structure ? 0.8 : Math.min(size, 2.2);
  const db = base + PROFILE_DB[prof] + sizeDb(eff) + (structure ? -1.5 : 0);
  const dp = debrisOf(prof);
  if (dp && !striker && (eff < 0.035 || E < 0.02)) {
    out.push({ id: `tick.${dp}`, db: db + 4, size: eff });
    return;
  }
  out.push({ id: `impact.${prof}`, db, size: eff, cutoff, sample: SAMPLE_FOR_PROFILE[prof] });
}

// ============================================================================ fracture & damage

/** Crack-crackle id for a material profile. */
export function crackIdFor(p: SoundProfile): string {
  switch (p) {
    case "glass":
      return "crack.glass";
    case "ceramic":
    case "stone":
      return "crack.ceramic";
    case "wood":
      return "crack.wood";
    case "plastic":
    case "electronics":
      return "crack.plastic";
    default:
      return "crack.dull";
  }
}

/** Fracture loudness: energy and broken volume (m³) both matter. */
export function fractureDb(energy: number, volume: number): number {
  return clamp(5 * log10(Math.max(fin(energy, 0), 1e-3) / 250) + 4 * log10(Math.max(fin(volume, 0), 1e-7) / 0.002), -30, 4);
}

export function fractureLayers(ev: FractureEv, rand: () => number, out: Layer[] = []): Layer[] {
  out.length = 0;
  const prof = profileOf(ev.mat);
  const V = Math.max(fin(ev.volume, 0), 1e-7);
  const size = fin(ev.size, 0.3);
  const db = fractureDb(ev.energy, V);
  const big = size > 0.35 || V > 0.002;
  const mat = ev.mat;
  switch (ev.mode) {
    case "shatter":
      if (prof === "glass") {
        out.push({ id: big ? "shatter.glass.l" : "shatter.glass.s", db, size, sample: "shatter.glass" });
        if (mat === "lcd") out.push({ id: "spark.crackle", db: db - 10 });
      } else if (prof === "ceramic") {
        out.push({ id: big ? "shatter.ceramic.l" : "shatter.ceramic.s", db, size });
      } else if (prof === "stone") {
        out.push({ id: "shatter.ceramic.l", db: db - 1, rate: 0.75 });
        out.push({ id: "break.concrete.chip", db: db - 4 });
      } else if (prof === "metal" || prof === "metalThin") {
        out.push({ id: "metal.clang", db, size });
        out.push({ id: "break.concrete.chip", db: db - 6, rate: 1.3 });
      } else out.push({ id: crackIdFor(prof), db });
      break;
    case "dice":
      out.push({ id: "shatter.tempered", db: db + 2, sample: "shatter.glass" });
      out.push({ id: "shatter.glass.l", db: db - 8 });
      break;
    case "splinter":
      if (ev.global) {
        out.push({ id: "break.wood.snap", db, size, sample: "break.wood" });
        out.push({ id: "break.wood.splinter", db: db - 5, size });
      } else {
        out.push({ id: "break.wood.splinter", db, size, sample: "break.wood" });
        if (big) out.push({ id: "break.wood.crack", db: db - 6, size });
      }
      break;
    case "crumble":
      if (prof === "drywall") out.push({ id: ev.global || big ? "break.drywall.crumble" : "break.drywall.punch", db });
      else if (prof === "concrete" || prof === "stone") out.push({ id: ev.global || V > 0.004 ? "break.concrete.crumble" : "break.concrete.chip", db });
      else if (prof === "wood") {
        // MDF / particleboard: a dull crack with a crumbly core.
        out.push({ id: "break.wood.crack", db, size, sample: "break.wood" });
        out.push({ id: "break.drywall.punch", db: db - 6, rate: 1.25 });
      } else out.push({ id: "break.drywall.punch", db });
      break;
    case "crack":
      out.push({ id: ev.global ? "break.plastic.snap" : "break.plastic.crack", db, size });
      if (mat && MATERIALS[mat]?.sparks) out.push({ id: "spark.crackle", db: db - 6 });
      break;
    case "bend":
      out.push({ id: "metal.tear", db });
      out.push({ id: "metal.dent", db: db - 4, size });
      break;
    case "soft":
      out.push({ id: prof === "paper" ? "tear.paper" : "tear.cloth", db: db + 4 });
      break;
  }
  // Delayed debris rattle as the pieces land and settle.
  const n = Math.max(0, fin(ev.pieces, 0)) + 0.3 * Math.max(0, fin(ev.micro, 0));
  const dp = debrisOf(prof);
  if (dp && n > 0.5) out.push({ id: `rattle.${dp}`, db: db - 8 + 3 * log10(1 + n), delay: 0.12 + 0.2 * rand() });
  return out;
}

export function chipLayers(mat: MaterialId, energy: number, rand: () => number, out: Layer[] = []): Layer[] {
  out.length = 0;
  const prof = profileOf(mat);
  const db = clamp(6 * log10(Math.max(fin(energy, 0), 1e-3) / 100) - 12, -40, -6);
  out.push({ id: crackIdFor(prof), db: db - 2 });
  const dp = debrisOf(prof);
  if (dp) out.push({ id: `tick.${dp}`, db, delay: 0.02 + 0.06 * rand() });
  return out;
}

export function crackLayers(mat: MaterialId, severity: number, size: number, out: Layer[] = []): Layer[] {
  out.length = 0;
  const prof = profileOf(mat);
  if (prof === "metal" || prof === "metalThin") {
    // Metals don't crack audibly except cast iron (stone-like ping).
    if (mat === "castIron") out.push({ id: "crack.ceramic", db: clamp(-20 + 14 * fin(severity, 0.5), -36, -6), rate: 0.6 });
    return out;
  }
  if (prof === "soft") return out;
  out.push({ id: crackIdFor(prof), db: clamp(-20 + 14 * clamp(fin(severity, 0.5), 0, 1) + 3 * log10(Math.max(fin(size, 0.3), 0.01) / 0.3), -36, -4) });
  return out;
}

export function dentLayers(energy: number, depth: number, size: number, out: Layer[] = []): Layer[] {
  out.length = 0;
  const db = clamp(6 * log10(Math.max(fin(energy, 0), 1e-3) / 100) - 4 + 3 * log10(Math.max(fin(depth, 0), 1e-4) / 0.01), -36, 0);
  out.push({ id: "metal.dent", db, size: fin(size, 0.4) });
  return out;
}

/** Fastener-failure sound per bond kind (null = material-specific / none). */
export const BOND_SOUND: Readonly<Record<BondKind, string | null>> = {
  glue: "bond.glue",
  screw: "bond.screw",
  nail: "bond.nail",
  dowel: "bond.glue",
  weld: "bond.weld",
  bolt: "bond.bolt",
  press: "bond.press",
  clip: "bond.clip",
  mortar: "bond.mortar",
  fused: null,
  friction: null,
  hinge: "bond.hinge",
  slider: "bond.slider",
  latch: "bond.latch",
};

export function bondLayers(kind: BondKind, matA: MaterialId, matB: MaterialId | null, energy: number, out: Layer[] = []): Layer[] {
  out.length = 0;
  const db = clamp(5 * log10(Math.max(fin(energy, 0), 0.1) / 40) - 8, -34, -2);
  const pa = profileOf(matA);
  const pb = matB ? profileOf(matB) : null;
  const id = BOND_SOUND[kind];
  if (id) {
    out.push({ id, db, rate: kind === "dowel" ? 0.8 : undefined });
    // Screws/nails tearing out of wood also crack the wood around them.
    if ((kind === "screw" || kind === "nail" || kind === "hinge") && (pa === "wood" || pb === "wood")) out.push({ id: "crack.wood", db: db - 4 });
  } else if (kind === "fused") {
    out.push({ id: crackIdFor(pa), db: db + 2 });
  } else if (kind === "friction") {
    const dp = debrisOf(pa);
    if (dp) out.push({ id: `tick.${dp}`, db: db - 6 });
  }
  return out;
}

/** Island breaking loose: creak + settle, material inferred from recent nearby events. */
export function splitLayers(mass: number, recent: SoundProfile | null, out: Layer[] = []): Layer[] {
  out.length = 0;
  const db = clamp(-18 + 5 * log10(Math.max(fin(mass, 1), 0.1) / 10), -34, -6);
  if (recent === "metal" || recent === "metalThin") out.push({ id: "creak.metal", db: db - 2 });
  else if (recent === "drywall" || recent === "concrete" || recent === "stone") out.push({ id: "crack.dull", db: db - 2 });
  else if (recent === "glass" || recent === "ceramic") out.push({ id: crackIdFor(recent), db: db - 4 });
  out.push({ id: "settle", db });
  return out;
}

// ============================================================================ player foley

export function isFleshTool(tool: string | undefined): boolean {
  return !tool || /hand|fist|kick|foot|boot|stomp|body|punch/i.test(tool);
}

export function swingLayer(tool: string, power: number): Layer {
  const p = clamp(fin(power, 0.5), 0, 1);
  const t = tool.toLowerCase();
  const id = /sledge|extinguisher/.test(t) ? "swing.heavy" : /bat|crowbar|axe/.test(t) ? "swing.medium" : "swing.light";
  return { id, db: -22 + 12 * p, rate: (t.includes("hammer") && !t.includes("sledge") ? 0.92 : 1) * (0.85 + 0.3 * p) };
}

/** Body-part thud per flesh "tool" (fists, kick, stomp). */
export function bodyThudId(tool: string | undefined): string {
  const t = (tool ?? "").toLowerCase();
  return /stomp/.test(t) ? "stomp" : /kick|foot|boot|leg/.test(t) ? "kick.thud" : "punch.thud";
}

/**
 * Extra layers for a player strike (the struck material's ring comes from the impact event):
 * fists / kicks / stomps add the body thud (+ a sharp transient and an "ouch" when the target
 * is hard), real tools add a sharp contact transient.
 */
export function toolHitLayers(tool: string, energy: number, hard: boolean, out: Layer[] = []): Layer[] {
  out.length = 0;
  const E = Math.max(fin(energy, 0), 1e-3);
  if (isFleshTool(tool)) {
    const id = bodyThudId(tool);
    out.push({ id, db: clamp(-12 + 6 * log10(E / 50), -30, -2), sample: "punch" });
    if (hard) {
      out.push({ id: "tool.transient", db: clamp(6 * log10(E / 100) - 12, -34, -8), cutoff: 9000 });
      out.push({ id: "ouch", db: clamp(-10 + 4 * log10(E / 50), -24, -4), sample: "punch" });
    }
  } else out.push({ id: "tool.transient", db: clamp(6 * log10(E / 100) - 6, -30, -2), cutoff: 20000 });
  return out;
}

export function stepIdFor(mat: MaterialId | null | undefined): string {
  if (!mat) return "step.wood";
  const p = profileOf(mat);
  switch (p) {
    case "wood":
      return "step.wood";
    case "glass":
    case "ceramic":
    case "stone":
    case "metal":
    case "metalThin":
      return "step.tile";
    case "soft":
    case "paper":
    case "flesh":
      return "step.carpet";
    default:
      return "step.concrete";
  }
}

/** Footsteps: subtle; louder when sprinting, very quiet when crouching (speed in m/s). */
export function footstepDb(speed: number): number {
  return clamp(-24 + 12 * log10(Math.max(fin(speed, 3.6), 0.3) / 3.6), -34, -16);
}

export function landDb(speed: number): number {
  return clamp(-16 + 14 * log10(Math.max(fin(speed, 4), 0.5) / 4), -30, -4);
}

// ============================================================================ propagation

/** Web Audio "inverse" distance model (replicated for priorities). */
export function inverseDistanceGain(d: number, ref: number, rolloff: number): number {
  return ref / (ref + rolloff * (Math.max(d, ref) - ref));
}

/** Rolloff by loudness class: loud sounds carry, ticks fall off fast. */
export function rolloffFor(db: number): number {
  return db > -6 ? 0.75 : db > -20 ? 1 : 1.5;
}

/** Gain through an occluded path (occ 0 = blocked … 1 = clear): fully blocked ≈ −16 dB. */
export function occlusionGain(occ: number): number {
  return 0.16 + 0.84 * Math.pow(clamp(fin(occ, 1), 0, 1), 0.8);
}

/** Low-pass cutoff through an occluded path: blocked ≈ 380 Hz, clear = open. */
export function occlusionCutoff(occ: number): number {
  return 380 * Math.pow(20000 / 380, Math.pow(clamp(fin(occ, 1), 0, 1), 1.3));
}

/** Air absorption + distance dulling (Hz). */
export function airCutoff(d: number): number {
  return Math.max(800, 20000 * Math.exp(-Math.max(0, fin(d, 0)) / 35));
}

/** Diffraction loss around a portal edge for bend angle θ (cos θ of the two path legs). */
export function diffraction(cosTheta: number): number {
  return 0.25 + 0.75 * Math.pow((1 + clamp(cosTheta, -1, 1)) / 2, 1.5);
}

/**
 * Delay (s) until the crash of a body that left the world at height y (m, relative to the
 * apartment floor) is heard: remaining free fall to the street plus sound travel back up.
 */
export function fallOutDelay(y: number, streetY: number): number {
  const g = 9.81;
  const fallen = Math.max(0, -fin(y, -30));
  const v = Math.sqrt(2 * g * fallen);
  const h = Math.max(0, fin(y, -30) - streetY);
  const t = (-v + Math.sqrt(v * v + 2 * g * h)) / g;
  return clamp(t + Math.abs(streetY) / 343, 0.2, 8);
}

// ============================================================================ rate limiting

/** Level (dB, estimated at the listener) above which a layer is never family-rate-limited. */
export const LIMIT_BYPASS_DB = -18;
/** A layer this much louder than its family's recent peak passes even an empty bucket. */
export const LIMIT_OVERRIDE_DB = 6;

/**
 * Priority-aware token buckets keyed by string (per sound family). Buckets only thin out
 * quiet, numerous layers (debris showers): a layer loud at the listener (≥ LIMIT_BYPASS_DB)
 * never takes or needs a token, and a layer clearly louder than everything the family played
 * recently (peak decays 20 dB/s) passes an empty bucket — so distant rattle can never mask the
 * next big close hit.
 */
export class TokenBuckets {
  private m = new Map<string, { tokens: number; t: number; peak: number; pt: number }>();

  /** `levelDb` = estimated level at the listener (omit for a plain token bucket). */
  allow(key: string, now: number, cap: number, rate: number, levelDb = -Infinity): boolean {
    if (levelDb >= LIMIT_BYPASS_DB) {
      this.notePeak(key, now, levelDb, cap);
      return true;
    }
    let b = this.m.get(key);
    if (!b) {
      b = { tokens: cap, t: now, peak: -Infinity, pt: now };
      this.m.set(key, b);
    }
    b.tokens = Math.min(cap, b.tokens + Math.max(0, now - b.t) * rate);
    b.t = now;
    const peak = b.peak - 20 * Math.max(0, now - b.pt);
    if (b.tokens >= 1) {
      b.tokens -= 1;
    } else if (!(levelDb > peak + LIMIT_OVERRIDE_DB)) return false;
    if (levelDb > peak) {
      b.peak = levelDb;
      b.pt = now;
    }
    return true;
  }

  private notePeak(key: string, now: number, levelDb: number, cap: number): void {
    let b = this.m.get(key);
    if (!b) {
      b = { tokens: cap, t: now, peak: -Infinity, pt: now };
      this.m.set(key, b);
    }
    if (levelDb > b.peak - 20 * Math.max(0, now - b.pt)) {
      b.peak = levelDb;
      b.pt = now;
    }
  }

  prune(now: number, maxAge = 5): void {
    for (const [k, b] of this.m) if (now - b.t > maxAge && now - b.pt > maxAge) this.m.delete(k);
  }

  get size(): number {
    return this.m.size;
  }
}

/**
 * Per-island impact limiter: an island may sound at most every `minInterval` seconds unless
 * the new hit is `override`× more energetic (so a big hit is never masked by rattling).
 */
export class IslandLimiter {
  private m = new Map<number, { t: number; e: number }>();

  check(id: number, now: number, energy: number, minInterval = 0.035, override = 3): boolean {
    if (!(id >= 0)) return true;
    const r = this.m.get(id);
    if (!r) return true;
    return now - r.t >= minInterval || energy >= r.e * override;
  }

  record(id: number, now: number, energy: number): void {
    if (!(id >= 0)) return;
    const r = this.m.get(id);
    if (r) {
      r.t = now;
      r.e = energy;
    } else this.m.set(id, { t: now, e: energy });
  }

  prune(now: number, maxAge = 3): void {
    for (const [k, r] of this.m) if (now - r.t > maxAge) this.m.delete(k);
  }

  get size(): number {
    return this.m.size;
  }
}

/** Rate-limit parameters (burst capacity, refill per second) by sound group. */
export const RATE_LIMITS: Readonly<Record<string, readonly [number, number]>> = {
  impact: [12, 36],
  tick: [16, 60],
  rattle: [4, 8],
  shatter: [4, 6],
  break: [6, 12],
  bond: [8, 20],
  crack: [6, 15],
  metal: [6, 14],
  step: [6, 14],
  swing: [3, 8],
  cloth: [3, 8],
  tear: [3, 6],
  spark: [3, 6],
  default: [6, 15],
};

/** Family key used for rate limiting: "impact.wood.m" → "impact.wood"; "step.tile" → "step.tile". */
export function familyKey(id: string): string {
  const m = /^(.*)\.(s|m|l)$/.exec(id);
  return m ? m[1] : id;
}

export function limitsFor(id: string): readonly [number, number] {
  const g = id.split(".")[0];
  return RATE_LIMITS[g] ?? RATE_LIMITS.default;
}
