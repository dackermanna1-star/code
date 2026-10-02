// The Static Bullpen: an enormous open office floor with nothing left in it but identical mesh
// task chairs on a loose grid, all facing somewhere else, under long rows of buzzing tube strips.
// A few of the chairs turn slowly on their own.
import { defineZone } from '../zonetypes.js';
import { CF, M, pmod, env, floorDecal } from '../gen/common.js';
import { key } from './util.js';

const CHAIR = 'c_chair_mesh';

function params(zone, rng) {
  const p = {
    wallMat: rng.weighted([[M.paint_wall, 3], [M.paint_beige, 2], [M.paint_cream, 1.5]]),
    floorMat: rng.weighted([[M.carpet_gray, 3], [M.carpet_office, 3], [M.carpet_blue, 1.2]]),
    ceilMat: rng.weighted([[M.ceil_tile_white, 3], [M.ceil_tile, 1]]),
    ceilH: rng.pick([2.8, 2.9, 3.0]),
    alongX: rng.chance(0.5),          // direction of the light strips
    rowGap: rng.pick([3, 4, 4]),      // metres between strip rows
    grid: rng.pick([1.55, 1.6, 1.7]), // chair lattice pitch
    fill: rng.range(0.8, 0.94),       // share of lattice points that still hold a chair
    dead: rng.range(0.03, 0.1),       // strip segments that are off
    flick: rng.range(0.04, 0.1),      // strip segments that flicker
    ambient: [0.19, 0.19, 0.185],
  };
  p.env = env({ fog: [0.27, 0.28, 0.27], fogNear: 6, fogFar: 38, hum: 1.0, hvac: 0.3, reverb: 'hall', tone: 'office' });
  return p;
}

function gen(zb) {
  const p = zb.params, r = zb.rng;
  const { x0, z0, x1, z1 } = zb;
  const ch = p.ceilH;

  // keep the area inside every gate clear
  const keep = new Set();
  for (const g of zb.gates) {
    for (let k = 0; k < 3; k++) for (let s = -1; s <= 1; s++) {
      keep.add(key(g.x + g.dx * k + (g.dz !== 0 ? s : 0), g.z + g.dz * k + (g.dx !== 0 ? s : 0)));
    }
  }

  // structural columns on a sparse lattice (world aligned, so they line up across the floor)
  const colS = r.pick([12, 16]);
  for (let z = z0 + pmod(6 - z0, colS); z < z1 - 2; z += colS) {
    for (let x = x0 + pmod(6 - x0, colS); x < x1 - 2; x += colS) {
      if (x < x0 + 3 || z < z0 + 3 || r.chance(0.25)) continue;
      if (keep.has(key(x, z))) continue;
      zb.setSolid(x, z, p.wallMat);
    }
  }

  // long rows of tube strips: a fixture every 1.5 m, a baked light every segment of three
  const along = p.alongX;
  const len0 = along ? x0 : z0, len1 = along ? x1 : z1;
  const row0 = along ? z0 : x0, row1 = along ? z1 : x1;
  const rowOff = pmod(1 - row0, p.rowGap);
  let rowIdx = 0;
  for (let rr = row0 + rowOff; rr < row1 - 0.5; rr += p.rowGap, rowIdx++) {
    const rc = rr + 0.5;
    const segLen = 4.5;
    let emitAt = len0 + r.range(2, 6);
    for (let s = len0 + 0.6; s < len1 - 0.6; s += segLen) {
      const u = r.next();
      const state = u < p.dead ? 'off' : u < p.dead + p.flick ? (r.chance(0.3) ? 'dying' : 'flicker') : 'on';
      const chn = state === 'flicker' ? r.int(1, 4) : state === 'dying' ? r.int(5, 8) : 0;
      let lit = 0, cx = 0, cz = 0;
      for (let t = s + 0.75; t < Math.min(len1 - 0.5, s + segLen); t += 1.5) {
        const fx = along ? t : rc, fz = along ? rc : t;
        const cell = zb.in(Math.floor(fx), Math.floor(fz)) ? zb.i(Math.floor(fx), Math.floor(fz)) : -1;
        if (cell < 0 || zb.solid[cell]) continue;
        zb.fixture(fx, fz, 'tube', state !== 'off', { ch: chn, rot: along ? 1 : 0, l: 1.42, w: 0.2 });
        lit++; cx += fx; cz += fz;
      }
      if (state !== 'off' && lit) zb.light(cx / lit, ch - 0.5, cz / lit, { rad: 6.2, int: 0.7, color: [0.96, 0.98, 1.0], ch: chn });
      // the buzz: every other row, one source per ~12 m
      if (rowIdx % 2 === 0 && s >= emitAt) {
        zb.emitter(along ? s : rc, ch - 0.25, along ? rc : s, 'hum_strip', { vol: 0.4, rad: 9 });
        emitAt += r.range(11, 14);
      }
    }
  }

  // the chairs: loose lattice, random headings, a few of them alive
  const g = p.grid;
  const dynPer = new Map(); // 16 m block -> animated chair count
  const ox = r.range(0, g), oz = r.range(0, g);
  for (let z = z0 + 0.6 + oz * 0.5; z < z1 - 0.6; z += g) {
    for (let x = x0 + 0.6 + ox * 0.5; x < x1 - 0.6; x += g) {
      if (!r.chance(p.fill)) continue;
      const px = x + r.range(-0.24, 0.24), pz = z + r.range(-0.24, 0.24);
      const cx = Math.floor(px), cz = Math.floor(pz);
      if (!zb.in(cx, cz) || keep.has(key(cx, cz))) continue;
      const i = zb.i(cx, cz);
      if (zb.solid[i] || (zb.flags[i] & (CF.GATE | CF.NOPROPS))) continue;
      // stay off the faces of columns
      if (zb.isSolid(Math.floor(px + 0.35), cz) || zb.isSolid(Math.floor(px - 0.35), cz) || zb.isSolid(cx, Math.floor(pz + 0.35)) || zb.isSolid(cx, Math.floor(pz - 0.35))) continue;
      const rot = r.range(0, Math.PI * 2);
      const bk = Math.floor(px / 16) + ',' + Math.floor(pz / 16);
      const nd = dynPer.get(bk) || 0;
      if (nd < 6 && r.chance(0.035)) {
        dynPer.set(bk, nd + 1);
        const anim = r.chance(0.55)
          ? { spin: r.sign() * r.range(0.05, 0.2) }
          : { osc: [r.range(0.35, 1.3), r.range(0.025, 0.09), r.range(0, 6.28)] };
        zb.dynamic(CHAIR, px, 0, pz, rot, {}, anim);
      } else {
        zb.prop(CHAIR, px, 0, pz, rot);
      }
    }
  }

  // very little else: a few carpet stains and outlets on the far walls
  for (let k = 0; k < (zb.w * zb.d) / 260; k++) {
    const x = r.int(x0, x1 - 1), z = r.int(z0, z1 - 1);
    if (!zb.isSolid(x, z)) floorDecal(zb, x + r.next(), z + r.next(), r.chance(0.7) ? 'dec_stain' : 'dec_scuff', r.range(0.6, 1.6), r);
  }
  for (let x = x0 + 2; x < x1 - 1; x += r.int(5, 9)) zb.decal(x + 0.5, 0.3, z0 + 0.1, 'pz', 0.14, 0.2, 'dec_outlet');
  for (let z = z0 + 2; z < z1 - 1; z += r.int(5, 9)) zb.decal(x0 + 0.1, 0.3, z + 0.5, 'px', 0.14, 0.2, 'dec_outlet');
}

defineZone('static_bullpen', {
  border: 'wall',
  gate: 'door',
  minW: 48, minD: 48,
  allowStairs: false,
  weight: (c) => (c.dim === 0 && c.dist > 180 ? 1.4 * (0.6 + c.office) : 0),
  params,
  gen,
});
