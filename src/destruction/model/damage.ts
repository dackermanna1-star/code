// Damage model (PURE): turns an impact on a part into an outcome (dents, cracks, damage
// accumulation, bond damage, fracture plan). The runtime applies outcomes to its objects.
// Contract owned by the orchestrator; implementation by the destruction-model agent.
// See docs/ARCHITECTURE.md §4.2–4.7.
//
// MODEL SUMMARY (all energies in J, lengths in m)
//  * Contact: E = loss·J²/(2μ), μ = reduced mass (static side = ∞), shareA = kB/(kA+kB),
//    loss = shareA·lossA + shareB·lossB (each side dissipates its loss fraction of what it stores).
//  * Strength scatter: thresholds × flaw (deterministic per part id, log-normal, tuning.ts) ×
//    a ±4 % per-impact variation from the rng.
//  * Global failure: E_g = max(u·V/clamp(aspect/6, 0.5, 4), gSep·V/ext0) — bulk strain energy
//    (slender parts snap more easily) and a separation term (energy of one crack through the
//    mean cross-section: physical size effect, small shards/tiles survive light knocks).
//    V is the solid volume (mass/density for hollow parts). Not for `supported` parts except
//    glass/tempered/lcd; ∞ for bend/soft. Sharp tools spend their energy locally: E_g is
//    compared with E/sharpness.
//  * Local breakout: E = G·2π·r·min(t, α·r) with α = √(0.02/r_c) (small contact → smaller,
//    deeper; large contact → wider, shallower); a blunt contact cannot punch out a plug smaller
//    than 0.75·r_c; blunt holes are widened by the crushed contact patch. r > 0.6 × in-plane
//    size (a plate's middle extent, whatever face was hit) → global failure if the energy is
//    also ≥ 0.5·E_g, else a clamped big hole / edge chip.
//    Tempered glass never breaks out locally: it dices when E·concentration ≥ E_g (×0.3 near
//    an edge) into ~2–3 cm cubes on a grid (plan.ts planDice: no palm-sized plates remain).
//  * Fatigue: E_eff = E·(1 + fatigue·D/E_threshold), D = distance-weighted remembered damage;
//    only the RAW delivered energy is remembered, and hits below ~6–20 % of the threshold
//    (raw load ratio) leave little or no memory (endurance limit). Callers decay D.
//  * Ductile dents: r_d = max(dentRadius·(E/100)^⅓, r_c), depth = E/(Y·π·r_d²); the accumulated
//    displacement anywhere is capped at min(maxDent·ext2, 0.5·ext1) — energy beyond the cap
//    spreads into wider dents around the hit. Crumple when Σdepth·r² is large relative to the
//    sheet (bonds then take double load); a crumpled thin sheet tears when a strong blow plus
//    remembered damage reaches tearZone·Y·t·L (L = tear length).
//  * Soft: absorb blunt hits; sharp strikes (sharpness ≥ 2) tear (crack line + fluff chips) and
//    heavily torn parts split into chunks.

import type { Vec3 } from "../../geom/vec.ts";
import type { ConvexPoly } from "../../geom/poly.ts";
import { growCracks, type Dent, type Crack } from "../../geom/meshgen.ts";
import type { Rng } from "../../core/rng.ts";
import type { MaterialDef, MaterialId, FailureMode, MicroKind } from "./materials.ts";
import type { BondKind } from "./types.ts";
import { K, TUNING } from "./tuning.ts";
import { planFracture } from "./plan.ts";
import type { SeedPattern } from "../../geom/fracture.ts";
import {
  addDamage,
  clamp01,
  crumpleMetric,
  dentDepthAt,
  edgeDistance,
  effVolume,
  fatigueRadius,
  fatigueSum,
  fin,
  finVec,
  localGeom,
  partFlaw,
  smooth,
  type LocalGeom,
} from "./util.ts";

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


// ============================================================================ constants

/** Materials whose global failure ignores `supported` (panes shatter even when clamped). */
const GLASS_FAMILY: ReadonlySet<MaterialId> = new Set<MaterialId>(["glass", "temperedGlass", "lcd"]);

/** Stiffness / loss of the rigid world (concrete-like building) when matB is null. */
const WORLD_STIFFNESS = 10;
const WORLD_LOSS = 0.8;

const KIND_FACTOR: Readonly<Record<BondKind, number>> = {
  glue: 0.8, // strong in shear, weak in peel
  screw: 0.7,
  nail: 0.85, // weak in pull-out
  dowel: 0.8,
  weld: 0.8,
  bolt: 0.5,
  press: 1,
  clip: 1,
  mortar: 1, // brittle
  fused: 1, // brittle continuity
  friction: 1,
  hinge: 0.6, // strong in shear
  slider: 0.7,
  latch: 1, // doors get kicked open
};

/** Fallback seam toughness (J/m²) for materials without G (metal continuity / soft goods). */
const FUSED_G_BEND = 300000;
const FUSED_G_SOFT = 20000;

// ============================================================================ energy

/**
 * Energy dissipated by an impact with normal impulse J between masses mA, mB (Infinity for
 * static) made of matA/matB; shareA by relative stiffness (softer absorbs more) and loss.
 */
export function impactEnergy(J: number, mA: number, mB: number, matA: MaterialDef, matB: MaterialDef | null): ImpactEnergy {
  const kA = Math.max(1e-3, fin(matA?.stiffness, 1));
  const kB = matB ? Math.max(1e-3, fin(matB.stiffness, 1)) : WORLD_STIFFNESS;
  const shareA = kB / (kA + kB);
  const lA = clamp01(fin(matA?.loss, 0.8));
  const lB = matB ? clamp01(fin(matB.loss, 0.8)) : WORLD_LOSS;
  const loss = shareA * lA + (1 - shareA) * lB;
  const a = mA > 0 ? mA : Infinity; // NaN / ≤ 0 → treated as immovable
  const b = mB > 0 ? mB : Infinity;
  let mu: number;
  if (!Number.isFinite(a) && !Number.isFinite(b)) mu = Infinity;
  else if (!Number.isFinite(a)) mu = b;
  else if (!Number.isFinite(b)) mu = a;
  else mu = (a * b) / (a + b);
  const j = Number.isFinite(J) && J > 0 ? J : 0;
  const E = j > 0 && Number.isFinite(mu) && mu > 0 ? (loss * j * j) / (2 * mu) : 0;
  return { E: Number.isFinite(E) ? E : 0, shareA, mu };
}

/** Global failure energy ignoring the `supported` rule, with strength multiplier `mul`. */
function globalEnergyRaw(part: PartState, mul: number): number {
  const m = part.mat;
  if (m.mode === "bend" || m.mode === "soft") return Infinity;
  const V = effVolume(part);
  if (!(V > 0)) return Infinity;
  const e0 = Math.max(1e-6, fin(part.ext[0], 0));
  const e2 = Math.max(1e-6, fin(part.ext[2], 0));
  const af = Math.min(4, Math.max(0.5, e0 / e2 / 6));
  const bulk = (Math.max(0, m.u) * mul * V) / af;
  const sep = (TUNING[m.id]?.gSep ?? 0) * mul * (V / e0);
  return Math.max(1e-6, bulk, sep);
}

/** Energy needed for a global failure of the part (J). Infinity for ductile/soft. */
export function globalFailureEnergy(part: PartState): number {
  if (part.supported && !GLASS_FAMILY.has(part.mat.id)) return Infinity;
  return globalEnergyRaw(part, strengthOf(part));
}

function strengthOf(part: PartState): number {
  const s = fin(part.strength, 1);
  return s > 0 ? s : 1;
}

/** Fracture-surface energy of a breakout of radius r and depth min(t, α·r). */
function localEnergy(G: number, r: number, t: number, alpha: number): number {
  return G * 2 * Math.PI * r * Math.min(t, alpha * r);
}

/** Inverse of localEnergy for r (closed form on both branches). */
function solveRadius(G: number, E: number, t: number, alpha: number): number {
  if (!(G > 0) || !(E > 0) || !(t > 0)) return 0;
  const eCross = (2 * Math.PI * G * t * t) / alpha; // energy at α·r = t
  return E <= eCross ? Math.sqrt(E / (2 * Math.PI * G * alpha)) : E / (2 * Math.PI * G * t);
}

/** Breakout radius (m) for effective energy E at a point with thickness t along dir. */
export function breakoutRadius(part: PartState, E: number, t: number): number {
  const G = part.mat.G * strengthOf(part);
  const r = solveRadius(G, fin(E, 0), fin(t, 0), 1);
  return Number.isFinite(r) ? r : 0;
}

/** Fracture threshold at a point for the default contact (used as the fatigue reference). */
function referenceEnergy(part: PartState, rc: number, t: number): number {
  const m = part.mat;
  const s = strengthOf(part);
  const Eg = globalFailureEnergy(part);
  const alpha = Math.min(2.5, Math.max(0.5, Math.sqrt(K.contactRef / rc)));
  const El = m.mode === "dice" || !(m.G > 0) ? Infinity : localEnergy(m.G * s, Math.max(m.rMin, K.bluntPlug * rc), t, alpha);
  return Math.min(Eg, El);
}

/** Effective energy including fatigue from nearby damage points. */
export function effectiveEnergy(part: PartState, p: Vec3, E: number): number {
  const e = Math.max(0, fin(E, 0));
  if (!(e > 0) || !part.dmg?.length || !finVec(p)) return e;
  const rc = K.defaultContact;
  const D = fatigueSum(part.dmg, p, fatigueRadius(part, rc));
  if (!(D > 0)) return e;
  const Eref = referenceEnergy(part, rc, Math.max(1e-4, fin(part.ext[2], 0.01)));
  if (!(Eref > 0) || !Number.isFinite(Eref)) return e;
  return e + Math.min((e * part.mat.fatigue * D) / Eref, part.mat.fatigue * Eref);
}

// ============================================================================ bonds

/**
 * Inertial bond loading for the rest of an island when it receives impulse J at a point:
 * returns extra damage per bond id for bonds NOT on the impacted part.
 */
export function inertialBondDamage(J: number, islandMass: number, bonds: Array<{ id: number; farMass: number; kind: BondKind }>): Array<{ bondId: number; amount: number }> {
  const out: Array<{ bondId: number; amount: number }> = [];
  if (!(J > 0) || !Number.isFinite(J) || !(islandMass > 0) || !Number.isFinite(islandMass)) return out;
  const M = islandMass;
  for (const b of bonds) {
    const fm = Math.min(M, Math.max(0, fin(b.farMass, 0)));
    const amount = ((J * J * fm) / (2 * M * M)) * bondKindFactor(b.kind);
    if (amount > 0 && Number.isFinite(amount)) out.push({ bondId: b.id, amount });
  }
  return out;
}

/** Strength (J) of a `fused` bond between two cells of material m sharing `area` m². */
export function fusedStrength(m: MaterialDef, area: number, strengthMul?: number): number {
  const a = Math.max(0, fin(area, 0));
  const mul = strengthMul !== undefined && Number.isFinite(strengthMul) && strengthMul > 0 ? strengthMul : 1;
  const G = m.G > 0 ? m.G : m.mode === "bend" ? FUSED_G_BEND : FUSED_G_SOFT;
  return Math.max(0.01, G * a * K.fusedFactor * mul);
}

/** Kind multiplier: how much of a direct/inertial load a bond kind takes (nails weak in pull-out...). */
export function bondKindFactor(kind: BondKind): number {
  return KIND_FACTOR[kind] ?? 1;
}

/** Hardness 0..1 of a material for tool recoil / punch pain. */
export function hardness(mat: MaterialId): number {
  return TUNING[mat]?.hard ?? 0.5;
}

// ============================================================================ respond

interface Ctx {
  part: PartState;
  imp: ImpactOnPart;
  rng: Rng;
  /** Delivered energy (J, sanitised). */
  E: number;
  p: Vec3;
  dir: Vec3;
  /** Contact radius (m) — material/passive default when unknown. */
  rc: number;
  sharp: number;
  geom: LocalGeom;
  /** Fatigue radius (m) and remembered damage near p (J). */
  Rf: number;
  D: number;
  out: PartOutcome;
}

/** Main entry: decide and plan the part's response to an impact. Deterministic for a given rng. */
export function respond(part: PartState, imp: ImpactOnPart, rng: Rng): PartOutcome {
  const out: PartOutcome = {
    absorbed: 0,
    addDents: [],
    addCracks: [],
    dmg: Array.isArray(part.dmg) ? part.dmg.slice() : [],
    bondDamage: [],
    chips: [],
    fracture: null,
    crackSeverity: 0,
    dentDepth: 0,
    crumpled: false,
  };
  const E = Math.max(0, fin(imp?.energy, 0));
  if (!(E > 1e-6) || !part?.poly?.faces?.length) return out;
  out.absorbed = E;
  const p = finVec(imp.point) ? imp.point : part.centroid;
  let dir = imp.dir;
  let dl = finVec(dir) ? Math.hypot(dir.x, dir.y, dir.z) : 0;
  if (!(dl > 1e-9)) {
    dir = { x: part.centroid.x - p.x, y: part.centroid.y - p.y, z: part.centroid.z - p.z };
    dl = Math.hypot(dir.x, dir.y, dir.z);
    if (!(dl > 1e-9)) {
      dir = { x: 0, y: -1, z: 0 };
      dl = 1;
    }
  }
  dir = { x: dir.x / dl, y: dir.y / dl, z: dir.z / dl };
  const rc = imp.contactRadius > 0 && Number.isFinite(imp.contactRadius) ? Math.min(0.3, Math.max(0.001, imp.contactRadius)) : K.defaultContact;
  const sharp = imp.sharpness > 0 && Number.isFinite(imp.sharpness) ? Math.min(5, Math.max(0.1, imp.sharpness)) : 1;
  const geom = localGeom(part, p, dir);
  const Rf = fatigueRadius(part, rc);
  const D = fatigueSum(part.dmg ?? [], p, Rf);
  const ctx: Ctx = { part, imp, rng, E, p, dir, rc, sharp, geom, Rf, D, out };
  let bondMul = 1;
  switch (part.mat.mode) {
    case "soft":
      bondMul = respondSoft(ctx);
      break;
    case "bend":
      bondMul = respondBend(ctx);
      break;
    default:
      bondMul = respondBrittle(ctx);
  }
  directBondDamage(ctx, bondMul);
  return out;
}

/** Direct bond loading: E·w_b·kind, w_b ∝ 1/(1 + |p − anchor|/size), normalised; endurance limit. */
function directBondDamage(c: Ctx, mul: number): void {
  const bonds = c.part.bonds;
  if (!bonds?.length || !(mul > 0)) return;
  const size = Math.max(1e-3, fin(c.part.ext[0], 0.1));
  const w = new Float64Array(bonds.length);
  let ws = 0;
  for (let i = 0; i < bonds.length; i++) {
    const a = bonds[i].anchor;
    const d = finVec(a) ? Math.hypot(a.x - c.p.x, a.y - c.p.y, a.z - c.p.z) : size;
    w[i] = 1 / (1 + d / size);
    ws += w[i];
  }
  const done = new Map<number, number>();
  for (const bd of c.out.bondDamage) done.set(bd.bondId, bd.amount);
  const list: Array<{ bondId: number; amount: number }> = [];
  for (let i = 0; i < bonds.length; i++) {
    const b = bonds[i];
    let amount = ((c.E * w[i]) / ws) * bondKindFactor(b.kind) * mul;
    if (b.max > 0 && amount < K.bondEndurance * b.max) amount = 0;
    const extra = done.get(b.id) ?? 0;
    amount = Math.max(amount, extra);
    if (amount > 0 && Number.isFinite(amount)) list.push({ bondId: b.id, amount });
  }
  c.out.bondDamage = list;
}

function remember(c: Ctx, e: number): void {
  if (e > 0 && Number.isFinite(e)) c.out.dmg = addDamage(c.part.dmg ?? [], c.p, e, 0.35 * c.Rf);
}

function cracks(c: Ctx, severity: number, radial: boolean): void {
  if (!(severity > 0) || (c.part.cracks?.length ?? 0) >= 48) return;
  try {
    const list = growCracks(c.part.poly, c.p, c.dir, Math.min(1, severity), c.rng, { radial });
    for (const k of list) if (k.points.length >= 2) c.out.addCracks.push(k);
  } catch {
    /* geometry edge case: no crack lines */
  }
  if (c.out.addCracks.length) c.out.crackSeverity = Math.min(1, severity);
}

/** Tiny surface chips (micro-debris, no fracture) flying out of the hit surface. */
function chips(c: Ctx, n: number, sizeLo: number, sizeHi: number, speed: number): void {
  const fN = c.geom.faceN;
  const e1x = Math.abs(fN.x) < 0.9 ? 0 : fN.z,
    e1y = Math.abs(fN.x) < 0.9 ? -fN.z : 0,
    e1z = Math.abs(fN.x) < 0.9 ? fN.y : -fN.x;
  const l = Math.hypot(e1x, e1y, e1z) || 1;
  const e1 = { x: e1x / l, y: e1y / l, z: e1z / l };
  const e2 = { x: fN.y * e1.z - fN.z * e1.y, y: fN.z * e1.x - fN.x * e1.z, z: fN.x * e1.y - fN.y * e1.x };
  for (let i = 0; i < n; i++) {
    const size = c.rng.range(sizeLo, sizeHi);
    const a = c.rng.range(0, Math.PI * 2),
      r = 0.6 * c.rc * Math.sqrt(c.rng.next());
    const u = Math.cos(a) * r,
      v = Math.sin(a) * r;
    const p = {
      x: c.p.x + e1.x * u + e2.x * v + fN.x * 0.5 * size,
      y: c.p.y + e1.y * u + e2.y * v + fN.y * 0.5 * size,
      z: c.p.z + e1.z * u + e2.z * v + fN.z * 0.5 * size,
    };
    const ju = c.rng.range(-0.6, 0.6),
      jv = c.rng.range(-0.6, 0.6),
      jn = c.rng.range(0.6, 1);
    let vx = fN.x * jn + e1.x * ju + e2.x * jv,
      vy = fN.y * jn + e1.y * ju + e2.y * jv,
      vz = fN.z * jn + e1.z * ju + e2.z * jv;
    const vl = Math.hypot(vx, vy, vz) || 1;
    const s = speed * c.rng.range(0.7, 1.3);
    vx = (vx / vl) * s;
    vy = (vy / vl) * s;
    vz = (vz / vl) * s;
    c.out.chips.push({ p, v: { x: vx, y: vy, z: vz }, size });
  }
}

function patternFor(mat: MaterialDef): SeedPattern {
  switch (mat.mode) {
    case "shatter":
      return mat.id === "glass" || mat.id === "lcd" ? "radial" : "chunks";
    case "dice":
      return "dice";
    case "splinter":
      return "splinter";
    case "crumble":
      return "crumble";
    default:
      return "crack";
  }
}

function plan(c: Ctx, o: { global: boolean; mode: FailureMode; pattern: SeedPattern; radius: number; depth: number; through: boolean; overload: number; count?: number }): FracturePlan | null {
  const f = c.geom.face;
  const faceD = f ? f.d : c.geom.faceN.x * c.p.x + c.geom.faceN.y * c.p.y + c.geom.faceN.z * c.p.z;
  try {
    return planFracture({
      part: c.part,
      global: o.global,
      mode: o.mode,
      pattern: o.pattern,
      center: c.p,
      dir: c.dir,
      faceN: c.geom.faceN,
      faceD,
      radius: o.radius,
      depth: o.depth,
      through: o.through,
      t: c.geom.t,
      energy: c.E,
      overload: o.overload,
      count: o.count,
      rng: c.rng,
    });
  } catch {
    return null; // degenerate geometry: the hit only damages (no crash in the game loop)
  }
}

/** After a global failure the transferred bonds are weakened (jagged shards hang loosely). */
function weakenTransferred(c: Ctx, fp: FracturePlan, frac: number): void {
  const byId = new Map(c.part.bonds.map((b) => [b.id, b] as const));
  for (const t of fp.bondTransfer) {
    if (t.cell < 0) continue;
    const b = byId.get(t.bondId);
    if (b && b.health > 0) c.out.bondDamage.push({ bondId: b.id, amount: b.health * frac });
  }
}

/** Brittle modes: shatter, dice, splinter, crumble, crack. Returns the bond-load multiplier. */
function respondBrittle(c: Ctx): number {
  const { part, E, sharp, rc, geom, D } = c;
  const mat = part.mat;
  const flaw = partFlaw(part) * Math.exp(0.04 * c.rng.gauss());
  const str = strengthOf(part) * flaw;
  const dice = mat.mode === "dice";
  const globalAllowed = !part.supported || GLASS_FAMILY.has(mat.id);
  let Eg = globalAllowed ? globalEnergyRaw(part, str) : Infinity;
  if (dice && geom.planar && edgeDistance(part.poly, c.p, geom.faceN) < K.edgeDist) Eg *= K.edgeFactor;
  const rNeed = Math.max(mat.rMin, (sharp < 1.5 ? K.bluntPlug : 0.4) * rc);
  const alpha = Math.min(2.5, Math.max(0.5, Math.sqrt(K.contactRef / rc)));
  const G = mat.G * str;
  const El = dice || !(G > 0) ? Infinity : localEnergy(G, rNeed, geom.t, alpha);
  // Fatigue amplification, saturating: remembered damage can add at most fatigue × threshold
  // (it lets sub-threshold hits accumulate to failure without inflating big hits without bound).
  const amp = (ref: number): number => (Number.isFinite(ref) && ref > 0 ? 1 + Math.min((mat.fatigue * D) / ref, (mat.fatigue * ref) / E) : 1);
  const EeffG = (E * amp(Eg)) / Math.max(1, sharp);
  const EeffL = E * amp(El) * sharp;
  const conc = sharp * Math.min(2, Math.max(0.7, Math.sqrt(K.contactRef / rc)));
  const EeffD = dice ? E * amp(Eg) * conc : 0;
  const rG = Number.isFinite(Eg) ? Math.max(EeffG, EeffD) / Eg : 0;
  const rL = Number.isFinite(El) ? EeffL / El : 0;
  const ratio = Math.max(rG, rL);
  const pattern = patternFor(mat);

  let fp: FracturePlan | null = null;
  if (rG >= 1) {
    fp = plan(c, { global: true, mode: mat.mode, pattern, radius: 0, depth: geom.t, through: true, overload: rG });
  } else if (rL >= 1) {
    // Sharpness lowers the threshold (concentration) but does not make the hole larger: the
    // radius comes from the energy itself, at least the minimum breakout.
    const rE = Math.max(rNeed, solveRadius(G, EeffL / Math.max(1, sharp), geom.t, alpha));
    {
      let r = sharp < 1.5 ? Math.sqrt(rE * rE + 0.25 * rc * rc) : rE;
      const rMax = K.globalFrac * geom.inPlaneMin;
      // A breakout that would span most of the part becomes a global failure only when the
      // energy is also a meaningful fraction of the global threshold; otherwise it stays a
      // (clamped) local breakout — an edge chip, not an exploding door.
      if (r > rMax && globalAllowed && Number.isFinite(Eg) && rG >= K.promoteFrac) {
        fp = plan(c, { global: true, mode: mat.mode, pattern, radius: 0, depth: geom.t, through: true, overload: Math.max(1, rL) });
      } else {
        r = Math.min(r, rMax);
        const depth = Math.min(geom.t, alpha * r);
        fp = plan(c, { global: false, mode: mat.mode, pattern, radius: r, depth, through: alpha * r >= 0.85 * geom.t, overload: rL });
      }
    }
  }
  if (fp) {
    c.out.fracture = fp;
    if (fp.global) weakenTransferred(c, fp, GLASS_FAMILY.has(mat.id) ? 0.6 : 0.4);
  } else {
    // ---- sub-threshold: cracks, chips, small plastic dents
    // visible cracks start at a fraction of the NOMINAL threshold (flaw scatter decides failure, not cracking)
    const rc0 = ratio * flaw;
    if (rc0 >= mat.crackFraction && mat.crackFraction < 1) {
      cracks(c, Math.min(1, Math.max(0.05, (rc0 - mat.crackFraction) / (1 - mat.crackFraction))), geom.planar && (mat.id === "glass" || mat.id === "lcd"));
    }
    if (mat.chip > 0 && ratio >= 0.04 && E >= 0.3) {
      const n = Math.min(14, Math.floor(mat.chip * (2 + 10 * Math.sqrt(ratio)) * c.rng.range(0.6, 1.4)));
      if (n > 0) chips(c, n, 0.15 * mat.minFragment, 0.6 * mat.minFragment, Math.min(6, 1.5 + 3 * Math.sqrt(ratio)));
    }
    if (mat.mode === "crack" && mat.dentRadius > 0 && mat.yieldY > 0 && E >= 0.5) dent(c, false);
  }
  // ---- fatigue memory. The RAW delivered energy is remembered (the amplification only
  // decides failure; storing amplified energy would make the memory feed on itself), gated by an
  // endurance limit on the raw load ratio: knocks below ~6 % of the threshold leave nothing,
  // however often they repeat (rattling contacts, objects being set down).
  const rawG = Number.isFinite(Eg) ? Math.max(E / Math.max(1, sharp), dice ? E * conc : 0) / Eg : 0;
  const rawL = Number.isFinite(El) ? (E * sharp) / El : 0;
  const gate = smooth(K.enduranceLo, K.enduranceHi, Math.max(rawG, rawL));
  remember(c, E * gate);
  return 1;
}

/** Unit in-plane basis (e1, e2) perpendicular to n. */
function planeBasis(n: Vec3): [Vec3, Vec3] {
  const ax = Math.abs(n.x) < 0.9;
  const e1x = ax ? 0 : n.z,
    e1y = ax ? -n.z : 0,
    e1z = ax ? n.y : -n.x;
  const l = Math.hypot(e1x, e1y, e1z) || 1;
  const e1 = { x: e1x / l, y: e1y / l, z: e1z / l };
  return [e1, { x: n.y * e1.z - n.z * e1.y, y: n.z * e1.x - n.x * e1.z, z: n.x * e1.y - n.y * e1.x }];
}

/**
 * Largest depth a new dent (centre q, radius r) may have so that the accumulated displacement
 * stays ≤ cap at sample points: its centre, a ring at r/2, and `extra` points (e.g. the hit).
 */
function dentRoom(dents: readonly Dent[], q: Vec3, r: number, cap: number, e1: Vec3, e2: Vec3, extra: readonly Vec3[]): number {
  let room = Infinity;
  const test = (x: Vec3): void => {
    const dd = ((x.x - q.x) ** 2 + (x.y - q.y) ** 2 + (x.z - q.z) ** 2) / (r * r);
    if (dd >= 1) return;
    const w = (1 - dd) * (1 - dd);
    room = Math.min(room, Math.max(0, cap - dentDepthAt(dents, x)) / w);
  };
  test(q);
  for (const h of [0.35 * r, 0.7 * r])
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      test({ x: q.x + (e1.x * a + e2.x * b) * h, y: q.y + (e1.y * a + e2.y * b) * h, z: q.z + (e1.z * a + e2.z * b) * h });
  for (const x of extra) test(x);
  // displacement peaks sit near existing dent centres: test those inside the new dent too
  for (const d of dents) if (d && finVec(d.p)) test(d.p);
  return room;
}

/** True when an in-plane dent centre q (radius r) lies on the sheet, at least margin from its rim. */
function onSheet(poly: ConvexPoly, q: Vec3, faceN: Vec3, margin: number): boolean {
  for (const f of poly.faces) {
    if (Math.abs(f.n.x * faceN.x + f.n.y * faceN.y + f.n.z * faceN.z) > 0.5) continue;
    if (f.n.x * q.x + f.n.y * q.y + f.n.z * q.z - f.d > -margin) return false;
  }
  return true;
}

/**
 * Plastic dent at the impact, accumulated and capped: the displacement anywhere never exceeds
 * cap = min(maxDent·ext2, 0.5·ext1). For sheets, energy left over once the spot is capped
 * spreads into wider, shallower dents AROUND the hit (the dent widens instead of deepening),
 * which is what eventually crumples a sheet. Returns [central depth added, crumple before, after].
 */
function dent(c: Ctx, sheet: boolean): [number, number, number] {
  const { part, E } = c;
  const m = part.mat;
  const ext = part.ext;
  const den = Math.max(1e-12, ext[0] * ext[1] * ext[2]);
  const rc = c.imp.contactRadius > 0 ? c.rc : 0.02;
  const rMaxD = Math.max(0.005, 0.5 * ext[1]);
  const rd = Math.min(rMaxD, Math.max(m.dentRadius * Math.cbrt(E / 100), rc));
  const d = E / (m.yieldY * Math.PI * rd * rd);
  const cap = Math.min(m.maxDent * ext[2], 0.5 * ext[1]);
  const C0 = sheet ? crumpleMetric(part.dents ?? [], ext) : 0;
  if (!Number.isFinite(d) || !(d > 0) || !(cap > 0)) return [0, C0, C0];
  const dents: Dent[] = (part.dents ?? []).slice();
  const [e1, e2] = planeBasis(c.geom.faceN);
  const P = { x: c.p.x, y: c.p.y, z: c.p.z },
    Dd = { x: c.dir.x, y: c.dir.y, z: c.dir.z };
  let C1 = C0;
  const push = (q: Vec3, r: number, depth: number): void => {
    const dn: Dent = { p: q, dir: { ...Dd }, r, depth };
    dents.push(dn);
    c.out.addDents.push(dn);
    c.out.dentDepth = Math.max(c.out.dentDepth, depth);
    C1 += (depth * r * r) / den;
  };
  const room0 = dentRoom(dents, P, rd, cap, e1, e2, []);
  const add = Math.min(d, room0);
  if (add >= 2e-4) push(P, rd, add);
  else if (!sheet) return [0, C0, C0];
  // capped locally: spread the remaining energy over wider dents around the hit
  if (sheet && add < d) {
    let left = E * (1 - Math.max(0, add) / d);
    const r2 = Math.min(rMaxD, rd * 1.8);
    const a0 = c.rng.range(0, Math.PI * 2);
    // rings of candidate centres further and further out (the dented area grows)
    for (let ring = 0; ring <= 4 && left > 1e-3; ring++) {
      const dist = ring * 0.9 * r2;
      const nA = ring === 0 ? 1 : 6;
      for (let k = 0; k < nA && left > 1e-3; k++) {
        const a = a0 + (k / nA) * Math.PI * 2 + ring * 0.5;
        const q = { x: P.x + (e1.x * Math.cos(a) + e2.x * Math.sin(a)) * dist, y: P.y + (e1.y * Math.cos(a) + e2.y * Math.sin(a)) * dist, z: P.z + (e1.z * Math.cos(a) + e2.z * Math.sin(a)) * dist };
        if (ring > 0 && !onSheet(part.poly, q, c.geom.faceN, 0.3 * r2)) continue;
        const want = left / (m.yieldY * Math.PI * r2 * r2);
        const d2 = Math.min(want, 0.5 * cap, dentRoom(dents, q, r2, cap, e1, e2, ring > 0 ? [P] : []));
        if (d2 < 2e-4) continue;
        push(q, r2, d2);
        left -= d2 * m.yieldY * Math.PI * r2 * r2;
      }
    }
  }
  return [Math.max(0, add >= 2e-4 ? add : 0), C0, C1];
}

/** Ductile metals: dents, crumpling, tears. Returns the bond-load multiplier. */
function respondBend(c: Ctx): number {
  const { part, E, sharp } = c;
  const m = part.mat;
  const ext = part.ext;
  if (!(m.yieldY > 0)) return 1;
  const [, C0, C1] = dent(c, true);
  const cap = Math.min(m.maxDent * ext[2], 0.5 * ext[1]);
  // a crumpled sheet loads its welds harder (state); the `crumpled` EVENT (collider refresh) is
  // only reported when the crumple metric crosses the threshold or doubles again (1, 2, 4, …).
  const mul = C1 >= K.crumple ? 2 : 1;
  const level = (C: number): number => (C >= K.crumple ? Math.floor(Math.log2(C / K.crumple)) : -1);
  if (level(C1) > level(C0)) {
    c.out.crumpled = true;
    if (C0 < K.crumple) {
      // the whole sheet buckles: broad, shallow bending field around the hit (within the cap)
      const [e1, e2] = planeBasis(c.geom.faceN);
      // centred on the sheet (the hit spot itself is usually already at the cap)
      const n = c.geom.faceN,
        g = part.centroid;
      const off = (c.p.x - g.x) * n.x + (c.p.y - g.y) * n.y + (c.p.z - g.z) * n.z;
      const P = finVec(g) ? { x: g.x + n.x * off, y: g.y + n.y * off, z: g.z + n.z * off } : { x: c.p.x, y: c.p.y, z: c.p.z };
      const rb = 0.45 * ext[0];
      const all = (part.dents ?? []).concat(c.out.addDents);
      const db = Math.min(0.06 * ext[1], cap, dentRoom(all, P, rb, cap, e1, e2, []));
      if (db >= 2e-4) c.out.addDents.push({ p: P, dir: { x: c.dir.x, y: c.dir.y, z: c.dir.z }, r: rb, depth: db });
    }
  }
  // Tear: a crumpled thin sheet whose metal at the hit is already folded to the cap tears into
  // 2–3 pieces. The tear energy scales with the torn cross-section (yield energy density ×
  // thickness × tear length × process-zone width), not the whole panel volume; remembered
  // damage at the spot (repeated sledge/axe blows) brings it within reach. Each blow must
  // still be substantial (passive drops do not tear panels).
  if (C0 >= K.crumple && ext[2] < 0.004) {
    const tearLen = Math.min(ext[1], 0.4);
    const Et = K.tearZone * m.yieldY * ext[2] * tearLen * partFlaw(part);
    const local = dentDepthAt(part.dents ?? [], c.p) >= 0.8 * cap;
    const Es = E * sharp;
    if (local && Es >= K.tearMinBlow * Et && Es + K.tearMemory * c.D >= Et) {
      const fp = plan(c, { global: true, mode: "bend", pattern: "crack", radius: 0, depth: c.geom.t, through: true, overload: 1, count: c.rng.int(2, 3) });
      if (fp) c.out.fracture = fp;
    }
  }
  remember(c, E);
  return mul;
}

/** Soft goods: absorb blunt hits; sharp strikes tear; heavy tearing splits. Returns bond multiplier. */
function respondSoft(c: Ctx): number {
  const { part, E, sharp, D } = c;
  const T = TUNING[part.mat.id]?.tear ?? 0;
  if (!(T > 0)) return 0.5;
  const m = part.mat;
  if (sharp >= 2) {
    const Et = E * sharp;
    if (Et >= T) {
      const sev = Math.min(1, Math.max(0.1, Et / (4 * T)));
      cracks(c, sev, false);
      if (m.micro !== "none") chips(c, Math.min(16, Math.max(2, Math.round(2 + 4 * Math.log2(Et / T)))), 0.005, 0.02, 1.5);
      if (D + Et >= 6 * T && part.ext[0] >= 0.15) {
        const fp = plan(c, { global: true, mode: "soft", pattern: "crack", radius: 0, depth: c.geom.t, through: true, overload: 1, count: c.rng.int(2, 3) });
        if (fp) c.out.fracture = fp;
      }
      remember(c, Et);
    }
  } else if (m.id === "food" && E >= 12 * T) {
    // fruit & co. burst under a heavy blunt blow
    const fp = plan(c, { global: true, mode: "soft", pattern: "crack", radius: 0, depth: c.geom.t, through: true, overload: 1, count: c.rng.int(2, 4) });
    if (fp) c.out.fracture = fp;
  }
  return 0.5;
}
