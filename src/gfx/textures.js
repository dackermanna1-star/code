// Procedural texture library. Every texture is a 64x64 tile reduced to a small CLUT palette and
// 15-bit colour, the way PS1 textures were stored.
import { Painter, pnoise, pfbm, finalize, TS } from './texgen.js';
import { strHash, RNG } from '../core/rng.js';

const DEFS = [];
function T(name, fn, colors = 16) { DEFS.push({ name, fn, colors }); }
// Other modules may register extra textures (before generateTextures() runs at boot).
export const defineTexture = T;

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mulc = (c, m) => [c[0] * m, c[1] * m, c[2] * m];

// ---------------------------------------------------------------- yellow backrooms
function stripeWallpaper(p, base) {
  p.fill(base);
  p.noise(2, 0.05, 2, p.seed + 1);
  const dark = mulc(base, 0.88), light = mulc(base, 1.07);
  for (let x = 0; x < TS; x += 8) {
    for (let y = 0; y < TS; y++) {
      p.set(x, y, dark, 0.65);
      p.set(x + 1, y, light, 0.35);
    }
    // small chevron dashes between the lines
    for (let y = (x / 8) % 2 ? 2 : 0; y < TS; y += 4) {
      p.set(x + 4, y, dark, 0.35);
      p.set(x + 3, y + 1, dark, 0.22);
      p.set(x + 5, y + 1, dark, 0.22);
    }
  }
  p.grain(0.025);
}
T('wp_stripe', (p) => stripeWallpaper(p, [198, 182, 104]));
T('wp_stripe2', (p) => stripeWallpaper(p, [206, 188, 116]));
T('wp_plain', (p) => {
  p.fill([204, 188, 112]);
  p.noise(3, 0.07, 3);
  p.grain(0.03);
});
T('wp_damask', (p) => {
  p.fill([194, 178, 100]);
  p.noise(2, 0.04, 2);
  const d = [176, 160, 86];
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
    const cx = tx * 16 + 8 + (ty % 2 ? 8 : 0), cy = ty * 16 + 8;
    for (let k = -4; k <= 4; k++) {
      const w = 4 - Math.abs(k);
      p.set(cx - w, cy + k, d, 0.7); p.set(cx + w, cy + k, d, 0.7);
    }
    p.set(cx, cy, d, 0.8); p.set(cx, cy - 1, d, 0.5); p.set(cx, cy + 1, d, 0.5);
  }
  p.grain(0.02);
});
T('wp_stained', (p, r) => {
  stripeWallpaper(p, [192, 175, 98]);
  for (let i = 0; i < 9; i++) p.drip(r.int(0, 63), 0, r.int(12, 50), [110, 88, 46], r.range(0.15, 0.35), r.int(1, 2));
  p.stain(r.int(10, 54), r.int(6, 20), r.range(7, 12), [125, 100, 52], 0.5);
});
T('wp_old', (p, r) => {
  p.fill([176, 156, 84]);
  p.noise(4, 0.1, 3);
  for (let x = 0; x < TS; x += 16) for (let y = 0; y < TS; y++) p.set(x, y, [150, 130, 70], 0.4);
  for (let i = 0; i < 5; i++) p.drip(r.int(0, 63), r.int(0, 10), r.int(20, 60), [90, 72, 40], 0.25, 2);
  p.grain(0.04);
});
T('carpet_y', (p) => {
  p.fill([172, 154, 90]);
  p.noise(8, 0.06, 2);
  p.grain(0.12);
  p.speckle(220, [120, 104, 60], 0.2, 0.45);
});
T('carpet_y2', (p) => {
  p.fill([162, 142, 82]);
  p.noise(4, 0.07, 2);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) if ((x + y) % 4 === 0) p.set(x, y, [140, 122, 70], 0.25);
  p.grain(0.1);
});
T('carpet_wet', (p) => {
  p.fill([170, 152, 88]);
  p.grain(0.12);
  p.map((x, y, c) => {
    const n = pfbm(x, y, 3, 3, p.seed + 5);
    return n > 0.55 ? mulc(c, 0.72) : n > 0.5 ? mulc(c, 0.86) : c;
  });
  p.speckle(150, [110, 95, 55], 0.2, 0.4);
});
function ceilTile(p, base, line) {
  p.fill(base);
  p.grain(0.035);
  p.speckle(380, mulc(base, 0.78), 0.4, 0.8);
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) p.shade(tx * 32, ty * 32, 32, 32, p.rng.range(-0.04, 0.03));
  for (let i = 0; i < TS; i++) {
    p.set(i, 0, line); p.set(i, 32, line); p.set(0, i, line); p.set(32, i, line);
    p.set(i, 1, mulc(base, 1.05), 0.6); p.set(i, 33, mulc(base, 1.05), 0.6);
    p.set(1, i, mulc(base, 1.05), 0.6); p.set(33, i, mulc(base, 1.05), 0.6);
  }
}
T('ceil_tile', (p) => ceilTile(p, [206, 200, 170], [150, 145, 120]));
T('ceil_tile_stain', (p, r) => {
  ceilTile(p, [204, 197, 166], [150, 145, 120]);
  p.stain(r.int(36, 58), r.int(36, 58), 10, [150, 120, 70], 0.7);
  p.stain(r.int(6, 26), r.int(4, 26), 6, [160, 130, 80], 0.5);
});
T('ceil_tile_old', (p) => ceilTile(p, [184, 176, 148], [130, 124, 100]));
T('ceil_tile_white', (p) => ceilTile(p, [214, 214, 206], [160, 160, 155]));
T('light_panel', (p) => {
  p.fill([252, 250, 236]);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) if (x % 4 === 0 || y % 4 === 0) p.set(x, y, [238, 237, 222]);
  p.frame(0, 0, 64, 64, [176, 176, 170]); p.frame(1, 1, 62, 62, [196, 196, 190]); p.frame(2, 2, 60, 60, [214, 214, 206]);
}, 8);
T('light_panel_off', (p) => {
  p.fill([122, 124, 120]);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) if (x % 4 === 0 || y % 4 === 0) p.set(x, y, [108, 110, 106]);
  p.frame(0, 0, 64, 64, [150, 150, 146]); p.frame(1, 1, 62, 62, [140, 140, 136]);
}, 8);
T('troffer', (p) => {
  p.fill([250, 248, 232]);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) if (x % 8 === 0 || y % 6 === 0) p.set(x, y, [210, 210, 200]);
  p.rect(30, 0, 4, 64, [190, 190, 184]);
  p.frame(0, 0, 64, 64, [170, 170, 165]); p.frame(1, 1, 62, 62, [190, 190, 184]);
}, 8);
T('troffer_off', (p) => {
  p.fill([128, 130, 126]);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) if (x % 8 === 0 || y % 6 === 0) p.set(x, y, [110, 112, 108]);
  p.rect(30, 0, 4, 64, [120, 120, 116]);
  p.frame(0, 0, 64, 64, [150, 150, 146]);
}, 8);
T('tube', (p) => {
  p.fill([168, 168, 162]);
  p.rect(0, 20, 64, 24, [236, 236, 228]);
  p.rect(0, 25, 64, 14, [255, 255, 248]);
  p.rect(0, 0, 64, 3, [130, 130, 126]); p.rect(0, 61, 64, 3, [130, 130, 126]);
}, 8);
T('tube_off', (p) => {
  p.fill([150, 150, 146]);
  p.rect(0, 20, 64, 24, [170, 172, 170]);
  p.rect(0, 25, 64, 14, [186, 188, 186]);
}, 8);
T('bulb', (p) => {
  p.fill([255, 236, 190]);
  p.disc(32, 32, 26, [255, 250, 230]);
}, 8);
T('lamp_shade', (p) => {
  p.fill([230, 200, 140]);
  p.noise(4, 0.08);
  for (let y = 0; y < TS; y += 6) for (let x = 0; x < TS; x++) p.set(x, y, [210, 178, 120], 0.4);
});

// ---------------------------------------------------------------- generic surfaces
T('white', (p) => p.fill([255, 255, 255]), 2);
T('black', (p) => p.fill([10, 10, 10]), 2);
T('dark', (p) => { p.fill([36, 33, 30]); p.grain(0.08); }, 8);
T('concrete', (p, r) => {
  p.fill([132, 130, 124]);
  p.noise(4, 0.12, 3);
  p.grain(0.08);
  p.speckle(160, [100, 98, 94], 0.3, 0.7);
  p.speckle(80, [160, 158, 150], 0.3, 0.6);
  for (let k = 0; k < 2; k++) {
    let x = r.int(0, 63), y = r.int(0, 63);
    for (let i = 0; i < 24; i++) { p.set(x, y, [90, 88, 84], 0.6); x += r.int(-1, 1); y += r.chance(0.7) ? 1 : 0; }
  }
});
T('concrete_floor', (p, r) => {
  p.fill([148, 145, 138]);
  p.noise(3, 0.08, 3);
  p.grain(0.05);
  p.speckle(90, [118, 115, 108], 0.2, 0.5);
  p.stain(r.int(10, 50), r.int(10, 50), 9, [110, 106, 98], 0.4);
});
T('concrete_dark', (p) => {
  p.fill([92, 90, 86]);
  p.noise(4, 0.15, 3);
  p.grain(0.1);
  p.speckle(120, [70, 68, 64], 0.3, 0.7);
});
T('concrete_wet', (p) => {
  p.fill([96, 96, 94]);
  p.noise(3, 0.15, 3);
  p.map((x, y, c) => (pfbm(x, y, 4, 2, p.seed + 9) > 0.6 ? mulc(c, 0.7) : c));
  p.grain(0.06);
});
T('cmu', (p) => {
  p.fill([182, 180, 170]);
  p.grain(0.07);
  p.speckle(200, [150, 148, 140], 0.3, 0.6);
  for (let y = 0; y < TS; y += 16) {
    for (let x = 0; x < TS; x++) p.set(x, y, [140, 138, 130]);
    const off = (y / 16) % 2 ? 16 : 0;
    for (let x = off; x < TS + off; x += 32) for (let yy = y; yy < y + 16; yy++) p.set(x, yy, [140, 138, 130]);
  }
});
T('cmu_green', (p) => {
  p.fill([150, 172, 140]);
  p.grain(0.06);
  for (let y = 0; y < TS; y += 16) {
    for (let x = 0; x < TS; x++) p.set(x, y, [118, 138, 110]);
    const off = (y / 16) % 2 ? 16 : 0;
    for (let x = off; x < TS + off; x += 32) for (let yy = y; yy < y + 16; yy++) p.set(x, yy, [118, 138, 110]);
  }
});
T('paint_wall', (p) => { p.fill([198, 194, 184]); p.noise(3, 0.04, 2); p.grain(0.02); });
T('paint_beige', (p) => { p.fill([206, 196, 170]); p.noise(3, 0.05, 2); p.grain(0.02); });
T('paint_green', (p) => { p.fill([142, 166, 136]); p.noise(3, 0.05, 2); p.grain(0.02); });
T('paint_blue', (p) => { p.fill([140, 158, 182]); p.noise(3, 0.05, 2); p.grain(0.02); });
T('paint_cream', (p) => { p.fill([222, 214, 188]); p.noise(3, 0.04, 2); p.grain(0.02); });
T('paint_dirty', (p, r) => {
  p.fill([186, 180, 160]);
  p.noise(3, 0.1, 3);
  for (let i = 0; i < 6; i++) p.drip(r.int(0, 63), 0, r.int(20, 64), [120, 112, 90], 0.2, 2);
  p.grain(0.04);
});
T('drywall_raw', (p, r) => {
  p.fill([176, 170, 152]);
  p.noise(4, 0.04, 2);
  for (const sx of [0, 32]) {
    for (let x = -4; x <= 4; x++) {
      const a = 0.5 * (1 - Math.abs(x) / 5);
      for (let y = 0; y < TS; y++) p.set(sx + x, y, [204, 200, 188], a);
    }
  }
  for (let y = 4; y < TS; y += 12) for (const x of [8, 24, 40, 56]) p.set(x, y, [150, 146, 132], 0.8);
  p.grain(0.03);
});
T('plaster', (p) => { p.fill([222, 218, 204]); p.noise(5, 0.05, 3); p.grain(0.025); });
T('wood', (p) => {
  p.fill([150, 100, 56]);
  p.map((x, y, c) => {
    const g = Math.sin((y + pnoise(x, y, 4, p.seed) * 14) * 0.9) * 0.5 + 0.5;
    return mulc(c, 0.86 + g * 0.2);
  });
  p.grain(0.04);
});
T('wood_dark', (p) => {
  p.fill([96, 62, 34]);
  p.map((x, y, c) => {
    const g = Math.sin((y + pnoise(x, y, 4, p.seed) * 14) * 1.1) * 0.5 + 0.5;
    return mulc(c, 0.84 + g * 0.22);
  });
  p.grain(0.04);
});
T('wood_light', (p) => {
  p.fill([196, 160, 112]);
  p.map((x, y, c) => {
    const g = Math.sin((y + pnoise(x, y, 4, p.seed) * 10) * 0.8) * 0.5 + 0.5;
    return mulc(c, 0.9 + g * 0.14);
  });
  p.grain(0.03);
});
T('wood_floor', (p, r) => {
  for (let row = 0; row < 8; row++) {
    const base = mix([150, 98, 52], [176, 120, 70], r.next());
    const off = r.int(0, 63);
    for (let y = row * 8; y < row * 8 + 8; y++) for (let x = 0; x < TS; x++) {
      const g = Math.sin((x * 0.35 + pnoise(x, y, 8, p.seed + row) * 6)) * 0.06;
      p.set(x, y, mulc(base, 1 + g));
    }
    for (let x = 0; x < TS; x++) p.set(x, row * 8, [90, 58, 30]);
    for (let y = row * 8; y < row * 8 + 8; y++) p.set(off, y, [90, 58, 30]);
  }
  p.grain(0.03);
});
T('wood_panel', (p) => {
  p.fill([110, 72, 40]);
  p.map((x, y, c) => mulc(c, 0.85 + 0.25 * (Math.sin(x * 0.7 + pnoise(x, y, 4, p.seed) * 8) * 0.5 + 0.5)));
  for (let x = 0; x < TS; x += 16) for (let y = 0; y < TS; y++) { p.set(x, y, [56, 34, 16]); p.set(x + 1, y, [130, 88, 50], 0.5); }
  p.grain(0.03);
});
T('metal', (p) => {
  p.fill([158, 160, 164]);
  p.map((x, y, c) => mulc(c, 1 + (pnoise(x * 0.1, y, 32, p.seed) - 0.5) * 0.18));
  p.grain(0.03);
});
T('metal_dark', (p) => { p.fill([72, 74, 78]); p.noise(4, 0.1, 2); p.grain(0.05); });
T('metal_green', (p) => { p.fill([96, 112, 100]); p.noise(4, 0.08, 2); p.grain(0.04); });
T('metal_plate', (p) => {
  p.fill([132, 132, 134]);
  p.grain(0.05);
  for (let y = 0; y < TS; y += 8) for (let x = 0; x < TS; x += 8) {
    const ox = (y / 8) % 2 ? 4 : 0;
    p.line(x + ox, y + 2, x + ox + 3, y + 5, [170, 170, 172]);
    p.line(x + ox + 1, y + 2, x + ox + 4, y + 5, [96, 96, 98]);
  }
});
T('rust', (p) => {
  p.fill([120, 110, 100]);
  p.map((x, y, c) => {
    const n = pfbm(x, y, 4, 3, p.seed);
    return n > 0.5 ? mix(c, [140, 72, 34], Math.min(1, (n - 0.5) * 4)) : c;
  });
  p.grain(0.08);
});
T('grate', (p) => {
  p.fill([90, 92, 94]);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const bar = x % 8 < 2 || y % 8 < 2;
    if (!bar) p.alpha(x, y, 0);
    else p.set(x, y, x % 8 < 1 || y % 8 < 1 ? [120, 122, 124] : [70, 72, 74]);
  }
}, 8);
T('tile_white', (p) => {
  p.fill([226, 226, 220]);
  p.grain(0.03);
  for (let i = 0; i < TS; i++) for (let k = 0; k < TS; k += 16) { p.set(i, k, [168, 168, 160]); p.set(k, i, [168, 168, 160]); }
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) p.shade(tx * 16 + 1, ty * 16 + 1, 15, 15, p.rng.range(-0.04, 0.02));
});
T('tile_blue', (p) => {
  p.fill([150, 196, 214]);
  p.grain(0.04);
  for (let i = 0; i < TS; i++) for (let k = 0; k < TS; k += 16) { p.set(i, k, [226, 232, 230]); p.set(k, i, [226, 232, 230]); }
});
T('tile_check', (p) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) p.set(x, y, ((x >> 4) + (y >> 4)) % 2 ? [208, 204, 190] : [92, 92, 88]);
  p.grain(0.04);
  p.speckle(120, [150, 146, 136], 0.2, 0.4);
});
T('lino_vct', (p, r) => {
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const base = mix([200, 194, 172], [184, 178, 158], r.next());
    p.rect(tx * 32, ty * 32, 32, 32, base);
  }
  p.grain(0.04);
  p.speckle(260, [150, 146, 130], 0.3, 0.7);
  p.speckle(120, [230, 226, 210], 0.3, 0.6);
  for (let i = 0; i < TS; i++) { p.set(i, 0, [150, 146, 132]); p.set(0, i, [150, 146, 132]); p.set(i, 32, [150, 146, 132]); p.set(32, i, [150, 146, 132]); }
});
T('lino_green', (p) => {
  p.fill([128, 150, 120]);
  p.grain(0.05);
  p.speckle(260, [100, 120, 94], 0.3, 0.7);
  for (let i = 0; i < TS; i++) { p.set(i, 0, [100, 118, 94]); p.set(0, i, [100, 118, 94]); p.set(i, 32, [100, 118, 94]); p.set(32, i, [100, 118, 94]); }
});
T('gel_blue', (p) => {
  p.fill([168, 198, 216]);
  p.noise(3, 0.06, 2);
  p.speckle(200, [140, 170, 190], 0.3, 0.6);
  p.map((x, y, c) => (pnoise(x, y, 4, p.seed + 3) > 0.7 ? mulc(c, 1.12) : c));
});
T('marble', (p) => {
  p.fill([214, 210, 200]);
  p.map((x, y, c) => {
    const v = Math.abs(Math.sin((x + y) * 0.08 + pfbm(x, y, 4, 4, p.seed) * 9));
    return v < 0.08 ? mulc(c, 0.72) : v < 0.18 ? mulc(c, 0.9) : c;
  });
  for (let i = 0; i < TS; i++) { p.set(i, 0, [170, 166, 158]); p.set(0, i, [170, 166, 158]); }
});
T('carpet_office', (p) => {
  p.fill([98, 106, 118]);
  p.grain(0.1);
  for (let y = 0; y < TS; y += 4) for (let x = 0; x < TS; x += 4) p.set(x, y, [84, 90, 102], 0.6);
  p.noise(4, 0.05, 2);
});
T('carpet_gray', (p) => { p.fill([120, 118, 112]); p.grain(0.12); p.noise(6, 0.05, 2); p.speckle(150, [90, 88, 84], 0.2, 0.5); });
T('carpet_blue', (p) => { p.fill([62, 74, 116]); p.grain(0.1); p.noise(5, 0.06, 2); });
T('carpet_green', (p) => { p.fill([72, 98, 72]); p.grain(0.1); p.noise(5, 0.06, 2); });
T('carpet_red', (p) => { p.fill([124, 32, 32]); p.grain(0.1); p.noise(5, 0.08, 2); });
T('carpet_brown', (p) => { p.fill([110, 80, 52]); p.grain(0.14); p.noise(5, 0.08, 2); });
T('carpet_hotel', (p) => {
  p.fill([108, 30, 36]);
  p.grain(0.08);
  const gold = [176, 136, 62], dk = [70, 18, 24];
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const dx = Math.abs(((x + 8) % 16) - 8), dy = Math.abs(((y + 8) % 16) - 8);
    if (dx + dy === 7) p.set(x, y, gold);
    else if (dx + dy === 3) p.set(x, y, dk);
    if (dx === 0 && dy === 0) p.set(x, y, gold);
  }
});
T('shag', (p) => {
  p.fill([168, 96, 38]);
  p.map((x, y, c) => mulc(c, 0.7 + pnoise(x, y, 16, p.seed) * 0.5));
  p.grain(0.15);
});
T('carpet_teal', (p) => { p.fill([58, 110, 112]); p.grain(0.12); p.noise(5, 0.07, 2); });

// ---------------------------------------------------------------- fabrics / plastics
T('fabric_blue', (p) => { p.fill([62, 76, 122]); p.grain(0.08); for (let y = 0; y < TS; y += 2) for (let x = 0; x < TS; x++) p.set(x, y, [54, 66, 108], 0.4); });
T('fabric_gray', (p) => { p.fill([112, 112, 116]); p.grain(0.08); for (let y = 0; y < TS; y += 2) for (let x = 0; x < TS; x++) p.set(x, y, [100, 100, 104], 0.4); });
T('fabric_brown', (p) => { p.fill([116, 86, 60]); p.grain(0.1); });
T('fabric_partition', (p) => { p.fill([128, 132, 140]); p.grain(0.035); p.noise(8, 0.03, 2); for (let y = 0; y < TS; y += 2) for (let x = 0; x < TS; x++) p.set(x, y, [120, 124, 132], 0.3); });
T('fabric_floral', (p, r) => {
  p.fill([198, 176, 132]);
  p.grain(0.05);
  for (let i = 0; i < 14; i++) {
    const x = r.int(0, 63), y = r.int(0, 63), c = r.pick([[190, 90, 40], [150, 60, 40], [200, 140, 50]]);
    p.disc(x, y, r.range(3, 5), c);
    p.disc(x, y, 1.5, [90, 60, 30]);
    p.disc(x + 4, y + 3, 1.8, [90, 110, 60]);
  }
}, 24);
T('velvet_red', (p) => {
  p.fill([132, 26, 32]);
  p.grain(0.1);
  p.map((x, y, c) => {
    const n = pfbm(x, y, 4, 3, p.seed + 2);
    return n > 0.6 ? mix(c, [60, 30, 24], (n - 0.6) * 2.5) : c;
  });
});
T('plastic_beige', (p) => { p.fill([208, 200, 176]); p.noise(4, 0.03, 2); p.grain(0.02); });
T('plastic_white', (p) => { p.fill([226, 226, 222]); p.noise(4, 0.02, 2); });
T('plastic_orange', (p) => { p.fill([206, 112, 42]); p.noise(4, 0.04, 2); p.grain(0.02); });
T('plastic_blue', (p) => { p.fill([62, 92, 150]); p.noise(4, 0.04, 2); p.grain(0.02); });
T('plastic_gray', (p) => { p.fill([140, 140, 142]); p.noise(4, 0.03, 2); p.grain(0.02); });
T('plastic_black', (p) => { p.fill([42, 42, 44]); p.noise(4, 0.06, 2); p.grain(0.03); });
T('chair_mesh', (p) => {
  p.fill([34, 34, 38]);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) if (x % 3 === 0 || y % 3 === 0) p.set(x, y, [62, 62, 68]);
});
T('rubber', (p) => { p.fill([30, 30, 30]); p.grain(0.1); });
T('chrome', (p) => {
  p.fill([180, 184, 190]);
  p.map((x, y, c) => mulc(c, 0.75 + 0.45 * Math.abs(Math.sin(y * 0.12))));
}, 8);

// ---------------------------------------------------------------- electronics
T('crt_off', (p) => {
  p.fill([28, 34, 32]);
  p.map((x, y, c) => {
    const d = Math.hypot(x - 32, y - 32) / 45;
    return mulc(c, 1.2 - d * 0.5);
  });
  for (let i = 0; i < 14; i++) p.set(10 + i, 8 + Math.floor(i / 3), [90, 100, 96], 0.6);
}, 8);
T('crt_blue', (p) => {
  p.fill([22, 44, 168]);
  p.map((x, y, c) => mulc(c, y % 2 ? 0.86 : 1));
  for (let row = 0; row < 6; row++) {
    const len = [36, 20, 44, 28, 12, 30][row];
    p.rect(8, 10 + row * 7, len, 2, [210, 220, 240]);
  }
}, 8);
T('crt_green', (p, r) => {
  p.fill([6, 18, 8]);
  for (let row = 0; row < 8; row++) {
    let x = 6;
    while (x < 56) { const w = r.int(2, 7); if (r.chance(0.8)) p.rect(x, 6 + row * 7, w, 2, [60, 230, 90]); x += w + 2; }
  }
  p.map((x, y, c) => mulc(c, y % 2 ? 0.7 : 1));
}, 8);
for (let f = 0; f < 4; f++) {
  T('static' + f, (p) => {
    const rng = new RNG(9000 + f * 77);
    p.map((x, y) => {
      const v = rng.next() * 200 + 30;
      return [v, v, v * 1.02];
    });
    p.map((x, y, c) => mulc(c, y % 2 ? 0.75 : 1));
  }, 8);
}
T('keyboard', (p) => {
  p.fill([196, 190, 170]);
  for (let row = 0; row < 5; row++) for (let k = 0; k < 13; k++) {
    p.rect(3 + k * 4.6, 6 + row * 11, 3.6, 8, [222, 216, 196]);
    p.rect(3 + k * 4.6, 13 + row * 11, 3.6, 1, [150, 146, 130]);
  }
}, 8);
T('computer_front', (p) => {
  p.fill([208, 200, 176]);
  p.rect(6, 6, 52, 10, [180, 172, 150]); p.rect(8, 9, 48, 3, [60, 60, 60]);
  p.rect(6, 22, 52, 10, [180, 172, 150]); p.rect(8, 25, 30, 3, [60, 60, 60]);
  p.rect(48, 50, 6, 6, [160, 152, 130]); p.rect(10, 52, 4, 2, [60, 200, 80]);
}, 16);
T('server', (p, r) => {
  p.fill([28, 30, 34]);
  for (let u = 0; u < 8; u++) {
    p.rect(2, u * 8 + 1, 60, 6, [44, 46, 52]);
    for (let k = 0; k < 6; k++) if (r.chance(0.6)) p.rect(6 + k * 4, u * 8 + 3, 2, 2, r.chance(0.7) ? [60, 220, 90] : [230, 160, 40]);
    p.rect(40, u * 8 + 3, 18, 2, [70, 72, 78]);
  }
}, 16);
T('server_b', (p, r) => {
  p.fill([28, 30, 34]);
  for (let u = 0; u < 8; u++) {
    p.rect(2, u * 8 + 1, 60, 6, [44, 46, 52]);
    for (let k = 0; k < 6; k++) if (r.chance(0.4)) p.rect(6 + k * 4, u * 8 + 3, 2, 2, r.chance(0.7) ? [60, 220, 90] : [230, 160, 40]);
    p.rect(40, u * 8 + 3, 18, 2, [70, 72, 78]);
  }
}, 16);
T('phone', (p) => {
  p.fill([196, 186, 160]);
  for (let row = 0; row < 4; row++) for (let k = 0; k < 3; k++) p.rect(18 + k * 10, 20 + row * 9, 7, 6, [236, 230, 214]);
  p.rect(14, 6, 36, 8, [60, 66, 60]);
}, 16);

// ---------------------------------------------------------------- paper / signage
T('paper', (p, r) => {
  p.fill([236, 232, 220]);
  p.grain(0.02);
  for (let y = 10; y < 58; y += 4) { const w = r.int(18, 50); p.rect(7, y, w, 1, [150, 150, 150]); }
  p.rect(7, 4, 26, 2, [80, 80, 80]);
}, 8);
T('paper_sheet', (p, r) => {
  p.fill([234, 230, 218]);
  p.clearAlpha(0);
  p.rectA(12, 6, 40, 52, 255);
  for (let y = 12; y < 54; y += 4) p.rect(16, y, r.int(14, 32), 1, [140, 140, 140]);
  p.shade(12, 6, 40, 52, -0.02);
}, 8);
T('note_yellow', (p, r) => {
  p.fill([240, 222, 110]);
  for (let y = 14; y < 56; y += 7) { let x = 8; while (x < 54) { const w = r.int(3, 9); p.rect(x, y, w, 2, [60, 60, 120], 0.8); x += w + 3; } }
}, 8);
T('cork', (p, r) => {
  p.fill([170, 126, 76]);
  p.grain(0.15);
  p.speckle(300, [130, 92, 52], 0.4, 0.8);
  for (let i = 0; i < 5; i++) {
    const x = r.int(4, 40), y = r.int(4, 40), w = r.int(14, 22), h = r.int(16, 24);
    p.rect(x, y, w, h, r.pick([[236, 232, 220], [240, 222, 120], [200, 220, 240]]));
    for (let yy = y + 4; yy < y + h - 2; yy += 3) p.rect(x + 2, yy, r.int(4, w - 4), 1, [120, 120, 120]);
    p.disc(x + w / 2, y + 2, 1.5, r.pick([[200, 30, 30], [30, 60, 200], [30, 160, 60]]));
  }
  p.frame(0, 0, 64, 64, [110, 74, 40]); p.frame(1, 1, 62, 62, [130, 90, 50]);
}, 24);
T('chalkboard', (p, r) => {
  p.fill([44, 70, 54]);
  p.noise(4, 0.1, 2);
  for (let i = 0; i < 8; i++) {
    let x = r.int(4, 50), y = r.int(6, 56);
    for (let k = 0; k < r.int(6, 18); k++) { p.set(x, y, [200, 210, 200], 0.4); x += 1; y += r.int(-1, 1); }
  }
  p.frame(0, 0, 64, 64, [120, 90, 56]);
}, 16);
T('whiteboard', (p, r) => {
  p.fill([232, 234, 232]);
  for (let i = 0; i < 4; i++) {
    let x = r.int(6, 40), y = r.int(8, 52);
    for (let k = 0; k < 20; k++) { p.set(x, y, [200, 205, 215], 0.6); x += 1; y += r.int(-1, 1); }
  }
  p.frame(0, 0, 64, 64, [170, 172, 176]); p.frame(1, 1, 62, 62, [190, 192, 196]);
}, 8);
T('calendar', (p, r) => {
  p.fill([238, 234, 224]);
  p.rect(0, 0, 64, 14, [176, 40, 40]);
  p.text('MAR', 4, 4, [250, 240, 230]);
  p.text('1996', 34, 4, [250, 240, 230]);
  for (let row = 0; row < 5; row++) for (let c = 0; c < 7; c++) {
    const x = 3 + c * 8.5, y = 18 + row * 9;
    p.frame(x, y, 8, 8, [170, 166, 156]);
    if (r.chance(0.85)) { p.line(x + 1, y + 1, x + 6, y + 6, [190, 40, 40]); p.line(x + 6, y + 1, x + 1, y + 6, [190, 40, 40]); }
  }
}, 16);
function clockFace(p, h, m) {
  p.fill([20, 20, 20]);
  p.clearAlpha(0);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32);
    if (d < 30) { p.alpha(x, y, 255); p.set(x, y, d > 27 ? [40, 40, 44] : [236, 234, 226]); }
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    p.rect(32 + Math.sin(a) * 23 - 1, 32 - Math.cos(a) * 23 - 1, 2, 2, [30, 30, 30]);
  }
  const ha = ((h % 12) + m / 60) / 12 * Math.PI * 2, ma = (m / 60) * Math.PI * 2;
  p.line(32, 32, 32 + Math.sin(ha) * 13, 32 - Math.cos(ha) * 13, [20, 20, 20]);
  p.line(33, 32, 33 + Math.sin(ha) * 13, 32 - Math.cos(ha) * 13, [20, 20, 20]);
  p.line(32, 32, 32 + Math.sin(ma) * 21, 32 - Math.cos(ma) * 21, [20, 20, 20]);
  p.disc(32, 32, 2, [180, 30, 30]);
}
T('clock_a', (p) => clockFace(p, 3, 17), 8);
T('clock_b', (p) => clockFace(p, 11, 58), 8);
T('clock_c', (p) => clockFace(p, 6, 0), 8);
T('exit_sign', (p) => {
  p.fill([46, 12, 10]);
  p.text('EXIT', 9, 25, [255, 60, 40], 2);
  p.frame(0, 0, 64, 64, [200, 200, 196]);
  p.frame(1, 1, 62, 62, [170, 170, 166]);
}, 8);
T('exit_green', (p) => {
  p.fill([16, 60, 30]);
  p.text('EXIT', 9, 25, [120, 255, 150], 2);
  p.frame(0, 0, 64, 64, [200, 200, 196]);
}, 8);
export function signTex(lines, bg, fg, scale = 1) {
  return (p) => {
    p.fill(bg);
    const lh = 9 * scale;
    const y0 = Math.round(32 - (lines.length * lh) / 2) + 1;
    lines.forEach((ln, i) => {
      const w = ln.length * 6 * scale - scale;
      p.text(ln, Math.round(32 - w / 2), y0 + i * lh, fg, scale);
    });
    p.frame(0, 0, 64, 64, mulc(bg, 0.6));
  };
}
T('sign_stairs', signTex(['STAIR', 'WELL'], [40, 60, 120], [240, 240, 240], 1), 8);
T('sign_noexit', signTex(['NO', 'EXIT'], [220, 220, 210], [180, 30, 30], 2), 8);
T('sign_staff', signTex(['STAFF', 'ONLY'], [230, 226, 210], [40, 40, 40], 1), 8);
T('sign_wait', signTex(['PLEASE', 'WAIT', 'HERE'], [230, 226, 210], [30, 50, 120], 1), 8);
T('sign_reception', signTex(['RECEP-', 'TION'], [60, 64, 70], [230, 220, 180], 1), 8);
T('sign_lecture', signTex(['LECTURE', 'HALL B'], [70, 50, 40], [230, 210, 160], 1), 8);
T('sign_keepclear', signTex(['KEEP', 'CLEAR'], [230, 200, 40], [30, 30, 30], 1), 8);
T('sign_watchstep', signTex(['WATCH', 'YOUR', 'STEP'], [230, 200, 40], [30, 30, 30], 1), 8);
T('sign_restroom', signTex(['REST', 'ROOM'], [40, 70, 130], [240, 240, 240], 1), 8);
T('sign_maint', signTex(['MAINT.', 'B-14'], [200, 200, 196], [40, 40, 40], 1), 8);
T('sign_level', signTex(['LEVEL'], [36, 36, 40], [220, 220, 200], 1), 8);
T('sign_thisway', signTex(['THIS', 'WAY', '→'], [230, 226, 210], [40, 40, 40], 1), 8);
T('sign_occupancy', signTex(['MAX', 'OCCUP.', '0'], [220, 220, 214], [40, 40, 40], 1), 8);
T('sign_auth', signTex(['AUTHOR-', 'IZED', 'ONLY'], [180, 30, 30], [250, 240, 230], 1), 8);
T('sign_floor0', signTex(['FLOOR', '0'], [36, 36, 40], [220, 220, 200], 2), 8);
for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'B', '-']) {
  T('digit_' + d, (p) => {
    p.fill([235, 235, 225]);
    p.clearAlpha(0);
    p.text(d, 12, 4, [235, 235, 225], 8);
    p.textA(d, 12, 4, 255, 8);
  }, 4);
}
T('poster_safety', (p) => {
  p.fill([236, 232, 214]);
  p.rect(0, 0, 64, 18, [40, 120, 60]);
  p.text('SAFETY', 14, 6, [250, 250, 240]);
  p.text('IS', 26, 24, [40, 40, 40]);
  p.text('EVERY-', 14, 33, [40, 40, 40]);
  p.text("ONE'S", 17, 42, [40, 40, 40]);
  p.text('JOB', 23, 51, [180, 40, 40]);
}, 16);
T('poster_motiv', (p) => {
  p.fill([20, 24, 40]);
  for (let y = 8; y < 40; y++) p.rect(6, y, 52, 1, mix([200, 120, 60], [40, 60, 120], (y - 8) / 32));
  p.rect(6, 34, 52, 6, [20, 20, 26]);
  p.text('PERSIST', 11, 48, [230, 230, 220]);
  p.frame(5, 7, 54, 34, [180, 180, 180]);
}, 24);
T('poster_employee', (p) => {
  p.fill([230, 224, 200]);
  p.text('EMPLOYEE', 8, 3, [40, 40, 90]);
  p.text('OF THE', 14, 12, [40, 40, 90]);
  p.text('MONTH', 17, 21, [40, 40, 90]);
  p.rect(18, 31, 28, 28, [120, 110, 100]);
  p.rect(21, 34, 22, 22, [170, 166, 160]);
  p.frame(0, 0, 64, 64, [160, 120, 40]);
}, 16);
T('poster_map', (p, r) => {
  p.fill([232, 230, 220]);
  p.text('YOU ARE', 4, 2, [40, 40, 40]);
  p.text('HERE', 4, 10, [40, 40, 40]);
  for (let i = 0; i < 26; i++) {
    const x = r.int(4, 56), y = r.int(20, 58), w = r.int(4, 18), h = r.int(4, 14);
    p.frame(x, y, Math.min(w, 60 - x), Math.min(h, 60 - y), [90, 90, 100]);
  }
  p.frame(3, 19, 58, 42, [40, 40, 50]);
  p.disc(r.int(16, 48), r.int(28, 52), 2.5, [210, 30, 30]);
}, 16);
T('poster_notice', (p, r) => {
  p.fill([240, 238, 230]);
  p.rect(0, 0, 64, 13, [30, 30, 30]);
  p.text('NOTICE', 14, 3, [240, 240, 240]);
  for (let y = 18; y < 60; y += 5) p.rect(5, y, r.int(30, 54), 2, [110, 110, 110]);
}, 8);
T('poster_wash', (p) => {
  p.fill([220, 236, 240]);
  p.text('PLEASE', 14, 6, [30, 60, 140]);
  p.text('WASH', 20, 16, [30, 60, 140]);
  p.text('HANDS', 17, 26, [30, 60, 140]);
  p.disc(32, 48, 9, [120, 170, 210]);
  p.disc(32, 48, 5, [220, 236, 240]);
}, 16);
T('frame_empty', (p) => {
  p.fill([110, 80, 46]);
  p.rect(6, 6, 52, 52, [150, 146, 136]);
  p.bevel(0, 0, 64, 64, 0.15, 0.2);
  p.bevel(6, 6, 52, 52, -0.2, -0.1);
}, 8);
T('painting_land', (p) => {
  p.fill([110, 80, 46]);
  for (let y = 6; y < 58; y++) p.rect(6, y, 52, 1, mix([150, 170, 190], [120, 140, 100], y < 36 ? 0 : 1));
  p.rect(6, 30, 52, 6, [90, 110, 80]);
  p.bevel(0, 0, 64, 64, 0.15, 0.2);
}, 16);

// ---------------------------------------------------------------- furniture surfaces
T('file_cabinet', (p) => {
  p.fill([170, 168, 156]);
  p.grain(0.03);
  for (let d = 0; d < 4; d++) {
    const y = d * 16;
    p.bevel(2, y + 1, 60, 14, 0.12, 0.25);
    p.rect(24, y + 5, 16, 3, [80, 80, 78]);
    p.rect(27, y + 10, 10, 3, [228, 226, 216]);
  }
}, 16);
T('locker', (p) => {
  p.fill([108, 124, 142]);
  p.grain(0.03);
  p.bevel(1, 1, 30, 62, 0.15, 0.3); p.bevel(33, 1, 30, 62, 0.15, 0.3);
  for (const ox of [0, 32]) {
    for (let i = 0; i < 4; i++) p.rect(ox + 8, 6 + i * 3, 16, 1, [50, 58, 68]);
    p.rect(ox + 24, 30, 3, 8, [60, 64, 70]);
  }
}, 16);
T('books', (p, r) => {
  p.fill([60, 40, 24]);
  for (let shelf = 0; shelf < 2; shelf++) {
    let x = 1;
    const y0 = shelf * 32;
    while (x < 63) {
      const w = r.int(3, 6), h = r.int(20, 29);
      const c = r.pick([[140, 30, 30], [40, 60, 120], [30, 90, 50], [170, 140, 60], [90, 60, 40], [200, 190, 160], [60, 60, 60]]);
      p.rect(x, y0 + 31 - h, Math.min(w, 63 - x), h, c);
      p.rect(x, y0 + 31 - h + 3, Math.min(w, 63 - x), 1, mulc(c, 1.3));
      x += w + (r.chance(0.1) ? 2 : 0);
    }
    p.rect(0, y0 + 30, 64, 2, [90, 62, 36]);
  }
}, 24);
T('book_cover', (p, r) => {
  p.fill([120, 40, 36]);
  p.noise(4, 0.1, 2);
  p.rect(0, 0, 6, 64, [90, 30, 26]);
  p.grain(0.05);
}, 8);
T('cardboard', (p) => {
  p.fill([172, 132, 82]);
  p.noise(4, 0.06, 2);
  p.grain(0.05);
  p.rect(0, 28, 64, 8, [196, 166, 116]);
  p.text('↑↑', 4, 4, [90, 60, 30]);
}, 16);
T('door_wood', (p) => {
  p.fill([150, 104, 60]);
  p.map((x, y, c) => mulc(c, 0.88 + 0.18 * (Math.sin(x * 0.5 + pnoise(x, y, 4, p.seed) * 6) * 0.5 + 0.5)));
  p.bevel(10, 6, 44, 22, -0.15, -0.1);
  p.bevel(10, 36, 44, 22, -0.15, -0.1);
  p.rect(50, 32, 6, 4, [200, 180, 100]);
}, 16);
T('door_metal', (p) => {
  p.fill([118, 132, 122]);
  p.noise(4, 0.04, 2);
  p.bevel(0, 0, 64, 64, 0.12, 0.2);
  p.rect(6, 30, 52, 4, [170, 170, 170]);
  p.rect(20, 6, 24, 16, [40, 50, 56]);
  p.frame(20, 6, 24, 16, [80, 90, 86]);
}, 16);
T('door_gray', (p) => {
  p.fill([150, 150, 146]);
  p.noise(4, 0.04, 2);
  p.bevel(0, 0, 64, 64, 0.12, 0.2);
  p.rect(50, 30, 6, 4, [190, 190, 190]);
}, 8);
T('elevator', (p) => {
  p.fill([170, 172, 176]);
  p.map((x, y, c) => mulc(c, 1 + (pnoise(x, y * 0.05, 32, p.seed) - 0.5) * 0.15));
  p.rect(31, 0, 2, 64, [90, 90, 94]);
  p.bevel(0, 0, 64, 64, 0.1, 0.25);
}, 8);
T('vending', (p, r) => {
  p.fill([180, 30, 36]);
  p.rect(4, 4, 38, 56, [26, 32, 40]);
  for (let row = 0; row < 6; row++) {
    for (let k = 0; k < 6; k++) p.rect(6 + k * 6, 7 + row * 9, 4, 6, r.pick([[200, 40, 40], [40, 120, 200], [230, 200, 60], [60, 180, 80], [230, 230, 230], [200, 100, 30]]));
    p.rect(5, 13 + row * 9, 36, 1, [120, 120, 130]);
  }
  p.rect(46, 8, 14, 20, [40, 40, 44]);
  for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) p.rect(48 + k * 6, 10 + i * 4, 4, 2, [200, 200, 190]);
  p.rect(48, 36, 10, 4, [20, 20, 20]);
  p.rect(46, 50, 14, 8, [26, 26, 30]);
}, 32);
T('fridge', (p) => {
  p.fill([226, 224, 214]);
  p.rect(0, 22, 64, 2, [160, 160, 156]);
  p.rect(54, 6, 3, 12, [170, 170, 166]);
  p.rect(54, 28, 3, 20, [170, 170, 166]);
}, 8);
T('cooler_bottle', (p) => {
  p.fill([120, 180, 220]);
  p.map((x, y, c) => mulc(c, 0.8 + 0.4 * Math.abs(Math.sin(x * 0.1))));
}, 8);
T('radiator', (p) => {
  p.fill([176, 172, 158]);
  for (let x = 0; x < TS; x += 6) { p.rect(x, 0, 2, 64, [120, 118, 108]); p.rect(x + 2, 0, 1, 64, [200, 196, 184]); }
  p.rect(0, 0, 64, 4, [150, 146, 134]); p.rect(0, 60, 64, 4, [140, 136, 124]);
}, 8);
T('pipe', (p) => {
  p.fill([128, 124, 114]);
  p.map((x, y, c) => mulc(c, 0.75 + 0.45 * Math.sin((y / 64) * Math.PI)));
  for (let x = 0; x < TS; x += 32) p.rect(x, 0, 3, 64, [96, 92, 84]);
}, 8);
T('pipe_red', (p) => {
  p.fill([150, 40, 34]);
  p.map((x, y, c) => mulc(c, 0.75 + 0.45 * Math.sin((y / 64) * Math.PI)));
}, 8);
T('duct', (p) => {
  p.fill([170, 174, 178]);
  p.noise(4, 0.06, 2);
  for (let x = 0; x < TS; x += 32) { p.rect(x, 0, 2, 64, [130, 134, 138]); p.rect(x + 2, 0, 1, 64, [200, 204, 208]); }
}, 8);
T('panel_elec', (p) => {
  p.fill([150, 154, 152]);
  p.bevel(0, 0, 64, 64, 0.15, 0.25);
  p.rect(10, 8, 26, 10, [236, 232, 220]);
  p.text('480V', 12, 10, [180, 30, 30]);
  p.rect(50, 28, 4, 10, [60, 60, 60]);
  p.line(24, 44, 32, 30, [230, 200, 40]); p.line(32, 30, 40, 44, [230, 200, 40]); p.line(24, 44, 40, 44, [230, 200, 40]);
}, 16);
T('hazard', (p) => {
  p.map((x, y) => (((x + y) >> 3) % 2 ? [230, 190, 30] : [30, 30, 30]));
}, 4);
T('rack_orange', (p) => {
  p.fill([214, 112, 32]);
  p.grain(0.05);
  for (let x = 6; x < TS; x += 12) p.rect(x, 26, 4, 10, [130, 66, 20]);
}, 8);
T('rack_blue', (p) => {
  p.fill([44, 72, 150]);
  p.grain(0.05);
  for (let y = 4; y < TS; y += 8) { p.rect(20, y, 6, 3, [20, 30, 60]); p.rect(38, y, 6, 3, [20, 30, 60]); }
}, 8);
T('pallet', (p) => {
  p.fill([170, 132, 84]);
  p.clearAlpha(255);
  for (let x = 0; x < TS; x++) for (let y = 0; y < TS; y++) if (y % 16 >= 12) { p.alpha(x, y, 0); }
  p.grain(0.08);
}, 8);
T('mattress', (p) => {
  p.fill([220, 222, 226]);
  for (let y = 0; y < TS; y += 16) for (let x = 0; x < TS; x += 16) {
    p.line(x, y, x + 15, y + 15, [180, 190, 210]); p.line(x + 15, y, x, y + 15, [180, 190, 210]);
    p.disc(x + 8, y + 8, 1.2, [150, 160, 190]);
  }
}, 8);
T('washer', (p) => {
  p.fill([228, 228, 224]);
  p.disc(32, 36, 20, [170, 170, 176]);
  p.disc(32, 36, 16, [40, 50, 60]);
  p.disc(26, 30, 4, [90, 110, 130]);
  p.rect(6, 4, 52, 8, [200, 200, 196]);
  p.disc(48, 8, 3, [80, 80, 80]);
}, 16);
T('tv_wood', (p) => {
  p.fill([92, 60, 32]);
  p.map((x, y, c) => mulc(c, 0.85 + 0.2 * Math.sin(x * 0.4 + pnoise(x, y, 4, p.seed) * 6)));
  p.rect(48, 10, 10, 44, [60, 50, 40]);
  for (let y = 14; y < 50; y += 3) p.rect(50, y, 6, 1, [30, 26, 20]);
}, 16);
T('curtain', (p) => {
  p.fill([120, 24, 30]);
  p.map((x, y, c) => mulc(c, 0.65 + 0.5 * (Math.sin(x * 0.4) * 0.5 + 0.5)));
}, 8);
T('leaves_dead', (p, r) => {
  p.fill([100, 96, 50]);
  p.clearAlpha(0);
  for (let i = 0; i < 40; i++) {
    const x = r.int(4, 60), y = r.int(2, 50);
    const c = r.pick([[110, 100, 50], [130, 110, 60], [90, 84, 40], [80, 90, 50]]);
    for (let k = 0; k < 5; k++) { p.set(x + k * 0.6, y + k, c); p.alpha(x + k * 0.6, y + k, 255); p.set(x + 1 + k * 0.6, y + k, c); p.alpha(x + 1 + k * 0.6, y + k, 255); }
  }
  for (let y = 30; y < 64; y++) { p.set(31, y, [80, 70, 40]); p.alpha(31, y, 255); p.set(32, y, [80, 70, 40]); p.alpha(32, y, 255); }
}, 8);
T('glass', (p) => {
  p.fill([170, 196, 204]);
  p.map((x, y, c) => (Math.abs(x - y - 10) < 3 || Math.abs(x - y + 20) < 2 ? mulc(c, 1.25) : c));
}, 8);
T('mirror', (p) => {
  p.fill([150, 160, 166]);
  p.map((x, y, c) => mulc(c, 0.8 + 0.3 * (pnoise(x, y, 2, p.seed) )));
}, 8);
T('porcelain', (p) => { p.fill([234, 234, 230]); p.noise(4, 0.03, 2); }, 8);
T('stall', (p) => {
  p.fill([120, 136, 150]);
  p.noise(4, 0.04, 2);
  p.bevel(0, 0, 64, 64, 0.1, 0.2);
}, 8);

// ---------------------------------------------------------------- exterior / suburb
T('brick', (p, r) => {
  p.fill([150, 146, 136]);
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? 8 : 0;
    for (let b = -1; b < 4; b++) {
      const c = mix([142, 66, 46], [118, 54, 38], r.next());
      p.rect(off + b * 16 + 1, row * 8 + 1, 15, 7, c);
    }
  }
  p.grain(0.08);
}, 16);
T('siding', (p) => {
  p.fill([206, 204, 190]);
  for (let y = 0; y < TS; y += 8) {
    p.rect(0, y, 64, 1, [150, 148, 136]);
    p.rect(0, y + 1, 64, 1, [226, 224, 212]);
    p.shade(0, y + 5, 64, 3, -0.06);
  }
  p.grain(0.02);
}, 8);
T('siding_blue', (p) => {
  p.fill([150, 170, 190]);
  for (let y = 0; y < TS; y += 8) {
    p.rect(0, y, 64, 1, [110, 126, 144]);
    p.rect(0, y + 1, 64, 1, [176, 194, 210]);
    p.shade(0, y + 5, 64, 3, -0.06);
  }
}, 8);
T('shingles', (p, r) => {
  p.fill([70, 70, 74]);
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? 6 : 0;
    for (let x = off; x < TS + off; x += 12) { p.rect(x, row * 8, 1, 8, [40, 40, 44]); p.shade(x + 1, row * 8, 11, 8, r.range(-0.1, 0.1)); }
    p.rect(0, row * 8 + 7, 64, 1, [36, 36, 40]);
  }
  p.grain(0.08);
}, 16);
T('asphalt', (p) => {
  p.fill([62, 62, 64]);
  p.grain(0.12);
  p.noise(4, 0.1, 2);
  p.speckle(120, [110, 110, 108], 0.3, 0.6);
});
T('asphalt_line', (p) => {
  p.fill([62, 62, 64]);
  p.grain(0.12);
  p.noise(4, 0.1, 2);
  p.rect(28, 0, 8, 40, [200, 180, 80]);
});
T('sidewalk', (p) => {
  p.fill([168, 166, 158]);
  p.grain(0.06);
  p.noise(3, 0.06, 2);
  for (let i = 0; i < TS; i++) { p.set(i, 0, [120, 118, 112]); p.set(0, i, [120, 118, 112]); }
});
T('grass_dead', (p) => {
  p.fill([112, 116, 82]);
  p.noise(4, 0.15, 3);
  p.map((x, y, c) => mulc(c, 0.8 + p.rng.next() * 0.4));
});
T('garage_door', (p) => {
  p.fill([218, 218, 210]);
  for (let y = 0; y < TS; y += 16) { p.rect(0, y, 64, 1, [160, 160, 154]); p.rect(0, y + 1, 64, 1, [236, 236, 230]); }
  for (let x = 0; x < TS; x += 16) for (let y = 0; y < TS; y += 16) p.bevel(x + 3, y + 4, 10, 9, -0.06, -0.04);
}, 8);
T('window_lit', (p) => {
  p.fill([250, 214, 130]);
  p.map((x, y, c) => mulc(c, 0.9 + 0.12 * Math.sin(y * 0.1)));
  p.rect(30, 0, 4, 64, [236, 232, 220]); p.rect(0, 30, 64, 4, [236, 232, 220]);
  p.frame(0, 0, 64, 64, [236, 232, 220]); p.frame(1, 1, 62, 62, [236, 232, 220]);
}, 8);
T('window_dark', (p) => {
  p.fill([34, 40, 50]);
  p.map((x, y, c) => (Math.abs(x - y) < 4 ? mulc(c, 1.5) : c));
  p.rect(30, 0, 4, 64, [200, 200, 196]); p.rect(0, 30, 64, 4, [200, 200, 196]);
  p.frame(0, 0, 64, 64, [200, 200, 196]); p.frame(1, 1, 62, 62, [200, 200, 196]);
}, 8);
T('house_door', (p) => {
  p.fill([120, 40, 36]);
  p.bevel(8, 6, 20, 24, -0.15, -0.1); p.bevel(36, 6, 20, 24, -0.15, -0.1);
  p.bevel(8, 36, 20, 22, -0.15, -0.1); p.bevel(36, 36, 20, 22, -0.15, -0.1);
  p.rect(52, 32, 5, 4, [210, 190, 100]);
}, 16);

// ---------------------------------------------------------------- water / special
T('water_black', (p) => {
  p.fill([10, 11, 14]);
  p.map((x, y, c) => (pnoise(x, y, 8, p.seed) > 0.72 ? [24, 26, 32] : c));
}, 4);
T('water_dark', (p) => {
  p.fill([22, 30, 36]);
  p.map((x, y, c) => (Math.sin(x * 0.3 + pnoise(x, y, 4, p.seed) * 6) > 0.9 ? [50, 64, 72] : c));
}, 8);
T('water_pool', (p) => {
  p.fill([90, 160, 190]);
  p.map((x, y, c) => (Math.sin(x * 0.25 + pnoise(x, y, 4, p.seed) * 8) > 0.85 ? [160, 210, 230] : c));
}, 8);
T('car_white', (p) => { p.fill([218, 218, 212]); p.noise(4, 0.04, 2); p.grain(0.02); }, 8);
T('car_glass', (p) => {
  p.fill([34, 40, 46]);
  p.map((x, y, c) => (Math.abs(x - y * 0.6 - 20) < 5 ? mulc(c, 1.8) : c));
}, 8);
T('tire', (p) => {
  p.fill([26, 26, 26]);
  for (let y = 0; y < TS; y += 6) p.rect(0, y, 64, 2, [44, 44, 44]);
}, 4);
T('car_grille', (p) => {
  p.fill([40, 40, 42]);
  for (let y = 2; y < TS; y += 6) p.rect(0, y, 64, 3, [170, 172, 176]);
  p.rect(2, 22, 10, 18, [230, 220, 170]); p.rect(52, 22, 10, 18, [230, 220, 170]);
}, 8);
T('taillight', (p) => { p.fill([170, 20, 20]); p.rect(0, 40, 64, 24, [220, 200, 180]); }, 4);
T('burnt', (p) => {
  p.fill([40, 34, 30]);
  p.noise(4, 0.4, 3);
  p.grain(0.15);
}, 8);

// ---------------------------------------------------------------- decals (alpha)
function decal(fn) {
  return (p, r) => { p.clearAlpha(0); fn(p, r); };
}
function softBlob(p, cx, cy, rad, c, strength, seed, stretchY = 1) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = pnoise(x, y, 8, seed) * 0.6 + pnoise(x, y, 16, seed + 1) * 0.4;
    const d = Math.hypot(x - cx, (y - cy) / stretchY) / rad + (n - 0.5) * 0.8;
    if (d < 1) {
      const k = p.i(x, y);
      const a = Math.min(255, Math.max(p.a[k], (1 - d) * 255 * strength * 1.6));
      p.a[k] = a;
      p.set(x, y, c);
    }
  }
}
T('dec_stain', decal((p) => softBlob(p, 32, 32, 26, [118, 92, 50], 0.9, p.seed)), 4);
T('dec_stain2', decal((p) => softBlob(p, 32, 30, 24, [96, 78, 44], 0.8, p.seed + 3, 1.4)), 4);
T('dec_mold', decal((p, r) => {
  for (let i = 0; i < 18; i++) softBlob(p, r.int(14, 50), r.int(14, 50), r.range(4, 10), [52, 58, 40], 0.9, p.seed + i);
}), 4);
T('dec_soot', decal((p) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = pfbm(x, y, 4, 3, p.seed);
    const d = Math.hypot((x - 32) / 30, (y - 44) / 34) + (n - 0.5) * 0.9 - (y < 44 ? 0 : 0.2);
    if (d < 1) { p.set(x, y, [16, 14, 12]); p.a[p.i(x, y)] = (1 - d) * 400; }
  }
}), 4);
T('dec_scuff', decal((p, r) => {
  for (let i = 0; i < 10; i++) {
    let x = r.int(4, 56), y = r.int(10, 54);
    const len = r.int(6, 18);
    for (let k = 0; k < len; k++) { p.set(x, y, [40, 38, 36]); p.alpha(x, y, 180); x++; if (r.chance(0.3)) y += r.sign(); }
  }
}), 4);
T('dec_shadow', decal((p) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const d = Math.hypot((x - 31.5) / 30, (y - 31.5) / 30);
    if (d < 1) { p.set(x, y, [0, 0, 0]); p.a[p.i(x, y)] = Math.min(255, (1 - d) * 340); }
  }
}), 2);
T('dec_outlet', decal((p) => {
  p.rect(26, 22, 12, 20, [226, 224, 214]); p.rectA(26, 22, 12, 20, 255);
  p.rect(29, 27, 2, 4, [40, 40, 40]); p.rect(33, 27, 2, 4, [40, 40, 40]);
  p.rect(29, 34, 2, 4, [40, 40, 40]); p.rect(33, 34, 2, 4, [40, 40, 40]);
}), 4);
T('dec_switch', decal((p) => {
  p.rect(26, 20, 12, 22, [226, 224, 214]); p.rectA(26, 20, 12, 22, 255);
  p.rect(30, 27, 4, 7, [200, 196, 186]);
}), 4);
T('dec_vent', decal((p) => {
  p.rect(4, 14, 56, 36, [160, 162, 160]); p.rectA(4, 14, 56, 36, 255);
  for (let y = 18; y < 46; y += 4) p.rect(8, y, 48, 2, [50, 52, 52]);
  p.frame(4, 14, 56, 36, [130, 132, 130]);
}), 8);
T('dec_vent_floor', decal((p) => {
  p.rect(6, 6, 52, 52, [150, 152, 150]); p.rectA(6, 6, 52, 52, 255);
  for (let x = 10; x < 54; x += 4) p.rect(x, 10, 2, 44, [30, 30, 32]);
  p.frame(6, 6, 52, 52, [110, 112, 110]);
}), 8);
T('dec_speaker', decal((p) => {
  p.rect(8, 8, 48, 48, [214, 210, 196]); p.rectA(8, 8, 48, 48, 255);
  p.disc(32, 32, 17, [176, 172, 160]);
  for (let y = 18; y < 47; y += 3) for (let x = 18; x < 47; x += 3) if (Math.hypot(x - 32, y - 32) < 15) p.set(x, y, [90, 88, 80]);
}), 8);
T('dec_tally', decal((p, r) => {
  for (let g = 0; g < 4; g++) {
    const x0 = 6 + g * 14, y0 = 18 + r.int(-2, 2);
    for (let k = 0; k < 4; k++) for (let y = 0; y < 16; y++) { p.set(x0 + k * 3, y0 + y, [50, 46, 40]); p.alpha(x0 + k * 3, y0 + y, 230); }
    for (let k = 0; k < 13; k++) { p.set(x0 - 1 + k, y0 + 12 - k, [50, 46, 40]); p.alpha(x0 - 1 + k, y0 + 12 - k, 230); }
  }
}), 4);
T('dec_arrow', decal((p) => {
  const c = [70, 60, 50];
  for (let x = 8; x < 50; x++) for (let w = 0; w < 3; w++) { p.set(x, 31 + w, c); p.alpha(x, 31 + w, 230); }
  for (let k = 0; k < 12; k++) for (let w = 0; w < 3; w++) {
    p.set(50 - k + w, 32 - k, c); p.alpha(50 - k + w, 32 - k, 230);
    p.set(50 - k + w, 32 + k, c); p.alpha(50 - k + w, 32 + k, 230);
  }
}), 4);
T('dec_crack', decal((p, r) => {
  for (let b = 0; b < 3; b++) {
    let x = 32, y = 32;
    for (let k = 0; k < 30; k++) { p.set(x, y, [30, 28, 26]); p.alpha(x, y, 220); x += r.int(-1, 1) + (b - 1); y += r.chance(0.7) ? r.sign() : 0; }
  }
}), 4);
T('dec_puddle', decal((p) => softBlob(p, 32, 32, 28, [40, 44, 46], 1.3, p.seed)), 4);
T('dec_paper', decal((p, r) => {
  const ang = r.range(-0.5, 0.5);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const lx = (x - 32) * ca + (y - 32) * sa, ly = -(x - 32) * sa + (y - 32) * ca;
    if (Math.abs(lx) < 16 && Math.abs(ly) < 21) {
      p.set(x, y, Math.abs(ly + 15) < 1 || (Math.round(ly) % 4 === 0 && lx > -12 && lx < 8 && ly > -10) ? [150, 150, 150] : [232, 228, 216]);
      p.alpha(x, y, 255);
    }
  }
}), 8);
T('dec_ceiling_hole', decal((p) => {
  p.rect(0, 0, 64, 64, [20, 18, 16]); p.rectA(2, 2, 60, 60, 255);
}), 2);

export const TEX_DEFS = DEFS;

// Modules register textures in whatever order their (possibly async) imports finish, so the
// layer order is made deterministic by sorting on name. (Animated sets like static0..3 stay
// consecutive.)
function ordered() {
  const seen = new Map();
  for (const d of DEFS) seen.set(d.name, d);
  return [...seen.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// name -> layer mapping without painting anything
export function textureIndex() {
  const index = {};
  ordered().forEach((d, i) => { index[d.name] = i; });
  return index;
}

let ORDER = null;
function order() { if (!ORDER || ORDER.length !== new Set(DEFS.map((d) => d.name)).size) ORDER = ordered(); return ORDER; }
export function textureCount() { return order().length; }
// RGBA pixels of one layer (layer numbers as in textureIndex())
export function generateLayer(i) {
  const d = order()[i];
  if (!d) return null;
  const p = new Painter(strHash(d.name));
  d.fn(p, p.rng);
  return finalize(p, d.colors);
}

export function generateTextures() {
  const layers = [], index = {};
  for (const d of ordered()) {
    const p = new Painter(strHash(d.name));
    d.fn(p, p.rng);
    index[d.name] = layers.length;
    layers.push(finalize(p, d.colors));
  }
  return { layers, index };
}
