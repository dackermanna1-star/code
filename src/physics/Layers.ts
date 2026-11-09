/**
 * Havok collision filter layers (bitmasks). Every physics shape sets
 * `filterMembershipMask` to its layer and `filterCollideMask` to what it hits.
 */
export const Layer = {
  WORLD: 1 << 0, // road, terrain, static props
  CAR: 1 << 1, // the player's car chassis
  ZOMBIE: 1 << 2, // live zombie proxy bodies (kinematic-ish capsules)
  RAGDOLL: 1 << 3, // ragdoll body parts and severed limbs
  DEBRIS: 1 << 4, // dynamic props / debris pieces
  PICKUP: 1 << 5, // trigger volumes (survivors, checkpoints)
} as const;

export const CollideWith = {
  WORLD: Layer.CAR | Layer.RAGDOLL | Layer.DEBRIS | Layer.ZOMBIE,
  CAR: Layer.WORLD | Layer.DEBRIS | Layer.RAGDOLL,
  // Live zombies are detected by the car via overlap checks in ZombieManager,
  // not by physical collision, so the car doesn't bounce off them like walls.
  ZOMBIE: Layer.WORLD,
  RAGDOLL: Layer.WORLD | Layer.CAR | Layer.RAGDOLL | Layer.DEBRIS,
  DEBRIS: Layer.WORLD | Layer.CAR | Layer.RAGDOLL | Layer.DEBRIS,
  PICKUP: 0,
} as const;

/** Raycast query mask for wheel suspension rays: only the world and debris. */
export const WHEEL_RAY_MASK = Layer.WORLD | Layer.DEBRIS;
