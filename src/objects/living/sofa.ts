// Three-seat sofa built like real upholstery:
//  * kiln-dried softwood frame (front/back seat rails, cross rails, arm posts, back top rail),
//    upholstered — the visible faces carry the fabric, splinters show pine inside,
//  * 12 mm plywood arm panels (inner + outer) and a 9 mm plywood outer back, stapled to the frame,
//  * six sinuous steel springs clipped across the seat rails, a foam deck pad over them,
//  * padded arm rolls and an inside-back foam pad glued to the frame,
//  * three seat cushions and three back cushions as LOOSE soft parts (`stuffing`) resting on the
//    deck — grab them, throw them, slash them; underneath you find the springs,
//  * six tapered hardwood legs screwed into the frame.
// Kick it and it slides (55 kg); axe it and the arms splinter and the springs come loose.
//
// Frame: origin on the floor at the centre, +Y up, seat front faces +Z, length along X.
// 2.10 × 0.95 × 0.85 m, seat height 0.455 m, ~55 kg, ~45 parts.

import { Builder } from "../lib/builder.ts";
import { cushion } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { bondTouching } from "./lib.ts";

export interface SofaOpts {
  /** Overall length (m), 1.8–2.3 (seats: 3). */
  length?: number;
  surf?: SurfaceName;
  tint?: number;
  legTint?: number;
  seed?: number;
}

/** Key levels of the default sofa (for placing throw pillows). */
export const SOFA_DIMS = {
  length: 2.1,
  depth: 0.95,
  height: 0.85,
  legH: 0.12,
  deckTop: 0.305,
  seatTop: 0.455,
  armW: 0.18,
  armTop: 0.64,
  /** Seat cushions span z ∈ [seatZ0, seatZ1]; back cushions z ∈ [backZ0, backZ1]. */
  seatZ0: -0.185,
  seatZ1: 0.465,
  backZ0: -0.36,
  backZ1: -0.19,
  backCushionTop: 0.755,
} as const;

export function buildSofa(o: SofaOpts = {}): AssemblyDef {
  const b = new Builder("sofa3", "Three-Seat Sofa", "furniture", 900, o.seed);
  const L = Math.min(2.3, Math.max(1.8, o.length ?? SOFA_DIMS.length));
  const { depth: D, height: H, legH, deckTop, armW, armTop } = SOFA_DIMS;
  const surf: SurfaceName = o.surf ?? "fabric_upholstery";
  const tint = o.tint ?? 0x6f7d8c;
  const up = { tint }; // upholstered faces
  const xi = L / 2 - armW; // inner face of the arms
  const railH = 0.16,
    railT = 0.05;
  const yr0 = legH,
    yr1 = legH + railH; // 0.12 .. 0.28
  const zF = D / 2,
    zB = -D / 2;
  const backT = 0.009;

  // ---- seat frame
  const frontRail = b.box("rail_front", "softwood", surf, [2 * xi, railH, railT], [0, (yr0 + yr1) / 2, zF - railT / 2], { ...up, grain: "x" });
  const backRail = b.box("rail_back", "softwood", surf, [2 * xi, railH, railT], [0, (yr0 + yr1) / 2, zB + backT + railT / 2], { ...up, grain: "x" });
  const crossLen = zF - railT - (zB + backT + railT);
  const crossZ = (zF - railT + zB + backT + railT) / 2;
  const cross: string[] = [];
  for (const x of [-0.29 * (L / 2.1), 0.29 * (L / 2.1)]) {
    const c = b.box(`rail_cross${cross.length}`, "softwood", "wood_pine", [0.04, 0.12, crossLen], [x, yr1 - 0.06, crossZ], { grain: "z" });
    b.dowel(c, frontRail, 2, 40);
    b.dowel(c, backRail, 2, 40);
    cross.push(c);
  }

  // ---- arms: outer + inner plywood panels on front/back posts, padded roll on top
  const arms: string[][] = [];
  for (const sx of [-1, 1]) {
    const nm = sx < 0 ? "arm_l" : "arm_r";
    const xo = sx * (L / 2),
      xin = sx * xi;
    const xMid = (xo + xin) / 2;
    const pnl = 0.012;
    const postY1 = armTop - 0.08;
    const outer = b.box(`${nm}_outer`, "plywood", surf, [pnl, armTop - 0.08 - yr0, D], [xo - sx * pnl / 2, (yr0 + armTop - 0.08) / 2, 0], { ...up, grain: "z" });
    const inner = b.box(`${nm}_inner`, "plywood", surf, [pnl, postY1 - yr0, D - railT - backT], [xin + sx * pnl / 2, (yr0 + postY1) / 2, (zF + zB + backT + railT) / 2 - railT / 2 + railT / 2], { ...up, grain: "z" });
    const postW = Math.abs(xo - xin) - 2 * pnl;
    const pf = b.box(`${nm}_post_f`, "softwood", surf, [postW, postY1 - yr0, railT], [xMid, (yr0 + postY1) / 2, zF - railT / 2], { ...up, grain: "y" });
    const pb = b.box(`${nm}_post_b`, "softwood", surf, [postW, H - 0.05 - yr0, railT], [xMid, (yr0 + H - 0.05) / 2, zB + railT / 2], { ...up, grain: "y" });
    const roll = b.pillow(`${nm}_roll`, "foam", surf, [armW, 0.08, D], 0.35, [xMid, armTop - 0.046, 0], { tint, mass: 1.2 });
    for (const post of [pf, pb]) {
      b.nail(outer, post, 6, 8); // staples
    }
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
  const backPanel = b.box("back_panel", "plywood", surf, [2 * xi, H - 0.05 - yr0, backT], [0, (yr0 + H - 0.05) / 2, zB + backT / 2], { ...up, grain: "x" });
  const padZ0 = zB + backT,
    padZ1 = SOFA_DIMS.backZ0 - 0.003;
  const topRail = b.box("rail_top", "softwood", surf, [2 * xi, 0.05, padZ1 - padZ0], [0, H - 0.075, (padZ0 + padZ1) / 2], { ...up, grain: "x" });
  const backPad = b.box("back_pad", "foam", surf, [2 * xi, H - 0.1 - deckTop, padZ1 - padZ0], [0, (deckTop + H - 0.1) / 2, (padZ0 + padZ1) / 2], { ...up, mass: 2.2 });
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
  const nSpr = 6;
  const sprZ0 = zB + backT + 0.02,
    sprZ1 = zF - 0.025;
  const springs: string[] = [];
  for (let k = 0; k < nSpr; k++) {
    const x = (-0.5 + (k + 0.5) / nSpr) * 2 * xi;
    const s = b.cyl(`spring${k}`, "steel", "metal_raw", 0.0025, sprZ1 - sprZ0, [x, yr1 + 0.0025, (sprZ0 + sprZ1) / 2], { axis: "z", segments: 6 });
    b.clip(s, frontRail, 8);
    b.clip(s, backRail, 8);
    springs.push(s);
  }
  const deck = b.box("deck", "foam", surf, [2 * xi, deckTop - yr1 - 0.005, zF - sprZ0], [0, (yr1 + 0.005 + deckTop) / 2, (zF + sprZ0) / 2], { tint, mass: 0.6 });
  b.nail(deck, frontRail, 3, 6);
  for (const s of springs) b.friction(deck, s, 2);

  // ---- legs
  let li = 0;
  for (const x of [-(L / 2 - armW / 2), 0, L / 2 - armW / 2])
    for (const z of [zF - railT / 2, zB + railT / 2 + (x === 0 ? backT : 0)]) {
      const leg = b.cyl(`leg${li++}`, "hardwood", "wood_walnut", 0.016, legH, [x, legH / 2, z], { rTop: 0.022, segments: 8, tint: o.legTint ?? 0xffffff });
      const above = x === 0 ? (z > 0 ? frontRail : backRail) : z > 0 ? (x < 0 ? armL[2] : armR[2]) : x < 0 ? armL[3] : armR[3];
      b.screw(leg, above, 2, 30);
    }

  // ---- loose cushions
  const n = 3;
  const gap = 0.005;
  const cw = (2 * xi - (n + 1) * gap) / n;
  for (let k = 0; k < n; k++) {
    const x = -xi + gap + cw / 2 + k * (cw + gap);
    const sz0 = SOFA_DIMS.seatZ0,
      sz1 = SOFA_DIMS.seatZ1;
    const seat = cushion(b, `seat${k}`, { size: [cw, SOFA_DIMS.seatTop - deckTop, sz1 - sz0], roundness: 0.22, surf, tint, kg: 2.4, stuffing: "foam" }, [x, deckTop, (sz0 + sz1) / 2]);
    const bz0 = SOFA_DIMS.backZ0,
      bz1 = SOFA_DIMS.backZ1;
    const back = cushion(b, `back${k}`, { size: [cw, SOFA_DIMS.backCushionTop - deckTop, bz1 - bz0], roundness: 0.35, surf, tint, kg: 1.0, stuffing: "fiber" }, [x, deckTop, (bz0 + bz1) / 2]);
    b.tag(seat, "loose");
    b.tag(back, "loose");
  }
  void cross;
  return b.build();
}
