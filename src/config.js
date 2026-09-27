// Difficulty and graphics presets.
export const DIFFICULTY = {
  easy: { name: 'Easy', commonDmg: 1, siDmg: 0.5, ff: 0, tankHp: 3000, witchDmg: 30, fireDmg: 4, hordeMul: 0.8, specialMul: 0.8, commonSpeed: 0.95, botAim: 1.15, witchIncap: false },
  normal: { name: 'Normal', commonDmg: 2, siDmg: 1, ff: 0.1, tankHp: 4000, witchDmg: 100, fireDmg: 8, hordeMul: 1, specialMul: 1, commonSpeed: 1, botAim: 1, witchIncap: true },
  advanced: { name: 'Advanced', commonDmg: 5, siDmg: 1.3, ff: 0.5, tankHp: 6000, witchDmg: 100, fireDmg: 12, hordeMul: 1.15, specialMul: 1.15, commonSpeed: 1.03, botAim: 0.95, witchIncap: true },
  expert: { name: 'Expert', commonDmg: 20, siDmg: 2, ff: 1.0, tankHp: 8000, witchDmg: 999, fireDmg: 20, hordeMul: 1.3, specialMul: 1.3, commonSpeed: 1.05, botAim: 0.9, witchIncap: false },
};

export const QUALITY = {
  low: { name: 'Low', pixelRatio: 0.75, shadows: false, bloom: false, msaa: false, lights: 4, particles: 0.5, maxCommons: 55, maxCorpses: 18, maxRagdolls: 8, texSize: 256, flowBudget: 9000, shadowMap: 512, moonShadow: false },
  medium: { name: 'Medium', pixelRatio: 1, shadows: true, bloom: true, msaa: false, lights: 6, particles: 0.8, maxCommons: 85, maxCorpses: 32, maxRagdolls: 14, texSize: 512, flowBudget: 12000, shadowMap: 1024, moonShadow: true },
  high: { name: 'High', pixelRatio: 1.5, shadows: true, bloom: true, msaa: true, lights: 8, particles: 1, maxCommons: 110, maxCorpses: 45, maxRagdolls: 20, texSize: 512, flowBudget: 16000, shadowMap: 1024, moonShadow: true },
};

export const DEFAULT_SETTINGS = {
  sensitivity: 1.0,
  invertY: false,
  fov: 80,
  master: 0.8,
  music: 0.55,
  sfx: 0.9,
  voice: 0.9,
  tts: true,
  subtitles: true,
  quality: 'medium',
  difficulty: 'normal',
  showFps: false,
  character: 'bill',
  tempDecay: 1,
  bleedRate: 3,
};

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('lastfour.settings') || '{}');
    return Object.assign({}, DEFAULT_SETTINGS, s);
  } catch (e) {
    return Object.assign({}, DEFAULT_SETTINGS);
  }
}
export function saveSettings(s) {
  try { localStorage.setItem('lastfour.settings', JSON.stringify(s)); } catch (e) { /* ignore */ }
}
