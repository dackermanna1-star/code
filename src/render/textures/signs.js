// Store-sign letter tiles (sign_A..Z, sign_0..9, sign_blank/dash/plus/excl/amp/dot/apos/hash), the hospital /
// pharmacy cross signs and the sign back. Letter tiles are placed side by side to spell words, so every tile shares
// the same seamless enamel background (top/bottom frame only) and glyphs are centred on the same 10x12 grid
// (cols 3-12, rows 2-13).
import { Img, pal, hex, mix, shade, fbm, white, pick, paint, grime, streaks, speckle, rnd, makeRng, clamp01, seedFromString, eq, combine } from './core.js';

// 5x7 bitmap font, horizontal bars on rows 0 / 3 / 6 (those rows are drawn 2px tall)
const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['###..', '#..#.', '#...#', '#...#', '#...#', '#..#.', '###..'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['#..#.', '#..#.', '#..#.', '#####', '...#.', '...#.', '...#.'],
  5: ['#####', '#....', '#....', '####.', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  blank: ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  dash: ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  plus: ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  excl: ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  amp: ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  dot: ['.....', '.....', '.....', '.....', '.....', '.....', '..#..'],
  apos: ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  hash: ['.#.#.', '#####', '.#.#.', '.#.#.', '.#.#.', '#####', '.#.#.'],
};
const ROW_H = [2, 2, 1, 2, 1, 2, 2]; // 12px

/** 10x12 glyph mask with diagonal joints bridged so strokes stay bold */
function glyphMask(ch) {
  const g = FONT[ch];
  const m = Array.from({ length: 12 }, () => new Uint8Array(10));
  let y = 0;
  g.forEach((row, j) => {
    for (let k = 0; k < ROW_H[j]; k++, y++) for (let i = 0; i < 5; i++) if (row[i] === '#') { m[y][i * 2] = 1; m[y][i * 2 + 1] = 1; }
  });
  const add = [];
  for (let yy = 0; yy < 11; yy++) for (let x = 0; x < 10; x++) {
    if (x < 9 && m[yy][x] && m[yy + 1][x + 1] && !m[yy][x + 1] && !m[yy + 1][x]) add.push([x + 1, yy], [x, yy + 1]);
    if (x > 0 && m[yy][x] && m[yy + 1][x - 1] && !m[yy][x - 1] && !m[yy + 1][x]) add.push([x - 1, yy], [x, yy + 1]);
  }
  for (const [x, yy] of add) m[yy][x] = 1;
  return m;
}

// shared seamless background: dark teal enamel, steel frame on top/bottom only
const TEAL = pal(0x152d2c, 0x183433, 0x1c3b39, 0x204240, 0x244947);
let bgCache = null;
function background() {
  if (bgCache) return bgCache;
  const seed = seedFromString('sign_bg');
  const img = new Img();
  paint(img, TEAL, eq(combine(fbm(seed, 4, 2, 2), 0.6, white(seed + 1), 0.4)), 0.6);
  const F = pal(0x2a2e30, 0x3a4042, 0x4e5456, 0x666c6e);
  for (let x = 0; x < 16; x++) {
    img.set(x, 0, rnd(seed, x, 0, 2) < 0.2 ? hex(0x7a4a2a) : F[3]);
    img.set(x, 15, rnd(seed, x, 15, 2) < 0.25 ? hex(0x6a3e22) : F[1]);
    img.tone(x, 1, -0.05); img.tone(x, 14, 0.02);
    if (rnd(seed, x, 1, 3) < 0.15) img.mix(x, 1, [110, 66, 36], 0.6);
    if (rnd(seed, x, 14, 3) < 0.2) img.mix(x, 14, [110, 66, 36], 0.5);
  }
  bgCache = img;
  return img;
}

function letterTile(img, ch) {
  img.copy(background());
  const seed = seedFromString('sign_' + ch);
  const m = glyphMask(ch);
  const G = pal(0xb8b29e, 0xc6c0ac, 0xd2ccb9, 0xdcd6c4);
  const X0 = 3, Y0 = 2;
  // drop shadow
  for (let y = 0; y < 12; y++) for (let x = 0; x < 10; x++) if (m[y][x]) {
    if (!(m[y + 1] && m[y + 1][x + 1])) img.set(X0 + x + 1, Y0 + y + 1, hex(0x0c1a1a));
  }
  for (let y = 0; y < 12; y++) for (let x = 0; x < 10; x++) {
    if (!m[y][x]) continue;
    const px = X0 + x, py = Y0 + y;
    const chip = rnd(seed, px, py, 4);
    if (chip < 0.04) { img.set(px, py, hex(0x5a5a52)); continue; }
    if (chip < 0.07) { img.set(px, py, hex(0x7a4a2a)); continue; }
    const v = 0.55 + (rnd(seed, px, py, 5) - 0.5) * 0.5 + ((y === 0 || !m[y - 1][x]) ? 0.3 : 0) + ((!m[y + 1] || !m[y + 1][x]) ? -0.2 : 0);
    img.set(px, py, pick(G, clamp01(v), px, py, 0.4));
  }
  // per-tile rust specks + drip (kept off the side edges so neighbouring tiles join seamlessly)
  const r = makeRng(seed + 7);
  for (let k = 0; k < 3; k++) {
    const x = r.int(2, 13), y = r.int(2, 13);
    if (m[y - Y0] && m[y - Y0][x - X0]) continue;
    img.mix(x, y, [120, 70, 36], 0.7); img.mix(x, y + 1, [96, 56, 30], 0.4);
  }
  const dx = r.int(2, 13);
  for (let y = 1; y < 5; y++) img.mix(dx, 14 - y + 1, [110, 64, 34], 0.35 - y * 0.06);
  grime(img, seed + 9, 0.12, [60, 56, 44], 2, 0.6);
  return img;
}

const CHAR_NAMES = new Set([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 'blank', 'dash', 'plus', 'excl', 'amp', 'dot', 'apos', 'hash']);
export function signGenerator(name) {
  if (!name.startsWith('sign_')) return null;
  const ch = name.slice(5);
  if (!CHAR_NAMES.has(ch)) return null;
  return (img) => letterTile(img, ch);
}

function crossSign(img, seed, col) {
  const W = pal(0xb8b6ac, 0xc4c2b8, 0xcecdc4, 0xd6d5cc);
  paint(img, W, eq(combine(fbm(seed, 3, 3, 2), 0.5, white(seed + 1), 0.5)), 0.5);
  const C = [shade(col, -0.1), col, shade(col, 0.08)];
  img.each((x, y) => {
    const inV = x >= 6 && x <= 9 && y >= 2 && y <= 13;
    const inH = y >= 6 && y <= 9 && x >= 2 && x <= 13;
    if (!inV && !inH) return;
    const edgeHi = (inV && (x === 6 || y === 2)) || (inH && (y === 6 || x === 2));
    const edgeLo = (inV && (x === 9 || y === 13)) || (inH && (y === 9 || x === 13));
    img.set(x, y, edgeHi ? C[2] : edgeLo ? C[0] : C[1]);
  });
  for (let t = 0; t < 16; t++) { img.set(t, 0, hex(0x8a8a84)); img.set(t, 15, hex(0x6a6a64)); img.set(0, t, hex(0x8a8a84)); img.set(15, t, hex(0x6a6a64)); }
  speckle(img, seed + 2, 0.03, pal(0x7a4a2a, 0x5a5a52));
  streaks(img, seed + 3, 3, [110, 64, 34], 6, 0.3);
  grime(img, seed + 4, 0.2, [90, 84, 70], 2, 0.55);
}

export const SIGNS = {
  sign_back(img, { seed }) {
    const G = pal(0x5e6264, 0x686c6e, 0x727678, 0x7c8082, 0x86898b);
    paint(img, G, eq(combine(fbm(seed, 2, 4, 2), 0.5, white(seed + 1), 0.5)), 0.5);
    for (const by of [4, 11]) for (let x = 0; x < 16; x++) { img.tone(x, by, 0.1); img.tone(x, by + 1, -0.06); img.tone(x, by + 2, -0.14); }
    for (const [x, y] of [[3, 5], [12, 5], [3, 12], [12, 12]]) { img.set(x, y, hex(0x3a3e40)); img.set(x, y - 1, hex(0xa6aaac)); }
    streaks(img, seed + 2, 4, [110, 64, 34], 7, 0.35);
  },
  sign_cross_red(img, { seed }) { crossSign(img, seed, hex(0xa82a22)); },
  sign_cross_green(img, { seed }) { crossSign(img, seed, hex(0x2e7a3a)); },
};
export { FONT as SIGN_FONT };
