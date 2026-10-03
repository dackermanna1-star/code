/**
 * Village variants (plains, desert, savanna, taiga, snowy): block palettes and biome mapping.
 */
import { biomeId } from '../../../biomes';
import { B } from '../lib/blocks';

export type VillageVariant = 'plains' | 'desert' | 'savanna' | 'taiga' | 'snowy';

export interface Palette {
  variant: VillageVariant;
  /** Wall fill. */
  wall: number;
  /** Corner posts / frame (vertical). */
  post: number;
  /** Interior floor. */
  floor: number;
  /** Foundation fill (down to the ground) and the base row of walls. */
  foundation: number;
  /** Roof stairs block name (gable roofs), null = flat roof. */
  roofStairs: string | null;
  /** Roof slab block name. */
  roofSlab: string;
  /** Flat roof / ridge block. */
  roofBlock: number;
  /** Gable-end fill. */
  gable: number;
  window: number;
  door: string;
  fence: number;
  path: number;
  /** Plaza / accent stone. */
  accent: number;
  bed: string;
  /** Short loot table for ordinary houses. */
  houseLoot: string;
  /** Ground block outside buildings. */
  ground: number;
  sapling: number;
}

export function palette(v: VillageVariant): Palette {
  switch (v) {
    case 'desert':
      return {
        variant: v, wall: B('sandstone'), post: B('cut_sandstone'), floor: B('smooth_sandstone'), foundation: B('sandstone'),
        roofStairs: null, roofSlab: 'sandstone_slab', roofBlock: B('smooth_sandstone'), gable: B('sandstone'), window: 0,
        door: 'jungle_door', fence: B('sandstone_wall'), path: B('smooth_sandstone'), accent: B('cut_sandstone'), bed: 'green_bed',
        houseLoot: 'village_desert_house', ground: B('sand'), sapling: B('dead_bush'),
      };
    case 'savanna':
      return {
        variant: v, wall: B('acacia_planks'), post: B('acacia_log'), floor: B('acacia_planks'), foundation: B('cobblestone'),
        roofStairs: 'acacia_stairs', roofSlab: 'acacia_slab', roofBlock: B('acacia_planks'), gable: B('orange_terracotta'), window: B('glass_pane'),
        door: 'acacia_door', fence: B('acacia_fence'), path: B('dirt_path'), accent: B('yellow_terracotta'), bed: 'orange_bed',
        houseLoot: 'village_savanna_house', ground: B('grass_block'), sapling: B('acacia_sapling'),
      };
    case 'taiga':
      return {
        variant: v, wall: B('spruce_planks'), post: B('spruce_log'), floor: B('spruce_planks'), foundation: B('cobblestone'),
        roofStairs: 'spruce_stairs', roofSlab: 'spruce_slab', roofBlock: B('spruce_planks'), gable: B('spruce_planks'), window: B('glass_pane'),
        door: 'spruce_door', fence: B('spruce_fence'), path: B('dirt_path'), accent: B('mossy_cobblestone'), bed: 'brown_bed',
        houseLoot: 'village_taiga_house', ground: B('grass_block'), sapling: B('spruce_sapling'),
      };
    case 'snowy':
      return {
        variant: v, wall: B('snow_block'), post: B('spruce_log'), floor: B('spruce_planks'), foundation: B('stone_bricks'),
        roofStairs: 'spruce_stairs', roofSlab: 'spruce_slab', roofBlock: B('spruce_planks'), gable: B('spruce_planks'), window: B('glass_pane'),
        door: 'spruce_door', fence: B('spruce_fence'), path: B('dirt_path'), accent: B('packed_ice'), bed: 'blue_bed',
        houseLoot: 'village_snowy_house', ground: B('snow_block'), sapling: B('spruce_sapling'),
      };
    default:
      return {
        variant: 'plains', wall: B('oak_planks'), post: B('oak_log'), floor: B('oak_planks'), foundation: B('cobblestone'),
        roofStairs: 'oak_stairs', roofSlab: 'oak_slab', roofBlock: B('oak_planks'), gable: B('oak_planks'), window: B('glass_pane'),
        door: 'oak_door', fence: B('oak_fence'), path: B('dirt_path'), accent: B('cobblestone'), bed: 'red_bed',
        houseLoot: 'village_plains_house', ground: B('grass_block'), sapling: B('oak_sapling'),
      };
  }
}

const BIOME_VARIANT = new Map<number, VillageVariant>();
for (const [n, v] of [
  ['plains', 'plains'], ['sunflower_plains', 'plains'], ['meadow', 'plains'],
  ['desert', 'desert'],
  ['savanna', 'savanna'], ['savanna_plateau', 'savanna'],
  ['taiga', 'taiga'],
  ['snowy_plains', 'snowy'],
] as [string, VillageVariant][]) BIOME_VARIANT.set(biomeId(n), v);

export const villageVariantFor = (biome: number): VillageVariant | undefined => BIOME_VARIANT.get(biome);
