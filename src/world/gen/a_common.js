// Shared assets + helpers for the storage / warehouse / maintenance zone types:
// textures, materials and props (all prefixed a_), plus small layout helpers.
import { defineTexture, signTex } from '../../gfx/textures.js';
import { pnoise, pfbm } from '../../gfx/texgen.js';
import { defineMaterial, M } from '../materials.js';
import { defineProp, propMat as S, propTex as T, propGlow, propFrontBox, propWithXf, PROP_FIT as FIT } from '../props.js';
import { xfMul, xfTranslate, xfRotY, xfRotX } from '../../core/math.js';
import { CHUNK } from '../../config.js';
import { VerticalMap } from '../vertical.js';

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mulc = (c, m) => [c[0] * m, c[1] * m, c[2] * m];
const TAU64 = (Math.PI * 2) / 64; // one period across a 64px tile

// ================================================================== textures
// side view of a pallet: deck boards on top, three blocks with fork openings, bottom boards
function palletSide(p, r, y0, h, tint = 1) {
  const wood = mulc([172, 136, 88], tint), dark = [32, 27, 22];
  const top = Math.max(2, Math.round(h * 0.24)), bot = Math.max(1, Math.round(h * 0.16));
  p.rect(0, y0, 64, h, wood);
  for (const [a, b] of [[6, 28], [36, 58]]) p.rect(a, y0 + top, b - a, h - top - bot, dark);
  p.rect(0, y0, 64, 1, mulc(wood, 1.12));
  p.rect(0, y0 + top - 1, 64, 1, mulc(wood, 0.8));
  p.rect(0, y0 + h - 1, 64, 1, mulc(wood, 0.78));
  for (let k = 0; k < 8; k++) p.set(r.int(0, 63), y0 + r.int(0, h - 1), mulc(wood, 0.72), 0.7);
}

// rows of cardboard boxes (seams, flaps, tape, labels) between rows y0..y1, tiling in x
function boxRows(p, r, y0, y1, nRows, o = {}) {
  const rh = (y1 - y0) / nRows;
  for (let row = 0; row < nRows; row++) {
    const ya = Math.round(y0 + row * rh), yb = Math.round(y0 + (row + 1) * rh);
    const widths = [];
    let sum = 0;
    while (sum < 64) { const w = r.int(o.minW || 14, o.maxW || 30); widths.push(w); sum += w; }
    widths[widths.length - 1] -= sum - 64;
    if (widths.length > 1 && widths[widths.length - 1] < 8) { const e = widths.pop(); widths[widths.length - 1] += e; }
    let x = r.int(0, 63);
    for (const w of widths) {
      const base = mulc(mix(o.c0 || [184, 142, 90], o.c1 || [148, 110, 68], r.next()), r.range(0.9, 1.08));
      for (let yy = ya; yy < yb; yy++) for (let xx = 0; xx < w; xx++) p.set(x + xx, yy, base);
      for (let yy = ya; yy < yb; yy++) p.set(x, yy, mulc(base, 0.55));
      for (let xx = 0; xx < w; xx++) p.set(x + xx, ya, mulc(base, 0.6));
      for (let xx = 1; xx < w; xx++) { p.set(x + xx, ya + 2, mulc(base, 0.86)); p.set(x + xx, yb - 3, mulc(base, 0.88)); }
      if (o.tape !== false && r.chance(0.7)) p.rect(x + Math.floor(w / 2) - 1, ya + 1, 3, Math.min(7, yb - ya - 2), mix(base, [222, 196, 146], 0.6));
      if (w > 12 && r.chance(o.labels ?? 0.35)) {
        const lx = x + r.int(2, w - 10), ly = ya + r.int(4, Math.max(4, yb - ya - 9));
        p.rect(lx, ly, 8, 6, [228, 226, 216]); p.rect(lx + 1, ly + 2, 6, 1, [90, 90, 90]); p.rect(lx + 1, ly + 4, 4, 1, [90, 90, 90]);
      }
      if (w > 12 && r.chance(o.arrows ?? 0.2)) p.text('↑', x + 3, ya + 4, mulc(base, 0.45));
      x += w;
    }
  }
}

defineTexture('a_load_wrap', (p, r) => {
  boxRows(p, r, 0, 57, 3, { tape: false, labels: 0.25 });
  palletSide(p, r, 57, 7);
  p.map((x, y, c) => {
    if (y >= 58) return c;
    const s = 0.4 + 0.12 * Math.sin(x * TAU64 * 3 + y * 0.35) + ((y % 11) < 2 ? 0.14 : 0) + (y < 3 ? 0.15 : 0);
    return mix(c, [210, 214, 216], Math.min(0.85, s));
  });
  p.grain(0.03);
});
defineTexture('a_load_box', (p, r) => {
  boxRows(p, r, 0, 57, 3, { labels: 0.45, arrows: 0.3 });
  palletSide(p, r, 57, 7);
  p.grain(0.03);
});
defineTexture('a_pallet', (p, r) => {
  for (let k = 0; k < 4; k++) palletSide(p, r, k * 16, 16, r.range(0.82, 1.06));
  p.grain(0.05);
}, 16);
defineTexture('a_boxstack', (p, r) => {
  boxRows(p, r, 0, 64, 2, { minW: 18, maxW: 34, labels: 0.3, arrows: 0.25 });
  p.grain(0.035);
});
defineTexture('a_crate', (p, r) => {
  p.map((x, y) => mulc([152, 114, 68], 0.86 + 0.16 * (Math.sin(y * 0.9 + pnoise(x, y, 4, p.seed) * 9) * 0.5 + 0.5)));
  for (let k = 0; k < 4; k++) { const y = 8 + k * 12; p.shade(8, y, 48, 11, r.range(-0.12, 0.08)); p.rect(8, y + 11, 48, 1, [72, 52, 30]); }
  for (const [x, y, w, h] of [[0, 0, 64, 8], [0, 56, 64, 8], [0, 0, 8, 64], [56, 0, 8, 64]]) p.shade(x, y, w, h, -0.16);
  for (let t = 0; t < 48; t++) for (let w = -3; w <= 3; w++) p.set(8 + t, 55 - t + w, p.get(8 + t, 55 - t + w).map((v) => v * 0.9));
  for (let t = 0; t < 48; t++) { p.set(8 + t, 52 - t, [84, 60, 34]); p.set(8 + t, 59 - t, [84, 60, 34]); }
  p.frame(0, 0, 64, 64, [70, 50, 30]); p.frame(8, 8, 48, 48, [70, 50, 30]);
  for (const [x, y] of [[3, 3], [60, 3], [3, 60], [60, 60], [32, 3], [32, 60], [3, 32], [60, 32]]) p.set(x, y, [40, 40, 40]);
  if (r.chance(0.7)) p.text('FRAGILE', 11, 21, [52, 36, 22], 1, 0.55);
  p.grain(0.04);
});
defineTexture('a_archive', (p, r) => {
  // four archive boxes side by side; the texture is squashed ~4:1 vertically on the shelf
  for (let k = 0; k < 4; k++) {
    const x = k * 16;
    const base = r.weighted([[[222, 218, 204], 4], [[184, 150, 104], 3], [[192, 192, 188], 1.5], [[120, 132, 150], 0.4]]);
    const c = mulc(base, r.range(0.9, 1.04));
    p.rect(x, 0, 16, 64, c);
    p.rect(x, 0, 16, 9, mulc(c, 1.05)); p.rect(x, 9, 16, 2, mulc(c, 0.7));
    if (r.chance(0.85)) {
      const lw = r.int(7, 11), lx = x + Math.floor((16 - lw) / 2);
      p.rect(lx, 16, lw, 18, [236, 234, 226]);
      for (let yy = 20; yy < 32; yy += 4) p.rect(lx + 1, yy, r.int(3, lw - 2), 2, r.chance(0.5) ? [40, 40, 60] : [90, 40, 40]);
    }
    p.rect(x + 5, 44, 6, 9, mulc(c, 0.35));
    p.rect(x, 0, 1, 64, mulc(c, 0.45));
    p.shade(x + 14, 0, 2, 64, -0.12);
  }
  p.grain(0.03);
});
defineTexture('a_epoxy', (p, r) => {
  p.fill([112, 121, 112]);
  p.noise(3, 0.05, 2);
  p.map((x, y, c) => { const n = pfbm(x, y, 4, 3, p.seed + 7); return n > 0.6 ? mix(c, [150, 147, 139], Math.min(1, (n - 0.6) * 5)) : c; });
  p.speckle(120, [90, 98, 90], 0.3, 0.6);
  for (let k = 0; k < 3; k++) {
    const y0 = r.int(0, 63), ph = r.range(0, 6);
    for (let x = 0; x < 64; x++) p.set(x, y0 + Math.round(Math.sin(x * TAU64 * 2 + ph) * 2), [72, 74, 70], 0.22);
  }
  p.grain(0.04);
});
defineTexture('a_deck', (p, r) => {
  p.map((x) => { const ph = x % 16; const v = ph < 6 ? 148 : ph < 8 ? 110 : ph < 14 ? 130 : 98; return [v, v + 2, v + 5]; });
  p.noise(2, 0.05, 2);
  for (let k = 0; k < 2; k++) p.stain(r.int(0, 63), r.int(0, 63), r.range(5, 9), [118, 96, 72], 0.35);
  p.grain(0.03);
}, 12);
function lineDecal(col) {
  return (p, r) => {
    p.fill(col);
    p.clearAlpha(0);
    for (let y = 0; y < 64; y++) for (let x = 6; x < 58; x++) {
      if ((x < 8 || x > 55) && r.chance(0.5)) continue;
      if (pnoise(x, y, 8, p.seed) > 0.7 && r.chance(0.65)) continue;
      if (r.chance(0.03)) continue;
      p.alpha(x, y, 255);
    }
    p.noise(4, 0.08, 2);
  };
}
defineTexture('a_dec_line', lineDecal([212, 176, 44]), 8);
defineTexture('a_dec_line_w', lineDecal([212, 210, 198]), 8);
defineTexture('a_dec_hatch', (p, r) => {
  p.fill([210, 174, 44]);
  p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const on = ((x + y) & 15) < 5 || x < 3 || x > 60 || y < 3 || y > 60;
    if (on && !r.chance(0.05)) p.alpha(x, y, 255);
  }
  p.noise(4, 0.08, 2);
}, 4);
defineTexture('a_rolldoor', (p, r) => {
  p.fill([166, 168, 166]);
  p.noise(4, 0.04, 2);
  for (let y = 0; y < 58; y += 4) { p.rect(0, y, 64, 1, [116, 118, 118]); p.rect(0, y + 1, 64, 1, [194, 196, 194]); }
  p.rect(0, 58, 64, 6, [64, 64, 66]);
  p.rect(28, 54, 8, 3, [56, 56, 58]);
  p.rect(0, 0, 2, 64, [104, 104, 106]); p.rect(62, 0, 2, 64, [104, 104, 106]);
  for (let i = 0; i < 5; i++) p.drip(r.int(4, 60), r.int(6, 40), r.int(6, 18), [118, 98, 78], 0.25);
}, 16);
defineTexture('a_gauge', (p) => {
  p.fill([20, 20, 20]);
  p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32);
    if (d < 30) { p.alpha(x, y, 255); p.set(x, y, d > 26 ? [168, 170, 174] : [232, 230, 220]); }
  }
  for (let k = 0; k <= 8; k++) {
    const a = -2.35 + (k / 8) * 4.7;
    p.rect(32 + Math.sin(a) * 21 - 1, 32 - Math.cos(a) * 21 - 1, 2, 2, [30, 30, 30]);
  }
  for (let a = 1.4; a < 2.35; a += 0.04) p.rect(32 + Math.sin(a) * 23, 32 - Math.cos(a) * 23, 2, 2, [190, 40, 30]);
  p.line(32, 32, 32 + Math.sin(0.9) * 19, 32 - Math.cos(0.9) * 19, [170, 30, 26]);
  p.line(33, 32, 33 + Math.sin(0.9) * 19, 32 - Math.cos(0.9) * 19, [170, 30, 26]);
  p.disc(32, 32, 3, [40, 40, 40]);
}, 8);
defineTexture('a_sheet', (p) => {
  p.map((x, y) => mulc([214, 210, 198], 0.84 + 0.14 * Math.sin(x * TAU64 * 3 + pnoise(x, y, 4, p.seed) * 3)));
  p.noise(4, 0.04, 2);
  p.speckle(70, [168, 164, 150], 0.2, 0.45);
  p.grain(0.02);
}, 12);
defineTexture('a_paperbox', (p) => {
  p.fill([226, 224, 216]);
  p.noise(4, 0.03, 2);
  p.rect(0, 22, 64, 16, [40, 74, 150]);
  p.text('COPY', 20, 26, [236, 236, 236]);
  p.rect(0, 0, 64, 4, [204, 202, 194]); p.rect(0, 4, 64, 1, [150, 148, 140]);
  p.text('10 REAMS', 8, 46, [90, 90, 96]);
  p.frame(0, 0, 64, 64, [168, 166, 158]);
}, 16);
defineTexture('a_breaker', (p) => {
  p.fill([128, 132, 130]);
  p.bevel(0, 0, 64, 64, 0.12, 0.25);
  p.rect(6, 6, 52, 50, [104, 108, 106]);
  for (let row = 0; row < 8; row++) for (const cx of [10, 36]) {
    p.rect(cx, 9 + row * 6, 18, 4, [54, 54, 56]);
    p.rect(cx + ((row * 7 + cx) % 3 ? 3 : 11), 10 + row * 6, 4, 2, [200, 200, 196]);
  }
  p.rect(30, 8, 4, 46, [86, 88, 88]);
  p.rect(8, 58, 22, 3, [230, 228, 220]);
}, 16);
defineTexture('a_foldchair', (p) => {
  // a folded metal chair seen from the front: rails, back panel, folded seat; gaps transparent
  p.fill([150, 152, 156]);
  p.clearAlpha(0);
  const fr = [64, 66, 70];
  p.rect(10, 0, 4, 64, fr); p.rect(50, 0, 4, 64, fr); p.rectA(10, 0, 4, 64, 255); p.rectA(50, 0, 4, 64, 255);
  p.rect(14, 3, 36, 14, [158, 160, 164]); p.rectA(14, 3, 36, 14, 255);
  p.rect(14, 24, 36, 22, [140, 142, 146]); p.rectA(14, 24, 36, 22, 255);
  p.rect(14, 45, 36, 1, [90, 92, 96]);
  p.rect(14, 56, 36, 2, fr); p.rectA(14, 56, 36, 2, 255);
  p.noise(4, 0.05, 2);
}, 8);
// signs
defineTexture('a_sign_dock', signTex(['LOADING', 'DOCK'], [36, 60, 120], [240, 240, 240], 1), 8);
defineTexture('a_sign_forklift', signTex(['CAUTION', 'FORKLIFT', 'TRAFFIC'], [230, 200, 40], [30, 30, 30], 1), 8);
defineTexture('a_sign_load', signTex(['MAX LOAD', '1000 KG', 'PER BAY'], [230, 200, 40], [30, 30, 30], 1), 8);
defineTexture('a_sign_boiler', signTex(['BOILER', 'ROOM'], [200, 200, 196], [40, 40, 40], 1), 8);
defineTexture('a_sign_pump', signTex(['PUMP', 'ROOM 2'], [200, 200, 196], [40, 40, 40], 1), 8);
defineTexture('a_sign_nosmoke', signTex(['NO', 'SMOKING'], [230, 226, 214], [180, 30, 30], 1), 8);
defineTexture('a_sign_records', signTex(['RECORDS', 'STORAGE'], [60, 64, 70], [230, 220, 180], 1), 8);
defineTexture('a_sign_supply', signTex(['SUPPLY', 'ROOM'], [230, 226, 210], [40, 40, 40], 1), 8);
defineTexture('a_sign_janitor', signTex(['JANITOR'], [230, 226, 210], [40, 40, 40], 1), 8);
defineTexture('a_sign_hardhat', signTex(['HARD HAT', 'AREA'], [40, 120, 60], [240, 240, 230], 1), 8);
defineTexture('a_sign_danger', (p) => {
  p.fill([236, 234, 226]);
  p.rect(0, 0, 64, 22, [30, 30, 30]);
  p.rect(6, 4, 52, 14, [196, 30, 30]);
  p.text('DANGER', 14, 8, [250, 240, 230]);
  p.text('HIGH', 20, 30, [30, 30, 30]);
  p.text('VOLTAGE', 11, 42, [30, 30, 30]);
  p.frame(0, 0, 64, 64, [120, 120, 120]);
}, 8);
defineTexture('a_sign_aisle', (p) => {
  p.fill([28, 46, 104]);
  p.text('AISLE', 17, 5, [230, 230, 220]);
  p.rect(4, 15, 56, 1, [200, 200, 190]);
  p.frame(0, 0, 64, 64, [210, 210, 200]);
  p.frame(1, 1, 62, 62, [28, 46, 104]);
}, 8);

// ================================================================== materials
defineMaterial('a_load_wrap', 'a_load_wrap', { s: 1.2, surf: 'plastic' });
defineMaterial('a_load_box', 'a_load_box', { s: 1.2, surf: 'wood' });
defineMaterial('a_pallet', 'a_pallet', { su: 1.2, sv: 0.6, surf: 'wood' });
defineMaterial('a_boxstack', 'a_boxstack', { su: 1.2, sv: 1.2, surf: 'wood', stain: 0.06 });
defineMaterial('a_crate', 'a_crate', { s: 1.0, surf: 'wood', stain: 0.05 });
defineMaterial('a_archive', 'a_archive', { s: 1.2, surf: 'wood' });
defineMaterial('a_filecab', 'file_cabinet', { s: 0.5, surf: 'metal' });
defineMaterial('a_epoxy', 'a_epoxy', { s: 4, surf: 'concrete', stain: 0.1 });
defineMaterial('a_deck', 'a_deck', { s: 2, surf: 'metal', stain: 0.08 });

// ================================================================== props
// rod / pipe between two points relative to the anchor (opts.a, opts.b)
defineProp('a_rod', {
  build(mb, p) {
    const o = p.opts;
    const st = S(o.mat || 'pipe', o.tint ? { tint: o.tint } : undefined);
    const r = o.r || 0.05, sides = o.sides || 6;
    mb.rod(o.a[0], o.a[1], o.a[2], o.b[0], o.b[1], o.b[2], r, sides, st, !!o.caps);
    if (o.collar) {
      const dx = o.b[0] - o.a[0], dy = o.b[1] - o.a[1], dz = o.b[2] - o.a[2];
      const l = Math.hypot(dx, dy, dz) || 1, k = Math.min(0.08, l * 0.2) / l;
      const c = o.collar === 'b' ? o.b : o.a;
      mb.rod(c[0] - dx * k, c[1] - dy * k, c[2] - dz * k, c[0] + dx * k, c[1] + dy * k, c[2] + dz * k, r * 1.35, sides, st, true);
    }
  },
  boxes: (p) => p.opts.box || null,
});

// red handwheel valve facing local -z (the stem sticks out of a pipe or wall at the origin)
defineProp('a_valve', {
  build(mb, p) {
    const red = S(p.opts.mat || 'pipe_red'), dk = S('metal_dark');
    const R = p.opts.r || 0.13, zf = -(p.opts.stem || 0.12);
    mb.rod(0, 0, 0, 0, 0, zf - 0.02, 0.02, 4, dk);
    const n = 6;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      mb.rod(Math.cos(a0) * R, Math.sin(a0) * R, zf, Math.cos(a1) * R, Math.sin(a1) * R, zf, 0.016, 4, red);
    }
    mb.rod(-R, 0, zf, R, 0, zf, 0.011, 4, red);
    mb.rod(0, -R, zf, 0, R, zf, 0.011, 4, red);
  },
});

// pressure gauge facing local -z
defineProp('a_gauge', {
  build(mb, p) {
    const r0 = p.opts.r || 0.08;
    mb.rod(0, 0, 0, 0, 0, -0.06, 0.012, 4, S('chrome'));
    propWithXf(mb, xfMul(xfTranslate(0, 0, -0.06), xfRotX(Math.PI / 2)), () => mb.cyl(0, -0.04, 0, r0, 0.04, 8, S('metal_dark'), 0));
    const z = -0.102;
    mb.quad([r0, -r0, z, -r0, -r0, z, -r0, r0, z, r0, r0, z], [0, 0, -1], T('a_gauge'), [0, 1, 1, 1, 1, 0, 0, 0]);
  },
});

// vertical boiler with burner box, gauge and an optional flue to height opts.flue
defineProp('a_boiler', {
  build(mb, p) {
    const R = p.opts.r || 0.75, H = p.opts.h || 2.1;
    const body = S(p.opts.mat || 'metal_green', p.opts.tint ? { tint: p.opts.tint } : undefined), dk = S('metal_dark');
    mb.box(-R - 0.12, 0, -R - 0.12, R + 0.12, 0.15, R + 0.12, S('concrete'), { skip: 8 });
    mb.cyl(0, 0.15, 0, R, H, 10, body, 1);
    mb.cyl(0, 0.15 + H, 0, R * 0.62, 0.22, 10, body, 1);
    mb.cyl(0, 0.15 + H * 0.3, 0, R + 0.025, 0.07, 10, dk, 0);
    mb.cyl(0, 0.15 + H * 0.78, 0, R + 0.025, 0.07, 10, dk, 0);
    if (p.opts.flue) mb.rod(0, 0.3 + H, 0, 0, p.opts.flue, 0, 0.17, 6, S('duct'));
    mb.box(-0.32, 0.18, -R - 0.32, 0.32, 0.78, -R + 0.15, dk, { skip: 8 });
    mb.box(-0.22, 0.3, -R - 0.33, 0.22, 0.66, -R - 0.32, S('rust'), { skip: 8 });
    const gz = -R - 0.02, gy = 1.35, g = 0.1;
    mb.quad([g, gy - g, gz, -g, gy - g, gz, -g, gy + g, gz, g, gy + g, gz], [0, 0, -1], T('a_gauge'), [0, 1, 1, 1, 1, 0, 0, 0]);
    mb.rod(R - 0.05, 1.75, 0, R + 0.55, 1.75, 0, 0.07, 6, S('pipe'));
    mb.rod(-R + 0.05, 0.6, 0, -R - 0.5, 0.6, 0, 0.06, 6, S('pipe_red'));
  },
  boxes: (p) => { const R = (p.opts.r || 0.75) + 0.12; return [[-R, 0, -R - 0.25, R, (p.opts.h || 2.1) + 0.35, R]]; },
  emitter: { snd: 'machine', vol: 0.5, rad: 9, y: 1.0, cond: (p) => !!p.opts.on },
});

// horizontal tank on two saddles
defineProp('a_tank', {
  build(mb, p) {
    const R = p.opts.r || 0.6, L = p.opts.len || 2.4, y = R + 0.3;
    const body = S(p.opts.mat || 'metal', p.opts.tint ? { tint: p.opts.tint } : undefined), dk = S('metal_dark');
    mb.rod(-L / 2, y, 0, L / 2, y, 0, R, 10, body, true);
    for (const s of [-1, 1]) mb.box(s * L * 0.3 - 0.08, 0, -R * 0.75, s * L * 0.3 + 0.08, y - R * 0.5, R * 0.75, dk, { skip: 8 });
    mb.rod(L * 0.2, y + R - 0.05, 0, L * 0.2, y + R + 0.45, 0, 0.06, 6, S('pipe'));
    const g = 0.09, gx = -L * 0.2, gz = -R - 0.01;
    mb.quad([gx + g, y - g, gz, gx - g, y - g, gz, gx - g, y + g, gz, gx + g, y + g, gz], [0, 0, -1], T('a_gauge'), [0, 1, 1, 1, 1, 0, 0, 0]);
  },
  boxes: (p) => { const R = p.opts.r || 0.6, L = p.opts.len || 2.4; return [[-L / 2, 0, -R, L / 2, 2 * R + 0.3, R]]; },
});

// electric pump on a concrete pad
defineProp('a_pump', {
  build(mb, p) {
    const c = S(p.opts.mat || 'metal_green', p.opts.tint ? { tint: p.opts.tint } : undefined), dk = S('metal_dark');
    mb.box(-0.62, 0, -0.32, 0.62, 0.12, 0.32, S('concrete'), { skip: 8 });
    mb.box(-0.55, 0.12, -0.22, 0.55, 0.18, 0.22, dk, { skip: 8 });
    mb.rod(-0.52, 0.42, 0, 0.04, 0.42, 0, 0.2, 8, c, true);
    mb.rod(0.04, 0.42, 0, 0.12, 0.42, 0, 0.1, 6, dk);
    mb.rod(0.12, 0.42, 0, 0.38, 0.42, 0, 0.24, 8, S('pipe_red'), true);
    mb.rod(0.25, 0.64, 0, 0.25, p.opts.up || 1.3, 0, 0.08, 6, S('pipe'));
    mb.rod(0.38, 0.42, 0, 0.75, 0.42, 0, 0.08, 6, S('pipe'));
  },
  boxes: [[-0.62, 0, -0.32, 0.62, 0.68, 0.32]],
  emitter: { snd: 'machine', vol: 0.35, rad: 7, y: 0.5, cond: (p) => !!p.opts.on },
});

// transformer / switchgear cabinet with cooling fins
defineProp('a_transformer', {
  build(mb) {
    const g = S('metal_green', { tint: [0.82, 0.88, 0.82] });
    mb.box(-0.64, 0, -0.48, 0.64, 0.1, 0.48, S('concrete'), { skip: 8 });
    propFrontBox(mb, g, T('panel_elec'), -0.6, 0.1, -0.44, 0.6, 1.6, 0.44, [0, 0, 1, 1]);
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
      const z = -0.32 + k * 0.2;
      mb.box(s > 0 ? 0.6 : -0.72, 0.25, z, s > 0 ? 0.72 : -0.6, 1.4, z + 0.03, g, { skip: 8 | (s > 0 ? 2 : 1) });
    }
    for (let k = -1; k <= 1; k++) mb.cyl(k * 0.3, 1.6, 0.1, 0.06, 0.26, 6, S('porcelain'), 1);
  },
  boxes: [[-0.74, 0, -0.48, 0.74, 1.7, 0.48]],
  emitter: { snd: 'transformer', vol: 0.6, rad: 8, y: 1.0 },
});

// wall breaker panel (back at local z = 0)
defineProp('a_breaker', {
  build(mb) { propFrontBox(mb, S('metal'), T('a_breaker'), -0.3, 0.9, -0.1, 0.3, 1.9, 0.0); },
  boxes: [[-0.3, 0.9, -0.1, 0.3, 1.9, 0]],
});

// 200 litre drum
defineProp('a_drum', {
  build(mb, p, r) {
    const tint = p.opts.tint || r.pick([[0.5, 0.75, 1.35], [1.25, 0.55, 0.45], [0.6, 0.6, 0.6], [1, 1, 1], [0.6, 0.95, 0.6]]);
    const st = S(p.opts.mat || 'metal', { tint });
    mb.cyl(0, 0, 0, 0.29, 0.88, 8, st, 1);
    mb.cyl(0, 0.28, 0, 0.302, 0.03, 8, st, 0);
    mb.cyl(0, 0.58, 0, 0.302, 0.03, 8, st, 0);
    mb.cyl(0.15, 0.88, 0.08, 0.035, 0.02, 5, S('metal_dark'), 1);
  },
  boxes: [[-0.29, 0, -0.29, 0.29, 0.88, 0.29]],
});

defineProp('a_bollard', {
  build(mb) {
    mb.cyl(0, 0, 0, 0.09, 1.05, 6, S('plastic_orange', { tint: [1.25, 1.1, 0.25] }), 1);
    mb.cyl(0, 0.82, 0, 0.096, 0.08, 6, S('plastic_black'), 0);
  },
  boxes: [[-0.1, 0, -0.1, 0.1, 1.05, 0.1]],
});

// hand pallet truck, forks toward local -z
defineProp('a_pjack', {
  build(mb, p) {
    const red = S(p.opts.mat || 'pipe_red'), dk = S('metal_dark'), blk = S('rubber');
    for (const s of [-1, 1]) {
      mb.box(s * 0.28 - 0.08, 0.03, -1.15, s * 0.28 + 0.08, 0.09, 0, red, { skip: 8 });
      mb.box(s * 0.28 - 0.04, 0, -1.12, s * 0.28 + 0.04, 0.03, -1.0, blk, { skip: 8 });
    }
    mb.box(-0.36, 0.03, 0, 0.36, 0.2, 0.22, red, { skip: 8 });
    mb.box(-0.12, 0.2, 0.05, 0.12, 0.42, 0.2, red, { skip: 8 });
    mb.box(-0.1, 0, 0.06, 0.1, 0.06, 0.2, blk, { skip: 8 });
    mb.rod(0, 0.4, 0.12, 0, 1.15, 0.42, 0.02, 4, dk);
    mb.box(-0.14, 1.12, 0.38, 0.14, 1.2, 0.46, blk);
  },
  boxes: [[-0.37, 0, -1.15, 0.37, 0.25, 0.25]],
});

// swing-arm dock lamp on the wall (back at local z = 0)
defineProp('a_docklight', {
  build(mb, p) {
    const dk = S('metal_dark');
    mb.box(-0.06, -0.1, -0.06, 0.06, 0.1, 0, dk);
    const L = p.opts.len || 0.9, a = p.opts.ang || 0.5;
    const ex = Math.sin(a) * L, ez = -Math.cos(a) * L;
    mb.rod(0, 0, -0.03, ex, 0, ez, 0.022, 4, dk);
    propWithXf(mb, xfTranslate(ex, -0.04, ez), () => {
      mb.cyl(0, -0.16, 0, 0.15, 0.2, 6, S('plastic_gray'), 1);
      if (p.opts.on) mb.cyl(0, -0.17, 0, 0.11, 0.01, 6, propGlow('bulb', 1.1), 2);
    });
  },
  light: { y: -0.4, z: -0.8, color: [1.0, 0.86, 0.62], rad: 4.6, int: 0.5, cond: (p) => !!p.opts.on },
});

// hanging double-sided sign with a number; the anchor is the top of the chains
defineProp('a_hangsign', {
  build(mb, p) {
    const drop = p.opts.drop || 0.6, Wd = 0.9, Hh = 0.5;
    const yb = -drop - Hh, yt = -drop;
    const dk = S('metal_dark');
    for (const s of [-1, 1]) mb.box(s * 0.35 - 0.01, yt, -0.01, s * 0.35 + 0.01, 0, 0.01, dk, { skip: 12 });
    const face = T(p.opts.tex || 'a_sign_aisle');
    mb.box(-Wd / 2, yb, -0.02, Wd / 2, yt, 0.02, [dk, dk, dk, dk, face, face], { uv: ['world', 'world', 'world', 'world', FIT, FIT] });
    const txt = String(p.opts.num ?? '01');
    const n = txt.length, y0 = yb + 0.04, y1 = yb + 0.36;
    for (let k = 0; k < n; k++) {
      const d = T('digit_' + txt[k]);
      if (d.layer === undefined) continue;
      const off = (k - (n - 1) / 2) * 0.2;
      let cx = -off;
      mb.quad([cx + 0.1, y0, -0.023, cx - 0.1, y0, -0.023, cx - 0.1, y1, -0.023, cx + 0.1, y1, -0.023], [0, 0, -1], d, [0, 1, 1, 1, 1, 0, 0, 0]);
      cx = off;
      mb.quad([cx - 0.1, y0, 0.023, cx + 0.1, y0, 0.023, cx + 0.1, y1, 0.023, cx - 0.1, y1, 0.023], [0, 0, 1], d, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  },
});

// furniture under a dust sheet: a slightly tapered draped block (or seat + back for chairs/sofas)
function drape(mb, st, x0, z0, x1, z1, top, e) {
  const b = [x0 - e, z0 - e, x1 + e, z1 + e], t = [x0 + e * 0.4, z0 + e * 0.4, x1 - e * 0.4, z1 - e * 0.4];
  const uv = [0, 1, 1, 1, 1, 0, 0, 0];
  mb.poly4([b[2], 0, b[1]], [b[0], 0, b[1]], [t[0], top, t[1]], [t[2], top, t[1]], st, uv);
  mb.poly4([b[0], 0, b[3]], [b[2], 0, b[3]], [t[2], top, t[3]], [t[0], top, t[3]], st, uv);
  mb.poly4([b[0], 0, b[1]], [b[0], 0, b[3]], [t[0], top, t[3]], [t[0], top, t[1]], st, uv);
  mb.poly4([b[2], 0, b[3]], [b[2], 0, b[1]], [t[2], top, t[1]], [t[2], top, t[3]], st, uv);
  mb.poly4([t[0], top, t[3]], [t[2], top, t[3]], [t[2], top, t[1]], [t[0], top, t[1]], st, uv);
}
defineProp('a_sheet', {
  build(mb, p) {
    const st = T('a_sheet');
    const w = p.opts.w || 1.0, d = p.opts.d || 0.9, h = p.opts.h || 0.9, sh = p.opts.shape || 'box';
    if (sh === 'chair' || sh === 'sofa') {
      drape(mb, st, -w / 2, -d / 2, w / 2, d / 2, h * 0.5, 0.05);
      drape(mb, st, -w / 2, d * 0.2, w / 2, d / 2, h, 0.04);
    } else {
      drape(mb, st, -w / 2, -d / 2, w / 2, d / 2, h, 0.05);
    }
    // a loose corner hanging down
    mb.tri3([w / 2 + 0.05, 0, -d / 2 - 0.05], [w / 2 - 0.2, h * 0.4, -d / 2 - 0.06], [w / 2 + 0.08, h * 0.45, -d / 2 + 0.1], st, [0, 1, 1, 1, 0.5, 0]);
  },
  boxes: (p) => [[-(p.opts.w || 1) / 2, 0, -(p.opts.d || 0.9) / 2, (p.opts.w || 1) / 2, p.opts.h || 0.9, (p.opts.d || 0.9) / 2]],
});

// stack of nested plastic chairs
defineProp('a_chairstack', {
  build(mb, p) {
    const n = p.opts.n || 8;
    const c = S('plastic_' + (p.opts.color || 'orange')), fr = S('metal');
    const top = 0.42 + (n - 1) * 0.055;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 0.19 - 0.012, 0, sz * 0.17 - 0.012, sx * 0.19 + 0.012, top, sz * 0.17 + 0.012, fr, { skip: 12 });
    for (let k = 0; k < n; k++) {
      const y = 0.42 + k * 0.055, dz = k * 0.012;
      mb.box(-0.22, y, -0.22 + dz, 0.22, y + 0.035, 0.2 + dz, c, { skip: k ? 8 : 0 });
      propWithXf(mb, xfMul(xfTranslate(0, y + 0.035, 0.2 + dz), xfRotX(-0.18)), () => mb.box(-0.21, 0, -0.03, 0.21, 0.4, 0.0, c, { skip: 8 }));
    }
  },
  boxes: (p) => [[-0.24, 0, -0.24, 0.24, 0.9 + (p.opts.n || 8) * 0.055, 0.32]],
});

// folded metal chairs leaning against the wall behind (local +z)
defineProp('a_foldchairs', {
  build(mb, p) {
    const n = p.opts.n || 5;
    const face = T('a_foldchair'), side = S('metal_dark');
    for (let k = 0; k < n; k++) {
      const z = -0.12 - k * 0.07;
      propWithXf(mb, xfMul(xfTranslate(0, 0, z), xfRotX(0.16)), () => {
        mb.box(-0.22, 0, -0.02, 0.22, 0.92, 0.02, [side, side, side, null, face, face], { uv: ['world', 'world', 'world', 'world', FIT, FIT] });
      });
    }
  },
  boxes: (p) => [[-0.23, 0, -0.16 - (p.opts.n || 5) * 0.07, 0.23, 0.92, 0.05]],
});

// stack of copy paper boxes
defineProp('a_paperboxes', {
  build(mb, p, r) {
    const n = p.opts.n || 3;
    const side = T('a_paperbox'), top = S('plastic_white');
    let y = 0;
    for (let k = 0; k < n; k++) {
      const ox = r.range(-0.03, 0.03), oz = r.range(-0.03, 0.03), a = r.range(-0.1, 0.1);
      propWithXf(mb, xfMul(xfTranslate(ox, y, oz), xfRotY(a)), () => mb.box(-0.23, 0, -0.15, 0.23, 0.27, 0.15, [side, side, top, null, side, side], { uv: [FIT, FIT, 'world', 'world', FIT, FIT] }));
      y += 0.27;
    }
  },
  boxes: (p) => [[-0.24, 0, -0.16, 0.24, (p.opts.n || 3) * 0.27, 0.16]],
});

// a single archive box (front = local -z)
defineProp('a_archbox', {
  build(mb, p, r) {
    const k = r.int(0, 3), front = [k * 0.25, 0, k * 0.25 + 0.25, 1];
    const st = T('a_archive'), side = S('cardboard', { tint: [1.12, 1.1, 1.02] });
    const lid = p.opts.open ? null : side;
    mb.box(-0.16, 0, -0.21, 0.16, 0.27, 0.21, [side, side, lid, null, st, st], { uv: ['world', 'world', 'world', 'world', front, front] });
    if (p.opts.open) {
      mb.box(-0.15, 0.05, -0.2, 0.15, 0.25, 0.2, S('plastic_white'), { skip: 8 | 4 });
      mb.quad([-0.15, 0.24, 0.2, 0.15, 0.24, 0.2, 0.15, 0.24, -0.2, -0.15, 0.24, -0.2], [0, 1, 0], T('paper'), [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  },
  boxes: [[-0.16, 0, -0.21, 0.16, 0.27, 0.21]],
});

// single wooden crate (opts.s size)
defineProp('a_crate', {
  build(mb, p) {
    const s = p.opts.s || 0.8, h = p.opts.h || s;
    const st = T('a_crate');
    mb.box(-s / 2, 0, -s / 2, s / 2, h, s / 2, st, { uv: 'fit', skip: 8 });
  },
  boxes: (p) => { const s = p.opts.s || 0.8; return [[-s / 2, 0, -s / 2, s / 2, p.opts.h || s, s / 2]]; },
});

// light shelving unit with varied contents; front = local -z, back against a wall
function shelfFill(mb, r, kind, x0, y, x1, gap, D) {
  const back = D / 2 - 0.03, frontZ = -D / 2 + 0.03;
  let x = x0;
  const sideSt = { cardboard: S('cardboard'), white: S('plastic_white'), dark: S('plastic_black') };
  while (x < x1 - 0.12) {
    if (kind === 'empty') break;
    let w, h, st, front = null, frontUV = FIT;
    if (kind === 'paper' || (kind === 'supplies' && r.chance(0.3))) {
      w = 0.46; h = Math.min(gap, 0.27); st = S('plastic_white'); front = T('a_paperbox');
    } else if (kind === 'archive') {
      w = 0.32; h = Math.min(gap, 0.27); st = S('cardboard', { tint: [1.1, 1.08, 1.0] }); const k = r.int(0, 3); front = T('a_archive'); frontUV = [k * 0.25, 0, k * 0.25 + 0.25, 1];
    } else if (kind === 'cans') {
      w = 0.2; h = Math.min(gap, 0.22);
      if (r.chance(0.85)) mb.cyl(x + 0.1, y, 0, 0.09, h, 6, S(r.chance(0.5) ? 'metal' : 'plastic_white', { tint: r.pick([[1, 1, 1], [1.1, 0.7, 0.5], [0.6, 0.8, 1.2]]) }), 1);
      x += w + 0.03;
      continue;
    } else if (kind === 'linen') {
      w = r.range(0.3, 0.42); h = Math.min(gap, r.range(0.12, 0.3)); st = S('plastic_white', { tint: r.pick([[1, 1, 1], [0.8, 0.88, 1.05], [1.02, 0.98, 0.9]]) });
    } else {
      w = r.range(0.25, 0.5); h = Math.min(gap, r.range(0.16, gap)); st = sideSt.cardboard;
    }
    if (x + w > x1) break;
    if (r.chance(kind === 'boxes' ? 0.78 : 0.86)) {
      const d0 = kind === 'linen' ? frontZ + 0.05 : frontZ + r.range(0, 0.06);
      const sts = front ? [st, st, st, null, st, front] : st;
      mb.box(x, y, d0, x + w, y + h, back, sts, front ? { uv: ['world', 'world', 'world', 'world', 'world', frontUV], skip: 8 | 16 } : { skip: 8 | 16 });
    }
    x += w + r.range(0.02, 0.06);
  }
}
defineProp('a_shelf', {
  build(mb, p, r) {
    const Wd = p.opts.w || 1.2, Hh = p.opts.h || 2.0, D = p.opts.d || 0.45, n = p.opts.n || 4;
    const m = S(p.opts.mat || 'metal');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * Wd / 2 - 0.02, 0, sz * D / 2 - 0.02, sx * Wd / 2 + 0.02, Hh, sz * D / 2 + 0.02, m, { skip: 12 });
    const step = (Hh - 0.12) / (n - 1);
    for (let k = 0; k < n; k++) {
      const y = 0.08 + k * step;
      mb.box(-Wd / 2, y, -D / 2, Wd / 2, y + 0.03, D / 2, m, { skip: k === 0 ? 8 : 0 });
      if (k < n - 1) shelfFill(mb, r, p.opts.fill || 'boxes', -Wd / 2 + 0.04, y + 0.03, Wd / 2 - 0.04, step - 0.07, D);
    }
  },
  boxes: (p) => [[-(p.opts.w || 1.2) / 2, 0, -(p.opts.d || 0.45) / 2, (p.opts.w || 1.2) / 2, p.opts.h || 2, (p.opts.d || 0.45) / 2]],
});

// slowly turning ceiling fan (use with zb.dynamic); the anchor is the ceiling
defineProp('a_fan', {
  build(mb, p) {
    const drop = p.opts.drop || 0.5, dk = S('metal_dark');
    mb.box(-0.015, -drop, -0.015, 0.015, 0, 0.015, dk, { skip: 12 });
    mb.cyl(0, -drop - 0.14, 0, 0.1, 0.16, 6, dk, 3);
    for (let k = 0; k < 4; k++) {
      propWithXf(mb, xfMul(xfTranslate(0, -drop - 0.09, 0), xfRotY((k * Math.PI) / 2)), () => mb.box(0.08, -0.01, -0.07, 0.72, 0.01, 0.07, S('wood_dark')));
    }
  },
});

// ================================================================== helpers
export function lightState(r, fail, flicker, dying = 0.35) {
  const u = r.next();
  if (u < fail) return 'off';
  if (u < fail + flicker) return r.chance(dying) ? 'dying' : 'flicker';
  return 'on';
}

export function verticalFeatures(zb, world) {
  if (!world || zb.zone.dim !== 0) return [];
  if (!world.vertical) world.vertical = new VerticalMap(world);
  const z = zb.zone;
  return world.vertical.featuresAt(z.dim, z.level, zb.x0 - 2, zb.z0 - 2, zb.x1 + 2, zb.z1 + 2);
}

// Cells that must stay free of content: gate cells (+depth inward, +-1 sideways) and the
// footprints (+2) of stairwells / light wells that the pipeline will stamp later.
export function keepClearMask(zb, world, depth = 3, side = 1) {
  const m = new Uint8Array(zb.w * zb.d);
  const mark = (x, z) => { if (zb.in(x, z)) m[zb.i(x, z)] = 1; };
  for (const g of zb.gates) {
    for (let k = 0; k < depth; k++) for (let s = -side; s <= side; s++) mark(g.x + g.dx * k + (g.dz ? s : 0), g.z + g.dz * k + (g.dx ? s : 0));
  }
  for (const f of verticalFeatures(zb, world)) {
    const rot = f.kind === 'stair' && f.rot % 2;
    const ww = rot ? f.d : f.w, wd = rot ? f.w : f.d;
    for (let z = f.oz - 2; z < f.oz + wd + 2; z++) for (let x = f.ox - 2; x < f.ox + ww + 2; x++) mark(x, z);
  }
  return m;
}
export function rectClear(zb, mask, x0, z0, x1, z1) {
  for (let z = Math.floor(z0); z < Math.ceil(z1); z++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
    if (!zb.in(x, z)) return false;
    if (mask[zb.i(x, z)]) return false;
  }
  return true;
}

// split [a, b) at chunk borders
function cuts(a, b) {
  const out = [a];
  for (let c = (Math.floor(a / CHUNK) + 1) * CHUNK; c < b - 1e-6; c += CHUNK) out.push(c);
  out.push(b);
  return out;
}

// Box brush whose side faces tile a texture every `tu` metres horizontally (continuous in world
// space, or starting at each face's left edge with o.local) and fit / tile (`tv`) vertically from
// the top. Split at chunk borders so the explicit UVs survive the chunk clipping.
export function tbox(zb, x0, y0, z0, x1, y1, z1, side, top, tu, tv, o = {}) {
  const xs = cuts(x0, x1), zs = cuts(z0, z1);
  const vb = tv ? (y1 - y0) / tv : 1;
  const bottom = o.bottom === undefined ? 0 : o.bottom;
  for (let a = 0; a + 1 < xs.length; a++) for (let b = 0; b + 1 < zs.length; b++) {
    const ax = xs[a], bx = xs[a + 1], az = zs[b], bz = zs[b + 1];
    let skip = o.skip || 0;
    if (a > 0) skip |= 2;
    if (a + 2 < xs.length) skip |= 1;
    if (b > 0) skip |= 32;
    if (b + 2 < zs.length) skip |= 16;
    const R = (s, e) => { if (o.local) return [s, 0, e, vb]; const k = Math.floor(s); return [s - k, 0, e - k, vb]; };
    let px, nx, pz, nz;
    if (o.local) {
      px = R((z1 - bz) / tu, (z1 - az) / tu); nx = R((az - z0) / tu, (bz - z0) / tu);
      pz = R((ax - x0) / tu, (bx - x0) / tu); nz = R((x1 - bx) / tu, (x1 - ax) / tu);
    } else {
      px = R(-bz / tu, -az / tu); nx = R(az / tu, bz / tu);
      pz = R(ax / tu, bx / tu); nz = R(-bx / tu, -ax / tu);
    }
    const sd = o.sides || [side, side, side, side];
    zb.box(ax, y0, az, bx, y1, bz, [sd[0], sd[1], top, bottom, sd[2], sd[3]], {
      collide: o.collide, render: o.render, skip, uv: [px, nx, 'world', 'world', pz, nz], sub: o.sub || 50, tint: o.tint, flags: o.flags,
    });
  }
}

// plain brush split at chunk borders with an explicit subdivision (long thin members)
export function bar(zb, x0, y0, z0, x1, y1, z1, mat, o = {}) {
  zb.box(x0, y0, z0, x1, y1, z1, mat, { sub: o.sub || 50, skip: o.skip || 0, collide: o.collide, render: o.render, tint: o.tint, uv: o.uv });
}

// rod prop between two absolute points (heights relative to the level)
export function rod(zb, ax, ay, az, bx, by, bz, r, mat, o = {}) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
  return zb.prop('a_rod', mx, my, mz, 0, {
    a: [ax - mx, ay - my, az - mz], b: [bx - mx, by - my, bz - mz], r, mat, tint: o.tint, sides: o.sides, caps: o.caps, collar: o.collar, collide: false, box: o.box,
  });
}

// pipe along a polyline of absolute points, cut into short props (so each lies in one chunk and
// gets lit properly), with collars at the corners
export function pipeRun(zb, pts, r, mat, o = {}) {
  const seg = o.seg || 2.5;
  for (let i = 0; i + 1 < pts.length; i++) {
    const A = pts[i], B = pts[i + 1];
    const len = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    if (len < 0.01) continue;
    const n = Math.max(1, Math.ceil(len / seg));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const P = (t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
      const a = P(t0), b = P(t1);
      const collar = (k === 0 && i > 0) || (o.flanges && k > 0) ? 'a' : undefined;
      rod(zb, a[0], a[1], a[2], b[0], b[1], b[2], r, mat, { tint: o.tint, sides: o.sides, collar });
    }
  }
}

// painted floor line from (ax, az) to (bx, bz) (axis aligned), cut into <= 4 m decals
export function floorLine(zb, ax, az, bx, bz, wd, tex, y = 0) {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.05) return;
  const n = Math.max(1, Math.ceil(len / 4));
  const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    zb.decal(ax + (bx - ax) * t, y, az + (bz - az) * t, 'up', wd * 1.25, len / n, tex, { rot: alongX ? Math.PI / 2 : 0 });
  }
}

// is any part of the box inside the zone and not overlapping masked cells?
export function boxFree(zb, mask, x0, z0, x1, z1) {
  if (x0 < zb.x0 || z0 < zb.z0 || x1 > zb.x1 || z1 > zb.z1) return false;
  return rectClear(zb, mask, x0, z0, x1, z1);
}

export { M, mix, mulc };
