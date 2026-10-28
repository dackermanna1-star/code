// Chrome wire shelving unit (900 × 350 × 1800 mm, four shelves). Four tubular posts on levelling
// feet; each shelf is a welded wire grid — a frame of 8 mm rods wedged onto the posts (split
// sleeves) with 5 mm cross wires welded on top. Hit it and wires bend and pop their welds,
// shelves drop off their sleeves, and everything on them slides off.
//
// Frame: origin on the floor at the centre of the footprint, front +Z. Shelf surfaces (tops of
// the cross wires) at WIRE_SHELF.tops.

import { boxR, finish, mk, tubeKgPerM, CHROME, type BaseOpts } from "./helpers.ts";
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
  void boxR;
  return finish(b, o);
}
