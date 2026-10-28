// Bathroom accessories: wall-mounted chrome hardware with soft goods, small loose items you can
// grab and throw, the floor scale, the bath mat and the ceiling extractor fan.
//
// Wall-mounted items (towelRing, towelRack, toiletPaperHolder): origin on the wall plane at
// floor level, x along the wall, +Z out of the wall; mounting height is an option.
// exhaustFan: origin on the ceiling plane, the unit hangs below it (−Y).
// Loose items: origin at the centre of their base, sitting on y = 0.

import { torusTiles } from "../../geom/primitives.ts";
import { polyFromHull } from "../../geom/poly.ts";
import { v3 } from "../../geom/vec.ts";
import { pcb, spokeRot } from "../lib/kit.ts";
import { boxR, bondTouching, finish, mk, plasticBottle, roundedPrismPoints, SOFT_SEAM, CHROME, type BaseOpts } from "../utility/helpers.ts";
import type { Builder } from "../lib/builder.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";

// =============================================================================================
// Wall hardware with towels / paper
// =============================================================================================

export interface TowelRingOpts extends BaseOpts {
  /** Height of the ring's top (arm) above the floor. */
  y?: number;
  towelTint?: number;
}

/** Chrome towel ring on a wall rose with a hand towel drawn through it. ~0.5 kg. */
export function buildTowelRing(o: TowelRingOpts = {}): AssemblyDef {
  const b = mk("towelRing", "Towel Ring", "decor", 35, o);
  const y = o.y ?? 1.15;
  const rose = b.cyl("rose", CHROME.mat, CHROME.surf, 0.027, 0.012, [0, y, 0.006], { axis: "z", segments: 14, mass: 0.08 });
  b.world(rose, "screw", 50, [0, y, 0]);
  const arm = b.cyl("arm", CHROME.mat, CHROME.surf, 0.008, 0.045, [0, y, 0.012 + 0.0225], { axis: "z", segments: 8, mass: 0.04 });
  b.screw(arm, rose, 1, 40);
  // vertical ring (torus in the wall-parallel plane) hanging from the arm's end
  const R = 0.08,
    r = 0.0055;
  const ringZ = 0.012 + 0.045 + r;
  // 12 segments: the top and bottom of the ring are tile vertices (the arm and towel touch them)
  const tiles = torusTiles(R, r, 12, 6, b.attr(CHROME.surf, 0xffffff, 1));
  const ring = b.addTiles("ring", CHROME.mat, tiles, [0, y - R + 0.002, ringZ], { rot: [90, 0, 0], mass: 0.18, seam: "weld", seamStrength: 80 });
  bondTouching(b, arm, ring, "weld", 60, 0.004);
  // hand towel through the ring: a fold under the ring's bottom and two hanging panels
  const tt = o.towelTint ?? 0x6f8fa8;
  let yb = Infinity; // underside of the ring (measured)
  for (const t of ring) for (const v of b.get(t).poly.verts) yb = Math.min(yb, v.y);
  yb += 0.0012; // the fold hugs the ring (slight interpenetration = it is wrapped around it)
  const fold = boxR(b, "towel_fold", "fabric", "fabric_cotton", [-0.14, 0.14], [yb - 0.012, yb], [ringZ - 0.014, ringZ + 0.014], { tint: tt, mass: 0.02 });
  const front = boxR(b, "towel_front", "fabric", "fabric_cotton", [-0.14, 0.14], [yb - 0.3, yb - 0.012], [ringZ + 0.008, ringZ + 0.014], { tint: tt, mass: 0.07 });
  const backP = boxR(b, "towel_back", "fabric", "fabric_cotton", [-0.14, 0.14], [yb - 0.24, yb - 0.012], [ringZ - 0.014, ringZ - 0.008], { tint: tt, mass: 0.06 });
  b.glue(front, fold, SOFT_SEAM);
  b.glue(backP, fold, SOFT_SEAM);
  // hangs on the ring's lowest tiles
  const low = ring.filter((t) => b.get(t).poly.verts.some((v) => v.y < yb + 0.0005));
  for (const t of low) b.friction(fold, t, 6 / Math.max(1, low.length));
  return finish(b, o);
}

export interface TowelRackOpts extends BaseOpts {
  y?: number;
  len?: number;
  towelTint?: number;
}

/** Chrome towel bar on two posts with a folded bath towel draped over it. ~1.3 kg. */
export function buildTowelRack(o: TowelRackOpts = {}): AssemblyDef {
  const b = mk("towelRack", "Towel Rack", "decor", 45, o);
  const y = o.y ?? 1.15;
  const L = o.len ?? 0.6;
  const zBar = 0.07;
  const posts: string[] = [];
  for (const [k, x] of [
    ["l", -L / 2 + 0.03],
    ["r", L / 2 - 0.03],
  ] as Array<[string, number]>) {
    const rose = b.cyl(`rose_${k}`, CHROME.mat, CHROME.surf, 0.025, 0.01, [x, y, 0.005], { axis: "z", segments: 12, mass: 0.06 });
    const post = b.cyl(`post_${k}`, CHROME.mat, CHROME.surf, 0.011, zBar - 0.01, [x, y, 0.01 + (zBar - 0.01) / 2], { axis: "z", segments: 10, mass: 0.08 });
    b.world(rose, "screw", 45, [x, y, 0]);
    b.screw(post, rose, 1, 40);
    posts.push(post);
  }
  const bar = b.cyl("bar", CHROME.mat, CHROME.surf, 0.0095, L, [0, y, zBar + 0.0095], { axis: "x", segments: 10, mass: 0.22 });
  for (const p of posts) b.screw(bar, p, 1, 45);
  // bath towel folded in thirds and hung over the bar
  const tt = o.towelTint ?? 0xe9e2d4;
  const zc = zBar + 0.0095;
  const top = y + 0.0095;
  const tw = L / 2 - 0.07;
  const fold = boxR(b, "towel_fold", "fabric", "fabric_cotton", [-tw, tw], [top, top + 0.014], [zc - 0.016, zc + 0.016], { tint: tt, mass: 0.06 });
  const front = boxR(b, "towel_front", "fabric", "fabric_cotton", [-tw, tw], [top - 0.46, top], [zc + 0.01, zc + 0.016], { tint: tt, mass: 0.26 });
  const backP = boxR(b, "towel_back", "fabric", "fabric_cotton", [-tw, tw], [top - 0.4, top], [zc - 0.016, zc - 0.01], { tint: tt, mass: 0.22 });
  b.glue(front, fold, SOFT_SEAM);
  b.glue(backP, fold, SOFT_SEAM);
  b.friction(fold, bar, 6);
  return finish(b, o);
}

export interface PaperHolderOpts extends BaseOpts {
  y?: number;
}

/** Chrome toilet-roll holder (rose, arm, spindle) with a paper roll hanging on it. ~0.4 kg. */
export function buildToiletPaperHolder(o: PaperHolderOpts = {}): AssemblyDef {
  const b = mk("toiletPaperHolder", "Toilet Paper Holder", "decor", 25, o);
  const y = o.y ?? 0.72;
  const rose = b.cyl("rose", CHROME.mat, CHROME.surf, 0.026, 0.012, [0, y, 0.006], { axis: "z", segments: 14, mass: 0.08 });
  b.world(rose, "screw", 45, [0, y, 0]);
  const zArm = 0.012 + 0.065;
  const arm = b.cyl("arm", CHROME.mat, CHROME.surf, 0.008, 0.065, [0, y, 0.012 + 0.0325], { axis: "z", segments: 8, mass: 0.05 });
  b.screw(arm, rose, 1, 40);
  // spindle sideways from the arm's tip (an L-holder, the roll slides on from the free end)
  const spLen = 0.13;
  const spindle = b.cyl("spindle", CHROME.mat, CHROME.surf, 0.008, spLen, [0.008 + spLen / 2, y, zArm - 0.008], { axis: "x", segments: 8, mass: 0.05 });
  b.weld(spindle, arm, 60);
  // the roll: paper ring tiles around the spindle, resting on it (inner radius 21 mm)
  const ro = 0.055,
    ri = 0.021;
  const rollX = 0.008 + spLen / 2 + 0.005;
  const roll = b.lathe("roll", "paper", "paper", "cardboard", {
    profile: [
      [ro, -0.049],
      [ro, 0.049],
    ],
    thickness: ro - ri,
    segments: 8,
    pos: [rollX, y - (ri - 0.008) - 0.0005, zArm - 0.008],
    rot: [0, 0, -90],
    mass: 0.11,
    seam: "glue",
    seamStrength: 4,
    edgeSurf: "paper",
    tint: 0xfbfaf6,
  });
  bondTouching(b, spindle, roll, "friction", 3, 0.0015);
  return finish(b, o);
}

// =============================================================================================
// Loose items
// =============================================================================================

export interface CupOpts extends BaseOpts {
  tint?: number;
  brushes?: number;
}

/** Ceramic toothbrush cup with two toothbrushes leaning in it. ~0.3 kg. */
export function buildToothbrushCup(o: CupOpts = {}): AssemblyDef {
  const b = mk("toothbrushCup", "Toothbrush Cup", "decor", 15, o);
  const tint = o.tint ?? 0xdfe8e4;
  const cup = b.lathe("cup", "ceramic", "ceramic_glaze", "ceramic_glaze", {
    profile: [
      [0.031, 0],
      [0.035, 0.1],
    ],
    thickness: 0.0045,
    segments: 8,
    capBottom: true,
    tint,
  });
  const base = cup.reduce((best, p) => (b.get(p).poly.verts.every((v) => v.y < 0.012) ? p : best), cup[0]);
  const n = o.brushes ?? 2;
  const tints = [0x2f7fd0, 0xe0503a, 0x47a35a];
  for (let k = 0; k < n; k++) {
    const side = k % 2 === 0 ? -1 : 1;
    const tilt = 8 * side;
    // handle from the cup floor leaning across, the head standing out above the rim
    const g = (h: number) => [side * -0.012 + Math.sin((-tilt * Math.PI) / 180) * h, 0.0046 + Math.cos((tilt * Math.PI) / 180) * h, (k - (n - 1) / 2) * 0.012] as [number, number, number];
    const c = g(0.09);
    const handle = b.box(`brush${k}_handle`, "plastic", "plastic_glossy", [0.011, 0.18, 0.007], c, { rot: [0, 0, tilt], tint: tints[k % tints.length], mass: 0.014 });
    const hc = g(0.17);
    const head = b.box(`brush${k}_bristles`, "plastic", "plastic", [0.009, 0.022, 0.011], [hc[0], hc[1], hc[2] + 0.009], { rot: [0, 0, tilt], tint: 0xf4f4f4, mass: 0.003 });
    b.glue(head, handle, 10);
    b.friction(handle, base, 2);
  }
  return finish(b, o);
}

/** Pump soap dispenser (plastic, 250 ml of liquid soap). */
export function buildSoapDispenser(o: BaseOpts & { tint?: number } = {}): AssemblyDef {
  const b = mk("soapDispenser", "Soap Dispenser", "decor", 8, o);
  plasticBottle(b, "bottle", {
    w: 0.07,
    d: 0.05,
    h: 0.125,
    r: 0.02,
    bodyTint: o.tint ?? 0xe8d9b8,
    label: "label_bottle",
    cap: { r: 0.014, h: 0.016, tint: 0xf0f0ee, kind: "pump" },
    liquid: { color: 0xd8b86a, litres: 0.25 },
    kg: 0.33,
  });
  return finish(b, o);
}

export interface ShampooOpts extends BaseOpts {
  kind?: "shampoo" | "conditioner" | "gel";
}

/** Squeeze bottle of shampoo / conditioner / shower gel with a flip cap (liquid feature). */
export function buildShampooBottle(o: ShampooOpts = {}): AssemblyDef {
  const kind = o.kind ?? "shampoo";
  const look = { shampoo: [0x2a6fb5, 0xf2f2f2, 0x8fc3e8], conditioner: [0xf2efe6, 0x2a2a2a, 0xf5ebd0], gel: [0x3a9a5c, 0x1f1f1f, 0x5fcf8a] }[kind];
  const b = mk("shampooBottle", "Shampoo Bottle", "misc", 6, o);
  plasticBottle(b, "bottle", {
    w: 0.064,
    d: 0.04,
    h: 0.19,
    r: 0.018,
    shoulder: 0.82,
    shoulderH: 0.02,
    bodyTint: look[0],
    label: "label_bottle",
    cap: { r: 0.016, h: 0.022, tint: look[1], kind: "flip" },
    liquid: { color: look[2], litres: 0.35 },
    kg: 0.4,
  });
  return finish(b, o);
}

export interface ToiletryOpts extends BaseOpts {
  kind?: "pills" | "perfume" | "cream";
}

/** Small toiletry for shelves: pill bottle, glass perfume flacon or cream jar. */
export function buildToiletryBottle(o: ToiletryOpts = {}): AssemblyDef {
  const kind = o.kind ?? "pills";
  const b = mk("toiletryBottle", kind === "perfume" ? "Perfume" : kind === "cream" ? "Face Cream" : "Pill Bottle", "misc", kind === "perfume" ? 60 : 8, o);
  if (kind === "pills") {
    const body = b.cyl("body", "plastic", "plastic_glossy", 0.021, 0.07, [0, 0.035, 0], { segments: 10, tint: 0xd9822b, mass: 0.05 });
    const cap = b.cyl("cap", "plastic", "plastic", 0.0225, 0.016, [0, 0.078, 0], { segments: 10, tint: 0xf4f4f2, mass: 0.006 });
    const label = b.box("label", "paper", "label_bottle", [0.03, 0.04, 0.0006], [0, 0.035, 0.0213], { mass: 0.001 });
    b.press(cap, body, 6);
    b.glue(label, body, 3);
  } else if (kind === "perfume") {
    const body = b.hull("body", "glass", "glass", roundedPrismPoints(0.055, 0.075, 0.032, 0.006, 2, 0), [0, 0, 0], { tint: 0xf2d9b0 });
    const neck = b.cyl("neck", CHROME.mat, CHROME.surf, 0.008, 0.012, [0, 0.081, 0], { segments: 8, mass: 0.008 });
    const cap = b.cyl("cap", "plastic", "plastic_glossy", 0.016, 0.03, [0, 0.102, 0], { segments: 10, tint: 0x1d1d1f, mass: 0.02 });
    b.glue(neck, body, 12);
    b.press(cap, neck, 4);
    b.liquid(body, 0xe8c070, 0.05);
  } else {
    const jar = b.cyl("jar", "plastic", "plastic_glossy", 0.034, 0.04, [0, 0.02, 0], { segments: 12, tint: 0xf3eee8, mass: 0.09 });
    const lid = b.cyl("lid", "plastic", "plastic_glossy", 0.035, 0.016, [0, 0.048, 0], { segments: 12, tint: 0xc9a46a, mass: 0.015 });
    b.press(lid, jar, 5);
  }
  return finish(b, o);
}

/** Hair dryer lying on its side: hollow housing shell, motor + heater inside, handle, cord. ~0.55 kg. */
export function buildHairDryer(o: BaseOpts & { tint?: number } = {}): AssemblyDef {
  const b = mk("hairDryer", "Hair Dryer", "electronics", 40, o);
  const tint = o.tint ?? 0x262628;
  const R = 0.04;
  const len = 0.16;
  // housing: plastic shell of revolution about X, resting on the counter
  const shell = b.lathe("housing", "plastic", "plastic_glossy", "plastic", {
    profile: [
      [R, -len / 2],
      [R, len / 2],
    ],
    thickness: 0.003,
    segments: 8,
    pos: [0, R, 0],
    rot: [0, 0, -90],
    tint,
    mass: 0.16,
  });
  const grille = b.cyl("grille", "plastic", "vent_grille", R - 0.002, 0.004, [-len / 2 - 0.002, R, 0], { axis: "x", segments: 12, tint: 0x3a3a3c, mass: 0.015 });
  const nozzle = b.cyl("nozzle", "plastic", "plastic", R - 0.0015, 0.055, [len / 2 + 0.0275, R, 0], { axis: "x", rTop: R * 0.55, segments: 8, tint, mass: 0.035 });
  for (const t of [grille, nozzle]) bondTouching(b, t, shell, "clip", 12, 0.003);
  // inside: a plastic bulkhead spider holding the motor + fan, then the heater coil frame (mica)
  const rBulk = R - 0.003 - 0.0002; // aligned octagon: its sides sit 0.2 mm inside the shell's 8 inner faces
  const bulk = b.cyl("bulkhead", "plastic", "plastic", rBulk, 0.004, [-0.067, R, 0], { axis: "x", segments: 8, tint: 0x3a3a3c, mass: 0.01 });
  bondTouching(b, bulk, shell, "clip", 24, 0.0015);
  const motor = b.cyl("motor", "copper", "copper", 0.018, 0.04, [-0.045, R, 0], { axis: "x", segments: 10, mass: 0.09 });
  b.screw(motor, bulk, 2, 12);
  const heater = boxR(b, "heater", "steel", "metal_raw", [-0.025, 0.06], [R - 0.022, R + 0.022], [-0.022, 0.022], { mass: 0.05 });
  b.screw(heater, motor, 1, 15);
  b.sparks(motor, 0.6);
  // handle lying flat towards −Z (hollow moulding) with a press-fit switch
  const handle = boxR(b, "handle", "plastic", "plastic_glossy", [-0.02, 0.016], [0, 0.03], [-0.165, -R + 0.004], { tint, mass: 0.11 });
  bondTouching(b, handle, shell, "fused", 40, 0.004);
  const sw = boxR(b, "switch", "plastic", "plastic", [-0.008, 0.006], [0.03, 0.035], [-0.09, -0.07], { tint: 0x9a9a9a, mass: 0.004 });
  b.press(sw, handle, 2);
  // cord out of the handle's end, coiled loosely on the counter
  const relief = b.cyl("cord_relief", "rubber", "rubber", 0.006, 0.02, [-0.002, 0.012, -0.175], { axis: "z", segments: 8, tint: 0x1b1b1b });
  b.clip(relief, handle, 20);
  const cord = b.tube(
    "cord",
    "copper",
    "rubber",
    [
      [-0.002, 0.004, -0.185],
      [0.03, 0.0035, -0.24],
      [0.11, 0.0035, -0.25],
      [0.16, 0.0035, -0.2],
    ],
    0.0035,
    { sides: 6, tint: 0x1b1b1b, kgPerM: 0.05, jointStrength: 35 },
  );
  b.fuse(cord[0], relief, 35);
  b.sparks(cord[0], 0.3);
  return finish(b, o);
}

/** Small open plastic bathroom bin with a couple of crumpled tissues in it. ~0.5 kg. */
export function buildBathBin(o: BaseOpts & { tint?: number } = {}): AssemblyDef {
  const b = mk("bathBin", "Bathroom Bin", "misc", 12, o);
  const bin = b.lathe("bin", "plastic", "plastic_glossy", "plastic", {
    profile: [
      [0.1, 0],
      [0.118, 0.27],
    ],
    thickness: 0.003,
    segments: 8,
    capBottom: true,
    tint: o.tint ?? 0xeceae5,
  });
  const base = bin.reduce((best, p) => (b.get(p).poly.verts.every((v) => v.y < 0.006) ? p : best), bin[0]);
  for (const [k, x, z, r] of [
    [0, -0.03, 0.01, 0.028],
    [1, 0.03, -0.02, 0.022],
  ] as Array<[number, number, number, number]>) {
    const t = b.ellipsoid(`tissue${k}`, "paper", "paper", [r, r * 0.8, r * 0.9], [x, 0.0031 + r * 0.8, z], { tint: 0xfafaf6, mass: 0.004, segments: 7, rings: 4 });
    b.friction(t, base, 1);
  }
  return finish(b, o);
}

/** Digital bathroom scale: toughened glass top on a plastic pan, load-cell feet, LCD, PCB. ~1.6 kg. */
export function buildBathScale(o: BaseOpts = {}): AssemblyDef {
  const b = mk("bathScale", "Bathroom Scale", "electronics", 30, o);
  const S = 0.3;
  const feetH = 0.006;
  const panT = 0.003;
  const wallH = 0.016;
  const feet: string[] = [];
  for (const [k, sx, sz] of [
    [0, -1, -1],
    [1, 1, -1],
    [2, -1, 1],
    [3, 1, 1],
  ] as Array<[number, number, number]>) {
    feet.push(boxR(b, `foot${k}`, "aluminum", "aluminum", [sx * 0.13 - 0.015, sx * 0.13 + 0.015], [0, feetH], [sz * 0.13 - 0.015, sz * 0.13 + 0.015], { tess: 0, mass: 0.03 }));
  }
  const pan = boxR(b, "pan", "plastic", "plastic", [-S / 2 + 0.005, S / 2 - 0.005], [feetH, feetH + panT], [-S / 2 + 0.005, S / 2 - 0.005], { tint: 0x2c2c2e });
  for (const f of feet) b.screw(f, pan, 1, 20);
  const walls: string[] = [];
  const y0 = feetH + panT;
  const i = S / 2 - 0.005;
  walls.push(boxR(b, "rim_f", "plastic", "plastic", [-i, i], [y0, y0 + wallH], [i - 0.003, i], { tint: 0x2c2c2e }));
  walls.push(boxR(b, "rim_b", "plastic", "plastic", [-i, i], [y0, y0 + wallH], [-i, -i + 0.003], { tint: 0x2c2c2e }));
  walls.push(boxR(b, "rim_l", "plastic", "plastic", [-i, -i + 0.003], [y0, y0 + wallH], [-i + 0.003, i - 0.003], { tint: 0x2c2c2e }));
  walls.push(boxR(b, "rim_r", "plastic", "plastic", [i - 0.003, i], [y0, y0 + wallH], [-i + 0.003, i - 0.003], { tint: 0x2c2c2e }));
  for (const w of walls) b.fuse(w, pan, 20);
  const yTop = y0 + wallH;
  const glass = boxR(b, "glass", "temperedGlass", "glass_dark", [-S / 2, S / 2], [yTop, yTop + 0.006], [-S / 2, S / 2], {
    faces: { px: { surf: "glass_edge" }, nx: { surf: "glass_edge" }, pz: { surf: "glass_edge" }, nz: { surf: "glass_edge" } },
  });
  for (const w of walls) b.glue(glass, w, 15);
  // display on a standoff just under the glass at the front
  const lcd = boxR(b, "lcd", "lcd", "plastic", [-0.035, 0.035], [yTop - 0.004, yTop], [0.09, 0.12], { tint: 0x101010, faces: { py: { surf: "display_blue" } } });
  const standoff = boxR(b, "lcd_mount", "plastic", "plastic", [-0.03, 0.03], [y0, yTop - 0.004], [0.095, 0.115], { tint: 0x2c2c2e });
  b.glue(lcd, standoff, 6);
  b.fuse(standoff, pan, 10);
  pcb(b, "board", { w: 0.06, h: 0.04, components: [{ kind: "chip", x: 0, y: 0.005 }, { kind: "cap", x: 0.022, y: -0.01 }], mount: { to: pan, screws: 2, each: 8 }, sparks: 0.5 }, [0, y0 + 0.0016, 0.03], [-90, 0, 0]);
  const battery = b.cyl("battery", "steel", "metal_raw", 0.01, 0.0032, [-0.07, y0 + 0.0016, -0.06], { segments: 10, mass: 0.003 }); // CR2032 coin cell
  b.clip(battery, pan, 4);
  return finish(b, o);
}

/** Bath mat (cotton pile, rubber-free). */
export function buildBathMat(o: BaseOpts & { tint?: number; w?: number; d?: number } = {}): AssemblyDef {
  const b = mk("bathMat", "Bath Mat", "soft", 20, o);
  const w = o.w ?? 0.8,
    d = o.d ?? 0.5;
  b.pillow("mat", "fabric", "fabric_cotton", [w, 0.012, d], 0.25, [0, 0.006, 0], { tint: o.tint ?? 0x8aa6b8, mass: 0.6 });
  return finish(b, o);
}

// =============================================================================================
// Ceiling extractor fan
// =============================================================================================

export interface FanOpts extends BaseOpts {
  /** Impeller speed (rad/s); 0 = not running. */
  speed?: number;
}

/**
 * Surface-mounted bathroom extractor (200 × 200 mm): plastic housing screwed to the ceiling,
 * snap-on grille, a small shaded-pole motor with a five-blade impeller on a powered hinge, and
 * the control board. Origin on the ceiling plane; the unit hangs to y = −0.087.
 */
export function buildExhaustFan(o: FanOpts = {}): AssemblyDef {
  const b = mk("exhaustFan", "Extractor Fan", "fixture", 60, o);
  const S = 0.2;
  const H = 0.072;
  const t = 0.003;
  const white = 0xf2f1ec;
  const plate = boxR(b, "plate", "plastic", "plastic", [-S / 2, S / 2], [-0.004, 0], [-S / 2, S / 2], { tint: white });
  b.world(plate, "screw", 50, [0, 0, 0]);
  const walls = [
    boxR(b, "wall_f", "plastic", "plastic", [-S / 2, S / 2], [-H, -0.004], [S / 2 - t, S / 2], { tint: white }),
    boxR(b, "wall_b", "plastic", "plastic", [-S / 2, S / 2], [-H, -0.004], [-S / 2, -S / 2 + t], { tint: white }),
    boxR(b, "wall_l", "plastic", "plastic", [-S / 2, -S / 2 + t], [-H, -0.004], [-S / 2 + t, S / 2 - t], { tint: white }),
    boxR(b, "wall_r", "plastic", "plastic", [S / 2 - t, S / 2], [-H, -0.004], [-S / 2 + t, S / 2 - t], { tint: white }),
  ];
  for (const w of walls) b.fuse(w, plate, 25);
  b.fuse(walls[0], walls[2], 15);
  b.fuse(walls[0], walls[3], 15);
  b.fuse(walls[1], walls[2], 15);
  b.fuse(walls[1], walls[3], 15);
  const grille = boxR(b, "grille", "plastic", "plastic", [-S / 2 - 0.01, S / 2 + 0.01], [-H - 0.012, -H], [-S / 2 - 0.01, S / 2 + 0.01], {
    tint: white,
    faces: { ny: { surf: "vent_grille", tint: 0xe9e8e2 } },
    mass: 0.09,
  });
  for (const w of walls) b.clip(grille, w, 5);
  // motor under the plate, impeller below it on a powered hinge
  const motor = b.cyl("motor", "steel", "metal_raw", 0.028, 0.03, [0, -0.004 - 0.015, 0], { segments: 10, mass: 0.22 });
  b.screw(motor, plate, 2, 20);
  const hub = b.cyl("impeller_hub", "plastic", "plastic", 0.018, 0.016, [0, -0.034 - 0.008, 0], { segments: 10, tint: 0x8a8a86, mass: 0.02 });
  const blades: string[] = [];
  b.group([0, -0.042, 0], undefined, "impeller_", () => {
    for (let k = 0; k < 5; k++) {
      const a = 72 * k;
      const r = 0.018 + 0.03;
      blades.push(
        b.box(`blade${k}`, "plastic", "plastic", [0.06, 0.012, 0.0025], [r * Math.cos((a * Math.PI) / 180), 0, r * Math.sin((a * Math.PI) / 180)], {
          rot: spokeRot("y", -a, 30),
          tint: 0x8a8a86,
          mass: 0.006,
        }),
      );
    }
  });
  for (const bl of blades) bondTouching(b, bl, [hub], "fused", 8, 0.004);
  const g = b.hinge(hub, motor, { pivots: [[0, -0.034, 0]], axis: [0, 1, 0], min: -1e6, max: 1e6, strength: 25, friction: 0.02 });
  if ((o.speed ?? 28) > 0) b.motor(motor, g, o.speed ?? 28, true);
  pcb(b, "ctrl", { w: 0.05, h: 0.035, components: [{ kind: "relay", x: -0.01, y: 0 }, { kind: "cap", x: 0.015, y: 0.005 }], mount: { to: walls[2], screws: 2, each: 8 }, sparks: 0.6 }, [-S / 2 + t + 0.0016, -0.04, 0], [0, 90, 0]);
  return finish(b, o);
}

void polyFromHull;
void v3;
export type { Builder };
