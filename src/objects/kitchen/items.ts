// Kitchen small items: knife block + knives, cutting board, dish rack, fruit bowl + fruit, paper
// towel holder, spice rack + glass jars, wine/oil bottles (glass with `liquid`), cereal boxes,
// cans (dentable steel), cookware (cast-iron skillet, saucepan with lid, stock pot), fridge
// groceries (milk carton, jam jar, juice bottle, food tub). Each is its own assembly so it can be
// grabbed and thrown. Origins: centre of the footprint on the supporting surface (y = 0).
// PURE MODULE (no Babylon).

import { Builder, type V3 } from "../lib/builder.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { bondEachTouching, bondTouching, finish, shell } from "./lib.ts";

export interface ItemOpts {
  tint?: number;
  seed?: number;
}

// ============================================================================ knives

/** Knife block geometry: slot i is centred at x = KNIFE_SLOTS[i], tilted back by KNIFE_TILT°. */
export const KNIFE_TILT = 15;
const KB_GAP = 0.004;
const KB_SLAB = (0.125 - 4 * KB_GAP) / 5;
export const KNIFE_SLOTS = [0, 1, 2, 3].map((k) => -0.0625 + (k + 1) * KB_SLAB + k * KB_GAP + KB_GAP / 2);
/** Slot length along the tilted slot axis (slab height). */
export const KNIFE_SLOT_LEN = 0.22;
/** Blade length per knife kind. */
export const KNIFE_BLADE = { chef: 0.2, bread: 0.21, utility: 0.13, paring: 0.09 } as const;
/** Slot floor (top of the base plate) and slot centre z at the floor. */
export const KNIFE_SLOT_FLOOR = { y: 0.015, z: 0.0 } as const;

/**
 * Laminated hardwood knife block: a base plate and five slabs glued to a back board, the gaps
 * between the slabs are the slots (knives are separate assemblies standing in them).
 */
export function buildKnifeBlock(o: ItemOpts = {}): AssemblyDef {
  const b = new Builder("knifeBlock", "Knife Block", "kitchenware", 35, o.seed);
  const tilt = (KNIFE_TILT * Math.PI) / 180;
  const H = KNIFE_SLOT_LEN; // slab height along the slot
  const yb = KNIFE_SLOT_FLOOR.y;
  const base = b.box("base", "hardwood", "wood_walnut", [0.13, yb, 0.15], [0, yb / 2, -0.02], { grain: "x" });
  const gap = KB_GAP;
  const slabT = KB_SLAB;
  const dz = Math.sin(tilt) * H,
    dy = Math.cos(tilt) * H;
  const slabs: string[] = [];
  let x = -0.0625;
  for (let k = 0; k < 5; k++) {
    const x0 = x,
      x1 = x + slabT;
    const pts: V3[] = [];
    for (const xx of [x0, x1]) {
      pts.push([xx, yb, -0.06], [xx, yb, 0.06], [xx, yb + dy, -0.06 - dz], [xx, yb + dy, 0.06 - dz - 0.05]);
    }
    slabs.push(b.hull(`slab${k}`, "hardwood", "wood_walnut", pts, [0, 0, 0], { grain: [0, Math.cos(tilt), -Math.sin(tilt)] }));
    x = x1 + gap;
  }
  const back = b.hull(
    "back",
    "hardwood",
    "wood_walnut",
    [
      [-0.0625, yb, -0.06],
      [0.0625, yb, -0.06],
      [-0.0625, yb, -0.075],
      [0.0625, yb, -0.075],
      [-0.0625, yb + dy, -0.06 - dz],
      [0.0625, yb + dy, -0.06 - dz],
      [-0.0625, yb + dy, -0.075 - dz],
      [0.0625, yb + dy, -0.075 - dz],
    ],
    [0, 0, 0],
    { grain: [0, Math.cos(tilt), -Math.sin(tilt)] },
  );
  for (const s of slabs) {
    b.glue(s, back, 60);
    b.glue(s, base, 40);
  }
  b.glue(back, base, 40);
  return finish(b);
}

/** Kitchen knife: stainless blade (tip at the origin, blade up +Y) and a riveted handle. */
export function buildKnife(o: { kind?: "chef" | "bread" | "utility" | "paring"; seed?: number } = {}): AssemblyDef {
  const kind = o.kind ?? "chef";
  const spec = { chef: [KNIFE_BLADE.chef, 0.045, 0.12], bread: [KNIFE_BLADE.bread, 0.03, 0.12], utility: [KNIFE_BLADE.utility, 0.025, 0.105], paring: [KNIFE_BLADE.paring, 0.02, 0.095] }[kind];
  const [L, w, hl] = spec;
  const b = new Builder("knife", `${kind[0].toUpperCase()}${kind.slice(1)} Knife`, "tool", 30, o.seed);
  const t = 0.002;
  const blade = b.hull(
    "blade",
    "steel",
    "steel_brushed",
    [
      [-t / 2, 0, 0],
      [t / 2, 0, 0],
      [-t / 2, L, -0.004],
      [t / 2, L, -0.004],
      [-t / 2, L, w - 0.004],
      [t / 2, L, w - 0.004],
      [-t / 2, L * 0.3, w * 0.75],
      [t / 2, L * 0.3, w * 0.75],
    ],
    [0, 0, 0],
    { tess: 0 },
  );
  const handle = b.bevelBox("handle", "plastic", "plastic", [0.017, hl, 0.024], 0.004, [0, L + hl / 2, w / 2 - 0.006], { tint: 0x1d1d1f });
  b.bond(blade, handle, "bolt", { strength: 80 });
  return finish(b);
}

// ============================================================================ boards & racks

/** Hardwood cutting board (0.40 × 0.28 × 0.02 m, ~1.6 kg). */
export function buildCuttingBoard(o: ItemOpts = {}): AssemblyDef {
  const b = new Builder("cuttingBoard", "Cutting Board", "kitchenware", 25, o.seed);
  b.bevelBox("board", "hardwood", "wood_oak", [0.4, 0.02, 0.28], 0.003, [0, 0.01, 0], { grain: "x", tint: o.tint });
  return finish(b);
}

/**
 * Dish-rack geometry (rack frame): tine row the plates lean on, grid top height, and the offset of
 * the low stop wires either side of the tines that catch the feet of 26 cm plates leaning 12° on
 * them (so a plate cannot skid out and fall flat).
 */
export const DISH_RACK = { gridY: 0.032, tineZ: -0.07, stop: 0.0737, w: 0.44, d: 0.32 } as const;

/** Steel wire dish rack on a plastic drip tray (plates are separate assemblies leaning on the tines). */
export function buildDishRack(o: ItemOpts = {}): AssemblyDef {
  const b = new Builder("dishRack", "Dish Rack", "kitchenware", 30, o.seed);
  const W = DISH_RACK.w,
    D = DISH_RACK.d;
  const tray = b.box("tray", "plastic", "plastic", [W + 0.02, 0.012, D + 0.02], [0, 0.006, 0], { tint: o.tint ?? 0xdfe6e8 });
  const legs: string[] = [];
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    legs.push(b.cyl(`leg${legs.length}`, "steel", "chrome", 0.005, 0.014, [sx * (W / 2 - 0.02), 0.012 + 0.007, sz * (D / 2 - 0.02)], { segments: 6 }));
  const grid = b.box("grid", "steel", "vent_grille", [W, 0.006, D], [0, DISH_RACK.gridY - 0.003, 0], { mass: 0.5, tint: 0xd8d8d8, tess: 0 });
  const wallL = b.box("wall_l", "steel", "vent_grille", [0.006, 0.09, D], [-W / 2 + 0.003, DISH_RACK.gridY + 0.045, 0], { mass: 0.12, tint: 0xd8d8d8, tess: 0 });
  const wallR = b.box("wall_r", "steel", "vent_grille", [0.006, 0.09, D], [W / 2 - 0.003, DISH_RACK.gridY + 0.045, 0], { mass: 0.12, tint: 0xd8d8d8, tess: 0 });
  const tines = b.box("tines", "steel", "vent_grille", [W - 0.012, 0.12, 0.006], [0, DISH_RACK.gridY + 0.06, DISH_RACK.tineZ], { mass: 0.15, tint: 0xd8d8d8, tess: 0 });
  for (const sz of [-1, 1]) {
    const stop = b.box(sz < 0 ? "stop_b" : "stop_f", "steel", "vent_grille", [W - 0.012, 0.02, 0.006], [0, DISH_RACK.gridY + 0.01, DISH_RACK.tineZ + sz * DISH_RACK.stop], { mass: 0.05, tint: 0xd8d8d8, tess: 0 });
    b.weld(stop, grid, 15);
  }
  for (const l of legs) {
    b.weld(l, grid, 30);
    b.friction(l, tray, 3);
  }
  b.weld(wallL, grid, 30);
  b.weld(wallR, grid, 30);
  b.weld(tines, grid, 30);
  return finish(b);
}

// ============================================================================ fruit

/** Ceramic fruit bowl Ø 26 cm (~1.1 kg). */
export function buildFruitBowl(o: ItemOpts = {}): AssemblyDef {
  const b = new Builder("fruitBowl", "Fruit Bowl", "decor", 30, o.seed);
  shell(b, "", { profile: [[0.07, 0], [0.13, 0.09]], t: 0.007, base: 0.009, segments: 10, tint: o.tint ?? 0x3f6f8a, innerTint: 0xece6da });
  return finish(b);
}

/** Inner floor height of the fruit bowl. */
export const FRUIT_BOWL_FLOOR = 0.009;

/** A piece of fruit (soft food): apple, orange or a curved banana. */
export function buildFruit(o: { kind?: "apple" | "orange" | "banana" | "lemon"; seed?: number } = {}): AssemblyDef {
  const kind = o.kind ?? "apple";
  const b = new Builder("fruit", kind[0].toUpperCase() + kind.slice(1), "misc", 1, o.seed);
  if (kind === "banana") {
    const pts: V3[] = [
      [-0.09, 0.0297, 0],
      [-0.04, 0.0142, 0],
      [0.04, 0.0142, 0],
      [0.09, 0.0297, 0],
    ];
    b.tube("banana", "food", "food", pts, 0.017, { sides: 6, tint: 0xe8c840, seam: "fused", jointStrength: 20, mass: 0.12 });
  } else {
    const r = kind === "apple" ? [0.039, 0.035, 0.039] : kind === "lemon" ? [0.03, 0.028, 0.04] : [0.038, 0.036, 0.038];
    const tint = kind === "apple" ? 0xb8282a : kind === "lemon" ? 0xf0d23a : 0xf08a1e;
    b.ellipsoid("fruit", "food", "food", r as V3, [0, r[1], 0], { tint, segments: 10, rings: 6 });
    if (kind === "apple") {
      const st = b.cyl("stem", "softwood", "wood_walnut", 0.0025, 0.016, [0, 2 * r[1] + 0.007, 0], { segments: 5, mass: 0.0008 });
      b.bond(st, "fruit", "glue", { strength: 2 });
    }
  }
  return finish(b);
}

// ============================================================================ paper towels

/** Paper towel holder: weighted steel base, post and a paper roll (stuffing: paper). */
export function buildPaperTowelHolder(o: ItemOpts = {}): AssemblyDef {
  const b = new Builder("paperTowelHolder", "Paper Towel Holder", "kitchenware", 20, o.seed);
  const base = b.cyl("base", "steel", "steel_brushed", 0.075, 0.012, [0, 0.006, 0], { segments: 12, mass: 0.6 });
  const post = b.cyl("post", "steel", "chrome", 0.007, 0.3, [0, 0.012 + 0.15, 0], { segments: 8 });
  b.weld(post, base, 80);
  const roll = b.lathe("roll", "paper", "paper", "cardboard", { profile: [[0.06, 0.014], [0.06, 0.29]], thickness: 0.043, segments: 6, capBottom: false, mass: 0.22, tint: 0xfbfbf7, seam: "friction", seamStrength: 15 });
  for (const r of roll) b.friction(r, base, 2);
  b.stuffing(roll[0], "paper");
  return finish(b);
}

// ============================================================================ spices

/** Wooden spice rack (0.36 × 0.12 × 0.11 m) for four jars. */
export function buildSpiceRack(o: ItemOpts = {}): AssemblyDef {
  const b = new Builder("spiceRack", "Spice Rack", "kitchenware", 25, o.seed);
  const W = 0.36,
    D = 0.11,
    t = 0.012;
  const base = b.box("base", "hardwood", "wood_oak", [W, t, D], [0, t / 2, 0], { grain: "x" });
  const back = b.box("back", "hardwood", "wood_oak", [W, 0.12, t], [0, t + 0.06, -D / 2 + t / 2], { grain: "x" });
  const sl = b.box("side_l", "hardwood", "wood_oak", [t, 0.1, D - t], [-W / 2 + t / 2, t + 0.05, t / 2], { grain: "z" });
  const sr = b.box("side_r", "hardwood", "wood_oak", [t, 0.1, D - t], [W / 2 - t / 2, t + 0.05, t / 2], { grain: "z" });
  const rail = b.box("rail", "hardwood", "wood_oak", [W - 2 * t, 0.012, 0.01], [0, t + 0.04, D / 2 - 0.005], { grain: "x" });
  b.glue(back, base, 40);
  for (const s of [sl, sr]) {
    b.glue(s, base, 30);
    b.glue(s, back, 30);
  }
  b.dowel(rail, sl, 1, 20);
  b.dowel(rail, sr, 1, 20);
  return finish(b);
}

/** Spice rack slot centres (x) and floor height. */
export const SPICE_SLOTS = { xs: [-0.12, -0.04, 0.04, 0.12], y: 0.012, z: 0.006 } as const;

/** Glass spice jar with a screw lid and ground spice inside (`soil`-like spill via stuffing paper). */
export function buildSpiceJar(o: ItemOpts & { spice?: number } = {}): AssemblyDef {
  const b = new Builder("spiceJar", "Spice Jar", "kitchenware", 4, o.seed);
  const s = shell(b, "jar", { profile: [[0.022, 0], [0.022, 0.085]], t: 0.0018, base: 0.004, segments: 6, mat: "glass", tint: 0xffffff });
  const fill = b.cyl("spice", "food", "food", 0.018, 0.05, [0, 0.004 + 0.025, 0], { segments: 6, tint: o.spice ?? 0xa4522a, mass: 0.04 });
  b.friction(fill, s.base, 1);
  const lid = b.cyl("lid", "plastic", "plastic", 0.023, 0.014, [0, 0.085 + 0.007, 0], { segments: 6, tint: 0x1d1d1f });
  bondTouching(b, lid, s.wall, "press", 4, 0.001);
  return finish(b);
}

// ============================================================================ bottles

export type BottleKind = "wine" | "whiteWine" | "oil" | "beer";

const BOTTLES: Record<BottleKind, { R: number; hb: number; hs: number; rn: number; hn: number; t: number; /** Glass mass carried by the wall tiles (the hollow body; base/shoulder/neck have their own). */ wallGlassKg: number; litres: number; rho: number; tint: number; liquid: number; seg: number }> = {
  wine: { R: 0.038, hb: 0.2, hs: 0.235, rn: 0.0145, hn: 0.07, t: 0.0035, wallGlassKg: 0.32, litres: 0.75, rho: 0.99, tint: 0x2c4a2e, liquid: 0x5a0f1e, seg: 6 },
  whiteWine: { R: 0.038, hb: 0.2, hs: 0.235, rn: 0.0145, hn: 0.07, t: 0.0035, wallGlassKg: 0.32, litres: 0.75, rho: 0.99, tint: 0x9aa56a, liquid: 0xd8cf8a, seg: 6 },
  oil: { R: 0.032, hb: 0.17, hs: 0.205, rn: 0.013, hn: 0.05, t: 0.0035, wallGlassKg: 0.27, litres: 0.5, rho: 0.92, tint: 0x6e7a2a, liquid: 0xa79a2a, seg: 6 },
  beer: { R: 0.031, hb: 0.12, hs: 0.165, rn: 0.0135, hn: 0.055, t: 0.003, wallGlassKg: 0.07, litres: 0.33, rho: 1.01, tint: 0x6b3d14, liquid: 0xd9a441, seg: 6 },
};
/** Overall height of a bottle (incl. cork/cap). */
export function bottleHeight(kind: BottleKind): number {
  const k = BOTTLES[kind];
  return k.hs + k.hn + (kind === "beer" ? 0.006 : 0.025);
}

/**
 * Glass bottle (wine 0.75 l, oil 0.5 l, beer 0.33 l): base disc, straight wall ring, shoulder ring,
 * solid neck and a cork / screw cap / crown cap. The wall tiles carry the hollow body's glass plus
 * the contents (full bottle), `liquid` on the base.
 */
export function buildBottle(o: { kind?: BottleKind; seed?: number } = {}): AssemblyDef {
  const kind = o.kind ?? "wine";
  const k = BOTTLES[kind];
  const oil = kind === "oil",
    beer = kind === "beer";
  const b = new Builder(oil ? "oilBottle" : beer ? "beerBottle" : "wineBottle", oil ? "Olive Oil Bottle" : beer ? "Beer Bottle" : "Wine Bottle", "kitchenware", oil ? 12 : beer ? 3 : 18, o.seed);
  const { R, hb, hs, rn, hn, t, tint } = k;
  const s = shell(b, "body", { profile: [[R, 0], [R, hb]], t, base: beer ? 0.005 : 0.006, segments: k.seg, mat: "glass", surf: "glass_dark", innerSurf: "glass_dark", tint, wallKg: k.wallGlassKg + k.litres * k.rho });
  const sh = b.lathe("shoulder", "glass", "glass_dark", "glass_dark", { profile: [[R, hb], [rn + 0.002, hs]], thickness: t, segments: k.seg, capBottom: false, tint, innerTint: tint, edgeSurf: "glass_edge" });
  for (const a of sh) bondTouching(b, a, s.wall, "fused", 30, 0.0015, 0);
  const neck = b.cyl("neck", "glass", "glass_dark", rn, hn + 0.004, [0, hs - 0.004 + (hn + 0.004) / 2, 0], { segments: k.seg, tint, capSurf: "glass_edge" });
  bondEachTouching(b, neck, sh, "fused", 25, 0.003);
  const cap = beer
    ? b.cyl("cap", "steel", "metal_painted", rn + 0.0005, 0.006, [0, hs + hn + 0.003, 0], { segments: k.seg, tint: 0xc9a227, mass: 0.002, tess: 0 })
    : b.cyl("cap", oil ? "plastic" : "softwood", oil ? "plastic" : "wood_pine", rn + 0.001, 0.025, [0, hs + hn + 0.0125, 0], { segments: k.seg, tint: oil ? 0x1d1d1f : 0x9a1f2a });
  b.press(cap, neck, beer ? 8 : 5);
  const lh = beer ? 0.06 : 0.08;
  const label = b.box("label", "paper", "label_bottle", [0.002, lh, beer ? 0.04 : 0.05], [R + 0.001, beer ? 0.06 : 0.09, 0], { mass: 0.002 });
  bondTouching(b, label, s.wall, "glue", 2, 0.003);
  b.liquid(s.base, k.liquid, k.litres);
  return finish(b);
}

// ============================================================================ pantry

/** Cereal box (cardboard, full: ~0.5 kg; cereal spills as paper/stuffing when torn). */
export function buildCerealBox(o: ItemOpts & { w?: number; h?: number; d?: number } = {}): AssemblyDef {
  const b = new Builder("cerealBox", "Cereal Box", "misc", 5, o.seed);
  const w = o.w ?? 0.19,
    h = o.h ?? 0.28,
    d = o.d ?? 0.07;
  const p = b.box("box", "cardboard", "label_food", [w, h, d], [0, h / 2, 0], { mass: 0.5, tint: o.tint, faces: { py: { surf: "cardboard" }, ny: { surf: "cardboard" } } });
  b.stuffing(p, "paper");
  return finish(b);
}

/** Food can (tinplate, full ~0.42 kg; dents). */
export function buildCan(o: ItemOpts & { r?: number; h?: number } = {}): AssemblyDef {
  const b = new Builder("can", "Canned Food", "misc", 2, o.seed);
  const r = o.r ?? 0.037,
    h = o.h ?? 0.11;
  b.cyl("can", "steelSheet", "label_food", r, h, [0, h / 2, 0], { segments: 10, capSurf: "metal_raw", mass: 0.42 * (r * r * h) / (0.037 * 0.037 * 0.11), tint: o.tint, tess: 0.03 });
  return finish(b);
}

// ============================================================================ cookware

/** Cast-iron skillet Ø 26 cm (~2.6 kg) — shatters rather than dents. */
export function buildSkillet(o: ItemOpts = {}): AssemblyDef {
  const b = new Builder("skillet", "Cast-Iron Skillet", "kitchenware", 40, o.seed);
  const s = shell(b, "pan", { profile: [[0.105, 0], [0.13, 0.048]], t: 0.0045, base: 0.0055, segments: 10, mat: "castIron", surf: "cast_iron", tint: 0xffffff });
  const handle = b.box("handle", "castIron", "cast_iron", [0.17, 0.018, 0.028], [0.13 + 0.073, 0.04, 0], { tint: 0xffffff });
  let n = 0;
  for (const w of s.wall) {
    const c = b.contact(handle, w, 0.006);
    if (c && (c.penetrating || c.kind === "face" || c.length > 0.004)) {
      b.fuse(handle, w);
      n++;
    }
  }
  if (!n) b.warn("skillet handle does not meet the pan");
  return finish(b);
}

/** Stainless saucepan Ø 18 cm with a lid resting on it (~1.4 kg). */
export function buildSaucepan(o: ItemOpts & { r?: number; h?: number; handles?: "long" | "loops" } = {}): AssemblyDef {
  const r = o.r ?? 0.09,
    h = o.h ?? 0.11;
  const loops = o.handles === "loops";
  const b = new Builder(loops ? "stockPot" : "saucepan", loops ? "Stock Pot" : "Saucepan", "kitchenware", loops ? 60 : 45, o.seed);
  // encapsulated base: 6 mm steel/aluminium sandwich disc, 1 mm walls (dent)
  const s = shell(b, "pot", { profile: [[r, 0], [r, h]], t: 0.001, base: 0.006, segments: 10, mat: "steelSheet", surf: "steel_brushed", innerSurf: "steel_brushed", baseKg: Math.PI * r * r * 0.006 * 4500 });
  const touchWall = (part: string, kind: "weld" | "fused", strength: number) => {
    let n = 0;
    for (const w of s.wall) {
      const c = b.contact(part, w, 0.004);
      if (c && (c.penetrating || c.kind === "face" || c.length > 0.003 || c.sep < -0.0005)) {
        b.bond(part, w, kind, { strength });
        n++;
      }
    }
    if (!n) b.warn(`${part} does not meet the pot wall`);
  };
  if (loops) {
    for (const sx of [-1, 1]) {
      const hp = b.tube(`handle${sx < 0 ? "l" : "r"}`, "steel", "steel_brushed", [[sx * (r - 0.001), h - 0.05, 0], [sx * (r + 0.03), h - 0.045, 0], [sx * (r + 0.03), h - 0.015, 0], [sx * (r - 0.001), h - 0.01, 0]], 0.005, { sides: 6, tess: 0 });
      for (const e of [hp[0], hp[hp.length - 1]]) touchWall(e, "weld", 60);
    }
  } else {
    const hl = b.tube("handle", "steel", "steel_brushed", [[r - 0.002, h - 0.025, 0], [r + 0.06, h - 0.005, 0], [r + 0.18, h + 0.02, 0]], 0.009, { sides: 6, tess: 0 });
    touchWall(hl[0], "weld", 80);
  }
  const lid = b.cyl("lid", "steelSheet", "steel_brushed", r + 0.004, 0.003, [0, h + 0.0015, 0], { segments: 10, rTop: r - 0.01 });
  const lk = b.cyl("lid_knob", "plastic", "plastic", 0.016, 0.02, [0, h + 0.003 + 0.01, 0], { segments: 8, tint: 0x1d1d1f });
  b.screw(lk, lid, 1, 20);
  bondTouching(b, lid, s.wall, "friction", 2, 0.001, 1);
  return finish(b);
}

// ============================================================================ groceries

/** Gable-top milk carton (1 l, full) with a `liquid` feature. */
export function buildMilkCarton(o: ItemOpts = {}): AssemblyDef {
  const b = new Builder("milkCarton", "Milk Carton", "misc", 2, o.seed);
  const w = 0.07,
    h = 0.195;
  const body = b.box("carton", "cardboard", "label_food", [w, h, w], [0, h / 2, 0], { mass: 1.0, tint: o.tint ?? 0xf3f3f6, faces: { ny: { surf: "cardboard" }, py: { surf: "cardboard" } } });
  const gable = b.prism("gable", "cardboard", "cardboard", [[-w / 2, 0], [w / 2, 0], [0, 0.035]], w, [0, h, 0], { mass: 0.01, tint: 0xf3f3f6 });
  b.glue(gable, body, 10);
  b.liquid(body, 0xf6f6f2, 1.0);
  return finish(b);
}

/** Glass jam jar with a steel lid. */
export function buildJar(o: ItemOpts = {}): AssemblyDef {
  const b = new Builder("jar", "Jam Jar", "misc", 4, o.seed);
  const s = shell(b, "jar", { profile: [[0.035, 0], [0.035, 0.1]], t: 0.0035, base: 0.006, segments: 8, mat: "glass", tint: 0xffffff });
  const fill = b.cyl("jam", "food", "food", 0.031, 0.07, [0, 0.006 + 0.035, 0], { segments: 8, tint: o.tint ?? 0x8e1730, mass: 0.28 });
  b.friction(fill, s.base, 1);
  const lid = b.cyl("lid", "steelSheet", "metal_painted", 0.036, 0.012, [0, 0.106, 0], { segments: 8, tint: 0xc9b25a, mass: 0.02 });
  bondTouching(b, lid, s.wall, "press", 6, 0.001);
  return finish(b);
}

/** Plastic juice bottle (1 l, full). */
export function buildJuiceBottle(o: ItemOpts = {}): AssemblyDef {
  const b = new Builder("juiceBottle", "Juice Bottle", "misc", 3, o.seed);
  const body = b.cyl("bottle", "plastic", "label_food", 0.042, 0.22, [0, 0.11, 0], { segments: 8, mass: 1.05, tint: o.tint ?? 0xffb347, capSurf: "plastic" });
  const cap = b.cyl("cap", "plastic", "plastic", 0.016, 0.025, [0, 0.2325, 0], { segments: 8, tint: 0x2e7d32, rTop: 0.016 });
  b.press(cap, body, 4);
  b.liquid(body, 0xf2a03a, 1.0);
  return finish(b);
}

/** Plastic food tub with a snap lid (leftovers, ~0.5 kg). */
export function buildFoodTub(o: ItemOpts & { w?: number; d?: number; h?: number } = {}): AssemblyDef {
  const b = new Builder("foodTub", "Food Container", "misc", 6, o.seed);
  const w = o.w ?? 0.17,
    d = o.d ?? 0.12,
    h = o.h ?? 0.07;
  const tub = b.box("tub", "plastic", "glass_frosted", [w, h, d], [0, h / 2, 0], { mass: 0.45, tint: 0xeef3f4 });
  const lid = b.box("lid", "plastic", "plastic", [w + 0.006, 0.008, d + 0.006], [0, h + 0.004, 0], { tint: o.tint ?? 0x2f6db5 });
  b.clip(lid, tub, 6);
  return finish(b);
}

export type ItemSurf = SurfaceName;
