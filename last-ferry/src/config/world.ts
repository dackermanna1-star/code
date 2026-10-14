// World layout and timing for Last Ferry. Units: metres, seconds.
//   x: along the pier. Zombies come from the town on the left (-x) and walk
//      right (+x) toward the ferry docked at the right end.
//   z: across the pier (depth), + toward the camera (down on screen).
//   y: up; the deck top is y = 0.
import { visibleHalfWidth } from './view';

export const TICK_RATE = 50;
export const TICK = 1 / TICK_RATE;

/** The pier deck (walkable). Beyond the left end it continues as the promenade into town. */
export const PIER = {
  minX: -30,
  maxX: 23.5,
  minZ: -6,
  maxZ: 6,
  /** Deck plank thickness / top. */
  deckY: 0,
  /** Sea surface. */
  waterY: -2.6,
} as const;

/** The ferry is moored along the right end; the gangway is the goal zombies must not reach. */
export const FERRY = {
  /** Hull starts here (x) and runs off-screen to the right. */
  hullX: 23.5,
  /** Gangway centre (z) and width. */
  gangwayZ: 0,
  gangwayHalfW: 1.4,
} as const;

/** Lanes zombies walk in (z band). */
export const LANE_MIN_Z = -4.8;
export const LANE_MAX_Z = 4.8;
/** Hunter limits. */
export const PLAYER_MIN_Z = -5.3;
export const PLAYER_MAX_Z = 5.3;
export const PLAYER_MIN_X = 0;
export const PLAYER_MAX_X = 20.5;

/** A zombie whose body passes this x has reached the gangway: game over. */
export const ESCAPE_X = 21.6;
/** Zombies appear just beyond the left frame edge at their depth. */
export const spawnX = (z: number, halfLength: number) => -visibleHalfWidth(z) - halfLength - 0.6;
/** Left frame edge at depth z (for "is on screen" checks). */
export const leftEdgeX = (z: number) => -visibleHalfWidth(z);

/** Gameplay gravity (hops, flares, crates). */
export const GRAVITY = 24;

/** The hunter. */
export const HUNTER = {
  life: 100,
  /** Health regained per second after REGEN_DELAY s without damage. */
  regen: 12,
  regenDelay: 3,
  maxSpeedX: 4.6,
  maxSpeedZ: 3.0,
  accel: 26,
  /** Wet planks: low friction, a little slide. */
  friction: 10,
  /** Height of the gun line above the deck. */
  muzzleHeight: 1.0,
  height: 1.75,
  halfWidth: 0.35,
  jumpSpeed: 6.2,
} as const;

/** Cargo crane: the hook block you shoot and where the pallet of crates lands. */
export const CRANE = {
  /** Hook block (hit box) centre and half sizes; it hangs on the gun line in its lane. */
  hookX: -6,
  hookZ: -1.5,
  hookY0: 0.85,
  hookY1: 1.55,
  hookHalfX: 0.35,
  /** Pallet resting height while hanging (bottom of the crates). */
  palletY: 2.2,
  /** Seconds from the rope being cut to the pallet hitting the deck. */
  dropTime: 0.6,
  /** Crush / barricade radius. */
  radius: 2.5,
  barricadeSeconds: 20,
} as const;

/** World rectangle (x, z) covered by the blood/scorch decal map painted on the deck. */
export const DECAL_RECT = { minX: -31, minZ: -7, sizeX: 56, sizeZ: 14 } as const;
