// Placements for the living / dining room (x 4.0–9.2, z 0–5.0, laminate). PURE MODULE.
//
// Layout (plan coordinates, x east, z north):
//  * TV wall (west partition, finished face x = 4.0575): media console centred z = 2.35 with the
//    55" TV on its pedestal, soundbar in front of it, bookshelf speakers on the console ends,
//    game console + controller + cable box in the open middle bay, Wi-Fi router behind the left
//    glass door, two art books in the right bay; bookcase (books, frames, vases, a succulent)
//    south of the console; snake plant in the SW corner (clear of the slider curtains).
//  * Sofa facing west (back to the east, x 7.25–8.2) with two throw pillows, side table + lamp at
//    its north arm, glass coffee table on an area rug between sofa and TV (magazines, remote,
//    controller, candle tray, bowl), leather armchair angled near the window with a pillow,
//    fiddle-leaf fig in the SE corner, floor lamp behind the sofa's south arm (by the outlet).
//  * Dining table x 5.45–7.05, z 3.7–4.6 with four reference chairs tucked in, placemats, a
//    flower vase and two place settings.
//  * Wall art: painting above the sofa (east wall), painting on the TV wall north of the console,
//    mirror on the east wall by the foyer arch.
//  * Kept clear: 1 m in front of the balcony slider (x 5.0–7.4, z < 1.0), z < 0.2 in front of the
//    slider/window (curtains), the hall opening (x < 5, z > 4.25) and the foyer arch path
//    (x > 8.3, z > 4.45). No living-room object crosses z = 5.0 (kitchen).
//
// Yaw convention: qeuler(0, yaw, 0) turns an object's front (+Z) to (sin yaw, 0, cos yaw):
//   0° → +Z (north), 90° → +X (east), 180° → −Z (south), −90° → −X (west).
// Stacked items are placed on the measured surface of their support (ray cast through the
// support's parts at the item's footprint), never at guessed heights.

import { polyChord } from "../../geom/poly.ts";
import { qeuler, qmul, v3, xapply, xapplyDir, xinv, type Quat, type Vec3, type Xform } from "../../geom/vec.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { RoomId } from "../plan.ts";
import { PARTITION_FACE } from "../structure/levels.ts";
import { buildChair } from "../../objects/reference/chair.ts";
import { buildCoffeeTable } from "../../objects/reference/coffeeTable.ts";
import {
  buildAreaRug,
  buildBook,
  buildCandleTray,
  buildCeramicVase,
  buildDecorBowl,
  buildDinnerPlate,
  buildFigurine,
  buildFlowerVase,
  buildFramedPainting,
  buildMagazine,
  buildPhotoFrame,
  buildPillarCandle,
  buildPlacemat,
  buildThrowPillow,
  buildWallMirror,
  buildWineGlass,
  BOOK_SIZES,
  type BookSize,
} from "../../objects/living/decor.ts";
import { buildCableBox, buildGameConsole, buildGameController, buildRemoteControl, buildSoundbar, buildWifiRouter } from "../../objects/living/electronics.ts";
import { BOOKCASE_DIMS, buildBookcase, buildDiningTable, buildSideTable } from "../../objects/living/furniture.ts";
import { buildFloorLamp, buildTableLamp } from "../../objects/living/lamps.ts";
import { buildMediaConsole, MEDIA_CONSOLE_DIMS } from "../../objects/living/mediaConsole.ts";
import { buildFiddleLeafFig, buildSnakePlant, buildSucculent } from "../../objects/living/plants.ts";
import { ARMCHAIR_PARAMS, buildArmchair, buildSofa, SOFA_PARAMS, seatLayout } from "../../objects/living/sofa.ts";
import { buildBookshelfSpeaker } from "../../objects/living/speaker.ts";
import { buildTv } from "../../objects/living/tv.ts";
import type { Placement } from "./types.ts";

/** A placement plus the facts the tests check. */
export interface LivingItem extends Placement {
  /** Unique id within the living room layout. */
  id: string;
  /** Ids of the items it rests on (absent = floor or wall). */
  on?: string[];
  /**
   * Tags: "wall" (hangs on a wall: may sit closer than 1.5 cm), "tucked:<id>" (intentionally
   * overlaps that item's bounding box, e.g. chairs pushed under the table — the parts don't touch),
   * "inside:<id>" (stands inside a cabinet bay of that item).
   */
  tags?: string[];
}

const ROOM: RoomId = "living";
const D2R = Math.PI / 180;
const WEST_FACE = 4.0 + PARTITION_FACE; // TV wall
const EAST_FACE = 9.2 - PARTITION_FACE;
/** Gap between wall-hung items and the wall face (hanging wire/hooks). */
const WALL_GAP = 0.003;
/** Gap between free-standing furniture and the wall face. */
const WALL_CLEAR = 0.02;
/** Tiny lift so stacked items start in contact without interpenetration. */
const LIFT = 0.0005;

export const yawQ = (deg: number): Quat => qeuler(0, deg * D2R, 0);

/** World AABB of an assembly placed at xf. */
export function worldAabb(def: AssemblyDef, xf: Xform): { min: Vec3; max: Vec3 } {
  const min = v3(Infinity, Infinity, Infinity),
    max = v3(-Infinity, -Infinity, -Infinity);
  for (const p of def.parts)
    for (const v of p.poly.verts) {
      const w = xapply(xf, v);
      if (w.x < min.x) min.x = w.x;
      if (w.y < min.y) min.y = w.y;
      if (w.z < min.z) min.z = w.z;
      if (w.x > max.x) max.x = w.x;
      if (w.y > max.y) max.y = w.y;
      if (w.z > max.z) max.z = w.z;
    }
  return { min, max };
}

/**
 * Highest upward-facing surface of a placed assembly at plan point (x, z) that lies at or below
 * `below` (to reach shelves under a cabinet top), or null when nothing is hit.
 */
export function surfaceAt(def: AssemblyDef, xf: Xform, x: number, z: number, below = 50): number | null {
  const inv = xinv(xf);
  const top = below + 1e-6;
  const o = xapply(inv, v3(x, top, z));
  const d = xapplyDir(inv, v3(0, -1, 0));
  let best: number | null = null;
  for (const p of def.parts) {
    const c = polyChord(p.poly, o, d);
    if (!c || c.tMax < 0) continue;
    const t = Math.max(0, c.tMin);
    const y = top - t;
    if (best === null || y > best) best = y;
  }
  return best;
}

/**
 * Plan points where a placed assembly would touch a support: its vertices within 5 mm of its
 * lowest point (the real contact footprint, e.g. the lower edge of a leaning pillow), pulled 30 %
 * towards their centroid, at most 13 points (centroid + evenly picked).
 */
export function footprintPoints(def: AssemblyDef, xf: Xform): Vec3[] {
  let minY = Infinity;
  const all: Vec3[] = [];
  for (const p of def.parts)
    for (const v of p.poly.verts) {
      const w = xapply(xf, v);
      all.push(w);
      if (w.y < minY) minY = w.y;
    }
  const low = all.filter((w) => w.y <= minY + 0.005);
  const c = low.reduce((a, w) => v3(a.x + w.x / low.length, 0, a.z + w.z / low.length), v3());
  const out: Vec3[] = [c];
  const step = Math.max(1, Math.floor(low.length / 12));
  for (let i = 0; i < low.length && out.length < 13; i += step) out.push(v3(c.x + (low[i].x - c.x) * 0.7, 0, c.z + (low[i].z - c.z) * 0.7));
  return out;
}

class Layout {
  readonly items: LivingItem[] = [];
  private byId = new Map<string, LivingItem>();

  get(id: string): LivingItem {
    const it = this.byId.get(id);
    if (!it) throw new Error(`furnishLiving: unknown item '${id}'`);
    return it;
  }

  add(id: string, def: AssemblyDef, xf: Xform, extra: { on?: string[]; tags?: string[] } = {}): LivingItem {
    if (this.byId.has(id)) throw new Error(`furnishLiving: duplicate id '${id}'`);
    const it: LivingItem = { id, type: def.type, def, xf, room: ROOM };
    if (extra.on?.length) it.on = extra.on.slice();
    if (extra.tags?.length) it.tags = extra.tags.slice();
    this.items.push(it);
    this.byId.set(id, it);
    return it;
  }

  /** Floor-standing item at (x, z), base on y = 0. */
  floor(id: string, def: AssemblyDef, x: number, z: number, yawDeg: number, tags?: string[]): LivingItem {
    return this.add(id, def, { p: v3(x, 0, z), q: yawQ(yawDeg) }, { tags });
  }

  /**
   * Item resting on the support item(s) `on`, its FOOTPRINT centred at plan (x, z) with rotation
   * q (origin offsets of rotated items — e.g. a book lying on its side — are compensated): its
   * lowest point is put on the highest support surface found under its (inset) footprint.
   */
  rest(id: string, def: AssemblyDef, x: number, z: number, q: Quat, on: string[], o: { below?: number; tags?: string[] } = {}): LivingItem {
    const local = worldAabb(def, { p: v3(), q });
    const ox = x - (local.min.x + local.max.x) / 2,
      oz = z - (local.min.z + local.max.z) / 2;
    let top: number | null = null;
    for (const fp of footprintPoints(def, { p: v3(ox, 0, oz), q }))
      for (const sid of on) {
        const s = this.get(sid);
        const y = surfaceAt(s.def, s.xf, fp.x, fp.z, o.below);
        if (y !== null && (top === null || y > top)) top = y;
      }
    if (top === null) throw new Error(`furnishLiving: '${id}' has no support under it`);
    const y = top - local.min.y + LIFT;
    return this.add(id, def, { p: v3(ox, y, oz), q }, { on, tags: o.tags });
  }

  /** Wall-hung item (origin at the bottom centre of its back face) on a wall plane. */
  wall(id: string, def: AssemblyDef, face: "west" | "east", along: number, bottomY: number): LivingItem {
    const x = face === "west" ? WEST_FACE + WALL_GAP : EAST_FACE - WALL_GAP;
    return this.add(id, def, { p: v3(x, bottomY, along), q: yawQ(face === "west" ? 90 : -90) }, { tags: ["wall"] });
  }
}

/** World position of a point given in an item's local frame. */
function localToWorld(it: LivingItem, lx: number, ly: number, lz: number): Vec3 {
  return xapply(it.xf, v3(lx, ly, lz));
}

/** All living / dining room placements with test metadata. Deterministic. */
export function furnishLivingItems(): LivingItem[] {
  const L = new Layout();

  // ------------------------------------------------------------------ TV wall
  const CON = MEDIA_CONSOLE_DIMS;
  const conZ = 2.35;
  const conX = WEST_FACE + WALL_CLEAR + CON.d / 2; // back panel 2 cm off the wall
  const con = L.floor("console", buildMediaConsole({ seed: 3101 }), conX, conZ, 90);
  // console-local → plan: local x → −z, local z → +x
  const cpos = (lx: number, lz: number): [number, number] => {
    const w = localToWorld(con, lx, 0, lz);
    return [w.x, w.z];
  };
  const q90 = yawQ(90);
  {
    const [x, z] = cpos(0, -0.05);
    L.rest("tv", buildTv({ seed: 3102 }), x, z, q90, ["console"]);
  }
  {
    const [x, z] = cpos(0, 0.145);
    L.rest("soundbar", buildSoundbar({ seed: 3103 }), x, z, q90, ["console"]);
  }
  for (const [k, side] of [-1, 1].entries()) {
    // on the console ends, set back 6 cm so the grille sits behind the console's front edge
    const [x, z] = cpos(side * (CON.w / 2 - 0.11), -0.06);
    L.rest(`speaker${k}`, buildBookshelfSpeaker({ seed: 3104 + k }), x, z, q90, ["console"]);
  }
  // middle bay (above the fixed shelf): game console + controller, cable box + nothing above
  const midBelow = CON.h - CON.t - 0.01;
  const bayW = 2 * CON.dividerX - CON.t;
  {
    const [x, z] = cpos(bayW / 2 - 0.01 - 0.145, 0.02);
    L.rest("gameConsole", buildGameConsole({ seed: 3110 }), x, z, q90, ["console"], { below: midBelow, tags: ["inside:console"] });
    L.rest("controller0", buildGameController({ seed: 3111 }), x + 0.01, z, yawQ(80), ["gameConsole"], { tags: ["inside:console"] });
  }
  {
    const [x, z] = cpos(-(bayW / 2 - 0.01 - 0.125), 0.02);
    L.rest("cableBox", buildCableBox({ seed: 3112 }), x, z, q90, ["console"], { below: midBelow, tags: ["inside:console"] });
  }
  // left bay (behind the glass door, on its shelf): router;  right bay floor: two art books flat
  {
    const lx = -(CON.dividerX + (CON.w / 2 - CON.t - CON.dividerX) / 2);
    const [x, z] = cpos(lx, 0.0);
    L.rest("router", buildWifiRouter({ seed: 3113 }), x, z, q90, ["console"], { below: midBelow, tags: ["inside:console"] });
  }
  {
    const lx = CON.dividerX + (CON.w / 2 - CON.t - CON.dividerX) / 2;
    const [x, z] = cpos(lx, 0.0);
    const flat = qmul(yawQ(90), qeuler(0, 0, 90 * D2R));
    const bottomBelow = CON.legH + CON.t + 0.05;
    L.rest("artBook0", buildBook({ size: "large", cover: 2, seed: 3114 }), x, z, flat, ["console"], { below: bottomBelow, tags: ["inside:console"] });
    L.rest("artBook1", buildBook({ size: "large", cover: 3, seed: 3115, dims: [0.21, 0.27, 0.022] }), x, z + 0.01, qmul(yawQ(93), qeuler(0, 0, 90 * D2R)), ["artBook0"], { tags: ["inside:console"] });
  }

  // ------------------------------------------------------------------ bookcase + books
  const BC = BOOKCASE_DIMS;
  const bcZ = 0.92;
  const bc = L.floor("bookcase", buildBookcase({ seed: 3120 }), WEST_FACE + WALL_CLEAR + BC.d / 2, bcZ, 90);
  fillBookcase(L, bc);

  L.floor("snakePlant", buildSnakePlant({ seed: 3121 }), 4.5, 0.33, 20);

  // ------------------------------------------------------------------ seating group
  const sofaX = 7.25 + SOFA_PARAMS.D / 2,
    sofaZ = 2.4;
  const sofa = L.floor("sofa", buildSofa({ seed: 3130 }), sofaX, sofaZ, -90);
  {
    // throw pillows leaning on the back cushions near the arms
    const lay = seatLayout(SOFA_PARAMS);
    const lean = qeuler(-100 * D2R, 0, 0);
    for (const [k, lx] of [-0.6, 0.6].entries()) {
      const def = buildThrowPillow({ seed: 3131 + k, tint: k ? 0xc9a24a : 0xb5523b });
      const qLocal = qmul(yawQ(k ? -8 : 8), lean);
      const q = qmul(sofa.xf.q, qLocal);
      // pillow back 6 mm in front of the back cushions
      const loc = worldAabb(def, { p: v3(0, 0, 0), q: qLocal });
      const lz = lay.backZ1 + 0.006 + (loc.max.z - loc.min.z) / 2;
      const w = localToWorld(sofa, lx, 0, lz);
      L.rest(`pillow${k}`, def, w.x, w.z, q, ["sofa"]);
    }
  }
  L.floor("sideTable", buildSideTable({ seed: 3132 }), 7.75, sofaZ + SOFA_PARAMS.L / 2 + 0.06 + 0.225, -90);
  L.rest("tableLamp", buildTableLamp({ seed: 3133, tint: 0x3d6f8c }), 7.75, sofaZ + SOFA_PARAMS.L / 2 + 0.285, yawQ(-90), ["sideTable"]);

  const rug = L.floor("rug", buildAreaRug({ seed: 3134, l: 1.86 }), 6.15, 2.33, 0);
  void rug;
  const ctX = 6.5,
    ctZ = 2.35;
  L.rest("coffeeTable", buildCoffeeTable({ seed: 3135 }), ctX, ctZ, q90, ["rug"]);
  L.rest("bowl", buildDecorBowl({ seed: 3136 }), ctX + 0.06, ctZ - 0.36, yawQ(0), ["coffeeTable"]);
  L.rest("candleTray", buildCandleTray({ seed: 3137 }), ctX - 0.05, ctZ + 0.27, q90, ["coffeeTable"]);
  L.rest("candle0", buildPillarCandle({ seed: 3138, h: 0.12 }), ctX - 0.05, ctZ + 0.19, yawQ(0), ["candleTray"]);
  L.rest("candle1", buildPillarCandle({ seed: 3139, h: 0.16, r: 0.033 }), ctX - 0.05, ctZ + 0.34, yawQ(30), ["candleTray"]);
  L.rest("magazine0", buildMagazine({ seed: 3140, cover: 0 }), ctX + 0.08, ctZ - 0.03, q90, ["coffeeTable"]);
  L.rest("magazine1", buildMagazine({ seed: 3141, cover: 1 }), ctX + 0.085, ctZ - 0.04, yawQ(97), ["magazine0"]);
  L.rest("remote", buildRemoteControl({ seed: 3142 }), ctX - 0.14, ctZ - 0.05, yawQ(-8), ["coffeeTable"]);
  L.rest("controller1", buildGameController({ seed: 3143, tint: 0xe8e8ea }), ctX - 0.18, ctZ - 0.3, yawQ(70), ["coffeeTable"]);

  // armchair near the window, facing the TV wall, with a pillow
  const arm = L.floor("armchair", buildArmchair({ seed: 3150 }), 8.0, 0.76, -70);
  {
    const lay = seatLayout(ARMCHAIR_PARAMS);
    const def = buildThrowPillow({ seed: 3151, size: 0.4, tint: 0x5c6b5a });
    const qLocal = qeuler(-100 * D2R, 0, 0);
    const loc = worldAabb(def, { p: v3(0, 0, 0), q: qLocal });
    const w = localToWorld(arm, 0, 0, lay.backZ1 + 0.006 + (loc.max.z - loc.min.z) / 2);
    L.rest("pillow2", def, w.x, w.z, qmul(arm.xf.q, qLocal), ["armchair"]);
  }
  L.floor("fig", buildFiddleLeafFig({ seed: 3152 }), 8.86, 0.5, 15);
  L.floor("floorLamp", buildFloorLamp({ seed: 3153 }), 8.8, 1.07, -90);

  // ------------------------------------------------------------------ dining
  const tX = 6.25,
    tZ = 4.14;
  L.floor("diningTable", buildDiningTable({ seed: 3160 }), tX, tZ, 0);
  const chairProbe = buildChair({ seed: 3161 });
  const cb = worldAabb(chairProbe, { p: v3(), q: yawQ(0) });
  const tuck = 0.08; // seat front this far under the table edge
  for (const [k, [dx, south]] of ([
    [-0.4, true],
    [0.4, true],
    [-0.4, false],
    [0.4, false],
  ] as Array<[number, boolean]>).entries()) {
    const def = k === 0 ? chairProbe : buildChair({ seed: 3161 + k });
    const z = south ? tZ - 0.45 + tuck - cb.max.z : tZ + 0.45 - tuck + cb.max.z;
    L.floor(`chair${k}`, def, tX + dx, z, south ? 0 : 180, ["tucked:diningTable"]);
  }
  const matZ = [tZ - 0.25, tZ - 0.25, tZ + 0.25, tZ + 0.25];
  for (let k = 0; k < 4; k++) L.rest(`placemat${k}`, buildPlacemat({ seed: 3170 + k }), tX + (k % 2 ? 0.4 : -0.4), matZ[k], yawQ(0), ["diningTable"]);
  L.rest("flowerVase", buildFlowerVase({ seed: 3175 }), tX, tZ, yawQ(10), ["diningTable"]);
  for (const [k, dx] of [-0.4, 0.4].entries()) {
    L.rest(`plate${k}`, buildDinnerPlate({ seed: 3176 + k }), tX + dx, tZ - 0.25, yawQ(0), [`placemat${k}`]);
    L.rest(`glass${k}`, buildWineGlass({ seed: 3178 + k }), tX + dx + 0.15, tZ - 0.15, yawQ(0), [`placemat${k}`]);
  }

  // ------------------------------------------------------------------ wall art
  L.wall("painting0", buildFramedPainting({ seed: 3180, w: 0.9, h: 0.65, art: "painting_0" }), "east", sofaZ, 1.22);
  L.wall("painting1", buildFramedPainting({ seed: 3181, w: 0.5, h: 0.7, art: "painting_1", frameSurf: "wood_oak" }), "west", 3.8, 1.15);
  L.wall("mirror", buildWallMirror({ seed: 3182 }), "east", 3.88, 1.0);

  return L.items;
}

/** Living / dining room placements (Placement objects; extra metadata fields are harmless). */
export function furnishLiving(): Placement[] {
  return furnishLivingItems();
}

// ---------------------------------------------------------------------- bookcase filling

type ShelfEntry =
  | { kind: "books"; n: number; size: BookSize | "mix" }
  | { kind: "stack"; n: number; size: BookSize }
  | { kind: "item"; make: (seed: number) => AssemblyDef; w: number; yaw?: number }
  | { kind: "gap"; w: number };

/** Book levels of the bookcase (index → content, left to right as seen from the front). */
const SHELVES: ShelfEntry[][] = [
  [{ kind: "books", n: 7, size: "large" }, { kind: "gap", w: 0.03 }, { kind: "stack", n: 3, size: "hardcover" }, { kind: "gap", w: 0.04 }, { kind: "books", n: 4, size: "hardcover" }],
  [{ kind: "books", n: 9, size: "mix" }, { kind: "gap", w: 0.03 }, { kind: "item", make: (s) => buildPhotoFrame({ seed: s }), w: 0.17, yaw: 0 }, { kind: "gap", w: 0.03 }, { kind: "books", n: 4, size: "paperback" }],
  [{ kind: "item", make: (s) => buildCeramicVase({ seed: s, r: 0.055, h: 0.24 }), w: 0.12 }, { kind: "gap", w: 0.03 }, { kind: "books", n: 10, size: "mix" }, { kind: "gap", w: 0.03 }, { kind: "item", make: (s) => buildFigurine({ seed: s }), w: 0.08 }],
  [{ kind: "books", n: 8, size: "paperback" }, { kind: "gap", w: 0.04 }, { kind: "item", make: (s) => buildSucculent({ seed: s }), w: 0.12 }, { kind: "gap", w: 0.04 }, { kind: "books", n: 5, size: "trade" }],
  [{ kind: "item", make: (s) => buildPhotoFrame({ seed: s, w: 0.2, h: 0.15, tint: 0x222222 }), w: 0.21, yaw: 0 }, { kind: "gap", w: 0.05 }, { kind: "stack", n: 3, size: "large" }, { kind: "gap", w: 0.05 }, { kind: "item", make: (s) => buildCeramicVase({ seed: s, r: 0.07, h: 0.3, tint: 0x9c4a3a }), w: 0.14 }],
];

function fillBookcase(L: Layout, bc: LivingItem): void {
  const BC = BOOKCASE_DIMS;
  const mixSizes: BookSize[] = ["hardcover", "trade", "hardcover", "paperback", "trade"];
  let seed = 3200;
  // shelf-local: x along the shelf (−innerHalfW..+innerHalfW), z depth; world via bc.xf
  SHELVES.forEach((entries, level) => {
    const y0 = BC.levels[level];
    const below = y0 + 0.03;
    let cursor = -BC.innerHalfW + 0.006;
    const zFront = BC.shelfZ1 - 0.006;
    let bi = 0;
    for (const e of entries) {
      if (e.kind === "gap") {
        cursor += e.w;
        continue;
      }
      if (e.kind === "books") {
        for (let k = 0; k < e.n; k++) {
          const size = e.size === "mix" ? mixSizes[(bi + level) % mixSizes.length] : e.size;
          const [bw, , bt] = BOOK_SIZES[size];
          const def = buildBook({ size, seed: seed++ });
          const lx = cursor + bt / 2;
          const lz = zFront - bw / 2;
          const w = localToWorld(bc, lx, 0, lz);
          L.rest(`book_${level}_${bi++}`, def, w.x, w.z, qmul(bc.xf.q, yawQ(0)), ["bookcase"], { below, tags: ["inside:bookcase"] });
          cursor += bt + 0.002;
        }
        continue;
      }
      if (e.kind === "stack") {
        const [bw, bh] = BOOK_SIZES[e.size];
        const lx = cursor + bh / 2;
        const lz = zFront - bw / 2 - 0.01;
        let prev = "bookcase";
        for (let k = 0; k < e.n; k++) {
          const def = buildBook({ size: e.size, seed: seed++ });
          const w = localToWorld(bc, lx + (k % 2 ? 0.004 : -0.003), 0, lz);
          // flat: thickness vertical, height along the shelf, spine towards the front
          const q = qmul(bc.xf.q, qmul(yawQ(k * 3 - 3), qeuler(0, 0, 90 * D2R)));
          const it = L.rest(`book_${level}_${bi++}`, def, w.x, w.z, q, [prev], { below: prev === "bookcase" ? below : undefined, tags: ["inside:bookcase"] });
          prev = it.id;
        }
        cursor += bh + 0.01;
        continue;
      }
      // decor item centred in its slot
      const def = e.make(seed++);
      const lx = cursor + e.w / 2;
      const w = localToWorld(bc, lx, 0, (BC.shelfZ0 + BC.shelfZ1) / 2 + 0.01);
      L.rest(`decor_${level}_${bi++}`, def, w.x, w.z, qmul(bc.xf.q, yawQ(e.yaw ?? 0)), ["bookcase"], { below, tags: ["inside:bookcase"] });
      cursor += e.w;
    }
    if (cursor > BC.innerHalfW + 1e-6) throw new Error(`furnishLiving: bookcase level ${level} overfilled (${cursor.toFixed(3)} > ${BC.innerHalfW})`);
  });
}
