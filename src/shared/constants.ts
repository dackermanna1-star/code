/**
 * Engine-wide constants. Gameplay balance values do NOT live here — see
 * `src/shared/data/*` (content definitions) and `src/shared/config.ts`
 * (server-tunable rules).
 */

/** Horizontal chunk edge length in blocks. */
export const CHUNK_SIZE = 16;
export const CHUNK_SHIFT = 4;
export const CHUNK_MASK = CHUNK_SIZE - 1;
/** World height in blocks (y = 0 .. WORLD_HEIGHT-1). Column chunks span the full height. */
export const WORLD_HEIGHT = 128;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_AREA * WORLD_HEIGHT;
export const SEA_LEVEL = 48;

/** Bumped whenever the wire protocol changes incompatibly. */
export const PROTOCOL_VERSION = 1;

/** Authoritative server simulation rate (ticks per second). */
export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE;
/** Fixed timestep for player movement commands (client prediction == server simulation). */
export const MOVE_DT = 1 / 60;

/** Building grid pitch in blocks (x/z and vertical level height). See docs/DESIGN.md §Building. */
export const BUILD_PITCH = 4;

/** Max distance (blocks) a player can interact with blocks/entities. */
export const REACH = 5;
