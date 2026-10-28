// Placements for the master bedroom and bedroom 2. PURE MODULE (no Babylon).
//
// Yaw convention (checked in tests/unit/content-bedrooms-place.test.ts): an object's front (+Z in
// its own frame) is turned by qeuler(0, yaw, 0) to (sin yaw, 0, cos yaw), so
//   yaw 0 → faces +Z (north), +π/2 → +X (east), π → −Z (south), −π/2 → −X (west).
//
// Every item is positioned from its builder's real geometry: wall-standing furniture is pushed
// against the finished wall face with WALL_GAP clearance using the def's rotated local AABB, loose
// items sit on the measured surface of the object below them (`on`), contained items rest inside
// their container (`in`). `bedroomItems()` exposes these relations for the tests.
//
// Coordination with other areas: baseboard heaters under all three bedroom windows (fixtures:
// 0.09 m deep, 0.2 m tall), door stops at (3.706, 3.56) and (9.594, 3.56), venetian blinds over
// the windows, a wall-mounted full-length mirror on the master's north wall at x = 1.9 (so the
// cheval mirror builder is registered but not placed: one floor-length mirror per bedroom).

import { qeuler, qmul, qrot, v3, type Quat, type Vec3, type Xform } from "../../geom/vec.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { RoomId } from "../plan.ts";
import { roomFaces } from "../structure/levels.ts";
import type { Placement } from "./types.ts";
import { buildMetalBed, buildQueenBed, metalBedDims, queenBedDims } from "../../objects/bedroom/bed.ts";
import { buildBedPillow, buildClothes, buildDuvet, buildMattress, mattressDims } from "../../objects/bedroom/bedding.ts";
import { buildBookshelf, bookshelfDims } from "../../objects/bedroom/bookshelf.ts";
import { BASKET, basketInner, buildBeanbag, buildFramedPrint, buildLaundryBasket, buildPoster } from "../../objects/bedroom/decor.ts";
import { buildDesk, deskDims } from "../../objects/bedroom/desk.ts";
import { buildDresser, dresserDims } from "../../objects/bedroom/dresser.ts";
import { guitarOnStand } from "../../objects/bedroom/guitar.ts";
import { buildDeskLamp, buildTableLamp } from "../../objects/bedroom/lamps.ts";
import { buildLaptop } from "../../objects/bedroom/laptop.ts";
import { buildNightstand, nightstandDims } from "../../objects/bedroom/nightstand.ts";
import { buildOfficeChair } from "../../objects/bedroom/officeChair.ts";
import { buildPcTower } from "../../objects/bedroom/pcTower.ts";
import { buildKeyboard, buildMonitor, buildMouse, buildSpeaker } from "../../objects/bedroom/peripherals.ts";
import { buildAlarmClock, buildBook, buildCoffeeMug, buildJewelryBox, buildPaperStack, buildPerfumeBottle, buildSmartphone, buildWaterGlass, bookDims } from "../../objects/bedroom/smalls.ts";
import { buildShoeBox, buildWardrobe, wardrobeDims, SHOE_BOX } from "../../objects/bedroom/wardrobe.ts";

/** Clearance between wall-standing furniture and the finished wall face (m). */
export const WALL_GAP = 0.0175;
/** Gap between wall-hung flat items (posters, prints) and the wall face (m). */
export const HANG_GAP = 0.004;

export type Support = "floor" | "wall" | { on: string } | { in: string };

export interface BedroomItem {
  /** Unique id (used for relations). */
  id: string;
  placement: Placement;
  support: Support;
  /** World height of the contact surface for `on`/`in` items. */
  restY?: number;
  /** Part names (prefix match) whose underside rests at restY (default: the item's lowest part). */
  contact?: string[];
  /** Other items this one is allowed to AABB-overlap (stacking/containment/under an arm). */
  overlaps?: string[];
}

// --------------------------------------------------------------------------- geometry helpers

const P2 = Math.PI / 2;

function xfAt(x: number, y: number, z: number, yaw: number): Xform {
  return { p: v3(x, y, z), q: qeuler(0, yaw, 0) };
}

/** Local AABB of a def (all part vertices). */
export function localBox(def: AssemblyDef): { min: Vec3; max: Vec3 } {
  const min = v3(Infinity, Infinity, Infinity),
    max = v3(-Infinity, -Infinity, -Infinity);
  for (const p of def.parts)
    for (const v of p.poly.verts) {
      if (v.x < min.x) min.x = v.x;
      if (v.y < min.y) min.y = v.y;
      if (v.z < min.z) min.z = v.z;
      if (v.x > max.x) max.x = v.x;
      if (v.y > max.y) max.y = v.y;
      if (v.z > max.z) max.z = v.z;
    }
  return { min, max };
}

/** XZ extent of the def's local AABB rotated by yaw (offsets from the origin). */
function rotatedXZ(def: AssemblyDef, yaw: number): { x0: number; x1: number; z0: number; z1: number } {
  const b = localBox(def);
  const q = qeuler(0, yaw, 0);
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (const x of [b.min.x, b.max.x])
    for (const z of [b.min.z, b.max.z]) {
      const r = qrot(q, v3(x, 0, z));
      x0 = Math.min(x0, r.x);
      x1 = Math.max(x1, r.x);
      z0 = Math.min(z0, r.z);
      z1 = Math.max(z1, r.z);
    }
  return { x0, x1, z0, z1 };
}

/**
 * Floor placement from constraints on the rotated AABB: e.g. { minX: face + gap } pushes the
 * object's west side to that x; { cz } centres it on z.
 */
function floorXf(def: AssemblyDef, yaw: number, c: { minX?: number; maxX?: number; minZ?: number; maxZ?: number; cx?: number; cz?: number }, y = 0): Xform {
  const e = rotatedXZ(def, yaw);
  let x = c.cx ?? 0,
    z = c.cz ?? 0;
  if (c.minX !== undefined) x = c.minX - e.x0;
  if (c.maxX !== undefined) x = c.maxX - e.x1;
  if (c.minZ !== undefined) z = c.minZ - e.z0;
  if (c.maxZ !== undefined) z = c.maxZ - e.z1;
  return xfAt(x, y, z, yaw);
}

/** Child transform: a point (lx, ly, lz) and relative yaw in the parent's frame. */
function onParent(parent: Xform, lx: number, ly: number, lz: number, yawRel = 0): Xform {
  const o = qrot(parent.q, v3(lx, ly, lz));
  const q: Quat = qmul(parent.q, qeuler(0, yawRel, 0));
  return { p: v3(parent.p.x + o.x, parent.p.y + o.y, parent.p.z + o.z), q };
}

/** Transform composition for an explicit child pose given in the parent frame. */
function compose(parent: Xform, child: { p: Vec3; q: Quat }): Xform {
  const o = qrot(parent.q, child.p);
  return { p: v3(parent.p.x + o.x, parent.p.y + o.y, parent.p.z + o.z), q: qmul(parent.q, child.q) };
}

function withRoom(def: AssemblyDef, room: RoomId): AssemblyDef {
  return { ...def, room };
}

// --------------------------------------------------------------------------- layout

/** All bedroom items with their support relations (deterministic). */
export function bedroomItems(): BedroomItem[] {
  const out: BedroomItem[] = [];
  const add = (id: string, def: AssemblyDef, xf: Xform, room: RoomId, support: Support, extra: Partial<BedroomItem> = {}): Xform => {
    out.push({ id, placement: { type: def.type, def: withRoom(def, room), xf, room }, support, ...extra });
    return xf;
  };
  furnishMaster(add);
  furnishBed2(add);
  return out;
}

type Add = (id: string, def: AssemblyDef, xf: Xform, room: RoomId, support: Support, extra?: Partial<BedroomItem>) => Xform;

// ------------------------------------------------------------------ master bedroom
function furnishMaster(add: Add): void {
  const R: RoomId = "master";
  const F = roomFaces(R); // x 0..3.9425, z 0..4.3425

  // ---- queen bed, headboard on the west (party) wall, centred z = 2.2
  const bedDef = buildQueenBed({ seed: 11, wood: "oak" });
  const bd = queenBedDims();
  const bedXf = add("m_bed", bedDef, floorXf(bedDef, P2, { minX: F.x0 + WALL_GAP, cz: 2.2 }), R, "floor");
  const md = mattressDims({ w: bd.mattressW, l: bd.mattressL });
  const mattXf = add("m_mattress", buildMattress({ seed: 12, w: md.w, l: md.l, h: md.h }), onParent(bedXf, 0, bd.slatTop, bd.mattressZ), R, { on: "m_bed" }, { restY: bd.slatTop, overlaps: ["m_bed"] });
  const topY = bd.slatTop + md.h;
  const railTop = 0.36;
  const duvetL = 1.45;
  add(
    "m_duvet",
    buildDuvet({ seed: 13, w: md.w + 0.07, l: duvetL, drop: topY - railTop - 0.015, tint: 0xb7c2ad }),
    onParent(mattXf, 0, md.h, md.l / 2 - duvetL / 2),
    R,
    { on: "m_mattress" },
    { restY: topY, contact: ["main"], overlaps: ["m_bed", "m_mattress"] },
  );
  for (const [k, sx] of [
    [0, -1],
    [1, 1],
  ] as Array<[number, number]>) {
    const pXf = add(`m_pillow${k}`, buildBedPillow({ seed: 14 + k, kind: "sleep" }), onParent(mattXf, sx * 0.38, md.h, -md.l / 2 + 0.27), R, { on: "m_mattress" }, { restY: topY, overlaps: ["m_bed", "m_mattress"] });
    add(`m_deco${k}`, buildBedPillow({ seed: 16 + k, kind: "deco", tint: k ? 0x8a6f9a : 0x7d8f74 }), onParent(pXf, 0, 0.14, 0.03, sx * 0.12), R, { on: `m_pillow${k}` }, { restY: topY + 0.14, overlaps: ["m_bed", "m_mattress", `m_pillow${k}`] });
  }

  // ---- nightstands either side of the bed, lamps and bedside things on top
  const nd = nightstandDims();
  const bedBox = rotatedXZ(bedDef, P2);
  const zBed0 = bedXf.p.z + bedBox.z0,
    zBed1 = bedXf.p.z + bedBox.z1;
  const nsDefS = buildNightstand({ seed: 21 });
  const nsS = add("m_nightstand_s", nsDefS, floorXf(nsDefS, P2, { minX: F.x0 + WALL_GAP, maxZ: zBed0 - 0.06 }), R, "floor");
  const nsDefN = buildNightstand({ seed: 22 });
  const nsN = add("m_nightstand_n", nsDefN, floorXf(nsDefN, P2, { minX: F.x0 + WALL_GAP, minZ: zBed1 + 0.06 }), R, "floor");
  // nightstand-local +x points south (world -z) for yaw π/2: lamps go on the outer side
  add("m_lamp_s", buildTableLamp({ seed: 23, tint: 0x5d7f8f }), onParent(nsS, 0.094, nd.h, -0.035), R, { on: "m_nightstand_s" }, { restY: nd.h });
  add("m_lamp_n", buildTableLamp({ seed: 24, tint: 0x5d7f8f }), onParent(nsN, -0.094, nd.h, -0.035), R, { on: "m_nightstand_n" }, { restY: nd.h });
  add("m_clock", buildAlarmClock({ seed: 25 }), onParent(nsS, -0.15, nd.h, -0.06, 0.3 - P2), R, { on: "m_nightstand_s" }, { restY: nd.h });
  add("m_water", buildWaterGlass({ seed: 26 }), onParent(nsS, -0.17, nd.h, 0.15), R, { on: "m_nightstand_s" }, { restY: nd.h });
  add("m_phone", buildSmartphone({ seed: 27 }), onParent(nsN, 0.15, nd.h, 0.12, 0.25), R, { on: "m_nightstand_n" }, { restY: nd.h });
  const b1 = { seed: 28, lying: true, detail: true } as const;
  const b1d = bookDims(b1);
  const bk1 = add("m_book_n0", buildBook(b1), onParent(nsN, 0.155, nd.h, -0.085, P2), R, { on: "m_nightstand_n" }, { restY: nd.h });
  const b2 = { seed: 29, lying: true, detail: true, h: 0.2, w: 0.13 } as const;
  add("m_book_n1", buildBook(b2), onParent(bk1, 0.004, b1d.t, 0.0, 0.08), R, { on: "m_book_n0" }, { restY: nd.h + b1d.t, overlaps: ["m_nightstand_n"] });
  // books lying on the open shelves inside both nightstands
  const shelfY = nd.shelf.y;
  for (const [ns, nm, seed] of [
    [nsS, "m_nightstand_s", 30],
    [nsN, "m_nightstand_n", 32],
  ] as Array<[Xform, string, number]>) {
    const o1 = { seed, lying: true, detail: false, h: 0.21 } as const;
    const d1 = bookDims(o1);
    const s1 = add(`${nm}_book0`, buildBook(o1), onParent(ns, 0, shelfY, -0.01), R, { in: nm }, { restY: shelfY, overlaps: [nm] });
    const o2 = { seed: seed + 1, lying: true, detail: false, h: 0.19 } as const;
    add(`${nm}_book1`, buildBook(o2), onParent(s1, 0.006, d1.t, 0.004, 0.06), R, { on: `${nm}_book0` }, { restY: shelfY + d1.t, overlaps: [nm] });
  }

  // ---- dresser on the east wall (south part) with things on top
  const dd = dresserDims();
  const drDef = buildDresser({ seed: 41 });
  const dr = add("m_dresser", drDef, floorXf(drDef, -P2, { maxX: F.x1 - WALL_GAP, cz: 1.25 }), R, "floor");
  // dresser-local +x points north (world +z) for yaw -π/2
  add("m_jewelry", buildJewelryBox({ seed: 42 }), onParent(dr, -0.42, dd.h, 0.06, 0.12), R, { on: "m_dresser" }, { restY: dd.h, overlaps: ["m_dresser"] });
  const perf: Array<["flacon" | "round" | "facet", number, number, number]> = [
    ["flacon", 0.34, 0.04, 0xf3efe4],
    ["round", 0.43, 0.08, 0xe9d9f0],
    ["facet", 0.52, 0.02, 0xf6e7c8],
  ];
  perf.forEach(([shape, x, z, tint], k) =>
    add(`m_perfume${k}`, buildPerfumeBottle({ seed: 43 + k, shape, tint, liquid: k === 1 ? 0xd98fb0 : 0xe8c06a }), onParent(dr, x, dd.h, z, 0.3 * k), R, { on: "m_dresser" }, { restY: dd.h, overlaps: ["m_dresser"] }),
  );

  // ---- wardrobe on the east wall north of the dresser, clear of the door swing / door stop
  const wd = wardrobeDims();
  const wrDef = buildWardrobe({ seed: 51 });
  const wr = add("m_wardrobe", wrDef, floorXf(wrDef, -P2, { maxX: F.x1 - WALL_GAP, maxZ: 3.35 }), R, "floor");
  for (const [k, x] of [
    [0, -0.27],
    [1, 0.08],
  ] as Array<[number, number]>) {
    add(`m_shoebox${k}`, buildShoeBox({ seed: 52 + k, tint: k ? 0x9a8f86 : 0xc9a77c }), onParent(wr, x, wd.floorY, 0.0, 0), R, { in: "m_wardrobe" }, { restY: wd.floorY, overlaps: ["m_wardrobe"] });
  }
  for (const [k, x] of [
    [0, -0.25],
    [1, 0.17],
  ] as Array<[number, number]>) {
    const lo = add(`m_folded${k}a`, buildClothes({ seed: 54 + 2 * k, style: "folded" }), onParent(wr, x, wd.shelfY, -0.02, 0), R, { in: "m_wardrobe" }, { restY: wd.shelfY, overlaps: ["m_wardrobe"] });
    add(`m_folded${k}b`, buildClothes({ seed: 55 + 2 * k, style: "folded", size: [0.28, 0.06, 0.24] }), onParent(lo, 0.005, 0.06, 0.004, 0.04), R, { in: "m_wardrobe" }, { restY: wd.shelfY + 0.06, overlaps: ["m_wardrobe", `m_folded${k}a`] });
  }

  // ---- laundry basket in the south-east corner with laundry in it
  const bkDef = buildLaundryBasket({ seed: 61 });
  const bk = add("m_basket", bkDef, floorXf(bkDef, 0, { maxX: F.x1 - WALL_GAP, minZ: F.z0 + WALL_GAP }), R, "floor");
  let y = BASKET.floor;
  const piles: Array<[number, number, number]> = [
    [0.34, 0.11, 0.26],
    [0.36, 0.1, 0.25],
    [0.3, 0.1, 0.24],
  ];
  piles.forEach(([w, h, d], k) => {
    const inner = basketInner(y);
    const ww = Math.min(w, 2 * inner.hx - 0.004),
      dd2 = Math.min(d, 2 * inner.hz - 0.004);
    add(`m_laundry${k}`, buildClothes({ seed: 62 + k, style: "crumpled", size: [ww, h, dd2] }), onParent(bk, 0, y, 0, 0), R, k === 0 ? { in: "m_basket" } : { on: `m_laundry${k - 1}` }, {
      restY: y,
      overlaps: ["m_basket", ...(k ? [`m_laundry${k - 1}`] : [])],
    });
    y += h;
  });

  // ---- framed print above the bed (hangs on a picture nail in the party wall)
  add("m_print", buildFramedPrint({ seed: 71, art: "painting_1" }), xfAt(F.x0 + HANG_GAP, 1.28, 2.2, P2), R, "wall");
}

// ------------------------------------------------------------------ bedroom 2
function furnishBed2(add: Add): void {
  const R: RoomId = "bed2";
  const F = roomFaces(R); // x 9.2575..12.8, z 0..4.3425

  // ---- metal double bed in the north-east, headboard on the north wall
  const bedDef = buildMetalBed({ seed: 101 });
  const bd = metalBedDims();
  const bedXf = add("b_bed", bedDef, floorXf(bedDef, Math.PI, { maxZ: F.z1 - WALL_GAP, cx: 11.85 }), R, "floor");
  const md = mattressDims({ w: bd.mattressW, l: bd.mattressL, h: 0.22 });
  const mattXf = add("b_mattress", buildMattress({ seed: 102, w: md.w, l: md.l, h: md.h, tint: 0xeef0f2 }), onParent(bedXf, 0, bd.slatTop, bd.mattressZ), R, { on: "b_bed" }, { restY: bd.slatTop, overlaps: ["b_bed"] });
  const topY = bd.slatTop + md.h;
  const railTop = 0.32;
  const duvetL = 1.45;
  add(
    "b_duvet",
    buildDuvet({ seed: 103, w: md.w + 0.07, l: duvetL, drop: topY - railTop - 0.015, tint: 0x41597a, fold: 0.26 }),
    onParent(mattXf, 0, md.h, md.l / 2 - duvetL / 2),
    R,
    { on: "b_mattress" },
    { restY: topY, contact: ["main"], overlaps: ["b_bed", "b_mattress"] },
  );
  for (const [k, sx] of [
    [0, -1],
    [1, 1],
  ] as Array<[number, number]>) {
    add(`b_pillow${k}`, buildBedPillow({ seed: 104 + k, kind: "sleep", size: [0.6, 0.13, 0.45], tint: 0xe8edf2 }), onParent(mattXf, sx * 0.33, md.h, -md.l / 2 + 0.25), R, { on: "b_mattress" }, { restY: topY, overlaps: ["b_bed", "b_mattress"] });
  }

  // ---- desk under the east window, pulled 17 cm off the wall (baseboard heater behind it)
  const kd = deskDims();
  const deskDef = buildDesk({ seed: 111, top: "white" });
  const desk = add("b_desk", deskDef, floorXf(deskDef, -P2, { maxX: F.x1 - 0.17, maxZ: 2.15 }), R, "floor");
  const onDesk = (id: string, def: AssemblyDef, lx: number, lz: number, yawRel = 0, extra: Partial<BedroomItem> = {}): Xform =>
    add(id, def, onParent(desk, lx, kd.h, lz, yawRel), R, { on: "b_desk" }, { restY: kd.h, overlaps: ["b_desk"], ...extra });
  // desk-local: +Z = user side, -X = user's right (south)
  onDesk("b_pc", buildPcTower({ seed: 112 }), -0.565, -0.105);
  onDesk("b_monitor", buildMonitor({ seed: 113 }), 0.0, -0.21);
  onDesk("b_speaker_r", buildSpeaker({ seed: 114 }), -0.36, -0.245, 0.3);
  onDesk("b_speaker_l", buildSpeaker({ seed: 115 }), 0.36, -0.245, -0.3);
  onDesk("b_keyboard", buildKeyboard({ seed: 116 }), -0.02, 0.12);
  onDesk("b_mouse", buildMouse({ seed: 117 }), -0.255, 0.12, Math.PI);
  onDesk("b_mug", buildCoffeeMug({ seed: 118 }), -0.36, 0.2, Math.PI);
  onDesk("b_laptop", buildLaptop({ seed: 119 }), 0.32, 0.08);
  onDesk("b_lamp", buildDeskLamp({ seed: 120 }), 0.6, -0.27, 0, { overlaps: ["b_desk", "b_papers"] });
  onDesk("b_papers", buildPaperStack({ seed: 121, skew: 1.5 }), 0.588, 0.1, 0, { overlaps: ["b_desk", "b_lamp"] });

  // ---- office chair in front of the desk, facing it
  const chDef = buildOfficeChair({ seed: 131 });
  add("b_chair", chDef, floorXf(chDef, P2, { maxX: desk.p.x - kd.d / 2 - 0.085, cz: desk.p.z }), R, "floor");

  // ---- bookshelf on the west wall, full of books
  const sd = bookshelfDims();
  const shDef = buildBookshelf({ seed: 141 });
  const shelf = add("b_bookshelf", shDef, floorXf(shDef, P2, { minX: F.x0 + WALL_GAP, cz: 1.3 }), R, "floor");
  let seed = 150;
  const shelfFront = sd.inner.z1 - 0.01;
  sd.levels.forEach((lev, li) => {
    const fill = li === 4 ? 0.45 : li === 0 ? 0.5 : 0.72;
    let x = sd.inner.x0 + 0.01;
    const xEnd = sd.inner.x0 + fill * (sd.inner.x1 - sd.inner.x0);
    let k = 0;
    while (x < xEnd) {
      const opts = { seed: seed++, detail: seed % 3 === 0, h: Math.min(0.245, lev.clear - 0.02) } as { seed: number; detail: boolean; h?: number };
      const d0 = bookDims({ seed: opts.seed });
      opts.h = Math.min(d0.h, lev.clear - 0.02);
      const dd = bookDims(opts);
      if (x + dd.t > sd.inner.x1 - 0.01) break;
      const lz = shelfFront - dd.w / 2;
      add(`b_shelf${li}_book${k}`, buildBook(opts), onParent(shelf, x + dd.t / 2, lev.y, lz), R, { in: "b_bookshelf" }, { restY: lev.y, overlaps: ["b_bookshelf"] });
      x += dd.t + 0.002;
      k++;
    }
    // a lying stack in the free part of the bottom and middle shelves
    if (li === 0 || li === 2) {
      let yy = lev.y;
      for (let s = 0; s < 2; s++) {
        const o = { seed: seed++, lying: true, detail: false, h: 0.21, w: 0.15 } as const;
        const dd = bookDims(o);
        const id = `b_shelf${li}_stack${s}`;
        add(id, buildBook(o), onParent(shelf, sd.inner.x1 - 0.13, yy, shelfFront - dd.w / 2 - 0.01, P2 + 0.05 * s), R, s === 0 ? { in: "b_bookshelf" } : { on: `b_shelf${li}_stack${s - 1}` }, {
          restY: yy,
          overlaps: ["b_bookshelf", ...(s ? [`b_shelf${li}_stack${s - 1}`] : [])],
        });
        yy += dd.t;
      }
    }
  });

  // ---- guitar on its stand beside the bookshelf
  const gs = guitarOnStand({ seed: 161 });
  const standXf = add("b_guitar_stand", gs.stand, floorXf(gs.stand, P2, { minX: F.x0 + WALL_GAP + 0.03, cz: 2.2 }), R, "floor");
  add("b_guitar", gs.guitar, compose(standXf, gs.guitarPose), R, { on: "b_guitar_stand" }, { restY: 0.047, overlaps: ["b_guitar_stand"] });

  // ---- beanbag in the south-west reading corner
  const bbDef = buildBeanbag({ seed: 171 });
  add("b_beanbag", bbDef, floorXf(bbDef, 0.4, { minX: F.x0 + WALL_GAP + 0.02, minZ: F.z0 + WALL_GAP + 0.02 }), R, "floor");

  // ---- posters (tape / pins)
  add("b_poster_n", buildPoster({ seed: 181, art: "poster_0" }), xfAt(11.85, 1.25, F.z1 - HANG_GAP, Math.PI), R, "wall");
  add("b_poster_w", buildPoster({ seed: 182, art: "painting_0", w: 0.5, h: 0.7 }), xfAt(F.x0 + HANG_GAP, 1.25, 0.48, P2), R, "wall");
  add("b_poster_e", buildPoster({ seed: 183, art: "photo_0", w: 0.45, h: 0.6 }), xfAt(F.x1 - HANG_GAP, 1.35, 0.6, -P2), R, "wall");
  void SHOE_BOX;
}

/** Furnishing placements of both bedrooms. */
export function furnishBedrooms(): Placement[] {
  return bedroomItems().map((it) => it.placement);
}
