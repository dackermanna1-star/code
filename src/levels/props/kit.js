// Prop toolkit: materials, procedural textures (decal atlas, alpha cards, tiling
// canvases) and geometry helpers shared by the static prop library.
// All geometry is emitted through the LevelBuilder (quads/boxes) or the raw
// triangle emitter below, in the builder's current local transform.
import * as THREE from 'three';
import { SURF } from '../../engine/collision.js';
import { mulberry32, hashStr, canvasFor } from '../../engine/textures.js';

export { SURF };
export const PI = Math.PI, TAU = Math.PI * 2, HP = Math.PI / 2;
export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const V = V3;
const toV = (p) => (p.isVector3 ? p : V(p[0], p[1], p[2]));

// ---------------------------------------------------------------- colours
/** hex | [r,g,b] | css string -> [r,g,b] (0..1) or null */
export function rgb(c) {
  if (c === undefined || c === null || c === false) return null;
  if (Array.isArray(c)) return c;
  if (typeof c === 'string') { const k = new THREE.Color(c); return [k.r, k.g, k.b]; }
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
}
export function mul(c, k) { const a = rgb(c); return [a[0] * k, a[1] * k, a[2] * k]; }
export function mix(a, b, t) { const p = rgb(a), q = rgb(b); return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]; }
export function rng(seed) { return mulberry32(seed >>> 0); }
export function pick(r, arr) { return arr[(r() * arr.length) | 0]; }
export function range(r, a, b) { return a + (b - a) * r(); }

export const PALETTE = {
  car: [0x8a1c1c, 0x1c3a6a, 0xd8d4c8, 0x2a2a2c, 0x5a6a4a, 0x9a8a5a, 0x6a6e72, 0x3a2418, 0x7a5a8a, 0x2a5a5a, 0xb0a890],
  cloth: [0x3a4a6a, 0x6a2a24, 0x2a2a2a, 0x8a8a7a, 0x4a5a3a, 0xa08a6a, 0x6a6a8a, 0x8a3a5a, 0xd0ccc0, 0x2a3a4a],
  pants: [0x2a3248, 0x3a3226, 0x1e1e20, 0x5a5040, 0x4a4a52, 0x6a5a40],
  skin: [0xe8c0a0, 0xd0a080, 0xa87a58, 0x7a5236, 0x5a3a26, 0xc8a890],
  fabric: [0x7a2a2a, 0x2a4a6a, 0x5a6a3a, 0x8a7a5a, 0x6a4a6a, 0x3a3a3a, 0xa08060],
};

// ---------------------------------------------------------------- canvases
const TEX = new Map();
function mkCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}
function canvasTex(c, clamp = false) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}
const css = (c) => (typeof c === 'string' ? c : '#' + (c >>> 0).toString(16).padStart(6, '0'));

/** Drawing helpers bound to a rectangular region of a canvas. */
function painter(ctx, ox, oy, w, h, r) {
  const g = {
    ctx, w, h, r, ox, oy,
    fill(c, x = 0, y = 0, ww = w, hh = h) { ctx.fillStyle = css(c); ctx.fillRect(ox + x, oy + y, ww, hh); },
    clear() { ctx.clearRect(ox, oy, w, h); },
    rect(c, x, y, ww, hh) { ctx.fillStyle = css(c); ctx.fillRect(ox + x, oy + y, ww, hh); },
    stroke(c, x, y, ww, hh, lw = 1) { ctx.strokeStyle = css(c); ctx.lineWidth = lw; ctx.strokeRect(ox + x + 0.5, oy + y + 0.5, ww - 1, hh - 1); },
    circle(c, x, y, rad) { ctx.fillStyle = css(c); ctx.beginPath(); ctx.arc(ox + x, oy + y, rad, 0, TAU); ctx.fill(); },
    ring(c, x, y, rad, lw) { ctx.strokeStyle = css(c); ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(ox + x, oy + y, rad, 0, TAU); ctx.stroke(); },
    line(c, x0, y0, x1, y1, lw = 1) { ctx.strokeStyle = css(c); ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(ox + x0, oy + y0); ctx.lineTo(ox + x1, oy + y1); ctx.stroke(); },
    poly(c, pts) { ctx.fillStyle = css(c); ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(ox + x, oy + y) : ctx.moveTo(ox + x, oy + y))); ctx.closePath(); ctx.fill(); },
    text(s, x, y, size, c, opts = {}) {
      ctx.font = `${opts.weight || 'bold'} ${size}px ${opts.font || 'sans-serif'}`;
      ctx.textAlign = opts.align || 'center'; ctx.textBaseline = 'middle';
      let sx = 1;
      if (opts.maxW) { const mw = ctx.measureText(s).width; if (mw > opts.maxW) sx = opts.maxW / mw; }
      ctx.save(); ctx.translate(ox + x, oy + y); ctx.scale(sx, 1);
      if (opts.outline) { ctx.strokeStyle = css(opts.outline); ctx.lineWidth = opts.outlineW || 2; ctx.lineJoin = 'round'; ctx.strokeText(s, 0, 0); }
      ctx.fillStyle = css(c); ctx.fillText(s, 0, 0); ctx.restore();
    },
    noise(amt, mono = true) {
      const img = ctx.getImageData(ox, oy, w, h); const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        const n = (r() - 0.5) * amt;
        if (mono) { d[i] += n; d[i + 1] += n; d[i + 2] += n; } else { d[i] += (r() - 0.5) * amt; d[i + 1] += (r() - 0.5) * amt; d[i + 2] += (r() - 0.5) * amt; }
      }
      ctx.putImageData(img, ox, oy);
    },
    stains(c, n, alpha, maxR) {
      ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, w, h); ctx.clip();
      ctx.fillStyle = css(c);
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = alpha * (0.4 + r() * 0.6);
        const x = r() * w, y = r() * h, rr = 1 + r() * maxR;
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(ox + x + (r() - 0.5) * rr, oy + y + (r() - 0.5) * rr, rr * (0.3 + r() * 0.5), 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    },
    crisp() {
      const img = ctx.getImageData(ox, oy, w, h); const d = img.data;
      for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0;
      ctx.putImageData(img, ox, oy);
    },
    diag(c1, c2, period = 8) {
      g.fill(c1);
      ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, w, h); ctx.clip(); ctx.fillStyle = css(c2);
      for (let x = -h; x < w + h; x += period) { ctx.beginPath(); ctx.moveTo(ox + x, oy + h); ctx.lineTo(ox + x + period / 2, oy + h); ctx.lineTo(ox + x + period / 2 + h, oy); ctx.lineTo(ox + x + h, oy); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    },
  };
  return g;
}

/** Cached custom tiling canvas texture. draw(g) */
export function customTex(key, w, h, draw, clamp = false) {
  let t = TEX.get(key);
  if (t) return t;
  const { c, ctx } = mkCanvas(w, h);
  draw(painter(ctx, 0, 0, w, h, mulberry32(hashStr(key))));
  t = canvasTex(c, clamp);
  TEX.set(key, t);
  return t;
}

// ---------------------------------------------------------------- decal atlas
// Each region: [name, w, h, draw(g)]. Packed into one alpha-tested texture so
// every decal/label shares a single material (one draw call).
function wheelFace(g, rim, hub, kind) {
  g.clear();
  const c = g.w / 2;
  g.circle(0x161616, c, c, c - 0.5);
  g.ring(0x2a2a2a, c, c, c - 2.5, 1);
  if (kind === 'race') { for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; if (i % 3 !== 2) g.rect(0xd8d8d0, c + Math.cos(a) * (c - 3.5) - 0.5, c + Math.sin(a) * (c - 3.5) - 0.5, 1.4, 1.4); } }
  if (kind !== 'tire') g.circle(rim, c, c, c * 0.62);
  if (kind === 'hubcap') {
    g.circle(0xc8ccd0, c, c, c * 0.55); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.circle(0x5a5e62, c + Math.cos(a) * c * 0.36, c + Math.sin(a) * c * 0.36, 1.6); }
    g.circle(0xe8e8e8, c, c, c * 0.16);
  } else if (kind === 'race' || kind === 'steel') {
    g.ring(css(hub), c, c, c * 0.5, 1);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; g.circle(0x101010, c + Math.cos(a) * c * 0.38, c + Math.sin(a) * c * 0.38, 1.8); }
    g.circle(hub, c, c, c * 0.2);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.6; g.rect(0xd0d0d0, c + Math.cos(a) * c * 0.13 - 0.5, c + Math.sin(a) * c * 0.13 - 0.5, 1, 1); }
  } else if (kind === 'burnt') {
    g.clear(); g.circle(0x4a2a1a, c, c, c * 0.66); g.circle(0x2a1a12, c, c, c * 0.5); g.circle(0x5a3a22, c, c, c * 0.22);
  }
  g.noise(18);
}
function exitSign(g, color, arrow) {
  g.fill(0x101010);
  const col = color === 'red' ? 0xff2a1a : 0x2aff5a;
  g.text('EXIT', g.w / 2 + (arrow === 'l' ? 3 : arrow === 'r' ? -3 : 0), g.h / 2 + 1, 11, col, { font: 'sans-serif', maxW: 22 });
  if (arrow === 'l') g.poly(col, [[1, 8], [5, 4], [5, 12]]);
  if (arrow === 'r') g.poly(col, [[31, 8], [27, 4], [27, 12]]);
  g.stroke(0x303030, 0, 0, g.w, g.h);
}
function painting(g, kind) {
  const r = g.r;
  g.fill(0x2a1a10);
  if (kind === 'land') {
    for (let y = 2; y < g.h - 2; y++) { const t = y / g.h; g.rect([`rgb(${150 - t * 60},${170 - t * 40},${190 - t * 80})`][0], 2, y, g.w - 4, 1); }
    g.poly(0x4a6a3a, [[2, 16], [10, 10], [18, 14], [26, 9], [30, 13], [30, 22], [2, 22]]);
    g.poly(0x3a5230, [[2, 19], [14, 15], [30, 18], [30, 22], [2, 22]]);
    g.rect(0x3a2a1a, 21, 10, 1, 7); g.circle(0x2a4a24, 21.5, 9, 3);
    g.circle(0xf0e0a0, 7, 6, 2);
  } else if (kind === 'port') {
    g.rect(0x3a2a2a, 2, 2, g.w - 4, g.h - 4);
    g.circle(0xd0a888, g.w / 2, 12, 5); g.rect(0x2a1a14, g.w / 2 - 5, 6, 10, 4);
    g.poly(0x1a2a3a, [[4, 30], [6, 20], [12, 18], [18, 20], [20, 30]]);
    g.rect(0xe8e0d0, g.w / 2 - 1, 18, 2, 4);
  } else {
    g.rect(0x5a4a3a, 2, 2, g.w - 4, g.h - 4);
    g.poly(0x8a6a4a, [[10, 22], [12, 14], [20, 14], [22, 22]]);
    for (let i = 0; i < 6; i++) g.circle(pick(r, [0xc03a3a, 0xe8d050, 0xe8e8e0, 0xd07ab0]), 11 + r() * 10, 8 + r() * 6, 2.5);
    for (let i = 0; i < 4; i++) g.rect(0x3a6a2a, 12 + r() * 8, 11 + r() * 3, 1, 3);
  }
  g.noise(16);
}
function deadFace(g, skin, hair) {
  g.fill(skin);
  g.rect(hair, 0, 0, 16, 3); g.rect(hair, 0, 0, 2, 7); g.rect(hair, 14, 0, 2, 7);
  g.rect(0x4a3028, 4, 7, 3, 1); g.rect(0x4a3028, 9, 7, 3, 1);
  g.rect(0x6a3a30, 6, 12, 4, 1);
  g.stains(0x6a0a08, 3, 0.7, 2);
  g.noise(14);
}
function shelfGoods(g, palette, kind) {
  const r = g.r;
  g.fill(0x1a1a1a);
  const rows = 2, rh = g.h / rows;
  for (let row = 0; row < rows; row++) {
    let x = 0;
    while (x < g.w) {
      const bw = kind === 'toys' ? 6 + ((r() * 8) | 0) : 3 + ((r() * 5) | 0);
      const bh = rh - 1 - ((r() * (rh * 0.45)) | 0);
      const c = pick(r, palette);
      g.rect(c, x, row * rh + rh - bh, bw - 1, bh);
      g.rect(0xffffff, x, row * rh + rh - bh, bw - 1, 1);
      if (kind === 'toys' && r() < 0.5) g.circle(pick(r, palette), x + bw / 2, row * rh + rh - bh / 2, Math.min(bw, bh) / 4);
      else g.rect(0xe8e0d0, x + 1, row * rh + rh - bh * 0.6, Math.max(1, bw - 3), 2);
      x += bw;
    }
  }
  g.noise(14);
}

const ATLAS_REGIONS = [
  // --- vehicles
  ['wheel', 32, 32, (g) => wheelFace(g, 0x8a8e92, 0xb0b0b0, 'hubcap')],
  ['wheelRace', 32, 32, (g) => wheelFace(g, 0x2a2c30, 0x9aa0a6, 'race')],
  ['wheelSteel', 32, 32, (g) => wheelFace(g, 0x3a3c40, 0x6a6e72, 'steel')],
  ['wheelBurnt', 32, 32, (g) => wheelFace(g, 0, 0, 'burnt')],
  ['tireTop', 32, 32, (g) => { g.clear(); g.circle(0x1a1a1a, 16, 16, 15.5); g.ring(0x2c2c2c, 16, 16, 12, 1); g.circle(0x060606, 16, 16, 8); g.noise(16); }],
  ['headlight', 16, 16, (g) => { g.clear(); g.circle(0xb8b8b8, 8, 8, 7.6); g.circle(0xe8e4c8, 8, 8, 6); g.circle(0xffffff, 6, 6, 2); g.noise(10); }],
  ['headRect', 16, 8, (g) => { g.fill(0xa0a0a0); g.rect(0xe8e6d0, 1, 1, 14, 6); g.rect(0xffffff, 2, 2, 4, 2); g.noise(10); }],
  ['tail', 16, 8, (g) => { g.fill(0x909090); g.rect(0x9a0e0a, 1, 1, 14, 6); g.rect(0xe03020, 2, 2, 7, 3); g.rect(0xd8a020, 11, 2, 3, 4); g.noise(12); }],
  ['grille', 32, 16, (g) => { g.fill(0xb0b4b8); g.rect(0x101010, 1, 2, 30, 12); for (let y = 3; y < 14; y += 3) g.rect(0x6a6e72, 1, y, 30, 1); g.rect(0x8a8e92, 15, 2, 2, 12); g.noise(12); }],
  ['grilleTruck', 32, 16, (g) => { g.fill(0xc8ccd0); for (let x = 2; x < 30; x += 3) g.rect(0x1a1a1a, x, 2, 2, 12); g.noise(12); }],
  ['plate', 16, 8, (g) => { g.fill(0xe8e4d8); g.rect(0x203a7a, 0, 0, 16, 1); for (let i = 0; i < 6; i++) g.rect(0x1a2a5a, 2 + i * 2, 3, 1, 3); g.noise(10); }],
  ['n29', 32, 32, (g) => { g.clear(); g.text('29', 16, 17, 25, 0xffffff, { outline: 0xb01818, outlineW: 3, font: 'Arial Black, sans-serif' }); g.crisp(); }],
  ['spGator', 64, 16, (g) => { g.fill(0x1e5a24); g.stroke(0xe8d040, 0, 0, 64, 16); g.text('GATOR OIL', 32, 8.5, 10, 0xf0d830, { maxW: 58 }); g.noise(10); }],
  ['spThunder', 64, 16, (g) => { g.fill(0x101010); g.poly(0xf0c020, [[4, 2], [10, 2], [7, 7], [11, 7], [3, 15], [6, 9], [2, 9]]); g.text('THUNDERBOLT', 36, 8.5, 9, 0xff4020, { maxW: 50 }); g.noise(10); }],
  ['spPeach', 64, 16, (g) => { g.fill(0xf0ece0); g.circle(0xf08a40, 8, 8, 5); g.rect(0x3a7a2a, 8, 2, 3, 2); g.text('PEACH STATE', 37, 8.5, 9, 0xd06020, { maxW: 50 }); g.noise(10); }],
  ['spContin', 64, 16, (g) => { const r = g.r; g.fill(0xe8e8e0); for (let i = 0; i < 8; i++) { const x = (i % 4) * 16, y = ((i / 4) | 0) * 8; g.rect(pick(r, [0xc02020, 0x2040a0, 0xe0c020, 0x208040, 0x101010, 0xe07020]), x + 1, y + 1, 14, 6); g.rect(0xffffff, x + 3, y + 3, 6 + ((r() * 5) | 0), 2); } g.noise(10); }],
  ['banner', 64, 8, (g) => { g.fill(0x0a0a0a); g.text('THUNDER RUN', 32, 4.5, 7, 0xffffff, { maxW: 60 }); }],
  ['net', 32, 16, (g) => { g.clear(); for (let x = 1; x < 32; x += 5) g.rect(0x101010, x, 0, 2, 16); for (let y = 1; y < 16; y += 5) g.rect(0x101010, 0, y, 32, 2); g.stroke(0x101010, 0, 0, 32, 16, 2); }],
  ['police', 64, 16, (g) => { g.fill(0xeceae4); g.text('POLICE', 32, 8.5, 12, 0x14204a, { maxW: 54 }); g.noise(8); }],
  ['badge', 16, 16, (g) => { g.clear(); const p = []; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU - HP, rr = i % 2 ? 3.5 : 7.5; p.push([8 + Math.cos(a) * rr, 8 + Math.sin(a) * rr]); } g.poly(0xd8b040, p); g.circle(0x806010, 8, 8, 2.5); g.crisp(); }],
  ['taxiSign', 32, 16, (g) => { g.fill(0xf0c818); g.stroke(0x202020, 0, 0, 32, 16); g.text('TAXI', 16, 8.5, 11, 0x101010); g.noise(8); }],
  ['checker', 32, 8, (g) => { for (let x = 0; x < 32; x += 4) for (let y = 0; y < 8; y += 4) g.rect(((x + y) / 4) % 2 ? 0x101010 : 0xf0f0e8, x, y, 4, 4); }],
  ['ambText', 64, 16, (g) => { g.clear(); g.text('AMBULANCE', 32, 8.5, 11, 0xc81818, { maxW: 60 }); g.crisp(); }],
  ['starLife', 32, 32, (g) => { g.clear(); const c = 16; for (let i = 0; i < 3; i++) { const a = i * PI / 3; const dx = Math.cos(a), dy = Math.sin(a); const px = -dy, py = dx; g.poly(0xffffff, [[c - dx * 15 - px * 5, c - dy * 15 - py * 5], [c + dx * 15 - px * 5, c + dy * 15 - py * 5], [c + dx * 15 + px * 5, c + dy * 15 + py * 5], [c - dx * 15 + px * 5, c - dy * 15 + py * 5]]); } for (let i = 0; i < 3; i++) { const a = i * PI / 3; const dx = Math.cos(a), dy = Math.sin(a); const px = -dy, py = dx; g.poly(0x1a4aa8, [[c - dx * 13.5 - px * 3.5, c - dy * 13.5 - py * 3.5], [c + dx * 13.5 - px * 3.5, c + dy * 13.5 - py * 3.5], [c + dx * 13.5 + px * 3.5, c + dy * 13.5 + py * 3.5], [c - dx * 13.5 + px * 3.5, c - dy * 13.5 + py * 3.5]]); } g.rect(0xffffff, 15, 8, 2, 16); g.crisp(); }],
  ['ceda', 64, 32, (g) => { g.clear(); g.circle(0x1a3a8a, 14, 16, 13); g.ring(0xffffff, 14, 16, 10, 2); g.rect(0xffffff, 12, 9, 4, 14); g.rect(0xffffff, 7, 14, 14, 4); g.text('NERA', 44, 13, 15, 0x1a3a8a, { font: 'Arial Black, sans-serif', maxW: 36 }); g.text('EMERGENCY', 44, 25, 7, 0x1a1a1a, { maxW: 36 }); g.crisp(); }],
  ['busDest', 64, 8, (g) => { g.fill(0x0a0a0a); g.text('NOT IN SERVICE', 32, 4.5, 7, 0xffa818, { maxW: 60, font: 'monospace' }); }],
  ['busAd', 64, 16, (g) => { g.fill(0x2a5a9a); g.rect(0xf0e8d0, 0, 10, 64, 6); g.text('RIDE THE LINE', 32, 5.5, 8, 0xffffff, { maxW: 58 }); g.text('CITY TRANSIT', 32, 13, 6, 0x1a1a1a, { maxW: 50 }); g.noise(10); }],
  ['movers', 64, 32, (g) => { g.fill(0xeeeae0); g.rect(0xd06020, 0, 24, 64, 8); g.poly(0x2a4a7a, [[4, 18], [10, 6], [14, 10], [18, 4], [16, 14], [10, 18]]); g.text('PELICAN', 40, 9, 11, 0x2a4a7a, { maxW: 42 }); g.text('MOVERS', 40, 19, 9, 0xd06020, { maxW: 42 }); g.text('LOCAL & LONG DISTANCE', 32, 28, 5, 0xffffff, { maxW: 60 }); g.noise(8); }],
  ['flammable', 16, 16, (g) => { g.clear(); g.poly(0xd02018, [[8, 0], [16, 8], [8, 16], [0, 8]]); g.poly(0xffffff, [[8, 3], [10, 7], [9, 6], [9, 9], [7, 9], [7, 6], [6, 7]]); g.text('3', 8, 12, 5, 0xffffff); g.crisp(); }],
  ['tankText', 64, 16, (g) => { g.clear(); g.text('FLAMMABLE', 32, 8.5, 11, 0xc01810, { maxW: 60 }); g.crisp(); }],
  // --- generic stripes / panels
  ['hazard', 32, 8, (g) => g.diag(0xe8c020, 0x141414, 8)],
  ['stripeRW', 32, 8, (g) => g.diag(0xe8e4dc, 0xc01a14, 8)],
  ['stripeOW', 32, 8, (g) => g.diag(0xf0f0e8, 0xe86010, 8)],
  ['keypad', 16, 16, (g) => { g.fill(0x6a6e72); for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) g.rect(0xd8d8d0, 2 + x * 4, 2 + y * 3.5, 3, 2.5); g.rect(0x30a040, 14, 3, 1, 2); g.rect(0xc03030, 14, 7, 1, 2); g.noise(8); }],
  ['vent', 16, 16, (g) => { g.fill(0x5a5e62); for (let y = 1; y < 16; y += 3) g.rect(0x1a1a1a, 1, y, 14, 2); g.noise(10); }],
  ['screen', 16, 16, (g) => { g.fill(0x1a3a8a); g.rect(0xd8e0ff, 2, 2, 12, 2); for (let y = 6; y < 14; y += 3) g.rect(0x8aa0e0, 3, y, 6 + ((g.r() * 4) | 0), 1); }],
  ['screenGreen', 16, 8, (g) => { g.fill(0x0a1a0a); g.text('0.00', 9, 4.5, 6, 0x40ff60, { font: 'monospace' }); }],
  ['drawers', 32, 32, (g) => { g.clear(); for (let i = 0; i < 2; i++) { g.stroke(0x1a120a, 1, 1 + i * 15, 30, 15); g.rect(0xc8a040, 14, 7 + i * 15, 4, 2); } g.crisp(); }],
  ['doors2', 32, 32, (g) => { g.clear(); g.stroke(0x1a120a, 1, 1, 15, 30); g.stroke(0x1a120a, 16, 1, 15, 30); g.rect(0xc8a040, 13, 15, 1, 4); g.rect(0xc8a040, 18, 15, 1, 4); g.crisp(); }],
  ['burner', 16, 16, (g) => { g.clear(); g.ring(0x0c0c0c, 8, 8, 6, 2); g.ring(0x0c0c0c, 8, 8, 2.5, 2); g.rect(0x0c0c0c, 7, 0, 2, 16); g.rect(0x0c0c0c, 0, 7, 16, 2); g.crisp(); }],
  ['knobs', 32, 8, (g) => { g.clear(); for (let i = 0; i < 6; i++) { g.circle(0x101010, 3 + i * 5.2, 4, 2.2); g.rect(0xd0d0d0, 2.6 + i * 5.2, 2, 1, 2); } g.crisp(); }],
  ['porthole', 16, 16, (g) => { g.clear(); g.circle(0xb8bcc0, 8, 8, 7.6); g.circle(0x1a2028, 8, 8, 5.5); g.rect(0x8a9aa8, 5, 5, 2, 1); g.crisp(); }],
  ['products', 64, 32, (g) => shelfGoods(g, [0xc02a20, 0x2a5ab0, 0xe8c030, 0x2a8a3a, 0xe8e0d0, 0xe07a20, 0x7a2a8a, 0x1a1a1a, 0x8a6a3a], 'goods')],
  ['productsB', 64, 32, (g) => shelfGoods(g, [0xd8d0c0, 0x3a6aa0, 0xa02a2a, 0x5a8a3a, 0xe0b040, 0x4a4a4a, 0xa06a3a], 'goods')],
  ['toys', 64, 32, (g) => shelfGoods(g, [0xe02a2a, 0x2a6ae0, 0xf0d020, 0x30b040, 0xe060c0, 0xf08020, 0x8a40d0, 0x20c0c0], 'toys')],
  ['map', 32, 48, (g) => { const r = g.r; g.fill(0x1a2a4a); g.rect(0xe8e0c8, 2, 8, 28, 30); g.text('DIRECTORY', 16, 4, 6, 0xffffff, { maxW: 28 }); for (let i = 0; i < 10; i++) g.rect(pick(r, [0xc86a4a, 0x6a9ac8, 0x8ac86a, 0xd8b84a, 0xb07ac8]), 3 + (i % 3) * 9, 9 + ((i / 3) | 0) * 7, 8, 6); g.rect(0xa8a090, 3, 24, 26, 2); g.circle(0xe01010, 16, 25, 2); for (let y = 40; y < 47; y += 2) g.rect(0x8a9ac8, 3, y, 10 + ((r() * 14) | 0), 1); g.noise(8); }],
  ['paintLand', 32, 24, (g) => painting(g, 'land')],
  ['paintPort', 24, 32, (g) => painting(g, 'port')],
  ['paintFlower', 32, 24, (g) => painting(g, 'flower')],
  ['mirror', 32, 32, (g) => { for (let y = 0; y < 32; y++) g.rect(`rgb(${120 + y},${135 + y},${150 + y})`, 0, y, 32, 1); for (let i = 0; i < 3; i++) g.poly(0xe8f0f8, [[4 + i * 9, 30], [8 + i * 9, 30], [20 + i * 9, 2], [16 + i * 9, 2]]); g.stains(0x404040, 4, 0.12, 6); g.noise(6); }],
  ['tvStatic', 32, 24, (g) => { const r = g.r; for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) { const v = (r() * 200 + 30) | 0; g.rect(`rgb(${v},${v},${v + 10})`, x, y, 1, 1); } }],
  ['tvOff', 32, 24, (g) => { g.fill(0x141a1c); g.poly(0x2a3236, [[3, 3], [10, 3], [4, 12]]); g.noise(6); }],
  ['soda', 32, 64, (g) => { g.fill(0xb8141a); g.poly(0xf0f0f0, [[0, 40], [22, 30], [22, 36], [0, 46]]); g.rect(0x101010, 22, 0, 10, 64); for (let i = 0; i < 6; i++) { g.rect(pick(g.r, [0xc02020, 0x2050c0, 0x30a040, 0xe0c020, 0xe07020, 0xe8e8e8]), 24, 4 + i * 6, 6, 4); g.rect(0xffffff, 25, 5 + i * 6, 2, 1); } g.rect(0x404040, 24, 42, 6, 6); g.rect(0x101010, 25, 43, 4, 1); g.rect(0x2a2a2a, 2, 52, 18, 8); g.text('ICE COLD', 11, 10, 7, 0xffffff, { maxW: 20 }); g.text('DRINKS', 11, 19, 7, 0xffe0a0, { maxW: 20 }); g.noise(10); }],
  ['snack', 32, 64, (g) => { const r = g.r; g.fill(0x202428); g.rect(0x0a0e12, 2, 2, 20, 50); for (let row = 0; row < 6; row++) for (let k = 0; k < 4; k++) { g.rect(pick(r, [0xd02a2a, 0xe0c030, 0x2a6ac0, 0x30a040, 0xe07020, 0x8a5a2a, 0xe8e0d0]), 3 + k * 5, 4 + row * 8, 4, 5); g.rect(0x8a8a8a, 3 + k * 5, 9 + row * 8, 4, 1); } g.rect(0x5a5e62, 23, 6, 8, 12); for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) g.rect(0xd0d0d0, 24 + x * 2.5, 8 + y * 2.5, 2, 2); g.rect(0x101010, 24, 22, 6, 3); g.rect(0x101010, 4, 55, 16, 6); g.noise(8); }],
  ['deadFaceA', 16, 16, (g) => deadFace(g, 0xb89a80, 0x2a1a10)],
  ['deadFaceB', 16, 16, (g) => deadFace(g, 0x7a5a42, 0x0e0a08)],
  ['hairBack', 16, 16, (g) => { g.fill(0x2a1e14); g.noise(20); g.stains(0x6a0a08, 2, 0.6, 3); }],
  ['zipper', 32, 8, (g) => { g.clear(); g.rect(0x080808, 0, 3, 32, 2); for (let x = 0; x < 32; x += 2) g.rect(0x9a9a9a, x, 3, 1, 2); g.rect(0xc0c0c0, 26, 2, 3, 4); g.crisp(); }],
  ['menu', 64, 32, (g) => { const r = g.r; g.fill(0x101010); for (let i = 0; i < 3; i++) { g.rect(0x2a2a2a, 1 + i * 21, 1, 20, 30); g.circle(pick(r, [0xd08a30, 0xc04020, 0xe0c060, 0x8a5a2a]), 11 + i * 21, 9, 6); g.rect(0xe8e0c8, 5 + i * 21, 9, 12, 2); for (let k = 0; k < 4; k++) { g.rect(0xe8e8e0, 3 + i * 21, 18 + k * 3, 10, 1); g.rect(0xf0c040, 15 + i * 21, 18 + k * 3, 4, 1); } } }],
  ['elevInd', 16, 8, (g) => { g.fill(0x101010); g.text('3', 6, 4.5, 7, 0xffa020, { font: 'monospace' }); g.poly(0xffa020, [[11, 5], [13, 2], [15, 5]]); }],
  ['callBtn', 8, 16, (g) => { g.fill(0xa8acb0); g.circle(0xf0e8c0, 4, 5, 2); g.circle(0xd0d0d0, 4, 11, 2); g.noise(8); }],
  ['fireBox', 16, 16, (g) => { g.fill(0xc01a14); g.text('FIRE', 8, 4, 5, 0xffffff); g.rect(0xffffff, 5, 8, 6, 5); g.rect(0xc01a14, 6, 9, 4, 2); g.noise(8); }],
  ['exitG', 32, 16, (g) => exitSign(g, 'green', '')],
  ['exitGL', 32, 16, (g) => exitSign(g, 'green', 'l')],
  ['exitGR', 32, 16, (g) => exitSign(g, 'green', 'r')],
  ['exitR', 32, 16, (g) => exitSign(g, 'red', '')],
  ['exitRL', 32, 16, (g) => exitSign(g, 'red', 'l')],
  ['exitRR', 32, 16, (g) => exitSign(g, 'red', 'r')],
  ['phone', 32, 8, (g) => { g.fill(0x1a3a8a); g.text('PHONE', 16, 4.5, 7, 0xffffff, { maxW: 30 }); }],
  ['mail', 32, 8, (g) => { g.clear(); g.text('MAIL', 16, 4.5, 8, 0xffffff, { maxW: 30 }); g.crisp(); }],
  ['news', 32, 8, (g) => { g.fill(0xe8e4d8); g.text('DAILY NEWS', 16, 4.5, 6, 0x101010, { maxW: 30 }); }],
  ['newsFront', 16, 16, (g) => { g.fill(0xd8d4c8); g.rect(0x101010, 1, 1, 14, 3); for (let y = 6; y < 15; y += 2) { g.rect(0x5a5a5a, 1, y, 6, 1); g.rect(0x5a5a5a, 9, y, 6, 1); } g.rect(0x7a7a7a, 9, 6, 6, 4); }],
  ['newsprint', 32, 32, (g) => { g.fill(0xd0ccbe); g.rect(0x101010, 2, 2, 28, 4); for (let y = 8; y < 30; y += 2) { g.rect(0x6a6a64, 2, y, 12, 1); g.rect(0x6a6a64, 18, y, 12, 1); } g.rect(0x8a8a84, 18, 8, 12, 8); g.noise(10); }],
  ['busStop', 16, 16, (g) => { g.fill(0xe8e8e0); g.stroke(0x1a4a9a, 0, 0, 16, 16); g.rect(0x1a4a9a, 3, 3, 10, 7); g.rect(0xe8e8e0, 4, 4, 8, 3); g.circle(0x101010, 5, 11, 1.5); g.circle(0x101010, 11, 11, 1.5); g.text('BUS', 8, 14, 4, 0x1a4a9a); }],
  ['caution', 32, 8, (g) => { g.fill(0xe8c020); g.text('CAUTION', 16, 4.5, 7, 0x101010, { maxW: 30 }); }],
  ['cement', 32, 16, (g) => { g.fill(0xd8ccb0); g.rect(0x2a5a9a, 0, 0, 32, 4); g.text('PORTLAND', 16, 8, 6, 0x2a2a2a, { maxW: 30 }); g.text('CEMENT', 16, 13, 6, 0xb02a1a, { maxW: 30 }); g.noise(12); }],
  ['ice', 32, 8, (g) => { g.fill(0x1a4a8a); g.text('ICE', 16, 4.5, 7, 0xffffff); }],
  ['wetSign', 32, 48, (g) => { g.fill(0xf0c818); g.rect(0x101010, 0, 0, 32, 2); g.text('CAUTION', 16, 8, 8, 0x101010, { maxW: 30 }); g.circle(0x101010, 14, 18, 2.4); g.line(0x101010, 14, 20, 17, 28, 2); g.line(0x101010, 15, 23, 10, 21, 2); g.line(0x101010, 15, 22, 21, 22, 2); g.line(0x101010, 17, 28, 13, 33, 2); g.line(0x101010, 17, 28, 23, 31, 2); g.rect(0x101010, 6, 34, 20, 1); g.text('WET', 16, 39, 7, 0x101010); g.text('FLOOR', 16, 45, 6, 0x101010, { maxW: 30 }); g.noise(8); }],
  ['atm', 32, 8, (g) => { g.fill(0x1a6a3a); g.text('24 HR CASH', 16, 4.5, 6, 0xffffff, { maxW: 30 }); }],
  ['stopSign', 32, 32, (g) => { g.clear(); const p = []; for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * TAU; p.push([16 + Math.cos(a) * 16, 16 + Math.sin(a) * 16]); } g.poly(0xf0f0f0, p); const q = p.map(([x, y]) => [16 + (x - 16) * 0.88, 16 + (y - 16) * 0.88]); g.poly(0xb81410, q); g.text('STOP', 16, 16.5, 10, 0xffffff, { maxW: 26 }); g.noise(8); }],
  ['medical', 64, 16, (g) => { g.fill(0x1a3a8a); g.text('MEDICAL', 32, 8.5, 11, 0xffffff, { maxW: 56 }); }],
  ['cardboardPrint', 16, 16, (g) => { g.clear(); g.poly(0x2a1a10, [[4, 6], [8, 2], [12, 6], [10, 6], [10, 10], [6, 10], [6, 6]]); g.rect(0x2a1a10, 3, 12, 10, 1); g.crisp(); }],
  ['tape', 16, 16, (g) => { g.fill(0xc8a870); g.rect(0xa88a50, 0, 0, 16, 1); g.noise(12); }],
  ['solar', 16, 16, (g) => { g.fill(0xb0b4b8); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.rect(0x1a2a5a, 1 + x * 3.7, 1 + y * 3.7, 3, 3); g.noise(8); }],
  ['gauge', 8, 8, (g) => { g.clear(); g.circle(0xe8e8e0, 4, 4, 3.6); g.line(0x101010, 4, 4, 6, 2); g.crisp(); }],
  ['hotelPlate', 16, 8, (g) => { g.fill(0xc8a040); g.text('412', 8, 4.5, 6, 0x2a1a0a); }],
  ['restroom', 16, 16, (g) => { g.fill(0x1a3a6a); g.circle(0xffffff, 5, 4, 1.6); g.rect(0xffffff, 4, 6, 3, 6); g.circle(0xffffff, 11, 4, 1.6); g.poly(0xffffff, [[11, 6], [13, 11], [9, 11]]); g.rect(0xffffff, 8, 2, 1, 12); }],
  ['generator', 32, 16, (g) => { g.fill(0x2a2a2a); g.rect(0x5a5e62, 1, 1, 14, 14); g.circle(0xe8e8e0, 5, 5, 3); g.circle(0xe8e8e0, 11, 5, 3); g.rect(0xc02020, 3, 10, 4, 3); g.rect(0x30a040, 9, 10, 4, 3); g.text('POWER', 24, 8.5, 5, 0xe8c020); g.noise(8); }],
  ['fuelTag', 16, 8, (g) => { g.fill(0xf0c818); g.text('FUEL', 8, 4.5, 6, 0x101010, { maxW: 15 }); }],
  ['toiletTop', 16, 16, (g) => { g.clear(); g.circle(0xf0f0ea, 8, 8, 7.8); g.circle(0xd8d8d0, 8, 8, 5.6); g.circle(0x8aa0a8, 8, 9, 4.2); g.noise(8); }],
  ['register', 16, 16, (g) => { g.fill(0x2a2a2a); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.rect(x === 3 ? 0xc8a040 : 0xd0d0c8, 1 + x * 3.6, 1 + y * 3.6, 3, 3); g.noise(6); }],
];

let ATLAS = null;
function buildAtlas() {
  if (ATLAS) return ATLAS;
  const W = 512, pad = 1;
  const items = ATLAS_REGIONS.map(([name, w, h, draw]) => ({ name, w, h, draw })).sort((a, b) => b.h - a.h || b.w - a.w);
  let x = 0, y = 0, rowH = 0;
  for (const it of items) {
    if (x + it.w + pad > W) { x = 0; y += rowH + pad; rowH = 0; }
    it.x = x; it.y = y; x += it.w + pad; rowH = Math.max(rowH, it.h);
  }
  let H = 16; while (H < y + rowH) H *= 2;
  const { c, ctx } = mkCanvas(W, H);
  const rects = {};
  for (const it of items) {
    const g = painter(ctx, it.x, it.y, it.w, it.h, mulberry32(hashStr('atlas:' + it.name)));
    ctx.save(); ctx.beginPath(); ctx.rect(it.x, it.y, it.w, it.h); ctx.clip();
    it.draw(g);
    ctx.restore();
    const e = 0.3;
    rects[it.name] = [(it.x + e) / W, 1 - (it.y + it.h - e) / H, (it.x + it.w - e) / W, 1 - (it.y + e) / H];
  }
  ATLAS = { tex: canvasTex(c, true), rects, canvas: c };
  return ATLAS;
}
/** UV rect [u0,v0,u1,v1] of a named decal region. */
export function R(name) {
  const a = buildAtlas();
  const r = a.rects[name];
  if (!r) throw new Error('Unknown decal region ' + name);
  return r;
}
/** Sub-rectangle of a region (fractions fx0..fx1, fy0..fy1 measured bottom-up). */
export function subR(rect, fx0, fy0, fx1, fy1) {
  const [u0, v0, u1, v1] = rect;
  return [u0 + (u1 - u0) * fx0, v0 + (v1 - v0) * fy0, u0 + (u1 - u0) * fx1, v0 + (v1 - v0) * fy1];
}

// ---------------------------------------------------------------- alpha cards (double sided)
const CARD_REGIONS = [
  ['leaves', 64, 64, (g) => {
    const r = g.r; g.clear();
    for (let i = 0; i < 70; i++) {
      const x = 6 + r() * 52, y = 6 + r() * 52, d = Math.hypot(x - 32, y - 32);
      if (d > 28) continue;
      const v = 0.6 + r() * 0.6;
      g.circle(`rgb(${(52 * v) | 0},${(78 * v) | 0},${(34 * v) | 0})`, x, y, 2 + r() * 4);
    }
    g.noise(18); g.crisp();
  }],
  ['moss', 32, 64, (g) => {
    const r = g.r; g.clear();
    for (let i = 0; i < 16; i++) {
      let x = 2 + r() * 28; const len = 20 + r() * 42; const v = 0.7 + r() * 0.4;
      for (let y = 0; y < len; y++) { x += (r() - 0.5) * 0.9; g.rect(`rgb(${(120 * v) | 0},${(128 * v) | 0},${(104 * v) | 0})`, x, y, 1 + (r() < 0.3 ? 1 : 0), 1); }
    }
    g.crisp();
  }],
  ['frond', 32, 64, (g) => {
    const r = g.r; g.clear();
    for (let y = 2; y < 62; y += 2) {
      const t = y / 64; const span = Math.sin(t * PI) * 14 + 2; const v = 0.65 + r() * 0.35;
      const col = `rgb(${(66 * v) | 0},${(98 * v) | 0},${(40 * v) | 0})`;
      g.line(col, 16, y, 16 - span, y + 5, 2); g.line(col, 16, y, 16 + span, y + 5, 2);
    }
    g.rect(0x6a6038, 15, 0, 2, 64); g.noise(10); g.crisp();
  }],
  ['plant', 32, 32, (g) => {
    const r = g.r; g.clear();
    for (let i = 0; i < 9; i++) {
      const a = -PI / 2 + (r() - 0.5) * 2.4; const len = 9 + r() * 6; const cx = 16 + Math.cos(a) * len * 0.6, cy = 30 + Math.sin(a) * len;
      const v = 0.7 + r() * 0.4;
      g.ctx.save(); g.ctx.translate(cx, cy); g.ctx.rotate(a + HP); g.ctx.fillStyle = `rgb(${(50 * v) | 0},${(98 * v) | 0},${(44 * v) | 0})`;
      g.ctx.beginPath(); g.ctx.ellipse(0, 0, 3, len * 0.55, 0, 0, TAU); g.ctx.fill(); g.ctx.restore();
    }
    g.noise(12); g.crisp();
  }],
  ['shirts', 32, 32, (g) => {
    const r = g.r; g.clear();
    for (let i = 0; i < 4; i++) {
      const x = i * 8; const c = pick(r, PALETTE.cloth);
      g.rect(0x9a9a9a, x + 3, 0, 2, 3);
      g.poly(c, [[x + 1, 4], [x + 7, 4], [x + 8, 8], [x + 7, 9], [x + 7, 30], [x + 1, 30], [x + 1, 9], [x, 8]]);
      g.rect(0x000000, x + 1, 4, 1, 26);
    }
    g.noise(14); g.crisp();
  }],
  ['grass', 32, 16, (g) => { const r = g.r; g.clear(); for (let i = 0; i < 30; i++) { const x = r() * 32, h = 6 + r() * 10; g.line(`rgb(${70 + r() * 30},${90 + r() * 40},40)`, x, 16, x + (r() - 0.5) * 4, 16 - h, 1); } g.crisp(); }],
  ['crystal', 8, 16, (g) => { g.clear(); g.rect(0xc0c0b0, 3, 0, 1, 4); g.poly(0xf0f4ff, [[4, 4], [7, 9], [4, 15], [1, 9]]); g.rect(0xffffff, 3, 7, 1, 3); g.crisp(); }],
  ['ladder', 16, 64, (g) => { g.clear(); g.rect(0x3a3c3e, 0, 0, 2, 64); g.rect(0x3a3c3e, 14, 0, 2, 64); for (let y = 3; y < 64; y += 8) { g.rect(0x4a4c4e, 0, y, 16, 2); g.rect(0x1a1a1a, 0, y + 2, 16, 1); } }],
  ['cloth', 32, 32, (g) => { const r = g.r; g.fill(0xd8d8d8); for (let x = 0; x < 32; x += 4) g.rect(0xb0b0b0, x, 0, 1, 32); g.noise(14); }],
];
let CARDS = null;
function buildCards() {
  if (CARDS) return CARDS;
  const W = 128, pad = 1;
  const items = CARD_REGIONS.map(([name, w, h, draw]) => ({ name, w, h, draw })).sort((a, b) => b.h - a.h || b.w - a.w);
  let x = 0, y = 0, rowH = 0;
  for (const it of items) { if (x + it.w + pad > W) { x = 0; y += rowH + pad; rowH = 0; } it.x = x; it.y = y; x += it.w + pad; rowH = Math.max(rowH, it.h); }
  let H = 16; while (H < y + rowH) H *= 2;
  const { c, ctx } = mkCanvas(W, H);
  const rects = {};
  for (const it of items) {
    ctx.save(); ctx.beginPath(); ctx.rect(it.x, it.y, it.w, it.h); ctx.clip();
    it.draw(painter(ctx, it.x, it.y, it.w, it.h, mulberry32(hashStr('cards:' + it.name))));
    ctx.restore();
    const e = 0.3;
    rects[it.name] = [(it.x + e) / W, 1 - (it.y + it.h - e) / H, (it.x + it.w - e) / W, 1 - (it.y + e) / H];
  }
  CARDS = { tex: canvasTex(c, true), rects };
  return CARDS;
}
export function C(name) { const r = buildCards().rects[name]; if (!r) throw new Error('Unknown card region ' + name); return r; }

// ---------------------------------------------------------------- tiling textures
const TILES = {
  chainlink: [32, 32, (g) => { g.clear(); const c = 0x9a9ea2, d = 0x5a5e62; for (let i = 0; i < 32; i++) { g.rect(c, i, (i) % 32, 1, 1); g.rect(d, i, (i + 16) % 32, 1, 1); g.rect(c, i, (32 - i) % 32, 1, 1); g.rect(d, i, (48 - i) % 32, 1, 1); } }],
  grille: [32, 32, (g) => { g.clear(); for (let x = 0; x < 32; x += 4) g.rect(0x8a8e92, x, 0, 1, 32); for (let y = 0; y < 32; y += 8) { g.rect(0xa8acb0, 0, y, 32, 2); g.rect(0x4a4e52, 0, y + 2, 32, 1); } }],
  wire: [16, 16, (g) => { g.clear(); g.rect(0xb8bcc0, 0, 0, 16, 1); g.rect(0xb8bcc0, 0, 8, 16, 1); g.rect(0x9a9ea2, 0, 0, 1, 16); g.rect(0x9a9ea2, 4, 0, 1, 16); g.rect(0x9a9ea2, 8, 0, 1, 16); g.rect(0x9a9ea2, 12, 0, 1, 16); }],
  leaf: [64, 64, (g) => { const r = g.r; g.fill(0x2e4422); for (let i = 0; i < 380; i++) { const v = 0.55 + r() * 0.75; g.circle(`rgb(${(58 * v) | 0},${(86 * v) | 0},${(38 * v) | 0})`, r() * 64, r() * 64, 1 + r() * 2.6); } g.noise(16); }],
  bark: [32, 64, (g) => { const r = g.r; g.fill(0x5a4a3a); for (let i = 0; i < 26; i++) { const x = r() * 32; const v = 0.5 + r() * 0.5; g.rect(`rgb(${(60 * v) | 0},${(48 * v) | 0},${(38 * v) | 0})`, x, 0, 1 + r() * 2, 64); } for (let i = 0; i < 20; i++) g.rect(0x2a2018, r() * 32, r() * 64, 3 + r() * 4, 1); g.noise(20); }],
  palmBark: [32, 32, (g) => { g.fill(0x7a6a52); for (let y = 0; y < 32; y += 4) { g.rect(0x4a3e2e, 0, y, 32, 1); g.rect(0x9a8a6a, 0, y + 1, 32, 1); } g.noise(18); }],
  carGlass: [32, 32, (g) => { for (let y = 0; y < 32; y++) g.rect(`rgb(${18 + y},${26 + y},${36 + y})`, 0, y, 32, 1); g.poly(0x6a7a8a, [[2, 32], [8, 32], [22, 0], [16, 0]]); g.poly(0x4a5a6a, [[12, 32], [14, 32], [28, 0], [26, 0]]); g.noise(6); }],
  carGlassBroken: [32, 32, (g) => { for (let y = 0; y < 32; y++) g.rect(`rgb(${30 + y},${36 + y},${44 + y})`, 0, y, 32, 1); for (let i = 0; i < 10; i++) { const a = i * 0.63; g.line(0xd0d8e0, 14, 14, 14 + Math.cos(a) * 22, 14 + Math.sin(a) * 22, 1); } g.ring(0xc0c8d0, 14, 14, 5, 1); g.ring(0xa0a8b0, 14, 14, 10, 1); g.noise(8); }],
  chrome: [16, 32, (g) => { for (let y = 0; y < 32; y++) { const t = y / 32; const v = t < 0.45 ? 230 - t * 160 : t < 0.55 ? 70 : 120 + (t - 0.55) * 180; g.rect(`rgb(${v | 0},${(v + 4) | 0},${(v + 10) | 0})`, 0, y, 16, 1); } g.noise(6); }],
  charred: [64, 64, (g) => { const r = g.r; g.fill(0x1a1612); g.stains(0x3a2a1e, 18, 0.5, 8); g.stains(0x050403, 14, 0.6, 7); g.stains(0x5a5650, 8, 0.25, 5); for (let i = 0; i < 40; i++) g.rect(r() < 0.2 ? 0x7a2a10 : 0x4a3a2e, r() * 64, r() * 64, 1, 1); g.noise(20); }],
  cardboard: [32, 32, (g) => { g.fill(0xb48c5a); for (let x = 0; x < 32; x += 3) g.rect(0xa8804e, x, 0, 1, 32); g.stains(0x5a4028, 4, 0.12, 6); g.noise(12); }],
  stripes: [32, 32, (g) => { g.fill(0xf0eee8); for (let x = 0; x < 32; x += 16) g.rect(0x888888, x, 0, 8, 32); g.noise(10); }],
  sheet: [32, 32, (g) => { const r = g.r; g.fill('rgba(220,226,230,0.45)'); for (let i = 0; i < 6; i++) { const x = r() * 32; g.rect('rgba(255,255,255,0.35)', x, 0, 1 + r() * 2, 32); } g.stains('rgba(90,80,60,1)', 4, 0.15, 6); }],
  pegboard: [16, 16, (g) => { g.fill(0xc8b896); for (let y = 2; y < 16; y += 4) for (let x = 2; x < 16; x += 4) g.rect(0x3a2e1e, x, y, 1, 1); g.noise(8); }],
  tread: [16, 16, (g) => { g.fill(0x3a3c3e); for (let x = 0; x < 16; x += 2) g.rect(0x7a7e82, x, 0, 1, 16); g.noise(8); }],
  quilt: [32, 32, (g) => { g.fill(0xe0e0e0); g.ctx.strokeStyle = '#a8a8a8'; for (let i = -32; i < 64; i += 8) { g.line(0xb0b0b0, i, 0, i + 32, 32); g.line(0xb0b0b0, i + 32, 0, i, 32); } g.noise(12); }],
  porcelain: [32, 32, (g) => { g.fill(0xeceae2); g.stains(0x9a9a8a, 5, 0.08, 6); g.noise(6); }],
  led: [16, 16, (g) => { g.fill(0x0c0c0c); for (let y = 1; y < 16; y += 2) for (let x = 1; x < 16; x += 2) g.rect(0x2a2014, x, y, 1, 1); }],
  plywood: [64, 64, (g) => { const r = g.r; g.fill(0xb89a6a); for (let y = 0; y < 64; y++) { const v = 0.9 + Math.sin(y * 0.5 + r()) * 0.05 + r() * 0.05; g.rect(`rgb(${(184 * v) | 0},${(154 * v) | 0},${(106 * v) | 0})`, 0, y, 64, 1); } for (let i = 0; i < 4; i++) { const x = r() * 60, y = r() * 60; g.ctx.fillStyle = '#7a5a34'; g.ctx.beginPath(); g.ctx.ellipse(x, y, 3, 1.5, 0, 0, TAU); g.ctx.fill(); } g.stains(0x5a4028, 5, 0.12, 8); g.noise(10); }],
  sandbag: [32, 32, (g) => { g.fill(0xa8946c); for (let y = 0; y < 32; y += 2) g.rect(0x988458, 0, y, 32, 1); g.stains(0x5a4a30, 5, 0.18, 6); g.noise(14); }],
  rubberMat: [16, 16, (g) => { g.fill(0x1c1c1c); for (let y = 0; y < 16; y += 4) g.rect(0x262626, 0, y, 16, 2); g.noise(10); }],
  leatherette: [32, 32, (g) => { g.fill(0xd8d8d8); g.stains(0x808080, 10, 0.12, 5); g.noise(14); }],
  dirtyWhite: [32, 32, (g) => { g.fill(0xe6e4dc); g.stains(0x6a5a40, 6, 0.1, 8); g.noise(8); }],
  fiberglass: [32, 32, (g) => { g.fill(0xe8e8e8); for (let y = 0; y < 32; y += 8) g.rect(0xd0d0d0, 0, y, 32, 1); g.stains(0x808070, 4, 0.08, 6); g.noise(8); }],
};
export function tileTex(name) { const [w, h, draw] = TILES[name]; return customTex('tile:' + name, w, h, draw); }

// ---------------------------------------------------------------- materials
export const CLIP = { metal: 'p_clipMetal', wood: 'p_clipWood', cloth: 'p_clipCloth', flesh: 'p_clipFlesh', glass: 'p_clipGlass', grass: 'p_clipGrass', concrete: 'clip', tile: 'p_clipTile', dirt: 'p_clipDirt', plastic: 'p_clipPlastic' };

/** Registers all prop materials on the builder (idempotent). */
export function mats(L) {
  if (L.matDefs.p_paint) return;
  const D = (n, d) => L.defMat(n, d);
  const atlas = buildAtlas().tex, cards = buildCards().tex;
  D('p_paint', { tex: ['metal', { color: 0xd6d6d6 }], scale: 2, surf: SURF.METAL });
  D('p_flat', { color: 0xffffff, surf: SURF.METAL });
  D('p_rubber', { tex: ['metal', { color: 0x262626 }], scale: 1, surf: SURF.DEFAULT });
  D('p_tire', { texObj: tileTex('rubberMat'), scale: 0.4, surf: SURF.DEFAULT });
  D('p_chrome', { texObj: tileTex('chrome'), scale: 0.6, surf: SURF.METAL });
  D('p_carGlass', { texObj: tileTex('carGlass'), scale: 1.4, surf: SURF.GLASS });
  D('p_carGlassBroken', { texObj: tileTex('carGlassBroken'), scale: 1.2, surf: SURF.GLASS });
  D('p_plastic', { tex: ['plaster', { color: 0xe4e4e0 }], scale: 1.5, surf: SURF.DEFAULT });
  D('p_fabric', { tex: ['fabric', { color: 0xd4d4d4 }], scale: 1, surf: SURF.CARPET });
  D('p_fabricPlaid', { tex: ['fabric', { color: 0xd4d4d4, plaid: true }], scale: 0.8, surf: SURF.CARPET });
  D('p_leather', { texObj: tileTex('leatherette'), scale: 1, surf: SURF.CARPET });
  D('p_cloth', { tex: ['grime', {}], scale: 0.8, surf: SURF.FLESH });
  D('p_clothBloody', { tex: ['grime', { blood: true }], scale: 0.8, surf: SURF.FLESH });
  D('p_skin', { tex: ['skin', { color: 0xe6e6e6 }], scale: 0.5, surf: SURF.FLESH });
  D('p_leaf', { texObj: tileTex('leaf'), scale: 1.6, surf: SURF.GRASS });
  D('p_bark', { texObj: tileTex('bark'), scale: 1.5, surf: SURF.WOOD });
  D('p_palmBark', { texObj: tileTex('palmBark'), scale: 0.8, surf: SURF.WOOD });
  D('p_fence', { texObj: tileTex('chainlink'), scale: 0.6, surf: SURF.METAL, alphaTest: 0.5, doubleSide: true, noBullet: true });
  D('p_grille', { texObj: tileTex('grille'), scale: 0.5, surf: SURF.METAL, alphaTest: 0.5, doubleSide: true, noBullet: true });
  D('p_wire', { texObj: tileTex('wire'), scale: 0.12, surf: SURF.METAL, alphaTest: 0.5, doubleSide: true, noBullet: true });
  D('p_charred', { texObj: tileTex('charred'), scale: 1.5, surf: SURF.WOOD });
  D('p_rust', { tex: ['metal', { color: 0x7a4a2c }], scale: 1.5, surf: SURF.METAL });
  D('p_cardboard', { texObj: tileTex('cardboard'), scale: 0.6, surf: SURF.WOOD });
  D('p_stripes', { texObj: tileTex('stripes'), scale: 1.0, surf: SURF.CARPET, doubleSide: true });
  D('p_sheet', { texObj: tileTex('sheet'), scale: 1.2, surf: SURF.DEFAULT, transparent: true, opacity: 0.85, doubleSide: true });
  D('p_pegboard', { texObj: tileTex('pegboard'), scale: 0.4, surf: SURF.WOOD });
  D('p_tread', { texObj: tileTex('tread'), scale: 0.3, surf: SURF.METAL });
  D('p_quilt', { texObj: tileTex('quilt'), scale: 0.6, surf: SURF.CARPET });
  D('p_porcelain', { texObj: tileTex('porcelain'), scale: 1, surf: SURF.TILE });
  D('p_plywood', { texObj: tileTex('plywood'), scale: 1.2, surf: SURF.WOOD });
  D('p_sandbag', { texObj: tileTex('sandbag'), scale: 0.5, surf: SURF.DIRT });
  D('p_dirtyWhite', { texObj: tileTex('dirtyWhite'), scale: 1.5, surf: SURF.METAL });
  D('p_fiberglass', { texObj: tileTex('fiberglass'), scale: 1.2, surf: SURF.DEFAULT });
  D('p_led', { texObj: tileTex('led'), scale: 0.1, surf: SURF.METAL });
  D('p_brass', { tex: ['metal', { color: 0xc09a40 }], scale: 1, surf: SURF.METAL });
  D('p_wireBlack', { color: 0x141414, surf: SURF.METAL, doubleSide: true });
  D('p_glass', { tex: ['glass', {}], scale: 1.5, surf: SURF.GLASS, transparent: true, opacity: 1, doubleSide: true });
  D('p_glassClear', { tex: ['glass', { color: 'rgba(170,200,210,0.22)' }], scale: 1.5, surf: SURF.GLASS, transparent: true, opacity: 1, doubleSide: true });
  // emissive / unlit
  D('p_emRed', { color: 0xff3020, unlit: true, surf: SURF.GLASS });
  D('p_emGreen', { color: 0x30ff60, unlit: true, surf: SURF.GLASS });
  D('p_emBlue', { color: 0x3a6aff, unlit: true, surf: SURF.GLASS });
  D('p_emAmber', { color: 0xffa020, unlit: true, surf: SURF.GLASS });
  D('p_emCool', { color: 0xe4f2ff, unlit: true, surf: SURF.GLASS });
  D('p_emSodium', { color: 0xffc070, unlit: true, surf: SURF.GLASS });
  D('p_emWarm', { color: 0xffe0a0, unlit: true, surf: SURF.GLASS });
  D('p_emWhite', { color: 0xffffff, unlit: true, surf: SURF.GLASS });
  D('p_emWarmDS', { color: 0xffe0a0, unlit: true, surf: SURF.GLASS, doubleSide: true });
  D('p_emScreen', { color: 0x8ab0d0, unlit: true, surf: SURF.GLASS });
  // atlases
  D('p_decal', { texObj: atlas, alphaTest: 0.5, polyOffset: true, surf: SURF.METAL });
  D('p_decalLit', { texObj: atlas, alphaTest: 0.5, polyOffset: true, unlit: true, surf: SURF.GLASS });
  D('p_cards', { texObj: cards, alphaTest: 0.5, doubleSide: true, surf: SURF.GRASS });
  // invisible collision hulls by surface
  D('p_clipMetal', { invisible: true, surf: SURF.METAL });
  D('p_clipWood', { invisible: true, surf: SURF.WOOD });
  D('p_clipCloth', { invisible: true, surf: SURF.CARPET });
  D('p_clipFlesh', { invisible: true, surf: SURF.FLESH });
  D('p_clipGlass', { invisible: true, surf: SURF.GLASS });
  D('p_clipGrass', { invisible: true, surf: SURF.GRASS });
  D('p_clipTile', { invisible: true, surf: SURF.TILE });
  D('p_clipDirt', { invisible: true, surf: SURF.DIRT });
  D('p_clipPlastic', { invisible: true, surf: SURF.DEFAULT });
}

/** Material from the textures.js 'sign' generator, cached per text/options. */
export function signMat(L, o, extra = {}) {
  const key = 'p_sign:' + JSON.stringify(o) + (extra.unlit ? ':lit' : '');
  if (!L.matDefs[key]) L.defMat(key, { tex: ['sign', o], surf: SURF.METAL, polyOffset: true, unlit: !!extra.unlit, alphaTest: extra.alphaTest || 0 });
  return key;
}
/** Material from any textures.js generator. */
export function genMat(L, gen, o, extra = {}) {
  const key = 'p_gen:' + gen + JSON.stringify(o) + JSON.stringify(extra);
  if (!L.matDefs[key]) L.defMat(key, { tex: [gen, o], surf: extra.surf ?? SURF.METAL, polyOffset: extra.polyOffset !== false, unlit: !!extra.unlit, alphaTest: extra.alphaTest || 0, doubleSide: !!extra.doubleSide, scale: extra.scale });
  return key;
}
/** Material backed by a custom cached canvas (draw(g) gets the painter helpers). */
export function canvasMat(L, key, w, h, draw, extra = {}) {
  const name = 'p_cv:' + key;
  if (!L.matDefs[name]) L.defMat(name, { texObj: customTex('cv:' + key, w, h, draw, extra.clamp !== false), surf: extra.surf ?? SURF.METAL, polyOffset: !!extra.polyOffset, unlit: !!extra.unlit, alphaTest: extra.alphaTest || 0, doubleSide: !!extra.doubleSide, scale: extra.scale, transparent: !!extra.transparent });
  return name;
}
export { painter };

// ---------------------------------------------------------------- triangle emitter
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _n = new THREE.Vector3();
/** Raw triangle (local coords). o: uv [[u,v]x3], tint, collide, bullet, scale. */
export function tri(L, a, b, c, mat, o = {}) {
  const def = L.matDefs[mat];
  if (!def) throw new Error('Unknown material ' + mat);
  const P = [toV(a), toV(b), toV(c)];
  _n.subVectors(P[1], P[0]).cross(_e2.subVectors(P[2], P[0]));
  if (_n.lengthSq() < 1e-14) return;
  _n.normalize();
  const n = _n.clone();
  const W = L.matrix;
  const nW = n.clone().transformDirection(W);
  const visible = !def.invisible && o.visible !== false;
  let uvs = o.uv;
  if (!uvs && visible) {
    const scale = o.scale || def.scale || 2;
    const an = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    uvs = P.map((p) => {
      if (ay >= an && ay >= az) return [p.x / scale, p.z / scale];
      if (an >= az) return [(n.x > 0 ? -p.z : p.z) / scale, p.y / scale];
      return [(n.z > 0 ? p.x : -p.x) / scale, p.y / scale];
    });
  }
  const w = P.map((p) => p.clone().applyMatrix4(W));
  const tint = rgb(o.tint);
  if (visible) {
    const bk = L.bucket(mat);
    for (let k = 0; k < 3; k++) {
      bk.pos.push(w[k].x, w[k].y, w[k].z); bk.nrm.push(nW.x, nW.y, nW.z);
      bk.uv.push(uvs[k][0], uvs[k][1]);
      bk.col.push(tint ? tint[0] : 1, tint ? tint[1] : 1, tint ? tint[2] : 1);
    }
  }
  if (o.collide && !L.__propNoCol) {
    for (let k = 0; k < 3; k++) {
      L.colPos.push(w[k].x, w[k].y, w[k].z); L.colSurf.push(def.surf || 0);
      L.colBullet.push(o.bullet === false || def.noBullet ? 0 : 1);
    }
  }
}
/** Triangle flipped if needed so its normal points along `want`. */
export function triTo(L, a, b, c, mat, want, o = {}) {
  const A = toV(a), B = toV(b), Cc = toV(c);
  _e1.subVectors(B, A).cross(_e2.subVectors(Cc, A));
  if (_e1.dot(want) < 0) {
    tri(L, A, Cc, B, mat, o.uv ? { ...o, uv: [o.uv[0], o.uv[2], o.uv[1]] } : o);
  } else tri(L, A, B, Cc, mat, o);
}

// ---------------------------------------------------------------- quad helpers
/** LevelBuilder quad with prop defaults (no collision, no subdivision). */
export function quad(L, a, b, c, d, mat, o = {}) {
  L.quad(a, b, c, d, mat, { ...o, collide: !!o.collide && !L.__propNoCol, subdivide: !!o.subdivide, tint: rgb(o.tint) });
}
/** Quad re-wound so its normal points along `want`. */
export function quadTo(L, a, b, c, d, mat, want, o = {}) {
  const A = toV(a), B = toV(b), Cc = toV(c), D = toV(d);
  _e1.subVectors(B, A).cross(_e2.subVectors(D, A));
  if (_e1.lengthSq() < 1e-12) _e1.subVectors(Cc, A).cross(_e2.subVectors(D, B));
  if (_e1.dot(want) < 0) quad(L, A, D, Cc, B, mat, o.uv ? { ...o, uv: [o.uv[0], o.uv[3], o.uv[2], o.uv[1]] } : o);
  else quad(L, A, B, Cc, D, mat, o);
}
/** Axis-aligned box (any corner order). o.faces {px,nx,py,ny,pz,nz:false}. */
export function box(L, x0, y0, z0, x1, y1, z1, mat, o = {}) {
  L.box([Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], mat, { ...o, collide: !!o.collide && !L.__propNoCol, subdivide: !!o.subdivide, tint: rgb(o.tint) });
}
/** Box given centre (x,z), bottom y and size. */
export function cbox(L, cx, y0, cz, sx, sy, sz, mat, o = {}) { box(L, cx - sx / 2, y0, cz - sz / 2, cx + sx / 2, y0 + sy, cz + sz / 2, mat, o); }

/** Invisible collision hull (axis aligned, local). Bottom face skipped when on the floor. */
export function solid(L, x0, y0, z0, x1, y1, z1, surf = 'metal', o = {}) {
  if (L.__propNoCol) return;
  const faces = { ...(o.faces || {}) };
  if (Math.min(y0, y1) <= 0.03 && faces.ny === undefined) faces.ny = false;
  L.box([Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], CLIP[surf] || surf, { collide: true, subdivide: false, faces, bullet: o.bullet });
}
/** Invisible collision quad (both sides collide; bvh is double sided). */
export function clipQuad(L, a, b, c, d, surf = 'metal', o = {}) {
  if (L.__propNoCol) return;
  L.quad(a, b, c, d, CLIP[surf] || surf, { collide: true, subdivide: false, bullet: o.bullet });
}

const DIRS = {
  pz: (x, y, z, w, h) => [[x - w, y - h, z], [x + w, y - h, z], [x + w, y + h, z], [x - w, y + h, z]],
  nz: (x, y, z, w, h) => [[x + w, y - h, z], [x - w, y - h, z], [x - w, y + h, z], [x + w, y + h, z]],
  px: (x, y, z, w, h) => [[x, y - h, z + w], [x, y - h, z - w], [x, y + h, z - w], [x, y + h, z + w]],
  nx: (x, y, z, w, h) => [[x, y - h, z - w], [x, y - h, z + w], [x, y + h, z + w], [x, y + h, z - w]],
  py: (x, y, z, w, h) => [[x - w, y, z + h], [x + w, y, z + h], [x + w, y, z - h], [x - w, y, z - h]],
  ny: (x, y, z, w, h) => [[x - w, y, z - h], [x + w, y, z - h], [x + w, y, z + h], [x - w, y, z + h]],
};
/**
 * Rectangle centred at (cx,cy,cz), facing dir ('pz','nz','px','nx','py','ny'),
 * with UVs spanning rect [u0,v0,u1,v1] (e.g. R('police')). For 'py', texture up = -z.
 */
export function panel(L, mat, rect, cx, cy, cz, w, h, dir = 'pz', o = {}) {
  const [a, b, c, d] = DIRS[dir](cx, cy, cz, w / 2, h / 2);
  let uv;
  if (rect) {
    const [u0, v0, u1, v1] = rect;
    uv = o.flipU ? [[u1, v0], [u0, v0], [u0, v1], [u1, v1]] : [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  }
  L.quad(a, b, c, d, mat, { collide: !!o.collide && !L.__propNoCol, subdivide: false, uv, tint: rgb(o.tint), bullet: o.bullet });
}
/** Arbitrary quad with rect UVs (a=bottom-left, b=bottom-right, c=top-right, d=top-left). */
export function quadUV(L, a, b, c, d, mat, rect, o = {}) {
  const [u0, v0, u1, v1] = rect;
  L.quad(a, b, c, d, mat, { collide: !!o.collide && !L.__propNoCol, subdivide: false, uv: [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], tint: rgb(o.tint), bullet: o.bullet });
}

// ---------------------------------------------------------------- transforms
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _eu = new THREE.Euler();
/** Push translation + Euler rotation (YXZ order) + scale (number or [x,y,z]). */
export function pushR(L, pos, rx = 0, ry = 0, rz = 0, s = 1) {
  _m4.compose(V(pos[0], pos[1], pos[2]), _q.setFromEuler(_eu.set(rx, ry, rz, 'YXZ')), typeof s === 'number' ? V(s, s, s) : V(s[0], s[1], s[2]));
  L.pushMatrix(_m4.clone());
}
/** World position (array) of a local point. */
export function wp(L, x, y, z) { return L.xf(V(x, y, z)).toArray(); }

/** Basis whose +Z runs from a to b. */
function basisAlong(a, b, upHint) {
  const z = b.clone().sub(a); const len = z.length(); z.divideScalar(len || 1);
  let up = upHint ? toV(upHint).clone().normalize() : V(0, 1, 0);
  if (Math.abs(z.dot(up)) > 0.98) up = Math.abs(z.x) < 0.9 ? V(1, 0, 0) : V(0, 0, 1);
  const x = up.clone().cross(z).normalize(); const y = z.clone().cross(x).normalize();
  return { x, y, z, len };
}
/** Rectangular beam between two points (w across, h up). */
export function beam(L, a, b, w, h, mat, o = {}) {
  const A = toV(a), B = toV(b);
  const { x, y, z, len } = basisAlong(A, B, o.up);
  if (len < 1e-5) return;
  L.pushMatrix(new THREE.Matrix4().makeBasis(x, y, z).setPosition(A));
  box(L, -w / 2, -h / 2, 0, w / 2, h / 2, len, mat, o.ends === false ? { ...o, faces: { ...(o.faces || {}), pz: false, nz: false } } : o);
  L.pop();
}

// ---------------------------------------------------------------- lofts / cylinders
function centroid(ps) { const c = V(0, 0, 0); for (const p of ps) c.add(p); return c.divideScalar(ps.length); }
/**
 * Side surface between two rings (closed loops of equal length), plus optional caps.
 * o: capA/capB (material | false), capUVA/capUVB ([[u,v]] per vertex), uvs ('cyl' -> cylindrical),
 *    open (don't close loop), inward (normals face the axis), tint, collide, want (fallback dir)
 */
export function loft(L, A, B, mat, o = {}) {
  const a = A.map(toV), b = B.map(toV), n = a.length;
  const ca = centroid(a), cb = centroid(b);
  const axis = cb.clone().sub(ca); const alen = axis.length();
  const ax = alen > 1e-6 ? axis.clone().divideScalar(alen) : (o.want ? toV(o.want).clone().normalize() : V(0, 1, 0));
  const mid = ca.clone().add(cb).multiplyScalar(0.5);
  const segs = o.open ? n - 1 : n;
  const sc = o.scale || L.matDefs[mat].scale || 2;
  // cylindrical uv: accumulate perimeter
  let per = [0];
  for (let i = 0; i < n; i++) per.push(per[i] + a[i].distanceTo(a[(i + 1) % n]));
  const so = { tint: o.tint, collide: o.collide, bullet: o.bullet };
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const p0 = a[i], p1 = a[j], p2 = b[j], p3 = b[i];
    const q = p0.clone().add(p1).add(p2).add(p3).multiplyScalar(0.25);
    const want = q.sub(mid); want.addScaledVector(ax, -want.dot(ax));
    if ((alen < 1e-6 || want.lengthSq() < 1e-10) && o.want) want.copy(toV(o.want));
    if (o.inward) want.negate();
    let uv0, uv1;
    if (o.uvs === 'cyl') {
      const u0 = per[i] / sc, u1 = per[i + 1] / sc, h0 = 0, h1 = p0.distanceTo(p3) / sc;
      uv0 = [[u0, h0], [u1, h0], [u1, h1]]; uv1 = [[u0, h0], [u1, h1], [u0, h1]];
    }
    triTo(L, p0, p1, p2, mat, want, { ...so, uv: uv0 });
    triTo(L, p0, p2, p3, mat, want, { ...so, uv: uv1 });
  }
  const cap = (ring, cmat, dir, uvs) => {
    for (let i = 1; i < n - 1; i++) triTo(L, ring[0], ring[i], ring[i + 1], cmat, dir, { ...so, uv: uvs ? [uvs[0], uvs[i], uvs[i + 1]] : undefined });
  };
  if (o.capA) cap(a, o.capA, ax.clone().negate(), o.capUVA);
  if (o.capB) cap(b, o.capB, ax, o.capUVB);
}
/** Ring of n points around centre c in plane spanned by unit vectors u,v. */
export function ringPts(c, u, v, r, n, phase = 0, rv = r) {
  const out = [];
  for (let i = 0; i < n; i++) { const t = phase + i / n * TAU; out.push(c.clone().addScaledVector(u, Math.cos(t) * r).addScaledVector(v, Math.sin(t) * rv)); }
  return out;
}
function circleUV(rect, n, phase = 0) {
  const [u0, v0, u1, v1] = rect; const out = [];
  for (let i = 0; i < n; i++) { const t = phase + i / n * TAU; out.push([u0 + (0.5 + 0.5 * Math.cos(t)) * (u1 - u0), v0 + (0.5 + 0.5 * Math.sin(t)) * (v1 - v0)]); }
  return out;
}
/**
 * Cylinder / frustum between points a and b. o: r2 (radius at b), capA, capB (mat|false),
 * capRectA/capRectB (atlas rect -> circular UV), phase, uvs, rv (ellipse radius on 2nd axis)
 */
export function rod(L, a, b, r, n, mat, o = {}) {
  const A = toV(a), B = toV(b);
  const { x, y } = basisAlong(A, B, o.up);
  const r2 = o.r2 !== undefined ? o.r2 : r;
  const ph = o.phase || 0;
  const ra = ringPts(A, x, y, r, n, ph, o.rv !== undefined ? o.rv : r);
  const rb = ringPts(B, x, y, r2, n, ph, o.rv !== undefined ? o.rv * (r2 / r) : r2);
  loft(L, ra, rb, mat, { ...o, capUVA: o.capRectA ? circleUV(o.capRectA, n, ph) : undefined, capUVB: o.capRectB ? circleUV(o.capRectB, n, ph) : undefined });
}
/** Vertical cylinder from base (x,y0,z) up h. Top cap on by default. */
export function vcyl(L, x, y0, z, r, h, n, mat, o = {}) {
  rod(L, [x, y0, z], [x, y0 + h, z], r, n, mat, { uvs: 'cyl', capB: mat, ...o });
}
/** Wheel/cylinder along local X centred at (x,y,z), width w. */
export function xcyl(L, x, y, z, r, w, n, mat, o = {}) {
  rod(L, [x - w / 2, y, z], [x + w / 2, y, z], r, n, mat, { up: [0, 1, 0], ...o });
}
/** Cylinder along local Z centred at (x,y,z), length len. */
export function zcyl(L, x, y, z, r, len, n, mat, o = {}) {
  rod(L, [x, y, z - len / 2], [x, y, z + len / 2], r, n, mat, { up: [0, 1, 0], ...o });
}

/** Organic low-poly blob (bush, canopy clump, pillow). 4n triangles. */
export function blob(L, cx, cy, cz, rx, ry, rz, n, mat, o = {}) {
  const r = o.rng || Math.random; const j = o.jitter !== undefined ? o.jitter : 0.12;
  const rings = o.rings || [[-1, 0], [-0.38, 0.95], [0.38, 0.86], [1, 0]];
  const c = V(cx, cy, cz);
  const R2 = rings.map(([yf, rf], k) => {
    if (rf === 0) return [V(cx, cy + yf * ry, cz)];
    const ring = [];
    for (let i = 0; i < n; i++) {
      const t = (i + (k % 2) * 0.5) / n * TAU + (o.phase || 0); const jt = 1 + (r() - 0.5) * 2 * j;
      ring.push(V(cx + Math.cos(t) * rx * rf * jt, cy + yf * ry + (r() - 0.5) * j * ry * 0.6, cz + Math.sin(t) * rz * rf * jt));
    }
    return ring;
  });
  const so = { tint: o.tint, collide: o.collide };
  const out = (p, q, s) => p.clone().add(q).add(s).divideScalar(3).sub(c);
  for (let k = 0; k < R2.length - 1; k++) {
    const A = R2[k], B = R2[k + 1];
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n;
      if (A.length === 1) triTo(L, A[0], B[i], B[i1], mat, out(A[0], B[i], B[i1]), so);
      else if (B.length === 1) triTo(L, A[i], A[i1], B[0], mat, out(A[i], A[i1], B[0]), so);
      else {
        triTo(L, A[i], A[i1], B[i], mat, out(A[i], A[i1], B[i]), so);
        triTo(L, A[i1], B[i1], B[i], mat, out(A[i1], B[i1], B[i]), so);
      }
    }
  }
}

// ---------------------------------------------------------------- 2D extrusion
function area2(p) { let s = 0; for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; s += p[i][0] * p[j][1] - p[j][0] * p[i][1]; } return s / 2; }
function inTri(p, a, b, c) {
  const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
  const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
  const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
/** Ear-clipping triangulation of a simple polygon. Returns index triples. */
export function earcut(pts) {
  let idx = pts.map((_, i) => i);
  if (area2(pts) < 0) idx.reverse();
  const out = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 4000) {
    let found = false;
    const m = idx.length;
    for (let i = 0; i < m; i++) {
      const i0 = idx[(i + m - 1) % m], i1 = idx[i], i2 = idx[(i + 1) % m];
      const a = pts[i0], b = pts[i1], c = pts[i2];
      const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cr <= 1e-10) continue;
      let ok = true;
      for (const k of idx) { if (k === i0 || k === i1 || k === i2) continue; if (inTri(pts[k], a, b, c)) { ok = false; break; } }
      if (!ok) continue;
      out.push([i0, i1, i2]); idx.splice(i, 1); found = true; break;
    }
    if (!found) {
      // drop a collinear vertex, else give up
      let removed = false;
      for (let i = 0; i < idx.length; i++) {
        const a = pts[idx[(i + idx.length - 1) % idx.length]], b = pts[idx[i]], c = pts[idx[(i + 1) % idx.length]];
        const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (Math.abs(cr) < 1e-8) { idx.splice(i, 1); removed = true; break; }
      }
      if (!removed) break;
    }
  }
  if (idx.length === 3) out.push(idx.slice());
  return out;
}
/**
 * Extrude a 2D polygon (may be concave) along an axis.
 * axis 'x': pts are (z,y); 'z': (x,y); 'y': (x,z). d0/d1: depth numbers or fn(u,v) (affine for planar caps).
 * mats: string | {side, cap0, cap1, edges:[mat|null per edge i->i+1]} ; null skips a face.
 * o: tint, collide, bullet, capUV(u,v)->[s,t], edgeTint:[...]
 */
export function extrude(L, pts, axis, d0, d1, mats, o = {}) {
  const n = pts.length;
  const D0 = typeof d0 === 'function' ? d0 : () => d0, D1 = typeof d1 === 'function' ? d1 : () => d1;
  const P = axis === 'x' ? (u, v, d) => V(d, v, u) : axis === 'z' ? (u, v, d) => V(u, v, d) : (u, v, d) => V(u, d, v);
  const AX = axis === 'x' ? V(1, 0, 0) : axis === 'z' ? V(0, 0, 1) : V(0, 1, 0);
  const m = typeof mats === 'string' ? { side: mats, cap0: mats, cap1: mats } : mats;
  const s = area2(pts) >= 0 ? 1 : -1;
  const so = { tint: o.tint, collide: o.collide, bullet: o.bullet, maxQuad: o.maxQuad };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const em = m.edges ? m.edges[i] : undefined;
    if (em === null || em === false) continue;
    const mat = em === undefined ? m.side : em;
    if (!mat) continue;
    const [ui, vi] = pts[i], [uj, vj] = pts[j];
    const du = uj - ui, dv = vj - vi;
    const out = s > 0 ? P(dv, -du, 0) : P(-dv, du, 0);
    const tint = o.edgeTint && o.edgeTint[i] !== undefined ? o.edgeTint[i] : o.tint;
    quadTo(L, P(ui, vi, D0(ui, vi)), P(uj, vj, D0(uj, vj)), P(uj, vj, D1(uj, vj)), P(ui, vi, D1(ui, vi)), mat, out, { ...so, tint, subdivide: o.maxQuad ? true : false });
  }
  const tris = (m.cap0 || m.cap1) ? earcut(pts) : [];
  const sgn = Math.sign(D1(pts[0][0], pts[0][1]) - D0(pts[0][0], pts[0][1])) || 1;
  const capTint = o.capTint !== undefined ? o.capTint : o.tint;
  for (const [cap, D, dir] of [[m.cap0, D0, AX.clone().multiplyScalar(-sgn)], [m.cap1, D1, AX.clone().multiplyScalar(sgn)]]) {
    if (!cap) continue;
    for (const [i0, i1, i2] of tris) {
      const p = [pts[i0], pts[i1], pts[i2]];
      const uv = o.capUV ? p.map(([u, v]) => o.capUV(u, v, dir)) : undefined;
      triTo(L, P(p[0][0], p[0][1], D(p[0][0], p[0][1])), P(p[1][0], p[1][1], D(p[1][0], p[1][1])), P(p[2][0], p[2][1], D(p[2][0], p[2][1])), cap, dir, { ...so, tint: capTint, uv });
    }
  }
}

// ---------------------------------------------------------------- misc
/** Built-in lamp unless opts.light === false. */
export function lamp(L, opts, pos, color, range, intensity = 1, lo = {}) {
  if (opts.light === false) return null;
  return L.light(pos, opts.lightColor !== undefined ? opts.lightColor : color, opts.lightRange || range, opts.lightIntensity || intensity, { flicker: opts.flicker || 0, ...lo });
}
/** Thin hanging wire / cable through points (two crossed ribbons). */
export function cable(L, pts, w = 0.03, mat = 'p_wireBlack') {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = toV(pts[i]), b = toV(pts[i + 1]);
    const d = b.clone().sub(a).normalize();
    const s1 = V(0, 1, 0).cross(d).normalize().multiplyScalar(w / 2);
    if (s1.lengthSq() < 1e-8) s1.set(w / 2, 0, 0);
    const s2 = d.clone().cross(s1).normalize().multiplyScalar(w / 2);
    quad(L, a.clone().sub(s2), b.clone().sub(s2), b.clone().add(s2), a.clone().add(s2), mat);
    quad(L, a.clone().sub(s1), b.clone().sub(s1), b.clone().add(s1), a.clone().add(s1), mat);
  }
}
/** Sagging catenary-ish points between a and b. */
export function sag(a, b, drop, segs = 4) {
  const out = [];
  for (let i = 0; i <= segs; i++) { const t = i / segs; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * PI) * drop, a[2] + (b[2] - a[2]) * t]); }
  return out;
}
/** Two crossed alpha cards (vertical), centred at x,z with base y. */
export function crossCards(L, x, y, z, w, h, rect, o = {}) {
  const n = o.count || 2; const a0 = o.angle || 0;
  for (let i = 0; i < n; i++) {
    const a = a0 + i * PI / n; const dx = Math.cos(a) * w / 2, dz = Math.sin(a) * w / 2;
    quadUV(L, [x - dx, y, z - dz], [x + dx, y, z + dz], [x + dx, y + h, z + dz], [x - dx, y + h, z - dz], 'p_cards', rect, { tint: o.tint });
  }
}

/** Wraps a prop body: material setup, transform push/pop, seeded rng. */
export function defProp(name, fn) {
  const f = function (L, x, y, z, rotY = 0, opts = {}) {
    mats(L);
    const o = opts || {};
    const depth = L.stack.length;
    const noCol = o.collide === false;
    if (noCol) L.__propNoCol = (L.__propNoCol || 0) + 1;
    L.push([x, y, z], rotY || 0, o.scale || 1);
    const seed = o.seed !== undefined ? o.seed : hashStr(`${name}:${Math.round(x * 100)}:${Math.round(y * 100)}:${Math.round(z * 100)}`);
    try {
      return fn(L, o, rng(seed)) || {};
    } finally {
      while (L.stack.length > depth) L.pop();
      if (noCol) L.__propNoCol--;
    }
  };
  f.propName = name;
  return f;
}
export { hashStr, canvasFor };
