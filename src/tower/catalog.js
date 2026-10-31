// LAST LOOKOUT — game data: rifles, ammunition, upgrades, defences, enemy kinds, wave rules.
// Plain data (no THREE, no DOM); the shop UI and the game both read it. Prices in dollars.

/**
 * Rifles. `weapon` is the physical round in src/game/weapons.js (mass, speed, calibre, penetration)
 * that the ballistics fly and the injury model resolves. cycle: seconds between shots (bolt throw or
 * trigger reset); reload: seconds for a full magazine; zoom: scope magnification; sway: scope sway
 * scale; kick: view climb per shot (rad).
 */
export const RIFLES = {
  m91: {
    name: 'M91 Bolt', round: '7.62×54R', weapon: 'boltAction', price: 0, mag: 5, action: 'bolt', cycle: 1.05,
    reload: 3.2, zoom: 6, sway: 1, kick: 0.05, suppressed: false,
    desc: 'A century-old bolt-action. Accurate, honest, slow to work.',
  },
  sr10: {
    name: 'SR-10 Marksman', round: '7.62×51', weapon: 'marksman', price: 2500, mag: 10, action: 'semi', cycle: 0.3,
    reload: 2.6, zoom: 8, sway: 0.85, kick: 0.045, suppressed: false,
    desc: 'Semi-automatic: work through a crowd without taking your eye off the glass.',
  },
  whisper: {
    name: 'Whisper .338', round: '.338 Lapua', weapon: 'whisper', price: 4800, mag: 5, action: 'bolt', cycle: 0.9,
    reload: 3.0, zoom: 10, sway: 0.75, kick: 0.06, suppressed: true,
    desc: 'Suppressed long-range rifle. Hits like a truck; the dead do not hear where it came from.',
  },
  anvil: {
    name: 'Anvil .50', round: '.50 BMG', weapon: 'anvil', price: 9500, mag: 5, action: 'semi', cycle: 0.55,
    reload: 3.8, zoom: 12, sway: 1.15, kick: 0.12, suppressed: false,
    desc: 'Anti-materiel rifle. Through armour, through bone, through the next three of them.',
  },
};
export const RIFLE_ORDER = ['m91', 'sr10', 'whisper', 'anvil'];

/** Ammunition. FMJ is free and unlimited; the others come in packs and are chosen with T. */
export const AMMO = {
  fmj: { name: 'FMJ', price: 0, pack: Infinity, desc: 'Full metal jacket. Goes through soft targets.' },
  hp: { name: 'Hollow point', price: 250, pack: 20, desc: 'Expands on impact: terrible wounds, no exit.' },
  ap: { name: 'Armour-piercing', price: 400, pack: 15, desc: 'Tungsten core: through helmets, vests and two or three bodies.' },
  ex: { name: 'Explosive', price: 750, pack: 8, desc: 'Bursts inside the target: it and anyone near it go flying.' },
};
export const AMMO_ORDER = ['fmj', 'hp', 'ap', 'ex'];

/** Upgrades for the lookout (they apply to every rifle). levels: bought in order. */
export const UPGRADES = {
  optics: { name: 'Better optics', desc: 'More magnification on every scope.', levels: [{ price: 700, zoom: 1.35 }, { price: 1600, zoom: 1.75 }] },
  thermal: { name: 'Thermal sight', desc: 'Toggle with V: bodies glow white, night is day.', levels: [{ price: 3200 }] },
  steady: { name: 'Bipod & sling', desc: 'Less scope sway.', levels: [{ price: 500, sway: 0.7 }, { price: 1300, sway: 0.45 }] },
  lungs: { name: 'Breath control', desc: 'Hold your breath longer (Shift).', levels: [{ price: 400, hold: 6 }, { price: 1000, hold: 9 }] },
  action: { name: 'Smooth action', desc: 'Faster bolt and trigger.', levels: [{ price: 900, cycle: 0.72 }] },
  magazine: { name: 'Extended magazines', desc: '+50% rounds per magazine.', levels: [{ price: 1100, mag: 1.5 }] },
  rangefinder: { name: 'Laser rangefinder', desc: 'Range to what is under the crosshair, in the scope.', levels: [{ price: 350 }] },
  focus: { name: 'Focus', desc: 'A longer bullet-time meter (F).', levels: [{ price: 800, focus: 1.5 }, { price: 1800, focus: 2.2 }] },
};
export const UPGRADE_ORDER = ['rangefinder', 'steady', 'lungs', 'optics', 'action', 'magazine', 'focus', 'thermal'];

/**
 * Defences. place: 'ground' (inside a trap zone, aimed from the tower), 'barrel' (a barrel spot),
 * 'mount' (a floodlight mount), 'sentry' (the sentry mount), 'gate' (instant).
 */
export const DEFENCES = {
  wire: { name: 'Barbed wire', price: 300, place: 'ground', length: 6, desc: 'Trips walkers flat on their faces; snags the rest.' },
  mine: { name: 'Landmine', price: 250, place: 'ground', radius: 4.5, power: 1, desc: 'Buried. Steps, then sky.' },
  barrel: { name: 'Fuel barrel', price: 180, place: 'barrel', radius: 6, power: 1.3, desc: 'Shoot it when they crowd round.' },
  floodlight: { name: 'Floodlight', price: 600, place: 'mount', desc: 'Lights the ground below a mount for the night waves.' },
  sentry: { name: 'Sentry gun', price: 3600, place: 'sentry', ammo: 250, refill: 400, desc: 'Guards the gate. Loud. Hungry for ammunition.' },
  repair: { name: 'Repair gate', price: 220, place: 'gate', amount: 0.25, desc: 'Patch 25% of the gate.' },
  steelGate: { name: 'Steel gate', price: 2200, place: 'gate', maxHp: 1.7, once: true, desc: 'Replace the gate: 70% tougher.' },
};
export const DEFENCE_ORDER = ['repair', 'wire', 'mine', 'barrel', 'floodlight', 'sentry', 'steelGate'];

/**
 * Enemy kinds. hp/armor go to the undead injury model; speed in m/s; clip: the animation it moves
 * with; gate: gate damage per second while battering; cash: reward; from: first wave it appears.
 */
export const ENEMIES = {
  walker: { name: 'Walker', hp: 260, speed: 0.9, clip: 'walk', gate: 5, cash: 20, from: 1 },
  runner: { name: 'Runner', hp: 170, speed: 3.4, clip: 'sprint', gate: 4, cash: 35, from: 3 },
  crawler: { name: 'Crawler', hp: 200, speed: 0.45, clip: 'crawl', gate: 3, cash: 25, from: 4 },
  climber: { name: 'Climber', hp: 160, speed: 2.2, clip: 'jog', climbSpeed: 0.75, cash: 50, from: 4 },
  bloater: { name: 'Bloater', hp: 300, speed: 0.6, clip: 'walk', gate: 6, cash: 60, from: 6, burst: { radius: 5, power: 1.1 } },
  screamer: { name: 'Screamer', hp: 220, speed: 1.0, clip: 'walk2', gate: 4, cash: 80, from: 8, scream: { radius: 70, dur: 9 } },
  armored: { name: 'Armoured', hp: 320, speed: 0.85, clip: 'walk', gate: 6, cash: 70, from: 7, armor: { helmet: 4, vest: 0.7 } },
  brute: { name: 'Brute', hp: 2200, speed: 1.1, clip: 'walk2', gate: 30, cash: 600, boss: true, armor: { helmet: 4, vest: 0.7 } },
  juggernaut: { name: 'Juggernaut', hp: 5200, speed: 0.55, clip: 'walk', gate: 60, cash: 1500, boss: true, armor: { helmet: 8, vest: 0.95 } },
};

/** Rewards on top of an enemy's cash (multipliers add). */
export const BONUS = {
  headshot: { mult: 1, text: 'HEADSHOT' },
  long: [{ dist: 150, mult: 0.25, text: 'LONG SHOT' }, { dist: 250, mult: 0.75, text: 'VERY LONG SHOT' }],
  moving: { mult: 0.25, text: 'MOVING TARGET' },
  collateral: { cash: 150, text: 'COLLATERAL' },
  wire: { mult: 0.2, text: 'TANGLED' },
  climber: { mult: 0.5, text: 'OFF THE LADDER' },
  barrel: { cash: 40, text: 'BOOM' },
  waveClear: (n) => 100 + 40 * n,
};

export const GATE = { hp: 1000 };
export const PLAYER = { hp: 100, climberDps: 18, startCash: 300 };

/** Wave rules: how many of what, how fast, which boss. */
export const WAVES = {
  count: (n) => Math.round(8 + n * 3.5 + n * n * 0.25),
  maxAlive: (n) => Math.min(30 + n * 4, 80),
  spawnInterval: (n) => Math.max(0.35, 2.2 - n * 0.12), // s between spawns while topping up
  /** Relative weights of the kinds that can appear in wave n. */
  mix(n) {
    const w = { walker: 10 };
    if (n >= 3) w.runner = 1.5 + n * 0.3;
    if (n >= 4) w.crawler = 1.2;
    if (n >= 4) w.climber = 0.6 + n * 0.08;
    if (n >= 6) w.bloater = 0.9;
    if (n >= 7) w.armored = 1 + n * 0.1;
    if (n >= 8) w.screamer = 0.5;
    return w;
  },
  bosses(n) {
    if (n % 5 !== 0) return [];
    if (n % 10 === 0) return n >= 20 ? ['juggernaut', 'brute', 'brute'] : ['juggernaut'];
    return n >= 15 ? ['brute', 'brute'] : ['brute'];
  },
  /** 0 dusk .. 1 deep night: the valley darkens through the run, with some dawn respites. */
  timeOfDay: (n) => (n <= 3 ? 0.05 * n : n <= 8 ? 0.15 + (n - 3) * 0.17 : [1, 0.85, 1, 0.6, 1][(n - 9) % 5]),
  goal: 20, // "survived" after wave 20; the run goes on for score
};
