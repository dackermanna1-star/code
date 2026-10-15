// Terrain grid layout shared by the generator (worker) and the runtime.
//
// Heights are sampled on a (N x N) vertex grid with spacing CELL meters: sample (i, j) sits at
// world (x = i*CELL, z = j*CELL), stored row-major: index = j*N + i.
// Per-cell grids (surface, tree density, ...) are (M x M) with M = N - 1, cell (i, j) covering
// [i*CELL, (i+1)*CELL] x [j*CELL, (j+1)*CELL].

export const WORLD_SIZE = 3072;
export const CELL = 2;
export const M = WORLD_SIZE / CELL; // 1536 cells per side
export const N = M + 1; // 1537 samples per side
/** Classification grid (surface / splat / trees / cover): CLS x CLS cells of CLS_CELL meters. */
export const CLS = 768;
export const CLS_CELL = 4;
/** Resolution of the water data grid (distance to shore, flow). */
export const WATER_RES = 768;
export const MAP_RES = 2048;

/** Surface class ids stored in TerrainData.surface (index into SURFACE_NAMES). */
export const Surf = {
  Grass: 0,
  DryGrass: 1,
  Forest: 2,
  Dirt: 3,
  Mud: 4,
  Rock: 5,
  Sand: 6,
  Gravel: 7,
  Field: 8,
  Asphalt: 9,
  Concrete: 10,
  Water: 11,
} as const;

/** SurfaceType (core/types) for each Surf id. */
export const SURFACE_NAMES = [
  'grass',
  'grass',
  'dirt',
  'dirt',
  'mud',
  'rock',
  'sand',
  'gravel',
  'dirt',
  'asphalt',
  'concrete',
  'water',
] as const;

export interface TerrainResult {
  heights: Float32Array; // N*N
  /** Smooth per-sample normals, RGBA8 (xyz*0.5+0.5, a = slope-ish ambient occlusion). */
  normals: Uint8Array; // N*N*4
  /** Per-cell surface class (Surf), 4 m cells. */
  surface: Uint8Array; // CLS*CLS
  /** Splat weights, RGBA8 per 4 m cell: A = [dryGrass, forest, dirt, mud], B = [rock, sand, gravel, field]. */
  splatA: Uint8Array; // CLS*CLS*4
  splatB: Uint8Array; // CLS*CLS*4
  /** 0..255 desired tree density (4 m cells). */
  tree: Uint8Array; // CLS*CLS
  /** 0..255 ground cover (grass/crops) (4 m cells). */
  cover: Uint8Array; // CLS*CLS
  /** Distance to the nearest reserved feature in 0.1 m units (255 = >= 25.5 m), 2 m cells. */
  reserved: Uint8Array; // M*M
  /** Road surface per 2 m cell: 0 none, 1 asphalt, 2 dirt, 3 bridge deck. */
  roadMask: Uint8Array; // M*M
  /** Water data (WATER_RES^2 x 4 half floats): [terrain height, distance to land (m), flow x, flow z]. */
  water: Uint16Array;
  /** Base map raster (RGBA, MAP_RES^2) without roads/buildings. */
  mapRaster: Uint8ClampedArray;
  /** Resolved values written back to the layout. */
  lotGround: Float32Array; // per lot groundY
  bridgeDeck: Float32Array; // per bridge deckY
  pondLevel: Float32Array; // per pond level
  /** Per-road arc-length profile heights (debug/road meshes use the final heightmap instead). */
  timings: Record<string, number>;
}

/** Fast float32 -> float16 bits. */
export function toHalf(val: number): number {
  const f32 = toHalf.f32 ?? (toHalf.f32 = new Float32Array(1));
  const u32 = toHalf.u32 ?? (toHalf.u32 = new Uint32Array(f32.buffer));
  f32[0] = val;
  const x = u32[0];
  let bits = (x >> 16) & 0x8000;
  let m = (x >> 12) & 0x07ff;
  const e = (x >> 23) & 0xff;
  if (e < 103) return bits;
  if (e > 142) {
    bits |= 0x7c00;
    bits |= (e === 255 ? 0 : 1) && x & 0x007fffff;
    return bits;
  }
  if (e < 113) {
    m |= 0x0800;
    bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
    return bits;
  }
  bits |= ((e - 112) << 10) | (m >> 1);
  bits += m & 1;
  return bits;
}
toHalf.f32 = undefined as Float32Array | undefined;
toHalf.u32 = undefined as Uint32Array | undefined;
