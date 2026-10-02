// Level 5 (Ornate Hotel): textures and materials. Gold leaf, red velvet, black and ivory marble.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';

const T = defineTexture;
const GOLD = [214, 170, 66], GOLD_D = [150, 108, 40], GOLD_L = [244, 214, 120];
const RED = [118, 22, 28], RED_D = [66, 10, 16], RED_L = [158, 34, 38];

// black and ivory marble, one metre per check, gold inlay between
T('lv5_floor', (p) => {
  for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
    const dark = (cx + cy) % 2 === 0;
    p.rect(cx * 32, cy * 32, 32, 32, dark ? [24, 20, 26] : [226, 214, 188]);
  }
  p.noise(6, 0.1, 3);
  p.map((x, y, c) => {
    const v = Math.abs(pnoise(x, y, 8, 21) - 0.5);
    const k = v < 0.035 ? 0.72 : 1;
    return [c[0] * k, c[1] * k, c[2] * k];
  });
  for (const t of [0, 32]) { p.rect(0, t, 64, 1, GOLD_D); p.rect(t, 0, 1, 64, GOLD_D); p.rect(0, t + 1, 64, 1, GOLD, 0.6); p.rect(t + 1, 0, 1, 64, GOLD, 0.6); }
}, 12);

// carpet runner: one tile spans the runner's width (the brush maps it exactly)
function runner(p, ns, cross) {
  p.map((x, y) => {
    const a = ns ? x : y, b = ns ? y : x;
    let d = Math.min(a, 63 - a);
    if (cross) d = Math.min(d, Math.min(b, 63 - b));
    if (d < 2) return GOLD;
    if (d < 4) return RED_D;
    if (d < 5) return GOLD_D;
    if (d < 7) return RED;
    if (d < 9) return RED_D;
    const k1 = (a + b) & 15, k2 = (a - b + 64) & 15;
    if (k1 === 0 || k2 === 0) return GOLD_D;
    if (k1 === 8 && k2 === 8) return GOLD_L;
    const cell = (k1 > 4 && k1 < 12 && k2 > 4 && k2 < 12);
    return cell ? RED_L : RED;
  });
  p.grain(0.05);
}
T('lv5_carpet_ns', (p) => runner(p, true, false), 12);
T('lv5_carpet_ew', (p) => runner(p, false, false), 12);
T('lv5_carpet_x', (p) => runner(p, true, true), 12);

// damask wall covering, one motif per 32 px
function damask(p, base, dk, lt) {
  p.fill(base);
  p.noise(3, 0.05, 2);
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const cx = tx * 32 + 16 + (ty % 2 ? 0 : 0), cy = ty * 32 + 16;
    for (let k = -12; k <= 12; k++) {
      const w = Math.max(0, 6 - Math.abs(k) * 0.5 + (Math.abs(k) < 4 ? 3 : 0));
      p.set(cx - w, cy + k, dk, 0.9); p.set(cx + w, cy + k, dk, 0.9);
      if (Math.abs(k) < 9) p.rect(cx - w + 1, cy + k, Math.max(0, w * 2 - 1), 1, dk, 0.28);
    }
    p.disc(cx, cy, 2, lt); p.disc(cx, cy - 8, 1, lt); p.disc(cx, cy + 8, 1, lt);
    p.set(cx - 9, cy, dk); p.set(cx + 9, cy, dk);
  }
  for (let x = 0; x < 64; x += 32) p.rect(x, 0, 1, 64, dk, 0.3);
  p.grain(0.025);
}
T('lv5_wall', (p) => damask(p, [222, 194, 132], [170, 132, 66], [250, 230, 170]), 12);
T('lv5_wall_red', (p) => damask(p, [128, 26, 32], [196, 150, 62], [226, 190, 96]), 12);
T('lv5_wall_green', (p) => damask(p, [30, 74, 54], [196, 150, 62], [226, 190, 96]), 12);

// mahogany panelling
T('lv5_dado', (p) => {
  p.fill([88, 44, 26]);
  p.noise(8, 0.12, 3);
  p.map((x, y, c) => { const g = 0.92 + 0.08 * pnoise(x * 0.4, y * 3, 32, 5); return [c[0] * g, c[1] * g, c[2] * g]; });
  p.rect(0, 0, 64, 5, [70, 34, 20]); p.rect(0, 59, 64, 5, [70, 34, 20]);
  p.rect(5, 8, 54, 48, [66, 32, 20]);
  p.bevel(5, 8, 54, 48, -0.2, 0.3);
  p.frame(8, 11, 48, 42, GOLD_D, 0.8);
  p.grain(0.04);
}, 10);

T('lv5_gold', (p) => {
  p.fill(GOLD);
  p.noise(4, 0.1, 2);
  for (let y = 0; y < 64; y += 8) { p.rect(0, y, 64, 1, GOLD_L, 0.7); p.rect(0, y + 4, 64, 1, GOLD_D, 0.6); }
  p.speckle(40, [255, 236, 160], 0.4, 0.9);
  p.grain(0.04);
}, 8);

T('lv5_coffer', (p) => {
  p.fill([58, 26, 22]);
  p.noise(4, 0.08, 2);
  p.rect(5, 5, 54, 54, [36, 15, 14]);
  p.frame(5, 5, 54, 54, GOLD, 0.9);
  p.frame(8, 8, 48, 48, GOLD_D, 0.8);
  p.disc(32, 32, 9, GOLD_D); p.disc(32, 32, 6, GOLD); p.disc(32, 32, 2, GOLD_L);
  for (const [dx, dy] of [[-18, -18], [18, -18], [-18, 18], [18, 18]]) p.disc(32 + dx, 32 + dy, 3, GOLD_D);
  p.grain(0.04);
}, 10);

T('lv5_column', (p) => {
  p.fill([230, 220, 198]);
  p.noise(5, 0.07, 3);
  for (let x = 0; x < 64; x += 8) { p.rect(x, 0, 1, 64, [186, 172, 146], 0.8); p.rect(x + 1, 0, 1, 64, [244, 238, 220], 0.5); }
  p.map((x, y, c) => { const v = Math.abs(pnoise(x, y, 8, 31) - 0.5); const k = v < 0.03 ? 0.8 : 1; return [c[0] * k, c[1] * k, c[2] * k]; });
}, 10);

T('lv5_door', (p) => {
  p.fill([86, 42, 24]);
  p.noise(8, 0.1, 3);
  p.frame(0, 0, 64, 64, [40, 18, 10]);
  for (const [y, h] of [[6, 24], [34, 24]]) {
    p.rect(8, y, 48, h, [62, 30, 18]);
    p.bevel(8, y, 48, h, -0.2, 0.3);
    p.frame(11, y + 3, 42, h - 6, GOLD, 0.85);
  }
  p.disc(51, 32, 3, GOLD_L); p.disc(51, 32, 1.5, GOLD_D);
  p.grain(0.04);
}, 12);

T('lv5_plate', (p) => { p.fill([12, 10, 14]); p.noise(6, 0.1, 2); p.rect(0, 0, 64, 2, [30, 26, 34]); }, 4);

// paintings: dark oils in gold frames (landscapes and still lifes: nobody in them)
function frameArt(p, inner) {
  p.fill(GOLD);
  p.rect(0, 0, 64, 64, GOLD);
  p.frame(0, 0, 64, 64, GOLD_D);
  p.frame(1, 1, 62, 62, GOLD_L, 0.7);
  p.frame(5, 5, 54, 54, GOLD_D);
  inner(6, 6, 52, 52);
}
T('lv5_paint_a', (p) => frameArt(p, (x0, y0, w, h) => {
  for (let y = 0; y < h; y++) p.rect(x0, y0 + y, w, 1, y < 30 ? [Math.round(170 - y * 3), Math.round(90 + y * 1.2), Math.round(60 + y * 2.2)] : [30, 26, 24]);
  p.disc(x0 + 34, y0 + 24, 6, [250, 220, 140], 1, 2);
  for (let x = 0; x < w; x++) { const hh = 30 + Math.round(6 * Math.sin(x * 0.18) + 4 * Math.sin(x * 0.45 + 1)); p.rect(x0 + x, y0 + hh, 1, h - hh, [24, 30, 26]); }
  p.rect(x0, y0 + 44, w, 8, [18, 24, 28]);
}), 12);
T('lv5_paint_b', (p) => frameArt(p, (x0, y0, w, h) => {
  for (let y = 0; y < h; y++) p.rect(x0, y0 + y, w, 1, y < 22 ? [20 + y, 24 + y, 56 + y * 2] : [16, 40 + (y - 22), 52 + (y - 22)]);
  p.disc(x0 + 14, y0 + 12, 4, [236, 232, 214], 1, 1.5);
  for (let k = 0; k < 8; k++) p.rect(x0 + 12 + (k % 3) * 2 - 2, y0 + 24 + k * 3, 5 + (k % 2) * 3, 1, [150, 180, 190], 0.6);
}), 12);
T('lv5_paint_c', (p) => frameArt(p, (x0, y0, w, h) => {
  p.rect(x0, y0, w, h, [28, 20, 18]);
  p.rect(x0, y0 + 40, w, 12, [60, 36, 24]);
  p.rect(x0 + 18, y0 + 24, 16, 18, [150, 40, 34]); p.rect(x0 + 22, y0 + 18, 8, 7, [150, 40, 34]);
  p.rect(x0 + 20, y0 + 28, 12, 2, GOLD_L, 0.8);
  for (const [dx, dy, c] of [[20, 12, [220, 190, 90]], [26, 8, [200, 60, 50]], [30, 13, [220, 190, 90]], [24, 14, [60, 120, 70]]]) p.disc(x0 + dx, y0 + dy, 3, c);
}), 12);
T('lv5_mirror', (p) => {
  p.fill(GOLD);
  p.frame(0, 0, 64, 64, GOLD_D); p.frame(1, 1, 62, 62, GOLD_L, 0.7); p.frame(5, 5, 54, 54, GOLD_D);
  p.map((x, y, c) => {
    if (x < 6 || x > 57 || y < 6 || y > 57) return c;
    const g = 150 + 40 * Math.sin((x + y) * 0.35) * 0.4 + (y * 0.5);
    const streak = ((x - y + 64) % 24) < 3 ? 40 : 0;
    return [g * 0.78 + streak, g * 0.86 + streak, g + streak];
  });
}, 12);
T('lv5_curtain', (p) => {
  p.map((x, y) => {
    const f = 0.5 + 0.5 * Math.sin((x / 64) * Math.PI * 8);
    const g = 0.55 + f * 0.6;
    return [140 * g, 22 * g, 30 * g];
  });
  p.noise(4, 0.06, 2); p.grain(0.04);
  p.rect(0, 0, 64, 3, GOLD_D);
}, 10);
T('lv5_moon', (p) => {
  for (let y = 0; y < 64; y++) p.rect(0, y, 64, 1, [24 + y * 0.3, 30 + y * 0.4, 70 + y * 0.6]);
  p.disc(42, 18, 7, [240, 238, 216], 1, 2);
  p.speckle(30, [220, 224, 255], 0.5, 1);
  p.rect(30, 0, 4, 64, [60, 40, 30]); p.rect(0, 30, 64, 4, [60, 40, 30]);
  p.frame(0, 0, 64, 64, [60, 40, 30]); p.frame(1, 1, 62, 62, [60, 40, 30]);
}, 12);
T('lv5_parquet', (p) => {
  p.fill([132, 82, 40]);
  for (let by = 0; by < 8; by++) for (let bx = 0; bx < 8; bx++) {
    const horiz = (bx + by) % 2 === 0;
    const t = 0.82 + 0.3 * pnoise(bx * 8, by * 8, 8, 9);
    for (let k = 0; k < 8; k++) {
      p.rect(bx * 8 + (horiz ? 0 : k), by * 8 + (horiz ? k : 0), horiz ? 8 : 1, horiz ? 1 : 8, [150 * t + (k % 2) * 8, 92 * t + (k % 2) * 5, 44 * t], 1);
    }
    p.frame(bx * 8, by * 8, 8, 8, [70, 38, 20], 0.6);
  }
  p.grain(0.03);
}, 12);
T('lv5_bedspread', (p) => {
  p.fill([140, 30, 36]);
  for (let k = -64; k < 128; k += 12) { p.line(k, 0, k + 64, 64, GOLD_D, 0.8); p.line(k + 64, 0, k, 64, GOLD_D, 0.8); }
  p.disc(32, 32, 7, GOLD); p.disc(32, 32, 3, RED_D);
  p.noise(3, 0.1, 2); p.grain(0.05);
}, 8);
T('lv5_leaf', (p) => {
  p.fill([42, 104, 52]);
  p.clearAlpha(0);
  const blade = (x0, y0, x1, y1, w) => {
    const n = 40;
    for (let s = 0; s <= n; s++) {
      const t = s / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, ww = w * Math.sin(Math.min(1, t * 1.2) * Math.PI * 0.9) * (1 - t * 0.3);
      for (let k = -Math.ceil(ww); k <= Math.ceil(ww); k++) {
        const px = Math.round(x + k), py = Math.round(y);
        p.set(px, py, [30 + Math.abs(k) * 6 + t * 10, 90 + t * 40 - Math.abs(k) * 4, 44 + t * 12]);
        p.alpha(px, py, 255);
      }
    }
  };
  blade(32, 62, 8, 6, 5); blade(32, 62, 56, 8, 5); blade(32, 62, 32, 0, 5); blade(32, 62, 18, 16, 4); blade(32, 62, 46, 18, 4);
  blade(32, 62, 2, 32, 4); blade(32, 62, 62, 34, 4);
}, 8);
T('lv5_marble_wall', (p) => {
  p.fill([236, 228, 208]);
  p.noise(4, 0.06, 3);
  p.map((x, y, c) => { const v = Math.abs(pnoise(x + y * 0.4, y, 6, 3) - 0.5); const k = v < 0.04 ? 0.8 : 1; return [c[0] * k, c[1] * k, c[2] * k]; });
}, 10);

// stained glass skylight: one tile for the whole hall ceiling panel, lit from above
T('lv5_skylight', (p) => {
  const cols = [[238, 176, 62], [190, 52, 46], [72, 108, 196], [78, 156, 104], [244, 214, 140]];
  p.map((x, y) => {
    const dx = x - 31.5, dy = y - 31.5, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const ring = Math.floor(r / 8), spoke = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 16 + ring * 0.5);
    const lead = (r % 8 < 1.1) || (Math.abs(((a + Math.PI) / (Math.PI * 2)) * 16 + ring * 0.5 - Math.round(((a + Math.PI) / (Math.PI * 2)) * 16 + ring * 0.5)) < 0.07 * (1 + 4 / (r + 4)));
    if (lead || x < 1 || y < 1 || x > 62 || y > 62) return [34, 26, 20];
    if (r < 6) return [250, 230, 160];
    const k = (ring * 3 + spoke * 7 + (ring % 2) * 2) % cols.length;
    const c = cols[(k + cols.length) % cols.length];
    const g = 0.86 + 0.14 * Math.sin(x * 0.7 + y * 0.4);
    return [c[0] * g, c[1] * g, c[2] * g];
  });
}, 14);

// ------------------------------------------------------------------ materials
defineMaterial('lv5_floor', 'lv5_floor', { s: 2, surf: 'tile', stain: 0.04 });
defineMaterial('lv5_carpet_ns', 'lv5_carpet_ns', { s: 4, surf: 'carpet' });
defineMaterial('lv5_carpet_ew', 'lv5_carpet_ew', { s: 4, surf: 'carpet' });
defineMaterial('lv5_carpet_x', 'lv5_carpet_x', { s: 4, surf: 'carpet' });
defineMaterial('lv5_wall', 'lv5_wall', { s: 2, surf: 'drywall', stain: 0.1 });
defineMaterial('lv5_wall_red', 'lv5_wall_red', { s: 2, surf: 'drywall', stain: 0.08 });
defineMaterial('lv5_wall_green', 'lv5_wall_green', { s: 2, surf: 'drywall', stain: 0.08 });
defineMaterial('lv5_dado', 'lv5_dado', { su: 1, sv: 1.2, surf: 'wood' });
defineMaterial('lv5_gold', 'lv5_gold', { s: 1, surf: 'metal' });
defineMaterial('lv5_coffer', 'lv5_coffer', { s: 2, surf: 'drywall' });
defineMaterial('lv5_column', 'lv5_column', { s: 1, surf: 'tile' });
defineMaterial('lv5_plate', 'lv5_plate', { s: 1, surf: 'metal' });
defineMaterial('lv5_curtain', 'lv5_curtain', { s: 1.4, surf: 'carpet' });
defineMaterial('lv5_parquet', 'lv5_parquet', { s: 1.6, surf: 'wood' });
defineMaterial('lv5_bedspread', 'lv5_bedspread', { s: 1, surf: 'carpet' });
defineMaterial('lv5_marble_wall', 'lv5_marble_wall', { s: 2, surf: 'tile' });
defineMaterial('lv5_moon', 'lv5_moon', { s: 1, flags: VF.FULLBRIGHT, glow: 0.8 });
defineMaterial('lv5_sky', 'lv5_skylight', { s: 9, flags: VF.FULLBRIGHT, glow: 0.9 });
