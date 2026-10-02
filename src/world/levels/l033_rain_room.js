// Level 33: The Rain Room. A whole quarter of apartment towers under one colossal concrete roof,
// and it rains inside: dark wet streets between sixteen-metre facades of glowing windows, sodium
// lamps, puddles, water pouring down the towers. The rain grows heavier when you run and when you
// stand near a way out.
import { defineZone } from '../zonetypes.js';
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { LEVEL_ZONE, defineLevel, env, M, hr, levelDoor, water, poleLamp, ceilingLight } from './kit.js';
import { Loc, face, clamp } from './g01_kit.js';

const N = 33;
const G = 64, CH = 11, LH = 6.4;
const TOW = [6, 38];               // tower starts (20 wide) inside a zone; streets everywhere else
const SODIUM = [1.0, 0.68, 0.34], MERCURY = [0.62, 0.8, 1.0];
const T = defineTexture;

// ------------------------------------------------------------------ textures
// facade: a 4 x 4 grid of windows per tile (12 m); self-lit, so the windows glow and the wall is dark
function facade(p, litP) {
  p.fill([22, 24, 30]);
  p.noise(8, 0.12, 2);
  const r = p.rng;
  for (let ry = 0; ry < 4; ry++) for (let cx = 0; cx < 4; cx++) {
    const x0 = cx * 16, y0 = ry * 16;
    p.rect(x0, y0 + 14, 16, 2, [62, 64, 72]);
    p.rect(x0 + 1, y0 + 12, 14, 1, [38, 40, 46]);
    const u = r.next();
    let col = [12, 16, 24];
    if (u < litP) col = u < litP * 0.12 ? [140, 178, 255] : u < litP * 0.5 ? [255, 200, 100] : [236, 150, 64];
    p.rect(x0 + 3, y0 + 3, 10, 8, col);
    if (col[0] > 100) { p.rect(x0 + 3, y0 + 3, 10, 2, [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8]); if (r.chance(0.4)) p.rect(x0 + 3, y0 + 3, 5, 8, [col[0] * 0.6, col[1] * 0.55, col[2] * 0.5]); }
    p.rect(x0 + 8, y0 + 3, 1, 8, [30, 30, 36]);
    p.rect(x0 + 2, y0 + 2, 12, 1, [48, 50, 56]);
  }
}
T('lv33_facade_a', (p) => facade(p, 0.46), 14);
T('lv33_facade_b', (p) => facade(p, 0.32), 14);
T('lv33_facade_c', (p) => facade(p, 0.6), 14);
T('lv33_conc', (p) => {
  p.fill([74, 78, 82]); p.noise(5, 0.1, 3); p.grain(0.06);
  for (let i = 0; i < 6; i++) p.drip(p.rng.int(0, 63), 0, p.rng.int(20, 60), [40, 46, 52], 0.35, 2);
  p.stain(32, 40, 18, [52, 60, 56], 0.3);
}, 12);
T('lv33_wet', (p) => {
  p.fill([46, 50, 56]);
  p.noise(5, 0.1, 3);
  p.map((x, y, c) => { const v = pnoise(x, y, 6, 7), w = pnoise(x * 2, y * 0.6, 8, 3); const k = v > 0.7 ? 1.3 : 1; return [c[0] * k * (0.9 + w * 0.2), c[1] * k * (0.9 + w * 0.2), c[2] * k * 1.02]; });
  for (let i = 0; i < 10; i++) p.rect(p.rng.int(0, 60), p.rng.int(0, 63), p.rng.int(3, 9), 1, [112, 124, 136], 0.5);
  p.grain(0.05);
}, 12);
T('lv33_ceil', (p) => {
  p.fill([40, 42, 46]); p.noise(6, 0.1, 3);
  p.rect(0, 0, 64, 6, [30, 32, 36]); p.rect(0, 0, 6, 64, [30, 32, 36]);
  p.rect(0, 6, 64, 1, [60, 62, 68], 0.8); p.rect(6, 0, 1, 64, [60, 62, 68], 0.8);
  for (let i = 0; i < 5; i++) p.stain(p.rng.int(8, 60), p.rng.int(8, 60), 6, [24, 28, 28], 0.4);
  p.grain(0.05);
}, 10);
T('lv33_lobby', (p) => {
  p.fill([46, 80, 76]); p.noise(6, 0.08, 2);
  for (let k = 0; k < 64; k += 16) { p.rect(0, k, 64, 1, [24, 44, 42]); p.rect(k, 0, 1, 64, [24, 44, 42]); }
  p.grain(0.05);
}, 8);
T('lv33_wall', (p) => {
  p.fill([128, 150, 138]); p.noise(4, 0.07, 3);
  p.rect(0, 40, 64, 24, [60, 90, 84]); p.rect(0, 39, 64, 1, [30, 50, 46]);
  for (let i = 0; i < 5; i++) p.drip(p.rng.int(0, 63), 0, p.rng.int(20, 50), [70, 84, 74], 0.4, 2);
  p.grain(0.05);
}, 12);
T('lv33_puddle', (p) => {
  p.fill([30, 42, 58]);
  p.map((x, y, c) => { const n = pnoise(x, y * 2, 16, 4) * 0.6 + pnoise(x * 2, y, 8, 9) * 0.4; return [c[0] + n * 34, c[1] + n * 44, c[2] + n * 58]; });
  for (let i = 0; i < 22; i++) p.rect(p.rng.int(0, 60), p.rng.int(0, 63), p.rng.int(2, 9), 1, [190, 208, 226], 0.7);
}, 8);
// four frames of falling water: streaks with gaps
for (let f = 0; f < 4; f++) {
  T('lv33_fall' + f, (p) => {
    p.fill([170, 196, 214]);
    p.clearAlpha(0);
    const r = p.rng;
    for (let x = 0; x < 64; x += 2) {
      const len = 22 + ((x * 7 + 3) % 30), y0 = (((x * 13) % 64) + f * 16 + (x % 3) * 9) % 64;
      for (let k = 0; k < len; k++) { const yy = (y0 + k) % 64; p.set(x, yy, k < 3 ? [230, 240, 248] : [150, 178, 200]); p.alpha(x, yy, 255); if (r.chance(0.5)) { p.set(x + 1, yy, [190, 212, 226]); p.alpha(x + 1, yy, 255); } }
    }
  }, 6);
}
T('lv33_pole', (p) => { p.fill([40, 44, 48]); p.noise(4, 0.1, 2); }, 4);
for (const k of ['a', 'b', 'c']) defineMaterial('lv33_facade_' + k, 'lv33_facade_' + k, { s: 12, flags: VF.FULLBRIGHT, glow: 0.95, surf: 'concrete' });
defineMaterial('lv33_conc', 'lv33_conc', { s: 3, surf: 'concrete', stain: 0.1 });
defineMaterial('lv33_wet', 'lv33_wet', { s: 3, surf: 'wet', stain: 0.06 });
defineMaterial('lv33_ceil', 'lv33_ceil', { s: 8, surf: 'concrete' });
defineMaterial('lv33_lobby', 'lv33_lobby', { s: 2, surf: 'wet' });
defineMaterial('lv33_wall', 'lv33_wall', { s: 2, surf: 'drywall', stain: 0.1 });
defineMaterial('lv33_puddle', 'lv33_puddle', { s: 2, surf: 'water', flags: VF.WOBBLE | VF.SCROLL });
for (let f = 1; f < 4; f++) defineMaterial('lv33_fall' + f, 'lv33_fall' + f, { s: 4 });
defineMaterial('lv33_fall', 'lv33_fall0', { s: 4, flags: VF.FULLBRIGHT | VF.ANIM, glow: 0.85, surf: 'water', frames: 4 });

// the animation needs all four frames uploaded: a speck of each in the same chunk
function fallFrames(Z, u, v) {
  for (let f = 1; f < 4; f++) Z.box(u + f * 0.2, CH - 0.05, v, u + f * 0.2 + 0.05, CH, v + 0.05, M['lv33_fall' + f], { collide: false });
}

// ------------------------------------------------------------------ the zone
const isTower = (u, v) => ((u >= 6 && u < 26) || (u >= 38 && u < 58)) && ((v >= 6 && v < 26) || (v >= 38 && v < 58));
const SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function gen(zb) {
  zb.noConnectivity = true;
  const Z = new Loc(zb);
  const zi = Math.floor(zb.x0 / G), zj = Math.floor(zb.z0 / G);
  const R = (a, b = 0, c = 0) => hr(zi * 997 + a, zj * 991 + b, 3300 + c);
  Z.each(0, 0, G, G, (u, v, i) => {
    zb.floor[i] = 0; zb.ceil[i] = CH; zb.fmat[i] = M.lv33_wet; zb.cmat[i] = M.lv33_ceil; zb.wmat[i] = M.lv33_conc; zb.solid[i] = 0; zb.flags[i] = 0;
  });
  // streets: lamps on the tower faces, hanging flood lamps, puddles
  const towers = [];
  for (let ti = 0; ti < 2; ti++) for (let tj = 0; tj < 2; tj++) towers.push([TOW[ti], TOW[tj], ti, tj]);
  const plaza = zi === 0 && zj === 0;
  if (!plaza) for (const [tu, tv, ti, tj] of towers) tower(Z, zb, zi, zj, tu, tv, ti, tj, R);
  else greatPlaza(Z, zb, R);
  for (let k = 0; k < 8; k++) for (let m = 0; m < 8; m++) {
    const u = k * 8, v = m * 8;
    if ((u % 32 !== 0 && v % 32 !== 0)) continue;
    if (!plaza && isTower(u, v)) continue;
    if (plaza && u >= 6 && u < 58 && v >= 6 && v < 58) continue;
    zb.fixture(Z.x(u), Z.z(v), 'highbay', true, { y: CH, hang: 1.6 });
    Z.light(u, CH - 2.4, v, { color: [1.0, 0.78, 0.5], rad: 10, int: 0.8, ch: R(40 + k, m, 1) < 0.1 ? 3 : 0 });
  }
  // puddles
  for (let k = 0; k < 16; k++) {
    const u0 = Math.floor(R(60 + k, 1) * 58), v0 = Math.floor(R(61 + k, 2) * 58), w = 2 + Math.floor(R(62 + k, 3) * 4), d = 2 + Math.floor(R(63 + k, 4) * 4);
    if (plaza && u0 > 4 && u0 < 58 && v0 > 4 && v0 < 58) continue;
    if (isTower(u0 - 1, v0 - 1) || isTower(u0 + w + 1, v0 + d + 1) || isTower(u0 - 1, v0 + d + 1) || isTower(u0 + w + 1, v0 - 1)) continue;
    water(zb, Z.x(u0), Z.z(v0), Z.x(u0 + w), Z.z(v0 + d), 0.03, M.lv33_puddle, 0.55);
  }
  // ambient sounds: the downpour on the roof is the room tone; pouring water by the falls is placed at them
}

// the great plaza of the origin zone: no towers, a roof twice as high, a sunken pool you can wade
// and a curtain of water pouring from the roof into it
function greatPlaza(Z, zb, R) {
  const PH = 18;
  Z.heights(6, 6, 58, 58, 0, PH);
  Z.each(16, 18, 48, 46, (u, v, i) => { zb.floor[i] = -0.4; });
  water(zb, Z.x(16), Z.z(18), Z.x(48), Z.z(46), -0.05, M.lv33_puddle, 0.72);
  // the curtain
  Z.box(16, 0, 21, 48, PH - 0.4, 21.3, M.lv33_fall, { collide: false, skip: 15 });
  for (const u of [18, 30, 42]) fallFrames(Z, u, 21.1);
  for (const u of [20, 32, 44]) Z.light(u, 2.4, 22.6, { color: [0.62, 0.78, 1.0], rad: 11, int: 0.9 });
  for (const u of [24, 40]) Z.light(u, 6, 19.5, { color: [0.62, 0.78, 1.0], rad: 11, int: 0.6 });
  Z.emitter(32, 3, 21, 'lv33_fall', { vol: 1.0, rad: 30 });
  // columns holding up the roof
  for (const u of [8, 24, 40, 56]) for (const v of [8, 24, 40, 56]) {
    if (u > 14 && u < 50 && v > 16 && v < 48) continue;
    Z.box(u - 0.6, 0, v - 0.6, u + 0.6, PH, v + 0.6, M.lv33_conc);
    Z.light(u, 4.5, v, { color: SODIUM, rad: 10, int: 0.8 });
  }
  // lamps along the rim of the pool
  for (const t of [16, 24, 40, 48]) for (const [px, pz, ax] of [[t, 16.3, 0], [t, 47.7, 0], [14.3, t, 0.8], [49.7, t, -0.8]]) {
    if ((t === 16 || t === 48) && (px === 14.3 || px === 49.7)) continue;
    poleLamp(zb, Z.x(px), Z.z(pz), 4.4, { y: 0, armX: ax, arm: ax !== 0, color: R(t, px, 33) < 0.35 ? MERCURY : SODIUM, rad: 11, int: 1.0 });
  }
  for (const [u, v, r] of [[26, 52, 0], [38, 52, 0], [10, 32, Math.PI / 2], [54, 32, -Math.PI / 2]]) Z.prop('bench', u, 0, v, r, { len: 1.8 });
  levelDoor(zb, Z.x(52.5), Z.z(46.5), face(-1, 0), {});
  Z.light(51.0, 2.4, 46.5, { color: [1.0, 0.86, 0.62], rad: 5, int: 0.6 });
}

function tower(Z, zb, zi, zj, tu, tv, ti, tj, R) {
  const key = (ti + 2 * tj) * 11;
  const fac = M['lv33_facade_' + 'abc'[Math.floor(R(key, 1, 5) * 3)]];
  Z.solid(tu, tv, tu + 20, tv + 20, fac);
  // lamps along the four faces, arms reaching into the street
  SIDES.forEach(([dx, dz], s) => {
    for (const t of [1.5, 18.5]) {
      const px = dz === 0 ? (dx > 0 ? tu + 20 + 0.6 : tu - 0.6) : tu + t;
      const pz = dx === 0 ? (dz > 0 ? tv + 20 + 0.6 : tv - 0.6) : tv + t;
      poleLamp(zb, Z.x(px), Z.z(pz), 4.6, { y: 0, armX: dx > 0 ? 0.8 : dx < 0 ? -0.8 : 0.0, arm: dx !== 0, color: R(key + s, t, 6) < 0.3 ? MERCURY : SODIUM, rad: 10, int: 0.9, ch: R(key + s, t, 7) < 0.08 ? 3 : 0 });
    }
  });
  // street furniture
  SIDES.forEach(([dx, dz], s) => {
    if (R(key + s, 20, 21) < 0.5) {
      const t = 6 + Math.floor(R(key + s, 21, 22) * 8);
      const px = dz === 0 ? (dx > 0 ? tu + 20.7 : tu - 0.7) : tu + t;
      const pz = dx === 0 ? (dz > 0 ? tv + 20.7 : tv - 0.7) : tv + t;
      const kind = Math.floor(R(key + s, 22, 23) * 3);
      Z.prop(kind === 0 ? 'bench' : kind === 1 ? 'trash_can' : 'traffic_cone', px, 0, pz, face(dx, dz), { len: 1.6 });
    }
  });
  // an entrance hall on one face
  const sideIdx = Math.floor(R(key, 2, 8) * 4);
  const hasLobby = R(key, 3, 9) < 0.7;
  const [dx, dz] = SIDES[sideIdx];
  if (hasLobby) {
    const c0 = 8 + Math.floor(R(key, 4, 10) * 5);          // along the face
    const wid = 5, dep = 7;
    // cells of the hall in tower-local (a along the face, b into the tower)
    const mapc = (a, b) => (dz === -1 ? [tu + a, tv + b] : dz === 1 ? [tu + a, tv + 19 - b] : dx === 1 ? [tu + 19 - b, tv + a] : [tu + b, tv + a]);
    const rect = (a0, b0, a1, b1) => { const p = mapc(a0, b0), q = mapc(a1 - 1, b1 - 1); return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]) + 1, Math.max(p[1], q[1]) + 1]; };
    // concrete surround
    const [su0, sv0, su1, sv1] = rect(c0 - 2, 0, c0 + wid + 2, dep + 2);
    Z.each(su0, sv0, su1, sv1, (u, v, i) => { zb.solid[i] = M.lv33_conc; });
    const [hu0, hv0, hu1, hv1] = rect(c0, 0, c0 + wid, dep);
    Z.carve(hu0, hv0, hu1, hv1, { floor: 0, ceil: LH, fmat: M.lv33_lobby, cmat: M.lv33_ceil, wmat: M.lv33_wall });
    // fittings: the hall is open to the weather like the street
    const pt = (a, b) => { const p = mapc(a, b); return [p[0] + 0.5, p[1] + 0.5]; };
    const rotIn = face(-dx, -dz), rotOut = face(dx, dz);
    const P = (type, a, b, y, rot, o) => { const [u, v] = pt(a, b); Z.prop(type, u, y, v, rot, o || {}); };
    P('mailbox', c0 + 0.1, 3.0, 0, face(dz, -dx), {});
    P('mailbox', c0 + 0.1, 4.5, 0, face(dz, -dx), {});
    P('bench', c0 + wid - 0.7, 3.0, 0, face(-dz, dx), { len: 1.4 });
    P('wet_sign', c0 + 1.5, 1.6, 0, rotOut, {});
    const [lu, lv] = pt(c0 + 2.0, 3.0);
    ceilingLight(zb, Z.x(lu), Z.z(lv), 'bulb', R(key, 5, 11) < 0.4 ? 'dying' : 'on', { y: LH, color: [0.8, 1.0, 0.9], rad: 7, int: 0.8 });
    if (R(key, 6, 12) < 0.55 && !(zi === 0 && zj === 0 && ti === 0 && tj === 0)) {
      const [du, dv] = pt(c0 + 2.0, dep - 1.1);
      levelDoor(zb, Z.x(du), Z.z(dv), rotOut, {});
      Z.light(du + dx * 1.2, 2.4, dv + dz * 1.2, { color: [1.0, 0.86, 0.62], rad: 5, int: 0.6 });
    }
    void rotIn;
  }
  // water pouring down one face (never the face with the entrance)
  if (R(key, 7, 13) < 0.5) {
    let s2 = (sideIdx + 1 + Math.floor(R(key, 8, 14) * 3)) % 4;
    const [fx, fz] = SIDES[s2];
    const w = 8, c = 6 + Math.floor(R(key, 9, 15) * 6);
    if (fz !== 0) {
      const z0 = fz < 0 ? tv - 0.12 : tv + 20, z1 = fz < 0 ? tv : tv + 20.12;
      Z.box(tu + c, 0.2, z0, tu + c + w, CH - 0.3, z1, M.lv33_fall, { collide: false, skip: 63 & ~(fz < 0 ? 32 : 16) });
      Z.emitter(tu + c + w / 2, 2, fz < 0 ? tv - 0.6 : tv + 20.6, 'lv33_fall', { vol: 0.9, rad: 16 });
      fallFrames(Z, tu + c + 1, tv + 1);
    } else {
      const x0 = fx < 0 ? tu - 0.12 : tu + 20, x1 = fx < 0 ? tu : tu + 20.12;
      Z.box(x0, 0.2, tv + c, x1, CH - 0.3, tv + c + w, M.lv33_fall, { collide: false, skip: 63 & ~(fx < 0 ? 2 : 1) });
      Z.emitter(fx < 0 ? tu - 0.6 : tu + 20.6, 2, tv + c + w / 2, 'lv33_fall', { vol: 0.9, rad: 16 });
      fallFrames(Z, tu + 1, tv + c + 1);
    }
  }
}

// ------------------------------------------------------------------ the zone type and level
const RAIN = { kind: 'rain', amount: 0.62, color: [0.66, 0.72, 0.82, 0.5], fall: 11, wind: [0.4, 0.1], size: 0.013, len: 0.55, indoor: true };
defineZone('lv33_rain', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.19, 0.22, 0.27],
    env: env({ fog: [0.1, 0.12, 0.16], fogNear: 5, fogFar: 54, hum: 0, hvac: 0, reverb: 'hall', tone: 'lv33_rain' }),
    weather: RAIN,
  }),
  gen,
});

defineLevel(N, {
  name: 'THE RAIN ROOM',
  zoneType: 'lv33_rain',
  zoneSize: G,
  entry: { x: 32.5, y: 0, z: 54.5, yaw: 0, pitch: 0 },
  doorDensity: 0.45,
  viewRadius: 3,
  weather: RAIN,
  light: { phoneRadius: 4, phoneIntensity: 0.25 },
  script(ctx, dt) {
    const s = ctx.state, g = ctx.game, p = ctx.player;
    const look = g.look || (g.look = {});
    const speed = Math.hypot(p.vx || 0, p.vz || 0);
    const near = g.nav && g.nav.nearest && g.nav.nearest.dist < 9;
    const want = clamp(0.58 + (speed > 2.2 ? 0.42 : 0) + (near ? 0.36 : 0), 0.4, 1);
    s.amt = (s.amt ?? 0.62) + (want - (s.amt ?? 0.62)) * Math.min(1, dt * (want > (s.amt ?? 0.62) ? 1.2 : 0.35));
    look.weather = { ...RAIN, amount: s.amt, wind: [0.4 + s.amt * 0.5, 0.1] };
    // the downpour on the roof gets louder with it
    look.tone = s.amt > 0.85 ? 'lv33_heavy' : 'lv33_rain';
    // thunder, far across the hall
    s.thunder = (s.thunder ?? 25) - dt;
    if (s.thunder < 0) {
      s.thunder = 40 + Math.random() * 70;
      const a = Math.random() * 6.28;
      g.audioCall('play', 'lv33_thunder', p.x + Math.sin(a) * 30, p.y + 8, p.z - Math.cos(a) * 30, { distant: true, vol: 0.9 });
    }
  },
});
