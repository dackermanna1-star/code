// CG register_book — the Register from above, open on the weigh-master's desk at the top of the
// buried breaker. An enormous leather ledger, aged ruled pages with red margins, the founder's red line
// at the head of each page. A brass oil lamp off the top-right corner pools warm light on the pages;
// the mine fire seeps red through the floorboards below the desk. The ruled rows are left clean — the
// UI writes the names. Animated: the lamp breathes, dust drifts through the light, the seams pulse.
import {
  W, H, PAL, mix, U, Buf, rampStops, shade, bay, h01, fbm, vnoise, clamp01, mixU, text35, text35Width,
  once, lazyGen, seeds, blitA, quant,
} from './cg_kit.js';

const PAPER = rampStops([PAL.ink, PAL.brown_dd, mix(PAL.brown_d, PAL.paper_d, 0.25), mix(PAL.tan, PAL.paper_d, 0.5), PAL.paper_d, mix(PAL.paper, PAL.cream_l, 0.4), mix(PAL.paper, PAL.white, 0.45)], 12);
const LEATHER = rampStops([PAL.ink, PAL.blood_d, mix(PAL.brown_d, PAL.velvet_d, 0.5), mix(PAL.brown, PAL.velvet, 0.3), PAL.rust, mix(PAL.tan, PAL.rust, 0.4)], 9);
const WOOD = rampStops([PAL.ink, PAL.brown_dd, PAL.wood_d, PAL.wood, PAL.wood_l, PAL.maple], 9);
const BRASS = rampStops([PAL.ink, PAL.brass_d, PAL.brass, PAL.gold, PAL.gold_l, PAL.white], 8);
const RULE_D = U(mix(PAL.blue, PAL.g3, 0.35));
const RED_INK = rampStops([PAL.blood_d, PAL.red_d, PAL.red, PAL.red_l], 5);
const FIRE = rampStops([PAL.ink, PAL.fire_dd, PAL.fire_d, PAL.fire, PAL.fire_l, PAL.ember], 8);

const BOOK = { x0: 38, y0: 16, x1: 442, y1: 248 };
const PAGE_L = { x0: 54, x1: 237 }, PAGE_R = { x0: 243, x1: 426 }, PY0 = 26, PY1 = 238;
const GUTTER = 240;
const LAMP = { x: 458, y: 14 }, POOL = { x: 330, y: 92 };
const ROW0 = 64, ROW_H = 11;
const COLS = [15, 28, 104, 141];   // no. | name | enrolled | remarks (the UI page's proportions)

const light = (x, y) => {
  const d = Math.hypot((x - POOL.x) * 0.9, (y - POOL.y) * 1.15);
  return clamp01(0.05 + 1.0 * Math.exp(-d / 165) - 0.2 * clamp01((d - 200) / 160));
};
const mkR = (seed) => { let i = 0; return () => h01(i++, seed, 77); };

// floorboard gaps under the desk: a few, uneven, broken
function isGap(x, y) {
  for (const gx of [22, 61, 118, 160, 205, 262, 318, 371]) {
    const xx = gx + Math.round(Math.sin(y * 0.7 + gx) * 0.6);
    if (x === xx && h01(gx, y >> 2, 6) > 0.25) return true;
  }
  return false;
}

function paintDesk(b) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const plank = Math.floor((y + Math.sin(x / 90) * 3) / 34);
    const grain = vnoise(x / 26 + plank * 7, (y % 34) / 2.2, 5 + plank);
    let v = 0.3 + (grain - 0.5) * 0.22 + (fbm(x / 60, y / 30, 9, 2) - 0.5) * 0.1;
    if (((y + Math.round(Math.sin(x / 90) * 3)) % 34) === 0) v = 0.05;          // plank joints
    v *= light(x, y) * 1.05;
    // coal dust in the grain
    if (h01(x, y, 3) < 0.04) v *= 0.6;
    b.px(x, y, shade(WOOD, clamp01(v), x, y));
  }
  // the desk ends; beneath it the floor, and the fire glowing up between the boards
  for (let y = 254; y < H; y++) for (let x = 0; x < W; x++) {
    const red = clamp01(1 - x / 420) * (0.4 + 0.6 * vnoise(x / 26, y / 5, 4));
    const gap = isGap(x, y);
    const c = gap ? shade(FIRE, clamp01(0.25 + 0.6 * red), x, y) : shade(FIRE, clamp01(0.04 + 0.14 * red * clamp01((y - 254) / 12)), x, y);
    b.px(x, y, c);
  }
  // the fire's glow climbing the front of the desk on the left
  for (let y = 180; y < 254; y++) for (let x = 0; x < 300; x++) {
    const a = clamp01(1 - x / 300) * clamp01((y - 180) / 74) * 0.55;
    if (a > bay(x, y)) b.px(x, y, mixU(b.get(x, y), U(PAL.fire_d), 0.35));
  }
  for (let x = 0; x < W; x++) { b.px(x, 252, shade(WOOD, 0.36 * light(x, 252) + 0.1, x, 252)); b.px(x, 253, shade(WOOD, 0.04, x, 253)); }
}

function paintBook(b) {
  const { x0, y0, x1, y1 } = BOOK;
  // shadow under the book (lamp from the top-right throws it down-left)
  for (let y = y0 + 4; y < y1 + 8; y++) for (let x = x0 - 8; x < x1 + 2; x++) {
    if (x > x1 - 6 && y < y0 + 10) continue;
    const o = b.get(x, y);
    b.px(x, y, mixU(o, U(PAL.ink), 0.6));
  }
  // leather cover with a tooled border, scuffed corners and brass corner protectors
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const cx = Math.min(x - x0, x1 - 1 - x), cy = Math.min(y - y0, y1 - 1 - y);
    if (cx + cy < 3) continue;                                           // rounded corners
    const wear = fbm(x / 6, y / 6, 31, 3);
    let v = (0.4 + (wear - 0.5) * 0.3) * light(x, y) + 0.04;
    if (cx === 0 || cy === 0) v += 0.12;
    if ((cx === 4 || cy === 4) && cx >= 4 && cy >= 4) v -= 0.15;        // tooled line
    b.px(x, y, shade(LEATHER, clamp01(v), x, y));
  }
  for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1 - 1, y0, -1, 1], [x0, y1 - 1, 1, -1], [x1 - 1, y1 - 1, -1, -1]]) {
    for (let j = 0; j < 12; j++) for (let i = 0; i < 12 - j; i++) {
      const x = cx + i * sx, y = cy + j * sy;
      if (i + j < 3) continue;
      b.px(x, y, shade(BRASS, clamp01((0.45 + (i + j === 11 ? -0.2 : 0) + (i === 3 - j || j === 0 || i === 0 ? 0.15 : 0)) * light(x, y) * 1.3), x, y));
    }
    b.px(cx + 5 * sx, cy + 5 * sy, U(PAL.brass_d));
  }
  // page block edges: stacked leaves at the outer sides and the foot
  for (let y = PY0 - 2; y < PY1 + 6; y++) for (const [xa, xb] of [[46, PAGE_L.x0], [PAGE_R.x1, 434]]) for (let x = xa; x < xb; x++) {
    const leaf = (x + (y >> 4)) % 2;
    b.px(x, y, shade(PAPER, clamp01((0.36 + leaf * 0.08) * light(x, y) * 1.1), x, y));
  }
  for (let y = PY1; y < PY1 + 6; y++) for (let x = 46; x < 434; x++) {
    const leaf = y % 2;
    b.px(x, y, shade(PAPER, clamp01((0.3 + leaf * 0.1) * light(x, y) * 1.1), x, y));
  }
  // the two pages: curved toward the gutter, foxed and water-stained
  const stains = [[110, 196, 22], [362, 60, 14], [300, 214, 18]];
  for (let y = PY0; y < PY1; y++) for (let x = PAGE_L.x0; x < PAGE_R.x1; x++) {
    const dg = Math.abs(x + 0.5 - GUTTER);
    let v = 0.8;
    v -= 0.42 * Math.exp(-dg / 7);                                       // the gutter's fold
    v -= 0.1 * clamp01(1 - Math.min(x - PAGE_L.x0, PAGE_R.x1 - x) / 10);  // outer edges darker
    v += (fbm(x / 9, y / 9, 51, 3) - 0.5) * 0.1;                          // paper tooth
    for (const [sx, sy, r] of stains) {
      const d = Math.hypot(x - sx, (y - sy) * 1.2);
      if (d < r) v -= 0.05 + (Math.abs(d - r) < 1.2 ? 0.08 : 0);          // water stain with a tide line
    }
    if (h01(x, y, 61) < 0.004) v -= 0.25;                                 // foxing
    v *= light(x, y) * 1.12;
    b.px(x, y, shade(PAPER, clamp01(v), x, y));
  }
  b.vline(GUTTER, PY0, PY1 - PY0, shade(PAPER, 0.05, 0, 0));
  // page furniture: printed heading, the founder in red at the head of each page, column rules
  for (const P of [PAGE_L, PAGE_R]) {
    const pw = P.x1 - P.x0;
    const ink = (v) => (x, y) => shade(PAPER, clamp01(v * light(x, y) * 1.2), x, y);
    const head = P === PAGE_L ? 'REGISTER OF PUPILS' : 'HALLOWELL CONSOLIDATED SCHOOL';
    text35(b, P.x0 + Math.floor((pw - text35Width(head)) / 2), PY0 + 5, head, ink(0.22));
    const founder = 'HALLOWELL, CYRUS — FIRST PUPIL';
    const fx = P.x0 + Math.floor((pw - text35Width(founder)) / 2);
    text35(b, fx, PY0 + 15, founder, (x, y) => shade(RED_INK, clamp01((0.75 + (h01(x, y, 9) - 0.5) * 0.3) * light(x, y) * 1.3), x, y));
    b.hline(fx - 2, PY0 + 22, text35Width(founder) + 4, shade(RED_INK, 0.45, 0, 0));
    const labels = [['NO.', 2], ['NAME OF PUPIL', COLS[1] + 3], ['ENROLLED', COLS[2] + 3], ['REMARKS', COLS[3] + 4]];
    for (const [t, cx] of labels) text35(b, P.x0 + cx, ROW0 - 9, t, ink(0.3));
    // red double rule under the heading, double red margin + column rules
    for (const yy of [ROW0 - 2, ROW0]) for (let x = P.x0 + 2; x < P.x1 - 2; x++) b.px(x, yy, mixU(b.get(x, yy), U(PAL.red), 0.6 * light(x, yy) + 0.2));
    for (const c of COLS.slice(1)) for (const dx of [-2, 0]) for (let y = ROW0 - 12; y < PY1 - 4; y++) {
      const x = P.x0 + c + dx;
      b.px(x, y, mixU(b.get(x, y), U(PAL.red_l), (0.4 + (h01(x, y, 4) < 0.1 ? -0.2 : 0)) * light(x, y) + 0.12));
    }
    // pale blue rules: the clean rows waiting for names
    for (let ry = ROW0 + ROW_H; ry < PY1 - 3; ry += ROW_H) for (let x = P.x0 + 2; x < P.x1 - 2; x++) {
      if (h01(x, ry, 8) < 0.03) continue;
      b.px(x, ry, mixU(b.get(x, ry), RULE_D, 0.38));
    }
    // folio numbers at the foot
    const folio = P === PAGE_L ? '102' : '103';
    text35(b, P === PAGE_L ? P.x0 + 4 : P.x1 - 15, PY1 - 8, folio, ink(0.35));
  }
  // a dog-eared, lifted corner at the bottom right with its shadow
  for (let j = 0; j < 12; j++) for (let i = 0; i < 12 - j; i++) {
    const x = PAGE_R.x1 - 1 - i, y = PY1 - 1 - j;
    b.px(x, y, i + j > 9 ? shade(PAPER, 0.06, x, y) : shade(PAPER, clamp01((0.5 - (i + j) * 0.02) * light(x, y) * 1.2), x, y));
  }
  for (let k = 0; k < 10; k++) b.px(PAGE_R.x1 - 11 + k, PY1 - 2 - (9 - k), shade(PAPER, 0.15, 0, 0));
  // the ribbon marker: crimson silk running out of the gutter and off the foot of the book
  // (a flat silk band lying along the right page by the gutter, then over the foot edge)
  const rib = (y) => (y < PY1 ? GUTTER + 3 + (y > 150 ? Math.round((y - 150) / 60) : 0) : GUTTER + 5 + Math.round((y - PY1) * 0.3));
  for (let y = PY0 + 2; y < 264; y++) {
    const x = rib(y);
    const v = (0.62 + (y > PY1 ? -0.15 : 0)) * light(x, y) * 1.35 + 0.08;
    b.px(x - 1, y + 1, mixU(b.get(x - 1, y + 1), U(PAL.ink), 0.35));                          // its shadow
    b.px(x, y, shade(RED_INK, clamp01(v + 0.15), x, y));
    b.px(x + 1, y, shade(RED_INK, clamp01(v), x, y));
    b.px(x + 2, y, shade(RED_INK, clamp01(v - 0.2), x, y));
  }
  const ex = rib(263);
  b.px(ex, 264, shade(RED_INK, 0.3, 0, 0)); b.px(ex + 2, 264, shade(RED_INK, 0.2, 0, 0));       // the cut, forked end
}

function paintThings(b) {
  // the oil lamp, from above, off the top-right corner
  const { x, y } = LAMP;
  b.ellipse(x - 4, y + 6, 30, 26, (i, j) => mixU(b.get(i, j), U(PAL.ink), 0.5));              // its shadow
  b.ellipse(x, y, 26, 24, (i, j) => shade(BRASS, clamp01(0.5 + 0.35 * (1 - Math.hypot(i - x + 8, j - y - 8) / 30) - (Math.hypot(i - x, j - y) > 23 ? 0.2 : 0)), i, j));
  b.ellipse(x, y, 15, 14, (i, j) => shade(BRASS, 0.35, i, j));
  b.ellipse(x, y, 11, 10, (i, j) => U(mix(PAL.yellow_l, PAL.white, 0.4)));                     // chimney glass, glowing
  b.ellipse(x, y, 7, 6, (i, j) => U(PAL.white));
  // brass checks: the breaker's privy tokens, numbered, by the inkwell
  const checks = [[24, 118, '17'], [20, 140, '9'], [34, 156, '44']];
  for (const [cx, cy, n] of checks) {
    b.ellipse(cx + 1, cy + 2, 7, 6, (i, j) => mixU(b.get(i, j), U(PAL.ink), 0.5));
    b.ellipse(cx, cy, 6, 6, (i, j) => shade(BRASS, clamp01((0.38 + (i - cx > 2 || j - cy < -2 ? 0.15 : 0)) * light(i, j) * 1.4), i, j));
    b.px(cx, cy - 4, U(PAL.ink));                                                               // the hole
    text35(b, cx - Math.floor(text35Width(n) / 2), cy - 1, n, U(PAL.brass_d));
  }
  // inkwell (black glass) and the dip pen across the desk
  b.ellipse(26, 70, 13, 12, (i, j) => mixU(b.get(i, j), U(PAL.ink), 0.55));
  const glassR = rampStops([PAL.ink, PAL.night, PAL.g1, PAL.g3, PAL.paper], 6);
  b.ellipse(24, 66, 12, 11, (i, j) => {
    const d = Math.hypot(i - 24, j - 66), rim = d > 9.5 && i > 26 && j < 66;
    return shade(glassR, clamp01(0.12 + (rim ? 0.5 : 0) + (i > 30 ? 0.06 : 0)), i, j);
  });
  b.px(31, 61, U(PAL.paper)); b.px(32, 62, shade(glassR, 0.6, 0, 0));
  b.ellipse(24, 66, 4, 4, U(PAL.ink));
  b.line(12, 96, 34, 76, U(PAL.wood_d)); b.line(13, 96, 35, 76, shade(WOOD, 0.4, 0, 0)); b.line(34, 76, 38, 72, U(PAL.g4));
  // a lump of coal on the page's edge, and its dust
  b.poly([[420, 226], [432, 220], [440, 228], [436, 238], [424, 238]], (i, j) => shade(rampStops([PAL.ink, PAL.night, PAL.g2, PAL.moon_l], 5), clamp01((j < 226 && i > 428 ? 0.6 : 0.15) * light(i, j) * 1.3), i, j));
  const r = mkR(3);
  for (let k = 0; k < 40; k++) { const px = 404 + r() * 40, py = 220 + r() * 24; b.px(px, py, mixU(b.get(px, py), U(PAL.ink), 0.5)); }
}

const layers = lazyGen(function* () {
  const b = new Buf();
  paintDesk(b); yield;
  paintBook(b); yield;
  paintThings(b); yield;
  // a warm overlay for the lamp's breathing (drawn with a quantized alpha)
  const glow = new Buf();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot((x - POOL.x) * 0.9, (y - POOL.y) * 1.15);
    const a = Math.exp(-d / 140);
    if (a * 0.9 > bay(x, y)) glow.px(x, y, U(mix(PAL.amber_l, PAL.yellow_l, 0.4)));
  }
  yield;
  const seam = new Buf();
  for (let y = 254; y < H; y++) for (let x = 0; x < W; x++) {
    if (isGap(x, y) && x < 380 && (y + x) % 2 === 0) seam.px(x, y, U(PAL.fire_l));
  }
  return { base: b.toCanvas(), glow: glow.toCanvas(), seam: seam.toCanvas(), motes: seeds(26, 44) };
});

export const prepRegister = layers;

export const registerBook = {
  draw(ctx, t = 0) {
    const L = layers();
    ctx.drawImage(L.base, 0, 0);
    const fl = 0.5 + 0.25 * Math.sin(t * 2.1) + 0.15 * Math.sin(t * 5.3 + 1) + 0.1 * Math.sin(t * 11.7);
    blitA(ctx, L.glow, quant(0.04 + 0.05 * fl, 10));
    blitA(ctx, L.seam, quant(0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.3)), 6));
    // dust adrift in the lamplight
    for (let i = 0; i < 26; i++) {
      const s = L.motes;
      const x = POOL.x - 120 + ((s[i * 4] * 240 + t * (3 + s[i * 4 + 2] * 4)) % 240);
      const y = POOL.y - 70 + ((s[i * 4 + 1] * 150 + Math.sin(t * 0.5 + i) * 6 + t * 1.5) % 150);
      const a = 0.35 + 0.35 * Math.sin(t * (0.8 + s[i * 4 + 3]) + i);
      if (a < 0.1) continue;
      ctx.fillStyle = `rgba(240,207,140,${a.toFixed(2)})`;
      ctx.fillRect(x | 0, y | 0, 1, 1);
    }
  },
};
