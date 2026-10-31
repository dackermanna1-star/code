// HOLDOUT — the valley carved into areas you buy your way into, and what is for sale in each.
// Plain data + small helpers (no THREE, no DOM). Coordinates are the Last Lookout valley's
// (metres, +X east, +Z south; the tower at the origin).

/** Areas: axis-aligned rectangles. The Lookout is open from the start. */
export const AREAS = [
  { id: 'lookout', name: 'THE LOOKOUT', rect: { minX: -35, maxX: 35, minZ: -35, maxZ: 35 }, open: true },
  { id: 'farm', name: 'THE FARM', rect: { minX: -35, maxX: 80, minZ: -125, maxZ: -35 } },
  { id: 'highway', name: 'THE HIGHWAY', rect: { minX: 35, maxX: 140, minZ: -35, maxZ: 35 } },
  { id: 'corn', name: 'THE CORN', rect: { minX: -125, maxX: -35, minZ: -35, maxZ: 80 } },
  { id: 'orchard', name: 'THE ORCHARD', rect: { minX: -125, maxX: -35, minZ: -125, maxZ: -35 } },
  { id: 'village', name: 'HOLLOW CREEK', rect: { minX: -240, maxX: -125, minZ: -60, maxZ: 60 } },
  { id: 'river', name: 'THE RIVER', rect: { minX: -35, maxX: 80, minZ: 35, maxZ: 140 } },
];

/**
 * Barricades between areas (cleared with points). Opening one opens the area beyond it; any other
 * barricade between two open areas then comes down by itself.
 */
export const DOORS = [
  { id: 'd-farm', a: 'lookout', b: 'farm', pos: [2, -35], axis: 'x', price: 1000 },
  { id: 'd-highway', a: 'lookout', b: 'highway', pos: [35, 0], axis: 'z', price: 1250 },
  { id: 'd-corn', a: 'lookout', b: 'corn', pos: [-35, 4], axis: 'z', price: 1000 },
  { id: 'd-river', a: 'lookout', b: 'river', pos: [0, 35], axis: 'x', price: 1000 },
  { id: 'd-orchard-f', a: 'farm', b: 'orchard', pos: [-35, -72], axis: 'z', price: 1500 },
  { id: 'd-orchard-c', a: 'corn', b: 'orchard', pos: [-90, -35], axis: 'x', price: 1500 },
  { id: 'd-village', a: 'corn', b: 'village', pos: [-125, 0], axis: 'z', price: 2500 },
  { id: 'd-farm-h', a: 'farm', b: 'highway', pos: [60, -35], axis: 'x', price: 1250 },
  { id: 'd-river-h', a: 'highway', b: 'river', pos: [60, 35], axis: 'x', price: 1000 },
  { id: 'd-river-c', a: 'corn', b: 'river', pos: [-35, 60], axis: 'z', price: 1000 },
];

/** Where the dead come out, per area (the woods, the corn, behind buildings). */
export const SPAWNS = {
  lookout: [[30, -26], [-28, 26], [26, 30], [-30, -28], [31, 4], [-31, -6]],
  farm: [[-26, -118], [74, -120], [72, -55], [8, -122], [40, -118]],
  highway: [[136, -30], [138, 30], [112, -31], [136, 0]],
  corn: [[-120, -28], [-120, 74], [-82, 76], [-110, 30]],
  orchard: [[-120, -120], [-42, -120], [-118, -70]],
  village: [[-236, -55], [-236, 55], [-140, 56], [-214, 30], [-196, -52]],
  river: [[-28, 136], [50, 136], [20, 137], [-10, 128], [36, 62], [70, 52]],
};

/** Weapons on boards (buy again for ammunition at half price). face: the point the board faces. */
export const LOCKERS = [
  { id: 'l-revolver', area: 'lookout', gun: 'revolver', pos: [-12, 13], price: 750, face: [0, 0] },
  { id: 'l-smg', area: 'lookout', gun: 'smg', pos: [13, -12], price: 1100, face: [0, 0] },
  { id: 'l-shotgun', area: 'farm', gun: 'shotgun', pos: [44, -93], price: 1300, face: [28, -80] },
  { id: 'l-rifle', area: 'highway', gun: 'rifle', pos: [114, -6], price: 1600, face: [98, 0] },
  { id: 'l-sniper', area: 'village', gun: 'sniper', pos: [-177, 14], price: 1800, face: [-177, -2] },
  { id: 'l-smg2', area: 'river', gun: 'smg', pos: [52, 80], price: 1100, face: [38, 58] },
];

/** The random-weapon crate: it sits at one of these and moves on after a few draws. */
export const CRATE_SPOTS = [
  { id: 'c-lookout', area: 'lookout', pos: [-11, -12] },
  { id: 'c-barn', area: 'farm', pos: [44, -112] },
  { id: 'c-canopy', area: 'highway', pos: [95, 12] },
  { id: 'c-miller', area: 'orchard', pos: [-60, -62] },
  { id: 'c-bridge', area: 'river', pos: [68, 88] },
  { id: 'c-crypt', area: 'village', pos: [-212, 34] },
];
export const CRATE = { price: 950, movesAfter: [4, 9] };

/** The gunsmith's bench: rebuilds the gun in your hands. */
export const BENCH = { id: 'bench', area: 'village', pos: [-197, -24], price: 5000, face: [-188, -8] };

/** Field kits (perks), one cabinet each. */
export const PERKS = [
  { id: 'kevlar', name: 'KEVLAR', area: 'farm', pos: [18, -64], price: 2500, desc: 'Take twice the beating', face: [8, -44] },
  { id: 'quick', name: 'QUICK HANDS', area: 'highway', pos: [130, 12], price: 3000, desc: 'Reload in half the time', face: [110, 6] },
  { id: 'thirdArm', name: 'THIRD ARM', area: 'orchard', pos: [-70, -84], price: 4000, desc: 'Carry a third gun', face: [-78, -60] },
  { id: 'adrenaline', name: 'ADRENALINE', area: 'river', pos: [-18, 58], price: 2000, desc: 'Sprint longer, heal faster', face: [-6, 42] },
];

/** Guns: magazine, reserve, reload and handling (the arsenal's format); upgraded versions. */
export const GUNS = {
  pistol: { name: 'M9 SIDEARM', up: 'M9 HELLCAT', mag: 12, reserve: 72, reload: 1.35, ads: 1.25, kickUp: 0.022, kickSide: 0.008, adsSpread: 0.35, hipSpread: 2.2 },
  revolver: { name: '.357 REVOLVER', up: '.357 JUDGEMENT', mag: 6, reserve: 48, reload: 2.4, ads: 1.3, kickUp: 0.045, kickSide: 0.012, adsSpread: 0.3, hipSpread: 2.2 },
  smg: { name: 'MP-5K SMG', up: 'MP-5K WASP', mag: 30, reserve: 180, reload: 1.85, ads: 1.4, kickUp: 0.009, kickSide: 0.008, adsSpread: 0.45, hipSpread: 2.0 },
  shotgun: { name: 'M870 SHOTGUN', up: 'M870 THUNDERCLAP', mag: 7, reserve: 42, reload: 0.55, perShell: true, pump: 0.62, ads: 1.3, kickUp: 0.06, kickSide: 0.015, adsSpread: 0.75, hipSpread: 1.25 },
  rifle: { name: 'AR-15 RIFLE', up: 'AR-15 REAPER', mag: 30, reserve: 150, reload: 2.25, ads: 1.6, kickUp: 0.014, kickSide: 0.007, adsSpread: 0.3, hipSpread: 5.5 },
  sniper: { name: 'M24 SNIPER', up: 'M24 WIDOWMAKER', mag: 5, reserve: 30, reload: 2.7, ads: 2.2, kickUp: 0.055, kickSide: 0.01, adsSpread: 0.1, hipSpread: 14, bolt: true },
};
/** What the crate can hand out, with weights (the rare ones are rare). */
export const CRATE_POOL = { revolver: 3, smg: 3, shotgun: 3, rifle: 2.5, sniper: 1.5, pistol: 0.8 };

/** Points. */
export const POINTS = { start: 500, hit: 10, kill: 50, head: 50, melee: 100, pickup: 400, roundBonus: (n) => 50 * n };

/** Rounds: how many, how tough, how fast they come. */
export const ROUNDS = {
  count: (n) => Math.round(6 + 3 * n + 0.2 * n * n),
  maxAlive: (n) => Math.min(10 + 2 * n, 30),
  interval: (n) => Math.max(0.35, 2.0 - 0.1 * n),
  hpScale: (n) => Math.min(6, 1 + 0.16 * (n - 1)),
  /** Kind weights for round n. */
  mix(n) {
    const w = { walker: 10 };
    if (n >= 3) w.runner = Math.min(14, (n - 2) * 1.6);
    if (n >= 5) w.crawler = 1;
    if (n >= 6) w.bloater = 1.2;
    if (n >= 9) w.armored = 0.8 + (n - 9) * 0.25;
    if (n >= 8) w.screamer = 0.5;
    return w;
  },
  bosses: (n) => (n % 7 === 0 ? (n >= 21 ? ['juggernaut', 'brute'] : n >= 14 ? ['brute', 'brute'] : ['brute']) : []),
  breakTime: 9, // seconds between rounds
};

/** The player. */
export const HERO = { hp: 100, kevlarHp: 200, regenDelay: 3.2, regen: 28, hit: (n) => 30 + Math.min(30, n * 1.2), grenades: 2, maxGrenades: 4 };

/** Pickups dropped by the dead. */
export const PICKUPS = {
  ammo: { name: 'AMMO CACHE', weight: 3 },
  fury: { name: 'FURY', weight: 2, dur: 20 },
  bounty: { name: 'BOUNTY', weight: 2 },
  shockwave: { name: 'SHOCKWAVE', weight: 1.2 },
};
export const PICKUP_CHANCE = 0.045;

export function areaById(id) {
  return AREAS.find((a) => a.id === id);
}

export function inRect(r, x, z, m = 0) {
  return x > r.minX + m && x < r.maxX - m && z > r.minZ + m && z < r.maxZ - m;
}
