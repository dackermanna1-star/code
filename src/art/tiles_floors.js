// Floor textures (tiles agent). Each floor key is one 512×256 toroidal texture in WORLD space:
// drawTile samples the 16×16 window under the cell, so boards, cracks, stains and wear run across
// tile boundaries and the pattern repeats only every 32×16 tiles (wider than the 30-tile screen).
// Decay is CLUSTERED by a low-frequency damage map — some stretches are wrecked, some nearly
// intact — so features never read as evenly sprinkled stamps. `clean` = the 1979 floor: same
// structural seed (same boards/squares), no decay.
import { PB, rgb, mixc, dk, lt, bay, fbm, vnoise, shadeField, speck, crack, lump, R } from './tiles_px.js';

export const TW = 512, TH = 256; // texture period (px) — multiples of 16 so cell windows never wrap

// ---------------------------------------------------------------------------------------------
// shared decay passes
function grime(pb, seed, { lo = 0.56, color = mixc('brown_dd', 'ink', 0.4), steps = 3, step = 0.14, cells = [[64, 64, 1], [24, 24, 0.6], [8, 8, 0.25]] } = {}) {
  shadeField(pb, fbm(pb.w, pb.h, cells, seed), { lo, hi: lo + 0.3, color, steps, step });
}
function wear(pb, seed, { lo = 0.58, color, steps = 2, step = 0.12, cells = [[96, 96, 1], [32, 32, 0.5]] } = {}) {
  shadeField(pb, fbm(pb.w, pb.h, cells, seed), { lo, hi: lo + 0.25, color, steps, step });
}
/** Low-frequency damage map; `at(x, y)` in 0..1. */
function damage(w, h, seed) {
  const f = fbm(w, h, [[128, 128, 1], [48, 48, 0.5]], seed);
  return { f, at: (x, y) => f[(((y % h) + h) % h) * w + (((x % w) + w) % w)] };
}
/** A random point, preferring damaged areas (rejection sampling). */
function pickXY(r, pb, dmg, power = 2) {
  for (let k = 0; k < 24; k++) {
    const x = Math.floor(r() * pb.w), y = Math.floor(r() * pb.h);
    if (!dmg || r() < Math.pow(Math.max(0, (dmg.at(x, y) - 0.25) / 0.6), power)) return [x, y];
  }
  return [Math.floor(r() * pb.w), Math.floor(r() * pb.h)];
}
/** Floor crack: a darker shade of whatever it crosses, jagged, rarely branching. */
function fcrack(pb, r, len, light, { tint = 0.55, branch = 0.03, dmg = null } = {}) {
  const [x, y] = pickXY(r, pb, dmg);
  crack(pb, r, x, y, len, r() * 6.28, 'ink', { tint, straight: 4, wobble: 0.5, branch, light });
}
/** Black rubber heel marks: short, mostly horizontal strokes. */
function heelMarks(pb, r, n, { y0 = 0, h = pb.h, color = mixc('ink', 'g1', 0.4), t = 0.5 } = {}) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * pb.w), y = y0 + Math.floor(r() * h);
    const len = 2 + Math.floor(r() * 4), bend = r() < 0.5 ? 0 : (r() < 0.5 ? -1 : 1);
    for (let k = 0; k < len; k++) pb.tint(x + k, y + (k === len - 1 ? bend : 0), color, k === 0 || k === len - 1 ? t * 0.6 : t);
  }
}
/** Irregular tide-mark stain (dried puddle): broken darker rim, faintly darker inside. */
function tideStain(pb, r, cx, cy, rad, color, rim = 0.2, fill = 0.08) {
  const k = r() * 6.28, a = 0.2 + r() * 0.15;
  const R2 = Math.ceil(rad * 1.4);
  for (let dy = -R2; dy <= R2; dy++) for (let dx = -R2; dx <= R2; dx++) {
    const ang = Math.atan2(dy, dx);
    const rr = rad * (1 + a * Math.sin(2 * ang + k) + 0.1 * Math.sin(5 * ang + k * 2));
    const d = Math.sqrt(dx * dx + dy * dy * 1.3);
    if (d > rr) continue;
    if (d > rr - 1.2) { if (r() < 0.7) pb.tint(cx + dx, cy + dy, color, rim); }
    else if (d > rr - 2.4) pb.tint(cx + dx, cy + dy, color, fill * 1.5);
    else if (bay(cx + dx, cy + dy) < 0.5) pb.tint(cx + dx, cy + dy, color, fill);
  }
}
function dust(pb, r, density) {
  speck(pb, r, 'g5', density, 0, 0, pb.w, pb.h, 0.25);
  speck(pb, r, 'ink', density * 0.8, 0, 0, pb.w, pb.h, 0.3);
}
function waxSheen(pb, r) { speck(pb, r, [255, 255, 255], 0.006, 0, 0, pb.w, pb.h, 0.12); }
const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------------------------------------------------------------------------------------------
// linoleum (9" VCT checker, 8 px squares = 2×2 per tile)
const LINO_A = mixc(mixc('tan', 'cream_d', 0.5), 'g3', 0.16);
const LINO_B = mixc(mixc('green_l', 'g4', 0.38), 'g3', 0.14);

function vctSquares(pb, r, A, B, jitter = 0.07) {
  for (let sy = 0; sy < pb.h / 8; sy++) for (let sx = 0; sx < pb.w / 8; sx++) {
    const base = (sx + sy) & 1 ? B : A;
    const j = (r() - 0.5) * jitter;
    pb.rect(sx * 8, sy * 8, 8, 8, j > 0 ? lt(base, j) : dk(base, -j));
  }
  // VCT chip mottle: short streaks a shade off the square colour
  const n = (pb.w * pb.h) / 22;
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * pb.w), y = Math.floor(r() * pb.h);
    const c = pb.get(x, y);
    const col = r() < 0.5 ? lt(c, 0.06) : dk(c, 0.07);
    pb.set(x, y, col);
    if (r() < 0.5 && ((x + 1) & 7)) pb.set(x + 1, y, col);
  }
}
/** A lost 8×8 square: black mastic with trowel ridges and jagged remnants of the tile. */
function missingSquare(pb, r, sx, sy) {
  const x0 = sx * 8, y0 = sy * 8;
  const mastic = mixc('brown_dd', 'ink', 0.35), ridge = mixc('brown_d', 'mustard_d', 0.3);
  const keep = pb.sub(x0, y0, 8, 8);
  pb.rect(x0, y0, 8, 8, mastic);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if (((i + j) % 3) === 0 && r() < 0.7) pb.tint(x0 + i, y0 + j, ridge, 0.5);
  const sides = [r() < 0.6, r() < 0.4, r() < 0.4, r() < 0.3];
  for (let k = 0; k < 8; k++) {
    if (sides[0] && r() < 0.75) { const d = 1 + (r() < 0.4 ? 1 : 0); for (let q = 0; q < d; q++) pb.blit(keep, k, q, 1, 1, x0 + k, y0 + q); }
    if (sides[1] && r() < 0.6) pb.blit(keep, k, 7, 1, 1, x0 + k, y0 + 7);
    if (sides[2] && r() < 0.6) pb.blit(keep, 0, k, 1, 1, x0, y0 + k);
    if (sides[3] && r() < 0.6) pb.blit(keep, 7, k, 1, 1, x0 + 7, y0 + k);
  }
  for (let k = 0; k < 8; k++) { // the hole's top/left lip is in shadow (light from the top-left)
    if (pb.get(x0 + k, y0)[0] === mastic[0]) pb.tint(x0 + k, y0, 'ink', 0.5);
    if (pb.get(x0, y0 + k)[0] === mastic[0]) pb.tint(x0, y0 + k, 'ink', 0.4);
  }
}
/** Curling square: lifted edge catches light, casts a 1-px shadow. */
function liftedSquare(pb, r, sx, sy) {
  const x0 = sx * 8, y0 = sy * 8;
  if (r() < 0.5) for (let k = 1; k < 7; k++) { pb.tint(x0 + k, y0 + 6, [255, 255, 255], 0.16); pb.tint(x0 + k, y0 + 7, [255, 255, 255], 0.1); pb.tint(x0 + k, y0 + 8, 'ink', 0.35); }
  else for (let k = 1; k < 7; k++) { pb.tint(x0 + 6, y0 + k, [255, 255, 255], 0.14); pb.tint(x0 + 8, y0 + k, 'ink', 0.35); }
}
/** Grime packed into some seams (part of a bottom/right edge). */
function dirtySeams(pb, r, p) {
  for (let sy = 0; sy < pb.h / 8; sy++) for (let sx = 0; sx < pb.w / 8; sx++) {
    if (r() < p) { const a = Math.floor(r() * 4), b = 4 + Math.floor(r() * 5); for (let k = a; k < b; k++) pb.tint(sx * 8 + k, sy * 8 + 7, 'ink', 0.16); }
    if (r() < p) { const a = Math.floor(r() * 4), b = 4 + Math.floor(r() * 5); for (let k = a; k < b; k++) pb.tint(sx * 8 + 7, sy * 8 + k, 'ink', 0.14); }
  }
}
function squareDamage(pb, r, dmg, { missing, lifted }) {
  for (let i = 0; i < missing; i++) { const [x, y] = pickXY(r, pb, dmg, 3); missingSquare(pb, r, x >> 3, y >> 3); if (r() < 0.4) missingSquare(pb, r, (x >> 3) + 1, y >> 3); }
  for (let i = 0; i < lifted; i++) { const [x, y] = pickXY(r, pb, dmg, 2); liftedSquare(pb, r, x >> 3, y >> 3); }
}

function lino(clean) {
  const r = R('lino');
  const pb = new PB(TW, TH);
  vctSquares(pb, r, LINO_A, LINO_B, clean ? 0.04 : 0.08);
  if (clean) { waxSheen(pb, R('lino_wax')); return pb; }
  const d = R('lino_decay'), dmg = damage(TW, TH, 14);
  wear(pb, 11, { color: mixc('g5', 'cream_d', 0.5), lo: 0.55 });
  grime(pb, 12, { lo: 0.56, step: 0.13 });
  // dust drifts: broad, warm gray-brown — the floor nobody has swept in 17 years
  grime(pb, 13, { lo: 0.5, color: mixc('g3', 'brown_d', 0.5), steps: 3, step: 0.1, cells: [[128, 128, 1], [48, 48, 0.6], [12, 12, 0.3]] });
  dirtySeams(pb, d, 0.3);
  heelMarks(pb, d, 160);
  for (let i = 0; i < 8; i++) { const [x, y] = pickXY(d, pb, dmg); tideStain(pb, d, x, y, 6 + d() * 12, 'brown_dd'); }
  for (let i = 0; i < 11; i++) fcrack(pb, d, 8 + d() * 22, lt(LINO_A, 0.2), { dmg });
  squareDamage(pb, d, dmg, { missing: 9, lifted: 9 });
  dust(pb, d, 0.012);
  return pb;
}

// corridor lino: darker squares; a polish-worn runner down the middle and dirt banked against the
// walls, centred on world row 15 (CONTENT §2: corridors are local rows 13–17 on every floor)
const HALL_A = lt(mixc('green_d', 'g2', 0.35), 0.08);
const HALL_B = lt(mixc(mixc('brown_d', 'red_d', 0.2), 'g2', 0.42), 0.08);
const RUNNER_Y = 15 * 16 + 8;

function linoHall(clean) {
  const r = R('lino_hall');
  const pb = new PB(TW, TH);
  vctSquares(pb, r, HALL_A, HALL_B, clean ? 0.03 : 0.06);
  const nf = vnoise(TW, TH, 32, 16, 21);
  const run = new Float32Array(TW * TH), edge = new Float32Array(TW * TH);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const i = y * TW + x, n = nf[i] - 0.5;
    const dd = Math.abs(((y - RUNNER_Y + TH * 1.5) % TH) - TH / 2);
    run[i] = clamp((22 + n * 14 - dd) / 12);
    edge[i] = clamp((dd - 26 + n * 10) / 12);
  }
  if (clean) {
    waxSheen(pb, R('hall_wax'));
    shadeField(pb, run.map((v) => v * 0.5), { lo: 0.05, hi: 0.5, color: 'g4', steps: 1, step: 0.08 });
    return pb;
  }
  const d = R('hall_decay'), dmg = damage(TW, TH, 24);
  // the runner: wax and colour walked off — duller, lighter, scuffed lengthwise
  shadeField(pb, run, { lo: 0.05, hi: 0.9, color: mixc('g4', 'cream_d', 0.35), steps: 3, step: 0.13 });
  for (let i = 0; i < 160; i++) {
    const x = Math.floor(d() * TW), y = RUNNER_Y - 18 + Math.floor(d() * 36), len = 6 + Math.floor(d() * 26);
    for (let k = 0; k < len; k++) if (d() < 0.85) pb.tint(x + k, y, mixc('g5', 'cream_d', 0.3), 0.14);
  }
  // dirt banks against the walls and in blotches away from the traffic lane
  shadeField(pb, edge, { lo: 0.1, hi: 1, color: mixc('brown_dd', 'ink', 0.5), steps: 3, step: 0.12 });
  const gf = fbm(TW, TH, [[64, 64, 1], [24, 24, 0.6], [8, 8, 0.25]], 22);
  for (let i = 0; i < gf.length; i++) gf[i] *= 1 - run[i] * 0.6;
  shadeField(pb, gf, { lo: 0.5, hi: 0.8, color: mixc('ink', 'brown_dd', 0.4), steps: 3, step: 0.12 });
  dirtySeams(pb, d, 0.35);
  heelMarks(pb, d, 240, { y0: RUNNER_Y - 26, h: 52, t: 0.45 });
  heelMarks(pb, d, 100, { t: 0.4 });
  for (let i = 0; i < 7; i++) { const [x, y] = pickXY(d, pb, dmg); tideStain(pb, d, x, y, 6 + d() * 12, 'ink', 0.2, 0.07); }
  for (let i = 0; i < 12; i++) fcrack(pb, d, 10 + d() * 24, lt(HALL_A, 0.15), { dmg });
  squareDamage(pb, d, dmg, { missing: 8, lifted: 7 });
  dust(pb, d, 0.01);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// maple strip flooring: 4-px boards (3 + seam) running east–west, staggered butt joints
function wood(clean) {
  const r = R('wood');
  const pb = new PB(TW, TH);
  const seam = mixc('wood_d', 'brown_dd', 0.5);
  const lo = mixc(mixc('maple', 'wood', 0.6), 'g3', 0.22), hi = mixc(mixc('maple', 'wood_l', 0.35), 'g4', 0.2);
  const boards = [];
  for (let row = 0; row < TH / 4; row++) {
    const y = row * 4;
    let x = Math.floor(r() * TW), left = TW;
    while (left > 0) {
      let len = 28 + Math.floor(r() * 60);
      if (left - len < 18) len = left;
      const t = r();
      let c = mixc(lo, hi, t * t);
      if (r() < 0.1) c = dk(c, 0.08);
      pb.rect(x, y, len, 3, c);
      pb.hline(x, y + 3, len, mixc(dk(c, 0.36), seam, 0.25));
      for (let k = 0; k < len; k++) { pb.tint(x + k, y, [255, 255, 255], 0.05); pb.tint(x + k, y + 2, 'ink', 0.05); }
      pb.vline(x, y, 3, dk(c, 0.3)); // butt joint
      const g = 1 + Math.floor(r() * 3);
      for (let q = 0; q < g; q++) { // grain
        const gy = y + Math.floor(r() * 3), gx = x + 2 + Math.floor(r() * Math.max(1, len - 8)), gl = 3 + Math.floor(r() * 12);
        for (let k = 0; k < gl && gx + k < x + len; k++) pb.tint(gx + k, gy, mixc('wood', 'brown', 0.5), 0.18);
      }
      if (r() < 0.05) { const kx = x + 3 + Math.floor(r() * Math.max(1, len - 6)); pb.set(kx, y + 1, dk(c, 0.3)); pb.tint(kx + 1, y + 1, 'ink', 0.15); }
      boards.push({ x, y, len });
      x += len; left -= len;
    }
  }
  if (clean) { speck(pb, R('wood_varnish'), [255, 240, 210], 0.01, 0, 0, TW, TH, 0.14); return pb; }
  const d = R('wood_decay'), dmg = damage(TW, TH, 33);
  wear(pb, 31, { color: mixc('g4', 'tan', 0.4), lo: 0.55, steps: 3, step: 0.12 });
  grime(pb, 32, { lo: 0.58, color: mixc('brown_dd', 'ink', 0.3) });
  // water damage under a roof leak: darkened, cupped boards
  for (let w = 0; w < 3; w++) {
    const [cx, cy] = pickXY(d, pb, dmg, 2), rad = 14 + d() * 18;
    for (const b of boards) {
      for (let k = 0; k < b.len; k++) {
        const X = b.x + k, dx = ((X - cx + TW * 1.5) % TW) - TW / 2, dy = ((b.y - cy + TH * 1.5) % TH) - TH / 2;
        const dd = Math.sqrt(dx * dx + dy * dy * 1.4) / rad;
        if (dd > 1) continue;
        const s = 0.22 * (1 - dd);
        for (let j = 0; j < 3; j++) pb.tint(X, b.y + j, mixc('brown_dd', 'ink', 0.3), s + (j === 2 ? 0.1 : 0));
        if (dd < 0.8) pb.tint(X, b.y, [255, 255, 255], 0.08); // cupped edges catch light
      }
    }
  }
  for (let i = 0; i < 26; i++) { // seams opened up, in the damaged areas
    const [x, y] = pickXY(d, pb, dmg, 2), l = 4 + Math.floor(d() * 12);
    for (let k = 0; k < l; k++) pb.tint(x + k, (y & ~3) + 3, 'ink', 0.45);
  }
  for (let i = 0; i < 70; i++) { // scratches
    const x = d() * TW, y = d() * TH, a = (d() - 0.5) * 0.8, l = 3 + d() * 8;
    for (let k = 0; k < l; k++) pb.tint(x + Math.cos(a) * k, y + Math.sin(a) * k, [255, 235, 200], 0.12);
  }
  heelMarks(pb, d, 80, { t: 0.35 });
  for (let i = 0; i < 2; i++) { // a split, sunken board
    const b = boards[Math.floor(d() * boards.length)], l = Math.min(b.len, 10 + Math.floor(d() * 10));
    for (let k = 0; k < l; k++) { pb.tint(b.x + k, b.y + 1, 'ink', 0.5); pb.tint(b.x + k, b.y + 2, 'ink', 0.25); }
  }
  dust(pb, d, 0.008);
  for (let i = 0; i < 5; i++) { const [x, y] = pickXY(d, pb, dmg); tideStain(pb, d, x, y, 6 + d() * 10, 'brown_dd', 0.2, 0.07); }
  return pb;
}

// ---------------------------------------------------------------------------------------------
// small square ceramic tile: 3-px tiles, 1-px grout, dark accents on a diagonal lattice
function ceramic(clean) {
  const r = R('ceramic');
  const pb = new PB(TW, TH);
  const tile = dk(mixc('paper_d', 'g6', 0.55), 0.12);
  const grout = mixc(tile, 'g4', 0.42);
  const accent = mixc('slate_l', 'green_d', 0.3);
  pb.rect(0, 0, TW, TH, grout);
  for (let cy = 0; cy < TH / 4; cy++) for (let cx = 0; cx < TW / 4; cx++) {
    const isAccent = (cx % 6 === 3 && cy % 6 === 3) || (cx % 6 === 0 && cy % 6 === 0);
    const j = (r() - 0.5) * 0.06;
    const base = isAccent ? accent : tile;
    const c = j > 0 ? lt(base, j) : dk(base, -j);
    pb.rect(cx * 4, cy * 4, 3, 3, c);
    pb.set(cx * 4, cy * 4, lt(c, isAccent ? 0.1 : 0.06)); // glaze glint
    pb.tint(cx * 4 + 2, cy * 4 + 2, 'ink', 0.06);
  }
  if (clean) return pb;
  const d = R('ceramic_decay'), dmg = damage(TW, TH, 44);
  const gf = fbm(TW, TH, [[48, 48, 1], [12, 12, 0.5]], 41);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const f = gf[y * TW + x];
    if (((x & 3) === 3 || (y & 3) === 3) && f > 0.4) pb.tint(x, y, mixc('brown_dd', 'ink', 0.4), Math.min(0.5, (f - 0.4) * 1.5));
  }
  grime(pb, 42, { lo: 0.6, color: mixc('mustard_d', 'brown_d', 0.5), steps: 2, step: 0.15 });
  grime(pb, 43, { lo: 0.64, color: 'ink', steps: 2, step: 0.12 });
  for (let i = 0; i < 14; i++) fcrack(pb, d, 6 + d() * 14, null, { tint: 0.5, dmg });
  for (let i = 0; i < 14; i++) { // missing tiles, in little clusters
    const [px, py] = pickXY(d, pb, dmg, 3);
    let cx = px >> 2, cy = py >> 2;
    const n = 1 + Math.floor(d() * 5);
    for (let k = 0; k < n; k++) {
      pb.rect(cx * 4, cy * 4, 3, 3, mixc('g2', 'g3', d()));
      pb.tint(cx * 4, cy * 4, 'ink', 0.4); pb.tint(cx * 4 + 1, cy * 4, 'ink', 0.3); pb.tint(cx * 4, cy * 4 + 1, 'ink', 0.3);
      if (d() < 0.5) cx++; else cy++;
    }
  }
  for (let i = 0; i < 3; i++) { const [x, y] = pickXY(d, pb, dmg); tideStain(pb, d, x, y, 4 + d() * 5, 'rust', 0.28, 0.16); }
  for (let i = 0; i < 5; i++) { const [x, y] = pickXY(d, pb, dmg); tideStain(pb, d, x, y, 7 + d() * 9, 'mustard_d', 0.18, 0.09); }
  dust(pb, d, 0.006);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// poured concrete: aggregate, saw-cut joints every 8 tiles, stains, damp, cracks
const CONC = mixc(mixc('g4', 'cream_d', 0.22), 'g3', 0.3);
function concrete(clean, seed = 'concrete') {
  const r = R(seed);
  const pb = new PB(TW, TH, CONC);
  const tone = fbm(TW, TH, [[32, 32, 1], [8, 8, 0.6], [3, 3, 0.4]], 51);
  shadeField(pb, tone, { lo: 0.55, hi: 0.85, color: lt(CONC, 0.2), steps: 1, step: 0.35 });
  shadeField(pb, tone.map((v) => 1 - v), { lo: 0.55, hi: 0.85, color: dk(CONC, 0.25), steps: 1, step: 0.35 });
  speck(pb, r, dk(CONC, 0.28), 0.035);
  speck(pb, r, lt(CONC, 0.18), 0.02);
  for (let j = 0; j < TW; j += 128) for (let k = 0; k < TH; k++) { pb.set(j, k, dk(CONC, 0.32)); pb.tint(j + 1, k, [255, 255, 255], 0.08); }
  for (let j = 0; j < TH; j += 128) for (let k = 0; k < TW; k++) { pb.set(k, j, dk(CONC, 0.32)); pb.tint(k, j + 1, [255, 255, 255], 0.08); }
  if (clean) return pb;
  const d = R(seed + '_decay'), dmg = damage(TW, TH, 55);
  grime(pb, 52, { lo: 0.52, color: mixc('g1', 'brown_dd', 0.4), steps: 3, step: 0.13, cells: [[96, 96, 1], [32, 32, 0.6], [8, 8, 0.2]] });
  shadeField(pb, fbm(TW, TH, [[64, 64, 1], [16, 16, 0.5]], 53), { lo: 0.6, hi: 0.85, color: mixc('blue_dd', 'g1', 0.5), steps: 2, step: 0.16 });
  for (let i = 0; i < 7; i++) { const [x, y] = pickXY(d, pb, dmg); tideStain(pb, d, x, y, 3 + d() * 7, 'ink', 0.3, 0.3); } // oil
  for (let i = 0; i < 5; i++) { const [x, y] = pickXY(d, pb, dmg); tideStain(pb, d, x, y, 3 + d() * 4, 'rust', 0.25, 0.14); }
  for (let i = 0; i < 14; i++) fcrack(pb, d, 16 + d() * 40, lt(CONC, 0.18), { tint: 0.6, branch: 0.05, dmg });
  shadeField(pb, fbm(TW, TH, [[40, 40, 1], [6, 6, 0.6]], 54), { lo: 0.72, hi: 0.9, color: 'g6', steps: 2, step: 0.18 });
  speck(pb, d, 'g1', 0.004);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// thin institutional carpet: rust/brown twill with tweed flecks
function carpet(clean) {
  const r = R('carpet');
  const base = mixc(mixc('rust', 'brown', 0.55), 'g3', 0.32);
  const pb = new PB(TW, TH, base);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    if (((x - y) & 3) < 2) pb.tint(x, y, 'ink', 0.09);
    else if (((x + y) & 7) === 0) pb.tint(x, y, [255, 255, 255], 0.04);
  }
  speck(pb, r, mixc('mustard_d', 'tan', 0.3), 0.025, 0, 0, TW, TH, 0.55);
  speck(pb, r, 'brown_dd', 0.035, 0, 0, TW, TH, 0.5);
  speck(pb, r, mixc('rust', 'red_d', 0.4), 0.02, 0, 0, TW, TH, 0.5);
  if (clean) return pb;
  const d = R('carpet_decay'), dmg = damage(TW, TH, 66);
  wear(pb, 61, { color: mixc('g4', 'tan', 0.5), lo: 0.52, steps: 3, step: 0.11 });
  grime(pb, 62, { lo: 0.58, color: mixc('brown_dd', 'ink', 0.5), steps: 3, step: 0.14 });
  shadeField(pb, fbm(TW, TH, [[48, 48, 1], [12, 12, 0.4]], 63), { lo: 0.7, hi: 0.88, color: mixc('green_dd', 'g1', 0.4), steps: 2, step: 0.18 });
  for (let i = 0; i < 10; i++) { const [x, y] = pickXY(d, pb, dmg); tideStain(pb, d, x, y, 4 + d() * 10, 'brown_dd', 0.24, 0.16); }
  for (let i = 0; i < 5; i++) { // cigarette burns
    const x = d() * TW, y = d() * TH;
    pb.set(x, y, 'ink'); pb.tint(x + 1, y, 'ink', 0.5); pb.tint(x, y + 1, 'brown_dd', 0.6);
  }
  dust(pb, d, 0.006);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// anthracite: glinting faceted lumps over black
function coal(clean) {
  const r = R('coal');
  // (Integration 2: one notch lighter overall so heaps and paths read in the dark)
  const pb = new PB(TW, TH, mixc('ink', 'night', 0.6));
  speck(pb, r, mixc('night', 'shadow', 0.5), 0.3);
  const ramp = [mixc('ink', 'night', 0.7), mixc('night', 'shadow', 0.85), mixc('g1', 'blue_dd', 0.15), mixc('g2', 'blue_d', 0.2), mixc('g3', 'blue_l', 0.3)];
  for (let i = 0; i < 3400; i++) {
    const s = r();
    const rad = s < 0.5 ? 1.2 + r() * 1 : s < 0.9 ? 2.2 + r() * 1.4 : 3.6 + r() * 2;
    lump(pb, r, Math.floor(r() * TW), Math.floor(r() * TH), rad * (0.8 + r() * 0.5), rad * (0.7 + r() * 0.4), ramp);
  }
  const hi = rgb(ramp[4]);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const c = pb.get(x, y);
    if (c[0] === hi[0] && c[2] === hi[2] && r() < 0.11) pb.set(x, y, r() < 0.3 ? 'white' : 'moon_l');
  }
  if (!clean) speck(pb, R('coal_dust'), 'g1', 0.01);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// dirt + slate chips (mine floor, lawn edges)
function gravel(clean) {
  const r = R('gravel');
  const pb = new PB(TW, TH, mixc('brown_d', 'g2', 0.45));
  const tone = fbm(TW, TH, [[48, 48, 1], [10, 10, 0.6]], 71);
  shadeField(pb, tone, { lo: 0.5, hi: 0.8, color: mixc('brown', 'g3', 0.45), steps: 2, step: 0.3 });
  shadeField(pb, tone.map((v) => 1 - v), { lo: 0.55, hi: 0.85, color: mixc('brown_dd', 'g1', 0.4), steps: 2, step: 0.3 });
  speck(pb, r, mixc('brown_dd', 'ink', 0.3), 0.06);
  const slate = ['ink', 'g1', 'g2', mixc('g3', 'blue_l', 0.15), 'g4'];
  const tan = [mixc('brown_dd', 'ink', 0.3), 'brown_d', mixc('brown', 'g3', 0.4), mixc('tan', 'g4', 0.4), mixc('tan_l', 'g5', 0.4)];
  const coalR = ['ink', 'ink', 'night', 'shadow', mixc('g2', 'blue_l', 0.2)];
  for (let i = 0; i < 2600; i++) {
    const s = r(), ramp = s < 0.55 ? slate : s < 0.85 ? tan : coalR;
    const rad = 0.7 + r() * (r() < 0.85 ? 1.2 : 2.4);
    lump(pb, r, Math.floor(r() * TW), Math.floor(r() * TH), rad * (0.9 + r() * 0.5), rad * (0.6 + r() * 0.4), ramp);
  }
  if (clean) return pb;
  const d = R('gravel_decay');
  shadeField(pb, fbm(TW, TH, [[64, 64, 1], [16, 16, 0.5]], 72), { lo: 0.66, hi: 0.86, color: mixc('blue_dd', 'ink', 0.4), steps: 2, step: 0.18 });
  speck(pb, d, 'ink', 0.01);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// wet asphalt lot: aggregate, wet sheen, sky-reflecting puddles, cracks, faded stall lines
const ASPH = mixc('g1', 'g2', 0.55);
function asphalt(clean) {
  const r = R('asphalt');
  const pb = new PB(TW, TH, clean ? dk(ASPH, 0.18) : ASPH);
  speck(pb, r, lt(ASPH, 0.16), 0.08);
  speck(pb, r, dk(ASPH, 0.3), 0.06);
  speck(pb, r, 'g4', 0.006);
  // a row of parking stalls (world rows 8–10 / 24–26 of every 16): 2-px lines, 3 tiles apart
  const paint = clean ? mixc('cream_l', 'g6', 0.3) : mixc('cream', 'g3', 0.45);
  const pf = vnoise(TW, TH, 6, 6, 81);
  for (let x = 8; x + 2 <= TW; x += 48) for (let y = 132; y < 172; y++) for (let k = 0; k < 2; k++) {
    if (!clean && pf[y * TW + x + k] < 0.42) continue;
    pb.set(x + k, y, paint);
  }
  if (clean) { speck(pb, R('asph_c'), dk(ASPH, 0.35), 0.03); return pb; }
  const d = R('asphalt_decay'), dmg = damage(TW, TH, 88);
  const wet = fbm(TW, TH, [[64, 64, 1], [16, 16, 0.6], [6, 6, 0.3]], 82);
  shadeField(pb, wet, { lo: 0.45, hi: 0.8, color: mixc('blue_dd', 'ink', 0.35), steps: 3, step: 0.15 });
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (wet[y * TW + x] > 0.62 && d() < 0.03) pb.tint(x, y, 'moon', 0.28);
  // puddles mirror the overcast night sky: lighter and colder than the wet asphalt around them
  for (let i = 0; i < 9; i++) {
    const [cx, cy] = pickXY(d, pb, dmg, 1);
    const rx = 7 + d() * 14, ry = 3 + d() * 6, k = d() * 6.28;
    for (let dy = -Math.ceil(ry) - 1; dy <= ry + 1; dy++) for (let dx = -Math.ceil(rx) - 1; dx <= rx + 1; dx++) {
      const a = Math.atan2(dy, dx), rr = 1 + 0.22 * Math.sin(3 * a + k) + 0.1 * Math.sin(5 * a + 2 * k);
      const q = Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2) / rr;
      if (q > 1) continue;
      const X = cx + dx, Y = cy + dy;
      if (q > 0.86) pb.tint(X, Y, 'ink', 0.3);
      else pb.set(X, Y, bay(X, Y) < 0.3 + (dy / ry) * 0.25 ? mixc('blue_d', 'g2', 0.35) : mixc('blue_d', 'blue_dd', 0.4));
    }
    for (let s = 0; s < Math.floor(rx * 0.9); s++) if (d() < 0.7) pb.set(cx - Math.floor(rx * 0.5) + s, cy - Math.floor(ry * 0.45), mixc('blue_l', 'blue_d', 0.35));
    pb.set(cx + Math.floor(rx * 0.3), cy, mixc('moon', 'blue_d', 0.4));
  }
  for (let i = 0; i < 12; i++) fcrack(pb, d, 25 + d() * 50, null, { tint: 0.55, branch: 0.05, dmg });
  for (let i = 0; i < 5; i++) { // alligator patches
    const [cx, cy] = pickXY(d, pb, dmg, 3);
    for (let k = 0; k < 6; k++) crack(pb, d, cx + (d() - 0.5) * 20, cy + (d() - 0.5) * 14, 4 + d() * 6, d() * 6.28, 'ink', { tint: 0.5, straight: 3, branch: 0.1, wobble: 0.9 });
  }
  for (let i = 0; i < 90; i++) { // dead weeds in the cracks
    const x = d() * TW, y = d() * TH;
    if (pb.get(Math.floor(x), Math.floor(y))[0] > 26) continue;
    pb.set(x, y - 1, mixc('mustard_d', 'brown', 0.4)); if (d() < 0.6) pb.set(x + 1, y - 2, mixc('tan', 'mustard_d', 0.5));
  }
  dust(pb, d, 0.004);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// dead October grass, oak leaves in drifts
function grass(clean) {
  const r = R('grass');
  const g0 = clean ? mixc('green_d', 'mustard_d', 0.4) : mixc(mixc('mustard_d', 'brown_d', 0.6), 'g2', 0.22);
  const pb = new PB(TW, TH, g0);
  const tone = fbm(TW, TH, [[48, 48, 1], [12, 12, 0.6]], 91);
  shadeField(pb, tone, { lo: 0.5, hi: 0.85, color: clean ? mixc('green', 'mustard', 0.4) : mixc(mixc('tan', 'mustard_d', 0.6), 'g3', 0.25), steps: 2, step: 0.25 });
  shadeField(pb, tone.map((v) => 1 - v), { lo: 0.58, hi: 0.85, color: clean ? 'green_dd' : mixc('brown_dd', 'green_dd', 0.4), steps: 2, step: 0.3 });
  const bladeL = clean ? mixc('green_l', 'mustard', 0.4) : mixc(mixc('tan', 'cream_d', 0.4), 'g3', 0.2);
  const bladeD = clean ? 'green_dd' : mixc('brown_dd', 'brown_d', 0.5);
  for (let i = 0; i < TW * TH * 0.09; i++) {
    const x = Math.floor(r() * TW), y = Math.floor(r() * TH), h = 2 + Math.floor(r() * 2);
    const light = r() < 0.5;
    for (let k = 0; k < h; k++) pb.tint(x + (k === h - 1 && r() < 0.3 ? 1 : 0), y - k, light ? bladeL : bladeD, light ? 0.35 + k * 0.12 : 0.45);
  }
  if (!clean) shadeField(pb, fbm(TW, TH, [[64, 64, 1], [12, 12, 0.6]], 92), { lo: 0.68, hi: 0.86, color: mixc('brown_dd', 'g1', 0.3), steps: 2, step: 0.3 });
  const leafCols = [[mixc('rust', 'brown', 0.3), 'brown_d'], [mixc('mustard', 'brown', 0.35), 'mustard_d'], ['brown', 'brown_dd'], [mixc('red_d', 'rust', 0.5), 'brown_dd'], [mixc('tan', 'brown', 0.3), 'brown_d']];
  const nc = clean ? 28 : 90;
  for (let k = 0; k < nc; k++) {
    const ccx = r() * TW, ccy = r() * TH, n = 4 + Math.floor(r() * 10);
    for (let i = 0; i < n; i++) {
      const [c, s] = leafCols[Math.floor(r() * leafCols.length)];
      const x = Math.floor(ccx + (r() - 0.5) * 18), y = Math.floor(ccy + (r() - 0.5) * 12), sh = r();
      if (sh < 0.45) { pb.set(x, y, c); pb.set(x + 1, y, c); pb.set(x + 2, y, s); pb.set(x + 1, y + 1, s); pb.tint(x + 1, y + 2, 'ink', 0.3); }
      else if (sh < 0.8) { pb.set(x, y, c); pb.set(x + 1, y, lt(c, 0.08)); pb.set(x + 1, y + 1, c); pb.set(x + 2, y + 1, s); pb.tint(x + 2, y + 2, 'ink', 0.3); }
      else { pb.set(x, y, c); pb.set(x + 1, y + 1, s); }
    }
  }
  if (!clean) speck(pb, R('grass_d'), 'ink', 0.006, 0, 0, TW, TH, 0.4);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// worn granite flags (steps / plaza)
function stone(clean) {
  const r = R('stone');
  const base = mixc(mixc('g4', 'g5', 0.25), 'tan', 0.06);
  const pb = new PB(TW, TH, base);
  const joint = mixc('g2', 'g3', 0.3);
  for (let row = 0; row < TH / 16; row++) {
    const y = row * 16;
    let x = Math.floor(r() * 32), left = TW;
    while (left > 0) {
      let w = [16, 24, 32, 32, 40][Math.floor(r() * 5)];
      if (left - w < 16) w = left;
      const j = (r() - 0.5) * 0.12;
      const c = j > 0 ? lt(base, j) : dk(base, -j);
      pb.rect(x, y, w, 16, c);
      pb.hline(x, y, w, joint); pb.vline(x, y, 16, joint);
      pb.hline(x + 1, y + 1, w - 1, lt(c, 0.12)); pb.vline(x + 1, y + 1, 15, lt(c, 0.08));
      pb.hline(x + 1, y + 15, w - 1, dk(c, 0.14)); pb.vline(x + w - 1, y + 1, 15, dk(c, 0.1));
      x += w; left -= w;
    }
  }
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { // granite grain
    const v = r();
    if (v < 0.11) pb.tint(x, y, 'g2', 0.4);
    else if (v < 0.15) pb.tint(x, y, 'g6', 0.35);
    else if (v < 0.165) pb.tint(x, y, 'tan_l', 0.3);
  }
  if (clean) return pb;
  const d = R('stone_decay');
  wear(pb, 101, { color: 'g5', lo: 0.55, steps: 2, step: 0.14 });
  shadeField(pb, fbm(TW, TH, [[64, 64, 1], [16, 16, 0.5]], 102), { lo: 0.5, hi: 0.8, color: mixc('blue_dd', 'g1', 0.5), steps: 3, step: 0.14 });
  grime(pb, 103, { lo: 0.6, color: mixc('g1', 'brown_dd', 0.3) });
  const mf = vnoise(TW, TH, 24, 24, 104), jc = rgb(joint);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { // moss in the joints
    const c = pb.get(x, y);
    if (c[0] === jc[0] && c[1] === jc[1] && mf[y * TW + x] > 0.5) {
      pb.set(x, y, mixc('green_dd', 'green_d', d()));
      if (d() < 0.4) pb.tint(x + (d() < 0.5 ? 1 : 0), y + (d() < 0.5 ? 1 : -1), 'green_d', 0.4);
    }
  }
  for (let i = 0; i < 36; i++) { // lichen spots
    const cx = d() * TW, cy = d() * TH, rr = 1 + d() * 1.8;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= rr * rr) pb.tint(cx + dx, cy + dy, mixc('mint', 'g5', 0.5), 0.35);
  }
  for (let i = 0; i < 10; i++) fcrack(pb, d, 6 + d() * 16, 'g5', { tint: 0.5 });
  return pb;
}

// ---------------------------------------------------------------------------------------------
// black-and-white marble, one square per tile, veined, cold
function marble(clean) {
  const r = R('marble');
  const W = dk(mixc('g6', 'moon_l', 0.22), 0.12);
  const K = lt(mixc('ink', 'navy_dd', 0.5), 0.07);
  const pb = new PB(TW, TH);
  const white = (x, y) => (((x >> 4) + (y >> 4)) & 1) === 0;
  for (let ty = 0; ty < TH / 16; ty++) for (let tx = 0; tx < TW / 16; tx++) pb.rect(tx * 16, ty * 16, 16, 16, (tx + ty) & 1 ? K : W);
  const cloud = fbm(TW, TH, [[24, 24, 1], [8, 8, 0.5]], 111);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const f = cloud[y * TW + x];
    if (white(x, y) && f > 0.55 && bay(x, y) < (f - 0.55) * 3) pb.tint(x, y, mixc('g5', 'moon', 0.3), 0.25);
    if (!white(x, y) && f > 0.6 && bay(x, y) < (f - 0.6) * 2) pb.tint(x, y, 'g2', 0.4);
  }
  const veins = new PB(TW, TH);
  for (let i = 0; i < 22; i++) crack(veins, r, r() * TW, r() * TH, 30 + r() * 60, -0.6 + (r() - 0.5) * 1.2, [255, 255, 255], { branch: 0.04, wobble: 0.3 });
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    if (!veins.alpha(x, y) || bay(x, y) > 0.85) continue;
    if (white(x, y)) { pb.tint(x, y, mixc('g4', 'moon', 0.2), 0.6); if (bay(x, y) < 0.3) pb.tint(x + 1, y, 'g5', 0.3); }
    else pb.tint(x, y, mixc('g3', 'g4', 0.4), 0.6);
  }
  for (let ty = 0; ty < TH / 16; ty++) for (let tx = 0; tx < TW / 16; tx++) {
    const wh = ((tx + ty) & 1) === 0;
    pb.hline(tx * 16, ty * 16, 16, wh ? dk(W, 0.22) : lt(K, 0.06));
    pb.vline(tx * 16, ty * 16, 16, wh ? dk(W, 0.18) : lt(K, 0.05));
    if (r() < 0.4) { // a cold reflection on some squares, never in the same place twice
      const ox = tx * 16 + 2 + Math.floor(r() * 9), oy = ty * 16 + 2 + Math.floor(r() * 8), l = 2 + Math.floor(r() * 3);
      for (let k = 0; k < l; k++) pb.tint(ox + k, oy + k, wh ? 'white' : 'blue_l', wh ? 0.26 : 0.2);
    }
  }
  if (clean) return pb;
  const d = R('marble_decay');
  grime(pb, 112, { lo: 0.58, color: mixc('g1', 'brown_dd', 0.25), steps: 3, step: 0.12 });
  wear(pb, 113, { color: mixc('g4', 'g3', 0.5), lo: 0.62, steps: 2, step: 0.12 });
  for (let i = 0; i < 9; i++) fcrack(pb, d, 8 + d() * 16, 'g5', { tint: 0.55 });
  for (let i = 0; i < 10; i++) { // chipped corners
    const tx = Math.floor(d() * (TW / 16)), ty = Math.floor(d() * (TH / 16));
    pb.set(tx * 16 + 1, ty * 16 + 1, 'g2'); pb.set(tx * 16 + 2, ty * 16 + 1, 'g3'); pb.set(tx * 16 + 1, ty * 16 + 2, 'g3');
  }
  dust(pb, d, 0.01);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// breaker planks: rough tarred boards, 8-px rows with gaps onto the void (a hint of fire below)
function planks(clean) {
  const r = R('planks');
  const pb = new PB(TW, TH, 'ink');
  const lo = mixc('brown_dd', 'g1', 0.45), hi = mixc('wood_d', 'g2', 0.35);
  for (let row = 0; row < TH / 8; row++) {
    const y = row * 8;
    let x = Math.floor(r() * TW), left = TW;
    while (left > 0) {
      let len = 28 + Math.floor(r() * 44);
      if (left - len < 16) len = left;
      const bh = r() < 0.75 ? 6 : 7;
      const c = mixc(lo, hi, r() * 0.8);
      pb.rect(x + 1, y, len - 1, bh, c);
      for (let k = 1; k < len; k++) { pb.tint(x + k, y, [255, 255, 255], 0.1); pb.tint(x + k, y + bh - 1, 'ink', 0.3); }
      pb.vline(x + len - 1, y, bh, dk(c, 0.35));
      for (let q = 0; q < 3; q++) { // grain & splinters
        const gy = y + 1 + Math.floor(r() * (bh - 2)), gx = x + 2 + Math.floor(r() * (len - 6)), gl = 4 + Math.floor(r() * 14);
        for (let k = 0; k < gl && gx + k < x + len - 1; k++) pb.tint(gx + k, gy, r() < 0.5 ? 'ink' : [255, 230, 200], 0.18);
      }
      for (const nx of [x + 2, x + len - 3]) { pb.set(nx, y + 1, mixc('rust', 'g2', 0.4)); pb.set(nx, y + bh - 2, mixc('rust', 'g2', 0.5)); }
      x += len; left -= len;
    }
  }
  const glow = fbm(TW, TH, [[48, 48, 1], [12, 12, 0.5]], 121);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { // fire far below, faint in some gaps
    const c = pb.get(x, y), g = glow[y * TW + x];
    if (c[0] < 14 && c[1] < 14 && g > 0.58 && bay(x, y) < (g - 0.58) * 3.5) pb.set(x, y, 'fire_dd');
  }
  const d = R('planks_decay');
  speck(pb, d, mixc('g1', 'ink', 0.3), clean ? 0.02 : 0.05, 0, 0, TW, TH, 0.5); // coal dust
  if (!clean) {
    grime(pb, 122, { lo: 0.58, color: 'ink', steps: 2, step: 0.18 });
    for (let i = 0; i < 10; i++) { // broken-out board ends
      const x = Math.floor(d() * TW), y = Math.floor(d() * (TH / 8)) * 8, l = 3 + Math.floor(d() * 6);
      for (let k = 0; k < l; k++) for (let j = 0; j < 6; j++) if (j < 6 - Math.abs(k - l / 2)) pb.set(x + k, y + j, 'ink');
    }
  }
  return pb;
}

// ---------------------------------------------------------------------------------------------
// iron grating with bolted steel plates
function grate(clean) {
  const pb = new PB(TW, TH, 'ink');
  const bar = mixc('g3', 'g2', 0.3), barL = mixc('g4', 'g3', 0.2), barD = mixc('g2', 'ink', 0.3);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const hx = (x & 3) === 0, hy = (y & 3) === 0;
    if (hx || hy) pb.set(x, y, bar);
    else if ((y & 3) === 1) pb.set(x, y, mixc('ink', 'night', 0.6));
    else pb.set(x, y, mixc('night', 'shadow', (y & 3) / 6));
  }
  for (let k = 0; k < TH; k++) for (let g = 0; g < TW; g += 16) { pb.set(g, k, barL); pb.set(g + 1, k, barD); }
  for (let k = 0; k < TW; k++) for (let g = 0; g < TH; g += 16) { pb.set(k, g, barL); pb.set(k, g + 1, barD); }
  const pl = mixc('g3', 'g2', 0.5);
  for (const [tx, ty] of [[2, 1], [9, 6], [5, 12], [13, 3], [12, 13], [19, 2], [24, 9], [28, 14], [21, 12]]) { // bolted plates
    const x0 = tx * 16, y0 = ty * 16;
    pb.rect(x0, y0, 32, 16, pl);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 32; i++) if (((i + (j >> 1) * 2) % 4 === 0) && (j % 4 === 1)) { pb.set(x0 + i, y0 + j, lt(pl, 0.18)); pb.set(x0 + i + 1, y0 + j + 1, dk(pl, 0.2)); }
    pb.hline(x0, y0, 32, lt(pl, 0.15)); pb.vline(x0, y0, 16, lt(pl, 0.1));
    pb.hline(x0, y0 + 15, 32, 'ink'); pb.vline(x0 + 31, y0, 16, 'ink');
    for (const [bx, by] of [[2, 2], [29, 2], [2, 13], [29, 13]]) { pb.set(x0 + bx, y0 + by, lt(pl, 0.3)); pb.set(x0 + bx + 1, y0 + by + 1, 'ink'); }
  }
  for (let y = 0; y < TH; y += 4) for (let x = 0; x < TW; x += 4) if (pb.get(x, y)[0] === rgb(bar)[0]) pb.set(x, y, barL);
  const rf = fbm(TW, TH, [[32, 32, 1], [8, 8, 0.6]], 131);
  const d = R('grate_decay');
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    if (pb.get(x, y)[0] < 30) continue;
    const f = rf[y * TW + x], th = clean ? 0.72 : 0.5;
    if (f > th && bay(x, y) < (f - th) * 3) pb.tint(x, y, d() < 0.5 ? 'rust' : 'brown', clean ? 0.3 : 0.5);
  }
  if (!clean) {
    for (let i = 0; i < 8; i++) { const x = Math.floor(d() * (TW / 4)) * 4, y = Math.floor(d() * TH); pb.set(x, y, 'ink'); pb.set(x, y + 1, 'ink'); pb.set(x, y - 1, 'rust'); }
    speck(pb, d, 'g1', 0.01);
  }
  return pb;
}

// ---------------------------------------------------------------------------------------------
// fallen ceiling tile, plaster chunks, lath and glass over dusty lino
function debris(clean) {
  if (clean) return lino(true);
  const pb = lino(false);
  const d = R('debris');
  // a blanket of plaster dust: mutes the checker so debris cells sit on classroom or hall lino alike
  const dustC = mixc(mixc('g4', 'cream_d', 0.4), 'g3', 0.35);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) pb.tint(x, y, dustC, 0.55);
  shadeField(pb, fbm(TW, TH, [[32, 32, 1], [8, 8, 0.6]], 141), { lo: 0.38, hi: 0.8, color: mixc('g5', 'cream_d', 0.4), steps: 3, step: 0.13 });
  speck(pb, d, 'g5', 0.05, 0, 0, TW, TH, 0.4);
  speck(pb, d, 'g2', 0.03, 0, 0, TW, TH, 0.4);
  const ct = mixc('cream_l', 'g5', 0.35);
  for (let i = 0; i < 92; i++) { // perforated ceiling-tile slabs, broken corners, shadowed bottom-right
    const x = Math.floor(d() * TW), y = Math.floor(d() * TH), w = 5 + Math.floor(d() * 8), h = 4 + Math.floor(d() * 6);
    const cut = Math.floor(d() * 4);
    for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) {
      if (cut === 0 && k + j < 3) continue;
      if (cut === 1 && (w - k) + j < 4) continue;
      if (cut === 2 && k + (h - j) < 3) continue;
      const c = j === 0 || k === 0 ? lt(ct, 0.1) : ct;
      pb.set(x + k, y + j, ((k + j * 2) % 3 === 1 && j > 0 && k > 0) ? mixc('g4', 'cream_d', 0.4) : c);
    }
    for (let k = 1; k <= w; k++) pb.tint(x + k, y + h, 'ink', 0.45);
    for (let j = 1; j <= h; j++) pb.tint(x + w, y + j, 'ink', 0.4);
  }
  const plaster = [mixc('g2', 'ink', 0.2), 'g3', 'g5', mixc('g6', 'cream_l', 0.4), 'white'];
  for (let i = 0; i < 440; i++) lump(pb, d, Math.floor(d() * TW), Math.floor(d() * TH), 0.8 + d() * 2.4, 0.7 + d() * 1.8, plaster);
  for (let i = 0; i < 52; i++) { // lath strips
    const x = d() * TW, y = d() * TH, a = (d() - 0.5) * 1.6, l = 6 + d() * 10;
    for (let k = 0; k < l; k++) { pb.set(x + Math.cos(a) * k, y + Math.sin(a) * k, mixc('wood_l', 'tan', 0.4)); pb.tint(x + Math.cos(a) * k, y + Math.sin(a) * k + 1, 'ink', 0.4); }
  }
  for (let i = 0; i < 280; i++) { // glass
    const x = Math.floor(d() * TW), y = Math.floor(d() * TH);
    pb.set(x, y, d() < 0.4 ? 'moon_l' : mixc('moon', 'g4', 0.4));
    if (d() < 0.5) pb.set(x + 1, y, mixc('blue_d', 'g2', 0.5));
  }
  for (let i = 0; i < 10; i++) crack(pb, d, d() * TW, d() * TH, 10 + d() * 14, d() * 6.28, mixc('ink', 'g1', 0.5), { wobble: 0.9, branch: 0 }); // wire
  return pb;
}

export const FLOOR_GEN = {
  floor_lino: lino,
  floor_lino_hall: linoHall,
  floor_wood: wood,
  floor_tile: ceramic,
  floor_concrete: (c) => concrete(c),
  floor_carpet: carpet,
  floor_coal: coal,
  floor_gravel: gravel,
  floor_asphalt: asphalt,
  floor_grass: grass,
  floor_stone: stone,
  floor_marble: marble,
  floor_planks: planks,
  floor_grate: grate,
  floor_debris: debris,
};
export { concrete as concreteTexture, CONC };
