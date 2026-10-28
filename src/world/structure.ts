// The apartment's structure as destructible assemblies, built from the floor plan
// (src/world/plan.ts) with real construction: cast-in-place concrete shell + slabs, stud
// partitions with drywall/insulation/wiring/plumbing, floor finishes, suspended ceilings,
// doors, windows, the balcony sliding door and the balcony. PURE (no Babylon).
//
// buildStructure() returns every assembly with parts already placed in WORLD space (identity
// transforms). OPENINGS / WALL_SEGMENTS describe openings and solid wall pieces for audio
// occlusion and light shafts. Reference levels for furnishing: src/world/structure/levels.ts.

import { xident, type Xform } from "../geom/vec.ts";
import type { AssemblyDef } from "../destruction/model/types.ts";
import { ROOMS } from "./plan.ts";
import { layout, openingInfos, wallSegmentInfos, type OpeningInfo, type WallSegmentInfo } from "./structure/layout.ts";
import { buildConcreteSegment, buildSlab } from "./structure/concrete.ts";
import { buildPartition } from "./structure/partition.ts";
import { buildFloor } from "./structure/floors.ts";
import { buildCeiling } from "./structure/ceilings.ts";
import { buildFrontDoor, buildInteriorDoor } from "./structure/doors.ts";
import { buildSlidingDoor, buildWindow } from "./structure/windows.ts";
import { buildBalcony } from "./structure/balcony.ts";

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
  for (const p of L.partitions) for (const o of p.openings) if (o.op.kind === "door") defs.push(buildInteriorDoor(p, o));
  for (const c of L.concrete) {
    for (const o of c.openings) {
      if (o.op.kind === "window") defs.push(buildWindow(c, o));
      else if (o.op.kind === "slidingDoor") defs.push(buildSlidingDoor(c, o));
      else if (o.op.kind === "frontDoor") defs.push(buildFrontDoor(c, o));
    }
  }
  defs.push(buildBalcony());
  return defs.map((def) => ({ def, xf: xident() }));
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
