// Procedural textures for the lighting pass: the flashlight/headlight cone, additive glow halos,
// the rain-on-glass mask for moonlight shafts, and gradient helpers. All are generated once and
// cached; light colors are baked into RGB on an opaque black ground so they can be ADDED
// ('lighter') into the lightmap or over the world.
import { hexToRgb } from '../art/palette.js';
import { CONE, falloff, falloffTube, hash1 } from './lighting_presets.js';

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

const cache = new Map();

/**
 * Cone texture pointing east (+x) with the origin at the canvas centre; size 2·RT square.
 * Color shifts from `color` on the axis to `edge` at the soft rim; `hot` adds the beam's hotspot.
 */
export function coneTexture(coneDeg, color, edge, hot, RT = 80) {
  const key = `cone|${coneDeg}|${color}|${edge}|${hot}|${RT}`;
  let c = cache.get(key);
  if (c) return c;
  c = canvas(RT * 2, RT * 2);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(c.width, c.height);
  const d8 = img.data;
  const h = (coneDeg * Math.PI) / 360;
  const [r0, g0, b0] = hexToRgb(color);
  const [r1, g1, b1] = hexToRgb(edge || color);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const dx = x + 0.5 - RT;
      const dy = y + 0.5 - RT;
      const d = Math.hypot(dx, dy) / RT;
      const theta = Math.abs(Math.atan2(dy, dx));
      const a = CONE.ang(theta, h);
      const v = CONE.value(d, theta, h, hot);
      const m = Math.min(1, a * 1.15); // axis color → rim color
      const i = (y * c.width + x) * 4;
      d8[i] = Math.min(255, v * (r1 + (r0 - r1) * m));
      d8[i + 1] = Math.min(255, v * (g1 + (g0 - g1) * m));
      d8[i + 2] = Math.min(255, v * (b1 + (b0 - b1) * m));
      d8[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}

/**
 * Additive halo sprite: soft `color` falloff over radius r (px) with an optional bright core.
 * sx/sy stretch the halo (fluorescent tubes are wide). Returns { canvas, ox, oy } (centre offset).
 */
export function glowSprite(color, r, { core = 0, sx = 1, sy = 1, power = 2.2 } = {}) {
  const key = `glow|${color}|${r}|${core}|${sx}|${sy}|${power}`;
  let g = cache.get(key);
  if (g) return g;
  const w = Math.ceil(r * sx) * 2 + 1;
  const hh = Math.ceil(r * sy) * 2 + 1;
  const c = canvas(w, hh);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, hh);
  const d8 = img.data;
  const [cr, cg, cb] = hexToRgb(color);
  const cx = (w - 1) / 2;
  const cy = (hh - 1) / 2;
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / sx;
      const dy = (y - cy) / sy;
      const d = Math.hypot(dx, dy);
      let v = d >= r ? 0 : Math.pow(1 - d / r, power);
      if (core && d < core) v += 0.9 * (1 - d / core);
      const i = (y * w + x) * 4;
      // Cores burn toward white.
      const wht = core && d < core ? 0.5 * (1 - d / core) : 0;
      d8[i] = Math.min(255, v * (cr + (255 - cr) * wht));
      d8[i + 1] = Math.min(255, v * (cg + (255 - cg) * wht));
      d8[i + 2] = Math.min(255, v * (cb + (255 - cb) * wht));
      d8[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  g = { canvas: c, ox: -cx, oy: -cy };
  cache.set(key, g);
  return g;
}

/**
 * Radial gradient of a light: color × intensity × falloff, as canvas gradient stops.
 * `tube` selects the fluorescent profile.
 */
export function lightGradient(ctx, x, y, r, rgb, tube) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  const f = tube ? falloffTube : falloff;
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const v = f(t);
    g.addColorStop(t, `rgb(${Math.round(rgb[0] * v)},${Math.round(rgb[1] * v)},${Math.round(rgb[2] * v)})`);
  }
  return g;
}

/**
 * Rain running down window glass, as an ALPHA mask (white = water streak shadow). Tileable
 * vertically; scrolled over time and punched out of the moonlight shafts.
 */
export function rainMask(w = 48, h = 96, seed = 17) {
  const key = `rain|${w}|${h}|${seed}`;
  let c = cache.get(key);
  if (c) return c;
  c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d8 = img.data;
  const set = (x, y, a) => {
    x = ((x % w) + w) % w;
    y = ((y % h) + h) % h;
    const i = (y * w + x) * 4;
    d8[i] = d8[i + 1] = d8[i + 2] = 255;
    d8[i + 3] = Math.max(d8[i + 3], a);
  };
  // Rivulets: wandering vertical trails of varying weight, with a bead at the head.
  for (let s = 0; s < 14; s++) {
    let x = Math.floor(hash1(s, seed) * w);
    const len = 18 + Math.floor(hash1(s, seed + 1) * (h - 18));
    const y0 = Math.floor(hash1(s, seed + 2) * h);
    const a = 70 + Math.floor(hash1(s, seed + 3) * 120);
    for (let k = 0; k < len; k++) {
      if (hash1(s * 997 + k, seed + 4) < 0.12) x += hash1(s * 991 + k, seed + 5) < 0.5 ? -1 : 1;
      const fade = 0.35 + 0.65 * (k / len);
      set(x, y0 + k, Math.round(a * fade));
    }
    set(x, y0 + len, Math.min(255, a + 60));
    set(x + 1, y0 + len, Math.round(a * 0.6));
  }
  // Scattered droplets.
  for (let s = 0; s < 40; s++) {
    set(Math.floor(hash1(s, seed + 9) * w), Math.floor(hash1(s, seed + 10) * h), 60 + Math.floor(hash1(s, seed + 11) * 110));
  }
  ctx.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}

/** "rgb(r,g,b)" scaled by v, for fills into additive buffers. */
export function rgbStr(rgb, v) {
  return `rgb(${Math.max(0, Math.min(255, Math.round(rgb[0] * v)))},${Math.max(0, Math.min(255, Math.round(rgb[1] * v)))},${Math.max(0, Math.min(255, Math.round(rgb[2] * v)))})`;
}
