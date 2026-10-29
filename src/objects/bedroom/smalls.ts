// Small loose items (each its own assembly so it can be grabbed, thrown and broken):
// alarm clock, smartphone, glass of water, books, perfume bottles, jewelry box, coffee mug,
// paper stack. Real internals where they exist (clock PCB with its mains transformer, phone
// battery + logic board), real glass/ceramic shells (lathe tiles), liquids in vessels.
// Local frames: origin at the centre of the underside, front at +Z. PURE MODULE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { book, drinkingGlass, lowestPart, mug, pcb } from "../lib/kit.ts";
import { boxR, finish, mk, PAL, type BaseOpts } from "./common.ts";
import { Rng } from "../../core/rng.ts";

// ------------------------------------------------------------------ alarm clock

export interface AlarmClockOpts extends BaseOpts {
  tint?: number;
}

export const ALARM_CLOCK = { w: 0.15, h: 0.07, d: 0.06 } as const;

/**
 * Mains digital alarm clock: six 2.5 mm ABS case panels, blue LCD/VFD window (`display_blue`),
 * PCB with a mains transformer behind the front panel (sparks), press-fit snooze bar + set
 * button on top, rubber feet.
 */
export function buildAlarmClock(o: AlarmClockOpts = {}): AssemblyDef {
  const b = mk("alarmClock", "Alarm Clock", "electronics", 25, o);
  const { w, h, d } = ALARM_CLOCK;
  const t = 0.0025;
  const tint = o.tint ?? PAL.charcoal;
  const P = { tint };
  const footH = 0.003;
  const y0 = footH;
  const bottom = boxR(b, "case_bottom", "plastic", "plastic", [-w / 2, w / 2], [y0, y0 + t], [-d / 2, d / 2], P);
  const top = boxR(b, "case_top", "plastic", "plastic", [-w / 2, w / 2], [y0 + h - t, y0 + h], [-d / 2, d / 2], P);
  const endL = boxR(b, "case_end_l", "plastic", "plastic", [-w / 2, -w / 2 + t], [y0 + t, y0 + h - t], [-d / 2, d / 2], P);
  const endR = boxR(b, "case_end_r", "plastic", "plastic", [w / 2 - t, w / 2], [y0 + t, y0 + h - t], [-d / 2, d / 2], P);
  const front = boxR(b, "case_front", "plastic", "plastic_glossy", [-w / 2 + t, w / 2 - t], [y0 + t, y0 + h - t], [d / 2 - t, d / 2], P);
  const back = boxR(b, "case_back", "plastic", "vent_grille", [-w / 2 + t, w / 2 - t], [y0 + t, y0 + h - t], [-d / 2, -d / 2 + t], { tint: 0x3a3a3a });
  for (const p of [endL, endR, front, back]) {
    b.clip(p, bottom, 6);
    b.clip(p, top, 6);
  }
  for (const p of [front, back]) {
    b.clip(p, endL, 4);
    b.clip(p, endR, 4);
  }
  // display window proud of the front panel: digits glow on its front face
  const lcd = boxR(b, "display", "lcd", "lcd_off", [-0.052, 0.052], [y0 + 0.014, y0 + 0.056], [d / 2, d / 2 + 0.002], { faces: { pz: { surf: "display_blue" } } });
  b.glue(lcd, front, 6);
  // PCB with the mains transformer, behind the front panel (components face the back)
  pcb(
    b,
    "pcb",
    {
      w: 0.12,
      h: 0.05,
      components: [
        { kind: "transformer", x: -0.035, y: 0 },
        { kind: "chip", x: 0.02, y: 0.005 },
        { kind: "cap", x: 0.048, y: -0.012 },
        { kind: "buzzer", x: 0.048, y: 0.013 },
      ],
      mount: { to: front, screws: 2, each: 8 },
      sparks: 0.5,
    },
    [0, y0 + h / 2, d / 2 - t - 0.0016],
    [0, 180, 0],
  );
  // snooze bar and set button (press-fit) on the top panel
  const snooze = boxR(b, "snooze", "plastic", "plastic", [-0.045, 0.045], [y0 + h, y0 + h + 0.007], [-0.005, 0.02], { tint: 0x55585e });
  const set = boxR(b, "btn_set", "plastic", "plastic", [0.052, 0.064], [y0 + h, y0 + h + 0.004], [-0.02, -0.008], { tint: 0x55585e });
  b.press(snooze, top, 2);
  b.press(set, top, 2);
  for (const sx of [-1, 1]) {
    const f = boxR(b, sx < 0 ? "foot_l" : "foot_r", "rubber", "rubber", [sx < 0 ? -w / 2 + 0.01 : w / 2 - 0.03, sx < 0 ? -w / 2 + 0.03 : w / 2 - 0.01], [0, footH], [-d / 2 + 0.006, d / 2 - 0.006]);
    b.glue(f, bottom, 4);
  }
  return finish(b, o);
}

// ------------------------------------------------------------------ smartphone

export interface PhoneOpts extends BaseOpts {
  tint?: number;
  on?: boolean;
}

export const PHONE = { w: 0.0715, h: 0.0085, l: 0.147 } as const;

/** Smartphone lying screen-up: aluminium back + side rails, battery, logic board, glass/LCD front (`screen`). */
export function buildSmartphone(o: PhoneOpts = {}): AssemblyDef {
  const b = mk("smartphone", "Smartphone", "electronics", 600, o);
  const { w, l } = PHONE;
  const tint = o.tint ?? 0x34363b;
  const backT = 0.0022,
    railH = 0.005,
    railT = 0.003,
    glassT = 0.0013;
  const back = boxR(b, "back", "aluminum", "aluminum", [-w / 2, w / 2], [0, backT], [-l / 2, l / 2], { tint, tess: 0 });
  const yr: [number, number] = [backT, backT + railH];
  const rl = boxR(b, "rail_l", "aluminum", "aluminum", [-w / 2, -w / 2 + railT], yr, [-l / 2, l / 2], { tint, tess: 0 });
  const rr = boxR(b, "rail_r", "aluminum", "aluminum", [w / 2 - railT, w / 2], yr, [-l / 2, l / 2], { tint, tess: 0 });
  const rt = boxR(b, "rail_t", "aluminum", "aluminum", [-w / 2 + railT, w / 2 - railT], yr, [-l / 2, -l / 2 + railT], { tint, tess: 0 });
  const rb = boxR(b, "rail_b", "aluminum", "aluminum", [-w / 2 + railT, w / 2 - railT], yr, [l / 2 - railT, l / 2], { tint, tess: 0 });
  for (const r of [rl, rr, rt, rb]) b.weld(r, back, 20);
  b.fuse(rt, rl, 10);
  b.fuse(rt, rr, 10);
  b.fuse(rb, rl, 10);
  b.fuse(rb, rr, 10);
  const battery = boxR(b, "battery", "plastic", "metal_raw", [-0.029, 0.029], [backT, backT + 0.0042], [-0.005, 0.065], { mass: 0.045, tint: 0x9a9da3 });
  b.glue(battery, back, 6);
  const board = boxR(b, "logic_board", "pcb", "pcb", [-0.03, 0.022], [backT, backT + 0.0016], [-0.067, -0.012], {});
  b.screw(board, back, 3, 4);
  b.sparks(board, 0.7);
  const glass = boxR(b, "screen", "lcd", "lcd_off", [-w / 2, w / 2], [backT + railH, backT + railH + glassT], [-l / 2, l / 2], {
    faces: { px: { surf: "plastic", tint: 0x111111 }, nx: { surf: "plastic", tint: 0x111111 }, pz: { surf: "plastic", tint: 0x111111 }, nz: { surf: "plastic", tint: 0x111111 } },
  });
  for (const r of [rl, rr, rt, rb]) b.glue(glass, r, 5);
  b.screen(glass, "phone", { on: o.on ?? false, mains: false });
  return finish(b, o);
}

// ------------------------------------------------------------------ glass of water

export interface WaterGlassOpts extends BaseOpts {
  litres?: number;
}

export const WATER_GLASS = { r: 0.035, h: 0.105 } as const;

export function buildWaterGlass(o: WaterGlassOpts = {}): AssemblyDef {
  const b = mk("waterGlass", "Glass of Water", "kitchenware", 4, o);
  const tiles = drinkingGlass(b, "glass", { r: WATER_GLASS.r, h: WATER_GLASS.h, t: 0.0028, segments: 8 });
  b.liquid(lowestPart(b, tiles), 0xcfe6f2, o.litres ?? 0.2);
  return finish(b, o);
}

// ------------------------------------------------------------------ books

export interface BookOpts extends BaseOpts {
  w?: number;
  h?: number;
  t?: number;
  cover?: 0 | 1 | 2 | 3;
  tint?: number;
  hardcover?: boolean;
  /** Lying flat (cover up) instead of standing on its tail. */
  lying?: boolean;
  /** 4-part construction (covers, spine, page block) or a single part. */
  detail?: boolean;
}

const COVER_TINTS = [0xffffff, 0xb84a3a, 0x3e5c8a, 0x2f6b4f, 0xd9b55b, 0x6a3f73, 0x2a2a2e, 0xe7e1d2, 0x8c2f2f, 0x4f7f8f];

/** Book dimensions for a seed (so placements can stack/space them exactly). */
export function bookDims(o: BookOpts = {}): { w: number; h: number; t: number; hardcover: boolean } {
  const r = new Rng(0xb00c ^ Math.floor((o.seed ?? 0) * 7919));
  const w = o.w ?? Math.round(r.range(0.13, 0.17) * 1000) / 1000;
  const h = o.h ?? Math.round(r.range(0.19, 0.245) * 1000) / 1000;
  const t = o.t ?? Math.round(r.range(0.016, 0.042) * 1000) / 1000;
  const hardcover = o.hardcover ?? r.next() < 0.55;
  return { w, h, t, hardcover };
}

/**
 * Book: upright (spine +Z, thickness along X, standing on y = 0) or lying flat (thickness along
 * Y, spine +Z, origin at the centre of the underside). Pages tear into paper scraps.
 */
export function buildBook(o: BookOpts = {}): AssemblyDef {
  const b = mk("book", "Book", "decor", 18, o);
  const { w, h, t, hardcover } = bookDims(o);
  const r = new Rng(0xc0e7 ^ Math.floor((o.seed ?? 0) * 104729));
  const cover = `book_cover_${o.cover ?? r.int(0, 3)}` as SurfaceName;
  const tint = o.tint ?? COVER_TINTS[r.int(0, COVER_TINTS.length - 1)];
  const parts = o.detail === false ? 1 : 4;
  if (o.lying) book(b, "book", { w, h, t, cover, tint, hardcover, parts }, [h / 2, t / 2, 0], [0, 0, 90]);
  else book(b, "book", { w, h, t, cover, tint, hardcover, parts }, [0, 0, 0]);
  return finish(b, o);
}

// ------------------------------------------------------------------ perfume bottles

export interface PerfumeOpts extends BaseOpts {
  shape?: "flacon" | "round" | "facet";
  tint?: number;
  liquid?: number;
}

/** Thick-walled perfume bottle (glass body with `liquid`), aluminium collar/pump, cap. */
export function buildPerfumeBottle(o: PerfumeOpts = {}): AssemblyDef {
  const shape = o.shape ?? "flacon";
  const b = mk("perfume", "Perfume Bottle", "decor", 70, o);
  const glassTint = o.tint ?? 0xf3efe4;
  const liquid = o.liquid ?? 0xe8c06a;
  let body: string;
  let neckY: number;
  if (shape === "flacon") {
    body = b.bevelBox("body", "glass", "glass", [0.062, 0.08, 0.04], 0.003, [0, 0.04, 0], { tint: glassTint, mass: 0.24 });
    neckY = 0.08;
  } else if (shape === "round") {
    body = b.cyl("body", "glass", "glass", 0.03, 0.07, [0, 0.035, 0], { segments: 12, tint: glassTint, mass: 0.2, capSurf: "glass" });
    neckY = 0.07;
  } else {
    const pts: Array<[number, number, number]> = [];
    for (let k = 0; k < 8; k++) {
      const a = (2 * Math.PI * (k + 0.5)) / 8;
      pts.push([0.026 * Math.cos(a), 0, 0.018 * Math.sin(a)]);
      pts.push([0.034 * Math.cos(a), 0.035, 0.024 * Math.sin(a)]);
      pts.push([0.022 * Math.cos(a), 0.075, 0.016 * Math.sin(a)]);
    }
    body = b.hull("body", "glass", "glass", pts, [0, 0, 0], { tint: glassTint, mass: 0.22 });
    neckY = 0.075;
  }
  const collar = b.cyl("collar", "aluminum", "aluminum", 0.008, 0.01, [0, neckY + 0.005, 0], { segments: 10, tint: PAL.brass });
  b.glue(collar, body, 15);
  const cap =
    shape === "round"
      ? b.ellipsoid("cap", "plastic", "plastic_glossy", [0.016, 0.016, 0.016], [0, neckY + 0.01 + 0.016, 0], { tint: 0x1a1a1a, segments: 10, rings: 6 })
      : b.cyl("cap", "plastic", "plastic_glossy", 0.014, 0.026, [0, neckY + 0.01 + 0.013, 0], { segments: 12, tint: shape === "facet" ? PAL.brass : 0x111111 });
  b.press(cap, collar, 3);
  b.liquid(body, liquid, 0.05);
  return finish(b, o);
}

// ------------------------------------------------------------------ jewelry box

export interface JewelryBoxOpts extends BaseOpts {
  tint?: number;
}

export const JEWELRY_BOX = { w: 0.2, h: 0.085, d: 0.14 } as const;

/** Walnut jewelry box: doweled walls on a base, velvet tray, hinged lid with a mirror and a clasp. */
export function buildJewelryBox(o: JewelryBoxOpts = {}): AssemblyDef {
  const b = mk("jewelryBox", "Jewelry Box", "decor", 60, o);
  const { w, h, d } = JEWELRY_BOX;
  const wt = 0.009,
    bt = 0.008,
    lidT = 0.014;
  const wallH = h - bt - lidT;
  const W = { tint: o.tint ?? 0xffffff };
  const base = boxR(b, "base", "hardwood", "wood_walnut", [-w / 2, w / 2], [0, bt], [-d / 2, d / 2], W);
  const y0 = bt,
    y1 = bt + wallH;
  const fr = boxR(b, "wall_f", "hardwood", "wood_walnut", [-w / 2, w / 2], [y0, y1], [d / 2 - wt, d / 2], { ...W, grain: "x" });
  const bk = boxR(b, "wall_b", "hardwood", "wood_walnut", [-w / 2, w / 2], [y0, y1], [-d / 2, -d / 2 + wt], { ...W, grain: "x" });
  const sl = boxR(b, "wall_l", "hardwood", "wood_walnut", [-w / 2, -w / 2 + wt], [y0, y1], [-d / 2 + wt, d / 2 - wt], { ...W, grain: "z" });
  const sr = boxR(b, "wall_r", "hardwood", "wood_walnut", [w / 2 - wt, w / 2], [y0, y1], [-d / 2 + wt, d / 2 - wt], { ...W, grain: "z" });
  for (const p of [fr, bk, sl, sr]) b.glue(p, base, 20);
  for (const s of [sl, sr]) {
    b.dowel(s, fr, 1, 15);
    b.dowel(s, bk, 1, 15);
  }
  // velvet-lined tray resting on the base inside the walls
  const tray = boxR(b, "tray", "fabric", "fabric_upholstery", [-w / 2 + wt + 0.001, w / 2 - wt - 0.001], [y0, y0 + 0.022], [-d / 2 + wt + 0.001, d / 2 - wt - 0.001], { tint: 0x7a1f2e, mass: 0.03 });
  b.friction(tray, base, 2);
  // lid on two small brass hinges at the back edge, mirror glued underneath, clasp latch at the front
  const lid = boxR(b, "lid", "hardwood", "wood_walnut", [-w / 2, w / 2], [y1, y1 + lidT], [-d / 2, d / 2], { ...W, grain: "x" });
  const mirror = boxR(b, "mirror", "glass", "mirror", [-0.075, 0.075], [y1 - 0.002, y1], [-0.045, 0.045], { faces: { py: { surf: "wood_walnut" } } });
  // the mirror sits inside the walls' opening, under the lid
  b.glue(mirror, lid, 6);
  b.hinge(lid, bk, {
    pivots: [
      [-0.06, y1, -d / 2],
      [0.06, y1, -d / 2],
    ],
    axis: [-1, 0, 0],
    min: 0,
    max: 105,
    strength: 12,
    friction: 0.05,
    latch: 3,
    latchPos: [0, y1, d / 2],
    latchFixed: fr,
  });
  return finish(b, o);
}

// ------------------------------------------------------------------ coffee mug

export interface MugOpts extends BaseOpts {
  tint?: number;
  coffee?: boolean;
}

export const COFFEE_MUG = { r: 0.041, h: 0.095 } as const;

export function buildCoffeeMug(o: MugOpts = {}): AssemblyDef {
  const b = mk("coffeeMug", "Coffee Mug", "kitchenware", 8, o);
  const m = mug(b, "mug", { r: COFFEE_MUG.r, h: COFFEE_MUG.h, segments: 8, tint: o.tint ?? 0x2f4f6f, innerTint: 0xf6f3ec });
  if (o.coffee !== false) b.liquid(lowestPart(b, m.body), 0x3b2414, 0.18);
  return finish(b, o);
}

// ------------------------------------------------------------------ paper stack

export interface PaperOpts extends BaseOpts {
  sheets?: number;
  /** Loose top sheet rotation (degrees). */
  skew?: number;
}

export const A4 = { w: 0.21, l: 0.297, sheet: 0.0001 } as const;

/** A4 paper stack (printed top) with a few loose sheets on top, slightly skewed. */
export function buildPaperStack(o: PaperOpts = {}): AssemblyDef {
  const b = mk("paperStack", "Papers", "misc", 2, o);
  const n = Math.max(5, o.sheets ?? 30);
  const t = n * A4.sheet;
  const stack = boxR(b, "stack", "paper", "paper", [-A4.w / 2, A4.w / 2], [0, t], [-A4.l / 2, A4.l / 2], { faces: { py: { surf: "paper_printed" } } });
  const looseT = 0.0006;
  const loose = b.box("loose", "paper", "paper_printed", [A4.w, looseT, A4.l], [0.006, t + looseT / 2, -0.004], { rot: [0, o.skew ?? 7, 0] });
  b.friction(loose, stack, 1);
  b.stuffing(stack, "paper");
  return finish(b, o);
}
