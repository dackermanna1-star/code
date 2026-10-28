// Collision layer policy (pure, no Babylon). Havok filters a pair of leaf shapes A, B as
//   collide  <=>  (A.membership & B.collideMask) != 0  &&  (B.membership & A.collideMask) != 0
// so a pair is excluded as soon as ONE side leaves the other's bit out of its mask.
// Queries (raycasts, shape casts) follow the same two-way rule with the query's own masks.

import { Layer, type LayerBits } from "../core/context.ts";

/** Every membership bit (Havok filter masks are 32-bit ints; -1 = all bits). */
export const ALL_LAYERS: LayerBits = -1;

/** The layer bits defined in core/context.ts. */
export const KNOWN_LAYERS: LayerBits = Layer.STATIC | Layer.DYNAMIC | Layer.DEBRIS | Layer.PLAYER | Layer.HELD | Layer.TRIGGER;

/**
 * Default collide-with mask for a membership layer:
 *  - STATIC  <-> everything
 *  - DYNAMIC <-> STATIC | DYNAMIC | DEBRIS | PLAYER | HELD
 *  - DEBRIS  <-> STATIC | DYNAMIC | DEBRIS | HELD          (not PLAYER: the player wades through small debris;
 *                                                           stomps on debris are raycast-driven)
 *  - PLAYER  <-> STATIC | DYNAMIC
 *  - HELD    <-> STATIC | DYNAMIC | DEBRIS                 (not PLAYER: a held object never shoves its holder)
 *  - TRIGGER <-> DYNAMIC | DEBRIS | PLAYER | HELD
 * Movable layers also include TRIGGER so trigger volumes can see them (triggers never produce contacts).
 * A membership with several bits gets the union of the masks; unknown bits behave like STATIC.
 *
 * NOTE for the player's character controller: its capsule shape must be given membership PLAYER and
 * `defaultCollideMask(Layer.PLAYER)` explicitly — Babylon's default filter (all bits) would make it
 * collide with debris and held objects.
 */
export function defaultCollideMask(layer: LayerBits): LayerBits {
  let m = 0;
  if (layer & Layer.STATIC || layer & ~KNOWN_LAYERS) m |= ALL_LAYERS;
  if (layer & Layer.DYNAMIC) m |= Layer.STATIC | Layer.DYNAMIC | Layer.DEBRIS | Layer.PLAYER | Layer.HELD | Layer.TRIGGER;
  if (layer & Layer.DEBRIS) m |= Layer.STATIC | Layer.DYNAMIC | Layer.DEBRIS | Layer.HELD | Layer.TRIGGER;
  if (layer & Layer.PLAYER) m |= Layer.STATIC | Layer.DYNAMIC | Layer.TRIGGER;
  if (layer & Layer.HELD) m |= Layer.STATIC | Layer.DYNAMIC | Layer.DEBRIS | Layer.TRIGGER;
  if (layer & Layer.TRIGGER) m |= Layer.DYNAMIC | Layer.DEBRIS | Layer.PLAYER | Layer.HELD;
  return m;
}

/** Havok's pair filter rule (exposed for tests/debugging). */
export function layersCollide(memberA: LayerBits, collideA: LayerBits, memberB: LayerBits, collideB: LayerBits): boolean {
  return (memberA & collideB) !== 0 && (memberB & collideA) !== 0;
}

/** Human-readable layer list, e.g. "DYNAMIC|HELD" (debug overlay). */
export function layerName(bits: LayerBits): string {
  if (bits === ALL_LAYERS) return "ALL";
  const names: string[] = [];
  for (const [k, v] of Object.entries(Layer)) if (bits & v) names.push(k);
  if (bits & ~KNOWN_LAYERS) names.push("0x" + ((bits & ~KNOWN_LAYERS) >>> 0).toString(16));
  return names.length ? names.join("|") : "NONE";
}
