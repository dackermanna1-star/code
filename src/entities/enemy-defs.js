// Enemy archetypes and their attack repertoires.

// Attack fields:
//  range/minRange (m), wind/act/rec (s), dmg (multiplier), arc (deg, melee cone), pose: [windPose, hitPose]
//  kind: melee | projectile | leap | charge | slam | nova | explode | summon | hop | dive | spin
//  unblockable: must be dodged (telegraphed in red). knock: knockback applied to player.
export const ATTACKS = {
  slash: { kind: 'melee', range: 2.4, wind: 0.6, act: 0.12, rec: 0.55, dmg: 1, arc: 85, pose: ['slashWind', 'slashHit'], knock: 3, cd: [1.0, 2.0] },
  overhead: { kind: 'melee', range: 2.4, wind: 0.85, act: 0.12, rec: 0.7, dmg: 1.5, arc: 55, pose: ['overWind', 'overHit'], knock: 5, cd: [1.4, 2.4] },
  stab: { kind: 'melee', range: 1.9, wind: 0.38, act: 0.1, rec: 0.38, dmg: 1, arc: 60, pose: ['stabWind', 'stabHit'], knock: 2, cd: [0.6, 1.4] },
  lunge: { kind: 'leap', range: 5.5, minRange: 2.8, wind: 0.5, act: 0.32, rec: 0.6, dmg: 1.3, arc: 70, pose: ['stabWind', 'stabHit'], knock: 4, speed: 10, cd: [2, 3.5] },
  claw: { kind: 'melee', range: 1.9, wind: 0.32, act: 0.1, rec: 0.25, dmg: 0.8, arc: 80, pose: ['clawWind', 'clawHit'], knock: 2, chain: 2, cd: [0.8, 1.6] },
  pounce: { kind: 'leap', range: 7, minRange: 3.5, wind: 0.55, act: 0.5, rec: 0.7, dmg: 1.4, arc: 90, pose: ['crouch', 'leap'], knock: 6, speed: 11, jump: 4.5, cd: [3, 5] },
  smash: { kind: 'slam', range: 2.8, wind: 1.0, act: 0.14, rec: 0.9, dmg: 1.6, radius: 2.6, pose: ['overWind', 'overHit'], knock: 9, cd: [2, 3] },
  sweep: { kind: 'melee', range: 3.0, wind: 0.8, act: 0.16, rec: 0.7, dmg: 1.2, arc: 160, pose: ['sweepWind', 'sweepHit'], knock: 8, cd: [1.6, 2.6] },
  charge: { kind: 'charge', range: 12, minRange: 4.5, wind: 0.8, act: 1.3, rec: 0.6, dmg: 1.5, pose: ['roar', 'charge'], knock: 12, speed: 12, unblockable: true, cd: [5, 8] },
  shoot: { kind: 'projectile', range: 17, minRange: 2.5, wind: 0.95, act: 0.05, rec: 0.45, dmg: 1, pose: ['bowDraw', 'bowRelease'], proj: 'arrow', speed: 24, cd: [1.4, 2.6] },
  fireball: { kind: 'projectile', range: 16, minRange: 2.0, wind: 0.85, act: 0.05, rec: 0.55, dmg: 1, pose: ['castWind', 'castHit'], proj: 'fireball', speed: 13, cd: [1.8, 3.2] },
  nova: { kind: 'nova', range: 3.2, wind: 0.9, act: 0.1, rec: 0.7, dmg: 1.2, radius: 3.6, pose: ['castWind', 'castHit'], knock: 7, unblockable: true, cd: [5, 7] },
  shieldBash: { kind: 'melee', range: 2.0, wind: 0.45, act: 0.1, rec: 0.5, dmg: 0.7, arc: 70, pose: ['bashWind', 'bashHit'], knock: 7, guardBreak: true, cd: [2.5, 4] },
  thrust: { kind: 'melee', range: 2.7, wind: 0.55, act: 0.1, rec: 0.5, dmg: 1.15, arc: 45, pose: ['stabWind', 'stabHit'], knock: 3, cd: [1.2, 2] },
  explode: { kind: 'explode', range: 2.0, wind: 0.7, act: 0.05, rec: 0, dmg: 1, radius: 3.2, pose: ['roar', 'roar'], unblockable: true, cd: [0, 0] },
  hop: { kind: 'hop', range: 4.5, wind: 0.45, act: 0.5, rec: 0.5, dmg: 1, radius: 1.5, speed: 6, jump: 5.5, cd: [1.0, 2.0] },
  dive: { kind: 'dive', range: 3.5, wind: 0.35, act: 0.45, rec: 0.6, dmg: 1, arc: 90, speed: 10, cd: [1.2, 2.2] },
  bite: { kind: 'melee', range: 2.0, wind: 0.4, act: 0.12, rec: 0.5, dmg: 1.2, arc: 70, knock: 3, cd: [1, 1.8] },
  // boss specials
  spin: { kind: 'spin', range: 3.6, wind: 0.9, act: 1.2, rec: 0.8, dmg: 0.8, radius: 3.4, pose: ['sweepWind', 'sweepHit'], knock: 7, cd: [6, 9] },
  summon: { kind: 'summon', range: 30, wind: 1.1, act: 0.1, rec: 0.8, dmg: 0, pose: ['roar', 'castHit'], cd: [12, 16] },
  leapSlam: { kind: 'leap', range: 14, minRange: 4, wind: 0.7, act: 0.9, rec: 1.0, dmg: 1.8, arc: 360, radius: 3.4, slam: true, pose: ['crouch', 'leap'], knock: 11, speed: 0, jump: 9, cd: [6, 9] },
  volley: { kind: 'projectile', range: 20, minRange: 0, wind: 1.0, act: 0.05, rec: 0.7, dmg: 0.8, pose: ['castWind', 'castHit'], proj: 'fireball', speed: 14, count: 5, spread: 0.5, cd: [4, 6] },
  firewall: { kind: 'nova', range: 6, wind: 1.2, act: 0.1, rec: 0.8, dmg: 1.3, radius: 6.5, pose: ['castWind', 'castHit'], knock: 9, unblockable: true, ring: true, cd: [8, 11] },
  combo3: { kind: 'melee', range: 2.8, wind: 0.5, act: 0.12, rec: 0.3, dmg: 1, arc: 100, pose: ['slashWind', 'slashHit'], knock: 4, chain: 3, cd: [2, 3] },
};

export const ENEMIES = {
  skeleton: {
    name: 'Skeleton', body: 'skeleton', weapon: 'sword', hp: 32, dmg: 10, speed: 3.4, mass: 1, poise: 22, radius: 0.42,
    xp: 5, gold: [1, 4], blood: 'bone', voice: 'skeleton', attacks: ['slash', 'overhead', 'thrust'], sight: 15,
  },
  skeletonArcher: {
    name: 'Skeleton Archer', body: 'skeleton', weapon: 'bow', hp: 22, dmg: 9, speed: 3.2, mass: 0.9, poise: 14, radius: 0.42,
    xp: 6, gold: [2, 5], blood: 'bone', voice: 'skeleton', attacks: ['shoot'], ranged: true, prefer: 10, sight: 19, eyeColor: 0x99ff99,
  },
  goblin: {
    name: 'Goblin Cutthroat', body: 'goblin', weapon: 'dagger', hp: 20, dmg: 7, speed: 5.3, mass: 0.6, poise: 8, radius: 0.36,
    xp: 4, gold: [2, 6], blood: 'blood', voice: 'goblin', attacks: ['stab', 'lunge'], skirmish: true, sight: 16,
  },
  ghoul: {
    name: 'Ghoul', body: 'ghoul', weapon: null, hp: 28, dmg: 6, speed: 4.8, mass: 0.9, poise: 14, radius: 0.4,
    xp: 5, gold: [0, 3], blood: 'ichor', voice: 'ghoul', attacks: ['claw', 'pounce'], sight: 15, hunch: true,
  },
  brute: {
    name: 'Brute', body: 'brute', weapon: 'club', hp: 90, dmg: 18, speed: 2.9, mass: 3.2, poise: 85, radius: 0.62,
    xp: 14, gold: [5, 12], blood: 'blood', voice: 'brute', attacks: ['smash', 'sweep', 'charge'], sight: 15,
  },
  cultist: {
    name: 'Fire Cultist', body: 'cultist', weapon: 'staff', hp: 28, dmg: 12, speed: 3.3, mass: 0.9, poise: 12, radius: 0.42,
    xp: 8, gold: [3, 8], blood: 'blood', voice: 'cultist', attacks: ['fireball', 'nova'], ranged: true, prefer: 9, teleport: true, sight: 17,
  },
  knight: {
    name: 'Hollow Knight', body: 'knight', weapon: 'sword', offhand: 'shield', hp: 65, dmg: 14, speed: 3.0, mass: 2, poise: 55, radius: 0.48,
    xp: 11, gold: [4, 10], blood: 'blood', voice: 'knight', attacks: ['slash', 'shieldBash', 'thrust', 'overhead'], shield: true, armored: true, sight: 15,
  },
  bomber: {
    name: 'Bloated Thrall', body: 'bomber', weapon: null, hp: 16, dmg: 30, speed: 5.0, mass: 1.2, poise: 5, radius: 0.45,
    xp: 4, gold: [1, 3], blood: 'blood', voice: 'imp', attacks: ['explode'], explodes: true, sight: 17,
  },
  slime: {
    name: 'Slime', body: 'slime', hp: 36, dmg: 8, speed: 2.6, mass: 1, poise: 10, radius: 0.55,
    xp: 4, gold: [1, 3], blood: 'goo', voice: 'slime', attacks: ['hop'], split: 2, sight: 12,
  },
  bat: {
    name: 'Cave Bat', body: 'bat', hp: 9, dmg: 5, speed: 6.5, mass: 0.2, poise: 1, radius: 0.35,
    xp: 2, gold: [0, 1], blood: 'blood', voice: 'bat', attacks: ['dive'], flying: true, sight: 14,
  },
  mimic: {
    name: 'Mimic', body: 'mimic', hp: 80, dmg: 16, speed: 4.2, mass: 2.5, poise: 40, radius: 0.6,
    xp: 15, gold: [20, 40], blood: 'blood', voice: 'brute', attacks: ['hop', 'bite'], sight: 20,
  },
};

export const BOSSES = {
  butcher: {
    name: 'Gorgath the Butcher', title: 'Gorger of the Crypt', body: 'brute', weapon: 'cleaver', scale: 1.9, apron: true,
    hp: 420, dmg: 22, speed: 3.3, mass: 8, poise: 9999, radius: 0.95, xp: 80, gold: [60, 90], blood: 'blood', voice: 'boss',
    attacks: ['sweep', 'smash', 'charge', 'combo3', 'leapSlam'], phase2: ['spin', 'charge', 'leapSlam', 'combo3', 'smash'], rim: 0xff5533,
  },
  hollowking: {
    name: 'The Hollow King', title: 'Lord of Bones', body: 'skeleton', weapon: 'greatsword', scale: 1.85, crown: true, cape: true, eyeColor: 0x66ffff, armor: true,
    hp: 520, dmg: 21, speed: 3.6, mass: 7, poise: 9999, radius: 0.85, xp: 90, gold: [70, 100], blood: 'bone', voice: 'skeleton',
    attacks: ['combo3', 'overhead', 'sweep', 'summon', 'leapSlam'], phase2: ['combo3', 'spin', 'summon', 'leapSlam', 'firewall'], rim: 0x66ccff, summon: 'skeleton',
  },
  pyromancer: {
    name: 'Ignis, the Ember Prophet', title: 'Voice of the Flame', body: 'cultist', weapon: 'staff', scale: 1.7, eyeColor: 0xffaa22, tint: 0x5a1a10,
    hp: 480, dmg: 18, speed: 3.2, mass: 6, poise: 9999, radius: 0.75, xp: 95, gold: [70, 110], blood: 'blood', voice: 'cultist', float: true,
    attacks: ['volley', 'fireball', 'nova', 'summon'], phase2: ['volley', 'firewall', 'summon', 'nova'], rim: 0xff8822, summon: 'cultist', teleport: true, ranged: true, prefer: 9,
  },
  warden: {
    name: 'The Iron Warden', title: 'Keeper of the Forge', body: 'knight', weapon: 'mace', offhand: 'shield', scale: 1.95, tint: 0x6a5a50, plume: true, eyeColor: 0xff6622,
    hp: 660, dmg: 26, speed: 3.1, mass: 10, poise: 9999, radius: 0.95, xp: 110, gold: [90, 130], blood: 'blood', voice: 'knight',
    attacks: ['shieldBash', 'smash', 'charge', 'sweep', 'leapSlam'], phase2: ['spin', 'leapSlam', 'charge', 'smash', 'firewall'], rim: 0xff7733, armored: true,
  },
  abyssal: {
    name: 'The Abyssal Knight', title: 'End of All Paths', body: 'knight', weapon: 'greatsword', scale: 2.0, tint: 0x2a2038, tabard: 0x4a1a6a, plume: true, eyeColor: 0xdd66ff,
    hp: 860, dmg: 28, speed: 3.8, mass: 10, poise: 9999, radius: 0.95, xp: 150, gold: [120, 180], blood: 'ichor', voice: 'knight',
    attacks: ['combo3', 'leapSlam', 'volley', 'sweep', 'charge'], phase2: ['combo3', 'spin', 'firewall', 'leapSlam', 'summon', 'volley'], rim: 0xbb66ff, summon: 'knight',
  },
};

export const BOSS_ORDER = ['butcher', 'hollowking', 'pyromancer', 'warden', 'abyssal'];

export const ELITE_AFFIXES = {
  burning: { name: 'Burning', color: 0xff6622 },
  frenzied: { name: 'Frenzied', color: 0xffdd33 },
  armored: { name: 'Armored', color: 0x99aacc },
  vampiric: { name: 'Vampiric', color: 0xff2244 },
  explosive: { name: 'Volatile', color: 0xff8800 },
  frozen: { name: 'Frostborn', color: 0x66ddff },
};
