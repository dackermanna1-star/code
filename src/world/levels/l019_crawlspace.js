// Level 19: Crawlspace. The underside of a floor much too large for any house. You arrive in a
// hall of posts where daylight falls through the gaps between the boards overhead; from its
// walls low tunnels, a metre and a bit high, lead away into a network of timber crawlways.
// You have to crouch. Now and then a stretch of wall draws a slow breath.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { defineProp, propMat as S } from '../props.js';
import { LEVEL_ZONE, defineLevel, env, M, hr, owns } from './kit.js';
import { fdiv, placeDoor, quiet, ambientEvents, mulc, TAU } from './g02_kit.js';

const N = 19;
const BS = 8, A = 3, WC = 2;
const LOW = 1.14;               // ceiling of the crawlways (crouching player is 1.0 m)
const TALL = 2.4;               // standing chambers and the hall
const HALL = 32;                // the arrival hall covers blocks 0..3

// ------------------------------------------------------------------ textures
defineTexture('lv19_planks', (p, r) => {
  p.fill([112, 78, 46]);
  for (let x = 0; x < 64; x += 8) {
    const sh = 0.78 + r.next() * 0.4;
    p.rect(x, 0, 8, 64, mulc([116, 80, 48], sh));
    p.rect(x, 0, 1, 64, [34, 22, 14]);
    p.rect(x + 7, 0, 1, 64, [60, 40, 24], 0.6);
    for (let k = 0; k < 4; k++) p.set(x + r.int(1, 6), r.int(0, 63), [70, 46, 26], 0.8);
    p.rect(x + 3, 4, 2, 2, [150, 150, 150], 0.5); p.rect(x + 3, 58, 2, 2, [150, 150, 150], 0.5);   // nails
  }
  p.map((x, y, c) => mulc(c, 0.86 + 0.28 * pnoise(x * 0.3, y, 16, 5)));
  for (let i = 0; i < 3; i++) p.disc(r.int(4, 60), r.int(8, 56), r.range(1.5, 3), [52, 34, 20], 0.8);
  p.grain(0.05);
}, 14);
defineTexture('lv19_boards', (p, r) => {
  p.fill([92, 64, 38]);
  for (let y = 0; y < 64; y += 8) {
    p.rect(0, y, 64, 8, mulc([100, 70, 42], 0.8 + r.next() * 0.35));
    p.rect(0, y, 64, 1, [30, 20, 12]);
    if (r.chance(0.5)) p.rect(r.int(0, 56), y + 1, r.int(2, 6), 7, [26, 18, 10], 0.5);
    for (let k = 0; k < 3; k++) p.set(r.int(0, 63), y + r.int(1, 6), [60, 40, 24], 0.8);
  }
  p.grain(0.05);
  p.noise(4, 0.12, 2);
}, 12);
defineTexture('lv19_dirt', (p, r) => {
  p.fill([76, 60, 46]);
  p.noise(4, 0.2, 3);
  p.grain(0.1);
  p.speckle(160, [104, 86, 68], 0.3, 0.7);
  p.speckle(120, [46, 36, 28], 0.3, 0.7);
  for (let i = 0; i < 6; i++) p.disc(r.int(0, 63), r.int(0, 63), r.range(1, 2.2), [118, 104, 88], 0.8);
  for (let i = 0; i < 2; i++) { const x = r.int(0, 40), y = r.int(0, 60); p.rect(x, y, r.int(14, 22), 4, [86, 60, 36], 0.9); p.rect(x, y, r.int(14, 22), 1, [40, 28, 18], 0.9); }
}, 12);
defineTexture('lv19_post', (p, r) => {
  p.fill([104, 74, 44]);
  p.map((x, y, c) => mulc(c, 0.7 + 0.5 * pnoise(x * 0.4, y, 8, 3) + 0.25 * Math.sin(x * 0.7 + pnoise(x, y, 4, 9) * 5)));
  p.grain(0.05);
  p.rect(0, 0, 64, 3, [40, 28, 18]); p.rect(0, 61, 64, 3, [40, 28, 18]);
}, 10);
defineTexture('lv19_slot', (p, r) => {
  p.fill([255, 244, 214]);
  for (let y = 0; y < 64; y += 8) p.rect(0, y, 64, 1, [240, 220, 176], 0.8);
  p.noise(4, 0.04, 2);
}, 6);
defineTexture('lv19_bulb', (p) => { p.fill([255, 190, 100]); p.disc(32, 32, 20, [255, 240, 200]); }, 4);

defineMaterial('lv19_planks', 'lv19_planks', { s: 2.4, surf: 'wood', stain: 0.1 });
// a stretch of wall that breathes (slow vertical heave)
defineMaterial('lv19_planks_b', 'lv19_planks', { s: 2.4, surf: 'wood', stain: 0.1, flags: VF.WOBBLE });
defineMaterial('lv19_boards', 'lv19_boards', { s: 1.6, surf: 'wood', stain: 0.1 });
defineMaterial('lv19_boards_b', 'lv19_boards', { s: 1.6, surf: 'wood', stain: 0.1, flags: VF.WOBBLE });
defineMaterial('lv19_dirt', 'lv19_dirt', { s: 2.4, surf: 'asphalt', stain: 0.1 });
defineMaterial('lv19_post', 'lv19_post', { s: 1.2, surf: 'wood' });
defineMaterial('lv19_slot', 'lv19_slot', { s: 1.6, flags: VF.FULLBRIGHT, glow: 1.3 });
defineMaterial('lv19_bulb', 'lv19_bulb', { s: 1, flags: VF.FULLBRIGHT, glow: 1.15 });

// ------------------------------------------------------------------ lattice
const bias = (i, j, salt) => 0.34 + 0.56 * hr(fdiv(i, 3), fdiv(j, 3), salt);
const inHallBlock = (i, j) => i >= 0 && i < 4 && j >= 0 && j < 4;
// the hall's mouths: a few of the edges that touch its sides are always open
const eastOf = (i, j) => (inHallBlock(i, j) && inHallBlock(i + 1, j) ? false : (i === 3 && j >= 0 && j < 4) || (i === -1 && j >= 0 && j < 4) ? hr(i, j, 501) < 0.55 || (j === 1 || j === 2) : hr(i, j, 501) < bias(i, j, 511));
const southOf = (i, j) => (inHallBlock(i, j) && inHallBlock(i, j + 1) ? false : (j === 3 && i >= 0 && i < 4) || (j === -1 && i >= 0 && i < 4) ? hr(i, j, 502) < 0.55 || i === 1 || i === 2 : hr(i, j, 502) < bias(i, j, 512));

const NODES = new Map();
function node(i, j) {
  const k = i * 100003 + j;
  let n = NODES.get(k);
  if (n) return n;
  const eE = eastOf(i, j), eW = eastOf(i - 1, j), eS = southOf(i, j), eN = southOf(i, j - 1);
  const deg = (eE ? 1 : 0) + (eW ? 1 : 0) + (eS ? 1 : 0) + (eN ? 1 : 0);
  const u = hr(i, j, 503);
  const e = u < 0.4 ? 0 : u < 0.78 ? 1 : 2;
  const tall = hr(i, j, 504) < 0.16 && e >= 1;
  n = { i, j, eE, eW, eS, eN, deg, alive: deg > 0 && !inHallBlock(i, j), e, tall, h: tall ? TALL : LOW };
  if (NODES.size > 6000) NODES.clear();
  NODES.set(k, n);
  return n;
}
const SOLID = 0, ROOM = 1, GX = 2, GZ = 3, HALLK = 4;
function classify(x, z) {
  if (x >= 0 && x < HALL && z >= 0 && z < HALL) return [HALLK, null];
  const i = fdiv(x, BS), j = fdiv(z, BS), lx = x - i * BS, lz = z - j * BS;
  const n = node(i, j);
  if (!n.alive) return [SOLID, n];
  const lo = A - n.e, hi = A + WC + n.e;
  if (lx >= lo && lx < hi && lz >= lo && lz < hi) return [ROOM, n];
  const cX = lx >= A && lx < A + WC, cZ = lz >= A && lz < A + WC;
  if (cZ && lx >= hi && n.eE) return [GX, n];
  if (cZ && lx < lo && n.eW) return [GX, n];
  if (cX && lz >= hi && n.eS) return [GZ, n];
  if (cX && lz < lo && n.eN) return [GZ, n];
  return [SOLID, n];
}
// is there a crawlway (ceiling lower than a standing person) at this cell?
export function isLowCell(x, z) {
  const [k, n] = classify(Math.floor(x), Math.floor(z));
  if (k === SOLID || k === HALLK) return false;
  return !(k === ROOM && n.tall);
}
// the hall's skylight gaps: strips of open ceiling between the boards
const slot = (x, z) => (x === 5 || x === 13 || x === 21 || x === 29) && z >= 3 && z < 29 && ((z - 3) % 9) < 7;

// ------------------------------------------------------------------ props
defineProp('lv19_bulb', {
  build(mb, p) {
    const dk = S('metal_dark');
    mb.box(-0.04, 0, -0.04, 0.04, 0.05, 0.04, dk);
    mb.box(-0.035, -0.07, -0.035, 0.035, 0, 0.035, S('lv19_bulb'));
    mb.rod(0, 0.05, 0, 0.0, 0.1 + (p.opts.cord || 0), 0, 0.006, 3, S('plastic_black'));
  },
  light: { y: -0.15, color: [1.0, 0.72, 0.38], rad: 6.5, int: 1.1 },
});
defineProp('lv19_rib', {
  build(mb, p) {
    const w = p.opts.w || 2;
    mb.box(-w / 2, 0, -0.05, w / 2, 0.11, 0.05, S('lv19_post'), { skip: 4 });
  },
});

// ------------------------------------------------------------------ dressing
const bulbs = (zb, x, z, y, salt) => {
  if (!owns(zb, x, z)) return;
  const u = hr(Math.floor(x * 2), Math.floor(z * 2), salt);
  if (u < 0.12) return;
  zb.prop('lv19_bulb', x, y, z, 0, { cord: 0, ch: u < 0.2 ? 5 + Math.floor(u * 20) % 4 : u < 0.3 ? 2 : 0 });
};

function hallStuff(zb) {
  // joists under the boards, 0.8 m apart (you walk beneath them)
  for (let x = 0.4; x < HALL; x += 0.8) zb.box(x - 0.055, TALL - 0.15, 0.1, x + 0.055, TALL, HALL - 0.1, M.lv19_post, { collide: false, skip: 4 });
  // a forest of posts, 4 m apart, from floor to the boards
  for (let z = 4; z < HALL; z += 4) for (let x = 4; x < HALL; x += 4) {
    if (!zb.in(x, z)) continue;
    if (Math.abs(x - 16) < 3 && z < 8) continue;
    const o = hr(x, z, 521) * 0.5 - 0.25;
    zb.box(x + o - 0.16, 0, z - 0.16, x + o + 0.16, TALL, z + 0.16, M.lv19_post, { uv: 'world' });
  }
  // light from the gaps: pools along each strip
  for (const x of [5, 13, 21, 29]) for (let z = 5; z < 28; z += 3.5) {
    if (!owns(zb, x + 0.5, z)) continue;
    zb.light(x + 0.5, TALL - 0.3, z, { color: [1.0, 0.94, 0.78], rad: 8, int: 1.05 });
  }
  // a few bulbs among the posts
  for (let z = 8; z < HALL; z += 8) for (let x = 8; x < HALL; x += 8) bulbs(zb, x + 2, z + 2, TALL - 0.1, 531);
  // doors against the hall walls
  if (zb.in(24, 0)) placeDoor(zb, 24.5, 0.2, Math.PI, {});
  if (zb.in(8, 31)) placeDoor(zb, 8.5, 31.8, 0, {});
  if (zb.in(24, 31)) placeDoor(zb, 24.5, 31.8, 0, {});
  if (zb.in(0, 16)) placeDoor(zb, 0.2, 16.5, Math.PI / 2, {});
  if (zb.in(31, 24)) placeDoor(zb, 31.8, 24.5, -Math.PI / 2, {});
  // clutter: boxes and boards left against the posts
  for (let k = 0; k < 14; k++) {
    const x = 2 + hr(k, 1, 541) * 28, z = 3 + hr(k, 2, 542) * 27;
    if (!owns(zb, x, z) || (Math.abs(x - 16) < 3 && z < 8)) continue;
    zb.prop(hr(k, 3, 543) < 0.6 ? 'box' : 'box_stack', x, 0, z, hr(k, 4, 544) * TAU, {});
  }
}

function crawlStuff(zb, n) {
  const bx = n.i * BS, bz = n.j * BS;
  const cx = bx + 4, cz = bz + 4;
  const y = n.tall ? TALL - 0.12 : LOW - 0.08;
  bulbs(zb, cx + 0.5 * (hr(n.i, n.j, 551) - 0.5), cz + 0.5 * (hr(n.i, n.j, 552) - 0.5), y, 553);
  if (n.e >= 1) { bulbs(zb, cx - 1.6, cz + 1.6, y, 554); }
  if (n.eE) bulbs(zb, bx + BS, cz, y, 555);
  if (n.eS) bulbs(zb, cx, bz + BS, y, 556);
  const lo = A - n.e, hi = A + WC + n.e;
  // ribs across the crawlways: beams that hang from the boards (you pass under them)
  const rib = (x, z, rot) => { if (owns(zb, x, z)) zb.prop('lv19_rib', x, LOW - 0.11, z, rot, { w: 2 }); };
  if (n.eE) for (let k = 0; k < 3; k++) rib(bx + hi + 0.5 + k * 1.2, cz, Math.PI / 2);
  if (n.eS) for (let k = 0; k < 3; k++) rib(cx, bz + hi + 0.5 + k * 1.2, 0);
  // piers in the bigger rooms
  if (n.e >= 1) {
    const post = (x, z) => { if (zb.in(Math.floor(x), Math.floor(z))) zb.box(x - 0.1, 0, z - 0.1, x + 0.1, n.h, z + 0.1, M.lv19_post); };
    post(bx + lo + 0.6, bz + lo + 0.6); post(bx + hi - 0.6, bz + lo + 0.6); post(bx + lo + 0.6, bz + hi - 0.6); post(bx + hi - 0.6, bz + hi - 0.6);
  }
  // clutter on the dirt
  const u = hr(n.i, n.j, 561);
  if (owns(zb, cx + 1, cz + 1)) {
    if (u < 0.2) zb.prop('box', cx + 0.9, 0, cz + 0.9, hr(n.i, n.j, 562) * TAU, {});
    else if (u < 0.3) zb.prop('bucket', cx - 0.8, 0, cz + 0.7, 0, {});
    else if (u < 0.36) zb.prop('papers', cx + 0.2, 0, cz - 0.6, hr(n.i, n.j, 563) * TAU, {});
  }
  // standing chambers hold a door
  if (n.tall && hr(n.i, n.j, 571) < 0.55) {
    const free = [];
    if (!n.eE) free.push('E'); if (!n.eW) free.push('W'); if (!n.eS) free.push('S'); if (!n.eN) free.push('N');
    if (free.length) {
      const side = free[Math.floor(hr(n.i, n.j, 572) * free.length)];
      const mx = bx + A + WC / 2, mz = bz + A + WC / 2;
      if (side === 'E') placeDoor(zb, bx + hi - 0.2, mz, -Math.PI / 2, {});
      else if (side === 'W') placeDoor(zb, bx + lo + 0.2, mz, Math.PI / 2, {});
      else if (side === 'S') placeDoor(zb, mx, bz + hi - 0.2, 0, {});
      else placeDoor(zb, mx, bz + lo + 0.2, Math.PI, {});
    }
  }
}

function gen(zb) {
  const { x0, z0, x1, z1 } = zb;
  zb.noConnectivity = true;
  zb.flags.fill(0);
  for (let z = z0; z < z1; z++) {
    for (let x = x0; x < x1; x++) {
      const i = zb.i(x, z);
      const [k, n] = classify(x, z);
      const br = hr(fdiv(x, 5), fdiv(z, 5), 581) < 0.2;          // this stretch of wall and boards breathes
      zb.fmat[i] = M.lv19_dirt; zb.cmat[i] = br ? M.lv19_boards_b : M.lv19_boards; zb.wmat[i] = br ? M.lv19_planks_b : M.lv19_planks;
      zb.floor[i] = 0;
      if (k === SOLID) { zb.solid[i] = br ? M.lv19_planks_b : M.lv19_planks; zb.ceil[i] = LOW; continue; }
      if (k === HALLK) { zb.ceil[i] = TALL; zb.cmat[i] = slot(x, z) ? M.lv19_slot : M.lv19_boards; zb.wmat[i] = M.lv19_planks; continue; }
      zb.ceil[i] = k === ROOM ? n.h : LOW;
    }
  }
  const bi0 = fdiv(x0, BS), bi1 = fdiv(x1 - 1, BS), bj0 = fdiv(z0, BS), bj1 = fdiv(z1 - 1, BS);
  for (let j = bj0; j <= bj1; j++) for (let i = bi0; i <= bi1; i++) {
    if (inHallBlock(i, j)) continue;
    const n = node(i, j);
    if (n.alive) crawlStuff(zb, n);
  }
  if (x0 < HALL && z0 < HALL) hallStuff(zb);
}

defineZone('lv19_crawl', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.2, 0.15, 0.1],
    env: env({ fog: [0.1, 0.075, 0.05], fogNear: 2, fogFar: 34, hum: 0, hvac: 0.1, reverb: 'tiny', tone: 'g02_crawl' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'CRAWLSPACE',
  zoneType: 'lv19_crawl',
  zoneSize: 32,
  entry: { x: 16.5, y: 0, z: 1.0, yaw: Math.PI },
  doorDensity: 0,
  viewRadius: 3,
  weather: { kind: 'dust', amount: 0.8, color: [1.0, 0.92, 0.7, 0.5], fall: 0.04, wind: [0.04, 0.02], size: 0.011, indoor: true },
  grade: { sat: 0.95, tint: [1.05, 0.98, 0.9] },
  light: { phoneRadius: 3.2, phoneIntensity: 0.25 },
  script(ctx, dt) {
    quiet(ctx);
    const p = ctx.player, st = ctx.state;
    // low ceilings: duck on the way in, stand when the way is clear
    const fx = Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const ahead = isLowCell(p.x + fx * 0.8, p.z + fz * 0.8) || isLowCell(p.x + fx * 0.45, p.z + fz * 0.45);
    if (ahead && !p.crouched && !st.hinted) { st.hinted = true; ctx.game.ui.say('IT IS TOO LOW TO STAND. CROUCH WITH C OR CTRL.', 5); }
    if (ahead && !p.crouched && p.crouchAuto !== false) { p.crouchWanted = true; st.auto = true; }
    if (st.auto && p.crouched) {
      let low = false;
      for (let a = 0; a < 8 && !low; a++) low = isLowCell(p.x + Math.cos(a * 0.785) * 0.9, p.z + Math.sin(a * 0.785) * 0.9) || isLowCell(p.x, p.z);
      if (!low) { p.crouchWanted = false; st.auto = false; }
    }
    ambientEvents(ctx, dt, [
      { snd: 'g02_settle', every: [14, 40], dist: [6, 20], vol: [0.5, 1], y: 1, first: 8, near: 12 },
      { snd: 'g02_creak', every: [30, 80], dist: [3, 12], vol: [0.5, 0.9], y: 0.8, near: 6 },
      { snd: 'g02_wind_gap', every: [40, 100], dist: [10, 25], vol: [0.4, 0.8], y: 1.5 },
    ]);
  },
});
