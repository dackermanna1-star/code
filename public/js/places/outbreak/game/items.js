// Everything you can pick up: what it is, how big it is in your pockets
// (grid cells), what it weighs, and what it does - food and drink, medicine,
// guns and their ammunition, magazines and sights, melee weapons, tools, and
// the clothes you carry it all in. Then where it's found: a loot table for
// each kind of place (kitchens, shops, police, the military, bunkers...).
//
// Sizes are in inventory cells. Weights in kilograms. Calibres are shared by
// guns, magazines and boxes of rounds.

/** Calibres: the round's name, the box it comes in. */
export const CALIBRES = {
  '9x18': { name: '9x18mm', box: 20 },
  '9x19': { name: '9x19mm', box: 25 },
  '.50AE': { name: '.50 AE', box: 10 },
  '12ga': { name: '12 gauge buckshot', box: 10 },
  '7.62x39': { name: '7.62x39mm', box: 20 },
  '5.56x45': { name: '5.56x45mm', box: 20 },
  '.308': { name: '.308 Winchester', box: 20 },
};

const I = {};
function def(id, o) { I[id] = { id, w: 1, h: 1, weight: 0.2, stack: 1, ...o }; return I[id]; }

// --- food ------------------------------------------------------------------------------------------------------------------
def('beans', { name: 'Baked Beans', cat: 'food', desc: 'A tin of beans in tomato sauce. Needs opening.', w: 1, h: 2, weight: 0.45, food: { energy: 32, water: 4 }, can: true, shape: 'can', color: '#c8452a', label: 'БОБЫ' });
def('peaches', { name: 'Canned Peaches', cat: 'food', desc: 'Sweet peaches in syrup. Needs opening.', w: 1, h: 2, weight: 0.45, food: { energy: 22, water: 14 }, can: true, shape: 'can', color: '#e8a030', label: 'ПЕРСИКИ' });
def('sardines', { name: 'Sardines', cat: 'food', desc: 'A flat tin of sardines in oil. Needs opening.', w: 2, h: 1, weight: 0.2, food: { energy: 18, water: -2 }, can: true, shape: 'tin', color: '#3a6aa8', label: 'САРДИНЫ' });
def('tushonka', { name: 'Tushonka', cat: 'food', desc: 'Stewed pork, army surplus. Needs opening.', w: 1, h: 2, weight: 0.5, food: { energy: 40, water: 0 }, can: true, shape: 'can', color: '#8a8a7a', label: 'ТУШЁНКА' });
def('spaghetti', { name: 'Canned Spaghetti', cat: 'food', desc: 'Spaghetti in a tin. Needs opening.', w: 1, h: 2, weight: 0.45, food: { energy: 28, water: 6 }, can: true, shape: 'can', color: '#d8b830', label: 'СПАГЕТТИ' });
def('rice', { name: 'Rice', cat: 'food', desc: 'A box of rice. Dry, but filling.', w: 2, h: 2, weight: 0.5, food: { energy: 45, water: -10 }, shape: 'box', color: '#e8e0c8', label: 'РИС' });
def('cereal', { name: 'Cereal', cat: 'food', desc: 'A box of breakfast cereal.', w: 2, h: 3, weight: 0.4, food: { energy: 30, water: -6 }, shape: 'box', color: '#e85a30', label: 'ХЛОПЬЯ' });
def('crackers', { name: 'Crackers', cat: 'food', desc: 'Salty crackers. Make you thirsty.', w: 2, h: 1, weight: 0.2, food: { energy: 16, water: -6 }, shape: 'box', color: '#d8a848', label: 'КРЕКЕР' });
def('chips', { name: 'Potato Chips', cat: 'food', desc: 'A bag of crisps.', w: 2, h: 2, weight: 0.15, food: { energy: 14, water: -5 }, shape: 'bag', color: '#e8c828' });
def('chocolate', { name: 'Chocolate Bar', cat: 'food', desc: 'Quick energy.', w: 1, h: 1, weight: 0.1, food: { energy: 12, water: -1 }, shape: 'bar', color: '#5a3020', label: 'АЛЁНКА' });
def('apple', { name: 'Apple', cat: 'food', desc: 'A little bruised, still good.', w: 1, h: 1, weight: 0.15, food: { energy: 8, water: 8 }, shape: 'fruit', color: '#b8302a' });
def('pear', { name: 'Pear', cat: 'food', desc: 'Juicy.', w: 1, h: 1, weight: 0.15, food: { energy: 8, water: 10 }, shape: 'fruit', color: '#b8c040' });
def('rottenApple', { name: 'Rotten Apple', cat: 'food', desc: 'Brown and soft. Eating it is a gamble.', w: 1, h: 1, weight: 0.12, food: { energy: 4, water: 4, sick: 0.6 }, shape: 'fruit', color: '#6a5020' });
def('mre', { name: 'Field Ration', cat: 'food', desc: 'A military meal in a pouch. Everything you need.', w: 2, h: 2, weight: 0.6, food: { energy: 65, water: 15 }, shape: 'pouch', color: '#6a6a4a', label: 'ИРП' });
def('bread', { name: 'Stale Bread', cat: 'food', desc: 'Hard as a brick. Edible.', w: 2, h: 1, weight: 0.3, food: { energy: 20, water: -8 }, shape: 'loaf', color: '#b8885a' });
def('honey', { name: 'Jar of Honey', cat: 'food', desc: 'Honey keeps forever.', w: 1, h: 1, weight: 0.4, food: { energy: 25, water: 0 }, shape: 'jar', color: '#d89a28' });
def('pickles', { name: 'Pickled Cucumbers', cat: 'food', desc: 'A big jar of pickles.', w: 1, h: 2, weight: 0.8, food: { energy: 10, water: 12 }, shape: 'jar', color: '#6a8a3a' });

// --- drink -----------------------------------------------------------------------------------------------------------------
def('water', { name: 'Water Bottle', cat: 'drink', desc: 'A plastic bottle. Can be refilled at a well or pump.', w: 1, h: 2, weight: 1.0, drink: { water: 50, energy: 0 }, refill: true, uses: 3, shape: 'bottle', color: '#8ab8d8' });
def('canteen', { name: 'Canteen', cat: 'drink', desc: 'An army canteen. Holds a lot; refill at a well.', w: 2, h: 2, weight: 1.3, drink: { water: 50 }, refill: true, uses: 5, shape: 'canteen', color: '#5a6a4a' });
def('soda', { name: 'Kvass', cat: 'drink', desc: 'A can of kvass. Sweet, a little sour.', w: 1, h: 1, weight: 0.35, drink: { water: 30, energy: 8 }, shape: 'soda', color: '#a86a2a', label: 'КВАС' });
def('cola', { name: 'Cola', cat: 'drink', desc: 'Warm and flat. Still a drink.', w: 1, h: 1, weight: 0.35, drink: { water: 30, energy: 10 }, shape: 'soda', color: '#c82a2a' });
def('milk', { name: 'Powdered Milk', cat: 'food', desc: 'Mix it with your spit.', w: 1, h: 2, weight: 0.4, food: { energy: 22, water: -4 }, shape: 'box', color: '#e8eef4', label: 'МОЛОКО' });
def('vodka', { name: 'Vodka', cat: 'drink', desc: 'Kills germs. Also disinfects.', w: 1, h: 2, weight: 0.8, drink: { water: 10, energy: 4 }, disinfect: true, shape: 'bottle', color: '#d8e8f0', label: 'ВОДКА' });
def('purify', { name: 'Purification Tablets', cat: 'medical', desc: 'Makes pond water safe. Use on a bottle.', w: 1, h: 1, weight: 0.05, uses: 10, med: { purify: true }, shape: 'pills', color: '#e8e8e8' });

// --- medical ---------------------------------------------------------------------------------------------------------------
def('bandage', { name: 'Bandage', cat: 'medical', desc: 'Stops a wound bleeding.', w: 1, h: 1, weight: 0.05, stack: 4, med: { bandage: true }, useTime: 3.5, shape: 'roll', color: '#f0ece0' });
def('rag', { name: 'Rags', cat: 'medical', desc: 'Torn cloth. Stops bleeding, but slowly - and might be dirty.', w: 1, h: 1, weight: 0.05, stack: 6, med: { bandage: true, dirty: 0.12 }, useTime: 6, shape: 'rag', color: '#b8a888' });
def('firstaid', { name: 'First Aid Kit', cat: 'medical', desc: 'Stops all bleeding and patches you up.', w: 2, h: 2, weight: 0.6, med: { bandage: true, all: true, health: 25 }, useTime: 6, shape: 'medkit', color: '#c8302a' });
def('painkillers', { name: 'Painkillers', cat: 'medical', desc: 'Steadies your hands when you’re hurting.', w: 1, h: 1, weight: 0.05, uses: 6, med: { pain: 120 }, useTime: 1.5, shape: 'pills', color: '#e8e0d0' });
def('morphine', { name: 'Morphine Autoinjector', cat: 'medical', desc: 'Lets you walk on a broken leg (for a while).', w: 1, h: 1, weight: 0.05, med: { morphine: 300, pain: 300 }, useTime: 2, shape: 'injector', color: '#d8d8d0' });
def('splint', { name: 'Splint', cat: 'medical', desc: 'Sets a broken leg so it can heal.', w: 1, h: 3, weight: 0.3, med: { splint: true }, useTime: 8, shape: 'splint', color: '#a88a5a' });
def('antibiotics', { name: 'Antibiotics', cat: 'medical', desc: 'Cures infection and sickness.', w: 1, h: 1, weight: 0.05, uses: 4, med: { cure: true }, useTime: 1.5, shape: 'pills', color: '#e8c838' });
def('charcoal', { name: 'Charcoal Tablets', cat: 'medical', desc: 'Settles a poisoned stomach.', w: 1, h: 1, weight: 0.05, uses: 6, med: { cureFood: true }, useTime: 1.5, shape: 'pills', color: '#2a2a2a' });
def('vitamins', { name: 'Vitamins', cat: 'medical', desc: 'Helps you fight off sickness.', w: 1, h: 1, weight: 0.05, uses: 6, med: { vitamins: 300 }, useTime: 1.5, shape: 'pills', color: '#e88a38' });
def('saline', { name: 'Saline Bag', cat: 'medical', desc: 'Puts back some of the blood you’ve lost.', w: 1, h: 2, weight: 0.5, med: { blood: 35 }, useTime: 8, shape: 'ivbag', color: '#c8d8e8' });
def('disinfect', { name: 'Disinfectant Spray', cat: 'medical', desc: 'Clean a wound before you dress it.', w: 1, h: 2, weight: 0.3, uses: 5, med: { disinfect: true }, useTime: 2, shape: 'spray', color: '#3a8ac8' });

// --- guns ------------------------------------------------------------------------------------------------------------------
// gun: the model/stat id from the shooter's arsenal; cal: calibre; mag: the magazine item it takes (or internal: rounds held).
def('makarov', { name: 'Makarov PM', cat: 'weapon', desc: 'The police pistol. 9x18mm, 8-round magazine.', w: 2, h: 2, weight: 0.73, gun: 'glock', model: 'makarov', cal: '9x18', mag: 'magMakarov', pistol: true, dmg: 24, rpm: 360, spread: [2.4, 0.6], recoil: 1.3, vel: 1050, sound: 'pistol', noise: 120, attach: ['suppressor'], tint: 0x2a2c30 });
def('glock', { name: 'Glock 17', cat: 'weapon', desc: '9x19mm, 17-round magazine.', w: 2, h: 2, weight: 0.71, gun: 'glock', cal: '9x19', mag: 'magGlock', pistol: true, dmg: 26, rpm: 420, spread: [2.2, 0.5], recoil: 1.2, vel: 1150, sound: 'pistol', noise: 120, attach: ['suppressor', 'laser'] });
def('deagle', { name: 'Desert Eagle', cat: 'weapon', desc: 'Huge, loud, devastating. .50 AE, 7 rounds.', w: 3, h: 2, weight: 2.0, gun: 'deagle', cal: '.50AE', mag: 'magDeagle', pistol: true, dmg: 62, rpm: 220, spread: [3, 0.6], recoil: 4.5, vel: 1400, sound: 'magnum', noise: 190, attach: ['laser'] });
def('mp5', { name: 'MP5', cat: 'weapon', desc: 'A compact 9x19mm submachine gun.', w: 5, h: 3, weight: 2.5, gun: 'mp5', cal: '9x19', mag: 'magMP5', auto: true, dmg: 22, rpm: 780, spread: [3, 0.8], recoil: 0.9, vel: 1300, sound: 'smg', noise: 150, attach: ['reddot', 'holo', 'suppressor', 'laser'] });
def('remington', { name: 'Remington 870', cat: 'weapon', desc: 'Pump-action 12 gauge. Six shells in the tube.', w: 7, h: 2, weight: 3.6, gun: 'remington', cal: '12ga', internal: 6, pump: true, pellets: 9, dmg: 15, rpm: 70, spread: [6, 4.2], recoil: 6, vel: 1250, sound: 'shotgun', noise: 220, attach: ['reddot'] });
def('akm', { name: 'AKM', cat: 'weapon', desc: '7.62x39mm assault rifle. Robust and loud.', w: 8, h: 3, weight: 3.3, gun: 'ak47', cal: '7.62x39', mag: 'magAK', auto: true, dmg: 34, rpm: 600, spread: [3.6, 0.6], recoil: 2.0, vel: 2300, sound: 'ak', noise: 260, attach: ['suppressor', 'laser'] });
def('m4', { name: 'M4A1', cat: 'weapon', desc: '5.56x45mm carbine. Accurate and controllable.', w: 8, h: 3, weight: 3.0, gun: 'm4', cal: '5.56x45', mag: 'magSTANAG', auto: true, dmg: 30, rpm: 750, spread: [3.2, 0.4], recoil: 1.4, vel: 2900, sound: 'rifle', noise: 250, attach: ['reddot', 'holo', 'acog', 'suppressor', 'foregrip', 'laser'] });
def('m249', { name: 'M249', cat: 'weapon', desc: 'A light machine gun. Belt box of 100.', w: 9, h: 3, weight: 7.5, gun: 'm249', cal: '5.56x45', mag: 'boxM249', auto: true, dmg: 30, rpm: 750, spread: [5, 1.1], recoil: 1.3, vel: 2900, sound: 'rifle', noise: 270, attach: ['reddot', 'holo', 'acog'] });
def('m24', { name: 'M24 Rifle', cat: 'weapon', desc: 'Bolt-action .308 with a scope. Five rounds.', w: 9, h: 3, weight: 5.4, gun: 'm24', cal: '.308', internal: 5, bolt: true, dmg: 110, headMult: 2.2, rpm: 45, spread: [8, 0.0], recoil: 7, vel: 2600, sound: 'sniper', noise: 300, attach: ['suppressor'], scope: true });

// --- ammunition and magazines ---------------------------------------------------------------------------------------------
for (const [cal, c] of Object.entries(CALIBRES)) {
  const id = 'ammo' + cal.replace(/[^0-9a-z]/gi, '');
  def(id, { name: c.name + ' Rounds', cat: 'ammo', desc: `Loose ${c.name} rounds. Load them into a magazine or straight into the gun.`, w: cal === '12ga' || cal === '.308' ? 2 : 1, h: 1, weight: 0.015, stack: c.box * 3, ammo: cal, shape: 'ammobox', color: cal === '12ga' ? '#b82a20' : cal === '.308' ? '#4a5a3a' : '#c8a040' });
  CALIBRES[cal].item = id;
}
def('magMakarov', { name: 'Makarov Magazine', cat: 'mag', desc: '8 rounds of 9x18mm.', w: 1, h: 1, weight: 0.09, magOf: '9x18', cap: 8, shape: 'mag', color: '#2a2c30' });
def('magGlock', { name: 'Glock Magazine', cat: 'mag', desc: '17 rounds of 9x19mm.', w: 1, h: 2, weight: 0.1, magOf: '9x19', cap: 17, shape: 'mag', color: '#2a2a2a' });
def('magDeagle', { name: 'Desert Eagle Magazine', cat: 'mag', desc: '7 rounds of .50 AE.', w: 1, h: 2, weight: 0.16, magOf: '.50AE', cap: 7, shape: 'mag', color: '#8a8a8a' });
def('magMP5', { name: 'MP5 Magazine', cat: 'mag', desc: '30 rounds of 9x19mm.', w: 1, h: 2, weight: 0.13, magOf: '9x19', cap: 30, shape: 'magCurved', color: '#2a2a2a' });
def('magAK', { name: 'AK Magazine', cat: 'mag', desc: '30 rounds of 7.62x39mm.', w: 1, h: 3, weight: 0.33, magOf: '7.62x39', cap: 30, shape: 'magCurved', color: '#8a4a2a' });
def('magSTANAG', { name: 'STANAG Magazine', cat: 'mag', desc: '30 rounds of 5.56x45mm.', w: 1, h: 3, weight: 0.12, magOf: '5.56x45', cap: 30, shape: 'mag', color: '#3a3a36' });
def('boxM249', { name: 'M249 Ammo Box', cat: 'mag', desc: 'A 100-round belt of 5.56x45mm.', w: 2, h: 2, weight: 0.6, magOf: '5.56x45', cap: 100, shape: 'ammocan', color: '#4a5a3a' });

// --- attachments -----------------------------------------------------------------------------------------------------------
def('reddot', { name: 'Red Dot Sight', cat: 'attachment', desc: 'A clean red dot. Faster aiming.', w: 2, h: 1, weight: 0.2, attach: 'reddot', shape: 'optic', color: '#2a2a2a' });
def('holo', { name: 'Holographic Sight', cat: 'attachment', desc: 'A wide window and a ring reticle.', w: 2, h: 1, weight: 0.3, attach: 'holo', shape: 'optic', color: '#3a3a3a' });
def('acog', { name: 'ACOG 4x Scope', cat: 'attachment', desc: 'A 4x magnified scope for long range.', w: 2, h: 1, weight: 0.4, attach: 'acog', shape: 'scope', color: '#4a4a40' });
def('suppressor', { name: 'Suppressor', cat: 'attachment', desc: 'Quieter shots - the infected won’t hear you from so far.', w: 2, h: 1, weight: 0.4, attach: 'suppressor', shape: 'tube', color: '#2a2a2a' });
def('foregrip', { name: 'Vertical Foregrip', cat: 'attachment', desc: 'Less vertical recoil.', w: 1, h: 2, weight: 0.15, attach: 'foregrip', shape: 'grip', color: '#3a3a3a' });
def('laser', { name: 'Laser Module', cat: 'attachment', desc: 'Tighter hip-fire.', w: 1, h: 1, weight: 0.1, attach: 'laser', shape: 'box', color: '#2a2a2a' });

// --- melee -----------------------------------------------------------------------------------------------------------------
// dmg: a light swing; heavy: a held swing; reach: studs; speed: swings a second; cost: stamina for a heavy swing.
def('kitchenKnife', { name: 'Kitchen Knife', cat: 'melee', desc: 'Stab. Opens tins, cuts rags.', w: 1, h: 2, weight: 0.2, melee: { dmg: 22, heavy: 40, reach: 3.6, speed: 2.4, cost: 12, kind: 'stab' }, knife: true, shape: 'knife', color: '#b8bcc0' });
def('huntingKnife', { name: 'Hunting Knife', cat: 'melee', desc: 'A proper knife.', w: 1, h: 2, weight: 0.3, melee: { dmg: 28, heavy: 50, reach: 3.8, speed: 2.2, cost: 12, kind: 'stab' }, knife: true, shape: 'knife', color: '#6a4a30' });
def('screwdriver', { name: 'Screwdriver', cat: 'melee', desc: 'Better than nothing. Opens tins, badly.', w: 1, h: 2, weight: 0.15, melee: { dmg: 16, heavy: 30, reach: 3.4, speed: 2.4, cost: 10, kind: 'stab' }, opener: 0.6, shape: 'screwdriver', color: '#d8a828' });
def('pipe', { name: 'Lead Pipe', cat: 'melee', desc: 'Heavy and blunt.', w: 1, h: 4, weight: 1.6, melee: { dmg: 30, heavy: 58, reach: 4.6, speed: 1.5, cost: 18, kind: 'blunt' }, shape: 'pipe', color: '#6a6a66', long: true });
def('bat', { name: 'Baseball Bat', cat: 'melee', desc: 'A good swing.', w: 1, h: 5, weight: 1.0, melee: { dmg: 32, heavy: 62, reach: 5.0, speed: 1.6, cost: 18, kind: 'blunt' }, shape: 'bat', color: '#c8a070', long: true });
def('crowbar', { name: 'Crowbar', cat: 'melee', desc: 'Prises things open. Breaks heads.', w: 1, h: 4, weight: 1.4, melee: { dmg: 34, heavy: 64, reach: 4.8, speed: 1.6, cost: 18, kind: 'blunt' }, shape: 'crowbar', color: '#a82a2a', long: true });
def('hatchet', { name: 'Hatchet', cat: 'melee', desc: 'A small axe.', w: 2, h: 3, weight: 0.9, melee: { dmg: 38, heavy: 70, reach: 4.2, speed: 1.7, cost: 18, kind: 'chop' }, shape: 'hatchet', color: '#8a6a4a' });
def('machete', { name: 'Machete', cat: 'melee', desc: 'Long, sharp, fast.', w: 1, h: 4, weight: 0.8, melee: { dmg: 40, heavy: 72, reach: 5.0, speed: 1.9, cost: 16, kind: 'chop' }, knife: true, shape: 'machete', color: '#9aa0a4', long: true });
def('fireaxe', { name: 'Fire Axe', cat: 'melee', desc: 'Splits a skull in one.', w: 2, h: 6, weight: 2.4, melee: { dmg: 55, heavy: 110, reach: 5.6, speed: 1.1, cost: 26, kind: 'chop' }, shape: 'axe', color: '#c8302a', long: true });
def('sledge', { name: 'Sledgehammer', cat: 'melee', desc: 'Slow. Final.', w: 2, h: 6, weight: 5, melee: { dmg: 60, heavy: 125, reach: 5.6, speed: 0.85, cost: 32, kind: 'blunt' }, shape: 'sledge', color: '#4a4a4a', long: true });
def('shovel', { name: 'Shovel', cat: 'melee', desc: 'For digging. And not just digging.', w: 2, h: 6, weight: 1.8, melee: { dmg: 36, heavy: 70, reach: 5.6, speed: 1.3, cost: 22, kind: 'blunt' }, shape: 'shovel', color: '#5a6a5a', long: true });

// --- tools -----------------------------------------------------------------------------------------------------------------
def('opener', { name: 'Can Opener', cat: 'tool', desc: 'Opens tins properly.', w: 1, h: 1, weight: 0.1, opener: 1, shape: 'opener', color: '#b8bcc0' });
def('flashlight', { name: 'Flashlight', cat: 'tool', desc: 'Lights the way. Needs a battery. Use (or press L) to switch it on.', w: 1, h: 2, weight: 0.3, light: true, battery: 1, shape: 'torch', color: '#3a3a3a' });
def('headtorch', { name: 'Head Torch', cat: 'clothing', desc: 'A torch on your forehead. Leaves your hands free.', w: 1, h: 1, weight: 0.15, light: true, battery: 1, wear: { slot: 'head', warmth: 0 }, shape: 'headtorch', color: '#c83a2a' });
def('battery', { name: '9V Battery', cat: 'tool', desc: 'Powers a light for about an hour.', w: 1, h: 1, weight: 0.05, stack: 4, battery: true, shape: 'battery', color: '#c8a038' });
def('map', { name: 'Map of South Karevia', cat: 'tool', desc: 'Shows where you are (M).', w: 1, h: 2, weight: 0.1, map: true, shape: 'mapitem', color: '#d8d0b0' });
def('compass', { name: 'Compass', cat: 'tool', desc: 'Shows your heading at the top of the screen.', w: 1, h: 1, weight: 0.05, compass: true, shape: 'compass', color: '#3a5a3a' });
def('binoculars', { name: 'Binoculars', cat: 'tool', desc: 'Look a long way. Hold right mouse with them in your hands.', w: 2, h: 1, weight: 0.5, zoom: 4, shape: 'binoculars', color: '#2a2a2a' });
def('tape', { name: 'Duct Tape', cat: 'tool', desc: 'Repairs a worn item one step.', w: 1, h: 1, weight: 0.2, uses: 3, repair: true, shape: 'tape', color: '#8a8a8a' });
def('sewing', { name: 'Sewing Kit', cat: 'tool', desc: 'Mends clothes.', w: 1, h: 1, weight: 0.1, uses: 4, repairCloth: true, shape: 'box', color: '#c8a0a0' });
def('matches', { name: 'Matches', cat: 'tool', desc: 'Not much to burn round here.', w: 1, h: 1, weight: 0.02, shape: 'box', color: '#c8302a' });
def('flare', { name: 'Road Flare', cat: 'tool', desc: 'Burns red for a few minutes. Draws attention.', w: 1, h: 2, weight: 0.2, flare: true, shape: 'flare', color: '#c82a20' });
def('nails', { name: 'Box of Nails', cat: 'misc', desc: 'Useless, mostly.', w: 1, h: 1, weight: 0.4, shape: 'box', color: '#8a8a8a' });
def('book', { name: 'Book', cat: 'misc', desc: 'Something to read when it’s all over.', w: 2, h: 2, weight: 0.4, shape: 'book', color: '#6a3a2a' });
def('radio', { name: 'Handheld Radio', cat: 'misc', desc: 'Only static.', w: 1, h: 2, weight: 0.4, shape: 'radio', color: '#2a2a2a' });

// --- clothes ---------------------------------------------------------------------------------------------------------------
// wear.slot: head | torso | vest | legs | back; cargo: its pockets [w, h]; warmth: 0..1; armor: 0..1 (fraction of damage taken off).
const CLOTH = (id, o) => def(id, { cat: 'clothing', weight: 0.5, ...o });
CLOTH('tshirt', { name: 'T-Shirt', desc: 'A thin shirt with no pockets to speak of.', w: 2, h: 2, wear: { slot: 'torso', cargo: [2, 2], warmth: 0.1 }, shape: 'shirt', color: '#d8d0b8', tints: ['#d8d0b8', '#3a5a8a', '#8a2a2a', '#2a2a2a', '#5a7a4a'] });
CLOTH('flannel', { name: 'Flannel Shirt', desc: 'Warm enough. Two pockets.', w: 3, h: 2, wear: { slot: 'torso', cargo: [3, 2], warmth: 0.3 }, shape: 'shirt', color: '#a83a2a', tints: ['#a83a2a', '#3a5a8a', '#4a6a3a'] });
CLOTH('hoodie', { name: 'Hoodie', desc: 'A big front pocket.', w: 3, h: 3, wear: { slot: 'torso', cargo: [4, 2], warmth: 0.4 }, shape: 'shirt', color: '#5a5a62', tints: ['#5a5a62', '#2a2a2a', '#7a3a4a', '#3a4a6a'] });
CLOTH('tracktop', { name: 'Tracksuit Jacket', desc: 'Three stripes. Very Eastern European.', w: 3, h: 2, wear: { slot: 'torso', cargo: [3, 3], warmth: 0.3 }, shape: 'shirt', color: '#2a3a8a', tints: ['#2a3a8a', '#2a2a2a', '#8a2a2a'] });
CLOTH('raincoat', { name: 'Raincoat', desc: 'Keeps the rain off.', w: 3, h: 3, wear: { slot: 'torso', cargo: [4, 3], warmth: 0.35, waterproof: 0.9 }, shape: 'coat', color: '#d8b828', tints: ['#d8b828', '#2a5a2a', '#8a2a2a'] });
CLOTH('policeJacket', { name: 'Police Jacket', desc: 'Blue, with lots of pockets.', w: 3, h: 3, wear: { slot: 'torso', cargo: [4, 4], warmth: 0.45, armor: 0.05 }, shape: 'coat', color: '#2a3a5a' });
CLOTH('milJacket', { name: 'Military Jacket', desc: 'Woodland camouflage. Warm, roomy.', w: 3, h: 3, wear: { slot: 'torso', cargo: [5, 4], warmth: 0.55, armor: 0.05 }, shape: 'coat', color: '#5a6a3a', camo: true });
CLOTH('jeans', { name: 'Jeans', desc: 'Four pockets.', w: 2, h: 3, wear: { slot: 'legs', cargo: [2, 3], warmth: 0.2 }, shape: 'pants', color: '#3a4a6a' });
CLOTH('trackpants', { name: 'Tracksuit Trousers', desc: 'Matching the jacket.', w: 2, h: 3, wear: { slot: 'legs', cargo: [3, 2], warmth: 0.2 }, shape: 'pants', color: '#2a3a8a', tints: ['#2a3a8a', '#2a2a2a'] });
CLOTH('cargo', { name: 'Cargo Trousers', desc: 'Lots of pockets.', w: 2, h: 3, wear: { slot: 'legs', cargo: [4, 3], warmth: 0.3 }, shape: 'pants', color: '#6a6a4a', tints: ['#6a6a4a', '#4a4a4a', '#5a4a3a'] });
CLOTH('milPants', { name: 'Military Trousers', desc: 'Woodland camouflage.', w: 2, h: 3, wear: { slot: 'legs', cargo: [4, 4], warmth: 0.35 }, shape: 'pants', color: '#5a6a3a', camo: true });
CLOTH('beanie', { name: 'Beanie', desc: 'Warm head.', w: 1, h: 1, wear: { slot: 'head', warmth: 0.25 }, shape: 'beanie', color: '#3a3a3a', tints: ['#3a3a3a', '#8a2a2a', '#2a4a7a'] });
CLOTH('cap', { name: 'Baseball Cap', desc: 'Keeps the sun out of your eyes.', w: 1, h: 1, wear: { slot: 'head', warmth: 0.05 }, shape: 'cap', color: '#2a4a7a', tints: ['#2a4a7a', '#8a2a2a', '#2a2a2a'] });
CLOTH('ushanka', { name: 'Ushanka', desc: 'A fur hat with ear flaps.', w: 2, h: 2, wear: { slot: 'head', warmth: 0.5 }, shape: 'ushanka', color: '#5a4a3a' });
CLOTH('policeCap', { name: 'Police Cap', desc: 'Official.', w: 2, h: 1, wear: { slot: 'head', warmth: 0.05 }, shape: 'cap', color: '#2a3a5a' });
CLOTH('helmet', { name: 'Military Helmet', desc: 'Stops a bullet. Probably.', w: 2, h: 2, weight: 1.4, wear: { slot: 'head', warmth: 0.05, armor: 0.5, helmet: true }, shape: 'helmet', color: '#4a5a3a' });
CLOTH('policeVest', { name: 'Police Vest', desc: 'Soft armour. Takes the edge off a pistol round.', w: 3, h: 3, weight: 2.5, wear: { slot: 'vest', cargo: [2, 2], warmth: 0.1, armor: 0.3 }, shape: 'vest', color: '#2a2a3a' });
CLOTH('plateCarrier', { name: 'Plate Carrier', desc: 'Ceramic plates. Stops rifle rounds.', w: 3, h: 3, weight: 6, wear: { slot: 'vest', cargo: [3, 2], warmth: 0.1, armor: 0.55 }, shape: 'vest', color: '#5a6a3a' });
CLOTH('chestRig', { name: 'Chest Rig', desc: 'Magazine pouches, no armour.', w: 3, h: 2, weight: 0.8, wear: { slot: 'vest', cargo: [4, 3], warmth: 0.05 }, shape: 'vest', color: '#4a4a3a' });
CLOTH('schoolBag', { name: 'School Backpack', desc: 'A kid’s backpack.', w: 3, h: 3, weight: 0.4, wear: { slot: 'back', cargo: [4, 4] }, shape: 'pack', color: '#c83a5a', tints: ['#c83a5a', '#3a6ac8', '#3a8a5a'] });
CLOTH('huntingPack', { name: 'Hunting Backpack', desc: 'A good size.', w: 4, h: 4, weight: 0.9, wear: { slot: 'back', cargo: [6, 5] }, shape: 'pack', color: '#5a5a3a' });
CLOTH('milPack', { name: 'Military Backpack', desc: 'Huge.', w: 4, h: 4, weight: 1.4, wear: { slot: 'back', cargo: [7, 6] }, shape: 'pack', color: '#4a5a3a', camo: true });
CLOTH('mountainPack', { name: 'Mountain Backpack', desc: 'Enormous. For the long haul.', w: 5, h: 4, weight: 1.6, wear: { slot: 'back', cargo: [7, 7] }, shape: 'pack', color: '#c86a2a', tints: ['#c86a2a', '#2a5a8a'] });

export const ITEMS = I;

// --- loot tables ------------------------------------------------------------------------------------------------------------
// [item id, weight]; 'nothing' leaves the spot empty.
const T = (...pairs) => pairs;
export const LOOT = {
  home: T(['nothing', 30], ['beans', 4], ['peaches', 3], ['sardines', 3], ['spaghetti', 3], ['rice', 2], ['cereal', 2], ['crackers', 2], ['chocolate', 2], ['apple', 3], ['rottenApple', 3], ['bread', 2], ['honey', 1], ['pickles', 2], ['water', 4], ['soda', 3], ['cola', 2], ['vodka', 2], ['bandage', 3], ['rag', 4], ['painkillers', 2], ['vitamins', 2], ['kitchenKnife', 2], ['screwdriver', 2], ['opener', 2], ['flashlight', 2], ['battery', 3], ['matches', 2], ['book', 2], ['tshirt', 3], ['flannel', 2], ['hoodie', 2], ['jeans', 3], ['trackpants', 2], ['tracktop', 2], ['beanie', 2], ['cap', 2], ['schoolBag', 1], ['makarov', 0.4], ['ammo9x18', 1.2], ['magMakarov', 0.6], ['map', 0.6], ['compass', 0.4], ['tape', 1]),
  kitchen: T(['nothing', 25], ['beans', 6], ['peaches', 5], ['sardines', 4], ['tushonka', 2], ['spaghetti', 5], ['rice', 4], ['cereal', 3], ['crackers', 3], ['bread', 3], ['honey', 2], ['pickles', 3], ['milk', 2], ['water', 4], ['soda', 3], ['vodka', 2], ['kitchenKnife', 4], ['opener', 4], ['matches', 2]),
  food: T(['nothing', 20], ['beans', 5], ['peaches', 4], ['sardines', 4], ['tushonka', 2], ['spaghetti', 4], ['apple', 3], ['pear', 3], ['rottenApple', 3], ['chocolate', 3], ['soda', 3], ['water', 3], ['milk', 2], ['pickles', 2], ['honey', 1]),
  clothes: T(['nothing', 25], ['tshirt', 5], ['flannel', 4], ['hoodie', 4], ['tracktop', 3], ['raincoat', 2], ['jeans', 5], ['trackpants', 3], ['cargo', 2], ['beanie', 3], ['cap', 3], ['ushanka', 1], ['schoolBag', 2], ['huntingPack', 0.6], ['rag', 2]),
  shop: T(['nothing', 18], ['beans', 4], ['peaches', 4], ['sardines', 3], ['spaghetti', 3], ['rice', 3], ['cereal', 3], ['crackers', 3], ['chips', 4], ['chocolate', 4], ['soda', 5], ['cola', 4], ['water', 5], ['milk', 2], ['vodka', 2], ['battery', 3], ['matches', 2], ['opener', 2], ['flashlight', 1], ['tape', 1], ['map', 1], ['purify', 1]),
  medical: T(['nothing', 18], ['bandage', 8], ['firstaid', 2], ['painkillers', 5], ['morphine', 1.5], ['splint', 2], ['antibiotics', 3], ['charcoal', 4], ['vitamins', 4], ['saline', 2], ['disinfect', 4], ['purify', 3], ['rag', 2]),
  police: T(['nothing', 18], ['makarov', 4], ['glock', 2], ['ammo9x18', 6], ['ammo9x19', 4], ['magMakarov', 4], ['magGlock', 2], ['remington', 1.2], ['ammo12ga', 2.5], ['policeVest', 1.5], ['policeJacket', 2], ['policeCap', 2], ['flashlight', 3], ['battery', 3], ['bandage', 3], ['handcuffs', 0], ['radio', 2], ['mp5', 0.4], ['magMP5', 0.6], ['suppressor', 0.3], ['map', 1]),
  military: T(['nothing', 18], ['akm', 2.5], ['m4', 1], ['magAK', 4], ['magSTANAG', 2], ['ammo762x39', 6], ['ammo556x45', 4], ['makarov', 1], ['ammo9x18', 2], ['mre', 4], ['canteen', 2], ['bandage', 3], ['morphine', 1], ['helmet', 1.5], ['milJacket', 2], ['milPants', 2], ['chestRig', 1.5], ['milPack', 0.8], ['plateCarrier', 0.3], ['reddot', 0.8], ['holo', 0.5], ['foregrip', 0.6], ['compass', 1], ['binoculars', 1], ['flare', 1.5], ['huntingKnife', 1]),
  bunker: T(['nothing', 8], ['akm', 4], ['m4', 3], ['m249', 0.6], ['m24', 1], ['magAK', 5], ['magSTANAG', 5], ['boxM249', 0.6], ['ammo762x39', 6], ['ammo556x45', 6], ['ammo308', 3], ['acog', 1.2], ['holo', 1.5], ['reddot', 1.5], ['suppressor', 1.2], ['plateCarrier', 1.2], ['helmet', 2], ['milPack', 1.5], ['mre', 3], ['morphine', 2], ['firstaid', 2], ['saline', 1.5]),
  industrial: T(['nothing', 25], ['crowbar', 3], ['pipe', 3], ['hatchet', 2], ['shovel', 2], ['sledge', 1], ['screwdriver', 3], ['tape', 4], ['nails', 3], ['battery', 2], ['flashlight', 1.5], ['headtorch', 1], ['cargo', 2], ['raincoat', 1.5], ['water', 2], ['rag', 3], ['matches', 2]),
  farm: T(['nothing', 25], ['hatchet', 3], ['fireaxe', 1], ['shovel', 3], ['pipe', 1], ['apple', 4], ['pear', 3], ['rottenApple', 3], ['bread', 2], ['pickles', 2], ['honey', 2], ['water', 2], ['vodka', 2], ['m24', 0.3], ['ammo308', 1], ['remington', 0.6], ['ammo12ga', 2], ['ushanka', 1.5], ['raincoat', 1.5], ['huntingPack', 1], ['rag', 3], ['huntingKnife', 1]),
  hunting: T(['nothing', 15], ['m24', 1.2], ['remington', 2], ['ammo308', 4], ['ammo12ga', 4], ['huntingKnife', 3], ['huntingPack', 2], ['binoculars', 2], ['compass', 2], ['canteen', 2], ['tushonka', 3], ['matches', 2], ['map', 1.5]),
  camp: T(['nothing', 10], ['akm', 2], ['remington', 2], ['makarov', 2], ['magAK', 3], ['magMakarov', 2], ['ammo762x39', 5], ['ammo12ga', 4], ['ammo9x18', 4], ['tushonka', 3], ['mre', 2], ['vodka', 3], ['water', 3], ['bandage', 3], ['morphine', 1], ['machete', 2], ['fireaxe', 1.5], ['huntingPack', 1.5], ['chestRig', 1], ['m4', 0.5], ['magSTANAG', 0.6]),
  office: T(['nothing', 35], ['book', 3], ['battery', 3], ['radio', 1.5], ['soda', 3], ['chocolate', 3], ['crackers', 2], ['painkillers', 2], ['tape', 2], ['map', 1.5], ['compass', 0.6], ['screwdriver', 2], ['flashlight', 1]),
  school: T(['nothing', 30], ['schoolBag', 4], ['book', 4], ['chocolate', 3], ['soda', 3], ['crackers', 3], ['apple', 3], ['bandage', 2], ['painkillers', 1], ['map', 1]),
  church: T(['nothing', 40], ['book', 3], ['matches', 2], ['bread', 2], ['vodka', 1], ['rag', 3], ['bandage', 1]),
  castle: T(['nothing', 25], ['m24', 0.5], ['ammo308', 1.5], ['binoculars', 2], ['compass', 2], ['canteen', 2], ['tushonka', 2], ['huntingKnife', 2], ['machete', 2], ['fireaxe', 1]),
  vehicle: T(['nothing', 40], ['tape', 3], ['screwdriver', 2], ['crowbar', 1.5], ['water', 2], ['soda', 2], ['map', 2], ['flashlight', 1], ['battery', 2], ['rag', 3], ['beans', 1]),
  trash: T(['nothing', 55], ['rag', 4], ['rottenApple', 3], ['soda', 2], ['crackers', 1], ['battery', 1], ['tape', 1], ['pipe', 1]),
  fire: T(['nothing', 20], ['fireaxe', 4], ['crowbar', 2], ['sledge', 1], ['raincoat', 2], ['headtorch', 2], ['flashlight', 2], ['battery', 2], ['bandage', 2], ['firstaid', 1]),
  fuel: T(['nothing', 60], ['water', 2], ['soda', 2], ['rag', 2], ['tape', 1]),
  supply: T(['mre', 6], ['water', 5], ['canteen', 2], ['tushonka', 3], ['firstaid', 3], ['bandage', 5], ['morphine', 2], ['saline', 2], ['antibiotics', 2], ['splint', 2], ['purify', 3], ['m4', 1.5], ['akm', 1.5], ['magSTANAG', 3], ['magAK', 3], ['ammo556x45', 4], ['ammo762x39', 4], ['ammo308', 1.5], ['acog', 1], ['helmet', 1.5], ['plateCarrier', 1], ['milPack', 1.2], ['battery', 2], ['flare', 2], ['binoculars', 1], ['map', 1], ['compass', 1]),
  crash: T(['m249', 2], ['m24', 2], ['m4', 3], ['akm', 2], ['acog', 3], ['holo', 2], ['suppressor', 2], ['boxM249', 2], ['magSTANAG', 4], ['ammo556x45', 4], ['ammo308', 3], ['plateCarrier', 2], ['helmet', 2], ['milPack', 2], ['mre', 3], ['firstaid', 2]),
};
// which tables a category of spot also borrows from (kitchens have some home things)
export const LOOT_EXTRA = { kitchen: 'home', clothes: 'home', office: 'home', school: 'home', church: 'home' };

/** Pick an item id from a table (or null). r: a random function. */
export function rollLoot(cat, r = Math.random) {
  if (LOOT_EXTRA[cat] && r() < 0.3) cat = LOOT_EXTRA[cat];
  const t = LOOT[cat] || LOOT.home;
  let tot = 0; for (const [, w] of t) tot += w;
  let x = r() * tot;
  for (const [id, w] of t) { x -= w; if (x <= 0) return id === 'nothing' || !I[id] ? null : id; }
  return null;
}
