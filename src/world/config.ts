/** Battlefield layout (meters). The road runs along +Z; zombies come from far +Z. */
export const ARENA = {
  /** Half width of the walkable corridor (road + shoulders + field edge). */
  halfWidth: 13.4,
  /** Back wall of the play area (behind the player's truck). */
  zMin: -11.5,
  /** Far end of the play area. */
  zMax: 150,
  /** Zombie spawn band. */
  spawnZMin: 96,
  spawnZMax: 122,
  spawnHalfWidth: 11.5,
  roadHalfWidth: 5.0,
  playerStart: { x: 0, z: 0 },
  /** Area covered by the persistent ground stain (blood) map. */
  stainMinX: -16,
  stainMaxX: 16,
  stainMinZ: -12,
  stainMaxZ: 116,
};
