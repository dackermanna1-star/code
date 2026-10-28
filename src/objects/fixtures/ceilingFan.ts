// 52" ceiling fan with light kit (living room). CEILING frame: origin at the ceiling box, the
// fan hangs down along −Y.
//
// Construction (static side → rotor):
//   canopy (covers the mounting bracket, screwed to the ceiling box = world)
//   → downrod (bolted through the hanger ball) → stationary motor top cover → stator
//     (laminations + copper windings, the heavy part) → stationary shaft through the rotor
//     → switch housing → light-kit pan, two candelabra sockets/bulbs, frosted glass bowl.
//   Rotor: steel motor shell (8 side tiles) + bottom flange (8 annulus tiles, hole for the
//   shaft) fused into one housing, hinged to the stator on the vertical axis (two bearing
//   pivots, free rotation) and driven by a mains `motor` feature at ~2.4 rev/s. Five steel blade
//   irons are screwed to the flange, five pitched plywood blades screwed to the irons — hit a
//   spinning blade and it snaps or tears its screws and flies off on its tangent.
// ~8 kg. PURE MODULE.

import { Builder } from "../lib/builder.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import { bondNear, bulb, bulbLength, extremeTiles, K2700, NICKEL, radialYaw, yawPitch, type LightSpec } from "./parts.ts";

export interface CeilingFanOpts {
  seed?: number;
  /** Downrod length (m), default 0.16. */
  downrod?: number;
  /** Motor speed (rad/s), default 15 (≈ 2.4 rev/s, counter-clockwise seen from below). */
  speed?: number;
  /** Blade surface tint (walnut veneer by default). */
  bladeTint?: number;
  light?: LightSpec;
  validate?: "basic" | "full";
}

export function buildCeilingFan(opts: CeilingFanOpts = {}): AssemblyDef {
  const b = new Builder("ceilingFan", 'Ceiling Fan 52"', "fixture", 220, opts.seed);
  const rodLen = opts.downrod ?? 0.16;
  const fin = { tint: NICKEL };

  // ---------------------------------------------------------------- static side
  const canopyH = 0.075;
  const canopy = b.cyl("canopy", "steelSheet", "steel_brushed", 0.045, canopyH, [0, -canopyH / 2, 0], { rTop: 0.075, segments: 16, mass: 0.35, ...fin });
  b.world(canopy, "screw", 90, [0, 0, 0]);
  const y0 = -canopyH;
  const downrod = b.cyl("downrod", "steel", "steel_brushed", 0.0105, rodLen, [0, y0 - rodLen / 2, 0], { segments: 10, mass: 0.6 * rodLen, ...fin });
  b.bolt(downrod, canopy, 150);
  const yTop = y0 - rodLen; // top of the motor
  const coverH = 0.03;
  const cover = b.cyl("cover", "steelSheet", "steel_brushed", 0.1, coverH, [0, yTop - coverH / 2, 0], { rTop: 0.04, segments: 16, mass: 0.25, ...fin });
  b.bolt(cover, downrod, 200);
  const yS0 = yTop - coverH; // stator top
  const statorH = 0.055;
  const stator = b.cyl("stator", "steel", "metal_raw", 0.07, statorH, [0, yS0 - statorH / 2, 0], { segments: 14, mass: 2.4, tint: 0xb87333 });
  b.bolt(stator, cover, 300);
  const yS1 = yS0 - statorH; // stator bottom

  // ---------------------------------------------------------------- rotor housing
  const shellTop = yS0 - 0.005,
    shellBot = yS1 - 0.01,
    flangeT = 0.004;
  const shell = b.lathe("shell", "steelSheet", "steel_brushed", "metal_raw", {
    profile: [
      [0.1, 0],
      [0.1, shellTop - shellBot],
    ],
    thickness: 0.0012,
    segments: 8,
    pos: [0, shellBot, 0],
    seamStrength: 200,
    tint: NICKEL,
  });
  const flange = b.lathe("flange", "steelSheet", "steel_brushed", "metal_raw", {
    profile: [
      [0.03, 0],
      [0.1, 0],
    ],
    thickness: flangeT,
    segments: 8,
    pos: [0, shellBot - flangeT, 0],
    seamStrength: 200,
    tint: NICKEL,
  });
  // the flange's outer band carries the shell: weld every touching pair
  for (const f of flange) bondNear(b, f, shell, "weld", 150, 0.0005);
  const rotorTop = shell[0];
  const group = b.hinge(rotorTop, stator, {
    pivots: [
      [0, yS0 - 0.003, 0],
      [0, yS1 + 0.003, 0],
    ],
    axis: [0, 1, 0],
    min: -180,
    max: 180,
    strength: 400,
  });
  b.motor(stator, group, opts.speed ?? 15, true);
  b.sparks(stator, 0.6);

  // ---------------------------------------------------------------- shaft, switch housing, light kit
  const yF = shellBot - flangeT; // flange underside
  const shaftBot = yF - 0.024;
  const shaft = b.cyl("shaft", "steel", "metal_raw", 0.012, yS1 - shaftBot, [0, (yS1 + shaftBot) / 2, 0], { segments: 10 });
  b.bolt(shaft, stator, 300);
  const swH = 0.06;
  const sw = b.cyl("switch", "steelSheet", "steel_brushed", 0.065, swH, [0, shaftBot - swH / 2, 0], { rTop: 0.06, segments: 16, mass: 0.3, ...fin });
  b.bolt(sw, shaft, 200);
  b.sparks(sw, 0.5);
  const yKit = shaftBot - swH;
  const panT = 0.012;
  const kitPan = b.cyl("kitpan", "steelSheet", "steel_brushed", 0.118, panT, [0, yKit - panT / 2, 0], { rTop: 0.065, segments: 16, mass: 0.25, ...fin });
  b.bolt(kitPan, sw, 100);
  const ySock = yKit - panT;
  const sockets: string[] = [];
  for (const sx of [-0.035, 0.035]) {
    const s = b.cyl(`socket${sx < 0 ? "L" : "R"}`, "plastic", "plastic", 0.011, 0.025, [sx, ySock - 0.0125, 0], { segments: 8, tint: 0xf3f0e8 });
    b.screw(s, kitPan, 1, 12);
    sockets.push(s);
    const lamp = bulb(b, `bulb${sx < 0 ? "L" : "R"}`, "candle", { color: K2700, intensity: 2.2, range: 6, ...opts.light }, [sx, ySock - 0.025, 0], [180, 0, 0]);
    b.screw(lamp.cap, s, 1, 8);
  }
  const bowlH = bulbLength("candle") + 0.025 + 0.02;
  const bowl = b.lathe("bowl", "glass", "glass_frosted", "glass_frosted", {
    profile: [
      [0.05, 0],
      [0.1, bowlH * 0.5],
      [0.115, bowlH],
    ],
    thickness: 0.003,
    segments: 6,
    capBottom: true,
    edgeSurf: "glass_edge",
    tint: 0xfdf8ee,
    pos: [0, ySock - bowlH, 0],
    seamStrength: 8,
  });
  for (const t of extremeTiles(b, bowl, "top", 1e-3)) b.bond(t, kitPan, "clip", { strength: 5 });

  // ---------------------------------------------------------------- blade irons + blades
  const nBlades = 5;
  const ironL = 0.135,
    ironW = 0.03,
    ironT = 0.004;
  const bladeL = 0.52,
    bladeW = 0.13,
    bladeT = 0.007,
    bladeR0 = 0.14;
  for (let k = 0; k < nBlades; k++) {
    const th = (360 / nBlades) * k + 18;
    const c = Math.cos((th * Math.PI) / 180),
      s = Math.sin((th * Math.PI) / 180);
    const ri = 0.065 + ironL / 2;
    const yIron = yF - ironT / 2;
    const iron = b.box(`iron${k}`, "steel", "steel_brushed", [ironL, ironT, ironW], [ri * c, yIron, ri * s], { rot: [0, radialYaw(th), 0], tess: 0, ...fin });
    const nb = bondNear(b, iron, flange, "screw", 40, 0.0005, 2);
    if (!nb) b.warn(`ceilingFan: blade iron ${k} does not touch the flange`);
    // pitched blade (leading edge up for counter-clockwise rotation seen from below), hung under the iron
    const rb = bladeR0 + bladeL / 2;
    const yBlade = yF - ironT - 0.004 - bladeT / 2;
    const blade = b.box(`blade${k}`, "plywood", "wood_walnut", [bladeL, bladeT, bladeW], [rb * c, yBlade, rb * s], {
      rot: yawPitch(radialYaw(th), 12),
      tint: opts.bladeTint,
      grain: "x",
      strength: 4,
    });
    b.screw(blade, iron, 3, 25);
  }
  return b.build({ validate: opts.validate });
}
