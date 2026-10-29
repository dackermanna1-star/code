// The apartment's structure as destructible assemblies, built from the floor plan
// (src/world/plan.ts) with real construction: cast-in-place concrete shell + slabs, stud
// partitions with drywall/insulation/wiring/plumbing, floor finishes, suspended ceilings,
// doors, windows, the balcony sliding door and the balcony. PURE (no Babylon).
//
// buildStructure() returns every assembly with parts already placed in WORLD space (identity
// transforms). Interior doors live inside their partition's assembly (parts prefixed
// `<opening id>_`, tagged `opening:<id>`); the front door, windows and the sliding door are
// assemblies of their own (every part tagged `opening:<id>`). OPENINGS / WALL_SEGMENTS describe
// openings and solid wall pieces (split wherever the room on either side changes) for audio
// occlusion and light shafts. Reference levels for furnishing: src/world/structure/levels.ts.

import { xident, type Xform } from "../geom/vec.ts";
import type { AssemblyDef } from "../destruction/model/types.ts";
import { ROOMS } from "./plan.ts";
import { layout, openingInfos, wallSegmentInfos, type OpeningInfo, type WallSegmentInfo } from "./structure/layout.ts";
import { buildConcreteSegment, buildSlab } from "./structure/concrete.ts";
import { buildPartition } from "./structure/partition.ts";
import { buildFloor } from "./structure/floors.ts";
import { buildCeiling } from "./structure/ceilings.ts";
import { buildFrontDoor } from "./structure/doors.ts";
import { buildSlidingDoor, buildWindow } from "./structure/windows.ts";
import { buildBalcony } from "./structure/balcony.ts";
import { buildCorridor } from "./structure/corridor.ts";

export type { OpeningInfo, WallSegmentInfo };
export * from "./structure/levels.ts";

export interface StructurePiece {
  def: AssemblyDef;
  xf: Xform;
}

/** Every structural assembly of the apartment (world-space parts, identity transforms). */
export function buildStructure(): StructurePiece[] {
  const L = layout();
  const defs: AssemblyDef[] = [];
  defs.push(buildSlab("floor"), buildSlab("ceiling"));
  for (const c of L.concrete) for (const seg of c.segments) defs.push(buildConcreteSegment(c, seg));
  for (const p of L.partitions) defs.push(buildPartition(p));
  for (const r of ROOMS) {
    if (r.outdoor) continue;
    defs.push(buildFloor(r.id));
    defs.push(buildCeiling(r.id));
  }
  // interior doors are built into their partition's assembly (framed by its jacks/header)
  for (const c of L.concrete) {
    for (const o of c.openings) {
      if (o.op.kind === "window") defs.push(tagOpening(buildWindow(c, o), o.op.id));
      else if (o.op.kind === "slidingDoor") defs.push(tagOpening(buildSlidingDoor(c, o), o.op.id));
      else if (o.op.kind === "frontDoor") defs.push(tagOpening(buildFrontDoor(c, o), o.op.id));
    }
  }
  defs.push(buildBalcony());
  defs.push(buildCorridor());
  return defs.map((def) => ({ def, xf: xident() }));
}

/** Tag every part of a door/window assembly with `opening:<id>` (links it to OPENINGS). */
function tagOpening(def: AssemblyDef, id: string): AssemblyDef {
  for (const p of def.parts) p.tags = [...(p.tags ?? []), `opening:${id}`];
  return def;
}

/** Doors, windows, the sliding door and the cased opening, with world rectangles. */
export const OPENINGS: readonly OpeningInfo[] = openingInfos();

/** Solid wall pieces (around openings) for sound occlusion. */
export const WALL_SEGMENTS: readonly WallSegmentInfo[] = wallSegmentInfos();

/** Totals for logs/tests. */
export function structureStats(pieces: StructurePiece[]): { assemblies: number; parts: number; bonds: number; joints: number } {
  let parts = 0,
    bonds = 0,
    joints = 0;
  for (const p of pieces) {
    parts += p.def.parts.length;
    bonds += p.def.bonds.length;
    joints += p.def.bonds.filter((b) => b.kind === "hinge" || b.kind === "slider").length;
  }
  return { assemblies: pieces.length, parts, bonds, joints };
}
