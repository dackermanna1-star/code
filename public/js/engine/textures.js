// Procedurally generated surface textures. The original 2008 client shipped
// small grayscale bitmaps (studs, inlets, weld, glue, universal) that were
// modulated by the part's BrickColor; these are drawn to match that look:
// one stud per 1x1 stud cell, light upper-left rim, dark lower-right rim.
import * as THREE from 'three';

const CELL = 64; // pixels per stud
export const SURFACE_BASE = 0.86; // brightness of a flat area in the textures

const cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function gray(v, a = 1) {
  const n = Math.round(v * 255);
  return `rgba(${n},${n},${n},${a})`;
}

function finish(canvas, key, opts = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  // Surface bitmaps are brightness multipliers (linear); decals/sky are sRGB.
  tex.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = opts.nearest ? THREE.NearestFilter : THREE.LinearFilter;
  cache.set(key, tex);
  return tex;
}

function drawStud(ctx, cx, cy, r) {
  // soft cast shadow to the lower right
  const sh = ctx.createRadialGradient(cx + r * 0.25, cy + r * 0.3, r * 0.6, cx + r * 0.25, cy + r * 0.3, r * 1.35);
  sh.addColorStop(0, gray(0.55, 0.9)); sh.addColorStop(1, gray(0.55, 0));
  ctx.fillStyle = sh;
  ctx.beginPath(); ctx.arc(cx + r * 0.25, cy + r * 0.3, r * 1.35, 0, Math.PI * 2); ctx.fill();
  // bevel: light upper-left rim, dark lower-right rim
  const rim = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  rim.addColorStop(0, gray(1.0)); rim.addColorStop(0.5, gray(0.86)); rim.addColorStop(1, gray(0.6));
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = gray(0.88);
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.84, 0, Math.PI * 2); ctx.fill();
  // embossed "R" logo on the stud top, as on the 2008 stud bitmap
  ctx.font = `italic bold ${Math.round(r * 0.95)}px Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = gray(1.0, 0.75); ctx.fillText('R', cx - 1, cy - 1);
  ctx.fillStyle = gray(0.62, 0.8); ctx.fillText('R', cx + 1, cy + 1);
  ctx.fillStyle = gray(0.86); ctx.fillText('R', cx, cy);
}

function drawInlet(ctx, cx, cy, r) {
  // square recess
  const s = r * 1.25;
  ctx.fillStyle = gray(0.6);
  ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
  const g = ctx.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
  g.addColorStop(0, gray(0.5)); g.addColorStop(1, gray(0.74));
  ctx.fillStyle = g;
  ctx.fillRect(cx - s + 2, cy - s + 2, s * 2 - 2, s * 2 - 2);
  ctx.strokeStyle = gray(0.95, 0.9); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - s, cy + s); ctx.lineTo(cx + s, cy + s); ctx.lineTo(cx + s, cy - s); ctx.stroke();
  // dark socket with a highlight
  ctx.fillStyle = gray(0.3);
  ctx.beginPath(); ctx.arc(cx, cy - r * 0.05, r * 0.52, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = gray(0.55, 0.8);
  ctx.beginPath(); ctx.arc(cx - r * 0.14, cy - r * 0.22, r * 0.2, 0, Math.PI * 2); ctx.fill();
}

export function surfaceTexture(kind) {
  if (!kind || kind === 'Smooth') return null;
  if (cache.has(kind)) return cache.get(kind);
  const c = makeCanvas(CELL, CELL);
  const ctx = c.getContext('2d');
  ctx.fillStyle = gray(SURFACE_BASE);
  ctx.fillRect(0, 0, CELL, CELL);
  const m = CELL / 2;
  switch (kind) {
    case 'Studs':
      drawStud(ctx, m, m, CELL * 0.3);
      break;
    case 'Inlet':
    case 'Inlets':
      drawInlet(ctx, m, m, CELL * 0.3);
      break;
    case 'Universal': {
      // studs and inlets on alternating cells -> draw at half scale
      drawStud(ctx, CELL * 0.25, CELL * 0.25, CELL * 0.16);
      drawStud(ctx, CELL * 0.75, CELL * 0.75, CELL * 0.16);
      drawInlet(ctx, CELL * 0.75, CELL * 0.25, CELL * 0.16);
      drawInlet(ctx, CELL * 0.25, CELL * 0.75, CELL * 0.16);
      break;
    }
    case 'Weld': {
      // a large engraved X across the cell
      ctx.lineWidth = 3;
      ctx.strokeStyle = gray(0.6);
      ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(CELL - 4, CELL - 4); ctx.moveTo(CELL - 4, 4); ctx.lineTo(4, CELL - 4); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = gray(1.0, 0.8);
      ctx.beginPath(); ctx.moveTo(5, 6); ctx.lineTo(CELL - 3, CELL - 2); ctx.moveTo(CELL - 3, 6); ctx.lineTo(5, CELL - 2); ctx.stroke();
      break;
    }
    case 'Glue': {
      // an irregular splotch outline
      ctx.lineWidth = 2; ctx.strokeStyle = gray(0.62);
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rr = CELL * (0.3 + 0.06 * Math.sin(a * 5) + 0.04 * Math.cos(a * 3));
        const x = m + Math.cos(a) * rr, y = m + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      break;
    }
    default:
      return null;
  }
  return finish(c, kind);
}

// Truss: lattice of bars, transparent between them (alpha-tested).
export function trussTexture() {
  if (cache.has('Truss')) return cache.get('Truss');
  const S = 128; // one 2x2 stud truss face
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = gray(0.92);
  const t = 14;
  ctx.fillRect(0, 0, S, t); ctx.fillRect(0, S - t, S, t);
  ctx.fillRect(0, 0, t, S); ctx.fillRect(S - t, 0, t, S);
  ctx.strokeStyle = gray(0.85); ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(t / 2, S - t / 2); ctx.lineTo(S - t / 2, t / 2); ctx.stroke();
  ctx.strokeStyle = gray(0.65); ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, S - 2, S - 2);
  return finish(c, 'Truss');
}

// The classic default face: two tall black ovals and a thin smile.
export function faceTexture() {
  const key = 'face';
  if (cache.has(key)) return cache.get(key);
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  drawFace(ctx, S);
  const tex = finish(c, key, { srgb: true });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.userData.shared = true;
  return tex;
}

// The default face was the only face in 2008 (faces became catalog items in
// January 2009), so there is just the one. Proportions measured from the
// 2008 client's face.png (see docs/RESEARCH.md).
export function drawFace(ctx, S) {
  ctx.fillStyle = '#000';
  const eye = (x, y, rx, ry) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
  // two tall ovals and a crescent smile, thickest at the bottom
  eye(S * 0.405, S * 0.4, S * 0.034, S * 0.07);
  eye(S * 0.595, S * 0.4, S * 0.034, S * 0.07);
  ctx.beginPath();
  ctx.arc(S * 0.5, S * 0.5, S * 0.215, Math.PI * 0.16, Math.PI * 0.84, false);
  ctx.arc(S * 0.5, S * 0.465, S * 0.215, Math.PI * 0.82, Math.PI * 0.18, true);
  ctx.closePath();
  ctx.fill();
}

// Classic 2008 sky ("null_plainsky"): peach, sun-lit cloud cover with
// patches of deep blue above the horizon, and a sea of white/blue clouds
// below it. Generated as an equirectangular canvas.
export function skyTexture() {
  if (cache.has('sky')) return cache.get('sky');
  const W = 1024, H = 512;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  let seed = 2008;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const P = 64;
  const grid = new Float32Array(P * P).map(() => rnd());
  const fade = (t) => t * t * (3 - 2 * t);
  const val = (x, y) => grid[((y % P) + P) % P * P + (((x % P) + P) % P)];
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = val(xi, yi), b = val(xi + 1, yi), cc = val(xi, yi + 1), dd = val(xi + 1, yi + 1);
    const u = fade(xf), v = fade(yf);
    return a + (b - a) * u + (cc - a) * v + (a - b - cc + dd) * u * v;
  };
  const fbm = (x, y, oct = 5) => { let n = 0, a = 0.5, f = 1; for (let o = 0; o < oct; o++) { n += a * noise(x * f, y * f); a *= 0.5; f *= 2; } return n; };
  const lerp = (a, b, t) => a + (b - a) * t;
  for (let y = 0; y < H; y++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI; // +pi/2 = straight up
    const el = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const lon = (x / W) * Math.PI * 2;
      let r, g, b;
      if (el >= 0) {
        // project onto a cloud ceiling: clouds stretch toward the horizon
        const k = 1 / Math.max(0.06, el);
        const px = Math.cos(lon) * k * 1.4 * (1 - el * 0.3), py = Math.sin(lon) * k * 1.4;
        const n = fbm(px + 7, py + 3);
        const hole = Math.max(0, Math.min(1, (0.42 - n) * 6)); // blue patches
        const warm = 0.75 + 0.25 * Math.min(1, el * 2.5);
        // peach cloud
        const cr = lerp(236, 246, warm), cg = lerp(208, 222, warm), cb = lerp(205, 196, warm);
        // deep blue gaps
        const br = 52, bg = 94, bb = 196;
        r = lerp(cr, br, hole); g = lerp(cg, bg, hole); b = lerp(cb, bb, hole);
        // haze toward the horizon
        const hz = Math.max(0, 1 - el * 4);
        r = lerp(r, 232, hz * 0.85); g = lerp(g, 222, hz * 0.85); b = lerp(b, 232, hz * 0.85);
      } else {
        // sea of clouds below: perspective-projected cloud tops
        const k = 1 / Math.max(0.03, -el);
        const px = Math.cos(lon) * k * 0.8, py = Math.sin(lon) * k * 0.8;
        const n = fbm(px + 31, py + 17);
        const t = Math.max(0, Math.min(1, (n - 0.35) * 2.2));
        r = lerp(70, 245, t); g = lerp(112, 248, t); b = lerp(205, 255, t);
        const hz = Math.max(0, 1 + el * 8);
        r = lerp(r, 222, hz * 0.7); g = lerp(g, 232, hz * 0.7); b = lerp(b, 248, hz * 0.7);
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = finish(c, 'sky', { srgb: true });
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Generic decal canvas helper (used for SpawnLocation, signs, team flags...)
export function canvasTexture(key, w, h, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = makeCanvas(w, h);
  draw(c.getContext('2d'), w, h);
  const tex = finish(c, key, { srgb: true });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
