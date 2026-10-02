// Level 21 (Numbered Hotel): textures and materials. Pale painted walls with a navy dado and one
// accent colour per wing, slate carpet with a guide line down the middle, terrazzo, a huge directory.
import { defineTexture } from '../../gfx/textures.js';
import { rasterText, FONT_ADV } from '../../gfx/font.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';

const T = defineTexture;
export const ACCENT = [[236, 124, 40], [34, 160, 170], [208, 52, 122], [150, 192, 54]];
const WALL = [208, 218, 224], NAVY = [38, 50, 72];

// painted wall: pale above, a navy dado with an accent line (the texture is one ceiling height tall)
ACCENT.forEach((ac, k) => {
  T('lv21_wall_' + k, (p) => {
    p.fill(WALL);
    p.noise(4, 0.04, 2);
    p.map((x, y, c) => {
      // y runs down the image: the bottom 24 rows are the dado (floor at the bottom)
      if (y >= 41) return c.map((v, i) => NAVY[i] * (0.92 + 0.08 * pnoise(x, y, 8, 3)));
      if (y >= 39) return ac;
      if (y >= 37) return [226, 234, 238];
      return c;
    });
    for (let x = 0; x < 64; x += 32) p.rect(x, 0, 1, 37, [188, 198, 206], 0.6);
    p.grain(0.025);
  }, 12);
});

// carpet tiles with a slight shade change from tile to tile
T('lv21_carpet', (p) => {
  p.fill([54, 64, 82]);
  p.map((x, y, c) => {
    const tx = Math.floor(x / 32), ty = Math.floor(y / 32);
    const k = 0.9 + 0.12 * ((tx * 7 + ty * 13) % 3) / 2;
    return [c[0] * k, c[1] * k, c[2] * k];
  });
  p.noise(16, 0.08, 2);
  for (let y = 0; y < 64; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < 64; x += 4) p.set(x, y, [74, 86, 108], 0.7);
  p.rect(0, 0, 64, 1, [30, 36, 48], 0.8); p.rect(0, 32, 64, 1, [30, 36, 48], 0.8); p.rect(0, 0, 1, 64, [30, 36, 48], 0.8); p.rect(32, 0, 1, 64, [30, 36, 48], 0.8);
  p.grain(0.05);
}, 12);
// the same with a guide line down the middle of the cell (ns: along z / ew: along x)
ACCENT.forEach((ac, k) => {
  for (const ns of [true, false]) {
    T('lv21_stripe_' + (ns ? 'ns' : 'ew') + '_' + k, (p) => {
      p.fill([54, 64, 82]);
      p.noise(16, 0.08, 2);
      for (let y = 0; y < 64; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < 64; x += 4) p.set(x, y, [74, 86, 108], 0.7);
      p.map((x, y, c) => { const a = ns ? x : y; return a >= 22 && a < 42 ? (a >= 24 && a < 40 ? ac : [230, 236, 240]) : c; });
      p.grain(0.05);
    }, 12);
  }
});

T('lv21_ceil', (p) => {
  p.fill([226, 230, 230]);
  p.noise(8, 0.05, 2);
  p.speckle(90, [180, 186, 188], 0.4, 0.8);
  p.rect(0, 0, 64, 1, [150, 156, 158]); p.rect(0, 0, 1, 64, [150, 156, 158]); p.rect(0, 32, 64, 1, [170, 176, 178]); p.rect(32, 0, 1, 64, [170, 176, 178]);
}, 8);
T('lv21_terrazzo', (p) => {
  p.fill([178, 182, 184]);
  p.noise(6, 0.06, 3);
  const cols = [[236, 238, 236], [96, 108, 124], [214, 190, 150], [128, 134, 138]];
  for (let i = 0; i < 160; i++) {
    const x = (i * 37) % 64, y = (i * 53 + 11) % 64, c = cols[i % 4];
    p.rect(x, y, 1 + (i % 3 === 0 ? 1 : 0), 1, c, 0.9);
  }
  for (const t of [0, 32]) { p.rect(0, t, 64, 1, [120, 126, 130], 0.8); p.rect(t, 0, 1, 64, [120, 126, 130], 0.8); }
}, 14);
T('lv21_door', (p) => {
  p.fill([172, 184, 188]);
  p.noise(8, 0.05, 2);
  p.rect(4, 4, 56, 36, [160, 172, 176]); p.bevel(4, 4, 56, 36, 0.12, -0.15);
  p.rect(4, 44, 56, 16, [160, 172, 176]); p.bevel(4, 44, 56, 16, 0.12, -0.15);
  p.rect(0, 58, 64, 6, [120, 130, 134]);
  p.rect(48, 36, 8, 3, [210, 214, 210]); p.rect(52, 33, 3, 6, [210, 214, 210]);
  p.frame(0, 0, 64, 64, [100, 110, 114]);
  p.grain(0.03);
}, 10);
T('lv21_plaque', (p) => { p.fill([22, 30, 46]); p.noise(6, 0.08, 2); p.frame(0, 0, 64, 64, [210, 216, 218]); p.frame(2, 2, 60, 60, [60, 74, 100]); }, 6);
T('lv21_plain_dark', (p) => { p.fill([34, 44, 62]); p.noise(6, 0.08, 2); }, 4);
T('lv21_steel', (p) => {
  p.fill([150, 158, 164]); p.noise(6, 0.06, 2);
  for (let y = 0; y < 64; y += 4) p.rect(0, y, 64, 1, [184, 192, 196], 0.5);
}, 6);
T('lv21_col', (p) => {
  p.fill([222, 228, 230]); p.noise(5, 0.04, 2);
  p.rect(0, 52, 64, 12, NAVY); p.rect(0, 50, 64, 2, ACCENT[0]);
  p.rect(0, 0, 64, 6, [176, 186, 192]);
  p.grain(0.02);
}, 8);

// the hotel's key rack: pigeonholes with a key in every one
T('lv21_keys', (p) => {
  p.fill([60, 40, 28]);
  for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 8; gx++) {
    p.rect(gx * 8 + 1, gy * 8 + 1, 6, 6, [22, 16, 12]);
    if ((gx * 5 + gy * 3) % 7 !== 0) { p.rect(gx * 8 + 3, gy * 8 + 2, 2, 3, [212, 176, 70]); p.rect(gx * 8 + 3, gy * 8 + 5, 2, 1, [150, 112, 40]); }
  }
  p.grain(0.04);
}, 10);
T('lv21_desk', (p) => { p.fill([200, 200, 192]); p.noise(5, 0.06, 2); p.rect(0, 0, 64, 4, [150, 150, 142]); p.grain(0.03); }, 6);
T('lv21_bed', (p) => {
  p.fill([218, 222, 224]); p.rect(0, 0, 64, 20, [52, 72, 108]); p.rect(0, 20, 64, 2, [30, 46, 78]);
  p.noise(5, 0.05, 2); p.grain(0.03);
}, 8);
ACCENT.forEach((ac, k) => T('lv21_acc_' + k, (p) => { p.fill(ac); p.noise(6, 0.06, 2); p.rect(0, 0, 64, 2, [255, 255, 255], 0.25); }, 4));
T('lv21_stencil', (p) => { p.fill([34, 44, 62]); p.noise(6, 0.08, 2); }, 4);

// ------------------------------------------------------------------ the directory
// A board of 6 x 3 tiles, painted as one picture and cut into tiles
export const DIR_W = 6, DIR_H = 3;
const DIR_LINES = [
  // [text, scale, colour, x (px from left, -1 = centred)]
  ['ROOM DIRECTORY', 3, [250, 250, 244], -1, 6],
  ['', 1, null, 0, 0],
  ['1 - 99', 2, [240, 240, 232], 8, 40],
  ['100 - 9,999', 2, [240, 240, 232], 8, 58],
  ['10,000 - 999,999', 2, [240, 240, 232], 8, 76],
  ['1,000,000 - 99,999,999', 2, [240, 240, 232], 8, 94],
  ['100,000,000 - 9,999,999,999', 2, [240, 240, 232], 8, 112],
  ['10,000,000,000 - AND SO ON', 2, [240, 240, 232], 8, 130],
  ['LIFTS: OUT OF SERVICE', 2, [236, 124, 40], 8, 160],
];
const ARROWS = [['↑', 40], ['←', 58], ['→', 76], ['↑', 94], ['→', 112], ['←', 130]];
function paintDirectory(plot) {
  const W_ = DIR_W * 64;
  const put = (str, scale, col, x, y) => rasterText(str, x, y, scale, (px, py) => plot(px, py, col));
  const tw = (s, sc) => s.length * FONT_ADV * sc - sc;
  for (const [txt, sc, col, x, y] of DIR_LINES) if (txt) put(txt, sc, col, x < 0 ? Math.round((W_ - tw(txt, sc)) / 2) : x, y);
  for (const [a, y] of ARROWS) put(a, 2, [236, 124, 40], W_ - 28, y);
}
for (let ty = 0; ty < DIR_H; ty++) for (let tx = 0; tx < DIR_W; tx++) {
  T('lv21_dir_' + tx + '_' + ty, (p) => {
    p.fill([22, 30, 46]);
    p.noise(6, 0.05, 2);
    paintDirectory((px, py, col) => { const x = px - tx * 64, y = py - ty * 64; if (x >= 0 && x < 64 && y >= 0 && y < 64) p.set(x, y, col); });
    if (ty === 0) p.rect(0, 0, 64, 2, [210, 216, 218]);
    if (ty === DIR_H - 1) p.rect(0, 62, 64, 2, [210, 216, 218]);
    if (tx === 0) p.rect(0, 0, 2, 64, [210, 216, 218]);
    if (tx === DIR_W - 1) p.rect(62, 0, 2, 64, [210, 216, 218]);
    if (ty === 0 || ty === DIR_H - 1 || true) { /* rule under the title */ }
    if (ty === 0) p.rect(0, 30, 64, 1, [90, 104, 130]);
  }, 10);
}

// ------------------------------------------------------------------ materials
ACCENT.forEach((ac, k) => {
  defineMaterial('lv21_wall_' + k, 'lv21_wall_' + k, { su: 2, sv: 3.2, surf: 'drywall', stain: 0.05 });
  defineMaterial('lv21_stripe_ns_' + k, 'lv21_stripe_ns_' + k, { s: 1, surf: 'carpet' });
  defineMaterial('lv21_stripe_ew_' + k, 'lv21_stripe_ew_' + k, { s: 1, surf: 'carpet' });
});
ACCENT.forEach((ac, k) => defineMaterial('lv21_acc_' + k, 'lv21_acc_' + k, { s: 1, surf: 'metal' }));
defineMaterial('lv21_zero', 'g01_dg_0', { s: 1, surf: 'carpet' });
defineMaterial('lv21_carpet', 'lv21_carpet', { s: 2, surf: 'carpet', stain: 0.06 });
defineMaterial('lv21_ceil', 'lv21_ceil', { s: 2, surf: 'drywall' });
defineMaterial('lv21_terrazzo', 'lv21_terrazzo', { s: 2.5, surf: 'tile' });
defineMaterial('lv21_door', 'lv21_door', { s: 1, surf: 'metal' });
defineMaterial('lv21_plaque', 'lv21_plaque', { s: 1, surf: 'metal' });
defineMaterial('lv21_plain_dark', 'lv21_plain_dark', { s: 1, surf: 'metal' });
defineMaterial('lv21_steel', 'lv21_steel', { s: 1, surf: 'metal' });
defineMaterial('lv21_col', 'lv21_col', { su: 1, sv: 3.2, surf: 'tile' });
defineMaterial('lv21_keys', 'lv21_keys', { s: 1, surf: 'wood' });
defineMaterial('lv21_desk', 'lv21_desk', { s: 1, surf: 'plastic' });
defineMaterial('lv21_bed', 'lv21_bed', { s: 1, surf: 'carpet' });
export { VF };
