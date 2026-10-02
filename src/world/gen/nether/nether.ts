/**
 * Nether generator (Minecraft 1.16+ style) in y = 0..127; nothing above y = 127.
 *
 *  - Terrain: 3D noise density on 4x8x4 cells with Minecraft's nether slides (solid towards the
 *    floor and ceiling), trilinear interpolation; lava sea fills air at y <= 31.
 *  - Bedrock floor y 0..4 and roof y 123..127 (noisy).
 *  - Biomes (multi-noise on temperature / humidity): nether wastes, crimson forest, warped forest,
 *    soul sand valley, basalt deltas — with their surface rules.
 *  - Features: glowstone clusters, huge crimson / warped fungi (shroomlights, weeping vines),
 *    roots, fungi, weeping & twisting vines, fire / soul fire, basalt columns and pillars, delta
 *    lava pools, bone fossils, lava springs, ores (quartz, gold, ancient debris, magma, gravel,
 *    blackstone).
 * All decisions are pure functions of (seed, position); cross-chunk features use the pure density.
 */
import type { WorldGenerator } from '../generator';
import type { GeneratedChunk } from '../../chunk';
import { OctaveNoise, RawNoise2, hash3i as hash3i_, hashF as hashF_ } from '../common/noise';
import { Rng, seedFor } from '../../../core/rng';
import { ST as ST_, IS_SOLID as IS_SOLID_ } from '../common/states';
import { finishChunk } from '../common/output';
import { ChunkWriter } from '../common/writer';
import { OrePlacer, ore, Target, type OreConf } from '../overworld/ores';
import { biomeId, BIOMES, biomeGrassColor, biomeFoliageColor } from '../../biomes';
import { S, BLOCK_BY_NAME } from '../../blocks/registry';
import { StructureManager } from '../structures/index';

const ST = ST_;
const IS_SOLID = IS_SOLID_;
const hash3i = hash3i_;
const hashF = hashF_;

const LEVELS = 17; // y = 0, 8, ..., 128
const LAVA_SEA = 31; // lava fills air at y <= 31
const B_WASTES = biomeId('nether_wastes');
const B_CRIMSON = biomeId('crimson_forest');
const B_WARPED = biomeId('warped_forest');
const B_SOUL = biomeId('soul_sand_valley');
const B_DELTAS = biomeId('basalt_deltas');

/** Minecraft nether multi-noise points: [biome, temperature, humidity, offset]. */
const NETHER_POINTS: [number, number, number, number][] = [
  [B_WASTES, 0, 0, 0],
  [B_SOUL, 0, -0.5, 0],
  [B_CRIMSON, 0.4, 0, 0],
  [B_WARPED, 0, 0.5, 0.375],
  [B_DELTAS, -0.5, 0, 0.175],
];

const CUSTOM = (names: string[]) => {
  const t = new Uint8Array(4096);
  for (const n of names) t[BLOCK_BY_NAME.get(n)!.id] = 1;
  return t;
};
const NETHERRACK_T = CUSTOM(['netherrack']);
const NETHER_BASE_T = CUSTOM(['netherrack', 'basalt', 'blackstone', 'crimson_nylium', 'warped_nylium', 'soul_sand', 'soul_soil']);
const NETHER_ORES: OreConf[] = [
  ore({ stone: ST.magma, deep: ST.magma, size: 33, count: 4, minY: 27, maxY: 36, trapezoid: false, discard: 0, target: Target.CUSTOM, custom: NETHERRACK_T }),
  ore({ stone: ST.gravel, deep: ST.gravel, size: 33, count: 2, minY: 5, maxY: 41, trapezoid: false, discard: 0, target: Target.CUSTOM, custom: NETHERRACK_T }),
  ore({ stone: ST.blackstone, deep: ST.blackstone, size: 33, count: 2, minY: 5, maxY: 31, trapezoid: false, discard: 0, target: Target.CUSTOM, custom: NETHERRACK_T }),
  ore({ stone: ST.soulSand, deep: ST.soulSand, size: 12, count: 4, minY: 5, maxY: 31, trapezoid: false, discard: 0, target: Target.CUSTOM, custom: NETHERRACK_T }),
  ore({ stone: ST.netherQuartzOre, deep: ST.netherQuartzOre, size: 14, count: 16, minY: 10, maxY: 117, trapezoid: false, discard: 0, target: Target.CUSTOM, custom: NETHERRACK_T }),
  ore({ stone: ST.netherGoldOre, deep: ST.netherGoldOre, size: 10, count: 10, minY: 10, maxY: 117, trapezoid: false, discard: 0, target: Target.CUSTOM, custom: NETHERRACK_T }),
  ore({ stone: ST.ancientDebris, deep: ST.ancientDebris, size: 2, count: 1, minY: 8, maxY: 24, trapezoid: false, discard: 1, target: Target.CUSTOM, custom: NETHER_BASE_T }),
  ore({ stone: ST.ancientDebris, deep: ST.ancientDebris, size: 3, count: 1, minY: 8, maxY: 24, trapezoid: true, discard: 1, target: Target.CUSTOM, custom: NETHER_BASE_T }),
];

class NetherColumn {
  biome = 0;
  readonly d = new Float64Array(LEVELS);
  done = false;
  constructor(readonly qx: number, readonly qz: number) {}
}

const NYLIUM_IDS = new Uint8Array(4096);
NYLIUM_IDS[ST.crimsonNylium >>> 4] = 1;
NYLIUM_IDS[ST.warpedNylium >>> 4] = 1;

export class NetherGenerator implements WorldGenerator {
  readonly dimension = 'nether' as const;
  private readonly base: OctaveNoise;
  private readonly tempN: OctaveNoise;
  private readonly humN: OctaveNoise;
  private readonly stateN: RawNoise2;
  private readonly patchN: RawNoise2;
  private readonly wartN: RawNoise2;
  private readonly soulLayerN: RawNoise2;
  private readonly gravelLayerN: RawNoise2;
  private readonly basaltN: RawNoise2;
  private readonly columnN: OctaveNoise;
  private readonly deltaN: OctaveNoise;
  private readonly cache = new Map<number, NetherColumn>();
  private readonly glowCache = new Map<number, number[]>();
  private readonly work = new Uint16Array(65536);
  private readonly writer = new ChunkWriter();
  private readonly ores: OrePlacer;
  /** Structure extension point (fortresses, bastions ... register for dimension 'nether'). */
  readonly structures: StructureManager;

  constructor(readonly seed: number) {
    const s = (k: number) => (seed * 31 + k * 0x6c8e9cf5) | 0;
    this.base = new OctaveNoise(s(1), 1 / 110, [1, 0.5, 0.25, 0.12], { sigma: 0.42, yScale: 2.3 });
    this.tempN = new OctaveNoise(s(2), 1 / 512, [1, 1], { sigma: 0.42 });
    this.humN = new OctaveNoise(s(3), 1 / 512, [1, 1], { sigma: 0.42 });
    this.stateN = new RawNoise2(s(4), 1 / 24);
    this.patchN = new RawNoise2(s(5), 1 / 12);
    this.wartN = new RawNoise2(s(6), 1 / 10);
    this.soulLayerN = new RawNoise2(s(7), 1 / 20);
    this.gravelLayerN = new RawNoise2(s(8), 1 / 20);
    this.basaltN = new RawNoise2(s(9), 1 / 16);
    this.columnN = new OctaveNoise(s(10), 1 / 6, [1, 0.4], { sigma: 0.45 });
    this.deltaN = new OctaveNoise(s(11), 1 / 14, [1, 0.5], { sigma: 0.4 });
    this.ores = new OrePlacer(seed ^ 0x4e7e, () => B_WASTES, NETHER_ORES);
    this.structures = new StructureManager('nether', {
      seed,
      dimension: 'nether',
      biomeAt: (x, z) => this.biomeAt(x, z),
      heightAt: (x, z) => this.floorAt(x, z, 100),
      groundBlockAt: (x, z) => {
        const y = this.floorAt(x, z, 100);
        return y < 0 ? 0 : this.floorBlock(x, y, z, this.biomeAt(x, z));
      },
    });
  }

  // ------------------------------------------------------------------------------------------
  // sampling
  // ------------------------------------------------------------------------------------------

  private column(qx: number, qz: number): NetherColumn {
    const key = (qx + 0x80000) * 0x100000 + (qz + 0x80000);
    let c = this.cache.get(key);
    if (c) return c;
    if (this.cache.size > 40000) this.cache.clear();
    c = new NetherColumn(qx, qz);
    const x = qx * 4, z = qz * 4;
    const T = this.tempN.noise2(x, z), H = this.humN.noise2(x, z);
    let best = 1e9;
    for (const [b, t, h, o] of NETHER_POINTS) {
      const d = (T - t) * (T - t) + (H - h) * (H - h) + o * o;
      if (d < best) { best = d; c.biome = b; }
    }
    for (let k = 0; k < LEVELS; k++) {
      const y = k * 8;
      let D = this.base.noise3(x, y, z) - 0.04;
      if (y > 104) {
        const f = Math.min(1, Math.max(0, (128 - y) / 24));
        D = 0.9375 + f * (D - 0.9375);
      }
      const fb = Math.min(1, Math.max(0, (y + 8) / 32));
      D = 2.5 + fb * (D - 2.5);
      c.d[k] = D;
    }
    this.cache.set(key, c);
    return c;
  }

  biomeAt(x: number, z: number): number {
    x = Math.floor(x); z = Math.floor(z);
    const i = x - 2, k = z - 2;
    const qx = i >> 2, qz = k >> 2;
    const fx = (i & 3) * 0.25, fz = (k & 3) * 0.25;
    let best = 1e9, bdx = 0, bdz = 0;
    for (let c = 0; c < 4; c++) {
      const dx = c & 1, dz = c >> 1;
      const h = hash3i(qx + dx, 0x2b, qz + dz, this.seed);
      const jx = ((h & 1023) / 1024 - 0.5) * 0.9, jz = (((h >>> 10) & 1023) / 1024 - 0.5) * 0.9;
      const ddx = fx - dx + jx, ddz = fz - dz + jz;
      const d = ddx * ddx + ddz * ddz;
      if (d < best) { best = d; bdx = dx; bdz = dz; }
    }
    return this.column(qx + bdx, qz + bdz).biome;
  }

  /** Pure terrain solidity (before surface rules / features). */
  solidAt(x: number, y: number, z: number): boolean {
    if (y <= 0 || y >= 127) return true;
    const qx = x >> 2, qz = z >> 2, fx = (x & 3) * 0.25, fz = (z & 3) * 0.25;
    const k = y >> 3, t = (y & 7) * 0.125;
    const c00 = this.column(qx, qz), c10 = this.column(qx + 1, qz), c01 = this.column(qx, qz + 1), c11 = this.column(qx + 1, qz + 1);
    const a0 = c00.d[k] + fx * (c10.d[k] - c00.d[k]), b0 = c01.d[k] + fx * (c11.d[k] - c01.d[k]);
    const v0 = a0 + fz * (b0 - a0);
    const a1 = c00.d[k + 1] + fx * (c10.d[k + 1] - c00.d[k + 1]), b1 = c01.d[k + 1] + fx * (c11.d[k + 1] - c01.d[k + 1]);
    const v1 = a1 + fz * (b1 - a1);
    return v0 + t * (v1 - v0) > 0;
  }

  /** Highest floor (solid block with air above, y > lava sea) at or below yStart; -1 if none. */
  floorAt(x: number, z: number, yStart = 118): number {
    let prevAir = !this.solidAt(x, yStart + 1, z);
    for (let y = yStart; y > LAVA_SEA; y--) {
      const s = this.solidAt(x, y, z);
      if (s && prevAir) return y;
      prevAir = !s;
    }
    return -1;
  }

  surfaceHeightAt(x: number, z: number): number {
    const f = this.floorAt(Math.floor(x), Math.floor(z), 100);
    return f < 0 ? LAVA_SEA : f;
  }

  findSpawn(): { x: number; y: number; z: number } {
    for (let r = 0; r < 512; r += 8) {
      for (let a = 0; a < Math.max(1, r); a += 8) {
        const ang = (a / Math.max(1, r)) * Math.PI * 2;
        const x = Math.round(Math.cos(ang) * r), z = Math.round(Math.sin(ang) * r);
        for (let y = 100; y > 34; y--) {
          if (this.solidAt(x, y, z) && !this.solidAt(x, y + 1, z) && !this.solidAt(x, y + 2, z) && !this.solidAt(x, y + 3, z)) return { x: x + 0.5, y: y + 1, z: z + 0.5 };
        }
      }
    }
    return { x: 0.5, y: 64, z: 0.5 };
  }

  locateStructure(type: string, x: number, z: number): { x: number; y: number; z: number } | null {
    return this.structures.locate(type, Math.floor(x), Math.floor(z));
  }

  /** Floor block the surface rules put at a floor position (pure). */
  floorBlock(x: number, y: number, z: number, biome: number): number {
    if (biome === B_CRIMSON || biome === B_WARPED) {
      if (y < LAVA_SEA || this.patchN.at(x, z) > 0.55) return ST.netherrack;
      if (this.wartN.at(x, z) > 0.62) return biome === B_CRIMSON ? ST.netherWartBlock : ST.warpedWartBlock;
      return biome === B_CRIMSON ? ST.crimsonNylium : ST.warpedNylium;
    }
    if (biome === B_SOUL) return this.stateN.at(x, z) > 0 ? ST.soulSand : ST.soulSoil;
    if (biome === B_DELTAS) return this.basaltN.at(x, z) > 0 ? ST.basalt : ST.blackstone;
    if (y >= LAVA_SEA && y <= 34 && this.gravelLayerN.at(x, z) > 0.1) return ST.gravel;
    return ST.netherrack;
  }

  // ------------------------------------------------------------------------------------------
  // generation
  // ------------------------------------------------------------------------------------------

  generate(cx: number, cz: number): GeneratedChunk {
    const work = this.work;
    work.fill(0);
    const x0 = cx * 16, z0 = cz * 16;
    const q0x = cx * 4, q0z = cz * 4;
    const cols: NetherColumn[] = [];
    for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) cols.push(this.column(q0x + i, q0z + j));
    const colBiome = new Uint8Array(256);
    for (let c = 0; c < 256; c++) colBiome[c] = this.biomeAt(x0 + (c & 15), z0 + (c >> 4));
    // 1. density fill
    for (let z = 0; z < 16; z++) {
      const qz = z >> 2, fz = (z & 3) * 0.25;
      for (let x = 0; x < 16; x++) {
        const qx = x >> 2, fx = (x & 3) * 0.25;
        const c00 = cols[qz * 5 + qx], c10 = cols[qz * 5 + qx + 1], c01 = cols[(qz + 1) * 5 + qx], c11 = cols[(qz + 1) * 5 + qx + 1];
        const col = (z << 4) | x;
        for (let k = 0; k < 16; k++) {
          const a0 = c00.d[k] + fx * (c10.d[k] - c00.d[k]), b0 = c01.d[k] + fx * (c11.d[k] - c01.d[k]);
          const v0 = a0 + fz * (b0 - a0);
          const a1 = c00.d[k + 1] + fx * (c10.d[k + 1] - c00.d[k + 1]), b1 = c01.d[k + 1] + fx * (c11.d[k + 1] - c01.d[k + 1]);
          const v1 = a1 + fz * (b1 - a1);
          for (let j = 0; j < 8; j++) {
            const y = k * 8 + j;
            const solid = y === 0 || y >= 127 || v0 + j * 0.125 * (v1 - v0) > 0;
            work[(y << 8) | col] = solid ? ST.netherrack : y <= LAVA_SEA ? ST.lava : 0;
          }
        }
      }
    }
    // 2. surface rules + bedrock
    this.surface(cx, cz, colBiome);
    // 3. features
    const w = this.writer;
    w.reset(cx, cz, work);
    this.ores.place(cx, cz, work, 127);
    this.structures.place(cx, cz, w);
    this.glowstone(cx, cz, w);
    this.fungi(cx, cz, w);
    this.columnFeatures(cx, cz, w, colBiome);
    this.localFeatures(cx, cz, w, colBiome);
    const b = BIOMES[B_WASTES];
    const colors = { grass: new Uint32Array(256), foliage: new Uint32Array(256), water: new Uint32Array(256) };
    for (let c = 0; c < 256; c++) {
      const bb = BIOMES[colBiome[c]];
      colors.grass[c] = biomeGrassColor(bb);
      colors.foliage[c] = biomeFoliageColor(bb);
      colors.water[c] = b.water;
    }
    return finishChunk(cx, cz, work, colBiome, colors, w.blockEntities, w.entities);
  }

  private surface(cx: number, cz: number, colBiome: Uint8Array): void {
    const work = this.work;
    const x0 = cx * 16, z0 = cz * 16;
    const isSolid = (s: number) => s !== 0 && s !== ST.lava;
    for (let c = 0; c < 256; c++) {
      const x = x0 + (c & 15), z = z0 + (c >> 4);
      const biome = colBiome[c];
      const depth = 2 + Math.floor(hashF(x, 0, z, this.seed ^ 0x51) * 2.5);
      // walk down: d = blocks since the last air above
      let d = -1;
      for (let y = 126; y >= 1; y--) {
        const i = (y << 8) | c;
        const s = work[i];
        if (!isSolid(s)) { d = -1; continue; }
        d++;
        if (y >= 122) continue;
        if (d === 0) {
          work[i] = this.floorBlock(x, y, z, biome);
        } else if (d <= depth) {
          if (biome === B_SOUL) work[i] = this.stateN.at(x, z + y * 7) > 0 ? ST.soulSand : ST.soulSoil;
          else if (biome === B_DELTAS) work[i] = this.basaltN.at(x + y * 5, z) > 0.2 ? ST.basalt : ST.blackstone;
          else if (biome === B_WASTES && y >= 30 && y <= 34 && this.soulLayerN.at(x, z) > 0.2) work[i] = ST.soulSand;
        }
      }
      // ceilings (under-ceiling layers) for soul sand valleys & deltas
      if (biome === B_SOUL || biome === B_DELTAS) {
        let du = -1;
        for (let y = 2; y < 122; y++) {
          const i = (y << 8) | c;
          if (!isSolid(work[i])) { du = -1; continue; }
          du++;
          if (du <= 1 && work[i - 256] === 0 && du === 0) work[i] = biome === B_SOUL ? (this.stateN.at(z, x) > 0 ? ST.soulSand : ST.soulSoil) : ST.basalt;
          else if (du === 1 && work[i] === ST.netherrack) work[i] = biome === B_SOUL ? ST.soulSoil : ST.basalt;
        }
      }
      // bedrock floor & roof
      work[c] = ST.bedrock;
      work[(127 << 8) | c] = ST.bedrock;
      for (let y = 1; y < 5; y++) if (hashF(x, y, z, this.seed ^ 0xbed) < (5 - y) / 5) work[(y << 8) | c] = ST.bedrock;
      for (let y = 123; y < 127; y++) if (hashF(x, y, z, this.seed ^ 0xbee) < (y - 122) / 5) work[(y << 8) | c] = ST.bedrock;
    }
  }

  // ------------------------------------------------------------------------------------------
  // features
  // ------------------------------------------------------------------------------------------

  /** Glowstone clusters hanging from ceilings (cached per source chunk, pure). */
  private glowBlobs(sx: number, sz: number): number[] {
    const key = (sx + 0x100000) * 0x200000 + (sz + 0x100000);
    let out = this.glowCache.get(key);
    if (out) return out;
    if (this.glowCache.size > 2000) this.glowCache.clear();
    out = [];
    const r = new Rng(seedFor(this.seed, sx, sz, 0x9105));
    const n = 2 + r.int(4);
    for (let b = 0; b < n; b++) {
      const x = sx * 16 + 2 + r.int(12), z = sz * 16 + 2 + r.int(12);
      const startY = 60 + r.int(60);
      const seed = r.nextU32();
      // find a ceiling: air with solid above, scanning up from startY
      let y = -1;
      for (let yy = startY; yy < 121; yy++) {
        if (!this.solidAt(x, yy, z) && this.solidAt(x, yy + 1, z)) { y = yy; break; }
      }
      if (y < 0 || y <= LAVA_SEA + 2) continue;
      const rr = new Rng(seed);
      const set = new Set<number>();
      const key3 = (px: number, py: number, pz: number) => ((px - x + 64) * 256 + py) * 256 + (pz - z + 64);
      set.add(key3(x, y, z));
      out.push(x, y, z);
      for (let i = 0; i < 260; i++) {
        const px = x + rr.int(8) - rr.int(8), py = y - rr.int(12), pz = z + rr.int(8) - rr.int(8);
        const k3 = key3(px, py, pz);
        if (set.has(k3) || py <= LAVA_SEA || this.solidAt(px, py, pz)) continue;
        let nb = 0;
        if (set.has(key3(px + 1, py, pz))) nb++;
        if (set.has(key3(px - 1, py, pz))) nb++;
        if (set.has(key3(px, py + 1, pz))) nb++;
        if (set.has(key3(px, py - 1, pz))) nb++;
        if (set.has(key3(px, py, pz + 1))) nb++;
        if (set.has(key3(px, py, pz - 1))) nb++;
        if (nb !== 1) continue;
        set.add(k3);
        out.push(px, py, pz);
      }
    }
    this.glowCache.set(key, out);
    return out;
  }

  private glowstone(cx: number, cz: number, w: ChunkWriter): void {
    for (let sz = cz - 1; sz <= cz + 1; sz++)
      for (let sx = cx - 1; sx <= cx + 1; sx++) {
        const list = this.glowBlobs(sx, sz);
        for (let i = 0; i < list.length; i += 3) w.air(list[i], list[i + 1], list[i + 2], ST.glowstone);
      }
  }

  /** Huge crimson / warped fungi (Minecraft HugeFungusFeature), from the 3x3 neighbourhood. */
  private fungi(cx: number, cz: number, w: ChunkWriter): void {
    for (let sz = cz - 1; sz <= cz + 1; sz++)
      for (let sx = cx - 1; sx <= cx + 1; sx++) {
        const r = new Rng(seedFor(this.seed, sx, sz, 0xf0f0));
        for (let a = 0; a < 10; a++) {
          const x = sx * 16 + r.int(16), z = sz * 16 + r.int(16);
          const yStart = 50 + r.int(70);
          const seed = r.nextU32();
          if (!w.intersects(x - 4, z - 4, x + 4, z + 4)) continue;
          const biome = this.biomeAt(x, z);
          if (biome !== B_CRIMSON && biome !== B_WARPED) continue;
          const fy = this.floorAt(x, z, yStart);
          if (fy < 0) continue;
          if (!NYLIUM_IDS[this.floorBlock(x, fy, z, biome) >>> 4]) continue;
          this.hugeFungus(w, x, fy + 1, z, seed, biome === B_CRIMSON);
        }
      }
  }

  private hugeFungus(w: ChunkWriter, x: number, y: number, z: number, seed: number, crimson: boolean): void {
    const r = new Rng(seed);
    let h = 4 + r.int(10);
    if (r.int(12) === 0) h *= 2;
    if (y + h + 1 >= 122) return;
    const thick = r.next() < 0.06;
    const stem = crimson ? ST.crimsonStem : ST.warpedStem;
    const hat = crimson ? ST.netherWartBlock : ST.warpedWartBlock;
    const vines = ST.weepingVines;
    // stem
    const t = thick ? 1 : 0;
    for (let dx = -t; dx <= t; dx++)
      for (let dz = -t; dz <= t; dz++) {
        const corner = thick && Math.abs(dx) === t && Math.abs(dz) === t;
        for (let l = 0; l < h; l++) {
          if (corner) {
            if (r.next() < 0.1) w.log(x + dx, y + l, z + dz, stem);
          } else w.log(x + dx, y + l, z + dz, stem);
        }
      }
    // hat
    const hatSet = new Set<number>();
    const K = (dx: number, dy: number, dz: number) => ((dx + 8) * 64 + dy) * 32 + (dz + 8);
    const vine = (dx: number, dy: number, dz: number) => {
      let n = 1 + r.int(5);
      if (r.int(7) === 0) n *= 2;
      if (hatSet.has(K(dx, dy - 1, dz))) return;
      for (let k = 1; k <= n; k++) {
        const s = w.get(x + dx, y + dy - k, z + dz);
        if (s !== 0 && s !== -1) break;
        w.set(x + dx, y + dy - k, z + dz, vines);
      }
    };
    const hatH = Math.min(r.int(1 + Math.floor(h / 3)) + 5, h);
    const j = h - hatH;
    for (let k = j; k <= h; k++) {
      let l = k < h - r.int(3) ? 2 : 1;
      if (hatH > 8 && k < j + 4) l = 3;
      if (thick) l++;
      for (let i1 = -l; i1 <= l; i1++)
        for (let j1 = -l; j1 <= l; j1++) {
          const ex = i1 === -l || i1 === l, ez = j1 === -l || j1 === l;
          const inner = !ex && !ez && k !== h;
          const corner = ex && ez;
          const low = k < j + 3;
          const px = x + i1, py = y + k, pz = z + j1;
          const place = (decor: number, hatC: number, vineC: number) => {
            if (r.next() < decor) w.leaf(px, py, pz, ST.shroomlight);
            else if (r.next() < hatC) {
              w.leaf(px, py, pz, hat);
              hatSet.add(K(i1, k, j1));
              if (r.next() < vineC) vine(i1, k, j1);
            }
          };
          if (low) {
            if (!inner) {
              if (hatSet.has(K(i1, k - 1, j1))) {
                w.leaf(px, py, pz, hat);
                hatSet.add(K(i1, k, j1));
              } else if (r.next() < 0.15) {
                w.leaf(px, py, pz, hat);
                hatSet.add(K(i1, k, j1));
                if (crimson && r.int(11) === 0) vine(i1, k, j1);
              }
            }
          } else if (inner) place(0.1, 0.2, crimson ? 0.1 : 0);
          else if (corner) place(0.01, 0.7, crimson ? 0.083 : 0);
          else place(0.0005, 0.98, crimson ? 0.07 : 0);
        }
    }
  }

  /** Per-column decorations (local to the chunk). */
  private columnFeatures(cx: number, cz: number, w: ChunkWriter, colBiome: Uint8Array): void {
    const work = w.work;
    const x0 = cx * 16, z0 = cz * 16;
    for (let c = 0; c < 256; c++) {
      const x = x0 + (c & 15), z = z0 + (c >> 4);
      const biome = colBiome[c];
      // basalt deltas: columns & lava pools on floors
      for (let y = 120; y > LAVA_SEA; y--) {
        const i = (y << 8) | c;
        const s = work[i];
        if (s === 0 || s === ST.lava) continue;
        if (work[i + 256] !== 0) continue;
        // (x, y, z) is a floor
        const r = hashF(x, y, z, this.seed ^ 0xf1007);
        if (biome === B_DELTAS) {
          const dn = this.deltaN.noise2(x, z);
          if (dn > 0.42 && s !== ST.bedrock) {
            work[i] = ST.lava;
            continue;
          }
          if (dn > 0.34 && s !== ST.bedrock) {
            work[i] = ST.magma;
            continue;
          }
          const cn = this.columnN.noise2(x, z);
          if (cn > 0.3) {
            const hgt = Math.floor((cn - 0.3) * 18) + (r < 0.3 ? 1 : 0);
            for (let k = 1; k <= hgt && y + k < 122; k++) {
              if (work[i + (k << 8)] !== 0) break;
              work[i + (k << 8)] = ST.basalt;
            }
          }
          continue;
        }
        if (biome === B_CRIMSON || biome === B_WARPED) {
          const crimson = biome === B_CRIMSON;
          if (s === ST.crimsonNylium || s === ST.warpedNylium) {
            if (r < 0.18) work[i + 256] = crimson ? ST.crimsonRoots : ST.warpedRoots;
            else if (r < 0.22) work[i + 256] = crimson ? ST.crimsonFungus : ST.warpedFungus;
            else if (!crimson && r > 0.985 && ST.twistingVines) {
              const n = 1 + Math.floor(hashF(x, y, z, 0x7a1) * 8);
              for (let k = 1; k <= n && y + k < 121; k++) {
                if (work[i + (k << 8)] !== 0) break;
                work[i + (k << 8)] = ST.twistingVines;
              }
            }
          }
          continue;
        }
        if (biome === B_SOUL) {
          if ((s === ST.soulSand || s === ST.soulSoil) && r < 0.012) work[i + 256] = ST.soulFire;
          continue;
        }
        // nether wastes
        if (s === ST.netherrack && r < 0.006) work[i + 256] = ST.fire;
        else if (s === ST.netherrack && r > 0.9985) work[i + 256] = r > 0.99925 ? ST.redMushroom : ST.brownMushroom;
      }
      // weeping vines from ceilings in crimson forests
      if (biome === B_CRIMSON) {
        for (let y = 40; y < 121; y++) {
          const i = (y << 8) | c;
          if (work[i] !== 0) continue;
          const above = work[i + 256];
          if (above !== ST.netherrack && above !== ST.netherWartBlock && above !== ST.crimsonNylium) continue;
          if (hashF(x, y, z, this.seed ^ 0x7e3b) > 0.06) continue;
          const n = 1 + Math.floor(hashF(x, y, z, 0x7e3c) * 8);
          for (let k = 0; k < n; k++) {
            if (work[i - (k << 8)] !== 0 || y - k <= LAVA_SEA) break;
            work[i - (k << 8)] = ST.weepingVines;
          }
        }
      }
    }
  }

  /** Small features kept inside one chunk: basalt pillars & bone fossils (soul sand valleys), lava springs. */
  private localFeatures(cx: number, cz: number, w: ChunkWriter, colBiome: Uint8Array): void {
    const work = w.work;
    const r = new Rng(seedFor(this.seed, cx, cz, 0x10ca7));
    // lava springs in walls
    for (let a = 0; a < 8; a++) {
      const lx = 1 + r.int(14), lz = 1 + r.int(14), y = 10 + r.int(108);
      const i = (y << 8) | (lz << 4) | lx;
      if (work[i] !== ST.netherrack || work[i + 256] !== ST.netherrack || work[i - 256] !== ST.netherrack) continue;
      let open = 0;
      for (const d of [1, -1, 16, -16]) if (work[i + d] === 0) open++;
      if (open === 1) work[i] = ST.lava;
    }
    const b = colBiome[(8 << 4) | 8];
    if (b !== B_SOUL) return;
    // basalt pillars connecting floor and ceiling
    for (let a = 0; a < 2; a++) {
      const lx = 2 + r.int(12), lz = 2 + r.int(12), y = 40 + r.int(70);
      const c = (lz << 4) | lx;
      if (work[(y << 8) | c] !== 0) continue;
      let top = y, bot = y;
      while (top < 120 && work[(top << 8) | c] === 0) top++;
      while (bot > LAVA_SEA && work[(bot << 8) | c] === 0) bot--;
      if (top >= 120 || bot <= LAVA_SEA || top - bot > 40) continue;
      for (let yy = bot + 1; yy < top; yy++) {
        work[(yy << 8) | c] = ST.basalt;
        if (r.next() < 0.3) {
          const d = [1, -1, 16, -16][r.int(4)];
          if (work[((yy << 8) | c) + d] === 0) work[((yy << 8) | c) + d] = ST.basalt;
        }
      }
    }
    // bone fossil: a few rib arcs on the floor
    if (r.int(6) === 0) {
      const lx = 4 + r.int(8), lz = 4 + r.int(8);
      let y = 100;
      const c = (lz << 4) | lx;
      while (y > LAVA_SEA && !(work[(y << 8) | c] !== 0 && work[((y + 1) << 8) | c] === 0)) y--;
      if (y > LAVA_SEA + 1) {
        const ribs = 3 + r.int(3), along = r.int(2);
        const R = 3 + r.int(2);
        for (let k = 0; k < ribs; k++) {
          for (let a = 0; a <= 8; a++) {
            const ang = (a / 8) * Math.PI;
            const u = Math.round(Math.cos(ang) * R), v = Math.round(Math.sin(ang) * R);
            const px = along ? lx + k * 2 - ribs : lx + u, pz = along ? lz + u : lz + k * 2 - ribs;
            if (px < 0 || px > 15 || pz < 0 || pz > 15) continue;
            const i = ((y + v) << 8) | (pz << 4) | px;
            if (y + v < 121 && (work[i] === 0 || work[i] === ST.soulSand || work[i] === ST.soulSoil)) work[i] = S('bone_block', along ? 1 : 2);
          }
        }
      }
    }
  }
}
