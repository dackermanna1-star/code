// Procedural texture library.
//
// Every texture in the game is painted at runtime onto a 2D canvas — there are
// no image assets. Textures are created lazily on first request, cached, and
// are fully deterministic (each one is driven by a PRNG seeded from its name).
//
//   import { getTexture, TEXTURE_NAMES } from './render/textures.js';
//   material.map = getTexture('wood_oak');

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Small maths / colour helpers
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;
const SANS = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
const MONO = 'ui-monospace, Menlo, Consolas, monospace';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** FNV-1a string hash → 32-bit seed. */
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small fast seeded PRNG returning floats in [0, 1). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rrange = (rng, a, b) => a + (b - a) * rng();
const rint = (rng, a, b) => Math.floor(rrange(rng, a, b + 1));
const rpick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

function hexRGB(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex, a = 1) {
  const [r, g, b] = hexRGB(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Build a 256-entry RGB lookup table from `[[t, '#hex'], ...]` colour stops. */
function rampLUT(stops) {
  const lut = new Uint8ClampedArray(256 * 3);
  const s = stops.map(([t, c]) => [t, hexRGB(c)]);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    while (j < s.length - 2 && t > s[j + 1][0]) j++;
    const [t0, c0] = s[j];
    const [t1, c1] = s[j + 1];
    const f = clamp01((t - t0) / (t1 - t0));
    for (let k = 0; k < 3; k++) lut[i * 3 + k] = c0[k] + (c1[k] - c0[k]) * f;
  }
  return lut;
}

// Packed 32-bit pixels let the per-pixel loops write one word instead of four bytes.
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/** Pack an opaque RGB colour (0..255 floats, clamped) into an ImageData-compatible uint32. */
function pack(r, g, b) {
  r = r <= 0 ? 0 : r >= 255 ? 255 : (r + 0.5) | 0;
  g = g <= 0 ? 0 : g >= 255 ? 255 : (g + 0.5) | 0;
  b = b <= 0 ? 0 : b >= 255 ? 255 : (b + 0.5) | 0;
  return (LITTLE_ENDIAN ? 0xff000000 | (b << 16) | (g << 8) | r : (r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0;
}

/** 256 packed pixels along a colour ramp. */
function rampLUT32(stops) {
  const lut = rampLUT(stops);
  const out = new Uint32Array(256);
  for (let i = 0; i < 256; i++) out[i] = pack(lut[i * 3], lut[i * 3 + 1], lut[i * 3 + 2]);
  return out;
}

/** 1024 packed pixels: `base` colour scaled by 0..2 (index 512 = unchanged). */
function tintLUT32(base) {
  const [r, g, b] = hexRGB(base);
  const out = new Uint32Array(1024);
  for (let i = 0; i < 1024; i++) out[i] = pack((r * i) / 512, (g * i) / 512, (b * i) / 512);
  return out;
}

const GREY_LUT32 = new Uint32Array(256);
for (let i = 0; i < 256; i++) GREY_LUT32[i] = pack(i, i, i);

// ---------------------------------------------------------------------------
// Tileable value noise
// ---------------------------------------------------------------------------

/**
 * Core resampler shared by all noise helpers: bilinearly stretches a periodic
 * `sw`×`sh` lattice over `w`×`h` pixels and ADDS it to `out`. With `ease` the
 * interpolation is smoothstep-eased (classic value noise), otherwise linear.
 * The lattice wraps, so the result tiles seamlessly.
 */
function resampleAdd(out, src, sw, sh, w, h, ease) {
  // x → lattice column + fraction (computed once, reused for every row)
  const xi = new Int32Array(w);
  const tx = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const f = (x * sw) / w;
    const i = Math.floor(f);
    const t = f - i;
    xi[x] = i;
    tx[x] = ease ? t * t * (3 - 2 * t) : t;
  }
  const row = new Float32Array(sw + 1); // lattice row blended in y, +1 wrap column
  let o = 0;
  for (let y = 0; y < h; y++) {
    const f = (y * sh) / h;
    const j = Math.floor(f);
    let ty = f - j;
    if (ease) ty = ty * ty * (3 - 2 * ty);
    const r0 = j * sw;
    const r1 = ((j + 1) % sh) * sw;
    for (let i = 0; i < sw; i++) {
      const a = src[r0 + i];
      row[i] = a + (src[r1 + i] - a) * ty;
    }
    row[sw] = row[0];
    if (sw === w) {
      for (let x = 0; x < w; x++) out[o++] += row[x];
    } else {
      for (let x = 0; x < w; x++) {
        const i = xi[x];
        const a = row[i];
        out[o++] += a + (row[i + 1] - a) * tx[x];
      }
    }
  }
}

/**
 * Accumulate one octave of smooth value noise (amplitude `amp`) into `out`.
 * The random lattice has `cx` × `cy` cells across the whole image; different
 * cx/cy give anisotropic (streaky) noise.
 */
function addNoise(out, w, h, rng, cx, cy, amp) {
  cx = Math.max(1, Math.min(w, Math.round(cx)));
  cy = Math.max(1, Math.min(h, Math.round(cy)));
  const lat = new Float32Array(cx * cy);
  for (let i = 0; i < lat.length; i++) lat[i] = rng() * amp;
  resampleAdd(out, lat, cx, cy, w, h, true);
}

/** Tileable fractal noise field in [0,1] (mean 0.5). */
function fbm(w, h, rng, cx, cy, octaves = 4, gain = 0.5, lacX = 2, lacY = lacX) {
  const out = new Float32Array(w * h);
  let sum = 0;
  for (let o = 0, a = 1; o < octaves; o++, a *= gain) sum += a;
  let amp = 1 / sum;
  for (let o = 0; o < octaves; o++) {
    addNoise(out, w, h, rng, cx, cy, amp);
    amp *= gain;
    cx *= lacX;
    cy *= lacY;
  }
  return out;
}

/** Uniform white noise in [0,1): `n` samples from a cheap inline LCG seeded by `rng`. */
function whiteNoise(n, rng) {
  const out = new Float32Array(n);
  let s = (rng() * 4294967296) >>> 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = (s >>> 8) * 5.9604644775390625e-8;
  }
  return out;
}

/** Periodic bilinear upsample of a small `sw`×`sh` field to `w`×`h` (cheap way to get smooth low-frequency fields). */
function upsample(src, sw, sh, w, h) {
  const out = new Float32Array(w * h);
  resampleAdd(out, src, sw, sh, w, h, false);
  return out;
}

/** Tileable 1D fractal noise, `n` samples in [0,1]. */
function fbm1(n, rng, cells, octaves = 4, gain = 0.5) {
  return fbm(n, 1, rng, cells, 1, octaves, gain, 2, 1);
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  throw new Error('textures: no 2D canvas available in this environment');
}

/** Write a float field through a packed LUT: pixel = lut[clamp(v * scale + bias)]. */
function blit(ctx, w, h, v, lut, scale, bias) {
  const img = ctx.createImageData(w, h);
  const d = new Uint32Array(img.data.buffer);
  const top = lut.length - 1;
  for (let i = 0, n = w * h; i < n; i++) {
    const k = (v[i] * scale + bias) | 0;
    d[i] = lut[k < 0 ? 0 : k > top ? top : k];
  }
  ctx.putImageData(img, 0, 0);
}

/** Field as `base` colour scaled by `1 + v[i]` (v = small signed brightness delta). */
const blitTint = (ctx, w, h, base, v) => blit(ctx, w, h, v, tintLUT32(base), 512, 512);
/** 0..1 field through colour-ramp stops. */
const blitRamp = (ctx, w, h, stops, v) => blit(ctx, w, h, v, rampLUT32(stops), 255, 0);
/** 0..1 field as greyscale (height maps). */
const blitGrey = (ctx, w, h, v) => blit(ctx, w, h, v, GREY_LUT32, 255, 0);

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function fillRR(ctx, color, x, y, w, h, r) {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRR(ctx, color, lw, x, y, w, h, r) {
  rr(ctx, x, y, w, h, r);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function fillR(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function disc(ctx, color, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

function ring(ctx, color, lw, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function line(ctx, color, lw, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
}

/** Text helper. `o`: { weight, align, base, font }. Only weights 400/600/700 are used to keep font set-up cheap. */
function txt(ctx, str, x, y, size, color, o = {}) {
  ctx.font = `${o.weight || 400} ${size}px ${o.font || SANS}`;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.base || 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function vGrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}

function glow(ctx, x, y, r, hex, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(hex, a));
  g.addColorStop(1, rgba(hex, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/**
 * Small tileable RGBA noise canvas for cheap native overlays: where the noise
 * is below 0.5 the pixel is `dark`, above it `light`; alpha grows with the
 * distance from 0.5 up to `amp`. Draw it stretched, or use it as a pattern.
 */
function noiseLayer(w, h, rng, cx, cy, octaves, dark, light, amp, white = 0) {
  const n = fbm(w, h, rng, cx, cy, octaves, 0.55);
  const wn = white ? whiteNoise(w * h, rng) : null;
  const [dr, dg, db] = hexRGB(dark);
  const [lr, lg, lb] = hexRGB(light);
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const v = (n[i] - 0.5) * 2.6 + (wn ? (wn[i] - 0.5) * white : 0);
    if (v < 0) {
      d[p] = dr;
      d[p + 1] = dg;
      d[p + 2] = db;
      d[p + 3] = -v * amp * 255;
    } else {
      d[p] = lr;
      d[p + 1] = lg;
      d[p + 2] = lb;
      d[p + 3] = v * amp * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Fill the whole canvas with a repeating noise layer (subtle surface grain). */
function grainOverlay(ctx, w, h, layer) {
  ctx.fillStyle = ctx.createPattern(layer, 'repeat');
  ctx.fillRect(0, 0, w, h);
}

/** Radial gradient (centred on the origin) whose alpha follows 1/(1+k·d²)² — a soft photographic bloom. */
function bloomGradient(ctx, radius, k, rgb) {
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  const f = (d) => 1 / ((1 + k * d * d) * (1 + k * d * d));
  const end = f(radius);
  for (const t of [0, 0.04, 0.08, 0.14, 0.22, 0.32, 0.45, 0.6, 0.8, 1]) {
    grad.addColorStop(t, `rgba(${rgb},${clamp01((f(t * radius) - end) / (1 - end)).toFixed(4)})`);
  }
  return grad;
}

// ---------------------------------------------------------------------------
// Wood
// ---------------------------------------------------------------------------

// Hot per-pixel loops live in small kernels that only take numbers and typed
// arrays, so the JIT can optimise them quickly and never has to bail out.

/** Per-pixel wood tone: fibres, growth rings and pores along a wandering grain. */
function woodKernel(S, N, v, drift, kdx, fig, streak, fibre, pore, tone, prof, RR, kDrift, figAmp, mid, kStreak, kFibre, kRing, kTone, kPore) {
  const M = S - 1;
  const Q = S >> 2;
  const rs = N / S;
  const invN = 1 / N;
  const base = N * 4;
  for (let y = 0, i = 0; y < S; y++) {
    const row = y * S;
    const qrow = (y >> 2) * Q;
    const prow = (y >> 1) * S - row; // pores are stored at half vertical resolution
    for (let x = 0; x < S; x++, i++) {
      // sample position across the grain: slow wander + deflection around knots
      const sx = x + (drift[i] - 0.5) * kDrift - kdx[i];
      const xf = Math.floor(sx);
      const fr = sx - xf;
      const xa = row + (xf & M);
      const xb = row + ((xf + 1) & M);
      const st = streak[xa];
      const f0 = fibre[xa];
      const fb = f0 + (fibre[xb] - f0) * fr;
      // growth-ring coordinate (periodic over N rings so the tile wraps)
      let r = sx * rs + (fig[i] - 0.5) * figAmp + (st - 0.5) * 0.9 + base;
      r -= N * ((r * invN) | 0);
      const late = prof[(r * RR) | 0];
      let val = mid + (st - 0.5) * kStreak + (fb - 0.5) * kFibre - late * kRing + (tone[qrow + (x >> 2)] - 0.5) * kTone;
      const p0 = pore[prow + xa];
      const pv = p0 + (pore[prow + xb] - p0) * fr;
      if (pv > 0.64) val -= (pv - 0.64) * kPore * (0.4 + late * 1.8);
      v[i] = val;
    }
  }
}

/** Sideways deflection of the grain around each knot (fisheye), accumulated into `kdx`. */
function knotDeflection(S, knots, kdx) {
  const M = S - 1;
  const KE = 13; // extent of a knot's influence, in squared knot radii
  for (const kn of knots) {
    const ex = Math.ceil(kn.r * Math.sqrt(KE));
    const ey = Math.ceil(kn.r * 2.3 * Math.sqrt(KE));
    for (let dy = -ey; dy <= ey; dy++) {
      const ay = dy / (kn.r * 2.3);
      const row = ((kn.y + dy) & M) * S;
      for (let dx = -ex; dx <= ex; dx++) {
        const ax = dx / kn.r;
        const e = ax * ax + ay * ay;
        if (e < KE) {
          const w = 1 - e / KE;
          kdx[row + ((kn.x + dx) & M)] += dx * w * w * 0.9;
        }
      }
    }
  }
}

/** Darken `v` inside/around each knot (halo, bark rim, concentric rings); returns the knot-body mask. */
function knotShade(S, knots, v, fig, fibre) {
  const M = S - 1;
  const mask = new Float32Array(S * S);
  for (const kn of knots) {
    const ex = Math.ceil(kn.r * 1.5);
    const ey = Math.ceil(kn.r * 1.7);
    for (let dy = -ey; dy <= ey; dy++) {
      const ay = dy / (kn.r * 2.3);
      const row = ((kn.y + dy) & M) * S;
      for (let dx = -ex; dx <= ex; dx++) {
        const ax = dx / kn.r;
        const i = row + ((kn.x + dx) & M);
        const kr = Math.sqrt((ax * ax + ay * ay * 4.2) * 2.4) * (1 + (fig[i] - 0.5) * 0.35); // 1 = knot edge
        if (kr >= 1.9) continue;
        const kb = 1 - smoothstep(0.82, 1.08, kr);
        const fb = fibre[i];
        v[i] -=
          (1 - smoothstep(1.0, 1.9, kr)) * 0.12 + // resin-stained halo
          smoothstep(0.7, 0.97, kr) * (1 - smoothstep(0.97, 1.22, kr)) * 0.34 + // dark bark rim
          kb * (0.02 + 0.09 * Math.sin(kr * 11 + fb * 5) + (0.5 - fb) * 0.4 - (1 - kr) * 0.1); // rings inside
        mask[i] = kb;
      }
    }
  }
  return mask;
}

/**
 * Shared wood generator; grain runs along canvas Y.
 * Returns per-pixel tonal value `v` (0..1: dark latewood / pores → pale
 * earlywood), a quarter-resolution `tone` field for hue drift, and (when the
 * wood has knots) a `knot` mask (0..1 blend towards knot heartwood).
 */
function woodValue(S, rng, o) {
  const n = S * S;
  const N = o.rings;
  const Q = S >> 2;
  // smooth low-frequency fields are built small and upsampled
  const fig = upsample(fbm(Q, Q, rng, o.figX, o.figY, 2, o.figGain), Q, Q, S, S); // ring distortion → cathedral figure
  const drift = upsample(fbm(Q, Q, rng, 2, 2, 2, 0.4), Q, Q, S, S); // slow sideways wander of the grain
  const streak = upsample(fbm(Q, 16, rng, 8, 1, 3, 0.6, 2.7, 1.5), Q, 16, S, S); // broad tonal bands
  const FY = S >> 3; // fibres change slowly along the grain → low Y resolution
  const fl = new Float32Array(S * FY);
  addNoise(fl, S, FY, rng, S, 4, 0.55);
  addNoise(fl, S, FY, rng, S / 3, 11, 0.45);
  const fibre = upsample(fl, S, FY, S, S); // fine long fibres (1–3 px wide)
  const pore = fbm(S, S >> 1, rng, S, o.poreLen || 50, 1); // 1 px wide vessel dashes / resin canals (half Y res)
  const tone = fbm(Q, Q, rng, 2, 2, 3, 0.5);

  // growth-ring darkness profile over one full period of N rings:
  // varying ring widths (periodic jitter), varying strength, soft-then-sharp latewood edge
  const ringGain = new Float32Array(N);
  for (let k = 0; k < N; k++) ringGain[k] = 0.35 + 0.65 * rng();
  const p1 = rng() * TAU;
  const p2 = rng() * TAU;
  const w1 = (TAU * 3) / N;
  const w2 = (TAU * 7) / N;
  const j1 = Math.min(0.32, 0.45 / w1);
  const j2 = Math.min(0.16, 0.32 / w2);
  const e0 = o.ringEdge || 0.9;
  const RR = 48;
  const prof = new Float32Array(N * RR + 1);
  for (let k = 0; k < prof.length; k++) {
    let r = k / RR;
    r += j1 * Math.sin(r * w1 + p1) + j2 * Math.sin(r * w2 + p2) + N;
    const ri = Math.floor(r);
    const f = r - ri;
    prof[k] = Math.pow(f, o.ringPow || 2) * (1 - smoothstep(e0, 1, f)) * ringGain[ri % N];
  }

  const v = new Float32Array(n);
  const kdx = new Float32Array(n);
  const knots = o.knots || [];
  if (knots.length) knotDeflection(S, knots, kdx);
  woodKernel(S, N, v, drift, kdx, fig, streak, fibre, pore, tone, prof, RR, o.drift, o.figAmp, o.mid, o.streak, o.fibre, o.ring, o.tone, o.pore * 2.8);
  const knot = knots.length ? knotShade(S, knots, v, fig, fibre) : null;
  return { v, tone, knot };
}

function paintWood(ctx, S, rng, o) {
  const { v, tone, knot } = woodValue(S, rng, o);
  const base = rampLUT(o.ramp);
  // 2D lookup: 32 warm↔cool hue steps × 256 tonal values
  const HL = 32;
  const lut = new Uint32Array(HL * 256);
  for (let hq = 0; hq < HL; hq++) {
    const h = ((hq + 0.5) / HL - 0.5) * (o.hue || 0);
    for (let k = 0; k < 256; k++) lut[(hq << 8) | k] = pack(base[k * 3] * (1 + h), base[k * 3 + 1], base[k * 3 + 2] * (1 - h * 1.6));
  }
  const Q = S >> 2;
  const img = ctx.createImageData(S, S);
  const d = new Uint32Array(img.data.buffer);
  for (let y = 0, i = 0; y < S; y++) {
    const qrow = (y >> 2) * Q;
    for (let x = 0; x < S; x++, i++) {
      const t = v[i];
      const k = t <= 0 ? 0 : t >= 1 ? 255 : (t * 255) | 0;
      d[i] = lut[(((tone[qrow + (x >> 2)] * HL) | 0) << 8) | k];
    }
  }
  if (knot) {
    // blend the (few) knot pixels towards darker, redder heartwood
    const klut = rampLUT(o.knotRamp);
    for (let i = 0; i < knot.length; i++) {
      const kb = knot[i];
      if (kb <= 0) continue;
      const t = v[i];
      const k = (t <= 0 ? 0 : t >= 1 ? 255 : (t * 255) | 0) * 3;
      d[i] = pack(base[k] + (klut[k] - base[k]) * kb, base[k + 1] + (klut[k + 1] - base[k + 1]) * kb, base[k + 2] + (klut[k + 2] - base[k + 2]) * kb);
    }
  }
  ctx.putImageData(img, 0, 0);
}

const WOODS = {
  wood_oak: {
    ramp: [[0, '#5a3d22'], [0.3, '#8f6a43'], [0.55, '#b28c5e'], [0.78, '#c7a474'], [1, '#dabd90']],
    rings: 26, figX: 2, figY: 1, figGain: 0.8, figAmp: 24, drift: 9, mid: 0.72, streak: 0.4, fibre: 0.3,
    ring: 0.3, ringPow: 5, ringEdge: 0.93, pore: 0.75, poreLen: 46, tone: 0.2, hue: 0.1,
  },
  wood_walnut: {
    ramp: [[0, '#1f1108'], [0.3, '#3a2314'], [0.55, '#553622'], [0.8, '#70492e'], [1, '#8c6141']],
    rings: 18, figX: 3, figY: 1, figGain: 0.6, figAmp: 13, drift: 28, mid: 0.62, streak: 0.55, fibre: 0.3,
    ring: 0.36, ringPow: 2, ringEdge: 0.78, pore: 0.5, poreLen: 40, tone: 0.3, hue: 0.16,
  },
  wood_pine: {
    ramp: [[0, '#9c672f'], [0.3, '#c4914f'], [0.55, '#ddb878'], [0.8, '#ebcf96'], [1, '#f4e0b2']],
    knotRamp: [[0, '#3a1f0c'], [0.35, '#6e4320'], [0.65, '#9a6632'], [1, '#c08a4c']],
    rings: 22, figX: 2, figY: 1, figGain: 0.6, figAmp: 12, drift: 18, mid: 0.8, streak: 0.24, fibre: 0.2,
    ring: 0.5, ringPow: 4, ringEdge: 0.93, pore: 0.16, poreLen: 30, tone: 0.16, hue: 0.1,
    knots: [{ x: 150, y: 118, r: 26 }, { x: 396, y: 332, r: 18 }, { x: 58, y: 420, r: 11 }],
  },
  wood_white: {
    ramp: [[0, '#cbc8c0'], [0.5, '#ebe9e4'], [1, '#f9f8f5']],
    rings: 26, figX: 2, figY: 1, figGain: 0.8, figAmp: 22, drift: 9, mid: 0.68, streak: 0.12, fibre: 0.12,
    ring: 0.16, ringPow: 5, ringEdge: 0.93, pore: 0.22, poreLen: 46, tone: 0.06, hue: 0,
  },
};
const WOOD_BUMP = { rings: 26, figX: 2, figY: 1, figGain: 0.8, figAmp: 24, drift: 9, mid: 0.58, streak: 0.1, fibre: 0.42, ring: 0.16, ringPow: 5, ringEdge: 0.93, pore: 1.1, poreLen: 46, tone: 0 };

/** Freshly broken wood: pale torn fibre bundles snapped at different lengths. */
function paintRawWood(ctx, S, rng) {
  const M = S - 1;
  const n = S * S;
  const ridge = fbm(S, S, rng, 110, 2, 3, 0.62, 2, 1.5); // fibre bundles
  const fine = fbm(S, S, rng, S, 6, 1); // individual fibres
  const Q = S >> 2;
  const steps = fbm(Q, Q, rng, 6, 5, 2, 0.5); // where bundles snapped
  const drift = fbm(Q, Q, rng, 2, 3, 2, 0.5);
  const tone = fbm(Q, Q, rng, 3, 2, 2, 0.5);
  // height field: fibre ridges + plateaus of different break lengths
  const Hf = new Float32Array(n);
  const F = new Float32Array(n);
  for (let y = 0, i = 0; y < S; y++) {
    const row = y * S;
    const qrow = (y >> 2) * Q;
    for (let x = 0; x < S; x++, i++) {
      const qi = qrow + (x >> 2);
      const sx = x + (drift[qi] - 0.5) * 34;
      const xf = Math.floor(sx);
      const a = row + (xf & M);
      const rd = ridge[a];
      const fn = fine[a];
      F[i] = rd * 0.72 + fn * 0.28;
      Hf[i] = F[i] * 0.5 + Math.floor((steps[qi] + (rd - 0.5) * 0.55 + (fn - 0.5) * 0.25) * 9) / 9;
    }
  }
  const v = new Float32Array(n);
  for (let y = 0, i = 0; y < S; y++) {
    const row = y * S;
    const up = ((y - 1) & M) * S;
    const dn = ((y + 2) & M) * S;
    const qrow = (y >> 2) * Q;
    for (let x = 0; x < S; x++, i++) {
      const sx = Hf[row + ((x + 1) & M)] - Hf[row + ((x - 1) & M)];
      let sy = (Hf[dn + x] - Hf[up + x]) * 2.2;
      sy = sy < -0.3 ? -0.3 : sy > 0.22 ? 0.22 : sy;
      const f = F[i];
      const crevice = f < 0.47 ? smoothstep(0.47, 0.36, f) : 0;
      v[i] = 0.64 + (f - 0.5) * 0.8 - sx * 0.55 - sy - crevice * 0.24 + (tone[qrow + (x >> 2)] - 0.5) * 0.22;
    }
  }
  blitRamp(ctx, S, S, [[0, '#4a2e14'], [0.25, '#94693a'], [0.5, '#cba66e'], [0.72, '#e6cc9a'], [1, '#faefd0']], v);
}

// ---------------------------------------------------------------------------
// Metals, plastics, mineral surfaces
// ---------------------------------------------------------------------------

/** Horizontal brushing: signed value field made of long streaks of mixed length. */
function brushedField(S, rng) {
  const out = new Float32Array(S * S);
  addNoise(out, S, S, rng, 1, S, 0.34); // full-width lines
  addNoise(out, S, S, rng, 3, S, 0.3);
  addNoise(out, S, S, rng, 11, S, 0.22);
  addNoise(out, S, S, rng, 40, S / 2, 0.14); // short scratches
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - 0.5) * 2;
  return out;
}

function paintBrushed(ctx, S, rng) {
  const v = brushedField(S, rng);
  const Q = S >> 2;
  const blot = fbm(Q, Q, rng, 3, 3, 2, 0.5);
  for (let y = 0, i = 0; y < S; y++) for (let x = 0; x < S; x++, i++) v[i] = v[i] * 0.085 + (blot[(y >> 2) * Q + (x >> 2)] - 0.5) * 0.05;
  blitTint(ctx, S, S, '#b7babd', v);
}

function paintDrumSteel(ctx, S, rng) {
  const v = brushedField(S, rng);
  for (let i = 0; i < v.length; i++) v[i] *= 0.065;
  blitTint(ctx, S, S, '#babdc0', v);
  const P = 32;
  const R = 3.7;
  for (let j = 0; j < S / P; j++) {
    const y = P / 2 + j * P;
    const off = j & 1 ? 0 : P / 2;
    for (let i = 0; i <= S / P; i++) {
      const x = off + i * P;
      // pressed dimple around the hole
      let g = ctx.createRadialGradient(x, y, R, x, y, R + 5);
      g.addColorStop(0, 'rgba(40,42,46,0.42)');
      g.addColorStop(1, 'rgba(40,42,46,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - R - 5, y - R - 5, (R + 5) * 2, (R + 5) * 2);
      // hole
      g = ctx.createRadialGradient(x - 0.8, y - 0.8, 0.5, x, y, R);
      g.addColorStop(0, '#040405');
      g.addColorStop(1, '#17181b');
      disc(ctx, g, x, y, R);
      // rim: highlight lower-right, shadow upper-left
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(x, y, R + 0.9, -0.15, Math.PI * 0.65);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, R + 0.9, Math.PI * 0.9, Math.PI * 1.6);
      ctx.strokeStyle = 'rgba(0,0,0,0.38)';
      ctx.stroke();
    }
  }
}

/**
 * Signed fine-grain field shared by the plain materials: soft low-frequency
 * mottling (`lo`), mid-scale texture (`mid`) and per-pixel speckle (`white`).
 * Returns { v, wn } so callers can reuse the white noise for sparse specks.
 */
function grainField(S, rng, o) {
  const n = S * S;
  const Q = S >> 2;
  const lo = fbm(Q, Q, rng, o.loCells || 4, o.loCells || 4, 3, 0.5);
  const mc = o.midCells || 96;
  const mid = o.mid ? fbm(S, S, rng, mc, o.midCellsY || mc, o.midOct || 2, 0.6) : null;
  const wn = whiteNoise(n, rng);
  const v = new Float32Array(n);
  for (let y = 0, i = 0; y < S; y++) {
    const qrow = (y >> 2) * Q;
    for (let x = 0; x < S; x++, i++) v[i] = (lo[qrow + (x >> 2)] - 0.5) * o.lo + (wn[i] - 0.5) * o.white + (mid ? (mid[i] - 0.5) * o.mid : 0);
  }
  return { v, wn };
}

function paintGrain(ctx, S, rng, base, o) {
  blitTint(ctx, S, S, base, grainField(S, rng, o).v);
}

function paintHardboard(ctx, S, rng) {
  const { v } = grainField(S, rng, { loCells: 5, lo: 0.1, midCells: 150, midCellsY: 110, mid: 0.3, white: 0.16 });
  const fib = fbm(S, S, rng, 256, 90, 1);
  for (let i = 0; i < v.length; i++) {
    const f = fib[i];
    if (f > 0.74) v[i] += (f - 0.74) * 1.4; // pale pressed fibres
    else if (f < 0.24) v[i] -= (0.24 - f) * 1.2;
  }
  blitTint(ctx, S, S, '#72543a', v);
}

function paintCeramicRaw(ctx, S, rng) {
  const { v, wn } = grainField(S, rng, { lo: 0.16, midCells: 140, mid: 0.5, white: 0.2 });
  for (let i = 0; i < v.length; i++) {
    const w = wn[i];
    v[i] += w > 0.988 ? 0.32 : w < 0.01 ? 0.87 : 0.62; // dark grog specks / quartz glints
  }
  blitRamp(ctx, S, S, [[0, '#7d6650'], [0.3, '#bca88c'], [0.55, '#dccdb4'], [0.8, '#ebe0cc'], [1, '#f8f1e2']], v);
}

/** Call `fn(x, y)` for a stamp at (x, y) of radius r and for its wrapped copies, so stamps tile. */
function stampWrapped(S, x, y, r, fn) {
  for (let oy = -S; oy <= S; oy += S) {
    if (y + oy + r < 0 || y + oy - r > S) continue;
    for (let ox = -S; ox <= S; ox += S) {
      if (x + ox + r < 0 || x + ox - r > S) continue;
      fn(x + ox, y + oy);
    }
  }
}

function paintConcrete(ctx, S, rng) {
  const { v } = grainField(S, rng, { loCells: 3, lo: 0.3, midCells: 40, midOct: 2, mid: 0.26, white: 0.1 });
  for (let i = 0; i < v.length; i++) v[i] += 0.55;
  blitRamp(ctx, S, S, [[0, '#3d3c3a'], [0.3, '#7b7a76'], [0.55, '#9d9c97'], [0.8, '#b7b5af'], [1, '#d5d2ca']], v);
  // aggregate: small stones of mixed tone showing through the cement skin
  for (let i = 0; i < 520; i++) {
    const r = 0.9 + 4.2 * rng() ** 3;
    const light = rng() < 0.6;
    const col = light ? `rgba(214,212,204,${rrange(rng, 0.18, 0.5)})` : `rgba(84,83,80,${rrange(rng, 0.16, 0.42)})`;
    const rot = rng() * Math.PI;
    const asp = rrange(rng, 0.55, 1);
    stampWrapped(S, rng() * S, rng() * S, r, (x, y) => {
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * asp, rot, 0, TAU);
      ctx.fillStyle = col;
      ctx.fill();
    });
  }
  // air pores: dark pin-holes with a faint lit lower lip
  for (let i = 0; i < 190; i++) {
    const r = 0.5 + 1.5 * rng() ** 2;
    const a = rrange(rng, 0.55, 0.9);
    stampWrapped(S, rng() * S, rng() * S, r + 1, (x, y) => {
      disc(ctx, 'rgba(226,224,216,0.28)', x + 0.3, y + 0.5, r + 0.5);
      disc(ctx, `rgba(42,41,39,${a})`, x, y, r);
    });
  }
}

// ---------------------------------------------------------------------------
// Fabric
// ---------------------------------------------------------------------------

/**
 * 2/2 twill weave: thread height (0..1) and per-thread tint. Threads are 4 px
 * wide and every float passes over two crossings, stepping one thread per row,
 * which gives the fine diagonal rib of upholstery cloth. Pattern period: 16 px.
 */
function weaveField(S, rng) {
  const n = S / 4;
  const warp = new Float32Array(n);
  const weft = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    warp[i] = 0.93 + rng() * 0.14;
    weft[i] = 0.93 + rng() * 0.14;
  }
  const across = [0.5, 0.96, 1.0, 0.6]; // roundness across a thread (lit from one side)
  const along = new Float32Array(8); // crown along a two-crossing float
  for (let i = 0; i < 8; i++) along[i] = 0.5 + 0.5 * Math.pow(Math.sin((Math.PI * (i + 0.5)) / 8), 0.7);
  const h = new Float32Array(S * S);
  const tint = new Float32Array(S * S);
  for (let y = 0, i = 0; y < S; y++) {
    const cy = y >> 2;
    const v = y & 3;
    for (let x = 0; x < S; x++, i++) {
      const cx = x >> 2;
      const u = x & 3;
      const t = (cy - cx) & 3;
      if (t < 2) {
        // warp (vertical) thread on top; t = which half of its float
        h[i] = across[u] * along[t * 4 + v];
        tint[i] = warp[cx];
      } else {
        h[i] = across[v] * along[(3 - t) * 4 + u] * 0.94;
        tint[i] = weft[cy];
      }
    }
  }
  return { h, tint };
}

function paintFabric(ctx, S, rng) {
  const { h, tint } = weaveField(S, rng);
  const { v } = grainField(S, rng, { loCells: 5, lo: 0.08, white: 0.12 });
  for (let i = 0; i < v.length; i++) v[i] += (0.1 + h[i] * 0.66) * tint[i];
  blitRamp(ctx, S, S, [[0, '#0d0e10'], [0.35, '#232528'], [0.7, '#383b40'], [1, '#565a61']], v);
}

// ---------------------------------------------------------------------------
// Book page edges
// ---------------------------------------------------------------------------

function paintBookPages(ctx, S, rng) {
  const n = S * S;
  const r = new Float32Array(n); // one value per leaf, wandering slightly along X
  addNoise(r, S, S, rng, 1, S, 0.55);
  addNoise(r, S, S, rng, 5, S / 1.5, 0.3);
  addNoise(r, S, S, rng, 16, S / 1.5, 0.15);
  const Q = S >> 2;
  const lo = fbm(Q, Q, rng, 3, 3, 2, 0.5);
  const sig = fbm(1, S, rng, 1, S / 5, 1); // signature (gathering) banding
  const wn = whiteNoise(n, rng);
  const v = new Float32Array(n);
  for (let y = 0, i = 0; y < S; y++) {
    const qrow = (y >> 2) * Q;
    const s = (sig[y] - 0.5) * 0.16;
    for (let x = 0; x < S; x++, i++) {
      const t = r[i];
      let val = 0.74 + (t - 0.5) * 0.5 + s + (lo[qrow + (x >> 2)] - 0.5) * 0.1 + (wn[i] - 0.5) * 0.05;
      if (t < 0.36) val -= (0.36 - t) * 2.4; // shadow gaps between leaves
      v[i] = val;
    }
  }
  blitRamp(ctx, S, S, [[0, '#6e6248'], [0.35, '#b9ad8e'], [0.6, '#ddd3b8'], [0.82, '#efe8d3'], [1, '#fbf7ea']], v);
}

// ---------------------------------------------------------------------------
// Studio floor (1024² = 2 m × 2 m)
// ---------------------------------------------------------------------------

const FLOOR_LINE = 3; // px width of the 1 m grid lines

/** Grid lines every 1 m (tile edge + middle) and, optionally, half-metre ticks / crosses. */
function floorMarks(ctx, S, lineColor, tickColor) {
  const half = S / 2;
  ctx.fillStyle = lineColor;
  for (const c of [0, half, S]) {
    ctx.fillRect(c - FLOOR_LINE / 2, 0, FLOOR_LINE, S);
    ctx.fillRect(0, c - FLOOR_LINE / 2, S, FLOOR_LINE);
  }
  if (!tickColor) return;
  ctx.fillStyle = tickColor;
  const q = S / 4;
  for (const a of [q, 3 * q]) {
    for (const c of [0, half, S]) {
      // ticks where half-metre positions meet the 1 m lines
      ctx.fillRect(a - 1, c - 9, 2, 18);
      ctx.fillRect(c - 9, a - 1, 18, 2);
    }
    for (const b of [q, 3 * q]) {
      // small crosses at the half-metre intersections (cell centres)
      ctx.fillRect(a - 1, b - 8, 2, 16);
      ctx.fillRect(a - 8, b - 1, 16, 2);
    }
  }
}

function paintFloor(ctx, S, rng) {
  // large soft mottling is built at half resolution, fine speckle at full
  const L = S >> 1;
  const Q = S >> 3;
  const lo = fbm(Q, Q, rng, 2, 2, 4, 0.55);
  const mid = fbm(L, L, rng, 24, 24, 2, 0.5);
  const fleck = fbm(L, L, rng, 170, 170, 1);
  const m = new Float32Array(L * L);
  for (let y = 0, i = 0; y < L; y++) {
    const qrow = (y >> 2) * Q;
    for (let x = 0; x < L; x++, i++) {
      const fl = fleck[i];
      // stored pre-scaled as a tint-LUT index (512 = base colour)
      m[i] = 512 * (0.989 + (lo[qrow + (x >> 2)] - 0.5) * 0.085 + (mid[i] - 0.5) * 0.03 + (fl > 0.8 ? (fl - 0.8) * 0.12 : fl < 0.2 ? (fl - 0.2) * 0.12 : 0));
    }
  }
  const lut = tintLUT32('#cbc8c2');
  const img = ctx.createImageData(S, S);
  const d = new Uint32Array(img.data.buffer);
  let s = (rng() * 4294967296) >>> 0;
  for (let y = 0, p = 0; y < S; y++) {
    const row = (y >> 1) * L;
    for (let x = 0; x < S; x++, p++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      d[p] = lut[(m[row + (x >> 1)] + (s >>> 8) * 6.7e-7) | 0]; // + per-pixel speckle
    }
  }
  ctx.putImageData(img, 0, 0);
  floorMarks(ctx, S, 'rgba(92,90,86,0.24)', 'rgba(92,90,86,0.32)');
}

function paintFloorBump(ctx, S, rng) {
  const L = S >> 1;
  const lo = fbm(L, L, rng, 24, 24, 2, 0.5);
  const img = ctx.createImageData(S, S);
  const d = new Uint32Array(img.data.buffer);
  let s = (rng() * 4294967296) >>> 0;
  for (let y = 0, p = 0; y < S; y++) {
    const row = (y >> 1) * L;
    for (let x = 0; x < S; x++, p++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      d[p] = GREY_LUT32[(122.5 + lo[row + (x >> 1)] * 7 + (s >>> 8) * 1.8e-7) | 0];
    }
  }
  ctx.putImageData(img, 0, 0);
  floorMarks(ctx, S, 'rgba(64,64,64,0.5)', null); // grid lines read as shallow grooves
}

// ---------------------------------------------------------------------------
// Glazed porcelain vase wrap (X = angle, tiles; Y = height)
// ---------------------------------------------------------------------------

function paintVase(ctx, W, H, rng) {
  // 1) Paint the cobalt decoration on its own layer. `ink(d)` maps pigment
  //    density (0..1) to colour: thin washes are pale blue, full strength is deep cobalt.
  const deco = makeCanvas(W, H);
  const g = deco.getContext('2d');
  const cob = rampLUT([[0, '#f3eee0'], [0.12, '#c3cfe6'], [0.32, '#7f9bd4'], [0.55, '#3b5eb6'], [0.78, '#1c3c98'], [1, '#0f2168']]);
  const ink = (dens) => {
    const k = Math.round(clamp01(dens) * 255) * 3;
    return `rgba(${cob[k]},${cob[k + 1]},${cob[k + 2]},${Math.min(1, dens * 3)})`;
  };
  const band = (y, h, a = 1) => fillR(g, ink(a), 0, y, W, h);
  const erase = (on) => {
    g.globalCompositeOperation = on ? 'destination-out' : 'source-over';
  };

  // -- rim, key-fret collar, pinstripes
  band(0, 14);
  band(18, 2.2, 0.9);
  band(25, 1.4, 0.8);
  g.strokeStyle = ink(0.96);
  g.lineWidth = 2.5;
  g.lineJoin = 'miter';
  g.lineCap = 'butt';
  for (let x = 0; x < W; x += 32) {
    g.beginPath();
    g.moveTo(x + 33, 58);
    g.lineTo(x + 1, 58);
    g.lineTo(x + 1, 33);
    g.lineTo(x + 25, 33);
    g.lineTo(x + 25, 51);
    g.lineTo(x + 9, 51);
    g.lineTo(x + 9, 41);
    g.lineTo(x + 17, 41);
    g.stroke();
  }
  band(64, 1.4, 0.8);
  band(68, 2.2, 0.9);

  // -- shoulder: hanging lappets
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const lappetPath = (cx, top, hw, hh) => {
    g.beginPath();
    g.moveTo(cx - hw, top);
    g.bezierCurveTo(cx - hw, top + hh * 0.66, cx - hw * 0.3, top + hh * 0.7, cx, top + hh);
    g.bezierCurveTo(cx + hw * 0.3, top + hh * 0.7, cx + hw, top + hh * 0.66, cx + hw, top);
  };
  for (let x = 0; x < W; x += 64) {
    const cx = x + 32;
    lappetPath(cx, 71, 28, 46);
    g.fillStyle = ink(0.3);
    g.fill();
    g.strokeStyle = ink(1);
    g.lineWidth = 2.3;
    g.stroke();
    lappetPath(cx, 71, 17, 30);
    g.fillStyle = ink(0.34);
    g.fill();
    g.lineWidth = 1.4;
    g.stroke();
    disc(g, ink(1), cx, 82, 2.8);
    disc(g, ink(0.95), x, 104, 2.6);
    disc(g, ink(0.9), x - 6, 96, 1.6);
    disc(g, ink(0.9), x + 6, 96, 1.6);
  }
  disc(g, ink(0.95), W, 104, 2.6);
  disc(g, ink(0.9), W - 6, 96, 1.6);

  // -- belly: scrolling vine with blossoms (period 512, glide-reflected half waves)
  const yc = 254;
  const A = 78;
  const leaf = (x, y, ang, L, w, flip = 1) => {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.scale(1, flip);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(L * 0.18, -w, L * 0.7, -w * 0.95, L, -w * 0.18);
    g.bezierCurveTo(L * 0.7, w * 0.22, L * 0.3, w * 0.42, 0, 0);
    g.fillStyle = ink(0.78);
    g.fill();
    g.strokeStyle = ink(1);
    g.lineWidth = 1.3;
    g.stroke();
    erase(true);
    g.beginPath();
    g.moveTo(L * 0.14, -w * 0.1);
    g.quadraticCurveTo(L * 0.5, -w * 0.52, L * 0.84, -w * 0.24);
    g.lineWidth = 1.25;
    g.strokeStyle = ink(0.9);
    g.stroke();
    erase(false);
    g.restore();
  };
  const petals = (n, r0, r1, w, rot, wash, tip) => {
    for (let i = 0; i < n; i++) {
      g.save();
      g.rotate(rot + (i * TAU) / n);
      const m = r1 - r0;
      g.beginPath();
      g.moveTo(r0, 0);
      g.bezierCurveTo(r0 + m * 0.3, -w, r1 - m * tip, -w * 0.8, r1, 0);
      g.bezierCurveTo(r1 - m * tip, w * 0.8, r0 + m * 0.3, w, r0, 0);
      erase(true);
      g.fillStyle = ink(1);
      g.fill();
      erase(false);
      g.fillStyle = ink(wash);
      g.fill();
      g.strokeStyle = ink(1);
      g.lineWidth = 1.8;
      g.stroke();
      g.beginPath();
      g.moveTo(r0 + 3, 0);
      g.lineTo(r0 + m * 0.62, 0);
      g.lineWidth = 1.1;
      g.strokeStyle = ink(0.7);
      g.stroke();
      g.restore();
    }
  };
  const flower = (x, y, kind) => {
    g.save();
    g.translate(x, y);
    if (kind === 0) {
      petals(8, 13, 50, 16.5, -Math.PI / 2, 0.3, 0.12);
      petals(6, 8, 29, 11, -Math.PI / 2 + Math.PI / 6, 0.5, 0.15);
    } else {
      petals(13, 14, 48, 8.6, -Math.PI / 2, 0.34, 0.32);
      petals(8, 8, 27, 7.4, -Math.PI / 2 + 0.3, 0.52, 0.3);
    }
    erase(true);
    disc(g, ink(1), 0, 0, 9.5);
    erase(false);
    ring(g, ink(1), 1.9, 0, 0, 8.4);
    disc(g, ink(1), 0, 0, 3.6);
    g.restore();
  };
  const bez = (p, t) => {
    const u = 1 - t;
    const x = u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6];
    const y = u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7];
    const dx = 3 * u * u * (p[2] - p[0]) + 6 * u * t * (p[4] - p[2]) + 3 * t * t * (p[6] - p[4]);
    const dy = 3 * u * u * (p[3] - p[1]) + 6 * u * t * (p[5] - p[3]) + 3 * t * t * (p[7] - p[5]);
    return [x, y, Math.atan2(dy, dx)];
  };
  const stemY = (x) => -A * Math.sin((Math.PI * x) / 256);
  const stemAng = (x) => Math.atan2(((-A * Math.PI) / 256) * Math.cos((Math.PI * x) / 256), 1);
  const unit = (kind) => {
    // counter-scroll curling beneath the blossom
    const c1 = [5, -4, 8, 66, 82, 100, 148, 88];
    const c2 = [148, 88, 196, 78, 220, 40, 202, 8];
    g.strokeStyle = ink(1);
    g.lineWidth = 2.8;
    g.beginPath();
    g.moveTo(c1[0], c1[1]);
    g.bezierCurveTo(c1[2], c1[3], c1[4], c1[5], c1[6], c1[7]);
    g.bezierCurveTo(c2[2], c2[3], c2[4], c2[5], c2[6], c2[7]);
    g.stroke();
    // curled tip + bud
    g.beginPath();
    g.arc(190, 10, 12, 0, Math.PI * 1.25, true);
    g.lineWidth = 2.2;
    g.stroke();
    disc(g, ink(1), 182, 1, 3.6);
    // dot clusters filling the quiet corners
    for (const [dx, dy] of [[240, 74], [16, -80]]) {
      disc(g, ink(1), dx, dy - 5, 2.7);
      disc(g, ink(1), dx - 5, dy + 3.5, 2.7);
      disc(g, ink(1), dx + 5, dy + 3.5, 2.7);
    }
    for (const [t, side, L] of [[0.3, 1, 30], [0.58, 1, 34], [0.86, 1, 30], [0.5, -1, 18]]) {
      const [x, y, a] = bez(c1, t);
      leaf(x, y, a + side * 0.95, L, L * 0.34, side);
    }
    for (const [t, side, L] of [[0.3, 1, 28], [0.62, 1, 22], [0.25, -1, 16]]) {
      const [x, y, a] = bez(c2, t);
      leaf(x, y, a + side * 0.95, L, L * 0.34, side);
    }
    // main stem
    g.strokeStyle = ink(1);
    g.lineWidth = 4;
    g.beginPath();
    for (let x = 0; x <= 256; x += 4) {
      if (x) g.lineTo(x, stemY(x));
      else g.moveTo(x, stemY(x));
    }
    g.stroke();
    // leaves on the outside of the wave
    for (const [x, L] of [[26, 30], [58, 36], [198, 36], [230, 30]]) leaf(x, stemY(x), stemAng(x) - 0.95, L, L * 0.36, 1);
    for (const [x, L] of [[44, 17], [214, 17]]) leaf(x, stemY(x), stemAng(x) + 1.0, L, L * 0.36, -1);
    // palmette on the crest
    leaf(128, -A - 1, -Math.PI / 2 - 0.75, 26, 9, 1);
    leaf(128, -A - 1, -Math.PI / 2 + 0.75, 26, 9, -1);
    leaf(128, -A - 1, -Math.PI / 2 - 0.12, 34, 11, 1);
    // stalk + blossom
    line(g, ink(1), 3, 128, -A, 128, -44);
    flower(128, 0, kind);
  };
  for (let k = -1; k <= 4; k++) {
    g.save();
    g.translate(k * 256, yc);
    if (k & 1) g.scale(1, -1);
    unit(k & 1);
    g.restore();
  }

  // -- lower pinstripes + lotus-petal panels + foot
  band(388, 2.2, 0.9);
  band(393, 1.4, 0.8);
  const p0 = 404;
  const p1 = 486;
  for (let x = 0; x < W; x += 64) {
    g.beginPath();
    g.moveTo(x + 3, p1);
    g.lineTo(x + 3, p0 + 36);
    g.bezierCurveTo(x + 3, p0 + 17, x + 23, p0 + 13, x + 32, p0);
    g.bezierCurveTo(x + 41, p0 + 13, x + 61, p0 + 17, x + 61, p0 + 36);
    g.lineTo(x + 61, p1);
    g.strokeStyle = ink(1);
    g.lineWidth = 2.3;
    g.stroke();
    g.beginPath();
    g.moveTo(x + 10, p1);
    g.lineTo(x + 10, p0 + 40);
    g.bezierCurveTo(x + 10, p0 + 28, x + 25, p0 + 25, x + 32, p0 + 14);
    g.bezierCurveTo(x + 39, p0 + 25, x + 54, p0 + 28, x + 54, p0 + 40);
    g.lineTo(x + 54, p1);
    g.fillStyle = ink(0.3);
    g.fill();
    g.lineWidth = 1.4;
    g.stroke();
    // pendant inside each panel
    disc(g, ink(1), x + 32, p0 + 40, 4.2);
    g.beginPath();
    g.moveTo(x + 32, p0 + 48);
    g.bezierCurveTo(x + 39, p0 + 58, x + 36, p0 + 68, x + 32, p0 + 70);
    g.bezierCurveTo(x + 28, p0 + 68, x + 25, p0 + 58, x + 32, p0 + 48);
    g.fillStyle = ink(0.92);
    g.fill();
    disc(g, ink(0.9), x + 20, p0 + 52, 1.8);
    disc(g, ink(0.9), x + 44, p0 + 52, 1.8);
  }
  band(p1, 2.4, 0.95);
  band(493, 19);

  // 2) Hand-painted unevenness: pigment pools darker / thins out (only where there is paint).
  g.globalCompositeOperation = 'source-atop';
  g.drawImage(noiseLayer(W >> 2, H >> 2, rng, 22, 11, 3, '#7d9ade', '#081650', 0.24), 0, 0, W, H);
  g.globalCompositeOperation = 'source-over';

  // 3) Creamy glaze with faint mottling, then the decoration on top.
  fillR(ctx, '#f3eee1', 0, 0, W, H);
  ctx.drawImage(noiseLayer(W >> 2, H >> 2, rng, 6, 3, 3, '#cfc6ae', '#ffffff', 0.16, 0.5), 0, 0, W, H);
  ctx.drawImage(deco, 0, 0);
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

/** Generic launcher icon: gradient rounded square with a simple white glyph. */
function appIcon(ctx, x, y, s, c1, c2, glyph) {
  const g = ctx.createLinearGradient(x, y, x, y + s);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  fillRR(ctx, g, x, y, s, s, s * 0.26);
  const w = 'rgba(255,255,255,0.95)';
  const u = s / 24;
  const cx = x + s / 2;
  const cy = y + s / 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (glyph) {
    case 'folder':
      fillRR(ctx, w, x + 5 * u, y + 7 * u, 7 * u, 4 * u, 1.2 * u);
      fillRR(ctx, w, x + 5 * u, y + 9 * u, 14 * u, 9 * u, 1.6 * u);
      break;
    case 'doc':
      fillRR(ctx, w, x + 7 * u, y + 5 * u, 10 * u, 14 * u, 1.5 * u);
      for (let i = 0; i < 3; i++) fillR(ctx, c2, x + 9 * u, y + (8.5 + i * 3) * u, (i === 2 ? 4 : 6) * u, 1.2 * u);
      break;
    case 'chart':
      fillR(ctx, w, x + 6 * u, y + 13 * u, 3 * u, 6 * u);
      fillR(ctx, w, x + 10.5 * u, y + 9 * u, 3 * u, 10 * u);
      fillR(ctx, w, x + 15 * u, y + 5.5 * u, 3 * u, 13.5 * u);
      break;
    case 'mail':
      fillRR(ctx, w, x + 5 * u, y + 7 * u, 14 * u, 10 * u, 1.5 * u);
      ctx.beginPath();
      ctx.moveTo(x + 6 * u, y + 8.5 * u);
      ctx.lineTo(cx, y + 13 * u);
      ctx.lineTo(x + 18 * u, y + 8.5 * u);
      ctx.strokeStyle = c2;
      ctx.lineWidth = 1.3 * u;
      ctx.stroke();
      break;
    case 'globe':
      ring(ctx, w, 1.5 * u, cx, cy, 6.5 * u);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 2.8 * u, 6.5 * u, 0, 0, TAU);
      ctx.stroke();
      line(ctx, w, 1.5 * u, cx - 6.5 * u, cy, cx + 6.5 * u, cy);
      break;
    case 'music':
      disc(ctx, w, x + 9 * u, y + 16 * u, 2.4 * u);
      disc(ctx, w, x + 16 * u, y + 14.5 * u, 2.4 * u);
      ctx.beginPath();
      ctx.moveTo(x + 11 * u, y + 16 * u);
      ctx.lineTo(x + 11 * u, y + 7 * u);
      ctx.lineTo(x + 18 * u, y + 5.5 * u);
      ctx.lineTo(x + 18 * u, y + 14.5 * u);
      ctx.strokeStyle = w;
      ctx.lineWidth = 1.5 * u;
      ctx.stroke();
      break;
    case 'gear':
      ring(ctx, w, 2.6 * u, cx, cy, 4.4 * u);
      for (let i = 0; i < 8; i++) {
        const a = (i * TAU) / 8;
        disc(ctx, w, cx + Math.cos(a) * 7 * u, cy + Math.sin(a) * 7 * u, 1.3 * u);
      }
      break;
    case 'term':
      ctx.beginPath();
      ctx.moveTo(x + 6 * u, y + 8 * u);
      ctx.lineTo(x + 10.5 * u, cy);
      ctx.lineTo(x + 6 * u, y + 16 * u);
      ctx.strokeStyle = w;
      ctx.lineWidth = 1.8 * u;
      ctx.stroke();
      line(ctx, w, 1.8 * u, x + 12.5 * u, y + 16 * u, x + 18 * u, y + 16 * u);
      break;
    case 'photo':
      disc(ctx, w, x + 8.5 * u, y + 8.5 * u, 2.2 * u);
      poly(ctx, [[x + 4.5 * u, y + 19 * u], [x + 10 * u, y + 12 * u], [x + 13 * u, y + 15 * u], [x + 16 * u, y + 10.5 * u], [x + 19.5 * u, y + 19 * u]]);
      ctx.fillStyle = w;
      ctx.fill();
      break;
    case 'chat':
      fillRR(ctx, w, x + 5 * u, y + 6 * u, 14 * u, 9.5 * u, 3 * u);
      poly(ctx, [[x + 8 * u, y + 14 * u], [x + 8 * u, y + 19 * u], [x + 13 * u, y + 14.5 * u]]);
      ctx.fillStyle = w;
      ctx.fill();
      break;
    default: // 3×3 launcher dots
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) disc(ctx, w, x + (7 + i * 5) * u, y + (7 + j * 5) * u, 1.5 * u);
  }
}

/** Light-theme application window with title bar; `body(x, y, w, h)` paints the content (clipped). */
function drawWindow(ctx, x, y, w, h, title, iconColor, body) {
  ctx.save();
  ctx.shadowColor = 'rgba(8,6,30,0.5)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  fillRR(ctx, '#f4f5f7', x, y, w, h, 8);
  ctx.restore();
  ctx.save();
  rr(ctx, x, y, w, h, 8);
  ctx.clip();
  const TB = 28;
  fillR(ctx, vGrad(ctx, y, y + TB, [[0, '#fbfbfc'], [1, '#eceef1']]), x, y, w, TB);
  fillR(ctx, '#d5d8dd', x, y + TB - 1, w, 1);
  fillRR(ctx, iconColor, x + 10, y + 7, 14, 14, 3.5);
  txt(ctx, title, x + 31, y + 18.5, 11, '#2c3038', { weight: 600 });
  // window controls: minimise / maximise / close glyphs
  const bx = x + w - 20;
  ctx.lineCap = 'round';
  line(ctx, '#6a707b', 1.2, bx - 4, y + 10, bx + 4, y + 18);
  line(ctx, '#6a707b', 1.2, bx + 4, y + 10, bx - 4, y + 18);
  strokeRR(ctx, '#6a707b', 1.2, bx - 30, y + 10, 8, 8, 1.5);
  line(ctx, '#6a707b', 1.2, bx - 56, y + 14.5, bx - 48, y + 14.5);
  ctx.lineCap = 'butt';
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y + TB, w, h - TB);
  ctx.clip();
  body(x, y + TB, w, h - TB);
  ctx.restore();
  ctx.restore();
  strokeRR(ctx, 'rgba(20,22,40,0.35)', 1, x + 0.5, y + 0.5, w - 1, h - 1, 8);
}

/** Row of menu titles laid out by measured width. */
function menuBar(ctx, items, x, y, size, color, gap) {
  for (const m of items) {
    txt(ctx, m, x, y, size, color);
    x += ctx.measureText(m).width + gap;
  }
}

/** 12345.6 → '12,346' (avoids Intl, whose first use is slow). */
const thousands = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+$)/g, ',');

/** Word-wrap `text` into lines no wider than `maxW`; returns the y after the last line. */
function wrapText(ctx, text, x, y, maxW, lh, size, color, o) {
  ctx.font = `${(o && o.weight) || 400} ${size}px ${SANS}`;
  const words = text.split(' ');
  let ln = '';
  for (const w of words) {
    const t = ln ? ln + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && ln) {
      txt(ctx, ln, x, y, size, color, o);
      y += lh;
      ln = w;
    } else ln = t;
  }
  if (ln) {
    txt(ctx, ln, x, y, size, color, o);
    y += lh;
  }
  return y;
}

function paintDesktop(ctx, W, H, rng) {
  // ---- wallpaper: flowing gradient ribbons
  let g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#120f52');
  g.addColorStop(0.38, '#44219a');
  g.addColorStop(0.7, '#bd3a80');
  g.addColorStop(1, '#ff9455');
  fillR(ctx, g, 0, 0, W, H);
  glow(ctx, 170, 70, 430, '#2ac4ff', 0.6);
  glow(ctx, 760, 40, 360, '#ff5fb0', 0.42);
  glow(ctx, 520, 250, 300, '#7a5cff', 0.35);
  const ribbons = [
    [[-40, 330], [180, 210, 400, 470, 660, 300], [820, 195, 960, 250, 1070, 170], ['#ff5c93', '#ffb65e'], 0.62],
    [[-40, 410], [200, 300, 430, 560, 700, 400], [860, 300, 990, 370, 1070, 300], ['#8a3dff', '#ff4f9c'], 0.6],
    [[-40, 470], [230, 400, 470, 610, 740, 470], [880, 400, 1000, 450, 1070, 400], ['#3c1e9e', '#d0347f'], 0.62],
    [[-40, 530], [260, 470, 520, 640, 800, 520], [920, 470, 1010, 510, 1070, 480], ['#1a1160', '#5b2a9d'], 0.7],
  ];
  for (const [p0, c1, c2, cols, a] of ribbons) {
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.bezierCurveTo(...c1);
    ctx.bezierCurveTo(...c2);
    ctx.lineTo(W + 60, H + 60);
    ctx.lineTo(-40, H + 60);
    ctx.closePath();
    g = ctx.createLinearGradient(0, p0[1] - 120, W, p0[1] + 160);
    g.addColorStop(0, rgba(cols[0], a));
    g.addColorStop(1, rgba(cols[1], a));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.bezierCurveTo(...c1);
    ctx.bezierCurveTo(...c2);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  glow(ctx, 960, 540, 380, '#ffc861', 0.4);

  // ---- window: spreadsheet with chart
  drawWindow(ctx, 506, 44, 486, 316, 'Budget 2026 — Sheets', '#1fa971', (x, y, w, h) => {
    fillR(ctx, '#ffffff', x, y, w, h);
    fillR(ctx, '#f3f4f6', x, y, w, 24);
    menuBar(ctx, ['File', 'Edit', 'Insert', 'Format', 'Data', 'View'], x + 12, y + 15.5, 9.5, '#4a505b', 16);
    fillR(ctx, '#e1e4e8', x, y + 24, w, 1);
    // formula bar
    txt(ctx, 'fx', x + 12, y + 39.5, 10, '#8a909b', { weight: 600 });
    fillRR(ctx, '#f6f7f9', x + 34, y + 29, w - 46, 16, 3);
    strokeRR(ctx, '#dfe2e7', 1, x + 34.5, y + 29.5, w - 47, 15, 3);
    txt(ctx, '=SUM(C2:C13) - SUM(D2:D13)', x + 40, y + 40.5, 9.5, '#2c3038', { font: MONO });
    // grid
    const gy = y + 50;
    const RH = 16;
    const cols = [26, 58, 46, 62, 62, 56, 58, 58, 60];
    fillR(ctx, '#f3f4f6', x, gy, w, RH);
    fillR(ctx, '#f3f4f6', x, gy, cols[0], h);
    ctx.fillStyle = '#e4e7eb';
    let cxp = x;
    cols.forEach((cw, i) => {
      cxp += cw;
      ctx.fillRect(cxp, gy, 1, h);
      if (i > 0) txt(ctx, String.fromCharCode(64 + i), cxp - cw / 2, gy + 11.5, 9, '#7b818c', { align: 'center' });
      ctx.fillStyle = '#e4e7eb';
    });
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const head = ['Month', 'Units', 'Revenue', 'Cost'];
    const rev = [];
    const cost = [];
    for (let r = 0; r < 14; r++) {
      const ry = gy + RH * (r + 1);
      fillR(ctx, '#e4e7eb', x, ry, w, 1);
      txt(ctx, String(r + 1), x + cols[0] / 2, ry + 11.5, 9, '#7b818c', { align: 'center' });
      if (r === 0) {
        let hx = x + cols[0];
        head.forEach((t, i) => {
          txt(ctx, t, i === 0 ? hx + 6 : hx + cols[i + 1] - 6, ry + 11.5, 9.5, '#1f2329', { weight: 700, align: i === 0 ? 'left' : 'right' });
          hx += cols[i + 1];
        });
      } else if (r <= 12) {
        const units = Math.round(820 + r * 46 + rrange(rng, -90, 140));
        const rv = units * rrange(rng, 23, 27);
        const cs = rv * rrange(rng, 0.52, 0.7);
        rev.push(rv);
        cost.push(cs);
        let hx = x + cols[0];
        txt(ctx, months[r - 1], hx + 6, ry + 11.5, 9.5, '#2c3038');
        hx += cols[1];
        txt(ctx, thousands(units), hx + cols[2] - 6, ry + 11.5, 9.5, '#2c3038', { align: 'right' });
        hx += cols[2];
        txt(ctx, thousands(rv), hx + cols[3] - 6, ry + 11.5, 9.5, '#2c3038', { align: 'right' });
        hx += cols[3];
        txt(ctx, thousands(cs), hx + cols[4] - 6, ry + 11.5, 9.5, '#2c3038', { align: 'right' });
      }
    }
    // selected cell
    strokeRR(ctx, '#1f8f63', 1.6, x + cols[0] + cols[1] + cols[2] + 0.5, gy + RH * 5 + 0.5, cols[3], RH, 1);
    // chart card
    const kx = x + 262;
    const ky = gy + 26;
    const kw = 210;
    const kh = 170;
    ctx.save();
    ctx.shadowColor = 'rgba(20,30,50,0.22)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;
    fillRR(ctx, '#ffffff', kx, ky, kw, kh, 5);
    ctx.restore();
    strokeRR(ctx, '#d9dce2', 1, kx + 0.5, ky + 0.5, kw - 1, kh - 1, 5);
    txt(ctx, 'Revenue vs. cost', kx + 12, ky + 18, 10.5, '#1f2329', { weight: 600 });
    disc(ctx, '#3d7bf2', kx + 122, ky + 14.5, 3);
    txt(ctx, 'Revenue', kx + 128, ky + 17.5, 8, '#5b616c');
    disc(ctx, '#f29a3d', kx + 168, ky + 14.5, 3);
    txt(ctx, 'Cost', kx + 174, ky + 17.5, 8, '#5b616c');
    const px = kx + 30;
    const py = ky + 30;
    const pw = kw - 44;
    const ph = kh - 54;
    const max = Math.max(...rev) * 1.1;
    for (let i = 0; i <= 4; i++) {
      const yy = py + ph - (ph * i) / 4;
      fillR(ctx, i === 0 ? '#aab0ba' : '#eceef1', px, Math.round(yy), pw, 1);
      txt(ctx, `${Math.round((max * i) / 4000)}k`, px - 5, yy + 3, 7.5, '#7b818c', { align: 'right' });
    }
    const bw = pw / 12;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const bh = (rev[i] / max) * ph;
      fillRR(ctx, '#3d7bf2', px + i * bw + 2.5, py + ph - bh, bw - 5, bh, 1.5);
      txt(ctx, months[i][0], px + i * bw + bw / 2, py + ph + 11, 7.5, '#7b818c', { align: 'center' });
    }
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const yy = py + ph - (cost[i] / max) * ph;
      if (i) ctx.lineTo(px + i * bw + bw / 2, yy);
      else ctx.moveTo(px + i * bw + bw / 2, yy);
    }
    ctx.strokeStyle = '#f29a3d';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const yy = py + ph - (cost[i] / max) * ph;
      disc(ctx, '#ffffff', px + i * bw + bw / 2, yy, 2.6);
      disc(ctx, '#f29a3d', px + i * bw + bw / 2, yy, 1.7);
    }
  });

  // ---- window: text document
  drawWindow(ctx, 36, 26, 442, 436, 'Studio relocation plan — Writer', '#3d7bf2', (x, y, w, h) => {
    fillR(ctx, '#f3f4f6', x, y, w, 52);
    menuBar(ctx, ['File', 'Edit', 'View', 'Insert', 'Format', 'Tools', 'Help'], x + 12, y + 15, 9.5, '#4a505b', 16);
    // toolbar
    const ty = y + 26;
    strokeRR(ctx, '#d2d6dc', 1, x + 10.5, ty + 0.5, 84, 18, 3);
    txt(ctx, 'Body text', x + 16, ty + 13, 9.5, '#2c3038');
    strokeRR(ctx, '#d2d6dc', 1, x + 100.5, ty + 0.5, 34, 18, 3);
    txt(ctx, '11', x + 107, ty + 13, 9.5, '#2c3038');
    txt(ctx, 'B', x + 150, ty + 14, 11, '#2c3038', { weight: 700 });
    line(ctx, '#2c3038', 1.5, x + 171.5, ty + 5.5, x + 168.5, ty + 14); // italic
    line(ctx, '#2c3038', 1.2, x + 169.5, ty + 5.5, x + 173.5, ty + 5.5);
    line(ctx, '#2c3038', 1.2, x + 166.5, ty + 14, x + 170.5, ty + 14);
    txt(ctx, 'U', x + 182, ty + 14, 11, '#2c3038', { weight: 600 });
    fillR(ctx, '#2c3038', x + 182, ty + 16, 8, 1);
    for (let k = 0; k < 4; k++) {
      const ax = x + 208 + k * 22;
      if (k === 0) fillRR(ctx, '#dbe6fb', ax - 4, ty, 20, 19, 3);
      for (let l = 0; l < 4; l++) {
        const lw = [12, 8, 12, 6][l];
        const off = k === 1 ? (12 - lw) / 2 : k === 2 ? 12 - lw : 0;
        fillR(ctx, '#4a505b', ax + (k === 3 ? 0 : off), ty + 4 + l * 3.4, k === 3 ? 12 : lw, 1.3);
      }
    }
    fillRR(ctx, '#f2c94c', x + 304, ty + 3, 13, 13, 2);
    fillRR(ctx, '#3d7bf2', x + 323, ty + 3, 13, 13, 2);
    fillR(ctx, '#d5d8dd', x, y + 51, w, 1);
    // canvas + page
    fillR(ctx, '#e3e6ea', x, y + 52, w, h - 52);
    const px = x + 46;
    const py = y + 66;
    const pw = w - 104;
    ctx.save();
    ctx.shadowColor = 'rgba(30,40,60,0.25)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    fillR(ctx, '#ffffff', px, py, pw, h);
    ctx.restore();
    const mx = px + 30;
    const tw = pw - 60;
    txt(ctx, 'Studio relocation plan', mx, py + 44, 17, '#15181d', { weight: 700 });
    txt(ctx, 'Draft 3  ·  Prepared for the facilities team', mx, py + 59, 8.5, '#7b818c');
    fillR(ctx, '#3d7bf2', mx, py + 67, 34, 2.5);
    let yy = py + 88;
    yy = wrapText(ctx, 'The fourth-floor space gives us roughly forty percent more room for test rigs, tooling and storage. This document sets out the schedule for the move, the equipment that needs special handling, and the open questions we still have to settle before the lease begins in March.', mx, yy, tw, 12, 8.6, '#33373f');
    yy += 9;
    txt(ctx, '1.  Timeline', mx, yy + 2, 11, '#15181d', { weight: 700 });
    yy += 18;
    yy = wrapText(ctx, 'Packing starts on the second Monday of February. Workbenches and shelving go first, followed by the measurement equipment once the new benches have been levelled and checked.', mx, yy, tw, 12, 8.6, '#33373f');
    yy += 6;
    for (const b of ['Week 1 — inventory, labelling and crate delivery', 'Week 2 — benches, shelving and bulk storage', 'Week 3 — instruments, calibration and sign-off']) {
      disc(ctx, '#3d7bf2', mx + 6, yy - 3, 1.7);
      txt(ctx, b, mx + 14, yy, 8.6, '#33373f');
      yy += 12.5;
    }
    yy += 6;
    // figure
    const fh = 62;
    fillRR(ctx, '#f3f5f9', mx, yy, tw, fh, 4);
    strokeRR(ctx, '#dfe3ea', 1, mx + 0.5, yy + 0.5, tw - 1, fh - 1, 4);
    const rooms = [[0.03, 0.14, 0.3, 0.72, '#cfdcf8'], [0.35, 0.14, 0.2, 0.34, '#d9f0e3'], [0.35, 0.52, 0.2, 0.34, '#fbe6cc'], [0.57, 0.14, 0.4, 0.72, '#e5dcf7']];
    for (const [rx, ry, rw, rh, c] of rooms) {
      fillRR(ctx, c, mx + rx * tw, yy + ry * fh, rw * tw, rh * fh, 2);
      strokeRR(ctx, 'rgba(60,70,100,0.35)', 1, mx + rx * tw + 0.5, yy + ry * fh + 0.5, rw * tw - 1, rh * fh - 1, 2);
    }
    txt(ctx, 'Workshop', mx + 0.18 * tw, yy + fh * 0.54, 7.5, '#4a5270', { align: 'center' });
    txt(ctx, 'Test bay', mx + 0.77 * tw, yy + fh * 0.54, 7.5, '#4a5270', { align: 'center' });
    yy += fh + 12;
    txt(ctx, 'Figure 1.  Proposed floor layout', mx, yy, 7.8, '#7b818c');
    yy += 18;
    txt(ctx, '2.  Special handling', mx, yy, 11, '#15181d', { weight: 700 });
    yy += 16;
    wrapText(ctx, 'The drop tower and both climate chambers must travel upright and need a clear route to the goods lift. Please confirm door widths with the building manager before the crates are ordered.', mx, yy, tw, 12, 8.6, '#33373f');
    // scrollbar + status bar
    fillRR(ctx, '#c3c8d0', x + w - 9, y + 70, 5, 96, 2.5);
    fillR(ctx, '#f3f4f6', x, y + h - 18, w, 18);
    fillR(ctx, '#d5d8dd', x, y + h - 18, w, 1);
    txt(ctx, 'Page 1 of 4      1,284 words      English (UK)', x + 12, y + h - 6, 8.5, '#5b616c');
    txt(ctx, '100%', x + w - 14, y + h - 6, 8.5, '#5b616c', { align: 'right' });
    fillRR(ctx, '#c9cdd4', x + w - 110, y + h - 10, 64, 2, 1);
    disc(ctx, '#6a707b', x + w - 78, y + h - 9, 3.2);
  });

  // ---- window: file manager
  drawWindow(ctx, 392, 300, 424, 222, 'Projects', '#f2a33d', (x, y, w, h) => {
    fillR(ctx, '#ffffff', x, y, w, h);
    fillR(ctx, '#f3f4f6', x, y, w, 30);
    fillR(ctx, '#dfe2e7', x, y + 30, w, 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [ax, dir, col] of [[x + 16, -1, '#4a505b'], [x + 36, 1, '#b3b8c1']]) {
      ctx.beginPath();
      ctx.moveTo(ax - dir * 3, y + 10);
      ctx.lineTo(ax + dir * 2, y + 15);
      ctx.lineTo(ax - dir * 3, y + 20);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    fillRR(ctx, '#e7e9ed', x + 54, y + 6, 210, 18, 9);
    txt(ctx, 'Home   ›   Documents   ›   Projects', x + 66, y + 18.5, 9.5, '#3b4049');
    fillRR(ctx, '#ffffff', x + w - 132, y + 6, 122, 18, 9);
    strokeRR(ctx, '#d2d6dc', 1, x + w - 131.5, y + 6.5, 121, 17, 8.5);
    ring(ctx, '#8a909b', 1.3, x + w - 120, y + 14.5, 3.5);
    line(ctx, '#8a909b', 1.3, x + w - 117.5, y + 17, x + w - 115, y + 19.5);
    txt(ctx, 'Search', x + w - 108, y + 18.5, 9.5, '#9aa0aa');
    // sidebar
    const sw = 108;
    fillR(ctx, '#f7f8fa', x, y + 31, sw, h);
    fillR(ctx, '#e4e7eb', x + sw, y + 31, 1, h);
    txt(ctx, 'FAVOURITES', x + 12, y + 47, 7.5, '#8a909b', { weight: 700 });
    ['Home', 'Desktop', 'Documents', 'Downloads', 'Pictures', 'Music'].forEach((n, i) => {
      const ry = y + 54 + i * 18;
      if (i === 2) fillRR(ctx, '#dbe6fb', x + 6, ry, sw - 12, 16, 4);
      fillRR(ctx, ['#6b8df2', '#8f7cf0', '#3d7bf2', '#31b58a', '#f2783d', '#e85a9b'][i], x + 13, ry + 4, 9, 8, 2);
      txt(ctx, n, x + 28, ry + 11.5, 9.5, i === 2 ? '#1b3f91' : '#3b4049', { weight: i === 2 ? 600 : 400 });
    });
    txt(ctx, 'DEVICES', x + 12, y + 177, 7.5, '#8a909b', { weight: 700 });
    // list
    const lx = x + sw + 1;
    const lw = w - sw - 1;
    const hy = y + 31;
    fillR(ctx, '#fafbfc', lx, hy, lw, 18);
    fillR(ctx, '#e4e7eb', lx, hy + 18, lw, 1);
    const c = [lx + 12, lx + 168, lx + 250];
    txt(ctx, 'Name', c[0], hy + 12.5, 8.5, '#6a707b', { weight: 600 });
    txt(ctx, 'Modified', c[1], hy + 12.5, 8.5, '#6a707b', { weight: 600 });
    txt(ctx, 'Size', c[2], hy + 12.5, 8.5, '#6a707b', { weight: 600 });
    const files = [
      ['dir', 'Drawings', '6 Nov 2026', '—'],
      ['dir', 'Invoices', '2 Nov 2026', '—'],
      ['dir', 'Archive 2025', '14 Jan 2026', '—'],
      ['doc', 'relocation-plan.odt', 'Today, 10:31', '84 KB'],
      ['sheet', 'budget-2026.ods', 'Today, 09:58', '212 KB'],
      ['img', 'floor-layout.png', 'Yesterday', '1.4 MB'],
      ['doc', 'meeting-notes.txt', '3 Nov 2026', '6 KB'],
      ['pdf', 'lease-agreement.pdf', '28 Oct 2026', '2.1 MB'],
    ];
    files.forEach(([kind, name, mod, size], i) => {
      const ry = hy + 20 + i * 18;
      const sel = i === 3;
      if (sel) fillRR(ctx, '#3d7bf2', lx + 5, ry, lw - 10, 17, 4);
      else if (i & 1) fillR(ctx, '#f8f9fb', lx, ry, lw, 17);
      const ix = c[0];
      const iy = ry + 3;
      if (kind === 'dir') {
        fillRR(ctx, '#e9a53a', ix, iy, 6, 3, 1);
        fillRR(ctx, '#f6bf55', ix, iy + 1.5, 13, 9.5, 1.5);
      } else {
        fillRR(ctx, sel ? '#ffffff' : '#f1f3f6', ix + 1.5, iy - 1, 10, 13, 1.5);
        strokeRR(ctx, '#b3b8c1', 1, ix + 2, iy - 0.5, 9, 12, 1.5);
        fillR(ctx, { doc: '#3d7bf2', sheet: '#1fa971', img: '#e85a9b', pdf: '#e5484d' }[kind], ix + 3.5, iy + 6.5, 6, 3);
      }
      txt(ctx, name, ix + 20, ry + 12, 9.5, sel ? '#ffffff' : '#2c3038', { weight: sel ? 600 : 400 });
      txt(ctx, mod, c[1], ry + 12, 9, sel ? '#e6eeff' : '#6a707b');
      txt(ctx, size, c[2], ry + 12, 9, sel ? '#e6eeff' : '#6a707b');
    });
  });

  // ---- taskbar
  const th = 42;
  const ty = H - th;
  fillR(ctx, 'rgba(18,16,40,0.72)', 0, ty, W, th);
  fillR(ctx, 'rgba(255,255,255,0.14)', 0, ty, W, 1);
  appIcon(ctx, 14, ty + 8, 26, 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0.08)', 'grid');
  fillRR(ctx, 'rgba(255,255,255,0.1)', 52, ty + 9, 150, 24, 12);
  ring(ctx, 'rgba(255,255,255,0.7)', 1.4, 68, ty + 20, 4);
  line(ctx, 'rgba(255,255,255,0.7)', 1.4, 71, ty + 23, 74, ty + 26);
  txt(ctx, 'Search', 82, ty + 25, 10.5, 'rgba(255,255,255,0.62)');
  const icons = [
    ['#5aa2ff', '#2f6fe0', 'folder'], ['#59c7ff', '#1d86d8', 'globe'], ['#5b8dff', '#3d5fe0', 'doc'], ['#3fd08f', '#149a63', 'chart'],
    ['#ffb04f', '#f2783d', 'mail'], ['#ff7ab0', '#e0457f', 'photo'], ['#a98bff', '#6f4fe0', 'music'], ['#4a4f5c', '#262a33', 'term'],
    ['#42d6c5', '#1a9c93', 'chat'], ['#9aa2b0', '#606878', 'gear'],
  ];
  const ix0 = W / 2 - (icons.length * 38) / 2;
  icons.forEach(([c1, c2, gl], i) => {
    const x = ix0 + i * 38;
    if (i === 2) fillRR(ctx, 'rgba(255,255,255,0.13)', x - 5, ty + 3, 36, 36, 8);
    appIcon(ctx, x, ty + 7, 26, c1, c2, gl);
    if (i === 0 || i === 2 || i === 3) fillRR(ctx, i === 2 ? '#8fb6ff' : 'rgba(255,255,255,0.6)', x + (i === 2 ? 6 : 10), ty + 36, i === 2 ? 14 : 6, 2.5, 1.2);
  });
  // tray: network, volume, battery, clock
  const tx = W - 150;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(tx, ty + 27, 3 + i * 3.6, -Math.PI * 0.75, -Math.PI * 0.25);
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  disc(ctx, 'rgba(255,255,255,0.88)', tx, ty + 27, 1.4);
  poly(ctx, [[tx + 20, ty + 18.5], [tx + 23, ty + 18.5], [tx + 27, ty + 15], [tx + 27, ty + 27], [tx + 23, ty + 23.5], [tx + 20, ty + 23.5]]);
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(tx + 27, ty + 21, 5, -0.8, 0.8);
  ctx.stroke();
  strokeRR(ctx, 'rgba(255,255,255,0.88)', 1.2, tx + 44, ty + 16, 19, 10, 2.5);
  fillRR(ctx, 'rgba(255,255,255,0.88)', tx + 46, ty + 18, 11, 6, 1);
  fillR(ctx, 'rgba(255,255,255,0.88)', tx + 64, ty + 19, 1.6, 4);
  txt(ctx, '10:42', W - 14, ty + 19, 11, '#ffffff', { align: 'right', weight: 600 });
  txt(ctx, 'Tue 10 Nov', W - 14, ty + 32, 9, 'rgba(255,255,255,0.72)', { align: 'right' });
}

// ---- code editor ----------------------------------------------------------

const CODE_LINES = [
  "import { World, RigidBody, Vec3 } from './physics/world.js';",
  "import { fractureMesh } from './fracture/voronoi.js';",
  "import { emit } from './events.js';",
  '',
  'const IMPACT_THRESHOLD = 42.5; // joules',
  'const MAX_FRAGMENTS = 64;',
  '',
  '/**',
  ' * Splits a body into fragments when the impact energy',
  " * exceeds the toughness of the body's material.",
  ' */',
  'export function resolveImpact(world, body, contact) {',
  '  const energy = 0.5 * body.mass * contact.speed ** 2;',
  '  if (energy < body.material.toughness * IMPACT_THRESHOLD) {',
  '    return null;',
  '  }',
  '',
  '  const seeds = scatterSeeds(contact.point, energy, MAX_FRAGMENTS);',
  '  const pieces = fractureMesh(body.geometry, seeds);',
  '',
  '  for (const piece of pieces) {',
  '    const child = new RigidBody(piece, body.material);',
  '    child.velocity.copy(body.velocity);',
  '    child.applyImpulse(contact.normal, energy / pieces.length);',
  '    world.add(child);',
  '  }',
  '',
  '  world.remove(body);',
  "  emit('fracture', { id: body.id, count: pieces.length });",
  '  return pieces;',
  '}',
  '',
  'function scatterSeeds(origin, energy, limit) {',
  '  const count = Math.min(limit, 4 + Math.floor(energy / 12));',
  '  const radius = 0.05 + energy * 0.002;',
  '  return Array.from({ length: count }, () => {',
  '    const dir = Vec3.random().scale(radius * Math.cbrt(Math.random()));',
  '    return origin.clone().add(dir);',
  '  });',
  '}',
];

const CODE_COLORS = {
  fg: '#c9ced8', kw: '#c594f5', str: '#a6d98c', num: '#f4a96e', com: '#667085',
  fn: '#6fb7ff', type: '#5fd6c6', prop: '#e7c07b', konst: '#ff9a8a', punc: '#8f97a6',
};
const CODE_KEYWORDS = new Set(['import', 'from', 'export', 'function', 'const', 'let', 'return', 'if', 'for', 'of', 'new', 'null', 'true', 'false']);

/** Tiny tokenizer good enough to syntax-colour the snippet above. */
function tokenizeCode(src) {
  const out = [];
  const t = src.trimStart();
  if (t.startsWith('/**') || t.startsWith('*')) return [[src, 'com']];
  const re = /(\/\/.*$)|('(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|(.)/g;
  let m;
  let prev = '';
  while ((m = re.exec(src))) {
    let kind = 'punc';
    if (m[1]) kind = 'com';
    else if (m[2]) kind = 'str';
    else if (m[3]) kind = 'num';
    else if (m[4]) {
      const w = m[4];
      const next = src[re.lastIndex];
      if (CODE_KEYWORDS.has(w)) kind = 'kw';
      else if (/^[A-Z][A-Z0-9_]+$/.test(w)) kind = 'konst';
      else if (next === '(') kind = 'fn';
      else if (/^[A-Z]/.test(w)) kind = 'type';
      else if (prev === '.') kind = 'prop';
      else kind = 'fg';
    } else if (m[5]) kind = 'ws';
    out.push([m[0], kind]);
    if (!m[5]) prev = m[0];
  }
  return out;
}

function paintCodeEditor(ctx, W, H) {
  const C = CODE_COLORS;
  const bg = '#1b1d23';
  const side = '#16181d';
  const accent = '#7c6cf2';
  fillR(ctx, bg, 0, 0, W, H);

  // title / menu bar
  const TB = 26;
  fillR(ctx, '#121318', 0, 0, W, TB);
  fillRR(ctx, accent, 12, 7, 12, 12, 3);
  menuBar(ctx, ['File', 'Edit', 'Selection', 'View', 'Go', 'Run', 'Terminal', 'Help'], 38, 17, 10.5, '#9aa1ad', 14);
  fillRR(ctx, '#1f2128', W / 2 - 150, 5, 300, 16, 5);
  txt(ctx, 'sandbox — resolve-impact.js', W / 2, 16.5, 10, '#8b93a1', { align: 'center' });
  ctx.lineCap = 'round';
  line(ctx, '#8b93a1', 1.2, W - 22, 9, W - 14, 17);
  line(ctx, '#8b93a1', 1.2, W - 14, 9, W - 22, 17);
  strokeRR(ctx, '#8b93a1', 1.2, W - 50, 9, 8, 8, 1.5);
  line(ctx, '#8b93a1', 1.2, W - 78, 13.5, W - 70, 13.5);

  // activity bar
  const AB = 44;
  const SB = 22;
  fillR(ctx, '#121318', 0, TB, AB, H - TB - SB);
  const ic = '#7a8291';
  fillR(ctx, accent, 0, TB + 8, 2.5, 30);
  // files
  strokeRR(ctx, '#e6e9ef', 1.5, 15, TB + 14, 13, 17, 2);
  strokeRR(ctx, '#e6e9ef', 1.5, 19, TB + 10, 13, 17, 2);
  // search
  ring(ctx, ic, 1.6, 21, TB + 66, 6.5);
  line(ctx, ic, 1.8, 26, TB + 71, 31, TB + 76);
  // source control
  ring(ctx, ic, 1.5, 16, TB + 106, 3);
  ring(ctx, ic, 1.5, 16, TB + 124, 3);
  ring(ctx, ic, 1.5, 29, TB + 111, 3);
  line(ctx, ic, 1.5, 16, TB + 109, 16, TB + 121);
  ctx.beginPath();
  ctx.moveTo(29, TB + 114);
  ctx.quadraticCurveTo(29, TB + 119, 17, TB + 120);
  ctx.strokeStyle = ic;
  ctx.stroke();
  // run
  poly(ctx, [[16, TB + 150], [30, TB + 159], [16, TB + 168]]);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.stroke();
  // extensions
  for (const [dx, dy] of [[0, 0], [9, 0], [0, 9], [11, 7]]) strokeRR(ctx, ic, 1.4, 14 + dx, TB + 192 + dy - (dx === 11 ? 9 : 0), 7.5, 7.5, 1.5);
  ring(ctx, ic, 1.5, 22, H - SB - 22, 7);
  disc(ctx, ic, 22, H - SB - 22, 2.4);

  // sidebar: explorer
  const SW = 196;
  const sx = AB;
  fillR(ctx, side, sx, TB, SW, H - TB - SB);
  fillR(ctx, '#0f1014', sx + SW, TB, 1, H - TB - SB);
  txt(ctx, 'EXPLORER', sx + 16, TB + 20, 9.5, '#8b93a1', { weight: 600 });
  txt(ctx, '···', sx + SW - 14, TB + 19, 11, '#8b93a1', { align: 'right', weight: 700 });
  const tree = [
    [0, 'dir-open', 'SANDBOX', true],
    [1, 'dir', 'node_modules'],
    [1, 'dir', 'public'],
    [1, 'dir-open', 'src'],
    [2, 'dir', 'audio'],
    [2, 'dir-open', 'fracture'],
    [3, 'js', 'voronoi.js'],
    [3, 'js', 'resolve-impact.js', false, true],
    [3, 'js', 'seeds.js'],
    [2, 'dir-open', 'physics'],
    [3, 'js', 'world.js'],
    [3, 'js', 'rigid-body.js'],
    [3, 'js', 'broadphase.js'],
    [2, 'dir', 'render'],
    [2, 'js', 'events.js'],
    [2, 'js', 'main.js'],
    [2, 'css', 'styles.css'],
    [1, 'dir', 'tests'],
    [1, 'cfg', '.gitignore'],
    [1, 'html', 'index.html'],
    [1, 'json', 'package.json'],
    [1, 'md', 'README.md'],
    [1, 'js', 'vite.config.js'],
  ];
  const fileCol = { js: '#e8c764', css: '#6fb7ff', json: '#a6d98c', md: '#8fb0ff', html: '#f4a96e', cfg: '#8b93a1' };
  const rowH = 19;
  tree.forEach(([depth, kind, name, bold, active], i) => {
    const y = TB + 32 + i * rowH;
    const x = sx + 12 + depth * 12;
    if (active) {
      fillR(ctx, '#272a36', sx, y, SW, rowH);
      fillR(ctx, accent, sx, y, 2, rowH);
    }
    if (kind.startsWith('dir')) {
      ctx.beginPath();
      if (kind === 'dir-open') {
        ctx.moveTo(x, y + 8);
        ctx.lineTo(x + 3.5, y + 11.5);
        ctx.lineTo(x + 7, y + 8);
      } else {
        ctx.moveTo(x + 2, y + 6);
        ctx.lineTo(x + 5.5, y + 9.5);
        ctx.lineTo(x + 2, y + 13);
      }
      ctx.strokeStyle = '#8b93a1';
      ctx.lineWidth = 1.3;
      ctx.stroke();
    } else {
      fillRR(ctx, fileCol[kind], x, y + 5.5, 8, 8, 2);
    }
    txt(ctx, name, x + 14, y + 13.5, 10.5, active ? '#ffffff' : bold ? '#d5dae3' : kind.startsWith('dir') ? '#b4bbc7' : '#9da5b2', { weight: bold ? 700 : 400 });
    if (name === 'resolve-impact.js') txt(ctx, 'M', sx + SW - 14, y + 13.5, 9.5, '#e8c764', { align: 'right', weight: 600 });
    if (name === 'seeds.js') txt(ctx, 'U', sx + SW - 14, y + 13.5, 9.5, '#7fd699', { align: 'right', weight: 600 });
  });

  // editor: tabs
  const ex = sx + SW + 1;
  const TH = 32;
  fillR(ctx, '#14161b', ex, TB, W - ex, TH);
  let tx = ex;
  [['voronoi.js', false], ['resolve-impact.js', true], ['world.js', false], ['styles.css', false]].forEach(([name, act]) => {
    ctx.font = `400 10.5px ${SANS}`;
    const tw = ctx.measureText(name).width + 52;
    if (act) {
      fillR(ctx, bg, tx, TB, tw, TH);
      fillR(ctx, accent, tx, TB, tw, 2);
    }
    fillRR(ctx, name.endsWith('css') ? fileCol.css : fileCol.js, tx + 12, TB + 12, 8, 8, 2);
    txt(ctx, name, tx + 26, TB + 20, 10.5, act ? '#e6e9ef' : '#7f8794');
    if (act) disc(ctx, '#c9ced8', tx + tw - 14, TB + 16, 3);
    else {
      line(ctx, '#5c6370', 1.1, tx + tw - 17, TB + 13, tx + tw - 11, TB + 19);
      line(ctx, '#5c6370', 1.1, tx + tw - 11, TB + 13, tx + tw - 17, TB + 19);
    }
    fillR(ctx, '#0f1014', tx + tw, TB, 1, TH);
    tx += tw + 1;
  });
  // breadcrumbs
  const by = TB + TH;
  txt(ctx, 'src  ›  fracture  ›  resolve-impact.js  ›  resolveImpact', ex + 18, by + 14.5, 10, '#7f8794');

  // code
  const PANEL = 124;
  const cy0 = by + 22;
  const cy1 = H - SB - PANEL;
  const LH = 14.6;
  const FS = 11.2;
  const gut = 52;
  ctx.font = `400 ${FS}px ${MONO}`;
  const cw = ctx.measureText('MMMMMMMMMM').width / 10;
  const codeX = ex + gut;
  const mmW = 74;
  const cur = 23;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ex, cy0 - 2, W - ex, cy1 - cy0 + 2);
  ctx.clip();
  CODE_LINES.forEach((src, n) => {
    const y = cy0 + n * LH;
    if (y + LH > cy1) return; // only whole lines above the panel
    if (n === cur) {
      fillR(ctx, '#232631', ex, y, W - ex - mmW, LH);
    }
    if (n === 17) fillRR(ctx, 'rgba(124,108,242,0.3)', codeX + cw * 16 - 1, y + 0.5, cw * 12 + 2, LH - 1, 2);
    // indent guides
    const indent = src.length - src.trimStart().length;
    for (let k = 0; k < Math.floor((indent || (CODE_LINES[n + 1] || '').length - (CODE_LINES[n + 1] || '').trimStart().length) / 2); k++) fillR(ctx, '#2a2d38', codeX + k * 2 * cw + 0.5, y, 1, LH);
    // git gutter
    if (n >= 12 && n <= 14) fillR(ctx, '#e8c764', ex + gut - 10, y, 2.5, LH);
    if (n >= 27 && n <= 28) fillR(ctx, '#7fd699', ex + gut - 10, y, 2.5, LH);
    txt(ctx, String(n + 1), ex + gut - 16, y + LH - 3.8, FS - 0.6, n === cur ? '#c9ced8' : '#4d5462', { align: 'right', font: MONO });
    let col = 0;
    for (const [s, kind] of tokenizeCode(src)) {
      if (kind !== 'ws') txt(ctx, s, codeX + col * cw, y + LH - 3.8, FS, C[kind], { font: MONO });
      col += s.length;
    }
    if (n === cur) fillR(ctx, '#e6e9ef', codeX + src.length * cw + 0.5, y + 1.5, 1.6, LH - 3);
  });
  // minimap
  const mx = W - mmW;
  fillR(ctx, '#191b21', mx, cy0 - 2, mmW, cy1 - cy0 + 2);
  fillR(ctx, 'rgba(140,150,175,0.1)', mx, cy0 - 2, mmW, 108);
  CODE_LINES.forEach((src, n) => {
    let col = 0;
    for (const [s, kind] of tokenizeCode(src)) {
      if (kind !== 'ws') fillR(ctx, rgba(C[kind], 0.62), mx + 6 + col * 0.92, cy0 + 2 + n * 3, Math.min(s.length * 0.92, mmW - 8 - col * 0.92), 1.7);
      col += s.length;
    }
  });
  ctx.restore();
  fillRR(ctx, 'rgba(140,150,175,0.22)', W - 5, cy0 + 4, 4, 150, 2);

  // bottom panel: terminal
  const py = cy1;
  fillR(ctx, '#0f1014', ex, py, W - ex, 1);
  fillR(ctx, '#17191e', ex, py + 1, W - ex, PANEL - 1);
  ['PROBLEMS', 'OUTPUT', 'TERMINAL', 'DEBUG CONSOLE'].forEach((t, i) => {
    const x = ex + 18 + [0, 76, 134, 208][i];
    txt(ctx, t, x, py + 18, 9.5, i === 2 ? '#e6e9ef' : '#7f8794', { weight: 600 });
    if (i === 2) fillR(ctx, accent, x, py + 24, ctx.measureText(t).width, 1.5);
    if (i === 0) {
      fillRR(ctx, '#2b2e3a', x + 60, py + 9, 13, 12, 6);
      txt(ctx, '2', x + 66.5, py + 18, 8.5, '#c9ced8', { align: 'center' });
    }
  });
  txt(ctx, 'zsh', W - 60, py + 18, 9.5, '#7f8794');
  txt(ctx, '+', W - 28, py + 19, 13, '#7f8794');
  const term = [
    [['~/sandbox ', '#6fb7ff'], ['(main) ', '#c594f5'], ['$ ', '#8f97a6'], ['npm run dev', '#e6e9ef']],
    [['  dev server ready in ', '#8f97a6'], ['312 ms', '#e6e9ef']],
    [['  ->  Local:    ', '#8f97a6'], ['http://localhost:5173/', '#5fd6c6']],
    [['  [physics]  ', '#e8c764'], ['240 Hz · 128 bodies · step 3.1 ms', '#c9ced8']],
    [['  [fracture] ', '#ff9a8a'], ['oak_table -> 23 fragments (1.8 ms)', '#c9ced8']],
    [['  hmr update ', '#a6d98c'], ['/src/fracture/resolve-impact.js', '#c9ced8']],
  ];
  term.forEach((segs, n) => {
    let x = ex + 18;
    for (const [s, col] of segs) {
      txt(ctx, s, x, py + 41 + n * 14.2, 10.6, col, { font: MONO });
      x += s.length * (cw * 10.6) / FS;
    }
  });
  fillR(ctx, '#c9ced8', ex + 18, py + 41 + term.length * 14.2 - 10, 6, 12);

  // status bar
  const sy = H - SB;
  fillR(ctx, accent, 0, sy, W, SB);
  fillR(ctx, 'rgba(0,0,0,0.18)', 0, sy, 92, SB);
  ring(ctx, '#ffffff', 1.3, 16, sy + 7, 2.2);
  ring(ctx, '#ffffff', 1.3, 16, sy + 16, 2.2);
  ring(ctx, '#ffffff', 1.3, 23.5, sy + 9, 2.2);
  line(ctx, '#ffffff', 1.3, 16, sy + 9.2, 16, sy + 13.8);
  txt(ctx, 'main*', 32, sy + 15, 10.5, '#ffffff', { weight: 600 });
  txt(ctx, '0 errors    2 warnings', 104, sy + 15, 10, 'rgba(255,255,255,0.92)');
  txt(ctx, 'Ln 24, Col 64      Spaces: 2      UTF-8      LF      JavaScript', W - 14, sy + 15, 10, 'rgba(255,255,255,0.92)', { align: 'right' });
}

// ---- TV demo footage -------------------------------------------------------

/**
 * Sunset cloud layer as a small RGBA canvas: horizontally streaked noise,
 * purple on top and lit orange/pink from beneath by the low sun at (sunX, sunY).
 */
function tvCloudLayer(w, h, rng, sunX, sunY, k1, k2) {
  const cl = fbm(w, h, rng, 4, 8, 4, 0.56);
  addNoise(cl, w, h, rng, 3, 26, 0.16); // long thin wisps
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0, i = 0, p = 0; y < h; y++) {
    const ty = y / h;
    const band = smoothstep(0.02, 0.3, ty) * (1 - smoothstep(0.72, 0.97, ty)) * 0.92 * 255;
    const warm = smoothstep(0.25, 0.9, ty);
    const dy2 = (y - sunY) * (y - sunY) * 1.6;
    const below = y + 3 < h ? 3 * w : 0;
    for (let x = 0; x < w; x++, i++, p += 4) {
      const cv = cl[i];
      if (cv <= 0.5) continue;
      const dx = x - sunX;
      const d2 = dx * dx + dy2;
      let g1 = 1 / (1 + d2 * k1); // tight sun glow
      g1 *= g1;
      let g2 = 1 / (1 + d2 * k2); // wide bloom
      g2 *= g2;
      let lit = (cv - cl[i + below]) * 11 + 0.42 + g2 * 0.6;
      lit = lit < 0 ? 0 : lit > 1 ? 1 : lit;
      let a = (cv - 0.5) * 5.56;
      a = a > 1 ? 1 : a * a * (3 - 2 * a);
      d[p] = 58 + 197 * lit + 120 * g1;
      d[p + 1] = 26 + (70 + 94 * warm) * lit + 100 * g1;
      d[p + 2] = 92 + (48 - 44 * warm) * lit + 50 * g1;
      d[p + 3] = a * band;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function paintTV(ctx, W, H, rng) {
  const HZ = 352; // horizon / waterline
  const sunX = 628;

  // mountain ridge profiles (far → near); the far one decides where the sun sits
  const ridge = (base, amp, cells, jag) => {
    const a = fbm1(W, rng, cells, 5, 0.52);
    const out = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const pk = 1 - Math.abs(2 * a[x] - 1); // ridged → sharper peaks
      out[x] = base - amp * (0.55 * pk + 0.45 * a[x]) + (jag ? (rng() - 0.5) * jag : 0);
    }
    return out;
  };
  const ridges = [ridge(322, 70, 5, 0), ridge(334, 66, 4, 0), ridge(346, 52, 6, 1.5), ridge(353, 26, 9, 4)];
  const sunY = ridges[0][sunX] - 4;
  const SQ = 0.79; // the low sun and its glow are slightly flattened

  // sky gradient + sun bloom (tight hot glow and a wide warm one, additive)
  fillR(ctx, vGrad(ctx, 0, HZ, [[0, '#120a3c'], [0.22, '#33187a'], [0.45, '#8b2788'], [0.62, '#e23f6c'], [0.78, '#ff7a3a'], [0.9, '#ffaa3a'], [1, '#ffd070']]), 0, 0, W, HZ);
  const K1 = 0.00042;
  const K2 = 0.000028;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, HZ);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(sunX, sunY);
  ctx.scale(1, SQ);
  ctx.fillStyle = bloomGradient(ctx, 760, K2, '150,62,8');
  ctx.fillRect(-W, -H, W * 2, H * 2);
  ctx.fillStyle = bloomGradient(ctx, 230, K1, '255,194,108');
  ctx.fillRect(-W, -H, W * 2, H * 2);
  ctx.restore();

  // clouds (soft, so painted at reduced resolution and scaled up)
  const CS = 0.375;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tvCloudLayer(W * CS, HZ * CS, rng, sunX * CS, sunY * CS, K1 / (CS * CS), K2 / (CS * CS)), 0, 0, W, HZ);

  // sun disc
  ctx.save();
  ctx.translate(sunX, sunY);
  ctx.scale(1, SQ);
  const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 24.5);
  sg.addColorStop(0, 'rgba(255,250,226,1)');
  sg.addColorStop(0.78, 'rgba(255,247,214,1)');
  sg.addColorStop(1, 'rgba(255,240,190,0)');
  disc(ctx, sg, 0, 0, 24.5);
  ctx.restore();

  // layered mountain ridges with atmospheric haze
  const cols = [['#b9507f', '#f4906a'], ['#7c3478', '#c25a7a'], ['#48205e', '#84396f'], ['#1d0d38', '#2c1650']];
  ridges.forEach((rd, n) => {
    let top = H;
    ctx.beginPath();
    ctx.moveTo(0, HZ + 2);
    for (let x = 0; x < W; x += 2) {
      ctx.lineTo(x, rd[x]);
      if (rd[x] < top) top = rd[x];
    }
    ctx.lineTo(W, rd[W - 1]);
    ctx.lineTo(W, HZ + 2);
    ctx.closePath();
    ctx.fillStyle = vGrad(ctx, top, HZ, [[0, cols[n][0]], [1, cols[n][1]]]);
    ctx.fill();
    if (n < 3) {
      // sun-warmed mist pooling in the valleys
      ctx.fillStyle = vGrad(ctx, HZ - 46, HZ, [[0, 'rgba(255,170,110,0)'], [1, `rgba(255,170,110,${0.34 - n * 0.08})`]]);
      ctx.fillRect(0, HZ - 46, W, 46);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, sunX, sunY + 10, 260 - n * 50, '#ff9a40', 0.26 - n * 0.07);
      ctx.restore();
    }
  });

  // lake: mirror everything above the waterline one scanline at a time; each
  // line is nudged sideways (smooth swell + finer chop, stronger towards the viewer)
  const LH = H - HZ;
  const top = makeCanvas(W, HZ);
  top.getContext('2d').drawImage(ctx.canvas, 0, 0);
  const chop = fbm1(LH, rng, 70, 2, 0.6);
  for (let y = 0; y < LH; y++) {
    const t = y / LH;
    const shift = Math.sin(y * 0.55 + 2.5 * Math.sin(y * 0.11)) * (0.6 + 5 * t) + (chop[y] - 0.5) * (2 + 40 * t);
    ctx.drawImage(top, 0, Math.max(0, HZ - 1.5 - y * 1.18), W, 1.5, shift - 24, HZ + y, W + 48, 1);
  }
  fillR(ctx, vGrad(ctx, HZ, H, [[0, 'rgba(46,10,52,0.08)'], [1, 'rgba(40,10,58,0.32)']]), 0, HZ, W, LH);
  ctx.drawImage(noiseLayer(256, LH, rng, 5, 64, 3, '#2a0838', '#ffd0b4', 0.2), 0, HZ, W, LH); // ripple shading
  // glitter path under the sun: short bright dashes, wider and longer towards the viewer
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let y = HZ + 2; y < H; y++) {
    const t = (y - HZ) / LH;
    const gw = 9 + 64 * t;
    for (let k = rint(rng, 1, 3); k > 0; k--) {
      const u = (rng() + rng() + rng() - 1.5) * 1.15; // ≈ gaussian
      const len = rrange(rng, 3, 12) * (0.5 + 1.8 * t);
      const a = (1 - Math.abs(u) / 1.75) * rrange(rng, 0.2, 0.75) * (1 - t * 0.35);
      fillR(ctx, `rgba(255,${rint(rng, 196, 232)},${rint(rng, 120, 170)},${a.toFixed(3)})`, sunX + u * gw - len / 2, y, len, t > 0.45 && rng() < 0.35 ? 2 : 1);
    }
  }
  ctx.restore();
  fillR(ctx, vGrad(ctx, HZ - 3, HZ + 7, [[0, 'rgba(255,190,140,0)'], [0.4, 'rgba(255,200,150,0.32)'], [1, 'rgba(255,190,140,0)']]), 0, HZ - 3, W, 10);

  // foreground: dark shoreline with conifers
  const dark = '#0a0518';
  const tree = (x, base, h) => {
    const w = h * 0.2;
    ctx.beginPath();
    ctx.moveTo(x, base - h);
    const tiers = 7;
    for (let i = 1; i <= tiers; i++) {
      const yy = base - h + (h * i) / tiers;
      ctx.lineTo(x + (w * i) / tiers + 2, yy);
      ctx.lineTo(x + (w * i) / tiers * 0.45, yy - 1);
    }
    ctx.lineTo(x, base + 4);
    for (let i = tiers; i >= 1; i--) {
      const yy = base - h + (h * i) / tiers;
      ctx.lineTo(x - (w * i) / tiers * 0.45, yy - 1);
      ctx.lineTo(x - (w * i) / tiers - 2, yy);
    }
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = dark;
  const bank = (pts) => {
    poly(ctx, pts);
    ctx.closePath();
    ctx.fill();
  };
  bank([[0, 452], [60, 462], [150, 492], [240, 528], [300, 556], [330, H], [0, H]]);
  bank([[W, 486], [960, 500], [890, 528], [840, 556], [815, H], [W, H]]);
  for (const [x, b, h] of [[14, 458, 150], [46, 464, 196], [78, 470, 128], [104, 478, 170], [138, 490, 104], [168, 500, 132], [204, 514, 84], [236, 528, 64], [268, 542, 44]]) tree(x, b, h * rrange(rng, 0.92, 1.08));
  for (const [x, b, h] of [[1010, 490, 168], [978, 496, 120], [946, 506, 146], [908, 522, 92], [872, 538, 62]]) tree(x, b, h * rrange(rng, 0.92, 1.08));

  // corner tag
  ctx.save();
  ctx.globalAlpha = 0.82;
  strokeRR(ctx, '#ffffff', 1.6, W - 86.5, 20.5, 36, 20, 4);
  txt(ctx, '4K', W - 68.5, 35.5, 13, '#ffffff', { weight: 700, align: 'center' });
  txt(ctx, 'HDR', W - 44, 35, 11, '#ffffff', { weight: 600 });
  ctx.globalAlpha = 0.6;
  txt(ctx, 'ULTRA HD DEMO', W - 20, 52, 7.5, '#ffffff', { weight: 600, align: 'right' });
  ctx.restore();
}

// ---- broken LCD -----------------------------------------------------------

/** Add a soft gaussian blob to `field` (only touches its bounding box). */
function addBlob(field, W, H, bx, by, br) {
  const ext = br * 2.6;
  const inv = 1 / (br * br);
  const x0 = Math.max(0, Math.floor(bx - ext));
  const x1 = Math.min(W, Math.ceil(bx + ext));
  for (let y = Math.max(0, Math.floor(by - ext)); y < Math.min(H, by + ext); y++) {
    const dy2 = (y - by) * (y - by);
    for (let x = x0, i = y * W + x0; x < x1; x++, i++) field[i] += 1.1 * Math.exp(-((x - bx) * (x - bx) + dy2) * inv);
  }
}

/** Black out pixels where `field` (noise ≈0.5 + blobs) is high, with a purple fringe at the boundary. */
function lcdBleed(d, field) {
  for (let i = 0, p = 0; i < field.length; i++, p += 4) {
    const f = (field[i] - 0.5) * 0.9;
    if (f <= 0.2) continue;
    let k = (f - 0.2) * 4.55; // 0..1 across the bleed edge
    k = k >= 1 ? 0 : 1 - k * k * (3 - 2 * k);
    let fr = f < 0.3 ? (f - 0.2) * 10 : f < 0.46 ? 1 - (f - 0.3) * 6.25 : 0;
    fr = fr * fr * (3 - 2 * fr);
    d[p] = d[p] * k + 70 * fr;
    d[p + 1] = d[p + 1] * k + 20 * fr;
    d[p + 2] = d[p + 2] * k + 120 * fr;
  }
}

function paintGlitch(ctx, W, H, rng) {
  fillR(ctx, '#020203', 0, 0, W, H);
  const pal = ['#ff2bd6', '#19e6ff', '#3dff5c', '#ffffff', '#ff3838', '#3b6bff', '#ffe83d'];
  // a surviving sliver of picture
  fillR(ctx, vGrad(ctx, 0, H, [[0, '#1a2f66'], [0.5, '#5a2c7a'], [1, '#c2553a']]), 0, 0, 58, H);
  for (let y = 0; y < H; y += 2) fillR(ctx, 'rgba(0,0,0,0.3)', 0, y, 58, 1);
  // wide stuck-column bands with fine sub-pixel structure
  const bands = [[92, 26, '#19e6ff'], [208, 14, '#ff2bd6'], [388, 34, '#3dff5c'], [452, 9, '#ffffff'], [150, 7, '#3b6bff']];
  for (const [x, w, c] of bands) {
    for (let i = 0; i < w; i++) {
      const a = rng() < 0.2 ? 0.25 : 0.55 + rng() * 0.45;
      fillR(ctx, rgba(i % 5 === 4 ? '#ffffff' : c, a), x + i, 0, 1, H);
    }
  }
  // single dead/stuck column lines
  for (let i = 0; i < 46; i++) {
    const x = rint(rng, 60, W - 2);
    const c = rpick(rng, pal);
    const y0 = rng() < 0.3 ? rint(rng, 0, H * 0.6) : 0;
    const y1 = rng() < 0.2 ? rint(rng, H * 0.5, H) : H;
    fillR(ctx, rgba(c, 0.6 + rng() * 0.4), x, y0, rng() < 0.2 ? 2 : 1, y1 - y0);
  }
  // horizontal tearing
  for (let i = 0; i < 6; i++) {
    const y = rint(rng, 6, H - 20);
    const h = rint(rng, 2, 13);
    const s = rint(rng, -60, 60);
    ctx.drawImage(ctx.canvas, 0, y, W, h, s, y, W, h);
    fillR(ctx, `rgba(255,255,255,${0.05 + rng() * 0.12})`, 0, y, W, h);
    if (rng() < 0.6) fillR(ctx, rgba(rpick(rng, pal), 0.8), 0, y + h, W, 1);
  }
  // black liquid-crystal bleed around the impact points
  const field = fbm(W, H, rng, 14, 9, 4, 0.55);
  for (const [bx, by, br] of [[330, 118, 62], [286, 168, 30], [392, 84, 26], [352, 196, 18], [120, 250, 34], [470, 20, 28]]) addBlob(field, W, H, bx, by, br);
  const img = ctx.getImageData(0, 0, W, H);
  lcdBleed(img.data, field);
  ctx.putImageData(img, 0, 0);
  // glass cracks radiating from the main impact
  ctx.lineCap = 'round';
  for (let i = 0; i < 11; i++) {
    let a = (i / 11) * TAU + rrange(rng, -0.2, 0.2);
    let x = 330;
    let y = 118;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segs = rint(rng, 4, 9);
    for (let s = 0; s < segs; s++) {
      a += rrange(rng, -0.28, 0.28);
      const l = rrange(rng, 14, 42);
      x += Math.cos(a) * l;
      y += Math.sin(a) * l;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(200,210,230,${rrange(rng, 0.16, 0.42)})`;
    ctx.lineWidth = rrange(rng, 0.6, 1.2);
    ctx.stroke();
  }
  for (const r of [22, 46]) {
    ctx.beginPath();
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * TAU;
      const rr2 = r * rrange(rng, 0.82, 1.18);
      if (k) ctx.lineTo(330 + Math.cos(a) * rr2, 118 + Math.sin(a) * rr2);
      else ctx.moveTo(330 + r, 118);
    }
    ctx.strokeStyle = 'rgba(200,210,230,0.2)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Keyboards
// ---------------------------------------------------------------------------

function arrowGlyph(ctx, cx, cy, s, dir, color) {
  const a = { UP: -Math.PI / 2, DOWN: Math.PI / 2, LEFT: Math.PI, RIGHT: 0 }[dir];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  poly(ctx, [[s, 0], [-s * 0.6, -s * 0.85], [-s * 0.6, s * 0.85]]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/**
 * Draw a key legend. Labels: single char → large; 'a|b' → main|shifted pair;
 * UP/DOWN/LEFT/RIGHT → arrows; SUPER/MENU → glyphs; words → small caption.
 */
function keyLegend(ctx, label, x, y, w, h, o) {
  if (!label) return;
  const col = o.color;
  if (label === 'UP' || label === 'DOWN' || label === 'LEFT' || label === 'RIGHT') {
    arrowGlyph(ctx, x + w / 2, y + h / 2, o.big * 0.36, label, col);
  } else if (label === 'SUPER') {
    const s = o.big * 0.36;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(Math.PI / 4);
    strokeRR(ctx, col, 1.5, -s, -s, s * 2, s * 2, 1.5);
    ctx.restore();
  } else if (label === 'MENU') {
    const s = o.big * 0.42;
    strokeRR(ctx, col, 1.3, x + w / 2 - s, y + h / 2 - s, s * 2, s * 2, 2);
    for (let i = -1; i <= 1; i++) fillR(ctx, col, x + w / 2 - s * 0.55, y + h / 2 + i * s * 0.5 - 0.6, s * 1.1, 1.2);
  } else if (label.length === 3 && label[1] === '|') {
    const main = label[0];
    const shift = label[2];
    if (o.centered) {
      txt(ctx, shift, x + w / 2, y + h * 0.4, o.big * 0.72, col, { align: 'center', weight: 600 });
      txt(ctx, main, x + w / 2, y + h * 0.8, o.big * 0.8, col, { align: 'center', weight: 600 });
    } else {
      txt(ctx, shift, x + o.padX, y + o.padY + o.big * 0.62, o.big * 0.78, col, { weight: 600 });
      txt(ctx, main, x + o.padX, y + h - o.padY * 1.5, o.big * 0.86, col, { weight: 600 });
    }
  } else if (label.length === 1) {
    if (o.centered) txt(ctx, label, x + w / 2, y + h / 2 + o.big * 0.36, o.big, col, { align: 'center', weight: 600 });
    else txt(ctx, label, x + o.padX, y + o.padY + o.big * 0.78, o.big, col, { weight: 600 });
  } else if (o.centered) {
    txt(ctx, label, o.alignRight ? x + w - o.padX : x + o.padX, y + h - o.padY, o.small, col, { weight: 600, align: o.alignRight ? 'right' : 'left' });
  } else {
    txt(ctx, label, x + o.padX, y + o.padY + o.small * 0.9, o.small, col, { weight: 600 });
  }
}

/** Expand a row spec into key rects. Entries: number = gap (u), 'A' = 1u key, ['Tab', 1.5, h?] = sized key. */
function layoutRow(row, x0, y, out) {
  let x = x0;
  for (const e of row) {
    if (typeof e === 'number') {
      x += e;
      continue;
    }
    const [label, w, h] = typeof e === 'string' ? [e, 1, 1] : [e[0], e[1] || 1, e[2] || 1];
    out.push({ label, x, y, w, h });
    x += w;
  }
}

function paintKeyboard(ctx, W, H, rng) {
  // plate
  fillR(ctx, '#2b2d31', 0, 0, W, H);
  grainOverlay(ctx, W, H, noiseLayer(128, 128, rng, 40, 40, 2, '#000000', '#ffffff', 0.035, 0.3));
  const keys = [];
  const FY = 0;
  const Y0 = 1.4;
  const NAV = 15.35;
  const NUM = 18.7;
  layoutRow(['Esc', 1, 'F1', 'F2', 'F3', 'F4', 0.5, 'F5', 'F6', 'F7', 'F8', 0.5, 'F9', 'F10', 'F11', 'F12'], 0, FY, keys);
  layoutRow(['PrtSc', 'ScrLk', 'Pause'], NAV, FY, keys);
  layoutRow(['`|~', '1|!', '2|@', '3|#', '4|$', '5|%', '6|^', '7|&', '8|*', '9|(', '0|)', '-|_', '=|+', ['Backspace', 2]], 0, Y0, keys);
  layoutRow([['Tab', 1.5], ...'QWERTYUIOP', '[|{', ']|}', ['\\||', 1.5]], 0, Y0 + 1, keys);
  layoutRow([['Caps', 1.75], ...'ASDFGHJKL', ';|:', "'|\"", ['Enter', 2.25]], 0, Y0 + 2, keys);
  layoutRow([['Shift', 2.25], ...'ZXCVBNM', ',|<', '.|>', '/|?', ['Shift', 2.75]], 0, Y0 + 3, keys);
  layoutRow([['Ctrl', 1.25], ['SUPER', 1.25], ['Alt', 1.25], ['', 6.25], ['Alt', 1.25], ['SUPER', 1.25], ['MENU', 1.25], ['Ctrl', 1.25]], 0, Y0 + 4, keys);
  layoutRow(['Ins', 'Home', 'PgUp'], NAV, Y0, keys);
  layoutRow(['Del', 'End', 'PgDn'], NAV, Y0 + 1, keys);
  layoutRow([1, 'UP'], NAV, Y0 + 3, keys);
  layoutRow(['LEFT', 'DOWN', 'RIGHT'], NAV, Y0 + 4, keys);
  layoutRow(['Num', '/', '*', '-'], NUM, Y0, keys);
  layoutRow(['7', '8', '9', ['+', 1, 2]], NUM, Y0 + 1, keys);
  layoutRow(['4', '5', '6'], NUM, Y0 + 2, keys);
  layoutRow(['1', '2', '3', ['Enter', 1, 2]], NUM, Y0 + 3, keys);
  layoutRow([['0', 2], '.'], NUM, Y0 + 4, keys);

  const m = 7;
  const ux = (W - 2 * m) / 22.7;
  const uy = (H - 2 * m) / (Y0 + 5);
  const gap = 1.6;
  for (const k of keys) {
    const x = m + k.x * ux + gap;
    const y = m + k.y * uy + gap;
    const w = k.w * ux - gap * 2;
    const h = k.h * uy - gap * 2;
    // contact shadow, skirt, sculpted top face
    fillRR(ctx, 'rgba(0,0,0,0.55)', x - 0.8, y + 0.4, w + 1.6, h + 1.8, 5);
    fillRR(ctx, vGrad(ctx, y, y + h, [[0, '#26272b'], [0.5, '#17181b'], [1, '#0b0b0d']]), x, y, w, h, 4.5);
    fillRR(ctx, vGrad(ctx, y, y + h, [[0, '#2f3136'], [1, '#222327']]), x + 4, y + 2.2, w - 8, h - 8.5, 4);
    fillRR(ctx, 'rgba(255,255,255,0.07)', x + 5.5, y + 2.6, w - 11, 1, 0.5);
    keyLegend(ctx, k.label, x + 4, y + 2.2, w - 8, h - 8.5, { color: '#e3e6ea', big: 15, small: 9.2, padX: 5.5, padY: 4.5, centered: false });
    if (k.label === 'F' || k.label === 'J' || k.label === '5') fillRR(ctx, 'rgba(255,255,255,0.28)', x + w / 2 - 5, y + h - 12.5, 10, 1.6, 0.8);
  }
  // lock indicator LEDs above the numpad
  const lx = m + NUM * ux;
  ['Num', 'Caps', 'Scroll'].forEach((t, i) => {
    const cx = lx + (0.7 + i * 1.3) * ux;
    const cy = m + uy * 0.36;
    if (i === 0) {
      glow(ctx, cx, cy, 9, '#57ff8a', 0.55);
      disc(ctx, '#aaffc4', cx, cy, 2.4);
    } else disc(ctx, '#15171a', cx, cy, 2.4);
    txt(ctx, t, cx, cy + 16, 8, '#8b9099', { align: 'center', weight: 600 });
  });
}

function paintLaptopKeyboard(ctx, W, H, rng) {
  fillR(ctx, '#2a2b2f', 0, 0, W, H);
  grainOverlay(ctx, W, H, noiseLayer(128, 128, rng, 40, 40, 2, '#000000', '#ffffff', 0.03, 0.3));
  const keys = [];
  const FH = 0.6;
  const fw = 15 / 14;
  layoutRow(['esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'del'].map((l) => [l, fw, FH]), 0, 0, keys);
  layoutRow(['`|~', '1|!', '2|@', '3|#', '4|$', '5|%', '6|^', '7|&', '8|*', '9|(', '0|)', '-|_', '=|+', ['backspace', 2]], 0, FH, keys);
  layoutRow([['tab', 1.5], ...'QWERTYUIOP', '[|{', ']|}', ['\\||', 1.5]], 0, FH + 1, keys);
  layoutRow([['caps lock', 1.75], ...'ASDFGHJKL', ';|:', "'|\"", ['enter', 2.25]], 0, FH + 2, keys);
  layoutRow([['shift', 2.25], ...'ZXCVBNM', ',|<', '.|>', '/|?', ['shift', 2.75]], 0, FH + 3, keys);
  layoutRow([['fn', 1], ['ctrl', 1.25], ['SUPER', 1.25], ['alt', 1.25], ['', 5], ['alt', 1.25], ['ctrl', 1]], 0, FH + 4, keys);
  keys.push({ label: 'LEFT', x: 12, y: FH + 4.5, w: 1, h: 0.5 }, { label: 'UP', x: 13, y: FH + 4, w: 1, h: 0.5 }, { label: 'DOWN', x: 13, y: FH + 4.5, w: 1, h: 0.5 }, { label: 'RIGHT', x: 14, y: FH + 4.5, w: 1, h: 0.5 });

  const m = 8;
  const ux = (W - 2 * m) / 15;
  const uy = (H - 2 * m) / (FH + 5);
  const gap = 3.2;
  const rightAligned = new Set(['backspace', 'enter', 'del']);
  for (const k of keys) {
    const x = m + k.x * ux + gap;
    const y = m + k.y * uy + gap;
    const w = k.w * ux - gap * 2;
    const h = k.h * uy - gap * 2;
    const small = k.h < 1;
    // recessed well + flat island cap
    fillRR(ctx, '#111214', x - 1.6, y - 1.2, w + 3.2, h + 3.4, 7.5);
    fillRR(ctx, vGrad(ctx, y, y + h, [[0, '#232428'], [1, '#1a1b1e']]), x, y, w, h, 6);
    fillRR(ctx, 'rgba(255,255,255,0.075)', x + 5, y + 0.6, w - 10, 1, 0.5);
    strokeRR(ctx, 'rgba(255,255,255,0.035)', 1, x + 0.5, y + 0.5, w - 1, h - 1, 6);
    const isRight = rightAligned.has(k.label) || (k.label === 'shift' && k.x > 5) || ((k.label === 'alt' || k.label === 'ctrl') && k.x > 6);
    keyLegend(ctx, k.label, x, y, w, h, { color: '#dfe2e7', big: small ? 12 : 19, small: small ? 10.5 : 11.5, padX: 8, padY: small ? 9 : 9, centered: true, alignRight: isRight });
    if (k.label === 'F' || k.label === 'J') fillRR(ctx, 'rgba(255,255,255,0.3)', x + w / 2 - 6, y + h - 9, 12, 1.8, 0.9);
    if (k.label === 'caps lock') disc(ctx, '#3a3d42', x + 11, y + 12, 2.2);
  }
}

// ---------------------------------------------------------------------------
// Circuit boards
// ---------------------------------------------------------------------------

/** Offset a polyline sideways by `d` with mitred corners (keeps 45° bundles parallel). */
function offsetPolyline(pts, d) {
  const out = [];
  const normal = (a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i - 1];
    const p = pts[i];
    const b = pts[i + 1];
    let nx;
    let ny;
    let k = 1;
    if (a && b) {
      const n1 = normal(a, p);
      const n2 = normal(p, b);
      nx = n1[0] + n2[0];
      ny = n1[1] + n2[1];
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      k = 1 / Math.max(0.3, nx * n1[0] + ny * n1[1]);
    } else {
      [nx, ny] = a ? normal(a, p) : normal(p, b);
    }
    out.push([p[0] + nx * d * k, p[1] + ny * d * k]);
  }
  return out;
}

const PCB_PALETTES = {
  green: { base: '#0c4a2b', pour: '#17693c', gap: '#0a3c22', trace: '#2a8f55', lo: '#0a3d23' },
  blue: { base: '#0c2f66', pour: '#164a94', gap: '#0a2654', trace: '#2f71c9', lo: '#0a2859' },
};

function paintPCB(ctx, S, rng, pal, flip) {
  const fx = (x, w = 0) => (flip ? S - x - w : x);
  const SILK = 'rgba(236,240,236,0.92)';
  const GOLD = '#d2ad52';

  // ---- substrate: copper pour seen through the solder mask
  fillR(ctx, pal.pour, 0, 0, S, S);
  ctx.drawImage(noiseLayer(128, 128, rng, 4, 4, 3, '#000000', '#ffffff', 0.09, 0.35), 0, 0, S, S);
  const weave = makeCanvas(4, 4); // faint glass-fibre weave of the laminate
  const wg = weave.getContext('2d');
  fillR(wg, 'rgba(255,255,255,0.03)', 0, 0, 2, 2);
  fillR(wg, 'rgba(255,255,255,0.03)', 2, 2, 2, 2);
  fillR(wg, 'rgba(0,0,0,0.04)', 2, 0, 2, 2);
  fillR(wg, 'rgba(0,0,0,0.04)', 0, 2, 2, 2);
  grainOverlay(ctx, S, S, weave);
  // keep-out areas without copper (darker bare laminate)
  for (const [x, y, w, h] of [[8, 8, 44, 30], [8, 300, 104, 204], [300, 8, 204, 66], [452, 110, 52, 330]]) fillRR(ctx, pal.base, fx(x, w), y, w, h, 3);

  // ---- traces
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const tracePaths = [];
  const bundle = (pts, n, pitch, o = {}) => {
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * pitch;
      tracePaths.push({ pts: offsetPolyline(pts.map(([x, y]) => [fx(x), y]), flip ? -off : off), w: o.w || 2.1, via: o.via !== false, viaStart: !!o.viaStart });
    }
  };
  // signal buses (hand-routed, 45° bends)
  bundle([[168, 172], [168, 128], [140, 100], [140, 62]], 9, 4.6, {});
  bundle([[250, 206], [272, 206], [286, 192], [300, 192]], 7, 4.6, { via: false });
  bundle([[250, 258], [300, 258], [330, 288], [362, 288]], 6, 4.6, { via: false });
  bundle([[212, 288], [212, 330], [250, 368], [250, 402]], 8, 4.6, {});
  bundle([[130, 232], [96, 232], [70, 258], [70, 296]], 5, 5, {});
  bundle([[362, 188], [404, 188], [430, 214], [462, 214]], 8, 4.6, { via: false });
  bundle([[416, 330], [440, 330], [452, 318], [462, 318]], 6, 4.6, { via: false });
  bundle([[388, 362], [388, 420], [352, 456], [150, 456]], 6, 5, {});
  bundle([[222, 172], [222, 140], [250, 112], [300, 112], [318, 94]], 5, 4.6, {});
  bundle([[160, 290], [160, 352], [138, 374]], 4, 5, {});
  bundle([[330, 240], [330, 268], [345, 283]], 3, 5, {});
  // power rails
  bundle([[58, 318], [58, 300], [40, 282], [40, 70], [70, 40], [112, 40]], 1, 0, { w: 6, via: false });
  bundle([[96, 440], [96, 480], [300, 480], [330, 450], [440, 450]], 1, 0, { w: 5, via: false });
  // random short stubs ending in vias
  for (let i = 0; i < 22; i++) {
    const x = rrange(rng, 30, 440);
    const y = rrange(rng, 80, 490);
    const a = rint(rng, 0, 7) * (Math.PI / 4);
    const l1 = rrange(rng, 10, 34);
    const a2 = a + rpick(rng, [-1, 1]) * (Math.PI / 4);
    const l2 = rrange(rng, 8, 26);
    const p1 = [x + Math.cos(a) * l1, y + Math.sin(a) * l1];
    bundle([[x, y], p1, [p1[0] + Math.cos(a2) * l2, p1[1] + Math.sin(a2) * l2]], 1, 0, { viaStart: true });
  }
  const strokeAll = (color, grow) => {
    ctx.strokeStyle = color;
    for (const t of tracePaths) {
      ctx.lineWidth = t.w + grow;
      poly(ctx, t.pts);
      ctx.stroke();
    }
  };
  strokeAll(pal.gap, 3.4); // etched clearance around each track
  strokeAll(pal.trace, 0);
  const via = (x, y, r = 3.1) => {
    disc(ctx, pal.gap, x, y, r + 1.6);
    disc(ctx, '#c9c2a0', x, y, r);
    disc(ctx, '#0b0d0c', x, y, r * 0.42);
  };
  for (const t of tracePaths) {
    const e = t.pts[t.pts.length - 1];
    if (t.via) via(e[0], e[1]);
    if (t.viaStart) via(t.pts[0][0], t.pts[0][1]);
  }
  // via stitching along the board edge
  for (let x = 70; x < 450; x += 19) if (x < 196 || x > 320) via(fx(x), 503, 2.2);
  for (let y = 80; y < 440; y += 19) via(fx(9), y, 2.2);

  // ---- components
  const label = (s, x, y, size = 6.5, align = 'left') => txt(ctx, s, x, y, size, SILK, { weight: 600, align });
  const pinRow = (x, y, n, pitch, len, horiz) => {
    for (let i = 0; i < n; i++) {
      const px = horiz ? x + i * pitch : x;
      const py = horiz ? y : y + i * pitch;
      fillR(ctx, '#8f8a70', px - (horiz ? 1.5 : 0), py - (horiz ? 0 : 1.5), horiz ? 3 : len, horiz ? len : 3);
      fillR(ctx, '#d9dbde', px - (horiz ? 1.1 : -1), py - (horiz ? -1 : 1.1), horiz ? 2.2 : len - 2, horiz ? len - 2 : 2.2);
    }
  };
  /** Black IC package; `pins` = [top/bottom count, left/right count]. */
  const chip = (x, y, w, h, pins, ref, mark) => {
    x = fx(x, w);
    const [ph, pv] = pins;
    const L = 7;
    if (ph) {
      const pitch = (w - 12) / (ph - 1);
      pinRow(x + 6, y - L + 1, ph, pitch, L, true);
      pinRow(x + 6, y + h - 1, ph, pitch, L, true);
    }
    if (pv) {
      const pitch = (h - 12) / (pv - 1);
      pinRow(x - L + 1, y + 6, pv, pitch, L, false);
      pinRow(x + w - 1, y + 6, pv, pitch, L, false);
    }
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
    fillRR(ctx, '#17181b', x, y, w, h, 2);
    ctx.restore();
    fillRR(ctx, vGrad(ctx, y, y + h, [[0, '#2a2b2f'], [1, '#141517']]), x + 1.5, y + 1.5, w - 3, h - 3, 1.5);
    disc(ctx, '#0c0c0e', x + 7, y + h - 7, 2.4);
    ring(ctx, 'rgba(255,255,255,0.12)', 0.8, x + 7, y + h - 7, 2.4);
    if (mark) {
      const cx = x + w / 2;
      const fs = Math.max(5.5, Math.min(9, w / 9));
      mark.forEach((s, i) => txt(ctx, s, cx, y + h / 2 + (i - (mark.length - 1) / 2) * (fs + 2.5) + fs * 0.35, fs, 'rgba(190,196,204,0.78)', { align: 'center', weight: 600, font: MONO }));
    }
    strokeRR(ctx, SILK, 0.9, x - (pv ? L + 2 : 2), y - (ph ? L + 2 : 2), w + (pv ? 2 * L + 4 : 4), h + (ph ? 2 * L + 4 : 4), 1.5);
    if (ref) label(ref, x - (pv ? L + 2 : 2), y - (ph ? L + 5 : 5));
  };
  /** Two-terminal SMD passive. */
  const passive = (x, y, kind, vert) => {
    const w = vert ? 5.5 : 11;
    const h = vert ? 11 : 5.5;
    x = fx(x, w);
    fillR(ctx, pal.gap, x - 1.5, y - 1.5, w + 3, h + 3);
    fillR(ctx, '#cfd2d5', x, y, w, h);
    const body = kind === 'cap' ? '#b3936a' : kind === 'led' ? '#f1ecd2' : '#1a1b1e';
    if (vert) fillR(ctx, body, x, y + 2.6, w, h - 5.2);
    else fillR(ctx, body, x + 2.6, y, w - 5.2, h);
    if (kind === 'res') fillR(ctx, 'rgba(240,240,240,0.75)', x + (vert ? 1.6 : 4), y + (vert ? 4 : 1.8), vert ? 2.2 : 3, vert ? 3 : 1.8);
    if (kind === 'led') fillR(ctx, 'rgba(120,255,150,0.75)', x + (vert ? 1 : 4), y + (vert ? 4 : 1), vert ? 3.5 : 3, vert ? 3 : 3.5);
  };
  const ecap = (x, y, r, ref) => {
    x = fx(x);
    const b = r + 3;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    poly(ctx, [[x - b, y - b], [x + b - 5, y - b], [x + b, y - b + 5], [x + b, y + b - 5], [x + b - 5, y + b], [x - b, y + b]]);
    ctx.closePath();
    ctx.fillStyle = '#1b1c1f';
    ctx.fill();
    ctx.restore();
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#fafbfc');
    g.addColorStop(0.55, '#c3c7cc');
    g.addColorStop(1, '#868b92');
    disc(ctx, g, x, y, r);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();
    fillR(ctx, '#1d2230', x - r, y - r, r * 0.62, r * 2);
    ctx.restore();
    line(ctx, 'rgba(60,64,72,0.5)', 0.8, x - r * 0.1, y - r * 0.7, x + r * 0.7, y + r * 0.7);
    line(ctx, 'rgba(60,64,72,0.5)', 0.8, x + r * 0.7, y - r * 0.7, x - r * 0.1, y + r * 0.7);
    ring(ctx, 'rgba(255,255,255,0.5)', 0.8, x, y, r - 0.6);
    if (ref) label(ref, x - b, y - b - 3);
  };
  const header = (x, y, cols, rows, ref) => {
    const p = 11;
    const w = cols * p + 4;
    const h = rows * p + 4;
    x = fx(x, w);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
    fillRR(ctx, '#161719', x, y, w, h, 2);
    ctx.restore();
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const px = x + 2 + i * p + p / 2;
        const py = y + 2 + j * p + p / 2;
        fillR(ctx, '#2a2b2f', px - 4.2, py - 4.2, 8.4, 8.4);
        fillR(ctx, '#a8873a', px - 2, py - 2, 4, 4);
        fillR(ctx, '#f0d687', px - 2, py - 2, 2.4, 2.4);
      }
    }
    strokeRR(ctx, SILK, 0.9, x - 2.5, y - 2.5, w + 5, h + 5, 1.5);
    if (ref) label(ref, x - 2, y - 6);
  };
  const mountHole = (x, y) => {
    x = fx(x);
    disc(ctx, pal.gap, x, y, 14);
    disc(ctx, GOLD, x, y, 12);
    ring(ctx, '#f3da92', 1, x, y, 11);
    disc(ctx, '#050505', x, y, 6.5);
    for (let i = 0; i < 8; i++) disc(ctx, '#3b2f12', x + Math.cos((i * TAU) / 8) * 9.2, y + Math.sin((i * TAU) / 8) * 9.2, 0.9);
  };

  // main processor (QFP) + memory + support ICs
  chip(138, 178, 104, 104, [20, 20], 'U1', ['MX7 4096', 'KRT-22B', '2614 A']);
  chip(308, 150, 54, 92, [0, 18], 'U2', ['D8G', '25Q64']);
  chip(362, 304, 56, 56, [11, 11], 'U3', ['PL21', '0835']);
  chip(262, 414, 30, 22, [4, 0], 'U4', null);
  chip(318, 414, 30, 22, [4, 0], 'U5', null);
  chip(250, 68, 34, 24, [0, 4], 'U6', null);
  // metal RF shield
  {
    const x = fx(330, 104);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    fillRR(ctx, '#b9bdc2', x, 18, 104, 50, 3);
    ctx.restore();
    fillRR(ctx, vGrad(ctx, 18, 68, [[0, '#dcdfe3'], [0.5, '#bfc3c8'], [1, '#a2a7ae']]), x + 1, 19, 102, 48, 2.5);
    strokeRR(ctx, 'rgba(90,96,104,0.6)', 0.8, x + 4.5, 22.5, 95, 41, 2);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) disc(ctx, 'rgba(70,76,84,0.6)', x + 14 + i * 15.2, 33 + j * 20, 1.6);
    label('SH1', x, 14);
  }
  // crystal
  {
    const x = fx(148, 40);
    fillRR(ctx, pal.gap, x - 2, 306, 44, 18, 9);
    fillRR(ctx, vGrad(ctx, 308, 322, [[0, '#eef0f2'], [1, '#9ea3aa']]), x, 308, 40, 14, 7);
    txt(ctx, '16.000', x + 20, 318, 6, 'rgba(60,64,72,0.8)', { align: 'center', font: MONO });
    label('Y1', x, 303);
  }
  // power section: inductor, regulator, bulk capacitors
  {
    const x = fx(22, 46);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    fillRR(ctx, '#3a3b40', x, 372, 46, 46, 7);
    ctx.restore();
    fillRR(ctx, vGrad(ctx, 372, 418, [[0, '#55575d'], [1, '#303136']]), x + 2, 374, 42, 42, 6);
    txt(ctx, '4R7', x + 23, 399, 11, 'rgba(235,238,240,0.85)', { align: 'center', weight: 700 });
    label('L1', x, 368);
    const rx = fx(26, 34);
    fillR(ctx, '#c9ccd0', rx - 2, 318, 38, 16);
    fillRR(ctx, '#1a1b1e', rx, 326, 34, 26, 2);
    pinRow(rx + 6, 351, 3, 11, 8, true);
    label('Q1', rx, 314);
  }
  ecap(88, 340, 17, 'C1');
  ecap(96, 404, 15, 'C2');
  ecap(84, 76, 15, 'C7');
  // connectors
  header(462, 116, 2, 14, 'J2');
  {
    // flat-flex connector
    const x = fx(100, 96);
    fillRR(ctx, '#ebe5d2', x, 12, 96, 18, 2);
    fillRR(ctx, '#5b3f2a', x + 4, 12, 88, 7, 1.5);
    for (let i = 0; i < 20; i++) fillR(ctx, '#d9dbde', x + 7 + i * 4.3, 30, 2.2, 6);
    label('J1', x, 9);
  }
  {
    // 4-pin wire-to-board socket
    const x = fx(128, 62);
    fillRR(ctx, '#f1eee4', x, 478, 62, 24, 2);
    fillRR(ctx, '#d7d2c2', x + 4, 482, 54, 12, 1.5);
    for (let i = 0; i < 4; i++) fillR(ctx, '#b89b47', x + 10 + i * 13, 484, 4, 8);
    label('J3', x, 475);
  }
  // decoupling passives around the ICs
  for (let i = 0; i < 7; i++) passive(144 + i * 14, 150, i % 3 === 2 ? 'res' : 'cap', true);
  for (let i = 0; i < 5; i++) passive(262, 222 + i * 12 - 6, 'cap', false);
  for (let i = 0; i < 6; i++) passive(308 + i * 9.5, 252, i & 1 ? 'res' : 'cap', true);
  for (let i = 0; i < 5; i++) passive(424, 300 + i * 12, i % 2 ? 'cap' : 'res', false);
  for (let i = 0; i < 4; i++) passive(196 + i * 9, 304, 'cap', true);
  for (let i = 0; i < 6; i++) passive(116 + i * 10, 100 + (i & 1) * 2, i < 4 ? 'res' : 'cap', true);
  for (let i = 0; i < 4; i++) passive(260 + i * 20, 446, 'res', false);
  for (let i = 0; i < 3; i++) passive(296, 66 + i * 10, 'cap', false);
  for (let i = 0; i < 3; i++) passive(410 + i * 13, 84, 'led', true);
  for (const [x, y] of [[120, 372], [136, 390], [178, 372], [196, 386], [300, 384], [322, 372], [344, 388], [412, 392], [432, 380], [420, 412], [182, 418], [200, 432]]) passive(x, y, rpick(rng, ['cap', 'res']), rng() < 0.5);
  // gold test points
  for (let i = 0; i < 6; i++) {
    const x = fx(366 + i * 13);
    disc(ctx, pal.gap, x, 472, 5.4);
    disc(ctx, GOLD, x, 472, 4);
    disc(ctx, '#f3da92', x - 1, 471, 1.6);
  }
  label('TP1-6', fx(360) - (flip ? 68 : 0), 488);
  mountHole(24, 24);
  mountHole(488, 24);
  mountHole(24, 488);
  mountHole(488, 488);

  // silkscreen text + fiducials
  txt(ctx, 'CTRL-MAIN  REV 2.1', fx(210) - (flip ? 96 : 0), 500, 8, SILK, { weight: 700 });
  txt(ctx, '2026-W38', fx(14), 446, 6.5, SILK, { weight: 600, align: flip ? 'right' : 'left' });
  txt(ctx, '94V-0', fx(14), 456, 6.5, SILK, { weight: 600, align: flip ? 'right' : 'left' });
  for (const [x, y] of [[62, 462], [440, 96]]) {
    disc(ctx, pal.lo, fx(x), y, 6);
    disc(ctx, '#d9dbde', fx(x), y, 2.6);
  }
  // soft overall sheen
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, 'rgba(255,255,255,0.07)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.1)');
  fillR(ctx, g, 0, 0, S, S);
}

// ---------------------------------------------------------------------------
// Washing machine control fascia
// ---------------------------------------------------------------------------

/** Seven-segment digit; `on` is a 7-char string of 0/1 for segments a..g. */
function sevenSeg(ctx, x, y, w, h, on, color, ghost) {
  const t = w * 0.2;
  const hh = h / 2;
  const segs = [
    [x + t * 0.6, y, w - t * 1.2, t],
    [x + w - t, y + t * 0.6, t, hh - t * 0.9],
    [x + w - t, y + hh + t * 0.3, t, hh - t * 0.9],
    [x + t * 0.6, y + h - t, w - t * 1.2, t],
    [x, y + hh + t * 0.3, t, hh - t * 0.9],
    [x, y + t * 0.6, t, hh - t * 0.9],
    [x + t * 0.6, y + hh - t / 2, w - t * 1.2, t],
  ];
  segs.forEach(([sx, sy, sw, sh], i) => fillRR(ctx, on[i] === '1' ? color : ghost, sx, sy, sw, sh, t * 0.4));
}

function paintWasherPanel(ctx, W, H, rng) {
  fillR(ctx, vGrad(ctx, 0, H, [[0, '#f0f1f3'], [1, '#e4e5e8']]), 0, 0, W, H);
  grainOverlay(ctx, W, H, noiseLayer(128, 128, rng, 5, 5, 2, '#5a6068', '#ffffff', 0.035, 0.5));
  const INK = '#5d646e';

  // detergent drawer (recessed front + finger pull)
  fillRR(ctx, 'rgba(0,0,0,0.2)', 21, 17, 294, 126, 12);
  fillRR(ctx, 'rgba(255,255,255,0.9)', 22.5, 19, 292.5, 125.5, 11);
  fillRR(ctx, vGrad(ctx, 19, 143, [[0, '#eff0f2'], [1, '#e0e2e5']]), 23, 19, 290, 122, 10);
  strokeRR(ctx, 'rgba(60,66,76,0.28)', 1, 23.5, 19.5, 289, 121, 10);
  fillRR(ctx, vGrad(ctx, 100, 130, [[0, '#b9bcc2'], [0.35, '#d2d5d9'], [1, '#e9ebed']]), 98, 100, 140, 29, 14);
  strokeRR(ctx, 'rgba(60,66,76,0.3)', 1, 98.5, 100.5, 139, 28, 14);
  fillRR(ctx, 'rgba(255,255,255,0.8)', 108, 127.5, 120, 1.2, 0.6);
  // compartment pictograms
  ['I', 'II'].forEach((t, i) => {
    strokeRR(ctx, INK, 1.1, 40.5 + i * 30, 34.5, 22, 18, 3);
    txt(ctx, t, 51.5 + i * 30, 47.5, 9.5, INK, { align: 'center', weight: 700 });
  });
  strokeRR(ctx, INK, 1.1, 100.5, 34.5, 22, 18, 3);
  for (let k = 0; k < 5; k++) {
    const a = (k * TAU) / 5 - Math.PI / 2;
    disc(ctx, INK, 111.5 + Math.cos(a) * 4.2, 43.5 + Math.sin(a) * 4.2, 2);
  }
  disc(ctx, '#eceef0', 111.5, 43.5, 1.5);
  txt(ctx, 'Detergent drawer', 296, 47, 8.5, '#868c96', { align: 'right' });

  // programme dial markings (knob itself is a 3D part: centre left clear)
  const cx = 520;
  const cy = 80;
  ring(ctx, 'rgba(60,66,76,0.2)', 1.4, cx, cy, 51);
  ring(ctx, 'rgba(255,255,255,0.8)', 1, cx, cy + 0.8, 52.2);
  const progs = {
    '-3': 'Cottons', '-2': 'Eco 40-60', '-1': 'Synthetics', 0: 'Mixed', 1: 'Delicates', 2: 'Wool', 3: 'Hand wash',
    5: 'Drain', 6: 'Spin', 7: 'Rinse', 8: 'Duvet', 9: 'Sports', 10: 'Daily 60′', 11: 'Quick 15′',
  };
  ctx.lineCap = 'round';
  for (let k = -4; k < 12; k++) {
    const a = (k * TAU) / 16;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const major = k !== -4 && k !== 4;
    line(ctx, INK, major ? 1.6 : 2.2, cx + c * 55, cy + s * 55, cx + c * (major ? 61 : 63), cy + s * (major ? 61 : 63));
    const a2 = a + TAU / 32;
    disc(ctx, 'rgba(93,100,110,0.55)', cx + Math.cos(a2) * 58, cy + Math.sin(a2) * 58, 0.9);
    const name = progs[k];
    if (name) {
      const right = c > 0;
      const tx = cx + c * 66 + (right ? 3 : -3);
      const ty = cy + s * 70 + 3;
      txt(ctx, name, tx, ty, 8.6, '#4c535d', { align: right ? 'left' : 'right', weight: 600 });
    }
  }
  // off marker at 12 o'clock, cold-rinse snowflake at 6 o'clock
  ring(ctx, INK, 1.3, cx, cy - 71, 3.6);
  fillR(ctx, '#eceef0', cx - 1.6, cy - 77, 3.2, 4);
  line(ctx, INK, 1.3, cx, cy - 76.5, cx, cy - 71.5);
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3;
    line(ctx, INK, 1.1, cx - Math.cos(a) * 4.2, cy + 71 - Math.sin(a) * 4.2, cx + Math.cos(a) * 4.2, cy + 71 + Math.sin(a) * 4.2);
  }
  // tiny pictograms beside a few programmes
  const drop = (x, y, s) => {
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.bezierCurveTo(x + s, y, x + s * 0.8, y + s, x, y + s);
    ctx.bezierCurveTo(x - s * 0.8, y + s, x - s, y, x, y - s);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  drop(388, 64, 4);
  ctx.beginPath();
  for (let t = 0; t < 2.2 * TAU; t += 0.3) ctx.lineTo(392 + Math.cos(t) * t * 0.36, 96 + Math.sin(t) * t * 0.36);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(644, 62);
  ctx.bezierCurveTo(650, 54, 654, 66, 650, 70);
  ctx.bezierCurveTo(648, 72, 643, 70, 644, 62);
  ctx.stroke();
  line(ctx, INK, 1, 646, 60, 652, 71);

  // LCD
  fillRR(ctx, 'rgba(255,255,255,0.9)', 699, 42.5, 114, 78, 8);
  fillRR(ctx, '#0a0c0f', 700, 42, 112, 76, 7);
  fillRR(ctx, vGrad(ctx, 47, 113, [[0, '#101b23'], [1, '#0a1218']]), 705, 47, 102, 66, 4);
  const on = '#d6f0ff';
  const ghost = 'rgba(214,240,255,0.055)';
  ctx.save();
  ctx.shadowColor = 'rgba(120,200,255,0.75)';
  ctx.shadowBlur = 6;
  const dy = 58;
  sevenSeg(ctx, 716, dy, 19, 34, '0110000', on, ghost);
  disc(ctx, on, 744.5, dy + 11, 2);
  disc(ctx, on, 744.5, dy + 24, 2);
  sevenSeg(ctx, 753, dy, 19, 34, '1101101', on, ghost);
  sevenSeg(ctx, 779, dy, 19, 34, '0110011', on, ghost);
  ctx.restore();
  txt(ctx, '40°C', 716, 105.5, 7.5, 'rgba(214,240,255,0.8)', { weight: 600 });
  txt(ctx, '1200 rpm', 798, 105.5, 7.5, 'rgba(214,240,255,0.8)', { weight: 600, align: 'right' });
  fillRR(ctx, 'rgba(214,240,255,0.8)', 751, 99, 9, 7, 1.5);
  ctx.beginPath();
  ctx.arc(755.5, 99, 2.8, Math.PI, 0);
  ctx.strokeStyle = 'rgba(214,240,255,0.8)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // option buttons with indicator LEDs
  const labels = ['Temp.', 'Spin', 'Extra rinse', 'Delay', 'Start'];
  for (let i = 0; i < 5; i++) {
    const x = 846 + i * 36.5;
    const y = 100;
    const r = i === 4 ? 13 : 11;
    disc(ctx, 'rgba(0,0,0,0.22)', x, y + 1.2, r + 1.4);
    const g = ctx.createRadialGradient(x - 3, y - 4, 1, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#cfd3d8');
    disc(ctx, g, x, y, r);
    ring(ctx, 'rgba(60,66,76,0.35)', 1, x, y, r);
    ring(ctx, 'rgba(255,255,255,0.9)', 1, x, y, r - 2.5);
    if (i === 4) {
      poly(ctx, [[x - 5, y - 4], [x - 0.5, y], [x - 5, y + 4]]);
      ctx.closePath();
      ctx.fillStyle = INK;
      ctx.fill();
      fillR(ctx, INK, x + 1.5, y - 4, 1.8, 8);
      fillR(ctx, INK, x + 4.6, y - 4, 1.8, 8);
    }
    const lit = i === 1 ? '#ff9d2e' : i === 4 ? '#35d98a' : null;
    if (lit) {
      glow(ctx, x, 73, 9, lit, 0.6);
      disc(ctx, lit, x, 73, 2.6);
      disc(ctx, 'rgba(255,255,255,0.8)', x - 0.6, 72.4, 1);
    } else {
      disc(ctx, '#b4b9c0', x, 73, 2.6);
      ring(ctx, 'rgba(60,66,76,0.3)', 0.8, x, 73, 2.6);
    }
    txt(ctx, labels[i], x, 58, 7.6, '#4c535d', { align: 'center', weight: 600 });
  }
  line(ctx, 'rgba(60,66,76,0.22)', 1, 828, 46, 1006, 46);
  txt(ctx, 'OPTIONS', 828, 39, 7, '#868c96', { weight: 700 });
}

// ---------------------------------------------------------------------------
// Framed picture + book cover
// ---------------------------------------------------------------------------

function paintPicture(ctx, W, H, rng) {
  // block in a simple landscape …
  fillR(ctx, vGrad(ctx, 0, 230, [[0, '#6f9fcf'], [0.55, '#b9cfe0'], [1, '#f6dcae']]), 0, 0, W, H);
  glow(ctx, 372, 150, 150, '#fff2c4', 0.9);
  disc(ctx, '#fff6d8', 372, 150, 20);
  for (const [x, y, rx, ry] of [[110, 70, 80, 18], [170, 84, 60, 13], [300, 52, 70, 14], [440, 96, 56, 11], [60, 128, 50, 10]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fillStyle = 'rgba(255,248,236,0.78)';
    ctx.fill();
  }
  const hill = (pts, c0, c1) => {
    ctx.beginPath();
    ctx.moveTo(-10, H + 10);
    ctx.lineTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 6) ctx.bezierCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], pts[i + 4], pts[i + 5]);
    ctx.lineTo(W + 10, H + 10);
    ctx.closePath();
    ctx.fillStyle = vGrad(ctx, pts[1] - 40, H, [[0, c0], [1, c1]]);
    ctx.fill();
  };
  hill([-10, 200, 90, 150, 170, 170, 250, 196, 330, 220, 420, 160, 530, 190], '#8aa2c2', '#9fb1c4');
  hill([-10, 232, 100, 205, 190, 240, 290, 226, 380, 214, 450, 236, 530, 216], '#7d9c7c', '#a9b87e');
  hill([-10, 262, 80, 280, 200, 236, 300, 262, 400, 288, 470, 250, 530, 262], '#d9b55c', '#c9a04a');
  hill([-10, 310, 120, 276, 220, 326, 330, 304, 420, 288, 480, 320, 530, 300], '#6f9a55', '#4f7d45');
  hill([-10, 344, 140, 322, 250, 372, 360, 348, 440, 332, 500, 356, 530, 346], '#8c6fb4', '#6c4f96');
  // winding path
  ctx.beginPath();
  ctx.moveTo(250, H + 10);
  ctx.bezierCurveTo(240, 340, 330, 320, 300, 286);
  ctx.bezierCurveTo(284, 268, 310, 256, 318, 246);
  ctx.lineTo(326, 246);
  ctx.bezierCurveTo(322, 258, 306, 268, 322, 284);
  ctx.bezierCurveTo(360, 318, 300, 340, 330, H + 10);
  ctx.closePath();
  ctx.fillStyle = '#ecd9b0';
  ctx.fill();
  // … then rework it with brush strokes sampled from the block-in: broad
  // ones first, then smaller ones that pull the forms back into focus
  const src = ctx.getImageData(0, 0, W, H).data;
  const flow = fbm(W >> 2, H >> 2, rng, 5, 4, 2, 0.5);
  const FW = W >> 2;
  ctx.lineCap = 'round';
  const strokes = (count, lenLo, lenHi, lwLo, lwHi, alpha) => {
    for (let i = 0; i < count; i++) {
      const x = rng() * W;
      const y = rng() * H;
      const q = ((y | 0) * W + (x | 0)) * 4;
      const j = rrange(rng, 0.9, 1.1);
      const r = Math.min(255, src[q] * j + rrange(rng, -7, 7)) | 0;
      const g = Math.min(255, src[q + 1] * j + rrange(rng, -7, 7)) | 0;
      const b = Math.min(255, src[q + 2] * j + rrange(rng, -7, 7)) | 0;
      const sky = y < 196;
      const a = (flow[((y | 0) >> 2) * FW + ((x | 0) >> 2)] - 0.5) * (sky ? 1.1 : 2.2) + (sky ? 0 : 0.12);
      const len = rrange(rng, lenLo, lenHi) * (sky ? 1.4 : 1);
      const dx = Math.cos(a) * len;
      const dy = Math.sin(a) * len;
      ctx.lineWidth = rrange(rng, lwLo, lwHi);
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.beginPath();
      ctx.moveTo(x - dx, y - dy);
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
    }
  };
  strokes(700, 6, 13, 4, 7, 0.8);
  strokes(1700, 2.5, 6.5, 1.8, 3.6, 0.88);
  // accents laid on last: sun, cypress trees, farmhouse
  disc(ctx, 'rgba(255,247,220,0.92)', 372, 150, 17);
  for (const [x, y, h] of [[96, 268, 74], [118, 272, 56], [416, 262, 64], [452, 300, 92], [40, 316, 104]]) {
    ctx.beginPath();
    ctx.ellipse(x, y - h / 2, h * 0.13, h / 2, 0, 0, TAU);
    ctx.fillStyle = '#2c563b';
    ctx.fill();
    for (let k = 0; k < 12; k++) {
      const t = rng();
      const w = h * 0.12 * Math.sin(Math.PI * Math.min(1, t * 1.15));
      const px = x + rrange(rng, -w, w);
      const py = y - t * h;
      line(ctx, rng() < 0.4 ? 'rgba(82,128,84,0.85)' : 'rgba(38,78,54,0.9)', rrange(rng, 2, 3.4), px, py, px + rrange(rng, -1, 1), py - rrange(rng, 5, 10));
    }
  }
  fillR(ctx, 'rgba(246,236,216,0.92)', 177, 231, 38, 20);
  poly(ctx, [[171, 233], [196, 214], [221, 233]]);
  ctx.closePath();
  ctx.fillStyle = 'rgba(196,86,58,0.94)';
  ctx.fill();
  fillR(ctx, 'rgba(100,70,56,0.9)', 190, 239, 8, 12);
  fillR(ctx, 'rgba(120,150,176,0.85)', 203, 237, 6, 6);
  // canvas tooth + gentle vignette / varnish
  grainOverlay(ctx, W, H, noiseLayer(64, 64, rng, 32, 32, 1, '#2a1c08', '#ffffff', 0.05, 1.2));
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
  v.addColorStop(0, 'rgba(60,40,10,0)');
  v.addColorStop(1, 'rgba(60,40,10,0.22)');
  fillR(ctx, v, 0, 0, W, H);
}

function paintBookCover(ctx, W, H, rng) {
  const cloth = fbm(W, H, rng, 128, 256, 1);
  const lo = fbm(W, H, rng, 3, 5, 2, 0.5);
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) cloth[i] = 0.935 + (cloth[i] - 0.5) * 0.06 + (lo[i] - 0.5) * 0.04 + ((x ^ y) & 1 ? 0.008 : -0.008);
  blitGrey(ctx, W, H, cloth);
  const k = (v, a = 1) => `rgba(${v},${v},${v},${a})`;
  // head and tail bands
  for (const y of [26, H - 26 - 30]) {
    fillR(ctx, k(120), 0, y - 7, W, 2);
    fillR(ctx, k(172), 0, y, W, 30);
    fillR(ctx, k(120), 0, y + 35, W, 2);
    for (let x = 16; x < W; x += 32) {
      poly(ctx, [[x, y + 6], [x + 9, y + 15], [x, y + 24], [x - 9, y + 15]]);
      ctx.closePath();
      ctx.fillStyle = k(232);
      ctx.fill();
      disc(ctx, k(150), x, y + 15, 2.2);
      disc(ctx, k(225), x + 16, y + 15, 1.6);
    }
  }
  // title block (fake lettering)
  const bar = (y, w, h, v) => fillRR(ctx, k(v), (W - w) / 2, y, w, h, 1.5);
  bar(112, 150, 11, 62);
  bar(132, 112, 11, 62);
  bar(152, 136, 11, 62);
  fillR(ctx, k(120), W / 2 - 34, 178, 68, 1.5);
  bar(190, 84, 5.5, 105);
  bar(201, 60, 5.5, 105);
  // emblem
  const ey = 348;
  ring(ctx, k(96), 2.4, W / 2, ey, 30);
  ring(ctx, k(140), 1, W / 2, ey, 35);
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8;
    ctx.save();
    ctx.translate(W / 2, ey);
    ctx.rotate(a);
    poly(ctx, [[0, -4], [20, 0], [0, 4]]);
    ctx.closePath();
    ctx.fillStyle = k(i & 1 ? 150 : 90);
    ctx.fill();
    ctx.restore();
  }
  disc(ctx, k(238), W / 2, ey, 5.5);
  disc(ctx, k(96), W / 2, ey, 2.6);
  bar(404, 46, 5, 120);
}

// ---------------------------------------------------------------------------
// Particle sprites (white RGB, alpha carries the shape)
// ---------------------------------------------------------------------------

function paintSprite(ctx, S, rng, kind) {
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const c = (S - 1) / 2;
  const turbulent = kind === 'dust' || kind === 'smoke';
  const n1 = turbulent ? fbm(S, S, rng, kind === 'smoke' ? 6 : 4, kind === 'smoke' ? 6 : 4, 4, 0.6) : null;
  const n2 = turbulent ? fbm(S, S, rng, 3, 3, 3, 0.5) : null;
  const lumps = []; // smoke puffs: x, y, 1/r² (flat)
  if (kind === 'smoke') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 7) * TAU + rrange(rng, -0.3, 0.3);
      const r = i === 0 ? 0 : rrange(rng, 0.34, 0.52);
      const lr = i === 0 ? 0.7 : rrange(rng, 0.3, 0.44);
      lumps.push(Math.cos(a) * r, Math.sin(a) * r, 1 / (lr * lr));
    }
  }
  const gEdge = Math.exp(-3.6);
  for (let y = 0, i = 0, p = 0; y < S; y++) {
    for (let x = 0; x < S; x++, i++, p += 4) {
      const nx = (x - c) / c;
      const ny = (y - c) / c;
      const r = Math.sqrt(nx * nx + ny * ny);
      let a = 0;
      if (kind === 'glow') {
        a = (Math.exp(-3.6 * r * r) - gEdge) / (1 - gEdge);
      } else if (kind === 'spark') {
        a = Math.exp(-(r * r) / 0.0042) + 0.5 * Math.exp(-(r * r) / 0.05) + 0.14 * Math.exp(-(r * r) / 0.22);
        a *= 1 - smoothstep(0.7, 1, r);
      } else if (kind === 'dust') {
        const rw = r * (0.78 + (n2[i] - 0.5) * 1.1);
        a = (1 - smoothstep(0.08, 0.86, rw)) * (0.5 + n1[i] * 1.0) * 0.95;
        a = Math.min(0.9, a) * (1 - smoothstep(0.78, 1, r));
      } else {
        // billowing cluster of soft puffs: lumpy outline, dense but uneven interior
        let dens = 0;
        for (let l = 0; l < lumps.length; l += 3) {
          const lx = nx - lumps[l];
          const ly = ny - lumps[l + 1];
          const q = 1 - (lx * lx + ly * ly) * lumps[l + 2];
          if (q > 0) dens += q * q;
        }
        a = (1 - Math.exp(-1.8 * dens * (0.35 + n2[i] * 1.3))) * (0.5 + n1[i] * 1.0);
        a = Math.min(0.97, a) * (1 - smoothstep(0.8, 1, r));
      }
      d[p] = 255;
      d[p + 1] = 255;
      d[p + 2] = 255;
      d[p + 3] = clamp01(a) * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const REPEAT = 'repeat'; // tile both ways
const REPEAT_X = 'repeat-x';

/** name → { w, h, wrap?, data? (non-colour), cpu? (CPU-backed canvas), paint(ctx, w, h, rng) } */
const DEFS = Object.create(null);
const def = (name, w, h, paint, o = {}) => {
  DEFS[name] = { w, h, paint, ...o };
};
const tile = (name, paint, size = 512, o = {}) => def(name, size, size, (ctx, w, _h, rng) => paint(ctx, w, rng), { wrap: REPEAT, cpu: true, ...o });

// --- tileable colour maps
for (const name of ['wood_oak', 'wood_walnut', 'wood_pine', 'wood_white']) tile(name, (ctx, S, rng) => paintWood(ctx, S, rng, WOODS[name]));
tile('wood_raw', paintRawWood);
tile('hardboard', paintHardboard);
tile('metal_brushed', paintBrushed);
tile('metal_enamel', (ctx, S, rng) => paintGrain(ctx, S, rng, '#f1f2f0', { lo: 0.012, mid: 0.02, midCells: 46, white: 0.006 }));
tile('metal_dark', (ctx, S, rng) => paintGrain(ctx, S, rng, '#2b2d30', { lo: 0.04, mid: 0.2, midCells: 170, white: 0.16 }));
tile('plastic_dark', (ctx, S, rng) => paintGrain(ctx, S, rng, '#1b1c1e', { lo: 0.06, mid: 0.34, midCells: 128, white: 0.2 }));
tile('plastic_light', (ctx, S, rng) => paintGrain(ctx, S, rng, '#c5c7c9', { lo: 0.02, mid: 0.07, midCells: 128, white: 0.04 }));
tile('ceramic_raw', paintCeramicRaw);
tile('concrete', paintConcrete);
tile('fabric', paintFabric);
tile('rubber', (ctx, S, rng) => paintGrain(ctx, S, rng, '#252526', { lo: 0.09, mid: 0.16, midCells: 90, white: 0.1 }));
tile('drum_steel', paintDrumSteel);
tile('book_pages', paintBookPages);
tile('floor', paintFloor, 1024);

// --- tileable bump maps (mid-grey = flat)
tile('wood_bump', (ctx, S, rng) => blitGrey(ctx, S, S, woodValue(S, rng, WOOD_BUMP).v), 512, { data: true });
tile('brushed_bump', (ctx, S, rng) => {
  const v = brushedField(S, rng);
  for (let i = 0; i < v.length; i++) v[i] = 0.5 + v[i] * 0.3;
  blitGrey(ctx, S, S, v);
}, 512, { data: true });
tile('fabric_bump', (ctx, S, rng) => {
  const { h } = weaveField(S, rng);
  const wn = whiteNoise(S * S, rng);
  for (let i = 0; i < h.length; i++) h[i] = 0.14 + h[i] * 0.66 + (wn[i] - 0.5) * 0.06;
  blitGrey(ctx, S, S, h);
}, 512, { data: true });
tile('noise_bump', (ctx, S, rng) => {
  const { v } = grainField(S, rng, { loCells: 12, lo: 0.1, midCells: 128, mid: 0.5, white: 0.22 });
  for (let i = 0; i < v.length; i++) v[i] += 0.5;
  blitGrey(ctx, S, S, v);
}, 512, { data: true });
tile('floor_bump', paintFloorBump, 1024, { data: true });

// --- images / decals
def('ceramic_vase', 1024, 512, paintVase, { wrap: REPEAT_X });
def('screen_desktop', 1024, 576, paintDesktop);
def('screen_code', 1024, 640, paintCodeEditor);
def('screen_tv', 1024, 576, paintTV);
def('screen_glitch', 512, 288, paintGlitch, { cpu: true });
def('keyboard', 1024, 340, paintKeyboard);
def('laptop_keyboard', 1024, 420, paintLaptopKeyboard);
def('pcb_green', 512, 512, (ctx, w, _h, rng) => paintPCB(ctx, w, rng, PCB_PALETTES.green, false));
def('pcb_blue', 512, 512, (ctx, w, _h, rng) => paintPCB(ctx, w, rng, PCB_PALETTES.blue, true));
def('washer_panel', 1024, 160, paintWasherPanel);
def('picture', 512, 384, paintPicture, { cpu: true });
def('book_cover', 256, 512, paintBookCover, { cpu: true });

// --- particle sprites
for (const kind of ['dust', 'smoke', 'spark', 'glow']) def(`sprite_${kind}`, 128, 128, (ctx, w, _h, rng) => paintSprite(ctx, w, rng, kind), { cpu: true });

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** All valid texture names. */
export const TEXTURE_NAMES = Object.freeze(Object.keys(DEFS));

const cache = new Map();

/**
 * Get (and lazily create) a procedural texture by name.
 * @param {string} name one of TEXTURE_NAMES
 * @returns {THREE.CanvasTexture}
 */
export function getTexture(name) {
  let tex = cache.get(name);
  if (tex) return tex;
  const d = DEFS[name];
  if (!d) throw new Error(`textures: unknown texture "${name}"`);

  const canvas = makeCanvas(d.w, d.h);
  // pixel-pushed textures use a CPU-backed canvas; vector-drawn ones stay GPU-accelerated
  const ctx = canvas.getContext('2d', d.cpu ? { willReadFrequently: true } : undefined);
  d.paint(ctx, d.w, d.h, mulberry32(hashString(name)));

  tex = new THREE.CanvasTexture(canvas);
  tex.name = name;
  tex.colorSpace = d.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.wrapS = d.wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = d.wrap === REPEAT ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  cache.set(name, tex);
  return tex;
}
