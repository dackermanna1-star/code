// World scale & timing constants.
//
// The original game ran on a 640x480 screen at 50 ticks per second. Game logic
// here keeps the 50 Hz tick so all of the original timings (fire ticks, reload
// ticks, state durations) carry over 1:1. Distances are metres in a 3D world:
//   x: left (-) / right (+), the axis enemies walk along
//   z: depth, + towards the camera (down on screen)
//   y: height above the ice
// Conversion from original pixels follows a 32-degree camera pitch (see
// docs/RESEARCH.md section 4).

import { CAMERA_PITCH_DEG, rowToZ, visibleHalfWidth } from './view';

export { CAMERA_PITCH_DEG };

export const TICK_RATE = 50;
export const TICK = 1 / TICK_RATE;

const PITCH = (CAMERA_PITCH_DEG * Math.PI) / 180;
export const TAN_PITCH = Math.tan(PITCH);

/** Metres per original pixel along x. 640 px == 40 m. */
export const PX_X = 40 / 640;
/**
 * Metres per original pixel of screen-y when it represents depth (ground),
 * averaged over the play band through the real (slightly perspective) camera.
 */
export const PX_Z = (rowToZ(426) - rowToZ(184)) / (426 - 184);
/** Metres per original pixel of screen-y when it represents height. */
export const PX_H = PX_X / Math.cos(PITCH);

/** px/tick → m/s along x. */
export const SPD_X = PX_X * TICK_RATE;
/** px/tick → m/s along depth. */
export const SPD_Z = PX_Z * TICK_RATE;
/** px/tick → m/s vertical. */
export const SPD_H = PX_H * TICK_RATE;
/** px/tick² → m/s² along x. */
export const ACC_X = PX_X * TICK_RATE * TICK_RATE;
export const ACC_Z = PX_Z * TICK_RATE * TICK_RATE;

/** Convert original screen-x (0..640) to world x. */
export const pxToX = (px: number) => (px - 320) * PX_X;
/** Convert original screen-y on the ice (lanes ~181..428) to world depth z through the camera. */
export const pxToZ = (py: number) => rowToZ(py);

/** Visible field: x from -FIELD_HALF_W to +FIELD_HALF_W. */
export const FIELD_HALF_W = 20;
/** Enemies escaping past this x end the game (at the frame centre depth). */
export const ESCAPE_X = FIELD_HALF_W + 0.6;
/** Enemies spawn just beyond the left edge. */
export const SPAWN_X = -FIELD_HALF_W - 1.2;

/** The frame's left/right edge at ground depth z (the view is slightly perspective). */
export const edgeX = (z: number) => visibleHalfWidth(z);
/** x where a creature of half length `hl` at depth z has fully left the frame on the right. */
export const escapeX = (z: number, hl: number) => visibleHalfWidth(z) + hl + 0.3;
/** x just beyond the left frame edge for a creature of half length `hl`. */
export const spawnX = (z: number, hl: number) => -visibleHalfWidth(z) - hl - 0.5;
/** Hunter x limit at depth z (stays fully on screen). */
export const playerXLimit = (z: number) => visibleHalfWidth(z) - 0.45;

/** Player movement limits in depth (original FLIMIT_HEIGHT 181..428). */
export const PLAYER_Z_MIN = pxToZ(184);
export const PLAYER_Z_MAX = pxToZ(426);
export const PLAYER_X_MIN = -FIELD_HALF_W + 0.4;
export const PLAYER_X_MAX = FIELD_HALF_W - 0.4;

/** Enemy lane limits (level.rr = 200..400 for one player). */
export const ENEMY_Z_MIN = pxToZ(200);
export const ENEMY_Z_MAX = pxToZ(400);

/** Gravity for gameplay objects (hops, grenades). Snappier than real life like the original. */
export const GAME_GRAVITY = 26;

/** Player movement, from original constants (PLAYER_XMAX etc.). */
export const PLAYER = {
  life: 1000,
  maxSpeedX: 2.0 * SPD_X,
  maxSpeedZ: 1.3 * SPD_Z,
  accX: 0.1 * ACC_X,
  accZ: 0.06 * ACC_Z,
  /** Ice friction (ICE_FRICTION * max speed per tick). */
  fricX: 0.03 * 2.0 * ACC_X,
  fricZ: 0.03 * 1.3 * ACC_Z,
  /** Height of the gun line above the ice. */
  muzzleHeight: 0.78,
  height: 1.5,
  halfWidth: 0.35,
  /** Health regenerated per second, after REGEN_DELAY seconds without damage. */
  regen: 20,
  regenDelay: 3,
  jumpSpeed: 6.5,
} as const;

export const MAX_PLAYERS = 2;
