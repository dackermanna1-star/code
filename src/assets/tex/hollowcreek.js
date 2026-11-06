// Hollow Creek texture pack (zm_hollow_creek): a small mountain town at night.
//   hc_white    clean white clapboard (the church, the diner, the white houses)
//   hc_siding   blue-grey clapboard (the houses that aren't white)
//   hc_stone    grey fieldstone (foundations, the bridge abutments, the creek walls, the memorial)
//   hc_leaves   dark pine needles (tree canopies, hedges)
//   hc_checker  black-and-white diner linoleum
//   hc_atlas    one 512 x 512 sheet for everything small: fence / railing / rail-bed / shop-window
//               strips (full width, so they tile along u), the signs (neon DINER, HARDWARE,
//               PHARMACY, POLICE ...), the bus and boxcar sides, doors, lit windows and flat paint
//               swatches. Map faces pick a rectangle of it by scale / offset (zm_hollow_creek_parts.js
//               atlasTex), so one texture (one draw call) carries all the town's small detail.
// Painted in typed arrays with seeded noise (deterministic, DOM-free), authored at 100 % = lit.
import { Rng, fbm, mod, clamp, smooth, makeImg, finish, white, F32, blur } from './core.js';
import { matchMean, masonry } from './stone.js';
import { stampLine } from './wood.js';

// ------------------------------------------------------------------ the atlas layout
// Pixel rectangles [x0, y0, x1, y1] (rows from the top). Strips span the full width and repeat
// every `period` px along u; regions are single pictures; swatches are 32 x 24 flat paints (y0).
// swatchY: the swatch row.
export const HC_ATLAS = {
  size: 512,
  strips: {
    picket: { y0: 0, y1: 48, period: 32 },
    baluster: { y0: 48, y1: 96, period: 32 },
    iron: { y0: 96, y1: 144, period: 16 },
    track: { y0: 144, y1: 208, period: 32 },
    shopwin: { y0: 208, y1: 272, period: 128 },
  },
  regions: {
    diner: [0, 272, 256, 336], hardware: [256, 272, 512, 336],
    pharmacy: [0, 336, 256, 376], police: [256, 336, 512, 376],
    school: [0, 376, 256, 416], bank: [256, 376, 384, 416], post: [384, 376, 512, 416],
    bus: [0, 416, 192, 464], boxcar: [192, 416, 320, 464], gas: [320, 416, 384, 464],
    door: [384, 416, 416, 464], shopdoor: [416, 416, 448, 464], winwarm: [448, 416, 480, 464], wincool: [480, 416, 512, 464],
    welcome: [0, 464, 256, 488], exit: [256, 464, 448, 488], hazard: [448, 464, 512, 488],
  },
  swatchY: 488,
  swatches: ['white', 'cream', 'green', 'black', 'barn', 'yellow', 'blue', 'maroon', 'chrome', 'tire', 'tail', 'head', 'sodium', 'navy', 'rust', 'bronze'],
};
const SW_COLORS = {
  white: [214, 210, 198], cream: [212, 196, 158], green: [52, 82, 60], black: [30, 30, 32],
  barn: [138, 46, 36], yellow: [226, 168, 30], blue: [56, 84, 132], maroon: [104, 34, 40],
  chrome: [176, 180, 184], tire: [26, 26, 28], tail: [250, 60, 48], head: [255, 246, 214],
  sodium: [255, 214, 150], navy: [34, 44, 74], rust: [116, 72, 48], bronze: [128, 98, 58],
};
const SW_GLOW = new Set(['tail', 'head', 'sodium']);

// ------------------------------------------------------------------ a 5 x 7 pixel font
const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
};

/** Text width in px at scale s (5-px glyphs, 1-px gaps, 3-px spaces). */
function textW(str, s) {
  let w = 0;
  for (const ch of str) w += (ch === ' ' ? 3 : 6) * s;
  return w - s;
}

/** Stamp str into a mask (Float32, width W) with its top-left at x, y. */
function textMask(mask, W, str, x, y, s) {
  for (const ch of str) {
    const g = FONT[ch];
    if (g) {
      for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
        if (g[r][c] !== '#') continue;
        for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) mask[(y + r * s + j) * W + x + c * s + i] = 1;
      }
    }
    x += (ch === ' ' ? 3 : 6) * s;
  }
}

// ------------------------------------------------------------------ the atlas painter
function atlas() {
  const W = HC_ATLAS.size, H = W, S = 8801;
  const img = makeImg(W, H);
  // (the noise is a 256 tile, read through q(i): a quarter of the cost of full-size fields)
  const grime = fbm(256, 256, { cx: 8, oct: 4, gain: 0.6, seed: S + 1 });
  const fine = fbm(256, 256, { cx: 32, oct: 2, seed: S + 2 });
  const wn = white(256, 256, S + 3);
  const q = (i) => (((i >> 9) & 255) << 8) | (i & 255);
  const set = (i, c, k = 1) => { img.r[i] = c[0] * k; img.g[i] = c[1] * k; img.b[i] = c[2] * k; };
  const paint = (i, c) => set(i, c, 1 + (grime[q(i)] - 0.5) * 0.16 + (fine[q(i)] - 0.5) * 0.08 + (wn[q(i)] - 0.5) * 0.05);
  const rect = (x0, y0, x1, y1, fn) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) fn(y * W + x, x - x0, y - y0, x, y); };
  const ST = HC_ATLAS.strips, R = HC_ATLAS.regions;

  // -- picket fence: pointed white pickets over dark gaps, two rails behind
  rect(0, ST.picket.y0, W, ST.picket.y1, (i, lx, ly) => {
    const p = mod(lx, 32), h = ST.picket.y1 - ST.picket.y0;
    const tip = Math.abs(p - 15.5); // pointed tops: about 8 px of rise over the 18-px picket
    const rail = (ly >= 15 && ly < 19) || (ly >= 36 && ly < 40);
    if (p >= 7 && p < 25 && ly >= Math.max(1, tip * 0.95)) {
      const edge = Math.min(p - 7, 24 - p);
      paint(i, SW_COLORS.white);
      const k = 0.78 + 0.22 * smooth(0, 3, edge) - smooth(h - 8, h, ly) * 0.25;
      img.r[i] *= k; img.g[i] *= k; img.b[i] *= k;
    } else if (rail) paint(i, [150, 148, 140]);
    else set(i, [16, 18, 16], 1 + (grime[q(i)] - 0.5) * 0.4);
  });
  // -- porch railing: top / bottom rails and square balusters
  rect(0, ST.baluster.y0, W, ST.baluster.y1, (i, lx, ly) => {
    const p = mod(lx, 32), h = ST.baluster.y1 - ST.baluster.y0;
    if (ly < 7 || ly >= h - 6) { paint(i, SW_COLORS.white); if (ly === 6 || ly === h - 6) { img.r[i] *= 0.7; img.g[i] *= 0.7; img.b[i] *= 0.7; } }
    else if (p >= 13 && p < 19) { paint(i, SW_COLORS.white); const k = p === 13 || p === 18 ? 0.8 : 1; img.r[i] *= k; img.g[i] *= k; img.b[i] *= k; }
    else set(i, [14, 15, 14], 1 + (grime[q(i)] - 0.5) * 0.4);
  });
  // -- wrought iron: bars with spear finials, two rails
  rect(0, ST.iron.y0, W, ST.iron.y1, (i, lx, ly) => {
    const p = mod(lx, 16), h = ST.iron.y1 - ST.iron.y0;
    const spear = ly < 8 && Math.abs(p - 7.5) <= (ly + 1) * 0.35;
    const bar = p >= 6 && p < 9 && ly >= 6;
    const rail = (ly >= 10 && ly < 13) || (ly >= h - 9 && ly < h - 6);
    if (spear || bar || rail) set(i, [40, 40, 42], 1 + (grime[q(i)] - 0.5) * 0.3 + (bar && p === 6 ? 0.25 : 0));
    else set(i, [12, 13, 16], 1 + (grime[q(i)] - 0.5) * 0.3);
  });
  // -- rail bed: ballast with creosoted ties every 32 px
  rect(0, ST.track.y0, W, ST.track.y1, (i, lx, ly) => {
    const p = mod(lx, 32), h = ST.track.y1 - ST.track.y0;
    const stone = 0.75 + 0.5 * wn[q(i)] + (grime[q(i)] - 0.5) * 0.3;
    if (p >= 4 && p < 18 && ly >= 3 && ly < h - 3) {
      const edge = Math.min(p - 4, 17 - p, ly - 3, h - 4 - ly);
      const gr = 1 + (fine[q(i)] - 0.5) * 0.5 + (mod(ly * 7 + p * 3, 11) < 1 ? -0.15 : 0);
      set(i, [70, 54, 40], gr * (0.75 + 0.25 * smooth(0, 2, edge)));
    } else set(i, [112, 104, 96], stone);
  });
  // -- lit shop windows (fullbright): warm panes, mullions, shelves of goods
  rect(0, ST.shopwin.y0, W, ST.shopwin.y1, (i, lx, ly, x) => {
    const p = mod(lx, 128), h = ST.shopwin.y1 - ST.shopwin.y0;
    const frame = p < 5 || p >= 123 || ly < 4 || ly >= h - 4 || (p >= 62 && p < 66);
    if (frame) { paint(i, SW_COLORS.green); return; }
    const cx = mod(p, 64) - 32, glow = 1 - Math.min(1, Math.hypot(cx / 40, (ly - 18) / 50));
    let c = [210 + 45 * glow, 160 + 50 * glow, 92 + 40 * glow];
    const shelf = (ly >= 24 && ly < 27) || (ly >= 42 && ly < 45);
    const goods = ((ly >= 14 && ly < 24) || (ly >= 33 && ly < 42) || (ly >= 50 && ly < 58)) && hashCol(x, Math.floor(ly / 9)) > 0.35;
    if (shelf) c = [70, 52, 36];
    else if (goods) { const t = hashCol(x >> 2, ly >> 3); c = t < 0.3 ? [150, 60, 46] : t < 0.6 ? [90, 110, 140] : [190, 170, 110]; c = c.map((v) => v * (0.75 + 0.35 * glow)); }
    set(i, c, 1 + (wn[q(i)] - 0.5) * 0.06);
  });

  // -- signs
  const sign = (r, bg, border, fg, lines) => {
    const [x0, y0, x1, y1] = r, w = x1 - x0, h = y1 - y0;
    rect(x0, y0, x1, y1, (i, lx, ly) => {
      const e = Math.min(lx, w - 1 - lx, ly, h - 1 - ly);
      paint(i, e < 2 ? [border[0] * 0.6, border[1] * 0.6, border[2] * 0.6] : e < 5 ? border : bg);
    });
    const mask = F32(w * h);
    for (const [txt, s, dy] of lines) textMask(mask, w, txt, Math.round((w - textW(txt, s)) / 2), dy, s);
    for (let ly = 0; ly < h; ly++) for (let lx = 0; lx < w; lx++) {
      const m = mask[ly * w + lx];
      if (!m) continue;
      const i = (y0 + ly) * W + x0 + lx;
      paint(i, fg);
      // a 1-px drop shadow down-right of each letter
      if (ly + 1 < h && lx + 1 < w && !mask[(ly + 1) * w + lx + 1]) { const k = (y0 + ly + 1) * W + x0 + lx + 1; img.r[k] *= 0.55; img.g[k] *= 0.55; img.b[k] *= 0.55; }
    }
  };
  // neon DINER: red tubes with a soft glow and a cyan frame tube on a dark backing
  {
    const [x0, y0, x1, y1] = R.diner, w = x1 - x0, h = y1 - y0;
    const red = F32(w * h), cyan = F32(w * h);
    textMask(red, w, 'DINER', Math.round((w - textW('DINER', 7)) / 2), 8, 7);
    for (let ly = 0; ly < h; ly++) for (let lx = 0; lx < w; lx++) {
      const e = Math.min(lx - 4, w - 5 - lx, ly - 3, h - 4 - ly);
      if (e >= 0 && e < 2) cyan[ly * w + lx] = 1;
    }
    const rg = blur(red, w, h, 3, false), cg = blur(cyan, w, h, 3, false);
    for (let ly = 0; ly < h; ly++) for (let lx = 0; lx < w; lx++) {
      const k = ly * w + lx, i = (y0 + ly) * W + x0 + lx;
      // the tube itself is near white at the core; the glass glows its colour around it
      const rr = red[k], cc = cyan[k], gr = Math.min(1, rg[k] * 1.6), gc = Math.min(1, cg[k] * 1.6);
      let c = [22 + 8 * grime[q(i)], 18 + 6 * grime[q(i)], 24 + 8 * grime[q(i)]];
      c = [c[0] + 230 * gr, c[1] + 40 * gr, c[2] + 46 * gr];
      c = [c[0] + 30 * gc, c[1] + 200 * gc, c[2] + 210 * gc];
      if (rr) c = [255, 150 + 60 * (rg[k] > 0.8 ? 1 : 0), 140];
      if (cc) c = [170, 255, 255];
      set(i, c.map((v) => clamp(v, 0, 255)));
    }
  }
  sign(R.hardware, SW_COLORS.green, SW_COLORS.cream, SW_COLORS.cream, [['HOLLOW CREEK', 2, 9], ['HARDWARE', 4, 28]]);
  sign(R.pharmacy, [222, 220, 210], [40, 96, 70], [30, 86, 60], [['PHARMACY', 3, 10]]);
  { // a green cross either side of PHARMACY
    const [x0, y0] = R.pharmacy;
    for (const cx of [26, 230]) rect(x0 + cx - 9, y0 + 11, x0 + cx + 9, y0 + 29, (i, lx, ly) => { if ((lx >= 6 && lx < 12) || (ly >= 6 && ly < 12)) paint(i, [40, 150, 80]); });
  }
  sign(R.police, SW_COLORS.navy, [190, 190, 196], [236, 236, 240], [['POLICE', 4, 6]]);
  sign(R.school, [96, 92, 86], [140, 132, 118], SW_COLORS.bronze, [['HOLLOW CREEK SCHOOL', 2, 13]]);
  sign(R.bank, [36, 52, 44], [160, 130, 70], [214, 178, 96], [['BANK', 3, 9]]);
  sign(R.post, [196, 196, 200], [40, 52, 90], [40, 52, 90], [['POST OFFICE', 2, 13]]);
  // the bus: yellow body, black rub rails, a band of dark windows, SCHOOL BUS lettering
  rect(R.bus[0], R.bus[1], R.bus[2], R.bus[3], (i, lx, ly) => {
    const win = ly >= 4 && ly < 19 && mod(lx, 24) >= 3 && mod(lx, 24) < 22 && lx > 18 && lx < 186;
    if (win) set(i, [26, 30, 36], 1 + (lx % 24 < 8 && ly < 9 ? 0.6 : 0));
    else if (ly === 22 || ly === 23 || ly === 33 || ly === 41) set(i, [20, 20, 20]);
    else paint(i, SW_COLORS.yellow);
  });
  { const [x0, y0, x1] = R.bus, w = x1 - x0, mask = F32(w * 48); textMask(mask, w, 'SCHOOL BUS', 48, 25, 1); for (let k = 0; k < mask.length; k++) if (mask[k]) set((y0 + Math.floor(k / w)) * W + x0 + (k % w), [18, 18, 18]); }
  // the boxcar: oxide red, vertical ribs, a sliding door, white reporting marks
  rect(R.boxcar[0], R.boxcar[1], R.boxcar[2], R.boxcar[3], (i, lx, ly) => {
    const rib = mod(lx, 10) === 0, door = lx >= 46 && lx < 82, de = door && (lx < 48 || lx >= 80 || ly < 3 || ly >= 45);
    paint(i, [128, 52, 38]);
    const k = rib ? 0.7 : de ? 0.55 : door ? 0.92 : 1;
    img.r[i] *= k; img.g[i] *= k; img.b[i] *= k;
  });
  { const [x0, y0, x1] = R.boxcar, w = x1 - x0, mask = F32(w * 48); textMask(mask, w, 'HCRR', 8, 10, 2); textMask(mask, w, '4471', 88, 10, 1); textMask(mask, w, '4471', 8, 30, 1); for (let k = 0; k < mask.length; k++) if (mask[k]) paint((y0 + Math.floor(k / w)) * W + x0 + (k % w), [200, 196, 186]); }
  // the gas price sign
  sign(R.gas, [226, 224, 216], [60, 60, 64], [24, 24, 26], [['3.29', 2, 22], ['3.49', 1, 39]]);
  rect(R.gas[0] + 3, R.gas[1] + 3, R.gas[2] - 3, R.gas[1] + 19, (i) => paint(i, [180, 36, 32]));
  { const [x0, y0, x1] = R.gas, w = x1 - x0, mask = F32(w * 48); textMask(mask, w, 'GAS', Math.round((w - textW('GAS', 2)) / 2), 4, 2); for (let k = 0; k < mask.length; k++) if (mask[k]) paint((y0 + Math.floor(k / w)) * W + x0 + (k % w), [240, 236, 228]); }
  // a panelled door (dark green, brass knob)
  rect(R.door[0], R.door[1], R.door[2], R.door[3], (i, lx, ly) => {
    const e = Math.min(lx, 31 - lx, ly, 47 - ly);
    const panel = (lx >= 6 && lx < 14 || lx >= 18 && lx < 26) && (ly >= 5 && ly < 20 || ly >= 25 && ly < 43);
    paint(i, e < 2 ? [190, 186, 176] : SW_COLORS.green);
    if (panel) { const pe = Math.min(mod(lx - 6, 12), ly < 22 ? Math.min(ly - 5, 19 - ly) : Math.min(ly - 25, 42 - ly)); const k = pe < 1 ? 0.65 : 0.92; img.r[i] *= k; img.g[i] *= k; img.b[i] *= k; }
    if (Math.hypot(lx - 25, ly - 24) < 1.6) set(i, [200, 170, 90]);
  });
  // a glazed shop door, dark inside
  rect(R.shopdoor[0], R.shopdoor[1], R.shopdoor[2], R.shopdoor[3], (i, lx, ly) => {
    const e = Math.min(lx, 31 - lx, ly, 47 - ly);
    if (e < 3 || (ly >= 26 && ly < 29)) paint(i, [66, 60, 54]);
    else set(i, [30, 36, 44], 1 + (lx + ly < 22 ? 0.5 : 0) + (wn[q(i)] - 0.5) * 0.1);
  });
  // lit windows (fullbright): warm with curtains and a cross mullion; cool TV-blue with blinds
  const litWin = (r, warm) => rect(r[0], r[1], r[2], r[3], (i, lx, ly) => {
    const e = Math.min(lx, 31 - lx, ly, 47 - ly);
    if (e < 2) { paint(i, SW_COLORS.white); return; }
    if (lx === 15 || lx === 16 || ly === 23 || ly === 24) { paint(i, [180, 176, 166]); return; }
    const g = 1 - Math.min(1, Math.hypot((lx - 16) / 18, (ly - 30) / 30));
    let c = warm ? [214 + 40 * g, 150 + 60 * g, 80 + 40 * g] : [90 + 60 * g, 130 + 70 * g, 190 + 50 * g];
    if (warm && (lx < 7 || lx > 24)) c = [150 + 30 * g, 60 + 20 * g, 46];
    if (!warm && mod(ly, 4) === 0) c = c.map((v) => v * 0.7);
    set(i, c, 1 + (wn[q(i)] - 0.5) * 0.06);
  });
  litWin(R.winwarm, true);
  litWin(R.wincool, false);
  // the town sign (white on green, routed), the highway exit sign, hazard stripes
  sign(R.welcome, [40, 70, 52], [214, 206, 180], [226, 220, 196], [['WELCOME TO HOLLOW CREEK', 1, 9]]);
  sign(R.exit, [30, 96, 60], [220, 224, 216], [236, 238, 232], [['EXIT 14  HOLLOW CREEK', 1, 9]]);
  rect(R.hazard[0], R.hazard[1], R.hazard[2], R.hazard[3], (i, lx, ly) => paint(i, mod(lx + ly, 16) < 8 ? [222, 172, 30] : [26, 26, 26]));
  // swatches
  HC_ATLAS.swatches.forEach((name, k) => {
    const c = SW_COLORS[name], glow = SW_GLOW.has(name);
    rect(k * 32, HC_ATLAS.swatchY, k * 32 + 32, 512, (i, lx, ly) => {
      if (glow) set(i, c, 0.92 + 0.08 * (1 - Math.min(1, Math.hypot(lx - 16, ly - 12) / 16)));
      else paint(i, c);
    });
  });

  return img;
}

/** A stable per-column / per-row hash in [0, 1). */
function hashCol(a, b) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ surfaces

/** Pine needles: dark blue-green with tufts of lighter tips and deep gaps between boughs. */
function leaves() {
  const W = 128, H = 128, N = W * H, S = 8901;
  const rng = new Rng(S);
  const big = fbm(W, H, { cx: 4, oct: 4, gain: 0.6, seed: S + 1 });
  const tuft = F32(N), dark = F32(N);
  for (let k = 0; k < 900; k++) {
    const x = rng.range(0, W), y = rng.range(0, H), a = -Math.PI / 2 + rng.range(-1.1, 1.1), l = rng.range(4, 10);
    stampLine(tuft, W, H, x, y, x + Math.cos(a) * l, y - Math.sin(a) * l * 0.6, 0.6, rng.range(0.4, 1));
  }
  for (let k = 0; k < 140; k++) {
    const x = rng.range(0, W), y = rng.range(0, H), l = rng.range(6, 16);
    stampLine(dark, W, H, x - l, y, x + l, y + rng.range(-3, 3), rng.range(1, 2.4), 1);
  }
  const db = blur(dark, W, H, 1);
  const img = makeImg(W, H);
  for (let i = 0; i < N; i++) {
    const f = (0.8 + 0.4 * big[i]) * (1 - Math.min(0.75, db[i] * 0.9));
    const t = Math.min(1, tuft[i]);
    img.r[i] = (30 + 34 * t) * f; img.g[i] = (50 + 46 * t) * f; img.b[i] = (40 + 24 * t) * f;
  }
  matchMean(img, [38, 58, 42]);
  finish(img, { grain: 6, chroma: 3, sharpen: 0.3, seed: S });
  return img;
}

/** Grey fieldstone: irregular courses of granite with dark recessed mortar. */
function fieldstone() {
  return masonry(128, 128, {
    seed: 8951, courseMin: 12, courseMax: 26, blockMin: 18, blockMax: 46,
    tints: [[1, 1, 1], [1.05, 1.0, 0.95], [0.92, 0.95, 1.0], [0.9, 0.9, 0.88], [1.08, 1.04, 0.98]],
    tone: 0.12, hue: 0.05, joint: 0.5, pits: 120, pitDepth: 0.8, pitDark: 0.35,
    bigAmp: 0.16, midAmp: 0.18, detAmp: 0.24, strata: 0, streak: 0.12, blot: 0.22, blotGrey: 0.5, blotThr: 0.55,
    edgeDirt: 0.16, bottomDirt: 0.1, light: 0.42, amb: 0.48, ao: 0.16, cast: 0.25, grain: 8, sharpen: 0.3, soft: 0.3,
    warp: 1.4, corner: 3, chip: 2.4, bevel: 2.2, depth: 1.6, surf: 1.4,
    base: [146, 144, 138], mortar: [84, 82, 78], target: [132, 130, 124],
  });
}

/**
 * Lap siding (clapboard): 16 px boards, a shadow under each lip, fine grain, the paint a
 * little weathered (clean enough for the white church). base: the paint colour.
 */
function clapboard(base, seed) {
  const W = 128, H = 128, N = W * H, S = seed;
  const rng = new Rng(S);
  const grain = fbm(W, H, { cx: 4, cy: 32, oct: 3, seed: S + 1 });
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 2 });
  const wear = fbm(W, H, { cx: 12, oct: 4, gain: 0.6, seed: S + 3 });
  const tone = Array.from({ length: 8 }, () => rng.gauss() * 0.02);
  const butt = Array.from({ length: 8 }, () => rng.int(0, 127));
  const img = makeImg(W, H), hgt = F32(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const b = y >> 4, t = mod(y, 16) / 16; // 0 at the board's top edge (under the lip above)
    const joint = smooth(1.2, 0.2, Math.abs(mod(x - butt[b], 128) - 64) < 1 ? 0 : 2); // one butt joint per board
    const f = (1 + tone[b] + (big[i] - 0.5) * 0.06 + (grain[i] - 0.5) * 0.05) * (1 - joint * 0.25);
    const worn = smooth(0.8, 0.86, wear[i]) * 0.35;
    // the lip's shadow at the top of each board, the board brightening toward its lower edge
    const sh = 0.72 + 0.28 * smooth(0, 0.22, t) - 0.06 * smooth(0.85, 1, t);
    img.r[i] = base[0] * f * sh * (1 - worn * 0.4); img.g[i] = base[1] * f * sh * (1 - worn * 0.4); img.b[i] = base[2] * f * sh * (1 - worn * 0.3);
    hgt[i] = t * 1.2;
  }
  finish(img, { grain: 4, chroma: 2, sharpen: 0.2, seed: S });
  return img;
}

/** Diner linoleum: worn black and white squares, grime in the seams. */
function checker() {
  const W = 128, H = 128, S = 9001;
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 1 });
  const scuff = fbm(W, H, { cx: 12, oct: 3, seed: S + 2 });
  const wn = white(W, H, S + 3);
  const img = makeImg(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const blk = ((x >> 5) + (y >> 5)) & 1;
    const j = Math.min(mod(x, 32), 31 - mod(x, 32), mod(y, 32), 31 - mod(y, 32));
    const seam = smooth(1.2, 0.2, j);
    let v = blk ? 34 : 214;
    v *= 1 + (big[i] - 0.5) * 0.12 + (wn[i] - 0.5) * 0.06;
    v += (blk ? 30 : -40) * smooth(0.62, 0.85, scuff[i]);
    v = v * (1 - seam * 0.35);
    img.r[i] = v; img.g[i] = v * 0.99; img.b[i] = v * (blk ? 1.02 : 0.95);
  }
  finish(img, { grain: 4, chroma: 2, sharpen: 0.2, seed: S });
  return img;
}

export const PACK = {
  name: 'hollowcreek',
  textures: {
    hc_white: { size: [128, 128], world: [128, 128], surface: 'wood', gen: () => clapboard([226, 224, 214], 9101) },
    hc_siding: { size: [128, 128], world: [128, 128], surface: 'wood', gen: () => clapboard([132, 156, 170], 9111) },
    hc_stone: { size: [128, 128], world: [128, 128], gen: fieldstone },
    hc_leaves: { size: [128, 128], world: [128, 128], surface: 'dirt', gen: leaves },
    hc_checker: { size: [128, 128], world: [96, 96], surface: 'tile', gen: checker },
    hc_atlas: { size: [512, 512], world: [512, 512], surface: 'wood', albedo: [0.42, 0.38, 0.32], gen: atlas },
  },
};
