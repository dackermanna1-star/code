// Pocket 1: The Endless Lecture Hall. Hundreds of cheap molded chairs bolted to carpeted tiers
// that slope down forever into the dark. There is no stage at the bottom.
import { defineZone } from '../zonetypes.js';
import { definePocket } from '../pockets.js';
import { stampVestibule } from '../portals.js';
import { CF, M } from '../gen/common.js';
import { env } from '../gen/common.js';
import { LEVEL_H } from '../../config.js';

const ID = 1;
const HALF = 16;          // hall half width
const RISE = 0.4;         // drop per tier row
const ENTRY = { level: 0, ox: -1, oz: -16 };

definePocket(ID, { name: 'lecture', zoneType: 'p_lecture', sign: 'sign_lecture', entry: ENTRY });

const rowTop = (k) => -RISE * (k + 1);

function genLecture(zb) {
  const lev = zb.zone.level;
  const y0 = lev * LEVEL_H;
  zb.noConnectivity = true;
  zb.floor.fill(NaN); zb.ceil.fill(NaN); zb.flags.fill(CF.VOID);
  const xa = Math.max(zb.x0, -HALF - 1), xb = Math.min(zb.x1, HALF + 1);
  if (xa >= xb) return;
  const carpet = M.carpet_red, wall = M.wood_panel, slab = M.concrete_dark;
  // top platform (level 0 only)
  if (lev === 0) {
    zb.fill(-HALF, -20, HALF, 0, (x, z, i) => {
      zb.floor[i] = 0; zb.ceil[i] = NaN; zb.fmat[i] = carpet; zb.wmat[i] = wall; zb.flags[i] = 0;
    });
    if (zb.in(-HALF, -20) || zb.in(HALF - 1, -1)) {
      zb.box(-HALF - 0.5, -0.5, -20.5, HALF + 0.5, 7, -20, wall, { sub: 2 });
      zb.box(-HALF - 0.5, -0.5, -20, -HALF, 7, 0, wall, { sub: 2 });
      zb.box(HALF, -0.5, -20, HALF + 0.5, 7, 0, wall, { sub: 2 });
    }
    if (zb.in(ENTRY.ox, ENTRY.oz)) {
      const v = { kind: 'return', dim: ID, level: 0, ox: ENTRY.ox, oz: ENTRY.oz, Lg: 3, low: false };
      stampVestibule(zb, v);
      // the vestibule stands on the platform; keep its cells floored
    }
    // a pair of dim lamps by the edge
    zb.light(-6, 2.2, -2, { rad: 7, int: 0.5, color: [1, 0.82, 0.6] });
    zb.light(6, 2.2, -2, { rad: 7, int: 0.5, color: [1, 0.82, 0.6] });
    zb.light(-8, 2.4, -16, { rad: 7, int: 0.45, color: [1, 0.82, 0.6] });
    zb.light(8, 2.4, -16, { rad: 7, int: 0.45, color: [1, 0.82, 0.6] });
    zb.fixture(-8, -16, 'bulb', true, { y: 3.4, hang: 1.0 });
    zb.fixture(8, -16, 'bulb', true, { y: 3.4, hang: 1.0 });
    zb.fixture(-6, -2, 'bulb', true, { y: 3.2, hang: 0.9 });
    zb.fixture(6, -2, 'bulb', true, { y: 3.2, hang: 0.9 });
  }
  // tiers whose tops fall inside this level's height band
  const kMin = Math.max(0, Math.ceil(-(y0 + LEVEL_H) / RISE - 1 + 1e-6));
  const kMax = Math.floor(-y0 / RISE - 1 + 1e-6);
  const za = Math.max(zb.z0, kMin), zbnd = Math.min(zb.z1, kMax + 1);
  for (let k = za; k < zbnd; k++) {
    const top = rowTop(k) - y0;               // relative to the level base
    // the tier slab, carpeted on top
    zb.box(xa, top - 1.4, k, xb, top, k + 1, [slab, slab, carpet, slab, slab, slab], { sub: 2 });
    // stepped side walls
    if (xa <= -HALF) zb.box(-HALF - 0.5, top - 1.4, k, -HALF, top + 7, k + 1, wall, { sub: 2 });
    if (xb >= HALF) zb.box(HALF, top - 1.4, k, HALF + 0.5, top + 7, k + 1, wall, { sub: 2 });
    // centre aisle half-step so walking down is comfortable
    if (xa <= -1 && xb >= 1) zb.box(-0.9, top - RISE, k + 0.5, 0.9, top - RISE / 2, k + 1, carpet, { sub: 0 });
    // chairs bolted to the tier, facing down the slope
    for (let x = -HALF + 0.8; x < HALF - 0.4; x += 0.62) {
      if (Math.abs(x) < 1.3) continue;
      if (x < xa || x >= xb) continue;
      zb.prop('chair_plastic', x, top, k + 0.55, Math.PI, { color: 'plastic_orange', collide: false });
    }
    // little aisle step lights, fading away row after row
    if (k % 3 === 0 && xa <= -1 && xb >= 1) {
      zb.decal(-1.0, top - 0.12, k + 1.001, 'pz', 0.12, 0.08, 'bulb', { lit: false, glow: 0.9 });
      zb.decal(1.0, top - 0.12, k + 1.001, 'pz', 0.12, 0.08, 'bulb', { lit: false, glow: 0.9 });
    }
    if (k % 3 === 0) zb.light((k % 6 === 0 ? -1 : 1) * 4, top + 0.6, k + 0.5, { rad: 6.5, int: 0.5, color: [1, 0.78, 0.55] });
    if (k % 9 === 4) zb.emitter(0, top + 1, k + 0.5, 'drone', { vol: 0.2, rad: 12 });
  }
}

defineZone('p_lecture', {
  border: 'open', gate: 'open', dims: [ID],
  allowStairs: false, allowPortals: false,
  weight: () => 0,
  params: () => ({
    wallMat: M.wood_panel, floorMat: M.carpet_red, ceilMat: M.ceil_tile, ceilH: 6,
    ambient: [0.1, 0.085, 0.07],
    env: env({ fog: [0.0, 0.0, 0.0], fogNear: 2, fogFar: 17, hum: 0.0, hvac: 0.2, reverb: 'auditorium', tone: 'void' }),
  }),
  gen: genLecture,
});
