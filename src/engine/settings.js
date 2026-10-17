// User settings (TECH §7): persisted in localStorage['hallowell.settings'].
// API: get(key?) · set(key, value) | set({ ...many }) · save() · load() · reset() · apply().
// Every key is also exposed as a plain property (HW.settings.textSpeed, HW.settings.grain = false),
// whose setter routes through set() so changes are applied and saved immediately.
import HW from './hw.js';
import { storage } from './storage.js';

const KEY = 'hallowell.settings';

export const DEFAULTS = Object.freeze({
  master: 0.8, music: 0.7, sfx: 0.9, ambience: 0.8,
  textSpeed: 1, pixelPerfect: true, crt: false, grain: true, reduceFlashing: false, fullscreen: false,
});

// Coerce a stored/assigned value to the type of its default; reject garbage.
function sanitize(key, value) {
  const def = DEFAULTS[key];
  if (typeof def === 'boolean') return typeof value === 'boolean' ? value : !!value;
  if (typeof def === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) return def;
    return key === 'textSpeed' ? Math.max(0.25, Math.min(4, n)) : Math.max(0, Math.min(1, n));
  }
  return value;
}

export const settings = {
  values: { ...DEFAULTS },

  get(key) {
    return key === undefined ? { ...this.values } : this.values[key];
  },

  set(key, value) {
    if (key && typeof key === 'object') {
      for (const [k, v] of Object.entries(key)) if (k in DEFAULTS) this.values[k] = sanitize(k, v);
    } else if (key in DEFAULTS) {
      this.values[key] = sanitize(key, value);
    } else {
      return;
    }
    this.save();
    this.apply();
  },

  load() {
    this.values = { ...DEFAULTS };
    const raw = storage.get(KEY);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        for (const k of Object.keys(DEFAULTS)) if (data && k in data) this.values[k] = sanitize(k, data[k]);
      } catch {
        console.warn('[settings] corrupt settings ignored');
      }
    }
    return this.values;
  },

  save() {
    storage.set(KEY, JSON.stringify(this.values));
  },

  reset() {
    this.values = { ...DEFAULTS };
    this.save();
    this.apply();
  },

  /** Push settings into the subsystems that consume them. Safe to call before they exist. */
  apply() {
    const v = this.values;
    try {
      HW.audio?.setVolumes?.({ master: v.master, music: v.music, sfx: v.sfx, ambience: v.ambience });
    } catch (e) {
      console.error('[settings] audio.setVolumes failed', e);
    }
    HW.display?.applySettings?.(v);
  },
};

for (const k of Object.keys(DEFAULTS)) {
  Object.defineProperty(settings, k, {
    get() { return this.values[k]; },
    set(v) { this.set(k, v); },
    enumerable: true,
  });
}

export default settings;
