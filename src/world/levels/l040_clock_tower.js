// Level 40: THE CLOCK TOWER. The inside of a clock tower without an outside: wide iron streets under
// low ceilings, pierced by wells forty metres across. Down in each well the face of a clock lies
// like a glowing floor, its hands sweeping at a speed of their own; between the dials gears the size
// of rooms turn on axles. Stairs climb to the next street, and the next, and the next.
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial, VF } from '../materials.js';
import { defineProp, propMat as S, propTex as T, propWithXf as withXf } from '../props.js';
import { xfRotY } from '../../core/math.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, hr, levelDoor, env, M, CF, ceilingLight, FACE, only } from './kit.js';

const N = 40;
const B = 64;
const WX0 = 10, WX1 = 54;            // the well, in zone coordinates
const STORY = 6;
const FLIGHTS = [
  { x0: 14, z0: 3, x1: 36, z1: 7, dir: '+x' },
  { x0: 57, z0: 14, x1: 61, z1: 36, dir: '+z' },
  { x0: 28, z0: 57, x1: 50, z1: 61, dir: '-x' },
  { x0: 3, z0: 28, x1: 7, z1: 50, dir: '-z' },
];
const flightOf = (i, j, s) => FLIGHTS[(((s + (i === 0 && j === 0 ? 0 : Math.floor(hr(i, j, 1001) * 4))) % 4) + 4) % 4];
const mod = (a, n) => ((a % n) + n) % n;

// ---------------------------------------------------------------- textures
defineTexture('lv40_floor', (p, r) => {
  p.fill([62, 52, 44]);
  p.noise(5, 0.12, 3);
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    p.frame(tx * 32, ty * 32, 32, 32, [30, 24, 20]);
    for (const [dx, dy] of [[3, 3], [28, 3], [3, 28], [28, 28]]) p.disc(tx * 32 + dx, ty * 32 + dy, 1.6, [110, 92, 70]);
  }
  p.stain(r.int(10, 54), r.int(10, 54), 10, [100, 56, 24], 0.5);
  p.speckle(40, [120, 100, 80], 0.3, 0.6);
}, 12);
defineTexture('lv40_ceil', (p) => {
  p.fill([44, 36, 32]);
  p.noise(4, 0.1, 2);
  for (let k = 0; k < 64; k += 16) { p.rect(0, k, 64, 2, [26, 20, 18]); p.rect(k, 0, 2, 64, [26, 20, 18]); }
  for (let y = 4; y < 64; y += 16) for (let x = 4; x < 64; x += 16) p.disc(x, y, 1.2, [100, 84, 64]);
}, 8);
defineTexture('lv40_column', (p) => {
  p.fill([88, 70, 52]);
  p.noise(5, 0.1, 2);
  for (const y of [4, 28, 52]) { p.rect(0, y, 64, 6, [176, 134, 56]); p.rect(0, y + 2, 64, 1, [220, 176, 84]); for (let x = 4; x < 64; x += 8) p.disc(x, y + 3, 1.1, [60, 44, 24]); }
  for (let x = 0; x < 64; x += 16) p.rect(x, 0, 1, 64, [50, 38, 28], 0.6);
}, 12);
defineTexture('lv40_brass', (p, r) => {
  p.fill([176, 132, 56]);
  p.noise(4, 0.14, 3);
  p.speckle(60, [224, 184, 96], 0.4, 0.8);
  p.speckle(40, [90, 62, 24], 0.4, 0.8);
  p.stain(r.int(10, 54), r.int(10, 54), 10, [110, 80, 34], 0.4);
}, 10);
defineTexture('lv40_iron', (p) => {
  p.fill([54, 48, 46]);
  p.noise(4, 0.14, 3);
  for (let x = 6; x < 64; x += 12) { p.disc(x, 8, 1.3, [100, 84, 66]); p.disc(x, 56, 1.3, [100, 84, 66]); }
  p.rect(0, 0, 64, 3, [80, 70, 62]);
  p.speckle(30, [120, 60, 28], 0.4, 0.8);
}, 8);
defineTexture('lv40_beam', (p) => {
  p.fill([46, 40, 38]);
  p.noise(4, 0.12, 2);
  p.rect(0, 0, 64, 4, [86, 74, 62]); p.rect(0, 60, 64, 4, [30, 26, 24]);
  for (let x = 4; x < 64; x += 8) { p.disc(x, 12, 1.3, [100, 84, 64]); p.disc(x, 52, 1.3, [100, 84, 64]); }
}, 8);
// the face of a clock seen from above, lit from behind: amber glass, a ring of numerals, minute ticks
defineTexture('lv40_dial', (p, r) => {
  const ROM = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  p.map((x, y) => {
    const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32);
    if (d > 31) return [120, 74, 28];
    const k = 1 - Math.min(1, d / 31) * 0.45;
    return [255 * k, 168 * k + 20, 56 * k];
  });
  for (let d = 0; d < 360; d += 6) {
    const a = (d * Math.PI) / 180, big = d % 30 === 0;
    for (let q = big ? 26.5 : 28; q < 30.5; q += 0.5) p.set(Math.round(32 + Math.sin(a) * q), Math.round(32 - Math.cos(a) * q), [60, 28, 8]);
  }
  p.ring(32, 32, 31, 1.2, [60, 28, 8]); p.ring(32, 32, 17.5, 1, [90, 46, 14]);
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6, cx = 32 + Math.sin(a) * 22.5, cy = 32 - Math.cos(a) * 22.5, w = ROM[k].length * 6 - 1;
    p.text(ROM[k], Math.round(cx - w / 2), Math.round(cy - 3), [60, 26, 6], 1);
  }
  p.disc(32, 32, 3.5, [90, 46, 14]); p.disc(32, 32, 1.6, [255, 214, 120]);
  void r;
}, 16);
defineTexture('lv40_gear', (p) => {
  p.fill([180, 134, 58]);
  p.noise(5, 0.14, 3);
  p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const dx = x + 0.5 - 32, dy = y + 0.5 - 32, d = Math.hypot(dx, dy);
    let solid = d < 6.5 || (d > 27 && d < 31.5);
    if (!solid && d >= 6.5 && d <= 27) { const a = Math.atan2(dy, dx); const q = Math.abs(((a / (Math.PI / 3)) % 1 + 1) % 1); solid = Math.min(q, 1 - q) * d * 1.05 < 1.8; }
    if (solid) { p.alpha(x, y, 255); if (d > 27) p.set(x, y, [150, 108, 42]); }
  }
}, 12);
defineTexture('lv40_hand', (p) => { p.fill([34, 26, 22]); p.noise(3, 0.2, 2); p.rect(0, 0, 64, 3, [70, 52, 40]); }, 4);
defineTexture('lv40_glow', (p) => { p.fill([255, 214, 140]); p.disc(32, 32, 24, [255, 240, 200]); }, 4);

// ---------------------------------------------------------------- materials
defineMaterial('lv40_floor', 'lv40_floor', { s: 4, surf: 'metal' });
defineMaterial('lv40_ceil', 'lv40_ceil', { s: 4, surf: 'metal' });
defineMaterial('lv40_column', 'lv40_column', { su: 1.6, sv: 6, surf: 'metal' });
defineMaterial('lv40_brass', 'lv40_brass', { s: 2, surf: 'metal' });
defineMaterial('lv40_iron', 'lv40_iron', { s: 2, surf: 'metal' });
defineMaterial('lv40_beam', 'lv40_beam', { s: 2, surf: 'metal' });
defineMaterial('lv40_dial', 'lv40_dial', { s: 44, surf: 'metal', flags: VF.FULLBRIGHT, glow: 1.1 });
defineMaterial('lv40_hand', 'lv40_hand', { s: 4, surf: 'metal' });
defineMaterial('lv40_glow', 'lv40_glow', { s: 1, flags: VF.FULLBRIGHT, glow: 1.2 });

// ---------------------------------------------------------------- props
defineProp('lv40_gear', {
  build(mb, p) {
    const R = p.opts.r, th = 0.55, teeth = p.opts.teeth || Math.round(R * 2.4);
    const brass = S('lv40_brass'), iron = S('lv40_iron'), top = T('lv40_gear', { lit: true });
    mb.cyl(0, 0, 0, R, th, Math.min(24, Math.max(12, teeth)), brass, 3, top);
    const tw = (Math.PI * 2 * R) / teeth * 0.45;
    for (let k = 0; k < teeth; k++) {
      withXf(mb, xfRotY((k / teeth) * Math.PI * 2), () => mb.box(-tw / 2, 0.04, -R - 0.75, tw / 2, th - 0.04, -R + 0.15, brass));
    }
    mb.cyl(0, -0.15, 0, 0.55, th + 0.3, 6, iron, 3);
  },
});
// a hand of a clock: lies flat above the dial and turns about the pivot at the origin
defineProp('lv40_hand', {
  build(mb, p) {
    const L = p.opts.len, w = p.opts.w, st = S('lv40_hand'), y = p.opts.y || 0.3;
    mb.box(-w / 2, y, -L, w / 2, y + 0.2, 0.18 * L, st);
    mb.box(-w * 1.1, y, -L * 0.62, w * 1.1, y + 0.2, -L * 0.52, st);
    mb.cyl(0, y - 0.1, 0, w * 1.6, 0.4, 8, S('lv40_brass'), 3);
  },
});
// sloped handrail of a flight (balusters on every third tread)
defineProp('lv40_rail', {
  build(mb, p) {
    const L = p.opts.len, rise = p.opts.rise, n = p.opts.n, rail = S('lv40_brass');
    const yAt = (x) => 0.95 + (rise * x) / L;
    mb.rod(-0.05, yAt(-0.05), 0, L + 0.05, yAt(L + 0.05), 0, 0.045, 5, rail, true);
    for (let k = 1; k < n; k += 3) { const x = ((k + 0.5) * L) / n, top = (rise * (k + 1)) / n; mb.rod(x, top, 0, x, yAt(x), 0, 0.02, 4, rail); }
    mb.rod(0.05, 0, 0, 0.05, yAt(0.05), 0, 0.05, 5, rail, true);
    mb.rod(L - 0.05, rise, 0, L - 0.05, yAt(L - 0.05), 0, 0.05, 5, rail, true);
  },
});

// ---------------------------------------------------------------- layout
export const ENTRY = { x: 13.5, y: 6, z: 32.0, yaw: Math.PI / 2, pitch: -0.3 };

function gen(zb) {
  const s = zb.zone.level;
  const bi = Math.floor(zb.x0 / B), bj = Math.floor(zb.z0 / B);
  const ox = bi * B, oz = bj * B;
  zb.noConnectivity = true;
  zb.floor.fill(0); zb.ceil.fill(STORY);
  zb.fmat.fill(M.lv40_floor); zb.cmat.fill(M.lv40_ceil); zb.wmat.fill(M.lv40_iron); zb.flags.fill(0);
  const sm = mod(s, 4);
  const dial = sm === 0;

  // the well: open from top to bottom
  zb.fill(ox + WX0, oz + WX0, ox + WX1, oz + WX1, (x, z, i) => { zb.floor[i] = NaN; zb.ceil[i] = NaN; });
  // this story's flight up (its cells have no ceiling), and the opening in this floor above the flight of the story below
  const F = flightOf(bi, bj, s), Fb = flightOf(bi, bj, s - 1);
  zb.fill(ox + Fb.x0, oz + Fb.z0, ox + Fb.x1, oz + Fb.z1, (x, z, i) => { zb.floor[i] = NaN; });
  zb.fill(ox + F.x0, oz + F.z0, ox + F.x1, oz + F.z1, (x, z, i) => { zb.flags[i] |= CF.STAIRS; zb.floor[i] = 0; zb.ceil[i] = NaN; });

  // the steps: slabs a little thicker than the rise
  const n = 30, alongX = F.dir === '+x' || F.dir === '-x', up = F.dir === '+x' || F.dir === '+z';
  const fx0 = ox + F.x0, fz0 = oz + F.z0, fx1 = ox + F.x1, fz1 = oz + F.z1;
  const run = alongX ? fx1 - fx0 : fz1 - fz0, tread = run / n;
  for (let k = 0; k < n; k++) {
    const a = up ? k * tread : run - (k + 1) * tread, top = (STORY * (k + 1)) / n;
    const back = alongX ? (up ? 1 : 2) : (up ? 16 : 32);
    if (alongX) zb.box(fx0 + a, top - 0.24, fz0, fx0 + a + tread, top, fz1, M.lv40_floor, { sub: 8, skip: back });
    else zb.box(fx0, top - 0.24, fz0 + a, fx1, top, fz0 + a + tread, M.lv40_floor, { sub: 8, skip: back });
    // invisible solid rails on both long sides
    for (const side of [0, 1]) {
      if (alongX) { const zz = side ? fz1 - 0.08 : fz0; zb.box(fx0 + a, top, zz, fx0 + a + tread, top + 0.95, zz + 0.08, M.lv40_brass, { render: false }); }
      else { const xx = side ? fx1 - 0.08 : fx0; zb.box(xx, top, fz0 + a, xx + 0.08, top + 0.95, fz0 + a + tread, M.lv40_brass, { render: false }); }
    }
  }
  const rot = { '+x': 0, '+z': Math.PI / 2, '-x': Math.PI, '-z': -Math.PI / 2 }[F.dir];
  for (const side of [0, 1]) {
    let rx, rz;
    if (alongX) { rz = side ? fz1 - 0.04 : fz0 + 0.04; rx = F.dir === '+x' ? fx0 : fx1; }
    else { rx = side ? fx1 - 0.04 : fx0 + 0.04; rz = F.dir === '+z' ? fz0 : fz1; }
    zb.prop('lv40_rail', rx, 0, rz, rot, { len: run, rise: STORY, n, collide: false });
  }

  // the parapet round the well, with a gap where each girder starts
  const cx = ox + 32, cz = oz + 32;
  const wx0 = ox + WX0, wx1 = ox + WX1, wz0 = oz + WX0, wz1 = oz + WX1;
  const par = (x0, z0, x1, z1) => zb.box(x0, 0, z0, x1, 1.1, z1, M.lv40_column, { sub: 8 });
  const gap = 1.3;
  par(wx0 - 0.6, wz0 - 0.6, cx - gap, wz0); par(cx + gap, wz0 - 0.6, wx1 + 0.6, wz0);
  par(wx0 - 0.6, wz1, cx - gap, wz1 + 0.6); par(cx + gap, wz1, wx1 + 0.6, wz1 + 0.6);
  par(wx0 - 0.6, wz0, wx0, cz - gap); par(wx0 - 0.6, cz + gap, wx0, wz1);
  par(wx1, wz0, wx1 + 0.6, cz - gap); par(wx1, cz + gap, wx1 + 0.6, wz1);
  // brass caps
  for (const [a0, b0, a1, b1] of [[wx0 - 0.7, wz0 - 0.7, wx1 + 0.7, wz0 + 0.1], [wx0 - 0.7, wz1 - 0.1, wx1 + 0.7, wz1 + 0.7], [wx0 - 0.7, wz0, wx0 + 0.1, wz1], [wx1 - 0.1, wz0, wx1 + 0.7, wz1]]) zb.box(a0, 1.1, b0, a1, 1.16, b1, M.lv40_brass, { collide: false, sub: 8 });

  // girders across the well at street level, with a platform where they cross on every fourth story
  zb.box(wx0, -0.45, cz - 0.7, wx1, 0, cz + 0.7, M.lv40_beam, { sub: 8 });
  zb.box(cx - 0.7, -0.45, wz0, cx + 0.7, 0, wz1, M.lv40_beam, { sub: 8, skip: only(FACE.NY, FACE.PX, FACE.NX, FACE.PZ, FACE.NZ) });
  const hub = sm === 2;
  if (hub) zb.box(cx - 2.2, -0.45, cz - 2.2, cx + 2.2, 0.02, cz + 2.2, M.lv40_floor, { sub: 4 });

  if (dial) {
    // the clock face: a glowing floor 1.4 m under the girders, cut along the chunk lines so that every piece carries its part of the picture
    const DY = -1.4, D = WX1 - WX0;
    for (let a = wx0; a < wx1;) {
      const ae = Math.min(wx1, (Math.floor(a / 16) + 1) * 16);
      for (let c = wz0; c < wz1;) {
        const ce = Math.min(wz1, (Math.floor(c / 16) + 1) * 16);
        const rect = [(a - wx0) / D, (c - wz0) / D, (ae - wx0) / D, (ce - wz0) / D];
        zb.box(a, DY - 0.4, c, ae, DY, ce, M.lv40_dial, { uv: ['world', 'world', rect, rect, 'world', 'world'], sub: 4, skip: only(FACE.PY, FACE.NY) });
        c = ce;
      }
      a = ae;
    }
    const k = hr(bi * 5 + 3, bj * 7 + Math.floor(s / 4), 1010);
    const rate = (k < 0.5 ? 1 : -1) * (0.03 + hr(bi, bj + s, 1011) * 0.22);
    zb.dynamic('lv40_hand', cx, DY, cz, hr(bi, bj + s, 1012) * 6.28, { len: 20, w: 0.8, y: 0.35, collide: false }, { spin: rate });
    zb.dynamic('lv40_hand', cx, DY, cz, hr(bi + 1, bj + s, 1013) * 6.28, { len: 12.5, w: 1.5, y: 0.6, collide: false }, { spin: rate / 12 });
    zb.light(cx, 2, cz, { color: [1.0, 0.72, 0.36], rad: 10, int: 0.7 });
    for (const [lx, lz] of [[cx - 14, cz], [cx + 14, cz], [cx, cz - 14], [cx, cz + 14]]) zb.light(lx, 1.5, lz, { color: [1.0, 0.72, 0.36], rad: 10, int: 0.7 });
    zb.emitter(cx, 1, cz, 'lv40_tick_' + 'abc'[Math.floor(hr(bi, bj + Math.floor(s / 4), 1014) * 3)], { vol: 1.0, rad: 28 });
  } else {
    // gears turning in the open well: a great one in the middle, four meshing satellites
    const y0 = 2.6 + sm * 0.45, R0 = 9;
    const spin0 = (hr(bi + s, bj, 1020) < 0.5 ? 1 : -1) * (0.05 + hr(bi, bj + s, 1021) * 0.1);
    zb.dynamic('lv40_gear', cx, y0, cz, 0, { r: R0, teeth: 26, collide: false }, { spin: spin0 });
    const R1 = 5, ratio = R0 / R1, dist = R0 + R1 + 0.3;
    [[cx - dist, cz], [cx + dist, cz], [cx, cz - dist], [cx, cz + dist]].forEach(([lx, lz], q) => {
      zb.dynamic('lv40_gear', lx, y0, lz, (Math.PI / 26) * (q & 2 ? 1 : 0), { r: R1, teeth: 15, collide: false }, { spin: -spin0 * ratio });
    });
    zb.emitter(cx, y0 + 1, cz, 'lv40_gears', { vol: 0.9, rad: 26 });
    zb.light(cx, y0 + 1.5, cz, { color: [1.0, 0.72, 0.38], rad: 12, int: 0.8 });
    for (const [lx, lz] of [[cx - 14, cz], [cx + 14, cz], [cx, cz - 14], [cx, cz + 14]]) zb.light(lx, y0 + 1.2, lz, { color: [1.0, 0.72, 0.38], rad: 10, int: 0.5 });
  }
  // four axle posts at the well's corners
  for (const [px, pz] of [[wx0 + 3, wz0 + 3], [wx1 - 3, wz0 + 3], [wx0 + 3, wz1 - 3], [wx1 - 3, wz1 - 3]]) zb.box(px - 0.5, 0, pz - 0.5, px + 0.5, STORY, pz + 0.5, M.lv40_iron, { sub: 6 });

  // iron columns down the middle of every street (on this zone's west and north lines), caged lamps under the ceiling
  for (let t = 6; t < B; t += 12) {
    for (const [px, pz] of [[ox, oz + t], [ox + t, oz]]) zb.box(px - 0.5, 0, pz - 0.5, px + 0.5, STORY, pz + 0.5, M.lv40_column, { sub: 6 });
  }
  for (let t = 4; t < B; t += 8) for (let u = 4; u < B; u += 8) {
    const x = ox + t, z = oz + u;
    const i = zb.i(x, z);
    if (!(zb.ceil[i] === STORY) || !Number.isFinite(zb.floor[i])) continue;
    if (t > WX0 - 2 && t < WX1 + 2 && u > WX0 - 2 && u < WX1 + 2) continue;
    ceilingLight(zb, x + 0.5, z + 0.5, 'cage', 'on', { color: [1.0, 0.72, 0.38], rad: 9, int: 0.8, hang: 0.25 });
  }

  // doors: one in a street near a column, one on the platform of the girders
  const dx = 6 + Math.floor(hr(bi * 3, bj + s, 1030) * 3) * 2, dz = 22 + Math.floor(hr(bi, bj * 3 + s, 1031) * 18);
  const side = Math.floor(hr(bi + s, bj, 1032) * 2);
  if (hr(bi * 7 + s, bj * 3, 1033) < 0.5 && !(s === Math.floor((ENTRY.y + 0.05) / STORY) && bi === 0 && bj === 0)) {
    const x = side ? ox + B - dx - 0.5 : ox + dx + 0.5, z = oz + dz + 0.5;
    const i = zb.i(Math.floor(x), Math.floor(z));
    const inFlight = (r) => Math.floor(x) >= ox + r.x0 - 2 && Math.floor(x) < ox + r.x1 + 2 && Math.floor(z) >= oz + r.z0 - 2 && Math.floor(z) < oz + r.z1 + 2;
    if (zb.floor[i] === 0 && !inFlight(F) && !inFlight(Fb)) levelDoor(zb, x, z, side ? -Math.PI / 2 : Math.PI / 2, { y: 0 });
  }
  if (hub) levelDoor(zb, cx + 1.2, cz + 0.8, -Math.PI / 4, { y: 5.6 });
  void CF;
}

defineZone('lv40_tower', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.42, 0.31, 0.2],
    env: env({ fog: [0.2, 0.12, 0.06], fogNear: 8, fogFar: 52, hum: 0, hvac: 0, reverb: 'hall', tone: 'lv40' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'THE CLOCK TOWER',
  zoneType: 'lv40_tower',
  zoneSize: B,
  bands: 'all',
  entry: ENTRY,
  doorDensity: 0,
  viewRadius: 3,
  sky: null,
  light: { phoneRadius: 4.4, phoneIntensity: 0.26 },
  // the hour strikes, a long way up
  script(ctx, dt) {
    const s = ctx.state;
    s.t = (s.t ?? 40) - dt;
    if (s.t > 0) return;
    s.t = 70 + Math.random() * 80;
    const p = ctx.player;
    ctx.game.audioCall('play', 'lv40_bell', p.x + 8, p.y + 25, p.z - 12, { distant: true, vol: 1 });
  },
});
