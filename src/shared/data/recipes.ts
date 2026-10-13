import { itemDef } from './items';

/**
 * Crafting recipes. `bench` = required workbench level in range (0 = none).
 * `known` recipes are available from the start of every wipe; everything
 * else must be learned at a Research Table (blueprints wipe with the map
 * unless the server config keeps them).
 */
export interface Recipe {
  id: string;
  out: string;
  count: number;
  ing: Array<[string, number]>;
  /** Seconds per craft. */
  time: number;
  bench: 0 | 1 | 2 | 3;
  known: boolean;
  category: 'Tools' | 'Weapons' | 'Ammo' | 'Explosives' | 'Construction' | 'Items' | 'Clothing' | 'Medical' | 'Resources' | 'Blocks';
}

const R: Recipe[] = [];
const r = (out: string, count: number, ing: Array<[string, number]>, time: number, bench: 0 | 1 | 2 | 3, known: boolean, category: Recipe['category']) =>
  R.push({ id: out, out, count, ing, time, bench, known, category });

// Tools
r('rock', 1, [['stone', 10]], 1, 0, true, 'Tools');
r('torch', 1, [['wood', 15], ['cloth', 2]], 2, 0, true, 'Tools');
r('building_plan', 1, [['wood', 20]], 2, 0, true, 'Tools');
r('hammer', 1, [['wood', 100]], 3, 0, true, 'Tools');
r('stone_hatchet', 1, [['wood', 150], ['stone', 75]], 6, 0, true, 'Tools');
r('stone_pickaxe', 1, [['wood', 150], ['stone', 75]], 6, 0, true, 'Tools');
r('metal_hatchet', 1, [['wood', 100], ['metal_frag', 75]], 10, 1, false, 'Tools');
r('metal_pickaxe', 1, [['wood', 100], ['metal_frag', 125]], 10, 1, false, 'Tools');

// Weapons
r('wooden_spear', 1, [['wood', 250]], 6, 0, true, 'Weapons');
r('hunting_bow', 1, [['wood', 200], ['cloth', 50]], 10, 0, true, 'Weapons');
r('machete', 1, [['metal_frag', 50], ['wood', 50]], 10, 1, false, 'Weapons');
r('crossbow', 1, [['wood', 200], ['metal_frag', 75], ['rope', 2]], 15, 1, false, 'Weapons');
r('pipe_pistol', 1, [['metal_frag', 75], ['wood', 50], ['metal_pipe', 1]], 20, 1, false, 'Weapons');
r('scrap_shotgun', 1, [['metal_frag', 100], ['wood', 75], ['metal_pipe', 2]], 20, 1, false, 'Weapons');
r('lever_rifle', 1, [['metal_frag', 150], ['hq_metal', 5], ['metal_pipe', 2], ['spring', 1]], 30, 2, false, 'Weapons');
r('service_rifle', 1, [['hq_metal', 50], ['wood', 200], ['spring', 4], ['metal_pipe', 2]], 60, 3, false, 'Weapons');
r('marksman_rifle', 1, [['hq_metal', 40], ['metal_pipe', 3], ['spring', 2]], 60, 3, false, 'Weapons');

// Ammo
r('wooden_arrow', 2, [['wood', 25], ['stone', 10]], 2, 0, true, 'Ammo');
r('pistol_ammo', 4, [['metal_frag', 5], ['gunpowder', 5]], 3, 1, true, 'Ammo');
r('shotgun_shell', 2, [['metal_frag', 5], ['gunpowder', 5]], 3, 1, true, 'Ammo');
r('rifle_ammo', 3, [['metal_frag', 10], ['gunpowder', 15]], 4, 2, true, 'Ammo');

// Explosives
r('tin_grenade', 1, [['metal_frag', 20], ['gunpowder', 50]], 8, 1, false, 'Explosives');
r('fuse_charge', 1, [['tin_grenade', 4], ['rope', 1], ['cloth', 10]], 12, 1, false, 'Explosives');
r('explosive_compound', 1, [['gunpowder', 50], ['low_grade_fuel', 3], ['sulfur', 10], ['metal_frag', 10]], 5, 2, true, 'Explosives');
r('breach_charge', 1, [['explosive_compound', 20], ['cloth', 5], ['tech_parts', 2]], 30, 3, false, 'Explosives');

// Resources
r('gunpowder', 10, [['charcoal', 30], ['sulfur', 20]], 2, 1, true, 'Resources');
r('low_grade_fuel', 4, [['animal_fat', 3], ['cloth', 1]], 2, 0, true, 'Resources');
r('rope', 1, [['cloth', 15]], 3, 0, true, 'Resources');

// Medical
r('bandage', 1, [['cloth', 4]], 2, 0, true, 'Medical');
r('medical_syringe', 1, [['cloth', 15], ['low_grade_fuel', 10], ['metal_frag', 5]], 8, 1, false, 'Medical');

// Clothing
r('burlap_hood', 1, [['cloth', 10]], 4, 0, true, 'Clothing');
r('burlap_shirt', 1, [['cloth', 15]], 5, 0, true, 'Clothing');
r('burlap_trousers', 1, [['cloth', 15]], 5, 0, true, 'Clothing');
r('burlap_shoes', 1, [['cloth', 10]], 4, 0, true, 'Clothing');
r('hide_gloves', 1, [['leather', 5]], 4, 0, true, 'Clothing');
r('fur_vest', 1, [['leather', 15], ['cloth', 10]], 8, 0, true, 'Clothing');
r('wood_armor', 1, [['wood', 300], ['rope', 1]], 10, 0, true, 'Clothing');
r('can_helmet', 1, [['metal_frag', 80], ['leather', 5]], 10, 1, false, 'Clothing');
r('road_kilt', 1, [['metal_frag', 150], ['leather', 10]], 12, 1, false, 'Clothing');
r('metal_chestplate', 1, [['hq_metal', 25], ['leather', 20], ['sewing_kit', 1]], 30, 2, false, 'Clothing');
r('metal_facemask', 1, [['hq_metal', 15], ['leather', 10], ['sewing_kit', 1]], 30, 2, false, 'Clothing');
r('hazmat_suit', 1, [['cloth', 80], ['hq_metal', 6], ['tech_parts', 1]], 30, 2, false, 'Clothing');

// Construction / deployables
r('campfire', 1, [['wood', 100]], 3, 0, true, 'Items');
r('sleeping_bag', 1, [['cloth', 30]], 5, 0, true, 'Items');
r('small_box', 1, [['wood', 100]], 3, 0, true, 'Items');
r('large_box', 1, [['wood', 250], ['metal_frag', 50]], 8, 1, true, 'Items');
r('furnace', 1, [['stone', 200], ['wood', 100], ['low_grade_fuel', 20]], 10, 0, true, 'Items');
r('claim_totem', 1, [['wood', 1000]], 15, 0, true, 'Construction');
r('wooden_door', 1, [['wood', 300]], 8, 0, true, 'Construction');
r('metal_door', 1, [['metal_frag', 150]], 12, 1, true, 'Construction');
r('armored_door', 1, [['hq_metal', 20], ['metal_frag', 100], ['gears', 2]], 25, 2, false, 'Construction');
r('code_lock', 1, [['metal_frag', 100]], 6, 0, true, 'Construction');
r('workbench1', 1, [['wood', 500], ['metal_frag', 100], ['scrap', 50]], 20, 0, true, 'Items');
r('workbench2', 1, [['metal_frag', 500], ['hq_metal', 20], ['scrap', 500]], 30, 1, true, 'Items');
r('workbench3', 1, [['metal_frag', 1000], ['hq_metal', 100], ['scrap', 1250]], 60, 2, true, 'Items');
r('research_table', 1, [['metal_frag', 200], ['scrap', 20]], 10, 1, true, 'Items');

// Freeform blocks
r('planks', 4, [['wood', 20]], 1, 0, true, 'Blocks');
r('cobblestone', 4, [['stone', 20]], 1, 0, true, 'Blocks');
r('bricks', 4, [['stone', 20], ['clay', 1]], 2, 0, true, 'Blocks');
r('glass', 2, [['sand', 2], ['charcoal', 5]], 2, 1, true, 'Blocks');

export const RECIPES: readonly Recipe[] = R;
const byId = new Map(R.map((x) => [x.id, x]));
export const recipe = (id: string) => byId.get(id);

/** Scrap cost to research an item at the research table, by required bench level. */
export const RESEARCH_COST = [20, 75, 125, 500];

export function researchCost(itemKey: string): number | null {
  const rec = byId.get(itemKey);
  if (!rec || rec.known) return null;
  return RESEARCH_COST[rec.bench];
}

// Validate on load: every ingredient and output must exist.
for (const x of R) {
  itemDef(x.out);
  for (const [k] of x.ing) itemDef(k);
}
