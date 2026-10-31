// LAST LOOKOUT — the settings the menus edit (keys sent to handlers.onSetting(key, value)).
// Pure data + helpers; tested in Node.

export const SETTINGS = [
  { key: 'mouseSens', label: 'MOUSE SENSITIVITY', type: 'range', min: 0.1, max: 3, step: 0.05, def: 1 },
  { key: 'scopeSens', label: 'SCOPE SENSITIVITY', type: 'range', min: 0.1, max: 2, step: 0.05, def: 0.7 },
  { key: 'invertY', label: 'INVERT Y', type: 'bool', def: false },
  { key: 'masterVol', label: 'MASTER VOLUME', type: 'range', min: 0, max: 1, step: 0.05, def: 0.8, pct: true },
  { key: 'musicVol', label: 'MUSIC VOLUME', type: 'range', min: 0, max: 1, step: 0.05, def: 0.6, pct: true },
  { key: 'sfxVol', label: 'EFFECTS VOLUME', type: 'range', min: 0, max: 1, step: 0.05, def: 0.9, pct: true },
  { key: 'quality', label: 'GRAPHICS', type: 'choice', options: ['low', 'medium', 'high'], def: 'medium' },
  { key: 'showFps', label: 'SHOW FPS', type: 'bool', def: false },
];

export function defaultSettings() {
  const o = {};
  for (const s of SETTINGS) o[s.key] = s.def;
  return o;
}

/** Validates one value against its spec (out-of-range numbers are clamped, unknown -> default). */
export function sanitizeSetting(spec, v) {
  if (spec.type === 'bool') return typeof v === 'boolean' ? v : spec.def;
  if (spec.type === 'choice') return spec.options.includes(v) ? v : spec.def;
  const n = typeof v === 'number' && Number.isFinite(v) ? v : spec.def;
  const q = Math.round((n - spec.min) / spec.step) * spec.step + spec.min;
  return Math.min(spec.max, Math.max(spec.min, +q.toFixed(4)));
}

/** Merges stored values over the defaults. */
export function mergeSettings(values) {
  const o = defaultSettings();
  if (values) for (const s of SETTINGS) if (s.key in values) o[s.key] = sanitizeSetting(s, values[s.key]);
  return o;
}

/** The value after one step left (dir -1) or right (+1); booleans flip either way. */
export function stepSetting(spec, v, dir) {
  if (spec.type === 'bool') return !v;
  if (spec.type === 'choice') {
    const i = spec.options.indexOf(v);
    const j = Math.max(0, Math.min(spec.options.length - 1, (i < 0 ? 0 : i) + (dir < 0 ? -1 : 1)));
    return spec.options[j];
  }
  return sanitizeSetting(spec, (typeof v === 'number' ? v : spec.def) + (dir < 0 ? -spec.step : spec.step));
}

/** Value -> fraction 0..1 of a range setting (for the bar). */
export function settingFraction(spec, v) {
  if (spec.type !== 'range') return 0;
  return (sanitizeSetting(spec, v) - spec.min) / (spec.max - spec.min);
}

/** Display text: '80%', '1.00×', 'ON', 'MEDIUM'. */
export function settingText(spec, v) {
  if (spec.type === 'bool') return v ? 'ON' : 'OFF';
  if (spec.type === 'choice') return String(v).toUpperCase();
  const n = sanitizeSetting(spec, v);
  return spec.pct ? `${Math.round(n * 100)}%` : `${n.toFixed(2)}×`;
}
