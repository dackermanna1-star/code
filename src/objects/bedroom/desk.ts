// Computer desk: 25 mm laminated particleboard top screwed onto a welded steel frame — four
// square-tube legs with plastic glides, side rails and a back rail under the top, and a low
// back stretcher. The top crumbles/cracks, the frame dents and pops its welds.
// Local frame: origin on the floor at the centre, user side (front) at +Z, length along X.
// PURE MODULE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { boxR, finish, mk, rectTubeKgPerM, PAL, type BaseOpts } from "./common.ts";

export interface DeskOpts extends BaseOpts {
  w?: number;
  d?: number;
  top?: "white" | "oak";
  frameTint?: number;
}

export interface DeskDims {
  w: number;
  d: number;
  /** Top surface height. */
  h: number;
  /** Clear height under the rails (knee space). */
  under: number;
}

const K = { h: 0.75, topT: 0.025, leg: 0.04, rail: 0.03, inset: 0.03, glide: 0.008 };

export function deskDims(o: DeskOpts = {}): DeskDims {
  return { w: o.w ?? 1.4, d: o.d ?? 0.7, h: K.h, under: K.h - K.topT - K.rail };
}

export function buildDesk(o: DeskOpts = {}): AssemblyDef {
  const { w, d, h } = deskDims(o);
  const b = mk("desk", "Computer Desk", "furniture", 220, o);
  const surf: SurfaceName = o.top === "oak" ? "wood_oak" : "laminate_white";
  const tint = o.top === "oak" ? 0xead2ad : 0xf2f1ec;
  const ft = o.frameTint ?? 0xffffff;
  const S = "metal_black" as const;
  const yTop0 = h - K.topT;
  const yRail0 = yTop0 - K.rail;
  const top = boxR(b, "top", "particleboard", surf, [-w / 2, w / 2], [yTop0, h], [-d / 2, d / 2], { tint });
  const legKg = rectTubeKgPerM(K.leg, K.leg, 0.0015);
  const railKg = rectTubeKgPerM(K.leg, K.rail, 0.0015);
  const lx = w / 2 - K.inset - K.leg / 2,
    lz = d / 2 - K.inset - K.leg / 2;
  const legs: Record<string, string> = {};
  for (const [sx, sz, nm] of [
    [-1, -1, "bl"],
    [1, -1, "br"],
    [-1, 1, "fl"],
    [1, 1, "fr"],
  ] as Array<[number, number, string]>) {
    const cx = sx * lx,
      cz = sz * lz;
    const len = yRail0 - K.glide;
    const leg = boxR(b, `leg_${nm}`, "steel", S, [cx - K.leg / 2, cx + K.leg / 2], [K.glide, yRail0], [cz - K.leg / 2, cz + K.leg / 2], { tint: ft, tess: 0, mass: legKg * len });
    const glide = boxR(b, `glide_${nm}`, "plastic", "plastic", [cx - K.leg / 2, cx + K.leg / 2], [0, K.glide], [cz - K.leg / 2, cz + K.leg / 2], { tint: PAL.black });
    b.press(glide, leg, 8);
    legs[nm] = leg;
  }
  // side rails over the leg tops, back rail between them
  const sideLen = 2 * lz + K.leg;
  const rails: string[] = [];
  for (const sx of [-1, 1]) {
    const cx = sx * lx;
    const r = boxR(b, sx < 0 ? "rail_l" : "rail_r", "steel", S, [cx - K.leg / 2, cx + K.leg / 2], [yRail0, yTop0], [-sideLen / 2, sideLen / 2], { tint: ft, tess: 0, mass: railKg * sideLen });
    b.weld(r, legs[sx < 0 ? "bl" : "br"], 120);
    b.weld(r, legs[sx < 0 ? "fl" : "fr"], 120);
    b.screw(top, r, 3, 30);
    rails.push(r);
  }
  const backLen = 2 * lx - K.leg;
  const back = boxR(b, "rail_back", "steel", S, [-backLen / 2, backLen / 2], [yRail0, yTop0], [-lz - K.leg / 2, -lz + K.leg / 2], { tint: ft, tess: 0, mass: railKg * backLen });
  b.weld(back, rails[0], 100);
  b.weld(back, rails[1], 100);
  b.screw(top, back, 3, 30);
  // low stretcher between the back legs
  const str = boxR(b, "stretcher", "steel", S, [-backLen / 2, backLen / 2], [0.15, 0.17], [-lz - 0.01, -lz + 0.01], { tint: ft, tess: 0, mass: rectTubeKgPerM(0.02, 0.02, 0.0012) * backLen });
  b.weld(str, legs.bl, 60);
  b.weld(str, legs.br, 60);
  return finish(b, o);
}
