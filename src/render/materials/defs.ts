/**
 * Per-texture material definitions: which GLSL program/variant renders a texture layer, its
 * parameters (uP[0..3] = p[0..15]), palette (uC[0..7], sRGB hex -> linear), and the per-layer
 * constants written to the props texture (metalness, emissive, emissive threshold, subsurface).
 */
import type { ProgramName } from './programs';

type Hex = string | number;

export interface TexDef {
  prog: ProgramName;
  /** Variant name: matches `V_<NAME>` in the program's GLSL. */
  v: string;
  p?: number[];
  c?: Hex[];
  seed?: number;
  /** Normal-map/height depth multiplier (1 = HEIGHT_DEPTH). */
  depth?: number;
  metal?: number;
  emit?: number;
  thr?: number;
  sss?: number;
  /** Alpha is the opacity of a cutout card (enables alpha-aware filtering and colour dilation). */
  cutout?: boolean;
  /** Micro-cavity darkening baked into albedo (default 1 for opaque, 0 for cutout). */
  cavity?: number;
}

export interface ResolvedDef {
  name: string;
  prog: ProgramName;
  v: string;
  p: number[];
  c: [number, number, number][];
  seed: number;
  depth: number;
  metal: number;
  emit: number;
  thr: number;
  sss: number;
  cutout: boolean;
  cavity: number;
}

export const DEFS: Record<string, TexDef> = {};

function def(name: string, d: TexDef) {
  DEFS[name] = d;
}

function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function hexToLinear(h: Hex): [number, number, number] {
  const n = typeof h === 'number' ? h : parseInt(h.replace('#', ''), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

function nameSeed(name: string) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return ((h >>> 0) % 9973) + 1;
}

export function resolveDef(name: string): ResolvedDef {
  const d = DEFS[name] ?? DEFS.missing;
  return {
    name,
    prog: d.prog,
    v: d.v,
    p: d.p ?? [],
    c: (d.c ?? []).map(hexToLinear),
    seed: d.seed ?? nameSeed(name),
    depth: d.depth ?? 1,
    metal: d.metal ?? 0,
    emit: d.emit ?? 0,
    thr: d.thr ?? 0,
    sss: d.sss ?? 0,
    cutout: d.cutout ?? false,
    cavity: d.cavity ?? (d.cutout ? 0 : 1),
  };
}

// =============================================================================================
// Definitions
// =============================================================================================
def('missing', { prog: 'cloth', v: 'missing' });

// ---------------------------------------------------------------------------------- rocks
const rockDef = (c: Hex[], p: number[], extra: Partial<TexDef> = {}): TexDef => ({ prog: 'rock', v: 'rock', c, p, ...extra });
// rock() params: [patchF, contrast, speckA, speckB | cracks, pits, dashes, aniso | rough, hAmp, speckCells, salt | facets, speckR, grain, lightPatches]
def('stone', rockDef(['#686868', '#7f7f7f', '#949494', '#5e5e5e', '#a0a0a0'], [5, 0.6, 0.08, 0.08, 0.35, 0.1, 0.9, -1, 0.8, 1.2, 40, 1, 0.8, 0.28, 1.0, 0.7], { depth: 1.4 }));
def('tuff', rockDef(['#56574f', '#6c6d66', '#83847b', '#a2a397', '#45463f'], [6, 0.5, 0.12, 0.07, 0.1, 0.7, 0.1, 0, 0.9, 1.2, 24, 2, 0.5, 0.4, 1, 0.4], { depth: 1.3 }));
def('calcite', rockDef(['#c2c3be', '#dcddd9', '#ededea', '#b5b7b1', '#f7f7f4'], [4, 0.4, 0.05, 0.06, 0.15, 0.05, 0.25, 0, 0.5, 0.7, 20, 3, 0.4, 0.4, 0.5, 0.7], { sss: 0.15, depth: 1.2 }));
def('deepslate', rockDef(['#38383d', '#4d4d52', '#626268', '#2e2e33', '#6a6a70'], [4, 0.55, 0.04, 0.05, 0.2, 0.08, 0.6, 4, 0.74, 1, 28, 4, 0.6, 0.35, 0.7, 0.5], { depth: 1.3 }));
def('deepslate_top', rockDef(['#38383d', '#4d4d52', '#626268', '#2e2e33', '#6a6a70'], [5, 0.65, 0.05, 0.06, 0.25, 0.1, 0.3, 0, 0.74, 1, 28, 5, 0.7, 0.35, 0.7, 0.6], { depth: 1.3 }));
def('end_stone', rockDef(['#c4c688', '#dbde9e', '#e9ebb6', '#b1b277', '#f0f1c9'], [6, 0.6, 0.08, 0.08, 0.1, 0.85, 0.2, 0, 0.85, 1.1, 24, 6, 0.5, 0.4, 0.8, 0.6], { depth: 1.3 }));
def('netherrack', rockDef(['#4d2223', '#6f3534', '#8b4747', '#3e1717', '#9a5050'], [6, 0.8, 0.1, 0.1, 0.35, 0.4, 0.35, 0, 0.9, 1.4, 22, 7, 0.9, 0.4, 1, 0.6], { depth: 1.3 }));
def('bedrock', rockDef(['#262626', '#565656', '#8c8c8c', '#161616', '#a3a3a3'], [5, 1, 0.1, 0.1, 0.4, 0.3, 0.5, 0, 0.9, 1.6, 12, 8, 1, 0.45, 1, 1], { depth: 1.3 }));
def('blackstone', rockDef(['#1e181c', '#2b2328', '#3c3339', '#16111a', '#4a4048'], [5, 0.6, 0.05, 0.08, 0.3, 0.2, 0.3, 0, 0.82, 1, 26, 9, 0.7, 0.35, 0.8, 0.5], { depth: 1.3 }));
def('dripstone_block', rockDef(['#6d5447', '#866b5c', '#9d8371', '#5c483c', '#ae9480'], [4, 0.6, 0.04, 0.05, 0.15, 0.25, 0.6, -4, 0.8, 1, 24, 10, 0.5, 0.35, 0.8, 0.6], { depth: 1.2 }));
// granular(): c = [main, second, dark, light], p = [cells, fracSecond, fracDark, fracLight | rough, hAmp, polish, salt]
def('granite', { prog: 'rock', v: 'granular', c: ['#a06d59', '#8c5b4a', '#4a322c', '#c9a898'], p: [40, 0.32, 0.1, 0.16, 0.7, 1, 0, 11], depth: 1.4 });
def('diorite', { prog: 'rock', v: 'granular', c: ['#c4c4c2', '#adadab', '#4c4c4e', '#e4e4e2'], p: [40, 0.3, 0.1, 0.22, 0.66, 1, 0, 12], depth: 1.4 });
def('andesite', { prog: 'rock', v: 'granular', c: ['#8a8a8a', '#7b7b7c', '#5a5a5b', '#a5a5a5'], p: [56, 0.4, 0.1, 0.1, 0.74, 1, 0, 13], depth: 1.4 });
// crystal(): c = [deep, mid, light, edge], p = [cells, tilt, edge, rough | salt]
def('amethyst_block', { prog: 'rock', v: 'crystal', c: ['#4f2f86', '#8561bf', '#b597e8', '#d9c6f7'], p: [6, 0.7, 0.14, 0.28, 14], sss: 0.1 });
def('coal_block', { prog: 'rock', v: 'crystal', c: ['#070707', '#131314', '#29292b', '#47474b'], p: [5, 0.8, 0.12, 0.32, 15] });
def('budding_amethyst', { prog: 'rock', v: 'budding', c: ['#4a2c7c', '#7a55b4', '#b79be0', '#d6c4f2'], p: [6, 0.7, 0.3, 0.3, 81], sss: 0.1 });
def('basalt_side', { prog: 'rock', v: 'basalt_side' });
def('basalt_top', { prog: 'rock', v: 'basalt_top' });
def('polished_basalt_side', { prog: 'rock', v: 'polished_basalt_side' });
def('polished_basalt_top', { prog: 'rock', v: 'polished_basalt_top' });
def('blackstone_top', { ...DEFS.blackstone, v: 'blackstone_top', p: [5, 0.6, 0.05, 0.08, 0.3, 0.2, 0.3, 0, 0.82, 1, 26, 21, 0.7, 0.35, 0.8, 0.5] });
def('gilded_blackstone', { ...DEFS.blackstone, v: 'gilded', p: [5, 0.6, 0.05, 0.08, 0.3, 0.15, 0.3, 0, 0.82, 1, 26, 61, 0.7, 0.35, 0.8, 0.5], metal: 0.3 });
const OBSIDIAN_C = ['#050309', '#0f0a18', '#22183a', '#302248'];
def('obsidian', { prog: 'rock', v: 'obsidian', c: OBSIDIAN_C, p: [5, 0.9, 0.35, 0.06, 31], depth: 0.8 });
def('crying_obsidian', { prog: 'rock', v: 'crying_obsidian', c: OBSIDIAN_C, p: [5, 0.9, 0.35, 0.06, 31], depth: 0.8, emit: 0.9, thr: 0.07 });
def('magma_block', { prog: 'rock', v: 'magma', emit: 1, thr: 0.12 });
def('ancient_debris_side', { prog: 'rock', v: 'debris_side' });
def('ancient_debris_top', { prog: 'rock', v: 'debris_top' });
// rawBlock(): c = [c0, c1, c2, crevice], p = [rough, salt]
def('raw_iron_block', { prog: 'rock', v: 'raw', c: ['#8a6a50', '#a6876b', '#caa98b', '#4a3626'], p: [0.7, 16] });
def('raw_gold_block', { prog: 'rock', v: 'raw', c: ['#a8700f', '#dda92e', '#f8d868', '#5a3a08'], p: [0.32, 17], metal: 0.75 });
def('glowstone', { prog: 'rock', v: 'glowstone', emit: 1, thr: 0.2 });

// ---------------------------------------------------------------------------------- ores
// p = [base, clusterProb, blobRadius, blobs | style, rough, rim, grid | glow, specks]
// style: 0 coal chunks, 1 metal nuggets, 2 faceted gems, 3 lapis patches, 4 crystal shards
interface OreSpec { c: Hex[]; p: number[]; extra?: Partial<TexDef> }
const ORES: Record<string, OreSpec> = {
  coal: { c: ['#161616', '#2b2b2b', '#4c4c4e', '#4a4a4a'], p: [0.8, 1.25, 5, 0, 0.55, 0.3, 3, 0, 0.03] },
  iron: { c: ['#8a6246', '#d8af93', '#f3dbc6', '#5e5048'], p: [0.75, 1.05, 4, 1, 0.42, 0.45, 3, 0, 0.02] },
  copper: { c: ['#7a3820', '#e0734e', '#f8b08a', '#4f7a63'], p: [0.8, 1.05, 5, 1, 0.38, 0.6, 3, 0, 0.04] },
  gold: { c: ['#9a6c0c', '#f8e048', '#fffbc8', '#6e5a30'], p: [0.72, 0.95, 4, 1, 0.22, 0.4, 3, 0, 0.02] },
  redstone: { c: ['#5e0000', '#b80a0a', '#ff4040', '#4a2a2a'], p: [0.85, 1.0, 5, 4, 0.35, 0.4, 3, 0, 0.04] },
  lapis: { c: ['#0c2470', '#1f4bb8', '#6390e6', '#3a4060'], p: [0.85, 1.2, 6, 3, 0.55, 0.35, 3, 0, 0.02] },
  diamond: { c: ['#159aa6', '#5decf5', '#e8ffff', '#3c5a5c'], p: [0.7, 0.95, 4, 2, 0.1, 0.45, 3, 0, 0.01] },
  emerald: { c: ['#077a32', '#17dd62', '#b0ffd0', '#3c5040'], p: [0.5, 0.95, 3, 2, 0.12, 0.45, 3, 0, 0] },
};
for (const [ore, s] of Object.entries(ORES)) {
  def(`${ore}_ore`, { prog: 'ore', v: 'ore', c: s.c, p: [0, ...s.p.slice(0, 3), ...s.p.slice(3)] });
  def(`deepslate_${ore}_ore`, { prog: 'ore', v: 'ore', c: s.c, p: [1, ...s.p.slice(0, 3), ...s.p.slice(3)] });
}
def('redstone_ore_lit', { prog: 'ore', v: 'ore', c: ['#a01010', '#f02a24', '#ff8070', '#4a2a2a'], p: [0, 0.85, 1.0, 5, 4, 0.35, 0.4, 3, 1, 0.04], emit: 0.85, thr: 0.24, seed: nameSeed('redstone_ore') });
def('nether_quartz_ore', { prog: 'ore', v: 'ore', c: ['#b8aca0', '#ece6dc', '#ffffff', '#5a2e2e'], p: [2, 0.9, 1.0, 5, 4, 0.3, 0.4, 3, 0, 0.03] });
def('nether_gold_ore', { prog: 'ore', v: 'ore', c: ['#a87a10', '#f5c842', '#fff2a0', '#5a2e1a'], p: [2, 0.9, 0.6, 6, 1, 0.25, 0.3, 4, 0, 0.15], metal: 0.2 });

// ---------------------------------------------------------------------------------- masonry
// p = [kind(0 bricks,1 tiles,2 panel,3 cobble,4 two panels,5 plain), rows, cols, offset |
//      mortarPx, bevelPx, chip, colourVar | surfF, contrast, rough, relief | moss, cracks, motif, layering]
// c = [dark, mid, light, mortar, speck, moss]
const mas = (c: Hex[], p: number[], extra: Partial<TexDef> = {}): TexDef => ({ prog: 'masonry', v: 'masonry', c, p, ...extra });
const STONE_BRICK_C = ['#6a6a6a', '#7c7c7c', '#919191', '#4c4c4c', '#5c5c5c', '#556d2b'];
def('stone_bricks', mas(STONE_BRICK_C, [0, 2, 2, 0.5, 0.6, 1.2, 0.6, 0.12, 6, 0.4, 0.82, 1, 0, 0, 0, 0]));
def('mossy_stone_bricks', mas(STONE_BRICK_C, [0, 2, 2, 0.5, 0.6, 1.2, 0.7, 0.12, 6, 0.4, 0.82, 1, 0.55, 0, 0, 0]));
def('cracked_stone_bricks', mas(STONE_BRICK_C, [0, 2, 2, 0.5, 0.6, 1.2, 0.9, 0.12, 6, 0.4, 0.84, 1, 0, 0.9, 0, 0]));
def('chiseled_stone_bricks', mas(STONE_BRICK_C, [2, 1, 1, 0, 1, 1.2, 0.5, 0, 6, 0.4, 0.82, 1, 0, 0, 1, 0]));
def('bricks', mas(['#7c3f2e', '#9b5744', '#b36d57', '#a39d97', '#6a3324'], [0, 4, 2, 0.5, 0.6, 0.8, 0.5, 0.28, 8, 0.5, 0.86, 1, 0, 0, 0, 0]));
const DEEPSLATE_BRICK_C = ['#363639', '#48484c', '#5c5c61', '#202022', '#2c2c2f'];
def('deepslate_bricks', mas(DEEPSLATE_BRICK_C, [0, 4, 2, 0.5, 0.5, 0.8, 0.6, 0.15, 8, 0.5, 0.8, 1, 0, 0, 0, 0]));
def('cracked_deepslate_bricks', mas(DEEPSLATE_BRICK_C, [0, 4, 2, 0.5, 0.5, 0.8, 0.9, 0.15, 8, 0.5, 0.82, 1, 0, 1, 0, 0]));
def('deepslate_tiles', mas(['#303033', '#3c3c40', '#4d4d52', '#1a1a1c', '#28282a'], [1, 4, 4, 0, 0.5, 0.7, 0.5, 0.2, 8, 0.5, 0.8, 1, 0, 0, 0, 0]));
def('polished_deepslate', mas(['#3e3e42', '#4a4a4e', '#59595e', '#29292c', '#38383b'], [2, 1, 1, 0, 0.6, 1.5, 0.2, 0, 5, 0.3, 0.55, 0.5, 0, 0, 0, 0]));
def('chiseled_deepslate', mas(['#38383c', '#47474b', '#58585d', '#1e1e20', '#323235'], [2, 1, 1, 0, 0.8, 1.2, 0.3, 0, 6, 0.4, 0.7, 0.8, 0, 0, 2, 0]));
const NETHER_BRICK_C = ['#2c1317', '#3b1b20', '#4e252b', '#140608', '#230c0f'];
def('nether_bricks', mas(NETHER_BRICK_C, [0, 4, 2, 0.5, 0.55, 0.7, 0.5, 0.2, 8, 0.5, 0.85, 1, 0, 0, 0, 0]));
def('cracked_nether_bricks', mas(NETHER_BRICK_C, [0, 4, 2, 0.5, 0.55, 0.7, 0.8, 0.2, 8, 0.5, 0.86, 1, 0, 1, 0, 0]));
def('red_nether_bricks', mas(['#430608', '#580c0f', '#70191b', '#220304', '#360506'], [0, 4, 2, 0.5, 0.55, 0.7, 0.5, 0.2, 8, 0.5, 0.85, 1, 0, 0, 0, 0]));
def('end_stone_bricks', mas(['#cdd194', '#dce1a4', '#e9edbb', '#a1a473', '#bfc389'], [0, 4, 2, 0.5, 0.6, 0.9, 0.6, 0.12, 7, 0.45, 0.85, 1, 0, 0, 0, 0]));
def('polished_blackstone_bricks', mas(['#28222a', '#332c35', '#413944', '#141115', '#1e191f'], [0, 4, 2, 0.5, 0.5, 0.8, 0.5, 0.15, 7, 0.4, 0.8, 1, 0, 0, 0, 0]));
def('polished_blackstone', mas(['#2b252e', '#35303a', '#433c48', '#1b171d', '#262028'], [2, 1, 1, 0, 0.6, 1.5, 0.2, 0, 5, 0.3, 0.55, 0.5, 0, 0, 0, 0]));
def('mud_bricks', mas(['#785a43', '#8a6950', '#9b795e', '#a68e70', '#6a4f3b'], [0, 4, 2, 0.5, 0.65, 0.8, 0.6, 0.15, 8, 0.45, 0.9, 1, 0, 0, 0, 0]));
def('prismarine_bricks', mas(['#4c887d', '#62a99b', '#7dc3b4', '#3a6b63', '#8ad0c0'], [0, 4, 2, 0.5, 0.6, 1, 0.4, 0.15, 6, 0.45, 0.55, 1, 0, 0, 0, 0]));
def('prismarine', mas(['#4a8277', '#62a594', '#7dbcac', '#3a6b63', '#5d7fa2'], [5, 1, 1, 0, 0, 0, 0, 0, 5, 1, 0.55, 1.2, 0, 0, 0, 0]));
def('dark_prismarine', mas(['#294a3e', '#335b4b', '#3f6d5b', '#1d362d', '#24463a'], [2, 1, 1, 0, 0.8, 1, 0.3, 0, 6, 0.5, 0.55, 1, 0, 0, 9, 0]));
const PURPUR_C = ['#8b5c8b', '#a97ca9', '#c095c0', '#6c456c', '#9a6e9a'];
def('purpur_block', mas(PURPUR_C, [1, 4, 4, 0, 0.5, 0.9, 0.4, 0.15, 6, 0.4, 0.7, 1, 0, 0, 0, 0]));
def('purpur_pillar', mas(PURPUR_C, [5, 1, 1, 0, 0, 0, 0, 0, 6, 0.35, 0.7, 0.8, 0, 0, 6, 0]));
def('purpur_pillar_top', mas(PURPUR_C, [2, 1, 1, 0, 0.5, 1, 0.2, 0, 6, 0.35, 0.7, 0.8, 0, 0, 7, 0]));
const QUARTZ_C = ['#dcd5cb', '#ebe5de', '#f6f2ec', '#cbc3b8', '#e2dbd2'];
def('quartz_block_side', mas(QUARTZ_C, [5, 1, 1, 0, 0, 0, 0, 0, 4, 0.2, 0.42, 0.3, 0, 0, 11, 0]));
def('quartz_block_top', mas(QUARTZ_C, [2, 1, 1, 0, 0.4, 1, 0.1, 0, 4, 0.2, 0.42, 0.4, 0, 0, 0, 0]));
def('quartz_pillar', mas(QUARTZ_C, [5, 1, 1, 0, 0, 0, 0, 0, 4, 0.2, 0.42, 0.3, 0, 0, 6, 0]));
def('quartz_pillar_top', mas(QUARTZ_C, [2, 1, 1, 0, 0.4, 1, 0.1, 0, 4, 0.2, 0.42, 0.4, 0, 0, 7, 0]));
const SMOOTH_C = ['#919191', '#9e9e9e', '#ababab', '#707070', '#8a8a8a'];
def('smooth_stone', mas(SMOOTH_C, [2, 1, 1, 0, 1, 0.6, 0.1, 0, 5, 0.3, 0.68, 0.4, 0, 0, 0, 0]));
def('smooth_stone_slab_side', mas(SMOOTH_C, [4, 2, 1, 0, 1, 0.6, 0.1, 0, 5, 0.3, 0.68, 0.4, 0, 0, 0, 0]));
def('polished_granite', mas(['#8c5a46', '#9d6a55', '#af7c66', '#6c4232', '#c79e8d'], [2, 1, 1, 0, 0.6, 1.2, 0.2, 0, 7, 0.6, 0.42, 0.4, 0, 0, 0, 0]));
def('polished_diorite', mas(['#b6b6b6', '#c4c4c4', '#d3d3d3', '#8a8a8a', '#575757'], [2, 1, 1, 0, 0.6, 1.2, 0.2, 0, 7, 0.5, 0.42, 0.4, 0, 0, 0, 0]));
def('polished_andesite', mas(['#7c807f', '#858887', '#929594', '#5f6261', '#a6a8a7'], [2, 1, 1, 0, 0.6, 1.2, 0.2, 0, 7, 0.5, 0.45, 0.4, 0, 0, 0, 0]));
const COBBLE_C = ['#585858', '#7a7a7a', '#9c9c9c', '#363636', '#6a6a6a', '#587a2a'];
def('cobblestone', mas(COBBLE_C, [3, 4, 0, 0, 0.3, 0, 0, 0, 8, 0.5, 0.86, 1, 0, 0, 0, 0], { depth: 1.2 }));
def('mossy_cobblestone', mas(COBBLE_C, [3, 4, 0, 0, 0.3, 0, 0, 0, 8, 0.5, 0.86, 1, 0.55, 0, 0, 0], { depth: 1.2 }));
def('cobbled_deepslate', mas(['#38383c', '#4b4b50', '#606066', '#1a1a1c', '#424246'], [3, 5, 0, 0, 0.35, 0, 0, 0, 8, 0.5, 0.82, 1, 0, 0, 0, 0], { depth: 1.2 }));
const SANDSTONE_C = ['#cbbe8b', '#d8cb9b', '#e6dcb3', '#b6a876', '#c9b989'];
def('sandstone', mas(SANDSTONE_C, [5, 1, 1, 0, 0, 0, 0, 0, 10, 0.35, 0.9, 0.6, 0, 0, 4, 1]));
def('sandstone_top', mas(SANDSTONE_C, [5, 1, 1, 0, 0, 0, 0, 0, 8, 0.3, 0.9, 0.5, 0, 0, 0, 0]));
def('sandstone_bottom', mas(SANDSTONE_C, [5, 1, 1, 0, 0, 0, 0, 0, 8, 0.35, 0.9, 0.6, 0, 0, 10, 0]));
def('cut_sandstone', mas(SANDSTONE_C, [2, 1, 1, 0, 0.3, 1.2, 0.1, 0, 8, 0.3, 0.88, 0.5, 0, 0, 5, 0]));
def('chiseled_sandstone', mas(SANDSTONE_C, [2, 1, 1, 0, 0.3, 1.2, 0.1, 0, 8, 0.3, 0.88, 0.5, 0, 0, 3, 0]));
const RED_SANDSTONE_C = ['#a5551d', '#b96224', '#c97430', '#8a4417', '#ad5e28'];
def('red_sandstone', mas(RED_SANDSTONE_C, [5, 1, 1, 0, 0, 0, 0, 0, 10, 0.35, 0.9, 0.6, 0, 0, 4, 1]));
def('red_sandstone_top', mas(RED_SANDSTONE_C, [5, 1, 1, 0, 0, 0, 0, 0, 8, 0.3, 0.9, 0.5, 0, 0, 0, 0]));
def('red_sandstone_bottom', mas(RED_SANDSTONE_C, [5, 1, 1, 0, 0, 0, 0, 0, 8, 0.35, 0.9, 0.6, 0, 0, 10, 0]));
def('cut_red_sandstone', mas(RED_SANDSTONE_C, [2, 1, 1, 0, 0.3, 1.2, 0.1, 0, 8, 0.3, 0.88, 0.5, 0, 0, 5, 0]));
// ---------------------------------------------------------------------------------- soils
// V_SOIL p = [clodCells, clodRelief, pebbleDensity, pebbleCells | rough, grain, ripple, pebbleSize | furrows, wet, soulFaces, - | -, -, -, untinted]
// c = [dark, mid, light, pebbleA, pebbleB]
const soil = (c: Hex[], p: number[], extra: Partial<TexDef> = {}): TexDef => ({ prog: 'soil', v: 'soil', c, p, ...extra });
def('dirt', soil(['#5c3f2b', '#866043', '#9d7555', '#8a8378', '#6a5040'], [9, 0.8, 0.1, 14, 0.93, 0.5, 0, 0.32, 0, 0, 0, 0, 0, 0, 0, 1], { depth: 1.3 }));
def('coarse_dirt', soil(['#5a3e2a', '#77553a', '#8f6a4c', '#8c8a84', '#5e5a52'], [8, 0.9, 0.45, 16, 0.94, 0.6, 0, 0.34], { depth: 1.4 }));
def('sand', soil(['#c9c08c', '#dbd3a0', '#e8e1b8', '#b5a87c', '#ece6c8'], [14, 0.15, 0.06, 30, 0.92, 0.6, 0.22, 0.2], { depth: 1.3 }));
def('red_sand', soil(['#a65418', '#be6621', '#cf7834', '#8a4212', '#d68a4a'], [14, 0.15, 0.06, 30, 0.92, 0.6, 0.22, 0.2], { depth: 1.3 }));
def('gravel', soil(['#6e6a69', '#837e7d', '#9a9594', '#8f8e8d', '#7c6c60'], [10, 0.4, 0.92, 9, 0.85, 0.5, 0, 0.48], { depth: 1.4 }));
def('clay', soil(['#8f95a2', '#a0a6b3', '#b0b6c2', '#8a8f9a', '#b8bcc6'], [5, 0.4, 0.05, 12, 0.75, 0.25, 0, 0.3], { depth: 1.2 }));
def('mud', soil(['#2e2c2f', '#3c3a3d', '#4c494c', '#2a2826', '#4a4440'], [6, 0.6, 0.06, 12, 0.4, 0.3, 0, 0.3, 0, 0.6, 0]));
def('packed_mud', soil(['#7b5b43', '#8e6b50', '#a07b5e', '#b49e6c', '#6a5040'], [8, 0.4, 0.15, 20, 0.85, 0.4, 0, 0.25], { depth: 1.2 }));
def('soul_sand', soil(['#3e2f25', '#513e32', '#66503f', '#2e221a', '#6e5a48'], [12, 0.6, 0.15, 18, 0.92, 0.6, 0, 0.3, 0, 0, 1], { depth: 1.3 }));
def('soul_soil', soil(['#3a2b22', '#4b392e', '#5c483a', '#2e221a', '#6a5444'], [10, 0.7, 0.12, 16, 0.92, 0.6, 0, 0.3], { depth: 1.3 }));
def('concrete_powder', soil(['#d4d4d4', '#e8e8e8', '#f5f5f5', '#c4c4c4', '#fafafa'], [14, 0.2, 0.15, 26, 0.95, 0.7, 0, 0.25]));
def('farmland', soil(['#5e3f26', '#7a5434', '#8e6642', '#6e655a', '#4a3420'], [8, 0.9, 0.08, 14, 0.92, 0.5, 0, 0.3, 1, 0, 0]));
def('farmland_moist', soil(['#38220f', '#4a2f17', '#5a3b20', '#4a4038', '#2e1d0e'], [8, 0.9, 0.08, 14, 0.92, 0.5, 0, 0.3, 1, 0.5, 0]));
def('dirt_path_top', soil(['#7f6535', '#94793f', '#a6894c', '#8a8478', '#6e5a3a'], [10, 0.3, 0.12, 16, 0.88, 0.4, 0, 0.3], { depth: 1.2 }));
def('grass_block_top', { prog: 'soil', v: 'grass_top', sss: 0.3 });
def('grass_block_side', { prog: 'soil', v: 'grass_side' });
// V_FRINGE p2 = [depthPx, base(0 dirt,1 netherrack), style(0 blades,1 snow,2 path), alphaOut]; c5/c6 fringe colours
const fringe = (c5: Hex, c6: Hex, p2: number[], extra: Partial<TexDef> = {}): TexDef =>
  ({ prog: 'soil', v: 'fringe', c: ['#000', '#000', '#000', '#000', '#000', c5, c6], p: [0, 0, 0, 0, 0, 0, 0, 0, ...p2], ...extra });
def('podzol_side', fringe('#5e3d1c', '#8a5a2c', [3, 0, 0, 1]));
def('mycelium_side', fringe('#6a5c60', '#8c7f84', [3.5, 0, 0, 1]));
def('crimson_nylium_side', fringe('#7e1b1b', '#ab362a', [3.5, 1, 0, 1]));
def('warped_nylium_side', fringe('#1d665b', '#2c8a78', [3.5, 1, 0, 1]));
def('grass_block_snow', fringe('#dde6ec', '#fafcff', [3.5, 0, 1, 0], { sss: 0.2 }));
def('dirt_path_side', fringe('#8c723c', '#a6894c', [2.5, 0, 2, 1]));
def('snow_side_overlay', { prog: 'soil', v: 'snow_overlay', p: [0, 0, 0, 0, 0, 0, 0, 0, 3.5], cutout: true, sss: 0.3 });
def('podzol_top', { prog: 'soil', v: 'podzol_top' });
// V_CARPET c = [base, tip, under, speck], p2 = [cells, length, width, gap], p3 = [rough, specks]
const carpet = (c: Hex[], p2: number[], p3: number[], extra: Partial<TexDef> = {}): TexDef =>
  ({ prog: 'soil', v: 'carpet', c, p: [0, 0, 0, 0, 0, 0, 0, 0, ...p2, ...p3], ...extra });
def('mycelium_top', carpet(['#6f6265', '#8a7d82', '#4a3e42', '#b0a2a8'], [26, 0.025, 0.004, 0.05], [0.9, 0.25]));
def('crimson_nylium', carpet(['#8a1e1e', '#b33a2a', '#5a1010', '#c85030'], [24, 0.03, 0.005, 0.05], [0.85, 0.15]));
def('warped_nylium', carpet(['#1f6e62', '#2f8e7c', '#164a42', '#3aa898'], [24, 0.03, 0.005, 0.05], [0.85, 0.15]));
def('moss_block', carpet(['#596e2d', '#7a9440', '#3e4e1e', '#6e8a34'], [28, 0.03, 0.005, 0.0], [0.95, 0], { sss: 0.25 }));
def('snow', { prog: 'soil', v: 'snow', sss: 0.3 });

// ---------------------------------------------------------------------------------- foliage
// canopy p = [cells, leafLen, widthRatio, presence | shape(0 broad,1 needle,2 round,3 large,4 narrow,5 blossom), twigs, blossom, shapeExp]
const leaves = (c: Hex[], p: number[], extra: Partial<TexDef> = {}): TexDef => ({ prog: 'foliage', v: 'canopy', c, p, cutout: true, sss: 0.8, ...extra });
def('oak_leaves', leaves(['#b6b6b4', '#4e4e4e'], [6, 0.14, 0.55, 0.72, 0, 0.6, 0, 0.8]));
def('spruce_leaves', leaves(['#9a9a9a', '#2c2c2c'], [18, 0.085, 0.2, 0.97, 1, 0.5, 0, 1.0], { sss: 0.6 }));
def('birch_leaves', leaves(['#c2c2c0', '#5a5a5a'], [8, 0.1, 0.7, 0.7, 2, 0.5, 0, 0.7]));
def('jungle_leaves', leaves(['#b2b2b0', '#484848'], [4, 0.24, 0.48, 0.8, 3, 0.5, 0, 0.75]));
def('acacia_leaves', leaves(['#b4b4b2', '#4c4c4c'], [9, 0.08, 0.38, 0.75, 4, 0.6, 0, 0.8]));
def('dark_oak_leaves', leaves(['#a4a4a2', '#3e3e3e'], [6, 0.15, 0.55, 0.8, 0, 0.6, 0, 0.8]));
def('cherry_leaves', leaves(['#eab0c8', '#b06888', '#f7cfe0', '#fff2f6'], [6, 0.13, 0.6, 0.78, 5, 0.5, 0.65, 0.8]));
def('leaves_fluff_oak', { ...leaves(['#b6b6b4', '#4e4e4e'], [6, 0.14, 0.55, 0.95, 0, 0.3, 0, 0.8]), v: 'fluff' });
def('leaves_fluff_needle', { ...leaves(['#9a9a9a', '#2c2c2c'], [18, 0.085, 0.2, 0.99, 1, 0.3, 0, 1.0]), v: 'fluff', sss: 0.6 });
def('grass_tuft', { prog: 'foliage', v: 'tuft', cutout: true, sss: 0.6 });
def('vine', { prog: 'foliage', v: 'vine', cutout: true, sss: 0.6 });
def('glow_lichen', { prog: 'foliage', v: 'lichen', cutout: true, emit: 0.45, thr: 0.05, sss: 0.3 });
def('weeping_vines', { prog: 'foliage', v: 'weeping', cutout: true, sss: 0.4 });

// ---------------------------------------------------------------------------------- plants
const plant = (v: string, p: number[] = [], extra: Partial<TexDef> = {}): TexDef => ({ prog: 'plants', v, p, cutout: true, sss: 0.6, ...extra });
def('short_grass', plant('short_grass'));
def('fern', plant('fern'));
def('tall_grass_bottom', plant('tall_grass', [0, 0], { seed: nameSeed('tall_grass') }));
def('tall_grass_top', plant('tall_grass', [0, 1], { seed: nameSeed('tall_grass') }));
def('large_fern_bottom', plant('large_fern', [0, 0], { seed: nameSeed('large_fern') }));
def('large_fern_top', plant('large_fern', [0, 1], { seed: nameSeed('large_fern') }));
def('sugar_cane', plant('sugar_cane', [], { sss: 0.3 }));
def('kelp', plant('kelp'));
def('seagrass', plant('seagrass'));
def('dead_bush', plant('dead_bush', [], { sss: 0.1 }));
def('bamboo_stalk', plant('bamboo', [], { sss: 0.3 }));
def('sweet_berry_bush', plant('sweet_berry'));
def('lily_pad', plant('lily_pad', [], { sss: 0.4 }));
def('cobweb', plant('cobweb', [], { sss: 0 }));
def('brown_mushroom', plant('mushroom', [0], { sss: 0.3 }));
def('red_mushroom', plant('mushroom', [1], { sss: 0.3 }));
def('crimson_fungus', plant('fungus', [0], { sss: 0.3 }));
def('warped_fungus', plant('fungus', [1], { sss: 0.3 }));
def('crimson_roots', plant('roots', [0], { sss: 0.4 }));
def('warped_roots', plant('roots', [1], { sss: 0.4 }));
for (let s = 0; s < 8; s++) def(`wheat_stage${s}`, plant('wheat', [s], { seed: nameSeed('wheat') }));
for (let s = 0; s < 4; s++) def(`carrots_stage${s}`, plant('carrots', [s], { seed: nameSeed('carrots') }));
for (let s = 0; s < 4; s++) def(`potatoes_stage${s}`, plant('potatoes', [s], { seed: nameSeed('potatoes') }));
for (let s = 0; s < 4; s++) def(`beetroots_stage${s}`, plant('beetroots', [s], { seed: nameSeed('beetroots') }));
for (let s = 0; s < 3; s++) def(`nether_wart_stage${s}`, plant('nether_wart', [s], { seed: nameSeed('nether_wart'), sss: 0.3 }));
def('stem', plant('stem'));
['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'cherry'].forEach((w, i) => def(`${w}_sapling`, plant('sapling', [i])));
def('amethyst_cluster', plant('amethyst', [], { sss: 0.2, emit: 0.35, thr: 0.35 }));
def('sea_pickle', plant('sea_pickle', [], { sss: 0.4, emit: 0.7, thr: 0.5 }));

// ---------------------------------------------------------------------------------- flowers
['dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley']
  .forEach((f, i) => def(f, { prog: 'flowers', v: 'flower', p: [i], cutout: true, sss: 0.6 }));
['sunflower', 'lilac', 'rose_bush', 'peony'].forEach((f, i) => {
  def(`${f}_bottom`, { prog: 'flowers', v: 'tall_flower', p: [i, 0], cutout: true, sss: 0.6, seed: nameSeed(f) });
  def(`${f}_top`, { prog: 'flowers', v: 'tall_flower', p: [i, 1], cutout: true, sss: 0.6, seed: nameSeed(f) });
});

// ---------------------------------------------------------------------------------- metal
// V_METAL_BLOCK c = [base, tarnish], p = [brush, scratches, rough, tarnish | style]
def('iron_block', { prog: 'metal', v: 'metal_block', c: ['#d6d6d6', '#b4aca4'], p: [0.8, 0.6, 0.3, 0.08, 0], metal: 1 });
def('gold_block', { prog: 'metal', v: 'metal_block', c: ['#f4cc3e', '#c8961a'], p: [0.5, 0.5, 0.2, 0.12, 1], metal: 1 });
def('copper_block', { prog: 'metal', v: 'metal_block', c: ['#c46e50', '#8a4a34'], p: [0.3, 0.4, 0.36, 0.25, 2], metal: 1 });
def('netherite_block', { prog: 'metal', v: 'metal_block', c: ['#5a5355', '#332d2e'], p: [0.6, 0.5, 0.33, 0.2, 3], metal: 0.85 });
// landmark tower (One World Trade Center spawner)
def('curtain_wall', { prog: 'metal', v: 'curtain_wall', c: ['#9fb6cf', '#c9ced3'], p: [2, 0.035, 0.12, 0], metal: 1, depth: 0.4 });
def('tower_icon', { prog: 'metal', v: 'tower_icon', c: ['#3a5f8f', '#a8c4e0', '#b0b6bc'], p: [0, 0, 0, 0], metal: 0.4, depth: 0.3 });
def('fin_wall', { prog: 'metal', v: 'fin_wall', c: ['#d8dde2', '#7d858e'], p: [6, 0.2, 0, 0], metal: 1, depth: 0.6 });
def('diamond_block', { prog: 'metal', v: 'gem_block', c: ['#2aa8a8', '#62ede4', '#d2fffa', '#1e8a86'], p: [0, 0, 0, 0, 0] });
def('emerald_block', { prog: 'metal', v: 'gem_block', c: ['#0e8a32', '#2ad74f', '#a8ffc0', '#0a6a28'], p: [0, 0, 0, 0, 1] });
def('lapis_block', { prog: 'metal', v: 'lapis_block', c: ['#173a8a', '#2650b0', '#4a78d8'] });
def('redstone_block', { prog: 'metal', v: 'redstone_block', c: ['#8a1208', '#b01e10', '#e04030'] });
def('iron_bars', { prog: 'metal', v: 'iron_bars', cutout: true, metal: 0.8 });
def('iron_door_top', { prog: 'metal', v: 'iron_door', p: [0, 0, 0, 0, 0, 1], cutout: true, metal: 1, seed: nameSeed('iron_door') });
def('iron_door_bottom', { prog: 'metal', v: 'iron_door', p: [0, 0, 0, 0, 0, 0], cutout: true, metal: 1, seed: nameSeed('iron_door') });
def('iron_trapdoor', { prog: 'metal', v: 'iron_trapdoor', cutout: true, metal: 1 });
def('anvil', { prog: 'metal', v: 'anvil', p: [0, 0, 0, 0, 0, 0], metal: 0.6 });
def('anvil_top', { prog: 'metal', v: 'anvil', p: [0, 0, 0, 0, 0, 1], metal: 0.7 });
def('cauldron_side', { prog: 'metal', v: 'cauldron', p: [0, 0, 0, 0, 0, 0], cutout: true, metal: 0.65 });
def('cauldron_top', { prog: 'metal', v: 'cauldron', p: [0, 0, 0, 0, 0, 1], cutout: true, metal: 0.65 });
def('cauldron_bottom', { prog: 'metal', v: 'cauldron', p: [0, 0, 0, 0, 0, 2], cutout: true, metal: 0.65 });
def('hopper_outside', { prog: 'metal', v: 'hopper', p: [0, 0, 0, 0, 0, 0], metal: 0.6 });
def('hopper_top', { prog: 'metal', v: 'hopper', p: [0, 0, 0, 0, 0, 1], metal: 0.6 });
def('chain', { prog: 'metal', v: 'chain', cutout: true, metal: 0.65 });
def('lantern', { prog: 'metal', v: 'lantern', p: [0, 0, 0, 0, 0, 0], cutout: true, metal: 0.6, emit: 1, thr: 0.3 });
def('soul_lantern', { prog: 'metal', v: 'lantern', p: [0, 0, 0, 0, 0, 1], cutout: true, metal: 0.6, emit: 1, thr: 0.3 });

// ---------------------------------------------------------------------------------- glass, ice, gels
def('glass', { prog: 'glass', v: 'glass', c: ['#eef6f8'], p: [0.1, 0.55], cavity: 0 });
def('stained_glass', { prog: 'glass', v: 'glass', c: ['#f6f6f6'], p: [0.45, 0.75], cavity: 0 });
def('ice', { prog: 'glass', v: 'ice', c: ['#7aa6e8', '#b8d4fa'], p: [0.68, 0.8, 0.25], sss: 0.3 });
def('packed_ice', { prog: 'glass', v: 'ice', c: ['#7ea8ee', '#aacafa'], p: [1, 0.6, 0.15], sss: 0.2 });
def('blue_ice', { prog: 'glass', v: 'ice', c: ['#5a90ec', '#88b6fa'], p: [1, 0.9, 0.1], sss: 0.25 });
def('slime_block', { prog: 'glass', v: 'gel', c: ['#7ccf6a', '#56a646', '#9ae68a'], p: [0.55, 0.85, 0], sss: 0.5 });
def('honey_block', { prog: 'glass', v: 'gel', c: ['#f8b83a', '#e09018', '#fcd070'], p: [0.7, 0.9, 1], sss: 0.5 });
def('beacon', { prog: 'glass', v: 'beacon', emit: 1, thr: 0.35, cavity: 0 });
def('sea_lantern', { prog: 'glass', v: 'sea_lantern', emit: 0.9, thr: 0, sss: 0.2 });

// ---------------------------------------------------------------------------------- cloth & neutral tintables
def('wool', { prog: 'cloth', v: 'wool', sss: 0.1 });
def('bed_blanket', { prog: 'cloth', v: 'blanket', sss: 0.1 });
def('terracotta', { prog: 'cloth', v: 'terracotta' });
def('concrete', { prog: 'cloth', v: 'concrete' });
def('sponge', { prog: 'cloth', v: 'sponge', p: [0] });
def('wet_sponge', { prog: 'cloth', v: 'sponge', p: [1] });

// ---------------------------------------------------------------------------------- fluids & portals
def('water_still', { prog: 'fluid', v: 'water', p: [0], depth: 1.2, cavity: 0 });
def('water_flow', { prog: 'fluid', v: 'water', p: [1], depth: 1.2, cavity: 0 });
def('lava_still', { prog: 'fluid', v: 'lava', p: [0], emit: 1, thr: 0.2 });
def('lava_flow', { prog: 'fluid', v: 'lava', p: [1], emit: 1, thr: 0.2 });
def('nether_portal', { prog: 'fluid', v: 'nether_portal', emit: 0.85, thr: 0, cavity: 0 });
def('end_portal', { prog: 'fluid', v: 'end_portal', emit: 1, thr: 0.03, cavity: 0 });

// ---------------------------------------------------------------------------------- organic blocks
const org = (v: string, p: number[] = [], extra: Partial<TexDef> = {}): TexDef => ({ prog: 'organic', v, p, ...extra });
def('pumpkin_side', org('pumpkin_side'));
def('pumpkin_top', org('pumpkin_top'));
def('carved_pumpkin', org('carved', [0], { seed: nameSeed('pumpkin_side') }));
def('jack_o_lantern', org('carved', [1], { seed: nameSeed('pumpkin_side'), emit: 1, thr: 0.42 }));
def('melon_side', org('melon_side'));
def('melon_top', org('melon_top'));
def('hay_block_side', org('hay', [0]));
def('hay_block_top', org('hay', [1]));
def('cactus_side', org('cactus', [0], { sss: 0.25 }));
def('cactus_top', org('cactus', [1], { sss: 0.25 }));
def('cactus_bottom', org('cactus', [2], { sss: 0.25 }));
def('bone_block_side', org('bone', [0]));
def('bone_block_top', org('bone', [1]));
def('nether_wart_block', { ...org('wart'), c: ['#3a0404', '#720b0b', '#a51c16'] });
def('warped_wart_block', { ...org('wart'), c: ['#083438', '#167e86', '#2ab4b0'] });
def('shroomlight', org('shroomlight', [], { emit: 0.85, thr: 0.1 }));
def('chorus_plant', org('chorus', [0]));
def('chorus_flower', org('chorus', [1]));
def('dragon_egg', org('dragon_egg', [], { emit: 0.45, thr: 0.04 }));
def('cake_top', org('cake', [0]));
def('cake_side', org('cake', [1]));
def('cake_bottom', org('cake', [2]));
def('target_side', org('target', [0]));
def('target_top', org('target', [1]));

// ---------------------------------------------------------------------------------- machines
const mach = (v: string, part: number, extra: Partial<TexDef> = {}): TexDef => ({ prog: 'machine', v, p: [part], ...extra });
def('furnace_side', mach('furnace', 0));
def('furnace_top', mach('furnace', 1));
def('furnace_front', mach('furnace', 2, { seed: nameSeed('furnace_front') }));
def('furnace_front_on', mach('furnace', 3, { seed: nameSeed('furnace_front'), emit: 1, thr: 0.32 }));
def('smoker_front', mach('smoker', 0, { emit: 0.4, thr: 0.32 }));
def('smoker_side', mach('smoker', 1));
def('smoker_top', mach('smoker', 2, { metal: 0.5 }));
def('smoker_bottom', mach('smoker', 3));
def('blast_furnace_front', mach('blast', 0, { emit: 0.4, thr: 0.32, metal: 0.5 }));
def('blast_furnace_side', mach('blast', 1));
def('blast_furnace_top', mach('blast', 2, { metal: 0.6 }));
def('dispenser_front', mach('dispenser', 0));
def('dropper_front', mach('dispenser', 1));
def('observer_front', mach('observer', 0));
def('observer_side', mach('observer', 1));
def('observer_back', mach('observer', 2, { seed: nameSeed('observer_back') }));
def('observer_back_on', mach('observer', 3, { seed: nameSeed('observer_back'), emit: 0.9, thr: 0.25 }));
def('piston_top', mach('piston', 0, { seed: nameSeed('piston_top') }));
def('piston_top_sticky', mach('piston', 1, { seed: nameSeed('piston_top') }));
def('piston_top_extended', mach('piston', 2));
def('piston_side', mach('piston', 3));
def('piston_bottom', mach('piston', 4));
def('redstone_lamp', mach('lamp', 0, { seed: nameSeed('redstone_lamp') }));
def('redstone_lamp_on', mach('lamp', 1, { seed: nameSeed('redstone_lamp'), emit: 0.95, thr: 0.12 }));
def('tnt_side', mach('tnt', 0));
def('tnt_top', mach('tnt', 1, { seed: nameSeed('tnt_top') }));
def('tnt_bottom', mach('tnt', 2, { seed: nameSeed('tnt_top') }));
def('enchanting_table_top', mach('enchant', 0));
def('enchanting_table_side', mach('enchant', 1));
def('enchanting_table_bottom', mach('enchant', 2));
def('brewing_stand', mach('brewing', 0, { cutout: true, emit: 0.2, thr: 0.4 }));
def('brewing_stand_base', mach('brewing', 1));
def('spawner', mach('spawner', 0, { cutout: true, metal: 0.8 }));
def('end_portal_frame_top', mach('end_frame', 0, { emit: 0.06, thr: 0 }));
def('end_portal_frame_side', mach('end_frame', 1));
def('ender_chest', mach('ender_chest', 0, { emit: 0.6, thr: 0.4 }));

// ---------------------------------------------------------------------------------- redstone, rails, torches
const rs = (v: string, p: number[], extra: Partial<TexDef> = {}): TexDef => ({ prog: 'redstone', v, p, ...extra });
def('redstone_dust', rs('dust', [0], { cutout: true }));
def('repeater', rs('repeater', [0], { seed: nameSeed('repeater') }));
def('repeater_on', rs('repeater', [1], { seed: nameSeed('repeater'), emit: 0.8, thr: 0.5 }));
def('comparator', rs('comparator', [0], { seed: nameSeed('comparator') }));
def('comparator_on', rs('comparator', [1], { seed: nameSeed('comparator'), emit: 0.8, thr: 0.5 }));
def('rail', rs('rail', [0, 0], { cutout: true, metal: 0.45 }));
def('rail_corner', rs('rail', [0, 1], { cutout: true, metal: 0.45 }));
def('powered_rail', rs('rail', [0, 2], { cutout: true, metal: 0.45, seed: nameSeed('powered_rail') }));
def('powered_rail_on', rs('rail', [1, 2], { cutout: true, metal: 0.45, seed: nameSeed('powered_rail'), emit: 0.6, thr: 0.6 }));
def('detector_rail', rs('rail', [0, 3], { cutout: true, metal: 0.45, seed: nameSeed('detector_rail') }));
def('detector_rail_on', rs('rail', [1, 3], { cutout: true, metal: 0.45, seed: nameSeed('detector_rail'), emit: 0.6, thr: 0.6 }));
def('activator_rail', rs('rail', [0, 4], { cutout: true, metal: 0.45, seed: nameSeed('activator_rail') }));
def('activator_rail_on', rs('rail', [1, 4], { cutout: true, metal: 0.45, seed: nameSeed('activator_rail'), emit: 0.5, thr: 0.6 }));
def('torch', rs('torch', [0], { cutout: true, emit: 1, thr: 0.25 }));
def('soul_torch', rs('torch', [1], { cutout: true, emit: 1, thr: 0.2 }));
def('redstone_torch', rs('torch', [2], { cutout: true, emit: 0.9, thr: 0.18, seed: nameSeed('redstone_torch') }));
def('redstone_torch_off', rs('torch', [3], { cutout: true, seed: nameSeed('redstone_torch') }));
def('lever', rs('lever', [0], { cutout: true }));
def('end_rod', rs('end_rod', [0], { cutout: true, emit: 1, thr: 0.3 }));
def('fire', rs('fire', [0], { cutout: true, emit: 1, thr: 0 }));
def('soul_fire', rs('fire', [1], { cutout: true, emit: 1, thr: 0 }));
def('flower_pot', rs('pot', [0]));

// ---------------------------------------------------------------------------------- wood
interface WoodSpec { planks: Hex[]; pp: number[]; bark: Hex[]; b0: number[]; b1: number[]; top: Hex[]; tp: number[]; log: string; top_: string }
export const WOOD: Record<string, WoodSpec> = {
  oak: { planks: ['#7d6338', '#a2834f', '#b9975c', '#4a361c'], pp: [0.2, 0.42, 0.25, 0],
    bark: ['#2e2214', '#4f3c22', '#6d5532', '#87704a', '#3a2c1a', '#4b5a22'], b0: [7, 0.7, 0, 0], b1: [0.88, 1, 0, 0],
    top: ['#8a6a3c', '#b08d58', '#c4a068', '#6d5532', '#4a3a22', '#9e7c48'], tp: [9, 0.6, 0.6, 1], log: 'oak_log', top_: 'oak_log_top' },
  spruce: { planks: ['#5a4126', '#735531', '#87663d', '#34230f'], pp: [0.2, 0.42, 0.3, 0],
    bark: ['#1c140b', '#2e2112', '#3d2c18', '#57432a', '#2a1e10', '#3a4a20'], b0: [9, 0.4, 0, 0.8], b1: [0.85, 1, 0, 0],
    top: ['#5a4022', '#7a5a34', '#8c6a40', '#3d2c18', '#2a1e10', '#6e4f2c'], tp: [12, 0.6, 0.5, 1], log: 'spruce_log', top_: 'spruce_log_top' },
  birch: { planks: ['#a8955e', '#c0af79', '#d4c48f', '#7a6943'], pp: [0.14, 0.42, 0.15, 0],
    bark: ['#c2c5bd', '#d2d5cd', '#e0e3db', '#f0f2ed', '#1e1a17', '#26221e'], b0: [10, 0.15, 1, 0], b1: [0.55, 0.25, 1, 0],
    top: ['#a8925c', '#cdb984', '#dccb98', '#d8dcd4', '#8f8f88', '#bfa870'], tp: [8, 0.6, 0.4, 1], log: 'birch_log', top_: 'birch_log_top' },
  jungle: { planks: ['#835c3d', '#a07350', '#b5875f', '#563a24'], pp: [0.2, 0.42, 0.2, 0],
    bark: ['#2c2410', '#4a3c1c', '#5c4b23', '#74602e', '#3a2e14', '#4b5a22'], b0: [8, 0.5, 0, 0], b1: [0.85, 1, 0.25, 0],
    top: ['#8a6440', '#a87c56', '#ba8e66', '#5c4b23', '#3e3216', '#9a6c48'], tp: [9, 0.6, 0.5, 1], log: 'jungle_log', top_: 'jungle_log_top' },
  acacia: { planks: ['#8a4724', '#a85a32', '#be6c3f', '#5a2c14'], pp: [0.16, 0.42, 0.2, 0],
    bark: ['#3a3631', '#57524a', '#676157', '#7d776c', '#48433c', '#4b5a22'], b0: [7, 0.6, 0, 0], b1: [0.85, 1, 0, 0],
    top: ['#8e4a28', '#b05e34', '#c2703f', '#676157', '#48433c', '#a05530'], tp: [10, 0.6, 0.5, 1], log: 'acacia_log', top_: 'acacia_log_top' },
  dark_oak: { planks: ['#2f1c10', '#42291a', '#573624', '#1a0f07'], pp: [0.2, 0.42, 0.25, 0],
    bark: ['#1a120a', '#2d2214', '#3c2e1a', '#4f3e25', '#20180e', '#3a4a20'], b0: [6, 0.8, 0, 0], b1: [0.9, 1.1, 0, 0],
    top: ['#3a2614', '#563a22', '#64452a', '#3c2e1a', '#261c10', '#4a3018'], tp: [8, 0.6, 0.6, 1], log: 'dark_oak_log', top_: 'dark_oak_log_top' },
  cherry: { planks: ['#c89383', '#e2b1a1', '#eec6b8', '#96685c'], pp: [0.12, 0.42, 0.1, -0.05],
    bark: ['#1e1014', '#2e181e', '#3a2027', '#4d2c33', '#6a4048', '#3a4a20'], b0: [10, 0.2, 0.8, 0], b1: [0.75, 0.6, 0, 0],
    top: ['#a87870', '#c89890', '#d6aca4', '#3a2027', '#261418', '#b88880'], tp: [9, 0.6, 0.4, 1], log: 'cherry_log', top_: 'cherry_log_top' },
  crimson: { planks: ['#52263d', '#6a344b', '#80425b', '#321422'], pp: [0.16, 0.42, 0, 0],
    bark: ['#2a0d14', '#4a1520', '#5c1d2a', '#7a2a3a', '#943349', '#d24a3a'], b0: [9, 0.3, 0, 0], b1: [0.8, 0.8, 0.15, 0.5],
    top: ['#7a2030', '#a03848', '#b84a58', '#5c1d2a', '#2a0d14', '#c45a5a'], tp: [7, 0.7, 0, 1.2], log: 'crimson_stem', top_: 'crimson_stem_top' },
  warped: { planks: ['#1f524d', '#2b6963', '#377f78', '#12302d'], pp: [0.16, 0.42, 0, 0],
    bark: ['#141c24', '#263038', '#39424c', '#4a5560', '#1f8a84', '#30c0b0'], b0: [9, 0.3, 0, 0], b1: [0.8, 0.8, 0.12, 0.6],
    top: ['#1c6e68', '#2a8c84', '#36a098', '#39424c', '#141c24', '#48b0a6'], tp: [7, 0.7, 0, 1.2], log: 'warped_stem', top_: 'warped_stem_top' },
};
for (const [w, s] of Object.entries(WOOD)) {
  def(`${w}_planks`, { prog: 'wood', v: 'planks', c: s.planks, p: s.pp });
  def(s.log, { prog: 'wood', v: 'bark', c: s.bark, p: [...s.b0, ...s.b1], depth: 1.2 });
  def(s.top_, { prog: 'wood', v: 'log_top', c: s.top, p: s.tp });
}

// ---------------------------------------------------------------------------------- woodwork
const DOOR_STYLE: Record<string, [number, number]> = {
  // [door top window style, trapdoor hole style] (see woodwork.glsl holes())
  oak: [1, 7], spruce: [6, 0], birch: [2, 10], jungle: [3, 3], acacia: [4, 9], dark_oak: [8, 8], cherry: [5, 1],
};
for (const [w, [ds, ts]] of Object.entries(DOOR_STYLE)) {
  const c = WOOD[w].planks;
  def(`${w}_door_top`, { prog: 'woodwork', v: 'door', c, p: [0, ds, 1], cutout: true, seed: nameSeed(`${w}_door`) });
  def(`${w}_door_bottom`, { prog: 'woodwork', v: 'door', c, p: [0, ds, 0], cutout: true, seed: nameSeed(`${w}_door`) });
  def(`${w}_trapdoor`, { prog: 'woodwork', v: 'trapdoor', c, p: [ts], cutout: true });
}
const OAK_C = WOOD.oak.planks;
const ww = (v: string, part: number, c: Hex[] = OAK_C, extra: Partial<TexDef> = {}): TexDef => ({ prog: 'woodwork', v, c, p: [part], ...extra });
def('crafting_table_top', ww('crafting', 0));
def('crafting_table_front', ww('crafting', 1));
def('crafting_table_side', ww('crafting', 2));
def('chest', ww('chest', 0));
def('barrel_side', ww('barrel', 0, WOOD.spruce.planks));
def('barrel_top', ww('barrel', 1, WOOD.spruce.planks));
def('barrel_bottom', ww('barrel', 2, WOOD.spruce.planks));
def('bookshelf', ww('bookshelf', 0));
const JUKE_C = ['#45291b', '#5f3c2a', '#744c36', '#24150c'];
def('jukebox_side', ww('jukebox', 0, JUKE_C));
def('jukebox_top', ww('jukebox', 1, JUKE_C));
def('note_block', ww('note', 0, JUKE_C));
def('ladder', ww('ladder', 0, OAK_C, { cutout: true }));
def('scaffolding_side', ww('scaffold', 0, OAK_C, { cutout: true }));
def('scaffolding_top', ww('scaffold', 1, OAK_C, { cutout: true }));
def('scaffolding_bottom', ww('scaffold', 2, OAK_C, { cutout: true }));
def('campfire_log', ww('campfire', 0, OAK_C, { emit: 1, thr: 0.1 }));
def('daylight_detector_top', ww('daylight', 0));
def('daylight_detector_side', ww('daylight', 1));

def('reinforced_deepslate', mas(['#1c2224', '#262e30', '#323b3e', '#141819', '#2a3234'], [2, 1, 1, 0, 0, 0.5, 0, 0, 5, 0.4, 0.7, 0.6, 0, 0, 8, 0]));

// --- blocks appended by world generation ---------------------------------------------------
def('raw_copper_block', { prog: 'rock', v: 'raw', c: ['#7a4428', '#b06a44', '#d8946a', '#47240f'], p: [0.6, 18], metal: 0.6 });
def('smooth_basalt', rockDef(['#3c3c42', '#48484e', '#55555b', '#323237', '#5e5e64'], [6, 0.35, 0.03, 0.04, 0.05, 0.05, 0.2, 0, 0.55, 0.6, 24, 3, 0.3, 0.3, 0.4, 0.3], { depth: 0.8 }));
def('mushroom_stem', { ...org('wart'), c: ['#c9bfa9', '#ddd5c2', '#efe9dc'], sss: 0.15 });
def('brown_mushroom_block', { ...org('wart'), c: ['#6a4b33', '#8c6847', '#a8825b'], seed: nameSeed('brown_mushroom_block') });
def('red_mushroom_block', { ...org('wart'), c: ['#8c1210', '#bd2420', '#d84a40'], seed: nameSeed('red_mushroom_block') });
def('powder_snow', { prog: 'soil', v: 'snow', sss: 0.4, seed: nameSeed('powder_snow') });
def('twisting_vines', { prog: 'foliage', v: 'weeping', cutout: true, sss: 0.4, c: ['#0d6e66', '#17958a', '#30bfae'], seed: nameSeed('twisting_vines') });

// --- blocks appended by the structures workstream (village job sites, bell) -----------------
const DARK_C = WOOD.dark_oak.planks, BIRCH_C = WOOD.birch.planks, SPRUCE_C = WOOD.spruce.planks;
def('composter_side', ww('barrel', 0, OAK_C, { seed: nameSeed('composter') }));
def('lectern_top', ww('bookshelf', 0, OAK_C, { seed: nameSeed('lectern') }));
def('lectern_side', ww('crafting', 2, OAK_C, { seed: nameSeed('lectern_side') }));
def('smithing_table_top', { prog: 'metal', v: 'metal_block', c: ['#3a3a40', '#26262a'], p: [0.8, 0.6, 0.3, 0.08, 0], metal: 0.8 });
def('smithing_table_side', ww('crafting', 2, DARK_C, { seed: nameSeed('smithing_table') }));
def('smithing_table_front', ww('crafting', 1, DARK_C, { seed: nameSeed('smithing_table_front') }));
def('cartography_table_top', ww('crafting', 0, ['#a89a78', '#cbbd98', '#e2d6b4', '#6e5f40'], { seed: nameSeed('cartography_table') }));
def('cartography_table_side', ww('crafting', 2, DARK_C, { seed: nameSeed('cartography_table_side') }));
def('fletching_table_top', ww('crafting', 0, BIRCH_C, { seed: nameSeed('fletching_table') }));
def('fletching_table_side', ww('crafting', 2, BIRCH_C, { seed: nameSeed('fletching_table_side') }));
def('fletching_table_front', ww('crafting', 1, BIRCH_C, { seed: nameSeed('fletching_table_front') }));
def('loom_top', ww('crafting', 0, SPRUCE_C, { seed: nameSeed('loom') }));
def('loom_side', ww('barrel', 0, SPRUCE_C, { seed: nameSeed('loom_side') }));
def('loom_front', ww('crafting', 1, SPRUCE_C, { seed: nameSeed('loom_front') }));
def('stonecutter_top', { prog: 'metal', v: 'metal_block', c: ['#9a9a9a', '#6a6a6a'], p: [0.6, 0.5, 0.3, 0.08, 0], metal: 0.9 });
def('stonecutter_side', mach('furnace', 0, { seed: nameSeed('stonecutter') }));
def('grindstone_round', mach('furnace', 1, { seed: nameSeed('grindstone') }));
def('grindstone_side', mach('furnace', 0, { seed: nameSeed('grindstone_side') }));
def('bell_body', { prog: 'metal', v: 'metal_block', c: ['#f0c040', '#b88a18'], p: [0.4, 0.5, 0.2, 0.12, 1], metal: 1 });
