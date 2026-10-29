// Kitchen furniture & fixtures that are not casework: pedal bin, recycling bin, wall clock, bar
// stool. Origins: floor/base centre (the clock: centre of its back on the wall, face +Z).
// PURE MODULE (no Babylon).

import { Builder, type V3 } from "../lib/builder.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import { bondEachTouching, finish, scoped, shell } from "./lib.ts";

export interface MiscOpts {
  tint?: number;
  seed?: number;
}

// ============================================================================ bins

/**
 * 30 l stainless pedal bin: 0.6 mm steel drum on a plastic foot ring, steel lid on a rear hinge,
 * pedal on its own hinge, removable plastic inner bucket with some crumpled paper inside.
 */
export function buildPedalBin(o: MiscOpts = {}): AssemblyDef {
  const b = new Builder("pedalBin", "Pedal Bin", "misc", 60, o.seed);
  const R = 0.14,
    H = 0.45;
  const foot = b.cyl("foot", "plastic", "plastic", R + 0.004, 0.02, [0, 0.01, 0], { segments: 10, tint: 0x1d1d1f, mass: 0.25 });
  const drum = shell(b, "drum", { profile: [[R, 0], [R, H - 0.02]], t: 0.0006, base: 0.0012, segments: 10, mat: "steelSheet", surf: "steel_brushed", innerSurf: "metal_raw" }, [0, 0.02, 0]);
  b.screw(drum.base, foot, 3, 20);
  const bucket = shell(b, "bucket", { profile: [[0.12, 0], [0.128, 0.4]], t: 0.0025, base: 0.003, segments: 8, mat: "plastic", surf: "plastic", tint: 0x2b2c2f }, [0, 0.0212, 0]);
  b.friction(bucket.base, drum.base, 3);
  // domed lid resting on the drum rim (0.5 mm clear: it is a separate body on its hinge)
  const lid = b.cyl("lid", "steelSheet", "steel_brushed", R + 0.003, 0.02, [0, H + 0.0005 + 0.01, 0], { segments: 10, rTop: R - 0.01, mass: 0.45 });
  const hingeBlk = b.box("lid_hinge", "plastic", "plastic", [0.06, 0.03, 0.025], [0, H - 0.035, -R + 0.006 - 0.0125 + 0.0], { tint: 0x1d1d1f });
  bondEachTouching(b, hingeBlk, drum.wall, "screw", 25, 0.003);
  b.hinge(lid, hingeBlk, { pivots: [[0, H + 0.001, -R - 0.004]], axis: [-1, 0, 0], min: 0, max: 95, strength: 25, friction: 0.3 });
  const pedal = b.box("pedal", "plastic", "plastic", [0.08, 0.012, 0.06], [0, 0.02, R + 0.03], { tint: 0x1d1d1f });
  // stepping on it swings the tip down (positive about +X); a return spring holds it level
  b.hinge(pedal, foot, { pivots: [[0, 0.015, R + 0.002]], axis: [1, 0, 0], min: 0, max: 8, strength: 15, friction: 0.4, spring: 2 });
  for (const [k, p] of ([[0.03, 0.07, 0.02], [-0.04, 0.06, -0.03]] as Array<[number, number, number]>).entries()) {
    const pp = b.ellipsoid(`paper${k}`, "paper", "paper", [0.045, 0.035, 0.04], [p[0], 0.0242 + 0.035 + k * 0.0, p[2]], { segments: 7, rings: 5, mass: 0.02, tint: 0xf1efe8 });
    b.tag(pp, "loose");
    b.stuffing(pp, "paper");
  }
  return finish(b);
}

/** Open plastic recycling bin (0.36 × 0.30 × 0.28 m) with a few empties loose inside. */
export function buildRecyclingBin(o: MiscOpts = {}): AssemblyDef {
  const b = new Builder("recyclingBin", "Recycling Bin", "misc", 15, o.seed);
  const W = 0.36,
    D = 0.28,
    H = 0.3,
    t = 0.004;
  const tint = o.tint ?? 0x2f6db5;
  b.box("bottom", "plastic", "plastic", [W, t, D], [0, t / 2, 0], { tint });
  b.box("wall_l", "plastic", "plastic", [t, H - t, D], [-W / 2 + t / 2, t + (H - t) / 2, 0], { tint });
  b.box("wall_r", "plastic", "plastic", [t, H - t, D], [W / 2 - t / 2, t + (H - t) / 2, 0], { tint });
  b.box("wall_f", "plastic", "plastic", [W - 2 * t, H - t, t], [0, t + (H - t) / 2, D / 2 - t / 2], { tint });
  b.box("wall_k", "plastic", "plastic", [W - 2 * t, H - t, t], [0, t + (H - t) / 2, -D / 2 + t / 2], { tint });
  b.autoBond("fused", undefined, 0.0004);
  const loose = (p: string): void => b.tag(p, "loose");
  loose(b.cyl("can0", "aluminum", "aluminum", 0.033, 0.115, [-0.09, t + 0.0575, -0.05], { segments: 8, mass: 0.015, tess: 0.03 }));
  loose(b.cyl("can1", "aluminum", "aluminum", 0.033, 0.115, [-0.02, t + 0.0575, -0.07], { segments: 8, mass: 0.015, tess: 0.03, tint: 0xd04a3a }));
  loose(b.cyl("bottle", "plastic", "plastic", 0.04, 0.24, [0.1, t + 0.04, -0.003], { axis: "z", segments: 8, mass: 0.03, tint: 0xcfe8f2 }));
  loose(b.box("carton", "cardboard", "cardboard", [0.24, 0.006, 0.2], [-0.03, t + 0.118, 0.0], { mass: 0.12 }));
  return finish(b);
}

// ============================================================================ clock

/** Round wall clock Ø 30 cm: plastic back + rim, paper face, aluminium hands, glass cover, on a nail. */
export function buildWallClock(o: MiscOpts = {}): AssemblyDef {
  const b = new Builder("wallClock", "Wall Clock", "decor", 25, o.seed);
  const R = 0.15,
    D = 0.034;
  scoped(b, "", [0, 0, 0], [90, 0, 0], () => {
    // in this frame +Y points out of the wall (local +Z of the clock), z = clock's -Y
    const back = b.cyl("back", "plastic", "plastic", R, 0.006, [0, 0.003, 0], { segments: 12, tint: o.tint ?? 0x202124 });
    const rim = b.lathe("rim", "plastic", "plastic", "plastic", { profile: [[R + 0.006, 0], [R + 0.006, D]], thickness: 0.006, segments: 12, capBottom: false, tint: o.tint ?? 0x202124 });
    for (const r of rim) bondEachTouching(b, r, [back], "fused", 20, 0.0015);
    const mv = b.box("movement", "plastic", "plastic", [0.056, 0.016, 0.056], [0, 0.006 + 0.008, 0], { tint: 0x2a2a2a });
    b.screw(mv, back, 2, 10);
    const face = b.cyl("face", "paper", "paper", R - 0.002, 0.002, [0, 0.022 + 0.001, 0], { segments: 12, capSurf: "clock_face", mass: 0.02 });
    b.glue(face, mv, 8);
    const hh = b.box("hand_h", "aluminum", "metal_black", [0.006, 0.0012, 0.07], [0, 0.0246, -0.03], { tess: 0, mass: 0.001, rot: [0, 35, 0] });
    const mh = b.box("hand_m", "aluminum", "metal_black", [0.004, 0.0012, 0.11], [0, 0.0262, -0.05], { tess: 0, mass: 0.0012, rot: [0, -60, 0] });
    b.press(hh, face, 1);
    b.press(mh, hh, 1);
    const glass = b.cyl("glass", "glass", "glass", R - 0.001, 0.002, [0, D - 0.003, 0], { segments: 12 });
    for (const r of rim) bondEachTouching(b, glass, [r], "clip", 2, 0.0015);
  });
  // hanging on a nail behind the top of the movement
  b.world("back", "nail", 12, [0, 0.08, 0.003]);
  return finish(b);
}

// ============================================================================ bar stool

/**
 * Counter-height bar stool (seat 0.66 m): powder-coated steel tube legs splayed out, footrest
 * ring, steel seat plate, oak seat with a padded cushion, rubber feet (~6.5 kg).
 */
export function buildBarStool(o: MiscOpts & { seatH?: number } = {}): AssemblyDef {
  const b = new Builder("barStool", "Bar Stool", "furniture", 120, o.seed);
  const SH = o.seatH ?? 0.66;
  const plateY = SH - 0.06;
  const at = 0.12,
    ab = 0.17,
    r = 0.0125;
  const kg = 0.85; // 25 × 1.5 mm tube
  const legs: string[] = [];
  const feet: string[] = [];
  const corners: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const [k, [sx, sz]] of corners.entries()) {
    const top: V3 = [sx * at, plateY, sz * at];
    const bot: V3 = [sx * ab, 0.012, sz * ab];
    legs.push(...b.tube(`leg${k}`, "steel", "metal_black", [bot, top], r, { sides: 8, kgPerM: kg, tess: 0 }));
    const f = b.cyl(`foot${k}`, "rubber", "rubber", 0.016, 0.012, [sx * ab, 0.006, sz * ab], { segments: 8, tint: 0x111111 });
    b.press(f, legs[k], 6);
    feet.push(f);
  }
  const yr = 0.28;
  const aAt = ab - ((ab - at) * (yr - 0.012)) / (plateY - 0.012);
  const rungs: string[] = [];
  for (let k = 0; k < 4; k++) {
    const [ax, az] = corners[k],
      [bx, bz] = corners[(k + 1) % 4];
    const p0: V3 = [ax * aAt, yr, az * aAt],
      p1: V3 = [bx * aAt, yr, bz * aAt];
    // shorten by the leg radius so the rung ends sit on the leg surfaces
    const dx = p1[0] - p0[0],
      dz = p1[2] - p0[2];
    const L = Math.hypot(dx, dz);
    const u = [dx / L, dz / L];
    const q0: V3 = [p0[0] + u[0] * (r + 0.0005), yr, p0[2] + u[1] * (r + 0.0005)];
    const q1: V3 = [p1[0] - u[0] * (r + 0.0005), yr, p1[2] - u[1] * (r + 0.0005)];
    const seg = b.tube(`rung${k}`, "steel", "metal_black", [q0, q1], 0.009, { sides: 8, kgPerM: 0.45, tess: 0 });
    b.weld(seg[0], legs[k], 60);
    b.weld(seg[0], legs[(k + 1) % 4], 60);
    rungs.push(seg[0]);
  }
  const plate = b.box("seat_plate", "steel", "metal_black", [0.27, 0.003, 0.27], [0, plateY + 0.0015, 0], { tess: 0 });
  for (const l of legs) b.weld(l, plate, 120);
  const seat = b.cyl("seat", "hardwood", "wood_oak", 0.19, 0.025, [0, plateY + 0.003 + 0.0125, 0], { segments: 12, grain: "x" });
  b.screw(seat, plate, 4, 30);
  const pad = b.pillow("pad", "foam", "leather", [0.33, 0.03, 0.33], 0.4, [0, plateY + 0.028 + 0.015, 0], { tint: o.tint ?? 0x5a3a2a, mass: 0.35 });
  b.glue(pad, seat, 25);
  b.stuffing(pad, "foam");
  return finish(b);
}
