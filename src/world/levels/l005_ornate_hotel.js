// Level 5: Ornate Hotel. Endless gilded galleries cross under nine-metre coffered ceilings; where
// two meet there is a thirteen-metre hall under a great chandelier. Gilt doors line the galleries and
// above every one a brass plate shows a room number that is different each time you look back:
// each plate exists as several variants and a script swaps them while they are off screen.
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, env, M, hr, levelDoor } from './kit.js';
import { Loc, roomFrame, face, offscreen, flatSlab } from './g01_kit.js';
import './l005_ornate_hotel_tex.js';
import './l005_ornate_hotel_props.js';

const N = 5;
const G = 64;                       // lattice period: one crossing per zone
const GA = 28, GB = 37, GC = 32.5;  // gallery cells [28, 37), centre line 32.5
const GH = 9, HH = 13, SH = 4.4;    // gallery, hall and suite ceiling heights
const HALL0 = 22, HALL1 = 43;
const WARM = [1.0, 0.78, 0.48];
const NVAR = 3;                     // plate variants
const SEPS = [0, 7, 14, 21, 43, 50, 57, 63];

// ------------------------------------------------------------------ bays (rooms along galleries)
const BAYS = [];
for (const s of [1, 8, 15, 44, 51]) { BAYS.push({ ax: 'x', side: 'N', s }); BAYS.push({ ax: 'x', side: 'S', s }); }
for (const s of [1, 8, 51]) { BAYS.push({ ax: 'z', side: 'W', s }); BAYS.push({ ax: 'z', side: 'E', s }); }

// geometry of one gallery wall / bay. axis 'u': a wall running along u (E-W gallery), 'v' along v.
function wallGeom(ax, side) {
  if (ax === 'x') { const n = side === 'N'; return { axis: 'u', plane: n ? GA : GB, nx: 0, nz: n ? 1 : -1, row: n ? GA - 1 : GB, door: n ? 'S' : 'N' }; }
  const w = side === 'W';
  return { axis: 'v', plane: w ? GA : GB, nx: w ? 1 : -1, nz: 0, row: w ? GA - 1 : GB, door: w ? 'E' : 'W' };
}
function bayGeom(b) {
  const g = wallGeom(b.ax, b.side), s = b.s;
  const back = g.nx + g.nz > 0 ? -1 : 1;           // rooms lie behind the wall row, away from the gallery
  const lo = g.row + (back > 0 ? 1 : -12), hi = g.row + (back > 0 ? 13 : 0);
  if (g.axis === 'u') return { ...g, rect: [s, lo, s + 6, hi], doorCells: [[s + 2, g.row], [s + 3, g.row]], t0: s + 2 };
  return { ...g, rect: [lo, s, hi, s + 6], doorCells: [[g.row, s + 2], [g.row, s + 3]], t0: s + 2 };
}

// a slab standing on a gallery wall plane (protruding d into the gallery), t0..t1 along the wall
function slab(Z, g, t0, t1, d, y0, y1, mat, o) {
  if (g.axis === 'u') return Z.box(t0, y0, g.nz > 0 ? g.plane : g.plane - d, t1, y1, g.nz > 0 ? g.plane + d : g.plane, mat, o);
  return Z.box(g.nx > 0 ? g.plane : g.plane - d, y0, t0, g.nx > 0 ? g.plane + d : g.plane, y1, t1, mat, o);
}
// point on the wall plane at t (offset off into the gallery) in local (u, v)
const onPlane = (g, t, off = 0) => (g.axis === 'u' ? [t, g.plane + g.nz * off] : [g.plane + g.nx * off, t]);
// decal face name for a wall plane facing into the gallery
const decalFace = (g) => (g.axis === 'u' ? (g.nz > 0 ? 'pz' : 'nz') : (g.nx > 0 ? 'px' : 'nx'));
const faceOf = (g) => face(g.nx, g.nz);

// ------------------------------------------------------------------ the zone
function gen(zb) {
  zb.noConnectivity = true;
  const Z = new Loc(zb);
  const zi = Math.floor(zb.x0 / G), zj = Math.floor(zb.z0 / G);
  const R = (a, b = 0, c = 0) => hr(zi * 997 + a, zj * 991 + b, 5000 + c);
  const origin = zi === 0 && zj === 0;
  const mw = M.lv5_wall;

  Z.each(0, 0, G, G, (u, v, i) => { zb.solid[i] = mw; zb.floor[i] = 0; zb.ceil[i] = 3; zb.wmat[i] = mw; });
  const gal = { floor: 0, ceil: GH, fmat: M.lv5_floor, cmat: M.lv5_coffer, wmat: mw };
  Z.carve(GA, 0, GB, G, gal);
  Z.carve(0, GA, G, GB, gal);
  Z.carve(HALL0, HALL0, HALL1, HALL1, { ...gal, ceil: HH });

  // arrival: the N-S gallery ends in a wall with an arched recess where the door stands
  if (origin) {
    Z.solid(GA, 59, GB, G, mw);
    Z.carve(30, 59, 35, 60, gal);
    Z.box(30, 3.8, 59, 35, GH, 60, [mw, mw, mw, M.lv5_dado, mw, mw]);
    for (const t of [29.8, 34.8]) Z.box(t, 0, 58.8, t + 0.2, 3.8, 59.0, M.lv5_gold);
    Z.box(29.8, 3.8, 58.8, 35.0, 4.1, 59.02, M.lv5_gold);
    Z.light(GC, 3.0, 58.2, { color: WARM, rad: 8, int: 0.8 });
    Z.light(GC, 2.4, 59.6, { color: [1, 0.85, 0.6], rad: 3, int: 0.45 });
    Z.prop('lv5_urn', 29.4, 0, 58.0, 0, { h: 1.2 });
    Z.prop('lv5_urn', 35.6, 0, 58.0, 0, { h: 1.2 });
    Z.decal(GC, 6.0, 59.0, 'nz', 3.0, 2.4, 'lv5_paint_a');
    Z.prop('g01_num', GC, 4.35, 59.0, face(0, -1), { text: '0', h: 0.34, bg: 'lv5_plate', frame: 'lv5_gold', tint: [1.0, 0.84, 0.42], pad: 0.14 });
  }

  runners(Z);
  hall(Z, R);
  for (const ax of ['x', 'z']) for (const side of ax === 'x' ? ['N', 'S'] : ['W', 'E']) {
    const g = wallGeom(ax, side);
    SEPS.forEach((sep, k) => pilaster(Z, g, sep + 0.5, k % 2 === 0));
    for (const [t0, t1] of [[0, HALL0], [HALL1, G]]) slab(Z, g, t0, t1, 0.3, GH - 0.5, GH, M.lv5_gold);
  }
  const alcove = origin ? -1 : Math.floor(R(3, 4) * BAYS.length);
  BAYS.forEach((b, idx) => bay(Z, zi, zj, b, idx === alcove, R));
  chandeliers(Z, R);
  // blank stretches of the N-S gallery walls: a tall mirror, a console, palms
  for (const [t, side] of [[18, 'W'], [18, 'E'], [46.5, 'W'], [46.5, 'E']]) {
    const g = wallGeom('z', side);
    const [pu, pv] = onPlane(g, t, 0.01);
    Z.decal(pu, 2.6, pv, decalFace(g), 1.7, 2.6, 'lv5_mirror');
    const [cu, cv] = onPlane(g, t, 0.45);
    Z.prop('lv5_console', cu, 0, cv, faceOf(g), {});
    const [qu, qv] = onPlane(g, t - 2.4, 0.5); Z.prop('lv5_palm', qu, 0, qv, 0, {});
    const [ru, rv] = onPlane(g, t + 2.4, 0.5); Z.prop('lv5_urn', ru, 0, rv, 0, { h: 1.2 });
  }
  if (R(8, 9) < 0.7) { const g = wallGeom('x', 'N'); const [cu, cv] = onPlane(g, 18, 0.35); Z.prop('lv5_clock', cu, 0, cv, faceOf(g), {}); }
}

// the red runners: flat slabs with their own texture mapping, four arms and the crossing
function runners(Z) {
  const x0 = Z.x0, z0 = Z.z0, th = 0.03;
  flatSlab(Z, 30, 0, 35, 30, 0, th, M.lv5_carpet_ns, (x) => (x - x0 - 30) / 5, (z) => z / 5);
  flatSlab(Z, 30, 35, 35, G, 0, th, M.lv5_carpet_ns, (x) => (x - x0 - 30) / 5, (z) => z / 5);
  flatSlab(Z, 0, 30, 30, 35, 0, th, M.lv5_carpet_ew, (x) => x / 5, (z) => (z - z0 - 30) / 5);
  flatSlab(Z, 35, 30, G, 35, 0, th, M.lv5_carpet_ew, (x) => x / 5, (z) => (z - z0 - 30) / 5);
  flatSlab(Z, 30, 30, 35, 35, 0, th, M.lv5_carpet_x, (x) => (x - x0 - 30) / 5, (z) => (z - z0 - 30) / 5);
}

function pilaster(Z, g, t, lamp) {
  slab(Z, g, t - 0.38, t + 0.38, 0.32, 0, GH - 0.55, M.lv5_column);
  slab(Z, g, t - 0.46, t + 0.46, 0.4, 0, 0.35, M.lv5_gold);
  slab(Z, g, t - 0.5, t + 0.5, 0.42, GH - 1.15, GH - 0.55, M.lv5_gold);
  if (!lamp) return;
  const [pu, pv] = onPlane(g, t, 0.33);
  Z.prop('lv5_sconce', pu, 3.0, pv, faceOf(g), {});
}

function hall(Z, R) {
  const c = GC;
  for (const [u, v] of [[25, 25], [40, 25], [25, 40], [40, 40]]) {
    Z.prop('lv5_column', u, 0, v, 0, { h: HH - 0.4 });
    Z.light(u + (u < c ? 1.2 : -1.2), 3.4, v + (v < c ? 1.2 : -1.2), { color: WARM, rad: 8, int: 0.55 });
    Z.prop('lv5_urn', u + (u < c ? -1.4 : 1.4), 0, v + (v < c ? -1.4 : 1.4), 0, { h: 1.3 });
  }
  // a stained-glass skylight over the middle of the hall, and the great chandelier before it
  flatSlab(Z, 28, 28, 37, 37, HH - 0.08, HH - 0.02, M.lv5_sky, (x) => (x - Z.x0 - 28) / 9, (z) => (z - Z.z0 - 28) / 9, null, { bottom: true, collide: false });
  Z.light(c, 11.5, c, { color: [0.62, 0.72, 1.0], rad: 10, int: 0.5 });
  Z.dynamic('lv5_chandelier', c, HH - 0.1, c, 0, { drop: 3.6, r: 2.1, tiers: 3 }, { spin: 0.05 });
  Z.light(c, 7.0, c, { color: WARM, rad: 10, int: 1.3 });
  for (const [dx, dz] of [[5, 5], [-5, -5], [5, -5], [-5, 5]]) Z.light(c + dx, 4.5, c + dz, { color: WARM, rad: 9, int: 0.55 });
  if (R(10, 11) < 0.5) {
    Z.prop('table_round', c, 0, c, 0, { r: 1.0, top: 'marble' });
    Z.prop('lv5_urn', c, 0.76, c, 0, { h: 0.6 });
  } else {
    Z.prop('piano', c, 0, c + 3.4, face(0, 1), {});
    Z.prop('bench', c, 0, c + 2.2, face(0, -1), { len: 1.0 });
  }
  for (const [u, v, dz] of [[29.5, 22.6, 1], [35.5, 22.6, 1], [29.5, 42.4, -1], [35.5, 42.4, -1]]) Z.prop('bench', u, 0, v, face(0, dz), { len: 1.4 });
}

function chandeliers(Z, R) {
  for (let k = 0; k < 8; k++) {
    const t = 4 + k * 8;
    if (t > HALL0 - 3 && t < HALL1 + 3) continue;
    for (const [u, v, ax] of [[GC, t, 'z'], [t, GC, 'x']]) {
      const out = R(20 + k, ax === 'x' ? 1 : 2) < 0.1;
      Z.prop('lv5_chandelier', u, GH, v, 0, { drop: 1.4, r: 1.0, tiers: 2 });
      if (!out) Z.light(u, GH - 2.8, v, { color: WARM, rad: 9, int: 1.05, ch: R(30 + k, ax === 'x' ? 3 : 4) < 0.12 ? 2 : 0 });
    }
  }
}

// ------------------------------------------------------------------ one bay: door, plate, room
function bay(Z, zi, zj, b, isAlcove, R) {
  const g = bayGeom(b);
  const [d0, d1] = g.doorCells;
  const key = (zi * G + (g.axis === 'u' ? b.s : g.plane)) * 7919 + (zj * G + (g.axis === 'u' ? g.plane : b.s));
  const open = isAlcove || R(b.s * 3 + g.plane, b.ax === 'x' ? 1 : 2, 40) < 0.46;
  const du0 = Math.min(d0[0], d1[0]), du1 = Math.max(d0[0], d1[0]) + 1, dv0 = Math.min(d0[1], d1[1]), dv1 = Math.max(d0[1], d1[1]) + 1;
  const t0 = g.axis === 'u' ? du0 : dv0, tc = t0 + 1;
  const wid = isAlcove ? 1 : 0;
  // gilt frame on the gallery wall
  slab(Z, g, t0 - 0.16 - wid, t0 - wid, 0.1, 0, 2.7, M.lv5_gold);
  slab(Z, g, t0 + 2 + wid, t0 + 2.16 + wid, 0.1, 0, 2.7, M.lv5_gold);
  slab(Z, g, t0 - 0.16 - wid, t0 + 2.16 + wid, 0.12, 2.7, 3.0, M.lv5_gold);
  const doorway = (u, v) => Z.carve(u, v, u + 1, v + 1, { floor: 0, ceil: GH, fmat: M.lv5_floor, cmat: M.lv5_coffer, wmat: M.lv5_wall });
  for (let u = du0; u < du1; u++) for (let v = dv0; v < dv1; v++) doorway(u, v);
  if (isAlcove) { if (g.axis === 'u') { doorway(du0 - 1, dv0); doorway(du1, dv0); } else { doorway(du0, dv0 - 1); doorway(du0, dv1); } }
  const lw = isAlcove ? 1 : 0;
  Z.box(du0 - (g.axis === 'u' ? lw : 0), isAlcove ? 3.6 : 2.7, dv0 - (g.axis === 'v' ? lw : 0), du1 + (g.axis === 'u' ? lw : 0), GH, dv1 + (g.axis === 'v' ? lw : 0), [M.lv5_wall, M.lv5_wall, M.lv5_wall, M.lv5_dado, M.lv5_wall, M.lv5_wall]);
  if (isAlcove) alcoveRoom(Z, g, tc);
  else if (open) suite(Z, g, R, key);
  else {
    const [pu, pv] = onPlane(g, tc, -0.55);
    Z.prop('lv5_door2', pu, 0, pv, faceOf(g), {});
  }
  // number plate with several variants, one shown at a time (the script swaps them off screen)
  const [pu, pv] = onPlane(g, tc, 0.0);
  const rot = faceOf(g);
  const id = '5:' + key;
  const floorNo = 1 + Math.floor(R(b.s, g.plane, 61) * 38);
  if (isAlcove) Z.prop('g01_num', pu, 3.2, pv, rot, { text: '0', h: 0.3, bg: 'lv5_plate', frame: 'lv5_gold', tint: [1.0, 0.84, 0.42], pad: 0.12 });
  else for (let k = 0; k < NVAR; k++) {
    const num = String(k === 0 ? floorNo * 100 + 1 + Math.floor(hr(key, 1, 77) * 98) : 100 + Math.floor(hr(key + k * 13, k, 77) * 4899));
    Z.dynamic('g01_num', pu, 3.2, pv, rot, { text: num, h: 0.3, bg: 'lv5_plate', frame: 'lv5_gold', tint: [1.0, 0.84, 0.42], pad: 0.12 }, { flip: id, v: k, n: NVAR, showNear: k === 0 ? 1e9 : 0 });
  }
  // dressing either side of the door: paintings, mirrors, consoles, plants
  [t0 - 1.3 - wid, t0 + 3.3 + wid].forEach((t, s) => {
    const kind = Math.floor(R(b.s + s * 5, g.plane, 70) * 4);
    const [wu, wv] = onPlane(g, t, 0.012);
    const fd = decalFace(g);
    if (kind === 0) Z.decal(wu, 2.3, wv, fd, 0.95, 1.2, 'lv5_paint_a');
    else if (kind === 1) Z.decal(wu, 2.3, wv, fd, 0.95, 1.2, 'lv5_paint_b');
    else if (kind === 2) Z.decal(wu, 2.3, wv, fd, 0.95, 1.2, 'lv5_paint_c');
    else Z.decal(wu, 2.4, wv, fd, 0.95, 1.55, 'lv5_mirror');
    if (kind !== 1) { const [cu, cv] = onPlane(g, t, 0.3); Z.prop('lv5_console', cu, 0, cv, rot, {}); }
    else { const [cu, cv] = onPlane(g, t, 0.4); Z.prop('lv5_palm', cu, 0, cv, 0, {}); }
  });
}

function alcoveRoom(Z, g, tc) {
  let u, v;
  if (g.axis === 'u') {
    const row = g.nz > 0 ? g.row - 1 : g.row + 1;
    Z.carve(tc - 2, row, tc + 2, row + 1, { floor: 0, ceil: 3.6, fmat: M.lv5_floor, cmat: M.lv5_dado, wmat: M.lv5_wall });
    u = tc; v = row + 0.5;
  } else {
    const col = g.nx > 0 ? g.row - 1 : g.row + 1;
    Z.carve(col, tc - 2, col + 1, tc + 2, { floor: 0, ceil: 3.6, fmat: M.lv5_floor, cmat: M.lv5_dado, wmat: M.lv5_wall });
    u = col + 0.5; v = tc;
  }
  levelDoor(Z.zb, Z.x(u), Z.z(v), faceOf(g), {});
  Z.light(u + g.nx * 0.9, 2.6, v + g.nz * 0.9, { color: [1.0, 0.82, 0.55], rad: 6, int: 0.65 });
}

// ------------------------------------------------------------------ the suite behind a door
function suite(Z, g, R, key) {
  const [u0, v0, u1, v1] = g.rect;
  Z.carve(u0, v0, u1, v1, { floor: 0, ceil: SH, fmat: M.carpet_hotel, cmat: M.lv5_coffer, wmat: M.lv5_wall });
  const F = roomFrame(u0, v0, u1, v1, g.door);
  const kind = Math.floor(hr(key, 3, 91) * 3);
  const P = (type, a, bb, y, rot, o) => { const [u, v] = F.pt(a, bb); return Z.prop(type, u, y, v, rot, o || {}); };
  const L = (a, bb, y, o) => { const [u, v] = F.pt(a, bb); Z.light(u, y, v, o); };
  { const [u, v] = F.pt(3, 6); Z.prop('lv5_chandelier', u, SH, v, 0, { drop: 0.6, r: 0.5, tiers: 1 }); }
  L(3, 6, SH - 1.4, { color: WARM, rad: 8, int: 0.8 });
  L(3, 2.2, 2.6, { color: WARM, rad: 6, int: 0.45 });
  if (kind === 0) {
    P('lv5_bed', 3, 10.5, 0, F.rotOut);
    P('lv5_nightstand', 1.3, 11.45, 0, F.rotOut);
    P('lv5_nightstand', 4.7, 11.45, 0, F.rotOut);
    P('lv5_wardrobe', 0.33, 7.6, 0, F.rotR);
    P('armchair', 1.3, 4.3, 0, F.rotR, { fabric: 'velvet_red' });
    P('armchair', 4.7, 4.3, 0, F.rotL, { fabric: 'velvet_red' });
    P('table_round', 3, 4.3, 0, 0, { r: 0.42, top: 'marble' });
    P('desk', 5.6, 8.2, 0, F.rotL, { top: 'wood_dark', side: 'wood_dark' });
    P('lamp_floor', 5.5, 1.0, 0, 0, {});
  } else if (kind === 1) {
    P('sofa', 3, 10.9, 0, F.rotOut, { fabric: 'velvet_red', len: 2.2 });
    P('coffee_table', 3, 9.3, 0, F.rotOut, {});
    P('armchair', 0.9, 7.2, 0, F.rotR, { fabric: 'velvet_red' });
    P('armchair', 5.1, 7.2, 0, F.rotL, { fabric: 'velvet_red' });
    P('piano', 5.4, 3.4, 0, F.rotL, {});
    P('lv5_wardrobe', 0.33, 2.4, 0, F.rotR);
    P('lv5_palm', 0.6, 11.3, 0, 0, {});
  } else {
    P('table', 3, 7, 0, F.rotOut, { len: 3.4, depth: 1.1, top: 'wood_dark' });
    for (let k = 0; k < 3; k++) { P('chair_exec', 1.9 + k * 1.1, 8.0, 0, F.rotOut); P('chair_exec', 1.9 + k * 1.1, 6.0, 0, F.rotIn); }
    P('lv5_console', 3, 11.7, 0, F.rotOut, {});
    P('lv5_clock', 5.5, 11.4, 0, F.rotOut, {});
    P('lv5_urn', 0.6, 11.3, 0, 0, { h: 1.0 });
  }
  { const [u, v] = F.pt(3, 11.97); Z.prop('lv5_window', u, 0, v, F.rotOut, { w: 1.4, h: 1.5, y0: 1.5 }); }
  { const [u, v] = F.pt(5.97, 6.0); Z.decal(u, 2.1, v, faceName(F.rotL), 0.95, 1.2, 'lv5_paint_c'); }
}
// decal face name for a wall whose front (facing into the room) points along a prop rotation
function faceName(rot) {
  const dx = Math.round(Math.sin(rot)), dz = Math.round(-Math.cos(rot));
  return dx > 0 ? 'px' : dx < 0 ? 'nx' : dz > 0 ? 'pz' : 'nz';
}

// ------------------------------------------------------------------ the zone type and level
defineZone('lv5_hotel', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.25, 0.19, 0.13],
    env: env({ fog: [0.12, 0.075, 0.04], fogNear: 7, fogFar: 64, hum: 0, hvac: 0.1, reverb: 'hall', tone: 'lv5_hall' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'ORNATE HOTEL',
  zoneType: 'lv5_hotel',
  zoneSize: G,
  entry: { x: 32.5, y: 0, z: 58.5, yaw: 0, pitch: 0 },
  doorDensity: 0,
  viewRadius: 4,
  light: { phoneRadius: 4, phoneIntensity: 0.25 },
  script(ctx, dt) {
    const s = ctx.state;
    const plates = s.plates || (s.plates = new Map());
    const p = ctx.player;
    const off = offscreen(ctx);
    const now = ctx.time;
    // a plate that has been in view and now is not may show another number
    for (const ch of ctx.game.world.chunksNear(p.dim, p.x, p.z, 44)) {
      if (!ch.dyn) continue;
      for (const dy of ch.dyn) {
        const a = dy.anim;
        if (!a || a.flip === undefined) continue;
        let g = plates.get(a.flip);
        if (!g) { g = { cur: 0, seen: 0, n: a.n || NVAR }; plates.set(a.flip, g); }
        if (a.v === 0) {
          const d = Math.hypot(dy.x - p.x, dy.z - p.z);
          const hidden = off(dy.x, dy.y + 0.3, dy.z, 0.25);
          if (!hidden && d < 40) g.seen = now;
          else if (g.seen && now - g.seen > 0.35 && hidden) {
            g.seen = 0;
            if (Math.random() < 0.85) {
              g.cur = (g.cur + 1 + Math.floor(Math.random() * (g.n - 1))) % g.n;
              if (d < 16 && now - (s.lastFlap || 0) > 1.2) { s.lastFlap = now; ctx.game.audioCall('play', 'lv5_flap', dy.x, dy.y, dy.z, { vol: 0.5 }); }
            }
          }
        }
        a.showNear = g.cur === a.v ? 1e9 : 0;
      }
    }
    // now and then a tall clock somewhere far off strikes
    s.chime = (s.chime ?? 40) - dt;
    if (s.chime < 0) {
      s.chime = 70 + Math.random() * 90;
      const ang = Math.random() * 6.28;
      ctx.game.audioCall('play', 'lv5_chime', p.x + Math.sin(ang) * 26, p.y + 2, p.z - Math.cos(ang) * 26, { distant: true, vol: 0.8 });
    }
  },
});
