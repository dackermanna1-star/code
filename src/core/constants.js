// Global world constants. All world-space units are meters.

/** Edge length of one voxel in meters. */
export const VOXEL = 0.25
/** Voxels per meter. */
export const VPM = 1 / VOXEL

/** World extent in meters (x: west→east, z: north→south). */
export const WORLD_SIZE = 640
/** Terrain cells per side (one cell = one voxel column). */
export const TERRAIN_CELLS = Math.round(WORLD_SIZE / VOXEL)

/** Explorable area; beyond this the whiteout band begins and the player is wrapped around. */
export const PLAY_MIN = 24
export const PLAY_MAX = WORLD_SIZE - 24

/** Default ground surface height in meters (terrain is built around this). */
export const GROUND_Y = 0

/** Face directions used by the mesher and shaders: +X, -X, +Y, -Y, +Z, -Z. */
export const DIRS = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
]

/** Light / surface domains. Outdoor light does not reach indoor surfaces and vice versa. */
export const DOMAIN_OUTDOOR = 1
export const DOMAIN_INDOOR = 2
export const DOMAIN_ALL = 3

export const MAX_LIGHTS_HIGH = 24
