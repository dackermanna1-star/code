// LAST LOOKOUT — title screen art: a low-resolution, ordered-dithered dusk over the dead valley,
// drawn pixel by pixel into an ImageData and shown at an integer scale. The static backdrop (sky,
// sun, hills, farm, tower) is rendered once per size; each frame adds the moving parts: clouds,
// the windmill, the searchlight sweep, shamblers on the ridge, crows, embers and the grass.
// Also the embossed pixel logo. Browser only; nothing runs at import time.

import { forEachTextPixel, GLYPH_ADVANCE } from './pixelFont.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

/** '#rrggbb' -> 0xAABBGGRR (ImageData on little-endian machines). */
function c32(hex, a = 255) {
  const v = parseInt(hex.slice(1), 16);
  return ((a << 24) | ((v & 255) << 16) | (((v >> 8) & 255) << 8) | ((v >> 16) & 255)) >>> 0;
}
const ramp = (list) => list.map((h) => c32(h));

const SKY = ramp(['#0e0a1e', '#1a1030', '#2b1640', '#45204c', '#68284e', '#93344a', '#bf4a3c', '#df6d36', '#f29a45', '#fdc66a', '#ffe39a']);
const COL = {
  far: c32('#3c2546'), farRim: c32('#5e3450'),
  mid: c32('#261830'), midRim: c32('#40223c'),
  near: c32('#150d19'), nearRim: c32('#2a1828'), road: c32('#24171f'),
  sil: c32('#08050b'), sil2: c32('#0f0a12'),
  sun: c32('#fff1b8'), sun2: c32('#ffd27a'),
  glass: c32('#f7b65a'), glass2: c32('#c8643a'), lamp: c32('#ffdc8a'),
  ember: c32('#ffcf6a'), ember2: c32('#9fdc5a'), eye: c32('#ff4020'),
  cloud: c32('#2e1c3a'), cloudMid: c32('#4a2644'), cloudLit: c32('#b0504e'), cloudHot: c32('#e8845a'),
  spot: c32('#5a4a3a'), spot2: c32('#3a2e2c'),
  beam: c32('#fff0b0'),
};

function hash(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Smooth 1-D value noise. */
function vnoise(x, seed) {
  const i = Math.floor(x), f = x - i;
  const a = hash(i * 374761 + seed), b = hash((i + 1) * 374761 + seed);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

export class TitleArt {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = 0;
    this.H = 0;
    this.scale = 4;
    this.t = 0;
    this.acc = 0;
    this.running = false;
    this._raf = 0;
    this._last = 0;
    this._loop = this._loop.bind(this);
    this.walkers = [];
    this.crows = [];
  }

  /** Fits the art to a w×h CSS viewport (integer pixel scale), re-rendering the backdrop. */
  resize(w, h) {
    const scale = Math.max(2, Math.round(h / 190));
    const W = Math.ceil(w / scale), H = Math.ceil(h / scale);
    if (W === this.W && H === this.H && scale === this.scale) return;
    this.W = W;
    this.H = H;
    this.scale = scale;
    this.cv.width = W;
    this.cv.height = H;
    this.cv.style.width = `${W * scale}px`;
    this.cv.style.height = `${H * scale}px`;
    this.img = this.ctx.createImageData(W, H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.base = new Uint32Array(W * H);
    this.layer = new Uint8Array(W * H);
    this._backdrop();
    this._spawn();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = 0;
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  _loop(now) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._loop);
    const dt = this._last ? Math.min(0.1, (now - this._last) / 1000) : 0;
    this._last = now;
    this.acc += dt;
    if (this.acc < 1 / 30) return; // 30 fps is plenty for this
    this.render(this.acc);
    this.acc = 0;
  }

  // -------------------------------------------------------------------------------------------

  _backdrop() {
    const { W, H, base, layer } = this;
    const hy = Math.round(H * 0.64); // horizon
    this.hy = hy;
    this.sun = { x: W * 0.5, y: hy - H * 0.105, r: H * 0.075 };
    const sun = this.sun;
    // sky
    for (let y = 0; y < H; y++) {
      const ty = Math.min(1, y / hy);
      const g = Math.pow(ty, 1.7);
      for (let x = 0; x < W; x++) {
        const dx = (x - sun.x) / W, dy = (y - sun.y) / H;
        const glow = Math.exp(-(dx * dx * 9 + dy * dy * 22)) * 0.22;
        let v = Math.min(1, g + glow) * (SKY.length - 1);
        let i = Math.floor(v);
        if (v - i > bay(x, y)) i++;
        base[y * W + x] = SKY[Math.min(SKY.length - 1, i)];
      }
    }
    // sun disc with haze bands across its lower half
    for (let y = Math.floor(sun.y - sun.r); y <= sun.y + sun.r; y++) {
      for (let x = Math.floor(sun.x - sun.r); x <= sun.x + sun.r; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const d = Math.hypot(x + 0.5 - sun.x, y + 0.5 - sun.y) / sun.r;
        if (d > 1) continue;
        const band = y > sun.y && ((y - Math.floor(sun.y)) % 4 === 0 || (y > sun.y + sun.r * 0.5 && (y - Math.floor(sun.y)) % 3 === 0));
        if (band) continue;
        base[y * W + x] = d < 0.7 || d < 0.9 - 0.2 * bay(x, y) ? COL.sun : COL.sun2;
      }
    }
    // far hills (haze), mid hills with a tree line, near ground
    const far = (x) => hy - H * (0.05 + 0.05 * vnoise(x / (W * 0.18), 11) + 0.02 * vnoise(x / (W * 0.05), 12));
    const mid = (x) => hy - H * (0.005 + 0.03 * vnoise(x / (W * 0.13), 21)) - (vnoise(x / 2.3, 22) > 0.62 ? 2 : 0) - (vnoise(x / 1.4, 23) > 0.8 ? 1 : 0);
    const near = (x) => hy + H * (0.03 + 0.03 * vnoise(x / (W * 0.25), 31)) - (x < W * 0.55 ? H * 0.02 * Math.sin((x / W) * 6) : 0);
    this.ridge = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const f = far(x), m = mid(x), n = near(x);
      this.ridge[x] = n;
      for (let y = Math.max(0, Math.floor(f)); y < H; y++) {
        const i = y * W + x;
        if (y >= n) {
          base[i] = y < n + 1 ? COL.nearRim : COL.near;
          layer[i] = 3;
        } else if (y >= m) {
          base[i] = y < m + 1 ? COL.midRim : COL.mid;
          layer[i] = 2;
        } else {
          base[i] = y < f + 1 && bay(x, y) > 0.3 ? COL.farRim : COL.far;
          layer[i] = 1;
        }
      }
    }
    // a dirt road winding to the compound
    const tx = Math.round(W * 0.72);
    this.towerX = tx;
    for (let y = Math.floor(hy + H * 0.06); y < H; y++) {
      const k = (y - hy) / (H - hy);
      const cx = tx - 10 + (1 - k) * 0 - Math.sin(k * 3.2) * W * 0.12 * k;
      const half = 1 + k * 7;
      for (let x = Math.floor(cx - half); x <= cx + half; x++) {
        if (x >= 0 && x < W && y >= this.ridge[x] + 1 && bay(x, y) < 0.85) base[y * W + x] = COL.road;
      }
    }
    const put = (x, y, c, l = 4) => {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      base[y * W + x] = c;
      layer[y * W + x] = l;
    };
    const rect = (x, y, w, h, c, l) => {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c, l);
    };
    const line = (x0, y0, x1, y1, c, l) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let k = 0; k <= n; k++) put(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, c, l);
    };
    this.put = put;
    // farm on the mid hills: barn with a gambrel roof, a silo, the windmill's lattice tower
    const bx = Math.round(W * 0.4), by = Math.round(mid(W * 0.4) + 1);
    rect(bx, by - 9, 14, 9, COL.sil2, 2);
    for (let i = 0; i < 4; i++) rect(bx - 1 + i, by - 10 - i, 16 - 2 * i, 1, COL.sil2, 2);
    rect(bx + 4, by - 15, 6, 2, COL.sil2, 2);
    rect(bx + 5, by - 5, 3, 5, COL.mid, 2);
    rect(bx + 17, by - 16, 5, 16, COL.sil2, 2);
    rect(bx + 18, by - 17, 3, 1, COL.sil2, 2);
    const wx = Math.round(W * 0.9), wy = Math.round(mid(W * 0.9) + 1);
    this.mill = { x: wx, y: wy - 22 };
    line(wx - 4, wy, wx - 1, wy - 21, COL.sil2, 2);
    line(wx + 4, wy, wx + 1, wy - 21, COL.sil2, 2);
    for (let k = 0; k < 4; k++) line(wx - 3 + k * 0.6, wy - 4 - k * 5, wx + 3 - k * 0.6, wy - 4 - k * 5 - 4, COL.sil2, 2);
    rect(wx - 1, wy - 23, 3, 3, COL.sil2, 2);
    rect(wx + 2, wy - 22, 6, 1, COL.sil2, 2);
    rect(wx + 7, wy - 24, 2, 4, COL.sil2, 2);
    // dead trees on the near ground, left
    const tree = (x0, y0, hgt, seed) => {
      const branch = (x, y, ang, len, depth) => {
        const x1 = x + Math.cos(ang) * len, y1 = y - Math.sin(ang) * len;
        line(x, y, x1, y1, COL.sil, 3);
        if (depth <= 0) return;
        const s = hash(seed + depth * 7 + Math.round(x * 13));
        branch(x1, y1, ang + 0.45 + s * 0.3, len * 0.68, depth - 1);
        branch(x1, y1, ang - 0.5 - s * 0.25, len * 0.62, depth - 1);
      };
      rect(x0, y0 - hgt * 0.4, 2, hgt * 0.4, COL.sil, 3);
      branch(x0 + 1, y0 - hgt * 0.4, Math.PI / 2 + 0.05, hgt * 0.35, 4);
    };
    tree(Math.round(W * 0.95), Math.round(this.ridge[Math.round(W * 0.95)] + 6), H * 0.4, 5);
    tree(Math.round(W * 0.58), Math.round(this.ridge[Math.round(W * 0.58)] + 2), H * 0.2, 9);
    // a wrecked car by the road and a leaning sign post
    const carX = Math.round(W * 0.47), carY = Math.round(this.ridge[carX] + H * 0.12);
    rect(carX, carY - 3, 13, 3, COL.sil, 3);
    rect(carX + 3, carY - 6, 6, 3, COL.sil, 3);
    rect(carX + 4, carY - 5, 2, 1, COL.road, 3);
    rect(carX + 1, carY, 2, 1, COL.sil, 3);
    rect(carX + 10, carY, 2, 1, COL.sil, 3);
    line(carX - 9, carY + 1, carX - 7, carY - 9, COL.sil, 3);
    rect(carX - 10, carY - 11, 6, 3, COL.sil, 3);
    // the fire lookout: four splayed legs (two visible), X bracing, stairs, cabin, roof
    const ty = Math.round(H * 0.9), top = Math.round(H * 0.25);
    this.tower = { x: tx, base: ty, top };
    const half0 = Math.round(H * 0.11), half1 = Math.round(H * 0.045);
    const legX = (side, y) => tx + side * (half1 + ((half0 - half1) * (y - top)) / (ty - top));
    for (const side of [-1, 1]) {
      line(legX(side, top), top, legX(side, ty), ty, COL.sil, 5);
      line(legX(side, top) - side, top, legX(side, ty) - side, ty, COL.sil, 5);
    }
    const levels = 5;
    for (let k = 0; k < levels; k++) {
      const y0 = top + ((ty - top) * k) / levels, y1 = top + ((ty - top) * (k + 1)) / levels;
      line(legX(-1, y0), y0, legX(1, y1), y1, COL.sil, 5);
      line(legX(1, y0), y0, legX(-1, y1), y1, COL.sil, 5);
      line(legX(-1, y1), y1, legX(1, y1), y1, COL.sil, 5);
    }
    // cabin with a catwalk, windows (sunset in the glass), a pyramid roof and a mast
    const cw = Math.round(H * 0.075), ch = Math.round(H * 0.055);
    const cy = top - ch;
    rect(tx - cw - 3, top - 1, (cw + 3) * 2 + 1, 2, COL.sil, 5);
    for (let x = tx - cw - 3; x <= tx + cw + 3; x += 3) rect(x, top - 4, 1, 3, COL.sil, 5);
    rect(tx - cw - 3, top - 5, (cw + 3) * 2 + 1, 1, COL.sil, 5);
    rect(tx - cw, cy, cw * 2 + 1, ch, COL.sil, 5);
    this.window = { x: tx - cw + 2, y: cy + 2, w: cw * 2 - 3, h: Math.max(2, Math.round(ch * 0.45)) };
    const wn = this.window;
    for (let j = 0; j < wn.h; j++) {
      for (let i = 0; i < wn.w; i++) {
        if (i % 6 === 5) continue;
        put(wn.x + i, wn.y + j, j < wn.h * 0.5 || bay(i, j) > 0.6 ? COL.glass : COL.glass2, 5);
      }
    }
    for (let k = 0; k <= cw + 3; k++) rect(tx - cw - 3 + k, cy - Math.round(k * 0.45) - 1, (cw + 3 - k) * 2 + 1, 1, COL.sil, 5);
    const roofTop = cy - Math.round((cw + 3) * 0.45) - 1;
    rect(tx, roofTop - 7, 1, 7, COL.sil, 5);
    this.lampPos = { x: tx + cw - 4, y: wn.y + 1 };
    // compound fence at the foot of the tower
    const fy = ty + 1;
    for (let x = tx - 34; x <= tx + 34; x++) {
      if (x % 5 === 0) rect(x, fy - 6, 1, 7, COL.sil, 4);
      if (Math.abs(x - tx) > 3) {
        put(x, fy - 5, COL.sil, 4);
        put(x, fy - 2, COL.sil, 4);
      }
    }
    rect(tx - 3, fy - 6, 1, 7, COL.sil, 4);
    rect(tx + 3, fy - 6, 1, 7, COL.sil, 4);
    // ground under the tower darker
    for (let y = fy + 1; y < H; y++) for (let x = tx - 40; x <= tx + 40; x++) if (x >= 0 && x < W && bay(x, y) < 0.35) base[y * W + x] = COL.sil2;
  }

  _spawn() {
    const { W } = this;
    this.walkers = [];
    for (let i = 0; i < 9; i++) {
      this.walkers.push({ x: hash(i + 3) * W * 0.62, v: 1.1 + hash(i + 40) * 1.4, ph: hash(i + 70) * 6, kind: hash(i + 90) < 0.2 ? 1 : 0 });
    }
    this.crows = [];
    for (let i = 0; i < 5; i++) this.crows.push({ x: -20 - i * 9 - hash(i) * 10, y: this.H * (0.2 + hash(i + 9) * 0.08), ph: hash(i + 2) * 6 });
    this.embers = [];
    for (let i = 0; i < 18; i++) this.embers.push({ x: hash(i + 200) * W, y: this.H * (0.72 + hash(i + 300) * 0.25), ph: hash(i + 400) * 6.28 });
  }

  render(dt = 1 / 30) {
    if (!this.buf) return;
    this.t += dt;
    const { W, H, buf, base, layer } = this;
    const t = this.t;
    buf.set(base);
    const sky = (x, y) => x >= 0 && y >= 0 && x < W && y < H && layer[y * W + x] === 0;
    const px = (x, y, c, maxLayer = 9) => {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H || layer[y * W + x] > maxLayer) return;
      buf[y * W + x] = c;
    };
    // clouds: long dithered streaks drifting right, lit from below
    for (let k = 0; k < 5; k++) {
      const cy = Math.round(H * (0.12 + k * 0.075));
      const len = W * (0.3 + 0.25 * hash(k + 1));
      const span = W + len;
      const cx = ((((t * (0.8 + k * 0.35) + hash(k + 5) * span) % span) + span) % span) - len * 0.5;
      const thick = 2 + (k % 3);
      for (let x = Math.floor(cx - len / 2); x < cx + len / 2; x++) {
        if (x < 0 || x >= W) continue;
        const u = (x - (cx - len / 2)) / len;
        const prof = Math.sin(Math.PI * u) ** 0.6 * (0.55 + 0.45 * vnoise((x - cx) / 7, k * 31));
        const top = Math.round(thick * 1.4 * prof * (0.6 + 0.6 * vnoise((x - cx) / 4, k * 7)));
        const bot = Math.round(thick * 0.6 * prof + 0.5);
        for (let j = -top; j <= bot; j++) {
          const y = cy + j;
          if (!sky(x, y)) continue;
          const edge = j === -top || j === bot;
          if (edge && bay(x, y) > 0.5) continue;
          const lit = j >= bot - 1 && bot > 0;
          buf[y * W + x] = lit ? (k >= 3 ? COL.cloudHot : COL.cloudLit) : k >= 3 ? COL.cloudMid : COL.cloud;
        }
      }
    }
    // crows crossing the sky
    for (const c of this.crows) {
      c.x += dt * 9;
      if (c.x > W + 20) {
        c.x = -40 - hash(c.y + t) * 120;
        c.y = H * (0.15 + hash(t + c.ph) * 0.12);
      }
      const flap = Math.sin(t * 9 + c.ph) > 0;
      const y = c.y + Math.sin(t * 1.3 + c.ph) * 2;
      px(c.x, y, COL.sil, 1);
      px(c.x - 1, y + (flap ? -1 : 0), COL.sil, 1);
      px(c.x + 1, y + (flap ? -1 : 0), COL.sil, 1);
      px(c.x - 2, y + (flap ? -1 : 1), COL.sil, 1);
      px(c.x + 2, y + (flap ? -1 : 1), COL.sil, 1);
    }
    // windmill blades turning slowly
    const m = this.mill;
    for (let b = 0; b < 6; b++) {
      const a = t * 0.5 + (b * Math.PI) / 3;
      for (let r = 2; r <= 9; r++) {
        px(m.x + 0.5 + Math.cos(a) * r, m.y + 0.5 + Math.sin(a) * r, COL.sil2, 2);
        if (r > 4) px(m.x + 0.5 + Math.cos(a + 0.12) * r, m.y + 0.5 + Math.sin(a + 0.12) * r, COL.sil2, 2);
      }
    }
    // shamblers on the near ridge, silhouetted against the last light
    for (const z of this.walkers) {
      z.x += dt * z.v * (z.x < this.towerX - 40 ? 1 : 0);
      if (z.x >= this.towerX - 40) z.x = -4 - hash(z.ph + t) * 30;
      const gx = Math.round(z.x);
      if (gx < 1 || gx >= W - 1) continue;
      const gy = Math.round(this.ridge[gx]);
      const step = Math.floor(t * z.v * 2.2 + z.ph) % 2;
      const bob = step;
      const h = z.kind ? 7 : 6;
      // legs, body leaning forward, arms out
      px(gx - (step ? 1 : 0), gy - 1, COL.sil);
      px(gx + (step ? 0 : 1), gy - 1, COL.sil);
      for (let j = 2; j < h; j++) px(gx + (j > h - 3 ? 1 : 0), gy - j - (j > 2 ? 0 : 0) + (bob && j > 2 ? 1 : 0) - 0, COL.sil);
      px(gx + 1, gy - h + 1 + bob, COL.sil);
      px(gx + 2, gy - h + 2 + bob, COL.sil);
      px(gx + 2, gy - h + 3 + bob, COL.sil);
      if (hash(Math.floor(t * 2) + z.ph * 100) > 0.97) px(gx + 1, gy - h + 1 + bob, COL.eye);
    }
    // searchlight from the cabin sweeping a lit spot across the field
    const T = this.tower;
    const sx = T.x - 5, sy = T.top - 6;
    const gx = W * (0.5 + 0.1 * Math.sin(t * 0.27)), gyy = H * (0.77 + 0.03 * Math.sin(t * 0.19 + 1));
    const ddx = gx - sx, ddy = gyy - sy;
    const dist0 = Math.hypot(ddx, ddy);
    const ux = ddx / dist0, uy = ddy / dist0;
    const spread = 0.1;
    const x0 = Math.max(0, Math.floor(Math.min(sx, gx) - dist0 * spread * 1.6)), x1 = Math.min(W - 1, Math.ceil(Math.max(sx, gx) + 4));
    for (let y = Math.max(0, Math.floor(sy)); y < Math.min(H, gyy + dist0 * spread * 1.4); y++) {
      for (let x = x0; x <= x1; x++) {
        const px2 = x - sx, py2 = y - sy;
        const along = px2 * ux + py2 * uy;
        if (along <= 2 || along > dist0 * 1.02) continue;
        const across = Math.abs(px2 * uy - py2 * ux) / along;
        if (across > spread) continue;
        const i = y * W + x;
        if (layer[i] >= 4) continue; // the tower and the fence stand in front of the beam
        const inten = (1 - across / spread) ** 1.5 * (0.3 + 0.5 * (1 - along / dist0));
        if (inten > bay(x, y) * 1.1 && (x + y) % 2 === 0) {
          const dark = layer[i] >= 2;
          buf[i] = inten > 0.42 ? (dark ? COL.cloudLit : COL.beam) : dark ? COL.spot : COL.cloudHot;
        }
      }
    }
    // the lit patch where the beam lands
    const rx = dist0 * spread * 1.5, ry = rx * 0.32;
    for (let y = Math.floor(gyy - ry); y <= gyy + ry; y++) {
      for (let x = Math.floor(gx - rx); x <= gx + rx; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const d = ((x - gx) / rx) ** 2 + ((y - gyy) / ry) ** 2;
        if (d > 1) continue;
        const i = y * W + x;
        if (layer[i] < 3) continue;
        const v = 1 - d;
        if (v > bay(x, y) * 0.9) buf[i] = v > 0.55 ? COL.spot : COL.spot2;
      }
    }
    // lamp in the cabin window, flickering
    const lp = this.lampPos;
    const fl = 0.7 + 0.3 * Math.sin(t * 13) * Math.sin(t * 7.3);
    px(lp.x, lp.y, fl > 0.55 ? COL.lamp : COL.glass);
    px(lp.x + 1, lp.y, COL.glass);
    px(lp.x, lp.y + 1, COL.glass);
    // embers / fireflies over the field
    for (const e of this.embers) {
      const on = Math.sin(t * 2.1 + e.ph * 3) > 0.55;
      if (!on) continue;
      px(e.x + Math.sin(t * 0.7 + e.ph) * 3, e.y + Math.sin(t * 0.5 + e.ph * 2) * 2, e.ph > 3 ? COL.ember : COL.ember2);
    }
    // tall grass in the foreground, swaying
    for (let x = 0; x < W; x += 2) {
      const hgt = 2 + Math.floor(vnoise(x / 4, 77) * 9);
      const sway = Math.sin(t * 1.4 + x * 0.09) * 1.4;
      for (let j = 0; j < hgt; j++) px(x + (sway * j) / hgt, H - 1 - j, COL.sil);
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}

// ---------------------------------------------------------------------------------------------
// Logo

/**
 * Draws `text` as an embossed, weathered amber plate into a new canvas: each font pixel becomes
 * `k`×`k` logo pixels; dark outline, a stepped extrusion, a dithered vertical gradient on the
 * face, lit top edges, shaded bottom edges and some wear. Show it at an integer CSS scale.
 */
export function drawLogo(text = 'LAST LOOKOUT', k = 4) {
  const cols = [...text].length * GLYPH_ADVANCE - 1, rows = 7;
  const fw = cols, fh = rows;
  const font = new Uint8Array(fw * fh);
  forEachTextPixel(text, (x, y) => {
    if (x < fw && y < fh) font[y * fw + x] = 1;
  });
  const fat = (x, y) => x >= 0 && y >= 0 && x < fw && y < fh && font[y * fw + x] === 1;
  const ext = 5, pad = 4;
  const W = fw * k + pad * 2 + ext, H = fh * k + pad * 2 + ext;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const buf = new Uint32Array(img.data.buffer);
  const face = new Uint8Array(W * H);
  for (let y = 0; y < fh * k; y++) {
    for (let x = 0; x < fw * k; x++) if (fat(Math.floor(x / k), Math.floor(y / k))) face[(y + pad) * W + x + pad] = 1;
  }
  const isFace = (x, y) => x >= 0 && y >= 0 && x < W && y < H && face[y * W + x] === 1;
  const SH = c32('#000000', 110), EXT = [c32('#6a3a10'), c32('#552e0c'), c32('#42230a'), c32('#341b08'), c32('#271406')];
  const OUT = c32('#120a04');
  const FACE = ramp(['#fff3c0', '#ffdd84', '#ffc24e', '#f5a23a', '#e07f2a', '#c45f1e', '#9c4416']);
  const HI = c32('#fffbe8'), LO = c32('#7a3410'), WEAR = c32('#8a4c1a');
  // soft dithered drop shadow
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) if (isFace(x - ext - 3, y - ext - 3) && (x + y) % 2 === 0) buf[y * W + x] = SH;
  }
  // stepped extrusion down-right
  for (let d = ext; d >= 1; d--) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isFace(x - d, y - d)) buf[y * W + x] = EXT[Math.min(EXT.length - 1, d - 1)];
  }
  // outline
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (isFace(x, y)) continue;
      if (isFace(x - 1, y) || isFace(x + 1, y) || isFace(x, y - 1) || isFace(x, y + 1)) buf[y * W + x] = OUT;
    }
  }
  // face: gradient over the cap height, bevel on letter edges, wear
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isFace(x, y)) continue;
      const u = (y - pad) / (fh * k - 1);
      let v = u * (FACE.length - 1);
      let i = Math.floor(v);
      if (v - i > bay(x, y)) i++;
      let c = FACE[Math.min(FACE.length - 1, i)];
      if (!isFace(x, y - 1)) c = HI;
      else if (!isFace(x, y + 1) || !isFace(x + 1, y)) c = LO;
      else if (hash(x * 131 + y * 977) > 0.965) c = WEAR;
      buf[y * W + x] = c;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
