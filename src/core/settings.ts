// User settings + quality presets, persisted to localStorage when available.

export type QualityLevel = "minimal" | "low" | "medium" | "high" | "ultra";

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
  /**
   * Moving shadow casters are drawn into the shadow maps every frame they move. False: only casters
   * at rest cast (a moving object's shadow vanishes until it settles; the cached map is only redrawn
   * where a caster started or stopped moving, never because a fan spins).
   */
  dynamicShadows: boolean;
  /** Shadow casters with a smaller bounding radius (m) are skipped (debris specks); 0 = texel-based only. */
  shadowMinRadius: number;
  /** Minimum seconds between two redraws of a cached shadow map (dirty regions accumulate meanwhile). */
  shadowRefreshInterval: number;
  /** Film grain + chromatic aberration in the final composite pass. */
  filmEffects: boolean;
  /** Interior lights shaded at once (the nearest to the camera; the others are switched off). */
  maxInteriorLights: number;
  /**
   * Live rigid debris pieces (dynamic islands that broke off) before the smallest are recycled into
   * micro-debris; also the fracture valve's body budget.
   */
  maxDebrisBodies: number;
  /**
   * Loose fracture cells smaller than this (m, largest extent) always become micro-debris particles
   * instead of rigid bodies; while the simulation is busy, cells up to twice this size do too.
   */
  microCellSize: number;
  /** Simultaneous audio voices. */
  audioVoices: number;
  /**
   * Cheaper physics (applied at boot): coarser fragment hulls (10 support points instead of 16), at
   * most 2 adaptive substeps, faster forced sleep of slow bodies (0.4 s instead of 0.6 s).
   */
  lightPhysics: boolean;
}

export const QUALITY: Readonly<Record<QualityLevel, QualityPreset>> = {
  // Weak PCs (integrated GPUs, old laptops): the default. ~0.67 render scale, one post pass, no SSAO /
  // bloom / FXAA / film effects, a small sun map that only ever holds casters at rest (redrawn at most
  // 4× a second, only where something started or stopped moving), no point shadows, no light shafts,
  // 10 interior lights, a tight debris body budget and fewer particles / voices.
  minimal: {
    resolutionScale: 0.67,
    shadowMapSize: 1024,
    shadowCascades: 1,
    ssao: false,
    bloom: false,
    fxaa: false,
    particles: 0.3,
    microDebris: 0.3,
    microDebrisMax: 800,
    consolidateAfter: 0.5,
    lightShafts: false,
    pointShadows: 0,
    dynamicShadows: false,
    shadowMinRadius: 0.12,
    shadowRefreshInterval: 0.25,
    filmEffects: false,
    maxInteriorLights: 10,
    maxDebrisBodies: 160,
    microCellSize: 0.06,
    lightPhysics: true,
    audioVoices: 24,
  },
  low: {
    resolutionScale: 0.75,
    shadowMapSize: 1024,
    shadowCascades: 2,
    ssao: false,
    bloom: false,
    fxaa: true,
    particles: 0.4,
    microDebris: 0.4,
    microDebrisMax: 1500,
    consolidateAfter: 1,
    lightShafts: false,
    pointShadows: 0,
    dynamicShadows: false,
    shadowMinRadius: 0.06,
    shadowRefreshInterval: 0.1,
    filmEffects: false,
    maxInteriorLights: 12,
    maxDebrisBodies: 250,
    microCellSize: 0.045,
    lightPhysics: true,
    audioVoices: 32,
  },
  medium: {
    resolutionScale: 0.85,
    shadowMapSize: 2048,
    shadowCascades: 3,
    ssao: false,
    bloom: true,
    fxaa: true,
    particles: 0.7,
    microDebris: 0.7,
    microDebrisMax: 3000,
    consolidateAfter: 2,
    lightShafts: true,
    pointShadows: 0,
    dynamicShadows: true,
    shadowMinRadius: 0.03,
    shadowRefreshInterval: 1 / 30,
    filmEffects: true,
    maxInteriorLights: 24,
    maxDebrisBodies: 400,
    microCellSize: 0.03,
    lightPhysics: false,
    audioVoices: 40,
  },
  high: {
    resolutionScale: 1,
    shadowMapSize: 2048,
    shadowCascades: 3,
    ssao: true,
    bloom: true,
    fxaa: true,
    particles: 1,
    microDebris: 1,
    microDebrisMax: 6000,
    consolidateAfter: 3,
    lightShafts: true,
    pointShadows: 1,
    dynamicShadows: true,
    shadowMinRadius: 0,
    shadowRefreshInterval: 0,
    filmEffects: true,
    maxInteriorLights: 64,
    maxDebrisBodies: 700,
    microCellSize: 0.03,
    lightPhysics: false,
    audioVoices: 48,
  },
  ultra: {
    resolutionScale: 1,
    shadowMapSize: 4096,
    shadowCascades: 4,
    ssao: true,
    bloom: true,
    fxaa: true,
    particles: 1.3,
    microDebris: 1.4,
    microDebrisMax: 10000,
    consolidateAfter: 5,
    lightShafts: true,
    pointShadows: 2,
    dynamicShadows: true,
    shadowMinRadius: 0,
    shadowRefreshInterval: 0,
    filmEffects: true,
    maxInteriorLights: 64,
    maxDebrisBodies: 1000,
    microCellSize: 0.03,
    lightPhysics: false,
    audioVoices: 64,
  },
};

/** Quality used until the player picks one in the menu (persisted from then on). */
export const DEFAULT_QUALITY: QualityLevel = "minimal";

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
  quality: DEFAULT_QUALITY,
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

const KEY = "apartment-destruction-settings-v2";
/**
 * Settings of earlier builds: everything but the quality carries over. v1 stored the old default
 * ("high") as soon as any setting changed, so a v1 quality was usually never chosen by the player;
 * weak PCs start on DEFAULT_QUALITY and a higher level is one click in the menu.
 */
const LEGACY_KEY = "apartment-destruction-settings-v1";

export class Settings {
  data: SettingsData;
  private listeners: Array<(s: SettingsData) => void> = [];

  constructor() {
    this.data = { ...DEFAULTS };
    try {
      const raw = globalThis.localStorage?.getItem(KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
      else {
        const legacy = globalThis.localStorage?.getItem(LEGACY_KEY);
        if (legacy) {
          const old = JSON.parse(legacy) as Partial<SettingsData>;
          delete old.quality;
          Object.assign(this.data, old);
        }
      }
    } catch {
      /* storage unavailable: keep defaults */
    }
    if (!(this.data.quality in QUALITY)) this.data.quality = DEFAULT_QUALITY;
  }

  get quality(): QualityPreset {
    return QUALITY[this.data.quality] ?? QUALITY[DEFAULT_QUALITY];
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

  onChange(fn: (s: SettingsData) => void): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }
}
