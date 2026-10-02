// Level 21: Numbered Hotel. A pale, endless grid of straight corridors, every room a bare number.
// The numbers grow with distance from the lobby (roughly tenfold every 37 m), so the plaques above
// the doors, the giant numerals on the walls and the hanging signs at every crossing run from 1
// through the thousands into the millions and on. The lobby holds the directory.
import { defineZone } from '../zonetypes.js';
import { defineProp, propMat as S, propTex as T, propGlow as glow } from '../props.js';
import { LEVEL_ZONE, defineLevel, env, M, hr, levelDoor, ceilingLight } from './kit.js';
import { Loc, face, withCommas, numWidth, clamp, flatSlab } from './g01_kit.js';
import { ACCENT, DIR_W, DIR_H } from './l021_numbered_hotel_tex.js';

const N = 21;
const G = 64;
const CH = 3.2, RH = 2.7, DH = 2.2, LH = 6.5;     // corridor, room, door, lobby heights
const BO = [3, 35];                                // block origins (29 x 29) inside a zone
const C0 = [0, 32];                                // corridor strips (3 wide)
const CX = 33.5;                                   // the lobby's crossing
const COOL = [0.88, 0.96, 1.0];
const LOB = [19, 19, 48, 48];                      // the lobby square (cells)

// ------------------------------------------------------------------ numbers
// roughly tenfold per 37 m of walking along the grid, starting from 1 in the lobby
function bigNumber(x, z, salt = 0) {
  const L1 = Math.abs(x - CX) + Math.abs(z - CX);
  const dec = L1 / 16 / Math.LN10, e = Math.min(22, Math.floor(dec));
  if (e <= 3) return String(Math.max(1, Math.floor(Math.exp(L1 / 16))));
  let s = String(Math.floor(Math.pow(10, dec - Math.floor(dec)) * 1000));
  for (let k = 4; k <= e; k++) s += Math.floor(hr(Math.floor(x * 2) + k * 31, Math.floor(z * 2) + salt, 211) * 10);
  return s;
}
const fit = (text, maxW, hMax, hMin = 0.05) => clamp(maxW / numWidth(text, 1), hMin, hMax);

// ------------------------------------------------------------------ props
defineProp('lv21_dirboard', {
  build(mb, p) {
    const t = p.opts.t ?? 1.5, W = DIR_W * t, H = DIR_H * t;
    mb.box(-W / 2 - 0.12, -0.12, -0.05, W / 2 + 0.12, H + 0.12, 0.02, S('lv21_steel'));
    for (let ty = 0; ty < DIR_H; ty++) for (let tx = 0; tx < DIR_W; tx++) {
      const st = glow('lv21_dir_' + tx + '_' + ty, 0.85);
      const xl = W / 2 - tx * t, xr = xl - t, y1 = H - ty * t, y0 = y1 - t;
      mb.quad([xl, y0, -0.058, xr, y0, -0.058, xr, y1, -0.058, xl, y1, -0.058], [0, 0, -1], st, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  },
  light: { y: 2.2, z: -2.0, color: [0.8, 0.9, 1.0], rad: 7, int: 0.45 },
});

defineProp('lv21_door', {
  build(mb) {
    mb.box(-0.46, 0.0, -0.05, 0.46, 2.12, 0.0, [null, null, null, null, null, S('lv21_door')], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 1, 1]] });
  },
  use: 'locked',
  boxes: [[-0.48, 0, -0.08, 0.48, 2.12, 0.02]],
});

defineProp('lv21_bed', {
  build(mb) {
    const fr = S('lv21_steel'), bd = S('lv21_bed');
    mb.box(-0.72, 0.1, -1.0, 0.72, 0.38, 1.0, fr);
    mb.box(-0.7, 0.38, -0.98, 0.7, 0.58, 0.98, [bd, bd, bd, null, bd, bd]);
    mb.box(-0.6, 0.58, 0.55, 0.6, 0.66, 0.92, S('plastic_white'));
    mb.box(-0.74, 0.1, 0.98, 0.74, 1.05, 1.06, S('lv21_desk'));
  },
  boxes: [[-0.74, 0, -1.0, 0.74, 0.62, 1.06]],
});
defineProp('lv21_nightstand', {
  build(mb) { mb.box(-0.22, 0.0, -0.2, 0.22, 0.52, 0.2, S('lv21_desk')); mb.box(-0.18, 0.28, -0.205, 0.18, 0.3, -0.2, S('lv21_steel')); },
  boxes: [[-0.22, 0, -0.2, 0.22, 0.52, 0.2]],
});
defineProp('lv21_wardrobe', {
  build(mb) {
    const m = S('lv21_desk');
    mb.box(-0.5, 0, -0.28, 0.5, 2.0, 0.28, [m, m, m, null, m, T('lv21_door')], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 1, 1]] });
  },
  boxes: [[-0.5, 0, -0.28, 0.5, 2.0, 0.28]],
});

// ------------------------------------------------------------------ the zone
function gen(zb) {
  zb.noConnectivity = true;
  const Z = new Loc(zb);
  const zi = Math.floor(zb.x0 / G), zj = Math.floor(zb.z0 / G);
  const lobby = zi === 0 && zj === 0;
  const inLobby = (u, v) => lobby && u >= LOB[0] - 1 && v >= LOB[1] - 1 && u <= LOB[2] && v <= LOB[3];
  Z.each(0, 0, G, G, (u, v, i) => { zb.solid[i] = M.lv21_wall_0; zb.floor[i] = 0; zb.ceil[i] = CH; zb.wmat[i] = M.lv21_wall_0; });
  // blocks
  for (let bj = 0; bj < 2; bj++) for (let bi = 0; bi < 2; bi++) block(Z, zi, zj, bi, bj, lobby, inLobby);
  corridors(Z, zi, zj, inLobby);
  if (lobby) lobbyHall(Z);
}

function corridors(Z, zi, zj, inLobby) {
  const zb = Z.zb;
  const cor = { floor: 0, ceil: CH, fmat: M.lv21_carpet, cmat: M.lv21_ceil };
  for (const c of C0) { Z.carve(c, 0, c + 3, G, cor); Z.carve(0, c, G, c + 3, cor); }
  C0.forEach((c, k) => {
    const cn = Math.floor(hr(zi * 2 + k, 7, 301) * 4), ce = Math.floor(hr(zj * 2 + k, 9, 302) * 4);
    Z.floorMat(c + 1, 0, c + 2, G, M['lv21_stripe_ns_' + cn]);
    Z.floorMat(0, c + 1, G, c + 2, M['lv21_stripe_ew_' + ce]);
  });
  for (const a of C0) for (const b of C0) Z.floorMat(a, b, a + 3, b + 3, M.lv21_carpet);
  // ceiling lights every 4 m down the middle, a few of them tired
  for (const [i, c] of C0.entries()) for (let k = 0; k < 16; k++) {
    const t = 1.5 + k * 4;
    for (const ns of [true, false]) {
      const u = ns ? c + 1.5 : t, v = ns ? t : c + 1.5;
      if (inLobby(Math.floor(u), Math.floor(v))) continue;
      if (!ns && k % 8 === 0 && false) continue;
      const r = hr(zi * 64 + Math.floor(u), zj * 64 + Math.floor(v), 303 + i);
      const state = r < 0.07 ? 'off' : r < 0.13 ? 'flicker' : r < 0.16 ? 'dying' : 'on';
      ceilingLight(Z.zb, Z.x(u), Z.z(v), 'troffer', state, { rot: ns ? 0 : 1, color: COOL, mul: 0.95 });
    }
  }
  // hanging signs at the crossings
  for (const a of C0) for (const b of C0) {
    const cu = a + 1.5, cv = b + 1.5;
    if (inLobby(Math.floor(cu), Math.floor(cv))) continue;
    const text = withCommas(bigNumber(Z.x(cu), Z.z(cv), 5));
    const h = fit(text, 2.3, 0.3, 0.07);
    const acc = Math.floor(hr(Math.floor(Z.x(cu)), Math.floor(Z.z(cv)), 310) * 4);
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      Z.prop('g01_num', cu + dx * 0.4, 2.2, cv + dz * 0.4, face(dx, dz), { text, h, bg: 'lv21_plaque', tint: ACCENT[acc], pad: h * 0.5 });
    }
    for (const [dx, dz] of [[-0.9, 0], [0.9, 0], [0, -0.9], [0, 0.9]]) Z.box(cu + dx - 0.02, 2.5, cv + dz - 0.02, cu + dx + 0.02, CH, cv + dz + 0.02, M.lv21_steel, { collide: false });
  }
}

// ------------------------------------------------------------------ blocks and their rooms
function block(Z, zi, zj, bi, bj, lobby, inLobby) {
  const bu = BO[bi], bv = BO[bj];
  const acc = Math.floor(hr(zi * 2 + bi, zj * 2 + bj, 302) * 4);
  const wm = M['lv21_wall_' + acc];
  Z.solid(bu, bv, bu + 29, bv + 29, wm);
  const alcoveSide = hr(zi * 2 + bi, zj * 2 + bj, 305) < 0.55 ? Math.floor(hr(zi * 2 + bi, zj * 2 + bj, 306) * 4) : -1;
  for (let k = 0; k < 4; k++) side(Z, zi, zj, bu, bv, k, acc, wm, k === alcoveSide, lobby, inLobby);
}

function side(Z, zi, zj, bu, bv, k, acc, wm, alcove, lobby, inLobby) {
  const rotk = k * Math.PI / 2;
  const cell = (a, b) => (k === 0 ? [a, b] : k === 1 ? [28 - b, a] : k === 2 ? [28 - a, 28 - b] : [b, 28 - a]);
  const pt = (a, b) => (k === 0 ? [a, b] : k === 1 ? [29 - b, a] : k === 2 ? [29 - a, 29 - b] : [b, 29 - a]);
  const zp = (a, b) => { const q = pt(a, b); return [bu + q[0], bv + q[1]]; };
  const carve = (a0, b0, a1, b1, o) => {
    const p = cell(a0, b0), q = cell(a1 - 1, b1 - 1);
    Z.carve(bu + Math.min(p[0], q[0]), bv + Math.min(p[1], q[1]), bu + Math.max(p[0], q[0]) + 1, bv + Math.max(p[1], q[1]) + 1, o);
  };
  // brush in block coordinates
  const bx = (a0, y0, b0, a1, y1, b1, mat, o) => {
    const p = zp(a0, b0), q = zp(a1, b1);
    return Z.box(Math.min(p[0], q[0]), y0, Math.min(p[1], q[1]), Math.max(p[0], q[0]), y1, Math.max(p[1], q[1]), mat, o);
  };
  const prop = (type, a, b, y, rot, o) => { const [u, v] = zp(a, b); if (inLobby(Math.floor(u), Math.floor(v))) return null; return Z.prop(type, u, y, v, rot + rotk, o); };
  const frame = M['lv21_acc_' + acc];
  const wall = M['lv21_wall_' + acc];
  for (let j = 0; j < 3; j++) {
    const a0 = 1 + 6 * j;                       // room interior a0 .. a0 + 5, b 1 .. 6
    const [du, dv] = zp(a0 + 2.5, 0);
    const [ax, az] = [Z.x(du), Z.z(dv)];
    const [cu, cv] = zp(a0 + 2.5, 0);
    if (inLobby(Math.floor(cu), Math.floor(cv))) continue;
    const num = bigNumber(ax, az, j * 7 + k);
    const text = withCommas(num);
    const open = !lobby && hr(zi * 64 + Math.floor(du), zj * 64 + Math.floor(dv), 320) < 0.5;
    // frame, plate
    bx(a0 + 2 - 0.08, 0, -0.07, a0 + 2, DH + 0.1, 0, frame, { collide: false });
    bx(a0 + 3, 0, -0.07, a0 + 3.08, DH + 0.1, 0, frame, { collide: false });
    bx(a0 + 2 - 0.08, DH, -0.07, a0 + 3.08, DH + 0.1, 0, frame, { collide: false });
    prop('g01_num', a0 + 2.5, 0.0, 2.4, 0, { text, h: fit(text, 3.4, 0.2, 0.05), bg: 'lv21_plaque', tint: ACCENT[acc], pad: 0.06 });
    if (open) {
      carve(a0 + 2, 0, a0 + 3, 1, { floor: 0, ceil: DH, fmat: M.lv21_carpet, cmat: M.lv21_ceil, wmat: wall });
      carve(a0, 1, a0 + 5, 7, { floor: 0, ceil: RH, fmat: M.lv21_carpet, cmat: M.lv21_ceil, wmat: wall });
      room(Z, zp, prop, a0, text, acc, hr(zi * 64 + Math.floor(du), zj * 64 + Math.floor(dv), 321) < 0.5, rotk);
    } else {
      prop('lv21_door', a0 + 2.5, 0.0, 0, 0, {});
    }
  }
  // the blank stretch: a giant numeral and sometimes a recess with a door out of here
  const sc = zp(22, 0);
  if (!inLobby(Math.floor(sc[0]), Math.floor(sc[1]))) {
    const text = withCommas(bigNumber(Z.x(sc[0]), Z.z(sc[1]), 9 + k));
    prop('g01_num', 22.0, 0.0, 0.85, 0, { text, h: fit(text, 5.4, 1.15, 0.2), tint: ACCENT[acc] });
  }
  if (alcove && !lobby) {
    carve(25, 0, 28, 2, { floor: 0, ceil: RH, fmat: M.lv21_carpet, cmat: M.lv21_ceil, wmat: wall });
    bx(24.9, 0, -0.07, 25, DH + 0.5, 0, frame, { collide: false });
    bx(28, 0, -0.07, 28.1, DH + 0.5, 0, frame, { collide: false });
    bx(24.9, DH + 0.4, -0.07, 28.1, DH + 0.5, 0, frame, { collide: false });
    const [u, v] = zp(26.5, 1.45);
    levelDoor(Z.zb, Z.x(u), Z.z(v), rotk, {});
    const [lu, lv] = zp(26.5, 0.6);
    Z.light(lu, 2.2, lv, { color: [1.0, 0.86, 0.62], rad: 5, int: 0.6 });
  }
}

// a plain room: bed, desk, wardrobe, television; its number again over the bed
function room(Z, zp, prop, a0, text, acc, mirror, rotk) {
  const m = (ra) => (mirror ? 5 - ra : ra);
  const east = mirror ? -Math.PI / 2 : Math.PI / 2, west = mirror ? Math.PI / 2 : -Math.PI / 2;
  const P = (type, ra, rb, y, rot, o) => prop(type, a0 + m(ra), 1 + rb, y, rot, o);
  P('lv21_bed', 2.5, 4.9, 0, 0);
  P('lv21_nightstand', 0.55, 5.5, 0, 0);
  P('lv21_nightstand', 4.45, 5.5, 0, 0);
  P('lamp_desk', 0.55, 5.5, 0.52, 0, {});
  P('desk', 0.5, 2.2, 0, east, {});
  P('chair_office', 1.45, 2.2, 0, west, {});
  P('lv21_wardrobe', 4.65, 1.4, 0, west);
  P('tv', 4.62, 3.4, 0, west, { screen: 'off' });
  prop('g01_num', a0 + 2.5, 6.98, 1.7, Math.PI, { text, h: fit(text, 3.4, 0.4, 0.06), tint: ACCENT[acc] });
  const [u, v] = zp(a0 + 2.5, 4);
  ceilingLight(Z.zb, Z.x(u), Z.z(v), 'panel', 'on', { color: COOL, mul: 0.9, rad: 6 });
  void rotk;
}

// ------------------------------------------------------------------ the lobby
function lobbyHall(Z) {
  const zb = Z.zb;
  const [u0, v0, u1, v1] = LOB;
  // neutral rim around the hall (corridor mouths stay open)
  Z.each(u0 - 1, v0 - 1, u1 + 1, v1 + 1, (u, v, i) => { if (zb.solid[i]) zb.solid[i] = M.lv21_wall_0; });
  Z.carve(u0, v0, u1, v1, { floor: 0, ceil: LH, fmat: M.lv21_terrazzo, cmat: M.lv21_ceil, wmat: M.lv21_wall_0 });
  Z.floorMat(21, 21, 46, 46, (u, v) => (u >= 32 && u < 35) || (v >= 32 && v < 35) ? M.lv21_terrazzo : M.lv21_carpet);
  const c = CX;
  // columns
  for (const du of [-10.5, -3.5, 3.5, 10.5]) for (const dv of [-10.5, -3.5, 3.5, 10.5]) {
    if (Math.abs(du) < 5 && Math.abs(dv) < 5) continue;
    Z.box(c + du - 0.45, 0, c + dv - 0.45, c + du + 0.45, LH, c + dv + 0.45, M.lv21_col);
    Z.box(c + du - 0.5, 0, c + dv - 0.5, c + du + 0.5, 0.15, c + dv + 0.5, M.lv21_plain_dark);
  }
  // ceiling lights
  for (const du of [-10.5, -3.5, 3.5, 10.5]) for (const dv of [-10.5, -3.5, 3.5, 10.5]) ceilingLight(zb, Z.x(c + du + 1.75), Z.z(c + dv + 1.75), 'panel', 'on', { color: COOL, rad: 8, int: 1.1 });
  // the directory: a wall-sized board on the north wall, left of the corridor mouth
  Z.prop('lv21_dirboard', 25.5, 0.3, v0, face(0, 1), { t: 2.0 });
  // the giant zero in the floor, the empty reception desk and its key rack on the east side
  Z.prop('g01_num', 41.0, 0.9, v0, face(0, 1), { text: '0', h: 4.6, tint: ACCENT[0] });
  Z.prop('reception_desk', 40.2, 0, 31, face(-1, 0), { tint: [0.6, 0.72, 1.0] });
  Z.box(43.4, 0.2, c - 6 + 0.5, 43.6, 2.7, c + 6 - 0.5, [M.lv21_steel, M.lv21_keys, M.lv21_steel, M.lv21_steel, M.lv21_steel, M.lv21_steel], { uv: ['world', [0, 0, 6, 2.5], 'world', 'world', 'world', 'world'] });
  for (const [u, v, r] of [[22, 46.2, face(0, -1)], [32, 46.2, face(0, -1)], [21.2, 30, face(1, 0)], [45.8, 41, face(-1, 0)]]) Z.prop('bench', u, 0, v, r, { len: 1.8 });
  // a door at the east wall
  levelDoor(zb, Z.x(46.9), Z.z(23.5), face(-1, 0), {});
  Z.light(45.8, 2.0, 23.5, { color: [1.0, 0.86, 0.62], rad: 5, int: 0.6 });
}

// ------------------------------------------------------------------ the zone type and level
defineZone('lv21_hotel', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.38, 0.42, 0.47],
    env: env({ fog: [0.44, 0.5, 0.56], fogNear: 7, fogFar: 56, hum: 0.7, hvac: 0.5, reverb: 'corridor', tone: 'lv21_air' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'NUMBERED HOTEL',
  zoneType: 'lv21_hotel',
  zoneSize: G,
  entry: { x: 26.5, y: 0, z: 46.5, yaw: 0, pitch: 0 },
  doorDensity: 0,
  viewRadius: 3,
  light: { phoneRadius: 3.6, phoneIntensity: 0.22 },
  script(ctx, dt) {
    const s = ctx.state;
    // a three-note chime from a speaker a long way off, never followed by anything
    s.chime = (s.chime ?? 35) - dt;
    if (s.chime < 0) {
      s.chime = 55 + Math.random() * 80;
      const p = ctx.player, a = Math.random() * 6.28;
      ctx.game.audioCall('play', 'lv21_chime', p.x + Math.sin(a) * 24, p.y + 2.5, p.z - Math.cos(a) * 24, { distant: true, vol: 0.7 });
    }
  },
});
