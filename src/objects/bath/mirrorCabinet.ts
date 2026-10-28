// Wall-hung mirror cabinet (600 × 700 × 134 mm): a 15 mm MDF box with a 3 mm hardboard back
// nailed on, a hanging rail screwed into the wall (the cabinet's anchor), two 5 mm glass shelves
// resting on pins, and a mirror door — 4 mm silvered glass bonded to a 6 mm MDF backing — on two
// concealed hinges with a magnetic catch. Smash the door and the mirror shatters radially; tear
// the cabinet off the wall and the shelves (and whatever is on them) spill.
//
// Wall-mounted frame: origin on the wall plane, x centred, y = 0 at the FLOOR; the cabinet hangs
// with its bottom at `bottomY`. +Z out of the wall.

import { boxR, finish, mk, type BaseOpts } from "../utility/helpers.ts";
import { hingeAxis } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";

export interface MirrorCabinetOpts extends BaseOpts {
  bottomY?: number;
  w?: number;
  h?: number;
  tint?: number;
  /** Hinge side (local x sign of the hinge edge). Default -1. */
  hingeSide?: 1 | -1;
}

export const MIRROR_CABINET = {
  w: 0.6,
  h: 0.7,
  depth: 0.134,
  bottomY: 1.3,
  t: 0.015,
  /** Heights of the shelf tops above the cabinet bottom (inner floor first). */
  shelfTops: [0.015, 0.24, 0.47],
  /** Inner depth usable for items (front of the back panel → back of the door). */
  innerZ: [0.003, 0.123],
} as const;

export function buildMirrorCabinet(o: MirrorCabinetOpts = {}): AssemblyDef {
  const b = mk("mirrorCabinet", "Mirror Cabinet", "furniture", 140, o);
  const W = o.w ?? MIRROR_CABINET.w,
    H = o.h ?? MIRROR_CABINET.h;
  const y0 = o.bottomY ?? MIRROR_CABINET.bottomY;
  const t = MIRROR_CABINET.t;
  const tint = o.tint ?? 0xf3f2ee;
  const zb = 0.003; // back panel thickness
  const zf = 0.123; // front edge of the box
  const hs = o.hingeSide ?? -1;

  // ------------------------------------------------------------------ box
  const back = boxR(b, "back", "mdf", "mdf", [-W / 2, W / 2], [y0, y0 + H], [0, zb], { tint: 0xe9e6dd, supported: true });
  const bottom = boxR(b, "bottom", "mdf", "laminate_white", [-W / 2, W / 2], [y0, y0 + t], [zb, zf], { tint });
  const top = boxR(b, "top", "mdf", "laminate_white", [-W / 2, W / 2], [y0 + H - t, y0 + H], [zb, zf], { tint });
  const left = boxR(b, "side_l", "mdf", "laminate_white", [-W / 2, -W / 2 + t], [y0 + t, y0 + H - t], [zb, zf], { tint });
  const right = boxR(b, "side_r", "mdf", "laminate_white", [W / 2 - t, W / 2], [y0 + t, y0 + H - t], [zb, zf], { tint });
  for (const s of [left, right]) {
    b.dowel(s, bottom, 2, 35);
    b.dowel(s, top, 2, 35);
  }
  for (const p of [bottom, top, left, right]) b.nail(back, p, 4, 6);
  // hanging rail under the top, screwed to the sides and into the wall
  const rail = boxR(b, "rail", "mdf", "mdf", [-W / 2 + t, W / 2 - t], [y0 + H - t - 0.06, y0 + H - t], [zb, zb + 0.015], {});
  b.screw(rail, left, 1, 30);
  b.screw(rail, right, 1, 30);
  b.screw(rail, top, 1, 25);
  b.world(rail, "screw", 70, [0, y0 + H - t - 0.03, 0]);

  // ------------------------------------------------------------------ glass shelves on pins
  const shelves: string[] = [];
  for (const [k, yTop] of MIRROR_CABINET.shelfTops.slice(1).entries()) {
    const sh = boxR(b, `shelf${k}`, "glass", "glass", [-W / 2 + t + 0.0005, W / 2 - t - 0.0005], [y0 + yTop - 0.005, y0 + yTop], [zb + 0.004, zf - 0.006], {
      faces: { pz: { surf: "glass_edge" }, nz: { surf: "glass_edge" }, px: { surf: "glass_edge" }, nx: { surf: "glass_edge" } },
    });
    b.friction(sh, left, 6);
    b.friction(sh, right, 6);
    shelves.push(sh);
  }

  // ------------------------------------------------------------------ mirror door
  const dz0 = zf + 0.001;
  const backing = boxR(b, "door_backing", "mdf", "mdf", [-W / 2, W / 2], [y0, y0 + H], [dz0, dz0 + 0.006], { tint: 0xd9d4c8 });
  const mirror = boxR(b, "door_mirror", "glass", "glass_edge", [-W / 2 + 0.002, W / 2 - 0.002], [y0 + 0.002, y0 + H - 0.002], [dz0 + 0.006, dz0 + 0.01], {
    faces: { pz: { surf: "mirror" } },
  });
  b.glue(mirror, backing, 45);
  const side = hs < 0 ? left : right;
  const ax = hingeAxis([-hs, 0, 0], [0, 0, 1]);
  b.hinge(backing, side, {
    pivots: [
      [hs * (W / 2), y0 + 0.09, dz0],
      [hs * (W / 2), y0 + H - 0.09, dz0],
    ],
    axis: [ax.x, ax.y, ax.z],
    min: 0,
    max: 105,
    strength: 30,
    friction: 0.06,
    latch: 3,
    latchFixed: hs < 0 ? right : left,
    latchPos: [-hs * (W / 2 - 0.02), y0 + H / 2, dz0],
  });

  return finish(b, o);
}
