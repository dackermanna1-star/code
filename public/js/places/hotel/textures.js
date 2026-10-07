// Everything the Ravenhurst is papered, carpeted, tiled and painted with,
// drawn on canvases: damask and striped wallpapers (faded and water-stained),
// ornate carpet runners, wood, parquet, marble, tiles, plaster, concrete,
// brick, the windows' storm outside, the paintings, the children's drawings,
// signs, the notes - and the Night Manager's porcelain face.
import * as THREE from 'three';

export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const cache = new Map();
/** A canvas texture, made once. o.linear for data (bump) textures. */
export function canvasTex(key, w, h, draw, o = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  draw(x, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.userData.canvas = c;
  cache.set(key, t);
  return t;
}
/** A grey bump map from another texture's canvas (light = raised), optionally inverted. */
export function bumpOf(key, src, o = {}) {
  return canvasTex(key + ':bump', src.userData.canvas.width, src.userData.canvas.height, (x, w, h) => {
    x.drawImage(src.userData.canvas, 0, 0);
    const d = x.getImageData(0, 0, w, h), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      let v = (p[i] * 0.3 + p[i + 1] * 0.55 + p[i + 2] * 0.15);
      if (o.invert) v = 255 - v;
      if (o.contrast) v = Math.max(0, Math.min(255, (v - 128) * o.contrast + 128));
      p[i] = p[i + 1] = p[i + 2] = v;
    }
    x.putImageData(d, 0, 0);
  }, { linear: true });
}

// --- noise ------------------------------------------------------------------------------------------------
/** Tileable value-noise fbm, values 0..1 (w and h multiples of the base period). */
export function fbm(w, h, seed, period = 4, oct = 4, gain = 0.5) {
  const out = new Float32Array(w * h);
  let amp = 1, total = 0, p = period;
  const r = rng(seed);
  for (let o = 0; o < oct; o++) {
    const g = new Float32Array(p * p); for (let i = 0; i < g.length; i++) g[i] = r();
    const sx = p / w, sy = p / h;
    for (let y = 0; y < h; y++) {
      const fy = y * sy, y0 = Math.floor(fy), ty = fy - y0, ry = ty * ty * (3 - 2 * ty);
      const a0 = (y0 % p) * p, a1 = ((y0 + 1) % p) * p;
      for (let x = 0; x < w; x++) {
        const fx = x * sx, x0 = Math.floor(fx), tx = fx - x0, rx = tx * tx * (3 - 2 * tx);
        const b0 = x0 % p, b1 = (x0 + 1) % p;
        const v = (g[a0 + b0] * (1 - rx) + g[a0 + b1] * rx) * (1 - ry) + (g[a1 + b0] * (1 - rx) + g[a1 + b1] * rx) * ry;
        out[y * w + x] += v * amp;
      }
    }
    total += amp; amp *= gain; p *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
/** Paint a noise field over the canvas: light and dark speckle, alpha a. */
function grain(x, w, h, a = 0.06, seed = 1) {
  const d = x.getImageData(0, 0, w, h), p = d.data, r = rng(seed);
  for (let i = 0; i < p.length; i += 4) { const n = (r() - 0.5) * 255 * a; p[i] += n; p[i + 1] += n; p[i + 2] += n; }
  x.putImageData(d, 0, 0);
}
/** Multiply a noise field into the canvas (mottling). */
function mottle(x, w, h, seed, amount = 0.25, period = 4, oct = 4) {
  const n = fbm(w, h, seed, period, oct);
  const d = x.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0, j = 0; i < p.length; i += 4, j++) { const k = 1 - amount + amount * 2 * n[j]; p[i] *= k; p[i + 1] *= k; p[i + 2] *= k; }
  x.putImageData(d, 0, 0);
}
/** Water stains: brownish blots with darker tide-mark rims. */
function stains(x, w, h, n, seed, strength = 1) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const cx = r() * w, cy = r() * h, rad = 12 + r() * 50;
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rad);
      g.addColorStop(0, `rgba(90,70,40,${0.10 * strength})`); g.addColorStop(0.8, `rgba(90,65,35,${0.16 * strength})`); g.addColorStop(0.92, `rgba(70,50,25,${0.28 * strength})`); g.addColorStop(1, 'rgba(70,50,25,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx + ox, cy + oy, rad, 0, 7); x.fill();
    }
  }
}
/** Vertical drip streaks (old water damage on wallpaper). */
function streaks(x, w, h, n, seed, color = 'rgba(40,30,15,0.12)') {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const sx = r() * w, sw = 3 + r() * 14, top = r() * h * 0.5, len = h * (0.3 + r() * 0.7);
    const g = x.createLinearGradient(0, top, 0, top + len);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.15, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(sx, top, sw, len);
    if (top + len > h) x.fillRect(sx, top - h, sw, len);
  }
}
/** Hairline cracks: random walks. */
function cracks(x, w, h, n, seed, color = 'rgba(30,25,20,0.5)', len = 30) {
  const r = rng(seed);
  x.strokeStyle = color; x.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let px = r() * w, py = r() * h, a = r() * 7;
    x.lineWidth = 0.6 + r() * 1.2;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < len; k++) { a += (r() - 0.5) * 1.1; px += Math.cos(a) * 4; py += Math.sin(a) * 4; x.lineTo(px, py); if (r() < 0.06) { x.stroke(); x.beginPath(); x.moveTo(px, py); x.lineWidth *= 0.7; } }
    x.stroke();
  }
}
function veins(x, w, h, n, seed, color, width = 1.4, step = 22) {
  const r = rng(seed);
  x.strokeStyle = color; x.lineWidth = width; x.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    let px = r() * w, py = r() * h, a = r() * 7;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 14; k++) { a += (r() - 0.5) * 1.2; px += Math.cos(a) * step; py += Math.sin(a) * step; x.lineTo(px, py); }
    x.stroke();
  }
}
const lerp = (a, b, t) => a + (b - a) * t;

// --- wallpapers --------------------------------------------------------------------------------------------
/** One damask ornament, symmetric, centred at (0,0), about 200 tall at s = 1. */
function damaskMotif(x, ink, gap) {
  for (const m of [1, -1]) {
    x.save(); x.scale(m, 1);
    x.fillStyle = ink;
    // the big outer leaves
    x.beginPath();
    x.moveTo(0, -96); x.bezierCurveTo(16, -84, 26, -66, 18, -46); x.bezierCurveTo(12, -30, 30, -22, 46, -36);
    x.bezierCurveTo(60, -48, 70, -28, 58, -12); x.bezierCurveTo(46, 4, 22, -2, 22, 14); x.bezierCurveTo(22, 30, 52, 30, 60, 50);
    x.bezierCurveTo(66, 66, 44, 80, 30, 70); x.bezierCurveTo(18, 62, 22, 46, 12, 46); x.bezierCurveTo(4, 46, 8, 70, 0, 96); x.closePath(); x.fill();
    // the curls
    x.beginPath(); x.arc(52, -30, 10, 0, 7); x.fill();
    x.beginPath(); x.ellipse(70, 8, 7, 14, 0.5, 0, 7); x.fill();
    x.beginPath(); x.moveTo(30, -64); x.bezierCurveTo(48, -80, 70, -74, 66, -56); x.bezierCurveTo(62, -48, 50, -54, 54, -60); x.bezierCurveTo(46, -66, 38, -62, 30, -64); x.fill();
    // the cut-outs (background colour) that make it lacy
    x.fillStyle = gap;
    x.beginPath(); x.moveTo(6, -70); x.bezierCurveTo(12, -60, 12, -48, 6, -40); x.bezierCurveTo(4, -50, 4, -62, 6, -70); x.fill();
    x.beginPath(); x.ellipse(40, 44, 8, 12, -0.6, 0, 7); x.fill();
    x.beginPath(); x.ellipse(34, -12, 5, 9, 0.9, 0, 7); x.fill();
    x.beginPath(); x.arc(52, -30, 4, 0, 7); x.fill();
    x.fillStyle = ink;
    for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(10 + i * 3, 70 + i * 6, 2.2 - i * 0.3, 0, 7); x.fill(); }
    x.restore();
  }
  // the jewel in the middle
  x.fillStyle = gap; x.beginPath(); x.moveTo(0, -24); x.bezierCurveTo(10, -10, 10, 8, 0, 22); x.bezierCurveTo(-10, 8, -10, -10, 0, -24); x.fill();
  x.fillStyle = ink; x.beginPath(); x.moveTo(0, -14); x.bezierCurveTo(5, -4, 5, 6, 0, 12); x.bezierCurveTo(-5, 6, -5, -4, 0, -14); x.fill();
}
export function damask(key, base, ink, seed, o = {}) {
  return canvasTex('damask:' + key, 256, 256, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    mottle(x, w, h, seed, 0.12, 2, 3);
    // half-drop repeat
    for (const [cx, cy] of [[64, 64], [192, 192], [192 - 256, 192], [64 + 256, 64], [64, 64 + 256], [192, 192 - 256], [192 - 256, 192 - 256], [64 + 256, 64 + 256]]) {
      x.save(); x.translate(cx, cy); x.scale(0.6, 0.6); damaskMotif(x, ink, base); x.restore();
    }
    // a faint gold sheen in the pattern
    if (o.sheen) { x.globalCompositeOperation = 'overlay'; x.fillStyle = o.sheen; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'source-over'; }
    grain(x, w, h, 0.05, seed + 1);
    streaks(x, w, h, o.streaks ?? 5, seed + 2);
    stains(x, w, h, o.stains ?? 2, seed + 3, 0.8);
  });
}
export function stripes(key, a, b, pin, seed, o = {}) {
  return canvasTex('stripes:' + key, 256, 256, (x, w, h) => {
    const n = o.n || 4, sw = w / n;
    for (let i = 0; i < n; i++) { x.fillStyle = i % 2 ? b : a; x.fillRect(i * sw, 0, sw, h); }
    if (pin) { x.fillStyle = pin; for (let i = 0; i < n; i++) { x.fillRect(i * sw + 3, 0, 2, h); x.fillRect(i * sw + sw - 5, 0, 2, h); } }
    if (o.dots) { x.fillStyle = o.dots; for (let i = 0; i < n; i += 2) for (let y = 8; y < h; y += 32) { x.beginPath(); x.arc(i * sw + sw / 2, y, 3, 0, 7); x.fill(); } }
    mottle(x, w, h, seed, 0.14, 2, 3);
    grain(x, w, h, 0.05, seed + 1);
    streaks(x, w, h, o.streaks ?? 6, seed + 2);
    stains(x, w, h, o.stains ?? 2, seed + 3);
  });
}
/** Wood panelling for wainscots: a raised-panel frame per tile. */
export function panels(key, base, seed) {
  return canvasTex('panel:' + key, 256, 256, (x, w, h) => {
    woodFill(x, w, h, base, seed, true);
    // frame shading: bevel
    const b = 26;
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(b, b, w - 2 * b, 6); x.fillRect(b, b, 6, h - 2 * b);
    x.fillStyle = 'rgba(255,220,180,0.12)'; x.fillRect(b, h - b - 6, w - 2 * b, 6); x.fillRect(w - b - 6, b, 6, h - 2 * b);
    x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 3; x.strokeRect(b + 12, b + 12, w - 2 * b - 24, h - 2 * b - 24);
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(0, 0, w, 3); x.fillRect(0, 0, 3, h);
  });
}

// --- wood ---------------------------------------------------------------------------------------------------
function woodFill(x, w, h, base, seed, vertical = true) {
  const r = rng(seed);
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  const n = fbm(64, 64, seed, 4, 3);
  for (let i = 0; i < 90; i++) {
    const p = r() * (vertical ? w : h), amp = 2 + r() * 6, f = 0.01 + r() * 0.03, ph = r() * 7;
    x.strokeStyle = r() < 0.5 ? `rgba(0,0,0,${0.06 + r() * 0.12})` : `rgba(255,220,170,${0.03 + r() * 0.05})`;
    x.lineWidth = 0.5 + r() * 2;
    x.beginPath();
    for (let t = 0; t <= (vertical ? h : w); t += 6) {
      const d = p + Math.sin(t * f + ph) * amp + n[(Math.floor(t / 8) % 64) * 64 + (Math.floor(p / 8) % 64)] * 8;
      if (vertical) { if (t === 0) x.moveTo(d, t); else x.lineTo(d, t); } else { if (t === 0) x.moveTo(t, d); else x.lineTo(t, d); }
    }
    x.stroke();
  }
  grain(x, w, h, 0.04, seed + 9);
}
export function wood(key, base, seed) { return canvasTex('wood:' + key, 256, 512, (x, w, h) => woodFill(x, w, h, base, seed, true)); }
export function planks(key, base, seed, o = {}) {
  return canvasTex('planks:' + key, 512, 512, (x, w, h) => {
    const r = rng(seed), n = 8, pw = w / n;
    const c = new THREE.Color(base);
    for (let i = 0; i < n; i++) {
      let y = -r() * 200;
      while (y < h) {
        const len = 120 + r() * 220;
        const k = 0.75 + r() * 0.4;
        x.save(); x.beginPath(); x.rect(i * pw, y, pw, len); x.clip();
        woodFillRect(x, i * pw, y, pw, len, `rgb(${c.r * 255 * k | 0},${c.g * 255 * k | 0},${c.b * 255 * k | 0})`, r);
        x.restore();
        x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(i * pw, y + len - 2, pw, 2);
        y += len;
      }
      x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(i * pw, 0, 2, h);
    }
    if (o.worn) { const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0.3, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(255,230,200,0.06)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
    stains(x, w, h, o.stains ?? 2, seed + 4, 0.6);
    grain(x, w, h, 0.04, seed + 3);
  });
}
function woodFillRect(x, x0, y0, w, h, base, r) {
  x.fillStyle = base; x.fillRect(x0, y0, w, h);
  for (let i = 0; i < 14; i++) {
    const px = x0 + r() * w, amp = 1 + r() * 3, f = 0.01 + r() * 0.03, ph = r() * 7;
    x.strokeStyle = r() < 0.6 ? `rgba(0,0,0,${0.08 + r() * 0.14})` : `rgba(255,220,170,${0.04 + r() * 0.05})`;
    x.lineWidth = 0.5 + r() * 1.5;
    x.beginPath();
    for (let t = 0; t <= h; t += 8) { const d = px + Math.sin((y0 + t) * f + ph) * amp; if (t === 0) x.moveTo(d, y0 + t); else x.lineTo(d, y0 + t); }
    x.stroke();
  }
  if (r() < 0.25) { const kx = x0 + w * (0.3 + r() * 0.4), ky = y0 + h * r(); x.fillStyle = 'rgba(30,15,5,0.45)'; x.beginPath(); x.ellipse(kx, ky, 3 + r() * 3, 6 + r() * 6, 0, 0, 7); x.fill(); }
}
export function parquet(key, base, seed) {
  // basket weave: 64 px squares of four slats, turned alternately
  return canvasTex('parquet:' + key, 512, 512, (x, w, h) => {
    const r = rng(seed), c = new THREE.Color(base), S = 64, n = 4, sw = S / n;
    x.fillStyle = '#1a0e06'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < w / S; i++) for (let j = 0; j < h / S; j++) {
      const across = (i + j) % 2 === 0;
      for (let k = 0; k < n; k++) {
        const kk = 0.72 + r() * 0.4, col = `rgb(${c.r * 255 * kk | 0},${c.g * 255 * kk | 0},${c.b * 255 * kk | 0})`;
        const rx = across ? i * S : i * S + k * sw, ry = across ? j * S + k * sw : j * S, rw = across ? S : sw, rh = across ? sw : S;
        x.save(); x.beginPath(); x.rect(rx + 1, ry + 1, rw - 2, rh - 2); x.clip();
        if (across) { x.translate(rx, ry + rh); x.rotate(-Math.PI / 2); woodFillRect(x, 0, 0, rh, rw, col, r); }
        else woodFillRect(x, rx, ry, rw, rh, col, r);
        x.restore();
      }
    }
    grain(x, w, h, 0.04, seed + 2);
    stains(x, w, h, 3, seed + 5, 0.7);
  });
}

// --- carpets -------------------------------------------------------------------------------------------------
/** The corridor runner: u runs along the corridor, v spans its width (border on both edges). */
export function runner(key, field, border, gold, seed) {
  return canvasTex('runner:' + key, 512, 256, (x, w, h) => {
    x.fillStyle = field; x.fillRect(0, 0, w, h);
    // the field: a lattice of lozenges with rosettes
    for (let i = 0; i < 4; i++) {
      const cx = 64 + i * 128, cy = h / 2;
      x.strokeStyle = gold; x.lineWidth = 5;
      x.beginPath(); x.moveTo(cx - 64, cy); x.lineTo(cx, cy - 70); x.lineTo(cx + 64, cy); x.lineTo(cx, cy + 70); x.closePath(); x.stroke();
      x.fillStyle = border; x.beginPath(); x.moveTo(cx - 40, cy); x.lineTo(cx, cy - 44); x.lineTo(cx + 40, cy); x.lineTo(cx, cy + 44); x.closePath(); x.fill();
      // rosette
      x.fillStyle = gold;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; x.beginPath(); x.ellipse(cx + Math.cos(a) * 16, cy + Math.sin(a) * 16, 10, 4, a, 0, 7); x.fill(); }
      x.fillStyle = field; x.beginPath(); x.arc(cx, cy, 8, 0, 7); x.fill();
      x.fillStyle = gold; x.beginPath(); x.arc(cx, cy, 4, 0, 7); x.fill();
      // little flowers in between
      x.beginPath(); x.arc(cx + 64, cy - 52, 5, 0, 7); x.arc(cx + 64, cy + 52, 5, 0, 7); x.fill();
    }
    // the borders
    for (const [y0, y1] of [[0, 34], [h - 34, h]]) {
      x.fillStyle = border; x.fillRect(0, y0, w, y1 - y0);
      x.fillStyle = gold; x.fillRect(0, y0 + 4, w, 3); x.fillRect(0, y1 - 7, w, 3);
      for (let i = 0; i < w; i += 32) { x.beginPath(); x.moveTo(i, (y0 + y1) / 2); x.lineTo(i + 16, y0 + 10); x.lineTo(i + 32, (y0 + y1) / 2); x.lineTo(i + 16, y1 - 10); x.closePath(); x.fill(); }
    }
    // wear down the middle, dirt, threadbare grain
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0.3, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(200,170,140,0.10)'); g.addColorStop(0.7, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    mottle(x, w, h, seed, 0.2, 4, 4);
    grain(x, w, h, 0.10, seed + 1);
    stains(x, w, h, 2, seed + 2, 1.2);
  });
}
/** All-over room carpet. */
export function carpet(key, field, ink, seed) {
  return canvasTex('carpet:' + key, 256, 256, (x, w, h) => {
    x.fillStyle = field; x.fillRect(0, 0, w, h);
    x.fillStyle = ink; x.strokeStyle = ink; x.lineWidth = 3;
    for (const [cx, cy] of [[64, 64], [192, 192], [192, 64], [64, 192]]) {
      const big = (cx + cy) % 256 === 128;
      if (big) { for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; x.beginPath(); x.ellipse(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14, 12, 5, a, 0, 7); x.fill(); } x.beginPath(); x.arc(cx, cy, 34, 0, 7); x.stroke(); }
      else { x.beginPath(); x.moveTo(cx, cy - 18); x.lineTo(cx + 18, cy); x.lineTo(cx, cy + 18); x.lineTo(cx - 18, cy); x.closePath(); x.stroke(); x.beginPath(); x.arc(cx, cy, 4, 0, 7); x.fill(); }
    }
    mottle(x, w, h, seed, 0.18, 4, 4);
    grain(x, w, h, 0.10, seed + 1);
  });
}
/** A Persian-style rug (local UVs: the whole rug). */
export function rug(key, field, border, ink, seed) {
  return canvasTex('rug:' + key, 512, 340, (x, w, h) => {
    const r = rng(seed);
    x.fillStyle = border; x.fillRect(0, 0, w, h);
    x.fillStyle = field; x.fillRect(30, 30, w - 60, h - 60);
    x.strokeStyle = ink; x.lineWidth = 4; x.strokeRect(18, 18, w - 36, h - 36); x.strokeRect(36, 36, w - 72, h - 72);
    // medallion
    x.fillStyle = border; x.beginPath(); x.ellipse(w / 2, h / 2, 110, 80, 0, 0, 7); x.fill();
    x.fillStyle = ink; for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; x.beginPath(); x.ellipse(w / 2 + Math.cos(a) * 60, h / 2 + Math.sin(a) * 42, 18, 7, a, 0, 7); x.fill(); }
    x.fillStyle = field; x.beginPath(); x.ellipse(w / 2, h / 2, 30, 22, 0, 0, 7); x.fill();
    for (let i = 0; i < 60; i++) { x.fillStyle = r() < 0.5 ? ink : border; x.beginPath(); x.arc(40 + r() * (w - 80), 40 + r() * (h - 80), 2 + r() * 4, 0, 7); x.fill(); }
    for (let i = 0; i < w; i += 6) { x.fillStyle = '#d8ccb0'; x.fillRect(i, 0, 2, 8); x.fillRect(i, h - 8, 2, 8); }
    mottle(x, w, h, seed, 0.2, 4, 4);
    grain(x, w, h, 0.1, seed + 1);
  }, { clamp: true });
}

// --- stone, tile, plaster, concrete, brick, metal --------------------------------------------------------------
export function marbleChecker(seed = 3) {
  return canvasTex('marbleChecker', 512, 512, (x, w, h) => {
    const n = fbm(512, 512, seed, 4, 5);
    const d = x.createImageData(w, h), p = d.data;
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
      const dark = ((xx >> 8) + (y >> 8)) % 2 === 1;
      const v = n[y * w + xx];
      const vein = Math.abs(Math.sin((xx * 0.012 + y * 0.02 + v * 9) * 2.0));
      const i = (y * w + xx) * 4;
      if (dark) { const b = 18 + v * 20 + (vein < 0.05 ? 60 : 0); p[i] = b; p[i + 1] = b * 0.98; p[i + 2] = b * 0.95; }
      else { const b = 218 + v * 30 - (vein < 0.06 ? 70 : vein < 0.15 ? 25 : 0); p[i] = b; p[i + 1] = b * 0.97; p[i + 2] = b * 0.92; }
      p[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    x.strokeStyle = 'rgba(40,35,30,0.7)'; x.lineWidth = 3;
    for (let i = 0; i <= w; i += 256) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
    stains(x, w, h, 2, seed + 7, 0.6);
    cracks(x, w, h, 3, seed + 8, 'rgba(20,20,20,0.5)', 14);
  });
}
export function marble(key, base, vein, seed) {
  return canvasTex('marble:' + key, 256, 256, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    mottle(x, w, h, seed, 0.12, 2, 4);
    veins(x, w, h, 10, seed + 1, vein, 1.2, 16);
    veins(x, w, h, 4, seed + 2, vein.replace(/[\d.]+\)$/, '0.12)'), 4, 20);
    grain(x, w, h, 0.03, seed + 3);
  });
}
export function tiles(key, base, grout, n, seed, o = {}) {
  return canvasTex('tiles:' + key, 256, 256, (x, w, h) => {
    const r = rng(seed), s = w / n;
    x.fillStyle = grout; x.fillRect(0, 0, w, h);
    const c = new THREE.Color(base);
    for (let i = 0; i < n; i++) for (let j = 0; j < (o.brick ? n * 2 : n); j++) {
      const k = 0.9 + r() * 0.12, th = o.brick ? s / 2 : s, off = o.brick && j % 2 ? s / 2 : 0;
      x.fillStyle = `rgb(${c.r * 255 * k | 0},${c.g * 255 * k | 0},${c.b * 255 * k | 0})`;
      x.fillRect(i * s + 2 + off, j * th + 2, s - 4, th - 4);
      if (o.brick && off) x.fillRect(i * s + 2 + off - w, j * th + 2, s - 4, th - 4);
      x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(i * s + 3 + off, j * th + 3, s - 8, 3);
    }
    if (o.checker) { x.fillStyle = o.checker; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i + j) % 2) x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); }
    stains(x, w, h, o.stains ?? 2, seed + 4, 0.8);
    cracks(x, w, h, o.cracks ?? 2, seed + 5, 'rgba(30,30,30,0.6)', 10);
    grain(x, w, h, 0.03, seed + 6);
  });
}
export function hexTiles(seed = 5) {
  return canvasTex('hex', 256, 256, (x, w, h) => {
    x.fillStyle = '#6a6862'; x.fillRect(0, 0, w, h);
    const R = 8, dx = R * Math.sqrt(3), dy = R * 1.5, r = rng(seed);
    for (let row = -1; row < h / dy + 2; row++) for (let col = -1; col < w / dx + 2; col++) {
      const cx = col * dx + (row % 2 ? dx / 2 : 0), cy = row * dy;
      const flower = ((col * 3 + row * 5) % 7 === 0);
      x.fillStyle = flower ? '#1c1c1c' : `hsl(40,12%,${80 + r() * 8}%)`;
      x.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; x.lineTo(cx + Math.cos(a) * (R - 1), cy + Math.sin(a) * (R - 1)); } x.fill();
    }
    stains(x, w, h, 4, seed + 1, 1.1);
    grain(x, w, h, 0.04, seed + 2);
  });
}
export function plaster(key, base, seed, o = {}) {
  return canvasTex('plaster:' + key, 512, 512, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    mottle(x, w, h, seed, 0.10, 4, 5);
    stains(x, w, h, o.stains ?? 5, seed + 1, 1.2);
    cracks(x, w, h, o.cracks ?? 6, seed + 2, 'rgba(40,35,30,0.45)', 30);
    grain(x, w, h, 0.04, seed + 3);
  });
}
export function concrete(key, base, seed, o = {}) {
  return canvasTex('concrete:' + key, 512, 512, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    mottle(x, w, h, seed, 0.22, 4, 5);
    const r = rng(seed + 9);
    for (let i = 0; i < 900; i++) { x.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.15)'; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    stains(x, w, h, o.stains ?? 6, seed + 1, 1.4);
    cracks(x, w, h, o.cracks ?? 5, seed + 2, 'rgba(20,20,20,0.6)', 30);
    if (o.lines) { x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2; x.strokeRect(1, 1, w - 2, h - 2); }
    grain(x, w, h, 0.06, seed + 3);
  });
}
export function brick(key, brickCol, mortar, seed, o = {}) {
  return canvasTex('brick:' + key, 512, 512, (x, w, h) => {
    const r = rng(seed), bw = 64, bh = 26;
    x.fillStyle = mortar; x.fillRect(0, 0, w, h);
    const c = new THREE.Color(brickCol);
    for (let row = 0; row * bh < h; row++) for (let col = -1; col * bw < w; col++) {
      const k = 0.82 + r() * 0.3, off = row % 2 ? bw / 2 : 0;
      x.fillStyle = `rgb(${c.r * 255 * k | 0},${c.g * 255 * k | 0},${c.b * 255 * k | 0})`;
      x.fillRect(col * bw + off + 2, row * bh + 2, bw - 4, bh - 4);
    }
    mottle(x, w, h, seed, 0.16, 4, 4);
    if (o.paintLine) { x.fillStyle = o.paintLine; x.fillRect(0, h * 0.5, w, h * 0.5); x.globalCompositeOperation = 'source-over'; }
    stains(x, w, h, o.stains ?? 4, seed + 1, 1.3);
    streaks(x, w, h, 6, seed + 2, 'rgba(30,25,20,0.18)');
    grain(x, w, h, 0.06, seed + 3);
  });
}
export function metal(key, base, seed, o = {}) {
  return canvasTex('metal:' + key, 256, 256, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    const r = rng(seed);
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r() * 0.05})`; x.fillRect(0, r() * h, w, 1); }
    if (o.rust) { stains(x, w, h, o.rust, seed + 1, 2); x.globalCompositeOperation = 'multiply'; x.fillStyle = 'rgba(160,80,30,0.25)'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'source-over'; }
    grain(x, w, h, 0.04, seed + 2);
  });
}
export function fabric(key, base, seed, o = {}) {
  return canvasTex('fabric:' + key, 128, 128, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    mottle(x, w, h, seed, o.mottle ?? 0.18, 2, 4);
    if (o.weave) { x.fillStyle = 'rgba(0,0,0,0.08)'; for (let i = 0; i < w; i += 2) x.fillRect(i, 0, 1, h); for (let i = 0; i < h; i += 2) x.fillRect(0, i, w, 1); }
    if (o.motif) { x.fillStyle = o.motif; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const cx = i * 32 + (j % 2 ? 16 : 0) + 8, cy = j * 32 + 8; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; x.beginPath(); x.ellipse(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4, 4, 2, a, 0, 7); x.fill(); } } }
    grain(x, w, h, 0.06, seed + 1);
  });
}
export function stainedGlass(seed = 11) {
  return canvasTex('stainedGlass', 512, 512, (x, w, h) => {
    const r = rng(seed), cols = ['#7a1018', '#14306a', '#a07818', '#1e5a2a', '#5a1a5a', '#c8a050'];
    x.fillStyle = '#0a0a0a'; x.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    for (let ring = 6; ring >= 0; ring--) {
      const rad = 30 + ring * 36, segs = 6 + ring * 4;
      for (let s = 0; s < segs; s++) {
        const a0 = s / segs * Math.PI * 2, a1 = (s + 1) / segs * Math.PI * 2;
        x.fillStyle = cols[(s + ring * 3) % cols.length];
        x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, rad, a0, a1); x.closePath(); x.fill();
        x.strokeStyle = '#080808'; x.lineWidth = 4; x.stroke();
      }
    }
    // a raven in the middle
    x.fillStyle = '#060606'; ravenShape(x, cx, cy, 0.9);
    // light variation in each pane
    const d = x.getImageData(0, 0, w, h), p = d.data, n = fbm(512, 512, seed, 8, 3);
    for (let i = 0, j = 0; i < p.length; i += 4, j++) { const k = 0.65 + n[j] * 0.7; p[i] *= k; p[i + 1] *= k; p[i + 2] *= k; }
    x.putImageData(d, 0, 0);
    x.strokeStyle = '#080808'; x.lineWidth = 10; x.strokeRect(0, 0, w, h);
    void r;
  });
}
/** The raven of the Ravenhurst (a silhouette, centred, ~200 wide at s = 1). */
export function ravenShape(x, cx, cy, s) {
  x.save(); x.translate(cx, cy); x.scale(s, s);
  x.beginPath();
  x.moveTo(-90, 10); x.bezierCurveTo(-60, -30, -30, -40, -10, -30); x.bezierCurveTo(0, -55, 20, -60, 34, -50);
  x.lineTo(58, -46); x.lineTo(36, -38); x.bezierCurveTo(40, -20, 30, 0, 10, 10); x.bezierCurveTo(30, 30, 40, 60, 20, 90);
  x.lineTo(10, 60); x.lineTo(0, 92); x.lineTo(-8, 56); x.bezierCurveTo(-30, 50, -40, 30, -46, 20); x.bezierCurveTo(-60, 30, -80, 30, -90, 10);
  x.fill();
  x.restore();
}

// --- outside the windows --------------------------------------------------------------------------------------
export function nightWindow(seed = 21) {
  return canvasTex('nightWindow', 256, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0d1420'); g.addColorStop(0.6, '#1c2838'); g.addColorStop(0.75, '#141c26'); g.addColorStop(1, '#06080c');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const n = fbm(256, 512, seed, 4, 4);
    const d = x.getImageData(0, 0, w, h), p = d.data;
    for (let i = 0, j = 0; i < p.length; i += 4, j++) { const k = 0.6 + n[j] * 0.9; p[i] *= k; p[i + 1] *= k; p[i + 2] *= k * 1.05; }
    x.putImageData(d, 0, 0);
    // trees against the sky
    const r = rng(seed + 1);
    x.fillStyle = '#030406';
    for (let i = 0; i < 9; i++) {
      const tx = r() * w, th = 120 + r() * 160, base = h * 0.8;
      x.beginPath(); x.moveTo(tx - 4, base); x.lineTo(tx, base - th); x.lineTo(tx + 4, base); x.fill();
      for (let k = 0; k < 8; k++) { const by = base - th * (0.3 + k * 0.08), bl = 20 + r() * 40; x.lineWidth = 2; x.strokeStyle = '#030406'; x.beginPath(); x.moveTo(tx, by); x.lineTo(tx + (r() < 0.5 ? -bl : bl), by - bl * 0.6); x.stroke(); }
    }
    x.fillRect(0, h * 0.8, w, h * 0.2);
    // drops on the glass
    for (let i = 0; i < 160; i++) { const px = r() * w, py = r() * h, s = 1 + r() * 3; x.fillStyle = 'rgba(160,180,210,0.22)'; x.beginPath(); x.ellipse(px, py, s * 0.7, s, 0, 0, 7); x.fill(); }
  });
}
export function rainStreaks(seed = 22) {
  return canvasTex('rainStreaks', 128, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const r = rng(seed);
    for (let i = 0; i < 70; i++) {
      const px = r() * w, py = r() * h, len = 20 + r() * 70;
      const g = x.createLinearGradient(0, py, 0, py + len);
      g.addColorStop(0, 'rgba(200,215,240,0)'); g.addColorStop(1, 'rgba(200,215,240,0.45)');
      x.strokeStyle = g; x.lineWidth = 0.8 + r() * 1.2;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 3, py + len); x.stroke();
      if (py + len > h) { x.beginPath(); x.moveTo(px, py - h); x.lineTo(px, py + len - h); x.stroke(); }
    }
  });
}

// --- paintings -------------------------------------------------------------------------------------------------
function strokes(x, w, h, n, seed, cols, len = 30, width = 6) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    x.strokeStyle = cols[Math.floor(r() * cols.length)]; x.lineWidth = width * (0.4 + r());
    x.globalAlpha = 0.15 + r() * 0.3;
    const px = r() * w, py = r() * h, a = r() * 7;
    x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * len * 0.5 + (r() - 0.5) * 10, py + Math.sin(a) * len * 0.5, px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke();
  }
  x.globalAlpha = 1;
}
function canvasAge(x, w, h, seed) {
  const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.65)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'multiply'; x.fillStyle = 'rgba(200,170,110,0.35)'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'source-over';
  cracks(x, w, h, 14, seed, 'rgba(0,0,0,0.25)', 12);
  grain(x, w, h, 0.05, seed + 1);
}
/** Edmund Hale, the night manager, as he was (or with his porcelain face). */
export function portraitHale(masked = false) {
  return canvasTex('portraitHale' + (masked ? 'M' : ''), 256, 320, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h * 0.4, 10, w / 2, h * 0.4, 220); g.addColorStop(0, '#4a3420'); g.addColorStop(1, '#120a06');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    strokes(x, w, h, 120, 3, ['#3a2a18', '#5a4028', '#1a120a'], 40, 10);
    // coat and shoulders
    x.fillStyle = '#0c0c0e'; x.beginPath(); x.moveTo(20, h); x.bezierCurveTo(30, 230, 80, 200, 128, 196); x.bezierCurveTo(176, 200, 226, 230, 236, h); x.fill();
    x.fillStyle = '#d8d0c0'; x.beginPath(); x.moveTo(110, 200); x.lineTo(128, 250); x.lineTo(146, 200); x.fill();
    x.fillStyle = '#6a1018'; x.beginPath(); x.moveTo(118, 206); x.lineTo(128, 214); x.lineTo(138, 206); x.lineTo(138, 222); x.lineTo(128, 214); x.lineTo(118, 222); x.fill();
    // neck
    x.fillStyle = masked ? '#1a1414' : '#a89078'; x.fillRect(116, 160, 24, 44);
    if (!masked) {
      // a gaunt face
      x.fillStyle = '#c0a888'; x.beginPath(); x.ellipse(128, 120, 38, 54, 0, 0, 7); x.fill();
      x.fillStyle = 'rgba(60,40,30,0.35)'; x.beginPath(); x.ellipse(104, 132, 8, 22, 0.1, 0, 7); x.fill(); x.beginPath(); x.ellipse(152, 132, 8, 22, -0.1, 0, 7); x.fill();
      x.fillStyle = '#16100c'; x.beginPath(); x.ellipse(128, 76, 42, 22, 0, Math.PI, 0); x.fill();
      for (const ex of [112, 144]) { x.fillStyle = '#2a1a12'; x.beginPath(); x.ellipse(ex, 112, 9, 5, 0, 0, 7); x.fill(); x.fillStyle = '#e8e0d0'; x.beginPath(); x.arc(ex + 1, 111, 2, 0, 7); x.fill(); }
      x.strokeStyle = '#4a2a20'; x.lineWidth = 2; x.beginPath(); x.moveTo(110, 150); x.quadraticCurveTo(128, 158, 146, 150); x.stroke();
      x.strokeStyle = 'rgba(40,25,15,0.6)'; x.beginPath(); x.moveTo(128, 116); x.lineTo(124, 138); x.lineTo(132, 140); x.stroke();
    } else {
      maskFaceDraw(x, 128, 118, 0.2, false);
    }
    canvasAge(x, w, h, 7);
  });
}
export function painting(kind, seed = 1) {
  return canvasTex('painting:' + kind, 256, 320, (x, w, h) => {
    const r = rng(seed);
    if (kind === 'sea') {
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1a2228'); g.addColorStop(0.45, '#3a4a50'); g.addColorStop(0.5, '#1a2a30'); g.addColorStop(1, '#0a1014'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      strokes(x, w, h, 260, seed, ['#5a6a70', '#2a3a40', '#8a9aa0', '#10181c'], 40, 6);
      x.fillStyle = '#d8d4c0'; x.fillRect(180, 120, 10, 40); x.fillStyle = '#f8e8a0'; x.beginPath(); x.arc(185, 118, 6, 0, 7); x.fill();
      x.strokeStyle = 'rgba(220,230,255,0.8)'; x.lineWidth = 2; x.beginPath(); x.moveTo(60, 0); x.lineTo(70, 40); x.lineTo(56, 60); x.lineTo(72, 110); x.stroke();
    } else if (kind === 'hotel') {
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0a0e18'); g.addColorStop(1, '#1a1a20'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = '#e8e0c0'; x.beginPath(); x.arc(200, 60, 18, 0, 7); x.fill();
      x.fillStyle = '#05060a'; x.fillRect(40, 120, 176, 170); x.beginPath(); x.moveTo(30, 122); x.lineTo(128, 80); x.lineTo(226, 122); x.fill();
      for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) { x.fillStyle = r() < 0.25 ? '#e8b850' : '#14161c'; x.fillRect(56 + j * 32, 140 + i * 34, 14, 20); }
      x.fillStyle = '#e8b850'; x.fillRect(56 + 4 * 32, 140, 14, 20); // the light in room 313
      x.fillStyle = '#05060a'; x.fillRect(0, 290, w, 30);
      strokes(x, w, h, 120, seed, ['#1a1e2a', '#2a2e3a', '#0a0c12'], 30, 5);
    } else if (kind === 'lady') {
      x.fillStyle = '#1a2a20'; x.fillRect(0, 0, w, h);
      strokes(x, w, h, 140, seed, ['#2a3a2a', '#0a140e', '#3a4a30'], 40, 10);
      x.fillStyle = '#060608'; x.beginPath(); x.moveTo(40, h); x.bezierCurveTo(50, 200, 90, 170, 128, 168); x.bezierCurveTo(166, 170, 206, 200, 216, h); x.fill();
      x.fillStyle = '#b8a890'; x.beginPath(); x.ellipse(128, 120, 32, 44, 0, 0, 7); x.fill();
      x.fillStyle = '#100a08'; x.beginPath(); x.ellipse(128, 96, 44, 40, 0, Math.PI, 0); x.fill(); x.fillRect(84, 96, 14, 80); x.fillRect(158, 96, 14, 80);
      // the face has been scratched out
      x.strokeStyle = 'rgba(20,10,8,0.9)'; x.lineWidth = 3;
      for (let i = 0; i < 30; i++) { x.beginPath(); const a = r() * 7; x.moveTo(128 + Math.cos(a) * 30, 120 + Math.sin(a) * 40); x.lineTo(128 + Math.cos(a + 3) * 30, 120 + Math.sin(a + 3) * 40); x.stroke(); }
    } else if (kind === 'forest') {
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a2e28'); g.addColorStop(1, '#0e100c'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 18; i++) { const tx = r() * w, tw = 6 + r() * 14; x.fillStyle = `rgba(10,12,8,${0.5 + r() * 0.5})`; x.fillRect(tx, 0, tw, h); }
      x.fillStyle = 'rgba(160,170,150,0.15)'; x.fillRect(0, 200, w, 50);
      // someone tall standing between the trees
      x.fillStyle = '#050505'; x.fillRect(150, 150, 5, 70); x.beginPath(); x.arc(152, 146, 5, 0, 7); x.fill(); x.fillRect(146, 160, 2, 46); x.fillRect(157, 160, 2, 46);
      x.fillStyle = '#e8e4dc'; x.beginPath(); x.arc(152, 146, 3, 0, 7); x.fill();
    } else if (kind === 'family') {
      x.fillStyle = '#2a2018'; x.fillRect(0, 0, w, h);
      strokes(x, w, h, 100, seed, ['#3a2a1a', '#1a120a'], 30, 8);
      const people = [[70, 150, 1.1], [128, 140, 1.25], [186, 150, 1.1], [100, 210, 0.7], [156, 210, 0.7]];
      for (const [px, py, s] of people) {
        x.fillStyle = '#0e0a08'; x.beginPath(); x.moveTo(px - 30 * s, h); x.lineTo(px - 20 * s, py + 30 * s); x.lineTo(px + 20 * s, py + 30 * s); x.lineTo(px + 30 * s, h); x.fill();
        x.fillStyle = '#b09878'; x.beginPath(); x.ellipse(px, py, 15 * s, 20 * s, 0, 0, 7); x.fill();
        x.fillStyle = '#0a0606'; x.beginPath(); x.arc(px - 5 * s, py - 3 * s, 2.5 * s, 0, 7); x.arc(px + 5 * s, py - 3 * s, 2.5 * s, 0, 7); x.fill();
      }
      // one of them has been painted over with a white, smiling face
      maskFaceDraw(x, 128, 140, 0.075, false);
    }
    canvasAge(x, w, h, seed + 3);
  });
}

// --- the Night Manager's face ------------------------------------------------------------------------------------
/** The porcelain mask, drawn centred at (cx, cy), scale s (1 = 512 px canvas face). */
function maskFaceDraw(x, cx, cy, s, full = true) {
  x.save(); x.translate(cx, cy); x.scale(s, s);
  // a long porcelain face, yellowed at the edges
  const g = x.createRadialGradient(-30, -70, 20, 0, 0, 290);
  g.addColorStop(0, '#fdfaf3'); g.addColorStop(0.55, '#e4ddcf'); g.addColorStop(0.85, '#b8ae98'); g.addColorStop(1, '#7a705e');
  x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, 196, 252, 0, 0, 7); x.fill();
  // rouged cheeks, too high
  for (const sx of [-1, 1]) { const cg = x.createRadialGradient(sx * 112, 40, 4, sx * 112, 40, 62); cg.addColorStop(0, 'rgba(200,60,70,0.45)'); cg.addColorStop(1, 'rgba(200,60,70,0)'); x.fillStyle = cg; x.beginPath(); x.arc(sx * 112, 40, 62, 0, 7); x.fill(); }
  // thin painted brows, arched in surprise
  x.strokeStyle = '#140e0e'; x.lineWidth = 7; x.lineCap = 'round';
  for (const sx of [-1, 1]) { x.beginPath(); x.moveTo(sx * 26, -128); x.quadraticCurveTo(sx * 92, -190, sx * 156, -118); x.stroke(); }
  // the eyes: big black hollows, slanted, with a ring of grime round them
  for (const sx of [-1, 1]) {
    const rg = x.createRadialGradient(sx * 92, -68, 20, sx * 92, -68, 92); rg.addColorStop(0, 'rgba(40,20,16,0.6)'); rg.addColorStop(1, 'rgba(40,20,16,0)');
    x.fillStyle = rg; x.beginPath(); x.arc(sx * 92, -68, 92, 0, 7); x.fill();
    x.fillStyle = '#030202';
    x.beginPath(); x.moveTo(sx * 24, -62); x.bezierCurveTo(sx * 50, -118, sx * 140, -112, sx * 166, -52); x.bezierCurveTo(sx * 130, -24, sx * 58, -22, sx * 24, -62); x.fill();
    // black tears running down from them
    x.beginPath(); x.moveTo(sx * 84, -34); x.quadraticCurveTo(sx * 80, 40, sx * 90, 96); x.lineTo(sx * 98, 96); x.quadraticCurveTo(sx * 92, 30, sx * 102, -34); x.fill();
    x.beginPath(); x.arc(sx * 94, 98, 6, 0, 7); x.fill();
  }
  // the grin: ear to ear, the lips painted dark red, the mouth black, full of little teeth
  x.fillStyle = '#6a0a12';
  x.beginPath(); x.moveTo(-182, 52); x.bezierCurveTo(-130, 172, 130, 172, 182, 52); x.bezierCurveTo(130, 128, -130, 128, -182, 52); x.fill();
  x.fillStyle = '#050303';
  x.beginPath(); x.moveTo(-170, 62); x.bezierCurveTo(-118, 160, 118, 160, 170, 62); x.bezierCurveTo(118, 118, -118, 118, -170, 62); x.fill();
  x.fillStyle = '#e8e0c8';
  for (let i = -15; i <= 15; i++) {
    const tx = i * 10.5, up = 92 + (i * i) * -0.075 + 12, lo = 132 - (i * i) * 0.12;
    x.beginPath(); x.moveTo(tx - 4.5, up - 8); x.lineTo(tx + 4.5, up - 8); x.lineTo(tx, up + 10); x.fill();
    x.beginPath(); x.moveTo(tx - 4.5, lo + 6); x.lineTo(tx + 4.5, lo + 6); x.lineTo(tx, lo - 10); x.fill();
  }
  // the corners of the mouth turn up into cuts
  x.strokeStyle = '#3a0608'; x.lineWidth = 4;
  for (const sx of [-1, 1]) { x.beginPath(); x.moveTo(sx * 178, 54); x.quadraticCurveTo(sx * 196, 30, sx * 190, 4); x.stroke(); }
  if (full) {
    // cracks and chips
    x.strokeStyle = 'rgba(30,22,18,0.9)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(-40, -252); x.lineTo(-56, -190); x.lineTo(-34, -150); x.lineTo(-72, -100); x.lineTo(-62, -66); x.stroke();
    x.lineWidth = 2; x.beginPath(); x.moveTo(-56, -190); x.lineTo(-98, -176); x.moveTo(-34, -150); x.lineTo(-6, -136); x.lineTo(6, -108); x.stroke();
    x.beginPath(); x.moveTo(150, 150); x.lineTo(120, 180); x.lineTo(128, 220); x.moveTo(120, 180); x.lineTo(84, 196); x.stroke();
    x.fillStyle = 'rgba(60,50,40,0.75)'; x.beginPath(); x.moveTo(176, -40); x.lineTo(196, -30); x.lineTo(188, 10); x.lineTo(170, -6); x.fill();
    // old blood, spattered on the chin
    const r = rng(66);
    for (let i = 0; i < 30; i++) { x.fillStyle = `rgba(90,10,12,${0.3 + r() * 0.5})`; x.beginPath(); x.arc((r() - 0.5) * 220, 170 + r() * 70, 2 + r() * 7, 0, 7); x.fill(); }
  }
  x.restore();
}
export function maskTexture() {
  return canvasTex('mask2', 512, 512, (x, w, h) => {
    x.fillStyle = '#0a0808'; x.fillRect(0, 0, w, h);
    maskFaceDraw(x, w / 2, h / 2, 1, true);
    // dirt in the corners of the eyes and mouth
    const d = x.getImageData(0, 0, w, h), p = d.data, n = fbm(512, 512, 31, 8, 4);
    for (let i = 0, j = 0; i < p.length; i += 4, j++) { const k = 0.82 + n[j] * 0.3; p[i] *= k; p[i + 1] *= k * 0.98; p[i + 2] *= k * 0.95; }
    x.putImageData(d, 0, 0);
  }, { clamp: true });
}

/** His eyes: wet, yellowed and bloodshot, a pale iris and a pinprick pupil (the iris faces +z on a sphere). */
export function eyeball() {
  return canvasTex('eyeball', 256, 128, (x, w, h) => {
    const r = rng(77), cx = w * 0.25, cy = h / 2;
    const g = x.createRadialGradient(cx, cy, 10, cx, cy, 90);
    g.addColorStop(0, '#e6dcc0'); g.addColorStop(0.45, '#d2c09a'); g.addColorStop(0.8, '#a86a50'); g.addColorStop(1, '#5a2018');
    x.fillStyle = '#5a2018'; x.fillRect(0, 0, w, h);
    x.fillStyle = g; x.fillRect(0, 0, w * 0.6, h);
    // the veins crawl in from the edges towards the iris
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      let px = cx + Math.cos(a) * 70, py = cy + Math.sin(a) * 50, ang = a + Math.PI;
      x.strokeStyle = `rgba(${150 + r() * 60},${10 + r() * 20},${14 + r() * 20},${0.5 + r() * 0.4})`; x.lineWidth = 0.6 + r() * 1.6;
      x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 6; k++) { ang += (r() - 0.5) * 1.1; px += Math.cos(ang) * 7; py += Math.sin(ang) * 7; x.lineTo(px, py); if (Math.hypot(px - cx, py - cy) < 22) break; }
      x.stroke();
    }
    // the iris: pale and clouded, a dark rim
    const ig = x.createRadialGradient(cx, cy, 2, cx, cy, 19);
    ig.addColorStop(0, '#8a8050'); ig.addColorStop(0.35, '#c8c088'); ig.addColorStop(0.8, '#9a8a50'); ig.addColorStop(1, '#2a1a08');
    x.fillStyle = ig; x.beginPath(); x.arc(cx, cy, 19, 0, 7); x.fill();
    x.strokeStyle = 'rgba(60,40,10,0.5)'; x.lineWidth = 0.8;
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; x.beginPath(); x.moveTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5); x.lineTo(cx + Math.cos(a) * 17, cy + Math.sin(a) * 17); x.stroke(); }
    // the pupil: a pinprick
    x.fillStyle = '#000'; x.beginPath(); x.arc(cx, cy, 3.2, 0, 7); x.fill();
  }, { clamp: false });
}
/** The glow of his eyes in the beam (the iris only), for the emissive map. */
export function eyeshine() {
  return canvasTex('eyeshine', 256, 128, (x, w, h) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    const cx = w * 0.25, cy = h / 2, g = x.createRadialGradient(cx, cy, 3, cx, cy, 20);
    g.addColorStop(0, '#000'); g.addColorStop(0.2, '#fff'); g.addColorStop(0.75, '#c8b070'); g.addColorStop(1, '#000');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, 20, 0, 7); x.fill();
  });
}
/** A soft round glow (for sprites). */
export function glowDot() {
  return canvasTex('glowdot', 64, 64, (x, w, h) => {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,240,200,0.8)'); g.addColorStop(0.45, 'rgba(255,200,120,0.15)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }, { clamp: true });
}
/** Lank, greasy hair: strands, see-through between them (white = hair, for an alpha map). */
export function hairStrands() {
  return canvasTex('hair', 64, 256, (x, w, h) => {
    const r = rng(91);
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      let px = r() * w; const wd = 1 + r() * 3.5, end = h * (0.55 + r() * 0.45);
      x.strokeStyle = `rgba(255,255,255,${0.7 + r() * 0.3})`; x.lineWidth = wd; x.lineCap = 'round';
      x.beginPath(); x.moveTo(px, 0);
      for (let y = 0; y < end; y += 16) { px += (r() - 0.5) * 3; x.lineTo(Math.max(1, Math.min(w - 1, px)), y); }
      x.stroke();
    }
    // a solid band at the top where it grows from the scalp
    const g = x.createLinearGradient(0, 0, 0, 40); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, 40);
  }, { linear: true, clamp: true });
}
/** His shirt front: once white, now yellowed - and stained from the collar down where something ran out of his mouth. */
export function shirtBlood() {
  return canvasTex('shirtBlood', 128, 256, (x, w, h) => {
    const r = rng(44);
    x.fillStyle = '#b4ac98'; x.fillRect(0, 0, w, h);
    mottle(x, w, h, 45, 0.35, 2, 4);
    stains(x, w, h, 6, 46, 1.4);
    // the big stain under the collar, and drips running down from it
    const g = x.createRadialGradient(w / 2, 6, 4, w / 2, 10, 70);
    g.addColorStop(0, 'rgba(60,6,6,0.95)'); g.addColorStop(0.5, 'rgba(80,12,10,0.75)'); g.addColorStop(1, 'rgba(90,20,14,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, 90);
    for (let i = 0; i < 9; i++) {
      const px = w / 2 + (r() - 0.5) * 70, len = 60 + r() * 170, wd = 2 + r() * 6;
      x.fillStyle = `rgba(${60 + r() * 30},${6 + r() * 8},${6 + r() * 8},${0.6 + r() * 0.35})`;
      x.beginPath(); x.moveTo(px - wd / 2, 20); x.lineTo(px + wd / 2, 20); x.lineTo(px + wd * 0.3, len); x.arc(px, len, wd * 0.5, 0, Math.PI); x.lineTo(px - wd * 0.3, 20); x.fill();
    }
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(70,8,8,${0.3 + r() * 0.5})`; x.beginPath(); x.arc(r() * w, r() * h * 0.7, 0.8 + r() * 2.5, 0, 7); x.fill(); }
    grain(x, w, h, 0.05, 47);
  }, { clamp: true });
}

// --- children's drawings, signs, writing, notes, clocks ----------------------------------------------------------
export function crayonDrawing(kind, seed = 1) {
  return canvasTex('crayon:' + kind, 256, 256, (x, w, h) => {
    const r = rng(seed);
    x.fillStyle = '#ece6d4'; x.fillRect(0, 0, w, h);
    const cray = (col, width, pts) => { x.strokeStyle = col; x.lineWidth = width; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px + (r() - 0.5) * 2, py + (r() - 0.5) * 2) : x.moveTo(px, py))); x.stroke(); };
    if (kind === 'tallman') {
      // the hotel, small people, and him
      cray('#3a5aa0', 3, [[20, 230], [236, 230]]);
      for (const px of [40, 70]) { cray('#1a1a1a', 3, [[px, 230], [px, 200]]); cray('#1a1a1a', 3, [[px - 8, 215], [px + 8, 215]]); x.strokeStyle = '#1a1a1a'; x.beginPath(); x.arc(px, 192, 8, 0, 7); x.stroke(); }
      cray('#1a1a1a', 4, [[170, 230], [176, 90]]); cray('#1a1a1a', 4, [[176, 90], [196, 230]]);
      cray('#1a1a1a', 4, [[150, 100], [176, 100], [206, 104]]); cray('#1a1a1a', 3, [[150, 100], [140, 180]]); cray('#1a1a1a', 3, [[206, 104], [216, 184]]);
      x.fillStyle = '#f8f4ec'; x.beginPath(); x.arc(178, 70, 20, 0, 7); x.fill(); x.strokeStyle = '#1a1a1a'; x.lineWidth = 3; x.stroke();
      cray('#c01818', 3, [[162, 76], [178, 86], [194, 76]]);
      x.fillStyle = '#000'; x.beginPath(); x.arc(171, 66, 3, 0, 7); x.arc(185, 66, 3, 0, 7); x.fill();
      x.font = 'bold 22px "Comic Sans MS", cursive'; x.fillStyle = '#c01818'; x.fillText('HE SMILES', 20, 40);
    } else if (kind === 'hide') {
      // a wardrobe with someone in it, and "dont breathe"
      x.strokeStyle = '#6a3a14'; x.lineWidth = 4; x.strokeRect(80, 60, 100, 160); cray('#6a3a14', 3, [[130, 60], [130, 220]]);
      x.fillStyle = '#1a1a1a'; x.beginPath(); x.arc(150, 130, 6, 0, 7); x.arc(162, 130, 6, 0, 7); x.fill();
      cray('#1a1a1a', 3, [[30, 230], [60, 110], [70, 230]]); x.fillStyle = '#fff'; x.beginPath(); x.arc(60, 100, 12, 0, 7); x.fill(); x.strokeStyle = '#000'; x.stroke();
      x.font = 'bold 20px "Comic Sans MS", cursive'; x.fillStyle = '#1a1a1a'; x.fillText('DONT BREATHE', 30, 40);
      cray('#e0c020', 5, [[200, 20], [210, 40], [220, 20]]);
    } else {
      // lights going funny: lamps with zigzags
      for (const [px, py] of [[50, 60], [128, 60], [206, 60]]) { cray('#e0c020', 4, [[px - 10, py], [px + 10, py], [px, py + 20], [px - 10, py]]); cray('#e0c020', 2, [[px - 16, py + 26], [px - 22, py + 34]]); cray('#e0c020', 2, [[px + 16, py + 26], [px + 22, py + 34]]); }
      x.font = 'bold 18px "Comic Sans MS", cursive'; x.fillStyle = '#1a1a1a'; x.fillText('when the lites go', 20, 150); x.fillText('funny HIDE', 60, 180);
    }
    grain(x, w, h, 0.05, seed + 2);
  });
}
/** A sign: text on a plate (brass, enamel, painted...). */
export function sign(text, o = {}) {
  const w = o.w || 256, h = o.h || 96;
  return canvasTex(`sign:${text}:${o.style || 'brass'}:${w}x${h}`, w, h, (x) => {
    const style = o.style || 'brass';
    if (style === 'brass') { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#c8a050'); g.addColorStop(0.5, '#8a6a28'); g.addColorStop(1, '#b08c40'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.strokeStyle = '#3a2a10'; x.lineWidth = 4; x.strokeRect(4, 4, w - 8, h - 8); }
    else if (style === 'enamel') { x.fillStyle = o.bg || '#e8e4d8'; x.fillRect(0, 0, w, h); x.strokeStyle = o.fg || '#1a1a1a'; x.lineWidth = 6; x.strokeRect(6, 6, w - 12, h - 12); }
    else if (style === 'paint') { x.clearRect(0, 0, w, h); }
    else if (style === 'exit') { x.fillStyle = '#1a0606'; x.fillRect(0, 0, w, h); }
    else { x.fillStyle = o.bg || '#202020'; x.fillRect(0, 0, w, h); }
    const lines = String(text).split('\n');
    let fs = o.size || h * 0.55 / lines.length;
    const font = () => { x.font = `${o.weight || 'bold'} ${fs}px ${o.font || 'Georgia, "Times New Roman", serif'}`; };
    font();
    while (Math.max(...lines.map((l) => x.measureText(l).width)) > w * 0.88 && fs > 8) { fs -= 2; font(); }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach((l, i) => {
      const y = h / 2 + (i - (lines.length - 1) / 2) * fs * 1.12;
      if (style === 'brass') { x.fillStyle = 'rgba(255,240,200,0.5)'; x.fillText(l, w / 2 + 1, y + 1); x.fillStyle = '#2a1a08'; x.fillText(l, w / 2, y); }
      else if (style === 'exit') { x.fillStyle = '#ff3020'; x.fillText(l, w / 2, y); }
      else { x.fillStyle = o.fg || '#1a1a1a'; x.fillText(l, w / 2, y); }
    });
    if (style !== 'paint') grain(x, w, h, 0.04, text.length);
  });
}
/** Writing on a wall: dark red, dripping (transparent background). */
export function writing(text, o = {}) {
  const w = o.w || 512, h = o.h || 128;
  return canvasTex('writing:' + text, w, h, (x) => {
    x.clearRect(0, 0, w, h);
    const r = rng(text.length * 7 + 3);
    const lines = text.split('\n');
    let fs = h * 0.6 / lines.length;
    x.font = `bold ${fs}px "Brush Script MT", "Segoe Script", cursive`;
    while (Math.max(...lines.map((l) => x.measureText(l).width)) > w * 0.92 && fs > 10) { fs -= 2; x.font = `bold ${fs}px "Brush Script MT", "Segoe Script", cursive`; }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach((l, i) => {
      const y = h / 2 + (i - (lines.length - 1) / 2) * fs * 1.1;
      x.fillStyle = o.color || 'rgba(110,8,10,0.92)';
      x.fillText(l, w / 2, y);
      // drips under the letters
      const tw = x.measureText(l).width;
      for (let k = 0; k < l.length * 0.6; k++) { const dx = w / 2 - tw / 2 + r() * tw, dl = 6 + r() * h * 0.4; x.fillRect(dx, y + fs * 0.2, 2 + r() * 2, dl); x.beginPath(); x.arc(dx + 2, y + fs * 0.2 + dl, 2.5, 0, 7); x.fill(); }
    });
  }, { clamp: true });
}
export function handprint() {
  return canvasTex('handprint', 128, 128, (x) => {
    x.clearRect(0, 0, 128, 128);
    x.fillStyle = 'rgba(100,6,8,0.85)';
    x.beginPath(); x.ellipse(64, 80, 24, 28, 0, 0, 7); x.fill();
    for (const [fx, fy, a] of [[34, 40, -0.4], [50, 28, -0.15], [66, 24, 0], [82, 30, 0.2], [96, 62, 0.9]]) { x.save(); x.translate(fx, fy); x.rotate(a); x.beginPath(); x.ellipse(0, 0, 6, 16, 0, 0, 7); x.fill(); x.restore(); }
    for (let i = 0; i < 6; i++) x.fillRect(48 + i * 6, 100, 3, 10 + i * 4);
  }, { clamp: true });
}
/** A sheet of paper with illegible lines (for notes lying around). */
export function paper(seed = 1, o = {}) {
  return canvasTex('paper:' + seed + (o.typed ? 't' : ''), 128, 160, (x, w, h) => {
    x.fillStyle = '#e4dcc4'; x.fillRect(0, 0, w, h);
    mottle(x, w, h, seed, 0.12, 2, 3);
    const r = rng(seed);
    x.strokeStyle = o.typed ? 'rgba(30,30,30,0.7)' : 'rgba(30,30,80,0.65)'; x.lineWidth = 1.5;
    for (let y = 18; y < h - 14; y += 9) { let px = 12; x.beginPath(); x.moveTo(px, y); while (px < w - 14 - r() * 30) { px += 3 + r() * 4; x.lineTo(px, y + (o.typed ? 0 : (r() - 0.5) * 2)); } x.stroke(); }
    stains(x, w, h, 2, seed + 1, 1.5);
  });
}
export function clockFace(o = {}) {
  return canvasTex('clock:' + (o.style || 'a'), 256, 256, (x, w, h) => {
    x.fillStyle = o.bg || '#e8e0c8'; x.beginPath(); x.arc(128, 128, 124, 0, 7); x.fill();
    x.strokeStyle = '#2a2018'; x.lineWidth = 6; x.stroke();
    const rom = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    x.fillStyle = '#1a1410'; x.font = 'bold 22px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 - Math.PI / 2; x.fillText(rom[i], 128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96); }
    for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; x.fillRect(128 + Math.cos(a) * 112 - 1, 128 + Math.sin(a) * 112 - 1, 2, 2); }
    // 3:33
    const hand = (a, len, wd) => { x.save(); x.translate(128, 128); x.rotate(a); x.fillStyle = '#100c08'; x.beginPath(); x.moveTo(-wd, 10); x.lineTo(0, -len); x.lineTo(wd, 10); x.fill(); x.restore(); };
    hand((3 + 33 / 60) / 12 * Math.PI * 2, 58, 6);
    hand(33 / 60 * Math.PI * 2, 88, 4);
    x.fillStyle = '#100c08'; x.beginPath(); x.arc(128, 128, 7, 0, 7); x.fill();
    stains(x, w, h, 1, 4, 0.7);
  }, { clamp: true });
}
export function bookSpines(seed = 1) {
  return canvasTex('books:' + seed, 256, 128, (x, w, h) => {
    const r = rng(seed), cols = ['#5a1a14', '#1a2a4a', '#2a3a1a', '#4a3a1a', '#3a1a2a', '#1a1a1a', '#6a5a3a'];
    x.fillStyle = '#100a06'; x.fillRect(0, 0, w, h);
    let px = 0;
    while (px < w) {
      const bw = 6 + r() * 12, bh = h * (0.7 + r() * 0.3);
      x.fillStyle = cols[Math.floor(r() * cols.length)]; x.fillRect(px, h - bh, bw - 1, bh);
      x.fillStyle = 'rgba(200,170,90,0.6)'; x.fillRect(px + 1, h - bh + 8, bw - 3, 2); x.fillRect(px + 1, h - 12, bw - 3, 2);
      px += bw;
    }
    grain(x, w, h, 0.06, seed + 1);
  });
}
export function keyCubbies() {
  return canvasTex('cubbies', 512, 256, (x, w, h) => {
    x.fillStyle = '#2a1608'; x.fillRect(0, 0, w, h);
    const cols = 8, rows = 4, cw = w / cols, ch = h / rows, r = rng(9);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      x.fillStyle = '#0a0503'; x.fillRect(i * cw + 6, j * ch + 6, cw - 12, ch - 18);
      x.fillStyle = '#c8a050'; x.font = 'bold 12px Georgia'; x.textAlign = 'center';
      x.fillText(String(300 + (rows - 1 - j) * 0 + i + 1 + j * 8), i * cw + cw / 2, j * ch + ch - 4);
      if (r() < 0.55) { x.fillStyle = '#b08c40'; x.fillRect(i * cw + cw / 2 - 2, j * ch + 12, 4, 26); x.beginPath(); x.ellipse(i * cw + cw / 2, j * ch + 42, 6, 9, 0, 0, 7); x.fill(); }
    }
    grain(x, w, h, 0.05, 3);
  });
}
export function pegboard() {
  return canvasTex('pegboard', 256, 256, (x, w, h) => {
    x.fillStyle = '#8a6a44'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#3a2a18'; for (let i = 8; i < w; i += 16) for (let j = 8; j < h; j += 16) { x.beginPath(); x.arc(i, j, 2.2, 0, 7); x.fill(); }
    x.fillStyle = '#2a2a2a';
    x.fillRect(30, 40, 60, 10); x.fillRect(80, 30, 14, 30); // hammer
    x.save(); x.translate(160, 60); x.rotate(0.5); x.fillRect(-4, -40, 8, 80); x.beginPath(); x.arc(0, -40, 12, 0, 7); x.fill(); x.restore(); // wrench
    x.fillRect(40, 140, 120, 30); x.fillStyle = '#5a3a1a'; x.fillRect(150, 136, 40, 38); // saw
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.strokeStyle = '#1a1a1a'; x.lineWidth = 2; x.strokeRect(190, 120, 40, 90); // outline of the missing bolt cutters
    grain(x, w, h, 0.06, 4);
  });
}
export function tvStatic(seed = 1) {
  const c = document.createElement('canvas'); c.width = 96; c.height = 72;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const x = c.getContext('2d'), img = x.createImageData(96, 72);
  t.userData.update = (face = 0) => {
    const p = img.data;
    for (let i = 0; i < p.length; i += 4) { const v = Math.random() * 255; p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 255; }
    x.putImageData(img, 0, 0);
    if (face > 0) { x.globalAlpha = face; maskFaceDraw(x, 48, 38, 0.13, false); x.globalAlpha = 1; }
    t.needsUpdate = true;
  };
  t.userData.update();
  void seed;
  return t;
}
export function crest() {
  return canvasTex('crest', 512, 512, (x, w, h) => {
    x.fillStyle = '#e8e2d6'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#121212'; x.beginPath(); x.arc(256, 256, 240, 0, 7); x.fill();
    x.fillStyle = '#b08c40'; x.beginPath(); x.arc(256, 256, 228, 0, 7); x.fill();
    x.fillStyle = '#141414'; x.beginPath(); x.arc(256, 256, 216, 0, 7); x.fill();
    x.fillStyle = '#c8a050'; ravenShape(x, 256, 236, 1.4);
    x.font = 'bold 34px Georgia'; x.textAlign = 'center'; x.fillText('RAVENHURST', 256, 400); x.font = '22px Georgia'; x.fillText('EST. 1923', 256, 132);
    // compass points
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; x.beginPath(); x.moveTo(256 + Math.cos(a) * 228, 256 + Math.sin(a) * 228); x.lineTo(256 + Math.cos(a + 0.06) * 250, 256 + Math.sin(a + 0.06) * 250); x.lineTo(256 + Math.cos(a - 0.06) * 250, 256 + Math.sin(a - 0.06) * 250); x.fill(); }
    grain(x, w, h, 0.05, 2);
  }, { clamp: true });
}
export function dial() {
  return canvasTex('dial', 256, 128, (x, w, h) => {
    x.fillStyle = '#1a1206'; x.fillRect(0, 0, w, h);
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#d8b060'); g.addColorStop(1, '#8a6420');
    x.fillStyle = g; x.beginPath(); x.arc(128, 120, 112, Math.PI, 0); x.fill();
    x.fillStyle = '#100a04'; x.beginPath(); x.arc(128, 120, 96, Math.PI, 0); x.fill();
    x.fillStyle = '#e8c878'; x.font = 'bold 26px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle';
    ['B', '1', '2', '3'].forEach((s, i) => { const a = Math.PI + (i + 0.5) / 4 * Math.PI; x.fillText(s, 128 + Math.cos(a) * 78, 120 + Math.sin(a) * 78); });
  }, { clamp: true });
}
export function cardboard(seed = 1) {
  return canvasTex('cardboard', 256, 256, (x, w, h) => {
    x.fillStyle = '#8a6a44'; x.fillRect(0, 0, w, h);
    mottle(x, w, h, seed, 0.15, 4, 3);
    x.fillStyle = 'rgba(60,40,20,0.5)'; x.fillRect(0, h / 2 - 10, w, 20);
    x.font = 'bold 20px Arial'; x.fillStyle = 'rgba(30,20,10,0.6)'; x.textAlign = 'center'; x.fillText('RAVENHURST - LINENS', w / 2, 70);
    grain(x, w, h, 0.05, seed + 1);
  });
}

/** A piano keyboard seen from above (52 white keys, the black ones between). */
export function pianoKeys() {
  return canvasTex('pianoKeys', 1024, 64, (x, w, h) => {
    x.fillStyle = '#d8d0bc'; x.fillRect(0, 0, w, h);
    const n = 52, kw = w / n;
    x.strokeStyle = '#6a6250'; x.lineWidth = 1.5;
    for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * kw, 0); x.lineTo(i * kw, h); x.stroke(); }
    x.fillStyle = '#0c0a08';
    for (let i = 0; i < n - 1; i++) { const m = (i + 5) % 7; if (m === 2 || m === 6) continue; x.fillRect((i + 1) * kw - kw * 0.3, 0, kw * 0.6, h * 0.6); }
    // a few yellowed, a few missing
    const r = rng(7);
    for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(120,90,40,0.25)'; x.fillRect(Math.floor(r() * n) * kw + 1, 0, kw - 2, h); }
    grain(x, w, h, 0.05, 8);
  });
}
/** A pressure gauge's face. */
export function gauge() {
  return canvasTex('gauge', 128, 128, (x, w, h) => {
    x.fillStyle = '#1a1712'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e4dcc4'; x.beginPath(); x.arc(64, 64, 58, 0, 7); x.fill();
    x.strokeStyle = '#1a1a1a'; x.lineWidth = 2;
    for (let i = 0; i <= 10; i++) { const a = Math.PI * 0.75 + i / 10 * Math.PI * 1.5; x.beginPath(); x.moveTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48); x.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); x.stroke(); }
    x.strokeStyle = '#a01010'; x.lineWidth = 6; x.beginPath(); x.arc(64, 64, 52, Math.PI * 1.95, Math.PI * 2.25); x.stroke();
    x.strokeStyle = '#000'; x.lineWidth = 3; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(Math.PI * 2.1) * 46, 64 + Math.sin(Math.PI * 2.1) * 46); x.stroke();
    x.font = 'bold 12px Georgia'; x.fillStyle = '#1a1a1a'; x.textAlign = 'center'; x.fillText('PSI', 64, 96);
    grain(x, w, h, 0.05, 9);
  }, { clamp: true });
}
