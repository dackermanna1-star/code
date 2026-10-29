// Bedroom decor: framed print (hangs on a nail), cheval floor mirror (tilting mirror between two
// footed uprights), paper posters (taped/pinned to the wall), beanbag, laundry basket.
// Wall items: origin at the bottom centre of their back face (the wall plane), front +Z.
// Floor items: origin on the floor at the centre, front +Z. PURE MODULE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { glassPaneInFrame, pictureFrame } from "../lib/kit.ts";
import { boxR, finish, mk, PAL, type BaseOpts } from "./common.ts";

// ------------------------------------------------------------------ framed print

export interface FramedPrintOpts extends BaseOpts {
  w?: number;
  h?: number;
  art?: SurfaceName;
}

export const FRAME_DEPTH = 0.022;

/** Walnut-framed print behind 2 mm glass on a hardboard back, hung on a picture nail (weak world bond). */
export function buildFramedPrint(o: FramedPrintOpts = {}): AssemblyDef {
  const w = o.w ?? 0.9,
    h = o.h ?? 0.62;
  const b = mk("framedPrint", "Framed Print", "decor", 75, o);
  pictureFrame(b, "print", { w, h, bar: 0.035, depth: FRAME_DEPTH, mat: "softwood", surf: "wood_walnut", art: o.art ?? "painting_1", nail: { strength: 12 } }, [0, h / 2, 0]);
  return finish(b, o);
}

// ------------------------------------------------------------------ cheval mirror

export interface ChevalMirrorOpts extends BaseOpts {
  tint?: number;
}

export const CHEVAL = { w: 0.5, h: 1.45, feetD: 0.46 } as const;

/**
 * Cheval mirror: two hardwood uprights on splayed feet joined by a low stretcher; the framed
 * mirror (hardwood bars, 4 mm mirror glass on weak clips, MDF backing) pivots between them on
 * brass knob bolts (friction hinges) — tilt it, shatter it, snap the uprights.
 */
export function buildChevalMirror(o: ChevalMirrorOpts = {}): AssemblyDef {
  const b = mk("chevalMirror", "Cheval Mirror", "furniture", 160, o);
  const W = { tint: o.tint ?? 0xffffff };
  const { w, h, feetD } = CHEVAL;
  const bar = 0.04,
    depth = 0.024;
  const knob = 0.018; // gap between the frame and each upright (pivot knob)
  const uw = 0.045,
    ud = 0.034;
  const footH = 0.04;
  const pivotY = 0.12 + h / 2;
  const uprightTop = pivotY + 0.36;
  const xU = w / 2 + knob + uw / 2;
  const uprights: string[] = [];
  for (const sx of [-1, 1]) {
    const nm = sx < 0 ? "l" : "r";
    const foot = boxR(b, `foot_${nm}`, "hardwood", "wood_walnut", [sx * xU - 0.025, sx * xU + 0.025], [0, footH], [-feetD / 2, feetD / 2], { ...W, grain: "z" });
    const up = boxR(b, `upright_${nm}`, "hardwood", "wood_walnut", [sx * xU - uw / 2, sx * xU + uw / 2], [footH, uprightTop], [-ud / 2, ud / 2], { ...W, grain: "y" });
    b.dowel(up, foot, 2, 45);
    b.glue(up, foot, 30);
    const cap = b.cyl(`finial_${nm}`, "hardwood", "wood_walnut", 0.02, 0.03, [sx * xU, uprightTop + 0.015, 0], { segments: 10, ...W });
    b.glue(cap, up, 12);
    const kn = b.cyl(`knob_${nm}`, "copper", "copper", 0.012, knob, [sx * (w / 2 + knob / 2), pivotY, 0], { axis: "x", segments: 10, tint: PAL.brass, mass: 0.04 });
    b.screw(kn, up, 1, 40);
    uprights.push(up);
  }
  // low stretcher between the feet at the back
  const str = boxR(b, "stretcher", "hardwood", "wood_walnut", [-xU + 0.025, xU - 0.025], [0.005, footH - 0.005], [-feetD / 2 + 0.03, -feetD / 2 + 0.06], { ...W, grain: "x" });
  b.dowel(str, "foot_l", 1, 40);
  b.dowel(str, "foot_r", 1, 40);
  // framed mirror centred on the pivot axis
  const m = glassPaneInFrame(b, "frame", { w, h, bar, depth, mat: "hardwood", surf: "wood_walnut", tint: W.tint, glassT: 0.004, glassSurf: "mirror", glassZ: depth - 0.006, glassBond: { kind: "clip", strength: 5 } }, [0, pivotY, -depth / 2]);
  const iw = w - 2 * bar,
    ih = h - 2 * bar;
  const zGlassBack = -depth / 2 + (depth - 0.006) - 0.002;
  const backing = boxR(b, "backing", "mdf", "mdf", [-iw / 2, iw / 2], [pivotY - ih / 2, pivotY + ih / 2], [zGlassBack - 0.003, zGlassBack], {});
  for (const bb of [m.bars.top, m.bars.bottom, m.bars.left, m.bars.right]) b.clip(backing, bb, 6);
  b.hinge(m.bars.left, "knob_l", { pivots: [[-w / 2 - knob / 2, pivotY, 0]], axis: [1, 0, 0], min: -12, max: 12, friction: 4, strength: 70, group: "tilt" });
  b.hinge(m.bars.right, "knob_r", { pivots: [[w / 2 + knob / 2, pivotY, 0]], axis: [1, 0, 0], min: -12, max: 12, friction: 4, strength: 70, group: "tilt" });
  void uprights;
  return finish(b, o);
}

// ------------------------------------------------------------------ poster

export interface PosterOpts extends BaseOpts {
  w?: number;
  h?: number;
  art?: SurfaceName;
  /** Bond strength of the tape / pins holding it (J). */
  hold?: number;
}

/** Paper poster: one 0.5 mm sheet (printed front), held by tape/pins (weak world bond at the top). */
export function buildPoster(o: PosterOpts = {}): AssemblyDef {
  const w = o.w ?? 0.6,
    h = o.h ?? 0.9;
  const b = mk("poster", "Poster", "decor", 15, o);
  const t = 0.0005;
  const p = boxR(b, "sheet", "paper", "paper", [-w / 2, w / 2], [0, h], [0, t], { faces: { pz: { surf: o.art ?? "poster_0" } } });
  b.world(p, "glue", o.hold ?? 3, [0, h - 0.02, 0]);
  b.stuffing(p, "paper");
  return finish(b, o);
}

// ------------------------------------------------------------------ beanbag

export interface BeanbagOpts extends BaseOpts {
  tint?: number;
}

export const BEANBAG = { w: 0.85, h: 0.55, d: 0.8 } as const;

/**
 * Beanbag chair: a fabric sack of EPS beads (soft; tears and spills foam beads) slumped into a
 * wide base cushion, a raised back lobe and a low front seat lobe. Each lobe is its own soft hull
 * of at most 16 points (the physics keeps such hulls exactly; a decimated hull sank ~6 cm into the
 * floor), and the three overlapping lobes give a rounded, sagging silhouette instead of one hard
 * faceted dome. The lobes are let into the base (inset) and seamed to it: a hard hit rips the
 * sack apart at the seams.
 */
export function buildBeanbag(o: BeanbagOpts = {}): AssemblyDef {
  const b = mk("beanbag", "Beanbag", "soft", 70, o);
  const { w, h, d } = BEANBAG;
  const tint = o.tint ?? 0x8c3b3b;
  /** Soft lobe: stacked elliptical rings [count, radius fraction, y, phase] + optional crown. */
  const lobe = (
    name: string,
    cx: number,
    cz: number,
    hx: number,
    hz: number,
    rings: Array<[number, number, number, number]>,
    crown: number | null,
    kg: number,
    tags?: string[],
  ): string => {
    const pts: Array<[number, number, number]> = [];
    for (const [n, rf, y, ph] of rings)
      for (let k = 0; k < n; k++) {
        const a = (2 * Math.PI * (k + ph)) / n;
        pts.push([cx + hx * rf * Math.cos(a), y, cz + hz * rf * Math.sin(a)]);
      }
    if (crown !== null) pts.push([cx, crown, cz]);
    const p = b.hull(name, "fabric", "fabric_upholstery", pts, [0, 0, 0], { tint, mass: kg, smooth: 1, ...(tags ? { tags } : {}) });
    b.stuffing(p, "foam");
    return p;
  };
  const yB = 0.25; // top of the base cushion
  // base cushion: flat bottom, bulging belly, rounded shoulder (5 + 6 + 5 = 16 points)
  const base = lobe(
    "bag",
    0,
    0,
    w / 2,
    d / 2,
    [
      [5, 0.8, 0, 0.1],
      [6, 1, 0.12, 0.6],
      [5, 0.74, yB, 0.35],
    ],
    null,
    2.5,
  );
  // back lobe: slumped towards the back (-Z), rises to the full height (6 + 6 + 3 + crown)
  const back = lobe(
    "bag_back",
    0,
    -d * 0.17,
    w * 0.4,
    d * 0.26,
    [
      [6, 0.9, yB - 0.05, 0],
      [6, 1, 0.42, 0.5],
      [3, 0.55, h - 0.03, 0.25],
    ],
    h,
    1.4,
    ["inset"],
  );
  // front seat lobe: a low pillow of beads in front of the back (6 + 6 + 4)
  const seat = lobe(
    "bag_seat",
    0,
    d * 0.14,
    w * 0.34,
    d * 0.22,
    [
      [6, 0.9, yB - 0.04, 0.25],
      [6, 1, yB + 0.04, 0.75],
      [4, 0.55, yB + 0.09, 0],
    ],
    null,
    0.6,
    ["inset"],
  );
  b.bond(back, base, "fused", { strength: 40 });
  b.bond(seat, base, "fused", { strength: 30 });
  b.bond(seat, back, "fused", { strength: 25 });
  return finish(b, o);
}

// ------------------------------------------------------------------ laundry basket

export interface BasketOpts extends BaseOpts {
  tint?: number;
}

/** Outer half-sizes at the bottom and the top, height. */
export const BASKET = { bx: 0.22, bz: 0.15, tx: 0.25, tz: 0.18, h: 0.55, t: 0.0025, floor: 0.004 } as const;

/** Inner half-sizes of the basket at height y (for placing laundry inside). */
export function basketInner(y: number): { hx: number; hz: number } {
  const { bx, bz, tx, tz, h, t, floor } = BASKET;
  const f = Math.min(1, Math.max(0, (y - floor) / (h - floor)));
  return { hx: bx + (tx - bx) * f - t - 0.004, hz: bz + (tz - bz) * f - t - 0.004 };
}

/**
 * Tapered polypropylene laundry basket: perforated walls (vent-pattern texture, mass reduced
 * for the slots), bottom, moulded rim grips; walls fused to each other and the bottom.
 */
export function buildLaundryBasket(o: BasketOpts = {}): AssemblyDef {
  const b = mk("laundryBasket", "Laundry Basket", "misc", 20, o);
  const { bx, bz, tx, tz, h, t, floor } = BASKET;
  const tint = o.tint ?? 0xe9e6dd;
  const P = { tint };
  const bottom = boxR(b, "bottom", "plastic", "plastic", [-bx, bx], [0, floor], [-bz, bz], P);
  const y0 = floor,
    y1 = h;
  const slope = (y1 - y0) > 0 ? 1 / (y1 - y0) : 0;
  // inward offset of a tilted wall (normal tilts by the taper angle)
  const tiltX = Math.atan((tx - bx) * slope),
    tiltZ = Math.atan((tz - bz) * slope);
  const ox = t / Math.cos(tiltX),
    oz = t / Math.cos(tiltZ);
  const kg = (area: number): number => area * t * 1050 * 0.55; // 45 % slots
  // front/back walls span the full width; side walls fit between them
  for (const sz of [-1, 1]) {
    const nm = sz < 0 ? "wall_b" : "wall_f";
    const pts: Array<[number, number, number]> = [
      [-bx, y0, sz * bz],
      [bx, y0, sz * bz],
      [-tx, y1, sz * tz],
      [tx, y1, sz * tz],
      [-bx, y0, sz * (bz - oz)],
      [bx, y0, sz * (bz - oz)],
      [-tx, y1, sz * (tz - oz)],
      [tx, y1, sz * (tz - oz)],
    ];
    b.hull(nm, "plastic", "vent_grille", pts, [0, 0, 0], { tint, mass: kg((bx + tx) * (y1 - y0)) });
  }
  for (const sx of [-1, 1]) {
    const nm = sx < 0 ? "wall_l" : "wall_r";
    const pts: Array<[number, number, number]> = [
      [sx * bx, y0, -(bz - oz)],
      [sx * bx, y0, bz - oz],
      [sx * tx, y1, -(tz - oz)],
      [sx * tx, y1, tz - oz],
      [sx * (bx - ox), y0, -(bz - oz)],
      [sx * (bx - ox), y0, bz - oz],
      [sx * (tx - ox), y1, -(tz - oz)],
      [sx * (tx - ox), y1, tz - oz],
    ];
    b.hull(nm, "plastic", "vent_grille", pts, [0, 0, 0], { tint, mass: kg((bz + tz) * (y1 - y0)) });
  }
  for (const wl of ["wall_f", "wall_b", "wall_l", "wall_r"]) b.fuse(wl, bottom, 20);
  for (const s of ["wall_l", "wall_r"]) {
    b.fuse(s, "wall_f", 18);
    b.fuse(s, "wall_b", 18);
  }
  // moulded rim grips on the short sides (sunk 2 mm into the wall tops)
  for (const sx of [-1, 1]) {
    const g = boxR(b, sx < 0 ? "grip_l" : "grip_r", "plastic", "plastic", sx < 0 ? [-tx - 0.018, -tx + 0.002] : [tx - 0.002, tx + 0.018], [h - 0.03, h - 0.004], [-0.075, 0.075], P);
    b.fuse(g, sx < 0 ? "wall_l" : "wall_r", 15);
  }
  void bottom;
  return finish(b, o);
}
