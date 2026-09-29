/** Battlefield layout (meters). The road runs along +Z; zombies come from far +Z. */
export const ARENA = {
  /** Half width of the walkable corridor (road + shoulders + field edge). */
  halfWidth: 13.4,
  /** Back wall of the play area (behind the player's truck). */
  zMin: -11.5,
  /** Far end of the play area. */
  zMax: 150,
  /** Zombie spawn band. */
  spawnZMin: 60,
  spawnZMax: 74,
  /** Beyond this z zombies close in faster (they are specks at that range). */
  approachZ: 58,
  spawnHalfWidth: 11.5,
  roadHalfWidth: 5.0,
  /** Distance where the fog wall becomes opaque on a clear day (spawns sit just behind it). */
  fogFar: 56,
  /** Structures may not be placed beyond this z (keeps the spawn band clear). */
  buildZMax: 46,
  playerStart: { x: 0, z: 0 },
  /** Area covered by the persistent ground stain (blood) map. */
  stainMinX: -16,
  stainMaxX: 16,
  stainMinZ: -12,
  stainMaxZ: 116,
};
