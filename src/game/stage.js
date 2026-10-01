// Stage / arena renderer: a ruined temple courtyard at dusk plus the two
// domain worlds (Unlimited Void, Malevolent Shrine), with destruction,
// stage-owned particles and domain expand / shatter / clash transitions.
//
// Depth model: every background plane has a depth scale s (fighter plane
// s = 1, balustrade and floor back edge s = 0.8, sky s -> 0) and is authored
// in default-camera screen pixels. Camera zoom acts as a dolly, so a plane at
// depth s maps world units to k(s) = 1 / (1/s - 1 + 1/ez) pixels and is drawn
// at 1 / (1 - s + s/ez) times its art size: near planes zoom with the
// fighters, far ones barely move. The horizon (vanishing line) is fixed at
// screen y 142. The floor is drawn per scanline from a pre-warped texture
// whose rows are floor strips at increasing depth, pre-scaled so that rows
// blit 1:1 at the default camera.
//
// All art is generated procedurally into 32-bit pixel buffers at load
// (no anti-aliasing, ramp shading, ordered dithering) and blitted with
// nearest-neighbour sampling. Without a DOM (headless sim) every method stays
// cheap and only plain data (prop HP, modes, timers) is updated.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U;
  const W = JJK.W, H = JJK.H;
  const DOM = typeof document !== 'undefined';

  const HY = 142; // horizon screen y
  const OFF = H / 2 - HY; // principal point offset above screen center (38)
  const EYE = (JJK.CAM_BASE_Y || 142) + OFF; // camera height at default (180)
  const ZF = 900; // fighter plane distance (= focal length in px)
  const SB = 0.8; // floor back edge / balustrade depth scale
  const ROW0 = HY + EYE * SB; // 286: floor back edge screen row
  const PER = 1600; // floor + balustrade lateral period (world units)
  const ZB = ZF / SB; // floor back edge distance
  const GRAV = 0.3;
  const SUN = { x: 404, y: 106, r: 46 }; // screen position of the setting sun

  // ---------------------------------------------------------------- colors
  const hx = (h, a = 255) => {
    const c = U.hex(h);
    return U.pack(c[0], c[1], c[2], a);
  };
  const ramp = (a) => a.map((h) => hx(h));
  const cr = (c) => c & 255, cg = (c) => (c >>> 8) & 255, cb = (c) => (c >>> 16) & 255, ca = (c) => c >>> 24;
  function mixp(a, b, t) {
    if (t <= 0) return a;
    if (t >= 1) return b;
    return U.pack(cr(a) + (cr(b) - cr(a)) * t, cg(a) + (cg(b) - cg(a)) * t, cb(a) + (cb(b) - cb(a)) * t,
      (ca(a) + (ca(b) - ca(a)) * t) | 0);
  }
  const mulp = (c, k) => U.pack(cr(c) * k, cg(c) * k, cb(c) * k, ca(c));
  const css = (c, a = 1) => U.css([cr(c), cg(c), cb(c)], a);
  const hyp = (a, b) => Math.sqrt(a * a + b * b);
  const num = (v, d = 0) => { v = +v; return v === v && Math.abs(v) < 1e7 ? v : d; }; // finite or default

  // ordered dithering: rmp(ramp, v) picks ramp[floor(v)] / ramp[floor(v)+1]
  const BAY = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16));
  const bay = (x, y) => BAY[((y & 3) << 2) | (x & 3)];
  const rmp = (R, v, x, y) => {
    const i = Math.floor(v + bay(x, y));
    return R[i < 0 ? 0 : i >= R.length ? R.length - 1 : i];
  };

  // ----------------------------------------------------------------- noise
  function hash(x, y, z) {
    let h = Math.imul((x | 0) ^ 0x5bd1e995, 0x27d4eb2d) ^ Math.imul((y | 0) + 0x1234567, 0x165667b1) ^
      Math.imul((z | 0) + 0x7f4a7c15, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  // value noise on a 256x256 lattice table; px = lattice period along x
  // (0 = none) for tileable layers
  const NT = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) NT[i] = hash(i & 255, i >> 8, 99);
  function vn(x, y, sd, px) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    let x0 = ix, x1 = ix + 1;
    if (px) { x0 = ((x0 % px) + px) % px; x1 = ((x1 % px) + px) % px; }
    const ox = sd * 57, oy = sd * 131;
    const r0 = ((iy + oy) & 255) << 8, r1 = ((iy + 1 + oy) & 255) << 8;
    const c0 = (x0 + ox) & 255, c1 = (x1 + ox) & 255;
    const a = NT[r0 | c0], b = NT[r0 | c1], c = NT[r1 | c0], d = NT[r1 | c1];
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm(x, y, sd, oct, px) {
    let s = 0, a = 0.5, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * vn(x, y, sd + i * 31, px);
      n += a; x *= 2; y *= 2; if (px) px *= 2; a *= 0.5;
    }
    return s / n;
  }

  // ---------------------------------------------------------- pixel buffer
  // f = packed color or (x, y, old) => packed color (0 leaves the pixel).
  class Pix {
    constructor(w, h, wrap) {
      this.w = w; this.h = h; this.wrap = !!wrap;
      this.d = new Uint32Array(w * h);
    }
    get(x, y) {
      if (this.wrap) x = ((x % this.w) + this.w) % this.w;
      return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : 0;
    }
    a(x, y) { return this.get(x, y) >>> 24; }
    put(x, y, f) {
      const xi = this.wrap ? ((x % this.w) + this.w) % this.w : x;
      if (xi < 0 || y < 0 || xi >= this.w || y >= this.h) return;
      const k = y * this.w + xi;
      if (typeof f === 'number') this.d[k] = f;
      else {
        const c = f(x, y, this.d[k]);
        if (c) this.d[k] = c;
      }
    }
    rect(x, y, w, h, f) {
      const x0 = Math.round(x), y0 = Math.max(0, Math.round(y));
      const x1 = Math.round(x + w), y1 = Math.min(this.h, Math.round(y + h));
      for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) this.put(i, j, f);
    }
    span(y, xa, xb, f) {
      if (y < 0 || y >= this.h) return;
      const a = Math.ceil(xa - 0.5), b = Math.floor(xb - 0.5);
      for (let x = a; x <= b; x++) this.put(x, y, f);
    }
    poly(p, f) {
      let y0 = Infinity, y1 = -Infinity;
      for (let i = 1; i < p.length; i += 2) { if (p[i] < y0) y0 = p[i]; if (p[i] > y1) y1 = p[i]; }
      const n = p.length >> 1, xs = [];
      for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.h - 1, Math.ceil(y1)); y++) {
        const yc = y + 0.5;
        xs.length = 0;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const yi = p[2 * i + 1], yj = p[2 * j + 1];
          if ((yi > yc) !== (yj > yc)) xs.push(p[2 * i] + ((yc - yi) / (yj - yi)) * (p[2 * j] - p[2 * i]));
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) this.span(y, xs[k], xs[k + 1], f);
      }
    }
    ellipse(cx, cy, rx, ry, f) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        const dy = (y + 0.5 - cy) / ry;
        if (dy <= -1 || dy >= 1) continue;
        const hw = rx * Math.sqrt(1 - dy * dy);
        this.span(y, cx - hw, cx + hw, f);
      }
    }
    line(x0, y0, x1, y1, f) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let e = dx + dy;
      for (;;) {
        this.put(x0, y0, f);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * e;
        if (e2 >= dy) { e += dy; x0 += sx; }
        if (e2 <= dx) { e += dx; y0 += sy; }
      }
    }
    // thick polyline through points [x,y,...] with width w (round joins)
    stroke(p, w, f) {
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
        const n = Math.max(1, Math.ceil(hyp(bx - ax, by - ay) * 2));
        for (let j = 0; j <= n; j++) {
          const t = j / n;
          if (w <= 1.2) this.put(Math.round(ax + (bx - ax) * t - 0.5), Math.round(ay + (by - ay) * t - 0.5), f);
          else this.ellipse(ax + (bx - ax) * t, ay + (by - ay) * t, w / 2, w / 2, f);
        }
      }
    }
    blit(s, dx, dy, flip) {
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
        const c = s.d[y * s.w + (flip ? s.w - 1 - x : x)];
        if (c >>> 24) this.put(dx + x, dy + y, c);
      }
    }
    clone() {
      const p = new Pix(this.w, this.h, this.wrap);
      p.d.set(this.d);
      return p;
    }
  }

  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function toCanvas(p) {
    const c = mkCanvas(p.w, p.h);
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(p.d.buffer.slice(0)), p.w, p.h), 0, 0);
    return c;
  }

  // Light the silhouette edges that face the sky (top) and the sun (side).
  function rimPass(P, o) {
    const w = P.w, h = P.h, d = P.d, src = d.slice();
    const al = (x, y) => {
      if (y < 0 || y >= h) return 0;
      if (x < 0 || x >= w) { if (!P.wrap) return 255; x = ((x % w) + w) % w; }
      return src[y * w + x] >>> 24;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x, c = src[k];
      if ((c >>> 24) < 200) continue;
      const sd = x - (o.sunX || 0) < 0 ? 1 : -1;
      const fall = o.fall ? Math.exp(-Math.abs(x - o.sunX) / o.fall) * 0.6 + 0.4 : 1;
      if (al(x, y - 1) < 128) d[k] = mixp(c, o.top, o.kTop * fall);
      else if (al(x + sd, y) < 128 || al(x + sd, y - 1) < 128) d[k] = mixp(c, o.side, o.kSide * fall);
      else if (o.inner && al(x, y - 2) < 128) d[k] = mixp(c, o.top, o.kTop * o.inner * fall);
    }
  }
  // Banded atmospheric fog toward the bottom of a layer (dithered steps).
  function fogPass(P, y0, y1, fog, kMax, pw, steps = 5, patch = 0) {
    for (let y = Math.max(0, y0); y < Math.min(P.h, y1); y++) {
      const t0 = Math.pow((y - y0) / (y1 - y0), pw) * kMax;
      for (let x = 0; x < P.w; x++) {
        const k = y * P.w + x, c = P.d[k];
        if ((c >>> 24) < 200) continue;
        const t = patch ? t0 * (1 - patch + patch * 2 * fbm((x / P.w) * 12, y * 0.05, 77, 2, 12)) : t0;
        const lv = Math.floor(t * steps + bay(x, y)) / steps;
        if (lv > 0) P.d[k] = mixp(c, fog, Math.min(1, lv));
      }
    }
  }
  // Dark 1px outline around opaque pixels (selective: only into empty space).
  function outlinePass(P, col) {
    const w = P.w, h = P.h, src = P.d.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (src[y * w + x] >>> 24) continue;
      const n = (x > 0 && src[y * w + x - 1] >>> 24) || (x < w - 1 && src[y * w + x + 1] >>> 24) ||
        (y > 0 && src[(y - 1) * w + x] >>> 24) || (y < h - 1 && src[(y + 1) * w + x] >>> 24);
      if (n) P.d[y * w + x] = col;
    }
  }

  // --------------------------------------------------------------- palettes
  const SKY = ramp(['#0a0307', '#120409', '#1c060c', '#2a0910', '#3b0c12', '#4f1114', '#661815', '#7e2016',
    '#982b18', '#b23a1b', '#ca4d20', '#df6626', '#ef852f', '#f9a53d', '#fec65a', '#ffe08c', '#fff3c8']);
  const CLOUD = ramp(['#0c0307', '#140509', '#1d070c', '#290a10', '#371013', '#481616', '#5e1f18', '#782b1b',
    '#94391e', '#b44c24', '#d4632c', '#ee8437', '#fcaa4c']);
  const STONE = ramp(['#0b0509', '#12080d', '#1a0d13', '#221219', '#2b171e', '#351c24', '#40222a', '#4d2a30',
    '#5b3236', '#6b3b3c', '#7e4744', '#94554c']);
  const RIM = { lo: hx('#8a3c2a'), mid: hx('#c4602f'), hi: hx('#ee9442'), hot: hx('#ffc874') };
  const FLOOR = ramp(['#0f080c', '#170c11', '#1f1116', '#28161b', '#311b20', '#3b2125', '#46272a', '#522e2f',
    '#5f3634', '#6e3f39', '#80493f', '#955547', '#ad6450']);
  const BLOOD = ramp(['#160406', '#220608', '#30090c', '#3f0c10', '#501114', '#641618']);
  const VERM = ramp(['#1c0608', '#2a0a0b', '#3c0f0e', '#521512', '#6a1c15', '#842518', '#a0321c']);

  // ---------------------------------------------------------------- sky art
  function buildSky() {
    const w = 720, h = 420, ox = 40, oy = 30; // canvas -> screen: (x - ox, y - oy)
    const P = new Pix(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = x - ox, sy = y - oy;
      const tv = U.clamp((sy + 30) / (HY + 46), 0, 1.25);
      let v = 0.7 + Math.pow(tv, 1.7) * 10.4;
      const dx = sx - SUN.x, dy = (sy - SUN.y) * 1.25;
      const d = Math.sqrt(dx * dx + dy * dy);
      v += 3.0 * Math.exp(-d / 58) + 1.9 * Math.exp(-d / 175) * (0.4 + tv * 0.6);
      v += (fbm(sx * 0.011, sy * 0.034, 3, 3) - 0.5) * 1.5;
      if (sy > HY + 14) v -= (sy - HY - 14) * 0.09; // hidden below the horizon: fade to dusk
      if (d < SUN.r) {
        v = 13.4 + Math.pow(1 - d / SUN.r, 0.55) * 3;
        // faint horizontal heat bands across the disc
        if (sy > SUN.y + 6 && ((sy - SUN.y) % 9 < 1 + (sy - SUN.y) / 18)) v -= 1.6;
      } else if (d < SUN.r + 1.6) v = Math.max(v, 13);
      P.d[y * w + x] = rmp(SKY, v, x, y);
    }
    return { pix: P, ox, oy };
  }

  // Tileable drifting cloud strips (alpha keyed).
  function buildClouds(kind) {
    const w = 1024;
    const hi = kind === 'hi';
    const h = hi ? 128 : 84, sy0 = hi ? -34 : 64; // screen y of row 0
    const P = new Pix(w, h, true);
    const px = hi ? 6 : 12;
    const dens = new Float32Array(w * (h + 4));
    for (let y = 0; y < h + 4; y++) for (let x = 0; x < w; x++) {
      const yy = y / h;
      let n;
      if (hi) n = fbm((x / w) * px, y * 0.036, 41, 5, px) + (1 - yy) * 0.2 - yy * yy * 0.15;
      else n = fbm((x / w) * px, y * 0.16, 77, 4, px) * (0.55 + 0.6 * Math.sin(Math.PI * U.clamp(yy, 0, 1)));
      dens[y * w + x] = n;
    }
    const thr = hi ? 0.56 : 0.5;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = dens[y * w + x];
      if (n < thr - 0.03) continue;
      if (n < thr && bay(x, y) < 0.55) continue;
      const below = dens[(y + 3) * w + x], below1 = dens[(y + 1) * w + x];
      const sy = sy0 + y;
      const lift = U.clamp((sy + 20) / 160, 0, 1); // lower clouds catch more fire light
      let v;
      if (hi) {
        v = 1.4 + (n - thr) * 3 + lift * 2.6;
        if (below1 < thr) v += 3.2 + lift * 2.2;
        else if (below < thr) v += 1.6 + lift;
        if (dens[(y - 1 < 0 ? 0 : y - 1) * w + x] < thr) v -= 0.6;
      } else {
        v = 4.2 + lift * 2.6 - (n - thr) * 2;
        if (below1 < thr) v += 2.6;
        else if (below < thr) v += 1.1;
      }
      P.d[y * w + x] = rmp(CLOUD, v, x, y);
    }
    return { pix: P, sy0 };
  }

  // ---------------------------------------------------------- far city art
  function buildCity(o) {
    const w = o.w, h = o.h, base = Math.round(o.base - o.y0); // canvas rows
    const P = new Pix(w, h, true);
    const rng = U.makeRng(o.seed);
    const R = o.ramp;
    const fires = [];
    let x = 0;
    while (x < w) {
      const bw = Math.floor(o.minW + rng() * (o.maxW - o.minW));
      let bh = o.minH + Math.pow(rng(), 1.5) * (o.maxH - o.minH);
      if (rng() < 0.1) bh *= 1.45;
      const top = base - bh;
      const broken = rng() < o.broken;
      const lean = broken && rng() < 0.3 ? (rng() - 0.5) * 0.5 : 0;
      const tone = 0.6 + rng() * 1.2;
      const setback = rng() < 0.4 ? Math.max(2, Math.floor(bw * 0.2)) : 0;
      const jagA = rng() * 10;
      const kind = rng();
      const sd = x + bw / 2 < o.sunX ? 1 : -1;
      const litFloor = Math.floor(rng() * 6), winW = rng() < 0.5 ? 3 : 4;
      const hole = broken && rng() < 0.6 ? [Math.floor(bw * (0.15 + rng() * 0.4)), Math.floor(bw * (0.3 + rng() * 0.3)), Math.floor(rng() * bh * 0.4) + 6, Math.floor(4 + rng() * 10)] : null;
      for (let i = 0; i < bw; i++) {
        let t = top + (i < setback || i >= bw - setback ? bh * 0.12 : 0);
        if (broken) t += Math.abs(Math.sin(i * 0.9 + jagA)) * 6 + (i / bw) * bh * 0.25 * (jagA > 5 ? 1 : -0.4) + 4;
        if (kind > 0.86 && !broken) t += Math.abs(i - bw / 2) * 0.9; // pointed top
        t = Math.round(t + lean * (base - t));
        const fromSun = sd > 0 ? bw - 1 - i : i;
        for (let y = Math.max(0, t); y < base; y++) {
          const ly = y - t;
          if (hole && i >= hole[0] && i < hole[0] + hole[1] && ly >= hole[2] && ly < hole[2] + hole[3] + Math.round(Math.sin(i * 1.3) * 2)) continue;
          let v = tone + (ly / (base - t + 1)) * 0.5;
          if (fromSun === 0) v += 1.1; else if (fromSun === 1) v += 0.4; else if (fromSun >= bw - 2) v -= 0.4;
          if (ly % 12 === 0 && ly > 0) v += 0.35;
          if (o.win && (i % winW) === 1 && ly % 4 === 2 && ly > 2 && fromSun > 0 && fromSun < bw - 1) {
            const hh = hash(x + i, y, o.seed);
            if (hh < o.lit || (Math.floor(ly / 4) % 7 === litFloor && hh < o.lit * 6)) { P.put(x + i, y, hh < o.lit * 0.3 ? o.winHot : o.winCol); continue; }
            v -= 0.65;
          }
          P.put(x + i, y, rmp(R, v, x + i, y));
        }
        // exposed frame beams on broken tops
        if (broken && i % 4 === 1 && hash(x + i, 7, o.seed) < 0.3) for (let j = 1; j < 2 + hash(x + i, 8, o.seed) * 7; j++) P.put(x + i, t - j, R[0]);
      }
      if (!broken && rng() < 0.35) {
        const ax = x + Math.floor(bw / 2), ah = 4 + rng() * 12;
        for (let j = 0; j < ah; j++) P.put(ax, Math.round(top - j), R[0]);
        if (rng() < 0.5) P.put(ax, Math.round(top - ah), o.winHot);
      } else if (!broken && rng() < 0.4) P.rect(x + 2, top - 3, Math.max(3, bw * 0.3), 3, R[0]);
      if (rng() < o.fire) fires.push([x + Math.floor(rng() * bw), Math.round(top + (broken ? 8 : rng() * bh * 0.6)), 2 + rng() * 3]);
      x += bw + Math.floor(rng() * o.gap);
    }
    // cranes / skeletal frames
    for (let c = 0; c < (o.cranes || 0); c++) {
      const cx = Math.floor(rng() * w), ch = o.maxH * (0.8 + rng() * 0.5);
      for (let j = 0; j < ch; j++) { P.put(cx, base - j, R[0]); if (j % 4 === 0) P.put(cx + 1, base - j, R[0]); if (j % 8 === 0) P.put(cx - 1, base - j, R[0]); }
      const arm = 14 + rng() * 22, dir = rng() < 0.5 ? -1 : 1;
      for (let i = -6; i < arm; i++) { P.put(cx + i * dir, Math.round(base - ch), R[0]); if (i % 3 === 0) P.put(cx + i * dir, Math.round(base - ch) + 1, R[0]); }
      for (let j = 0; j < 9; j++) P.put(Math.round(cx + arm * 0.8 * dir), Math.round(base - ch + j), R[0]);
    }
    rimPass(P, { sunX: o.sunX, top: o.rim, side: o.rim, kTop: o.rimK, kSide: o.rimK * 0.7, fall: 260 });
    for (const f of fires) {
      const [fx, fy, fr] = f;
      for (let j = -fr * 2; j <= fr; j++) for (let i = -fr * 1.5; i <= fr * 1.5; i++) {
        const d = hyp(i / 1.5, j > 0 ? j : j * 0.6) / fr;
        if (d > 1) continue;
        const X = Math.round(fx + i), Y = Math.round(fy + j);
        if (P.a(X, Y) < 200) { if (d < 0.6 && bay(X, Y) < 0.4) P.put(X, Y, o.fireCol[0]); continue; }
        P.put(X, Y, o.fireCol[Math.min(3, Math.floor((1 - d) * 4 + bay(X, Y) * 0.8))]);
      }
    }
    fogPass(P, Math.round(base - o.maxH * 0.6), base, o.haze, o.hazeK, 1.7, 6);
    for (let y = base; y < h; y++) for (let x2 = 0; x2 < w; x2++) P.put(x2, y, mixp(o.haze, R[0], ((y - base) / (h - base)) * 0.35 * bay(x2, y)));
    return { pix: P, ox: (w - W) / 2, oy: -o.y0, s: o.s, tile: true, fires };
  }

  // Temple town: rows of tiled roofs between the far temples and the courtyard.
  function buildTown() {
    const w = 1280, y0 = 64, h = 238, base = Math.round(HY + EYE * 0.3 - y0), cx0 = w / 2;
    const P = new Pix(w, h, true);
    const R = ramp(['#12050a', '#18070e', '#200a12', '#280e17', '#31121c', '#3b1721', '#461c26']);
    const rng = U.makeRng(651);
    const fires = [];
    // ground
    for (let x = 0; x < w; x++) for (let y = base - 26 + Math.round(fbm((x / w) * 6, 0.2, 652, 3, 6) * 8); y < h; y++) P.put(x, y, rmp(R, 0.8, x, y));
    const house = (x, yb, bw, bh, two) => {
      const roofH = Math.max(4, Math.round(bw * 0.28)), lift = Math.max(1, bw * 0.06);
      drawBody(P, Math.round(x - bw * 0.42), Math.round(yb - bh), Math.round(x + bw * 0.42), yb, R, { pil: Math.max(3, Math.round(bw / 6)), base: 1.3, win: true, lit: 0.04, litCol: rng() < 0.5 ? hx('#d86a26') : hx('#f0a040') });
      drawRoof(P, x, Math.round(yb - bh + roofH * 0.35), bw / 2, roofH, lift, R, { ridge: rng() < 0.5 ? 0.25 : 0.55, base: 1.6, rows: 2, orn: bw > 26 });
      if (two) {
        const y2 = Math.round(yb - bh - roofH * 0.6);
        drawBody(P, Math.round(x - bw * 0.26), y2 - Math.round(bh * 0.6), Math.round(x + bw * 0.26), y2, R, { pil: 4, base: 1.2, lit: 0.05, litCol: hx('#e08030') });
        drawRoof(P, x, Math.round(y2 - bh * 0.6 + roofH * 0.3), bw * 0.34, roofH * 0.8, lift, R, { ridge: 0.3, base: 1.7, rows: 2 });
      }
    };
    for (const [off, sc, n] of [[-24, 0.6, 52], [-13, 0.8, 40], [-3, 1, 30]]) {
      for (let i = 0; i < n; i++) {
        const x = (i / n) * w + (rng() - 0.5) * (w / n) * 0.8;
        const bw = (18 + rng() * 22) * sc, bh = (6 + rng() * 5) * sc;
        house(x, base + off + Math.round((rng() - 0.5) * 3), bw, bh, rng() < 0.18);
        if (rng() < 0.3) pine(P, x + bw * 0.6, base + off, (12 + rng() * 14) * sc, R, 660 + i);
      }
    }
    pagoda(P, cx0 + 420, base - 6, 3, 18, 15, R, { lit: 0.02, litCol: hx('#e07028') });
    pagoda(P, cx0 - 520, base - 10, 3, 16, 14, R, {});
    rimPass(P, { sunX: cx0 + SUN.x - W / 2, top: hx('#e27a36'), side: hx('#c05a2a'), kTop: 0.55, kSide: 0.35, inner: 0.3, fall: 420 });
    for (const [fx, fy, fr] of fires) {
      for (let j = -fr * 2; j <= fr; j++) for (let i = -fr; i <= fr; i++) {
        const d = hyp(i, j > 0 ? j : j * 0.5) / fr;
        if (d > 1) continue;
        const X = Math.round(fx + i), Y = Math.round(fy + j);
        P.put(X, Y, [hx('#a8301a'), hx('#e8602a'), hx('#ffa040'), hx('#ffe090')][Math.min(3, Math.floor((1 - d) * 4 + bay(X, Y) * 0.8))]);
      }
    }
    fogPass(P, base - 40, base + 2, hx('#5e1c16'), 0.7, 1.5, 6);
    for (let y = base + 2; y < h; y++) for (let x = 0; x < w; x++) P.d[y * w + x] = mixp(hx('#5e1c16'), R[0], ((y - base) / (h - base)) * 0.5 * bay(x, y));
    return { pix: P, ox: (w - W) / 2, oy: -y0, s: 0.3, tile: true, fires };
  }

  // ------------------------------------------------- Japanese architecture
  // Roof outline with sagging slopes and upturned eave tips.
  function roofPts(cx, yb, hw, h, lift, ridge = 0.2, thick = 2.5) {
    const pts = [], N = 12, rw = hw * ridge, yr = yb - h, yt = yb - lift - thick;
    pts.push(cx - hw - lift * 0.35, yt - lift * 0.35);
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      pts.push(cx - hw + (hw - rw) * t, yt - (yt - yr) * t * t);
    }
    for (let i = N; i >= 1; i--) {
      const t = i / N;
      pts.push(cx + hw - (hw - rw) * t, yt - (yt - yr) * t * t);
    }
    pts.push(cx + hw + lift * 0.35, yt - lift * 0.35);
    for (let i = 0; i <= N * 2; i++) {
      const xn = i / N - 1;
      pts.push(cx + hw * xn, yb - lift * Math.pow(Math.abs(xn), 2.6));
    }
    return pts;
  }
  // Roof fill with tile rows / ribs, fascia band and ridge.
  function roofFn(cx, yb, hw, h, lift, R, o = {}) {
    const yr = yb - h, rib = o.rib || 0, rows = o.rows || 3, base = o.base != null ? o.base : 1.4;
    return (x, y) => {
      const xn = U.clamp((x + 0.5 - cx) / hw, -1, 1);
      const ye = yb - lift * Math.pow(Math.abs(xn), 2.6);
      const de = ye - (y + 0.5);
      if (de < 1) return R[0];
      if (de < 2.6) return R[Math.min(R.length - 1, Math.round(base + 2.6))];
      if (y < yr + 2) return y < yr + 1 ? R[Math.min(R.length - 1, Math.round(base + 2))] : R[0];
      let v = base + (1 - de / (yb - yr)) * 0.6 + (de / (yb - yr)) * 0.9;
      if (Math.floor(de) % rows === 0) v -= 0.9;
      if (rib && ((x - Math.round(cx)) % rib + rib) % rib === 0) v += 0.7;
      return rmp(R, v, x, y);
    };
  }
  function drawRoof(P, cx, yb, hw, h, lift, R, o) {
    P.poly(roofPts(cx, yb, hw, h, lift, o && o.ridge, o && o.thick), roofFn(cx, yb, hw, h, lift, R, o));
    // ridge ornaments
    const yr = Math.round(yb - h), rw = Math.round(hw * (o && o.ridge != null ? o.ridge : 0.2));
    if (!o || o.orn !== false) for (const sd of [-1, 1]) {
      const ex = Math.round(cx + sd * rw);
      P.put(ex, yr - 1, R[1]); P.put(ex, yr - 2, R[1]); P.put(ex + sd, yr - 2, R[1]); P.put(ex + sd, yr - 3, R[1]);
    }
  }
  // Wall body with pillars and under-eave shadow.
  function drawBody(P, x0, y0, x1, y1, R, o = {}) {
    const pil = o.pil || 6;
    P.rect(x0, y0, x1 - x0, y1 - y0, (x, y) => {
      let v = o.base != null ? o.base : 1.2;
      if (y - y0 < 3) v -= 0.9; // eave shadow
      const lx = x - x0;
      if (lx % pil === 0) v += 0.9;
      else if (o.win && (y - y0) > 3 && (y - y0) % 5 > 1 && lx % pil > 1 && lx % pil < pil - 1) v -= 0.6;
      if (o.lit && hash(x, y, 9) < o.lit) return o.litCol;
      return rmp(R, v, x, y);
    });
  }
  function pagoda(P, cx, yb, tiers, hw0, th, R, o = {}) {
    let y = yb;
    P.rect(cx - hw0 * 0.75, y - 4, hw0 * 1.5, 4, (x, yy) => rmp(R, 1.6 + (yy === y - 4 ? 1 : 0), x, yy));
    y -= 4;
    for (let i = 0; i < tiers; i++) {
      const k = 1 - i * (o.taper || 0.085);
      const bw = hw0 * 0.56 * k, bh = th * (i === 0 ? 0.75 : 0.42);
      drawBody(P, Math.round(cx - bw), Math.round(y - bh), Math.round(cx + bw), Math.round(y), R, { pil: Math.max(3, Math.round(bw / 2)), base: 1.1, win: i === 0, lit: o.lit, litCol: o.litCol });
      y -= bh;
      if (o.broken && i >= tiers - o.broken) {
        // collapsed upper tiers: jagged stub
        for (let j = 0; j < bw * 2; j++) {
          const hh = Math.round(Math.abs(Math.sin(j * 1.7)) * 4 + hash(j, i, 3) * 3);
          for (let q = 0; q < hh; q++) P.put(Math.round(cx - bw + j), Math.round(y - q), R[1]);
        }
        return y;
      }
      const hw = hw0 * k, rh = th * 0.42;
      drawRoof(P, cx, Math.round(y + rh * 0.38), hw, rh, Math.max(2, hw * 0.12), R, { rib: o.rib, base: o.roofBase });
      y -= rh * 0.62;
    }
    // finial (sorin)
    const fh = th * 1.25;
    for (let j = 0; j < fh; j++) {
      const yy = Math.round(y - j);
      P.put(Math.round(cx), yy, R[1]);
      if (j > 2 && j < fh - 4 && j % 3 === 0) { P.put(Math.round(cx) - 1, yy, R[1]); P.put(Math.round(cx) + 1, yy, R[1]); }
    }
    P.ellipse(cx, y - fh, 1.4, 1.6, R[1]);
    return y - fh;
  }
  function hall(P, cx, yb, hw, hh, R, o = {}) {
    P.rect(cx - hw * 1.05, yb - 5, hw * 2.1, 5, (x, y) => rmp(R, y === yb - 5 ? 2.6 : 1.5, x, y));
    const wy = yb - 5 - hh * 0.42;
    drawBody(P, Math.round(cx - hw * 0.86), Math.round(wy), Math.round(cx + hw * 0.86), yb - 5, R, { pil: Math.max(4, Math.round(hw / 4)), win: true, lit: o.lit, litCol: o.litCol });
    const rh = hh * 0.5;
    drawRoof(P, cx, Math.round(wy + rh * 0.3), hw * 1.22, rh, hw * 0.12, R, { ridge: 0.42, rib: o.rib, base: o.roofBase });
    // irimoya gable
    const gy = Math.round(wy + rh * 0.3 - rh * 0.72);
    P.poly([cx - hw * 0.35, gy + rh * 0.3, cx, gy - rh * 0.28, cx + hw * 0.35, gy + rh * 0.3], (x, y) => rmp(R, 2.2 + (y % 3 === 0 ? -0.6 : 0), x, y));
    drawRoof(P, cx, Math.round(gy - rh * 0.1), hw * 0.5, rh * 0.3, 1.5, R, { ridge: 0.6, base: o.roofBase });
  }
  function torii(P, cx, yb, hw, h, R, o = {}) {
    const pw = Math.max(2, Math.round(hw * 0.12));
    const px = [Math.round(cx - hw * 0.72), Math.round(cx + hw * 0.72)];
    const shade = (x, y, b) => rmp(R, b + ((x & 1) ? 0 : 0.3), x, y);
    for (let s = 0; s < 2; s++) {
      if (o.broken === s) {
        const top = Math.round(yb - h * 0.45);
        P.rect(px[s] - pw / 2, top, pw, yb - top, (x, y) => shade(x, y, 2.2));
        for (let i = 0; i < pw; i++) P.put(px[s] - Math.floor(pw / 2) + i, top - (i % 2), R[2]);
        continue;
      }
      for (let y = Math.round(yb - h); y < yb; y++) {
        const lean = (yb - y) / h * (s ? -1 : 1) * hw * 0.04;
        P.span(y, px[s] - pw / 2 + lean, px[s] + pw / 2 + lean + (y > yb - 4 ? 1 : 0), (x, yy) => shade(x, yy, y > yb - 5 ? 1.2 : 2.4));
      }
    }
    const ny = Math.round(yb - h * 0.76);
    if (o.broken == null) P.rect(cx - hw * 0.92, ny, hw * 1.84, Math.max(2, pw * 0.7), (x, y) => shade(x, y, 2.6));
    // kasagi + shimaki with upturned ends
    const ky = Math.round(yb - h);
    const kh = Math.max(3, Math.round(pw * 1.1));
    const tilt = o.broken != null ? (o.broken ? 1 : -1) * 0.18 : 0;
    const pts = [];
    for (let i = 0; i <= 16; i++) { const xn = i / 8 - 1; pts.push(cx + xn * hw * 1.18, ky - Math.pow(Math.abs(xn), 3) * kh * 0.9 + xn * hw * tilt); }
    for (let i = 16; i >= 0; i--) { const xn = i / 8 - 1; pts.push(cx + xn * hw * 1.1, ky + kh - Math.pow(Math.abs(xn), 3) * kh * 0.6 + xn * hw * tilt); }
    P.poly(pts, (x, y) => rmp(R, y < ky + 1 ? 3.6 : 2.6, x, y));
    P.rect(cx - hw * 0.9, ky + kh, hw * 1.8, Math.max(2, Math.round(kh * 0.6)), (x, y) => rmp(R, 1.8, x, y));
    if (o.broken == null) P.rect(cx - 1, ky + kh, 3, ny - ky - kh, (x, y) => rmp(R, 2, x, y));
  }
  function pine(P, x0, yb, h, R, sd) {
    const rng = U.makeRng(sd);
    const bend = (rng() - 0.5) * h * 0.3;
    const tw = Math.max(1, h / 28);
    for (let j = 0; j < h; j++) {
      const t = j / h;
      const x = x0 + Math.sin(t * 2.2) * bend;
      P.span(Math.round(yb - j), x - tw * (1 - t * 0.6), x + tw * (1 - t * 0.6), R[0]);
    }
    const pads = 3 + Math.floor(h / 14);
    for (let i = 0; i < pads; i++) {
      const t = 0.35 + (i / pads) * 0.68;
      const x = x0 + Math.sin(t * 2.2) * bend + (i % 2 ? 1 : -1) * h * (0.05 + rng() * 0.18);
      const y = yb - h * t;
      const rx = h * (0.14 + rng() * 0.12) * (1.2 - t * 0.5), ry = Math.max(1.5, rx * 0.34);
      P.ellipse(x, y, rx, ry, (xx, yy) => rmp(R, 0.6 + (yy < y - ry * 0.3 ? 0.9 : 0) + (hash(xx, yy, 5) < 0.2 ? 0.5 : 0), xx, yy));
      P.line(x0 + Math.sin(t * 2.2) * bend, y + 1, x, y, R[0]);
    }
  }
  function deadTree(P, x0, yb, h, R, sd) {
    const rng = U.makeRng(sd);
    const br = (x, y, a, len, w, d) => {
      const x1 = x + Math.cos(a) * len, y1 = y - Math.sin(a) * len;
      P.stroke([x, y, x1, y1], w, R[0]);
      if (d <= 0) return;
      const n = 2 + (rng() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) br(x1, y1, a + (rng() - 0.5) * 1.3, len * (0.55 + rng() * 0.2), Math.max(1, w * 0.65), d - 1);
    };
    br(x0, yb, Math.PI / 2 + (rng() - 0.5) * 0.3, h * 0.42, Math.max(1, h / 22), 3);
  }
  function wallRun(P, x0, x1, yb, h, R, o = {}) {
    P.rect(x0, yb - h, x1 - x0, h, (x, y) => {
      let v = 1.5 + (((y - (yb - h)) % 5 === 0) ? -0.7 : 0);
      if ((x + Math.floor((y - yb) / 5) * 3) % 9 === 0) v -= 0.5;
      return rmp(R, v, x, y);
    });
    drawRoof(P, (x0 + x1) / 2, yb - h + 1, (x1 - x0) / 2 + 2, 4, 1, R, { ridge: 0.96, thick: 1.5, orn: false });
  }

  // Covered temple corridor (kairo): long tiled roof over a row of posts.
  function corridor(P, x0, x1, yb, hgt, R) {
    const ye = yb - hgt;
    for (let x = Math.ceil(x0); x < x1; x++) for (let y = ye; y < yb; y++) {
      const post = (x - Math.ceil(x0)) % 10 === 0;
      let v = post ? 3 : y < ye + 3 ? 0.4 : y > yb - 3 ? 2 : 0.9;
      if (!post && y === ye + 5 && (x - Math.ceil(x0)) % 40 === 20) { P.put(x, y, hx('#e08a3a')); P.put(x, y + 1, hx('#a0401a')); continue; }
      P.put(x, y, rmp(R, v, x, y));
    }
    drawRoof(P, (x0 + x1) / 2, ye + 2, (x1 - x0) / 2 + 3, 8, 2, R, { ridge: 0.97, rows: 2, base: 1.9, orn: false, rib: 3 });
  }
  // Temple complex / mid-ground layer.
  function buildTemples(o) {
    const w = o.w, h = o.h, base = o.base - o.y0, cx0 = w / 2;
    const P = new Pix(w, h, true);
    const R = o.ramp;
    const U0 = (u) => cx0 + u;
    // terrain
    for (let x = 0; x < w; x++) {
      const t = (x / w) * 4;
      const gh = o.ground + fbm(t, 0.5, o.seed, 3, 4) * o.groundVar;
      for (let y = Math.round(base - gh); y < h; y++) P.put(x, y, rmp(R, 0.9 + (y < base - gh + 1 ? 1.2 : 0), x, y));
    }
    o.draw(P, U0, base, R);
    rimPass(P, { sunX: U0(SUN.x - W / 2), top: o.rim, side: o.rimSide || o.rim, kTop: o.rimK, kSide: o.rimK * 0.8, inner: o.inner, fall: 380 });
    if (o.after) o.after(P, U0, base, R);
    fogPass(P, Math.round(base - o.fogH), base + 2, o.fog, o.fogK, 1.4, 6, o.patch || 0);
    if (o.cliff) {
      // fortified terrace face dropping into a misty gorge (seen between the balusters)
      const y0 = base + 4, mist = o.mist;
      for (let y = y0; y < h; y++) for (let x = 0; x < w; x++) {
        const ly = y - y0, course = Math.floor(ly / 8), off = course & 1 ? 11 : 0;
        const bx = Math.floor((x + off) / 22), bu = ((x % 160) + 160) % 160;
        let v = 1.7 + (hash(bx, course, 9) - 0.5) * 0.9 + (vn(x * 0.2, y * 0.2, 9) - 0.5) * 0.8;
        if (ly % 8 === 0) v = 0.6; else if (ly % 8 === 1) v += 0.8;
        else if ((x + off) % 22 === 0) v = 0.8;
        if (bu < 14) v += bu === 0 ? 1.4 : 0.5;
        v -= ly * 0.02;
        const t = Math.pow(ly / (h - y0), 1.3) * 0.7;
        P.d[y * w + x] = mixp(rmp(R, v, x, y), mist, Math.floor(t * 6 + bay(x, y)) / 6);
      }
      for (let i = 0; i < 9; i++) {
        const ax = Math.floor(hash(i, 1, 655) * w), ay = y0 + 6 + Math.floor(hash(i, 2, 655) * 8);
        for (let y = ay; y < ay + 12; y++) for (let x = ax - 4; x <= ax + 4; x++) {
          const r = hyp(x - ax, Math.max(0, ay + 4 - y) * 1.2);
          if (r > 4.5) continue;
          P.put(x, y, r < 2.2 && y > ay + 3 && y < ay + 10 ? (hash(x, y, i) < 0.5 ? hx('#c8601e') : hx('#7a2a14')) : R[0]);
        }
      }
    } else for (let y = base + 2; y < h; y++) for (let x = 0; x < w; x++) P.d[y * w + x] = mixp(P.d[y * w + x] || R[0], o.fog, o.fogK * 0.9);
    return { pix: P, ox: (w - W) / 2, oy: -o.y0, s: o.s, tile: true };
  }

  // -------------------------------------------------------- stone helpers
  const S = (v, x, y) => rmp(STONE, v, x, y);
  // Shaded stone block with courses / joints, grain, chips and lit edges.
  function stoneBox(P, x0, y0, x1, y1, o = {}) {
    const w = x1 - x0, h = y1 - y0, sd = o.seed || 1, sun = o.sun || 1;
    const bw = o.bw || 0, bh = o.bh || 0, base = o.base != null ? o.base : 4;
    P.rect(x0, y0, w, h, (x, y) => {
      const lx = x - x0, ly = y - y0;
      let v = base + (fbm(x * 0.23, y * 0.23, sd, 2) - 0.5) * 1.7;
      if (bh && ly > 0) {
        const by = Math.floor(ly / bh), off = by & 1 ? Math.floor(bw / 2) : 0;
        const bx = bw ? Math.floor((lx + off) / bw) : 0;
        v += (hash(bx, by, sd) - 0.5) * 1.1;
        if (ly % bh === 0) return S(1.1, x, y);
        if (ly % bh === 1) v += 0.9;
        if (bw) {
          const jx = (lx + off) % bw;
          if (jx === 0) return S(1.3, x, y);
          if (jx === (sun > 0 ? 1 : bw - 1)) v += 0.6;
          if (jx === (sun > 0 ? bw - 1 : 1)) v -= 0.5;
        }
        if (ly % bh === bh - 1) v -= 0.6;
      }
      if (o.top && ly === 0) return mixp(S(v + 3, x, y), RIM.hi, o.top);
      if (o.top && ly === 1) v += 1.7;
      if (o.top && ly === 2) v += 0.6;
      const se = sun > 0 ? w - 1 - lx : lx;
      if (se === 0) { v += 1.6; if (o.rimSide) return mixp(S(v, x, y), RIM.mid, o.rimSide); }
      else if (se === 1) v += 0.5;
      else if (se === w - 1) v -= 0.9;
      if (ly === h - 1) v -= 1.1;
      if (o.grad) v += (1 - ly / h) * o.grad;
      const hc = hash(x, y, sd + 7);
      if (hc < 0.025) v -= 1.4;
      else if (hc < 0.04) v += 0.8;
      return S(v, x, y);
    });
  }
  // Random crack: dark polyline with a lit lower lip.
  function crackLine(P, x, y, len, ang, sd, opaqueOnly = true) {
    const rng = U.makeRng(sd);
    for (let i = 0; i < len; i++) {
      ang += (rng() - 0.5) * 0.9;
      x += Math.cos(ang); y += Math.sin(ang) * 0.9;
      const X = Math.round(x), Y = Math.round(y);
      if (opaqueOnly && P.a(X, Y) < 200) return;
      P.put(X, Y, STONE[0]);
      if (P.a(X, Y + 1) > 200 && rng() < 0.6) P.put(X, Y + 1, (xx, yy, old) => mixp(old, RIM.lo, 0.35));
      if (rng() < 0.06) crackLine(P, x, y, len * 0.4, ang + (rng() < 0.5 ? 1 : -1), sd + i, opaqueOnly);
    }
  }
  // Seigaiha (wave scale) relief panel.
  function wavePanel(P, x0, y0, x1, y1, sd) {
    stoneBox(P, x0, y0, x1, y1, { base: 4.2, top: 0.35, seed: sd });
    const ix0 = x0 + 3, iy0 = y0 + 3, ix1 = x1 - 3, iy1 = y1 - 3;
    P.rect(ix0, iy0, ix1 - ix0, iy1 - iy0, (x, y) => {
      const lx = x - ix0 + 0.5, ly = y - iy0 + 0.5;
      let best = null;
      for (let j = Math.floor(ly / 4) + 2; j >= Math.floor(ly / 4) - 1; j--) {
        const off = j & 1 ? 6 : 0;
        const ccx = Math.round((lx - off) / 12) * 12 + off, ccy = j * 4 + 6;
        const d = hyp(lx - ccx, (ly - ccy) * 1.15);
        if (d < 6.5 && ly <= ccy + 0.5) { best = d; break; }
      }
      let v = 2.6;
      if (y === iy0) return S(1, x, y);
      if (best == null) return S(2, x, y);
      if (best > 5.6) v = 1.4;
      else if (Math.floor(best / 2) % 2 === 0) v = 3.8;
      else v = 2.8;
      if (x === ix0 || y === iy1 - 1) v -= 0.7;
      return S(v + (hash(x, y, sd) < 0.05 ? -1 : 0), x, y);
    });
  }
  // Carved swirling cloud relief (contours of a noise field).
  function cloudRelief(P, x0, y0, x1, y1, sd) {
    stoneBox(P, x0, y0, x1, y1, { base: 3.6, top: 0.3, seed: sd });
    P.rect(x0 + 4, y0 + 4, x1 - x0 - 8, y1 - y0 - 8, (x, y) => {
      const n = fbm(x * 0.045, y * 0.06, sd, 3) * 9;
      const n2 = fbm(x * 0.045, (y - 1) * 0.06, sd, 3) * 9;
      const f = n - Math.floor(n);
      let v = 3 + (n2 - n) * 3;
      if (f < 0.16) v = 1.2;
      else if (f < 0.3) v = 4.6;
      if (x === x0 + 4 || y === y0 + 4) v = 1.4;
      return S(v, x, y);
    });
  }

  // ------------------------------------------------- near layer: balustrade
  function buildNear() {
    const w = 1280, h = 430, OY = 144; // canvas y = screen y + OY
    const P = new Pix(w, h, true);
    const X = (u) => 640 + u, Y = (y) => y + OY;
    const rng = U.makeRng(4242);
    const sunU = SUN.x - W / 2;
    const side = (u) => (u < sunU ? 1 : -1);
    // plinth / base course along the whole layer
    stoneBox(P, 0, Y(275), w, Y(286), { base: 3.3, bw: 46, bh: 6, seed: 11, grad: 0.6 });
    P.rect(0, Y(271), w, 4, (x, y) => S(y === Y(271) ? 7.5 : y === Y(274) ? 1.2 : 4.6 + (hash(x, y, 2) - 0.5), x, y));
    // balusters and panels between the end pillars
    const gapA = 38, gapB = 106; // broken gap in the center span
    const baluster = (u, broken) => {
      const cx = X(u), top = Y(239), bot = Y(271), sd = side(u);
      const hgt = broken ? 3 + Math.floor(rng() * 12) : bot - top;
      for (let y = bot - hgt; y < bot; y++) {
        const t = (y - top) / (bot - top);
        let hw = t < 0.12 ? 3.4 : t < 0.2 ? 2.2 : t < 0.78 ? 2.4 + Math.sin(((t - 0.2) / 0.58) * Math.PI) * 1.5 : t < 0.86 ? 2.2 : 3.4;
        for (let x = Math.round(cx - hw); x < Math.round(cx + hw); x++) {
          const rel = (x + 0.5 - cx) / hw * sd;
          let v = 3.4 + rel * 1.9 + (t > 0.86 || t < 0.12 ? 0.4 : 0) - (t > 0.95 ? 0.8 : 0);
          if (rel > 0.75) v += 0.8;
          if (broken && y === bot - hgt) v = 7;
          P.put(x, y, S(v + (hash(x, y, 3) < 0.05 ? -1.2 : 0), x, y));
        }
      }
      // contact shadow on the plinth
      if (!broken) P.put(Math.round(cx + sd * 3), bot, STONE[2]);
    };
    for (let u = -452; u <= 452; u += 11) {
      if (u > 180 && u < 390) continue; // panel section
      if (Math.abs(Math.abs(u) - 180) < 9 || Math.abs(Math.abs(u) - 390) < 9) continue; // post spots
      baluster(u, u > gapA && u < gapB);
    }
    wavePanel(P, X(192), Y(240), X(286), Y(271), 21);
    wavePanel(P, X(292), Y(240), X(378), Y(271), 22);
    // top rail with a broken gap
    const railTop = Y(226), railBot = Y(239);
    const jag = (y) => Math.round(Math.sin(y * 1.9) * 2 + hash(y, 1, 5) * 3);
    for (const [a, b, ja, jb] of [[-458, gapA, false, true], [gapB, 458, true, false]]) {
      const x0 = X(a), x1 = X(b);
      P.rect(x0 - 4, railTop, x1 - x0 + 8, railBot - railTop, (x, y) => {
        if (jb && x > x1 + jag(y)) return 0;
        if (ja && x < x0 - jag(y + 7)) return 0;
        const ly = y - railTop;
        let v = 4.4 + (fbm(x * 0.2, y * 0.3, 8, 2) - 0.5) * 1.6;
        if (ly === 0) return mixp(S(8, x, y), RIM.hi, 0.55);
        if (ly === 1) v = 7.2;
        else if (ly === 2) v = 5.6;
        else if (ly === 3) v = 2.6; // lip shadow
        else if (ly >= 11) v -= 1.8;
        if ((x - x0) % 58 === 0 && ly > 2) v = 1.4;
        if ((jb && x >= x1 + jag(y) - 1) || (ja && x <= x0 - jag(y + 7) + 1)) v = 6.6; // fresh break
        if (hash(x, y, 31) < 0.03) v -= 1.3;
        return S(v, x, y);
      });
      // shadow under the rail onto the balusters
      for (let x = x0; x < x1; x++) for (let k = 0; k < 2; k++) P.put(x, railBot + k, (xx, yy, old) => (old >>> 24 ? mulp(old, 0.6 + k * 0.2) : 0));
    }
    // rubble in the gap
    for (let i = 0; i < 9; i++) {
      const rx = X(gapA + 6 + rng() * (gapB - gapA - 12)), ry = Y(270 - rng() * 3), rr = 1.5 + rng() * 3;
      P.ellipse(rx, ry, rr * 1.3, rr, (x, y) => S(y < ry - rr * 0.3 ? 7 : y > ry + rr * 0.3 ? 2 : 4.5, x, y));
    }
    // end pillars (stage edges) with ornate capitals and a broken lintel
    for (const sd of [-1, 1]) {
      const u = 480 * sd, cx = X(u), s2 = side(u);
      stoneBox(P, cx - 30, Y(254), cx + 30, Y(286), { base: 3.6, bw: 30, bh: 8, top: 0.5, seed: 50 + sd, sun: s2 });
      // fluted shaft
      P.rect(cx - 22, 0, 44, Y(254), (x, y) => {
        const lx = x - (cx - 22);
        const fl = lx % 7;
        let v = 3.6 + (fl === 0 ? -1.5 : fl === 1 ? 0.9 * s2 : fl === 6 ? -0.6 * s2 : 0);
        v += (s2 > 0 ? lx / 44 : 1 - lx / 44) * 1.4 - 0.5;
        v += (fbm(x * 0.15, y * 0.05, 60, 2) - 0.5) * 1.5;
        if (lx === (s2 > 0 ? 43 : 0)) return mixp(S(v + 2, x, y), RIM.mid, 0.4);
        if (hash(x, y, 61) < 0.02) v -= 1.3;
        return S(v, x, y);
      });
      for (const by of [196, 112]) stoneBox(P, cx - 25, Y(by), cx + 25, Y(by + 7), { base: 4.4, top: 0.45, seed: 70 + by, sun: s2 });
      // capital: stacked brackets with scroll ends
      const caps = [[26, 46, 52], [31, 38, 46], [36, 28, 38], [41, 20, 28]];
      for (const [hw, y0, y1] of caps) stoneBox(P, cx - hw, Y(y0), cx + hw, Y(y1), { base: 4.2, top: 0.55, seed: 80 + hw, sun: s2 });
      for (const k of [-1, 1]) {
        const sx = cx + k * 36, sy = Y(33);
        P.ellipse(sx, sy, 5, 5, (x, y) => {
          const a = Math.atan2(y + 0.5 - sy, x + 0.5 - sx) + Math.PI, r = hyp(x + 0.5 - sx, y + 0.5 - sy);
          const sp = (r - a * 0.8 + 20) % 2.6;
          return S(sp < 0.9 ? 1.6 : 5 - (y - sy) * 0.3, x, y);
        });
      }
      // broken lintel reaching toward the center (seen from below: dark face, lit lower lip)
      const lintel = (x, y) => {
        const ly = y - Y(-6);
        let v = 2.6 + (fbm(x * 0.2, y * 0.2, 90, 2) - 0.5) * 1.4;
        if (ly === 6 || ly === 15) v = 1.2; else if (ly === 7 || ly === 16) v += 1;
        if (ly >= 23) v = ly === 23 ? 5.6 : 1.4;
        if (ly > 7 && ly < 15 && (x % 12 === 0)) v = 1.3;
        return S(v, x, y);
      };
      const inner = cx - sd * 44, len = 64 + rng() * 24;
      const xa = sd > 0 ? inner - len : inner, xb = sd > 0 ? inner : inner + len;
      P.rect(xa, Y(-6), xb - xa, 26, (x, y) => {
        const dd = sd > 0 ? x - xa : xb - x; // distance from the broken end
        if (dd < jag(y) * 1.5 + 3) return 0;
        if (dd < jag(y) * 1.5 + 5) return S(5.6, x, y);
        return lintel(x, y);
      });
      P.rect(cx - 44, Y(-6), 88, 26, lintel);
      crackLine(P, cx - 10 * sd, Y(150), 60, Math.PI / 2 + 0.3 * sd, 300 + sd);
      crackLine(P, cx + 8 * sd, Y(60), 40, Math.PI / 2 - 0.2 * sd, 310 + sd);
    }
    // carved walls beyond the stage edge (u in [504, 776] wraps across the seam)
    const wx0 = X(505), wx1 = X(1600 * 0.8 - 505); // 1145 .. 1415 (wraps)
    stoneBox(P, wx0, Y(118), wx1, Y(286), { base: 3.4, bw: 38, bh: 12, seed: 120, grad: 1.2, top: 0 });
    drawRoof(P, (wx0 + wx1) / 2, Y(120), (wx1 - wx0) / 2 + 3, 12, 2, STONE, { ridge: 0.97, thick: 3, base: 2.2, rows: 2, rib: 3, orn: false });
    cloudRelief(P, X(516), Y(140), X(612), Y(250), 130);
    cloudRelief(P, X(668), Y(140), X(764), Y(250), 131);
    // round seal medallion between the panels
    const mx = X(640), my = Y(176);
    P.ellipse(mx, my, 18, 18, (x, y) => {
      const r = hyp(x + 0.5 - mx, y + 0.5 - my), a = Math.atan2(y + 0.5 - my, x + 0.5 - mx);
      let v = 4;
      if (r > 16.5) v = 1.4;
      else if (r > 15) v = 6;
      else if (r > 13.5 || (r < 9 && r > 7.6)) v = 1.6;
      else if (r < 13.5 && r > 9 && Math.abs(((a / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) < 0.1) v = 1.8;
      else if (r < 6 && Math.abs(Math.sin(a * 4)) * r < 1.2) v = 1.6;
      return S(v + (y < my ? 0.6 : 0), x, y);
    });
    // breach in the wall
    const hxc = X(700), hyc = Y(262);
    P.ellipse(hxc, hyc, 26, 22, (x, y) => {
      const n = fbm(x * 0.2, y * 0.2, 141, 2);
      const d = hyp((x + 0.5 - hxc) / 26, (y + 0.5 - hyc) / 22) + (n - 0.5) * 0.5;
      if (d > 1) return 0;
      if (d > 0.86) return S(6.4, x, y);
      return S(0.3 + (1 - d) * 0.6, x, y);
    });
    // shimenawa rope with paper streamers from pillar capital to the wall top
    for (const sd of [-1, 1]) {
      const ax = X(480 * sd) + sd * 40, ay = Y(36), bx = X(620 * sd), by = Y(116);
      let prev = null;
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, x = U.lerp(ax, bx, t), y = U.lerp(ay, by, t) + Math.sin(t * Math.PI) * 26;
        P.ellipse(x, y, 2.1, 2.1, (xx, yy) => rmp(VERM, (xx + yy) % 3 === 0 ? 1 : 3.2 - (yy - y) * 0.6, xx, yy));
        if (i % 8 === 4) {
          // zigzag paper shide
          for (let j = 0; j < 12; j++) {
            const zx = Math.round(x + ((j >> 2) % 2 ? 2 : 0)), zy = Math.round(y + 3 + j);
            P.put(zx, zy, j % 4 === 0 ? hx('#5a4038') : hx('#b08068'));
            P.put(zx + 1, zy, hx('#7a5448'));
          }
        }
        prev = [x, y];
      }
    }
    // cracks across rail and plinth
    for (let i = 0; i < 14; i++) crackLine(P, rng() * w, Y(230 + rng() * 50), 10 + rng() * 26, rng() * Math.PI, 400 + i);
    for (let i = 0; i < 8; i++) crackLine(P, X(505 + rng() * 260), Y(140 + rng() * 120), 20 + rng() * 30, rng() * Math.PI, 500 + i);
    rimPass(P, { sunX: X(sunU), top: RIM.hi, side: RIM.mid, kTop: 0.32, kSide: 0.22, fall: 700 });
    // ground contact darkening
    for (let y = Y(278); y < h; y++) for (let x = 0; x < w; x++) P.d[y * w + x] = mulp(P.d[y * w + x], 0.86 - (y - Y(278)) * 0.02);
    return { pix: P, ox: 320, oy: OY, s: SB, tile: true };
  }

  // ------------------------------------------------------ pre-warped floor
  const SW = 80, SD = 56; // paving slab size (world units)
  const FLOOR_SCAP = 1.3, FLOOR_SMAX = 1.6;
  function floorGeom() {
    const NR = Math.ceil(HY + EYE * FLOOR_SMAX - ROW0);
    const rs = new Float32Array(NR), rsr = new Float32Array(NR), rwid = new Float32Array(NR);
    for (let r = 0; r < NR; r++) {
      rs[r] = (ROW0 + r + 0.5 - HY) / EYE;
      rsr[r] = Math.min(rs[r], FLOOR_SCAP);
      rwid[r] = PER * rsr[r];
    }
    const TW = Math.ceil(PER * FLOOR_SCAP) + 2;
    const zLo = ZF / ((ROW0 + NR - 1 - HY) / EYE);
    return { NR, TW, rs, rsr, rwid, zLo, zBand: 2 * SD };
  }
  const EMB = { x: 0, z: ZF + 6, r: 150 };
  function buildFloor() {
    const G = floorGeom(), { NR, TW, rs, rsr, rwid } = G;
    const V = new Float32Array(TW * NR), T = new Uint8Array(TW * NR), B = new Float32Array(TW * NR);
    const rowOf = (Z) => Math.floor(HY + EYE * (ZF / Z) - ROW0);
    const texOf = (X, r) => { const w = rwid[r]; let i = (X + PER / 2) * rsr[r]; i = ((i % w) + w) % w; return Math.floor(i); };
    const rowZ = (r, f) => ZF / ((ROW0 + r + f - HY) / EYE);
    const rng = U.makeRng(9090);
    // base slabs
    for (let r = 0; r < NR; r++) {
      const s = rs[r], sr = rsr[r], wr = Math.ceil(rwid[r]);
      const Zc = rowZ(r, 0.5), Zf = rowZ(r, 0), Zn = rowZ(r, 1);
      const kc = Math.floor((ZB - Zc) / SD);
      const jointRow = Math.floor((ZB - Zf) / SD) !== Math.floor((ZB - Zn) / SD);
      const lipRow = r > 0 && !jointRow && Math.floor((ZB - rowZ(r - 1, 0)) / SD) !== Math.floor((ZB - Zf) / SD);
      const off = kc & 1 ? SW / 2 : 0;
      const light = U.clamp((1.03 - s) / 0.23, 0, 1) * 1.5 - Math.max(0, s - 1.02) * 2.4;
      for (let i = 0; i < wr; i++) {
        const X0 = i / sr - PER / 2, X1 = (i + 1) / sr - PER / 2, Xc = (i + 0.5) / sr - PER / 2;
        const m0 = Math.floor((X0 + off) / SW), m1 = Math.floor((X1 + off) / SW);
        const m = Math.floor((Xc + off) / SW);
        const mm = ((m % (PER / SW)) + PER / SW) % (PER / SW);
        const ex = Xc - EMB.x, ez = Zc - EMB.z, rho = hyp(ex, ez);
        const inEmb = rho < EMB.r + 3;
        let v = 4.7 + (hash(mm, kc, 11) - 0.5) * 1.2;
        const n = fbm((Xc + PER / 2) * 0.08, Zc * 0.08, 5, 3, PER * 0.08);
        v += (n - 0.5) * 2 + light;
        const hs = hash(i, r, 3);
        if (hs < 0.035) v -= 1.2; else if (hs > 0.98) v += 0.9;
        if (r < 8) v -= (8 - r) * 0.34;
        if (!inEmb) {
          const latJ = m0 !== m1;
          const dJ = Math.min(Math.abs(((Xc + off) % SW + SW) % SW), SW - Math.abs(((Xc + off) % SW + SW) % SW));
          if (jointRow || latJ) v = 1.4 + (n - 0.5) * 0.8;
          else {
            if (lipRow) v += 1.1;
            const fx = ((Xc + off) % SW + SW) % SW;
            if (fx * sr < 1.6) v += 0.7; // lit left edge of slab
            else if ((SW - fx) * sr < 1.6) v -= 0.5;
            // worn corners
            const fz = ((ZB - Zc) % SD + SD) % SD;
            if (dJ < 4 && (fz < 5 || fz > SD - 5) && hash(i, r, 17) < 0.6) v -= 1.1;
          }
        } else v -= 0.3;
        V[r * TW + i] = v;
      }
    }
    const plot = (X, Z, val) => {
      const r = rowOf(Z);
      if (r < 0 || r >= NR) return;
      const k = r * TW + texOf(X, r);
      if (T[k] !== 1 || val !== 3) T[k] = val;
    };
    const seg = (X0, Z0, X1, Z1, val) => {
      const n = Math.max(1, Math.ceil(hyp(X1 - X0, Z1 - Z0) / 0.4));
      for (let j = 0; j <= n; j++) plot(U.lerp(X0, X1, j / n), U.lerp(Z0, Z1, j / n), val);
    };
    const arc = (cx, cz, rad, val, a0 = 0, a1 = Math.PI * 2) => {
      const n = Math.ceil((rad * (a1 - a0)) / 0.4);
      for (let j = 0; j <= n; j++) { const a = a0 + ((a1 - a0) * j) / n; plot(cx + Math.cos(a) * rad, cz + Math.sin(a) * rad, val); }
    };
    const area = (x0, z0, x1, z1, fn) => {
      const r0 = Math.max(0, rowOf(z1)), r1 = Math.min(NR - 1, rowOf(z0));
      for (let r = r0; r <= r1; r++) {
        const Zc = rowZ(r, 0.5), i0 = Math.floor((x0 + PER / 2) * rsr[r]), i1 = Math.ceil((x1 + PER / 2) * rsr[r]);
        for (let ii = i0; ii <= i1; ii++) {
          const w = Math.ceil(rwid[r]), i = ((ii % w) + w) % w;
          fn(r * TW + i, ii / rsr[r] - PER / 2 + 0.5 / rsr[r], Zc, i, r);
        }
      }
    };
    // ---- the carved ward seal
    area(EMB.x - EMB.r - 4, EMB.z - EMB.r - 4, EMB.x + EMB.r + 4, EMB.z + EMB.r + 4, (k, Xc, Zc) => {
      const ex = Xc - EMB.x, ez = Zc - EMB.z, rho = hyp(ex, ez), th = Math.atan2(ez, ex);
      if (rho > EMB.r) return;
      if (rho > 118 && rho < 142) V[k] -= 1.1;
      const sp = Math.abs((((th / (Math.PI / 4)) % 1) + 1) % 1 - 0.5) * 2; // 0 at half-steps
      const star = U.lerp(56, 30, 1 - sp);
      if (rho < star && rho > 22) V[k] += 0.9;
      if (rho < 20) { B[k] = 0.85; V[k] -= 0.5; }
      if (rho > 60 && rho < 112) V[k] -= 0.35;
    });
    arc(EMB.x, EMB.z, 150, 2); arc(EMB.x, EMB.z, 147, 1); arc(EMB.x, EMB.z, 142, 1); arc(EMB.x, EMB.z, 118, 1);
    arc(EMB.x, EMB.z, 113, 2); arc(EMB.x, EMB.z, 60, 1); arc(EMB.x, EMB.z, 22, 1);
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4, b = a + Math.PI / 4, am = a + Math.PI / 8;
      seg(Math.cos(a) * 56, EMB.z + Math.sin(a) * 56, Math.cos(am) * 30, EMB.z + Math.sin(am) * 30, 1);
      seg(Math.cos(b) * 56, EMB.z + Math.sin(b) * 56, Math.cos(am) * 30, EMB.z + Math.sin(am) * 30, 1);
    }
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8 + Math.PI / 16;
      seg(Math.cos(a - 0.045) * 62, EMB.z + Math.sin(a - 0.045) * 62, Math.cos(a) * 111, EMB.z + Math.sin(a) * 111, 1);
      seg(Math.cos(a + 0.045) * 62, EMB.z + Math.sin(a + 0.045) * 62, Math.cos(a) * 111, EMB.z + Math.sin(a) * 111, 1);
    }
    // runes in the outer band: strokes on a small grid in (tangent, radial) space
    const NRU = 30;
    for (let k = 0; k < NRU; k++) {
      const a0 = (k / NRU) * Math.PI * 2;
      const pt = (gx, gy) => { const a = a0 + (gx - 1) * 0.034, rr = 122 + gy * 5.5; return [Math.cos(a) * rr, EMB.z + Math.sin(a) * rr]; };
      const strokes = 2 + Math.floor(hash(k, 1, 77) * 3);
      for (let s2 = 0; s2 < strokes; s2++) {
        const g = Math.floor(hash(k, s2, 78) * 12), g2 = Math.floor(hash(k, s2, 79) * 12);
        const A = pt(g % 3, Math.floor(g / 3)), Bp = pt(g2 % 3, Math.floor(g2 / 3));
        seg(A[0], A[1], Bp[0], Bp[1], 2);
      }
    }
    // ---- cracks (kept clear of the periodic front band)
    const crack = (x, z, ang, len, depth) => {
      for (let i = 0; i < len; i += 3) {
        ang += (rng() - 0.5) * 0.8;
        const nx = x + Math.cos(ang) * 3, nz = z + Math.sin(ang) * 3;
        if (nz < G.zLo + G.zBand + 10 || nz > ZB - 2) return;
        seg(x, z, nx, nz, 3);
        x = nx; z = nz;
        if (depth > 0 && rng() < 0.05) crack(x, z, ang + (rng() < 0.5 ? 0.9 : -0.9), len * 0.4, depth - 1);
      }
    };
    for (let i = 0; i < 22; i++) crack(-760 + rng() * 1520, 700 + rng() * 410, (rng() < 0.7 ? 0 : Math.PI / 2) + (rng() - 0.5) * 1.4 + (rng() < 0.5 ? Math.PI : 0), 60 + rng() * 200, 2);
    for (let i = 0; i < 6; i++) { const a = rng() * Math.PI * 2; crack(Math.cos(a) * 150, EMB.z + Math.sin(a) * 150, a, 60 + rng() * 80, 1); }
    // ---- old blood stains (metaballs)
    const stains = [[-150, 960, 26], [70, 1040, 15], [220, 840, 30], [-330, 870, 20], [390, 1080, 18], [-560, 990, 24], [600, 900, 16], [-40, 790, 12]];
    for (const [sx, sz, sr0] of stains) {
      const blobs = [];
      for (let j = 0; j < 6; j++) blobs.push([sx + (rng() - 0.5) * sr0 * 2.2, sz + (rng() - 0.5) * sr0 * 1.4, sr0 * (0.3 + rng() * 0.5)]);
      for (let j = 0; j < 8; j++) blobs.push([sx + (rng() - 0.5) * sr0 * 4.5, sz + (rng() - 0.5) * sr0 * 3, 1.5 + rng() * 2.5]);
      const ext = sr0 * 3;
      area(sx - ext, sz - ext, sx + ext, sz + ext, (k, Xc, Zc, i, r) => {
        let f = 0;
        for (const b of blobs) { const dx = Xc - b[0], dz = Zc - b[1]; f += (b[2] * b[2]) / (dx * dx + dz * dz + 0.01); }
        f += (vn(Xc * 0.2, Zc * 0.2, 13) - 0.5) * 0.5;
        if (f < 0.9) return;
        B[k] = Math.max(B[k], f < 1.15 ? 1 : 0.75);
        if (f < 1.15) V[k] -= 0.6;
      });
    }
    // ---- sunken broken slabs
    for (const [kk, mm] of [[2, 3], [4, 13], [1, 9], [6, 17], [3, 6]]) {
      const zf = ZB - kk * SD, zn = zf - SD;
      const off = kk & 1 ? SW / 2 : 0, x0 = mm * SW - off - PER / 2;
      if (zn < G.zLo + G.zBand) continue;
      area(x0, zn, x0 + SW, zf, (k, Xc, Zc) => {
        const e = Math.min(Xc - x0, x0 + SW - Xc, Zc - zn, zf - Zc);
        if (e < 1.5) return;
        V[k] -= 1.7 + (vn(Xc * 0.3, Zc * 0.3, 5) - 0.5);
        if (e < 5 && vn(Xc * 0.5, Zc * 0.5, 6) > 0.55) V[k] -= 0.8;
      });
    }
    // ---- shading for carved grooves and cracks (lit near lip, dark far side)
    const Vb = V.slice();
    for (let r = 0; r < NR; r++) for (let i = 0; i < TW; i++) {
      const k = r * TW + i;
      if (T[k]) continue;
      if (r > 0 && T[k - TW]) V[k] = Vb[k] + (T[k - TW] === 3 ? 0.9 : 1.5);
      else if (r < NR - 1 && T[k + TW]) V[k] = Vb[k] - 0.6;
    }
    // ---- pebbles and rubble (3D-ish blobs: lit top, shadow below)
    const pebble = (X, Z, sz) => {
      const r = rowOf(Z);
      if (r < 1 || r >= NR - 2) return;
      const i0 = texOf(X, r), ws = Math.max(1, Math.round(sz * rsr[r]));
      for (let q = 0; q < ws; q++) {
        const i = (i0 + q) % Math.ceil(rwid[r]);
        V[(r - 1) * TW + i] = 7.6; V[r * TW + i] = 5; V[(r + 1) * TW + i] = 1.2;
        T[(r - 1) * TW + i] = 0; T[r * TW + i] = 0;
      }
    };
    for (let i = 0; i < 260; i++) pebble(-800 + rng() * 1600, G.zLo + G.zBand + 20 + rng() * (ZB - G.zLo - G.zBand - 24), 1 + rng() * 2.5);
    for (let i = 0; i < 40; i++) pebble(45 + rng() * 85, ZB - 4 - rng() * 70, 1.5 + rng() * 4); // below the broken rail
    for (const sd of [-1, 1]) for (let i = 0; i < 26; i++) pebble(sd * (600 + (rng() - 0.5) * 80), ZB - 3 - rng() * 60, 1.5 + rng() * 4);
    // ---- compose
    const P = new Pix(TW, NR);
    for (let r = 0; r < NR; r++) for (let i = 0; i < TW; i++) {
      const k = r * TW + i;
      let c;
      if (T[k] === 1) c = FLOOR[1];
      else if (T[k] === 2) c = BLOOD[2];
      else if (T[k] === 3) c = FLOOR[0];
      else c = rmp(FLOOR, V[k], i, r);
      if (B[k] > 0) c = mixp(c, rmp(BLOOD, 1.2 + V[k] * 0.42, i, r), B[k]);
      P.d[k] = c;
    }
    G.pix = P;
    return G;
  }

  // ------------------------------------------------------------ prop art
  // Sphere-ish shading for carved round forms (light from above / sun side).
  const sph = (cx, cy, r, base, amt, sun) => (x, y) => {
    const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r;
    return S(base + (nx * 0.55 * sun - ny * 0.75) * amt + (hash(x, y, 5) < 0.05 ? -0.8 : 0), x, y);
  };
  const BONE = ramp(['#1a0e0c', '#2c1c18', '#463026', '#664a3a', '#8a6c56', '#ad9078', '#cdb59a', '#e8d6bc']);
  function komainuHead(P, cx, by, face, sun) {
    const cy = by - 12;
    P.ellipse(cx, cy, 13, 12, sph(cx, cy - 3, 13, 3.4, 2.6, sun));
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (0.9 + i * 0.12);
      const ox = cx + Math.cos(a) * 11.5, oy = cy + Math.sin(a) * 10.5;
      P.ellipse(ox, oy, 3.4, 3.2, sph(ox, oy - 0.8, 3.4, 4.2, 2.8, sun));
      P.put(Math.round(ox - 0.5 + 0.5 * sun), Math.round(oy - 0.5), STONE[2]);
    }
    for (let i = -2; i <= 2; i++) {
      const ox = cx + i * 5 + face, oy = by - 3;
      P.ellipse(ox, oy, 3, 3, sph(ox, oy - 1, 3, 3.2, 2.4, sun));
      P.put(Math.round(ox - 0.5), Math.round(oy - 0.5), STONE[2]);
    }
    const fx = Math.round(cx + face * 2);
    P.ellipse(fx, cy + 2, 8, 7.5, sph(fx, cy - 1, 9, 4.4, 2.4, sun));
    // ears
    for (const e of [-1, 1]) P.ellipse(fx + e * 9, cy - 4, 2.5, 2, sph(fx + e * 9, cy - 5, 2.5, 4, 2, sun));
    // brow
    P.rect(fx - 7, cy - 4, 14, 2, (x, y) => S(y === cy - 4 ? 7.5 : 5, x, y));
    P.put(fx, cy - 2, STONE[2]); P.put(fx, cy - 3, STONE[3]);
    // eyes: deep sockets with a faint ember glint
    for (const e of [-1, 1]) {
      const ex = fx + e * 4;
      P.rect(ex - 2, cy - 2, 3, 2, STONE[0]);
      P.put(ex - 1 + (e > 0 ? 0 : 0), cy - 2, hx('#d8582a'));
      P.put(ex - 2, cy, STONE[3]); P.put(ex, cy, STONE[3]);
    }
    // nose
    P.rect(fx - 3, cy, 6, 3, (x, y) => S(y === cy ? 7.6 : 5.6, x, y));
    P.put(fx - 2, cy + 2, STONE[0]); P.put(fx + 1, cy + 2, STONE[0]);
    // snarling mouth with fangs
    P.ellipse(fx, cy + 6.5, 6, 2.6, STONE[0]);
    P.rect(fx - 5, cy + 6, 10, 1, hx('#2a0a0c'));
    for (const t of [-4, 3]) { P.put(fx + t, cy + 5, BONE[6]); P.put(fx + t, cy + 6, BONE[5]); P.put(fx + t, cy + 7, BONE[4]); }
    for (const t of [-2, 1]) { P.put(fx + t, cy + 8, BONE[5]); P.put(fx + t, cy + 7, BONE[4]); }
    P.rect(fx - 5, cy + 9, 10, 1, (x, y) => S(6.5, x, y));
  }

  function propLantern() {
    const w = 46, h = 94, cx = 23, P = new Pix(w, h), sun = 1;
    stoneBox(P, cx - 17, h - 9, cx + 17, h, { base: 3.6, top: 0.6, seed: 201, sun });
    stoneBox(P, cx - 13, h - 15, cx + 13, h - 9, { base: 4, top: 0.5, seed: 202, sun });
    // pole (cylindrical shading) with a node ring
    P.rect(cx - 5, 46, 10, h - 15 - 46, (x, y) => S(3 + ((x + 0.5 - cx) / 5) * 1.8 * sun + (hash(x, y, 9) < 0.06 ? -1 : 0), x, y));
    P.rect(cx - 6, 61, 12, 3, (x, y) => S(y === 61 ? 7 : 4.4 + ((x - cx) / 6) * sun, x, y));
    // platform with lotus scallops
    stoneBox(P, cx - 15, 38, cx + 15, 46, { base: 4, top: 0.6, seed: 203, sun });
    for (let i = -14; i < 15; i += 4) P.ellipse(cx + i + 1.5, 45, 2, 1.6, sph(cx + i + 1.5, 44, 2, 4.4, 2, sun));
    // fire box with a glowing window
    stoneBox(P, cx - 10, 22, cx + 10, 38, { base: 3.8, seed: 204, sun });
    P.rect(cx - 5, 26, 10, 9, (x, y) => {
      const d = hyp(x + 0.5 - cx, (y + 0.5 - 31) * 1.2) / 6;
      if (d < 0.35) return hx('#ffe0a0');
      if (d < 0.6) return rmp([hx('#ffb050'), hx('#ff8a30')], (0.6 - d) * 4, x, y);
      return rmp([hx('#3a0c0a'), hx('#a8381a'), hx('#e06022')], (1 - d) * 3, x, y);
    });
    P.rect(cx - 1, 26, 2, 9, STONE[2]); // window mullion
    // roof with curled corners
    P.poly(roofPts(cx, 22, 21, 11, 4, 0.12, 3), (x, y) => S(y > 19 ? 2 : y < 13 ? 6 : 4.4 + ((x + 0.5 - cx) / 21) * sun * 1.2, x, y));
    for (const e of [-1, 1]) { P.put(cx + e * 22 - (e > 0 ? 1 : 0), 14, STONE[6]); P.put(cx + e * 22 - (e > 0 ? 1 : 0), 13, STONE[7]); }
    // jewel finial
    P.ellipse(cx, 7, 4.2, 3.6, sph(cx, 6, 4.2, 4.6, 2.6, sun));
    P.rect(cx - 1, 1, 2, 3, (x, y) => S(5.5 + (x - cx + 0.5) * sun, x, y));
    P.rect(cx - 4, 10, 8, 1, STONE[3]);
    return { pix: P, w, h, ax: cx, breakY: 47, hp: 70, glow: [cx, 31] };
  }
  function propPost(tall) {
    const w = 40, bodyH = tall ? 120 : 90, h = bodyH + 34, cx = 20, P = new Pix(w, h), sun = 1;
    const top = h - bodyH;
    stoneBox(P, cx - 13, top, cx + 13, h, { base: 3.8, bh: tall ? 30 : 22, bw: 26, seed: tall ? 211 : 210, sun, rimSide: 0.25 });
    // recessed carved panel with a flame / cloud motif
    const p0 = top + 10, p1 = h - 22;
    P.rect(cx - 8, p0, 16, p1 - p0, (x, y) => {
      if (x === cx - 8 || y === p0) return STONE[1];
      if (x === cx + 7 || y === p1 - 1) return STONE[5];
      const yy = (y - p0) / (p1 - p0);
      const wv = Math.sin(yy * Math.PI * 5 + (x - cx) * 0.2) * 3;
      const c = Math.abs(x + 0.5 - cx - wv);
      return S(c < 1 ? 1.4 : c < 2 ? 5.2 : 2.8, x, y);
    });
    if (tall) for (const by of [top + 4, h - 16]) stoneBox(P, cx - 15, by, cx + 15, by + 5, { base: 4.5, top: 0.4, seed: 215 + by, sun });
    stoneBox(P, cx - 17, top - 6, cx + 17, top, { base: 4.6, top: 0.7, seed: 212, sun });
    stoneBox(P, cx - 14, top - 9, cx + 14, top - 6, { base: 4.2, top: 0.4, seed: 213, sun });
    komainuHead(P, cx, top - 9, 0, sun);
    return { pix: P, w, h, ax: cx, breakY: top + (tall ? 50 : 34), hp: tall ? 150 : 120 };
  }
  function propStatue() {
    const w = 66, h = 104, cx = 33, P = new Pix(w, h), sun = 1;
    // pedestal with molding
    stoneBox(P, cx - 25, h - 10, cx + 25, h, { base: 3.4, top: 0.5, seed: 221, sun });
    stoneBox(P, cx - 20, h - 40, cx + 20, h - 10, { base: 3.6, seed: 222, sun, bh: 15, bw: 40 });
    stoneBox(P, cx - 23, h - 46, cx + 23, h - 40, { base: 4.4, top: 0.6, seed: 223, sun });
    const by = h - 46; // statue base line
    // seated lion: haunch, chest, front legs, tail curl, head
    P.ellipse(cx - 6, by - 12, 14, 12, sph(cx - 8, by - 18, 14, 3.4, 2.4, sun)); // haunch
    for (let i = 0; i < 4; i++) { const ox = cx - 18 + i * 1.5, oy = by - 26 - i * 4; P.ellipse(ox, oy, 4, 3.5, sph(ox, oy - 1, 4, 4.2, 2.6, sun)); P.put(Math.round(ox), Math.round(oy), STONE[2]); }
    P.ellipse(cx + 6, by - 22, 9, 13, sph(cx + 4, by - 28, 10, 3.8, 2.4, sun)); // chest
    P.rect(cx + 4, by - 16, 5, 16, (x, y) => S(3.6 + ((x - cx - 6) / 3) * sun, x, y)); // front legs
    P.rect(cx + 11, by - 16, 5, 16, (x, y) => S(3.2 + ((x - cx - 13) / 3) * sun, x, y));
    for (const lx of [cx + 4, cx + 11]) P.ellipse(lx + 2.5, by - 1.5, 3.5, 2, sph(lx + 2.5, by - 3, 3.5, 4.6, 2, sun));
    P.ellipse(cx - 2, by - 3, 6, 3, sph(cx - 2, by - 5, 6, 4, 2, sun)); // hind paw
    komainuHead(P, cx + 8, by - 30, 1, sun);
    return { pix: P, w, h, ax: cx, breakY: by - 2, hp: 140 };
  }
  function propWall() {
    const w = 80, h = 82, P = new Pix(w, h), sun = 1;
    stoneBox(P, 4, 16, 74, h, { base: 3.6, bw: 22, bh: 11, seed: 231, sun, grad: 0.8 });
    drawRoof(P, 39, 17, 38, 9, 2, STONE, { ridge: 0.95, thick: 2.5, base: 2.4, rows: 2, rib: 3, orn: false });
    // broken right end
    for (let y = 0; y < h; y++) {
      const e = 74 - Math.round(Math.abs(Math.sin(y * 0.37)) * 7 + (y < 30 ? (30 - y) * 0.5 : 0) + hash(y, 1, 232) * 3);
      for (let x = e; x < w; x++) P.d[y * w + x] = 0;
      if (P.a(e - 1, y) && y % 2) P.put(e - 1, y, (xx, yy, o) => mixp(o, RIM.lo, 0.3));
    }
    wavePanel(P, 12, 36, 50, 66, 233);
    crackLine(P, 20, 70, 30, -1.2, 234);
    return { pix: P, w, h, ax: 39, breakY: 50, hp: 100 };
  }
  function propTorii() {
    const w = 156, h = 158, P = new Pix(w, h);
    torii(P, 78, h - 8, 62, h - 16, ramp(['#140507', '#1d070a', '#28090c', '#350d0e', '#441210', '#551813', '#682016']), {});
    for (const px of [33, 123]) stoneBox(P, px - 6, h - 12, px + 7, h, { base: 2.6, top: 0.5, seed: 241 + px });
    // weathering: exposed dark wood patches, cracks
    for (let i = 0; i < 160; i++) {
      const x = Math.floor(hash(i, 1, 242) * w), y = Math.floor(hash(i, 2, 242) * h);
      if (P.a(x, y) > 200 && hash(i, 3, 242) < 0.6) P.ellipse(x, y, 1 + hash(i, 4, 242) * 2, 1, (xx, yy, o) => (o >>> 24 ? mixp(o, STONE[2], 0.6) : 0));
    }
    // plaque
    P.rect(73, 22, 10, 16, (x, y) => (x === 73 || x === 82 || y === 22 || y === 37 ? VERM[0] : STONE[2]));
    for (let j = 0; j < 4; j++) P.put(77 + (j % 2), 25 + j * 3, hx('#8a6a3a'));
    return { pix: P, w, h, ax: 78, breakY: 76, hp: 160 };
  }
  function propJizo() {
    const w = 74, h = 46, P = new Pix(w, h), sun = 1;
    stoneBox(P, 1, h - 8, w - 1, h, { base: 3.4, top: 0.5, seed: 251, bw: 24, bh: 8, sun });
    for (let k = 0; k < 3; k++) {
      const cx = 14 + k * 23, by = h - 8, sc = k === 1 ? 1.1 : 0.92;
      P.ellipse(cx, by - 10 * sc, 8 * sc, 11 * sc, sph(cx - 1, by - 16 * sc, 9 * sc, 3.8, 2.4, sun)); // robe
      P.rect(cx - 8 * sc, by - 4, 16 * sc, 4, (x, y) => S(3, x, y));
      P.ellipse(cx, by - 23 * sc, 5 * sc, 5.2 * sc, sph(cx - 1, by - 25 * sc, 5 * sc, 4.6, 2.6, sun)); // head
      // faded red bib
      P.poly([cx - 6 * sc, by - 18 * sc, cx + 6 * sc, by - 18 * sc, cx, by - 10 * sc], (x, y) => rmp(VERM, 3.6 - (y - (by - 18 * sc)) * 0.25 + (hash(x, y, 7) < 0.15 ? -1 : 0), x, y));
      P.put(Math.round(cx), Math.round(by - 13 * sc), S(7, 0, 0));
      P.put(Math.round(cx - 2), Math.round(by - 23 * sc), STONE[1]); P.put(Math.round(cx + 1), Math.round(by - 23 * sc), STONE[1]);
    }
    return { pix: P, w, h, ax: 37, breakY: Math.round(h - 8 - 18), hp: 40 };
  }
  function propStele() {
    const w = 32, h = 62, cx = 16, P = new Pix(w, h), sun = 1;
    stoneBox(P, cx - 14, h - 10, cx + 14, h, { base: 3.4, top: 0.6, seed: 261, sun });
    P.rect(cx - 10, 8, 20, h - 18, (x, y) => S(3.8 + ((x + 0.5 - cx) / 10) * 1.2 * sun + (fbm(x * 0.3, y * 0.3, 262, 2) - 0.5) * 1.4, x, y));
    P.ellipse(cx, 9, 10, 5, (x, y) => S(5 + ((x - cx) / 10) * sun - (y - 9) * 0.2, x, y));
    for (let j = 0; j < 9; j++) {
      const y = 14 + j * 4, k = hash(j, 0, 263);
      P.rect(cx - 3, y, k < 0.5 ? 6 : 3, 1, STONE[1]);
      P.put(cx - 3 + Math.floor(k * 6), y + 1, STONE[1]);
      P.put(cx - 3, y + 2, STONE[6]);
    }
    crackLine(P, cx + 3, 20, 26, 1.7, 264);
    return { pix: P, w, h, ax: cx, breakY: 30, hp: 50 };
  }
  // Derive cracked / broken / falling-top images from an intact template.
  function finishProp(T, sd) {
    const P0 = T.pix, w = T.w, h = T.h;
    rimPass(P0, { sunX: 9999, top: RIM.hi, side: RIM.mid, kTop: 0.28, kSide: 0.14 });
    const P1 = P0.clone();
    const rng = U.makeRng(sd);
    for (let i = 0; i < 4; i++) {
      let x = w * (0.25 + rng() * 0.5), y = h * (0.2 + rng() * 0.6);
      while (P1.a(Math.round(x), Math.round(y)) < 200 && y < h - 2) y += 2;
      crackLine(P1, x, y, 12 + rng() * 22, rng() * Math.PI * 2, sd + i);
    }
    // chip a few chunks off the silhouette edge
    for (let i = 0; i < 3; i++) {
      const y = Math.floor(rng() * h * 0.8), x0 = rng() < 0.5;
      for (let x = 0; x < w; x++) {
        const xx = x0 ? x : w - 1 - x;
        if (P1.a(xx, y) > 200) { P1.ellipse(xx + (x0 ? 0 : 1), y, 2.5, 2, 0); break; }
      }
    }
    const jag = new Int16Array(w);
    for (let x = 0; x < w; x++) jag[x] = Math.round(T.breakY + Math.sin(x * 0.9 + sd) * 2 + (hash(x, 1, sd) - 0.5) * 5 + (x / w - 0.5) * 6);
    const P2 = new Pix(w, h), top = new Pix(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = P1.d[y * w + x];
      if (!(c >>> 24)) continue;
      if (y > jag[x]) P2.d[y * w + x] = c; else top.d[y * w + x] = c;
    }
    for (let x = 0; x < w; x++) {
      const y = jag[x] + 1;
      if (P2.a(x, y) > 200) { P2.put(x, y, mixp(STONE[7], RIM.hi, 0.3)); if (P2.a(x, y + 1) > 200) P2.put(x, y + 1, STONE[5]); }
      if (top.a(x, y - 1) > 200) top.put(x, y - 1, STONE[1]);
    }
    // rubble at the stump's foot
    for (let i = 0; i < 5; i++) {
      const rx = w * 0.15 + rng() * w * 0.7, ry = h - 1.5 - rng() * 2, rr = 1.2 + rng() * 2.2;
      P2.ellipse(rx, ry, rr * 1.3, rr, (x, y) => S(y < ry - rr * 0.3 ? 6.5 : 3.5, x, y));
    }
    T.states = [P0, P1, P2];
    T.top = top;
    let tTop = h, tBot = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (top.d[y * w + x] >>> 24) { if (y < tTop) tTop = y; if (y > tBot) tBot = y; }
    T.topBox = [tTop, tBot];
    return T;
  }
  const PROP_KINDS = {
    lantern: () => finishProp(propLantern(), 301),
    post: () => finishProp(propPost(false), 302),
    pillar: () => finishProp(propPost(true), 303),
    statue: () => finishProp(propStatue(), 304),
    wall: () => finishProp(propWall(), 305),
    torii: () => finishProp(propTorii(), 306),
    jizo: () => finishProp(propJizo(), 307),
    stele: () => finishProp(propStele(), 308),
  };
  // Layout: world x, depth s, mirrored (lit from the left), kind.
  const PROP_LAYOUT = [
    ['statue', -590, 0.86, 0], ['wall', -455, 0.84, 0], ['post', -487.5, SB, 0], ['lantern', -262, 0.86, 0],
    ['post', -225, SB, 0], ['jizo', -160, 0.9, 0], ['stele', 172, 0.9, 1], ['post', 225, SB, 1],
    ['lantern', 262, 0.86, 1], ['post', 487.5, SB, 1], ['torii', 455, 0.83, 1], ['pillar', 590, 0.86, 1],
  ];

  // --------------------------------------------------------------- sprites
  function spriteRocks() {
    const out = [];
    const sizes = [2, 3, 4, 6, 8, 11];
    for (let si = 0; si < sizes.length; si++) {
      const row = [];
      for (let v = 0; v < 4; v++) {
        const sz = sizes[si], n = sz + 3, P = new Pix(n, n), c = n / 2, pts = [];
        const k = 5 + (v % 3);
        for (let i = 0; i < k; i++) {
          const a = (i / k) * Math.PI * 2 + v, r = (sz / 2) * (0.65 + hash(si, v * 9 + i, 401) * 0.45);
          pts.push(c + Math.cos(a) * r, c + Math.sin(a) * r * 0.85);
        }
        P.poly(pts, (x, y) => S(sz < 3 ? 6.5 : 4.6 + (c - y) * (6 / sz) + (x - c) * 0.3 + (hash(x, y, v) < 0.15 ? -1.2 : 0), x, y));
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (P.a(x, y) && !P.a(x, y - 1)) P.put(x, y, (xx, yy, o) => mixp(o, RIM.hi, sz < 3 ? 0.35 : 0.5));
        if (sz >= 3) outlinePass(P, STONE[0]);
        row.push(P);
      }
      out.push(row);
    }
    return out;
  }
  function spritePuff(r, R, sd) {
    const n = Math.ceil(r * 2 + 2), P = new Pix(n, n), c = n / 2;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, d = hyp(dx, dy) / r;
      const nn = fbm(x * 0.22, y * 0.22, sd, 2);
      const e = d + (nn - 0.5) * 0.55;
      if (e > 1) continue;
      if (e > 0.8 && bay(x, y) > (1 - e) * 4) continue;
      const l = (-dy / r) * 0.9 + (dx / r) * 0.25 + (nn - 0.5) * 1.4;
      P.d[y * n + x] = rmp(R, 1.2 + l * 1.4 + (1 - d) * 0.6, x, y);
    }
    return P;
  }
  function spriteFlame(fr, w, h, sd) {
    const P = new Pix(w, h), FL = ramp(['#3a0806', '#7a1408', '#c0300c', '#ee5a14', '#ff8a24', '#ffbc48', '#ffe690', '#fffbe0']);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ny = y / h, nx = (x + 0.5 - w / 2) / (w / 2);
      const n = fbm(x * 0.3, y * 0.2 + fr * 0.8, sd, 3);
      const sway = Math.sin(ny * 5 + fr * 0.8) * 0.2 * (1 - ny);
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, ny * 1.15)), 0.7) * (0.55 + n * 0.7) * (ny > 0.15 ? 1 : ny / 0.15);
      const d = Math.abs(nx - sway) / Math.max(0.01, env);
      if (d > 1) continue;
      const it = (1 - d) * 2 + ny * 4 + n * 1.5 - 0.6;
      if (it < 0.6 && bay(x, y) < 0.5) continue;
      P.d[y * w + x] = rmp(FL, it, x, y);
    }
    return P;
  }
  function spriteGlow(r, col, k = 1) {
    const n = r * 2, P = new Pix(n, n), c = U.hex(col);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const d = hyp(x + 0.5 - r, y + 0.5 - r) / r;
      if (d >= 1) continue;
      const a = Math.pow(1 - d, 1.8) * k;
      const lv = Math.floor(a * 6 + bay(x, y)) / 6;
      if (lv <= 0) continue;
      P.d[y * n + x] = U.pack(c[0] * lv, c[1] * lv, c[2] * lv, 255);
    }
    return P;
  }

  // ------------------------------------------------------- Unlimited Void
  const VOIDR = ramp(['#010103', '#03030a', '#060714', '#0a0c22', '#101536', '#18204c', '#222c66', '#2e3c84', '#3e52a6',
    '#5470c8', '#7a98e4', '#a8c4f6', '#dceaff', '#ffffff']);
  const VPUR = ramp(['#020104', '#07040f', '#0e081c', '#170c2c', '#22103e', '#2e1452', '#3c1a68', '#4e2282', '#6a32a0', '#8a4cc0', '#b07ae0']);
  const VCX = 320, VCY = 104; // default screen position of the singularity
  function buildVoid() {
    const w = 720, h = 420, ox = 40, oy = 30;
    const P = new Pix(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = x - ox, sy = y - oy, dx = (sx - VCX) * 0.8, dy = sy - VCY;
      const d = hyp(dx, dy);
      const n = fbm(sx * 0.009, sy * 0.014, 501, 4), n2 = fbm(sx * 0.006 + 9, sy * 0.01, 502, 3);
      let v = 0.4 + 3.4 * Math.exp(-d / 170) + 1.4 * Math.exp(-d / 60) + Math.max(0, n - 0.42) * 7;
      const purple = n2 > 0.52;
      let c = purple ? rmp(VPUR, v * 0.95, x, y) : rmp(VOIDR, v, x, y);
      const hs = hash(x, y, 503);
      if (hs < 0.0035) c = hs < 0.0012 ? VOIDR[13] : hs < 0.0024 ? VOIDR[11] : VPUR[10];
      P.d[y * w + x] = c;
    }
    // a few bright cross stars
    const rng = U.makeRng(504);
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(rng() * w), y = Math.floor(rng() * h), big = rng() < 0.3;
      P.put(x, y, VOIDR[13]);
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { P.put(x + a, y + b, VOIDR[11]); if (big) P.put(x + a * 2, y + b * 2, VOIDR[8]); }
    }
    return { pix: P, ox, oy };
  }
  function buildVoidStars(sd, dens, bright) {
    const w = 1024, h = 420, P = new Pix(w, h, true);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const hs = hash(x, y, sd);
      if (hs < dens) P.d[y * w + x] = hs < dens * 0.3 ? VOIDR[13] : hs < dens * 0.6 ? VOIDR[11] : VPUR[9];
    }
    const rng = U.makeRng(sd);
    for (let i = 0; i < bright; i++) {
      const x = Math.floor(rng() * w), y = Math.floor(rng() * h);
      P.put(x, y, VOIDR[13]); P.put(x + 1, y, VOIDR[12]); P.put(x, y + 1, VOIDR[12]); P.put(x + 1, y + 1, VOIDR[11]);
      for (const [a, b] of [[-1, 0], [2, 0], [0, -1], [0, 2]]) P.put(x + a, y + b, VOIDR[9]);
    }
    return P;
  }
  function buildGalaxy() {
    const n = 440, c = n / 2, P = new Pix(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, r = hyp(dx, dy), a = Math.atan2(dy, dx);
      if (r > c) continue;
      const ph = a * 2 - Math.log(r + 4) * 5.2;
      const arm = Math.pow(0.5 + 0.5 * Math.cos(ph), 2.6);
      const nn = fbm(x * 0.03, y * 0.03, 511, 3);
      const edge = Math.max(0, 1 - r / c);
      let b = Math.exp(-r / 26) * 6 + Math.pow(edge, 1.3) * (arm * 7 + 1.1) * (0.55 + nn * 0.9) + (nn > 0.62 ? 1.5 * edge : 0);
      if (b < 0.4) continue;
      P.d[y * n + x] = arm > 0.5 && r > 40 && nn > 0.5 ? rmp(VPUR, b * 1.2, x, y) : rmp(VOIDR, b + 1, x, y);
    }
    return P;
  }
  function buildHole() {
    const w = 440, h = 210, cx = w / 2, cy = h / 2, P = new Pix(w, h), RS = 38;
    const hot = (b, x, y) => rmp(VOIDR, 5.4 + b * 8, x, y);
    // lensed halo around the shadow (brighter above and below)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = hyp(dx, dy);
      if (r < RS - 1 || r > RS + 28) continue;
      const vert = Math.abs(dy) / r, a = Math.atan2(dy, dx);
      const tb = 0.8 + 0.4 * fbm(Math.cos(a) * 3 + 5, Math.sin(a) * 3 + r * 0.08, 513, 2);
      const b = Math.pow(1 - (r - RS) / 28, 2.2) * (0.3 + vert * 0.85) * tb;
      if (r < RS + 3) P.d[y * w + x] = r < RS + 1.5 ? VOIDR[13] : VOIDR[12];
      else if (b > 0.07 || (b > 0.03 && bay(x, y) < 0.5)) P.d[y * w + x] = hot(b, x, y);
    }
    P.ellipse(cx, cy, RS - 0.5, RS - 0.5, VOIDR[0]);
    // accretion disk (its near half crosses in front of the shadow)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) / 0.16, r = hyp(dx, dy);
      if (r < 46 || r > 214) continue;
      if (y + 0.5 <= cy && hyp(x + 0.5 - cx, y + 0.5 - cy) < RS) continue;
      const a = Math.atan2(dy, dx);
      const dop = 1 + 0.45 * Math.cos(a + Math.PI); // approaching side brighter
      const streak = fbm(r * 0.045 + Math.cos(a) * 1.5, Math.sin(a) * 1.5 + 7, 512, 3);
      let b = Math.pow(1 - (r - 46) / 168, 1.5) * dop * (0.62 + 0.75 * streak);
      if (r < 54) b *= 1.35;
      if (b < 0.06 || (b < 0.12 && bay(x, y) > (b - 0.06) * 16)) continue;
      P.d[y * w + x] = hot(b, x, y);
    }
    return P;
  }

  // --------------------------------------------------- Malevolent Shrine
  const SHW = ramp(['#060102', '#0d0204', '#150406', '#1f0709', '#2a0a0c', '#380e10', '#481415', '#5c1a18']);
  const SHR = ramp(['#050102', '#0c0304', '#150506', '#1f0809', '#2b0b0c', '#391011', '#4a1516', '#5e1c1b']);
  const MAW = ramp(['#070000', '#170001', '#2c0202', '#470404', '#6a0606', '#940c08', '#c4180c', '#f03416', '#ff6a30', '#ffa060']);
  const SKYR = ramp(['#020001', '#060102', '#0c0203', '#140305', '#1e0507', '#2a0709', '#380a0c', '#4a0e0f', '#601412', '#7a1c16']);
  const RED_RIM = hx('#ff3a24'), RED_RIM2 = hx('#b01414');
  function buildShrineSky() {
    const w = 720, h = 420, ox = 40, oy = 30, P = new Pix(w, h);
    const MX = 526, MY = 50, MR = 30;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = x - ox, sy = y - oy;
      const tv = U.clamp((sy + 30) / (HY + 50), 0, 1.3);
      let v = 0.3 + Math.pow(tv, 1.8) * 6.4;
      const n = fbm(sx * 0.008, sy * 0.05, 521, 4);
      if (n > 0.55) v += (n - 0.55) * 9 * (0.4 + tv);
      const dm = hyp(sx - MX, sy - MY);
      v += 2.4 * Math.exp(-dm / 50);
      let c = rmp(SKYR, v, x, y);
      if (dm < MR) {
        const m = fbm(sx * 0.12, sy * 0.12, 522, 3);
        const lv = 3.4 + (1 - dm / MR) * 2 - (m > 0.55 ? 1.6 : 0) - ((sx - MX) / MR) * 0.8;
        c = rmp(MAW, lv, x, y);
      }
      P.d[y * w + x] = c;
    }
    return { pix: P, ox, oy };
  }
  function buildShrineMountains() {
    const w = 1024, h = 130, P = new Pix(w, h, true), base = 104;
    for (let x = 0; x < w; x++) {
      const t = (x / w) * 6;
      const m = fbm(t, 0.3, 531, 4, 6);
      const ridge = Math.abs(fbm(t * 2.5, 2.1, 532, 3, 15) - 0.5) * 2;
      const top = Math.round(base - 18 - m * 60 - ridge * 22);
      for (let y = Math.max(0, top); y < h; y++) P.d[y * w + x] = rmp(SHR, 1.4 + (y < top + 2 ? 1.5 : 0) + (fbm(x * 0.1, y * 0.1, 533, 2) - 0.5) * 1.2, x, y);
    }
    rimPass(P, { sunX: 600, top: RED_RIM2, side: RED_RIM2, kTop: 0.5, kSide: 0.3 });
    fogPass(P, base - 40, base + 4, hx('#3a0608'), 0.85, 1.3, 5);
    for (let y = base + 4; y < h; y++) for (let x = 0; x < w; x++) P.d[y * w + x] = hx('#2c0507');
    return { pix: P, ox: (w - W) / 2, oy: -(HY + EYE * 0.12 - base), s: 0.12, tile: true };
  }
  function skull(P, x, y, sc, sd) {
    const b = (v, xx, yy) => rmp(BONE, v, xx, yy);
    P.ellipse(x, y, 4.2 * sc, 3.6 * sc, (xx, yy) => b(5 - (yy - y) * 0.5 + (xx - x) * 0.25 + (hash(xx, yy, sd) < 0.1 ? -1 : 0), xx, yy));
    P.rect(x - 2.6 * sc, y + 2 * sc, 5.2 * sc, 2.2 * sc, (xx, yy) => b(3.6, xx, yy));
    for (const e of [-1, 1]) P.ellipse(x + e * 1.6 * sc, y + 0.6 * sc, 1.1 * sc, 1.1 * sc, BONE[0]);
    P.put(Math.round(x - 0.5), Math.round(y + 2 * sc), BONE[0]);
    if (sc > 1.2) for (let i = -2; i <= 1; i++) P.put(Math.round(x + i * sc), Math.round(y + 3.6 * sc), BONE[1]);
  }
  function skullPile(P, cx, by, wdt, hgt, sd) {
    const rng = U.makeRng(sd);
    for (let row = 0; row < hgt; row++) {
      const n = Math.max(1, Math.round((wdt / 8) * (1 - row / hgt)));
      for (let i = 0; i < n; i++) {
        const x = cx - (n - 1) * 4 + i * 8 + (rng() - 0.5) * 3, y = by - 3 - row * 5.5 + (rng() - 0.5) * 2;
        skull(P, x, y, 0.95 + rng() * 0.3, sd + row * 13 + i);
      }
    }
  }
  function oxSkull(P, cx, cy, sd) {
    const b = (v, x, y) => rmp(BONE, v, x, y);
    // horns
    for (const e of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(cx + e * (6 + t * 22 + Math.sin(t * 2.4) * 4), cy - 4 - Math.pow(t, 1.8) * 22 + Math.sin(t * Math.PI) * -3); }
      for (let i = 0; i + 3 < pts.length; i += 2) {
        const t = i / pts.length, wd = 5.5 * (1 - t) + 1;
        P.ellipse(pts[i], pts[i + 1], wd / 2, wd / 2, (x, y) => b(t > 0.75 ? 1.5 : 5 - (y - pts[i + 1]) * 0.6, x, y));
      }
    }
    P.poly([cx - 9, cy - 8, cx + 9, cy - 8, cx + 6, cy + 10, cx + 3, cy + 20, cx - 3, cy + 20, cx - 6, cy + 10], (x, y) => b(5.4 - (y - cy) * 0.12 + (x - cx) * 0.12 + (hash(x, y, sd) < 0.1 ? -1 : 0), x, y));
    for (const e of [-1, 1]) P.ellipse(cx + e * 4.5, cy - 1, 2.6, 2.2, BONE[0]);
    P.rect(cx - 2, cy + 14, 1, 4, BONE[1]); P.rect(cx + 1, cy + 14, 1, 4, BONE[1]);
    P.rect(cx - 8, cy - 9, 16, 2, (x, y) => b(6.4, x, y));
  }
  function buildShrine() {
    const w = 320, h = 218, cx = 160, P = new Pix(w, h);
    const bone = (v, x, y) => rmp(BONE, v + (hash(x, y, 543) < 0.06 ? -1 : 0), x, y);
    for (let i = 0; i < 3; i++) {
      const x0 = cx - 136 + i * 14, x1 = cx + 136 - i * 14, y0 = h - 6 * (i + 1);
      P.rect(x0, y0, x1 - x0, 6, (x, y) => rmp(SHW, y === y0 ? 5.2 : 2.2 + (fbm(x * 0.2, y * 0.2, 541, 2) - 0.5) * 1.6, x, y));
    }
    const fy0 = 100, fy1 = h - 18;
    P.rect(cx - 96, fy0, 192, fy1 - fy0, (x, y) => rmp(SHW, 1.5 + ((x - cx + 96) % 24 === 0 ? 1.8 : 0) + (y === fy0 + 4 ? 1.6 : 0) - (y < fy0 + 3 ? 0.8 : 0), x, y));
    // the maw
    const mcy = 153, mrx = 82, mry = 41;
    P.rect(cx - mrx - 6, fy0 + 6, (mrx + 6) * 2, fy1 - fy0 - 6, (x, y) => {
      const nx = (x + 0.5 - cx) / mrx, ny = (y + 0.5 - mcy) / mry;
      const top = -0.82 + nx * nx * 0.5, bot = 0.92 - nx * nx * 0.55;
      if (ny < top || ny > bot || Math.abs(nx) > 1) {
        if (ny > top - 0.13 && ny < bot + 0.13 && Math.abs(nx) < 1.05) return rmp(MAW, 2.6 - Math.abs(nx) * 1.2 + (ny > 0 ? 0.4 : 0), x, y);
        return 0;
      }
      const d = hyp(nx * 1.1, (ny - 0.12) * 1.4);
      return rmp(MAW, 4.7 - d * 5.2 + (fbm(x * 0.1, y * 0.1, 542, 2) - 0.5), x, y);
    });
    const fang = (x, y, wd, len, dir) => {
      P.poly([x - wd / 2, y, x + wd / 2, y, x + wd * 0.12, y + len * dir], (xx, yy) => {
        const t = ((yy - y) * dir) / len, rel = (xx + 0.5 - x) / (wd / 2);
        return bone(6.2 - t * 2.4 - rel * 1.5, xx, yy);
      });
    };
    for (let i = 0; i < 9; i++) {
      const t = i / 8 - 0.5, x = cx + t * 140, wd = 9 + (1 - Math.abs(t) * 2) * 7;
      fang(x, mcy + (-0.82 + ((t * 140) / mrx) ** 2 * 0.5) * mry - 2, wd, (13 + (1 - Math.abs(t) * 2) * 17) * (i % 2 ? 0.7 : 1), 1);
    }
    for (let i = 0; i < 8; i++) {
      const t = i / 7 - 0.5, x = cx + t * 130 + 5, wd = 8 + (1 - Math.abs(t) * 2) * 5;
      fang(x, mcy + (0.92 - ((t * 130) / mrx) ** 2 * 0.55) * mry + 2, wd, (10 + (1 - Math.abs(t) * 2) * 9) * (i % 2 ? 0.75 : 1), -1);
    }
    // ribcage pillars: curved bones arching from the steps to the eaves
    for (const e of [-1, 1]) for (let i = 0; i < 3; i++) {
      const pts = [];
      for (let j = 0; j <= 20; j++) {
        const t = j / 20;
        pts.push(cx + e * (96 + i * 11 + Math.sin(t * Math.PI) * (15 + i * 4) - t * 6), fy1 + 1 - t * (fy1 - fy0 + 8 + i * 3));
      }
      for (let j = 0; j + 1 < pts.length / 2; j++) {
        const x = pts[2 * j], y = pts[2 * j + 1], wd = 6.4 - i * 1.1 - (j / 20) * 2.2;
        const x2 = pts[2 * j + 2], y2 = pts[2 * j + 3];
        for (let q = 0; q < 4; q++) {
          const qx = U.lerp(x, x2, q / 4), qy = U.lerp(y, y2, q / 4);
          P.ellipse(qx, qy, wd / 2, wd / 2, (xx, yy) => bone(4.8 + (xx + 0.5 - qx) * e * 0.55 - i * 0.5 + (yy < qy ? 0.4 : 0), xx, yy));
        }
      }
      // knuckle where the rib meets the ground
      P.ellipse(pts[0], fy1 + 1, 4.5 - i, 2.5, (xx, yy) => bone(5, xx, yy));
    }
    // roofs and upper stories
    drawRoof(P, cx, 104, 150, 30, 11, SHR, { ridge: 0.3, rib: 4, base: 2.2, thick: 3 });
    drawBody(P, cx - 54, 64, cx + 54, 88, SHW, { pil: 12, base: 1.4 });
    for (let i = -1; i <= 1; i++) P.rect(cx + i * 28 - 6, 73, 12, 3, (x, y) => rmp(MAW, y === 74 ? 8 : 6, x, y));
    drawRoof(P, cx, 88, 100, 25, 9, SHR, { ridge: 0.28, rib: 4, base: 2.2, thick: 3 });
    drawBody(P, cx - 32, 46, cx + 32, 66, SHW, { pil: 9, base: 1.4 });
    drawRoof(P, cx, 51, 64, 20, 7, SHR, { ridge: 0.25, rib: 4, base: 2.3, thick: 2.5 });
    // horns
    for (const e of [-1, 1]) {
      for (let j = 0; j <= 40; j++) {
        const t = j / 40;
        const x = cx + e * (28 + t * 70 + Math.sin(t * 3) * 6), y = 38 - t * 22 - Math.sin(t * Math.PI) * 8;
        const wd = 8.5 * (1 - t) + 1.2;
        P.ellipse(x, y, wd / 2, wd / 2, (xx, yy) => bone(t > 0.82 ? 1.6 : 5.4 - (yy - y) * 0.7 - t * 2, xx, yy));
      }
    }
    for (let j = 0; j < 24; j++) P.put(cx, 34 - j, SHR[3]);
    skull(P, cx, 9, 1.2, 545);
    // hanging red lanterns under the main eaves
    for (const e of [-1, 1]) {
      const lx = cx + e * 118;
      P.rect(lx, 104, 1, 5, SHW[1]);
      P.ellipse(lx + 0.5, 116, 5, 7, (x, y) => rmp(MAW, 3.6 + (1 - Math.abs(x + 0.5 - lx - 0.5) / 5) * 2.4 - ((y - 109) % 3 === 0 ? 1 : 0), x, y));
      P.rect(lx - 3, 108, 7, 1, SHW[1]); P.rect(lx - 3, 123, 7, 1, SHW[1]);
    }
    // skull piles and flanking ox skulls on posts
    skullPile(P, 30, h - 1, 56, 6, 546);
    skullPile(P, w - 30, h - 1, 56, 6, 547);
    skullPile(P, cx, h - 18, 66, 2, 548);
    for (const e of [-1, 1]) {
      const px = cx + e * 142;
      P.rect(px - 2, 112, 5, h - 112 - 6, (x, y) => rmp(SHW, 2.6 + (x - px) * 0.5, x, y));
      oxSkull(P, px, 110, 549 + e);
    }
    rimPass(P, { sunX: 9999, top: RED_RIM, side: RED_RIM2, kTop: 0.5, kSide: 0.32, fall: 0 });
    return { pix: P, w, h, ax: cx, mouth: [cx, mcy], eyes: 74 };
  }
  function buildSkullSprites() {
    const out = [];
    for (let i = 0; i < 4; i++) {
      const P = new Pix(30, 20);
      if (i < 2) skull(P, 15, 11, 1.6 + i * 0.4, 560 + i);
      else skullPile(P, 15, 19, 26, 2 + (i - 2), 570 + i);
      out.push(P);
    }
    const ox = new Pix(64, 52);
    oxSkull(ox, 32, 30, 580);
    out.push(ox);
    return out;
  }

  // ------------------------------------------------------------ art cache
  let ART = null;
  function getArt() {
    if (ART) return ART;
    const t0 = U.now();
    const A = {};
    A.sky = buildSky();
    A.cloudHi = buildClouds('hi');
    A.cloudLo = buildClouds('lo');
    A.city1 = buildCity({ w: 1024, h: 272, y0: 30, base: HY + EYE * 0.04, s: 0.04, seed: 601, minW: 8, maxW: 26, minH: 10, maxH: 62, gap: 4, broken: 0.25,
      ramp: ramp(['#3a1019', '#43131c', '#4d1720', '#581b24', '#632028', '#6e262c']), win: true, lit: 0.04, winCol: hx('#b8501f'), winHot: hx('#f09038'),
      rim: hx('#c8582a'), rimK: 0.45, haze: hx('#a2391f'), hazeK: 0.9, fire: 0.08, fireCol: ramp(['#b03a1a', '#e8602a', '#ffa040', '#ffe090']), sunX: 512 + SUN.x - W / 2 });
    A.city2 = buildCity({ w: 1024, h: 302, y0: 0, base: HY + EYE * 0.09, s: 0.09, seed: 602, minW: 14, maxW: 44, minH: 24, maxH: 112, gap: 10, broken: 0.45, cranes: 2,
      ramp: ramp(['#1e070d', '#250a11', '#2d0d15', '#36111a', '#40151f', '#4a1a24']), win: true, lit: 0.05, winCol: hx('#a0401a'), winHot: hx('#ffa040'),
      rim: hx('#d86a30'), rimK: 0.55, haze: hx('#7c2a1c'), hazeK: 0.8, fire: 0.22, fireCol: ramp(['#a8301a', '#e8602a', '#ffa040', '#ffe090']), sunX: 512 + SUN.x - W / 2 });
    A.midfar = buildTemples({ w: 1280, h: 316, y0: -14, base: HY + EYE * 0.2, s: 0.2, seed: 611, ground: 10, groundVar: 22,
      ramp: ramp(['#16050b', '#1d070e', '#250a12', '#2e0d16', '#38111a', '#43151e']), rim: hx('#e07434'), rimK: 0.5, inner: 0.4,
      fog: hx('#6a2018'), fogK: 0.72, fogH: 46, patch: 0.4,
      draw: (P, X, base, R) => {
        pagoda(P, X(-170), base - 18, 5, 26, 22, R, { rib: 0, lit: 0.01, litCol: hx('#c05020') });
        pagoda(P, X(330), base - 12, 3, 22, 20, R, { rib: 0 });
        hall(P, X(-420), base - 20, 44, 40, R, { lit: 0.02, litCol: hx('#d06024') });
        hall(P, X(120), base - 14, 34, 32, R, {});
        hall(P, X(530), base - 22, 40, 36, R, { lit: 0.015, litCol: hx('#d06024') });
        torii(P, X(228), base - 12, 15, 26, R, {});
        torii(P, X(-290), base - 18, 11, 20, R, { broken: 1 });
        for (let i = 0; i < 26; i++) { const u = -640 + hash(i, 0, 612) * 1280; pine(P, X(u), base - 14 - hash(i, 1, 612) * 8, 14 + hash(i, 2, 612) * 22, R, 613 + i); }
        for (let i = 0; i < 6; i++) deadTree(P, X(-600 + i * 220 + 40), base - 16, 26, R, 620 + i);
        wallRun(P, X(-360), X(-210), base - 14, 6, R);
        wallRun(P, X(380), X(500), base - 16, 6, R);
      } });
    A.town = buildTown();
    A.mid = buildTemples({ w: 1280, h: 356, y0: -56, base: HY + EYE * 0.45, s: 0.45, seed: 631, ground: 12, groundVar: 20,
      ramp: ramp(['#0d0408', '#12060b', '#18080e', '#1f0b12', '#280e16', '#32131b', '#3e1820']), rim: hx('#f08a3c'), rimSide: hx('#d06830'), rimK: 0.6, inner: 0.5,
      fog: hx('#4a1414'), fogK: 0.24, fogH: 40, patch: 0.5, cliff: true, mist: hx('#3a0e0e'),
      draw: (P, X, base, R) => {
        pagoda(P, X(-330), base - 12, 5, 44, 38, R, { rib: 3, broken: 1, lit: 0.01, litCol: hx('#e07028') });
        hall(P, X(250), base - 16, 90, 92, R, { rib: 3, lit: 0.012, litCol: hx('#e07028') });
        torii(P, X(-40), base - 4, 58, 118, VERM.slice(0, 4), {});
        hall(P, X(-560), base - 10, 60, 64, R, { rib: 3 });
        for (let i = 0; i < 14; i++) { const u = -640 + hash(i, 0, 632) * 1280; if (Math.abs(u + 40) < 90) continue; pine(P, X(u), base - 10, 30 + hash(i, 2, 632) * 34, R, 633 + i); }
        deadTree(P, X(110), base - 10, 60, R, 650);
        deadTree(P, X(480), base - 12, 48, R, 651);
        wallRun(P, X(-250), X(-120), base - 10, 12, R);
        wallRun(P, X(400), X(600), base - 12, 12, R);
        corridor(P, X(-640), X(-118), base - 6, 15, R);
        corridor(P, X(36), X(640), base - 6, 15, R);
        // terrace wall with shrubs along the courtyard edge
        for (let i = 0; i < 70; i++) { const u = -640 + i * 18.3 + hash(i, 1, 640) * 8; P.ellipse(X(u), base - 7, 6 + hash(i, 2, 640) * 6, 3 + hash(i, 3, 640) * 2, (x, y) => rmp(R, 0.7 + (y < base - 8 ? 0.8 : 0), x, y)); }
        P.rect(0, base - 6, 1280, 10, (x, y) => rmp(R, y === base - 6 ? 3 : 1.6 + ((x + (y > base - 1 ? 7 : 0)) % 14 === 0 ? -0.8 : 0), x, y));
        for (let i = 0; i < 16; i++) { const u = -620 + i * 80; P.rect(X(u) - 2, base - 13, 4, 7, (x, y) => rmp(R, y === base - 13 ? 3.2 : 1.8, x, y)); P.rect(X(u) - 3, base - 15, 6, 2, (x, y) => rmp(R, 2.6, x, y)); }
      } });
    A.near = buildNear();
    A.floor = buildFloor();
    A.props = {};
    for (const k in PROP_KINDS) A.props[k] = PROP_KINDS[k]();
    A.rocks = spriteRocks();
    A.smoke = [8, 12, 18, 26].map((r, i) => spritePuff(r, ramp(['#0e0709', '#170c0f', '#211216', '#2c181b', '#3a2022', '#4a2a28']), 701 + i));
    A.dust = [5, 8, 12, 18].map((r, i) => spritePuff(r, ramp(['#1a110f', '#2a1c17', '#3c2a20', '#52392a', '#6a4a34', '#845e42']), 711 + i));
    A.plume = [6, 9, 13, 18].map((r, i) => spritePuff(r, ramp(['#12070a', '#1a0b0e', '#231013', '#2e1517', '#3b1b1b', '#4c231f', '#622d24']), 741 + i));
    A.ash = [6, 10, 16].map((r, i) => spritePuff(r, ramp(['#06030a', '#0e0814', '#180e20', '#24142e', '#30183c']), 721 + i));
    A.flames = [];
    for (let f = 0; f < 8; f++) A.flames.push(spriteFlame(f, 10, 18, 731), spriteFlame(f, 16, 30, 732), spriteFlame(f, 22, 44, 733));
    A.glows = {
      orange: spriteGlow(32, '#ff7a30', 0.9), fire: spriteGlow(48, '#ff5a1a', 0.7), purple: spriteGlow(32, '#b04cff', 1),
      blue: spriteGlow(32, '#4aa8ff', 1), red: spriteGlow(32, '#ff2a1a', 1), white: spriteGlow(24, '#ffffff', 1), sun: spriteGlow(90, '#ff9a40', 0.45),
      lantern: spriteGlow(14, '#ffa040', 0.9), crimson: spriteGlow(90, '#ff2010', 0.5),
    };
    A.void = buildVoid();
    A.vstars = [buildVoidStars(591, 0.0016, 18), buildVoidStars(592, 0.0008, 30)];
    A.galaxy = buildGalaxy();
    A.hole = buildHole();
    A.ssky = buildShrineSky();
    A.smount = buildShrineMountains();
    A.shrine = buildShrine();
    A.skulls = buildSkullSprites();
    A.ms = U.now() - t0;
    ART = A;
    return A;
  }

  // ================================================================ STAGE
  const MAXP = 900, MAXRUB = 170, MAXCHUNK = 10;
  const K_EMBER = 1, K_ASH = 2, K_MOTE = 3, K_SMOKE = 4, K_DUST = 5, K_ROCK = 6, K_SPARK = 7, K_COL = 8, K_FLAME = 9, K_DROP = 10, K_WISP = 11;
  const WA = 0, WN = 1, WV = 2, WS = 3; // particle world: any, arena, void, shrine
  const EMBER_COLS = ['#fff6c8', '#ffd068', '#ffa040', '#f06a24', '#c03c16', '#7a1e0e'];
  const ASH_COLS = ['#3a2a2c', '#4e3a3a', '#24181c'];
  const MOTE_COLS = ['#1a0624', '#5a2088', '#a060f0', '#e0c8ff'];
  const DROP_COLS = ['#3a0306', '#6a080c', '#a01212'];
  const AMB = {
    normal: { mul: [1.04, 0.93, 0.86], rim: [255, 136, 70], rimK: 0.55 },
    void: { mul: [0.88, 0.95, 1.12], rim: [170, 215, 255], rimK: 0.72 },
    shrine: { mul: [0.9, 0.62, 0.6], rim: [255, 44, 34], rimK: 0.78 },
  };
  const KIND_DMG = { hit: 0.22, blue: 0.7, red: 1.1, purple: 1.6, fire: 0.5, slash: 0.9, wall: 1.3 };
  const KIND_COL = {
    hit: ['#fffbe8', '#ffd27a', '#ff9a40'], blue: ['#f0fbff', '#7ad0ff', '#2a7aff'], red: ['#fff0e0', '#ff7a5a', '#ff2a1a'],
    purple: ['#ffffff', '#d9a0ff', '#9a3aff'], fire: ['#fff0b0', '#ffa040', '#ff4a10'], slash: ['#ffffff', '#ffd0d0', '#ff3030'],
    wall: ['#ffe8c0', '#d8a070', '#8a5a40'],
  };
  const SPLIT_SH = { 0.8: 12, 0.45: 9, 0.3: 8, 0.2: 6, 0.09: 5, 0.04: 4, 0.001: 4 }; // world-cut slide per layer
  const ERASE_K = { 0.8: 1, 0.45: 0.9, 0.3: 0.82, 0.2: 0.75, 0.09: 0.7, 0.04: 0.66, 0.001: 0.72 }; // tunnel bore per layer depth
  const ERASE_VOID = ramp(['#050109', '#0d0418', '#1c0a30', '#d8b0ff']);
  const RIM_OF = { void: '#8ad8ff', shrine: '#ff2a1a', clash: '#ff9aff', normal: '#ffd8a0' };
  // far smoke columns: default screen x, depth, base screen y
  const COLS = [[-246, 0.05, 147], [-30, 0.07, 151], [196, 0.05, 146], [452, 0.06, 149]];

  class Stage {
    constructor() {
      this.gfx = DOM;
      this.t = 0;
      this.darken = 0;
      this.c = { x: 0, y: JJK.CAM_BASE_Y || 142, ez: 1, shx: 0, shy: 0, hgt: EYE };
      this.parts = []; this.pool = [];
      this.cnt = new Int16Array(16);
      this.acc = { ember: 0, ash: 0, mote: 0, col: 0 };
      this.rubble = []; this.chunks = []; this.fires = []; this.pulls = [];
      this.holes = []; this.seams = []; this.rings = []; this.slashes = []; this.gashes = []; this.cuts = [];
      this.mode = 'normal'; this.tr = null;
      this.cl = { left: 'void', right: 'shrine', split: 0.5, tsplit: 0.5 };
      this.shrineX = 0; this.originX = 0;
      this.fl = 0; this.flCol = [1, 1, 1]; this.rumble = 0;
      this.amb = { mul: [1, 1, 1], rim: [255, 136, 70], rimK: 0.55 };
      this.props = PROP_LAYOUT.map(([kind, X, s, flip]) => ({ kind, X, s, flip, hp: 1, maxHp: 1, state: 0, wob: 0, wobV: 0, char: 0, charDrawn: 0, T: null, cv: null }));
      for (const p of this.props) p.maxHp = p.hp = { lantern: 70, post: 120, pillar: 150, statue: 140, wall: 100, torii: 160, jizo: 40, stele: 50 }[p.kind];
      if (this.gfx) this._initGfx();
      this.reset();
    }

    // ---------------------------------------------------------- setup
    _initGfx() {
      const A = (this.art = getArt());
      const mk = (src, s, tile, mutable = true) => {
        const p = src.pix, L = { s, ox: src.ox, oy: src.oy, tile, w: p.w, h: p.h, cv: mkCanvas(p.w, p.h), dx: 0, dy: 0, e: 1 };
        L.ctx = L.cv.getContext('2d');
        L.base = p.d;
        L.pix = mutable ? new Uint32Array(p.d) : p.d;
        L.img = new ImageData(new Uint8ClampedArray(mutable ? L.pix.buffer : p.d.buffer.slice(0)), p.w, p.h);
        L.ctx.putImageData(L.img, 0, 0);
        const bc = p.d[(p.h - 1) * p.w + (p.w >> 1)];
        L.bottom = bc >>> 24 ? css(bc) : null;
        L.dirty = null;
        L.opaq = this._opaqScan(L);
        return L;
      };
      const L = (this.L = {});
      L.sky = mk(A.sky, 0.001, false);
      L.cloudHi = mk({ pix: A.cloudHi.pix, ox: 192, oy: -A.cloudHi.sy0 }, 0.012, true, false);
      L.cloudLo = mk({ pix: A.cloudLo.pix, ox: 192, oy: -A.cloudLo.sy0 }, 0.02, true, false);
      L.cloudHi.bottom = L.cloudLo.bottom = null;
      L.city1 = mk(A.city1, 0.04, true);
      L.city2 = mk(A.city2, 0.09, true);
      L.midfar = mk(A.midfar, 0.2, true);
      L.town = mk(A.town, 0.3, true);
      L.mid = mk(A.mid, 0.45, true);
      L.near = mk(A.near, SB, true);
      this.cutLayers = [L.sky, L.city1, L.city2, L.midfar, L.town, L.mid, L.near];
      L.vbase = mk(A.void, 0.001, false, false);
      L.vstar1 = mk({ pix: A.vstars[0], ox: 192, oy: 30 }, 0.01, true, false);
      L.vstar2 = mk({ pix: A.vstars[1], ox: 192, oy: 30 }, 0.03, true, false);
      L.vstar1.bottom = L.vstar2.bottom = null;
      L.ssky = mk(A.ssky, 0.001, false, false);
      L.smount = mk(A.smount, 0.12, true, false);
      // floor texture
      const G = A.floor;
      this.F = { cv: mkCanvas(G.TW, G.NR), base: G.pix.d, pix: new Uint32Array(G.pix.d), dirty: null };
      this.F.ctx = this.F.cv.getContext('2d');
      this.F.img = new ImageData(new Uint8ClampedArray(this.F.pix.buffer), G.TW, G.NR);
      this.F.ctx.putImageData(this.F.img, 0, 0);
      // canvases for sprites
      const cv = (this.cv = {});
      cv.rocks = A.rocks.map((row) => row.map(toCanvas));
      cv.smoke = A.smoke.map(toCanvas); cv.dust = A.dust.map(toCanvas); cv.plume = A.plume.map(toCanvas); cv.ash = A.ash.map(toCanvas);
      cv.flames = A.flames.map(toCanvas);
      cv.glow = {};
      for (const k in A.glows) cv.glow[k] = toCanvas(A.glows[k]);
      cv.galaxy = toCanvas(A.galaxy); cv.hole = toCanvas(A.hole);
      cv.shrine = toCanvas(A.shrine.pix);
      cv.skulls = A.skulls.map(toCanvas);
      cv.floorFade = this._mkFade(); cv.voidFloor = this._mkVoidFloor();
      // per-prop canvases
      for (const p of this.props) {
        const T = (p.T = A.props[p.kind]);
        p.cv = mkCanvas(T.w, T.h); p.ctx = p.cv.getContext('2d');
        p.pix = new Uint32Array(T.w * T.h);
        p.img = new ImageData(new Uint8ClampedArray(p.pix.buffer), T.w, T.h);
        p.ax = p.flip ? T.w - T.ax : T.ax;
      }
      // offscreen buffers for shatter snapshots and the shrine reflection source
      this.snap = mkCanvas(W, H); this.snapCtx = this.snap.getContext('2d');
      this.up = mkCanvas(W, H); this.upCtx = this.up.getContext('2d');
      this.tmp = mkCanvas(64, 64); this.tmpCtx = this.tmp.getContext('2d');
      // void streaks / motes
      this.vs = [];
      for (let i = 0; i < 150; i++) this.vs.push(this._newStreak({}, true));
      this.vm = [];
      for (let i = 0; i < 46; i++) this.vm.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.3, vy: -0.1 - Math.random() * 0.3, ph: Math.random() * 7, sz: Math.random() < 0.2 ? 2 : 1 });
    }
    _mkFade() {
      // dithered black fade (alpha ramp) used to darken the void mirror with distance
      const P = new Pix(W, 220);
      for (let y = 0; y < 220; y++) for (let x = 0; x < W; x++) {
        const a = U.clamp((y - 6) / 150, 0, 1);
        const lv = Math.floor(a * 6 + bay(x, y)) / 6;
        if (lv > 0) P.d[y * W + x] = U.pack(0, 0, 2, Math.round(lv * 235));
      }
      return toCanvas(P);
    }
    _mkVoidFloor() {
      const P = new Pix(W, 240);
      for (let y = 0; y < 240; y++) for (let x = 0; x < W; x++) {
        const dx = (x - W / 2) / W;
        P.d[y * W + x] = rmp(VOIDR, 2.6 * Math.exp(-y / 18) + 0.8 * Math.exp(-y / 90) - dx * dx * 2, x, y);
      }
      return toCanvas(P);
    }

    reset() {
      this.parts.length = 0; this.pool.length = 0; this.cnt.fill(0);
      this.rubble.length = 0; this.chunks.length = 0; this.fires.length = 0; this.pulls.length = 0;
      this.holes.length = 0; this.seams.length = 0; this.rings.length = 0; this.slashes.length = 0; this.gashes.length = 0; this.cuts.length = 0;
      this.mode = 'normal'; this.tr = null; this.darken = 0; this.fl = 0; this.rumble = 0;
      this.cl.split = this.cl.tsplit = 0.5;
      for (const p of this.props) { p.hp = p.maxHp; p.state = 0; p.wob = p.wobV = 0; p.char = p.charDrawn = 0; p.cut = false; }
      if (!this.gfx) return;
      for (const L of this.cutLayers) if (L.dirty !== 'clean') { L.pix.set(L.base); L.ctx.clearRect(0, 0, L.w, L.h); L.ctx.putImageData(L.img, 0, 0); L.dirty = 'clean'; L.opaq = this._opaqScan(L); }
      if (this.F.touched) { this.F.pix.set(this.F.base); this.F.ctx.putImageData(this.F.img, 0, 0); this.F.touched = false; }
      this.F.dirty = null;
      for (const p of this.props) this._propRefresh(p);
      this.floaters = [];
      for (let i = 0; i < 7; i++) this.floaters.push({ X: -420 + i * 140 + (Math.random() - 0.5) * 60, Y: 70 + Math.random() * 90, s: 0.5 + Math.random() * 0.22, si: 3 + (i % 3), v: i & 3, ph: Math.random() * 7 });
      // a few columns of smoke already risen
      for (let i = 0; i < 260; i++) this._ambientArena(true);
    }

    // ------------------------------------------------------- camera math
    _cam(cam) {
      const c = this.c;
      if (cam) {
        c.x = cam.x || 0;
        c.y = cam.y != null ? cam.y : 142;
        c.ez = U.clamp(cam.ez || cam.zoom || 1, 0.2, 10);
        c.shx = U.clamp(cam.shakeX || 0, -36, 36);
        c.shy = U.clamp(cam.shakeY || 0, -26, 26);
      }
      c.hgt = c.y + OFF / c.ez;
      return c;
    }
    kS(s) {
      const d = 1 / s - 1 + 1 / this.c.ez;
      return d > 0.02 ? 1 / d : 50;
    }
    px(X, s) { return W / 2 + this.c.shx + (X - this.c.x) * this.kS(s); }
    py(Y, s) { return HY + this.c.shy + (this.c.hgt - Y) * this.kS(s); }

    // ---------------------------------------------------------- update
    update(cam) {
      this.t++;
      const c = this._cam(cam);
      const tr = this.tr;
      if (tr && ++tr.t >= tr.n) { this.mode = tr.to; this.tr = null; }
      this.cl.split += (this.cl.tsplit - this.cl.split) * 0.35;
      this.rumble *= 0.93; this.fl *= 0.86;
      for (const p of this.props) {
        if (this.rumble > 0.05 && p.state < 2 && Math.random() < 0.3) p.wobV += (Math.random() - 0.5) * 0.004 * this.rumble;
        p.wobV += -p.wob * 0.07; p.wobV *= 0.9; p.wob += p.wobV;
      }
      for (let i = this.fires.length - 1; i >= 0; i--) {
        const f = this.fires[i];
        if (--f.life <= 0) { this.fires.splice(i, 1); continue; }
        for (const p of this.props) if (p.state < 2 && Math.abs(p.X - f.x) < f.r + 30) { p.hp -= 0.05; p.char = Math.min(1, p.char + 0.004); this._propState(p); }
      }
      for (let i = this.pulls.length - 1; i >= 0; i--) {
        const q = this.pulls[i];
        if (--q.life <= 0) { this.pulls.splice(i, 1); continue; }
        for (const p of this.props) if (p.state < 2 && Math.abs(p.X - q.x) < q.r * 1.6) p.wobV += Math.sign(q.x - p.X) * 0.0012 * q.str + (Math.random() - 0.5) * 0.002 * q.str;
      }
      if (!this.gfx) return;
      const vis = this._visible();
      if (vis.n) this._ambientArena(false);
      if (vis.v) this._updVoid();
      if (vis.s) this._updShrine();
      if (vis.c && this.t % 2 === 0) {
        const bx = this.cl.split * W, y = Math.random() * H;
        const [X, Y] = this._toWorld(bx, y);
        const p = this._spawn(K_SPARK, X, Y, 1, (Math.random() - 0.5) * 6, (Math.random() - 0.3) * 5, 10 + Math.random() * 12, 1, WA);
        if (p) p.cs = Math.random() < 0.5 ? KIND_COL.blue : KIND_COL.red;
      }
      this._updFires();
      this._updPulls();
      this._updParts();
      this._updChunks();
      for (const a of [this.holes, this.seams, this.gashes, this.cuts]) for (let i = a.length - 1; i >= 0; i--) { a[i].heat *= a[i].decay || 0.975; if (a[i].heat < 0.02) a.splice(i, 1); }
      for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.r += r.vr; r.vr *= 0.93; if (--r.life <= 0) this.rings.splice(i, 1); }
      for (const p of this.props) if (p.char - p.charDrawn > 0.08) this._propRefresh(p);
    }
    _visible() {
      const v = { n: false, v: false, s: false, c: false };
      const add = (m) => {
        if (m === 'normal') v.n = true; else if (m === 'void') v.v = true; else if (m === 'shrine') v.s = true;
        else if (m === 'clash') { v.c = true; add(this.cl.left); add(this.cl.right); }
      };
      add(this.mode);
      if (this.tr) { add(this.tr.from); add(this.tr.to); }
      return v;
    }
    _toWorld(sx, sy) {
      const c = this.c;
      return [(sx - W / 2 - c.shx) / c.ez + c.x, c.y - (sy - H / 2 - c.shy) / c.ez];
    }

    // --------------------------------------------------------- particles
    _spawn(k, x, y, s, vx, vy, life, sz, w) {
      if (this.parts.length >= MAXP) return null;
      const p = this.pool.pop() || {};
      p.k = k; p.x = x; p.y = y; p.s = s; p.vx = vx; p.vy = vy; p.vs = 0; p.life = p.max = Math.max(1, life | 0);
      p.sz = sz == null ? 1 : sz; p.w = w || 0; p.rot = 0; p.vr = 0; p.ph = Math.random() * 6.28; p.v = (Math.random() * 4) | 0; p.cs = null; p.a = 1;
      this.parts.push(p);
      this.cnt[k]++;
      return p;
    }
    _kill(i) {
      const P = this.parts, p = P[i];
      this.cnt[p.k]--;
      P[i] = P[P.length - 1]; P.pop();
      this.pool.push(p);
    }
    _viewHalf(s) { return (W / 2) / this.kS(s) + 20; }
    _ambientArena(pre) {
      const c = this.c, a = this.acc;
      // embers rising from the burning city / floor
      a.ember += pre ? 0.4 : 1.15;
      while (a.ember >= 1) {
        a.ember--;
        if (this.cnt[K_EMBER] >= 120) break;
        const r = Math.random();
        const s = r < 0.42 ? U.rand(0.25, 0.75) : r < 0.86 ? U.rand(0.82, 1) : U.rand(1.05, 1.4);
        const k = this.kS(s), hw = this._viewHalf(s);
        const yBot = c.hgt - (H - HY - c.shy) / k, yTop = c.hgt + (HY + c.shy) / k;
        const Y = !pre && Math.random() < 0.65 ? yBot - Math.random() * 20 : U.rand(yBot, yTop);
        this._spawn(K_EMBER, c.x + U.rand(-hw, hw), Y, s, 0.25 + U.rand(-0.3, 0.3), U.rand(0.35, 1.15) * (s > 1 ? 1.6 : 1), U.rand(140, 300), s > 1.02 || Math.random() < 0.12 ? 2 : 1, WN);
      }
      a.ash += pre ? 0.1 : 0.22;
      while (a.ash >= 1) {
        a.ash--;
        if (this.cnt[K_ASH] >= 30) break;
        const s = U.rand(0.5, 1.3), k = this.kS(s);
        this._spawn(K_ASH, c.x + U.rand(-this._viewHalf(s), this._viewHalf(s)), c.hgt + (HY + c.shy) / k + 6, s, U.rand(0.2, 0.8), -U.rand(0.25, 0.6), 500, Math.random() < 0.3 ? 2 : 1, WN);
      }
      a.mote += 0.06;
      while (a.mote >= 1) {
        a.mote--;
        if (this.cnt[K_MOTE] >= 18) break;
        const s = U.rand(0.86, 1.15);
        this._spawn(K_MOTE, c.x + U.rand(-this._viewHalf(s), this._viewHalf(s)), U.rand(0, 50), s, U.rand(-0.1, 0.1), U.rand(0.15, 0.45), U.rand(80, 160), 1, WN);
      }
      // smoke columns from the city
      a.col += pre ? 1 : 0.2;
      while (a.col >= 1) {
        a.col--;
        if (this.cnt[K_COL] >= 125) break;
        const [u, s, sy] = COLS[(Math.random() * COLS.length) | 0];
        const p = this._spawn(K_COL, (u + U.rand(-3, 3)) / s, EYE - (sy - HY) / s, s, U.rand(0.02, 0.08) / s, U.rand(0.22, 0.3) / s, U.rand(560, 680), 1, WN);
        if (p && pre) {
          const age = (Math.random() * p.max * 0.95) | 0;
          for (let i = 0; i < age; i++) { p.vx += 0.0005 / s; p.x += p.vx; p.y += p.vy; }
          p.life -= age;
        }
      }
      if (!pre && this.cnt[K_WISP] < 3 && Math.random() < 0.006) {
        const s = 1.35, k = this.kS(s), dir = 1;
        this._spawn(K_WISP, c.x - dir * (W / 2 / k + 50), U.rand(-10, 60), s, U.rand(0.35, 0.7), 0, 900, 3, WN);
      }
    }
    _updParts() {
      const P = this.parts, t = this.t, pulls = this.pulls;
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        if (--p.life <= 0) { this._kill(i); continue; }
        if (pulls.length && (p.k === K_ROCK || p.k === K_DUST || p.k === K_SMOKE || p.k === K_SPARK || p.k === K_ASH)) {
          for (const q of pulls) {
            const dx = q.x - p.x, dy = q.y - p.y, d = hyp(dx, dy) + 0.01, R = q.r * 1.4;
            if (d > R) continue;
            const f = q.str * (0.35 + 0.6 * (1 - d / R));
            p.vx += (dx / d) * f - (dy / d) * 0.25 * q.str;
            p.vy += (dy / d) * f + (dx / d) * 0.25 * q.str + GRAV * 0.95;
            p.vx *= 0.88; p.vy *= 0.88; p.s += (1 - p.s) * 0.06;
            if (p.k === K_ROCK) p.vr += (Math.random() - 0.5) * 0.1;
          }
        }
        switch (p.k) {
          case K_EMBER:
            p.vx += Math.sin(t * 0.05 + p.ph) * 0.018; p.vy += 0.003;
            p.x += p.vx; p.y += p.vy; break;
          case K_ASH: p.x += p.vx + Math.sin(t * 0.03 + p.ph) * 0.35; p.y += p.vy; if (p.y < -5) p.life = 0; break;
          case K_MOTE: p.x += p.vx + Math.sin(t * 0.04 + p.ph) * 0.15; p.y += p.vy; break;
          case K_COL: p.vx += 0.0005 / p.s; p.x += p.vx; p.y += p.vy; break;
          case K_SMOKE: p.x += p.vx; p.y += p.vy; p.vx *= 0.96; p.vy = p.vy * 0.96 + 0.035; break;
          case K_DUST: p.x += p.vx; p.y += p.vy; p.vx *= 0.9; p.vy = p.vy * 0.9 + 0.012; break;
          case K_WISP: p.x += p.vx; p.y += Math.sin(t * 0.01 + p.ph) * 0.06; break;
          case K_FLAME: p.x += p.vx; p.y += p.vy; break;
          case K_DROP: p.vy -= GRAV * 0.8; p.x += p.vx; p.y += p.vy; if (p.y < 0) { p.life = 0; } break;
          case K_SPARK:
            p.vy -= GRAV * 0.45; p.x += p.vx; p.y += p.vy; p.vx *= 0.95;
            if (p.y < 0) { p.y = 0; p.vy = -p.vy * 0.35; p.vx *= 0.7; }
            break;
          case K_ROCK:
            p.vy -= GRAV; p.x += p.vx; p.y += p.vy; p.s = U.clamp(p.s + p.vs, 0.82, 1.32); p.rot += p.vr;
            if (p.y <= 0 && p.vy < 0) {
              p.y = 0;
              if (p.vy > -1.6 && Math.abs(p.vx) < 1.2) {
                if (p.sz >= 1 && Math.abs(p.x) < 900) {
                  if (this.rubble.length >= MAXRUB) this.rubble.shift();
                  this.rubble.push({ x: p.x, s: p.s, si: p.sz, v: p.v });
                }
                p.life = 0;
              } else { p.vy = -p.vy * 0.36; p.vx *= 0.62; p.vr *= 0.6; p.vs *= 0.4; }
            }
            break;
        }
      }
    }
    _updFires() {
      for (const f of this.fires) {
        const k = Math.min(1, f.life / 40) * Math.min(1, (f.max - f.life) / 6 + 0.3);
        let n = f.r * 0.016 * k;
        while (n > 0 && (n >= 1 || Math.random() < n)) {
          n--;
          const u = (Math.random() * 2 - 1) * Math.sqrt(Math.random()), hk = 1 - u * u * 0.75;
          const big = hk > 0.55 ? (Math.random() < 0.35 ? 2 : Math.random() < 0.6 ? 1 : 0) : Math.random() < 0.3 ? 1 : 0;
          const p = this._spawn(K_FLAME, f.x + u * f.r, U.rand(-2, 1), U.rand(0.93, 1.09), U.rand(-0.05, 0.2), U.rand(0.15, 0.45) * hk, U.rand(16, 30) * (0.6 + 0.5 * hk), big, WA);
          if (p) { p.v = (Math.random() * 8) | 0; p.a = 0.55 + 0.55 * hk; }
        }
        if (Math.random() < 0.45 * k) this._spawn(K_EMBER, f.x + U.rand(-f.r, f.r) * 0.8, U.rand(10, 40), U.rand(0.9, 1.15), U.rand(-0.3, 0.6), U.rand(0.8, 2), U.rand(40, 90), Math.random() < 0.3 ? 2 : 1, WA);
        if (Math.random() < 0.06 * k) this._spawn(K_SMOKE, f.x + U.rand(-f.r, f.r) * 0.5, 34, 0.96, U.rand(-0.2, 0.4), U.rand(0.6, 1.1), U.rand(70, 120), 1 + ((Math.random() * 2) | 0), WA);
      }
    }
    _updPulls() {
      for (const q of this.pulls) {
        // lift rubble lying inside the radius
        for (let i = this.rubble.length - 1; i >= 0; i--) {
          const r = this.rubble[i];
          if (Math.abs(r.x - q.x) > q.r * 1.3 || Math.random() > 0.08 * q.str) continue;
          this.rubble.splice(i, 1);
          const p = this._spawn(K_ROCK, r.x, 0.5, r.s, 0, U.rand(1, 3), 240, r.si, WA);
          if (p) { p.v = r.v; p.vr = U.rand(-0.2, 0.2); }
        }
        // tear fresh chips and dust off the floor
        if (Math.random() < 0.35 * q.str) {
          const p = this._spawn(K_ROCK, q.x + U.rand(-q.r, q.r), 0.5, U.rand(0.9, 1.15), 0, U.rand(1.5, 3.5), 200, (Math.random() * 3) | 0, WA);
          if (p) p.vr = U.rand(-0.3, 0.3);
        }
        if (Math.random() < 0.3 * q.str) this._spawn(K_DUST, q.x + U.rand(-q.r, q.r), 2, U.rand(0.9, 1.1), 0, 0.6, U.rand(30, 60), (Math.random() * 2) | 0, WA);
      }
    }
    _updChunks() {
      for (let i = this.chunks.length - 1; i >= 0; i--) {
        const ch = this.chunks[i];
        if (ch.fade) { ch.a -= 0.02; if (ch.a <= 0) { this.chunks.splice(i, 1); continue; } }
        if (ch.rest) continue;
        ch.vy -= GRAV * 0.8; ch.x += ch.vx; ch.y += ch.vy; ch.rot += ch.vr;
        if (ch.y - ch.hr < 0 && ch.vy < 0) {
          ch.y = ch.hr;
          if (ch.vy > -2) { ch.rest = true; this._dustBurst(ch.x, 0, 4, 0.6); }
          else { ch.vy = -ch.vy * 0.3; ch.vx *= 0.5; ch.vr *= 0.5; this._dustBurst(ch.x, 0, 3, 0.5); }
        }
      }
      while (this.chunks.length > MAXCHUNK) { const ch = this.chunks.find((q) => !q.fade); if (!ch) break; ch.fade = true; }
    }
    _updVoid() {
      for (const s of this.vs) {
        s.r += s.v; s.v *= 1.05;
        if (s.r > 520) this._newStreak(s, false);
      }
      for (const m of this.vm) {
        m.x += m.vx + Math.sin(this.t * 0.02 + m.ph) * 0.1; m.y += m.vy;
        if (m.y < -4) { m.y = H + 4; m.x = Math.random() * W; }
      }
      if (this.t % 50 === 0) this.rings.push({ x: this.originX, r: 6, vr: 7, life: 70, w: WV });
    }
    _newStreak(s, pre) {
      s.a = Math.random() * Math.PI * 2;
      s.r = pre ? Math.random() * 400 : U.rand(4, 40);
      s.v = U.rand(0.5, 1.6) * (pre ? 1 + s.r / 60 : 1);
      s.len = U.rand(0.06, 0.2);
      s.c = (Math.random() * 3) | 0;
      return s;
    }
    _updShrine() {
      const t = this.t;
      if (t % 2 === 0 && Math.random() < 0.75) {
        const n = 1 + (Math.random() < 0.35 ? 1 : 0) + (Math.random() < 0.1 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const cx = U.rand(-40, W + 40), cy = U.rand(20, H - 10), a = U.rand(-1.1, 1.1) + (Math.random() < 0.5 ? 0 : Math.PI / 2), len = U.rand(30, 200);
          const ca = Math.cos(a) * len / 2, sa = Math.sin(a) * len / 2;
          this.slashes.push({ x0: cx - ca, y0: cy - sa, x1: cx + ca, y1: cy + sa, life: 8, max: 8, cross: Math.random() < 0.25 });
          if (this.slashes.length > 40) this.slashes.shift();
        }
      }
      for (let i = this.slashes.length - 1; i >= 0; i--) if (--this.slashes[i].life <= 0) this.slashes.splice(i, 1);
      if (t % 40 === 0) this.rings.push({ x: this.shrineX + U.rand(-300, 300), r: 2, vr: 2.2, life: 60, w: WS, s: U.rand(0.7, 1.2) });
    }

    // -------------------------------------------------------- props
    _propRefresh(p) {
      if (!this.gfx || !p.T) return;
      const T = p.T, w = T.w, h = T.h;
      if (p.cut) return; // cut pieces keep their own pixels
      const src = T.states[Math.min(2, p.state)].d;
      for (let y = 0; y < h; y++) {
        const o = y * w;
        if (p.flip) for (let x = 0; x < w; x++) p.pix[o + x] = src[o + w - 1 - x];
        else p.pix.set(src.subarray(o, o + w), o);
      }
      if (p.char > 0.02) this._charPix(p.pix, w, h, p.char);
      p.charDrawn = p.char;
      p.ctx.clearRect(0, 0, w, h);
      p.ctx.putImageData(p.img, 0, 0);
    }
    _charPix(d, w, h, k) {
      const soot = hx('#100808');
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!(d[i] >>> 24)) continue;
        const lv = Math.floor((k * (0.5 + 0.5 * (y / h))) * 4 + bay(x, y)) / 4;
        if (lv > 0) d[i] = mixp(d[i], soot, Math.min(0.85, lv * 0.85));
      }
    }
    _propState(p) {
      if (p.cut) return;
      const st = p.hp <= 0 ? 2 : p.hp < p.maxHp * 0.6 ? 1 : 0;
      if (st <= p.state) return;
      const was = p.state;
      p.state = st;
      if (!this.gfx) return;
      this._propRefresh(p);
      if (st === 2 && was < 2) this._breakProp(p);
    }
    _breakProp(p, dir) {
      const T = p.T, e = 1;
      const k = p.flip ? 1 : 0;
      if (!T.topCv) T.topCv = [];
      if (!T.topCv[k]) {
        const P = new Pix(T.w, T.h);
        for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) P.d[y * T.w + x] = T.top.d[y * T.w + (k ? T.w - 1 - x : x)];
        T.topCv[k] = toCanvas(P);
      }
      const [t0, t1] = T.topBox;
      const cyPx = (t0 + t1) / 2;
      const Y = (T.h - cyPx) / p.s;
      dir = dir || (Math.random() < 0.5 ? -1 : 1);
      this._addChunk(T.topCv[k], T.w, T.h, p.ax, cyPx, p.X, Y, p.s, dir * U.rand(1, 3), U.rand(2, 5), dir * U.rand(0.03, 0.09), ((t1 - t0) / 2) / p.s);
      this._rocksAt(p.X, Y, p.s, 10, 3.5);
      this._dustBurst(p.X, 0, 6, 1);
    }
    _addChunk(cv, w, h, ax, ay, X, Y, s, vx, vy, vr, hr) {
      this.chunks.push({ cv, w, h, ax, ay, x: X, y: Y, s, vx, vy, vr, rot: 0, hr: Math.max(4, hr), rest: false, a: 1, fade: false });
    }
    _damage(x, radius, dmg, power) {
      for (const p of this.props) {
        const d = Math.abs(p.X - x);
        if (d > radius) continue;
        const f = 1 - d / radius;
        if (p.state < 2) p.wobV += (p.X > x ? 1 : -1) * 0.02 * power * f;
        if (dmg > 0) { p.hp -= dmg * f; this._propState(p); }
      }
    }

    // ------------------------------------------------------ fx helpers
    _rocksAt(X, Y, s, n, spd, dirX = 0) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const p = this._spawn(K_ROCK, X + U.rand(-8, 8), Math.max(1, Y + U.rand(-6, 6)), s, Math.cos(a) * spd * Math.random() + dirX, Math.abs(Math.sin(a)) * spd * U.rand(0.5, 1.2) + 1, 400, Math.min(5, (Math.random() * Math.random() * 5.5) | 0), WA);
        if (p) { p.vr = U.rand(-0.3, 0.3); p.vs = U.rand(-0.01, 0.02); }
      }
    }
    _dustBurst(X, Y, n, k) {
      for (let i = 0; i < n; i++) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        this._spawn(K_DUST, X + U.rand(-10, 10), Y + U.rand(0, 8), U.rand(0.95, 1.08), dir * U.rand(0.5, 2.5) * k, U.rand(0.1, 0.9) * k, U.rand(30, 60), Math.min(3, (Math.random() * 2.5 * k) | 0), WA);
      }
    }
    _sparks(X, Y, n, spd, cols, up = 0.3) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = spd * U.rand(0.3, 1);
        const p = this._spawn(K_SPARK, X, Y, U.rand(0.96, 1.06), Math.cos(a) * v, Math.sin(a) * v + up * spd, U.rand(10, 24), 1, WA);
        if (p) p.cs = cols;
      }
    }
    _flash(k, col) { if (k > this.fl) { this.fl = k; this.flCol = col; } }

    // ----------------------------------------------- floor texture ops
    _floorArea(X, Z, rx, rz, fn) {
      const G = this.art.floor, F = this.F, TW = G.TW;
      const rowOf = (z) => Math.floor(HY + EYE * (ZF / z) - ROW0);
      const r0 = Math.max(0, rowOf(Math.min(ZB - 0.5, Z + rz))), r1 = Math.min(G.NR - 1, rowOf(Math.max(G.zLo + 1, Z - rz)));
      let x0 = TW, x1 = -1;
      for (let r = r0; r <= r1; r++) {
        const Zc = ZF / G.rs[r], sr = G.rsr[r], wi = Math.ceil(G.rwid[r]);
        const i0 = Math.floor((X - rx + PER / 2) * sr), i1 = Math.ceil((X + rx + PER / 2) * sr);
        for (let ii = i0; ii <= i1; ii++) {
          const i = ((ii % wi) + wi) % wi;
          fn(r * TW + i, (ii + 0.5) / sr - PER / 2 - X, Zc - Z, i, r);
          if (i < x0) x0 = i;
          if (i > x1) x1 = i;
        }
      }
      if (x1 < 0) return;
      const d = F.dirty;
      F.dirty = d ? [Math.min(d[0], x0), Math.min(d[1], r0), Math.max(d[2], x1), Math.max(d[3], r1)] : [x0, r0, x1, r1];
      F.touched = true;
    }
    _floorPlot(X, Z, fn) {
      const G = this.art.floor;
      const r = Math.floor(HY + EYE * (ZF / Z) - ROW0);
      if (r < 0 || r >= G.NR) return;
      const wi = G.rwid[r];
      let i = (X + PER / 2) * G.rsr[r];
      i = Math.floor(((i % wi) + wi) % wi);
      fn(r * G.TW + i, r, i);
      const d = this.F.dirty;
      this.F.dirty = d ? [Math.min(d[0], i), Math.min(d[1], r), Math.max(d[2], i), Math.max(d[3], r)] : [i, r, i, r];
      this.F.touched = true;
    }
    _floorLine(X0, Z0, X1, Z1, w, cDark, lip) {
      const F = this.F, TW = this.art.floor.TW;
      const n = Math.max(1, Math.ceil(hyp(X1 - X0, Z1 - Z0) / 0.4));
      for (let j = 0; j <= n; j++) {
        const t = j / n, X = U.lerp(X0, X1, t), Z = U.lerp(Z0, Z1, t);
        for (let q = 0; q < w; q++) this._floorPlot(X + q * 0.7, Z, (k) => {
          F.pix[k] = cDark;
          if (lip && k + TW < F.pix.length) F.pix[k + TW] = mixp(F.pix[k + TW], lip, 0.45);
        });
      }
    }
    _flushFloor() {
      const F = this.F, d = F.dirty;
      if (!d) return;
      F.dirty = null;
      const G = this.art.floor, x0 = U.clamp(d[0] | 0, 0, G.TW - 1), y0 = U.clamp(d[1] | 0, 0, G.NR - 1);
      const x1 = U.clamp(Math.ceil(d[2]), 0, G.TW - 1), y1 = U.clamp(Math.ceil(d[3]) + 1, 0, G.NR - 1);
      if (x1 >= x0 && y1 >= y0) F.ctx.putImageData(F.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    }
    _flushLayers() {
      for (const L of this.cutLayers) {
        const d = L.dirty;
        if (!d || typeof d === 'string') continue;
        L.dirty = 'used';
        const x0 = U.clamp(d[0] | 0, 0, L.w - 1), y0 = U.clamp(d[1] | 0, 0, L.h - 1);
        const x1 = U.clamp(d[2] | 0, 0, L.w - 1), y1 = U.clamp(d[3] | 0, 0, L.h - 1);
        if (!(x1 >= x0 && y1 >= y0)) continue;
        L.ctx.clearRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
        L.ctx.putImageData(L.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
        if (y1 >= L.opaq - 1) L.opaq = this._opaqScan(L);
      }
    }
    _markLayer(L, x0, y0, x1, y1) {
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
      x1 = Math.min(L.w - 1, Math.ceil(x1)); y1 = Math.min(L.h - 1, Math.ceil(y1));
      if (!(x1 >= x0 && y1 >= y0)) return;
      const d = L.dirty;
      L.dirty = d && d !== 'clean' && d !== 'used' ? [Math.min(d[0], x0), Math.min(d[1], y0), Math.max(d[2], x1), Math.max(d[3], y1)] : [x0, y0, x1, y1];
    }
    // layer canvas coordinate of a screen point, using the layer's last blit
    // (the tile copy nearest the screen center for tiled layers)
    _layerXY(L, sx, sy) {
      return [(sx - L.dx) / L.e, (sy - L.dy) / L.e];
    }
    _layerPrep(L) {
      // compute the layer transform for the current camera (same as _blit)
      const c = this.c, k = this.kS(L.s), e = k / L.s;
      let dx = W / 2 + c.shx + (-L.ox - W / 2) * e - c.x * k;
      const dy = HY + c.shy + (c.hgt - EYE) * k + (-L.oy - HY) * e;
      if (L.tile) {
        const dw = L.w * e;
        const cxs = (W / 2 - dx) / dw; // tile index covering the screen center
        dx += Math.floor(cxs) * dw;
      }
      L.dx = dx; L.dy = dy; L.e = e;
    }

    // =========================================================== drawing
    drawBack(ctx, cam) {
      if (!this.gfx || !ctx) return;
      this._cam(cam);
      this._flushFloor();
      this._flushLayers();
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const tr = this.tr;
      if (!tr) this._world(ctx, this.mode);
      else if (tr.type === 'expand') this._drawExpand(ctx, tr);
      else this._drawShatter(ctx, tr);
      // stage-wide effects (any world)
      this._drawRings(ctx, WA);
      this._drawParts(ctx, WA, 0);
      this._drawParts(ctx, WA, 1);
      this._drawCuts(ctx, false);
      const dk = U.clamp(this.darken || 0, 0, 1);
      if (dk > 0) {
        ctx.globalAlpha = dk * 0.72;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }
    drawFront(ctx, cam) {
      if (!this.gfx || !ctx) return;
      this._cam(cam);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      this.fa = 1 - U.clamp(this.darken || 0, 0, 1) * 0.6;
      const vis = this._visible();
      if (vis.n) {
        this._clipWorld(ctx, 'normal', () => {
          this._drawRubble(ctx, true);
          this._drawParts(ctx, WN, 2);
        });
      }
      this._drawParts(ctx, WA, 2);
      if (vis.v) this._clipWorld(ctx, 'void', () => this._voidFront(ctx));
      if (vis.s) this._clipWorld(ctx, 'shrine', () => this._shrineFront(ctx));
      this._drawCuts(ctx, true);
      ctx.restore();
      this.fa = 1;
    }
    // Run fn with the clip matching where world w is visible (clash halves,
    // expanding circle) so front effects stay inside their domain.
    _clipWorld(ctx, w, fn) {
      const tr = this.tr, cl = this.cl;
      const has = (m) => m === w || (m === 'clash' && (cl.left === w || cl.right === w));
      ctx.save();
      if (tr && tr.type === 'expand') {
        const inTo = has(tr.to), inFrom = has(tr.from);
        if (inTo && !inFrom) { this._expandPath(ctx, tr); ctx.clip(); }
        else if (inFrom && !inTo) { ctx.beginPath(); ctx.rect(0, 0, W, H); this._expandPath(ctx, tr, true); ctx.clip('evenodd'); }
      }
      const clash = tr ? tr.type === 'expand' && tr.to === 'clash' : this.mode === 'clash';
      if (clash && cl.left !== cl.right) {
        if (cl.left === w) { this._clashPath(ctx, -1); ctx.clip(); }
        else if (cl.right === w) { this._clashPath(ctx, 1); ctx.clip(); }
      }
      fn();
      ctx.restore();
    }
    _world(ctx, w) {
      if (w === 'void') this._drawVoid(ctx);
      else if (w === 'shrine') this._drawShrine(ctx);
      else if (w === 'clash') this._drawClash(ctx);
      else this._drawArena(ctx);
    }

    // Blit a parallax layer (tiled horizontally), then its scar glows.
    // Blit a parallax layer (tiled horizontally), then its scar glows. Rows
    // below lim are hidden behind nearer opaque layers and are skipped.
    _blit(ctx, L, drift = 0, lim = H) {
      this._layerPrep(L);
      const e = L.e, dw = L.w * e;
      let dx = L.dx + drift * e, dy = L.dy;
      const crisp = Math.abs(e - 1) < 0.002;
      if (crisp) { dx = Math.round(dx); dy = Math.round(dy); }
      let sh = L.h;
      if (lim < dy + L.h * e) sh = Math.max(0, Math.min(L.h, Math.ceil((lim - dy) / e) + 1));
      if (sh > 0) {
        const dh = sh * e;
        ctx.imageSmoothingEnabled = !crisp && L.s < 0.5;
        if (L.tile) {
          let x = dx % dw;
          if (x > 0) x -= dw;
          for (; x < W; x += dw) ctx.drawImage(L.cv, 0, 0, L.w, sh, x, dy, dw + (crisp ? 0 : 0.5), dh);
        } else ctx.drawImage(L.cv, 0, 0, L.w, sh, dx, dy, dw, dh);
        ctx.imageSmoothingEnabled = false;
      }
      const bot = dy + L.h * e;
      if (L.bottom && bot < lim) { ctx.fillStyle = L.bottom; ctx.fillRect(0, Math.floor(bot), W, Math.ceil(lim - bot) + 1); }
      if (this.holes.length || this.seams.length) this._layerGlows(ctx, L);
    }
    // first canvas row from which the layer is fully opaque (used for culling)
    _opaqScan(L) {
      const d = L.pix, w = L.w;
      for (let y = L.h - 1; y >= 0; y--) {
        const o = y * w;
        for (let x = 0; x < w; x++) if (d[o + x] >>> 24 !== 255) return y + 1;
      }
      return 0;
    }
    _tileX(L, sx) {
      if (!L.tile) return sx;
      const dw = L.w * L.e;
      return sx + Math.round((W / 2 - sx) / dw) * dw;
    }
    _layerGlows(ctx, L) {
      let any = false;
      for (const h of this.holes) if (h.L === L) any = true;
      for (const s of this.seams) for (const ln of s.lines) if (ln.L === L) any = true;
      if (!any) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const e = L.e;
      for (const h of this.holes) {
        if (h.L !== L) continue;
        const ax = this._tileX(L, L.dx + h.ax * e), bx = ax + h.len * e, cy = L.dy + h.cy * e, r = h.rr * e;
        const k = h.heat;
        ctx.beginPath();
        ctx.moveTo(ax, cy - r); ctx.lineTo(bx, cy - r); ctx.arc(bx, cy, r, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(ax, cy + r); ctx.arc(ax, cy, r, Math.PI / 2, Math.PI * 1.5);
        ctx.strokeStyle = '#7a2aff'; ctx.globalAlpha = 0.35 * k * (h.k || 1); ctx.lineWidth = 7 * e; ctx.stroke();
        ctx.strokeStyle = k > 0.5 ? '#ffffff' : '#d8a0ff'; ctx.globalAlpha = Math.min(1, k * 1.2) * (h.k || 1); ctx.lineWidth = 1.5 * e; ctx.stroke();
      }
      for (const s of this.seams) for (const ln of s.lines) {
        if (ln.L !== L) continue;
        const sx = this._tileX(L, L.dx + ln.x * e), sy = L.dy + ln.y * e, k = s.heat;
        ctx.beginPath(); ctx.moveTo(sx - ln.dx * 2000, sy - ln.dy * 2000); ctx.lineTo(sx + ln.dx * 2000, sy + ln.dy * 2000);
        ctx.strokeStyle = k > 0.6 ? '#ffe0d0' : '#ff3020'; ctx.globalAlpha = 0.3 * k; ctx.lineWidth = 6; ctx.stroke();
        ctx.strokeStyle = k > 0.4 ? '#ffffff' : '#ff6040'; ctx.globalAlpha = Math.min(1, k * 1.3); ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.restore();
    }

    // Floor: one scanline per screen row sampling the pre-warped texture.
    _drawFloor(ctx) {
      const G = this.art.floor, F = this.F, c = this.c;
      const y0 = Math.max(0, Math.floor(this.py(0, SB)));
      const inv0 = 1 - 1 / c.ez, zW = G.zBand, zLo = G.zLo;
      for (let y = y0; y < H; y++) {
        const kS = (y + 0.5 - HY - c.shy) / c.hgt;
        if (kS <= 0.001) continue;
        let Z = ZF * (1 / kS + inv0);
        if (Z > ZB) Z = ZB - 0.01;
        if (Z < zLo) Z = zLo + ((((Z - zLo) % zW) + zW) % zW);
        let r = Math.floor(HY + (EYE * ZF) / Z - ROW0);
        if (r < 0) r = 0; else if (r >= G.NR) r = G.NR - 1;
        const sr = G.rsr[r], rw = G.rwid[r];
        const srcW = (W * sr) / kS, sc = kS / sr;
        let sx = rw / 2 + (c.x - (W / 2 + c.shx) / kS) * sr;
        sx = ((sx % rw) + rw) % rw;
        if (Math.abs(sc - 1) < 0.002) sx = Math.round(sx) % Math.floor(rw);
        if (sx + srcW <= rw) ctx.drawImage(F.cv, sx, r, srcW, 1, 0, y, W, 1);
        else {
          let dx = 0, rem = srcW;
          while (rem > 0.01) {
            const take = Math.min(rem, rw - sx);
            ctx.drawImage(F.cv, sx, r, take, 1, dx, y, take * sc, 1);
            dx += take * sc; rem -= take; sx = 0;
          }
        }
      }
    }

    _drawArena(ctx) {
      const L = this.L, c = this.c, t = this.t, G = this.cv.glow;
      // overdraw culling: each layer only needs rows above the nearest opaque cover
      const seq = this._seq || (this._seq = [L.sky, L.cloudLo, L.cloudHi, L.city1, L.city2, L.midfar, L.town, L.mid, L.near]);
      let lim = Math.min(H, Math.max(0, Math.floor(this.py(0, SB))) + 1);
      for (let i = seq.length - 1; i >= 0; i--) {
        const q = seq[i];
        this._layerPrep(q);
        q.lim = lim;
        if (q.opaq < q.h) lim = Math.min(lim, Math.ceil(q.dy + q.opaq * q.e));
      }
      this._blit(ctx, L.sky, 0, L.sky.lim);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.42 + 0.08 * Math.sin(t * 0.021);
      ctx.drawImage(G.sun, Math.round(SUN.x + c.shx - 90), Math.round(SUN.y + c.shy - 90));
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      this._blit(ctx, L.cloudLo, t * 0.035, L.cloudLo.lim);
      this._blit(ctx, L.cloudHi, -t * 0.05, L.cloudHi.lim);
      this._blit(ctx, L.city1, 0, L.city1.lim);
      this._drawParts(ctx, WN, -1);
      this._blit(ctx, L.city2, 0, L.city2.lim);
      // flickering fires in the city
      ctx.globalCompositeOperation = 'lighter';
      for (const f of this.art.city2.fires) {
        ctx.globalAlpha = 0.16 + 0.12 * Math.sin(t * 0.17 + f[0]) * Math.sin(t * 0.07 + f[1]);
        const sx = this._tileX(L.city2, L.city2.dx + f[0] * L.city2.e), sy = L.city2.dy + f[1] * L.city2.e;
        ctx.drawImage(G.orange, Math.round(sx - 7), Math.round(sy - 7), 14, 14);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      this._blit(ctx, L.midfar, 0, L.midfar.lim);
      this._blit(ctx, L.town, 0, L.town.lim);
      this._blit(ctx, L.mid, 0, L.mid.lim);
      this._drawFloaters(ctx);
      this._drawParts(ctx, WN, 0);
      this._blit(ctx, L.near, 0, L.near.lim);
      this._drawFloor(ctx);
      this._floorFX(ctx);
      this._drawProps(ctx);
      this._drawRubble(ctx, false);
      this._drawChunks(ctx);
      this._drawParts(ctx, WN, 1);
    }
    _drawFloaters(ctx) {
      const t = this.t, R = this.cv.rocks;
      for (const f of this.floaters) {
        const k = this.kS(f.s);
        const sx = this.px(f.X, f.s), sy = this.py(f.Y + Math.sin(t * 0.021 + f.ph) * 6, f.s);
        if (sx < -20 || sx > W + 20) continue;
        const cv = R[f.si][(f.v + ((t * 0.02 + f.ph) | 0)) & 3];
        ctx.drawImage(cv, Math.round(sx - cv.width / 2), Math.round(sy - cv.height / 2));
        if ((t + f.ph * 10) % 90 < 45) { ctx.fillStyle = '#7a3ac0'; ctx.fillRect(Math.round(sx), Math.round(sy + cv.height / 2 + 2 + Math.sin(t * 0.1 + f.ph) * 1.5), 1, 1); }
      }
    }
    _floorFX(ctx) {
      const G = this.cv.glow, t = this.t;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const k1 = this.kS(1);
      for (const f of this.fires) {
        const k = Math.min(1, f.life / 40) * Math.min(1, (f.max - f.life) / 6 + 0.3);
        const sx = this.px(f.x, 1), sy = this.py(0, 1), w = (f.r * 2.4 + 90) * k1;
        ctx.globalAlpha = 0.5 * k * (0.85 + 0.15 * Math.random());
        ctx.drawImage(G.fire, sx - w / 2, sy - w * 0.17, w, w * 0.34);
        ctx.globalAlpha = 0.25 * k;
        ctx.drawImage(G.fire, sx - w * 0.4, sy - w * 0.55, w * 0.8, w * 0.8);
      }
      for (const g of this.gashes) {
        const k = g.heat;
        ctx.beginPath();
        if (g.type === 'recede') {
          ctx.moveTo(this.px(g.x, SB), this.py(0, SB));
          ctx.lineTo(this.px(g.x, 1.7), this.py(0, 1.7));
        } else {
          const s = ZF / g.z;
          ctx.moveTo(this.px(g.x0, s), this.py(0, s)); ctx.lineTo(this.px(g.x1, s), this.py(0, s));
        }
        ctx.strokeStyle = g.col || (k > 0.6 ? '#fff0e0' : '#ff4a20'); ctx.globalAlpha = Math.min(1, k * 1.2); ctx.lineWidth = 1; ctx.stroke();
        ctx.globalAlpha = 0.3 * k; ctx.lineWidth = 5; ctx.stroke();
      }
      ctx.restore();
    }
    _drawRings(ctx, w) {
      if (!this.rings.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const r of this.rings) {
        if (r.w !== w) continue;
        const s = r.s || 1, k = this.kS(s), sx = this.px(r.x, s), sy = this.py(0, s);
        const a = r.life / (r.max || (r.max = r.life + 1));
        ctx.beginPath();
        ctx.ellipse(sx, sy, Math.max(0.5, r.r * k), Math.max(0.5, r.r * k * 0.17), 0, 0, Math.PI * 2);
        ctx.strokeStyle = w === WV ? '#9ad0ff' : w === WS ? '#ff4a3a' : '#ffe0b0';
        ctx.globalAlpha = a * (w === WA ? 0.8 : 0.45);
        ctx.lineWidth = w === WA ? 2 : 1;
        ctx.stroke();
      }
      ctx.restore();
    }
    _drawProps(ctx) {
      const G = this.cv.glow, t = this.t;
      for (const p of this.props) {
        const k = this.kS(p.s), e = k / p.s, T = p.T;
        const bx = this.px(p.X, p.s), by = this.py(0, p.s);
        const dw = T.w * e, dh = T.h * e;
        if (bx + dw < -10 || bx - dw > W + 10) continue;
        let dx = bx - p.ax * e, dy = by - dh;
        if (Math.abs(p.wob) > 0.004) {
          ctx.save(); ctx.translate(bx, by); ctx.rotate(p.wob);
          ctx.drawImage(p.cv, dx - bx, dy - by, dw, dh);
          ctx.restore();
        } else {
          if (Math.abs(e - 1) < 0.002) { dx = Math.round(dx); dy = Math.round(dy); }
          ctx.drawImage(p.cv, dx, dy, dw, dh);
        }
        if (T.glow && p.state < 2 && !p.cut) {
          const gx = dx + (p.flip ? T.w - 1 - T.glow[0] : T.glow[0]) * e, gy = dy + T.glow[1] * e;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = (0.55 + 0.2 * Math.sin(t * 0.37 + p.X) + 0.15 * Math.random()) * (1 - p.char);
          ctx.drawImage(G.lantern, gx - 14 * e, gy - 14 * e, 28 * e, 28 * e);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }
    _drawRubble(ctx, front) {
      const R = this.cv.rocks;
      for (const r of this.rubble) {
        if ((r.s > 1) !== front) continue;
        const sx = this.px(r.x, r.s), sy = this.py(0, r.s);
        if (sx < -12 || sx > W + 12) continue;
        const cv = R[r.si][r.v];
        ctx.drawImage(cv, Math.round(sx - cv.width / 2), Math.round(sy - cv.height + 2));
      }
    }
    _drawChunks(ctx) {
      for (const ch of this.chunks) {
        const k = this.kS(ch.s), e = k / ch.s;
        const sx = this.px(ch.x, ch.s), sy = this.py(ch.y, ch.s);
        ctx.save();
        ctx.globalAlpha = ch.a;
        ctx.translate(sx, sy);
        ctx.rotate(ch.rot);
        ctx.drawImage(ch.cv, -ch.ax * e, -ch.ay * e, ch.w * e, ch.h * e);
        ctx.restore();
      }
    }
    // pass: -1 smoke columns, 0 behind the balustrade, 1 floor (behind
    // fighters), 2 in front of the fighters
    _drawParts(ctx, wd, pass) {
      const P = this.parts, c = this.c, cv = this.cv, t = this.t, fa = this.fa || 1;
      let comp = false;
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.w !== wd) continue;
        if (pass === -1 ? p.k !== K_COL : p.k === K_COL || (p.s < SB ? 0 : p.s <= 1 ? 1 : 2) !== pass) continue;
        const k = this.kS(p.s);
        const sx = W / 2 + c.shx + (p.x - c.x) * k, sy = HY + c.shy + (c.hgt - p.y) * k;
        if (sx < -70 || sx > W + 70 || sy < -70 || sy > H + 70) continue;
        const e = k / p.s, life = p.life / p.max;
        switch (p.k) {
          case K_EMBER: {
            if (((p.ph * 13 + t) | 0) % 13 === 0) break;
            const ci = life > 0.85 ? 0 : life > 0.62 ? 1 : life > 0.42 ? 2 : life > 0.26 ? 3 : life > 0.12 ? 4 : 5;
            const z = p.sz * (e > 1.6 ? Math.round(e) : 1);
            ctx.globalAlpha = fa;
            ctx.fillStyle = EMBER_COLS[ci];
            ctx.fillRect(Math.round(sx), Math.round(sy), z, z);
            if (p.sz > 1 && ci < 3) { ctx.fillStyle = EMBER_COLS[ci + 2]; ctx.fillRect(Math.round(sx) - 1, Math.round(sy) + z, 1, 1); }
            break;
          }
          case K_ASH:
            ctx.globalAlpha = fa;
            ctx.fillStyle = ASH_COLS[p.v % 3];
            ctx.fillRect(Math.round(sx), Math.round(sy), p.sz, 1);
            break;
          case K_MOTE: {
            const ci = Math.min(3, Math.floor((Math.sin(t * 0.2 + p.ph) * 0.5 + 0.5) * 3.99));
            ctx.globalAlpha = fa * Math.min(1, life * 3);
            ctx.fillStyle = MOTE_COLS[0];
            ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 3, 3);
            ctx.fillStyle = MOTE_COLS[ci];
            ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
            break;
          }
          case K_COL: {
            const age = 1 - life, si = age < 0.08 ? 0 : age < 0.22 ? 1 : age < 0.45 ? 2 : 3;
            const im = cv.plume[si], sc = 0.8 + age * 1.6;
            ctx.globalAlpha = Math.min(1, age * 14) * Math.pow(life, 0.8) * 0.92;
            const w = Math.round(im.width * sc), h = Math.round(im.height * sc);
            ctx.drawImage(im, Math.round(sx - w / 2), Math.round(sy - h / 2), w, h);
            break;
          }
          case K_SMOKE: case K_DUST: case K_WISP: {
            const age = 1 - life;
            const arr = p.k === K_DUST ? cv.dust : cv.smoke;
            const si = Math.min(3, p.sz + (age > 0.5 ? 1 : 0));
            const im = arr[si];
            const sc = (p.k === K_WISP ? 3.2 : 1 + age * 0.6) * (e > 1.6 ? e : 1);
            ctx.globalAlpha = fa * (p.k === K_WISP ? 0.16 * Math.min(1, life * 5, age * 8) : Math.min(1, life * 2.5) * (p.k === K_DUST ? 0.8 : 0.65));
            const w = im.width * sc, h = im.height * sc;
            ctx.drawImage(im, Math.round(sx - w / 2), Math.round(sy - h / 2), Math.round(w), Math.round(h));
            break;
          }
          case K_ROCK: {
            const im = cv.rocks[p.sz][(p.v + ((p.rot * 1.5) | 0)) & 3];
            ctx.globalAlpha = fa;
            if (e > 1.6) ctx.drawImage(im, Math.round(sx - im.width * e / 2), Math.round(sy - im.height * e / 2), im.width * e, im.height * e);
            else ctx.drawImage(im, Math.round(sx - im.width / 2), Math.round(sy - im.height / 2));
            break;
          }
          case K_SPARK: {
            if (!comp) { ctx.globalCompositeOperation = 'lighter'; comp = true; }
            const cs = p.cs || KIND_COL.hit;
            ctx.globalAlpha = fa;
            ctx.fillStyle = cs[life > 0.6 ? 0 : life > 0.3 ? 1 : 2];
            const vx = p.vx * k, vy = -p.vy * k, ln = Math.min(4, hyp(vx, vy) * 0.6);
            if (Math.abs(vx) > Math.abs(vy)) ctx.fillRect(Math.round(sx - (vx > 0 ? ln : 0)), Math.round(sy), Math.max(1, Math.round(ln)), 1);
            else ctx.fillRect(Math.round(sx), Math.round(sy - (vy > 0 ? ln : 0)), 1, Math.max(1, Math.round(ln)));
            break;
          }
          case K_FLAME: {
            const fr = (((1 - life) * 10) | 0) + p.v;
            const im = cv.flames[(fr % 8) * 3 + p.sz];
            const sc = (0.45 + 0.65 * Math.sin(Math.min(1, life * 1.15) * Math.PI)) * p.a * (e > 1.6 ? e : 1);
            const w = im.width * sc, h = im.height * sc;
            ctx.globalAlpha = fa;
            ctx.drawImage(im, Math.round(sx - w / 2), Math.round(sy - h + 2), Math.round(w), Math.round(h));
            break;
          }
          case K_DROP:
            ctx.globalAlpha = fa;
            ctx.fillStyle = DROP_COLS[p.v % 3];
            ctx.fillRect(Math.round(sx), Math.round(sy), 1, 2);
            break;
        }
      }
      ctx.globalAlpha = 1;
      if (comp) ctx.globalCompositeOperation = 'source-over';
    }
    _drawCuts(ctx, front) {
      if (!this.cuts || !this.cuts.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const q of this.cuts) {
        if (front && q.heat < 0.55) continue;
        const k = this.kS(1);
        ctx.beginPath();
        ctx.moveTo(this.px(q.x0, 1), this.py(q.y0, 1)); ctx.lineTo(this.px(q.x1, 1), this.py(q.y1, 1));
        ctx.strokeStyle = q.heat > 0.6 ? '#ffffff' : '#ff4a3a';
        ctx.globalAlpha = Math.min(1, q.heat * 1.3) * (front ? 0.8 : 1);
        ctx.lineWidth = Math.max(1, q.w * k * q.heat);
        ctx.stroke();
        ctx.strokeStyle = '#ff2a20'; ctx.globalAlpha = q.heat * 0.35; ctx.lineWidth = (q.w * 3 + 3) * q.heat; ctx.stroke();
      }
      ctx.restore();
    }

    // ------------------------------------------------------------- void
    _voidCenter(noShake) {
      const k = this.kS(0.02), c = this.c;
      return [VCX + (noShake ? 0 : c.shx) - c.x * k, VCY + (noShake ? 0 : c.shy) + (c.hgt - EYE) * k];
    }
    // The heavy void sky (nebula, stars, rotating galaxy, rays, singularity)
    // is composed into a cached canvas every other frame, without shake.
    _voidCache() {
      const t = this.t, c = this.c, cv = this.cv;
      if (!this.vsky) { this.vsky = mkCanvas(W + 80, H + 60); this.vskyCtx = this.vsky.getContext('2d'); this.vskyT = -99; }
      const [gx, gy] = this._voidCenter(true);
      if (t - this.vskyT < 2 && t >= this.vskyT && Math.abs(gx - this.vskyX) < 1 && Math.abs(gy - this.vskyY) < 1) return;
      this.vskyT = t; this.vskyX = gx; this.vskyY = gy;
      const v = this.vskyCtx, L = this.L, sx = c.shx, sy = c.shy;
      c.shx = c.shy = 0;
      v.save();
      v.imageSmoothingEnabled = false;
      v.translate(40, 30);
      this._blit(v, L.vbase);
      this._blit(v, L.vstar1, t * 0.04);
      this._blit(v, L.vstar2, t * 0.11);
      v.globalCompositeOperation = 'lighter';
      v.imageSmoothingEnabled = true;
      v.save();
      v.translate(gx, gy);
      v.fillStyle = '#4a6aff';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t * 0.0015 + Math.sin(i * 7.1) * 0.2;
        v.globalAlpha = 0.05 + 0.03 * Math.sin(t * 0.03 + i);
        v.beginPath(); v.moveTo(0, 0);
        v.lineTo(Math.cos(a - 0.04) * 700, Math.sin(a - 0.04) * 420);
        v.lineTo(Math.cos(a + 0.04) * 700, Math.sin(a + 0.04) * 420);
        v.fill();
      }
      v.save(); v.scale(1.55, 0.5); v.rotate(t * 0.0021); v.globalAlpha = 0.9;
      v.drawImage(cv.galaxy, -220, -220); v.restore();
      v.save(); v.scale(1.0, 0.34); v.rotate(-t * 0.0012 + 1.3); v.globalAlpha = 0.35;
      v.drawImage(cv.galaxy, -220, -220); v.restore();
      v.globalAlpha = 0.5 + 0.15 * Math.sin(t * 0.05);
      v.drawImage(cv.glow.blue, -120, -60, 240, 120);
      v.globalAlpha = 0.35;
      v.drawImage(cv.glow.white, -64, -64, 128, 128);
      v.restore();
      v.globalCompositeOperation = 'source-over';
      v.globalAlpha = 1;
      v.imageSmoothingEnabled = false;
      v.drawImage(cv.hole, Math.round(gx - 220), Math.round(gy - 105));
      v.globalCompositeOperation = 'lighter';
      v.imageSmoothingEnabled = true;
      v.globalAlpha = 0.55 + 0.2 * Math.sin(t * 0.09);
      v.drawImage(cv.glow.white, gx - 110, gy - 8, 220, 16);
      v.restore();
      c.shx = sx; c.shy = sy;
    }
    _drawVoid(ctx) {
      const c = this.c, t = this.t;
      this._voidCache();
      ctx.drawImage(this.vsky, Math.round(c.shx - 40), Math.round(c.shy - 30));
      const [gx, gy] = this._voidCenter();
      this._voidStreaks(ctx, gx, gy, 1, 0);
      this._voidFloor(ctx, gx, gy);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.vm.length; i += 2) {
        const m = this.vm[i];
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 0.1 + m.ph);
        ctx.fillStyle = i % 4 ? '#9ad8ff' : '#ffffff';
        ctx.fillRect(Math.round(m.x), Math.round(m.y), m.sz, m.sz);
      }
      ctx.restore();
    }
    _voidStreaks(ctx, gx, gy, ak, minR) {
      const cols = ['#ffffff', '#9ad8ff', '#8a7aff'];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 1;
      for (let band = 0; band < 2; band++) for (let ci = 0; ci < 3; ci++) {
        ctx.beginPath();
        let n = 0;
        for (const s of this.vs) {
          if (s.c !== ci || s.r < 32 || s.r < minR || (s.r > 200) !== (band === 1)) continue;
          const ca = Math.cos(s.a), sa = Math.sin(s.a) * 0.64, r1 = s.r * (1 + s.len);
          ctx.moveTo(gx + ca * s.r, gy + sa * s.r); ctx.lineTo(gx + ca * r1, gy + sa * r1);
          n++;
        }
        if (!n) continue;
        ctx.strokeStyle = cols[ci];
        ctx.globalAlpha = (band ? 0.75 : 0.35) * ak * (this.fa || 1);
        ctx.lineWidth = band ? 1.5 : 1;
        ctx.stroke();
      }
      ctx.restore();
    }
    _voidFloor(ctx, gx, gy) {
      const c = this.c, t = this.t, hy = Math.round(HY + c.shy);
      if (hy >= H) return;
      ctx.drawImage(this.cv.voidFloor, 0, hy);
      if (hy + 240 < H) { ctx.fillStyle = '#010103'; ctx.fillRect(0, hy + 240, W, H); }
      ctx.save();
      ctx.beginPath(); ctx.rect(0, hy, W, H - hy); ctx.clip();
      ctx.translate(0, hy); ctx.scale(1, -0.55); ctx.translate(0, -hy);
      ctx.globalAlpha = 0.5;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.vsky, c.shx - 40, c.shy - 30);
      ctx.restore();
      ctx.save();
      ctx.beginPath(); ctx.rect(0, hy, W, H - hy); ctx.clip();
      ctx.translate(0, hy); ctx.scale(1, -0.55); ctx.translate(0, -hy);
      this._voidStreaks(ctx, gx, gy, 0.45, 60);
      ctx.restore();
      ctx.drawImage(this.cv.floorFade, 0, hy);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // faint perspective lines converging on the singularity's reflection
      ctx.strokeStyle = '#3a5aff';
      ctx.globalAlpha = 0.07;
      ctx.beginPath();
      for (let i = -10; i <= 10; i++) { ctx.moveTo(gx + i * 6, hy); ctx.lineTo(gx + i * 140 - c.x * 0.5 * this.kS(1), H); }
      ctx.stroke();
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#4a7aff'; ctx.fillRect(0, hy - 1, W, 3);
      ctx.globalAlpha = 0.95; ctx.fillStyle = '#e8f4ff'; ctx.fillRect(0, hy, W, 1);
      ctx.restore();
      this._drawRings(ctx, WV);
    }
    _voidFront(ctx) {
      const [gx, gy] = this._voidCenter();
      this._voidStreaks(ctx, gx, gy, 0.35, 260);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i < this.vm.length; i += 4) {
        const m = this.vm[i];
        ctx.globalAlpha = (0.4 + 0.4 * Math.sin(this.t * 0.13 + m.ph)) * this.fa;
        ctx.fillStyle = '#cfe8ff';
        ctx.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
      }
      ctx.restore();
    }

    // ----------------------------------------------------------- shrine
    _drawShrine(ctx) {
      const L = this.L, c = this.c, t = this.t, cv = this.cv, u = this.upCtx, Sh = this.art.shrine;
      u.imageSmoothingEnabled = false;
      this._blit(u, L.ssky);
      this._blit(u, L.smount);
      const s = SHRINE_S, k = this.kS(s), e = k / s;
      const sx = this.px(this.shrineX, s), yb = this.py(0, s);
      u.save();
      u.globalCompositeOperation = 'lighter';
      u.globalAlpha = 0.55 + 0.1 * Math.sin(t * 0.05);
      u.drawImage(cv.glow.crimson, sx - 200 * e, yb - 270 * e, 400 * e, 330 * e);
      u.restore();
      ctx.drawImage(this.up, 0, 0);
      // blood pool: mirror of the far world plus the shrine's own reflection
      const ym = Math.max(0, Math.ceil(this.py(0, 0.12)));
      if (ym < H) {
        ctx.fillStyle = '#0a0102';
        ctx.fillRect(0, ym, W, H - ym);
        ctx.globalAlpha = 0.55;
        for (let y = ym; y < H; y += 2) {
          const src = 2 * ym - y - 2;
          if (src < 0) break;
          const amp = 0.6 + (y - ym) * 0.025;
          ctx.drawImage(this.up, 0, src, W, 2, Math.round(Math.sin(y * 0.31 + t * 0.07) * amp), y, W, 2);
        }
        const dw = Sh.w * e, dxs = sx - Sh.ax * e;
        ctx.globalAlpha = 0.6;
        for (let y = Math.max(ym, Math.ceil(yb)); y < H; y += 2) {
          const sr = Sh.h - (y - yb) / e - 2;
          if (sr < 0) break;
          const amp = 0.8 + (y - yb) * 0.03;
          ctx.drawImage(cv.shrine, 0, sr, Sh.w, 2 / e, Math.round(dxs + Math.sin(y * 0.29 + t * 0.08) * amp), y, dw, 2);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(60,0,6,0.38)';
        ctx.fillRect(0, ym, W, H - ym);
        // mist line hiding the far mirror seam
        ctx.fillStyle = 'rgba(90,8,10,0.5)';
        ctx.fillRect(0, ym - 1, W, 3);
      }
      // the shrine
      let dxs = sx - Sh.ax * e, dys = yb - Sh.h * e;
      if (Math.abs(e - 1) < 0.002) { dxs = Math.round(dxs); dys = Math.round(dys); }
      ctx.drawImage(cv.shrine, dxs, dys, Sh.w * e, Sh.h * e);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22 + 0.12 * Math.sin(t * 0.06) + 0.06 * Math.random();
      ctx.drawImage(cv.glow.red, dxs + (Sh.mouth[0] - 66) * e, dys + (Sh.mouth[1] - 26) * e, 132 * e, 60 * e);
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 0.11);
      for (let i = -1; i <= 1; i++) ctx.drawImage(cv.glow.red, dxs + (Sh.ax + i * 28 - 10) * e, dys + (Sh.eyes - 6) * e, 20 * e, 12 * e);
      ctx.globalAlpha = 0.45 + 0.15 * Math.sin(t * 0.2);
      for (const q of [-1, 1]) ctx.drawImage(cv.glow.red, dxs + (Sh.ax + q * 118 - 9) * e, dys + 107 * e, 18 * e, 18 * e);
      ctx.restore();
      // skulls jutting from the pool (with reflections)
      for (const [X, ss, si] of SKULLS) {
        const kk = this.kS(ss), ee = kk / ss, im = cv.skulls[si];
        const bx = this.px(this.shrineX + X, ss), by = this.py(0, ss);
        const w = im.width * ee, h = im.height * ee;
        if (bx + w < 0 || bx - w > W) continue;
        ctx.globalAlpha = 0.35;
        ctx.save(); ctx.translate(0, by); ctx.scale(1, -0.7); ctx.drawImage(im, Math.round(bx - w / 2), -h * 0.15, w, h); ctx.restore();
        ctx.globalAlpha = 1;
        ctx.drawImage(im, Math.round(bx - w / 2), Math.round(by - h * 0.82), w, h);
        ctx.fillStyle = '#5a0a0c';
        ctx.fillRect(Math.round(bx - w * 0.35), Math.round(by), Math.round(w * 0.7), 1);
      }
      // glints on the pool surface
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) {
        const gxp = (hash(i, (t / 24) | 0, 9) * W) | 0, gyp = ym + 4 + ((hash(i, 3, 9) * (H - ym - 4)) | 0);
        ctx.globalAlpha = 0.3 * Math.sin(((t % 24) / 24) * Math.PI);
        ctx.fillStyle = i % 3 ? '#a0141a' : '#ff5040';
        ctx.fillRect(gxp, gyp, 3 + (i % 4) * 2, 1);
      }
      ctx.restore();
      this._drawRings(ctx, WS);
      this._drawParts(ctx, WS, 1);
    }
    _shrineFront(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'square';
      for (const s of this.slashes) {
        const k = s.life / s.max;
        ctx.beginPath();
        ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1);
        if (s.cross) {
          const mx = (s.x0 + s.x1) / 2, my = (s.y0 + s.y1) / 2, dx = (s.y1 - s.y0) * 0.35, dy = -(s.x1 - s.x0) * 0.35;
          ctx.moveTo(mx - dx, my - dy); ctx.lineTo(mx + dx, my + dy);
        }
        ctx.strokeStyle = '#ff1a10'; ctx.globalAlpha = 0.45 * k * this.fa; ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = k > 0.6 ? '#ffffff' : '#ff7060'; ctx.globalAlpha = k * this.fa; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.restore();
    }

    // ------------------------------------------------ clash / transitions
    _clashPts() {
      const sx = this.cl.split * W, t = this.t, pts = this._cpts || (this._cpts = []);
      pts.length = 0;
      for (let y = -12; y <= H + 12; y += 12) pts.push(sx + Math.sin(y * 0.045 + t * 0.13) * 7 + Math.sin(y * 0.11 - t * 0.21) * 4, y);
      return pts;
    }
    _clashPath(ctx, side) {
      const pts = this._clashPts(), ex = side < 0 ? -40 : W + 40;
      ctx.beginPath();
      ctx.moveTo(ex, -20);
      for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.lineTo(ex, H + 20);
      ctx.closePath();
    }
    _drawClash(ctx) {
      const lw = this.cl.left === 'clash' ? 'void' : this.cl.left, rw = this.cl.right === 'clash' ? 'shrine' : this.cl.right;
      ctx.save(); this._clashPath(ctx, -1); ctx.clip(); this._world(ctx, lw); ctx.restore();
      ctx.save(); this._clashPath(ctx, 1); ctx.clip(); this._world(ctx, rw); ctx.restore();
      // crackling boundary
      const pts = this._clashPts();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const bolt = () => {
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) {
          const x = pts[i] + (Math.random() - 0.5) * 9, y = pts[i + 1] + (Math.random() - 0.5) * 4;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
      };
      const lc = RIM_OF[lw] || '#ffffff', rc = RIM_OF[rw] || '#ffffff';
      bolt(); ctx.strokeStyle = lc; ctx.globalAlpha = 0.25; ctx.lineWidth = 16; ctx.stroke();
      bolt(); ctx.strokeStyle = rc; ctx.globalAlpha = 0.3; ctx.lineWidth = 8; ctx.stroke();
      bolt(); ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.9; ctx.lineWidth = 2; ctx.stroke();
      // forks
      ctx.lineWidth = 1;
      for (let f = 0; f < 5; f++) {
        const i = ((Math.random() * (pts.length / 2)) | 0) * 2;
        let x = pts[i], y = pts[i + 1];
        const dir = Math.random() < 0.5 ? -1 : 1;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let j = 0; j < 4; j++) { x += dir * U.rand(4, 12); y += U.rand(-10, 10); ctx.lineTo(x, y); }
        ctx.strokeStyle = dir < 0 ? lc : rc; ctx.globalAlpha = 0.7; ctx.stroke();
      }
      ctx.restore();
    }
    _expandPath(ctx, tr, noBegin) {
      const p = Math.min(1, tr.t / tr.n), e = U.ease.out3(p);
      const cx = this.px(tr.ox, 1), cy = this.py(75, 1);
      const R0 = hyp(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 80;
      const R = Math.max(1, R0 * e);
      if (!noBegin) ctx.beginPath();
      const N = 72;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2, sp = hash(i % N, tr.seed, 3);
        const r = R * (1 + 0.05 * Math.sin(a * 7 + this.t * 0.3) + (sp > 0.72 ? (sp - 0.72) * 0.9 * (1 - e * 0.6) : 0));
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      return R;
    }
    _drawExpand(ctx, tr) {
      this._world(ctx, tr.from);
      ctx.save();
      this._expandPath(ctx, tr);
      ctx.clip();
      this._world(ctx, tr.to);
      ctx.restore();
      // bright rim
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const col = RIM_OF[tr.to] || '#ffffff', k = 1 - Math.min(1, tr.t / tr.n) * 0.7;
      this._expandPath(ctx, tr);
      ctx.strokeStyle = col; ctx.globalAlpha = 0.3 * k; ctx.lineWidth = 18; ctx.stroke();
      ctx.globalAlpha = 0.6 * k; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.9 * k; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
    _drawShatter(ctx, tr) {
      this._world(ctx, tr.to);
      if (!tr.shards) {
        this.snapCtx.clearRect(0, 0, W, H);
        this.snapCtx.imageSmoothingEnabled = false;
        this._world(this.snapCtx, tr.from);
        tr.shards = this._buildShards(tr);
      }
      const t = tr.t, n = tr.n, crack = 5;
      ctx.save();
      for (const s of tr.shards) {
        const tt = Math.max(0, t - crack - s.delay);
        const a = 1 - U.clamp((t - n * 0.55) / (n * 0.45), 0, 1);
        if (a <= 0) continue;
        const dx = s.vx * tt, dy = s.vy * tt + 0.55 * tt * tt, rot = s.vr * tt;
        if (s.cy + dy - 60 > H) continue;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(s.cx + dx, s.cy + dy); ctx.rotate(rot); ctx.translate(-s.cx, -s.cy);
        ctx.beginPath(); ctx.moveTo(s.p[0], s.p[1]); ctx.lineTo(s.p[2], s.p[3]); ctx.lineTo(s.p[4], s.p[5]); ctx.closePath();
        ctx.save(); ctx.clip(); ctx.drawImage(this.snap, 0, 0); ctx.restore();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = a * (t < crack ? 0.9 : 0.35); ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
    _buildShards(tr) {
      const cols = 8, rows = 5, V = [], out = [];
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
        let x = (i / cols) * W, y = (j / rows) * H;
        if (i > 0 && i < cols) x += (Math.random() - 0.5) * (W / cols) * 0.7;
        if (j > 0 && j < rows) y += (Math.random() - 0.5) * (H / rows) * 0.7;
        V.push([x, y]);
      }
      const ox = this.px(tr.ox, 1), oy = H * 0.45;
      const tri = (a, b, c) => {
        const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3;
        const d = hyp(cx - ox, cy - oy);
        out.push({ p: [a[0], a[1], b[0], b[1], c[0], c[1]], cx, cy, delay: d / 70, vx: (cx - ox) * 0.025 + U.rand(-1, 1), vy: U.rand(-4, -0.5), vr: U.rand(-0.07, 0.07) });
      };
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const a = V[j * (cols + 1) + i], b = V[j * (cols + 1) + i + 1], c = V[(j + 1) * (cols + 1) + i + 1], d = V[(j + 1) * (cols + 1) + i];
        if (Math.random() < 0.5) { tri(a, b, c); tri(a, c, d); } else { tri(a, b, d); tri(b, c, d); }
      }
      return out;
    }

    // ===================================================== reactions API
    impact(x, y, power = 0.5, kind = 'hit') {
      x = num(x); y = num(y);
      power = U.clamp(num(power, 0.5), 0, 1.5);
      const km = KIND_DMG[kind] != null ? KIND_DMG[kind] : 0.5;
      this._damage(x, 70 + 150 * power, power * 34 * km, power);
      if (kind === 'wall' || power > 0.8) this.rumble = Math.max(this.rumble, power * 0.6);
      if (!this.gfx) return;
      const cols = KIND_COL[kind] || KIND_COL.hit;
      this._sparks(x, y, Math.round(4 + power * 14), 2 + power * 6, cols);
      if (y < 40) {
        this._dustBurst(x, 0, Math.round(2 + power * 5), 0.5 + power);
        if (power > 0.4) this._rocksAt(x, 1, 1, Math.round(power * 6), 2 + power * 3);
      }
      if (kind === 'wall') {
        const dir = x > 0 ? -1 : 1;
        this._rocksAt(x, y, 0.92, Math.round(4 + power * 10), 3, dir * 2.5);
        for (let i = 0; i < 4; i++) this._spawn(K_DUST, x, y + U.rand(-30, 30), 0.95, dir * U.rand(0.5, 2), U.rand(-0.2, 0.4), U.rand(30, 60), 1 + (i & 1), WA);
        this.shakeProps(power * 0.6);
      }
      if (kind === 'fire') for (let i = 0; i < 8 * power; i++) this._spawn(K_EMBER, x, y, U.rand(0.95, 1.1), U.rand(-2, 2), U.rand(0.5, 3), U.rand(30, 70), 2, WA);
      if (y < 12 && power > 0.65) this._crackDecal(x, power);
      const c = U.hex(cols[2]);
      this._flash(power * 0.22, [c[0] / 200, c[1] / 200, c[2] / 200]);
    }
    blast(x, y, radius = 80, power = 1) {
      x = num(x); y = num(y);
      radius = U.clamp(num(radius, 80), 10, 600); power = U.clamp(num(power, 1), 0, 2);
      this._damage(x, radius * 2.4 + 60, power * 110, power * 2);
      this.rumble = Math.max(this.rumble, power);
      if (!this.gfx) return;
      for (let i = this.rubble.length - 1; i >= 0; i--) {
        const r = this.rubble[i], d = r.x - x;
        if (Math.abs(d) > radius * 1.8) continue;
        this.rubble.splice(i, 1);
        const p = this._spawn(K_ROCK, r.x, 1, r.s, Math.sign(d || 1) * U.rand(2, 6) * power, U.rand(3, 8) * power, 400, r.si, WA);
        if (p) { p.v = r.v; p.vr = U.rand(-0.4, 0.4); p.vs = U.rand(-0.01, 0.02); }
      }
      const n = Math.round(14 + 26 * power);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI, v = U.rand(2, 8) * power;
        const p = this._spawn(K_ROCK, x + U.rand(-radius, radius) * 0.3, Math.max(1, y + U.rand(-10, 10)), U.rand(0.86, 1.25), Math.cos(a) * v * 1.4, Math.sin(a) * v + 2, 400, Math.min(5, (Math.random() * Math.random() * 6) | 0), WA);
        if (p) { p.vr = U.rand(-0.4, 0.4); p.vs = U.rand(-0.015, 0.02); }
      }
      this._sparks(x, y, Math.round(20 * power), 9 * power, KIND_COL.red, 0.2);
      for (let i = 0; i < 12; i++) {
        const dir = i & 1 ? 1 : -1;
        this._spawn(K_DUST, x + dir * U.rand(0, radius * 0.4), U.rand(0, 10), U.rand(0.92, 1.12), dir * U.rand(2, 6) * power, U.rand(0, 0.8), U.rand(40, 70), 1 + ((Math.random() * 2) | 0), WA);
      }
      for (let i = 0; i < 6; i++) this._spawn(K_SMOKE, x + U.rand(-20, 20), y + U.rand(-10, 20), U.rand(0.95, 1.05), U.rand(-1, 1), U.rand(0.5, 1.5), U.rand(60, 110), 1 + ((Math.random() * 2) | 0), WA);
      for (let i = 0; i < 14 * power; i++) this._spawn(K_EMBER, x, y, U.rand(0.95, 1.12), U.rand(-4, 4), U.rand(1, 5), U.rand(30, 70), Math.random() < 0.4 ? 2 : 1, WA);
      if (y - radius < 25) this.crater(x, Math.min(140, radius * 0.45 * power + 12));
      this.rings.push({ x, r: 8, vr: 9 + 6 * power, life: 26, w: WA });
      this._flash(0.6 * Math.min(1, power), [1.5, 0.6, 0.45]);
    }
    pull(x, y, radius = 100, strength = 1, frames = 30) {
      x = num(x); y = num(y); radius = U.clamp(num(radius, 100), 10, 800); strength = U.clamp(num(strength, 1), 0, 3);
      frames = U.clamp(num(frames, 30) | 0, 1, 6000);
      const q = this.pulls.find((p) => Math.abs(p.x - x) < 24 && Math.abs(p.y - y) < 24);
      if (q) { q.x = x; q.y = y; q.r = radius; q.str = strength; q.life = Math.max(q.life, frames); }
      else {
        this.pulls.push({ x, y, r: radius, str: strength, life: frames });
        if (this.pulls.length > 6) this.pulls.shift();
      }
      this._damage(x, radius * 1.6, strength * 5, strength * 0.4);
      if (!this.gfx) return;
      this._dustBurst(x, 0, 4, 0.6);
      this._flash(0.2, [0.5, 0.8, 1.5]);
    }
    erase(x0, x1, y = 60, radius = 40) {
      x0 = num(x0); x1 = num(x1); y = num(y, 60);
      if (x1 < x0) { const q = x0; x0 = x1; x1 = q; }
      radius = U.clamp(num(radius, 40), 4, 400);
      this.rumble = Math.max(this.rumble, 0.9);
      const hit = [];
      for (const p of this.props) {
        if (p.X < x0 - radius - 30 || p.X > x1 + radius + 30) continue;
        hit.push(p);
        if (p.state < 2 && !p.cut) {
          p.state = 2; p.hp = -1;
          if (this.gfx) { this._propRefresh(p); this._rocksAt(p.X, 30, p.s, 8, 4); }
        }
      }
      if (!this.gfx) return;
      const sy = this.py(y, 1), sr = radius * this.kS(1), sxa = this.px(x0, 1), sxb = this.px(x1, 1);
      // nearer layers get the full tunnel; farther ones a narrower bore, so the
      // hole reads as a tunnel receding into the distance
      for (const L of this.cutLayers) {
        const f = ERASE_K[L.s];
        if (!f) continue;
        this._layerPrep(L);
        this._carve(L, sxa, sxb, sy, sr * f, f);
      }
      for (const p of hit) this._carveProp(p, sxa, sxb, sy, sr);
      if (y - radius < 8) {
        const F = this.F, dark = hx('#08040c'), edge = hx('#2a1040');
        const rz = Math.max(8, (radius - Math.max(0, y)) * 0.9);
        this._floorArea((x0 + x1) / 2, ZF, (x1 - x0) / 2 + radius * 0.6, rz, (k, dx, dz, i, r) => {
          const ex = Math.max(0, Math.abs(dx) - (x1 - x0) / 2) / (radius * 0.6), d = hyp(ex, dz / rz) + (hash(i, r, 41) - 0.5) * 0.2;
          if (d < 0.8) F.pix[k] = dark; else if (d < 1) F.pix[k] = mixp(F.pix[k], edge, 0.7);
        });
        const g = this.gashes.find((q) => q.type === 'lat' && q.col && Math.abs(q.z - ZF) < rz && q.x1 >= x0 - 30 && q.x0 <= x1 + 30);
        if (g) { g.x0 = Math.min(g.x0, x0); g.x1 = Math.max(g.x1, x1); g.heat = 1; }
        else this.gashes.push({ type: 'lat', x0, x1, z: ZF + rz * 0.8, heat: 1, decay: 0.98, col: '#c070ff' }, { type: 'lat', x0, x1, z: ZF - rz * 0.8, heat: 1, decay: 0.98, col: '#c070ff' });
      }
      // debris and violet sparks along the path (scaled by the span so the
      // per-frame calls of a travelling Hollow Purple stay cheap)
      const span = Math.min(x1 - x0 + radius, 1400), cx = U.clamp((x0 + x1) / 2, this.c.x - 700, this.c.x + 700);
      const n = U.clamp(Math.round(span / 28), 2, 40) * (this.parts.length > 650 ? 0.5 : 1);
      for (let i = 0; i < n; i++) {
        const X = cx + (Math.random() - 0.5) * span;
        const p = this._spawn(K_ROCK, X, Math.max(1, y + U.rand(-radius, radius)), U.rand(0.86, 1.2), U.rand(-3, 3), U.rand(0, 5), 400, Math.min(5, (Math.random() * Math.random() * 6) | 0), WA);
        if (p) { p.vr = U.rand(-0.4, 0.4); p.vs = U.rand(-0.01, 0.02); }
        if (i % 2) this._sparks(X, y + U.rand(-radius, radius), 2, 5, KIND_COL.purple, 0);
        if (i % 4 === 0) this._spawn(K_DUST, X, Math.max(0, y - radius * 0.5), 1, U.rand(-1, 1), U.rand(0, 1), U.rand(40, 70), 2, WA);
      }
      this._flash(0.7, [1.3, 0.8, 1.7]);
    }
    worldCut(x0, y0, x1, y1) {
      x0 = num(x0); y0 = num(y0); x1 = num(x1); y1 = num(y1);
      if (hyp(x1 - x0, y1 - y0) < 1e-3) return;
      this.rumble = Math.max(this.rumble, 1);
      // headless: props near the cut line take the hit
      if (!this.gfx) {
        for (const p of this.props) {
          const t = U.clamp((p.X - x0) / (x1 - x0 || 1), 0, 1), yy = y0 + (y1 - y0) * t;
          if (p.X >= Math.min(x0, x1) - 40 && p.X <= Math.max(x0, x1) + 40 && yy < 160) { p.state = 2; p.hp = -1; p.cut = true; }
        }
        return;
      }
      const c = this.c;
      const ax = this.px(x0, 1), ay = this.py(y0, 1), bx = this.px(x1, 1), by = this.py(y1, 1);
      let dx = bx - ax, dy = by - ay;
      const len = hyp(dx, dy) || 1;
      dx /= len; dy /= len;
      let nx = dy, ny = -dx;
      if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
      const seam = { heat: 1, decay: 0.982, lines: [] };
      for (const L of this.cutLayers) {
        this._layerPrep(L);
        this._splitLayer(L, ax, ay, dx, dy, nx, ny);
        const lx = (ax - L.dx) / L.e, ly = (ay - L.dy) / L.e;
        seam.lines.push({ L, x: L.tile ? ((lx % L.w) + L.w) % L.w : lx, y: ly, dx, dy });
      }
      this.seams.push(seam);
      if (this.seams.length > 4) this.seams.shift();
      for (const p of this.props) this._cleaveProp(p, ax, ay, dx, dy, nx, ny);
      // floor gash: receding crevice where the cut meets the ground, else a long lateral gash
      const G = this.art.floor, dark = FLOOR[0], lip = hx('#c0603a');
      const tq = Math.abs(y1 - y0) > 1e-3 ? (0 - y0) / (y1 - y0) : NaN;
      const xi = x0 + (x1 - x0) * tq;
      if (isFinite(xi) && tq > -0.6 && tq < 1.6 && Math.abs(xi - c.x) < 900) {
        let X = xi;
        for (let Z = ZB - 1; Z > G.zLo + G.zBand + 4; Z -= 6) {
          const nX = X + (Math.random() - 0.5) * 2.5;
          this._floorLine(X, Z, nX, Z - 6, 3, dark, lip);
          X = nX;
        }
        this.gashes.push({ type: 'recede', x: xi, heat: 1, decay: 0.982 });
      } else {
        const Z = ZF * 1.06, s = ZF / Z, hw = this._viewHalf(s) + 40;
        let Zc = Z;
        for (let X = c.x - hw; X < c.x + hw; X += 6) { const nZ = Zc + (Math.random() - 0.5) * 2; this._floorLine(X, Zc, X + 6, nZ, 2, dark, lip); Zc = nZ; }
        this.gashes.push({ type: 'lat', x0: c.x - hw, x1: c.x + hw, z: Z, heat: 1, decay: 0.982 });
      }
      (this.cuts || (this.cuts = [])).push({ x0: x0 - (x1 - x0) * 2, y0: y0 - (y1 - y0) * 2, x1: x1 + (x1 - x0) * 2, y1: y1 + (y1 - y0) * 2, heat: 1, decay: 0.9, w: 3 });
      for (let i = 0; i < 30; i++) {
        const t = Math.random(), X = U.lerp(x0, x1, t), Y = U.lerp(y0, y1, t);
        if (Y < -10) continue;
        this._sparks(X, Math.max(0, Y), 2, 6, KIND_COL.slash, 0.1);
        if (i % 3 === 0) this._rocksAt(X, Math.max(1, Y), 0.95, 1, 3);
      }
      this._flash(0.8, [1.6, 1.2, 1.2]);
    }
    slashMark(x0, y0, x1, y1) {
      x0 = num(x0); y0 = num(y0); x1 = num(x1); y1 = num(y1);
      const mx = (x0 + x1) / 2;
      this._damage(mx, Math.abs(x1 - x0) / 2 + 40, 12, 0.3);
      if (!this.gfx) return;
      const ax = this.px(x0, 1), ay = this.py(y0, 1), bx = this.px(x1, 1), by = this.py(y1, 1);
      const L = this.L.near, F = this.F, TW = this.art.floor.TW, c = this.c;
      this._layerPrep(L);
      const yFloor = this.py(0, SB);
      const n = Math.ceil(hyp(bx - ax, by - ay) * 1.5);
      const dark = hx('#0a0406'), lit = hx('#d07050');
      for (let j = 0; j <= n; j++) {
        const sx = U.lerp(ax, bx, j / n), sy = U.lerp(ay, by, j / n);
        if (sy >= yFloor) {
          const kS = (sy - HY - c.shy) / c.hgt;
          if (kS <= 0) continue;
          const Z = ZF * (1 / kS + 1 - 1 / c.ez), X = c.x + (sx - W / 2 - c.shx) / kS;
          if (Z > ZB || Z < this.art.floor.zLo) continue;
          this._floorPlot(X, Z, (k) => { F.pix[k] = dark; if (k + TW < F.pix.length) F.pix[k + TW] = mixp(F.pix[k + TW], lit, 0.4); });
        } else {
          const lx = Math.floor((sx - L.dx) / L.e), ly = Math.floor((sy - L.dy) / L.e);
          if (ly < 0 || ly >= L.h - 1) continue;
          const wx = ((lx % L.w) + L.w) % L.w, k = ly * L.w + wx;
          if (!(L.pix[k] >>> 24)) continue;
          L.pix[k] = dark;
          if (L.pix[k + L.w] >>> 24) L.pix[k + L.w] = mixp(L.pix[k + L.w], lit, 0.35);
          this._markLayer(L, wx - 1, ly - 1, wx + 1, ly + 2);
        }
      }
      (this.cuts || (this.cuts = [])).push({ x0, y0, x1, y1, heat: 1, decay: 0.8, w: 1 });
      this._sparks((x0 + x1) / 2, Math.max(0, (y0 + y1) / 2), 6, 4, KIND_COL.slash, 0.2);
      if (Math.min(y0, y1) < 20) this._rocksAt(mx, 1, 1, 3, 2.5);
    }
    burn(x, radius = 60, frames = 120) {
      x = num(x);
      radius = U.clamp(num(radius, 60), 8, 400);
      frames = U.clamp(num(frames, 120) | 0, 1, 6000);
      const near = this.fires.find((f) => Math.abs(f.x - x) < Math.max(f.r, radius) * 0.5);
      if (near) {
        near.x = U.lerp(near.x, x, 0.3); near.r = Math.max(near.r, radius);
        if (frames > near.life) { near.max += frames - near.life; near.life = frames; }
      } else {
        this.fires.push({ x, r: radius, life: frames, max: frames });
        if (this.fires.length > 8) this.fires.shift();
      }
      if (!this.gfx) return;
      const sc = this.scorch || (this.scorch = []);
      if (sc.some((q) => Math.abs(q.x - x) < q.r * 0.4 && this.t - q.t < 90 && q.r >= radius * 0.8)) return;
      sc.push({ x, r: radius, t: this.t });
      if (sc.length > 12) sc.shift();
      const F = this.F, soot = hx('#0c0607'), ember = hx('#5a1608'), rx = radius * 1.25, rz = radius * 0.75;
      this._floorArea(x, ZF, rx, rz, (k, dx, dz, i, r) => {
        const d = hyp(dx / rx, dz / rz) + (vn((x + dx) * 0.08, dz * 0.08, 81) - 0.5) * 0.45;
        if (d > 1) return;
        const lv = Math.floor(Math.pow(1 - d, 0.6) * 4 + bay(i, r)) / 4;
        if (lv <= 0) return;
        F.pix[k] = mixp(F.pix[k], soot, lv * 0.82);
        if (d < 0.55 && hash(i, r, 77 + (x | 0)) < 0.04) F.pix[k] = ember;
      });
      this._flash(0.25, [1.4, 0.9, 0.5]);
    }
    crater(x, radius = 30) {
      x = num(x);
      radius = U.clamp(num(radius, 30), 6, 180);
      this._damage(x, radius * 2.2, radius * 0.5, 0.6);
      if (!this.gfx) return;
      const F = this.F, R = radius, sd = (x * 7) | 0;
      const rays = 5 + ((hash(sd, 1, 3) * 4) | 0), ph = hash(sd, 2, 3) * 6.28;
      this._floorArea(x, ZF, R * 1.9, R * 1.9, (k, dx, dz, i, r) => {
        const d0 = hyp(dx, dz) / R, a = Math.atan2(dz, dx);
        const d = d0 + (vn(dx * 0.15, dz * 0.15, sd) - 0.5) * 0.22;
        const old = F.pix[k];
        if (d < 0.72) {
          const lit = U.clamp(-dz / R, -1, 1); // inner wall facing the sky glow
          F.pix[k] = rmp(FLOOR, 2.3 + lit * 2.4 - (1 - d) * 0.5 + (hash(i, r, 5) < 0.12 ? -1 : 0), i, r);
        } else if (d < 0.92) {
          F.pix[k] = rmp(FLOOR, dz > 0 ? 7 : 3.4, i, r);
        } else if (d < 1.9) {
          const ray = Math.abs(Math.sin(a * rays * 0.5 + ph));
          if (ray < 0.05 * (1.9 - d) + 0.012 && d < 1.85) F.pix[k] = FLOOR[0];
          else if (d < 1.3) F.pix[k] = mixp(old, FLOOR[1], Math.floor((1.3 - d) * 5 + bay(i, r)) / 5 * 0.6);
        }
      });
      this._rocksAt(x, 1, 1, Math.round(3 + R / 8), 2 + R / 25);
      this._dustBurst(x, 0, Math.round(3 + R / 10), 0.6 + R / 60);
    }
    _crackDecal(x, power) {
      const z0 = ZF + U.rand(-12, 12), n = 4 + ((Math.random() * 3) | 0), dark = FLOOR[0], lip = hx('#a0583a');
      for (let i = 0; i < n; i++) {
        let a = Math.random() * Math.PI * 2, X = x, Z = z0;
        const len = 10 + 40 * power * Math.random();
        for (let s = 0; s < len; s += 3) {
          a += (Math.random() - 0.5) * 0.7;
          const nX = X + Math.cos(a) * 3, nZ = Z + Math.sin(a) * 3;
          if (nZ > ZB - 2 || nZ < this.art.floor.zLo + this.art.floor.zBand + 4) break;
          this._floorLine(X, Z, nX, nZ, 1, dark, lip);
          X = nX; Z = nZ;
        }
      }
    }
    // Carve a horizontal capsule out of a layer (screen coords at the
    // current camera) leaving a scorched violet rim.
    _carve(L, sxa, sxb, sy, sr, glow = 1) {
      const e = L.e, w = L.w, h = L.h, d = L.pix;
      let ax = (sxa - L.dx) / e, bx = (sxb - L.dx) / e;
      const cy = (sy - L.dy) / e, rr = sr / e;
      const ua = (-80 - L.dx) / e, ub = (W + 80 - L.dx) / e;
      ax = Math.max(ax, ua); bx = Math.min(bx, ub);
      if (!(bx >= ax) || !(rr > 0) || cy + rr < -6 || cy - rr > h + 6) return;
      if (bx - ax > w) bx = ax + w;
      const char = hx('#120818'), scorch = hx('#2a0c34'), sky = L === this.L.sky, voidC = ERASE_VOID;
      const y0 = Math.max(0, Math.floor(cy - rr - 6)), y1 = Math.min(h - 1, Math.ceil(cy + rr + 6));
      const x0 = Math.floor(ax - rr - 6), x1 = Math.ceil(bx + rr + 6);
      let mx0 = w, mx1 = -1;
      for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) {
        const x = L.tile ? ((xx % w) + w) % w : xx;
        if (x < 0 || x >= w) continue;
        const k = y * w + x, col = d[k];
        if (!(col >>> 24)) continue;
        const qx = xx + 0.5 < ax ? ax : xx + 0.5 > bx ? bx : xx + 0.5;
        const dist = hyp(xx + 0.5 - qx, y + 0.5 - cy);
        const R = rr * (1 + (vn(xx * 0.12, y * 0.12, 7) - 0.5) * 0.3);
        if (sky) {
          if (dist > R + 3) continue;
          const oi = voidC.indexOf(col), tt = dist / R;
          let nc = dist > R ? (bay(x, y) < 0.5 ? voidC[2] : col) : rmp(voidC, 0.1 + tt * tt * 1.75, x, y);
          if (dist < R * 0.8 && hash(x, y, 71) < 0.005) nc = voidC[3];
          const ni = voidC.indexOf(nc);
          if (oi >= 0 && (ni < 0 || oi === 3 || oi <= ni)) continue; // never re-lighten void
          d[k] = nc;
        } else if (dist < R) d[k] = 0;
        else if (dist < R + 2) d[k] = char;
        else if (dist < R + 5) { if (col === char || col === scorch) continue; d[k] = mixp(col, scorch, bay(x, y) < 0.5 ? 0.7 : 0.4); }
        else continue;
        if (x < mx0) mx0 = x;
        if (x > mx1) mx1 = x;
      }
      if (mx1 < 0) return;
      this._markLayer(L, mx0, y0, mx1, y1);
      // merge with a recent hole on the same bore (Hollow Purple travels)
      const cax = L.tile ? ((ax % w) + w) % w : ax;
      for (const q of this.holes) {
        if (sky) break;
        if (q.L !== L || Math.abs(q.cy - cy) > 3 || Math.abs(q.rr - rr) > 3 || q.heat < 0.25) continue;
        let a0 = cax;
        if (L.tile) a0 += Math.round((q.ax - a0) / w) * w;
        if (a0 > q.ax + q.len + 6 || a0 + (bx - ax) < q.ax - 6) continue;
        const na = Math.min(q.ax, a0), nb = Math.max(q.ax + q.len, a0 + (bx - ax));
        q.ax = na; q.len = Math.min(w, nb - na); q.heat = 1;
        return;
      }
      if (!sky) this.holes.push({ L, ax: cax, len: bx - ax, cy, rr, heat: 1, decay: 0.985, k: glow });
      if (this.holes.length > 16) this.holes.shift();
    }
    _propXf(p) {
      const k = this.kS(p.s), e = k / p.s, T = p.T;
      const bx = this.px(p.X, p.s), by = this.py(0, p.s);
      return [bx - p.ax * e, by - T.h * e, e];
    }
    _carveProp(p, sxa, sxb, sy, sr) {
      const T = p.T, [ox, oy, e] = this._propXf(p);
      const ax = (sxa - ox) / e, bx = (sxb - ox) / e, cy = (sy - oy) / e, rr = sr / e;
      let any = false;
      for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) {
        const k = y * T.w + x;
        if (!(p.pix[k] >>> 24)) continue;
        const qx = U.clamp(x + 0.5, ax, bx), dist = hyp(x + 0.5 - qx, y + 0.5 - cy);
        if (dist < rr) { p.pix[k] = 0; any = true; } else if (dist < rr + 2) { p.pix[k] = hx('#1a0a22'); any = true; }
      }
      if (any) { p.cut = true; p.ctx.clearRect(0, 0, T.w, T.h); p.ctx.putImageData(p.img, 0, 0); }
    }
    // Split a layer along a screen line: the upper side slides along the cut,
    // leaving a dark seam with a cooled ember lip.
    _splitLayer(L, ax, ay, dx, dy, nx, ny) {
      const e = L.e, w = L.w, h = L.h, d = L.pix, src = d.slice();
      const px0 = (ax - L.dx) / e, py0 = (ay - L.dy) / e;
      const isSky = L === this.L.sky;
      const sh = SPLIT_SH[L.s] || 4;
      const ox = Math.round(dx * sh + nx * 2), oy = Math.round(dy * sh + ny * 2);
      const uc = (W / 2 - L.dx) / e;
      const seam = hx('#0a0204'), ember = hx('#8a2414');
      for (let y = 0; y < h; y++) {
        const yy = y + 0.5 - py0;
        for (let x = 0; x < w; x++) {
          const u = L.tile ? x + w * Math.round((uc - x) / w) : x;
          const sd = (u + 0.5 - px0) * nx + yy * ny;
          if (sd < -2.6) continue;
          const k = y * w + x;
          if (sd < -1) { if (d[k] >>> 24) d[k] = mixp(d[k], ember, sd < -1.8 ? 0.3 : 0.6); continue; }
          if (sd < 1.2) { d[k] = isSky || src[k] >>> 24 ? seam : 0; continue; }
          const syy = y - oy < 0 ? 0 : y - oy >= h ? h - 1 : y - oy;
          let sx = x - ox;
          sx = L.tile ? ((sx % w) + w) % w : sx < 0 ? 0 : sx >= w ? w - 1 : sx;
          const ssd = (u - ox + 0.5 - px0) * nx + (syy + 0.5 - py0) * ny;
          d[k] = ssd >= 1 ? src[syy * w + sx] : isSky || src[k] >>> 24 ? seam : 0;
        }
      }
      this._markLayer(L, 0, 0, w - 1, h - 1);
    }
    _cleaveProp(p, ax, ay, dx, dy, nx, ny) {
      if (p.cut && p.state >= 3) return;
      const T = p.T, [ox, oy, e] = this._propXf(p);
      const lx = (ax - ox) / e, ly = (ay - oy) / e;
      let up = 0, lo = 0, cx = 0, cy = 0;
      for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) {
        if (!(p.pix[y * T.w + x] >>> 24)) continue;
        const sd = (x + 0.5 - lx) * nx + (y + 0.5 - ly) * ny;
        if (sd > 0) { up++; cx += x; cy += y; } else lo++;
      }
      if (up < 8 || lo < 8) return;
      cx /= up; cy /= up;
      const top = new Pix(T.w, T.h), lit = hx('#e0a070');
      for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) {
        const k = y * T.w + x, col = p.pix[k];
        if (!(col >>> 24)) continue;
        const sd = (x + 0.5 - lx) * nx + (y + 0.5 - ly) * ny;
        if (sd > 0.8) { top.d[k] = sd < 1.8 ? mixp(col, lit, 0.4) : col; p.pix[k] = 0; }
        else if (sd > -0.4) p.pix[k] = 0;
        else if (sd > -1.4) p.pix[k] = mixp(col, lit, 0.5);
      }
      p.cut = true; p.state = 3; p.hp = -1;
      p.ctx.clearRect(0, 0, T.w, T.h); p.ctx.putImageData(p.img, 0, 0);
      const X = p.X + (cx - p.ax) / p.s, Y = (T.h - cy) / p.s;
      const dh = dy > 0 ? 1 : -1; // slide down along the cut
      this._addChunk(toCanvas(top), T.w, T.h, cx, cy, X, Y, p.s, dx * dh * 2.4, 0.8, dx * dh * 0.025, Math.max(6, (T.h - cy) / p.s * 0.3));
      this._rocksAt(X, Y * 0.6, p.s, 6, 3);
    }

    // ------------------------------------------------------ modes, misc
    setMode(mode, o) {
      o = o || {};
      if (mode !== 'normal' && mode !== 'void' && mode !== 'shrine' && mode !== 'clash') return;
      if (o.shrineX != null) this.shrineX = num(o.shrineX);
      if (o.originX != null) this.originX = num(o.originX);
      if (mode === 'clash') {
        const ok = (m) => (m === 'void' || m === 'shrine' || m === 'normal' ? m : null);
        this.cl.left = ok(o.leftMode) || this.cl.left || 'void';
        this.cl.right = ok(o.rightMode) || this.cl.right || 'shrine';
        if (o.split != null) this.cl.split = this.cl.tsplit = U.clamp(num(o.split, 0.5), 0.02, 0.98);
      }
      const cur = this.tr ? this.tr.to : this.mode;
      if (cur === mode && mode !== 'clash') return;
      if (cur === mode && !this.tr) return;
      if (this.tr) { this.mode = this.tr.to; this.tr = null; }
      const n = o.frames != null ? U.clamp(num(o.frames, 40) | 0, 0, 600) : mode === 'normal' ? 30 : 40;
      if (n <= 1 || this.mode === mode) { this.mode = mode; return; }
      this.tr = { type: mode === 'normal' ? 'shatter' : 'expand', from: this.mode, to: mode, t: 0, n, ox: this.originX, seed: (Math.random() * 1000) | 0, shards: null };
      if (this.gfx && mode !== 'normal') this.rings.push({ x: this.originX, r: 4, vr: 14, life: 30, w: WA });
    }
    setSplit(split) { this.cl.tsplit = U.clamp(num(split, 0.5), 0.02, 0.98); }
    shakeProps(amount = 0.5) {
      amount = U.clamp(num(amount, 0.5), 0, 2);
      this.rumble = Math.max(this.rumble, amount);
      for (const p of this.props) if (p.state < 2) p.wobV += (Math.random() - 0.5) * 0.03 * amount;
      if (!this.gfx) return;
      const c = this.c, hw = this._viewHalf(SB);
      for (let i = 0; i < 6 * amount; i++) {
        const X = c.x + U.rand(-hw, hw);
        this._spawn(K_DUST, X, U.rand(70, 80), SB + 0.01, U.rand(-0.2, 0.2), -U.rand(0.3, 0.8), U.rand(40, 70), 0, WA);
        if (Math.random() < 0.5) { const p = this._spawn(K_ROCK, X, 76, SB + 0.02, U.rand(-0.5, 0.5), 0, 300, (Math.random() * 2) | 0, WA); if (p) p.vr = U.rand(-0.2, 0.2); }
      }
    }
    getAmbient() {
      const a = this.amb, tr = this.tr;
      const of = (m) => {
        if (m === 'clash') {
          const l = AMB[this.cl.left] || AMB.normal, r = AMB[this.cl.right] || AMB.normal;
          return { mul: U.mix(l.mul, r.mul, 0.5), rim: U.mix(l.rim, r.rim, 0.5), rimK: (l.rimK + r.rimK) / 2 };
        }
        return AMB[m] || AMB.normal;
      };
      let A = of(this.mode);
      if (tr) {
        const f = of(tr.from), g = of(tr.to), k = U.ease.inOut(Math.min(1, tr.t / tr.n));
        A = { mul: U.mix(f.mul, g.mul, k), rim: U.mix(f.rim, g.rim, k), rimK: U.lerp(f.rimK, g.rimK, k) };
      }
      let fire = 0;
      for (const f of this.fires) fire += Math.min(1, f.life / 40) * Math.min(1, f.r / 80);
      fire = Math.min(1, fire);
      const dk = 1 - U.clamp(this.darken || 0, 0, 1) * 0.28, fl = this.fl, fc = this.flCol;
      for (let i = 0; i < 3; i++) {
        let m = A.mul[i] + [0.14, 0.05, -0.03][i] * fire + fl * 0.35 * (fc[i] - 1);
        a.mul[i] = U.clamp(m * dk, 0.45, 1.4);
        a.rim[i] = Math.round(U.lerp(A.rim[i], [255, 176, 90][i], fire * 0.45));
      }
      a.rimK = U.clamp(A.rimK + fire * 0.15 + fl * 0.2, 0, 1);
      return a;
    }
  }

  const SHRINE_S = 0.42;
  // skulls jutting from the shrine's blood pool: [x offset, depth, sprite]
  const SKULLS = [[-250, 0.62, 2], [-150, 0.75, 0], [210, 0.68, 3], [330, 0.85, 1], [-420, 0.95, 4], [470, 0.98, 2], [120, 1.12, 0], [-330, 1.2, 1], [60, 0.58, 1]];

  JJK.Stage = Stage;
  JJK.Stage.art = getArt; // exposed for tools (prerender timing)
})();
