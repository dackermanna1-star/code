// Colour helpers for the paint menu: hex parsing, HSV, sRGB <-> linear.
// Colours travel through the menu as lowercase '#rrggbb' sRGB strings.

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** '#abc', 'abc', '#AABBCC', 'aabbcc' -> '#aabbcc'; anything else -> null. */
export function normalizeHex(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase();
  if (s[0] === '#') s = s.slice(1);
  if (/^[0-9a-f]{3}$/.test(s)) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  return /^[0-9a-f]{6}$/.test(s) ? '#' + s : null;
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) | (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255)).toString(16).slice(1);
}

/** h in degrees, s and v in 0..1 -> [r, g, b] in 0..255 (unrounded). */
export function hsvToRgb(h, s, v) {
  h = (((h % 360) + 360) % 360) / 60;
  const i = Math.floor(h);
  const f = h - i;
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  let r, g, b;
  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q;
  }
  return [r * 255, g * 255, b * 255];
}

/** [r, g, b] 0..255 -> [h (deg), s, v]; h is NaN for greys. */
export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = NaN;
  if (d > 1e-9) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  return [h, max > 0 ? d / max : 0, max];
}

export const hsvToHex = (h, s, v) => rgbToHex(...hsvToRgb(h, s, v));

export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const linearToSrgb = (l) => (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055);

export function hexToLinear(hex) {
  const [r, g, b] = hexToRgb(hex);
  return [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)];
}

export function linearToHex(l) {
  return rgbToHex(linearToSrgb(clamp01(l[0])) * 255, linearToSrgb(clamp01(l[1])) * 255, linearToSrgb(clamp01(l[2])) * 255);
}

/** WCAG relative luminance of an sRGB hex. */
export function luminance(hex) {
  const l = hexToLinear(hex);
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}

/**
 * Base colour of chrome paint in linear RGB: bright silver tinted by the chosen
 * colour (t = 0.28 for ordinary colours; metallic paints like gold use more).
 */
export function chromeBase(lin, t = 0.28) {
  const silver = [0.62, 0.64, 0.68];
  return [silver[0] + (lin[0] - silver[0]) * t, silver[1] + (lin[1] - silver[1]) * t, silver[2] + (lin[2] - silver[2]) * t];
}
