// Small wall/floor hardware: wall clock (WALL frame, centre at the origin), floor door stop
// (FLOOR frame), robe hook rail and full-length mirror (WALL frame; the mirror's origin is at its
// bottom centre on the wall face). PURE MODULE.

import { Builder } from "../lib/builder.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import { annulusZ, bondNear, extremeTiles } from "./parts.ts";

interface Common {
  seed?: number;
  validate?: "basic" | "full";
}

/**
 * Printed hands of the `clock_face` texture (src/render/proctex/printed.ts): 10:09:36, lengths
 * and tails in texture pixels on its 256 px / 0.3 m tile. The 3D hands are laid exactly over
 * them so the clock shows ONE set of hands that can still be knocked off (the printed ones stay
 * underneath — a hands-free dial variant has been requested from render-core).
 */
const PRINTED_TIME: [number, number, number] = [10, 9, 36];
const FACE_PX = 0.3 / 256;

/**
 * Wall clock Ø 0.3 m: eight-segment plastic case ring, hardboard back, quartz movement (plastic
 * box), printed paper dial, aluminium hour/minute hands and a steel second hand on a spindle,
 * glass cover clipped into the ring. Hangs on a nail (weak world bond at the top). ~0.5 kg.
 * The dial texture is centred on the dial and reads upright from the front (u along −X, the
 * viewer's right in this left-handed frame, v up).
 */
export function buildWallClock(o: Common & { r?: number; tint?: number } = {}): AssemblyDef {
  const b = new Builder("wallClock", "Wall Clock", "decor", 25, o.seed);
  const R = o.r ?? 0.15;
  const depth = 0.042;
  const ring = annulusZ(b, "case", { rOut: R, rIn: R - 0.012, z0: 0, z1: depth, segs: 8, mat: "plastic", surf: "plastic_glossy", tint: o.tint ?? 0x2b2b2d, kg: 0.18, seam: 40 });
  const ri = (R - 0.012) * Math.cos(Math.PI / 8) - 0.0015; // clear inner radius of the octagonal ring
  const back = b.cyl("back", "mdf", "mdf", ri, 0.004, [0, 0, 0.002], { axis: "z", segments: 16 });
  for (const t of ring) b.bond(back, t, "clip", { strength: 4 });
  const mv = b.box("movement", "plastic", "plastic", [0.056, 0.056, 0.016], [0, 0, 0.004 + 0.008], { tint: 0x202020 });
  b.glue(mv, back, 10);
  const dial = b.cyl("dial", "paper", "paper", ri, 0.0012, [0, 0, 0.02 + 0.0006], {
    axis: "z",
    segments: 16,
    capSurf: "clock_face",
    // the cylinder's +Z cap maps u = +x, v = −y (texture upside down from the front); a 180°
    // roll about Z turns that into u = −x (viewer's right), v = +y, and u0 = v0 = 0.15 (half the
    // 0.3 m tile) puts the printed face's centre on the dial centre
    rot: [0, 0, 180],
    uvOffset: [0.15, 0.15],
  });
  b.glue(dial, mv, 4);
  bondNear(b, dial, ring, "glue", 3, 0.004, 4);
  const spindle = b.cyl("spindle", "steel", "metal_raw", 0.0028, 0.008, [0, 0, 0.0212 + 0.004], { axis: "z", segments: 8 });
  b.press(spindle, mv, 6);
  const [hh, mm, ss] = PRINTED_TIME;
  const hands: Array<[string, number, number, number, number, "aluminum" | "steel", number]> = [
    // name, angle (deg clockwise from 12), tip, tail, width (texture px), material, z
    ["hour", ((hh % 12) + mm / 60) * 30, 58, 14, 7, "aluminum", 0.0232],
    ["minute", (mm + ss / 60) * 6, 88, 14, 5, "aluminum", 0.0246],
    ["second", ss * 6, 96, 22, 1.6, "steel", 0.026],
  ];
  for (const [nm, ang, tipPx, tailPx, wPx, mat, z] of hands) {
    // Clockwise seen from the front (+Z) = from +Y towards −X (the viewer's right): the hand
    // points along (−sin a, cos a), i.e. local +X rotated by φ = 90° + a about Z.
    const phi = 90 + ang;
    const c = Math.cos((phi * Math.PI) / 180),
      s = Math.sin((phi * Math.PI) / 180);
    const tip = tipPx * FACE_PX,
      tail = tailPx * FACE_PX;
    const len = tip + tail,
      off = (tip - tail) / 2;
    const hand = b.box(`hand_${nm}`, mat, "metal_black", [len, Math.max(0.0016, wPx * FACE_PX), 0.0012], [off * c, off * s, z], { rot: [0, 0, phi], tess: 0, tint: nm === "second" ? 0xb02020 : 0x111111 });
    b.press(hand, spindle, 1.5);
  }
  const glass = b.cyl("glass", "glass", "glass", ri, 0.002, [0, 0, depth - 0.006], { axis: "z", segments: 16, capSurf: "glass", capTint: 0xf2f8f6 });
  for (const t of ring) b.bond(glass, t, "clip", { strength: 3 });
  const top = extremeTiles(b, ring, "top", 0.01)[0];
  b.world(top, "nail", 8, [0, R - 0.006, 0]);
  return b.build({ validate: o.validate });
}

/** Floor-mounted dome door stop: zinc base screwed to the floor + a pressed-on rubber dome. ~0.1 kg. */
export function buildDoorStop(o: Common = {}): AssemblyDef {
  const b = new Builder("doorStop", "Door Stop", "fixture", 6, o.seed);
  const base = b.cyl("base", "steel", "steel_brushed", 0.022, 0.008, [0, 0.004, 0], { segments: 12, mass: 0.06 });
  b.world(base, "screw", 40, [0, 0, 0]);
  const dome = b.cyl("dome", "rubber", "rubber", 0.02, 0.025, [0, 0.008 + 0.0125, 0], { rTop: 0.014, segments: 12, tint: 0x1e1e1e });
  b.press(dome, base, 8);
  return b.build({ validate: o.validate });
}

/**
 * Robe hook rail (bathroom): chrome steel back rail screwed to the wall and three J-hooks (bent
 * steel rod, two welded segments each). 0.45 m wide, ~0.5 kg.
 */
export function buildRobeHooks(o: Common & { w?: number; hooks?: number } = {}): AssemblyDef {
  const b = new Builder("robeHooks", "Robe Hooks", "fixture", 20, o.seed);
  const W = o.w ?? 0.45;
  const n = o.hooks ?? 3;
  const rail = b.box("rail", "steel", "chrome", [W, 0.04, 0.006], [0, 0, 0.003], { mass: 0.3, tess: 0 });
  b.world(rail, "screw", 70, [0, 0, 0]);
  for (let k = 0; k < n; k++) {
    const x = -W / 2 + (W * (k + 0.5)) / n;
    const segs = b.tube(`hook${k}`, "steel", "chrome", [
      [x, -0.004, 0.006],
      [x, -0.012, 0.05],
      [x, 0.012, 0.064],
    ], 0.004, { sides: 6, joint: "weld", jointStrength: 80 });
    b.weld(segs[0], rail, 60);
  }
  return b.build({ validate: o.validate });
}

/**
 * Full-length mirror: MDF frame (four glued bars), 3 mm silvered glass held by clip bonds in the
 * rebate, hardboard backing nailed on, hung on two screws through the top bar plus a mirror clip
 * at the bottom. 0.40 × 1.40 m, ~6 kg.
 */
export function buildFullLengthMirror(o: Common & { w?: number; h?: number; tint?: number } = {}): AssemblyDef {
  const b = new Builder("fullLengthMirror", "Full-Length Mirror", "decor", 80, o.seed);
  const W = o.w ?? 0.4,
    H = o.h ?? 1.4;
  const bar = 0.035,
    depth = 0.025;
  const look = { tint: o.tint ?? 0xf1ede4 };
  const top = b.box("bar_t", "mdf", "wood_painted", [W, bar, depth], [0, H - bar / 2, depth / 2], look);
  const bottom = b.box("bar_b", "mdf", "wood_painted", [W, bar, depth], [0, bar / 2, depth / 2], look);
  const left = b.box("bar_l", "mdf", "wood_painted", [bar, H - 2 * bar, depth], [-W / 2 + bar / 2, H / 2, depth / 2], look);
  const right = b.box("bar_r", "mdf", "wood_painted", [bar, H - 2 * bar, depth], [W / 2 - bar / 2, H / 2, depth / 2], look);
  const bars = [top, bottom, left, right];
  for (const s of [left, right]) {
    b.glue(top, s, 45);
    b.glue(bottom, s, 45);
  }
  const iw = W - 2 * bar,
    ih = H - 2 * bar;
  const backing = b.box("backing", "mdf", "mdf", [iw, ih, 0.003], [0, H / 2, 0.0015 + 0.003], {});
  const glass = b.box("glass", "glass", "glass_edge", [iw, ih, 0.003], [0, H / 2, 0.006 + 0.0015], { faces: { pz: { surf: "mirror" } } });
  for (const p of bars) {
    b.bond(glass, p, "clip", { strength: 4 });
    b.bond(backing, p, "nail", { strength: 6 });
  }
  b.glue(glass, backing, 15);
  b.world(top, "screw", 60, [0, H - bar / 2, 0]);
  b.world(bottom, "clip", 20, [0, bar / 2, 0]);
  return b.build({ validate: o.validate });
}
