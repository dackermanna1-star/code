// Graphics presets and persisted user preferences.

export const PRESETS = {
  low: {
    label: 'Low',
    renderScale: 0.72,
    maxPixelRatio: 1,
    msaa: 0,
    fxaa: true,
    bloomLevels: 4,
    clipSize: 256,
    clipLevels: 10,
    clipTexel: 0.5,
    shadowSteps: 26,
    gridRes: 24,
    leafSize: 8,
    lodCount: 11,
    rangeRatio: 2.4,
    ripples: true,
    sparkle: false,
    footprints: true,
    objectShadows: false,
    shadowMapSize: 1024,
    particles: 2500,
    vegetationRadius: 130,
    vegetationDensity: 0.45,
    heatHaze: false,
    clouds: true,
  },
  medium: {
    label: 'Medium',
    renderScale: 0.85,
    maxPixelRatio: 1.25,
    msaa: 0,
    fxaa: true,
    bloomLevels: 5,
    clipSize: 384,
    clipLevels: 10,
    clipTexel: 1 / 3,
    shadowSteps: 34,
    gridRes: 32,
    leafSize: 8,
    lodCount: 11,
    rangeRatio: 2.8,
    ripples: true,
    sparkle: true,
    footprints: true,
    objectShadows: true,
    shadowMapSize: 1536,
    particles: 7000,
    vegetationRadius: 200,
    vegetationDensity: 0.7,
    heatHaze: true,
    clouds: true,
  },
  high: {
    label: 'High',
    renderScale: 1,
    maxPixelRatio: 1.5,
    msaa: 4,
    fxaa: false,
    bloomLevels: 6,
    clipSize: 512,
    clipLevels: 10,
    clipTexel: 0.25,
    shadowSteps: 44,
    gridRes: 40,
    leafSize: 8,
    lodCount: 11,
    rangeRatio: 3.2,
    ripples: true,
    sparkle: true,
    footprints: true,
    objectShadows: true,
    shadowMapSize: 2048,
    particles: 14000,
    vegetationRadius: 280,
    vegetationDensity: 1,
    heatHaze: true,
    clouds: true,
  },
  ultra: {
    label: 'Ultra',
    renderScale: 1,
    maxPixelRatio: 2,
    msaa: 4,
    fxaa: false,
    bloomLevels: 6,
    clipSize: 512,
    clipLevels: 10,
    clipTexel: 0.25,
    shadowSteps: 52,
    gridRes: 56,
    leafSize: 8,
    lodCount: 11,
    rangeRatio: 3.6,
    ripples: true,
    sparkle: true,
    footprints: true,
    objectShadows: true,
    shadowMapSize: 3072,
    particles: 24000,
    vegetationRadius: 380,
    vegetationDensity: 1.25,
    heatHaze: true,
    clouds: true,
  },
};

const STORAGE_KEY = 'sahara-wanderer-settings-v2';

const DEFAULTS = {
  quality: 'auto',
  autoResolution: true,
  fov: 72,
  sensitivity: 1,
  invertY: false,
  volume: 0.8,
  showFps: false,
  timeSpeed: 0.25, // game minutes per real second: 0.25 = 15x real time
  weather: 'auto',
  // People who ask for reduced motion get a steady camera unless they turn bob back on.
  headBob: !(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  exposureBias: 0,
};

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) Object.assign(this.values, JSON.parse(raw));
    } catch {
      // Storage may be blocked (private mode, sandboxed frames); defaults are fine.
    }
    this.listeners = new Set();
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    if (this.values[key] === value) return;
    this.values[key] = value;
    this.save();
    for (const fn of this.listeners) fn(key, value);
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      // Ignore: preferences just won't persist.
    }
  }

  /** Picks a preset for 'auto' from coarse device hints. */
  static detectPreset(renderer) {
    const gl = renderer.getContext();
    let gpu = '';
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).toLowerCase();
    } catch {
      gpu = '';
    }
    const mobile = /android|iphone|ipad|mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 900);
    if (/swiftshader|llvmpipe|software|microsoft basic/.test(gpu)) return 'low';
    if (mobile) return 'low';
    if (/rtx [3-9]\d|rx [6-9]\d{3}|apple m[2-9] (pro|max|ultra)/.test(gpu)) return 'high';
    if (/nvidia|geforce|rtx|gtx|radeon rx|radeon pro|apple m\d|arc a/.test(gpu)) return 'high';
    if (/uhd|hd graphics|mali|adreno|powervr/.test(gpu)) return 'low';
    // Iris, Radeon integrated, Apple GPU (Safari hides the model) and anything unknown.
    return 'medium';
  }
}
