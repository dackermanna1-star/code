/**
 * Overworld generator (Minecraft 1.18+ "Caves & Cliffs" style, compressed into y = 0..255).
 *
 * Pipeline per chunk column (all steps are pure functions of (seed, position)):
 *  1. terrain density fill (terrain.ts) -> stone / deepslate (dithered y 8..16) / air
 *  2. fluids: open water up to sea level, aquifers for cave air (aquifer.ts)
 *  3. surface rules (surface.ts) + biome extensions (badlands hoodoos, icebergs), bedrock floor
 *  4. carvers (ravines + worm caves, carvers.ts)
 *  5. features & structures (features/*, structures/*), evaluated for this chunk and its
 *     neighbours, writing only blocks inside this chunk
 *  6. freeze pass (ice / snow layers), heightmap, blended biome colours
 */
import type { WorldGenerator } from '../generator';
import type { GeneratedChunk } from '../../chunk';
import { OverworldTerrain, SEA_Y } from './terrain';
import { Aquifer, FLUID_BARRIER, FLUID_LAVA, FLUID_WATER } from './aquifer';
import { SurfaceRules, IS_BADLANDS as IS_BADLANDS_, IS_FROZEN_OCEAN as IS_FROZEN_OCEAN_ } from './surface';
import { BIO as BIO_ } from './biomeSource';
import { ST as ST_, IS_SOLID as IS_SOLID_, IS_LEAVES as IS_LEAVES_, IS_LOG as IS_LOG_ } from '../common/states';
import { hashF as hashF_ } from '../common/noise';
import { blendBiomeColors, finishChunk } from '../common/output';
import { Carvers, segmentContains, type Segment } from './carvers';
import { OrePlacer } from './ores';
import { Decorator, type DecorationHost } from './features';
import { ChunkWriter } from '../common/writer';
import { StructureManager } from '../structures/index';
import { LAVA_Y } from './aquifer';
import { BLOCKS } from '../../blocks/registry';

// module-local bindings (avoid namespace getters in hot loops under tsx/vitest)
const ST = ST_;
const IS_SOLID = IS_SOLID_;
const IS_BADLANDS = IS_BADLANDS_;
const IS_FROZEN_OCEAN = IS_FROZEN_OCEAN_;
const BIO = BIO_;
const hashF = hashF_;

/** Blocks carvers may remove. */
const CARVABLE = new Uint8Array(4096);
for (const b of BLOCKS) {
  if (['stone', 'granite', 'diorite', 'andesite', 'tuff', 'deepslate', 'dirt', 'grass_block', 'podzol', 'coarse_dirt', 'mycelium', 'mud', 'sand', 'red_sand', 'gravel', 'sandstone', 'red_sandstone', 'calcite', 'snow_block', 'powder_snow', 'clay', 'terracotta'].includes(b.name) || b.name.endsWith('_terracotta')) CARVABLE[b.id] = 1;
}

export class OverworldGenerator implements WorldGenerator, DecorationHost {
  readonly dimension = 'overworld' as const;
  readonly terrain: OverworldTerrain;
  readonly aquifer: Aquifer;
  readonly surface: SurfaceRules;
  readonly carvers: Carvers;
  readonly ores: OrePlacer;
  readonly decorator: Decorator;
  readonly structures: StructureManager;
  private readonly writer = new ChunkWriter();
  private readonly work = new Uint16Array(65536);
  private readonly solid = new Uint8Array(65536);
  private readonly top = new Int16Array(256);
  private readonly colBiome = new Uint8Array(256);
  /** Carver segments intersecting the 3x3 chunk box around the chunk being generated. */
  private segs: Segment[] = [];

  constructor(readonly seed: number) {
    this.terrain = new OverworldTerrain(seed);
    this.aquifer = new Aquifer(seed, this.terrain);
    this.surface = new SurfaceRules(seed);
    this.carvers = new Carvers(seed);
    this.ores = new OrePlacer(seed, (x, z) => this.terrain.biomeAt(x, z));
    this.decorator = new Decorator(this);
    this.structures = new StructureManager('overworld', {
      seed,
      dimension: 'overworld',
      biomeAt: (x, z) => this.terrain.biomeAt(x, z),
      heightAt: (x, z) => this.terrain.topSolid(x, z),
      groundBlockAt: (x, z) => {
        this.groundAt(x, z);
        return this.groundBlock;
      },
    });
  }

  climate(x: number, z: number): { C: number; H: number; T: number } {
    return this.terrain.quart(x >> 2, z >> 2);
  }

  structureBlocks(x: number, z: number): boolean {
    return this.structures.blocksColumn(x, z);
  }

  // ------------------------------------------------------------------------------------------
  // WorldGenerator API
  // ------------------------------------------------------------------------------------------

  biomeAt(x: number, z: number): number {
    return this.terrain.biomeAt(Math.floor(x), Math.floor(z));
  }

  surfaceHeightAt(x: number, z: number): number {
    return this.terrain.topSolid(Math.floor(x), Math.floor(z));
  }

  /**
   * Spawn search like Minecraft's: spiral outwards from (0,0) for an inland (C >= -0.11), non-valley
   * (|W| >= 0.16) column on dry, walkable ground in a friendly biome, then verify against the actual
   * generated chunk (no tree trunk / water / lava at the feet, two blocks of headroom).
   */
  findSpawn(): { x: number; y: number; z: number } {
    const bad = new Set<number>([BIO.frozen_peaks, BIO.jagged_peaks, BIO.stony_peaks, BIO.snowy_slopes, BIO.mushroom_fields, BIO.river, BIO.frozen_river, BIO.stony_shore, BIO.swamp]);
    const okGround = new Set<number>([ST.grass, ST.sand, ST.podzol, ST.coarseDirt, ST.snowBlock, ST.dirt, ST.redSand, ST.mycelium]);
    const tried = new Set<string>();
    for (let r = 0; r <= 4096; r += 16) {
      const n = Math.max(1, Math.round((2 * Math.PI * r) / 16));
      for (let a = 0; a < n; a++) {
        const ang = (a / n) * Math.PI * 2;
        const x = Math.round(Math.cos(ang) * r), z = Math.round(Math.sin(ang) * r);
        const q = this.terrain.quart(x >> 2, z >> 2);
        if (q.C < -0.11 || Math.abs(q.W) < 0.16) continue;
        if (bad.has(this.terrain.biomeAt(x, z))) continue;
        const y = this.groundAt(x, z);
        if (y < SEA_Y || y > 140 || !okGround.has(this.groundBlock)) continue;
        const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
        const key = `${cx},${cz}`;
        if (tried.has(key)) continue;
        tried.add(key);
        const spot = this.safeSpotInChunk(cx, cz, x, z);
        if (spot) return spot;
      }
    }
    return { x: 0.5, y: Math.max(SEA_Y, this.surfaceHeightAt(0, 0)) + 1, z: 0.5 };
  }

  private safeSpotInChunk(cx: number, cz: number, px: number, pz: number): { x: number; y: number; z: number } | null {
    const ch = this.generate(cx, cz);
    const get = (lx: number, y: number, lz: number) => {
      const s = ch.blocks[y >> 4];
      return s ? s[((y & 15) << 8) | (lz << 4) | lx] : 0;
    };
    const cols: number[] = [];
    for (let c = 0; c < 256; c++) cols.push(c);
    const lx0 = px - cx * 16, lz0 = pz - cz * 16;
    cols.sort((a, b) => Math.hypot((a & 15) - lx0, (a >> 4) - lz0) - Math.hypot((b & 15) - lx0, (b >> 4) - lz0));
    for (const c of cols) {
      const lx = c & 15, lz = c >> 4;
      let y = ch.heightmap[c] - 1;
      if (y < SEA_Y) continue;
      let s = get(lx, y, lz);
      // stand on top of snow layers / plants: look at the block under them
      if (s === ST.snowLayer) s = get(lx, --y, lz);
      const id = s >>> 4;
      if (!IS_SOLID[id] || s === ST.water || s === ST.lava || s === ST.ice || IS_LEAVES_[id] || IS_LOG_[id] || s === ST.cactus || s === ST.magma) continue;
      const f1 = get(lx, y + 1, lz), f2 = get(lx, y + 2, lz);
      const passable = (t: number) => t === 0 || t === ST.snowLayer || t === ST.shortGrass || t === ST.fern || !IS_SOLID[t >>> 4] && t !== ST.water && t !== ST.lava;
      if (!passable(f1) || !passable(f2)) continue;
      return { x: cx * 16 + lx + 0.5, y: y + 1, z: cz * 16 + lz + 0.5 };
    }
    return null;
  }

  locateStructure(type: string, x: number, z: number): { x: number; y: number; z: number } | null {
    return this.structures.locate(type, Math.floor(x), Math.floor(z));
  }

  generate(cx: number, cz: number): GeneratedChunk {
    const work = this.work;
    work.fill(0);
    this.solid.fill(0);
    this.terrain.fillChunk(cx, cz, this.solid, this.top);
    const x0 = cx * 16, z0 = cz * 16;
    for (let c = 0; c < 256; c++) this.colBiome[c] = this.terrain.biomeAt(x0 + (c & 15), z0 + (c >> 4));
    this.baseBlocks(cx, cz);
    this.applySurface(cx, cz);
    this.bedrock(cx, cz);
    this.segs = this.carvers.segmentsFor({ x0: x0 - 16, z0: z0 - 16, x1: x0 + 31, z1: z0 + 31 });
    this.carve(cx, cz);
    let maxTop = 0;
    for (let c = 0; c < 256; c++) if (this.top[c] > maxTop) maxTop = this.top[c];
    this.ores.place(cx, cz, work, maxTop);
    const w = this.writer;
    w.reset(cx, cz, work);
    this.structures.place(cx, cz, w);
    this.decorator.segs = this.segs;
    this.decorator.decorate(cx, cz, w, this.top, this.colBiome);
    const biomes = new Uint8Array(256);
    const colors = blendBiomeColors(cx, cz, 2, (x, z) => this.terrain.biomeAt(x, z), biomes);
    return finishChunk(cx, cz, work, biomes, colors, w.blockEntities, w.entities);
  }

  // ------------------------------------------------------------------------------------------
  // steps
  // ------------------------------------------------------------------------------------------

  private baseBlocks(cx: number, cz: number): void {
    const work = this.work, solid = this.solid, top = this.top;
    const x0 = cx * 16, z0 = cz * 16;
    const seed = this.seed;
    for (let c = 0; c < 256; c++) {
      const wx = x0 + (c & 15), wz = z0 + (c >> 4);
      const t = top[c];
      const q = this.terrain.quart(wx >> 2, wz >> 2);
      const fluidMax = Math.max(SEA_Y, Math.min(200, Math.floor(q.prelim) - 6));
      const yMax = Math.max(t, SEA_Y - 1);
      for (let y = 0; y <= yMax; y++) {
        const i = (y << 8) | c;
        if (solid[i]) {
          work[i] = y < 8 || (y < 16 && hashF(wx, y, wz, seed ^ 0xdee95) < (16 - y) / 8) ? ST.deepslate : ST.stone;
        } else if (y > t) {
          work[i] = y < SEA_Y ? ST.water : 0;
        } else if (y < fluidMax) {
          const f = this.aquifer.fluidAt(wx, y, wz);
          work[i] = f === FLUID_WATER ? ST.water : f === FLUID_LAVA ? ST.lava : f === FLUID_BARRIER ? (y < 12 ? ST.deepslate : ST.stone) : 0;
        }
      }
    }
  }

  /**
   * Pure ground query used by features of neighbouring chunks: y of the top terrain block and the
   * block the surface rules put there (ignoring carvers / features). Matches chunk generation.
   * Returns y and stores the block in `groundBlock`.
   */
  groundBlock = 0;
  groundAt(x: number, z: number): number {
    const t = this.terrain;
    const y = t.topSolid(x, z);
    if (y < 0) {
      this.groundBlock = 0;
      return y;
    }
    if (y < SEA_Y - 1) {
      this.groundBlock = ST.water;
      return y;
    }
    const biome = t.biomeAt(x, z);
    const sn = this.surface.surfaceN.noise2(x, z);
    // chunk-clamped steepness, identical to steep() on the owning chunk
    const lx = x & 15, lz = z & 15, bx = x - lx, bz = z - lz;
    const h = (cx: number, cz: number) => Math.max(t.topSolid(bx + cx, bz + cz), SEA_Y - 1);
    let steep = h(lx, Math.min(lz + 1, 15)) >= h(lx, Math.max(lz - 1, 0)) + 4;
    if (!steep) steep = h(Math.max(lx - 1, 0), lz) >= h(Math.min(lx + 1, 15), lz) + 4;
    const surfDepth = Math.max(1, Math.floor(3 + sn * 4 + hashF(x, 0, z, this.seed ^ 0xde47) * 0.25));
    const st = this.surface.rule(biome, x, y, z, 0, surfDepth, sn, 0, steep, true);
    this.groundBlock = st === 0 ? ST.stone : st;
    return y;
  }

  /** Validated trees planned by source chunk (sx, sz) — for tests and debugging. */
  debugTrees(sx: number, sz: number) {
    const prev = this.decorator.segs;
    this.decorator.segs = this.carvers.segmentsFor({ x0: sx * 16 - 16, z0: sz * 16 - 16, x1: sx * 16 + 31, z1: sz * 16 + 31 });
    const out = this.decorator.plannedTrees(sx, sz);
    this.decorator.segs = prev;
    return out;
  }

  /** Minecraft's chunk-local steepness test (north- and east-facing slopes). */
  private steep(c: number): boolean {
    const top = this.top;
    const x = c & 15, z = c >> 4;
    const h = (i: number) => Math.max(top[i], SEA_Y - 1);
    const n = h((Math.max(z - 1, 0) << 4) | x), s = h((Math.min(z + 1, 15) << 4) | x);
    if (s >= n + 4) return true;
    const w = h((z << 4) | Math.max(x - 1, 0)), e = h((z << 4) | Math.min(x + 1, 15));
    return w >= e + 4;
  }

  private applySurface(cx: number, cz: number): void {
    const work = this.work, top = this.top, rules = this.surface;
    const x0 = cx * 16, z0 = cz * 16;
    for (let c = 0; c < 256; c++) {
      const topY = top[c];
      if (topY < 0) continue;
      const wx = x0 + (c & 15), wz = z0 + (c >> 4);
      const biome = this.colBiome[c];
      const sn = rules.surfaceN.noise2(wx, wz);
      const surfDepth = Math.max(1, Math.floor(3 + sn * 4 + hashF(wx, 0, wz, this.seed ^ 0xde47) * 0.25));
      const steep = this.steep(c);
      const prelim = this.terrain.quart(wx >> 2, wz >> 2).prelim;
      const badlands = IS_BADLANDS[biome] === 1;
      const minY = Math.max(1, badlands ? Math.min(SEA_Y - 2, Math.floor(prelim) - 20) : Math.floor(prelim) - 20);
      // badlands hoodoos (eroded badlands extension)
      if (biome === BIO.eroded_badlands && topY >= SEA_Y) {
        const hh = rules.hoodooHeight(wx, wz, topY);
        for (let y = topY + 1; y <= Math.min(250, topY + hh); y++) work[(y << 8) | c] = rules.band(wx, y, wz);
      }
      // icebergs
      if (IS_FROZEN_OCEAN[biome] && topY < SEA_Y - 3) {
        const bh = rules.iceberg(wx, wz);
        if (bh > 0) {
          const topIce = Math.min(SEA_Y - 1 + Math.floor(bh * 0.35), 120);
          const botIce = Math.max(topY + 1, SEA_Y - 1 - bh);
          for (let y = botIce; y <= topIce; y++) {
            const r = hashF(wx, y, wz, this.seed ^ 0x1ceb);
            work[(y << 8) | c] = y >= topIce - 1 && y >= SEA_Y ? ST.snowBlock : r < 0.04 ? ST.blueIce : ST.packedIce;
          }
        }
      }
      let d = -1;
      let waterTop = -1;
      let prevWater = false;
      let floorWd = 0;
      const startY = Math.min(255, topY + 60);
      for (let y = startY; y >= minY; y--) {
        const i = (y << 8) | c;
        const s = work[i];
        const iceLike = s === ST.packedIce || s === ST.blueIce || s === ST.snowBlock || s === ST.ice;
        if (s === 0 || s === ST.water || s === ST.lava || iceLike || !IS_SOLID[s >>> 4]) {
          if (s === ST.water || iceLike) {
            if (!prevWater) waterTop = y;
            prevWater = true;
          } else prevWater = false;
          d = -1;
          continue;
        }
        if (s !== ST.stone && s !== ST.deepslate) {
          d = d < 0 ? 0 : d + 1;
          prevWater = false;
          continue;
        }
        if (d < 0) floorWd = prevWater ? waterTop - y : 0;
        d++;
        prevWater = false;
        if (!badlands && d > surfDepth + 8) continue;
        const below = y > 0 ? work[i - 256] : ST.bedrock;
        const belowSolid = below !== ST.water && below !== ST.lava && IS_SOLID[below >>> 4] === 1;
        const st = rules.rule(biome, wx, y, wz, d, surfDepth, sn, floorWd, steep, belowSolid);
        if (st !== 0) work[i] = st;
      }
    }
  }

  private carve(cx: number, cz: number): void {
    const work = this.work;
    const x0 = cx * 16, z0 = cz * 16;
    for (const s of this.segs) {
      if (s.maxX < x0 || s.minX > x0 + 15 || s.maxZ < z0 || s.minZ > z0 + 15) continue;
      const xa = Math.max(s.minX, x0), xb = Math.min(s.maxX, x0 + 15);
      const za = Math.max(s.minZ, z0), zb = Math.min(s.maxZ, z0 + 15);
      for (let x = xa; x <= xb; x++)
        for (let z = za; z <= zb; z++) {
          const lx = x - x0, lz = z - z0;
          for (let y = s.maxY; y >= s.minY; y--) {
            if (!segmentContains(s, x, y, z)) continue;
            const i = (y << 8) | (lz << 4) | lx;
            const st = work[i];
            if (!CARVABLE[st >>> 4]) continue;
            // never expose fluids: keep a seal under water/lava and next to it
            const up = work[i + 256];
            if (up === ST.water || up === ST.lava) continue;
            if ((lx > 0 && work[i - 1] === ST.water) || (lx < 15 && work[i + 1] === ST.water) || (lz > 0 && work[i - 16] === ST.water) || (lz < 15 && work[i + 16] === ST.water)) continue;
            const f = y < LAVA_Y ? FLUID_LAVA : this.aquifer.fluidAt(x, y, z);
            if (f === FLUID_BARRIER) continue;
            work[i] = f === FLUID_WATER ? ST.water : f === FLUID_LAVA ? ST.lava : 0;
            if ((st === ST.grass || st === ST.mycelium) && work[i - 256] === ST.dirt) work[i - 256] = st;
          }
        }
    }
  }

  private bedrock(cx: number, cz: number): void {
    const work = this.work;
    const x0 = cx * 16, z0 = cz * 16;
    for (let c = 0; c < 256; c++) {
      const wx = x0 + (c & 15), wz = z0 + (c >> 4);
      work[c] = ST.bedrock;
      for (let y = 1; y < 5; y++) {
        const i = (y << 8) | c;
        if (work[i] !== 0 && work[i] !== ST.lava && work[i] !== ST.water && hashF(wx, y, wz, this.seed ^ 0xbed70c) < (5 - y) / 5) work[i] = ST.bedrock;
      }
    }
  }
}
