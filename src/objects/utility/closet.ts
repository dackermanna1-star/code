// Built-in coat closet (1185 × 680 × 2400 mm) for the foyer corner: two 16 mm laminated
// particleboard side panels and a top screwed to the walls, a header above the doors, two pairs
// of hollow-core BIFOLD doors (each pair: outer panel on the jamb, inner panel folding back on
// it, weak magnetic catches), a chrome hanging rod in plastic sockets, a shelf resting on cleats,
// and three coats on hangers that swing on the rod (hinges) — knock them off, tear them down.
//
// Frame: origin on the floor at the centre of the footprint, doors +Z, back (wall) −Z.
// Shelf top at COAT_CLOSET.shelfTop (for the boxes placed on it).

import { hingedDoorPanel } from "../lib/kit.ts";
import { boxR, finish, mk, tubeKgPerM, CHROME, type BaseOpts } from "./helpers.ts";
import type { Builder } from "../lib/builder.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";

export interface CoatClosetOpts extends BaseOpts {
  w?: number;
  d?: number;
  tint?: number;
  doorTint?: number;
  coats?: number;
  /** Side panels screwed into a side wall too: "l" (−X side), "r" (+X), or none. */
  sideWall?: "l" | "r" | "none";
}

export const COAT_CLOSET = {
  w: 1.185,
  d: 0.68,
  h: 2.4,
  t: 0.016,
  shelfTop: 1.818,
  /** Shelf depth from the back. */
  shelfD: 0.35,
  rodY: 1.7,
} as const;

const COAT_TINTS = [0x2c3e5c, 0xb08a5a, 0x4f5a3a, 0x7a2e2e];

function coat(b: Builder, k: number, x: number, rod: string, rodY: number, rodZ: number, rodR: number): void {
  const tint = COAT_TINTS[k % COAT_TINTS.length];
  b.group([x, 0, 0], undefined, `coat${k}_`, () => {
    // hook over the rod (pivot = rod axis), neck down in front of the rod, plastic hanger, coat
    const hook = boxR(b, "hook", "steel", "chrome", [-0.003, 0.003], [rodY + rodR, rodY + rodR + 0.022], [rodZ - 0.004, rodZ + rodR + 0.007], { tess: 0, mass: 0.01 });
    const neck = boxR(b, "neck", "steel", "chrome", [-0.003, 0.003], [rodY - 0.035, rodY + rodR], [rodZ + rodR + 0.003, rodZ + rodR + 0.007], { tess: 0, mass: 0.008 });
    b.weld(neck, hook, 40);
    const zc = rodZ + rodR + 0.005;
    const hanger = b.hull(
      "hanger",
      "plastic",
      "plastic",
      [
        [-0.006, rodY - 0.035, zc - 0.012],
        [0.006, rodY - 0.035, zc - 0.012],
        [-0.006, rodY - 0.035, zc + 0.012],
        [0.006, rodY - 0.035, zc + 0.012],
        [-0.006, rodY - 0.13, zc - 0.21],
        [0.006, rodY - 0.13, zc - 0.21],
        [-0.006, rodY - 0.13, zc + 0.21],
        [0.006, rodY - 0.13, zc + 0.21],
        [-0.006, rodY - 0.14, zc - 0.205],
        [0.006, rodY - 0.14, zc - 0.205],
        [-0.006, rodY - 0.14, zc + 0.205],
        [0.006, rodY - 0.14, zc + 0.205],
      ],
      [0, 0, 0],
      { tint: 0x2a2a2a, mass: 0.06 },
    );
    b.weld(hanger, neck, 30);
    // the coat: shoulders on the hanger, body hanging to ~0.95 m below the rod
    const top = rodY - 0.14;
    const body = b.hull(
      "body",
      "fabric",
      "fabric_upholstery",
      [
        [-0.035, top, zc - 0.22],
        [0.035, top, zc - 0.22],
        [-0.035, top, zc + 0.22],
        [0.035, top, zc + 0.22],
        [-0.045, top - 0.86, zc - 0.25],
        [0.045, top - 0.86, zc - 0.25],
        [-0.045, top - 0.86, zc + 0.25],
        [0.045, top - 0.86, zc + 0.25],
      ],
      [0, 0, 0],
      { tint, mass: 1.4 },
    );
    // turned-up collar on the front side of the hanger
    const collar = boxR(b, "collar", "fabric", "fabric_upholstery", [0.0065, 0.034], [top, top + 0.05], [zc - 0.07, zc + 0.07], { tint, mass: 0.05 });
    b.clip(body, hanger, 10);
    b.glue(collar, body, 20);
    b.stuffing(body, "fiber");
    b.hinge(hook, rod, { pivots: [[0, rodY, rodZ]], axis: [1, 0, 0], min: -35, max: 35, strength: 12, friction: 0.5 });
  });
}

export function buildCoatCloset(o: CoatClosetOpts = {}): AssemblyDef {
  const b = mk("coatCloset", "Coat Closet", "furniture", 900, o);
  const W = o.w ?? COAT_CLOSET.w,
    D = o.d ?? COAT_CLOSET.d,
    H = COAT_CLOSET.h,
    t = COAT_CLOSET.t;
  const tint = o.tint ?? 0xf3f2ee;
  const doorTint = o.doorTint ?? 0xf6f5f0;
  const pb = { tint };

  // ------------------------------------------------------------------ carcass
  const sideL = boxR(b, "side_l", "particleboard", "laminate_white", [-W / 2, -W / 2 + t], [0, H], [-D / 2, D / 2], pb);
  const sideR = boxR(b, "side_r", "particleboard", "laminate_white", [W / 2 - t, W / 2], [0, H], [-D / 2, D / 2], pb);
  const ix = W / 2 - t;
  const top = boxR(b, "top", "particleboard", "laminate_white", [-ix, ix], [H - t, H], [-D / 2, D / 2], pb);
  const doorTop = 2.06;
  const header = boxR(b, "header", "particleboard", "laminate_white", [-ix, ix], [doorTop, H - t], [D / 2 - t, D / 2], pb);
  b.screw(top, sideL, 3, 30);
  b.screw(top, sideR, 3, 30);
  b.screw(header, sideL, 2, 30);
  b.screw(header, sideR, 2, 30);
  b.screw(header, top, 2, 30);
  // screwed to the back wall (and a side wall) through cleats
  // side panels screwed through cleats into the back wall (and into the side wall when the
  // closet stands in a corner: one bond per panel with the summed strength, anchored between)
  b.world(sideL, "screw", o.sideWall === "l" ? 140 : 70, o.sideWall === "l" ? [-W / 2 + t / 2, 1.2, -D / 4] : [-W / 2 + t / 2, 1.2, -D / 2]);
  b.world(sideR, "screw", o.sideWall === "r" ? 140 : 70, o.sideWall === "r" ? [W / 2 - t / 2, 1.2, -D / 4] : [W / 2 - t / 2, 1.2, -D / 2]);
  b.world(top, "screw", 60, [0, H - t / 2, -D / 2]);

  // ------------------------------------------------------------------ shelf on cleats, rod in sockets
  const sTop = COAT_CLOSET.shelfTop;
  const sD = COAT_CLOSET.shelfD;
  const cleats: string[] = [];
  for (const [k, xr] of [
    ["l", [-ix, -ix + 0.018]],
    ["r", [ix - 0.018, ix]],
  ] as Array<[string, [number, number]]>) {
    const c = boxR(b, `cleat_${k}`, "mdf", "mdf", xr, [sTop - 0.018 - 0.05, sTop - 0.018], [-D / 2, -D / 2 + sD], {});
    b.screw(c, k === "l" ? sideL : sideR, 2, 30);
    cleats.push(c);
  }
  const shelf = boxR(b, "shelf", "mdf", "laminate_white", [-ix + 0.001, ix - 0.001], [sTop - 0.018, sTop], [-D / 2, -D / 2 + sD], pb);
  for (const c of cleats) b.friction(shelf, c, 8);
  const rodY = COAT_CLOSET.rodY;
  const rodZ = -D / 2 + 0.3;
  const rodR = 0.0127;
  const sockets: string[] = [];
  for (const [k, sx] of [
    ["l", -1],
    ["r", 1],
  ] as Array<[string, number]>) {
    const s = b.cyl(`socket_${k}`, "plastic", "plastic", 0.022, 0.012, [sx * (ix - 0.006), rodY, rodZ], { axis: "x", segments: 10, tint: 0xf0f0ee, mass: 0.01 });
    b.screw(s, sx < 0 ? sideL : sideR, 2, 20);
    sockets.push(s);
  }
  const rodLen = 2 * (ix - 0.012);
  const rod = b.cyl("rod", CHROME.mat, CHROME.surf, rodR, rodLen, [0, rodY, rodZ], { axis: "x", segments: 10, mass: tubeKgPerM(2 * rodR, 0.001, 7850) * rodLen, tess: 0 });
  for (const s of sockets) b.press(rod, s, 25);

  // ------------------------------------------------------------------ bifold doors (two pairs)
  const gap = 0.003;
  const pw = (2 * ix - 3 * gap - 2 * 0.001) / 4;
  const ph = doorTop - 0.012 - 0.004;
  const pt = 0.03;
  const zc = D / 2 - 0.004 - pt / 2;
  const panel = (name: string, cx: number, hinge: "left" | "right", swing: "front" | "back", fixed: string, knob: boolean) =>
    hingedDoorPanel(
      b,
      name,
      {
        w: pw,
        h: ph,
        t: pt,
        kind: "hollow",
        mat: "mdf",
        surf: "wood_painted",
        tint: doorTint,
        hinge,
        swing,
        fixed,
        hinges: 2,
        hingeStrength: 35,
        hardware: false,
        openDeg: 175,
        friction: 0.1,
        latch: 2,
        handle: knob ? { kind: "knob", mat: CHROME.mat, surf: CHROME.surf } : false,
        handleHeight: 1.0,
      },
      [cx, 0.012, zc],
    );
  // left pair: outer panel on the −X jamb (opens out), inner panel folds back onto it
  const xL0 = -ix + 0.001;
  const p1 = panel("bifold_l1", xL0 + pw / 2, "left", "front", sideL, false);
  panel("bifold_l2", xL0 + pw + gap + pw / 2, "left", "back", p1.core[1], true);
  const xR0 = ix - 0.001;
  const p3 = panel("bifold_r1", xR0 - pw / 2, "right", "front", sideR, false);
  panel("bifold_r2", xR0 - pw - gap - pw / 2, "right", "back", p3.core[1], true);

  // ------------------------------------------------------------------ coats on the rod
  const n = Math.max(0, Math.min(4, o.coats ?? 3));
  const xs = [-0.36, -0.06, 0.24, 0.42];
  for (let k = 0; k < n; k++) coat(b, k, xs[k], rod, rodY, rodZ, rodR);

  return finish(b, o);
}
