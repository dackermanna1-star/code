// The house of level 37 (Suburban Loop): a tall yellow house with a turret, a wrap-around porch
// and a red door. It stands at the end of every road. Placed with placeLoopHouse(); the details
// that differ each time (car, curtains, lights, flags) come in through opts.
import { defineTexture, defineMaterial, defineProp, S, T, G, VF, face, tface, mul, hr, owns, M, FACE, paintSiding, paintBrick, paintShingle, paintWindow, withXf } from './g04_kit.js';
import { xfMul, xfTranslate, xfRotY } from '../../core/math.js';

defineTexture('lv37_yellow', (p) => paintSiding(p, [252, 214, 72], { board: 8, groove: 0.8, hi: 1.05, grain: 0.02, noise: 0.03 }), 8);
defineTexture('lv37_trim', (p) => { p.fill([246, 244, 236]); p.noise(3, 0.04, 2); p.grain(0.02); }, 4);
defineTexture('lv37_slate', (p, r) => paintShingle(p, r, [74, 100, 148], { grain: 0.05 }), 12);
defineTexture('lv37_porch', (p) => { p.fill([150, 152, 160]); for (let y = 0; y < 64; y += 8) { p.rect(0, y, 64, 1, [100, 102, 110]); } p.grain(0.04); }, 6);
defineTexture('lv37_brick', (p, r) => paintBrick(p, r, [168, 78, 56], [140, 62, 46], [200, 190, 176]), 12);
defineTexture('lv37_door', (p) => {
  p.fill([176, 36, 32]); p.bevel(6, 6, 52, 52, -0.12, -0.12);
  p.rect(14, 8, 36, 22, [150, 200, 230]); p.frame(14, 8, 36, 22, [246, 244, 236]); p.rect(31, 8, 2, 22, [246, 244, 236]);
  p.bevel(14, 36, 36, 22, -0.14, -0.1); p.rect(48, 34, 4, 4, [230, 200, 90]);
}, 10);
defineTexture('lv37_attic', (p) => { p.fill([246, 244, 236]); p.disc(32, 32, 24, [90, 120, 168]); p.rect(30, 8, 4, 48, [246, 244, 236]); p.rect(8, 30, 48, 4, [246, 244, 236]); }, 6);
const WIN = { frame: [246, 244, 236], glass: [92, 126, 172], gleam: 1.4 };
defineTexture('lv37_win', (p) => paintWindow(p, WIN), 8);
defineTexture('lv37_win_c', (p) => paintWindow(p, { ...WIN, curtain: [236, 222, 196], curtainFull: false }), 8);
defineTexture('lv37_win_cc', (p) => paintWindow(p, { ...WIN, curtain: [206, 120, 130], curtainFull: true }), 8);
defineTexture('lv37_win_lit', (p) => paintWindow(p, { frame: [246, 244, 236], lit: [255, 226, 140] }), 8);
defineMaterial('lv37_yellow', 'lv37_yellow', { su: 1.6, sv: 1.2, surf: 'wood' });
defineMaterial('lv37_trim', 'lv37_trim', { s: 1, surf: 'wood' });
defineMaterial('lv37_slate', 'lv37_slate', { s: 1.5, surf: 'wood' });
defineMaterial('lv37_porch', 'lv37_porch', { s: 1.2, surf: 'wood' });
defineMaterial('lv37_brick', 'lv37_brick', { su: 1.0, sv: 0.5, surf: 'concrete' });

const FIT = [0, 0, 1, 1];
void FIT;

// a flat rectangle on a wall whose outward normal is (nx, nz) (horizontal), centred at (cx, cy, cz)
function rectN(mb, nx, nz, cx, cy, cz, wd, ht, st) {
  const Rx = nz, Rz = -nx;                      // the viewer's right
  const hw = wd / 2, hh = ht / 2;
  face(mb, [cx - Rx * hw, cy + hh, cz - Rz * hw], [cx + Rx * hw, cy + hh, cz + Rz * hw], [cx + Rx * hw, cy - hh, cz + Rz * hw], [cx - Rx * hw, cy - hh, cz - Rz * hw], [nx, 0, nz], st, wd, ht);
}

// opts: ws: array of window states (0 glass, 1 curtains, 2 curtains (rose), 3 lit), sun: [x, z],
// door: 0 closed (red), awning: bool, flag: bool (not used by the model)
defineProp('lv37_house', {
  build(mb, p, r) {
    const o = p.opts, ws = o.ws || [];
    const rr = p.rot || 0, cs = Math.cos(rr), sn = Math.sin(rr);
    const shade = (lnx, lnz) => {
      if (!o.sun) return 1;
      const wx = cs * lnx - sn * lnz, wz = sn * lnx + cs * lnz;
      return 0.72 + 0.28 * Math.max(0, wx * o.sun[0] + wz * o.sun[1]);
    };
    const tn = (k) => [k, k, k];
    const Y = (lnx, lnz) => S('lv37_yellow', { tint: tn(shade(lnx, lnz)) });
    const wh = S('lv37_trim', { tint: tn(1) });
    const slate = (lnx, lnz, up = 0.15) => S('lv37_slate', { tint: tn(Math.min(1.1, shade(lnx, lnz) + up)) });
    const W = 11, D = 9, H1 = 2.9, H = 5.5;
    // ---- main block, trim bands, corner boards
    mb.box(-W / 2, 0, 0, W / 2, H, D, [Y(1, 0), Y(-1, 0), null, null, Y(0, 1), Y(0, -1)], { sub: 2.5 });
    mb.box(-W / 2 - 0.04, 0, -0.04, W / 2 + 0.04, 0.38, D + 0.04, S('concrete', { tint: tn(0.95) }), { skip: 8, sub: 3 });
    mb.box(-W / 2 - 0.05, H1 - 0.1, -0.05, W / 2 + 0.05, H1 + 0.1, D + 0.05, wh, { sub: 4 });
    for (const [x, z] of [[W / 2, 0], [W / 2, D], [-W / 2, D]]) mb.box(x - 0.08, 0, z - 0.08, x + 0.08, H, z + 0.08, wh, { skip: 8 });
    // ---- front-gabled roof (ridge along z)
    const ridge = H + 3.9, ov = 0.5;
    const slab = (a, b, c, d, hint, lnx) => {
      face(mb, a, b, c, d, hint, slate(lnx, 0, 0.08), 1.5, 1.5);
      face(mb, a, d, c, b, [-hint[0], -hint[1], -hint[2]], S('wood_dark', { tint: tn(0.6) }), 2, 2);
    };
    slab([-W / 2 - 0.5, H, D + ov], [-W / 2 - 0.5, H, -ov], [0, ridge, -ov], [0, ridge, D + ov], [-1, 0.9, 0], -1);
    slab([W / 2 + 0.5, H, -ov], [W / 2 + 0.5, H, D + ov], [0, ridge, D + ov], [0, ridge, -ov], [1, 0.9, 0], 1);
    // front and back gables with a round window under the peak
    const gh = ridge - H - 0.2;
    tface(mb, [-W / 2, H, -0.03], [W / 2, H, -0.03], [0, H + gh, -0.03], [0, 0, -1], Y(0, -1), 2, 2);
    tface(mb, [W / 2, H, D + 0.03], [-W / 2, H, D + 0.03], [0, H + gh, D + 0.03], [0, 0, 1], Y(0, 1), 2, 2);
    rectN(mb, 0, -1, 0.2, H + 1.4, -0.06, 1.3, 1.3, T('lv37_attic'));
    // ---- the turret: octagon, windows, conical roof
    const tx = -5.0, tz = 0.15, tr = 1.75, th = 7.7;
    mb.cyl(tx, 0, tz, tr, th, 8, [Y(0, -1)][0], 0, null, Math.PI / 8);
    mb.cyl(tx, th - 0.1, tz, tr + 0.12, 0.2, 8, wh, 3, null, Math.PI / 8);
    const ap = tr * Math.cos(Math.PI / 8) + 0.025;
    const winStyle = (i) => {
      const s = ws[i] ?? 0;
      return s === 3 ? { ...G('lv37_win_lit', 1.0), flags: VF.FULLBRIGHT } : T(s === 1 ? 'lv37_win_c' : s === 2 ? 'lv37_win_cc' : 'lv37_win');
    };
    let wi = 0;
    for (const k of [4, 5, 6]) {
      const a = k * Math.PI / 4, nx = Math.cos(a), nz = Math.sin(a);
      rectN(mb, nx, nz, tx + nx * ap, 1.55, tz + nz * ap, 0.95, 1.2, winStyle(wi++));
      rectN(mb, nx, nz, tx + nx * ap, 4.55, tz + nz * ap, 0.95, 1.2, winStyle(wi++));
    }
    const base = tr + 0.5, apex = [tx, th + 3.1, tz];
    for (let i = 0; i < 8; i++) {
      const a0 = Math.PI / 8 + (i / 8) * Math.PI * 2, a1 = Math.PI / 8 + ((i + 1) / 8) * Math.PI * 2, am = (a0 + a1) / 2;
      tface(mb, [tx + Math.cos(a0) * base, th, tz + Math.sin(a0) * base], [tx + Math.cos(a1) * base, th, tz + Math.sin(a1) * base], apex, [Math.cos(am), 0.7, Math.sin(am)], slate(Math.cos(am), Math.sin(am), 0.1), 1.5, 1.5);
    }
    mb.cyl(tx, th + 3.1, tz, 0.04, 0.8, 4, wh, 2);
    // ---- the front: door, windows, bay, porch
    const dxc = 1.1;
    mb.box(dxc - 0.62, 0, -0.06, dxc + 0.62, 2.3, 0.0, wh, { skip: 32 });
    rectN(mb, 0, -1, dxc, 1.05, -0.065, 1.0, 2.1, T('lv37_door', { tint: tn(shade(0, -1)) }));
    // bay window
    mb.box(2.75, 0, -0.9, 5.15, H1 - 0.15, 0, [Y(1, 0), Y(-1, 0), null, null, null, Y(0, -1)], { sub: 2.5 });
    mb.box(2.65, H1 - 0.15, -1.0, 5.25, H1 - 0.02, 0.05, wh);
    rectN(mb, 0, -1, 3.95, 1.5, -0.93, 1.9, 1.3, winStyle(wi++));
    // ground floor window left of the door, upper floor windows
    rectN(mb, 0, -1, -1.1, 1.5, -0.03, 1.2, 1.3, winStyle(wi++));
    rectN(mb, 0, -1, -1.1, 4.2, -0.03, 1.1, 1.3, winStyle(wi++));
    rectN(mb, 0, -1, dxc, 4.2, -0.03, 1.1, 1.3, winStyle(wi++));
    rectN(mb, 0, -1, 3.95, 4.2, -0.03, 1.1, 1.3, winStyle(wi++));
    // porch: deck, posts, rail, roof
    const px0 = -3.2, px1 = 5.5, pz0 = -2.4;
    mb.box(px0, 0, pz0, px1, 0.3, 0, S('lv37_porch', { tint: tn(shade(0, -1)) }), { skip: 8, sub: 2 });
    mb.box(0.1, 0, pz0 - 1.1, 2.1, 0.15, pz0, S('lv37_porch', { tint: tn(1) }), { skip: 8 });
    for (const x of [px0 + 0.1, 0.0, 2.2, px1 - 0.1]) mb.box(x - 0.08, 0.3, pz0 + 0.1, x + 0.08, 2.75, pz0 + 0.26, wh, { skip: 8 });
    mb.box(px0, 0.9, pz0 + 0.12, 0.0, 1.0, pz0 + 0.24, wh);
    mb.box(2.2, 0.9, pz0 + 0.12, px1, 1.0, pz0 + 0.24, wh);
    for (let x = px0 + 0.3; x < px1; x += 0.45) if (x < -0.15 || x > 2.3) mb.box(x - 0.025, 0.3, pz0 + 0.14, x + 0.025, 0.9, pz0 + 0.22, wh, { skip: 8 });
    mb.box(px0 - 0.2, 2.75, pz0 - 0.2, px1 + 0.2, 2.9, 0.0, S('lv37_trim', { tint: tn(0.95) }));
    face(mb, [px0 - 0.25, 2.9, pz0 - 0.25], [px1 + 0.25, 2.9, pz0 - 0.25], [px1 + 0.25, 3.35, -0.02], [px0 - 0.25, 3.35, -0.02], [0, 1, -0.4], slate(0, -1, 0.05), 1.5, 1.5);
    if (o.awn) mb.box(-2.0, 2.45, pz0 + 0.3, -0.2, 2.5, pz0 + 1.0, S('lv37_trim', { tint: tn(0.9) }));
    // ---- chimney
    mb.box(3.4, 3.2, 4.2, 4.5, ridge - 0.6, 5.3, S('lv37_brick', { tint: tn(0.95) }), { skip: 8, sub: 2 });
    mb.box(3.3, ridge - 0.6, 4.1, 4.6, ridge - 0.45, 5.4, S('concrete', { tint: tn(0.9) }), { skip: 8 });
    // ---- sides and back
    let k = 0;
    for (const sd of [1, -1]) for (const z of [2.2, 6.8]) { for (const y of [1.55, 4.2]) { if (sd < 0 && z < 3 && y < 2) continue; rectN(mb, sd, 0, sd * (W / 2 + 0.03), y, z, 1.1, 1.3, winStyle(wi + (k++ % 6))); } }
    for (const x of [-3, 0, 3]) { rectN(mb, 0, 1, x, 1.55, D + 0.03, 1.1, 1.3, winStyle(wi)); rectN(mb, 0, 1, x, 4.2, D + 0.03, 1.1, 1.3, winStyle(wi)); }
    // a back door step
    mb.box(-0.8, 0, D, 0.8, 0.2, D + 0.7, S('concrete', { tint: tn(0.9) }), { skip: 8 });
  },
  boxes: [],
});

// Place the house of level 37 with its shell. (x, z): the middle of the facade on the ground,
// rot as for props. Returns where the front door and the foot of the steps are.
export function placeLoopHouse(zb, x, z, rot, opts = {}) {
  const sn = Math.round(Math.sin(rot)), cs = Math.round(Math.cos(rot));
  const W = 11, D = 9;
  const loc = (lx, lz) => [x + cs * lx - sn * lz, z + sn * lx + cs * lz];
  const box = (lx0, lz0, lx1, lz1, y0, y1, mat, extra = {}) => {
    const a = loc(lx0, lz0), b = loc(lx1, lz1);
    const x0 = Math.max(zb.x0, Math.min(a[0], b[0])), x1 = Math.min(zb.x1, Math.max(a[0], b[0]));
    const z0 = Math.max(zb.z0, Math.min(a[1], b[1])), z1 = Math.min(zb.z1, Math.max(a[1], b[1]));
    if (x1 > x0 && z1 > z0) zb.box(x0, y0, z0, x1, y1, z1, mat, extra);
  };
  const base = opts.baseY ?? 0;
  if (owns(zb, x, z)) zb.prop('lv37_house', x, base, z, rot, { ...opts, collide: false });
  box(-W / 2 + 0.05, 0.05, W / 2 - 0.05, D - 0.05, base, base + 5.4, M.lv37_yellow, { sub: 6, skip: FACE.NY });
  box(-6.6, -1.6, -3.4, 1.4, base, base + 7.6, M.lv37_yellow, { sub: 6, skip: FACE.NY });
  const mid = loc(0, D / 2);
  if (owns(zb, mid[0], mid[1])) {
    const m = loc(0, D / 2);
    zb.box(m[0] - 1.2, base + 5.4, m[1] - 1.2, m[0] + 1.2, base + 7.2, m[1] + 1.2, M.lv37_slate, { sub: 6, collide: false, skip: FACE.NY });
  }
  // the porch deck can be stepped onto
  box(-3.2, -2.4, 5.5, 0.0, base, base + 0.3, M.lv37_porch, { render: false });
  const door = loc(1.1, 0), steps = loc(1.1, -3.5);
  return { door, steps, front: [sn, -cs] };
}
