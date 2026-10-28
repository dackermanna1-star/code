// Close-coupled vitreous-china toilet (rim 395 mm, seat 420 mm, cistern top 775 mm).
//
//  * Bowl: an elongated (oval) glazed shell of convex lathe tiles fused together; a hollow oval
//    pedestal skirt under it carries the S-trapway (ceramic tube) down to the floor flange; a
//    hollow rear body (two side webs, a back web and the deck) carries the cistern.
//  * Cistern: five ceramic walls standing on the deck (tank bolts), a separate 4.3 kg ceramic lid
//    just RESTING on it (friction) — the classic thing to pick up and smash — and the flush
//    mechanism inside: plastic fill valve + float on its shank, plastic overflow tube with a
//    rubber flapper, chrome lever + plastic lever arm. 6 l of water in the tank (water feature).
//  * Plastic seat ring (oval tiles) and lid on their own hinges over two hinge posts.
//  * Bolted to the floor (two closet bolts under plastic caps), sealed on the flange (wax ring),
//    fed by a chrome angle-stop valve in the wall and a braided supply line (water features).
//
// Frame: origin at the floor below the footprint centre, front (bowl) +Z, cistern against the
// wall on −Z. Footprint 0.47 × 0.71 m. ~33 kg.

import { hingeAxis } from "../lib/kit.ts";
import { polyCentroid } from "../../geom/poly.ts";
import { vdist, v3 } from "../../geom/vec.ts";
import { boxR, bondTouching, ellipsePrismPoints, finish, mk, ovalLathe, CHROME, type BaseOpts } from "../utility/helpers.ts";
import type { Builder } from "../lib/builder.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";

export interface ToiletOpts extends BaseOpts {
  /** China colour (white by default; pastel bathroom suites exist). */
  tint?: number;
  /** Seat colour. */
  seatTint?: number;
  /** Supply valve position along the wall (local x), default -0.16 (left, seen from the front). */
  supplyX?: number;
}

export const TOILET = {
  rimY: 0.395,
  seatTopY: 0.42,
  lidTopY: 0.436,
  tankTopY: 0.775,
  /** Back of the cistern (local z) and front of the bowl. */
  backZ: -0.355,
  frontZ: 0.33,
} as const;

/** Part (of `names`) whose centroid is nearest to `p` (current-frame coordinates == assembly here). */
function nearest(b: Builder, names: string[], p: [number, number, number]): string {
  let best = names[0],
    bd = Infinity;
  for (const n of names) {
    const d = vdist(polyCentroid(b.get(n).poly), v3(p[0], p[1], p[2]));
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

export function buildToilet(o: ToiletOpts = {}): AssemblyDef {
  const b = mk("toilet", "Toilet", "fixture", 280, o);
  const china = o.tint ?? 0xf7f7f4;
  const seatTint = o.seatTint ?? 0xf9f9f6;
  const zb = 0.1; // bowl axis
  const sz = 1.28; // oval elongation (front-back)
  const rimY = TOILET.rimY;

  // ------------------------------------------------------------------ bowl + pedestal skirt
  const bowl = ovalLathe(b, "bowl", "ceramic", "ceramic_glaze", "ceramic_glaze", {
    profile: [
      [0.075, 0.2],
      [0.165, 0.33],
      [0.18, rimY],
    ],
    thickness: 0.011,
    segments: 10,
    capBottom: true,
    sz,
    pos: [0, 0, zb],
    tint: china,
  });
  const skirt = ovalLathe(b, "skirt", "ceramic", "ceramic_glaze", "ceramic_bisque", {
    // starts 1.3 mm up: the wall's inward offset would otherwise dip the inner edge below the floor
    profile: [
      [0.135, 0.0013],
      [0.108, 0.245],
    ],
    thickness: 0.011,
    segments: 10,
    sz,
    pos: [0, 0, zb],
    tint: china,
  });
  // the skirt's top edge merges into the bowl's outer wall (one casting)
  for (const s of skirt) bondTouching(b, s, bowl, "fused", 120, 0.003, 0);
  // S-trapway inside the pedestal, from the bowl outlet down to the floor flange
  const trap = b.tube(
    "trapway",
    "ceramic",
    "ceramic_glaze",
    [
      [0, 0.1995, zb],
      [0, 0.13, zb],
      [0, 0.062, 0.03],
      [0, 0.032, 0.0],
    ],
    0.03,
    { sides: 8, tint: china, kgPerM: 4.2 },
  );
  bondTouching(b, trap[0], bowl, "fused", 60, 0.002);
  b.world(trap[trap.length - 1], "press", 30, [0, 0.002, 0]); // wax ring on the floor flange

  // ------------------------------------------------------------------ rear body + deck
  const deck = boxR(b, "deck", "ceramic", "ceramic_glaze", [-0.125, 0.125], [0.375, rimY], [-0.3, -0.1185], { tint: china });
  const webL = boxR(b, "web_l", "ceramic", "ceramic_glaze", [-0.125, -0.116], [0, 0.375], [-0.3, -0.05], { tint: china });
  const webR = boxR(b, "web_r", "ceramic", "ceramic_glaze", [0.116, 0.125], [0, 0.375], [-0.3, -0.05], { tint: china });
  const webB = boxR(b, "web_b", "ceramic", "ceramic_glaze", [-0.116, 0.116], [0, 0.375], [-0.3, -0.291], { tint: china });
  b.fuse(deck, webL);
  b.fuse(deck, webR);
  b.fuse(deck, webB);
  b.fuse(webB, webL);
  b.fuse(webB, webR);
  bondTouching(b, deck, bowl, "fused", 200, 0.002);

  // floor bolts (closet bolts through the skirt's foot) under plastic caps
  for (const sx of [-1, 1]) {
    const tile = nearest(b, skirt, [sx * 0.13, 0.03, zb]);
    b.world(tile, "bolt", 160, [sx * 0.13, 0, zb]);
    const cap = b.cyl(`boltcap_${sx < 0 ? "l" : "r"}`, "plastic", "plastic_glossy", 0.011, 0.022, [sx * 0.147, 0.011, zb], { segments: 10, tint: china });
    b.press(cap, tile, 2);
  }

  // ------------------------------------------------------------------ cistern
  const tz0 = TOILET.backZ,
    tz1 = -0.175;
  const ty0 = rimY,
    ty1 = 0.755;
  const tw = 0.23;
  const wt = 0.008;
  const tbt = 0.01; // tank bottom thickness
  const tBottom = boxR(b, "tank_bottom", "ceramic", "ceramic_glaze", [-tw, tw], [ty0, ty0 + tbt], [tz0, tz1], { tint: china });
  const tFront = boxR(b, "tank_front", "ceramic", "ceramic_glaze", [-tw, tw], [ty0 + tbt, ty1], [tz1 - wt, tz1], { tint: china });
  const tBack = boxR(b, "tank_back", "ceramic", "ceramic_glaze", [-tw, tw], [ty0 + tbt, ty1], [tz0, tz0 + wt], { tint: china });
  const tLeft = boxR(b, "tank_left", "ceramic", "ceramic_glaze", [-tw, -tw + wt], [ty0 + tbt, ty1], [tz0 + wt, tz1 - wt], { tint: china });
  const tRight = boxR(b, "tank_right", "ceramic", "ceramic_glaze", [tw - wt, tw], [ty0 + tbt, ty1], [tz0 + wt, tz1 - wt], { tint: china });
  const tank = [tBottom, tFront, tBack, tLeft, tRight];
  for (const w of [tFront, tBack, tLeft, tRight]) b.fuse(w, tBottom);
  for (const w of [tLeft, tRight]) {
    b.fuse(w, tFront);
    b.fuse(w, tBack);
  }
  b.bolt(tBottom, deck, 160); // two tank bolts + rubber washers
  // the lid just rests on the walls
  const lid = boxR(b, "tank_lid", "ceramic", "ceramic_glaze", [-tw - 0.005, tw + 0.005], [ty1, TOILET.tankTopY], [tz0 - 0.005, tz1 + 0.005], { tint: china });
  b.friction(lid, tFront, 4);
  b.friction(lid, tBack, 4);
  // 6 litres of water in the tank
  b.water(tBottom, [0, ty0 + 0.05, (tz0 + tz1) / 2], [0, -0.3, 1], 0.15, 6);

  // flush mechanism
  const sx = o.supplyX ?? -0.16;
  const tzc = -0.265;
  const fill = b.cyl("fill_valve", "plastic", "plastic", 0.012, 0.27, [sx, ty0 + tbt + 0.135, tzc], { segments: 8, tint: 0x3d3f42 });
  const float = boxR(b, "fill_float", "plastic", "plastic", [sx + 0.012, sx + 0.062], [0.57, 0.63], [tzc - 0.025, tzc + 0.025], { tint: 0x2f3134, mass: 0.04 });
  const shank = b.cyl("fill_shank", "plastic", "plastic", 0.012, 0.03, [sx, ty0 - 0.015, tzc], { segments: 8, tint: 0x3d3f42 });
  b.screw(fill, tBottom, 1, 25);
  b.glue(float, fill, 8);
  b.screw(shank, tBottom, 1, 25);
  const overflow = b.cyl("flush_overflow", "plastic", "plastic", 0.016, 0.22, [0.02, ty0 + tbt + 0.11, -0.25], { segments: 8, tint: 0xe8e4da });
  const flapper = b.cyl("flush_flapper", "rubber", "rubber", 0.032, 0.012, [0.072, ty0 + tbt + 0.006, -0.25], { segments: 10, tint: 0x8a3a2a });
  b.screw(overflow, tBottom, 1, 25);
  b.press(flapper, tBottom, 3);
  const lever = boxR(b, "flush_lever", CHROME.mat, CHROME.surf, [-0.2, -0.15], [0.692, 0.707], [tz1, tz1 + 0.024], { mass: 0.06 });
  const arm = boxR(b, "flush_arm", "plastic", "plastic", [-0.2, -0.04], [0.695, 0.705], [tz1 - wt - 0.01, tz1 - wt], { tint: 0x2f3134, mass: 0.02 });
  b.press(lever, tFront, 20);
  b.press(arm, lever, 10);

  // ------------------------------------------------------------------ seat + lid
  const seatY = rimY + 0.003; // rests on the rim's raised inner edge
  const seat = ovalLathe(b, "seat", "plastic", "plastic_glossy", "plastic_glossy", {
    profile: [
      [0.18, seatY],
      [0.18, TOILET.seatTopY],
    ],
    thickness: 0.064,
    segments: 10,
    sz,
    pos: [0, 0, zb],
    tint: seatTint,
    seam: "fused",
    seamStrength: 30,
    mass: 0.9, // hollow moulded ring
  });
  const lidPart = b.hull("seat_lid", "plastic", "plastic_glossy", ellipsePrismPoints(0.183, 0.226, 0.016, 16, TOILET.seatTopY), [0, 0, zb + 0.003], { tint: seatTint, mass: 0.75 });
  const posts: string[] = [];
  for (const [k, x] of [
    ["l", -0.07],
    ["r", 0.07],
  ] as Array<[string, number]>) {
    const post = boxR(b, `hinge_post_${k}`, "plastic", "plastic_glossy", [x - 0.015, x + 0.015], [rimY, TOILET.seatTopY - 0.002], [-0.165, -0.125], { tint: seatTint });
    b.bolt(post, deck, 40);
    posts.push(post);
  }
  // seat + lid lift towards the cistern: free edge +Z, opens towards +Y
  const ax = hingeAxis([0, 0, 1], [0, 1, 0]);
  const axis: [number, number, number] = [ax.x, ax.y, ax.z];
  const seatBack = nearest(b, seat, [0, seatY + 0.01, zb - 0.22]);
  const pivY = TOILET.seatTopY - 0.004;
  b.hinge(seatBack, posts, { pivots: [[-0.07, pivY, -0.122], [0.07, pivY, -0.122]], axis, min: 0, max: 100, strength: 15, friction: 0.3 });
  b.hinge(lidPart, posts, { pivots: [[-0.07, pivY, -0.122], [0.07, pivY, -0.122]], axis, min: 0, max: 100, strength: 12, friction: 0.3 });

  // ------------------------------------------------------------------ supply: angle stop + braided line
  const wallZ = tz0 - 0.015;
  const valve = b.cyl("supply_valve", CHROME.mat, CHROME.surf, 0.013, 0.05, [sx, 0.18, wallZ + 0.025], { axis: "z", segments: 10, mass: 0.18 });
  const handle = boxR(b, "supply_handle", CHROME.mat, CHROME.surf, [sx - 0.016, sx + 0.016], [0.174, 0.186], [wallZ + 0.05, wallZ + 0.058], { mass: 0.02 });
  b.press(handle, valve, 6);
  b.world(valve, "bolt", 80, [sx, 0.18, wallZ]);
  const line = b.tube(
    "supply_line",
    "steel",
    "chrome",
    [
      [sx, 0.193, wallZ + 0.035],
      [sx, 0.3, wallZ + 0.04],
      [sx, ty0 - 0.031, tzc],
    ],
    0.0045,
    { sides: 6, kgPerM: 0.12, jointStrength: 40 },
  );
  b.screw(line[0], valve, 1, 30);
  b.screw(line[line.length - 1], shank, 1, 30);
  b.water(valve, [sx, 0.19, wallZ + 0.03], [0, 0.3, 1], 0.7);
  b.water(line[line.length - 1], [sx, ty0 - 0.035, tzc], [0, -0.5, 1], 0.7);

  void tank;
  return finish(b, o);
}
