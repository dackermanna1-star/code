// Countertop appliances: 2-slice toaster, electric kettle on its power base, drip coffee maker +
// glass carafe (separate assembly), blender with a glass jar. Built like the real things: thin
// steel/plastic shells, mica heating elements (sparks), heavy motors, glass that shatters.
// Origins: centre of the footprint on the counter, front +Z. PURE MODULE (no Babylon).

import { Builder, type V3 } from "../lib/builder.ts";
import { buttonGrid, knob } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import { bondTouching, finish, shell } from "./lib.ts";

export interface SmallApplianceOpts {
  tint?: number;
  seed?: number;
}

// ============================================================================ toaster

/** Two-slice toaster (0.28 × 0.19 × 0.18 m, ~1.9 kg). */
export function buildToaster(o: SmallApplianceOpts = {}): AssemblyDef {
  const b = new Builder("toaster", "Toaster", "appliance", 45, o.seed);
  const W = 0.28,
    H = 0.19,
    D = 0.18;
  const cap = 0.025;
  const st = 0.0006;
  const body = { surf: "metal_painted" as const, tint: o.tint ?? 0xb83a32 };
  const base = b.box("base", "plastic", "plastic", [W, 0.012, D], [0, 0.006, 0], { tint: 0x1e1e20 });
  const capL = b.box("cap_l", "plastic", "plastic_glossy", [cap, H - 0.012, D], [-W / 2 + cap / 2, 0.012 + (H - 0.012) / 2, 0], { tint: 0x1e1e20, mass: 0.2 });
  const capR = b.box("cap_r", "plastic", "plastic_glossy", [cap, H - 0.012, D], [W / 2 - cap / 2, 0.012 + (H - 0.012) / 2, 0], { tint: 0x1e1e20, mass: 0.2 });
  const iw = W - 2 * cap;
  // the front shell stops 4 mm above the base: that slot is where the crumb tray slides out
  const slot = 0.004;
  const fr = b.box("shell_f", "steelSheet", body.surf, [iw, H - 0.012 - slot - st, st], [0, 0.012 + slot + (H - 0.012 - slot - st) / 2, D / 2 - st / 2], { tint: body.tint });
  const bk = b.box("shell_b", "steelSheet", body.surf, [iw, H - 0.012 - st, st], [0, 0.012 + (H - 0.012 - st) / 2, -D / 2 + st / 2], { tint: body.tint });
  // top with two bread slots (z ±0.03, 30 mm wide, 140 mm long): five strips
  const yT = H - st / 2;
  const sl = 0.07,
    sw = 0.015;
  const tops = [
    b.box("top_f", "steelSheet", body.surf, [2 * sl, st, D / 2 - 0.045], [0, yT, (0.045 + D / 2) / 2], { tint: body.tint }),
    b.box("top_m", "steelSheet", body.surf, [2 * sl, st, 2 * sw], [0, yT, 0], { tint: body.tint }),
    b.box("top_b", "steelSheet", body.surf, [2 * sl, st, D / 2 - 0.045], [0, yT, -(0.045 + D / 2) / 2], { tint: body.tint }),
    b.box("top_l", "steelSheet", body.surf, [iw / 2 - sl, st, D], [-(sl + iw / 2) / 2, yT, 0], { tint: body.tint }),
    b.box("top_r", "steelSheet", body.surf, [iw / 2 - sl, st, D], [(sl + iw / 2) / 2, yT, 0], { tint: body.tint }),
  ];
  b.autoBond("weld", 18, 0.0004, (a, c) => (a.startsWith("top_") || a.startsWith("shell_")) && (c.startsWith("top_") || c.startsWith("shell_")));
  for (const p of [fr, bk]) {
    b.screw(p, capL, 1, 15);
    b.screw(p, capR, 1, 15);
  }
  b.screw(bk, base, 1, 15);
  b.clip(tops[3], capL, 6);
  b.clip(tops[4], capR, 6);
  b.screw(capL, base, 1, 20);
  b.screw(capR, base, 1, 20);
  // mica element boards (nichrome wound) between and beside the slots, clipped into the end
  // frames; the crumb tray slides in underneath them
  const micas: string[] = [];
  [-0.055, 0, 0.055].forEach((z, k) => {
    const m = b.box(`mica${k}`, "pcb", "ceramic_bisque", [iw, 0.13, 0.002], [0, 0.03 + 0.065, z], { tint: 0xd8c9a3 });
    b.clip(m, capL, 4);
    b.clip(m, capR, 4);
    b.sparks(m, 0.5);
    micas.push(m);
  });
  const lever = b.box("lever", "plastic", "plastic", [0.02, 0.016, 0.04], [W / 2 + 0.01, 0.15, 0.03], { tint: 0x1e1e20 });
  b.press(lever, capR, 3);
  knob(b, "browning", { on: capR, r: 0.012, len: 0.012, kind: "press", strength: 2, mat: "plastic", surf: "plastic", tint: 0x1e1e20 }, [W / 2, 0.06, 0.03], [0, 90, 0]);
  const tray = b.box("crumb_tray", "steelSheet", "metal_raw", [iw - 0.02, 0.002, D - 0.02], [0, 0.013, 0], { tint: 0xa8a8a8 });
  b.slider(tray, base, { pivots: [[0, 0.012, 0]], axis: [0, 0, 1], min: 0, max: 0.15, strength: 8, friction: 0.3 });
  return finish(b);
}

// ============================================================================ kettle

/** Cordless electric kettle 1.7 l (steel body, hinged lid) on its power base (~1.3 kg empty). */
export function buildKettle(o: SmallApplianceOpts & { litres?: number } = {}): AssemblyDef {
  const b = new Builder("kettle", "Electric Kettle", "appliance", 40, o.seed);
  const yb = 0.02; // power base height
  const pbase = b.cyl("power_base", "plastic", "plastic", 0.085, yb, [0, yb / 2, 0], { segments: 10, tint: 0x1d1e20, mass: 0.2 });
  const s = shell(b, "body", { profile: [[0.075, 0], [0.068, 0.2]], t: 0.0008, base: 0.0025, segments: 8, mat: "steelSheet", surf: "steel_brushed", innerSurf: "metal_raw", tint: 0xffffff }, [0, yb, 0]);
  b.press(s.base, pbase, 3);
  b.liquid(s.base, 0xd8e8ee, o.litres ?? 1.0);
  // lid on a rear hinge (opens upwards: free edge +X swings towards +Y, positive about +Z)
  const lid = b.cyl("lid", "plastic", "plastic_glossy", 0.064, 0.012, [0, yb + 0.2 + 0.006, 0], { segments: 8, tint: 0x1d1e20 });
  const knobL = b.box("lid_button", "plastic", "plastic", [0.03, 0.012, 0.02], [-0.035, yb + 0.212 + 0.006, 0], { tint: 0x5a5b5e });
  b.press(knobL, lid, 2);
  // handle at -X (D-loop, hollow plastic)
  const hp: V3[] = [
    [-0.066, yb + 0.185, 0],
    [-0.115, yb + 0.17, 0],
    [-0.118, yb + 0.06, 0],
    [-0.073, yb + 0.035, 0],
  ];
  const handle = b.tube("handle", "plastic", "plastic", hp, 0.012, { sides: 6, tint: 0x1d1e20, mass: 0.12 });
  bondTouching(b, handle[0], s.wall, "screw", 30, 0.002);
  bondTouching(b, handle[handle.length - 1], s.wall, "screw", 30, 0.002);
  // two pivots: a single-pivot joint group becomes a ball-and-socket (graph.ts), on which the lid flopped
  // about every axis and its latch was never engaged (latches only act on hinges)
  b.hinge(lid, handle[0], { pivots: [[-0.058, yb + 0.206, -0.015], [-0.058, yb + 0.206, 0.015]], axis: [0, 0, 1], min: 0, max: 95, strength: 6, friction: 0.2, latch: 2 });
  // spout at +X
  const spout = b.hull(
    "spout",
    "steelSheet",
    "steel_brushed",
    [
      [0.062, yb + 0.15, -0.02],
      [0.062, yb + 0.15, 0.02],
      [0.062, yb + 0.198, -0.022],
      [0.062, yb + 0.198, 0.022],
      [0.095, yb + 0.2, -0.008],
      [0.095, yb + 0.2, 0.008],
      [0.09, yb + 0.185, 0],
    ],
    [0, 0, 0],
    { mass: 0.03, tess: 0 },
  );
  for (const tl of [s.wall[0], s.wall[s.wall.length - 1]]) b.bond(spout, tl, "weld", { strength: 12, anchor: [0.066, yb + 0.175, 0] });
  const sw = b.box("switch", "plastic", "plastic", [0.008, 0.024, 0.014], [-0.1335, yb + 0.1, 0], { tint: 0x2a62c9 });
  b.press(sw, handle[1], 2);
  return finish(b);
}

// ============================================================================ coffee maker

/** Drip coffee maker body (carafe is a separate assembly that stands on its warming plate). */
export function buildCoffeeMaker(o: SmallApplianceOpts = {}): AssemblyDef {
  const b = new Builder("coffeeMaker", "Coffee Maker", "appliance", 60, o.seed);
  const tint = o.tint ?? 0x202124;
  const base = b.box("base", "plastic", "plastic", [0.22, 0.035, 0.26], [0, 0.0175, 0.01], { tint, mass: 0.45 });
  const tower = b.box("tower", "plastic", "plastic_glossy", [0.22, 0.31, 0.1], [0, 0.035 + 0.155, -0.07], { tint, mass: 0.55 });
  const tank = b.box("reservoir", "plastic", "glass_frosted", [0.18, 0.2, 0.004], [0, 0.17, -0.122], { tint: 0xd9e3e8 });
  const head = b.box("head", "plastic", "plastic_glossy", [0.22, 0.06, 0.2], [0, 0.345 - 0.03, 0.08], { tint, mass: 0.25 });
  const basket = b.cyl("filter_basket", "plastic", "plastic", 0.042, 0.07, [0, 0.285 - 0.035, 0.07], { rTop: 0.062, segments: 10, tint: 0x2e2f33, mass: 0.08 });
  const plate = b.cyl("warming_plate", "steel", "metal_black", 0.072, 0.005, [0, 0.0375, 0.07], { segments: 12, tint: 0x2a2a2a, mass: 0.25 });
  b.glue(tower, base, 60);
  b.screw(head, tower, 3, 20);
  b.clip(tank, tower, 6);
  // two pivots (a single one would make it a ball joint whose latch never engages, see the kettle lid)
  b.hinge(basket, head, { pivots: [[0.062, 0.275, 0.07], [0.062, 0.295, 0.07]], axis: [0, 1, 0], min: 0, max: 80, strength: 5, friction: 0.3, latch: 2, latchPos: [-0.06, 0.28, 0.07] });
  b.screw(plate, base, 2, 15);
  b.sparks(plate, 0.3);
  buttonGrid(b, "btn", { on: base, rows: 1, cols: 2, size: [0.018, 0.012], depth: 0.003, tints: [0x2e7d32, 0x3a3b3d] }, [0.07, 0.0175, 0.14]);
  return finish(b);
}

/** Glass coffee carafe (12 cup) with plastic collar/handle and lid, half full (~0.45 kg). */
export function buildCarafe(o: { seed?: number; litres?: number } = {}): AssemblyDef {
  const b = new Builder("carafe", "Coffee Carafe", "kitchenware", 18, o.seed);
  const s = shell(b, "glass", { profile: [[0.062, 0], [0.05, 0.135]], t: 0.0022, base: 0.004, segments: 8, mat: "glass", tint: 0xffffff });
  const collar = b.lathe("collar", "plastic", "plastic", "plastic", { profile: [[0.0565, 0.118], [0.0555, 0.15]], thickness: 0.004, segments: 8, capBottom: false, tint: 0x1e1e20 });
  const lid = b.cyl("lid", "plastic", "plastic", 0.056, 0.01, [0, 0.155, 0], { segments: 8, tint: 0x1e1e20 });
  for (const c of collar) bondTouching(b, c, s.wall, "glue", 6, 0.002);
  bondTouching(b, lid, collar, "press", 4, 0.002);
  const hp: V3[] = [
    [-0.05, 0.14, 0],
    [-0.085, 0.13, 0],
    [-0.088, 0.05, 0],
    [-0.058, 0.035, 0],
  ];
  const handle = b.tube("handle", "plastic", "plastic", hp, 0.009, { sides: 6, tint: 0x1e1e20, mass: 0.05 });
  bondTouching(b, handle[0], collar, "screw", 20, 0.004);
  bondTouching(b, handle[handle.length - 1], s.wall, "glue", 10, 0.004);
  b.liquid(s.base, 0x3b2314, o.litres ?? 0.6);
  return finish(b);
}

// ============================================================================ blender

/** Countertop blender: plastic motor base (~1 kg motor), square glass jar with blades and lid (~4 kg). */
export function buildBlender(o: SmallApplianceOpts = {}): AssemblyDef {
  const b = new Builder("blender", "Blender", "appliance", 90, o.seed);
  const tint = o.tint ?? 0xe9e9e6;
  const base = b.hull(
    "base",
    "plastic",
    "plastic_glossy",
    [
      [-0.09, 0, -0.09],
      [0.09, 0, -0.09],
      [-0.09, 0, 0.09],
      [0.09, 0, 0.09],
      [-0.075, 0.11, -0.075],
      [0.075, 0.11, -0.075],
      [-0.075, 0.11, 0.075],
      [0.075, 0.11, 0.075],
    ],
    [0, 0, 0],
    { tint, mass: 0.7 },
  );
  const motor = b.cyl("motor", "steel", "metal_raw", 0.04, 0.07, [0, 0.11 + 0.035, 0], { segments: 10, mass: 1.1, tint: 0x9a9a9a });
  b.bolt(motor, base, 80);
  b.sparks(motor, 0.6);
  buttonGrid(b, "btn", { on: base, rows: 1, cols: 3, size: [0.022, 0.014], depth: 0.003, tints: [0x2e2f33, 0x2e2f33, 0xc62828] }, [0, 0.05, 0.0855], [-7.8, 0, 0]);
  // jar: coupling collar + glass bottom + four mitred glass walls + blades + rubber lid
  const yc = 0.11 + 0.07;
  const collar = b.cyl("collar", "plastic", "plastic", 0.065, 0.03, [0, yc + 0.015, 0], { segments: 10, tint: 0x2e2f33 });
  b.press(collar, motor, 6);
  const y0 = yc + 0.03,
    y1 = y0 + 0.2;
  const hb = 0.055,
    ht = 0.075,
    t = 0.004;
  const bottom = b.box("jar_bottom", "glass", "glass", [2 * hb, 0.006, 2 * hb], [0, y0 + 0.003, 0]);
  b.glue(bottom, collar, 25);
  const walls: string[] = [];
  const sides: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [k, [sx, sz]] of sides.entries()) {
    const pts: V3[] = [];
    for (const [r, y] of [
      [hb, y0 + 0.006],
      [ht, y1],
    ] as Array<[number, number]>)
      for (const inner of [0, 1]) {
        const rr = r - inner * t;
        for (const s of [-1, 1]) {
          if (sx !== 0) pts.push([sx * rr, y, s * rr]);
          else pts.push([s * rr, y, sz * rr]);
        }
      }
    walls.push(b.hull(`jar_wall${k}`, "glass", "glass", pts, [0, 0, 0], { faces: undefined }));
  }
  b.fuseTouching(walls, "fused");
  for (const w of walls) bondTouching(b, w, [bottom], "fused", 30, 0.002);
  const blades = b.box("blades", "steel", "steel_brushed", [0.08, 0.004, 0.012], [0, y0 + 0.006 + 0.012, 0], { tess: 0 });
  const hub = b.cyl("blade_hub", "steel", "metal_raw", 0.008, 0.01, [0, y0 + 0.006 + 0.005, 0], { segments: 6 });
  b.weld(blades, hub, 40);
  b.bolt(hub, bottom, 40);
  const lid = b.box("lid", "rubber", "rubber", [2 * ht, 0.018, 2 * ht], [0, y1 + 0.009, 0], { tint: 0x26272a });
  bondTouching(b, lid, walls, "press", 6, 0.002);
  // moulded handle on the +X wall: its inner face follows the tapered glass, the grip is vertical
  const yw0 = y0 + 0.006;
  const rAt = (y: number): number => hb + ((ht - hb) * (y - yw0)) / (y1 - yw0);
  const ha = y0 + 0.035,
    hbY = y1 - 0.02;
  const hpts: V3[] = [];
  for (const z of [-0.015, 0.015]) hpts.push([rAt(ha), ha, z], [rAt(hbY), hbY, z], [ht + 0.042, ha, z], [ht + 0.042, hbY, z]);
  const handle = b.hull("handle", "plastic", "plastic", hpts, [0, 0, 0], { tint: 0x2e2f33, mass: 0.12 });
  bondTouching(b, handle, walls, "screw", 30, 0.002);
  return finish(b);
}
