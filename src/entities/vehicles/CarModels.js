// Blocky (Minecraft-entity style) abandoned vehicles with procedurally painted textures.
// createCarVisual({type, color, wrecked, burned, seed}) -> {root, halfExtents, setLight, lights, update, dispose}
// Every car is merged into ≤ 4 meshes: body (opaque), glass (transparent), lamps, siren lights.
import * as THREE from 'three';
import { makeRng, hash32 } from '../../core/rng.js';
import { createEntityMaterial, setEntityLight } from '../../render/materials.js';

export const CAR_TYPES = ['sedan', 'hatchback', 'suv', 'pickup', 'van', 'police', 'ambulance', 'military_truck', 'humvee', 'bus', 'semi', 'firetruck', 'tractor'];

const PALETTE = {
  red: 0x9a2020, maroon: 0x5a1a1e, blue: 0x24457a, navy: 0x1c2640, lightblue: 0x6a8aaa, white: 0xd8d8d2, black: 0x1c1c1e,
  silver: 0xa8acb0, grey: 0x6a6c70, green: 0x2e5a34, darkgreen: 0x1e3a24, beige: 0xc2b08a, brown: 0x5a3a22,
  yellow: 0xc8a830, orange: 0xc06020, teal: 0x2a6a6a, olive: 0x4a5230, tan: 0xa08a60,
};
const CIVIL = ['red', 'maroon', 'blue', 'navy', 'lightblue', 'white', 'white', 'black', 'silver', 'silver', 'grey', 'green', 'beige', 'brown', 'teal'];

const DENSITY = 20; // texels per metre for painted panels
const SW = 16; // swatch size

// ------------------------------------------------------------------ helpers
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function hexToRgb(h) { return [(h >> 16) & 255, (h >> 8) & 255, h & 255]; }
function rgb(c, k = 1) { return `rgb(${clamp(c[0] * k, 0, 255) | 0},${clamp(c[1] * k, 0, 255) | 0},${clamp(c[2] * k, 0, 255) | 0})`; }
function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function parseColor(c, rng) {
  if (typeof c === 'number') return c;
  if (typeof c === 'string') {
    if (c[0] === '#') return parseInt(c.slice(1), 16);
    if (PALETTE[c] !== undefined) return PALETTE[c];
  }
  return PALETTE[rng.pick(CIVIL)];
}

// tiny 3×5 pixel font for liveries
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
  ' ': '000000000000000', '-': '000000111000000', '.': '000000000000010', '&': '010101010101011',
};
function cssToRgb(c) {
  if (Array.isArray(c)) return c;
  if (typeof c === 'number') return hexToRgb(c);
  if (typeof c === 'string' && c[0] === '#') return hexToRgb(parseInt(c.slice(1), 16));
  return [255, 255, 255];
}
function textWidth(text, scale) { return text.length * 4 * scale - scale; }

// ------------------------------------------------------------------ swatches (shared, painted once)
const SWATCH_NAMES = ['tyre', 'tread', 'rim', 'glass', 'glass_broken', 'glass_hole', 'headlight', 'taillight', 'indicator', 'chrome',
  'plastic', 'grille', 'interior', 'seat', 'under', 'rust', 'char', 'light_red', 'light_blue', 'light_white', 'steel', 'canvas',
  'wood', 'plate', 'dash', 'mirror', 'exhaust', 'ladder', 'light_amber', 'seat_burnt', 'headlight_broken', 'black'];
const SWI = Object.fromEntries(SWATCH_NAMES.map((n, i) => [n, i]));
let swatchCanvas = null;
function getSwatchCanvas() {
  if (swatchCanvas) return swatchCanvas;
  const c = document.createElement('canvas');
  c.width = SW * 16; c.height = SW * 2;
  const ctx = c.getContext('2d');
  const rng = makeRng(777);
  const px = (i, fn) => {
    const ox = (i % 16) * SW, oy = Math.floor(i / 16) * SW;
    for (let y = 0; y < SW; y++) for (let x = 0; x < SW; x++) {
      const v = fn(x, y, x - 7.5, y - 7.5);
      if (!v) continue;
      ctx.fillStyle = v.length > 3 ? `rgba(${v[0] | 0},${v[1] | 0},${v[2] | 0},${v[3]})` : rgb(v);
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  };
  const n = (a) => (rng.next() - 0.5) * a;
  px(SWI.tyre, (x, y, cx, cy) => {
    const d = Math.hypot(cx, cy);
    if (d > 8.2) return [20, 20, 22, 0];
    if (d > 5.2) return [28 + n(8), 28 + n(8), 30 + n(8)];
    if (d > 4.6) return [70, 70, 74];
    if (d < 1.2) return [60, 60, 64];
    const spoke = (Math.abs(cx) < 0.8 || Math.abs(cy) < 0.8);
    return spoke ? [150, 150, 156] : [110 + n(10), 112 + n(10), 118 + n(10)];
  });
  px(SWI.tread, (x, y) => ((y % 4 === 0) ? [18, 18, 20] : [34 + n(8), 34 + n(8), 36 + n(8)]));
  px(SWI.rim, (x, y, cx, cy) => {
    const d = Math.hypot(cx, cy);
    if (d > 5.4) return [0, 0, 0, 0];
    if (d < 1.4) return [36, 32, 30];
    return d > 4.4 ? [78 + n(20), 50 + n(14), 34 + n(8)] : [54 + n(20), 42 + n(12), 34 + n(8)];
  });
  px(SWI.glass, (x, y) => {
    const streak = Math.abs((x + y) - 10) < 0.7;
    return streak ? [96, 112, 124, 0.62] : [34 + y * 1.4, 44 + y * 1.4, 56 + y * 1.5, 0.7];
  });
  px(SWI.glass_broken, (x, y, cx, cy) => {
    // bullet hole with radial cracks (crazed safety glass)
    const d = Math.hypot(cx - 2, cy + 1);
    const a = Math.atan2(cy + 1, cx - 2);
    if (d < 1.3) return [0, 0, 0, 0];
    const crack = (Math.abs(Math.sin(a * 3 + 0.4)) < 0.1 && d < 9) || (Math.abs(d - 3.6) < 0.4 && Math.sin(a * 5) > 0);
    if (crack) return [150, 162, 170, 0.8];
    return [38 + y * 1.4, 48 + y * 1.4, 60 + y * 1.5, 0.7];
  });
  px(SWI.glass_hole, (x, y) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15 || (x + y * 3) % 11 === 0 && (x < 3 || y < 3 || x > 12 || y > 12);
    return edge ? [180, 195, 200, 0.85] : [0, 0, 0, 0];
  });
  px(SWI.headlight, (x, y, cx, cy) => (Math.hypot(cx, cy) < 6 ? [235, 235, 220] : [150, 150, 150]));
  px(SWI.headlight_broken, (x, y, cx, cy) => (Math.hypot(cx - 2, cy) < 3 ? [20, 20, 20] : Math.hypot(cx, cy) < 6 ? [120, 120, 112] : [90, 90, 90]));
  px(SWI.taillight, (x, y) => (y < 9 ? [180 + n(20), 20, 20] : [200, 200, 200]));
  px(SWI.indicator, () => [220, 130 + n(20), 20]);
  px(SWI.light_amber, () => [230, 150, 30]);
  px(SWI.chrome, (x, y) => [150 + y * 4 + n(10), 152 + y * 4 + n(10), 158 + y * 4 + n(10)]);
  px(SWI.plastic, () => [30 + n(6), 30 + n(6), 32 + n(6)]);
  px(SWI.black, () => [14 + n(4), 14 + n(4), 16 + n(4)]);
  px(SWI.grille, (x, y) => (y % 3 === 0 || x % 4 === 0 ? [90, 90, 94] : [18, 18, 20]));
  px(SWI.interior, () => [32 + n(8), 30 + n(8), 30 + n(8)]);
  px(SWI.seat, (x, y) => (x % 5 === 0 ? [50, 44, 40] : [76 + n(10), 66 + n(10), 58 + n(10)]));
  px(SWI.seat_burnt, (x, y) => (rng.next() < 0.3 ? [90, 70, 50] : [20 + n(10), 18 + n(8), 16 + n(8)]));
  px(SWI.under, () => [26 + n(8), 24 + n(8), 22 + n(8)]);
  px(SWI.rust, () => (rng.next() < 0.5 ? [100 + n(24), 54 + n(16), 30 + n(10)] : [70 + n(16), 38 + n(10), 24 + n(8)]));
  px(SWI.char, () => (rng.next() < 0.1 ? [72 + n(20), 42 + n(12), 28] : [24 + n(12), 22 + n(10), 22 + n(10)]));
  px(SWI.light_red, (x, y) => (y < 2 || y > 13 ? [90, 10, 10] : [240, 40 + n(20), 30]));
  px(SWI.light_blue, (x, y) => (y < 2 || y > 13 ? [10, 20, 90] : [40, 80 + n(20), 250]));
  px(SWI.light_white, () => [240, 240, 230]);
  px(SWI.steel, (x, y) => (((x + y) % 4 === 0) || ((x - y + 16) % 4 === 0) ? [190, 192, 196] : [150 + n(10), 152 + n(10), 156 + n(10)]));
  px(SWI.canvas, (x, y) => (y % 5 === 0 ? [62, 66, 40] : [84 + n(10), 88 + n(10), 56 + n(8)]));
  px(SWI.wood, (x, y) => (y % 4 === 0 ? [80, 56, 34] : [120 + n(16), 88 + n(12), 54 + n(10)]));
  px(SWI.plate, (x, y) => (y < 3 || y > 12 || x < 1 || x > 14 ? [40, 60, 120] : (y > 5 && y < 10 && x % 3 !== 0 ? [30, 30, 40] : [226, 226, 220])));
  px(SWI.dash, (x, y) => (y < 5 ? [40, 40, 42] : [22 + n(6), 22 + n(6), 24 + n(6)]));
  px(SWI.mirror, (x, y) => (x > 2 && x < 13 && y > 3 && y < 12 ? [140, 160, 170] : [30, 30, 32]));
  px(SWI.exhaust, (x, y) => [70 + n(20) + (y > 12 ? -30 : 0), 66 + n(16), 62 + n(14)]);
  px(SWI.ladder, (x, y) => (x < 3 || x > 12 || y % 5 === 0 ? [200, 202, 206] : [0, 0, 0, 0]));
  swatchCanvas = c;
  return c;
}

// ------------------------------------------------------------------ atlas + painting
class CarAtlas {
  constructor(w, h, cached) {
    this.w = w; this.h = h;
    this.cached = cached; // existing texture → only allocate rects, skip painting
    if (!cached) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = w; this.canvas.height = h;
      this.ctx = this.canvas.getContext('2d');
      this.ctx.drawImage(getSwatchCanvas(), 0, 0);
      this.img = this.ctx.getImageData(0, 0, w, h);
    }
    this.sx = 0; this.sy = SW * 2; this.rowH = 0;
    this.overflow = false;
  }
  alloc(pw, ph) {
    pw = Math.max(1, Math.ceil(pw)); ph = Math.max(1, Math.ceil(ph));
    if (this.sx + pw > this.w) { this.sx = 0; this.sy += this.rowH + 1; this.rowH = 0; }
    if (this.sy + ph > this.h) { this.overflow = true; return [0, SW * 2, Math.min(pw, this.w), Math.min(ph, this.h - SW * 2)]; }
    const r = [this.sx, this.sy, pw, ph];
    this.sx += pw + 1;
    this.rowH = Math.max(this.rowH, ph);
    return r;
  }
  swatch(name) {
    const i = SWI[name] ?? SWI.plastic;
    return [(i % 16) * SW + 0.5, Math.floor(i / 16) * SW + 0.5, SW - 1, SW - 1];
  }
  /** copy a swatch (nearest scaled) into a rect of the buffer */
  fillSwatch(r, name) {
    if (!this.img) return;
    const i = SWI[name] ?? SWI.plastic;
    const sx = (i % 16) * SW, sy = Math.floor(i / 16) * SW, d = this.img.data, W = this.w;
    for (let y = 0; y < r[3]; y++) for (let x = 0; x < r[2]; x++) {
      const a = ((sy + Math.floor(y / r[3] * SW)) * W + sx + Math.floor(x / r[2] * SW)) * 4, b = ((r[1] + y) * W + r[0] + x) * 4;
      d[b] = d[a]; d[b + 1] = d[a + 1]; d[b + 2] = d[a + 2]; d[b + 3] = d[a + 3];
    }
  }
  finish() { if (this.img) this.ctx.putImageData(this.img, 0, 0); }
}

/** Paint context for one car: base colour, wear and decoration hooks. */
class Painter {
  constructor(atlas, rng, base, opts) {
    this.buf = atlas.img ? atlas.img.data : null; this.W = atlas.w; this.H = atlas.h;
    this.ctx = this.buf; // truthy when painting
    this.rng = rng; this.base = hexToRgb(base); this.o = opts;
  }
  px(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const i = (y * this.W + x) * 4, d = this.buf;
    d[i] = clamp(c[0], 0, 255); d[i + 1] = clamp(c[1], 0, 255); d[i + 2] = clamp(c[2], 0, 255); d[i + 3] = 255;
  }
  /** base paint + dirt + rust + scratches on a rect; side faces get dirt near the bottom */
  panel(r, info) {
    const ctx = this.ctx;
    if (!ctx) return;
    const { rng } = this;
    const [x0, y0, w, h] = r;
    const burned = this.o.burned;
    const col = info.color ? hexToRgb(info.color) : this.base;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let c;
        if (burned) {
          // charred paint: soot black, dark rust bleeding from the bottom, grey ash on top surfaces
          const k = rng.next();
          const low = info.side ? clamp((y / Math.max(1, h) - 0.35) / 0.65, 0, 1) : 0;
          c = [24 + rng.next() * 12, 22 + rng.next() * 9, 21 + rng.next() * 8];
          if (k < 0.05 + low * 0.35) c = [74 + rng.next() * 26, 40 + rng.next() * 12, 26 + rng.next() * 8];
          else if (k < 0.12 + low * 0.2) c = [46, 34, 28];
          if (info.top && rng.next() < 0.18) c = [62 + rng.next() * 16, 60 + rng.next() * 14, 58 + rng.next() * 12];
        } else {
          const g = info.top ? 1.06 : 1.0 + (1 - y / Math.max(1, h)) * 0.06;
          const nn = 1 + (rng.next() - 0.5) * 0.06;
          c = [col[0] * g * nn, col[1] * g * nn, col[2] * g * nn];
          // dirt near the bottom of side panels, dust on top
          if (info.side) {
            const t = clamp((y / h - 0.55) / 0.45, 0, 1) * (info.dirtLow ?? 1);
            if (t > 0 && rng.next() < t * 0.9) c = mixc(c, [92, 80, 62], 0.35 + t * 0.4);
          }
          if (info.top && rng.next() < 0.12) c = mixc(c, [150, 140, 120], 0.18);
        }
        this.px(x0 + x, y0 + y, c);
      }
    }
    if (burned) return;
    // rust spots (more on wrecked)
    const rust = this.o.rust * (info.side ? 1.2 : 0.6) * (w * h) / 400;
    for (let k = 0; k < rust; k++) {
      const cx = x0 + rng.next() * w, cy = y0 + (info.side ? h * (0.4 + rng.next() * 0.6) : rng.next() * h);
      const n = 2 + Math.floor(rng.next() * 6);
      for (let j = 0; j < n; j++) {
        const px = Math.floor(cx + (rng.next() - 0.5) * 4), py = Math.floor(cy + (rng.next() - 0.5) * 3);
        if (px >= x0 && py >= y0 && px < x0 + w && py < y0 + h) this.px(px, py, rng.next() < 0.5 ? [120, 62, 30] : [88, 46, 26]);
      }
    }
    // scratches
    if (rng.next() < 0.5 * this.o.wear) {
      const sx = x0 + rng.next() * w, sy = y0 + rng.next() * h, len = 3 + rng.next() * 8;
      const sc = [col[0] * 1.35, col[1] * 1.35, col[2] * 1.35];
      for (let j = 0; j < len; j++) { const px = Math.floor(sx + j), py = Math.floor(sy + j * 0.3); if (px < x0 + w && py < y0 + h) this.px(px, py, sc); }
    }
  }
  rect(r, fx, fy, fw, fh, color) {
    if (!this.buf) return;
    const c = cssToRgb(color);
    const x0 = Math.max(0, Math.round(fx)), y0 = Math.max(0, Math.round(fy));
    const x1 = Math.min(r[2], Math.round(fx) + Math.max(1, Math.round(fw))), y1 = Math.min(r[3], Math.round(fy) + Math.max(1, Math.round(fh)));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.px(r[0] + x, r[1] + y, c);
  }
  text(r, txt, cx, cy, scale, color) {
    if (!this.buf) return;
    const c = cssToRgb(color);
    const w = textWidth(txt, scale);
    let x = Math.round(cx - w / 2);
    const y = Math.round(cy - 2.5 * scale);
    for (const ch of txt.toUpperCase()) {
      const g = FONT[ch] || FONT[' '];
      for (let i = 0; i < 15; i++) if (g[i] === '1') this.rect(r, x + (i % 3) * scale, y + Math.floor(i / 3) * scale, scale, scale, c);
      x += 4 * scale;
    }
  }
}

// ------------------------------------------------------------------ geometry builder
class Geo {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; }
  quad(a, b, c, d, uvr, W, H, flip = false) {
    // a=TL b=TR c=BR d=BL; uvr = [x,y,w,h] in atlas pixels
    const base = this.pos.length / 3;
    const ux = (b[0] - a[0]), uy = (b[1] - a[1]), uz = (b[2] - a[2]);
    const vx = (d[0] - a[0]), vy = (d[1] - a[1]), vz = (d[2] - a[2]);
    let nx = vy * uz - vz * uy, ny = vz * ux - vx * uz, nz = vx * uy - vy * ux;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c, d]) { this.pos.push(p[0], p[1], p[2]); this.nor.push(nx, ny, nz); }
    const u0 = uvr[0] / W, u1 = (uvr[0] + uvr[2]) / W, v0 = 1 - uvr[1] / H, v1 = 1 - (uvr[1] + uvr[3]) / H;
    if (flip) this.uv.push(u1, v0, u0, v0, u0, v1, u1, v1);
    else this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    this.idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
  }
  build() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

class CarBuilder {
  constructor(atlas, painter, rng, opts) {
    this.atlas = atlas; this.painter = painter; this.rng = rng; this.o = opts;
    this.geo = { body: new Geo(), glass: new Geo(), lamp: new Geo(), siren: new Geo() };
    this._m = new THREE.Matrix4(); this._v = new THREE.Vector3();
  }

  /**
   * Box with per-face styles. style: swatch name | 'paint' | {paint: true, deco(r, painter, face, wPx, hPx)} | null (skip face)
   * opts: {group, rot:[rx,ry,rz], pivot:[x,y,z], jitter, color}
   */
  box(x0, y0, z0, x1, y1, z1, styles, opts = {}) {
    const group = opts.group || 'body';
    const g = this.geo[group];
    const W = this.atlas.w, H = this.atlas.h;
    const jit = opts.jitter ?? this.o.dent;
    const m = this._m;
    const hasRot = !!opts.rot;
    if (hasRot) {
      const e = new THREE.Euler(opts.rot[0], opts.rot[1], opts.rot[2]);
      const p = opts.pivot || [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
      m.makeTranslation(p[0], p[1], p[2]).multiply(new THREE.Matrix4().makeRotationFromEuler(e)).multiply(new THREE.Matrix4().makeTranslation(-p[0], -p[1], -p[2]));
    }
    const jcache = new Map();
    const P = (x, y, z) => {
      const key = x + ',' + y + ',' + z;
      if (jcache.has(key)) return jcache.get(key);
      let v = [x, y, z];
      if (jit > 0) v = [x + (this.rng.next() - 0.5) * jit, y + (this.rng.next() - 0.5) * jit * 0.6, z + (this.rng.next() - 0.5) * jit];
      if (hasRot) { this._v.set(v[0], v[1], v[2]).applyMatrix4(m); v = [this._v.x, this._v.y, this._v.z]; }
      jcache.set(key, v);
      return v;
    };
    const corners = {
      px: [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]],
      nx: [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]],
      pz: [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]],
      nz: [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]],
      py: [[x1, y1, z1], [x0, y1, z1], [x0, y1, z0], [x1, y1, z0]],
      ny: [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]],
    };
    const dims = { px: [z1 - z0, y1 - y0], nx: [z1 - z0, y1 - y0], pz: [x1 - x0, y1 - y0], nz: [x1 - x0, y1 - y0], py: [x1 - x0, z1 - z0], ny: [x1 - x0, z1 - z0] };
    const st = typeof styles === 'string' || styles === null || (styles && (styles.paint || styles.swatch)) ? Object.fromEntries(FACES.map((f) => [f, styles])) : styles;
    for (const f of FACES) {
      let s = st[f];
      if (s === undefined) s = st.all !== undefined ? st.all : 'paint';
      if (s === null) continue;
      let uvr;
      if (typeof s === 'string' && s !== 'paint') uvr = this.atlas.swatch(s);
      else {
        const [dw, dh] = dims[f];
        const pw = dw * DENSITY, ph = dh * DENSITY;
        uvr = this.atlas.alloc(pw, ph);
        if (!this.atlas.cached) {
          const info = { side: f === 'px' || f === 'nx' || f === 'pz' || f === 'nz', top: f === 'py', face: f, color: opts.color, dirtLow: opts.dirtLow };
          if (f === 'ny') this.atlas.fillSwatch(uvr, 'under');
          else this.painter.panel(uvr, info);
          if (s && s.deco && !this.o.burned) s.deco(uvr, this.painter, f, uvr[2], uvr[3]);
        }
      }
      const c = corners[f];
      g.quad(P(...c[0]), P(...c[1]), P(...c[2]), P(...c[3]), uvr, W, H);
    }
  }

  /** Octagonal wheel along X at (x, y, z). flat: squashed bottom. rimOnly: burned. */
  wheel(x, y, z, r, w, opts = {}) {
    const g = this.geo.body;
    const W = this.atlas.w, H = this.atlas.h;
    const N = 8;
    const side = this.atlas.swatch(opts.rimOnly ? 'rim' : 'tyre');
    const tread = this.atlas.swatch(opts.rimOnly ? 'rust' : 'tread');
    const rr = opts.rimOnly ? r * 0.66 : r;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i + 0.5) / N * Math.PI * 2 + (opts.spin || 0);
      let py = Math.sin(a) * rr, pz = Math.cos(a) * rr;
      if (opts.flat && py < -rr * 0.55) py = -rr * 0.55 - (py + rr * 0.55) * 0.25;
      if (opts.flat && py < 0) pz *= 1.12;
      pts.push([py, pz]);
    }
    const x0 = x - w / 2, x1 = x + w / 2;
    for (let i = 0; i < N; i++) {
      const [ay, az] = pts[i], [by, bz] = pts[(i + 1) % N];
      // tread quad (outward)
      g.quad([x0, y + by, z + bz], [x1, y + by, z + bz], [x1, y + ay, z + az], [x0, y + ay, z + az], tread, W, H);
    }
    // caps: triangle fans as degenerate quads (centre, p_i, p_i+1, centre)
    for (const [cx, sgn] of [[x1, 1], [x0, -1]]) {
      for (let i = 0; i < N; i++) {
        const [ay, az] = pts[i], [by, bz] = pts[(i + 1) % N];
        const uvc = (py, pz) => [side[0] + side[2] * (0.5 + pz / (2 * rr) * (sgn > 0 ? -1 : 1)), side[1] + side[3] * (0.5 - py / (2 * rr))];
        const base = g.pos.length / 3;
        const ps = sgn > 0 ? [[0, 0], [by, bz], [ay, az]] : [[0, 0], [ay, az], [by, bz]];
        for (const [py, pz] of ps) {
          g.pos.push(cx, y + py, z + pz);
          g.nor.push(sgn, 0, 0);
          const t = uvc(py, pz);
          g.uv.push(t[0] / W, 1 - t[1] / H);
        }
        g.idx.push(base, base + 1, base + 2);
      }
    }
  }
}

// ------------------------------------------------------------------ texture cache
const texCache = new Map();

// ------------------------------------------------------------------ type specs (metres; front = +Z)
const SPECS = {
  sedan: { L: 4.6, W: 1.84, clear: 0.28, belt: 0.86, roof: 1.44, hood: 0.92, deck: 0.95, zA: 0.78, zAr: 0.12, zC: -1.12, zCb: -1.5, wheelR: 0.33, wz: [1.42, -1.4], doors: 4, rear: 'trunk' },
  hatchback: { L: 3.95, W: 1.74, clear: 0.26, belt: 0.84, roof: 1.46, hood: 0.88, deck: 0.9, zA: 0.92, zAr: 0.22, zC: -1.55, zCb: -1.85, wheelR: 0.31, wz: [1.22, -1.28], doors: 4, rear: 'hatch' },
  suv: { L: 4.8, W: 1.96, clear: 0.42, belt: 1.12, roof: 1.84, hood: 1.16, deck: 1.15, zA: 1.1, zAr: 0.45, zC: -2.2, zCb: -2.32, wheelR: 0.4, wz: [1.5, -1.45], doors: 4, rear: 'hatch', spare: true, rack: true },
  pickup: { L: 5.4, W: 1.98, clear: 0.42, belt: 1.12, roof: 1.84, hood: 1.18, deck: 1.1, zA: 1.25, zAr: 0.72, zC: -0.45, zCb: -0.5, wheelR: 0.41, wz: [1.75, -1.65], doors: 4, rear: 'bed' },
  van: { L: 5.2, W: 2.0, clear: 0.36, belt: 1.1, roof: 2.15, hood: 1.08, deck: 1.1, zA: 1.6, zAr: 1.05, zC: -2.5, zCb: -2.55, wheelR: 0.37, wz: [1.7, -1.75], doors: 2, rear: 'box', cargoWindows: false },
  police: { L: 4.9, W: 1.88, clear: 0.28, belt: 0.88, roof: 1.48, hood: 0.94, deck: 0.97, zA: 0.85, zAr: 0.15, zC: -1.2, zCb: -1.6, wheelR: 0.34, wz: [1.5, -1.5], doors: 4, rear: 'trunk', lightbar: 'police', pushbar: true },
  ambulance: { L: 6.4, W: 2.25, clear: 0.42, belt: 1.18, roof: 2.15, hood: 1.18, deck: 1.15, zA: 1.95, zAr: 1.45, zC: 0.95, zCb: 0.9, wheelR: 0.41, wz: [2.1, -1.7], doors: 2, rear: 'ambulance', lightbar: 'ambulance' },
  humvee: { L: 4.7, W: 2.2, clear: 0.45, belt: 1.25, roof: 1.86, hood: 1.24, deck: 1.24, zA: 0.75, zAr: 0.55, zC: -0.95, zCb: -1.0, wheelR: 0.46, wz: [1.6, -1.6], doors: 4, rear: 'humvee', mil: true },
};

const LIVERY = {
  police: { color: 0x141418, door: 0xe8e8e4, text: 'POLICE', textColor: '#101014' },
  ambulance: { color: 0xe6e6e2, stripe: 0xc02020, text: 'AMBULANCE', textColor: '#c02020' },
};

// ------------------------------------------------------------------ main
export function createCarVisual({ type = 'sedan', color, wrecked = false, burned = false, seed = 1 } = {}) {
  if (!CAR_TYPES.includes(type)) type = 'sedan';
  const rng = makeRng(hash32(seed >>> 0, CAR_TYPES.indexOf(type) + 17));
  let base = parseColor(color, rng.fork(1));
  if (type === 'police') base = LIVERY.police.color;
  if (type === 'ambulance') base = LIVERY.ambulance.color;
  if (type === 'military_truck' || type === 'humvee') base = color !== undefined ? parseColor(color, rng) : (rng.chance(0.75) ? 0x4a5230 : 0xa08a60);
  if (type === 'bus') base = 0xd8a020;
  if (type === 'firetruck') base = 0xb01818;
  if (type === 'tractor') base = color !== undefined ? parseColor(color, rng) : (rng.chance(0.6) ? 0x2e7030 : 0xa82020);
  const variant = (seed >>> 0) % 3;
  const big = ['bus', 'semi', 'firetruck', 'military_truck'].includes(type);
  const AW = big ? 512 : 256, AH = big ? 512 : 256;
  const key = `${type}|${base}|${wrecked ? 1 : 0}|${burned ? 1 : 0}|${variant}`;
  const cachedTex = texCache.get(key);
  const atlas = new CarAtlas(AW, AH, cachedTex || null);
  const paintRng = makeRng(hash32(variant, CAR_TYPES.indexOf(type), base & 0xffff));
  const painter = new Painter(atlas, paintRng, base, { burned, rust: burned ? 0 : wrecked ? 2.5 : 0.6 + variant * 0.5, wear: wrecked ? 1 : 0.6 });
  const opts = { burned, wrecked, dent: burned ? 0.035 : wrecked ? 0.03 : 0.008 + variant * 0.004 };
  const B = new CarBuilder(atlas, painter, rng.fork(2), opts);
  // per-car random state (geometry only — never affects atlas allocation)
  const R = rng.fork(3);
  const state = {
    openDoor: !burned && R.chance(wrecked ? 0.45 : 0.28) ? R.int(0, 3) : -1,
    doorAngle: R.range(0.6, 1.2),
    flat: [R.chance(wrecked ? 0.5 : 0.2), R.chance(wrecked ? 0.5 : 0.15), R.chance(wrecked ? 0.4 : 0.15), R.chance(wrecked ? 0.4 : 0.2)],
    broken: [0, 1, 2, 3, 4, 5, 6, 7].map(() => (wrecked ? R.chance(0.6) : R.chance(0.18))),
    crumple: wrecked ? R.range(0.25, 0.55) : 0,
    hoodUp: wrecked && R.chance(0.6),
    trunkOpen: !burned && R.chance(0.15),
    tilt: [wrecked ? R.range(-0.04, 0.04) : 0, wrecked ? R.range(-0.04, 0.05) : 0],
  };
  const info = { halfExtents: { x: 1, y: 0.75, z: 2.3 }, lampY: 0.7, sirenOn: false };
  const build = BUILDERS[type] || buildCar;
  build(B, type, state, info, { burned, wrecked, base, rng: R });

  // texture
  let texture = cachedTex;
  if (!texture) {
    atlas.finish();
    texture = new THREE.CanvasTexture(atlas.canvas);
    texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false; texture.colorSpace = THREE.SRGBColorSpace;
    texture.userData.refs = 0;
    texCache.set(key, texture);
  }
  texture.userData.refs = (texture.userData.refs || 0) + 1;

  // meshes
  const root = new THREE.Group();
  root.name = 'car_' + type;
  const body = new THREE.Group();
  body.rotation.set(state.tilt[0], 0, state.tilt[1]);
  if (burned) body.position.y = -0.1;
  root.add(body);
  const mats = [];
  const meshes = {};
  const mk = (name, mopts) => {
    const g = B.geo[name].build();
    if (!g) return null;
    const mat = createEntityMaterial({ map: texture, ...mopts });
    mats.push(mat);
    const m = new THREE.Mesh(g, mat);
    m.name = 'car_' + name;
    body.add(m);
    meshes[name] = m;
    return m;
  };
  mk('body', { alphaTest: 0.5 });
  mk('glass', { transparent: true, depthWrite: false });
  if (meshes.glass) meshes.glass.renderOrder = 2;
  mk('lamp', {});
  mk('siren', {});

  let sirenOn = false, headOn = false, hazard = false, t = 0;
  const lampMat = meshes.lamp ? meshes.lamp.material : null;
  const sirenMat = meshes.siren ? meshes.siren.material : null;
  const applyLamps = () => {
    if (lampMat) lampMat.uniforms.uEmissive.value = burned ? 0 : (headOn ? 2.5 : 0) + (hazard && Math.sin(t * 6) > 0 ? 2.0 : 0);
    if (sirenMat) sirenMat.uniforms.uEmissive.value = !sirenOn || burned ? 0 : (Math.sin(t * 9) > 0 || Math.sin(t * 23) > 0.6 ? 4 : 0.3);
  };
  return {
    root,
    type,
    halfExtents: info.halfExtents,
    meshes,
    setLight(sky, block) { for (const m of mats) setEntityLight(m, sky, block); },
    lights: {
      setHeadlights(on) { headOn = !!on; applyLamps(); },
      setSiren(on) { sirenOn = !!on; applyLamps(); },
      setHazards(on) { hazard = !!on; applyLamps(); },
    },
    /** animate flashing lights (only needed while siren / hazards are on) */
    update(dt) { t += dt; if (sirenOn || hazard) applyLamps(); },
    dispose() {
      if (root.parent) root.parent.remove(root);
      for (const m of Object.values(meshes)) m.geometry.dispose();
      for (const m of mats) m.dispose();
      texture.userData.refs--;
      if (texture.userData.refs <= 0) { texture.dispose(); texCache.delete(key); }
    },
  };
}

// ------------------------------------------------------------------ deco helpers
function wheelArch(r, p, face, wz, wheelR, S, yTop) {
  // dark semicircle on a side panel where a wheel sits (face px: u runs front→back; nx: back→front)
  const [x0, y0, w, h] = r;
  for (const z of wz) {
    const u = face === 'px' ? (S.z1 - z) * DENSITY : (z - S.z0) * DENSITY;
    const cy = (yTop - (S.wy)) * DENSITY;
    const rad = (wheelR + 0.07) * DENSITY;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      if (Math.hypot(xx - u, yy - cy) < rad) p.rect(r, xx, yy, 1, 1, [18, 16, 15]);
    }
  }
}

// ------------------------------------------------------------------ generic car body (sedan, hatchback, suv, pickup, van, police, ambulance, humvee)
function buildCar(B, type, st, info, o) {
  const S = SPECS[type] || SPECS.sedan;
  const L = S.L, W = S.W, hw = W / 2;
  const zF = L / 2, zB = -L / 2;
  const cl = S.clear;
  const burned = o.burned;
  const glassOf = (i) => (burned ? null : st.broken[i % 8] ? (i % 3 === 0 ? 'glass_hole' : 'glass_broken') : 'glass');
  const lamp = (x0, y0, z0, x1, y1, z1, sw) => B.box(x0, y0, z0, x1, y1, z1, burned ? 'char' : (sw === 'headlight' && st.crumple > 0.35 ? 'headlight_broken' : sw), { group: burned ? 'body' : 'lamp', jitter: 0 });
  const liv = LIVERY[type];
  const wy = S.wheelR; // wheel centre height
  const crum = st.crumple;
  const nose0 = S.zA, nose1 = zF - 0.14 - crum;
  const archDeco = (yTop, z0, z1) => ({ paint: true, deco: (r, p, f) => { if (f === 'px' || f === 'nx') wheelArch(r, p, f, S.wz, S.wheelR, { z0, z1, wy }, yTop); } });

  // --- nose (engine block + hood)
  const noseDeco = {
    paint: true,
    deco: (r, p, f, w, h) => {
      if (f === 'px' || f === 'nx') wheelArch(r, p, f, S.wz, S.wheelR, { z0: nose0, z1: nose1, wy }, S.hood);
      if (f === 'pz') { // grille area
        const gw = w * 0.5;
        p.rect(r, (w - gw) / 2, h * 0.35, gw, h * 0.4, o.burned ? [20, 20, 20] : S.mil ? [40, 44, 30] : [24, 24, 26]);
        for (let k = 0; k < 4; k++) p.rect(r, (w - gw) / 2, h * 0.35 + k * 2, gw, 1, [70, 70, 74]);
      }
      if (f === 'py') { p.rect(r, 0, h * 0.02, w, 1, [0, 0, 0, 0.3].slice(0, 3).map((v) => v + 30)); p.rect(r, w / 2, 0, 1, h, rgbArr(o.base, 0.85)); }
    },
  };
  B.box(-hw, cl, nose0, hw, S.hood, nose1, { all: noseDeco, ny: 'under' }, { rot: crum ? [-crum * 0.5, 0, (o.rng.next() - 0.5) * crum * 0.3] : null, pivot: [0, cl, nose0] });
  // hood lid (always built so cars sharing a texture keep the same atlas layout); popped open on wrecks
  B.box(-hw + 0.04, S.hood, nose0 + 0.04, hw - 0.04, S.hood + 0.03, nose1 - 0.04, { all: 'paint', ny: 'under' }, st.hoodUp ? { rot: [-0.5, 0, 0.05], pivot: [0, S.hood, nose0 + 0.05] } : {});
  // front bumper + lights + plate
  const bumperSw = S.mil ? 'black' : type === 'police' ? 'black' : burned ? 'char' : (o.rng.chance(0.4) ? 'chrome' : 'plastic');
  B.box(-hw + 0.02, cl - 0.04, nose1 - 0.02, hw - 0.02, cl + 0.22, nose1 + 0.12, bumperSw, { rot: crum > 0.3 ? [0.1, 0.12, 0.15] : null });
  lamp(-hw + 0.1, S.hood - 0.22, nose1, -hw + 0.42, S.hood - 0.08, nose1 + 0.03, 'headlight');
  lamp(hw - 0.42, S.hood - 0.22, nose1, hw - 0.1, S.hood - 0.08, nose1 + 0.03, 'headlight');
  lamp(-hw + 0.02, S.hood - 0.22, nose1 - 0.25, -hw - 0.005, S.hood - 0.1, nose1 - 0.05, 'indicator');
  lamp(hw + 0.005, S.hood - 0.22, nose1 - 0.25, hw - 0.02, S.hood - 0.1, nose1 - 0.05, 'indicator');
  if (!S.mil) B.box(-0.22, cl + 0.04, nose1 + 0.12, 0.22, cl + 0.18, nose1 + 0.135, burned ? 'char' : 'plate', { jitter: 0 });
  if (S.pushbar) {
    B.box(-hw * 0.6, cl + 0.05, nose1 + 0.12, hw * 0.6, cl + 0.6, nose1 + 0.2, 'black');
  }

  // --- cabin floor + interior
  const zCab0 = S.zCb, zCab1 = S.zA;
  B.box(-hw, cl, zCab0, hw, cl + 0.14, zCab1, { all: 'under', py: burned ? 'char' : 'interior' });
  B.box(-hw + 0.1, S.belt - 0.12, zCab1 - 0.4, hw - 0.1, S.belt + 0.05, zCab1, { all: burned ? 'char' : 'dash' }); // dashboard
  B.box(hw - 0.62, S.belt - 0.15, zCab1 - 0.5, hw - 0.3, S.belt + 0.12, zCab1 - 0.44, burned ? 'char' : 'black'); // steering wheel (left-hand drive)
  const seat = burned ? 'seat_burnt' : 'seat';
  const zs1 = zCab1 - 1.0;
  for (const sx of [-1, 1]) {
    B.box(sx * hw * 0.5 - 0.27, cl + 0.14, zs1 - 0.25, sx * hw * 0.5 + 0.27, cl + 0.42, zs1 + 0.25, seat);
    B.box(sx * hw * 0.5 - 0.27, cl + 0.42, zs1 - 0.3, sx * hw * 0.5 + 0.27, S.belt + 0.35, zs1 - 0.18, seat, { rot: [-0.12, 0, 0], pivot: [0, cl + 0.42, zs1 - 0.24] });
  }
  const longCab = S.zCb < zs1 - 1.0;
  if (longCab && type !== 'van' && type !== 'ambulance') {
    const zs2 = zs1 - 1.0;
    B.box(-hw + 0.15, cl + 0.14, zs2 - 0.25, hw - 0.15, cl + 0.42, zs2 + 0.22, seat);
    B.box(-hw + 0.15, cl + 0.42, zs2 - 0.3, hw - 0.15, S.belt + 0.3, zs2 - 0.18, seat);
  }

  // --- doors (separate boxes so they can open); door rects allocated always in the same order
  const doorZ = S.doors === 4 ? [[zs1 - 0.45, zCab1 - 0.05], [zCab0 + 0.05, zs1 - 0.45]] : [[zs1 - 0.55, zCab1 - 0.05]];
  if (S.doors === 2 && zCab0 < zs1 - 0.6) doorZ.push([zCab0 + 0.05, zs1 - 0.55]); // fixed side panel behind (van cargo)
  const doorH0 = cl + 0.06, doorH1 = S.belt;
  let di = 0;
  for (const side of [1, -1]) {
    doorZ.forEach(([z0, z1], k) => {
      const fixed = S.doors === 2 && k === 1;
      const x0 = side > 0 ? hw - 0.06 : -hw, x1 = side > 0 ? hw : -hw + 0.06;
      const open = !fixed && st.openDoor === di;
      const deco = {
        paint: true,
        deco: (r, p, f, w, h) => {
          if (f !== 'px' && f !== 'nx') return;
          p.rect(r, 0, 0, 1, h, rgbArr(o.base, 0.55)); p.rect(r, w - 1, 0, 1, h, rgbArr(o.base, 0.55));
          if (!fixed) {
            const hx = f === 'px' ? w - 6 : 3; // handle near the rear edge
            p.rect(r, hx, 3, 3, 1, o.burned ? [40, 30, 20] : [190, 190, 194]);
          }
          if (liv && liv.door && k === 0) p.rect(r, 0, 0, w, h, liv.door);
          if (liv && liv.text && k === 0 && type === 'police') {
            const sc = Math.max(1, Math.floor(Math.min(h / 9, w / (liv.text.length * 4.4))));
            p.text(r, liv.text, w / 2, h * 0.5, sc, liv.textColor);
          }
          if (liv && liv.stripe) p.rect(r, 0, h * 0.25, w, Math.max(2, h * 0.12), liv.stripe);
          if (S.mil && k === 0) { p.text(r, 'US', w / 2, h * 0.45, 2, '#d8d8c8'); }
        },
      };
      const rot = open ? [0, -side * st.doorAngle, 0] : null;
      const pivot = open ? [side > 0 ? hw : -hw, 0, z1] : null;
      B.box(x0, doorH0, z0, x1, doorH1, z1, { all: deco, ny: 'under', nx: side > 0 ? 'interior' : deco, px: side > 0 ? deco : 'interior' }, { rot, pivot });
      // window above the door (moves with the door)
      const g = glassOf(di);
      const cargoBlind = (type === 'van' || type === 'ambulance') && k === 1;
      if (cargoBlind) B.box(x0, doorH1, z0, x1, S.roof - 0.06, z1, 'paint', { rot, pivot });
      else if (g) B.box(side > 0 ? hw - 0.04 : -hw + 0.02, doorH1, z0 + 0.04, side > 0 ? hw - 0.02 : -hw + 0.04, S.roof - 0.08, z1 - 0.04, g, { group: 'glass', jitter: 0, rot, pivot });
      di++;
    });
  }
  // pillars (A at the front, B between doors, C at the rear)
  const pillar = (z0, z1) => { for (const sx of [-1, 1]) B.box(sx > 0 ? hw - 0.07 : -hw, S.belt, z0, sx > 0 ? hw : -hw + 0.07, S.roof - 0.04, z1, 'paint'); };
  if (S.doors === 4) pillar(zs1 - 0.5, zs1 - 0.4);
  // windshield (slanted) + A pillars
  const wsH = S.roof - S.belt, wsD = S.zA - S.zAr;
  const wsAng = Math.atan2(wsD, wsH);
  const wsLen = Math.hypot(wsD, wsH);
  const wsGlass = burned ? null : st.broken[6] ? 'glass_broken' : 'glass';
  if (wsGlass) B.box(-hw + 0.08, S.belt, S.zA - 0.03, hw - 0.08, S.belt + wsLen, S.zA, wsGlass, { group: 'glass', rot: [-wsAng, 0, 0], pivot: [0, S.belt, S.zA], jitter: 0 });
  for (const sx of [-1, 1]) B.box(sx * hw - (sx > 0 ? 0.08 : 0), S.belt, S.zA - 0.06, sx * hw + (sx > 0 ? 0 : 0.08), S.belt + wsLen, S.zA, 'paint', { rot: [-wsAng, 0, 0], pivot: [0, S.belt, S.zA] });
  // roof
  const roofZ0 = S.zC, roofZ1 = S.zAr;
  const roofDeco = { paint: true, deco: (r, p, f, w, h) => { if (type === 'police' && f === 'py') p.rect(r, 0, 0, w, h, LIVERY.police.door); if (type === 'ambulance' && f === 'py') p.rect(r, w * 0.3, h * 0.3, w * 0.4, h * 0.4, [200, 30, 30]); } };
  B.box(-hw + 0.02, S.roof - 0.07, roofZ0, hw - 0.02, S.roof, roofZ1, { all: roofDeco, ny: 'interior' });
  // rear window / C pillar
  const rear = S.rear;
  if (rear === 'trunk' || rear === 'hatch') {
    const rH = S.roof - (rear === 'trunk' ? S.deck : S.belt), rD = S.zC - S.zCb;
    const ang = Math.atan2(rD, rH), len = Math.hypot(rD, rH);
    const y0 = rear === 'trunk' ? S.deck : S.belt;
    const rg = burned ? null : st.broken[7] ? 'glass_broken' : 'glass';
    if (rg) B.box(-hw + 0.1, y0, S.zCb, hw - 0.1, y0 + len, S.zCb + 0.03, rg, { group: 'glass', rot: [ang, 0, 0], pivot: [0, y0, S.zCb], jitter: 0 });
    for (const sx of [-1, 1]) B.box(sx * hw - (sx > 0 ? 0.1 : 0), y0, S.zCb, sx * hw + (sx > 0 ? 0 : 0.1), y0 + len, S.zCb + 0.07, 'paint', { rot: [ang, 0, 0], pivot: [0, y0, S.zCb] });
  }
  // --- rear section
  if (rear === 'trunk') {
    B.box(-hw, cl, zB + 0.12, hw, S.deck, S.zCb, { all: archDeco(S.deck, zB + 0.12, S.zCb), ny: 'under' });
    B.box(-hw + 0.04, S.deck, zB + 0.16, hw - 0.04, S.deck + 0.03, S.zCb - 0.02, { all: 'paint', ny: 'under' }, st.trunkOpen ? { rot: [0.9, 0, 0], pivot: [0, S.deck, S.zCb - 0.02] } : {});
  } else if (rear === 'hatch') {
    B.box(-hw, cl, zB + 0.12, hw, S.belt, S.zCb, { all: archDeco(S.belt, zB + 0.12, S.zCb), ny: 'under' });
  } else if (rear === 'bed') {
    // pickup bed: floor + walls + tailgate
    const bz0 = zB + 0.1, bz1 = S.zCb - 0.08;
    B.box(-hw, cl, bz0, hw, cl + 0.42, bz1, { all: archDeco(cl + 0.42, bz0, bz1), py: 'wood', ny: 'under' });
    for (const sx of [-1, 1]) B.box(sx > 0 ? hw - 0.08 : -hw, cl + 0.42, bz0, sx > 0 ? hw : -hw + 0.08, S.deck + 0.05, bz1, 'paint');
    B.box(-hw, cl + 0.42, bz1, hw, S.deck + 0.05, bz1 + 0.08, 'paint');
    B.box(-hw, cl + 0.3, bz0 - 0.02, hw, S.deck + 0.05, bz0 + 0.06, { all: 'paint', nz: { paint: true, deco: (r, p, f, w, h) => { if (f === 'nz') { p.rect(r, w / 2 - 3, 3, 6, 2, [180, 180, 184]); } } } }, st.trunkOpen ? { rot: [-1.4, 0, 0], pivot: [0, cl + 0.3, bz0 - 0.02] } : {});
    if (!burned && o.rng.chance(0.5)) B.box(-0.3, cl + 0.42, bz0 + 0.3, 0.25, cl + 0.85, bz0 + 0.8, 'wood'); // crate in the bed
  } else if (rear === 'box' || rear === 'ambulance') {
    // tall rear body (van cargo / ambulance box)
    const bz0 = zB + 0.08, bz1 = S.zCb;
    const top = rear === 'ambulance' ? S.roof + 0.45 : S.roof;
    const bw = rear === 'ambulance' ? hw + 0.06 : hw;
    const ambDeco = {
      paint: true,
      deco: (r, p, f, w, h) => {
        if (f === 'px' || f === 'nx') {
          wheelArch(r, p, f, S.wz, S.wheelR, { z0: bz0, z1: bz1, wy }, top);
          if (rear === 'ambulance') {
            p.rect(r, 0, h * 0.62, w, Math.max(3, h * 0.08), LIVERY.ambulance.stripe);
            p.text(r, 'AMBULANCE', w / 2, h * 0.42, Math.max(1, Math.floor(w / 60)), '#c02020');
            // star of life
            const cx = w * 0.18, cy = h * 0.22, s2 = Math.max(3, h * 0.08);
            p.rect(r, cx - s2 / 2, cy - s2 * 1.4, s2, s2 * 2.8, [40, 80, 200]);
            p.rect(r, cx - s2 * 1.4, cy - s2 / 2, s2 * 2.8, s2, [40, 80, 200]);
          } else if (o.rng.chance(0.5)) {
            p.text(r, o.rng.pick(['MILLBROOK', 'PLUMBING', 'BAKERY', 'MOVERS', 'FLOWERS']), w / 2, h * 0.35, 2, '#2a2a30');
          }
        }
        if (f === 'nz') {
          p.rect(r, w / 2, 0, 1, h, [30, 30, 30]);
          p.rect(r, w / 2 - 4, h * 0.45, 3, 2, [180, 180, 184]);
          if (rear === 'ambulance') p.rect(r, 0, h * 0.62, w, Math.max(3, h * 0.08), LIVERY.ambulance.stripe);
        }
      },
    };
    B.box(-bw, cl, bz0, bw, top, bz1, { all: ambDeco, ny: 'under' });
    // rear windows
    const rg = burned ? null : st.broken[7] ? 'glass_broken' : 'glass';
    if (rg) {
      B.box(-bw + 0.12, top - 0.75, bz0 - 0.02, -0.06, top - 0.25, bz0 + 0.01, rg, { group: 'glass', jitter: 0 });
      B.box(0.06, top - 0.75, bz0 - 0.02, bw - 0.12, top - 0.25, bz0 + 0.01, rg, { group: 'glass', jitter: 0 });
    }
    if (rear === 'ambulance') {
      // light bars on the box corners
      for (const sx of [-1, 1]) for (const zz of [bz0 + 0.05, bz1 - 0.1]) B.box(sx * bw - 0.12, top - 0.18, zz, sx * bw + (sx > 0 ? 0.01 : 0.12), top - 0.04, zz + 0.12, sx > 0 ? 'light_red' : 'light_red', { group: 'siren', jitter: 0 });
    }
  } else if (rear === 'humvee') {
    B.box(-hw, cl, zB + 0.1, hw, S.belt, S.zCb, { all: archDeco(S.belt, zB + 0.1, S.zCb), ny: 'under' });
    B.box(-hw + 0.1, S.belt, zB + 0.2, hw - 0.1, S.belt + 0.35, S.zCb, 'canvas');
  }
  // rear bumper + tail lights + plate
  B.box(-hw + 0.02, cl - 0.02, zB, hw - 0.02, cl + 0.22, zB + 0.14, bumperSw);
  const tailY = rear === 'trunk' ? S.deck - 0.18 : rear === 'bed' ? S.deck - 0.2 : S.belt - 0.15;
  for (const sx of [-1, 1]) lamp(sx > 0 ? hw - 0.32 : -hw + 0.06, tailY, zB + (rear === 'bed' ? 0.08 : 0.11), sx > 0 ? hw - 0.06 : -hw + 0.32, tailY + 0.14, zB + (rear === 'bed' ? 0.11 : 0.13), 'taillight');
  if (!S.mil) B.box(-0.22, cl + 0.25, zB - 0.005, 0.22, cl + 0.39, zB + 0.12, { all: 'plastic', nz: burned ? 'char' : 'plate' }, { jitter: 0 });
  // mirrors
  for (const sx of [-1, 1]) B.box(sx > 0 ? hw : -hw - 0.14, S.belt + 0.02, S.zA - 0.25, sx > 0 ? hw + 0.14 : -hw, S.belt + 0.16, S.zA - 0.15, { all: 'paint', pz: 'mirror', nz: 'mirror' });
  // extras
  if (S.spare) B.wheel(0, cl + 0.55 + S.wheelR, zB - 0.12, S.wheelR * 0.95, 0.2, { rimOnly: burned });
  if (S.rack) for (const sx of [-1, 1]) B.box(sx * (hw - 0.15) - 0.03, S.roof, S.zC + 0.2, sx * (hw - 0.15) + 0.03, S.roof + 0.06, S.zAr - 0.2, 'black');
  if (S.lightbar) {
    const lb = S.lightbar;
    const zl = (S.zC + S.zAr) / 2 + (lb === 'ambulance' ? 0.15 : 0);
    B.box(-0.62, S.roof, zl - 0.12, 0.62, S.roof + 0.05, zl + 0.12, 'black');
    B.box(-0.6, S.roof + 0.05, zl - 0.1, -0.03, S.roof + 0.15, zl + 0.1, burned ? 'char' : 'light_red', { group: burned ? 'body' : 'siren', jitter: 0 });
    B.box(0.03, S.roof + 0.05, zl - 0.1, 0.6, S.roof + 0.15, zl + 0.1, burned ? 'char' : lb === 'police' ? 'light_blue' : 'light_red', { group: burned ? 'body' : 'siren', jitter: 0 });
    if (lb === 'police') B.box(hw - 0.05, S.belt + 0.05, S.zA - 0.1, hw + 0.06, S.belt + 0.18, S.zA + 0.05, 'chrome'); // spotlight
  }
  if (S.mil) {
    B.box(-hw + 0.1, S.roof, S.zC + 0.3, hw - 0.1, S.roof + 0.12, S.zAr - 0.1, 'paint');
    B.box(-0.25, cl + 0.05, nose1 + 0.12, 0.25, cl + 0.3, nose1 + 0.22, 'black'); // winch
  }
  // wheels
  const wx = hw - 0.11 + 0.04;
  let wi = 0;
  for (const wz of S.wz) for (const sx of [-1, 1]) {
    B.wheel(sx * wx, wy, wz, S.wheelR, 0.24, { flat: !burned && st.flat[wi], rimOnly: burned, spin: wi * 0.3 });
    wi++;
  }
  // wheel wells (dark boxes so the body above the wheel is not see-through)
  for (const wz of S.wz) B.box(-hw + 0.08, cl, wz - S.wheelR - 0.02, hw - 0.08, cl + 0.12, wz + S.wheelR + 0.02, 'under', { jitter: 0 });
  const H = (S.rear === 'ambulance' ? S.roof + 0.45 : S.roof) + (S.lightbar ? 0.15 : 0);
  info.halfExtents = { x: +(hw + 0.02).toFixed(3), y: +(H / 2).toFixed(3), z: +(L / 2).toFixed(3) };
}

function rgbArr(hex, k) { const c = hexToRgb(hex); return [c[0] * k, c[1] * k, c[2] * k]; }

// ------------------------------------------------------------------ big vehicles
function cab(B, st, o, { x0, x1, y0, y1, z0, z1, belt, glassFront = true, deco = null, doorText = null, broken = 0 }) {
  // boxy cab with windows on the sides + front; doors are painted panels
  const burned = o.burned;
  const g = (i) => (burned ? null : st.broken[i % 8] ? 'glass_broken' : 'glass');
  const cabDeco = {
    paint: true,
    deco: (r, p, f, w, h) => {
      if (f === 'px' || f === 'nx') {
        p.rect(r, w * 0.2, 0, 1, h, rgbArr(o.base, 0.6)); p.rect(r, w * 0.8, 0, 1, h, rgbArr(o.base, 0.6));
        if (doorText) p.text(r, doorText, w / 2, h * 0.65, Math.max(1, Math.floor(w / 40)), '#e8e8e0');
      }
      if (deco) deco(r, p, f, w, h);
    },
  };
  B.box(x0, y0, z0, x1, belt, z1, { all: cabDeco, ny: 'under' });
  // upper frame: pillars + roof, glass panes
  const t = 0.08;
  for (const [a, b] of [[z1 - t, z1], [z0, z0 + t], [(z0 + z1) / 2 - t / 2, (z0 + z1) / 2 + t / 2]]) {
    B.box(x0, belt, a, x0 + t, y1 - t, b, 'paint');
    B.box(x1 - t, belt, a, x1, y1 - t, b, 'paint');
  }
  B.box(x0, y1 - t, z0, x1, y1, z1, { all: 'paint', ny: 'interior' });
  B.box(x0, belt, z0, x1, y1 - t, z0 + 0.06, 'paint'); // back wall
  const gs = [g(broken), g(broken + 1), g(broken + 2), g(broken + 3)];
  const zm = (z0 + z1) / 2;
  if (gs[0]) B.box(x1 - 0.05, belt, zm + 0.04, x1 - 0.03, y1 - t, z1 - t, gs[0], { group: 'glass', jitter: 0 });
  if (gs[1]) B.box(x0 + 0.03, belt, zm + 0.04, x0 + 0.05, y1 - t, z1 - t, gs[1], { group: 'glass', jitter: 0 });
  if (gs[2]) B.box(x1 - 0.05, belt, z0 + t, x1 - 0.03, y1 - t, zm - 0.04, gs[2], { group: 'glass', jitter: 0 });
  if (gs[3]) B.box(x0 + 0.03, belt, z0 + t, x0 + 0.05, y1 - t, zm - 0.04, gs[3], { group: 'glass', jitter: 0 });
  if (glassFront) {
    const gf = burned ? null : st.broken[6] ? 'glass_broken' : 'glass';
    if (gf) B.box(x0 + t, belt, z1 - 0.05, x1 - t, y1 - t, z1 - 0.03, gf, { group: 'glass', jitter: 0 });
    B.box(x0 + t, belt, z1 - t, x1 - t, belt + 0.06, z1, 'paint');
  }
  // seats + dash
  B.box(x0 + 0.15, belt - 0.1, z1 - 0.5, x1 - 0.15, belt + 0.08, z1 - 0.06, burned ? 'char' : 'dash');
  for (const sx of [x0 + (x1 - x0) * 0.28, x0 + (x1 - x0) * 0.72]) {
    B.box(sx - 0.25, y0 + 0.35, zm - 0.3, sx + 0.25, belt - 0.15, zm + 0.2, burned ? 'seat_burnt' : 'seat');
    B.box(sx - 0.25, belt - 0.15, zm - 0.32, sx + 0.25, belt + 0.45, zm - 0.2, burned ? 'seat_burnt' : 'seat');
  }
  B.box(x1 - 0.7, y0 + 0.1, z0 + 0.06, x0 + 0.7, y0 + 0.35, z1 - 0.05, burned ? 'char' : 'interior');
}

function wheelsRow(B, st, o, xs, y, zs, r, w, k0 = 0) {
  let i = k0;
  for (const z of zs) for (const x of xs) { B.wheel(x, y, z, r, w, { flat: !o.burned && st.flat[i % 4], rimOnly: o.burned, spin: i * 0.4 }); i++; }
}

const BUILDERS = {
  bus(B, type, st, info, o) {
    const L = 11, hw = 1.25, cl = 0.5, top = 3.05;
    const zF = L / 2, zB = -L / 2;
    const hoodZ = zF - 1.3;
    // hood
    B.box(-hw * 0.82, cl, hoodZ, hw * 0.82, 1.45, zF - 0.15, { all: { paint: true, deco: (r, p, f, w, h) => { if (f === 'pz') { p.rect(r, w * 0.2, h * 0.3, w * 0.6, h * 0.5, [26, 26, 28]); for (let k = 0; k < 5; k++) p.rect(r, w * 0.2, h * 0.3 + k * 3, w * 0.6, 1, [90, 90, 90]); } } }, ny: 'under' });
    B.box(-hw * 0.84, cl - 0.05, zF - 0.15, hw * 0.84, cl + 0.25, zF, 'black');
    for (const sx of [-1, 1]) B.box(sx > 0 ? hw * 0.82 - 0.3 : -hw * 0.82, 1.0, zF - 0.16, sx > 0 ? hw * 0.82 : -hw * 0.82 + 0.3, 1.2, zF - 0.13, o.burned ? 'char' : 'headlight', { group: o.burned ? 'body' : 'lamp', jitter: 0 });
    // main body: windows painted as dark glass bands
    const winTop = top - 0.35, winBot = 1.75;
    const nWin = 9;
    const bodyDeco = {
      paint: true,
      deco: (r, p, f, w, h) => {
        const black = [22, 22, 22];
        const yWb = (top - winBot) * DENSITY, yWt = (top - winTop) * DENSITY;
        if (f === 'px' || f === 'nx') {
          // black rub rails
          for (const yy of [1.15, 1.45, 0.75]) p.rect(r, 0, (top - yy) * DENSITY, w, 2, black);
          // windows
          for (let k = 0; k < nWin; k++) {
            const u0 = (1.2 + k * 1.02) * DENSITY, u1 = u0 + 0.86 * DENSITY;
            const uu0 = f === 'px' ? w - u1 : u0;
            const broken = o.burned || st.broken[k % 8];
            p.rect(r, uu0, yWt, u1 - u0, yWb - yWt, o.burned ? [14, 12, 10] : broken ? [14, 16, 20] : [40, 50, 62]);
            if (!o.burned && !broken) p.rect(r, uu0 + 2, yWt + 2, 3, yWb - yWt - 4, [90, 104, 118]);
            if (broken && !o.burned) { p.rect(r, uu0 + 4, yWt + 5, 6, 1, [190, 200, 205]); p.rect(r, uu0 + 8, yWt + 3, 1, 8, [190, 200, 205]); }
          }
          // front door (right side = -X)
          if (f === 'nx') p.rect(r, w - 0.95 * DENSITY, yWt, 0.75 * DENSITY, h - yWt - 2, [36, 44, 52]);
          if (f === 'px' || f === 'nx') p.text(r, 'SCHOOL BUS', w / 2, (top - 2.0) * DENSITY + 30, 3, '#141414');
          if (f === 'px' || f === 'nx') wheelArch(r, p, f, [zF - 2.2, zB + 2.3], 0.52, { z0: zB, z1: hoodZ, wy: 0.52 }, top);
        }
        if (f === 'pz') {
          p.rect(r, w * 0.08, yWt, w * 0.84, yWb - yWt + 6, o.burned ? [14, 12, 10] : st.broken[6] ? [16, 18, 22] : [44, 54, 66]);
          p.text(r, 'SCHOOL BUS', w / 2, yWt - 8, 2, '#141414');
        }
        if (f === 'nz') {
          p.rect(r, w * 0.3, yWt, w * 0.4, (h - yWt) * 0.7, [36, 44, 52]);
          p.rect(r, w * 0.1, yWt, w * 0.15, yWb - yWt, [40, 50, 62]); p.rect(r, w * 0.75, yWt, w * 0.15, yWb - yWt, [40, 50, 62]);
          p.text(r, 'STOP', w / 2, yWb + 20, 2, '#141414');
        }
        if (f === 'py') { p.rect(r, 0, 0, w, h, rgbArr(o.base, 0.95)); for (let k = 0; k < 3; k++) p.rect(r, w * 0.1, h * (0.25 + k * 0.25), w * 0.8, 2, [200, 200, 200]); }
      },
    };
    B.box(-hw, cl, zB + 0.15, hw, top, hoodZ, { all: bodyDeco, ny: 'under' });
    B.box(-hw, cl - 0.05, zB, hw, cl + 0.25, zB + 0.15, 'black');
    // warning lights
    for (const sx of [-1, 1]) {
      B.box(sx * 0.9 - 0.12, top - 0.28, hoodZ, sx * 0.9 + 0.12, top - 0.12, hoodZ + 0.04, o.burned ? 'char' : 'light_red', { group: o.burned ? 'body' : 'siren', jitter: 0 });
      B.box(sx * 0.9 - 0.12, top - 0.28, zB + 0.11, sx * 0.9 + 0.12, top - 0.12, zB + 0.15, o.burned ? 'char' : 'light_red', { group: o.burned ? 'body' : 'siren', jitter: 0 });
      B.box(sx * 0.9 - 0.15, 1.0, zB + 0.11, sx * 0.9 + 0.15, 1.2, zB + 0.14, o.burned ? 'char' : 'taillight', { group: o.burned ? 'body' : 'lamp', jitter: 0 });
    }
    // stop sign arm on the left side
    B.box(hw, 1.7, hoodZ - 1.0, hw + 0.04, 2.05, hoodZ - 0.65, o.burned ? 'char' : 'light_red');
    // mirrors
    for (const sx of [-1, 1]) B.box(sx * (hw + 0.05) - 0.06, 1.7, zF - 0.6, sx * (hw + 0.05) + 0.06, 2.1, zF - 0.5, 'black');
    wheelsRow(B, st, o, [-hw + 0.22, hw - 0.22], 0.52, [zF - 2.2, zB + 2.3], 0.52, 0.32);
    info.halfExtents = { x: hw + 0.05, y: top / 2, z: L / 2 };
  },

  semi(B, type, st, info, o) {
    const hw = 1.25, cl = 0.55;
    const zF = 8.0, cabZ0 = 4.2, hoodZ = 6.4;
    // tractor: long hood, cab, sleeper, chassis
    B.box(-hw * 0.72, cl + 0.3, hoodZ, hw * 0.72, 1.75, zF - 0.3, { all: { paint: true, deco: (r, p, f, w, h) => { if (f === 'pz') { p.rect(r, w * 0.15, h * 0.1, w * 0.7, h * 0.75, [170, 172, 176]); for (let k = 0; k < 8; k++) p.rect(r, w * 0.15, h * 0.1 + k * 3, w * 0.7, 1, [60, 60, 64]); } } }, ny: 'under' });
    B.box(-hw, cl - 0.05, zF - 0.3, hw, cl + 0.35, zF, o.burned ? 'char' : 'chrome');
    for (const sx of [-1, 1]) B.box(sx > 0 ? hw * 0.72 - 0.3 : -hw * 0.72, 1.2, zF - 0.32, sx > 0 ? hw * 0.72 : -hw * 0.72 + 0.3, 1.4, zF - 0.28, o.burned ? 'char' : 'headlight', { group: o.burned ? 'body' : 'lamp', jitter: 0 });
    for (const sx of [-1, 1]) B.box(sx > 0 ? hw * 0.72 : -hw, cl + 0.4, hoodZ - 0.1, sx > 0 ? hw : -hw * 0.72, cl + 0.95, zF - 0.6, 'paint'); // fenders
    cab(B, st, o, { x0: -hw, x1: hw, y0: cl + 0.3, y1: 3.1, z0: cabZ0, z1: hoodZ, belt: 1.9 });
    B.box(-hw, cl + 0.3, cabZ0 - 1.3, hw, 3.2, cabZ0, { all: 'paint', ny: 'under' }); // sleeper
    for (const sx of [-1, 1]) {
      B.box(sx * (hw + 0.02) - 0.08, 1.6, cabZ0 - 0.2, sx * (hw + 0.02) + 0.08, 3.9, cabZ0 - 0.04, 'exhaust'); // stacks
      B.box(sx > 0 ? hw - 0.55 : -hw, cl + 0.05, cabZ0 - 0.9, sx > 0 ? hw : -hw + 0.55, cl + 0.6, cabZ0 + 0.6, 'chrome'); // fuel tanks
    }
    B.box(-0.9, cl, 0.5, 0.9, cl + 0.3, cabZ0 - 1.3, 'under'); // chassis
    wheelsRow(B, st, o, [-hw + 0.2, hw - 0.2], 0.52, [zF - 1.4], 0.52, 0.32, 0);
    wheelsRow(B, st, o, [-hw + 0.2, hw - 0.2], 0.52, [cabZ0 - 2.0, cabZ0 - 3.1], 0.52, 0.4, 2);
    // trailer
    const tz0 = -8.0, tz1 = 2.6, ty0 = 1.25, ty1 = 4.0;
    const company = o.rng.pick(['MILLBROOK FREIGHT', 'COUNTY FOODS', 'BLUEGRASS LOGISTICS', 'KENTUCKY MILK', 'TRI STATE']);
    const trailerColor = o.burned ? undefined : o.rng.pick([0xd8d8d4, 0xc8c8c0, 0xb03030, 0x3050a0]);
    B.box(-hw, ty0, tz0, hw, ty1, tz1, {
      all: {
        paint: true,
        deco: (r, p, f, w, h) => {
          if (f === 'px' || f === 'nx') {
            for (let k = 0; k < w; k += 24) p.rect(r, k, 0, 1, h, [150, 150, 150]);
            p.text(r, company, w / 2, h * 0.45, Math.max(2, Math.floor(w / (company.length * 4.5) / 1.4)), '#26304a');
            for (let k = 0; k < 6; k++) { const xx = (k * 37 + 11) % w; p.rect(r, xx, h * 0.6, 1, h * 0.4, [120, 70, 40]); } // rust streaks
          }
          if (f === 'nz') { p.rect(r, w / 2, 0, 1, h, [60, 60, 60]); for (const xx of [w * 0.25, w * 0.75]) p.rect(r, xx, 4, 2, h - 8, [120, 120, 124]); }
        },
      },
      ny: 'under',
    }, { color: trailerColor });
    B.box(-hw, ty0 - 0.15, tz0, hw, ty0, tz1, 'under');
    for (const sx of [-1, 1]) B.box(sx * hw - 0.15, 0.1, -1.5, sx * hw - 0.05, ty0 - 0.15, -1.4, 'steel'); // landing gear
    for (const sx of [-1, 1]) B.box(sx > 0 ? hw - 0.35 : -hw + 0.05, ty0 + 0.1, tz0 - 0.02, sx > 0 ? hw - 0.05 : -hw + 0.35, ty0 + 0.25, tz0, o.burned ? 'char' : 'taillight', { group: o.burned ? 'body' : 'lamp', jitter: 0 });
    wheelsRow(B, st, o, [-hw + 0.2, hw - 0.2], 0.52, [tz0 + 1.3, tz0 + 2.4], 0.52, 0.4, 1);
    info.halfExtents = { x: hw + 0.05, y: 2.0, z: 8.0 };
  },

  firetruck(B, type, st, info, o) {
    const hw = 1.25, cl = 0.5, L = 9.2;
    const zF = L / 2, zB = -L / 2;
    const cabZ0 = zF - 2.6;
    cab(B, st, o, { x0: -hw, x1: hw, y0: cl, y1: 3.0, z0: cabZ0, z1: zF - 0.25, belt: 1.75, doorText: 'FIRE', deco: (r, p, f, w, h) => { if (f === 'px' || f === 'nx' || f === 'pz') p.rect(r, 0, h * 0.75, w, 3, [230, 230, 220]); } });
    B.box(-hw, cl - 0.05, zF - 0.25, hw, cl + 0.4, zF, o.burned ? 'char' : 'chrome');
    for (const sx of [-1, 1]) B.box(sx > 0 ? hw - 0.45 : -hw + 0.1, 1.2, zF - 0.27, sx > 0 ? hw - 0.1 : -hw + 0.45, 1.45, zF - 0.23, o.burned ? 'char' : 'headlight', { group: o.burned ? 'body' : 'lamp', jitter: 0 });
    // body with compartments
    const compDeco = {
      paint: true,
      deco: (r, p, f, w, h) => {
        if (f === 'px' || f === 'nx') {
          const n = 4;
          for (let k = 0; k < n; k++) {
            const u0 = 4 + k * (w - 8) / n, u1 = u0 + (w - 8) / n - 4;
            p.rect(r, u0, 3, u1 - u0, h * 0.62, o.burned ? [30, 28, 26] : [178, 180, 184]);
            for (let y = 6; y < h * 0.62; y += 3) p.rect(r, u0, 3 + y, u1 - u0, 1, [130, 132, 136]);
          }
          p.rect(r, 0, h * 0.72, w, 3, [230, 230, 220]);
          p.text(r, 'MILLBROOK FIRE DEPT', w / 2, h * 0.85, 1, '#e6d080');
          wheelArch(r, p, f, [zF - 1.6, zB + 1.7], 0.5, { z0: zB, z1: cabZ0, wy: 0.5 }, 2.6);
        }
      },
    };
    B.box(-hw, cl, zB + 0.1, hw, 2.6, cabZ0, { all: compDeco, ny: 'under' });
    B.box(-hw, cl - 0.05, zB, hw, cl + 0.3, zB + 0.1, 'steel');
    // ladder on top
    B.box(-0.55, 2.6, zB + 0.3, -0.45, 2.75, zF - 0.4, 'steel');
    B.box(0.45, 2.6, zB + 0.3, 0.55, 2.75, zF - 0.4, 'steel');
    for (let z = zB + 0.6; z < zF - 0.5; z += 0.45) B.box(-0.45, 2.66, z, 0.45, 2.71, z + 0.06, 'steel', { jitter: 0 });
    // hose reel / equipment
    B.box(-hw + 0.2, 2.6, zB + 0.4, -0.7, 2.95, zB + 1.4, 'black');
    // light bar
    B.box(-0.9, 3.0, zF - 1.4, -0.03, 3.16, zF - 1.15, o.burned ? 'char' : 'light_red', { group: o.burned ? 'body' : 'siren', jitter: 0 });
    B.box(0.03, 3.0, zF - 1.4, 0.9, 3.16, zF - 1.15, o.burned ? 'char' : 'light_red', { group: o.burned ? 'body' : 'siren', jitter: 0 });
    for (const sx of [-1, 1]) B.box(sx > 0 ? hw - 0.3 : -hw + 0.05, 1.0, zB - 0.01, sx > 0 ? hw - 0.05 : -hw + 0.3, 1.25, zB + 0.01, o.burned ? 'char' : 'taillight', { group: o.burned ? 'body' : 'lamp', jitter: 0 });
    wheelsRow(B, st, o, [-hw + 0.2, hw - 0.2], 0.5, [zF - 1.6, zB + 1.7, zB + 2.75], 0.5, 0.36);
    info.halfExtents = { x: hw + 0.05, y: 1.6, z: L / 2 };
  },

  military_truck(B, type, st, info, o) {
    const hw = 1.25, cl = 0.65, L = 7.4;
    const zF = L / 2, zB = -L / 2;
    const cabZ0 = zF - 3.0;
    // flat front hood
    B.box(-hw * 0.85, cl + 0.3, zF - 1.4, hw * 0.85, 1.85, zF - 0.2, { all: { paint: true, deco: (r, p, f, w, h) => { if (f === 'pz') { p.rect(r, w * 0.25, h * 0.2, w * 0.5, h * 0.6, [30, 34, 24]); for (let k = 0; k < 6; k++) p.rect(r, w * 0.25 + k * 4, h * 0.2, 1, h * 0.6, [70, 74, 56]); } if (f === 'px' || f === 'nx') p.text(r, 'US ARMY', w / 2, h * 0.5, 1, '#d8d8c8'); } }, ny: 'under' });
    B.box(-hw, cl, zF - 0.25, hw, cl + 0.35, zF, 'black');
    for (const sx of [-1, 1]) B.box(sx > 0 ? hw * 0.85 - 0.25 : -hw * 0.85, 1.4, zF - 0.22, sx > 0 ? hw * 0.85 : -hw * 0.85 + 0.25, 1.6, zF - 0.18, o.burned ? 'char' : 'headlight', { group: o.burned ? 'body' : 'lamp', jitter: 0 });
    for (const sx of [-1, 1]) B.box(sx > 0 ? hw * 0.85 : -hw, cl + 0.6, zF - 1.6, sx > 0 ? hw : -hw * 0.85, cl + 0.75, zF - 0.4, 'paint'); // fenders
    cab(B, st, o, { x0: -hw, x1: hw, y0: cl + 0.3, y1: 3.0, z0: cabZ0, z1: zF - 1.4, belt: 1.95, deco: (r, p, f, w, h) => { if (f === 'px' || f === 'nx') p.text(r, 'US', w / 2, h * 0.6, 2, '#d8d8c8'); } });
    // cargo bed + canvas cover
    const bz0 = zB + 0.1, bz1 = cabZ0 - 0.1;
    B.box(-hw, cl + 0.4, bz0, hw, cl + 1.1, bz1, { all: { paint: true, deco: (r, p, f, w, h) => { if (f === 'px' || f === 'nx') wheelArch(r, p, f, [zB + 1.3, zB + 2.4], 0.55, { z0: bz0, z1: bz1, wy: 0.55 }, cl + 1.1); } }, ny: 'under' });
    const canvasDeco = { paint: true, deco: (r, p, f, w, h) => { for (let k = 0; k < w; k += 20) p.rect(r, k, 0, 2, h, rgbArr(0x4a5230, 0.7)); } };
    if (!o.burned) {
      B.box(-hw + 0.02, cl + 1.1, bz0 + 0.02, hw - 0.02, 3.05, bz1 - 0.02, { all: canvasDeco, ny: 'canvas' }, { color: 0x5a6038 });
      B.box(-hw + 0.25, 3.05, bz0 + 0.02, hw - 0.25, 3.2, bz1 - 0.02, canvasDeco, { color: 0x5a6038 });
    } else {
      for (let z = bz0 + 0.3; z < bz1; z += 1.0) { B.box(-hw + 0.05, cl + 1.1, z, -hw + 0.1, 3.0, z + 0.06, 'char'); B.box(hw - 0.1, cl + 1.1, z, hw - 0.05, 3.0, z + 0.06, 'char'); B.box(-hw + 0.05, 2.95, z, hw - 0.05, 3.0, z + 0.06, 'char'); }
    }
    for (const sx of [-1, 1]) B.box(sx > 0 ? hw - 0.3 : -hw + 0.05, cl + 0.5, zB + 0.08, sx > 0 ? hw - 0.05 : -hw + 0.3, cl + 0.7, zB + 0.1, o.burned ? 'char' : 'taillight', { group: o.burned ? 'body' : 'lamp', jitter: 0 });
    wheelsRow(B, st, o, [-hw + 0.22, hw - 0.22], 0.55, [zF - 1.0, zB + 1.3, zB + 2.4], 0.55, 0.4);
    info.halfExtents = { x: hw + 0.05, y: 1.6, z: L / 2 };
  },

  tractor(B, type, st, info, o) {
    const zF = 1.8, zB = -1.7;
    const yellowRim = o.base === 0x2e7030;
    // engine hood (narrow)
    B.box(-0.42, 0.75, -0.2, 0.42, 1.55, zF - 0.1, { all: { paint: true, deco: (r, p, f, w, h) => { if (f === 'pz') { p.rect(r, 2, 2, w - 4, h - 4, [30, 30, 30]); for (let k = 4; k < h - 4; k += 3) p.rect(r, 2, k, w - 4, 1, [90, 90, 90]); } if (f === 'px' || f === 'nx') { p.rect(r, 0, h * 0.55, w, 2, yellowRim ? [220, 190, 40] : [230, 230, 230]); p.text(r, yellowRim ? 'DEERE' : 'FARMALL', w / 2, h * 0.3, 1, yellowRim ? '#e0c030' : '#f0f0f0'); } } }, ny: 'under' });
    B.box(-0.3, 0.35, -0.3, 0.3, 0.75, zF - 0.3, 'under'); // frame
    B.box(-0.45, 0.4, zF - 0.12, 0.45, 0.6, zF, 'black'); // front weight
    for (const sx of [-1, 1]) B.box(sx > 0 ? 0.42 : -0.5, 1.35, zF - 0.15, sx > 0 ? 0.5 : -0.42, 1.48, zF - 0.05, o.burned ? 'char' : 'headlight', { group: o.burned ? 'body' : 'lamp', jitter: 0 });
    B.box(0.2, 1.55, 0.8, 0.3, 2.35, 0.9, 'exhaust'); // exhaust stack
    // body / seat area
    B.box(-0.55, 0.7, zB + 0.5, 0.55, 1.15, -0.2, { all: 'paint', ny: 'under' });
    B.box(-0.3, 1.15, -1.0, 0.3, 1.3, -0.5, o.burned ? 'seat_burnt' : 'black');
    B.box(-0.3, 1.3, -1.1, 0.3, 1.75, -1.0, o.burned ? 'seat_burnt' : 'black');
    B.box(-0.05, 1.15, -0.25, 0.05, 1.65, -0.15, 'black'); // steering column
    B.box(-0.22, 1.62, -0.35, 0.22, 1.67, -0.05, 'black'); // wheel
    // rear fenders over the big wheels
    for (const sx of [-1, 1]) {
      B.box(sx > 0 ? 0.55 : -1.05, 1.45, zB + 0.15, sx > 0 ? 1.05 : -0.55, 1.55, -0.3, 'paint');
      B.box(sx > 0 ? 0.55 : -0.62, 0.9, zB + 0.15, sx > 0 ? 0.62 : -0.55, 1.45, -0.3, 'paint');
    }
    // ROPS cab frame
    const roofY = 2.65;
    for (const [x, z] of [[-0.62, -1.45], [0.62, -1.45], [-0.62, -0.25], [0.62, -0.25]]) B.box(x - 0.04, 1.15, z - 0.04, x + 0.04, roofY, z + 0.04, 'black');
    B.box(-0.72, roofY, -1.55, 0.72, roofY + 0.08, -0.15, 'paint');
    if (!o.burned && o.rng.chance(0.5)) {
      const g = st.broken[0] ? 'glass_broken' : 'glass';
      B.box(-0.58, 1.3, -0.28, 0.58, roofY - 0.05, -0.26, g, { group: 'glass', jitter: 0 });
    }
    // wheels: big rear, small front
    const rimOnly = o.burned;
    B.wheel(-0.85, 0.8, -1.0, 0.8, 0.42, { rimOnly, flat: !o.burned && st.flat[0] });
    B.wheel(0.85, 0.8, -1.0, 0.8, 0.42, { rimOnly, flat: !o.burned && st.flat[1] });
    B.wheel(-0.6, 0.42, 1.25, 0.42, 0.22, { rimOnly, flat: !o.burned && st.flat[2] });
    B.wheel(0.6, 0.42, 1.25, 0.42, 0.22, { rimOnly, flat: !o.burned && st.flat[3] });
    for (const sx of [-1, 1]) B.box(sx > 0 ? 0.3 : -0.35, 0.95, zB + 0.12, sx > 0 ? 0.35 : -0.3, 1.1, zB + 0.15, o.burned ? 'char' : 'taillight', { group: o.burned ? 'body' : 'lamp', jitter: 0 });
    info.halfExtents = { x: 1.08, y: 1.35, z: 1.8 };
  },
};
