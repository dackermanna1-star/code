// Procedural canvas textures. Everything is painted at startup so the game ships no image
// assets. Painters use tileable value noise so world-space UVs repeat seamlessly.
import { BABYLON } from './babylon.js';
import { RNG } from '../core/random.js';

function makeNoise(period, seed) {
  const rng = new RNG(seed);
  const grid = new Float32Array(period * period);
  for (let i = 0; i < grid.length; i++) grid[i] = rng.next();
  const at = (x, y) => grid[((y % period + period) % period) * period + ((x % period + period) % period)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
/** Tileable fractal noise in [0,1] over a w x h canvas (periodic in both axes). */
function fbm(w, h, baseCells, octaves, seed) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push({ n: makeNoise(baseCells << o, seed + o * 101), cells: baseCells << o, amp: Math.pow(0.5, o) });
  const total = layers.reduce((s, l) => s + l.amp, 0);
  return (px, py) => {
    let v = 0;
    for (const l of layers) v += l.n((px / w) * l.cells, (py / h) * l.cells) * l.amp;
    return v / total;
  };
}
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
/** Fill a canvas with a base colour modulated by noise. */
function noiseBase(ctx, w, h, color, amp, cells, octaves, seed, tint = null) {
  const img = ctx.createImageData(w, h);
  const n = fbm(w, h, cells, octaves, seed);
  const n2 = tint ? fbm(w, h, Math.max(2, cells >> 1), 2, seed + 77) : null;
  const [r, g, b] = hex(color);
  const t = tint ? hex(tint) : null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = (n(x, y) - 0.5) * 2 * amp;
    let rr = r, gg = g, bb = b;
    if (t) { const k = Math.max(0, n2(x, y) - 0.5) * 1.6; rr += (t[0] - r) * k; gg += (t[1] - g) * k; bb += (t[2] - b) * k; }
    const i = (y * w + x) * 4;
    img.data[i] = rr * (1 + v); img.data[i + 1] = gg * (1 + v); img.data[i + 2] = bb * (1 + v); img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
function speckle(ctx, w, h, count, color, alpha, size, seed) {
  const rng = new RNG(seed);
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = alpha * rng.range(0.3, 1);
    const s = rng.range(size * 0.4, size);
    ctx.fillRect(rng.range(0, w), rng.range(0, h), s, s);
  }
  ctx.globalAlpha = 1;
}
function stains(ctx, w, h, count, color, radius, alpha, seed) {
  const rng = new RNG(seed);
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, w), y = rng.range(0, h), r = rng.range(radius * 0.3, radius);
    for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, color.replace('A', String(alpha * rng.range(0.5, 1))));
      g.addColorStop(1, color.replace('A', '0'));
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
}
function cracks(ctx, w, h, count, seed, color = 'rgba(30,30,30,0.35)') {
  const rng = new RNG(seed);
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    let x = rng.range(0, w), y = rng.range(0, h), a = rng.range(0, Math.PI * 2);
    ctx.beginPath(); ctx.moveTo(x, y);
    const n = rng.int(6, 18);
    for (let k = 0; k < n; k++) { a += rng.range(-0.7, 0.7); x += Math.cos(a) * rng.range(3, 9); y += Math.sin(a) * rng.range(3, 9); ctx.lineTo(x, y); }
    ctx.stroke();
  }
}
function gridLines(ctx, w, h, cw, ch, color, lw = 2, offsetRows = false) {
  ctx.strokeStyle = color; ctx.lineWidth = lw;
  for (let y = 0; y <= h; y += ch) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  let row = 0;
  for (let y = 0; y < h; y += ch, row++) {
    const off = offsetRows && row % 2 ? cw / 2 : 0;
    for (let x = off; x <= w + cw; x += cw) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + ch); ctx.stroke(); }
  }
}

// ---------------------------------------------------------------------------------------------
// Painters. Each returns a canvas. `scale` (metres per repeat) is used for world-space UVs.
const P = {};
P.concrete = (s = 1) => { const c = canvas(512, 512), x = c.getContext('2d'); noiseBase(x, 512, 512, '#8a8984', 0.13, 8, 5, 11 * s, '#7c7768'); stains(x, 512, 512, 7, 'rgba(60,55,45,A)', 90, 0.22, 3 * s); cracks(x, 512, 512, 5, 9 * s); speckle(x, 512, 512, 900, '#4d4b47', 0.35, 2.2, 5); return c; };
P.concreteDark = () => { const c = canvas(512, 512), x = c.getContext('2d'); noiseBase(x, 512, 512, '#5e5d59', 0.18, 8, 5, 21, '#4c473d'); stains(x, 512, 512, 10, 'rgba(25,25,20,A)', 110, 0.35, 8); cracks(x, 512, 512, 9, 4); return c; };
P.concretePolished = () => { const c = canvas(512, 512), x = c.getContext('2d'); noiseBase(x, 512, 512, '#9c9b95', 0.07, 6, 4, 31, '#8f8b80'); gridLines(x, 512, 512, 256, 256, 'rgba(50,50,50,0.35)', 2); stains(x, 512, 512, 4, 'rgba(70,60,50,A)', 70, 0.15, 12); return c; };
P.concreteLines = () => { const c = P.concrete(3), x = c.getContext('2d'); x.fillStyle = '#d9b42a'; x.globalAlpha = 0.8; x.fillRect(0, 0, 512, 22); x.fillRect(0, 490, 512, 22); x.globalAlpha = 1; return c; };
P.linoBlue = () => { const c = canvas(512, 512), x = c.getContext('2d'); noiseBase(x, 512, 512, '#a9bfc4', 0.06, 16, 3, 41); gridLines(x, 512, 512, 128, 128, 'rgba(90,110,120,0.35)', 1.5); speckle(x, 512, 512, 1400, '#6a8590', 0.25, 2, 2); return c; };
P.linoGreen = () => { const c = canvas(512, 512), x = c.getContext('2d'); noiseBase(x, 512, 512, '#8fa58a', 0.06, 16, 3, 43); gridLines(x, 512, 512, 128, 128, 'rgba(60,80,60,0.3)', 1.5); speckle(x, 512, 512, 1400, '#5f7558', 0.25, 2, 3); return c; };
P.checker = () => { const c = canvas(512, 512), x = c.getContext('2d'); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#e3dccb' : '#7a2e2a'; x.fillRect(i * 64, j * 64, 64, 64); } const n = fbm(512, 512, 8, 4, 51), img = x.getImageData(0, 0, 512, 512); for (let i = 0; i < img.data.length; i += 4) { const v = 0.88 + n((i / 4) % 512, Math.floor(i / 4 / 512)) * 0.2; img.data[i] *= v; img.data[i + 1] *= v; img.data[i + 2] *= v; } x.putImageData(img, 0, 0); stains(x, 512, 512, 6, 'rgba(80,60,30,A)', 60, 0.2, 13); return c; };
P.tileRed = () => { const c = canvas(512, 512), x = c.getContext('2d'); noiseBase(x, 512, 512, '#9a4b3a', 0.08, 8, 3, 61); gridLines(x, 512, 512, 64, 64, '#5a3328', 3); stains(x, 512, 512, 6, 'rgba(40,30,20,A)', 60, 0.25, 7); return c; };
P.tileWhite = () => { const c = canvas(512, 512), x = c.getContext('2d'); noiseBase(x, 512, 512, '#dfe3e2', 0.04, 8, 3, 71); gridLines(x, 512, 512, 42.67, 42.67, '#9aa3a2', 2.5); stains(x, 512, 512, 5, 'rgba(120,110,70,A)', 50, 0.18, 17); return c; };
P.rubber = () => { const c = canvas(512, 512), x = c.getContext('2d'); noiseBase(x, 512, 512, '#2d2f31', 0.12, 32, 2, 81); speckle(x, 512, 512, 2600, '#6b7072', 0.6, 2.2, 4); speckle(x, 512, 512, 500, '#8a2b20', 0.5, 2, 6); gridLines(x, 512, 512, 256, 256, '#151617', 3); return c; };
P.carpet = () => { const c = canvas(256, 256), x = c.getContext('2d'); noiseBase(x, 256, 256, '#4f5c6e', 0.12, 64, 2, 91); speckle(x, 256, 256, 1500, '#39424f', 0.5, 1.5, 9); return c; };
P.carpetRed = () => { const c = canvas(256, 256), x = c.getContext('2d'); noiseBase(x, 256, 256, '#7a3a34', 0.12, 64, 2, 93); speckle(x, 256, 256, 1200, '#4f221f', 0.5, 1.5, 11); x.strokeStyle = 'rgba(190,150,80,0.35)'; x.lineWidth = 3; x.strokeRect(16, 16, 224, 224); return c; };
P.grass = () => { const c = canvas(512, 512), x = c.getContext('2d'); noiseBase(x, 512, 512, '#5f7a3e', 0.22, 8, 5, 101, '#8a7a4a'); speckle(x, 512, 512, 4000, '#3f5a26', 0.5, 2.5, 12); speckle(x, 512, 512, 1500, '#9aa865', 0.35, 2, 13); return c; };
P.gravel = () => { const c = canvas(512, 512), x = c.getContext('2d'); noiseBase(x, 512, 512, '#8b8579', 0.15, 16, 3, 111); speckle(x, 512, 512, 5000, '#5b5650', 0.6, 3, 14); speckle(x, 512, 512, 3000, '#b5ae9f', 0.5, 2.5, 15); return c; };
P.asphalt = () => { const c = canvas(512, 512), x = c.getContext('2d'); noiseBase(x, 512, 512, '#55575a', 0.1, 16, 4, 121); speckle(x, 512, 512, 4000, '#2e3032', 0.5, 2, 16); speckle(x, 512, 512, 2000, '#8e9093', 0.4, 1.6, 17); cracks(x, 512, 512, 6, 19, 'rgba(20,20,20,0.5)'); return c; };
P.dirt = () => { const c = canvas(512, 512), x = c.getContext('2d'); noiseBase(x, 512, 512, '#8c6e4f', 0.18, 8, 5, 131, '#6d5640'); speckle(x, 512, 512, 2500, '#5f4a35', 0.5, 2.5, 18); return c; };
// Painted cinder-block walls: 0.4m x 0.2m blocks; texture covers 2m x 2m.
const blockWall = (color, seed, mortar = 'rgba(0,0,0,0.16)') => () => { const c = canvas(512, 512), x = c.getContext('2d'); noiseBase(x, 512, 512, color, 0.05, 16, 3, seed); gridLines(x, 512, 512, 102.4, 51.2, mortar, 3, true); stains(x, 512, 512, 4, 'rgba(70,60,40,A)', 60, 0.08, seed + 1); return c; };
P.paintGreen = blockWall('#6d8b76', 141); P.paintCream = blockWall('#d6ceb6', 143); P.paintMint = blockWall('#a8c9bd', 145);
P.paintBlue = blockWall('#5f7d9b', 147); P.paintRed = blockWall('#8e3f37', 149); P.paintOrange = blockWall('#c47d3e', 151);
P.paintYellow = blockWall('#c9a53a', 153); P.paintGray = blockWall('#8d9295', 155); P.paintWhite = blockWall('#e3e2dc', 157);
P.paintSlate = blockWall('#58636b', 159); P.paintTeal = blockWall('#4f8783', 161);
P.grimWall = () => { const c = blockWall('#77756c', 163, 'rgba(0,0,0,0.25)')(), x = c.getContext('2d'); stains(x, 512, 512, 12, 'rgba(30,28,20,A)', 120, 0.3, 20); cracks(x, 512, 512, 6, 21); return c; };
P.trim = () => { const c = canvas(64, 64), x = c.getContext('2d'); noiseBase(x, 64, 64, '#3c4a40', 0.06, 4, 2, 171); return c; };
P.brick = () => { const c = canvas(512, 512), x = c.getContext('2d'); noiseBase(x, 512, 512, '#8a4a36', 0.1, 16, 3, 181, '#6b3a2c'); const rng = new RNG(5); for (let r = 0; r < 16; r++) for (let k = -1; k < 9; k++) { const off = r % 2 ? 32 : 0; x.fillStyle = `rgba(${rng.int(60, 120)},${rng.int(25, 50)},${rng.int(15, 35)},0.25)`; x.fillRect(k * 64 + off + 2, r * 32 + 2, 60, 28); } gridLines(x, 512, 512, 64, 32, '#b8ad98', 3, true); stains(x, 512, 512, 6, 'rgba(30,30,30,A)', 90, 0.2, 22); return c; };
P.woodPanel = () => { const c = canvas(512, 512), x = c.getContext('2d'); noiseBase(x, 512, 512, '#7a5434', 0.1, 4, 4, 191); for (let i = 0; i < 512; i += 64) { x.fillStyle = 'rgba(40,25,10,0.5)'; x.fillRect(i, 0, 3, 512); } const rng = new RNG(8); x.strokeStyle = 'rgba(50,30,15,0.25)'; for (let i = 0; i < 80; i++) { x.beginPath(); const xx = rng.range(0, 512); x.moveTo(xx, 0); x.bezierCurveTo(xx + rng.range(-8, 8), 170, xx + rng.range(-8, 8), 340, xx, 512); x.stroke(); } return c; };
P.wallpaper = () => { const c = canvas(256, 256), x = c.getContext('2d'); noiseBase(x, 256, 256, '#b9ad86', 0.05, 8, 2, 193); x.fillStyle = 'rgba(110,80,50,0.25)'; for (let i = 0; i < 256; i += 32) x.fillRect(i, 0, 10, 256); return c; };
P.ceiling = () => { const c = canvas(256, 256), x = c.getContext('2d'); noiseBase(x, 256, 256, '#cfccc2', 0.05, 32, 2, 201); speckle(x, 256, 256, 1500, '#9a978d', 0.5, 1.5, 23); gridLines(x, 256, 256, 128, 128, '#8f8c83', 3); return c; };
P.steel = () => { const c = canvas(256, 256), x = c.getContext('2d'); noiseBase(x, 256, 256, '#9ea4a8', 0.06, 4, 3, 211); const rng = new RNG(4); for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(255,255,255,${rng.range(0, 0.06)})`; x.fillRect(0, rng.range(0, 256), 256, 1); } return c; };
P.iron = () => { const c = canvas(128, 128), x = c.getContext('2d'); noiseBase(x, 128, 128, '#3b3e42', 0.15, 8, 3, 221, '#5a3a24'); return c; };
P.wood = () => { const c = canvas(256, 256), x = c.getContext('2d'); noiseBase(x, 256, 256, '#9b7148', 0.08, 2, 4, 231); const rng = new RNG(9); x.strokeStyle = 'rgba(70,40,20,0.3)'; for (let i = 0; i < 40; i++) { x.beginPath(); const yy = rng.range(0, 256); x.moveTo(0, yy); x.bezierCurveTo(85, yy + rng.range(-6, 6), 170, yy + rng.range(-6, 6), 256, yy); x.stroke(); } return c; };
P.mattress = () => { const c = canvas(128, 128), x = c.getContext('2d'); noiseBase(x, 128, 128, '#c9cdd2', 0.05, 4, 2, 241); x.fillStyle = 'rgba(70,90,140,0.55)'; for (let i = 0; i < 128; i += 16) x.fillRect(i, 0, 5, 128); stains(x, 128, 128, 3, 'rgba(150,130,60,A)', 30, 0.3, 24); return c; };
P.fabric = () => { const c = canvas(128, 128), x = c.getContext('2d'); noiseBase(x, 128, 128, '#ffffff', 0.08, 32, 2, 251); for (let i = 0; i < 128; i += 4) { x.fillStyle = 'rgba(0,0,0,0.05)'; x.fillRect(0, i, 128, 1); } return c; };
P.paint = () => { const c = canvas(128, 128), x = c.getContext('2d'); noiseBase(x, 128, 128, '#ffffff', 0.05, 8, 3, 261); return c; };
P.porcelain = () => { const c = canvas(64, 64), x = c.getContext('2d'); noiseBase(x, 64, 64, '#eef0ee', 0.02, 4, 2, 271); return c; };
P.chainLink = () => {
  const c = canvas(128, 128), x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(170,175,178,0.95)'; x.lineWidth = 2.2;
  for (let i = -128; i < 256; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.stroke(); x.beginPath(); x.moveTo(i + 128, 0); x.lineTo(i, 128); x.stroke(); }
  return c;
};
P.razor = () => { const c = canvas(128, 64), x = c.getContext('2d'); x.clearRect(0, 0, 128, 64); x.strokeStyle = 'rgba(190,195,200,1)'; x.lineWidth = 2; for (let i = 0; i < 6; i++) { x.beginPath(); x.ellipse(i * 22 + 11, 32, 14, 26, 0.3, 0, Math.PI * 2); x.stroke(); } return c; };
P.courtLines = () => {
  const c = canvas(1024, 683), x = c.getContext('2d');
  x.clearRect(0, 0, 1024, 683);
  x.strokeStyle = 'rgba(240,240,230,0.9)'; x.lineWidth = 6;
  x.strokeRect(10, 10, 1004, 663);
  x.beginPath(); x.moveTo(512, 10); x.lineTo(512, 673); x.stroke();
  x.beginPath(); x.arc(512, 341, 70, 0, Math.PI * 2); x.stroke();
  for (const side of [0, 1]) {
    const bx = side ? 1014 : 10, dir = side ? -1 : 1;
    x.strokeRect(side ? bx - 230 : bx, 341 - 100, 230, 200);
    x.beginPath(); x.arc(bx + dir * 230, 341, 70, side ? Math.PI / 2 : -Math.PI / 2, side ? -Math.PI / 2 : Math.PI / 2, side === 1); x.stroke();
    x.beginPath(); x.arc(bx + dir * 40, 341, 290, side ? Math.PI / 2 + 0.25 : -Math.PI / 2 - 0.25 + Math.PI, side ? 1.5 * Math.PI - 0.25 : Math.PI / 2 - 0.25 + Math.PI, false); x.stroke();
  }
  return c;
};
P.trackLines = () => { const c = canvas(256, 64), x = c.getContext('2d'); x.clearRect(0, 0, 256, 64); x.fillStyle = 'rgba(240,240,230,0.7)'; x.fillRect(0, 2, 256, 3); x.fillRect(0, 59, 256, 3); return c; };
P.ground = () => { const c = canvas(512, 512), x = c.getContext('2d'); noiseBase(x, 512, 512, '#55693a', 0.25, 8, 5, 281, '#7a6c45'); speckle(x, 512, 512, 3000, '#3c4c25', 0.4, 3, 25); return c; };
P.road = () => { const c = canvas(256, 256), x = c.getContext('2d'); noiseBase(x, 256, 256, '#47494c', 0.1, 16, 3, 291); x.fillStyle = 'rgba(230,200,60,0.85)'; x.fillRect(0, 122, 120, 12); return c; };
P.roof = () => { const c = canvas(256, 256), x = c.getContext('2d'); noiseBase(x, 256, 256, '#5b5a57', 0.14, 8, 4, 301, '#4a4436'); stains(x, 256, 256, 6, 'rgba(20,20,20,A)', 60, 0.3, 26); return c; };
P.dark = () => { const c = canvas(16, 16), x = c.getContext('2d'); x.fillStyle = '#18191b'; x.fillRect(0, 0, 16, 16); return c; };

/** Small mono-colour + ID text decal for prison uniforms etc. drawn on demand. */
export function makeTextTexture(scene, text, opts = {}) {
  const w = opts.w || 512, h = opts.h || 128;
  const tex = new BABYLON.DynamicTexture(`txt_${text}`, { width: w, height: h }, scene, true);
  const ctx = tex.getContext();
  ctx.fillStyle = opts.bg || '#2d3b33';
  ctx.fillRect(0, 0, w, h);
  if (opts.border !== false) { ctx.strokeStyle = opts.fg || '#f2ead2'; ctx.lineWidth = 8; ctx.strokeRect(10, 10, w - 20, h - 20); }
  ctx.fillStyle = opts.fg || '#f2ead2';
  ctx.font = `${opts.weight || 700} ${opts.size || 64}px ${opts.font || '"Oswald", "Arial Narrow", Impact, sans-serif'}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 4);
  tex.update(true);
  tex.hasAlpha = false;
  return tex;
}

/** Wraps a painter's canvas as a Babylon DynamicTexture with mipmaps and repeat. */
export function makeTexture(scene, key, alpha = false) {
  const painter = P[key];
  if (!painter) throw new Error(`No texture painter: ${key}`);
  const src = painter();
  const tex = new BABYLON.DynamicTexture(`tex_${key}`, { width: src.width, height: src.height }, scene, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
  tex.getContext().drawImage(src, 0, 0);
  tex.update(true);
  tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
  tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 8;
  tex.hasAlpha = alpha;
  return tex;
}
export const TEXTURE_KEYS = Object.keys(P);
