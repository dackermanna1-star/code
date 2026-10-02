// Level 77: The Endless Grocery Aisle. One supermarket aisle, four metres wide, shelves to the
// ceiling on both sides, fluorescent tubes in a row, going on in both directions until the fog
// takes it. Near the arrival the shelves hold ordinary groceries; the farther you walk, the
// less the products look like anything: plain white packs, one product repeated, glyphs,
// inverted colours, noise, and finally pale blank blocks. The ceiling rises, the light turns.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, ceilingLight, levelDoor, hr, env, M, CF, W, cbox } from './kit.js';
import { txt, txtC, mix, mulc, pack, signTexture, voidZone, carve, signBoard, clamp } from './g06_kit.js';

const N = 77;
const G = 32;               // zone size
const AX = 16, AW = 4;      // aisle cells x in [16, 20)
const SD = 0.7;             // shelf depth
const STEP = 30;            // metres per stage of strangeness
const NSTAGE = 8;

// ------------------------------------------------------------------ products
const WORDS = ['SOUP', 'RICE', 'BEANS', 'TEA', 'OATS', 'JAM', 'SALT', 'MILK', 'CORN', 'PEAS', 'FLOUR', 'PASTA'];
const PALS = [[196, 44, 38], [226, 176, 44], [44, 104, 176], [62, 140, 76], [214, 214, 204], [230, 120, 40], [120, 70, 150], [170, 120, 70]];

function can(p, x, y, w, h, c1, c2) {
  pack(p, x, y, w, h, c1, 0.22);
  p.rect(x, y + 1, w - 1, 1, [200, 200, 200], 0.5);
  p.rect(x + 1, y + Math.round(h * 0.35), w - 2, Math.max(2, Math.round(h * 0.35)), c2);
}
function boxy(p, x, y, w, h, c1, c2) {
  pack(p, x, y, w, h, c1, 0.2);
  p.rect(x + 1, y + 2, w - 3, Math.max(2, h >> 2), c2);
  p.rect(x + 1, y + h - 4, w - 3, 1, mulc(c2, 0.8));
}
function bottle(p, x, y, w, h, c1) {
  const nw = Math.max(2, w >> 1);
  const nx = x + ((w - nw) >> 1);
  pack(p, x, y + (h >> 2), w, h - (h >> 2), c1, 0.2);
  pack(p, nx, y, nw, (h >> 2) + 1, c1, 0.2);
  p.rect(nx, y, nw, 2, [230, 230, 230]);
  p.rect(x + 1, y + (h >> 1), w - 2, 3, [235, 235, 225]);
}
function bag(p, x, y, w, h, c1, c2) {
  pack(p, x, y + 2, w, h - 2, c1, 0.2);
  p.rect(x, y, w, 2, mulc(c1, 0.8));
  p.rect(x + 1, y + (h >> 1) - 2, w - 3, 4, c2);
}

// every shelf level: 12 rows of products on a board; the board lines are at rows 13, 26, 39, 52
const LEVELS = [[1, 12], [14, 12], [27, 12], [40, 12], [53, 10]];

function shelfBack(p, c) {
  p.fill(c);
  p.noise(4, 0.05, 2);
  for (const [y0, h] of LEVELS) {
    p.rect(0, y0 + h, 64, 1, [58, 60, 62]);               // board
    p.rect(0, y0 + h + 1, 64, 1, [30, 30, 32], 0.5);       // shadow under it
    p.rect(0, y0 + h - 1, 64, 1, [200, 204, 206], 0.35);   // lip highlight
  }
}

function stageRow(p, r, stage, y0, h, lv, v) {
  let x = r.int(0, 3);
  const base = r.pick(PALS);
  const bay = r.pick(PALS);
  const tag = r.pick(WORDS);
  while (x < 62) {
    let w = r.int(6, 11);
    const hh = Math.min(h, r.int(Math.max(6, h - 4), h));
    const y = y0 + h - hh;
    switch (stage) {
      case 0: { // ordinary groceries
        const k = r.int(0, 4), c1 = r.pick(PALS), c2 = r.pick(PALS);
        if (k === 0) can(p, x, y, w, hh, c1, c2);
        else if (k === 1) boxy(p, x, y, w + 1, hh, c1, c2);
        else if (k === 2) bottle(p, x, y, Math.min(w, 8), hh, c1);
        else if (k === 3) bag(p, x, y, w, hh, c1, c2);
        else { boxy(p, x, y, w, hh, [226, 226, 218], c1); }
        if (w >= 9 && hh >= 10 && r.chance(0.5)) txt(p, tag.slice(0, Math.floor((w - 1) / 6) || 1), x + 1, y + hh - 9, [30, 30, 30]);
        break;
      }
      case 1: // plain generic packs: white with a black stripe and a single blue band
        pack(p, x, y, w, hh, [232, 232, 226], 0.15);
        p.rect(x + 1, y + 2, w - 3, 2, [30, 30, 34]);
        p.rect(x + 1, y + hh - 4, w - 3, 2, [50, 80, 160]);
        break;
      case 2: // the same product again and again, in colours it should not have
        w = 8; can(p, x, y0 + h - h + 0, w, h, [70, 170, 150], [190, 70, 130]);
        break;
      case 3: { // colour ordered along the row
        const t = x / 64;
        const c = [140 + 100 * Math.sin(t * 6.28), 120 + 100 * Math.sin(t * 6.28 + 2.1), 120 + 100 * Math.sin(t * 6.28 + 4.2)];
        boxy(p, x, y, w, hh, c, mulc(c, 0.6));
        break;
      }
      case 4: { // glyphs on white
        pack(p, x, y, w, hh, [236, 236, 232], 0.12);
        const cx = x + (w >> 1), cy = y + (hh >> 1), k = r.int(0, 4);
        if (k === 0) p.disc(cx, cy, 2.5, [20, 20, 24]);
        else if (k === 1) { for (let i = 0; i < 4; i++) p.rect(cx - 3 + i, cy + 2 - i, 7 - 2 * i, 1, [20, 20, 24]); }
        else if (k === 2) p.rect(cx - 2, cy - 2, 5, 5, [20, 20, 24]);
        else if (k === 3) { p.rect(cx - 3, cy, 7, 1, [20, 20, 24]); p.rect(cx, cy - 3, 1, 7, [20, 20, 24]); }
        else p.ring(cx, cy, 3, 1, [20, 20, 24]);
        break;
      }
      case 5: { // dark packs with a thin bright outline
        const c = r.chance(0.5) ? [90, 255, 200] : [255, 90, 190];
        p.rect(x, y, w, hh, [14, 14, 20]);
        p.frame(x, y, w, hh, c);
        p.disc(x + (w >> 1), y + (hh >> 1), 1.5 + (lv % 2), c);
        break;
      }
      case 6: { // noise packs
        for (let yy = 0; yy < hh; yy++) for (let xx = 0; xx < w; xx++) {
          const n = pnoise(x + xx * 2, y + yy * 2 + v * 9, 16, 11 + lv);
          p.set(x + xx, y + yy, [60 + 190 * n, 255 * (1 - n) * (1 - n), 90 + 150 * (1 - n)]);
        }
        break;
      }
      default: // pale blank blocks, every third place empty
        if ((x / 9 | 0) % 3 !== 1) { p.rect(x, y0 + 2, w + 1, h - 2, [226, 228, 232]); p.rect(x + w, y0 + 2, 1, h - 2, [170, 172, 180]); p.rect(x, y0 + 2, w + 1, 1, [250, 250, 252]); }
    }
    x += w + (stage === 2 ? 0 : r.int(0, 2));
  }
  void base; void bay;
}

function bayTexture(p, r, stage, v) {
  const backs = [[150, 156, 160], [170, 172, 166], [140, 150, 150], [150, 150, 150], [200, 200, 204], [30, 30, 40], [40, 20, 60], [110, 114, 126]];
  shelfBack(p, backs[stage]);
  LEVELS.forEach(([y0, h], lv) => stageRow(p, r, stage, y0, h, lv, v));
  // shelf-edge strip with a price tag or two
  for (const [y0, h] of LEVELS) {
    p.rect(0, y0 + h + 1, 64, 2, stage >= 5 ? [20, 20, 28] : [236, 232, 214]);
    if (stage < 5) for (let k = 0; k < 3; k++) p.rect(r.int(1, 56), y0 + h + 1, 6, 2, r.chance(0.5) ? [240, 200, 40] : [220, 60, 50]);
  }
  p.grain(0.02);
}

for (let s = 0; s < NSTAGE; s++) for (let v = 0; v < 3; v++) {
  defineTexture(`lv77_bay${s}_${v}`, (p, r) => bayTexture(p, r, s, v), 16);
  defineMaterial(`lv77_bay${s}_${v}`, `lv77_bay${s}_${v}`, { su: 1, sv: 2.2, surf: 'concrete' });
}

// ------------------------------------------------------------------ structure textures
function floorTex(p, a, b, line) {
  p.fill(a);
  for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) if (((x + y) / 8) % 2 === 0) p.rect(x, y, 8, 8, b);
  p.noise(8, 0.05, 2);
  p.rect(0, 0, 3, 64, line); p.rect(61, 0, 3, 64, line);              // edge lines
  p.rect(31, 0, 2, 64, mulc(line, 0.7));                              // centre guide
  p.speckle(40, [90, 94, 96], 0.2, 0.5);
}
defineTexture('lv77_floor0', (p) => floorTex(p, [206, 210, 204], [188, 194, 190], [220, 190, 60]), 12);
defineTexture('lv77_floor1', (p) => floorTex(p, [176, 202, 180], [160, 186, 166], [90, 160, 120]), 12);
defineTexture('lv77_floor2', (p) => floorTex(p, [70, 60, 92], [58, 50, 80], [160, 90, 200]), 12);
defineMaterial('lv77_floor0', 'lv77_floor0', { s: 4, surf: 'lino' });
defineMaterial('lv77_floor1', 'lv77_floor1', { s: 4, surf: 'lino' });
defineMaterial('lv77_floor2', 'lv77_floor2', { s: 4, surf: 'lino' });

defineTexture('lv77_ceil', (p) => {
  p.fill([222, 224, 220]);
  p.noise(4, 0.05, 2);
  for (let i = 0; i < 64; i += 16) { p.rect(i, 0, 1, 64, [160, 164, 160]); p.rect(0, i, 64, 1, [160, 164, 160]); }
  p.speckle(30, [150, 150, 140], 0.2, 0.5);
}, 8);
defineMaterial('lv77_ceil', 'lv77_ceil', { s: 2.4, surf: 'drywall' });

defineTexture('lv77_wall', (p) => {
  p.fill([176, 204, 186]);
  p.noise(3, 0.05, 2);
  p.rect(0, 0, 64, 3, [220, 232, 224]);
  p.rect(0, 40, 64, 1, [140, 170, 150]);
  p.stain(20, 52, 9, [120, 140, 130], 0.3);
}, 8);
defineMaterial('lv77_wall', 'lv77_wall', { s: 2, surf: 'drywall', stain: 0.1 });
defineTexture('lv77_wall2', (p) => {
  p.fill([120, 104, 150]);
  p.noise(3, 0.06, 2);
  p.rect(0, 0, 64, 3, [170, 150, 200]);
}, 8);
defineMaterial('lv77_wall2', 'lv77_wall2', { s: 2, surf: 'drywall' });

defineTexture('lv77_shelf_top', (p) => { p.fill([226, 228, 226]); p.noise(4, 0.04, 2); p.rect(0, 0, 64, 4, [190, 194, 196]); }, 6);
defineMaterial('lv77_shelf_top', 'lv77_shelf_top', { s: 1, surf: 'metal' });
defineTexture('lv77_shelf_side', (p) => { p.fill([150, 154, 158]); p.noise(4, 0.06, 2); p.rect(0, 0, 4, 64, [120, 124, 128]); }, 6);
defineMaterial('lv77_shelf_side', 'lv77_shelf_side', { s: 1, surf: 'metal' });
defineTexture('lv77_board', (p) => { p.fill([226, 230, 232]); p.rect(0, 0, 64, 2, [250, 250, 250]); p.rect(0, 62, 64, 2, [120, 124, 130]); }, 6);
defineMaterial('lv77_board', 'lv77_board', { s: 1, surf: 'metal' });
defineTexture('lv77_pallet', (p) => { p.fill([150, 110, 64]); p.noise(6, 0.12, 2); for (let y = 0; y < 64; y += 16) p.rect(0, y, 64, 2, [90, 62, 34]); }, 8);
defineMaterial('lv77_pallet', 'lv77_pallet', { s: 1, surf: 'wood' });

const SIGNS = [
  ['SOUPS', [30, 90, 160]], ['PASTA', [190, 50, 40]], ['FOOD', [40, 120, 80]], ['MORE FOOD', [150, 50, 130]],
  ['AISLE 4', [30, 30, 40]], ['. . . . .', [200, 200, 220]], ['THE SAME', [90, 30, 50]], ['', [14, 14, 18]],
];
SIGNS.forEach(([word, col], k) => {
  defineTexture(`lv77_sign${k}`, (p) => {
    const dark = k >= 5;
    signTexture(p, col, dark ? [120, 255, 210] : [250, 250, 244], k === 7 ? [{ t: '4', sx: 3 }] : ['AISLE 4', word], { frame: dark ? [120, 255, 210] : [236, 236, 230], sy: 2, noise: 0.03 });
  }, 8);
  defineMaterial(`lv77_sign${k}`, `lv77_sign${k}`, { s: 1, surf: 'plastic', flags: 0 });
});
defineMaterial('lv77_rod', 'metal_dark', { s: 1, surf: 'metal' });

// ------------------------------------------------------------------ the aisle
const stageOfZ = (z) => clamp(Math.floor(Math.abs(z - 16.5) / STEP), 0, NSTAGE - 1);
const ceilOf = (s) => 3.4 + s * 0.27;
const shelfOf = (s) => 2.2 + Math.min(s, 6) * 0.14;

// light colour drifts: white-green, then mint, then pink, then violet
const LIGHT = [[0.9, 1.0, 0.94], [0.88, 1.0, 0.9], [0.95, 1.0, 0.8], [1.0, 0.95, 0.85], [1.0, 0.82, 0.9], [0.9, 0.7, 1.0], [0.7, 0.8, 1.0], [0.8, 0.9, 1.0]];
const FOG = [[0.66, 0.72, 0.68], [0.64, 0.72, 0.66], [0.66, 0.7, 0.6], [0.62, 0.6, 0.58], [0.58, 0.52, 0.56], [0.46, 0.36, 0.56], [0.3, 0.3, 0.5], [0.4, 0.44, 0.52]];

// an alcove (side nook with a staff door) every 64 m: which side and where
function alcoveFor(k) { // k = zone index along z
  if (k % 2 !== 0) return null;
  if (k === 0) return { side: 1, off: 24 };      // behind the arrival point: the first view stays clean
  return { side: hr(k, 1, 77) < 0.5 ? -1 : 1, off: 8 + Math.floor(hr(k, 2, 77) * 10) };
}

function bayMat(stage, z, side) {
  // stage wobbles with the bay
  const wob = Math.round((hr(Math.floor(z), side, 31) - 0.5) * 1.7);
  const s = clamp(stage + wob, 0, NSTAGE - 1);
  const v = Math.floor(hr(Math.floor(z), side, 32) * 3);
  return M[`lv77_bay${s}_${v}`];
}

function gen(zb) {
  voidZone(zb, CF);
  const k = Math.floor(zb.z0 / G);
  const zs = stageOfZ((zb.z0 + zb.z1) / 2);
  const CH = ceilOf(zs), SH = shelfOf(zs);
  const fm = zs < 3 ? M.lv77_floor0 : zs < 6 ? M.lv77_floor1 : M.lv77_floor2;
  const wm = zs < 6 ? M.lv77_wall : M.lv77_wall2;
  const al = alcoveFor(k);
  const az0 = al ? zb.z0 + al.off : -1e9, az1 = az0 + 6;
  for (let z = zb.z0; z < zb.z1; z++) {
    for (let x = AX; x < AX + AW; x++) carve(zb, CF, x, z, 0, CH, fm, M.lv77_ceil, wm);
    // the aisle's two walls (behind the shelves)
    const inAl = al && z >= az0 && z < az1;
    if (!(inAl && al.side < 0)) zb.setWall(AX, z, 'W', W.WALL, wm, wm);
    if (!(inAl && al.side > 0)) zb.setWall(AX + AW, z, 'W', W.WALL, wm, wm);
  }
  // shelving: one bay per metre, product pattern per bay
  const top = M.lv77_shelf_top, sd = M.lv77_shelf_side;
  for (let z = zb.z0; z < zb.z1; z++) {
    const inAl = al && z >= az0 && z < az1;
    for (const side of [-1, 1]) {
      if (inAl && al.side === side) continue;
      const x0 = side < 0 ? AX : AX + AW - SD;
      const mat = bayMat(zs, z, side);
      // front face toward the aisle: +x on the west side, -x on the east side
      const mats = side < 0 ? [mat, sd, top, null, sd, sd] : [sd, mat, top, null, sd, sd];
      zb.box(x0, 0, z, x0 + SD, SH, z + 1, mats, { uv: 'world' });
    }
  }
  // shelf boards stand a little proud of the products (continuous per zone)
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? AX + SD - 0.03 : AX + AW - SD - 0.05;
    const spans = al && al.side === side ? [[zb.z0, az0], [az1, zb.z1]] : [[zb.z0, zb.z1]];
    for (let m = 0; m * 2.2 < SH - 0.1; m++) {
      for (const [y0, h] of LEVELS) {
        const y = m * 2.2 + 2.2 * (1 - (y0 + h + 1) / 64);
        if (y + 0.03 > SH) continue;
        for (const [a, b] of spans) if (b > a) cbox(zb, x0, y, a, x0 + 0.08, y + 0.035, b, M.lv77_board, { sub: 99 });
      }
    }
  }
  // lights along the aisle (more dead ones farther out) and a ceiling speaker
  const failP = 0.04 + zs * 0.05;
  for (let z = zb.z0 + 2; z < zb.z1; z += 4) {
    const u = hr(z, k, 91);
    const state = u < failP ? 'off' : u < failP + 0.07 ? (u < failP + 0.03 ? 'dying' : 'flicker') : 'on';
    ceilingLight(zb, AX + AW / 2, z + 0.5, 'troffer', state, { color: LIGHT[zs] });
  }
  // hanging aisle signs every 16 m, two-sided, with the stage's wording
  for (let z = zb.z0 + 8; z < zb.z1; z += 16) {
    const mat = M[`lv77_sign${clamp(zs + (hr(z, k, 55) < 0.25 ? 1 : 0), 0, 7)}`];
    const y = CH - 0.95;
    signBoard(zb, AX + AW / 2, y, z + 0.5, 1.9, 0.75, 'x', mat, mat, M.lv77_rod);
    for (const dx of [-0.8, 0.8]) zb.box(AX + AW / 2 + dx - 0.015, y + 0.75, z + 0.5 - 0.015, AX + AW / 2 + dx + 0.015, CH, z + 0.5 + 0.015, M.lv77_rod, { collide: false });
  }
  // the alcove
  if (al) {
    const side = al.side;
    const bx = side < 0 ? AX - 5 : AX + AW + 5;       // back wall line
    for (let z = az0; z < az1; z++) {
      for (let c = 1; c <= 5; c++) {
        const x = side < 0 ? AX - c : AX + AW + c - 1;
        carve(zb, CF, x, z, 0, CH, M.concrete_floor, M.lv77_ceil, wm);
      }
    }
    for (let c = 1; c <= 5; c++) {
      const x = side < 0 ? AX - c : AX + AW + c - 1;
      zb.setWall(x, az0, 'N', W.WALL, wm, wm);
      zb.setWall(x, az1, 'N', W.WALL, wm, wm);
    }
    zb.setWall(bx, az0, 'W', W.WALL, wm, wm);
    for (let z = az0 + 1; z < az1; z++) zb.setWall(bx, z, 'W', W.WALL, wm, wm);
    const dxp = side < 0 ? bx + 0.13 : bx - 0.13;
    levelDoor(zb, dxp, az0 + 3.5, side < 0 ? Math.PI / 2 : -Math.PI / 2, { y: 0 });
    ceilingLight(zb, side < 0 ? AX - 2.5 : AX + AW + 2.5, az0 + 3.5, 'bulb', 'on', { color: [1.0, 0.86, 0.6], rad: 6 });
    // a pallet of cardboard and a cart, the way an ordinary stockroom nook looks
    const px = side < 0 ? AX - 3.5 : AX + AW + 3.5;
    zb.box(px - 0.6, 0, az0 + 1.0 - 0.5, px + 0.6, 0.14, az0 + 1.0 + 0.5, M.lv77_pallet);
    zb.prop('box_stack', px, 0.14, az0 + 1.0, hr(k, 5, 6) * 3, { n: 4 });
    zb.prop('shopping_cart', px - 0.2, 0, az0 + 5.0, hr(k, 6, 6) * 6.28);
  }
  // now and then a loose cart left in the aisle
  if (k !== 0 && hr(k, 8, 77) < 0.5) zb.prop('shopping_cart', AX + 1.6 + hr(k, 9, 3), 0, zb.z0 + 10 + hr(k, 10, 3) * 12, hr(k, 11, 3) * 6.28);
  // speakers: muzak that goes wrong with distance
  const snd = zs < 2 ? 'lv77_muzak_a' : zs < 5 ? 'lv77_muzak_b' : 'lv77_muzak_c';
  for (let z = zb.z0 + 6; z < zb.z1; z += 16) zb.emitter(AX + AW / 2, CH - 0.2, z + 0.5, snd, { vol: 0.6, rad: 13 });
  zb.emitter(AX + AW / 2, 1.2, zb.z0 + 20, 'lv77_cooler', { vol: 0.7, rad: 10 });
}

defineZone('lv77_aisle', {
  ...LEVEL_ZONE,
  params: (zone) => {
    const s = stageOfZ((zone.z0 + zone.z1) / 2);
    return {
      ambient: [0.3 + s * 0.005, 0.32, 0.31 - s * 0.01],
      env: env({ fog: FOG[s], fogNear: 7, fogFar: 74 - s * 3, hum: 0.5 + s * 0.04, hvac: 0.3, reverb: 'corridor', tone: 'lv77_store' }),
    };
  },
  gen,
});

defineLevel(N, {
  name: 'THE ENDLESS GROCERY AISLE',
  zoneType: (ctx) => (ctx.x0 === 0 ? 'lv77_aisle' : null),
  zoneSize: G,
  entry: { x: AX + AW / 2, y: 0, z: 17.2, yaw: 0 },
  doorDensity: 0,
  viewRadius: 5,
  light: { phoneRadius: 3.6, phoneIntensity: 0.2 },
  // a store chime far off along the aisle; nothing ever follows it
  script(ctx, dt) {
    const s = ctx.state;
    s.t = (s.t ?? 35) - dt;
    if (s.t > 0) return;
    s.t = 70 + Math.random() * 90;
    const p = ctx.player, dir = Math.random() < 0.5 ? -1 : 1;
    ctx.game.audioCall('play', 'lv77_chime', p.x, p.y + 2.5, p.z + dir * 38, { distant: true, vol: 0.9 });
  },
});
