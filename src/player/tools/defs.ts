// Tool definitions: physically motivated striking parameters (effective head mass, head speed,
// charge, timings, reach, head/contact radius, sharpness, striker material), the procedural
// swing rigs (camera space, see swing.ts), and body actions (kick, stomp), crowbar prying and
// the extinguisher spray. PURE data + helpers (no Babylon), unit-tested in Node.
//
// Energy check (½·m·v² for a normal swing → fully charged):
//   fists         1.5 kg ×  8.5 m/s →  54 J   (haymaker  91 J)
//   claw hammer   0.9 kg × 11   m/s →  54 J   (charged   92 J)
//   sledgehammer  6.0 kg ×  6.5 m/s → 127 J   (charged  324 J)
//   crowbar       1.2 kg ×  9   m/s →  49 J   (charged   89 J)
//   baseball bat  0.8 kg × 17   m/s → 116 J   (charged  181 J)
//   axe           1.8 kg × 11   m/s → 109 J   (charged  213 J, sharp: ×2.2 on wood)
//   extinguisher  4.0 kg ×  5   m/s →  50 J   (charged   98 J)
//   kick          6   kg ×  7.5 m/s → 169 J ;  stomp 20 kg × 4 m/s → 160 J
// Effective masses are the head mass plus the share of handle/arm/body behind the blow at the
// contact point (a punch "weighs" ~1.5 kg, a stomp puts a good part of the body weight behind it).

import type { ToolId } from "../../core/context.ts";
import type { MaterialId } from "../../destruction/model/materials.ts";
import type { ToolDef } from "../contracts.ts";
import { normalStrikeDuration, type FrameDef, type Rig, type V3 } from "./swing.ts";

const deg = (d: number) => (d * Math.PI) / 180;
const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
/** Explicit rest frame: main-hand grip position, tool axis (grip→head) and striking-face direction. */
const F = (p: V3, axis: V3, face: V3): FrameDef => ({ p, axis, face });

/** Hotbar order (keys 1–7). */
export const TOOL_ORDER: readonly ToolId[] = ["hands", "hammer", "sledgehammer", "crowbar", "bat", "axe", "extinguisher"];

// ------------------------------------------------------------------------------------ swing rigs
// Camera space (+X right, +Y up, +Z forward, eye at origin; right shoulder ≈ (0.19, −0.24, −0.05),
// arm reach ≈ 0.65 m). Each tool's head path passes the crosshair line at the nominal reach moving
// almost straight ahead (forward component ≥ 0.9 — the arc's curvature happens earlier in the path:
// overhead swings still come down ~24°, diagonals down-left, the bat right → left), so a square
// blow delivers ≥ ~84 % of ½·m·v²; the handle is perpendicular to the travel there and grips stay
// within arm's reach. At strike start the tool system re-aims the contact at whatever the
// crosshair is on and squares the travel up to its surface (SwingMachine.aimStrike).
// `axis` = grip → head (the hands sit `toolLen` down the handle from the head).

export const TOOL_RIGS: Readonly<Record<ToolId, Rig>> = {
  hands: {
    kind: "jab",
    guard: [v(0.15, -0.18, 0.3), v(-0.15, -0.16, 0.33)],
    contact: [v(0.035, -0.055, 0.56), v(-0.035, -0.05, 0.56)],
    extend: 0.1,
    windBack: v(0.06, -0.025, -0.15),
  },
  // Diagonal (upper right → lower left), one-handed claw hammer.
  hammer: {
    kind: "curve",
    toolLen: 0.26,
    contact: v(0, -0.02, 0.72),
    travel: v(-0.2, -0.3, 0.93),
    handle: v(-0.3, 1, 0.1),
    wound: { head: v(0.33, 0.28, 0.22), axis: v(0.1, 0.55, -0.83) },
    woundCharged: { head: v(0.42, 0.33, 0.12), axis: v(0.15, 0.45, -0.88) },
    launch: v(-0.25, 0.35, 0.9),
    end: { head: v(-0.28, -0.55, 0.55), axis: v(-0.3, -0.5, 0.8) },
    endDir: v(-0.35, -0.85, -0.2),
    offhand: 0,
    idle: F(v(0.21, -0.27, 0.42), v(-0.2, 0.92, 0.3), v(-0.6, 0, 0.8)),
  },
  // Overhead, two-handed: 0.9 m hickory handle, 4.5 kg head.
  sledgehammer: {
    kind: "curve",
    toolLen: 0.55,
    contact: v(0, -0.04, 0.95),
    travel: v(0, -0.4, 0.92),
    handle: v(0, 1, 0),
    wound: { head: v(0.1, 0.55, 0.1), axis: v(0.03, 0.85, -0.53) },
    woundCharged: { head: v(0.12, 0.62, -0.45), axis: v(0.03, 0.4, -0.92) },
    launch: v(0, 0.5, 0.86),
    end: { head: v(0.02, -0.95, 0.72), axis: v(0, -0.55, 0.83) },
    endDir: v(0, -0.85, -0.5),
    offhand: 0.24,
    idle: F(v(0.21, -0.26, 0.36), v(0.12, 0.8, 0.5), v(-0.35, 0, 0.94)),
  },
  // Diagonal, one-handed: 0.75 m hex bar, strikes with the bend of the hooked end.
  crowbar: {
    kind: "curve",
    toolLen: 0.5,
    contact: v(0, -0.02, 0.8),
    travel: v(-0.2, -0.3, 0.93),
    handle: v(-0.3, 1, 0.1),
    wound: { head: v(0.4, 0.36, 0.25), axis: v(0.08, 0.75, -0.66) },
    woundCharged: { head: v(0.46, 0.46, 0.02), axis: v(0.1, 0.55, -0.83) },
    launch: v(-0.25, 0.35, 0.9),
    end: { head: v(-0.33, -0.62, 0.62), axis: v(-0.3, -0.5, 0.8) },
    endDir: v(-0.35, -0.85, -0.2),
    offhand: 0,
    idle: F(v(0.22, -0.3, 0.38), v(-0.2, 0.86, 0.48), v(-0.55, 0.1, 0.83)),
  },
  // Horizontal (right → left), two-handed: 0.84 m wooden bat, sweet spot ~0.6 m from the hands.
  // At contact the hands lead (left of centre) and the barrel whips through the crosshair.
  bat: {
    kind: "curve",
    toolLen: 0.6,
    contact: v(0, -0.08, 0.95),
    travel: v(-0.4, -0.03, 0.92),
    handle: v(1, 0, 0),
    wound: { head: v(0.42, 0.32, 0.0), axis: v(0.2, 0.8, -0.55) },
    woundCharged: { head: v(0.55, 0.15, -0.45), axis: v(0.45, 0.45, -0.77) },
    launch: v(-0.4, -0.35, 0.85),
    // follow-through ends wrapped to the left; the end axis stays < 180° from the contact handle
    // (rotating through "barrel forward") so the bat keeps rotating the right way round
    end: { head: v(-0.8, -0.05, 0.3), axis: v(-0.95, 0.1, -0.15) },
    endDir: v(-0.45, 0.05, -0.9),
    offhand: 0.085,
    idle: F(v(0.23, -0.25, 0.36), v(0.29, 0.88, 0.32), v(-0.2, 0.3, 0.93)),
  },
  // Overhead, two-handed: 0.7 m handle, 1.6 kg head.
  axe: {
    kind: "curve",
    toolLen: 0.5,
    contact: v(0, -0.04, 0.9),
    travel: v(0, -0.4, 0.92),
    handle: v(0, 1, 0),
    wound: { head: v(0.1, 0.52, 0.1), axis: v(0.03, 0.85, -0.53) },
    woundCharged: { head: v(0.12, 0.58, -0.42), axis: v(0.03, 0.4, -0.92) },
    launch: v(0, 0.5, 0.86),
    end: { head: v(0.02, -0.9, 0.68), axis: v(0, -0.55, 0.83) },
    endDir: v(0, -0.85, -0.5),
    offhand: 0.2,
    idle: F(v(0.21, -0.26, 0.36), v(0.1, 0.82, 0.48), v(-0.45, 0, 0.9)),
  },
  // Two-handed overhead slam: the cylinder held horizontally across (right hand on the valve
  // handle, left hand under the bottom), its side smashing down. The left hand goes back to the
  // hose nozzle at rest.
  extinguisher: {
    kind: "curve",
    toolLen: 0.3,
    contact: v(0, -0.08, 0.62),
    travel: v(0, -0.4, 0.92),
    handle: v(-1, 0, 0),
    wound: { head: v(0.02, 0.22, 0.38), axis: v(-1, 0.05, 0) },
    woundCharged: { head: v(0.03, 0.42, 0.12), axis: v(-1, 0.1, -0.05) },
    launch: v(0, 0.3, 1),
    end: { head: v(0.02, -0.6, 0.5), axis: v(-1, -0.1, 0) },
    endDir: v(0, -0.9, -0.4),
    offhand: -0.36,
    idle: F(v(0.2, -0.07, 0.43), v(0.04, -0.98, 0.2), v(-0.15, 0.1, 1)),
  },
};

// ------------------------------------------------------------------------------------ tool defs

type Def = Omit<ToolDef, "strike">;

const BASE: Readonly<Record<ToolId, Def>> = {
  hands: {
    id: "hands",
    name: "Fists",
    mass: 1.5,
    speed: 8.5,
    chargeSpeedMul: 1.3,
    chargeTime: 0.6,
    windup: 0.05,
    recover: 0.16,
    reach: 0.6,
    headRadius: 0.05,
    contactRadius: 0.04,
    sharpness: 1,
    strikerMat: "flesh",
    alt: null,
  },
  hammer: {
    id: "hammer",
    name: "Claw Hammer",
    mass: 0.9,
    speed: 11,
    chargeSpeedMul: 1.3,
    chargeTime: 0.7,
    windup: 0.12,
    recover: 0.22,
    reach: 0.72,
    headRadius: 0.025,
    contactRadius: 0.015,
    sharpness: 1,
    strikerMat: "steel",
    alt: null,
  },
  sledgehammer: {
    id: "sledgehammer",
    name: "Sledgehammer",
    mass: 6,
    speed: 6.5,
    chargeSpeedMul: 1.6,
    chargeTime: 1.2,
    windup: 0.4,
    recover: 0.55,
    reach: 0.95,
    headRadius: 0.055,
    contactRadius: 0.03,
    sharpness: 1,
    strikerMat: "steel",
    alt: null,
  },
  crowbar: {
    id: "crowbar",
    name: "Crowbar",
    mass: 1.2,
    speed: 9,
    chargeSpeedMul: 1.35,
    chargeTime: 0.8,
    windup: 0.14,
    recover: 0.28,
    reach: 0.8,
    headRadius: 0.025,
    contactRadius: 0.012,
    sharpness: 1.3,
    strikerMat: "steel",
    alt: "pry",
  },
  bat: {
    id: "bat",
    name: "Baseball Bat",
    mass: 0.8,
    speed: 17,
    chargeSpeedMul: 1.25,
    chargeTime: 0.9,
    windup: 0.18,
    recover: 0.35,
    reach: 0.95,
    headRadius: 0.04,
    contactRadius: 0.03,
    sharpness: 1,
    strikerMat: "hardwood",
    alt: null,
  },
  axe: {
    id: "axe",
    name: "Axe",
    mass: 1.8,
    speed: 11,
    chargeSpeedMul: 1.4,
    chargeTime: 1.0,
    windup: 0.3,
    recover: 0.45,
    reach: 0.9,
    headRadius: 0.035,
    contactRadius: 0.012,
    sharpness: 2.2,
    strikerMat: "steel",
    alt: null,
  },
  extinguisher: {
    id: "extinguisher",
    name: "Fire Extinguisher",
    mass: 4,
    speed: 5,
    chargeSpeedMul: 1.4,
    chargeTime: 0.9,
    windup: 0.25,
    recover: 0.45,
    reach: 0.62,
    headRadius: 0.065,
    contactRadius: 0.05,
    sharpness: 1,
    strikerMat: "steel",
    alt: "spray",
  },
};

/** Final tool definitions; `strike` = duration (s) of a normal swing's strike window derived from the rig. */
export const TOOL_DEFS: Readonly<Record<ToolId, ToolDef>> = Object.fromEntries(
  TOOL_ORDER.map((id) => {
    const b = BASE[id];
    const strike = Math.round(normalStrikeDuration({ ...b, strike: 0 }, TOOL_RIGS[id]) * 1000) / 1000;
    return [id, { ...b, strike }];
  }),
) as Record<ToolId, ToolDef>;

/**
 * Tool shafts swept in addition to the head (long tools), so the handle/barrel cannot pass through
 * things lying along the arc: points on the tool axis `offsets` metres from the head towards the
 * grip, swept as spheres of `radius`. A shaft blow carries `massScale` × the head's effective mass
 * (less of the tool's inertia acts there) and strikes with the shaft material.
 */
export interface ShaftDef {
  offsets: readonly number[];
  radius: number;
  mat: MaterialId;
  massScale: number;
}
export const TOOL_SHAFTS: Readonly<Partial<Record<ToolId, ShaftDef>>> = {
  bat: { offsets: [0.17, 0.33], radius: 0.03, mat: "hardwood", massScale: 0.7 },
  sledgehammer: { offsets: [0.2, 0.38], radius: 0.018, mat: "hardwood", massScale: 0.35 },
  axe: { offsets: [0.18, 0.34], radius: 0.017, mat: "hardwood", massScale: 0.4 },
  crowbar: { offsets: [0.2, 0.36], radius: 0.012, mat: "steel", massScale: 0.55 },
  extinguisher: { offsets: [0.15], radius: 0.06, mat: "steel", massScale: 0.8 },
};
/** Shafts are swept from this fraction of the approach on (the wound-back shaft may rest against the ceiling/walls). */
export const SHAFT_SWEEP_FROM = 0.5;

// ------------------------------------------------------------------------------------ material-dependent behaviour

const WOODS: ReadonlySet<MaterialId> = new Set<MaterialId>(["softwood", "hardwood", "plywood", "mdf", "particleboard"]);
const METALS: ReadonlySet<MaterialId> = new Set<MaterialId>(["steelSheet", "steel", "aluminum", "castIron", "copper"]);
const SOFTS: ReadonlySet<MaterialId> = new Set<MaterialId>(["fabric", "foam", "paper", "cardboard", "insulation", "food", "rubber", "soil"]);
const BRITTLE_HARD: ReadonlySet<MaterialId> = new Set<MaterialId>(["glass", "temperedGlass", "ceramic", "tile", "stone", "concrete", "lcd"]);

/**
 * Effective sharpness of a tool against a target material. A blade concentrates the blow on wood
 * and soft goods (cuts fibres) but skids on metal and glances off stone; blunt tools are 1 except
 * the crowbar's wedge which bites a little into wood/drywall.
 */
export function sharpnessFor(tool: ToolId | "kick" | "stomp", mat: MaterialId | null): number {
  if (tool === "axe") {
    if (!mat) return 1.6;
    if (WOODS.has(mat) || SOFTS.has(mat)) return 2.2;
    if (METALS.has(mat)) return 0.6;
    if (BRITTLE_HARD.has(mat)) return 0.85;
    if (mat === "gypsum" || mat === "plaster") return 1.4;
    return 1.5; // plastics, pcb, acrylic
  }
  if (tool === "crowbar") {
    if (mat && (WOODS.has(mat) || mat === "gypsum" || mat === "plaster" || SOFTS.has(mat))) return 1.3;
    return 1.0;
  }
  return 1;
}

/** Materials that hurt to punch bare-handed (and make you pull the blow). Boots don't flinch. */
const PAINFUL: ReadonlySet<MaterialId> = new Set<MaterialId>(["concrete", "stone", "steel", "castIron", "copper", "tile"]);
export const isPainful = (mat: MaterialId | null): boolean => mat !== null && PAINFUL.has(mat);
/** Speed factor of a pulled punch on a painful material (the knuckles flinch). */
export const PAINFUL_PULL = 0.6;

/** Hardness thresholds for hit reactions (StrikeResult.hardness 0..1). */
export const HARD_RECOIL = 0.55;
export const MEDIUM_THUD = 0.25;

/** Swings need at least this normal speed (m/s) at contact to count as a strike (else it is a touch). */
export const MIN_STRIKE_SPEED = 0.35;
/** Max hits registered per swing (break-throughs continue the swing). */
export const MAX_HITS_PER_SWING = 3;
/** Fraction of the tool speed that camera turning may add to the head velocity (body rotation). */
export const TURN_SPEED_SHARE = 0.35;

// ------------------------------------------------------------------------------------ body actions

export interface LegActionDef {
  /** Effective mass (kg), peak foot speed (m/s), contact radius (m), foot sphere radius (m). */
  mass: number;
  speed: number;
  contactRadius: number;
  footRadius: number;
  /** Seconds to raise the leg before the strike, recovery after it. */
  raise: number;
  recover: number;
  /** Fraction of the strike path at which the foot reaches peak speed (nominal contact). */
  contactAt: number;
}

/** Front kick: leg sweep forward at 0.3–0.9 m height, reaching ~1.1 m. */
export const KICK: LegActionDef & { reach: number; minHeight: number; maxHeight: number; hipHeight: number; startForward: number } = {
  mass: 6,
  speed: 7.5,
  contactRadius: 0.06,
  footRadius: 0.075,
  raise: 0.12,
  recover: 0.32,
  contactAt: 0.82,
  reach: 1.1,
  minHeight: 0.3,
  maxHeight: 0.9,
  hipHeight: 0.55,
  startForward: 0.12,
};

/** Stomp: heel driven down onto the point under the crosshair (≤ 1.2 m away) or under the feet. */
export const STOMP: LegActionDef & { reach: number; lift: number; maxTargetHeight: number; overshoot: number } = {
  mass: 20,
  speed: 4,
  contactRadius: 0.05,
  footRadius: 0.07,
  raise: 0.16,
  recover: 0.3,
  contactAt: 0.85,
  reach: 1.2,
  lift: 0.45,
  maxTargetHeight: 0.9,
  overshoot: 0.08,
};

/** Standing eye height used when the floor cannot be found (m). */
export const DEFAULT_EYE_HEIGHT = 1.65;

/** Crowbar pry: leverage force applied to bonds near the wedge point. */
export const PRY = {
  force: 3000,
  /**
   * Max eye → wedge distance (m): arm reach (~0.57 m from a shoulder ~0.3 m from the eye) plus the
   * 0.5 m levering length of the bar, minus a margin — the bar can't lever beyond that.
   */
  reach: 1.05,
  /** The wedge slips out if the point drifts beyond this distance (m) or angle from the view (rad). */
  slipDistance: 1.2,
  slipAngle: deg(40),
  /** Seconds of zero returned stress (nothing to lever) before the bar slips off. */
  slipAfter: 0.3,
} as const;

/**
 * Extinguisher spray pose (camera space): the cylinder held low on the right by its carrying
 * handle, the left hand aiming the hose nozzle along the view.
 */
/** Extinguisher: the left hand holds the hose nozzle, pointed forward-down when not spraying. */
export const NOZZLE_IDLE: FrameDef = F(v(0.04, -0.2, 0.4), v(0, 1, 0.3), v(0.05, -0.3, 1));

export const SPRAY_POSE: { right: FrameDef; left: FrameDef } = {
  right: F(v(0.27, -0.07, 0.46), v(0.06, -0.97, 0.2), v(-0.25, 0.05, 1)),
  left: F(v(0.05, -0.16, 0.42), v(0, 1, 0.08), v(-0.03, 0.08, 1)),
};

/**
 * Fire extinguisher (6 kg dry powder): ~12 s of discharge, ~9 N jet thrust. The jet's momentum
 * flux is (nearly) conserved but spreads over a ~7° cone, so an object intercepts the share of the
 * rays that hit it: a plastic cup is blown off a table at ~1 m, a chair does not budge.
 */
export const SPRAY = {
  duration: 12,
  thrust: 9,
  range: 4.5,
  coneHalfAngle: deg(7),
  raysPerStep: 8,
  /** Jet momentum decay length (m): F(d) = F·exp(−d/decay) (drag on the powder cloud). */
  decay: 5,
  /** Radial ray distribution exponent (< 1 = denser core, like a real jet profile). */
  coreExp: 0.75,
  /** Particle rate of the vfx emitter (particles/s at full pressure). */
  rate: 220,
} as const;
