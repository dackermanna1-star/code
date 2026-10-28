// Ceiling light fixtures, one believable style per room. CEILING frame: origin at the ceiling
// mounting point, the fixture hangs down along −Y (the furnisher places it at y = 2.7).
// Every bulb is a glass part with a mains `light` feature; fixtures are screwed to the ceiling
// junction box (world bonds) so they can be knocked down, and their glass breaks for real.
// PURE MODULE.

import { Builder } from "../lib/builder.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import { bondNear, bulb, bulbLength, extremeTiles, K2700, K3000, NICKEL, radialYaw, WHITE_PAINT, type LightSpec } from "./parts.ts";

export interface CeilingLightOpts {
  seed?: number;
  /** Overrides for every bulb's light (colour, intensity, range...). */
  light?: LightSpec;
  validate?: "basic" | "full";
}

/**
 * Flush-mount dome (hall, foyer, bathroom): painted steel pan screwed to the ceiling box, a
 * porcelain-look socket, one A15 bulb and a frosted glass bowl (fused glass tiles) held by three
 * thumbscrews. ~1.6 kg, Ø 0.27 m, 0.17 m tall.
 */
export function buildFlushMount(opts: CeilingLightOpts & { r?: number } = {}): AssemblyDef {
  const b = new Builder("flushMountLight", "Flush-Mount Ceiling Light", "fixture", 45, opts.seed);
  const R = opts.r ?? 0.135;
  const panH = 0.022;
  const pan = b.cyl("pan", "steelSheet", "metal_painted", R, panH, [0, -panH / 2, 0], { segments: 16, mass: 0.48, tint: WHITE_PAINT });
  b.world(pan, "screw", 80, [0, 0, 0]);
  const socket = b.cyl("socket", "ceramic", "ceramic_glaze", 0.02, 0.03, [0, -panH - 0.015, 0], { segments: 10, tint: 0xf3efe6 });
  b.screw(socket, pan, 2, 15);
  const yb = -panH - 0.03;
  const lamp = bulb(b, "bulb", "a15", { color: K3000, intensity: 3.2, range: 5.5, ...opts.light }, [0, yb, 0], [180, 0, 0]);
  b.screw(lamp.cap, socket, 1, 10);
  // frosted glass bowl, rim against the pan
  const depth = Math.max(0.12, bulbLength("a15") + 0.03 + 0.012);
  const bowl = b.lathe("bowl", "glass", "glass_frosted", "glass_frosted", {
    profile: [
      [R * 0.4, 0],
      [R * 0.83, depth * 0.4],
      [R, depth],
    ],
    thickness: 0.0025,
    segments: 8,
    capBottom: true,
    edgeSurf: "glass_edge",
    tint: 0xfbf8f2,
    pos: [0, -panH - depth, 0],
    seamStrength: 8,
  });
  // three thumbscrews into the bowl's rim
  const rim = extremeTiles(b, bowl, "top", 1e-3);
  rim.forEach((t, k) => {
    if (k % Math.max(1, Math.floor(rim.length / 3)) === 0) b.bond(t, pan, "screw", { strength: 10 });
  });
  return b.build({ validate: opts.validate });
}

/**
 * Drum pendant (master bedroom): steel canopy screwed to the ceiling, a fabric-covered cord on a
 * ball joint (the whole shade swings when hit), socket, steel spider, eight-tile fabric drum
 * shade (Ø 0.5 × 0.3 m) and a frosted acrylic diffuser. ~1.8 kg.
 */
export function buildPendant(opts: CeilingLightOpts & { cord?: number; shadeTint?: number } = {}): AssemblyDef {
  const b = new Builder("pendantLight", "Drum Pendant Light", "fixture", 120, opts.seed);
  const cordLen = opts.cord ?? 0.55;
  const canopy = b.cyl("canopy", "steelSheet", "steel_brushed", 0.065, 0.03, [0, -0.015, 0], { segments: 14, mass: 0.25, tint: NICKEL });
  b.world(canopy, "screw", 80, [0, 0, 0]);
  const yc0 = -0.03,
    yc1 = yc0 - cordLen;
  const cord = b.cyl("cord", "copper", "fabric_cotton", 0.0035, cordLen, [0, (yc0 + yc1) / 2, 0], { segments: 6, mass: 0.035, tint: 0x2b2722, tess: 0 });
  // cord grip in the canopy: one pivot → ball-and-socket, so the shade swings freely
  b.hinge(cord, canopy, { pivots: [[0, yc0, 0]], axis: [1, 0, 0], min: -60, max: 60, strength: 80, friction: 0.02 });
  const sockH = 0.06;
  const socket = b.cyl("socket", "plastic", "plastic", 0.02, sockH, [0, yc1 - sockH / 2, 0], { segments: 10, tint: 0x2a2a2a });
  b.bond(socket, cord, "clip", { strength: 50 });
  const ySp = yc1 - 0.02;
  // drum shade: eight fabric tiles (fabric laminated on a styrene liner), top 15 mm above the spider
  const Rs = 0.25,
    Hs = 0.3,
    ts = 0.005;
  const yTop = ySp + 0.015;
  const shade = b.lathe("shade", "fabric", "fabric_cotton", "fabric_cotton", {
    profile: [
      [Rs, 0],
      [Rs, Hs],
    ],
    thickness: ts,
    segments: 8,
    tint: opts.shadeTint ?? 0xe9dfcc,
    innerTint: 0xf6efe2,
    pos: [0, yTop - Hs, 0],
    seamStrength: 15,
  });
  // steel spider: three spokes from the socket ring to the shade wall (at tile centres)
  const apothem = (Rs - ts) * Math.cos(Math.PI / 8) - 0.0005;
  const spokes: string[] = [];
  for (const k of [0, 3, 6]) {
    const th = 22.5 + 45 * k;
    const r0 = 0.02,
      len = apothem - r0,
      rc = r0 + len / 2;
    const c = Math.cos((th * Math.PI) / 180),
      s = Math.sin((th * Math.PI) / 180);
    const sp = b.box(`spoke${k}`, "steel", "metal_black", [len, 0.004, 0.004], [rc * c, ySp, rc * s], { rot: [0, radialYaw(th), 0], tess: 0 });
    b.screw(sp, socket, 1, 20);
    bondNear(b, sp, shade, "glue", 12, 0.004, 1);
    spokes.push(sp);
  }
  // frosted acrylic diffuser resting on the bottom rim clips
  const yDif = yTop - Hs + 0.02;
  const dif = b.cyl("diffuser", "acrylic", "glass_frosted", apothem - 0.002, 0.003, [0, yDif, 0], { segments: 16, tint: 0xfffaf0 });
  bondNear(b, dif, shade, "clip", 3, 0.01);
  const lamp = bulb(b, "bulb", "a19", { color: K2700, intensity: 3.6, range: 6, ...opts.light }, [0, yc1 - sockH, 0], [180, 0, 0]);
  b.screw(lamp.cap, socket, 1, 10);
  return b.build({ validate: opts.validate });
}

/**
 * Three-head track bar (kitchen): an aluminium track screwed to the ceiling along local Z with
 * three adjustable spot heads (steel cans with a glass lens = the light part, `spot` lights
 * aimed at the counter, the floor and the peninsula). ~1.0 kg, 1.1 m long.
 */
export function buildTrackLight(opts: CeilingLightOpts & { len?: number; tilt?: number } = {}): AssemblyDef {
  const b = new Builder("trackLight", "Kitchen Track Light", "fixture", 90, opts.seed);
  const L = opts.len ?? 1.1;
  const tilt = opts.tilt ?? 25;
  const railH = 0.02;
  const rail = b.box("rail", "aluminum", "aluminum", [0.03, railH, L], [0, -railH / 2, 0], { mass: 0.45, tint: 0x2a2a2c, tess: 0.08 });
  b.world(rail, "screw", 105, [0, 0, 0]);
  const feed = b.box("feed", "plastic", "plastic", [0.05, 0.022, 0.09], [0, -railH - 0.011, 0.19 * L], { tint: 0x2a2a2c });
  b.clip(feed, rail, 30);
  // [position along the bar (fraction of L), tilt (deg, > 0 aims towards −Z)]
  const heads: Array<[number, number]> = [
    [-0.38, tilt],
    [0, 0],
    [0.38, -tilt],
  ];
  heads.forEach(([z, t], k) => {
    const stemH = 0.03;
    const stem = b.cyl(`stem${k}`, "plastic", "plastic", 0.011, stemH, [0, -railH - stemH / 2, z * L], { segments: 8, tint: 0x2a2a2c });
    b.clip(stem, rail, 25);
    // aim: rotating the can about X by t turns its −Y axis to d = (0, −cos t, −sin t)
    const a = (t * Math.PI) / 180;
    const d = { x: 0, y: -Math.cos(a), z: -Math.sin(a) };
    const canH = 0.08,
      canR = 0.03;
    const top = { x: 0, y: -railH - stemH, z: z * L };
    const cc = { x: top.x + d.x * (canH / 2 + 0.002), y: top.y + d.y * (canH / 2 + 0.002), z: top.z + d.z * (canH / 2 + 0.002) };
    const can = b.cyl(`can${k}`, "steelSheet", "metal_black", canR, canH, [cc.x, cc.y, cc.z], { segments: 12, mass: 0.1, rot: [t, 0, 0], tess: 0 });
    b.screw(can, stem, 1, 20);
    const lc = { x: cc.x + d.x * (canH / 2 + 0.002), y: cc.y + d.y * (canH / 2 + 0.002), z: cc.z + d.z * (canH / 2 + 0.002) };
    const lens = b.cyl(`lens${k}`, "glass", "bulb_on", canR * 0.85, 0.004, [lc.x, lc.y, lc.z], { segments: 12, rot: [t, 0, 0], smooth: 0 });
    b.glue(lens, can, 6);
    b.light({
      part: lens,
      pos: [lc.x, lc.y, lc.z],
      kind: "spot",
      dir: [d.x, d.y, d.z],
      angle: 1.05,
      color: opts.light?.color ?? K3000,
      intensity: opts.light?.intensity ?? 2.6,
      range: opts.light?.range ?? 5,
      castShadows: opts.light?.castShadows,
      mains: true,
      on: opts.light?.on ?? true,
    });
    b.sparks(can, 0.3);
  });
  return b.build({ validate: opts.validate });
}

/**
 * Schoolhouse globe (bedroom 2): canopy, stem and fitter in brushed nickel, an opal glass globe
 * (Ø 0.25 m, fused glass tiles) held by thumbscrews in the fitter, socket and A19 bulb. ~2 kg.
 */
export function buildSchoolhouse(opts: CeilingLightOpts = {}): AssemblyDef {
  const b = new Builder("schoolhouseLight", "Schoolhouse Globe Light", "fixture", 70, opts.seed);
  const canopy = b.cyl("canopy", "steelSheet", "steel_brushed", 0.065, 0.025, [0, -0.0125, 0], { segments: 14, mass: 0.2, tint: NICKEL });
  b.world(canopy, "screw", 80, [0, 0, 0]);
  const stem = b.cyl("stem", "steel", "steel_brushed", 0.01, 0.1, [0, -0.075, 0], { segments: 8, mass: 0.06, tint: NICKEL });
  b.bolt(stem, canopy, 100);
  const fitter = b.cyl("fitter", "steelSheet", "steel_brushed", 0.06, 0.05, [0, -0.15, 0], { segments: 14, rTop: 0.045, mass: 0.15, tint: NICKEL });
  b.bolt(fitter, stem, 100);
  const socket = b.cyl("socket", "plastic", "plastic", 0.02, 0.03, [0, -0.19, 0], { segments: 10, tint: 0x2a2a2a });
  b.screw(socket, fitter, 2, 12);
  const lamp = bulb(b, "bulb", "a19", { color: K2700, intensity: 3.4, range: 5.5, ...opts.light }, [0, -0.205, 0], [180, 0, 0]);
  b.screw(lamp.cap, socket, 1, 10);
  const H = 0.225;
  const globe = b.lathe("globe", "glass", "glass_frosted", "glass_frosted", {
    profile: [
      [0.06, 0],
      [0.125, 0.08],
      [0.115, 0.17],
      [0.052, H],
    ],
    thickness: 0.003,
    segments: 8,
    capBottom: true,
    edgeSurf: "glass_edge",
    tint: 0xfdfbf6,
    pos: [0, -0.175 - H, 0],
    seamStrength: 8,
  });
  const neck = extremeTiles(b, globe, "top", 1e-3);
  neck.forEach((t, k) => {
    if (k % Math.max(1, Math.floor(neck.length / 3)) === 0) b.bond(t, fitter, "screw", { strength: 10 });
  });
  return b.build({ validate: opts.validate });
}

/**
 * Utility batten (laundry): a porcelain lampholder (breakable ceramic base screwed to the box)
 * with a bare ST64 "Edison" bulb (the porcelain is hollow: mass overrides). ~0.35 kg.
 */
export function buildBatten(opts: CeilingLightOpts = {}): AssemblyDef {
  const b = new Builder("battenLight", "Porcelain Batten Holder", "fixture", 15, opts.seed);
  const base = b.cyl("holder", "ceramic", "ceramic_glaze", 0.055, 0.028, [0, -0.014, 0], { segments: 14, rTop: 0.058, tint: 0xf5f2ea, mass: 0.2 });
  b.world(base, "screw", 60, [0, 0, 0]);
  const neck = b.cyl("neck", "ceramic", "ceramic_glaze", 0.024, 0.035, [0, -0.028 - 0.0175, 0], { segments: 12, rTop: 0.03, tint: 0xf5f2ea, mass: 0.07 });
  b.fuse(neck, base, 60);
  const lamp = bulb(b, "bulb", "st64", { color: K2700, intensity: 3.0, range: 5, ...opts.light }, [0, -0.063, 0], [180, 0, 0]);
  b.screw(lamp.cap, neck, 1, 10);
  return b.build({ validate: opts.validate });
}
