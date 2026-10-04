/**
 * How blocks react to violent wind and shaking (tornado ripping, earthquake crumbling).
 * Tables are built lazily from the block registry (indexed by block id).
 */
import { BLOCKS, type BlockDef } from '../../../world/blocks/registry';

export const enum Mat {
  /** Air, liquids, unbreakable, spawners: never touched. */
  None = 0,
  /** Small non-solid things (plants, torches, carpets, snow layers): shredded to bits. */
  Plant = 1,
  /** Glass and panes: shatter. */
  Glass = 2,
  Leaves = 3,
  /** Logs and wood: trees and timber. */
  Wood = 4,
  /** Natural loose ground (dirt, grass, sand, gravel, snow, clay). */
  Ground = 5,
  /** Man-made building blocks (planks, bricks, wool, cobblestone, ...). */
  Built = 6,
  /** Natural rock (stone, ores, deepslate, terracotta ...). */
  Rock = 7,
}

let MAT: Uint8Array | null = null;
let RES: Float32Array | null = null;

const GROUND = new Set(['dirt', 'grass_block', 'coarse_dirt', 'podzol', 'rooted_dirt', 'mycelium', 'farmland', 'dirt_path', 'mud', 'sand', 'red_sand', 'gravel', 'clay', 'snow_block', 'soul_sand', 'soul_soil', 'moss_block']);
const ROCK_TAGS = ['base_stone', 'ore', 'stone_ore', 'deepslate_ore', 'terracotta', 'base_stone_nether'];

function classify(d: BlockDef): [Mat, number] {
  if (!d || d.isAir || d.liquid || d.hardness < 0) return [Mat.None, Infinity];
  const n = d.name;
  if (n === 'tornado' || n === 'earthquake' || n === 'volcano' || n === 'tsunami' || n === 'asteroid') return [Mat.None, Infinity];
  if (n === 'obsidian' || n === 'crying_obsidian' || n === 'reinforced_deepslate' || n.includes('portal')) return [Mat.None, Infinity];
  const tags = d.tags ?? [];
  if (d.sound === 'glass' && (n.includes('glass') || d.shape === 'pane')) return [Mat.Glass, 0.15];
  if (d.shape === 'leaves' || tags.includes('leaves')) return [Mat.Leaves, 0.12];
  if (!d.solid || d.shape === 'cross' || d.shape === 'double_plant' || d.shape === 'crop' || d.shape === 'snow_layer' || d.shape === 'carpet' || d.shape === 'torch' || d.shape === 'vine' || d.shape === 'lily_pad') {
    return [Mat.Plant, 0.05];
  }
  if (GROUND.has(n) || tags.includes('dirt') || tags.includes('sand')) {
    const loose = d.gravity ? 0.42 : n === 'grass_block' ? 0.48 : 0.55;
    return [Mat.Ground, loose];
  }
  if (tags.includes('logs') || n.endsWith('_log') || n.endsWith('_wood') || n.endsWith('_stem') || n.endsWith('_hyphae')) return [Mat.Wood, 0.5];
  if (tags.some((t) => ROCK_TAGS.includes(t)) || n === 'stone' || n === 'bedrock') return [Mat.Rock, 1.6];
  // man-made: wood is easy, masonry and metal hard
  const s = d.sound;
  if (s === 'wood' || s === 'wool' || s === 'scaffold' || s === 'ladder' || s === 'bone') return [Mat.Built, 0.38];
  if (d.gravity) return [Mat.Ground, 0.45];
  const h = d.hardness;
  return [Mat.Built, Math.min(1.5, 0.45 + h * 0.3)];
}

function build() {
  MAT = new Uint8Array(4096);
  RES = new Float32Array(4096).fill(Infinity);
  for (const d of BLOCKS) {
    if (!d) continue;
    const [m, r] = classify(d);
    MAT[d.id] = m;
    RES[d.id] = r;
  }
}

/** Material class of a block state. */
export function matOf(state: number): Mat {
  if (!MAT) build();
  return MAT![state >>> 4] as Mat;
}

/** Wind speed fraction (0..1+ of a full-strength tornado core) needed to tear the block out. */
export function windResistance(state: number): number {
  if (!RES) build();
  return RES![state >>> 4];
}

/** Earthquake fragility 0..1 (chance scale that shaking knocks the block loose). */
export function fragility(state: number): number {
  switch (matOf(state)) {
    case Mat.Glass: return 1;
    case Mat.Plant: return 0.6;
    case Mat.Built: return Math.max(0.15, 0.9 - windResistance(state) * 0.5);
    case Mat.Leaves: return 0.3;
    case Mat.Wood: return 0.25;
    case Mat.Ground: return BLOCKS[state >>> 4]?.gravity ? 0.9 : 0.1;
    default: return 0;
  }
}

/** For tests: rebuild after the registry changed. */
export function resetMaterialTables() {
  MAT = null;
  RES = null;
}
