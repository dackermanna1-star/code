// The HALLOWELL logotype: slab-serif "Collegiate Gothic" capitals built on the 480×270 art grid,
// then decayed — eroded paint, rust drips, a cracked O, a missing bar on the E, and the second L
// hanging crooked from one nail like the letters on the school's sign. Deterministic.
import { canvas, ctx2d } from './gfx.js';
import { rng, BAYER4 } from '../art/util.js';

const CAP = 30;      // cap height in art px
const SW = 5;        // stem width
const TW = 2;        // thin stroke
const SER = 2;       // serif height

/** Each letter: draws into a 1-bit mask via fill(x, y, w, h) / tri(points). Returns its width. */
const LETTERS = {
  H(m) { m.stem(0); m.stem(17); m.rect(SW, 14, 17 - SW, 3); return 22; },
  A(m) {
    m.poly([[10, 0], [14, 0], [6, CAP], [2, CAP]]);          // thin left diagonal
    m.poly([[10, 0], [15, 0], [24, CAP], [18, CAP]]);       // thick right diagonal
    m.rect(5, 19, 14, 3);
    m.serif(0, CAP - SER, 9); m.serif(16, CAP - SER, 10);
    return 26;
  },
  L(m) { m.stem(0, { bottom: false }); m.rect(-2, CAP - 4, 18, 4); m.rect(14, CAP - 9, 2, 9); return 17; },
  O(m) {
    const cx = 11.5, cy = CAP / 2 - 0.5;
    for (let y = 0; y < CAP; y++) for (let x = 0; x < 24; x++) {
      const o = ((x - cx) / 12) ** 2 + ((y - cy) / (CAP / 2 + 0.3)) ** 2;
      const i = ((x - cx) / 6.2) ** 2 + ((y - cy) / (CAP / 2 - 3.2)) ** 2;
      if (o <= 1 && i > 1) m.px(x, y);
    }
    return 24;
  },
  W(m) {
    m.poly([[0, 0], [5, 0], [11, CAP], [7, CAP]]);
    m.poly([[9, CAP], [11, CAP], [18, 2], [16, 2]]);
    m.poly([[15, 0], [20, 0], [27, CAP], [23, CAP]]);
    m.poly([[25, CAP], [27, CAP], [34, 0], [32, 0]]);
    m.serif(-2, 0, 9); m.serif(13, 0, 9); m.serif(30, 0, 7);
    return 35;
  },
  E(m) {
    m.stem(0, { right: false });
    m.rect(SW, 0, 14, 4); m.rect(17, 0, 2, 8);
    m.rect(SW, 13, 9, 3); m.rect(12, 11, 2, 7);
    m.rect(SW, CAP - 4, 15, 4); m.rect(18, CAP - 9, 2, 9);
    return 20;
  },
};

class Mask {
  constructor(w, h, ox) { this.w = w; this.h = h; this.ox = ox; this.d = new Uint8Array(w * h); }
  px(x, y) { x = Math.round(x + this.ox); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = 1; }
  rect(x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j); }
  serif(x, y, w) { this.rect(x, y, w, SER); }
  stem(x, o = {}) {
    this.rect(x, 0, SW, CAP);
    if (o.top !== false) this.serif(x - 2, 0, SW + (o.right === false ? 2 : 4));
    if (o.bottom !== false) this.serif(x - 2, CAP - SER, SW + (o.right === false ? 2 : 4));
  }
  poly(pts) {
    for (let y = 0; y < CAP; y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.px(x, y);
    }
  }
}

let cached = null;
/** Returns { canvas, w, h } at ART resolution (draw ×2 on the UI buffer). */
export function logo() {
  if (cached) return cached;
  const word = 'HALLOWELL';
  const GAP = 4;
  const PAD = 10;
  // measure
  let total = 0;
  const probe = new Mask(1, 1, 0);
  const widths = [...word].map((ch) => LETTERS[ch](probe));
  total = widths.reduce((a, b) => a + b, 0) + GAP * (word.length - 1);
  const W = total + PAD * 2, H = CAP + PAD * 2 + 16;
  const r = rng(1923);
  const c = canvas(W, H); const x = ctx2d(c);
  // per-letter masks so we can displace individual letters
  let cx = PAD;
  const letters = [];
  [...word].forEach((ch, i) => {
    const m = new Mask(W, H, 0);
    m.ox = cx;
    LETTERS[ch](m);
    letters.push({ ch, i, m, x: cx, w: widths[i] });
    cx += widths[i] + GAP;
  });
  const fillCol = (px, py, letter) => {
    // nicotine-cream paint fading to rust toward the bottom; dithered
    const t = py / CAP;
    const lvl = BAYER4[(py) & 3][(px) & 3] / 16;
    if (t > 0.72 && lvl < (t - 0.72) * 2.4) return '#7a4a2a';
    if (t > 0.45 && lvl < (t - 0.45) * 1.2) return '#a8956a';
    if (t < 0.12 && lvl < 0.5) return '#efe4c4';
    return letter.ch === 'O' && px % 7 === 0 ? '#c9b98e' : '#d8caa0';
  };
  const out = new Uint8Array(W * H);   // composite mask (for shadows/outline)
  const col = new Array(W * H);
  for (const L of letters) {
    // the second L (index 7) hangs from its top-left nail: rotated ~7°, dropped 2px
    const hang = L.i === 7;
    const ang = hang ? 0.12 : 0;
    const ox = L.x, oy = PAD;
    for (let y = -4; y < CAP + 8; y++) for (let xx = -6; xx < L.w + 6; xx++) {
      let sx = xx, sy = y;
      if (hang) { // inverse-rotate around the nail at (1, 1)
        const dx = xx - 1, dy = y - 1;
        sx = 1 + dx * Math.cos(ang) + dy * Math.sin(ang);
        sy = 1 - dx * Math.sin(ang) + dy * Math.cos(ang) - 2;
      }
      const mx = Math.round(sx + ox), my = Math.round(sy);
      if (my < 0 || my >= CAP || mx < 0 || mx >= W) continue;
      if (!L.m.d[my * W + mx]) continue;
      const X = ox + xx, Y = oy + y;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      // decay: eroded pixels (more along the bottom), a missing chunk of the E's middle bar
      if (r() < 0.035 + (my / CAP) * 0.05) continue;
      if (L.ch === 'E' && my >= 13 && my < 16 && sx > 8 && sx < 12) continue;
      out[Y * W + X] = 1;
      col[Y * W + X] = fillCol(Math.round(sx), my, L);
    }
  }
  // crack through the O: a jagged diagonal knocked out of the paint
  const O = letters.find((l) => l.ch === 'O');
  let ky = PAD + 3, kx = O.x + 15;
  while (ky < PAD + CAP - 2) { out[ky * W + kx] = 0; out[ky * W + kx + 1] = 0; ky++; if (r() < 0.45) kx += r() < 0.6 ? -1 : 1; }
  // shadow (down-right, 2px) and dark outline
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    if (out[y * W + xx]) continue;
    const s = (xx >= 2 && y >= 2 && out[(y - 2) * W + xx - 2]) || (xx >= 1 && y >= 2 && out[(y - 2) * W + xx - 1]);
    const n = (xx > 0 && out[y * W + xx - 1]) || (xx < W - 1 && out[y * W + xx + 1]) || (y > 0 && out[(y - 1) * W + xx]) || (y < H - 1 && out[(y + 1) * W + xx]);
    if (n) { x.fillStyle = '#100c0a'; x.fillRect(xx, y, 1, 1); }
    else if (s) { x.fillStyle = 'rgba(0,0,0,0.75)'; x.fillRect(xx, y, 1, 1); }
  }
  for (let i = 0; i < W * H; i++) if (out[i]) { x.fillStyle = col[i]; x.fillRect(i % W, (i / W) | 0, 1, 1); }
  // rust drips running down from the bottoms of a few letters
  for (const L of letters) {
    if (r() < 0.35) continue;
    const n = 1 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) {
      const dx = L.x + 2 + Math.floor(r() * (L.w - 4));
      const len = 3 + Math.floor(r() * 9);
      for (let j = 0; j < len; j++) {
        const yy = PAD + CAP + (L.i === 7 ? 3 : 0) + j;
        if (yy >= H) break;
        x.fillStyle = j < len * 0.5 ? '#6a3a20' : '#4a2a18';
        if (j < len - 1 || r() < 0.6) x.fillRect(dx, yy, 1, 1);
      }
    }
  }
  // nail head on the hanging L
  const L8 = letters[7];
  x.fillStyle = '#2a2420'; x.fillRect(L8.x, PAD - 1, 3, 3); x.fillStyle = '#8a8070'; x.fillRect(L8.x + 1, PAD, 1, 1);
  cached = { canvas: c, w: W, h: H };
  return cached;
}
