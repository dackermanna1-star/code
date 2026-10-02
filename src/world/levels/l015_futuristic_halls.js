// Level 15: Futuristic Halls. A pristine concourse that looks built for a future that is late:
// white floors with blue guide lines, columns with rings of light, long shallow arches that
// repeat in both directions under a pale sky, hanging gate signs. Announcements are slightly
// distorted chimes, and when one sounds the signs and rings swell with it.
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial, VF } from '../materials.js';
import { defineProp, propMat as S, propGlow } from '../props.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, openGround, cbox, owns, hr, levelDoor, env, M } from './kit.js';
import { outQuad, UVQ, hookFlicker } from './g05_kit.js';

const N = 15;
const BAY = 32;                 // columns every 32 m, arches between them
const SPRING = 10, RISE = 5;    // arches spring from the column tops at 10 m and rise 5 m
const SIGN_CH = 10, RING_CH = 9;

// ------------------------------------------------------------------ textures
function tile(p, line) {
  p.fill([226, 233, 242]);
  p.noise(3, 0.035, 2);
  p.grain(0.015);
  p.rect(0, 0, 64, 1, [196, 208, 226], 0.8); p.rect(0, 0, 1, 64, [196, 208, 226], 0.8);
  p.rect(0, 32, 64, 1, [208, 218, 234], 0.6); p.rect(32, 0, 1, 64, [208, 218, 234], 0.6);
  if (!line) return;
  // a guide stripe 2 m wide centred on the tile edge (the texture wraps), chevrons along it
  const along = line === 'x';
  for (let a = 0; a < 64; a++) for (let b = -16; b < 16; b++) {
    const c = Math.abs(b) > 13 ? [150, 200, 255] : [44, 108, 226];
    if (along) p.set(a, b, c); else p.set(b, a, c);
  }
  // chevrons pointing along the stripe
  for (let a = 0; a < 64; a += 16) for (let k = 0; k < 8; k++) for (const sgn of [-1, 1]) {
    const b = Math.round(sgn * k * 1.2), aa = a + 8 - k;
    if (along) p.set(aa, b, [236, 248, 255]); else p.set(b, aa, [236, 248, 255]);
  }
}
defineTexture('lv15_floor', (p) => tile(p, null), 10);
defineTexture('lv15_line_x', (p) => tile(p, 'x'), 12);
defineTexture('lv15_line_z', (p) => tile(p, 'z'), 12);
defineTexture('lv15_wall', (p) => {
  p.fill([234, 238, 246]);
  p.noise(4, 0.03, 2);
  p.grain(0.012);
  for (let x = 0; x < 64; x += 16) { p.rect(x, 0, 1, 64, [196, 206, 224], 0.8); p.rect(x + 1, 0, 1, 64, [250, 252, 255], 0.5); }
  p.rect(0, 62, 64, 2, [170, 186, 214], 0.7);
}, 10);
defineTexture('lv15_col', (p) => {
  p.fill([236, 240, 247]);
  p.noise(3, 0.03, 2);
  p.rect(0, 58, 64, 6, [60, 120, 230]);
  p.rect(0, 0, 64, 3, [60, 120, 230]);
  p.rect(0, 56, 64, 1, [180, 200, 235], 0.8);
}, 8);
defineTexture('lv15_glow', (p) => {
  p.map((x, y) => [120 + y * 1.4, 190 + y * 0.8, 255]);
}, 6);
function screen(p, code, arrow) {
  p.fill([8, 34, 110]);
  p.rect(0, 0, 64, 10, [24, 84, 200]);
  p.text('GATE', 20, 2, [220, 240, 255], 1);
  p.text(code, 10, 20, [235, 248, 255], 4);
  p.text(arrow, 24, 50, [150, 210, 255], 1);
  p.frame(0, 0, 64, 64, [150, 200, 255]);
}
defineTexture('lv15_screen_a', (p) => screen(p, 'A1', '>>>'), 8);
defineTexture('lv15_screen_b', (p) => screen(p, 'B7', '<<<'), 8);
defineTexture('lv15_screen_c', (p) => screen(p, 'C4', '^^^'), 8);
defineTexture('lv15_ring', (p) => {
  p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x - 31.5, y - 31.5);
    const on = (d > 29 && d < 31.5) || (d > 22 && d < 23.5) || (d > 8 && d < 10);
    if (on) { p.set(x, y, [70, 140, 240]); p.alpha(x, y, 255); }
  }
}, 4);

defineMaterial('lv15_floor', 'lv15_floor', { s: 4, surf: 'tile' });
defineMaterial('lv15_line_x', 'lv15_line_x', { s: 4, surf: 'tile' });
defineMaterial('lv15_line_z', 'lv15_line_z', { s: 4, surf: 'tile' });
defineMaterial('lv15_wall', 'lv15_wall', { su: 4, sv: 4, surf: 'tile' });
defineMaterial('lv15_col', 'lv15_col', { su: 3.2, sv: 10, surf: 'tile' });
defineMaterial('lv15_glow', 'lv15_glow', { s: 1, flags: VF.FULLBRIGHT, glow: 1.0 });
defineMaterial('lv15_signglow', 'lv15_glow', { s: 1, flags: VF.FULLBRIGHT, glow: 1.0, chan: SIGN_CH });
defineMaterial('lv15_screen_a', 'lv15_screen_a', { s: 1, flags: VF.FULLBRIGHT, glow: 1.0, chan: SIGN_CH });
defineMaterial('lv15_screen_b', 'lv15_screen_b', { s: 1, flags: VF.FULLBRIGHT, glow: 1.0, chan: SIGN_CH });
defineMaterial('lv15_screen_c', 'lv15_screen_c', { s: 1, flags: VF.FULLBRIGHT, glow: 1.0, chan: SIGN_CH });

// ------------------------------------------------------------------ props
// a shallow arch of 32 m span in the local x-y plane, springing 10 m above the floor
defineProp('lv15_arch', {
  build(mb, p) {
    const span = BAY, half = span / 2, th = 0.9, dz = 0.6, seg = 16;
    const R = (half * half + RISE * RISE) / (2 * RISE), cy = SPRING + RISE - R;
    const tmax = Math.asin(half / R);
    const wall = S('lv15_wall'), glow = propGlow('lv15_glow', 1.1, 0);
    const pt = (t, r, z) => [r * Math.sin(t), cy + r * Math.cos(t), z];
    const rin = R - th / 2, rout = R + th / 2;
    for (let i = 0; i < seg; i++) {
      const t0 = -tmax + (2 * tmax * i) / seg, t1 = -tmax + (2 * tmax * (i + 1)) / seg, tm = (t0 + t1) / 2;
      const far = [(rin + 9) * Math.sin(tm), cy + (rin + 9) * Math.cos(tm), 0];
      outQuad(mb, pt(t0, rin, -dz), pt(t1, rin, -dz), pt(t1, rin, dz), pt(t0, rin, dz), wall, UVQ, far);
      outQuad(mb, pt(t0, rout, -dz), pt(t1, rout, -dz), pt(t1, rout, dz), pt(t0, rout, dz), wall, UVQ, [0, cy, 0]);
      for (const s of [-1, 1]) outQuad(mb, pt(t0, rin, s * dz), pt(t1, rin, s * dz), pt(t1, rout, s * dz), pt(t0, rout, s * dz), wall, UVQ, [0, cy, -s * 10]);
      outQuad(mb, pt(t0, rin - 0.03, -0.22), pt(t1, rin - 0.03, -0.22), pt(t1, rin - 0.03, 0.22), pt(t0, rin - 0.03, 0.22), glow, UVQ, far);
    }
  },
});
// a column to the spring line: tapering shaft, a capital, rings of light
defineProp('lv15_column', {
  build(mb, p) {
    const col = S('lv15_col'), glow = propGlow('lv15_glow', 1.15, RING_CH);
    mb.cyl(0, 0, 0, 0.95, 0.3, 10, col, 3);
    mb.cyl(0, 0.3, 0, 0.58, 6.2, 10, col, 0);
    mb.cyl(0, 6.5, 0, 0.46, 3.5, 10, col, 0);
    mb.cyl(0, 9.4, 0, 0.85, 0.6, 10, col, 3);
    for (const y of [1.4, 5.6, 8.9]) mb.cyl(0, y, 0, y < 6 ? 0.595 : 0.5, 0.16, 10, glow, 0);
  },
  boxes: [[-0.7, 0, -0.7, 0.7, 10, 0.7]],
  light: { y: 1.8, color: [0.55, 0.75, 1.0], rad: 8, int: 0.5 },
});
// an information totem with screens on two faces
defineProp('lv15_totem', {
  build(mb, p) {
    const wall = S('lv15_wall'), a = S('lv15_screen_' + (p.opts.v || 'a')), b = S('lv15_screen_' + (p.opts.v2 || 'b'));
    mb.box(-0.6, 0, -0.6, 0.6, 0.35, 0.6, wall);
    mb.box(-0.45, 0.35, -0.45, 0.45, 4.3, 0.45, [wall, wall, wall, wall, wall, wall]);
    for (const [sgn, st] of [[-1, a], [1, b]]) mb.box(-0.4, 1.9, sgn * 0.46 - 0.02, 0.4, 3.5, sgn * 0.46 + 0.02, st, { uv: 'fit' });
    mb.cyl(0, 4.3, 0, 0.62, 0.2, 10, S('lv15_glow'), 3);
  },
  boxes: [[-0.62, 0, -0.62, 0.62, 4.5, 0.62]],
  light: { y: 2.4, color: [0.5, 0.72, 1.0], rad: 9, int: 0.55 },
  emitter: { snd: 'g05_ion', y: 3.2, vol: 0.4, rad: 12 },
});

// ------------------------------------------------------------------ layout
const ENTRY = { x: 10.5, z: 16.5 };
const WALL_X = ENTRY.x - 0.75 - 0.12 - 0.01;       // the monolith's face behind the arrival door

function gen(zb) {
  zb.noConnectivity = true;
  openGround(zb, M.lv15_floor, 0);
  const { x0, z0, x1, z1 } = zb;
  // guide lines along the middle of every bay, in both directions
  zb.fill(x0, z0, x1, z1, (x, z, i) => {
    const lx = ((x % BAY) + BAY) % BAY, lz = ((z % BAY) + BAY) % BAY;
    if (lz === 15 || lz === 16) zb.fmat[i] = M.lv15_line_x;
    else if (lx === 15 || lx === 16) zb.fmat[i] = M.lv15_line_z;
  });
  const iA = Math.floor(x0 / BAY) - 1, iB = Math.floor(x1 / BAY) + 1;
  const jA = Math.floor(z0 / BAY) - 1, jB = Math.floor(z1 / BAY) + 1;
  for (let j = jA; j <= jB; j++) for (let i = iA; i <= iB; i++) {
    const bx = i * BAY, bz = j * BAY;
    if (owns(zb, bx, bz)) zb.prop('lv15_column', bx, 0, bz, 0, {});
    if (owns(zb, bx + 16, bz)) zb.prop('lv15_arch', bx + 16, 0, bz, 0, {});
    if (owns(zb, bx, bz + 16)) {
      zb.prop('lv15_arch', bx, 0, bz + 16, Math.PI / 2, {});
      // a gate sign hangs from the crown over the middle of the path
      if (hr(i, j, 1501) < 0.8) {
        const v = ['a', 'b', 'c'][Math.floor(hr(i, j, 1502) * 3)];
        const m = M['lv15_screen_' + v];
        const sx = bx, sz = bz + 16;
        zb.box(sx - 0.07, 12.8, sz - 1.5, sx + 0.07, 14.3, sz + 1.5, [m, m, M.lv15_wall, M.lv15_wall, M.lv15_wall, M.lv15_wall], { collide: false, uv: 'fit' });
        for (const dz of [-1.3, 1.3]) zb.box(sx - 0.03, 14.3, sz + dz - 0.03, sx + 0.03, 14.9, sz + dz + 0.03, M.lv15_wall, { collide: false });
      }
    }
    // the middle of the bay: a totem in a ring of light, four benches around it
    const cx = bx + 16, cz = bz + 16;
    const doorHere = hr(i, j, 1520) < 0.75 && !(i === 0 && j === 0);
    if (owns(zb, cx, cz)) {
      const k = hr(i, j, 1510);
      if (k < 0.55) {
        zb.prop('lv15_totem', cx, 0, cz, 0, { v: ['a', 'b', 'c'][Math.floor(hr(i, j, 1511) * 3)], v2: ['a', 'b', 'c'][Math.floor(hr(i, j, 1512) * 3)] });
        zb.decal(cx, 0, cz, 'up', 9, 9, 'lv15_ring', { lit: false, glow: 0.9 });
        if (!doorHere) for (const [dx, dz, rot] of [[5.2, 0, 0], [-5.2, 0, 0], [0, 5.2, 1], [0, -5.2, 1]]) {
          const w = rot ? [0.6, 2.4] : [2.4, 0.6];
          zb.box(cx + dx - w[1], 0.0, cz + dz - w[0], cx + dx + w[1], 0.45, cz + dz + w[0], M.lv15_wall);
        }
      } else if (k < 0.8) {
        zb.decal(cx, 0, cz, 'up', 14, 14, 'lv15_ring', { lit: false, glow: 0.8 });
        zb.box(cx - 1.5, 0, cz - 1.5, cx + 1.5, 0.5, cz + 1.5, M.lv15_glow);
        zb.box(cx - 1.1, 0.5, cz - 1.1, cx + 1.1, 0.7, cz + 1.1, M.lv15_wall);
      }
    }
    // monoliths with a level door: white slabs standing in the bay
    if (doorHere) {
      const mx = bx + 6 + hr(i, j, 1521) * 5, mz = bz + 6 + hr(i, j, 1522) * 5;
      const alongX = hr(i, j, 1523) < 0.5;
      const hw = alongX ? [4, 0.6] : [0.6, 4];
      const sx = Math.floor(mx), sz = Math.floor(mz);
      if (owns(zb, sx, sz)) {
        cbox(zb, sx - hw[0], 0, sz - hw[1], sx + hw[0], 7, sz + hw[1], M.lv15_wall, { sub: 2 });
        cbox(zb, sx - hw[0] - 0.05, 6.4, sz - hw[1] - 0.05, sx + hw[0] + 0.05, 6.6, sz + hw[1] + 0.05, M.lv15_glow, { collide: false });
        const rot = alongX ? 0 : Math.PI / 2;
        if (alongX) levelDoor(zb, sx, sz + hw[1] + 0.13, Math.PI, {});
        else levelDoor(zb, sx + hw[0] + 0.13, sz, Math.PI / 2, {});
        void rot;
      }
    }
  }
  // the arrival monolith: its east face is the wall plane behind the door
  if (owns(zb, 8, 16)) {
    cbox(zb, WALL_X - 3.0, 0, 11.5, WALL_X, 9, 21.5, M.lv15_wall, { sub: 2 });
    cbox(zb, WALL_X - 3.05, 8.4, 11.45, WALL_X + 0.05, 8.7, 21.55, M.lv15_glow, { collide: false });
    for (const zz of [11.5, 21.5]) cbox(zb, WALL_X - 3.0, 0, zz - 0.06, WALL_X + 0.05, 9, zz + 0.06, M.lv15_glow, { collide: false });
  }
  // pools of blue light along the guide lines
  for (let z = Math.floor(z0 / 8) * 8; z < z1; z += 8) for (let x = Math.floor(x0 / 8) * 8; x < x1; x += 8) {
    const lx = ((x % BAY) + BAY) % BAY, lz = ((z % BAY) + BAY) % BAY;
    if (lx === 16 || lz === 16) zb.light(x + 0.5, 0.8, z + 0.5, { color: [0.5, 0.7, 1.0], rad: 7, int: 0.35 });
  }
}

defineZone('lv15_halls', {
  ...LEVEL_ZONE,
  doors: true,
  params: () => ({
    ambient: [0.82, 0.88, 1.0],
    env: env({ fog: [0.82, 0.89, 0.98], fogNear: 14, fogFar: 74, hum: 0, hvac: 0.1, reverb: 'hall', tone: 'void' }),
  }),
  gen,
});

// ------------------------------------------------------------------ announcements
function swell(ctx) {
  const s = ctx.state;
  hookFlicker(ctx.game, N, (v, t) => {
    const a = s.pulse || 0;
    const calm = 0.86 + 0.06 * Math.sin(t * 0.8);
    v[SIGN_CH] = calm + a * 0.9;
    v[RING_CH] = calm + a * 0.7 * (0.5 + 0.5 * Math.sin(t * 9));
  });
}

defineLevel(N, {
  name: 'FUTURISTIC HALLS',
  zoneType: 'lv15_halls',
  zoneSize: 64,
  bands: [0],
  entry: { x: ENTRY.x, y: 0, z: ENTRY.z, yaw: Math.PI / 2, pitch: 0.06 },
  doorDensity: 0.4,
  viewRadius: 4,
  sky: { top: [0.5, 0.67, 0.92], horizon: [0.84, 0.91, 0.99], ground: [0.8, 0.86, 0.95], curve: 0.6 },
  grade: { sat: 1.05, tint: [0.98, 1.0, 1.04] },
  light: { phoneRadius: 3, phoneIntensity: 0.1 },
  script(ctx, dt) {
    const s = ctx.state, g = ctx.game;
    swell(ctx);
    // the building's own events (taps, rings) do not belong here
    if (g.events && g.events.timer < 60) g.events.timer = 60;
    s.pulse = Math.max(0, (s.pulse || 0) - dt * 0.35);
    s.t = (s.t ?? 12) - dt;
    if (s.t > 0) return;
    s.t = 24 + Math.random() * 30;
    g.audioCall('play', 'g05_dchime', undefined, undefined, undefined, { vol: 0.9 });
    s.pulse = 1;
  },
});
