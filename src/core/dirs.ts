/**
 * Directions follow Minecraft's Direction ordinal:
 *   DOWN=0 (-Y), UP=1 (+Y), NORTH=2 (-Z), SOUTH=3 (+Z), WEST=4 (-X), EAST=5 (+X)
 * Horizontal 2-bit facing (stored in block meta) follows Minecraft's horizontal index:
 *   SOUTH=0, WEST=1, NORTH=2, EAST=3
 */
export const enum Dir {
  DOWN = 0,
  UP = 1,
  NORTH = 2,
  SOUTH = 3,
  WEST = 4,
  EAST = 5,
}

export const DIR_X = [0, 0, 0, 0, -1, 1] as const;
export const DIR_Y = [-1, 1, 0, 0, 0, 0] as const;
export const DIR_Z = [0, 0, -1, 1, 0, 0] as const;
export const DIR_OPPOSITE = [1, 0, 3, 2, 5, 4] as const;
export const DIR_NAMES = ['down', 'up', 'north', 'south', 'west', 'east'] as const;

/** Horizontal facing (2 bits) -> Dir */
export const HFACING_TO_DIR = [Dir.SOUTH, Dir.WEST, Dir.NORTH, Dir.EAST] as const;
/** Dir -> horizontal facing index (-1 for vertical dirs) */
export const DIR_TO_HFACING = [-1, -1, 2, 0, 1, 3] as const;

export function dirFromVector(x: number, y: number, z: number): Dir {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  if (ay >= ax && ay >= az) return y < 0 ? Dir.DOWN : Dir.UP;
  if (ax >= az) return x < 0 ? Dir.WEST : Dir.EAST;
  return z < 0 ? Dir.NORTH : Dir.SOUTH;
}

/** Horizontal facing index for a yaw angle (radians, 0 = looking toward -Z/north, increasing counter-clockwise when viewed from above i.e. toward -X/west). */
export function hfacingFromYaw(yaw: number): number {
  // Our camera convention: yaw 0 looks at -Z (north). yaw +PI/2 looks at -X (west).
  // Returns the facing the player LOOKS toward.
  const a = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const q = Math.round(a / (Math.PI / 2)) & 3; // 0:north 1:west 2:south 3:east
  return [2, 1, 0, 3][q];
}
