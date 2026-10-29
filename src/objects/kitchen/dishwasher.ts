// Built-in 60 cm dishwasher (0.596 × 0.86 × 0.55 m, ~38 kg):
//  * galvanised 0.6 mm side wrappers on a plastic base with the circulation pump/motor, sump
//    (standing water), inlet valve (mains `water`) and an 8 kg concrete counterweight;
//  * 3 mm plastic tub with bitumen sound pads and a fibre blanket on top;
//  * two wire racks on slider joints (the lower one has a tine row plates lean against), two
//    plastic spray arms;
//  * bottom-hinged, spring-balanced door with a latch: stainless outer skin, plastic inner liner,
//    steel side rails, detergent dispenser, top control strip with press-fit buttons and the
//    control board (sparks), bar handle.
// Free-standing in its bay (pull it out!). Origin: floor centre, front +Z. PURE MODULE.

import { Builder } from "../lib/builder.ts";
import { barHandle, buttonGrid, hingeAxis, pcb } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import { finish } from "./lib.ts";

export interface DishwasherOpts {
  finish?: "stainless" | "white";
  seed?: number;
}

export const DW_DIM = { w: 0.596, h: 0.86, zBack: -0.275, zFront: 0.275, doorBack: 0.215 } as const;
/**
 * Rack bottom heights (top faces) and their z extent in the dishwasher frame; the lower rack's tine
 * row (plates lean on it) and the stop wires either side of it that catch the plate feet.
 */
export const DW_RACKS = { lowerY: 0.138, upperY: 0.468, z0: -0.235, z1: 0.195, x: 0.255, tineZ: -0.07, stop: 0.0737 } as const;

export function buildDishwasher(o: DishwasherOpts = {}): AssemblyDef {
  const b = new Builder("dishwasher", "Dishwasher", "appliance", 650, o.seed);
  const W = DW_DIM.w,
    hw = W / 2,
    ZB = DW_DIM.zBack,
    ZD = DW_DIM.doorBack,
    ZF = DW_DIM.zFront;
  const st = 0.0006;
  const skin = o.finish === "white" ? { surf: "metal_painted" as const, tint: 0xf1f0ec } : { surf: "steel_brushed" as const, tint: 0xffffff };
  // ------------------------------------------------------------------ base
  const feet: string[] = [];
  [
    [-hw + 0.04, ZB + 0.05],
    [hw - 0.04, ZB + 0.05],
    [-hw + 0.04, ZD - 0.05],
    [hw - 0.04, ZD - 0.05],
  ].forEach(([x, z], k) => feet.push(b.cyl(`foot${k}`, "plastic", "plastic", 0.015, 0.012, [x, 0.006, z], { segments: 8, tint: 0x2a2a2a })));
  const base = b.box("base", "plastic", "plastic", [W - 0.004, 0.006, ZD - ZB - 0.004], [0, 0.015, (ZB + ZD) / 2], { tint: 0x3a3b3d });
  for (const f of feet) b.press(f, base, 15);
  const weight = b.box("counterweight", "concrete", "concrete", [0.4, 0.06, 0.14], [0, 0.048, ZB + 0.12], { tint: 0x9a9893 });
  b.bolt(weight, base, 120);
  const motor = b.cyl("pump_motor", "steel", "metal_raw", 0.035, 0.13, [0.12, 0.055, -0.02], { axis: "x", segments: 10, mass: 3.5, tint: 0x8c8c88 });
  b.bolt(motor, base, 80);
  const sump = b.cyl("sump", "plastic", "plastic", 0.07, 0.06, [-0.08, 0.048, -0.03], { segments: 10, tint: 0x2c2c2e });
  b.screw(sump, base, 3, 20);
  b.liquid(sump, 0xbfd3d8, 0.5);
  // inlet solenoid valve at the back-left corner, sitting on the base beside the counterweight
  const valve = b.cyl("inlet_valve", "plastic", "plastic", 0.018, 0.04, [-0.24, 0.018 + 0.018, ZB + 0.035], { axis: "z", segments: 8, tint: 0x2a2a2a });
  b.screw(valve, base, 2, 20);
  b.water(valve, [-0.24, 0.036, ZB + 0.015], [0, 0.3, -1], 0.6);
  // ------------------------------------------------------------------ wrapper + tub
  const sideL = b.box("side_l", "steelSheet", "metal_raw", [st, DW_DIM.h - 0.018, ZD - ZB], [-hw + st / 2, (0.018 + DW_DIM.h) / 2, (ZB + ZD) / 2], { tint: 0xc4c5c2 });
  const sideR = b.box("side_r", "steelSheet", "metal_raw", [st, DW_DIM.h - 0.018, ZD - ZB], [hw - st / 2, (0.018 + DW_DIM.h) / 2, (ZB + ZD) / 2], { tint: 0xc4c5c2 });
  b.screw(sideL, base, 3, 25);
  b.screw(sideR, base, 3, 25);
  const tb = { x: 0.27, y0: 0.1, y1: 0.82, z0: ZB + 0.02, z1: ZD };
  const tt = 0.003;
  const tz0 = tb.z0 - tt;
  const tub = {
    l: b.box("tub_l", "plastic", "plastic", [tt, tb.y1 - tb.y0, tb.z1 - tz0], [-tb.x - tt / 2, (tb.y0 + tb.y1) / 2, (tz0 + tb.z1) / 2], { tint: 0xd9dadb }),
    r: b.box("tub_r", "plastic", "plastic", [tt, tb.y1 - tb.y0, tb.z1 - tz0], [tb.x + tt / 2, (tb.y0 + tb.y1) / 2, (tz0 + tb.z1) / 2], { tint: 0xd9dadb }),
    t: b.box("tub_t", "plastic", "plastic", [2 * tb.x + 2 * tt, tt, tb.z1 - tz0], [0, tb.y1 + tt / 2, (tz0 + tb.z1) / 2], { tint: 0xd9dadb }),
    b: b.box("tub_b", "plastic", "plastic", [2 * tb.x + 2 * tt, tt, tb.z1 - tz0], [0, tb.y0 - tt / 2, (tz0 + tb.z1) / 2], { tint: 0xd9dadb }),
    k: b.box("tub_k", "plastic", "plastic", [2 * tb.x, tb.y1 - tb.y0, tt], [0, (tb.y0 + tb.y1) / 2, tb.z0 - tt / 2], { tint: 0xd9dadb }),
  };
  b.autoBond("fused", undefined, 0.0004, (a, c) => a.startsWith("tub_") && c.startsWith("tub_"));
  // tub stands on the base on four plastic posts (sump/motor sit under it)
  const posts: string[] = [];
  [
    [-0.22, -0.2],
    [0.22, -0.2],
    [-0.22, 0.16],
    [0.22, 0.16],
  ].forEach(([x, z], k) => {
    const p = b.box(`post${k}`, "plastic", "plastic", [0.03, tb.y0 - tt - 0.018, 0.03], [x, (0.018 + tb.y0 - tt) / 2, z], { tint: 0x3a3b3d });
    b.screw(p, base, 1, 25);
    b.screw(p, tub.b, 1, 25);
    posts.push(p);
  });
  // tub flanges screwed to the wrappers at the front
  const flW = hw - st - tb.x - tt; // from the tub wall's outer face to the wrapper
  const flL = b.box("flange_l", "steelSheet", "metal_raw", [flW, tb.y1 - tb.y0, 0.001], [-(tb.x + tt + flW / 2), (tb.y0 + tb.y1) / 2, ZD - 0.0005], { tint: 0xc4c5c2 });
  const flR = b.box("flange_r", "steelSheet", "metal_raw", [flW, tb.y1 - tb.y0, 0.001], [tb.x + tt + flW / 2, (tb.y0 + tb.y1) / 2, ZD - 0.0005], { tint: 0xc4c5c2 });
  b.screw(flL, sideL, 3, 20);
  b.screw(flR, sideR, 3, 20);
  b.screw(flL, tub.l, 2, 20);
  b.screw(flR, tub.r, 2, 20);
  const padL = b.box("pad_l", "rubber", "rubber", [0.004, 0.5, 0.4], [-tb.x - tt - 0.002, 0.42, -0.04], { tint: 0x1a1a1a });
  const padR = b.box("pad_r", "rubber", "rubber", [0.004, 0.5, 0.4], [tb.x + tt + 0.002, 0.42, -0.04], { tint: 0x1a1a1a });
  b.glue(padL, tub.l, 20);
  b.glue(padR, tub.r, 20);
  const blanket = b.box("blanket", "insulation", "insulation", [2 * tb.x, 0.025, tb.z1 - tz0 - 0.02], [0, tb.y1 + tt + 0.0125, (tz0 + tb.z1 - 0.02) / 2], { tint: 0xd8cfb4 });
  b.friction(blanket, tub.t, 4);
  // ------------------------------------------------------------------ racks, spray arms
  const rack = (nm: string, y: number, tines: boolean): string => {
    const R = DW_RACKS;
    const bot = b.box(`${nm}_grid`, "steel", "vent_grille", [2 * R.x, 0.006, R.z1 - R.z0], [0, y - 0.003, (R.z0 + R.z1) / 2], { mass: 0.9, tint: 0x9aa4ad, tess: 0 });
    const wl = b.box(`${nm}_wall_l`, "steel", "vent_grille", [0.006, 0.09, R.z1 - R.z0], [-R.x + 0.003, y + 0.045, (R.z0 + R.z1) / 2], { mass: 0.25, tint: 0x9aa4ad, tess: 0 });
    const wr = b.box(`${nm}_wall_r`, "steel", "vent_grille", [0.006, 0.09, R.z1 - R.z0], [R.x - 0.003, y + 0.045, (R.z0 + R.z1) / 2], { mass: 0.25, tint: 0x9aa4ad, tess: 0 });
    b.weld(wl, bot, 40);
    b.weld(wr, bot, 40);
    if (tines) {
      const tr = b.box(`${nm}_tines`, "steel", "vent_grille", [2 * R.x - 0.012, 0.11, 0.006], [0, y + 0.055, R.tineZ], { mass: 0.2, tint: 0x9aa4ad, tess: 0 });
      b.weld(tr, bot, 30);
      for (const sz of [-1, 1]) {
        const st = b.box(`${nm}_stop_${sz < 0 ? "b" : "f"}`, "steel", "vent_grille", [2 * R.x - 0.012, 0.02, 0.006], [0, y + 0.01, R.tineZ + sz * R.stop], { mass: 0.05, tint: 0x9aa4ad, tess: 0 });
        b.weld(st, bot, 15);
      }
    }
    const g = b.slider(wl, tub.l, { pivots: [[-R.x, y + 0.03, (R.z0 + R.z1) / 2]], axis: [0, 0, 1], min: 0, max: 0.4, strength: 45, friction: 0.25 });
    b.slider(wr, tub.r, { pivots: [[R.x, y + 0.03, (R.z0 + R.z1) / 2]], axis: [0, 0, 1], min: 0, max: 0.4, strength: 45, friction: 0.25, group: g });
    return bot;
  };
  rack("lower", DW_RACKS.lowerY, true);
  rack("upper", DW_RACKS.upperY, false);
  const armL = b.box("arm_lower", "plastic", "plastic", [0.42, 0.012, 0.04], [0, tb.y0 + 0.012, -0.03], { tint: 0x8d8f92 });
  const hubL = b.cyl("arm_lower_hub", "plastic", "plastic", 0.02, 0.006, [0, tb.y0 + 0.003, -0.03], { segments: 8, tint: 0x6a6c70 });
  b.press(armL, hubL, 6);
  b.screw(hubL, tub.b, 1, 20);
  const armU = b.box("arm_upper", "plastic", "plastic", [0.38, 0.012, 0.035], [0, DW_RACKS.upperY - 0.025, -0.03], { tint: 0x8d8f92 });
  const feed = b.box("arm_upper_feed", "plastic", "plastic", [0.03, 0.02, DW_RACKS.z0 - tb.z0 + 0.24], [0, DW_RACKS.upperY - 0.025, (tb.z0 + -0.03 + 0.015) / 2], { tint: 0x6a6c70 });
  b.press(armU, feed, 6);
  b.screw(feed, tub.k, 2, 20);
  // ------------------------------------------------------------------ door (bottom hinge)
  const dy0 = 0.075,
    dy1 = DW_DIM.h;
  const outer = b.box("door_skin", "steelSheet", skin.surf, [W, dy1 - dy0 - 0.03, st], [0, (dy0 + dy1 - 0.03) / 2, ZF - st / 2], { tint: skin.tint });
  const strip = b.box("door_controls", "plastic", "plastic", [W, 0.03, ZF - ZD], [0, dy1 - 0.015, (ZD + ZF) / 2], { mass: 0.45, tint: 0x1f2022 });
  const railL = b.box("door_rail_l", "steelSheet", "metal_raw", [0.025, dy1 - dy0 - 0.03, ZF - ZD - st - 0.003], [-hw + 0.0125, (dy0 + dy1 - 0.03) / 2, (ZD + 0.003 + ZF - st) / 2], { mass: 0.45, tint: 0x9c9d9b });
  const railR = b.box("door_rail_r", "steelSheet", "metal_raw", [0.025, dy1 - dy0 - 0.03, ZF - ZD - st - 0.003], [hw - 0.0125, (dy0 + dy1 - 0.03) / 2, (ZD + 0.003 + ZF - st) / 2], { mass: 0.45, tint: 0x9c9d9b });
  const liner = b.box("door_liner", "plastic", "plastic", [W - 0.05, dy1 - dy0 - 0.03, 0.003], [0, (dy0 + dy1 - 0.03) / 2, ZD + 0.0015], { tint: 0xd9dadb });
  const disp = b.box("door_dispenser", "plastic", "plastic", [0.14, 0.09, 0.03], [0.08, 0.6, ZD - 0.015], { tint: 0xc9cacc });
  b.glue(outer, railL, 40);
  b.glue(outer, railR, 40);
  b.screw(strip, outer, 2, 20);
  b.screw(strip, railL, 1, 25);
  b.screw(strip, railR, 1, 25);
  b.screw(liner, railL, 3, 20);
  b.screw(liner, railR, 3, 20);
  b.clip(disp, liner, 8);
  buttonGrid(b, "btn", { on: strip, rows: 1, cols: 5, size: [0.022, 0.014], depth: 0.003, tints: [0x3a3b3d, 0x3a3b3d, 0x3a3b3d, 0x3a3b3d, 0x2e7d32] }, [0.12, dy1, (ZD + ZF) / 2], [-90, 0, 0]);
  const disp7 = b.box("display", "plastic", "display_blue", [0.05, 0.002, 0.016], [-0.06, dy1 + 0.001, (ZD + ZF) / 2], { tint: 0xffffff });
  b.press(disp7, strip, 3);
  pcb(b, "board", { w: 0.16, h: 0.022, mount: { to: liner, screws: 2, each: 8 }, sparks: 0.6, components: [{ kind: "chipSmall", x: -0.04, y: 0 }, { kind: "relay", x: 0.03, y: 0, size: [0.016, 0.012, 0.014] }] }, [0, dy1 - 0.07, ZD + 0.003 + 0.0016]);
  barHandle(b, "handle", { on: outer, len: 0.4, size: 0.012, standoff: 0.03, mat: "steel", surf: "steel_brushed" }, [0, dy1 - 0.08, ZF]);
  const kick = b.box("toekick", "steelSheet", skin.surf, [W - 0.004, 0.06, st], [0, 0.045, ZD - 0.03], { tint: skin.tint });
  b.screw(kick, sideL, 1, 20);
  b.screw(kick, sideR, 1, 20);
  const axis = hingeAxis([0, 1, 0], [0, 0, 1]);
  const g = b.hinge(railL, sideL, { pivots: [[-hw + 0.012, dy0, ZD]], axis, min: 0, max: 88, strength: 70, friction: 0.5, spring: 14 });
  b.hinge(railR, sideR, { pivots: [[hw - 0.012, dy0, ZD]], axis, min: 0, max: 88, strength: 70, friction: 0.5, spring: 14, group: g, latch: 10, latchPos: [0, dy1 - 0.02, ZD], latchPart: strip, latchFixed: tub.t });
  return finish(b);
}
