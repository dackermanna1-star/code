// The weapons of Vice City: one table that the player's arsenal, the NPC
// shooters (cops, gangs), the shop and the HUD all read.
//
//   WEAPONS[id] = {
//     id, name, slot ('melee'|'handgun'|'smg'|'shotgun'|'rifle'|'sniper'|'heavy'|'thrown'), icon (emoji for the HUD), price
//     melee:  melee:true, dmg (light hit), heavy (charged hit), reach (studs), speed (swings/s), kind ('blunt'|'stab'|'fist'), combo (hits in the chain)
//     guns:   dmg (per bullet, vs 100 hp, before the victim's body-part multiplier), rpm, cone [hip, aimed] (degrees; spread = the hip
//             value, for NPC brains), recoil (degrees of climb), mag, reserveMax, reload (s),
//             range [full damage until, zero-falloff floor at] (studs), max (bullet reach), pellets, auto, shellReload, sound (warzone playShot kind),
//             gun (model id: warzone/guns.js or combat/models.js), twoHand, driveBy (usable from a vehicle), zoom (scope fov), noise (radius)
//     thrown/heavy: projectile ('rocket'|'grenade'|'molotov'), radius, dmg (blast), speed, fuse
//   }
//   SLOTS: the wheel's order (keys 1-8). PART_MULT: damage by body part (applied by the victim's hit(): peds and the
//   player have their own; this is the reference). weapon(id): the definition, also for other names (rifle, m4, ak47, mp5...).
export const SLOTS = ['melee', 'handgun', 'smg', 'shotgun', 'rifle', 'sniper', 'heavy', 'thrown'];
export const SLOT_NAMES = { melee: 'Melee', handgun: 'Pistols', smg: 'SMGs', shotgun: 'Shotguns', rifle: 'Rifles', sniper: 'Snipers', heavy: 'Heavy', thrown: 'Throwables' };
export const PART_MULT = { head: 3, torso: 1, armL: 0.7, armR: 0.7, legL: 0.7, legR: 0.7 };

export const WEAPONS = {
  // ---- melee ----
  fists: { name: 'Fists', slot: 'melee', icon: '✊', price: 0, melee: true, kind: 'fist', dmg: 11, heavy: 26, reach: 4.4, speed: 2.6, combo: 3 },
  knuckles: { name: 'Brass Knuckles', slot: 'melee', icon: '🥊', price: 100, melee: true, kind: 'fist', dmg: 16, heavy: 36, reach: 4.4, speed: 2.5, combo: 3, model: 'knuckles' },
  knife: { name: 'Switchblade', slot: 'melee', icon: '🔪', price: 150, melee: true, kind: 'stab', dmg: 34, heavy: 85, reach: 4.8, speed: 2.4, combo: 2, model: 'knife' },
  bat: { name: 'Baseball Bat', slot: 'melee', icon: '⚾', price: 120, melee: true, kind: 'blunt', dmg: 30, heavy: 70, reach: 6, speed: 1.7, combo: 2, model: 'bat', twoHand: true },
  // ---- handguns ----
  pistol: { name: 'Pistol', slot: 'handgun', icon: '🔫', price: 250, ammoPrice: 2, dmg: 28, rpm: 380, spread: 2.4, cone: [2.4, 0.55], recoil: 1.5, mag: 12, reserveMax: 240, reload: 1.35, range: [70, 180], max: 320, sound: 'pistol', gun: 'glock', driveBy: true, noise: 220 },
  magnum: { name: '.50 Hand Cannon', slot: 'handgun', icon: '🔫', price: 900, ammoPrice: 8, dmg: 68, rpm: 170, spread: 3.2, cone: [3.2, 0.45], recoil: 5.2, mag: 7, reserveMax: 120, reload: 1.9, range: [90, 240], max: 400, sound: 'magnum', gun: 'deagle', driveBy: true, noise: 280, force: 18 },
  // ---- SMGs ----
  uzi: { name: 'Micro SMG', slot: 'smg', icon: '🔫', price: 600, ammoPrice: 2, dmg: 17, rpm: 1000, auto: true, spread: 4.6, cone: [4.6, 1.9], recoil: 0.75, mag: 32, reserveMax: 500, reload: 1.6, range: [45, 140], max: 260, sound: 'smg', gun: 'uzi', driveBy: true, noise: 230 },
  smg: { name: 'SMG', slot: 'smg', icon: '🔫', price: 1500, ammoPrice: 3, dmg: 22, rpm: 800, auto: true, spread: 3.2, cone: [3.2, 0.9], recoil: 0.9, mag: 30, reserveMax: 450, reload: 2.1, range: [60, 170], max: 320, sound: 'smg', gun: 'mp5', twoHand: true, driveBy: true, noise: 230 },
  // ---- shotgun ----
  shotgun: { name: 'Pump Shotgun', slot: 'shotgun', icon: '🔫', price: 1200, ammoPrice: 6, dmg: 15, pellets: 9, rpm: 68, spread: 6.5, cone: [6.5, 4.6], recoil: 6.5, mag: 8, reserveMax: 120, reload: 0.5, shellReload: true, range: [14, 70], max: 140, sound: 'shotgun', gun: 'remington', twoHand: true, noise: 260, force: 26, pump: true },
  // ---- rifles ----
  carbine: { name: 'Carbine Rifle', slot: 'rifle', icon: '🔫', price: 3100, ammoPrice: 4, dmg: 30, rpm: 720, auto: true, spread: 3.6, cone: [3.6, 0.45], recoil: 1.35, mag: 30, reserveMax: 600, reload: 2.2, range: [140, 450], max: 700, sound: 'rifle', gun: 'm4', twoHand: true, noise: 280 },
  ak: { name: 'Assault Rifle', slot: 'rifle', icon: '🔫', price: 2600, ammoPrice: 4, dmg: 35, rpm: 600, auto: true, spread: 4.2, cone: [4.2, 0.65], recoil: 2.0, mag: 30, reserveMax: 600, reload: 2.4, range: [130, 420], max: 700, sound: 'ak', gun: 'ak47', twoHand: true, noise: 290 },
  // ---- sniper ----
  sniper: { name: 'Sniper Rifle', slot: 'sniper', icon: '🎯', price: 4800, ammoPrice: 20, dmg: 125, rpm: 42, spread: 9, cone: [9, 0], recoil: 7, mag: 5, reserveMax: 60, reload: 2.9, range: [900, 1400], max: 1400, sound: 'sniper', gun: 'm24', twoHand: true, zoom: 12, bolt: true, noise: 340, force: 30 },
  // ---- heavy ----
  rpg: { name: 'Rocket Launcher', slot: 'heavy', icon: '🚀', price: 8000, ammoPrice: 400, projectile: 'rocket', dmg: 280, radius: 30, speed: 190, rpm: 40, spread: 2.5, cone: [2.5, 0.3], recoil: 6, mag: 1, reserveMax: 20, reload: 2.6, max: 700, gun: 'rpg', twoHand: true, shoulder: true, noise: 320 },
  // ---- thrown ----
  grenade: { name: 'Grenade', slot: 'thrown', icon: '💣', price: 300, projectile: 'grenade', dmg: 230, radius: 28, speed: 62, fuse: 3.2, rpm: 60, mag: 1, reserveMax: 25, thrown: true, model: 'grenade', noise: 320 },
  molotov: { name: 'Molotov', slot: 'thrown', icon: '🍾', price: 250, projectile: 'molotov', dmg: 24, radius: 10, burn: 9, speed: 56, rpm: 60, mag: 1, reserveMax: 25, thrown: true, model: 'molotov', noise: 120 },
};
for (const [id, w] of Object.entries(WEAPONS)) w.id = id;
// other names for the same guns (NPC loadouts, the warzone model ids)
export const ALIAS = { rifle: 'carbine', m4: 'carbine', ak47: 'ak', mp5: 'smg', glock: 'pistol', deagle: 'magnum', m24: 'sniper', remington: 'shotgun', rocket: 'rpg', unarmed: 'fists' };
export function weapon(id) { return WEAPONS[id] || WEAPONS[ALIAS[id]] || null; }

/** The weapons that go in a slot, cheapest first (for the shop). */
export function inSlot(slot) { return Object.values(WEAPONS).filter((w) => w.slot === slot).sort((a, b) => a.price - b.price); }
