// Level 5 (Ornate Hotel): props. Chandeliers, columns, gilt doors, suite furniture.
import { defineProp, propMat as S, propTex as T, propGlow as glow, propFrontBox as frontBox, propWithXf as withXf } from '../props.js';
import { xfRotY } from '../../core/math.js';

const FIT = [0, 0, 1, 1];

// A crystal chandelier hanging from the ceiling point at its origin. opts: drop (chain), r, tiers.
defineProp('lv5_chandelier', {
  build(mb, p) {
    const o = p.opts, drop = o.drop ?? 1.2, R = o.r ?? 0.9, tiers = o.tiers ?? 2;
    const g = S('lv5_gold'), bulb = glow('bulb', 1.2), crystal = S('chrome', { tint: [1.0, 0.95, 0.8] });
    mb.rod(0, 0, 0, 0, -drop, 0, 0.035, 4, g);
    mb.cyl(0, -drop - 0.5, 0, 0.16, 0.5, 6, g, 3);
    for (let t = 0; t < tiers; t++) {
      const r = R * (1 - t * 0.38), y = -drop - 0.25 - t * 0.42;
      const n = t === 0 ? 8 : 6;
      mb.cyl(0, y - 0.07, 0, r, 0.07, n * 2, g, 0, null, 0);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + t * 0.3, c = Math.cos(a), s = Math.sin(a);
        mb.rod(0, y + 0.18 + t * 0.1, 0, c * r, y, s * r, 0.018, 4, g);
        mb.box(c * r - 0.045, y, s * r - 0.045, c * r + 0.045, y + 0.14, s * r + 0.045, bulb, { skip: 8 });
        if (t === 0) mb.rod(c * r * 0.92, y - 0.07, s * r * 0.92, c * r * 0.92, y - 0.42, s * r * 0.92, 0.012, 4, crystal);
      }
    }
    mb.cyl(0, -drop - 0.5 - 0.22, 0, 0.05, 0.22, 4, crystal, 2);
  },
});

defineProp('lv5_sconce', {
  build(mb) {
    const g = S('lv5_gold');
    mb.box(-0.09, -0.16, -0.025, 0.09, 0.2, 0, g);
    mb.box(-0.025, 0.0, -0.17, 0.025, 0.05, -0.025, g);
    mb.box(-0.06, 0.02, -0.26, 0.06, 0.2, -0.14, glow('bulb', 1.2));
  },
  light: { y: 0.15, z: -0.4, color: [1.0, 0.78, 0.46], rad: 5.5, int: 0.6 },
});

defineProp('lv5_column', {
  build(mb, p) {
    const h = p.opts.h ?? 7, c = S('lv5_column'), g = S('lv5_gold');
    mb.box(-0.5, 0, -0.5, 0.5, 0.4, 0.5, c);
    mb.box(-0.42, 0.4, -0.42, 0.42, 0.55, 0.42, g);
    mb.cyl(0, 0.55, 0, 0.36, h - 1.2, 8, c, 0, null, 0.39);
    mb.box(-0.45, h - 0.65, -0.45, 0.45, h - 0.5, 0.45, g);
    mb.box(-0.6, h - 0.5, -0.6, 0.6, h, 0.6, g);
  },
  boxes: (p) => [[-0.46, 0, -0.46, 0.46, p.opts.h ?? 7, 0.46]],
});

// gilt plant pot with a fern
defineProp('lv5_palm', {
  build(mb, p, r) {
    mb.cyl(0, 0, 0, 0.26, 0.5, 8, S('lv5_gold'), 1);
    mb.cyl(0, 0.46, 0, 0.2, 0.05, 8, S('dark'), 1);
    const lv = T('lv5_leaf', { lit: true });
    const h = p.opts.h ?? r.range(1.2, 1.7);
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI / 3 + r.range(0, 0.4), c = Math.cos(a) * 0.62, s = Math.sin(a) * 0.62;
      mb.card([-c, 0.48, -s, c, 0.48, s, c, 0.48 + h, s, -c, 0.48 + h, -s], [s, 0, -c], lv, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  },
  boxes: [[-0.27, 0, -0.27, 0.27, 0.6, 0.27]],
});

defineProp('lv5_urn', {
  build(mb, p) {
    const g = S('lv5_gold'), w = S('lv5_marble_wall');
    const h = p.opts.h ?? 1.0;
    mb.box(-0.28, 0, -0.28, 0.28, 0.12, 0.28, w);
    mb.cyl(0, 0.12, 0, 0.2, h * 0.15, 8, g, 1);
    mb.cyl(0, 0.12 + h * 0.15, 0, 0.3, h * 0.45, 8, w, 0);
    mb.cyl(0, 0.12 + h * 0.6, 0, 0.17, h * 0.25, 8, w, 0);
    mb.cyl(0, 0.12 + h * 0.85, 0, 0.26, 0.06, 8, g, 3);
  },
  boxes: [[-0.3, 0, -0.3, 0.3, 1.1, 0.3]],
});

// closed double door seen from the corridor (width 2, front toward -z); hinge side irrelevant
defineProp('lv5_door2', {
  build(mb) {
    const w = S('wood_dark'), st = T('lv5_door');
    for (const sx of [-1, 1]) {
      const x0 = sx < 0 ? -1 : 0, x1 = sx < 0 ? 0 : 1;
      mb.box(x0 + 0.02, 0, -0.04, x1 - 0.02, 2.6, 0.04, [w, w, w, null, null, st], { uv: ['world', 'world', 'world', 'world', 'world', sx < 0 ? [1, 0, 0, 1] : FIT] });
    }
    mb.box(-0.03, 0, -0.05, 0.03, 2.6, 0.05, S('lv5_gold'));
  },
  use: 'locked',
  boxes: [[-1, 0, -0.06, 1, 2.6, 0.06]],
});

// ------------------------------------------------------------------ suite furniture
defineProp('lv5_bed', {
  build(mb) {
    const wd = S('wood_dark'), spread = S('lv5_bedspread'), g = S('lv5_gold'), wh = S('plastic_white');
    mb.box(-0.9, 0.12, -1.05, 0.9, 0.42, 1.05, wd);
    mb.box(-0.85, 0.42, -1.0, 0.85, 0.62, 1.0, S('mattress'));
    mb.box(-0.86, 0.62, -0.95, 0.86, 0.66, 0.5, spread);
    mb.box(-0.86, 0.5, -1.02, 0.86, 0.66, -0.94, spread);
    for (const sx of [-1, 1]) mb.box(sx * 0.42 - 0.3, 0.62, 0.58, sx * 0.42 + 0.3, 0.76, 0.95, wh);
    mb.box(-0.95, 0.12, 1.02, 0.95, 1.5, 1.12, wd);
    mb.box(-0.95, 1.5, 1.0, 0.95, 1.58, 1.14, g);
    for (const sx of [-1, 1]) { mb.box(sx * 0.95 - 0.04, 0, 1.0, sx * 0.95 + 0.04, 1.65, 1.14, g, { skip: 8 }); mb.box(sx * 0.95 - 0.04, 0, -1.1, sx * 0.95 + 0.04, 0.8, -1.0, g, { skip: 8 }); }
    mb.box(-0.95, 0.12, -1.1, 0.95, 0.6, -1.02, wd);
  },
  boxes: [[-0.98, 0, -1.12, 0.98, 0.8, 1.14]],
});

defineProp('lv5_nightstand', {
  build(mb, p) {
    const wd = S('wood_dark'), g = S('lv5_gold');
    mb.box(-0.26, 0.04, -0.22, 0.26, 0.66, 0.22, wd);
    mb.box(-0.28, 0.66, -0.24, 0.28, 0.7, 0.24, g);
    mb.box(-0.2, 0.3, -0.225, 0.2, 0.34, -0.22, g);
    if (p.opts.lamp !== false) {
      mb.cyl(0, 0.7, 0, 0.07, 0.2, 6, g, 1);
      mb.cyl(0, 0.88, 0, 0.14, 0.2, 6, glow('lamp_shade', 0.9), 0);
    }
  },
  boxes: [[-0.28, 0, -0.24, 0.28, 0.7, 0.24]],
  light: { y: 0.95, color: [1.0, 0.76, 0.46], rad: 5, int: 0.5, cond: (p) => p.opts.lamp !== false },
});

defineProp('lv5_wardrobe', {
  build(mb) {
    const wd = S('wood_dark'), st = T('lv5_door');
    mb.box(-0.55, 0, -0.3, 0.55, 2.3, 0.3, [wd, wd, wd, null, wd, st], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 2, 1]] });
    mb.box(-0.6, 2.3, -0.33, 0.6, 2.42, 0.33, S('lv5_gold'));
  },
  boxes: [[-0.6, 0, -0.33, 0.6, 2.42, 0.33]],
});

defineProp('lv5_console', {
  build(mb) {
    const g = S('lv5_gold'), mar = S('lv5_marble_wall');
    mb.box(-0.55, 0.7, -0.2, 0.55, 0.76, 0.2, mar);
    for (const sx of [-1, 1]) mb.box(sx * 0.5 - 0.035, 0, -0.17, sx * 0.5 + 0.035, 0.7, 0.17, g, { skip: 8 });
    mb.box(-0.5, 0.2, 0.15, 0.5, 0.24, 0.19, g);
  },
  boxes: [[-0.55, 0, -0.2, 0.55, 0.76, 0.2]],
});

defineProp('lv5_clock', {
  build(mb) {
    const wd = S('wood_dark'), g = S('lv5_gold');
    mb.box(-0.3, 0, -0.2, 0.3, 0.35, 0.2, wd);
    mb.box(-0.22, 0.35, -0.16, 0.22, 1.6, 0.16, [wd, wd, wd, null, wd, S('dark')], {});
    mb.box(-0.08, 0.5, -0.17, 0.08, 1.35, -0.16, g);
    mb.box(-0.3, 1.6, -0.2, 0.3, 2.1, 0.2, wd);
    mb.quad([0.2, 1.65, -0.205, -0.2, 1.65, -0.205, -0.2, 2.05, -0.205, 0.2, 2.05, -0.205], [0, 0, -1], T('clock_c'), [0, 1, 1, 1, 1, 0, 0, 0]);
    mb.box(-0.34, 2.1, -0.24, 0.34, 2.2, 0.24, g);
  },
  boxes: [[-0.32, 0, -0.22, 0.32, 2.2, 0.22]],
  emitter: { snd: 'lv5_tick', vol: 0.55, rad: 10, y: 1.5 },
});

// pair of curtains with a lit window pane between them (flat against the wall, front toward -z)
defineProp('lv5_window', {
  build(mb, p) {
    const w = p.opts.w ?? 1.5, h = p.opts.h ?? 2.2, y0 = p.opts.y0 ?? 0.7;
    mb.box(-w / 2, y0, -0.03, w / 2, y0 + h, 0.0, [null, null, null, null, null, S('lv5_moon')], { uv: ['world', 'world', 'world', 'world', 'world', FIT] });
    const cur = S('lv5_curtain');
    for (const sx of [-1, 1]) mb.box(sx * (w / 2 + 0.22) - 0.22, y0 - 0.15, -0.16, sx * (w / 2 + 0.22) + 0.22, y0 + h + 0.25, -0.02, cur);
    mb.box(-w / 2 - 0.5, y0 + h + 0.2, -0.2, w / 2 + 0.5, y0 + h + 0.3, -0.02, S('lv5_gold'));
  },
  light: { y: 1.6, z: -0.5, color: [0.5, 0.58, 0.9], rad: 4.5, int: 0.35 },
});
void frontBox; void withXf; void xfRotY;
