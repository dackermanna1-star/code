// Lamps with real `light` features (the bulb part — break it and the light dies with a pop):
//  * table lamp — hollow glazed ceramic base (lathe tiles: shatters into shards), brass collar
//    clamped onto it by the threaded rod, socket + A19 bulb, brass harp, fabric drum shade on a
//    wire spider screwed to the harp finial,
//  * floor lamp — weighted steel base on a felt/rubber pad, three threaded steel pole sections
//    (bend, unscrew), socket + bulb, harp, large fabric shade.
//
// Frames: origin on the floor/table contact point at the base centre, +Y up, front +Z.

import { Builder } from "../lib/builder.ts";
import { lightBulb, pipeKgPerM, vessel } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import { BRASS, bondTouching, lampHarp, lampShade, PALETTE } from "./lib.ts";

export interface TableLampOpts {
  /** Glaze colour of the ceramic base. */
  tint?: number;
  shadeTint?: number;
  on?: boolean;
  seed?: number;
}

/** Table lamp: 0.34 m dia × 0.52 m, ~3 kg, 36 parts. */
export function buildTableLamp(o: TableLampOpts = {}): AssemblyDef {
  const b = new Builder("tableLamp", "Ceramic Table Lamp", "decor", 120, o.seed);
  const tint = o.tint ?? PALETTE.ceramic[b.rng.int(0, PALETTE.ceramic.length - 1)];
  const baseTop = 0.27;
  const tiles = vessel(b, "base", {
    profile: [
      [0.07, 0],
      [0.1, 0.13],
      [0.04, baseTop],
    ],
    t: 0.007,
    segments: 6,
    tint,
    innerTint: 0xd8d0c4,
  });
  const collar = b.cyl("collar", BRASS.mat, BRASS.surf, 0.045, 0.02, [0, baseTop + 0.01, 0], { segments: 10, tint: BRASS.tint });
  bondTouching(b, collar, tiles, "bolt", 150, 0.002, 2);
  const rodTop = baseTop + 0.06;
  const rod = b.cyl("rod", BRASS.mat, BRASS.surf, 0.01, rodTop - baseTop - 0.02, [0, (baseTop + 0.02 + rodTop) / 2, 0], { segments: 8, tint: BRASS.tint });
  b.weld(rod, collar, 120);
  lightBulb(b, "bulb", { kind: "a19", socket: { mat: "plastic", surf: "plastic", tint: 0x2a2520 }, fixedTo: rod, on: o.on ?? true, color: 0xffc98f, intensity: 0.7, range: 4, mains: true }, [0, rodTop + 0.03, 0]);
  const apex = rodTop + 0.16;
  const harp = lampHarp(b, "harp", { on: rod, y0: rodTop - 0.005, yShoulder: apex - 0.04, y1: apex, halfW: 0.07, startR: 0.006 });
  const shadeH = 0.24;
  const shade = lampShade(b, "shade", { rBottom: 0.17, rTop: 0.13, h: shadeH, tint: o.shadeTint ?? 0xefe4cf, kg: 0.16 }, [0, apex - 0.0012 - (shadeH - 0.02), 0]);
  bondTouching(b, shade.washer, harp, "screw", 30, 0.002);
  return b.build();
}

export interface FloorLampOpts {
  shadeTint?: number;
  on?: boolean;
  seed?: number;
}

/** Floor lamp: 0.44 m dia × 1.68 m, ~6 kg, 28 parts. */
export function buildFloorLamp(o: FloorLampOpts = {}): AssemblyDef {
  const b = new Builder("floorLamp", "Floor Lamp", "decor", 150, o.seed);
  const black = 0x232325;
  const pad = b.cyl("pad", "rubber", "rubber", 0.12, 0.003, [0, 0.0015, 0], { segments: 12, tint: 0x1a1a1a });
  const base = b.cyl("base", "steel", "metal_black", 0.13, 0.01, [0, 0.008, 0], { segments: 14, capSurf: "metal_black" });
  b.glue(pad, base, 10);
  const r = 0.0125;
  const kgPerM = pipeKgPerM(0.025, 0.0012, 7850, false);
  let y = 0.013;
  const secLen = 0.48;
  const secs: string[] = [];
  for (let k = 0; k < 3; k++) {
    const s = b.cyl(`pole${k}`, "steel", "metal_black", r, secLen, [0, y + secLen / 2, 0], { segments: 8, mass: kgPerM * secLen });
    if (k === 0) b.bolt(s, base, 120);
    else b.screw(s, secs[k - 1], 1, 60); // threaded joint
    secs.push(s);
    y += secLen;
  }
  const top = secs[2];
  const poleTop = y; // 1.453
  lightBulb(b, "bulb", { kind: "a19", socket: { mat: "plastic", surf: "plastic", tint: black }, fixedTo: top, on: o.on ?? true, color: 0xffcf9a, intensity: 1.0, range: 5, mains: true }, [0, poleTop + 0.03, 0]);
  const apex = poleTop + 0.19;
  const harp = lampHarp(b, "harp", { on: top, y0: poleTop - 0.01, yShoulder: apex - 0.04, y1: apex, halfW: 0.075, startR: 0.008, tint: 0x2a2a2a });
  const shadeH = 0.3;
  const shade = lampShade(b, "shade", { rBottom: 0.22, rTop: 0.2, h: shadeH, tint: o.shadeTint ?? 0xf3ecdc, kg: 0.25, segments: 10 }, [0, apex - 0.0012 - (shadeH - 0.02), 0]);
  bondTouching(b, shade.washer, harp, "screw", 30, 0.002);
  return b.build();
}
