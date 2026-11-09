// Enemy weapons and archetypes (tuned so a few rifle hits down an unarmoured player). `dmg` is damage to the player per hit (the player is not a
// ragdoll); the same shot also runs through the engine ballistics so it penetrates drywall,
// wounds anyone in the way and knocks bodies around.

const ENEMY_GUNS = {
  pistol: { model: 'pistol', ballistic: 'pistol', sound: 'pistol', rpm: 240, burst: [1, 3], mag: 12, reload: 2.0, spread: 0.022, dmg: 13, hold: 'pistol', range: 28 },
  revolver: { model: 'revolver', ballistic: 'revolver', sound: 'revolver', rpm: 110, burst: [1, 2], mag: 6, reload: 2.8, spread: 0.018, dmg: 22, hold: 'pistol', range: 30 },
  smg: { model: 'smg', ballistic: 'smg', sound: 'smg', rpm: 720, burst: [3, 7], mag: 30, reload: 2.4, spread: 0.03, dmg: 9.5, hold: 'rifle', range: 24 },
  shotgun: { model: 'shotgun', ballistic: 'shotgun', sound: 'shotgun', rpm: 65, burst: [1, 1], mag: 6, reload: 3.4, spread: 0.02, pellets: 8, pelletSpread: 0.07, dmg: 7.5, hold: 'rifle', range: 14 },
  rifle: { model: 'rifle', ballistic: 'rifle', sound: 'rifle', rpm: 560, burst: [2, 5], mag: 30, reload: 2.6, spread: 0.016, dmg: 16, hold: 'rifle', range: 40 },
  lmg: { model: 'rifle', ballistic: 'rifle', sound: 'rifle', rpm: 680, burst: [8, 18], mag: 90, reload: 4.6, spread: 0.026, dmg: 13.5, hold: 'rifle', range: 40, drum: true },
  sniper: { model: 'sniper', ballistic: 'marksman', sound: 'sniper', rpm: 40, burst: [1, 1], mag: 5, reload: 3.2, spread: 0.0025, dmg: 58, hold: 'rifle', range: 70, aimTime: 1.35, laser: true },
};

const ENEMY_TYPES = {
  scavenger: {
    name: 'Scavenger', looks: ['male_adult_18', 'male_adult_04', 'delivery_male_01'], guns: ['pistol', 'pistol', 'revolver'],
    tough: 70, skill: 0.3, react: [0.64, 0.98], speed: 1.45, role: 'skirmish', cover: 0.35, flank: 0.2, aggression: 0.55,
    cash: 45, score: 100, voice: 0.9,
  },
  bandit: {
    name: 'Bandit', looks: ['male_adult_05', 'male_adult_17', 'male_adult_04'], guns: ['smg', 'smg', 'pistol'],
    tough: 85, skill: 0.4, react: [0.51, 0.81], speed: 1.65, role: 'skirmish', cover: 0.5, flank: 0.35, aggression: 0.65,
    cash: 65, score: 150, voice: 1,
  },
  rusher: {
    name: 'Shotgun Rusher', looks: ['male_adult_17', 'delivery_male_01', 'male_adult_05'], guns: ['shotgun'],
    tough: 110, skill: 0.5, react: [0.34, 0.59], speed: 2.25, role: 'rush', cover: 0, flank: 0.1, aggression: 1,
    cash: 85, score: 200, voice: 1.1,
  },
  merc: {
    name: 'Mercenary', looks: ['security_male_01', 'police_male_06'], guns: ['rifle', 'rifle', 'smg'], armor: { vest: 0.45 },
    tough: 115, skill: 0.58, react: [0.42, 0.68], speed: 1.6, role: 'skirmish', cover: 0.8, flank: 0.5, aggression: 0.5,
    cash: 110, score: 250, voice: 0.95, light: true,
  },
  soldier: {
    name: 'Tactical Soldier', looks: ['military_male_01', 'military_male_03', 'military_male_04'], guns: ['rifle'], armor: { helmet: 1, vest: 0.6 },
    tough: 135, skill: 0.68, react: [0.34, 0.55], speed: 1.7, role: 'skirmish', cover: 0.9, flank: 0.65, aggression: 0.55, grenade: 0.22,
    cash: 150, score: 320, voice: 0.85, light: true,
  },
  sniper: {
    name: 'Sniper', looks: ['police_male_02', 'military_male_03'], guns: ['sniper'], armor: { helmet: 1 },
    tough: 90, skill: 0.85, react: [0.77, 1.02], speed: 1.35, role: 'sniper', cover: 0.9, flank: 0.1, aggression: 0.2,
    cash: 200, score: 400, voice: 0.8,
  },
  heavy: {
    name: 'Heavy Gunner', looks: ['military_male_04', 'military_male_01'], guns: ['lmg'], armor: { helmet: 2, vest: 0.82 },
    tough: 260, skill: 0.5, react: [0.47, 0.72], speed: 1.15, role: 'suppress', cover: 0.4, flank: 0.1, aggression: 0.75,
    knockback: 0.6, strength: 1.2, cash: 280, score: 600, voice: 0.75,
  },
  elite: {
    name: 'Elite Operator', looks: ['police_male_02'], guns: ['rifle'], armor: { helmet: 2, vest: 0.75 },
    tough: 190, skill: 0.85, react: [0.26, 0.42], speed: 1.9, role: 'skirmish', cover: 0.95, flank: 0.85, aggression: 0.7, grenade: 0.4,
    cash: 360, score: 800, voice: 0.85, light: true, elite: true,
  },
  juggernaut: {
    name: 'JUGGERNAUT', looks: ['military_male_01'], guns: ['lmg'], armor: { helmet: 8, vest: 0.95 },
    tough: 1100, skill: 0.6, react: [0.38, 0.51], speed: 1.0, role: 'push', cover: 0, flank: 0, aggression: 1,
    knockback: 0.3, strength: 1.4, cash: 1500, score: 3000, voice: 0.6, boss: true, light: true, scale: 1.08,
  },
  hollow: {
    name: 'Hollowed', looks: ['male_adult_18', 'male_adult_04', 'delivery_male_01', 'male_adult_17'], melee: 'runner',
    tough: 75, cash: 38, score: 100, hollow: true,
  },
};

// wave composition: unlock tiers by wave, weights shift towards harder archetypes
function waveRoster(wave) {
  const w = (from, weight, ramp = 0) => (wave >= from ? weight + ramp * (wave - from) : 0);
  return {
    scavenger: Math.max(0.6, 6 - wave * 0.45),
    bandit: w(1, 3, 0.25),
    rusher: w(3, 1.2, 0.15),
    merc: w(4, 1.5, 0.3),
    soldier: w(6, 1.2, 0.35),
    sniper: w(5, 0.45, 0.06),
    heavy: w(8, 0.4, 0.08),
    elite: w(11, 0.3, 0.1),
  };
}
