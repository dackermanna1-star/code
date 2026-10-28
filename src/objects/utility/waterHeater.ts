// Electric storage water heater (150 l, Ø 0.5 m, 1.47 m to the top of the nipples), built like the
// real thing from the outside in:
//
//  * a 0.6 mm painted steel jacket (two rings of 10 curved panels, dents and tears), a steel top
//    cover and bottom pan on three steel legs;
//  * 44 mm of foamed-in polyurethane insulation glued to both shells (spills foam when torn);
//  * the 2.5 mm glass-lined steel pressure tank with shallow domed ends, standing on a foam pad —
//    150 litres of water (finite water feature: crack a seam and it empties onto the floor);
//  * cold-in / hot-out steel nipples through the top, copper supply pipes soldered to the wall
//    valves (water features; they are what holds the heater in place), a brass T&P relief valve
//    with its copper discharge pipe, a plastic drain valve, two element/thermostat access covers
//    (sparks), a rating label and the power cable to the wall box.
//
// Frame: origin on the floor at the tank axis, access covers +Z, wall side −Z. Empty ~55 kg.

import { pipe, cable } from "../lib/kit.ts";
import { boxR, bondTouching, finish, mk, BRASS, METAL_SEAM, SOFT_SEAM, type BaseOpts } from "./helpers.ts";
import type { Builder, V3 } from "../lib/builder.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";

export interface WaterHeaterOpts extends BaseOpts {
  tint?: number;
  /** Wall valve outlets the supply pipes run to (local); default straight back to the wall. */
  supply?: { cold: V3; hot: V3 };
  /** Wall box the power cable runs into (local). */
  power?: V3;
  litres?: number;
}

export const WATER_HEATER = {
  r: 0.25,
  /** Top of the jacket / nipples. */
  topY: 1.402,
  nippleTopY: 1.47,
  /** Default distance of the wall plane behind the jacket. */
  wallGap: 0.015,
} as const;

const SEG = 10;
const COS_HALF = Math.cos(Math.PI / SEG);

function v(a: V3): [number, number, number] {
  return Array.isArray(a) ? [a[0], a[1], a[2]] : [a.x, a.y, a.z];
}

function nearest(b: Builder, names: string[], p: [number, number, number]): string {
  let best = names[0],
    bd = Infinity;
  for (const n of names) {
    const vs = b.get(n).poly.verts;
    let cx = 0,
      cy = 0,
      cz = 0;
    for (const q of vs) {
      cx += q.x;
      cy += q.y;
      cz += q.z;
    }
    const d = Math.hypot(cx / vs.length - p[0], cy / vs.length - p[1], cz / vs.length - p[2]);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

export function buildWaterHeater(o: WaterHeaterOpts = {}): AssemblyDef {
  const b = mk("waterHeater", "Water Heater", "appliance", 700, o);
  const tint = o.tint ?? 0xeeeeea;
  const R = WATER_HEATER.r;
  const yPan = 0.05;
  const yTop = 1.4;

  // ------------------------------------------------------------------ legs, pan, jacket, cover
  const legs: string[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (Math.PI / 2) * 3 + (k * 2 * Math.PI) / 3;
    legs.push(b.box(`leg${k}`, "steel", "metal_painted", [0.03, yPan, 0.04], [0.19 * Math.cos(a), yPan / 2, 0.19 * Math.sin(a)], { rot: [0, (-a * 180) / Math.PI, 0], tint: 0x3a3a3a, tess: 0, mass: 0.2 }));
  }
  const pan = b.cyl("pan", "steelSheet", "metal_painted", R, 0.0015, [0, yPan + 0.00075, 0], { segments: SEG, tint: 0x55585a, tess: 0 });
  for (const l of legs) b.weld(l, pan, 60);
  const jacket = b.lathe("jacket", "steelSheet", "metal_painted", "metal_raw", {
    profile: [
      [R, yPan + 0.0015],
      [R, 0.73],
      [R, yTop],
    ],
    thickness: 0.0006,
    segments: SEG,
    tint,
    seam: "weld",
    seamStrength: METAL_SEAM,
  });
  const cover = b.cyl("top_cover", "steelSheet", "metal_painted", R, 0.001, [0, yTop + 0.0005, 0], { segments: SEG, tint, tess: 0 });
  for (const j of jacket) {
    const c = b.contact(j, pan, 0.001);
    if (c) b.screw(j, pan, 1, 25);
    const d = b.contact(j, cover, 0.001);
    if (d) b.screw(j, cover, 1, 25);
  }

  // ------------------------------------------------------------------ insulation + pressure tank
  const rIn = 0.205; // tank outer radius at the vertices
  const foam = b.lathe("insulation", "foam", "foam", "foam", {
    profile: [
      [R - 0.0006, yPan + 0.0015],
      [R - 0.0006, yTop],
    ],
    thickness: R - 0.0006 - rIn,
    segments: SEG,
    tint: 0xe9d27a,
    seam: "glue",
    seamStrength: SOFT_SEAM,
  });
  for (const f of foam) bondTouching(b, f, jacket, "glue", 40, 0.002, 0);
  const pad = b.cyl("foam_pad", "foam", "foam", rIn - 0.0005, 0.065, [0, yPan + 0.0015 + 0.0325, 0], { segments: SEG, tint: 0xe9d27a });
  b.glue(pad, pan, 20);
  const yt0 = yPan + 0.0015 + 0.065; // underside of the tank (bottom dome apex)
  const tank = b.lathe("tank", "steel", "metal_raw", "ceramic_glaze", {
    profile: [
      [0.0, yt0],
      [rIn, yt0 + 0.025],
      [rIn, 1.325],
      [0.0, 1.35],
    ],
    thickness: 0.0025,
    segments: SEG,
    tint: 0x8a8f94,
    innerTint: 0x2c3d63, // blue glass lining
    seam: "weld",
    seamStrength: 400,
  });
  for (const f of foam) bondTouching(b, f, tank, "glue", 30, 0.003, 0);
  for (const t of tank) {
    const c = b.contact(t, pad, 0.0015);
    if (c) b.glue(t, pad, 15);
  }
  const mid = nearest(b, tank, [0, 0.7, R]);
  b.water(mid, [0, 0.5, rIn * COS_HALF], [0, -0.2, 1], 0.55, o.litres ?? 150);

  // ------------------------------------------------------------------ nipples + supply pipes
  const yNip0 = 1.3412;
  const nippleH = WATER_HEATER.nippleTopY - yNip0;
  const supply = o.supply ?? { cold: [0.1, 1.58, -R - WATER_HEATER.wallGap + 0.04], hot: [-0.1, 1.58, -R - WATER_HEATER.wallGap + 0.04] };
  for (const [k, sx, end] of [
    ["cold", 0.1, v(supply.cold)],
    ["hot", -0.1, v(supply.hot)],
  ] as Array<[string, number, [number, number, number]]>) {
    const nip = b.cyl(`nipple_${k}`, "steel", "steel_brushed", 0.011, nippleH, [sx, yNip0 + nippleH / 2, 0], { segments: 8, mass: 0.12 });
    b.weld(nip, nearest(b, tank, [sx * 0.6, 1.34, 0]), 300);
    b.screw(nip, cover, 1, 20);
    const ring = b.cyl(`dielectric_${k}`, "plastic", "plastic", 0.016, 0.02, [sx, WATER_HEATER.nippleTopY + 0.01, 0], { segments: 8, tint: k === "cold" ? 0x2b5fb3 : 0xb32b2b, mass: 0.02 });
    b.screw(ring, nip, 1, 60);
    const yUp = Math.max(end[1], WATER_HEATER.nippleTopY + 0.08);
    const segs = pipe(
      b,
      `pipe_${k}`,
      [
        [sx, WATER_HEATER.nippleTopY + 0.0201, 0],
        [sx, yUp, 0],
        [end[0], yUp, end[2] * 0.5],
        [end[0], end[1], end[2]],
      ],
      { od: 0.015, water: { pressure: 0.7 }, jointStrength: 160 },
    );
    b.screw(segs[0], ring, 1, 60);
    b.world(segs[segs.length - 1], "fused", 180, end); // soldered into the wall valve
  }

  // ------------------------------------------------------------------ T&P relief valve + discharge pipe
  const tp = b.cyl("tp_valve", BRASS.mat, BRASS.surf, 0.014, 0.05, [R + 0.025, 1.3, 0], { axis: "x", segments: 8, tint: BRASS.tint, mass: 0.35 });
  bondTouching(b, tp, jacket, "screw", 60, 0.002);
  const lever = boxR(b, "tp_lever", BRASS.mat, BRASS.surf, [R + 0.03, R + 0.04], [1.315, 1.36], [-0.006, 0.006], { tint: BRASS.tint, mass: 0.02 });
  b.press(lever, tp, 6);
  const dis = pipe(
    b,
    "tp_discharge",
    [
      [R + 0.05, 1.3, 0],
      [R + 0.075, 1.3, 0],
      [R + 0.075, 0.16, 0],
    ],
    { od: 0.019, water: false, jointStrength: 120 },
  );
  b.screw(dis[0], tp, 1, 50);

  // ------------------------------------------------------------------ drain valve, access covers, label
  const zf = R * COS_HALF; // front facet plane (θ = 90° is a facet centre)
  const drain = b.cyl("drain_valve", "plastic", "plastic", 0.012, 0.04, [0, 0.2, zf + 0.02], { axis: "z", segments: 8, tint: 0xf0efe9, mass: 0.04 });
  bondTouching(b, drain, jacket, "screw", 30, 0.002);
  const knob = b.cyl("drain_knob", "plastic", "plastic", 0.016, 0.012, [0, 0.2, zf + 0.046], { axis: "z", segments: 8, tint: 0xf0efe9, mass: 0.01 });
  b.press(knob, drain, 5);
  b.water(drain, [0, 0.2, zf + 0.045], [0, -0.5, 1], 0.3);
  for (const [k, y] of [
    ["lo", 0.36],
    ["hi", 1.08],
  ] as Array<[string, number]>) {
    const pl = boxR(b, `access_${k}`, "steelSheet", "metal_painted", [-0.065, 0.065], [y - 0.085, y + 0.085], [zf, zf + 0.0012], { tint });
    bondTouching(b, pl, jacket, "screw", 50, 0.002);
    b.sparks(pl, 0.5);
  }
  const label = boxR(b, "label", "paper", "paper_printed", [-0.08, 0.08], [0.66, 0.78], [zf, zf + 0.0006], { mass: 0.003 });
  bondTouching(b, label, jacket, "glue", 4, 0.002);

  // ------------------------------------------------------------------ power cable to the wall box
  const pw = o.power ? v(o.power) : ([0.0, 1.6, -R - WATER_HEATER.wallGap + 0.01] as [number, number, number]);
  const gland = b.cyl("cable_gland", "plastic", "plastic", 0.01, 0.02, [0, yTop + 0.011, -0.16], { segments: 8, tint: 0x2a2a2a, mass: 0.01 });
  b.screw(gland, cover, 1, 20);
  const cab = cable(
    b,
    "power_cable",
    [
      [0, yTop + 0.021, -0.16],
      [0, Math.max(pw[1] - 0.05, yTop + 0.1), (pw[2] - 0.16) / 2],
      pw,
    ],
    { r: 0.0045, kgPerM: 0.12, sparks: 0.3, start: { to: gland, kind: "clip", strength: 30 } },
  );
  b.world(cab[cab.length - 1], "clip", 25, pw);

  return finish(b, o);
}
