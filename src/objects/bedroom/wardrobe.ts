// Two-door wardrobe + shoe box.
//  * buildWardrobe: 16 mm laminated particleboard carcass (sides, top, bottom on a plinth, HDF
//    back nailed on), hat shelf on pins, steel hanging rod resting in two screwed-on plastic
//    sockets, two 16 mm doors on three concealed hinges each with magnetic catches and bar pulls,
//    and four garments on hangers (steel hook + wooden bar + soft garment) resting on the rod
//    (friction bonds: knock the wardrobe and they slip off and pile up inside).
//  * buildShoeBox: cardboard tray (bottom + 4 walls), loose lid, a pair of shoes inside.
// Local frame: origin on the floor at the centre, doors at +Z. PURE MODULE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { cabinetCarcass, hingedDoorPanel } from "../lib/kit.ts";
import { boxR, finish, mk, softBlock, type BaseOpts } from "./common.ts";

export interface WardrobeOpts extends BaseOpts {
  style?: "white" | "walnut";
  /** Hang garments on the rod (default true). */
  clothes?: boolean;
}

const WD = {
  w: 1.0,
  h: 2.0,
  d: 0.56, // carcass depth (doors in front)
  t: 0.016,
  doorT: 0.016,
  doorGap: 0.002,
  plinth: 0.07,
  shelfTop: 1.72,
  rodY: 1.62,
  rodR: 0.0125,
};

export interface WardrobeDims {
  w: number;
  h: number;
  /** Total depth incl. doors and handles' standoff excluded. */
  d: number;
  /** Local z of the carcass back face / front face / door front face. */
  zBack: number;
  zFront: number;
  zDoor: number;
  /** Inside floor (top of the bottom panel), hat-shelf top, inner x/z ranges. */
  floorY: number;
  shelfY: number;
  inner: { x0: number; x1: number; z0: number; z1: number };
  rodY: number;
}

export function wardrobeDims(): WardrobeDims {
  const { w, h, d, t, doorT, doorGap, plinth, shelfTop, rodY } = WD;
  return {
    w,
    h,
    d: d + doorGap + doorT,
    zBack: -d / 2,
    zFront: d / 2,
    zDoor: d / 2 + doorGap + doorT,
    floorY: plinth + t,
    shelfY: shelfTop,
    inner: { x0: -w / 2 + t, x1: w / 2 - t, z0: -d / 2 + 0.003, z1: d / 2 },
    rodY,
  };
}

/** Garments: [x along the rod, thickness (x), length (y), width (z), tint, kg]. */
const GARMENTS: Array<[number, number, number, number, number, number]> = [
  [-0.33, 0.05, 0.74, 0.44, 0xf2efe6, 0.25], // shirt
  [-0.15, 0.06, 1.05, 0.4, 0x2d3a5c, 0.45], // dress
  [0.05, 0.085, 0.8, 0.46, 0x5b4a3a, 0.9], // jacket
  [0.25, 0.05, 0.62, 0.38, 0x46566e, 0.6], // trousers folded over the bar
];

export function buildWardrobe(o: WardrobeOpts = {}): AssemblyDef {
  const walnut = o.style === "walnut";
  const b = mk("wardrobe", "Wardrobe", "furniture", 380, o);
  const surf: SurfaceName = walnut ? "wood_walnut" : "laminate_white";
  const tint = walnut ? 0xffffff : 0xf3f1ec;
  const { w, h, d, t, doorT, doorGap, plinth, shelfTop, rodY, rodR } = WD;
  const c = cabinetCarcass(b, "case", { w, h, d, t, mat: "particleboard", surf, tint, top: "full", toeKick: { h: plinth, setback: 0 }, shelves: [shelfTop], pinStrength: 6, joinery: "dowel" });
  const zc = (c.inner.z0 + c.inner.z1) / 2;
  const xi = w / 2 - t;

  // ---- hanging rod in two screwed-on plastic sockets
  const sockL = b.cyl("rod_socket_l", "plastic", "plastic", 0.017, 0.012, [-xi + 0.006, rodY, zc], { axis: "x", segments: 10, tint: 0xd8d8d8 });
  const sockR = b.cyl("rod_socket_r", "plastic", "plastic", 0.017, 0.012, [xi - 0.006, rodY, zc], { axis: "x", segments: 10, tint: 0xd8d8d8 });
  b.screw(sockL, c.left, 2, 20);
  b.screw(sockR, c.right, 2, 20);
  const rodLen = 2 * (xi - 0.012);
  const rod = b.cyl("rod", "steel", "chrome", rodR, rodLen, [0, rodY, zc], { axis: "x", segments: 10, mass: 0.62 });
  b.press(rod, sockL, 15);
  b.press(rod, sockR, 15);

  // ---- garments on hangers resting on the rod
  if (o.clothes !== false) {
    const zN = zc + rodR + 0.004; // hook neck beside the rod
    GARMENTS.forEach(([x, gt, gl, gw, gTint, kg], k) => {
      const barY1 = rodY - 0.063,
        barY0 = barY1 - 0.022;
      const zMid = zN;
      const bar = boxR(b, `hanger${k}_bar`, "hardwood", "wood_oak", [x - 0.006, x + 0.006], [barY0, barY1], [zMid - 0.21, zMid + 0.21], { grain: "z" });
      const neckTop = rodY + rodR + 0.006;
      const neck = boxR(b, `hanger${k}_neck`, "steel", "chrome", [x - 0.002, x + 0.002], [barY1, neckTop], [zN, zN + 0.004], { tess: 0 });
      const tip = boxR(b, `hanger${k}_hook`, "steel", "chrome", [x - 0.002, x + 0.002], [neckTop - 0.004, neckTop], [zc - rodR - 0.002, zN], { tess: 0 });
      b.weld(tip, neck, 30);
      b.screw(neck, bar, 1, 20);
      b.friction(tip, rod, 4);
      const g = softBlock(b, `hanger${k}_garment`, "fabric", "fabric_cotton", [gt, gl, gw], 0.25, [x, barY0 - gl / 2 + 0.004, zMid], { tint: gTint, mass: kg }, 2);
      b.friction(g, bar, 3);
      b.stuffing(g, "fiber");
    });
  }

  // ---- two overlay doors on concealed hinges, magnetic catches under the hat shelf
  const dw = (w - doorGap) / 2;
  const dh = h - plinth - 2 * doorGap;
  const zDoor = d / 2 + doorGap + doorT / 2;
  for (const [side, x] of [
    ["left", -w / 4 - doorGap / 4],
    ["right", w / 4 + doorGap / 4],
  ] as Array<["left" | "right", number]>) {
    hingedDoorPanel(
      b,
      side === "left" ? "door_l" : "door_r",
      {
        w: dw,
        h: dh,
        t: doorT,
        kind: "solid",
        mat: "particleboard",
        surf,
        tint,
        hinge: side,
        swing: "front",
        fixed: side === "left" ? c.left : c.right,
        hinges: 3,
        hingeStrength: 30,
        hingeInset: 0.16,
        openDeg: 110,
        friction: 0.08,
        latch: { strength: 3, fixed: c.shelves[0] },
        handle: { kind: "bar", vertical: true, len: 0.32, mat: "aluminum", surf: "steel_brushed" },
        handleHeight: 1.0,
        hardware: false,
      },
      [x, plinth + doorGap, zDoor],
    );
  }
  return finish(b, o);
}

// ------------------------------------------------------------------ shoe box

export interface ShoeBoxOpts extends BaseOpts {
  tint?: number;
  /** Include a pair of shoes inside (default true). */
  shoes?: boolean;
}

export const SHOE_BOX = { w: 0.33, h: 0.12, d: 0.2 } as const;

export function buildShoeBox(o: ShoeBoxOpts = {}): AssemblyDef {
  const b = mk("shoeBox", "Shoe Box", "misc", 90, o);
  const { w, h, d } = SHOE_BOX;
  const t = 0.002;
  const tint = o.tint ?? 0xc9a77c;
  const C = { tint };
  const bottom = boxR(b, "bottom", "cardboard", "cardboard", [-w / 2, w / 2], [0, t], [-d / 2, d / 2], C);
  const wallY: [number, number] = [t, h - t];
  const wf = boxR(b, "wall_f", "cardboard", "cardboard", [-w / 2, w / 2], wallY, [d / 2 - t, d / 2], C);
  const wb = boxR(b, "wall_b", "cardboard", "cardboard", [-w / 2, w / 2], wallY, [-d / 2, -d / 2 + t], C);
  const wl = boxR(b, "wall_l", "cardboard", "cardboard", [-w / 2, -w / 2 + t], wallY, [-d / 2 + t, d / 2 - t], C);
  const wr = boxR(b, "wall_r", "cardboard", "cardboard", [w / 2 - t, w / 2], wallY, [-d / 2 + t, d / 2 - t], C);
  for (const p of [wf, wb, wl, wr]) b.glue(p, bottom, 8);
  for (const p of [wl, wr]) {
    b.glue(p, wf, 5);
    b.glue(p, wb, 5);
  }
  const lid = boxR(b, "lid", "cardboard", "cardboard", [-w / 2, w / 2], [h - t, h], [-d / 2, d / 2], { tint: 0xd8bc93 });
  b.friction(lid, wf, 2);
  b.friction(lid, wb, 2);
  if (o.shoes !== false) {
    // a pair of sneakers lying toe-to-heel (rubber sole + upper as one convex lump each)
    for (const [k, sz] of [
      [0, -1],
      [1, 1],
    ] as Array<[number, number]>) {
      const zc = sz * 0.045;
      const shoe = softBlock(b, `shoe${k}`, "rubber", "leather", [0.27, 0.085, 0.085], 0.35, [sz * 0.01, t + 0.0425 + 0.0005, zc], { tint: k ? 0x2f2f33 : 0x2f2f33, mass: 0.35 }, 2);
      b.friction(shoe, bottom, 1);
    }
  }
  return finish(b, o);
}
