// Assets for pocket 6, the Pool Rooms: glossy tile in every colour of chlorine, still water,
// daylight panels, and a round arch that fills the spandrel of an opening in a thin wall.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineProp, propMat as S } from '../props.js';

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// n x n square tiles with hairline grout and a little gloss on every tile
function tiles(p, n, base, grout, r, amp = 0.04) {
  const ts = 64 / n;
  p.fill(base);
  for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) p.shade(tx * ts, ty * ts, ts, ts, r.range(-amp, amp * 0.4));
  for (let k = 0; k < 64; k += ts) { p.rect(0, k, 64, 1, grout); p.rect(k, 0, 1, 64, grout); }
  for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) p.bevel(tx * ts + 1, ty * ts + 1, ts - 1, ts - 1, 0.05, 0.025);
}

defineTexture('ei_tile_floor', (p, r) => { tiles(p, 4, [230, 230, 216], [160, 180, 184], r, 0.06); p.grain(0.015); }, 16);
defineTexture('ei_tile_floor_b', (p, r) => {
  tiles(p, 4, [230, 230, 216], [160, 180, 184], r, 0.06);
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) if ((tx + ty) % 2) p.rect(tx * 16 + 1, ty * 16 + 1, 15, 15, [176, 218, 222]);
  p.grain(0.015);
}, 16);
// wall tile: 0.2 m tiles (1.6 m repeat) with a turquoise course every repeat
defineTexture('ei_tile_wall', (p, r) => {
  tiles(p, 4, [232, 236, 230], [170, 194, 198], r, 0.035);
  for (let tx = 0; tx < 4; tx++) p.rect(tx * 16 + 1, 26, 15, 4, [118, 198, 208]);
  for (let tx = 0; tx < 4; tx++) p.bevel(tx * 16 + 1, 26, 15, 4, 0.1, 0.05);
  p.grain(0.012);
}, 16);
defineTexture('ei_tile_ceil', (p, r) => { tiles(p, 4, [224, 230, 224], [186, 198, 194], r, 0.025); p.grain(0.012); }, 16);
defineTexture('ei_tile_pool', (p, r) => {
  tiles(p, 4, [110, 204, 214], [166, 226, 232], r, 0.07);
  p.map((x, y, c) => {
    const w = Math.sin((x + 6 * Math.sin(y * 0.2)) * 0.45) + Math.sin((y + 5 * Math.sin(x * 0.17)) * 0.5);
    return w > 1.4 ? [c[0] * 1.2, c[1] * 1.1, c[2] * 1.06] : c;
  });
}, 16);
defineTexture('ei_tile_edge', (p, r) => { tiles(p, 4, [58, 168, 190], [150, 212, 222], r, 0.05); p.grain(0.015); }, 16);
defineTexture('ei_water', (p) => {
  p.fill([96, 202, 216]);
  p.map((x, y, c) => {
    const n = pnoise(x, y, 4, p.seed) * 6 + pnoise(x, y, 8, p.seed + 5) * 2;
    return Math.sin(x * 0.28 + n) > 0.8 ? [176, 236, 244] : Math.sin(y * 0.35 + n * 0.8) > 0.88 ? [142, 222, 234] : c;
  });
}, 8);
// daylight: a pale blue-white pane with white mullions
defineTexture('ei_sky', (p) => {
  p.map((x, y) => mix([255, 255, 248], [190, 222, 248], Math.min(1, Math.hypot((x - 32) / 34, (y - 32) / 34))));
  p.rect(31, 0, 2, 64, [244, 248, 250]); p.rect(0, 31, 64, 2, [244, 248, 250]);
  p.frame(0, 0, 64, 64, [244, 248, 250]); p.frame(1, 1, 62, 62, [244, 248, 250]); p.frame(2, 2, 60, 60, [220, 234, 242]);
}, 16);
defineTexture('ei_sign_pool', (p) => {
  p.fill([22, 142, 170]);
  p.text('POOL', 32 - 23, 14, [244, 250, 250], 2);
  for (let k = 0; k < 3; k++) for (let x = 0; x < 64; x++) {
    const y = 40 + k * 7 + Math.round(2.2 * Math.sin(x * 0.35 + k * 1.7));
    p.set(x, y, [200, 240, 246]); p.set(x, y + 1, [200, 240, 246]);
  }
  p.frame(0, 0, 64, 64, [14, 96, 118]);
}, 8);
defineTexture('ei_sign_changing', (p) => {
  p.fill([236, 240, 236]);
  p.text('CHANG-', 32 - 17, 12, [22, 110, 140], 1);
  p.text('ING', 32 - 8, 22, [22, 110, 140], 1);
  p.rect(10, 36, 44, 14, [40, 146, 172]);
  p.text('OPEN', 32 - 11, 40, [240, 250, 250], 1);
  p.frame(0, 0, 64, 64, [150, 170, 172]);
}, 8);
// black lane line on the bottom of a lap pool
defineTexture('ei_lane', (p) => {
  p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 24; x < 40; x++) { p.set(x, y, [26, 62, 122]); p.alpha(x, y, 255); }
}, 4);
// floor drain
defineTexture('ei_drain', (p) => {
  p.clearAlpha(0);
  p.rect(14, 14, 36, 36, [150, 156, 158]); p.rectA(14, 14, 36, 36, 255);
  for (let x = 18; x < 48; x += 4) p.rect(x, 18, 2, 28, [44, 54, 58]);
  p.frame(14, 14, 36, 36, [110, 118, 120]);
}, 8);

defineMaterial('ei_tile_floor', 'ei_tile_floor', { s: 1.2, surf: 'tile' });
defineMaterial('ei_tile_floor_b', 'ei_tile_floor_b', { s: 1.2, surf: 'tile' });
defineMaterial('ei_tile_wall', 'ei_tile_wall', { s: 1.6, surf: 'tile' });
defineMaterial('ei_tile_ceil', 'ei_tile_ceil', { s: 1.6, surf: 'tile' });
defineMaterial('ei_tile_pool', 'ei_tile_pool', { s: 1.2, surf: 'water' });
defineMaterial('ei_tile_edge', 'ei_tile_edge', { s: 1.2, surf: 'tile' });
defineMaterial('ei_water', 'ei_water', { s: 2, surf: 'water', flags: VF.WOBBLE | VF.SCROLL });

// ---------------------------------------------------------------- round arch
// Fills the wall around a round-topped opening in a thin (0.2 m) wall: both faces above the
// curve and the curved reveal between them. Local x runs along the wall, the faces look along
// -z / +z. opts: w (opening width), sp (spring height), H (wall height), ax ('x' | 'z': direction
// of the wall in the world, the prop is placed with the matching rotation) so that the tile
// courses continue exactly from the neighbouring wall.
defineProp('ei_arch', {
  build(mb, p) {
    const o = p.opts, w = o.w || 4, r = w / 2, sp = o.sp ?? 1.1, H = Math.max(o.H || 4.4, sp + r + 0.3);
    const along = o.ax === 'z' ? p.z : p.x;           // world coordinate of the opening's centre along the wall
    const st = S('ei_tile_wall');
    const SC = 1.6, N = 10, T = 0.1, E = 0.006;
    const uu = (lx) => (along + lx) / SC, vv = (y) => -y / SC;
    const px = [], py = [];
    for (let k = 0; k <= N; k++) { const a = Math.PI * k / N; px.push(-r * Math.cos(a)); py.push(sp + r * Math.sin(a)); }
    for (let k = 0; k < N; k++) {
      // front face (-z), counter-clockwise seen from -z: bottom-left is the +x end
      const z = -T - E;
      mb.quad([px[k + 1], py[k + 1], z, px[k], py[k], z, px[k], H, z, px[k + 1], H, z], [0, 0, -1], st,
        [uu(px[k + 1]), vv(py[k + 1]), uu(px[k]), vv(py[k]), uu(px[k]), vv(H), uu(px[k + 1]), vv(H)]);
      const zb = T + E;
      mb.quad([px[k], py[k], zb, px[k + 1], py[k + 1], zb, px[k + 1], H, zb, px[k], H, zb], [0, 0, 1], st,
        [uu(px[k]), vv(py[k]), uu(px[k + 1]), vv(py[k + 1]), uu(px[k + 1]), vv(H), uu(px[k]), vv(H)]);
      // reveal, facing the middle of the opening
      const mx = (px[k] + px[k + 1]) / 2, my = (py[k] + py[k + 1]) / 2;
      const nx = -mx / r, ny = (sp - my) / r;
      mb.quad([px[k + 1], py[k + 1], T, px[k], py[k], T, px[k], py[k], -T, px[k + 1], py[k + 1], -T], [nx, ny, 0], st,
        [uu(px[k + 1]), 0, uu(px[k]), 0, uu(px[k]), 0.125, uu(px[k + 1]), 0.125]);
    }
  },
});

// ---------------------------------------------------------------- pool ladder
// Chrome handrails over the coping and down the pool wall into the water. Local -z points
// into the pool, y = 0 is the deck; opts.d is the depth of the water at the wall.
defineProp('ei_ladder', {
  build(mb, p) {
    const d = p.opts.d || 1.2, ch = S('chrome');
    const X = 0.3, r = 0.028;
    for (const sx of [-1, 1]) {
      const x = sx * X;
      mb.rod(x, 0, 0.6, x, 0.98, 0.6, r, 5, ch, true);
      mb.rod(x, 0.98, 0.6, x, 0.98, 0.2, r, 5, ch, true);
      mb.rod(x, 0.98, 0.2, x, 0.72, -0.1, r, 5, ch, true);
      mb.rod(x, 0.72, -0.1, x, -d + 0.05, -0.1, r, 5, ch, true);
    }
    for (const y of [0.3, -0.25, -0.6, -0.95]) if (y > -d) mb.rod(-X, y, -0.1, X, y, -0.1, r * 0.8, 4, ch);
  },
  boxes: [[-0.38, 0, -0.14, 0.38, 1.0, 0.64]],
});
