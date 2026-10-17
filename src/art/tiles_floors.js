// Floor textures (tiles agent). Each floor key is one 256×256 toroidal texture in WORLD space:
// drawTile samples the 16×16 window under the cell, so boards, cracks, stains and wear run across
// tile boundaries and the pattern only repeats every 16 tiles. `clean` = the 1979 floor: the same
// layout (same structural seed), no decay.
import { PB, rgb, mixc, dk, lt, bay, fbm, vnoise, shadeField, speck, crack, lump, R } from './tiles_px.js';

export const FS = 256; // texture period (px) — a multiple of 16 so cell windows never wrap

// ---------------------------------------------------------------------------------------------
// shared decay passes
function grime(pb, seed, { lo = 0.56, color = mixc('brown_dd', 'ink', 0.4), steps = 3, step = 0.14, cells = [[64, 64, 1], [24, 24, 0.6], [8, 8, 0.25]] } = {}) {
  shadeField(pb, fbm(pb.w, pb.h, cells, seed), { lo, hi: lo + 0.3, color, steps, step });
}
function wear(pb, seed, { lo = 0.58, color, steps = 2, step = 0.12, cells = [[96, 96, 1], [32, 32, 0.5]] } = {}) {
  shadeField(pb, fbm(pb.w, pb.h, cells, seed), { lo, hi: lo + 0.25, color, steps, step });
}
/** Black rubber heel marks: short, mostly horizontal strokes. */
function heelMarks(pb, r, n, { y0 = 0, h = pb.h, color = mixc('ink', 'g1', 0.4), t = 0.55 } = {}) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * pb.w), y = y0 + Math.floor(r() * h);
    const len = 2 + Math.floor(r() * 4), bend = r() < 0.5 ? 0 : (r() < 0.5 ? -1 : 1);
    for (let k = 0; k < len; k++) pb.tint(x + k, y + (k === len - 1 ? bend : 0), color, k === 0 || k === len - 1 ? t * 0.6 : t);
  }
}
/** Irregular tide-mark stain (dried puddle): darker rim, lightly darker inside. */
function tideStain(pb, r, cx, cy, rad, color, rim = 0.32, fill = 0.1) {
  const k = r() * 6.28, a = 0.2 + r() * 0.15;
  const R2 = Math.ceil(rad * 1.4);
  for (let dy = -R2; dy <= R2; dy++) for (let dx = -R2; dx <= R2; dx++) {
    const ang = Math.atan2(dy, dx);
    const rr = rad * (1 + a * Math.sin(2 * ang + k) + 0.1 * Math.sin(5 * ang + k * 2));
    const d = Math.sqrt(dx * dx + dy * dy * 1.3);
    if (d > rr) continue;
    if (d > rr - 1.2) pb.tint(cx + dx, cy + dy, color, rim);
    else if (bay(cx + dx, cy + dy) < 0.5) pb.tint(cx + dx, cy + dy, color, fill);
  }
}

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
    const up = r() < 0.5;
    const col = up ? lt(c, 0.07) : dk(c, 0.08);
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
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if (((i + j) % 3) === 0 && r() < 0.7) pb.tint(x0 + i, y0 + j, ridge, 0.6);
  // jagged edge remnants: a broken rim of tile on one or two sides
  const sides = [r() < 0.6, r() < 0.4, r() < 0.4, r() < 0.3];
  for (let k = 0; k < 8; k++) {
    if (sides[0] && r() < 0.75) { const d = 1 + (r() < 0.4 ? 1 : 0); for (let q = 0; q < d; q++) pb.blit(keep, k, q, 1, 1, x0 + k, y0 + q); }
    if (sides[1] && r() < 0.6) pb.blit(keep, k, 7, 1, 1, x0 + k, y0 + 7);
    if (sides[2] && r() < 0.6) pb.blit(keep, 0, k, 1, 1, x0, y0 + k);
    if (sides[3] && r() < 0.6) pb.blit(keep, 7, k, 1, 1, x0 + 7, y0 + k);
  }
  // the hole's inner top/left lip is in shadow (light from the top-left)
  for (let k = 0; k < 8; k++) {
    if (pb.get(x0 + k, y0)[0] === mastic[0]) pb.tint(x0 + k, y0, 'ink', 0.5);
    if (pb.get(x0, y0 + k)[0] === mastic[0]) pb.tint(x0, y0 + k, 'ink', 0.4);
  }
}
/** Curling square: lifted edge catches light, casts a 1-px shadow. */
function liftedSquare(pb, r, sx, sy) {
  const x0 = sx * 8, y0 = sy * 8;
  if (r() < 0.5) { // bottom edge lifts
    for (let k = 1; k < 7; k++) { pb.tint(x0 + k, y0 + 6, [255, 255, 255], 0.16); pb.tint(x0 + k, y0 + 7, [255, 255, 255], 0.1); pb.tint(x0 + k, y0 + 8, 'ink', 0.35); }
  } else { // right edge lifts
    for (let k = 1; k < 7; k++) { pb.tint(x0 + 6, y0 + k, [255, 255, 255], 0.14); pb.tint(x0 + 8, y0 + k, 'ink', 0.35); }
  }
}

function linoBase(seed, A, B, clean) {
  const r = R(seed);
  const pb = new PB(FS, FS);
  vctSquares(pb, r, A, B, clean ? 0.04 : 0.08);
  return pb;
}

function lino(clean) {
  const pb = linoBase('lino', LINO_A, LINO_B, clean);
  if (clean) { waxSheen(pb, R('lino_wax')); return pb; }
  const r = R('lino_decay');
  wear(pb, 11, { color: mixc('g5', 'cream_d', 0.5), lo: 0.55 });
  grime(pb, 12, { lo: 0.58 });
  dirtySeams(pb, r, 0.3);
  heelMarks(pb, r, 90);
  for (let i = 0; i < 4; i++) tideStain(pb, r, r() * FS, r() * FS, 5 + r() * 9, 'brown_dd');
  for (let i = 0; i < 7; i++) crack(pb, r, r() * FS, r() * FS, 10 + r() * 30, r() * 6.28, mixc('ink', 'brown_dd', 0.5), { light: lt(LINO_A, 0.25), branch: 0.06 });
  for (let i = 0; i < 6; i++) missingSquare(pb, r, Math.floor(r() * 32), Math.floor(r() * 32));
  for (let i = 0; i < 5; i++) liftedSquare(pb, r, Math.floor(r() * 32), Math.floor(r() * 32));
  dust(pb, r, 0.012);
  return pb;
}

/** Grime packed into some seams (bottom/right edges of squares). */
function dirtySeams(pb, r, p) {
  for (let sy = 0; sy < pb.h / 8; sy++) for (let sx = 0; sx < pb.w / 8; sx++) {
    if (r() < p) for (let k = 0; k < 8; k++) if (bay(sx * 8 + k, sy * 8 + 7) < 0.7) pb.tint(sx * 8 + k, sy * 8 + 7, 'ink', 0.22);
    if (r() < p) for (let k = 0; k < 8; k++) if (bay(sx * 8 + 7, sy * 8 + k) < 0.7) pb.tint(sx * 8 + 7, sy * 8 + k, 'ink', 0.2);
  }
}
function dust(pb, r, density) {
  speck(pb, r, 'g5', density, 0, 0, pb.w, pb.h, 0.25);
  speck(pb, r, 'ink', density * 0.8, 0, 0, pb.w, pb.h, 0.3);
}
function waxSheen(pb, r) {
  // fresh wax: a few soft highlight pixels, nothing structural
  speck(pb, r, [255, 255, 255], 0.006, 0, 0, pb.w, pb.h, 0.12);
}

// corridor lino: darker squares, a polish-worn runner centred on world row 15 (corridors are rows 13–17)
const HALL_A = lt(mixc('green_d', 'g2', 0.5), 0.13);
const HALL_B = lt(mixc('brown_d', 'g2', 0.55), 0.13);
const RUNNER_Y = 15 * 16 + 8;

function linoHall(clean) {
  const pb = linoBase('lino_hall', HALL_A, HALL_B, clean);
  const runner = (y, x, n) => {
    let d = Math.abs(((y - RUNNER_Y + FS * 1.5) % FS) - FS / 2);
    return clamp((26 + (n - 0.5) * 18 - d) / 14);
  };
  const nf = vnoise(FS, FS, 32, 32, 21);
  if (clean) {
    waxSheen(pb, R('hall_wax'));
    // even in 1979 the middle of the hall is a shade duller
    const f = new Float32Array(FS * FS);
    for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) f[y * FS + x] = runner(y, x, nf[y * FS + x]) * 0.5;
    shadeField(pb, f, { lo: 0.05, hi: 0.5, color: 'g4', steps: 1, step: 0.08 });
    return pb;
  }
  const r = R('hall_decay');
  const f = new Float32Array(FS * FS);
  for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) f[y * FS + x] = runner(y, x, nf[y * FS + x]);
  shadeField(pb, f, { lo: 0.08, hi: 0.95, color: mixc('g4', 'cream_d', 0.25), steps: 3, step: 0.1 });
  // long polish scuffs along the runner
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(r() * FS), y = RUNNER_Y - 20 + Math.floor(r() * 40), len = 5 + Math.floor(r() * 22);
    for (let k = 0; k < len; k++) if (r() < 0.85) pb.tint(x + k, y, mixc('g5', 'cream_d', 0.3), 0.18);
  }
  grime(pb, 22, { lo: 0.57, color: mixc('ink', 'brown_dd', 0.4) });
  dirtySeams(pb, r, 0.35);
  heelMarks(pb, r, 110, { y0: RUNNER_Y - 30, h: 60, t: 0.5 });
  heelMarks(pb, r, 60, { t: 0.45 });
  for (let i = 0; i < 3; i++) tideStain(pb, r, r() * FS, r() * FS, 6 + r() * 10, 'ink', 0.3, 0.08);
  for (let i = 0; i < 8; i++) crack(pb, r, r() * FS, r() * FS, 12 + r() * 34, r() * 6.28, 'ink', { light: lt(HALL_A, 0.18), branch: 0.07 });
  for (let i = 0; i < 6; i++) missingSquare(pb, r, Math.floor(r() * 32), Math.floor(r() * 32));
  for (let i = 0; i < 4; i++) liftedSquare(pb, r, Math.floor(r() * 32), Math.floor(r() * 32));
  dust(pb, r, 0.01);
  return pb;
}
const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------------------------------------------------------------------------------------------
// maple strip flooring: 4-px boards (3 + seam) running east–west, staggered butt joints
function wood(clean) {
  const r = R('wood');
  const pb = new PB(FS, FS);
  const seam = mixc('wood_d', 'brown_dd', 0.5);
  const lo = mixc('maple', 'wood', 0.42), hi = mixc('maple', 'wood_l', 0.15);
  const boards = [];
  for (let row = 0; row < FS / 4; row++) {
    const y = row * 4;
    let x = Math.floor(r() * FS), left = FS;
    while (left > 0) {
      let len = 22 + Math.floor(r() * 50);
      if (left - len < 14) len = left;
      const t = r();
      let c = mixc(lo, hi, t * t);
      if (r() < 0.12) c = dk(c, 0.1);
      pb.rect(x, y, len, 3, c);
      pb.hline(x, y + 3, len, seam);
      // a soft bevel: top px a touch lighter, bottom px a touch darker
      for (let k = 0; k < len; k++) { pb.tint(x + k, y, [255, 255, 255], 0.05); pb.tint(x + k, y + 2, 'ink', 0.06); }
      pb.vline(x, y, 3, dk(seam, 0.1)); // butt joint
      // grain
      const g = 1 + Math.floor(r() * 3);
      for (let q = 0; q < g; q++) {
        const gy = y + Math.floor(r() * 3), gx = x + 2 + Math.floor(r() * Math.max(1, len - 8)), gl = 3 + Math.floor(r() * 10);
        for (let k = 0; k < gl && gx + k < x + len; k++) pb.tint(gx + k, gy, mixc('wood', 'brown', 0.5), 0.22);
      }
      if (r() < 0.05) { const kx = x + 3 + Math.floor(r() * Math.max(1, len - 6)); pb.set(kx, y + 1, dk(c, 0.35)); pb.tint(kx + 1, y + 1, 'ink', 0.2); }
      boards.push({ x, y, len });
      x += len; left -= len;
    }
  }
  if (clean) { speck(pb, R('wood_varnish'), [255, 240, 210], 0.01, 0, 0, FS, FS, 0.14); return pb; }
  const d = R('wood_decay');
  wear(pb, 31, { color: mixc('g4', 'tan', 0.4), lo: 0.55, steps: 3, step: 0.13 });
  grime(pb, 32, { lo: 0.6, color: mixc('brown_dd', 'ink', 0.3) });
  // water damage: darkened, cupped boards in a blotch
  for (let w = 0; w < 2; w++) {
    const cx = d() * FS, cy = d() * FS, rad = 16 + d() * 14;
    for (const b of boards) {
      for (let k = 0; k < b.len; k++) {
        const X = b.x + k, dx = ((X - cx + FS * 1.5) % FS) - FS / 2, dy = ((b.y - cy + FS * 1.5) % FS) - FS / 2;
        const dd = Math.sqrt(dx * dx + dy * dy * 1.4) / rad;
        if (dd > 1) continue;
        const s = 0.25 * (1 - dd);
        for (let j = 0; j < 3; j++) pb.tint(X, b.y + j, mixc('brown_dd', 'ink', 0.3), s + (j === 2 ? 0.12 : 0));
        if (dd < 0.8) pb.tint(X, b.y, [255, 255, 255], 0.1); // cupped edge catches light
      }
    }
  }
  // gaps: some seams opened up
  for (let i = 0; i < 40; i++) {
    const b = boards[Math.floor(d() * boards.length)];
    const s = Math.floor(d() * b.len), l = Math.min(b.len - s, 6 + Math.floor(d() * 20));
    pb.hline(b.x + s, b.y + 3, l, 'ink');
  }
  // scratches & heel marks
  for (let i = 0; i < 50; i++) {
    const x = d() * FS, y = d() * FS, a = (d() - 0.5) * 0.8, l = 3 + d() * 8;
    for (let k = 0; k < l; k++) pb.tint(x + Math.cos(a) * k, y + Math.sin(a) * k, [255, 235, 200], 0.14);
  }
  heelMarks(pb, d, 40, { t: 0.4 });
  // a missing board segment: dark subfloor
  for (let i = 0; i < 3; i++) {
    const b = boards[Math.floor(d() * boards.length)];
    const l = Math.min(b.len, 8 + Math.floor(d() * 10));
    pb.rect(b.x, b.y, l, 3, mixc('ink', 'brown_dd', 0.4));
    pb.hline(b.x, b.y, l, dk(seam, 0.4));
    for (let k = 0; k < l; k += 3) pb.set(b.x + k, b.y + 1, mixc('brown_d', 'ink', 0.3));
  }
  dust(pb, d, 0.008);
  for (let i = 0; i < 3; i++) tideStain(pb, d, d() * FS, d() * FS, 6 + d() * 8, 'brown_dd', 0.28, 0.08);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// small square ceramic tile: 3-px tiles, 1-px grout, accent "flowers" on a 32-px lattice
function ceramic(clean) {
  const r = R('ceramic');
  const pb = new PB(FS, FS);
  const grout = mixc('g4', 'g3', 0.35);
  const tile = dk(mixc('paper_d', 'g6', 0.55), 0.14);
  const accent = mixc('slate_l', 'green_d', 0.35);
  pb.rect(0, 0, FS, FS, grout);
  for (let cy = 0; cy < FS / 4; cy++) for (let cx = 0; cx < FS / 4; cx++) {
    const ax = cx & 7, ay = cy & 7;
    const isAccent = (ax === 4 && ay === 4) || (ay === 4 && (ax === 3 || ax === 5)) || (ax === 4 && (ay === 3 || ay === 5)) ||
      (ax === 0 && ay === 0);
    const j = (r() - 0.5) * 0.06;
    const base = isAccent ? accent : tile;
    const c = j > 0 ? lt(base, j) : dk(base, -j);
    pb.rect(cx * 4, cy * 4, 3, 3, c);
    pb.set(cx * 4, cy * 4, lt(c, isAccent ? 0.1 : 0.08)); // glaze glint
    pb.tint(cx * 4 + 2, cy * 4 + 2, 'ink', 0.08);
  }
  if (clean) return pb;
  const d = R('ceramic_decay');
  // grout darkens first, then the tiles yellow
  const gf = fbm(FS, FS, [[48, 48, 1], [12, 12, 0.5]], 41);
  for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) {
    const isGrout = (x & 3) === 3 || (y & 3) === 3;
    const f = gf[y * FS + x];
    if (isGrout && f > 0.4) pb.tint(x, y, mixc('brown_dd', 'ink', 0.4), Math.min(0.55, (f - 0.4) * 1.6));
  }
  grime(pb, 42, { lo: 0.6, color: mixc('mustard_d', 'brown_d', 0.5), steps: 2, step: 0.15 });
  grime(pb, 43, { lo: 0.64, color: 'ink', steps: 2, step: 0.12 });
  for (let i = 0; i < 9; i++) crack(pb, d, d() * FS, d() * FS, 6 + d() * 16, d() * 6.28, mixc('ink', 'g2', 0.3), { branch: 0.04 });
  // missing tiles, in little clusters
  for (let i = 0; i < 10; i++) {
    let cx = Math.floor(d() * 64), cy = Math.floor(d() * 64);
    const n = 1 + Math.floor(d() * 4);
    for (let k = 0; k < n; k++) {
      const bed = mixc('g2', 'g3', d());
      pb.rect(cx * 4, cy * 4, 3, 3, bed);
      pb.tint(cx * 4, cy * 4, 'ink', 0.4); pb.tint(cx * 4 + 1, cy * 4, 'ink', 0.3); pb.tint(cx * 4, cy * 4 + 1, 'ink', 0.3);
      if (d() < 0.5) cx++; else cy++;
    }
  }
  // rust bloom around a drain / pipe drip
  for (let i = 0; i < 2; i++) tideStain(pb, d, d() * FS, d() * FS, 4 + d() * 5, 'rust', 0.35, 0.18);
  for (let i = 0; i < 3; i++) tideStain(pb, d, d() * FS, d() * FS, 7 + d() * 7, 'mustard_d', 0.22, 0.1);
  dust(pb, d, 0.006);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// poured concrete: aggregate, saw-cut joints every 8 tiles, stains, damp, cracks
const CONC = mixc(mixc('g4', 'cream_d', 0.22), 'g3', 0.3);
function concrete(clean, seed = 'concrete') {
  const r = R(seed);
  const pb = new PB(FS, FS, CONC);
  const tone = fbm(FS, FS, [[32, 32, 1], [8, 8, 0.6], [3, 3, 0.4]], 51);
  shadeField(pb, tone, { lo: 0.55, hi: 0.85, color: lt(CONC, 0.2), steps: 1, step: 0.35 });
  shadeField(pb, tone.map((v) => 1 - v), { lo: 0.55, hi: 0.85, color: dk(CONC, 0.25), steps: 1, step: 0.35 });
  speck(pb, r, dk(CONC, 0.28), 0.035);
  speck(pb, r, lt(CONC, 0.18), 0.02);
  // saw-cut control joints
  for (const j of [0, 128]) {
    for (let k = 0; k < FS; k++) {
      pb.set(j, k, dk(CONC, 0.35)); pb.tint(j + 1, k, [255, 255, 255], 0.08);
      pb.set(k, j, dk(CONC, 0.35)); pb.tint(k, j + 1, [255, 255, 255], 0.08);
    }
  }
  if (clean) return pb;
  const d = R(seed + '_decay');
  grime(pb, 52, { lo: 0.52, color: mixc('g1', 'brown_dd', 0.4), steps: 3, step: 0.13, cells: [[96, 96, 1], [32, 32, 0.6], [8, 8, 0.2]] });
  // damp: cold dark patches
  shadeField(pb, fbm(FS, FS, [[64, 64, 1], [16, 16, 0.5]], 53), { lo: 0.6, hi: 0.85, color: mixc('blue_dd', 'g1', 0.5), steps: 2, step: 0.16 });
  for (let i = 0; i < 4; i++) { // oil stains
    const cx = d() * FS, cy = d() * FS, rad = 3 + d() * 6;
    tideStain(pb, d, cx, cy, rad, 'ink', 0.4, 0.35);
  }
  for (let i = 0; i < 3; i++) tideStain(pb, d, d() * FS, d() * FS, 3 + d() * 4, 'rust', 0.3, 0.15);
  for (let i = 0; i < 9; i++) crack(pb, d, d() * FS, d() * FS, 18 + d() * 50, d() * 6.28, mixc('ink', 'g1', 0.4), { light: lt(CONC, 0.2), branch: 0.08 });
  // efflorescence bloom
  shadeField(pb, fbm(FS, FS, [[40, 40, 1], [6, 6, 0.6]], 54), { lo: 0.72, hi: 0.9, color: 'g6', steps: 2, step: 0.18 });
  speck(pb, d, 'g1', 0.004);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// thin institutional carpet: rust/brown twill with tweed flecks
function carpet(clean) {
  const r = R('carpet');
  const base = mixc(mixc('rust', 'brown', 0.55), 'g3', 0.32);
  const pb = new PB(FS, FS, base);
  for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) {
    if (((x - y) & 3) < 2) pb.tint(x, y, 'ink', 0.09);
    else if (((x + y) & 7) === 0) pb.tint(x, y, [255, 255, 255], 0.04);
  }
  speck(pb, r, mixc('mustard_d', 'tan', 0.3), 0.025, 0, 0, FS, FS, 0.55);
  speck(pb, r, 'brown_dd', 0.035, 0, 0, FS, FS, 0.5);
  speck(pb, r, mixc('rust', 'red_d', 0.4), 0.02, 0, 0, FS, FS, 0.5);
  if (clean) return pb;
  const d = R('carpet_decay');
  wear(pb, 61, { color: mixc('g4', 'tan', 0.5), lo: 0.52, steps: 3, step: 0.11 });
  grime(pb, 62, { lo: 0.58, color: mixc('brown_dd', 'ink', 0.5), steps: 3, step: 0.14 });
  // mildew in the damp corners of the texture
  shadeField(pb, fbm(FS, FS, [[48, 48, 1], [12, 12, 0.4]], 63), { lo: 0.7, hi: 0.88, color: mixc('green_dd', 'g1', 0.4), steps: 2, step: 0.18 });
  for (let i = 0; i < 6; i++) tideStain(pb, d, d() * FS, d() * FS, 4 + d() * 9, 'brown_dd', 0.38, 0.18);
  for (let i = 0; i < 3; i++) { // cigarette burns
    const x = d() * FS, y = d() * FS;
    pb.set(x, y, 'ink'); pb.tint(x + 1, y, 'ink', 0.5); pb.tint(x, y + 1, 'brown_dd', 0.6);
  }
  dust(pb, d, 0.006);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// anthracite: glinting lumps over black
function coal(clean) {
  const r = R('coal');
  const pb = new PB(FS, FS, 'ink');
  speck(pb, r, 'night', 0.3);
  const ramp = ['ink', mixc('night', 'shadow', 0.5), mixc('shadow', 'g1', 0.4), mixc('g1', 'blue_d', 0.35), mixc('g2', 'blue_l', 0.3)];
  const n = 2600;
  for (let i = 0; i < n; i++) {
    const s = r();
    const rad = s < 0.65 ? 1 + r() * 1.3 : s < 0.93 ? 2 + r() * 1.6 : 3.2 + r() * 2;
    lump(pb, r, Math.floor(r() * FS), Math.floor(r() * FS), rad * (0.8 + r() * 0.5), rad * (0.7 + r() * 0.4), ramp);
  }
  // glints: on the brightest pixels, a few go white-blue
  const hi = rgb(ramp[4]);
  for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) {
    const c = pb.get(x, y);
    if (c[0] === hi[0] && c[2] === hi[2] && r() < (clean ? 0.05 : 0.07)) pb.set(x, y, r() < 0.3 ? 'white' : 'moon_l');
  }
  if (!clean) speck(pb, R('coal_dust'), 'g1', 0.01);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// dirt + slate chips (mine floor, lawn edges)
function gravel(clean) {
  const r = R('gravel');
  const pb = new PB(FS, FS, mixc('brown_d', 'g2', 0.45));
  const tone = fbm(FS, FS, [[48, 48, 1], [10, 10, 0.6]], 71);
  shadeField(pb, tone, { lo: 0.5, hi: 0.8, color: mixc('brown', 'g3', 0.45), steps: 2, step: 0.3 });
  shadeField(pb, tone.map((v) => 1 - v), { lo: 0.55, hi: 0.85, color: mixc('brown_dd', 'g1', 0.4), steps: 2, step: 0.3 });
  speck(pb, r, mixc('brown_dd', 'ink', 0.3), 0.06);
  const slate = ['ink', 'g1', 'g2', mixc('g3', 'blue_l', 0.15), 'g4'];
  const tan = [mixc('brown_dd', 'ink', 0.3), 'brown_d', mixc('brown', 'g3', 0.4), mixc('tan', 'g4', 0.4), mixc('tan_l', 'g5', 0.4)];
  const coalR = ['ink', 'ink', 'night', 'shadow', mixc('g2', 'blue_l', 0.2)];
  for (let i = 0; i < 1400; i++) {
    const s = r(), ramp = s < 0.55 ? slate : s < 0.85 ? tan : coalR;
    const rad = 0.7 + r() * (r() < 0.85 ? 1.2 : 2.4);
    lump(pb, r, Math.floor(r() * FS), Math.floor(r() * FS), rad * (0.9 + r() * 0.5), rad * (0.6 + r() * 0.4), ramp);
  }
  if (clean) return pb;
  const d = R('gravel_decay');
  shadeField(pb, fbm(FS, FS, [[64, 64, 1], [16, 16, 0.5]], 72), { lo: 0.66, hi: 0.86, color: mixc('blue_dd', 'ink', 0.4), steps: 2, step: 0.18 });
  speck(pb, d, 'ink', 0.01);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// wet asphalt lot: aggregate, wet sheen, puddles, crack networks, faded stall lines
const ASPH = mixc('g1', 'g2', 0.55);
function asphalt(clean) {
  const r = R('asphalt');
  const pb = new PB(FS, FS, clean ? dk(ASPH, 0.18) : ASPH);
  speck(pb, r, lt(ASPH, 0.16), 0.08);
  speck(pb, r, dk(ASPH, 0.3), 0.06);
  speck(pb, r, 'g4', 0.006);
  // parking stalls: a band of stall lines (world rows 8–10 and 24–26 of every 16)
  const paint = clean ? mixc('cream_l', 'g6', 0.3) : mixc('cream', 'g3', 0.42);
  const pf = vnoise(FS, FS, 6, 6, 81);
  for (let s = 0; s < FS / 48 + 1; s++) {
    const x = 8 + s * 48;
    if (x + 2 > FS) break;
    for (let y = 132; y < 132 + 40; y++) for (let k = 0; k < 2; k++) {
      if (!clean && pf[y * FS + ((x + k) % FS)] < 0.42) continue;
      pb.set(x + k, y, paint);
    }
  }
  if (clean) { speck(pb, R('asph_c'), dk(ASPH, 0.35), 0.03); return pb; }
  const d = R('asphalt_decay');
  // rain-soaked: wet dark patches with cold sky reflections
  const wet = fbm(FS, FS, [[64, 64, 1], [16, 16, 0.6], [6, 6, 0.3]], 82);
  shadeField(pb, wet, { lo: 0.45, hi: 0.8, color: mixc('blue_dd', 'ink', 0.35), steps: 3, step: 0.17 });
  for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) {
    if (wet[y * FS + x] > 0.62 && d() < 0.035) pb.tint(x, y, 'moon', 0.3);
  }
  // puddles
  for (let i = 0; i < 6; i++) {
    const cx = Math.floor(d() * FS), cy = Math.floor(d() * FS), rx = 5 + d() * 10, ry = 3 + d() * 5;
    const k = d() * 6.28;
    for (let dy = -Math.ceil(ry) - 1; dy <= ry + 1; dy++) for (let dx = -Math.ceil(rx) - 1; dx <= rx + 1; dx++) {
      const a = Math.atan2(dy, dx), rr = 1 + 0.22 * Math.sin(3 * a + k);
      const q = Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2) / rr;
      if (q > 1) continue;
      pb.set(cx + dx, cy + dy, q > 0.85 ? mixc('ink', 'blue_dd', 0.4) : mixc('blue_dd', 'night', 0.35));
    }
    // reflected sky: a broken streak near the top-left
    const sl = Math.floor(rx * 0.9);
    for (let s = 0; s < sl; s++) if (d() < 0.75) pb.set(cx - Math.floor(rx * 0.5) + s, cy - Math.floor(ry * 0.35), mixc('blue_l', 'blue_d', 0.45));
    pb.set(cx + Math.floor(rx * 0.3), cy + 1, mixc('moon', 'blue_d', 0.5));
  }
  // crack network: long cracks plus alligator cells
  for (let i = 0; i < 10; i++) crack(pb, d, d() * FS, d() * FS, 25 + d() * 60, d() * 6.28, 'ink', { light: null, branch: 0.1, wobble: 0.45 });
  for (let i = 0; i < 4; i++) {
    const cx = d() * FS, cy = d() * FS;
    for (let k = 0; k < 7; k++) crack(pb, d, cx + (d() - 0.5) * 20, cy + (d() - 0.5) * 14, 5 + d() * 8, d() * 6.28, 'ink', { branch: 0.15, wobble: 0.9 });
  }
  // dead weeds in cracks
  for (let i = 0; i < 60; i++) {
    const x = d() * FS, y = d() * FS;
    if (pb.get(Math.floor(x), Math.floor(y))[0] > 20) continue;
    pb.set(x, y - 1, mixc('mustard_d', 'brown', 0.4)); if (d() < 0.6) pb.set(x + 1, y - 2, mixc('tan', 'mustard_d', 0.5));
  }
  dust(pb, d, 0.004);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// dead October grass, oak leaves
function grass(clean) {
  const r = R('grass');
  const g0 = clean ? mixc('green_d', 'mustard_d', 0.45) : mixc('mustard_d', 'brown_d', 0.45);
  const pb = new PB(FS, FS, g0);
  const tone = fbm(FS, FS, [[48, 48, 1], [12, 12, 0.6]], 91);
  shadeField(pb, tone, { lo: 0.5, hi: 0.85, color: clean ? mixc('green', 'mustard', 0.4) : mixc('tan', 'mustard_d', 0.5), steps: 2, step: 0.25 });
  shadeField(pb, tone.map((v) => 1 - v), { lo: 0.58, hi: 0.85, color: clean ? 'green_dd' : mixc('brown_dd', 'green_dd', 0.4), steps: 2, step: 0.3 });
  // blades: 1×2–3 strokes, lit tips
  const bladeL = clean ? mixc('green_l', 'mustard', 0.4) : mixc('tan_l', 'cream_d', 0.4);
  const bladeD = clean ? 'green_dd' : mixc('brown_dd', 'brown_d', 0.5);
  for (let i = 0; i < FS * FS * 0.09; i++) {
    const x = Math.floor(r() * FS), y = Math.floor(r() * FS), h = 2 + Math.floor(r() * 2);
    const light = r() < 0.5;
    for (let k = 0; k < h; k++) pb.tint(x + (k === h - 1 && r() < 0.3 ? 1 : 0), y - k, light ? bladeL : bladeD, light ? 0.35 + k * 0.12 : 0.45);
  }
  // bare mud
  if (!clean) shadeField(pb, fbm(FS, FS, [[64, 64, 1], [12, 12, 0.6]], 92), { lo: 0.68, hi: 0.86, color: mixc('brown_dd', 'g1', 0.3), steps: 2, step: 0.3 });
  // oak leaves
  const leafCols = [['rust', 'brown_d'], ['mustard', 'mustard_d'], ['brown', 'brown_dd'], [mixc('red_d', 'rust', 0.5), 'brown_dd'], ['tan', 'brown']];
  const nl = clean ? 120 : 420;
  for (let i = 0; i < nl; i++) {
    const [c, s] = leafCols[Math.floor(r() * leafCols.length)];
    const x = Math.floor(r() * FS), y = Math.floor(r() * FS), sh = r();
    if (sh < 0.4) { pb.set(x, y, c); pb.set(x + 1, y, c); pb.set(x + 1, y + 1, s); }
    else if (sh < 0.75) { pb.set(x, y, c); pb.set(x + 1, y, c); pb.set(x, y + 1, c); pb.set(x + 2, y + 1, c); pb.set(x + 1, y + 1, s); pb.tint(x + 1, y + 2, 'ink', 0.35); }
    else { pb.set(x, y, c); pb.set(x, y + 1, s); }
  }
  if (!clean) speck(pb, R('grass_d'), 'ink', 0.006, 0, 0, FS, FS, 0.4);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// worn granite flags (steps / plaza)
function stone(clean) {
  const r = R('stone');
  const base = mixc('g4', 'g5', 0.25);
  const pb = new PB(FS, FS, base);
  const joint = mixc('g2', 'ink', 0.25);
  for (let row = 0; row < FS / 16; row++) {
    const y = row * 16;
    let x = Math.floor(r() * 32), left = FS;
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
  // granite grain
  for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) {
    const v = r();
    if (v < 0.11) pb.tint(x, y, 'g2', 0.4);
    else if (v < 0.15) pb.tint(x, y, 'g6', 0.35);
    else if (v < 0.165) pb.tint(x, y, 'tan_l', 0.3);
  }
  if (clean) return pb;
  const d = R('stone_decay');
  wear(pb, 101, { color: 'g5', lo: 0.55, steps: 2, step: 0.14 });
  shadeField(pb, fbm(FS, FS, [[64, 64, 1], [16, 16, 0.5]], 102), { lo: 0.5, hi: 0.8, color: mixc('blue_dd', 'g1', 0.5), steps: 3, step: 0.14 });
  grime(pb, 103, { lo: 0.6, color: mixc('g1', 'brown_dd', 0.3) });
  // moss in the joints
  const mf = vnoise(FS, FS, 24, 24, 104);
  for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) {
    const c = pb.get(x, y);
    if (c[0] === rgb(joint)[0] && c[1] === rgb(joint)[1] && mf[y * FS + x] > 0.5) {
      pb.set(x, y, mixc('green_dd', 'green_d', d()));
      if (d() < 0.4) pb.tint(x + (d() < 0.5 ? 1 : 0), y + (d() < 0.5 ? 1 : -1), 'green_d', 0.4);
    }
  }
  for (let i = 0; i < 18; i++) { // lichen spots
    const cx = d() * FS, cy = d() * FS, rr = 1 + d() * 1.8;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= rr * rr) pb.tint(cx + dx, cy + dy, mixc('mint', 'g5', 0.5), 0.35);
  }
  for (let i = 0; i < 6; i++) crack(pb, d, d() * FS, d() * FS, 6 + d() * 18, d() * 6.28, mixc('g1', 'ink', 0.4), { light: 'g5', branch: 0.05 });
  return pb;
}

// ---------------------------------------------------------------------------------------------
// black-and-white marble, one square per tile, veined, cold
function marble(clean) {
  const r = R('marble');
  const W = dk(mixc('g6', 'moon_l', 0.22), 0.1);
  const K = lt(mixc('ink', 'navy_dd', 0.5), 0.07);
  const pb = new PB(FS, FS);
  for (let ty = 0; ty < FS / 16; ty++) for (let tx = 0; tx < FS / 16; tx++) pb.rect(tx * 16, ty * 16, 16, 16, (tx + ty) & 1 ? K : W);
  // cloudy body
  const cloud = fbm(FS, FS, [[24, 24, 1], [8, 8, 0.5]], 111);
  for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) {
    const white = (((x >> 4) + (y >> 4)) & 1) === 0, f = cloud[y * FS + x];
    if (white && f > 0.55 && bay(x, y) < (f - 0.55) * 3) pb.tint(x, y, mixc('g5', 'moon', 0.3), 0.25);
    if (!white && f > 0.6 && bay(x, y) < (f - 0.6) * 2) pb.tint(x, y, 'g2', 0.4);
  }
  // veins: a mask of wandering lines, coloured per square
  const veins = new PB(FS, FS);
  for (let i = 0; i < 26; i++) crack(veins, r, r() * FS, r() * FS, 30 + r() * 70, -0.6 + (r() - 0.5) * 1.2, [255, 255, 255], { branch: 0.06, wobble: 0.35 });
  for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) {
    if (!veins.alpha(x, y)) continue;
    const white = (((x >> 4) + (y >> 4)) & 1) === 0;
    pb.set(x, y, white ? mixc('g4', 'moon', 0.25) : mixc('g3', 'g4', 0.4));
    if (white && bay(x, y) < 0.4) pb.tint(x + 1, y, 'g5', 0.4);
  }
  // joints and polish
  for (let ty = 0; ty < FS / 16; ty++) for (let tx = 0; tx < FS / 16; tx++) {
    const white = ((tx + ty) & 1) === 0;
    pb.hline(tx * 16, ty * 16, 16, white ? dk(W, 0.22) : lt(K, 0.06));
    pb.vline(tx * 16, ty * 16, 16, white ? dk(W, 0.18) : lt(K, 0.05));
    // a cold diagonal reflection
    const ox = tx * 16 + 4 + Math.floor(r() * 6), oy = ty * 16 + 3 + Math.floor(r() * 4);
    for (let k = 0; k < 4; k++) if (r() < 0.8) pb.tint(ox + k, oy + k, white ? 'white' : 'blue_l', white ? 0.35 : 0.25);
  }
  if (clean) return pb;
  const d = R('marble_decay');
  grime(pb, 112, { lo: 0.58, color: mixc('g1', 'brown_dd', 0.25), steps: 3, step: 0.12 });
  wear(pb, 113, { color: mixc('g4', 'g3', 0.5), lo: 0.62, steps: 2, step: 0.12 });
  for (let i = 0; i < 6; i++) crack(pb, d, d() * FS, d() * FS, 8 + d() * 20, d() * 6.28, 'ink', { light: 'g5', branch: 0.05 });
  for (let i = 0; i < 6; i++) { // chipped corners
    const tx = Math.floor(d() * 16), ty = Math.floor(d() * 16);
    pb.set(tx * 16 + 1, ty * 16 + 1, 'g2'); pb.set(tx * 16 + 2, ty * 16 + 1, 'g3'); pb.set(tx * 16 + 1, ty * 16 + 2, 'g3');
  }
  dust(pb, d, 0.01);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// breaker planks: rough tarred boards, 8-px rows with gaps onto the void (a hint of fire below)
function planks(clean) {
  const r = R('planks');
  const pb = new PB(FS, FS, 'ink');
  const lo = mixc('brown_dd', 'g1', 0.45), hi = mixc('wood_d', 'g2', 0.35);
  for (let row = 0; row < FS / 8; row++) {
    const y = row * 8;
    let x = Math.floor(r() * FS), left = FS;
    while (left > 0) {
      let len = 28 + Math.floor(r() * 44);
      if (left - len < 16) len = left;
      const bh = r() < 0.75 ? 6 : 7;
      const c = mixc(lo, hi, r() * 0.8);
      pb.rect(x + 1, y, len - 1, bh, c);
      for (let k = 1; k < len; k++) { pb.tint(x + k, y, [255, 255, 255], 0.1); pb.tint(x + k, y + bh - 1, 'ink', 0.3); }
      pb.vline(x + len - 1, y, bh, dk(c, 0.35));
      // grain & splinters
      for (let q = 0; q < 3; q++) {
        const gy = y + 1 + Math.floor(r() * (bh - 2)), gx = x + 2 + Math.floor(r() * (len - 6)), gl = 4 + Math.floor(r() * 14);
        for (let k = 0; k < gl && gx + k < x + len - 1; k++) pb.tint(gx + k, gy, r() < 0.5 ? 'ink' : [255, 230, 200], 0.18);
      }
      // nails at the board ends
      for (const nx of [x + 2, x + len - 3]) { pb.set(nx, y + 1, mixc('rust', 'g2', 0.4)); pb.set(nx, y + bh - 2, mixc('rust', 'g2', 0.5)); }
      x += len; left -= len;
    }
  }
  // fire far below shows faintly in a few gaps
  const glow = fbm(FS, FS, [[48, 48, 1], [12, 12, 0.5]], 121);
  for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) {
    const c = pb.get(x, y);
    if (c[0] < 14 && c[1] < 14 && glow[y * FS + x] > 0.58 && bay(x, y) < (glow[y * FS + x] - 0.58) * 3.5) pb.set(x, y, 'fire_dd');
  }
  const d = R('planks_decay');
  speck(pb, d, mixc('g1', 'ink', 0.3), clean ? 0.02 : 0.05, 0, 0, FS, FS, 0.5); // coal dust
  if (!clean) {
    grime(pb, 122, { lo: 0.58, color: 'ink', steps: 2, step: 0.18 });
    // a few broken-out board ends
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(d() * FS), y = Math.floor(d() * (FS / 8)) * 8, l = 3 + Math.floor(d() * 6);
      for (let k = 0; k < l; k++) for (let j = 0; j < 6; j++) if (j < 6 - Math.abs(k - l / 2)) pb.set(x + k, y + j, 'ink');
    }
  }
  return pb;
}

// ---------------------------------------------------------------------------------------------
// iron grating with bolted steel plates
function grate(clean) {
  const r = R('grate');
  const pb = new PB(FS, FS, 'ink');
  const bar = mixc('g3', 'g2', 0.3), barL = mixc('g4', 'g3', 0.2), barD = mixc('g2', 'ink', 0.3);
  for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) {
    const hx = (x & 3) === 0, hy = (y & 3) === 0;
    if (hx || hy) pb.set(x, y, bar);
    else if ((y & 3) === 1 && !hx) pb.set(x, y, mixc('ink', 'night', 0.6));
    else pb.set(x, y, mixc('night', 'shadow', (y & 3) / 6));
  }
  // heavy frame bars every 16 px (2 px), lit top-left
  for (let k = 0; k < FS; k++) for (const j of [0, 1]) {
    for (let g = 0; g < FS; g += 16) { pb.set(g + j, k, j ? barD : barL); pb.set(k, g + j, j ? barD : barL); }
  }
  // bolted plates
  const plates = [[2, 1], [9, 6], [5, 12], [13, 3], [12, 13]];
  const pl = mixc('g3', 'g2', 0.5);
  for (const [tx, ty] of plates) {
    const x0 = tx * 16, y0 = ty * 16;
    pb.rect(x0, y0, 32, 16, pl);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 32; i++) if (((i + (j >> 1) * 2) % 4 === 0) && (j % 4 === 1)) { pb.set(x0 + i, y0 + j, lt(pl, 0.18)); pb.set(x0 + i + 1, y0 + j + 1, dk(pl, 0.2)); }
    pb.hline(x0, y0, 32, lt(pl, 0.15)); pb.vline(x0, y0, 16, lt(pl, 0.1));
    pb.hline(x0, y0 + 15, 32, 'ink'); pb.vline(x0 + 31, y0, 16, 'ink');
    for (const [bx, by] of [[2, 2], [29, 2], [2, 13], [29, 13]]) { pb.set(x0 + bx, y0 + by, lt(pl, 0.3)); pb.set(x0 + bx + 1, y0 + by + 1, 'ink'); }
  }
  // highlight pass: bars' top-left edges
  for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) if ((x & 3) === 0 && (y & 3) === 0) pb.set(x, y, barL);
  const rf = fbm(FS, FS, [[32, 32, 1], [8, 8, 0.6]], 131);
  const d = R('grate_decay');
  for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) {
    const c = pb.get(x, y);
    if (c[0] < 30) continue;
    const f = rf[y * FS + x];
    const th = clean ? 0.72 : 0.5;
    if (f > th && bay(x, y) < (f - th) * 3) pb.tint(x, y, d() < 0.5 ? 'rust' : 'brown', clean ? 0.3 : 0.55);
  }
  if (!clean) {
    for (let i = 0; i < 5; i++) { // a broken bar or two
      const x = Math.floor(d() * 64) * 4, y = Math.floor(d() * FS);
      pb.set(x, y, 'ink'); pb.set(x, y + 1, 'ink'); pb.set(x, y - 1, 'rust');
    }
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
  shadeField(pb, fbm(FS, FS, [[32, 32, 1], [8, 8, 0.6]], 141), { lo: 0.38, hi: 0.8, color: mixc('g5', 'cream_d', 0.4), steps: 3, step: 0.13 });
  speck(pb, d, 'g5', 0.04, 0, 0, FS, FS, 0.4);
  // ceiling tiles: perforated slabs, broken corners, shadowed bottom-right
  const ct = mixc('cream_l', 'g5', 0.35);
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(d() * FS), y = Math.floor(d() * FS), w = 5 + Math.floor(d() * 8), h = 4 + Math.floor(d() * 6);
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
  for (let i = 0; i < 220; i++) lump(pb, d, Math.floor(d() * FS), Math.floor(d() * FS), 0.8 + d() * 2.4, 0.7 + d() * 1.8, plaster);
  // lath strips
  for (let i = 0; i < 26; i++) {
    const x = d() * FS, y = d() * FS, a = (d() - 0.5) * 1.6, l = 6 + d() * 10;
    for (let k = 0; k < l; k++) { pb.set(x + Math.cos(a) * k, y + Math.sin(a) * k, mixc('wood_l', 'tan', 0.4)); pb.tint(x + Math.cos(a) * k, y + Math.sin(a) * k + 1, 'ink', 0.4); }
  }
  // glass
  for (let i = 0; i < 140; i++) {
    const x = Math.floor(d() * FS), y = Math.floor(d() * FS);
    pb.set(x, y, d() < 0.4 ? 'moon_l' : mixc('moon', 'g4', 0.4));
    if (d() < 0.5) pb.set(x + 1, y, mixc('blue_d', 'g2', 0.5));
  }
  // dangling wire
  for (let i = 0; i < 5; i++) crack(pb, d, d() * FS, d() * FS, 10 + d() * 14, d() * 6.28, 'ink', { wobble: 0.9, branch: 0 });
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
