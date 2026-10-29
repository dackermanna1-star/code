// Chrome wire shelving unit (900 × 350 × 1800 mm, four shelves). Four tubular posts on levelling
// feet; each shelf is a welded wire grid — a frame of 8 mm rods wedged onto the posts (split
// sleeves) with 5 mm cross wires welded on top. Hit it and wires bend and pop their welds,
// shelves drop off their sleeves, and everything on them slides off.
//
// Frame: origin on the floor at the centre of the footprint, front +Z. Shelf surfaces (tops of
// the cross wires) at WIRE_SHELF.tops.

import { finish, mk, tubeKgPerM, CHROME, type BaseOpts } from "./helpers.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";

export interface WireShelfOpts extends BaseOpts {
  w?: number;
  d?: number;
  h?: number;
  /** Shelf surface heights (tops of the cross wires). */
  tops?: number[];
}

export const WIRE_SHELF = {
  w: 0.9,
  d: 0.35,
  h: 1.8,
  tops: [0.16, 0.62, 1.08, 1.54] as readonly number[],
  postR: 0.0125,
} as const;

export function buildWireShelf(o: WireShelfOpts = {}): AssemblyDef {
  const b = mk("wireShelf", "Wire Shelving Unit", "furniture", 90, o);
  const W = o.w ?? WIRE_SHELF.w,
    D = o.d ?? WIRE_SHELF.d,
    H = o.h ?? WIRE_SHELF.h;
  const tops = o.tops ?? WIRE_SHELF.tops;
  const pr = WIRE_SHELF.postR;
  const px = W / 2 - pr,
    pz = D / 2 - pr;
  const footH = 0.02;
  const posts: Record<string, string> = {};
  for (const [k, sx, sz] of [
    ["fl", -1, 1],
    ["fr", 1, 1],
    ["bl", -1, -1],
    ["br", 1, -1],
  ] as Array<[string, number, number]>) {
    const foot = b.cyl(`foot_${k}`, "plastic", "plastic", pr + 0.002, footH, [sx * px, footH / 2, sz * pz], { segments: 10, tint: 0x2a2a2a, mass: 0.02 });
    const post = b.cyl(`post_${k}`, CHROME.mat, CHROME.surf, pr, H - footH, [sx * px, footH + (H - footH) / 2, sz * pz], { segments: 10, mass: tubeKgPerM(2 * pr, 0.0009, 7850) * (H - footH) });
    b.press(foot, post, 30);
    posts[k] = post;
  }
  const rodR = 0.004,
    wireR = 0.0025;
  tops.forEach((yTop, s) => {
    const yWire = yTop - wireR;
    const yRod = yWire - wireR - rodR;
    // frame rods butt against the posts (the bent corners wrap them in reality)
    const front = b.cyl(`s${s}_rod_f`, CHROME.mat, CHROME.surf, rodR, 2 * (px - pr), [0, yRod, pz], { axis: "x", segments: 6 });
    const back = b.cyl(`s${s}_rod_b`, CHROME.mat, CHROME.surf, rodR, 2 * (px - pr), [0, yRod, -pz], { axis: "x", segments: 6 });
    const left = b.cyl(`s${s}_rod_l`, CHROME.mat, CHROME.surf, rodR, 2 * (pz - pr), [-px, yRod, 0], { axis: "z", segments: 6 });
    const right = b.cyl(`s${s}_rod_r`, CHROME.mat, CHROME.surf, rodR, 2 * (pz - pr), [px, yRod, 0], { axis: "z", segments: 6 });
    // split sleeves: each rod end is wedged onto a post
    b.press(front, posts.fl, 20);
    b.press(front, posts.fr, 20);
    b.press(back, posts.bl, 20);
    b.press(back, posts.br, 20);
    b.press(left, posts.fl, 20);
    b.press(left, posts.bl, 20);
    b.press(right, posts.fr, 20);
    b.press(right, posts.br, 20);
    // cross wires welded on top of the front/back rods
    const n = 6;
    for (let k = 0; k < n; k++) {
      const x = -px + pr + ((k + 0.5) * 2 * (px - pr)) / n;
      const wire = b.cyl(`s${s}_wire${k}`, CHROME.mat, CHROME.surf, wireR, 2 * pz + 2 * rodR, [x, yWire, 0], { axis: "z", segments: 6 });
      b.weld(wire, front, 18);
      b.weld(wire, back, 18);
    }
  });
  return finish(b, o);
}

// =============================================================================================
// Wall-mounted wire shelving (laundry shelf over the washer and dryer)
// =============================================================================================

export interface WallWireShelfOpts extends BaseOpts {
  /** Shelf length along the wall. */
  len?: number;
  /** Depth out of the wall. */
  d?: number;
  /** Shelf surface heights above the floor (tops of the deck wires), one tier each. */
  tops?: number[];
}

export const WALL_WIRE_SHELF = {
  len: 1.22,
  d: 0.305,
  tops: [1.42, 1.8] as readonly number[],
  /** Deck wire radius (the shelf surface is the top of these wires). */
  wireR: 0.0025,
  /** Local x of the inner cross bars (±bracketX/3) and limit of the end bars. */
  bracketX: 0.55,
  /** Bracket wall-tab depth below the shelf surface. */
  bracketDrop: 0.22,
} as const;

/**
 * Epoxy-coated steel wire shelving on the wall, one or more tiers: each tier is a deck of eight
 * 5 mm longitudinal wires welded on four 6 mm cross bars, its back wire held in three plastic
 * wall clips and its front carried by two diagonal steel support brackets screwed into the wall.
 * Overload or hit it and wires bend and pop their welds, clips snap, brackets tear out of the
 * plugs and the whole deck tips its contents onto the machines below.
 *
 * Wall-mounted frame: origin on the wall plane at floor level, x along the wall, +Z out of the
 * wall. Shelf surfaces at `tops`.
 */
export function buildWallWireShelf(o: WallWireShelfOpts = {}): AssemblyDef {
  const b = mk("wallWireShelf", "Wall Wire Shelf", "furniture", 60, o);
  const L = o.len ?? WALL_WIRE_SHELF.len,
    D = o.d ?? WALL_WIRE_SHELF.d;
  const tops = o.tops ?? WALL_WIRE_SHELF.tops;
  const wr = WALL_WIRE_SHELF.wireR,
    cr = 0.003;
  const coat = { mat: "steel" as const, surf: "metal_painted" as const, tint: 0xf1f1ee };
  const nWire = 8;
  const zBack = 0.0145 + wr; // back wire sits in the wall clips
  const zFront = D - wr;
  const xb = Math.min(WALL_WIRE_SHELF.bracketX, L / 2 - 0.04);
  const crossX = [-(L / 2 - 0.03), -xb / 3, xb / 3, L / 2 - 0.03];
  tops.forEach((T, s) => {
    const yWire = T - wr;
    const yCross = T - 2 * wr - cr;
    b.group([0, 0, 0], undefined, `t${s}_`, () => {
      // cross bars (front to back) under the deck
      const bars = crossX.map((x, k) => b.cyl(`bar${k}`, coat.mat, coat.surf, cr, D - 0.004, [x, yCross, 0.004 + (D - 0.004) / 2], { axis: "z", segments: 6, tint: coat.tint, tess: 0 }));
      // longitudinal deck wires welded on top of every bar
      const wires: string[] = [];
      for (let k = 0; k < nWire; k++) {
        const z = zBack + ((zFront - zBack) * k) / (nWire - 1);
        const w = b.cyl(`wire${k}`, coat.mat, coat.surf, wr, L, [0, yWire, z], { axis: "x", segments: 6, tint: coat.tint, tess: 0 });
        for (const bar of bars) b.weld(w, bar, 15);
        wires.push(w);
      }
      // plastic clips around the back wire, screwed into wall plugs
      for (const [k, x] of [-0.42, 0, 0.42].map((x, i) => [i, x * (L / 1.22)] as [number, number])) {
        const clip = b.box(`clip${k}`, "plastic", "plastic", [0.024, 0.028, 0.0145], [x, T - 0.002 - 0.014, 0.0145 / 2], { tint: 0xf4f4f2, mass: 0.006 });
        b.clip(clip, wires[0], 8);
        b.world(clip, "screw", 30, [x, T - 0.016, 0]);
      }
      // diagonal support brackets from a wall tab up under the front of the end cross bars
      for (const [k, x] of [
        ["l", crossX[0]],
        ["r", crossX[3]],
      ] as Array<[string, number]>) {
        const yLo = T - WALL_WIRE_SHELF.bracketDrop;
        const yHi = yCross - cr; // touches the underside of the cross bar
        const zf = D - 0.03;
        const pts: Array<[number, number, number]> = [];
        for (const dx of [-0.006, 0.006]) {
          pts.push([x + dx, yLo, 0], [x + dx, yLo + 0.035, 0], [x + dx, yLo, 0.004]);
          pts.push([x + dx, yHi, zf - 0.02], [x + dx, yHi, zf], [x + dx, yHi - 0.012, zf]);
        }
        const br = b.hull(`bracket_${k}`, "steel", "metal_painted", pts, [0, 0, 0], { tint: coat.tint, mass: 0.11, tess: 0 });
        b.clip(br, bars[k === "l" ? 0 : 3], 40);
        b.world(br, "screw", 45, [x, yLo + 0.017, 0]);
      }
    });
  });
  return finish(b, o);
}
