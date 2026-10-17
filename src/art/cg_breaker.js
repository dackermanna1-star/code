// CG breaker_reveal — the buried Hallowell Breaker. A vast black wooden breaker, stepped like a
// staircase for giants, fills a cavern lit from below by mine-fire seams. Its picking room burned open
// in 1894: through the charred breach, chutes slant down, and along their benches sit the seventeen
// breaker boys, black against the fire, each with a cap-lamp. The diagonals carry the eye up to the
// one warm window at the top — the weigh-master's office, where the Register waits. Tess, tiny, on a
// ledge below. Animated: embers rising, smoke drifting, the seams breathing, cap-lamps flickering.
import {
  W, H, PAL, mix, U, Buf, rampStops, shade, bay, h01, fbm, vnoise, clamp01, mixU, once, seeds, blitA, quant,
  makeVapor,
} from './cg_kit.js';
import { CAST } from './cg_cast.js';

const FIRE = rampStops([PAL.ink, mix(PAL.ink, PAL.fire_dd, 0.6), PAL.fire_dd, mix(PAL.fire_dd, PAL.fire_d, 0.6), PAL.fire_d, PAL.fire, PAL.fire_l, PAL.ember, mix(PAL.ember, PAL.white, 0.5)], 14);
const TIMBER = rampStops([PAL.ink, mix(PAL.ink, PAL.brown_dd, 0.5), mix(PAL.brown_dd, PAL.fire_dd, 0.5), mix(PAL.fire_dd, PAL.brown_d, 0.5), mix(PAL.fire_d, PAL.brown, 0.4), mix(PAL.fire, PAL.rust, 0.5)], 10);
const ROCK = rampStops([PAL.ink, mix(PAL.ink, PAL.night, 0.5), mix(PAL.night, PAL.fire_dd, 0.5), PAL.fire_dd, mix(PAL.fire_d, PAL.brown_d, 0.4), mix(PAL.fire, PAL.rust, 0.4)], 10);
const LAMP = rampStops([PAL.amber_d, PAL.amber, PAL.amber_l, PAL.amber_ll, PAL.white], 5);

const FLOOR = 228;
// stepped body: [x0, x1, yTop], head-house first; each level's shed roof slopes down to the right
const LEVELS = [[238, 300, 16], [222, 332, 46], [206, 364, 82], [190, 396, 120], [174, 426, 158], [158, 452, 196]];
const OFFICE = { x: 262, y: 26, w: 12, h: 8 };
// a burned-out bay of the picking room: ragged, but square-cut by the frame that survived
const BREACH = [[218, 92], [228, 90], [236, 94], [250, 89], [262, 92], [280, 88], [296, 93], [312, 89], [330, 94], [346, 91], [356, 97], [358, 112], [362, 124], [358, 140], [362, 158], [358, 172], [360, 184], [342, 186], [326, 183], [306, 187], [284, 184], [262, 187], [244, 183], [226, 186], [216, 180], [219, 164], [214, 146], [218, 130], [214, 112]];
const FLOOR_BEAM = 140;     // the floor between the two picking-room levels, half burned through
const CHUTES = [[[226, 104], [352, 136]], [[220, 128], [362, 160]], [[218, 152], [356, 182]]];
const SEAMS = [
  [[0, 254], [40, 250], [86, 247], [130, 242], [168, 240], [214, 236], [258, 240], [306, 235], [356, 238], [410, 232], [446, 236], [480, 233]],
  [[130, 242], [116, 254], [104, 270]], [[258, 240], [272, 252], [282, 270]], [[410, 232], [428, 222], [452, 218], [480, 210]],
  [[40, 250], [28, 238], [10, 232]], [[214, 236], [206, 248], [214, 262], [204, 270]],
];
const POOLS = [[258, 242, 10], [130, 244, 7], [410, 234, 8], [40, 251, 6]];
const TESS = { x: 86, y: 196 };

const mkR = (seed) => { let i = 0; return () => h01(i++, seed, 4021); };
function segDist(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = clamp01(((x - a[0]) * dx + (y - a[1]) * dy) / l2);
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
// the seam distance field is sampled many times per pixel by several painters: cache it
let SEAM_FIELD = null;
function seamDist(x, y) {
  x |= 0; y |= 0;
  if (SEAM_FIELD && x >= 0 && y >= 0 && x < W && y < H) return SEAM_FIELD[y * W + x];
  return seamDistRaw(x, y);
}
function buildSeamField() {
  // the geometric distance is smooth: take it at half resolution, upsample, then add the jag per pixel
  const hw = (W >> 1) + 1, hh = (H >> 1) + 1, g = new Float32Array(hw * hh);
  for (let j = 60; j < hh; j++) for (let i = 0; i < hw; i++) g[j * hw + i] = segMin(i * 2, j * 2);
  SEAM_FIELD = new Float32Array(W * H).fill(1e9);
  for (let y = 120; y < H; y++) for (let x = 0; x < W; x++) {
    const i = x >> 1, j = y >> 1, tx = (x & 1) * 0.5, ty = (y & 1) * 0.5;
    const a = g[j * hw + i], b = g[j * hw + i + 1], c = g[(j + 1) * hw + i] ?? a, e = g[(j + 1) * hw + i + 1] ?? b;
    SEAM_FIELD[y * W + x] = seamDistRaw(x, y, a + (b - a) * tx + (c - a) * ty + (a - b - c + e) * tx * ty);
  }
}
function segMin(x, y) {
  let d = 1e9;
  for (const s of SEAMS) for (let i = 0; i + 1 < s.length; i++) d = Math.min(d, segDist(x, y, s[i], s[i + 1]));
  return d;
}
function seamDistRaw(x, y, geo) {
  let d = geo ?? segMin(x, y);
  // jagged, varying width
  d -= 0.9 * vnoise(x / 5, y / 5, 71) + 0.5 * vnoise(x / 2, y / 2, 72) - 0.4;
  for (const [px, py, r] of POOLS) d = Math.min(d, Math.hypot((x - px) / 2.2, y - py) - r * 0.35);
  return d;
}
function inPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// how much fire-light reaches height y (it all comes up from the floor)
const under = (y) => Math.exp(-Math.max(0, FLOOR + 16 - y) / 74);

function paintCavern(b) {
  // the back wall: slabs of coal and rock, lit only on faces turned down toward the fire
  const hgt = (x, y) => fbm(x / 34, y / 20, 3, 4) + 0.35 * fbm(x / 9, y / 7, 4, 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const hh = hgt(x, y), below = hgt(x, y + 2);
    const facesDown = clamp01((hh - below) * 9);             // surface rising away from the fire = lit underside
    const haze = 0.5 + 0.5 * fbm(x / 60 + y / 100, y / 40, 8, 3);
    const up = Math.exp(-Math.max(0, FLOOR + 10 - y) / 120);
    // seams behind the breaker throw a great glow up the far wall: the breaker stands black against it
    const back = Math.exp(-Math.hypot((x - 300) / 1.6, (y - 200) * 1.1) / 120);
    let v = 0.03 + up * (0.16 * haze + 0.2 * facesDown) + 0.42 * back * (0.55 + 0.6 * haze) + (hh - 0.5) * 0.06 * up;
    // strata lines
    if (Math.abs(((y + hh * 18) % 23) - 11) < 0.6) v -= 0.04;
    b.px(x, y, shade(ROCK, clamp01(v), x, y));
  }
  // hanging rock along the roof: black lobes with red-lit bellies
  for (let x = 0; x < W; x++) {
    const ceil = Math.round(10 + 10 * fbm(x / 26, 0, 5, 3) + 18 * Math.max(0, Math.sin(x / 41 + 1) * Math.sin(x / 17)));
    for (let y = 0; y <= ceil; y++) b.px(x, y, shade(ROCK, y >= ceil - 1 ? 0.22 : 0.02 + (fbm(x / 5, y / 5, 9, 2) - 0.5) * 0.04, x, y));
  }
  // side walls closing in: near-black, rimmed where they meet the glow
  for (const side of [0, 1]) for (let y = 0; y < H; y++) {
    const e = side === 0
      ? 28 + 40 * fbm(y / 46, 1, 11, 3) + (y > 160 ? (y - 160) * 0.18 : 0)
      : W - 22 - 44 * fbm(y / 46, 2, 12, 3) - (y > 170 ? (y - 170) * 0.2 : 0);
    for (let x = 0; x < W; x++) {
      const dist = side === 0 ? e - x : x - e;
      if (dist < 0) continue;
      const v = 0.03 + (dist < 2 ? 0.28 * under(y) + 0.06 : 0) + (fbm(x / 7, y / 7, 13, 2) - 0.5) * 0.06 + 0.12 * under(y) * Math.exp(-dist / 8);
      b.px(x, y, shade(ROCK, clamp01(v), x, y));
    }
  }
}

function paintBreaker(b) {
  const top = (x) => { for (const [x0, x1, y0] of LEVELS) if (x >= x0 && x < x1) return y0; return 999; };
  for (let y = 10; y < FLOOR + 2; y++) for (let x = 150; x < 460; x++) {
    if (y < top(x)) continue;
    const batten = x % 4 === 0;
    const grain = vnoise(x / 1.5, y / 9, 31);
    let v = 0.03 + 0.3 * under(y) + (grain - 0.5) * 0.07 - (batten ? 0.04 : 0);
    if (x === LEVELS.find((L) => y >= L[2] && x >= L[0] && x < L[1])?.[0]) v += 0.18 * (0.4 + under(y));   // lit corner edge
    if (x % 31 === 5 || x % 31 === 6) v -= 0.07;                                   // structural posts
    if (y % 19 === 0) v -= 0.05;                                                   // girts
    v -= 0.1 * clamp01((x - 160) / 300);                                           // the right flank turns away
    b.px(x, y, shade(TIMBER, clamp01(v), x, y));
  }
  // eaves: each level's shed roof overhangs; its underside catches the fire
  for (const [x0, x1, y0] of LEVELS) {
    for (let x = x0 - 3; x < x1 + 5; x++) {
      const slope = Math.round((x - x0) * 0.05);
      b.px(x, y0 - 1 + slope, shade(TIMBER, clamp01(0.04 + 0.12 * under(y0)), x, y0));
      b.px(x, y0 + slope, shade(TIMBER, clamp01(0.1 + 0.55 * under(y0)), x, y0));
      b.px(x, y0 + 1 + slope, U(PAL.ink));
    }
  }
  // the head-house gable + a lantern vent on its ridge
  b.poly([[234, 18], [269, 2], [304, 18]], (x, y) => shade(TIMBER, clamp01(0.06 + 0.12 * under(y) + (vnoise(x / 2, y / 6, 5) - 0.5) * 0.06), x, y));
  for (let i = 0; i < 35; i++) b.px(234 + i, 18 - Math.round(i * 16 / 34), shade(TIMBER, 0.24, 0, 0));
  // window rows: black holes; some glow dully with fire inside; boards hang loose
  const r = mkR(17);
  for (let li = 0; li < LEVELS.length; li++) {
    const [x0, x1, y0] = LEVELS[li];
    const yb = LEVELS[li + 1]?.[2] ?? FLOOR;
    for (let wy = y0 + 7; wy < yb - 6; wy += 12) for (let wx = x0 + 5; wx < x1 - 5; wx += 7) {
      if (inPoly(BREACH, wx + 1, wy + 2) || inPoly(BREACH, wx + 1, wy - 5) || inPoly(BREACH, wx + 1, wy + 8)) continue;
      if (wx > OFFICE.x - 6 && wx < OFFICE.x + OFFICE.w + 4 && wy < 44) continue;
      if (wx % 31 < 3) continue;
      const k = r();
      b.rect(wx, wy, 2, 4, k < 0.1 ? (i, j) => shade(FIRE, 0.36 + (j > wy + 1 ? 0.1 : 0), i, j) : U(PAL.ink));
      if (k > 0.9) b.px(wx + 2, wy + 3, shade(TIMBER, 0.25, 0, 0));
      b.hline(wx - 1, wy + 4, 4, shade(TIMBER, clamp01(0.1 + 0.45 * under(wy)), wx, wy));
    }
  }
  // the weigh-master's office: one warm window high in the dark
  const { x, y, w, h } = OFFICE;
  for (let j = y - 7; j < y + h + 9; j++) for (let i = x - 9; i < x + w + 9; i++) {
    const d = Math.hypot((i - x - w / 2) / 1.4, j - y - h / 2);
    if (0.75 * clamp01(1 - d / 12) > bay(i, j)) b.px(i, j, mixU(b.get(i, j), U(PAL.amber), 0.42));
  }
  b.rect(x, y, w, h, (i, j) => shade(LAMP, clamp01(0.55 + 0.35 * (1 - Math.hypot(i - x - w / 2, j - y - h / 2) / 6)), i, j));
  b.vline(x + w / 2, y, h, U(PAL.amber_dd)); b.hline(x, y + 3, w, U(PAL.amber_d));
  b.hline(x - 1, y + h, w + 2, shade(TIMBER, 0.4, 0, 0));
  // a stair climbing the outside of the levels toward it, rail lit from beneath
  for (let k = 0; k < 5; k++) {
    const [x1, y1] = [LEVELS[k + 1][1] - 4, LEVELS[k + 1][2]];
    const [x0, y0] = [LEVELS[k][1] + 4, LEVELS[k][2] + 4];
    b.line(x1, y1 - 1, x0, y0, shade(TIMBER, clamp01(0.1 + 0.4 * under(y1)), x1, y1));
    b.line(x1, y1 - 5, x0, y0 - 4, shade(TIMBER, 0.06, x1, y1));
  }
}

function paintBreach(b) {
  // the burned-open picking room: charred edge, the fire-lit smoke inside, chutes and benches
  const r = mkR(1894);
  for (let y = 84; y < 190; y++) for (let x = 210; x < 372; x++) {
    if (!inPoly(BREACH, x + 0.5, y + 0.5)) continue;
    // depth: the far wall's planks, rafters, smoke; the fire comes up through the floor at the bottom
    const n = fbm(x / 14, y / 10, 7, 3);
    // each storey is lit from its own floor: brightest just above the floor line, falling off upward
    const floorY = y < FLOOR_BEAM ? FLOOR_BEAM : 186;
    let v = 0.06 + 0.3 * Math.exp(-(floorY - y) / 22) + (n - 0.5) * 0.08 - 0.05 * clamp01((x - 310) / 60);
    if (x % 6 === 0) v -= 0.04;                                           // far wall boards
    b.px(x, y, shade(FIRE, clamp01(v), x, y));
  }
  for (let i = 0; i < BREACH.length; i++) {
    const [ax, ay] = BREACH[i], [bx, by] = BREACH[(i + 1) % BREACH.length];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay));
    for (let k = 0; k < n; k++) {
      const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
      b.px(x, y, U(PAL.ink));
      if (k % 2) continue;
      const len = 1 + Math.floor(r() * 6);
      const dir = y < 150 ? 1 : -1;
      for (let j = 1; j <= len; j++) b.px(x + (r() < 0.3 ? 1 : 0), y + j * dir, shade(TIMBER, j === len ? 0.3 : 0.04, x, y));
    }
  }
  // posts inside, black against the glow; the floor beam between the storeys, broken where it burned
  for (const px of [252, 296, 334]) for (let y = 86; y < 188; y++) if (inPoly(BREACH, px, y)) { b.px(px, y, U(PAL.ink)); b.px(px + 1, y, U(PAL.ink)); b.px(px + 2, y, shade(TIMBER, 0.1, px, y)); }
  for (let x = 214; x < 364; x++) {
    if (x > 268 && x < 286) continue;                                    // burned through here
    const sag = x > 286 && x < 300 ? Math.round((300 - x) * 0.3) : 0;
    for (let k = 0; k < 4; k++) if (inPoly(BREACH, x, FLOOR_BEAM + k + sag)) b.px(x, FLOOR_BEAM + k + sag, k === 0 ? shade(TIMBER, 0.3, x, 0) : U(PAL.ink));
  }
  // chutes: dark troughs slanting down; the bench plank above each
  for (const [a, c] of CHUTES) {
    for (let k = 0; k <= 160; k++) {
      const x = a[0] + (c[0] - a[0]) * k / 160, y = a[1] + (c[1] - a[1]) * k / 160;
      if (!inPoly(BREACH, x, y)) continue;
      b.px(x, y + 1, U(PAL.ink)); b.px(x, y + 2, U(PAL.ink)); b.px(x, y + 3, shade(TIMBER, 0.06, x, y));
      b.px(x, y + 4, shade(TIMBER, clamp01(0.16 + 0.4 * under(y)), x, y));      // trough lip
      b.px(x, y - 2, shade(TIMBER, 0.05, x, y));                                 // bench
    }
  }
}

// the seventeen: hunched over the chutes, each lamp a point of light (drawn per frame to flicker)
function boyPositions() {
  const out = [], per = [6, 6, 5];
  CHUTES.forEach(([a, c], ci) => {
    for (let i = 0; i < per[ci]; i++) {
      const t = (i + 0.55 + (ci === 2 ? 0.4 : 0)) / (per[ci] + 0.3);
      out.push({ x: Math.round(a[0] + (c[0] - a[0]) * t), y: Math.round(a[1] + (c[1] - a[1]) * t) - 2, k: out.length });
    }
  });
  return out;
}
function paintBoys(b, boys) {
  const ink = U(PAL.ink), rim = U(PAL.fire_d);
  for (const { x, y, k } of boys) {
    // seated sideways on the bench, bent over the coal: cap, head, curved back, knees over the trough
    b.rect(x - 1, y - 9, 4, 1, ink);                                   // cap brim
    b.rect(x - 1, y - 8, 3, 3, ink);                                   // head
    b.rect(x - 2, y - 5, 4, 4, ink);                                   // hunched back
    b.rect(x + 1, y - 4, 3, 2, ink);                                   // arms reaching into the chute
    b.rect(x - 1, y - 1, 4, 2, ink);                                   // seat + thighs
    b.px(x - 2, y - 5, rim); b.px(x - 2, y - 4, rim);                  // fire rimming the back
    if (k % 3 === 0) b.px(x + 3, y - 2, ink);
  }
}

function paintFloor(b) {
  for (let y = FLOOR - 8; y < H; y++) for (let x = 0; x < W; x++) {
    const ground = FLOOR - 8 + 7 * vnoise(x / 16, 0, 3);
    if (y < ground) continue;
    const d = seamDist(x, y);
    const rub = fbm(x / 3, y / 2.5, 21, 3);
    let v = 0.05 + 0.3 * Math.exp(-Math.max(0, d) / 7) + (rub - 0.5) * 0.18;
    const crust = vnoise(x / 3, y / 2, 73) > 0.62;                         // black crust bridging the seam
    if (d < 0.5 && !crust) v = 0.86 + (h01(x, y, 2) - 0.5) * 0.12;        // white-hot core
    else if (d < 1.3 && !crust) v = 0.66;
    else if (d < 2.4) v = crust ? 0.3 : 0.5;
    b.px(x, y, shade(FIRE, clamp01(v), x, y));
  }
  // external chutes from the base out to the right, on trestles
  for (const [x0, y0, x1, y1] of [[440, 200, 476, 222], [430, 170, 480, 200]]) {
    b.thick(x0, y0, x1, y1, 3, (x, y) => shade(TIMBER, clamp01(0.08 + 0.3 * under(y)), x, y));
    for (let k = 1; k < 3; k++) { const px = x0 + (x1 - x0) * k / 3, py = y0 + (y1 - y0) * k / 3; b.vline(px, py, FLOOR - py, shade(TIMBER, 0.1, px, py)); }
  }
  // the inclined plane: a long trestle climbing to the head-house from the left
  const A = [40, 220], B = [240, 26];
  b.thick(A[0], A[1], B[0], B[1], 4, (x, y) => shade(TIMBER, clamp01(0.05 + 0.3 * under(y) + ((x + y) % 5 === 0 ? 0.05 : 0)), x, y));
  b.line(A[0] + 2, A[1] + 3, B[0] + 2, B[1] + 3, shade(TIMBER, 0.3, 0, 0));                  // lit underside
  for (let k = 1; k < 13; k++) {
    const px = Math.round(A[0] + (B[0] - A[0]) * k / 13), py = Math.round(A[1] + (B[1] - A[1]) * k / 13);
    const fy = FLOOR - 4;
    b.vline(px, py + 3, fy - py, shade(TIMBER, clamp01(0.04 + 0.3 * under(py + 50)), px, py));
    if (k < 12) {
      const qx = Math.round(A[0] + (B[0] - A[0]) * (k + 1) / 13), qy = Math.round(A[1] + (B[1] - A[1]) * (k + 1) / 13);
      b.line(px, py + 6, qx, fy - 8, U(PAL.ink));
      b.line(px, fy - 8, qx, qy + 6, U(PAL.ink));
    }
  }
}

function paintForeground(b, fg) {
  // the rock shelf Tess stands on: black, its lip rimmed by the fire
  const shelf = [[0, 204], [30, 196], [70, 197], [108, 196], [140, 206], [160, 232], [168, 270], [0, 270]];
  const edgeY = (x) => { for (let i = 0; i < 5; i++) { const [ax, ay] = shelf[i], [bx, by] = shelf[i + 1]; if (x >= ax && x <= bx) return ay + (by - ay) * (x - ax) / (bx - ax); } return 300; };
  fg.poly(shelf, (x, y) => {
    const dy = y - edgeY(x);
    return shade(ROCK, clamp01(0.02 + (dy < 1.5 ? 0.38 : dy < 3 ? 0.14 : 0) + (fbm(x / 6, y / 6, 5, 2) - 0.5) * 0.05), x, y);
  });
  // right foreground: a fallen beam, charred, rimmed
  fg.thick(372, 272, 482, 232, 8, (x, y) => shade(TIMBER, clamp01(0.03 + (y < 246 - (x - 372) * 0.36 + 4 ? 0.3 : 0)), x, y));
  b.draw(fg);
  // Tess: tiny, her light thrown up at the thing
  const { x, y } = TESS;
  // the beam: a stepped value lift inside a cone (no speckle), fading with distance
  const ang = -0.58, half = 0.2, src = [x + 4, y - 9];
  for (let py = y - 90; py < y - 4; py++) for (let px = x; px < x + 130; px++) {
    const dx = px - src[0], dy = py - src[1], d = Math.hypot(dx, dy);
    if (d < 2 || d > 120) continue;
    const da = Math.abs(Math.atan2(dy, dx) - ang);
    if (da > half) continue;
    const a = (1 - d / 120) ** 1.3 * (1 - (da / half) ** 2);
    const lv = Math.floor(a * 3 + bay(px, py) - 0.3);
    if (lv > 0) b.px(px, py, mixU(b.get(px, py), U(PAL.yellow_l), 0.1 * lv));
  }
  const ink = U(PAL.ink);
  b.rect(x - 1, y - 7, 4, 7, (i, j) => (j > y - 3 ? ink : shade(CAST.denim, 0.08 + (i === x - 1 ? 0.22 : 0), i, j)));
  b.rect(x - 1, y - 11, 3, 4, (i, j) => shade(CAST.tessHair, j === y - 11 || i === x - 1 ? 0.6 : 0.3, i, j));
  b.px(x - 2, y - 9, shade(CAST.tessHair, 0.4, 0, 0));
  b.px(x + 2, y - 10, shade(CAST.skin, 0.25, 0, 0));
  b.hline(x + 2, y - 7, 3, U(PAL.g1)); b.px(x + 5, y - 8, U(PAL.white));          // the Maglite
}

const layers = once(() => {
  buildSeamField();
  const b = new Buf();
  paintCavern(b);
  paintBreaker(b);
  paintBreach(b);
  const boys = boyPositions();
  paintBoys(b, boys);
  paintFloor(b);
  const fg = new Buf();
  paintForeground(b, fg);
  const glow = new Buf();
  for (let y = 150; y < H; y++) for (let x = 0; x < W; x++) {
    if (fg.get(x, y)) continue;
    const d = seamDist(x, y);
    const a = Math.exp(-Math.max(0, d) / 14) * 0.8;
    if (a > bay(x, y)) glow.px(x, y, U(d < 3 ? PAL.ember : PAL.fire_l));
  }
  const emit = [];
  for (const s of SEAMS) for (let i = 0; i + 1 < s.length; i++) for (let k = 0; k < 4; k++) {
    const t = (k + 0.5) / 4;
    emit.push([s[i][0] + (s[i + 1][0] - s[i][0]) * t, s[i][1] + (s[i + 1][1] - s[i][1]) * t]);
  }
  return {
    base: b.toCanvas(), glow: glow.toCanvas(), boys, emit, es: seeds(170, 9), ss: seeds(14, 10),
    smoke: makeVapor(0, 0, W, 170, [mix(PAL.ink, PAL.fire_dd, 0.45), mix(PAL.night, PAL.fire_dd, 0.6)]),
  };
});

export function prepBreaker() { layers(); }

const EMBER = ['#ffb04a', '#f07a28', '#b83a17', '#fff0c8'];
export const breakerReveal = {
  draw(ctx, t = 0) {
    const L = layers();
    ctx.drawImage(L.base, 0, 0);
    // smoke rolling slowly up the cavern from the seams, thin enough to read through
    const sm = L.smoke, s2 = L.ss;
    sm.clear();
    for (let i = 0; i < 14; i++) {
      const life = 18 + s2[i * 4] * 10, ph = ((t + s2[i * 4 + 1] * life) % life) / life;
      const x = 40 + s2[i * 4 + 2] * 400 + Math.sin(t * 0.2 + i) * 10 + ph * 30;
      const y = 150 - ph * 150;
      sm.splat(x, y, 16 + ph * 36, 0.36 * Math.sin(Math.PI * ph));
    }
    sm.render(ctx);
    blitA(ctx, L.glow, quant(0.12 + 0.08 * Math.sin(t * 1.1) + 0.05 * Math.sin(t * 3.7), 8));
    for (const bo of L.boys) {
      const f = 0.75 + 0.25 * Math.sin(t * (2 + (bo.k % 5) * 0.7) + bo.k * 1.7);
      ctx.fillStyle = 'rgba(217,168,90,0.45)';
      ctx.fillRect(bo.x + 2, bo.y - 8, 1, 1); ctx.fillRect(bo.x + 1, bo.y - 9, 1, 1); ctx.fillRect(bo.x + 1, bo.y - 7, 1, 1);
      ctx.fillStyle = f > 0.62 ? '#fff0c8' : '#f0cf8c';
      ctx.fillRect(bo.x + 1, bo.y - 8, 1, 1);
    }
    const s = L.es, n = s.length / 4;
    for (let i = 0; i < n; i++) {
      const life = 3 + s[i * 4] * 4;
      const ph = ((t + s[i * 4 + 1] * life) % life) / life;
      const e = L.emit[Math.floor(s[i * 4 + 2] * L.emit.length)];
      const cyc = Math.floor((t + s[i * 4 + 1] * life) / life);
      const x = e[0] + (h01(i, cyc, 3) - 0.5) * 30 + Math.sin(t * 1.3 + i) * 4 + ph * 18 * (s[i * 4 + 3] - 0.3);
      const y = e[1] - ph * (90 + 130 * s[i * 4 + 3]);
      const k = ph < 0.2 ? 3 : ph < 0.5 ? 0 : ph < 0.8 ? 1 : 2;
      if (ph > 0.9 && (i & 1)) continue;
      ctx.fillStyle = EMBER[k];
      ctx.fillRect(x | 0, y | 0, 1, 1);
    }
  },
};
