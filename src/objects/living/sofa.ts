// Upholstered seating (3-seat sofa, club armchair) built like real upholstery:
//  * kiln-dried softwood frame (front/back seat rails, cross rails, arm posts, back top rail),
//    upholstered — the visible faces carry the fabric/leather, splinters show pine inside,
//  * 12 mm plywood arm panels (inner + outer) and a 9 mm plywood outer back, stapled on,
//  * sinuous steel springs clipped across the seat rails, a foam deck pad over them,
//  * padded arm rolls and an inside-back foam pad glued to the frame,
//  * seat and back cushions as LOOSE soft parts (`stuffing`) resting on the deck — grab them,
//    throw them, slash them; underneath you find the springs,
//  * tapered hardwood legs screwed into the frame.
// Kick it and it slides; axe it and the arms splinter and the springs come loose.
//
// Frame: origin on the floor at the centre, +Y up, seat front faces +Z, length along X.

import { Builder } from "../lib/builder.ts";
import { cushion } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { bondTouching } from "./lib.ts";

export interface SeatParams {
  /** Overall length (x), depth (z), back height (m). */
  L: number;
  D: number;
  H: number;
  armW: number;
  armTop: number;
  legH: number;
  deckTop: number;
  seatTop: number;
  backCushionTop: number;
  seats: number;
  springsPerSeat: number;
  surf: SurfaceName;
  tint: number;
  legTint: number;
  /** Total mass of each seat / back cushion (kg). */
  seatKg: number;
  backKg: number;
}

export interface SeatLayout {
  /** Seat cushions z range, back cushions z range (assembly frame). */
  seatZ0: number;
  seatZ1: number;
  backZ0: number;
  backZ1: number;
  /** Inner face of the arms (± x). */
  xi: number;
}

const BACK_T = 0.009;
const PAD_D = 0.1;

export function seatLayout(p: Pick<SeatParams, "L" | "D" | "armW">): SeatLayout {
  const zB = -p.D / 2,
    zF = p.D / 2;
  const backZ0 = zB + BACK_T + PAD_D + 0.003;
  const backZ1 = backZ0 + 0.17;
  return { backZ0, backZ1, seatZ0: backZ1 + 0.005, seatZ1: zF - 0.01, xi: p.L / 2 - p.armW };
}

/** Build the upholstered frame + cushions into `b` (see file header). */
export function upholsteredSeat(b: Builder, p: SeatParams): void {
  const { L, D, H, legH, deckTop, armW, armTop, surf, tint } = p;
  const lay = seatLayout(p);
  const up = { tint }; // upholstered faces
  const xi = lay.xi;
  const railH = 0.12,
    railT = 0.045;
  const yr0 = legH,
    yr1 = legH + railH;
  const zF = D / 2,
    zB = -D / 2;

  // ---- seat frame
  const frontRail = b.box("rail_front", "softwood", surf, [2 * xi, railH, railT], [0, (yr0 + yr1) / 2, zF - railT / 2], { ...up, grain: "x" });
  const backRail = b.box("rail_back", "softwood", surf, [2 * xi, railH, railT], [0, (yr0 + yr1) / 2, zB + BACK_T + railT / 2], { ...up, grain: "x" });
  const crossLen = zF - railT - (zB + BACK_T + railT);
  const crossZ = (zF - railT + zB + BACK_T + railT) / 2;
  for (let k = 1; k < p.seats; k++) {
    const x = -xi + (2 * xi * k) / p.seats;
    const c = b.box(`rail_cross${k}`, "softwood", "wood_pine", [0.035, 0.1, crossLen], [x, yr1 - 0.05, crossZ], { grain: "z" });
    b.dowel(c, frontRail, 2, 40);
    b.dowel(c, backRail, 2, 40);
  }

  // ---- arms: outer + inner plywood panels on front/back posts, padded roll on top
  const arms: string[][] = [];
  const pnl = 0.012;
  const postY1 = armTop - 0.08;
  for (const sx of [-1, 1]) {
    const nm = sx < 0 ? "arm_l" : "arm_r";
    const xo = sx * (L / 2),
      xin = sx * xi;
    const xMid = (xo + xin) / 2;
    const outer = b.box(`${nm}_outer`, "plywood", surf, [pnl, postY1 - yr0, D], [xo - (sx * pnl) / 2, (yr0 + postY1) / 2, 0], { ...up, grain: "z" });
    const inner = b.box(`${nm}_inner`, "plywood", surf, [pnl, postY1 - yr0, D - railT - BACK_T], [xin + (sx * pnl) / 2, (yr0 + postY1) / 2, (zF + zB + BACK_T + railT) / 2], { ...up, grain: "z" });
    const postW = Math.abs(xo - xin) - 2 * pnl;
    const pf = b.box(`${nm}_post_f`, "softwood", surf, [postW, postY1 - yr0, railT], [xMid, (yr0 + postY1) / 2, zF - railT / 2], { ...up, grain: "y" });
    const pb = b.box(`${nm}_post_b`, "softwood", surf, [postW, H - yr0, railT], [xMid, (yr0 + H) / 2, zB + railT / 2], { ...up, grain: "y" });
    const roll = b.pillow(`${nm}_roll`, "foam", surf, [armW, 0.08, D - railT], 0.35, [xMid, armTop - 0.046, railT / 2], { tint, mass: 0.6 + 0.6 * D });
    b.nail(outer, pf, 6, 8); // staples
    b.nail(outer, pb, 6, 8);
    b.nail(inner, pf, 4, 8);
    bondTouching(b, roll, [outer, inner, pf, pb], "glue", 60, 0.003, 2);
    b.stuffing(roll, "foam");
    b.dowel(frontRail, pf, 2, 45);
    b.screw(frontRail, pf, 1, 35);
    b.dowel(backRail, pb, 2, 45);
    b.nail(inner, frontRail, 3, 8);
    arms.push([outer, inner, pf, pb, roll]);
  }
  const [armL, armR] = arms;

  // ---- back: outer plywood, top rail, inside-back foam pad
  const backPanel = b.box("back_panel", "plywood", surf, [2 * xi, H - yr0, BACK_T], [0, (yr0 + H) / 2, zB + BACK_T / 2], { ...up, grain: "x" });
  const padZ0 = zB + BACK_T,
    padZ1 = lay.backZ0 - 0.003;
  const topRail = b.box("rail_top", "softwood", surf, [2 * xi, 0.05, padZ1 - padZ0], [0, H - 0.025, (padZ0 + padZ1) / 2], { ...up, grain: "x" });
  const backPad = b.box("back_pad", "foam", surf, [2 * xi, H - 0.05 - deckTop, padZ1 - padZ0], [0, (deckTop + H - 0.05) / 2, (padZ0 + padZ1) / 2], { ...up, mass: 1.1 * L });
  for (const s of [armL, armR]) {
    b.nail(backPanel, s[3], 6, 8);
    b.screw(topRail, s[3], 2, 35);
  }
  b.nail(backPanel, backRail, 6, 8);
  b.nail(backPanel, topRail, 4, 8);
  b.glue(backPad, backPanel, 40);
  b.glue(backPad, topRail, 20);
  b.stuffing(backPad, "foam");

  // ---- sinuous springs across the seat rails + deck pad
  const nSpr = p.seats * p.springsPerSeat;
  const sprZ0 = zB + BACK_T + 0.02,
    sprZ1 = zF - 0.025;
  const springs: string[] = [];
  for (let k = 0; k < nSpr; k++) {
    const x = (-0.5 + (k + 0.5) / nSpr) * 2 * xi;
    const s = b.cyl(`spring${k}`, "steel", "metal_raw", 0.0025, sprZ1 - sprZ0, [x, yr1 + 0.0025, (sprZ0 + sprZ1) / 2], { axis: "z", segments: 6 });
    b.clip(s, frontRail, 8);
    b.clip(s, backRail, 8);
    springs.push(s);
  }
  const deck = b.box("deck", "foam", surf, [2 * xi, deckTop - yr1 - 0.005, zF - sprZ0], [0, (yr1 + 0.005 + deckTop) / 2, (zF + sprZ0) / 2], { tint, mass: 0.3 * L });
  b.nail(deck, frontRail, 3, 6);
  for (const s of springs) b.friction(deck, s, 2);

  // ---- legs (corners under the arm posts, plus middle legs under the rails on long seats)
  let li = 0;
  const xs = p.seats > 1 ? [-(L / 2 - armW / 2), 0, L / 2 - armW / 2] : [-(L / 2 - armW / 2), L / 2 - armW / 2];
  for (const x of xs)
    for (const front of [true, false]) {
      const z = front ? zF - railT / 2 : zB + railT / 2 + (x === 0 ? BACK_T : 0);
      const leg = b.cyl(`leg${li++}`, "hardwood", "wood_walnut", 0.016, legH, [x, legH / 2, z], { rTop: 0.022, segments: 8, tint: p.legTint });
      const above = x === 0 ? (front ? frontRail : backRail) : front ? (x < 0 ? armL[2] : armR[2]) : x < 0 ? armL[3] : armR[3];
      b.screw(leg, above, 2, 30);
    }

  // ---- loose cushions
  const n = p.seats;
  const gap = 0.005;
  const cw = (2 * xi - (n + 1) * gap) / n;
  for (let k = 0; k < n; k++) {
    const x = -xi + gap + cw / 2 + k * (cw + gap);
    const seat = cushion(b, `seat${k}`, { size: [cw, p.seatTop - deckTop, lay.seatZ1 - lay.seatZ0], roundness: 0.22, surf, tint, kg: p.seatKg, stuffing: "foam" }, [x, deckTop, (lay.seatZ0 + lay.seatZ1) / 2]);
    const back = cushion(b, `back${k}`, { size: [cw, p.backCushionTop - deckTop, lay.backZ1 - lay.backZ0], roundness: 0.35, surf, tint, kg: p.backKg, stuffing: "fiber" }, [x, deckTop, (lay.backZ0 + lay.backZ1) / 2]);
    b.tag(seat, "loose");
    b.tag(back, "loose");
  }
}

// =============================================================================================

export interface SofaOpts {
  /** Overall length (m), 1.8–2.3 (seats: 3). */
  length?: number;
  surf?: SurfaceName;
  tint?: number;
  legTint?: number;
  seed?: number;
}

/** Default sofa parameters (exported for placement of pillows etc.). 2.10 × 0.95 × 0.80 m. */
export const SOFA_PARAMS: Omit<SeatParams, "surf" | "tint" | "legTint"> = {
  L: 2.1,
  D: 0.95,
  H: 0.8,
  armW: 0.18,
  armTop: 0.64,
  legH: 0.12,
  deckTop: 0.305,
  seatTop: 0.455,
  backCushionTop: 0.755,
  seats: 3,
  springsPerSeat: 2,
  seatKg: 2.4,
  backKg: 1.0,
};

/** Three-seat sofa, ~58 kg, ~36 parts. */
export function buildSofa(o: SofaOpts = {}): AssemblyDef {
  const b = new Builder("sofa3", "Three-Seat Sofa", "furniture", 900, o.seed);
  const L = Math.min(2.3, Math.max(1.8, o.length ?? SOFA_PARAMS.L));
  upholsteredSeat(b, { ...SOFA_PARAMS, L, surf: o.surf ?? "fabric_upholstery", tint: o.tint ?? 0x6f7d8c, legTint: o.legTint ?? 0xffffff });
  return b.build();
}

export interface ArmchairOpts {
  surf?: SurfaceName;
  tint?: number;
  seed?: number;
}

/** Club armchair defaults: 0.84 × 0.86 × 0.80 m. */
export const ARMCHAIR_PARAMS: Omit<SeatParams, "surf" | "tint" | "legTint"> = {
  L: 0.84,
  D: 0.86,
  H: 0.8,
  armW: 0.15,
  armTop: 0.62,
  legH: 0.1,
  deckTop: 0.29,
  seatTop: 0.44,
  backCushionTop: 0.74,
  seats: 1,
  springsPerSeat: 3,
  seatKg: 2.2,
  backKg: 1.0,
};

/** Leather club armchair, ~25 kg, ~25 parts. */
export function buildArmchair(o: ArmchairOpts = {}): AssemblyDef {
  const b = new Builder("armchair", "Leather Armchair", "furniture", 650, o.seed);
  upholsteredSeat(b, { ...ARMCHAIR_PARAMS, surf: o.surf ?? "leather", tint: o.tint ?? 0x8a4f2c, legTint: 0x6b4a32 });
  return b.build();
}
