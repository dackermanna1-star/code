// Living/dining furniture:
//  * side table — 25 mm solid oak top screwed to a four-leg apron base (glued mortise + dowels),
//    side stretchers carrying a loose plywood shelf,
//  * dining table — 1.6 × 0.9 m solid oak top glued up from four boards (it splits along the
//    glue lines or splinters along the grain), apron base with 65 mm legs, tabletop fasteners,
//  * bookcase — 2.02 m tall 18 mm particleboard carcass (oak veneer) with a 3 mm HDF back nailed
//    on, plinth, one doweled fixed shelf for rigidity and three adjustable shelves on pins
//    (books and shelves slide out when it is tipped over). Free-standing, NOT anchored.
//
// Frames: origin on the floor at the centre, +Y up, front +Z.

import { Builder } from "../lib/builder.ts";
import { attachTop, cabinetCarcass, glueByArea, tableBase } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";

// =============================================================================================
// Side table (0.45 × 0.45 × 0.55 m, ~7 kg)
// =============================================================================================

export const SIDE_TABLE_DIMS = { w: 0.45, d: 0.45, h: 0.55, topT: 0.025 } as const;

export function buildSideTable(o: { surf?: SurfaceName; tint?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("sideTable", "Side Table", "furniture", 140, o.seed);
  const surf = o.surf ?? "wood_oak";
  const tint = o.tint ?? 0xffffff;
  const { w, d, h, topT } = SIDE_TABLE_DIMS;
  const legH = h - topT;
  const L = 0.035,
    sS = 0.022,
    sY = 0.12;
  const base = tableBase(b, "base", { w: w - 0.04, d: d - 0.04, h: legH, leg: L, taper: 0.026, apronH: 0.07, apronT: 0.02, mat: "hardwood", surf, tint, stretchers: { y: sY, size: sS, layout: "sides" } }, [0, 0, 0]);
  const top = b.box("top", "hardwood", surf, [w, topT, d], [0, legH + topT / 2, 0], { tint, grain: "x" });
  attachTop(b, top, base.aprons, { count: 2, each: 30 });
  // loose shelf resting on the side stretchers
  const xs = (w - 0.04) / 2 - L / 2;
  const zIn = (d - 0.04) / 2 - L - 0.003;
  const shelf = b.box("shelf", "plywood", surf, [2 * xs, 0.012, 2 * zIn], [0, sY + sS / 2 + 0.006, 0], { tint, grain: "x" });
  for (const s of base.stretchers) b.friction(shelf, s, 8);
  return b.build();
}

// =============================================================================================
// Dining table (1.6 × 0.9 × 0.75 m, ~40 kg)
// =============================================================================================

export const DINING_TABLE_DIMS = { w: 1.6, d: 0.9, h: 0.75, topT: 0.026 } as const;

export function buildDiningTable(o: { surf?: SurfaceName; tint?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("diningTable", "Oak Dining Table", "furniture", 1100, o.seed);
  const surf = o.surf ?? "wood_oak";
  const tint = o.tint ?? 0xffffff;
  const { w, d, h, topT } = DINING_TABLE_DIMS;
  const legH = h - topT;
  const base = tableBase(b, "base", { w: w - 0.14, d: d - 0.14, h: legH, leg: 0.065, taper: 0.045, apronH: 0.09, apronT: 0.022, apronInset: 0.012, mat: "hardwood", surf, tint, joint: 120 }, [0, 0, 0]);
  // top: four boards glued edge to edge (grain along the length)
  const n = 4;
  const bw = d / n;
  const boards: string[] = [];
  for (let k = 0; k < n; k++) {
    const z = -d / 2 + bw * (k + 0.5);
    boards.push(b.box(`top${k}`, "hardwood", surf, [w, topT, bw], [0, legH + topT / 2, z], { tint, grain: "x", uvOffset: [0.37 * k, 0.11 * k] }));
  }
  for (let k = 0; k + 1 < n; k++) b.glue(boards[k], boards[k + 1], glueByArea(w * topT, 4000, 10, 400));
  for (const bd of boards) attachTop(b, bd, base.aprons, { count: 2, each: 30 });
  return b.build();
}

// =============================================================================================
// Bookcase (0.8 × 0.28 × 2.02 m, ~32 kg)
// =============================================================================================

export const BOOKCASE_DIMS = {
  w: 0.8,
  d: 0.28,
  h: 2.02,
  t: 0.018,
  toe: 0.06,
  /** Top faces of the book levels (bottom panel, shelves) and the carcass top. */
  levels: [0.078, 0.43, 0.8, 1.17, 1.54] as const,
  top: 2.02,
  /** Usable inner half-width and the z range of the shelves' surfaces. */
  innerHalfW: 0.382,
  shelfZ0: -0.135,
  shelfZ1: 0.12,
} as const;

export function buildBookcase(o: { surf?: SurfaceName; tint?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("bookcase", "Bookcase", "furniture", 160, o.seed);
  const { w, d, h, t, toe, levels } = BOOKCASE_DIMS;
  cabinetCarcass(b, "case", {
    w,
    h,
    d,
    t,
    mat: "particleboard",
    surf: o.surf ?? "wood_oak",
    tint: o.tint ?? 0xffffff,
    // 3 mm HDF back with the oak-look foil on both faces (seen through the open shelves)
    back: { t: 0.003, surf: o.surf ?? "wood_oak" },
    toeKick: { h: toe, setback: 0.0 },
    top: "full",
    shelves: [levels[1], levels[2], levels[4]],
    fixedShelves: [levels[3]],
    pinStrength: 6,
  });
  return b.build();
}
