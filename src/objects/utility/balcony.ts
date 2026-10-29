// Balcony furniture: aluminium patio chairs with plastic slats, a bistro table with a toughened
// glass top, terracotta planters (soil feature, real-weight soil), and the AC condenser unit.
//
// Frame: origin on the floor (balcony slab top) at the centre of the footprint, front +Z.

import { hingeAxis, pcb, spokeRot } from "../lib/kit.ts";
import { boxR, bondNearest, bondTouching, finish, mk, rhsKg, tubeKgPerM, BRASS, type BaseOpts } from "./helpers.ts";
import type { V3 } from "../lib/builder.ts";
import { polyChord } from "../../geom/poly.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";

// =============================================================================================
// Patio chair
// =============================================================================================

export const PATIO_CHAIR = { w: 0.56, d: 0.58, h: 0.86, seatY: 0.437 } as const;

/** Aluminium patio armchair: welded square-tube frame, five seat slats and three back slats (plastic). ~4.8 kg. */
export function buildPatioChair(o: BaseOpts & { tint?: number; slatTint?: number } = {}): AssemblyDef {
  const b = mk("patioChair", "Patio Chair", "furniture", 70, o);
  const frameTint = o.tint ?? 0xbfc3c6;
  const slatTint = o.slatTint ?? 0x7a5236;
  const s = 0.025; // tube size
  const kgm = rhsKg(s, s, 0.002, 1, 2700);
  const xL = PATIO_CHAIR.w / 2 - s / 2;
  const tilt = Math.tan((7 * Math.PI) / 180);
  const zBack0 = -0.235; // back leg centre at the floor
  const zPost = (y: number) => zBack0 - y * tilt; // back post centre line
  const zFront = 0.25;
  const H = PATIO_CHAIR.h;
  const sq = (x: number, y: number, z: number): V3[] => [
    [x - s / 2, y, z - s / 2],
    [x + s / 2, y, z - s / 2],
    [x - s / 2, y, z + s / 2],
    [x + s / 2, y, z + s / 2],
  ];
  const tube = { tint: frameTint, tess: 0 };
  const legs: Record<string, string> = {};
  const posts: Record<string, string> = {};
  for (const [k, sx] of [
    ["l", -1],
    ["r", 1],
  ] as Array<[string, number]>) {
    const x = sx * xL;
    legs[k] = boxR(b, `leg_${k}`, "aluminum", "aluminum", [x - s / 2, x + s / 2], [0, 0.62], [zFront - s / 2, zFront + s / 2], { ...tube, mass: kgm * 0.62 });
    posts[k] = b.hull(`post_${k}`, "aluminum", "aluminum", [...sq(x, 0, zPost(0)), ...sq(x, H, zPost(H))], [0, 0, 0], { ...tube, mass: kgm * H });
  }
  // seat rails (welded), arms on top of the front legs back to the posts
  const yR0 = 0.4,
    yR1 = 0.425;
  const rails: string[] = [];
  for (const [k, sx] of [
    ["l", -1],
    ["r", 1],
  ] as Array<[string, number]>) {
    const x = sx * xL;
    const z1 = zPost(yR1) + s / 2;
    const r = boxR(b, `rail_${k}`, "aluminum", "aluminum", [x - s / 2, x + s / 2], [yR0, yR1], [z1, zFront - s / 2], { ...tube, mass: kgm * (zFront - z1) });
    b.weld(r, legs[k], 90);
    b.weld(r, posts[k], 90);
    rails.push(r);
    const yA0 = 0.62,
      yA1 = 0.632;
    const za1 = zPost(yA1) + s / 2;
    const arm = boxR(b, `arm_${k}`, "aluminum", "aluminum", [x - 0.02, x + 0.02], [yA0, yA1], [za1, zFront + 0.03], { ...tube, mass: 0.28 });
    b.weld(arm, legs[k], 90);
    b.weld(arm, posts[k], 90);
  }
  const frontRail = boxR(b, "rail_f", "aluminum", "aluminum", [-xL + s / 2, xL - s / 2], [yR0, yR1], [zFront - s / 2, zFront + s / 2], { ...tube, mass: kgm * 0.5 });
  b.weld(frontRail, legs.l, 90);
  b.weld(frontRail, legs.r, 90);
  const backRail = b.hull("rail_b", "aluminum", "aluminum", [...sq(0, yR0, zPost(yR0)).map(([, y, z]) => [-xL + s / 2, y, z] as V3), ...sq(0, yR0, zPost(yR0)).map(([, y, z]) => [xL - s / 2, y, z] as V3), ...sq(0, yR1, zPost(yR1)).map(([, y, z]) => [-xL + s / 2, y, z] as V3), ...sq(0, yR1, zPost(yR1)).map(([, y, z]) => [xL - s / 2, y, z] as V3)], [0, 0, 0], { ...tube, mass: kgm * 0.5 });
  b.weld(backRail, posts.l, 90);
  b.weld(backRail, posts.r, 90);
  // plastic seat slats screwed onto the side rails
  const nS = 5;
  const zS0 = zPost(yR1) + s / 2 + 0.005,
    zS1 = zFront + s / 2;
  const sw = (zS1 - zS0 - (nS - 1) * 0.018) / nS;
  for (let k = 0; k < nS; k++) {
    const z0 = zS0 + k * (sw + 0.018);
    const slat = boxR(b, `seat_slat${k}`, "plastic", "plastic", [-xL - s / 2, xL + s / 2], [yR1, PATIO_CHAIR.seatY], [z0, z0 + sw], { tint: slatTint, mass: 0.2 });
    b.screw(slat, rails[0], 1, 20);
    b.screw(slat, rails[1], 1, 20);
  }
  // back slats between the posts, following their rake
  for (let k = 0; k < 3; k++) {
    const yc = 0.56 + k * 0.105;
    const pts: V3[] = [];
    for (const x of [-xL + s / 2, xL - s / 2])
      for (const y of [yc - 0.04, yc + 0.04])
        for (const dz of [-0.006, 0.006]) pts.push([x, y, zPost(y) + dz]);
    const slat = b.hull(`back_slat${k}`, "plastic", "plastic", pts, [0, 0, 0], { tint: slatTint, mass: 0.2 });
    b.screw(slat, posts.l, 1, 20);
    b.screw(slat, posts.r, 1, 20);
  }
  void spokeRot;
  return finish(b, o);
}

// =============================================================================================
// Bistro table
// =============================================================================================

export const BISTRO_TABLE = { r: 0.3, h: 0.722 } as const;

/** Round bistro table: aluminium tube ring + three splayed legs + stretchers, toughened glass top on rubber pads. ~5.5 kg. */
export function buildBistroTable(o: BaseOpts & { tint?: number } = {}): AssemblyDef {
  const b = mk("bistroTable", "Bistro Table", "furniture", 120, o);
  const tint = o.tint ?? 0x2f3133;
  const tr = 0.012;
  const kgm = tubeKgPerM(2 * tr, 0.0015, 2700);
  const yRing = 0.7;
  const ringPts: V3[] = [];
  for (let k = 0; k < 10; k++) {
    const a = (2 * Math.PI * k) / 10;
    ringPts.push([0.28 * Math.cos(a), yRing, 0.28 * Math.sin(a)]);
  }
  const ring = b.tube("ring", "aluminum", "aluminum", ringPts, tr, { closed: true, sides: 8, tint, kgPerM: kgm, jointStrength: 120, tess: 0 });
  // three splayed legs welded under the ring
  const legAngles = [90, 210, 330].map((d) => (d * Math.PI) / 180);
  const legs: string[] = [];
  const legTop = (a: number): V3 => [0.27 * Math.cos(a), yRing - tr - 0.0005, 0.27 * Math.sin(a)];
  const legBot = (a: number): V3 => [0.3 * Math.cos(a), tr * 0.06, 0.3 * Math.sin(a)];
  legAngles.forEach((a, k) => {
    const seg = b.tube(`leg${k}`, "aluminum", "aluminum", [legBot(a), legTop(a)], tr, { sides: 8, tint, kgPerM: kgm, tess: 0 });
    legs.push(seg[0]);
    bondNearest(b, seg[0], ring, "weld", 120, legTop(a));
  });
  // stretchers between the legs at 0.25 m
  const at = (a: number, y: number): [number, number, number] => {
    const t = (y - tr * 0.06) / (yRing - tr - 0.0005 - tr * 0.06);
    const r = 0.3 + (0.27 - 0.3) * t;
    return [r * Math.cos(a), y, r * Math.sin(a)];
  };
  for (let k = 0; k < 3; k++) {
    const p = at(legAngles[k], 0.25),
      q = at(legAngles[(k + 1) % 3], 0.25);
    const dx = q[0] - p[0],
      dz = q[2] - p[2];
    const l = Math.hypot(dx, dz);
    const sh = (tr + 0.0005) / l;
    const st = b.tube(`stretcher${k}`, "aluminum", "aluminum", [[p[0] + dx * sh, 0.25, p[2] + dz * sh], [q[0] - dx * sh, 0.25, q[2] - dz * sh]], 0.008, { sides: 6, tint, kgPerM: tubeKgPerM(0.016, 0.0012, 2700), tess: 0 });
    b.weld(st[0], legs[k], 60);
    b.weld(st[0], legs[(k + 1) % 3], 60);
  }
  // glass top on four rubber pads
  const yPad = yRing + tr;
  const pads: string[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (Math.PI / 2) * k + Math.PI / 10;
    const r = 0.28 * Math.cos(Math.PI / 10);
    pads.push(b.cyl(`pad${k}`, "rubber", "rubber", 0.012, 0.004, [r * Math.cos(a), yPad + 0.002, r * Math.sin(a)], { segments: 8, tint: 0x1b1b1b, mass: 0.003 }));
  }
  for (const p of pads) {
    const c = b.get(p).poly.verts.reduce((acc, q) => [acc[0] + q.x, acc[1] + q.y, acc[2] + q.z], [0, 0, 0]);
    const n = b.get(p).poly.verts.length;
    bondNearest(b, p, ring, "glue", 10, [c[0] / n, yPad, c[2] / n]);
  }
  const glass = b.cyl("top", "temperedGlass", "glass", BISTRO_TABLE.r, 0.006, [0, yPad + 0.004 + 0.003, 0], { segments: 16, capSurf: "glass", smooth: 0 });
  for (const p of pads) b.friction(glass, p, 3);
  return finish(b, o);
}

// =============================================================================================
// Terracotta planter
// =============================================================================================

export interface PlanterOpts extends BaseOpts {
  plant?: "bush" | "snake" | "herb";
  /** Pot scale (1 = Ø 31 cm × 29 cm). */
  size?: number;
}

/** Terracotta pot with real-weight soil (soil feature) and a plant (soft foliage). */
export function buildTerracottaPlant(o: PlanterOpts = {}): AssemblyDef {
  const plant = o.plant ?? "bush";
  const k = o.size ?? (plant === "herb" ? 0.6 : 1);
  const b = mk("terracottaPlant", plant === "snake" ? "Snake Plant" : plant === "herb" ? "Herb Pot" : "Potted Shrub", "decor", 45, o);
  const r0 = 0.11 * k,
    r1 = 0.155 * k,
    H = 0.29 * k,
    t = 0.012 * Math.max(0.7, k);
  const SEG = 8;
  const pot = b.lathe("pot", "ceramic", "ceramic_bisque", "ceramic_bisque", {
    profile: [
      [r0, 0],
      [r1, H],
    ],
    thickness: t,
    segments: SEG,
    capBottom: true,
    tint: 0xc0683e,
    innerTint: 0x9a5434,
    edgeSurf: "ceramic_bisque",
  });
  // soil: an octagonal frustum aligned with the pot's inner faces, 3 cm below the rim
  const slope = (r1 - r0) / H;
  const ca = Math.cos(Math.atan(slope));
  const rIn = (y: number) => r0 + slope * y - t / ca;
  const ys0 = t + 0.0005,
    ys1 = H - 0.03 * k;
  const soil = b.cyl("soil", "soil", "soil", rIn(ys0) - 0.002, ys1 - ys0, [0, (ys0 + ys1) / 2, 0], { rTop: rIn(ys1) - 0.002, segments: SEG, smooth: 0 });
  const floorTiles = pot.filter((p) => b.get(p).poly.verts.every((v) => v.y < t + 1e-4));
  for (const f of floorTiles) b.friction(soil, f, 3 / floorTiles.length);
  b.soil(soil);
  const green = [0x3f7a35, 0x4e8c3a, 0x356a2f];
  if (plant === "bush") {
    const stemH = 0.14 * k;
    const stem = b.cyl("stem", "softwood", "wood_fiber", 0.01, stemH, [0, ys1 + stemH / 2, 0], { segments: 6, tint: 0x5a4030 });
    b.glue(stem, soil, 10);
    for (let j = 0; j < 3; j++) {
      const a = (2 * Math.PI * j) / 3 + 0.4;
      const rr = 0.095 * k;
      const c: [number, number, number] = [0.1 * k * Math.cos(a), ys1 + stemH + rr * 0.6, 0.1 * k * Math.sin(a)];
      const f = b.ellipsoid(`foliage${j}`, "fabric", "foliage", [rr * 0.92, rr * 0.8, rr * 0.92], c, { tint: green[j], mass: 0.12 * k, segments: 8, rings: 5 });
      // a short branch from the stem's side out to the cluster's surface
      const hx = Math.cos(a),
        hz = Math.sin(a);
      const top: [number, number, number] = [hx * 0.008, ys1 + stemH - 0.012, hz * 0.008];
      const dir = [c[0] - top[0], c[1] - top[1], c[2] - top[2]];
      const dl = Math.hypot(dir[0], dir[1], dir[2]);
      const u = [dir[0] / dl, dir[1] / dl, dir[2] / dl];
      // where the ray from the stem enters the (faceted) cluster: the branch ends 2 mm inside it
      const ch = polyChord(b.get(f).poly, { x: top[0], y: top[1], z: top[2] }, { x: u[0], y: u[1], z: u[2] });
      const reach = Math.max(0.012, (ch ? ch.tMin : dl * 0.4) + 0.002);
      const end: V3 = [top[0] + u[0] * reach, top[1] + u[1] * reach, top[2] + u[2] * reach];
      const br = b.tube(`branch${j}`, "softwood", "wood_fiber", [top, end], 0.005, { sides: 5, tint: 0x5a4030 });
      b.glue(br[0], stem, 10);
      b.glue(f, br[0], 8);
    }
  } else if (plant === "snake") {
    // sword-shaped leaves fanning out of the soil: slanted slabs (hulls), bases 2 mm into the soil
    for (let j = 0; j < 6; j++) {
      const ar = (2 * Math.PI * j) / 6;
      const lean = ((6 + (j % 3) * 3) * Math.PI) / 180;
      const len = (0.42 + (j % 2) * 0.12) * k;
      const r = 0.045 * k;
      const rad = [Math.cos(ar), 0, Math.sin(ar)];
      const tan = [-Math.sin(ar), 0, Math.cos(ar)];
      const B = [r * rad[0], ys1 - 0.002, r * rad[2]];
      const T = [B[0] + rad[0] * Math.sin(lean) * len, B[1] + Math.cos(lean) * len, B[2] + rad[2] * Math.sin(lean) * len];
      const pts: V3[] = [];
      for (const [P, hw, ht] of [
        [B, 0.0225 * k, 0.003],
        [T, 0.012 * k, 0.002],
      ] as Array<[number[], number, number]>)
        for (const sw of [-1, 1])
          for (const st of [-1, 1]) pts.push([P[0] + tan[0] * hw * sw + rad[0] * ht * st, P[1], P[2] + tan[2] * hw * sw + rad[2] * ht * st]);
      const leaf = b.hull(`leaf${j}`, "fabric", "foliage", pts, [0, 0, 0], { tint: green[j % 3], mass: 0.04 * k });
      b.glue(leaf, soil, 5);
    }
  } else {
    for (let j = 0; j < 2; j++) {
      const rr = 0.07 * k;
      const f = b.ellipsoid(`foliage${j}`, "fabric", "foliage", [rr, rr * 0.75, rr], [(j - 0.5) * 2.05 * rr, ys1 + rr * 0.72, 0], { tint: green[j], mass: 0.05, segments: 8, rings: 5 });
      b.glue(f, soil, 5);
    }
  }
  return finish(b, o);
}

// =============================================================================================
// AC condenser
// =============================================================================================

export interface CondenserOpts extends BaseOpts {
  /** Where the refrigerant line set enters the wall (local); default straight back. */
  lineSet?: V3;
  /** Fan speed (rad/s) while powered; 0 = idle. */
  fanSpeed?: number;
}

export const AC_CONDENSER = { w: 0.8, h: 0.58, d: 0.3 } as const;

/**
 * Split-AC outdoor unit: 0.8 mm painted steel cabinet on rubber feet, front fan grille with a
 * three-blade fan on a powered motor hinge, an L-shaped aluminium/copper condenser coil, a 13 kg
 * rotary compressor on rubber grommets behind a partition, copper discharge/suction loops,
 * brass service valves, the insulated line set and control cable into the wall, and the control
 * board + run capacitor (sparks). ~38 kg.
 */
export function buildAcCondenser(o: CondenserOpts = {}): AssemblyDef {
  const b = mk("acCondenser", "AC Condenser", "appliance", 900, o);
  const { w: W, h: H, d: D } = AC_CONDENSER;
  const t = 0.0008;
  const paint = { tint: 0xe6e6e2 };
  const y0 = 0.03; // cabinet bottom (on the rubber feet)
  const feet: string[] = [];
  for (const sx of [-1, 1]) feet.push(boxR(b, `foot_${sx < 0 ? "l" : "r"}`, "rubber", "rubber", [sx * 0.3 - 0.025, sx * 0.3 + 0.025], [0, y0], [-D / 2 + 0.01, D / 2 - 0.01], { tint: 0x222222, mass: 0.3 }));
  // cabinet
  const base = boxR(b, "base", "steelSheet", "metal_painted", [-W / 2, W / 2], [y0, y0 + 0.0012], [-D / 2, D / 2], paint);
  for (const f of feet) b.bolt(f, base, 80);
  const yTop = y0 + H;
  const top = boxR(b, "top", "steelSheet", "metal_painted", [-W / 2, W / 2], [yTop - t, yTop], [-D / 2, D / 2], paint);
  const sideL = boxR(b, "side_l", "steelSheet", "metal_painted", [-W / 2, -W / 2 + t], [y0 + 0.0012, yTop - t], [-D / 2, D / 2], paint);
  const sideR = boxR(b, "side_r", "steelSheet", "metal_painted", [W / 2 - t, W / 2], [y0 + 0.0012, yTop - t], [-D / 2, D / 2], paint);
  const back = boxR(b, "back_guard", "steelSheet", "vent_grille", [-W / 2 + t, W / 2 - t], [y0 + 0.0012, yTop - t], [-D / 2, -D / 2 + 0.001], { tint: 0x8c8f92 });
  // front: fan opening on the viewer's left (+X), compressor compartment panel on the right (−X)
  const fx = 0.15,
    fy = y0 + H / 2,
    hole = 0.21;
  const zf0 = D / 2 - t;
  const fR = boxR(b, "front_r", "steelSheet", "metal_painted", [-W / 2 + t, fx - hole], [y0 + 0.0012, yTop - t], [zf0, D / 2], paint);
  const fL = boxR(b, "front_l", "steelSheet", "metal_painted", [fx + hole, W / 2 - t], [y0 + 0.0012, yTop - t], [zf0, D / 2], paint);
  const fT = boxR(b, "front_t", "steelSheet", "metal_painted", [fx - hole, fx + hole], [fy + hole, yTop - t], [zf0, D / 2], paint);
  const fB = boxR(b, "front_b", "steelSheet", "metal_painted", [fx - hole, fx + hole], [y0 + 0.0012, fy - hole], [zf0, D / 2], paint);
  const grille = boxR(b, "fan_grille", "steelSheet", "vent_grille", [fx - hole, fx + hole], [fy - hole, fy + hole], [zf0, D / 2], { tint: 0x2e2f31, tess: 0.05 });
  const shell = [base, top, sideL, sideR, back, fR, fL, fT, fB, grille];
  for (let i = 0; i < shell.length; i++)
    for (let j = i + 1; j < shell.length; j++) {
      const c = b.contact(shell[i], shell[j], 0.0006);
      if (c && (c.kind === "face" || c.length > 0.05)) b.bond(shell[i], shell[j], shell[j] === grille || shell[i] === grille ? "clip" : "screw", { strength: shell[i] === top || shell[j] === top ? 50 : 70 });
    }
  // partition between fan and compressor compartments
  const px = fx - hole - 0.02;
  const part = boxR(b, "partition", "steelSheet", "metal_painted", [px - t, px], [y0 + 0.0012, yTop - t], [-D / 2 + 0.06, zf0], { tint: 0xcfcfcb });
  b.screw(part, base, 2, 25);
  b.screw(part, top, 2, 25);

  // ------------------------------------------------------------------ coil (L-shaped: back + left side)
  const coilBack = boxR(b, "coil_back", "aluminum", "vent_grille", [px + 0.005, W / 2 - 0.045], [y0 + 0.0012, yTop - 0.02], [-D / 2 + 0.002, -D / 2 + 0.042], { tint: 0xb8bcbe, mass: 4.2, tess: 0 });
  const coilSide = boxR(b, "coil_side", "aluminum", "vent_grille", [W / 2 - 0.045, W / 2 - t - 0.002], [y0 + 0.0012, yTop - 0.02], [-D / 2 + 0.002, D / 2 - 0.04], { tint: 0xb8bcbe, mass: 2.6, tess: 0 });
  b.screw(coilBack, base, 2, 30);
  b.screw(coilSide, base, 2, 30);
  b.weld(coilBack, coilSide, 60);
  const bends = b.cyl("coil_bends", "copper", "copper", 0.018, H - 0.06, [px + 0.022, y0 + H / 2, -D / 2 + 0.06], { segments: 8, mass: 0.6, tess: 0 });
  b.weld(bends, coilBack, 60);

  // ------------------------------------------------------------------ fan: motor on a bracket, hub on a powered hinge
  const bracket = boxR(b, "fan_bracket", "steel", "metal_raw", [fx - 0.02, fx + 0.02], [y0 + 0.0012, yTop - t], [-D / 2 + 0.042, -D / 2 + 0.06], { tess: 0, mass: 0.6 });
  b.screw(bracket, base, 2, 30);
  b.screw(bracket, top, 2, 30);
  const motorZ0 = -D / 2 + 0.06;
  const motor = b.cyl("fan_motor", "steel", "metal_raw", 0.055, 0.075, [fx, fy, motorZ0 + 0.0375], { axis: "z", segments: 10, mass: 2.2 });
  b.bolt(motor, bracket, 120);
  const hubZ0 = motorZ0 + 0.075;
  const hub = b.cyl("fan_hub", "plastic", "plastic", 0.04, 0.05, [fx, fy, hubZ0 + 0.025], { axis: "z", segments: 10, tint: 0x2a2a2a, mass: 0.15 });
  const blades: string[] = [];
  b.group([fx, fy, hubZ0 + 0.03], undefined, "fan_", () => {
    for (let k = 0; k < 3; k++) {
      const a = 120 * k + 30;
      const r = 0.04 + 0.072;
      blades.push(b.box(`blade${k}`, "plastic", "plastic", [0.15, 0.085, 0.004], [r * Math.cos((a * Math.PI) / 180), r * Math.sin((a * Math.PI) / 180), 0], { rot: spokeRot("z", a, 28), tint: 0x2a2a2a, mass: 0.12 }));
    }
  });
  for (const bl of blades) bondTouching(b, bl, [hub], "fused", 40, 0.004);
  const g = b.hinge(hub, motor, { pivots: [[fx, fy, hubZ0]], axis: [0, 0, 1], min: -1e6, max: 1e6, strength: 60, friction: 0.03 });
  const spd = o.fanSpeed ?? 22;
  if (spd > 0) b.motor(motor, g, spd, true);
  b.sparks(motor, 0.4);

  // ------------------------------------------------------------------ compressor compartment
  const cx = (-W / 2 + px) / 2,
    cz = -0.01;
  const grommets: string[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (2 * Math.PI * k) / 3 + Math.PI / 2;
    grommets.push(b.cyl(`grommet${k}`, "rubber", "rubber", 0.012, 0.012, [cx + 0.06 * Math.cos(a), y0 + 0.0012 + 0.006, cz + 0.06 * Math.sin(a)], { segments: 8, tint: 0x1b1b1b, mass: 0.01 }));
  }
  const compY0 = y0 + 0.0012 + 0.012;
  const comp = b.cyl("compressor", "steel", "metal_painted", 0.075, 0.25, [cx, compY0 + 0.125, cz], { segments: 12, tint: 0x2b2d30, mass: 13 });
  for (const gm of grommets) {
    b.bolt(gm, base, 60);
    b.bolt(gm, comp, 60);
  }
  b.sparks(comp, 0.3);
  // refrigerant loops: discharge from the compressor top to the coil, suction from the valves
  const dis = b.tube(
    "discharge",
    "copper",
    "copper",
    [
      [cx, compY0 + 0.25 + 0.0005, cz],
      [cx, compY0 + 0.31, cz],
      [px - 0.04, compY0 + 0.31, cz],
      [px - 0.006, yTop - 0.06, -D / 2 + 0.07],
    ],
    0.0048,
    { sides: 6, kgPerM: tubeKgPerM(0.0095, 0.0008, 8900), jointStrength: 60, tess: 0 },
  );
  bondTouching(b, dis[0], [comp], "weld", 30, 0.002);
  b.weld(dis[dis.length - 1], part, 15);
  // service valves on the right side panel + line set to the wall
  const valves: string[] = [];
  for (const [k, z] of [
    ["liquid", 0.03],
    ["gas", 0.09],
  ] as Array<[string, number]>) {
    valves.push(boxR(b, `valve_${k}`, BRASS.mat, BRASS.surf, [-W / 2 - 0.035, -W / 2], [y0 + 0.12, y0 + 0.16], [z - 0.018, z + 0.018], { tint: BRASS.tint, mass: 0.25, tess: 0 }));
    b.bolt(valves[valves.length - 1], sideL, 60);
  }
  // suction line into the compressor's side (ends on its shell, 0.5 mm out)
  const sdx = 0.05,
    sdz = 0.08;
  const sl = Math.hypot(sdx, sdz);
  const sEnd: [number, number, number] = [cx + (sdx / sl) * (0.075 + 0.0005), compY0 + 0.18, cz + (sdz / sl) * (0.075 + 0.0005)];
  const suction = b.tube(
    "suction",
    "copper",
    "copper",
    [
      [-W / 2 + t + 0.0005, y0 + 0.14, 0.09],
      [cx + 0.05, y0 + 0.14, 0.09],
      [cx + 0.05, compY0 + 0.18, cz + 0.12],
      sEnd,
    ],
    0.0064,
    { sides: 6, kgPerM: tubeKgPerM(0.0127, 0.0008, 8900), jointStrength: 60, tess: 0 },
  );
  b.weld(suction[0], sideL, 15);
  bondTouching(b, suction[suction.length - 1], [comp], "weld", 25, 0.004, 0) || b.weld(suction[suction.length - 1], comp, 25);
  const ls = o.lineSet ?? ([-W / 2 - 0.08, 0.55, -D / 2 - 0.02] as V3);
  const lsv = Array.isArray(ls) ? ls : [ls.x, ls.y, ls.z];
  const run = (name: string, z: number, r: number, mat: "insulation" | "copper", surf: "insulation" | "copper" | "rubber", kgm: number, start: string, dx: number) => {
    const ex = lsv[0] + dx;
    const segs = b.tube(
      name,
      mat,
      surf,
      [
        [-W / 2 - 0.035 - 0.0005, y0 + 0.14, z],
        [ex, y0 + 0.14, z],
        [ex, lsv[1] - 0.05, (z + lsv[2]) / 2],
        [ex, lsv[1], lsv[2]],
      ],
      r,
      { sides: 6, kgPerM: kgm, jointStrength: 40, tint: surf === "insulation" ? 0x2a2a2a : 0xffffff, tess: 0 },
    );
    bondTouching(b, segs[0], [start], "screw", 40, 0.004, 0) || b.screw(segs[0], start, 1, 40);
    b.world(segs[segs.length - 1], "clip", 30, [ex, lsv[1], lsv[2]]);
    return segs;
  };
  run("line_liquid", 0.03, 0.0048, "copper", "copper", tubeKgPerM(0.0095, 0.0008, 8900), valves[0], 0);
  run("line_gas", 0.09, 0.016, "insulation", "insulation", 0.25, valves[1], -0.045); // copper inside foam insulation
  // control board + run capacitor on the inside of the right side panel
  pcb(b, "ctrl", { w: 0.1, h: 0.08, components: [{ kind: "relay", x: -0.02, y: 0.01 }, { kind: "chip", x: 0.025, y: 0.015 }, { kind: "transformer", x: 0.02, y: -0.02 }], mount: { to: sideL, screws: 3, each: 10 }, sparks: 0.8 }, [-W / 2 + t + 0.0016, y0 + 0.42, 0.06], [0, 90, 0]);
  const cap = b.cyl("run_capacitor", "aluminum", "aluminum", 0.022, 0.08, [-W / 2 + t + 0.022, y0 + 0.3, -0.06], { segments: 10, tess: 0, mass: 0.25 });
  b.clip(cap, sideL, 15);
  b.sparks(cap, 0.7);
  void hingeAxis;
  return finish(b, o);
}
