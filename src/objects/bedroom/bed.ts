// Bed frames.
//  * buildQueenBed: solid pine panel bed for a 1.6 × 2.0 m mattress — headboard (posts, mortised
//    rails, six glued vertical boards, post caps), footboard (posts, end rail, boards, top rail),
//    side rails hooked onto the posts with steel bed-rail brackets, ledger strips screwed along
//    the rails, a centre rail with two steel support legs and 12 slats screwed to the ledgers.
//    Slats snap, rails splinter, brackets bend, the headboard boards split along the grain.
//  * buildMetalBed: black powder-coated steel frame for a 1.4 × 2.0 m mattress — square-tube
//    posts, round-tube head/foot rails with welded spindles, rectangular-tube side/end rails with
//    welded slat flanges, centre beam on a leg, ten sprung plywood slats. Dents and bends.
// Local frame: origin on the floor at the centre of the footprint, headboard at -Z, footboard
// (the "front") at +Z, width along X. The mattress sits on the slats (see *BedDims()).
// PURE MODULE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { fastenSeam } from "../lib/kit.ts";
import { boxR, finish, mk, rectTubeKgPerM, roundTubeKgPerM, PAL, type BaseOpts } from "./common.ts";

// ------------------------------------------------------------------ queen (wood)

export interface QueenBedOpts extends BaseOpts {
  /** Mattress size the frame is made for (m). Default 1.6 × 2.0. */
  mattressW?: number;
  mattressL?: number;
  wood?: "oak" | "walnut" | "pine";
}

export interface BedDims {
  /** Overall footprint (x width, z length) and headboard height. */
  w: number;
  l: number;
  h: number;
  /** Top of the slats = underside of the mattress (m above the floor). */
  slatTop: number;
  /** Mattress size the frame takes and the z of the mattress centre in the bed frame. */
  mattressW: number;
  mattressL: number;
  mattressZ: number;
}

const Q = {
  gap: 0.01,
  railT: 0.022,
  railY: [0.2, 0.36] as const,
  post: 0.06,
  headH: 1.05,
  footH: 0.58,
  ledger: 0.03,
  ledgerTop: 0.3,
  slatT: 0.016,
  slatW: 0.065,
  slats: 12,
};

/** Key dimensions of the queen bed (for placements and tests). */
export function queenBedDims(o: QueenBedOpts = {}): BedDims {
  const mw = o.mattressW ?? 1.6,
    ml = o.mattressL ?? 2.0;
  const wi = mw + 2 * Q.gap,
    li = ml + 2 * Q.gap;
  return { w: wi + 2 * Q.railT, l: li + 2 * Q.post, h: Q.headH + 0.025, slatTop: Q.ledgerTop + Q.slatT, mattressW: mw, mattressL: ml, mattressZ: 0 };
}

const WOOD_SURF: Record<NonNullable<QueenBedOpts["wood"]>, { surf: SurfaceName; tint: number }> = {
  oak: { surf: "wood_oak", tint: 0xe6c9a0 },
  walnut: { surf: "wood_walnut", tint: 0xffffff },
  pine: { surf: "wood_pine", tint: PAL.pineStain },
};

export function buildQueenBed(o: QueenBedOpts = {}): AssemblyDef {
  const b = mk("queenBed", "Queen Bed Frame", "furniture", 650, o);
  const d = queenBedDims(o);
  const { surf, tint } = WOOD_SURF[o.wood ?? "oak"];
  const wi = d.mattressW + 2 * Q.gap,
    li = d.mattressL + 2 * Q.gap;
  const xo = wi / 2 + Q.railT; // outer faces of the rails and posts
  const xp = xo - Q.post; // inner faces of the posts
  const zh = li / 2; // posts' inner faces (head at -zh, foot at +zh)
  const zc = zh + Q.post / 2; // post centre lines
  const W = "softwood" as const;
  const wo = { tint };

  // ---- posts (+ pyramid caps on the head posts)
  const posts: Record<string, string> = {};
  for (const [sx, sz, nm, hgt] of [
    [-1, -1, "hl", Q.headH],
    [1, -1, "hr", Q.headH],
    [-1, 1, "fl", Q.footH],
    [1, 1, "fr", Q.footH],
  ] as Array<[number, number, string, number]>) {
    const x0 = sx < 0 ? -xo : xp,
      x1 = sx < 0 ? -xp : xo;
    const z0 = sz < 0 ? -zh - Q.post : zh,
      z1 = sz < 0 ? -zh : zh + Q.post;
    posts[nm] = boxR(b, `post_${nm}`, W, surf, [x0, x1], [0, hgt], [z0, z1], { ...wo, grain: "y" });
  }
  for (const nm of ["hl", "hr"]) {
    const cx = (nm === "hl" ? -1 : 1) * (xo - Q.post / 2);
    const s0 = Q.post / 2 + 0.005,
      s1 = 0.016;
    const y0 = Q.headH,
      y1 = Q.headH + 0.025;
    const pts: Array<[number, number, number]> = [];
    for (const [a, c] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      pts.push([cx + a * s0, y0, -zc + c * s0]);
      pts.push([cx + a * s1, y1, -zc + c * s1]);
    }
    const cap = b.hull(`cap_${nm}`, W, surf, pts, [0, 0, 0], { ...wo, grain: "y" });
    b.glue(cap, posts[nm], 15);
  }

  // ---- headboard: mortised rails + six vertical boards
  const railZ: [number, number] = [-zc - 0.015, -zc + 0.015];
  const boardZ: [number, number] = [-zc - 0.009, -zc + 0.009];
  const headLow = boxR(b, "head_rail_low", W, surf, [-xp, xp], [0.2, 0.44], railZ, { ...wo, grain: "x" });
  const headTop = boxR(b, "head_rail_top", W, surf, [-xp, xp], [0.93, 1.01], railZ, { ...wo, grain: "x" });
  for (const r of [headLow, headTop]) {
    b.dowel(r, posts.hl, 2, 40);
    b.dowel(r, posts.hr, 2, 40);
  }
  const nb = 6;
  const bw = (2 * xp) / nb;
  let prev = "";
  for (let k = 0; k < nb; k++) {
    const x0 = -xp + k * bw;
    const bd = boxR(b, `head_board${k}`, W, surf, [x0, x0 + bw], [0.44, 0.93], boardZ, { ...wo, grain: "y" });
    b.glue(bd, headLow, 25);
    b.glue(bd, headTop, 25);
    if (prev) b.glue(bd, prev, 10); // tongue & groove
    prev = bd;
  }

  // ---- footboard: end rail, three boards, top rail
  const fRailZ: [number, number] = [zc - 0.015, zc + 0.015];
  const fBoardZ: [number, number] = [zc - 0.009, zc + 0.009];
  const footEnd = boxR(b, "foot_rail_end", W, surf, [-xp, xp], [0.2, 0.36], fRailZ, { ...wo, grain: "x" });
  const footTop = boxR(b, "foot_rail_top", W, surf, [-xp, xp], [0.47, 0.55], fRailZ, { ...wo, grain: "x" });
  for (const r of [footEnd, footTop]) {
    b.dowel(r, posts.fl, 2, 40);
    b.dowel(r, posts.fr, 2, 40);
  }
  const fb = 3;
  const fw = (2 * xp) / fb;
  prev = "";
  for (let k = 0; k < fb; k++) {
    const x0 = -xp + k * fw;
    const bd = boxR(b, `foot_board${k}`, W, surf, [x0, x0 + fw], [0.36, 0.47], fBoardZ, { ...wo, grain: "y" });
    b.glue(bd, footEnd, 20);
    b.glue(bd, footTop, 20);
    if (prev) b.glue(bd, prev, 8);
    prev = bd;
  }

  // ---- side rails on hook-in steel brackets, ledger strips
  const ledgers: string[] = [];
  for (const sx of [-1, 1]) {
    const nm = sx < 0 ? "l" : "r";
    const xr: [number, number] = sx < 0 ? [-xo, -wi / 2] : [wi / 2, xo];
    const rail = boxR(b, `rail_${nm}`, W, surf, xr, Q.railY, [-zh, zh], { ...wo, grain: "z" });
    const xb: [number, number] = sx < 0 ? [-wi / 2, -wi / 2 + 0.004] : [wi / 2 - 0.004, wi / 2];
    for (const [sz, end] of [
      [-1, "h"],
      [1, "f"],
    ] as Array<[number, string]>) {
      const zr: [number, number] = sz < 0 ? [-zh, -zh + 0.06] : [zh - 0.06, zh];
      const br = boxR(b, `bracket_${nm}${end}`, "steel", "metal_black", xb, [0.22, 0.34], zr, { tess: 0 });
      b.screw(br, rail, 3, 30);
      b.bolt(br, posts[`${end}${nm}`], 120); // hook plate in the post's mortised slot
    }
    const xl: [number, number] = sx < 0 ? [-wi / 2, -wi / 2 + Q.ledger] : [wi / 2 - Q.ledger, wi / 2];
    const led = boxR(b, `ledger_${nm}`, W, "wood_pine", xl, [Q.ledgerTop - Q.ledger, Q.ledgerTop], [-zh + 0.06, zh - 0.06], { grain: "z" });
    fastenSeam(b, led, rail, "screw", { spacing: 0.25, each: 30 });
    ledgers.push(led);
  }

  // ---- centre rail + two steel support legs
  const cr = boxR(b, "centre_rail", W, "wood_pine", [-0.0175, 0.0175], [0.21, Q.ledgerTop], [-zc + 0.015, zc - 0.015], { grain: "z" });
  b.screw(cr, headLow, 2, 30);
  b.screw(cr, footEnd, 2, 30);
  for (const z of [-0.5, 0.5]) {
    const nm = z < 0 ? "h" : "f";
    const leg = b.cyl(`leg_${nm}`, "steel", "metal_black", 0.0125, 0.21 - 0.012, [0, 0.012 + (0.21 - 0.012) / 2, z], { segments: 10, mass: roundTubeKgPerM(0.025, 0.0015) * 0.2 + 0.08 });
    const pad = b.cyl(`pad_${nm}`, "plastic", "plastic", 0.022, 0.012, [0, 0.006, z], { segments: 10, tint: PAL.black });
    b.screw(leg, cr, 2, 25);
    b.press(pad, leg, 10);
  }

  // ---- slats (screwed at both ends, resting on the centre rail)
  const span = 2 * (zh - 0.06);
  const pitch = span / Q.slats;
  for (let k = 0; k < Q.slats; k++) {
    const z = -zh + 0.06 + pitch * (k + 0.5);
    const s = boxR(b, `slat${k}`, W, "wood_pine", [-wi / 2 + 0.005, wi / 2 - 0.005], [Q.ledgerTop, Q.ledgerTop + Q.slatT], [z - Q.slatW / 2, z + Q.slatW / 2], { grain: "x", tint: 0xf0dcc0 });
    b.screw(s, ledgers[0], 1, 20);
    b.screw(s, ledgers[1], 1, 20);
    b.friction(s, cr, 4);
  }
  return finish(b, o);
}

// ------------------------------------------------------------------ metal double bed

export interface MetalBedOpts extends BaseOpts {
  mattressW?: number;
  mattressL?: number;
  /** Powder-coat colour. */
  tint?: number;
}

const M = {
  gap: 0.01,
  post: 0.035,
  postWall: 0.0015,
  headH: 1.0,
  footH: 0.55,
  railY: [0.26, 0.32] as const,
  railT: 0.03,
  flangeW: 0.025,
  flangeT: 0.004,
  slatT: 0.012,
  slatW: 0.06,
  slats: 10,
  foot: 0.008,
};

/** Key dimensions of the metal bed. */
export function metalBedDims(o: MetalBedOpts = {}): BedDims {
  const mw = o.mattressW ?? 1.4,
    ml = o.mattressL ?? 2.0;
  const wi = mw + 2 * M.gap,
    li = ml + 2 * M.gap;
  return { w: wi + 2 * M.railT, l: li + 2 * M.post, h: M.headH, slatTop: M.railY[0] + M.flangeT + M.slatT, mattressW: mw, mattressL: ml, mattressZ: 0 };
}

export function buildMetalBed(o: MetalBedOpts = {}): AssemblyDef {
  const b = mk("metalBed", "Metal Bed Frame", "furniture", 280, o);
  const d = metalBedDims(o);
  const tint = o.tint ?? 0xffffff;
  const S = "metal_black" as const;
  const wi = d.mattressW + 2 * M.gap,
    li = d.mattressL + 2 * M.gap;
  const xo = wi / 2 + M.railT; // outer faces
  const xp = xo - M.post; // posts' inner faces
  const zh = li / 2;
  const zc = zh + M.post / 2;
  const postKg = rectTubeKgPerM(M.post, M.post, M.postWall);
  const railKg = rectTubeKgPerM(M.railT, M.railY[1] - M.railY[0], 0.0015);
  const st = { tint, tess: 0 };

  // ---- posts with plastic feet and end caps
  const posts: Record<string, string> = {};
  for (const [sx, sz, nm, hgt] of [
    [-1, -1, "hl", M.headH],
    [1, -1, "hr", M.headH],
    [-1, 1, "fl", M.footH],
    [1, 1, "fr", M.footH],
  ] as Array<[number, number, string, number]>) {
    const x0 = sx < 0 ? -xo : xp,
      x1 = sx < 0 ? -xp : xo;
    const z0 = sz < 0 ? -zh - M.post : zh,
      z1 = sz < 0 ? -zh : zh + M.post;
    const len = hgt - M.foot - 0.006;
    const p = boxR(b, `post_${nm}`, "steel", S, [x0, x1], [M.foot, M.foot + len], [z0, z1], { ...st, mass: postKg * len });
    const foot = boxR(b, `foot_${nm}`, "plastic", "plastic", [x0, x1], [0, M.foot], [z0, z1], { tint: PAL.black });
    const cap = boxR(b, `cap_${nm}`, "plastic", "plastic", [x0, x1], [M.foot + len, hgt], [z0, z1], { tint: PAL.black });
    b.press(foot, p, 8);
    b.press(cap, p, 6);
    posts[nm] = p;
  }

  // ---- head and foot frames: round rails + welded spindles
  const rail = (nm: string, y: number, z: number, r: number): string =>
    b.cyl(nm, "steel", S, r, 2 * xp, [0, y, z], { axis: "x", segments: 10, ...st, mass: roundTubeKgPerM(2 * r, 0.0012) * 2 * xp });
  const frame = (end: "h" | "f", z: number, yLow: number, yTop: number, n: number): void => {
    const top = rail(`${end}_rail_top`, yTop, z, 0.0125);
    const low = rail(`${end}_rail_low`, yLow, z, 0.0125);
    for (const r of [top, low]) {
      b.weld(r, posts[`${end}l`], 160);
      b.weld(r, posts[`${end}r`], 160);
    }
    const sp = (2 * xp) / (n + 1);
    // spindle ends sit ~2 mm into the rail tubes (welded saddle joints)
    const y0 = yLow + 0.0105,
      y1 = yTop - 0.0105;
    for (let k = 0; k < n; k++) {
      const x = -xp + sp * (k + 1);
      const s = b.cyl(`${end}_spindle${k}`, "steel", S, 0.008, y1 - y0, [x, (y0 + y1) / 2, z], { segments: 8, ...st, mass: roundTubeKgPerM(0.016, 0.001) * (y1 - y0) });
      b.weld(s, top, 45);
      b.weld(s, low, 45);
    }
  };
  frame("h", -zc, 0.42, 0.94, 7);
  frame("f", zc, 0.36, 0.5, 5);

  // ---- base frame: side + end rails (rect tube) with welded slat flanges, centre beam on a leg
  const flangeTop = M.railY[0] + M.flangeT;
  const sides: string[] = [];
  const flanges: string[] = [];
  for (const sx of [-1, 1]) {
    const nm = sx < 0 ? "l" : "r";
    const xr: [number, number] = sx < 0 ? [-xo, -wi / 2] : [wi / 2, xo];
    const r = boxR(b, `rail_${nm}`, "steel", S, xr, M.railY, [-zh, zh], { ...st, mass: railKg * li });
    b.bolt(r, posts[`h${nm}`], 150);
    b.bolt(r, posts[`f${nm}`], 150);
    const xf: [number, number] = sx < 0 ? [-wi / 2, -wi / 2 + M.flangeW] : [wi / 2 - M.flangeW, wi / 2];
    const f = boxR(b, `flange_${nm}`, "steel", S, xf, [M.railY[0], flangeTop], [-zh, zh], st);
    fastenSeam(b, f, r, "weld", { spacing: 0.15, each: 25 });
    sides.push(r);
    flanges.push(f);
  }
  const ends: string[] = [];
  for (const [sz, end] of [
    [-1, "h"],
    [1, "f"],
  ] as Array<[number, "h" | "f"]>) {
    const zr: [number, number] = sz < 0 ? [-zc - 0.015, -zc + 0.015] : [zc - 0.015, zc + 0.015];
    const r = boxR(b, `end_rail_${end}`, "steel", S, [-xp, xp], M.railY, zr, { ...st, mass: railKg * 2 * xp });
    b.weld(r, posts[`${end}l`], 160);
    b.weld(r, posts[`${end}r`], 160);
    ends.push(r);
  }
  const beam = boxR(b, "centre_beam", "steel", S, [-0.015, 0.015], [flangeTop - 0.04, flangeTop], [-zc + 0.015, zc - 0.015], { ...st, mass: rectTubeKgPerM(0.03, 0.04, 0.0015) * (2 * zc - 0.03) });
  b.bolt(beam, ends[0], 80);
  b.bolt(beam, ends[1], 80);
  const legLen = flangeTop - 0.04 - M.foot;
  const leg = b.cyl("leg", "steel", S, 0.0125, legLen, [0, M.foot + legLen / 2, 0], { segments: 10, ...st, mass: roundTubeKgPerM(0.025, 0.0015) * legLen });
  const legFoot = b.cyl("leg_foot", "rubber", "rubber", 0.02, M.foot, [0, M.foot / 2, 0], { segments: 10 });
  b.screw(leg, beam, 2, 40);
  b.press(legFoot, leg, 8);

  // ---- sprung plywood slats resting on the flanges and the beam
  const span = 2 * zh - 0.1;
  const pitch = span / M.slats;
  for (let k = 0; k < M.slats; k++) {
    const z = -zh + 0.05 + pitch * (k + 0.5);
    const s = boxR(b, `slat${k}`, "plywood", "wood_pine", [-wi / 2 + 0.002, wi / 2 - 0.002], [flangeTop, flangeTop + M.slatT], [z - M.slatW / 2, z + M.slatW / 2], { grain: "x", tint: 0xf3dfc2 });
    b.clip(s, flanges[0], 8); // plastic slat holder caps
    b.clip(s, flanges[1], 8);
    b.friction(s, beam, 3);
  }
  void sides;
  return finish(b, o);
}
