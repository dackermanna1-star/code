// Shared dimensions of door frames / casings around openings, used by the door builders and by
// the walls (which keep baseboards, tiles and plates clear of the casings). PURE.

import { CASING_REVEAL, CASING_W, FRONT_JAMB_T, JAMB_T, SHIM } from "./levels.ts";
import type { RunOpening } from "./layout.ts";

export interface FaceRect {
  u0: number;
  u1: number;
  y0: number;
  y1: number;
}

/** Clear opening inside the jambs (local u) and its top, for a jamb thickness. */
export function clearOpening(o: RunOpening, jambT: number): { c0: number; c1: number; top: number } {
  return { c0: o.r0 + SHIM + jambT, c1: o.r1 - SHIM - jambT, top: o.head - SHIM - jambT };
}

/** Footprint of the casings on a wall face around an interior door / cased opening. */
export function casingRect(o: RunOpening): FaceRect {
  const { c0, c1, top } = clearOpening(o, JAMB_T);
  return { u0: c0 - CASING_REVEAL - CASING_W, u1: c1 + CASING_REVEAL + CASING_W, y0: 0, y1: top + CASING_REVEAL + CASING_W };
}

/** Footprint of the casings around the front door (thicker hardwood jambs). */
export function casingRectFront(o: RunOpening): FaceRect {
  const { c0, c1, top } = clearOpening(o, FRONT_JAMB_T);
  return { u0: c0 - CASING_REVEAL - CASING_W, u1: c1 + CASING_REVEAL + CASING_W, y0: 0, y1: top + CASING_REVEAL + CASING_W };
}
