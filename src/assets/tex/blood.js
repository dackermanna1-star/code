// Blood textures: splat / droplet decal atlases, a puddle "spread map" and the
// droplet / mist particle sheet. All RGBA, non-premultiplied, transparent background.
//
// Atlases are laid out row-major with cell (0,0) at the top-left of the image. The
// game uploads them as DataTextures without flipY, so image x = texture u and image
// row 0 = v 0. "Directional" cells are authored with their streaks pointing along
// +x (to the right) so the game can rotate them to a bullet / gravity direction.
//
//   decal_blood_splats  256x128  4x2 cells of 64: 0-2 round, 3-5 directional, 6-7 runs
//   decal_blood_drops   128x128  4x4 cells of 32: 0-7 round, 8-11 directional, 12-15 drip clusters
//   decal_blood_pool    256x128  2 cells of 128: DATA texture (not colours):
//                                 r = film thickness, g = gloss, b = spread order, a = coverage
//   spr_blood            64x64   2x2 cells of 32: 0 droplet, 1 droplet cluster, 2-3 mist puffs
import { Rng, fbm, clamp, smooth, makeImg, downsample, F32 } from './core.js';

const len = (x, y) => Math.sqrt(x * x + y * y);

/** Periodic angular noise in [-1,1]: sum of random sines in theta. */
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

const ZERO_NOISE = () => 0;

// ------------------------------------------------------------------ shape rasteriser
// Shapes (cell pixel units):
//   blob   { x, y, r, n?, amp?, a?, e? }  noisy disc, optionally stretched by e along angle a
//   streak { x, y, a, l, wd }             tapered line from (x,y) along a
//   run    { x, y, a, l, wd }             constant-width drip run with a bulb at the end
// Coverage is anti-aliased; "thickness" (0..1) darkens the centre of big blobs.
function rasterShapes(W, SS, shapes) {
  const w = W * SS;
  const cov = F32(w * w);
  const thick = F32(w * w);
  for (const sh of shapes) {
    let x0, x1, y0, y1;
    if (sh.type === 'blob') {
      const R = sh.r * (sh.e || 1) * 1.4 + 1;
      x0 = sh.x - R; x1 = sh.x + R; y0 = sh.y - R; y1 = sh.y + R;
    } else {
      const ex = sh.x + Math.cos(sh.a) * sh.l, ey = sh.y + Math.sin(sh.a) * sh.l;
      const pad = sh.wd * 2 + 2;
      x0 = Math.min(sh.x, ex) - pad; x1 = Math.max(sh.x, ex) + pad;
      y0 = Math.min(sh.y, ey) - pad; y1 = Math.max(sh.y, ey) + pad;
    }
    const px0 = Math.max(0, Math.floor(x0 * SS)), px1 = Math.min(w - 1, Math.ceil(x1 * SS));
    const py0 = Math.max(0, Math.floor(y0 * SS)), py1 = Math.min(w - 1, Math.ceil(y1 * SS));
    const ca = Math.cos(sh.a || 0), sa = Math.sin(sh.a || 0);
    const n = sh.n || ZERO_NOISE, amp = sh.amp ?? 0.3, e = sh.e || 1;
    for (let y = py0; y <= py1; y++)
      for (let x = px0; x <= px1; x++) {
        const i = y * w + x;
        const dx = (x + 0.5) / SS - sh.x, dy = (y + 0.5) / SS - sh.y;
        let cv, tv;
        if (sh.type === 'blob') {
          const al = (dx * ca + dy * sa) / e, pr = -dx * sa + dy * ca;
          const d = len(al, pr);
          const rr = sh.r * (1 + amp * n(Math.atan2(pr, al)));
          cv = clamp((rr - d) * SS * 0.5 + 0.5, 0, 1);
          tv = clamp(1 - d / rr, 0, 1);
        } else {
          const al = dx * ca + dy * sa, pr = -dx * sa + dy * ca;
          if (sh.type === 'streak') {
            if (al < 0 || al > sh.l) continue;
            const wd = sh.wd * (1 - al / sh.l) + 0.25;
            cv = clamp((wd - Math.abs(pr)) * SS * 0.5 + 0.5, 0, 1);
            tv = cv * 0.35;
          } else {
            // drip run: slightly wavy body, bulb at the end
            const a2 = clamp(al, 0, sh.l);
            const wd = sh.wd * (0.85 + 0.15 * Math.sin(a2 * 0.7 + sh.x));
            const body = al >= 0 && al <= sh.l ? wd - Math.abs(pr) : -9;
            const bx = al - sh.l, bulb = sh.wd * 1.45 - len(bx, pr);
            const s = Math.max(body, bulb);
            cv = clamp(s * SS * 0.5 + 0.5, 0, 1);
            tv = clamp(0.25 + (bulb > 0 ? 0.4 * bulb / (sh.wd * 1.45) : 0), 0, 1) * cv;
          }
        }
        if (cv > cov[i]) cov[i] = cv;
        if (tv > thick[i]) thick[i] = tv;
      }
  }
  return { w, cov, thick };
}

/** Colour a rasterised splat like a fresh blood stain (sunlit = 100 %). */
function paintSplat(W, SS, ras, seed, shade = 1) {
  const { w, cov, thick } = ras;
  const nz = fbm(w, w, { cx: Math.max(2, W / 8), oct: 3, seed: seed + 5 });
  const img = makeImg(w, w, true);
  for (let i = 0; i < w * w; i++) {
    const t = thick[i];
    const f = (0.85 + (nz[i] - 0.5) * 0.35) * shade;
    img.r[i] = (122 - 58 * t) * f;
    img.g[i] = (11 - 6 * t) * f;
    img.b[i] = (9 - 5 * t) * f;
    img.a[i] = cov[i] * (0.8 + 0.17 * t);
  }
  return downsample(img, SS);
}

function blit(dst, src, ox, oy) {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const s = y * src.w + x, d = (oy + y) * dst.w + ox + x;
      dst.r[d] = src.r[s];
      dst.g[d] = src.g[s];
      dst.b[d] = src.b[s];
      dst.a[d] = src.a[s];
    }
}

function atlas(cw, cols, rows, cellFn) {
  const img = makeImg(cw * cols, cw * rows, true);
  for (let k = 0; k < cols * rows; k++) blit(img, cellFn(k), (k % cols) * cw, Math.floor(k / cols) * cw);
  return img;
}

// ------------------------------------------------------------------ wall / floor splats (64 px cells)

function splatRound(seed) {
  const W = 64, SS = 2, rng = new Rng(seed);
  const cx = 32 + rng.range(-2, 2), cy = 32 + rng.range(-2, 2);
  const R = rng.range(7.5, 10.5);
  const shapes = [{ type: 'blob', x: cx, y: cy, r: R, n: angNoise(rng, 7, 3, 11), amp: 0.3 }];
  // a couple of secondary lumps merged into the main stain
  for (let k = 0; k < 3; k++) {
    const a = rng.range(0, Math.PI * 2), d = R * rng.range(0.5, 0.9);
    shapes.push({ type: 'blob', x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r: R * rng.range(0.35, 0.55), n: angNoise(rng, 4, 2, 7) });
  }
  const nd = rng.int(16, 26);
  for (let k = 0; k < nd; k++) {
    const a = rng.range(0, Math.PI * 2);
    const dist = R * rng.range(1.15, 2.7);
    const r = Math.max(0.5, rng.range(0.6, 2.6) * (1.25 - dist / (R * 3)));
    shapes.push({ type: 'blob', x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist, r, n: angNoise(rng, 3, 2, 6), a, e: rng.range(1, 1.8) });
  }
  const ns = rng.int(3, 7);
  for (let k = 0; k < ns; k++) shapes.push({ type: 'streak', x: cx, y: cy, a: rng.range(0, Math.PI * 2), l: R * rng.range(1.3, 2.6), wd: rng.range(0.9, 2) });
  return paintSplat(W, SS, rasterShapes(W, SS, shapes), seed);
}

// streaks and "exclamation mark" satellites flying towards +x
function splatDirectional(seed) {
  const W = 64, SS = 2, rng = new Rng(seed);
  const cx = 21 + rng.range(-2, 2), cy = 32 + rng.range(-2, 2);
  const R = rng.range(6.5, 8.5);
  const shapes = [{ type: 'blob', x: cx, y: cy, r: R, n: angNoise(rng, 6, 3, 10), amp: 0.25, a: 0, e: 1.35 }];
  shapes.push({ type: 'blob', x: cx + R * 0.9, y: cy + rng.range(-2, 2), r: R * 0.6, n: angNoise(rng, 4, 2, 7), a: 0, e: 1.5 });
  const nd = rng.int(18, 28);
  for (let k = 0; k < nd; k++) {
    const a = rng.gauss() * 0.32;
    const dist = R * rng.range(1.2, 4.6);
    const r = Math.max(0.5, rng.range(0.6, 2.2) * (1.3 - dist / (R * 5.5)));
    shapes.push({ type: 'blob', x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist, r, n: angNoise(rng, 3, 2, 6), a, e: rng.range(1.4, 2.6) });
  }
  const ns = rng.int(5, 9);
  for (let k = 0; k < ns; k++) shapes.push({ type: 'streak', x: cx, y: cy + rng.range(-3, 3), a: rng.gauss() * 0.22, l: R * rng.range(2.2, 4.4), wd: rng.range(0.8, 1.9) });
  // a few backward specks
  for (let k = 0; k < 4; k++) {
    const a = Math.PI + rng.gauss() * 0.8, dist = R * rng.range(1.1, 1.8);
    shapes.push({ type: 'blob', x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist, r: rng.range(0.5, 1.2) });
  }
  return paintSplat(W, SS, rasterShapes(W, SS, shapes), seed);
}

// stain with drip runs flowing towards +x (the game aligns +x with "down" on walls)
function splatRuns(seed) {
  const W = 64, SS = 2, rng = new Rng(seed);
  const cx = 19 + rng.range(-2, 2), cy = 32 + rng.range(-2, 2);
  const R = rng.range(8, 10);
  const shapes = [{ type: 'blob', x: cx, y: cy, r: R, n: angNoise(rng, 7, 3, 11), amp: 0.28 }];
  const nr = rng.int(3, 5);
  for (let k = 0; k < nr; k++) {
    const y = cy + (k / (nr - 1) - 0.5) * R * 1.3 + rng.range(-1.2, 1.2);
    shapes.push({ type: 'run', x: cx + R * 0.4, y, a: rng.range(-0.04, 0.04), l: rng.range(14, 36), wd: rng.range(0.9, 1.7) });
  }
  const nd = rng.int(10, 16);
  for (let k = 0; k < nd; k++) {
    const a = rng.range(0, Math.PI * 2), dist = R * rng.range(1.15, 2.3);
    shapes.push({ type: 'blob', x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist, r: rng.range(0.5, 1.8), n: angNoise(rng, 3, 2, 6) });
  }
  return paintSplat(W, SS, rasterShapes(W, SS, shapes), seed);
}

export function decalBloodSplats() {
  return atlas(64, 4, 2, (k) => {
    if (k < 3) return splatRound(5101 + k * 97);
    if (k < 6) return splatDirectional(5401 + k * 89);
    return splatRuns(5701 + k * 83);
  });
}

// ------------------------------------------------------------------ droplet stains (32 px cells)

function dropCell(seed, kind) {
  const W = 32, SS = 4, rng = new Rng(seed);
  const shapes = [];
  if (kind === 'round') {
    const cx = 16 + rng.range(-1, 1), cy = 16 + rng.range(-1, 1);
    const r = rng.range(2.6, 4.6);
    shapes.push({ type: 'blob', x: cx, y: cy, r, n: angNoise(rng, 5, 5, 14), amp: rng.range(0.12, 0.3) });
    const ns = rng.int(3, 9);
    for (let k = 0; k < ns; k++) {
      const a = rng.range(0, Math.PI * 2), d = r * rng.range(1.3, 2.4);
      shapes.push({ type: 'blob', x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r: rng.range(0.35, 0.9), a, e: rng.range(1, 1.8) });
    }
  } else if (kind === 'dir') {
    const cx = 12 + rng.range(-1, 1), cy = 16 + rng.range(-0.5, 0.5);
    const r = rng.range(2.4, 3.6);
    shapes.push({ type: 'blob', x: cx, y: cy, r, n: angNoise(rng, 4, 3, 9), amp: 0.15, a: 0, e: rng.range(1.4, 1.9) });
    shapes.push({ type: 'streak', x: cx, y: cy, a: rng.range(-0.05, 0.05), l: r * rng.range(2.4, 3.6), wd: r * 0.45 });
    const nt = rng.int(2, 4);
    for (let k = 0; k < nt; k++) {
      const d = r * rng.range(2.6, 4.2), a = rng.gauss() * 0.15;
      shapes.push({ type: 'blob', x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r: rng.range(0.4, 1.0), a, e: 1.6 });
    }
  } else {
    // drip cluster: several drops of different size around a main one
    const cx = 16, cy = 16;
    const nd = rng.int(4, 7);
    for (let k = 0; k < nd; k++) {
      const a = rng.range(0, Math.PI * 2), d = k === 0 ? 0 : rng.range(3, 10.5);
      const r = k === 0 ? rng.range(2.8, 4.2) : rng.range(0.9, 2.6);
      shapes.push({ type: 'blob', x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r, n: angNoise(rng, 5, 4, 12), amp: 0.2 });
      const ns = rng.int(1, 4);
      for (let j = 0; j < ns; j++) {
        const b = rng.range(0, Math.PI * 2), e = r * rng.range(1.3, 2);
        shapes.push({ type: 'blob', x: cx + Math.cos(a) * d + Math.cos(b) * e, y: cy + Math.sin(a) * d + Math.sin(b) * e, r: rng.range(0.3, 0.7) });
      }
    }
  }
  return paintSplat(W, SS, rasterShapes(W, SS, shapes), seed, 0.95);
}

export function decalBloodDrops() {
  return atlas(32, 4, 4, (k) => dropCell(6101 + k * 61, k < 8 ? 'round' : k < 12 ? 'dir' : 'drip'));
}

// ------------------------------------------------------------------ puddle spread map (128 px cells)

function poolCell(seed) {
  const W = 128, rng = new Rng(seed);
  const cx = 64, cy = 64;
  const R0 = 44;
  const lobes = [{ x: cx, y: cy, r: R0, n: angNoise(rng, 8, 2, 9), amp: 0.13 }];
  const nl = rng.int(3, 5);
  for (let k = 0; k < nl; k++) {
    const a = rng.range(0, Math.PI * 2), d = R0 * rng.range(0.45, 0.68);
    lobes.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r: R0 * rng.range(0.32, 0.48), n: angNoise(rng, 5, 2, 8), amp: 0.18 });
  }
  const warp = fbm(W, W, { cx: 6, oct: 4, gain: 0.55, seed: seed + 1 });
  const fine = fbm(W, W, { cx: 16, oct: 3, seed: seed + 2 });
  const img = makeImg(W, W, true);
  // highlight: soft window-like reflection up-left of centre
  const hx = cx - R0 * 0.28, hy = cy - R0 * 0.34;
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const px = x + 0.5, py = y + 0.5;
      // signed "inside" distance of the union (px)
      let s = -1e9;
      for (const L of lobes) {
        const dx = px - L.x, dy = py - L.y;
        const v = L.r * (1 + L.amp * L.n(Math.atan2(dy, dx))) - len(dx, dy);
        if (v > s) s = v;
      }
      s += (warp[i] - 0.5) * 7;
      const dc = len(px - cx, py - cy);
      const cov = clamp(s + 0.5, 0, 1);
      // spread order: 0 at the centre, 1 at the rim (homothetic front), a little noisy
      let order = s > 0 ? dc / (dc + s) : 1;
      order = clamp(order + (fine[i] - 0.5) * 0.06, 0, 0.97);
      const thick = smooth(0, 16, s) * (0.88 + 0.12 * fine[i]);
      // gloss: soft reflection + a thin bright meniscus on the lit (upper-left) rim
      const hdx = (px - hx) / 13, hdy = (py - hy) / 7;
      const hd = (hdx * 0.8 + hdy * 0.6) ** 2 + (-hdx * 0.6 + hdy * 0.8) ** 2;
      let gloss = Math.exp(-hd * 1.6) * 0.55 * smooth(2, 10, s);
      const rimDir = clamp(((cx - px) + (cy - py)) / (Math.SQRT2 * (dc + 1e-3)), 0, 1);
      gloss += smooth(0.8, 2.2, s) * (1 - smooth(2.2, 4.5, s)) * rimDir * 0.35;
      gloss *= 0.8 + 0.4 * fine[i];
      img.r[i] = thick * 255;
      img.g[i] = clamp(gloss, 0, 1) * 255;
      img.b[i] = order * 255;
      img.a[i] = cov;
    }
  return img;
}

export function decalBloodPool() {
  return atlas(128, 2, 1, (k) => poolCell(6801 + k * 131));
}

// ------------------------------------------------------------------ particle sheet (32 px cells)

function dropletSprite(seed, cluster) {
  const W = 32, SS = 2, rng = new Rng(seed);
  const shapes = [];
  if (!cluster) shapes.push({ type: 'blob', x: 16, y: 16, r: 11.5, n: angNoise(rng, 4, 2, 6), amp: 0.06 });
  else {
    shapes.push({ type: 'blob', x: 14, y: 17, r: 8.5, n: angNoise(rng, 4, 2, 6), amp: 0.12 });
    shapes.push({ type: 'blob', x: 22, y: 12, r: 5, n: angNoise(rng, 3, 2, 5), amp: 0.1 });
    shapes.push({ type: 'blob', x: 9, y: 8, r: 3.2 });
    shapes.push({ type: 'blob', x: 24, y: 23, r: 2.6 });
  }
  const ras = rasterShapes(W, SS, shapes);
  const w = ras.w;
  const img = makeImg(w, w, true);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = ras.thick[i];
      // wet highlight towards the top-left
      const hx = (x + 0.5) / SS - (cluster ? 11 : 12), hy = (y + 0.5) / SS - (cluster ? 13 : 11.5);
      const hl = Math.exp(-(hx * hx + hy * hy) / 7) * 0.8 * t;
      img.r[i] = 112 + 50 * t + 120 * hl;
      img.g[i] = 8 + 4 * t + 80 * hl;
      img.b[i] = 7 + 3 * t + 75 * hl;
      img.a[i] = ras.cov[i];
    }
  return downsample(img, SS);
}

function mistSprite(seed, ragged) {
  const W = 32;
  const n = fbm(W, W, { cx: 4, oct: 2, gain: 0.5, seed });
  const n2 = fbm(W, W, { cx: 6, oct: 1, seed: seed + 1 });
  const img = makeImg(W, W, true);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const X = (x + 0.5 - 16) / 15, Y = (y + 0.5 - 16) / 15;
      const d = len(X, Y);
      const m = d + (n[i] - 0.5) * 0.6 + (n2[i] - 0.5) * ragged;
      let a = smooth(1.0, 0.2, m) * (0.75 + 0.25 * n[i]);
      a *= 1 - smooth(0.8, 1, d);
      img.r[i] = 128 + 36 * n2[i];
      img.g[i] = 10 + 8 * n2[i];
      img.b[i] = 9 + 6 * n2[i];
      img.a[i] = clamp(a, 0, 1);
    }
  return img;
}

export function sprBlood() {
  return atlas(32, 2, 2, (k) => (k === 0 ? dropletSprite(7101, false) : k === 1 ? dropletSprite(7201, true) : mistSprite(7301 + k * 7, k === 3 ? 0.7 : 0.3)));
}
