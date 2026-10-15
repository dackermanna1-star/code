// Mall props: kiosks, retail fixtures, food court, escalator, shop fronts,
// security grilles and renovation / construction clutter.
import {
  PI, TAU, HP, V3, R, C, subR, rgb, mix, mul, pick, range, PALETTE, defProp, box, cbox, panel, quad, quadUV, quadTo,
  solid, clipQuad, extrude, rod, vcyl, loft, ringPts, blob, pushR, wp, beam, lamp, cable, crossCards, triTo, signMat, canvasMat,
} from './kit.js';
import { palm_tree, pallet } from './street.js';
import { vending_machine } from './hotel.js';
import { wheel } from './vehicles.js';

const css = (c) => { const a = rgb(c); return `rgb(${(a[0] * 255) | 0},${(a[1] * 255) | 0},${(a[2] * 255) | 0})`; };

/** Central information kiosk (octagonal counter + overhead sign). opts: color, text. Returns {topY}. */
export const mall_kiosk = defProp('mall_kiosk', (L, o) => {
  const t = rgb(o.color !== undefined ? o.color : 0x2a6a72);
  const oct = (rr) => { const p = []; for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * TAU; p.push([Math.cos(a) * rr, Math.sin(a) * rr]); } return p; };
  extrude(L, oct(1.3), 'y', 0, 0.12, { side: 'p_rubber', cap0: null, cap1: null });
  extrude(L, oct(1.35), 'y', 0.12, 1.0, { side: 'p_paint', cap0: null, cap1: null }, { tint: t, collide: true });
  extrude(L, oct(1.52), 'y', 1.0, 1.08, { side: 'marble', cap0: 'marble', cap1: 'marble' }, { collide: true });
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * TAU, b = (i + 1.5) / 8 * TAU; const rr = 1.352; quadTo(L, [Math.cos(a) * rr, 0.62, Math.sin(a) * rr], [Math.cos(b) * rr, 0.62, Math.sin(b) * rr], [Math.cos(b) * rr, 0.72, Math.sin(b) * rr], [Math.cos(a) * rr, 0.72, Math.sin(a) * rr], 'p_flat', V3(Math.cos(a + PI / 8), 0, Math.sin(a + PI / 8)), { tint: [0.9, 0.75, 0.3] }); }
  rod(L, [0, 1.08, 0], [0, 2.7, 0], 0.18, 6, 'p_chrome');
  const sm = signMat(L, { text: o.text || 'INFORMATION', bg: 'rgb(20,40,90)', fg: 'rgb(255,240,200)', w: 64, h: 16, border: 'rgb(220,190,90)' }, { unlit: true });
  box(L, -0.75, 2.7, -0.75, 0.75, 3.2, 0.75, 'p_paint', { tint: [0.15, 0.2, 0.35] });
  for (const [d, x, z] of [['pz', 0, 0.752], ['nz', 0, -0.752], ['px', 0.752, 0], ['nx', -0.752, 0]]) panel(L, sm, [0, 0, 1, 1], x, 2.95, z, 1.4, 0.4, d);
  box(L, 0.6, 1.08, -0.2, 0.9, 1.4, 0.15, 'p_plastic', { tint: [0.9, 0.88, 0.82] });
  panel(L, 'p_decal', R('map'), 0.75, 1.24, 0.152, 0.26, 0.3, 'pz');
  return { topY: wp(L, 0, 1.08, 0)[1], counterRadius: 1.5 };
});

/** Round clothing rack with hanging garments. */
export const clothing_rack = defProp('clothing_rack', (L, o, r) => {
  vcyl(L, 0, 0, 0, 0.28, 0.04, 6, 'p_chrome');
  rod(L, [0, 0.04, 0], [0, 1.32, 0], 0.02, 4, 'p_chrome');
  const ring = ringPts(V3(0, 1.32, 0), V3(1, 0, 0), V3(0, 0, 1), 0.55, 8);
  for (let i = 0; i < 8; i++) beam(L, ring[i], ring[(i + 1) % 8], 0.025, 0.025, 'p_chrome', { ends: false });
  for (let i = 0; i < 4; i++) beam(L, [0, 1.3, 0], ring[i * 2], 0.02, 0.02, 'p_chrome', { ends: false });
  for (let i = 0; i < 8; i++) {
    const a0 = i / 8 * TAU + 0.2, a1 = a0 + TAU / 8 - 0.05;
    const p0 = [Math.cos(a0) * 0.6, 1.32, Math.sin(a0) * 0.6], p1 = [Math.cos(a1) * 0.6, 1.32, Math.sin(a1) * 0.6];
    const sh = C('shirts'); const k = (r() * 4) | 0; const cr = subR(sh, k / 4, 0, (k + 1) / 4, 1);
    quadUV(L, [p0[0] * 1.05, 0.55, p0[2] * 1.05], [p1[0] * 1.05, 0.55, p1[2] * 1.05], p1, p0, 'p_cards', cr, { tint: mix([1, 1, 1], rgb(pick(r, PALETTE.cloth)), 0.5) });
  }
  solid(L, -0.5, 0, -0.5, 0.5, 1.35, 0.5, 'cloth', { bullet: false });
  return {};
});

/** Fibreglass mannequin on a stand. opts: color (outfit), headless */
export const mannequin = defProp('mannequin', (L, o, r) => {
  const skin = [0.92, 0.9, 0.86], cloth = rgb(o.color !== undefined ? o.color : pick(r, PALETTE.cloth));
  vcyl(L, 0, 0, 0, 0.25, 0.03, 6, 'p_chrome');
  rod(L, [0, 0.03, 0], [0, 0.55, 0], 0.015, 4, 'p_chrome');
  for (const s of [-1, 1]) rod(L, [s * 0.09, 0.08, 0.02], [s * 0.1, 0.92, 0], 0.06, 5, 'p_fiberglass', { r2: 0.075, tint: skin });
  loft(L, [[-0.17, 0.88, -0.1], [0.17, 0.88, -0.1], [0.17, 0.88, 0.1], [-0.17, 0.88, 0.1]], [[-0.13, 1.08, -0.08], [0.13, 1.08, -0.08], [0.13, 1.08, 0.09], [-0.13, 1.08, 0.09]], 'p_fabric', { tint: mul(cloth, 0.7), capA: 'p_fabric' });
  loft(L, [[-0.13, 1.08, -0.08], [0.13, 1.08, -0.08], [0.13, 1.08, 0.09], [-0.13, 1.08, 0.09]], [[-0.21, 1.42, -0.1], [0.21, 1.42, -0.1], [0.21, 1.42, 0.1], [-0.21, 1.42, 0.1]], 'p_fabric', { tint: cloth, capB: 'p_fabric' });
  rod(L, [0, 1.42, 0], [0, 1.52, 0], 0.045, 5, 'p_fiberglass', { tint: skin });
  if (!o.headless) blob(L, 0, 1.63, 0, 0.09, 0.12, 0.1, 5, 'p_fiberglass', { rng: r, tint: skin, jitter: 0.03 });
  const pose = range(r, -0.2, 0.2);
  for (const s of [-1, 1]) { rod(L, [s * 0.22, 1.38, 0], [s * 0.3, 1.1, 0.05 + pose * s], 0.04, 4, 'p_fabric', { tint: cloth }); rod(L, [s * 0.3, 1.1, 0.05 + pose * s], [s * 0.27, 0.84, 0.12], 0.032, 4, 'p_fiberglass', { tint: skin, capB: 'p_fiberglass' }); }
  solid(L, -0.22, 0, -0.18, 0.22, 1.7, 0.18, 'plastic', { bullet: false });
  return {};
});

/** Glass-topped display counter. Returns {topY}. */
export const display_case = defProp('display_case', (L, o, r) => {
  const w = o.length || 1.5, d = 0.6, h0 = 0.62, h1 = 0.98;
  const mat = o.material || 'woodLight';
  box(L, -w / 2, 0.08, -d / 2, w / 2, h0, d / 2, mat, { faces: { ny: false } });
  box(L, -w / 2 + 0.03, 0, -d / 2 + 0.03, w / 2 - 0.03, 0.08, d / 2 - 0.03, 'p_rubber', { faces: { ny: false } });
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) box(L, x - 0.015, h0, z - 0.015, x + 0.015, h1, z + 0.015, 'p_chrome', { faces: { ny: false } });
  for (const [a, b, c, dd] of [
    [[-w / 2, h0, d / 2], [w / 2, h0, d / 2], [w / 2, h1, d / 2], [-w / 2, h1, d / 2]],
    [[w / 2, h0, -d / 2], [-w / 2, h0, -d / 2], [-w / 2, h1, -d / 2], [w / 2, h1, -d / 2]],
    [[w / 2, h0, d / 2], [w / 2, h0, -d / 2], [w / 2, h1, -d / 2], [w / 2, h1, d / 2]],
    [[-w / 2, h0, -d / 2], [-w / 2, h0, d / 2], [-w / 2, h1, d / 2], [-w / 2, h1, -d / 2]],
    [[-w / 2, h1, d / 2], [w / 2, h1, d / 2], [w / 2, h1, -d / 2], [-w / 2, h1, -d / 2]],
  ]) quad(L, a, b, c, dd, 'p_glassClear');
  box(L, -w / 2, h1, -d / 2, w / 2, h1 + 0.015, -d / 2 + 0.03, 'p_chrome');
  quad(L, [-w / 2 + 0.02, h0 + 0.001, d / 2 - 0.02], [w / 2 - 0.02, h0 + 0.001, d / 2 - 0.02], [w / 2 - 0.02, h0 + 0.001, -d / 2 + 0.02], [-w / 2 + 0.02, h0 + 0.001, -d / 2 + 0.02], 'p_fabric', { tint: [0.25, 0.1, 0.12] });
  for (let i = 0; i < 5; i++) { const x = -w / 2 + 0.2 + i * (w - 0.4) / 4; cbox(L, x, h0, range(r, -0.15, 0.1), 0.12, range(r, 0.04, 0.12), 0.1, pick(r, ['p_brass', 'p_chrome', 'p_plastic']), { faces: { ny: false } }); }
  solid(L, -w / 2, 0, -d / 2, w / 2, h0 - 0.02, d / 2, 'wood');
  solid(L, -w / 2, h0 - 0.02, -d / 2, w / 2, h1, d / 2, 'glass', { bullet: false });
  return { topY: wp(L, 0, h1 + 0.015, 0)[1] };
});

/** Checkout counter with cash register. Returns {topY}. */
export const checkout_counter = defProp('checkout_counter', (L, o) => {
  const t = rgb(o.color !== undefined ? o.color : 0xd8d4c8);
  const w = 1.8, d = 0.7, h = 0.95;
  box(L, -w / 2, 0.1, -d / 2, w / 2, h - 0.04, d / 2, 'p_paint', { tint: t, faces: { ny: false } });
  box(L, -w / 2 + 0.03, 0, -d / 2 + 0.03, w / 2 - 0.03, 0.1, d / 2 - 0.03, 'p_rubber', { faces: { ny: false } });
  box(L, -w / 2 - 0.02, h - 0.04, -d / 2 - 0.02, w / 2 + 0.02, h, d / 2 + 0.02, 'steel');
  panel(L, 'p_flat', null, 0, 0.6, d / 2 + 0.002, w, 0.1, 'pz', { tint: [0.75, 0.15, 0.12] });
  // register
  box(L, 0.2, h, -0.25, 0.65, h + 0.12, 0.15, 'p_plastic', { tint: [0.35, 0.35, 0.37] });
  pushR(L, [0.425, h + 0.12, 0.0], -0.5, 0, 0); box(L, -0.2, 0, -0.12, 0.2, 0.03, 0.12, 'p_plastic', { tint: [0.3, 0.3, 0.32] }); panel(L, 'p_decal', R('register'), 0, 0.032, 0, 0.3, 0.2, 'py'); L.pop();
  box(L, 0.3, h + 0.12, -0.25, 0.55, h + 0.3, -0.2, 'p_plastic', { tint: [0.3, 0.3, 0.32] });
  panel(L, 'p_decalLit', R('screenGreen'), 0.425, h + 0.24, -0.198, 0.22, 0.1, 'pz');
  rod(L, [-0.5, h, -0.1], [-0.5, h + 0.25, -0.1], 0.015, 4, 'metalDark');
  box(L, -0.58, h + 0.25, -0.15, -0.42, h + 0.32, -0.05, 'p_plastic', { tint: [0.2, 0.2, 0.22] });
  solid(L, -w / 2, 0, -d / 2, w / 2, h, d / 2, 'metal');
  return { topY: wp(L, 0, h, 0)[1], register: wp(L, 0.42, h + 0.15, 0) };
});

function gondola(L, o, r, goods, double = true) {
  const len = o.length || 2.4, h = o.height || 1.7, d = double ? 0.5 : 0.45;
  const t = rgb(o.color !== undefined ? o.color : 0xe0dcd0);
  const z0 = double ? -d : 0;
  box(L, -len / 2, 0, z0, len / 2, 0.12, d, 'p_paint', { tint: mul(t, 0.6), faces: { ny: false } });
  box(L, -len / 2, 0.12, -0.03 + (double ? 0 : 0.03), len / 2, h, 0.03 + (double ? 0 : 0.03), 'p_pegboard', { tint: t });
  for (const s of [-1, 1]) box(L, s * len / 2 - (s > 0 ? 0.03 : 0), 0, z0, s * len / 2 + (s < 0 ? 0.03 : 0), h, d, 'p_paint', { tint: t, faces: { ny: false } });
  const sides = double ? [-1, 1] : [1];
  for (const s of sides) {
    for (const y of [0.12, 0.55, 0.98, 1.4]) {
      const zi = s > 0 ? 0.06 : -0.06, zo = s * (d - 0.02);
      if (y > 0.2) box(L, -len / 2 + 0.03, y - 0.03, Math.min(zi, zo), len / 2 - 0.03, y, Math.max(zi, zo), 'p_paint', { tint: t, faces: { ny: false, px: false, nx: false, [s > 0 ? 'nz' : 'pz']: false } });
      const full = !o.empty || r() < 0.18;
      if (!full) continue;
      const gh = Math.min(0.36, (o.empty ? range(r, 0.1, 0.25) : 0.36));
      const gx0 = o.empty ? range(r, -len / 2 + 0.1, len / 2 - 0.6) : -len / 2 + 0.05, gx1 = o.empty ? gx0 + range(r, 0.2, 0.5) : len / 2 - 0.05;
      const zf = s * (d - 0.06);
      const rect = R(goods);
      const fr = o.empty ? subR(rect, 0, 0, (gx1 - gx0) / len, 0.5) : subR(rect, r() < 0.5 ? 0 : 0, r() < 0.5 ? 0 : 0.5, 1, r() < 0.5 ? 0.5 : 1);
      quadUV(L, s > 0 ? [gx0, y, zf] : [gx1, y, zf], s > 0 ? [gx1, y, zf] : [gx0, y, zf], s > 0 ? [gx1, y + gh, zf] : [gx0, y + gh, zf], s > 0 ? [gx0, y + gh, zf] : [gx1, y + gh, zf], 'p_decal', fr);
      quad(L, [gx0, y + gh, s > 0 ? zf : zi], [gx1, y + gh, s > 0 ? zf : zi], [gx1, y + gh, s > 0 ? zi : zf], [gx0, y + gh, s > 0 ? zi : zf], 'p_cardboard', { tint: [0.7, 0.65, 0.6] });
    }
  }
  if (o.sign !== false && double) { box(L, -0.5, h, -0.02, 0.5, h + 0.25, 0.02, 'p_paint', { tint: [0.75, 0.15, 0.12] }); }
  solid(L, -len / 2, 0, double ? -0.36 : 0, len / 2, h, double ? 0.36 : 0.3, 'metal');
  return { topY: wp(L, 0, h, 0)[1] };
}
/** Double-sided gondola shelving unit. opts: length (2.4), empty, color */
export const store_shelf = defProp('store_shelf', (L, o, r) => gondola(L, o, r, r() < 0.5 ? 'products' : 'productsB', true));
/** Single-sided toy shelving with a plush bin. */
export const toy_shelf = defProp('toy_shelf', (L, o, r) => {
  const res = gondola(L, { ...o, length: o.length || 2.0, height: o.height || 1.6, color: o.color !== undefined ? o.color : 0xf0e8a0 }, r, 'toys', false);
  box(L, -0.5, 0, 0.55, 0.5, 0.45, 1.1, 'p_paint', { tint: [0.85, 0.2, 0.2], faces: { ny: false, py: false } });
  for (let i = 0; i < 5; i++) blob(L, range(r, -0.35, 0.35), 0.45, range(r, 0.65, 1.0), 0.14, 0.12, 0.14, 5, 'p_fabric', { rng: r, tint: rgb(pick(r, [0xe8c040, 0x8a5a3a, 0xe880b0, 0x60a0e0, 0xf0f0e8])) });
  solid(L, -0.5, 0, 0.55, 0.5, 0.45, 1.1, 'plastic');
  return res;
});

export const mall_bench = defProp('mall_bench', (L, o) => {
  const l = o.length || 1.8;
  box(L, -l / 2, 0.4, -0.25, l / 2, 0.46, 0.25, 'woodFloor', { tint: [1.15, 1.0, 0.8] });
  for (const s of [-1, 1]) {
    const x = s * (l / 2 - 0.2);
    box(L, x - 0.04, 0, -0.22, x + 0.04, 0.4, -0.16, 'p_chrome', { faces: { ny: false, py: false } });
    box(L, x - 0.04, 0, 0.16, x + 0.04, 0.4, 0.22, 'p_chrome', { faces: { ny: false, py: false } });
    box(L, x - 0.04, 0, -0.22, x + 0.04, 0.04, 0.22, 'p_chrome', { faces: { ny: false } });
  }
  solid(L, -l / 2, 0, -0.25, l / 2, 0.46, 0.25, 'wood');
  return { seatY: wp(L, 0, 0.46, 0)[1] };
});

/** Large mall planter. opts: width (2.4), depth, height (0.7), material, plant 'palm'|'bush'|'none' */
export const mall_planter = defProp('mall_planter', (L, o, r) => {
  const w = o.width || 2.4, d = o.depth || w, h = o.height || 0.7, mat = o.material || 'tileMall';
  box(L, -w / 2, 0, -d / 2, w / 2, h, d / 2, mat, { faces: { py: false, ny: false } });
  const t = 0.12;
  for (const [x0, z0, x1, z1] of [[-w / 2 - 0.03, -d / 2 - 0.03, w / 2 + 0.03, -d / 2 + t], [-w / 2 - 0.03, d / 2 - t, w / 2 + 0.03, d / 2 + 0.03], [-w / 2 - 0.03, -d / 2 + t, -w / 2 + t, d / 2 - t], [w / 2 - t, -d / 2 + t, w / 2 + 0.03, d / 2 - t]]) box(L, x0, h, z0, x1, h + 0.06, z1, 'marble', { faces: { ny: false } });
  box(L, -w / 2 + t, h - 0.12, -d / 2 + t, w / 2 - t, h - 0.1, d / 2 - t, 'dirt', { faces: { ny: false, px: false, nx: false, pz: false, nz: false } });
  for (const [x0, z0, x1, z1] of [[-w / 2 + t, -d / 2 + t, w / 2 - t, -d / 2 + t], [w / 2 - t, d / 2 - t, -w / 2 + t, d / 2 - t]]) { /* inner rims hidden by dirt */ }
  const plant = o.plant || 'palm';
  if (plant === 'palm') palm_tree(L, range(r, -0.2, 0.2), h - 0.1, range(r, -0.2, 0.2), 0, { height: 3.2, collide: false, seed: 7 });
  if (plant !== 'none') for (let i = 0; i < 3; i++) blob(L, range(r, -w / 3, w / 3), h + 0.15, range(r, -d / 3, d / 3), range(r, 0.35, 0.55), range(r, 0.25, 0.4), range(r, 0.35, 0.55), 5, 'p_leaf', { rng: r, tint: mix([0.85, 1, 0.8], [0.7, 0.8, 0.55], r()) });
  solid(L, -w / 2, 0, -d / 2, w / 2, h + 0.06, d / 2, 'tile');
  return { topY: wp(L, 0, h + 0.06, 0)[1] };
});

/** Food court restaurant counter with menu boards. opts: name (invented), width (4), color */
export const food_court_counter = defProp('food_court_counter', (L, o) => {
  const W = o.width || 4.0, hw = W / 2, name = o.name || 'BURGER BARN';
  const t = rgb(o.color !== undefined ? o.color : 0xc8401e);
  // side partitions and back wall
  for (const s of [-1, 1]) box(L, s * hw - 0.1, 0, -2.0, s * hw + 0.1, 3.4, 0.7, 'plaster', { tint: [0.92, 0.9, 0.85] });
  box(L, -hw + 0.1, 0, -2.1, hw - 0.1, 3.4, -2.0, 'tileWhite');
  // counter
  box(L, -hw + 0.1, 0.1, 0.25, hw - 0.1, 1.0, 0.55, 'p_paint', { tint: t, faces: { ny: false } });
  box(L, -hw + 0.1, 0, 0.3, hw - 0.1, 0.1, 0.5, 'p_rubber', { faces: { ny: false } });
  box(L, -hw + 0.1, 1.0, 0.15, hw - 0.1, 1.05, 0.62, 'steel');
  for (const yy of [0.82, 0.92]) rod(L, [-hw + 0.15, yy, 0.68], [hw - 0.15, yy, 0.68], 0.018, 4, 'p_chrome', { up: [0, 1, 0] });
  // equipment along the back
  box(L, -hw + 0.3, 0, -1.95, -hw + 1.2, 0.95, -1.3, 'steel', { faces: { ny: false } });
  panel(L, 'p_decal', R('vent'), -hw + 0.75, 0.5, -1.298, 0.7, 0.5, 'pz');
  box(L, -0.4, 0.9, -1.95, 0.4, 1.6, -1.55, 'p_paint', { tint: [0.2, 0.2, 0.22] });
  box(L, -0.5, 0, -1.95, 0.5, 0.9, -1.4, 'steel', { faces: { ny: false } });
  for (let i = 0; i < 4; i++) box(L, -0.3 + i * 0.2 - 0.03, 1.05, -1.55, -0.3 + i * 0.2 + 0.03, 1.15, -1.5, 'p_chrome');
  box(L, hw - 1.4, 0, -1.95, hw - 0.3, 0.95, -1.35, 'steel', { faces: { ny: false } });
  box(L, hw - 1.35, 0.95, -1.9, hw - 0.35, 0.97, -1.4, 'metalDark');
  // header + menu boards
  box(L, -hw - 0.1, 2.6, 0.55, hw + 0.1, 3.4, 0.75, 'p_paint', { tint: mul(t, 0.6) });
  const sm = signMat(L, { text: name, bg: css(mul(t, 0.9)), fg: 'rgb(255,240,190)', w: 96, h: 16, border: 'rgb(255,220,120)' }, { unlit: true });
  panel(L, sm, [0, 0, 1, 1], 0, 3.0, 0.752, W - 0.3, 0.6, 'pz');
  for (let i = 0; i < 3; i++) panel(L, 'p_decalLit', R('menu'), -hw + W * (i + 0.5) / 3, 2.2, -1.995, W / 3 - 0.2, 0.75, 'pz');
  solid(L, -hw + 0.1, 0, 0.15, hw - 0.1, 1.05, 0.62, 'metal');
  for (const s of [-1, 1]) solid(L, s * hw - 0.1, 0, -2.0, s * hw + 0.1, 3.4, 0.7, 'concrete');
  solid(L, -hw, 0, -2.0, hw, 0.9, -1.36, 'metal');
  return { topY: wp(L, 0, 1.05, 0)[1], service: wp(L, 0, 0, -0.6) };
});

/** Food court table with four fixed swivel stools. */
export const food_court_table = defProp('food_court_table', (L, o, r) => {
  const t = rgb(o.color !== undefined ? o.color : 0xe8b030);
  box(L, -0.4, 0.72, -0.4, 0.4, 0.76, 0.4, 'p_plastic', { tint: [0.95, 0.93, 0.88] });
  rod(L, [0, 0.04, 0], [0, 0.72, 0], 0.05, 5, 'metalDark');
  for (let i = 0; i < 4; i++) {
    const a = i * HP + PI / 4, x = Math.cos(a) * 0.72, z = Math.sin(a) * 0.72;
    beam(L, [0, 0.05, 0], [x, 0.05, z], 0.06, 0.04, 'metalDark', { ends: false, faces: { ny: false } });
    rod(L, [x, 0.05, z], [x, 0.44, z], 0.03, 4, 'metalDark');
    rod(L, [x, 0.44, z], [x, 0.48, z], 0.19, 6, 'p_plastic', { tint: t, capB: 'p_plastic' });
  }
  solid(L, -0.4, 0, -0.4, 0.4, 0.76, 0.4, 'plastic');
  return { topY: wp(L, 0, 0.76, 0)[1] };
});

/**
 * Escalator ascending from the origin toward local -Z. Visual steps + walkable collision ramp.
 * opts: rise (4.5), run (rise * 1.73), width (step width 1.0). Returns {bottom, top} (world positions in front of each landing).
 */
export const escalator = defProp('escalator', (L, o) => {
  const rise = o.rise || 4.5, run = o.run || rise * 1.732, w = o.width || 1.0, hw = w / 2;
  const n = Math.max(2, Math.ceil(rise / 0.2)), sh = rise / n, sd = run / n;
  const land = 1.3;
  // steps
  for (let i = 0; i < n; i++) {
    const y0 = i * sh, y1 = (i + 1) * sh, z0 = -i * sd, z1 = -(i + 1) * sd;
    quad(L, [-hw, y1, z0], [hw, y1, z0], [hw, y1, z1], [-hw, y1, z1], 'p_tread');
    quad(L, [-hw, y0, z0], [hw, y0, z0], [hw, y1, z0], [-hw, y1, z0], 'p_paint', { tint: [0.3, 0.3, 0.32] });
    panel(L, 'p_flat', null, 0, y1 + 0.002, z0 - 0.025, w, 0.05, 'py', { tint: [0.9, 0.75, 0.1] });
  }
  // landings (comb plates)
  quad(L, [-hw, 0.006, land], [hw, 0.006, land], [hw, 0.006, 0], [-hw, 0.006, 0], 'metalDiamond');
  quad(L, [-hw, rise + 0.006, -run], [hw, rise + 0.006, -run], [hw, rise + 0.006, -run - land], [-hw, rise + 0.006, -run - land], 'metalDiamond');
  // truss side decks (solid, collide)
  const zt = -0.9 * run / rise;
  const prof = [[land, 0], [land, 0.15], [0, 0.15], [-run, rise + 0.15], [-run - land, rise + 0.15], [-run - land, rise - 0.9], [-run, rise - 0.9], [zt, 0]];
  for (const s of [-1, 1]) extrude(L, prof, 'x', s * (hw + 0.02), s * (hw + 0.2), { side: 'steel', cap0: 'steel', cap1: 'steel', edges: [undefined, undefined, undefined, undefined, undefined, undefined, undefined, null] }, { collide: true });
  // soffit + top end plate
  quadTo(L, [-hw - 0.2, rise - 0.9, -run], [hw + 0.2, rise - 0.9, -run], [hw + 0.2, 0, zt], [-hw - 0.2, 0, zt], 'steel', V3(0, -1, 0.5), { collide: true });
  quadTo(L, [-hw - 0.2, rise - 0.9, -run - land], [hw + 0.2, rise - 0.9, -run - land], [hw + 0.2, rise - 0.9, -run], [-hw - 0.2, rise - 0.9, -run], 'steel', V3(0, -1, 0));
  quadTo(L, [-hw - 0.2, rise - 0.9, -run - land], [hw + 0.2, rise - 0.9, -run - land], [hw + 0.2, rise + 0.006, -run - land], [-hw - 0.2, rise + 0.006, -run - land], 'steel', V3(0, 0, -1));
  // glass balustrades + handrails
  const gb = [[land - 0.4, 0.15], [0, 0.15], [-run, rise + 0.15], [-run - land + 0.4, rise + 0.15], [-run - land + 0.4, rise + 1.0], [-run, rise + 1.0], [0, 1.0], [land - 0.4, 1.0]];
  for (const s of [-1, 1]) {
    extrude(L, gb, 'x', s * (hw + 0.11), s * (hw + 0.11), { side: null, cap0: null, cap1: 'p_glass' });
    const x = s * (hw + 0.11);
    const rail = [[x, 1.0, land - 0.4], [x, 1.0, 0], [x, rise + 1.0, -run], [x, rise + 1.0, -run - land + 0.4]];
    for (let i = 0; i < 3; i++) beam(L, rail[i], rail[i + 1], 0.09, 0.07, 'p_rubber', { ends: i !== 1 });
    for (const [zz, yy] of [[land - 0.4, 0], [-run - land + 0.4, rise]]) rod(L, [x, yy + 0.15, zz], [x, yy + 1.0, zz], 0.035, 4, 'p_rubber');
  }
  // collision: walkable ramp, side walls, top landing floor
  clipQuad(L, [-hw, 0, 0], [-hw, rise, -run], [hw, rise, -run], [hw, 0, 0], 'metal');
  for (const s of [-1, 1]) clipQuad(L, [s * (hw + 0.1), 0, land], [s * (hw + 0.1), 0, 0], [s * (hw + 0.1), rise, -run], [s * (hw + 0.1), rise, -run - land], 'glass', { bullet: false });
  for (const s of [-1, 1]) clipQuad(L, [s * (hw + 0.1), rise, -run - land], [s * (hw + 0.1), rise, -run], [s * (hw + 0.1), rise + 1.1, -run], [s * (hw + 0.1), rise + 1.1, -run - land], 'glass', { bullet: false });
  for (const s of [-1, 1]) clipQuad(L, [s * (hw + 0.1), 0, 0], [s * (hw + 0.1), rise, -run], [s * (hw + 0.1), rise + 1.1, -run], [s * (hw + 0.1), 1.1, 0], 'glass', { bullet: false });
  clipQuad(L, [-hw - 0.2, rise, -run], [-hw - 0.2, rise, -run - land], [hw + 0.2, rise, -run - land], [hw + 0.2, rise, -run], 'metal');
  return { bottom: wp(L, 0, 0, land + 0.6), top: wp(L, 0, rise, -run - land - 0.6), rise, run };
});

/** Roll-down security grille. opts: width (4), height (3), open (0 closed .. 1 fully raised) */
export const security_gate = defProp('security_gate', (L, o) => {
  const w = o.width || 4, h = o.height || 3, f = Math.max(0, Math.min(1, o.open || 0));
  const yb = h * f;
  box(L, -w / 2 - 0.1, h, -0.05, w / 2 + 0.1, h + 0.35, 0.3, 'metal', { tint: [0.75, 0.75, 0.75] });
  for (const s of [-1, 1]) box(L, s * w / 2 - 0.05, 0, 0.05, s * w / 2 + 0.05, h, 0.2, 'metalDark');
  if (f < 0.98) {
    quadUV(L, [-w / 2, yb, 0.12], [w / 2, yb, 0.12], [w / 2, h, 0.12], [-w / 2, h, 0.12], 'p_grille', [0, 0, w / 0.5, (h - yb) / 0.5], { collide: true });
    box(L, -w / 2, yb, 0.08, w / 2, yb + 0.08, 0.16, 'metal', { faces: { px: false, nx: false } });
  }
  return { bottomY: wp(L, 0, yb, 0)[1] };
});

/** Freestanding ATM. */
export const atm = defProp('atm', (L, o) => {
  const t = rgb(o.color !== undefined ? o.color : 0x3a4a5a);
  box(L, -0.42, 0, -0.35, 0.42, 1.7, 0.35, 'p_paint', { tint: t, faces: { ny: false } });
  box(L, -0.36, 0.9, 0.3, 0.36, 1.45, 0.36, 'p_paint', { tint: [0.15, 0.15, 0.17] });
  pushR(L, [0, 1.18, 0.34], 0.25, 0, 0); panel(L, 'p_decalLit', R('screen'), 0, 0, 0.005, 0.3, 0.24, 'pz'); L.pop();
  pushR(L, [0, 0.98, 0.36], 0, 0, 0); box(L, -0.3, 0, 0, 0.3, 0.03, 0.18, 'p_paint', { tint: [0.6, 0.62, 0.65] }); panel(L, 'p_decal', R('keypad'), -0.08, 0.032, 0.09, 0.16, 0.14, 'py'); L.pop();
  box(L, 0.15, 1.02, 0.36, 0.28, 1.05, 0.4, 'black');
  panel(L, 'black', null, 0, 0.86, 0.352, 0.3, 0.04, 'pz');
  panel(L, 'p_decalLit', R('atm'), 0, 1.58, 0.352, 0.7, 0.18, 'pz');
  solid(L, -0.42, 0, -0.35, 0.42, 1.7, 0.36, 'metal');
  return {};
});

/** Mall directory pylon (lit maps both sides). opts: text (header) */
export const mall_directory = defProp('mall_directory', (L, o) => {
  box(L, -0.55, 0, -0.18, 0.55, 0.15, 0.18, 'marbleDark');
  box(L, -0.5, 0.15, -0.14, 0.5, 2.3, 0.14, 'p_paint', { tint: [0.2, 0.22, 0.28] });
  for (const s of [-1, 1]) panel(L, 'p_decalLit', R('map'), 0, 1.15, s * 0.142, 0.84, 1.3, s > 0 ? 'pz' : 'nz');
  const sm = signMat(L, { text: o.text || 'DIRECTORY', bg: 'rgb(150,30,40)', fg: 'rgb(255,240,220)', w: 64, h: 16 }, { unlit: true });
  for (const s of [-1, 1]) panel(L, sm, [0, 0, 1, 1], 0, 2.05, s * 0.142, 0.9, 0.3, s > 0 ? 'pz' : 'nz');
  solid(L, -0.5, 0, -0.16, 0.5, 2.3, 0.16, 'metal');
  return {};
});

/**
 * Shop front facade on the z = 0 plane facing +Z: pilasters, header sign, display windows and door opening.
 * opts: name (invented), width (6), height (4.5), color, door (opening width 2.4), shutter (0..1 closed fraction)
 * Returns { door: {center, width, height}, glass: [{corners:[4 world pts], width, height}] } for breakable glass.
 */
export const store_front = defProp('store_front', (L, o) => {
  const W = o.width || 6, H = o.height || 4.5, hw = W / 2, dw = o.door || 2.4, dh = 3.0;
  const t = rgb(o.color !== undefined ? o.color : 0x8a2a5a);
  const name = o.name || 'FASHION OUTLET';
  for (const s of [-1, 1]) box(L, s * hw - (s > 0 ? 0.35 : 0), 0, -0.15, s * hw + (s < 0 ? 0.35 : 0), H, 0.12, 'tileMall', { tint: [0.95, 0.92, 0.85] });
  box(L, -hw + 0.35, dh, -0.15, hw - 0.35, H, 0.08, 'plaster', { tint: [0.92, 0.9, 0.86] });
  box(L, -hw + 0.35, dh + 0.1, 0.08, hw - 0.35, dh + 0.18, 0.14, 'p_flat', { tint: t });
  const sm = signMat(L, { text: name, bg: css(t), fg: 'rgb(255,250,235)', w: 96, h: 16, border: 'rgb(255,255,255)' }, { unlit: true });
  box(L, -Math.min(2.4, hw - 0.6), dh + 0.45, 0.08, Math.min(2.4, hw - 0.6), H - 0.25, 0.22, 'p_paint', { tint: mul(t, 0.5) });
  panel(L, sm, [0, 0, 1, 1], 0, (dh + 0.45 + H - 0.25) / 2, 0.222, Math.min(4.8, W - 1.2) - 0.1, H - 0.25 - dh - 0.45 - 0.1, 'pz');
  const glass = [];
  const wx0 = dw / 2, wx1 = hw - 0.35;
  for (const s of [-1, 1]) {
    if (wx1 - wx0 < 0.3) continue;
    const xa = s * wx0, xb = s * wx1, xl = Math.min(xa, xb), xr = Math.max(xa, xb);
    box(L, xl, 0, -0.1, xr, 0.45, 0.06, 'marbleDark');
    box(L, xl, 0.45, -0.06, xr, 0.5, 0.04, 'p_chrome');
    box(L, xl, dh - 0.05, -0.06, xr, dh, 0.04, 'p_chrome');
    for (const x of [xa, xb]) box(L, x - 0.04, 0.45, -0.06, x + 0.04, dh, 0.04, 'p_chrome');
    quad(L, [xl, 0.5, -0.01], [xr, 0.5, -0.01], [xr, dh - 0.05, -0.01], [xl, dh - 0.05, -0.01], 'p_glass');
    glass.push({ corners: [wp(L, xl, 0.5, -0.01), wp(L, xr, 0.5, -0.01), wp(L, xr, dh - 0.05, -0.01), wp(L, xl, dh - 0.05, -0.01)], width: xr - xl, height: dh - 0.55 });
    solid(L, xl, 0, -0.1, xr, 0.45, 0.06, 'concrete');
  }
  box(L, -dw / 2, dh - 0.08, -0.08, dw / 2, dh, 0.06, 'p_chrome');
  const s0 = Math.max(0, Math.min(1, o.shutter || 0));
  if (s0 > 0) {
    const yb = dh * (1 - s0);
    quadUV(L, [-dw / 2, yb, 0.03], [dw / 2, yb, 0.03], [dw / 2, dh, 0.03], [-dw / 2, dh, 0.03], 'p_grille', [0, 0, dw / 0.5, (dh - yb) / 0.5], { collide: true });
    box(L, -dw / 2, yb, 0.0, dw / 2, yb + 0.07, 0.07, 'metal', { faces: { px: false, nx: false } });
  }
  for (const s of [-1, 1]) solid(L, s * hw - (s > 0 ? 0.35 : 0), 0, -0.15, s * hw + (s < 0 ? 0.35 : 0), H, 0.12, 'concrete');
  solid(L, -hw, dh, -0.15, hw, H, 0.12, 'concrete');
  return { door: { center: wp(L, 0, 0, 0), width: dw, height: dh }, glass };
});

/** Scissor lift with raised platform. opts: height (platform, 2.4), color */
export const scissor_lift = defProp('scissor_lift', (L, o) => {
  const ph = o.height || 2.4, t = rgb(o.color !== undefined ? o.color : 0xd86a1a);
  box(L, -0.6, 0.15, -1.2, 0.6, 0.6, 1.2, 'p_paint', { tint: t });
  for (const s of [-1, 1]) panel(L, 'p_decal', R('hazard'), s * 0.602, 0.2, 0, 2.3, 0.08, s > 0 ? 'px' : 'nx');
  for (const [x, z] of [[-0.6, -0.85], [0.6, -0.85], [-0.6, 0.85], [0.6, 0.85]]) wheel(L, x * 0.92, 0.17, z, 0.17, 0.14, 'wheelSteel', 6);
  const stages = Math.max(1, Math.round((ph - 0.7) / 0.6)), sh = (ph - 0.7) / stages;
  for (const s of [-1, 1]) for (let k = 0; k < stages; k++) {
    const y0 = 0.6 + k * sh, y1 = y0 + sh;
    beam(L, [s * 0.45, y0, -0.95], [s * 0.45, y1, 0.95], 0.05, 0.06, 'p_paint', { tint: mul(t, 0.85), ends: false });
    beam(L, [s * 0.5, y0, 0.95], [s * 0.5, y1, -0.95], 0.05, 0.06, 'p_paint', { tint: mul(t, 0.85), ends: false });
  }
  box(L, -0.65, ph - 0.1, -1.3, 0.65, ph, 1.3, 'metalDiamond');
  const top = ph + 1.05;
  for (const [x, z] of [[-0.62, -1.27], [0.62, -1.27], [-0.62, 1.27], [0.62, 1.27]]) beam(L, [x, ph, z], [x, top, z], 0.04, 0.04, 'p_paint', { tint: t, ends: false });
  const rc = [[-0.62, top, -1.27], [0.62, top, -1.27], [0.62, top, 1.27], [-0.62, top, 1.27]];
  for (let i = 0; i < 4; i++) beam(L, rc[i], rc[(i + 1) % 4], 0.04, 0.04, 'p_paint', { tint: t, ends: false });
  for (const s of [-1, 1]) beam(L, [s * 0.62, ph + 0.5, -1.27], [s * 0.62, ph + 0.5, 1.27], 0.03, 0.03, 'p_paint', { tint: t, ends: false });
  box(L, -0.2, ph + 0.8, 1.2, 0.2, ph + 1.05, 1.32, 'p_paint', { tint: [0.2, 0.2, 0.22] });
  solid(L, -0.6, 0, -1.2, 0.6, 0.6, 1.2, 'metal');
  solid(L, -0.65, ph - 0.1, -1.3, 0.65, ph, 1.3, 'metal');
  return { platform: wp(L, 0, ph, 0), topY: wp(L, 0, ph, 0)[1] };
});

/** Road-works barrier. opts: variant 'board' (striped type-III) | 'plastic' (water-filled), width */
export const construction_barrier = defProp('construction_barrier', (L, o) => {
  const w = o.width || 2.0;
  if (o.variant === 'plastic') {
    const t = rgb(o.color !== undefined ? o.color : 0xe8641a);
    extrude(L, [[-0.25, 0], [0.25, 0], [0.22, 0.25], [0.1, 0.4], [0.1, 0.95], [-0.1, 0.95], [-0.1, 0.4], [-0.22, 0.25]], 'x', -w / 2, w / 2, { side: 'p_plastic', cap0: 'p_plastic', cap1: 'p_plastic', edges: [null] }, { tint: t });
    for (const s of [-1, 1]) panel(L, 'p_flat', null, 0, 0.75, s * 0.102, w - 0.2, 0.1, s > 0 ? 'pz' : 'nz', { tint: [0.95, 0.95, 0.92] });
    solid(L, -w / 2, 0, -0.2, w / 2, 0.92, 0.2, 'plastic');
    return {};
  }
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 0.2);
    box(L, x - 0.04, 0, -0.03, x + 0.04, 1.5, 0.03, 'p_paint', { tint: [0.9, 0.9, 0.88] });
    box(L, x - 0.06, 0, -0.35, x + 0.06, 0.06, 0.35, 'p_paint', { tint: [0.2, 0.2, 0.2] });
  }
  for (const y of [0.55, 0.9, 1.25]) {
    box(L, -w / 2, y, -0.045, w / 2, y + 0.2, -0.03, 'p_flat', { tint: [0.95, 0.95, 0.92] });
    panel(L, 'p_decal', R('stripeOW'), 0, y + 0.1, -0.028, w - 0.02, 0.19, 'pz');
    panel(L, 'p_decal', R('stripeOW'), 0, y + 0.1, -0.047, w - 0.02, 0.19, 'nz', { flipU: true });
  }
  box(L, w / 2 - 0.3, 1.5, -0.08, w / 2 - 0.1, 1.62, 0.08, 'p_emAmber');
  solid(L, -w / 2, 0, -0.1, w / 2, 1.45, 0.1, 'wood', { bullet: false });
  return {};
});

/** Hanging translucent plastic sheeting (no collision). opts: width (3), height (3) */
export const plastic_sheeting = defProp('plastic_sheeting', (L, o, r) => {
  const w = o.width || 3, h = o.height || 3;
  const n = Math.max(2, Math.round(w / 1.0));
  box(L, -w / 2 - 0.05, h - 0.06, -0.04, w / 2 + 0.05, h, 0.04, 'wood');
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + i * w / n, x1 = x0 + w / n + 0.05;
    const z0 = range(r, -0.06, 0.06), z1 = range(r, -0.08, 0.08), zb = range(r, -0.15, 0.15);
    quad(L, [x0, 0.05, zb], [x1, 0.05, zb + z1], [x1, h - 0.06, z1 * 0.3], [x0, h - 0.06, z0 * 0.3], 'p_sheet');
  }
  return {};
});

export const cement_bags = defProp('cement_bags', (L, o, r) => {
  pallet(L, 0, 0, 0, 0, { collide: false, seed: 2 });
  const y0 = 0.144;
  const layers = [[[-0.3, -0.24], [0.3, -0.24], [-0.3, 0.24], [0.3, 0.24]], [[-0.24, -0.3, 1], [0.24, -0.3, 1], [-0.24, 0.3, 1], [0.24, 0.3, 1]], [[-0.3, 0], [0.3, 0]]];
  layers.forEach((lay, k) => {
    for (const [x, z, rot] of lay) {
      pushR(L, [x + range(r, -0.03, 0.03), y0 + k * 0.13, z + range(r, -0.03, 0.03)], 0, (rot ? HP : 0) + range(r, -0.06, 0.06), 0);
      box(L, -0.28, 0, -0.22, 0.28, 0.13, 0.22, 'p_paint', { tint: [0.86, 0.82, 0.72], faces: { ny: false } });
      if (k === 0 || r() < 0.5) panel(L, 'p_decal', R('cement'), 0, 0.065, 0.222, 0.4, 0.12, 'pz');
      L.pop();
    }
  });
  solid(L, -0.6, 0, -0.5, 0.6, y0 + 0.39, 0.5, 'dirt');
  return { topY: wp(L, 0, y0 + 0.39, 0)[1] };
});

export const toolbox = defProp('toolbox', (L, o) => {
  const t = rgb(o.color !== undefined ? o.color : 0xb81e18);
  box(L, -0.25, 0, -0.11, 0.25, 0.17, 0.11, 'p_paint', { tint: t, faces: { ny: false, py: false } });
  extrude(L, [[-0.11, 0.17], [0.11, 0.17], [0.08, 0.24], [-0.08, 0.24]], 'x', -0.25, 0.25, { side: 'p_paint', cap0: 'p_paint', cap1: 'p_paint', edges: [null] }, { tint: mul(t, 0.9) });
  beam(L, [-0.15, 0.27, 0], [0.15, 0.27, 0], 0.03, 0.03, 'p_rubber', { ends: false });
  for (const s of [-1, 1]) { beam(L, [s * 0.15, 0.24, 0], [s * 0.15, 0.27, 0], 0.02, 0.02, 'p_chrome', { ends: false }); panel(L, 'p_chrome', null, s * 0.17, 0.16, 0.112, 0.04, 0.06, 'pz'); }
  return { topY: wp(L, 0, 0.31, 0)[1] };
});

/** Row of vending machines. opts: count (3), kinds (array of 'soda'|'snack') */
export const vending_row = defProp('vending_row', (L, o, r) => {
  const n = o.count || 3;
  for (let i = 0; i < n; i++) {
    const kind = (o.kinds && o.kinds[i]) || (i % 2 ? 'snack' : 'soda');
    vending_machine(L, (i - (n - 1) / 2) * 0.98, 0, 0, 0, { kind, collide: false, color: kind === 'soda' ? pick(r, [0xa81818, 0x1a4aa0, 0x1a7a3a]) : undefined, seed: i });
  }
  solid(L, -n * 0.49, 0, -0.42, n * 0.49, 1.9, 0.42, 'metal');
  return { topY: wp(L, 0, 1.9, 0)[1] };
});

export const MALL = {
  mall_kiosk, clothing_rack, mannequin, display_case, checkout_counter, store_shelf, toy_shelf, mall_bench, mall_planter,
  food_court_counter, food_court_table, escalator, security_gate, atm, mall_directory, store_front, scissor_lift,
  construction_barrier, plastic_sheeting, cement_bags, toolbox, vending_row,
};
export const MALL_MOUNT = { security_gate: 'facade', store_front: 'facade', food_court_counter: 'facade' };
