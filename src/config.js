// Global constants and user-tunable settings.

export const SIM_DT = 1 / 60;
export const SUBSTEPS = 2;
export const BASE_GRAVITY = 2200;

export const ENVIRONMENTS = [
  { id: 'facility', label: 'Research Facility' },
  { id: 'warehouse', label: 'Warehouse' },
  { id: 'rooftop', label: 'Rooftops at Dusk' },
  { id: 'construction', label: 'Construction Site' },
];

export const CONDITIONS = [
  { id: 'clear', label: 'Clear' },
  { id: 'dark', label: 'Power failure' },
  { id: 'smoke', label: 'Smoke' },
  { id: 'wet', label: 'Wet floors' },
  { id: 'wind', label: 'High wind' },
];

// Which conditions make sense in which environment.
export const ENV_CONDITIONS = {
  facility: ['clear', 'clear', 'dark', 'smoke', 'wet'],
  warehouse: ['clear', 'clear', 'dark', 'smoke'],
  rooftop: ['clear', 'wet', 'wind', 'wind'],
  construction: ['clear', 'clear', 'smoke', 'wind'],
};

export const DEFAULT_SETTINGS = {
  difficulty: 'normal',
  maxActive: 26,
  spawnRate: 1,
  totalEnemies: 0,
  enemyStrength: 1,
  enemyIntelligence: 1,
  enemyAggression: 1,
  heroSkill: 1,
  heroEndurance: 1,
  heroReaction: 1,
  heroSpeed: 1,
  physicsIntensity: 1,
  gravity: 1,
  environment: 'random',
  condition: 'random',
  hazardDensity: 1,
  propDensity: 1,
  randomness: 1,
  escalation: 1,
  timeLimit: 0,
  simSpeed: 1,
  cameraMode: 'director',
  slowMo: 1,
  screenShake: 1,
  motionTrails: true,
  showStats: false,
  debugAI: false,
  autoNext: true,
  volume: 0.7,
  muted: true,
  quality: 'high',
  showHud: true,
};

export const DIFFICULTY_PRESETS = {
  easy: {
    maxActive: 14, spawnRate: 0.7, enemyStrength: 0.8, enemyIntelligence: 0.75,
    enemyAggression: 0.8, escalation: 0.7, heroEndurance: 1.3,
  },
  normal: {
    maxActive: 26, spawnRate: 1, enemyStrength: 1, enemyIntelligence: 1,
    enemyAggression: 1, escalation: 1, heroEndurance: 1,
  },
  hard: {
    maxActive: 40, spawnRate: 1.3, enemyStrength: 1.15, enemyIntelligence: 1.2,
    enemyAggression: 1.15, escalation: 1.25, heroEndurance: 0.9,
  },
  brutal: {
    maxActive: 70, spawnRate: 1.7, enemyStrength: 1.3, enemyIntelligence: 1.35,
    enemyAggression: 1.3, escalation: 1.5, heroEndurance: 0.85,
  },
  nightmare: {
    maxActive: 160, spawnRate: 2.6, enemyStrength: 1.45, enemyIntelligence: 1.5,
    enemyAggression: 1.45, escalation: 1.9, heroEndurance: 0.8,
  },
};

export function sanitizeSettings(s) {
  const out = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (s && s[k] !== undefined && typeof s[k] === typeof DEFAULT_SETTINGS[k]) out[k] = s[k];
  }
  return out;
}
