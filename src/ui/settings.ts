/**
 * User settings (persisted). Graphics presets set individual quality knobs
 * which can then be tuned independently.
 */
import { DEFAULT_BINDINGS, type Action } from '../sim/input';
import { load, save } from './storage';

export type Preset = 'low' | 'medium' | 'high' | 'ultra';

export interface Settings {
  preset: Preset;
  renderScale: number;
  terrainDetail: number;   // lodK
  atmosphereSteps: number;
  cloudSteps: number;
  galaxySteps: number;
  surfaceDetail: number;   // fragment micro-detail 0..1
  scatterDensity: number;  // rocks / plants 0..1
  fov: number;
  bloom: number;
  exposureComp: number;
  autoExposure: boolean;
  maxExposureLog: number;  // log10 of the dark-adaptation limit
  starBrightness: number;
  vignette: number;
  fxaa: boolean;
  cinematic: boolean;      // stronger glare/vignette, cinematic audio
  motionEffects: boolean;  // FTL streaks, camera shake
  // lens & camera
  dof: 'off' | 'auto' | 'manual';
  fNumber: number;
  focusDistance: number;   // m (manual focus)
  motionBlur: number;      // exposure as a fraction of 1/24 s (0 = off)
  chromaticAberration: number;
  filmGrain: number;
  screenshotScale: '1' | '2' | '4';
  // interface & accessibility
  uiScale: number;
  uiOpacity: number;
  highContrast: boolean;
  colorblind: boolean;
  showLabels: boolean;
  showOrbits: boolean;
  invertY: boolean;
  mouseSensitivity: number;
  reduceMotion: boolean;
  // simulation
  lifeFrequency: number;
  realisticFuel: boolean;
  shipDamage: boolean;
  ftlLimits: boolean;
  defaultShip: 'scout' | 'lander' | 'cruiser' | 'heavy' | 'experimental';
  universeSeed: number;
  knownUniverse: boolean;
  // audio
  masterVolume: number;
  ambienceVolume: number;
  effectsVolume: number;
  cinematicAudio: boolean;
  bindings: Record<Action, string[]>;
  tutorialSeen: boolean;
}

export const PRESETS: Record<Preset, Partial<Settings>> = {
  low: { renderScale: 0.6, terrainDetail: 2.2, atmosphereSteps: 10, cloudSteps: 20, galaxySteps: 20, surfaceDetail: 0.5, scatterDensity: 0.3 },
  medium: { renderScale: 0.8, terrainDetail: 3.0, atmosphereSteps: 16, cloudSteps: 32, galaxySteps: 32, surfaceDetail: 0.8, scatterDensity: 0.6 },
  high: { renderScale: 1, terrainDetail: 3.6, atmosphereSteps: 22, cloudSteps: 44, galaxySteps: 48, surfaceDetail: 1, scatterDensity: 0.85 },
  ultra: { renderScale: 1, terrainDetail: 4.6, atmosphereSteps: 30, cloudSteps: 72, galaxySteps: 72, surfaceDetail: 1, scatterDensity: 1 },
};

export const DEFAULT_SETTINGS: Settings = {
  preset: 'high',
  renderScale: 1, terrainDetail: 3.6, atmosphereSteps: 22, cloudSteps: 44, galaxySteps: 48, surfaceDetail: 1, scatterDensity: 0.85,
  fov: 60, bloom: 0.012, exposureComp: 0, autoExposure: true, maxExposureLog: 6.5, starBrightness: 1, vignette: 0.18, fxaa: true,
  cinematic: false, motionEffects: true,
  dof: 'off', fNumber: 2.8, focusDistance: 10, motionBlur: 0, chromaticAberration: 0, filmGrain: 0, screenshotScale: '2',
  uiScale: 1, uiOpacity: 0.92, highContrast: false, colorblind: false, showLabels: true, showOrbits: false, invertY: false, mouseSensitivity: 1, reduceMotion: false,
  lifeFrequency: 1, realisticFuel: false, shipDamage: false, ftlLimits: false, defaultShip: 'scout', universeSeed: 20261027, knownUniverse: true,
  masterVolume: 0.7, ambienceVolume: 0.8, effectsVolume: 0.8, cinematicAudio: false,
  bindings: structuredClone(DEFAULT_BINDINGS),
  tutorialSeen: false,
};

export function loadSettings(): Settings {
  const s = load<Settings>('settings', structuredClone(DEFAULT_SETTINGS));
  // merge new actions added since the settings were saved
  s.bindings = { ...structuredClone(DEFAULT_BINDINGS), ...(s.bindings ?? {}) };
  return s;
}

export function saveSettings(s: Settings) {
  save('settings', s);
}

export function applyPreset(s: Settings, p: Preset) {
  Object.assign(s, PRESETS[p]);
  s.preset = p;
}
