// ITEM DATABASE — every item in Dead County.
//
// Item stack (instance) shape — a plain JSON-serialisable object:
//   { id, count, dur?, ammo?, ammoType?, uses?, age?, contents?, data?, mode? }
//   dur      current durability (weapons/tools/clothing), max = def.durability
//   ammo     rounds currently loaded (firearms)
//   ammoType ammo item id currently loaded (e.g. 'ammo_12g_slug')
//   uses     remaining uses/portions (pills, battery charge 0..100, lighter fuel, tape...).
//            For liquid containers: units of liquid inside (1 unit = 250 ml), 0..liquidContainer.capacity
//   age      game-hour timestamp when created (spoilage). freshness via itemFreshness()
//   contents Array<stack|null> for items with def.capacity (clothing pockets, backpacks)
//   data     misc: {noteId, keyId, liquid:'water'|'dirty_water'|'gasoline'|null, label, ...}
//   mode     firearm fire mode ('semi'|'auto'|'pump'|'bolt')
//
// Def schema: see docs/ARCHITECTURE.md ("Items"). Extra fields added by this module (all optional):
//   useLabel            verb for the primary use action ('Eat', 'Drink', 'Read', 'Smoke', 'Inject', 'Apply', 'Place'...)
//   burnTime            game minutes of campfire fuel this item gives (items tagged 'fuel')
//   place               block name placed in the world when the item is used (campfire_kit -> 'campfire')
//   purify              units of dirty water one item (or one use) purifies (purification tablets, bleach)
//   zoomFov             camera fov while looking through (binoculars)
//   round               ammo defs: { caliber, pellets?, damage?, spreadMult?, range? } — per-round overrides of the
//                       firearm stats (e.g. a 12g slug fires 1 pellet with high damage)
//   firearm.jam         base jam chance per shot at 100% condition (scale it up as the gun wears)
//   firearm.recover     chance (0..1) that a fired projectile (arrow / bolt) can be picked up again
//   attachment.noiseMult  firearm noise multiplier while fitted (attachments with `uses` wear out per shot)
//   medical.*           extra effect keys: dirty (bandage causes infection risk), extract (removes glass / bullets),
//                       burn (treats burns), panic (− reduces), sickness (− reduces), energy, stamina, sleep (helps
//                       falling asleep), duration (game hours the drug effect lasts)
//   drink.spoils / drink.leaves / drink.hunger / drink.panic   like the matching food fields
//   food.useLabel       e.g. cigarettes are 'food' with useLabel 'Smoke' (hunger 0, panic −)
//   book.xp             instant XP granted when finished; book.boredom / book.panic for leisure reading
//   light.omni          lantern / torch: light all around instead of a cone; light.fire: burning (no battery)
//   throwable.duration  seconds the effect lasts (fire, smoke, noise, flare light); throwable.burn fire dps
//   clothing.noise      additive movement-noise modifier (−0.15 quiet .. +0.3 loud); clothing.speed multiplier
//
// Liquids: `LIQUIDS[id]` gives the per-unit effect when drunk and the weight per unit.

export const LIQUIDS = {
  water: { name: 'Water', thirst: 12, sickness: 0, unitWeight: 0.25, drinkable: true },
  dirty_water: { name: 'Dirty Water', thirst: 10, sickness: 18, unitWeight: 0.25, drinkable: true },
  gasoline: { name: 'Gasoline', thirst: 0, sickness: 60, unitWeight: 0.19, drinkable: false, fuel: true },
};

export const ITEM_TAGS = {
  can_opener: 'Opens canned food',
  blade: 'Cuts / rips clothing into rags, opens cans',
  chop: 'Chops wood (trees, doors, furniture)',
  blunt: 'Smashes (glass, light structures)',
  heavy: 'Breaks heavy structures (walls, brick)',
  pry: 'Pries doors, windows and crates open',
  dig: 'Digs dirt, sand and gravel',
  hammer: 'Barricades windows and doors',
  saw: 'Saws logs into planks',
  fire_starter: 'Lights fires',
  lockpick: 'Picks locks',
  fabric: 'Clothing that can be ripped into rags',
  fuel: 'Burnable / fuel',
  cooking_pot: 'Boils water and cooks',
  repair_blade: 'Repairs bladed weapons',
  repair_gun: 'Repairs firearms',
  repair_cloth: 'Repairs clothing',
  battery: 'Power for flashlights and radios',
  watch: 'Shows the time',
  map: 'Reveals the town map',
  compass: 'Shows the heading',
  binoculars: 'Zoom view',
  radio: 'Receives emergency broadcasts',
  // crafting-only tags (used by recipes in crafting.js)
  screwdriver: 'Unscrews electronics',
  can: 'Empty can (crafting)',
  bandage: 'Can be used to bandage a wound',
  disinfectant: 'Disinfects wounds',
  purifier: 'Purifies dirty water',
  wood: 'Wooden weapon (repairable with glue)',
  electronics_source: 'Can be salvaged for electronics',
  ammo: 'Ammunition',
};

export const ITEM_CATEGORIES = {
  weapon: 'Melee Weapon', firearm: 'Firearm', ammo: 'Ammunition', attachment: 'Attachment', throwable: 'Throwable',
  medical: 'Medical', food: 'Food', drink: 'Drink', clothing: 'Clothing', backpack: 'Bag', tool: 'Tool',
  utility: 'Utility', material: 'Material', book: 'Literature', misc: 'Miscellaneous', key: 'Key',
};

export const RARITY_COLORS = { common: '#c8c8c8', uncommon: '#6fcf5a', rare: '#4f9cff', epic: '#c46bff' };

// ---------------------------------------------------------------------------------------------------------
// Stat helpers (fill every schema field so game logic can read them without guards)
// ---------------------------------------------------------------------------------------------------------
const MELEE = (damage, speed, range, o = {}) => ({
  damage, speed, range, knockback: 0.5, stamina: 5, type: 'blunt', noise: 4, crit: 0.08, headMult: 3,
  sweep: 0, knockdown: 0.1, durabilityLoss: 1, twoHanded: false, ...o,
});
const GUN = (o) => ({
  ammo: [], magSize: 1, damage: 30, fireRate: 3, modes: ['semi'], pellets: 1, spread: 0.04, adsSpread: 0.008,
  recoil: 3, range: 60, reload: 'mag', reloadTime: 2, shellTime: 0, noise: 60, aimFov: 60, scope: false,
  suppressed: false, durabilityLoss: 0.1, sound: 'gun_pistol', jam: 0.002, recover: 0, ...o,
});
const FOOD = (hunger, o = {}) => ({
  hunger, thirst: 0, health: 0, sickness: 0, panic: 0, energy: 0, spoils: 0, needsOpener: false, raw: false,
  cookTo: null, leaves: null, eatTime: 4, ...o,
});
const DRINK = (thirst, o = {}) => ({ thirst, hunger: 0, sickness: 0, alcohol: 0, energy: 0, panic: 0, perUse: false, spoils: 0, leaves: null, ...o });
const MED = (o) => ({
  stopBleed: 0, heal: 0, disinfect: 0, antibiotic: 0, antiviral: 0, painkiller: 0, splint: 0, suture: 0,
  sterile: false, time: 3, ...o,
});
const CLOTH = (slot, insulation, water, bite, scratch, o = {}) => ({ slot, insulation, water, bite, scratch, speed: 1, noise: 0, ...o });

const LIST = [];
const add = (d) => { LIST.push(d); return d; };

// ---------------------------------------------------------------------------------------------------------
// MATERIALS
// ---------------------------------------------------------------------------------------------------------
add({ id: 'plank', name: 'Wooden Plank', category: 'material', weight: 1.0, stack: 10, tags: ['fuel'], burnTime: 40, icon: { shape: 'plank' }, desc: 'A length of pine two-by-four. Barricades, splints, firewood.' });
add({ id: 'log', name: 'Log', category: 'material', weight: 3.5, stack: 4, tags: ['fuel'], burnTime: 120, icon: { shape: 'log' }, desc: 'A heavy section of trunk. Saw it into planks or burn it slow.' });
add({ id: 'stick', name: 'Stick', category: 'material', weight: 0.2, stack: 20, tags: ['fuel'], burnTime: 10, icon: { shape: 'stick' }, desc: 'A sturdy branch. Kindling, arrow shafts, a crude spear.' });
add({ id: 'nails', name: 'Nails', category: 'material', weight: 0.01, stack: 60, icon: { shape: 'nails' }, desc: 'Three-inch common nails. A hammer and these keep the dead outside.' });
add({ id: 'rag', name: 'Rag', category: 'material', weight: 0.05, stack: 10, tags: ['bandage', 'fuel'], burnTime: 4, icon: { shape: 'rag', color: '#d9d2c0' }, useLabel: 'Bandage', medical: MED({ stopBleed: 0.5, heal: 1, time: 4 }), desc: 'A strip of clean-ish cloth. Better than bleeding out.' });
add({ id: 'rag_dirty', name: 'Dirty Rag', category: 'material', weight: 0.05, stack: 10, tags: ['bandage', 'fuel'], burnTime: 4, icon: { shape: 'rag', color: '#8a7a5c', color2: '#6e2a22' }, useLabel: 'Bandage', medical: MED({ stopBleed: 0.4, time: 4, dirty: true }), desc: 'Bloody and filthy. Wash it before it goes anywhere near a wound.' });
add({ id: 'brick', name: 'Brick', category: 'material', weight: 2.2, stack: 8, icon: { shape: 'brick' }, desc: 'Red clay brick. Throw it to make noise, or just hold onto it.' });
add({ id: 'scrap_metal', name: 'Scrap Metal', category: 'material', weight: 0.4, stack: 10, icon: { shape: 'scrap' }, desc: 'Twisted sheet steel and bolts. Arrowheads, nails, repairs.' });
add({ id: 'sheet_metal', name: 'Sheet Metal', category: 'material', weight: 2.0, stack: 4, icon: { shape: 'sheet_metal' }, desc: 'A dented galvanised panel. Strap it on and pray.' });
add({ id: 'duct_tape', name: 'Duct Tape', category: 'material', weight: 0.25, stack: 4, uses: 10, icon: { shape: 'tape' }, desc: 'Holds the world together. Mostly.' });
add({ id: 'glue', name: 'Wood Glue', category: 'material', weight: 0.15, stack: 4, uses: 5, icon: { shape: 'glue' }, desc: 'Yellow carpenter\'s glue. Fixes cracked handles.' });
add({ id: 'thread', name: 'Thread', category: 'material', weight: 0.05, stack: 4, uses: 10, icon: { shape: 'spool', color: '#3d5fa8' }, desc: 'A spool of heavy cotton thread.' });
add({ id: 'wire', name: 'Copper Wire', category: 'material', weight: 0.3, stack: 5, icon: { shape: 'coil', color: '#c87533' }, desc: 'A coil of insulated copper wire. Tripwires, fuses, repairs.' });
add({ id: 'rope', name: 'Rope', category: 'material', weight: 0.9, stack: 5, icon: { shape: 'rope' }, desc: 'Fifty feet of nylon rope. Endless uses.' });
add({ id: 'gunpowder', name: 'Gunpowder', category: 'material', weight: 0.02, stack: 30, icon: { shape: 'powder' }, desc: 'A measure of smokeless powder pulled from cartridges. Keep it dry, keep it away from fire.' });
add({ id: 'metal_pipe', name: 'Metal Pipe', category: 'material', weight: 1.5, stack: 4, model: 'pipe', icon: { shape: 'pipe' }, desc: 'A short length of threaded steel pipe. Plumbing, or something louder.' });
add({ id: 'alarm_clock', name: 'Alarm Clock', category: 'material', weight: 0.4, stack: 2, tags: ['electronics_source'], icon: { shape: 'alarm_clock' }, desc: 'Twin-bell wind-up alarm. Loud enough to wake the dead. That\'s the problem.' });
add({ id: 'batteries', name: 'Batteries', category: 'material', weight: 0.05, stack: 4, uses: 100, tags: ['battery'], icon: { shape: 'batteries' }, desc: 'A pair of AA cells. Charge shown as a percentage.' });
add({ id: 'tin_can', name: 'Empty Tin Can', category: 'material', weight: 0.05, stack: 10, tags: ['can'], icon: { shape: 'can_open' }, desc: 'Licked clean. String a few together and nothing sneaks up on you.' });
add({ id: 'soda_can', name: 'Empty Soda Can', category: 'material', weight: 0.02, stack: 10, tags: ['can'], icon: { shape: 'soda_crushed' }, desc: 'Crushed aluminium. Rattles nicely.' });
add({ id: 'glass_bottle', name: 'Empty Glass Bottle', category: 'material', weight: 0.35, stack: 4, model: 'bottle', icon: { shape: 'bottle_glass', color: '#3f8a4a' }, desc: 'Thick green glass. Fill it with gasoline and add a rag.' });
add({ id: 'plastic_bottle', name: 'Empty Plastic Bottle', category: 'material', weight: 0.03, stack: 6, icon: { shape: 'bottle_plastic', color: '#bfe0ee', color2: '#2f6fb8' }, desc: 'A crinkly 1 L bottle. Tape it to a muzzle and it eats some of the bang.' });
add({ id: 'wheat', name: 'Wheat', category: 'material', weight: 0.1, stack: 20, tags: ['fuel'], burnTime: 3, icon: { shape: 'wheat' }, desc: 'A bundle of ripe wheat stalks. Not much use without a mill.' });
add({ id: 'corn', name: 'Ear of Corn', category: 'food', weight: 0.3, stack: 10, icon: { shape: 'corn' }, food: FOOD(9, { thirst: 2, spoils: 336, cookTo: 'roasted_corn', eatTime: 5 }), desc: 'Field corn from the Miller farm. Better roasted.' });
add({ id: 'pumpkin', name: 'Pumpkin', category: 'food', weight: 4.0, stack: 2, uses: 4, icon: { shape: 'pumpkin' }, food: FOOD(7, { thirst: 2, spoils: 720, eatTime: 6 }), desc: 'A fat October pumpkin. Nobody\'s carving jack-o\'-lanterns this year.' });
add({ id: 'berries', name: 'Wild Berries', category: 'food', weight: 0.1, stack: 20, icon: { shape: 'berries' }, food: FOOD(4, { thirst: 2, spoils: 72, eatTime: 2 }), desc: 'A handful of blackberries from the hedgerow. Late in the season.' });
add({ id: 'electronics', name: 'Electronic Parts', category: 'material', weight: 0.15, stack: 10, icon: { shape: 'circuit' }, desc: 'Circuit boards, speakers and a tangle of wiring.' });
add({ id: 'feather', name: 'Feather', category: 'material', weight: 0.005, stack: 30, icon: { shape: 'feather' }, desc: 'A turkey feather. Fletching for arrows.' });
add({ id: 'tarp', name: 'Tarp', category: 'material', weight: 1.2, stack: 2, icon: { shape: 'tarp' }, desc: 'A folded blue plastic tarp. Keeps rain off whatever is under it.' });
add({ id: 'garbage_bag', name: 'Garbage Bag', category: 'material', weight: 0.05, stack: 10, icon: { shape: 'trash_bag' }, desc: 'Heavy-duty black bag. A poor man\'s raincoat or backpack.' });
add({ id: 'zip_ties', name: 'Zip Ties', category: 'material', weight: 0.02, stack: 20, icon: { shape: 'zip_ties' }, desc: 'A bundle of black cable ties.' });
add({ id: 'newspaper', name: 'Newspaper', category: 'material', weight: 0.2, stack: 5, tags: ['fuel'], burnTime: 5, useLabel: 'Read', book: { boredom: -10, panic: 0, hours: 0.25 }, icon: { shape: 'newspaper' }, desc: 'The Millbrook Courier, Oct 2nd: "COUNTY GENERAL OVERWHELMED — GUARD DEPLOYED".' });
add({ id: 'bobby_pins', name: 'Bobby Pins', category: 'material', weight: 0.01, stack: 10, icon: { shape: 'bobby_pins' }, desc: 'Bent the right way they open more than hairdos.' });
add({ id: 'toilet_paper', name: 'Toilet Paper', category: 'material', weight: 0.1, stack: 6, tags: ['fuel'], burnTime: 3, icon: { shape: 'toilet_paper' }, desc: 'The first thing everyone hoarded. Burns quick.' });
add({ id: 'cash', name: 'Cash', category: 'misc', weight: 0.05, stack: 20, tags: ['fuel'], burnTime: 2, icon: { shape: 'cash' }, desc: 'A wad of twenties. Worthless now. Makes decent tinder.' });
add({ id: 'jewelry', name: 'Gold Ring', category: 'misc', weight: 0.01, stack: 10, icon: { shape: 'ring' }, desc: 'Somebody\'s wedding band. It meant something once.' });

// ---------------------------------------------------------------------------------------------------------
// MELEE WEAPONS
// ---------------------------------------------------------------------------------------------------------
add({ id: 'fists', name: 'Fists', category: 'weapon', weight: 0, stack: 1, model: 'fists', icon: { shape: 'fist' }, melee: MELEE(8, 2.2, 2.2, { knockback: 0.6, stamina: 4, noise: 3, crit: 0.02, headMult: 1.5, knockdown: 0.05, durabilityLoss: 0 }), desc: 'Your bare hands. A last resort.' });
add({ id: 'kitchen_knife', name: 'Kitchen Knife', category: 'weapon', weight: 0.25, stack: 1, durability: 60, model: 'knife', tags: ['blade', 'can_opener'], icon: { shape: 'knife' }, melee: MELEE(18, 2.4, 2.2, { type: 'blade', knockback: 0.2, stamina: 3, noise: 2, crit: 0.12, knockdown: 0, durabilityLoss: 1 }), desc: 'An 8-inch chef\'s knife. Quick, quiet, and dulls fast on bone.' });
add({ id: 'pocket_knife', name: 'Pocket Knife', category: 'weapon', weight: 0.12, stack: 1, durability: 50, model: 'knife', tags: ['blade', 'can_opener'], icon: { shape: 'knife_pocket' }, melee: MELEE(12, 2.6, 2.0, { type: 'stab', knockback: 0.1, stamina: 2.5, noise: 1, crit: 0.1, knockdown: 0, durabilityLoss: 1 }), desc: 'A folding lock-blade. Opens cans, cuts rope, stabs eyes.' });
add({ id: 'meat_cleaver', name: 'Meat Cleaver', category: 'weapon', weight: 0.6, stack: 1, durability: 90, model: 'knife', tags: ['blade'], icon: { shape: 'cleaver' }, melee: MELEE(25, 1.7, 2.1, { type: 'blade', knockback: 0.4, stamina: 4.5, noise: 3, crit: 0.12, headMult: 3.2, knockdown: 0.05, durabilityLoss: 0.8 }), desc: 'A butcher\'s square blade. Heavy chops at arm\'s length.' });
add({ id: 'shiv', name: 'Shiv', category: 'weapon', weight: 0.1, stack: 1, durability: 25, model: 'knife', tags: ['blade'], icon: { shape: 'shiv' }, melee: MELEE(13, 2.6, 1.9, { type: 'stab', knockback: 0.1, stamina: 2.5, noise: 1, crit: 0.15, headMult: 3.5, knockdown: 0, durabilityLoss: 1.5 }), desc: 'Sharpened scrap with a taped grip. Prison-yard engineering.' });
add({ id: 'hunting_knife', name: 'Hunting Knife', category: 'weapon', weight: 0.35, stack: 1, durability: 150, model: 'knife_hunting', tags: ['blade', 'can_opener'], icon: { shape: 'knife_hunting' }, melee: MELEE(24, 2.2, 2.3, { type: 'blade', knockback: 0.25, stamina: 3.5, noise: 2, crit: 0.15, headMult: 3.2, knockdown: 0, durabilityLoss: 0.6 }), rarity: 'uncommon', desc: 'Full-tang clip-point with a stag handle. A woodsman\'s best friend.' });
add({ id: 'combat_knife', name: 'Combat Knife', category: 'weapon', weight: 0.3, stack: 1, durability: 200, model: 'knife_hunting', tags: ['blade', 'can_opener'], icon: { shape: 'knife_combat' }, melee: MELEE(26, 2.3, 2.3, { type: 'blade', knockback: 0.25, stamina: 3.5, noise: 2, crit: 0.18, headMult: 3.4, knockdown: 0, durabilityLoss: 0.5 }), rarity: 'rare', desc: 'Parkerised military fighting knife. Made for exactly this.' });
add({ id: 'machete', name: 'Machete', category: 'weapon', weight: 0.7, stack: 1, durability: 180, model: 'machete', tags: ['blade', 'chop'], icon: { shape: 'machete' }, melee: MELEE(32, 1.6, 2.6, { type: 'blade', knockback: 0.5, stamina: 6, noise: 3, crit: 0.15, headMult: 3, sweep: 0.3, knockdown: 0.1, durabilityLoss: 0.8 }), rarity: 'uncommon', desc: 'An 18-inch brush blade. Clears kudzu and necks alike.' });
add({ id: 'katana', name: 'Katana', category: 'weapon', weight: 1.2, stack: 1, durability: 300, model: 'katana', tags: ['blade'], icon: { shape: 'katana' }, melee: MELEE(40, 1.8, 2.8, { type: 'blade', knockback: 0.6, stamina: 6, noise: 3, crit: 0.25, headMult: 3.5, sweep: 0.4, knockdown: 0.15, durabilityLoss: 0.4, twoHanded: true }), rarity: 'epic', desc: 'Some collector\'s pride, hand-forged and razor sharp. You are that guy now.' });
add({ id: 'baseball_bat', name: 'Baseball Bat', category: 'weapon', weight: 1.0, stack: 1, durability: 120, model: 'bat', tags: ['blunt', 'wood'], icon: { shape: 'bat' }, melee: MELEE(28, 1.3, 2.7, { knockback: 1.2, stamina: 7, noise: 6, crit: 0.08, knockdown: 0.25, durabilityLoss: 1, twoHanded: true }), desc: 'Louisville-style ash bat. America\'s pastime, reimagined.' });
add({ id: 'aluminum_bat', name: 'Aluminum Bat', category: 'weapon', weight: 0.9, stack: 1, durability: 220, model: 'bat', tags: ['blunt'], icon: { shape: 'bat', color: '#b7bec7', color2: '#2b2b33' }, melee: MELEE(26, 1.4, 2.7, { knockback: 1.1, stamina: 6.5, noise: 7, crit: 0.08, knockdown: 0.22, durabilityLoss: 0.6, twoHanded: true }), desc: 'A dented Little League bat. Rings like a bell on every skull.' });
add({ id: 'nail_bat', name: 'Nailed Bat', category: 'weapon', weight: 1.2, stack: 1, durability: 100, model: 'bat_nail', tags: ['blunt', 'wood'], icon: { shape: 'bat_nail' }, melee: MELEE(36, 1.25, 2.7, { knockback: 1.2, stamina: 7.5, noise: 6, crit: 0.12, headMult: 3.2, knockdown: 0.25, durabilityLoss: 1, twoHanded: true }), rarity: 'uncommon', desc: 'A baseball bat studded with nails. Crude. Effective.' });
add({ id: 'crowbar', name: 'Crowbar', category: 'weapon', weight: 1.8, stack: 1, durability: 400, model: 'crowbar', tags: ['pry', 'blunt'], icon: { shape: 'crowbar' }, melee: MELEE(26, 1.4, 2.5, { knockback: 0.9, stamina: 6, noise: 5, crit: 0.1, knockdown: 0.15, durabilityLoss: 0.3 }), desc: 'Forged steel wrecking bar. Opens doors, crates and heads.' });
add({ id: 'tire_iron', name: 'Tire Iron', category: 'weapon', weight: 1.2, stack: 1, durability: 350, model: 'crowbar', tags: ['pry', 'blunt'], icon: { shape: 'tire_iron' }, melee: MELEE(22, 1.5, 2.3, { knockback: 0.8, stamina: 5, noise: 5, crit: 0.08, knockdown: 0.12, durabilityLoss: 0.3 }), desc: 'Lug wrench from a car trunk. Pries, bashes, changes tires.' });
add({ id: 'hammer', name: 'Claw Hammer', category: 'weapon', weight: 0.7, stack: 1, durability: 250, model: 'hammer', tags: ['hammer', 'blunt'], icon: { shape: 'hammer' }, melee: MELEE(20, 1.8, 2.2, { knockback: 0.6, stamina: 4.5, noise: 4, crit: 0.1, headMult: 3.2, knockdown: 0.08, durabilityLoss: 0.4 }), desc: '16 oz claw hammer. Barricades go up, skulls cave in.' });
add({ id: 'fire_axe', name: 'Fire Axe', category: 'weapon', weight: 2.8, stack: 1, durability: 250, model: 'axe_fire', tags: ['chop', 'heavy'], icon: { shape: 'axe_fire' }, melee: MELEE(45, 0.85, 2.8, { type: 'heavy', knockback: 1.4, stamina: 12, noise: 7, crit: 0.15, headMult: 3.5, sweep: 0.2, knockdown: 0.4, durabilityLoss: 0.7, twoHanded: true }), rarity: 'uncommon', desc: 'Pick-head axe from a fire station. Splits doors and the dead.' });
add({ id: 'wood_axe', name: 'Wood Axe', category: 'weapon', weight: 2.3, stack: 1, durability: 220, model: 'axe_fire', tags: ['chop', 'heavy', 'wood'], icon: { shape: 'axe_wood' }, melee: MELEE(40, 0.9, 2.7, { type: 'heavy', knockback: 1.3, stamina: 11, noise: 7, crit: 0.13, headMult: 3.4, sweep: 0.2, knockdown: 0.35, durabilityLoss: 0.7, twoHanded: true }), desc: 'A splitting axe with a hickory handle. Firewood, then everything else.' });
add({ id: 'hatchet', name: 'Hatchet', category: 'weapon', weight: 0.9, stack: 1, durability: 160, model: 'hatchet', tags: ['chop', 'blade'], icon: { shape: 'hatchet' }, melee: MELEE(28, 1.5, 2.3, { type: 'blade', knockback: 0.5, stamina: 5.5, noise: 4, crit: 0.12, headMult: 3.2, knockdown: 0.1, durabilityLoss: 0.6 }), desc: 'A camp hatchet. One-handed, chops kindling and craniums.' });
add({ id: 'golf_club', name: 'Golf Club', category: 'weapon', weight: 0.4, stack: 1, durability: 70, model: 'golf_club', tags: ['blunt'], icon: { shape: 'golf_club' }, melee: MELEE(22, 1.5, 2.8, { knockback: 0.9, stamina: 5, noise: 5, crit: 0.1, knockdown: 0.15, durabilityLoss: 1.5 }), desc: 'A 7-iron from the country club. Bends after a few good swings.' });
add({ id: 'hockey_stick', name: 'Hockey Stick', category: 'weapon', weight: 0.6, stack: 1, durability: 60, model: 'golf_club', tags: ['blunt', 'wood'], icon: { shape: 'hockey_stick' }, melee: MELEE(18, 1.5, 2.9, { knockback: 1.0, stamina: 5, noise: 4, crit: 0.06, knockdown: 0.2, durabilityLoss: 1.5, twoHanded: true }), desc: 'Long reach, light hits. Keeps them at a distance.' });
add({ id: 'frying_pan', name: 'Frying Pan', category: 'weapon', weight: 1.5, stack: 1, durability: 500, model: 'pan', tags: ['blunt', 'cookware'], icon: { shape: 'pan' }, melee: MELEE(22, 1.3, 2.1, { knockback: 1.1, stamina: 6, noise: 9, crit: 0.08, knockdown: 0.25, durabilityLoss: 0.2 }), desc: 'Cast iron skillet. Bonk. Also cooks eggs, if you find any.' });
add({ id: 'lead_pipe', name: 'Lead Pipe', category: 'weapon', weight: 1.6, stack: 1, durability: 400, model: 'pipe', tags: ['blunt'], icon: { shape: 'lead_pipe' }, melee: MELEE(24, 1.4, 2.5, { knockback: 1.0, stamina: 6, noise: 5, crit: 0.08, knockdown: 0.2, durabilityLoss: 0.25 }), desc: 'A length of pipe with a taped grip. Classic.' });
add({ id: 'sledgehammer', name: 'Sledgehammer', category: 'weapon', weight: 5.0, stack: 1, durability: 400, model: 'sledgehammer', tags: ['heavy', 'blunt'], icon: { shape: 'sledgehammer' }, melee: MELEE(60, 0.55, 2.7, { type: 'heavy', knockback: 2, stamina: 18, noise: 10, crit: 0.1, headMult: 3.5, sweep: 0.3, knockdown: 0.85, durabilityLoss: 0.4, twoHanded: true }), rarity: 'uncommon', desc: '10 lb demolition hammer. Knocks down walls and whatever stands behind them.' });
add({ id: 'pickaxe', name: 'Pickaxe', category: 'weapon', weight: 3.0, stack: 1, durability: 300, model: 'generic', tags: ['heavy', 'dig'], icon: { shape: 'pickaxe' }, melee: MELEE(42, 0.75, 2.6, { type: 'heavy', knockback: 1.2, stamina: 14, noise: 8, crit: 0.18, headMult: 3.5, knockdown: 0.35, durabilityLoss: 0.5, twoHanded: true }), rarity: 'uncommon', desc: 'A miner\'s pick. Coal country never forgot how to swing one.' });
add({ id: 'shovel', name: 'Shovel', category: 'weapon', weight: 2.0, stack: 1, durability: 200, model: 'shovel', tags: ['dig', 'blunt'], icon: { shape: 'shovel' }, melee: MELEE(24, 1.1, 2.8, { knockback: 1.3, stamina: 8, noise: 6, crit: 0.08, knockdown: 0.3, durabilityLoss: 0.6, twoHanded: true }), desc: 'Round-point spade. Digs graves. Fills them, too.' });
add({ id: 'spear', name: 'Knife Spear', category: 'weapon', weight: 1.3, stack: 1, durability: 60, model: 'spear', tags: [], icon: { shape: 'spear' }, melee: MELEE(30, 1.3, 3.4, { type: 'stab', knockback: 0.5, stamina: 6, noise: 2, crit: 0.15, headMult: 3.2, knockdown: 0.05, durabilityLoss: 1.5, twoHanded: true }), desc: 'A kitchen knife lashed to a pole. Reach is life.' });
add({ id: 'spear_crude', name: 'Sharpened Stick', category: 'weapon', weight: 0.7, stack: 1, durability: 30, model: 'spear', tags: ['wood'], icon: { shape: 'spear_crude' }, melee: MELEE(18, 1.4, 3.2, { type: 'stab', knockback: 0.4, stamina: 5, noise: 2, crit: 0.1, headMult: 3, knockdown: 0.05, durabilityLoss: 2, twoHanded: true }), desc: 'A fire-hardened point on a long branch. Better than nothing.' });
add({ id: 'police_baton', name: 'Police Baton', category: 'weapon', weight: 0.6, stack: 1, durability: 400, model: 'baton', tags: ['blunt'], icon: { shape: 'baton' }, melee: MELEE(18, 2.0, 2.3, { knockback: 0.9, stamina: 4, noise: 4, crit: 0.06, knockdown: 0.2, durabilityLoss: 0.2 }), desc: 'Side-handle nightstick. Built to subdue. They don\'t stay subdued.' });
add({ id: 'wrench', name: 'Pipe Wrench', category: 'weapon', weight: 1.1, stack: 1, durability: 400, model: 'wrench', tags: ['blunt', 'wrench'], icon: { shape: 'wrench' }, melee: MELEE(22, 1.5, 2.2, { knockback: 0.8, stamina: 5, noise: 5, crit: 0.08, knockdown: 0.15, durabilityLoss: 0.25 }), desc: '14-inch steel pipe wrench. Heavy business end.' });
add({ id: 'pitchfork', name: 'Pitchfork', category: 'weapon', weight: 1.8, stack: 1, durability: 120, model: 'pitchfork', tags: [], icon: { shape: 'pitchfork' }, melee: MELEE(26, 1.0, 3.2, { type: 'stab', knockback: 1.2, stamina: 8, noise: 3, crit: 0.1, headMult: 3, sweep: 0.1, knockdown: 0.3, durabilityLoss: 0.8, twoHanded: true }), desc: 'Three tines of farm steel. Pins them at arm\'s length.' });
add({ id: 'wooden_club', name: 'Wooden Club', category: 'weapon', weight: 1.4, stack: 1, durability: 50, model: 'club', tags: ['blunt', 'wood'], icon: { shape: 'club' }, melee: MELEE(18, 1.4, 2.4, { knockback: 0.9, stamina: 6, noise: 5, crit: 0.05, knockdown: 0.15, durabilityLoss: 1.5 }), desc: 'A whittled chunk of hardwood. Caveman tech, still works.' });
add({ id: 'rolling_pin', name: 'Rolling Pin', category: 'weapon', weight: 0.6, stack: 1, durability: 60, model: 'club', tags: ['blunt', 'wood'], icon: { shape: 'rolling_pin' }, melee: MELEE(14, 1.8, 2.1, { knockback: 0.6, stamina: 4, noise: 4, crit: 0.05, knockdown: 0.08, durabilityLoss: 1.2 }), desc: 'Grandma\'s maple rolling pin. Not much reach, but it\'s something.' });
add({ id: 'screwdriver', name: 'Screwdriver', category: 'weapon', weight: 0.15, stack: 1, durability: 80, model: 'screwdriver', tags: ['screwdriver'], icon: { shape: 'screwdriver' }, melee: MELEE(14, 2.5, 2.0, { type: 'stab', knockback: 0.1, stamina: 3, noise: 1, crit: 0.2, headMult: 3.5, knockdown: 0, durabilityLoss: 1 }), desc: 'A flathead screwdriver. Takes apart electronics. Goes through eye sockets.' });

// ---------------------------------------------------------------------------------------------------------
// FIREARMS
// ---------------------------------------------------------------------------------------------------------
const PISTOL_SUP = ['pistol_m9', 'pistol_glock', 'pistol_1911', 'smg_mp5', 'rifle_22'];
add({ id: 'pistol_m9', name: 'M9 Pistol', category: 'firearm', weight: 0.95, stack: 1, durability: 100, model: 'pistol', rarity: 'uncommon', icon: { shape: 'pistol_m9' },
  firearm: GUN({ ammo: ['ammo_9mm'], magSize: 15, damage: 34, fireRate: 4, spread: 0.035, adsSpread: 0.008, recoil: 3.5, range: 60, reloadTime: 1.9, noise: 60, aimFov: 62, durabilityLoss: 0.08, sound: 'gun_pistol', jam: 0.002 }),
  desc: 'Beretta-pattern service pistol. 15 rounds of 9mm, standard issue at the Guard base.' });
add({ id: 'pistol_glock', name: 'G17 Pistol', category: 'firearm', weight: 0.7, stack: 1, durability: 100, model: 'pistol', rarity: 'uncommon', icon: { shape: 'pistol' },
  firearm: GUN({ ammo: ['ammo_9mm'], magSize: 17, damage: 32, fireRate: 4.5, spread: 0.034, adsSpread: 0.008, recoil: 3.2, range: 60, reloadTime: 1.8, noise: 60, aimFov: 62, durabilityLoss: 0.06, sound: 'gun_pistol', jam: 0.001 }),
  desc: 'Polymer-frame 9mm. Millbrook PD\'s duty weapon. Ugly, reliable.' });
add({ id: 'pistol_1911', name: 'M1911 Pistol', category: 'firearm', weight: 1.1, stack: 1, durability: 100, model: 'pistol_1911', rarity: 'rare', icon: { shape: 'pistol_1911' },
  firearm: GUN({ ammo: ['ammo_45'], magSize: 7, damage: 42, fireRate: 3.2, spread: 0.035, adsSpread: 0.007, recoil: 4.8, range: 60, reloadTime: 2.0, noise: 65, aimFov: 62, durabilityLoss: 0.08, sound: 'gun_pistol', jam: 0.003 }),
  desc: 'Grandpa\'s .45. Seven fat rounds that put things down.' });
add({ id: 'revolver_357', name: '.357 Revolver', category: 'firearm', weight: 1.2, stack: 1, durability: 100, model: 'revolver', rarity: 'uncommon', icon: { shape: 'revolver' },
  firearm: GUN({ ammo: ['ammo_357'], magSize: 6, damage: 60, fireRate: 2.2, spread: 0.04, adsSpread: 0.006, recoil: 7, range: 70, reload: 'single', reloadTime: 0.8, shellTime: 0.55, noise: 75, aimFov: 60, durabilityLoss: 0.07, sound: 'gun_revolver', jam: 0 }),
  desc: 'Six-shot magnum wheel gun. Loud, heavy, never jams.' });
add({ id: 'shotgun_pump', name: 'Pump Shotgun', category: 'firearm', weight: 3.4, stack: 1, durability: 100, model: 'shotgun_pump', rarity: 'uncommon', icon: { shape: 'shotgun_pump' },
  firearm: GUN({ ammo: ['ammo_12g', 'ammo_12g_slug'], magSize: 6, damage: 14, pellets: 8, fireRate: 1.1, modes: ['pump'], spread: 0.11, adsSpread: 0.075, recoil: 9, range: 30, reload: 'shell', reloadTime: 0.6, shellTime: 0.55, noise: 80, aimFov: 60, durabilityLoss: 0.12, sound: 'gun_shotgun', jam: 0.002 }),
  desc: '12-gauge pump. Every farmhouse in the county has one behind the door.' });
add({ id: 'shotgun_tactical', name: 'Tactical Shotgun', category: 'firearm', weight: 3.6, stack: 1, durability: 100, model: 'shotgun_pump', rarity: 'rare', icon: { shape: 'shotgun_tactical' },
  firearm: GUN({ ammo: ['ammo_12g', 'ammo_12g_slug'], magSize: 7, damage: 14, pellets: 8, fireRate: 2.6, modes: ['semi'], spread: 0.1, adsSpread: 0.07, recoil: 8.5, range: 32, reload: 'shell', reloadTime: 0.6, shellTime: 0.5, noise: 82, aimFov: 58, durabilityLoss: 0.12, sound: 'gun_shotgun', jam: 0.004 }),
  desc: 'Semi-automatic police shotgun with a pistol grip. Seven shells as fast as you can pull.' });
add({ id: 'shotgun_double', name: 'Double-Barrel Shotgun', category: 'firearm', weight: 3.2, stack: 1, durability: 100, model: 'shotgun_double', icon: { shape: 'shotgun_double' },
  firearm: GUN({ ammo: ['ammo_12g', 'ammo_12g_slug'], magSize: 2, damage: 15, pellets: 8, fireRate: 3, modes: ['semi'], spread: 0.12, adsSpread: 0.08, recoil: 10, range: 30, reload: 'break', reloadTime: 2.4, noise: 85, aimFov: 60, durabilityLoss: 0.1, sound: 'gun_shotgun', jam: 0 }),
  desc: 'Side-by-side bird gun. Two barrels, two problems solved.' });
add({ id: 'shotgun_sawed', name: 'Sawed-Off Shotgun', category: 'firearm', weight: 2.0, stack: 1, durability: 100, model: 'shotgun_sawed', rarity: 'uncommon', icon: { shape: 'shotgun_sawed' },
  firearm: GUN({ ammo: ['ammo_12g', 'ammo_12g_slug'], magSize: 2, damage: 13, pellets: 8, fireRate: 3, modes: ['semi'], spread: 0.2, adsSpread: 0.16, recoil: 12, range: 16, reload: 'break', reloadTime: 2.0, noise: 90, aimFov: 64, durabilityLoss: 0.15, sound: 'gun_shotgun', jam: 0 }),
  desc: 'Barrels hacksawed to the forend. Brutal spread, deafening bark.' });
add({ id: 'rifle_hunting', name: 'Hunting Rifle', category: 'firearm', weight: 3.8, stack: 1, durability: 100, model: 'rifle_hunting', rarity: 'uncommon', icon: { shape: 'rifle_hunting' },
  firearm: GUN({ ammo: ['ammo_308'], magSize: 5, damage: 110, fireRate: 0.8, modes: ['bolt'], spread: 0.06, adsSpread: 0.001, recoil: 10, range: 250, reload: 'single', reloadTime: 0.8, shellTime: 0.6, noise: 120, aimFov: 25, scope: true, durabilityLoss: 0.1, sound: 'gun_sniper', jam: 0.001 }),
  desc: 'Scoped bolt-action .308 deer rifle. One shot, one kill — then run.' });
add({ id: 'rifle_ar15', name: 'AR-15 Rifle', category: 'firearm', weight: 3.0, stack: 1, durability: 100, model: 'rifle_ar', rarity: 'rare', icon: { shape: 'rifle_ar' },
  firearm: GUN({ ammo: ['ammo_556'], magSize: 30, damage: 40, fireRate: 6, modes: ['semi'], spread: 0.05, adsSpread: 0.004, recoil: 2.8, range: 180, reloadTime: 2.4, noise: 100, aimFov: 50, durabilityLoss: 0.08, sound: 'gun_ar', jam: 0.002 }),
  desc: 'Civilian semi-auto 5.56 with a red-dot sight. Somebody prepped for this.' });
add({ id: 'rifle_m4', name: 'M4 Carbine', category: 'firearm', weight: 2.9, stack: 1, durability: 100, model: 'rifle_ar', rarity: 'epic', icon: { shape: 'rifle_m4' },
  firearm: GUN({ ammo: ['ammo_556'], magSize: 30, damage: 40, fireRate: 12, modes: ['auto', 'semi'], spread: 0.05, adsSpread: 0.004, recoil: 3, range: 180, reloadTime: 2.3, noise: 100, aimFov: 45, durabilityLoss: 0.07, sound: 'gun_ar', jam: 0.0015 }),
  desc: 'Select-fire military carbine. The Guard left in a hurry.' });
add({ id: 'rifle_ak47', name: 'AK-47', category: 'firearm', weight: 3.6, stack: 1, durability: 100, model: 'rifle_ak', rarity: 'rare', icon: { shape: 'rifle_ak' },
  firearm: GUN({ ammo: ['ammo_762'], magSize: 30, damage: 45, fireRate: 10, modes: ['auto', 'semi'], spread: 0.06, adsSpread: 0.007, recoil: 4.5, range: 160, reloadTime: 2.6, noise: 110, aimFov: 55, durabilityLoss: 0.05, sound: 'gun_ak', jam: 0.0005 }),
  desc: 'Stamped-receiver 7.62 with a curved mag. Kicks like a mule, never quits.' });
add({ id: 'rifle_sks', name: 'SKS Rifle', category: 'firearm', weight: 3.9, stack: 1, durability: 100, model: 'rifle_22', rarity: 'uncommon', icon: { shape: 'rifle_sks' },
  firearm: GUN({ ammo: ['ammo_762'], magSize: 10, damage: 46, fireRate: 4, modes: ['semi'], spread: 0.05, adsSpread: 0.005, recoil: 4, range: 170, reload: 'single', reloadTime: 0.8, shellTime: 0.3, noise: 105, aimFov: 55, durabilityLoss: 0.06, sound: 'gun_rifle', jam: 0.001 }),
  desc: 'Surplus semi-auto carbine with a fixed 10-round box. Cheap, tough, everywhere.' });
add({ id: 'rifle_22', name: '.22 Rifle', category: 'firearm', weight: 2.3, stack: 1, durability: 100, model: 'rifle_22', icon: { shape: 'rifle_22' },
  firearm: GUN({ ammo: ['ammo_22'], magSize: 10, damage: 22, fireRate: 5, modes: ['semi'], spread: 0.04, adsSpread: 0.004, recoil: 1, range: 120, reloadTime: 1.8, noise: 30, aimFov: 55, durabilityLoss: 0.05, sound: 'gun_22', jam: 0.003 }),
  desc: 'A rotary-mag rimfire plinker. Quiet enough not to ring the dinner bell.' });
add({ id: 'rifle_lever', name: 'Lever-Action Carbine', category: 'firearm', weight: 2.8, stack: 1, durability: 100, model: 'rifle_22', rarity: 'uncommon', icon: { shape: 'rifle_lever' },
  firearm: GUN({ ammo: ['ammo_357'], magSize: 10, damage: 66, fireRate: 1.5, modes: ['pump'], spread: 0.045, adsSpread: 0.004, recoil: 5, range: 120, reload: 'shell', reloadTime: 0.6, shellTime: 0.45, noise: 85, aimFov: 55, durabilityLoss: 0.07, sound: 'gun_rifle', jam: 0.001 }),
  desc: 'Cowboy carbine chambered in .357. Shares ammo with the revolver.' });
add({ id: 'smg_mp5', name: 'MP5 SMG', category: 'firearm', weight: 2.5, stack: 1, durability: 100, model: 'smg', rarity: 'rare', icon: { shape: 'smg' },
  firearm: GUN({ ammo: ['ammo_9mm'], magSize: 30, damage: 30, fireRate: 13, modes: ['auto', 'semi'], spread: 0.05, adsSpread: 0.01, recoil: 1.8, range: 70, reloadTime: 2.2, noise: 60, aimFov: 58, durabilityLoss: 0.06, sound: 'gun_smg', jam: 0.0015 }),
  desc: 'Roller-delayed 9mm sub-gun from the county SWAT locker. A hose of lead.' });
add({ id: 'crossbow', name: 'Crossbow', category: 'firearm', weight: 3.5, stack: 1, durability: 100, model: 'crossbow', rarity: 'rare', icon: { shape: 'crossbow' },
  firearm: GUN({ ammo: ['crossbow_bolt'], magSize: 1, damage: 95, fireRate: 0.4, modes: ['semi'], spread: 0.03, adsSpread: 0.002, recoil: 2, range: 70, reload: 'single', reloadTime: 0.4, shellTime: 2.4, noise: 4, aimFov: 45, durabilityLoss: 0.15, sound: 'crossbow', jam: 0, recover: 0.75 }),
  desc: 'A 175 lb hunting crossbow. Silent, deadly, slow to crank.' });
add({ id: 'bow', name: 'Compound Bow', category: 'firearm', weight: 1.6, stack: 1, durability: 100, model: 'bow', rarity: 'uncommon', icon: { shape: 'bow' },
  firearm: GUN({ ammo: ['arrow'], magSize: 1, damage: 60, fireRate: 0.9, modes: ['semi'], spread: 0.04, adsSpread: 0.006, recoil: 1, range: 60, reload: 'single', reloadTime: 0.2, shellTime: 0.6, noise: 4, aimFov: 55, durabilityLoss: 0.2, sound: 'bow', jam: 0, recover: 0.7 }),
  desc: 'Cam-and-cable hunting bow. Whisper-quiet if you can hold the draw.' });
add({ id: 'bow_crude', name: 'Crude Bow', category: 'firearm', weight: 0.9, stack: 1, durability: 60, model: 'bow', icon: { shape: 'bow_crude' },
  firearm: GUN({ ammo: ['arrow'], magSize: 1, damage: 38, fireRate: 0.8, modes: ['semi'], spread: 0.06, adsSpread: 0.012, recoil: 1, range: 40, reload: 'single', reloadTime: 0.3, shellTime: 0.7, noise: 3, aimFov: 60, durabilityLoss: 0.5, sound: 'bow', jam: 0, recover: 0.6 }),
  desc: 'A bent sapling and a length of rope. It flings arrows. Roughly forward.' });

// ---------------------------------------------------------------------------------------------------------
// AMMO
// ---------------------------------------------------------------------------------------------------------
add({ id: 'ammo_9mm', name: '9mm Rounds', category: 'ammo', weight: 0.012, stack: 50, tags: ['ammo'], round: { caliber: '9mm' }, icon: { shape: 'ammo_box', color: '#3c66b0', color2: '#d9b24a' }, desc: '9x19mm Parabellum. The most common pistol round in the county.' });
add({ id: 'ammo_45', name: '.45 ACP Rounds', category: 'ammo', weight: 0.021, stack: 50, tags: ['ammo'], round: { caliber: '.45' }, icon: { shape: 'ammo_box', color: '#6b3c8f', color2: '#d9b24a' }, desc: 'Fat, slow .45 ACP. Hits like a hammer.' });
add({ id: 'ammo_357', name: '.357 Magnum Rounds', category: 'ammo', weight: 0.016, stack: 36, tags: ['ammo'], round: { caliber: '.357' }, icon: { shape: 'ammo_box', color: '#b03a32', color2: '#c0c6cc' }, desc: 'Full-power magnum cartridges for revolvers and lever guns.' });
add({ id: 'ammo_12g', name: '12 Gauge Buckshot', category: 'ammo', weight: 0.045, stack: 25, tags: ['ammo'], round: { caliber: '12g' }, icon: { shape: 'shells', color: '#c23a2e' }, desc: '00 buckshot. Eight pellets of bad news.' });
add({ id: 'ammo_12g_slug', name: '12 Gauge Slugs', category: 'ammo', weight: 0.05, stack: 25, tags: ['ammo'], round: { caliber: '12g', pellets: 1, damage: 90, spreadMult: 0.2, range: 90 }, icon: { shape: 'shells', color: '#2f7d3a' }, desc: 'One-ounce rifled slug. Turns a shotgun into a short-range rifle.' });
add({ id: 'ammo_556', name: '5.56mm Rounds', category: 'ammo', weight: 0.012, stack: 60, tags: ['ammo'], round: { caliber: '5.56' }, icon: { shape: 'ammo_rifle', color: '#5d6b3a', color2: '#d9b24a' }, desc: '5.56x45mm NATO, green-tip. Feeds AR-pattern rifles.' });
add({ id: 'ammo_762', name: '7.62x39mm Rounds', category: 'ammo', weight: 0.017, stack: 60, tags: ['ammo'], round: { caliber: '7.62' }, icon: { shape: 'ammo_rifle', color: '#8c5a2b', color2: '#7c8a6a' }, desc: 'Steel-cased 7.62 for AKs and SKSs. Cheap and dirty.' });
add({ id: 'ammo_308', name: '.308 Winchester Rounds', category: 'ammo', weight: 0.025, stack: 30, tags: ['ammo'], round: { caliber: '.308' }, icon: { shape: 'ammo_rifle', color: '#2d4a2d', color2: '#e0b84e', color3: '#c0c6cc' }, desc: 'Soft-point deer loads. Overkill for the dead — exactly enough.' });
add({ id: 'ammo_22', name: '.22 LR Rounds', category: 'ammo', weight: 0.0035, stack: 100, tags: ['ammo'], round: { caliber: '.22' }, icon: { shape: 'ammo_box_small', color: '#d0a030', color2: '#c4302b' }, desc: 'A brick of rimfire. Tiny, quiet, plentiful.' });
add({ id: 'crossbow_bolt', name: 'Crossbow Bolts', category: 'ammo', weight: 0.03, stack: 15, tags: ['ammo'], round: { caliber: 'bolt' }, icon: { shape: 'bolts' }, desc: 'Carbon bolts with field points. Pull them out and shoot them again.' });
add({ id: 'arrow', name: 'Arrows', category: 'ammo', weight: 0.03, stack: 15, tags: ['ammo'], round: { caliber: 'arrow' }, icon: { shape: 'arrows' }, desc: 'Fletched hunting arrows. Recoverable — usually.' });

// ---------------------------------------------------------------------------------------------------------
// ATTACHMENTS
// ---------------------------------------------------------------------------------------------------------
add({ id: 'suppressor', name: 'Pistol Suppressor', category: 'attachment', weight: 0.3, stack: 1, durability: 100, rarity: 'rare', icon: { shape: 'suppressor' }, attachment: { kind: 'suppressor', fits: PISTOL_SUP, uses: 0, noiseMult: 0.3 }, desc: 'A threaded 9mm can. Fits pistols, the MP5 and the .22. Hollywood quiet it is not.' });
add({ id: 'suppressor_rifle', name: 'Rifle Suppressor', category: 'attachment', weight: 0.6, stack: 1, durability: 100, rarity: 'epic', icon: { shape: 'suppressor_rifle' }, attachment: { kind: 'suppressor', fits: ['rifle_ar15', 'rifle_m4', 'rifle_hunting'], uses: 0, noiseMult: 0.4 }, desc: '5.56 / .308 sound suppressor. Turns a crack into a cough.' });
add({ id: 'suppressor_bottle', name: 'Bottle Suppressor', category: 'attachment', weight: 0.1, stack: 1, uses: 12, icon: { shape: 'suppressor_bottle' }, attachment: { kind: 'suppressor', fits: [...PISTOL_SUP, 'revolver_357'], uses: 12, noiseMult: 0.5 }, desc: 'A plastic bottle duct-taped to the muzzle. Good for a dozen shots.' });

// ---------------------------------------------------------------------------------------------------------
// THROWABLES
// ---------------------------------------------------------------------------------------------------------
add({ id: 'molotov', name: 'Molotov Cocktail', category: 'throwable', weight: 0.9, stack: 3, model: 'molotov', rarity: 'uncommon', icon: { shape: 'molotov' }, throwable: { kind: 'molotov', fuse: 0, radius: 3.5, damage: 25, noise: 25, duration: 12, burn: 18 }, desc: 'Gasoline, glass and a rag. Light, throw, step back.' });
add({ id: 'pipe_bomb', name: 'Pipe Bomb', category: 'throwable', weight: 1.4, stack: 2, model: 'pipe_bomb', rarity: 'rare', icon: { shape: 'pipe_bomb' }, throwable: { kind: 'pipebomb', fuse: 4, radius: 5, damage: 160, noise: 150 }, desc: 'Capped pipe packed with powder. Four-second fuse. Do not hold.' });
add({ id: 'frag_grenade', name: 'Frag Grenade', category: 'throwable', weight: 0.4, stack: 3, model: 'grenade', rarity: 'epic', icon: { shape: 'grenade' }, throwable: { kind: 'grenade', fuse: 4, radius: 6, damage: 200, noise: 160 }, desc: 'M67 fragmentation grenade. Pull pin, count, throw.' });
add({ id: 'smoke_grenade', name: 'Smoke Grenade', category: 'throwable', weight: 0.5, stack: 3, model: 'grenade', rarity: 'rare', icon: { shape: 'smoke_grenade' }, throwable: { kind: 'smoke', fuse: 2, radius: 6, damage: 0, noise: 5, duration: 40 }, desc: 'Dense white smoke for 40 seconds. Break line of sight and slip away.' });
add({ id: 'flare', name: 'Road Flare', category: 'throwable', weight: 0.2, stack: 4, model: 'flare', icon: { shape: 'flare' }, light: { range: 14, cone: 6.28, drain: 0, omni: true, fire: true }, throwable: { kind: 'flare', fuse: 0, radius: 0, damage: 0, noise: 20, duration: 60 }, desc: 'Strike it and throw. Burns red for a minute and every dead thing comes to look.' });
add({ id: 'noise_maker', name: 'Noise Maker', category: 'throwable', weight: 0.5, stack: 2, icon: { shape: 'noise_maker' }, throwable: { kind: 'noise', fuse: 3, radius: 0, damage: 0, noise: 45, duration: 20 }, desc: 'Alarm clock taped to tin cans. Wind it, toss it, go the other way.' });
add({ id: 'firecrackers', name: 'Firecrackers', category: 'throwable', weight: 0.1, stack: 5, icon: { shape: 'firecrackers' }, throwable: { kind: 'noise', fuse: 2, radius: 0, damage: 0, noise: 60, duration: 6 }, desc: 'A strip of Black Cat-style crackers left over from the Fourth. Very loud distraction.' });

// ---------------------------------------------------------------------------------------------------------
// MEDICAL
// ---------------------------------------------------------------------------------------------------------
add({ id: 'bandage', name: 'Bandage', category: 'medical', weight: 0.05, stack: 6, tags: ['bandage'], useLabel: 'Bandage', icon: { shape: 'bandage' }, medical: MED({ stopBleed: 0.75, heal: 4, time: 4 }), desc: 'A clean roll of gauze. Stops bleeding, not infection.' });
add({ id: 'sterile_bandage', name: 'Sterile Bandage', category: 'medical', weight: 0.05, stack: 6, tags: ['bandage'], useLabel: 'Bandage', rarity: 'uncommon', icon: { shape: 'bandage_pack' }, medical: MED({ stopBleed: 0.85, heal: 6, sterile: true, time: 4 }), desc: 'Sealed sterile dressing. Keeps a wound clean while it heals.' });
add({ id: 'hemostatic_gauze', name: 'Hemostatic Gauze', category: 'medical', weight: 0.05, stack: 4, tags: ['bandage'], useLabel: 'Pack Wound', rarity: 'rare', icon: { shape: 'gauze' }, medical: MED({ stopBleed: 1, heal: 6, sterile: true, time: 5 }), desc: 'Clotting-agent gauze from a military kit. Stops arterial bleeding.' });
add({ id: 'disinfectant', name: 'Disinfectant', category: 'medical', weight: 0.3, stack: 1, uses: 5, tags: ['disinfectant'], useLabel: 'Disinfect', icon: { shape: 'disinfectant' }, medical: MED({ disinfect: 1, time: 3 }), desc: 'Brown bottle of iodine antiseptic. It stings. Good.' });
add({ id: 'alcohol_wipes', name: 'Alcohol Wipes', category: 'medical', weight: 0.01, stack: 10, tags: ['disinfectant'], useLabel: 'Disinfect', icon: { shape: 'wipes' }, medical: MED({ disinfect: 0.7, time: 2 }), desc: 'Individually wrapped isopropyl pads.' });
add({ id: 'painkillers', name: 'Painkillers', category: 'medical', weight: 0.05, stack: 1, uses: 12, useLabel: 'Take', icon: { shape: 'pills', color: '#d84a3a', color2: '#f3f1ea' }, medical: MED({ painkiller: 35, duration: 4, time: 2 }), desc: 'Extra-strength ibuprofen. Takes the edge off.' });
add({ id: 'antibiotics', name: 'Antibiotics', category: 'medical', weight: 0.05, stack: 1, uses: 6, useLabel: 'Take', rarity: 'rare', icon: { shape: 'pills', color: '#e8a12b', color2: '#f3f1ea' }, medical: MED({ antibiotic: 1, duration: 12, time: 2 }), desc: 'Amoxicillin capsules. Fights wound infection — not the other kind.' });
add({ id: 'antiviral', name: 'Experimental Antiviral', category: 'medical', weight: 0.05, stack: 1, uses: 1, useLabel: 'Inject', rarity: 'epic', icon: { shape: 'vial' }, medical: MED({ antiviral: 40, duration: 24, time: 4 }), desc: 'CDC-stamped auto-injector, "TRIAL KY-7". Slows the infection. Nobody knows if it cures it.' });
add({ id: 'splint', name: 'Splint', category: 'medical', weight: 0.4, stack: 2, useLabel: 'Splint', icon: { shape: 'splint' }, medical: MED({ splint: 1, time: 6 }), desc: 'Two flat boards and cloth wrap. Holds a broken bone in place.' });
add({ id: 'suture_kit', name: 'Suture Kit', category: 'medical', weight: 0.1, stack: 1, uses: 4, useLabel: 'Stitch', rarity: 'uncommon', icon: { shape: 'suture' }, medical: MED({ suture: 1, heal: 6, time: 8 }), desc: 'Curved needles and nylon thread. Closes deep lacerations.' });
add({ id: 'first_aid_kit', name: 'First Aid Kit', category: 'medical', weight: 0.6, stack: 1, uses: 3, useLabel: 'Treat', rarity: 'uncommon', icon: { shape: 'first_aid' }, medical: MED({ stopBleed: 0.9, disinfect: 1, heal: 20, sterile: true, time: 7 }), desc: 'Red-cross kit with dressings, antiseptic and tape. Three full treatments.' });
add({ id: 'ifak', name: 'IFAK', category: 'medical', weight: 0.5, stack: 1, uses: 2, useLabel: 'Treat', rarity: 'rare', icon: { shape: 'ifak' }, medical: MED({ stopBleed: 1, disinfect: 1, heal: 25, sterile: true, painkiller: 10, time: 6 }), desc: 'Individual First Aid Kit, Army issue. Tourniquet, gauze, chest seal.' });
add({ id: 'vitamins', name: 'Vitamins', category: 'medical', weight: 0.05, stack: 1, uses: 20, useLabel: 'Take', icon: { shape: 'pills', color: '#4a9a4a', color2: '#f3f1ea' }, medical: MED({ heal: 1, sickness: -4, duration: 6, time: 2 }), desc: 'Daily multivitamins. Your immune system needs all the help it can get.' });
add({ id: 'morphine', name: 'Morphine', category: 'medical', weight: 0.03, stack: 3, useLabel: 'Inject', rarity: 'rare', icon: { shape: 'syringe', color: '#7fb4e6' }, medical: MED({ painkiller: 90, energy: -20, duration: 6, time: 3 }), desc: 'A pre-filled morphine syrette. Pain goes away. So does focus.' });
add({ id: 'adrenaline', name: 'Adrenaline Injector', category: 'medical', weight: 0.05, stack: 3, useLabel: 'Inject', rarity: 'rare', icon: { shape: 'injector' }, medical: MED({ energy: 40, stamina: 100, panic: -20, painkiller: 30, heal: 10, duration: 1, time: 1 }), desc: 'Epinephrine auto-injector. Gets you back on your feet. Briefly.' });
add({ id: 'sleeping_pills', name: 'Sleeping Pills', category: 'medical', weight: 0.03, stack: 1, uses: 10, useLabel: 'Take', icon: { shape: 'blister', color: '#7d6bc4' }, medical: MED({ sleep: 1, energy: -15, panic: -10, duration: 8, time: 2 }), desc: 'Prescription sleep aid. Sleep through the groaning outside.' });
add({ id: 'beta_blockers', name: 'Beta Blockers', category: 'medical', weight: 0.03, stack: 1, uses: 10, useLabel: 'Take', rarity: 'uncommon', icon: { shape: 'pills', color: '#3d7fc4', color2: '#f3f1ea' }, medical: MED({ panic: -40, duration: 6, time: 2 }), desc: 'Propranolol. Steadies the hands and the heart.' });
add({ id: 'cold_medicine', name: 'Stomach Medicine', category: 'medical', weight: 0.2, stack: 1, uses: 6, useLabel: 'Take', icon: { shape: 'syrup' }, medical: MED({ sickness: -20, duration: 4, time: 2 }), desc: 'Pink bismuth syrup. For bad water and worse cans.' });
add({ id: 'burn_cream', name: 'Burn Ointment', category: 'medical', weight: 0.08, stack: 2, uses: 4, useLabel: 'Apply', icon: { shape: 'ointment' }, medical: MED({ burn: 1, heal: 3, disinfect: 0.3, time: 3 }), desc: 'Silver sulfadiazine cream for burns.' });
add({ id: 'tweezers', name: 'Tweezers', category: 'medical', weight: 0.02, stack: 1, durability: 50, useLabel: 'Extract', icon: { shape: 'tweezers' }, medical: MED({ extract: 1, time: 5 }), desc: 'Pointed steel tweezers. Pulls glass, splinters and bullet fragments.' });
add({ id: 'purification_tablets', name: 'Purification Tablets', category: 'misc', weight: 0.01, stack: 10, tags: ['purifier'], purify: 4, icon: { shape: 'tablets' }, desc: 'Chlorine dioxide tablets. One makes a liter of dirty water drinkable.' });
add({ id: 'bleach', name: 'Bleach', category: 'misc', weight: 1.0, stack: 1, uses: 8, tags: ['purifier'], purify: 16, icon: { shape: 'bleach' }, desc: 'Household bleach. A few drops purify water. Do NOT drink it straight.' });

// ---------------------------------------------------------------------------------------------------------
// FOOD
// ---------------------------------------------------------------------------------------------------------
const CANNED = (o) => FOOD(o.hunger, { needsOpener: true, leaves: 'tin_can', eatTime: 6, ...o });
add({ id: 'canned_beans', name: 'Canned Beans', category: 'food', weight: 0.45, stack: 4, icon: { shape: 'can', color: '#b5562a', color2: '#f2d16b' }, food: CANNED({ hunger: 30, thirst: -3 }), desc: 'Pork and beans in sauce. Survivor staple.' });
add({ id: 'canned_soup', name: 'Canned Soup', category: 'food', weight: 0.42, stack: 4, icon: { shape: 'can', color: '#c8302c', color2: '#f3f1ea' }, food: CANNED({ hunger: 22, thirst: 10 }), desc: 'Chicken noodle, condensed. Tastes like a sick day home from school.' });
add({ id: 'canned_tuna', name: 'Canned Tuna', category: 'food', weight: 0.17, stack: 6, icon: { shape: 'can_short', color: '#2f6fb8', color2: '#f2d16b' }, food: FOOD(18, { thirst: -4, health: 2, needsOpener: false, leaves: 'tin_can', eatTime: 4 }), desc: 'Pull-tab chunk light tuna. Protein, no opener needed.' });
add({ id: 'canned_peaches', name: 'Canned Peaches', category: 'food', weight: 0.45, stack: 4, icon: { shape: 'can', color: '#f0a040', color2: '#5b8c2a' }, food: CANNED({ hunger: 18, thirst: 12, panic: -3 }), desc: 'Peach halves in heavy syrup. A little sweetness at the end of the world.' });
add({ id: 'canned_corn', name: 'Canned Corn', category: 'food', weight: 0.43, stack: 4, icon: { shape: 'can', color: '#3f8a3a', color2: '#f2d040' }, food: CANNED({ hunger: 20, thirst: 4 }), desc: 'Whole kernel sweet corn.' });
add({ id: 'canned_chili', name: 'Canned Chili', category: 'food', weight: 0.45, stack: 4, icon: { shape: 'can', color: '#7a2a1e', color2: '#e8c33f' }, food: CANNED({ hunger: 32, thirst: -5 }), desc: 'Beef chili with beans. Heavy, hot, filling.' });
add({ id: 'canned_pasta', name: 'Canned Pasta', category: 'food', weight: 0.42, stack: 4, icon: { shape: 'can', color: '#e07a2a', color2: '#3d5fa8' }, food: FOOD(26, { thirst: 2, needsOpener: false, leaves: 'tin_can', eatTime: 5 }), desc: 'Pull-tab ravioli in tomato sauce. Kids loved these.' });
add({ id: 'canned_meat', name: 'Luncheon Meat', category: 'food', weight: 0.34, stack: 4, icon: { shape: 'can_rect', color: '#2c4d8f', color2: '#e8c33f' }, food: FOOD(32, { thirst: -6, needsOpener: false, leaves: 'tin_can', eatTime: 5 }), desc: 'Pink pressed pork with a key-open lid. Salty, fatty, perfect.' });
add({ id: 'canned_sardines', name: 'Sardines', category: 'food', weight: 0.13, stack: 6, icon: { shape: 'tin_flat', color: '#3a7f8a', color2: '#e8c33f' }, food: FOOD(16, { thirst: -6, health: 2, needsOpener: false, leaves: 'tin_can', eatTime: 3 }), desc: 'Little fish packed in oil. An acquired taste you\'ll acquire.' });
add({ id: 'dog_food', name: 'Canned Dog Food', category: 'food', weight: 0.4, stack: 4, icon: { shape: 'can', color: '#8a5a2a', color2: '#e04a3a' }, food: FOOD(25, { thirst: -2, sickness: 8, panic: 6, needsOpener: false, leaves: 'tin_can', eatTime: 6 }), desc: 'Chunks in gravy. Desperate times.' });
add({ id: 'mre', name: 'MRE', category: 'food', weight: 0.6, stack: 3, rarity: 'uncommon', icon: { shape: 'mre' }, food: FOOD(55, { thirst: 5, energy: 5, health: 3, eatTime: 8 }), desc: 'Meal, Ready-to-Eat: Menu 14, Beef Stew. 1,250 calories in a brown pouch.' });
add({ id: 'chips', name: 'Potato Chips', category: 'food', weight: 0.15, stack: 4, icon: { shape: 'chips', color: '#d8382c', color2: '#f2d040' }, food: FOOD(12, { thirst: -8, panic: -2, eatTime: 3 }), desc: 'Family-size bag. Mostly air, very salty.' });
add({ id: 'pretzels', name: 'Pretzels', category: 'food', weight: 0.2, stack: 4, icon: { shape: 'chips', color: '#2f6fb8', color2: '#c48a3a' }, food: FOOD(14, { thirst: -8, eatTime: 3 }), desc: 'Salted twists. Make you thirsty.' });
add({ id: 'chocolate', name: 'Chocolate Bar', category: 'food', weight: 0.1, stack: 6, icon: { shape: 'choc_bar', color: '#6b3a1f', color2: '#c8302c' }, food: FOOD(12, { thirst: -2, energy: 5, panic: -5, eatTime: 2 }), desc: 'Milk chocolate. Morale in a wrapper.' });
add({ id: 'candy', name: 'Candy', category: 'food', weight: 0.05, stack: 10, icon: { shape: 'candy' }, food: FOOD(6, { energy: 3, panic: -3, eatTime: 1 }), desc: 'Hard candies swept from a reception desk bowl.' });
add({ id: 'granola_bar', name: 'Granola Bar', category: 'food', weight: 0.05, stack: 8, icon: { shape: 'bar', color: '#5b8c2a', color2: '#d8b070' }, food: FOOD(10, { thirst: -2, energy: 3, eatTime: 2 }), desc: 'Oats and honey. Crunchy, crumbly, keeps forever.' });
add({ id: 'cereal', name: 'Cereal', category: 'food', weight: 0.5, stack: 2, uses: 4, icon: { shape: 'cereal', color: '#e8c33f', color2: '#c8302c' }, food: FOOD(10, { thirst: -2, eatTime: 3 }), desc: 'Frosted corn flakes. Dry, but it\'s calories. Four bowls.' });
add({ id: 'crackers', name: 'Crackers', category: 'food', weight: 0.3, stack: 3, uses: 3, icon: { shape: 'crackers', color: '#c8302c', color2: '#e8c070' }, food: FOOD(8, { thirst: -4, eatTime: 3 }), desc: 'Saltines, three sleeves. Settles the stomach.' });
add({ id: 'peanut_butter', name: 'Peanut Butter', category: 'food', weight: 0.5, stack: 2, uses: 5, icon: { shape: 'jar', color: '#b07a3a', color2: '#c8302c', color3: '#e8c33f' }, food: FOOD(12, { thirst: -3, energy: 2, eatTime: 3 }), desc: 'A jar of crunchy. Calorie dense, never spoils.' });
add({ id: 'honey', name: 'Honey', category: 'food', weight: 0.35, stack: 2, uses: 4, icon: { shape: 'jar', color: '#e0a020', color2: '#f3f1ea', color3: '#8a5a2a' }, food: FOOD(8, { energy: 3, panic: -2, eatTime: 2 }), desc: 'Local wildflower honey from a roadside stand. Literally never goes bad.' });
add({ id: 'pickles', name: 'Pickles', category: 'food', weight: 0.7, stack: 2, uses: 3, icon: { shape: 'jar', color: '#6a9a3a', color2: '#e8c33f', color3: '#3d6a2a' }, food: FOOD(5, { thirst: 4, eatTime: 3 }), desc: 'Dill spears in brine. Sour, crunchy, something to chew.' });
add({ id: 'cookies', name: 'Cookies', category: 'food', weight: 0.3, stack: 2, uses: 3, icon: { shape: 'cookies' }, food: FOOD(7, { thirst: -3, panic: -3, eatTime: 2 }), desc: 'Chocolate chip, slightly stale. Still the best thing you\'ve eaten all week.' });
add({ id: 'coffee', name: 'Instant Coffee', category: 'food', weight: 0.2, stack: 2, uses: 6, useLabel: 'Drink', icon: { shape: 'coffee' }, food: FOOD(0, { thirst: -2, energy: 12, eatTime: 3 }), desc: 'Freeze-dried crystals. Eaten dry, it still keeps your eyes open.' });
add({ id: 'apple', name: 'Apple', category: 'food', weight: 0.2, stack: 8, icon: { shape: 'apple' }, food: FOOD(10, { thirst: 3, spoils: 336, eatTime: 2 }), desc: 'A crisp orchard apple. October\'s finest.' });
add({ id: 'orange', name: 'Orange', category: 'food', weight: 0.2, stack: 8, icon: { shape: 'orange' }, food: FOOD(9, { thirst: 5, spoils: 336, eatTime: 2 }), desc: 'Juicy navel orange, shipped from somewhere that isn\'t here.' });
add({ id: 'bread', name: 'Bread', category: 'food', weight: 0.5, stack: 2, uses: 4, icon: { shape: 'bread' }, food: FOOD(10, { thirst: -2, spoils: 120, eatTime: 3 }), desc: 'A loaf of sliced white. Goes green in a few days.' });
add({ id: 'cheese', name: 'Cheese', category: 'food', weight: 0.4, stack: 2, uses: 3, icon: { shape: 'cheese' }, food: FOOD(11, { thirst: -3, spoils: 240, eatTime: 3 }), desc: 'A block of sharp cheddar. Keeps for a while without a fridge.' });
add({ id: 'raw_meat', name: 'Raw Meat', category: 'food', weight: 0.5, stack: 4, icon: { shape: 'steak', color: '#c83a3a', color2: '#f0d0c0' }, food: FOOD(12, { sickness: 30, raw: true, cookTo: 'cooked_meat', spoils: 24, eatTime: 6 }), desc: 'Raw steak or venison. Cook it — seriously.' });
add({ id: 'cooked_meat', name: 'Cooked Meat', category: 'food', weight: 0.45, stack: 4, icon: { shape: 'steak', color: '#8a4a22', color2: '#e8c08a' }, food: FOOD(35, { thirst: -3, health: 4, spoils: 48, eatTime: 6 }), desc: 'Seared over open flame. Smells like before.' });
add({ id: 'raw_chicken', name: 'Raw Chicken', category: 'food', weight: 0.4, stack: 4, icon: { shape: 'drumstick', color: '#f0c0a8', color2: '#f3f1ea' }, food: FOOD(10, { sickness: 40, raw: true, cookTo: 'cooked_chicken', spoils: 20, eatTime: 5 }), desc: 'Raw drumsticks. Salmonella roulette if eaten like this.' });
add({ id: 'cooked_chicken', name: 'Cooked Chicken', category: 'food', weight: 0.35, stack: 4, icon: { shape: 'drumstick', color: '#b0702e', color2: '#f3f1ea' }, food: FOOD(30, { thirst: -2, health: 3, spoils: 40, eatTime: 5 }), desc: 'Golden, crispy skin. Worth the risk of lighting a fire.' });
add({ id: 'jerky', name: 'Beef Jerky', category: 'food', weight: 0.1, stack: 6, icon: { shape: 'jerky' }, food: FOOD(15, { thirst: -6, eatTime: 3 }), desc: 'Peppered strips of dried beef. Light, lasts forever.' });
add({ id: 'instant_noodles', name: 'Instant Noodles', category: 'food', weight: 0.08, stack: 6, icon: { shape: 'noodles' }, food: FOOD(18, { thirst: -6, eatTime: 3 }), desc: 'A cup of ramen. Crunch it dry if you must.' });
add({ id: 'potato', name: 'Potato', category: 'food', weight: 0.3, stack: 8, icon: { shape: 'potato' }, food: FOOD(8, { sickness: 4, raw: true, cookTo: 'baked_potato', spoils: 720, eatTime: 4 }), desc: 'A russet potato. Edible raw, barely.' });
add({ id: 'baked_potato', name: 'Baked Potato', category: 'food', weight: 0.28, stack: 8, icon: { shape: 'potato', color: '#8a5a2e', color2: '#f0e0a0' }, food: FOOD(20, { thirst: -1, spoils: 72, eatTime: 4 }), desc: 'Buried in the coals until soft. Fluffy and hot.' });
add({ id: 'carrot', name: 'Carrot', category: 'food', weight: 0.1, stack: 10, icon: { shape: 'carrot' }, food: FOOD(6, { thirst: 2, spoils: 336, eatTime: 2 }), desc: 'From someone\'s backyard garden. Good for your eyes in the dark.' });
add({ id: 'roasted_corn', name: 'Roasted Corn', category: 'food', weight: 0.28, stack: 10, icon: { shape: 'corn', color: '#d89a2a' }, food: FOOD(18, { thirst: -1, spoils: 72, eatTime: 4 }), desc: 'Charred in the husk. Sweet and smoky.' });
add({ id: 'wild_mushrooms', name: 'Wild Mushrooms', category: 'food', weight: 0.1, stack: 10, icon: { shape: 'mushroom' }, food: FOOD(5, { sickness: 12, spoils: 72, eatTime: 2 }), desc: 'You\'re pretty sure these are chanterelles. Pretty sure.' });
add({ id: 'stew', name: 'Survival Stew', category: 'food', weight: 0.8, stack: 1, uses: 2, icon: { shape: 'stew' }, food: FOOD(35, { thirst: 10, health: 6, panic: -8, spoils: 48, eatTime: 6 }), desc: 'Meat, potatoes and whatever else, simmered for hours. Two hearty bowls.' });
add({ id: 'cigarettes', name: 'Cigarettes', category: 'food', weight: 0.03, stack: 1, uses: 20, useLabel: 'Smoke', icon: { shape: 'cigarettes' }, food: FOOD(0, { thirst: -1, panic: -10, health: -0.5, eatTime: 5 }), desc: 'A crumpled soft pack of reds. Calms the nerves. Needs a light.' });

// ---------------------------------------------------------------------------------------------------------
// DRINKS
// ---------------------------------------------------------------------------------------------------------
add({ id: 'water_bottle', name: 'Water Bottle', category: 'drink', weight: 0.05, stack: 1, uses: 4, model: 'bottle', icon: { shape: 'bottle_water' }, liquidContainer: { capacity: 4 }, data: { liquid: 'water' }, drink: DRINK(12, { perUse: true }), desc: 'A 1 L plastic bottle. Refill it at a sink, pump or creek.' });
add({ id: 'canteen', name: 'Canteen', category: 'drink', weight: 0.3, stack: 1, uses: 4, rarity: 'uncommon', icon: { shape: 'canteen' }, liquidContainer: { capacity: 4 }, data: { liquid: 'water' }, drink: DRINK(12, { perUse: true }), desc: 'Olive drab 1 qt canteen in a canvas cover. Tough as nails.' });
add({ id: 'water_jug', name: 'Water Jug', category: 'drink', weight: 0.2, stack: 1, uses: 16, icon: { shape: 'jug' }, liquidContainer: { capacity: 16 }, data: { liquid: 'water' }, drink: DRINK(12, { perUse: true }), desc: 'A gallon jug of spring water. Heavy, precious.' });
add({ id: 'soda', name: 'Cola', category: 'drink', weight: 0.36, stack: 6, icon: { shape: 'soda', color: '#c8302c', color2: '#f3f1ea' }, drink: DRINK(18, { hunger: 3, energy: 3, panic: -2, leaves: 'soda_can' }), desc: 'Warm, flat-ish cola. Sugar and caffeine.' });
add({ id: 'soda_orange', name: 'Orange Soda', category: 'drink', weight: 0.36, stack: 6, icon: { shape: 'soda', color: '#f08a24', color2: '#3d7a2a' }, drink: DRINK(18, { hunger: 3, energy: 2, panic: -2, leaves: 'soda_can' }), desc: 'Neon orange and painfully sweet.' });
add({ id: 'energy_drink', name: 'Energy Drink', category: 'drink', weight: 0.5, stack: 4, icon: { shape: 'can_tall', color: '#2b2b33', color2: '#7ad03a' }, drink: DRINK(14, { energy: 25, panic: 4, leaves: 'soda_can' }), desc: '"VOLT" — 300 mg of caffeine. Heart pounding, eyes open.' });
add({ id: 'sports_drink', name: 'Sports Drink', category: 'drink', weight: 0.62, stack: 2, model: 'bottle', icon: { shape: 'bottle_sports' }, drink: DRINK(22, { energy: 5, leaves: 'plastic_bottle' }), desc: 'Electric-blue electrolytes. Rehydrates like nothing else.' });
add({ id: 'juice', name: 'Orange Juice', category: 'drink', weight: 0.25, stack: 2, uses: 4, icon: { shape: 'carton', color: '#f08a24', color2: '#5b8c2a' }, drink: DRINK(12, { hunger: 3, perUse: true }), desc: 'Shelf-stable carton of OJ. Vitamin C!' });
add({ id: 'milk', name: 'Milk', category: 'drink', weight: 0.25, stack: 2, uses: 4, icon: { shape: 'carton', color: '#3a6fc4', color2: '#f3f1ea' }, drink: DRINK(10, { hunger: 4, perUse: true, spoils: 48 }), desc: 'Whole milk from Bluegrass Dairy. Smell it first.' });
add({ id: 'beer', name: 'Beer', category: 'drink', weight: 0.55, stack: 4, model: 'bottle', icon: { shape: 'bottle_beer' }, drink: DRINK(10, { alcohol: 15, panic: -6, leaves: 'glass_bottle' }), desc: 'A longneck of domestic lager. Warm. Still good.' });
add({ id: 'whiskey', name: 'Bourbon Whiskey', category: 'drink', weight: 0.3, stack: 1, uses: 6, model: 'bottle', rarity: 'uncommon', tags: ['disinfectant'], icon: { shape: 'bottle_liquor' }, drink: DRINK(2, { alcohol: 12, panic: -6, perUse: true, leaves: 'glass_bottle' }), medical: MED({ disinfect: 0.6, time: 3 }), desc: 'Kentucky straight bourbon. Drink it, or pour it on a wound.' });
add({ id: 'moonshine', name: 'Moonshine', category: 'drink', weight: 0.3, stack: 1, uses: 5, model: 'bottle', rarity: 'uncommon', tags: ['disinfectant', 'fuel'], burnTime: 6, icon: { shape: 'jar', color: '#d8eef2', color2: '#9aa3ab', color3: '#b8d8e0' }, drink: DRINK(0, { alcohol: 22, panic: -8, sickness: 3, perUse: true }), medical: MED({ disinfect: 0.85, time: 3 }), desc: 'Clear corn liquor in a mason jar from the hollow. 140 proof. Burns going down — and in a lamp.' });

// ---------------------------------------------------------------------------------------------------------
// TOOLS & UTILITY
// ---------------------------------------------------------------------------------------------------------
add({ id: 'flashlight', name: 'Flashlight', category: 'tool', weight: 0.4, stack: 1, uses: 100, model: 'flashlight', icon: { shape: 'flashlight' }, light: { range: 28, cone: 0.45, drain: 4 }, desc: 'A 2-D-cell aluminium flashlight. Batteries not guaranteed.' });
add({ id: 'flashlight_tactical', name: 'Tactical Flashlight', category: 'tool', weight: 0.25, stack: 1, uses: 100, model: 'flashlight', rarity: 'uncommon', icon: { shape: 'flashlight', color: '#2b2b30' }, light: { range: 36, cone: 0.38, drain: 5 }, desc: 'A bright LED duty light from a patrol belt.' });
add({ id: 'headlamp', name: 'Headlamp', category: 'tool', weight: 0.15, stack: 1, uses: 100, icon: { shape: 'headlamp' }, light: { range: 18, cone: 0.6, drain: 3, head: true }, desc: 'Elastic-strap LED headlamp. Keeps both hands free.' });
add({ id: 'lantern', name: 'Camping Lantern', category: 'tool', weight: 0.9, stack: 1, uses: 100, icon: { shape: 'lantern' }, light: { range: 10, cone: 6.28, drain: 5, omni: true }, desc: 'Battery LED lantern. Lights the whole room — and the windows.' });
add({ id: 'torch', name: 'Torch', category: 'tool', weight: 0.4, stack: 1, uses: 100, model: 'flare', icon: { shape: 'torch' }, light: { range: 12, cone: 6.28, drain: 25, omni: true, fire: true }, desc: 'A gasoline-soaked rag on a stick. Burns about four hours.' });
add({ id: 'lighter', name: 'Lighter', category: 'utility', weight: 0.03, stack: 1, uses: 60, tags: ['fire_starter'], icon: { shape: 'lighter' }, desc: 'A disposable butane lighter. Precious.' });
add({ id: 'matches', name: 'Matches', category: 'utility', weight: 0.02, stack: 4, uses: 20, tags: ['fire_starter'], icon: { shape: 'matches' }, desc: 'A box of strike-anywhere matches.' });
add({ id: 'can_opener', name: 'Can Opener', category: 'utility', weight: 0.15, stack: 1, tags: ['can_opener'], icon: { shape: 'can_opener' }, desc: 'A manual crank can opener. The most valuable thing in the kitchen.' });
add({ id: 'lockpick', name: 'Lockpick', category: 'utility', weight: 0.01, stack: 5, tags: ['lockpick'], icon: { shape: 'lockpick' }, desc: 'A tension wrench and hook pick. Breaks if you force it.' });
add({ id: 'multitool', name: 'Multitool', category: 'utility', weight: 0.25, stack: 1, durability: 200, rarity: 'uncommon', tags: ['can_opener', 'screwdriver', 'blade'], icon: { shape: 'multitool' }, desc: 'Pliers, blade, can opener and screwdrivers in one stainless steel package.' });
add({ id: 'saw', name: 'Hand Saw', category: 'tool', weight: 0.7, stack: 1, durability: 150, tags: ['saw'], icon: { shape: 'saw' }, desc: 'A crosscut carpenter\'s saw. Logs to planks.' });
add({ id: 'pot', name: 'Cooking Pot', category: 'utility', weight: 1.0, stack: 1, uses: 8, tags: ['cooking_pot', 'cookware'], icon: { shape: 'pot' }, liquidContainer: { capacity: 8 }, desc: 'A steel stock pot. Boils water, cooks stew. Holds 2 L.' });
add({ id: 'binoculars', name: 'Binoculars', category: 'tool', weight: 0.7, stack: 1, tags: ['binoculars'], zoomFov: 15, rarity: 'uncommon', icon: { shape: 'binoculars' }, desc: '10x42 hunting binoculars. See them before they see you.' });
add({ id: 'map_millbrook', name: 'Map of Millbrook', category: 'utility', weight: 0.05, stack: 1, tags: ['map'], useLabel: 'Read', icon: { shape: 'map' }, desc: 'A folded tourist map of Millbrook and Hollis County. Reveals the town.' });
add({ id: 'watch', name: 'Wristwatch', category: 'utility', weight: 0.05, stack: 1, tags: ['watch'], icon: { shape: 'watch' }, desc: 'A cheap digital watch. Knowing when night falls keeps you alive.' });
add({ id: 'compass', name: 'Compass', category: 'utility', weight: 0.05, stack: 1, tags: ['compass'], icon: { shape: 'compass' }, desc: 'A liquid-filled orienteering compass.' });
add({ id: 'radio_handheld', name: 'Handheld Radio', category: 'tool', weight: 0.35, stack: 1, uses: 100, tags: ['radio', 'electronics_source'], icon: { shape: 'radio' }, radio: { drain: 2 }, desc: 'A two-way radio with a weather band. Static, mostly. Mostly.' });
add({ id: 'gas_can', name: 'Gas Can', category: 'utility', weight: 0.9, stack: 1, uses: 20, tags: ['fuel'], icon: { shape: 'gas_can' }, liquidContainer: { capacity: 20 }, data: { liquid: 'gasoline' }, desc: 'A red 5 L jerry can. Siphon a car to fill it.' });
add({ id: 'sewing_kit', name: 'Sewing Kit', category: 'utility', weight: 0.1, stack: 1, uses: 10, tags: ['repair_cloth'], icon: { shape: 'sewing_kit' }, desc: 'Needles, thread and patches. Mends torn clothing.' });
add({ id: 'whetstone', name: 'Whetstone', category: 'utility', weight: 0.3, stack: 1, uses: 20, tags: ['repair_blade'], icon: { shape: 'whetstone' }, desc: 'A two-grit sharpening stone. Keeps a blade keen.' });
add({ id: 'gun_cleaning_kit', name: 'Gun Cleaning Kit', category: 'utility', weight: 0.4, stack: 1, uses: 8, tags: ['repair_gun'], rarity: 'uncommon', icon: { shape: 'gun_kit' }, desc: 'Rods, brushes, solvent and oil. A clean gun is a gun that fires.' });
add({ id: 'campfire_kit', name: 'Campfire Kit', category: 'utility', weight: 2.5, stack: 1, place: 'campfire', useLabel: 'Place', icon: { shape: 'campfire_kit' }, desc: 'A bundle of kindling and split wood. Place it and light it with a fire starter.' });
add({ id: 'smartphone', name: 'Dead Smartphone', category: 'misc', weight: 0.2, stack: 2, tags: ['electronics_source'], icon: { shape: 'phone' }, desc: '17 missed calls from "Mom". No signal. Salvage it for parts.' });
add({ id: 'tv_remote', name: 'TV Remote', category: 'misc', weight: 0.1, stack: 2, tags: ['electronics_source'], icon: { shape: 'remote' }, desc: 'Every channel is the emergency broadcast now. Has batteries in it.' });

// ---------------------------------------------------------------------------------------------------------
// LITERATURE & PERSONAL
// ---------------------------------------------------------------------------------------------------------
const SKILLBOOK = (id, name, skill, color, decal, desc) => add({ id, name, category: 'book', weight: 0.5, stack: 1, rarity: 'uncommon', useLabel: 'Read', icon: { shape: 'book', color, decal }, book: { skill, mult: 2, hours: 3, xp: 50 }, desc });
SKILLBOOK('book_aiming', 'Practical Marksmanship', 'aiming', '#3a5a3a', 'crosshair', 'A range officer\'s guide to breathing, trigger squeeze and recoil. Doubles Aiming XP.');
SKILLBOOK('book_firstaid', 'Field First Aid Manual', 'firstAid', '#d8d4c8', 'cross', 'Red Cross wilderness first aid, dog-eared. Doubles First Aid XP.');
SKILLBOOK('book_maintenance', 'The Handyman\'s Bible', 'maintenance', '#3a5fa8', 'wrench', 'Fix anything with what you\'ve got. Doubles Maintenance XP.');
SKILLBOOK('book_fitness', 'Couch to 5K', 'fitness', '#e07a2a', 'shoe', 'A running program for the newly motivated. Doubles Fitness XP.');
SKILLBOOK('book_sneaking', 'The Silent Hunter', 'sneaking', '#2b2b33', 'eye', 'Bowhunting stalking techniques. Doubles Sneaking XP.');
SKILLBOOK('book_melee', 'Close Quarters Combat', 'melee', '#8a2a22', 'blade', 'An old Army field manual on hand-to-hand fighting. Doubles Melee XP.');
SKILLBOOK('book_scavenging', 'Scavenger\'s Almanac', 'scavenging', '#6b5a2a', 'magnifier', 'Where people hide things, and what\'s worth taking. Doubles Scavenging XP.');
SKILLBOOK('book_strength', 'Iron Will Strength Training', 'strength', '#5a5a62', 'dumbbell', 'Barbell programming for real-world strength. Doubles Strength XP.');
add({ id: 'novel', name: 'Paperback Novel', category: 'book', weight: 0.3, stack: 1, useLabel: 'Read', icon: { shape: 'book', color: '#a83a6a', decal: 'lines' }, book: { panic: -20, boredom: -40, hours: 1.5 }, desc: 'A dog-eared romance novel. Takes your mind off things.' });
add({ id: 'comic', name: 'Comic Book', category: 'book', weight: 0.1, stack: 2, useLabel: 'Read', icon: { shape: 'comic' }, book: { panic: -10, boredom: -30, hours: 0.4 }, desc: 'Issue #212 of a superhero series that will never finish.' });
add({ id: 'magazine', name: 'Magazine', category: 'book', weight: 0.15, stack: 2, tags: ['fuel'], burnTime: 4, useLabel: 'Read', icon: { shape: 'magazine' }, book: { panic: -5, boredom: -25, hours: 0.3 }, desc: 'Field & Stream, September issue. Deer season tips.' });
add({ id: 'bible', name: 'Bible', category: 'book', weight: 0.6, stack: 1, useLabel: 'Read', icon: { shape: 'book', color: '#2b2422', decal: 'cross_gold' }, book: { panic: -25, boredom: -10, hours: 1 }, desc: 'A worn King James from First Baptist. Somebody underlined Revelation.' });
add({ id: 'note', name: 'Note', category: 'misc', weight: 0.01, stack: 1, useLabel: 'Read', icon: { shape: 'note' }, data: { noteId: null }, desc: 'A handwritten note.' });
add({ id: 'wallet', name: 'Wallet', category: 'misc', weight: 0.1, stack: 1, icon: { shape: 'wallet' }, desc: 'Driver\'s license, a few bills, a punch card for the diner. A life.' });
add({ id: 'photo', name: 'Family Photo', category: 'misc', weight: 0.01, stack: 1, icon: { shape: 'photo' }, desc: 'A creased photo: smiling family at Lake Millbrook, summer. Someone kept it close.' });
add({ id: 'dog_tags', name: 'Dog Tags', category: 'misc', weight: 0.02, stack: 5, icon: { shape: 'dog_tags' }, desc: 'Stamped steel ID tags on a bead chain. Someone should know.' });
add({ id: 'key_police_armory', name: 'Police Armory Key', category: 'key', weight: 0.01, stack: 1, rarity: 'rare', icon: { shape: 'key', color: '#3a5fa8' }, data: { keyId: 'key_police_armory' }, desc: 'Blue-tagged key: "MPD — ARMORY". Opens the cage at the station.' });
add({ id: 'key_gunstore', name: 'Gun Store Key', category: 'key', weight: 0.01, stack: 1, rarity: 'rare', icon: { shape: 'key', color: '#c8302c' }, data: { keyId: 'key_gunstore' }, desc: 'Red-tagged key: "BACK ROOM". From Hollis Firearms & Tackle.' });
add({ id: 'key_pharmacy', name: 'Pharmacy Key', category: 'key', weight: 0.01, stack: 1, rarity: 'rare', icon: { shape: 'key', color: '#3a9a4a' }, data: { keyId: 'key_pharmacy' }, desc: 'Green-tagged key: "RX STORAGE". Behind the counter is everything.' });
add({ id: 'key_military_armory', name: 'Military Armory Key', category: 'key', weight: 0.01, stack: 1, rarity: 'epic', icon: { shape: 'key', color: '#5d6b3a' }, data: { keyId: 'key_military_armory' }, desc: 'Olive-tagged key: "ARMS ROOM — CO ONLY". Taken off a dead captain.' });

// ---------------------------------------------------------------------------------------------------------
// CLOTHING
// ---------------------------------------------------------------------------------------------------------
const C = (id, name, weight, clothing, icon, desc, o = {}) => add({
  id, name, category: clothing.slot === 'back' ? 'backpack' : 'clothing', weight, stack: 1, durability: o.durability ?? 100,
  tags: o.tags ?? ['fabric'], icon, clothing, desc, ...(o.capacity ? { capacity: o.capacity } : {}),
  ...(o.weightReduction ? { weightReduction: o.weightReduction } : {}), ...(o.rarity ? { rarity: o.rarity } : {}),
});
const HARD = []; // non-fabric
// --- head
C('baseball_cap', 'Baseball Cap', 0.1, CLOTH('head', 0.05, 0.2, 0.02, 0.05), { shape: 'cap', color: '#2f4f8f', color2: '#f3f1ea' }, 'Millbrook Wildcats cap. Keeps the sun and rain out of your eyes.');
C('trucker_hat', 'Trucker Hat', 0.1, CLOTH('head', 0.05, 0.2, 0.02, 0.05), { shape: 'cap', color: '#c8302c', color2: '#f3f1ea' }, '"BLUEGRASS FEED & SEED" mesh-back cap.');
C('police_cap', 'Police Cap', 0.15, CLOTH('head', 0.06, 0.25, 0.03, 0.06), { shape: 'cap', color: '#1f2a44', color2: '#e8c33f' }, 'Navy patrol cap with a gold badge.', { rarity: 'uncommon' });
C('beanie', 'Beanie', 0.08, CLOTH('head', 0.25, 0.1, 0.02, 0.05), { shape: 'beanie', color: '#5a6a4a' }, 'A knit wool watch cap. Your ears thank you.');
C('beanie_orange', 'Blaze Beanie', 0.08, CLOTH('head', 0.25, 0.1, 0.02, 0.05), { shape: 'beanie', color: '#f07a1a' }, 'Hunter-orange knit cap. So the other hunters don\'t shoot you.');
C('cowboy_hat', 'Cowboy Hat', 0.2, CLOTH('head', 0.08, 0.4, 0.02, 0.05), { shape: 'hat_brim', color: '#8a5a2e', color2: '#3a2416' }, 'Felt Stetson-style hat. Kentucky cool.');
C('boonie_hat', 'Boonie Hat', 0.1, CLOTH('head', 0.06, 0.35, 0.02, 0.05), { shape: 'hat_boonie', color: '#6b7a4a' }, 'Wide-brimmed military jungle hat. Camouflage for your head.');
C('bike_helmet', 'Bike Helmet', 0.3, CLOTH('head', 0.05, 0.1, 0.25, 0.3), { shape: 'helmet_bike', color: '#3a9ad8' }, 'A vented cycling helmet. Some protection from teeth.', { tags: [] });
C('motorcycle_helmet', 'Motorcycle Helmet', 1.5, CLOTH('head', 0.2, 0.5, 0.8, 0.8, { noise: 0, hearing: 0.6 }), { shape: 'helmet_moto', color: '#2b2b33', color2: '#5a7a9a' }, 'Full-face DOT helmet. Nothing gets through — including sound.', { tags: [], rarity: 'uncommon', durability: 200 });
C('riot_helmet', 'Riot Helmet', 1.3, CLOTH('head', 0.1, 0.3, 0.7, 0.7, { hearing: 0.8 }), { shape: 'helmet_riot', color: '#1f2228', color2: '#9ab8c8' }, 'Police riot helmet with a face shield. Built for crowds.', { tags: [], rarity: 'rare', durability: 250 });
C('military_helmet', 'Military Helmet', 1.4, CLOTH('head', 0.1, 0.3, 0.6, 0.6), { shape: 'helmet_mil', color: '#5d6b3a', pattern: 'camo', color2: '#7a6a4a', color3: '#3a4228' }, 'Kevlar ACH helmet with a camo cover. Stops more than bites.', { tags: [], rarity: 'rare', durability: 300 });
C('firefighter_helmet', 'Firefighter Helmet', 1.2, CLOTH('head', 0.15, 0.6, 0.6, 0.6), { shape: 'helmet_fire', color: '#e8c030', color2: '#2b2b33' }, 'Traditional leather-look structural helmet. Millbrook FD Engine 2.', { tags: [], rarity: 'uncommon', durability: 250 });
C('hard_hat', 'Hard Hat', 0.4, CLOTH('head', 0.03, 0.4, 0.45, 0.45), { shape: 'hard_hat', color: '#f0c020' }, 'Yellow construction hard hat. Bonk-proof.', { tags: [], durability: 200 });
// --- face
C('bandana', 'Bandana', 0.05, CLOTH('face', 0.05, 0.02, 0.02, 0.05), { shape: 'bandana', color: '#b02a2a', pattern: 'dots', color2: '#f3f1ea' }, 'Paisley bandana tied over the face. Cuts the smell.');
C('surgical_mask', 'Surgical Mask', 0.01, CLOTH('face', 0.01, 0.01, 0.01, 0.02), { shape: 'mask_surgical', color: '#8ac0d8' }, 'Disposable mask. Didn\'t help anyone.', { durability: 30 });
C('gas_mask', 'Gas Mask', 0.8, CLOTH('face', 0.05, 0.1, 0.3, 0.35, { filter: true }), { shape: 'gas_mask', color: '#3a3d33' }, 'M50-style respirator. Smoke, tear gas, and the stench of the dead.', { tags: [], rarity: 'rare', durability: 150 });
C('balaclava', 'Balaclava', 0.1, CLOTH('face', 0.3, 0.05, 0.02, 0.1), { shape: 'balaclava', color: '#2b2b30' }, 'Knit face mask. Warm, and nobody recognises you.');
C('hockey_mask', 'Hockey Mask', 0.4, CLOTH('face', 0.02, 0.0, 0.5, 0.5), { shape: 'hockey_mask', color: '#e8e4d8' }, 'A goalie mask. Classic horror-movie chic, real bite protection.', { tags: [], rarity: 'uncommon', durability: 150 });
// --- torso
C('tshirt', 'White T-Shirt', 0.15, CLOTH('torso', 0.08, 0.02, 0.02, 0.05), { shape: 'tshirt', color: '#e8e6de' }, 'A plain cotton tee.', { durability: 40 });
C('tshirt_black', 'Black T-Shirt', 0.15, CLOTH('torso', 0.08, 0.02, 0.02, 0.05), { shape: 'tshirt', color: '#2b2b30', decal: 'skull' }, 'A faded band tee. The tour dates are all cancelled.', { durability: 40 });
C('tshirt_red', 'Red T-Shirt', 0.15, CLOTH('torso', 0.08, 0.02, 0.02, 0.05), { shape: 'tshirt', color: '#b8302c' }, 'Red cotton tee. Hides bloodstains, sort of.', { durability: 40 });
C('tshirt_blue', 'Wildcats T-Shirt', 0.15, CLOTH('torso', 0.08, 0.02, 0.02, 0.05), { shape: 'tshirt', color: '#2f5fa8', decal: 'stripe_chest' }, 'Millbrook High Wildcats athletics tee.', { durability: 40 });
C('tshirt_green', 'Green T-Shirt', 0.15, CLOTH('torso', 0.08, 0.02, 0.02, 0.05), { shape: 'tshirt', color: '#4a7a3a' }, 'Olive green cotton tee.', { durability: 40 });
C('tshirt_grey', 'Grey T-Shirt', 0.15, CLOTH('torso', 0.08, 0.02, 0.02, 0.05), { shape: 'tshirt', color: '#8a8c90' }, 'Heather grey tee. Comfortable.', { durability: 40 });
C('tank_top', 'Tank Top', 0.1, CLOTH('torso', 0.04, 0.01, 0.01, 0.02), { shape: 'tank_top', color: '#e8e6de' }, 'A ribbed undershirt. Breezy.', { durability: 30 });
C('flannel_shirt', 'Flannel Shirt', 0.3, CLOTH('torso', 0.18, 0.05, 0.05, 0.12), { shape: 'shirt_long', color: '#a82a22', pattern: 'plaid', color2: '#2b1a18' }, 'Red buffalo-check flannel. Practically the county uniform.', { capacity: 1 });
C('flannel_blue', 'Blue Flannel Shirt', 0.3, CLOTH('torso', 0.18, 0.05, 0.05, 0.12), { shape: 'shirt_long', color: '#2f4f8f', pattern: 'plaid', color2: '#1a2238' }, 'Blue plaid flannel, soft from washing.', { capacity: 1 });
C('flannel_green', 'Green Flannel Shirt', 0.3, CLOTH('torso', 0.18, 0.05, 0.05, 0.12), { shape: 'shirt_long', color: '#3d6a3a', pattern: 'plaid', color2: '#1e2a1a' }, 'Green and black hunting flannel.', { capacity: 1 });
C('dress_shirt', 'Dress Shirt', 0.25, CLOTH('torso', 0.12, 0.03, 0.03, 0.08), { shape: 'shirt_collar', color: '#e8ecf4', decal: 'tie' }, 'Button-down office shirt with a loosened tie.', { capacity: 1 });
C('sweater', 'Wool Sweater', 0.5, CLOTH('torso', 0.35, 0.05, 0.06, 0.15), { shape: 'sweater', color: '#7a5a3a' }, 'A chunky knit sweater. Grandma made it.');
C('sweater_green', 'Green Sweater', 0.5, CLOTH('torso', 0.35, 0.05, 0.06, 0.15), { shape: 'sweater', color: '#3d6a4a' }, 'A cable-knit pullover.');
C('thermal_shirt', 'Thermal Shirt', 0.25, CLOTH('torso', 0.3, 0.05, 0.03, 0.08), { shape: 'shirt_long', color: '#d8c8a8', pattern: 'waffle' }, 'Waffle-knit long underwear top. Warm under anything.');
C('police_shirt', 'Police Shirt', 0.3, CLOTH('torso', 0.15, 0.05, 0.05, 0.12), { shape: 'shirt_collar', color: '#2a3a5a', decal: 'badge' }, 'Millbrook PD uniform shirt with a tin star.', { capacity: 2, rarity: 'uncommon' });
C('scrubs_top', 'Scrubs Top', 0.15, CLOTH('torso', 0.08, 0.02, 0.03, 0.05), { shape: 'scrubs', color: '#4a9a9a' }, 'Teal hospital scrubs. Somebody\'s blood on the sleeve.', { capacity: 1 });
C('military_shirt', 'Military Shirt', 0.35, CLOTH('torso', 0.2, 0.1, 0.08, 0.18), { shape: 'shirt_collar', color: '#7a7a5a', pattern: 'camo', color2: '#9a8a6a', color3: '#4a4a3a' }, 'Army combat shirt in OCP camo.', { capacity: 2, rarity: 'uncommon' });
C('hospital_gown', 'Hospital Gown', 0.1, CLOTH('torso', 0.03, 0.0, 0.0, 0.01), { shape: 'gown', color: '#9ac0d8', pattern: 'dots', color2: '#e8f0f4' }, 'Open in the back. Undignified.', { durability: 20 });
C('prison_shirt', 'Prison Shirt', 0.25, CLOTH('torso', 0.1, 0.03, 0.03, 0.08), { shape: 'tshirt', color: '#f07a1a', decal: 'prison' }, 'Hollis County Detention orange. The doors opened on day three.');
C('work_shirt', 'Mechanic Shirt', 0.3, CLOTH('torso', 0.14, 0.05, 0.05, 0.14), { shape: 'shirt_collar', color: '#4a5a6a', decal: 'nametag' }, 'Grease-stained work shirt. The name patch says "Earl".', { capacity: 2 });
// --- jacket
C('hoodie', 'Hoodie', 0.6, CLOTH('jacket', 0.35, 0.1, 0.06, 0.15), { shape: 'hoodie', color: '#7a7c82' }, 'A heather grey pullover hoodie with a kangaroo pocket.', { capacity: 2 });
C('hoodie_black', 'Black Hoodie', 0.6, CLOTH('jacket', 0.35, 0.1, 0.06, 0.15), { shape: 'hoodie', color: '#2b2b30' }, 'Black zip hoodie. Blend into the night.', { capacity: 2 });
C('hoodie_red', 'Wildcats Hoodie', 0.6, CLOTH('jacket', 0.35, 0.1, 0.06, 0.15), { shape: 'hoodie', color: '#2a4a9a', decal: 'letter' }, 'Royal blue Millbrook High hoodie with a big white M. Go Wildcats.', { capacity: 2 });
C('denim_jacket', 'Denim Jacket', 1.0, CLOTH('jacket', 0.25, 0.15, 0.15, 0.35), { shape: 'jacket', color: '#4a6a9a' }, 'Stiff blue denim trucker jacket. Decent scratch protection.', { capacity: 2 });
C('leather_jacket', 'Leather Jacket', 1.6, CLOTH('jacket', 0.35, 0.4, 0.3, 0.5, { noise: 0.05 }), { shape: 'jacket', color: '#2b2422', decal: 'zipper' }, 'Heavy cowhide biker jacket. Teeth slide off it.', { capacity: 3, rarity: 'uncommon', tags: [], durability: 180 });
C('winter_coat', 'Winter Coat', 1.8, CLOTH('jacket', 0.75, 0.5, 0.15, 0.3, { speed: 0.97, noise: 0.05 }), { shape: 'puffer', color: '#3a4a6a' }, 'Down-filled parka with a fur-trimmed hood. Toasty.', { capacity: 4 });
C('puffer_jacket', 'Puffer Jacket', 1.0, CLOTH('jacket', 0.6, 0.4, 0.1, 0.2, { noise: 0.05 }), { shape: 'puffer', color: '#c8302c' }, 'Quilted red puffer. Warm and loud-coloured.', { capacity: 2 });
C('raincoat', 'Raincoat', 0.5, CLOTH('jacket', 0.15, 0.9, 0.05, 0.12, { noise: 0.1 }), { shape: 'coat_long', color: '#e8c030' }, 'Yellow vinyl slicker. Crinkles when you move.', { capacity: 2, tags: [] });
C('windbreaker', 'Windbreaker', 0.35, CLOTH('jacket', 0.12, 0.6, 0.04, 0.1, { noise: 0.08 }), { shape: 'jacket', color: '#3a8a8a', decal: 'stripe_chest' }, 'Light nylon shell. Swishy.', { capacity: 2 });
C('police_jacket', 'Police Jacket', 1.4, CLOTH('jacket', 0.45, 0.5, 0.2, 0.35), { shape: 'jacket', color: '#1f2a44', decal: 'badge' }, 'Insulated duty jacket with "POLICE" across the back.', { capacity: 4, rarity: 'uncommon' });
C('firefighter_jacket', 'Turnout Coat', 3.0, CLOTH('jacket', 0.6, 0.7, 0.5, 0.65, { speed: 0.95, noise: 0.15 }), { shape: 'coat_long', color: '#c8a050', decal: 'reflect' }, 'Fire-resistant turnout coat with reflective bands. Heavy, nearly bite-proof.', { capacity: 4, rarity: 'rare', tags: [], durability: 250 });
C('military_jacket', 'Military Jacket', 1.4, CLOTH('jacket', 0.45, 0.45, 0.25, 0.45), { shape: 'jacket', color: '#6a6a4a', pattern: 'camo', color2: '#8a7a5a', color3: '#3a3a2a' }, 'Field jacket in woodland camo. Rugged.', { capacity: 4, rarity: 'uncommon', durability: 150 });
C('hunting_jacket', 'Hunting Jacket', 1.3, CLOTH('jacket', 0.5, 0.55, 0.15, 0.35), { shape: 'jacket', color: '#6a5a3a', pattern: 'camo', color2: '#3a4a2a', color3: '#9a8a6a' }, 'Insulated tree-bark camo jacket. Deer never saw you coming.', { capacity: 4 });
C('lab_coat', 'Lab Coat', 0.5, CLOTH('jacket', 0.12, 0.05, 0.05, 0.12), { shape: 'coat_long', color: '#ecebe6' }, 'County General lab coat. The ID badge says "Dr. Patel — Infectious Disease".', { capacity: 3 });
C('varsity_jacket', 'Varsity Jacket', 1.1, CLOTH('jacket', 0.3, 0.2, 0.12, 0.3), { shape: 'jacket_varsity', color: '#2a4a9a', color2: '#e8e4d8' }, 'Millbrook Wildcats letterman jacket. Class of \'24.', { capacity: 2 });
C('chore_coat', 'Work Coat', 1.5, CLOTH('jacket', 0.4, 0.35, 0.2, 0.45), { shape: 'jacket', color: '#a8783a', decal: 'collar_dark' }, 'Brown duck-canvas work coat with a corduroy collar. Farm-tough.', { capacity: 4, durability: 160 });
// --- vest
C('tactical_vest', 'Tactical Vest', 2.5, CLOTH('vest', 0.1, 0.1, 0.4, 0.5), { shape: 'vest_tac', color: '#2b2e30' }, 'MOLLE load-bearing vest with soft armour panels and pouches.', { capacity: 8, rarity: 'rare', tags: [], durability: 200 });
C('police_vest', 'Police Vest', 2.8, CLOTH('vest', 0.08, 0.05, 0.5, 0.55), { shape: 'vest', color: '#1f2228', decal: 'police' }, 'Level IIIA ballistic vest. Stops 9mm and most bites to the chest.', { capacity: 3, rarity: 'rare', tags: [], durability: 250 });
C('plate_carrier', 'Plate Carrier', 6.0, CLOTH('vest', 0.1, 0.1, 0.7, 0.7, { speed: 0.94, noise: 0.15 }), { shape: 'vest_tac', color: '#6a6a4a', pattern: 'camo', color2: '#8a7a5a', color3: '#3a3a2a', decal: 'plates' }, 'Army plate carrier with ceramic plates. Heavy as sin, nothing gets in.', { capacity: 6, rarity: 'epic', tags: [], durability: 400 });
C('hunting_vest', 'Hunting Vest', 0.4, CLOTH('vest', 0.1, 0.05, 0.03, 0.08), { shape: 'vest', color: '#f07a1a' }, 'Blaze-orange vest stuffed with shell loops and pockets.', { capacity: 6 });
C('hi_vis_vest', 'Hi-Vis Vest', 0.2, CLOTH('vest', 0.02, 0.02, 0.01, 0.03), { shape: 'vest', color: '#c8e830', decal: 'reflect' }, 'Fluorescent road-crew vest. You will be seen.', { capacity: 2 });
C('chest_rig', 'Chest Rig', 0.9, CLOTH('vest', 0.02, 0.05, 0.05, 0.1), { shape: 'chest_rig', color: '#6b6a4a' }, 'Magazine pouches on a harness. All storage, no armour.', { capacity: 10, rarity: 'rare' });
C('vest_improvised', 'Scrap Armor', 4.5, CLOTH('vest', 0.05, 0.1, 0.45, 0.5, { speed: 0.95, noise: 0.25 }), { shape: 'vest_scrap' }, 'Sheet metal plates duct-taped over rags. Clanks like a bucket.', { capacity: 0, tags: [], durability: 120 });
// --- hands
C('work_gloves', 'Work Gloves', 0.15, CLOTH('hands', 0.1, 0.1, 0.2, 0.4), { shape: 'gloves', color: '#c8a050', color2: '#8a6a3a' }, 'Suede-palm work gloves.');
C('leather_gloves', 'Leather Gloves', 0.2, CLOTH('hands', 0.15, 0.3, 0.3, 0.45), { shape: 'gloves', color: '#3a2a22', color2: '#2b1e18' }, 'Black leather driving gloves.', { tags: [], rarity: 'uncommon' });
C('winter_gloves', 'Winter Gloves', 0.2, CLOTH('hands', 0.35, 0.4, 0.1, 0.2), { shape: 'gloves', color: '#3a4a6a', color2: '#2a3248' }, 'Insulated ski gloves. Clumsy, warm.');
C('tactical_gloves', 'Tactical Gloves', 0.15, CLOTH('hands', 0.12, 0.2, 0.35, 0.5), { shape: 'gloves', color: '#3a3a30', color2: '#5a5a4a' }, 'Knuckle-armoured combat gloves.', { rarity: 'uncommon' });
C('rubber_gloves', 'Rubber Gloves', 0.05, CLOTH('hands', 0.02, 0.9, 0.05, 0.05), { shape: 'gloves', color: '#4a8ad8', color2: '#3a6aa8' }, 'Nitrile exam gloves. Keeps the gore off your hands.', { tags: [], durability: 25 });
// --- legs
C('jeans', 'Jeans', 0.8, CLOTH('legs', 0.15, 0.1, 0.15, 0.35), { shape: 'pants', color: '#3b5a8a' }, 'Blue denim. Tough enough.', { capacity: 4 });
C('jeans_black', 'Black Jeans', 0.8, CLOTH('legs', 0.15, 0.1, 0.15, 0.35), { shape: 'pants', color: '#2b2b33' }, 'Black skinny jeans.', { capacity: 4 });
C('jeans_light', 'Faded Jeans', 0.8, CLOTH('legs', 0.15, 0.1, 0.15, 0.32), { shape: 'pants', color: '#7a9ac0' }, 'Light-wash, ripped at the knee. Ripped further now.', { capacity: 4 });
C('khakis', 'Khaki Pants', 0.6, CLOTH('legs', 0.12, 0.08, 0.08, 0.2), { shape: 'pants', color: '#c8b08a' }, 'Pleated chinos from the office.', { capacity: 4 });
C('cargo_pants', 'Cargo Pants', 0.9, CLOTH('legs', 0.18, 0.15, 0.15, 0.35), { shape: 'pants_cargo', color: '#7a6a4a' }, 'Pockets on pockets.', { capacity: 6 });
C('sweatpants', 'Sweatpants', 0.5, CLOTH('legs', 0.2, 0.05, 0.04, 0.1), { shape: 'sweatpants', color: '#7a7c82' }, 'Comfy grey joggers.', { capacity: 2 });
C('work_pants', 'Work Pants', 1.0, CLOTH('legs', 0.2, 0.2, 0.2, 0.4), { shape: 'pants_cargo', color: '#5a4a32' }, 'Double-knee canvas work pants.', { capacity: 4, durability: 140 });
C('police_pants', 'Police Pants', 0.7, CLOTH('legs', 0.18, 0.15, 0.15, 0.35), { shape: 'pants', color: '#1f2a44', decal: 'stripe_leg' }, 'Navy uniform trousers with a gold stripe.', { capacity: 4, rarity: 'uncommon' });
C('military_pants', 'Military Pants', 0.9, CLOTH('legs', 0.25, 0.3, 0.2, 0.45), { shape: 'pants_cargo', color: '#7a7a5a', pattern: 'camo', color2: '#9a8a6a', color3: '#4a4a3a' }, 'Army combat trousers with knee pads.', { capacity: 6, rarity: 'uncommon', durability: 150 });
C('hunting_pants', 'Hunting Pants', 0.9, CLOTH('legs', 0.3, 0.4, 0.15, 0.4), { shape: 'pants_cargo', color: '#6a5a3a', pattern: 'camo', color2: '#3a4a2a', color3: '#9a8a6a' }, 'Insulated camo bibs.', { capacity: 6 });
C('firefighter_pants', 'Turnout Pants', 2.0, CLOTH('legs', 0.5, 0.7, 0.45, 0.6, { speed: 0.96, noise: 0.1 }), { shape: 'pants', color: '#c8a050', decal: 'reflect_leg' }, 'Bunker gear trousers with suspenders. Hot, heavy, safe.', { capacity: 2, rarity: 'rare', tags: [], durability: 220 });
C('shorts', 'Shorts', 0.3, CLOTH('legs', 0.03, 0.0, 0.01, 0.03), { shape: 'shorts', color: '#c8a87a' }, 'Cargo shorts in October. Bold.', { capacity: 2 });
C('scrubs_pants', 'Scrubs Pants', 0.2, CLOTH('legs', 0.06, 0.02, 0.03, 0.06), { shape: 'pants', color: '#4a9a9a' }, 'Teal drawstring scrubs.', { capacity: 2 });
C('prison_pants', 'Prison Pants', 0.4, CLOTH('legs', 0.1, 0.03, 0.03, 0.08), { shape: 'pants', color: '#f07a1a' }, 'Orange elastic-waist trousers. No pockets, for obvious reasons.');
C('overalls', 'Overalls', 1.1, CLOTH('legs', 0.25, 0.2, 0.2, 0.4), { shape: 'overalls', color: '#3b5a8a' }, 'Denim bib overalls. The farmer\'s tuxedo.', { capacity: 5, durability: 140 });
C('leather_pants', 'Leather Pants', 1.4, CLOTH('legs', 0.3, 0.4, 0.3, 0.5), { shape: 'pants', color: '#2b2422' }, 'Biker leathers. Squeak a little.', { capacity: 2, tags: [], rarity: 'uncommon', durability: 180 });
// --- feet
C('sneakers', 'Sneakers', 0.7, CLOTH('feet', 0.08, 0.1, 0.05, 0.1, { speed: 1.03, noise: -0.08 }), { shape: 'sneakers', color: '#e8e6de', color2: '#c8302c' }, 'Running shoes. Light and quiet.', { tags: [] });
C('sneakers_black', 'Black Sneakers', 0.7, CLOTH('feet', 0.08, 0.1, 0.05, 0.1, { speed: 1.03, noise: -0.08 }), { shape: 'sneakers', color: '#2b2b30', color2: '#e8e6de' }, 'Black canvas high-tops.', { tags: [] });
C('work_boots', 'Work Boots', 1.6, CLOTH('feet', 0.2, 0.5, 0.25, 0.5, { speed: 0.98, noise: 0.12 }), { shape: 'boots', color: '#a8743a' }, 'Steel-toe wheat leather boots. Stomp-ready.', { tags: [], durability: 200 });
C('combat_boots', 'Combat Boots', 1.4, CLOTH('feet', 0.25, 0.6, 0.3, 0.55, { noise: 0.08 }), { shape: 'boots', color: '#8a7a5a' }, 'Coyote tan Army boots. Broken in by someone else.', { tags: [], rarity: 'uncommon', durability: 250 });
C('hiking_boots', 'Hiking Boots', 1.2, CLOTH('feet', 0.25, 0.6, 0.2, 0.45, { speed: 1.02 }), { shape: 'boots_hiking', color: '#6a5a4a', color2: '#c8302c' }, 'Waterproof trail boots with red laces.', { tags: [], durability: 200 });
C('rain_boots', 'Rain Boots', 1.0, CLOTH('feet', 0.15, 1.0, 0.25, 0.3, { speed: 0.95, noise: 0.1 }), { shape: 'boots_rain', color: '#3a6a3a' }, 'Green rubber wellies. Mud is no longer your enemy.', { tags: [] });
C('dress_shoes', 'Dress Shoes', 0.8, CLOTH('feet', 0.05, 0.2, 0.05, 0.1, { speed: 0.97, noise: 0.25 }), { shape: 'shoes', color: '#2b1e18' }, 'Polished oxfords. Click-clack on every floor.', { tags: [] });
C('cowboy_boots', 'Cowboy Boots', 1.4, CLOTH('feet', 0.15, 0.4, 0.25, 0.45, { noise: 0.15 }), { shape: 'boots_cowboy', color: '#8a4a22' }, 'Pointed-toe western boots with stitching.', { tags: [], durability: 200 });
C('firefighter_boots', 'Fire Boots', 2.2, CLOTH('feet', 0.35, 0.9, 0.4, 0.6, { speed: 0.94, noise: 0.15 }), { shape: 'boots_rain', color: '#2b2b30', decal: 'reflect_boot' }, 'Rubber bunker boots with a steel shank.', { tags: [], rarity: 'uncommon', durability: 250 });
C('slippers', 'Slippers', 0.3, CLOTH('feet', 0.1, 0.0, 0.0, 0.02, { speed: 0.95, noise: -0.15 }), { shape: 'slippers', color: '#c87a9a' }, 'Fuzzy pink slippers. Silent, at least.', { durability: 30 });
// --- back
C('backpack_school', 'School Backpack', 0.6, CLOTH('back', 0.02, 0.2, 0, 0), { shape: 'backpack', color: '#b8302c', color2: '#2b2b30' }, 'Canvas bookbag with a keychain still attached.', { capacity: 12, weightReduction: 0.15 });
C('backpack_school_blue', 'Blue Backpack', 0.6, CLOTH('back', 0.02, 0.2, 0, 0), { shape: 'backpack', color: '#2f5fa8', color2: '#2b2b30' }, 'Blue nylon school bag. Somebody\'s homework is still in it.', { capacity: 12, weightReduction: 0.15 });
C('backpack_hiking', 'Hiking Backpack', 1.4, CLOTH('back', 0.02, 0.4, 0, 0, { speed: 0.99 }), { shape: 'backpack_hiking', color: '#3a7a5a', color2: '#e07a2a' }, 'Internal-frame 50 L pack with a hip belt.', { capacity: 20, weightReduction: 0.3, rarity: 'uncommon' });
C('backpack_military', 'Military Rucksack', 2.2, CLOTH('back', 0.02, 0.5, 0, 0, { speed: 0.98 }), { shape: 'backpack_mil', color: '#5d6b3a' }, 'MOLLE assault pack, ALICE-frame large. Built to haul.', { capacity: 28, weightReduction: 0.4, rarity: 'rare' });
C('duffel_bag', 'Duffel Bag', 1.1, CLOTH('back', 0.0, 0.3, 0, 0, { speed: 0.97, noise: 0.05 }), { shape: 'duffel', color: '#2b2b33', color2: '#c8302c' }, 'A gym duffel slung over the shoulder. Awkward but roomy.', { capacity: 16, weightReduction: 0.15 });
C('messenger_bag', 'Messenger Bag', 0.7, CLOTH('back', 0.0, 0.2, 0, 0), { shape: 'messenger', color: '#6a5a3a' }, 'Canvas shoulder bag for a laptop that\'s now a paperweight.', { capacity: 10, weightReduction: 0.15 });
C('medic_bag', 'Medic Bag', 1.0, CLOTH('back', 0.0, 0.3, 0, 0), { shape: 'backpack', color: '#c8302c', color2: '#e8e6de', decal: 'cross_bag' }, 'EMT trauma backpack. Meant for medical supplies, holds anything.', { capacity: 14, weightReduction: 0.25, rarity: 'uncommon' });
C('backpack_improvised', 'Improvised Sack', 0.4, CLOTH('back', 0.0, 0.1, 0, 0), { shape: 'sack' }, 'Rags and rope knotted into a shoulder sack. It holds. For now.', { capacity: 8, weightReduction: 0.1, durability: 60 });

// ---------------------------------------------------------------------------------------------------------
// Build the registry
// ---------------------------------------------------------------------------------------------------------
export const ITEMS = {};
for (const d of LIST) {
  if (ITEMS[d.id]) throw new Error('Duplicate item id ' + d.id);
  d.stack = d.stack || 1;
  d.rarity = d.rarity || 'common';
  d.tags = d.tags || [];
  d.model = d.model || 'generic';
  d.icon = d.icon || { shape: 'box' };
  ITEMS[d.id] = d;
}
void HARD;

const UNKNOWN = { id: 'unknown', name: 'Unknown Item', category: 'misc', weight: 0.1, stack: 1, rarity: 'common', tags: [], model: 'generic', icon: { shape: 'unknown' }, desc: '???' };

export function getItemDef(id) {
  return ITEMS[id] || UNKNOWN;
}

export const ITEM_IDS = Object.keys(ITEMS);

/** true if the item (id, stack or def) has the tag */
export function hasTag(x, tag) {
  const def = typeof x === 'string' ? getItemDef(x) : x && x.tags ? x : getItemDef(x?.id);
  return def.tags.includes(tag);
}

/** all item ids that have a given tag */
export function itemsWithTag(tag) {
  return ITEM_IDS.filter((id) => ITEMS[id].tags.includes(tag));
}

const spoilHours = (def) => def.food?.spoils || def.drink?.spoils || 0;

/**
 * Create a new stack.
 * opts: {count, dur (0..1 condition fraction), ammo (rounds loaded), ammoType, uses, age (game hour created),
 *        data, contents, mode}
 * Liquid containers default to full of their def.data.liquid (empty when the def has no default liquid);
 * pass {uses: 0} for an empty one or {data: {liquid: 'dirty_water'}, uses: 2} etc.
 */
export function createItem(id, opts = {}) {
  const def = getItemDef(id);
  const s = { id, count: Math.max(1, Math.min(Math.round(opts.count ?? 1), def.stack || 1)) };
  if (def.durability) s.dur = Math.max(1, Math.min(def.durability, Math.round(def.durability * (opts.dur ?? 1))));
  if (def.firearm) {
    s.ammo = Math.max(0, Math.min(def.firearm.magSize, Math.round(opts.ammo ?? 0)));
    s.ammoType = opts.ammoType && def.firearm.ammo.includes(opts.ammoType) ? opts.ammoType : def.firearm.ammo[0];
    s.mode = opts.mode && def.firearm.modes.includes(opts.mode) ? opts.mode : def.firearm.modes[0];
  }
  if (def.data || opts.data) s.data = { ...(def.data || {}), ...(opts.data || {}) };
  if (def.liquidContainer) {
    const cap = def.liquidContainer.capacity;
    let liquid = s.data && s.data.liquid !== undefined ? s.data.liquid : null;
    let uses = opts.uses ?? (liquid ? cap : 0);
    uses = Math.max(0, Math.min(cap, Math.round(uses)));
    if (uses <= 0) liquid = null;
    s.uses = uses;
    s.data = { ...(s.data || {}), liquid };
  } else if (def.uses) {
    s.uses = Math.max(0, Math.min(def.uses, Math.round(opts.uses ?? def.uses)));
  }
  if (spoilHours(def)) s.age = opts.age ?? 0;
  if (def.capacity) {
    s.contents = new Array(def.capacity).fill(null);
    if (opts.contents) for (let i = 0; i < Math.min(def.capacity, opts.contents.length); i++) s.contents[i] = opts.contents[i] || null;
  }
  return s;
}

/** Weight of the liquid inside a container stack (kg). */
export function liquidWeight(stack) {
  if (!stack || !stack.uses) return 0;
  const def = getItemDef(stack.id);
  if (!def.liquidContainer) return 0;
  const liq = LIQUIDS[stack.data?.liquid];
  return liq ? liq.unitWeight * stack.uses : 0;
}

/**
 * Total weight of a stack including liquid and container contents (kg).
 * Bags (def.weightReduction) reduce the weight of what they carry.
 */
export function itemWeight(stack) {
  if (!stack) return 0;
  const def = getItemDef(stack.id);
  let w = (def.weight || 0) * (stack.count || 1) + liquidWeight(stack);
  if (stack.contents) {
    let c = 0;
    for (const x of stack.contents) c += itemWeight(x);
    w += c * (1 - (def.weightReduction || 0));
  }
  return w;
}

export function canStack(a, b) {
  if (!a || !b || a.id !== b.id) return false;
  const def = getItemDef(a.id);
  if ((def.stack || 1) <= 1) return false;
  if (a.contents || b.contents) return false;
  if ((a.uses ?? null) !== (b.uses ?? null)) return false;
  if ((a.dur ?? null) !== (b.dur ?? null)) return false;
  if (spoilHours(def) && Math.abs((a.age || 0) - (b.age || 0)) > 48) return false;
  if (a.data || b.data) return JSON.stringify(a.data || {}) === JSON.stringify(b.data || {});
  return true;
}

/** 0..1 freshness (1 fresh, 0 rotten) given current game hour. Non-perishables return 1. */
export function itemFreshness(stack, nowHours) {
  const def = getItemDef(stack.id);
  const sp = spoilHours(def);
  if (!sp) return 1;
  return Math.max(0, Math.min(1, 1 - (nowHours - (stack.age || 0)) / sp));
}

/** 'fresh' | 'stale' | 'rotten' | null (non-perishable) */
export function freshnessState(stack, nowHours) {
  if (!spoilHours(getItemDef(stack.id))) return null;
  const f = itemFreshness(stack, nowHours);
  return f <= 0 ? 'rotten' : f < 0.35 ? 'stale' : 'fresh';
}

/** 0..1 condition (durability fraction) or null if the item has no durability. */
export function itemCondition(stack) {
  const def = getItemDef(stack.id);
  if (!def.durability || stack.dur == null) return null;
  return Math.max(0, Math.min(1, stack.dur / def.durability));
}

/**
 * Display name. Pass nowHours to get "Stale"/"Rotten" prefixes for perishable food.
 * Liquid containers show their content: "Water Bottle (Dirty Water)", "Gas Can (Empty)".
 */
export function itemDisplayName(stack, nowHours) {
  if (!stack) return '';
  const def = getItemDef(stack.id);
  let name = def.name;
  if (def.liquidContainer) {
    const liq = stack.data?.liquid;
    if (!stack.uses || !liq) name += ' (Empty)';
    else if (liq !== def.data?.liquid) name += ' (' + (LIQUIDS[liq]?.name || liq) + ')';
  }
  if (stack.data?.label) name += ' (' + stack.data.label + ')';
  if (nowHours != null) {
    const st = freshnessState(stack, nowHours);
    if (st === 'rotten') name = 'Rotten ' + name;
    else if (st === 'stale') name = 'Stale ' + name;
  }
  return name;
}

/**
 * Effective per-use drink effect of a stack, taking the liquid of liquid containers into account.
 * Returns {thirst, hunger, sickness, alcohol, energy, panic, drinkable} or null if the stack can't be drunk.
 */
export function getDrinkEffect(stack, nowHours) {
  const def = getItemDef(stack.id);
  if (def.liquidContainer) {
    const liq = LIQUIDS[stack.data?.liquid];
    if (!liq || !stack.uses) return null;
    return { thirst: liq.thirst, hunger: 0, sickness: liq.sickness, alcohol: 0, energy: 0, panic: 0, drinkable: liq.drinkable };
  }
  if (!def.drink) return null;
  const d = { ...def.drink, drinkable: true };
  if (nowHours != null && spoilHours(def)) {
    const f = itemFreshness(stack, nowHours);
    if (f <= 0) { d.sickness += 25; d.thirst *= 0.6; d.hunger *= 0.5; } else if (f < 0.35) d.sickness += 6;
  }
  return d;
}

/**
 * Effective food effect of one portion (one use / one item), including spoilage.
 * Returns {hunger, thirst, health, sickness, panic, energy} or null.
 */
export function getFoodEffect(stack, nowHours) {
  const def = getItemDef(stack.id);
  if (!def.food) return null;
  const f = def.food;
  const e = { hunger: f.hunger, thirst: f.thirst, health: f.health, sickness: f.sickness, panic: f.panic, energy: f.energy };
  if (nowHours != null && f.spoils) {
    const fr = itemFreshness(stack, nowHours);
    if (fr <= 0) { e.hunger *= 0.5; e.sickness += 35; e.panic += 10; e.health = Math.min(0, e.health); } else if (fr < 0.35) { e.hunger *= 0.85; e.sickness += 6; }
  }
  return e;
}
