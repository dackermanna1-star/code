// Paint menu data: the settings shape, caps, finishes, the preset palette and
// the persisted "recent colours" list.
import { normalizeHex, clamp } from './color.js';

export const DEFAULT_SETTINGS = Object.freeze({ color: '#d8262b', cap: 'standard', width: 1.0, flow: 0.8, finish: 'gloss', drips: true });

export const WIDTH_MIN = 0.3;
export const WIDTH_MAX = 3.0;
export const FLOW_MIN = 0.1;
export const FLOW_MAX = 1.0;

/**
 * Caps, in selector order. cm = approximate line width with the can held 25 cm
 * from the wall at width 1.0 (calligraphy: the length of its flat fan).
 */
export const CAP_LIST = Object.freeze([
  { id: 'skinny', label: 'skinny', cm: 1.2 },
  { id: 'standard', label: 'standard', cm: 3.0 },
  { id: 'fat', label: 'fat', cm: 9.0 },
  { id: 'calligraphy', label: 'calligraphy', cm: 6.0, flat: true },
]);
export const CAP_IDS = CAP_LIST.map((c) => c.id);
export const capSpec = (id) => CAP_LIST.find((c) => c.id === id) ?? CAP_LIST[1];

export const FINISH_LIST = Object.freeze(['matte', 'gloss', 'chrome']);

/** Approximate sprayed line width in cm for these settings (can 25 cm from the wall). */
export const sprayWidthCm = (s) => capSpec(s.cap).cm * clamp(+s.width || 1, WIDTH_MIN, WIDTH_MAX);

export function formatCm(cm) {
  return cm < 10 ? `${cm.toFixed(1)} cm` : `${Math.round(cm)} cm`;
}

/**
 * The palette, laid out as a paint chart: 12 columns, a light tint over a deeper
 * shade in each column. metal: rendered as a metallic swatch and switches the
 * finish to chrome while it is selected.
 */
export const PRESETS = Object.freeze([
  { name: 'Snow', hex: '#f1f0eb' }, { name: 'Jet Black', hex: '#141516' },
  { name: 'Concrete Grey', hex: '#8b8d8a' }, { name: 'Ash', hex: '#46494c' },
  { name: 'Chrome', hex: '#c3c7cc', metal: true }, { name: 'Copper', hex: '#b5683b', metal: true },
  { name: 'Tan', hex: '#c8a57b' }, { name: 'Brown', hex: '#5d3a25' },
  { name: 'Sun Yellow', hex: '#f4c21d' }, { name: 'Gold', hex: '#c89f45', metal: true },
  { name: 'Peach', hex: '#f1a985' }, { name: 'Signal Orange', hex: '#e95d1b' },
  { name: 'Fire Red', hex: '#d8262b' }, { name: 'Blood', hex: '#78151a' },
  { name: 'Bubblegum', hex: '#ee8ab3' }, { name: 'Magenta', hex: '#bf206e' },
  { name: 'Royal', hex: '#2f5bd3' }, { name: 'Violet', hex: '#673c9b' },
  { name: 'Sky', hex: '#68b6e2' }, { name: 'Ultramarine', hex: '#243a9b' },
  { name: 'Mint', hex: '#93d6bb' }, { name: 'Teal', hex: '#0e847f' },
  { name: 'Lime', hex: '#9dc93b' }, { name: 'Forest', hex: '#1f5534' },
]);

export const presetByHex = (hex) => PRESETS.find((p) => p.hex === hex) ?? null;

/** Validate a partial settings object against base; unknown or invalid values are dropped. */
export function sanitizeSettings(partial, base = DEFAULT_SETTINGS) {
  const out = { ...base };
  if (!partial || typeof partial !== 'object') return out;
  if ('color' in partial) {
    const c = normalizeHex(partial.color);
    if (c) out.color = c;
  }
  if ('cap' in partial && CAP_IDS.includes(partial.cap)) out.cap = partial.cap;
  if ('width' in partial && Number.isFinite(+partial.width)) out.width = clamp(+partial.width, WIDTH_MIN, WIDTH_MAX);
  if ('flow' in partial && Number.isFinite(+partial.flow)) out.flow = clamp(+partial.flow, FLOW_MIN, FLOW_MAX);
  if ('finish' in partial && FINISH_LIST.includes(partial.finish)) out.finish = partial.finish;
  if ('drips' in partial) out.drips = !!partial.drips;
  return out;
}

// ── recent colours (localStorage; storage may be missing or throw) ──

const RECENT_KEY = 'alley-paint-recent-v1';
export const RECENT_MAX = 8;

export function loadRecent() {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(RECENT_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    for (const v of raw) {
      const h = normalizeHex(v);
      if (h && !seen.has(h)) {
        seen.add(h);
        out.push(h);
      }
      if (out.length >= RECENT_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function saveRecent(list) {
  try {
    globalThis.localStorage?.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    /* storage unavailable (private mode, sandboxed frame, quota) */
  }
}
