import { CHUNK_SIZE, CHUNK_VOLUME, SEA_LEVEL, WORLD_HEIGHT } from '../constants';
import { clamp, hash4, hashFloat, lerp, mulberry32, smoothstep } from '../math';
import { B } from './blocks';
import { Biome, BIOMES } from './biomes';
import { cidx } from './chunk';
import { SimplexNoise } from './noise';
import { PoiIndex } from './poi';

export interface ColumnSample {
  /** Surface height: y of the top terrain block. */
  height: number;
  biome: Biome;
  /** Climate noise, roughly [-1, 1]. */
  temp: number;
  humid: number;
  /** 0..1 how much the column is part of a river channel. */
  river: number;
  /** 0..1 mountain influence. */
  mountain: number;
  /** POI footprint covers this column (no trees/plants/caves). */
  poi: boolean;
}

const PAD = 4; // columns sampled around a chunk for trees, slopes
const SPAN = CHUNK_SIZE + PAD * 2;

/**
 * Deterministic procedural terrain generator. Pure function of (seed, cx, cz):
 * the server generates chunks in worker threads and the same code is used in
 * tests. Layered approach (inspired by multi-noise generators):
 *   continentalness -> land/ocean, erosion + ridged peaks -> mountains,
 *   river channel noise, temperature/humidity -> biome, 3D noise -> caves,
 *   seeded vein placement -> ores, jittered grid -> trees, POI stamps.
 */
export class WorldGenerator {
  private cont: SimplexNoise;
  private eros: SimplexNoise;
  private peaks: SimplexNoise;
  private detail: SimplexNoise;
  private riverN: SimplexNoise;
  private tempN: SimplexNoise;
  private humidN: SimplexNoise;
  private cave1: SimplexNoise;
  private cave2: SimplexNoise;
  private cave3: SimplexNoise;
  readonly pois: PoiIndex;

  constructor(readonly seed: number) {
    const s = (n: number) => new SimplexNoise(hash4(seed, n, 0x5eed));
    this.cont = s(1);
    this.eros = s(2);
    this.peaks = s(3);
    this.detail = s(4);
    this.riverN = s(5);
    this.tempN = s(6);
    this.humidN = s(7);
    this.cave1 = s(8);
    this.cave2 = s(9);
    this.cave3 = s(10);
    this.pois = new PoiIndex(this);
  }

  /** Terrain shape without POI flattening. */
  rawColumn(x: number, z: number): ColumnSample {
    const c = this.cont.fbm2(x / 1100, z / 1100, 4) * 1.15 + 0.18;
    const e = this.eros.fbm2(x / 650 + 31.7, z / 650 - 12.1, 3);
    const pk = 1 - Math.abs(this.peaks.fbm2(x / 260, z / 260, 4));
    const d = this.detail.fbm2(x / 48, z / 48, 3);
    const hills = this.detail.fbm2(x / 170 + 400, z / 170 - 400, 3);

    let h: number;
    if (c < -0.25) {
      h = SEA_LEVEL - 6 - (-0.25 - c) * 45 + d * 2;
    } else if (c < -0.08) {
      const t = (c + 0.25) / 0.17;
      h = lerp(SEA_LEVEL - 6, SEA_LEVEL + 1.5, t) + d * 1.5;
    } else {
      h = SEA_LEVEL + 1.5 + (c + 0.08) * 14 + d * 3;
    }
    const mountain = smoothstep(0.05, 0.55, -e) * smoothstep(-0.05, 0.25, c);
    h += (1 - mountain) * Math.max(0, hills) * 10 * smoothstep(-0.1, 0.1, c);
    h += mountain * (pk * pk * 58 + d * 4);

    const temp = this.tempN.fbm2(x / 1300 - 77, z / 1300 + 19, 3) * 1.2 + this.detail.noise2(x / 37, z / 37) * 0.035;
    const humid = this.humidN.fbm2(x / 1000 + 51, z / 1000 + 93, 3) * 1.2 + this.detail.noise2(x / 41 + 9, z / 41) * 0.035;

    // Swamps: flatten humid lowlands.
    const swampy = smoothstep(0.3, 0.5, humid) * (1 - mountain) * smoothstep(-0.05, 0.08, c) * smoothstep(0.0, 0.3, temp + 0.3);
    h = lerp(h, SEA_LEVEL + 0.6 + d * 1.6, swampy * 0.85);

    // Rivers: narrow channels following the zero-set of a noise field.
    const r = Math.abs(this.riverN.fbm2(x / 520 + 7, z / 520 - 3, 3));
    let river = (1 - smoothstep(0.012, 0.045, r)) * smoothstep(-0.12, 0.0, c) * (1 - smoothstep(0.35, 0.7, mountain));
    if (river > 0) h = lerp(h, SEA_LEVEL - 3, river);

    const height = clamp(Math.floor(h), 6, WORLD_HEIGHT - 8);
    const tAdj = temp - Math.max(0, height - SEA_LEVEL - 20) * 0.012;

    let biome: Biome;
    if (river > 0.55 && height < SEA_LEVEL) biome = Biome.River;
    else if (height < SEA_LEVEL - 1) biome = Biome.Ocean;
    else if (height <= SEA_LEVEL + 1 && c < 0.02 && swampy < 0.4) biome = tAdj < -0.45 ? Biome.StoneBeach : Biome.Beach;
    else if (mountain > 0.5 && height > SEA_LEVEL + 28) biome = Biome.Mountains;
    else if (tAdj < -0.42) biome = Biome.Snowy;
    else if (tAdj < -0.18) biome = Biome.Taiga;
    else if (swampy > 0.45) biome = Biome.Swamp;
    else if (tAdj > 0.38 && humid < 0.05) biome = Biome.Desert;
    else if (tAdj > 0.3) biome = Biome.Savanna;
    else if (humid > 0.22 && tAdj < 0.08) biome = Biome.BirchForest;
    else if (humid > 0.02) biome = Biome.Forest;
    else biome = Biome.Plains;
    if (river > 0.3 && height >= SEA_LEVEL - 1 && biome !== Biome.Snowy) biome = height <= SEA_LEVEL + 1 ? Biome.River : biome;

    return { height, biome, temp: tAdj, humid, river, mountain, poi: false };
  }

  /** Final column including POI flattening. */
  column(x: number, z: number): ColumnSample {
    const raw = this.rawColumn(x, z);
    const f = this.pois.flatten(x, z);
    if (f) {
      raw.height = Math.round(lerp(raw.height, f.y, f.weight));
      if (f.weight >= 1) raw.poi = true;
    }
    return raw;
  }

  /** Approximate air temperature in °C at a position (before time-of-day / weather). */
  climateTempC(x: number, y: number, z: number): number {
    const col = this.rawColumn(Math.floor(x), Math.floor(z));
    const base = 14 + col.temp * 22 + BIOMES[col.biome].tempOffset * 0.5;
    const altitude = Math.max(0, y - SEA_LEVEL) * 0.12;
    return base - altitude;
  }

  generateChunk(cx: number, cz: number): Uint8Array {
    const data = new Uint8Array(CHUNK_VOLUME);
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;

    // 1. Sample padded column grid.
    const cols: ColumnSample[] = new Array(SPAN * SPAN);
    for (let dz = 0; dz < SPAN; dz++) {
      for (let dx = 0; dx < SPAN; dx++) {
        cols[dz * SPAN + dx] = this.column(x0 + dx - PAD, z0 + dz - PAD);
      }
    }
    const colAt = (lx: number, lz: number) => cols[(lz + PAD) * SPAN + (lx + PAD)];

    // 2. Cave density on a coarse grid (step 4), trilinearly interpolated.
    const CS = 4;
    const NX = CHUNK_SIZE / CS + 1;
    const NY = WORLD_HEIGHT / CS + 1;
    const cheese = new Float32Array(NX * NY * NX);
    const spag = new Float32Array(NX * NY * NX);
    for (let iz = 0; iz < NX; iz++) {
      for (let iy = 0; iy < NY; iy++) {
        for (let ix = 0; ix < NX; ix++) {
          const wx = x0 + ix * CS, wy = iy * CS, wz = z0 + iz * CS;
          const i = (iz * NY + iy) * NX + ix;
          cheese[i] = this.cave1.noise3(wx / 56, wy / 34, wz / 56);
          const a = this.cave2.noise3(wx / 42, wy / 26, wz / 42);
          const b = this.cave3.noise3(wx / 42, wy / 26, wz / 42);
          spag[i] = a * a + b * b;
        }
      }
    }
    const sampleGrid = (g: Float32Array, lx: number, y: number, lz: number) => {
      const fx = lx / CS, fy = y / CS, fz = lz / CS;
      const ix = Math.min(NX - 2, Math.floor(fx)), iy = Math.min(NY - 2, Math.floor(fy)), iz = Math.min(NX - 2, Math.floor(fz));
      const tx = fx - ix, ty = fy - iy, tz = fz - iz;
      const at = (a: number, b: number, c: number) => g[((iz + c) * NY + (iy + b)) * NX + (ix + a)];
      const c00 = lerp(at(0, 0, 0), at(1, 0, 0), tx);
      const c10 = lerp(at(0, 1, 0), at(1, 1, 0), tx);
      const c01 = lerp(at(0, 0, 1), at(1, 0, 1), tx);
      const c11 = lerp(at(0, 1, 1), at(1, 1, 1), tx);
      return lerp(lerp(c00, c10, ty), lerp(c01, c11, ty), tz);
    };

    // 3. Fill columns.
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const col = colAt(lx, lz);
        const h = col.height;
        const info = BIOMES[col.biome];
        // slope -> exposed rock on cliffs
        let slope = 0;
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          slope = Math.max(slope, Math.abs(colAt(lx + ox, lz + oz).height - h));
        }
        const wx = x0 + lx, wz = z0 + lz;
        const underwater = h < SEA_LEVEL;
        let top = underwater ? info.floor : info.top;
        let filler = info.filler;
        if (!underwater && slope >= 3 && col.biome !== Biome.Desert) {
          top = B.stone;
          filler = B.stone;
        }
        if (!underwater && h > SEA_LEVEL + 44 && col.biome !== Biome.Desert) top = slope >= 4 ? B.stone : B.snow;
        if (col.biome === Biome.Mountains && !underwater && slope < 2 && h < SEA_LEVEL + 40) top = B.grass, (filler = B.dirt);
        if (underwater && hashFloat(wx, wz, this.seed, 3) < 0.15) top = B.gravel;
        if (col.poi) {
          top = B.gravel;
          filler = B.stone;
        }
        const fillerDepth = 3 + (hash4(wx, wz, this.seed) & 1);
        const allowCaves = !col.poi;
        const caveFloor = underwater || col.river > 0.2 ? h - 7 : h + 1;

        for (let y = 0; y <= h; y++) {
          let id: number;
          if (y === 0) id = B.bedrock;
          else if (y < 3 && hashFloat(wx, y, wz, this.seed) < 0.5) id = B.bedrock;
          else if (y === h) id = top;
          else if (y > h - fillerDepth) id = filler;
          else if (col.biome === Biome.Desert && y > h - fillerDepth - 5) id = B.sandstone;
          else id = B.stone;

          if (allowCaves && y > 3 && y < caveFloor) {
            const depthBelow = h - y;
            const ch = sampleGrid(cheese, lx, y, lz);
            const sp = sampleGrid(spag, lx, y, lz);
            const cheeseThreshold = 0.6 + (depthBelow < 8 ? 0.4 : 0) + (y < 12 ? 0.1 : 0);
            const spagThreshold = depthBelow < 3 ? 0.006 : 0.011;
            if (ch > cheeseThreshold || sp < spagThreshold) id = B.air;
          }
          data[cidx(lx, y, lz)] = id;
        }
        // Water / ice
        for (let y = h + 1; y <= SEA_LEVEL; y++) {
          if (data[cidx(lx, y, lz)] === B.air) {
            data[cidx(lx, y, lz)] = y === SEA_LEVEL && col.temp < -0.5 ? B.ice : B.water;
          }
        }
      }
    }

    // 4. Ores (seeded veins, deterministic per chunk).
    this.placeOres(data, cx, cz, colAt);
    // 5. Surface boulders (gatherable nodes visible from the surface).
    this.placeBoulders(data, cx, cz, colAt);
    // 6. Trees (candidates from padded area so canopies cross chunk borders seamlessly).
    this.placeTrees(data, cx, cz);
    // 7. Ground plants.
    this.placePlants(data, cx, cz, colAt);
    // 8. Points of interest.
    this.pois.stampChunk(data, cx, cz);
    return data;
  }

  private placeOres(data: Uint8Array, cx: number, cz: number, colAt: (x: number, z: number) => ColumnSample) {
    const rnd = mulberry32(hash4(this.seed, cx, cz, 0x07e5));
    const center = colAt(8, 8);
    const mountainBoost = center.biome === Biome.Mountains ? 1.6 : 1;
    const sulfurBoost = center.biome === Biome.Desert || center.biome === Biome.Mountains || center.biome === Biome.Snowy ? 1.8 : center.biome === Biome.Swamp ? 0.5 : 1;
    const veins: Array<{ id: number; count: number; size: number; yMin: number; yMax: number }> = [
      { id: B.metal_ore, count: Math.round(9 * mountainBoost), size: 7, yMin: 5, yMax: 72 },
      { id: B.sulfur_ore, count: Math.round(6 * sulfurBoost), size: 7, yMin: 5, yMax: 64 },
      { id: B.rich_ore, count: 2, size: 3, yMin: 4, yMax: 30 },
      { id: B.gravel, count: 4, size: 12, yMin: 5, yMax: 70 },
      { id: B.dirt, count: 3, size: 12, yMin: 20, yMax: 80 },
    ];
    for (const v of veins) {
      for (let n = 0; n < v.count; n++) {
        let x = Math.floor(rnd() * CHUNK_SIZE);
        let z = Math.floor(rnd() * CHUNK_SIZE);
        // triangular distribution between yMin and yMax
        let y = Math.floor(v.yMin + (rnd() + rnd()) * 0.5 * (v.yMax - v.yMin));
        const size = 2 + Math.floor(rnd() * v.size);
        for (let s = 0; s < size; s++) {
          if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && y > 0 && y < WORLD_HEIGHT) {
            const i = cidx(x, y, z);
            if (data[i] === B.stone) data[i] = v.id;
          }
          const dir = Math.floor(rnd() * 6);
          if (dir === 0) x++; else if (dir === 1) x--; else if (dir === 2) z++; else if (dir === 3) z--; else if (dir === 4) y++; else y--;
        }
      }
    }
  }

  private placeBoulders(data: Uint8Array, cx: number, cz: number, colAt: (x: number, z: number) => ColumnSample) {
    const rnd = mulberry32(hash4(this.seed, cx, cz, 0xb01d));
    const col = colAt(8, 8);
    if (col.poi) return;
    const rocky = col.biome === Biome.Mountains || col.biome === Biome.Desert || col.biome === Biome.Snowy || col.biome === Biome.StoneBeach || col.biome === Biome.Taiga;
    const chance = rocky ? 0.9 : col.biome === Biome.Ocean || col.biome === Biome.River ? 0 : 0.35;
    let attempts = chance > 0.5 ? 2 : 1;
    while (attempts-- > 0) {
      if (rnd() > chance) continue;
      const lx = 2 + Math.floor(rnd() * 12);
      const lz = 2 + Math.floor(rnd() * 12);
      const h = colAt(lx, lz).height;
      if (h < SEA_LEVEL) continue;
      const roll = rnd();
      let ore: number = roll < 0.4 ? B.stone : roll < 0.75 ? B.metal_ore : B.sulfur_ore;
      if ((col.biome === Biome.Desert || col.biome === Biome.Mountains) && roll > 0.6) ore = B.sulfur_ore;
      for (let dy = 0; dy < 2; dy++) {
        for (let dz = 0; dz < 2; dz++) {
          for (let dx = 0; dx < 2; dx++) {
            if (dy === 1 && rnd() < 0.35) continue;
            const x = lx + dx, z = lz + dz, y = colAt(x, z).height + 1 + dy;
            if (y >= WORLD_HEIGHT) continue;
            data[cidx(x, y, z)] = rnd() < 0.7 ? ore : B.stone;
          }
        }
      }
    }
  }

  private placeTrees(data: Uint8Array, cx: number, cz: number) {
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const CELL = 4;
    const gx0 = Math.floor((x0 - 4) / CELL), gx1 = Math.floor((x0 + CHUNK_SIZE + 4) / CELL);
    const gz0 = Math.floor((z0 - 4) / CELL), gz1 = Math.floor((z0 + CHUNK_SIZE + 4) / CELL);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const hsh = hash4(gx, gz, this.seed, 0x7ee);
        const tx = gx * CELL + (hsh & 3);
        const tz = gz * CELL + ((hsh >>> 2) & 3);
        const col = this.column(tx, tz);
        if (col.poi || col.height < SEA_LEVEL || col.river > 0.2) continue;
        const info = BIOMES[col.biome];
        let density = info.treeDensity;
        // forests thin out near their edges and in clearings
        density *= 0.6 + 0.4 * smoothstep(-0.3, 0.3, this.detail.noise2(tx / 90, tz / 90));
        if (((hsh >>> 8) & 0xffff) / 65536 >= density) continue;
        const r = mulberry32(hsh);
        // Validity must depend only on column samples (never on chunk data) so
        // that every chunk a canopy overlaps makes the same decision.
        if (!this.soilSurface(tx, tz, col)) continue;
        const ground = col.height;
        switch (col.biome) {
          case Biome.Taiga:
          case Biome.Snowy:
          case Biome.Mountains:
            this.tree(data, x0, z0, tx, ground, tz, 'pine', r);
            break;
          case Biome.BirchForest:
            this.tree(data, x0, z0, tx, ground, tz, r() < 0.85 ? 'birch' : 'oak', r);
            break;
          case Biome.Forest:
            this.tree(data, x0, z0, tx, ground, tz, r() < 0.25 ? 'birch' : 'oak', r);
            break;
          default:
            this.tree(data, x0, z0, tx, ground, tz, 'oak', r);
        }
      }
    }
  }

  private tree(data: Uint8Array, x0: number, z0: number, tx: number, ground: number, tz: number, kind: 'oak' | 'birch' | 'pine', r: () => number) {
    const put = (x: number, y: number, z: number, id: number, overwrite: boolean) => {
      const lx = x - x0, lz = z - z0;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y <= 0 || y >= WORLD_HEIGHT) return;
      const i = cidx(lx, y, lz);
      const cur = data[i];
      if (overwrite || cur === B.air || cur === B.tall_grass) data[i] = id;
    };
    const lx = tx - x0, lz = tz - z0;
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
      const below = data[cidx(lx, ground, lz)];
      if (below === B.grass || below === B.snowy_grass || below === B.swamp_grass || below === B.dry_grass) data[cidx(lx, ground, lz)] = B.dirt;
    }
    if (kind === 'pine') {
      const H = 6 + Math.floor(r() * 4);
      for (let y = 1; y <= H; y++) put(tx, ground + y, tz, B.pine_log, true);
      let radius = 0;
      for (let y = H + 1; y >= 3; y--) {
        for (let dz = -radius; dz <= radius; dz++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (Math.abs(dx) + Math.abs(dz) > radius + (radius > 1 ? 1 : 0)) continue;
            if (dx === 0 && dz === 0 && y <= H) continue;
            put(tx + dx, ground + y, tz + dz, B.pine_leaves, false);
          }
        }
        radius = radius >= 2 ? 1 : radius + 1;
      }
      return;
    }
    const log = kind === 'oak' ? B.oak_log : B.birch_log;
    const leaves = kind === 'oak' ? B.oak_leaves : B.birch_leaves;
    const H = (kind === 'oak' ? 4 : 5) + Math.floor(r() * 3);
    for (let y = 1; y <= H; y++) put(tx, ground + y, tz, log, true);
    for (let y = H - 2; y <= H + 1; y++) {
      const rad = y >= H ? 1 : 2;
      for (let dz = -rad; dz <= rad; dz++) {
        for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && (y === H + 1 || r() < 0.5)) continue;
          if (dx === 0 && dz === 0 && y <= H) continue;
          put(tx + dx, ground + y, tz + dz, leaves, false);
        }
      }
    }
  }

  /** True if the generated top block at this column is soil (mirrors the surface rules in generateChunk). */
  private soilSurface(x: number, z: number, col: ColumnSample): boolean {
    const h = col.height;
    if (h < SEA_LEVEL || col.poi || col.biome === Biome.Desert || col.biome === Biome.Beach || col.biome === Biome.StoneBeach) return false;
    if (h > SEA_LEVEL + 44) return false;
    let slope = 0;
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) slope = Math.max(slope, Math.abs(this.column(x + ox, z + oz).height - h));
    if (slope >= 3) return false;
    if (col.biome === Biome.Mountains && !(slope < 2 && h < SEA_LEVEL + 40)) return false;
    return true;
  }

  private placePlants(data: Uint8Array, cx: number, cz: number, colAt: (x: number, z: number) => ColumnSample) {
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const col = colAt(lx, lz);
        if (col.poi) continue;
        const y = col.height;
        if (y < SEA_LEVEL || y + 1 >= WORLD_HEIGHT) continue;
        const ground = data[cidx(lx, y, lz)];
        if (data[cidx(lx, y + 1, lz)] !== B.air) continue;
        const roll = hashFloat(x0 + lx, z0 + lz, this.seed, 0x91a);
        let plant: number = B.air;
        if (ground === B.grass || ground === B.dry_grass) {
          const meadow = 0.5 + 0.5 * this.detail.noise2((x0 + lx) / 30, (z0 + lz) / 30);
          if (roll < 0.006) plant = B.hemp;
          else if (roll < 0.011 && (col.biome === Biome.Forest || col.biome === Biome.Taiga || col.biome === Biome.BirchForest)) plant = B.berry_bush;
          else if (roll < 0.014 && col.biome === Biome.Forest) plant = B.mushroom;
          else if (roll < 0.03 && ground === B.grass && col.biome === Biome.Plains) plant = roll < 0.022 ? B.flower_yellow : B.flower_red;
          else if (roll < 0.06 + meadow * 0.18) plant = ground === B.dry_grass && roll > 0.12 ? B.dead_bush : B.tall_grass;
        } else if (ground === B.swamp_grass) {
          if (roll < 0.04) plant = B.mushroom;
          else if (roll < 0.25) plant = B.tall_grass;
        } else if (ground === B.sand && col.biome === Biome.Desert) {
          if (roll < 0.008) {
            const hgt = 1 + Math.floor(hashFloat(x0 + lx, z0 + lz, 77) * 3);
            for (let k = 1; k <= hgt && y + k < WORLD_HEIGHT; k++) data[cidx(lx, y + k, lz)] = B.cactus;
            continue;
          } else if (roll < 0.02) plant = B.dead_bush;
        } else if (ground === B.snowy_grass) {
          if (roll < 0.004) plant = B.berry_bush;
        }
        if (plant !== B.air) data[cidx(lx, y + 1, lz)] = plant;
      }
    }
  }

  /**
   * Find a spawn point on a beach (Rust-style coastal spawns). Deterministic
   * for a given rng. Returns world-space feet position.
   */
  findBeachSpawn(rnd: () => number, radius = 1200): { x: number; y: number; z: number } {
    for (let attempt = 0; attempt < 4000; attempt++) {
      const x = Math.floor((rnd() * 2 - 1) * radius);
      const z = Math.floor((rnd() * 2 - 1) * radius);
      const col = this.column(x, z);
      if ((col.biome === Biome.Beach || (attempt > 2500 && col.height >= SEA_LEVEL && col.biome !== Biome.Mountains)) && col.height >= SEA_LEVEL && !col.poi) {
        return { x: x + 0.5, y: col.height + 1, z: z + 0.5 };
      }
    }
    return { x: 0.5, y: WORLD_HEIGHT - 10, z: 0.5 };
  }
}
