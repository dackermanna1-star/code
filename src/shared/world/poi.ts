import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT } from '../constants';
import { hash4, mulberry32, smoothstep } from '../math';
import { B } from './blocks';
import { Biome } from './biomes';
import { cidx } from './chunk';
import type { WorldGenerator } from './worldgen';

/**
 * Points of interest ("monuments"): original procedurally-built locations
 * that concentrate loot and risk. One POI at most per REGION x REGION area,
 * placed on flattened land. Every chunk can independently re-stamp the parts
 * of a POI it overlaps, so generation stays a pure function of the seed.
 *
 * Builder rules (checked by tests/poi.test.ts):
 *  - builders are pure functions of the POI instance: randomness only from
 *    the provided `rnd` / position hashes, writes only through the setter,
 *    and nothing outside the footprint;
 *  - every crate / barrel must be reachable on foot from outside the
 *    footprint with 1-block steps and 2 blocks of headroom (3 where a step
 *    up is taken), and no structure may float.
 */

export const POI_REGION = 384;
const SKIRT = 14;
const MARGIN = 40;

export type PoiKind =
  | 'radio_outpost' | 'gas_station'
  | 'container_yard' | 'quarry'
  | 'globe_tank' | 'bunker' | 'power_station';

export interface PoiDef {
  kind: PoiKind;
  name: string;
  w: number;
  d: number;
  /** Height of the tallest structure above the floor; air is cleared up to here. */
  h: number;
  /** Peak radiation level at the centre (0 = none). */
  radiation: number;
  radRadius: number;
  /** Relative spawn weight. */
  weight: number;
  tier: 'low' | 'mid' | 'high';
}

export const POI_DEFS: Record<PoiKind, PoiDef> = {
  radio_outpost: { kind: 'radio_outpost', name: 'Radio Outpost', w: 26, d: 26, h: 40, radiation: 0, radRadius: 0, weight: 4, tier: 'low' },
  gas_station: { kind: 'gas_station', name: 'Abandoned Gas Station', w: 36, d: 30, h: 15, radiation: 0, radRadius: 0, weight: 4, tier: 'low' },
  container_yard: { kind: 'container_yard', name: 'Harbour Container Yard', w: 46, d: 42, h: 30, radiation: 4, radRadius: 26, weight: 3, tier: 'mid' },
  quarry: { kind: 'quarry', name: 'Stone Quarry', w: 44, d: 44, h: 16, radiation: 3, radRadius: 14, weight: 3, tier: 'mid' },
  globe_tank: { kind: 'globe_tank', name: 'Globe Tank', w: 34, d: 34, h: 31, radiation: 10, radRadius: 20, weight: 2, tier: 'high' },
  bunker: { kind: 'bunker', name: 'Sealed Bunker', w: 28, d: 26, h: 14, radiation: 18, radRadius: 16, weight: 2, tier: 'high' },
  power_station: { kind: 'power_station', name: 'Power Station', w: 48, d: 48, h: 42, radiation: 12, radRadius: 24, weight: 2, tier: 'high' },
};

export interface PoiInstance {
  def: PoiDef;
  x0: number;
  z0: number;
  /** Floor level (y of the ground layer). */
  y: number;
  seed: number;
  cx: number;
  cz: number;
}

export type Setter = (x: number, y: number, z: number, id: number) => void;

export class PoiIndex {
  private cache = new Map<number, PoiInstance | null>();

  constructor(private gen: WorldGenerator) {}

  regionPoi(rx: number, rz: number): PoiInstance | null {
    const key = (rx + 32768) * 65536 + (rz + 32768);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const poi = this.computeRegion(rx, rz);
    this.cache.set(key, poi);
    return poi;
  }

  private computeRegion(rx: number, rz: number): PoiInstance | null {
    const h = hash4(rx, rz, this.gen.seed, 0x9013);
    const rnd = mulberry32(h);
    if (rnd() > 0.75) return null;
    const defs = Object.values(POI_DEFS);
    const total = defs.reduce((a, d) => a + d.weight, 0);
    let pick = rnd() * total;
    let def = defs[0];
    for (const d of defs) {
      pick -= d.weight;
      if (pick <= 0) { def = d; break; }
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      const span = POI_REGION - 2 * MARGIN - Math.max(def.w, def.d);
      const x0 = rx * POI_REGION + MARGIN + Math.floor(rnd() * span);
      const z0 = rz * POI_REGION + MARGIN + Math.floor(rnd() * span);
      const pts = [[0, 0], [def.w, 0], [0, def.d], [def.w, def.d], [def.w >> 1, def.d >> 1]];
      let min = Infinity, max = -Infinity, sum = 0, ok = true;
      for (const [ox, oz] of pts) {
        const c = this.gen.rawColumn(x0 + ox, z0 + oz);
        if (c.height < SEA_LEVEL + 1 || c.biome === Biome.Mountains || c.biome === Biome.River || c.river > 0.1) { ok = false; break; }
        min = Math.min(min, c.height);
        max = Math.max(max, c.height);
        sum += c.height;
      }
      if (!ok || max - min > 12) continue;
      const y = Math.max(SEA_LEVEL + 2, Math.round(sum / pts.length));
      return { def, x0, z0, y, seed: h, cx: x0 + (def.w >> 1), cz: z0 + (def.d >> 1) };
    }
    return null;
  }

  private poiAt(x: number, z: number): PoiInstance | null {
    return this.regionPoi(Math.floor(x / POI_REGION), Math.floor(z / POI_REGION));
  }

  /** Terrain flattening target for a column, or null. weight=1 inside the footprint. */
  flatten(x: number, z: number): { y: number; weight: number } | null {
    const p = this.poiAt(x, z);
    if (!p) return null;
    const dx = Math.max(p.x0 - x, 0, x - (p.x0 + p.def.w - 1));
    const dz = Math.max(p.z0 - z, 0, z - (p.z0 + p.def.d - 1));
    const d = Math.max(dx, dz);
    if (d > SKIRT) return null;
    return { y: p.y, weight: d === 0 ? 1 : 1 - smoothstep(0, SKIRT, d) };
  }

  /** Radiation level (0..) at a world position from nearby POIs. */
  radiationAt(x: number, y: number, z: number): number {
    const p = this.poiAt(Math.floor(x), Math.floor(z));
    if (!p || p.def.radiation <= 0) return 0;
    const d = Math.hypot(x - p.cx, z - p.cz, (y - p.y) * 0.5);
    if (d > p.def.radRadius) return 0;
    return p.def.radiation * (1 - smoothstep(p.def.radRadius * 0.5, p.def.radRadius, d));
  }

  /** All POIs whose region intersects the square around (x,z). */
  poisNear(x: number, z: number, radius: number): PoiInstance[] {
    const out: PoiInstance[] = [];
    const r0x = Math.floor((x - radius) / POI_REGION), r1x = Math.floor((x + radius) / POI_REGION);
    const r0z = Math.floor((z - radius) / POI_REGION), r1z = Math.floor((z + radius) / POI_REGION);
    for (let rz = r0z; rz <= r1z; rz++) for (let rx = r0x; rx <= r1x; rx++) {
      const p = this.regionPoi(rx, rz);
      if (p) out.push(p);
    }
    return out;
  }

  stampChunk(data: Uint8Array, cx: number, cz: number) {
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
    const p = this.poiAt(x0, z0);
    if (!p) return;
    if (x0 + CHUNK_SIZE <= p.x0 - 2 || x0 > p.x0 + p.def.w + 2 || z0 + CHUNK_SIZE <= p.z0 - 2 || z0 > p.z0 + p.def.d + 2) return;
    const x1 = x0 + CHUNK_SIZE, z1 = z0 + CHUNK_SIZE;
    const set: Setter = (x, y, z, id) => {
      if (x < x0 || x >= x1 || z < z0 || z >= z1 || y < 1 || y >= WORLD_HEIGHT) return;
      data[cidx(x - x0, y, z - z0)] = id;
    };
    buildPoi(p, set, { x0, z0, x1, z1 });
  }
}

/**
 * Run a POI's full build (air clearing + builder) through `set`. `clip`
 * limits the air clearing to a rectangle (the chunk being stamped) — the
 * builder itself always runs in full so every chunk makes identical decisions.
 * Exported for tests and tools.
 */
export function buildPoi(p: PoiInstance, set: Setter, clip?: { x0: number; z0: number; x1: number; z1: number }) {
  // Clear the air above the pad (removes trees from neighbouring cells, keeps things tidy).
  const zs = Math.max(clip?.z0 ?? -Infinity, p.z0), ze = Math.min(clip?.z1 ?? Infinity, p.z0 + p.def.d);
  const xs = Math.max(clip?.x0 ?? -Infinity, p.x0), xe = Math.min(clip?.x1 ?? Infinity, p.x0 + p.def.w);
  const top = Math.min(WORLD_HEIGHT, p.y + p.def.h + 3);
  for (let z = zs; z < ze; z++) for (let x = xs; x < xe; x++) for (let y = p.y + 1; y < top; y++) set(x, y, z, B.air);
  BUILDERS[p.def.kind](new Site(set, p, mulberry32(p.seed)));
}

// --- Builder toolkit ------------------------------------------------------------

/** Neighbour offsets of a 3x3 ring in walking order (each step is 4-adjacent to the next). */
const RING8: ReadonlyArray<readonly [number, number]> = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
/** 2x2 spiral order (offsets from the low corner). */
const RING4: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];

/**
 * Drawing context in POI-local coordinates: x in [0,w), z in [0,d), y=0 is
 * the ground layer (feet stand at y=1). All writes are clipped to the
 * footprint so chunk stamping stays consistent.
 */
class Site {
  readonly w: number;
  readonly d: number;
  constructor(private readonly out: Setter, readonly p: PoiInstance, readonly rnd: () => number) {
    this.w = p.def.w;
    this.d = p.def.d;
  }

  set(x: number, y: number, z: number, id: number) {
    if (x < 0 || z < 0 || x >= this.w || z >= this.d) return;
    this.out(this.p.x0 + x, this.p.y + y, this.p.z0 + z, id);
  }

  /** Fill an inclusive box. A reversed range is empty (never silently swapped). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number) {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, id);
  }

  /** Box shell with `inner` (default air) inside. */
  hollow(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number, inner: number = B.air) {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || y === y0 || y === y1 || z === z0 || z === z1;
      this.set(x, y, z, edge ? id : inner);
    }
  }

  /** The four side walls of a box (no floor / roof). */
  walls(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) { this.set(x, y, z0, id); this.set(x, y, z1, id); }
      for (let z = z0 + 1; z < z1; z++) { this.set(x0, y, z, id); this.set(x1, y, z, id); }
    }
  }

  /** Deterministic [0,1) noise of a local position (identical in every chunk). */
  hash(x: number, y: number, z: number, salt = 0): number {
    return hash4(this.p.x0 + x, this.p.y + y, this.p.z0 + z, (this.p.seed ^ Math.imul(salt + 1, 0x632be5ab)) | 0) / 4294967296;
  }

  /** `base`, or rusted metal in coarse 2x2 patches. */
  rusty(x: number, y: number, z: number, base: number, chance: number): number {
    return this.hash(x >> 1, y >> 1, z >> 1, 77) < chance ? B.rusted_metal : base;
  }

  int(n: number): number {
    return Math.floor(this.rnd() * n);
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  /** 3D voxel line (26-connected). */
  line(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      this.set(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), Math.round(z0 + (z1 - z0) * t), id);
    }
  }

  /** Chain-link fence run along x or z at feet level (2 high). */
  fence(x0: number, z0: number, x1: number, z1: number, y = 1, height = 2) {
    this.box(x0, y, z0, x1, y + height - 1, z1, B.chain_fence);
  }

  /** Street lamp: steel pole with a lamp head on a short arm toward (dx,dz). */
  lampPost(x: number, z: number, height: number, dx: number, dz: number) {
    this.box(x, 1, z, x, height, z, B.steel_beam);
    this.set(x + dx, height, z + dz, B.steel_beam);
    this.set(x + dx, height - 1, z + dz, B.lamp);
  }

  /**
   * Spiral stair around a 1x1 centre pole at (x,z): step k (1..n) is a grating
   * tread at height y0+k-1 in ring cell RING8[topIdx - (n - k)] (mod 8), so the
   * top step lands at ring index `topIdx`. 8 steps per turn leaves ample
   * headroom; the 3 cells above every tread are cleared (this also cuts hatches).
   */
  spiral(x: number, z: number, y0: number, n: number, topIdx: number, pole: number = B.steel_beam, tread: number = B.metal_grate) {
    this.box(x, y0, z, x, y0 + n - 1, z, pole);
    for (let k = 1; k <= n; k++) {
      const [dx, dz] = RING8[(((topIdx - (n - k)) % 8) + 8) % 8];
      const h = y0 + k - 1;
      this.set(x + dx, h, z + dz, tread);
      // clear the body space above the tread (3 cells: room to jump)
      this.box(x + dx, h + 1, z + dz, x + dx, h + 3, z + dz, B.air);
    }
  }

  /**
   * Straight stair rising one block per cell from (x,z) in direction (dx,dz):
   * tread k (1..n) at height y0+k-1, with `fill` below each tread down to y0.
   */
  stair(x: number, z: number, dx: number, dz: number, y0: number, n: number, tread: number, fill: number | null, width = 1) {
    const px = dz !== 0 ? 1 : 0, pz = dx !== 0 ? 1 : 0;
    for (let k = 1; k <= n; k++) {
      for (let wi = 0; wi < width; wi++) {
        const sx = x + dx * (k - 1) + px * wi, sz = z + dz * (k - 1) + pz * wi;
        const h = y0 + k - 1;
        if (fill !== null) this.box(sx, y0, sz, sx, h - 1, sz, fill);
        this.set(sx, h, sz, tread);
        this.box(sx, h + 1, sz, sx, h + 3, sz, B.air);
      }
    }
  }
}

// --- Shared pieces ----------------------------------------------------------------

function pad(s: Site, id: number) {
  s.box(0, -2, 0, s.w - 1, 0, s.d - 1, id);
}

/**
 * Shipping container: shell 3 wide x 4 tall (floor at y, roof at y+3), `len`
 * long along x (alongX) or z. `door` = +1 / -1 opens the high / low end (a
 * 1x2 doorway onto the floor, with the two door leaves swung out when the
 * container sits on the ground); 0 = closed.
 */
function container(s: Site, x: number, y: number, z: number, len: number, alongX: boolean, color: number, door: -1 | 0 | 1) {
  const at = (u: number, yy: number, v: number, id: number) => (alongX ? s.set(x + u, yy, z + v, id) : s.set(x + v, yy, z + u, id));
  for (let u = 0; u < len; u++) for (let yy = y; yy <= y + 3; yy++) for (let v = 0; v < 3; v++) {
    const edge = u === 0 || u === len - 1 || yy === y || yy === y + 3 || v === 0 || v === 2;
    at(u, yy, v, edge ? color : B.air);
  }
  if (door === 0) return;
  const eu = door > 0 ? len - 1 : 0;
  at(eu, y + 1, 1, B.air);
  at(eu, y + 2, 1, B.air);
  if (y <= 0) {
    for (let yy = y + 1; yy <= y + 3; yy++) { at(eu + door, yy, 0, color); at(eu + door, yy, 2, color); }
  }
}

/** Small car wreck along x (4 long, 2 wide). */
function carWreck(s: Site, x: number, z: number, color: number) {
  s.box(x, 1, z, x + 3, 1, z + 1, color);
  s.box(x + 1, 2, z, x + 2, 2, z + 1, B.glass);
  s.set(x + 1, 2, z, s.hash(x, 2, z, 5) < 0.5 ? B.air : B.glass);
  s.box(x + 1, 3, z, x + 2, 3, z + 1, color);
  s.set(x, 1, z, B.rusted_metal);
}

// --- Builders ---------------------------------------------------------------------

const BUILDERS: Record<PoiKind, (s: Site) => void> = {
  radio_outpost: buildRadioOutpost,
  gas_station: buildGasStation,
  container_yard: buildContainerYard,
  quarry: buildQuarry,
  globe_tank: buildGlobeTank,
  bunker: buildBunker,
  power_station: buildPowerStation,
};

/** Low tier: fenced compound with a radio hut, generator shed and a climbable lattice mast. */
function buildRadioOutpost(s: Site) {
  pad(s, B.gravel);
  // concrete paths: gate -> hut, hut -> mast
  s.box(11, 0, 11, 13, 0, 25, B.concrete);
  s.box(13, 0, 11, 17, 0, 12, B.concrete);
  // perimeter fence with posts and a south gate
  for (let i = 1; i <= 24; i++) {
    for (const [x, z] of [[i, 1], [i, 24], [1, i], [24, i]]) {
      if (z === 24 && x >= 10 && x <= 14) continue;
      const post = (x + z) % 5 === 0 || (x === 10 || x === 14) && z === 24;
      s.box(x, 1, z, x, post ? 3 : 2, z, post ? B.steel_beam : B.chain_fence);
    }
  }
  s.lampPost(9, 23, 6, 0, -1);
  s.lampPost(15, 23, 6, 0, -1);

  // radio hut 10x8, door on the south side, stair to the roof on the east side
  s.hollow(3, 0, 3, 12, 5, 10, B.concrete);
  s.box(3, 1, 3, 12, 1, 10, B.bricks);
  s.box(4, 1, 4, 11, 4, 9, B.air);
  s.box(7, 1, 10, 7, 2, 10, B.air);
  s.box(5, 2, 3, 6, 3, 3, B.glass);
  s.box(9, 2, 3, 10, 3, 3, B.glass);
  s.box(3, 2, 6, 3, 3, 7, B.glass);
  s.box(5, 1, 4, 7, 1, 4, B.control_panel);
  s.set(8, 1, 4, B.planks);
  s.set(10, 1, 4, B.loot_crate);
  s.set(11, 1, 8, B.barrel);
  s.set(8, 4, 7, B.lamp);
  s.stair(13, 10, 0, -1, 1, 5, B.concrete, B.concrete);
  s.box(14, 2, 6, 14, 6, 6, B.chain_fence);
  // roof parapet (gap where the stair arrives), dish and a crate
  for (let x = 3; x <= 12; x++) { s.set(x, 6, 3, B.chain_fence); s.set(x, 6, 10, B.chain_fence); }
  for (let z = 4; z <= 9; z++) { s.set(3, 6, z, B.chain_fence); if (z !== 6) s.set(12, 6, z, B.chain_fence); }
  s.box(5, 6, 6, 5, 8, 6, B.steel_beam);
  s.box(4, 8, 7, 6, 8, 7, B.concrete);
  s.box(4, 9, 6, 6, 9, 6, B.concrete);
  s.box(4, 10, 5, 6, 10, 5, B.concrete);
  s.set(5, 9, 5, B.steel_beam);
  s.set(5, 10, 4, B.lamp);
  s.set(10, 6, 8, B.loot_crate);

  // generator shed: open steel frame, rusty roof, fuel barrels
  for (const [x, z] of [[16, 3], [21, 3], [16, 7], [21, 7]]) s.box(x, 1, z, x, 3, z, B.steel_beam);
  s.box(16, 4, 3, 21, 4, 7, B.rusted_metal);
  s.box(17, 1, 4, 19, 2, 5, B.rusted_metal);
  s.set(18, 2, 6, B.control_panel);
  s.set(20, 1, 4, B.barrel);
  s.set(20, 1, 5, B.barrel);
  s.set(17, 1, 6, B.barrel);

  // lattice mast 4x4 with an internal 2x2 spiral stair to a railed balcony
  const tx = 16, tz = 15, H = 30 + s.int(6);
  for (let k = 1; k <= H; k++) {
    for (const [ox, oz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) s.set(tx + ox, k, tz + oz, B.steel_beam);
    if (k % 5 === 0) {
      s.box(tx, k, tz, tx + 3, k, tz, B.steel_beam);
      s.box(tx, k, tz + 3, tx + 3, k, tz + 3, B.steel_beam);
      s.box(tx, k, tz, tx, k, tz + 3, B.steel_beam);
      s.box(tx + 3, k, tz, tx + 3, k, tz + 3, B.steel_beam);
    }
  }
  const BAL = 12;
  // balcony: grating on the mast's edge cells plus an outer railing ring
  for (let z = tz - 1; z <= tz + 4; z++) for (let x = tx - 1; x <= tx + 4; x++) {
    const outer = x === tx - 1 || x === tx + 4 || z === tz - 1 || z === tz + 4;
    const inner = x > tx && x < tx + 3 && z > tz && z < tz + 3;
    const leg = (x === tx || x === tx + 3) && (z === tz || z === tz + 3);
    if (leg || inner) continue;
    s.set(x, BAL, z, outer ? B.steel_beam : B.metal_grate);
    if (outer) s.set(x, BAL + 1, z, B.chain_fence);
  }
  for (let k = 1; k <= BAL; k++) {
    const [ox, oz] = RING4[(k + 1) % 4];
    s.set(tx + 1 + ox, k, tz + 1 + oz, B.metal_grate);
    s.box(tx + 1 + ox, k + 1, tz + 1 + oz, tx + 1 + ox, k + 3, tz + 1 + oz, B.air);
  }
  s.set(tx + 2, BAL + 1, tz, B.loot_crate);
  // antenna mast, warning lamp and small relay dishes
  s.box(tx + 1, H, tz + 1, tx + 2, H, tz + 2, B.steel_beam);
  s.box(tx + 1, H + 1, tz + 1, tx + 1, H + 4, tz + 1, B.steel_beam);
  s.set(tx + 1, H + 5, tz + 1, B.lamp);
  s.box(tx - 1, 20, tz, tx - 1, 21, tz + 1, B.concrete);
  s.box(tx + 4, 24, tz + 2, tx + 4, 25, tz + 3, B.concrete);
  s.set(5, 1, 20, B.barrel);
  s.set(5, 1, 21, B.loot_crate);
}

/** Round brick smokestack (outer radius r) from y0 up to y1 with banded top and a warning lamp. */
function smokestack(s: Site, cx: number, cz: number, r: number, y0: number, y1: number) {
  for (let y = y0; y <= y1; y++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const d = Math.hypot(dx, dz);
    if (d > r + 0.3) continue;
    const shell = d > r - 1 + 0.3;
    const band = y > y1 - 6 && Math.floor((y1 - y) / 2) % 2 === 0;
    // hollow only near the top: a solid core keeps NPC spawns from landing in a deep shaft
    s.set(cx + dx, y, cz + dz, shell ? (y === y1 ? B.steel_beam : band ? B.container_red : y > y1 - 6 ? B.concrete : B.bricks) : y >= y1 - 2 ? B.air : B.asphalt);
  }
  s.set(cx + r, y1 + 1, cz, B.lamp);
  s.set(cx - r, y1 + 1, cz, B.lamp);
}

/**
 * Mid tier: a harbour quay with a water basin, a teal ship-to-shore gantry
 * crane (climbable to its deck), stacked shipping containers, a yellow RTG
 * gantry, an office and a boiler house with a smokestack.
 */
function buildContainerYard(s: Site) {
  pad(s, B.asphalt);
  const W = s.w, D = s.d;
  // quay: concrete aprons, basin with water, slipway steps at the west end
  s.box(0, 0, 0, W - 1, 0, 11, B.concrete);
  s.box(2, -4, 2, W - 3, -4, 7, B.concrete);
  s.box(2, -3, 2, W - 3, -1, 7, B.water);
  s.box(2, 0, 2, W - 3, 0, 7, B.air);
  for (let i = 0; i < 3; i++) s.box(2 + i, -4, 2, 2 + i, -1 - i, 7, B.concrete);
  s.box(1, 0, 8, W - 2, 0, 8, B.hazard_stripes);
  s.box(1, 0, 1, W - 2, 0, 1, B.hazard_stripes);
  for (let x = 6; x < W - 3; x += 8) s.set(x, 1, 8, B.steel_beam);
  // crane rails and painted lanes
  s.box(1, 0, 10, W - 2, 0, 10, B.steel_beam);
  s.box(1, 0, 16, W - 2, 0, 16, B.steel_beam);
  for (const z of [17, 23, 29]) for (let x = 1; x <= 28; x++) if (x % 4 !== 0) s.set(x, 0, z, B.road_marking);

  // perimeter fence (open towards the water), gates south and east
  for (let z = 12; z < D; z++) {
    if (z < 27 || z > 29) s.box(W - 1, 1, z, W - 1, 2, z, B.chain_fence);
    s.box(0, 1, z, 0, 2, z, B.chain_fence);
  }
  for (let x = 0; x < W; x++) if (x < 27 || x > 30) s.box(x, 1, D - 1, x, 2, D - 1, B.chain_fence);

  // container stacks: 4 rows x 3 columns, doors facing east (+x)
  const colors = [B.container_orange, B.container_teal, B.container_orange, B.container_teal, B.container_red, B.container_blue];
  const rows = [13, 19, 25, 31];
  const cols = [2, 11, 20];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < cols.length; c++) {
      const climb = r === 1 && c === 1;
      const n = climb ? 3 : 1 + s.int(3);
      for (let k = 0; k < n; k++) {
        const ground = k === 0;
        container(s, cols[c], 3 * k, rows[r], 7, true, s.pick(colors), ground ? 1 : 0);
        if (ground && s.rnd() < 0.6) s.set(cols[c] + 1, 1, rows[r] + 1, s.rnd() < 0.2 ? B.military_crate : B.loot_crate);
      }
    }
  }
  // climbable stack: steel stair in the aisle up to its roof, loot on top
  s.stair(8, 22, 1, 0, 1, 9, B.metal_grate, null);
  for (const x of [10, 13, 16]) s.box(x, 1, 22, x, x - 8, 22, B.steel_beam);
  s.set(12, 10, 20, B.military_crate);
  s.set(13, 10, 20, B.loot_crate);

  // yellow RTG gantry straddling rows 3-4
  for (const [x, z] of [[9, 24], [19, 24], [9, 35], [19, 35]]) s.box(x, 1, z, x, 12, z, B.hazard_stripes);
  s.box(9, 13, 24, 19, 13, 24, B.hazard_stripes);
  s.box(9, 13, 35, 19, 13, 35, B.hazard_stripes);
  s.box(9, 13, 24, 9, 13, 35, B.hazard_stripes);
  s.box(19, 13, 24, 19, 13, 35, B.hazard_stripes);
  s.box(9, 13, 28, 19, 13, 28, B.hazard_stripes);
  s.box(9, 13, 31, 19, 13, 31, B.hazard_stripes);
  s.box(13, 11, 28, 15, 12, 31, B.rusted_metal);
  s.box(13, 11, 29, 13, 11, 30, B.glass);
  s.set(15, 10, 30, B.lamp);

  // ship-to-shore crane: legs over the quay, boom out over the basin
  const L = 30;
  for (const [x, z] of [[L, 9], [L + 6, 9], [L, 16], [L + 6, 16]]) s.box(x, 1, z, x, 15, z, B.crane_stripes);
  s.box(L, 8, 9, L, 8, 16, B.crane_stripes);
  s.box(L + 6, 8, 9, L + 6, 8, 16, B.crane_stripes);
  s.box(L, 12, 9, L + 6, 12, 9, B.crane_stripes);
  s.box(L, 12, 16, L + 6, 12, 16, B.crane_stripes);
  s.box(L, 16, 0, L, 16, 22, B.crane_stripes);
  s.box(L + 6, 16, 0, L + 6, 16, 22, B.crane_stripes);
  for (const z of [0, 9, 16, 22]) s.box(L, 16, z, L + 6, 16, z, B.crane_stripes);
  s.box(L + 1, 16, 10, L + 5, 16, 15, B.metal_grate);
  s.box(L + 3, 16, 1, L + 3, 16, 21, B.metal_grate);
  for (let z = 0; z <= 22; z++) {
    if (z !== 13) s.set(L + 6, 17, z, B.chain_fence);
    s.set(L, 17, z, B.chain_fence);
  }
  s.box(L + 1, 17, 0, L + 5, 17, 0, B.chain_fence);
  // machinery house on the back of the deck
  s.hollow(L + 1, 16, 17, L + 5, 20, 21, B.container_teal);
  s.box(L + 1, 20, 17, L + 5, 20, 21, B.crane_stripes);
  s.box(L + 3, 17, 17, L + 3, 18, 17, B.air);
  s.set(L + 2, 17, 20, B.loot_crate);
  s.set(L + 4, 17, 20, B.control_panel);
  s.set(L + 3, 19, 19, B.lamp);
  // A-frame and stays
  for (const x of [L, L + 6]) {
    s.box(x, 17, 16, x, 24, 16, B.crane_stripes);
    s.line(x, 24, 16, x, 17, 1, B.crane_stripes);
    s.line(x, 24, 16, x, 21, 22, B.crane_stripes);
  }
  s.box(L, 25, 16, L + 6, 25, 16, B.crane_stripes);
  s.set(L + 3, 26, 16, B.lamp);
  // trolley, hoist cables and a container hanging over the water
  s.box(L + 1, 15, 3, L + 5, 15, 5, B.rusted_metal);
  s.box(L + 1, 7, 4, L + 1, 14, 4, B.chain_fence);
  s.box(L + 5, 7, 4, L + 5, 14, 4, B.chain_fence);
  s.box(L, 6, 4, L + 6, 6, 4, B.hazard_stripes);
  container(s, L, 2, 3, 7, true, B.container_orange, 0);
  // stair tower up to the deck (arrives at the railing gap at z=13)
  s.spiral(L + 8, 13, 1, 16, 4);

  // site office
  s.hollow(38, 0, 19, 44, 4, 25, B.concrete);
  s.box(38, 2, 20, 38, 3, 24, B.glass);
  s.box(38, 1, 22, 38, 2, 22, B.air);
  s.set(43, 1, 20, B.control_panel);
  s.set(43, 1, 21, B.control_panel);
  s.set(43, 1, 24, B.loot_crate);
  s.set(41, 3, 22, B.lamp);
  // boiler house + smokestack
  s.hollow(35, 0, 30, 42, 6, 36, B.bricks);
  s.box(35, 6, 30, 42, 6, 36, B.rusted_metal);
  s.box(35, 1, 33, 35, 2, 33, B.air);
  s.box(38, 1, 31, 40, 3, 32, B.rusted_metal);
  s.set(41, 1, 35, B.loot_crate);
  s.set(36, 1, 35, B.barrel);
  s.set(38, 5, 34, B.lamp);
  smokestack(s, 43, 39, 2, 1, 27);
  s.line(42, 4, 36, 42, 4, 37, B.rusted_metal);

  // lamp posts and barrels
  for (const x of [4, 14, 24]) s.lampPost(x, 11, 7, 0, -1);
  s.lampPost(44, 14, 7, -1, 0);
  s.lampPost(29, 38, 7, 0, -1);
  for (const [x, z] of [[1, 18], [1, 24], [44, 27], [34, 38], [34, 39], [12, 11], [13, 11]]) s.set(x, 1, z, B.barrel);
}

/**
 * High tier: a rusty orange spherical tank on eight legs. A spiral stair
 * tower climbs to the railed equator walkway, a door leads onto a grating
 * floor inside the sphere, and an inner spiral climbs through a hatch onto
 * the railed top platform.
 */
function buildGlobeTank(s: Site) {
  pad(s, B.concrete);
  const cx = 17, cz = 17, R = 9, cy = 18, W = cy - 1;
  const SH_OUT = (R + 0.5) * (R + 0.5), SH_IN = (R - 0.5) * (R - 0.5);
  // ground: hazard ring under the tank, central drain pipe
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
    const r2 = dx * dx + dz * dz;
    if (r2 >= 9 && r2 <= 16) s.set(cx + dx, 0, cz + dz, B.hazard_stripes);
  }
  s.box(cx, 1, cz, cx, 8, cz, B.rusted_metal);
  s.set(cx + 1, 1, cz, B.control_panel);
  // legs, a brace ring and X bracing (all above head height)
  const legs: Array<[number, number]> = [[10, 0], [7, 7], [0, 10], [-7, 7], [-10, 0], [-7, -7], [0, -10], [7, -7]];
  for (const [dx, dz] of legs) for (let y = 1; y < W; y++) s.set(cx + dx, y, cz + dz, s.rusty(cx + dx, y, cz + dz, B.tank_plate, 0.3));
  for (let i = 0; i < legs.length; i++) {
    const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % legs.length];
    s.line(cx + ax, 8, cz + az, cx + bx, 8, cz + bz, B.steel_beam);
    s.line(cx + ax, 9, cz + az, cx + bx, 15, cz + bz, B.steel_beam);
    s.line(cx + ax, 15, cz + az, cx + bx, 9, cz + bz, B.steel_beam);
  }
  // sphere shell (rust patches) with a hollow interior
  for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > SH_OUT) continue;
    const x = cx + dx, y = cy + dy, z = cz + dz;
    s.set(x, y, z, d2 >= SH_IN ? s.rusty(x, y, z, B.tank_plate, 0.22) : B.air);
  }
  // equator walkway (grating), steel rim and railing
  for (let dz = -13; dz <= 13; dz++) for (let dx = -13; dx <= 13; dx++) {
    const r2 = dx * dx + dz * dz;
    if (r2 <= SH_OUT - 1 || r2 > 156.25) continue;
    const rim = r2 > 132.25;
    s.set(cx + dx, W, cz + dz, rim ? B.steel_beam : B.metal_grate);
    if (rim) s.set(cx + dx, W + 1, cz + dz, B.chain_fence);
  }
  // interior: grating floor, lamps, loot, and a door on the +x side
  for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) if (dx * dx + dz * dz + 1 < SH_IN) s.set(cx + dx, W, cz + dz, B.metal_grate);
  s.set(cx, cy - R + 1, cz, B.lamp);
  s.box(cx + 8, W + 1, cz, cx + 9, W + 2, cz, B.air);
  s.box(cx + 9, W + 1, cz - 1, cx + 9, W + 3, cz - 1, B.hazard_stripes);
  s.box(cx + 9, W + 1, cz + 1, cx + 9, W + 3, cz + 1, B.hazard_stripes);
  s.set(cx + 9, W + 3, cz, B.hazard_stripes);
  s.set(cx + 10, W + 3, cz, B.lamp);
  s.set(cx + 5, W + 1, cz + 2, B.military_crate);
  s.set(cx - 4, W + 1, cz - 4, B.loot_crate);
  s.set(cx - 3, W + 1, cz + 5, B.loot_crate);
  s.box(cx + 6, W + 1, cz - 4, cx + 6, W + 1, cz - 3, B.control_panel);
  s.set(cx + 4, cy + 7, cz, B.lamp);
  // inner spiral around a pole up through a hatch onto the cap
  s.spiral(cx, cz, W + 1, R + 1, 4);
  // top platform: railing ring standing on the shell, loot and a beacon
  for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) {
    const r2 = dx * dx + dz * dz;
    if (r2 > 9 && r2 <= 18) s.box(cx + dx, cy + R, cz + dz, cx + dx, cy + R + 1, cz + dz, B.chain_fence);
  }
  s.set(cx + 2, cy + R + 1, cz, B.military_crate);
  s.set(cx, cy + R + 1, cz + 2, B.steel_beam);
  s.set(cx, cy + R + 2, cz + 2, B.lamp);
  // walkway loot on the far side from the door
  s.set(cx, W + 1, cz - 11, B.loot_crate);
  s.set(cx + 1, W + 1, cz + 11, B.barrel);
  // access stair tower on the -x side, bridging through the railing
  s.spiral(cx - 14, cz, 1, W, 0);
  s.set(cx - 12, W + 1, cz, B.air);
  s.set(cx - 14, W + 1, cz, B.lamp);

  // pump hut in the south-east corner fed by an elevated pipe
  s.hollow(27, 0, 27, 32, 4, 32, B.concrete);
  s.box(27, 1, 27, 32, 1, 32, B.bricks);
  s.box(28, 1, 28, 31, 3, 31, B.air);
  s.box(27, 1, 29, 27, 2, 29, B.air);
  s.set(31, 1, 31, B.loot_crate);
  s.set(31, 1, 28, B.barrel);
  s.set(28, 1, 31, B.control_panel);
  s.set(30, 3, 30, B.lamp);
  s.box(cx, 4, cz + 1, cx, 4, cz + 3, B.rusted_metal);
  s.box(cx, 4, cz + 3, 29, 4, cz + 3, B.rusted_metal);
  s.box(29, 4, cz + 3, 29, 4, 27, B.rusted_metal);
  for (const [x, z] of [[23, 20], [29, 20], [29, 24]]) s.box(x, 1, z, x, 3, z, B.steel_beam);

  // perimeter fence with gates, lamp posts, barrels
  for (let i = 0; i < s.w; i++) {
    const gate = i >= 15 && i <= 19;
    if (!gate) { s.fence(i, 0, i, 0); s.fence(i, s.d - 1, i, s.d - 1); s.fence(0, i, 0, i); s.fence(s.w - 1, i, s.w - 1, i); }
  }
  for (const [x, z, dx, dz] of [[2, 2, 1, 0], [31, 2, -1, 0], [2, 31, 1, 0]]) s.lampPost(x, z, 6, dx, dz);
  for (const [x, z] of [[cx + 3, cz - 2], [cx - 2, cz + 3], [6, 28], [7, 28], [26, 5]]) s.set(x, 1, z, B.barrel);
}

/**
 * High tier: a fenced military compound. A concrete blockhouse covers a
 * 3-wide stairwell down to a lit underground hall with an armory and a
 * generator room; a watchtower overlooks the yard.
 */
function buildBunker(s: Site) {
  pad(s, B.gravel);
  const FLOOR = -9;
  // surface: concrete apron, approach barriers, perimeter fence with a north gate
  s.box(9, 0, 0, 18, 0, 10, B.concrete);
  for (let i = 0; i < s.w; i++) if (i < 10 || i > 16) s.fence(i, 0, i, 0);
  for (let i = 1; i < s.d; i++) { s.fence(0, i, 0, i); s.fence(s.w - 1, i, s.w - 1, i); }
  for (let i = 0; i < s.w; i++) s.fence(i, s.d - 1, i, s.d - 1);
  for (const x of [10, 16]) s.box(x, 1, 0, x, 3, 0, B.hazard_stripes);
  s.box(6, 1, 4, 8, 1, 4, B.concrete);
  s.box(19, 1, 6, 21, 1, 6, B.concrete);

  // blockhouse with a hazard-framed doorway
  s.hollow(10, 0, 2, 17, 5, 9, B.concrete);
  s.box(10, 4, 2, 17, 4, 9, B.hazard_stripes);
  s.box(11, 1, 3, 16, 4, 8, B.air);
  s.box(12, 1, 2, 14, 3, 2, B.air);
  s.box(11, 1, 2, 11, 3, 2, B.hazard_stripes);
  s.box(15, 1, 2, 15, 3, 2, B.hazard_stripes);
  s.box(16, 1, 1, 17, 3, 1, B.rusted_metal);
  s.set(13, 4, 2, B.lamp);
  s.set(16, 4, 5, B.lamp);
  // stairwell: step k has its floor at -k, three cells of air above it
  for (let k = 0; k <= -FLOOR; k++) {
    const z = 3 + k, fy = -k;
    const inside = z <= 8;
    const top = inside ? 4 : fy + 3;
    s.box(11, fy - 1, z, 15, fy, z, B.concrete);
    s.box(12, fy + 1, z, 14, top, z, B.air);
    const wallTop = Math.min(top + 1, 0);
    if (wallTop >= fy + 1) {
      s.box(11, fy + 1, z, 11, wallTop, z, B.concrete);
      s.box(15, fy + 1, z, 15, wallTop, z, B.concrete);
    }
    if (!inside) s.box(11, fy + 4, z, 15, fy + 4, z, B.concrete);
    if (k > 0 && k % 3 === 0) s.set(11, fy + 3, z, B.lamp);
  }

  // underground hall (floor -9, ceiling -3) split into armory | hall | generator room
  s.hollow(1, FLOOR, 13, 26, -3, 24, B.concrete);
  s.box(12, FLOOR + 1, 13, 14, FLOOR + 3, 13, B.air);
  for (const x of [8, 19]) {
    s.box(x, FLOOR + 1, 14, x, -4, 23, B.concrete);
    s.box(x, FLOOR + 1, 18, x, FLOOR + 3, 19, B.air);
    s.box(x, FLOOR + 4, 17, x, FLOOR + 4, 20, B.hazard_stripes);
  }
  for (const [x, z] of [[11, 16], [16, 16], [11, 21], [16, 21], [4, 18], [23, 18]]) s.set(x, -4, z, B.lamp);
  s.box(9, FLOOR, 14, 18, FLOOR, 23, B.asphalt);
  s.box(12, FLOOR + 1, 20, 15, FLOOR + 1, 20, B.planks);
  s.set(18, FLOOR + 1, 23, B.military_crate);
  s.set(9, FLOOR + 1, 23, B.loot_crate);
  s.set(13, FLOOR + 1, 21, B.loot_crate);
  // armory
  s.box(2, FLOOR, 14, 7, FLOOR, 23, B.hazard_stripes);
  s.box(2, FLOOR + 1, 14, 2, FLOOR + 3, 16, B.steel_beam);
  s.box(2, FLOOR + 1, 21, 2, FLOOR + 3, 23, B.steel_beam);
  s.set(3, FLOOR + 1, 14, B.military_crate);
  s.set(3, FLOOR + 1, 23, B.military_crate);
  s.set(6, FLOOR + 1, 23, B.loot_crate);
  // generator room
  s.box(21, FLOOR + 1, 15, 23, FLOOR + 2, 16, B.rusted_metal);
  s.box(25, FLOOR + 1, 19, 25, FLOOR + 2, 21, B.control_panel);
  s.set(25, FLOOR + 1, 23, B.loot_crate);
  s.set(20, FLOOR + 1, 23, B.barrel);
  s.set(21, FLOOR + 1, 23, B.barrel);

  // watchtower: legs, plank platform with railing, roof; stair on the west side
  for (const [x, z] of [[22, 2], [25, 2], [22, 5], [25, 5]]) s.box(x, 1, z, x, 9, z, B.steel_beam);
  s.box(22, 6, 2, 25, 6, 5, B.planks);
  for (let i = 22; i <= 25; i++) { s.set(i, 7, 2, B.chain_fence); s.set(i, 7, 5, B.chain_fence); }
  s.set(22, 7, 3, B.chain_fence);
  s.box(25, 7, 3, 25, 7, 4, B.chain_fence);
  s.box(22, 10, 2, 25, 10, 5, B.rusted_metal);
  s.stair(21, 9, 0, -1, 1, 6, B.planks, null);
  s.box(21, 1, 7, 21, 2, 7, B.steel_beam);
  s.box(21, 1, 4, 21, 5, 4, B.steel_beam);
  s.set(24, 7, 3, B.loot_crate);
  s.set(23, 9, 4, B.lamp);

  // vents, radio mast, a wrecked truck and supply barrels
  for (const [x, z] of [[12, 22], [23, 21]]) { s.box(x, 1, z, x, 2, z, B.rusted_metal); s.set(x, 3, z, B.metal_grate); }
  s.box(18, 1, 3, 18, 13, 3, B.steel_beam);
  s.set(18, 14, 3, B.lamp);
  s.box(3, 1, 8, 6, 2, 10, B.container_teal);
  s.box(3, 1, 11, 6, 1, 11, B.rusted_metal);
  s.box(7, 1, 9, 7, 1, 10, B.glass);
  s.set(8, 1, 7, B.barrel);
  s.set(19, 1, 9, B.barrel);
  // helipad with a hazard "H", jersey barriers and tank traps
  s.box(3, 0, 14, 9, 0, 20, B.concrete);
  s.walls(3, 0, 14, 9, 0, 20, B.hazard_stripes);
  s.box(5, 0, 16, 5, 0, 18, B.hazard_stripes);
  s.box(7, 0, 16, 7, 0, 18, B.hazard_stripes);
  s.set(6, 0, 17, B.hazard_stripes);
  for (const [x, z] of [[2, 13], [10, 13], [2, 21], [10, 21]]) s.set(x, 1, z, B.lamp);
  for (const z of [12, 15, 18]) s.box(13, 1, z, 14, 1, z, B.concrete);
  for (const [x, z] of [[18, 14], [21, 17], [17, 20]]) {
    s.set(x, 1, z, B.steel_beam);
    s.set(x + 1, 1, z, B.steel_beam);
    s.set(x, 2, z, B.steel_beam);
  }
}

/**
 * Low tier: a roadside fuel stop. A crumbling road, a canopy over two pump
 * islands, a shop with a storefront, shelves and a back store room, roof
 * access at the back, a pylon sign and car wrecks.
 */
function buildGasStation(s: Site) {
  pad(s, B.concrete);
  const W = s.w;
  // road with a dashed centre line, crumbling at both ends
  for (let z = 0; z <= 6; z++) for (let x = 0; x < W; x++) {
    const edge = Math.min(x, W - 1 - x);
    const broken = edge < 4 && s.hash(x, 0, z, 3) < 0.6 - edge * 0.15;
    s.set(x, 0, z, broken ? B.gravel : z === 3 && x % 4 !== 0 ? B.road_marking : B.asphalt);
  }
  // canopy: posts, slab with a red fascia band, lights
  for (const [x, z] of [[7, 13], [16, 13], [7, 16], [16, 16]]) s.box(x, 1, z, x, 5, z, B.concrete);
  s.box(4, 6, 10, 19, 6, 19, B.concrete);
  s.walls(4, 5, 10, 19, 6, 19, B.container_red);
  for (const [x, z] of [[6, 12], [17, 12], [6, 17], [17, 17], [11, 14], [12, 15]]) s.set(x, 5, z, B.lamp);
  // pump islands
  for (const z of [13, 16]) {
    s.box(8, 0, z, 15, 0, z, B.hazard_stripes);
    s.box(10, 1, z, 10, 2, z, B.fuel_pump);
    s.box(13, 1, z, 13, 2, z, B.fuel_pump);
  }
  carWreck(s, 9, 14, B.container_blue);
  s.set(15, 1, 11, B.barrel);
  s.set(5, 1, 18, B.barrel);
  // underground tank fill caps
  for (const x of [5, 8, 11]) s.set(x, 0, 23, B.hazard_stripes);

  // shop: brick walls, storefront glass facing the pumps, flat roof
  s.hollow(22, 0, 10, 33, 5, 25, B.bricks);
  s.box(22, 5, 10, 33, 5, 25, B.concrete);
  s.box(23, 0, 11, 32, 0, 24, B.concrete);
  s.box(22, 1, 12, 22, 3, 16, B.glass);
  s.box(22, 1, 19, 22, 3, 23, B.glass);
  s.box(22, 1, 17, 22, 2, 18, B.air);
  s.box(22, 6, 12, 22, 7, 23, B.container_red);
  s.set(22, 8, 17, B.lamp);
  s.set(22, 8, 18, B.lamp);
  s.box(33, 2, 13, 33, 3, 15, B.glass);
  // counter with a register, shelves, loot
  s.box(25, 1, 11, 25, 1, 15, B.planks);
  s.set(25, 2, 13, B.control_panel);
  for (const z of [14, 17]) s.box(28, 1, z, 31, 2, z, B.planks);
  s.set(32, 1, 11, B.loot_crate);
  s.set(29, 1, 15, B.loot_crate);
  s.set(26, 4, 13, B.lamp);
  s.set(29, 4, 16, B.lamp);
  // back store room
  s.box(23, 1, 20, 32, 4, 20, B.bricks);
  s.box(31, 1, 20, 31, 2, 20, B.air);
  s.set(23, 1, 24, B.loot_crate);
  s.set(24, 1, 24, B.barrel);
  s.box(29, 1, 24, 32, 2, 24, B.planks);
  s.set(27, 4, 22, B.lamp);
  // roof: stair at the back, AC unit, vent and a stash
  s.stair(27, 26, 1, 0, 1, 5, B.metal_grate, null);
  s.box(31, 1, 26, 31, 4, 26, B.steel_beam);
  s.box(28, 1, 26, 28, 1, 26, B.steel_beam);
  s.box(25, 6, 14, 27, 7, 16, B.rusted_metal);
  s.box(30, 6, 21, 30, 7, 21, B.steel_beam);
  s.set(24, 6, 23, B.loot_crate);

  // pylon sign, dumpster, barrels, second wreck, lamp posts
  s.box(2, 1, 9, 2, 10, 9, B.steel_beam);
  s.box(1, 11, 9, 3, 13, 9, B.container_red);
  s.box(1, 12, 8, 3, 12, 8, B.lamp);
  s.box(23, 1, 27, 25, 2, 28, B.container_teal);
  s.set(26, 1, 28, B.barrel);
  s.set(33, 1, 27, B.barrel);
  carWreck(s, 4, 25, B.container_red);
  s.lampPost(20, 8, 7, 0, -1);
  s.lampPost(34, 8, 7, 0, -1);
  for (let x = 0; x < W; x++) if (x < 14 || x > 18) s.fence(x, s.d - 1, x, s.d - 1);
}

/**
 * Mid tier: an open-pit stone quarry. Four 2-high benches step down to the
 * pit floor, linked by 1-block ramps on alternating sides; ore shows in the
 * walls. An excavator works the bottom, and a walkable conveyor climbs out
 * of the pit to an elevated hopper shed. Office, fuel tank and stockpile on the rim.
 */
function buildQuarry(s: Site) {
  pad(s, B.gravel);
  const W = s.w, D = s.d;
  const PX0 = 4, PZ0 = 6, SIZE = 32, LEVELS = 4, MID = 15;
  // floor height map: bench i (1..4) is the ring of rect_i outside rect_{i+1}, floor at -2i
  const floor = new Int8Array(W * D);
  const levelAt = (x: number, z: number) => {
    let lv = 0;
    for (let i = 1; i <= LEVELS; i++) {
      const a = 3 * (i - 1);
      if (x >= PX0 + a && x <= PX0 + SIZE - 1 - a && z >= PZ0 + a && z <= PZ0 + SIZE - 1 - a) lv = i;
    }
    return lv;
  };
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) floor[z * W + x] = -2 * levelAt(x, z);
  // ramps: a 3-wide step at half height in the outer row of each lower bench
  for (let t = 0; t < LEVELS; t++) {
    const a = 3 * t, lo = PX0 + a, hiX = PX0 + SIZE - 1 - a, loZ = PZ0 + a, hiZ = PZ0 + SIZE - 1 - a;
    for (let k = -1; k <= 1; k++) {
      const [x, z] = t === 0 ? [lo, PZ0 + MID + k] : t === 1 ? [PX0 + MID + k, loZ] : t === 2 ? [hiX, PZ0 + MID + k] : [PX0 + MID + k, hiZ];
      floor[z * W + x] = -2 * t - 1;
    }
  }
  const f = (x: number, z: number) => (x < 0 || z < 0 || x >= W || z >= D ? 0 : floor[z * W + x]);
  for (let z = PZ0; z < PZ0 + SIZE; z++) for (let x = PX0; x < PX0 + SIZE; x++) {
    const fy = f(x, z);
    const face = f(x + 1, z) < fy || f(x - 1, z) < fy || f(x, z + 1) < fy || f(x, z - 1) < fy;
    for (let y = fy - 2; y <= fy; y++) {
      const r = s.hash(x, y, z, 11);
      const rock = face && y < fy + 1 ? (r < 0.1 ? B.metal_ore : r < 0.16 ? B.sulfur_ore : r < 0.5 ? B.cobblestone : B.stone) : B.stone;
      s.set(x, y, z, y === fy && !face ? (r < 0.7 ? B.gravel : B.stone) : rock);
    }
    s.box(x, fy + 1, z, x, 0, z, B.air);
  }
  // ore boulders on the benches
  for (const [x, z] of [[7, 30], [33, 9], [10, 11], [30, 34]]) {
    const fy = f(x, z);
    s.set(x, fy + 1, z, s.hash(x, 0, z, 12) < 0.5 ? B.metal_ore : B.sulfur_ore);
    s.set(x + 1, fy + 1, z, B.stone);
  }

  // rim fence (open at the west ramp and the conveyor), lamp posts
  for (let i = PX0 - 1; i <= PX0 + SIZE; i++) {
    s.fence(i, PZ0 - 1, i, PZ0 - 1);
    s.fence(i, PZ0 + SIZE, i, PZ0 + SIZE);
  }
  for (let i = PZ0; i < PZ0 + SIZE; i++) {
    if (Math.abs(i - (PZ0 + MID)) > 2) s.fence(PX0 - 1, i, PX0 - 1, i);
    s.fence(PX0 + SIZE, i, PX0 + SIZE, i);
  }
  for (const [x, z, dx, dz] of [[1, 1, 1, 0], [42, 1, -1, 0], [1, 42, 1, 0], [42, 42, -1, 0]]) s.lampPost(x, z, 6, dx, dz);

  // pit floor: blasting shed, excavator, loot
  const BOT = -2 * LEVELS;
  s.hollow(13, BOT, 15, 17, BOT + 4, 18, B.rusted_metal);
  s.box(17, BOT + 1, 16, 17, BOT + 2, 16, B.air);
  s.set(14, BOT + 1, 17, B.loot_crate);
  s.set(14, BOT + 1, 16, B.barrel);
  s.set(15, BOT + 3, 16, B.lamp);
  s.set(18, BOT + 1, 18, B.barrel);
  s.box(19, BOT + 1, 23, 23, BOT + 1, 23, B.steel_beam);
  s.box(19, BOT + 1, 27, 23, BOT + 1, 27, B.steel_beam);
  s.box(20, BOT + 2, 23, 23, BOT + 3, 27, B.hazard_stripes);
  s.box(20, BOT + 4, 25, 21, BOT + 5, 26, B.glass);
  s.box(20, BOT + 6, 25, 21, BOT + 6, 26, B.hazard_stripes);
  s.line(23, BOT + 3, 25, 27, BOT + 7, 25, B.hazard_stripes);
  s.line(27, BOT + 7, 25, 28, BOT + 4, 25, B.hazard_stripes);
  s.box(28, BOT + 3, 24, 29, BOT + 3, 26, B.rusted_metal);
  s.set(18, BOT + 1, 26, B.loot_crate);

  // conveyor: a walkable belt rising one block per cell out of the pit at z=CZ
  const CZ = 27, C0 = 26, CN = 16;
  for (let k = 0; k < CN; k++) {
    const x = C0 + k, y = BOT + 1 + k;
    s.set(x, y, CZ, B.asphalt);
    s.box(x, y + 1, CZ, x, y + 3, CZ, B.air);
    s.set(x, y - 1, CZ - 1, B.steel_beam);
    s.set(x, y - 1, CZ + 1, B.steel_beam);
    if (k % 3 === 2) s.box(x, f(x, CZ) + 1, CZ, x, y - 1, CZ, B.steel_beam);
  }
  // hopper tower: legs, deck with railing, shed on top
  const TX = C0 + CN, TY = BOT + CN;
  for (const [x, z] of [[TX, 22], [TX + 1, 22], [TX, 32], [TX + 1, 32]]) s.box(x, 1, z, x, TY - 1, z, B.steel_beam);
  s.box(TX, TY, 22, TX + 1, TY, 32, B.metal_grate);
  s.box(TX, 4, 26, TX + 1, TY - 1, 28, B.rusted_metal);
  for (let z = 22; z <= 32; z++) s.set(TX - 1, TY, z, z === CZ ? B.asphalt : B.metal_grate);
  for (let z = 22; z <= 32; z++) if (z !== CZ) s.set(TX - 1, TY + 1, z, B.chain_fence);
  s.box(TX - 1, TY + 1, 32, TX + 1, TY + 1, 32, B.chain_fence);
  s.hollow(TX - 1, TY, 22, TX + 1, TY + 4, 25, B.rusted_metal);
  s.box(TX, TY + 1, 25, TX, TY + 2, 25, B.air);
  s.set(TX, TY + 1, 23, B.military_crate);
  s.set(TX, TY + 3, 24, B.lamp);
  s.set(TX + 1, TY + 5, 23, B.lamp);
  // stockpile of gravel below the tower
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 3; dx++) {
    const h = 4 - Math.max(Math.abs(dx), Math.abs(dz));
    if (h > 0) s.box(38 + dx, 1, 40 + dz, 38 + dx, h, 40 + dz, B.gravel);
  }

  // site office on the north rim, door to the west
  s.hollow(8, 0, 0, 16, 4, 4, B.container_teal);
  s.box(9, 2, 4, 15, 2, 4, B.glass);
  s.box(8, 1, 2, 8, 2, 2, B.air);
  s.box(10, 1, 1, 11, 1, 1, B.control_panel);
  s.set(15, 1, 1, B.loot_crate);
  s.set(14, 1, 3, B.loot_crate);
  s.set(12, 3, 2, B.lamp);
  // fuel tank and barrels on the west rim
  s.box(1, 3, 8, 2, 4, 13, B.rusted_metal);
  for (const z of [8, 13]) for (const x of [1, 2]) s.box(x, 1, z, x, 2, z, B.steel_beam);
  s.set(1, 1, 15, B.barrel);
  s.set(2, 1, 15, B.barrel);
  s.set(40, 1, 3, B.barrel);
}

/**
 * High tier: a coal power station. Turbine hall (mezzanine control room,
 * overhead crane, roof stair), a tall boiler house with a spiral stair to its
 * roof, twin banded smokestacks, a hyperboloid cooling tower standing on
 * pillars around a shallow pond, and a fenced transformer yard with a pylon.
 */
function buildPowerStation(s: Site) {
  pad(s, B.concrete);
  const W = s.w, D = s.d;
  // perimeter fence with a south gate (road) and a west gate
  for (let i = 0; i < W; i++) {
    if (i < 12 || i > 19) s.fence(i, D - 1, i, D - 1);
    s.fence(i, 0, i, 0);
  }
  for (let i = 1; i < D - 1; i++) {
    if (i < 36 || i > 39) s.fence(0, i, 0, i);
    s.fence(W - 1, i, W - 1, i);
  }
  s.box(13, 0, 36, 18, 0, D - 1, B.asphalt);
  for (let z = 36; z < D; z += 2) s.set(15, 0, z, B.road_marking);

  // --- cooling tower: hyperboloid concrete shell on pillars, pond inside
  const tcx = 12, tcz = 10, TH = 26;
  for (let y = 1; y <= TH; y++) {
    const t = (y - 17) / 15;
    const r = 5.5 * Math.sqrt(1 + t * t);
    for (let dz = -10; dz <= 10; dz++) for (let dx = -10; dx <= 10; dx++) {
      const d = Math.hypot(dx, dz);
      if (d < r - 0.95 || d > r + 0.45) continue;
      if (y <= 3 && Math.floor(((Math.atan2(dz, dx) + Math.PI) / (2 * Math.PI)) * 24) % 2 === 1) continue;
      s.set(tcx + dx, y, tcz + dz, y === TH ? B.steel_beam : s.hash(tcx + dx, y >> 2, tcz + dz, 21) < 0.12 ? B.cobblestone : B.concrete);
    }
  }
  for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) {
    const d = Math.hypot(dx, dz);
    if (d >= 6.6) continue;
    s.set(tcx + dx, -1, tcz + dz, B.concrete);
    s.set(tcx + dx, 0, tcz + dz, d < 2.5 ? B.concrete : B.water);
  }
  s.set(tcx, 1, tcz, B.military_crate);
  s.set(tcx + 1, 1, tcz, B.barrel);

  // --- transformer yard with a pylon
  for (let x = 24; x <= 41; x++) { s.fence(x, 1, x, 1); if (x < 31 || x > 33) s.fence(x, 16, x, 16); }
  for (let z = 2; z <= 15; z++) { s.fence(24, z, 24, z); s.fence(41, z, 41, z); }
  for (const x of [27, 32, 37]) {
    s.box(x, 1, 4, x + 2, 3, 6, B.rusted_metal);
    s.box(x, 1, 4, x + 2, 1, 6, B.hazard_stripes);
    for (let k = 0; k < 3; k++) s.box(x + k, 4, 5, x + k, 5, 5, B.glass);
  }
  for (const [x, z] of [[27, 10], [29, 10], [27, 12], [29, 12]]) s.box(x, 1, z, x, 17, z, B.steel_beam);
  for (const y of [6, 11]) { s.box(27, y, 10, 29, y, 10, B.steel_beam); s.box(27, y, 12, 29, y, 12, B.steel_beam); }
  s.box(25, 15, 11, 31, 15, 11, B.steel_beam);
  s.box(28, 18, 11, 28, 19, 11, B.steel_beam);
  for (const x of [25, 31]) s.box(x, 13, 11, x, 14, 11, B.glass);
  s.set(39, 1, 14, B.loot_crate);
  s.set(25, 1, 14, B.barrel);
  s.set(26, 1, 14, B.barrel);

  // --- turbine hall
  s.hollow(3, 0, 20, 30, 13, 35, B.bricks);
  s.box(3, 8, 20, 30, 9, 35, B.glass);
  s.box(3, 10, 20, 30, 12, 35, B.concrete);
  s.box(3, 13, 20, 30, 13, 35, B.concrete);
  s.box(4, 1, 21, 29, 12, 34, B.air);
  s.box(4, 0, 21, 29, 0, 34, B.concrete);
  for (let x = 4; x <= 22; x++) { s.set(x, 0, 23, B.hazard_stripes); s.set(x, 0, 32, B.hazard_stripes); }
  for (let x = 3; x <= 30; x += 5) for (const z of [20, 35]) s.box(x, 1, z, x, 12, z, B.steel_beam);
  s.box(14, 1, 35, 17, 5, 35, B.air);
  s.box(13, 1, 35, 13, 6, 35, B.hazard_stripes);
  s.box(18, 1, 35, 18, 6, 35, B.hazard_stripes);
  s.box(14, 6, 35, 17, 6, 35, B.hazard_stripes);
  s.box(10, 1, 20, 10, 2, 20, B.air);
  // turbine-generator sets
  for (const x0 of [6, 15]) {
    s.box(x0, 1, 25, x0 + 6, 1, 30, B.steel_beam);
    s.box(x0, 2, 26, x0 + 4, 3, 29, B.container_teal);
    s.box(x0 + 5, 2, 25, x0 + 6, 4, 30, B.tank_plate);
    s.box(x0 + 2, 4, 27, x0 + 2, 12, 27, B.rusted_metal);
  }
  // overhead crane
  s.box(4, 10, 21, 29, 10, 21, B.steel_beam);
  s.box(4, 10, 34, 29, 10, 34, B.steel_beam);
  s.box(13, 11, 21, 13, 11, 34, B.hazard_stripes);
  s.box(13, 7, 27, 13, 10, 27, B.chain_fence);
  s.set(13, 6, 27, B.rusted_metal);
  for (const [x, z] of [[8, 23], [19, 23], [8, 32], [19, 32]]) s.set(x, 12, z, B.lamp);
  s.set(4, 1, 21, B.loot_crate);
  s.set(21, 1, 33, B.loot_crate);
  s.set(5, 1, 34, B.barrel);
  // mezzanine with a control room, reached by a stair along x=23
  s.box(24, 5, 21, 29, 5, 34, B.metal_grate);
  for (const z of [21, 25, 30, 34]) s.box(24, 1, z, 24, 4, z, B.steel_beam);
  for (let z = 21; z <= 34; z++) if (z !== 29) s.set(24, 6, z, B.chain_fence);
  s.stair(23, 33, 0, -1, 1, 5, B.metal_grate, null);
  s.box(23, 1, 29, 23, 4, 29, B.steel_beam);
  s.hollow(26, 5, 22, 29, 9, 28, B.concrete);
  s.box(26, 7, 23, 26, 8, 24, B.glass);
  s.box(26, 7, 26, 26, 8, 27, B.glass);
  s.box(26, 6, 25, 26, 7, 25, B.air);
  s.box(28, 6, 23, 28, 6, 27, B.control_panel);
  s.set(27, 6, 23, B.military_crate);
  s.set(27, 6, 27, B.military_crate);
  s.set(27, 8, 25, B.lamp);
  s.set(28, 6, 32, B.loot_crate);
  s.set(28, 1, 33, B.loot_crate);
  s.set(29, 1, 22, B.barrel);
  // stair up the north wall to the hall roof
  s.stair(16, 19, 1, 0, 1, 13, B.metal_grate, null);
  for (const x of [19, 23, 27]) s.box(x, 1, 19, x, x - 16, 19, B.steel_beam);
  for (const [x, z] of [[8, 25], [20, 30]]) { s.box(x, 14, z, x + 1, 15, z + 1, B.rusted_metal); s.set(x, 16, z, B.metal_grate); }
  s.set(6, 14, 22, B.loot_crate);

  // --- boiler house (shares a doorway with the hall)
  s.hollow(31, 0, 20, 40, 21, 35, B.concrete);
  s.box(31, 1, 20, 40, 10, 35, B.bricks);
  s.box(32, 1, 21, 39, 20, 34, B.air);
  for (let z = 22; z <= 33; z += 3) { s.box(31, 13, z, 31, 16, z, B.glass); s.box(40, 13, z, 40, 16, z, B.glass); }
  s.box(30, 1, 27, 31, 3, 28, B.air);
  s.box(35, 1, 35, 35, 2, 35, B.air);
  for (let y = 1; y <= 12; y++) for (let z = 24; z <= 31; z++) for (let x = 33; x <= 37; x++) s.set(x, y, z, s.rusty(x, y, z, B.tank_plate, 0.3));
  for (const z of [24, 31]) s.box(38, 14, z, 39, 15, z, B.rusted_metal);
  s.box(35, 13, 27, 35, 14, 28, B.rusted_metal);
  for (const [x, z] of [[33, 22], [38, 22], [33, 33], [38, 33]]) s.set(x, 20, z, B.lamp);
  s.set(39, 1, 34, B.loot_crate);
  s.set(32, 1, 21, B.barrel);
  s.set(32, 1, 22, B.barrel);
  // roof: spiral stair on the north side, parapet, loot
  s.spiral(35, 18, 1, 21, 2);
  for (let x = 31; x <= 40; x++) { if (x !== 35) s.set(x, 22, 20, B.chain_fence); s.set(x, 22, 35, B.chain_fence); }
  for (let z = 21; z <= 34; z++) { s.set(31, 22, z, B.chain_fence); s.set(40, 22, z, B.chain_fence); }
  s.set(38, 22, 30, B.military_crate);
  s.set(33, 22, 33, B.loot_crate);
  s.set(36, 22, 26, B.steel_beam);
  s.set(36, 23, 26, B.lamp);

  // --- smokestacks with ducts from the boiler house
  for (const zc of [24, 32]) {
    smokestack(s, 44, zc, 2, 1, 40);
    s.box(40, 14, zc - 1, 41, 16, zc + 1, B.rusted_metal);
  }

  // --- yard: containers by the road, lamp posts, barrels
  container(s, 22, 0, 39, 7, true, B.container_orange, -1);
  s.set(27, 1, 40, B.loot_crate);
  container(s, 22, 0, 43, 7, true, B.container_teal, 0);
  s.set(33, 1, 41, B.barrel);
  s.set(34, 1, 41, B.barrel);
  for (const [x, z, dx, dz] of [[11, 38, 1, 0], [20, 44, -1, 0], [45, 18, -1, 0], [2, 19, 1, 0]]) s.lampPost(x, z, 7, dx, dz);
}
