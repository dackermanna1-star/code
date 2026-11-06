// LOOT TABLES
//
//   generateLoot(tableName, rng, {scavenging = 0 (0..10), day = 1, size, nowHours}) -> stack[]
//
// rng is a makeRng() object (src/core/rng.js) — never Math.random, so containers regenerate identically.
//
// Table shape:
//   { empty: 0..1 chance the container is empty, rolls: [min, max] entries rolled,
//     entries: [[id | '@group', weight, min = 1, max = min, opts?], ...],
//     always?: [[id, min, max, opts?]] added on every non-empty roll,
//     dur?: [a, b] condition range (0..1) for durable items,  ammo?: [a, b] loaded fraction of a gun's magazine,
//     uses?: [a, b] fraction of uses left, liquid?: [a, b] fraction a liquid container is filled,
//     dirty?: chance a liquid container holds dirty water, fresh?: [a, b] fraction of the spoil time already elapsed
//     (> 1 means rotten), looted?: true (gets emptier as days pass) }
// Entry opts override the table settings: {dur, ammo, uses, liquid, dirty, fresh, data, ammoType}.
// '@group' entries roll `min..max` times on LOOT_GROUPS[group].
// Rarer items (def.rarity) get heavier weights as the scavenging skill grows; empty chance drops a little.

import { getItemDef, createItem, canStack } from './items.js';

// ---------------------------------------------------------------------------------------------------------
// Reusable groups
// ---------------------------------------------------------------------------------------------------------
export const LOOT_GROUPS = {
  canned: [
    ['canned_beans', 10], ['canned_soup', 10], ['canned_tuna', 8], ['canned_peaches', 6], ['canned_corn', 8],
    ['canned_chili', 7], ['canned_pasta', 7], ['canned_meat', 6], ['canned_sardines', 5], ['dog_food', 2],
  ],
  snacks: [
    ['chips', 10], ['pretzels', 5], ['chocolate', 8], ['candy', 8, 1, 3], ['granola_bar', 8, 1, 2], ['crackers', 4],
    ['cookies', 5], ['jerky', 3], ['instant_noodles', 7, 1, 2],
  ],
  pantry: [
    ['cereal', 6], ['crackers', 6], ['peanut_butter', 5], ['honey', 2], ['instant_noodles', 8, 1, 3], ['coffee', 4],
    ['pickles', 3], ['cookies', 3], ['canned_beans', 4], ['canned_soup', 4],
  ],
  fresh: [
    ['apple', 6, 1, 3], ['orange', 4, 1, 3], ['bread', 7], ['cheese', 6], ['raw_meat', 4, 1, 2], ['raw_chicken', 3, 1, 2],
    ['potato', 5, 1, 3], ['carrot', 4, 1, 3], ['milk', 5],
  ],
  drinks: [
    ['water_bottle', 10], ['soda', 10, 1, 2], ['soda_orange', 5, 1, 2], ['energy_drink', 5], ['juice', 5],
    ['sports_drink', 4], ['beer', 4, 1, 2],
  ],
  meds_basic: [
    ['bandage', 10, 1, 3], ['painkillers', 8], ['alcohol_wipes', 8, 1, 4], ['vitamins', 5], ['disinfectant', 4],
    ['cold_medicine', 5], ['burn_cream', 3], ['sleeping_pills', 3], ['tweezers', 2], ['rag', 3, 1, 3],
  ],
  meds_good: [
    ['sterile_bandage', 8, 1, 3], ['antibiotics', 5], ['suture_kit', 4], ['first_aid_kit', 4], ['morphine', 2],
    ['beta_blockers', 3], ['adrenaline', 1], ['splint', 3], ['disinfectant', 5], ['hemostatic_gauze', 1],
  ],
  junk: [
    ['newspaper', 8], ['toilet_paper', 5], ['tin_can', 8, 1, 2], ['soda_can', 8, 1, 3], ['garbage_bag', 5],
    ['glass_bottle', 5], ['plastic_bottle', 6, 1, 2], ['rag_dirty', 6, 1, 2], ['magazine', 3], ['smartphone', 2],
    ['tv_remote', 2], ['batteries', 2], ['cash', 2, 1, 3], ['photo', 1], ['alarm_clock', 1], ['zip_ties', 1, 1, 4],
    ['bobby_pins', 1, 1, 3],
  ],
  tools_small: [
    ['duct_tape', 8], ['screwdriver', 6], ['hammer', 5], ['nails', 7, 4, 20], ['can_opener', 4], ['pocket_knife', 3], ['lighter', 3],
    ['matches', 4], ['flashlight', 3], ['batteries', 4], ['multitool', 1], ['glue', 4], ['wire', 4], ['rope', 3],
    ['zip_ties', 3, 2, 10], ['saw', 2], ['wrench', 2], ['work_gloves', 2], ['sewing_kit', 2], ['whetstone', 1],
  ],
  clothes_casual: [
    ['tshirt', 6], ['tshirt_black', 4], ['tshirt_red', 3], ['tshirt_blue', 3], ['tshirt_green', 3], ['tshirt_grey', 4],
    ['tank_top', 3], ['flannel_shirt', 4], ['flannel_blue', 3], ['flannel_green', 2], ['dress_shirt', 3], ['sweater', 3],
    ['sweater_green', 2], ['thermal_shirt', 1], ['hoodie', 4], ['hoodie_black', 3], ['hoodie_red', 2],
    ['denim_jacket', 2], ['leather_jacket', 0.6], ['winter_coat', 1.5], ['puffer_jacket', 1.5], ['raincoat', 1.5],
    ['windbreaker', 2], ['jeans', 6], ['jeans_black', 3], ['jeans_light', 3], ['khakis', 3], ['sweatpants', 3],
    ['shorts', 2], ['cargo_pants', 2], ['sneakers', 3], ['sneakers_black', 2], ['dress_shoes', 1.5], ['slippers', 1],
    ['baseball_cap', 3], ['trucker_hat', 1.5], ['beanie', 2], ['winter_gloves', 1.5], ['bandana', 1.5], ['work_gloves', 1],
    ['hiking_boots', 0.6], ['rain_boots', 0.8], ['cowboy_hat', 0.6], ['cowboy_boots', 0.5],
  ],
  clothes_winter: [
    ['winter_coat', 5], ['puffer_jacket', 4], ['sweater', 4], ['sweater_green', 3], ['thermal_shirt', 3], ['beanie', 4],
    ['beanie_orange', 1], ['winter_gloves', 4], ['balaclava', 1], ['hoodie', 3], ['flannel_shirt', 3], ['rain_boots', 2],
    ['hiking_boots', 1], ['raincoat', 2],
  ],
  clothes_work: [
    ['work_shirt', 3], ['work_pants', 4], ['overalls', 2], ['work_boots', 3], ['work_gloves', 4], ['hard_hat', 2],
    ['hi_vis_vest', 3], ['chore_coat', 2], ['flannel_shirt', 2], ['jeans', 2], ['trucker_hat', 1],
  ],
  clothes_military: [
    ['military_shirt', 4], ['military_pants', 4], ['military_jacket', 3], ['combat_boots', 3], ['boonie_hat', 2],
    ['military_helmet', 1.5], ['tactical_gloves', 2], ['tactical_vest', 0.8], ['chest_rig', 0.8], ['balaclava', 1],
    ['plate_carrier', 0.25], ['gas_mask', 0.6], ['tshirt_green', 2],
  ],
  clothes_hunting: [
    ['hunting_jacket', 4], ['hunting_pants', 3], ['hunting_vest', 4], ['beanie_orange', 3], ['boonie_hat', 2],
    ['hiking_boots', 2], ['flannel_green', 2], ['thermal_shirt', 2], ['leather_gloves', 1], ['rain_boots', 1],
  ],
  books: [
    ['novel', 10], ['magazine', 5], ['comic', 4], ['bible', 1.5], ['book_aiming', 1], ['book_firstaid', 1],
    ['book_maintenance', 1], ['book_fitness', 1], ['book_sneaking', 1], ['book_melee', 1], ['book_scavenging', 1],
    ['book_strength', 1],
  ],
  skill_books: [
    ['book_aiming', 1], ['book_firstaid', 1], ['book_maintenance', 1], ['book_fitness', 1], ['book_sneaking', 1],
    ['book_melee', 1], ['book_scavenging', 1], ['book_strength', 1],
  ],
  ammo_civ: [
    ['ammo_22', 10, 10, 40], ['ammo_9mm', 8, 6, 24], ['ammo_12g', 8, 4, 12], ['ammo_357', 4, 4, 18], ['ammo_45', 4, 4, 14],
    ['ammo_308', 4, 3, 10], ['ammo_12g_slug', 3, 3, 8], ['ammo_762', 3, 5, 20], ['ammo_556', 2, 5, 20],
  ],
  guns_civ: [
    ['rifle_22', 8], ['shotgun_pump', 7], ['shotgun_double', 6], ['rifle_hunting', 5], ['revolver_357', 4],
    ['pistol_glock', 3], ['pistol_1911', 2], ['rifle_sks', 3], ['rifle_lever', 3], ['rifle_ar15', 1], ['crossbow', 0.8],
    ['bow', 1.5],
  ],
  melee_house: [
    ['kitchen_knife', 6], ['baseball_bat', 5], ['hammer', 4], ['golf_club', 2], ['frying_pan', 2], ['rolling_pin', 2],
    ['screwdriver', 3], ['crowbar', 1], ['hatchet', 1], ['meat_cleaver', 1], ['aluminum_bat', 1], ['hockey_stick', 1],
  ],
  pocket: [
    ['wallet', 6], ['cash', 4, 1, 3], ['smartphone', 5], ['photo', 3], ['cigarettes', 3], ['lighter', 3], ['candy', 3],
    ['chocolate', 2], ['granola_bar', 1], ['painkillers', 1], ['bandage', 1], ['rag_dirty', 3], ['watch', 1],
    ['jewelry', 2], ['batteries', 1], ['tv_remote', 0.5], ['bobby_pins', 1], ['matches', 1], ['pocket_knife', 1],
  ],
  military_ammo: [
    ['ammo_556', 10, 10, 40], ['ammo_9mm', 4, 8, 30], ['ammo_12g', 1, 4, 10], ['ammo_308', 1, 4, 10],
  ],
};

// ---------------------------------------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------------------------------------
const NEW = [0.85, 1];
const WORN = [0.25, 0.8];

export const LOOT_TABLES = {
  // ===== furniture defaults ==============================================================================
  mailbox: { empty: 0.45, rolls: [1, 1], entries: [['newspaper', 10], ['magazine', 6], ['comic', 2], ['photo', 2], ['cash', 1], ['batteries', 1], ['map_millbrook', 0.5]] },
  trash: {
    empty: 0.35, rolls: [1, 2], fresh: [1.1, 3],
    entries: [['@junk', 30], ['rag_dirty', 6], ['tin_can', 6], ['soda_can', 6], ['chips', 2], ['bread', 2], ['cigarettes', 2], ['batteries', 2], ['kitchen_knife', 0.6, 1, 1, { dur: [0.1, 0.5] }], ['toilet_paper', 2]],
  },
  dumpster: {
    empty: 0.25, rolls: [1, 4], fresh: [1.1, 4], dur: [0.1, 0.6],
    entries: [['@junk', 30], ['scrap_metal', 6, 1, 2], ['plank', 4, 1, 2], ['garbage_bag', 4], ['rag_dirty', 5, 1, 3], ['bread', 2], ['raw_meat', 1],
      ['metal_pipe', 2], ['lead_pipe', 0.8], ['baseball_bat', 0.6], ['tshirt', 2], ['jeans', 1], ['sneakers', 1], ['brick', 2], ['stick', 2, 1, 3], ['wire', 1], ['electronics', 1]],
  },
  vending: {
    empty: 0.3, rolls: [1, 4], looted: true,
    entries: [['soda', 10, 1, 3], ['soda_orange', 6, 1, 2], ['energy_drink', 5, 1, 2], ['water_bottle', 6], ['chips', 8, 1, 2], ['chocolate', 8, 1, 3], ['candy', 6, 1, 3], ['granola_bar', 5, 1, 3], ['pretzels', 4], ['sports_drink', 3], ['cookies', 3]],
  },
  fridge: {
    empty: 0.25, rolls: [1, 4], fresh: [0.2, 1.7], liquid: [0.5, 1],
    entries: [['milk', 8], ['cheese', 7], ['raw_meat', 5, 1, 2], ['raw_chicken', 4, 1, 2], ['beer', 6, 1, 4], ['soda', 6, 1, 3], ['juice', 5], ['water_bottle', 5], ['apple', 4, 1, 3], ['orange', 3, 1, 2], ['carrot', 3, 1, 3], ['pickles', 3], ['bread', 2], ['cooked_meat', 1], ['cooked_chicken', 1], ['energy_drink', 1], ['sports_drink', 1]],
  },
  freezer: {
    empty: 0.3, rolls: [1, 3], fresh: [0, 0.9],
    entries: [['raw_meat', 10, 1, 3], ['raw_chicken', 8, 1, 3], ['potato', 3, 2, 4], ['corn', 2, 1, 3], ['bread', 2], ['berries', 1, 2, 6]],
  },
  stove: { empty: 0.6, rolls: [1, 2], fresh: [1.2, 3], entries: [['pot', 6], ['frying_pan', 6], ['matches', 2], ['cooked_meat', 1], ['lighter', 1]] },
  kitchen: {
    empty: 0.25, rolls: [1, 4], dur: [0.4, 1],
    entries: [['@canned', 30], ['@pantry', 20], ['@snacks', 8], ['kitchen_knife', 9], ['can_opener', 10], ['pot', 3], ['frying_pan', 3], ['rolling_pin', 2], ['meat_cleaver', 1], ['matches', 3], ['lighter', 1],
      ['water_bottle', 3], ['garbage_bag', 2], ['glass_bottle', 2], ['plastic_bottle', 2], ['bleach', 1], ['honey', 1], ['rag', 2, 1, 2], ['candy', 1, 1, 3], ['whiskey', 0.6]],
  },
  under_sink: {
    empty: 0.35, rolls: [1, 2],
    entries: [['bleach', 8], ['rag', 6, 1, 3], ['garbage_bag', 6, 1, 3], ['duct_tape', 3], ['wrench', 2], ['rubber_gloves', 3], ['toilet_paper', 3, 1, 2], ['disinfectant', 1], ['plastic_bottle', 3], ['glue', 1], ['zip_ties', 1, 2, 6]],
  },
  couch: {
    empty: 0.55, rolls: [1, 1],
    entries: [['cash', 4, 1, 2], ['tv_remote', 6], ['candy', 3], ['chips', 2], ['lighter', 2], ['cigarettes', 2], ['magazine', 3], ['comic', 2], ['batteries', 2], ['smartphone', 2], ['jewelry', 0.5], ['revolver_357', 0.25, 1, 1, { ammo: [0.5, 1] }], ['bobby_pins', 1]],
  },
  wardrobe: {
    empty: 0.2, rolls: [2, 5], dur: [0.4, 1],
    entries: [['@clothes_casual', 50], ['@clothes_winter', 10], ['backpack_school', 2], ['backpack_school_blue', 1.5], ['duffel_bag', 1], ['baseball_bat', 1], ['shotgun_pump', 0.3, 1, 1, { ammo: [0, 1] }], ['ammo_12g', 0.3, 2, 6], ['hiking_boots', 0.6], ['work_boots', 0.6]],
  },
  dresser: {
    empty: 0.25, rolls: [1, 3], dur: [0.4, 1],
    entries: [['tshirt', 4], ['tshirt_grey', 3], ['tshirt_black', 2], ['tank_top', 3], ['jeans', 3], ['sweatpants', 3], ['shorts', 2], ['sweater', 2], ['thermal_shirt', 1.5], ['beanie', 2], ['bandana', 1.5], ['winter_gloves', 1],
      ['jewelry', 2], ['cash', 2, 1, 3], ['photo', 2], ['watch', 2], ['wallet', 1], ['pocket_knife', 1.5], ['bobby_pins', 3, 1, 3], ['sleeping_pills', 1], ['pistol_glock', 0.25, 1, 1, { ammo: [0.3, 1] }], ['ammo_9mm', 0.4, 4, 15], ['novel', 1]],
  },
  bookshelf: { empty: 0.3, rolls: [1, 3], entries: [['@books', 30], ['map_millbrook', 1], ['newspaper', 3], ['photo', 1]] },
  desk: {
    empty: 0.3, rolls: [1, 2],
    entries: [['newspaper', 3], ['magazine', 3], ['smartphone', 3], ['batteries', 3], ['cash', 2, 1, 2], ['duct_tape', 2], ['glue', 2], ['alarm_clock', 2], ['electronics', 1], ['candy', 2, 1, 2], ['cigarettes', 1], ['lighter', 1], ['flashlight', 1],
      ['map_millbrook', 1], ['@books', 2], ['wallet', 1], ['photo', 1], ['screwdriver', 1], ['pocket_knife', 1], ['can_opener', 0.6], ['coffee', 1], ['painkillers', 1], ['watch', 0.6], ['compass', 0.3]],
  },
  medicine_cabinet: {
    empty: 0.3, rolls: [1, 3], uses: [0.2, 1],
    entries: [['painkillers', 10], ['bandage', 8, 1, 3], ['alcohol_wipes', 6, 1, 4], ['vitamins', 6], ['cold_medicine', 5], ['sleeping_pills', 4], ['disinfectant', 3], ['tweezers', 3], ['burn_cream', 3], ['antibiotics', 1.5], ['beta_blockers', 1.5], ['sterile_bandage', 2], ['suture_kit', 0.5], ['bobby_pins', 1]],
  },
  laundry: {
    empty: 0.35, rolls: [1, 3], dur: [0.3, 0.9],
    entries: [['@clothes_casual', 30], ['bleach', 4], ['rag', 4, 1, 3], ['bandana', 1], ['work_pants', 1], ['scrubs_top', 0.5], ['police_shirt', 0.2], ['leather_pants', 0.2]],
  },
  workbench: {
    empty: 0.25, rolls: [1, 3], dur: [0.4, 1],
    entries: [['nails', 10, 6, 30], ['duct_tape', 6], ['glue', 5], ['wire', 4], ['hammer', 4], ['screwdriver', 5], ['saw', 3], ['scrap_metal', 5, 1, 3], ['plank', 5, 1, 3], ['wrench', 3], ['crowbar', 1.5], ['rope', 3],
      ['zip_ties', 3, 3, 10], ['electronics', 2], ['metal_pipe', 2], ['gun_cleaning_kit', 1], ['whetstone', 2], ['work_gloves', 2], ['multitool', 0.6], ['sheet_metal', 1], ['gunpowder', 0.6, 2, 6], ['book_maintenance', 0.4]],
  },
  garage: {
    empty: 0.25, rolls: [1, 4], dur: [0.35, 1], liquid: [0, 0.9],
    entries: [['gas_can', 4], ['@tools_small', 25], ['rope', 3], ['tarp', 2], ['plank', 3, 1, 4], ['nails', 3, 5, 20], ['tire_iron', 3], ['shovel', 2], ['sledgehammer', 1], ['pickaxe', 0.6], ['wood_axe', 1], ['hatchet', 1],
      ['batteries', 2], ['flashlight', 2], ['lantern', 1], ['work_gloves', 2], ['motorcycle_helmet', 0.4], ['bike_helmet', 1], ['hard_hat', 1], ['canteen', 0.5], ['backpack_hiking', 0.4], ['crowbar', 1], ['metal_pipe', 1.5], ['scrap_metal', 2, 1, 3],
      ['garbage_bag', 2, 1, 3], ['bleach', 1], ['sheet_metal', 1], ['hockey_stick', 0.6], ['golf_club', 1], ['aluminum_bat', 0.8], ['firecrackers', 0.5]],
  },
  toolbox: {
    empty: 0.2, rolls: [1, 3], dur: [0.4, 1],
    entries: [['hammer', 6], ['screwdriver', 8], ['wrench', 5], ['nails', 8, 5, 25], ['duct_tape', 6], ['wire', 4], ['zip_ties', 4, 3, 10], ['saw', 2], ['multitool', 1], ['glue', 2], ['crowbar', 1], ['tire_iron', 1], ['whetstone', 1], ['work_gloves', 1]],
  },
  gun_cabinet: {
    empty: 0.2, rolls: [1, 3], dur: [0.5, 1], ammo: [0, 1],
    entries: [['shotgun_pump', 8], ['rifle_hunting', 6], ['rifle_22', 7], ['shotgun_double', 6], ['rifle_lever', 3], ['rifle_sks', 2], ['revolver_357', 2], ['ammo_12g', 10, 4, 15], ['ammo_22', 8, 10, 50], ['ammo_308', 6, 4, 14],
      ['ammo_357', 3, 6, 18], ['ammo_12g_slug', 4, 3, 10], ['ammo_762', 2, 10, 30], ['gun_cleaning_kit', 3], ['hunting_knife', 2], ['binoculars', 1], ['bow', 0.6], ['arrow', 0.6, 3, 8]],
  },
  safe: {
    empty: 0.2, rolls: [1, 3], dur: [0.6, 1], ammo: [0.3, 1],
    entries: [['cash', 10, 3, 15], ['jewelry', 8, 1, 4], ['pistol_1911', 2], ['revolver_357', 2], ['pistol_glock', 2], ['ammo_45', 3, 7, 21], ['ammo_9mm', 3, 10, 30], ['ammo_357', 2, 6, 18], ['photo', 2], ['watch', 2], ['antibiotics', 1], ['morphine', 0.5], ['whiskey', 1]],
  },
  store_food: {
    empty: 0.35, rolls: [2, 5], looted: true, fresh: [0.8, 3],
    entries: [['@canned', 40, 1, 2], ['@pantry', 20], ['@snacks', 20], ['@drinks', 10], ['@fresh', 5], ['dog_food', 3, 1, 2], ['mre', 0.4]],
  },
  store_general: {
    empty: 0.35, rolls: [2, 5], looted: true, uses: [0.8, 1], dur: NEW,
    entries: [['batteries', 6, 1, 3], ['flashlight', 3], ['lighter', 4], ['matches', 4, 1, 3], ['duct_tape', 4], ['rope', 2], ['garbage_bag', 3, 1, 4], ['toilet_paper', 4, 1, 4], ['bleach', 2], ['rag', 2, 1, 4],
      ['can_opener', 3], ['plastic_bottle', 2, 1, 3], ['water_bottle', 3], ['cigarettes', 3], ['candy', 3, 1, 4], ['magazine', 2], ['comic', 2], ['alarm_clock', 2], ['zip_ties', 2, 5, 20], ['glue', 2], ['sewing_kit', 2], ['tarp', 1],
      ['pot', 1], ['kitchen_knife', 1.5], ['hammer', 1], ['lantern', 0.8], ['headlamp', 0.8], ['firecrackers', 1, 1, 3], ['thread', 2]],
  },
  pharmacy: {
    empty: 0.4, rolls: [1, 4], looted: true, uses: [0.6, 1],
    entries: [['@meds_basic', 40], ['@meds_good', 8], ['purification_tablets', 3, 2, 6], ['vitamins', 4], ['cold_medicine', 4], ['sleeping_pills', 3], ['beta_blockers', 2], ['antibiotics', 1.2], ['surgical_mask', 4], ['rubber_gloves', 3], ['key_pharmacy', 0.2]],
  },
  store_looted: {
    empty: 0.75, rolls: [1, 2], fresh: [1, 3], looted: true,
    entries: [['@junk', 20], ['@canned', 3], ['candy', 3], ['plastic_bottle', 3], ['tin_can', 4], ['rag_dirty', 3], ['newspaper', 3], ['batteries', 1], ['chips', 1]],
  },
  store_drinks: {
    empty: 0.35, rolls: [2, 5], looted: true, fresh: [0.8, 2.5],
    entries: [['water_bottle', 10], ['soda', 10, 1, 4], ['soda_orange', 5, 1, 3], ['energy_drink', 6, 1, 3], ['sports_drink', 5], ['juice', 4], ['milk', 3], ['beer', 6, 1, 4], ['water_jug', 1.5]],
  },
  checkout: {
    empty: 0.4, rolls: [1, 2],
    entries: [['cash', 8, 2, 10], ['candy', 8, 1, 4], ['cigarettes', 6], ['lighter', 5], ['batteries', 4], ['chocolate', 4, 1, 2], ['magazine', 3], ['firecrackers', 1], ['revolver_357', 0.3, 1, 1, { ammo: [0.6, 1] }], ['ammo_357', 0.5, 4, 12], ['map_millbrook', 1]],
  },
  clothing_store: {
    empty: 0.35, rolls: [1, 4], looted: true, dur: NEW,
    entries: [['@clothes_casual', 50], ['@clothes_winter', 15], ['varsity_jacket', 2], ['leather_jacket', 1.2], ['backpack_school', 2], ['backpack_school_blue', 2], ['duffel_bag', 1], ['messenger_bag', 1], ['leather_gloves', 1], ['cowboy_boots', 1], ['cowboy_hat', 1], ['leather_pants', 0.6]],
  },
  office: {
    empty: 0.4, rolls: [1, 2],
    entries: [['newspaper', 4], ['cash', 1], ['candy', 2], ['coffee', 3], ['batteries', 2], ['duct_tape', 2], ['glue', 1], ['magazine', 2], ['smartphone', 2], ['alcohol_wipes', 1], ['painkillers', 2], ['whiskey', 0.6], ['map_millbrook', 1], ['flashlight', 1], ['electronics', 1]],
  },
  locker: {
    empty: 0.35, rolls: [1, 3], dur: [0.4, 1],
    entries: [['hoodie', 3], ['tshirt', 3], ['tshirt_grey', 2], ['sweatpants', 3], ['sneakers', 2], ['backpack_school', 2], ['baseball_bat', 1.5], ['energy_drink', 2], ['granola_bar', 3], ['painkillers', 2], ['magazine', 2], ['cigarettes', 1], ['work_gloves', 2], ['hard_hat', 1], ['hi_vis_vest', 1], ['work_boots', 1], ['lighter', 1], ['photo', 1]],
  },
  hospital: {
    empty: 0.3, rolls: [1, 4],
    entries: [['bandage', 8, 1, 4], ['sterile_bandage', 8, 1, 3], ['alcohol_wipes', 8, 2, 6], ['disinfectant', 6], ['painkillers', 6], ['antibiotics', 4], ['suture_kit', 4], ['splint', 3], ['morphine', 2], ['adrenaline', 1], ['first_aid_kit', 2], ['rubber_gloves', 4],
      ['surgical_mask', 4], ['tweezers', 3], ['burn_cream', 3], ['beta_blockers', 2], ['sleeping_pills', 2], ['cold_medicine', 2], ['hemostatic_gauze', 1]],
  },
  crate: {
    empty: 0.25, rolls: [1, 3], dur: [0.5, 1],
    entries: [['plank', 4, 1, 4], ['nails', 6, 10, 30], ['scrap_metal', 6, 1, 3], ['rope', 3], ['tarp', 2], ['@canned', 4, 1, 2], ['water_jug', 2], ['hammer', 2], ['crowbar', 2], ['sheet_metal', 2], ['metal_pipe', 2], ['wire', 2], ['gas_can', 1], ['batteries', 2], ['garbage_bag', 2, 1, 4]],
  },
  military_crate: {
    empty: 0.1, rolls: [2, 4], dur: [0.6, 1], ammo: [0, 1],
    entries: [['ammo_556', 10, 15, 60], ['ammo_9mm', 6, 15, 50], ['mre', 8, 1, 3], ['frag_grenade', 1.5, 1, 2], ['smoke_grenade', 2, 1, 2], ['rifle_m4', 1.5], ['pistol_m9', 2], ['military_helmet', 2], ['tactical_vest', 1.5], ['plate_carrier', 0.5],
      ['military_jacket', 2], ['military_pants', 2], ['combat_boots', 2], ['ifak', 3], ['hemostatic_gauze', 2], ['canteen', 3], ['backpack_military', 1], ['flare', 3, 1, 3], ['gas_mask', 1.5], ['chest_rig', 1], ['tactical_gloves', 2],
      ['combat_knife', 1.5], ['binoculars', 1], ['radio_handheld', 1.5], ['purification_tablets', 1.5, 4, 10]],
  },
  cardboard: {
    empty: 0.4, rolls: [1, 2], dur: [0.3, 0.9],
    entries: [['@junk', 20], ['@books', 4], ['@clothes_casual', 5], ['@canned', 2], ['batteries', 2], ['duct_tape', 1], ['toilet_paper', 2, 1, 4], ['newspaper', 2], ['alarm_clock', 1], ['flashlight', 0.5], ['firecrackers', 0.5]],
  },
  bar: {
    empty: 0.3, rolls: [1, 3], ammo: [0.5, 1],
    entries: [['beer', 10, 1, 4], ['whiskey', 6], ['moonshine', 2], ['glass_bottle', 5, 1, 3], ['cigarettes', 4], ['lighter', 3], ['cash', 3, 1, 5], ['pretzels', 4], ['chips', 3], ['baseball_bat', 1], ['shotgun_sawed', 0.4], ['ammo_12g', 0.8, 2, 6], ['rag', 2]],
  },
  stash: {
    empty: 0.15, rolls: [1, 3], dur: [0.5, 1], ammo: [0.5, 1],
    entries: [['cash', 3, 5, 20], ['revolver_357', 3], ['pistol_1911', 1], ['ammo_357', 4, 6, 18], ['ammo_45', 2, 7, 14], ['moonshine', 4], ['jerky', 3, 1, 3], ['@canned', 3, 1, 2], ['first_aid_kit', 2], ['antibiotics', 2], ['lockpick', 2, 1, 3],
      ['jewelry', 2, 1, 3], ['whiskey', 2], ['matches', 2], ['map_millbrook', 1], ['gunpowder', 1, 3, 10], ['pipe_bomb', 0.3], ['molotov', 0.6]],
  },
  barrel: {
    empty: 0.5, rolls: [1, 2], dur: [0.2, 0.7], liquid: [0, 0.4],
    entries: [['scrap_metal', 6, 1, 3], ['rag_dirty', 4, 1, 2], ['metal_pipe', 3], ['wire', 2], ['plank', 3, 1, 2], ['tin_can', 4, 1, 3], ['gas_can', 1], ['garbage_bag', 3], ['brick', 1]],
  },

  // ===== location overrides ==============================================================================
  hardware_store: {
    empty: 0.3, rolls: [2, 4], looted: true, dur: NEW, uses: [0.8, 1],
    entries: [['hammer', 5], ['saw', 4], ['crowbar', 3], ['nails', 8, 20, 60], ['duct_tape', 6], ['glue', 4], ['wire', 4], ['rope', 4], ['zip_ties', 3, 10, 20], ['tarp', 3], ['wood_axe', 2], ['hatchet', 2], ['sledgehammer', 1.5], ['shovel', 3], ['pickaxe', 1],
      ['wrench', 3], ['screwdriver', 4], ['multitool', 1.2], ['work_gloves', 3], ['hard_hat', 2], ['hi_vis_vest', 2], ['work_pants', 1.5], ['work_boots', 1.5], ['plank', 3, 2, 6], ['metal_pipe', 3], ['sheet_metal', 2], ['gas_can', 2, 1, 1, { liquid: [0, 0] }],
      ['lantern', 1.5], ['flashlight', 2], ['batteries', 3, 1, 4], ['bleach', 1], ['garbage_bag', 2, 2, 6], ['whetstone', 1.5], ['chore_coat', 1]],
  },
  gun_store: {
    empty: 0.4, rolls: [1, 4], looted: true, dur: NEW, ammo: [0, 0],
    entries: [['ammo_22', 5, 20, 60], ['ammo_9mm', 5, 10, 40], ['ammo_12g', 5, 6, 20], ['ammo_308', 3, 5, 15], ['ammo_357', 3, 6, 20], ['ammo_45', 3, 7, 25], ['ammo_556', 1, 10, 30], ['ammo_762', 1, 10, 30], ['ammo_12g_slug', 2, 5, 12],
      ['gun_cleaning_kit', 4], ['hunting_knife', 3], ['binoculars', 2], ['hunting_vest', 3], ['hunting_jacket', 2], ['hunting_pants', 2], ['beanie_orange', 2], ['canteen', 2], ['compass', 2], ['flashlight_tactical', 1], ['bow', 1], ['arrow', 2, 4, 12],
      ['crossbow_bolt', 1, 3, 8], ['rifle_22', 1], ['shotgun_pump', 1], ['whetstone', 2], ['tactical_gloves', 1], ['combat_knife', 0.5], ['key_gunstore', 0.3]],
  },
  gun_store_backroom: {
    empty: 0.05, rolls: [2, 5], dur: NEW, ammo: [0, 0],
    entries: [['rifle_ar15', 4], ['rifle_hunting', 5], ['shotgun_pump', 5], ['shotgun_tactical', 2], ['pistol_glock', 5], ['pistol_1911', 3], ['revolver_357', 4], ['rifle_sks', 3], ['rifle_ak47', 1.5], ['crossbow', 2], ['bow', 2], ['suppressor', 0.8], ['suppressor_rifle', 0.3],
      ['ammo_9mm', 6, 20, 50], ['ammo_556', 5, 20, 60], ['ammo_12g', 5, 10, 25], ['ammo_308', 4, 10, 30], ['ammo_45', 3, 14, 50], ['ammo_357', 3, 12, 36], ['ammo_762', 2, 20, 60], ['crossbow_bolt', 1.5, 6, 15], ['gun_cleaning_kit', 2]],
  },
  sporting_goods: {
    empty: 0.3, rolls: [1, 4], looted: true, dur: NEW, ammo: [0, 0],
    entries: [['baseball_bat', 6], ['aluminum_bat', 5], ['golf_club', 4], ['hockey_stick', 4], ['bow', 2], ['arrow', 3, 4, 12], ['crossbow', 0.6], ['crossbow_bolt', 1, 4, 10], ['backpack_hiking', 3], ['sneakers', 4], ['sweatpants', 3], ['hoodie', 3], ['bike_helmet', 3],
      ['canteen', 3], ['compass', 3], ['binoculars', 1], ['hunting_knife', 2], ['hatchet', 2], ['machete', 1], ['lantern', 2], ['flashlight', 2], ['headlamp', 2], ['water_bottle', 3], ['granola_bar', 3, 1, 4], ['sports_drink', 3], ['energy_drink', 2],
      ['rope', 2], ['matches', 2], ['map_millbrook', 1], ['winter_gloves', 2], ['beanie', 2], ['hiking_boots', 2], ['ammo_22', 1, 20, 50], ['ammo_12g', 1, 5, 15], ['rifle_22', 0.4], ['shotgun_pump', 0.3], ['hockey_mask', 1], ['book_fitness', 0.5], ['purification_tablets', 1, 4, 10]],
  },
  gas_station: {
    empty: 0.35, rolls: [1, 4], looted: true, fresh: [0.8, 2.5], liquid: [0, 0.5],
    entries: [['@snacks', 25], ['@drinks', 20], ['cigarettes', 5], ['lighter', 4], ['batteries', 3], ['map_millbrook', 3], ['gas_can', 3], ['duct_tape', 2], ['jerky', 4, 1, 2], ['candy', 4, 1, 3], ['firecrackers', 2, 1, 3], ['tire_iron', 1], ['flare', 3, 1, 2], ['energy_drink', 3, 1, 2], ['matches', 2], ['flashlight', 1]],
  },
  liquor_store: {
    empty: 0.3, rolls: [1, 4], looted: true, ammo: [0.5, 1],
    entries: [['beer', 10, 1, 4], ['whiskey', 10], ['moonshine', 3], ['glass_bottle', 4, 1, 3], ['cigarettes', 4], ['lighter', 3], ['cash', 2, 2, 8], ['chips', 2], ['pretzels', 2], ['shotgun_sawed', 0.3], ['ammo_12g', 0.5, 2, 6]],
  },
  pharmacy_storage: {
    empty: 0.05, rolls: [3, 6], uses: [0.9, 1],
    entries: [['antibiotics', 8], ['painkillers', 8], ['morphine', 3, 1, 2], ['sterile_bandage', 6, 2, 5], ['suture_kit', 4], ['beta_blockers', 4], ['sleeping_pills', 4], ['vitamins', 4], ['purification_tablets', 3, 4, 10], ['antiviral', 0.4], ['adrenaline', 2], ['first_aid_kit', 3], ['disinfectant', 4], ['cold_medicine', 3], ['burn_cream', 2]],
  },
  diner_kitchen: {
    empty: 0.25, rolls: [1, 4], fresh: [0.8, 3], dur: [0.4, 1],
    entries: [['@canned', 10, 1, 3], ['raw_meat', 5, 1, 3], ['cheese', 3], ['bread', 3], ['potato', 4, 2, 6], ['pot', 3], ['frying_pan', 4], ['kitchen_knife', 4], ['meat_cleaver', 3], ['rolling_pin', 2], ['coffee', 4], ['honey', 2], ['pickles', 3], ['matches', 2], ['rag', 3, 1, 3], ['bleach', 2], ['milk', 2]],
  },
  police_locker: {
    empty: 0.25, rolls: [1, 3], dur: [0.5, 1], ammo: [0.3, 1],
    entries: [['police_shirt', 4], ['police_pants', 4], ['police_jacket', 3], ['police_cap', 3], ['police_vest', 1.5], ['police_baton', 3], ['flashlight_tactical', 3], ['pistol_glock', 1.5], ['ammo_9mm', 4, 8, 30], ['radio_handheld', 3], ['tactical_gloves', 2], ['combat_boots', 2],
      ['dress_shoes', 2], ['energy_drink', 2], ['coffee', 2], ['painkillers', 2], ['first_aid_kit', 1], ['riot_helmet', 1], ['gas_mask', 1], ['binoculars', 1], ['photo', 1]],
  },
  police_armory: {
    empty: 0, rolls: [3, 6], dur: [0.75, 1], ammo: [0, 1],
    entries: [['shotgun_pump', 6], ['shotgun_tactical', 5], ['pistol_glock', 6], ['pistol_m9', 2], ['rifle_ar15', 4], ['smg_mp5', 2], ['rifle_m4', 0.6], ['police_vest', 5], ['riot_helmet', 3], ['gas_mask', 2], ['tactical_vest', 1.5],
      ['ammo_9mm', 10, 20, 50], ['ammo_12g', 9, 10, 25], ['ammo_12g_slug', 4, 5, 15], ['ammo_556', 6, 20, 60], ['smoke_grenade', 3], ['flare', 2, 1, 3], ['suppressor', 0.5], ['flashlight_tactical', 3], ['police_baton', 2], ['gun_cleaning_kit', 3], ['tactical_gloves', 2]],
  },
  police_evidence: {
    empty: 0.15, rolls: [1, 4], dur: [0.3, 0.9], ammo: [0, 0.6],
    entries: [['shotgun_sawed', 3], ['revolver_357', 3], ['pistol_1911', 2], ['rifle_ak47', 1], ['katana', 0.5], ['machete', 2], ['cash', 6, 5, 20], ['jewelry', 4, 1, 4], ['lockpick', 4, 1, 4], ['moonshine', 3], ['cigarettes', 3], ['smartphone', 3], ['combat_knife', 2], ['pipe_bomb', 0.5],
      ['@ammo_civ', 4], ['bobby_pins', 2], ['wallet', 3], ['firecrackers', 1], ['gunpowder', 1, 4, 12], ['prison_shirt', 1.5], ['prison_pants', 1.5]],
  },
  police_desk: {
    empty: 0.3, rolls: [1, 2], ammo: [0.3, 1],
    entries: [['coffee', 4], ['cookies', 3], ['radio_handheld', 3], ['flashlight_tactical', 2], ['ammo_9mm', 3, 4, 17], ['pistol_glock', 0.6], ['police_baton', 1], ['map_millbrook', 3], ['batteries', 3], ['painkillers', 2], ['cash', 2], ['key_police_armory', 0.4], ['newspaper', 2]],
  },
  hospital_storage: {
    empty: 0.2, rolls: [2, 5],
    entries: [['bandage', 6, 2, 6], ['sterile_bandage', 6, 1, 4], ['alcohol_wipes', 6, 3, 10], ['disinfectant', 5], ['rubber_gloves', 4], ['surgical_mask', 5], ['scrubs_top', 3], ['scrubs_pants', 3], ['hospital_gown', 2], ['splint', 3], ['suture_kit', 3], ['first_aid_kit', 3],
      ['painkillers', 4], ['antibiotics', 2], ['purification_tablets', 1, 2, 6], ['lab_coat', 1], ['medic_bag', 0.5], ['cold_medicine', 1], ['burn_cream', 2]],
  },
  hospital_ward: {
    empty: 0.4, rolls: [1, 2], fresh: [1, 3],
    entries: [['hospital_gown', 4], ['slippers', 3], ['painkillers', 3], ['bandage', 3], ['photo', 2], ['novel', 2], ['magazine', 3], ['candy', 2], ['water_bottle', 2], ['juice', 2], ['cookies', 2], ['tweezers', 1], ['sleeping_pills', 2], ['cold_medicine', 1], ['watch', 1], ['wallet', 1], ['smartphone', 2], ['bible', 1]],
  },
  hospital_pharmacy: {
    empty: 0.15, rolls: [2, 4], uses: [0.5, 1],
    entries: [['antibiotics', 8], ['painkillers', 6], ['morphine', 4], ['adrenaline', 2], ['antiviral', 1.2], ['sterile_bandage', 5, 1, 4], ['suture_kit', 3], ['beta_blockers', 3], ['sleeping_pills', 3], ['vitamins', 2], ['burn_cream', 2], ['disinfectant', 3], ['hemostatic_gauze', 1], ['cold_medicine', 2]],
  },
  school_locker: {
    empty: 0.35, rolls: [1, 3], fresh: [1, 3], dur: [0.4, 1],
    entries: [['backpack_school', 4], ['backpack_school_blue', 3], ['hoodie', 3], ['hoodie_red', 2], ['tshirt_blue', 3], ['tshirt', 2], ['varsity_jacket', 1.5], ['sneakers', 2], ['comic', 3], ['candy', 4, 1, 3], ['chips', 3], ['granola_bar', 3], ['soda', 3], ['energy_drink', 2],
      ['smartphone', 2], ['baseball_bat', 1], ['hockey_stick', 0.5], ['beanie', 1], ['baseball_cap', 2], ['book_fitness', 0.5], ['novel', 1], ['sweatpants', 2], ['photo', 1]],
  },
  school_office: {
    empty: 0.3, rolls: [1, 3],
    entries: [['coffee', 3], ['cookies', 2], ['first_aid_kit', 2], ['bandage', 3, 1, 3], ['painkillers', 2], ['alcohol_wipes', 2, 1, 4], ['map_millbrook', 2], ['radio_handheld', 1], ['flashlight', 2], ['batteries', 3], ['duct_tape', 2], ['newspaper', 2], ['glue', 1], ['novel', 1], ['@skill_books', 1.5], ['cash', 1]],
  },
  fire_station: {
    empty: 0.2, rolls: [1, 4], dur: [0.5, 1],
    entries: [['fire_axe', 5], ['firefighter_helmet', 4], ['firefighter_jacket', 3], ['firefighter_pants', 3], ['firefighter_boots', 3], ['gas_mask', 1.5], ['crowbar', 3], ['sledgehammer', 2], ['first_aid_kit', 3], ['bandage', 3, 1, 3], ['flashlight', 3], ['flashlight_tactical', 2],
      ['radio_handheld', 2], ['rope', 3], ['work_gloves', 3], ['hi_vis_vest', 2], ['burn_cream', 3], ['coffee', 2], ['@canned', 2], ['water_jug', 2], ['headlamp', 1.5]],
  },
  church: {
    empty: 0.3, rolls: [1, 3], dur: [0.5, 1],
    entries: [['bible', 8], ['matches', 3], ['lighter', 1], ['@canned', 6, 1, 2], ['water_jug', 3], ['water_bottle', 3], ['tshirt', 3], ['sweater', 3], ['winter_coat', 2], ['winter_gloves', 2], ['beanie', 2], ['first_aid_kit', 1], ['crackers', 3], ['peanut_butter', 2], ['novel', 2], ['cash', 1, 2, 6]],
  },
  motel_room: {
    empty: 0.35, rolls: [1, 3], ammo: [0.3, 1], fresh: [1, 3], dur: [0.4, 0.9],
    entries: [['rag', 4, 1, 2], ['toilet_paper', 3], ['magazine', 3], ['bible', 3], ['beer', 3, 1, 3], ['whiskey', 1], ['cigarettes', 3], ['lighter', 2], ['chips', 2], ['candy', 2], ['duffel_bag', 1.5], ['backpack_school', 1], ['tshirt', 2], ['jeans', 2],
      ['pistol_glock', 0.5], ['revolver_357', 0.5], ['ammo_9mm', 0.8, 4, 15], ['cash', 2, 1, 6], ['sleeping_pills', 1], ['painkillers', 1], ['map_millbrook', 2], ['smartphone', 2], ['flashlight', 1]],
  },
  warehouse: {
    empty: 0.3, rolls: [1, 4], dur: [0.5, 1], liquid: [0.6, 1],
    entries: [['@canned', 4, 2, 4], ['water_jug', 3], ['plank', 4, 2, 6], ['nails', 4, 10, 40], ['tarp', 3], ['rope', 3], ['garbage_bag', 3, 2, 8], ['toilet_paper', 4, 2, 6], ['bleach', 2], ['scrap_metal', 3, 1, 4], ['sheet_metal', 2], ['metal_pipe', 2], ['duct_tape', 3],
      ['gas_can', 1], ['hi_vis_vest', 2], ['work_gloves', 2], ['hard_hat', 1], ['crowbar', 1], ['batteries', 2, 2, 4], ['flashlight', 1], ['zip_ties', 2, 10, 20]],
  },
  farm_barn: {
    empty: 0.3, rolls: [1, 4], dur: [0.3, 0.9], ammo: [0, 1], fresh: [0, 0.8], liquid: [0, 1],
    entries: [['pitchfork', 5], ['shovel', 4], ['wood_axe', 2], ['hatchet', 2], ['rope', 4], ['wheat', 4, 3, 10], ['corn', 4, 2, 6], ['pumpkin', 3], ['potato', 3, 2, 6], ['carrot', 2, 2, 5], ['gas_can', 3], ['plank', 4, 2, 5], ['nails', 3, 5, 20], ['work_gloves', 3],
      ['overalls', 2], ['work_boots', 2], ['rain_boots', 2], ['shotgun_double', 1], ['ammo_12g', 1.5, 2, 8], ['moonshine', 1.5], ['whiskey', 1], ['sledgehammer', 1], ['tarp', 2], ['wire', 2], ['saw', 1], ['lantern', 1], ['scrap_metal', 2], ['feather', 2, 2, 8], ['chore_coat', 1.5], ['trucker_hat', 1]],
  },
  farm_shed: {
    empty: 0.3, rolls: [1, 3], dur: [0.3, 0.9], liquid: [0, 1],
    entries: [['shovel', 3], ['pitchfork', 2], ['hatchet', 2], ['saw', 2], ['hammer', 2], ['nails', 3, 5, 20], ['rope', 2], ['gas_can', 3], ['wire', 2], ['duct_tape', 2], ['work_gloves', 2], ['garbage_bag', 2], ['scrap_metal', 2], ['metal_pipe', 2], ['rain_boots', 1], ['glue', 1], ['plank', 2, 1, 4], ['wood_axe', 1]],
  },
  mechanic: {
    empty: 0.25, rolls: [1, 4], dur: [0.4, 1], liquid: [0, 1],
    entries: [['wrench', 5], ['tire_iron', 5], ['crowbar', 2], ['screwdriver', 4], ['hammer', 2], ['duct_tape', 3], ['wire', 3], ['scrap_metal', 5, 1, 4], ['metal_pipe', 3], ['sheet_metal', 2], ['gas_can', 4], ['batteries', 3], ['work_shirt', 3], ['overalls', 1], ['work_pants', 2], ['work_gloves', 3],
      ['rag_dirty', 4, 1, 3], ['rag', 2, 1, 3], ['electronics', 2], ['glue', 1], ['multitool', 1], ['flashlight', 2], ['zip_ties', 3, 5, 15], ['energy_drink', 1], ['cigarettes', 2], ['headlamp', 1]],
  },
  hunting_cabin: {
    empty: 0.15, rolls: [2, 4], dur: [0.4, 1], ammo: [0, 1], fresh: [0.3, 2],
    entries: [['rifle_hunting', 3], ['shotgun_double', 2], ['shotgun_pump', 2], ['rifle_22', 2], ['crossbow', 1], ['bow', 1.5], ['arrow', 2, 3, 10], ['crossbow_bolt', 1, 3, 8], ['ammo_308', 4, 4, 14], ['ammo_12g', 3, 4, 12], ['ammo_22', 3, 10, 40],
      ['hunting_knife', 3], ['hatchet', 3], ['wood_axe', 2], ['@clothes_hunting', 8], ['binoculars', 2], ['compass', 2], ['map_millbrook', 1], ['canteen', 2], ['jerky', 4, 1, 3], ['@canned', 3], ['moonshine', 3], ['whiskey', 2], ['matches', 3], ['lighter', 1],
      ['lantern', 2], ['flashlight', 1], ['rope', 2], ['first_aid_kit', 1], ['book_sneaking', 1], ['magazine', 2], ['feather', 2, 2, 8], ['raw_meat', 1], ['whetstone', 1.5]],
  },
  ranger_station: {
    empty: 0.2, rolls: [1, 4], dur: [0.5, 1], ammo: [0.2, 1],
    entries: [['map_millbrook', 4], ['compass', 3], ['binoculars', 3], ['radio_handheld', 3], ['flashlight', 3], ['batteries', 3, 1, 3], ['first_aid_kit', 3], ['bandage', 3, 1, 3], ['rope', 3], ['hatchet', 2], ['wood_axe', 1], ['rifle_hunting', 1], ['shotgun_pump', 1],
      ['ammo_308', 1.5, 4, 10], ['ammo_12g', 1.5, 4, 10], ['canteen', 2], ['backpack_hiking', 2], ['hiking_boots', 2], ['raincoat', 2], ['purification_tablets', 3, 2, 8], ['matches', 2], ['flare', 3, 1, 3], ['@canned', 2], ['mre', 1], ['book_scavenging', 1], ['boonie_hat', 1]],
  },
  campsite: {
    empty: 0.3, rolls: [1, 3], dur: [0.3, 0.9], fresh: [0.5, 3], liquid: [0, 1], dirty: 0.3,
    entries: [['@canned', 4], ['jerky', 3], ['granola_bar', 3], ['water_bottle', 3], ['canteen', 2], ['beer', 3, 1, 3], ['matches', 3], ['lighter', 2], ['flashlight', 2], ['lantern', 2], ['batteries', 2], ['rope', 2], ['tarp', 2], ['hatchet', 2], ['pocket_knife', 2],
      ['backpack_hiking', 1], ['beanie', 2], ['flannel_shirt', 2], ['hoodie', 2], ['pot', 2], ['frying_pan', 1], ['purification_tablets', 1, 2, 6], ['compass', 1], ['map_millbrook', 1], ['berries', 1, 3, 8]],
  },
  survivor_stash: {
    empty: 0.05, rolls: [2, 5], dur: [0.5, 1], ammo: [0.3, 1], liquid: [0.5, 1],
    entries: [['@canned', 5, 1, 3], ['mre', 2], ['water_jug', 3], ['water_bottle', 3], ['ammo_9mm', 3, 6, 20], ['ammo_12g', 3, 4, 12], ['ammo_22', 2, 10, 30], ['pistol_glock', 1], ['revolver_357', 1], ['shotgun_pump', 1], ['rifle_22', 1], ['first_aid_kit', 2], ['antibiotics', 1.5],
      ['bandage', 3, 1, 4], ['painkillers', 2], ['purification_tablets', 2, 3, 8], ['batteries', 3, 1, 3], ['flashlight', 2], ['lighter', 2], ['duct_tape', 2], ['map_millbrook', 1], ['radio_handheld', 1], ['molotov', 1, 1, 2], ['pipe_bomb', 0.4],
      ['machete', 1], ['crowbar', 1], ['backpack_hiking', 1], ['sterile_bandage', 1.5, 1, 3], ['jerky', 2, 1, 3]],
  },
  military_tent: {
    empty: 0.2, rolls: [1, 4], dur: [0.4, 1], ammo: [0, 1], liquid: [0.3, 1],
    entries: [['mre', 6, 1, 2], ['water_bottle', 4], ['canteen', 4], ['@clothes_military', 12], ['ammo_556', 4, 10, 30], ['ammo_9mm', 2, 6, 20], ['pistol_m9', 1], ['rifle_m4', 0.4], ['dog_tags', 2], ['ifak', 2], ['bandage', 3, 1, 3], ['flashlight', 2], ['radio_handheld', 1],
      ['cigarettes', 2], ['magazine', 2], ['photo', 1], ['energy_drink', 1], ['flare', 1], ['purification_tablets', 1, 2, 6]],
  },
  military_armory: {
    empty: 0, rolls: [3, 6], dur: [0.7, 1], ammo: [0, 1],
    entries: [['rifle_m4', 6], ['pistol_m9', 5], ['shotgun_tactical', 2], ['rifle_hunting', 1], ['frag_grenade', 3, 1, 3], ['smoke_grenade', 3, 1, 2], ['suppressor_rifle', 1], ['suppressor', 0.6], ['ammo_556', 10, 30, 60], ['ammo_9mm', 6, 15, 50], ['ammo_12g', 3, 10, 25],
      ['ammo_308', 2, 10, 20], ['plate_carrier', 2], ['tactical_vest', 3], ['military_helmet', 3], ['chest_rig', 2], ['gas_mask', 2], ['combat_knife', 2], ['gun_cleaning_kit', 3], ['flare', 2, 1, 3], ['backpack_military', 1]],
  },
  military_medical: {
    empty: 0.1, rolls: [2, 4],
    entries: [['ifak', 5], ['hemostatic_gauze', 4, 1, 3], ['sterile_bandage', 5, 1, 4], ['morphine', 3, 1, 2], ['antibiotics', 4], ['adrenaline', 2], ['antiviral', 0.8], ['suture_kit', 3], ['splint', 3], ['first_aid_kit', 2], ['painkillers', 3], ['disinfectant', 3], ['purification_tablets', 3, 4, 10], ['surgical_mask', 2], ['rubber_gloves', 2], ['medic_bag', 1]],
  },
  fema_supply: {
    empty: 0.15, rolls: [2, 5], liquid: [0.8, 1],
    entries: [['water_jug', 6], ['water_bottle', 6], ['mre', 6, 1, 3], ['@canned', 5, 1, 3], ['crackers', 3], ['peanut_butter', 2], ['purification_tablets', 4, 4, 10], ['first_aid_kit', 2], ['bandage', 3, 2, 5], ['painkillers', 2], ['flashlight', 2], ['batteries', 4, 1, 4],
      ['radio_handheld', 2], ['tarp', 2], ['toilet_paper', 2, 1, 4], ['garbage_bag', 2, 2, 6], ['surgical_mask', 3], ['rubber_gloves', 2], ['vitamins', 2], ['flare', 2], ['map_millbrook', 2], ['bleach', 1], ['hi_vis_vest', 1]],
  },
  trailer_home: {
    empty: 0.3, rolls: [1, 3], dur: [0.3, 0.9], ammo: [0, 1], fresh: [0.5, 2.5],
    entries: [['beer', 5, 1, 4], ['whiskey', 2], ['moonshine', 2], ['cigarettes', 4], ['lighter', 3], ['@canned', 4], ['dog_food', 2], ['chips', 3], ['jerky', 2], ['instant_noodles', 3, 1, 3], ['shotgun_pump', 1], ['rifle_22', 1], ['revolver_357', 0.6], ['ammo_12g', 1.5, 2, 8],
      ['ammo_22', 1.5, 10, 30], ['flannel_shirt', 2], ['jeans', 2], ['work_boots', 1], ['baseball_cap', 2], ['trucker_hat', 2], ['hammer', 1], ['wrench', 1], ['duct_tape', 2], ['sleeping_pills', 1], ['painkillers', 1], ['magazine', 2], ['tv_remote', 2], ['cash', 1], ['firecrackers', 1]],
  },
  library: {
    empty: 0.3, rolls: [1, 3],
    entries: [['novel', 10], ['magazine', 4], ['comic', 3], ['@skill_books', 8], ['bible', 2], ['map_millbrook', 2], ['newspaper', 4]],
  },
  electronics: {
    empty: 0.35, rolls: [1, 3], looted: true, uses: [0.9, 1],
    entries: [['batteries', 8, 1, 4], ['electronics', 6, 1, 3], ['smartphone', 4], ['radio_handheld', 4], ['flashlight', 3], ['headlamp', 2], ['lantern', 2], ['alarm_clock', 3], ['wire', 4], ['tv_remote', 3], ['watch', 2], ['glue', 1], ['zip_ties', 2, 5, 15], ['flashlight_tactical', 0.6]],
  },
  construction: {
    empty: 0.3, rolls: [1, 4], dur: [0.3, 1], liquid: [0, 1],
    entries: [['hard_hat', 5], ['hi_vis_vest', 5], ['work_gloves', 4], ['work_boots', 3], ['work_pants', 3], ['sledgehammer', 3], ['shovel', 3], ['pickaxe', 2], ['crowbar', 3], ['hammer', 3], ['nails', 5, 10, 40], ['plank', 5, 2, 6], ['metal_pipe', 4], ['sheet_metal', 3], ['scrap_metal', 3, 1, 4],
      ['duct_tape', 2], ['wire', 3], ['zip_ties', 2, 5, 20], ['rope', 2], ['tarp', 2], ['gas_can', 2], ['saw', 2], ['energy_drink', 2], ['cigarettes', 2], ['water_jug', 1], ['brick', 3, 1, 4], ['lantern', 1]],
  },
  truck_cargo: {
    empty: 0.2, rolls: [2, 5], fresh: [0.8, 2.5], dur: [0.6, 1], liquid: [0.8, 1],
    entries: [['@canned', 5, 2, 4], ['water_jug', 4], ['toilet_paper', 4, 2, 6], ['garbage_bag', 3, 2, 8], ['@clothes_casual', 3], ['plank', 3, 2, 6], ['tarp', 3], ['batteries', 3, 2, 4], ['soda', 3, 2, 6], ['chips', 3, 1, 4], ['beer', 2, 2, 4], ['@snacks', 3], ['bleach', 1], ['dog_food', 1, 1, 4]],
  },
  airdrop: {
    empty: 0, rolls: [4, 7], dur: [0.9, 1], ammo: [0, 1], uses: [1, 1], liquid: [1, 1],
    always: [['mre', 2, 3], ['water_bottle', 1, 1]],
    entries: [['mre', 6, 1, 3], ['water_jug', 3], ['ifak', 4], ['first_aid_kit', 3], ['antibiotics', 4], ['antiviral', 1.5], ['morphine', 2], ['sterile_bandage', 4, 2, 5], ['purification_tablets', 3, 5, 10], ['rifle_m4', 2], ['pistol_m9', 2], ['ammo_556', 5, 30, 60],
      ['ammo_9mm', 4, 15, 50], ['frag_grenade', 1.5, 1, 2], ['smoke_grenade', 2], ['flare', 3, 2, 4], ['radio_handheld', 2], ['batteries', 2, 2, 4], ['plate_carrier', 0.8], ['military_helmet', 1.5], ['backpack_military', 1], ['map_millbrook', 1], ['binoculars', 1], ['suppressor_rifle', 0.6], ['hemostatic_gauze', 2, 1, 3]],
  },
  heli_crash: {
    empty: 0, rolls: [3, 6], dur: [0.4, 0.9], ammo: [0.2, 1],
    entries: [['rifle_m4', 4], ['pistol_m9', 3], ['smg_mp5', 1], ['ammo_556', 6, 15, 60], ['ammo_9mm', 4, 10, 40], ['frag_grenade', 2, 1, 2], ['smoke_grenade', 2], ['plate_carrier', 1.5], ['tactical_vest', 2], ['military_helmet', 3], ['gas_mask', 1.5], ['chest_rig', 1.5], ['backpack_military', 1.5],
      ['ifak', 4], ['hemostatic_gauze', 3, 1, 2], ['morphine', 2], ['antiviral', 1], ['combat_knife', 2], ['binoculars', 1], ['radio_handheld', 2], ['flare', 3, 1, 3], ['mre', 4, 1, 3], ['canteen', 2], ['suppressor_rifle', 0.5], ['key_military_armory', 0.3], ['dog_tags', 3]],
  },

  // ===== vehicles ========================================================================================
  car_trunk: {
    empty: 0.3, rolls: [1, 3], dur: [0.3, 0.9], liquid: [0, 0.6], ammo: [0, 1], fresh: [1, 3],
    entries: [['tire_iron', 5], ['gas_can', 3], ['duct_tape', 2], ['rope', 2], ['flashlight', 2], ['batteries', 2], ['first_aid_kit', 1], ['water_bottle', 3], ['@clothes_casual', 3], ['duffel_bag', 1], ['backpack_school', 1], ['baseball_bat', 1], ['golf_club', 2],
      ['shotgun_pump', 0.3], ['wire', 1], ['@canned', 1], ['beer', 2, 1, 4], ['sports_drink', 1], ['tarp', 1], ['flare', 2, 1, 3], ['crowbar', 0.8], ['hockey_stick', 0.5], ['wrench', 1], ['garbage_bag', 1]],
  },
  car_glovebox: {
    empty: 0.35, rolls: [1, 2], ammo: [0.5, 1],
    entries: [['map_millbrook', 4], ['flashlight', 2], ['batteries', 2], ['cigarettes', 3], ['lighter', 3], ['candy', 2, 1, 3], ['painkillers', 2], ['cash', 2, 1, 4], ['photo', 1], ['revolver_357', 0.4], ['pistol_glock', 0.4], ['ammo_9mm', 0.6, 4, 15], ['toilet_paper', 2], ['energy_drink', 1],
      ['matches', 1], ['multitool', 0.6], ['pocket_knife', 1], ['bobby_pins', 1], ['granola_bar', 1], ['wallet', 1]],
  },
  police_car_trunk: {
    empty: 0.15, rolls: [1, 3], dur: [0.5, 1], ammo: [0.3, 1],
    entries: [['shotgun_pump', 3], ['ammo_12g', 4, 5, 15], ['flare', 4, 1, 4], ['first_aid_kit', 2], ['police_vest', 1.5], ['riot_helmet', 1], ['flashlight_tactical', 2], ['ammo_9mm', 3, 8, 30], ['hi_vis_vest', 1], ['police_baton', 1], ['radio_handheld', 2], ['gas_mask', 0.6], ['water_bottle', 2], ['bandage', 2, 1, 3], ['rifle_ar15', 0.5], ['ammo_556', 0.6, 10, 30]],
  },
  ambulance: {
    empty: 0.15, rolls: [2, 4],
    entries: [['bandage', 6, 1, 4], ['sterile_bandage', 5, 1, 3], ['splint', 4], ['disinfectant', 3], ['alcohol_wipes', 4, 2, 6], ['painkillers', 3], ['morphine', 1.5], ['adrenaline', 2], ['first_aid_kit', 3], ['suture_kit', 2], ['hemostatic_gauze', 1.5], ['medic_bag', 1.5], ['rubber_gloves', 3], ['surgical_mask', 3], ['antibiotics', 1], ['burn_cream', 2], ['tweezers', 2], ['water_bottle', 2]],
  },
  military_truck: {
    empty: 0.15, rolls: [2, 4], dur: [0.4, 1], ammo: [0, 1], liquid: [0.3, 1],
    entries: [['mre', 6, 1, 3], ['water_jug', 3], ['ammo_556', 5, 10, 40], ['canteen', 3], ['@clothes_military', 4], ['ifak', 2], ['gas_can', 3], ['tarp', 2], ['rope', 2], ['rifle_m4', 0.8], ['pistol_m9', 1], ['smoke_grenade', 1], ['flare', 2], ['shovel', 1], ['radio_handheld', 1], ['backpack_military', 0.8]],
  },
  pickup_bed: {
    empty: 0.35, rolls: [1, 3], dur: [0.3, 0.9], liquid: [0, 0.8], fresh: [1, 3],
    entries: [['tarp', 2], ['rope', 3], ['gas_can', 3], ['plank', 3, 1, 4], ['hammer', 1], ['wrench', 1], ['shovel', 2], ['pitchfork', 1], ['sledgehammer', 0.6], ['beer', 3, 1, 4], ['scrap_metal', 3, 1, 3], ['brick', 2, 1, 3], ['wheat', 1, 2, 6], ['tire_iron', 2], ['work_gloves', 2], ['garbage_bag', 2], ['wood_axe', 1], ['crowbar', 1], ['log', 1, 1, 2]],
  },

  // ===== zombie corpses (killed zombies): mostly nothing, sometimes junk, rarely something matching the outfit
  zombie_civilian: {
    empty: 0.6, rolls: [1, 1], dur: [0.1, 0.6], fresh: [0.5, 3],
    entries: [['@pocket', 30], ['kitchen_knife', 0.6], ['pocket_knife', 0.6], ['soda', 1], ['map_millbrook', 0.3], ['energy_drink', 0.5], ['water_bottle', 0.6, 1, 1, { liquid: [0, 0.6] }]],
  },
  zombie_police: {
    empty: 0.35, rolls: [1, 2], dur: [0.3, 0.8], ammo: [0, 0.7],
    entries: [['ammo_9mm', 6, 3, 15], ['pistol_glock', 2], ['police_baton', 3], ['flashlight_tactical', 3], ['radio_handheld', 2], ['bandage', 2], ['cash', 1], ['police_cap', 1], ['painkillers', 1], ['key_police_armory', 0.25], ['cigarettes', 1], ['energy_drink', 1], ['wallet', 2]],
  },
  zombie_military: {
    empty: 0.3, rolls: [1, 2], dur: [0.3, 0.8], ammo: [0, 0.7], liquid: [0, 0.6],
    entries: [['ammo_556', 6, 5, 25], ['ammo_9mm', 2, 3, 12], ['dog_tags', 6], ['mre', 3], ['ifak', 2], ['bandage', 2], ['canteen', 2], ['combat_knife', 1], ['frag_grenade', 0.5], ['smoke_grenade', 0.6], ['flare', 1], ['cigarettes', 1], ['pistol_m9', 1], ['photo', 1], ['morphine', 0.6]],
  },
  zombie_medic: {
    empty: 0.4, rolls: [1, 2],
    entries: [['bandage', 6, 1, 3], ['sterile_bandage', 3], ['alcohol_wipes', 5, 1, 4], ['painkillers', 4], ['rubber_gloves', 3], ['surgical_mask', 3], ['antibiotics', 1], ['morphine', 0.6], ['suture_kit', 1], ['tweezers', 2], ['disinfectant', 1], ['smartphone', 2], ['wallet', 2], ['antiviral', 0.15]],
  },
  zombie_firefighter: {
    empty: 0.45, rolls: [1, 1], dur: [0.3, 0.8],
    entries: [['flashlight', 3], ['radio_handheld', 3], ['fire_axe', 0.6], ['work_gloves', 3], ['burn_cream', 2], ['bandage', 2], ['lighter', 2], ['cigarettes', 2], ['water_bottle', 1], ['wallet', 2], ['headlamp', 1]],
  },
  zombie_worker: {
    empty: 0.5, rolls: [1, 1], dur: [0.3, 0.8],
    entries: [['hammer', 2], ['screwdriver', 3], ['wrench', 1.5], ['duct_tape', 2], ['nails', 3, 3, 12], ['work_gloves', 3], ['zip_ties', 2, 2, 6], ['wire', 2], ['cigarettes', 2], ['lighter', 2], ['energy_drink', 2], ['wallet', 2], ['multitool', 0.4], ['flashlight', 1], ['headlamp', 1]],
  },
  zombie_prisoner: {
    empty: 0.6, rolls: [1, 1], dur: [0.2, 0.7],
    entries: [['shiv', 4], ['cigarettes', 5], ['lighter', 2], ['lockpick', 1.5], ['bobby_pins', 2, 1, 3], ['photo', 2], ['candy', 2], ['rag_dirty', 3]],
  },
  zombie_farmer: {
    empty: 0.55, rolls: [1, 1], fresh: [0.3, 2],
    entries: [['lighter', 2], ['cigarettes', 2], ['pocket_knife', 2], ['ammo_12g', 2, 1, 5], ['wheat', 2, 1, 4], ['corn', 2], ['moonshine', 0.6], ['apple', 2], ['rope', 1], ['work_gloves', 2], ['wallet', 2], ['carrot', 1], ['potato', 1]],
  },
  zombie_hunter: {
    empty: 0.4, rolls: [1, 2], dur: [0.3, 0.8], fresh: [0.3, 2],
    entries: [['ammo_308', 4, 2, 8], ['ammo_12g', 3, 2, 6], ['hunting_knife', 1.5], ['jerky', 3], ['compass', 2], ['lighter', 2], ['matches', 1], ['beanie_orange', 1], ['canteen', 1], ['binoculars', 0.5], ['pocket_knife', 1], ['arrow', 1, 1, 4], ['raw_meat', 1], ['map_millbrook', 0.5], ['feather', 1, 1, 4]],
  },
  zombie_patient: {
    empty: 0.75, rolls: [1, 1],
    entries: [['painkillers', 3], ['bandage', 2], ['rag_dirty', 4], ['photo', 2], ['candy', 1], ['sleeping_pills', 1], ['watch', 0.5]],
  },
  zombie_survivor: {
    empty: 0.3, rolls: [1, 2], dur: [0.2, 0.7], ammo: [0, 0.6], liquid: [0, 0.5], uses: [0.1, 0.7],
    entries: [['@canned', 3], ['water_bottle', 2], ['bandage', 3], ['painkillers', 2], ['ammo_9mm', 2, 2, 10], ['ammo_12g', 2, 1, 5], ['ammo_22', 1, 5, 15], ['kitchen_knife', 2], ['hunting_knife', 1], ['lighter', 2], ['matches', 1], ['flashlight', 2], ['batteries', 1], ['granola_bar', 2],
      ['jerky', 1], ['map_millbrook', 0.5], ['rag', 2], ['duct_tape', 1], ['crowbar', 0.3], ['pistol_glock', 0.4], ['antibiotics', 0.4]],
  },

  zombie_office: {
    empty: 0.6, rolls: [1, 1],
    entries: [['smartphone', 6], ['wallet', 6], ['cash', 4, 1, 3], ['coffee', 1], ['painkillers', 2], ['candy', 2], ['photo', 2], ['watch', 1.5], ['cigarettes', 1], ['lighter', 1], ['alcohol_wipes', 1], ['granola_bar', 1], ['batteries', 1]],
  },

  // ===== dead survivors (placed bodies; better loot) ======================================================
  corpse_civilian: {
    empty: 0.25, rolls: [1, 3], dur: [0.2, 0.8], fresh: [0.5, 3], liquid: [0, 0.7],
    entries: [['@pocket', 20], ['water_bottle', 3], ['@snacks', 3], ['painkillers', 1], ['bandage', 2], ['kitchen_knife', 1], ['baseball_bat', 1], ['backpack_school', 1], ['@clothes_casual', 2], ['map_millbrook', 0.5]],
  },
  corpse_survivor: {
    empty: 0.1, rolls: [2, 4], dur: [0.3, 0.9], ammo: [0, 0.8], liquid: [0, 0.8], uses: [0.1, 0.8],
    entries: [['@canned', 4], ['water_bottle', 3], ['canteen', 1], ['bandage', 3, 1, 3], ['painkillers', 2], ['first_aid_kit', 1], ['antibiotics', 0.8], ['@ammo_civ', 3], ['pistol_glock', 1], ['revolver_357', 1], ['shotgun_pump', 0.8], ['rifle_22', 0.8], ['machete', 1], ['crowbar', 1.5], ['hatchet', 1],
      ['flashlight', 2], ['batteries', 2], ['lighter', 2], ['map_millbrook', 1], ['backpack_hiking', 0.8], ['duct_tape', 1], ['molotov', 0.6], ['sterile_bandage', 1], ['jerky', 2], ['purification_tablets', 1, 1, 4]],
  },
  corpse_police: {
    empty: 0.1, rolls: [1, 3], dur: [0.3, 0.9], ammo: [0, 0.8],
    entries: [['pistol_glock', 4], ['ammo_9mm', 6, 5, 30], ['police_baton', 2], ['flashlight_tactical', 2], ['radio_handheld', 2], ['police_vest', 1], ['shotgun_pump', 1], ['ammo_12g', 2, 2, 8], ['bandage', 1], ['key_police_armory', 0.5], ['first_aid_kit', 0.5], ['wallet', 1]],
  },
  corpse_military: {
    empty: 0.1, rolls: [2, 3], dur: [0.3, 0.8], ammo: [0, 0.8], liquid: [0, 0.8],
    entries: [['rifle_m4', 2], ['pistol_m9', 2], ['ammo_556', 6, 10, 40], ['ammo_9mm', 2, 5, 20], ['dog_tags', 5], ['mre', 3], ['ifak', 2], ['canteen', 2], ['frag_grenade', 0.8], ['smoke_grenade', 1], ['military_helmet', 1.5], ['tactical_vest', 0.8], ['plate_carrier', 0.3], ['combat_knife', 1], ['flare', 1], ['radio_handheld', 1], ['key_military_armory', 0.15]],
  },

  // ===== floor loot (sparse small items lying around) ====================================================
  floor_house: {
    empty: 0.5, rolls: [1, 1], dur: [0.2, 0.8], fresh: [0.8, 3],
    entries: [['candy', 2], ['newspaper', 3], ['magazine', 3], ['comic', 1], ['tv_remote', 3], ['batteries', 1], ['rag_dirty', 2], ['glass_bottle', 2], ['soda_can', 3], ['tin_can', 2], ['chips', 1], ['kitchen_knife', 0.8], ['baseball_bat', 0.4], ['hammer', 0.4], ['photo', 1],
      ['toilet_paper', 1], ['cigarettes', 1], ['lighter', 1], ['matches', 1], ['novel', 1], ['bandage', 0.6], ['painkillers', 0.5], ['water_bottle', 0.5], ['plastic_bottle', 1]],
  },
  floor_store: {
    empty: 0.5, rolls: [1, 1], fresh: [0.8, 3],
    entries: [['@canned', 2], ['chips', 2], ['candy', 2], ['soda', 2], ['plastic_bottle', 2], ['tin_can', 2], ['garbage_bag', 1], ['toilet_paper', 2], ['batteries', 1], ['magazine', 2], ['newspaper', 1], ['cash', 1], ['glass_bottle', 1], ['rag_dirty', 1], ['granola_bar', 1], ['water_bottle', 0.5]],
  },
  floor_street: {
    empty: 0.6, rolls: [1, 1], dur: [0.1, 0.7],
    entries: [['soda_can', 4], ['glass_bottle', 3], ['tin_can', 3], ['newspaper', 3], ['plastic_bottle', 3], ['rag_dirty', 2], ['brick', 2], ['scrap_metal', 2], ['plank', 1], ['cigarettes', 1], ['lighter', 0.5], ['cash', 0.5], ['wallet', 0.5], ['smartphone', 0.6], ['lead_pipe', 0.3],
      ['baseball_bat', 0.2], ['metal_pipe', 0.5], ['stick', 1], ['garbage_bag', 1], ['batteries', 0.3]],
  },
  floor_office: {
    empty: 0.5, rolls: [1, 1], dur: [0.3, 0.8],
    entries: [['newspaper', 3], ['magazine', 2], ['coffee', 1], ['smartphone', 2], ['cash', 1], ['candy', 2], ['batteries', 1], ['duct_tape', 0.5], ['glue', 0.5], ['electronics', 1], ['alarm_clock', 1], ['flashlight', 0.3], ['painkillers', 0.5], ['plastic_bottle', 1], ['screwdriver', 0.5]],
  },
  floor_military: {
    empty: 0.45, rolls: [1, 1], dur: [0.2, 0.7], liquid: [0, 0.5],
    entries: [['ammo_556', 4, 2, 12], ['ammo_9mm', 2, 2, 10], ['mre', 2], ['canteen', 1], ['bandage', 2], ['dog_tags', 2], ['flare', 1], ['cigarettes', 1], ['smoke_grenade', 0.3], ['ifak', 0.5], ['military_helmet', 0.3], ['tin_can', 2], ['plastic_bottle', 1], ['scrap_metal', 1], ['combat_knife', 0.2]],
  },
  floor_hospital: {
    empty: 0.45, rolls: [1, 1],
    entries: [['bandage', 3], ['alcohol_wipes', 3, 1, 3], ['rubber_gloves', 3], ['surgical_mask', 3], ['painkillers', 2], ['tweezers', 1], ['disinfectant', 0.6], ['sterile_bandage', 0.8], ['rag_dirty', 3], ['morphine', 0.3], ['splint', 0.5], ['water_bottle', 0.6]],
  },
  floor_camp: {
    empty: 0.45, rolls: [1, 1], dur: [0.2, 0.8], fresh: [0.5, 3], liquid: [0, 0.6], dirty: 0.4,
    entries: [['tin_can', 3], ['beer', 1], ['glass_bottle', 2], ['stick', 3, 1, 3], ['log', 1], ['matches', 1], ['lighter', 0.5], ['rope', 0.8], ['@canned', 1], ['jerky', 0.6], ['water_bottle', 0.6], ['flashlight', 0.4], ['pocket_knife', 0.3], ['rag', 1], ['tarp', 0.3], ['newspaper', 1], ['feather', 1, 1, 3], ['berries', 1, 2, 5]],
  },
};

LOOT_TABLES.zombie_civilian_f = LOOT_TABLES.zombie_civilian;

export const LOOT_TABLE_NAMES = Object.keys(LOOT_TABLES);

/** Loot table for a killed zombie by its outfit (entities ZOMBIE_OUTFITS). */
export function zombieLootTable(outfit) {
  const t = 'zombie_' + (outfit || 'civilian');
  return LOOT_TABLES[t] ? t : 'zombie_civilian';
}

// ---------------------------------------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------------------------------------
const RARITY_BONUS = { common: 0, uncommon: 0.03, rare: 0.07, epic: 0.1 };
const warned = new Set();

function rangeOf(rng, r, def0, def1) {
  const a = r ? r[0] : def0, b = r ? r[1] : def1;
  return a + (b - a) * rng.next();
}

function entryWeight(e, scav) {
  const id = e[0];
  if (id[0] === '@') return e[1];
  const def = getItemDef(id);
  return e[1] * (1 + scav * (RARITY_BONUS[def.rarity] || 0));
}

function pickEntry(rng, entries, scav) {
  return rng.weighted(entries.map((e) => [e, entryWeight(e, scav)]));
}

/** Create stacks for one entry roll (may produce several stacks for non-stackable counts). */
function makeStacks(rng, id, count, opts, table, ctx, out) {
  const def = getItemDef(id);
  if (def.id === 'unknown') {
    if (!warned.has(id)) { warned.add(id); console.warn('[loot] unknown item id', id); }
    return;
  }
  const max = def.stack || 1;
  let left = count;
  while (left > 0) {
    const n = Math.min(left, max);
    left -= n;
    const o = { count: n };
    if (def.durability) o.dur = rangeOf(rng, opts.dur || table.dur, 0.35, 0.95);
    if (def.firearm) {
      const r = opts.ammo || table.ammo;
      const frac = r ? rangeOf(rng, r, 0, 1) : (rng.chance(0.45) ? 0 : rangeOf(rng, null, 0.15, 1));
      o.ammo = Math.round(frac * def.firearm.magSize);
      o.ammoType = opts.ammoType || (def.firearm.ammo.length > 1 && rng.chance(0.2) ? def.firearm.ammo[1] : def.firearm.ammo[0]);
    }
    if (def.liquidContainer) {
      const cap = def.liquidContainer.capacity;
      // containers that normally hold something (water bottle, gas can) come partly filled; empty pots stay empty
      const lr = opts.liquid || table.liquid;
      const frac = def.data?.liquid ? rangeOf(rng, lr, 0.25, 1) : lr && def.id !== 'pot' ? rangeOf(rng, lr, 0, 1) * 0.5 : 0;
      o.uses = Math.round(frac * cap);
      const baseLiquid = def.data?.liquid || (o.uses > 0 ? 'water' : null);
      const dirty = opts.dirty ?? table.dirty ?? 0;
      o.data = { liquid: baseLiquid === 'water' && rng.chance(dirty) ? 'dirty_water' : baseLiquid };
    } else if (def.uses) {
      const consumable = !!(def.food || def.drink);
      const dflt = def.id === 'batteries' || def.light || def.radio ? [0.05, 1] : consumable ? [0.5, 1] : [0.2, 1];
      o.uses = Math.max(1, Math.round(rangeOf(rng, opts.uses || table.uses || dflt) * def.uses));
    }
    const spoils = def.food?.spoils || def.drink?.spoils;
    if (spoils) {
      const f = rangeOf(rng, opts.fresh || table.fresh, 0, 1.25);
      o.age = Math.round(ctx.nowHours - f * spoils);
    }
    if (opts.data) o.data = { ...(o.data || {}), ...opts.data };
    out.push(createItem(id, o));
  }
}

function rollEntry(rng, e, table, ctx, out, depth = 0) {
  const [id, , min = 1, max = min, opts = {}] = e;
  if (id[0] === '@') {
    const group = LOOT_GROUPS[id.slice(1)];
    if (!group || depth > 3) return;
    const n = rng.int(min, max);
    for (let i = 0; i < n; i++) rollEntry(rng, pickEntry(rng, group, ctx.scav), table, ctx, out, depth + 1);
    return;
  }
  let count = rng.int(min, max);
  const def = getItemDef(id);
  // high scavenging occasionally finds a bit more of stackable stuff
  if ((def.stack || 1) > 1 && max > 1 && ctx.scav > 0 && rng.chance(ctx.scav * 0.03)) count = Math.ceil(count * 1.25);
  makeStacks(rng, id, count, opts, table, ctx, out);
}

/** Merge stackable results so a container doesn't show three separate stacks of 9mm. */
function mergeStacks(stacks) {
  const out = [];
  for (const s of stacks) {
    const max = getItemDef(s.id).stack || 1;
    for (const o of out) {
      if (s.count <= 0) break;
      if (canStack(o, s) && o.count < max) {
        const mv = Math.min(max - o.count, s.count);
        o.count += mv; s.count -= mv;
      }
    }
    if (s.count > 0) out.push(s);
  }
  return out;
}

/**
 * Roll a loot table.
 * @param {string} tableName canonical table name (see LOOT_TABLE_NAMES)
 * @param {object} rng makeRng() instance
 * @param {{scavenging?:number, day?:number, size?:number, nowHours?:number}} opts
 * @returns {object[]} item stacks (never more than `size` when given)
 */
export function generateLoot(tableName, rng, { scavenging = 0, day = 1, size, nowHours } = {}) {
  const table = LOOT_TABLES[tableName];
  if (!table) {
    if (!warned.has(tableName)) { warned.add(tableName); console.warn('[loot] unknown loot table', tableName); }
    return [];
  }
  const scav = Math.max(0, Math.min(10, scavenging || 0));
  const ctx = { scav, nowHours: nowHours ?? (Math.max(1, day) - 1) * 24 + 8 };
  let empty = (table.empty || 0) * (1 - scav * 0.035);
  if (table.looted) empty += Math.min(0.15, Math.max(0, day - 1) * 0.01);
  if (rng.chance(Math.min(0.97, empty))) return [];
  const out = [];
  if (table.always) for (const [id, min = 1, max = min, o = {}] of table.always) makeStacks(rng, id, rng.int(min, max), o, table, ctx, out);
  let rolls = rng.int(table.rolls?.[0] ?? 1, table.rolls?.[1] ?? 1);
  if (scav > 0 && rng.chance(scav * 0.04)) rolls++;
  for (let i = 0; i < rolls && table.entries.length; i++) rollEntry(rng, pickEntry(rng, table.entries, scav), table, ctx, out);
  let res = mergeStacks(out);
  if (size != null && res.length > size) res = res.slice(0, Math.max(0, size));
  return res;
}

/** Every item id referenced by loot tables / groups (for validation). */
export function lootItemIds() {
  const ids = new Set();
  const visit = (entries) => { for (const e of entries) if (e[0][0] !== '@') ids.add(e[0]); };
  for (const g of Object.values(LOOT_GROUPS)) visit(g);
  for (const t of Object.values(LOOT_TABLES)) { visit(t.entries); if (t.always) for (const a of t.always) ids.add(a[0]); }
  return [...ids];
}

/** Every '@group' referenced (for validation). */
export function lootGroupRefs() {
  const refs = new Set();
  const visit = (entries) => { for (const e of entries) if (e[0][0] === '@') refs.add(e[0].slice(1)); };
  for (const g of Object.values(LOOT_GROUPS)) visit(g);
  for (const t of Object.values(LOOT_TABLES)) visit(t.entries);
  return [...refs];
}
