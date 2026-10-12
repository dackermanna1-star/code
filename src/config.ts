// Global world/scale constants. All gameplay code works in voxel units (1 unit = 1 voxel).

export const CHUNK_BITS = 4;
export const CHUNK = 1 << CHUNK_BITS; // 16
export const CHUNK_MASK = CHUNK - 1;
export const CHUNK_VOL = CHUNK * CHUNK * CHUNK;

// World is a fixed-size column of chunks: wide horizontally, very deep vertically.
export const WORLD_CX = 16;
export const WORLD_CZ = 16;
export const WORLD_CY = 128;
export const WORLD_X = WORLD_CX * CHUNK; // 256
export const WORLD_Z = WORLD_CZ * CHUNK; // 256
export const WORLD_Y = WORLD_CY * CHUNK; // 2048

/** 1 metre = 5 voxels. The player is ~1.7 m tall (≈ 8.5 voxels), echoing Noita's ~12 px tall Mina. */
export const VOXELS_PER_METER = 5;

/** Fixed simulation / gameplay step (Noita runs its world at 60 updates per second). */
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

/** Y coordinate of the top of the Mines (the mountain entrance level). Depth is measured downwards from here. */
export const SURFACE_Y = 1920;

export const GRAVITY = 52; // voxels / s^2 (≈ 10.4 m/s²)
