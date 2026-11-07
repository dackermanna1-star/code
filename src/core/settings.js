// Reactive settings store persisted to localStorage (best effort).
const KEY = 'b738sim.settings.v1';

export const DEFAULT_SETTINGS = {
  // graphics
  quality: 'auto',            // 'auto' | 'low' | 'medium' | 'high' | 'ultra'
  resolutionScale: 1.0,       // 0.5 .. 1.0 multiplier on the (capped) device pixel ratio
  fov: 72,                    // vertical degrees
  autoExposure: true,
  bloom: true,
  filmGrain: true,
  vignette: true,
  // camera / controls
  mouseSensitivity: 1.0,
  invertY: false,
  headBob: true,
  cameraShake: 1.0,           // 0..1 multiplier for vibration / turbulence camera motion
  // audio (0..1)
  masterVolume: 0.9,
  engineVolume: 1.0,
  ambienceVolume: 1.0,
  effectsVolume: 1.0,
  announcementVolume: 1.0,
  ifeVolume: 0.8,
  // experience
  subtitles: true,
  announcements: true,
  cruiseMinutes: 10,          // 0 = stay in cruise until the player chooses "Begin descent"
  gateMinutes: 2,             // time at the gate before pushback starts automatically (0 = wait for player)
  pacing: 'compressed',       // 'compressed' (climb/descent shortened) | 'realistic'
  timeOfDay: 'auto',          // 'auto' | 'morning' | 'noon' | 'afternoon' | 'sunset' | 'night'
  weather: 'auto',            // 'auto' | 'clear' | 'scattered' | 'overcast'
  units: 'imperial',          // 'imperial' (ft, kt, mph) | 'metric'
  showHud: true,
  showProgress: true,
  showFps: false,
  showCrosshair: true,
};

export class Settings {
  constructor(overrides = {}) {
    this._listeners = new Set();
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
    this.values = { ...DEFAULT_SETTINGS, ...saved, ...overrides };
  }
  get(key) { return this.values[key]; }
  set(key, value) {
    if (this.values[key] === value) return;
    const prev = this.values[key];
    this.values[key] = value;
    this._save();
    for (const fn of [...this._listeners]) { try { fn(key, value, prev); } catch (e) { console.error(e); } }
  }
  reset() { for (const k of Object.keys(DEFAULT_SETTINGS)) this.set(k, DEFAULT_SETTINGS[k]); }
  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _save() { try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* private mode */ } }
}

/** Graphics presets derived from settings.quality. Modules read app.quality.* */
export const QUALITY_PRESETS = {
  low: { name: 'low', pixelRatioCap: 1.0, msaa: 0, shadowMapSize: 1024, outsideShadowMapSize: 1024, shadows: true, cloudSteps: 24, cloudScale: 0.35, terrainSegments: 96, anisotropy: 2, bloomLevels: 4, envMapSize: 128, maxLights: 4, detail: 0 },
  medium: { name: 'medium', pixelRatioCap: 1.25, msaa: 2, shadowMapSize: 2048, outsideShadowMapSize: 1024, shadows: true, cloudSteps: 40, cloudScale: 0.5, terrainSegments: 160, anisotropy: 4, bloomLevels: 5, envMapSize: 256, maxLights: 8, detail: 1 },
  high: { name: 'high', pixelRatioCap: 1.25, msaa: 4, shadowMapSize: 4096, outsideShadowMapSize: 2048, shadows: true, cloudSteps: 64, cloudScale: 0.5, terrainSegments: 256, anisotropy: 8, bloomLevels: 6, envMapSize: 256, maxLights: 12, detail: 2 },
  ultra: { name: 'ultra', pixelRatioCap: 1.75, msaa: 4, shadowMapSize: 4096, outsideShadowMapSize: 4096, shadows: true, cloudSteps: 96, cloudScale: 0.75, terrainSegments: 384, anisotropy: 16, bloomLevels: 6, envMapSize: 512, maxLights: 16, detail: 3 },
};

/** Pick a preset for 'auto' from the WebGL renderer string. */
export function detectQuality(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
    const mobile = /android|iphone|ipad|mobile/i.test(navigator.userAgent);
    if (/swiftshader|llvmpipe|software|basic render/.test(name)) return 'low';
    if (mobile) return 'low';
    if (/intel|uhd|iris|mali|adreno|powervr|apple m1(?! (pro|max|ultra))/.test(name)) return 'medium';
    return 'high';
  } catch { return 'medium'; }
}
