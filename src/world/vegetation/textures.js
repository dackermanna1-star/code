import * as THREE from 'three';

// Foliage textures painted procedurally on canvas at startup (no image assets).
// Colour is in sRGB; alpha is coverage for alpha-tested cards.

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const mix = (a, b, t) => a + (b - a) * t;
const rgb = (r, g, b, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;

/**
 * Date-palm frond: the rachis runs up the middle (u = 0.5, v = 0 at the base), stiff
 * narrow leaflets angle toward the tip in a herringbone. Glaucous grey-green.
 */
export function frondTexture() {
  const W = 256;
  const H = 1024;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const r = rng(7);
  g.clearRect(0, 0, W, H);
  const cx = W / 2;
  // Leaflets from tip (top of canvas = v 1) to base.
  for (let i = 0; i < 150; i++) {
    const t = 0.06 + (i / 150) * 0.92; // 0 = base, 1 = tip
    const y = H * (1 - t);
    const span = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.55);
    const len = (W * 0.5 - 6) * span * (0.85 + 0.15 * r());
    for (const side of [-1, 1]) {
      if (r() < 0.06) continue;
      const ang = (32 + 18 * r() + 10 * t) * (Math.PI / 180);
      const ex = cx + side * Math.cos(ang) * len;
      const ey = y - Math.sin(ang) * len * 0.9;
      const wdt = 3.2 + 2.2 * span;
      const shade = 0.82 + 0.3 * r();
      const base = [mix(92, 128, r()) * shade, mix(112, 142, r()) * shade, mix(70, 88, r()) * shade];
      g.beginPath();
      g.moveTo(cx + side * 2, y);
      g.quadraticCurveTo((cx + ex) / 2 - side * 1, (y + ey) / 2 - wdt, ex, ey);
      g.quadraticCurveTo((cx + ex) / 2 + side * 2, (y + ey) / 2 + wdt * 0.6, cx + side * 2, y + wdt * 0.8);
      g.closePath();
      g.fillStyle = rgb(...base);
      g.fill();
      // Midrib highlight.
      g.strokeStyle = rgb(base[0] * 1.25, base[1] * 1.22, base[2] * 1.1, 0.6);
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(cx + side * 2, y + 1);
      g.lineTo(ex, ey);
      g.stroke();
      // Dry, sun-bleached tips on some leaflets.
      if (r() < 0.25) {
        g.strokeStyle = rgb(170, 150, 100, 0.8);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(mix(cx, ex, 0.8), mix(y, ey, 0.8));
        g.lineTo(ex, ey);
        g.stroke();
      }
    }
  }
  // Rachis.
  const grad = g.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, rgb(150, 130, 80));
  grad.addColorStop(1, rgb(120, 125, 75));
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(cx - 6, H);
  g.lineTo(cx + 6, H);
  g.lineTo(cx + 1.2, 4);
  g.lineTo(cx - 1.2, 4);
  g.closePath();
  g.fill();
  return toTexture(c);
}

function bladeStroke(g, x0, y0, x1, y1, bend, width, color) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2, x1, y1);
  g.stroke();
}

/** Dry desert grass tuft (drinn, Stipagrostis): straw and grey-green blades fanning up. */
export function grassTexture({ green = false, seed = 3 } = {}) {
  const W = 512;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const r = rng(seed);
  for (let i = 0; i < 230; i++) {
    const x0 = W * (0.42 + 0.16 * r());
    const y0 = H;
    const spread = (r() - 0.5) * 2;
    const hgt = H * (0.45 + 0.52 * Math.pow(r(), 0.6)) * (1 - 0.35 * Math.abs(spread));
    const x1 = x0 + spread * W * 0.42;
    const y1 = H - hgt;
    const k = r();
    let col;
    if (green) col = rgb(mix(70, 120, k), mix(110, 150, k), mix(45, 70, k));
    else col = k < 0.45 ? rgb(mix(168, 200, r()), mix(150, 178, r()), mix(108, 132, r())) : rgb(mix(118, 150, r()), mix(122, 146, r()), mix(88, 108, r()));
    bladeStroke(g, x0, y0, x1, y1, spread * 40 * r(), 1.6 + 2.2 * (1 - k * 0.5), col);
  }
  // Seed heads on a few stems.
  if (!green) {
    for (let i = 0; i < 18; i++) {
      const x = W * (0.25 + 0.5 * r());
      const y = H * (0.02 + 0.25 * r());
      g.fillStyle = rgb(225, 210, 170, 0.9);
      g.beginPath();
      g.ellipse(x, y, 3, 14, (r() - 0.5) * 0.8, 0, Math.PI * 2);
      g.fill();
    }
  }
  return toTexture(c);
}

/** Oasis sedges and young reeds: thin blades fanning out from a clump, a few plumes. */
export function reedTexture(seed = 21) {
  const W = 512;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const r = rng(seed);
  for (let i = 0; i < 95; i++) {
    const x0 = W * (0.44 + 0.12 * r());
    const fan = (r() - 0.5) * 2;
    const hgt = H * (0.35 + 0.62 * Math.pow(r(), 0.7)) * (1 - 0.25 * Math.abs(fan));
    const x1 = x0 + fan * W * 0.38;
    const k = r();
    const col = rgb(mix(70, 150, k), mix(100, 145, k), mix(40, 75, k));
    bladeStroke(g, x0, H, x1, H - hgt, fan * 50 * r(), 1.3 + 1.6 * (1 - k), col);
    if (hgt > H * 0.82 && r() < 0.25) {
      g.fillStyle = rgb(mix(170, 200, r()), mix(150, 175, r()), mix(120, 140, r()), 0.85);
      g.beginPath();
      g.ellipse(x1, H - hgt + 14, 4, 16, fan * 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  return toTexture(c);
}

/** Twiggy desert shrub (Calligonum / Retama-like): grey-brown branches, sparse leaves. */
export function bushTexture(seed = 11) {
  const W = 512;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const r = rng(seed);
  const branch = (x, y, ang, len, w, depth) => {
    const x1 = x + Math.cos(ang) * len;
    const y1 = y - Math.sin(ang) * len;
    g.strokeStyle = rgb(mix(150, 185, r()), mix(130, 160, r()), mix(105, 125, r()));
    g.lineWidth = w;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo((x + x1) / 2 + (r() - 0.5) * len * 0.3, (y + y1) / 2, x1, y1);
    g.stroke();
    if (depth <= 0 || w < 0.8) {
      // Wispy leafless green tips.
      g.strokeStyle = rgb(mix(120, 160, r()), mix(140, 170, r()), mix(85, 105, r()), 0.95);
      g.lineWidth = 1.4;
      for (let i = 0; i < 4; i++) {
        const a = ang + (r() - 0.5) * 1.2;
        const l = 12 + 20 * r();
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x1 + Math.cos(a) * l, y1 - Math.sin(a) * l);
        g.stroke();
      }
      return;
    }
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) branch(x1, y1, ang + (r() - 0.5) * 1.3, len * (0.62 + 0.2 * r()), w * 0.68, depth - 1);
  };
  for (let i = 0; i < 6; i++) branch(W * (0.44 + 0.12 * r()), H, Math.PI / 2 + (r() - 0.5) * 1.7, H * (0.2 + 0.08 * r()), 5, 4);
  return toTexture(c);
}
