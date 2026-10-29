// Which faces of a part are completely covered by rigidly bonded neighbours, so the mesher can
// skip them (no depth ties / dark seams along fused tiles and bonded fracture cells). Pure: no
// Babylon, shared by the runtime (DestructionWorld.visiblePoly) and the unit tests.

import { polyHiddenFaces, type ConvexPoly } from "../../geom/poly.ts";
import { SURFACES } from "../../render/surfaces.ts";

/** True when any face of the poly renders in the transparent (glass) pass. */
export function polyHasTransparentFace(poly: ConvexPoly): boolean {
  for (const f of poly.faces) if (SURFACES[f.attr.surf]?.transparent) return true;
  return false;
}

/**
 * Indices of `poly`'s faces fully covered by the given neighbours (same frame). Only opaque
 * neighbours act as covers: a pane with any transparent face (picture-frame glass, the clear back
 * of a mirror pane, a shower screen) leaves whatever is behind it visible. Faces of a glass part
 * itself may still be hidden by opaque neighbours (a pane edge seated in its frame).
 */
export function coveredFaces(poly: ConvexPoly, neighbours: readonly ConvexPoly[]): Set<number> {
  let covers: ConvexPoly[] | null = null;
  for (const o of neighbours) if (!polyHasTransparentFace(o)) (covers ??= []).push(o);
  return covers ? polyHiddenFaces(poly, covers) : new Set();
}
