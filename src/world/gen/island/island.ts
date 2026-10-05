/**
 * Tropical island world type: one large island (about 900 blocks across) in an endless warm ocean.
 *
 * Everything is a pure function of (seed, x, z), so chunks generate in any order:
 *
 *   shore distance  B(x,z) = island radius - warped distance to the centre + coastline noise
 *                   (blocks inland, < 0 at sea), max'd with a few small sand cays offshore and
 *                   cut by a sheltered lagoon bay.
 *   sea floor       lagoon (1..8 deep) -> barrier reef crest just under the surface (with
 *                   channels) -> drop-off -> deep ocean floor with dunes.
 *   land            sand beach (rocky headlands with cliffs in places) -> palm grove -> rolling
 *                   jungle hills -> a central volcano with ridged flanks and a crater lake.
 *   biomes          tropical_ocean / tropical_lagoon / tropical_beach / stony_shore / palm_grove /
 *                   jungle / bamboo_jungle / sparse_jungle / volcanic_peak.
 *   decoration      palms, jungle trees and bushes, bamboo, ferns, flowers, melons, sugar cane,
 *                   driftwood; seagrass, kelp, sea pickles and coral reefs (coral heads, coral
 *                   plants and fans); caves and ores inland; a castaway camp and a wrecked sloop on
 *                   the beach where the player wakes up.
 */
import type { WorldGenerator } from '../generator';
import type { GeneratedChunk } from '../../chunk';
import { ST as ST_, IS_SOLID as IS_SOLID_, IS_LEAVES as IS_LEAVES_, IS_LOG as IS_LOG_, withAxis } from '../common/states';
import { OctaveNoise, hashF as hashF_ } from '../common/noise';
import { blendBiomeColors, finishChunk } from '../common/output';
import { ChunkWriter } from '../common/writer';
import { Carvers, segmentContains, type Segment } from '../overworld/carvers';
import { OrePlacer } from '../overworld/ores';
import { growTree, TreeKind, TREE_REACH } from '../overworld/trees';
import { biomeId } from '../../biomes';
import { S } from '../../blocks/registry';
import { Rng, seedFor } from '../../../core/rng';
import { palm, PALM_REACH } from './palms';
import { castawayCamp, wreck, WRECK_REACH } from './camp';

const ST = ST_;
const IS_SOLID = IS_SOLID_;
const hashF = hashF_;

export const SEA = 63; // water fills y <= 62
const ISLAND_R = 440;
/** Beach width, palm grove width, reef crest band (blocks from the shore). */
const BEACH_W = 30;
const GROVE_W = 95;
const REEF_IN = 60, REEF_OUT = 80;

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const IB = {
  ocean: biomeId('tropical_ocean'),
  lagoon: biomeId('tropical_lagoon'),
  beach: biomeId('tropical_beach'),
  stony: biomeId('stony_shore'),
  grove: biomeId('palm_grove'),
  jungle: biomeId('jungle'),
  bamboo: biomeId('bamboo_jungle'),
  sparse: biomeId('sparse_jungle'),
  peak: biomeId('volcanic_peak'),
};

const CORAL_BLOCKS = ['tube', 'brain', 'bubble', 'fire', 'horn'].map((c) => S(`${c}_coral_block`));
const CORAL_PLANTS = ['tube', 'brain', 'bubble', 'fire', 'horn'].map((c) => S(`${c}_coral`));
const CORAL_FANS = ['tube', 'brain', 'bubble', 'fire', 'horn'].map((c) => S(`${c}_coral_fan`));
const BLACKSTONE = S('blackstone');
const BASALT = S('basalt', 0);
const SEA_PICKLE = (n: number) => S('sea_pickle', n);

/** Per-column terrain sample. */
export interface Col {
  /** Shore distance (blocks; < 0 at sea). */
  B: number;
  /** Surface height (top solid block = floor(h)). */
  h: number;
  /** Rocky-coast factor 0..1. */
  rock: number;
  /** Distance to the volcano centre. */
  dv: number;
  /** In the lagoon bay (0..1). */
  bay: number;
  /** Not in a reef channel (0..1). */
  reef: number;
  biome: number;
}

export class IslandShape {
  readonly vx: number;
  readonly vz: number;
  readonly bayX: number;
  readonly bayZ: number;
  readonly islets: { x: number; z: number; r: number }[] = [];
  readonly spawnAng: number;
  readonly lakeY: number;
  private readonly warpX: OctaveNoise;
  private readonly warpZ: OctaveNoise;
  private readonly coastN: OctaveNoise;
  private readonly hillN: OctaveNoise;
  private readonly ridgeN: OctaveNoise;
  private readonly floorN: OctaveNoise;
  private readonly rockN: OctaveNoise;
  private readonly gapN: OctaveNoise;
  private readonly detailN: OctaveNoise;
  readonly bambooN: OctaveNoise;
  readonly patchN: OctaveNoise;

  constructor(readonly seed: number) {
    this.warpX = new OctaveNoise(seed ^ 0x1501, 1 / 650, [1, 0.5], { sigma: 1 });
    this.warpZ = new OctaveNoise(seed ^ 0x1502, 1 / 650, [1, 0.5], { sigma: 1 });
    this.coastN = new OctaveNoise(seed ^ 0x1503, 1 / 230, [1, 0.55, 0.3, 0.15], { sigma: 0.5 });
    this.hillN = new OctaveNoise(seed ^ 0x1504, 1 / 170, [1, 0.5, 0.25, 0.12], { sigma: 0.5 });
    this.ridgeN = new OctaveNoise(seed ^ 0x1505, 1 / 60, [1, 0.5, 0.25], { sigma: 0.5 });
    this.floorN = new OctaveNoise(seed ^ 0x1506, 1 / 110, [1, 0.5, 0.25], { sigma: 0.5 });
    this.rockN = new OctaveNoise(seed ^ 0x1507, 1 / 260, [1, 0.5], { sigma: 0.5 });
    this.gapN = new OctaveNoise(seed ^ 0x1508, 1 / 80, [1, 0.4], { sigma: 0.5 });
    this.detailN = new OctaveNoise(seed ^ 0x1509, 1 / 22, [1, 0.5], { sigma: 0.5 });
    this.bambooN = new OctaveNoise(seed ^ 0x150a, 1 / 90, [1, 0.5], { sigma: 0.5 });
    this.patchN = new OctaveNoise(seed ^ 0x150b, 1 / 30, [1, 0.5], { sigma: 0.5 });
    const r = new Rng(seed ^ 0x15a7d);
    const bayAng = r.float(0, Math.PI * 2);
    this.bayX = Math.cos(bayAng) * ISLAND_R * 0.92;
    this.bayZ = Math.sin(bayAng) * ISLAND_R * 0.92;
    // the volcano sits off-centre, away from the bay
    const vAng = bayAng + Math.PI + r.float(-0.6, 0.6), vD = r.float(40, 110);
    this.vx = Math.cos(vAng) * vD;
    this.vz = Math.sin(vAng) * vD;
    // a few sand cays offshore
    const n = 3 + r.int(3);
    for (let i = 0; i < n; i++) {
      const a = r.float(0, Math.PI * 2), d = r.float(ISLAND_R + 180, ISLAND_R + 700);
      this.islets.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: r.float(18, 46) });
    }
    // wake up on the beach beside the lagoon bay
    this.spawnAng = bayAng + (r.chance(0.5) ? 1 : -1) * r.float(0.42, 0.6);
    const hc = this.rawHeight(this.vx, this.vz);
    this.lakeY = Math.floor(hc) + 5;
  }

  /** Shore distance without the bay cut, plus the bay mask. */
  shore(x: number, z: number): { B: number; bay: number } {
    const wx = x + this.warpX.noise2(x, z) * 70, wz = z + this.warpZ.noise2(x, z) * 70;
    const c = this.coastN.noise2(x, z);
    let B = ISLAND_R - Math.hypot(wx, wz * 1.12) + c * 95;
    for (const i of this.islets) B = Math.max(B, i.r - Math.hypot(x - i.x, z - i.z) + c * 14);
    // the lagoon bay: an irregular bite out of the coast, its floor kept at lagoon depth where
    // the island was (open sea around it stays as deep as it was)
    const db = Math.hypot(x - this.bayX, z - this.bayZ) * (1 + c * 0.6);
    const bay = Math.exp(-(db / 105) * (db / 105));
    if (bay > 0.02) {
      const cut = B - 190 * bay;
      B = B > -REEF_IN + 4 ? Math.max(cut, -REEF_IN + 4) : cut;
    }
    return { B, bay };
  }

  /** Surface height without the crater lake (used for the lake level). */
  rawHeight(x: number, z: number): number {
    return this.sample(x, z, null).h;
  }

  sample(x: number, z: number, out: Col | null): Col {
    const { B, bay } = this.shore(x, z);
    const rock = smooth(0.18, 0.42, this.rockN.noise2(x, z)) * (bay > 0.2 ? 0 : 1);
    const fl = this.floorN.noise2(x, z);
    let h: number;
    let reef = 0;
    if (B >= 0) {
      // beach -> inland hills
      const beach = SEA + 0.1 + 2.4 * smooth(0, BEACH_W, B);
      const t = Math.max(0, B - BEACH_W);
      const rise = 1 - Math.exp(-t / 90);
      const hill = this.hillN.noise2(x, z);
      let land = beach + rise * (24 * (0.55 + 0.45 * (hill + 0.5)) + hill * 6) + this.detailN.noise2(x, z) * 1.4 * smooth(0, 30, B);
      // rocky headlands: cliffs straight out of the water
      if (rock > 0) land = land + (Math.max(land, SEA + 2 + 15 * smooth(-1, 9, B) + hill * 5) - land) * rock;
      h = land;
    } else {
      const d = -B;
      if (d < REEF_IN) h = SEA - 1.2 - 6.5 * smooth(0, 40, d) + fl * 1.2;
      else if (d < 260) h = SEA - 7.7 - 30 * smooth(REEF_OUT - 8, 260, d) + fl * 1.5;
      else h = SEA - 37.7 - 14 * smooth(260, 900, d) + fl * 3;
      // barrier reef crest just under the surface, broken by channels
      if (d > REEF_IN - 6 && d < REEF_OUT + 4 && bay < 0.3) {
        const c = 1 - Math.abs((d - (REEF_IN + REEF_OUT) / 2) / ((REEF_OUT - REEF_IN) / 2 + 4));
        reef = smooth(0.32, 0.12, this.gapN.noise2(x, z));
        if (c > 0 && reef > 0) h = Math.max(h, SEA - 1.6 - (1 - c) * 6 + (reef - 1) * 5 + fl);
      }
      // rocky coast: steeper, deeper underwater slope
      if (rock > 0) h -= rock * 4 * smooth(0, 12, d);
    }
    // the volcano
    const dvx = x - this.vx, dvz = z - this.vz;
    const dv = Math.hypot(dvx, dvz);
    if (B > -10 && dv < 420) {
      const onLand = smooth(-10, 70, B);
      let cone = 100 * Math.exp(-Math.pow(dv / 150, 1.45));
      cone *= 1 + 0.25 * this.ridgeN.noise2(x, z) * smooth(30, 160, dv);
      const crater = dv < 34 ? 24 * Math.pow(1 - dv / 34, 1.2) : 0;
      h += (cone - crater) * onLand;
    }
    h = Math.max(4, Math.min(240, h));
    const o = out ?? ({} as Col);
    o.B = B; o.h = h; o.rock = rock; o.dv = dv; o.bay = bay; o.reef = reef;
    o.biome = this.biomeFor(x, z, o);
    return o;
  }

  private biomeFor(x: number, z: number, c: Col): number {
    if (c.B < 0) return -c.B < REEF_OUT ? IB.lagoon : IB.ocean;
    if (c.h > SEA + 60) return IB.peak;
    if (c.B < BEACH_W) return c.rock > 0.5 ? IB.stony : IB.beach;
    if (c.B < GROVE_W) return c.rock > 0.6 ? IB.sparse : IB.grove;
    if (this.bambooN.noise2(x, z) > 0.32) return IB.bamboo;
    if (c.h > SEA + 40) return IB.sparse;
    return IB.jungle;
  }

  biomeAt(x: number, z: number): number {
    return this.sample(x, z, _col).biome;
  }
  heightAt(x: number, z: number): number {
    return Math.floor(this.sample(x, z, _col).h);
  }
}
const _col = {} as Col;

/** A good camp site on the beach along the spawn bearing (pure). */
export function campSite(shape: IslandShape): { x: number; y: number; z: number; ax: number; az: number } {
  const ax = Math.cos(shape.spawnAng), az = Math.sin(shape.spawnAng);
  const c = {} as Col;
  // walk in from the open sea to the upper beach (dry, flat, not rocky)
  for (let a = 0; a < 24; a++) {
    const ang = shape.spawnAng + (a % 2 ? 1 : -1) * Math.ceil(a / 2) * 0.05;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    for (let d = ISLAND_R + 260; d > 40; d -= 2) {
      const x = Math.round(dx * d), z = Math.round(dz * d);
      shape.sample(x, z, c);
      if (c.B < 9) continue;
      if (c.B > 16 || c.rock > 0.15 || c.h > SEA + 4) break;
      return { x, y: Math.floor(c.h) + 1, z, ax: dx, az: dz };
    }
  }
  const x = Math.round(ax * (ISLAND_R - 12)), z = Math.round(az * (ISLAND_R - 12));
  return { x, y: shape.heightAt(x, z) + 1, z, ax, az };
}

/** Tree/feature kinds planned per source chunk. */
const enum Plant { Palm, YoungPalm, Jungle, MegaJungle, Bush, Boulder }

export class IslandGenerator implements WorldGenerator {
  readonly dimension = 'overworld' as const;
  readonly shape: IslandShape;
  readonly camp: { x: number; y: number; z: number; ax: number; az: number };
  private readonly carvers: Carvers;
  private readonly ores: OrePlacer;
  private readonly writer = new ChunkWriter();
  private readonly work = new Uint16Array(65536);
  /** Padded (20 x 20) column samples of the chunk being generated. */
  private readonly cols: Col[] = [];
  private segs: Segment[] = [];

  constructor(readonly seed: number) {
    this.shape = new IslandShape(seed);
    this.carvers = new Carvers(seed);
    this.ores = new OrePlacer(seed, (x, z) => this.shape.biomeAt(x, z));
    for (let i = 0; i < 400; i++) this.cols.push({} as Col);
    this.camp = campSite(this.shape);
  }

  biomeAt(x: number, z: number): number {
    return this.shape.biomeAt(Math.floor(x), Math.floor(z));
  }
  surfaceHeightAt(x: number, z: number): number {
    return this.shape.heightAt(Math.floor(x), Math.floor(z));
  }
  locateStructure(type: string): { x: number; y: number; z: number } | null {
    if (type === 'shipwreck' || type === 'camp' || type === 'castaway_camp') return { x: this.camp.x, y: this.camp.y, z: this.camp.z };
    return null;
  }

  findSpawn(): { x: number; y: number; z: number; yaw: number } {
    const c = this.camp;
    // beside the camp, a few blocks inland
    const sx = Math.round(c.x - c.ax * 3 + c.az * 3), sz = Math.round(c.z - c.az * 3 - c.ax * 3);
    const cx = Math.floor(sx / 16), cz = Math.floor(sz / 16);
    const ch = this.generate(cx, cz);
    const get = (lx: number, y: number, lz: number) => {
      const s = ch.blocks[y >> 4];
      return s ? s[((y & 15) << 8) | (lz << 4) | lx] : 0;
    };
    let best: { x: number; y: number; z: number } | null = null, bd = Infinity;
    for (let c2 = 0; c2 < 256; c2++) {
      const lx = c2 & 15, lz = c2 >> 4;
      const y = ch.heightmap[c2] - 1;
      if (y < SEA) continue;
      const s = get(lx, y, lz);
      const id = s >>> 4;
      if (!IS_SOLID[id] || s === ST.water || IS_LEAVES_[id] || IS_LOG_[id]) continue;
      const f1 = get(lx, y + 1, lz), f2 = get(lx, y + 2, lz);
      if ((f1 && IS_SOLID[f1 >>> 4]) || (f2 && IS_SOLID[f2 >>> 4]) || f1 === ST.water) continue;
      const d = Math.hypot(cx * 16 + lx - sx, cz * 16 + lz - sz);
      if (d < bd) { bd = d; best = { x: cx * 16 + lx + 0.5, y: y + 1, z: cz * 16 + lz + 0.5 }; }
    }
    // face the sea: the camp, the wreck and the open ocean in the first view
    const yaw = Math.atan2(-c.ax, -c.az);
    return { ...(best ?? { x: sx + 0.5, y: Math.max(SEA, this.shape.heightAt(sx, sz) + 1), z: sz + 0.5 }), yaw };
  }

  // ------------------------------------------------------------------------------------------
  generate(cx: number, cz: number): GeneratedChunk {
    const work = this.work;
    work.fill(0);
    const x0 = cx * 16, z0 = cz * 16;
    // padded column samples (2 blocks around: biome blending and slopes)
    for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) this.shape.sample(x0 - 2 + i, z0 - 2 + j, this.cols[j * 20 + i]);
    this.terrain(cx, cz);
    this.segs = this.carvers.segmentsFor({ x0: x0 - 16, z0: z0 - 16, x1: x0 + 31, z1: z0 + 31 });
    this.carve(cx, cz);
    let maxTop = 0;
    for (let c = 0; c < 256; c++) maxTop = Math.max(maxTop, Math.floor(this.col(c & 15, c >> 4).h));
    this.ores.place(cx, cz, work, maxTop);
    const w = this.writer;
    w.reset(cx, cz, work);
    this.decorateColumns(cx, cz, w);
    this.plantTrees(cx, cz, w);
    const c = this.camp;
    if (w.intersects(c.x - WRECK_REACH - 40, c.z - WRECK_REACH - 40, c.x + WRECK_REACH + 40, c.z + WRECK_REACH + 40)) {
      castawayCamp(w, c, this.seed, (x, z) => this.shape.heightAt(x, z));
      wreck(w, c, this.seed, (x, z) => this.shape.heightAt(x, z));
    }
    const biomes = new Uint8Array(256);
    const colors = blendBiomeColors(cx, cz, 2, (x, z) => {
      const i = x - x0 + 2, k = z - z0 + 2;
      return i >= 0 && i < 20 && k >= 0 && k < 20 ? this.cols[k * 20 + i].biome : this.shape.biomeAt(x, z);
    }, biomes);
    return finishChunk(cx, cz, work, biomes, colors, w.blockEntities, w.entities);
  }

  private col(lx: number, lz: number): Col {
    return this.cols[(lz + 2) * 20 + lx + 2];
  }

  private slope(lx: number, lz: number): number {
    const h = (i: number, k: number) => this.cols[(k + 2) * 20 + i + 2].h;
    return Math.max(Math.abs(h(lx + 1, lz) - h(lx - 1, lz)), Math.abs(h(lx, lz + 1) - h(lx, lz - 1))) / 2;
  }

  private terrain(cx: number, cz: number) {
    const work = this.work, seed = this.seed, sh = this.shape;
    const x0 = cx * 16, z0 = cz * 16;
    for (let c = 0; c < 256; c++) {
      const lx = c & 15, lz = c >> 4;
      const wx = x0 + lx, wz = z0 + lz;
      const k = this.col(lx, lz);
      const top = Math.floor(k.h);
      const slope = this.slope(lx, lz);
      // base rock
      for (let y = 0; y <= top; y++) {
        const i = (y << 8) | c;
        work[i] = y === 0 || (y < 5 && hashF(wx, y, wz, seed ^ 0xbed70c) < (5 - y) / 5) ? ST.bedrock
          : y < 8 || (y < 16 && hashF(wx, y, wz, seed ^ 0xdee95) < (16 - y) / 8) ? ST.deepslate : ST.stone;
      }
      for (let y = top + 1; y < SEA; y++) work[(y << 8) | c] = ST.water;
      // crater lake
      if (k.dv < 30 && top < sh.lakeY && k.B > 0) for (let y = top + 1; y <= sh.lakeY; y++) work[(y << 8) | c] = ST.water;
      // surface layers
      const rnd = hashF(wx, 7, wz, seed ^ 0x5a1f);
      const depthN = 3 + Math.floor(rnd * 2.5);
      const put = (d: number, st: number) => { const y = top - d; if (y > 0) work[(y << 8) | c] = st; };
      const patch = sh.patchN.noise2(wx, wz);
      const b = k.biome;
      if (k.B < 0) {
        // sea floor
        const dsea = -k.B;
        let surf = ST.sand;
        if (k.reef > 0.4 && dsea > REEF_IN - 4 && dsea < REEF_OUT + 2 && top > SEA - 9) surf = CORAL_BLOCKS[Math.floor(hashF(wx, 3, wz, seed ^ 0xc0a1) * 5)];
        else if (k.rock > 0.5) surf = patch > 0.1 ? ST.gravel : ST.stone;
        else if (dsea > 120) surf = patch > 0.3 ? ST.gravel : patch < -0.35 ? ST.clay : ST.sand;
        else if (dsea < REEF_IN && patch > 0.42 && k.bay < 0.5) surf = CORAL_BLOCKS[Math.floor(hashF(wx, 4, wz, seed ^ 0xc0a2) * 5)];
        put(0, surf);
        for (let d = 1; d <= depthN; d++) put(d, surf === ST.stone || surf === ST.gravel ? ST.gravel : ST.sand);
        for (let d = depthN + 1; d <= depthN + 3; d++) put(d, ST.sandstone);
        continue;
      }
      if (b === IB.beach || (b === IB.grove && k.B < BEACH_W + 10 && rnd < (BEACH_W + 10 - k.B) / 10)) {
        put(0, ST.sand);
        for (let d = 1; d <= depthN; d++) put(d, ST.sand);
        for (let d = depthN + 1; d <= depthN + 3; d++) put(d, ST.sandstone);
        continue;
      }
      if (b === IB.stony || slope > 2.2 && k.h < SEA + 40) {
        // rocky shore and cliff faces
        const v = hashF(wx, top, wz, seed ^ 0x570e);
        put(0, v < 0.55 ? ST.stone : v < 0.8 ? ST.andesite : ST.gravel);
        continue;
      }
      if (b === IB.peak || k.h > SEA + 52) {
        // volcanic slopes: grass gives way to scree, tuff and basalt; black rock at the crater
        const hi = k.h - (SEA + 52);
        const bare = hi > 16 || slope > 1.4 || hi > 6 + patch * 10;
        if (!bare) { put(0, ST.grass); put(1, ST.dirt); put(2, ST.dirt); continue; }
        const band = Math.floor(k.h / 3 + patch * 2) % 4;
        let surf = band === 0 ? ST.tuff : band === 1 ? BASALT : band === 2 ? ST.stone : ST.andesite;
        if (rnd < 0.12) surf = ST.gravel;
        // the crater: black glassy rock streaked with obsidian, glowing magma in the cracks
        const rim = 30 + patch * 8;
        if (k.dv < rim) surf = rnd < 0.06 ? ST.magma : rnd < 0.2 ? ST.obsidian : rnd < 0.6 ? BLACKSTONE : BASALT;
        put(0, surf);
        put(1, k.dv < rim ? BLACKSTONE : ST.tuff);
        continue;
      }
      // grove / jungle soil
      const pod = (b === IB.jungle || b === IB.bamboo) && patch > 0.3;
      const coarse = b === IB.sparse && patch > 0.35;
      put(0, pod ? ST.podzol : coarse ? ST.coarseDirt : ST.grass);
      for (let d = 1; d <= depthN; d++) put(d, ST.dirt);
    }
  }

  private carve(cx: number, cz: number) {
    const work = this.work;
    const x0 = cx * 16, z0 = cz * 16;
    for (const s of this.segs) {
      if (s.maxX < x0 || s.minX > x0 + 15 || s.maxZ < z0 || s.minZ > z0 + 15) continue;
      const xa = Math.max(s.minX, x0), xb = Math.min(s.maxX, x0 + 15);
      const za = Math.max(s.minZ, z0), zb = Math.min(s.maxZ, z0 + 15);
      for (let x = xa; x <= xb; x++)
        for (let z = za; z <= zb; z++) {
          const lx = x - x0, lz = z - z0;
          const k = this.col(lx, lz);
          // caves stay under the island, never under the sea or the beach
          if (k.B < BEACH_W + 6) continue;
          const roof = Math.floor(k.h) - 4;
          for (let y = Math.min(s.maxY, roof); y >= s.minY; y--) {
            if (!segmentContains(s, x, y, z)) continue;
            const i = (y << 8) | (lz << 4) | lx;
            const st = work[i];
            if (st !== ST.stone && st !== ST.deepslate && st !== ST.dirt) continue;
            if (work[i + 256] === ST.water) continue;
            work[i] = y < 8 ? ST.lava : 0;
          }
        }
    }
  }

  /** Small per-column decoration (only this chunk's columns). */
  private decorateColumns(cx: number, cz: number, w: ChunkWriter) {
    const work = this.work, seed = this.seed, sh = this.shape;
    const x0 = cx * 16, z0 = cz * 16;
    for (let c = 0; c < 256; c++) {
      const lx = c & 15, lz = c >> 4;
      const wx = x0 + lx, wz = z0 + lz;
      const k = this.col(lx, lz);
      const top = Math.floor(k.h);
      const ground = work[(top << 8) | c];
      const above = top + 1;
      if (above > 254) continue;
      if (work[(above << 8) | c] !== 0 && work[(above << 8) | c] !== ST.water) continue;
      const r = hashF(wx, 11, wz, seed ^ 0xdec0);
      const r2 = hashF(wx, 12, wz, seed ^ 0xdec1);
      const set = (y: number, st: number) => { work[(y << 8) | c] = st; };
      if (k.B < 0 || (k.dv < 30 && top < sh.lakeY)) {
        // underwater life
        const depth = (k.B < 0 ? SEA - 1 : sh.lakeY) - top;
        if (depth < 1) continue;
        const coralGround = CORAL_BLOCKS.includes(ground);
        if (coralGround) {
          // coral heads: grow the mound, then plants and fans on top
          let y = above;
          if (r2 < 0.35 && depth > 3) { set(y, CORAL_BLOCKS[Math.floor(r * 5)]); y++; if (r2 < 0.12 && depth > 4) { set(y, CORAL_BLOCKS[Math.floor(r2 * 40) % 5]); y++; } }
          if (y < SEA - 1 || k.B > 0) {
            if (r < 0.55) set(y, (r < 0.3 ? CORAL_PLANTS : CORAL_FANS)[Math.floor(hashF(wx, 13, wz, seed) * 5)]);
            else if (r < 0.62) set(y, SEA_PICKLE(Math.floor(r2 * 4)));
          }
          continue;
        }
        if (ground !== ST.sand && ground !== ST.gravel && ground !== ST.clay) continue;
        const dsea = -k.B;
        if (dsea > REEF_OUT + 10 && depth > 6 && sh.patchN.noise2(wx * 0.5, wz * 0.5) > 0.15 && r < 0.45) {
          // kelp forest outside the reef
          const n = Math.max(1, Math.min(depth - 2, 3 + Math.floor(r2 * (depth - 3))));
          for (let i = 0; i < n; i++) set(above + i, ST.kelp);
          continue;
        }
        if (r < (dsea < REEF_IN ? 0.32 : 0.18) * (0.5 + Math.max(0, sh.patchN.noise2(wx + 300, wz))) ) { set(above, ST.seagrass); continue; }
        if (r > 0.992 && depth < 10) set(above, SEA_PICKLE(Math.floor(r2 * 4)));
        continue;
      }
      if (top < SEA) continue;
      const b = k.biome;
      if (ground === ST.sand) {
        // beach: sugar cane by the water, the odd dead bush; driftwood logs on the strand
        if (k.B < 5 && r < 0.035 && this.nextToWater(work, lx, top, lz)) {
          const n = 1 + Math.floor(r2 * 3);
          for (let i = 0; i < n; i++) set(above + i, ST.sugarCane);
        } else if (k.B > 6 && r > 0.9975) set(above, ST.deadBush);
        else if (k.B > 2 && k.B < 14 && r > 0.9955 && r2 < 0.5) {
          // driftwood: a log lying along x or z (kept inside this chunk)
          const along = r2 < 0.25, len = 2 + Math.floor(r2 * 8) % 3;
          for (let i = 0; i < len; i++) {
            const ax = along ? lx + i : lx, az = along ? lz : lz + i;
            if (ax > 15 || az > 15) break;
            const t = Math.floor(this.col(ax, az).h);
            if (Math.abs(t - top) > 0) break;
            const j = ((top + 1) << 8) | (az << 4) | ax;
            if (work[j] === 0) work[j] = withAxis(ST.jungleLog, along ? 1 : 2);
          }
        }
        continue;
      }
      if (ground === ST.grass || ground === ST.podzol || ground === ST.coarseDirt) {
        if (b === IB.bamboo && sh.bambooN.noise2(wx * 3, wz * 3) > 0.05 && r < 0.4) {
          const n = 4 + Math.floor(r2 * 10);
          for (let i = 0; i < n && above + i < 250; i++) set(above + i, ST.bamboo);
          continue;
        }
        const jungle = b === IB.jungle || b === IB.bamboo || b === IB.sparse;
        if (jungle) {
          if (r < 0.2) set(above, ST.shortGrass);
          else if (r < 0.34) set(above, ST.fern);
          else if (r < 0.42 && above + 1 < 250) { set(above, ST.largeFernLo); set(above + 1, ST.largeFernHi); }
          else if (r < 0.45 && above + 1 < 250) { set(above, ST.tallGrassLo); set(above + 1, ST.tallGrassHi); }
          else if (r < 0.455 && ground === ST.grass) set(above, ST.melon);
          else if (r < 0.47) set(above, r2 < 0.5 ? ST.blueOrchid : r2 < 0.8 ? ST.poppy : ST.allium);
        } else if (b === IB.grove) {
          if (r < 0.22) set(above, ST.shortGrass);
          else if (r < 0.26) set(above, ST.fern);
          else if (r < 0.285) set(above, r2 < 0.4 ? ST.dandelion : r2 < 0.7 ? ST.azureBluet : ST.oxeyeDaisy);
          else if (r < 0.3 && above + 1 < 250) { set(above, ST.tallGrassLo); set(above + 1, ST.tallGrassHi); }
        } else if (b === IB.peak) {
          if (r < 0.12) set(above, ST.shortGrass);
          else if (r < 0.15) set(above, ST.fern);
        }
      }
    }
  }

  private nextToWater(work: Uint16Array, lx: number, y: number, lz: number): boolean {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = lx + dx, z = lz + dz;
      if (x < 0 || x > 15 || z < 0 || z > 15) continue;
      if (work[(y << 8) | (z << 4) | x] === ST.water) return true;
    }
    return false;
  }

  /** Trees from the 3x3 source chunks around (cx, cz), written where they reach this chunk. */
  private plantTrees(cx: number, cz: number, w: ChunkWriter) {
    const sh = this.shape, camp = this.camp;
    const c = {} as Col;
    for (let sz = cz - 1; sz <= cz + 1; sz++)
      for (let sx = cx - 1; sx <= cx + 1; sx++) {
        const r = new Rng(seedFor(this.seed, sx, sz, 0x9a1f));
        const tries = 26;
        for (let t = 0; t < tries; t++) {
          const x = sx * 16 + r.int(16), z = sz * 16 + r.int(16);
          const roll = r.next(), roll2 = r.next(), tseed = r.nextU32();
          sh.sample(x, z, c);
          const y = Math.floor(c.h);
          if (y < SEA || c.B < 3) continue;
          if (Math.hypot(x - camp.x, z - camp.z) < 9) continue;
          if (c.dv < 30 && y < sh.lakeY + 1) continue;
          let kind: Plant | -1 = -1;
          const b = c.biome;
          if (b === IB.beach) { if (c.B > 6 && roll < 0.045) kind = roll2 < 0.2 ? Plant.YoungPalm : Plant.Palm; }
          else if (b === IB.grove) { if (roll < 0.2) kind = roll2 < 0.18 ? Plant.YoungPalm : roll2 < 0.92 ? Plant.Palm : Plant.Bush; }
          else if (b === IB.jungle) {
            if (roll < 0.62) kind = roll2 < 0.07 ? Plant.MegaJungle : roll2 < 0.55 ? Plant.Jungle : roll2 < 0.62 ? Plant.Palm : Plant.Bush;
          } else if (b === IB.bamboo) { if (roll < 0.3) kind = roll2 < 0.25 ? Plant.Jungle : Plant.Bush; }
          else if (b === IB.sparse) { if (roll < 0.18) kind = roll2 < 0.4 ? Plant.Jungle : roll2 < 0.6 ? Plant.Palm : Plant.Bush; }
          else if (b === IB.peak) { if (roll < 0.05 && c.h < SEA + 70) kind = Plant.Bush; }
          else if (b === IB.stony) { if (roll < 0.01) kind = Plant.Boulder; }
          if (kind === -1) continue;
          const reach = kind === Plant.Palm || kind === Plant.YoungPalm ? PALM_REACH : kind === Plant.MegaJungle ? TREE_REACH[TreeKind.MEGA_JUNGLE] : kind === Plant.Jungle ? TREE_REACH[TreeKind.JUNGLE] : 4;
          if (!w.intersects(x - reach, z - reach, x + reach + 1, z + reach + 1)) continue;
          // only on dry, natural ground (not inside this chunk's carved caves)
          if (w.inside(x, z)) {
            const g = w.get(x, y, z);
            if (g !== ST.grass && g !== ST.sand && g !== ST.podzol && g !== ST.coarseDirt && g !== ST.dirt) continue;
            const a = w.get(x, y + 1, z);
            if (a !== 0 && a !== ST.shortGrass && a !== ST.fern && a !== ST.tallGrassLo && a !== ST.largeFernLo) continue;
          }
          switch (kind) {
            case Plant.Palm: palm(w, x, y + 1, z, tseed); break;
            case Plant.YoungPalm: palm(w, x, y + 1, z, tseed, true); break;
            case Plant.Jungle: growTree(TreeKind.JUNGLE, w, x, y + 1, z, tseed); break;
            case Plant.MegaJungle: growTree(TreeKind.MEGA_JUNGLE, w, x, y + 1, z, tseed); break;
            case Plant.Bush: growTree(TreeKind.JUNGLE_BUSH, w, x, y + 1, z, tseed); break;
            case Plant.Boulder: {
              const rr = new Rng(tseed);
              const rad = 1 + rr.int(2);
              for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) for (let dy = 0; dy <= rad; dy++)
                if (dx * dx + dz * dz + dy * dy * 1.6 <= rad * rad + 0.5) w.set(x + dx, y + 1 + dy, z + dz, rr.chance(0.7) ? ST.stone : ST.andesite);
              break;
            }
          }
        }
      }
  }
}

