/**
 * Hierarchical star sectors (after SpaceEngine's octree catalogue).
 *
 * Level k uses cubic sectors of side SECTOR_SIZE[k] light-years and holds only
 * stars with absolute visual magnitude in band [BRIGHT[k], BRIGHT[k−1]). The
 * camera loads a (2·R+1)³ neighbourhood per level, so a star is generated
 * exactly where it could be seen with the naked eye (m ≲ 7.5), the brightest
 * giants across the whole galaxy, and faint red dwarfs only nearby.
 * Every sector is generated deterministically from (galaxy seed, level, cell).
 */
import { Rng, seedOf } from '../core/rng';
import { densities, ensureDensity, type GalaxyParams, type PopDensity } from './galaxy';
import { bandRange, library, LIB_SIZE, type PopName } from './starlib';

export const LEVELS = 12;
export const SECTOR_SIZE = Array.from({ length: LEVELS }, (_, k) => 24 * Math.pow(2, k)); // 24 ly … 49 152 ly
export const NEIGHBOUR_RADIUS = 1;
export const MAG_LIMIT = 7.0;
/** distance (ly) beyond which a level's stars are not loaded (they fade out before it) */
export const LEVEL_RANGE = SECTOR_SIZE.map((s) => (NEIGHBOUR_RADIUS + 0.5) * s);
// faint-end limit of each level: stars brighter than this live in coarser levels
export const BRIGHT: number[] = LEVEL_RANGE.map((r) => MAG_LIMIT - 5 * Math.log10(r / 3.2616 / 10));

export interface SectorStars {
  key: string;
  level: number;
  ix: number; iy: number; iz: number;
  /** galaxy-local centre (ly) */
  cx: number; cy: number; cz: number;
  count: number;
  /** per star: x, y, z (ly, relative to sector centre) */
  pos: Float64Array;
  /** per star: bolometric L☉, visual L☉, T, initial mass, age (Gyr), remnant code */
  lum: Float32Array;
  lumV: Float32Array;
  temp: Float32Array;
  mass: Float32Array;
  age: Float32Array;
  remnant: Uint8Array;
  seed: number;
}

const POPS: PopName[] = ['young', 'disk', 'bulge', 'halo'];
const _d: PopDensity = { young: 0, disk: 0, bulge: 0, halo: 0 };

function bandFor(level: number): [number, number] {
  const faint = level === 0 ? 99 : BRIGHT[level - 1];
  const bright = level === LEVELS - 1 ? -99 : BRIGHT[level];
  return [bright, faint];
}

const fracCache = new Map<string, { frac: number; i0: number; i1: number }>();
function bandInfo(pop: PopName, level: number) {
  const k = pop + level;
  let v = fracCache.get(k);
  if (!v) {
    const lib = library(pop);
    const [b, f] = bandFor(level);
    const [i0, i1] = bandRange(lib, b, f);
    v = { frac: (i1 - i0) / LIB_SIZE, i0, i1 };
    fracCache.set(k, v);
  }
  return v;
}

export interface Exclusion { x: number; y: number; z: number; r: number }

export function generateSector(g: GalaxyParams, level: number, ix: number, iy: number, iz: number, exclude?: Exclusion[]): SectorStars {
  ensureDensity(g);
  const S = SECTOR_SIZE[level];
  const cx = (ix + 0.5) * S, cy = (iy + 0.5) * S, cz = (iz + 0.5) * S;
  const seed = seedOf(g.seed, 'sector', level, ix, iy, iz);
  const rng = new Rng(seed);
  // expected counts per population: average density at 9 points
  const expect = [0, 0, 0, 0];
  const pmax = [0, 0, 0, 0];
  const offs = [[0, 0, 0], [-0.3, -0.3, -0.3], [0.3, -0.3, -0.3], [-0.3, 0.3, -0.3], [0.3, 0.3, -0.3], [-0.3, -0.3, 0.3], [0.3, -0.3, 0.3], [-0.3, 0.3, 0.3], [0.3, 0.3, 0.3]];
  for (const o of offs) {
    densities(g, cx + o[0] * S, cy + o[1] * S, cz + o[2] * S, _d);
    const v = [_d.young, _d.disk, _d.bulge, _d.halo];
    for (let p = 0; p < 4; p++) {
      expect[p] += v[p] / offs.length;
      pmax[p] = Math.max(pmax[p], v[p]);
    }
  }
  const vol = S * S * S;
  const counts = POPS.map((pop, p) => rng.poisson(expect[p] * vol * bandInfo(pop, level).frac));
  let n = counts.reduce((a, b) => a + b, 0);
  n = Math.min(n, 60000);
  const pos = new Float64Array(n * 3);
  const lum = new Float32Array(n), lumV = new Float32Array(n), temp = new Float32Array(n), mass = new Float32Array(n), age = new Float32Array(n);
  const remnant = new Uint8Array(n);
  let k = 0;
  for (let p = 0; p < 4 && k < n; p++) {
    const pop = POPS[p];
    const lib = library(pop);
    const bi = bandInfo(pop, level);
    const dmax = Math.max(pmax[p] * 1.6, 1e-30);
    for (let j = 0; j < counts[p] && k < n; j++) {
      // rejection sample a position following the population density inside the cube
      let x = 0, y = 0, z = 0;
      for (let t = 0; t < 12; t++) {
        x = rng.range(-0.5, 0.5) * S; y = rng.range(-0.5, 0.5) * S; z = rng.range(-0.5, 0.5) * S;
        densities(g, cx + x, cy + y, cz + z, _d);
        const dv = p === 0 ? _d.young : p === 1 ? _d.disk : p === 2 ? _d.bulge : _d.halo;
        if (rng.next() * dmax <= dv) break;
      }
      if (exclude) {
        let skip = false;
        for (const e of exclude) if ((cx + x - e.x) ** 2 + (cy + y - e.y) ** 2 + (cz + z - e.z) ** 2 < e.r * e.r) skip = true;
        if (skip) continue;
      }
      const s = lib[bi.i0 + Math.min(bi.i1 - bi.i0 - 1, Math.floor(rng.next() * (bi.i1 - bi.i0)))];
      if (!s) continue;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      // small per-star jitter so library duplicates differ
      const jit = 1 + rng.range(-0.04, 0.04);
      lum[k] = s.lum * jit; lumV[k] = s.lumV * jit; temp[k] = s.temp * (1 + rng.range(-0.01, 0.01));
      mass[k] = s.massInit * jit; age[k] = s.age / 1e9; remnant[k] = s.remnant;
      k++;
    }
  }
  return {
    key: `${level}:${ix}:${iy}:${iz}`, level, ix, iy, iz, cx, cy, cz, count: k,
    pos: pos.subarray(0, k * 3), lum: lum.subarray(0, k), lumV: lumV.subarray(0, k), temp: temp.subarray(0, k),
    mass: mass.subarray(0, k), age: age.subarray(0, k), remnant: remnant.subarray(0, k), seed,
  };
}

/** Stable catalogue designation for a procedural star. */
export function starDesignation(g: GalaxyParams, level: number, ix: number, iy: number, iz: number, i: number): string {
  const abbr = g.known && g.name === 'Milky Way' ? 'ICS' : `ICS ${g.name.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase()}`;
  return `${abbr} ${level}${ix < 0 ? 'm' : 'p'}${Math.abs(ix)}-${iy < 0 ? 'm' : 'p'}${Math.abs(iy)}-${iz < 0 ? 'm' : 'p'}${Math.abs(iz)}-${i}`;
}

/** Seed of an individual star system. */
export function starSeed(g: GalaxyParams, level: number, ix: number, iy: number, iz: number, i: number): number {
  return seedOf(g.seed, 'star', level, ix, iy, iz, i);
}
