// Canvas-painted skins (512x512) for the eight CS 1.6 player models.
// Painted in the style of late-90s model skins: flat base colours, painted folds,
// seams, pouches and faces; lighting from the engine multiplies on top.
import { REG, ZR, TEX } from './layout.js';
import { canvasTexture } from './gslight.js';

// ------------------------------------------------------------------ utils
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const sh = (h, f, a = 1) => { const c = hex(h); return rgb(c.map((x) => Math.max(0, Math.min(255, x * f))), a); };
const mix = (h1, h2, t) => { const a = hex(h1), b = hex(h2); return rgb(a.map((x, i) => x + (b[i] - x) * t)); };

class Painter {
  constructor(seed) {
    this.c = document.createElement('canvas');
    this.c.width = this.c.height = TEX;
    this.g = this.c.getContext('2d', { willReadFrequently: true });
    this.rand = mulberry32(seed);
  }
  r(a = 0, b = 1) { return a + (b - a) * this.rand(); }

  /** Mapper for a region: u (0..1 around, 0.5 = front) and z (height in the part's range). */
  map(reg, zr) {
    const [x0, y0, w, h] = reg;
    return {
      reg, x0, y0, w, h,
      X: (u) => x0 + u * w,
      Y: (z) => y0 + (1 - (z - zr[0]) / (zr[1] - zr[0])) * h,
      pu: w, pz: h / (zr[1] - zr[0]),
    };
  }

  clip(reg, fn) {
    const g = this.g;
    g.save(); g.beginPath(); g.rect(reg[0], reg[1], reg[2], reg[3]); g.clip();
    fn(g); g.restore();
  }

  fill(reg, col) { this.g.fillStyle = col; this.g.fillRect(reg[0], reg[1], reg[2], reg[3]); }

  band(m, z0, z1, col, u0 = 0, u1 = 1) {
    const g = this.g;
    g.fillStyle = col;
    const ya = m.Y(z1), yb = m.Y(z0);
    g.fillRect(m.X(u0), ya, m.X(u1) - m.X(u0), yb - ya);
  }

  /** band repeated across the u seam (u0 may be < 0 or u1 > 1) */
  bandW(m, z0, z1, col, u0, u1) {
    this.clip(m.reg, () => {
      for (const o of [-1, 0, 1]) this.band(m, z0, z1, col, u0 + o, u1 + o);
    });
  }

  ell(m, u, z, ru, rz, col, rot = 0) {
    const g = this.g;
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(m.X(u), m.Y(z), Math.max(0.5, ru * m.pu), Math.max(0.5, rz * m.pz), rot, 0, Math.PI * 2);
    g.fill();
  }

  poly(m, pts, col, stroke = 0) {
    const g = this.g;
    g.beginPath();
    pts.forEach(([u, z], i) => (i ? g.lineTo(m.X(u), m.Y(z)) : g.moveTo(m.X(u), m.Y(z))));
    if (stroke) { g.strokeStyle = col; g.lineWidth = stroke; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
    else { g.closePath(); g.fillStyle = col; g.fill(); }
  }

  line(m, pts, col, w = 1) { this.poly(m, pts, col, w); }

  rrect(m, u0, u1, z0, z1, col, rad = 2) {
    const g = this.g;
    const x = m.X(u0), y = m.Y(z1), w = m.X(u1) - x, h = m.Y(z0) - y;
    g.fillStyle = col;
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, rad); else g.rect(x, y, w, h);
    g.fill();
  }

  /** Box with painted bevel: lighter top edge, darker bottom edge (pouches, pockets). */
  pouch(m, u0, u1, z0, z1, base, opts = {}) {
    this.rrect(m, u0 - 0.004, u1 + 0.004, z0 - 0.25, z1 + 0.15, sh(base, 0.45), 2);
    this.rrect(m, u0, u1, z0, z1, sh(base, 1.0), 2);
    const fz = z1 - (z1 - z0) * (opts.flap ?? 0.38);
    this.rrect(m, u0, u1, fz, z1, sh(base, 1.12), 2); // flap
    this.line(m, [[u0 + 0.004, fz], [u1 - 0.004, fz]], sh(base, 0.5), 1.4);
    this.line(m, [[u0 + 0.004, z1 - 0.05], [u1 - 0.004, z1 - 0.05]], sh(base, 1.35), 1);
    if (opts.snap) this.ell(m, (u0 + u1) / 2, fz + 0.35, 0.006, 0.18, opts.snap);
    this.line(m, [[u0 + 0.004, z0 + 0.1], [u1 - 0.004, z0 + 0.1]], sh(base, 0.6), 1);
  }

  /** Random cloth folds: dark crease with a light highlight just above it. */
  folds(m, n, base, opts = {}) {
    const { z0 = 0, z1 = 100, u0 = 0, u1 = 1, len = 0.08, slope = 0.4, dark = 0.62, light = 1.22, w = 1.6 } = opts;
    const zr0 = Math.max(z0, (m.y0 + m.h - m.Y(z0)) >= 0 ? z0 : z0);
    for (let i = 0; i < n; i++) {
      const u = this.r(u0, u1), z = this.r(zr0, z1);
      const l = len * this.r(0.6, 1.3);
      const s = slope * this.r(-1, 1);
      const pts = [[u - l / 2, z - s * 0.5], [u, z + this.r(-0.15, 0.15)], [u + l / 2, z + s * 0.5]];
      this.line(m, pts.map(([a, b]) => [a, b + 0.18]), sh(base, light, 0.55), w * 0.9);
      this.line(m, pts, sh(base, dark, 0.8), w);
    }
  }

  vfolds(m, n, base, opts = {}) {
    const { z0, z1, u0 = 0, u1 = 1, dark = 0.65, light = 1.2, w = 1.4 } = opts;
    for (let i = 0; i < n; i++) {
      const u = this.r(u0, u1), za = this.r(z0, z1), l = (z1 - z0) * this.r(0.15, 0.35);
      const du = this.r(-0.02, 0.02);
      this.line(m, [[u + 0.006, za], [u + du + 0.006, za + l]], sh(base, light, 0.5), w);
      this.line(m, [[u, za], [u + du, za + l]], sh(base, dark, 0.75), w);
    }
  }

  camo(reg, colors, n, size, opts = {}) {
    const g = this.g;
    this.clip(reg, () => {
      for (let i = 0; i < n; i++) {
        const col = colors[i % colors.length];
        const cx = reg[0] + this.r(-0.05, 1.05) * reg[2], cy = reg[1] + this.r(-0.05, 1.05) * reg[3];
        const rx = size * this.r(0.5, 1.4) * (opts.stretchX || 1), ry = size * this.r(0.4, 1.0);
        const rot = opts.rot ?? this.r(-0.5, 0.5);
        const k = 9;
        g.fillStyle = col;
        g.beginPath();
        for (let j = 0; j < k; j++) {
          const a = (j / k) * Math.PI * 2;
          const rr = this.r(0.55, 1.15);
          const x = Math.cos(a) * rx * rr, y = Math.sin(a) * ry * rr;
          const px = cx + x * Math.cos(rot) - y * Math.sin(rot), py = cy + x * Math.sin(rot) + y * Math.cos(rot);
          j ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.closePath(); g.fill();
      }
    });
  }

  /** Vertical gradient overlay (multiply-ish darkening toward an edge). */
  grad(reg, stops, mode = 'multiply') {
    const g = this.g;
    g.save();
    g.globalCompositeOperation = mode;
    const gr = g.createLinearGradient(0, reg[1], 0, reg[1] + reg[3]);
    stops.forEach(([t, c]) => gr.addColorStop(t, c));
    g.fillStyle = gr;
    g.fillRect(reg[0], reg[1], reg[2], reg[3]);
    g.restore();
  }

  /** Horizontal shading across u: darker at the back/sides (painted occlusion). */
  wrapShade(reg, amt = 0.18) {
    const g = this.g;
    g.save();
    g.globalCompositeOperation = 'multiply';
    const gr = g.createLinearGradient(reg[0], 0, reg[0] + reg[2], 0);
    const d = (k) => `rgba(${255 * (1 - k)},${255 * (1 - k)},${255 * (1 - k)},1)`;
    gr.addColorStop(0, d(amt)); gr.addColorStop(0.25, d(amt * 0.4)); gr.addColorStop(0.5, d(0));
    gr.addColorStop(0.75, d(amt * 0.4)); gr.addColorStop(1, d(amt));
    g.fillStyle = gr;
    g.fillRect(reg[0], reg[1], reg[2], reg[3]);
    g.restore();
  }

  noise(reg, amt, opts = {}) {
    const g = this.g;
    const img = g.getImageData(reg[0], reg[1], reg[2], reg[3]);
    const d = img.data;
    const rows = opts.rows || 0; // knit / weave rows
    for (let y = 0; y < reg[3]; y++) {
      const rowF = rows ? (Math.sin((y / rows) * Math.PI * 2) * 0.5 + 0.5) * amt * 0.6 : 0;
      for (let x = 0; x < reg[2]; x++) {
        const i = (y * reg[2] + x) * 4;
        const n = (this.rand() - 0.5) * amt * 255 - rowF * 128 + (opts.bias || 0);
        const t = opts.tint ? (this.rand() - 0.5) * opts.tint * 255 : 0;
        d[i] = Math.max(0, Math.min(255, d[i] + n + t));
        d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
        d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n - t));
      }
    }
    g.putImageData(img, reg[0], reg[1]);
  }

  stitch(m, pts, col, dash = [2, 2]) {
    const g = this.g;
    g.save(); g.setLineDash(dash);
    this.line(m, pts, col, 1);
    g.restore();
  }
}

// ------------------------------------------------------------------ mappers
const M = (p) => ({
  torso: p.map(REG.torso, ZR.torso),
  head: p.map(REG.head, ZR.head),
  armR: p.map(REG.armR, ZR.arm),
  armL: p.map(REG.armL, ZR.arm),
  legR: p.map(REG.legR, ZR.leg),
  legL: p.map(REG.legL, ZR.leg),
  handR: p.map(REG.handR, ZR.hand),
  handL: p.map(REG.handL, ZR.hand),
  footR: p.map(REG.footR, ZR.foot),
  footL: p.map(REG.footL, ZR.foot),
  helmet: p.map(REG.helmet, ZR.helmet),
  visor: p.map(REG.visor, [0, 1]),
  misc: p.map(REG.misc, ZR.misc),
  misc01: p.map(REG.misc, [0, 1]),
  misc2: p.map(REG.misc2, [0, 1]),
  can: p.map(REG.can, [0, 1]),
  emit: p.map(REG.emit, [0, 1]),
  pouch: p.map(REG.pouch, [0, 1]),
});

// Facial feature placement on the head map (u, z).
const EYE_U = 0.049, EYE_Z = 67.2, EAR_U = 0.235;

function paintSkinHead(p, m, o) {
  const skin = o.skin;
  const h = m.head;
  p.fill(h.reg, skin);
  // painted form shading: temples / jaw sides darker, cheekbones and nose bridge lighter
  for (const s of [-1, 1]) {
    p.poly(h, [[0.5 + s * 0.085, 62.6], [0.5 + s * 0.13, 64.2], [0.5 + s * 0.15, 66.4], [0.5 + s * 0.2, 66.6], [0.5 + s * 0.2, 62.4]], sh(skin, 0.84, 0.75));
    p.ell(h, 0.5 + s * 0.072, 65.95, 0.032, 0.45, sh(skin, 1.08, 0.7)); // cheekbone
    p.ell(h, 0.5 + s * 0.06, 65.2, 0.03, 0.5, mix(skin, '#b05848', 0.12));
    p.ell(h, 0.5 + s * 0.11, 68.0, 0.03, 0.9, sh(skin, 0.9, 0.6)); // temple
  }
  p.band(h, 61.4, 62.3, sh(skin, 0.7)); // under the chin
  p.ell(h, 0.5, 62.75, 0.045, 0.35, sh(skin, 1.08, 0.8)); // chin highlight
  p.ell(h, 0.5, 63.3, 0.035, 0.18, sh(skin, 0.82, 0.8)); // chin crease
  p.ell(h, 0.5, 69.0, 0.07, 0.7, sh(skin, 1.07, 0.6)); // forehead highlight
  if (o.stubble) {
    p.poly(h, [[0.5 - 0.12, 64.6], [0.5 - 0.06, 63.5], [0.5 - 0.03, 62.3], [0.5 + 0.03, 62.3], [0.5 + 0.06, 63.5], [0.5 + 0.12, 64.6], [0.5 + 0.12, 62.0], [0.5 - 0.12, 62.0]], sh(skin, 0.8, 0.5));
    for (let i = 0; i < 140; i++) {
      const u = 0.5 + p.r(-0.12, 0.12), z = p.r(62.2, 64.6);
      p.ell(h, u, z, 0.0025, 0.05, sh(skin, 0.55, 0.5));
    }
  }
  // ears
  for (const s of [-1, 1]) {
    p.ell(h, 0.5 + s * EAR_U, 66.3, 0.026, 1.25, sh(skin, 0.9));
    p.ell(h, 0.5 + s * EAR_U, 66.3, 0.015, 0.8, sh(skin, 0.66));
    p.ell(h, 0.5 + s * (EAR_U - 0.007), 66.6, 0.006, 0.5, sh(skin, 0.5));
  }
  // nose: bridge highlight, side shadows, nostrils
  p.ell(h, 0.5, 66.4, 0.011, 1.0, sh(skin, 1.14, 0.9));
  p.poly(h, [[0.5 - 0.016, 67.3], [0.5 - 0.03, 65.3], [0.5 - 0.012, 65.0]], sh(skin, 0.7, 0.85));
  p.poly(h, [[0.5 + 0.016, 67.3], [0.5 + 0.03, 65.3], [0.5 + 0.012, 65.0]], sh(skin, 0.78, 0.85));
  p.ell(h, 0.5, 65.0, 0.022, 0.16, sh(skin, 0.7, 0.8));
  p.ell(h, 0.5 - 0.011, 65.05, 0.006, 0.11, sh(skin, 0.38));
  p.ell(h, 0.5 + 0.011, 65.05, 0.006, 0.11, sh(skin, 0.38));
  // philtrum + mouth
  p.line(h, [[0.5, 64.85], [0.5, 64.4]], sh(skin, 0.85), 1.6);
  p.line(h, [[0.5 - 0.038, 64.12], [0.5 - 0.015, 64.2], [0.5, 64.12], [0.5 + 0.015, 64.2], [0.5 + 0.038, 64.12]], mix(skin, '#6a2a22', 0.4), 2.2);
  p.line(h, [[0.5 - 0.036, 64.02], [0.5, 63.96], [0.5 + 0.036, 64.02]], sh(skin, 0.38), 1.5);
  p.line(h, [[0.5 - 0.026, 63.72], [0.5 + 0.026, 63.72]], sh(skin, 1.12), 1.4);
  p.line(h, [[0.5 - 0.024, 63.55], [0.5 + 0.024, 63.55]], sh(skin, 0.78), 1.2);
  if (o.mustache) p.poly(h, [[0.5 - 0.05, 63.9], [0.5 - 0.035, 64.65], [0.5, 64.55], [0.5 + 0.035, 64.65], [0.5 + 0.05, 63.9], [0.5 + 0.03, 64.25], [0.5, 64.3], [0.5 - 0.03, 64.25]], o.hair);
  // brow ridge shadow over the eyes
  p.band(h, 67.55, 67.9, sh(skin, 0.86, 0.6), 0.5 - 0.09, 0.5 + 0.09);
  paintEyes(p, h, skin, o);
  // hair
  if (o.hair && !o.noHair) {
    const hz = o.hairline ?? 69.7;
    p.poly(h, [[-0.01, 72.3], [-0.01, 63.6], [0.12, 63.4], [0.2, 64.4], [0.26, 65.0], [0.29, 67.4], [0.36, 68.6], [0.42, hz - 0.1],
      [0.5, hz + 0.1], [0.58, hz - 0.1], [0.64, 68.6], [0.71, 67.4], [0.74, 65.0], [0.8, 64.4], [0.88, 63.4], [1.01, 63.6], [1.01, 72.3]], o.hair);
    p.line(h, [[0.29, 67.4], [0.36, 68.6], [0.42, hz - 0.1], [0.5, hz + 0.1], [0.58, hz - 0.1], [0.64, 68.6], [0.71, 67.4]], sh(o.hair, 1.3, 0.6), 1.5);
    for (let i = 0; i < 160; i++) {
      const u = p.r(0, 1), z = p.r(64, 72.2);
      p.line(h, [[u, z], [u + p.r(-0.01, 0.01), z - 0.5]], sh(o.hair, p.r(0.6, 1.6), 0.25), 1);
    }
  }
}

function paintEyes(p, m, skin, o) {
  for (const s of [-1, 1]) {
    const u = 0.5 + s * EYE_U;
    p.ell(m, u, EYE_Z + 0.05, 0.03, 0.5, sh(skin, 0.74)); // socket
    p.ell(m, u, EYE_Z - 0.38, 0.022, 0.16, sh(skin, 0.8, 0.7)); // bag under the eye
    if (o.eyesClosed) continue;
    p.ell(m, u, EYE_Z, 0.021, 0.27, '#e6e0d6');
    p.ell(m, u + s * 0.002, EYE_Z - 0.02, 0.0095, 0.25, o.iris || '#3a2a1c');
    p.ell(m, u + s * 0.002, EYE_Z - 0.02, 0.0045, 0.12, '#080604');
    p.ell(m, u + s * 0.002 - 0.003, EYE_Z + 0.06, 0.002, 0.05, '#ffffff');
    p.line(m, [[u - 0.024, EYE_Z + 0.02], [u - 0.01, EYE_Z + 0.27], [u + 0.01, EYE_Z + 0.27], [u + 0.024, EYE_Z + 0.02]], sh(skin, 0.3), 1.8);
    p.line(m, [[u - 0.018, EYE_Z - 0.2], [u + 0.018, EYE_Z - 0.2]], sh(skin, 0.6, 0.7), 1);
    if (o.brow !== false) p.line(m, [[u - s * 0.024, EYE_Z + 0.68], [u + s * 0.004, EYE_Z + 0.92], [u + s * 0.032, EYE_Z + 0.78]], o.browCol || '#2a1e16', 2.6);
  }
}

function paintBalaclava(p, m, col, o = {}) {
  p.fill(m.head.reg, col);
  p.noise(m.head.reg, 0.07, { rows: 3 });
  const skin = o.skin || '#c0957a';
  // eye opening
  p.rrect(m.head, 0.5 - 0.085, 0.5 + 0.085, 66.5, 68.05, sh(col, 0.6), 5);
  p.rrect(m.head, 0.5 - 0.078, 0.5 + 0.078, 66.62, 67.92, skin, 5);
  p.ell(m.head, 0.5, 67.0, 0.015, 0.5, sh(skin, 1.06)); // bridge of the nose
  paintEyes(p, m.head, skin, { brow: false, iris: o.iris });
  p.line(m.head, [[0.5 - 0.075, 67.85], [0.5 + 0.075, 67.85]], sh(skin, 0.6), 1.5);
  if (o.mouth) {
    p.rrect(m.head, 0.5 - 0.035, 0.5 + 0.035, 63.6, 64.4, sh(col, 0.6), 4);
    p.rrect(m.head, 0.5 - 0.03, 0.5 + 0.03, 63.7, 64.3, sh(skin, 0.75), 4);
    p.line(m.head, [[0.5 - 0.022, 64.0], [0.5 + 0.022, 64.0]], sh(skin, 0.35), 1.4);
  }
  // knit seams and creases
  p.line(m.head, [[0.5, 72.2], [0.5, 68.3]], sh(col, 0.6), 1.2);
  p.line(m.head, [[0.0, 72.2], [0.0, 61.4]], sh(col, 0.6), 1.2);
  p.folds(m.head, 10, col, { z0: 61.6, z1: 64.2, len: 0.12, slope: 0.2, dark: 0.55, light: 1.5 });
  // highlight on the brow & nose
  p.ell(m.head, 0.5, 65.6, 0.022, 0.9, sh(col, 1.5, 0.6));
  p.ell(m.head, 0.5, 69.3, 0.08, 0.8, sh(col, 1.3, 0.5));
}

// ------------------------------------------------------------------ clothing pieces
function trousers(p, m, base, side, o = {}) {
  const outer = side === 'r' ? 0.25 : 0.75;
  p.fill(m.reg, base);
  if (o.camo) p.camo(m.reg, o.camo, o.camoN || 60, o.camoSize || 9, { stretchX: 0.8 });
  // crotch / inner seam darker, outer seam
  p.line(m, [[outer, 41.2], [outer, 8.6]], sh(base, 0.6), 1.3);
  p.stitch(m, [[outer + 0.012, 41], [outer + 0.012, 9]], sh(base, 1.3, 0.6));
  const inner = side === 'r' ? 0.75 : 0.25;
  p.line(m, [[inner, 41.2], [inner, 8.6]], sh(base, 0.65), 1.1);
  // cargo pocket on the outer thigh
  if (o.cargo !== false) p.pouch(m, outer - 0.1, outer + 0.1, 25.5, 31.5, o.pocket || base, { flap: 0.3 });
  // knee pad
  if (o.knee) {
    p.rrect(m, 0.38, 0.62, 18.0, 23.0, sh(o.knee, 0.5), 6);
    p.rrect(m, 0.39, 0.61, 18.3, 22.7, o.knee, 6);
    p.ell(m, 0.5, 21.4, 0.07, 0.8, sh(o.knee, 1.5, 0.5));
    p.line(m, [[0.0, 20.0], [0.38, 20.0]], sh(o.knee, 0.8), 2);
    p.line(m, [[0.62, 20.0], [1.0, 20.0]], sh(o.knee, 0.8), 2);
  }
  // folds: knee, back of knee, bunching above the boots
  p.folds(m, 10, base, { z0: 17, z1: 23, len: 0.15, slope: 0.6 });
  p.folds(m, 8, base, { z0: 8.8, z1: 13, len: 0.14, slope: 0.4 });
  p.folds(m, 8, base, { z0: 30, z1: 40, len: 0.12, slope: 0.7 });
  p.vfolds(m, 6, base, { z0: 11, z1: 38 });
  // boots
  const boot = o.boot || '#221e1a';
  p.band(m, 3.0, 8.8, boot);
  p.band(m, 8.2, 8.8, sh(boot, 1.6));
  p.band(m, 8.8, 9.5, sh(base, 0.5, 0.8));
  for (let z = 4.3; z < 8.2; z += 1.0) {
    p.line(m, [[0.47, z], [0.53, z + 0.5]], sh(boot, 2.2), 1.2);
    p.line(m, [[0.53, z], [0.47, z + 0.5]], sh(boot, 2.2), 1.2);
  }
  p.vfolds(m, 6, boot, { z0: 3.4, z1: 8, dark: 0.5, light: 1.8 });
  p.grad(m.reg, [[0, 'rgb(255,255,255)'], [0.8, 'rgb(225,225,225)'], [1, 'rgb(150,150,150)']]);
  p.wrapShade(m.reg, 0.15);
  p.noise(m.reg, o.noise ?? 0.08);
}

function bootFoot(p, m, boot) {
  p.fill(m.reg, boot);
  // sole along the bottom (u ~ 0 and 1) and sides
  p.band(m, -4, 10, '#141210', 0, 0.12);
  p.band(m, -4, 10, '#141210', 0.88, 1);
  p.band(m, -4, 10, sh(boot, 1.5), 0.12, 0.15);
  p.band(m, -4, 10, sh(boot, 1.5), 0.85, 0.88);
  // laces on top
  p.band(m, -1.5, 5, sh(boot, 0.7), 0.44, 0.56);
  for (let x = -1.2; x < 4.6; x += 0.9) {
    p.line(m, [[0.45, x], [0.55, x + 0.5]], sh(boot, 2.4), 1.2);
    p.line(m, [[0.55, x], [0.45, x + 0.5]], sh(boot, 2.4), 1.2);
  }
  p.ell(m, 0.5, 8.3, 0.12, 1.4, sh(boot, 1.6, 0.6)); // toe cap shine
  p.noise(m.reg, 0.07);
}

function glove(p, m, col, o = {}) {
  p.fill(m.reg, col);
  p.band(m, 33.6, 35.4, sh(col, o.cuff ?? 0.75));
  // knuckles & finger lines on the back of the fist (u ~ 0.25 right hand outer side)
  for (const u of [0.18, 0.25, 0.32, 0.68, 0.75, 0.82]) p.line(m, [[u, 28.3], [u, 30.6]], sh(col, 0.55), 1);
  p.band(m, 30.3, 30.9, sh(col, 1.35, 0.7), 0.1, 0.9);
  if (o.bare) p.band(m, 33.6, 35.4, sh(col, 0.9));
  p.noise(m.reg, 0.08);
}

function sleeve(p, m, base, side, o = {}) {
  const outer = side === 'r' ? 0.25 : 0.75;
  p.fill(m.reg, base);
  if (o.camo) p.camo(m.reg, o.camo, o.camoN || 40, o.camoSize || 8, { stretchX: 0.8 });
  p.line(m, [[side === 'r' ? 0.75 : 0.25, 34.8], [side === 'r' ? 0.75 : 0.25, 59]], sh(base, 0.6), 1.2); // inner seam
  // cuff
  p.band(m, 34.0, 36.4, sh(base, 0.8));
  p.line(m, [[0, 36.4], [1, 36.4]], sh(base, 0.5), 1.4);
  if (o.cuff) p.band(m, 34.0, 35.6, o.cuff);
  // elbow + armpit folds
  p.folds(m, 10, base, { z0: 43, z1: 47.5, len: 0.2, slope: 0.6 });
  p.folds(m, 6, base, { z0: 37, z1: 42, len: 0.18, slope: 0.4 });
  p.folds(m, 6, base, { z0: 49, z1: 56, len: 0.18, slope: 0.6, u0: side === 'r' ? 0.55 : 0.0, u1: side === 'r' ? 1.0 : 0.45 });
  if (o.elbow) {
    p.rrect(m, outer - 0.12, outer + 0.12, 43.4, 46.8, o.elbow, 5);
    p.ell(m, outer, 45.6, 0.05, 0.5, sh(o.elbow, 1.6, 0.5));
  }
  if (o.patch) o.patch(p, m, outer);
  if (o.shoulderTop) p.band(m, 57.5, 60.6, o.shoulderTop);
  p.wrapShade(m.reg, 0.12);
  p.noise(m.reg, o.noise ?? 0.08);
}

function flag(p, m, u, z, cols, horiz = true) {
  // small flag patch (3 stripes)
  p.rrect(m, u - 0.075, u + 0.075, z - 1.15, z + 1.15, '#202020', 2);
  const n = cols.length;
  for (let i = 0; i < n; i++) {
    if (horiz) p.band(m, z + 1.0 - (2.0 / n) * (i + 1), z + 1.0 - (2.0 / n) * i, cols[i], u - 0.065, u + 0.065);
    else p.band(m, z - 1.0, z + 1.0, cols[i], u - 0.065 + (0.13 / n) * i, u - 0.065 + (0.13 / n) * (i + 1));
  }
}

function beltAt(p, m, z, col, buckle = '#9a8a5a') {
  p.band(m, z - 0.75, z + 0.75, col);
  p.band(m, z + 0.55, z + 0.75, sh(col, 1.6));
  p.band(m, z - 0.75, z - 0.55, sh(col, 0.5));
  p.rrect(m, 0.47, 0.53, z - 0.85, z + 0.85, sh(buckle, 0.5), 1);
  p.rrect(m, 0.475, 0.525, z - 0.7, z + 0.7, buckle, 1);
  p.rrect(m, 0.485, 0.515, z - 0.4, z + 0.4, sh(buckle, 0.5), 1);
  for (const u of [0.32, 0.68, 0.1, 0.9]) p.band(m, z - 0.85, z + 0.85, sh(col, 0.8), u - 0.008, u + 0.008); // loops
}

/** Tactical vest over the torso, z range [zb, zt]. */
function vest(p, m, col, o = {}) {
  const zb = o.zb ?? 43.0, zt = o.zt ?? 59.5;
  p.band(m, zb, zt, col);
  // armholes / open sides
  for (const u of [0.25, 0.75]) p.ell(m, u, zt - 1.0, 0.045, 3.6, o.under || col);
  p.band(m, zb - 0.6, zb + 0.4, sh(col, 0.55));
  // neck opening
  p.ell(m, 0.5, 60.4, 0.13, 2.4, o.under || sh(col, 0.5));
  p.ell(m, 0.0, 60.6, 0.13, 1.3, o.under || sh(col, 0.5));
  p.ell(m, 1.0, 60.6, 0.13, 1.3, o.under || sh(col, 0.5));
  // front closure + straps
  p.line(m, [[0.5, zb + 0.4], [0.5, 58.0]], sh(col, 0.55), 1.6);
  p.stitch(m, [[0.47, zb + 0.6], [0.47, 57.5]], sh(col, 1.5, 0.7));
  p.stitch(m, [[0.53, zb + 0.6], [0.53, 57.5]], sh(col, 1.5, 0.7));
  for (const z of [46.0, 50.5]) p.band(m, z - 0.5, z + 0.5, sh(col, 0.75), 0.15, 0.85);
  // pouches (front) - magazine pouches on the stomach, utility on the chest
  const pc = o.pouch || sh(col, 1.0);
  const pcol = o.pouchHex || '#3a3a3a';
  p.pouch(m, 0.39, 0.465, 44.0, 48.4, pcol, { snap: sh(pcol, 0.5) });
  p.pouch(m, 0.535, 0.61, 44.0, 48.4, pcol, { snap: sh(pcol, 0.5) });
  p.pouch(m, 0.31, 0.385, 44.2, 48.0, pcol, { snap: sh(pcol, 0.5) });
  p.pouch(m, 0.615, 0.69, 44.2, 48.0, pcol, { snap: sh(pcol, 0.5) });
  if (o.chestPouch) {
    p.pouch(m, 0.395, 0.47, 51.2, 54.6, pcol, { flap: 0.45 });
    p.pouch(m, 0.53, 0.605, 51.2, 54.6, pcol, { flap: 0.45 });
  }
  // back panel seams
  p.rrect(m, 0.85, 1.0, zb + 1, zt - 2.5, sh(col, 0.85), 3);
  p.rrect(m, 0.0, 0.15, zb + 1, zt - 2.5, sh(col, 0.85), 3);
  p.line(m, [[0.0, zb + 1.2], [0.15, zb + 1.2]], sh(col, 0.5), 1);
  p.line(m, [[0.85, zb + 1.2], [1.0, zb + 1.2]], sh(col, 0.5), 1);
  void pc;
}

function jacketBase(p, m, base, o = {}) {
  p.fill(m.reg, base);
  if (o.camo) p.camo(m.reg, o.camo, o.camoN || 70, o.camoSize || 10, { stretchX: 1.0 });
  if (o.camo) p.fill(m.reg, sh(base, 1, 0.12));
  // shoulder seams + side seams
  p.line(m, [[0.25, 36], [0.25, 57]], sh(base, 0.6), 1.2);
  p.line(m, [[0.75, 36], [0.75, 57]], sh(base, 0.6), 1.2);
  p.folds(m, 14, base, { z0: 43, z1: 56, len: 0.08, slope: 1.2, u0: 0.3, u1: 0.7 });
  p.folds(m, 10, base, { z0: 43, z1: 56, len: 0.1, slope: 1.0, u0: 0.8, u1: 1.2 });
  p.folds(m, 8, base, { z0: 40, z1: 46, len: 0.1, slope: 0.3 });
}

function pantsTop(p, m, base, o = {}) {
  // pelvis part of the torso texture (below the belt)
  p.band(m, 34.2, o.top ?? 41.2, base);
  if (o.camo) p.clip([m.x0, m.Y(o.top ?? 41.2), m.w, m.Y(34.2) - m.Y(o.top ?? 41.2)], () => p.camo(m.reg, o.camo, 90, o.camoSize || 9));
  p.line(m, [[0.5, 34.4], [0.5, 40.4]], sh(base, 0.5), 1.4); // fly
  p.line(m, [[0.0, 34.4], [0.0, 40.4]], sh(base, 0.5), 1.2);
  p.line(m, [[1.0, 34.4], [1.0, 40.4]], sh(base, 0.5), 1.2);
  p.folds(m, 8, base, { z0: 35, z1: 40, len: 0.08, slope: 0.6, u0: 0.35, u1: 0.65 });
  // back pockets
  p.pouch(m, 0.06, 0.16, 36.5, 39.5, base, { flap: 0.25 });
  p.pouch(m, 0.84, 0.94, 36.5, 39.5, base, { flap: 0.25 });
}

function neckSkin(p, m, skin) {
  p.band(m, 60.0, 64.0, skin);
  p.band(m, 60.0, 60.8, sh(skin, 0.7));
  p.ell(m, 0.5, 61.6, 0.035, 0.6, sh(skin, 0.85, 0.7)); // adam's apple shadow
}

function collar(p, m, col, z = 60.4) {
  p.poly(m, [[0.0, z - 1.6], [0.36, z - 1.0], [0.47, z - 2.2], [0.5, z - 3.4], [0.53, z - 2.2], [0.64, z - 1.0], [1.0, z - 1.6], [1.0, z + 0.6], [0.0, z + 0.6]], col);
  p.line(m, [[0.0, z - 1.6], [0.36, z - 1.0], [0.47, z - 2.2], [0.5, z - 3.4], [0.53, z - 2.2], [0.64, z - 1.0], [1.0, z - 1.6]], sh(col.startsWith('#') ? col : '#333333', 0.5), 1.5);
}

/** Ammo bandolier strap from (u0,z0) to (u1,z1) with brass rounds; also wraps across the back seam. */
function bandolier(p, m, u0, z0, u1, z1, strap = '#4a3420') {
  p.line(m, [[u0, z0], [u1, z1]], sh(strap, 0.45), 11);
  p.line(m, [[u0, z0], [u1, z1]], strap, 9);
  const n = 11;
  const du = u1 - u0, dz = z1 - z0;
  const len = Math.hypot(du * m.pu, dz * m.pz);
  const nx = (-dz * m.pz) / len, ny = (du * m.pu) / len; // pixel-space normal
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = m.X(u0 + du * t), y = m.Y(z0 + dz * t);
    const g = p.g;
    g.strokeStyle = '#2a1c0c'; g.lineWidth = 3.4;
    g.beginPath(); g.moveTo(x - nx * 4, y + ny * 4); g.lineTo(x + nx * 4, y - ny * 4); g.stroke();
    g.strokeStyle = '#b89448'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(x - nx * 3.5, y + ny * 3.5); g.lineTo(x + nx * 2.2, y - ny * 2.2); g.stroke();
    g.strokeStyle = '#e8d090'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(x - nx * 3.2, y + ny * 3.2); g.lineTo(x + nx * 1.6, y - ny * 1.6); g.stroke();
  }
}

// ------------------------------------------------------------------ skins
const SKINS = {
  terror(p, m) {
    const jacket = '#2c2622', jeans = '#2e3442', mask = '#1c1c1e', boot = '#1e1a17';
    paintBalaclava(p, m, mask, { skin: '#c49a7a', iris: '#3a2a1c', mouth: false });
    // torso: leather jacket, open collar showing the mask's neck part
    jacketBase(p, m.torso, jacket);
    pantsTop(p, m.torso, jeans, { top: 40.2 });
    p.band(m.torso, 39.6, 41.6, sh(jacket, 0.85)); // jacket hem band
    p.line(m.torso, [[0, 41.6], [1, 41.6]], sh(jacket, 0.5), 1.3);
    // zipper
    p.line(m.torso, [[0.5, 40], [0.5, 59.5]], '#0e0c0b', 2.4);
    p.stitch(m.torso, [[0.5, 40], [0.5, 59.5]], '#8a8478', [1, 2]);
    p.rrect(m.torso, 0.493, 0.507, 54.8, 56.0, '#a8a090', 1);
    // chest pockets (zip) & leather panels
    p.line(m.torso, [[0.36, 53.5], [0.44, 51.2]], '#111', 1.6);
    p.line(m.torso, [[0.64, 53.5], [0.56, 51.2]], '#111', 1.6);
    p.line(m.torso, [[0.3, 47.0], [0.4, 44.0]], '#111', 1.6);
    p.line(m.torso, [[0.7, 47.0], [0.6, 44.0]], '#111', 1.6);
    p.line(m.torso, [[0.0, 52.0], [0.3, 55.5]], sh(jacket, 0.55), 1.2);
    p.line(m.torso, [[1.0, 52.0], [0.7, 55.5]], sh(jacket, 0.55), 1.2);
    // leather shine
    for (let i = 0; i < 18; i++) {
      const u = p.r(0.3, 0.7), z = p.r(44, 57);
      p.ell(m.torso, u, z, 0.02, 0.5, sh(jacket, 1.8, 0.25));
    }
    collar(p, m.torso, sh(jacket, 0.9), 60.4);
    p.band(m.torso, 61.0, 64.0, mask);
    // ammo bandolier across the chest (right shoulder -> left hip)
    bandolier(p, m.torso, 0.31, 58.6, 0.68, 41.8, '#4a3420');
    p.line(m.torso, [[0.82, 41.8], [1.02, 50.0]], '#3a2818', 9);
    p.line(m.torso, [[-0.02, 50.0], [0.22, 58.8]], '#3a2818', 9);
    beltAt(p, m.torso, 40.9, '#161210', '#8a8a80');
    p.wrapShade(REG.torso, 0.16);
    p.noise(REG.torso, 0.07);
    sleeve(p, m.armR, jacket, 'r', { cuff: sh(jacket, 0.7) });
    sleeve(p, m.armL, jacket, 'l', { cuff: sh(jacket, 0.7) });
    trousers(p, m.legR, jeans, 'r', { boot, cargo: false });
    trousers(p, m.legL, jeans, 'l', { boot, cargo: false });
    glove(p, m.handR, '#1d1b1a'); glove(p, m.handL, '#1d1b1a');
    bootFoot(p, m.footR, boot); bootFoot(p, m.footL, boot);
  },

  leet(p, m) {
    const skin = '#b88a64', shirt = '#a0906a', vestC = '#4a3c2a', pants = '#958562', boot = '#4a3424', wrap = '#b9a37a';
    paintSkinHead(p, m, { skin, hair: '#1a1410', mustache: true, stubble: true, browCol: '#1a120c', iris: '#2a1a10' });
    // sunglasses
    for (const s of [-1, 1]) {
      p.rrect(m.head, 0.5 + s * EYE_U - 0.034, 0.5 + s * EYE_U + 0.034, 66.55, 67.95, '#3a3a3a', 5);
      p.rrect(m.head, 0.5 + s * EYE_U - 0.031, 0.5 + s * EYE_U + 0.031, 66.62, 67.88, '#0a0a0c', 5);
      p.line(m.head, [[0.5 + s * EYE_U - 0.022, 67.6], [0.5 + s * EYE_U - 0.005, 67.75]], 'rgba(170,200,230,0.85)', 2);
      p.line(m.head, [[0.5 + s * EYE_U + 0.006, 66.85], [0.5 + s * EYE_U + 0.02, 66.95]], 'rgba(170,200,230,0.5)', 1.5);
    }
    p.line(m.head, [[0.5 - EYE_U + 0.03, 67.6], [0.5 + EYE_U - 0.03, 67.6]], '#202020', 2.4);
    p.line(m.head, [[0.5 - EYE_U - 0.034, 67.6], [0.5 - EAR_U + 0.02, 67.3]], '#202020', 2);
    p.line(m.head, [[0.5 + EYE_U + 0.034, 67.6], [0.5 + EAR_U - 0.02, 67.3]], '#202020', 2);
    p.noise(REG.head, 0.04);
    // head wrap (misc region) + its tail
    p.fill(REG.misc, wrap);
    for (let i = 0; i < 9; i++) p.line(m.misc01, [[0, 0.1 + i * 0.1], [1, 0.12 + i * 0.1 + p.r(-0.03, 0.03)]], sh(wrap, 0.65, 0.8), 2);
    p.folds(m.misc01, 26, wrap, { z0: 0, z1: 1, len: 0.12, slope: 0.1, dark: 0.55, light: 1.3, w: 2 });
    p.band(m.misc01, 0, 0.12, sh(wrap, 0.8));
    p.noise(REG.misc, 0.08);
    p.fill(REG.misc2, sh(wrap, 0.9));
    p.vfolds(m.misc2, 4, wrap, { z0: 0, z1: 1 });
    p.noise(REG.misc2, 0.08);
    // torso: khaki shirt + leather chest rig
    jacketBase(p, m.torso, shirt);
    pantsTop(p, m.torso, pants);
    p.line(m.torso, [[0.5, 41], [0.5, 59.5]], sh(shirt, 0.6), 1.3);
    for (const z of [43, 46.5, 50, 53.5, 57]) p.ell(m.torso, 0.51, z, 0.006, 0.2, '#d8c8a0');
    neckSkin(p, m.torso, skin);
    vest(p, m.torso, vestC, { zb: 43.5, zt: 56.5, under: shirt, pouchHex: '#5a4630', chestPouch: true });
    collar(p, m.torso, sh(shirt, 0.92), 60.4);
    p.band(m.torso, 61.0, 64.0, skin);
    beltAt(p, m.torso, 41.0, '#3a2a1a');
    p.wrapShade(REG.torso, 0.14);
    p.noise(REG.torso, 0.07);
    sleeve(p, m.armR, shirt, 'r', {});
    sleeve(p, m.armL, shirt, 'l', {});
    // rolled sleeve cuff + bare forearm
    for (const mm of [m.armR, m.armL]) {
      p.band(mm, 34.0, 40.8, skin);
      p.band(mm, 40.6, 42.2, sh(shirt, 0.88));
      p.line(mm, [[0, 41.4], [1, 41.4]], sh(shirt, 0.55), 1.2);
      p.noise(mm.reg, 0.03);
    }
    trousers(p, m.legR, pants, 'r', { boot });
    trousers(p, m.legL, pants, 'l', { boot });
    glove(p, m.handR, skin, { cuff: 1.0, bare: true }); glove(p, m.handL, skin, { cuff: 1.0, bare: true });
    bootFoot(p, m.footR, boot); bootFoot(p, m.footL, boot);
  },

  arctic(p, m) {
    const snow = '#d4d8da', grey1 = '#a2a8ae', grey2 = '#80878e', dark = '#5e646a', mask = '#26282c', boot = '#232323';
    const camo = [grey1, grey2, grey1, dark, '#c0c5c9'];
    paintBalaclava(p, m, mask, { skin: '#d0a888', iris: '#3a4a5a', mouth: true });
    jacketBase(p, m.torso, snow, { camo, camoN: 70, camoSize: 9 });
    pantsTop(p, m.torso, snow, { camo });
    // parka hood rolled around the neck + zipper + chest rig straps
    p.band(m.torso, 58.6, 61.8, sh(snow, 0.92));
    p.folds(m.torso, 10, snow, { z0: 59, z1: 61.5, len: 0.1, slope: 0.2 });
    p.band(m.torso, 61.8, 64.0, mask);
    p.line(m.torso, [[0.5, 39.8], [0.5, 58.6]], '#4a4e52', 2.2);
    p.stitch(m.torso, [[0.5, 40], [0.5, 58.5]], '#b8bcc0', [1, 2]);
    for (const u of [0.4, 0.6]) p.line(m.torso, [[u, 58.6], [u, 43.0]], '#3c4044', 4);
    p.line(m.torso, [[0.4, 51.5], [0.6, 51.5]], '#3c4044', 3);
    p.pouch(m.torso, 0.36, 0.44, 43.2, 47.4, '#6a7076', { snap: '#333' });
    p.pouch(m.torso, 0.56, 0.64, 43.2, 47.4, '#6a7076', { snap: '#333' });
    p.band(m.torso, 39.4, 41.6, sh(snow, 0.8)); // parka hem
    beltAt(p, m.torso, 42.3, '#34383c', '#8a8e92');
    p.line(m.torso, [[0.0, 58.6], [0.0, 43.0]], '#3c4044', 4);
    p.wrapShade(REG.torso, 0.15);
    p.noise(REG.torso, 0.06);
    sleeve(p, m.armR, snow, 'r', { camo, camoSize: 8, cuff: '#3a3c40' });
    sleeve(p, m.armL, snow, 'l', { camo, camoSize: 8, cuff: '#3a3c40' });
    trousers(p, m.legR, snow, 'r', { camo, camoSize: 8, boot, pocket: '#c4c9cc' });
    trousers(p, m.legL, snow, 'l', { camo, camoSize: 8, boot, pocket: '#c4c9cc' });
    glove(p, m.handR, '#3a3c40'); glove(p, m.handL, '#3a3c40');
    bootFoot(p, m.footR, boot); bootFoot(p, m.footL, boot);
  },

  guerilla(p, m) {
    const skin = '#a6714e', jacket = '#5a5434', pants = '#4c4632', boot = '#3a2a1c', band = '#6e2a22', beret = '#2a2c24';
    paintSkinHead(p, m, { skin, hair: '#120e0c', stubble: false, browCol: '#120c08', iris: '#1e140c', hairline: 69.4 });
    // bandana over the nose & mouth
    p.poly(m.head, [[0.0, 61.4], [0.0, 64.6], [0.2, 65.4], [0.35, 65.8], [0.5, 66.25], [0.65, 65.8], [0.8, 65.4], [1.0, 64.6], [1.0, 61.4]], band);
    p.poly(m.head, [[0.35, 65.8], [0.5, 66.25], [0.65, 65.8]], sh(band, 1.5), 2);
    for (let i = 0; i < 70; i++) {
      const u = p.r(0, 1), z = p.r(61.6, 65.4);
      p.ell(m.head, u, z, 0.006, 0.12, p.rand() < 0.5 ? '#d8c8a0' : '#1a0a08');
    }
    p.folds(m.head, 12, band, { z0: 62, z1: 65.4, len: 0.1, slope: 0.4, u0: 0.3, u1: 0.7, dark: 0.5, light: 1.5 });
    // knot at the back
    p.ell(m.head, 0.0, 64.8, 0.03, 0.7, sh(band, 0.8));
    p.ell(m.head, 1.0, 64.8, 0.03, 0.7, sh(band, 0.8));
    p.noise(REG.head, 0.05);
    // beret
    p.fill(REG.misc, beret);
    p.noise(REG.misc, 0.08, { rows: 2 });
    const bm = m.misc;
    p.band(bm, 68.6, 69.6, sh(beret, 0.6)); // leather band
    p.ell(bm, 0.5, 70.0, 0.04, 0.9, '#8a7a40'); // badge
    p.ell(bm, 0.5, 70.0, 0.022, 0.5, '#c0a850');
    p.folds(bm, 12, beret, { z0: 70.0, z1: 72.0, len: 0.12, slope: 0.4 });
    // field jacket
    jacketBase(p, m.torso, jacket);
    pantsTop(p, m.torso, pants);
    p.line(m.torso, [[0.5, 39], [0.5, 59]], sh(jacket, 0.5), 1.6);
    for (const z of [42, 46, 50, 54, 58]) p.ell(m.torso, 0.515, z, 0.007, 0.25, '#2a2418');
    p.pouch(m.torso, 0.36, 0.46, 50.5, 55.0, jacket, { snap: '#2a2418' });
    p.pouch(m.torso, 0.54, 0.64, 50.5, 55.0, jacket, { snap: '#2a2418' });
    p.pouch(m.torso, 0.33, 0.45, 42.0, 46.5, jacket, { snap: '#2a2418' });
    p.pouch(m.torso, 0.55, 0.67, 42.0, 46.5, jacket, { snap: '#2a2418' });
    p.band(m.torso, 38.8, 40.4, sh(jacket, 0.9));
    collar(p, m.torso, sh(jacket, 0.88), 60.6);
    neckSkin(p, m.torso, skin);
    p.band(m.torso, 61.0, 64.0, band);
    // ammo bandolier (left shoulder -> right hip)
    bandolier(p, m.torso, 0.69, 58.6, 0.32, 41.6, '#3e2c18');
    p.line(m.torso, [[0.18, 41.6], [-0.02, 50.0]], '#33240f', 9);
    p.line(m.torso, [[1.02, 50.0], [0.78, 58.8]], '#33240f', 9);
    beltAt(p, m.torso, 39.6, '#2a2014');
    p.wrapShade(REG.torso, 0.15);
    p.noise(REG.torso, 0.08, { tint: 0.02 });
    sleeve(p, m.armR, jacket, 'r', { cuff: sh(jacket, 0.8) });
    sleeve(p, m.armL, jacket, 'l', { cuff: sh(jacket, 0.8) });
    trousers(p, m.legR, pants, 'r', { boot });
    trousers(p, m.legL, pants, 'l', { boot });
    glove(p, m.handR, skin, { bare: true, cuff: 1 }); glove(p, m.handL, skin, { bare: true, cuff: 1 });
    bootFoot(p, m.footR, boot); bootFoot(p, m.footL, boot);
  },

  urban(p, m) {
    const skin = '#c8a07e', base = '#5c6a40', vestC = '#2a2d2a', boot = '#1c1c1c', helm = '#3e4a2e';
    const camo = ['#3a4828', '#6a5030', '#1c2016', '#8c8460', '#3a4828', '#5e4a2c', '#1c2016'];
    paintSkinHead(p, m, { skin, hair: '#4a3420', stubble: true, iris: '#3a5060' });
    // goggle strap around the head
    p.band(m.head, 66.6, 67.9, '#141414', 0, 0.42);
    p.band(m.head, 66.6, 67.9, '#141414', 0.58, 1);
    p.noise(REG.head, 0.04);
    // chin strap
    for (const s of [-1, 1]) p.line(m.head, [[0.5 + s * 0.215, 67.0], [0.5 + s * 0.2, 63.4], [0.5 + s * 0.15, 61.6]], '#202020', 2.4);
    // goggles (visor region)
    p.fill(REG.visor, '#151515');
    p.rrect(m.visor, 0.2, 0.47, 0.12, 0.88, '#2a3a40', 5);
    p.rrect(m.visor, 0.53, 0.8, 0.12, 0.88, '#2a3a40', 5);
    p.ell(m.visor, 0.3, 0.68, 0.04, 0.12, 'rgba(200,230,240,0.7)');
    p.ell(m.visor, 0.63, 0.68, 0.04, 0.12, 'rgba(200,230,240,0.7)');
    p.noise(REG.visor, 0.05);
    // helmet with woodland cover
    p.fill(REG.helmet, helm);
    p.camo(REG.helmet, camo, 50, 10);
    p.band(m.helmet, 66.0, 67.6, '#222820');
    p.folds(m.helmet, 16, helm, { z0: 68, z1: 72.5, len: 0.06, slope: 0.6 });
    p.grad(REG.helmet, [[0, 'rgb(255,255,255)'], [0.7, 'rgb(220,220,220)'], [1, 'rgb(160,160,160)']]);
    p.noise(REG.helmet, 0.08);
    // BDU blouse + vest
    jacketBase(p, m.torso, base, { camo, camoN: 170, camoSize: 8 });
    pantsTop(p, m.torso, base, { camo });
    neckSkin(p, m.torso, skin);
    collar(p, m.torso, mix(base, '#3c4a2a', 0.5), 60.4);
    vest(p, m.torso, vestC, { zb: 42.4, zt: 59.0, under: base, pouchHex: '#3a3e38', chestPouch: true });
    beltAt(p, m.torso, 41.0, '#1a1a1a', '#555');
    p.wrapShade(REG.torso, 0.14);
    p.noise(REG.torso, 0.07);
    const usFlag = (pp, mm, u) => {
      pp.rrect(mm, u - 0.08, u + 0.08, 53.2, 55.6, '#202020', 2);
      for (let i = 0; i < 5; i++) pp.band(mm, 53.4 + i * 0.42, 53.4 + i * 0.42 + 0.21, '#7a2a24', u - 0.07, u + 0.07);
      pp.band(mm, 54.4, 55.4, '#2a3050', u - 0.07, u - 0.01);
    };
    sleeve(p, m.armR, base, 'r', { camo, camoN: 110, camoSize: 7, patch: usFlag });
    sleeve(p, m.armL, base, 'l', { camo, camoN: 110, camoSize: 7 });
    trousers(p, m.legR, base, 'r', { camo, camoN: 150, camoSize: 7, boot, knee: '#202220' });
    trousers(p, m.legL, base, 'l', { camo, camoN: 150, camoSize: 7, boot, knee: '#202220' });
    glove(p, m.handR, '#1e1e1e'); glove(p, m.handL, '#1e1e1e');
    bootFoot(p, m.footR, boot); bootFoot(p, m.footL, boot);
    pouchTex(p, m, '#33372f');
  },

  gsg9(p, m) {
    const skin = '#caa286', base = '#6c7462', vestC = '#30352c', boot = '#1c1c1c', helm = '#363c34';
    paintSkinHead(p, m, { skin, hair: '#6a4a2a', stubble: false, iris: '#4a6070', hairline: 69.9 });
    for (const s of [-1, 1]) p.line(m.head, [[0.5 + s * 0.215, 67.4], [0.5 + s * 0.2, 63.4], [0.5 + s * 0.15, 61.6]], '#1e1e1e', 2.6);
    // headset mic boom on the left
    p.line(m.head, [[0.5 + EAR_U, 66.3], [0.5 + 0.1, 64.6], [0.5 + 0.045, 64.2]], '#151515', 1.8);
    p.ell(m.head, 0.5 + 0.045, 64.2, 0.008, 0.25, '#151515');
    p.noise(REG.head, 0.04);
    p.fill(REG.helmet, helm);
    p.band(m.helmet, 66.0, 67.6, sh(helm, 0.7));
    p.ell(m.helmet, 0.5, 70.2, 0.05, 1.0, sh(helm, 1.25, 0.6));
    p.folds(m.helmet, 6, helm, { z0: 68, z1: 72, len: 0.05, slope: 0.2, dark: 0.85, light: 1.1 });
    // ear cups / headset on the helmet sides
    for (const u of [0.25, 0.75]) p.ell(m.helmet, u, 67.3, 0.035, 1.2, '#1a1a1a');
    p.grad(REG.helmet, [[0, 'rgb(255,255,255)'], [0.7, 'rgb(225,225,225)'], [1, 'rgb(170,170,170)']]);
    p.noise(REG.helmet, 0.05);
    jacketBase(p, m.torso, base);
    pantsTop(p, m.torso, base);
    neckSkin(p, m.torso, skin);
    collar(p, m.torso, sh(base, 0.9), 60.4);
    vest(p, m.torso, vestC, { zb: 42.6, zt: 59.0, under: base, pouchHex: '#3a4036', chestPouch: true });
    beltAt(p, m.torso, 41.0, '#1c1c1c', '#606060');
    p.wrapShade(REG.torso, 0.14);
    p.noise(REG.torso, 0.06);
    const de = (pp, mm, u) => flag(pp, mm, u, 54.4, ['#151515', '#a02020', '#d0a820']);
    sleeve(p, m.armR, base, 'r', { patch: de, elbow: '#262826' });
    sleeve(p, m.armL, base, 'l', { elbow: '#262826' });
    trousers(p, m.legR, base, 'r', { boot, knee: '#262826' });
    trousers(p, m.legL, base, 'l', { boot, knee: '#262826' });
    glove(p, m.handR, '#1e1e1e'); glove(p, m.handL, '#1e1e1e');
    bootFoot(p, m.footR, boot); bootFoot(p, m.footL, boot);
    pouchTex(p, m, '#3a4036');
  },

  sas(p, m) {
    const hood = '#1c1c1f', rubber = '#121214', base = '#222226', vestC = '#151517', boot = '#161616';
    p.fill(REG.head, hood);
    p.noise(REG.head, 0.06, { rows: 3 });
    const h = m.head;
    // respirator face piece
    p.poly(h, [[0.5 - 0.14, 69.0], [0.5 - 0.16, 66.0], [0.5 - 0.12, 63.6], [0.5 - 0.05, 62.2], [0.5 + 0.05, 62.2], [0.5 + 0.12, 63.6], [0.5 + 0.16, 66.0], [0.5 + 0.14, 69.0], [0.5, 69.8]], rubber);
    p.poly(h, [[0.5 - 0.14, 69.0], [0.5 - 0.16, 66.0], [0.5 - 0.12, 63.6], [0.5 - 0.05, 62.2], [0.5 + 0.05, 62.2], [0.5 + 0.12, 63.6], [0.5 + 0.16, 66.0], [0.5 + 0.14, 69.0], [0.5, 69.8]], '#2e2e32', 2);
    for (const s of [-1, 1]) {
      const u = 0.5 + s * 0.058;
      p.ell(h, u, 67.25, 0.042, 1.3, '#3a3a40');
      p.ell(h, u, 67.25, 0.036, 1.1, '#1c2630');
      p.ell(h, u - 0.012, 67.65, 0.012, 0.35, 'rgba(150,180,200,0.7)');
      p.ell(h, u + 0.014, 66.8, 0.006, 0.18, 'rgba(150,180,200,0.5)');
    }
    // straps
    for (const z of [68.6, 65.0]) p.band(h, z - 0.35, z + 0.35, '#0c0c0c', 0, 0.36);
    for (const z of [68.6, 65.0]) p.band(h, z - 0.35, z + 0.35, '#0c0c0c', 0.64, 1);
    p.ell(h, 0.5, 70.8, 0.15, 0.6, sh(hood, 1.4, 0.6));
    // canister + emitter textures
    p.fill(REG.can, '#2a2a2c');
    p.band(m.can, 0.75, 1.0, '#3a3a3e');
    for (let i = 0; i < 6; i++) p.line(m.can, [[i / 6, 0], [i / 6, 0.75]], '#1a1a1a', 1);
    p.band(m.can, 0.3, 0.38, '#5a5a3a');
    p.noise(REG.can, 0.06);
    p.fill(REG.emit, '#18181a');
    p.band(m.emit, 0.8, 1, '#444');
    p.noise(REG.emit, 0.06);
    // black overalls
    jacketBase(p, m.torso, base);
    pantsTop(p, m.torso, base);
    p.band(m.torso, 59.6, 64.0, hood);
    vest(p, m.torso, vestC, { zb: 42.2, zt: 59.2, under: base, pouchHex: '#1e1e20', chestPouch: true });
    beltAt(p, m.torso, 40.9, '#0e0e0e', '#3a3a3a');
    // abseil harness straps
    p.line(m.torso, [[0.4, 41], [0.38, 35]], '#101010', 4);
    p.line(m.torso, [[0.6, 41], [0.62, 35]], '#101010', 4);
    p.wrapShade(REG.torso, 0.12);
    p.noise(REG.torso, 0.06);
    sleeve(p, m.armR, base, 'r', { elbow: '#151515' });
    sleeve(p, m.armL, base, 'l', { elbow: '#151515' });
    trousers(p, m.legR, base, 'r', { boot, knee: '#151515' });
    trousers(p, m.legL, base, 'l', { boot, knee: '#151515' });
    glove(p, m.handR, '#161616'); glove(p, m.handL, '#161616');
    bootFoot(p, m.footR, boot); bootFoot(p, m.footL, boot);
    pouchTex(p, m, '#1e1e20');
  },

  gign(p, m) {
    const skin = '#c49c7c', base = '#262f45', vestC = '#1b2132', boot = '#161616', helm = '#20283a';
    paintSkinHead(p, m, { skin, hair: '#2a1e14', mustache: true, iris: '#3a2a1c' });
    for (const s of [-1, 1]) p.line(m.head, [[0.5 + s * 0.215, 67.4], [0.5 + s * 0.2, 63.4], [0.5 + s * 0.15, 61.6]], '#151515', 2.6);
    p.noise(REG.head, 0.04);
    p.fill(REG.helmet, helm);
    p.band(m.helmet, 66.0, 67.8, sh(helm, 0.65));
    p.ell(m.helmet, 0.5, 70.4, 0.06, 1.0, sh(helm, 1.4, 0.6));
    for (const u of [0.25, 0.75]) { p.ell(m.helmet, u, 67.6, 0.03, 0.9, '#0e0e10'); p.ell(m.helmet, u, 67.6, 0.012, 0.35, '#5a5a60'); }
    p.grad(REG.helmet, [[0, 'rgb(255,255,255)'], [0.7, 'rgb(225,225,225)'], [1, 'rgb(170,170,170)']]);
    p.noise(REG.helmet, 0.05);
    // face shield: blue-grey tinted, alpha-blended (the face shows through)
    const v = m.visor;
    const g = p.g;
    g.clearRect(REG.visor[0], REG.visor[1], REG.visor[2], REG.visor[3]);
    p.fill(REG.visor, 'rgba(120,150,175,0.30)');
    p.line(v, [[0.1, 0.92], [0.34, 0.2]], 'rgba(235,245,255,0.55)', 6);
    p.line(v, [[0.2, 0.96], [0.42, 0.34]], 'rgba(235,245,255,0.3)', 3);
    p.line(v, [[0.66, 0.9], [0.8, 0.45]], 'rgba(235,245,255,0.22)', 4);
    p.band(v, 0.9, 1.0, 'rgba(20,24,34,1)');
    p.band(v, 0.0, 0.05, 'rgba(20,24,34,0.9)');
    p.band(v, 0, 1, 'rgba(20,24,34,0.95)', 0, 0.03);
    p.band(v, 0, 1, 'rgba(20,24,34,0.95)', 0.97, 1);
    jacketBase(p, m.torso, base);
    pantsTop(p, m.torso, base);
    neckSkin(p, m.torso, skin);
    collar(p, m.torso, sh(base, 0.85), 60.4);
    vest(p, m.torso, vestC, { zb: 42.4, zt: 59.0, under: base, pouchHex: '#232a3c', chestPouch: true });
    beltAt(p, m.torso, 41.0, '#121212', '#5a5a5a');
    p.wrapShade(REG.torso, 0.12);
    p.noise(REG.torso, 0.06);
    const fr = (pp, mm, u) => flag(pp, mm, u, 54.4, ['#2a3a8a', '#e0e0e0', '#b02a2a'], false);
    sleeve(p, m.armR, base, 'r', { patch: fr, elbow: '#151820' });
    sleeve(p, m.armL, base, 'l', { elbow: '#151820' });
    trousers(p, m.legR, base, 'r', { boot, knee: '#151820' });
    trousers(p, m.legL, base, 'l', { boot, knee: '#151820' });
    glove(p, m.handR, '#141414'); glove(p, m.handL, '#141414');
    bootFoot(p, m.footR, boot); bootFoot(p, m.footL, boot);
    pouchTex(p, m, '#232a3c');
  },
};

// Hostage (cs_ maps): a scientist in a white lab coat over a shirt and tie,
// grey slacks, bare hands, greying hair - CS 1.6's scientist.mdl
SKINS.scientist = function scientist(p, m) {
  const skin = '#d9b394', coat = '#e4e2dc', pants = '#45474e', shoe = '#1e1a16', shirt = '#9eb4c8', tie = '#5a1e22';
  paintSkinHead(p, m, { skin, hair: '#8f8d88', hairline: 70.6, iris: '#4a5a66', browCol: '#6e6c68' });
  p.noise(REG.head, 0.03);
  jacketBase(p, m.torso, coat, {});
  // open coat: shirt and tie down the front, lapels
  p.poly(m.torso, [[0.44, 60.0], [0.56, 60.0], [0.54, 47.0], [0.46, 47.0]], shirt);
  p.poly(m.torso, [[0.49, 59.4], [0.51, 59.4], [0.515, 50.0], [0.5, 48.6], [0.485, 50.0]], tie);
  p.rrect(m.torso, 0.485, 0.515, 58.6, 59.8, sh(tie, 0.8), 1);
  p.line(m.torso, [[0.44, 60.0], [0.46, 47.0]], sh(coat, 0.6), 1.6);
  p.line(m.torso, [[0.56, 60.0], [0.54, 47.0]], sh(coat, 0.6), 1.6);
  p.line(m.torso, [[0.5, 46.5], [0.5, 36.0]], sh(coat, 0.7), 1.4);
  for (const u of [0.38, 0.62]) p.pouch(m.torso, u - 0.05, u + 0.05, 39.5, 43.0, coat, { flap: 0.15 }); // coat pockets
  p.rrect(m.torso, 0.58, 0.6, 52.5, 55.0, '#2a2a6a', 1); // pen in the breast pocket
  p.pouch(m.torso, 0.56, 0.64, 51.5, 54.5, coat, { flap: 0.2 });
  neckSkin(p, m.torso, skin);
  collar(p, m.torso, '#f0eee8', 60.4);
  // the coat hangs below the waist: pelvis part of the torso stays coat white
  p.band(m.torso, 34.2, 41.2, coat);
  p.line(m.torso, [[0.5, 34.2], [0.5, 41.2]], sh(coat, 0.65), 1.4);
  p.wrapShade(REG.torso, 0.12);
  p.noise(REG.torso, 0.05);
  sleeve(p, m.armR, coat, 'r', {}); sleeve(p, m.armL, coat, 'l', {});
  trousers(p, m.legR, pants, 'r', { boot: shoe, cargo: false, noise: 0.05 });
  trousers(p, m.legL, pants, 'l', { boot: shoe, cargo: false, noise: 0.05 });
  glove(p, m.handR, skin, { bare: true }); glove(p, m.handL, skin, { bare: true });
  bootFoot(p, m.footR, shoe); bootFoot(p, m.footL, shoe);
};

// Zombie survival: a dead civilian - grey-green rotting skin, sunken dark-ringed eyes
// with milky irises, a torn bloody mouth, ripped and blood-soaked shirt and jeans,
// bare bloody forearms and hands
SKINS.zombie = function zombie(p, m) {
  const skin = '#7d8b6a', shirt = '#8c846e', jeans = '#363c4c', shoe = '#2a241e', gore = '#5e0e0c', dried = 'rgba(70,10,8,0.62)';
  const rot = () => `rgba(${Math.round(p.r(40, 90))},${Math.round(p.r(50, 80))},${Math.round(p.r(30, 60))},${p.r(0.1, 0.25).toFixed(2)})`;
  // a ragged hole in the cloth showing the skin underneath
  const rip = (mm, u, z, ru, rz, under = skin) => {
    const pts = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, k = p.r(0.55, 1.15);
      pts.push([u + Math.cos(a) * ru * k, z + Math.sin(a) * rz * k]);
    }
    p.poly(mm, pts, 'rgba(20,14,10,0.8)');
    p.poly(mm, pts.map(([x, y]) => [u + (x - u) * 0.82, z + (y - z) * 0.82]), under);
    p.ell(mm, u + p.r(-0.3, 0.3) * ru, z + p.r(-0.3, 0.3) * rz, ru * 0.35, rz * 0.35, gore);
  };
  const stains = (mm, n, u0, u1, z0, z1) => {
    for (let i = 0; i < n; i++) {
      const u = p.r(u0, u1), z = p.r(z0, z1);
      p.ell(mm, u, z, p.r(0.01, 0.05), p.r(0.3, 1.4), dried);
      if (p.r(0, 1) < 0.5) p.line(mm, [[u, z], [u + p.r(-0.01, 0.01), z - p.r(1, 4)]], dried, p.r(1, 2.2)); // drip
    }
  };
  paintSkinHead(p, m, { skin, hair: '#24201a', hairline: 70.3, iris: '#d8d4b0', browCol: '#34342a' });
  const h = m.head;
  for (let i = 0; i < 46; i++) p.ell(h, p.r(0, 1), p.r(61.6, 71), p.r(0.01, 0.035), p.r(0.2, 0.7), rot());
  for (let i = 0; i < 24; i++) { // veins
    const u = p.r(0.3, 0.7), z = p.r(62.4, 70.4);
    p.line(h, [[u, z], [u + p.r(-0.025, 0.025), z + p.r(-0.7, 0.7)], [u + p.r(-0.04, 0.04), z + p.r(-1.2, 1.2)]], 'rgba(46,40,72,0.35)', 1);
  }
  for (const s of [-1, 1]) { // sunken, dark-ringed, bloodshot eyes
    const u = 0.5 + s * EYE_U;
    p.ell(h, u, EYE_Z + 0.02, 0.038, 0.66, 'rgba(26,16,18,0.6)');
    p.ell(h, u, EYE_Z, 0.021, 0.26, '#cbc296');
    p.ell(h, u + s * 0.002, EYE_Z - 0.02, 0.009, 0.21, '#e4dfbe');
    p.ell(h, u + s * 0.002, EYE_Z - 0.02, 0.003, 0.07, '#4a2424');
    for (let i = 0; i < 4; i++) p.line(h, [[u + s * 0.02, EYE_Z + p.r(-0.15, 0.15)], [u + s * p.r(0.004, 0.012), EYE_Z + p.r(-0.1, 0.1)]], 'rgba(150,26,26,0.75)', 1);
  }
  // mouth torn open, teeth, blood down the chin and neck
  p.ell(h, 0.5, 64.0, 0.042, 0.34, '#240505');
  p.line(h, [[0.468, 64.2], [0.532, 64.2]], '#a8a084', 1.4);
  p.line(h, [[0.472, 63.82], [0.528, 63.82]], '#968e72', 1.2);
  p.poly(h, [[0.455, 63.9], [0.545, 63.9], [0.54, 62.3], [0.525, 61.4], [0.508, 62.5], [0.492, 61.4], [0.475, 62.2], [0.46, 61.6]], 'rgba(92,8,8,0.88)');
  p.ell(h, 0.5 + 0.095, 65.2, 0.026, 0.48, gore); // torn cheek
  p.ell(h, 0.5 + 0.095, 65.2, 0.013, 0.26, '#240404');
  p.line(h, [[0.44, 69.5], [0.5, 68.9], [0.555, 69.3]], gore, 2.4); // gash on the forehead
  p.noise(REG.head, 0.09);
  // torso: torn shirt over jeans
  jacketBase(p, m.torso, shirt, {});
  pantsTop(p, m.torso, jeans, { top: 40.2 });
  beltAt(p, m.torso, 40.9, '#2a1e14', '#6a6050');
  neckSkin(p, m.torso, skin);
  collar(p, m.torso, sh(shirt, 0.85), 60.4);
  p.poly(m.torso, [[0.47, 61.0], [0.53, 61.0], [0.52, 56.0], [0.5, 54.5], [0.485, 57.0]], 'rgba(92,8,8,0.8)'); // blood from the mouth
  rip(m.torso, 0.6, 48.5, 0.07, 2.6);
  rip(m.torso, 0.36, 53.5, 0.05, 1.8);
  rip(m.torso, 0.9, 46.0, 0.06, 2.2);
  rip(m.torso, 0.15, 51.0, 0.05, 2.0);
  stains(m.torso, 40, 0.3, 0.7, 42, 60);
  stains(m.torso, 16, 0, 1, 34, 60);
  p.wrapShade(REG.torso, 0.15);
  p.noise(REG.torso, 0.1);
  // arms: sleeves torn off above the elbow, bare bloody forearms
  for (const [mm, side] of [[m.armR, 'r'], [m.armL, 'l']]) {
    sleeve(p, mm, shirt, side, { noise: 0.1 });
    p.band(mm, 33.6, 49.5, skin);
    const edge = [[0, 49.5]];
    for (let u = 0.05; u < 1.0; u += 0.05) edge.push([u, 49.5 + p.r(-0.4, 1.6)]);
    edge.push([1, 49.5], [1, 47.8], [0, 47.8]);
    p.poly(mm, edge, skin);
    for (let i = 0; i < 18; i++) p.ell(mm, p.r(0, 1), p.r(34, 49), p.r(0.02, 0.06), p.r(0.3, 1.0), rot());
    stains(mm, 10, 0, 1, 34, 49);
    p.ell(mm, side === 'r' ? 0.3 : 0.7, 40.0, 0.07, 1.0, gore); // bite
    p.ell(mm, side === 'r' ? 0.3 : 0.7, 40.0, 0.035, 0.5, '#240404');
  }
  for (const mm of [m.handR, m.handL]) {
    glove(p, mm, skin, { bare: true });
    p.band(mm, 26, 28.4, 'rgba(46,10,10,0.75)'); // filthy, bloody fingers
    stains(mm, 6, 0, 1, 28, 35);
  }
  for (const [mm, side] of [[m.legR, 'r'], [m.legL, 'l']]) {
    trousers(p, mm, jeans, side, { boot: shoe, cargo: false, noise: 0.1 });
    rip(mm, 0.5, 20.5, 0.12, 1.8);
    if (side === 'r') rip(mm, 0.3, 30, 0.07, 1.5);
    stains(mm, 14, 0, 1, 10, 40);
  }
  bootFoot(p, m.footR, shoe); bootFoot(p, m.footL, shoe);
};

// ------------------------------------------------------------------ zombie bosses
// (src/game/bosses.js) Shared helpers: blood stains, stitched scars, a bare body part.
function bossKit(p) {
  const dried = 'rgba(70,10,8,0.62)';
  return {
    stains(mm, n, u0, u1, z0, z1, col = dried) {
      for (let i = 0; i < n; i++) {
        const u = p.r(u0, u1), z = p.r(z0, z1);
        p.ell(mm, u, z, p.r(0.01, 0.05), p.r(0.3, 1.4), col);
        if (p.r(0, 1) < 0.5) p.line(mm, [[u, z], [u + p.r(-0.01, 0.01), z - p.r(1, 4)]], col, p.r(1, 2.2));
      }
    },
    stitches(mm, pts, col = '#1a1010') {
      p.line(mm, pts, col, 1.6);
      for (let i = 0; i < pts.length - 1; i++) {
        const [u0, z0] = pts[i], [u1, z1] = pts[i + 1];
        for (let t = 0.15; t < 1; t += 0.3) {
          const u = u0 + (u1 - u0) * t, z = z0 + (z1 - z0) * t;
          p.line(mm, [[u - 0.008, z - 0.35], [u + 0.008, z + 0.35]], col, 1.3);
        }
      }
    },
    bare(mm, skin, shade = 0.14, noise = 0.08) {
      p.fill(mm.reg, skin);
      p.wrapShade(mm.reg, shade);
      p.noise(mm.reg, noise);
    },
    veins(mm, n, u0, u1, z0, z1, col) {
      for (let i = 0; i < n; i++) {
        const u = p.r(u0, u1), z = p.r(z0, z1);
        p.line(mm, [[u, z], [u + p.r(-0.03, 0.03), z + p.r(-1, 1)], [u + p.r(-0.05, 0.05), z + p.r(-2, 2)]], col, 1);
      }
    },
  };
}

// The Butcher: huge, bald and stitched, bare-chested under a blood-soaked apron
SKINS.butcher = function butcher(p, m) {
  const K = bossKit(p);
  const skin = '#b39484', apron = '#d6cfbe', pants = '#3a3532', boot = '#141210', fresh = 'rgba(120,8,6,0.8)';
  paintSkinHead(p, m, { skin, noHair: true, iris: '#d0c8a8', browCol: '#4a3a30' });
  const h = m.head;
  K.stitches(h, [[0.2, 71.5], [0.35, 70.2], [0.5, 69.6], [0.62, 70.4], [0.8, 71.8]]);
  K.stitches(h, [[0.58, 69.0], [0.6, 66.5], [0.63, 64.0]]);
  p.ell(h, 0.5, 64.0, 0.045, 0.3, '#2a0808'); // snarl
  for (let i = 0; i < 6; i++) p.rrect(h, 0.462 + i * 0.013, 0.47 + i * 0.013, 63.95, 64.3, '#b0a888', 0);
  p.ell(h, 0.5 - EYE_U, EYE_Z, 0.02, 0.26, '#d8d4c4'); // one milky eye
  K.stains(h, 10, 0.35, 0.65, 61.5, 64.5, fresh);
  p.noise(REG.head, 0.08);
  // torso: hairy bare chest, then the apron from the chest down
  K.bare(m.torso, skin);
  for (let i = 0; i < 260; i++) p.ell(m.torso, p.r(0.36, 0.64), p.r(47, 58), 0.003, 0.12, 'rgba(40,24,18,0.5)');
  p.band(m.torso, 34.2, 41.2, pants);
  p.poly(m.torso, [[0.33, 34.2], [0.67, 34.2], [0.66, 52.0], [0.6, 56.5], [0.4, 56.5], [0.34, 52.0]], apron);
  p.line(m.torso, [[0.41, 56.5], [0.36, 63.0]], '#6a5a48', 3); p.line(m.torso, [[0.59, 56.5], [0.64, 63.0]], '#6a5a48', 3); // neck strap
  p.line(m.torso, [[0.0, 44.0], [0.33, 44.0]], '#6a5a48', 2.5); p.line(m.torso, [[0.67, 44.0], [1.0, 44.0]], '#6a5a48', 2.5); // waist ties
  K.stains(m.torso, 70, 0.34, 0.66, 35, 56, fresh);
  K.stains(m.torso, 30, 0.34, 0.66, 35, 56);
  p.poly(m.torso, [[0.45, 52], [0.55, 52], [0.53, 46], [0.47, 46]], 'rgba(150,10,8,0.6)'); // handprint smear
  K.stitches(m.torso, [[0.2, 56], [0.25, 50], [0.24, 44]]);
  p.wrapShade(REG.torso, 0.15);
  for (const [mm, side] of [[m.armR, 'r'], [m.armL, 'l']]) {
    K.bare(mm, skin);
    K.stains(mm, 40, 0, 1, 34, 47, fresh); // blood to the elbows
    K.stitches(mm, [[side === 'r' ? 0.3 : 0.7, 58], [side === 'r' ? 0.32 : 0.68, 50]]);
  }
  for (const mm of [m.handR, m.handL]) { glove(p, mm, skin, { bare: true }); K.stains(mm, 12, 0, 1, 28, 35, fresh); }
  for (const [mm, side] of [[m.legR, 'r'], [m.legL, 'l']]) {
    trousers(p, mm, pants, side, { boot, cargo: false, noise: 0.1 });
    p.band(mm, 14, 41.2, apron, 0.32, 0.68); // apron front down to the knees
    K.stains(mm, 40, 0.32, 0.68, 14, 41, fresh);
  }
  bootFoot(p, m.footR, boot); bootFoot(p, m.footL, boot);
};

// The Spitter: bloated sickly-green body covered in acid pustules, scraps of a hospital gown
SKINS.spitter = function spitter(p, m) {
  const K = bossKit(p);
  const skin = '#9aa45a', gown = '#86a0aa', vein = 'rgba(40,70,20,0.55)';
  paintSkinHead(p, m, { skin, hair: '#3a3a24', hairline: 71.4, iris: '#e8e040', browCol: '#3a3a20' });
  const h = m.head;
  for (const s of [-1, 1]) { p.ell(h, 0.5 + s * EYE_U, EYE_Z, 0.026, 0.36, '#e4dc70'); p.ell(h, 0.5 + s * EYE_U, EYE_Z, 0.007, 0.2, '#201808'); }
  p.ell(h, 0.5, 63.9, 0.05, 0.45, '#1a2008'); // gaping mouth
  p.poly(h, [[0.46, 63.6], [0.54, 63.6], [0.53, 61.6], [0.5, 61.3], [0.47, 61.7]], 'rgba(150,220,40,0.85)'); // acid drool
  K.veins(h, 30, 0.3, 0.7, 62, 71, vein);
  p.noise(REG.head, 0.1);
  K.bare(m.torso, skin, 0.16, 0.1);
  K.veins(m.torso, 90, 0, 1, 36, 60, vein);
  // dark sockets around the (glowing) pustules
  for (const [u, z, r] of PUSTULES) p.ell(m.torso, u, z, r * 0.02, r * 0.55, 'rgba(60,70,10,0.8)');
  p.band(m.torso, 34.2, 42.0, gown);
  for (let u = 0; u < 1; u += 0.04) p.poly(m.torso, [[u, 42.0], [u + 0.04, 42.0], [u + 0.02, 42.0 + p.r(0.5, 3.5)]], gown); // torn hem
  K.stains(m.torso, 30, 0, 1, 34, 50, 'rgba(110,140,20,0.5)');
  p.wrapShade(REG.torso, 0.15);
  for (const mm of [m.armR, m.armL]) { K.bare(mm, skin); K.veins(mm, 30, 0, 1, 34, 60, vein); }
  for (const mm of [m.handR, m.handL]) glove(p, mm, skin, { bare: true });
  for (const [mm, side] of [[m.legR, 'r'], [m.legL, 'l']]) {
    K.bare(mm, skin);
    p.band(mm, 26, 41.2, gown);
    K.veins(mm, 25, 0, 1, 3, 26, vein);
    void side;
  }
  for (const mm of [m.footR, m.footL]) { p.fill(mm.reg, sh(skin, 0.8)); p.noise(mm.reg, 0.1); }
};
// ------------------------------------------------------------------ special infected
// (src/game/specials.js) rarer zombies, each with its own look.

// The Boomer: bloated pale-yellow body splitting a too-small vest, boils everywhere
SKINS.boomer = function boomer(p, m) {
  const K = bossKit(p);
  const skin = '#c4be86', vest = '#d8d2c0', shorts = '#4a4436', boil = '#a8a050', vein = 'rgba(110,90,50,0.45)';
  const boils = (mm, n, z0, z1) => { for (let i = 0; i < n; i++) { const u = p.r(0, 1), z = p.r(z0, z1), r = p.r(0.4, 1.2); p.ell(mm, u, z, r * 0.022, r * 0.5, sh(boil, 0.7)); p.ell(mm, u, z + 0.1, r * 0.014, r * 0.32, boil); p.ell(mm, u, z + 0.2, r * 0.005, r * 0.12, '#e0dca0'); } };
  paintSkinHead(p, m, { skin, noHair: true, iris: '#d8d080', browCol: '#6a6040' });
  const h = m.head;
  for (const s of [-1, 1]) p.ell(h, 0.5 + s * EYE_U, EYE_Z + 0.1, 0.03, 0.45, 'rgba(120,100,40,0.6)'); // puffy lids
  p.ell(h, 0.5, 63.9, 0.05, 0.4, '#3a3410'); // slack mouth
  p.poly(h, [[0.46, 63.7], [0.54, 63.7], [0.53, 61.8], [0.5, 61.4], [0.47, 61.8]], 'rgba(150,170,40,0.85)'); // bile drool
  boils(h, 16, 62, 71);
  K.veins(h, 20, 0.3, 0.7, 62, 70, vein);
  p.noise(REG.head, 0.08);
  K.bare(m.torso, skin, 0.18, 0.08);
  for (let i = 0; i < 26; i++) { const u = p.r(0.3, 0.7), z = p.r(38, 50); p.line(m.torso, [[u, z], [u + p.r(-0.02, 0.02), z + p.r(1, 3)]], 'rgba(170,120,110,0.5)', 1.3); } // stretch marks
  p.band(m.torso, 50, 59, vest, 0.25, 0.75); // vest riding up over the belly
  p.band(m.torso, 50, 59, vest, 0.0, 0.18); p.band(m.torso, 50, 59, vest, 0.82, 1.0);
  p.band(m.torso, 34.2, 39.5, shorts);
  K.stains(m.torso, 30, 0.2, 0.8, 40, 58, 'rgba(140,160,30,0.5)'); // bile
  boils(m.torso, 30, 38, 60);
  p.wrapShade(REG.torso, 0.16);
  for (const mm of [m.armR, m.armL]) { K.bare(mm, skin); boils(mm, 12, 34, 60); K.veins(mm, 15, 0, 1, 34, 60, vein); }
  for (const mm of [m.handR, m.handL]) glove(p, mm, skin, { bare: true });
  for (const [mm, side] of [[m.legR, 'r'], [m.legL, 'l']]) { K.bare(mm, skin); p.band(mm, 28, 41.2, shorts); boils(mm, 8, 6, 28); void side; }
  for (const mm of [m.footR, m.footL]) { p.fill(mm.reg, sh(skin, 0.75)); p.noise(mm.reg, 0.1); }
};

// The Charger: grey-brown, shirt torn off the huge right arm, the left one withered in its sleeve
SKINS.charger = function charger(p, m) {
  const K = bossKit(p);
  const skin = '#9c8a78', shirt = '#5a6a7a', jeans = '#2e3440', boot = '#1c1814', bruise = 'rgba(70,40,80,0.4)', fresh = 'rgba(120,8,6,0.75)';
  paintSkinHead(p, m, { skin, hair: '#1c1814', hairline: 70.8, iris: '#c8b890', browCol: '#3a3028' });
  const h = m.head;
  p.ell(h, 0.5, 63.8, 0.055, 0.45, '#200606'); // jaw hanging open
  for (let i = 0; i < 6; i++) p.rrect(h, 0.462 + i * 0.013, 0.47 + i * 0.013, 64.0, 64.35, '#b8ae90', 0);
  p.ell(h, 0.42, 66.0, 0.03, 0.8, bruise);
  K.stains(h, 8, 0.4, 0.6, 61.5, 64, fresh);
  p.noise(REG.head, 0.08);
  jacketBase(p, m.torso, shirt, {});
  pantsTop(p, m.torso, jeans, { top: 40.2 });
  beltAt(p, m.torso, 40.9, '#1e1a16', '#707070');
  neckSkin(p, m.torso, skin);
  p.poly(m.torso, [[0.62, 64], [1.0, 64], [1.0, 42], [0.82, 44], [0.7, 54]], skin); // ripped open on the right
  K.stains(m.torso, 30, 0.3, 0.9, 42, 60, fresh);
  p.wrapShade(REG.torso, 0.15);
  K.bare(m.armR, skin, 0.2, 0.1); // the big arm: bare, bruised, veined
  for (let i = 0; i < 10; i++) p.ell(m.armR, p.r(0, 1), p.r(36, 58), p.r(0.05, 0.12), p.r(0.8, 2), bruise);
  K.veins(m.armR, 40, 0, 1, 34, 60, 'rgba(60,40,60,0.5)');
  K.stains(m.armR, 20, 0, 1, 34, 46, fresh);
  sleeve(p, m.armL, shirt, 'l', { noise: 0.1 });
  glove(p, m.handR, sh(skin, 0.9), { bare: true }); K.stains(m.handR, 10, 0, 1, 26, 35, fresh);
  glove(p, m.handL, skin, { bare: true });
  for (const [mm, side] of [[m.legR, 'r'], [m.legL, 'l']]) { trousers(p, mm, jeans, side, { boot, cargo: false, noise: 0.1 }); K.stains(mm, 10, 0, 1, 10, 40); }
  bootFoot(p, m.footR, boot); bootFoot(p, m.footL, boot);
};

// The Sprinter: emaciated, chalk-white, ribs showing, torn running shorts, red eyes
SKINS.sprinter = function sprinter(p, m) {
  const K = bossKit(p);
  const skin = '#b4b8ae', shorts = '#7a2424', vein = 'rgba(70,60,110,0.4)', fresh = 'rgba(120,8,6,0.8)';
  paintSkinHead(p, m, { skin, hair: '#3a3028', hairline: 70.6, iris: '#ff2010', browCol: '#3a3028' });
  const h = m.head;
  for (const s of [-1, 1]) p.ell(h, 0.5 + s * EYE_U, EYE_Z, 0.036, 0.6, 'rgba(40,10,10,0.7)');
  p.ell(h, 0.5, 64.0, 0.05, 0.38, '#1a0404'); // screaming mouth
  K.stains(h, 14, 0.42, 0.58, 61.5, 64.2, fresh);
  K.veins(h, 18, 0.3, 0.7, 62, 70, vein);
  p.noise(REG.head, 0.07);
  K.bare(m.torso, skin, 0.2, 0.07);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) p.line(m.torso, [[0.5 + s * 0.04, 54 - i * 1.8], [0.5 + s * 0.16, 53 - i * 1.8]], 'rgba(90,90,100,0.45)', 1.6); // ribs
  p.band(m.torso, 34.2, 39.4, shorts);
  K.stains(m.torso, 25, 0.3, 0.7, 40, 60, fresh);
  K.veins(m.torso, 30, 0, 1, 40, 60, vein);
  for (const mm of [m.armR, m.armL]) { K.bare(mm, skin, 0.16, 0.07); K.veins(mm, 18, 0, 1, 34, 60, vein); }
  for (const mm of [m.handR, m.handL]) { glove(p, mm, skin, { bare: true }); K.stains(mm, 8, 0, 1, 26, 35, fresh); }
  for (const mm of [m.legR, m.legL]) { K.bare(mm, skin, 0.16, 0.07); p.band(mm, 33, 41.2, shorts); }
  for (const mm of [m.footR, m.footL]) { p.fill(mm.reg, sh(skin, 0.7)); p.noise(mm.reg, 0.1); }
};

// The Hunter: dark hoodie with the hood up, taped hands, a bloodied jaw under the hood
SKINS.hunter = function hunter(p, m) {
  const K = bossKit(p);
  const skin = '#a8a696', hood = '#3a3e46', jeans = '#24282e', shoe = '#141414', tape = '#c8c4b0', fresh = 'rgba(120,8,6,0.85)';
  paintSkinHead(p, m, { skin, hair: hood, hairline: 66.6, iris: '#f0f0e0', browCol: '#202020' });
  const h = m.head;
  p.band(h, 66.6, 74, hood); // the hood over the head
  for (const s of [-1, 1]) p.poly(h, [[0.5 + s * 0.15, 66.6], [0.5 + s * 0.26, 66.6], [0.5 + s * 0.26, 61.5], [0.5 + s * 0.17, 62.5]], hood); // hood sides
  p.band(h, 66.0, 66.7, 'rgba(10,10,12,0.8)'); // shadow under the hood
  p.ell(h, 0.5, 63.9, 0.05, 0.4, '#1a0404');
  for (let i = 0; i < 7; i++) p.rrect(h, 0.458 + i * 0.012, 0.465 + i * 0.012, 64.0, 64.4, '#c0b898', 0);
  K.stains(h, 16, 0.42, 0.58, 61.3, 64.2, fresh);
  p.noise(REG.head, 0.07);
  jacketBase(p, m.torso, hood, {});
  p.poly(m.torso, [[0.42, 58], [0.58, 58], [0.57, 52], [0.43, 52]], sh(hood, 0.85)); // pocket
  for (const s of [-1, 1]) p.line(m.torso, [[0.5 + s * 0.03, 62], [0.5 + s * 0.035, 55]], '#c8c8c0', 1.4); // drawstrings
  pantsTop(p, m.torso, jeans, { top: 40.2 });
  K.stains(m.torso, 30, 0.3, 0.7, 42, 60, fresh);
  p.wrapShade(REG.torso, 0.16);
  for (const [mm, side] of [[m.armR, 'r'], [m.armL, 'l']]) { sleeve(p, mm, hood, side, { noise: 0.1 }); K.stains(mm, 10, 0, 1, 34, 50, fresh); }
  for (const mm of [m.handR, m.handL]) { glove(p, mm, skin, { bare: true }); p.band(mm, 28, 33, tape); for (let z = 28.5; z < 33; z += 1.1) p.line(mm, [[0, z], [1, z + 0.4]], sh(tape, 0.8), 1); K.stains(mm, 8, 0, 1, 26, 34, fresh); }
  for (const [mm, side] of [[m.legR, 'r'], [m.legL, 'l']]) { trousers(p, mm, jeans, side, { boot: shoe, cargo: false, noise: 0.1 }); K.stains(mm, 8, 0, 1, 10, 40); }
  bootFoot(p, m.footR, shoe); bootFoot(p, m.footL, shoe);
};

// The Smoker: tall and gaunt, grey skin bubbling with tumours down one side, a long dirty coat
SKINS.smoker = function smoker(p, m) {
  const K = bossKit(p);
  const skin = '#8c8478', coat = '#5a4a38', shirt = '#7a7466', pants = '#3a3630', boot = '#1a1612', tumour = '#9a6a58';
  const lumps = (mm, n, u0, u1, z0, z1) => { for (let i = 0; i < n; i++) { const u = p.r(u0, u1), z = p.r(z0, z1), r = p.r(0.5, 1.4); p.ell(mm, u, z, r * 0.03, r * 0.6, sh(tumour, 0.7)); p.ell(mm, u, z + 0.15, r * 0.02, r * 0.4, tumour); p.ell(mm, u - 0.004, z + 0.3, r * 0.008, r * 0.15, '#c09080'); } };
  paintSkinHead(p, m, { skin, hair: '#2a2620', hairline: 71.0, iris: '#c8c0a0', browCol: '#2a2620' });
  const h = m.head;
  lumps(h, 26, 0.55, 0.85, 61.5, 70); // one side of the face swallowed by tumours
  p.ell(h, 0.5, 63.9, 0.045, 0.32, '#2a1010');
  p.poly(h, [[0.47, 63.7], [0.53, 63.7], [0.52, 62.2], [0.5, 61.8], [0.48, 62.2]], 'rgba(150,40,60,0.85)'); // the tongue lolling out
  p.noise(REG.head, 0.08);
  jacketBase(p, m.torso, shirt, {});
  neckSkin(p, m.torso, skin);
  lumps(m.torso, 18, 0.55, 0.8, 54, 64); // neck and shoulder
  pantsTop(p, m.torso, pants, { top: 40.2 });
  for (const s of [0, 1]) p.band(m.torso, 34.2, 62, coat, s ? 0.72 : 0, s ? 1 : 0.28); // open coat
  p.wrapShade(REG.torso, 0.16);
  for (const [mm, side] of [[m.armR, 'r'], [m.armL, 'l']]) { sleeve(p, mm, coat, side, { noise: 0.12 }); if (side === 'r') lumps(mm, 8, 0, 1, 50, 60); }
  for (const mm of [m.handR, m.handL]) glove(p, mm, skin, { bare: true });
  for (const [mm, side] of [[m.legR, 'r'], [m.legL, 'l']]) { trousers(p, mm, pants, side, { boot, cargo: false, noise: 0.1 }); p.band(mm, 22, 41.2, coat, side === 'r' ? 0.0 : 0.6, side === 'r' ? 0.4 : 1.0); }
  bootFoot(p, m.footR, boot); bootFoot(p, m.footL, boot);
};

// pustule spots on the torso (u, z, size) - painted sockets + glow map + 3D extras line up
export const PUSTULES = [[0.44, 50, 1.4], [0.58, 47, 1.8], [0.52, 55, 1.2], [0.62, 53, 1.1], [0.38, 45, 1.3], [0.12, 52, 1.5], [0.9, 48, 1.6], [0.0, 56, 1.2]];

// The Banshee: tall gaunt corpse-white woman, long black hair, glowing eyes, tattered white dress
SKINS.banshee = function banshee(p, m) {
  const K = bossKit(p);
  const skin = '#d6dbe0', dress = '#dedad0', hair = '#0c0c10', vein = 'rgba(60,60,110,0.45)';
  paintSkinHead(p, m, { skin, hair, hairline: 69.0, iris: '#f4f8ff', browCol: '#202028' });
  const h = m.head;
  for (const s of [-1, 1]) {
    p.ell(h, 0.5 + s * EYE_U, EYE_Z, 0.04, 0.7, 'rgba(10,10,20,0.75)'); // black-ringed eyes
    p.ell(h, 0.5 + s * EYE_U, EYE_Z, 0.021, 0.26, '#f0f4ff');
    p.line(h, [[0.5 + s * EYE_U, EYE_Z - 0.3], [0.5 + s * (EYE_U + 0.01), EYE_Z - 2.2]], 'rgba(20,20,30,0.7)', 1.6); // black tears
  }
  p.ell(h, 0.5, 64.0, 0.03, 0.22, '#1a1018'); // black lips
  K.veins(h, 20, 0.35, 0.65, 62, 70, vein);
  p.noise(REG.head, 0.06);
  // dress bodice
  p.fill(m.torso.reg, dress);
  neckSkin(p, m.torso, skin);
  p.poly(m.torso, [[0.36, 64], [0.64, 64], [0.6, 57], [0.5, 55.5], [0.4, 57]], skin); // neckline
  p.folds(m.torso, 16, dress, { z0: 36, z1: 58, len: 0.1, slope: 1.2 });
  K.stains(m.torso, 25, 0.3, 0.7, 36, 58);
  p.wrapShade(REG.torso, 0.14);
  p.noise(REG.torso, 0.06);
  // skirt (misc region, v: 0 = waist, 1 = hem): tattered, darker and dirtier toward the hem
  const sk = M(p).misc01;
  p.fill(sk.reg, dress);
  p.grad(sk.reg, [[0, 'rgb(170,165,160)'], [0.5, 'rgb(235,235,235)'], [1, 'rgb(255,255,255)']]);
  p.vfolds(sk, 22, dress, { z0: 0, z1: 1 });
  for (let u = 0; u < 1; u += 0.03) p.poly(sk, [[u, 1.01], [u + 0.03, 1.01], [u + 0.015, 1 - p.r(0.05, 0.22)]], 'rgba(40,36,30,0.75)');
  K.stains(sk, 30, 0, 1, 0.3, 1, 'rgba(60,40,30,0.4)');
  // long hair (misc2)
  p.fill(REG.misc2, hair);
  for (let i = 0; i < 60; i++) { const u = p.r(0, 1); p.line(M(p).misc2, [[u, 0], [u + p.r(-0.1, 0.1), 1]], 'rgba(60,60,70,0.4)', 1); }
  for (const mm of [m.armR, m.armL]) { K.bare(mm, skin, 0.12, 0.05); K.veins(mm, 25, 0, 1, 34, 60, vein); }
  for (const mm of [m.handR, m.handL]) { glove(p, mm, skin, { bare: true }); p.band(mm, 26, 28.6, '#101018'); }
  for (const mm of [m.legR, m.legL]) K.bare(mm, skin, 0.12, 0.05);
  for (const mm of [m.footR, m.footL]) { p.fill(mm.reg, sh(skin, 0.75)); p.noise(mm.reg, 0.08); }
};

// The Inferno: a charred black corpse cracked open over a burning core
SKINS.inferno = function inferno(p, m) {
  const char = '#1d1714', ash = '#4a4440';
  const blotch = (mm, n) => { for (let i = 0; i < n; i++) p.ell(mm, p.r(0, 1), p.r(-10, 80), p.r(0.02, 0.07), p.r(0.4, 1.6), `rgba(74,68,64,${p.r(0.2, 0.5).toFixed(2)})`); };
  for (const reg of [REG.head, REG.torso, REG.armR, REG.armL, REG.legR, REG.legL, REG.handR, REG.handL, REG.footR, REG.footL]) p.fill(reg, char);
  for (const mm of [m.head, m.torso, m.armR, m.armL, m.legR, m.legL]) blotch(mm, 40);
  // cracks (dark here; they glow in the glow map)
  for (const mm of [m.head, m.torso, m.armR, m.armL, m.legR, m.legL, m.handR, m.handL]) emberCracks(p, mm, '#3a1a08', 1.8);
  const h = m.head;
  for (const s of [-1, 1]) p.ell(h, 0.5 + s * EYE_U, EYE_Z, 0.03, 0.4, '#100804');
  p.ell(h, 0.5, 64.0, 0.05, 0.4, '#100804');
  p.band(m.torso, 34.2, 39.5, '#2a2018'); // what's left of the trousers
  for (const reg of [REG.head, REG.torso, REG.armR, REG.armL, REG.legR, REG.legL]) p.noise(reg, 0.12);
  void ash;
};
// a jagged crack network (shared by the inferno's skin and its glow map, same seed per part)
function emberCracks(p, mm, col, w) {
  let s = Math.floor(mm.x0 * 7 + mm.y0 * 13) % 9973 || 1;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  p.clip(mm.reg, (g) => {
    for (let i = 0; i < 26; i++) {
      let u = r(), v = r();
      g.strokeStyle = col; g.lineWidth = w * (0.6 + r());
      g.beginPath(); g.moveTo(mm.x0 + u * mm.w, mm.y0 + v * mm.h);
      for (let k = 0; k < 5; k++) {
        u += (r() - 0.5) * 0.12; v += (r() - 0.5) * 0.18;
        g.lineTo(mm.x0 + u * mm.w, mm.y0 + v * mm.h);
      }
      g.stroke();
    }
  });
}

// The Abomination: a stitched-together giant of bruised flesh in riot armour scraps
SKINS.abomination = function abomination(p, m) {
  const K = bossKit(p);
  const skin = '#76626a', meat = '#8a2a24', pants = '#3a3e2e', boot = '#161412';
  paintSkinHead(p, m, { skin, noHair: true, iris: '#ff3020', browCol: '#2a2020' });
  const h = m.head;
  K.stitches(h, [[0.36, 72], [0.42, 68], [0.4, 64.5], [0.44, 62]]);
  K.stitches(h, [[0.66, 71], [0.6, 67]]);
  p.ell(h, 0.5, 64.0, 0.06, 0.35, '#200808');
  for (let i = 0; i < 7; i++) p.rrect(h, 0.458 + i * 0.012, 0.465 + i * 0.012, 63.8, 64.25, '#a89e80', 0);
  p.noise(REG.head, 0.1);
  K.bare(m.torso, skin, 0.16, 0.1);
  for (let i = 0; i < 8; i++) { const u = p.r(0.1, 0.9), z = p.r(42, 58); p.ell(m.torso, u, z, p.r(0.03, 0.07), p.r(0.8, 1.8), meat); } // exposed muscle
  for (let i = 0; i < 10; i++) { const u = p.r(0, 1), z = p.r(38, 60); K.stitches(m.torso, [[u, z], [u + p.r(-0.08, 0.08), z + p.r(-5, 5)]]); }
  p.band(m.torso, 34.2, 41.2, pants);
  beltAt(p, m.torso, 40.9, '#1e1a16', '#707070');
  p.wrapShade(REG.torso, 0.16);
  for (const [mm, side] of [[m.armR, 'r'], [m.armL, 'l']]) {
    K.bare(mm, skin, 0.15, 0.1);
    K.stitches(mm, [[0, 47], [0.5, 46.5], [1, 47.2]]); // sewn-on forearms
    for (let i = 0; i < 3; i++) p.ell(mm, p.r(0, 1), p.r(36, 58), p.r(0.05, 0.1), p.r(0.6, 1.4), meat);
    void side;
  }
  for (const mm of [m.handR, m.handL]) glove(p, mm, sh(skin, 0.85), { bare: true });
  for (const [mm, side] of [[m.legR, 'r'], [m.legL, 'l']]) { trousers(p, mm, pants, side, { boot, noise: 0.1 }); K.stains(mm, 15, 0, 1, 10, 40); }
  bootFoot(p, m.footR, boot); bootFoot(p, m.footL, boot);
};

// ------------------------------------------------------------------ glow maps (self-lit parts)
const GLOWS = {
  butcher(p, m) { for (const s of [1]) p.ell(m.head, 0.5 + s * EYE_U, EYE_Z, 0.012, 0.18, '#ff3018'); },
  spitter(p, m) {
    for (const s of [-1, 1]) p.ell(m.head, 0.5 + s * EYE_U, EYE_Z, 0.018, 0.25, '#c8f040');
    p.poly(m.head, [[0.47, 63.4], [0.53, 63.4], [0.52, 61.8], [0.5, 61.5], [0.48, 61.9]], '#70c020');
    for (const [u, z, r] of PUSTULES) p.ell(m.torso, u, z, r * 0.013, r * 0.38, '#90ff30');
    for (const mm of [m.armR, m.armL]) for (let i = 0; i < 5; i++) p.ell(mm, p.r(0, 1), p.r(38, 58), 0.04, 0.5, '#60c018');
  },
  banshee(p, m) {
    for (const s of [-1, 1]) { p.ell(m.head, 0.5 + s * EYE_U, EYE_Z, 0.02, 0.26, '#e8f4ff'); p.ell(m.head, 0.5 + s * EYE_U, EYE_Z, 0.035, 0.45, 'rgba(120,160,255,0.35)'); }
  },
  inferno(p, m) {
    for (const mm of [m.head, m.torso, m.armR, m.armL, m.legR, m.legL, m.handR, m.handL]) {
      emberCracks(p, mm, 'rgba(255,120,20,0.55)', 4.5);
      emberCracks(p, mm, '#ffb030', 1.6);
    }
    for (const s of [-1, 1]) p.ell(m.head, 0.5 + s * EYE_U, EYE_Z, 0.025, 0.35, '#fff070');
    p.ell(m.head, 0.5, 64.0, 0.045, 0.35, '#ff8020');
    p.ell(m.torso, 0.5, 50, 0.08, 3.5, 'rgba(255,110,20,0.6)'); // core showing through the chest
  },
  sprinter(p, m) { for (const s of [-1, 1]) { p.ell(m.head, 0.5 + s * EYE_U, EYE_Z, 0.018, 0.24, '#ff2010'); p.ell(m.head, 0.5 + s * EYE_U, EYE_Z, 0.03, 0.4, 'rgba(255,30,10,0.35)'); } },
  hunter(p, m) { for (const s of [-1, 1]) p.ell(m.head, 0.5 + s * EYE_U, EYE_Z, 0.012, 0.16, '#e8ecd0'); },
  abomination(p, m) {
    for (const s of [-1, 1]) p.ell(m.head, 0.5 + s * EYE_U, EYE_Z, 0.02, 0.26, '#ff2010');
    for (const mm of [m.armR, m.armL]) for (let i = 0; i < 8; i++) { const u = p.r(0, 1), z = p.r(36, 58); p.line(mm, [[u, z], [u + p.r(-0.05, 0.05), z + p.r(-3, 3)]], 'rgba(255,40,20,0.45)', 1.2); }
  },
};
/** Default glow strength / tint per boss skin (rgb multiplier for the glow map). */
export const GLOW_TINT = { butcher: [1, 1, 1], spitter: [0.9, 1, 0.8], banshee: [1, 1, 1], inferno: [1.1, 1, 1], abomination: [1, 1, 1], sprinter: [1, 1, 1], hunter: [0.8, 0.8, 0.8] };

const glowCache = new Map();
/** The glow map of a boss skin (black where nothing glows), or null. */
export function getGlowTexture(skin) {
  if (!GLOWS[skin]) return null;
  if (glowCache.has(skin)) return glowCache.get(skin);
  const p = new Painter(99 + skin.length);
  p.fill([0, 0, TEX, TEX], '#000000');
  GLOWS[skin](p, M(p));
  const tex = canvasTexture(p.c);
  tex.name = 'glow_' + skin;
  glowCache.set(skin, tex);
  return tex;
}

function pouchTex(p, m, col) {
  p.fill(REG.pouch, col);
  p.band(m.pouch, 0.62, 1.0, sh(col, 1.15));
  p.line(m.pouch, [[0, 0.62], [1, 0.62]], sh(col, 0.5), 1.5);
  p.noise(REG.pouch, 0.07);
}

const cache = new Map();

/** Returns the (cached) THREE texture for a skin. */
export function getSkinTexture(skin) {
  if (cache.has(skin)) return cache.get(skin);
  const seed = [...skin].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const p = new Painter(seed);
  p.fill([0, 0, TEX, TEX], '#808080');
  SKINS[skin](p, M(p));
  const tex = canvasTexture(p.c);
  tex.name = 'skin_' + skin;
  tex.userData = { canvas: p.c };
  cache.set(skin, tex);
  return tex;
}
