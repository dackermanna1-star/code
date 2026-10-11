// Decals (RGBA, transparent background) and effect sprites.
// Additive glow sprites are drawn on black with opaque alpha (GoldSrc style:
// render them with additive blending).
import { Rng, fbm, sample, clamp, smooth, makeImg, downsample, F32 } from './core.js';

const len = (x, y) => Math.sqrt(x * x + y * y);

/** Periodic angular noise: sum of random sines in theta. */
function angNoise(rng, terms = 6, minF = 2, maxF = 12) {
  const t = [];
  for (let k = 0; k < terms; k++) t.push({ f: rng.int(minF, maxF), p: rng.range(0, Math.PI * 2), a: rng.range(0.3, 1) / (k + 1) ** 0.4 });
  const norm = t.reduce((s, q) => s + q.a, 0);
  return (th) => {
    let s = 0;
    for (const q of t) s += q.a * Math.sin(q.f * th + q.p);
    return s / norm;
  };
}

const RGB = [0, 0, 0];
/** Colour ramp lookup; returns a shared scratch [r,g,b] (copy it if you keep it). */
function ramp(stops, t) {
  t = clamp(t, 0, 1);
  for (let k = 1; k < stops.length; k++) {
    if (t <= stops[k][0]) {
      const s0 = stops[k - 1], s1 = stops[k];
      const c0 = s0[1], c1 = s1[1];
      const u = (t - s0[0]) / (s1[0] - s0[0]);
      RGB[0] = c0[0] + (c1[0] - c0[0]) * u;
      RGB[1] = c0[1] + (c1[1] - c0[1]) * u;
      RGB[2] = c0[2] + (c1[2] - c0[2]) * u;
      return RGB;
    }
  }
  const c = stops[stops.length - 1][1];
  RGB[0] = c[0];
  RGB[1] = c[1];
  RGB[2] = c[2];
  return RGB;
}

// ------------------------------------------------------------------ decals

export function decalBullet() {
  const W = 16, SS = 4, w = W * SS;
  const rng = new Rng(3001);
  const an = angNoise(rng, 6, 3, 9);
  const an2 = angNoise(rng, 5, 5, 14);
  const img = makeImg(w, w, true);
  const cx = 8, cy = 8;
  const cracks = [];
  for (let k = 0; k < 5; k++) cracks.push({ a: rng.range(0, Math.PI * 2), l: rng.range(4.5, 7) });
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const X = (x + 0.5) / SS - cx, Y = (y + 0.5) / SS - cy;
      const d = len(X, Y), th = Math.atan2(Y, X);
      const hole = 1.7 * (1 + 0.18 * an(th));
      const rim = 4.1 * (1 + 0.22 * an2(th));
      let r = 0, g = 0, b = 0, a = 0;
      if (d < hole) {
        const t = d / hole;
        r = 16 + 30 * t;
        g = 13 + 25 * t;
        b = 11 + 20 * t;
        a = 1;
      } else if (d < rim) {
        const t = (d - hole) / (rim - hole);
        // inner dark bevel, then light powdered fringe
        const lit = smooth(0, 0.35, t) * (1 - smooth(0.5, 1, t));
        const v = 55 + 85 * lit;
        r = v * 1.03;
        g = v * 0.98;
        b = v * 0.88;
        a = (1 - smooth(0.45, 1, t)) * 0.85;
      }
      for (const c of cracks) {
        let da = Math.abs(th - c.a);
        da = Math.min(da, Math.PI * 2 - da);
        const cd = da * d;
        if (d > hole && d < c.l && cd < 0.35) {
          const ca = (1 - d / c.l) * 0.8;
          if (ca > a * 0.6) {
            r = 40;
            g = 34;
            b = 30;
            a = Math.max(a, ca);
          }
        }
      }
      img.r[i] = r;
      img.g[i] = g;
      img.b[i] = b;
      img.a[i] = a;
    }
  return downsample(img, SS);
}

function bloodSplat(seed, kind) {
  const W = 64, SS = 2, w = W * SS;
  const rng = new Rng(seed);
  const cov = F32(w * w);
  const thick = F32(w * w);
  const shapes = [];
  const cx = 32 + rng.range(-3, 3), cy = 32 + rng.range(-3, 3);
  const dir = rng.range(0, Math.PI * 2);
  const R = kind === 2 ? 7 : kind === 1 ? 9 : 11;
  const main = angNoise(rng, 7, 3, 11);
  shapes.push({ type: 'blob', x: cx, y: cy, r: R, n: main });
  const nd = kind === 2 ? 26 : 18;
  for (let k = 0; k < nd; k++) {
    let a = rng.range(0, Math.PI * 2);
    if (kind === 1) a = dir + rng.gauss() * 0.45;
    const dist = R * rng.range(1.0, kind === 2 ? 2.8 : 2.4);
    const r = rng.range(0.6, kind === 2 ? 2.2 : 2.8) * (1.2 - dist / (R * 3));
    shapes.push({ type: 'blob', x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist, r: Math.max(0.5, r), n: angNoise(rng, 3, 2, 6) });
  }
  const ns = kind === 1 ? 9 : kind === 0 ? 6 : 3;
  for (let k = 0; k < ns; k++) {
    let a = rng.range(0, Math.PI * 2);
    if (kind === 1) a = dir + rng.gauss() * 0.3;
    const l = R * rng.range(1.3, 2.7);
    shapes.push({ type: 'streak', x: cx, y: cy, a, l, wd: rng.range(1, 2.2) });
  }
  // rasterise each shape over its own bounding box only
  for (const sh of shapes) {
    let x0, x1, y0, y1;
    if (sh.type === 'blob') {
      const R = sh.r * 1.35 + 1;
      x0 = sh.x - R;
      x1 = sh.x + R;
      y0 = sh.y - R;
      y1 = sh.y + R;
    } else {
      const ex = sh.x + Math.cos(sh.a) * sh.l, ey = sh.y + Math.sin(sh.a) * sh.l;
      x0 = Math.min(sh.x, ex) - 3;
      x1 = Math.max(sh.x, ex) + 3;
      y0 = Math.min(sh.y, ey) - 3;
      y1 = Math.max(sh.y, ey) + 3;
    }
    const px0 = Math.max(0, Math.floor(x0 * SS)), px1 = Math.min(w - 1, Math.ceil(x1 * SS));
    const py0 = Math.max(0, Math.floor(y0 * SS)), py1 = Math.min(w - 1, Math.ceil(y1 * SS));
    const ca = Math.cos(sh.a || 0), sa = Math.sin(sh.a || 0);
    for (let y = py0; y <= py1; y++)
      for (let x = px0; x <= px1; x++) {
        const i = y * w + x;
        const dx = (x + 0.5) / SS - sh.x, dy = (y + 0.5) / SS - sh.y;
        let cv, tv;
        if (sh.type === 'blob') {
          const d = len(dx, dy);
          const rr = sh.r * (1 + 0.3 * sh.n(Math.atan2(dy, dx)));
          cv = clamp((rr - d) * 2, 0, 1);
          tv = clamp(1 - d / rr, 0, 1);
        } else {
          const al = dx * ca + dy * sa, pr = -dx * sa + dy * ca;
          if (al < 0 || al > sh.l) continue;
          const wd = sh.wd * (1 - al / sh.l) + 0.3;
          cv = clamp((wd - Math.abs(pr)) * 2, 0, 1);
          tv = cv * 0.4;
        }
        if (cv > cov[i]) cov[i] = cv;
        if (tv > thick[i]) thick[i] = tv;
      }
  }
  const nz = fbm(w, w, { cx: 8, oct: 3, seed: seed + 5 });
  const img = makeImg(w, w, true);
  for (let i = 0; i < w * w; i++) {
    const t = thick[i];
    const f = 0.85 + (nz[i] - 0.5) * 0.35;
    img.r[i] = (118 - 50 * t) * f;
    img.g[i] = (10 - 5 * t) * f;
    img.b[i] = (8 - 4 * t) * f;
    img.a[i] = cov[i] * (0.82 + 0.15 * t);
  }
  return downsample(img, SS);
}
export const decalBlood1 = () => bloodSplat(3101, 0);
export const decalBlood2 = () => bloodSplat(3201, 1);
export const decalBlood3 = () => bloodSplat(3301, 2);

export function decalScorch() {
  const W = 128, S = 3401;
  const rng = new Rng(S);
  const an = angNoise(rng, 8, 3, 13);
  const streak = angNoise(rng, 10, 14, 40);
  const nz = fbm(W, W, { cx: 6, oct: 5, gain: 0.6, seed: S + 1 });
  const fine = fbm(W, W, { cx: 32, oct: 2, seed: S + 2 });
  const img = makeImg(W, W, true);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const X = x + 0.5 - 64, Y = y + 0.5 - 64;
      const d = len(X, Y) / 58, th = Math.atan2(Y, X);
      const rr = 0.78 * (1 + 0.18 * an(th)) * (1 + 0.12 * streak(th));
      let a = 1 - smooth(0.15, 1, d / rr);
      a = Math.pow(a, 0.8) * (0.7 + 0.6 * (nz[i] - 0.5) + 0.3);
      a *= 0.9 + (fine[i] - 0.5) * 0.3;
      a = clamp(a, 0, 0.95);
      const t = clamp(d / rr, 0, 1);
      img.r[i] = 14 + 40 * t;
      img.g[i] = 12 + 30 * t;
      img.b[i] = 10 + 20 * t;
      img.a[i] = a * (1 - smooth(0.9, 1, d));
    }
  return img;
}

// ------------------------------------------------------------------ additive sprites

const FIRE = [
  [0, [0, 0, 0]],
  [0.15, [110, 30, 4]],
  [0.35, [220, 95, 18]],
  [0.6, [255, 170, 50]],
  [0.82, [255, 225, 120]],
  [1, [255, 252, 225]],
];

function glowImg(W, fn) {
  const img = makeImg(W, W, true);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const c = fn(x + 0.5, y + 0.5, i);
      img.r[i] = c[0];
      img.g[i] = c[1];
      img.b[i] = c[2];
      img.a[i] = 1;
    }
  return img;
}

function muzzle(seed, spikes, irregular) {
  const W = 64, rng = new Rng(seed);
  const sp = [];
  const a0 = rng.range(0, Math.PI * 2);
  for (let k = 0; k < spikes; k++)
    sp.push({ a: a0 + (k / spikes) * Math.PI * 2 + (irregular ? rng.range(-0.35, 0.35) : 0), l: rng.range(0.55, 1) * (irregular ? rng.range(0.6, 1.1) : 1), p: rng.range(18, 40) });
  const nz = fbm(W, W, { cx: 4, oct: 4, gain: 0.6, seed: seed + 1 });
  const an = angNoise(rng, 6, 5, 16);
  return glowImg(W, (x, y, i) => {
    const X = (x - 32) / 30, Y = (y - 32) / 30;
    const d = len(X, Y), th = Math.atan2(Y, X);
    let r = 0.22 * (1 + 0.25 * an(th));
    for (const s of sp) {
      const c = Math.cos(th - s.a);
      if (c > 0) r += s.l * Math.pow(c, s.p);
    }
    let I = Math.exp(-((d / r) ** 2) * 2.2) * (0.75 + 0.5 * nz[i]);
    I += Math.exp(-((d / 0.13) ** 2)) * 0.8;
    I *= 1 - smooth(0.85, 1, d);
    return ramp(FIRE, I);
  });
}
export const sprMuzzle1 = () => muzzle(3501, 4, false);
export const sprMuzzle2 = () => muzzle(3601, 6, false);
export const sprMuzzle3 = () => muzzle(3701, 7, true);

export function sprSpark() {
  const W = 32, rng = new Rng(3801);
  const rays = [];
  for (let k = 0; k < 6; k++) rays.push({ a: rng.range(0, Math.PI * 2), l: rng.range(0.5, 1) });
  return glowImg(W, (x, y) => {
    const X = (x - 16) / 15, Y = (y - 16) / 15;
    const d = len(X, Y), th = Math.atan2(Y, X);
    let I = Math.exp(-((d / 0.16) ** 2)) * 1.1 + Math.exp(-((d / 0.4) ** 2)) * 0.25;
    for (const r of rays) {
      let da = Math.abs(th - r.a);
      da = Math.min(da, Math.PI * 2 - da);
      const wd = 0.035 + 0.02 * (1 - d);
      if (d < r.l) I += Math.exp(-(((da * d) / wd) ** 2)) * (1 - d / r.l) * 0.9;
    }
    I *= 1 - smooth(0.85, 1, d);
    return ramp(
      [
        [0, [0, 0, 0]],
        [0.25, [160, 80, 10]],
        [0.55, [255, 190, 70]],
        [0.8, [255, 240, 170]],
        [1, [255, 255, 240]],
      ],
      I
    );
  });
}

export function sprFlare() {
  return glowImg(32, (x, y) => {
    const d = len(x - 16, y - 16);
    let I = Math.exp(-((d / 2.2) ** 2)) * 0.9 + Math.exp(-((d / 6) ** 2)) * 0.45 + Math.exp(-((d / 12) ** 2)) * 0.15;
    I *= 1 - smooth(13, 16, d);
    const v = clamp(I, 0, 1) * 255;
    RGB[0] = v;
    RGB[1] = v * 0.97;
    RGB[2] = v * 0.92;
    return RGB;
  });
}

export function sprExplosion() {
  const W = 256, F = 64, S = 3901;
  const n1 = fbm(128, 128, { cx: 4, oct: 5, gain: 0.55, seed: S + 1 });
  const n2 = fbm(128, 128, { cx: 8, oct: 4, gain: 0.55, seed: S + 2 });
  const img = makeImg(W, W, true);
  for (let f = 0; f < 16; f++) {
    const t = f / 15;
    const ox = (f % 4) * F, oy = Math.floor(f / 4) * F;
    // fireball grows fast, then cools from white-yellow to dull red and fades
    const R = 0.42 + 0.5 * Math.sqrt(t);
    const cool = t * 0.62;
    for (let y = 0; y < F; y++)
      for (let x = 0; x < F; x++) {
        const X = (x + 0.5 - 32) / 30, Y = (y + 0.5 - 32) / 30;
        const d = len(X, Y);
        // billowing: noise scrolls outward as the fireball grows
        const sc = 34 / (0.7 + t);
        const nv = sample(n1, 128, 128, X * sc + 64 + f * 1.7, Y * sc + 64 - f * 2.3);
        const nv2 = sample(n2, 128, 128, X * sc * 1.7 + 30, Y * sc * 1.7 + 20 + f * 3);
        const edge = R * (0.7 + 0.6 * nv);
        const q = d / edge;
        let heat = (1 - q * q) * 1.08 + (nv2 - 0.5) * 0.7 * (0.5 + t);
        heat -= cool;
        heat += (1 - t) * 0.4 * Math.exp(-((d / 0.25) ** 2));
        heat *= 1 - smooth(0.9, 1, d);
        const fadeOut = 1 - Math.pow(t, 2.2) * 0.75;
        const c = ramp(FIRE, heat);
        const i = (oy + y) * W + ox + x;
        img.r[i] = c[0] * fadeOut;
        img.g[i] = c[1] * fadeOut;
        img.b[i] = c[2] * fadeOut;
        img.a[i] = 1;
      }
  }
  return img;
}

// ------------------------------------------------------------------ alpha puffs

function puff(seed, col, ragged) {
  const W = 64;
  const n = fbm(W, W, { cx: 4, oct: 5, gain: 0.6, seed });
  const n2 = fbm(W, W, { cx: 12, oct: 3, seed: seed + 1 });
  const img = makeImg(W, W, true);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const X = (x + 0.5 - 32) / 30, Y = (y + 0.5 - 32) / 30;
      const d = len(X, Y);
      const m = d + (n[i] - 0.5) * 0.7 + (n2[i] - 0.5) * ragged;
      let a = smooth(1.0, 0.3, m) * (0.72 + 0.28 * n[i]);
      a *= 1 - smooth(0.85, 1, d);
      // lit from the top-left
      const lit = 1 + (-X - Y) * 0.12 + (n[i] - 0.5) * 0.35;
      img.r[i] = col[0] * lit;
      img.g[i] = col[1] * lit;
      img.b[i] = col[2] * lit;
      img.a[i] = clamp(a * 0.92, 0, 1);
    }
  return img;
}
export const sprSmoke = () => puff(4001, [150, 148, 144], 0.25);
export const sprDust = () => puff(4101, [206, 176, 128], 0.6);
