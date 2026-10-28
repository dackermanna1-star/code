// Reference object: solid-wood dining chair (beech/oak). Built like a real one:
//  * one-piece rear legs that rake back ~4° and continue up as the back posts,
//  * front legs tapered on their inner faces below the seat rails,
//  * four aprons (seat rails) mortised into the legs — glued + doweled joints,
//  * an 18 mm solid seat screwed to the rails (corner screws) and doweled onto the front legs,
//  * an H-stretcher (two side stretchers + a cross stretcher) for racking strength,
//  * a back of a lower rail, a crest rail and three slats, all following the post rake.
// Kick it and joints loosen (bond damage accumulates) until a leg or the back rips off;
// a sledgehammer snaps legs into splinters along the grain; the seat cracks along its grain.
//
// Frame: origin at the floor below the seat centre, +Y up, the seat front faces +Z.
// Seat height 0.45 m, overall 0.88 m tall, 0.44 × 0.47 m footprint, ~6 kg, 18 parts.

import { Builder, type V3 } from "../lib/builder.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { MaterialId } from "../../destruction/model/materials.ts";
import type { SurfaceName } from "../../render/surfaces.ts";

export interface ChairOpts {
  mat?: MaterialId;
  surf?: SurfaceName;
  tint?: number;
  seed?: number;
}

export function buildChair(o: ChairOpts = {}): AssemblyDef {
  const b = new Builder("chair", "Dining Chair", "furniture", 85, o.seed);
  const mat = o.mat ?? "hardwood";
  const surf = o.surf ?? "wood_oak";
  const tint = o.tint ?? 0xffffff;
  const po = { tint };

  const L = 0.034; // leg section (m)
  const seatTop = 0.45,
    seatT = 0.018;
  const seatBot = seatTop - seatT; // 0.432
  const apH = 0.055,
    apT = 0.019;
  const apBot = seatBot - apH; // 0.377
  const XO = 0.205; // legs' outer faces at x = ±XO
  // rear legs: front face z at height y (raked back)
  const RAKE = 0.06 / 0.88;
  const zRearFront = (y: number): number => -0.166 - RAKE * y;
  const tiltDeg = (Math.atan(RAKE) * 180) / Math.PI;

  // ---- legs
  const frontLeg = (sx: number, nm: string): string => {
    const xo = sx * XO;
    const xi = (s: number) => sx * (XO - s);
    const pts: V3[] = [];
    const level = (y: number, s: number): void => {
      for (const x of [xo, xi(s)]) for (const z of [0.185, 0.185 - s]) pts.push([x, y, z]);
    };
    level(0, 0.027); // tapered foot
    level(apBot, L);
    level(seatBot, L);
    return b.hull(nm, mat, surf, pts, [0, 0, 0], { ...po, grain: "y" });
  };
  const rearLeg = (sx: number, nm: string): string => {
    const pts: V3[] = [];
    for (const y of [0, 0.88]) for (const x of [sx * XO, sx * (XO - L)]) for (const z of [zRearFront(y), zRearFront(y) - L]) pts.push([x, y, z]);
    return b.hull(nm, mat, surf, pts, [0, 0, 0], { ...po, grain: "y" });
  };
  const legFL = frontLeg(-1, "leg_fl");
  const legFR = frontLeg(1, "leg_fr");
  const legBL = rearLeg(-1, "leg_bl");
  const legBR = rearLeg(1, "leg_br");

  // ---- seat rails (aprons)
  const xIn = XO - L; // legs' inner faces at x = ±0.171
  const apY = (apBot + seatBot) / 2;
  const apronF = b.box("apron_f", mat, surf, [2 * xIn, apH, apT], [0, apY, 0.183 - apT / 2], { ...po, grain: "x" });
  const zBackC = zRearFront(apY) - L / 2;
  const apronB = b.box("apron_b", mat, surf, [2 * xIn, apH, apT], [0, apY, zBackC], { ...po, grain: "x" });
  const sideZ0 = zRearFront(apBot) + 0.0002,
    sideZ1 = 0.185 - L;
  const apronL = b.box("apron_l", mat, surf, [apT, apH, sideZ1 - sideZ0], [-(XO - 0.002 - apT / 2), apY, (sideZ0 + sideZ1) / 2], { ...po, grain: "z" });
  const apronR = b.box("apron_r", mat, surf, [apT, apH, sideZ1 - sideZ0], [XO - 0.002 - apT / 2, apY, (sideZ0 + sideZ1) / 2], { ...po, grain: "z" });
  for (const [a, l1, l2] of [
    [apronF, legFL, legFR],
    [apronB, legBL, legBR],
    [apronL, legFL, legBL],
    [apronR, legFR, legBR],
  ]) {
    b.dowel(a, l1, 2, 50);
    b.dowel(a, l2, 2, 50);
  }

  // ---- seat (ends just in front of the raked posts)
  const seatZ0 = zRearFront(seatBot) + 0.0005,
    seatZ1 = 0.21;
  const seat = b.box("seat", mat, surf, [0.44, seatT, seatZ1 - seatZ0], [0, seatBot + seatT / 2, (seatZ0 + seatZ1) / 2], { ...po, grain: "x" });
  for (const a of [apronF, apronB, apronL, apronR]) b.screw(seat, a, 2, 30);
  b.dowel(seat, legFL, 1, 40);
  b.dowel(seat, legFR, 1, 40);
  b.glue(seat, legBL, 25);
  b.glue(seat, legBR, 25);

  // ---- H-stretcher
  const sY = 0.15,
    sS = 0.02;
  const legSizeAt = (y: number): number => 0.027 + ((L - 0.027) * y) / apBot;
  // the raked rear leg's front face is furthest forward at the stretcher's bottom edge
  const sz0 = zRearFront(sY - sS / 2) + 0.0002;
  const sz1 = 0.185 - legSizeAt(sY + sS / 2) - 0.0002;
  const sx = XO - 0.017; // centred on the leg section
  const strL = b.box("str_l", mat, surf, [sS, sS, sz1 - sz0], [-sx, sY, (sz0 + sz1) / 2], { ...po, grain: "z" });
  const strR = b.box("str_r", mat, surf, [sS, sS, sz1 - sz0], [sx, sY, (sz0 + sz1) / 2], { ...po, grain: "z" });
  const strM = b.box("str_m", mat, surf, [2 * (sx - sS / 2), sS, sS], [0, sY, -0.01], { ...po, grain: "x" });
  b.dowel(strL, legFL, 1, 60);
  b.dowel(strL, legBL, 1, 60);
  b.dowel(strR, legFR, 1, 60);
  b.dowel(strR, legBR, 1, 60);
  b.dowel(strM, strL, 1, 50);
  b.dowel(strM, strR, 1, 50);

  // ---- back (in the raked plane of the posts: local y runs up the posts, z = post centre line)
  b.group([0, 0, zRearFront(0) - L / 2], [-tiltDeg, 0, 0], "back_", () => {
    const lower = b.box("rail_lo", mat, surf, [2 * xIn, 0.045, 0.02], [0, 0.545, 0], { ...po, grain: "x" });
    const crest = b.box("rail_crest", mat, surf, [2 * xIn, 0.055, 0.022], [0, 0.8325, 0], { ...po, grain: "x" });
    for (const r of [lower, crest]) {
      b.dowel(r, legBL, 2, 40);
      b.dowel(r, legBR, 2, 40);
    }
    const y0 = 0.545 + 0.0225,
      y1 = 0.8325 - 0.0275;
    [-0.095, 0, 0.095].forEach((x, k) => {
      const slat = b.box(`slat_${k}`, mat, surf, [0.045, y1 - y0, 0.012], [x, (y0 + y1) / 2, 0], { ...po, grain: "y" });
      b.dowel(slat, lower, 1, 30);
      b.dowel(slat, crest, 1, 30);
    });
  });

  return b.build();
}
