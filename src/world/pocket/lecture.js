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
const X0 = 160, Z0 = 160; // hall centre line / top edge of the first tier
const ENTRY = { level: 0, ox: X0 - 1, oz: Z0 - 16 };

definePocket(ID, { name: 'lecture', zoneType: 'p_lecture', sign: 'sign_lecture', entry: ENTRY });

const rowTop = (k) => -RISE * (k + 1);   // k = tier row index, row k covers z in [Z0+k, Z0+k+1)

function genLecture(zb) {
  const lev = zb.zone.level;
  const y0 = lev * LEVEL_H;
  zb.noConnectivity = true;
  zb.floor.fill(NaN); zb.ceil.fill(NaN); zb.flags.fill(CF.VOID);
  const xa = Math.max(zb.x0, X0 - HALF - 1), xb = Math.min(zb.x1, X0 + HALF + 1);
  if (xa >= xb) return;
  const carpet = M.carpet_red, wall = M.wood_panel, slab = M.concrete_dark;
  // top platform (level 0 only)
  if (lev === 0) {
    zb.fill(X0 - HALF, Z0 - 20, X0 + HALF, Z0, (x, z, i) => {
      zb.floor[i] = 0; zb.ceil[i] = NaN; zb.fmat[i] = carpet; zb.wmat[i] = wall; zb.flags[i] = 0;
    });
    const clip = (x0, z0, x1, z1) => [Math.max(x0, zb.x0), Math.max(z0, zb.z0), Math.min(x1, zb.x1), Math.min(z1, zb.z1)];
    const wallBox = (x0, z0, x1, z1) => { const c = clip(x0, z0, x1, z1); if (c[0] < c[2] && c[1] < c[3]) zb.box(c[0], -0.5, c[1], c[2], 7, c[3], wall, { sub: 2 }); };
    wallBox(X0 - HALF - 0.5, Z0 - 20.5, X0 + HALF + 0.5, Z0 - 20);
    wallBox(X0 - HALF - 0.5, Z0 - 20, X0 - HALF, Z0);
    wallBox(X0 + HALF, Z0 - 20, X0 + HALF + 0.5, Z0);
    if (zb.in(ENTRY.ox, ENTRY.oz)) {
      stampVestibule(zb, { kind: 'return', dim: ID, level: 0, ox: ENTRY.ox, oz: ENTRY.oz, Lg: 3, low: false });
    }
    for (const [lx, lz, hy] of [[-6, -2, 3.2], [6, -2, 3.2], [-8, -16, 3.4], [8, -16, 3.4]]) {
      if (!zb.in(X0 + lx, Z0 + lz)) continue;
      zb.light(X0 + lx, 2.3, Z0 + lz, { rad: 7, int: 0.5, color: [1, 0.82, 0.6] });
      zb.fixture(X0 + lx, Z0 + lz, 'bulb', true, { y: hy, hang: 1.0 });
    }
  }
  // tiers whose tops fall inside this level's height band
  const kMin = Math.max(0, Math.ceil(-(y0 + LEVEL_H) / RISE - 1 + 1e-6));
  const kMax = Math.floor(-y0 / RISE - 1 + 1e-6);
  const za = Math.max(zb.z0 - Z0, kMin), zbnd = Math.min(zb.z1 - Z0, kMax + 1);
  for (let k = za; k < zbnd; k++) {
    const top = rowTop(k) - y0;               // relative to the level base
    const z = Z0 + k;
    zb.box(xa, top - 1.4, z, xb, top, z + 1, [slab, slab, carpet, slab, slab, slab], { sub: 2 });
    if (xa <= X0 - HALF) zb.box(X0 - HALF - 0.5, top - 1.4, z, X0 - HALF, top + 7, z + 1, wall, { sub: 2 });
    if (xb >= X0 + HALF) zb.box(X0 + HALF, top - 1.4, z, X0 + HALF + 0.5, top + 7, z + 1, wall, { sub: 2 });
    // centre aisle half-step so walking down is comfortable
    if (xa <= X0 - 1 && xb >= X0 + 1) zb.box(X0 - 0.9, top - RISE, z + 0.5, X0 + 0.9, top - RISE / 2, z + 1, carpet, { sub: 0 });
    // chairs bolted to the tier, facing down the slope
    for (let x = X0 - HALF + 0.8; x < X0 + HALF - 0.4; x += 0.62) {
      if (Math.abs(x - X0) < 1.3) continue;
      if (x < xa || x >= xb) continue;
      zb.prop('chair_plastic', x, top, z + 0.55, Math.PI, { color: 'plastic_orange', collide: false });
    }
    // little aisle step lights, fading away row after row
    if (k % 3 === 0 && xa <= X0 - 1 && xb >= X0 + 1) {
      zb.decal(X0 - 1.0, top - 0.12, z + 1.001, 'pz', 0.12, 0.08, 'bulb', { lit: false, glow: 0.9 });
      zb.decal(X0 + 1.0, top - 0.12, z + 1.001, 'pz', 0.12, 0.08, 'bulb', { lit: false, glow: 0.9 });
    }
    if (k % 3 === 0) zb.light(X0 + (k % 6 === 0 ? -1 : 1) * 4, top + 0.6, z + 0.5, { rad: 6.5, int: 0.5, color: [1, 0.78, 0.55] });
    if (k % 9 === 4) zb.emitter(X0, top + 1, z + 0.5, 'drone', { vol: 0.2, rad: 12 });
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
