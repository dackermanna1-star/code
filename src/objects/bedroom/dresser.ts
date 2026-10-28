// Six-drawer double dresser with a tilting mirror.
// Carcass: 16 mm veneered particleboard sides, bottom on a recessed plinth, centre divider,
// overhanging top board screwed down, 3 mm HDF back nailed on. Six inset drawers (2 columns × 3
// rows) on slider runners screwed to the sides/divider: 15 mm MDF fronts with bar pulls, 10 mm
// plywood boxes with 3 mm HDF bottoms. Mirror: walnut frame + 3 mm mirror glass (weak
// clips, so shards stay in the frame) + MDF backing, pivoting on friction hinges between two
// posts screwed to the top. Smash the glass, rip drawers out, crumble the particleboard.
// Local frame: origin on the floor at the centre, drawers facing +Z. PURE MODULE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { cabinetCarcass, drawer, glassPaneInFrame } from "../lib/kit.ts";
import { boxR, finish, mk, type BaseOpts } from "./common.ts";

export interface DresserOpts extends BaseOpts {
  style?: "walnut" | "white";
  /** Include the tilting mirror on top (default true). */
  mirror?: boolean;
}

const D = {
  w: 1.4,
  d: 0.48,
  h: 0.78, // carcass height (top board above it)
  topT: 0.018,
  t: 0.016,
  plinth: 0.08,
  rows: 3,
};

export interface DresserDims {
  w: number;
  d: number;
  /** Top surface height. */
  h: number;
  /** Top board extent in the local frame. */
  top: { x0: number; x1: number; z0: number; z1: number };
  /** Free area on the top in front of the mirror posts (local z range). */
  freeZ: [number, number];
  mirror: boolean;
}

export function dresserDims(o: DresserOpts = {}): DresserDims {
  return {
    w: D.w + 0.02,
    d: D.d + 0.015,
    h: D.h + D.topT,
    top: { x0: -D.w / 2 - 0.01, x1: D.w / 2 + 0.01, z0: -D.d / 2, z1: D.d / 2 + 0.015 },
    freeZ: [-D.d / 2 + 0.065, D.d / 2 + 0.005],
    mirror: o.mirror !== false,
  };
}

export function buildDresser(o: DresserOpts = {}): AssemblyDef {
  const white = o.style === "white";
  const b = mk("dresser", "Dresser", "furniture", 420, o);
  const surf: SurfaceName = white ? "laminate_white" : "wood_walnut";
  const tint = white ? 0xf3f1ec : 0xffffff;
  const { w, d, h, t, topT, plinth } = D;
  const c = cabinetCarcass(b, "case", { w, h, d, t, mat: "particleboard", surf, tint, top: "none", toeKick: { h: plinth, setback: 0.03 }, joinery: "dowel" });
  const yIn0 = plinth + t; // top of the bottom panel
  const yIn1 = h; // underside of the top board
  const zb = c.inner.z0,
    zf = c.inner.z1;

  // top board (overhangs 10 mm at the sides, 15 mm at the front)
  const top = boxR(b, "top", "particleboard", surf, [-w / 2 - 0.01, w / 2 + 0.01], [h, h + topT], [-d / 2, d / 2 + 0.015], { tint });
  b.screw(top, c.left, 3, 30);
  b.screw(top, c.right, 3, 30);
  if (c.back) b.nail(top, c.back, 6, 6);

  // centre divider between the two drawer columns
  const div = boxR(b, "divider", "particleboard", surf, [-t / 2, t / 2], [yIn0, yIn1], [zb, zf], { tint });
  b.dowel(div, c.bottom, 3, 40);
  b.screw(top, div, 3, 30);
  if (c.back) b.nail(div, c.back, 4, 6);

  // six inset drawers
  const colW = (w - 3 * t) / 2; // clear opening width per column
  const rowH = (yIn1 - yIn0) / D.rows;
  const gap = 0.003;
  const boxW = colW - 0.025; // 12.5 mm runner clearance per side
  const boxD = 0.42;
  const boxH = rowH - 0.055;
  for (let col = 0; col < 2; col++) {
    const cx = col === 0 ? -(t / 2 + colW / 2) : t / 2 + colW / 2;
    const fixed: [string, string] = col === 0 ? [c.left, div] : [div, c.right];
    for (let row = 0; row < D.rows; row++) {
      const oy0 = yIn0 + row * rowH;
      const boxY0 = oy0 + 0.015;
      drawer(
        b,
        `drawer${col}${row}`,
        {
          w: boxW,
          h: boxH,
          d: boxD,
          sideT: 0.01,
          backT: 0.01,
          bottomT: 0.003,
          front: { w: colW - 2 * gap, h: rowH - 2 * gap, t: 0.015, mat: "mdf", surf, tint, dy: oy0 + gap - boxY0 },
          mat: "plywood",
          surf: "plywood",
          fixed,
          travel: 0.36,
          strength: 45,
          friction: 0.8,
          handle: { kind: "bar", len: 0.16, mat: "aluminum", surf: "steel_brushed" },
        },
        [cx, boxY0, zf - 0.015],
      );
    }
  }

  // tilting mirror between two posts screwed to the top board
  if (o.mirror !== false) {
    const mw = 0.8,
      mh = 0.62,
      bar = 0.042,
      depth = 0.024;
    const yTop = h + topT;
    const postW = 0.04,
      postD = 0.03,
      postH = 0.5;
    const zPost: [number, number] = [-d / 2 + 0.02, -d / 2 + 0.02 + postD];
    const zc = (zPost[0] + zPost[1]) / 2;
    const gapX = 0.004; // clearance between the frame and the posts (pivot bolts)
    const posts: string[] = [];
    for (const sx of [-1, 1]) {
      const x0 = sx < 0 ? -mw / 2 - gapX - postW : mw / 2 + gapX;
      const p = boxR(b, sx < 0 ? "post_l" : "post_r", "hardwood", "wood_walnut", [x0, x0 + postW], [yTop, yTop + postH], zPost, { grain: "y" });
      b.screw(p, top, 2, 35);
      posts.push(p);
    }
    const pivotY = yTop + postH - 0.08;
    const frameY = pivotY; // frame pivots about its own centre line
    const m = glassPaneInFrame(
      b,
      "mirror",
      { w: mw, h: mh, bar, depth, mat: "hardwood", surf: "wood_walnut", glassT: 0.003, glassSurf: "mirror", glassZ: depth - 0.006, glassBond: { kind: "clip", strength: 5 } },
      [0, frameY, zc - depth / 2],
    );
    const iw = mw - 2 * bar,
      ih = mh - 2 * bar;
    const zGlassBack = zc - depth / 2 + (depth - 0.006) - 0.0015;
    const backing = boxR(b, "mirror_backing", "mdf", "mdf", [-iw / 2, iw / 2], [frameY - ih / 2, frameY + ih / 2], [zGlassBack - 0.003, zGlassBack], {});
    for (const bb of [m.bars.top, m.bars.bottom, m.bars.left, m.bars.right]) b.clip(backing, bb, 5);
    // positive angles tip the top forward (+Z); little back-tilt so it never reaches the wall
    b.hinge(m.bars.left, posts[0], { pivots: [[-mw / 2 - gapX / 2, pivotY, zc]], axis: [1, 0, 0], min: -5, max: 15, friction: 3, strength: 60, group: "mirror_tilt" });
    b.hinge(m.bars.right, posts[1], { pivots: [[mw / 2 + gapX / 2, pivotY, zc]], axis: [1, 0, 0], min: -5, max: 15, friction: 3, strength: 60, group: "mirror_tilt" });
  }
  return finish(b, o);
}
