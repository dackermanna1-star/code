/**
 * Overworld decoration: trees (cross-chunk), per-column vegetation, underground decoration
 * (glow lichen, springs, dripstone / lush patches, dungeons, geodes, fossils), boulders, ice spikes
 * and the final freeze pass (snow layers + ice).
 *
 * Determinism rules (see generator.ts):
 *  - Trees and other multi-chunk features are planned per *source* chunk with a chunk-seeded RNG.
 *    Their validity depends only on pure functions (terrain sampler, surface rules, carver
 *    segments), never on blocks outside the chunk being generated.
 *  - When generating chunk C, features of C and its 8 neighbours are evaluated in a fixed global
 *    order (source chunk z, then x, then index) and clipped to C by the `ChunkWriter`.
 *  - Per-column decorations (grass, flowers, kelp ...) and small local features only read and write
 *    the chunk itself.
 */
import { Rng, seedFor } from '../../../core/rng';
import { ST as ST_, IS_SOIL as IS_SOIL_, IS_SOLID as IS_SOLID_, IS_LEAVES as IS_LEAVES_, IS_FULL as IS_FULL_, withAxis } from '../common/states';
import { OctaveNoise, RawNoise2, hash3i as hash3i_ } from '../common/noise';
import { BIO as BIO_ } from './biomeSource';
import { BIOMES } from '../../biomes';
import { TreeKind, TREE_REACH, TREE_LARGE, growTree, iceSpike, boulder } from './trees';
import type { ChunkWriter } from '../common/writer';
import { isCarved, type Segment } from './carvers';
import { S } from '../../blocks/registry';

const ST = ST_;
const IS_SOIL = IS_SOIL_;
const IS_SOLID = IS_SOLID_;
const IS_LEAVES = IS_LEAVES_;
const IS_FULL = IS_FULL_;
const BIO = BIO_;
const hash3i = hash3i_;

/** What the decorator needs from the generator (pure queries). */
export interface DecorationHost {
  readonly seed: number;
  biomeAt(x: number, z: number): number;
  /** y of the top terrain block (pure); sets `groundBlock`. */
  groundAt(x: number, z: number): number;
  readonly groundBlock: number;
  /** Climate of the quart column containing the block (C, E, W, T, H). */
  climate(x: number, z: number): { C: number; H: number; T: number };
  /** True if a structure footprint covers this column (trees are not placed there). */
  structureBlocks(x: number, z: number): boolean;
}

// ------------------------------------------------------------------------------------------------
// tree tables (Minecraft 1.18-1.20 counts and weights)
// ------------------------------------------------------------------------------------------------

interface TreeConf {
  /** expected trees per chunk */
  count: number;
  kinds: [TreeKind, number][];
  /** may grow on snow blocks (grove) */
  snow?: boolean;
  /** only on high ground (wooded badlands plateau) */
  minY?: number;
}
const T = TreeKind;
const TREES: (TreeConf | undefined)[] = [];
const setT = (ids: number[], c: TreeConf) => ids.forEach((i) => (TREES[i] = c));
setT([BIO.plains, BIO.sunflower_plains], { count: 0.05, kinds: [[T.BEE_OAK, 2], [T.FANCY_OAK, 1]] });
setT([BIO.snowy_plains], { count: 0.1, kinds: [[T.SPRUCE, 1]] });
setT([BIO.swamp], { count: 2.1, kinds: [[T.SWAMP_OAK, 1]] });
setT([BIO.forest], { count: 10.1, kinds: [[T.BIRCH, 0.2], [T.FANCY_OAK, 0.08], [T.OAK, 0.72]] });
setT([BIO.flower_forest], { count: 6.1, kinds: [[T.BIRCH, 0.2], [T.FANCY_OAK, 0.08], [T.OAK, 0.72]] });
setT([BIO.birch_forest], { count: 10.1, kinds: [[T.BIRCH, 1]] });
setT([BIO.old_growth_birch_forest], { count: 10.1, kinds: [[T.TALL_BIRCH, 0.5], [T.BIRCH, 0.5]] });
setT([BIO.dark_forest], { count: 15, kinds: [[T.BROWN_MUSHROOM, 2.5], [T.RED_MUSHROOM, 5], [T.DARK_OAK, 64], [T.BIRCH, 18], [T.FANCY_OAK, 7], [T.OAK, 3.5]] });
setT([BIO.taiga, BIO.snowy_taiga], { count: 10.1, kinds: [[T.PINE, 1], [T.SPRUCE, 2]] });
setT([BIO.old_growth_pine_taiga], { count: 10.1, kinds: [[T.MEGA_SPRUCE, 0.026], [T.MEGA_PINE, 0.3], [T.PINE, 0.225], [T.SPRUCE, 0.449]] });
setT([BIO.old_growth_spruce_taiga], { count: 10.1, kinds: [[T.MEGA_SPRUCE, 0.333], [T.PINE, 0.222], [T.SPRUCE, 0.445]] });
setT([BIO.grove], { count: 10.1, kinds: [[T.PINE, 1], [T.SPRUCE, 2]], snow: true });
setT([BIO.savanna, BIO.savanna_plateau], { count: 1.1, kinds: [[T.ACACIA, 0.8], [T.OAK, 0.2]] });
setT([BIO.windswept_savanna], { count: 2.1, kinds: [[T.ACACIA, 0.8], [T.OAK, 0.2]] });
setT([BIO.jungle], { count: 50, kinds: [[T.FANCY_OAK, 0.1], [T.JUNGLE_BUSH, 0.45], [T.MEGA_JUNGLE, 0.1485], [T.JUNGLE, 0.3015]] });
setT([BIO.sparse_jungle], { count: 2.1, kinds: [[T.FANCY_OAK, 0.1], [T.JUNGLE_BUSH, 0.45], [T.JUNGLE, 0.45]] });
setT([BIO.bamboo_jungle], { count: 30, kinds: [[T.FANCY_OAK, 0.05], [T.JUNGLE_BUSH, 0.1425], [T.MEGA_JUNGLE, 0.5653], [T.JUNGLE, 0.2422]] });
setT([BIO.wooded_badlands], { count: 5.1, kinds: [[T.OAK, 1]], minY: 88 });
setT([BIO.meadow], { count: 0.03, kinds: [[T.BEE_OAK, 1], [T.FANCY_OAK, 1], [T.TALL_BIRCH, 1]] });
setT([BIO.cherry_grove], { count: 10.1, kinds: [[T.CHERRY, 1]] });
setT([BIO.windswept_hills, BIO.windswept_gravelly_hills], { count: 0.1, kinds: [[T.SPRUCE, 0.666], [T.FANCY_OAK, 0.1], [T.OAK, 0.234]] });
setT([BIO.windswept_forest], { count: 3.1, kinds: [[T.SPRUCE, 0.666], [T.FANCY_OAK, 0.1], [T.OAK, 0.234]] });
setT([BIO.mushroom_fields], { count: 1, kinds: [[T.BROWN_MUSHROOM, 1], [T.RED_MUSHROOM, 1]] });

function pickKind(c: TreeConf, roll: number): TreeKind {
  let sum = 0;
  for (const [, w] of c.kinds) sum += w;
  let acc = 0;
  for (const [k, w] of c.kinds) {
    acc += w / sum;
    if (roll < acc) return k;
  }
  return c.kinds[c.kinds.length - 1][0];
}

const MAX_ATTEMPTS = 64;
/** Flag for two-block plants returned by plantOn. */
const TALL = 1 << 20;

interface TreePlan {
  x: number;
  z: number;
  kind: TreeKind;
  seed: number;
  /** base y (first trunk block), -2 = not validated yet, -1 = invalid */
  y: number;
  snow: boolean;
  minY: number;
}

// ------------------------------------------------------------------------------------------------
// vegetation tables
// ------------------------------------------------------------------------------------------------

const TULIPS = [ST.redTulip, ST.orangeTulip, ST.whiteTulip, ST.pinkTulip];
const PLAINS_FLOWERS = [ST.dandelion, ST.poppy, ST.azureBluet, ST.oxeyeDaisy, ST.cornflower];
const DEFAULT_FLOWERS = [ST.dandelion, ST.dandelion, ST.poppy];
const FOREST_FLOWERS = [ST.dandelion, ST.poppy, ST.lilyOfTheValley];
const FLOWER_FOREST = [ST.dandelion, ST.poppy, ST.allium, ST.azureBluet, ST.redTulip, ST.orangeTulip, ST.whiteTulip, ST.pinkTulip, ST.oxeyeDaisy, ST.cornflower, ST.lilyOfTheValley];
const MEADOW_FLOWERS = [ST.allium, ST.azureBluet, ST.cornflower, ST.dandelion, ST.oxeyeDaisy, ST.poppy];
const TALL_FLOWERS = [ST.lilac, ST.roseBush, ST.peony];

const N_B = 256;
const IS_OCEAN_B = new Uint8Array(N_B);
for (const b of BIOMES) if (b.category === 'ocean') IS_OCEAN_B[b.id] = 1;
const KELP_OCEANS = new Set<number>([BIO.ocean, BIO.deep_ocean, BIO.cold_ocean, BIO.deep_cold_ocean, BIO.lukewarm_ocean, BIO.deep_lukewarm_ocean]);
const WARM_OCEANS = new Set<number>([BIO.warm_ocean, BIO.lukewarm_ocean, BIO.deep_lukewarm_ocean]);
const SAND_GROUND = new Set<number>([ST.sand, ST.redSand]);
const SUGARCANE_GROUND = new Set<number>([ST.grass, ST.dirt, ST.sand, ST.redSand, ST.podzol, ST.coarseDirt, ST.mud]);

const STONEISH = new Uint8Array(4096);
for (const s of [ST.stone, ST.deepslate, ST.granite, ST.diorite, ST.andesite, ST.tuff]) STONEISH[s >>> 4] = 1;

/** Blocks a fossil may replace (natural stone, soil, sand and ores; never air or fluids). */
const FOSSIL_REPLACEABLE = new Uint8Array(4096);
for (const s of [
  ST.stone, ST.deepslate, ST.granite, ST.diorite, ST.andesite, ST.tuff, ST.dirt, ST.coarseDirt, ST.mud, ST.clay, ST.gravel,
  ST.sand, ST.redSand, ST.sandstone, ST.redSandstone, ST.coalOre, ST.dsCoalOre, ST.ironOre, ST.dsIronOre, ST.copperOre,
  ST.dsCopperOre, ST.goldOre, ST.dsGoldOre, ST.redstoneOre, ST.dsRedstoneOre, ST.lapisOre, ST.dsLapisOre,
])
  FOSSIL_REPLACEABLE[s >>> 4] = 1;
const FOSSIL_BIOMES = new Set<number>([BIO.desert, BIO.swamp]);

/**
 * Fossil shapes in local coordinates: [u (along the body), v (across, -2..2), y, axis kind], with
 * axis kind 0 = vertical bone, 1 = along u, 2 = along v. Returns the shape and its size along u / y.
 */
function fossilShape(r: Rng): { cells: number[][]; len: number; height: number } {
  const cells: number[][] = [];
  if (r.next() < 0.5) {
    // spine with a ribcage: vertebrae at y = 3, dorsal spikes above, ribs curving down both sides
    const len = 8 + r.int(5);
    const ribFrom = 2 + r.int(2), ribTo = len - 3 - r.int(2);
    for (let u = 0; u < len; u++) {
      cells.push([u, 0, 3, 1]);
      if (u % 2 === 0 && u > 0 && u < len - 2) cells.push([u, 0, 4, 0]);
    }
    for (let u = ribFrom; u <= ribTo; u += 2) {
      const deep = u > ribFrom && u < ribTo; // the middle ribs close below the body
      for (const s of [-1, 1]) {
        cells.push([u, s, 3, 2], [u, 2 * s, 2, 0], [u, 2 * s, 1, 0]);
        if (deep) cells.push([u, s, 0, 2]);
      }
    }
    return { cells, len, height: 5 };
  }
  // skull: hollow cranium with eye sockets, a nasal ridge, upper jaw and lower jaw bars
  for (let u = 1; u <= 4; u++)
    for (let v = -2; v <= 2; v++)
      for (let y = 1; y <= 3; y++) {
        const shell = Math.abs(v) === 2 || y === 3 || u === 4 || (u === 1 && v === 0);
        if (!shell || (u === 4 && Math.abs(v) === 2 && y === 3)) continue;
        if (u === 1 && Math.abs(v) === 1 && y === 2) continue; // eye sockets
        cells.push([u, v, y, y === 3 ? 2 : 0]);
      }
  for (let v = -1; v <= 1; v++) cells.push([0, v, 1, 2]);
  for (let u = 0; u <= 3; u++) for (const v of [-1, 1]) cells.push([u, v, 0, 1]);
  return { cells, len: 5, height: 4 };
}

// ------------------------------------------------------------------------------------------------

export class Decorator {
  private readonly plans = new Map<number, TreePlan[]>();
  private readonly patchN: RawNoise2;
  private readonly flowerN: OctaveNoise;
  private readonly densityN: RawNoise2;
  private readonly bambooN: RawNoise2;
  private readonly kelpN: RawNoise2;
  private readonly tempN: RawNoise2;
  private readonly thawN: RawNoise2;
  private readonly thaw2N: RawNoise2;
  /** carver segments of the current target (3x3 box) */
  segs: Segment[] = [];

  constructor(private readonly host: DecorationHost) {
    const s = host.seed;
    this.patchN = new RawNoise2(s ^ 0x9a7c4, 1 / 24);
    this.flowerN = new OctaveNoise(s ^ 0xf10e3, 1 / 48, [1, 0.5], { sigma: 0.35 });
    this.densityN = new RawNoise2(s ^ 0xde751, 1 / 96);
    this.bambooN = new RawNoise2(s ^ 0xba3b0, 1 / 20);
    this.kelpN = new RawNoise2(s ^ 0xce1b, 1 / 40);
    this.tempN = new RawNoise2(s ^ 0x7e3b, 1 / 8);
    this.thawN = new RawNoise2(s ^ 0x7a3a, 1 / 20);
    this.thaw2N = new RawNoise2(s ^ 0x7a3b, 1 / 11);
  }

  private rnd(x: number, y: number, z: number, salt: number): number {
    return hash3i(x, y, z, this.host.seed ^ salt) / 4294967296;
  }

  // ----------------------------------------------------------------------------------------------
  // trees
  // ----------------------------------------------------------------------------------------------

  /** Candidate trees of a source chunk (positions & kinds only; cached; pure). */
  private plan(sx: number, sz: number): TreePlan[] {
    const key = (sx + 0x400000) * 0x800000 + (sz + 0x400000);
    let list = this.plans.get(key);
    if (list) return list;
    if (this.plans.size > 4000) this.plans.clear();
    list = [];
    const r = new Rng(seedFor(this.host.seed, sx, sz, 0x7ee5));
    const dn = 1 + 0.35 * this.densityN.at(sx * 16 + 8, sz * 16 + 8);
    for (let a = 0; a < MAX_ATTEMPTS; a++) {
      const lx = r.int(16), lz = r.int(16);
      const roll = r.next(), kroll = r.next();
      const seed = r.nextU32();
      const x = sx * 16 + lx, z = sz * 16 + lz;
      const conf = TREES[this.host.biomeAt(x, z)];
      if (!conf) continue;
      if (roll >= (conf.count * dn) / MAX_ATTEMPTS) continue;
      const kind = pickKind(conf, kroll);
      const sp = TREE_LARGE[kind] ? 3 : 2;
      let clash = false;
      for (const p of list) {
        const d = Math.max(Math.abs(p.x - x), Math.abs(p.z - z));
        if (d < sp || (TREE_LARGE[p.kind] && d < 3)) {
          clash = true;
          break;
        }
      }
      if (clash) continue;
      list.push({ x, z, kind, seed, y: -2, snow: !!conf.snow, minY: conf.minY ?? 0 });
    }
    this.plans.set(key, list);
    return list;
  }

  /** Validate a planned tree against the (pure) terrain; returns base y or -1. */
  private validate(p: TreePlan): number {
    if (p.y !== -2) return p.y;
    const h = this.host;
    let y = h.groundAt(p.x, p.z);
    let g = h.groundBlock;
    let ok = y >= 62 && y >= p.minY;
    if (ok) {
      const isMushroom = p.kind === T.BROWN_MUSHROOM || p.kind === T.RED_MUSHROOM;
      ok = IS_SOIL[g >>> 4] === 1 || (p.snow && (g === ST.snowBlock || g === ST.powderSnow)) || (isMushroom && g === ST.mycelium);
    }
    if (ok && (isCarved(this.segs, p.x, y, p.z) || isCarved(this.segs, p.x, y + 1, p.z))) ok = false;
    if (ok && h.structureBlocks(p.x, p.z)) ok = false;
    if (ok && TREE_LARGE[p.kind]) {
      // the other trunk columns must be roughly level ground
      for (let d = 1; d < 4 && ok; d++) {
        const yy = h.groundAt(p.x + (d & 1), p.z + (d >> 1));
        if (Math.abs(yy - y) > 2 || yy < 62) ok = false;
      }
    }
    p.y = ok ? y + 1 : -1;
    return p.y;
  }

  /**
   * Validated trees planned in a source chunk (debug/tests). `segs` must hold the carver segments of
   * a box containing the source chunk (the generator's `debugTrees` takes care of it).
   */
  plannedTrees(sx: number, sz: number): { x: number; y: number; z: number; kind: TreeKind; seed: number }[] {
    const out: { x: number; y: number; z: number; kind: TreeKind; seed: number }[] = [];
    for (const p of this.plan(sx, sz)) {
      const y = this.validate(p);
      if (y >= 0) out.push({ x: p.x, y, z: p.z, kind: p.kind, seed: p.seed });
    }
    return out;
  }

  private trees(cx: number, cz: number, w: ChunkWriter): void {
    const x0 = cx * 16, z0 = cz * 16;
    for (let sz = cz - 1; sz <= cz + 1; sz++)
      for (let sx = cx - 1; sx <= cx + 1; sx++) {
        const list = this.plan(sx, sz);
        for (const p of list) {
          const reach = TREE_REACH[p.kind];
          const big = TREE_LARGE[p.kind] ? 1 : 0;
          if (p.x + reach + big < x0 || p.x - reach > x0 + 15 || p.z + reach + big < z0 || p.z - reach > z0 + 15) continue;
          const y = this.validate(p);
          if (y < 0) continue;
          growTree(p.kind, w, p.x, y, p.z, p.seed);
        }
      }
  }

  // ----------------------------------------------------------------------------------------------
  // main entry
  // ----------------------------------------------------------------------------------------------

  decorate(cx: number, cz: number, w: ChunkWriter, top: Int16Array, colBiome: Uint8Array): void {
    this.underground(cx, cz, w, top, colBiome);
    this.trees(cx, cz, w);
    this.localFeatures(cx, cz, w, top, colBiome);
    this.vegetation(cx, cz, w, top, colBiome);
    this.freeze(cx, cz, w, colBiome);
  }

  // ----------------------------------------------------------------------------------------------
  // per-column vegetation
  // ----------------------------------------------------------------------------------------------

  private vegetation(cx: number, cz: number, w: ChunkWriter, top: Int16Array, colBiome: Uint8Array): void {
    const work = w.work;
    const x0 = cx * 16, z0 = cz * 16;
    for (let c = 0; c < 256; c++) {
      const lx = c & 15, lz = c >> 4;
      const x = x0 + lx, z = z0 + lz;
      const biome = colBiome[c];
      let y = top[c];
      if (y < 1 || y > 250) continue;
      // terrain top may have been carved: walk down to the actual ground
      while (y > 1 && work[(y << 8) | c] === 0) y--;
      const gi = (y << 8) | c;
      const g = work[gi];
      const above = work[gi + 256];
      const r = this.rnd(x, y, z, 0x7e9e7);
      // --------------------------------------------------------- underwater
      if (above === ST.water) {
        let wt = y + 1;
        while (wt < 255 && work[(wt << 8) | c] === ST.water) wt++;
        const depth = wt - (y + 1);
        if (IS_OCEAN_B[biome] || biome === BIO.river || biome === BIO.swamp) {
          if (KELP_OCEANS.has(biome) && depth >= 4 && this.kelpN.at(x, z) > 0.1 && r < 0.4) {
            const n = 1 + Math.floor(this.rnd(x, 1, z, 0xce17) * Math.min(14, depth - 2));
            for (let k = 1; k <= n; k++) work[gi + (k << 8)] = ST.kelp;
          } else if (r < (biome === BIO.river ? 0.25 : WARM_OCEANS.has(biome) ? 0.45 : 0.3) && depth >= 2) {
            work[gi + 256] = ST.seagrass;
          } else if (WARM_OCEANS.has(biome) && r > 0.985 && depth >= 2) {
            work[gi + 256] = ST.seaPickle;
          }
        }
        if (biome === BIO.swamp && depth <= 3 && wt <= 63 && this.rnd(x, 2, z, 0x111) < 0.06 && work[(wt << 8) | c] === 0) work[(wt << 8) | c] = ST.lilyPad;
        continue;
      }
      if (above !== 0) continue;
      const space2 = work[gi + 512] === 0;
      // --------------------------------------------------------- sugar cane next to water
      if (y === 62 && SUGARCANE_GROUND.has(g) && r < 0.25) {
        if ((lx > 0 && work[gi - 1] === ST.water) || (lx < 15 && work[gi + 1] === ST.water) || (lz > 0 && work[gi - 16] === ST.water) || (lz < 15 && work[gi + 16] === ST.water)) {
          const n = 1 + Math.floor(this.rnd(x, 3, z, 0x5ca) * 3) + (this.rnd(x, 4, z, 0x5cb) < 0.3 ? 1 : 0);
          for (let k = 1; k <= n; k++) if (work[gi + (k << 8)] === 0) work[gi + (k << 8)] = ST.sugarCane;
          continue;
        }
      }
      // --------------------------------------------------------- deserts & badlands
      if (SAND_GROUND.has(g)) {
        const desert = biome === BIO.desert || biome === BIO.badlands || biome === BIO.eroded_badlands || biome === BIO.wooded_badlands;
        if (!desert) continue;
        const cactusP = biome === BIO.desert ? 0.004 : 0.006;
        if (r < cactusP && this.cactusFree(work, lx, y, lz)) {
          const n = 1 + Math.floor(this.rnd(x, 5, z, 0xcac) * 3);
          for (let k = 1; k <= n; k++) work[gi + (k << 8)] = ST.cactus;
          continue;
        }
        if (r > (biome === BIO.desert ? 0.992 : 0.975)) work[gi + 256] = ST.deadBush;
        continue;
      }
      if (g === ST.mycelium) {
        if (r < 0.012) work[gi + 256] = r < 0.006 ? ST.brownMushroom : ST.redMushroom;
        continue;
      }
      if (!(g === ST.grass || g === ST.podzol || g === ST.coarseDirt || g === ST.dirt || g === ST.mossBlock)) {
        if (g === ST.snowBlock && biome === BIO.grove && r < 0.01) work[gi + 256] = ST.fern;
        continue;
      }
      const p = this.plantOn(x, y, z, gi, biome, r, space2, work);
      if (p !== 0) {
        if (p & TALL) {
          const lo = p & 0xffff;
          work[gi + 256] = lo;
          work[gi + 512] = lo | 8;
        } else work[gi + 256] = p;
      }
    }
  }

  /**
   * Plant for a grass-like ground block; returns the state to place above (0 = nothing), with
   * TALL set for two-block plants (lower half state; the upper half is state | 8).
   */
  private plantOn(x: number, y: number, z: number, gi: number, biome: number, r: number, space2: boolean, work: Uint16Array): number {
    const patch = this.patchN.at(x, z);
    const fl = this.flowerN.noise2(x, z);
    const r2 = this.rnd(x, y, z, 0x2f10);
    switch (biome) {
      case BIO.plains:
      case BIO.sunflower_plains: {
        if (biome === BIO.sunflower_plains && r < 0.035 && space2) return space2 ? (ST.sunflower) | TALL : ST.shortGrass;
        if (r < 0.022) return fl < -0.25 ? TULIPS[Math.floor(r2 * 4)] : PLAINS_FLOWERS[Math.floor(r2 * PLAINS_FLOWERS.length)];
        if (r < 0.06 + Math.max(0, patch) * 0.12) return space2 ? (ST.tallGrassLo) | TALL : ST.shortGrass;
        if (r < 0.42 + patch * 0.15) return ST.shortGrass;
        if (r > 0.9995) return ST.pumpkin;
        return 0;
      }
      case BIO.meadow: {
        if (r < 0.1 + Math.max(0, fl) * 0.25) return MEADOW_FLOWERS[Math.floor(((fl + 1) * 3 + r2 * 2) % MEADOW_FLOWERS.length)];
        if (r < 0.22) return space2 ? (ST.tallGrassLo) | TALL : ST.shortGrass;
        if (r < 0.6) return ST.shortGrass;
        return 0;
      }
      case BIO.flower_forest: {
        if (r < 0.28) {
          const idx = Math.floor(((fl + 1) * 0.5 * FLOWER_FOREST.length + r2 * 1.2) % FLOWER_FOREST.length);
          return FLOWER_FOREST[Math.max(0, idx)];
        }
        if (r < 0.31 && space2) return space2 ? (TALL_FLOWERS[Math.floor(r2 * 3)]) | TALL : ST.shortGrass;
        if (r < 0.36) return ST.shortGrass;
        return 0;
      }
      case BIO.forest:
      case BIO.birch_forest:
      case BIO.old_growth_birch_forest:
      case BIO.dark_forest: {
        if (r < 0.006 && space2) return space2 ? (TALL_FLOWERS[Math.floor(r2 * 3)]) | TALL : ST.shortGrass;
        if (r < 0.018) return FOREST_FLOWERS[Math.floor(r2 * FOREST_FLOWERS.length)];
        if (biome === BIO.dark_forest && r < 0.03) return r2 < 0.5 ? ST.brownMushroom : ST.redMushroom;
        if (r < 0.035) return space2 ? (ST.tallGrassLo) | TALL : ST.shortGrass;
        if (r < 0.14 + patch * 0.05) return ST.shortGrass;
        if (r > 0.9996) return ST.pumpkin;
        return 0;
      }
      case BIO.taiga:
      case BIO.snowy_taiga:
      case BIO.old_growth_pine_taiga:
      case BIO.old_growth_spruce_taiga: {
        const og = biome === BIO.old_growth_pine_taiga || biome === BIO.old_growth_spruce_taiga;
        const snowy = biome === BIO.snowy_taiga;
        if (r < (snowy ? 0.0005 : og ? 0.006 : 0.004) && patch > 0) return ST.sweetBerryBush;
        if (og && r > 0.985) return r2 < 0.5 ? ST.brownMushroom : ST.redMushroom;
        if (og && r > 0.98) return ST.deadBush;
        if (r < (snowy ? 0.01 : 0.03)) return space2 ? (ST.largeFernLo) | TALL : ST.shortGrass;
        if (r < (snowy ? 0.06 : og ? 0.22 : 0.16)) return ST.fern;
        if (r < (snowy ? 0.08 : og ? 0.28 : 0.22)) return ST.shortGrass;
        if (!snowy && r < 0.226) return DEFAULT_FLOWERS[Math.floor(r2 * 3)];
        if (r > 0.9995) return ST.pumpkin;
        return 0;
      }
      case BIO.savanna:
      case BIO.savanna_plateau:
      case BIO.windswept_savanna: {
        if (r < 0.1 + Math.max(0, patch) * 0.1) return space2 ? (ST.tallGrassLo) | TALL : ST.shortGrass;
        if (r < 0.45) return ST.shortGrass;
        if (r < 0.456) return DEFAULT_FLOWERS[Math.floor(r2 * 3)];
        return 0;
      }
      case BIO.jungle:
      case BIO.sparse_jungle:
      case BIO.bamboo_jungle: {
        const bambooP = biome === BIO.bamboo_jungle ? 0.12 + Math.max(0, this.bambooN.at(x, z)) * 0.4 : biome === BIO.jungle ? 0.008 : 0;
        if (r < bambooP) {
          const n = 4 + Math.floor(r2 * 12);
          if (biome === BIO.bamboo_jungle && this.bambooN.at(x, z) > 0.2) work[gi] = ST.podzol;
          for (let k = 1; k <= n; k++) {
            if (work[gi + (k << 8)] !== 0) break;
            work[gi + (k << 8)] = ST.bamboo;
          }
          return 0;
        }
        if (r > 0.996 && biome !== BIO.bamboo_jungle) return ST.melon;
        if (r < bambooP + 0.03) return space2 ? (ST.largeFernLo) | TALL : ST.shortGrass;
        if (r < bambooP + 0.1) return ST.fern;
        if (r < bambooP + 0.3) return ST.shortGrass;
        if (r < bambooP + 0.31) return DEFAULT_FLOWERS[Math.floor(r2 * 3)];
        return 0;
      }
      case BIO.swamp: {
        if (r < 0.012) return ST.blueOrchid;
        if (r < 0.022) return r2 < 0.5 ? ST.brownMushroom : ST.redMushroom;
        if (r < 0.1) return ST.shortGrass;
        return 0;
      }
      case BIO.cherry_grove: {
        if (r < 0.03) return r2 < 0.7 ? ST.pinkTulip : ST.lilyOfTheValley;
        if (r < 0.3) return ST.shortGrass;
        return 0;
      }
      case BIO.windswept_hills:
      case BIO.windswept_forest:
      case BIO.windswept_gravelly_hills:
      case BIO.wooded_badlands:
      case BIO.stony_shore:
      case BIO.river:
      case BIO.beach: {
        if (r < 0.12) return ST.shortGrass;
        if (r < 0.125) return DEFAULT_FLOWERS[Math.floor(r2 * 3)];
        return 0;
      }
      case BIO.snowy_plains:
      case BIO.ice_spikes:
      case BIO.snowy_slopes:
      case BIO.jagged_peaks:
      case BIO.frozen_peaks:
      case BIO.grove:
        return 0;
      default: {
        if (IS_OCEAN_B[biome]) {
          return r < 0.08 ? ST.shortGrass : 0;
        }
        if (r < 0.15) return ST.shortGrass;
        if (r < 0.16) return DEFAULT_FLOWERS[Math.floor(r2 * 3)];
      }
    }
    return 0;
  }

  /** Cactus survival: no solid blocks horizontally next to the cactus column (inside the chunk). */
  private cactusFree(work: Uint16Array, lx: number, y: number, lz: number): boolean {
    for (let k = 1; k <= 3; k++) {
      const i = ((y + k) << 8) | (lz << 4) | lx;
      if ((lx > 0 && work[i - 1] !== 0) || (lx < 15 && work[i + 1] !== 0) || (lz > 0 && work[i - 16] !== 0) || (lz < 15 && work[i + 16] !== 0)) return false;
    }
    // keep cacti off chunk borders so neighbours never touch across chunks
    return lx > 0 && lx < 15 && lz > 0 && lz < 15;
  }

  // ----------------------------------------------------------------------------------------------
  // small local features (fully inside one chunk)
  // ----------------------------------------------------------------------------------------------

  private localFeatures(cx: number, cz: number, w: ChunkWriter, top: Int16Array, colBiome: Uint8Array): void {
    const work = w.work;
    const r = new Rng(seedFor(this.host.seed, cx, cz, 0x10ca1));
    const x0 = cx * 16, z0 = cz * 16;
    // boulders (old growth taiga), ice spikes, fallen-ish features
    for (let a = 0; a < 3; a++) {
      const lx = 3 + r.int(10), lz = 3 + r.int(10);
      const roll = r.next();
      const seed = r.nextU32();
      const c = (lz << 4) | lx;
      const b = colBiome[c];
      const y = top[c];
      if (y < 62) continue;
      if ((b === BIO.old_growth_pine_taiga || b === BIO.old_growth_spruce_taiga) && roll < 0.55) {
        const g = work[(y << 8) | c];
        if (IS_SOIL[g >>> 4] && work[((y + 1) << 8) | c] !== ST.spruceLog) boulder(w, x0 + lx, y + 1, z0 + lz, seed);
      } else if (b === BIO.ice_spikes) {
        const g = work[(y << 8) | c];
        if (g === ST.snowBlock || g === ST.grass || g === ST.dirt) iceSpike(w, x0 + lx, y + 1, z0 + lz, seed);
      }
    }
    // ice patches in ice spikes biome
    if (colBiome[136] === BIO.ice_spikes && r.next() < 0.5) {
      const lx = 4 + r.int(8), lz = 4 + r.int(8), rad = 2 + r.int(2);
      for (let dx = -rad; dx <= rad; dx++)
        for (let dz = -rad; dz <= rad; dz++) {
          if (dx * dx + dz * dz > rad * rad) continue;
          const c = ((lz + dz) << 4) | (lx + dx);
          const y = top[c];
          const i = (y << 8) | c;
          if (work[i] === ST.snowBlock || work[i] === ST.grass || work[i] === ST.dirt) work[i] = ST.packedIce;
        }
    }
  }

  // ----------------------------------------------------------------------------------------------
  // underground decoration (local)
  // ----------------------------------------------------------------------------------------------

  private underground(cx: number, cz: number, w: ChunkWriter, top: Int16Array, colBiome: Uint8Array): void {
    const work = w.work;
    const r = new Rng(seedFor(this.host.seed, cx, cz, 0x0dec0));
    const x0 = cx * 16, z0 = cz * 16;
    const lichen = S('glow_lichen', 0);
    // glow lichen on cave walls
    for (let a = 0; a < 48; a++) {
      const lx = r.int(16), lz = r.int(16), y = 6 + r.int(52);
      const c = (lz << 4) | lx;
      if (y >= top[c] - 6) continue;
      const i = (y << 8) | c;
      if (work[i] !== 0) continue;
      let face = 0;
      if (lx < 15 && STONEISH[work[i + 1] >>> 4]) face |= 8;
      if (lx > 0 && STONEISH[work[i - 1] >>> 4]) face |= 2;
      if (lz > 0 && STONEISH[work[i - 16] >>> 4]) face |= 4;
      if (lz < 15 && STONEISH[work[i + 16] >>> 4]) face |= 1;
      if (face) work[i] = lichen | face;
    }
    // springs: a fluid source in a cave wall with exactly one open side
    for (let a = 0; a < 14; a++) {
      const lava = a >= 10;
      const lx = 1 + r.int(14), lz = 1 + r.int(14);
      const y = lava ? 8 + r.int(30) : 10 + r.int(110);
      const c = (lz << 4) | lx;
      if (y >= top[c] - 2) continue;
      const i = (y << 8) | c;
      if (!STONEISH[work[i] >>> 4] || !STONEISH[work[i + 256] >>> 4] || !STONEISH[work[i - 256] >>> 4]) continue;
      let open = 0, solid = 0;
      for (const d of [1, -1, 16, -16]) {
        const s = work[i + d];
        if (s === 0) open++;
        else if (STONEISH[s >>> 4]) solid++;
      }
      if (open === 1 && solid === 3) work[i] = lava ? ST.lava : ST.water;
    }
    // dripstone / lush cave patches by climate
    const cl = this.host.climate(x0 + 8, z0 + 8);
    const dripstone = cl.C > 0.62 && cl.H < 0.1;
    const lush = !dripstone && cl.H > 0.45 && cl.C > -0.1;
    if (dripstone || lush) {
      for (let c = 0; c < 256; c++) {
        const yTop = Math.min(top[c] - 8, 100);
        for (let y = 6; y < yTop; y++) {
          const i = (y << 8) | c;
          const s = work[i];
          if (!STONEISH[s >>> 4]) continue;
          const up = work[i + 256], dn = work[i - 256];
          const floor = up === 0, ceil = dn === 0;
          if (!floor && !ceil) continue;
          const h = this.rnd(x0 + (c & 15), y, z0 + (c >> 4), 0xd51);
          if (dripstone) {
            if (h < 0.55) work[i] = ST.dripstoneBlock;
          } else if (h < 0.75) {
            work[i] = ST.mossBlock;
            if (floor && h < 0.25 && y + 1 < 255) work[i + 256] = h < 0.05 ? ST.fern : ST.shortGrass;
          }
        }
      }
    }
    this.dungeons(cx, cz, w, top, r);
    this.geodes(cx, cz, w);
    this.fossils(cx, cz, w, top, colBiome);
  }

  /**
   * Fossils (Minecraft `FossilFeature`, deserts and swamps): 1 in 64 chunks gets an upper fossil
   * (y 20 .. surface - 12; 10 % of its bones are coal ore) and 1 in 64 a lower one (y 2..11 in the
   * deepslate; 10 % deepslate diamond ore). A spine with a ribcage or a skull, any heading; 10 % of
   * the bones are missing; only natural stone / soil / sand is replaced, and a fossil with more than
   * 4 of its 8 box corners in open space (caves) is skipped. Kept inside the chunk.
   */
  private fossils(cx: number, cz: number, w: ChunkWriter, top: Int16Array, colBiome: Uint8Array): void {
    if (!FOSSIL_BIOMES.has(colBiome[(8 << 4) | 8])) return;
    const r = new Rng(seedFor(this.host.seed, cx, cz, 0xf0551));
    for (let pass = 0; pass < 2; pass++) {
      const roll = r.int(64);
      const seed = r.nextU32();
      if (roll === 0) this.fossil(cx, cz, w, top, pass === 1, seed);
    }
  }

  private fossil(cx: number, cz: number, w: ChunkWriter, top: Int16Array, lower: boolean, seed: number): void {
    const work = w.work;
    const r = new Rng(seed);
    const { cells, len, height } = fossilShape(r);
    const alongX = r.next() < 0.5, flip = r.next() < 0.5;
    const sx = alongX ? len : 5, sz = alongX ? 5 : len;
    const lx0 = r.int(17 - sx), lz0 = r.int(17 - sz);
    let minTop = 255;
    for (let z = lz0; z < lz0 + sz; z++) for (let x = lx0; x < lx0 + sx; x++) minTop = Math.min(minTop, top[(z << 4) | x]);
    let y0: number;
    if (lower) y0 = 2 + r.int(10);
    else {
      const yMax = minTop - 12 - height;
      if (yMax < 20) return;
      y0 = 20 + r.int(yMax - 19);
    }
    // Minecraft's empty-corner rule (air and fluids count as empty)
    let open = 0;
    for (const x of [lx0, lx0 + sx - 1])
      for (const z of [lz0, lz0 + sz - 1])
        for (const y of [y0, y0 + height - 1]) if (!IS_SOLID[work[(y << 8) | (z << 4) | x] >>> 4]) open++;
    if (open > 4) return;
    const x0 = cx * 16, z0 = cz * 16;
    for (const [u, v, y, kind] of cells) {
      const uu = flip ? len - 1 - u : u;
      const lx = alongX ? lx0 + uu : lx0 + v + 2, lz = alongX ? lz0 + v + 2 : lz0 + uu;
      const wy = y0 + y;
      const i = (wy << 8) | (lz << 4) | lx;
      const old = work[i];
      if (!FOSSIL_REPLACEABLE[old >>> 4]) continue;
      const h = hash3i(x0 + lx, wy, z0 + lz, this.host.seed ^ 0xf0552);
      if ((h & 1023) < 102) continue; // 10 % rot
      if (((h >>> 10) & 1023) < 102) {
        const deep = old === ST.deepslate || old === ST.tuff;
        work[i] = lower ? (deep ? ST.dsDiamondOre : ST.diamondOre) : deep ? ST.dsCoalOre : ST.coalOre;
      } else work[i] = withAxis(ST.boneBlock, kind === 0 ? 0 : (kind === 1) === alongX ? 1 : 2);
    }
  }

  /** Minecraft monster rooms, kept inside one chunk (rooms are at most 9x9 including walls). */
  private dungeons(cx: number, cz: number, w: ChunkWriter, top: Int16Array, r: Rng): void {
    const work = w.work;
    const x0 = cx * 16, z0 = cz * 16;
    for (let a = 0; a < 10; a++) {
      const rx = 2 + r.int(2), rz = 2 + r.int(2);
      const ox = 4 + r.int(8), oz = 4 + r.int(8);
      const oy = 8 + r.int(50);
      const mobRoll = r.next();
      const seed = r.nextU32();
      if (ox - rx - 1 < 0 || ox + rx + 1 > 15 || oz - rz - 1 < 0 || oz + rz + 1 > 15) continue;
      if (oy + 6 >= top[(oz << 4) | ox] - 4) continue;
      // validity: solid floor & ceiling, 1..5 openings on the walls at floor level
      let ok = true, holes = 0;
      for (let x = ox - rx - 1; x <= ox + rx + 1 && ok; x++)
        for (let z = oz - rz - 1; z <= oz + rz + 1 && ok; z++) {
          const c = (z << 4) | x;
          const fl = work[((oy - 1) << 8) | c], ce = work[((oy + 4) << 8) | c];
          if (!IS_SOLID[fl >>> 4] || fl === ST.water || fl === ST.lava || !IS_SOLID[ce >>> 4] || ce === ST.water || ce === ST.lava) ok = false;
          const wall = x === ox - rx - 1 || x === ox + rx + 1 || z === oz - rz - 1 || z === oz + rz + 1;
          if (wall && work[(oy << 8) | c] === 0 && work[((oy + 1) << 8) | c] === 0) holes++;
        }
      if (!ok || holes < 1 || holes > 5) continue;
      const rr = new Rng(seed);
      for (let x = ox - rx - 1; x <= ox + rx + 1; x++)
        for (let y = oy + 3; y >= oy - 1; y--)
          for (let z = oz - rz - 1; z <= oz + rz + 1; z++) {
            const c = (z << 4) | x, i = (y << 8) | c;
            const interior = x !== ox - rx - 1 && y !== oy - 1 && z !== oz - rz - 1 && x !== ox + rx + 1 && z !== oz + rz + 1;
            if (interior) {
              work[i] = 0;
            } else if (y >= 0 && !IS_SOLID[work[i - 256] >>> 4]) {
              work[i] = 0;
            } else if (IS_SOLID[work[i] >>> 4] && work[i] !== ST.water && work[i] !== ST.lava) {
              work[i] = y === oy - 1 && rr.int(4) !== 0 ? ST.mossyCobblestone : ST.cobblestone;
            }
          }
      // chests
      let chests = 0;
      for (let k = 0; k < 2; k++) {
        for (let tries = 0; tries < 3; tries++) {
          const x = ox + rr.int(rx * 2 + 1) - rx, z = oz + rr.int(rz * 2 + 1) - rz;
          const c = (z << 4) | x, i = (oy << 8) | c;
          if (work[i] !== 0) continue;
          let solid = 0, face = 0;
          if (IS_SOLID[work[i - 1] >>> 4]) { solid++; face = 3; }
          if (IS_SOLID[work[i + 1] >>> 4]) { solid++; face = 1; }
          if (IS_SOLID[work[i - 16] >>> 4]) { solid++; face = 0; }
          if (IS_SOLID[work[i + 16] >>> 4]) { solid++; face = 2; }
          if (solid !== 1) continue;
          work[i] = ST.chest | face;
          w.blockEntity(x0 + x, oy, z0 + z, { type: 'chest', loot: 'dungeon' });
          chests++;
          break;
        }
      }
      const spi = (oy << 8) | (oz << 4) | ox;
      work[spi] = ST.spawner;
      const mob = mobRoll < 0.25 ? 'skeleton' : mobRoll < 0.75 ? 'zombie' : 'spider';
      w.blockEntity(x0 + ox, oy, z0 + oz, { type: 'spawner', mob });
      void chests;
    }
  }

  /** Amethyst geodes (rare, ~1 in 24 chunks), evaluated from the 3x3 neighbourhood. */
  private geodes(cx: number, cz: number, w: ChunkWriter): void {
    for (let sz = cz - 1; sz <= cz + 1; sz++)
      for (let sx = cx - 1; sx <= cx + 1; sx++) {
        const r = new Rng(seedFor(this.host.seed, sx, sz, 0x9e0de));
        if (r.int(24) !== 0) continue;
        // origin = minimum corner; the geode body lies within origin + [-3, 14]
        const gx = sx * 16 + r.int(16) - 5, gz = sz * 16 + r.int(16) - 5, gy = 6 + r.int(25);
        const seed = r.nextU32();
        if (!w.intersects(gx - 3, gz - 3, gx + 14, gz + 14)) continue;
        // only well underground (pure terrain check at the geode centre)
        if (this.host.groundAt(gx + 5, gz + 5) < gy + 22) continue;
        this.geode(w, gx, gy, gz, seed);
      }
  }

  /** Port of Minecraft GeodeFeature (amethyst geode layers, crack, clusters). */
  private geode(w: ChunkWriter, ox: number, oy: number, oz: number, seed: number): void {
    const r = new Rng(seed);
    const k = 3 + r.int(2);
    const d0 = k / 6;
    const d1 = 1 / Math.sqrt(1.7), d2 = 1 / Math.sqrt(2.2 + d0), d3 = 1 / Math.sqrt(3.2 + d0), d4 = 1 / Math.sqrt(4.2 + d0);
    const d5 = 1 / Math.sqrt(2 + r.next() / 2 + (k > 3 ? d0 : 0));
    const crack = r.next() < 0.95;
    const pts: number[] = [];
    for (let i = 0; i < k; i++) pts.push(ox + 4 + r.int(3), oy + 4 + r.int(3), oz + 4 + r.int(3), 1 + r.int(2));
    const cr: number[] = [];
    if (crack) {
      const v = r.int(4), j2 = k * 2 + 1;
      const cx = v === 0 || v === 2 ? j2 : 0, cz = v === 1 || v === 2 ? j2 : 0;
      for (const dy of [7, 5, 1]) cr.push(ox + cx, oy + dy, oz + cz);
    }
    const basalt = ST.smoothBasalt || ST.basalt;
    const budding: number[] = [];
    for (let x = ox - 3; x <= ox + 14; x++)
      for (let z = oz - 3; z <= oz + 14; z++) {
        if (!w.inside(x, z)) continue;
        for (let y = Math.max(5, oy - 3); y <= oy + 14; y++) {
          const nz = (this.rnd(x, y, z, 0x9e0) - 0.5) * 0.1;
          let d6 = 0;
          for (let i = 0; i < pts.length; i += 4) {
            const dx = x - pts[i], dy = y - pts[i + 1], dz = z - pts[i + 2];
            d6 += 1 / Math.sqrt(dx * dx + dy * dy + dz * dz + pts[i + 3]) + nz;
          }
          if (d6 < d4) continue;
          let d7 = 0;
          for (let i = 0; i < cr.length; i += 3) {
            const dx = x - cr[i], dy = y - cr[i + 1], dz = z - cr[i + 2];
            d7 += 1 / Math.sqrt(dx * dx + dy * dy + dz * dz + 2) + nz;
          }
          const cur = w.get(x, y, z);
          if (cur === ST.bedrock) continue;
          if (crack && d7 >= d5 && d6 < d1) w.set(x, y, z, 0);
          else if (d6 >= d1) w.set(x, y, z, 0);
          else if (d6 >= d2) {
            const bud = this.rnd(x, y, z, 0xbd) < 0.083;
            w.set(x, y, z, bud ? ST.buddingAmethyst : ST.amethystBlock);
            if (bud && this.rnd(x, y, z, 0xc1) < 0.35) budding.push(x, y, z);
          } else if (d6 >= d3) w.set(x, y, z, ST.calcite);
          else if (cur !== 0 && cur !== ST.water && cur !== ST.lava) w.set(x, y, z, basalt);
        }
      }
    // amethyst clusters on budding amethyst facing the hollow
    for (let i = 0; i < budding.length; i += 3) {
      const x = budding[i], y = budding[i + 1], z = budding[i + 2];
      if (w.get(x, y + 1, z) === 0) w.set(x, y + 1, z, ST.amethystCluster);
      else if (w.get(x, y - 1, z) === 0) w.set(x, y - 1, z, ST.amethystCluster);
    }
  }

  // ----------------------------------------------------------------------------------------------
  // freeze pass: ice on cold water, snow layers on top of everything in cold places
  // ----------------------------------------------------------------------------------------------

  private freeze(cx: number, cz: number, w: ChunkWriter, colBiome: Uint8Array): void {
    const work = w.work;
    const x0 = cx * 16, z0 = cz * 16;
    for (let c = 0; c < 256; c++) {
      const biome = colBiome[c];
      const bt = BIOMES[biome].temperature;
      if (bt > 1.0) continue; // hot biomes never freeze
      const x = x0 + (c & 15), z = z0 + (c >> 4);
      let y = 255;
      while (y > 0 && work[(y << 8) | c] === 0) y--;
      if (y <= 0 || y >= 254) continue;
      // Minecraft height-adjusted temperature (+ the FROZEN modifier's open-water patches)
      let t = bt - (y > 80 ? ((this.tempN.at(x, z) * 8 + y - 80) * 0.05) / 30 : 0);
      if ((biome === BIO.frozen_ocean || biome === BIO.deep_frozen_ocean) && this.thawN.at(x, z) * 7 + this.tempN.at(x, z) < 0.3 && this.thaw2N.at(x, z) < 0.8) t = 0.2;
      if (t >= 0.15) continue;
      const i = (y << 8) | c;
      const s = work[i];
      if (s === ST.water) {
        work[i] = ST.ice;
        continue;
      }
      const id = s >>> 4;
      if (IS_FULL[id] || IS_LEAVES[id]) {
        if (s === ST.ice || s === ST.packedIce || s === ST.blueIce || s === ST.lava) continue;
        work[i + 256] = ST.snowLayer;
      }
    }
  }
}
