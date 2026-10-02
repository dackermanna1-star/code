/**
 * Global world/engine constants. Everything in the codebase that depends on chunk
 * dimensions or tick rates must import from here.
 */

/** Chunk column footprint (blocks). */
export const CHUNK_SIZE = 16;
export const CHUNK_SHIFT = 4;
export const CHUNK_MASK = 15;

/** Vertical section size (blocks). Sections are 16x16x16. */
export const SECTION_SIZE = 16;
export const SECTION_VOLUME = 16 * 16 * 16;

/** Total world height in blocks (y in [0, WORLD_HEIGHT)). */
export const WORLD_HEIGHT = 256;
export const SECTIONS_PER_CHUNK = WORLD_HEIGHT / SECTION_SIZE; // 16

/** Overworld sea level: water surface is the top of y = SEA_LEVEL - 1 ... the block at y=SEA_LEVEL-1 is the top water block. */
export const SEA_LEVEL = 63;

/** Game logic ticks per second (Minecraft runs at 20 TPS). */
export const TICKS_PER_SECOND = 20;
export const TICK_SECONDS = 1 / TICKS_PER_SECOND;

/** Fixed physics step (seconds). Player/mob movement and rigid bodies step at this rate. */
export const PHYSICS_HZ = 60;
export const PHYSICS_DT = 1 / PHYSICS_HZ;

/** A full day/night cycle in ticks (Minecraft: 24000 ticks = 20 minutes). */
export const DAY_LENGTH_TICKS = 24000;

/** Random ticks per section per game tick (Minecraft default randomTickSpeed = 3). */
export const RANDOM_TICK_SPEED = 3;

/** Gravity in blocks/s^2 (Minecraft player: ~0.08 b/tick^2 with drag ~= 32 b/s^2). */
export const GRAVITY = 32;

/** Max light level. */
export const MAX_LIGHT = 15;
