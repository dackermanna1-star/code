// locker_slits: Tess's view from inside a gym locker. The dark steel door with five vent slits, lit only
// by what comes through them; beyond, the locker room under one tube, and the Colonel passing so close
// that only fragments show — wool, a brass button sunk in a fold of flesh, the crimson sash, the pale
// belly where the coat won't close (a medal pinned through the skin), a ringed fist knocking on the
// doors one by one, closer. faceIn slides his small face in until one half-lidded eye fills the vent.
import { HField } from './colonel_gbuf.js';
import { FACE_EXPR } from './colonel_face.js';
import { Cel, celMat, light, lightCel, quantize, outline, gradeLUT, packTones, packedToCanvas, domePoly, bay, h01, vn, fbm, clamp, quad } from './colonel_cg_cel.js';
import { CM, sculptHand, detailHand, paintNails, paintRings, sculptCuff, patchLUT } from './colonel_cg_handkit.js';
import { FM, textureDough, headCel, liftRing } from './colonel_cg_face.js';
import { makeCanvas, ctxOf, rng } from './util.js';

const W = 480, H = 270;
const SLITS = 5, SX0 = 112, SX1 = 368, SY0 = 72, SH = 15, SP = 26;
export const LOCKER = { eyeX: 236, eyeY: SY0 + 2 * SP + 2, slits: Array.from({ length: SLITS }, (_, k) => [SX0, SY0 + k * SP, SX1 - SX0, SH]) };

// ---------------------------------------------------------------------------------------- materials
const L = { STEEL: 140, STEEL_D: 141, RUST: 142, TAPE: 143, HOOK: 144, LOCK_O: 145, LOCK_OD: 146, TILE: 147, BENCH: 148, WALLO: 149, RIB_R: 150, RIB_W: 151, RIB_B: 152, BRONZE: 153, TUBE: 154, SASH: 155 };
const T6 = [0.1, 0.24, 0.42, 0.62, 0.84];
const T7 = [0.08, 0.2, 0.35, 0.53, 0.73, 0.94];
celMat(L.STEEL, { ramp: ['#010202', '#060d09', '#0e1a13', '#18291f', '#253a2d', '#36503f', '#4c6a55'], th: T7, dith: 0.04, seam: false, line: 0, gap: 3 });
celMat(L.STEEL_D, { ramp: ['#000101', '#020403', '#060a08', '#0c140f', '#142018', '#1e2e22'], th: T6, dith: 0.04, seam: false });
celMat(L.RUST, { ramp: ['#030201', '#0c0604', '#1c0e08', '#2e180c', '#422412', '#58321a'], th: T6, dith: 0.03, seam: false });
celMat(L.TAPE, { ramp: ['#060504', '#141210', '#2a2620', '#463f34', '#665c4c', '#8a7e68'], th: T6 });
celMat(L.HOOK, { ramp: ['#020202', '#08080a', '#141418', '#24242a', '#3a3a42', '#5a5a64'], th: T6, line: 0, gap: 2 });
celMat(L.LOCK_O, { ramp: ['#060a08', '#0e1712', '#18261e', '#24382c', '#34503e', '#4a6a54', '#668a70'], th: T7, line: 0, gap: 4 });
celMat(L.LOCK_OD, { ramp: ['#030504', '#08100c', '#101a14', '#18261e', '#223428'], th: [0.12, 0.3, 0.55, 0.8] });
celMat(L.TILE, { ramp: ['#0c0c0a', '#1e1e1a', '#363630', '#54524a', '#787468', '#9c988a'], th: T6, dith: 0.04, seam: false });
celMat(L.BENCH, { ramp: ['#0e0806', '#22150c', '#3e2716', '#5c3c22', '#7c5532', '#9c7046'], th: T6, line: 0, gap: 4 });
celMat(L.WALLO, { ramp: ['#14120c', '#2c281c', '#4c4632', '#6e664a', '#908764', '#aea47e'], th: T6, dith: 0.04, seam: false });
celMat(L.RIB_R, { ramp: ['#100204', '#30060c', '#5a0c16', '#861824', '#ae2a34', '#cc4a4e'], th: T6, line: 0, gap: 1 });
celMat(L.RIB_W, { ramp: ['#141414', '#383634', '#605c56', '#8a847a', '#b2aca0', '#d6d0c2'], th: T6, line: 0, gap: 1 });
celMat(L.RIB_B, { ramp: ['#020408', '#060c18', '#0e1a30', '#1a2c4c', '#2c446c', '#465e8a'], th: T6, line: 0, gap: 1 });
celMat(L.BRONZE, { ramp: ['#0c0804', '#24180a', '#443014', '#664a20', '#8a6a34', '#ae8e50', '#d0b47a'], th: T7, line: 0, gap: 1, spec: { at: 0.95, w: 0.05, k: 0.5 } });
celMat(L.SASH, { ramp: ['#0e0204', '#2c060c', '#540c18', '#7e1424', '#a42234', '#c8424a', '#e06a66'], th: T7, line: 0, gap: 3 });
celMat(L.TUBE, { ramp: ['#8ea292', '#bcd2be', '#e2f2de', '#f8fff6'], th: [0.3, 0.6, 0.85], flat: 1 });
const DOUGHS = [FM.DOUGH, FM.DOUGH_R, FM.DOUGH_Y, FM.DOUGH_D];

const ROOM = light({ L: [0.12, -0.82, 0.56], amb: 0.2, key: 0.8, shadow: 0.6, steps: 24 });
const NEAR = light({ L: [0.15, -0.86, 0.48], amb: 0.1, key: 0.95, shadow: 0.55, steps: 30, rim: [-0.6, -0.6, 0.25] });
const GRADE = { lit: '#eefff0', litGain: 1.0, dark: '#5a6a64', darkGain: 0.85, desat: 0.12, crush: 0.3, abyss: '#020403' };
let LUT = null;
const lut = () => LUT || (LUT = patchLUT(gradeLUT(GRADE), false));
function render(cel, lt, o = {}) {
  const lev = lightCel(cel, lt, o);
  if (o.post) o.post(lev);
  const sh = outline(cel, quantize(cel, lev), { lit: 0.65 });
  return packedToCanvas(packTones(cel, sh.tone), cel.w, cel.h, o.lut || lut());
}

// ---------------------------------------------------------------------------------- interior (foreground)
export function buildLockerInterior() {
  const cel = new Cel(W, H);
  const r = rng(1979);
  // the door's inner face, flat; the side walls and the shelf above recede into the dark
  cel.poly([[0, 0], [W, 0], [W, H], [0, H]], L.STEEL, { z: 0, n: [0, 0, 1], sid: 1 });
  cel.poly([[0, 0], [34, 18], [34, 252], [0, H]], L.STEEL_D, { z: 2, n: [0.8, 0, 0.6], sid: 2 });
  cel.poly([[W, 0], [W - 34, 18], [W - 34, 252], [W, H]], L.STEEL_D, { z: 2, n: [-0.8, 0, 0.6], sid: 3 });
  cel.poly([[34, 18], [W - 34, 18], [W - 34, 26], [34, 26]], L.STEEL, { z: 3, n: [0, 0.6, 0.8], sid: 4 });
  cel.poly([[34, 222], [W - 34, 222], [W - 34, 230], [34, 230]], L.STEEL, { z: 3, n: [0, -0.6, 0.8], sid: 5 });
  // louvers: the pressed lips around each vent (the lower lip catches the light from outside)
  const glow = new Float32Array(W * H);
  for (const [x, y, w, h] of LOCKER.slits) {
    for (let yy = y - 3; yy < y + h + 3; yy++) for (let xx = x - 4; xx < x + w + 4; xx++) {
      const inside = yy >= y && yy < y + h && xx >= x && xx < x + w;
      const i = cel.idx(xx, yy); if (i < 0) continue;
      if (inside) { cel.mat[i] = 0; continue; }
      const top = yy < y, ny = top ? 0.6 : yy >= y + h ? -0.6 : 0, nx = xx < x ? 0.6 : xx >= x + w ? -0.6 : 0;
      cel.put(xx, yy, L.STEEL, { z: 4, n: [nx, ny, 1], sid: 6, off: (yy === y + h || yy === y + h + 1) ? 2 : yy === y - 1 ? -1 : 0 });
    }
    // light spilling through onto the steel, falling off fast
    for (let yy = y - 24; yy < y + h + 30; yy++) for (let xx = x - 28; xx < x + w + 28; xx++) {
      if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
      const dx = Math.max(0, x - xx, xx - (x + w)), dy = Math.max(0, y - yy, yy - (y + h));
      const d = Math.hypot(dx, dy * 1.3);
      glow[yy * W + xx] = Math.max(glow[yy * W + xx], Math.max(0, 1 - d / 40) ** 1.6);
    }
  }
  // rivets, rust, scratches, a dent, the coat hook, a strip of old tape, someone's initials from 1979
  for (const [x, y] of [[50, 36], [W - 50, 36], [50, 210], [W - 50, 210], [240, 36], [240, 210]]) domePoly(cel, circle(x, y, 2.6), L.HOOK, { R: 2, hgt: 2, z: 6, sid: 7 });
  for (let k = 0; k < 16; k++) { const x = 40 + r() * 400, y = 30 + r() * 210, rr = 2 + r() * 5; for (let yy = Math.floor(y - rr); yy <= y + rr; yy++) for (let xx = Math.floor(x - rr); xx <= x + rr; xx++) { if (Math.hypot(xx - x, (yy - y) * 1.4) + (vn(xx, yy, 2, 9) - 0.5) * 3 < rr && cel.matAt(xx, yy) === L.STEEL) cel.put(xx, yy, L.RUST, { z: 0.5, sid: 1 }); } }
  for (let k = 0; k < 60; k++) { const x = 40 + r() * 400, y = 30 + r() * 210, a = r() * 6.28, Ln = 3 + r() * 14; cel.stroke([[x, y], [x + Math.cos(a) * Ln, y + Math.sin(a) * Ln]], (px, py, t) => { if (t > 0.1 && t < 0.9) cel.shift(px, py, 1); }); }
  for (let yy = 186; yy < 214; yy++) for (let xx = 366; xx < 418; xx++) { const e = ((xx - 392) / 26) ** 2 + ((yy - 200) / 14) ** 2; if (e < 1) { const i = cel.idx(xx, yy); if (cel.mat[i] === L.STEEL || cel.mat[i] === L.RUST) { cel.nx[i] = (xx - 392) / 60; cel.ny[i] = (yy - 200) / 40; } } }
  domePoly(cel, capsule(404, 46, 3.5, 404, 64, 3.5), L.HOOK, { R: 3, hgt: 3, z: 12, sid: 8 });
  domePoly(cel, capsule(404, 64, 3.5, 394, 70, 3), L.HOOK, { R: 3, hgt: 3, z: 12, sid: 8 });
  cel.poly([[70, 44], [116, 40], [117, 47], [71, 51]], L.TAPE, { z: 1, n: [0, 0, 1], sid: 9 });
  carve(cel, 76, 196, 'CM 79');
  for (let i = 0; i < W * H; i++) if (cel.mat[i]) cel.lum[i] = glow[i] * 0.62;
  const lt = light({ L: [0, 0.3, 0.95], amb: 0.03, key: 0.06, shadow: 0, steps: 0,
    falloff: (x, y) => { const d = Math.hypot((x - 240) / 260, (y - 134) / 170); return Math.max(0.15, 1 - d * d); } });
  return render(cel, lt, { noCast: true });
}
const GL = { C: ['111', '100', '100', '100', '111'], M: ['10001', '11011', '10101', '10001', '10001'], 7: ['111', '001', '010', '010', '010'], 9: ['111', '101', '111', '001', '111'], ' ': ['00', '00', '00', '00', '00'] };
function carve(cel, x0, y0, text) {
  let cx = x0;
  for (const ch of text) {
    const g = GL[ch] || GL[' '];
    for (let j = 0; j < 5; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === '1') { cel.shift(cx + i, y0 + j, 1); cel.shift(cx + i, y0 + j + 1, -1); }
    cx += g[0].length + 1;
  }
}
function circle(cx, cy, r, n = 12) { const p = []; for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; }
function capsule(ax, ay, ra, bx, by, rb, n = 8) {
  const a = Math.atan2(by - ay, bx - ax), pts = [];
  for (let k = 0; k <= n; k++) { const t = a + Math.PI / 2 + (k / n) * Math.PI; pts.push([ax + Math.cos(t) * ra, ay + Math.sin(t) * ra]); }
  for (let k = 0; k <= n; k++) { const t = a - Math.PI / 2 + (k / n) * Math.PI; pts.push([bx + Math.cos(t) * rb, by + Math.sin(t) * rb]); }
  return pts;
}

// ---------------------------------------------------------------------------------- what lies outside
function buildRoom() {
  // the girls' locker room under one buzzing tube: lockers opposite, a bench, tile
  const cel = new Cel(W, H);
  cel.poly([[0, 0], [W, 0], [W, 150], [0, 150]], L.WALLO, { z: -60, n: [0, 0, 1], sid: 1 });
  for (let k = 0; k < 9; k++) {
    const x = -20 + k * 58;
    cel.poly([[x, 30], [x + 55, 30], [x + 55, 196], [x, 196]], L.LOCK_O, { z: -40, n: [0, 0, 1], sid: 10 + k });
    cel.stroke([[x, 30], [x, 196]], (px, py) => cel.put(px, py, L.LOCK_OD, { z: -39, sid: 10 + k }));
    for (let j = 0; j < 4; j++) cel.poly([[x + 12, 46 + j * 6], [x + 43, 46 + j * 6], [x + 43, 48 + j * 6], [x + 12, 48 + j * 6]], L.LOCK_OD, { z: -39, n: [0, 0, 1], sid: 10 + k });
    cel.poly([[x + 44, 110], [x + 48, 110], [x + 48, 124], [x + 44, 124]], L.HOOK, { z: -38, n: [0, -0.4, 0.9], sid: 30 + k });
    if (k === 3) for (let yy = 140; yy < 160; yy++) for (let xx = x + 14; xx < x + 40; xx++) if (((xx - x - 27) / 13) ** 2 + ((yy - 150) / 9) ** 2 < 1) { const i = cel.idx(xx, yy); cel.nx[i] = (xx - x - 27) / 30; cel.ny[i] = (yy - 150) / 20; }
  }
  cel.poly([[0, 196], [W, 196], [W, H], [0, H]], L.TILE, { z: -30, n: [0, -0.7, 0.7], sid: 2 });
  for (let x = 0; x < W; x += 18) cel.stroke([[x, 196], [x - 30 + (x - 240) * 0.3, H]], (px, py) => cel.shift(px, py, -1));
  for (let y = 200; y < H; y += 9) cel.stroke([[0, y], [W, y]], (px, py) => cel.shift(px, py, -1));
  cel.poly([[0, 178], [W, 178], [W, 190], [0, 190]], L.BENCH, { z: -20, n: [0, -0.6, 0.8], sid: 3 });
  cel.poly([[0, 190], [W, 190], [W, 195], [0, 195]], L.BENCH, { z: -20, n: [0, 0.5, 0.8], sid: 3, off: -2 });
  return render(cel, ROOM, { noCast: true });
}

const STRIP_W = 1240;
function buildBodyStrip() {
  // what passes the vents, left (leading) to right: wool folds, a button sunk in a fold of flesh, the
  // sash, the pale belly where the coat won't close (a medal pinned through the skin), wool again
  const cel = new Cel(STRIP_W, H);
  const r = rng(1894);
  const hf = new HField(STRIP_W, H, 0.06);
  hf.tube(-60, 140, 150, STRIP_W + 60, 132, 150, { mat: CM.WOOL, z0: 0, z1: 0, k: 0.6 });
  for (let k = 0; k < 14; k++) { const x = 40 + k * 86 + r() * 30; hf.blob(x, 120 + r() * 50, 50 + r() * 26, 90 + r() * 40, 108 + r() * 14, { mat: CM.WOOL, p: 0.6 }); }
  // the fold of flesh the button sank into
  hf.blob(372, 132, 74, 46, 132, { mat: FM.DOUGH, p: 0.6 });
  hf.blob(392, 170, 70, 34, 128, { mat: FM.DOUGH, p: 0.6 });
  // the gap where the coat can't close: a long band of pale belly
  hf.blob(820, 140, 122, 124, 140, { mat: FM.DOUGH, p: 0.55 });
  hf.blob(930, 118, 62, 82, 132, { mat: FM.DOUGH, p: 0.6 });
  hf.finalize();
  for (let k = 0; k < 22; k++) { const x = 30 + r() * (STRIP_W - 60); hf.groove([[x, 0], [x + 30 + r() * 30, 130], [x - 10 + r() * 30, H]], 8 + r() * 6, 10 + r() * 10); }
  hf.fold([[300, 150], [372, 160], [460, 148]], 6, 14);
  hf.fold([[700, 110], [820, 128], [960, 112]], 7, 16);
  hf.fold([[720, 186], [830, 200], [950, 186]], 7, 14);
  cel.fromHF(hf, { sid: 1, mode: 'any', sidFn: (x, y, m) => (m === FM.DOUGH ? 2 : 1) });
  textureDough(cel, rng(77), { faceC: [820, 140], faceR: 120, sweat: 7, hairs: 16, L: NEAR.L });
  for (let i = 0; i < STRIP_W * H; i++) if (cel.mat[i] === CM.WOOL) { const x = i % STRIP_W, y = (i / STRIP_W) | 0; if (h01(x >> 1, y, 42) < 0.06) cel.off[i] -= 1; else if (h01(x, y >> 1, 43) < 0.025) cel.off[i] += 1; }
  // the button, half swallowed by the flesh: a fold of skin lapping over its rim
  { const bx = 372, by = 158, br = 16;
    for (let y = by - br - 4; y <= by + br + 4; y++) for (let x = bx - br - 4; x <= bx + br + 4; x++) {
      const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by) / br, i = cel.idx(x, y); if (i < 0) continue;
      const lip = by - br * 0.35 + Math.sin((x - bx) * 0.2) * 2;
      if (d > 1) { if (d < 1.22 && DOUGHS.includes(cel.mat[i])) cel.off[i] -= 2; continue; }
      if (y < lip) { if (y > lip - 3 && DOUGHS.includes(cel.mat[i])) cel.off[i] += 1; continue; }
      const dome = Math.sqrt(1 - d * d);
      cel.put(x, y, d > 0.74 && d < 0.86 ? CM.VERD : CM.BRASS, { z: cel.z[i] + 2, n: [(x - bx) / br, (y - by) / br, dome + 0.3], sid: 3, fix: -1, off: y < lip + 2 ? -2 : (Math.abs(x - bx) < br * 0.4 && Math.abs(y - by - 2) < 2) ? 1 : 0 });
    } }
  // the crimson sash, broad and straining, crossing the strip diagonally
  for (let x = 480; x < 760; x++) for (let y = 0; y < H; y++) {
    const c = 40 + (x - 480) * 0.62 + Math.sin(x * 0.05) * 4, d = y - c;
    if (Math.abs(d) > 46) continue;
    const i = y * STRIP_W + x; if (!cel.mat[i]) continue;
    const pleat = Math.sin((y - (x - 480) * 0.62) * 0.11 + Math.sin(x * 0.02) * 1.5);
    cel.mat[i] = L.SASH; cel.sid[i] = 4; cel.z[i] += 3;
    cel.off[i] = Math.abs(d) > 42 ? -2 : pleat > 0.6 ? 1 : pleat < -0.7 ? -1 : 0;
  }
  // a medal pinned through a fold of the belly: ribbon, the pin's pucker, the bronze star
  { const mx = 862, my = 96;
    for (let k = 0; k < 3; k++) domePoly(cel, [[mx - 9 + k * 6, my], [mx - 3 + k * 6, my], [mx - 3 + k * 6, my + 26], [mx - 9 + k * 6, my + 26]], [L.RIB_R, L.RIB_W, L.RIB_B][k], { R: 2, hgt: 2, z: 170, sid: 5 + k, tilt: [0, -0.2] });
    for (let yy = my - 4; yy < my + 3; yy++) for (let xx = mx - 14; xx < mx + 14; xx++) { const i = cel.idx(xx, yy); if (i >= 0 && DOUGHS.includes(cel.mat[i])) { const e = ((xx - mx) / 13) ** 2 + ((yy - my + 1) / 4) ** 2; if (e < 1) { cel.mat[i] = FM.DOUGH_R; cel.off[i] = e < 0.3 ? -2 : -1; } } }
    const star = []; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k / 10) * Math.PI * 2, rr = k & 1 ? 5 : 11; star.push([mx + Math.cos(a) * rr, my + 38 + Math.sin(a) * rr]); }
    domePoly(cel, star, L.BRONZE, { R: 4, hgt: 4, z: 172, sid: 9 });
    domePoly(cel, circle(mx, my + 38, 3.5), L.BRONZE, { R: 2, hgt: 3, z: 174, sid: 10 }); }
  const lev = lightCel(cel, NEAR);
  const sh = outline(cel, quantize(cel, lev), { lit: 0.65 });
  return packedToCanvas(packTones(cel, sh.tone), STRIP_W, H, lut());
}

function buildKnock() {
  // a ringed fist, knuckles toward us, knocking on the next lockers along
  const w = 220, h = 230, cel = new Cel(w, h);
  const S = sculptHand(cel, { C: [110, 96], ang: Math.atan2(1, 0.1), s: 0.78, curl: 0.95, z0: 0, side: 1, rings: { 3: 'signet', 2: 'stone' } });
  sculptCuff(cel, S, { back: -330, rise: 40 });
  detailHand(cel, S, { seed: 33, L: NEAR.L, hairs: 4 });
  paintRings(cel, S, { L: NEAR.L });
  paintNails(cel, S, { L: NEAR.L, long: 0.2 });
  return render(cel, NEAR);
}

export function buildLockerOutside(later = (k, f) => f()) {
  const room = buildRoom(), strip = buildBodyStrip();
  let knock = null;
  return {
    draw(ctx, t, phase, faceIn) {
      if (!knock && phase > 0.25) later('knock', () => { if (!knock) knock = buildKnock(); });
      ctx.drawImage(room, 0, 0);
      // he drags along the lockers: the strip enters from the right and slides past, slowing as he nears
      const e = 1 - (1 - phase) * (1 - phase);
      const sx = Math.round(500 - e * (STRIP_W - 120) + Math.sin(t * 1.7) * 2);
      const sy = Math.round(Math.sin(t * 2.1) * 2.5 - (1 - phase) * 8);
      if (phase > 0.02) ctx.drawImage(strip, sx, sy);
      // the knocking fist: one locker over, then the next, closer
      if (phase > 0.5) {
        if (!knock) knock = buildKnock();
        const k = (phase - 0.5) / 0.5;
        const tap = Math.max(0, Math.sin(t * Math.PI * 2 / 0.9)) ** 8;
        const hx = Math.round(-120 + k * 150 - tap * 6 - faceIn * 120), hy = Math.round(18 + tap * 5 - k * 6);
        ctx.drawImage(knock, hx, hy);
      }
    },
  };
}

// ---------------------------------------------------------------------------------- the face at the vents
export function buildSlitFace() {
  // so close that one half-lidded eye fills the central vent; the brow above, cheek & whisker below.
  // Only the band the vents can show is built (it slides in from the right).
  const s = 14, w = 520, h = 176, ex = 350, ey = 72, lid = 0.46, hh = 2.1 * s;
  const P = { ...FACE_EXPR.serene, lidL: lid, lidR: 0.4, gazeL: [0.02, 0.62], gazeR: [0.25, 0.5], glint: true, cx: ex + 6 * s, cy: ey - 0.2 * s, s, seed: 1841, chins: 1, collar: false };
  const cel = headCel(P, { w, h, sweat: 5, hairs: 10, L: [0.12, -0.9, 0.42] });
  const lt = light({ L: [0.12, -0.9, 0.42], amb: 0.07, key: 0.74, shadow: 0.45, steps: 25, spec: 0.9,
    falloff: (x, y) => clamp(1.1 - (Math.abs(y - 72) / 140) ** 2, 0.2, 1.1) });
  const lev = lightCel(cel, lt);
  liftRing(cel, lev);
  // at this distance the heavy lid must stay skin, not glare like the white of the eye
  for (let i = 0; i < w * h; i++) if (cel.mat[i] === FM.FACE || cel.mat[i] === FM.BLUSH || cel.mat[i] === FM.FACE_V) lev[i] *= 0.72;
  const sh = outline(cel, quantize(cel, lev), { lit: 0.6 });
  const canvas = packedToCanvas(packTones(cel, sh.tone), w, h, lut());
  // report the lash line (not the eye centre): the vent shows the band just under the heavy lid
  return { canvas, eyeX: ex, eyeY: Math.round(ey + hh * (1 - 2 * lid)) };
}
