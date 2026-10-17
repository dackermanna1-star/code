// CG title_bg — Hallowell Consolidated at night in the rain, seen from the parking lot.
// Composition (UI contract): art y≈45–125 stays calm sky for the logotype; y≈160–240 stays dark
// (the menu sits there). The school is pushed right so its entrance (NEMO RELINQUATUR over the doors)
// clears the centred menu; the dead oak and the dead lamp post hold the left third under the moon.
// One window in the east wing is faintly lit, and the wet lot mirrors it. params.lightning (0..1)
// flashes the scene; with no param the scene runs its own rare, soft lightning (capped further when
// the player asked for reduced flashing).
import { HW } from '../engine/hw.js';
import {
  W, H, PAL, mix, U, Buf, rampStops, shade, bay, h01, fbm, vnoise, clamp01, smooth, mixU,
  text35, text35Width, makeRain, makeVapor, makePlumes, blitA, quant, once,
} from './cg_kit.js';

// ---- palette ramps (dark → light) ---------------------------------------------------------------
const SKY = rampStops([PAL.night, PAL.blue_dd, PAL.blue_d, mix(PAL.blue_d, PAL.blue, 0.6), PAL.blue_l, PAL.moon, PAL.moon_l, PAL.white], 12);
const CLOUD_F = rampStops([PAL.g1, mix(PAL.g3, PAL.blue_l, 0.4), mix(PAL.g5, PAL.moon, 0.5), PAL.moon_l, PAL.white], 9);
const BRICK = rampStops([PAL.ink, mix(PAL.brick_d, PAL.night, 0.7), mix(PAL.brick_d, PAL.blue_dd, 0.45), mix(PAL.brick_d, PAL.g2, 0.3), PAL.brick_d, PAL.brick, PAL.brick_l, mix(PAL.brick_l, PAL.tan_l, 0.5)], 10);
const STONE = rampStops([PAL.ink, mix(PAL.g1, PAL.blue_dd, 0.4), PAL.g2, PAL.g3, mix(PAL.g4, PAL.blue_l, 0.2), mix(PAL.g5, PAL.moon, 0.3), PAL.g6, PAL.white], 10);
const GLASS = rampStops([PAL.ink, PAL.blue_dd, PAL.blue_d, mix(PAL.blue_d, PAL.blue_l, 0.5), PAL.moon, PAL.moon_l], 8);
const ASPH = rampStops([PAL.ink, PAL.night, PAL.shadow, PAL.g1, mix(PAL.g2, PAL.blue_d, 0.3), mix(PAL.g3, PAL.blue_l, 0.3), mix(PAL.g5, PAL.moon, 0.5), PAL.moon_l], 10);
const GRASS = rampStops([PAL.ink, mix(PAL.green_dd, PAL.brown_dd, 0.6), PAL.green_dd, mix(PAL.green_d, PAL.mustard_d, 0.4), mix(PAL.mustard_d, PAL.tan, 0.3), PAL.tan], 8);
const BARK = rampStops([PAL.ink, PAL.night, mix(PAL.g1, PAL.brown_dd, 0.5), mix(PAL.g2, PAL.brown_d, 0.4), mix(PAL.g4, PAL.tan, 0.2), PAL.g5], 8);
const HILL = rampStops([PAL.night, mix(PAL.night, PAL.blue_dd, 0.7), PAL.blue_dd, mix(PAL.g2, PAL.blue_d, 0.6), PAL.g3, PAL.g4], 8);
const WOOD = rampStops([PAL.ink, PAL.brown_dd, PAL.wood_d, PAL.wood, PAL.wood_l], 6);
const SPILL = U(mix(PAL.mustard, PAL.fluor_d, 0.3));
const LITWIN = rampStops([mix(PAL.green_dd, PAL.night, 0.3), mix(PAL.mustard_d, PAL.green_d, 0.5), mix(PAL.mustard, PAL.fluor_d, 0.45), mix(PAL.yellow_l, PAL.fluor, 0.5)], 6);
const REFL_TINT = U(PAL.blue_dd);

// ---- layout -------------------------------------------------------------------------------------
const GROUND = 190;                 // base of the facade
const WING_TOP = 128, PAV_TOP = 104;
const PAV = { x0: 318, x1: 404 }, PCX = 361;
const WEST = { x0: 150, x1: 318 }, EAST = { x0: 404, x1: 480 };
const BAYS = [171, 202, 233, 264, 295, 425, 456, 487];
const LIT = { bay: 425, k: 1 };     // middle window of the east wing's first bay, second floor
const MOON = { x: 64, y: 30 };
const HORIZON = 178;                // eye level in the lot (perspective of the stall lines)
const AXIS = 192;                   // puddles mirror the scene about the facade's base line
const OAK = { x: 84, y: 208 };
const LAMP = { x: 136, y: 240 };
let litOn = true;

// logo box (UI): keep sky texture quiet here
const logoQuiet = (x, y) => smooth(0, 1, Math.min((x - 110) / 30, (370 - x) / 30, (y - 30) / 20, (112 - y) / 18));

function inFacade(x, y) {
  if (y >= GROUND) return false;
  if (x >= PAV.x0 - 6 && x < PAV.x1 && y >= PAV_TOP - 16) return true;
  if (x >= WEST.x0 && y >= WING_TOP - 2) return true;
  return false;
}
function mkR(seed) { let i = 0; return () => h01(i++, seed, 991); }

// ---- painters -----------------------------------------------------------------------------------
function paintSky(b, F) {
  for (let y = 0; y < 150; y++) for (let x = 0; x < W; x++) {
    const q = 1 - 0.75 * logoQuiet(x, y);
    const c = fbm(x / 70 + y / 300, y / 22, 11, 4);                 // stretched cloud banks
    const c2 = fbm(x / 26, y / 11, 23, 3);
    const dm = Math.hypot((x - MOON.x) / 1.35, y - MOON.y);
    const glow = Math.exp(-dm / 46);
    let v;
    if (!F) {
      v = 0.07 + 0.1 * (y / 150) + 0.5 * glow * (0.55 + 0.6 * c) + q * ((c - 0.5) * 0.18 + (c2 - 0.5) * 0.06);
      v += 0.05 * clamp01((x - 380) / 100) * clamp01(1 - y / 60) * (c - 0.3);   // a lit cloud edge top-right
      v += 0.1 * Math.exp(-Math.max(0, 132 - y) / 16) * (0.7 + 0.3 * c);            // Pottsville's glow under the clouds
      if (dm < 9) v = Math.max(v, 0.62 + 0.3 * (1 - dm / 9) - 0.25 * c2);         // the moon, smothered in cloud
      b.px(x, y, shade(SKY, clamp01(v), x, y));
    } else {
      v = 0.35 + 0.55 * c + 0.12 * (c2 - 0.5) - 0.2 * (y / 150) + 0.25 * Math.exp(-Math.abs(x - 34) / 40);
      b.px(x, y, shade(CLOUD_F, clamp01(v), x, y));
    }
  }
  if (F) { // the bolt itself, far left behind the oak
    const r = mkR(5);
    const seg = (x0, y0, len, kids) => {
      let cx = x0, cy = y0;
      for (let i = 0; i < len; i++) {
        const nx = cx + Math.round((r() - 0.45) * 5), ny = cy + 3 + Math.round(r() * 3);
        b.line(cx, cy, nx, ny, U(PAL.white)); b.line(cx + 1, cy, nx + 1, ny, U(PAL.moon_l));
        if (kids && r() < 0.2) seg(nx, ny, 4 + (r() * 6 | 0), false);
        cx = nx; cy = ny;
        if (cy > 125) break;
      }
    };
    seg(30, 0, 40, true);
  }
}

function paintHills(b, F) {
  // culm banks: the coal-waste mountains of Schuylkill County, black against the clouds
  const top = (x) => Math.min(
    GROUND, 112 + 0.13 * Math.abs(x - 38) ** 1.08 + 3 * vnoise(x / 9, 1, 4),
    121 + 0.22 * Math.abs(x - 132) + 2 * vnoise(x / 7, 2, 5),
    129 + 0.08 * Math.abs(x - 470),
  );
  for (let x = 0; x < W; x++) {
    const t = Math.round(top(x));
    for (let y = t; y < GROUND + 4; y++) {
      if (inFacade(x, y)) continue;
      const v = F ? 0.42 + 0.1 * vnoise(x / 5, y / 3, 9) - 0.1 * ((y - t) / 30) : 0.16 + 0.06 * vnoise(x / 6, y / 4, 9) - 0.04 * ((y - t) / 30) + (y === t ? 0.06 : 0);
      b.px(x, y, shade(HILL, clamp01(v), x, y));
    }
  }
}

function brickAt(x, y, base, F) {
  const course = y % 3, cidx = (y / 3) | 0;
  const joint = (x + (cidx & 1) * 3) % 7 === 0;
  let v = base + (vnoise(((x + (cidx & 1) * 3) / 7) | 0, cidx, 31) - 0.5) * (F ? 0.07 : 0.05);
  if (course === 0 || joint) v -= F ? 0.12 : 0.04;
  if (course === 1 && !joint) v += F ? 0.03 : 0.01;
  // rain-darkened streaks running down from the sills, soot under the cornice
  v -= (F ? 0.06 : 0.04) * fbm(x / 3, y / 18, 77, 2);
  return shade(BRICK, clamp01(v), x, y);
}
// stone values are authored for the flash; the night pass pulls them down toward the dark
let DIM = 1;
function stoneAt(x, y, v) { return shade(STONE, clamp01(v * DIM + (vnoise(x / 2, y / 2, 41) - 0.5) * 0.07), x, y); }
const wingLit = (x, y, F) => (F ? 0.66 - 0.1 * ((y - 100) / 90) : 0.2 + 0.05 * (1 - (y - 100) / 90) - 0.05 * clamp01((x - 300) / 180));

function paintFacade(b, F) {
  DIM = F ? 1 : 0.62;
  const lit = (x, y) => wingLit(x, y, F);
  for (const wing of [WEST, EAST]) {
    for (let y = WING_TOP; y < GROUND; y++) for (let x = wing.x0; x < Math.min(W, wing.x1); x++) b.px(x, y, brickAt(x, y, lit(x, y), F));
    // coping + cornice, string course, water table
    for (let x = wing.x0; x < Math.min(W, wing.x1); x++) {
      b.px(x, WING_TOP - 2, stoneAt(x, WING_TOP - 2, 0.85));
      b.px(x, WING_TOP - 1, stoneAt(x, WING_TOP - 1, 0.6));
      b.px(x, WING_TOP, stoneAt(x, WING_TOP, 0.3));
      b.px(x, 156, stoneAt(x, 156, 0.72)); b.px(x, 157, stoneAt(x, 157, 0.45));
      for (let y = 183; y < 186; y++) b.px(x, y, stoneAt(x, y, 0.7 - (y - 183) * 0.15));
    }
    // shallow buttresses between bays, with stepped stone caps
    for (const cx of BAYS) {
      for (const px of [cx - 15, cx + 16]) {
        if (px < wing.x0 + 1 || px + 3 > wing.x1) continue;
        for (let y = WING_TOP + 3; y < GROUND; y++) {
          b.px(px, y, brickAt(px, y, lit(px, y) + (F ? 0.18 : 0.06), F));
          b.px(px + 1, y, brickAt(px + 1, y, lit(px, y) + (F ? 0.05 : 0.02), F));
          b.px(px + 2, y, brickAt(px + 2, y, lit(px, y) - (F ? 0.15 : 0.05), F));
        }
        for (const cy of [WING_TOP + 3, 152]) { b.hline(px - 1, cy, 4, stoneAt(px, cy, 0.8)); b.hline(px - 1, cy + 1, 4, stoneAt(px, cy, 0.42)); }
      }
    }
  }
  // west wing end: a corner pier in stone quoins
  for (let y = WING_TOP - 2; y < GROUND; y++) for (let x = WEST.x0; x < WEST.x0 + 4; x++) {
    const q = ((y / 4) | 0) % 2 ? 4 : 3;
    b.px(x, y, x - WEST.x0 < q ? stoneAt(x, y, 0.55 + (x === WEST.x0 ? 0.12 : 0) - ((y % 4) === 0 ? 0.12 : 0)) : brickAt(x, y, lit(x, y), F));
  }
  // windows: grouped in threes in stone surrounds
  let wi = 0;
  for (const cx of BAYS) {
    if (cx - 9 < WEST.x0 + 3) continue;
    for (const [wy, wh] of [[134, 17], [161, 19]]) {
      for (let k = 0; k < 3; k++) {
        const x0 = cx - 8 + k * 6;
        if (x0 > W) continue;
        paintWindow(b, x0, wy, 5, wh, F, wi++, litOn && cx === LIT.bay && k === LIT.k && wy === 134);
      }
      b.hline(cx - 9, wy - 1, 19, stoneAt(cx, wy - 1, 0.6));
      b.hline(cx - 10, wy + wh, 21, stoneAt(cx, wy + wh, 0.8));
      b.hline(cx - 10, wy + wh + 1, 21, stoneAt(cx, wy + wh + 1, 0.3));
      for (let y = wy; y < wy + wh; y++) { b.px(cx - 9, y, stoneAt(cx - 9, y, 0.55)); b.px(cx + 9, y, stoneAt(cx + 9, y, 0.4)); }
      for (const mx of [cx - 3, cx + 3]) for (let y = wy; y < wy + wh; y++) b.px(mx, y, stoneAt(mx, y, 0.45));
    }
    for (let k = 0; k < 2; k++) { const x0 = cx - 6 + k * 8; b.rect(x0, 187, 5, 3, shade(GLASS, F ? 0.3 : 0.05, x0, 187)); }
  }
  paintPavilion(b, F);
  if (litOn && !F) paintSpill(b);
}

function paintWindow(b, x0, y0, w, h, F, idx, lit) {
  const kind = lit ? 'lit' : [0, 3, 7, 12, 16, 21].includes(idx) ? 'board' : [5, 10, 19, 26].includes(idx) ? 'broken' : 'glass';
  const tr = y0 + Math.round(h * 0.32);    // transom bar
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    let c;
    if (kind === 'board') {
      const plank = ((x - x0) / 2) | 0;
      c = shade(WOOD, clamp01((F ? 0.62 : 0.17) + (vnoise(plank, y / 6, 8) - 0.5) * 0.2 - (x - x0 === w - 1 ? 0.08 : 0)), x, y);
      if (y === y0 + 2 || y === y0 + h - 3) c = shade(WOOD, F ? 0.4 : 0.08, x, y); // nailed battens
    } else if (kind === 'lit') {
      const cx = x0 + w / 2, cy = y0 + h * 0.62;
      const v = 0.9 - 0.1 * Math.hypot(x - cx, (y - cy) * 0.6) / 3 - (y < tr ? 0.25 : 0);
      c = shade(LITWIN, clamp01(F ? 0.45 : v), x, y);
    } else {
      // dark glass, a sky reflection sliding across the upper panes
      const refl = (y < tr ? 0.32 : 0.14) + 0.22 * clamp01(1 - (x - x0 + (y - y0) * 0.5) / 5) * (y < tr + 4 ? 1 : 0.4);
      c = shade(GLASS, clamp01((F ? 0.48 : 0.06) + (F ? 0.35 : 0.42) * refl), x, y);
      if (kind === 'broken' && vnoise((x - x0) * 0.9, (y - y0) * 0.5, idx) > 0.5 && y > tr) c = U(PAL.ink);
    }
    b.px(x, y, c);
  }
  if (kind !== 'board') b.hline(x0, tr, w, stoneAt(x0, tr, 0.4));
  if (lit) b.vline(x0 + 2, tr + 1, h - (tr - y0) - 2, shade(LITWIN, 0.45, x0 + 2, y0)); // sash bar against the light
}
function paintSpill(b) {
  const x0 = LIT.bay - 8 + LIT.k * 6, y0 = 134, w = 5, h = 17;
  for (let y = y0 - 5; y < y0 + h + 7; y++) for (let x = x0 - 6; x < x0 + w + 6; x++) {
    if (x >= x0 && x < x0 + w && y >= y0 && y < y0 + h) continue;
    const d = Math.hypot((x - (x0 + w / 2)) / 1.3, y - (y0 + h * 0.6));
    const a = 0.65 * clamp01(1 - d / 10);
    const o = b.get(x, y);
    if (o && a > bay(x, y)) b.px(x, y, mixU(o, SPILL, d < 5 ? 0.4 : 0.22));
  }
}

function paintPavilion(b, F) {
  const { x0, x1 } = PAV;
  const lit = (x, y) => (F ? 0.7 - 0.1 * ((y - 100) / 90) : 0.21 + 0.05 * (1 - (y - 100) / 90));
  // the return (west face of the projecting pavilion) catches the moon
  for (let y = PAV_TOP; y < GROUND; y++) for (let x = x0 - 6; x < x0; x++) b.px(x, y, brickAt(x, y, lit(x, y) + 0.08, F));
  for (let y = PAV_TOP; y < GROUND; y++) for (let x = x0; x < x1; x++) b.px(x, y, brickAt(x, y, lit(x, y) - 0.02, F));
  for (let y = PAV_TOP; y < GROUND; y++) b.px(x0 - 1, y, brickAt(x0, y, lit(x0, y) - 0.12, F)); // corner shadow line
  // crenellated parapet with coping
  for (let x = x0 - 6; x < x1; x++) {
    b.px(x, PAV_TOP, stoneAt(x, PAV_TOP, 0.85)); b.px(x, PAV_TOP + 1, stoneAt(x, PAV_TOP + 1, 0.55)); b.px(x, PAV_TOP + 2, stoneAt(x, PAV_TOP + 2, 0.28));
  }
  for (let mx = x0 + 6; mx < x1 - 8; mx += 10) {
    for (let y = PAV_TOP - 5; y < PAV_TOP; y++) for (let x = mx; x < mx + 6; x++) b.px(x, y, brickAt(x, y, lit(x, y), F));
    b.hline(mx - 1, PAV_TOP - 6, 8, stoneAt(mx, PAV_TOP - 6, 0.9));
    b.hline(mx - 1, PAV_TOP - 5, 8, stoneAt(mx, PAV_TOP - 5, 0.45));
  }
  // corner buttresses rising into pinnacles
  for (const bx of [x0, x1 - 7]) {
    for (let y = PAV_TOP - 8; y < GROUND; y++) for (let x = bx; x < bx + 7; x++) {
      const step = y > 150 ? 0 : y > 120 ? 1 : 2;
      if (x < bx + step || x >= bx + 7 - step) continue;
      const side = x - bx - step;
      b.px(x, y, stoneAt(x, y, 0.55 + (side === 0 ? 0.22 : side >= 4 - step * 2 ? -0.12 : 0) - (((y + 1) % 6) === 0 ? 0.1 : 0)));
    }
    for (let y = PAV_TOP - 16; y < PAV_TOP - 8; y++) {   // pinnacle
      const half = Math.round((y - (PAV_TOP - 16)) / 3);
      for (let x = bx + 3 - half; x <= bx + 3 + half; x++) b.px(x, y, stoneAt(x, y, 0.62 + (x < bx + 3 ? 0.18 : -0.08)));
    }
    for (const cy of [120, 150]) b.hline(bx, cy, 7, stoneAt(bx, cy, 0.9));
  }
  // datestone in the parapet
  b.rect(PCX - 8, PAV_TOP + 4, 17, 7, (x, y) => stoneAt(x, y, 0.55));
  text35(b, PCX - 7, PAV_TOP + 5, '1923', (x, y) => stoneAt(x, y, 0.2));
  // the great tracery window (two lancets under a pointed arch)
  const wx0 = PCX - 14, wx1 = PCX + 14, wy0 = 113, wy1 = 144, spring = 122;
  for (let y = wy0 - 2; y < wy1 + 2; y++) for (let x = wx0 - 2; x < wx1 + 2; x++) {
    const archY = y < spring ? spring - Math.sqrt(Math.max(0, 15.5 ** 2 - (x + 0.5 - PCX) ** 2)) * 0.62 : -1;
    const inside = y >= wy0 && y < wy1 && x >= wx0 && x < wx1 && (y >= spring || y >= archY);
    const frame = y >= wy0 - 2 && x >= wx0 - 2 && x < wx1 + 2 && (y >= spring || y >= archY - 2);
    if (inside) {
      const mull = x === PCX || x === PCX - 1 || y === 132;
      const refl = clamp01(1 - (x - wx0 + (y - wy0) * 0.7) / 14);
      b.px(x, y, mull ? stoneAt(x, y, 0.42) : shade(GLASS, clamp01((F ? 0.5 : 0.05) + 0.38 * refl * (y < 132 ? 1 : 0.5)), x, y));
    } else if (frame) b.px(x, y, stoneAt(x, y, 0.66));
  }
  // frieze with the motto
  const fy = 148;
  for (let y = fy; y < fy + 9; y++) for (let x = x0 + 7; x < x1 - 7; x++) b.px(x, y, stoneAt(x, y, 0.72 - (y === fy + 8 ? 0.3 : 0) + (y === fy ? 0.12 : 0)));
  const motto = 'NEMO RELINQUATUR';
  const tx = PCX - Math.floor(text35Width(motto) / 2);
  text35(b, tx + 1, fy + 3, motto, (x, y) => stoneAt(x, y, 0.95));   // lit lower lip of each cut
  text35(b, tx, fy + 2, motto, (x, y) => stoneAt(x, y, 0.16));
  // door surround (Tudor arch) and the chained double doors
  const dx0 = PCX - 16, dx1 = PCX + 16, dy0 = 159;
  for (let y = dy0; y < GROUND; y++) for (let x = dx0; x < dx1; x++) b.px(x, y, stoneAt(x, y, 0.6 + (x < dx0 + 2 ? 0.12 : 0)));
  const ox0 = PCX - 12, ox1 = PCX + 12, oy0 = 164;
  for (let y = oy0; y < GROUND; y++) for (let x = ox0; x < ox1; x++) {
    const ay = oy0 + 5 - Math.round(Math.sqrt(Math.max(0, 1 - ((x + 0.5 - PCX) / 12) ** 2)) * 5);
    if (y < ay) continue;
    const leaf = x < PCX ? 0 : 1, lx = x - (leaf ? PCX : ox0);
    const v = (F ? 0.55 : 0.12) + (lx === 0 ? 0.06 : 0) - (y < ay + 1 ? 0.1 : 0);
    const pane = y >= 170 && y < 177 && lx >= 3 && lx < 9;
    if (pane) b.px(x, y, shade(GLASS, F ? 0.25 : 0.03, x, y));
    else b.px(x, y, shade(WOOD, clamp01(v + (((lx === 2 || lx === 9) && y > 179) ? -0.08 : 0)), x, y));
  }
  b.vline(PCX, oy0, GROUND - oy0, U(PAL.ink));
  // chain looped through the pulls + padlock
  for (let i = -7; i <= 7; i++) {
    const cy = 181 + Math.round((i * i) / 14);
    b.px(PCX + i, cy, i % 2 ? U(F ? PAL.g6 : PAL.g3) : U(F ? PAL.g4 : PAL.g2));
  }
  b.px(PCX - 1, 183, U(F ? PAL.g5 : PAL.g3)); b.rect(PCX - 1, 184, 3, 3, U(F ? PAL.g4 : PAL.g2));
  // steps spilling down to the walk
  for (let s = 0; s < 4; s++) {
    const y = GROUND + s * 2, half = 19 + s * 3;
    for (let x = PCX - half; x < PCX + half; x++) {
      b.px(x, y, stoneAt(x, y, 0.72 - s * 0.06));
      b.px(x, y + 1, stoneAt(x, y + 1, 0.3));
    }
  }
}

function paintGround(b, F) {
  const src = b.clone();     // for mirrored reflections
  // lawn strip before the facade (dead, flattened by rain)
  for (let y = GROUND; y < 200; y++) for (let x = 0; x < W; x++) {
    if (y < GROUND + 8 && Math.abs(x - PCX) < 19 + ((y - GROUND) >> 1) * 3) continue;
    const blade = vnoise(x * 0.9, y * 0.3, 61);
    b.px(x, y, shade(GRASS, clamp01((F ? 0.5 : 0.07) + (blade - 0.5) * (F ? 0.3 : 0.12) - (y - GROUND) * 0.006), x, y));
  }
  // sidewalk + curb
  for (let x = 0; x < W; x++) {
    for (let y = 200; y < 204; y++) b.px(x, y, stoneAt(x, y, (F ? 0.62 : 0.3) + (y === 200 ? 0.1 : 0) - ((x % 23) === 0 ? 0.12 : 0)));
    b.px(x, 204, stoneAt(x, 204, F ? 0.82 : 0.45));
    b.px(x, 205, stoneAt(x, 205, F ? 0.3 : 0.1));
  }
  // asphalt with a wet sheen that brightens toward the glancing far side
  for (let y = 206; y < H; y++) for (let x = 0; x < W; x++) {
    const far = 1 - (y - 206) / 64;
    const grain = h01(x, y, 5);
    let v = (F ? 0.42 : 0.12) + (F ? 0.25 : 0.05) * far + (fbm(x / 40, y / 8, 91, 3) - 0.5) * 0.12 + (grain > 0.97 ? 0.1 : 0);
    if (!F) v += 0.12 * Math.exp(-Math.abs(x - 96 - (y - 206) * 0.25) / 20) * far;     // the moon smeared down the lot
    b.px(x, y, shade(ASPH, clamp01(v), x, y));
  }
  // faded stall lines converging on the eye-level vanishing point
  for (let k = -4; k <= 4; k++) {
    const xb = 240 + k * 100;
    for (let y = 208; y < H; y++) {
      const t = (y - HORIZON) / (H - HORIZON);
      const x = Math.round(240 + (xb - 240) * t);
      if (vnoise(y / 3, k * 9, 13) < 0.38) continue;
      b.px(x, y, shade(STONE, F ? 0.7 : 0.26, x, y));
      if (y > 236) b.px(x + 1, y, shade(STONE, F ? 0.62 : 0.2, x + 1, y));
    }
  }
  // cracks (two glowing faintly with the mine fire beneath)
  for (const [sx, sy, len, seed, glow] of [[300, 226, 70, 3, true], [70, 214, 50, 4, false], [418, 250, 46, 6, false], [20, 252, 40, 9, false], [236, 252, 36, 10, true]]) {
    let x = sx, y = sy;
    const r = mkR(seed);
    for (let i = 0; i < len; i++) {
      b.px(x, y, U(PAL.ink));
      if (glow && i > 8 && i < len - 10 && r() < 0.45) b.px(x, y, U(F ? PAL.fire_d : PAL.fire_dd));
      if (glow && i > 14 && i < 30 && r() < 0.35) b.px(x, y, U(PAL.fire_d));
      x += r() < 0.75 ? 1 : 0; y += r() < 0.3 ? 1 : r() < 0.1 ? -1 : 0;
    }
  }
  // puddles mirror the scene about the facade's base line (rippled, darkened, edged)
  for (const p of PUDDLES) {
    const rr = mkR(p.x);
    const edge = [];
    for (let i = 0; i < 16; i++) edge.push(0.82 + rr() * 0.3);
    b.ellipse(p.x, p.y, p.rx + 2, p.ry + 1, (x, y) => {
      const ang = Math.atan2((y - p.y) * (p.rx / p.ry), x - p.x);
      const k = ((ang / (Math.PI * 2) + 1) % 1) * 16, i = k | 0, f = k - i;
      const lim = edge[i] + (edge[(i + 1) % 16] - edge[i]) * f;
      const d = Math.hypot((x - p.x) / (p.rx + 2), (y - p.y) / (p.ry + 1));
      if (d > lim) return 0;
      const ry = 2 * AXIS - y, rx = x + Math.round(Math.sin(y * 2.7 + x * 0.05) * 1.2);
      let c = src.get(rx, ry) || U(PAL.night);
      c = mixU(c, REFL_TINT, F ? 0.2 : 0.5);
      if (d > lim - 0.1) c = mixU(c, U(PAL.ink), 0.3);
      if (((y + (x >> 3)) & 3) === 0 && h01(x, y, 3) < 0.25) c = mixU(c, U(PAL.moon), 0.35);   // ripple glints
      return c;
    });
  }
  // the lit window smeared down the wet asphalt toward its puddle
  if (!F && litOn) {
    const wx = LIT.bay - 8 + LIT.k * 6 + 2;
    for (let y = 206; y < 246; y++) {
      if (h01(wx, y, 17) < 0.45) continue;
      const a = 0.7 * (1 - (y - 206) / 40);
      if (a > bay(wx, y)) b.px(wx, y, mixU(b.get(wx, y), SPILL, 0.4));
      if (a * 0.5 > bay(wx + 1, y)) b.px(wx + 1, y, mixU(b.get(wx + 1, y), SPILL, 0.22));
    }
  }
}
// ground mist pooled along the base of the building; mine-fire warmth over the glowing cracks;
// wet leaves blown across the lot
function paintMist(b, F) {
  // a value lift (two dithered steps) rather than a flat fog color, so the texture underneath survives
  const fog = U(F ? PAL.moon_l : mix(PAL.g3, PAL.blue_l, 0.3));
  for (let y = 160; y < 214; y++) for (let x = 0; x < W; x++) {
    const band = Math.exp(-(((y - 192) / 11) ** 2));
    const n = smooth(0.35, 0.75, fbm(x / 46 + y / 60, y / 9, 404, 3));
    const a = band * n * (F ? 0.5 : 0.8);
    const lv = Math.floor(a * 3 + bay(x, y) - 0.5);
    if (lv > 0) b.px(x, y, mixU(b.get(x, y), fog, lv * 0.12));
  }
  if (!F) for (const [cx, cy] of [[318, 230], [252, 256]]) {
    for (let y = cy - 10; y < cy + 6; y++) for (let x = cx - 18; x < cx + 22; x++) {
      const d = Math.hypot((x - cx) / 2.2, y - cy);
      const a = 0.45 * Math.exp(-d / 4);
      if (a > bay(x, y)) b.px(x, y, mixU(b.get(x, y), U(PAL.fire_d), 0.45));
    }
  }
  const r = mkR(1018);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(r() * W), y = 201 + Math.floor((r() ** 1.5) * 68);
    const c = U(F ? pickC(r, [PAL.mustard, PAL.rust, PAL.tan]) : pickC(r, [PAL.mustard_d, PAL.brown_d, PAL.brown]));
    b.px(x, y, c); if (r() < 0.5) b.px(x + 1, y, c); if (r() < 0.25) b.px(x, y - 1, c);
  }
}
const pickC = (r, a) => a[Math.floor(r() * a.length)];

const PUDDLES = [
  { x: 426, y: 240, rx: 34, ry: 5 }, { x: 96, y: 232, rx: 40, ry: 5 }, { x: 300, y: 216, rx: 26, ry: 3 },
  { x: 246, y: 260, rx: 44, ry: 6 }, { x: 30, y: 262, rx: 26, ry: 4 },
];

// the dead oak: recursive limbs, moon on the left of the big ones, cicada shells on the trunk
function paintOak(b, F) {
  const r = mkR(1894);
  const segs = [];
  const grow = (x, y, ang, len, w, depth) => {
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    segs.push([x, y, x2, y2, w, depth]);
    if (depth >= 7 || w < 0.6) return;
    const n = depth < 2 ? 2 : r() < 0.7 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      let a = ang + (i - (n - 1) / 2) * (0.5 + r() * 0.35) + (r() - 0.5) * 0.3;
      const nx = x2 + Math.cos(a) * len * 0.75, ny = y2 + Math.sin(a) * len * 0.75;
      if (nx > 118 && ny > 34 && ny < 110) a -= 0.6;      // keep twigs out of the logo box
      grow(x2, y2, a, len * (0.68 + r() * 0.16), w * 0.62, depth + 1);
    }
  };
  segs.push([OAK.x, OAK.y, OAK.x + 2, 150, 14, -1]);
  grow(OAK.x + 2, 150, -2.25, 30, 7, 0);
  grow(OAK.x + 2, 150, -1.42, 34, 7.5, 0);
  grow(OAK.x + 2, 150, -0.85, 26, 5.5, 1);
  for (const [x0, y0, x1, y1, w] of segs) {
    const fn = (x, y) => {
      const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny) || 1;
      const side = ((x - x0) * nx + (y - y0) * ny) / l / Math.max(1, w / 2);
      let v = F ? 0.12 : 0.16 + (side < -0.35 && w > 2 ? 0.16 : 0) - (side > 0.4 ? 0.06 : 0);
      if (F && side < -0.5 && w > 2) v = 0.3;
      return shade(BARK, clamp01(v + (vnoise(x * 0.7, y * 0.3, 3) - 0.5) * 0.1), x, y);
    };
    b.thick(x0, y0, x1, y1, Math.max(1, w), fn);
  }
  b.poly([[OAK.x - 12, OAK.y + 1], [OAK.x - 5, OAK.y - 10], [OAK.x + 7, OAK.y - 10], [OAK.x + 15, OAK.y + 1]], (x, y) => shade(BARK, F ? 0.12 : 0.15 + (x < OAK.x - 3 ? 0.08 : 0), x, y));
  for (let y = 152; y < OAK.y; y++) if (h01(y, 1, 8) < 0.6) b.px(OAK.x + 1 + Math.round(Math.sin(y / 7) * 1.5), y, U(PAL.ink));
  for (const [sx, sy] of [[OAK.x - 2, 176], [OAK.x + 3, 188], [OAK.x - 1, 196], [OAK.x + 4, 166], [OAK.x - 3, 158]]) {
    b.px(sx, sy, U(F ? PAL.amber_l : PAL.amber_d)); b.px(sx, sy + 1, U(F ? PAL.amber : PAL.amber_dd));
  }
  b.ellipse(OAK.x + 2, OAK.y + 2, 22, 3, (x, y) => shade(GRASS, F ? 0.45 : 0.12, x, y));
}

function paintLamp(b, F) {
  const { x, y } = LAMP, top = 122;
  b.ellipse(x + 1, y + 1, 5, 1.5, U(PAL.ink));
  b.rect(x - 2, y - 6, 5, 6, (i, j) => shade(STONE, (F ? 0.4 : 0.12) + (i === x - 2 ? 0.1 : 0), i, j));
  for (let j = top; j < y - 6; j++) { b.px(x, j, U(F ? PAL.g4 : PAL.g2)); b.px(x + 1, j, U(F ? PAL.g2 : PAL.shadow)); }
  // mast arm and a dead cobra-head; one shard of its glass still catches the sky
  for (let i = 0; i < 13; i++) { const yy = top - Math.round(Math.sqrt(i) * 1.6); b.px(x + i, yy, U(F ? PAL.g4 : PAL.g2)); b.px(x + i, yy + 1, U(PAL.shadow)); }
  b.rect(x + 10, top - 8, 9, 3, U(F ? PAL.g4 : PAL.g2)); b.hline(x + 10, top - 8, 9, U(F ? PAL.g6 : PAL.g3));
  b.rect(x + 11, top - 5, 7, 1, U(F ? PAL.g3 : PAL.night)); b.px(x + 13, top - 5, U(F ? PAL.white : PAL.blue_l));
}

// ---- assemble -----------------------------------------------------------------------------------
function build(F) {
  const b = new Buf();
  paintSky(b, F);
  paintHills(b, F);
  paintFacade(b, F);
  paintGround(b, F);
  paintMist(b, F);
  paintOak(b, F);
  paintLamp(b, F);
  return b;
}

const layers = once(() => {
  const night = build(false);
  const flash = build(true);
  // the lit window with its light out (a rare beat where it goes dark): facade-only repaint
  litOn = false;
  const fb = new Buf();
  paintFacade(fb, false);
  litOn = true;
  const ox = LIT.bay - 8 + LIT.k * 6 - 6, oy = 128;
  const off = new Buf(17, 30);
  for (let y = 0; y < 30; y++) for (let x = 0; x < 17; x++) off.px(x, y, fb.get(ox + x, oy + y) || night.get(ox + x, oy + y));
  return {
    night: night.toCanvas(), flash: flash.toCanvas(), off: off.toCanvas(), offAt: [ox, oy],
    rain: makeRain([
      { n: 150, len: 3, speed: 240, slant: 0.2, color: 'rgba(110,130,160,0.5)', flash: 'rgba(220,230,255,0.8)' },
      { n: 60, len: 7, speed: 400, slant: 0.24, color: 'rgba(140,160,190,0.55)', flash: 'rgba(240,244,255,0.9)' },
    ], 1996),
    vapor: makeVapor(0, 100, W, 170, [mix(PAL.g1, PAL.blue_d, 0.55), mix(PAL.g2, PAL.blue_d, 0.45), mix(PAL.g3, PAL.blue_l, 0.25)]),
    vaporF: makeVapor(0, 100, W, 170, [mix(PAL.g4, PAL.moon, 0.4), mix(PAL.g5, PAL.moon, 0.5), PAL.moon_l]),
    plumes: makePlumes([
      { x: 304, y: 232, rise: 84, r0: 4, r1: 26, life: 10, a: 0.36, w: 16, wind: 22, spread: 5 },
      { x: 250, y: 256, rise: 70, r0: 4, r1: 22, life: 9, a: 0.3, w: 12, wind: 18, spread: 4 },
      { x: 72, y: 222, rise: 56, r0: 3, r1: 18, life: 9.5, a: 0.24, w: 10, wind: 16, spread: 4 },
      { x: 436, y: 254, rise: 66, r0: 4, r1: 22, life: 10.5, a: 0.3, w: 14, wind: 14, spread: 5 },
    ], 61, 16),
    splash: splashTable(),
  };
});

function splashTable() {
  const n = 46, s = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { s[i * 4] = h01(i, 1, 71); s[i * 4 + 1] = h01(i, 2, 71); s[i * 4 + 2] = h01(i, 3, 71); }
  return s;
}
function drawSplashes(ctx, t, s, F) {
  ctx.fillStyle = F ? 'rgba(230,236,255,0.9)' : 'rgba(150,170,200,0.65)';
  const n = s.length / 4;
  for (let i = 0; i < n; i++) {
    const per = 0.7 + s[i * 4 + 2] * 0.9;
    const ph = (t / per + s[i * 4]) % 1;
    if (ph > 0.22) continue;
    const cyc = Math.floor(t / per + s[i * 4]);
    const x = Math.floor(((s[i * 4 + 1] * 997 + cyc * 0.618) % 1) * W);
    const y = 208 + Math.floor((((s[i * 4 + 2] * 131 + cyc * 0.414) % 1) ** 0.7) * 60);
    if (ph < 0.08) ctx.fillRect(x, y - 1, 1, 1);
    else { const r = 1 + Math.floor(ph * 10); ctx.fillRect(x - r, y, 1, 1); ctx.fillRect(x + r, y, 1, 1); }
  }
}

/** Soft automatic lightning: a double flicker every ~16 s. */
function autoLightning(t) {
  const per = 15.7, k = Math.floor(t / per), ph = t - k * per - (3 + 5 * h01(k, 0, 3));
  if (ph < 0 || ph > 0.9) return 0;
  const a = ph < 0.08 ? 1 : ph < 0.2 ? 0.25 : ph < 0.3 ? 0.75 : Math.max(0, 0.6 * (1 - (ph - 0.3) / 0.6));
  return a * (0.55 + 0.35 * h01(k, 1, 3));
}

export function prepTitle() { layers(); }

export const titleBg = {
  draw(ctx, t = 0, params = {}) {
    const L = layers();
    let flash = params.lightning;
    if (flash === undefined || flash === null) {
      flash = autoLightning(t);
      if (HW.settings?.get?.('reduceFlashing')) flash *= 0.35;
    }
    flash = quant(flash, 6);
    ctx.drawImage(L.night, 0, 0);
    // the lit window goes dark for a beat now and then
    const wk = Math.floor(t / 23), wph = t - wk * 23 - 9;
    if (wph > 0 && wph < (h01(wk, 4, 9) < 0.5 ? 0.35 : 1.1)) ctx.drawImage(L.off, L.offAt[0], L.offAt[1]);
    if (flash > 0) blitA(ctx, L.flash, flash);
    const v = flash > 0.4 ? L.vaporF : L.vapor;
    v.clear(); L.plumes(v, t); v.render(ctx);
    L.rain(ctx, t, { boost: flash > 0.3 ? 1 : 0 });
    drawSplashes(ctx, t, L.splash, flash > 0.3);
  },
};
