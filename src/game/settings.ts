/** Persisted user settings. */
import type { Quality } from '../render/renderer';

export interface GameSettings {
  renderDistance: number;
  quality: Quality;
  renderScale: number;
  fov: number;
  sensitivity: number;
  invertY: boolean;
  viewBobbing: boolean;
  masterVolume: number;
  musicVolume: number;
  bevels: boolean;
  decorations: boolean;
  textureSize: number;
  showFps: boolean;
  blood: boolean;
  ragdolls: boolean;
  guiScale: number;
  brightness: number;
  autoJump: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  renderDistance: 8,
  quality: 'high',
  renderScale: 1,
  fov: 70,
  sensitivity: 0.5,
  invertY: false,
  viewBobbing: true,
  masterVolume: 0.8,
  musicVolume: 0.5,
  bevels: true,
  decorations: true,
  textureSize: 256,
  showFps: false,
  blood: true,
  ragdolls: true,
  guiScale: 2,
  brightness: 0.5,
  autoJump: false,
};

const KEY = 'voxelcraft.settings.v1';

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: GameSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
