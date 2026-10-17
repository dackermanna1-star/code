// locker_slits: Tess's view from inside a gym locker. The dark steel door with five vent slits; beyond
// them the fluorescent locker room, and the Colonel passing so close that only fragments show — wool,
// a brass button sunk in a fold, the crimson sash, pale flesh, a ringed hand knocking on the doors one
// by one. faceIn slides his small face in until one half-lidded eye fills the central slit.
import { GBuf, HField, M, rig, shade, imgToCanvas, fbm, hnoise } from './colonel_gbuf.js';
import { drawHead, FACE_EXPR } from './colonel_face.js';
import { SM, buildHand, sinkRings, paintRings, paintNails, carve } from './colonel_cg_scenes.js';
import { makeCanvas, ctxOf, rng } from './util.js';

const W = 480, H = 270;
const SLITS = 5, SX0 = 112, SX1 = 368, SY0 = 72, SH = 15, SP = 26;
export const LOCKER = { eyeX: 240, eyeY: SY0 + 2 * SP + SH / 2, slits: Array.from({ length: SLITS }, (_, k) => [SX0, SY0 + k * SP, SX1 - SX0, SH]) };

const ROOM_RIG = rig({ amb: 0.22, shadowTint: '#6f8a7c', keyTint: '#e6fff0', lights: [{ d: [0.1, -0.85, 0.5], i: 0.85, sh: 20, shK: 0.5 }] });
const NEAR_RIG = rig({ amb: 0.1, shadowTint: '#56645e', keyTint: '#eefff2', exposure: 1.0,
  lights: [{ d: [0.15, -0.9, 0.42], i: 0.95, sh: 30, shK: 0.45 }, { d: [-0.3, 0.2, 0.9], i: 0.1, spec: 0 }] });
const DOOR_RIG = rig({ amb: 0.02, shadowTint: '#2a3436', keyTint: '#cfe8d8', lights: [] });

// ---------------------------------------------------------------------------------- interior (foreground)
export function buildLockerInterior() {
  const gb = new GBuf(W, H);
  const r = rng(1979);
  // the door's inner face, flat, with a stiffening channel and the side walls receding at the edges
  gb.poly([[0, 0], [W, 0], [W, H], [0, H]], { mat: SM.LOCKER, z: 0, n: [0, 0, 1] });
  gb.poly([[0, 0], [34, 18], [34, 252], [0, H]], { mat: SM.LOCKER_D, z: 2, n: [0.8, 0, 0.6], mode: 'any' });
  gb.poly([[W, 0], [W - 34, 18], [W - 34, 252], [W, H]], { mat: SM.LOCKER_D, z: 2, n: [-0.8, 0, 0.6], mode: 'any' });
  gb.poly([[34, 18], [W - 34, 18], [W - 34, 26], [34, 26]], { mat: SM.LOCKER, z: 3, n: [0, 0.6, 0.8], mode: 'any' });
  gb.poly([[34, 222], [W - 34, 222], [W - 34, 230], [34, 230]], { mat: SM.LOCKER, z: 3, n: [0, -0.6, 0.8], mode: 'any' });
  // louvers: each slit has a pressed rim; the lower lip catches the light from outside
  const glow = new Float32Array(W * H);
  for (const [x, y, w, h] of LOCKER.slits) {
    for (let yy = y - 3; yy < y + h + 3; yy++) for (let xx = x - 4; xx < x + w + 4; xx++) {
      const inside = yy >= y && yy < y + h && xx >= x && xx < x + w;
      const i = yy * W + xx;
      if (inside) { gb.mat[i] = 0; continue; }
      const top = yy < y, ny = top ? 0.55 : yy >= y + h ? -0.55 : 0, nx = xx < x ? 0.55 : xx >= x + w ? -0.55 : 0;
      gb._put(i, SM.LOCKER, nx, ny, 1, 4, { mode: 'any', ao: 1, lum: yy === y + h || yy === y + h + 1 ? 0.16 : yy === y - 1 ? -0.1 : 0 });
    }
    // light spilling from the slit onto the steel (falls off quickly, dithered by the shader)
    for (let yy = y - 22; yy < y + h + 26; yy++) for (let xx = x - 26; xx < x + w + 26; xx++) {
      if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
      const dx = Math.max(0, x - xx, xx - (x + w)), dy = Math.max(0, y - yy, yy - (y + h));
      const d = Math.hypot(dx, dy * 1.4);
      glow[yy * W + xx] = Math.max(glow[yy * W + xx], Math.max(0, 1 - d / 22) ** 2);
    }
  }
  for (let i = 0; i < W * H; i++) if (gb.mat[i]) gb.lum[i] += glow[i] * 0.42;
  // rivets, scratches, rust, a dent, the coat hook, someone's initials from 1979
  for (const [x, y] of [[50, 36], [W - 50, 36], [50, 210], [W - 50, 210], [240, 36], [240, 210]]) gb.ell(x, y, 2.5, 2.5, { mat: SM.LOCKER, z: 6, rz: 2, mode: 'any' });
  for (let k = 0; k < 50; k++) { const x = 40 + r() * 400, y = 30 + r() * 210, a = r() * 6.28, L = 3 + r() * 14; gb.line(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, null, { k: 0.75, lumAdd: 0.03 }); }
  for (let k = 0; k < 14; k++) { const x = 40 + r() * 400, y = 30 + r() * 210, rr = 2 + r() * 5; gb.ell(x, y, rr, rr * 0.7, { mat: SM.LOCKER_D, z: 0.5, rz: 0.5, mode: 'over', ao: 0.8, lum: 0.05 }); }
  gb.ell(392, 200, 26, 14, { mat: SM.LOCKER, z: -2, rz: 4, mode: 'over', ao: 0.85, tilt: [0.2, 0.3] });
  gb.cap(404, 46, 4, 404, 64, 4, { mat: SM.METAL, z: 12, rzk: 1, mode: 'any' });
  gb.cap(404, 64, 4, 394, 70, 3.5, { mat: SM.METAL, z: 12, rzk: 1, mode: 'any' });
  carve(gb, 76, 196, 'CM 79', 2);
  carve(gb, 352, 60, 'HH', 1);
  // a strip of old masking tape
  gb.poly([[70, 44], [116, 40], [117, 47], [71, 51]], { mat: M.PAPER, z: 1, n: [0, 0, 1], mode: 'any', ao: 0.55 });
  const img = shade(gb, rig({ ...DOOR_RIG, amb: 0.04, lights: [{ p: [240, 136, 120], r: 520, i: 0.32, fall: 2 }] }), {
    focus: (x, y) => { const d = Math.hypot((x - 240) / 260, (y - 134) / 170); return Math.max(0.15, 1 - d * d); },
  });
  return imgToCanvas(img);
}

// ---------------------------------------------------------------------------------- what lies outside
function buildRoom() {
  // the girls' locker room under one buzzing tube: lockers opposite, a bench, tile
  const gb = new GBuf(W, H);
  const r = rng(77);
  gb.poly([[0, 0], [W, 0], [W, 150], [0, 150]], { mat: SM.WALL_C, z: -60, n: [0, 0, 1] });
  // opposite bank of lockers
  for (let k = 0; k < 9; k++) {
    const x = -20 + k * 58;
    gb.poly([[x, 30], [x + 55, 30], [x + 55, 196], [x, 196]], { mat: SM.LOCKER, z: -40, n: [0, 0, 1], mode: 'any' });
    gb.line(x, 30, x, 196, null, { k: 0.4 });
    for (let j = 0; j < 4; j++) gb.poly([[x + 12, 46 + j * 6], [x + 43, 46 + j * 6], [x + 43, 48 + j * 6], [x + 12, 48 + j * 6]], { mat: SM.LOCKER_D, z: -40, n: [0, 0, 1], mode: 'any' });
    gb.poly([[x + 44, 110], [x + 48, 110], [x + 48, 124], [x + 44, 124]], { mat: SM.METAL, z: -38, n: [0, 0, 1], mode: 'any' });
    if (k === 3) gb.ell(x + 26, 150, 10, 7, { mat: SM.LOCKER, z: -42, rz: 3, mode: 'over', ao: 0.8 }); // a dent
  }
  gb.poly([[0, 196], [W, 196], [W, H], [0, H]], { mat: SM.TILE, z: -30, n: [0, -0.7, 0.7] });
  for (let x = 0; x < W; x += 18) gb.line(x, 196, x - 30 + (x - 240) * 0.3, H, null, { k: 0.7 });
  // bench
  gb.poly([[0, 178], [W, 178], [W, 190], [0, 190]], { mat: SM.WOOD, z: -20, n: [0, -0.6, 0.8], mode: 'any' });
  gb.poly([[0, 190], [W, 190], [W, 195], [0, 195]], { mat: SM.WOOD, z: -20, n: [0, 0.5, 0.8], mode: 'any', ao: 0.6 });
  for (let k = 0; k < 30; k++) { const x = r() * W, y = 30 + r() * 160; gb.dim(x, y, 0.7); }
  const img = shade(gb, ROOM_RIG, { focus: (x, y) => 1 - Math.min(1, Math.abs(x - 240) / 300) * 0.4 });
  return imgToCanvas(img);
}

const STRIP_W = 1240;
function buildBodyStrip() {
  // what passes the vents, left (leading) to right: wool folds, a button sunk in a fold of flesh, the
  // sash, pale flesh where the coat won't close, then wool again
  const gb = new GBuf(STRIP_W, H);
  const r = rng(1894);
  const hf = new HField(STRIP_W, H, 0.06);
  hf.tube(-60, 140, 150, STRIP_W + 60, 132, 150, { mat: SM.NAVY_CUFF, z0: 0, z1: 0, k: 0.6 });
  // big drapes of wool across the mass
  for (let k = 0; k < 14; k++) { const x = 40 + k * 86 + r() * 30; hf.blob(x, 120 + r() * 50, 50 + r() * 26, 90 + r() * 40, 108 + r() * 14, { mat: SM.NAVY_CUFF, p: 0.6 }); }
  // the fold of flesh with a brass button sunk in it
  hf.blob(372, 132, 74, 46, 128, { mat: M.FLESH, p: 0.6 });
  hf.blob(392, 168, 70, 34, 124, { mat: M.FLESH, p: 0.6 });
  // the gap where the coat can't close: a long band of pale belly
  hf.blob(820, 140, 120, 120, 138, { mat: M.FLESH, p: 0.55 });
  hf.blob(930, 120, 60, 80, 130, { mat: M.FLESH, p: 0.6 });
  hf.finalize();
  for (let k = 0; k < 22; k++) { const x = 30 + r() * (STRIP_W - 60); hf.groove([[x, 0], [x + 30 + r() * 30, 130], [x - 10 + r() * 30, H]], 8 + r() * 6, 10 + r() * 10); }
  hf.fold([[300, 150], [372, 160], [460, 148]], 6, 14);
  hf.fold([[700, 110], [820, 128], [960, 112]], 7, 16);
  hf.fold([[720, 186], [830, 200], [950, 186]], 7, 14);
  hf.toGB(gb);
  // the button, half swallowed
  { const bx = 372, by = 156, bz = gb.z[by * STRIP_W + bx];
    gb.ell(bx, by, 17, 17, { mat: M.BRASS, z: bz - 2, rz: 6, mode: 'any', clip: (x, y) => y > by - 9 });
    gb.ell(bx - 3, by - 2, 7, 6, { mat: M.BRASS, z: bz + 2, rz: 3, mode: 'any', clip: (x, y) => y > by - 9 });
    for (let x = bx - 18; x <= bx + 18; x++) gb.dim(x, by - 9, 0.5); }
  // the crimson sash, broad and straining, crossing the strip diagonally
  for (let x = 480; x < 760; x++) for (let y = 0; y < H; y++) {
    const c = 40 + (x - 480) * 0.62 + Math.sin(x * 0.05) * 4, d = y - c;
    if (Math.abs(d) > 46) continue;
    const i = y * STRIP_W + x; if (!gb.mat[i]) continue;
    const pleat = Math.sin((y - (x - 480) * 0.62) * 0.11 + Math.sin(x * 0.02) * 1.5);
    gb._put(i, Math.abs(d) > 42 ? M.SASH_D : M.SASH, gb.nx[i] * 0.4 + 0.1, gb.ny[i] * 0.4 + pleat * 0.22 - 0.2, 1, gb.z[i] + 3, { mode: 'any', ao: Math.abs(d) > 40 ? 0.7 : 1, lum: -0.38 + pleat * 0.05 });
  }
  // medal pinned through the skin of the belly
  gb.cap(860, 96, 5, 860, 122, 5, { mat: M.RIB_R, z: 160, rzk: 0.4, mode: 'any' });
  gb.cap(864, 96, 3, 864, 122, 3, { mat: M.RIB_B, z: 161, rzk: 0.4, mode: 'any' });
  gb.ell(862, 134, 11, 11, { mat: M.GOLD, z: 162, rz: 5, mode: 'any' });
  gb.ell(862, 134, 5, 5, { mat: M.GOLD, z: 166, rz: 3, mode: 'any' });
  gb.folds(3, 0.7, 0.9);
  gb.ssao(8, 0.012, 0.35);
  return imgToCanvas(shade(gb, NEAR_RIG));
}

function buildKnock() {
  // a ringed hand, knuckles toward us, knocking on the next lockers
  const w = 220, h = 230;
  const gb = new GBuf(w, h);
  const H_ = buildHand(w, h, { cx: 112, cy: 70, fwd: [0.12, 1], s: 0.9, curl: 0.85, thumbSide: -1, mat: 62 });
  const rings = sinkRings(H_.hf, H_, [1, 2]);
  const cuff = new HField(w, h, 0.1);
  cuff.tube(110, -60, 70, 112, -8, 66, { mat: SM.NAVY_CUFF, z0: 0, z1: 6, k: 0.6 });
  cuff.finalize();
  H_.hf.maxWith(cuff);
  H_.hf.toGB(gb);
  paintRings(gb, rings, [null, M.DARK, M.RIB_R, null]);
  paintNails(gb, H_.nails);
  gb.folds(2.4, 0.7, 0.9);
  return imgToCanvas(shade(gb, NEAR_RIG));
}

export function buildLockerOutside() {
  const room = buildRoom(), strip = buildBodyStrip();
  let knock = null;
  return {
    draw(ctx, t, phase, faceIn) {
      ctx.drawImage(room, 0, 0);
      // he drags along the lockers: the strip enters from the right and slides past, slowing as he nears
      const e = 1 - (1 - phase) * (1 - phase);
      const sx = Math.round(500 - e * (STRIP_W - 120) + Math.sin(t * 1.7) * 2);
      const sy = Math.round(Math.sin(t * 2.1) * 2.5 - (1 - phase) * 8);
      if (phase > 0.02) ctx.drawImage(strip, sx, sy);
      // the knocking hand: one locker over, then the next, closer
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
  // so close that one half-lidded eye fills the central vent; brow above, cheek & whisker below
  const s = 14, w = 700, h = 440;
  const gb = new GBuf(w, h);
  const ex = 350, ey = 200; // his left eye lands here
  drawHead(gb, { ...FACE_EXPR.serene, lidL: 0.46, lidR: 0.4, gazeL: [0.02, 0.05], gazeR: [0.25, 0.2], glint: true, cx: ex + 6 * s, cy: ey - 0.2 * s, s, seed: 1841, chins: 1, collar: false });
  gb.folds(1.2 * s, 0.75, 0.9);
  gb.ssao(14, 0.008, 0.3);
  const img = shade(gb, rig({ amb: 0.06, shadowTint: '#56645e', keyTint: '#f0fff4',
    lights: [{ d: [0.12, -0.9, 0.42], i: 0.9, sh: 50, shK: 0.45 }, { p: [ex, ey + 60, 420], r: 760, i: 0.4, spec: 0.6 }] }));
  return { canvas: imgToCanvas(img), eyeX: ex, eyeY: ey };
}
