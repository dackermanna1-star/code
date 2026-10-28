// Kitchen casework: base cabinet units, wall cabinets, the west base run and the island.
//
// Construction (European frameless kitchen):
//  * Carcasses: 18 mm white melamine particleboard (16 mm for wall units), doweled; 3 mm HDF
//    back nailed on; base units on a recessed 100 mm plinth; adjustable shelves on pins.
//  * Fronts: 18 mm painted MDF doors on 2 concealed hinges (30 J each, 105°) with a magnetic
//    catch; drawers on two runners (slider joints) with 15 mm particleboard boxes.
//  * Base units are screwed to the wall through the back top rail (world bonds) and to each
//    other through the sides; the stone worktop is siliconed onto rails and sides. Wall units
//    hang on an MDF rail screwed into the wall — yank them hard enough and they come down with
//    everything inside.
//  * The island is screwed to floor cleats, has a finished MDF back on the seating side, end
//    gables and steel corbels under the 300 mm stone overhang.
//
// PURE MODULE (no Babylon).

import { Builder, type V3 } from "../lib/builder.ts";
import { cabinetCarcass, drawer, hingedDoorPanel, type CarcassResult, type HardwareLook } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import { KPAL, LocalFrame, bondEachTouching, centerOf, finish, frontFinish, scoped, type Finish, type FrontColor } from "./lib.ts";
import { CARCASS_D, CARCASS_H, COUNTER_T, COUNTER_Y, FRONT_T, ISLAND, ISLAND_XF, TOE_H, TOE_SET, WALL_CAB, WEST, WEST_XF } from "./layout.ts";

export interface CabinetLook {
  front: Finish;
  carcass: Finish;
  handle: HardwareLook;
}

export type FrontSpec = { kind: "door"; hinge: "left" | "right" } | { kind: "doors" } | { kind: "drawers"; heights: number[] } | { kind: "none" };

export interface BaseCabOpts {
  w: number;
  h?: number;
  d?: number;
  fronts: FrontSpec;
  /** Top face height of an adjustable shelf (base units: ~0.45). */
  shelf?: number;
  top?: "rails" | "none";
  back?: boolean;
  look: CabinetLook;
}

export interface BaseCabResult {
  carcass: CarcassResult;
  /** Parts a worktop rests on (rails + sides). */
  support: string[];
  doors: string[];
  drawers: Array<{ front: string; bottom: string; sides: [string, string] }>;
  all: string[];
}

const GAP = 0.002; // reveal between fronts

/**
 * Base cabinet unit: carcass on a recessed plinth + doors or drawers. Local frame: x ∈ ±w/2,
 * y ∈ [0, h], carcass back at z = -d/2, carcass front at z = d/2, fronts in front of it.
 */
export function baseCabinet(b: Builder, name: string, o: BaseCabOpts, pos: V3 = [0, 0, 0]): BaseCabResult {
  const h = o.h ?? CARCASS_H;
  const d = o.d ?? CARCASS_D;
  const L = o.look;
  return scoped(b, name, pos, undefined, () => {
    const car = cabinetCarcass(b, "car", {
      w: o.w,
      h,
      d,
      t: 0.018,
      mat: "particleboard",
      surf: L.carcass.surf,
      tint: L.carcass.tint,
      back: o.back === false ? false : { t: 0.003 },
      toeKick: { h: TOE_H, setback: TOE_SET },
      top: o.top ?? "rails",
      shelves: o.shelf ? [o.shelf] : [],
      joinery: "dowel",
    });
    const zf = d / 2;
    const y0 = TOE_H;
    const y1 = h - 0.003;
    const doors: string[] = [];
    const drawers: BaseCabResult["drawers"] = [];
    const extra: string[] = [];
    const handle = (vertical: boolean) => ({ kind: "bar" as const, vertical, len: 0.128, ...L.handle });
    const f = o.fronts;
    if (f.kind === "door" || f.kind === "doors") {
      const pair = f.kind === "doors";
      const dw = pair ? (o.w - 3 * GAP) / 2 : o.w - 2 * GAP;
      const specs: Array<{ x: number; hinge: "left" | "right" }> = pair
        ? [
            { x: -(dw / 2 + GAP / 2), hinge: "left" },
            { x: dw / 2 + GAP / 2, hinge: "right" },
          ]
        : [{ x: 0, hinge: f.hinge }];
      specs.forEach((s, k) => {
        const r = hingedDoorPanel(
          b,
          `door${k}`,
          {
            w: dw,
            h: y1 - y0,
            t: FRONT_T,
            kind: "solid",
            mat: "mdf",
            surf: L.front.surf,
            tint: L.front.tint,
            hinge: s.hinge,
            fixed: s.hinge === "left" ? car.left : car.right,
            hingeStrength: 30,
            openDeg: 105,
            latch: 3,
            handle: handle(true),
          },
          [s.x, y0, zf + FRONT_T / 2],
        );
        doors.push(r.slab);
        extra.push(...r.all);
      });
    } else if (f.kind === "drawers") {
      const innerW = o.w - 2 * 0.018;
      const bw = innerW - 0.026; // 13 mm runner clearance each side
      const bd = d - 0.003 - 0.047;
      let top = y1;
      f.heights.forEach((fh, k) => {
        const fb = top - fh; // front bottom
        const boxY = fb + 0.025;
        const bh = Math.max(0.06, fh - 0.05);
        const r = drawer(
          b,
          `drw${k}`,
          {
            w: bw,
            h: bh,
            d: bd,
            front: { w: o.w - 2 * GAP, h: fh, t: FRONT_T, mat: "mdf", surf: L.front.surf, tint: L.front.tint, dy: -0.025 },
            mat: "particleboard",
            surf: L.carcass.surf,
            tint: L.carcass.tint,
            fixed: [car.left, car.right],
            travel: bd * 0.85,
            strength: 50,
            friction: 0.25,
            handle: handle(false),
          },
          [0, boxY, zf],
        );
        drawers.push({ front: r.front, bottom: r.bottom, sides: r.sides });
        extra.push(...r.all);
        top = fb - 0.003;
      });
    }
    const support = [...car.top, car.left, car.right];
    return { carcass: car, support, doors, drawers, all: [...car.all, ...extra] };
  });
}

export interface WallCabOpts {
  w: number;
  h?: number;
  d?: number;
  doors: 1 | 2;
  hinge?: "left" | "right";
  /** Shelf top height; false = none. Default mid height. */
  shelf?: number | false;
  look: CabinetLook;
  /** Under-cabinet LED strip (light feature). Default true. */
  led?: boolean;
  /** Wall anchor strength per screw (J): concrete anchors ~60, stud screws ~40. */
  anchor?: number;
}

export interface WallCabResult {
  carcass: CarcassResult;
  rail: string;
  doors: string[];
  led?: string;
  all: string[];
}

/**
 * Wall cabinet: 16 mm carcass with full top/bottom, HDF back, hanging rail screwed to the wall
 * (world bond), adjustable shelf, overlay doors with the handles low, optional LED strip under
 * the front edge. Local frame: x ∈ ±w/2, y ∈ [0, h] (the strip hangs 10 mm below y = 0), back
 * at z = -d/2, doors in front of z = d/2.
 */
export function wallCabinet(b: Builder, name: string, o: WallCabOpts, pos: V3 = [0, 0, 0]): WallCabResult {
  const h = o.h ?? WALL_CAB.h;
  const d = o.d ?? WALL_CAB.d;
  const t = 0.016;
  const L = o.look;
  return scoped(b, name, pos, undefined, () => {
    const shelfY = o.shelf === false ? null : (o.shelf ?? Math.round((h / 2) * 1000) / 1000);
    const car = cabinetCarcass(b, "car", {
      w: o.w,
      h,
      d,
      t,
      mat: "particleboard",
      surf: L.carcass.surf,
      tint: L.carcass.tint,
      back: { t: 0.003 },
      toeKick: false,
      top: "full",
      shelves: shelfY !== null ? [shelfY] : [],
      joinery: "dowel",
    });
    // hanging rail under the top panel against the back
    const rail = b.box("rail", "mdf", "mdf", [o.w - 2 * t, 0.08, 0.018], [0, h - t - 0.04, -d / 2 + 0.003 + 0.009]);
    b.screw(rail, car.left, 2, 30);
    b.screw(rail, car.right, 2, 30);
    b.glue(rail, car.top[0], 20);
    b.nail(rail, car.back!, 4, 6);
    b.world(rail, "screw", 2 * (o.anchor ?? 60), [0, h - t - 0.04, -d / 2 + 0.003]);
    // doors
    const doors: string[] = [];
    const extra: string[] = [];
    const dh = h - 2 * GAP;
    const dw = o.doors === 2 ? (o.w - 3 * GAP) / 2 : o.w - 2 * GAP;
    const specs: Array<{ x: number; hinge: "left" | "right" }> =
      o.doors === 2
        ? [
            { x: -(dw / 2 + GAP / 2), hinge: "left" },
            { x: dw / 2 + GAP / 2, hinge: "right" },
          ]
        : [{ x: 0, hinge: o.hinge ?? "left" }];
    specs.forEach((s, k) => {
      const r = hingedDoorPanel(
        b,
        `door${k}`,
        {
          w: dw,
          h: dh,
          t: FRONT_T - 0.002,
          kind: "solid",
          mat: "mdf",
          surf: L.front.surf,
          tint: L.front.tint,
          hinge: s.hinge,
          fixed: s.hinge === "left" ? car.left : car.right,
          hingeStrength: 30,
          openDeg: 105,
          latch: 3,
          handle: { kind: "bar", vertical: true, len: 0.096, ...L.handle },
          handleHeight: 0.09,
        },
        [s.x, GAP, d / 2 + (FRONT_T - 0.002) / 2],
      );
      doors.push(r.slab);
      extra.push(...r.all);
    });
    let led: string | undefined;
    if (o.led !== false) {
      const zc = d / 2 - 0.045;
      const chan = b.box("led_chan", "aluminum", "aluminum", [o.w - 0.08, 0.008, 0.017], [0, -0.004, zc], { tess: 0 });
      led = b.box("led", "plastic", "bulb_on", [o.w - 0.09, 0.002, 0.012], [0, -0.009, zc], { tint: 0xffffff });
      b.screw(chan, car.bottom, 2, 10);
      b.clip(led, chan, 4);
      b.light({ part: led, pos: [0, -0.03, zc], kind: "point", color: 0xffe0b8, intensity: 0.3, range: 1.4, castShadows: false, mains: true, on: true });
      extra.push(chan, led);
    }
    return { carcass: car, rail, doors, led, all: [...car.all, rail, ...extra] };
  });
}

// ============================================================================ wall cabinet

export interface KitchenWallCabinetOpts {
  w?: number;
  doors?: 1 | 2;
  hinge?: "left" | "right";
  color?: FrontColor;
  led?: boolean;
  seed?: number;
}

/** Wall cabinet (0.6–0.8 m wide, 0.75 m tall, 0.33 m deep) for above the worktop. Origin: bottom centre. */
export function buildKitchenWallCabinet(o: KitchenWallCabinetOpts = {}): AssemblyDef {
  const w = o.w ?? 0.8;
  const b = new Builder("kitchenWallCabinet", "Kitchen Wall Cabinet", "furniture", 260, o.seed);
  wallCabinet(b, "", {
    w,
    doors: o.doors ?? (w > 0.65 ? 2 : 1),
    hinge: o.hinge,
    look: { front: frontFinish(o.color, KPAL.upperFront), carcass: KPAL.carcass, handle: KPAL.brass },
    led: o.led,
  });
  return finish(b);
}

// ============================================================================ helpers for runs

/** Screw each pair of touching carcass sides of neighbouring units together. */
function joinUnits(b: Builder, units: BaseCabResult[]): void {
  for (let i = 0; i + 1 < units.length; i++) {
    const A = units[i].carcass,
      B = units[i + 1].carcass;
    for (const a of [A.left, A.right])
      for (const c of [B.left, B.right]) {
        const ct = b.contact(a, c, 0.001);
        if (ct && ct.kind === "face") b.screw(a, c, 2, 30);
      }
  }
}

/** Silicone the worktop pieces onto every support part they rest on. */
export function glueTop(b: Builder, top: string[], supports: string[], each = 25): number {
  let n = 0;
  for (const t of top) n += bondEachTouching(b, t, supports, "glue", each, 0.0015);
  return n;
}

// ============================================================================ west run

export interface WestRunOpts {
  color?: FrontColor;
  counter?: Finish;
  seed?: number;
}

/**
 * West base run (three 0.6 m units along the plumbing wall: drawers, door, door) with its stone
 * worktop and a painted end gable. Built for the kitchen layout (WEST_XF); origin at the worktop
 * footprint centre, front +Z.
 */
export function buildKitchenWestRun(o: WestRunOpts = {}): AssemblyDef {
  const b = new Builder("kitchenWestRun", "Kitchen Base Cabinets (West)", "furniture", 1450, o.seed);
  const lf = new LocalFrame(WEST_XF);
  const look: CabinetLook = { front: frontFinish(o.color, KPAL.lowerFront), carcass: KPAL.carcass, handle: KPAL.brass };
  const counter = o.counter ?? KPAL.counter;
  const zc = (WEST.carcassBackX + WEST.carcassFrontX) / 2;
  const unitAt = (z0: number, z1: number): { w: number; pos: V3 } => {
    const c = lf.p(zc, 0, (z0 + z1) / 2);
    return { w: Math.abs(z1 - z0), pos: [c[0], 0, c[2]] };
  };
  const u1 = unitAt(WEST.w1[0], WEST.w1[1]);
  const u2 = unitAt(WEST.w2[0], WEST.w2[1]);
  const u3 = unitAt(WEST.w3[0], WEST.w3[1]);
  // local -X points north (towards the corner): hinge the doors on that side
  const w1 = baseCabinet(b, "w1", { w: u1.w, fronts: { kind: "drawers", heights: [0.157, 0.307, 0.307] }, look }, u1.pos);
  const w2 = baseCabinet(b, "w2", { w: u2.w, fronts: { kind: "door", hinge: "left" }, shelf: 0.45, look }, u2.pos);
  const w3 = baseCabinet(b, "w3", { w: u3.w, fronts: { kind: "door", hinge: "left" }, shelf: 0.45, look }, u3.pos);
  const units = [w3, w2, w1];
  joinUnits(b, units);
  // painted end gable at the south end (covers the carcass side and the door edge)
  const g = lf.box(WEST.carcassBackX, WEST.doorFrontX, 0, CARCASS_H, WEST.endPanelZ[0], WEST.endPanelZ[1]);
  const gable = b.box("gable", "mdf", look.front.surf, g.size, g.pos, { tint: look.front.tint });
  const gTouch = bondEachTouching(b, gable, [w1.carcass.left, w1.carcass.right], "screw", 90, 0.001);
  if (!gTouch) b.warn("west run: end gable does not touch the end unit");
  // worktop
  const tp = lf.box(WEST.topBackX, WEST.topFrontX, CARCASS_H, COUNTER_Y, WEST.topZ0, WEST.topZ1);
  const top = b.box("top", "stone", counter.surf, tp.size, tp.pos, { tint: counter.tint, supported: true });
  glueTop(b, [top], [...units.flatMap((u) => u.support), gable], 25);
  // screwed to the studs through the back rails (2 screws per unit)
  for (const u of units) {
    const rail = u.carcass.top.find((p) => p.endsWith("rail_b"))!;
    b.world(rail, "screw", 2 * 40, centerOf(b, rail));
  }
  return finish(b);
}

// ============================================================================ island

export interface IslandOpts {
  color?: FrontColor;
  counter?: Finish;
  seed?: number;
}

/**
 * Kitchen island: three base units (drawers, double door, door) facing the cooking side, a
 * finished MDF back and end gables, a one-piece 2.24 × 0.92 m stone top with a 300 mm seating
 * overhang carried by four steel corbels, screwed to floor cleats. Origin at the top's footprint
 * centre on the floor; doors face +Z, seating overhang on -Z.
 */
export function buildKitchenIsland(o: IslandOpts = {}): AssemblyDef {
  const b = new Builder("kitchenIsland", "Kitchen Island", "furniture", 2600, o.seed);
  const lf = new LocalFrame(ISLAND_XF);
  const look: CabinetLook = { front: frontFinish(o.color, KPAL.lowerFront), carcass: KPAL.carcass, handle: KPAL.brass };
  const counter = o.counter ?? KPAL.counter;
  const zc = (ISLAND.carcassBackZ + ISLAND.carcassFrontZ) / 2;
  const unit = (k: number): { w: number; pos: V3 } => {
    const [x0, x1] = ISLAND.units[k];
    const c = lf.p((x0 + x1) / 2, 0, zc);
    return { w: x1 - x0, pos: [c[0], 0, c[2]] };
  };
  const a = unit(0),
    c = unit(1),
    e = unit(2);
  const i1 = baseCabinet(b, "i1", { w: a.w, fronts: { kind: "drawers", heights: [0.157, 0.307, 0.307] }, look }, a.pos);
  const i2 = baseCabinet(b, "i2", { w: c.w, fronts: { kind: "doors" }, shelf: 0.45, look }, c.pos);
  const i3 = baseCabinet(b, "i3", { w: e.w, fronts: { kind: "door", hinge: "right" }, shelf: 0.45, look }, e.pos);
  const units = [i1, i2, i3];
  joinUnits(b, units);
  const x0 = ISLAND.units[0][0],
    x1 = ISLAND.units[2][1];
  const doorFront = ISLAND.carcassFrontZ + FRONT_T;
  // finished back on the seating side
  const bp = lf.box(x0, x1, 0, CARCASS_H, ISLAND.backPanelZ[0], ISLAND.backPanelZ[1]);
  const back = b.box("backpanel", "mdf", look.front.surf, bp.size, bp.pos, { tint: look.front.tint });
  for (const u of units) bondEachTouching(b, back, [u.carcass.left, u.carcass.right, u.carcass.back!], "screw", 45, 0.001);
  // end gables
  const gl = lf.box(x0 - 0.018, x0, 0, CARCASS_H, ISLAND.backPanelZ[0], doorFront);
  const gr = lf.box(x1, x1 + 0.018, 0, CARCASS_H, ISLAND.backPanelZ[0], doorFront);
  const gableL = b.box("gable_l", "mdf", look.front.surf, gl.size, gl.pos, { tint: look.front.tint });
  const gableR = b.box("gable_r", "mdf", look.front.surf, gr.size, gr.pos, { tint: look.front.tint });
  bondEachTouching(b, gableL, [i1.carcass.left, i1.carcass.right], "screw", 90, 0.001);
  bondEachTouching(b, gableR, [i3.carcass.left, i3.carcass.right], "screw", 90, 0.001);
  b.glue(gableL, back, 20);
  b.glue(gableR, back, 20);
  // stone top
  const T = ISLAND.top;
  const tp = lf.box(T.x0, T.x1, CARCASS_H, COUNTER_Y, T.z0, T.z1);
  const top = b.box("top", "stone", counter.surf, tp.size, tp.pos, { tint: counter.tint, supported: true });
  glueTop(b, [top], [...units.flatMap((u) => u.support), back, gableL, gableR], 25);
  // steel corbels under the overhang (screwed through the back into the carcasses)
  const backFace = ISLAND.backPanelZ[0];
  [5.74, 6.44, 7.16, 7.86].forEach((wx, k) => {
    const v = lf.box(wx - 0.02, wx + 0.02, 0.66, CARCASS_H, backFace - 0.006, backFace);
    const hzb = lf.box(wx - 0.02, wx + 0.02, CARCASS_H - 0.006, CARCASS_H, T.z0 + 0.04, backFace - 0.006);
    const legV = b.box(`corbel${k}_v`, "steel", "metal_black", v.size, v.pos, { tess: 0 });
    const legH = b.box(`corbel${k}_h`, "steel", "metal_black", hzb.size, hzb.pos, { tess: 0 });
    b.weld(legV, legH, 300);
    b.screw(legV, back, 3, 30);
    b.glue(legH, top, 40);
  });
  // floor cleats: each unit's sides screwed down
  for (const u of units) {
    for (const s of [u.carcass.left, u.carcass.right]) {
      const [cx, , cz] = centerOf(b, s);
      b.world(s, "screw", 60, [cx, 0, cz]);
    }
  }
  void COUNTER_T;
  return finish(b);
}
