// Pocket 6: The Pool Rooms. Bright white-tiled halls and corridors that go on in every direction,
// each with its shallow turquoise pool, round arches, tiled pillars and square openings of
// daylight in the ceiling. The water never moves. The return vestibule is disguised as a tiled
// changing cabin on the promenade of the arrival hall, between two long pools.
import { defineZone } from '../zonetypes.js';
import { definePocket } from '../pockets.js';
import { M, W, env, ceilingLight } from '../gen/common.js';
import { voidAll, cbox, owns, shelledReturn, hr, only, FACE } from './e_util.js';
import './ei_pooltex.js';
import { R, WATER_Y, ARRIVAL, roomAt, edgeType, edgeOpenAt, archCentres, wallHeight, solidAt } from './ei_poolrooms.js';

const ID = 6;
const ENTRY = { level: 0, ox: 159, oz: 144 };
definePocket(ID, { name: 'pools', zoneType: 'p_pools', sign: 'ei_sign_pool', entry: ENTRY });

const onLine = (v) => Math.floor(v / R) * R === v;

function genPools(zb) {
  if (zb.zone.level !== 0) { voidAll(zb); return; }
  zb.noConnectivity = true;
  const iA = Math.floor(zb.x0 / R), iB = Math.floor((zb.x1 - 1) / R), jA = Math.floor(zb.z0 / R), jB = Math.floor((zb.z1 - 1) / R);
  for (let j = jA; j <= jB; j++) for (let i = iA; i <= iB; i++) fillCells(zb, roomAt(i, j));
  // the changing cabin first: stamping the vestibule clears whatever stands inside its footprint
  const cabin = shelledReturn(zb, ID, ENTRY, {
    floorMat: M.ei_tile_floor, shellMat: M.ei_tile_wall, height: 3.1, roofMat: M.ei_tile_edge, roofOver: 0.4, roofT: 0.25,
  });
  if (cabin) dressCabin(zb, cabin);
  walls(zb);
  for (let j = jA; j <= jB; j++) for (let i = iA; i <= iB; i++) emitRoom(zb, roomAt(i, j));
}

function fillCells(zb, room) {
  const ua = Math.max(zb.x0, room.x0), ub = Math.min(zb.x1, room.x0 + R), va = Math.max(zb.z0, room.z0), vb = Math.min(zb.z1, room.z0 + R);
  for (let z = va; z < vb; z++) {
    for (let x = ua; x < ub; x++) {
      const i = zb.i(x, z), k = (z - room.z0) * R + (x - room.x0);
      zb.floor[i] = room.F[k]; zb.ceil[i] = room.C[k];
      zb.fmat[i] = room.FM[k]; zb.wmat[i] = room.WM[k]; zb.cmat[i] = M.ei_tile_ceil;
      zb.solid[i] = room.S[k] ? M.ei_tile_wall : 0;
      zb.flags[i] = room.FL[k];
    }
  }
}

// thin walls along the lattice lines, with the openings of every edge type; arches and colonnades
function walls(zb) {
  const tile = M.ei_tile_wall;
  for (let x = zb.x0; x < zb.x1; x++) {
    if (!onLine(x)) continue;
    const i = x / R;
    for (let z = zb.z0; z < zb.z1; z++) {
      const j = Math.floor(z / R), t = z - j * R, et = edgeType('V', i, j);
      if (!edgeOpenAt(et, t) && !solidAt(x - 1, z) && !solidAt(x, z)) zb.setWall(x, z, 'W', W.WALL, tile, tile);
    }
  }
  for (let z = zb.z0; z < zb.z1; z++) {
    if (!onLine(z)) continue;
    const j = z / R;
    for (let x = zb.x0; x < zb.x1; x++) {
      const i = Math.floor(x / R), t = x - i * R, et = edgeType('H', i, j);
      if (!edgeOpenAt(et, t) && !solidAt(x, z - 1) && !solidAt(x, z)) zb.setWall(x, z, 'N', W.WALL, tile, tile);
    }
  }
}

function archesAndColonnades(zb, room) {
  const { i, j } = room;
  for (const dir of ['V', 'H']) {
    const et = edgeType(dir, i, j);
    if (et < 1 || et === 4 || et === 6) continue;
    const H = wallHeight(dir, i, j);
    const along = (t) => (dir === 'V' ? [i * R, j * R + t] : [i * R + t, j * R]);
    for (const c of archCentres(et)) {
      const [x, z] = along(c);
      if (!owns(zb, x, z)) continue;
      zb.prop('ei_arch', x, 0, z, dir === 'V' ? Math.PI / 2 : 0, { ax: dir === 'V' ? 'z' : 'x', w: 4, sp: 1.1, H });
    }
    if (et === 3) for (const c of [4, 8, 12]) { const [x, z] = along(c); pillar(zb, x, z, 0, H); }
  }
}

function pillar(zb, x, z, base, top) {
  cbox(zb, x - 0.45, base - 0.05, z - 0.45, x + 0.45, top, z + 0.45, M.ei_tile_wall, { skip: FACE.NY | FACE.PY, sub: 2 });
  cbox(zb, x - 0.56, top - 0.4, z - 0.56, x + 0.56, top, z + 0.56, M.ei_tile_edge, { skip: FACE.PY, sub: 1 });
  cbox(zb, x - 0.56, base, z - 0.56, x + 0.56, base + 0.3, z + 0.56, M.ei_tile_edge, { skip: FACE.NY, sub: 1 });
}

function emitRoom(zb, room) {
  archesAndColonnades(zb, room);
  const { x0, z0 } = room;
  let first = true;
  for (const p of room.pools) {
    cbox(zb, x0 + p.u0, WATER_Y - 0.02, z0 + p.v0, x0 + p.u1, WATER_Y, z0 + p.v1, M.ei_water, { alpha: 0.5, collide: false, skip: only(FACE.PY), sub: 2 });
    const cx = x0 + (p.u0 + p.u1) / 2, cz = z0 + (p.v0 + p.v1) / 2;
    if (first && (p.u1 - p.u0) * (p.v1 - p.v0) >= 24 && owns(zb, cx, cz)) { zb.emitter(cx, 0.3, cz, 'water', { vol: 0.2, rad: 18 }); first = false; }
  }
  poolDetails(zb, room);
  windows(zb, room);
  if (room.type === 'arrival') {
    for (const z of [137, 151]) {
      if (owns(zb, 147, z)) zb.prop('ei_ladder', 147, 0, z, Math.PI / 2, { d: 1.2 });
      if (owns(zb, 173, z)) zb.prop('ei_ladder', 173, 0, z, -Math.PI / 2, { d: 1.2 });
    }
  }
  for (const q of room.pillars) {
    const u = Math.floor(q.x - x0), v = Math.floor(q.z - z0);
    const base = u >= 0 && v >= 0 && u < R && v < R ? room.F[v * R + u] : 0;
    pillar(zb, q.x, q.z, base, room.ceilH);
  }
  for (const w of room.wells) {
    if (!owns(zb, w.x, w.z)) continue;
    zb.decal(w.x, w.top, w.z, 'down', w.s, w.s, 'ei_sky', { lit: false, glow: 1.25 });
    zb.light(w.x, w.top - 0.6, w.z, { rad: 8, int: 0.8, color: [0.93, 1.0, 1.0] });
  }
  for (const p of room.panels) {
    if (!zb.in(Math.floor(p.x), Math.floor(p.z))) continue;
    const u = hr(p.x, p.z, 61);
    ceilingLight(zb, p.x + 0.5, p.z + 0.5, 'panel', u < 0.06 ? 'flicker' : 'on', { mul: 1.1 });
  }
  for (const d of room.drips) if (owns(zb, d.x, d.z)) zb.emitter(d.x + 0.5, 2.5, d.z + 0.5, 'drip', { vol: 0.35, rad: 12 });
}

// a ladder on the deep side of every pool and a drain in the middle of its floor
function poolDetails(zb, room) {
  const { x0, z0 } = room;
  for (const p of room.pools) {
    if (!p.deck && !p.part) continue;
    const w = p.u1 - p.u0, d = p.v1 - p.v0;
    if (w * d < 24 && !p.deck) continue;
    const cx = x0 + (p.u0 + p.u1) / 2, cz = z0 + (p.v0 + p.v1) / 2;
    if (p.deck) {
      const opp = { N: 'S', S: 'N', E: 'W', W: 'E' }[p.shallow] || 'S';
      const off = Math.round((hr(room.i * 3 + p.u0, room.j * 5 + p.v0, 71) - 0.5) * (opp === 'N' || opp === 'S' ? w - 3 : d - 3));
      let lx, lz, rot;
      if (opp === 'S') { lx = cx + off; lz = z0 + p.v1; rot = 0; }
      else if (opp === 'N') { lx = cx + off; lz = z0 + p.v0; rot = Math.PI; }
      else if (opp === 'E') { lx = x0 + p.u1; lz = cz + off; rot = -Math.PI / 2; }
      else { lx = x0 + p.u0; lz = cz + off; rot = Math.PI / 2; }
      if (owns(zb, lx, lz)) zb.prop('ei_ladder', lx + 0.0, 0, lz, rot, { d: p.D });
    }
    const u = Math.floor(cx - x0), v = Math.floor(cz - z0);
    if (owns(zb, cx, cz) && u >= 0 && v >= 0 && u < R && v < R) zb.decal(cx, room.F[v * R + u], cz, 'up', 0.9, 0.9, 'ei_drain');
  }
}

// square openings of daylight in the closed walls of halls
function windows(zb, room) {
  if (room.type === 'corr') return;
  const { i, j, x0, z0 } = room;
  const spots = [];
  if (room.type === 'arrival') {
    if (i === ARRIVAL.i0 && j === ARRIVAL.j0) for (const x of [151, 169]) { spots.push([x, 128.1, 'pz']); spots.push([x, 159.9, 'nz']); }
    if (i === ARRIVAL.i0 && j === ARRIVAL.j0) for (const z of [135, 153]) { spots.push([144.1, z, 'px']); spots.push([175.9, z, 'nx']); }
  } else {
    if (edgeType('V', i, j) === 0) spots.push([x0 + 0.1, z0 + 8, 'px']);
    if (edgeType('V', i + 1, j) === 0) spots.push([x0 + R - 0.1, z0 + 8, 'nx']);
    if (edgeType('H', i, j) === 0) spots.push([x0 + 8, z0 + 0.1, 'pz']);
    if (edgeType('H', i, j + 1) === 0) spots.push([x0 + 8, z0 + R - 0.1, 'nz']);
  }
  for (const [x, z, f] of spots) {
    if (!owns(zb, x, z)) continue;
    zb.decal(x, Math.min(2.7, room.ceilH - 1.3), z, f, 3.2, 1.7, 'ei_sky', { lit: false, glow: 1.1 });
  }
}

// the cabin on the promenade: a pale daylight window in every wall, a lamp and a sign over each door
function dressCabin(zb, v) {
  const H = v.H;
  for (const zz of [v.oz + 1.5, v.oz + 5.5]) {
    zb.decal(v.x0, 1.6, zz, 'nx', 1.4, 1.0, 'ei_sky', { lit: false, glow: 1.1 });
    zb.decal(v.x1, 1.6, zz, 'px', 1.4, 1.0, 'ei_sky', { lit: false, glow: 1.1 });
  }
  zb.decal(v.ox + 2.0, 1.7, v.z1, 'pz', 1.0, 0.9, 'ei_sky', { lit: false, glow: 1.1 });
  zb.decal(v.ox + 1.0, 1.7, v.z0, 'nz', 1.0, 0.9, 'ei_sky', { lit: false, glow: 1.1 });
  const [sx, sz] = v.southDoor, [nx, nz] = v.northDoor;
  zb.fixture(sx, sz - 0.2, 'cage', true, { y: H, hang: 0.3 });
  zb.light(sx, H - 0.6, sz + 0.3, { rad: 7, int: 0.5, color: [0.9, 1, 1] });
  zb.fixture(nx, nz + 0.2, 'cage', true, { y: H, hang: 0.3 });
  zb.light(nx, H - 0.6, nz - 0.3, { rad: 7, int: 0.5, color: [0.9, 1, 1] });
  zb.decal(v.ox + 0.5, 2.55, v.z1, 'pz', 0.7, 0.7, 'ei_sign_changing');
  zb.decal(v.ox + 2.5, 2.55, v.z0, 'nz', 0.7, 0.7, 'ei_sign_changing');
  // the hall ceiling above the cabin (the footprint of the vestibule has none of its own)
  zb.box(v.ox - 1, ARRIVAL.ceil, v.oz - 1, v.ox + 4, ARRIVAL.ceil + 0.3, v.oz + v.D + 1, M.ei_tile_ceil, { skip: only(FACE.NY), collide: false, sub: 1 });
}

defineZone('p_pools', {
  border: 'open', gate: 'open', dims: [ID],
  allowStairs: false, allowPortals: false,
  weight: () => 0,
  params: () => ({
    wallMat: M.ei_tile_wall, floorMat: M.ei_tile_floor, ceilMat: M.ei_tile_ceil, ceilH: 4.4,
    ambient: [0.66, 0.72, 0.72],
    env: env({ fog: [0.8, 0.92, 0.92], fogNear: 8, fogFar: 46, hum: 0.12, hvac: 0.1, reverb: 'tile', tone: 'water' }),
  }),
  gen: genPools,
});
