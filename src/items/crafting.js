// CRAFTING
//
//   RECIPES                          array of recipe defs (see shape below)
//   getRecipe(id)
//   getRecipeStatus(inv, ctx)        -> [{recipe, canCraft, missing, inputs, tools, station, skill, resultCount}]
//   getRecipeStatusFor(inv, recipe, ctx)
//   craft(inv, recipeOrId, ctx)      -> {ok, message, results, xp}
//   ctx = {nearFire, nearWorkbench, skills: {name: level}, nowHours? (game hour, stamps cooked food freshness)}
//
// Recipe: {id, name, category, desc, time /*seconds*/, inputs, tools, station: null|'fire'|'workbench',
//          skill?: {name, level}, result: {id, count, uses?, data?}, xp: {skill, amount} | null, ...special}
// Input spec (consumed):
//   {item: id | [ids], count}          whole items
//   {tag: tag | [tags], count}         any item with the tag (e.g. 'fabric')
//   {item | tag, uses}                 uses taken from the stack(s) (duct tape, disinfectant, whetstone...)
//   {liquid: id | [ids], uses}         liquid units taken from liquid containers (gas can → 'gasoline')
//   inherit: true                      the result keeps this input's condition (bat → nailed bat)
// Tool spec (kept, optionally worn): {item | tag (string or array), label, wear? /*durability (or uses) lost*/}
// Special recipe kinds:
//   transform: {from, to, max}         purify / boil: converts whole containers of `from` liquid (≤ max units total)
//   repair: {tags?, categories?, melee?, firearm?, clothing?, amount}  restores the most worn matching item
//   rags: 'hands' | 'blade'           rag yield scales with the weight of the ripped garment
//   byproducts: [{id, count, chance}]  extra results (runtime randomness: Math.random is fine here)
// Transform / repair recipes have `result: {id, count: 0, displayOnly}` — the id is only for the UI icon.
// Worn equipment and bags/clothes that still have something inside are never consumed.

import { getItemDef, createItem, LIQUIDS, ITEM_TAGS, itemClockHours } from './items.js';

export const RECIPE_CATEGORIES = ['Medical', 'Survival', 'Food', 'Weapons', 'Ammo', 'Explosives', 'Tools', 'Clothing'];

const KNIVES = ['kitchen_knife', 'pocket_knife', 'hunting_knife', 'combat_knife'];
const POLE = ['stick', 'plank', 'spear_crude'];
const WATERY = ['water', 'dirty_water'];
const XP = (skill, amount) => ({ skill, amount });

const salvage = (id, name, ammo, count, gp, desc) => ({
  id, name, category: 'Ammo', desc, time: 25, station: 'workbench',
  inputs: [{ item: ammo, count, label: name.replace('Pull ', '') }],
  tools: [{ tag: 'screwdriver', label: 'Pliers / screwdriver', wear: 1 }],
  result: { id: 'gunpowder', count: gp }, xp: XP('maintenance', 4),
});
const reload = (id, ammo, gp, n, level) => ({
  id, name: 'Reload ' + getItemDef(ammo).name, category: 'Ammo', time: 40, station: 'workbench', skill: { name: 'maintenance', level },
  desc: `Hand-load ${n} rounds from powder and scrap brass at a workbench.`,
  inputs: [{ item: 'gunpowder', count: gp }, { item: 'scrap_metal', count: 1 }],
  tools: [{ tag: 'hammer', label: 'Hammer', wear: 1 }],
  result: { id: ammo, count: n }, xp: XP('maintenance', 10),
});
const cook = (id, raw, cooked, time) => ({
  id, name: 'Cook ' + getItemDef(raw).name.replace('Raw ', ''), category: 'Food', time, station: 'fire',
  desc: `Cook ${getItemDef(raw).name.toLowerCase()} over a fire.`,
  inputs: [{ item: raw, count: 1 }], tools: [], result: { id: cooked, count: 1 }, xp: null,
});

export const RECIPES = [
  // ===== Medical ===========================================================================================
  { id: 'make_bandage', name: 'Improvised Bandage', category: 'Medical', time: 4, desc: 'Fold clean rags into a field dressing.',
    inputs: [{ item: 'rag', count: 2 }], tools: [], station: null, result: { id: 'bandage', count: 1 }, xp: XP('firstAid', 3) },
  { id: 'sterilize_bandage', name: 'Sterilize Bandages', category: 'Medical', time: 5, desc: 'Soak bandages in disinfectant to make them sterile.',
    inputs: [{ item: 'bandage', count: 2 }, { item: 'disinfectant', uses: 1, label: 'Disinfectant (1 use)' }], tools: [], station: null, result: { id: 'sterile_bandage', count: 2 }, xp: XP('firstAid', 5) },
  { id: 'sterilize_bandage_wipe', name: 'Sterilize Bandage (Wipe)', category: 'Medical', time: 3, desc: 'Clean a bandage with an alcohol wipe.',
    inputs: [{ item: 'bandage', count: 1 }, { item: 'alcohol_wipes', count: 1 }], tools: [], station: null, result: { id: 'sterile_bandage', count: 1 }, xp: XP('firstAid', 3) },
  { id: 'sterilize_bandage_liquor', name: 'Sterilize Bandages (Liquor)', category: 'Medical', time: 5, desc: 'Strong liquor works in a pinch.',
    inputs: [{ item: 'bandage', count: 2 }, { item: ['moonshine', 'whiskey'], uses: 1, label: 'Moonshine / bourbon (1 use)' }], tools: [], station: null, result: { id: 'sterile_bandage', count: 2 }, xp: XP('firstAid', 4) },
  { id: 'boil_bandages', name: 'Boil Rags', category: 'Medical', time: 30, desc: 'Boil rags in a pot to make sterile dressings.', skill: { name: 'firstAid', level: 1 },
    inputs: [{ item: 'rag', count: 2 }, { liquid: WATERY, uses: 2, label: 'Water (2 units)' }], tools: [{ tag: 'cooking_pot', label: 'Cooking pot' }], station: 'fire', result: { id: 'sterile_bandage', count: 1 }, xp: XP('firstAid', 6) },
  { id: 'wash_rags', name: 'Wash Dirty Rags', category: 'Medical', time: 8, desc: 'Rinse bloody rags so they can be used again.',
    inputs: [{ item: 'rag_dirty', count: 3 }, { liquid: WATERY, uses: 1, label: 'Water (1 unit)' }], tools: [], station: null, result: { id: 'rag', count: 3 }, xp: XP('firstAid', 2) },
  { id: 'splint', name: 'Splint', category: 'Medical', time: 8, desc: 'Lash two sticks or boards together to hold a fracture.',
    inputs: [{ item: ['stick', 'plank'], count: 2, label: 'Sticks / planks' }, { item: 'rag', count: 2 }], tools: [], station: null, result: { id: 'splint', count: 1 }, xp: XP('firstAid', 6) },
  { id: 'suture_kit', name: 'Improvised Suture Kit', category: 'Medical', time: 15, desc: 'Sterilized needle and thread for closing deep cuts.', skill: { name: 'firstAid', level: 2 },
    inputs: [{ item: 'thread', uses: 3, label: 'Thread (3 uses)' }, { item: ['disinfectant', 'moonshine', 'whiskey'], uses: 1, label: 'Disinfectant / liquor (1 use)' }],
    tools: [{ tag: 'repair_cloth', label: 'Sewing kit', wear: 1 }], station: null, result: { id: 'suture_kit', count: 1, uses: 2 }, xp: XP('firstAid', 10) },

  // ===== Survival ==========================================================================================
  { id: 'boil_water', name: 'Boil Water', category: 'Survival', time: 20, desc: 'Boil up to 8 units (2 L) of dirty water in containers you carry.',
    inputs: [{ liquid: 'dirty_water', uses: 1, label: 'Dirty water (≤8 units / container)' }], tools: [{ tag: 'cooking_pot', label: 'Cooking pot' }], station: 'fire',
    transform: { from: 'dirty_water', to: 'water', max: 8 }, result: { id: 'water_bottle', count: 0, displayOnly: true }, xp: XP('scavenging', 2) },
  { id: 'purify_tablet', name: 'Purify Water (Tablet)', category: 'Survival', time: 10, desc: 'One tablet makes 1 L of dirty water safe.',
    inputs: [{ item: 'purification_tablets', count: 1 }, { liquid: 'dirty_water', uses: 1, label: 'Dirty water (≤4 units / container)' }], tools: [], station: null,
    transform: { from: 'dirty_water', to: 'water', max: 4 }, result: { id: 'water_bottle', count: 0, displayOnly: true }, xp: XP('scavenging', 1) },
  { id: 'purify_bleach', name: 'Purify Water (Bleach)', category: 'Survival', time: 10, desc: 'A few drops of bleach purify up to 4 L.',
    inputs: [{ item: 'bleach', uses: 1, label: 'Bleach (1 use)' }, { liquid: 'dirty_water', uses: 1, label: 'Dirty water (≤16 units / container)' }], tools: [], station: null,
    transform: { from: 'dirty_water', to: 'water', max: 16 }, result: { id: 'water_jug', count: 0, displayOnly: true }, xp: XP('scavenging', 1) },
  { id: 'campfire_kit', name: 'Campfire Kit', category: 'Survival', time: 12, desc: 'Bundle wood and kindling. Place it, then light it.',
    inputs: [{ item: 'stick', count: 4 }, { item: ['log', 'plank'], count: 2, label: 'Logs / planks' }], tools: [], station: null, result: { id: 'campfire_kit', count: 1 }, xp: XP('scavenging', 3) },
  { id: 'torch', name: 'Torch', category: 'Survival', time: 6, desc: 'A rag soaked in gasoline wrapped on a stick. Burns about four hours.',
    inputs: [{ item: 'stick', count: 1 }, { item: 'rag', count: 1 }, { liquid: 'gasoline', uses: 1, label: 'Gasoline (1 unit)' }], tools: [], station: null, result: { id: 'torch', count: 1 }, xp: XP('scavenging', 2) },
  { id: 'rope', name: 'Braid Rope', category: 'Survival', time: 15, desc: 'Twist rags into a serviceable rope.',
    inputs: [{ item: 'rag', count: 4 }], tools: [], station: null, result: { id: 'rope', count: 1 }, xp: XP('maintenance', 3) },
  { id: 'lockpick', name: 'Lockpick', category: 'Survival', time: 8, desc: 'Bend bobby pins into a tension wrench and a pick.',
    inputs: [{ item: 'bobby_pins', count: 2 }], tools: [], station: null, result: { id: 'lockpick', count: 1 }, xp: XP('sneaking', 4) },

  // ===== Food ==============================================================================================
  cook('cook_meat', 'raw_meat', 'cooked_meat', 20),
  cook('cook_chicken', 'raw_chicken', 'cooked_chicken', 20),
  cook('bake_potato', 'potato', 'baked_potato', 25),
  cook('roast_corn', 'corn', 'roasted_corn', 15),
  { id: 'jerky', name: 'Smoke Jerky', category: 'Food', time: 60, desc: 'Slow-dry strips of meat over smoke so they keep for weeks.',
    inputs: [{ item: 'raw_meat', count: 2 }], tools: [{ tag: 'blade', label: 'Blade', wear: 1 }], station: 'fire', result: { id: 'jerky', count: 3 }, xp: XP('scavenging', 3) },
  { id: 'stew', name: 'Survival Stew', category: 'Food', time: 45, desc: 'Meat, vegetables and water simmered in a pot. Two hearty bowls.',
    inputs: [{ item: ['raw_meat', 'raw_chicken', 'cooked_meat', 'cooked_chicken', 'canned_meat'], count: 1, label: 'Meat' },
      { item: ['potato', 'carrot', 'corn', 'canned_corn', 'canned_beans', 'pumpkin', 'wild_mushrooms'], count: 2, label: 'Vegetables' },
      { liquid: WATERY, uses: 2, label: 'Water (2 units)' }],
    tools: [{ tag: 'cooking_pot', label: 'Cooking pot' }], station: 'fire', result: { id: 'stew', count: 1 }, xp: null },

  // ===== Weapons ===========================================================================================
  { id: 'spear_crude', name: 'Sharpened Stick', category: 'Weapons', time: 10, desc: 'Carve a point onto a long branch.',
    inputs: [{ item: 'stick', count: 2 }], tools: [{ tag: 'blade', label: 'Blade', wear: 1 }], station: null, result: { id: 'spear_crude', count: 1 }, xp: XP('maintenance', 3) },
  { id: 'spear', name: 'Knife Spear', category: 'Weapons', time: 20, desc: 'Lash a knife to a pole. Reach without contact.',
    inputs: [{ item: POLE, count: 1, label: 'Pole (stick / plank / sharpened stick)' }, { item: KNIVES, count: 1, label: 'Knife' }, { item: 'duct_tape', uses: 2, label: 'Duct tape (2 uses)' }],
    tools: [], station: null, result: { id: 'spear', count: 1 }, xp: XP('maintenance', 6) },
  { id: 'wooden_club', name: 'Wooden Club', category: 'Weapons', time: 20, desc: 'Whittle a chunk of wood into a club.',
    inputs: [{ item: ['log', 'plank'], count: 1, label: 'Log / plank' }], tools: [{ tag: ['blade', 'chop'], label: 'Blade or axe', wear: 2 }], station: null, result: { id: 'wooden_club', count: 1 }, xp: XP('maintenance', 4) },
  { id: 'nail_bat', name: 'Nailed Bat', category: 'Weapons', time: 15, desc: 'Hammer nails through a baseball bat.',
    inputs: [{ item: 'baseball_bat', count: 1, inherit: true }, { item: 'nails', count: 8 }], tools: [{ tag: 'hammer', label: 'Hammer', wear: 2 }], station: null, result: { id: 'nail_bat', count: 1 }, xp: XP('maintenance', 6) },
  { id: 'lead_pipe', name: 'Pipe Club', category: 'Weapons', time: 6, desc: 'Wrap a grip of tape around a length of pipe.',
    inputs: [{ item: 'metal_pipe', count: 1 }, { item: 'duct_tape', uses: 2, label: 'Duct tape (2 uses)' }], tools: [], station: null, result: { id: 'lead_pipe', count: 1 }, xp: XP('maintenance', 3) },
  { id: 'shiv', name: 'Shiv', category: 'Weapons', time: 15, desc: 'Grind scrap to a point and wrap a cloth grip.',
    inputs: [{ item: 'scrap_metal', count: 1 }, { item: 'rag', count: 1 }], tools: [], station: null, result: { id: 'shiv', count: 1 }, xp: XP('maintenance', 3) },
  { id: 'bow_crude', name: 'Crude Bow', category: 'Weapons', time: 45, desc: 'Carve a stave and string it with rope.', skill: { name: 'maintenance', level: 1 },
    inputs: [{ item: 'stick', count: 3 }, { item: 'rope', count: 1 }], tools: [{ tag: 'blade', label: 'Blade', wear: 3 }], station: null, result: { id: 'bow_crude', count: 1 }, xp: XP('maintenance', 10) },
  { id: 'suppressor_bottle', name: 'Bottle Suppressor', category: 'Weapons', time: 12, desc: 'Tape a plastic bottle over a pistol muzzle. Good for about a dozen shots.', skill: { name: 'maintenance', level: 1 },
    inputs: [{ item: 'plastic_bottle', count: 1 }, { item: 'duct_tape', uses: 3, label: 'Duct tape (3 uses)' }], tools: [], station: null, result: { id: 'suppressor_bottle', count: 1 }, xp: XP('maintenance', 6) },

  // ===== Ammo ==============================================================================================
  { id: 'arrows', name: 'Arrows', category: 'Ammo', time: 20, desc: 'Fletch shafts with feathers and scrap points.',
    inputs: [{ item: 'stick', count: 3 }, { item: 'feather', count: 3 }, { item: 'scrap_metal', count: 1 }], tools: [{ tag: 'blade', label: 'Blade', wear: 1 }], station: null, result: { id: 'arrow', count: 3 }, xp: XP('maintenance', 5) },
  { id: 'crossbow_bolts', name: 'Crossbow Bolts', category: 'Ammo', time: 20, desc: 'Short, heavy shafts with scrap tips.',
    inputs: [{ item: 'stick', count: 3 }, { item: 'scrap_metal', count: 1 }], tools: [{ tag: 'blade', label: 'Blade', wear: 1 }], station: null, result: { id: 'crossbow_bolt', count: 3 }, xp: XP('maintenance', 5) },
  salvage('salvage_shells', 'Pull Shotgun Shells', ['ammo_12g', 'ammo_12g_slug'], 4, 2, 'Cut open shotgun shells for their powder.'),
  salvage('salvage_rifle', 'Pull Rifle Rounds', ['ammo_556', 'ammo_762', 'ammo_308'], 5, 2, 'Pull rifle bullets and pour out the powder.'),
  salvage('salvage_pistol', 'Pull Pistol Rounds', ['ammo_9mm', 'ammo_45', 'ammo_357'], 10, 1, 'Pull pistol bullets for a little powder.'),
  reload('reload_9mm', 'ammo_9mm', 1, 8, 2),
  reload('reload_45', 'ammo_45', 1, 6, 2),
  reload('reload_357', 'ammo_357', 1, 5, 2),
  reload('reload_12g', 'ammo_12g', 2, 3, 3),
  reload('reload_556', 'ammo_556', 2, 4, 4),
  reload('reload_762', 'ammo_762', 2, 4, 4),
  reload('reload_308', 'ammo_308', 2, 3, 4),

  // ===== Explosives & distractions =========================================================================
  { id: 'molotov', name: 'Molotov Cocktail', category: 'Explosives', time: 8, desc: 'Gasoline in a bottle with a rag wick.',
    inputs: [{ item: 'glass_bottle', count: 1 }, { item: 'rag', count: 1 }, { liquid: 'gasoline', uses: 2, label: 'Gasoline (2 units)' }], tools: [], station: null, result: { id: 'molotov', count: 1 }, xp: XP('maintenance', 4) },
  { id: 'molotov_moonshine', name: 'Moonshine Molotov', category: 'Explosives', time: 8, desc: 'High-proof hooch burns nearly as well as gas.',
    inputs: [{ item: 'glass_bottle', count: 1 }, { item: 'rag', count: 1 }, { item: 'moonshine', uses: 3, label: 'Moonshine (3 uses)' }], tools: [], station: null, result: { id: 'molotov', count: 1 }, xp: XP('maintenance', 4) },
  { id: 'pipe_bomb', name: 'Pipe Bomb', category: 'Explosives', time: 30, desc: 'Pack a capped pipe with powder and a wire fuse. Very dangerous.', skill: { name: 'maintenance', level: 3 },
    inputs: [{ item: 'metal_pipe', count: 1 }, { item: 'gunpowder', count: 4 }, { item: 'wire', count: 1 }, { item: 'duct_tape', uses: 2, label: 'Duct tape (2 uses)' }],
    tools: [{ tag: 'hammer', label: 'Hammer', wear: 1 }], station: 'workbench', result: { id: 'pipe_bomb', count: 1 }, xp: XP('maintenance', 15) },
  { id: 'noise_maker', name: 'Noise Maker', category: 'Explosives', time: 10, desc: 'Tape cans to an alarm clock. Throw it to lure the dead away.',
    inputs: [{ item: 'alarm_clock', count: 1 }, { tag: 'can', count: 2, label: 'Empty cans' }, { item: 'duct_tape', uses: 1, label: 'Duct tape (1 use)' }], tools: [], station: null, result: { id: 'noise_maker', count: 1 }, xp: XP('maintenance', 4) },

  // ===== Tools & materials =================================================================================
  { id: 'saw_planks', name: 'Saw Planks', category: 'Tools', time: 20, desc: 'Saw a log into planks.',
    inputs: [{ item: 'log', count: 1 }], tools: [{ tag: 'saw', label: 'Saw', wear: 2 }], station: null, result: { id: 'plank', count: 3 }, xp: XP('maintenance', 3) },
  { id: 'chop_planks', name: 'Split Planks', category: 'Tools', time: 25, desc: 'Split a log into rough boards with an axe. Wasteful.',
    inputs: [{ item: 'log', count: 1 }], tools: [{ tag: 'chop', label: 'Axe / hatchet', wear: 2 }], station: null, result: { id: 'plank', count: 2 }, xp: XP('maintenance', 2) },
  { id: 'split_sticks', name: 'Split Sticks', category: 'Tools', time: 6, desc: 'Break a plank down into sticks.',
    inputs: [{ item: 'plank', count: 1 }], tools: [{ tag: ['blade', 'chop', 'saw'], label: 'Blade, axe or saw', wear: 1 }], station: null, result: { id: 'stick', count: 3 }, xp: null },
  { id: 'make_nails', name: 'Forge Nails', category: 'Tools', time: 20, desc: 'Cut and hammer scrap into crude nails.', skill: { name: 'maintenance', level: 1 },
    inputs: [{ item: 'scrap_metal', count: 1 }], tools: [{ tag: 'hammer', label: 'Hammer', wear: 2 }], station: 'workbench', result: { id: 'nails', count: 6 }, xp: XP('maintenance', 4) },
  { id: 'scrap_cans', name: 'Flatten Cans', category: 'Tools', time: 8, desc: 'Hammer empty cans into usable scrap metal.',
    inputs: [{ tag: 'can', count: 4, label: 'Empty cans' }], tools: [{ tag: 'hammer', label: 'Hammer', wear: 1 }], station: null, result: { id: 'scrap_metal', count: 1 }, xp: XP('maintenance', 2) },
  { id: 'salvage_electronics', name: 'Salvage Electronics', category: 'Tools', time: 15, desc: 'Unscrew a gadget for its circuit boards and wiring.',
    inputs: [{ tag: 'electronics_source', count: 1, label: 'Phone, radio, clock or remote' }], tools: [{ tag: 'screwdriver', label: 'Screwdriver', wear: 1 }], station: null,
    result: { id: 'electronics', count: 1 }, byproducts: [{ id: 'wire', count: 1, chance: 0.4 }, { id: 'batteries', count: 1, chance: 0.2 }], xp: XP('maintenance', 4) },
  { id: 'sharpen_blade', name: 'Sharpen Blade', category: 'Tools', time: 15, desc: 'Restore the edge of your most worn bladed weapon.',
    inputs: [{ item: 'whetstone', uses: 1, label: 'Whetstone (1 use)' }], tools: [], station: null,
    repair: { tags: ['blade', 'chop'], melee: true, amount: 0.3, label: 'Dull blade / axe' }, result: { id: 'whetstone', count: 0, displayOnly: true }, xp: XP('maintenance', 5) },
  { id: 'clean_gun', name: 'Clean Firearm', category: 'Tools', time: 30, desc: 'Strip, clean and oil your most worn firearm. Fewer jams.',
    inputs: [{ item: 'gun_cleaning_kit', uses: 1, label: 'Gun cleaning kit (1 use)' }], tools: [], station: null,
    repair: { firearm: true, amount: 0.35, label: 'Worn firearm' }, result: { id: 'gun_cleaning_kit', count: 0, displayOnly: true }, xp: XP('maintenance', 8) },
  { id: 'fix_handle', name: 'Glue Handle', category: 'Tools', time: 20, desc: 'Glue and tape a cracked wooden weapon.',
    inputs: [{ item: 'glue', uses: 1, label: 'Wood glue (1 use)' }, { item: 'duct_tape', uses: 1, label: 'Duct tape (1 use)' }], tools: [], station: null,
    repair: { tags: ['wood'], amount: 0.3, label: 'Damaged wooden weapon' }, result: { id: 'glue', count: 0, displayOnly: true }, xp: XP('maintenance', 5) },
  { id: 'tape_weapon', name: 'Tape Weapon', category: 'Tools', time: 10, desc: 'Duct tape fixes everything. A little.',
    inputs: [{ item: 'duct_tape', uses: 2, label: 'Duct tape (2 uses)' }], tools: [], station: null,
    repair: { melee: true, amount: 0.15, label: 'Damaged melee weapon' }, result: { id: 'duct_tape', count: 0, displayOnly: true }, xp: XP('maintenance', 3) },

  // ===== Clothing ==========================================================================================
  { id: 'rip_rags', name: 'Rip Clothing', category: 'Clothing', time: 8, desc: 'Tear a fabric garment into rags by hand. Heavier clothes give more.',
    inputs: [{ tag: 'fabric', count: 1, label: 'Fabric clothing' }], tools: [], station: null, rags: 'hands', result: { id: 'rag', count: 2 }, xp: XP('maintenance', 1) },
  { id: 'cut_rags', name: 'Cut Clothing', category: 'Clothing', time: 4, desc: 'Cut a fabric garment into rags. A blade gets more out of it.',
    inputs: [{ tag: 'fabric', count: 1, label: 'Fabric clothing' }], tools: [{ tag: 'blade', label: 'Blade', wear: 1 }], station: null, rags: 'blade', result: { id: 'rag', count: 3 }, xp: XP('maintenance', 1) },
  { id: 'bandana', name: 'Bandana', category: 'Clothing', time: 5, desc: 'Tie a rag over your face. Cuts the smell.',
    inputs: [{ item: 'rag', count: 2 }], tools: [], station: null, result: { id: 'bandana', count: 1 }, xp: null },
  { id: 'backpack_improvised', name: 'Improvised Sack', category: 'Clothing', time: 40, desc: 'Knot rags and rope into an 8-slot shoulder sack.',
    inputs: [{ item: 'rag', count: 6 }, { item: 'rope', count: 1 }], tools: [], station: null, result: { id: 'backpack_improvised', count: 1 }, xp: XP('maintenance', 6) },
  { id: 'scrap_armor', name: 'Scrap Armor', category: 'Clothing', time: 60, desc: 'Strap sheet-metal plates over padding. Heavy, loud, bite-resistant.', skill: { name: 'maintenance', level: 2 },
    inputs: [{ item: 'sheet_metal', count: 2 }, { item: 'rag', count: 2 }, { item: 'duct_tape', uses: 4, label: 'Duct tape (4 uses)' }], tools: [{ tag: 'hammer', label: 'Hammer', wear: 2 }], station: 'workbench',
    result: { id: 'vest_improvised', count: 1 }, xp: XP('maintenance', 12) },
  { id: 'patch_clothing', name: 'Patch Clothing', category: 'Clothing', time: 20, desc: 'Sew a patch onto your most worn piece of clothing (worn items too).',
    inputs: [{ tag: 'repair_cloth', uses: 1, label: 'Sewing kit (1 use)' }, { item: 'rag', count: 1 }], tools: [], station: null,
    repair: { clothing: true, includeEquipped: true, amount: 0.35, label: 'Torn clothing' }, result: { id: 'sewing_kit', count: 0, displayOnly: true }, xp: XP('maintenance', 4) },
];

const BY_ID = new Map(RECIPES.map((r) => [r.id, r]));
export function getRecipe(id) { return BY_ID.get(id) || null; }

// ---------------------------------------------------------------------------------------------------------
// Inventory helpers
// ---------------------------------------------------------------------------------------------------------
const arr = (x) => (x == null ? null : Array.isArray(x) ? x : [x]);
const TAG_LABEL = {
  fabric: 'Fabric clothing', blade: 'Blade', chop: 'Axe', hammer: 'Hammer', saw: 'Saw', cooking_pot: 'Cooking pot',
  can: 'Empty can', screwdriver: 'Screwdriver', repair_cloth: 'Sewing kit', electronics_source: 'Electronics',
};

function specLabel(spec) {
  if (spec.label) return spec.label;
  if (spec.liquid) return arr(spec.liquid).map((l) => LIQUIDS[l]?.name || l).join(' / ') + ` (${spec.uses} units)`;
  if (spec.item) return arr(spec.item).map((i) => getItemDef(i).name).join(' / ');
  if (spec.tag) return arr(spec.tag).map((t) => TAG_LABEL[t] || ITEM_TAGS[t] || t).join(' / ');
  return '?';
}

function matches(spec, stack) {
  const def = getItemDef(stack.id);
  if (spec.liquid) return !!def.liquidContainer && arr(spec.liquid).includes(stack.data?.liquid) && (stack.uses || 0) > 0;
  if (spec.item && arr(spec.item).includes(stack.id)) return true;
  if (spec.tag && arr(spec.tag).some((t) => def.tags.includes(t))) return true;
  return false;
}

const hasContents = (s) => !!(s.contents && s.contents.some(Boolean));

/** carried stacks matching a spec; never worn equipment or bags with stuff inside */
function candidates(inv, spec, { includeEquipped = false } = {}) {
  return inv.find((s) => matches(spec, s)).filter((f) => (includeEquipped || f.slots !== inv.equipment) && !hasContents(f.stack));
}

const amountOf = (spec, stack) => (spec.uses != null ? stack.uses || 0 : stack.count || 1);
function condOf(stack) {
  const def = getItemDef(stack.id);
  return def.durability ? (stack.dur ?? def.durability) / def.durability : 1;
}
function consumeOrder(a, b) {
  // use the worst / oldest / emptiest first
  return condOf(a.stack) - condOf(b.stack) || (a.stack.age ?? 0) - (b.stack.age ?? 0) || (a.stack.uses ?? 0) - (b.stack.uses ?? 0);
}

function repairTargets(inv, rep) {
  const found = inv.find((s) => {
    const def = getItemDef(s.id);
    if (!def.durability || s.dur == null || s.dur >= def.durability) return false;
    if (rep.firearm) return !!def.firearm;
    if (rep.clothing) return !!def.clothing && !def.attachment;
    if (rep.melee && !def.melee) return false;
    if (rep.tags) return rep.tags.some((t) => def.tags.includes(t)) && (!rep.melee || !!def.melee);
    return !!def.melee;
  }).filter((f) => rep.includeEquipped || f.slots !== inv.equipment);
  found.sort((a, b) => condOf(a.stack) - condOf(b.stack));
  return found;
}

function transformTargets(inv, tr) {
  return inv.find((s) => getItemDef(s.id).liquidContainer && s.data?.liquid === tr.from && (s.uses || 0) > 0 && s.uses <= tr.max)
    .sort((a, b) => b.stack.uses - a.stack.uses);
}

function ragYield(stack, mode) {
  const base = Math.max(1, Math.min(6, Math.round(getItemDef(stack.id).weight * 10)));
  return mode === 'blade' ? Math.min(8, Math.ceil(base * 1.5)) : base;
}

/** Allocate concrete stacks for a recipe. Pure (does not modify the inventory). */
function plan(inv, recipe, ctx = {}) {
  const reserved = new Set();
  const inputs = recipe.inputs.map((spec) => {
    const cands = candidates(inv, spec).filter((c) => !reserved.has(c.stack)).sort(consumeOrder);
    const need = spec.uses ?? spec.count ?? 1;
    let have = 0;
    const take = [];
    for (const c of cands) {
      const amt = amountOf(spec, c.stack);
      if (have < need) {
        take.push({ ...c, n: Math.min(amt, need - have) });
        // whole items are used up; a container we only pour from (or a roll we tear tape off) can still be a tool
        if (spec.uses == null) reserved.add(c.stack);
      }
      have += amt;
    }
    return { spec, label: specLabel(spec), have, need, ok: have >= need, take };
  });
  const tools = (recipe.tools || []).map((spec) => {
    const cands = candidates(inv, spec).filter((c) => !reserved.has(c.stack)).sort((a, b) => condOf(b.stack) - condOf(a.stack));
    const best = cands[0] || null;
    if (best) reserved.add(best.stack);
    return { spec, label: specLabel(spec), ok: !!best, pick: best };
  });
  let target = null;
  if (recipe.repair) {
    const t = repairTargets(inv, recipe.repair).filter((c) => !reserved.has(c.stack));
    target = { label: recipe.repair.label || 'Damaged item', have: t.length ? 1 : 0, need: 1, ok: t.length > 0, pick: t[0] || null, target: true };
  }
  if (recipe.transform) {
    const t = transformTargets(inv, recipe.transform);
    const liqIn = inputs.find((i) => i.spec.liquid);
    if (liqIn) {
      liqIn.have = t.reduce((n, c) => n + c.stack.uses, 0);
      liqIn.ok = liqIn.have >= liqIn.need;
      liqIn.take = [];
      liqIn.targets = t;
    }
  }
  const station = recipe.station
    ? { label: recipe.station === 'fire' ? 'Near a fire' : 'At a workbench', ok: recipe.station === 'fire' ? !!ctx.nearFire : !!ctx.nearWorkbench }
    : null;
  let skill = null;
  if (recipe.skill) {
    const lvl = ctx.skills?.[recipe.skill.name] ?? 0;
    const sname = recipe.skill.name === 'firstAid' ? 'First Aid' : recipe.skill.name[0].toUpperCase() + recipe.skill.name.slice(1);
    skill = { label: `${sname} ${recipe.skill.level}`, have: lvl, need: recipe.skill.level, ok: lvl >= recipe.skill.level };
  }
  return { inputs, tools, target, station, skill };
}

function statusFromPlan(recipe, p) {
  const inputs = p.inputs.map((i) => ({ label: i.label, have: i.have, need: i.need, ok: i.ok }));
  if (p.target) inputs.push({ label: p.target.label, have: p.target.have, need: 1, ok: p.target.ok, target: true });
  const tools = p.tools.map((t) => ({ label: t.label, ok: t.ok }));
  const missing = [];
  for (const i of inputs) if (!i.ok) missing.push({ label: i.label, have: i.have, need: i.need });
  for (const t of tools) if (!t.ok) missing.push({ label: t.label, have: 0, need: 1 });
  if (p.station && !p.station.ok) missing.push({ label: p.station.label, have: 0, need: 1 });
  if (p.skill && !p.skill.ok) missing.push({ label: p.skill.label, have: p.skill.have, need: p.skill.need });
  let resultCount = recipe.result?.count ?? 0;
  if (recipe.rags) {
    const fab = p.inputs[0]?.take[0];
    resultCount = fab ? ragYield(fab.stack, recipe.rags) : recipe.result.count;
  }
  return {
    recipe, canCraft: missing.length === 0, missing, inputs, tools,
    station: p.station ? { label: p.station.label, ok: p.station.ok } : null,
    skill: p.skill ? { label: p.skill.label, ok: p.skill.ok } : null,
    resultCount,
  };
}

/** Status of one recipe for the UI. */
export function getRecipeStatusFor(inv, recipe, ctx = {}) {
  const r = typeof recipe === 'string' ? getRecipe(recipe) : recipe;
  return statusFromPlan(r, plan(inv, r, ctx));
}

/** Status of every recipe (craftable first within each category order). */
export function getRecipeStatus(inv, ctx = {}) {
  return RECIPES.map((r) => getRecipeStatusFor(inv, r, ctx));
}

// ---------------------------------------------------------------------------------------------------------
// Crafting
// ---------------------------------------------------------------------------------------------------------
function removeAt(slots, index) { slots[index] = null; }

function takeFrom(spec, t, consumed, opened) {
  const s = t.stack;
  const def = getItemDef(s.id);
  if (spec.uses != null && (s.count || 1) > 1 && !def.liquidContainer) {
    // a stack of unopened rolls / bottles: open one instead of draining the whole stack
    s.count -= 1;
    const o = { ...JSON.parse(JSON.stringify(s)), count: 1, uses: Math.max(0, (s.uses ?? def.uses ?? 0) - t.n) };
    if (o.uses > 0) opened.push(o);
  } else if (spec.uses != null) {
    s.uses = Math.max(0, (s.uses || 0) - t.n);
    if (s.uses <= 0) {
      if (def.liquidContainer) s.data = { ...(s.data || {}), liquid: null };
      else removeAt(t.slots, t.index);
    }
  } else {
    s.count = (s.count || 1) - t.n;
    if (s.count <= 0) removeAt(t.slots, t.index);
  }
  consumed.push({ spec, stack: s });
}

function wearTool(t, notes) {
  const wear = t.spec.wear || 0;
  if (!wear || !t.pick) return;
  const s = t.pick.stack;
  const def = getItemDef(s.id);
  if (def.durability) {
    s.dur = (s.dur ?? def.durability) - wear;
    if (s.dur <= 0) { removeAt(t.pick.slots, t.pick.index); notes.push(`Your ${def.name} broke.`); }
  } else if (def.uses && !def.liquidContainer) {
    s.uses = (s.uses ?? def.uses) - wear;
    if (s.uses <= 0) { removeAt(t.pick.slots, t.pick.index); notes.push(`Your ${def.name} is used up.`); }
  }
}

/**
 * Craft a recipe: consumes inputs, wears tools, adds results to the inventory.
 * Returns {ok, message, results, xp}. Results that did not fit are included with `dropped: true`
 * (the caller should drop them on the floor and `delete stack.dropped`).
 */
export function craft(inv, recipeOrId, ctx = {}) {
  const recipe = typeof recipeOrId === 'string' ? getRecipe(recipeOrId) : recipeOrId;
  if (!recipe) return { ok: false, message: 'Unknown recipe.', results: [] };
  const p = plan(inv, recipe, ctx);
  const st = statusFromPlan(recipe, p);
  if (!st.canCraft) {
    return { ok: false, message: 'Missing: ' + st.missing.map((m) => (m.need > 1 ? `${m.label} (${m.have}/${m.need})` : m.label)).join(', '), results: [] };
  }
  const notes = [];
  const consumed = [];
  const ragCount = recipe.rags ? ragYield(p.inputs[0].take[0].stack, recipe.rags) : 0;
  const opened = [];
  for (const i of p.inputs) for (const t of i.take) takeFrom(i.spec, t, consumed, opened);
  for (const t of p.tools) wearTool(t, notes);

  const results = [];
  let message = `Crafted ${recipe.name}.`;

  if (recipe.transform) {
    const tr = recipe.transform;
    let budget = tr.max, units = 0;
    const liqIn = p.inputs.find((i) => i.spec.liquid);
    for (const c of liqIn?.targets || []) {
      if (c.stack.uses > budget) continue;
      c.stack.data = { ...(c.stack.data || {}), liquid: tr.to };
      budget -= c.stack.uses; units += c.stack.uses;
    }
    message = `${recipe.name}: ${units} unit${units === 1 ? '' : 's'} of ${LIQUIDS[tr.to]?.name.toLowerCase() || tr.to} ready.`;
  } else if (recipe.repair) {
    const tgt = p.target.pick.stack;
    const def = getItemDef(tgt.id);
    const lvl = ctx.skills?.maintenance ?? 0;
    const add = Math.round(def.durability * recipe.repair.amount * (1 + 0.06 * lvl));
    const before = tgt.dur;
    tgt.dur = Math.min(def.durability, (tgt.dur ?? 0) + add);
    message = `Repaired ${def.name} (${Math.round((before / def.durability) * 100)}% → ${Math.round((tgt.dur / def.durability) * 100)}%).`;
  } else if (recipe.result && !recipe.result.displayOnly) {
    const r = recipe.result;
    const def = getItemDef(r.id);
    const inheritFrom = consumed.find((c) => c.spec.inherit);
    const age = ctx.nowHours ?? itemClockHours();
    let count = recipe.rags ? ragCount : r.count || 1;
    const make = (n) => createItem(r.id, {
      count: n, uses: r.uses, data: r.data, age,
      dur: inheritFrom ? condOf(inheritFrom.stack) : undefined,
    });
    while (count > 0) {
      const n = Math.min(count, def.stack || 1);
      results.push(make(n));
      count -= n;
    }
    for (const b of recipe.byproducts || []) if (Math.random() < (b.chance ?? 1)) results.push(createItem(b.id, { count: b.count || 1 }));
    const total = results.reduce((n, s) => n + s.count, 0);
    message = `Crafted ${def.name}${total > 1 ? ' ×' + total : ''}.`;
  }
  // add to inventory (partly used rolls / bottles split off a stack go back first, they are not results)
  for (const s of opened) { const left = inv.addItem(s); if (left) { left.dropped = true; results.push(left); } }
  for (const s of results) {
    if (s.dropped) continue;
    const left = inv.addItem(s);
    if (left) left.dropped = true;
  }
  if (results.some((s) => s.dropped)) notes.push('No room — some items were dropped.');
  inv.changed();
  if (notes.length) message += ' ' + notes.join(' ');
  return { ok: true, message, results, xp: recipe.xp || null };
}

/** Every item id referenced by recipes (validation helper). */
export function recipeItemIds() {
  const ids = new Set();
  for (const r of RECIPES) {
    for (const s of [...r.inputs, ...(r.tools || [])]) for (const i of arr(s.item) || []) ids.add(i);
    if (r.result?.id) ids.add(r.result.id);
    for (const b of r.byproducts || []) ids.add(b.id);
  }
  return [...ids];
}
/** Every tag referenced by recipes (validation helper). */
export function recipeTags() {
  const tags = new Set();
  for (const r of RECIPES) for (const s of [...r.inputs, ...(r.tools || [])]) for (const t of arr(s.tag) || []) tags.add(t);
  for (const r of RECIPES) for (const t of r.repair?.tags || []) tags.add(t);
  return [...tags];
}
