// Shared dimensions of door frames / casings around openings, used by the door builders and by
// the walls (which keep baseboards, tiles and plates clear of the casings). PURE.

import type { Builder } from "../../objects/lib/builder.ts";
import type { BondKind } from "../../destruction/model/types.ts";
import { CASING_REVEAL, CASING_W, FRONT_JAMB_T, JAMB_T, SHIM } from "./levels.ts";
import type { RunOpening } from "./layout.ts";
import { bondAt, boxR, mid, type Interval, type V3 } from "./common.ts";

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

/**
 * A pine shim pack filling the SHIM gap between a jamb / archway liner and the rough-opening
 * framing behind it (jack stud or header), with the fastener that runs through both: two
 * touching bonds (jamb → shim → framing) of the same kind and strength. Every fixing point gets
 * its own shim, so prying one end of a jamb pulls only the nails there, and wrecking the framing
 * really frees the frame. Ranges and anchor in the CURRENT builder frame.
 */
export function shimFix(b: Builder, name: string, jamb: string, framing: string, u: Interval, y: Interval, w: Interval, kind: BondKind, strength: number): string {
  boxR(b, name, "softwood", "wood_pine", u, y, w, { tags: ["shim", "door-frame"] });
  const at: V3 = [mid(u[0], u[1]), mid(y[0], y[1]), mid(w[0], w[1])];
  bondAt(b, jamb, name, kind, strength, at);
  bondAt(b, name, framing, kind, strength, at);
  return name;
}

/** Heights of the jamb fixings (shim packs) of an interior door / archway liner. */
export const JAMB_FIX_Y: readonly number[] = [0.3, 1.0, 1.75];
/** Shim pack size along the jamb and across the wall. */
export const SHIM_LEN = 0.12;
export const SHIM_DEPTH = 0.06;
