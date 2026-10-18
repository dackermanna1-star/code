// locker_slits: Tess's view from inside a gym locker. The dark steel door with five vent slits, lit only
// by what comes through them; beyond, the locker room under one tube, and the Colonel passing so close
// that only fragments show — wool, a brass button sunk in a fold of flesh, the crimson sash, the pale
// belly where the coat won't close (a medal pinned through the skin), a ringed fist knocking on the
// doors one by one, closer. faceIn slides his small face in until one half-lidded eye fills the vent.
import { HField } from './colonel_gbuf.js';
import { FACE_EXPR } from './colonel_face.js';
import { Cel, celMat, light, lightCel, quantize, outline, gradeLUT, packTones, packedToCanvas, domePoly, bay, h01, vn, clamp } from './colonel_cg_cel.js';
import { CM, Field, patchLUT } from './colonel_cg_handkit.js';
import { FM, textureDough, headCel, liftRing } from './colonel_cg_face.js';
import { makeCanvas, ctxOf, rng } from './util.js';

const W = 480, H = 270;
const SLITS = 5, SX0 = 112, SX1 = 368, SY0 = 72, SH = 15, SP = 26;
export const LOCKER = { eyeX: 236, eyeY: SY0 + SP + 4, slits: Array.from({ length: SLITS }, (_, k) => [SX0, SY0 + k * SP, SX1 - SX0, SH]) };

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
  cel.poly([[0, 0], [W, 0], [W, 200], [0, 200]], L.WALLO, { z: -60, n: [0, 0, 1], sid: 1 });
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
  // the bench: a step or two under the lockers' value — wooden planks (a 1-px dark gap every ~60 px), the
  // grain along them, a 1-px lit top edge and a darker front lip; the tube's light falls off along it
  cel.poly([[0, 178], [W, 178], [W, 190], [0, 190]], L.BENCH, { z: -20, n: [0, -0.6, 0.8], sid: 3, off: -1 });
  cel.poly([[0, 190], [W, 190], [W, 195], [0, 195]], L.BENCH, { z: -20, n: [0, 0.5, 0.8], sid: 3, off: -3 });
  for (let x = 0; x < W; x++) {
    const seam = ((x + 17) % 61) === 0;
    for (let y = 178; y < 195; y++) {
      const i = cel.idx(x, y); if (i < 0 || cel.mat[i] !== L.BENCH) continue;
      if (seam) { cel.fix[i] = y < 190 ? 0 : 0; continue; }
      if (y === 178) cel.off[i] = 0;                                                        // the lit top edge
      else if (y < 190 && vn(x * 0.12, y * 1.6, 1, 71) > 0.68) cel.off[i] = -2;             // grain
      else if (y === 189) cel.off[i] = -2;                                                  // the edge rounding over
    }
  }
  const room = light({ ...ROOM, falloff: (x, y) => clamp(1.12 - ((x - 236) / 250) ** 2 - ((y - 40) / 260) ** 2 * 0.6, 0.3, 1.05) });
  return render(cel, room, { noCast: true });
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
  // the strained fold of wool the button sank into
  hf.blob(372, 132, 74, 46, 132, { mat: CM.WOOL, p: 0.6 });
  hf.blob(392, 170, 70, 34, 128, { mat: CM.WOOL, p: 0.6 });
  // the gap where the coat can't close: a long band of pale belly (its edges are cut below, as the coat's hems)
  hf.blob(820, 140, 122, 124, 140, { mat: FM.DOUGH, p: 0.55 });
  hf.blob(930, 118, 62, 82, 132, { mat: FM.DOUGH, p: 0.6 });
  hf.finalize();
  for (let k = 0; k < 22; k++) { const x = 30 + r() * (STRIP_W - 60); hf.groove([[x, 0], [x + 30 + r() * 30, 130], [x - 10 + r() * 30, H]], 8 + r() * 6, 10 + r() * 10); }
  hf.fold([[300, 150], [372, 160], [460, 148]], 6, 14);
  hf.fold([[700, 110], [820, 128], [960, 112]], 7, 16);
  hf.fold([[720, 186], [830, 200], [950, 186]], 7, 14);
  // the coat's two front edges, pulled apart over the belly: wool outside them, flesh between
  const edgeL = (y) => 744 + Math.sin(y * 0.045) * 10 + (y - 135) * 0.12, edgeR = (y) => 958 + Math.sin(y * 0.05 + 1) * 9 - (y - 135) * 0.1;
  cel.fromHF(hf, { sid: 1, mode: 'any', matFn: (x, y, m) => (x > edgeL(y) && x < edgeR(y) ? FM.DOUGH : (m === FM.DOUGH ? CM.WOOL : m)), sidFn: (x, y) => (x > edgeL(y) && x < edgeR(y) ? 2 : 1) });
  // the hems: a turned edge of wool lapping over the flesh, buttonholes along the left one, a shadow under each
  for (let y = 0; y < H; y++) for (const [ex, sd] of [[edgeL(y), 1], [edgeR(y), -1]]) {
    for (let k = 0; k < 6; k++) {
      const x = Math.round(ex + sd * k), i = cel.idx(x, y); if (i < 0) continue;
      if (k < 4) { cel.mat[i] = CM.WOOL; cel.sid[i] = 1; cel.z[i] += 4; cel.fix[i] = k === 0 ? 1 : k === 3 ? 4 : 3; }
      else if (DOUGHS.includes(cel.mat[i])) cel.off[i] = Math.min(cel.off[i], k === 4 ? -3 : -1);
    }
    if (sd > 0 && ((y + 6) % 34) < 4) for (let k = 1; k < 3; k++) { const i = cel.idx(Math.round(ex + k), y); if (i >= 0) cel.fix[i] = 0; }
  }
  textureDough(cel, rng(77), { faceC: [820, 140], faceR: 120, sweat: 7, hairs: 16, L: NEAR.L });
  for (let i = 0; i < STRIP_W * H; i++) if (cel.mat[i] === CM.WOOL) { const x = i % STRIP_W, y = (i / STRIP_W) | 0; if (h01(x >> 1, y, 42) < 0.06) cel.off[i] -= 1; else if (h01(x, y >> 1, 43) < 0.025) cel.off[i] += 1; }
  // the button, half swallowed by the flesh: a fold of skin lapping over its rim
  { const bx = 372, by = 158, br = 16;
    for (let y = by - br - 4; y <= by + br + 4; y++) for (let x = bx - br - 4; x <= bx + br + 4; x++) {
      const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by) / br, i = cel.idx(x, y); if (i < 0) continue;
      const lip = by - br * 0.35 + Math.sin((x - bx) * 0.2) * 2;
      if (d > 1) { if (d < 1.22 && cel.mat[i] === CM.WOOL) cel.off[i] -= 2; continue; }
      if (y < lip) { if (y > lip - 3 && cel.mat[i] === CM.WOOL) cel.off[i] += 1; continue; }
      const dome = Math.sqrt(1 - d * d);
      cel.put(x, y, d > 0.74 && d < 0.86 ? CM.VERD : CM.BRASS, { z: cel.z[i] + 2, n: [(x - bx) / br, (y - by) / br, dome + 0.3], sid: 3, fix: -1, off: y < lip + 2 ? -2 : (Math.abs(x - bx) < br * 0.4 && Math.abs(y - by - 2) < 2) ? 1 : 0 });
    } }
  // the crimson sash, broad and straining, crossing the strip diagonally
  for (let x = 440; x < 760; x++) for (let y = 0; y < H; y++) {
    const c = (x - 520) * 1.55 + Math.sin(x * 0.05) * 4, d = y - c;
    if (Math.abs(d) > 78) continue;
    const i = y * STRIP_W + x; if (!cel.mat[i] || DOUGHS.includes(cel.mat[i])) continue;
    const pleat = Math.sin((y - (x - 520) * 1.55) * 0.075 + Math.sin(y * 0.02) * 1.5);
    cel.mat[i] = L.SASH; cel.sid[i] = 4; cel.z[i] += 3;
    cel.off[i] = Math.abs(d) > 72 ? -2 : pleat > 0.6 ? 1 : pleat < -0.7 ? -1 : 0;
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

/** Preview hook (tools/preview/colonel_fist.html): the knocking fist on its own. */
export function buildKnockPreview() { return buildKnock(); }
/**
 * The ringed fist, knocking: seen from the door it knocks on — the cuff above, the back of the hand
 * receding to the wrist, four knuckles in a row, the curled fingers' middle segments side by side (the
 * knocking face) with creases wrapping each joint, the thumb across the front, a ring sunk in the ring
 * finger and the signet on the little one. The hand kit's flesh ramp, under the locker room's tube.
 */
function buildKnock() {
  const w = 200, h = 200, cel = new Cel(w, h), FM2 = CM.FLESH;
  const F = new Field(0, 0, w, h, 0.45);
  // the four curled fingers as columns of the fist's front, pressed together (index → little: centre,
  // half width, bottom) — the middle finger longest, the little one short and narrow
  const fing = [[69, 11.6, 133], [92, 11.6, 139], [114, 10.6, 135], [133.5, 9, 127]];
  const colOf = (x) => { for (const f of fing) if (Math.abs(x - f[0]) <= f[1] + 0.01) return f; return null; };
  F.fn((x, y) => {
    if (y < 28 || y > 142) return null;
    if (y < 66) {                                                                                     // back of the hand, narrowing to the wrist
      const tt = (y - 28) / 38, hw = 36 + Math.sqrt(tt) * 15, u = (x - 101) / hw; if (Math.abs(u) > 1) return null;
      return 8 + (y - 28) * 0.32 + 12 * Math.sqrt(Math.max(0, 1 - u * u));
    }
    if (Math.abs(x - 101) > 52) return null;
    const f = colOf(x); if (!f) return null;
    const q = (x - f[0]) / f[1], round = 5 * Math.sqrt(Math.max(0, 1 - q * q));
    if (y > f[2] - (1 - Math.sqrt(Math.max(0, 1 - q * q))) * 8) return null;                          // each finger's rounded end
    const top = y < 86 ? (y - 64) * 0.36 : 8 + 0;                                                    // the top face turning toward us
    const under = y > f[2] - 10 ? -((y - (f[2] - 10)) ** 2) * 0.2 : 0;                              // tucking under into the palm
    const bottom = Math.max(0, 1 - ((f[2] - y) / 6)) * 0;
    return 18 + top + round + under - bottom;
  }, FM2);
  for (const [fx, r] of fing) F.blob(fx - 1, 63, r * 0.95, 6.5, 12, { base: 20, p: 0.5, mat: FM2 });     // the big knuckles along the top
  // the thumb across the lower front of the index and middle fingers, its nail toward the ring finger
  F.tube([56, 112], 10.5, [104, 121], 8.6, { mat: FM2, z0: 24, z1: 27, k: 0.75, p: 0.55 });
  F.finalize();
  for (let k = 0; k < 3; k++) { const mx = fing[k][0] + fing[k][1]; F.groove([[mx, 66], [mx, Math.min(fing[k][2], fing[k + 1][2]) - 1]], 1.4, 4.5); }
  F.toCel(cel, { sid: 1, mode: 'z' });
  // the thumb is its own surface (an outline where it lies over the fingers)
  for (let y = 98; y < 134; y++) for (let x = 34; x < 116; x++) {
    const i = cel.idx(x, y); if (i < 0 || cel.mat[i] !== FM2) continue;
    const t = clamp(((x - 48) * 56 + (y - 113) * 8) / (56 * 56 + 64)), cx = 48 + 56 * t, cy = 113 + 8 * t;
    if (Math.hypot(x - cx, y - cy) < 11 - t * 1.9) cel.sid[i] = 4;
  }
  for (let y = 28; y < 50; y++) for (let x = 40; x < 160; x++) { const i = cel.idx(x, y); if (i >= 0 && cel.mat[i] === FM2) cel.off[i] = y < 42 ? -2 : -1; }
  // the cuff: navy wool over the wrist, a roll of flesh pushing out under its edge
  for (let y = 0; y < 40; y++) for (let x = 44; x < 158; x++) {
    const u = (x - 101) / 57, edge = 33 + Math.sin(x * 0.3) * 1.2;
    if (Math.abs(u) > 1 || y > edge) continue;
    cel.put(x, y, CM.WOOL_W, { z: 30 + 10 * Math.sqrt(1 - u * u), n: [u * 0.8, -0.2, 0.6], sid: 2, fix: -1, off: 0 });
  }
  for (let x = 46; x < 156; x++) {
    const u = (x - 101) / 57, ey = Math.round(33 + Math.sin(x * 0.3) * 1.2);
    for (let k = 1; k <= 4; k++) { const i = cel.idx(x, ey + k); if (i >= 0 && cel.mat[i] === FM2) { cel.z[i] = 40; cel.ny[i] = k < 3 ? -0.6 : 0.3; cel.nx[i] = u * 0.5; cel.nz[i] = 0.75; cel.sid[i] = 3; cel.off[i] = 0; } }
    const j = cel.idx(x, ey + 5); if (j >= 0 && cel.mat[j] === FM2) cel.fix[j] = 1;
  }
  const fl = (x, y) => { const i = cel.idx(x, y); return i >= 0 && cel.mat[i] === FM2 ? i : -1; };
  const line = (pts, d) => cel.stroke(pts, (x, y) => { const i = fl(x, y); if (i >= 0 && cel.fix[i] < 0) cel.off[i] = d; });
  // the middle knuckles: 2-3 bowed creases wrapping each finger at the fist's corner, the skin puffed between;
  // the fold where each finger tucks under; a shine on each big knuckle
  for (const [fx, r, by] of fing) {
    for (const yy of [84, 87, 90]) line([[fx - r * 0.72, yy], [fx, yy + 1.5], [fx + r * 0.72, yy]], -1);
    line([[fx - r * 0.7, 81.5], [fx, 83], [fx + r * 0.7, 81.5]], 1);
    line([[fx - r * 0.7, by - 10], [fx, by - 8.5], [fx + r * 0.7, by - 10]], -1);
    for (const [dx, dy] of [[-3, -3], [-2, -3], [-3, -2]]) { const i = fl(fx + dx, 63 + dy); if (i >= 0) cel.off[i] = 2; }
  }
  // the thumb: its joint and the nail at its tip (yellowed horn, dirt at the edge)
  line([[76, 106], [77, 123]], -1); line([[78, 106], [79, 122]], 1);
  for (let y = 108; y < 130; y++) for (let x = 94; x < 116; x++) {
    const e = ((x - 104) / 6.5) ** 2 + ((y - 119) / 4.6) ** 2; if (e > 1) continue;
    const i = cel.idx(x, y); if (i < 0 || cel.sid[i] !== 4) continue;
    cel.mat[i] = CM.NAIL; cel.fix[i] = e > 0.72 ? 1 : y < 117 ? 4 : 3;
  }
  // rings, sunk at the base of the ring and little fingers: a band with a dark garnet, the signet
  const band = (fx, r, y0) => { for (let x = Math.round(fx - r * 0.85); x <= fx + r * 0.85; x++) { const q = (x - fx) / r, y = Math.round(y0 + q * q); const a = fl(x, y - 1); if (a >= 0) cel.off[a] = 1; for (const [dy, k] of [[0, 4], [1, 2]]) { const i = cel.idx(x, y + dy); if (i >= 0 && cel.mat[i] === FM2) { cel.mat[i] = CM.GOLD; cel.fix[i] = Math.abs(q) < 0.3 && dy === 0 ? 5 : k; } } const c = fl(x, y + 2); if (c >= 0) cel.fix[c] = 1; } };
  band(fing[2][0], fing[2][1], 73); band(fing[3][0], fing[3][1], 75);
  for (const [dx, dy, k] of [[-1, -1, 1], [0, -1, 4], [1, -1, 3], [-1, 0, 1], [0, 0, 1], [1, 0, 1], [0, 1, 0]]) { const i = cel.idx(fing[2][0] + dx, 73 + dy); if (i >= 0) { cel.mat[i] = CM.STONE; cel.fix[i] = k; } }
  for (const [dx, dy, k] of [[-2, -1, 3], [-1, -2, 4], [0, -2, 4], [1, -2, 3], [2, -1, 3], [-1, -1, 4], [0, -1, 5], [1, -1, 4]]) { const i = cel.idx(fing[3][0] + dx, 75 + dy); if (i >= 0) { cel.mat[i] = CM.GOLD; cel.fix[i] = k; } }
  // liver spots and a raised vein on the back of the hand
  for (const [x, y, rx, ry] of [[80, 46, 2.2, 1.5], [122, 52, 1.8, 1.3]]) for (let yy = Math.floor(y - ry); yy <= y + ry; yy++) for (let xx = Math.floor(x - rx); xx <= x + rx; xx++) { const i = fl(xx, yy); if (i >= 0 && ((xx - x) / rx) ** 2 + ((yy - y) / ry) ** 2 < 1) cel.mat[i] = CM.SPOT; }
  cel.stroke([[104, 38], [107, 46], [104, 52], [108, 58]], (x, y) => { const i = fl(x, y); if (i >= 0) cel.mat[i] = CM.VEIN; const j = fl(x + 1, y); if (j >= 0) cel.off[j] = -1; });
  const lt = light({ L: [-0.25, -0.7, 0.67], amb: 0.12, key: 0.8, shadow: 0, steps: 0, rim: [-0.6, -0.6, 0.15] });
  return render(cel, lt, { noCast: true });
}

export function buildLockerOutside(later = (k, f) => f()) {
  const room = buildRoom(), strip = buildBodyStrip();
  let knock = null;
  return {
    draw(ctx, t, phase, faceIn) {
      if (!knock && phase > 0.15) later('knock', () => { if (!knock) knock = buildKnock(); });
      ctx.drawImage(room, 0, 0);
      // he drags along the lockers: the strip enters from the right and slides past, slowing as he nears
      const e = 1 - (1 - phase) * (1 - phase);
      const sx = Math.round(500 - e * (STRIP_W - 120) + Math.sin(t * 1.7) * 2);
      const sy = Math.round(Math.sin(t * 2.1) * 2.5 - (1 - phase) * 8);
      if (phase > 0.02) ctx.drawImage(strip, sx, sy);
      // the ringed fist: it swings in at the right as he comes along the row, then knocks on the lockers
      // one by one, closer, until it knocks on hers (centred on the vents: the big knuckles in the 2nd, the
      // creased joints in the 3rd); it draws back as his face comes to the slit
      if (phase > 0.26) {
        if (!knock) knock = buildKnock();
        const k = clamp((phase - 0.26) / 0.7);
        const tap = phase > 0.5 ? Math.max(0, Math.sin(t * Math.PI * 2 / 0.9)) ** 8 : 0;
        const hx = Math.round(300 - 165 * k * k * (3 - 2 * k) + tap * 3 + faceIn * 230), hy = Math.round(38 - tap * 4 + (1 - k) * 6 + Math.sin(t * 1.9) * 1.5);
        ctx.drawImage(knock, hx, hy);
      }
    },
  };
}

// ---------------------------------------------------------------------------------- the face at the vents
export function buildSlitFace() {
  // so close that one half-lidded eye fills the central vent; the brow above, cheek & whisker below.
  // Only the band the vents can show is built (it slides in from the right).
  const s = 14, w = 520, h = 176, ex = 350, ey = 72, lid = 0.4, hh = 2.1 * s;
  const P = { ...FACE_EXPR.serene, lidL: lid, lidR: 0.4, gazeL: [0.0, 0.08], gazeR: [0.25, 0.5], glint: false, cx: ex + 6 * s, cy: ey - 0.2 * s, s, seed: 1841, chins: 1, collar: false };
  const cel = headCel(P, { w, h, sweat: 5, hairs: 10, L: [0.12, -0.9, 0.42] });
  const lt = light({ L: [0.12, -0.9, 0.42], amb: 0.07, key: 0.74, shadow: 0.45, steps: 25, spec: 0.9,
    falloff: (x, y) => clamp(1.1 - (Math.abs(y - 72) / 140) ** 2, 0.2, 1.1) });
  const lev = lightCel(cel, lt);
  liftRing(cel, lev);
  // at this distance the heavy lid must stay skin, not glare like the white of the eye; the eye itself is
  // what the vent is for: the iris his portrait's blue-grey, dim yellowed whites either side of it
  for (let i = 0; i < w * h; i++) {
    const m = cel.mat[i];
    if (m === FM.FACE || m === FM.BLUSH || m === FM.FACE_V) lev[i] *= 0.72;
    else if (m === FM.IRIS) lev[i] = Math.max(lev[i] * 1.25, 0.5);
    else if (m === FM.SCLERA) lev[i] = Math.max(lev[i], 0.48);
  }
  const sh = outline(cel, quantize(cel, lev), { lit: 0.6 });
  // one 2-px catchlight, up and to the left in the iris (toward the tube)
  const lidY = ey + hh * (1 - 2 * lid), gz = P.gazeL, ix = Math.round(ex + gz[0] * 3.45 * s * 0.55), iy = Math.round(ey + gz[1] * hh * 0.45);
  for (const [dx, dy] of [[-0.45 * s, Math.max(-0.5 * s, lidY + 4 - iy)], [-0.45 * s + 1, Math.max(-0.5 * s, lidY + 4 - iy)]]) {
    const i = cel.idx(Math.round(ix + dx), Math.round(iy + dy)); if (i >= 0 && (cel.mat[i] === FM.IRIS || cel.mat[i] === FM.PUPIL)) { cel.mat[i] = FM.PUPIL; sh.tone[i] = 4; }
  }
  const canvas = packedToCanvas(packTones(cel, sh.tone), w, h, lut());
  // report the lash line (not the eye centre): it sits 4 px inside the top of the 2nd vent
  return { canvas, eyeX: ex, eyeY: Math.round(lidY) };
}

// ---------------------------------------------------------------------------------- the mouth (stinger #4)
/**
 * Below the eye the closed lips part and the mouth keeps opening — vertically: a slot in the 4th vent at
 * m 0.3, a black cavity through the 4th and 5th at 1 with the lower lip pushed off the bottom. m 0..1. Painted in the slit face's frame (origin = its eye mark, like buildSlitFace's eyeX/eyeY);
 * returns { canvas, x, y } (top-left relative to the eye mark).
 */
export function buildMouth(m) {
  const w = 150, h = 170, c = makeCanvas(w, h), x = ctxOf(c);
  const cx = 75, top = 56;                                  // the lips' line: 56 px below the eye mark (the 4th vent)
  // a slot at first (3 px at 0.3), then it keeps going: through the 5th vent and on past the window's bottom
  const gap = Math.round(m < 0.3 ? m / 0.3 * 3 : 3 + (m - 0.3) / 0.7 * 46);
  const S = ['#262420', '#3e3a32', '#5c5548', '#7c7262', '#9a8e7a', '#b2a690'];
  const LP = ['#2a1612', '#48261e', '#6a3e32', '#8a5646', '#a8705c'];
  const px = (xx, yy, col) => { if (xx < 0 || yy < 0 || xx >= w || yy >= h) return; x.fillStyle = col; x.fillRect(xx, yy, 1, 1); };
  // the opening: a tall, uneven slot — wider just under the lip, then dropping and narrowing far too long
  const halfAt = (yy) => {
    const t = gap ? (yy - top) / gap : 0;
    const base = 30 + 10 * Math.sin(Math.min(1, t * 2.2) * Math.PI * 0.5) - 22 * Math.max(0, t - 0.3) / 0.7;
    return Math.max(0, base * (t > 0.92 ? Math.sqrt(Math.max(0, (1 - t) / 0.08)) : 1) + Math.sin(yy * 0.31) * 1.2 + Math.sin(yy * 0.13 + 1) * 1.6);
  };
  const lipY = (xx) => { const u = (xx - cx) / 48; return top - 2 + Math.round(u * u * 6 - Math.exp(-((u / 0.22) ** 2)) * 1.6); };   // corners down, a dip at the centre
  if (gap > 0) {
    // stretched skin around the slot (tension), then the inside: black, a wet dark-red rim
    for (let yy = top; yy < top + gap + 6; yy++) {
      const hw = halfAt(Math.min(yy, top + gap - 1));
      for (let xx = Math.round(cx - hw - 5); xx <= cx + hw + 5; xx++) {
        const e = Math.abs(xx - cx) - hw;
        if (yy >= top + gap || e > 0) { if (e < 3 && yy < top + gap + 3) px(xx, yy, e < 1.5 ? S[1] : S[4 - (bay(xx, yy) < 0.5 ? 1 : 0)]); continue; }
        px(xx, yy, e > -2 ? '#2a0806' : e > -4 && bay(xx, yy) < 0.5 ? '#170504' : '#030101');
      }
    }
    // tension creases fanning from the corners
    for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) for (let j = 0; j < 10 + k * 3; j++) {
      const ax = cx + sd * (44 + j * 0.8), ay = top + 1 + k * 5 + j * (0.35 + k * 0.25);
      px(Math.round(ax), Math.round(ay), S[1]);
    }
  }
  // the upper lip: a heavy roll, a dip at its centre, the corners turned down
  for (let xx = cx - 50; xx <= cx + 50; xx++) {
    const u = Math.abs(xx - cx) / 50, ly = lipY(xx), th = Math.round(4 - u * 2.4);
    for (let k = 0; k < th; k++) px(xx, ly - th + k, LP[k === 0 ? 2 : k === th - 1 ? 4 : 3]);
    px(xx, ly - th - 1, S[1]);
    if (!gap || Math.abs(xx - cx) > halfAt(top) + 1) px(xx, ly, '#0a0504');
  }
  // the lower lip, carried far down with the jaw (or closed, a line under the upper)
  const ly0 = top + gap + 1;
  const lw = gap ? Math.max(8, halfAt(top + gap - 2) + 6) : 46;
  for (let xx = Math.round(cx - lw); xx <= cx + lw; xx++) {
    const u = (xx - cx) / lw, curve = Math.round(gap ? -u * u * 2 : u * u * 5);
    px(xx, ly0 + curve, '#0a0504'); px(xx, ly0 + 1 + curve, LP[3]); px(xx, ly0 + 2 + curve, LP[4]); px(xx, ly0 + 3 + curve, LP[2]); px(xx, ly0 + 4 + curve, LP[1]);
  }
  // what joins it to the eye: the shadow of a nostril in the 3rd vent, and the mustache — fine pale strands
  // combed out from under the nose, across the bar and down over the lip's corners
  const nx0 = cx - 14, ny0 = 30;
  for (let yy = -4; yy <= 4; yy++) for (let xx = -9; xx <= 9; xx++) {
    const e = (xx / 9) ** 2 + (yy / 4) ** 2; if (e > 1) continue;
    px(nx0 + xx, ny0 + yy, e < 0.45 ? '#0a0605' : e < 0.75 || bay(xx, yy) < 0.5 ? S[0] : S[1]);
  }
  for (let xx = -11; xx <= 11; xx++) px(nx0 + xx, ny0 - 5 - Math.round(Math.abs(xx) * 0.18), S[3]);    // the wing's lit rim
  // (in the locker's dim light: grey, not white; combed out sideways over the lip, not hanging like a fringe)
  const MU = ['#34302a', '#4a463e', '#625e54', '#7a766c'];
  for (const sd of [-1, 1]) for (let k = 0; k < 13; k++) {
    const q = k / 12, x0 = cx - 8 + sd * (1 + q * 12), y0 = 46 + q * 2 + (k % 3);
    const len = 16 + q * 18 + ((k * 7) % 6), x1 = x0 + sd * len * 0.92, y1 = y0 + len * (0.32 + q * 0.12);
    const col = MU[1 + ((k * 5 + (sd > 0 ? 1 : 0)) % 3)];
    for (let j = 0; j <= 30; j++) { const t = j / 30, bx = x0 + (x1 - x0) * t, by = y0 + (y1 - y0) * t * t - Math.sin(t * Math.PI) * 1.5; if (j % 11 === 5 && k % 2) continue; px(Math.round(bx), Math.round(by), t > 0.88 ? MU[3] : t < 0.15 ? MU[0] : col); }
  }
  return { canvas: c, x: 45 - cx, y: 0 };
}
