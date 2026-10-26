// Procedural canvas textures. Everything visual in the game is generated at
// runtime so the project ships without binary assets.
import * as THREE from 'three';
import { seeded } from './utils.js';

const cache = new Map();
let maxAniso = 8;
export function setMaxAnisotropy(v) { maxAniso = v; }

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function toTexture(c, { repeat = [1, 1], srgb = true, wrap = true, aniso = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.repeat.set(repeat[0], repeat[1]);
  if (aniso) t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

export function cached(key, fn) {
  if (cache.has(key)) return cache.get(key);
  const v = fn();
  cache.set(key, v);
  return v;
}

// ---------- value noise ----------
function makeNoise(seed, period) {
  const rnd = seeded(seed);
  const n = period;
  const grid = new Float32Array(n * n);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const at = (x, y) => grid[((y % n + n) % n) * n + ((x % n + n) % n)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
export function fbm(noise, x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); norm += a; a *= 0.5; f *= 2; }
  return s / norm;
}

function hex(c) { return '#' + new THREE.Color(c).getHexString(); }
function shade(c, k) {
  const col = new THREE.Color(c);
  const hsl = {}; col.getHSL(hsl);
  col.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * k)));
  return '#' + col.getHexString();
}
export { hex, shade };

function noiseOverlay(ctx, w, h, amount = 0.06, seed = 1, scale = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const rnd = seeded(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 255 * amount * scale;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// ---------- wood floor (planks) ----------
export function woodFloor({ base = '#b98a5e', seed = 3, planks = 6, herringbone = false } = {}) {
  return cached(`wood:${base}:${seed}:${planks}:${herringbone}`, () => {
    const S = 1024;
    const c = canvas(S, S); const ctx = c.getContext('2d');
    const rough = canvas(S, S); const rctx = rough.getContext('2d');
    const rnd = seeded(seed);
    const noise = makeNoise(seed, 64);
    const img = ctx.createImageData(S, S);
    const rimg = rctx.createImageData(S, S);
    const baseCol = new THREE.Color(base);
    const pw = S / planks;
    const plankShade = [];
    const plankOffset = [];
    for (let i = 0; i < planks * 4; i++) { plankShade.push(0.82 + rnd() * 0.3); plankOffset.push(rnd() * S); }
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let px, py, row, gapX, gapY;
        if (herringbone) {
          // simple chevron-ish layout: alternate plank direction per block
          const bs = S / 4;
          const bx = Math.floor(x / bs), by = Math.floor(y / bs);
          const flip = (bx + by) % 2 === 0;
          const lx = x % bs, ly = y % bs;
          const pwh = bs / 3;
          if (flip) { row = Math.floor(lx / pwh) + bx * 3 + by * 7; px = ly; py = lx % pwh; gapY = py < 2 || py > pwh - 2; gapX = ly < 2; }
          else { row = Math.floor(ly / pwh) + bx * 5 + by * 3; px = lx; py = ly % pwh; gapY = py < 2 || py > pwh - 2; gapX = lx < 2; }
        } else {
          row = Math.floor(y / pw);
          py = y % pw;
          const len = S * 0.5;
          const off = plankOffset[row % plankOffset.length];
          px = (x + off) % S;
          gapY = py < 2 || py > pw - 2;
          gapX = (px % len) < 2;
        }
        const k = plankShade[Math.abs(row) % plankShade.length];
        const grain = fbm(noise, px * 0.012 + row * 13.1, py * 0.09 + row * 3.7, 4);
        const ring = Math.sin((grain * 18 + py * 0.05) * 1.0) * 0.5 + 0.5;
        let v = k * (0.86 + grain * 0.22 + ring * 0.08);
        if (gapX || gapY) v *= 0.55;
        const i = (y * S + x) * 4;
        img.data[i] = Math.min(255, baseCol.r * 255 * v * 1.05);
        img.data[i + 1] = Math.min(255, baseCol.g * 255 * v);
        img.data[i + 2] = Math.min(255, baseCol.b * 255 * v * 0.95);
        img.data[i + 3] = 255;
        const r = (gapX || gapY) ? 255 : 140 + ring * 40 + grain * 40;
        rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = r; rimg.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    rctx.putImageData(rimg, 0, 0);
    return { map: toTexture(c), roughnessMap: toTexture(rough, { srgb: false }) };
  });
}

// ---------- tiles ----------
export function tiles({ base = '#e9e6e1', grout = '#bdb8b0', cols = 4, rows = 4, seed = 5, variation = 0.05, marble = false, hexPattern = false } = {}) {
  return cached(`tiles:${base}:${grout}:${cols}:${rows}:${seed}:${marble}:${hexPattern}`, () => {
    const S = 1024;
    const c = canvas(S, S); const ctx = c.getContext('2d');
    const rough = canvas(S, S); const rctx = rough.getContext('2d');
    const rnd = seeded(seed);
    const noise = makeNoise(seed + 7, 32);
    ctx.fillStyle = grout; ctx.fillRect(0, 0, S, S);
    rctx.fillStyle = '#fff'; rctx.fillRect(0, 0, S, S);
    const tw = S / cols, th = S / rows, g = 5;
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        const k = 1 + (rnd() - 0.5) * variation * 2;
        ctx.fillStyle = shade(base, k);
        const ox = (hexPattern && r % 2) ? tw / 2 : 0;
        for (const dx of [0, -S]) {
          ctx.fillRect(q * tw + g / 2 + ox + dx, r * th + g / 2, tw - g, th - g);
          rctx.fillStyle = '#5a5a5a';
          rctx.fillRect(q * tw + g / 2 + ox + dx, r * th + g / 2, tw - g, th - g);
        }
      }
    }
    if (marble) {
      const img = ctx.getImageData(0, 0, S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const n = fbm(noise, x / 90, y / 90, 5);
        const vein = Math.pow(1 - Math.abs(Math.sin((x * 0.004 + y * 0.006 + n * 5) * Math.PI)), 12);
        const i = (y * S + x) * 4;
        const dv = -vein * 70 - n * 10;
        img.data[i] += dv; img.data[i + 1] += dv; img.data[i + 2] += dv * 0.9;
      }
      ctx.putImageData(img, 0, 0);
    } else noiseOverlay(ctx, S, S, 0.03, seed);
    return { map: toTexture(c), roughnessMap: toTexture(rough, { srgb: false }) };
  });
}

// ---------- plaster / paint ----------
export function plaster({ seed = 9 } = {}) {
  return cached(`plaster:${seed}`, () => {
    const S = 512;
    const c = canvas(S, S); const ctx = c.getContext('2d');
    const noise = makeNoise(seed, 32);
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = fbm(noise, x / 40, y / 40, 4);
      const v = 236 + (n - 0.5) * 22 + (Math.random() - 0.5) * 6;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c);
  });
}

// ---------- fabric weave ----------
export function fabric({ base = '#888', seed = 2, scale = 4, knit = false } = {}) {
  return cached(`fabric:${base}:${seed}:${scale}:${knit}`, () => {
    const S = 256;
    const c = canvas(S, S); const ctx = c.getContext('2d');
    const col = new THREE.Color(base);
    const img = ctx.createImageData(S, S);
    const rnd = seeded(seed);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let w;
      if (knit) {
        const cx = (x % 8) - 4, cy = (y % 6);
        w = 0.85 + 0.15 * Math.cos((cx * cx * 0.08 + cy * 0.6));
      } else {
        const a = Math.sin(x * Math.PI / scale) * Math.sin(y * Math.PI / scale);
        w = 0.9 + a * 0.08;
      }
      const n = (rnd() - 0.5) * 0.08;
      const v = w + n;
      const i = (y * S + x) * 4;
      img.data[i] = Math.min(255, col.r * 255 * v);
      img.data[i + 1] = Math.min(255, col.g * 255 * v);
      img.data[i + 2] = Math.min(255, col.b * 255 * v);
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, { repeat: [4, 4] });
  });
}

// generic fine noise used as bump/roughness detail
export function grain(seed = 1, size = 256, contrast = 0.5) {
  return cached(`grain:${seed}:${size}:${contrast}`, () => {
    const c = canvas(size, size); const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const noise = makeNoise(seed, 32);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = 128 + (fbm(noise, x / 12, y / 12, 3) - 0.5) * 255 * contrast + (Math.random() - 0.5) * 30;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, { srgb: false });
  });
}

export function marble({ base = '#f2f0ec', vein = '#9a958d', seed = 4 } = {}) {
  return cached(`marble:${base}:${vein}:${seed}`, () => {
    const S = 512;
    const c = canvas(S, S); const ctx = c.getContext('2d');
    const noise = makeNoise(seed, 32);
    const b = new THREE.Color(base), v = new THREE.Color(vein);
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = fbm(noise, x / 70, y / 70, 5);
      const t = Math.pow(1 - Math.abs(Math.sin((x * 0.006 + y * 0.003 + n * 4) * Math.PI)), 10) * 0.8;
      const i = (y * S + x) * 4;
      img.data[i] = (b.r + (v.r - b.r) * t) * 255;
      img.data[i + 1] = (b.g + (v.g - b.g) * t) * 255;
      img.data[i + 2] = (b.b + (v.b - b.b) * t) * 255;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c);
  });
}

// ---------- city window facades ----------
export function facade({ seed = 1, cols = 8, rows = 16, base = '#4a5160', glass = '#20283a', style = 0 } = {}) {
  return cached(`facade:${seed}:${cols}:${rows}:${base}:${style}`, () => {
    const W = 256, H = 512;
    const c = canvas(W, H); const ctx = c.getContext('2d');
    const e = canvas(W, H); const ectx = e.getContext('2d');
    const rnd = seeded(seed);
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    ectx.fillStyle = '#000'; ectx.fillRect(0, 0, W, H);
    const cw = W / cols, rh = H / rows;
    const warm = ['#ffd9a0', '#ffe7c2', '#fff1d6', '#ffc98a', '#cfe3ff', '#ffe0b0'];
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        const x = q * cw, y = r * rh;
        let gx = 2, gy = 3, gw = cw - 4, gh = rh - 6;
        if (style === 1) { gx = 0.5; gw = cw - 1; gy = 1; gh = rh - 2; }
        if (style === 2) { gx = 3; gw = cw - 6; gy = 2; gh = rh - 8; }
        const g = ctx.createLinearGradient(x, y, x, y + rh);
        g.addColorStop(0, shade(glass, 1.4)); g.addColorStop(1, glass);
        ctx.fillStyle = g;
        ctx.fillRect(x + gx, y + gy, gw, gh);
        if (rnd() < 0.42) {
          const col = warm[Math.floor(rnd() * warm.length)];
          const k = 0.35 + rnd() * 0.65;
          ectx.globalAlpha = k;
          ectx.fillStyle = col;
          ectx.fillRect(x + gx, y + gy, gw, gh);
          // blinds / silhouettes
          if (rnd() < 0.3) { ectx.fillStyle = '#000'; ectx.globalAlpha = 0.5; ectx.fillRect(x + gx, y + gy, gw, gh * rnd() * 0.6); }
          ectx.globalAlpha = 1;
        }
      }
    }
    noiseOverlay(ctx, W, H, 0.04, seed);
    const map = toTexture(c); const emissiveMap = toTexture(e);
    return { map, emissiveMap };
  });
}

// ---------- soft radial gradient sprites ----------
export function radial({ inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128 } = {}) {
  return cached(`radial:${inner}:${outer}:${size}`, () => {
    const c = canvas(size, size); const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    return toTexture(c, { wrap: false });
  });
}

export function cloudSprite(seed = 1) {
  return cached(`cloud:${seed}`, () => {
    const S = 256;
    const c = canvas(S, S); const ctx = c.getContext('2d');
    const rnd = seeded(seed);
    for (let i = 0; i < 28; i++) {
      const x = S * (0.2 + rnd() * 0.6), y = S * (0.35 + rnd() * 0.3), r = S * (0.08 + rnd() * 0.16);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    return toTexture(c, { wrap: false });
  });
}

// ---------- text / label textures ----------
export function labelTexture(key, w, h, draw, opts = {}) {
  return cached(`label:${key}:${w}:${h}`, () => {
    const c = canvas(w, h); const ctx = c.getContext('2d');
    draw(ctx, w, h);
    return toTexture(c, { wrap: false, ...opts });
  });
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export const FONT = '"Inter Variable", Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
