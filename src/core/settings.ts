export type QualityName = 'low' | 'medium' | 'high' | 'ultra';

export interface Settings {
  quality: QualityName;
  renderScale: number; // multiplier on top of quality preset
  dynamicResolution: boolean;
  shadows: boolean;
  bloom: boolean;
  filmGrain: boolean;
  motionFx: boolean; // chromatic aberration / radial blur on big hits
  cameraShake: number; // 0..1
  mouseSensitivity: number;
  invertY: boolean;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  showHints: boolean;
  fpsCounter: boolean;
  bloodDetail: 'standard' | 'high'; // never removes blood; only resolution/particle counts
  /** 'euphoria' = active, self-balancing ragdolls (Ragdoll Lab engine); 'classic' = passive Rapier ragdolls. */
  ragdolls: 'euphoria' | 'classic';
}

export interface QualityPreset {
  pixelRatio: number; // max device pixel ratio
  renderScale: number;
  shadowMap: number;
  msaa: number;
  bloom: boolean;
  bloodAtlas: number;
  maxParticles: number;
  pointLights: number;
  anisotropy: number;
  ragdollSubsteps: number; // XPBD substeps per 60 Hz step for active ragdolls
  maxActiveRagdolls: number; // beyond this, extra bodies fall back to passive Rapier ragdolls
}

export const PRESETS: Record<QualityName, QualityPreset> = {
  low: { pixelRatio: 1, renderScale: 0.72, shadowMap: 1024, msaa: 0, bloom: false, bloodAtlas: 2048, maxParticles: 900, pointLights: 2, anisotropy: 1, ragdollSubsteps: 7, maxActiveRagdolls: 4 },
  medium: { pixelRatio: 1, renderScale: 0.9, shadowMap: 2048, msaa: 0, bloom: true, bloodAtlas: 2048, maxParticles: 1600, pointLights: 3, anisotropy: 2, ragdollSubsteps: 8, maxActiveRagdolls: 6 },
  high: { pixelRatio: 1.25, renderScale: 1, shadowMap: 2048, msaa: 4, bloom: true, bloodAtlas: 4096, maxParticles: 2400, pointLights: 4, anisotropy: 4, ragdollSubsteps: 10, maxActiveRagdolls: 8 },
  ultra: { pixelRatio: 2, renderScale: 1, shadowMap: 4096, msaa: 4, bloom: true, bloodAtlas: 4096, maxParticles: 3200, pointLights: 4, anisotropy: 8, ragdollSubsteps: 14, maxActiveRagdolls: 12 },
};

const KEY = 'last-stance-settings-v1';

export function defaultSettings(): Settings {
  return {
    quality: 'high',
    renderScale: 1,
    dynamicResolution: true,
    shadows: true,
    bloom: true,
    filmGrain: true,
    motionFx: true,
    cameraShake: 1,
    mouseSensitivity: 1,
    invertY: false,
    masterVolume: 0.9,
    sfxVolume: 1,
    musicVolume: 0.6,
    showHints: true,
    fpsCounter: false,
    bloodDetail: 'high',
    ragdolls: 'euphoria',
  };
}

export function loadSettings(): Settings {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...d, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return d;
}
export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
