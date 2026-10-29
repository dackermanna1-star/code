// Foyer furniture and small things: console table with a drawer, a framed wall mirror, a ceramic
// key bowl and a bunch of keys, a standing photo frame, a slatted shoe rack and shoes, a ceramic
// umbrella stand with two umbrellas, the door intercom and a solid-wood bench.
//
// Floor items: origin on the floor at the centre of the footprint, front +Z. Wall items
// (foyerMirror, intercom): origin on the wall plane at floor level, +Z out of the wall.

import { drawer, frameBars, pictureFrame, pcb, buttonGrid, cable } from "../lib/kit.ts";
import { boxR, bondOverlapping, bondTouching, finish, mk, panelBox, type BaseOpts } from "./helpers.ts";
import type { V3 } from "../lib/builder.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";

// =============================================================================================
// Console table
// =============================================================================================

export const CONSOLE_TABLE = { w: 0.8, d: 0.32, h: 0.78 } as const;

/** Hardwood console table: tapered legs, aprons, a drawer on runners, solid top. ~11 kg. */
export function buildConsoleTable(o: BaseOpts & { tint?: number } = {}): AssemblyDef {
  const b = mk("consoleTable", "Console Table", "furniture", 260, o);
  const { w: W, d: D, h: H } = CONSOLE_TABLE;
  const tint = o.tint ?? 0xffffff;
  const wood = { tint };
  const L = 0.036,
    tp = 0.026;
  const topT = 0.025;
  const legH = H - topT;
  const legs: Record<string, string> = {};
  for (const [k, sx, sz] of [
    ["fl", -1, 1],
    ["fr", 1, 1],
    ["bl", -1, -1],
    ["br", 1, -1],
  ] as Array<[string, number, number]>) {
    const ox = sx * (W / 2),
      oz = sz * (D / 2);
    const pts: V3[] = [];
    for (const [y, s] of [
      [0, tp],
      [legH - 0.1, L],
      [legH, L],
    ] as Array<[number, number]>)
      for (const [a, c] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ])
        pts.push([ox - sx * a * s, y, oz - sz * c * s]);
    legs[k] = b.hull(`leg_${k}`, "hardwood", "wood_walnut", pts, [0, 0, 0], { ...wood, grain: "y" });
  }
  const aT = 0.02;
  const aIn = 0.004;
  const yA0 = legH - 0.1;
  const back = boxR(b, "apron_b", "hardwood", "wood_walnut", [-W / 2 + L, W / 2 - L], [yA0, legH], [-D / 2 + aIn, -D / 2 + aIn + aT], { ...wood, grain: "x" });
  const left = boxR(b, "apron_l", "hardwood", "wood_walnut", [-W / 2 + aIn, -W / 2 + aIn + aT], [yA0, legH], [-D / 2 + L, D / 2 - L], { ...wood, grain: "z" });
  const right = boxR(b, "apron_r", "hardwood", "wood_walnut", [W / 2 - aIn - aT, W / 2 - aIn], [yA0, legH], [-D / 2 + L, D / 2 - L], { ...wood, grain: "z" });
  // front: rails above and below the drawer opening
  const zf0 = D / 2 - aIn - aT,
    zf1 = D / 2 - aIn;
  const railT = boxR(b, "rail_top", "hardwood", "wood_walnut", [-W / 2 + L, W / 2 - L], [legH - 0.018, legH], [zf0, zf1], { ...wood, grain: "x" });
  const railB = boxR(b, "rail_bot", "hardwood", "wood_walnut", [-W / 2 + L, W / 2 - L], [yA0, yA0 + 0.018], [zf0, zf1], { ...wood, grain: "x" });
  for (const [a, l1, l2] of [
    [back, legs.bl, legs.br],
    [left, legs.fl, legs.bl],
    [right, legs.fr, legs.br],
    [railT, legs.fl, legs.fr],
    [railB, legs.fl, legs.fr],
  ] as Array<[string, string, string]>) {
    b.dowel(a, l1, 2, 45);
    b.dowel(a, l2, 2, 45);
  }
  const top = boxR(b, "top", "hardwood", "wood_walnut", [-W / 2 - 0.01, W / 2 + 0.01], [legH, H], [-D / 2 - 0.005, D / 2 + 0.01], { ...wood, grain: "x" });
  for (const s of [back, left, right, railT]) b.screw(top, s, 2, 30);
  // drawer between the rails, runners screwed to the side aprons
  const dOpen = legH - 0.018 - (yA0 + 0.018);
  drawer(
    b,
    "drawer",
    {
      w: W - 2 * L - 0.012,
      h: dOpen - 0.012,
      d: D - 0.06,
      front: { w: W - 2 * L - 0.004, h: dOpen - 0.003, t: 0.018, mat: "hardwood", surf: "wood_walnut", tint },
      sideT: 0.012,
      mat: "plywood",
      surf: "plywood",
      fixed: [left, right],
      travel: 0.2,
      handle: { kind: "knob", mat: "copper", surf: "steel_brushed", tint: 0xd9b25e },
    },
    [0, yA0 + 0.018 + 0.0045, zf1 - 0.018],
  );
  return finish(b, o);
}

// =============================================================================================
// Wall mirror
// =============================================================================================

export interface FoyerMirrorOpts extends BaseOpts {
  bottomY?: number;
  w?: number;
  h?: number;
}

/** Framed wall mirror on two picture hooks: walnut frame, 4 mm silvered glass, MDF backing. ~6 kg. */
export function buildFoyerMirror(o: FoyerMirrorOpts = {}): AssemblyDef {
  const b = mk("foyerMirror", "Wall Mirror", "decor", 120, o);
  const w = o.w ?? 0.6,
    h = o.h ?? 0.8;
  const y0 = o.bottomY ?? 1.06;
  const depth = 0.028;
  const bar = 0.05;
  const fr = frameBars(b, "frame", { w, h, bar, depth, mat: "softwood", surf: "wood_walnut" }, [0, y0 + h / 2, 0]);
  const iw = fr.inner.x1 - fr.inner.x0,
    ih = fr.inner.y1 - fr.inner.y0;
  const zg = depth - 0.008;
  const glass = b.box("glass", "glass", "glass_edge", [iw, ih, 0.004], [0, y0 + h / 2, zg - 0.002], { faces: { pz: { surf: "mirror" } } });
  const backing = b.box("backing", "mdf", "mdf", [iw, ih, 0.004], [0, y0 + h / 2, zg - 0.006], {});
  b.glue(glass, backing, 40);
  for (const p of fr.all) b.clip(backing, p, 8);
  for (const p of fr.all) b.clip(glass, p, 4);
  // two D-rings (screwed into the side bars) on picture hooks
  b.world(fr.left, "nail", 18, [-w / 2 + bar / 2, y0 + h - 0.12, 0]);
  b.world(fr.right, "nail", 18, [w / 2 - bar / 2, y0 + h - 0.12, 0]);
  return finish(b, o);
}

// =============================================================================================
// Key bowl, keys, photo frame
// =============================================================================================

/** Shallow glazed ceramic catch-all bowl (Ø 19 cm). ~0.5 kg. */
export function buildKeyBowl(o: BaseOpts & { tint?: number } = {}): AssemblyDef {
  const b = mk("keyBowl", "Key Bowl", "decor", 25, o);
  b.lathe("bowl", "ceramic", "ceramic_glaze", "ceramic_glaze", {
    profile: [
      [0.055, 0],
      [0.085, 0.032],
      [0.095, 0.048],
    ],
    thickness: 0.006,
    segments: 10,
    capBottom: true,
    tint: o.tint ?? 0x3f6f74,
    innerTint: 0xe8e1d0,
  });
  return finish(b, o);
}

export const KEY_BOWL = { floorY: 0.006, floorR: 0.048 } as const;

/** A bunch of keys on a split ring with a leather fob, lying flat. ~70 g. */
export function buildKeyRing(o: BaseOpts = {}): AssemblyDef {
  const b = mk("keyRing", "Keys", "misc", 60, o);
  const ring = b.torus("ring", "steel", "chrome", 0.011, 0.0013, 6, 5, [0, 0.0013, 0], { mass: 0.004, seam: "weld", seamStrength: 20 });
  const fob = boxR(b, "fob", "rubber", "leather", [0.0125, 0.045], [0, 0.006], [-0.011, 0.011], { tint: 0x5a3a22, mass: 0.012 });
  const key1 = boxR(b, "key_house", "copper", "steel_brushed", [-0.042, -0.0125], [0, 0.0022], [-0.009, 0.009], { tint: 0xd9b25e, tess: 0 });
  const key2 = b.box("key_car", "steel", "chrome", [0.03, 0.0022, 0.012], [0.0, 0.0011, -0.0265], { rot: [0, 90, 0], tess: 0 });
  for (const p of [fob, key1, key2]) bondOverlapping(b, p, ring, "clip", 10, 0.003);
  return finish(b, o);
}

/** Standing photo frame (13 × 18 cm) leaning on its strut. */
export function buildPhotoFrame(o: BaseOpts & { tint?: number } = {}): AssemblyDef {
  const b = mk("photoFrame", "Photo Frame", "decor", 20, o);
  const w = 0.15,
    h = 0.2,
    depth = 0.015;
  const lean = 12;
  const s = Math.sin((lean * Math.PI) / 180),
    c = Math.cos((lean * Math.PI) / 180);
  // after leaning back by `lean`, the back-bottom edge is the lowest point
  const lift = (h / 2) * c;
  const pf = pictureFrame(b, "frame", { w, h, bar: 0.018, depth, mat: "softwood", surf: "wood_walnut", tint: o.tint, art: "photo_0", nail: false }, [0, lift, 0], [-lean, 0, 0]);
  // strut from the backing's back face (frame-local z = 0.003) down to the shelf behind the frame;
  // frame-local (y, z) → leaned: y' = y·cos + z·sin + lift, z' = −y·sin + z·cos
  const yl = 0.02,
    zl = depth - 0.012 - 0.0002;
  const yTopS = yl * c + zl * s + lift,
    zTopS = -yl * s + zl * c;
  const strut = b.hull(
    "strut",
    "mdf",
    "mdf",
    [
      [-0.01, yTopS, zTopS],
      [0.01, yTopS, zTopS],
      [-0.01, yTopS, zTopS - 0.004],
      [0.01, yTopS, zTopS - 0.004],
      [-0.01, 0, -0.075],
      [0.01, 0, -0.075],
      [-0.01, 0, -0.079],
      [0.01, 0, -0.079],
    ],
    [0, 0, 0],
    { tint: 0x3a2a1e, mass: 0.006 },
  );
  bondTouching(b, strut, [pf.backing], "glue", 6, 0.004);
  return finish(b, o);
}

// =============================================================================================
// Shoe rack + shoes
// =============================================================================================

export const SHOE_RACK = { w: 0.8, h: 0.45, d: 0.3, tops: [0.06, 0.25, 0.44] as readonly number[] } as const;

/** Two-tier slatted pine shoe rack: two side panels, three shelves of three slats each. ~6 kg. */
export function buildShoeRack(o: BaseOpts = {}): AssemblyDef {
  const b = mk("shoeRack", "Shoe Rack", "furniture", 45, o);
  const { w: W, h: H, d: D } = SHOE_RACK;
  const t = 0.018;
  const sideL = boxR(b, "side_l", "softwood", "wood_pine", [-W / 2, -W / 2 + t], [0, H], [-D / 2, D / 2], { grain: "y" });
  const sideR = boxR(b, "side_r", "softwood", "wood_pine", [W / 2 - t, W / 2], [0, H], [-D / 2, D / 2], { grain: "y" });
  SHOE_RACK.tops.forEach((yTop, s) => {
    for (let k = 0; k < 3; k++) {
      const z = (k - 1) * 0.1;
      const slat = boxR(b, `shelf${s}_slat${k}`, "softwood", "wood_pine", [-W / 2 + t, W / 2 - t], [yTop - 0.018, yTop], [z - 0.035, z + 0.035], { grain: "x" });
      b.screw(slat, sideL, 2, 30);
      b.screw(slat, sideR, 2, 30);
    }
  });
  return finish(b, o);
}

export interface ShoeOpts extends BaseOpts {
  kind?: "sneaker" | "leather" | "runner";
  /** Mirror for the left shoe of a pair. */
  side?: "left" | "right";
  tint?: number;
}

/** One shoe lying on its sole, toe +Z: rubber sole (+ heel block), hollow upper, laces/tongue texture. */
export function buildShoe(o: ShoeOpts = {}): AssemblyDef {
  const kind = o.kind ?? "sneaker";
  const b = mk("shoe", kind === "leather" ? "Leather Shoe" : kind === "runner" ? "Running Shoe" : "Sneaker", "soft", kind === "leather" ? 60 : 45, o);
  const m = (o.side ?? "right") === "left" ? -1 : 1;
  const L = kind === "leather" ? 0.285 : 0.29;
  const soleT = kind === "leather" ? 0.02 : kind === "runner" ? 0.03 : 0.025;
  // sole outline in plan (x, z): heel → arch → ball → toe, slight inside curve
  const outline: Array<[number, number]> = [
    [-0.03, -L / 2],
    [0.03, -L / 2],
    [0.038, -L / 2 + 0.05],
    [0.044, L / 2 - 0.08],
    [0.036, L / 2 - 0.02],
    [0.012, L / 2],
    [-0.016, L / 2],
    [-0.042, L / 2 - 0.05],
    [-0.04, -L / 2 + 0.05],
  ].map(([x, z]) => [x * m, z] as [number, number]);
  // flat moulded sole (dress shoes: a stacked leather-look sole with the heel as a texture step)
  const solePts: V3[] = [];
  for (const [x, z] of outline) {
    solePts.push([x, 0, z]);
    solePts.push([x, soleT, z]);
  }
  const sole = b.hull("sole", "rubber", "rubber", solePts, [0, 0, 0], { tint: kind === "leather" ? 0x2a1d14 : 0xf2f2ee, mass: kind === "leather" ? 0.2 : 0.18 });
  // upper: hull from the sole's top outline (inset) up to the collar and the toe box
  const up: V3[] = [];
  const ySole = (_z: number) => soleT;
  for (const [x, z] of outline) up.push([x * 0.96, ySole(z), z * 0.985]);
  const collarY = kind === "leather" ? 0.085 : 0.095;
  for (const [x, z] of [
    [-0.03, -L / 2 + 0.01],
    [0.03, -L / 2 + 0.01],
    [-0.035, -L / 2 + 0.09],
    [0.035, -L / 2 + 0.09],
  ])
    up.push([x * m, collarY, z]);
  for (const [x, z] of [
    [-0.03, L / 2 - 0.1],
    [0.03, L / 2 - 0.1],
  ])
    up.push([x * m, collarY - 0.02, z]);
  for (const [x, z] of [
    [-0.022, L / 2 - 0.03],
    [0.026, L / 2 - 0.03],
  ])
    up.push([x * m, ySole(L / 2) + 0.035, z]);
  const tint = o.tint ?? (kind === "leather" ? 0x5a3a22 : kind === "runner" ? 0x2a5ad8 : 0xe9e9e4);
  const upper = b.hull("upper", kind === "leather" ? "rubber" : "fabric", kind === "leather" ? "leather" : "fabric_cotton", up, [0, 0, 0], { tint, mass: kind === "leather" ? 0.2 : 0.14 });
  b.glue(upper, sole, 60);
  if (kind !== "leather") b.stuffing(upper, "foam");
  return finish(b, o);
}

// =============================================================================================
// Umbrella stand + umbrellas
// =============================================================================================

/** Glazed ceramic umbrella stand with two folded umbrellas leaning in it. ~5.5 kg. */
export function buildUmbrellaStand(o: BaseOpts & { tint?: number } = {}): AssemblyDef {
  const b = mk("umbrellaStand", "Umbrella Stand", "decor", 70, o);
  const H = 0.46;
  const stand = b.lathe("stand", "ceramic", "ceramic_glaze", "ceramic_glaze", {
    profile: [
      [0.095, 0],
      [0.11, H],
    ],
    thickness: 0.0065,
    segments: 8,
    capBottom: true,
    tint: o.tint ?? 0x34495e,
    innerTint: 0x2a3a4a,
  });
  const capTiles = stand.filter((p) => b.get(p).poly.verts.every((v) => v.y < 0.012));
  const floorY = 0.0066;
  for (const [k, sx, sz, tint] of [
    [0, 1, 0.022, 0x1b1b1d],
    [1, -1, -0.022, 0x8a2a2a],
  ] as Array<[number, number, number, number]>) {
    const lean = 6 * sx;
    const rad = (lean * Math.PI) / 180;
    // along the umbrella axis from its tip on the stand floor
    const ax = (s: number): [number, number, number] => [-sx * 0.03 + sx * Math.sin(Math.abs(rad)) * s, floorY + Math.cos(rad) * s, sz];
    const canopyC = ax(0.0016 + 0.33);
    const canopy = b.cyl(`umbrella${k}_canopy`, "fabric", "fabric_upholstery", 0.014, 0.66, canopyC, { rTop: 0.026, segments: 8, rot: [0, 0, -lean], tint, mass: 0.22 });
    const shaftC = ax(0.0016 + 0.71);
    const shaft = b.cyl(`umbrella${k}_shaft`, "steel", "chrome", 0.0045, 0.1, shaftC, { segments: 6, rot: [0, 0, -lean], mass: 0.02, tess: 0 });
    const handleC = ax(0.0016 + 0.8);
    const handle = b.cyl(`umbrella${k}_handle`, "hardwood", "wood_walnut", 0.013, 0.08, handleC, { segments: 8, rot: [0, 0, -lean], tint: 0xb07a4a, mass: 0.05 });
    b.glue(shaft, canopy, 30);
    b.glue(handle, shaft, 30);
    // the tip stands on the stand's floor: bond to the floor tile under it
    const tip = ax(0.0016);
    let best = capTiles[0],
      bd = Infinity;
    for (const t of capTiles) {
      const vs = b.get(t).poly.verts;
      const cx = vs.reduce((a, q) => a + q.x, 0) / vs.length,
        cz = vs.reduce((a, q) => a + q.z, 0) / vs.length;
      const dd = Math.hypot(cx - tip[0], cz - tip[2]);
      if (dd < bd) {
        bd = dd;
        best = t;
      }
    }
    b.bond(canopy, best, "friction", { strength: 2, anchor: [tip[0], floorY, tip[2]] });
  }
  return finish(b, o);
}

// =============================================================================================
// Intercom
// =============================================================================================

export interface IntercomOpts extends BaseOpts {
  /** Centre height of the base unit above the floor. */
  y?: number;
}

/** Apartment door intercom: wall base unit (PCB inside), speaker grille, buttons, handset on a hook switch with a coiled cord. */
export function buildIntercom(o: IntercomOpts = {}): AssemblyDef {
  const b = mk("intercom", "Door Intercom", "electronics", 90, o);
  const y = o.y ?? 1.45;
  const W = 0.14,
    H = 0.22,
    D = 0.035;
  const white = 0xeeeeea;
  const box = panelBox(b, "base", { w: W, h: H, d: D, t: 0.0025, mat: "plastic", surf: "plastic", tint: white, faces: { top: true }, faceSurf: { front: "plastic_glossy" }, bond: "fused", strength: 20 }, [0, y - H / 2, D / 2]);
  b.world(box.back!, "screw", 50, [0, y, 0]);
  pcb(b, "board", { w: 0.1, h: 0.12, components: [{ kind: "chip", x: 0.0, y: 0.02 }, { kind: "relay", x: -0.03, y: -0.03 }, { kind: "cap", x: 0.03, y: -0.035 }], mount: { to: box.back!, screws: 2, each: 8 }, sparks: 0.7 }, [0, y + 0.02, 0.0025 + 0.0016], undefined);
  // grille + buttons on the left half, handset parked on the right half
  const grille = boxR(b, "grille", "plastic", "speaker_grille", [-0.062, -0.012], [y + 0.03, y + 0.09], [D, D + 0.002], { tint: 0xffffff, mass: 0.004 });
  b.glue(grille, box.front!, 4);
  buttonGrid(b, "btn", { on: box.front!, rows: 2, cols: 1, size: [0.03, 0.012], pitch: [0.03, 0.02], tints: [0x2f8a3a, 0xd8d8d4] }, [-0.037, y - 0.06, D]);
  const hx = 0.032;
  const hsY0 = y - 0.1;
  const hook = boxR(b, "hook", "plastic", "plastic", [hx - 0.014, hx + 0.014], [hsY0 - 0.012, hsY0], [D, D + 0.042], { tint: white, mass: 0.005 });
  b.fuse(hook, box.front!, 20);
  const hs = b.bevelBox("handset", "plastic", "plastic_glossy", [0.05, 0.19, 0.035], 0.008, [hx, hsY0 + 0.095, D + 0.0185], { tint: white, mass: 0.16 });
  b.friction(hs, hook, 3);
  b.friction(hs, box.front!, 2);
  // coiled cord: a vertical lead out of the handset, a loose zigzag, then up into the unit's bottom
  const zc = D + 0.0185;
  const cx = hx + 0.019; // beside the hook switch
  const coil: V3[] = [
    [cx, hsY0 - 0.0005, zc],
    [cx, hsY0 - 0.025, zc],
  ];
  for (let k = 1; k <= 4; k++) coil.push([cx + (k % 2 ? 0.005 : -0.005), hsY0 - 0.025 - k * 0.022, zc - k * 0.003]);
  const yEnd = y - H / 2;
  coil.push([0.0, hsY0 - 0.025 - 5 * 0.022, D * 0.5]);
  coil.push([0.0, yEnd - 0.03, D * 0.5]);
  coil.push([0.0, yEnd - 0.0005, D * 0.5]);
  const cord = cable(b, "cord", coil, { r: 0.0035, kgPerM: 0.05, jointStrength: 12, tint: white, surf: "plastic" });
  bondTouching(b, cord[0], [hs], "clip", 10, 0.002);
  bondTouching(b, cord[cord.length - 1], [box.bottom!], "clip", 10, 0.002);
  return finish(b, o);
}

// =============================================================================================
// Bench
// =============================================================================================

export const FOYER_BENCH = { w: 1.0, h: 0.45, d: 0.35 } as const;

/** Solid oak bench: slab seat on two slab legs, a back apron and a low shoe shelf. ~16 kg. */
export function buildFoyerBench(o: BaseOpts & { tint?: number } = {}): AssemblyDef {
  const b = mk("foyerBench", "Wooden Bench", "furniture", 220, o);
  const { w: W, h: H, d: D } = FOYER_BENCH;
  const t = 0.03;
  const wood = { tint: o.tint ?? 0xffffff };
  const seat = boxR(b, "seat", "hardwood", "wood_oak", [-W / 2, W / 2], [H - t, H], [-D / 2, D / 2], { ...wood, grain: "x" });
  const legX = W / 2 - 0.07;
  const legL = boxR(b, "leg_l", "hardwood", "wood_oak", [-legX - t, -legX], [0, H - t], [-D / 2 + 0.01, D / 2 - 0.01], { ...wood, grain: "y" });
  const legR = boxR(b, "leg_r", "hardwood", "wood_oak", [legX, legX + t], [0, H - t], [-D / 2 + 0.01, D / 2 - 0.01], { ...wood, grain: "y" });
  const apron = boxR(b, "apron", "hardwood", "wood_oak", [-legX, legX], [H - t - 0.08, H - t], [-D / 2 + 0.03, -D / 2 + 0.05], { ...wood, grain: "x" });
  const shelf = boxR(b, "shelf", "hardwood", "wood_oak", [-legX, legX], [0.1, 0.12], [-D / 2 + 0.03, D / 2 - 0.03], { ...wood, grain: "x" });
  b.dowel(seat, legL, 3, 45);
  b.dowel(seat, legR, 3, 45);
  b.dowel(apron, legL, 2, 40);
  b.dowel(apron, legR, 2, 40);
  b.glue(apron, seat, 60);
  b.dowel(shelf, legL, 2, 40);
  b.dowel(shelf, legR, 2, 40);
  return finish(b, o);
}
