// Restrained real-world spray-paint palette and color helpers (sRGB 0-255 arrays).

export const PAINT = {
  black: [22, 21, 22],
  softBlack: [40, 38, 39],
  white: [236, 235, 229],
  cream: [228, 219, 194],
  silver: [186, 190, 194],
  chromeDark: [140, 145, 151],
  lightGrey: [178, 179, 176],
  grey: [120, 122, 123],
  darkGrey: [68, 69, 71],
  red: [172, 34, 32],
  maroon: [102, 30, 36],
  gold: [192, 146, 54],
  ochre: [176, 128, 52],
  yellow: [220, 190, 74],
  orange: [206, 104, 44],
  pink: [220, 148, 166],
  rose: [190, 82, 108],
  skyBlue: [126, 174, 212],
  paleBlue: [168, 198, 222],
  blue: [46, 78, 146],
  navy: [34, 44, 82],
  mint: [154, 212, 186],
  paleMint: [184, 222, 204],
  teal: [64, 142, 136],
  green: [56, 104, 66],
  olive: [104, 108, 62],
  purple: [92, 62, 124],
  lavender: [170, 154, 202],
  brown: [102, 72, 50],
};

export function rgba(c, a = 1) {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a < 0 ? 0 : a > 1 ? 1 : +a.toFixed(4)})`;
}

export function rgb(c) { return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }

export function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function lum(c) { return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; }

export function desat(c, t) {
  const l = lum(c);
  return mix(c, [l, l, l], t);
}

export function scale(c, f) { return [clamp255(c[0] * f), clamp255(c[1] * f), clamp255(c[2] * f)]; }

export function lighten(c, t) { return mix(c, [255, 255, 255], t); }
export function darken(c, t) { return mix(c, [0, 0, 0], t); }

export function jitter(c, rng, amt = 8) {
  const d = rng.range(-amt, amt);
  return [
    clamp255(c[0] + d + rng.range(-amt, amt) * 0.35),
    clamp255(c[1] + d + rng.range(-amt, amt) * 0.35),
    clamp255(c[2] + d + rng.range(-amt, amt) * 0.35),
  ];
}

/**
 * Weathered version of a paint color: chalky, desaturated, pulled toward the wall
 * tone and dirt. amount 0..1.
 */
export function weather(c, amount, wallTone) {
  if (amount <= 0) return c.slice();
  const l = lum(c);
  const chalk = [l * 0.92 + 18, l * 0.92 + 18, l * 0.92 + 18];
  const target = mix(chalk, wallTone, 0.35);
  return mix(c, target, Math.min(1, amount) * 0.85);
}

export function isLight(c) { return lum(c) > 150; }

export function hexToRgb(h) {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

// RGB <-> HSL (0..1)
export function toHsl(c) {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

export function fromHsl(h, s, l) {
  h = ((h % 1) + 1) % 1;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

// ---------------------------------------------------------------------------
// Color pickers per element type

export function pickTagColor(rng) {
  return PAINT[rng.pickW([
    ['black', 58], ['softBlack', 8], ['white', 12], ['silver', 9], ['red', 5], ['maroon', 2],
    ['blue', 2.5], ['navy', 1.5], ['grey', 3], ['darkGrey', 2], ['gold', 1], ['pink', 1],
    ['purple', 1.5], ['skyBlue', 1], ['teal', 0.5], ['orange', 0.5], ['green', 0.5], ['lightGrey', 2],
  ])];
}

export function pickMarkerColor(rng) {
  return PAINT[rng.pickW([
    ['black', 46], ['white', 12], ['silver', 8], ['red', 8], ['blue', 6], ['purple', 6],
    ['green', 3], ['gold', 3], ['pink', 2], ['navy', 3], ['orange', 1],
  ])];
}

export function pickThrowFill(rng) {
  return rng.pickW([
    ['white', 22], ['silver', 30], ['black', 8], ['lightGrey', 6], ['cream', 4],
    ['mint', 5], ['paleBlue', 5], ['pink', 4], ['yellow', 3], ['lavender', 3],
    ['skyBlue', 3], ['red', 3], ['gold', 3], ['orange', 1], ['paleMint', 2],
  ]);
}

export function pickOutline(rng, fillName) {
  if (fillName === 'black' || fillName === 'navy') {
    return rng.pickW([['white', 5], ['silver', 2], ['red', 2], ['gold', 1], ['skyBlue', 1]]);
  }
  return rng.pickW([
    ['black', 82], ['softBlack', 6], ['red', 3], ['maroon', 2.5], ['blue', 2.5], ['purple', 2], ['navy', 2],
  ]);
}
