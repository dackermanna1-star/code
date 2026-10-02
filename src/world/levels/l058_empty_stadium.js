// Level 58: The Empty Stadium. A floodlit bowl at night. Stands of empty seats climb into the
// dark under a roof of floodlights, the scoreboard reads HOME 0 AWAY 0, and there is nobody.
// Endless: every 256 m square holds one stadium with its plaza; tunnels lead out to car parks
// and the glow of the next bowl. The floodlights and the PA hum come and go (script).
import { defineTexture, signTex } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, owns, hr, levelDoor, env, M, FACE } from './kit.js';
import { glowMat, around, lattice, faceDir, mulc, carve, TAU } from './g07_kit.js';

const N = 58;
const G = 256, C = 128;
const PX = 46, PZ = 22, TR = 3;          // half pitch (x long, z short) and the track around it
const AX = PX + TR, AZ = PZ + TR;        // apron edge
const GAP = 2.4, TUN_H = 3.4;            // tunnel half width and height
const PLAZA = -0.03;                      // plaza level (the bowl floor is at 0)

// ------------------------------------------------------------------ textures
defineTexture('lv58_grass_a', (p) => {
  p.fill([44, 122, 40]); p.noise(8, 0.14, 3);
  p.speckle(300, [66, 156, 54], 0.35, 0.8); p.speckle(180, [26, 88, 30], 0.3, 0.7);
}, 12);
defineTexture('lv58_grass_b', (p) => {
  p.fill([54, 138, 46]); p.noise(8, 0.14, 3);
  p.speckle(300, [80, 170, 62], 0.35, 0.8); p.speckle(180, [32, 100, 34], 0.3, 0.7);
}, 12);
defineTexture('lv58_track', (p) => {
  p.fill([146, 62, 46]); p.noise(6, 0.1, 3); p.grain(0.05);
  p.speckle(120, [176, 84, 60], 0.3, 0.6, 1);
}, 10);
defineTexture('lv58_line', (p) => { p.fill([236, 238, 232]); p.noise(4, 0.05, 2); }, 4);
// seat tops: a grid of moulded seats (square so it reads from every side)
function seatTop(base, hi, lo) {
  return (p) => {
    p.fill(lo);
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
      const x = tx * 16 + 1, y = ty * 16 + 1;
      p.rect(x, y, 14, 14, base); p.rect(x, y, 14, 2, hi); p.rect(x, y + 12, 14, 2, mulc(base, 0.7));
      p.rect(x + 2, y + 3, 10, 5, mulc(base, 1.08));
    }
    p.noise(4, 0.06, 2);
  };
}
defineTexture('lv58_seat_n', seatTop([42, 62, 138], [78, 100, 190], [10, 12, 30]), 10);
defineTexture('lv58_seat_r', seatTop([158, 40, 40], [214, 84, 74], [30, 8, 8]), 10);
defineTexture('lv58_seat_w', seatTop([206, 206, 196], [244, 244, 236], [40, 40, 44]), 10);
defineTexture('lv58_riser', (p) => {
  p.fill([112, 114, 118]); p.noise(5, 0.1, 3);
  for (let x = 0; x < 64; x += 16) p.rect(x, 0, 1, 64, [70, 72, 78], 0.8);
  p.rect(0, 0, 64, 2, [150, 152, 156]); p.speckle(80, [86, 88, 94], 0.3, 0.6);
}, 8);
defineTexture('lv58_wall', (p) => {
  p.fill([98, 100, 106]); p.noise(5, 0.12, 3);
  for (let x = 0; x < 64; x += 16) p.rect(x, 0, 2, 64, [60, 62, 70], 0.9);
  for (let k = 0; k < 4; k++) { p.rect(k * 16 + 6, 6, 4, 44, [252, 196, 112]); p.rect(k * 16 + 6, 6, 4, 3, [255, 236, 180]); p.frame(k * 16 + 5, 5, 6, 46, [44, 42, 40]); }
  p.rect(0, 56, 64, 2, [60, 62, 70], 0.7); p.speckle(100, [70, 72, 78], 0.3, 0.6);
}, 10);
defineTexture('lv58_tunnel', (p) => {
  p.fill([82, 84, 88]); p.noise(5, 0.12, 3); p.speckle(120, [60, 62, 68], 0.3, 0.7);
  p.rect(0, 50, 64, 14, [58, 60, 64], 0.55);
}, 8);
defineTexture('lv58_tunfloor', (p) => {
  p.fill([74, 76, 80]); p.noise(6, 0.1, 3); p.speckle(100, [54, 56, 60], 0.3, 0.7);
  p.rect(30, 0, 4, 64, [190, 180, 70], 0.55);
}, 8);
defineTexture('lv58_plaza', (p) => {
  p.fill([34, 36, 42]); p.noise(6, 0.14, 3); p.grain(0.07);
  p.speckle(160, [56, 58, 64], 0.3, 0.7); p.speckle(60, [20, 22, 26], 0.4, 0.8);
}, 8);
defineTexture('lv58_lot', (p) => {
  p.fill([38, 40, 46]); p.noise(6, 0.14, 3); p.grain(0.07);
  for (let x = 0; x < 64; x += 16) p.rect(x, 4, 1, 40, [170, 170, 160], 0.75);
  p.rect(0, 4, 64, 1, [170, 170, 160], 0.75);
}, 8);
defineTexture('lv58_bank', (p) => {
  p.fill([22, 24, 30]);
  for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 4; tx++) {
    const cx = tx * 16 + 8, cy = ty * 21 + 11;
    p.disc(cx, cy, 7, [90, 92, 100]); p.disc(cx, cy, 6, [255, 252, 236]); p.disc(cx, cy, 3, [255, 255, 255]);
  }
}, 8);
defineTexture('lv58_metal', (p) => { p.fill([52, 54, 60]); p.noise(5, 0.12, 2); p.rect(0, 0, 64, 2, [90, 92, 100]); }, 6);
defineTexture('lv58_lamp', (p) => { p.fill([255, 200, 120]); p.disc(32, 32, 24, [255, 236, 190]); }, 4);
defineTexture('lv58_pool', (p) => {
  p.fill([255, 190, 110]); p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x - 31.5, y - 31.5) / 32;
    p.a[y * 64 + x] = d >= 1 ? 0 : Math.round(255 * Math.pow(1 - d, 1.6) * 0.8);
  }
}, 4);
defineTexture('lv58_circle', (p) => {
  p.fill([236, 238, 232]); p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const d = Math.hypot(x - 31.5, y - 31.5); if (d <= 31 && d >= 29.4) p.alpha(x, y, 255); }
}, 4);
defineTexture('lv58_net', (p) => {
  p.fill([220, 222, 216]); p.clearAlpha(0);
  for (let k = 0; k < 64; k += 8) { p.rectA(k, 0, 1, 64, 255); p.rectA(0, k, 64, 1, 255); }
}, 4);
function board(bg, fg, word) {
  return (p) => { p.fill(bg); p.rect(0, 0, 64, 3, mulc(bg, 0.7)); p.rect(0, 61, 64, 3, mulc(bg, 0.7)); p.text(word, Math.round(32 - (word.length * 6 - 1) * 1.5 / 1), 22, fg, 1); };
}
function bigWord(bg, fg, word, sc) {
  return (p) => {
    p.fill(bg);
    const w = word.length * 6 * sc - sc;
    p.text(word, Math.round(32 - w / 2), Math.round(32 - 3.5 * sc), fg, sc);
    p.frame(0, 0, 64, 64, mulc(bg, 0.6));
  };
}
defineTexture('lv58_ad_a', bigWord([32, 56, 130], [236, 236, 236], 'ARENA', 2), 6);
defineTexture('lv58_ad_b', bigWord([170, 40, 40], [250, 240, 230], 'CUP', 3), 6);
defineTexture('lv58_ad_c', bigWord([226, 220, 206], [30, 40, 90], 'UNITED', 1), 6);
defineTexture('lv58_ad_d', bigWord([30, 110, 70], [240, 240, 220], 'SPORT', 2), 6);
// the scoreboard: amber digits on black
function scorePanel(word) {
  return (p) => {
    p.fill([8, 8, 10]); p.frame(1, 1, 62, 62, [60, 44, 14]); p.frame(2, 2, 60, 60, [30, 24, 10]);
    p.text(word, Math.round(32 - (word.length * 6 * 2 - 2) / 2), 7, [255, 170, 40], 2);
    p.text('0', 19, 24, [255, 190, 60], 5);
    for (let y = 8; y < 60; y += 2) p.rect(3, y, 58, 1, [0, 0, 0], 0.25);
  };
}
defineTexture('lv58_score_h', scorePanel('HOME'), 8);
defineTexture('lv58_score_a', scorePanel('AWAY'), 8);
defineTexture('lv58_gate', signTex(['GATE'], [20, 60, 120], [240, 240, 236], 2), 6);

// ------------------------------------------------------------------ materials
const ch = 13;     // the floodlight channel (the script dims it)
glowMat('lv58_grass_a', 'lv58_grass_a', 0.8, { s: 6, surf: 'grass', chan: ch });
glowMat('lv58_grass_b', 'lv58_grass_b', 0.8, { s: 6, surf: 'grass', chan: ch });
glowMat('lv58_track', 'lv58_track', 0.7, { s: 3, surf: 'asphalt', chan: ch });
glowMat('lv58_line', 'lv58_line', 0.95, { s: 1, surf: 'grass', chan: ch });
glowMat('lv58_seat_n', 'lv58_seat_n', 0.8, { s: 2.4, surf: 'plastic', chan: ch });
glowMat('lv58_seat_r', 'lv58_seat_r', 0.78, { s: 2.4, surf: 'plastic', chan: ch });
glowMat('lv58_seat_w', 'lv58_seat_w', 0.62, { s: 2.4, surf: 'plastic', chan: ch });
glowMat('lv58_riser', 'lv58_riser', 0.6, { s: 2.4, surf: 'concrete', chan: ch });
glowMat('lv58_conc', 'lv58_riser', 0.7, { s: 2.4, surf: 'concrete', chan: ch });
glowMat('lv58_bank', 'lv58_bank', 1.3, { s: 1, chan: ch });
glowMat('lv58_score_h', 'lv58_score_h', 1.0, { s: 1, chan: 0 });
glowMat('lv58_score_a', 'lv58_score_a', 1.0, { s: 1, chan: 0 });
glowMat('lv58_lamp', 'lv58_lamp', 0.9, { s: 1 });
glowMat('lv58_ad_a', 'lv58_ad_a', 0.8, { s: 1, chan: ch });
glowMat('lv58_ad_b', 'lv58_ad_b', 0.8, { s: 1, chan: ch });
glowMat('lv58_ad_c', 'lv58_ad_c', 0.8, { s: 1, chan: ch });
glowMat('lv58_ad_d', 'lv58_ad_d', 0.8, { s: 1, chan: ch });
glowMat('lv58_strip', 'white', 1.0, { s: 1, chan: ch });
glowMat('lv58_wall', 'lv58_wall', 0.75, { su: 4, sv: 8.7, surf: 'concrete', chan: ch });
defineMaterial('lv58_tunnel', 'lv58_tunnel', { s: 3, surf: 'concrete', stain: 0.12 });
defineMaterial('lv58_tunfloor', 'lv58_tunfloor', { s: 4, surf: 'concrete', stain: 0.05 });
defineMaterial('lv58_plaza', 'lv58_plaza', { s: 8, surf: 'asphalt' });
defineMaterial('lv58_lot', 'lv58_lot', { s: 8, surf: 'asphalt' });
defineMaterial('lv58_metal', 'lv58_metal', { s: 2, surf: 'metal' });
defineMaterial('lv58_net', 'lv58_net', { s: 1, surf: 'metal' });
defineMaterial('lv58_gate', 'lv58_gate', { s: 1, surf: 'metal', flags: VF.FULLBRIGHT, glow: 0.5 });

// ------------------------------------------------------------------ the stand profile
// distance a outward from the apron edge; solid blocks from the ground to h
const TIERS = (() => {
  const t = []; let a = 2;
  for (let k = 0; k < 11; k++) { t.push({ a, d: 0.85, h: 0.4 * (k + 1), kind: 'lo', k }); a += 0.85; }
  t.push({ a, d: 3, h: 4.4, kind: 'conc' }); a += 3;
  t.push({ a, d: 0.6, h: 7.0, kind: 'wall' }); a += 0.6;
  for (let k = 0; k < 22; k++) { t.push({ a, d: 0.9, h: 7.0 + 0.6 * (k + 1), kind: 'up', k }); a += 0.9; }
  return t;
})();
const END = TIERS[TIERS.length - 1].a + TIERS[TIERS.length - 1].d;   // about 29.4
const WALL_T = 1.0, WALL_H = 26, ROOF_Y = 25, ROOF_IN = 12.5;
const XT = AX + END + WALL_T;                                          // half length of the long stands
const SECT = 16;
const LOTS = [-1, 1];

const SEATS = ['lv58_seat_n', 'lv58_seat_n', 'lv58_seat_r', 'lv58_seat_n', 'lv58_seat_w', 'lv58_seat_r'];

// the four sides in a common frame: a = outward distance from the apron edge, t = along the stand
const SIDES = {
  N: { rect: (cx, cz, a0, a1, t0, t1) => [cx + t0, cz - AZ - a1, cx + t1, cz - AZ - a0], front: 4, back: 5, lo: 1, hi: 0, t: XT, face: [0, 1] },
  S: { rect: (cx, cz, a0, a1, t0, t1) => [cx + t0, cz + AZ + a0, cx + t1, cz + AZ + a1], front: 5, back: 4, lo: 1, hi: 0, t: XT, face: [0, -1] },
  W: { rect: (cx, cz, a0, a1, t0, t1) => [cx - AX - a1, cz + t0, cx - AX - a0, cz + t1], front: 0, back: 1, lo: 5, hi: 4, t: AZ, face: [1, 0] },
  E: { rect: (cx, cz, a0, a1, t0, t1) => [cx + AX + a0, cz + t0, cx + AX + a1, cz + t1], front: 1, back: 0, lo: 5, hi: 4, t: AZ, face: [-1, 0] },
};

function slab(zb, S, cx, cz, a0, a1, t0, t1, y0, y1, mats, sub = 8) {
  const [x0, z0, x1, z1] = S.rect(cx, cz, a0, a1, t0, t1);
  return zb.box(x0, y0, z0, x1, y1, z1, mats, { sub });
}

function stand(zb, sideKey, cx, cz, sideIdx) {
  const S = SIDES[sideKey], T = S.t;
  TIERS.forEach((tr, ti) => {
    const mats0 = [null, null, null, null, null, null];
    const top = tr.kind === 'conc' ? M.lv58_conc : tr.kind === 'wall' ? M.lv58_conc : null;
    const gapRoof = tr.h > TUN_H + 0.25;
    for (const [t0, t1] of around(-T, T, -GAP, GAP)) {
      // sections of SECT metres choose their own seat colour
      const n = Math.max(1, Math.round((t1 - t0) / SECT));
      for (let s = 0; s < n; s++) {
        const u0 = t0 + ((t1 - t0) * s) / n, u1 = t0 + ((t1 - t0) * (s + 1)) / n;
        const sec = Math.floor((u0 + 400) / SECT);
        const band = tr.kind === 'up' ? 5 + Math.floor(tr.k / 4) : Math.floor((tr.k || 0) / 4);
        const seat = top ?? M[SEATS[Math.floor(hr(sec * 3 + sideIdx, band, 58) * SEATS.length) % SEATS.length]];
        const m = mats0.slice();
        m[2] = seat; m[S.front] = top ?? seat;
        m[S.lo] = s === 0 ? (t0 === -T ? M.lv58_riser : M.lv58_tunnel) : null;      // ends of a run: outside or tunnel wall
        m[S.hi] = s === n - 1 ? (t1 === T ? M.lv58_riser : M.lv58_tunnel) : null;
        if (ti === TIERS.length - 1) m[S.back] = M.lv58_wall;
        slab(zb, S, cx, cz, tr.a, tr.a + tr.d, u0, u1, 0, tr.h, m, 8);
      }
    }
    if (gapRoof) {
      const m = mats0.slice();
      m[2] = top ?? M.lv58_seat_n; m[3] = M.lv58_tunnel; m[S.front] = M.lv58_riser; m[S.lo] = M.lv58_tunnel; m[S.hi] = M.lv58_tunnel;
      if (ti === TIERS.length - 1) m[S.back] = M.lv58_wall;
      slab(zb, S, cx, cz, tr.a, tr.a + tr.d, -GAP, GAP, TUN_H, tr.h, m, 8);
    }
  });
  // the back wall, with the tunnel mouth cut through it
  for (const [t0, t1] of around(-T, T, -GAP, GAP)) {
    const m = [null, null, null, null, null, null];
    m[S.back] = M.lv58_wall; m[S.lo] = t0 === -T ? M.lv58_wall : M.lv58_tunnel; m[S.hi] = t1 === T ? M.lv58_wall : M.lv58_tunnel;
    m[2] = M.lv58_wall;
    slab(zb, S, cx, cz, END, END + WALL_T, t0, t1, 0, WALL_H, m, 5);
  }
  { const m = [null, null, M.lv58_wall, M.lv58_tunnel, null, null]; m[S.back] = M.lv58_wall; m[S.lo] = M.lv58_tunnel; m[S.hi] = M.lv58_tunnel; m[S.front] = M.lv58_tunnel;
    slab(zb, S, cx, cz, END, END + WALL_T, -GAP, GAP, TUN_H, WALL_H, m, 5); }
  // roof over the back of the stand, floodlights along its lip
  const lipA = ROOF_IN;
  { const m = [M.lv58_metal, M.lv58_metal, M.lv58_metal, M.lv58_metal, M.lv58_metal, M.lv58_metal];
    slab(zb, S, cx, cz, lipA, END + WALL_T, -T, T, ROOF_Y, ROOF_Y + 1.2, m, 8); }
  { const m = [null, null, null, null, null, null]; m[S.front] = M.lv58_strip;
    slab(zb, S, cx, cz, lipA - 0.05, lipA, -T, T, ROOF_Y - 0.5, ROOF_Y + 1.2, m, 8); }
  const [fx, fz] = S.face;          // direction toward the pitch
  for (let t = -T + 12; t < T - 6; t += 18) {
    if (sideKey === 'N' && Math.abs(t) < 19) continue;      // the scoreboard hangs there
    bank(zb, sideKey, cx, cz, t, 21.3, 3.6, 7.2);
  }
  // posts holding the roof lip up
  for (let t = -T + 6; t < T; t += 24) {
    if (Math.abs(t) < GAP + 1) continue;
    slab(zb, S, cx, cz, lipA, lipA + 0.8, t - 0.4, t + 0.4, TIERS.find((q) => q.a + q.d > lipA).h, ROOF_Y, [M.lv58_metal, M.lv58_metal, null, null, M.lv58_metal, M.lv58_metal], 8);
  }
  // the PA: horn clusters under the lip
  for (let t = -T + 20; t < T - 10; t += 38) {
    if (Math.abs(t) < 6) continue;
    const m = [M.lv58_metal, M.lv58_metal, M.lv58_metal, M.lv58_metal, M.lv58_metal, M.lv58_metal];
    slab(zb, S, cx, cz, lipA + 0.1, lipA + 1.3, t - 1.2, t + 1.2, ROOF_Y - 1.4, ROOF_Y, m, 0);
    const [ex, ez] = [S.rect(cx, cz, lipA + 0.6, lipA + 0.6, t, t)[0], S.rect(cx, cz, lipA + 0.6, lipA + 0.6, t, t)[1]];
    if (owns(zb, ex, ez)) zb.emitter(ex, ROOF_Y - 1, ez, 'lv58_pa_idle', { vol: 0.5, rad: 34 });
  }
  void fx; void fz;
}

// a bank of floodlights on the lip, facing the pitch
function bank(zb, sideKey, cx, cz, t, y, h, w) {
  const S = SIDES[sideKey];
  const [x0, z0, x1, z1] = S.rect(cx, cz, ROOF_IN - 1.0, ROOF_IN, t - w / 2, t + w / 2);
  const m = [M.lv58_metal, M.lv58_metal, M.lv58_metal, M.lv58_metal, M.lv58_metal, M.lv58_metal];
  m[S.front] = M.lv58_bank;
  zb.box(x0, y, z0, x1, y + h, z1, m, { sub: 0, uv: 'fit' });
}

// ------------------------------------------------------------------ the bowl
function bowl(zb, cx, cz) {
  const pitch = { x0: cx - PX, x1: cx + PX, z0: cz - PZ, z1: cz + PZ };
  // pitch: mown stripes across the length
  for (let k = 0, x = pitch.x0; x < pitch.x1 - 0.01; k++, x += 6) {
    zb.box(x, -0.2, pitch.z0, Math.min(x + 6, pitch.x1), 0.02, pitch.z1, k % 2 ? M.lv58_grass_a : M.lv58_grass_b, { sub: 6, skip: FACE.NY });
  }
  // the track and apron round it
  const tr = [[cx - AX, cz - AZ, cx + AX, cz - PZ], [cx - AX, cz + PZ, cx + AX, cz + AZ], [cx - AX, cz - PZ, cx - PX, cz + PZ], [cx + PX, cz - PZ, cx + AX, cz + PZ]];
  for (const [x0, z0, x1, z1] of tr) zb.box(x0, -0.2, z0, x1, 0.02, z1, M.lv58_track, { sub: 6, skip: FACE.NY });
  // under the stands: concrete floor all round (tunnels and walkway)
  const ring = [[cx - AX - END - 1, cz - AZ - END - 1, cx + AX + END + 1, cz - AZ], [cx - AX - END - 1, cz + AZ, cx + AX + END + 1, cz + AZ + END + 1]];
  for (const [x0, z0, x1, z1] of ring) zb.box(x0, -0.2, z0, x1, 0.0, z1, M.lv58_tunfloor, { sub: 1.6, skip: FACE.NY });
  for (const sx of [-1, 1]) zb.box(sx < 0 ? cx - AX - END - 1 : cx + AX, -0.2, cz - AZ, sx < 0 ? cx - AX : cx + AX + END + 1, 0.0, cz + AZ, M.lv58_tunfloor, { sub: 1.6, skip: FACE.NY });
  // markings
  const L = (x0, z0, x1, z1) => zb.box(x0, 0.0, z0, x1, 0.07, z1, M.lv58_line, { collide: false, skip: FACE.NY, sub: 40 });
  const w = 0.14;
  L(pitch.x0, pitch.z0, pitch.x1, pitch.z0 + w); L(pitch.x0, pitch.z1 - w, pitch.x1, pitch.z1);
  L(pitch.x0, pitch.z0, pitch.x0 + w, pitch.z1); L(pitch.x1 - w, pitch.z0, pitch.x1, pitch.z1);
  L(cx - w / 2, pitch.z0, cx + w / 2, pitch.z1);
  zb.decal(cx, 0.02, cz, 'up', 14, 14, 'lv58_circle', { lit: false, glow: 0.95, ch });
  L(cx - 0.3, cz - 0.3, cx + 0.3, cz + 0.3);
  for (const s of [-1, 1]) {
    const e0 = s < 0 ? pitch.x0 : pitch.x1;
    const box = (d, hz) => {   // a rectangle d metres out from the goal line, hz half wide
      const xa = s < 0 ? e0 : e0 - d, xb = s < 0 ? e0 + d : e0;
      L(xa, cz - hz, xb, cz - hz + w); L(xa, cz + hz - w, xb, cz + hz);
      const ex = s < 0 ? e0 + d : e0 - d;
      L(ex - w / 2, cz - hz, ex + w / 2, cz + hz);
    };
    box(11, 14); box(4.5, 6);
    // goal: posts, bar, net behind
    const gxx = s < 0 ? pitch.x0 : pitch.x1, dir = s < 0 ? -1 : 1;
    for (const z of [cz - 3.66, cz + 3.66]) zb.box(gxx - 0.06, 0, z - 0.06, gxx + 0.06, 2.44, z + 0.06, M.lv58_line, { collide: false, sub: 0 });
    zb.box(gxx - 0.06, 2.38, cz - 3.66, gxx + 0.06, 2.5, cz + 3.66, M.lv58_line, { collide: false, sub: 0 });
    const nx0 = Math.min(gxx, gxx + dir * 2.2), nx1 = Math.max(gxx, gxx + dir * 2.2);
    zb.box(nx0, 0, cz - 3.66, nx1, 2.44, cz + 3.66, M.lv58_net, { alpha: 0.9, collide: false, sub: 0, skip: FACE.NY });
  }
  // advertising boards along the edge of the apron, broken at the tunnels
  const ads = [M.lv58_ad_a, M.lv58_ad_b, M.lv58_ad_c, M.lv58_ad_d];
  const boardRun = (axis, fixed, lo, hi, faceSign, k0) => {
    for (const [a, b] of around(lo, hi, -GAP - 1, GAP + 1)) {
      for (let t = a, k = k0; t < b - 0.5; t += 6, k++) {
        const t1 = Math.min(t + 6, b);
        const m = ads[Math.floor(hr(k, axis === 'x' ? 1 : 2, 58 + Math.floor(fixed)) * 4)];
        const mats = [M.lv58_metal, M.lv58_metal, M.lv58_metal, null, M.lv58_metal, M.lv58_metal];
        const uv = ['world', 'world', 'world', 'world', 'world', 'world'];
        if (axis === 'x') { const fi = faceSign > 0 ? 4 : 5; mats[fi] = m; uv[fi] = 'fit'; zb.box(cx + t, 0, fixed, cx + t1, 0.9, fixed + 0.25, mats, { sub: 0, uv }); }
        else { const fi = faceSign > 0 ? 0 : 1; mats[fi] = m; uv[fi] = 'fit'; zb.box(fixed, 0, cz + t, fixed + 0.25, 0.9, cz + t1, mats, { sub: 0, uv }); }
      }
    }
  };
  boardRun('x', cz - AZ - 0.25 + 0.25, -AX + 2, AX - 2, 1, 0);
  boardRun('x', cz + AZ - 0.5, -AX + 2, AX - 2, -1, 3);
  boardRun('z', cx - AX - 0.25 + 0.25, -AZ + 2, AZ - 2, 1, 5);
  boardRun('z', cx + AX - 0.5, -AZ + 2, AZ - 2, -1, 7);
}

function lamp(zb, x, z, y = PLAZA) {
  if (!owns(zb, x, z)) return;
  zb.box(x - 0.1, y, z - 0.1, x + 0.1, y + 8, z + 0.1, M.lv58_metal, { sub: 0 });
  zb.box(x - 0.9, y + 7.8, z - 0.15, x + 0.1, y + 8, z + 0.15, M.lv58_metal, { sub: 0, collide: false });
  zb.box(x - 0.9, y + 7.7, z - 0.25, x - 0.2, y + 7.82, z + 0.25, M.lv58_lamp, { sub: 0, collide: false });
  zb.light(x - 0.5, y + 7.0, z, { color: [1.0, 0.72, 0.4], rad: 9, int: 0.7 });
  zb.decal(x - 0.5, y, z, 'up', 14, 14, 'lv58_pool', { lit: false, glow: 0.6 });
}

// ------------------------------------------------------------------ the zone
function gen(zb) {
  zb.floor.fill(NaN); zb.ceil.fill(NaN); zb.flags.fill(2);      // CF.VOID everywhere: the ground is brushes
  zb.noConnectivity = true;
  const mi = Math.floor(zb.x0 / G), mj = Math.floor(zb.z0 / G);
  const ox = mi * G, oz = mj * G, cx = ox + C, cz = oz + C;
  // the ground: plaza pieces around the bowl and the car parks (nothing overlaps, so nothing fights)
  const FP = [cx - XT, cz - AZ - END - WALL_T, cx + XT, cz + AZ + END + WALL_T];
  const lots = LOTS.map((s) => [cx - 100, cz + s * (AZ + END + WALL_T + 26) - 18, cx + 100, cz + s * (AZ + END + WALL_T + 26) + 18]);
  for (const r of carve([zb.x0, zb.z0, zb.x1, zb.z1], [FP, ...lots])) {
    zb.box(r[0], -0.5, r[1], r[2], PLAZA, r[3], [M.lv58_plaza, M.lv58_plaza, M.lv58_plaza, null, M.lv58_plaza, M.lv58_plaza], { sub: 8 });
  }
  for (const r of lots) zb.box(r[0], -0.5, r[1], r[2], 0, r[3], [M.lv58_lot, M.lv58_lot, M.lv58_lot, null, M.lv58_lot, M.lv58_lot], { sub: 8 });
  bowl(zb, cx, cz);
  for (const [k, side] of ['N', 'S', 'W', 'E'].entries()) stand(zb, side, cx, cz, k);
  // scoreboard on the north roof lip: HOME / AWAY
  {
    const lipZ = cz - AZ - ROOF_IN;
    for (const [s, mat] of [[-1, M.lv58_score_h], [1, M.lv58_score_a]]) {
      const x0 = cx + (s < 0 ? -14.5 : 1), x1 = cx + (s < 0 ? -1 : 14.5);
      zb.box(x0, 13.6, lipZ, x1, 25, lipZ + 0.9, [M.lv58_metal, M.lv58_metal, M.lv58_metal, M.lv58_metal, mat, M.lv58_metal], { sub: 0, uv: 'fit' });
    }
    zb.box(cx - 1, 13.6, lipZ, cx + 1, 25, lipZ + 0.9, M.lv58_metal, { sub: 0 });
  }
  // gate signs above the tunnel mouths in the back walls
  for (const [sx, sz, face] of [[cx, cz - AZ - END - WALL_T - 0.05, 5], [cx, cz + AZ + END + WALL_T + 0.05, 4]]) {
    if (owns(zb, sx, sz)) zb.box(sx - 3, 4.3, sz - (face === 4 ? 0 : 0.1), sx + 3, 6.3, sz + (face === 4 ? 0.1 : 0), [M.lv58_metal, M.lv58_metal, M.lv58_metal, M.lv58_metal, face === 4 ? M.lv58_gate : M.lv58_metal, face === 5 ? M.lv58_gate : M.lv58_metal], { sub: 0, uv: 'fit' });
  }
  // tunnel lights (on the floodlight circuit)
  for (const s of [-1, 1]) for (let a = 6; a < END + 0.5; a += 6) {
    for (const [px, pz] of [[cx, cz + s * (AZ + a)], [cx + s * (AX + a), cz]]) {
      if (!owns(zb, px, pz)) continue;
      zb.light(px, TUN_H - 0.5, pz, { color: [1.0, 0.9, 0.7], rad: 7.5, int: 0.6, ch });
    }
  }
  for (const s of [-1, 1]) for (let a = 6; a < END + 0.5; a += 6) {
    const px = cx, pz = cz + s * (AZ + a);
    if (owns(zb, px, pz)) zb.box(px - 0.5, TUN_H - 0.12, pz - 0.15, px + 0.5, TUN_H - 0.02, pz + 0.15, M.lv58_strip, { collide: false, sub: 0 });
    const qx = cx + s * (AX + a), qz = cz;
    if (owns(zb, qx, qz)) zb.box(qx - 0.15, TUN_H - 0.12, qz - 0.5, qx + 0.15, TUN_H - 0.02, qz + 0.5, M.lv58_strip, { collide: false, sub: 0 });
  }
  corners(zb, cx, cz);
  plaza(zb, cx, cz, mi, mj);
  doors(zb, cx, cz, mi, mj);
}

// four floodlight masts outside the corners of the bowl
function corners(zb, cx, cz) {
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const mx = cx + sx * (AX + END + 9), mz = cz + sz * (AZ + END + 9);
    if (!owns(zb, mx, mz)) continue;
    zb.box(mx - 0.7, PLAZA, mz - 0.7, mx + 0.7, 50, mz + 0.7, M.lv58_metal, { sub: 10 });
    for (let k = 0; k < 3; k++) {
      const y = 41 + k * 3.7;
      const m = [M.lv58_metal, M.lv58_metal, M.lv58_metal, M.lv58_metal, M.lv58_metal, M.lv58_metal];
      m[sx < 0 ? 0 : 1] = M.lv58_bank; m[sz < 0 ? 4 : 5] = M.lv58_bank;
      zb.box(mx - 3.4, y, mz - 3.4, mx + 3.4, y + 3.2, mz + 3.4, m, { sub: 0, uv: 'fit', collide: false });
    }
    zb.emitter(mx, 4, mz, 'lv58_flood', { vol: 0.55, rad: 36 });
    zb.light(mx - sx * 1.5, 2.5, mz - sz * 1.5, { color: [0.8, 0.9, 1.0], rad: 6, int: 0.4, ch });
  }
}

// car parks, lamps, ticket kiosks, fences in the space between the bowls
function plaza(zb, cx, cz, mi, mj) {
  const x0 = zb.x0, z0 = zb.z0, x1 = zb.x1, z1 = zb.z1;
  const inBowl = (x, z, m = 0) => x > cx - AX - END - WALL_T - m && x < cx + AX + END + WALL_T + m && z > cz - AZ - END - WALL_T - m && z < cz + AZ + END + WALL_T + m;
  // lamps on a lattice
  lattice(x0, z0, x1, z1, 32, 32, (x, z, i, j) => {
    const px = x + (hr(i, j, 1) - 0.5) * 6, pz = z + (hr(i, j, 2) - 0.5) * 6;
    if (inBowl(px, pz, 4)) return;
    lamp(zb, px, pz);
  }, 16, 16);
  // car park rows north and south of the bowl
  for (const s of [-1, 1]) {
    const zc = cz + s * (AZ + END + WALL_T + 26);
    const zr0 = zc - 18, zr1 = zc + 18;
    for (let row = 0; row < 6; row++) {
      const z = zr0 + 3.5 + row * 5.6 + (row >= 3 ? 3 : 0);
      for (let x = cx - 96; x < cx + 96; x += 4) {
        if (!owns(zb, x, z)) continue;
        const k = Math.floor(x / 4);
        if (hr(k, row + mj * 7, 80 + (s > 0 ? 1 : 0) + mi * 3) > 0.28) continue;
        const rot = (hr(k, row, 83) > 0.5 ? 0 : Math.PI) + (hr(k, row, 84) - 0.5) * 0.1;
        const g = 0.35 + hr(k, row, 85) * 0.6, tint = [g, g * (0.7 + hr(k, row, 86) * 0.5), g * (0.6 + hr(k, row, 87) * 0.7)];
        zb.prop('car', x + 2, 0, z, rot, { crushed: false, tint });
      }
    }
  }
  // ticket kiosks beside the tunnel mouths
  for (const [kx, kz] of [[cx + 7, cz - AZ - END - WALL_T - 5], [cx - 7, cz + AZ + END + WALL_T + 5], [cx - AX - END - WALL_T - 5, cz + 7], [cx + AX + END + WALL_T + 5, cz - 7]]) {
    if (!owns(zb, kx, kz)) continue;
    zb.box(kx - 1.3, PLAZA, kz - 1.3, kx + 1.3, 2.7, kz + 1.3, M.lv58_wall, { sub: 0 });
    zb.box(kx - 1.45, 2.7, kz - 1.45, kx + 1.45, 2.95, kz + 1.45, M.lv58_metal, { sub: 0 });
    zb.light(kx, 2.0, kz + 1.8, { color: [1, 0.85, 0.6], rad: 5, int: 0.4 });
  }
}

// doors: the centre spot, the tunnel mouths, the corners, the car parks
function doors(zb, cx, cz, mi, mj) {
  const D = (x, z, rot, y) => { if (owns(zb, x, z)) levelDoor(zb, x, z, rot, { y: y ?? (x > cx - AX && x < cx + AX && z > cz - AZ && z < cz + AZ ? 0.02 : PLAZA) }); };
  D(cx, cz, 0);
  // on the concourse of each lower bowl, in front of the upper hoarding
  const cc = 12.9;
  D(cx + 24, cz + AZ + cc, 0, 4.4);
  D(cx - 24, cz - AZ - cc, Math.PI, 4.4);
  D(cx - AX - cc, cz + 10, Math.PI / 2, 4.4);
  D(cx + AX + cc, cz - 10, -Math.PI / 2, 4.4);
  const jx = (k) => (hr(mi, mj, 200 + k) - 0.5) * 10;
  D(cx - 9 + jx(1), cz - AZ - END - WALL_T - 6, 0);
  D(cx + 9 + jx(2), cz + AZ + END + WALL_T + 6, Math.PI);
  D(cx - AX - END - WALL_T - 8, cz - 12 + jx(3), Math.PI / 2);
  D(cx + AX + END + WALL_T + 8, cz + 12 + jx(4), -Math.PI / 2);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) D(cx + sx * 108, cz + sz * 90 + jx(5 + sx + sz), faceDir(-sx, -sz));
}

defineZone('lv58_stadium', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.2, 0.22, 0.3],
    env: env({ fog: [0.035, 0.05, 0.1], fogNear: 46, fogFar: 112, hum: 0, hvac: 0, reverb: 'outdoor', tone: 'lv58_night' }),
  }),
  gen,
});

// the floodlights and the PA come and go
function script(ctx, dt) {
  const s = ctx.state, f = ctx.game.flicker, p = ctx.player;
  if (s.phase === undefined) { s.phase = 'on'; s.t = 70 + Math.random() * 50; s.k = 0; }
  s.t -= dt;
  const say = (name, vol = 1, far = true) => {
    const a = Math.random() * TAU, d = far ? 40 : 6;
    ctx.game.audioCall('play', name, p.x + Math.sin(a) * d, p.y + 8, p.z - Math.cos(a) * d, { distant: far, vol });
  };
  switch (s.phase) {
    case 'on':
      f.event = 1;
      if (s.t < 0) { s.phase = 'sag'; s.t = 2.2; say('lv58_pa', 0.9); }
      break;
    case 'sag': {     // the hum swells, the lamps stutter
      f.event = Math.random() < 0.5 ? 0.15 : 1;
      if (s.t < 0) { s.phase = 'off'; s.t = 7 + Math.random() * 8; f.event = 0; say('lv58_flood_off', 1); }
      break;
    }
    case 'off':
      f.event = 0;
      if (!s.chimed && s.t < 4) { s.chimed = true; say('lv58_chime', 0.8); }
      if (s.t < 0) { s.phase = 'surge'; s.t = 3.2; s.chimed = false; say('lv58_flood_on', 1); }
      break;
    case 'surge': {
      const k = 1 - Math.max(0, s.t) / 3.2;
      f.event = k < 0.5 ? (Math.random() < 0.35 + k ? 0.6 : 0.05) : (Math.random() < 0.8 ? 1 : 0.5);
      if (s.t < 0) { s.phase = 'on'; s.t = 80 + Math.random() * 90; }
      break;
    }
    default: break;
  }
}

defineLevel(N, {
  name: 'THE EMPTY STADIUM',
  zoneType: 'lv58_stadium',
  zoneSize: G,
  entry: { x: C + 0.5, y: 4.4, z: C + AZ + 13.1, yaw: 0 },
  doorDensity: 0.5,
  viewRadius: 5,
  sky: { top: [0.004, 0.006, 0.02], horizon: [0.035, 0.05, 0.1], ground: [0.01, 0.012, 0.025], curve: 0.5, stars: 0.9, sun: { dir: [-0.6, 0.35, -0.7], color: [0.7, 0.76, 0.9], size: 0.02, halo: 0.1 } },
  light: { phoneRadius: 4, phoneIntensity: 0.25 },
  script,
});
void pnoise;
