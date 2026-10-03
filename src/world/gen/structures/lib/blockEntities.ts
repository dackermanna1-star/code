/**
 * Block-entity data written by world generation (the contract with the container / spawner
 * systems). Generated chunks carry `blockEntities: { x, y, z, data }[]` (world coordinates), and
 * `chunkFromGenerated` copies them into `chunk.blockEntities`, read with `world.getBlockEntity`.
 *
 *  - Loot containers (chest, barrel, trapped chest):
 *      `{ id: 'chest', type: 'chest', lootTable: 'minecraft:chests/village/village_weaponsmith',
 *         loot: 'village_weaponsmith', lootSeed: <int> }`
 *    `lootTable` is the vanilla resource id; `loot` is its last path segment (the short name used by
 *    `resolveLootTable`); `lootSeed` makes the roll deterministic per chest. The contents are
 *    rolled lazily (on first open / break) by the container system. Optional `items` (fixed
 *    contents) may be added as `[{ slot, item, count }]`.
 *  - Spawners: `{ id: 'mob_spawner', type: 'spawner', entity: 'zombie', mob: 'zombie' }`.
 *  - Markers that need entity support later (end-city elytra item frame, shulkers ...) are
 *    written as generated entities (`writer.entity(type, x, y, z, data)`), e.g.
 *    `item_frame { item: 'elytra', facing }` and `shulker { color: 'purple' }`; unknown entity types
 *    are skipped by the game until someone registers them.
 */

/** Vanilla chest loot table ids used by the structures. */
export const LOOT = {
  village: (name: string) => `minecraft:chests/village/${name}`,
  dungeon: 'minecraft:chests/simple_dungeon',
  mineshaft: 'minecraft:chests/abandoned_mineshaft',
  desertPyramid: 'minecraft:chests/desert_pyramid',
  jungleTemple: 'minecraft:chests/jungle_temple',
  jungleDispenser: 'minecraft:chests/jungle_temple_dispenser',
  igloo: 'minecraft:chests/igloo_chest',
  outpost: 'minecraft:chests/pillager_outpost',
  shipwreckMap: 'minecraft:chests/shipwreck_map',
  shipwreckSupply: 'minecraft:chests/shipwreck_supply',
  shipwreckTreasure: 'minecraft:chests/shipwreck_treasure',
  ruinSmall: 'minecraft:chests/underwater_ruin_small',
  ruinBig: 'minecraft:chests/underwater_ruin_big',
  buriedTreasure: 'minecraft:chests/buried_treasure',
  ruinedPortal: 'minecraft:chests/ruined_portal',
  strongholdCorridor: 'minecraft:chests/stronghold_corridor',
  strongholdCrossing: 'minecraft:chests/stronghold_crossing',
  strongholdLibrary: 'minecraft:chests/stronghold_library',
  netherBridge: 'minecraft:chests/nether_bridge',
  bastionTreasure: 'minecraft:chests/bastion_treasure',
  bastionOther: 'minecraft:chests/bastion_other',
  bastionBridge: 'minecraft:chests/bastion_bridge',
  bastionHoglinStable: 'minecraft:chests/bastion_hoglin_stable',
  endCity: 'minecraft:chests/end_city_treasure',
  mansion: 'minecraft:chests/woodland_mansion',
  ancientCity: 'minecraft:chests/ancient_city',
  ancientCityIceBox: 'minecraft:chests/ancient_city_ice_box',
  trailRuins: 'minecraft:chests/trail_ruins',
} as const;

/** Short loot name: the last path segment of a vanilla id. */
export const lootShortName = (table: string) => table.slice(table.lastIndexOf('/') + 1).replace(/^minecraft:/, '');

export function chestData(lootTable: string, seed: number, extra?: Record<string, unknown>): Record<string, unknown> {
  const d: Record<string, unknown> = { id: 'chest', type: 'chest', lootTable, loot: lootShortName(lootTable), lootSeed: seed | 0 };
  if (extra) Object.assign(d, extra);
  return d;
}

export function spawnerData(entity: string): Record<string, unknown> {
  return { id: 'mob_spawner', type: 'spawner', entity, mob: entity };
}
