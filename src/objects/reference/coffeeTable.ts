// Reference object: glass-top coffee table (walnut frame, 8 mm tempered glass, lower shelf).
//  * The top frame is four mitred hardwood rails (doweled corners) lying flat; the tempered
//    glass sits inset, flush with the rails, on four glued support cleats, held only by
//    friction/clips — lift or kick the table hard and the glass pops out; hit it mid-panel with
//    a hammer and it survives, hit it near an edge (or hard) and the whole pane dices.
//  * Four square legs doweled under the frame corners, two end stretchers, and a veneered
//    plywood shelf screwed onto the stretchers.
//
// Frame: origin at the floor centre, +Y up, long side along X, front +Z.
// 1.10 × 0.60 m, 0.44 m tall, ~25 kg, 16 parts.

import { Builder } from "../lib/builder.ts";
import { glassPaneInFrame, glueByArea } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";

export interface CoffeeTableOpts {
  surf?: SurfaceName;
  tint?: number;
  seed?: number;
}

export function buildCoffeeTable(o: CoffeeTableOpts = {}): AssemblyDef {
  const b = new Builder("coffeeTable", "Glass Coffee Table", "furniture", 180, o.seed);
  const surf = o.surf ?? "wood_walnut";
  const tint = o.tint ?? 0xffffff;
  const W = 1.1,
    D = 0.6,
    H = 0.44;
  const bar = 0.03,
    rail = 0.08; // frame rail width and height
  const glassT = 0.008;
  const legS = 0.045,
    legH = H - rail;

  // ---- top frame + inset glass (frame built in its XY plane, laid flat: local z → world +Y)
  const top = glassPaneInFrame(
    b,
    "top",
    {
      w: W,
      h: D,
      bar,
      depth: rail,
      mat: "hardwood",
      surf,
      tint,
      glassT,
      glassMat: "temperedGlass",
      glassSurf: "glass",
      glassTint: 0xd8ece6,
      glassZ: rail - glassT / 2,
      glassBond: { kind: "friction", strength: 8 },
      corner: { kind: "dowel", strength: 90 },
    },
    [0, legH, 0],
    [-90, 0, 0],
  );
  const glass = top.panes[0];
  // frame rails in world terms: local +Y (top bar) → world -Z (back)
  const railBack = top.bars.top,
    railFront = top.bars.bottom,
    railL = top.bars.left,
    railR = top.bars.right;

  // ---- glass support cleats glued inside the rails (glass rests on them)
  const ix = W / 2 - bar,
    iz = D / 2 - bar; // inner opening half-sizes
  const cw = 0.012,
    ch = 0.015;
  const cy = H - glassT - ch / 2;
  const cleatF = b.box("cleat_f", "softwood", "wood_pine", [2 * ix, ch, cw], [0, cy, iz - cw / 2], { grain: "x" });
  const cleatB = b.box("cleat_b", "softwood", "wood_pine", [2 * ix, ch, cw], [0, cy, -iz + cw / 2], { grain: "x" });
  const cleatL = b.box("cleat_l", "softwood", "wood_pine", [cw, ch, 2 * (iz - cw)], [-ix + cw / 2, cy, 0], { grain: "z" });
  const cleatR = b.box("cleat_r", "softwood", "wood_pine", [cw, ch, 2 * (iz - cw)], [ix - cw / 2, cy, 0], { grain: "z" });
  for (const [c, r] of [
    [cleatF, railFront],
    [cleatB, railBack],
    [cleatL, railL],
    [cleatR, railR],
  ]) {
    const ct = b.contact(c, r);
    b.glue(c, r, glueByArea(ct ? ct.area : 0.01) + 20); // glue + brads
  }
  for (const s of [cleatL, cleatR]) {
    b.glue(s, cleatF, 15);
    b.glue(s, cleatB, 15);
  }
  for (const c of [cleatF, cleatB, cleatL, cleatR]) b.friction(glass, c, 6);

  // ---- legs under the frame corners
  const legs: string[] = [];
  for (const [sx, sz, nm] of [
    [-1, 1, "fl"], // axis-based names: left = -X, front = +Z
    [1, 1, "fr"],
    [-1, -1, "bl"],
    [1, -1, "br"],
  ] as Array<[number, number, string]>) {
    const leg = b.box(`leg_${nm}`, "hardwood", surf, [legS, legH, legS], [sx * (W / 2 - legS / 2), legH / 2, sz * (D / 2 - legS / 2)], { tint, grain: "y" });
    b.dowel(leg, sz > 0 ? railFront : railBack, 2, 45);
    b.dowel(leg, sx > 0 ? railR : railL, 2, 45); // left rail = -X side
    legs.push(leg);
  }
  const [legFL, legFR, legBL, legBR] = legs;

  // ---- end stretchers + lower shelf
  const sS = 0.03,
    sY = 0.085;
  const sx = W / 2 - legS / 2;
  const strL = b.box("str_l", "hardwood", surf, [sS, sS, D - 2 * legS], [-sx, sY, 0], { tint, grain: "z" });
  const strR = b.box("str_r", "hardwood", surf, [sS, sS, D - 2 * legS], [sx, sY, 0], { tint, grain: "z" });
  b.dowel(strL, legFL, 1, 60);
  b.dowel(strL, legBL, 1, 60);
  b.dowel(strR, legFR, 1, 60);
  b.dowel(strR, legBR, 1, 60);
  const shelfT = 0.018;
  const shelf = b.box("shelf", "plywood", surf, [2 * (sx + sS / 2), shelfT, D - 2 * legS - 0.01], [0, sY + sS / 2 + shelfT / 2, 0], { tint, grain: "x" });
  b.screw(shelf, strL, 2, 30);
  b.screw(shelf, strR, 2, 30);

  return b.build();
}
