// User settings + quality presets, persisted to localStorage when available.

export type QualityLevel = "low" | "medium" | "high" | "ultra";

export interface QualityPreset {
  /** Render resolution scale (1 = native). */
  resolutionScale: number;
  shadowMapSize: number;
  shadowCascades: number;
  ssao: boolean;
  bloom: boolean;
  fxaa: boolean;
  /** Multiplier on particle counts. */
  particles: number;
  /** Multiplier on micro-debris counts. */
  microDebris: number;
  /** Max simultaneous micro-debris particles. */
  microDebrisMax: number;
  /** Seconds a small debris island must sleep before it is merged into a static batch. */
  consolidateAfter: number;
  lightShafts: boolean;
  /** Interior point lights allowed to cast shadows. */
  pointShadows: number;
}

export const QUALITY: Readonly<Record<QualityLevel, QualityPreset>> = {
  low: { resolutionScale: 0.6, shadowMapSize: 1024, shadowCascades: 2, ssao: false, bloom: false, fxaa: true, particles: 0.4, microDebris: 0.4, microDebrisMax: 1500, consolidateAfter: 1, lightShafts: false, pointShadows: 0 },
  medium: { resolutionScale: 0.8, shadowMapSize: 2048, shadowCascades: 3, ssao: false, bloom: true, fxaa: true, particles: 0.7, microDebris: 0.7, microDebrisMax: 3000, consolidateAfter: 2, lightShafts: true, pointShadows: 0 },
  high: { resolutionScale: 1, shadowMapSize: 2048, shadowCascades: 3, ssao: true, bloom: true, fxaa: true, particles: 1, microDebris: 1, microDebrisMax: 6000, consolidateAfter: 3, lightShafts: true, pointShadows: 1 },
  ultra: { resolutionScale: 1, shadowMapSize: 4096, shadowCascades: 4, ssao: true, bloom: true, fxaa: true, particles: 1.3, microDebris: 1.4, microDebrisMax: 10000, consolidateAfter: 5, lightShafts: true, pointShadows: 2 },
};

export interface SettingsData {
  quality: QualityLevel;
  ps2Mode: boolean;
  masterVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  mouseSensitivity: number;
  invertY: boolean;
  fov: number; // vertical degrees
  showStats: boolean;
  showHints: boolean;
  showTargetInfo: boolean;
  cameraShake: number; // 0..1
  hitStop: boolean;
}

const DEFAULTS: SettingsData = {
  quality: "high",
  ps2Mode: false,
  masterVolume: 0.8,
  sfxVolume: 1,
  ambienceVolume: 0.6,
  mouseSensitivity: 1,
  invertY: false,
  fov: 75,
  showStats: true,
  showHints: true,
  showTargetInfo: true,
  cameraShake: 1,
  hitStop: true,
};

const KEY = "apartment-destruction-settings-v1";

export class Settings {
  data: SettingsData;
  private listeners: Array<(s: SettingsData) => void> = [];

  constructor() {
    this.data = { ...DEFAULTS };
    try {
      const raw = globalThis.localStorage?.getItem(KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch {
      /* storage unavailable: keep defaults */
    }
  }

  get quality(): QualityPreset {
    return QUALITY[this.data.quality] ?? QUALITY.high;
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    this.data[key] = value;
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
    for (const l of this.listeners) l(this.data);
  }

  onChange(fn: (s: SettingsData) => void): void {
    this.listeners.push(fn);
  }
}
