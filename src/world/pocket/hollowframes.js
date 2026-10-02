// Pocket 3: The Cul-de-sac of Hollow Frames. An entire neighbourhood of cookie-cutter split-level
// homes under a featureless slate sky. Every front door stands wide open on carpeted, unpainted,
// completely empty rooms. The neighbourhood is a tiling of identical 64 m courts (one court per
// zone); courts alternate in z so their stems join into streets with a cul-de-sac at each end.
// The return vestibule is a utility shed on the landscaped island at the middle of the court
// in the arrival zone.
import { defineZone } from '../zonetypes.js';
import { definePocket } from '../pockets.js';
import { M, env, facing } from '../gen/common.js';
import { defineProp, propMat as S, propTex } from '../props.js';
import { defineTexture, signTex } from '../../gfx/textures.js';
import { defineMaterial } from '../materials.js';
import { voidAll, shelledReturn, hr } from './e_util.js';
import { Frame } from './eh_common.js';
import { buildHouse, HW, HD, GROUND } from './eh_house.js';

const ID = 3;
const ENTRY = { level: 0, ox: 158, oz: 156 };
const TILE = 64;
const C = 32;                                 // court centre (tile local, a lattice point)

definePocket(ID, { name: 'hollowframes', zoneType: 'p_hollowframes', sign: 'eh_sign_hollow', entry: ENTRY });

// ------------------------------------------------------------------ assets
defineTexture('eh_sign_hollow', signTex(['MODEL', 'HOMES'], [38, 78, 58], [238, 234, 214], 2), 8);
// a second, browner dead-lawn tone for patches
defineTexture('eh_grass_b', (p) => {
  p.fill([118, 112, 80]);
  p.noise(4, 0.16, 3);
  p.speckle(220, [140, 130, 92], 0.3, 0.7);
  p.speckle(160, [92, 90, 62], 0.3, 0.7);
  p.map((x, y, c) => [c[0] * (0.85 + p.rng.next() * 0.3), c[1] * (0.85 + p.rng.next() * 0.3), c[2] * (0.85 + p.rng.next() * 0.3)]);
}, 16);
defineMaterial('eh_grass_b', 'eh_grass_b', { s: 2, surf: 'grass' });
// the siding colours of the neighbourhood: oatmeal, pale grey-green, dusty blue
defineTexture('eh_siding_sage', (p) => {
  p.fill([176, 186, 168]);
  for (let y = 0; y < 64; y += 8) {
    p.rect(0, y, 64, 1, [126, 136, 120]);
    p.rect(0, y + 1, 64, 1, [198, 206, 190]);
    p.shade(0, y + 5, 64, 3, -0.06);
  }
  p.grain(0.02);
}, 8);
defineMaterial('eh_siding_sage', 'eh_siding_sage', { su: 1.6, sv: 1.2, surf: 'wood', stain: 0.05 });
// a leafless tree
defineProp('eh_deadtree', {
  build(mb, p, r) {
    const bark = S('wood_dark', { tint: [0.62, 0.58, 0.55] });
    const H = (p.opts.h || 4.4) + r.next() * 0.8;
    mb.cyl(0, 0, 0, 0.2, H * 0.55, 6, bark, 2);
    mb.cyl(0, H * 0.55, 0, 0.13, H * 0.5, 5, bark, 3);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r.next() * 0.8;
      const y0 = H * (0.38 + 0.6 * (i / n));
      const len = 1.5 + r.next() * 1.2 - (i / n) * 0.5;
      const ex = Math.cos(a) * len, ez = Math.sin(a) * len, ey = y0 + len * (0.55 + r.next() * 0.5);
      mb.rod(0, y0, 0, ex, ey, ez, 0.055, 4, bark, false);
      for (let k = 0; k < 2; k++) {
        const b = a + (k ? 0.7 : -0.6) + r.next() * 0.3;
        mb.rod(ex * 0.6, y0 + (ey - y0) * 0.6, ez * 0.6, ex * 0.6 + Math.cos(b) * 0.9, ey + 0.35 + r.next() * 0.4, ez * 0.6 + Math.sin(b) * 0.9, 0.03, 3, bark, false);
      }
    }
    mb.rod(0, H, 0, 0.1, H + 0.9, 0.05, 0.04, 3, bark, false);
  },
  boxes: [[-0.25, 0, -0.25, 0.25, 3, 0.25]],
});

// "MODEL HOMES" on a post, the same sign that hangs over the portal in the main building
defineProp('eh_signpost', {
  build(mb, p) {
    const wood = S('wood_dark', { tint: [0.6, 0.58, 0.56] });
    const st = propTex('eh_sign_hollow', { tint: [0.8, 0.8, 0.8] });
    const FIT = [0, 0, 1, 1];
    for (const x of [-0.55, 0.55]) mb.box(x - 0.05, 0, -0.04, x + 0.05, 2.5, 0.04, wood, { skip: 8 });
    mb.box(-0.72, 1.1, -0.04, 0.72, 2.5, 0.04, [wood, wood, wood, wood, st, st], { uv: ['world', 'world', 'world', 'world', FIT, FIT] });
  },
  boxes: [[-0.7, 0, -0.1, 0.7, 2.5, 0.1]],
});

// A wooden utility pole with a crossarm. opts.span: length (toward local +z) of the three wires
// that run on to the next pole.
defineProp('eh_utilpole', {
  build(mb, p) {
    const wood = S('wood_dark', { tint: [0.55, 0.52, 0.5] });
    const wire = S('plastic_black', { tint: [0.5, 0.5, 0.5] });
    const ins = S('porcelain', { tint: [0.6, 0.6, 0.6] });
    mb.cyl(0, 0, 0, 0.17, 4.5, 6, wood, 0);
    mb.cyl(0, 4.5, 0, 0.13, 4.0, 6, wood, 2);
    mb.box(-1.15, 7.6, -0.06, 1.15, 7.76, 0.06, wood);
    mb.box(-1.4, 6.9, -0.05, -1.1, 7.0, 0.05, wood);
    const L = p.opts.span || 0;
    for (const x of [-0.95, 0, 0.95]) {
      const top = x === 0 ? 8.52 : 7.98;
      mb.cyl(x, x === 0 ? 8.5 : 7.76, 0, 0.05, 0.22, 5, ins, 3);
      if (L > 0) {
        mb.rod(x, top, 0, x, top - 0.38, L / 2, 0.014, 3, wire, false);
        mb.rod(x, top - 0.38, L / 2, x, top, L, 0.014, 3, wire, false);
      }
    }
  },
  boxes: [[-0.22, 0, -0.22, 0.22, 4, 0.22]],
});

// ------------------------------------------------------------------ tile layout (canonical)
const K = { LAWN: 0, WALK: 1, ROAD: 2, ISLE: 3, CURB: 4, DRIVE: 5 };
const R_ISLE = 5.5, R_CURB = 6.5, R_ROAD = 13, R_WALK = 15;

// ground class of canonical tile cell (cx, cz): the court with its stem running south
function groundClass(cx, cz) {
  const d = Math.hypot(cx + 0.5 - C, cz + 0.5 - C);
  if (d < R_ISLE) return K.ISLE;
  if (d < R_CURB) return K.CURB;
  if (d < R_ROAD) return K.ROAD;
  if (cz >= C && cx >= 28 && cx < 36) return K.ROAD;
  if (d < R_WALK) return K.WALK;
  if (cz >= C && (cx === 26 || cx === 27 || cx === 36 || cx === 37)) return K.WALK;
  return K.LAWN;
}

// the nine lots: facing, anchor (see Frame), mirrored plan so every garage is on the side that
// leads to the court / stem. The N row (three houses, one dead centre) and the W / E rows face the
// island; the last two face the stem.
const LOTS = [
  { f: 'S', ax: 22, az: 13, m: true }, { f: 'S', ax: 26, az: 13, m: false }, { f: 'S', ax: 42, az: 13, m: false },
  { f: 'E', ax: 13, az: 28, m: false }, { f: 'E', ax: 13, az: 36, m: true },
  { f: 'W', ax: 51, az: 28, m: true }, { f: 'W', ax: 51, az: 36, m: false },
  { f: 'E', ax: 22, az: 50, m: true }, { f: 'W', ax: 42, az: 50, m: false },
];
const OPP = { S: 'N', N: 'S', E: 'W', W: 'E' };

const SIDINGS = [['siding', M.siding], ['eh_siding_sage', M.eh_siding_sage], ['siding_blue', M.siding_blue]];

// canonical per-tile ground (class per cell) with driveways written in; cached
const TILE_CLS = (() => {
  const cls = new Uint8Array(TILE * TILE);
  for (let z = 0; z < TILE; z++) for (let x = 0; x < TILE; x++) cls[z * TILE + x] = groundClass(x, z);
  const frames = LOTS.map((L) => new Frame(null, L.f, L.ax, L.az, L.m));
  // which lot (index + 1) occupies a cell, footprint plus a 1.5 m margin
  const occ = new Uint8Array(TILE * TILE);
  frames.forEach((fr, n) => {
    for (let v = -2; v <= HD + 1; v++) for (let u = -2; u <= HW + 1; u++) {
      const [x, z] = fr.cell(u, v);
      if (x >= 0 && z >= 0 && x < TILE && z < TILE) occ[z * TILE + x] = n + 1;
    }
  });
  const info = [];
  frames.forEach((fr, n) => {
    // driveway: straight out from the garage to the street
    for (let u = 0; u < 5; u++) {
      for (let j = 1; j <= 12; j++) {
        const [x, z] = fr.cell(u, -j);
        if (x < 0 || z < 0 || x >= TILE || z >= TILE) break;
        const k = cls[z * TILE + x];
        if (k === K.ROAD) break;
        if (k === K.LAWN) cls[z * TILE + x] = K.DRIVE;
      }
    }
    // mailbox spot: on the lawn just before the sidewalk
    let jw = 4;
    for (let j = 1; j <= 12; j++) { const [x, z] = fr.cell(7, -j); if (cls[z * TILE + x] === K.WALK || cls[z * TILE + x] === K.ROAD) { jw = j; break; } }
    // a bare tree beside the house, on lawn nobody else claims
    let tree = null;
    for (const [u, v] of [[HW + 2.6, -3.5], [-2.6, -3.5], [HW + 2.6, HD + 2.5], [-2.6, HD + 2.5], [HW / 2, HD + 3]]) {
      const [x, z] = fr.cell(Math.floor(u), Math.floor(v));
      if (x < 1 || z < 1 || x > TILE - 2 || z > TILE - 2) continue;
      const o = occ[z * TILE + x];
      if (cls[z * TILE + x] === K.LAWN && (o === 0 || o === n + 1)) { tree = [u, v]; break; }
    }
    info.push({ mail: [7.5, 1.5 - jw], tree });
  });
  return { cls, info };
})();

// the shed that hides the return vestibule: a lamp over each door, a meter panel, a vent
function dressShed(zb, v) {
  const H = v.H;
  const [sx, sz] = v.southDoor, [nx, nz] = v.northDoor;
  zb.fixture(sx, sz - 0.2, 'cage', true, { y: H, hang: 0.3 });
  zb.light(sx, H - 0.6, sz, { rad: 6, int: 0.55, color: [1, 0.9, 0.7] });
  zb.fixture(nx, nz + 0.2, 'cage', true, { y: H, hang: 0.3 });
  zb.light(nx, H - 0.6, nz, { rad: 6, int: 0.55, color: [1, 0.9, 0.7] });
  zb.prop('panel_elec', v.x1, 0, v.oz + 3.5, Math.PI / 2, {});
  zb.decal(v.x0, 2.3, v.oz + 3.5, 'nx', 0.9, 0.6, 'dec_vent');
  zb.decal(v.x1, 2.3, v.oz + 1.6, 'px', 0.9, 0.6, 'dec_vent');
}

// ------------------------------------------------------------------ the zone
function genHollow(zb) {
  const lev = zb.zone.level;
  voidAll(zb);
  if (lev !== 0) return;
  const tx = Math.floor(zb.x0 / TILE), tz = Math.floor(zb.z0 / TILE);
  const x0 = tx * TILE, z0 = tz * TILE;
  const odd = (((tz % 2) + 2) % 2) === 1;
  const seedAt = (a, b) => hr(tx * 7 + a, tz * 11 + b, 91);
  // canonical -> world mappings (odd courts are the even court turned half way round)
  const wx = (cx) => (odd ? x0 + TILE - cx : x0 + cx);
  const wz = (cz) => (odd ? z0 + TILE - cz : z0 + cz);

  // ---- ground
  const g = { [K.LAWN]: [M.grass_dead, GROUND], [K.WALK]: [M.sidewalk, GROUND], [K.ROAD]: [M.asphalt, 0], [K.ISLE]: [M.grass_dead, 0], [K.CURB]: [M.sidewalk, GROUND], [K.DRIVE]: [M.concrete_floor, GROUND] };
  for (let lz = 0; lz < TILE; lz++) {
    for (let lx = 0; lx < TILE; lx++) {
      const cx = odd ? TILE - 1 - lx : lx, cz = odd ? TILE - 1 - lz : lz;
      const k = TILE_CLS.cls[cz * TILE + cx];
      const i = zb.i(x0 + lx, z0 + lz);
      let [mat, h] = g[k];
      if ((k === K.LAWN || k === K.ISLE) && hr((x0 + lx) >> 2, (z0 + lz) >> 2, 17) < 0.28) mat = M.eh_grass_b;
      zb.floor[i] = h; zb.ceil[i] = NaN; zb.fmat[i] = mat; zb.wmat[i] = k === K.ROAD ? M.asphalt : M.sidewalk; zb.flags[i] = 0;
    }
  }

  // ---- houses
  LOTS.forEach((L, n) => {
    const f = odd ? OPP[L.f] : L.f;
    const ax = odd ? x0 + TILE - L.ax : x0 + L.ax, az = odd ? z0 + TILE - L.az : z0 + L.az;
    const fr = new Frame(zb, f, ax, az, L.m);
    const sp = SIDINGS[Math.floor(seedAt(n, 3) * 3) % 3];
    buildHouse(zb, fr, { ext: sp[1], sidingName: sp[0], phase: seedAt(n, 5) * 6.28, light: 1 });
    // mailbox at the curb side of the lawn
    const [mu, mv] = TILE_CLS.info[n].mail;
    zb.prop('mailbox', fr.x(mu, mv), GROUND, fr.z(mu, mv), facing(fr.fx, fr.fz), { tint: [0.62, 0.68, 0.8] });
    const tr = TILE_CLS.info[n].tree;
    if (tr && seedAt(n, 7) < 0.75) zb.prop('eh_deadtree', fr.x(tr[0], tr[1]), GROUND, fr.z(tr[0], tr[1]), seedAt(n, 9) * 6.28, { h: 3.8 + seedAt(n, 11) * 1.6 });
  });

  // ---- the island at the centre of the court
  const cxw = wx(C), czw = wz(C);
  if (zb.in(ENTRY.ox, ENTRY.oz)) {
    const shed = shelledReturn(zb, ID, ENTRY, { floorMat: M.concrete_floor, shellMat: M.siding, height: 2.9, roofMat: M.shingles, roofOver: 0.4, roofT: 0.18 });
    if (shed) dressShed(zb, shed);
    zb.prop('eh_deadtree', cxw - 4.6, 0, czw + 0.3, 1.0, { h: 4.6 });
    zb.prop('eh_deadtree', cxw + 4.6, 0, czw - 0.8, 3.0, { h: 5.2 });
  } else {
    zb.prop('eh_deadtree', wx(C - 1.4), 0, wz(C - 0.6), 0, { h: 5.2 });
  }
  // the sign on the island, facing down the stem
  zb.prop('eh_signpost', wx(C + 3.4), 0, wz(C + 2.2), odd ? 0 : Math.PI, {});

  // ---- utility poles along the stem, wires running on to the next pole
  for (const px of [24.6, 39.4]) {
    const pz = 58;
    zb.prop('eh_utilpole', wx(px), GROUND, wz(pz), 0, { span: odd ? 0 : 12 });
  }

  // ---- street paint: dashed centre line down the stem, dashes around the ring
  const dec = (cx, cz, w, h, tex, rot) => zb.decal(wx(cx), 0, wz(cz), 'up', w, h, tex, { rot: (rot || 0) + (odd ? Math.PI : 0) });
  for (let cz = C + 14; cz < TILE - 0.01; cz += 6) dec(C, cz + 1.5, 0.2, 3, 'eh_paint_y', 0);
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2, r = 9.75;
    const cz = C + Math.sin(a) * r, cx = C + Math.cos(a) * r;
    if (cz > C + 1 && Math.abs(cx - C) < 6) continue; // the stem mouth
    dec(cx, cz, 0.18, 1.8, 'eh_paint_w', a + Math.PI);
  }

  // ---- ambience: wind through the empty houses
  zb.emitter(x0 + 32, 3, z0 + 32, 'wind', { vol: 0.32, rad: 46 });
}

defineZone('p_hollowframes', {
  border: 'open', gate: 'open', dims: [ID],
  allowStairs: false, allowPortals: false,
  weight: () => 0,
  params: () => ({
    wallMat: M.siding, floorMat: M.grass_dead, ceilMat: M.drywall_raw, ceilH: 3,
    ambient: [0.62, 0.645, 0.69],
    env: env({ fog: [0.45, 0.48, 0.53], fogNear: 12, fogFar: 52, hum: 0.0, hvac: 0.0, reverb: 'outdoor', tone: 'outdoor' }),
  }),
  gen: genHollow,
});

export { HW };
