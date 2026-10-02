// Assets for pocket 5, the Scaffolded Suburb: the cargo-racked house prop, its lit windows, the
// pallet decks the houses sit on, floor paint and the sign shown above the portal doors.
import { defineTexture, signTex } from '../../gfx/textures.js';
import { defineProp, propMat as S, propTex as T, propGlow as glow, PROP_FIT as FIT } from '../props.js';
import { hash32 } from '../../core/rng.js';

// ------------------------------------------------------------------ textures
defineTexture('ei_sign_inventory', signTex(['IN-', 'VEN-', 'TORY'], [52, 56, 64], [238, 170, 64], 2), 8);
defineTexture('ei_sign_office', signTex(['SALES', 'OFFICE'], [236, 232, 214], [150, 40, 36], 1), 8);

// street name plates: green strip painted into the top quarter of the tile
const STREETS = ['ELM ST', 'OAK AVE', '2ND ST', 'PINE CT', 'MAPLE DR', '5TH AVE'];
STREETS.forEach((n, k) => defineTexture('ei_street' + k, (p) => {
  p.fill([20, 98, 62]);
  p.rect(0, 0, 64, 16, [24, 112, 70]);
  p.frame(0, 0, 64, 16, [236, 238, 230]);
  p.text(n, 32 - Math.round((n.length * 6 - 1) / 2), 4, [244, 246, 238], 1);
}, 8));

// numbered aisle boards hanging over the aisles
for (let k = 0; k < 8; k++) defineTexture('ei_aisle' + k, signTex(['AISLE', String(k * 3 + 4).padStart(2, '0')], [30, 58, 120], [244, 240, 228], 1), 8);

// plank deck of a giant pallet (the shelf every house stands on)
defineTexture('ei_deck', (p, r) => {
  p.fill([150, 112, 70]);
  p.noise(4, 0.08, 2);
  for (let y = 0; y < 64; y += 16) {
    p.rect(0, y + 12, 64, 4, [46, 32, 22]);
    p.shade(0, y, 64, 12, r.range(-0.12, 0.06));
    for (let k = 0; k < 6; k++) p.rect(r.int(0, 60), y + r.int(1, 10), r.int(4, 14), 1, [112, 80, 48], 0.6);
  }
  for (let y = 0; y < 64; y += 16) for (const x of [4, 60]) p.rect(x, y + 5, 2, 2, [64, 60, 56]);
  p.grain(0.05);
}, 16);

// Windows. Every one is a fullbright pane with white frame and mullions.
function pane(p, top, bot, curtain) {
  for (let y = 0; y < 64; y++) {
    const t = y / 63;
    p.rect(0, y, 64, 1, [top[0] + (bot[0] - top[0]) * t, top[1] + (bot[1] - top[1]) * t, top[2] + (bot[2] - top[2]) * t]);
  }
  if (curtain) {
    p.rect(2, 2, 11, 60, curtain);
    p.rect(51, 2, 11, 60, curtain);
    for (const x of [5, 8, 54, 57]) p.rect(x, 2, 1, 60, [curtain[0] * 0.8, curtain[1] * 0.8, curtain[2] * 0.8], 0.8);
  }
  p.rect(30, 0, 4, 64, [236, 234, 224]);
  p.rect(0, 28, 64, 4, [236, 234, 224]);
  p.frame(0, 0, 64, 64, [236, 234, 224]); p.frame(1, 1, 62, 62, [236, 234, 224]); p.frame(2, 2, 60, 60, [210, 208, 196]);
}
defineTexture('ei_win_warm', (p) => pane(p, [255, 214, 120], [246, 168, 70], [226, 120, 54]), 16);
defineTexture('ei_win_cool', (p) => pane(p, [226, 240, 214], [196, 222, 200], null), 16);
defineTexture('ei_win_dim', (p) => pane(p, [214, 156, 84], [170, 100, 50], [150, 70, 40]), 16);
defineTexture('ei_garage', (p) => {
  p.fill([220, 218, 208]);
  for (let y = 0; y < 64; y += 16) { p.rect(0, y, 64, 1, [150, 148, 140]); p.rect(0, y + 1, 64, 1, [240, 238, 230]); p.bevel(6, y + 4, 22, 9, -0.05, -0.05); p.bevel(36, y + 4, 22, 9, -0.05, -0.05); }
  p.rect(0, 0, 2, 64, [170, 168, 160]); p.rect(62, 0, 2, 64, [170, 168, 160]);
}, 8);

// yellow lane paint along the aisle edges (decal, with worn gaps)
defineTexture('ei_line', (p, r) => {
  p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 14; x < 50; x++) {
    p.set(x, y, [226, 186, 34]);
    p.alpha(x, y, r.next() < 0.04 ? 0 : 255);
  }
  for (let k = 0; k < 5; k++) p.rectA(14, r.int(0, 56), 36, r.int(2, 5), 0);
}, 4);
// bay tag: white plate, black location code and a barcode
function tag(code) {
  return (p, r) => {
    p.fill([232, 230, 220]);
    p.frame(0, 0, 64, 64, [60, 60, 60]);
    p.text(code, 32 - Math.round(code.length * 3), 8, [30, 30, 34], 1);
    p.rect(4, 22, 56, 1, [90, 90, 90]);
    for (let x = 5; x < 59; x += 2) if (r.next() < 0.6) p.rect(x, 26, r.chance(0.5) ? 1 : 2, 28, [24, 24, 28]);
  };
}
for (const [i, c] of ['A-07', 'B-12', 'C-31', 'D-04'].entries()) defineTexture('ei_tag' + i, tag(c), 4);

// ------------------------------------------------------------------ the house
const SIDING = [
  ['siding', [1, 1, 1]], ['siding', [1.0, 0.95, 0.78]], ['siding_blue', [1, 1, 1]], ['siding', [0.82, 0.94, 0.82]],
  ['siding', [0.97, 0.83, 0.75]], ['siding_blue', [0.88, 1.0, 0.92]], ['siding', [0.9, 0.9, 1.0]],
];
const ROOFS = [[1, 1, 1], [1.5, 1.1, 0.9], [0.8, 1.0, 1.3], [1.2, 1.2, 1.2]];
const WIN = ['ei_win_warm', 'ei_win_warm', 'window_lit', 'ei_win_cool', 'ei_win_dim'];

const uvq = [0, 1, 1, 1, 1, 0, 0, 0];

// House built in local space: front faces -z, origin at the middle of the footprint on the deck.
// opts: v (variant hash), w (frontage along x), d (depth along z), lit (0..1 window probability)
defineProp('ei_house', {
  build(mb, p) {
    const o = p.opts, v = (o.v || 1) >>> 0;
    const h = (k) => hash32(v ^ Math.imul(k + 1, 0x9e3779b1)) / 4294967296;
    const Wd = o.w || 6.4, D = o.d || 5.3, FH = 2.5, HW = FH * 2;
    const [sm, st] = SIDING[Math.floor(h(1) * SIDING.length)];
    const side = S(sm, { tint: st });
    const trim = S('plastic_white');
    const roof = S('shingles', { tint: ROOFS[Math.floor(h(2) * ROOFS.length)] });
    const ridgeX = h(3) < 0.5;
    const rh = 1.7 + h(4) * 0.5;
    const hx = Wd / 2, hz = D / 2;
    // walls
    mb.box(-hx, 0, -hz, hx, HW, hz, [side, side, null, null, side, side], { sub: 2.6 });
    // white corner boards and the band between the storeys
    for (const sx of [-1, 1]) mb.box(sx * hx - 0.09, 0, -hz - 0.04, sx * hx + 0.09, HW, -hz + 0.12, trim, { skip: 12 });
    mb.box(-hx, FH - 0.07, -hz - 0.03, hx, FH + 0.07, -hz, trim, { skip: 12 });
    // gabled roof with eaves
    const oe = 0.35, ye = HW - 0.08;
    if (ridgeX) {
      const Z = hz + oe, X = hx + 0.3, yr = HW + rh;
      mb.poly4([-X, ye, Z], [X, ye, Z], [X, yr, 0], [-X, yr, 0], roof, [0, 2, 4, 2, 4, 0, 0, 0]);
      mb.poly4([X, ye, -Z], [-X, ye, -Z], [-X, yr, 0], [X, yr, 0], roof, [0, 2, 4, 2, 4, 0, 0, 0]);
      mb.tri3([hx, HW, hz], [hx, HW, -hz], [hx, yr - 0.1, 0], side, [0, 1, 1, 1, 0.5, 0]);
      mb.tri3([-hx, HW, -hz], [-hx, HW, hz], [-hx, yr - 0.1, 0], side, [0, 1, 1, 1, 0.5, 0]);
    } else {
      const X = hx + oe, Z = hz + 0.3, yr = HW + rh;
      mb.poly4([-X, ye, -Z], [-X, ye, Z], [0, yr, Z], [0, yr, -Z], roof, [0, 2, 4, 2, 4, 0, 0, 0]);
      mb.poly4([X, ye, Z], [X, ye, -Z], [0, yr, -Z], [0, yr, Z], roof, [0, 2, 4, 2, 4, 0, 0, 0]);
      mb.tri3([hx, HW, -hz], [-hx, HW, -hz], [0, yr - 0.1, -hz], side, [0, 1, 1, 1, 0.5, 0]);
      mb.tri3([-hx, HW, hz], [hx, HW, hz], [0, yr - 0.1, hz], side, [0, 1, 1, 1, 0.5, 0]);
    }
    // chimney
    if (h(5) < 0.55) {
      const cx = (h(6) < 0.5 ? -1 : 1) * hx * 0.55, cz = ridgeX ? 0 : (h(7) < 0.5 ? -1 : 1) * hz * 0.4;
      mb.box(cx - 0.4, HW + 0.2, cz - 0.4, cx + 0.4, Math.min(HW + rh + 0.9, 7.4), cz + 0.4, S('brick'), { skip: 8 });
    }
    // windows: glowing panes
    const lit = o.lit ?? 0.88;
    const win = (x, y0, y1, z, face, k, w = 1.0) => {
      const on = h(20 + k) < lit;
      const flick = on && h(60 + k) < 0.025 ? 1 + Math.floor(h(80 + k) * 4) : 0;
      const name = WIN[Math.floor(h(40 + k) * WIN.length)];
      const stl = on ? glow(name, 0.98 + 0.1 * h(100 + k), flick) : T('window_dark');
      const e = 0.02 * face;
      if (face < 0) mb.quad([x + w / 2, y0, z + e, x - w / 2, y0, z + e, x - w / 2, y1, z + e, x + w / 2, y1, z + e], [0, 0, -1], stl, uvq);
      else mb.quad([x - w / 2, y0, z + e, x + w / 2, y0, z + e, x + w / 2, y1, z + e, x - w / 2, y1, z + e], [0, 0, 1], stl, uvq);
    };
    const cols = [-hx * 0.62, 0, hx * 0.62];
    const garage = h(8) < 0.35;
    const doorCol = garage ? 2 : Math.floor(h(9) * 3);
    let kk = 0;
    for (let c = 0; c < 3; c++) {
      win(cols[c], FH + 0.75, FH + 2.0, -hz, -1, kk++);
      if (garage && c < 2) continue;
      if (c === doorCol) continue;
      win(cols[c], 0.85, 2.0, -hz, -1, kk++);
    }
    // door with a concrete stoop
    const dx = cols[doorCol];
    mb.quad([dx + 0.5, 0.0, -hz - 0.025, dx - 0.5, 0.0, -hz - 0.025, dx - 0.5, 2.1, -hz - 0.025, dx + 0.5, 2.1, -hz - 0.025], [0, 0, -1], T('house_door', { tint: [0.9 + h(10) * 0.5, 0.9 + h(11) * 0.3, 0.9 + h(12) * 0.5] }), uvq);
    mb.box(dx - 0.8, 0, -hz - 0.6, dx + 0.8, 0.22, -hz, S('concrete'), { skip: 8 });
    mb.box(dx - 0.62, 2.2, -hz - 0.7, dx + 0.62, 2.3, -hz, trim, { skip: 8 });
    if (garage) {
      const gx = (cols[0] + cols[1]) / 2;
      mb.quad([gx + 1.3, 0, -hz - 0.025, gx - 1.3, 0, -hz - 0.025, gx - 1.3, 2.15, -hz - 0.025, gx + 1.3, 2.15, -hz - 0.025], [0, 0, -1], T('ei_garage'), uvq);
    }
    // side windows
    for (const sgn of [-1, 1]) {
      const xs = sgn * (hx + 0.02);
      for (const [y0, y1] of [[0.9, 2.0], [FH + 0.8, FH + 2.0]]) {
        const on = h(120 + kk) < lit;
        const stl = on ? glow(WIN[Math.floor(h(140 + kk) * WIN.length)], 1.0) : T('window_dark');
        kk++;
        const z = 0, w = 0.5;
        if (sgn > 0) mb.quad([xs, y0, z + w, xs, y0, z - w, xs, y1, z - w, xs, y1, z + w], [1, 0, 0], stl, uvq);
        else mb.quad([xs, y0, z - w, xs, y0, z + w, xs, y1, z + w, xs, y1, z - w], [-1, 0, 0], stl, uvq);
      }
    }
  },
  boxes: (p) => {
    const Wd = p.opts.w || 6.4, D = p.opts.d || 5.4;
    return [[-Wd / 2, 0, -D / 2 - 0.3, Wd / 2, 6.6, D / 2]];
  },
});

// ------------------------------------------------------------------ street furniture
// street lamp with a sodium head, standing where the cross streets meet the aisles
defineProp('ei_streetlamp', {
  build(mb, p) {
    const m = S('metal_dark'), hd = S('metal');
    mb.cyl(0, 0, 0, 0.17, 0.14, 6, m, 3);
    mb.cyl(0, 0.14, 0, 0.055, 5.0, 6, m, 0);
    mb.rod(0, 5.0, 0, 0, 5.3, -0.5, 0.04, 4, m);
    mb.rod(0, 5.3, -0.5, 0, 5.24, -0.95, 0.04, 4, m);
    const g = glow('light_panel', 1.1);
    mb.box(-0.22, 5.1, -1.4, 0.22, 5.27, -0.72, [hd, hd, hd, g, hd, hd]);
    // two street name plates on the pole, one for each street that meets here
    const q = [0, 0, 1, 0.25], w = 'world', gr = S('metal_dark');
    const a = T('ei_street' + (p.opts.sa || 0)), b = T('ei_street' + (p.opts.sb || 1));
    mb.box(-0.4, 3.35, -0.05, 0.4, 3.6, 0.05, [gr, gr, gr, gr, a, a], { uv: [w, w, w, w, q, q] });
    mb.box(-0.05, 3.7, -0.4, 0.05, 3.95, 0.4, [b, b, gr, gr, gr, gr], { uv: [q, q, w, w, w, w] });
  },
  boxes: [[-0.12, 0, -0.12, 0.12, 5.0, 0.12]],
  light: { y: 4.95, z: -1.05, color: [1.0, 0.72, 0.42], rad: 8, int: 1.0 },
});
// numbered aisle board on two chains; hung with zb.dynamic so it turns slowly in the draught
defineProp('ei_aislesign', {
  build(mb, p) {
    const tex = T(p.opts.tex || 'ei_aisle0'), bd = S('plastic_blue'), ch = S('metal_dark');
    for (const sx of [-1, 1]) mb.rod(sx * 0.4, 0, 0, sx * 0.46, -0.75, 0, 0.012, 3, ch);
    mb.box(-0.55, -1.85, -0.04, 0.55, -0.75, 0.04, [bd, bd, bd, bd, tex, tex], { uv: ['world', 'world', 'world', 'world', FIT, FIT] });
  },
});
