// Global constants. Units are metres; +x east, +y up, +z south.

export const RES_W = 320;          // internal render resolution (4:3)
export const RES_H = 240;
export const RES_W_WIDE = 426;     // 16:9 option

export const LEVEL_H = 6;          // vertical distance between building levels
export const CHUNK = 16;           // chunk size in cells (1 cell = 1 m)
export const MARGIN = 8;           // extra cells around a chunk used for lighting / neighbours
export const UNIT = 8;             // zone partition granularity
export const SB = 256;             // zone partition super-block size
export const SB_UNITS = SB / UNIT;

export const WALL_T = 0.2;         // thin wall thickness
export const HALF_T = WALL_T / 2;
export const DOOR_H = 2.1;
export const HALFWALL_H = 1.05;
export const RAIL_H = 1.0;
export const PARTITION_H = 1.55;

export const PLAYER_R = 0.24;
export const PLAYER_H = 1.68;
export const CROUCH_H = 1.0;
export const EYE_H = 1.48;         // slightly low camera
export const CROUCH_EYE = 0.82;
export const STEP_H = 0.42;
export const CLIMB_H = 1.45;

export const MAX_LIGHT_R = 8;      // horizontal reach of baked lights (== MARGIN)

export const FLICK_CHANNELS = 16;
