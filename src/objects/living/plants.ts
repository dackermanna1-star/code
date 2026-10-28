// House plants in glazed ceramic pots (lathe tiles — they shatter) filled with potting soil
// (`soil` feature: spills when the pot breaks or tips):
//  * fiddle-leaf fig — woody trunk (softwood segments, splinters) carrying a spiral of big
//    leathery leaves glued on (they tear off and flutter down as paper scraps),
//  * snake plant — tall sword leaves rising out of the soil,
//  * succulent — tiny pot, fleshy rosette leaves.
//
// Frame: origin on the floor at the pot's centre, +Y up.

import { Builder, type V3 } from "../lib/builder.ts";
import { lowestPart, vessel } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import { leaf } from "./lib.ts";

interface PotResult {
  tiles: string[];
  soil: string;
  /** Top of the soil surface (y). */
  soilTop: number;
}

/** Tapered pot (bottom radius r0, top radius r1, height h, wall t) filled with soil to `fill`. */
function pottedSoil(b: Builder, o: { r0: number; r1: number; h: number; t: number; fill: number; tint: number; segments: number; soilDensity?: number }): PotResult {
  const tiles = vessel(b, "pot", { profile: [[o.r0, 0], [o.r1, o.h]], t: o.t, segments: o.segments, tint: o.tint, innerTint: 0xb98e6a });
  const floor = lowestPart(b, tiles);
  const y0 = o.t + 0.001;
  const y1 = o.h * o.fill;
  const rAt = (y: number): number => o.r0 + ((o.r1 - o.r0) * y) / o.h - o.t;
  // stay inside the polygonal inner wall (segment chords are closer than the radius)
  const chord = Math.cos(Math.PI / o.segments);
  const rb = rAt(y0) * chord - 0.003,
    rt = rAt(y1) * chord - 0.003;
  const vol = (Math.PI * (y1 - y0) * (rb * rb + rb * rt + rt * rt)) / 3;
  const soil = b.cyl("soil", "soil", "soil", rb, y1 - y0, [0, (y0 + y1) / 2, 0], { rTop: rt, segments: o.segments * 2, tint: 0x4a3626, mass: vol * (o.soilDensity ?? 650) });
  b.friction(soil, floor, 25);
  b.soil(soil);
  return { tiles, soil, soilTop: y1 };
}

/** Fiddle-leaf fig, ~1.75 m tall, ~11 kg. */
export function buildFiddleLeafFig(o: { potTint?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("fiddleLeafFig", "Fiddle-Leaf Fig", "decor", 120, o.seed);
  const pot = pottedSoil(b, { r0: 0.12, r1: 0.16, h: 0.3, t: 0.01, fill: 0.85, tint: o.potTint ?? 0xe9e3d6, segments: 8 });
  const y0 = pot.soilTop;
  const path: Array<[number, number, number]> = [
    [0, y0 - 0.02, 0],
    [0.02, 0.75, 0.01],
    [-0.01, 1.2, 0.0],
    [0.005, 1.6, 0.01],
  ];
  const trunk = b.tube("trunk", "softwood", "wood_pine", path, 0.014, { sides: 7, tint: 0x6b5a45, joint: "fused" });
  b.glue(trunk[0], pot.soil, 30); // roots
  // leaves in a golden-angle spiral on the upper trunk
  const at = (y: number): [number, number, number] => {
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i],
        c = path[i + 1];
      if (y >= a[1] && y <= c[1]) {
        const u = (y - a[1]) / (c[1] - a[1]);
        return [a[0] + (c[0] - a[0]) * u, y, a[2] + (c[2] - a[2]) * u];
      }
    }
    return path[path.length - 1];
  };
  const segOf = (y: number): string => {
    for (let i = 0; i + 1 < path.length; i++) if (y <= path[i + 1][1]) return trunk[i];
    return trunk[trunk.length - 1];
  };
  const n = 12;
  for (let k = 0; k < n; k++) {
    const y = 0.86 + k * 0.058;
    const yaw = k * 137.5;
    const len = 0.22 + 0.06 * Math.sin(k * 1.7) ** 2;
    const tilt = 18 - k * 1.5; // younger leaves at the top point upwards less
    const p = at(y);
    const a = (yaw * Math.PI) / 180;
    const base: V3 = [p[0] + 0.008 * Math.cos(a), y, p[2] - 0.008 * Math.sin(a)];
    const lf = leaf(b, `leaf${k}`, { len, wid: len * 0.55, thick: 0.004, tint: k % 3 === 0 ? 0x5b8a3c : 0x46733a }, base, [0, yaw, tilt]);
    b.glue(lf, segOf(y), 3);
  }
  return b.build();
}

/** Snake plant (sansevieria), ~0.8 m tall, ~5 kg. */
export function buildSnakePlant(o: { potTint?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("snakePlant", "Snake Plant", "decor", 45, o.seed);
  const pot = pottedSoil(b, { r0: 0.09, r1: 0.115, h: 0.24, t: 0.009, fill: 0.85, tint: o.potTint ?? 0x2d2d2d, segments: 8 });
  const y0 = pot.soilTop;
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 2 * Math.PI + 0.2;
    const c = Math.cos(a),
      s = Math.sin(a);
    const r = 0.055;
    const L = 0.45 + 0.12 * ((k * 5) % 3);
    const lean = 0.06 + 0.02 * (k % 2);
    const w = 0.042,
      t = 0.006;
    // tangent (leaf width direction) and radial (thickness direction)
    const tx = -s,
      tz = c;
    const pts: V3[] = [];
    for (const sw of [-1, 1])
      for (const st of [-1, 1]) {
        pts.push([r * c + (sw * w) / 2 * tx + (st * t) / 2 * c, y0 - 0.01, r * s + (sw * w) / 2 * tz + (st * t) / 2 * s]);
        pts.push([(r + lean * L * 0.5) * c + (sw * w * 0.42) * tx + (st * t) / 2 * c, y0 + L * 0.55, (r + lean * L * 0.5) * s + (sw * w * 0.42) * tz + (st * t) / 2 * s]);
      }
    pts.push([(r + lean * L) * c, y0 + L, (r + lean * L) * s]);
    const lf = b.hull(`leaf${k}`, "food", "foliage", pts, [0, 0, 0], { tint: k % 2 ? 0x3f6a35 : 0x56803f, mass: 0.04 });
    b.glue(lf, pot.soil, 6);
  }
  return b.build();
}

/** Small succulent in a ceramic pot (~0.35 kg). */
export function buildSucculent(o: { potTint?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("succulent", "Succulent", "decor", 15, o.seed);
  const pot = pottedSoil(b, { r0: 0.045, r1: 0.055, h: 0.07, t: 0.006, fill: 0.85, tint: o.potTint ?? 0xd9b48a, segments: 6, soilDensity: 700 });
  const y0 = pot.soilTop;
  for (let k = 0; k < 5; k++) {
    const yaw = k * 72;
    const a = (yaw * Math.PI) / 180;
    const lf = leaf(b, `leaf${k}`, { len: 0.045, wid: 0.022, thick: 0.012, mat: "food", tint: 0x7fa58a, kg: 0.005 }, [0.01 * Math.cos(a), y0 + 0.004, -0.01 * Math.sin(a)], [0, yaw, 25]);
    b.glue(lf, pot.soil, 2);
  }
  const core = b.ellipsoid("core", "food", "foliage", [0.01, 0.014, 0.01], [0, y0 + 0.012, 0], { tint: 0x8fb59a, segments: 8, rings: 4, mass: 0.004 });
  b.glue(core, pot.soil, 2);
  return b.build();
}
