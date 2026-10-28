// Wall-mounted chimney range hood (0.75 m T-shape, ~12 kg): 0.8 mm stainless canopy box with two
// aluminium mesh grease filters, a blower (motor + plastic housing) on a steel mounting plate
// screwed to the wall, an aluminium flex duct, a three-sided chimney cover screwed to a wall
// bracket under the ceiling, two LED spots (glass lenses with `light` features) and press-fit
// buttons. Tear it off the wall, dent the canopy, pop the filters out.
// Origin: bottom centre of the canopy, back (wall side) at z = -0.25, front +Z. PURE MODULE.

import { Builder } from "../lib/builder.ts";
import { buttonGrid } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import { finish } from "./lib.ts";

export interface HoodOpts {
  /** Chimney cover height above the canopy (m); default reaches 1 cm under a 2.7 m ceiling from 1.56 m. */
  chimney?: number;
  seed?: number;
}

export function buildRangeHood(o: HoodOpts = {}): AssemblyDef {
  const b = new Builder("rangeHood", "Range Hood", "appliance", 420, o.seed);
  const W = 0.75,
    D = 0.5,
    H = 0.07,
    t = 0.0008;
  const ZB = -D / 2,
    ZF = D / 2;
  const ss = { surf: "steel_brushed" as const, tint: 0xffffff };
  const topP = b.box("canopy_top", "steelSheet", ss.surf, [W, t, D], [0, H - t / 2, 0], { tint: ss.tint });
  const fr = b.box("canopy_front", "steelSheet", ss.surf, [W, H - t, t], [0, (H - t) / 2, ZF - t / 2], { tint: ss.tint });
  const bk = b.box("canopy_back", "steelSheet", ss.surf, [W, H - t, t], [0, (H - t) / 2, ZB + t / 2], { tint: ss.tint });
  const l = b.box("canopy_l", "steelSheet", ss.surf, [t, H - t, D - 2 * t], [-W / 2 + t / 2, (H - t) / 2, 0], { tint: ss.tint });
  const r = b.box("canopy_r", "steelSheet", ss.surf, [t, H - t, D - 2 * t], [W / 2 - t / 2, (H - t) / 2, 0], { tint: ss.tint });
  b.autoBond("weld", 40, 0.0004, (a, c) => a.startsWith("canopy_") && c.startsWith("canopy_"));
  // underside: lamp strip at the front, two filters behind it
  const strip = b.box("lamp_strip", "steelSheet", ss.surf, [W - 2 * t, 0.002, 0.1], [0, 0.001, ZF - t - 0.05], { tint: 0xe0e0e0 });
  b.weld(strip, fr, 40);
  b.weld(strip, l, 20);
  b.weld(strip, r, 20);
  const fw = (W - 2 * t - 0.004) / 2;
  const filters: string[] = [];
  for (const sx of [-1, 1]) {
    const f = b.box(sx < 0 ? "filter_l" : "filter_r", "aluminum", "vent_grille", [fw, 0.008, D - 2 * t - 0.1 - 0.004], [sx * (fw / 2 + 0.001), 0.004, ZB + t + (D - 2 * t - 0.1 - 0.004) / 2], { mass: 0.35, tint: 0xc8c8c8, tess: 0 });
    b.clip(f, sx < 0 ? l : r, 5);
    b.clip(f, bk, 5);
    filters.push(f);
  }
  for (const [k, x] of [-0.2, 0.2].entries()) {
    const lens = b.cyl(`spot${k}`, "glass", "bulb_on", 0.022, 0.004, [x, -0.002, ZF - 0.05], { segments: 10 });
    b.clip(lens, strip, 4);
    b.light({ part: lens, pos: [x, -0.03, ZF - 0.05], kind: "spot", dir: [0, -1, 0], angle: 1.6, color: 0xffe6c4, intensity: 0.6, range: 1.6, castShadows: false, mains: true, on: true });
  }
  buttonGrid(b, "btn", { on: fr, rows: 1, cols: 4, size: [0.016, 0.012], depth: 0.003, tint: 0x1d1d1f }, [0.22, H / 2, ZF]);
  // mounting plate on the wall + blower
  const plate = b.box("wall_plate", "steel", "metal_raw", [0.3, 0.12, 0.002], [0, H + 0.06, ZB + 0.001], { tint: 0xa0a0a0, tess: 0 });
  b.screw(plate, topP, 4, 25);
  b.world(plate, "screw", 3 * 60, [0, H + 0.06, ZB]);
  const housing = b.cyl("blower", "plastic", "plastic", 0.12, 0.11, [0, H + 0.055, -0.12], { segments: 12, mass: 0.9, tint: 0x2a2a2c });
  const motor = b.cyl("motor", "steel", "metal_raw", 0.045, 0.06, [0, H + 0.11 + 0.03, -0.12], { segments: 10, mass: 1.6, tint: 0x8c8c88 });
  b.screw(housing, topP, 4, 20);
  b.screw(motor, housing, 3, 20);
  b.sparks(motor, 0.5);
  // chimney: flex duct + 3-sided cover screwed to a bracket under the ceiling
  const ch = o.chimney ?? 2.69 - 1.56 - H;
  const cw = 0.25,
    cd = 0.2;
  const cz0 = ZB,
    cz1 = ZB + cd;
  const duct = b.tube("duct", "aluminum", "aluminum", [[0, H + 0.17, -0.12], [0, H + ch - 0.08, -0.15]], 0.06, { sides: 10, kgPerM: 0.35, tess: 0 });
  b.bond(duct[0], motor, "clip", { strength: 10 });
  const coverF = b.box("chimney_front", "steelSheet", ss.surf, [cw, ch, t], [0, H + ch / 2, cz1 - t / 2], { tint: ss.tint });
  const coverL = b.box("chimney_l", "steelSheet", ss.surf, [t, ch, cd - t], [-cw / 2 + t / 2, H + ch / 2, (cz0 + cz1 - t) / 2], { tint: ss.tint });
  const coverR = b.box("chimney_r", "steelSheet", ss.surf, [t, ch, cd - t], [cw / 2 - t / 2, H + ch / 2, (cz0 + cz1 - t) / 2], { tint: ss.tint });
  b.weld(coverF, coverL, 60);
  b.weld(coverF, coverR, 60);
  for (const c of [coverF, coverL, coverR]) b.screw(c, topP, 2, 15);
  const bracket = b.box("ceiling_bracket", "steel", "metal_raw", [cw - 2 * t - 0.002, 0.05, 0.03], [0, H + ch - 0.04, cz0 + 0.015], { tint: 0xa0a0a0, mass: 0.25, tess: 0 });
  b.screw(coverL, bracket, 1, 25);
  b.screw(coverR, bracket, 1, 25);
  b.world(bracket, "screw", 2 * 50, [0, H + ch - 0.04, cz0]);
  return finish(b);
}
