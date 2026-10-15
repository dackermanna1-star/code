// Persistent user settings (localStorage, failing gracefully).
const DEFAULTS = {
  resolution: 240,      // internal render height (240 / 360 / 480)
  jitter: true,         // vertex snapping
  affine: true,         // affine texture warping
  dither: true,         // 15-bit colour + ordered dither
  fov: 75,
  sensitivity: 1.0,
  invertY: false,
  masterVolume: 0.8,
  musicVolume: 0.7,
  sfxVolume: 0.9,
  brightness: 1.0,
  subtitles: true,
  difficulty: 'normal',
  crosshair: true,
  viewBob: true,
};

const KEY = 'dc_ps1_settings_v1';

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.values, JSON.parse(raw));
    } catch (e) { /* storage unavailable */ }
    this.listeners = [];
  }
  get(k) { return this.values[k]; }
  set(k, v) {
    this.values[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch (e) { /* ignore */ }
    for (const l of this.listeners) l(k, v);
  }
  onChange(fn) { this.listeners.push(fn); }
  reset() { this.values = { ...DEFAULTS }; try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
}
