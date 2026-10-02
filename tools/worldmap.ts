/**
 * World generation visual check.
 *
 *   npx tsx tools/worldmap.ts --seed 123 --size 1024 --out /tmp/map.png [--x 0 --z 0] [--dims overworld,nether,end]
 *
 * Options: --x/--z map centre; --section <len> cross-section length; --scale <n> down-scales the
 * top-down maps (e.g. --size 4096 --scale 4); --slices 10,40 horizontal underground slices;
 * --iso "x,z,size[,dim];..." isometric close-ups of small areas.
 *
 * Writes (next to --out):
 *   <out>                 top-down overworld map: block colours (biome-tinted), hill shading, water depth
 *   <out>_biomes.png      flat biome map
 *   <out>_section.png     vertical cross-section along X at the centre z (blocks coloured by type)
 *   <out>_section_z.png   vertical cross-section along Z at the centre x
 *   <out>_slice_y<N>.png  horizontal overworld slices at the heights given by --slices (e.g. 10,40)
 *   <out>_nether.png      Nether: horizontal slice at y=40 (left) and a vertical section (right)
 *   <out>_end.png         End: top-down of the main island (left) and a vertical section (right)
 *   <out>_iso_<x>_<z>[_dim].png  isometric close-ups requested with --iso
 * Prints biome statistics and generation timings. PNG encoding uses node:zlib only.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { createGenerator } from '../src/world/gen/index';
import type { WorldGenerator } from '../src/world/gen/generator';
import type { GeneratedChunk } from '../src/world/chunk';
import { BLOCKS } from '../src/world/blocks/registry';
import { BIOMES } from '../src/world/biomes';

// ------------------------------------------------------------------------------------------------
// args
// ------------------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
};
const seed = Number(arg('seed', '123'));
const size = Number(arg('size', '1024'));
const out = arg('out', '/tmp/map.png');
const cxw = Number(arg('x', '0'));
const czw = Number(arg('z', '0'));
const dims = arg('dims', 'overworld,nether,end').split(',');
const sectionLen = Number(arg('section', String(Math.min(size, 768))));
/** Output down-scaling factor for the top-down maps (e.g. --scale 4 renders a 4096-block area into 1024 px). */
const scale = Math.max(1, Number(arg('scale', '1')));
const base = out.replace(/\.png$/i, '');
/** Horizontal overworld slices (caves, ores, ore veins), e.g. --slices 10,40. */
const slices = arg('slices', '').split(',').filter((v) => v.trim() !== '').map((v) => Math.max(0, Math.min(255, Math.floor(Number(v)))));

// ------------------------------------------------------------------------------------------------
// PNG
// ------------------------------------------------------------------------------------------------
const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c >>> 0;
}
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
class Image {
  readonly px: Uint8Array;
  constructor(readonly w: number, readonly h: number) {
    this.px = new Uint8Array(w * h * 3);
  }
  set(x: number, y: number, rgb: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 3;
    this.px[o] = (rgb >> 16) & 255;
    this.px[o + 1] = (rgb >> 8) & 255;
    this.px[o + 2] = rgb & 255;
  }
  save(path: string) {
    const { w, h } = this;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) {
      raw[y * (w * 3 + 1)] = 0;
      Buffer.from(this.px.buffer, this.px.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw, { level: 6 })), pngChunk('IEND', new Uint8Array(0))]));
    console.log('wrote', path, `${w}x${h}`);
  }
}

// ------------------------------------------------------------------------------------------------
// colours
// ------------------------------------------------------------------------------------------------
const NAMED: Record<string, number> = {
  stone: 0x7d7d7d, granite: 0x9a6b56, diorite: 0xc4c4c6, andesite: 0x888889, deepslate: 0x4d4d52, tuff: 0x6c6d66, calcite: 0xdfe0dc,
  bedrock: 0x2b2b2b, grass_block: 0x7fb238, dirt: 0x8b6343, coarse_dirt: 0x77553b, podzol: 0x6a4b28, mycelium: 0x6f6369, mud: 0x3c3a3d,
  sand: 0xdbcf8e, red_sand: 0xbe6621, sandstone: 0xd8cb8b, red_sandstone: 0xb5621f, gravel: 0x857f7c, clay: 0xa0a6b3,
  snow: 0xfafafa, snow_block: 0xf0fbfb, powder_snow: 0xf8fdfd, ice: 0x91b8f8, packed_ice: 0x8db4f5, blue_ice: 0x74a8fd,
  water: 0x3f76e4, lava: 0xd85a13, obsidian: 0x14121d, crying_obsidian: 0x2a0b55,
  cobblestone: 0x7a7a7a, mossy_cobblestone: 0x6e7d5b, moss_block: 0x596e2d,
  terracotta: 0x985e43, white_terracotta: 0xd1b1a1, orange_terracotta: 0xa15325, yellow_terracotta: 0xba8523, brown_terracotta: 0x4d3323,
  red_terracotta: 0x8f3d2e, light_gray_terracotta: 0x876a61,
  coal_ore: 0x2a2a2a, iron_ore: 0xd8af93, copper_ore: 0xe0754a, gold_ore: 0xfcee4b, redstone_ore: 0xff0000, lapis_ore: 0x1d47bd,
  diamond_ore: 0x5decf5, emerald_ore: 0x17dd62,
  deepslate_coal_ore: 0x202020, deepslate_iron_ore: 0xcfa088, deepslate_copper_ore: 0xd06d43, deepslate_gold_ore: 0xf0dc3c,
  deepslate_redstone_ore: 0xee0000, deepslate_lapis_ore: 0x1a3fae, deepslate_diamond_ore: 0x4fdce6, deepslate_emerald_ore: 0x11c055,
  oak_log: 0x6b5132, spruce_log: 0x3a2717, birch_log: 0xd7d3c7, jungle_log: 0x56461f, acacia_log: 0x67615a, dark_oak_log: 0x3c2e19, cherry_log: 0x3b1f22,
  cherry_leaves: 0xe8a5c5, short_grass: 0x7fb238, fern: 0x7fb238, tall_grass: 0x7fb238, large_fern: 0x7fb238,
  dead_bush: 0x8a6431, cactus: 0x55822c, sugar_cane: 0x8bbf55, pumpkin: 0xc47619, melon: 0x7a9a28, bamboo: 0x5d8b2a,
  kelp: 0x3c8a2a, seagrass: 0x3c8a2a, lily_pad: 0x208030, vine: 0x3f7a1e, sweet_berry_bush: 0x3a5e2a,
  dandelion: 0xf5d53a, poppy: 0xd62a2a, blue_orchid: 0x2aa5d6, allium: 0xb76de0, azure_bluet: 0xe6f0f0, red_tulip: 0xd8352a,
  orange_tulip: 0xe57a2a, white_tulip: 0xeeeeee, pink_tulip: 0xe8a0c8, oxeye_daisy: 0xf2f2e0, cornflower: 0x4a6be0, lily_of_the_valley: 0xf6f6f6,
  sunflower: 0xf3c52b, lilac: 0xc49bd8, rose_bush: 0xc5292c, peony: 0xe7b0d7, brown_mushroom: 0x9a7356, red_mushroom: 0xd03030,
  mushroom_stem: 0xc7c2b4, brown_mushroom_block: 0x956f51, red_mushroom_block: 0xc52e2b,
  glow_lichen: 0x6f8f80, dripstone_block: 0x86705c, amethyst_block: 0x8562c2, budding_amethyst: 0x8a5fc8, smooth_basalt: 0x454547, amethyst_cluster: 0xa47fe0,
  spawner: 0x1f3a4a, chest: 0xa2732f, cobweb: 0xe0e0e0,
  netherrack: 0x6f3232, soul_sand: 0x51402f, soul_soil: 0x4b392b, basalt: 0x4c4c51, blackstone: 0x2a2328, glowstone: 0xf9d49c,
  crimson_nylium: 0x861b1b, warped_nylium: 0x2b7265, crimson_stem: 0x7d3a52, warped_stem: 0x3a6e6c, nether_wart_block: 0x770c0d,
  warped_wart_block: 0x167e86, shroomlight: 0xf09a4e, crimson_roots: 0x8c1a1a, warped_roots: 0x14b4a0, crimson_fungus: 0x9c2b2b,
  warped_fungus: 0x14a4a0, weeping_vines: 0x8a1515, twisting_vines: 0x14a490, magma_block: 0x8e3f13, nether_quartz_ore: 0xd8c8c0,
  nether_gold_ore: 0xd8a030, ancient_debris: 0x5e4239, bone_block: 0xe3dfc9, fire: 0xffa000, soul_fire: 0x30d0e0, gilded_blackstone: 0x50403a,
  end_stone: 0xdbde9e, chorus_plant: 0x5e3f5e, chorus_flower: 0x9a7a9a, iron_bars: 0x9a9a9a, torch: 0xffd060, end_portal_frame: 0x3a6a5a,
  mossy_stone_bricks: 0x6f7a62, stone_bricks: 0x7a7a7a, cracked_stone_bricks: 0x707070, sandstone_slab: 0xd8cb8b, cut_sandstone: 0xd8cb8b,
  smooth_sandstone: 0xe0d496, gold_block: 0xf5d634, cave_air: 0x000000, infested_stone: 0x7d7d7d,
  raw_iron_block: 0xa6876b, raw_copper_block: 0x9a6a4f,
};
const FOLIAGE_TINTED = new Set(['oak_leaves', 'jungle_leaves', 'acacia_leaves', 'dark_oak_leaves', 'vine']);
const GRASS_TINTED = new Set(['grass_block', 'short_grass', 'fern', 'tall_grass', 'large_fern', 'sugar_cane']);
const BLOCK_RGB = new Uint32Array(4096);
for (const b of BLOCKS) {
  let c = NAMED[b.name];
  if (c === undefined) {
    if (b.name.endsWith('_leaves')) c = b.name === 'spruce_leaves' ? 0x619961 : b.name === 'birch_leaves' ? 0x80a755 : 0x48b518;
    else if (b.name.endsWith('_terracotta')) c = 0x985e43;
    else c = b.mapColor ?? 0x808080;
  }
  BLOCK_RGB[b.id] = c;
}
const id = (name: string) => BLOCKS.findIndex((b) => b.name === name);
const ID_WATER = id('water'), ID_LAVA = id('lava');
const NAME_OF = (state: number) => BLOCKS[state >>> 4]?.name ?? 'air';

function downscale(src: Image, f: number): Image {
  const w = Math.floor(src.w / f), h = Math.floor(src.h / f);
  const dst = new Image(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < f; j++)
        for (let i = 0; i < f; i++) {
          const o = ((y * f + j) * src.w + x * f + i) * 3;
          r += src.px[o]; g += src.px[o + 1]; b += src.px[o + 2];
        }
      const n = f * f;
      dst.set(x, y, (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n));
    }
  return dst;
}

function mul(c: number, f: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((c >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((c >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((c & 255) * f)));
  return (r << 16) | (g << 8) | b;
}
function mix(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t;
  const g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t;
  const bb = (a & 255) * (1 - t) + (b & 255) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bb);
}
function tint(base: number, t: number): number {
  // multiply a greyscale-ish base by the tint colour
  return (Math.round((((base >> 16) & 255) * ((t >> 16) & 255)) / 160) << 16) | (Math.round((((base >> 8) & 255) * ((t >> 8) & 255)) / 160) << 8) | Math.round(((base & 255) * (t & 255)) / 160);
}
function blockColor(state: number, ch: GeneratedChunk | null, col: number): number {
  const bid = state >>> 4;
  const name = BLOCKS[bid]?.name ?? 'air';
  let c = BLOCK_RGB[bid];
  if (ch) {
    if (GRASS_TINTED.has(name)) c = mix(ch.grassColor[col], c, name === 'grass_block' ? 0.15 : 0.3);
    else if (FOLIAGE_TINTED.has(name)) c = mul(ch.foliageColor[col], 0.8);
    else if (bid === ID_WATER) c = ch.waterColor[col];
  }
  return c;
}
const biomeColorCache = new Map<number, number>();
function biomeColor(b: number): number {
  const fixed: Record<string, number> = {
    ocean: 0x000070, deep_ocean: 0x000030, warm_ocean: 0x0000ac, lukewarm_ocean: 0x000090, cold_ocean: 0x202070, frozen_ocean: 0x7070d6,
    deep_lukewarm_ocean: 0x000040, deep_cold_ocean: 0x202038, deep_frozen_ocean: 0x404090, river: 0x0000ff, frozen_river: 0xa0a0ff,
    beach: 0xfade55, snowy_beach: 0xfaf0c0, stony_shore: 0xa2a284, plains: 0x8db360, sunflower_plains: 0xb5db88, snowy_plains: 0xffffff,
    ice_spikes: 0xb4dcdc, desert: 0xfa9418, swamp: 0x07f9b2, forest: 0x056621, flower_forest: 0x2d8e49, birch_forest: 0x307444,
    old_growth_birch_forest: 0x589c6c, dark_forest: 0x40511a, taiga: 0x0b6659, snowy_taiga: 0x31554a, old_growth_pine_taiga: 0x596651,
    old_growth_spruce_taiga: 0x818e79, savanna: 0xbdb25f, savanna_plateau: 0xa79d64, windswept_savanna: 0xe5da87, jungle: 0x537b09,
    sparse_jungle: 0x628b17, bamboo_jungle: 0x768e14, badlands: 0xd94515, wooded_badlands: 0xb09765, eroded_badlands: 0xff6d3d,
    meadow: 0x83bbc3, grove: 0xd8eeff, snowy_slopes: 0xc4c4c4, jagged_peaks: 0xdcdcc8, frozen_peaks: 0xb0b3ce, stony_peaks: 0x7b8f74,
    windswept_hills: 0x606060, windswept_forest: 0x507050, windswept_gravelly_hills: 0x888888, mushroom_fields: 0xff00ff, cherry_grove: 0xffb7d5,
  };
  let c = biomeColorCache.get(b);
  if (c === undefined) {
    c = fixed[BIOMES[b]?.name ?? ''] ?? 0xff00ff;
    biomeColorCache.set(b, c);
  }
  return c;
}

// ------------------------------------------------------------------------------------------------
// chunk access
// ------------------------------------------------------------------------------------------------
const getBlock = (ch: GeneratedChunk, x: number, y: number, z: number) => {
  const s = ch.blocks[y >> 4];
  return s ? s[((y & 15) << 8) | (z << 4) | x] : 0;
};
let genMs = 0, genCount = 0;
function gen(g: WorldGenerator, cx: number, cz: number): GeneratedChunk {
  const t = performance.now();
  const ch = g.generate(cx, cz);
  genMs += performance.now() - t;
  genCount++;
  return ch;
}

// ------------------------------------------------------------------------------------------------
// overworld top-down
// ------------------------------------------------------------------------------------------------
function overworld() {
  const g = createGenerator('overworld', seed);
  const t0 = performance.now();
  const img = new Image(size, size);
  const bimg = new Image(size, size);
  const x0 = Math.floor(cxw - size / 2), z0 = Math.floor(czw - size / 2);
  const heights = new Int16Array(size * size);
  const colors = new Uint32Array(size * size);
  const water = new Uint8Array(size * size);
  const biomeCount = new Map<number, number>();
  const cx0 = Math.floor(x0 / 16), cz0 = Math.floor(z0 / 16), cx1 = Math.floor((x0 + size - 1) / 16), cz1 = Math.floor((z0 + size - 1) / 16);
  const blockCount = new Map<string, number>();
  const sliceImgs = slices.map(() => new Image(size, size));
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const ch = gen(g, cx, cz);
      for (let lz = 0; lz < 16; lz++)
        for (let lx = 0; lx < 16; lx++) {
          const px = cx * 16 + lx - x0, pz = cz * 16 + lz - z0;
          if (px < 0 || pz < 0 || px >= size || pz >= size) continue;
          const col = (lz << 4) | lx;
          const b = ch.biomes[col];
          biomeCount.set(b, (biomeCount.get(b) ?? 0) + 1);
          bimg.set(px, pz, biomeColor(b));
          for (let k = 0; k < slices.length; k++) {
            const s = getBlock(ch, lx, slices[k], lz);
            sliceImgs[k].set(px, pz, s === 0 || NAME_OF(s) === 'cave_air' ? 0x101010 : blockColor(s, ch, col));
          }
          let y = 255;
          while (y > 0 && getBlock(ch, lx, y, lz) === 0) y--;
          const s = getBlock(ch, lx, y, lz);
          const nm = NAME_OF(s);
          blockCount.set(nm, (blockCount.get(nm) ?? 0) + 1);
          let c = blockColor(s, ch, col);
          if (s >>> 4 === ID_WATER) {
            let d = y;
            while (d > 0 && getBlock(ch, lx, d, lz) >>> 4 === ID_WATER) d--;
            const depth = y - d;
            const floor = blockColor(getBlock(ch, lx, d, lz), ch, col);
            c = mix(floor, c, Math.min(0.92, 0.45 + depth * 0.04));
            c = mul(c, 1 - Math.min(0.5, depth * 0.012));
            water[pz * size + px] = 1;
          }
          heights[pz * size + px] = y;
          colors[pz * size + px] = c;
        }
    }
  }
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      const i = z * size + x;
      let c = colors[i];
      if (!water[i]) {
        const hn = z > 0 ? heights[i - size] : heights[i];
        const hw = x > 0 ? heights[i - 1] : heights[i];
        const d = heights[i] * 2 - hn - hw;
        c = mul(c, d > 0 ? Math.min(1.25, 1 + d * 0.06) : Math.max(0.6, 1 + d * 0.06));
        c = mul(c, 0.85 + Math.min(0.3, Math.max(0, (heights[i] - 63) / 400)));
      }
      img.set(x, z, c);
    }
  // centre cross
  for (let k = -6; k <= 6; k++) {
    img.set(Math.floor(size / 2) + k, Math.floor(size / 2), 0xff0000);
    img.set(Math.floor(size / 2), Math.floor(size / 2) + k, 0xff0000);
  }
  if (scale > 1) {
    downscale(img, scale).save(out);
    downscale(bimg, scale).save(`${base}_biomes.png`);
  } else {
    img.save(out);
    bimg.save(`${base}_biomes.png`);
  }
  slices.forEach((y, k) => (scale > 1 ? downscale(sliceImgs[k], scale) : sliceImgs[k]).save(`${base}_slice_y${y}.png`));
  const total = size * size;
  console.log(`overworld: ${genCount} chunks in ${(performance.now() - t0).toFixed(0)} ms, ${(genMs / genCount).toFixed(2)} ms/chunk`);
  console.log('biomes:', [...biomeCount.entries()].sort((a, b) => b[1] - a[1]).map(([b, n]) => `${BIOMES[b].name} ${((100 * n) / total).toFixed(1)}%`).join(', '));
  console.log('top blocks:', [...blockCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([b, n]) => `${b} ${((100 * n) / total).toFixed(1)}%`).join(', '));
  const spawn = g.findSpawn();
  console.log('spawn', spawn);

  // sections
  section(g, 'x', `${base}_section.png`, 256);
  section(g, 'z', `${base}_section_z.png`, 256);
}

function section(g: WorldGenerator, axis: 'x' | 'z', path: string, height: number) {
  const len = sectionLen;
  const img = new Image(len, height);
  const start = Math.floor((axis === 'x' ? cxw : czw) - len / 2);
  const fixed = axis === 'x' ? Math.floor(czw) : Math.floor(cxw);
  const cache = new Map<string, GeneratedChunk>();
  const counts = new Map<string, number>();
  for (let i = 0; i < len; i++) {
    const wx = axis === 'x' ? start + i : fixed, wz = axis === 'x' ? fixed : start + i;
    const cx = Math.floor(wx / 16), cz = Math.floor(wz / 16);
    const key = `${cx},${cz}`;
    let ch = cache.get(key);
    if (!ch) cache.set(key, (ch = gen(g, cx, cz)));
    const lx = wx - cx * 16, lz = wz - cz * 16, col = (lz << 4) | lx;
    const hm = ch.heightmap[col];
    for (let y = 0; y < height; y++) {
      const s = getBlock(ch, lx, y, lz);
      let c: number;
      if (s === 0 || NAME_OF(s) === 'cave_air') c = y >= hm ? 0xa8c8f0 : 0x101010;
      else c = blockColor(s, ch, col);
      const nm = NAME_OF(s);
      counts.set(nm, (counts.get(nm) ?? 0) + 1);
      img.set(i, height - 1 - y, c);
    }
  }
  img.save(path);
  console.log(`section ${axis}:`, [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([b, n]) => `${b} ${n}`).join(', '));
}

// ------------------------------------------------------------------------------------------------
// nether & end
// ------------------------------------------------------------------------------------------------
function nether() {
  const g = createGenerator('nether', seed);
  const t0 = performance.now();
  genMs = 0; genCount = 0;
  const S = Math.min(size, 512);
  const img = new Image(S * 2, Math.max(S, 128 * 2));
  const x0 = Math.floor(cxw - S / 2), z0 = Math.floor(czw - S / 2);
  const cache = new Map<string, GeneratedChunk>();
  const get = (cx: number, cz: number) => {
    const k = `${cx},${cz}`;
    let ch = cache.get(k);
    if (!ch) cache.set(k, (ch = gen(g, cx, cz)));
    return ch;
  };
  // horizontal slice at y = 40 with simple shading by "floor" distance
  const sliceY = 40;
  for (let pz = 0; pz < S; pz++)
    for (let px = 0; px < S; px++) {
      const wx = x0 + px, wz = z0 + pz;
      const ch = get(Math.floor(wx / 16), Math.floor(wz / 16));
      const lx = wx & 15, lz = wz & 15;
      let y = sliceY;
      // look down to the first non-air block
      while (y > 0 && getBlock(ch, lx, y, lz) === 0) y--;
      const s = getBlock(ch, lx, y, lz);
      const c = mul(blockColor(s, null, 0), y === sliceY ? 0.55 : 0.75 + (y - 20) / 80);
      img.set(px, pz, c);
    }
  // vertical section along x at z = centre (scaled x2 vertically)
  for (let i = 0; i < S; i++) {
    const wx = x0 + i, wz = Math.floor(czw);
    const ch = get(Math.floor(wx / 16), Math.floor(wz / 16));
    for (let y = 0; y < 128; y++) {
      const s = getBlock(ch, wx & 15, y, wz & 15);
      const c = s === 0 ? 0x1a0505 : blockColor(s, null, 0);
      img.set(S + i, 2 * (127 - y), c);
      img.set(S + i, 2 * (127 - y) + 1, c);
    }
  }
  img.save(`${base}_nether.png`);
  console.log(`nether: ${genCount} chunks, ${(genMs / genCount).toFixed(2)} ms/chunk (${(performance.now() - t0).toFixed(0)} ms)`);
}

function end() {
  const g = createGenerator('end', seed);
  genMs = 0; genCount = 0;
  const S = 384;
  const img = new Image(S * 2, S);
  const cache = new Map<string, GeneratedChunk>();
  const get = (cx: number, cz: number) => {
    const k = `${cx},${cz}`;
    let ch = cache.get(k);
    if (!ch) cache.set(k, (ch = gen(g, cx, cz)));
    return ch;
  };
  let crystals = 0;
  for (let pz = 0; pz < S; pz++)
    for (let px = 0; px < S; px++) {
      const wx = px - S / 2, wz = pz - S / 2;
      const ch = get(Math.floor(wx / 16), Math.floor(wz / 16));
      const lx = wx & 15, lz = wz & 15;
      let y = 255;
      while (y > 0 && getBlock(ch, lx, y, lz) === 0) y--;
      const s = getBlock(ch, lx, y, lz);
      img.set(px, pz, s === 0 ? 0x05030a : mul(blockColor(s, null, 0), 0.55 + y / 180));
    }
  for (const ch of cache.values()) crystals += ch.entities?.filter((e) => e.type === 'end_crystal').length ?? 0;
  // section along x through z = 0 (x from -192..191), y 0..255 scaled to S height (1.5 px per block -> crop 0..255)
  for (let i = 0; i < S; i++) {
    const wx = i - S / 2;
    const ch = get(Math.floor(wx / 16), 0);
    for (let y = 0; y < Math.min(S, 256); y++) {
      const s = getBlock(ch, wx & 15, y, 0);
      img.set(S + i, S - 1 - y, s === 0 ? 0x05030a : blockColor(s, null, 0));
    }
  }
  img.save(`${base}_end.png`);
  // outer islands sample
  const g2 = g;
  let outer = 0;
  for (let cz = 60; cz < 76; cz++) for (let cx = 60; cx < 76; cx++) {
    const ch = gen(g2, cx, cz);
    for (const s of ch.blocks) if (s) for (let i = 0; i < 4096; i++) if (s[i] !== 0) outer++;
  }
  console.log(`end: ${genCount} chunks, ${(genMs / genCount).toFixed(2)} ms/chunk, crystals ${crystals}, outer-island blocks in 16x16 chunks at ~1000 blocks: ${outer}`);
}

// ------------------------------------------------------------------------------------------------
// isometric close-up (--iso x,z,size[,dim]) — renders blocks as shaded cubes
// ------------------------------------------------------------------------------------------------
function iso(spec: string) {
  const [ix, iz, isz, idim] = spec.split(',');
  const X0 = Number(ix), Z0 = Number(iz), N = Number(isz ?? 64);
  const dim = (idim ?? 'overworld') as 'overworld' | 'nether' | 'end';
  const g = createGenerator(dim, seed);
  const chunks = new Map<string, GeneratedChunk>();
  const get = (x: number, y: number, z: number): number => {
    if (y < 0 || y > 255) return 0;
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    const k = `${cx},${cz}`;
    let ch = chunks.get(k);
    if (!ch) chunks.set(k, (ch = gen(g, cx, cz)));
    return getBlock(ch, x - cx * 16, y, z - cz * 16);
  };
  const colAt = (x: number, z: number) => {
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    return { ch: chunks.get(`${cx},${cz}`)!, col: ((z - cz * 16) << 4) | (x - cx * 16) };
  };
  let minY = 255, maxY = 0;
  for (let x = X0; x < X0 + N; x++)
    for (let z = Z0; z < Z0 + N; z++) {
      let y = dim === 'nether' ? 127 : 255;
      while (y > 0 && get(x, y, z) === 0) y--;
      maxY = Math.max(maxY, y);
      minY = Math.min(minY, y);
    }
  minY = Math.max(0, minY - 12);
  if (dim === 'nether') { minY = 0; maxY = 127; }
  const TW = 8, TH = 4, BH = 5;
  const W = N * TW + 8, H = N * TH + (maxY - minY + 1) * BH + 8;
  const img = new Image(W, H);
  for (let i = 0; i < img.px.length; i += 3) { img.px[i] = 0xa8; img.px[i + 1] = 0xc8; img.px[i + 2] = 0xf0; }
  const ox = N * TW / 2 + 4, oy = (maxY - minY + 1) * BH + 4;
  const isAirLike = (s: number) => s === 0 || NAME_OF(s) === 'cave_air';
  const nether = dim === 'nether';
  for (let sum = 0; sum <= 2 * (N - 1); sum++) {
    for (let y = minY; y <= maxY; y++) {
      for (let dx = 0; dx < N; dx++) {
        const dz = sum - dx;
        if (dz < 0 || dz >= N) continue;
        const x = X0 + dx, z = Z0 + dz;
        const s = get(x, y, z);
        if (isAirLike(s)) continue;
        // in the Nether, cut away everything above the slice height so the cave interior is visible
        if (nether && y > 72) continue;
        const up = isAirLike(get(x, y + 1, z)) || (nether && y === 72);
        const right = dx === N - 1 || isAirLike(get(x + 1, y, z));
        const left = dz === N - 1 || isAirLike(get(x, y, z + 1));
        if (!up && !right && !left) continue;
        const { ch, col } = colAt(x, z);
        const c = blockColor(s, ch, col);
        const sx = ox + (dx - dz) * (TW / 2), sy = oy + (dx + dz) * (TH / 2) - (y - minY) * BH;
        // top face (diamond)
        if (up) {
          for (let j = 0; j < TH; j++) {
            const half = j < TH / 2 ? (j + 1) * 2 : (TH - j) * 2;
            for (let i = -half; i < half; i++) img.set(sx + i, sy + j - TH / 2, c);
          }
        }
        // left face (+z side)
        if (left) {
          const lc = mul(c, 0.78);
          for (let i = -TW / 2; i < 0; i++) {
            const top = sy + Math.floor((i + TW / 2) / 2);
            for (let j = 0; j < BH; j++) img.set(sx + i, top + j, lc);
          }
        }
        if (right) {
          const rc = mul(c, 0.6);
          for (let i = 0; i < TW / 2; i++) {
            const top = sy + Math.floor((TW / 2 - i - 1) / 2);
            for (let j = 0; j < BH; j++) img.set(sx + i, top + j, rc);
          }
        }
      }
    }
  }
  const path = `${base}_iso_${X0}_${Z0}${dim === 'overworld' ? '' : '_' + dim}.png`;
  img.save(path);
}

const isoSpec = arg('iso', '');
if (isoSpec) {
  for (const s of isoSpec.split(';')) iso(s);
} else {
  if (dims.includes('overworld')) overworld();
  if (dims.includes('nether')) nether();
  if (dims.includes('end')) end();
}
