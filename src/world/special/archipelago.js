// The Waiting Archipelago: a terminal-sized waiting area flooded with shallow, motionless black
// water. Clusters of airport tandem seats sit marooned on raised linoleum mounds with stepped
// edges; departure monitors on poles show a timetable nobody updates, or static. High ceiling,
// sparse cold lights, mostly pooled over the islands.
import { defineZone } from '../zonetypes.js';
import { CF, M, pmod, env, facing } from '../gen/common.js';
import { key } from './util.js';

const WATER = -0.25;

function params(zone, rng) {
  const p = {
    wallMat: rng.weighted([[M.paint_cream, 2], [M.tile_white, 1.5], [M.paint_wall, 1]]),
    floorMat: M.water_black,
    ceilMat: M.ceil_tile_white,
    ceilH: rng.pick([4.0, 4.2, 4.2]), // high, but not above the 4.2 m the level above may reach down to
    seat: rng.pick(['plastic_blue', 'plastic_blue', 'plastic_gray', 'plastic_orange']),
    ambient: [0.165, 0.175, 0.2],
  };
  p.env = env({ fog: [0.09, 0.1, 0.12], fogNear: 6, fogFar: 40, hum: 0.35, hvac: 0.55, reverb: 'hall', tone: 'water' });
  return p;
}

function gen(zb) {
  const p = zb.params, r = zb.rng;
  const { x0, z0, x1, z1 } = zb;
  zb.fill(x0, z0, x1, z1, (x, z, i) => { zb.floor[i] = WATER; zb.flags[i] |= CF.WET; });

  // ---- islands: rounded rectangles with one or two step rings
  const islands = [];
  const target = Math.max(4, Math.floor((zb.w * zb.d) / 230));
  for (let tries = 0; tries < target * 30 && islands.length < target; tries++) {
    const w = r.int(4, 9), d = r.int(3, 7);
    const x = r.int(x0 + 4, x1 - 4 - w), z = r.int(z0 + 4, z1 - 4 - d);
    if (islands.some((o) => x < o.x + o.w + 4 && x + w + 4 > o.x && z < o.z + o.d + 4 && z + d + 4 > o.z)) continue;
    islands.push({ x, z, w, d, top: r.pick([0.3, 0.4, 0.5]) });
  }
  const isl = new Int16Array(zb.w * zb.d).fill(-1);
  islands.forEach((o, k) => {
    const steps = Math.ceil((o.top - WATER) / 0.35) - 1;
    for (let s = steps; s >= 0; s--) {
      // ring s (0 = top) extends s cells beyond the top rectangle; corners cut for a mound shape
      const h = s === 0 ? o.top : WATER + ((o.top - WATER) * (steps + 1 - s)) / (steps + 1);
      const ax = o.x - s, az = o.z - s, bx = o.x + o.w + s, bz = o.z + o.d + s;
      zb.fill(ax, az, bx, bz, (x, z, i) => {
        const cx = x === ax || x === bx - 1, cz = z === az || z === bz - 1;
        if (cx && cz) return;
        if (zb.floor[i] >= h) return;
        zb.floor[i] = h; zb.fmat[i] = M.lino_vct; zb.flags[i] &= ~CF.WET;
        isl[zb.i(x, z)] = k;
      });
    }
  });

  // ---- pillars on a lattice, standing in the water
  const P = 16;
  const pillars = [];
  for (let z = z0 + pmod(7 - z0, P); z < z1 - 3; z += P) for (let x = x0 + pmod(7 - x0, P); x < x1 - 3; x += P) {
    if (x < x0 + 3 || z < z0 + 3) continue;
    let clear = true;
    for (let dz = -1; dz <= 2 && clear; dz++) for (let dx = -1; dx <= 2; dx++) if (zb.in(x + dx, z + dz) && isl[zb.i(x + dx, z + dz)] >= 0) { clear = false; break; }
    if (!clear) continue;
    zb.rectSolid(x, z, x + 2, z + 2, p.wallMat);
    // a dark tiled foot where the column meets the water
    zb.box(x - 0.04, WATER - 0.05, z - 0.04, x + 2.04, 0.55, z + 2.04, M.tile_blue, { collide: false, skip: 4 | 8, tint: [0.55, 0.6, 0.65] });
    pillars.push([x, z]);
    if (r.chance(0.6)) {
      const f = r.pick([['px', x + 2, z + 1], ['nx', x, z + 1], ['pz', x + 1, z + 2], ['nz', x + 1, z]]);
      zb.decal(f[1] + (f[0] === 'px' ? 0.01 : f[0] === 'nx' ? -0.01 : 0), 2.1, f[2] + (f[0] === 'pz' ? 0.01 : f[0] === 'nz' ? -0.01 : 0), f[0], 0.7, 0.7, 'sign_wait');
    }
  }

  // ---- seats and monitors on the islands
  const seatColor = p.seat;
  for (const o of islands) {
    const alongX = o.w >= o.d;
    const long = alongX ? o.w : o.d, short = alongX ? o.d : o.w;
    const cx = o.x + o.w / 2, cz = o.z + o.d / 2;
    const n = Math.max(2, Math.min(5, Math.floor((long - 1.6) / 0.56)));
    const pairs = short >= 6 ? 2 : short >= 3 ? 1 : 0;
    const rows = [];
    if (pairs === 0) rows.push([0, 1]);
    for (let k = 0; k < pairs; k++) {
      const off = pairs === 1 ? 0 : (k === 0 ? -1.3 : 1.3);
      rows.push([off - 0.3, -1], [off + 0.3, 1]);
    }
    const shift = r.range(-0.3, 0.3);
    for (const [off, dir] of rows) {
      if (r.chance(0.12)) continue;
      const sx = alongX ? cx + shift : cx + off, sz = alongX ? cz + off : cz + shift;
      const rot = alongX ? facing(0, dir) : facing(dir, 0);
      zb.prop('seat_tandem', sx, o.top, sz, rot + r.range(-0.03, 0.03), { n, color: seatColor });
    }
    // a monitor at one end of the island
    if (r.chance(0.8)) {
      const e = r.sign() * (long / 2 - 0.55);
      const mx = alongX ? cx + e : cx, mz = alongX ? cz : cz + e;
      const u = r.next();
      zb.prop('c_departure', mx, o.top, mz, alongX ? facing(-Math.sign(e), 0) : facing(0, -Math.sign(e)), { screen: u < 0.45 ? 'board' : u < 0.75 ? 'static' : u < 0.9 ? 'blue' : 'off', double: r.chance(0.5), screen2: r.pick(['board', 'static', 'off']) });
    }
    // a pool of cold light over most islands
    if (r.chance(0.72)) {
      const u = r.next();
      const state = u < 0.12 ? 'flicker' : u < 0.18 ? 'dying' : 'on';
      const ch = state === 'flicker' ? r.int(1, 4) : state === 'dying' ? r.int(5, 8) : 0;
      zb.fixture(cx, cz, 'panel', true, { ch, w: 1.2, l: 1.2 });
      zb.light(cx, p.ceilH - 0.6, cz, { rad: 8, int: 1.2, color: [0.8, 0.9, 1.0], ch });
    } else {
      zb.fixture(cx, cz, 'panel', false, { w: 1.2, l: 1.2 });
    }
  }
  // a few monitors and a stray row of seats out in the water
  const water = (x, z) => zb.in(Math.floor(x), Math.floor(z)) && isl[zb.i(Math.floor(x), Math.floor(z))] < 0 && !zb.isSolid(Math.floor(x), Math.floor(z));
  const gateNear = new Set();
  for (const g of zb.gates) for (let k = 0; k < 3; k++) for (let s = -1; s <= 1; s++) gateNear.add(key(g.x + g.dx * k + (g.dz ? s : 0), g.z + g.dz * k + (g.dx ? s : 0)));
  for (let k = 0, tries = 0; k < Math.max(2, Math.floor(target / 4)) && tries < 80; tries++) {
    const x = r.range(x0 + 3, x1 - 3), z = r.range(z0 + 3, z1 - 3);
    if (!water(x, z) || !water(x + 0.6, z) || !water(x - 0.6, z) || gateNear.has(key(Math.floor(x), Math.floor(z)))) continue;
    if (r.chance(0.6)) zb.prop('c_departure', x, WATER, z, r.range(0, Math.PI * 2), { screen: r.pick(['static', 'board', 'off']) });
    else zb.prop('seat_tandem', x, WATER - 0.06, z, r.range(0, Math.PI * 2), { n: r.int(2, 4), color: seatColor });
    k++;
  }
  // sparse lights over the water, most of them dead
  for (let z = z0 + 6; z < z1 - 3; z += 12) for (let x = x0 + 6; x < x1 - 3; x += 12) {
    if (!water(x + 0.5, z + 0.5)) continue;
    const on = r.chance(0.35);
    zb.fixture(x + 0.5, z + 0.5, 'panel', on, { w: 1.2, l: 1.2 });
    if (on) zb.light(x + 0.5, p.ceilH - 0.6, z + 0.5, { rad: 8, int: 0.75, color: [0.75, 0.85, 1.0] });
  }
  // dripping somewhere
  for (let k = 0; k < Math.max(2, Math.floor(target / 3)); k++) {
    const x = r.range(x0 + 2, x1 - 2), z = r.range(z0 + 2, z1 - 2);
    zb.emitter(x, 2.5, z, 'drip', { vol: 0.5, rad: 9 });
  }
  zb.emitter((x0 + x1) / 2, 1, (z0 + z1) / 2, 'water', { vol: 0.25, rad: 30 });
}

defineZone('waiting_archipelago', {
  border: 'wall',
  gate: 'wide',
  minW: 48, minD: 48,
  allowStairs: false,
  weight: (c) => (c.dim === 0 && c.dist > 220 ? 1.3 : 0),
  params,
  gen,
});
