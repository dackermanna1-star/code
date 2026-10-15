// Persistent user settings (localStorage). Systems read ctx.settings.data and subscribe to changes.
import type { Action } from './Input';
import type { EventBus } from './EventBus';
import type { Perspective } from './types';

export type GraphicsPreset = 'low' | 'medium' | 'high' | 'ultra' | 'custom';

export interface GraphicsSettings {
  preset: GraphicsPreset;
  /** Internal render resolution multiplier (0.5..1.0+). */
  renderScale: number;
  /** 0 = off, 1 = low (1024, 2 cascades), 2 = medium (2048, 3 cascades), 3 = high (2048-4096, 4 cascades). */
  shadowQuality: 0 | 1 | 2 | 3;
  shadowDistance: number;
  /** Far plane / object draw distance in meters. */
  viewDistance: number;
  /** 0..1 multiplier of vegetation instances. */
  foliageDensity: number;
  /** Radius around the camera where grass is rendered. */
  grassDistance: number;
  ssao: boolean;
  bloom: boolean;
  antialias: 'none' | 'fxaa' | 'smaa';
  /** 0 low .. 2 high; affects particle counts, decals. */
  effectsQuality: 0 | 1 | 2;
  /** 0 low .. 2 high; texture resolution / anisotropy. */
  textureQuality: 0 | 1 | 2;
  postProcessing: boolean;
  /** Third-person vertical FOV is derived; this is the FPP horizontal-ish FOV setting (PUBG: 80-103). */
  fov: number;
  maxFps: number; // 0 = unlimited
  brightness: number; // exposure multiplier 0.5..1.5
  motionBlur: boolean;
}

export interface AudioSettings {
  master: number;
  sfx: number;
  music: number;
  ui: number;
  ambience: number;
  voice: number;
  hrtf: boolean;
}

export interface ControlSettings {
  /** General mouse sensitivity (degrees per 100 px ≈ sensitivity * 0.022 deg/px like many shooters). */
  sensitivity: number;
  /** Multipliers applied when aiming / ADS / per-scope magnification. */
  aimSensitivity: number;
  adsSensitivity: number;
  scopeSensitivity: Record<'1x' | '2x' | '3x' | '4x' | '6x' | '8x', number>;
  invertY: boolean;
  /** RMB behavior: 'hold' = hold to ADS, 'toggle' = click to ADS, 'hybrid' = PUBG default (click ADS, hold aim). */
  aimMode: 'hold' | 'toggle' | 'hybrid';
  toggleCrouch: boolean;
  toggleSprint: boolean;
  toggleWalk: boolean;
  bindings: Partial<Record<Action, string[]>>;
}

export interface GameplaySettings {
  perspective: Perspective;
  crosshairColor: string;
  crosshairStyle: 'cross' | 'dot' | 'circle';
  showFps: boolean;
  colorblindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
  /** Visual indicators for sounds (accessibility). */
  soundVisualizer: boolean;
  hitMarkers: boolean;
  autoPickupAmmo: boolean;
  autoEquipAttachments: boolean;
  uiScale: number;
}

export interface SettingsData {
  version: number;
  graphics: GraphicsSettings;
  audio: AudioSettings;
  controls: ControlSettings;
  gameplay: GameplaySettings;
}

export const GRAPHICS_PRESETS: Record<Exclude<GraphicsPreset, 'custom'>, Omit<GraphicsSettings, 'preset' | 'fov' | 'maxFps' | 'brightness'>> = {
  low: {
    renderScale: 0.75,
    shadowQuality: 1,
    shadowDistance: 80,
    viewDistance: 800,
    foliageDensity: 0.4,
    grassDistance: 30,
    ssao: false,
    bloom: false,
    antialias: 'fxaa',
    effectsQuality: 0,
    textureQuality: 0,
    postProcessing: true,
    motionBlur: false,
  },
  medium: {
    renderScale: 1,
    shadowQuality: 2,
    shadowDistance: 150,
    viewDistance: 1400,
    foliageDensity: 0.7,
    grassDistance: 50,
    ssao: true,
    bloom: true,
    antialias: 'smaa',
    effectsQuality: 1,
    textureQuality: 1,
    postProcessing: true,
    motionBlur: false,
  },
  high: {
    renderScale: 1,
    shadowQuality: 3,
    shadowDistance: 250,
    viewDistance: 2200,
    foliageDensity: 1,
    grassDistance: 70,
    ssao: true,
    bloom: true,
    antialias: 'smaa',
    effectsQuality: 2,
    textureQuality: 2,
    postProcessing: true,
    motionBlur: false,
  },
  ultra: {
    renderScale: 1,
    shadowQuality: 3,
    shadowDistance: 400,
    viewDistance: 3200,
    foliageDensity: 1,
    grassDistance: 100,
    ssao: true,
    bloom: true,
    antialias: 'smaa',
    effectsQuality: 2,
    textureQuality: 2,
    postProcessing: true,
    motionBlur: false,
  },
};

const STORAGE_KEY = 'battlegrounds.settings';
const VERSION = 1;

export function defaultSettings(): SettingsData {
  return {
    version: VERSION,
    graphics: { preset: 'high', fov: 90, maxFps: 0, brightness: 1, ...GRAPHICS_PRESETS.high },
    audio: { master: 0.8, sfx: 1, music: 0.5, ui: 0.8, ambience: 0.7, voice: 1, hrtf: true },
    controls: {
      sensitivity: 1,
      aimSensitivity: 0.8,
      adsSensitivity: 0.7,
      scopeSensitivity: { '1x': 0.7, '2x': 0.6, '3x': 0.55, '4x': 0.5, '6x': 0.45, '8x': 0.4 },
      invertY: false,
      aimMode: 'hybrid',
      toggleCrouch: true,
      toggleSprint: false,
      toggleWalk: false,
      bindings: {},
    },
    gameplay: {
      perspective: 'tpp',
      crosshairColor: '#ffffff',
      crosshairStyle: 'cross',
      showFps: false,
      colorblindMode: 'none',
      soundVisualizer: false,
      hitMarkers: true,
      autoPickupAmmo: true,
      autoEquipAttachments: true,
      uiScale: 1,
    },
  };
}

function deepMerge<T>(base: T, over: any): T {
  if (over === null || typeof over !== 'object' || Array.isArray(over)) return (over ?? base) as T;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const k of Object.keys(over)) {
    const b = (base as any)?.[k];
    out[k] = b && typeof b === 'object' && !Array.isArray(b) ? deepMerge(b, over[k]) : over[k];
  }
  return out;
}

export class Settings {
  data: SettingsData;
  private events: EventBus | null = null;

  constructor() {
    this.data = defaultSettings();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.version === VERSION) this.data = deepMerge(defaultSettings(), parsed);
      }
    } catch {
      /* storage unavailable: defaults */
    }
  }

  attach(events: EventBus): void {
    this.events = events;
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
  }

  /** Apply a graphics preset (keeps fov/maxFps/brightness). */
  applyPreset(preset: Exclude<GraphicsPreset, 'custom'>): void {
    const g = this.data.graphics;
    this.data.graphics = { ...g, ...GRAPHICS_PRESETS[preset], preset };
    this.changed('graphics');
  }

  /** Mutate a section, persist and notify listeners. */
  update<K extends keyof Omit<SettingsData, 'version'>>(section: K, patch: Partial<SettingsData[K]>): void {
    (this.data as any)[section] = { ...(this.data as any)[section], ...patch };
    if (section === 'graphics' && !('preset' in patch)) this.data.graphics.preset = 'custom';
    this.changed(section);
  }

  reset(): void {
    this.data = defaultSettings();
    this.changed('all');
  }

  private changed(section: string): void {
    this.save();
    this.events?.emit('settings:changed', { section });
  }
}
