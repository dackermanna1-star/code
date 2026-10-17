// Wall textures (tiles agent). Faces look south. Each material is one 512×32 horizontal strip in
// world space — rows 0–15 = face_high, 16–31 = face_low — so the upper and lower faces of a wall
// are one continuous surface (a stain can run from the ceiling past the chair rail) and adjacent
// cells tile seamlessly (period 32 tiles: wider than the screen). Decay clusters along the wall by
// a 1-D damage profile — long stretches nearly sound, a few badly gone. Tops are a 64×64 toroidal
// texture (very dark) plus per-mask lips. Under every face_low a 4-px translucent "spill" strip
// (contact shadow; debris for rubble) is drawn onto the floor.
import { PB, rgb, mixc, dk, lt, bay, fbm, shadeField, speck, crack, lump, R } from './tiles_px.js';

export const FW = 512;   // face strip period
export const TS = 64;    // top texture period

// ---------------------------------------------------------------------------------------------
// material palettes: lip = front edge of the wall top (and of tops on open edges)
export const MAT = {
  wall_plaster:  { top: mixc('night', 'green_dd', 0.35), lip: mixc('g2', 'cream_d', 0.28) },
  wall_brick:    { top: mixc('night', 'brick_d', 0.35), lip: mixc('g2', 'brick_l', 0.3) },
  wall_tile:     { top: mixc('night', 'slate', 0.4), lip: mixc('g2', 'mint', 0.25) },
  wall_panel:    { top: mixc('night', 'brown_dd', 0.55), lip: mixc('wood_d', 'g2', 0.3) },
  wall_concrete: { top: mixc('night', 'g1', 0.5), lip: mixc('g2', 'g3', 0.5) },
  wall_rock:     { top: mixc('ink', 'g1', 0.45), lip: mixc('g1', 'g2', 0.6) },
  wall_marble:   { top: mixc('night', 'navy_dd', 0.5), lip: mixc('g3', 'moon', 0.25) },
  wall_timber:   { top: mixc('ink', 'brown_dd', 0.5), lip: mixc('brown_dd', 'g2', 0.5) },
  wall_gym:      { top: mixc('night', 'green_dd', 0.3), lip: mixc('g2', 'cream_d', 0.3) },
  wall_rubble:   { top: mixc('ink', 'g1', 0.5), lip: mixc('g2', 'g3', 0.3) },
};

// ---------------------------------------------------------------------------------------------
// shared face elements
/** 1-D damage profile along the strip (period FW); at(x) in 0..1. */
function damage1D(seed) {
  const f = fbm(FW, 1, [[160, 1, 1], [56, 1, 0.55], [20, 1, 0.25]], seed);
  return (x) => f[((Math.round(x) % FW) + FW) % FW];
}
/** Random x preferring damaged stretches. */
function pickX(r, dmg, power = 2) {
  for (let k = 0; k < 30; k++) {
    const x = Math.floor(r() * FW);
    if (r() < Math.pow(Math.max(0, (dmg(x) - 0.28) / 0.55), power)) return x;
  }
  return Math.floor(r() * FW);
}
/** Lip at y=0 (the top's front edge catching light) and a dithered ceiling shadow below it. */
function ceiling(pb, lip, depth = 5, strength = 0.55) {
  // stepped, not fuzzy: two solid shade rows, then a short ordered-dither fade
  for (let x = 0; x < pb.w; x++) {
    pb.set(x, 0, lip);
    pb.tint(x, 1, 'ink', strength + 0.15);
    pb.tint(x, 2, 'ink', strength * 0.6);
    for (let y = 3; y <= depth; y++) {
      const t = (depth - y + 1) / (depth - 1);
      pb.tint(x, y, 'ink', strength * 0.18 * t);
      if (bay(x, y) < t * 0.5) pb.tint(x, y, 'ink', strength * 0.35);
    }
  }
}
/** Painted-over cinderblock joints (8×4 running bond), low contrast. */
function blockJoints(pb, y0, y1, t = 0.1, ratio = 0.8) {
  for (let y = y0; y <= y1; y++) {
    const course = y >> 2;
    for (let x = 0; x < pb.w; x++) {
      if ((y & 3) === 3) { if (bay(x, y) < ratio) pb.tint(x, y, 'ink', t); }
      else if ((x & 7) === ((course & 1) ? 4 : 0)) { if (bay(x, y) < ratio) pb.tint(x, y, 'ink', t * 0.85); }
      else if ((y & 3) === 0) pb.tint(x, y, [255, 255, 255], t * 0.25);
    }
  }
}
/** Water stains running down from the ceiling: tea-coloured body, darker tide-line rim. */
function waterStains(pb, r, n, { yMax = 26, color = mixc('mustard_d', 'brown', 0.45), body = 0.18, rim = 0.28, dmg = null } = {}) {
  for (let i = 0; i < n; i++) {
    const cx = dmg ? pickX(r, dmg, 2) : Math.floor(r() * pb.w), sev = dmg ? dmg(cx) : 0.5;
    const w = 3 + r() * 6 + sev * 10, len = Math.min(yMax, 5 + r() * (yMax - 6) * (0.4 + sev));
    const k = r() * 6.28, kk = r() * 6.28;
    for (let y = 1; y < Math.min(pb.h, len + 3); y++) {
      const prog = y / len;
      const half = w * (0.55 + 0.45 * Math.sin(prog * 2.6 + k)) * (prog > 0.75 ? Math.max(0, (1 - prog) * 4) : 1)
        + Math.sin(y * 0.9 + kk) * 0.8;
      if (half <= 0.3) continue;
      for (let dx = -Math.ceil(half); dx <= Math.ceil(half); dx++) {
        const e = Math.abs(dx) / half;
        if (e > 1) continue;
        if (e > 0.82) pb.tint(cx + dx, y, color, rim);
        else if (bay(cx + dx, y) < 0.75) pb.tint(cx + dx, y, color, body);
      }
    }
    // the lowest tide line
    const ty = Math.floor(len);
    for (let dx = -Math.floor(w * 0.4); dx <= Math.floor(w * 0.4); dx++) if (r() < 0.7) pb.tint(cx + dx, ty + (r() < 0.3 ? 1 : 0), color, rim);
  }
}
/** Peeling paint: patch of the coat missing (showing `under`), curled light flakes on the lower lip. */
function peel(pb, r, cx, cy, rw, rh, under, curl, y0 = 0, y1 = 31) {
  const k = r() * 6.28;
  const cells = [];
  for (let dy = -rh; dy <= rh; dy++) for (let dx = -rw; dx <= rw; dx++) {
    const y = cy + dy; if (y < y0 || y > y1) continue;
    const a = Math.atan2(dy, dx), rr = 1 + 0.3 * Math.sin(3 * a + k) + 0.15 * Math.sin(7 * a + k);
    if ((dx / rw) ** 2 + (dy / rh) ** 2 > rr * rr) continue;
    cells.push([cx + dx, y]);
  }
  const inside = new Set(cells.map(([x, y]) => `${((x % pb.w) + pb.w) % pb.w},${y}`));
  const has = (x, y) => inside.has(`${((x % pb.w) + pb.w) % pb.w},${y}`);
  for (const [x, y] of cells) {
    pb.set(x, y, bay(x, y) < 0.2 ? dk(under, 0.1) : under);
    if (!has(x, y - 1) && y - 1 >= y0) pb.tint(x, y, 'ink', 0.3);           // shadow under the upper edge
    if (!has(x, y + 1) && y + 1 <= y1) { pb.set(x, y + 1, curl); if (r() < 0.25 && y + 2 <= y1) pb.set(x, y + 2, dk(curl, 0.15)); } // curl
    if (!has(x - 1, y) && r() < 0.5) pb.tint(x - 1, y, curl, 0.5);
  }
}
/** Stair-step crack following block joints. */
function jointCrack(pb, r, x, y, n, dark) {
  for (let i = 0; i < n; i++) {
    if (r() < 0.55) { y += 1; } else { x += r() < 0.7 ? 1 : -1; }
    if (y > 31) break;
    pb.tint(x, y, dark, 0.55);
    if (r() < 0.3) pb.tint(x + 1, y, [255, 255, 255], 0.12);
  }
}
/** Darken the bottom few rows (dirt where wall meets floor). */
function baseGrime(pb, y0, y1, color = mixc('brown_dd', 'ink', 0.4), max = 0.3) {
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0 + 1) / (y1 - y0 + 1);
    for (let x = 0; x < pb.w; x++) if (bay(x, y) < t * 0.9) pb.tint(x, y, color, max * t);
  }
}
/** Scuffs (chair backs, shoes) and chips; `dmg` clusters them along the wall. */
function scuffs(pb, r, n, y0, y1, color = mixc('ink', 'g1', 0.3), dmg = null) {
  for (let i = 0; i < n; i++) {
    const x = dmg ? pickX(r, dmg, 1) : Math.floor(r() * pb.w), y = y0 + Math.floor(r() * (y1 - y0 + 1)), l = 3 + Math.floor(r() * 8);
    for (let k = 0; k < l; k++) if (r() < 0.8) pb.tint(x + k, y + (k > l / 2 && r() < 0.3 ? 1 : 0), color, 0.3 + r() * 0.2);
  }
}
function chips(pb, r, n, y0, y1, core, edge = 'ink', dmg = null) {
  for (let i = 0; i < n; i++) {
    const x = dmg ? pickX(r, dmg, 2) : Math.floor(r() * pb.w), y = y0 + Math.floor(r() * (y1 - y0 + 1));
    pb.set(x, y, core); if (r() < 0.6) pb.set(x + 1, y, core);
    pb.tint(x, y - 1, edge, 0.35); pb.tint(x + 2, y, edge, 0.25);
  }
}

// ---------------------------------------------------------------------------------------------
// materials
const CREAM = mixc(mixc('cream', 'cream_d', 0.55), 'g3', 0.12);
const LGREEN = mixc('green', 'green_d', 0.25);

function plaster(clean) {
  const r = R('w_plaster');
  const pb = new PB(FW, 32);
  pb.rect(0, 0, FW, 16, CREAM);
  pb.rect(0, 16, FW, 16, LGREEN);
  blockJoints(pb, 1, 15, 0.09);
  blockJoints(pb, 18, 28, 0.12);
  // chair rail (painted wood): lit top, mid face, shadow under
  pb.hline(0, 16, FW, lt(mixc('green_d', 'wood_d', 0.4), 0.18));
  pb.hline(0, 17, FW, mixc('green_d', 'wood_d', 0.4));
  pb.hline(0, 18, FW, dk(LGREEN, 0.35));
  // rubber cove base
  const base = mixc('brown_dd', 'g1', 0.5);
  pb.hline(0, 29, FW, lt(base, 0.18)); pb.hline(0, 30, FW, base); pb.hline(0, 31, FW, dk(base, 0.3));
  ceiling(pb, MAT.wall_plaster.lip);
  if (clean) { speck(pb, R('w_plaster_c'), [255, 255, 255], 0.004, 0, 2, FW, 14, 0.12); return pb; }
  const d = R('w_plaster_decay'), dmg = damage1D(209);
  // nicotine: upper wall yellows unevenly, darker near the ceiling
  shadeField(pb, fbm(FW, 32, [[64, 16, 1], [16, 8, 0.6]], 201), { lo: 0.45, hi: 0.8, color: mixc('mustard_d', 'brown', 0.4), steps: 3, step: 0.1, where: (x, y) => y < 16 });
  shadeField(pb, fbm(FW, 32, [[48, 16, 1], [8, 8, 0.5]], 202), { lo: 0.55, hi: 0.85, color: mixc('green_dd', 'ink', 0.4), steps: 2, step: 0.14, where: (x, y) => y > 17 });
  waterStains(pb, d, 14, { dmg });
  // peeling: cream flakes reveal old mint paint / bare gray block; green flakes reveal gray
  for (let i = 0; i < 20; i++) {
    const x = pickX(d, dmg, 2.5), sev = dmg(x);
    peel(pb, d, x, 3 + Math.floor(d() * 11), 1 + Math.floor(d() * 2 + sev * 5), 1 + Math.floor(d() * (1 + sev * 2)), d() < 0.6 ? mixc('mint', 'g4', 0.45) : mixc('g4', 'g5', 0.3), lt(CREAM, 0.22), 2, 15);
  }
  for (let i = 0; i < 12; i++) {
    const x = pickX(d, dmg, 2.5), sev = dmg(x);
    peel(pb, d, x, 21 + Math.floor(d() * 6), 1 + Math.floor(d() * 2 + sev * 3), 1, mixc('g4', 'g3', 0.4), lt(LGREEN, 0.25), 19, 28);
  }
  // scuffs at chair/desk height, chips, stair-step cracks — all heavier where the wall is worst
  scuffs(pb, d, 70, 20, 28, undefined, dmg);
  chips(pb, d, 34, 19, 28, mixc('g4', 'g5', 0.5), 'ink', dmg);
  for (let i = 0; i < 7; i++) jointCrack(pb, d, pickX(d, dmg, 2), 2 + Math.floor(d() * 6), 6 + Math.floor(d() * 14), mixc('ink', 'brown_dd', 0.4));
  baseGrime(pb, 25, 28);
  for (let i = 0; i < 60; i++) pb.tint(pickX(d, dmg, 1), 24 + Math.floor(d() * 5), 'green_dd', 0.45); // mildew low on the wall
  return pb;
}

function brick(clean) {
  const r = R('w_brick');
  const pb = new PB(FW, 32);
  const mortar = mixc('mortar', 'g3', 0.25);
  pb.rect(0, 0, FW, 32, mortar);
  const shades = [mixc('brick_d', 'brick', 0.35), 'brick', mixc('brick', 'brick_l', 0.45), mixc('brick_l', 'tan', 0.25)];
  const bricks = [];
  for (let c = 0; c < 7; c++) {
    const y = c * 4, off = (c & 1) ? 4 : 0;
    for (let x = off; x < FW + off; x += 8) {
      let col = shades[Math.min(3, Math.floor(r() * r() * 4.6))];
      if (r() < 0.07) col = dk(shades[0], 0.3); // clinker
      col = r() < 0.5 ? lt(col, r() * 0.06) : dk(col, r() * 0.08);
      pb.rect(x, y, 7, 3, col);
      pb.hline(x, y, 7, lt(col, 0.1));
      pb.hline(x, y + 2, 7, dk(col, 0.12));
      if (r() < 0.25) pb.set(x + 1 + Math.floor(r() * 5), y + 1, dk(col, 0.15));
      bricks.push([x, y, col]);
    }
    for (let x = 0; x < FW; x++) pb.tint(x, y + 3, 'ink', 0.18); // recessed mortar under each course
  }
  // granite water table at the base
  const gran = mixc('g4', 'g3', 0.4);
  pb.rect(0, 28, FW, 4, gran);
  pb.hline(0, 28, FW, lt(gran, 0.22)); pb.hline(0, 31, FW, dk(gran, 0.4));
  for (let x = 0; x < FW; x += 32) pb.vline(x, 29, 3, dk(gran, 0.35));
  speck(pb, r, dk(gran, 0.3), 0.15, 0, 29, FW, 2);
  ceiling(pb, MAT.wall_brick.lip, 4, 0.5);
  if (clean) return pb;
  const d = R('w_brick_decay'), dmg = damage1D(219);
  // soot / weather streaks from the top
  shadeField(pb, fbm(FW, 32, [[24, 64, 1], [8, 32, 0.5]], 211), { lo: 0.55, hi: 0.85, color: 'ink', steps: 3, step: 0.12 });
  // efflorescence: salt bloom low on the wall and along mortar
  shadeField(pb, fbm(FW, 32, [[48, 16, 1], [8, 8, 0.6]], 212), { lo: 0.5, hi: 0.8, color: 'g6', steps: 2, step: 0.2, where: (x, y) => y > 14 && y < 28 });
  for (let x = 0; x < FW; x++) for (let y = 3; y < 28; y += 4) if (d() < 0.08) pb.tint(x, y, 'g6', 0.5);
  // spalling: chipped faces show the paler core
  for (let i = 0; i < 34; i++) {
    let [bx, by, col] = bricks[Math.floor(d() * bricks.length)];
    if (d() > dmg(bx)) [bx, by, col] = bricks[Math.floor(d() * bricks.length)];
    const sx = bx + Math.floor(d() * 4), w = 2 + Math.floor(d() * 3);
    for (let k = 0; k < w; k++) for (let j = 0; j < 2; j++) pb.set(sx + k, by + j + (d() < 0.5 ? 0 : 1), lt(mixc(col, 'tan', 0.4), 0.08));
    pb.tint(sx, by, 'ink', 0.35); pb.tint(sx + w, by + 1, 'ink', 0.3);
  }
  // eroded mortar
  for (let i = 0; i < 140; i++) { const x = pickX(d, dmg, 1.5), y = Math.floor(d() * 7) * 4 + 3; pb.set(x, y, mixc('ink', 'brick_d', 0.3)); }
  for (let i = 0; i < 6; i++) jointCrack(pb, d, pickX(d, dmg, 2), 1 + Math.floor(d() * 6), 10 + Math.floor(d() * 14), mixc('ink', 'brick_d', 0.2));
  // moss on the water table
  for (let x = 0; x < FW; x++) if (d() < 0.25) pb.tint(x, 28 + Math.floor(d() * 2), mixc('green_d', 'green_dd', 0.5), 0.6);
  baseGrime(pb, 24, 27, 'ink', 0.25);
  return pb;
}

function tileWall(clean) {
  const r = R('w_tile');
  const pb = new PB(FW, 32);
  const plast = mixc(CREAM, 'cream_l', 0.2);
  const field = dk(mixc('mint', 'g6', 0.38), 0.08);
  const band = mixc('green', 'slate_l', 0.4);
  const grout = mixc(field, 'g4', 0.45);
  pb.rect(0, 0, FW, 9, plast);
  // bullnose cap
  const cap = mixc('green_d', 'slate_l', 0.5);
  pb.hline(0, 8, FW, dk(plast, 0.3));
  pb.hline(0, 9, FW, lt(cap, 0.3)); pb.hline(0, 10, FW, cap); pb.hline(0, 11, FW, dk(cap, 0.3));
  for (let x = 0; x < FW; x += 8) pb.vline(x, 9, 3, dk(cap, 0.45));
  // field tiles 4×4 from y=12, accent band of darker tiles at rows 20–23
  pb.rect(0, 12, FW, 17, grout);
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < FW / 4; tx++) {
    const y = 12 + ty * 4, x = tx * 4;
    const base = ty === 2 ? band : field;
    const j = (r() - 0.5) * 0.05;
    const c = j > 0 ? lt(base, j) : dk(base, -j);
    pb.rect(x, y, 3, 3, c);
    pb.set(x, y, lt(c, 0.16));
  }
  pb.hline(0, 28, FW, dk(grout, 0.1));
  // cove base
  const cove = mixc('green_d', 'slate', 0.4);
  pb.hline(0, 29, FW, lt(cove, 0.2)); pb.hline(0, 30, FW, cove); pb.hline(0, 31, FW, dk(cove, 0.35));
  ceiling(pb, MAT.wall_tile.lip);
  if (clean) return pb;
  const d = R('w_tile_decay'), dmg = damage1D(229);
  shadeField(pb, fbm(FW, 32, [[64, 16, 1], [16, 8, 0.6]], 221), { lo: 0.45, hi: 0.8, color: mixc('mustard_d', 'brown', 0.4), steps: 3, step: 0.1, where: (x, y) => y < 8 });
  waterStains(pb, d, 8, { yMax: 10, dmg });
  // grout blackens in patches (not per pixel: a field), glaze yellows
  const gf = fbm(FW, 32, [[32, 16, 1], [8, 8, 0.5]], 224);
  for (let y = 12; y < 29; y++) for (let x = 0; x < FW; x++) {
    const f = gf[y * FW + x] * (0.5 + dmg(x));
    if (((x & 3) === 3 || ((y - 12) & 3) === 3) && f > 0.45) pb.tint(x, y, mixc('ink', 'brown_dd', 0.5), Math.min(0.45, (f - 0.45) * 1.4));
  }
  shadeField(pb, fbm(FW, 32, [[32, 16, 1], [8, 8, 0.5]], 222), { lo: 0.55, hi: 0.85, color: mixc('mustard_d', 'tan', 0.5), steps: 2, step: 0.13, where: (x, y) => y > 11 });
  // rust runs from old fixture bolts
  for (let i = 0; i < 10; i++) {
    const x = pickX(d, dmg, 1.5), y = 12 + Math.floor(d() * 6), l = 4 + Math.floor(d() * 10);
    pb.set(x, y, mixc('rust', 'brown_dd', 0.3));
    for (let k = 1; k < l && y + k < 29; k++) pb.tint(x + (k > l / 2 && d() < 0.3 ? 1 : 0), y + k, 'rust', 0.45 * (1 - k / l) + 0.1);
  }
  // cracked and missing tiles
  for (let i = 0; i < 12; i++) crack(pb, d, pickX(d, dmg, 2), 12 + d() * 14, 4 + d() * 8, d() * 6.28, 'ink', { tint: 0.5, straight: 3, branch: 0.03, wobble: 0.7 });
  for (let i = 0; i < 16; i++) {
    const x = (pickX(d, dmg, 3) >> 2) * 4, y = 12 + Math.floor(d() * 4) * 4;
    pb.rect(x, y, 3, 3, mixc('g3', 'g2', d()));
    pb.hline(x, y, 3, 'ink'); pb.tint(x, y + 1, 'ink', 0.4);
    if (d() < 0.5) pb.set(x + 1, y + 2, 'g4');
  }
  for (let i = 0; i < 28; i++) pb.tint(pickX(d, dmg, 1), 3 + Math.floor(d() * 5), 'ink', 0.25);
  baseGrime(pb, 25, 28, mixc('brown_dd', 'ink', 0.4), 0.28);
  return pb;
}

function panel(clean) {
  const r = R('w_panel');
  const pb = new PB(FW, 32);
  const w0 = mixc('wood_d', 'brown_d', 0.4), w1 = mixc('wood', 'wood_d', 0.45), wl = mixc('wood_l', 'wood', 0.45);
  pb.rect(0, 0, FW, 32, w0);
  // crown molding
  pb.hline(0, 1, FW, dk(w0, 0.4)); pb.hline(0, 2, FW, wl); pb.hline(0, 3, FW, w1); pb.hline(0, 4, FW, dk(w0, 0.35));
  const raised = (x0, y0, w, h) => {
    const g = mixc(w1, w0, r() * 0.5);
    pb.rect(x0, y0, w, h, g);
    // grain (vertical in panels)
    for (let q = 0; q < 4; q++) {
      const gx = x0 + 1 + Math.floor(r() * (w - 2)), gy = y0 + Math.floor(r() * 2), gl = 2 + Math.floor(r() * (h - 2));
      for (let k = 0; k < gl; k++) if (r() < 0.85) pb.tint(gx, gy + k, r() < 0.6 ? 'ink' : wl, 0.18);
    }
    pb.hline(x0, y0, w, lt(g, 0.2)); pb.vline(x0, y0, h, lt(g, 0.12));        // lit bevel
    pb.hline(x0, y0 + h - 1, w, dk(g, 0.32)); pb.vline(x0 + w - 1, y0, h, dk(g, 0.28)); // shadow bevel
  };
  for (let x = 0; x < FW; x += 16) {
    // stile: dark seam + lit edge
    pb.vline(x, 5, 11, dk(w0, 0.3)); pb.vline(x + 1, 5, 11, lt(w0, 0.08));
    pb.vline(x, 19, 10, dk(w0, 0.3)); pb.vline(x + 1, 19, 10, lt(w0, 0.08));
    raised(x + 3, 6, 11, 8);
    raised(x + 3, 20, 11, 7);
  }
  // chair rail molding
  pb.hline(0, 15, FW, dk(w0, 0.2)); pb.hline(0, 16, FW, wl); pb.hline(0, 17, FW, w1); pb.hline(0, 18, FW, dk(w0, 0.45));
  // baseboard
  pb.hline(0, 28, FW, dk(w0, 0.2)); pb.hline(0, 29, FW, lt(w1, 0.08)); pb.hline(0, 30, FW, w0); pb.hline(0, 31, FW, dk(w0, 0.45));
  ceiling(pb, MAT.wall_panel.lip, 3, 0.4);
  if (clean) { speck(pb, R('w_panel_c'), [255, 230, 190], 0.01, 0, 5, FW, 24, 0.18); return pb; }
  const d = R('w_panel_decay'), dmg = damage1D(239);
  // dust on the ledges, water damage, scratches, split panels
  for (let x = 0; x < FW; x++) { if (d() < 0.6) pb.tint(x, 16, 'g4', 0.3); if (d() < 0.5) pb.tint(x, 2, 'g4', 0.28); if (d() < 0.5) pb.tint(x, 29, 'g4', 0.25); }
  waterStains(pb, d, 9, { color: mixc('ink', 'brown_dd', 0.5), body: 0.2, rim: 0.28, dmg });
  shadeField(pb, fbm(FW, 32, [[48, 32, 1], [12, 8, 0.5]], 231), { lo: 0.6, hi: 0.85, color: 'g3', steps: 2, step: 0.12 });
  for (let i = 0; i < 36; i++) {
    const x = pickX(d, dmg, 1), y = 5 + d() * 22, a = (d() - 0.5) * 1.2, l = 2 + d() * 5;
    for (let k = 0; k < l; k++) pb.tint(x + Math.cos(a) * k, y + Math.sin(a) * k, wl, 0.35);
  }
  for (let i = 0; i < 5; i++) { const x = (pickX(d, dmg, 3) & ~15) + 5 + Math.floor(d() * 6), y0 = d() < 0.5 ? 6 : 20; for (let k = 0; k < 7; k++) pb.tint(x + (k > 3 ? 1 : 0), y0 + k, 'ink', 0.7); }
  for (let i = 0; i < 3; i++) { const x = pickX(d, dmg, 3); pb.rect(x, 16, 5 + Math.floor(d() * 6), 2, dk(w0, 0.5)); } // lost molding
  return pb;
}

function concreteWall(clean) {
  const r = R('w_conc');
  const pb = new PB(FW, 32);
  const c0 = mixc(mixc('g4', 'cream_d', 0.18), 'g3', 0.4);
  for (let b = 0; b < 8; b++) {
    const j = (r() - 0.5) * 0.08;
    pb.rect(0, b * 4, FW, 4, j > 0 ? lt(c0, j) : dk(c0, -j));
    for (let x = 0; x < FW; x++) { pb.tint(x, b * 4, [255, 255, 255], 0.06); if (bay(x, b * 4 + 3) < 0.6) pb.tint(x, b * 4 + 3, 'ink', 0.12); }
    // form-board butt joints
    let x = Math.floor(r() * 40);
    while (x < FW) { pb.vline(x, b * 4, 4, dk(c0, 0.18)); x += 32 + Math.floor(r() * 40); }
    // board grain
    for (let q = 0; q < 20; q++) { const gx = Math.floor(r() * FW), gy = b * 4 + 1 + Math.floor(r() * 2), gl = 3 + Math.floor(r() * 12); for (let k = 0; k < gl; k++) pb.tint(gx + k, gy, r() < 0.5 ? 'ink' : [255, 255, 255], 0.06); }
  }
  speck(pb, r, dk(c0, 0.25), 0.03); speck(pb, r, lt(c0, 0.15), 0.015);
  // tie holes
  for (let x = 6; x < FW; x += 32) for (const y of [9, 23]) { pb.set(x, y, mixc('ink', 'g1', 0.3)); pb.set(x + 1, y, mixc('ink', 'g1', 0.5)); pb.tint(x, y + 1, [255, 255, 255], 0.12); pb.tint(x + 1, y + 1, [255, 255, 255], 0.12); }
  // floor cove
  pb.hline(0, 30, FW, dk(c0, 0.25)); pb.hline(0, 31, FW, dk(c0, 0.45));
  ceiling(pb, MAT.wall_concrete.lip, 5, 0.6);
  if (clean) return pb;
  const d = R('w_conc_decay'), dmg = damage1D(249);
  // sweating: damp dark patches + drip runs
  shadeField(pb, fbm(FW, 32, [[48, 24, 1], [12, 8, 0.6]], 241), { lo: 0.5, hi: 0.8, color: mixc('blue_dd', 'g1', 0.5), steps: 3, step: 0.13 });
  for (let i = 0; i < 34; i++) {
    const x = pickX(d, dmg, 1), y = 2 + Math.floor(d() * 10), l = 6 + Math.floor(d() * 18);
    for (let k = 0; k < l && y + k < 31; k++) pb.tint(x, y + k, mixc('blue_dd', 'ink', 0.5), 0.22 * (1 - k / l) + 0.06);
    pb.tint(x, y + l, 'moon', 0.2);
  }
  // rust streaks from tie holes and rebar
  for (let x = 6; x < FW; x += 32) for (const y of [9, 23]) if (d() < 0.55) {
    const l = 4 + Math.floor(d() * 10);
    for (let k = 1; k < l && y + k < 31; k++) pb.tint(x + (d() < 0.2 ? 1 : 0), y + k, 'rust', 0.5 * (1 - k / l) + 0.1);
  }
  for (let i = 0; i < 5; i++) { // spalled patch with exposed rebar
    const cx = pickX(d, dmg, 3), cy = 6 + Math.floor(d() * 18);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx / 9 + dy * dy / 4 <= 1 && d() < 0.9) pb.set(cx + dx, cy + dy, d() < 0.5 ? dk(c0, 0.3) : dk(c0, 0.1));
    pb.hline(cx - 2, cy, 5, mixc('rust', 'brown_dd', 0.4)); pb.hline(cx - 3, cy - 2, 7, dk(c0, 0.45));
  }
  shadeField(pb, fbm(FW, 32, [[32, 16, 1], [6, 6, 0.6]], 242), { lo: 0.62, hi: 0.85, color: 'g6', steps: 2, step: 0.2, where: (x, y) => y > 20 });
  for (let i = 0; i < 6; i++) crack(pb, d, pickX(d, dmg, 1), d() * 20, 8 + d() * 14, 1.2 + (d() - 0.5), 'ink', { tint: 0.5, straight: 3, branch: 0.05 });
  baseGrime(pb, 24, 29, mixc('ink', 'brown_dd', 0.3), 0.35);
  return pb;
}

/** Rock with strata and a coal seam (deep passages, breaker cavern). */
function rock(clean) {
  const r = R('w_rock');
  const pb = new PB(FW, 32);
  const TAU = Math.PI * 2;
  // band boundaries wander but repeat every 256 px
  const ph = [r() * TAU, r() * TAU, r() * TAU, r() * TAU];
  const bnd = (x, k, base) => base + 2.2 * Math.sin((x / FW) * TAU * (k + 1) + ph[k]) + 1.2 * Math.sin((x / FW) * TAU * (k * 2 + 3) + ph[(k + 1) & 3]);
  const shale = mixc('g2', 'g1', 0.3), sand = mixc('g3', 'tan', 0.25), coalC = mixc('ink', 'night', 0.5), clay = mixc('g2', 'brown_d', 0.4);
  for (let x = 0; x < FW; x++) {
    const b1 = bnd(x, 0, 7), b2 = bnd(x, 1, 13), b3 = bnd(x, 2, 20), b4 = bnd(x, 3, 26);
    for (let y = 0; y < 32; y++) {
      let c = y < b1 ? shale : y < b2 ? sand : y < b3 ? coalC : y < b4 ? clay : shale;
      pb.set(x, y, c);
    }
  }
  // lumpy relief: facets lit from the top-left
  const n1 = fbm(FW, 32, [[16, 8, 1], [6, 4, 0.6]], 251);
  for (let y = 1; y < 32; y++) for (let x = 0; x < FW; x++) {
    const g = n1[y * FW + x] - n1[(y - 1) * FW + ((x + FW - 1) % FW)];
    if (g > 0.04) pb.tint(x, y, [255, 255, 255], Math.min(0.22, g * 2));
    else if (g < -0.04) pb.tint(x, y, 'ink', Math.min(0.35, -g * 3));
  }
  // coal glints
  for (let x = 0; x < FW; x++) for (let y = 0; y < 32; y++) {
    const c = pb.get(x, y);
    if (c[0] < 22 && r() < 0.03) pb.set(x, y, r() < 0.4 ? 'moon_l' : mixc('g3', 'blue_l', 0.3));
  }
  for (let i = 0; i < 20; i++) crack(pb, r, r() * FW, r() * 30, 5 + r() * 12, r() * 6.28, 'ink', { tint: 0.7, branch: 0.08, wobble: 0.9 });
  // rubble at the foot
  const ramp = ['ink', 'g1', 'g2', mixc('g3', 'tan', 0.2), 'g4'];
  for (let i = 0; i < 140; i++) lump(pb, r, Math.floor(r() * FW), 29 + Math.floor(r() * 3), 1 + r() * 1.8, 0.8 + r(), ramp);
  ceiling(pb, MAT.wall_rock.lip, 6, 0.6);
  if (!clean) {
    shadeField(pb, fbm(FW, 32, [[32, 32, 1], [8, 8, 0.5]], 252), { lo: 0.6, hi: 0.85, color: mixc('blue_dd', 'ink', 0.3), steps: 2, step: 0.18 });
    for (let i = 0; i < 24; i++) { const x = Math.floor(r() * FW), y = Math.floor(r() * 12), l = 4 + Math.floor(r() * 12); for (let k = 0; k < l; k++) pb.tint(x, y + k, 'moon', 0.08); }
  }
  return pb;
}

const MARBLE_W = dk(mixc('g6', 'moon_l', 0.25), 0.12);
function marbleWall(clean) {
  const r = R('w_marble');
  const pb = new PB(FW, 32, MARBLE_W);
  const cloud = fbm(FW, 32, [[24, 16, 1], [8, 8, 0.5]], 261);
  shadeField(pb, cloud, { lo: 0.55, hi: 0.85, color: mixc('g5', 'moon', 0.3), steps: 2, step: 0.2 });
  const veins = new PB(FW, 32);
  for (let i = 0; i < 18; i++) crack(veins, r, r() * FW, r() * 32, 18 + r() * 40, 0.5 + (r() - 0.5) * 1.2, [255, 255, 255], { branch: 0.04, wobble: 0.3 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < FW; x++) if (veins.alpha(x, y) && bay(x, y) < 0.85) { pb.tint(x, y, mixc('g4', 'moon', 0.25), 0.55); if (bay(x, y) < 0.3) pb.tint(x + 1, y, 'g5', 0.3); }
  // slab joints: courses at y=4..15 and 16..26, staggered verticals
  const jc = dk(MARBLE_W, 0.3);
  pb.hline(0, 16, FW, jc); pb.hline(0, 17, FW, lt(MARBLE_W, 0.12));
  for (let x = 0; x < FW; x += 32) { pb.vline(x, 5, 11, jc); pb.vline(x + 16, 18, 9, jc); }
  // reflections
  for (let x = 0; x < FW; x += 16) { const ox = x + 3 + Math.floor(r() * 8); for (let k = 0; k < 4; k++) pb.tint(ox + k, 7 + k + (x & 16 ? 0 : 12), 'white', 0.3); }
  // cornice
  const K = lt(mixc('ink', 'navy_dd', 0.5), 0.06);
  pb.hline(0, 1, FW, K); pb.hline(0, 2, FW, lt(K, 0.18)); pb.hline(0, 3, FW, K); pb.hline(0, 4, FW, dk(MARBLE_W, 0.4));
  // black marble plinth
  pb.rect(0, 27, FW, 5, K);
  pb.hline(0, 27, FW, lt(K, 0.22));
  for (let x = 0; x < FW; x++) if (r() < 0.06) pb.set(x, 28 + Math.floor(r() * 3), mixc('g3', 'g4', 0.5));
  pb.hline(0, 26, FW, dk(MARBLE_W, 0.35));
  ceiling(pb, MAT.wall_marble.lip, 4, 0.45);
  if (clean) return pb;
  const d = R('w_marble_decay');
  shadeField(pb, fbm(FW, 32, [[24, 48, 1], [8, 16, 0.5]], 262), { lo: 0.55, hi: 0.85, color: mixc('g2', 'brown_dd', 0.3), steps: 3, step: 0.11 });
  for (let i = 0; i < 8; i++) crack(pb, d, d() * FW, 4 + d() * 20, 6 + d() * 14, 1.3 + (d() - 0.5), 'ink', { tint: 0.6, straight: 3, light: 'g5', branch: 0.05 });
  baseGrime(pb, 22, 26, mixc('g2', 'ink', 0.4), 0.3);
  return pb;
}

function timber(clean) {
  const r = R('w_timber');
  const pb = new PB(FW, 32);
  const tar = mixc('ink', 'brown_dd', 0.55), tarL = mixc('brown_dd', 'g2', 0.4);
  for (let row = 0; row < 8; row++) {
    const y = row * 4, c = mixc(tar, tarL, r() * 0.6);
    pb.rect(0, y, FW, 3, c);
    pb.hline(0, y + 3, FW, 'ink');
    for (let x = 0; x < FW; x++) { pb.tint(x, y, [255, 255, 255], 0.06); if (r() < 0.05) pb.tint(x, y + 1 + Math.floor(r() * 2), [255, 220, 180], 0.12); }
    let x = Math.floor(r() * 30); while (x < FW) { pb.vline(x, y, 3, 'ink'); x += 24 + Math.floor(r() * 40); }
  }
  // heavy cross beam
  const beam = mixc('wood_d', 'brown_dd', 0.45);
  pb.rect(0, 13, FW, 5, beam); pb.hline(0, 13, FW, lt(beam, 0.2)); pb.hline(0, 17, FW, 'ink');
  // posts every 32 px
  for (let x = 0; x < FW; x += 32) {
    pb.rect(x, 0, 5, 32, beam);
    pb.vline(x, 0, 32, lt(beam, 0.22)); pb.vline(x + 4, 0, 32, dk(beam, 0.5)); pb.vline(x + 5, 0, 32, mixc('ink', tar, 0.3));
    for (let k = 0; k < 6; k++) { const gy = Math.floor(r() * 30); pb.tint(x + 1 + Math.floor(r() * 3), gy, 'ink', 0.3); pb.tint(x + 2, gy + 1, 'ink', 0.2); }
    for (const by of [15, 3, 27]) { pb.set(x + 2, by, mixc('rust', 'g3', 0.3)); pb.set(x + 3, by + 1, 'ink'); }
  }
  ceiling(pb, MAT.wall_timber.lip, 4, 0.5);
  speck(pb, R('w_timber_d'), mixc('g1', 'ink', 0.2), clean ? 0.03 : 0.07, 0, 0, FW, 32, 0.5);
  if (!clean) shadeField(pb, fbm(FW, 32, [[32, 16, 1], [8, 8, 0.5]], 271), { lo: 0.6, hi: 0.85, color: 'ink', steps: 2, step: 0.2 });
  return pb;
}

function gymWall(clean) {
  const r = R('w_gym');
  const pb = new PB(FW, 32);
  const blk = mixc(mixc('cream_l', 'cream', 0.5), 'g4', 0.18);
  pb.rect(0, 0, FW, 32, blk);
  blockJoints(pb, 1, 28, 0.14, 0.9);
  // the green-and-gold stripe
  const gold = mixc('mustard', 'yellow', 0.35), green = mixc('green', 'green_d', 0.3);
  pb.hline(0, 18, FW, gold); pb.rect(0, 19, FW, 3, green); pb.hline(0, 22, FW, gold);
  pb.hline(0, 19, FW, lt(green, 0.12)); pb.hline(0, 23, FW, dk(blk, 0.2));
  const cove = mixc('green_d', 'g1', 0.4);
  pb.hline(0, 29, FW, lt(cove, 0.18)); pb.hline(0, 30, FW, cove); pb.hline(0, 31, FW, dk(cove, 0.35));
  ceiling(pb, MAT.wall_gym.lip, 5, 0.5);
  if (clean) return pb;
  const d = R('w_gym_decay'), dmg = damage1D(289);
  shadeField(pb, fbm(FW, 32, [[64, 16, 1], [16, 8, 0.6]], 281), { lo: 0.5, hi: 0.82, color: mixc('mustard_d', 'g3', 0.4), steps: 3, step: 0.1 });
  waterStains(pb, d, 12, { dmg });
  // basketball marks: round dark smudges
  for (let i = 0; i < 40; i++) {
    const cx = Math.floor(d() * FW), cy = 3 + Math.floor(d() * 24);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (Math.abs(dx) + Math.abs(dy) < 2 || d() < 0.4) pb.tint(cx + dx, cy + dy, 'ink', 0.18 + d() * 0.1);
  }
  for (let i = 0; i < 12; i++) { const x = pickX(d, dmg, 2.5); peel(pb, d, x, 4 + Math.floor(d() * 20), 1 + Math.floor(d() * 2 + dmg(x) * 4), 1 + Math.floor(d() * 2), mixc('g4', 'g5', 0.4), lt(blk, 0.15), 2, 28); }
  scuffs(pb, d, 60, 23, 28, undefined, dmg);
  baseGrime(pb, 25, 28);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// rubble: a collapsed heap of plaster, brick, lath and a broken beam
const RUBBLE_RAMPS = [
  [mixc('ink', 'g1', 0.4), 'g2', 'g4', mixc('g5', 'cream_l', 0.3), mixc('g6', 'cream_l', 0.4)],          // plaster
  [mixc('ink', 'brick_d', 0.4), 'brick_d', 'brick', 'brick_l', mixc('brick_l', 'tan', 0.4)],            // brick
  [mixc('ink', 'g1', 0.5), 'g1', 'g3', 'g4', 'g5'],                                                     // block
  [mixc('ink', 'brown_dd', 0.4), mixc('cream_d', 'g3', 0.4), mixc('cream', 'g4', 0.3), 'cream_l', 'cream_l'], // ceiling tile
];
function rubbleInto(pb, r, density, yBias = 0) {
  const n = Math.floor(pb.w * pb.h * density);
  for (let i = 0; i < n; i++) {
    const ramp = RUBBLE_RAMPS[Math.floor(r() * r() * RUBBLE_RAMPS.length * 1.2) % RUBBLE_RAMPS.length];
    const s = r();
    const rad = s < 0.6 ? 1.2 + r() * 1.5 : s < 0.92 ? 2.4 + r() * 2 : 4 + r() * 2.5;
    lump(pb, r, Math.floor(r() * pb.w), Math.floor(yBias + r() * (pb.h - yBias)), rad * (1 + r() * 0.6), rad * (0.6 + r() * 0.4), ramp);
  }
  // lath and a broken beam or two
  for (let i = 0; i < pb.w / 12; i++) {
    const x = r() * pb.w, y = yBias + r() * (pb.h - yBias), a = (r() - 0.5) * 2.2, l = 4 + r() * 10;
    for (let k = 0; k < l; k++) { pb.set(x + Math.cos(a) * k, y + Math.sin(a) * k, mixc('wood_l', 'tan', 0.4)); pb.tint(x + Math.cos(a) * k, y + Math.sin(a) * k + 1, 'ink', 0.5); }
  }
  for (let i = 0; i < pb.w / 64; i++) {
    const x = r() * pb.w, y = yBias + r() * (pb.h - yBias), a = (r() < 0.5 ? -1 : 1) * (0.3 + r() * 0.5), l = 14 + r() * 16;
    for (let k = 0; k < l; k++) for (let t = 0; t < 3; t++) pb.set(x + Math.cos(a) * k, y + Math.sin(a) * k + t, t === 0 ? mixc('wood_l', 'wood', 0.5) : t === 1 ? 'wood_d' : mixc('ink', 'brown_dd', 0.4));
  }
  // pipe stub
  for (let i = 0; i < pb.w / 128; i++) { const x = r() * pb.w, y = yBias + r() * (pb.h - yBias); for (let k = 0; k < 9; k++) { pb.set(x + k, y, 'g4'); pb.set(x + k, y + 1, 'g2'); } }
}
function rubbleFace(clean) {
  if (clean) return plaster(true); // 1979: the stairwell wall still stands
  const r = R('w_rubble');
  const pb = new PB(FW, 32, mixc('ink', 'g1', 0.35));
  speck(pb, r, 'g1', 0.3);
  rubbleInto(pb, r, 0.05);
  // crevices between chunks read darker toward the top (the heap recedes)
  for (let y = 0; y < 10; y++) for (let x = 0; x < FW; x++) if (bay(x, y) < (10 - y) / 14) pb.tint(x, y, 'ink', 0.35);
  // dust settles on the lower slope
  shadeField(pb, fbm(FW, 32, [[24, 16, 1], [6, 6, 0.6]], 291), { lo: 0.5, hi: 0.8, color: 'g5', steps: 2, step: 0.14, where: (x, y) => y > 14 });
  pb.hline(0, 0, FW, MAT.wall_rubble.lip);
  return pb;
}

// ---------------------------------------------------------------------------------------------
// tops: very dark mass, a faint material hint
function topTex(mat, clean) {
  const r = R('top_' + mat);
  const base = MAT[mat].top;
  const pb = new PB(TS, TS, base);
  const n = fbm(TS, TS, [[32, 32, 1], [8, 8, 0.4]], 301 + mat.length);
  shadeField(pb, n, { lo: 0.6, hi: 0.85, color: lt(base, 0.05), steps: 1, step: 0.8 });
  shadeField(pb, n.map((v) => 1 - v), { lo: 0.62, hi: 0.85, color: dk(base, 0.2), steps: 1, step: 0.8 });
  if (mat === 'wall_brick') {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) if ((y & 3) === 3 || (x & 7) === (((y >> 2) & 1) ? 4 : 0)) pb.tint(x, y, 'ink', 0.25);
  } else if (mat === 'wall_rock' || (mat === 'wall_rubble' && !clean)) {
    const ramp = mat === 'wall_rock' ? ['ink', mixc('ink', 'g1', 0.5), 'g1', mixc('g1', 'g2', 0.5), 'g2']
      : ['ink', mixc('ink', 'g1', 0.5), 'g1', 'g2', 'g3'];
    for (let i = 0; i < (mat === 'wall_rock' ? 70 : 110); i++) lump(pb, r, Math.floor(r() * TS), Math.floor(r() * TS), 1.5 + r() * 3, 1.2 + r() * 2.2, ramp);
  } else if (mat === 'wall_timber') {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) if ((y & 7) === 7) pb.tint(x, y, 'ink', 0.5);
  } else if (mat === 'wall_marble') {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) if ((x & 15) === 0 || (y & 15) === 0) pb.tint(x, y, 'ink', 0.3);
  }
  return pb;
}

/** Lip treatment for a top cell given the wall-neighbour mask (bits: N1 E2 S4 W8 = neighbour IS wall). */
export function applyTopLips(cell, mat, mask) {
  const lip = MAT[mat].lip, s = cell;
  const N = !(mask & 1), E = !(mask & 2), S = !(mask & 4), W = !(mask & 8);
  const dark = mixc('ink', MAT[mat].top, 0.3);
  if (N) { s.hline(0, 0, 16, lip); s.hline(0, 1, 16, dark); }
  if (W) { s.vline(0, 0, 16, lip); if (!N) s.vline(1, 0, 16, dark); else s.vline(1, 1, 15, dark); }
  if (S) { s.hline(0, 15, 16, dk(lip, 0.25)); }
  if (E) { s.vline(15, 0, 16, dk(lip, 0.3)); }
  if (N && W) s.set(0, 0, lt(lip, 0.15));
  // inner shadow so the lip reads as an edge, not a stroke
  if (N && W) s.set(1, 1, dark);
}

// ---------------------------------------------------------------------------------------------
// windows
const GLASS = mixc('blue_dd', 'blue_d', 0.45);
/**
 * Draw a window onto a 16×32 cell buffer (rows 0–15 high, 16–31 low) that already holds the wall
 * strip. `kind` = 'plaster' (painted wood sash) | 'brick' (stone sill + soldier course).
 */
export function drawWindow(c, kind, clean, variant) {
  const r = R(`win_${kind}_${variant}_${clean ? 1 : 0}`);
  const brick = kind === 'brick';
  const paint = brick ? mixc('g1', 'green_dd', 0.5) : clean ? mixc('green_d', 'green', 0.4) : mixc('green_d', 'g2', 0.35);
  const paintL = lt(paint, 0.22), paintD = dk(paint, 0.4);
  // head: soldier course (brick) or casing (plaster)
  if (brick) {
    for (let x = 0; x < 16; x += 3) { c.rect(x, 2, 2, 3, mixc('brick', 'brick_d', 0.4)); c.set(x, 2, mixc('brick', 'brick_l', 0.5)); c.vline(x + 2, 2, 3, MAT_MORTAR); }
    c.hline(0, 5, 16, 'ink');
  } else {
    c.hline(0, 3, 16, paintL); c.hline(0, 4, 16, paint); c.hline(0, 5, 16, paintD);
  }
  // casing / jambs
  for (let y = 5; y < 26; y++) {
    c.set(0, y, 'ink'); c.set(1, y, paintL); c.set(2, y, paint);
    c.set(13, y, paint); c.set(14, y, paintD); c.set(15, y, 'ink');
  }
  // sash frame
  c.hline(3, 6, 10, paintD);
  c.vline(7, 6, 19, paint); c.vline(8, 6, 19, paintD);      // mullion between the pair
  c.hline(3, 16, 10, paintL); c.hline(3, 17, 10, paintD);   // meeting rails
  c.hline(3, 24, 10, paint);                                 // bottom rail
  // panes: upper 3..6/9..12 × 7..15 (muntin at y=11), lower × 18..23 (muntin at y=20)
  const panes = [];
  for (const [x0, x1] of [[3, 6], [9, 12]]) for (const [y0, y1] of [[7, 10], [12, 15], [18, 19], [21, 23]]) panes.push([x0, y0, x1, y1]);
  for (const [x0, , x1] of [[3, 0, 6], [9, 0, 12]]) { c.hline(x0, 11, x1 - x0 + 1, paint); c.hline(x0, 20, x1 - x0 + 1, paint); }
  const dayTop = mixc('g6', 'moon_l', 0.5), dayBot = mixc('g5', 'moon', 0.4);
  const broken = !clean && variant % 7 === 5 ? Math.floor(r() * panes.length) : -1;
  const cracked = !clean && variant % 7 === 3 ? Math.floor(r() * panes.length) : -1;
  panes.forEach(([x0, y0, x1, y1], pi) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let col;
      if (clean) {
        const t = (y - 6) / 18;
        col = bay(x, y) < t ? dayBot : dayTop;
      } else {
        col = y > y1 - 1 ? dk(GLASS, 0.12) : GLASS;
        // faint cold reflection: one clean diagonal glint per pane
        if ((x - x0) - (y - y0) === 1 && y > y0 && (x - x0) < 4) col = mixc(GLASS, 'blue_l', 0.45);
        if (y === y0) col = dk(GLASS, 0.35); // frame shadow on the glass
      }
      c.set(x, y, col);
    }
    if (pi === broken) { // a black hole with jagged teeth of glass
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (r() < 0.8 && !(y === y0 && r() < 0.5)) c.set(x, y, 'ink');
      c.set(x0, y0 + 1, mixc('moon', 'blue_d', 0.3)); c.set(x1, y1, mixc('moon', 'blue_d', 0.3));
    }
    if (pi === cracked) { c.line(x0, y0, x1, y1, mixc('moon_l', 'blue_l', 0.5)); c.set(x0 + 1, y1, mixc('moon_l', 'blue_l', 0.5)); }
  });
  // rain streaks and drops on the night glass
  if (!clean) {
    for (let i = 0; i < 5; i++) {
      const x = [3, 4, 5, 6, 9, 10, 11, 12][Math.floor(r() * 8)], y0 = 7 + Math.floor(r() * 10), l = 2 + Math.floor(r() * 5);
      for (let k = 0; k < l; k++) {
        const y = y0 + k; const cc = c.get(x, y);
        if (cc[2] > 40 && cc[2] < 120 && r() < 0.8) c.tint(x, y, 'blue_l', 0.35);
      }
      c.tint(x, y0 + l, 'moon', 0.45);
    }
    // grime film in the lower corners
    for (const [x, y] of [[3, 23], [4, 23], [3, 22], [12, 23], [11, 23], [12, 22], [9, 23]]) if (r() < 0.8) c.tint(x, y, 'g3', 0.4);
    // peeling paint on the casing
    for (let i = 0; i < 4; i++) { const y = 6 + Math.floor(r() * 19), x = r() < 0.5 ? 1 : 13; c.set(x, y, mixc('wood', 'g4', 0.4)); }
  }
  // sill: stone (brick) or wood stool (plaster), wider than the casing; shadow below
  if (brick) {
    const st = mixc('g4', 'g5', 0.3);
    c.hline(0, 25, 16, lt(st, 0.2)); c.hline(0, 26, 16, st); c.hline(0, 27, 16, dk(st, 0.45));
    if (!clean) { c.tint(4, 26, 'ink', 0.3); c.tint(11, 25, 'green_dd', 0.5); }
  } else {
    c.hline(0, 25, 16, lt(paint, 0.3)); c.hline(0, 26, 16, paint); c.hline(0, 27, 16, dk(paint, 0.55));
  }
}
const MAT_MORTAR = mixc('mortar', 'g3', 0.25);

// ---------------------------------------------------------------------------------------------
// spill strip under face_low: contact shadow (ordered-dither ink, opaque pixels) / rubble spill
export function genSpill(mat, clean) {
  const pb = new PB(FW, 4);
  const shadowRows = [150, 84, 34, 0]; // alpha: a stepped occlusion band that darkens whatever floor it lands on
  const sh = rgb('ink');
  for (let y = 0; y < 3; y++) for (let x = 0; x < FW; x++) {
    const i = pb.idx(x, y);
    pb.d[i] = sh[0]; pb.d[i + 1] = sh[1]; pb.d[i + 2] = sh[2]; pb.d[i + 3] = shadowRows[y];
  }
  if (mat === 'wall_rubble' && !clean) {
    // chunks that rolled off the heap: drawn in a taller buffer so nothing wraps vertically
    const r = R('spill_rubble');
    const tmp = new PB(FW, 16);
    for (let i = 0; i < 140; i++) {
      const ramp = RUBBLE_RAMPS[Math.floor(r() * RUBBLE_RAMPS.length)];
      lump(tmp, r, Math.floor(r() * FW), 4 + Math.floor(r() * 2), 0.8 + r() * 1.3, 0.6 + r() * 0.8, ramp);
    }
    pb.blit(tmp, 0, 4, FW, 4, 0, 0);
  }
  return pb;
}

export const FACE_GEN = {
  wall_plaster: plaster,
  wall_brick: brick,
  wall_tile: tileWall,
  wall_panel: panel,
  wall_concrete: concreteWall,
  wall_rock: rock,
  wall_marble: marbleWall,
  wall_timber: timber,
  wall_gym: gymWall,
  wall_rubble: rubbleFace,
};
export { topTex };
