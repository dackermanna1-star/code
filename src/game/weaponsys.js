// Counter-Strike 1.6 weapons: definitions + per-weapon state machine.
//
// Port of ReGameDLL_CS (weapons.h, weapontype.h/.cpp, weapons.cpp and every wpn_*.cpp),
// following the ORIGINAL (non-REGAMEDLL_FIXES / non-REGAMEDLL_ADD) code paths, i.e. what
// CS 1.6 actually shipped - including its quirks (integer accuracy divisors, Glock burst
// rounds fired on consecutive frames, flashbang retiring after every throw, ...).
//
// Timing: the C++ runs with CLIENT_WEAPONS (timers relative and decremented every frame).
// Here every timer is an ABSOLUTE time in seconds compared against ctx.time, which is
// equivalent. The player-level m_flNextAttack (deploy / reload lock) lives in w.nextAttack.
//
// Per frame the game should (same order as GoldSrc PlayerPreThink -> PM -> PostThink):
//   dropPunchAngle(punch, dt); ...move the player...; weaponFrame(w, ctx, buttons, prevButtons);
// ctx.fireBullets is called synchronously BEFORE the shot's recoil is added to ctx.punch,
// so the game must build the shot direction from viewAngles + the punch at call time.
//
// ctx (supplied each call):
//   time, dt, onGround, ducking, speed2d, waterLevel (3 = head under water),
//   punch [pitch, yaw, roll] (mutable, degrees), viewAngles? [pitch, yaw, roll] (grenade throws),
//   canShoot? (false during freeze time), isDefusing?, inBombZone? | canPlant?(),
//   setFov(fov | 0 = default), fireBullets(params), knifeTrace(range), knifeDamage(target, dmg, hitgroup),
//   throwGrenade(type, params), plantBomb(), playSound(name, opts), playAnim(name, opts),
//   emitShell(type), random(), randomInt(lo, hi), retire?(w) (switch to next best weapon),
//   event?(type, data) (hud messages, muzzle flash, player anims, radio, progress bar ...)
// DOM-free and dependency-free (only imports the sibling combat rules).

import { BULLET, WEAPON_ARMOR_RATIO, grenadeThrow, C4 as C4_RULES } from './combatrules.js';

export const BUTTON = Object.freeze({ ATTACK: 1, ATTACK2: 2, RELOAD: 4 });
export const DEFAULT_FOV = 90;
export const WEAPON_NOCLIP = -1;

/**
 * Behaviour switches. Defaults = original CS 1.6. Flip to get the ReGameDLL fixes.
 *   floatAccuracyDivisor: shots^3 / 200 as float instead of integer division (REGAMEDLL_FIXES).
 *   resetAccuracyOnDecay: accuracy back to base when m_iShotsFired decays to 0 (REGAMEDLL_FIXES).
 *   glockBurstUsesTime:   Glock burst rounds 0.1 s apart instead of on consecutive frames.
 */
export const WEAPON_OPTIONS = { floatAccuracyDivisor: false, resetAccuracyOnDecay: false, glockBurstUsesTime: false };

/** Ammo types: reserve cap (MAX_AMMO_*), purchase cost / rounds per buy (AMMO_*_PRICE / AMMO_*_BUY). */
export const AMMO_TYPES = Object.freeze({
  '338Magnum': { max: 30, cost: 125, amount: 10 },
  '762Nato': { max: 90, cost: 80, amount: 30 },
  '556NatoBox': { max: 200, cost: 60, amount: 30 },
  '556Nato': { max: 90, cost: 60, amount: 30 },
  buckshot: { max: 32, cost: 65, amount: 8 },
  '45acp': { max: 100, cost: 25, amount: 12 },
  '57mm': { max: 100, cost: 50, amount: 50 },
  '50AE': { max: 35, cost: 40, amount: 7 },
  '357SIG': { max: 52, cost: 50, amount: 13 },
  '9mm': { max: 120, cost: 20, amount: 30 },
  HEGrenade: { max: 1, cost: 300, amount: 1 },
  Flashbang: { max: 2, cost: 200, amount: 1 },
  SmokeGrenade: { max: 1, cost: 300, amount: 1 },
  C4: { max: 1, cost: 0, amount: 1 },
  // zombie survival extras
  Molotov: { max: 3, cost: 400, amount: 1 },
  Medkit: { max: 3, cost: 800, amount: 1 },
  Fuel: { max: 300, cost: 120, amount: 100 },
  Rocket: { max: 6, cost: 600, amount: 1 },
  Grenade40: { max: 18, cost: 450, amount: 6 },
});

export const WEAPON_IDS = Object.freeze(['knife', 'glock', 'usp', 'p228', 'deagle', 'elite', 'fiveseven', 'm3', 'xm1014', 'mac10', 'tmp', 'mp5', 'ump45', 'p90', 'galil', 'famas', 'ak47', 'm4a1', 'sg552', 'aug', 'scout', 'awp', 'g3sg1', 'sg550', 'm249', 'hegrenade', 'flashbang', 'smokegrenade', 'c4', 'molotov', 'flamethrower', 'rpg', 'm32', 'medkit']);

// view-model sequence tables (weapons.h enums, in order)
const SEQ_RIFLE = ['idle1', 'reload', 'draw', 'shoot1', 'shoot2', 'shoot3'];
const SEQ = {
  knife: ['idle', 'attack1hit', 'attack2hit', 'draw', 'stabhit', 'stabmiss', 'midattack1hit', 'midattack2hit'],
  glock: ['idle1', 'idle2', 'idle3', 'shoot', 'shoot2', 'shoot3', 'shoot_empty', 'reload', 'draw', 'holster', 'add_silencer', 'draw2', 'reload2'],
  usp: ['idle', 'shoot1', 'shoot2', 'shoot3', 'shoot_empty', 'reload', 'draw', 'attach_silencer', 'unsil_idle', 'unsil_shoot1', 'unsil_shoot2', 'unsil_shoot3', 'unsil_shoot_empty', 'unsil_reload', 'unsil_draw', 'detach_silencer'],
  p228: ['idle', 'shoot1', 'shoot2', 'shoot3', 'shoot_empty', 'reload', 'draw'],
  deagle: ['idle1', 'shoot1', 'shoot2', 'shoot_empty', 'reload', 'draw'],
  elite: ['idle', 'idle_leftempty', 'shootleft1', 'shootleft2', 'shootleft3', 'shootleft4', 'shootleft5', 'shootleftlast', 'shootright1', 'shootright2', 'shootright3', 'shootright4', 'shootright5', 'shootrightlast', 'reload', 'draw'],
  fiveseven: ['idle', 'shoot1', 'shoot2', 'shoot_empty', 'reload', 'draw'],
  m3: ['idle', 'fire1', 'fire2', 'reload', 'pump', 'start_reload', 'draw', 'holster'],
  xm1014: ['idle', 'fire1', 'fire2', 'reload', 'pump', 'start_reload', 'draw'],
  mac10: SEQ_RIFLE, tmp: SEQ_RIFLE, mp5: SEQ_RIFLE, ump45: SEQ_RIFLE, p90: SEQ_RIFLE,
  galil: SEQ_RIFLE, famas: SEQ_RIFLE, ak47: SEQ_RIFLE, sg552: SEQ_RIFLE, aug: SEQ_RIFLE,
  m4a1: ['idle', 'shoot1', 'shoot2', 'shoot3', 'reload', 'draw', 'attach_silencer', 'unsil_idle', 'unsil_shoot1', 'unsil_shoot2', 'unsil_shoot3', 'unsil_reload', 'unsil_draw', 'detach_silencer'],
  scout: ['idle', 'shoot', 'shoot2', 'reload', 'draw'],
  awp: ['idle', 'shoot', 'shoot2', 'shoot3', 'reload', 'draw'],
  g3sg1: ['idle', 'shoot', 'shoot2', 'reload', 'draw'],
  sg550: ['idle', 'shoot', 'shoot2', 'reload', 'draw'],
  m249: ['idle1', 'shoot1', 'shoot2', 'reload', 'draw'],
  hegrenade: ['idle', 'pullpin', 'throw', 'draw'],
  flashbang: ['idle', 'pullpin', 'throw', 'draw'],
  smokegrenade: ['idle', 'pinpull', 'throw', 'draw'],
  c4: ['idle1', 'draw', 'drop', 'arm'],
  molotov: ['idle', 'pullpin', 'throw', 'draw'],
  flamethrower: SEQ_RIFLE, rpg: SEQ_RIFLE, m32: SEQ_RIFLE,
  medkit: ['idle', 'use', 'draw'],
};

const W = (f) => `weapons/${f}.wav`;

// ---------------------------------------------------------------- definitions
const RAW = {
  knife: {
    name: 'Knife', shortName: 'Knife', slot: 3, position: 1, menu: null, team: null, price: 0, buyable: false,
    clip: WEAPON_NOCLIP, ammoType: null, maxSpeed: 250, weight: 0, kind: 'knife', hasSecondary: true,
    damage: 15, damageFast: 20, stabDamage: 65, backstabMultiplier: 3, swingRange: 48, stabRange: 32,
    cycleTime: 0.4, missCycleTime: 0.35, stabCycleTime: 1.1, stabMissCycleTime: 1.0,
    sounds: { fire: 'knife_slash', deploy: 'knife_deploy1', files: { slash: [W('knife_slash1'), W('knife_slash2')], hit: [W('knife_hit1'), W('knife_hit2'), W('knife_hit3'), W('knife_hit4')], stab: [W('knife_stab')], wall: [W('knife_hitwall1')], deploy: [W('knife_deploy1')] } },
  },
  glock: {
    name: '9x19mm Sidearm', shortName: 'Glock 18', slot: 2, position: 2, menu: 'pistol', menuSlot: 1, team: null, price: 400,
    clip: 20, ammoType: '9mm', spawnReserve: 40, maxSpeed: 250, weight: 5, kind: 'pistol', hasSecondary: true,
    damage: 25, rangeModifier: 0.75, penetration: 1, distance: 8192, bulletType: BULLET.PLAYER_9MM,
    cycleTime: 0.15, burstCycleTime: 0.5, reloadTime: 2.2, shell: 'pshell', initialAccuracy: 0.9,
    burstDamage: 25, burstRangeModifier: 0.9, burstSpread: 0.05,
    sounds: { fire: 'glock', files: { fire: [W('glock18-1'), W('glock18-2')], reload: [W('clipout1'), W('clipin1'), W('sliderelease1'), W('slideback1')] } },
  },
  usp: {
    name: 'K&M .45 Tactical', shortName: 'USP', slot: 2, position: 4, menu: 'pistol', menuSlot: 2, team: null, price: 500,
    clip: 12, ammoType: '45acp', spawnReserve: 24, maxSpeed: 250, weight: 5, kind: 'pistol', hasSecondary: true,
    damage: 34, damageSilenced: 30, rangeModifier: 0.79, penetration: 1, distance: 4096, bulletType: BULLET.PLAYER_45ACP,
    cycleTime: 0.15, reloadTime: 2.7, silencerTime: 3.0, shell: 'pshell', initialAccuracy: 0.92,
    sounds: { fire: 'usp', fireSilenced: 'usp_silenced', silencerOn: 'usp_silencer_on', silencerOff: 'usp_silencer_off', files: { fire: [W('usp_unsil-1')], fireSilenced: [W('usp1'), W('usp2')], reload: [W('usp_clipout'), W('usp_clipin'), W('usp_sliderelease'), W('usp_slideback')] } },
  },
  p228: {
    name: '228 Compact', shortName: 'P228', slot: 2, position: 3, menu: 'pistol', menuSlot: 3, team: null, price: 600,
    clip: 13, ammoType: '357SIG', maxSpeed: 250, weight: 5, kind: 'pistol', hasSecondary: false,
    damage: 32, rangeModifier: 0.8, penetration: 1, distance: 4096, bulletType: BULLET.PLAYER_357SIG,
    cycleTime: 0.15, reloadTime: 2.7, shell: 'pshell', initialAccuracy: 0.9,
    sounds: { fire: 'p228', files: { fire: [W('p228-1')], reload: [W('p228_clipout'), W('p228_clipin'), W('p228_sliderelease'), W('p228_slidepull')] } },
  },
  deagle: {
    name: 'Night Hawk .50C', shortName: 'Desert Eagle', slot: 2, position: 1, menu: 'pistol', menuSlot: 4, team: null, price: 650,
    clip: 7, ammoType: '50AE', maxSpeed: 250, weight: 7, kind: 'pistol', hasSecondary: false,
    damage: 54, rangeModifier: 0.81, penetration: 2, distance: 4096, bulletType: BULLET.PLAYER_50AE,
    cycleTime: 0.225, reloadTime: 2.2, shell: 'pshell', initialAccuracy: 0.9,
    sounds: { fire: 'deagle', files: { fire: [W('deagle-1'), W('deagle-2')], reload: [W('de_clipout'), W('de_clipin')], deploy: [W('de_deploy')] } },
  },
  elite: {
    name: '.40 Dual Elites', shortName: 'Dual Elites', slot: 2, position: 5, menu: 'pistol', menuSlot: 5, team: 'T', price: 800,
    clip: 30, ammoType: '9mm', maxSpeed: 250, weight: 5, kind: 'pistol', hasSecondary: false,
    damage: 36, rangeModifier: 0.75, penetration: 1, distance: 8192, bulletType: BULLET.PLAYER_9MM,
    cycleTime: 0.075, reloadTime: 4.5, shell: 'pshell', initialAccuracy: 0.88,
    sounds: { fire: 'elite', files: { fire: [W('elite_fire')], reload: [W('elite_reloadstart'), W('elite_leftclipin'), W('elite_clipout'), W('elite_sliderelease'), W('elite_rightclipin')], deploy: [W('elite_deploy')] } },
  },
  fiveseven: {
    name: 'ES Five-Seven', shortName: 'Five-SeveN', slot: 2, position: 6, menu: 'pistol', menuSlot: 5, team: 'CT', price: 750,
    clip: 20, ammoType: '57mm', maxSpeed: 250, weight: 5, kind: 'pistol', hasSecondary: false,
    damage: 20, rangeModifier: 0.885, penetration: 1, distance: 4096, bulletType: BULLET.PLAYER_57MM,
    cycleTime: 0.15, reloadTime: 2.7, shell: 'pshell', initialAccuracy: 0.92,
    sounds: { fire: 'fiveseven', files: { fire: [W('fiveseven-1')], reload: [W('fiveseven_clipout'), W('fiveseven_clipin'), W('fiveseven_sliderelease'), W('fiveseven_slidepull')] } },
  },
  m3: {
    name: 'Leone 12 Gauge Super', shortName: 'M3', slot: 1, position: 5, menu: 'shotgun', menuSlot: 1, team: null, price: 1700,
    clip: 8, ammoType: 'buckshot', maxSpeed: 230, weight: 20, kind: 'shotgun', hasSecondary: false, noFireUnderwater: true,
    damage: 20, pellets: 9, cone: 0.0675, distance: 3000, bulletType: BULLET.PLAYER_BUCKSHOT, penetration: 0, rangeModifier: 1,
    cycleTime: 0.875, reloadStartTime: 0.55, reloadInsertTime: 0.45, reloadTime: 0.55 + 8 * 0.45, shell: 'shotgunshell', ejectDelay: 0.45,
    sounds: { fire: 'm3', files: { fire: [W('m3-1')], insert: [W('m3_insertshell')], pump: [W('m3_pump')] } },
  },
  xm1014: {
    name: 'Leone YG1265 Auto Shotgun', shortName: 'XM1014', slot: 1, position: 12, menu: 'shotgun', menuSlot: 2, team: null, price: 3000,
    clip: 7, ammoType: 'buckshot', maxSpeed: 240, weight: 20, kind: 'shotgun', hasSecondary: false, noFireUnderwater: true,
    damage: 20, pellets: 6, cone: 0.0725, distance: 3048, bulletType: BULLET.PLAYER_BUCKSHOT, penetration: 0, rangeModifier: 1,
    cycleTime: 0.25, reloadStartTime: 0.55, reloadInsertTime: 0.3, reloadTime: 0.55 + 7 * 0.3, shell: 'shotgunshell',
    sounds: { fire: 'xm1014', insertSounds: ['reload1', 'reload3'], files: { fire: [W('xm1014-1')], insert: [W('reload1'), W('reload3')] } },
  },
  mac10: {
    name: 'Ingram MAC-10', shortName: 'MAC-10', slot: 1, position: 13, menu: 'smg', menuSlot: 1, team: 'T', price: 1400,
    clip: 30, ammoType: '45acp', maxSpeed: 250, weight: 25, kind: 'smg', hasSecondary: false,
    damage: 29, rangeModifier: 0.82, penetration: 1, distance: 8192, bulletType: BULLET.PLAYER_45ACP,
    cycleTime: 0.07, reloadTime: 3.15, shell: 'pshell', initialAccuracy: 0.15,
    sounds: { fire: 'mac10', files: { fire: [W('mac10-1')], reload: [W('mac10_clipout'), W('mac10_clipin'), W('mac10_boltpull')] } },
  },
  tmp: {
    name: 'Schmidt Machine Pistol', shortName: 'TMP', slot: 1, position: 11, menu: 'smg', menuSlot: 1, team: 'CT', price: 1250,
    clip: 30, ammoType: '9mm', maxSpeed: 250, weight: 25, kind: 'smg', hasSecondary: false,
    damage: 20, rangeModifier: 0.85, penetration: 1, distance: 8192, bulletType: BULLET.PLAYER_9MM,
    cycleTime: 0.07, reloadTime: 2.12, shell: 'pshell', initialAccuracy: 0.2,
    sounds: { fire: 'tmp', files: { fire: [W('tmp-1'), W('tmp-2')] } },
  },
  mp5: {
    name: 'KM Sub-Machine Gun', shortName: 'MP5', slot: 1, position: 7, menu: 'smg', menuSlot: 2, team: null, price: 1500,
    clip: 30, ammoType: '9mm', maxSpeed: 250, weight: 25, kind: 'smg', hasSecondary: false,
    damage: 26, rangeModifier: 0.84, penetration: 1, distance: 8192, bulletType: BULLET.PLAYER_9MM,
    cycleTime: 0.075, reloadTime: 2.63, shell: 'pshell', initialAccuracy: 0,
    sounds: { fire: 'mp5', files: { fire: [W('mp5-1'), W('mp5-2')], reload: [W('mp5_clipout'), W('mp5_clipin'), W('mp5_slideback')] } },
  },
  ump45: {
    name: 'KM UMP45', shortName: 'UMP45', slot: 1, position: 15, menu: 'smg', menuSlot: 3, team: null, price: 1700,
    clip: 25, ammoType: '45acp', maxSpeed: 250, weight: 25, kind: 'smg',
    hasSecondary: true, // not in HasSecondaryAttack's list in the original: a held ATTACK2 blocks firing (no-op secondary)
    damage: 30, rangeModifier: 0.82, penetration: 1, distance: 8192, bulletType: BULLET.PLAYER_45ACP,
    cycleTime: 0.1, reloadTime: 3.5, shell: 'pshell', initialAccuracy: 0,
    sounds: { fire: 'ump45', files: { fire: [W('ump45-1')], reload: [W('ump45_clipout'), W('ump45_clipin'), W('ump45_boltslap')] } },
  },
  p90: {
    name: 'ES C90', shortName: 'P90', slot: 1, position: 8, menu: 'smg', menuSlot: 4, team: null, price: 2350,
    clip: 50, ammoType: '57mm', maxSpeed: 245, weight: 26, kind: 'smg', hasSecondary: false,
    damage: 21, rangeModifier: 0.885, penetration: 1, distance: 8192, bulletType: BULLET.PLAYER_57MM,
    cycleTime: 0.066, reloadTime: 3.4, shell: 'rshell', initialAccuracy: 0.2,
    sounds: { fire: 'p90', files: { fire: [W('p90-1')], reload: [W('p90_clipout'), W('p90_clipin'), W('p90_boltpull'), W('p90_cliprelease')] } },
  },
  galil: {
    name: 'IDF Defender', shortName: 'Galil', slot: 1, position: 17, menu: 'rifle', menuSlot: 1, team: 'T', price: 2000,
    clip: 35, ammoType: '556Nato', maxSpeed: 240, weight: 25, kind: 'rifle', hasSecondary: false, noFireUnderwater: true,
    damage: 30, rangeModifier: 0.98, penetration: 2, distance: 8192, bulletType: BULLET.PLAYER_556MM,
    cycleTime: 0.0875, reloadTime: 2.45, shell: 'rshell', initialAccuracy: 0.2,
    sounds: { fire: 'galil', files: { fire: [W('galil-1'), W('galil-2')], reload: [W('galil_clipout'), W('galil_clipin'), W('galil_boltpull')] } },
  },
  famas: {
    name: 'Clarion 5.56', shortName: 'FAMAS', slot: 1, position: 18, menu: 'rifle', menuSlot: 1, team: 'CT', price: 2250,
    clip: 25, ammoType: '556Nato', maxSpeed: 240, weight: 75, kind: 'rifle', hasSecondary: true, noFireUnderwater: true,
    damage: 30, burstDamage: 34, rangeModifier: 0.96, penetration: 2, distance: 8192, bulletType: BULLET.PLAYER_556MM,
    cycleTime: 0.0825, burstCycleTime: 0.55, reloadTime: 3.3, shell: 'rshell', initialAccuracy: 0.2,
    sounds: { fire: 'famas', files: { fire: [W('famas-1'), W('famas-2')], burst: [W('famas-burst')], reload: [W('famas_clipout'), W('famas_clipin'), W('famas_boltpull'), W('famas_boltslap'), W('famas_forearm')] } },
  },
  ak47: {
    name: 'CV-47', shortName: 'AK-47', slot: 1, position: 1, menu: 'rifle', menuSlot: 2, team: 'T', price: 2500,
    clip: 30, ammoType: '762Nato', maxSpeed: 221, weight: 25, kind: 'rifle', hasSecondary: false,
    damage: 36, rangeModifier: 0.98, penetration: 2, distance: 8192, bulletType: BULLET.PLAYER_762MM,
    cycleTime: 0.0955, reloadTime: 2.45, shell: 'rshell', initialAccuracy: 0.2,
    sounds: { fire: 'ak47', files: { fire: [W('ak47-1'), W('ak47-2')], reload: [W('ak47_clipout'), W('ak47_clipin'), W('ak47_boltpull')] } },
  },
  m4a1: {
    name: 'Maverick M4A1 Carbine', shortName: 'M4A1', slot: 1, position: 6, menu: 'rifle', menuSlot: 2, team: 'CT', price: 3100,
    clip: 30, ammoType: '556Nato', maxSpeed: 230, weight: 25, kind: 'rifle', hasSecondary: true,
    damage: 32, damageSilenced: 33, rangeModifier: 0.97, rangeModifierSilenced: 0.95, penetration: 2, distance: 8192, bulletType: BULLET.PLAYER_556MM,
    cycleTime: 0.0875, reloadTime: 3.05, silencerTime: 2.0, shell: 'rshell', initialAccuracy: 0.2,
    sounds: { fire: 'm4a1', fireSilenced: 'm4a1_silenced', silencerOn: 'm4a1_silencer_on', silencerOff: 'm4a1_silencer_off', files: { fire: [W('m4a1_unsil-1'), W('m4a1_unsil-2')], fireSilenced: [W('m4a1-1')], reload: [W('m4a1_clipout'), W('m4a1_clipin'), W('m4a1_boltpull')], deploy: [W('m4a1_deploy')] } },
  },
  sg552: {
    name: 'Krieg 552', shortName: 'SG 552', slot: 1, position: 10, menu: 'rifle', menuSlot: 4, team: 'T', price: 3500,
    clip: 30, ammoType: '556Nato', maxSpeed: 235, maxSpeedZoom: 200, weight: 25, kind: 'rifle', hasSecondary: true,
    damage: 33, rangeModifier: 0.955, penetration: 2, distance: 8192, bulletType: BULLET.PLAYER_556MM,
    cycleTime: 0.0825, cycleTimeZoom: 0.135, reloadTime: 3.0, zoomLevels: [55], shell: 'rshell', initialAccuracy: 0.2,
    sounds: { fire: 'sg552', files: { fire: [W('sg552-1'), W('sg552-2')], reload: [W('sg552_clipout'), W('sg552_clipin'), W('sg552_boltpull')] } },
  },
  aug: {
    name: 'Bullpup', shortName: 'AUG', slot: 1, position: 14, menu: 'rifle', menuSlot: 4, team: 'CT', price: 3500,
    clip: 30, ammoType: '556Nato', maxSpeed: 240, weight: 25, kind: 'rifle', hasSecondary: true,
    damage: 32, rangeModifier: 0.96, penetration: 2, distance: 8192, bulletType: BULLET.PLAYER_556MM,
    cycleTime: 0.0825, cycleTimeZoom: 0.135, reloadTime: 3.3, zoomLevels: [55], shell: 'rshell', initialAccuracy: 0.2,
    sounds: { fire: 'aug', files: { fire: [W('aug-1')], reload: [W('aug_clipout'), W('aug_clipin'), W('aug_boltpull'), W('aug_boltslap'), W('aug_forearm')] } },
  },
  scout: {
    name: 'Schmidt Scout', shortName: 'Scout', slot: 1, position: 9, menu: 'rifle', menuSlot: 3, team: null, price: 2750,
    clip: 10, ammoType: '762Nato', maxSpeed: 260, maxSpeedZoom: 220, weight: 30, kind: 'sniper', hasSecondary: true,
    damage: 75, rangeModifier: 0.98, penetration: 3, distance: 8192, bulletType: BULLET.PLAYER_762MM,
    cycleTime: 1.25, reloadTime: 2.0, drawTime: 1.25, zoomLevels: [40, 15], shell: 'rshell_big', ejectDelay: 0.56,
    sounds: { fire: 'scout', zoom: 'zoom', files: { fire: [W('scout_fire-1')], reload: [W('scout_clipout'), W('scout_clipin'), W('scout_bolt')], zoom: [W('zoom')] } },
  },
  awp: {
    name: 'Magnum Sniper Rifle', shortName: 'AWP', slot: 1, position: 2, menu: 'rifle', menuSlot: { T: 5, CT: 6 }, team: null, price: 4750,
    clip: 10, ammoType: '338Magnum', maxSpeed: 210, maxSpeedZoom: 150, weight: 30, kind: 'sniper', hasSecondary: true,
    damage: 115, rangeModifier: 0.99, penetration: 3, distance: 8192, bulletType: BULLET.PLAYER_338MAG,
    cycleTime: 1.45, reloadTime: 2.5, drawTime: 1.45, zoomLevels: [40, 10], shell: 'rshell_big', ejectDelay: 0.55,
    sounds: { fire: 'awp', zoom: 'zoom', files: { fire: [W('awp1')], reload: [W('awp_clipout'), W('awp_clipin'), W('boltpull1'), W('boltup'), W('boltdown')], zoom: [W('zoom')], deploy: [W('awp_deploy')] } },
  },
  g3sg1: {
    name: 'D3/AU-1', shortName: 'G3SG1', slot: 1, position: 3, menu: 'rifle', menuSlot: 6, team: 'T', price: 5000,
    clip: 20, ammoType: '762Nato', maxSpeed: 210, maxSpeedZoom: 150, weight: 20, kind: 'sniper', hasSecondary: true,
    damage: 80, rangeModifier: 0.98, penetration: 3, distance: 8192, bulletType: BULLET.PLAYER_762MM,
    cycleTime: 0.25, reloadTime: 3.5, zoomLevels: [40, 15], shell: 'rshell', initialAccuracy: 0.2,
    sounds: { fire: 'g3sg1', zoom: 'zoom', files: { fire: [W('g3sg1-1')], reload: [W('g3sg1_clipout'), W('g3sg1_clipin'), W('g3sg1_slide')], zoom: [W('zoom')] } },
  },
  sg550: {
    name: 'Krieg 550 Commando', shortName: 'SG 550', slot: 1, position: 16, menu: 'rifle', menuSlot: 5, team: 'CT', price: 4200,
    clip: 30, ammoType: '556Nato', maxSpeed: 210, maxSpeedZoom: 150, weight: 20, kind: 'sniper', hasSecondary: true,
    damage: 70, rangeModifier: 0.98, penetration: 2, distance: 8192, bulletType: BULLET.PLAYER_556MM,
    cycleTime: 0.25, reloadTime: 3.35, zoomLevels: [40, 15], shell: 'rshell', initialAccuracy: 0.9,
    sounds: { fire: 'sg550', zoom: 'zoom', files: { fire: [W('sg550-1')], reload: [W('sg550_clipout'), W('sg550_clipin'), W('sg550_boltpull')], zoom: [W('zoom')] } },
  },
  m249: {
    name: 'M249', shortName: 'M249', slot: 1, position: 4, menu: 'mg', menuSlot: 1, team: null, price: 5750,
    clip: 100, ammoType: '556NatoBox', maxSpeed: 220, weight: 25, kind: 'mg', hasSecondary: false,
    damage: 32, rangeModifier: 0.97, penetration: 2, distance: 8192, bulletType: BULLET.PLAYER_556MM,
    cycleTime: 0.1, reloadTime: 4.7, shell: 'rshell', initialAccuracy: 0.2,
    sounds: { fire: 'm249', files: { fire: [W('m249-1'), W('m249-2')], reload: [W('m249_boxout'), W('m249_boxin'), W('m249_chain'), W('m249_coverup'), W('m249_coverdown')] } },
  },
  hegrenade: {
    name: 'HE Grenade', shortName: 'HE', slot: 4, position: 1, menu: 'equip', menuSlot: 4, team: null, price: 300,
    clip: WEAPON_NOCLIP, ammoType: 'HEGrenade', maxSpeed: 250, weight: 2, kind: 'grenade', hasSecondary: true,
    sounds: { fire: 'hegrenade', files: { pin: [W('pinpull')], explode: [W('hegrenade-1'), W('hegrenade-2')], bounce: [W('he_bounce-1')] } },
  },
  flashbang: {
    name: 'Flashbang', shortName: 'Flashbang', slot: 4, position: 2, menu: 'equip', menuSlot: 3, team: null, price: 200,
    clip: WEAPON_NOCLIP, ammoType: 'Flashbang', maxSpeed: 250, weight: 1, kind: 'grenade', hasSecondary: true,
    sounds: { fire: 'flashbang', files: { pin: [W('pinpull')], explode: [W('flashbang-1'), W('flashbang-2')] } },
  },
  smokegrenade: {
    name: 'Smoke Grenade', shortName: 'Smoke', slot: 4, position: 3, menu: 'equip', menuSlot: 5, team: null, price: 300,
    clip: WEAPON_NOCLIP, ammoType: 'SmokeGrenade', maxSpeed: 250, weight: 1, kind: 'grenade', hasSecondary: true,
    sounds: { fire: 'smokegrenade', files: { pin: [W('pinpull')], explode: [W('sg_explode')] } },
  },
  c4: {
    name: 'C4 Bomb', shortName: 'C4', slot: 5, position: 3, menu: null, team: 'T', price: 0, buyable: false,
    clip: WEAPON_NOCLIP, ammoType: 'C4', maxSpeed: 250, weight: 3, kind: 'c4', hasSecondary: false,
    armTime: C4_RULES.armTime,
    sounds: { fire: 'c4_plant', files: { plant: [W('c4_plant')], click: [W('c4_click')] } },
  },
  // ---- zombie survival only (not in 1.6)
  molotov: {
    name: 'Molotov Cocktail', shortName: 'Molotov', slot: 4, position: 4, menu: 'equip', menuSlot: 6, team: null, price: 400, zombieOnly: true,
    clip: WEAPON_NOCLIP, ammoType: 'Molotov', maxSpeed: 250, weight: 1, kind: 'grenade', hasSecondary: true,
    sounds: { fire: 'molotov', files: {} },
  },
  flamethrower: {
    name: 'M2 Flamethrower', shortName: 'Flamethrower', slot: 1, position: 6, menu: 'mg', menuSlot: 2, team: null, price: 3500, zombieOnly: true,
    clip: 100, ammoType: 'Fuel', maxSpeed: 220, weight: 25, kind: 'flame', hasSecondary: false,
    cycleTime: 0.05, reloadTime: 3.2,
    sounds: { fire: 'flame_loop', files: {} },
  },
  rpg: {
    name: 'RPG-7', shortName: 'RPG', slot: 1, position: 7, menu: 'mg', menuSlot: 3, team: null, price: 5000, zombieOnly: true,
    clip: 1, ammoType: 'Rocket', maxSpeed: 210, weight: 30, kind: 'launcher', hasSecondary: false,
    cycleTime: 0.9, reloadTime: 2.4, kick: 7,
    sounds: { fire: 'rpg_fire', files: {} },
  },
  m32: {
    name: 'M32 Grenade Launcher', shortName: 'M32', slot: 1, position: 8, menu: 'mg', menuSlot: 4, team: null, price: 4200, zombieOnly: true,
    clip: 6, ammoType: 'Grenade40', maxSpeed: 220, weight: 25, kind: 'launcher', hasSecondary: false,
    cycleTime: 0.5, reloadTime: 3.6, kick: 4,
    sounds: { fire: 'm32_fire', files: {} },
  },
  medkit: {
    name: 'Medkit', shortName: 'Medkit', slot: 4, position: 5, menu: 'equip', menuSlot: 7, team: null, price: 800, zombieOnly: true,
    clip: WEAPON_NOCLIP, ammoType: 'Medkit', maxSpeed: 250, weight: 1, kind: 'medkit', hasSecondary: true,
    heal: 50, useTime: 1.4,
    sounds: { fire: 'medkit_use', files: {} },
  },
};

/** How many of a slot-4 item one can carry. */
export function stackMax(id) { return id === 'flashbang' ? 2 : id === 'molotov' || id === 'medkit' ? 3 : 1; }

function buildDef(id, r) {
  const a = r.ammoType ? AMMO_TYPES[r.ammoType] : null;
  const isGun = r.clip !== WEAPON_NOCLIP;
  return Object.freeze({
    id,
    buyable: true,
    menuSlot: null,
    spawnReserve: 0,
    drawTime: 0.75,       // DefaultDeploy: m_flNextAttack = 0.75
    auto: r.kind !== 'pistol', // pistols need a trigger release (m_iShotsFired > 1 -> return)
    noFireUnderwater: false,
    maxSpeedZoom: null,
    zoomLevels: null,
    initialAccuracy: 0,
    ...r,
    maxAmmo: a ? a.max : -1,
    ammoBuy: a && isGun ? Object.freeze({ cost: a.cost, amount: a.amount }) : null,
    defaultGive: isGun ? r.clip : 1,
    armorRatio: WEAPON_ARMOR_RATIO[id] ?? 1,
    sequences: SEQ[id],
    silencer: r.damageSilenced != null,
    burst: id === 'glock' || id === 'famas',
  });
}

export const WEAPON_DEFS = Object.freeze(Object.fromEntries(WEAPON_IDS.map((id) => [id, buildDef(id, RAW[id])])));

/** CanBuyWeaponByMaptype (non-assassination maps). */
export function canBuy(id, team) {
  const d = WEAPON_DEFS[id];
  if (!d || !d.buyable) return false;
  return !d.team || d.team === team;
}

// ---------------------------------------------------------------- weapon state
/**
 * New weapon as picked up / bought: full clip, no reserve (grenades/C4: 1).
 * opts: { reserve, clip, pool } - pool: optional shared { [ammoType]: rounds } object so
 * that weapons using the same ammo share one reserve (as m_rgAmmo does in CS).
 */
export function createWeapon(id, opts = {}) {
  const def = WEAPON_DEFS[id];
  if (!def) throw new Error(`unknown weapon '${id}'`);
  const isGun = def.clip !== WEAPON_NOCLIP;
  const w = {
    id, def,
    clip: opts.clip ?? (isGun ? def.defaultGive : WEAPON_NOCLIP),
    ammo: opts.reserve ?? (isGun || !def.ammoType ? 0 : 1),
    pool: opts.pool || null,
    // timers (absolute seconds)
    nextPrimary: 0, nextSecondary: 0, timeIdle: 0, nextAttack: 0,
    // reload
    inReload: false, reloadEnd: 0, specialReload: 0, nextReload: 0,
    // accuracy / recoil
    shotsFired: 0, accuracy: def.initialAccuracy, lastFire: 0, direction: 0,
    delayFire: id === 'm4a1', decreaseShotsFired: 0, lastFireTime: 0,
    fireOnEmpty: false, playEmptySound: false,
    // modes
    silenced: false, burstMode: false, eliteLeft: false,
    glockShoot: 0, glockShotsFired: 0, famasShoot: 0, famasShotsFired: 0, burstSpread: 0,
    // zoom (player-level in CS, reset by every deploy)
    fov: DEFAULT_FOV, zoomLevel: 0, lastZoom: DEFAULT_FOV, resumeZoom: false,
    ejectBrassAt: 0,
    // knife / grenades / c4
    swing: 0, startThrow: 0, releaseThrow: -1, pinPulled: false,
    startedArming: false, armedTime: 0, bombPlacedAnimation: false,
    healEnd: 0, healTarget: null,
    // bookkeeping for the host
    anim: null, spent: false, retired: false, lastShot: null,
  };
  if (w.pool && def.ammoType && (opts.reserve != null || w.pool[def.ammoType] == null)) w.pool[def.ammoType] = w.ammo;
  syncAmmo(w);
  return w;
}

function reserve(w) { return w.pool && w.def.ammoType ? (w.pool[w.def.ammoType] ?? 0) : w.ammo; }
function setReserve(w, v) { if (w.pool && w.def.ammoType) w.pool[w.def.ammoType] = v; w.ammo = v; }
function syncAmmo(w) { if (w.pool && w.def.ammoType) w.ammo = w.pool[w.def.ammoType] ?? 0; }

// ---------------------------------------------------------------- ctx helpers
const rnd = (ctx) => (ctx.random ? ctx.random() : Math.random());
const grounded = (ctx) => ctx.onGround !== false; // FL_ONGROUND (missing = on the ground)
const rndInt = (ctx, lo, hi) => (ctx.randomInt ? ctx.randomInt(lo, hi) : lo + Math.floor(rnd(ctx) * (hi - lo + 1)));
const rndFloat = (ctx, lo, hi) => lo + (hi - lo) * rnd(ctx);
const emit = (ctx, type, data) => { if (ctx.event) ctx.event(type, data); };
const sound = (ctx, name, opts = {}) => { if (ctx.playSound) ctx.playSound(name, opts); };

/** Play a view-model animation. `name` uses the view-model vocabulary, `cs` the weapons.h sequence. */
function anim(w, ctx, name, cs, duration) {
  w.anim = name;
  const seqs = w.def.sequences || [];
  if (ctx.playAnim) ctx.playAnim(name, { weapon: w.id, sequence: cs ?? name, seq: seqs.indexOf(cs ?? name), duration, silenced: w.silenced });
}

function setFov(w, ctx, fov) {
  w.fov = fov;
  w.zoomLevel = fov === DEFAULT_FOV ? 0 : (w.def.zoomLevels && fov === w.def.zoomLevels[1] ? 2 : 1);
  if (ctx.setFov) ctx.setFov(fov === DEFAULT_FOV ? 0 : fov);
}

function retire(w, ctx) {
  // CBasePlayerWeapon::RetireWeapon -> g_pGameRules->GetNextBestWeapon (heaviest other weapon)
  if (w.retired) return;
  w.retired = true;
  emit(ctx, 'retire', { weapon: w.id });
  if (ctx.retire) ctx.retire(w);
}

function playEmptySound(w, ctx) {
  if (w.playEmptySound) sound(ctx, w.def.slot === 2 ? 'dryfire_pistol' : 'dryfire_rifle', { channel: 'weapon', volume: 0.8, weapon: w.id });
  if (w.def.kind === 'shotgun') w.playEmptySound = false; // CM3/CXM1014::PlayEmptySound
}

function resetEmptySound(w) { w.playEmptySound = true; }

function shell(w, ctx) { if (ctx.emitShell && w.def.shell) ctx.emitShell(w.def.shell); }

function fireSound(w, ctx) {
  const s = w.silenced && w.def.sounds.fireSilenced ? w.def.sounds.fireSilenced : w.def.sounds.fire;
  sound(ctx, s, { channel: 'weapon', weapon: w.id, silenced: w.silenced });
}

function shootEffects(w, ctx, animName, cs, { muzzle = true, ejectNow = true } = {}) {
  if (muzzle) emit(ctx, 'muzzleflash', { weapon: w.id });
  emit(ctx, 'player_anim', { anim: 'attack1', weapon: w.id });
  fireSound(w, ctx);
  anim(w, ctx, animName, cs);
  if (ejectNow) shell(w, ctx);
}

/** Hand one bullet (or a shotgun blast) to the game. Bullet direction = viewAngles + punch NOW. */
function shoot(w, ctx, o) {
  const d = w.def;
  const p = {
    weapon: w.id,
    shots: o.shots ?? 1,
    spread: o.spread,
    spreadX: o.spreadX ?? o.spread,
    spreadY: o.spreadY ?? o.spread,
    distance: o.distance ?? d.distance,
    penetration: o.penetration ?? d.penetration,
    bulletType: d.bulletType,
    damage: o.damage ?? d.damage,
    rangeModifier: o.rangeModifier ?? d.rangeModifier,
    pistol: !!o.pistol,
    silenced: !!w.silenced,
    srcOffsetRight: o.srcOffsetRight || 0,
  };
  if (ctx.random) p.random = ctx.random;
  w.lastShot = p;
  if (ctx.fireBullets) ctx.fireBullets(p);
  return p;
}

// ---------------------------------------------------------------- shared C++ helpers
/** CBasePlayerWeapon::KickBack (original, non-REGAMEDLL_ADD version). */
function kickBack(w, ctx, upBase, latBase, upMod, latMod, upMax, latMax, dirChange) {
  let up, lat;
  if (w.shotsFired === 1) { up = upBase; lat = latBase; }
  else { up = w.shotsFired * upMod + upBase; lat = w.shotsFired * latMod + latBase; }
  const p = ctx.punch;
  p[0] -= up;
  if (p[0] < -upMax) p[0] = -upMax;
  if (w.direction === 1) { p[1] += lat; if (p[1] > latMax) p[1] = latMax; }
  else { p[1] -= lat; if (p[1] < -latMax) p[1] = -latMax; }
  if (rndInt(ctx, 0, dirChange) === 0) w.direction = w.direction ? 0 : 1;
}

/** PM_DropPunchAngle: call once per frame (before weaponFrame) with the frame time. */
export function dropPunchAngle(punch, frametime) {
  let l = Math.hypot(punch[0], punch[1], punch[2]);
  if (l === 0) return punch;
  const nx = punch[0] / l, ny = punch[1] / l, nz = punch[2] / l;
  l -= (10 + l * 0.5) * frametime;
  if (l < 0) l = 0;
  punch[0] = nx * l; punch[1] = ny * l; punch[2] = nz * l;
  return punch;
}

function defaultDeploy(w, ctx, animName, cs) {
  const t = ctx.time;
  w.nextAttack = t + 0.75;
  w.timeIdle = t + 1.5;
  w.lastFireTime = 0;
  w.decreaseShotsFired = t;
  setFov(w, ctx, DEFAULT_FOV);
  w.lastZoom = DEFAULT_FOV;
  w.resumeZoom = false;
  anim(w, ctx, animName, cs, w.def.drawTime);
  return true;
}

function defaultReload(w, ctx, animName, cs, delay) {
  const r = reserve(w);
  if (r <= 0) return false;
  const j = Math.min(w.def.clip - w.clip, r);
  if (!j) return false;
  const t = ctx.time;
  w.nextAttack = t + delay;
  emit(ctx, 'reload_sound', { weapon: w.id }); // ReloadSound(): other players within 512 units hear it
  anim(w, ctx, animName, cs, delay);
  w.inReload = true;
  w.reloadEnd = t + delay;
  w.timeIdle = t + delay + 0.5;
  return true;
}

function defaultShotgunReload(w, ctx, delay, startDelay, insertSounds) {
  const t = ctx.time;
  if (reserve(w) <= 0 || w.clip === w.def.clip) return false;
  if (w.nextPrimary > t) return false; // don't reload until recoil is done
  if (w.specialReload === 0) {
    emit(ctx, 'player_anim', { anim: 'reload', weapon: w.id });
    anim(w, ctx, 'reload_start', 'start_reload', startDelay);
    w.specialReload = 1;
    w.nextSecondary = w.timeIdle = w.nextAttack = t + startDelay;
    w.nextPrimary = t + startDelay;
  } else if (w.specialReload === 1) {
    if (w.timeIdle > t) return false;
    w.specialReload = 2; // was waiting for gun to move to side
    if (insertSounds && insertSounds.length) {
      const s = insertSounds.length > 1 ? insertSounds[rndInt(ctx, 0, 1)] : insertSounds[0];
      sound(ctx, s, { channel: 'item', pitch: (85 + rndInt(ctx, 0, 31)) / 100, weapon: w.id });
    }
    anim(w, ctx, 'reload_insert', 'reload', delay);
    w.timeIdle = w.nextReload = t + delay;
  } else {
    // original (no BUILD_LATEST_FIXES): the shell is added without waiting for the insert anim
    w.clip++;
    setReserve(w, reserve(w) - 1);
    w.specialReload = 1;
  }
  return true;
}

function emptyFire(w, ctx) {
  if (w.fireOnEmpty) { playEmptySound(w, ctx); w.nextPrimary = ctx.time + 0.2; }
  emit(ctx, 'fired_on_empty', { weapon: w.id });
}

function accuracyFromShots(n, a) {
  const v = a.pow === 3 ? n * n * n : n * n;
  const q = a.int && !WEAPON_OPTIONS.floatAccuracyDivisor ? Math.trunc(v / a.div) : v / a.div;
  const acc = q + a.base;
  return acc > a.max ? a.max : acc;
}

// ---------------------------------------------------------------- automatic guns (rifles, SMGs, M249)
// spread(w, ctx) is evaluated in PrimaryAttack with the CURRENT accuracy (before this shot),
// then XXXFire() does m_iShotsFired++, recomputes accuracy, fires, and kicks with the new count.
const rs = (ctx, a, airB, airK, moveB, moveK, stdK, moveSpeed = 140) =>
  (!grounded(ctx) ? airB + airK * a : ctx.speed2d > moveSpeed ? moveB + moveK * a : stdK * a);
const KICK_RIFLE = 'rifle'; // velocity > 0, air, duck, standing
const KICK_SMG = 'smg';     // air, velocity > 0, duck, standing

const AUTO = {
  ak47: {
    spread: (w, ctx) => rs(ctx, w.accuracy, 0.04, 0.4, 0.04, 0.07, 0.0275), cycle: () => 0.0955,
    acc: { pow: 3, div: 200, int: true, base: 0.35, max: 1.25 }, idle: 1.9,
    kick: { order: KICK_RIFLE, move: [1.5, 0.45, 0.225, 0.05, 6.5, 2.5, 7], air: [2.0, 1.0, 0.5, 0.35, 9.0, 6.0, 5], duck: [0.9, 0.35, 0.15, 0.025, 5.5, 1.5, 9], std: [1.0, 0.375, 0.175, 0.0375, 5.75, 1.75, 8] },
    deploy: { acc: 0.2, shots: true }, reload: { acc: 0.2, shots: true, delayFire: false },
  },
  m4a1: {
    spread: (w, ctx) => rs(ctx, w.accuracy, 0.035, 0.4, 0.035, 0.07, w.silenced ? 0.025 : 0.02), cycle: () => 0.0875,
    acc: { pow: 3, div: 220, int: true, base: 0.3, max: 1 }, idle: 1.5,
    kick: { order: KICK_RIFLE, move: [1.0, 0.45, 0.28, 0.045, 3.75, 3.0, 7], air: [1.2, 0.5, 0.23, 0.15, 5.5, 3.5, 6], duck: [0.6, 0.3, 0.2, 0.0125, 3.25, 2.0, 7], std: [0.65, 0.35, 0.25, 0.015, 3.5, 2.25, 7] },
    deploy: { acc: 0.2, shots: true, delayFire: true }, reload: { acc: 0.2, shots: true, delayFire: false },
  },
  galil: {
    spread: (w, ctx) => rs(ctx, w.accuracy, 0.04, 0.3, 0.04, 0.07, 0.0375), cycle: () => 0.0875,
    acc: { pow: 3, div: 200, int: true, base: 0.35, max: 1.25 }, idle: 1.28,
    kick: { order: KICK_RIFLE, move: [1.0, 0.45, 0.28, 0.045, 3.75, 3.0, 7], air: [1.2, 0.5, 0.23, 0.15, 5.5, 3.5, 6], duck: [0.6, 0.3, 0.2, 0.0125, 3.25, 2.0, 7], std: [0.65, 0.35, 0.25, 0.015, 3.5, 2.25, 7] },
    deploy: { acc: 0.2, shots: true }, reload: { acc: 0.2, shots: true, delayFire: false },
  },
  famas: {
    spread: (w, ctx) => rs(ctx, w.accuracy, 0.030, 0.3, 0.030, 0.07, 0.02), cycle: () => 0.0825,
    acc: { pow: 3, div: 215, int: true, base: 0.3, max: 1 }, idle: 1.1,
    kick: { order: KICK_RIFLE, move: [1.0, 0.45, 0.275, 0.05, 4.0, 2.5, 7], air: [1.25, 0.45, 0.22, 0.18, 5.5, 4.0, 5], duck: [0.575, 0.325, 0.2, 0.011, 3.25, 2.0, 8], std: [0.625, 0.375, 0.25, 0.0125, 3.5, 2.25, 8] },
    deploy: { acc: 0.2, shots: true }, reload: { acc: 0, shots: true, delayFire: false },
  },
  sg552: {
    spread: (w, ctx) => rs(ctx, w.accuracy, 0.035, 0.45, 0.035, 0.075, 0.02), cycle: (w) => (w.fov === DEFAULT_FOV ? 0.0825 : 0.135),
    acc: { pow: 3, div: 220, int: true, base: 0.3, max: 1 }, idle: 2.0,
    kick: { order: KICK_RIFLE, move: [1.0, 0.45, 0.28, 0.04, 4.25, 2.5, 7], air: [1.25, 0.45, 0.22, 0.18, 6.0, 4.0, 5], duck: [0.6, 0.35, 0.2, 0.0125, 3.7, 2.0, 10], std: [0.625, 0.375, 0.25, 0.0125, 4.0, 2.25, 9] },
    deploy: { acc: 0.2, shots: true }, reload: { acc: 0.2, shots: true, delayFire: false, unzoom: true },
  },
  aug: {
    spread: (w, ctx) => rs(ctx, w.accuracy, 0.035, 0.4, 0.035, 0.07, 0.02), cycle: (w) => (w.fov === DEFAULT_FOV ? 0.0825 : 0.135),
    acc: { pow: 3, div: 215, int: true, base: 0.3, max: 1 }, idle: 1.9,
    kick: { order: KICK_RIFLE, move: [1.0, 0.45, 0.275, 0.05, 4.0, 2.5, 7], air: [1.25, 0.45, 0.22, 0.18, 5.5, 4.0, 5], duck: [0.575, 0.325, 0.2, 0.011, 3.25, 2.0, 8], std: [0.625, 0.375, 0.25, 0.0125, 3.5, 2.25, 8] },
    deploy: { acc: 0.2, shots: true }, reload: { acc: 0, shots: true, delayFire: false, unzoom: true },
  },
  m249: {
    spread: (w, ctx) => rs(ctx, w.accuracy, 0.045, 0.5, 0.045, 0.095, 0.03), cycle: () => 0.1,
    acc: { pow: 3, div: 175, int: true, base: 0.4, max: 0.9 }, idle: 1.6,
    kick: { order: KICK_SMG, air: [1.8, 0.65, 0.45, 0.125, 5.0, 3.5, 8], move: [1.1, 0.5, 0.3, 0.06, 4.0, 3.0, 8], duck: [0.75, 0.325, 0.25, 0.025, 3.5, 2.5, 9], std: [0.8, 0.35, 0.3, 0.03, 3.75, 3.0, 9] },
    deploy: { acc: 0.2, shots: true }, reload: { acc: 0.2, shots: true, delayFire: false },
  },
  mac10: {
    spread: (w, ctx) => (!grounded(ctx) ? 0.375 : 0.03) * w.accuracy, cycle: () => 0.07,
    acc: { pow: 3, div: 200, int: true, base: 0.6, max: 1.65 }, idle: 2.0,
    kick: { order: KICK_SMG, air: [1.3, 0.55, 0.4, 0.05, 4.75, 3.75, 5], move: [0.9, 0.45, 0.25, 0.035, 3.5, 2.75, 7], duck: [0.75, 0.4, 0.175, 0.03, 2.75, 2.5, 10], std: [0.775, 0.425, 0.2, 0.03, 3.0, 2.75, 9] },
    deploy: { acc: 0.15, delayFire: false }, reload: { acc: 0, shots: true },
  },
  tmp: {
    spread: (w, ctx) => (!grounded(ctx) ? 0.25 : 0.03) * w.accuracy, cycle: () => 0.07,
    acc: { pow: 3, div: 200, int: true, base: 0.55, max: 1.4 }, idle: 2.0,
    kick: { order: KICK_SMG, air: [1.1, 0.5, 0.35, 0.045, 4.5, 3.5, 6], move: [0.8, 0.4, 0.2, 0.03, 3.0, 2.5, 7], duck: [0.7, 0.35, 0.125, 0.025, 2.5, 2.0, 10], std: [0.725, 0.375, 0.15, 0.025, 2.75, 2.25, 9] },
    deploy: { acc: 0.2, shots: true, delayFire: false }, reload: { acc: 0.2, shots: true },
  },
  mp5: {
    spread: (w, ctx) => (!grounded(ctx) ? 0.2 : 0.04) * w.accuracy, cycle: () => 0.075,
    acc: { pow: 2, div: 220.1, int: false, base: 0.45, max: 0.75 }, idle: 2.0, // MP5N_ACCURACY_DIVISOR is a double
    kick: { order: KICK_SMG, air: [0.9, 0.475, 0.35, 0.0425, 5.0, 3.0, 6], move: [0.5, 0.275, 0.2, 0.03, 3.0, 2.0, 10], duck: [0.225, 0.15, 0.1, 0.015, 2.0, 1.0, 10], std: [0.25, 0.175, 0.125, 0.02, 2.25, 1.25, 10] },
    deploy: { acc: 0, delayFire: false }, reload: { acc: 0, shots: true },
  },
  ump45: {
    spread: (w, ctx) => (!grounded(ctx) ? 0.24 : 0.04) * w.accuracy, cycle: () => 0.1,
    acc: { pow: 2, div: 210, int: true, base: 0.5, max: 1 }, idle: 2.0,
    kick: { order: KICK_SMG, air: [0.125, 0.65, 0.55, 0.0475, 5.5, 4.0, 10], move: [0.55, 0.3, 0.225, 0.03, 3.5, 2.5, 10], duck: [0.25, 0.175, 0.125, 0.02, 2.25, 1.25, 10], std: [0.275, 0.2, 0.15, 0.0225, 2.5, 1.5, 10] },
    deploy: { acc: 0, delayFire: false }, reload: { acc: 0, shots: true },
  },
  p90: {
    spread: (w, ctx) => (!grounded(ctx) ? 0.3 : ctx.speed2d > 170 ? 0.115 : 0.045) * w.accuracy, cycle: () => 0.066,
    acc: { pow: 2, div: 175, int: true, base: 0.45, max: 1 }, idle: 2.0,
    kick: { order: KICK_SMG, air: [0.9, 0.45, 0.35, 0.04, 5.25, 3.5, 4], move: [0.45, 0.3, 0.2, 0.0275, 4.0, 2.25, 7], duck: [0.275, 0.2, 0.125, 0.02, 3.0, 1.0, 9], std: [0.3, 0.225, 0.125, 0.02, 3.25, 1.25, 8] },
    deploy: { acc: 0.2, shots: true, delayFire: false }, reload: { acc: 0.2, shots: true },
  },
};

/** GetBaseAccuracy (only used with WEAPON_OPTIONS.resetAccuracyOnDecay). */
const BASE_ACCURACY = { m4a1: 0.2, ak47: 0.2, aug: 0.2, sg552: 0.2, famas: 0.2, galil: 0.2, m249: 0.2, p90: 0.2, tmp: 0.2, mac10: 0.15, ump45: 0, mp5: 0 };

function pickKick(ctx, k) {
  const moving = ctx.speed2d > 0, air = !grounded(ctx), duck = !!ctx.ducking;
  if (k.order === KICK_RIFLE) return moving ? k.move : air ? k.air : duck ? k.duck : k.std;
  return air ? k.air : moving ? k.move : duck ? k.duck : k.std;
}

function autoShootAnim(w, ctx) {
  const n = 1 + rndInt(ctx, 0, w.id === 'm249' ? 1 : 2);
  return [`shoot${n}`, (w.id === 'm4a1' && !w.silenced ? 'unsil_shoot' : 'shoot') + n];
}

/** AK47Fire / M4A1Fire / ... : returns true when a round left the barrel. */
function autoFire(w, ctx, spread, cycle, extra = {}) {
  const cfg = AUTO[w.id];
  const t = ctx.time;
  w.delayFire = true;
  w.shotsFired++;
  w.accuracy = accuracyFromShots(w.shotsFired, cfg.acc);
  if (w.clip <= 0) { emptyFire(w, ctx); return false; }
  w.clip--;
  shoot(w, ctx, { spread, damage: extra.damage, rangeModifier: extra.rangeModifier });
  const [a, cs] = autoShootAnim(w, ctx);
  shootEffects(w, ctx, a, cs, { muzzle: !w.silenced });
  w.nextPrimary = w.nextSecondary = t + cycle;
  w.timeIdle = t + cfg.idle;
  const k = pickKick(ctx, cfg.kick);
  kickBack(w, ctx, ...k);
  return true;
}

function autoPrimary(w, ctx) {
  const cfg = AUTO[w.id];
  const spread = cfg.spread(w, ctx);
  const cycle = cfg.cycle(w);
  if (w.id === 'm4a1') {
    autoFire(w, ctx, spread, cycle, w.silenced ? { damage: w.def.damageSilenced, rangeModifier: w.def.rangeModifierSilenced } : {});
  } else if (w.id === 'famas') famasFire(w, ctx, spread, cycle, w.burstMode);
  else autoFire(w, ctx, spread, cycle);
}

function famasFire(w, ctx, spread, cycle, burst) {
  if (burst) { w.famasShotsFired = 0; cycle = w.def.burstCycleTime; }
  else spread += 0.01;
  const fired = autoFire(w, ctx, spread, cycle, { damage: burst ? w.def.burstDamage : w.def.damage });
  if (fired && burst) {
    w.famasShotsFired++;
    w.burstSpread = spread;
    w.famasShoot = ctx.time + 0.05;
  }
}

/** CBasePlayerWeapon::FireRemaining - the 2nd/3rd round of a Glock/FAMAS burst. */
function fireRemaining(w, ctx, isGlock) {
  const t = ctx.time;
  const shotsKey = isGlock ? 'glockShotsFired' : 'famasShotsFired';
  const timeKey = isGlock ? 'glockShoot' : 'famasShoot';
  if (--w.clip < 0) { w.clip = 0; w[shotsKey] = 3; w[timeKey] = 0; return; }
  if (isGlock) {
    shoot(w, ctx, { spread: w.def.burstSpread, distance: 8192, penetration: 1, damage: w.def.burstDamage, rangeModifier: w.def.burstRangeModifier, pistol: true });
    shootEffects(w, ctx, w.clip === 0 ? 'shoot_empty' : 'shoot3', w.clip === 0 ? 'shoot_empty' : 'shoot3');
  } else {
    // non-API build: FAMAS_DAMAGE (30), not the 34 of the burst's first round
    shoot(w, ctx, { spread: w.burstSpread, distance: 8192, penetration: 2, damage: w.def.damage, rangeModifier: 0.96 });
    const [a, cs] = autoShootAnim(w, ctx);
    shootEffects(w, ctx, a, cs);
  }
  if (++w[shotsKey] !== 3) w[timeKey] = t + 0.1;
  else w[timeKey] = 0;
}

function autoReload(w, ctx) {
  const cfg = AUTO[w.id];
  let a = 'reload', cs = 'reload';
  if (w.id === 'm4a1' && !w.silenced) cs = 'unsil_reload';
  if (defaultReload(w, ctx, a, cs, w.def.reloadTime)) {
    emit(ctx, 'player_anim', { anim: 'reload', weapon: w.id });
    if (cfg.reload.unzoom && w.fov !== DEFAULT_FOV) zoomAugSg552(w, ctx); // SecondaryAttack()
    if (w.id === 'famas' && w.fov !== DEFAULT_FOV) famasSecondary(w, ctx); // (sic) never true for the FAMAS
    if (cfg.reload.acc != null) w.accuracy = cfg.reload.acc;
    if (cfg.reload.shots) w.shotsFired = 0;
    if (cfg.reload.delayFire != null) w.delayFire = cfg.reload.delayFire;
  }
}

function autoDeploy(w, ctx) {
  const cfg = AUTO[w.id];
  const dd = cfg.deploy;
  if (dd.delayFire != null) w.delayFire = dd.delayFire;
  if (dd.acc != null) w.accuracy = dd.acc;
  if (dd.shots) w.shotsFired = 0;
  if (w.id === 'famas') { w.famasShotsFired = 0; w.famasShoot = 0; }
  defaultDeploy(w, ctx, 'draw', w.id === 'm4a1' && !w.silenced ? 'unsil_draw' : 'draw');
}

function autoIdle(w, ctx) {
  resetEmptySound(w);
  if (w.timeIdle > ctx.time) return;
  w.timeIdle = ctx.time + 20;
  anim(w, ctx, 'idle', w.id === 'm4a1' ? (w.silenced ? 'idle' : 'unsil_idle') : SEQ[w.id][0]);
}

function m4a1Secondary(w, ctx) {
  const t = ctx.time;
  w.silenced = !w.silenced;
  anim(w, ctx, w.silenced ? 'attach_silencer' : 'detach_silencer', w.silenced ? 'attach_silencer' : 'detach_silencer', w.def.silencerTime);
  sound(ctx, w.silenced ? w.def.sounds.silencerOn : w.def.sounds.silencerOff, { channel: 'item', weapon: w.id }); // anim event in the real model
  w.timeIdle = w.nextSecondary = t + 2.0;
  w.nextPrimary = t + 2.0;
}

function famasSecondary(w, ctx) {
  w.burstMode = !w.burstMode;
  emit(ctx, 'hud_message', { text: w.burstMode ? '#Switch_To_BurstFire' : '#Switch_To_FullAuto' });
  w.nextSecondary = ctx.time + 0.3;
}

function zoomAugSg552(w, ctx) {
  setFov(w, ctx, w.fov === DEFAULT_FOV ? 55 : DEFAULT_FOV);
  w.nextSecondary = ctx.time + 0.3;
}

// ---------------------------------------------------------------- pistols
const PISTOL = {
  //            air    moving  duck   stand  cycle  -sub   accT   accK   min    max    idle punch
  glock: { s: [1.0, 0.165, 0.075, 0.1], burstS: [1.2, 0.185, 0.095, 0.3], cycle: 0.2, sub: 0.05, accT: 0.325, accK: 0.275, min: 0.6, max: 0.9, idle: 2.5, punch: 0, base: 0.9 },
  usp: { s: [1.2, 0.225, 0.08, 0.1], silS: [1.3, 0.25, 0.125, 0.15], cycle: 0.225, sub: 0.075, accT: 0.3, accK: 0.275, min: 0.6, max: 0.92, idle: 2.0, punch: 2, base: 0.92 },
  p228: { s: [1.5, 0.255, 0.075, 0.15], cycle: 0.2, sub: 0.05, accT: 0.325, accK: 0.3, min: 0.6, max: 0.9, idle: 2.0, punch: 2, base: 0.9 },
  deagle: { s: [1.5, 0.25, 0.115, 0.13], cycle: 0.3, sub: 0.075, accT: 0.4, accK: 0.35, min: 0.55, max: 0.9, idle: 1.8, punch: 2, base: 0.9 },
  elite: { s: [1.3, 0.175, 0.08, 0.1], cycle: 0.2, sub: 0.125, accT: 0.325, accK: 0.275, min: 0.55, max: 0.88, idle: 2.0, punch: 2, base: 0.88 },
  fiveseven: { s: [1.5, 0.255, 0.075, 0.15], cycle: 0.2, sub: 0.05, accT: 0.275, accK: 0.25, min: 0.725, max: 0.92, idle: 2.0, punch: 2, base: 0.92 },
};

function pistolSpread(ctx, s, acc) {
  const k = 1 - acc;
  if (!grounded(ctx)) return s[0] * k;
  if (ctx.speed2d > 0) return s[1] * k;
  if (ctx.ducking) return s[2] * k;
  return s[3] * k;
}

function pistolShootAnim(w, ctx) {
  const empty = w.clip === 0;
  switch (w.id) {
    case 'glock': return empty ? ['shoot_empty', 'shoot_empty'] : ['shoot3', 'shoot3'];
    case 'usp': { const n = 1 + rndInt(ctx, 0, 2); const p = w.silenced ? '' : 'unsil_'; return empty ? ['shoot_empty', `${p}shoot_empty`] : [`shoot${n}`, `${p}shoot${n}`]; }
    case 'p228': { const n = 1 + rndInt(ctx, 0, 2); return empty ? ['shoot_empty', 'shoot_empty'] : [`shoot${n}`, `shoot${n}`]; }
    default: { const n = 1 + rndInt(ctx, 0, 1); return empty ? ['shoot_empty', 'shoot_empty'] : [`shoot${n}`, `shoot${n}`]; }
  }
}

/** USPFire / P228Fire / DEAGLEFire / ELITEFire / FiveSevenFire / GLOCK18Fire. */
function pistolFire(w, ctx, spread, cycle, burst = false) {
  const P = PISTOL[w.id];
  const t = ctx.time;
  if (burst) w.glockShotsFired = 0;
  else {
    if (w.id !== 'glock') cycle -= P.sub;
    if (++w.shotsFired > 1) return false; // semi-automatic: needs a trigger release
    if (w.id === 'glock') cycle -= P.sub;
  }
  if (w.lastFire) {
    // accuracy depends on the time since the previous shot (applies to the NEXT shot's spread)
    w.accuracy -= (P.accT - (t - w.lastFire)) * P.accK;
    if (w.accuracy > P.max) w.accuracy = P.max;
    else if (w.accuracy < P.min) w.accuracy = P.min;
  }
  w.lastFire = t;
  if (w.clip <= 0) { emptyFire(w, ctx); return false; }
  w.clip--;
  const o = { spread, pistol: true };
  if (w.id === 'usp' && w.silenced) o.damage = w.def.damageSilenced;
  let a, cs;
  if (w.id === 'elite') {
    // alternate guns, each 5 units to the side of the eye
    if (w.eliteLeft) { w.eliteLeft = false; o.srcOffsetRight = -5; a = 'shoot_left'; cs = w.clip <= 1 ? 'shootleftlast' : `shootleft${1 + rndInt(ctx, 0, 4)}`; }
    else { w.eliteLeft = true; o.srcOffsetRight = 5; a = 'shoot_right'; cs = w.clip <= 1 ? 'shootrightlast' : `shootright${1 + rndInt(ctx, 0, 4)}`; }
  } else [a, cs] = pistolShootAnim(w, ctx);
  shoot(w, ctx, o);
  shootEffects(w, ctx, a, cs, { muzzle: !(w.id === 'usp' && w.silenced) });
  w.nextPrimary = w.nextSecondary = t + cycle;
  w.timeIdle = t + P.idle;
  if (burst) { w.glockShotsFired++; w.glockShoot = t + 0.1; }
  if (P.punch) ctx.punch[0] -= P.punch;
  return true;
}

function pistolPrimary(w, ctx) {
  const P = PISTOL[w.id];
  if (w.id === 'glock' && w.burstMode) return pistolFire(w, ctx, pistolSpread(ctx, P.burstS, w.accuracy), w.def.burstCycleTime, true);
  const s = w.id === 'usp' && w.silenced ? P.silS : P.s;
  return pistolFire(w, ctx, pistolSpread(ctx, s, w.accuracy), P.cycle);
}

function pistolDeploy(w, ctx) {
  const P = PISTOL[w.id];
  w.accuracy = P.base;
  let cs = 'draw';
  if (w.id === 'glock') { w.glockShotsFired = 0; w.glockShoot = 0; cs = rndInt(ctx, 0, 1) ? 'draw' : 'draw2'; }
  if (w.id === 'usp' && !w.silenced) cs = 'unsil_draw';
  if (w.id === 'elite' && !(w.clip & 1)) w.eliteLeft = true;
  defaultDeploy(w, ctx, 'draw', cs);
}

function pistolReload(w, ctx) {
  let cs = 'reload';
  if (w.id === 'glock') cs = rndInt(ctx, 0, 1) ? 'reload' : 'reload2';
  if (w.id === 'usp' && !w.silenced) cs = 'unsil_reload';
  if (defaultReload(w, ctx, 'reload', cs, w.def.reloadTime)) {
    emit(ctx, 'player_anim', { anim: 'reload', weapon: w.id });
    w.accuracy = PISTOL[w.id].base;
  }
}

function pistolIdle(w, ctx) {
  resetEmptySound(w);
  const t = ctx.time;
  if (w.timeIdle > t || !w.clip) return; // only idle if the slide isn't back
  switch (w.id) {
    case 'glock': {
      const r = rnd(ctx);
      if (r <= 0.3) { w.timeIdle = t + 3.0625; anim(w, ctx, 'idle', 'idle3'); }
      else if (r <= 0.6) { w.timeIdle = t + 3.75; anim(w, ctx, 'idle', 'idle1'); }
      else { w.timeIdle = t + 2.5; anim(w, ctx, 'idle', 'idle2'); }
      break;
    }
    case 'usp': w.timeIdle = t + 60; anim(w, ctx, 'idle', w.silenced ? 'idle' : 'unsil_idle'); break;
    case 'elite': w.timeIdle = t + 60; anim(w, ctx, 'idle', w.clip === 1 ? 'idle_leftempty' : 'idle'); break;
    case 'deagle': w.timeIdle = t + 20; anim(w, ctx, 'idle', 'idle1'); break;
    default: w.timeIdle = t + 3.0625; anim(w, ctx, 'idle', 'idle');
  }
}

function glockSecondary(w, ctx) {
  w.burstMode = !w.burstMode;
  emit(ctx, 'hud_message', { text: w.burstMode ? '#Switch_To_BurstFire' : '#Switch_To_SemiAuto' });
  w.nextSecondary = ctx.time + 0.3;
}

function uspSecondary(w, ctx) {
  const t = ctx.time;
  w.silenced = !w.silenced;
  anim(w, ctx, w.silenced ? 'attach_silencer' : 'detach_silencer', w.silenced ? 'attach_silencer' : 'detach_silencer', w.def.silencerTime);
  sound(ctx, w.silenced ? w.def.sounds.silencerOn : w.def.sounds.silencerOff, { channel: 'item', weapon: w.id });
  w.nextSecondary = w.timeIdle = t + w.def.silencerTime; // USP_ADJUST_SIL_TIME (3.0, 3.13 with fixes)
  w.nextPrimary = t + w.def.silencerTime;
}

// ---------------------------------------------------------------- snipers
function sniperZoom(w, ctx) {
  // AWP: 90 -> 40 -> 10 -> 90; Scout / G3SG1 / SG550: 90 -> 40 -> 15 -> 90
  const [z1, z2] = w.def.zoomLevels;
  let fov;
  if (w.fov === DEFAULT_FOV) fov = z1;
  else if (w.fov === z1) fov = z2;
  else fov = DEFAULT_FOV;
  setFov(w, ctx, fov);
  emit(ctx, 'reset_max_speed', { weapon: w.id });
  sound(ctx, 'zoom', { channel: 'item', volume: 0.2, weapon: w.id });
  w.nextSecondary = ctx.time + 0.3;
}

function boltSniperFire(w, ctx, spread, cycle) {
  // AWPFire / SCOUTFire: the shot always unzooms; the zoom comes back when m_flNextPrimaryAttack passes
  const t = ctx.time;
  const isAwp = w.id === 'awp';
  if (w.fov !== DEFAULT_FOV) {
    w.resumeZoom = true;
    w.lastZoom = w.fov;
    setFov(w, ctx, DEFAULT_FOV);
  } else spread += isAwp ? 0.08 : 0.025; // not zoomed: the bullet diverts more
  if (w.clip <= 0) { emptyFire(w, ctx); return false; }
  w.clip--;
  w.ejectBrassAt = t + w.def.ejectDelay;
  shoot(w, ctx, { spread, pistol: true });
  const n = 1 + rndInt(ctx, 0, isAwp ? 2 : 1);
  shootEffects(w, ctx, `shoot${n}`, n === 1 ? 'shoot' : `shoot${n}`, { muzzle: isAwp, ejectNow: false });
  w.nextPrimary = w.nextSecondary = t + cycle;
  w.timeIdle = t + (isAwp ? 2.0 : 1.8);
  ctx.punch[0] -= 2;
  return true;
}

function awpPrimary(w, ctx) {
  let s;
  if (!grounded(ctx)) s = 0.85;
  else if (ctx.speed2d > 140) s = 0.25;
  else if (ctx.speed2d > 10) s = 0.1;
  else if (ctx.ducking) s = 0;
  else s = 0.001;
  boltSniperFire(w, ctx, s, 1.45);
}

function scoutPrimary(w, ctx) {
  let s;
  if (!grounded(ctx)) s = 0.2;
  else if (ctx.speed2d > 170) s = 0.075;
  else if (ctx.ducking) s = 0;
  else s = 0.007;
  boltSniperFire(w, ctx, s, 1.25);
}

function autoSniperFire(w, ctx, spread) {
  // G3SG1Fire / SG550Fire
  const t = ctx.time;
  const g3 = w.id === 'g3sg1';
  if (w.fov === DEFAULT_FOV) spread += 0.025;
  if (w.lastFire) {
    w.accuracy = (t - w.lastFire) * (g3 ? 0.3 : 0.35) + (g3 ? 0.55 : 0.65);
    if (w.accuracy > 0.98) w.accuracy = 0.98;
  } else if (g3) w.accuracy = 0.98;
  w.lastFire = t;
  if (w.clip <= 0) { emptyFire(w, ctx); return false; }
  w.clip--;
  // G3SG1 scales by (1 - accuracy) AFTER updating it, the SG550 already did in PrimaryAttack
  shoot(w, ctx, { spread: g3 ? (1 - w.accuracy) * spread : spread, pistol: true });
  const n = 1 + rndInt(ctx, 0, 1);
  shootEffects(w, ctx, `shoot${n}`, n === 1 ? 'shoot' : 'shoot2');
  w.nextPrimary = w.nextSecondary = t + 0.25;
  w.timeIdle = t + 1.8;
  const p = ctx.punch;
  p[0] -= rndFloat(ctx, 0.75, g3 ? 1.75 : 1.25) + p[0] * 0.25;
  p[1] += rndFloat(ctx, -0.75, 0.75);
  return true;
}

function g3sg1Primary(w, ctx) {
  let s;
  if (!grounded(ctx)) s = 0.45;
  else if (ctx.speed2d > 0) s = 0.15;
  else if (ctx.ducking) s = 0.035;
  else s = 0.055;
  autoSniperFire(w, ctx, s);
}

function sg550Primary(w, ctx) {
  const k = 1 - w.accuracy;
  let s;
  if (!grounded(ctx)) s = 0.45 * k;
  else if (ctx.speed2d > 0) s = 0.15;
  else if (ctx.ducking) s = 0.04 * k;
  else s = 0.05 * k;
  autoSniperFire(w, ctx, s);
}

function sniperDeploy(w, ctx) {
  const t = ctx.time;
  if (w.id === 'g3sg1') w.accuracy = 0.2;
  defaultDeploy(w, ctx, 'draw', 'draw');
  if (w.id === 'awp') { w.nextAttack = t + 1.45; w.nextPrimary = w.nextAttack; w.nextSecondary = t + 1.0; }
  else if (w.id === 'scout') { w.nextPrimary = w.nextAttack = t + 1.25; w.nextSecondary = t + 1.0; }
}

function sniperReload(w, ctx) {
  if (defaultReload(w, ctx, 'reload', 'reload', w.def.reloadTime)) {
    emit(ctx, 'player_anim', { anim: 'reload', weapon: w.id });
    if (w.id === 'g3sg1') w.accuracy = 0.2;
    if (w.fov !== DEFAULT_FOV) {
      // set the last zoom level then "zoom" once more -> back to 90
      w.fov = w.def.zoomLevels[1];
      sniperZoom(w, ctx);
    }
  }
}

function sniperIdle(w, ctx) {
  resetEmptySound(w);
  if (w.timeIdle > ctx.time || !w.clip) return;
  w.timeIdle = ctx.time + 60;
  anim(w, ctx, 'idle', 'idle');
}

// ---------------------------------------------------------------- shotguns
function shotgunPrimary(w, ctx) {
  const d = w.def, t = ctx.time;
  const m3 = w.id === 'm3';
  if (w.clip <= 0) {
    shotgunReload(w, ctx);
    if (!w.clip) playEmptySound(w, ctx);
    w.nextPrimary = t + 1;
    return;
  }
  w.clip--;
  shoot(w, ctx, { shots: d.pellets, spread: d.cone, spreadX: d.cone, spreadY: d.cone, distance: d.distance, penetration: 0, damage: d.damage, rangeModifier: 1 });
  const n = 1 + rndInt(ctx, 0, 1);
  shootEffects(w, ctx, `shoot${n}`, `fire${n}`, { ejectNow: !m3 });
  w.nextPrimary = t + d.cycleTime;
  w.nextSecondary = t + d.cycleTime;
  w.timeIdle = w.clip !== 0 ? t + (m3 ? 2.5 : 2.25) : t + (m3 ? 0.875 : 0.75);
  w.specialReload = 0;
  ctx.punch[0] -= grounded(ctx) ? rndInt(ctx, m3 ? 4 : 3, m3 ? 6 : 5) : rndInt(ctx, m3 ? 8 : 7, m3 ? 11 : 10);
  if (m3) w.ejectBrassAt = t + d.ejectDelay;
}

function shotgunReload(w, ctx) {
  const d = w.def;
  return defaultShotgunReload(w, ctx, d.reloadInsertTime, d.reloadStartTime, d.sounds.insertSounds || null);
}

function shotgunIdle(w, ctx) {
  resetEmptySound(w);
  const t = ctx.time;
  if (!(w.timeIdle < t)) return;
  if (w.clip === 0 && w.specialReload === 0 && reserve(w)) shotgunReload(w, ctx);
  else if (w.specialReload !== 0) {
    if (w.clip !== w.def.clip && reserve(w)) shotgunReload(w, ctx);
    else {
      anim(w, ctx, 'reload_end', 'pump'); // reload debounce has timed out
      w.specialReload = 0;
      w.timeIdle = t + 1.5;
    }
  } else {
    w.timeIdle = t + 20; // original re-sent the idle anim every frame here (visual only)
    anim(w, ctx, 'idle', 'idle');
  }
}

// ---------------------------------------------------------------- knife
function knifeHitSound(ctx, w, tr, stab) {
  if (tr.hitPlayer) sound(ctx, stab ? 'knife_stab' : `knife_hit${1 + rndInt(ctx, 0, 3)}`, { channel: 'weapon', weapon: w.id });
  else sound(ctx, 'knife_hitwall1', { channel: 'item', pitch: (98 + rndInt(ctx, 0, 3)) / 100, weapon: w.id });
}

function knifeSwing(w, ctx) {
  const t = ctx.time;
  const tr = (ctx.knifeTrace && ctx.knifeTrace(w.def.swingRange)) || { hit: false };
  const n = (w.swing++ % 2) + 1;
  anim(w, ctx, `slash${n}`, `midattack${n}hit`);
  emit(ctx, 'player_anim', { anim: 'attack1', weapon: w.id });
  w.timeIdle = t + 2.0;
  if (!tr.hit) {
    w.nextPrimary = t + 0.35;
    w.nextSecondary = t + 0.5;
    sound(ctx, rndInt(ctx, 0, 1) ? 'knife_slash1' : 'knife_slash2', { channel: 'weapon', pitch: 0.94, weapon: w.id });
    return false;
  }
  w.nextPrimary = t + 0.4;
  w.nextSecondary = t + 0.5;
  // KnifeSwingDamage(m_flNextPrimaryAttack + 0.4 < now): evaluated after nextPrimary was just set,
  // so it is always false -> 15 damage (the 20 "fast" damage is unreachable in CS 1.6).
  const dmg = w.nextPrimary + 0.4 < t ? w.def.damageFast : w.def.damage;
  const target = tr.hitPlayer ?? tr.entity ?? null;
  if (target && ctx.knifeDamage) ctx.knifeDamage(target, dmg, tr.hitgroup);
  knifeHitSound(ctx, w, tr, false);
  return true;
}

function knifeStab(w, ctx) {
  const t = ctx.time;
  const tr = (ctx.knifeTrace && ctx.knifeTrace(w.def.stabRange)) || { hit: false };
  emit(ctx, 'player_anim', { anim: 'attack1', weapon: w.id });
  if (!tr.hit) {
    anim(w, ctx, 'stab_miss', 'stabmiss');
    w.nextPrimary = t + 1.0;
    w.nextSecondary = t + 1.0;
    sound(ctx, rndInt(ctx, 0, 1) ? 'knife_slash1' : 'knife_slash2', { channel: 'weapon', pitch: 0.94, weapon: w.id });
    return false;
  }
  anim(w, ctx, 'stab', 'stabhit');
  w.nextPrimary = t + 1.1;
  w.nextSecondary = t + 1.1;
  let dmg = w.def.stabDamage;
  if (tr.hitPlayer && tr.behind) dmg *= w.def.backstabMultiplier; // dot(attacker fwd, victim fwd) > 0.8
  const target = tr.hitPlayer ?? tr.entity ?? null;
  if (target && ctx.knifeDamage) ctx.knifeDamage(target, dmg, tr.hitgroup);
  knifeHitSound(ctx, w, tr, true);
  return true;
}

function knifeDeploy(w, ctx) {
  sound(ctx, 'knife_deploy1', { channel: 'item', volume: 0.3, weapon: w.id });
  w.swing = 0;
  defaultDeploy(w, ctx, 'draw', 'draw');
}

function knifeIdle(w, ctx) {
  resetEmptySound(w);
  if (w.timeIdle > ctx.time) return;
  w.timeIdle = ctx.time + 20;
  anim(w, ctx, 'idle', 'idle');
}

// ---------------------------------------------------------------- grenades
function grenadePrimary(w, ctx) {
  if (!w.startThrow && reserve(w) > 0) {
    w.releaseThrow = 0;
    w.startThrow = ctx.time;
    w.pinPulled = true;
    anim(w, ctx, 'pinpull', w.id === 'smokegrenade' ? 'pinpull' : 'pullpin', 0.5);
    w.timeIdle = ctx.time + 0.5;
  }
}

function grenadeIdle(w, ctx) {
  const t = ctx.time;
  if (w.id === 'smokegrenade' ? w.releaseThrow === 0 : (w.releaseThrow === 0 && w.startThrow !== 0)) w.releaseThrow = t;
  if (w.timeIdle > t) return;
  if (w.startThrow) {
    emit(ctx, 'radio', { message: 'fire_in_the_hole', text: '#Fire_in_the_hole' });
    const th = grenadeThrow(ctx.viewAngles || [0, 0, 0], ctx.punch || [0, 0, 0]);
    if (ctx.throwGrenade) {
      ctx.throwGrenade(w.id, { angles: th.angles, speed: th.speed, fuse: 1.5, forwardOffset: 16, addOwnerVelocity: true });
    }
    anim(w, ctx, 'throw', 'throw');
    emit(ctx, 'player_anim', { anim: 'attack1', weapon: w.id });
    w.startThrow = 0;
    w.pinPulled = false;
    w.spent = true;
    w.nextPrimary = t + 0.5;
    w.timeIdle = t + 0.75;
    setReserve(w, reserve(w) - 1);
    if (reserve(w) <= 0) {
      // just threw last grenade: let the throw animation finish, idle will retire the weapon
      w.timeIdle = w.nextSecondary = w.nextPrimary = t + 0.5;
    }
  } else if (w.releaseThrow > 0) {
    // we've finished the throw, restart
    w.startThrow = 0;
    if (w.id === 'flashbang') { retire(w, ctx); return; } // (sic) even with a second flashbang left
    if (reserve(w)) anim(w, ctx, 'draw', 'draw');
    else { retire(w, ctx); return; }
    w.timeIdle = t + rndFloat(ctx, 10, 15);
    w.releaseThrow = -1;
  } else if (reserve(w)) {
    anim(w, ctx, 'idle', 'idle');
    w.timeIdle = t + rndFloat(ctx, 10, 15);
  }
}

function grenadeDeploy(w, ctx) {
  w.releaseThrow = -1;
  w.pinPulled = false;
  defaultDeploy(w, ctx, 'draw', 'draw');
}

// ---------------------------------------------------------------- zombie survival specials
// Flamethrower: burns 1 fuel per 0.05 s while held; the game does the stream (ctx.flame).
function flamePrimary(w, ctx) {
  const t = ctx.time;
  if (w.clip <= 0) { emptyFire(w, ctx); return; }
  w.clip--;
  if (ctx.flame) ctx.flame(w);
  if (!(w.flaming > t - 0.15)) anim(w, ctx, 'shoot1', 'shoot1');
  w.flaming = t;
  emit(ctx, 'player_anim', { anim: 'attack1', weapon: w.id });
  w.nextPrimary = t + w.def.cycleTime;
  w.timeIdle = t + 1.0;
}

// RPG / M32: one projectile per pull (semi-auto), the game launches it (ctx.launch).
function launcherPrimary(w, ctx) {
  const t = ctx.time;
  if (w.clip <= 0) { emptyFire(w, ctx); return; }
  if (w.shotsFired > 0) return; // trigger must be released between shots
  w.shotsFired = 1;
  w.clip--;
  if (ctx.launch) ctx.launch(w.id === 'rpg' ? 'rocket' : 'grenade40', w);
  shootEffects(w, ctx, 'shoot1', 'shoot1', { ejectNow: false });
  if (ctx.punch) ctx.punch[0] -= w.def.kick;
  w.nextPrimary = t + w.def.cycleTime;
  w.timeIdle = t + 2;
}

function specialReload(w, ctx) {
  if (defaultReload(w, ctx, 'reload', 'reload', w.def.reloadTime)) emit(ctx, 'player_anim', { anim: 'reload', weapon: w.id });
}

function specialIdle(w, ctx) {
  if (w.def.kind === 'launcher') w.shotsFired = 0;
  resetEmptySound(w);
  if (w.timeIdle > ctx.time) return;
  w.timeIdle = ctx.time + 20;
  anim(w, ctx, 'idle', 'idle1');
}

// Medkit: attack patches yourself up, attack2 the teammate in front of you. One kit per
// use: the heal lands when the use animation ends (holding the button or not); the game
// picks the patient (ctx.healTarget(other) -> player | null) and heals (ctx.heal(player)).
function medkitPrimary(w, ctx) { if (!medkitFinish(w, ctx)) medkitStart(w, ctx, false); }
function medkitSecondary(w, ctx) { if (!medkitFinish(w, ctx)) medkitStart(w, ctx, true); }

function medkitStart(w, ctx, other) {
  const t = ctx.time;
  if (w.healEnd || reserve(w) <= 0) return;
  const target = ctx.healTarget ? ctx.healTarget(other) : null;
  if (!target) {
    w.nextPrimary = w.nextSecondary = t + 0.6;
    emit(ctx, 'hud_message', { text: other ? 'Nobody hurt in front of you to patch up' : 'You are already at full health' });
    return;
  }
  w.healEnd = t + w.def.useTime;
  w.healTarget = target;
  w.nextPrimary = w.nextSecondary = w.healEnd;
  anim(w, ctx, 'use', 'use', w.def.useTime);
  sound(ctx, 'medkit_use', { channel: 'weapon', weapon: w.id });
  emit(ctx, 'progress_bar', { time: w.def.useTime });
  emit(ctx, 'player_anim', { anim: 'attack1', weapon: w.id });
}

/** The use is over: heal, spend the kit. True if this frame finished one. */
function medkitFinish(w, ctx) {
  const t = ctx.time;
  if (!w.healEnd || t < w.healEnd) return false;
  w.healEnd = 0;
  if (ctx.heal) ctx.heal(w.healTarget, w.def.heal);
  w.healTarget = null;
  w.spent = true; // (the host takes one off its stack)
  const left = Math.max(0, (w.count ?? reserve(w)) - 1);
  setReserve(w, left);
  w.nextPrimary = w.nextSecondary = t + 0.35;
  w.timeIdle = t + 0.35;
  if (left <= 0) { retire(w, ctx); return true; }
  anim(w, ctx, 'draw', 'draw');
  return true;
}

function medkitIdle(w, ctx) {
  if (medkitFinish(w, ctx) || w.healEnd) return;
  if (w.timeIdle > ctx.time) return;
  w.timeIdle = ctx.time + rndFloat(ctx, 10, 15);
  anim(w, ctx, 'idle', 'idle');
}

// ---------------------------------------------------------------- C4
function c4InZone(ctx) {
  if (ctx.inBombZone != null) return !!ctx.inBombZone;
  return ctx.canPlant ? !!ctx.canPlant() : false;
}

function c4Primary(w, ctx) {
  const t = ctx.time;
  if (reserve(w) <= 0) return;
  const inZone = c4InZone(ctx);
  const onGround = !!grounded(ctx);
  const place = inZone && onGround;
  if (!w.startedArming) {
    if (!inZone) { emit(ctx, 'hud_message', { text: '#C4_Plant_At_Bomb_Spot' }); w.nextPrimary = t + 1.0; return; }
    if (!onGround) { emit(ctx, 'hud_message', { text: '#C4_Plant_Must_Be_On_Ground' }); w.nextPrimary = t + 1.0; return; }
    w.startedArming = true;
    w.bombPlacedAnimation = false;
    w.armedTime = t + w.def.armTime;
    anim(w, ctx, 'plant', 'arm', w.def.armTime);
    emit(ctx, 'player_anim', { anim: 'attack1', weapon: w.id });
    emit(ctx, 'progress_bar', { time: w.def.armTime });
    emit(ctx, 'reset_max_speed', { weapon: w.id }); // frozen while arming (maxspeed 1)
  } else if (place) {
    if (w.armedTime <= t) {
      w.startedArming = false;
      w.armedTime = 0;
      emit(ctx, 'radio', { message: 'bomb_planted', text: '#Bomb_Planted' });
      if (ctx.plantBomb) ctx.plantBomb();
      sound(ctx, 'c4_plant', { channel: 'weapon', weapon: w.id });
      emit(ctx, 'reset_max_speed', { weapon: w.id });
      w.spent = true;
      setReserve(w, reserve(w) - 1);
      if (reserve(w) <= 0) { retire(w, ctx); return; }
    } else if (w.armedTime - 0.75 <= t && !w.bombPlacedAnimation) {
      w.bombPlacedAnimation = true; // C4 placement animation
      emit(ctx, 'player_anim', { anim: 'holdbomb', weapon: w.id });
      if (ctx.playAnim) ctx.playAnim('plant_drop', { weapon: w.id, sequence: 'drop', seq: 2 });
    }
  } else {
    emit(ctx, 'hud_message', { text: inZone ? '#C4_Plant_Must_Be_On_Ground' : '#C4_Arming_Cancelled' });
    w.startedArming = false;
    w.nextPrimary = t + 1.5;
    emit(ctx, 'progress_bar', { time: 0 });
    emit(ctx, 'reset_max_speed', { weapon: w.id });
    emit(ctx, 'player_anim', { anim: 'holdbomb', weapon: w.id });
    anim(w, ctx, w.bombPlacedAnimation ? 'draw' : 'idle', w.bombPlacedAnimation ? 'draw' : 'idle1');
    return;
  }
  w.nextPrimary = t + 0.3;
  w.timeIdle = t + rndFloat(ctx, 10, 15);
}

function c4Idle(w, ctx) {
  const t = ctx.time;
  if (w.startedArming) {
    // releasing the attack button cancels the arming sequence
    w.startedArming = false;
    w.nextPrimary = t + 1.0;
    emit(ctx, 'progress_bar', { time: 0 });
    emit(ctx, 'reset_max_speed', { weapon: w.id });
    anim(w, ctx, w.bombPlacedAnimation ? 'draw' : 'idle', w.bombPlacedAnimation ? 'draw' : 'idle1');
  }
  if (w.timeIdle <= t) {
    if (reserve(w) <= 0) { retire(w, ctx); return; }
    w.timeIdle = t + 20; // original re-sent draw+idle every frame here (visual only)
    anim(w, ctx, 'idle', 'idle1');
  }
}

function c4Deploy(w, ctx) {
  w.startedArming = false;
  w.armedTime = 0;
  defaultDeploy(w, ctx, 'draw', 'draw');
}

// ---------------------------------------------------------------- dispatch table
const noop = () => {};
const BEHAVIOR = {};
for (const id of ['ak47', 'm4a1', 'galil', 'famas', 'sg552', 'aug', 'm249', 'mac10', 'tmp', 'mp5', 'ump45', 'p90']) {
  BEHAVIOR[id] = { primary: autoPrimary, secondary: noop, reload: autoReload, idle: autoIdle, deploy: autoDeploy };
}
BEHAVIOR.m4a1.secondary = m4a1Secondary;
BEHAVIOR.famas.secondary = famasSecondary;
BEHAVIOR.sg552.secondary = zoomAugSg552;
BEHAVIOR.aug.secondary = zoomAugSg552;
for (const id of ['glock', 'usp', 'p228', 'deagle', 'elite', 'fiveseven']) {
  BEHAVIOR[id] = { primary: pistolPrimary, secondary: noop, reload: pistolReload, idle: pistolIdle, deploy: pistolDeploy };
}
BEHAVIOR.glock.secondary = glockSecondary;
BEHAVIOR.usp.secondary = uspSecondary;
BEHAVIOR.awp = { primary: awpPrimary, secondary: sniperZoom, reload: sniperReload, idle: sniperIdle, deploy: sniperDeploy };
BEHAVIOR.scout = { primary: scoutPrimary, secondary: sniperZoom, reload: sniperReload, idle: sniperIdle, deploy: sniperDeploy };
BEHAVIOR.g3sg1 = { primary: g3sg1Primary, secondary: sniperZoom, reload: sniperReload, idle: sniperIdle, deploy: sniperDeploy };
BEHAVIOR.sg550 = { primary: sg550Primary, secondary: sniperZoom, reload: sniperReload, idle: sniperIdle, deploy: sniperDeploy };
BEHAVIOR.m3 = { primary: shotgunPrimary, secondary: noop, reload: shotgunReload, idle: shotgunIdle, deploy: (w, ctx) => defaultDeploy(w, ctx, 'draw', 'draw') };
BEHAVIOR.xm1014 = { ...BEHAVIOR.m3 };
BEHAVIOR.knife = { primary: knifeSwing, secondary: knifeStab, reload: noop, idle: knifeIdle, deploy: knifeDeploy };
BEHAVIOR.flamethrower = { primary: flamePrimary, secondary: noop, reload: specialReload, idle: specialIdle, deploy: (w, ctx) => defaultDeploy(w, ctx, 'draw', 'draw') };
BEHAVIOR.rpg = { primary: launcherPrimary, secondary: noop, reload: specialReload, idle: specialIdle, deploy: (w, ctx) => defaultDeploy(w, ctx, 'draw', 'draw') };
BEHAVIOR.m32 = { ...BEHAVIOR.rpg };
for (const id of ['hegrenade', 'flashbang', 'smokegrenade', 'molotov']) {
  BEHAVIOR[id] = { primary: grenadePrimary, secondary: noop /* shield only */, reload: noop, idle: grenadeIdle, deploy: grenadeDeploy };
}
BEHAVIOR.c4 = { primary: c4Primary, secondary: noop, reload: noop, idle: c4Idle, deploy: c4Deploy };
BEHAVIOR.medkit = { primary: medkitPrimary, secondary: medkitSecondary, reload: noop, idle: medkitIdle, deploy: (w, ctx) => { w.healEnd = 0; w.healTarget = null; defaultDeploy(w, ctx, 'draw', 'draw'); w.nextAttack = ctx.time + 0.35; } };

// ---------------------------------------------------------------- public API
/** CanDeploy: grenades / C4 need ammo. */
export function weaponCanDeploy(w) {
  if (w.def.kind === 'grenade' || w.def.kind === 'c4' || w.def.kind === 'medkit') return reserve(w) > 0 || (w.count ?? 0) > 0;
  return true;
}

/** Weapon::Deploy (+ DefaultDeploy). Returns the time until the weapon can be used. */
export function weaponDeploy(w, ctx) {
  // hosts that keep grenade stacks in w.count: refill the reserve from it
  if ((w.def.kind === 'grenade' || w.def.kind === 'c4' || w.def.kind === 'medkit') && w.count != null && w.count > 0 && reserve(w) <= 0) setReserve(w, w.count);
  w.spent = false;
  w.retired = false;
  BEHAVIOR[w.id].deploy(w, ctx);
  syncAmmo(w);
  return Math.max(0, w.nextAttack - ctx.time);
}

/** Weapon::Holster. Returns { destroy } - true when an exhausted grenade/C4 should leave the inventory. */
export function weaponHolster(w, ctx) {
  const t = ctx.time;
  let destroy = false;
  switch (w.def.kind) {
    case 'knife':
      w.nextAttack = t + 0.5;
      break;
    case 'grenade':
      w.nextAttack = t + 0.5;
      if (!reserve(w)) destroy = true;
      w.startThrow = 0;
      w.releaseThrow = -1;
      w.pinPulled = false;
      break;
    case 'medkit': // switching away cancels a use in progress (the kit is kept)
      w.nextAttack = t + 0.3;
      if (w.healEnd) emit(ctx, 'progress_bar', { time: 0 });
      w.healEnd = 0;
      w.healTarget = null;
      break;
    case 'c4':
      w.nextAttack = t + 0.5;
      if (w.startedArming) emit(ctx, 'progress_bar', { time: 0 });
      w.startedArming = false; // stop arming sequence
      if (!reserve(w)) destroy = true;
      break;
    default:
      w.inReload = false; // cancel any reload in progress (shotgun m_fInSpecialReload is kept, as in 1.6)
  }
  return { destroy };
}

/** CBasePlayerItem::GetMaxSpeed. zoomed defaults to the weapon's own FOV state. */
export function weaponMaxSpeed(w, zoomed) {
  const d = w.def;
  if (d.kind === 'c4' && w.startedArming) return 1; // SET_CLIENT_MAXSPEED(1) while arming
  const z = zoomed ?? (w.fov !== DEFAULT_FOV);
  if (z && d.maxSpeedZoom) return d.maxSpeedZoom;
  return d.maxSpeed;
}

function isUseable(w) {
  return !(w.clip <= 0 && reserve(w) <= 0 && w.def.maxAmmo !== -1);
}

/**
 * CBasePlayer::ItemPostFrame + CBasePlayerWeapon::ItemPostFrame.
 * buttons: BUTTON bitmask held this frame. prevButtons is accepted for API symmetry; CS
 * only looks at the held state (the semi-auto pistol gate is m_iShotsFired, reset on release).
 */
export function weaponFrame(w, ctx, buttons = 0, prevButtons = 0) { // eslint-disable-line no-unused-vars
  const d = w.def;
  const B = BEHAVIOR[w.id];
  const t = ctx.time;
  syncAmmo(w);
  if (w.nextAttack > t) return w; // deploy / reload lock (player m_flNextAttack)

  let btn = buttons;
  let usable = btn;
  if (!d.hasSecondary) usable &= ~BUTTON.ATTACK2;

  if (w.glockShoot !== 0) {
    if (!WEAPON_OPTIONS.glockBurstUsesTime || t >= w.glockShoot) fireRemaining(w, ctx, true);
  } else if (t > w.famasShoot && w.famasShoot !== 0) fireRemaining(w, ctx, false);

  // return the zoom level after an AWP / Scout shot
  if (w.nextPrimary <= t && w.resumeZoom) {
    setFov(w, ctx, w.lastZoom);
    w.resumeZoom = false;
  }
  if (w.ejectBrassAt !== 0 && w.ejectBrassAt <= t) { w.ejectBrassAt = 0; shell(w, ctx); }
  if (!(btn & BUTTON.ATTACK)) w.lastFireTime = 0;

  if (w.inReload) {
    // complete the reload
    const j = Math.min(d.clip - w.clip, reserve(w));
    w.clip += j;
    setReserve(w, reserve(w) - j);
    w.inReload = false;
    emit(ctx, 'reload_done', { weapon: w.id });
  }

  if ((usable & BUTTON.ATTACK2) && w.nextSecondary <= t) { // (blocking it while defusing is a ReGameDLL fix)
    B.secondary(w, ctx);
    btn &= ~BUTTON.ATTACK2;
  } else if ((btn & BUTTON.ATTACK) && w.nextPrimary <= t) {
    if ((w.clip === 0 && d.ammoType) || (d.clip === WEAPON_NOCLIP && d.ammoType && reserve(w) <= 0)) w.fireOnEmpty = true;
    // can't shoot during the freeze period or while defusing
    if (ctx.canShoot !== false && !ctx.isDefusing) {
      if (ctx.waterLevel === 3 && d.noFireUnderwater) {
        playEmptySound(w, ctx);
        w.nextPrimary = t + 0.15;
      } else B.primary(w, ctx);
    }
  } else if ((btn & BUTTON.RELOAD) && d.clip !== WEAPON_NOCLIP && !w.inReload && w.nextPrimary < t) {
    if (w.famasShoot === 0 && w.glockShoot === 0) B.reload(w, ctx);
  } else if (!(usable & (BUTTON.ATTACK | BUTTON.ATTACK2))) {
    // no fire buttons down
    if (w.delayFire) {
      // stops tapping the trigger from keeping first-shot accuracy forever
      w.delayFire = false;
      if (w.shotsFired > 15) w.shotsFired = 15;
      w.decreaseShotsFired = t + 0.4;
    }
    w.fireOnEmpty = false;
    if (d.slot === 2) w.shotsFired = 0; // pistols: trigger released
    else if (w.shotsFired > 0 && w.decreaseShotsFired < t) {
      w.decreaseShotsFired = t + 0.0225;
      w.shotsFired--;
      if (WEAPON_OPTIONS.resetAccuracyOnDecay && w.shotsFired === 0 && BASE_ACCURACY[w.id] != null) w.accuracy = BASE_ACCURACY[w.id];
    }
    if (!isUseable(w) && w.nextPrimary < t) {
      // weapon isn't useable (the auto-switch is #if 0'd out in CS)
    } else if (!w.clip && w.nextPrimary < t && w.famasShoot === 0 && w.glockShoot === 0) {
      // reload if empty and the weapon has waited as long as it has to after firing
      B.reload(w, ctx);
      syncAmmo(w);
      return w;
    }
    B.idle(w, ctx);
  }
  syncAmmo(w);
  return w;
}

/**
 * Buy one ammo pack for this weapon (BuyGunAmmo + GiveAmmo). Returns { cost, added } or null
 * (full / can't afford / no ammo). The caller subtracts `cost` from the player's money.
 */
export function buyAmmo(w, money) {
  const d = w.def;
  if (!d.ammoBuy) return null;
  const r = reserve(w);
  if (r >= d.maxAmmo) return null;
  if (money < d.ammoBuy.cost) return null;
  const added = Math.min(d.ammoBuy.amount, d.maxAmmo - r);
  setReserve(w, r + added);
  return { cost: d.ammoBuy.cost, added };
}

/** GetNextBestWeapon: heaviest deployable weapon other than `current` (knife weight 0). */
export function nextBestWeapon(weapons, current) {
  let best = null, bestWeight = -1;
  for (const w of weapons) {
    if (!w || w === current) continue;
    if (w.def.weight > bestWeight && weaponCanDeploy(w)) { best = w; bestWeight = w.def.weight; }
  }
  return best;
}

/** FShouldSwitchWeapon on pickup: switch when the new weapon is heavier than the active one. */
export function shouldAutoSwitch(newWeapon, active) {
  if (!weaponCanDeploy(newWeapon)) return false;
  if (!active) return true;
  return newWeapon.def.weight > active.def.weight;
}
