// St. Agatha General Hospital: three floors laid out like a real building.
//   Basement (y=-4): boiler room, morgue (cold storage + autopsy), pathology, laundry
//   Ground   (y= 0): lobby & reception, records, pharmacy, admin, radiology, triage, chapel
//   First    (y= 4): Ward A (101-110), nurse station, day room, surgery, recovery, Ward B
// Main stairwell A links G<->1 (its basement flight has collapsed); service
// stairwell B links B<->G; the open elevator shaft (with a ladder) links all three.
import { Level, T, F, ci, cj, CELL, GX0, GZ0 } from './plan.js';
import { defineStair, defineShaft } from './architecture.js';
import { addLamp } from './lighting.js';
import * as P from './props.js';

const PI = Math.PI;

export function buildLayout() {
  const L = new Level();
  // ------------------------------------------------------------ footprints
  L.footprint(-1, 0, 0, 56, 17);
  L.footprint(0, 0, 0, 56, 17);
  L.footprint(0, 20, 16.5, 36, 27);
  L.footprint(1, 0, 0, 56, 17);

  const rooms = {};
  const R = (key, k, x0, z0, x1, z1, style, name, opts) => (rooms[key] = L.room(k, x0, z0, x1, z1, style, name, opts));

  // ---------------------------------------------------------------- BASEMENT
  R('corB', -1, 16.5, 7, 55.5, 10, 'basement', 'BASEMENT CORRIDOR', { corridor: true, decay: 0.85, ambient: [0.035, 0.032, 0.03] });
  R('boiler', -1, 0.5, 0.5, 16, 16.5, 'basement', 'BOILER ROOM', { decay: 0.9, ambient: [0.04, 0.035, 0.03] });
  R('workshop', -1, 16.5, 0.5, 23.5, 6.5, 'service', 'MAINTENANCE WORKSHOP', { decay: 0.7 });
  R('storageB', -1, 31, 0.5, 34.5, 6.5, 'service', 'STORAGE', { decay: 0.7 });
  R('cold', -1, 35, 0.5, 43.5, 6.5, 'morgue', 'MORTUARY — COLD STORAGE', { decay: 0.6, ambient: [0.03, 0.034, 0.04] });
  R('autopsy', -1, 44, 0.5, 51.5, 6.5, 'morgue', 'MORTUARY — AUTOPSY', { decay: 0.6, ambient: [0.03, 0.034, 0.04] });
  R('laundry', -1, 16.5, 10.5, 27.5, 16.5, 'service', 'LAUNDRY', { decay: 0.8 });
  R('archive', -1, 28, 10.5, 35.5, 16.5, 'service', 'RECORDS ARCHIVE', { decay: 0.7 });
  R('pathology', -1, 36, 10.5, 43.5, 16.5, 'ward', 'PATHOLOGY', { decay: 0.6, floor: 'floor_tile_small' });
  R('receiving', -1, 44, 10.5, 55.5, 16.5, 'service', 'MORTUARY RECEIVING', { decay: 0.7 });

  // ------------------------------------------------------------------ GROUND
  R('corG', 0, 0.5, 7, 55.5, 10, 'ward', 'GROUND FLOOR CORRIDOR', { corridor: true, decay: 0.55 });
  R('pharmacy', 0, 0.5, 0.5, 8, 6.5, 'ward', 'PHARMACY', { decay: 0.6 });
  R('records', 0, 8.5, 0.5, 16, 6.5, 'ward', 'MEDICAL RECORDS', { decay: 0.6 });
  R('admin', 0, 16.5, 0.5, 23.5, 6.5, 'office', 'ADMINISTRATION', { decay: 0.5 });
  R('exam1', 0, 31, 0.5, 34.5, 6.5, 'ward', 'EXAM ROOM 1', { decay: 0.5 });
  R('exam2', 0, 35, 0.5, 38.5, 6.5, 'ward', 'EXAM ROOM 2', { decay: 0.6 });
  R('radiology', 0, 39, 0.5, 51.5, 6.5, 'ward', 'RADIOLOGY', { decay: 0.45, floor: 'floor_tile_small' });
  R('wc', 0, 0.5, 10.5, 5.5, 16.5, 'tile', 'RESTROOMS', { decay: 0.8 });
  R('triage', 0, 6, 10.5, 20, 16.5, 'ward', 'EMERGENCY / TRIAGE', { decay: 0.6 });
  R('lobby', 0, 20.5, 10.5, 35.5, 26.5, 'lobby', 'LOBBY', { decay: 0.6, ambient: [0.045, 0.047, 0.055] });
  R('chapel', 0, 36, 10.5, 43.5, 16.5, 'chapel', 'CHAPEL', { decay: 0.4 });
  R('lounge', 0, 44, 10.5, 55.5, 16.5, 'ward', 'STAFF LOUNGE', { decay: 0.6 });

  // ------------------------------------------------------------------- FIRST
  R('cor1', 1, 0.5, 7, 55.5, 10, 'ward', 'FIRST FLOOR CORRIDOR', { corridor: true, decay: 0.65 });
  const north1 = [[101, 0.5, 4], [102, 4.5, 8], [103, 8.5, 12], [104, 12.5, 16], [105, 16.5, 20]];
  const south1 = [[110, 0.5, 4], [109, 4.5, 8], [108, 8.5, 12], [107, 12.5, 16], [106, 16.5, 20]];
  for (const [n, x0, x1] of north1) R('r' + n, 1, x0, 0.5, x1, 6.5, 'ward', `WARD A — ROOM ${n}`, { decay: 0.55 + (n % 3) * 0.1 });
  for (const [n, x0, x1] of south1) R('r' + n, 1, x0, 10.5, x1, 16.5, 'ward', `WARD A — ROOM ${n}`, { decay: 0.55 + (n % 3) * 0.1 });
  R('linen', 1, 20.5, 0.5, 23.5, 6.5, 'ward', 'LINEN STORE', { decay: 0.5 });
  R('scrub', 1, 31, 0.5, 34.5, 6.5, 'tile', 'SCRUB ROOM', { decay: 0.5 });
  R('or1', 1, 35, 0.5, 44, 6.5, 'tile', 'OPERATING THEATRE', { decay: 0.45, ceil: 'ceiling_tile' });
  R('recovery', 1, 44.5, 0.5, 55.5, 6.5, 'ward', 'RECOVERY', { decay: 0.6 });
  R('nurse', 1, 20.5, 10.5, 27.5, 16.5, 'ward', 'NURSE STATION', { decay: 0.5 });
  R('dayroom', 1, 28, 10.5, 35.5, 16.5, 'ward', 'DAY ROOM', { decay: 0.75, floor: 'floor_carpet', surface: 'carpet' });
  R('office1', 1, 36, 10.5, 39.5, 16.5, 'office', "DOCTOR'S OFFICE", { decay: 0.5 });
  R('wardB', 1, 40, 10.5, 51.5, 16.5, 'ward', 'WARD B', { decay: 0.65 });
  R('iso', 1, 52, 10.5, 55.5, 16.5, 'ward', 'ISOLATION — ROOM 112', { decay: 0.7 });

  // --------------------------------------------------- vertical circulation
  const stairA = defineStair(L, { x0: 24, z0: 0.5, x1: 27.5, z1: 6.5, kb: -1, kt: 1, name: 'STAIRWELL A', blocked: { k: -1 } });
  const stairB = defineStair(L, { x0: 52, z0: 0.5, x1: 55.5, z1: 6.5, kb: -1, kt: 0, name: 'STAIRWELL B (SERVICE)' });
  const shaft = defineShaft(L, { x0: 28, z0: 4, x1: 30.5, z1: 6.5, kb: -1, kt: 1, dx0: 28.5, dx1: 30 });

  // ------------------------------------------------------------------ doors
  const D = (k, x0, z0, x1, z1, o = {}) => L.door(k, x0, z0, x1, z1, o);
  // basement
  D(-1, 16, 7.5, 16.5, 9, { leaves: 2, tex: 'door_metal', open: 0.55, sign: 'sign_boiler', room: rooms.boiler.id });
  D(-1, 21.5, 6.5, 22.5, 7, { tex: 'door_metal', open: 0, sign: 'sign_workshop' });
  D(-1, 24.5, 6.5, 25.5, 7, { tex: 'door_metal', open: 0.9, floorSign: 'sign_floor_b' });
  D(-1, 28.5, 6.5, 30, 7, { kind: 'elevator', jammed: true });
  D(-1, 31.5, 6.5, 32.5, 7, { tex: 'door_wood', open: 0.3, sign: 'sign_storage' });
  D(-1, 39, 6.5, 40.5, 7, { leaves: 2, tex: 'door_metal', open: 0, sign: 'sign_morgue' });
  D(-1, 43.5, 2.5, 44, 3.5, { tex: 'door_metal', open: 0.8 });
  D(-1, 47, 6.5, 48, 7, { tex: 'door_metal', open: 0, sign: 'sign_lab' });
  D(-1, 52.5, 6.5, 53.5, 7, { tex: 'door_metal', open: 0.7, sign: 'sign_stairs' });
  D(-1, 17.5, 10, 18.5, 10.5, { tex: 'door_metal', open: 0.6, sign: 'sign_laundry' });
  D(-1, 29, 10, 30, 10.5, { tex: 'door_wood', open: 0, sign: 'sign_storage' });
  D(-1, 37, 10, 38, 10.5, { tex: 'door_wood', open: 0.4, sign: 'sign_lab' });
  D(-1, 45, 10, 46.5, 10.5, { leaves: 2, tex: 'door_metal', open: 0, sign: 'sign_staff' });
  // ground
  D(0, 6.5, 6.5, 7.5, 7, { tex: 'door_wood', open: 0.7, sign: 'sign_pharmacy' });
  D(0, 9, 6.5, 10, 7, { tex: 'door_wood', open: 0.0, sign: 'sign_records' });
  D(0, 22, 6.5, 23, 7, { tex: 'door_wood', open: 0.0, sign: 'sign_admin' });
  D(0, 24.5, 6.5, 25.5, 7, { tex: 'door_metal', open: 0.0, sign: 'sign_stairs', floorSign: 'sign_floor_g' });
  D(0, 28.5, 6.5, 30, 7, { kind: 'elevator' });
  D(0, 31.5, 6.5, 32.5, 7, { tex: 'door_wood', open: 0.85, sign: 'sign_exam1' });
  D(0, 35.5, 6.5, 36.5, 7, { tex: 'door_wood', open: 0.0, sign: 'sign_exam2' });
  D(0, 39.5, 6.5, 41, 7, { leaves: 2, tex: 'door_double', open: 0.0, sign: 'sign_radiology' });
  D(0, 52.5, 6.5, 53.5, 7, { tex: 'door_metal', open: 0, oneWay: { axis: 'z', side: -1 }, sign: 'sign_stairs', floorSign: 'sign_floor_g' });
  D(0, 4, 10, 5, 10.5, { tex: 'door_wood', open: 0.5, sign: 'sign_restroom' });
  D(0, 12, 10, 13.5, 10.5, { leaves: 2, tex: 'door_double', open: 0.7, sign: 'sign_triage' });
  D(0, 22, 10, 34, 10.5, { kind: 'opening', h: 2.6 });
  D(0, 39, 10, 40.5, 10.5, { leaves: 2, tex: 'door_wood', open: 0.0, sign: 'sign_chapel' });
  D(0, 45, 10, 46, 10.5, { tex: 'door_wood', open: 0.3, sign: 'sign_staff' });
  D(0, 27, 26.5, 29, 27, { leaves: 2, tex: 'door_double', open: 0, locked: 'chained', exterior: true });
  D(0, 55.5, 8, 56, 9, { tex: 'door_metal', open: 0, locked: 'chained', exterior: true });
  // first
  for (const [n, x0, x1] of north1) D(1, x1 - 1.5, 6.5, x1 - 0.5, 7, { tex: 'door_wood', open: [0.6, 0.0, 0.9, 0.35, 0.0][n - 101], plate: 'num_' + n });
  for (const [n, x0, x1] of south1)
    D(1, x0 + 0.5, 10, x0 + 1.5, 10.5, n === 108 ? { tex: 'door_wood', open: 0, barricaded: true, plate: 'num_108' } : { tex: 'door_wood', open: [0.7, 0.0, 0, 0.5, 0.95][110 - n], plate: 'num_' + n });
  D(1, 21, 6.5, 22, 7, { tex: 'door_wood', open: 0.4, sign: 'sign_storage' });
  D(1, 24.5, 6.5, 25.5, 7, { tex: 'door_metal', open: 0.6, sign: 'sign_stairs', floorSign: 'sign_floor_1' });
  D(1, 28.5, 6.5, 30, 7, { kind: 'elevator' });
  D(1, 31.5, 6.5, 32.5, 7, { tex: 'door_wood', open: 0.0, sign: 'sign_scrub' });
  D(1, 34.5, 2, 35, 3, { tex: 'door_double', open: 0.5 });
  D(1, 39, 6.5, 40.5, 7, { leaves: 2, tex: 'door_double', open: 0.3, sign: 'sign_or' });
  D(1, 45, 6.5, 46.5, 7, { leaves: 2, tex: 'door_double', open: 0.0, sign: 'sign_recovery' });
  D(1, 21, 10, 27, 10.5, { kind: 'opening', h: 2.4 });
  D(1, 29, 10, 30, 10.5, { tex: 'door_wood', open: 0.95, sign: 'sign_dayroom' });
  D(1, 36.5, 10, 37.5, 10.5, { tex: 'door_wood', open: 0, sign: 'sign_office' });
  D(1, 40.5, 10, 42, 10.5, { leaves: 2, tex: 'door_double', open: 0.6, sign: 'sign_ward_b' });
  D(1, 52.5, 10, 53.5, 10.5, { tex: 'door_wood', open: 0.0, plate: 'num_112', sign: 'sign_isolation' });

  // ---------------------------------------------------------------- windows
  const W = (k, x0, z0, x1, z1, o) => L.window(k, x0, z0, x1, z1, o);
  // basement light wells
  W(-1, 3, 0, 4.5, 0.5, { sill: 2.1, head: 2.75, broken: false });
  W(-1, 10, 0, 11.5, 0.5, { sill: 2.1, head: 2.75, broken: true });
  W(-1, 0, 11, 0.5, 12.5, { sill: 2.1, head: 2.75, broken: false });
  W(-1, 20, 16.5, 21.5, 17, { sill: 2.1, head: 2.75, broken: false });
  W(-1, 50, 16.5, 51.5, 17, { sill: 2.1, head: 2.75, broken: false });
  // ground
  for (const [a, c] of [[2, 3.5], [5, 6.5], [10.5, 12], [13.5, 15], [17.5, 19], [20.5, 22], [32, 33.5], [36, 37.5], [48, 49.5]]) W(0, a, 0, c, 0.5, { broken: a % 3 > 1 });
  W(0, 1.5, 16.5, 2.5, 17, { sill: 1.7, head: 2.4, broken: false });
  for (const [a, c] of [[8, 9.5], [15, 16.5], [46, 47.5], [51, 52.5]]) W(0, a, 16.5, c, 17, { broken: a > 40 });
  W(0, 38, 16.5, 39.5, 17, { sill: 1.0, head: 2.6, broken: false });
  W(0, 40.5, 16.5, 42, 17, { sill: 1.0, head: 2.6, broken: true });
  W(0, 20, 19, 20.5, 21, { boarded: true });
  W(0, 20, 23, 20.5, 25, { boarded: true });
  W(0, 35.5, 19, 36, 21, { broken: false });
  W(0, 35.5, 23, 36, 25, { broken: true });
  W(0, 22, 26.5, 25, 27, { broken: false });
  W(0, 31, 26.5, 34, 27, { boarded: true });
  W(0, 0, 7.5, 0.5, 9.5, { broken: true });
  // first
  for (const [n, x0] of [[101, 0.5], [102, 4.5], [103, 8.5], [104, 12.5], [105, 16.5]]) W(1, x0 + 1, 0, x0 + 2.5, 0.5, { broken: n % 2 === 1 });
  for (const [n, x0] of [[110, 0.5], [109, 4.5], [108, 8.5], [107, 12.5], [106, 16.5]]) W(1, x0 + 1, 16.5, x0 + 2.5, 17, { broken: n === 107 || n === 110, boarded: n === 108 });
  W(1, 47, 0, 48.5, 0.5, { broken: false });
  W(1, 51, 0, 52.5, 0.5, { broken: true });
  W(1, 23, 16.5, 24.5, 17, { broken: false });
  W(1, 29.5, 16.5, 31.5, 17, { broken: true });
  W(1, 32.5, 16.5, 34.5, 17, { broken: true });
  W(1, 37, 16.5, 38.5, 17, { broken: false });
  for (const [a, c] of [[42, 43.5], [45.5, 47], [49, 50.5]]) W(1, a, 16.5, c, 17, { broken: a === 45.5 });
  W(1, 53.5, 16.5, 54.5, 17, { sill: 1.6, head: 2.3, broken: false });
  W(1, 0, 7.5, 0.5, 9.5, { broken: false });
  W(1, 55.5, 7.5, 56, 9.5, { broken: true });

  // ------------------------------------------------------- ceiling damage
  const hole = (k, x0, z0, x1, z1) =>
    L.grid(k).fill(x0, z0, x1, z1, (n) => {
      if (L.grid(k).type[n] === T.FLOOR) L.grid(k).flag[n] |= F.HOLE;
    });
  hole(0, 30.5, 13, 32, 14.5);
  hole(0, 34, 7.5, 35, 8.5);
  hole(0, 12.5, 2.5, 13.5, 3.5);
  hole(0, 9, 8.5, 10, 9.5);
  hole(0, 48, 12.5, 49.5, 14);
  hole(1, 18, 7, 19.5, 8.5);
  hole(1, 32, 12, 33.5, 13);
  hole(1, 3, 2, 4, 3.5);
  hole(1, 50, 7.5, 51, 9);
  hole(1, 14, 12, 15, 13);
  hole(-1, 33, 7, 34.5, 10);
  hole(-1, 6, 12, 8, 13.5);

  L.finalize();
  L.stairA = stairA;
  L.stairB = stairB;
  L.shaft = shaft;
  L.roomsByKey = rooms;
  L.start = { x: 28, y: 0, z: 24.2, yaw: 0 };
  return L;
}

// ======================================================================
// Set dressing: runs after architecture with a MeshBuilder + Dresser.
// ======================================================================

export function dress(L, b, D) {
  const rooms = L.roomsByKey;
  const rng = D.rng;

  // ---------------------------------------------------------- helpers
  const dirs = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  function wallAt(k, x, z, dir) {
    const g = L.grid(k);
    let i = ci(x), j = cj(z);
    const [di, dj] = dirs[dir];
    for (let s = 0; s < 60; s++) {
      const t = g.at(i + di, j + dj);
      if (t === T.SOLID || t === T.OUT || t === T.WINDOW) break;
      i += di;
      j += dj;
    }
    if (dir === 'n') return { x, z: GZ0 + j * CELL, nx: 0, nz: 1 };
    if (dir === 's') return { x, z: GZ0 + (j + 1) * CELL, nx: 0, nz: -1 };
    if (dir === 'e') return { x: GX0 + (i + 1) * CELL, z, nx: -1, nz: 0 };
    return { x: GX0 + i * CELL, z, nx: 1, nz: 0 };
  }
  let decalOff = 0.012;
  function decal(k, x, z, dir, tex, w, h, yc, o = {}) {
    const p = wallAt(k, x, z, dir);
    decalOff = decalOff > 0.03 ? 0.012 : decalOff + 0.002;
    const off = (o.off ?? 0) + decalOff;
    const rot = Math.atan2(p.nx, p.nz);
    const y = k * 4;
    b.group(p.x, y + yc, p.z);
    if (o.emissive) b.emissive(...o.emissive);
    b.push(p.x + p.nx * off, y, p.z + p.nz * off, rot);
    b.panel(0, yc, 0, w, h, tex, o.emissive ? 1 : 0);
    b.pop();
    b.normalMode();
    b.ungroup();
    return p;
  }
  const graf = (k, x, z, dir, tex, w, h, yc = 1.4) => decal(k, x, z, dir, tex, w, h, yc);
  function hangSign(k, x, z, eastTex, westTex, axis = 'x') {
    const y = k * 4 + 2.45;
    b.group(x, y, z);
    if (axis === 'x') {
      b.push(x + 0.012, k * 4, z, PI / 2);
      b.panel(0, 2.45, 0, 1.3, 0.32, eastTex);
      b.pop();
      b.push(x - 0.012, k * 4, z, -PI / 2);
      b.panel(0, 2.45, 0, 1.3, 0.32, westTex);
      b.pop();
      b.box(x - 0.012, y - 0.17, z - 0.66, x + 0.012, y + 0.17, z + 0.66, 'metal_painted', { skip: 'px,nx' });
      b.tube(x, y + 0.16, z - 0.5, x, k * 4 + 3, z - 0.5, 0.008, 3, 'chrome');
      b.tube(x, y + 0.16, z + 0.5, x, k * 4 + 3, z + 0.5, 0.008, 3, 'chrome');
    }
    b.ungroup();
  }
  // Ceiling fluorescent troffer with an optional live lamp.
  function troffer(k, x, z, behavior = 'dead', o = {}) {
    const y = k * 4 + (o.ceil ?? 3);
    const along = o.axis === 'z';
    const hw = along ? 0.3 : 0.6, hd = along ? 0.6 : 0.3;
    let lamp = null;
    if (behavior !== 'dead') {
      lamp = addLamp(L, { k, x, y: y - 0.1, z, behavior, intensity: (o.intensity ?? 1.15) * 1.6, radius: o.radius ?? 7.5, color: o.color });
      L.emitters.push({ type: 'buzz', x, y: y - 0.1, z, lamp });
    }
    b.group(x, y - 0.5, z);
    if (o.hanging) {
      // fixture has dropped at one end and hangs from its wires
      b.push(x - hw, y - 0.02, z, 0, 0, -0.9);
      b.box(0, -0.08, -hd, hw * 2, 0, hd, { ny: 'fluoro_off', side: 'metal_painted', py: 'metal_painted' }, { uv: 'fit' });
      b.pop();
      b.tube(x + hw - 0.1, y, z - 0.2, x + hw * 0.4, y - 0.95, z - 0.2, 0.006, 3, 'rubber');
      b.ungroup();
      return null;
    }
    b.box(x - hw - 0.03, y - 0.03, z - hd - 0.03, x + hw + 0.03, y, z + hd + 0.03, 'metal_painted', { skip: 'py' });
    if (lamp) b.lampPanel(lamp.idx, 1.15, 1.15, 1.1);
    const tex = lamp ? 'fluoro_on' : 'fluoro_off';
    const yy = y - 0.031;
    if (along) b.quad([x - hw, yy, z + hd], [x - hw, yy, z - hd], [x + hw, yy, z - hd], [x + hw, yy, z + hd], [0.01, 0.01, 0.99, 0.01, 0.99, 0.99, 0.01, 0.99], tex, lamp ? 1 : 0);
    else b.quad([x - hw, yy, z - hd], [x + hw, yy, z - hd], [x + hw, yy, z + hd], [x - hw, yy, z + hd], [0.01, 0.99, 0.99, 0.99, 0.99, 0.01, 0.01, 0.01], tex, lamp ? 1 : 0);
    b.normalMode();
    b.ungroup();
    return lamp;
  }
  // Caged bulb on a ceiling or wall.
  function bulb(k, x, y, z, behavior = 'steady', o = {}) {
    let lamp = null;
    if (behavior !== 'dead') {
      lamp = addLamp(L, { k, x, y: y - 0.12, z, behavior, intensity: (o.intensity ?? 1.0) * 1.5, radius: o.radius ?? 6.5, color: o.color || [1.0, 0.8, 0.55], kind: 'bulb', down: false });
      L.emitters.push({ type: 'buzz', x, y, z, lamp, quiet: true });
    }
    b.group(x, y, z);
    b.box(x - 0.08, y - 0.04, z - 0.08, x + 0.08, y, z + 0.08, 'metal_rust', { skip: 'py' });
    if (lamp) b.lampPanel(lamp.idx, 1.3, 1.1, 0.8);
    b.box(x - 0.04, y - 0.16, z - 0.04, x + 0.04, y - 0.04, z + 0.04, lamp ? 'white' : 'plastic_white', { flags: lamp ? 1 : 0 });
    b.normalMode();
    for (const [ox, oz] of [[-0.07, 0], [0.07, 0], [0, -0.07], [0, 0.07]]) b.box(x + ox - 0.005, y - 0.2, z + oz - 0.005, x + ox + 0.005, y - 0.04, z + oz + 0.005, 'metal_rust');
    b.ungroup();
    return lamp;
  }
  function note(id, k, x, y, z, o = {}) {
    L.interactables.push({ type: 'note', id, k, x, y: y + 0.05, z, r: o.r ?? 0.35 });
    if (o.noGeom) return;
    b.group(x, y + 0.3, z);
    b.floorDecal(x, y + 0.012, z, o.w ?? 0.24, o.d ?? 0.32, o.rot ?? rng() * 0.6 - 0.3, o.tex || 'paper');
    b.ungroup();
  }
  const drip = (k, x, z, rate = 8) => L.emitters.push({ type: 'drip', x, y: k * 4 + 2.8, z, rate });
  const corridorLamps = (k, pattern, o = {}) => {
    for (let i = 0; i < 14; i++) {
      const x = 2.5 + i * 4;
      const ch = pattern[i];
      const beh = { '.': 'dead', s: 'steady', f: 'flicker', d: 'dying', p: 'pulse', h: 'dead' }[ch];
      troffer(k, x, 8.5, beh, { hanging: ch === 'h', ...o });
    }
  };

  // ======================================================== door dressing
  function decalAt(k, x, z, nx, nz, tex, w, h, yc, o = {}) {
    const rot = Math.atan2(nx, nz);
    const off = 0.014;
    b.group(x, k * 4 + yc, z);
    if (o.emissive) b.emissive(...o.emissive);
    b.push(x + nx * off, k * 4, z + nz * off, rot);
    b.panel(0, yc, 0, w, h, tex, o.emissive ? 1 : 0);
    b.pop();
    b.normalMode();
    b.ungroup();
  }
  for (const d of L.doors) {
    if (d.kind === 'opening') continue;
    if (d.axis !== 'x') {
      if (d.exterior) decalAt(d.k, d.x0, (d.z0 + d.z1) / 2, -1, 0, 'sign_exit', 0.5, 0.25, 2.4, { emissive: [0.9, 0.55, 0.55] });
      continue;
    }
    // signs go on the corridor side (or the inside, for exterior doors)
    const g = L.grid(d.k);
    const mx = (d.x0 + d.x1) / 2;
    const nRoom = g.roomAt(ci(mx), cj(d.z0 - 0.25));
    const sRoom = g.roomAt(ci(mx), cj(d.z1 + 0.25));
    let north;
    if (d.exterior) north = g.at(ci(mx), cj(d.z0 - 0.25)) !== T.OUT;
    else north = nRoom >= 0 && L.rooms[nRoom].corridor ? true : sRoom >= 0 && L.rooms[sRoom].corridor ? false : sRoom >= 0;
    const pz = north ? d.z0 : d.z1;
    const nz = north ? -1 : 1;
    if (d.sign) decalAt(d.k, mx, pz, 0, nz, d.sign, 1.0, 0.25, 2.45);
    if (d.plate) decalAt(d.k, d.x1 + 0.3, pz, 0, nz, d.plate, 0.32, 0.16, 1.55);
    if (d.exterior) decalAt(d.k, mx, pz, 0, nz, 'sign_exit', 0.5, 0.25, 2.4, { emissive: [0.9, 0.55, 0.55] });
    if (d.floorSign) {
      const s = d.x0 > 50 ? L.stairB : L.stairA;
      decal(d.k, s.x0 + 0.5, s.zLand[0] + 0.75, 'w', d.floorSign, 0.9, 0.9, 1.6);
    }
  }

  // ===================================================== vertical links
  // Stairwell lights and rubble blocking the collapsed basement flight.
  bulb(0, 27.3, 2.7, 5.6, 'steady', { intensity: 0.8 });
  bulb(1, 27.3, 6.7, 5.6, 'dying');
  bulb(-1, 27.3, -1.3, 5.6, 'dead');
  bulb(0, 25.2, 3.85, 1.2, 'dead');
  bulb(-1, 55.3, -1.3, 5.6, 'flicker', { intensity: 0.9 });
  bulb(0, 55.3, 2.7, 5.6, 'dead');
  {
    const s = L.stairA;
    const rz = s.zLane[1] - 0.9;
    P.rubblePile(D, 26.75, -0.9, rz, 1.1, 1.3, { chunks: 9, collide: false });
    P.rubblePile(D, 26.75, -0.2, rz + 0.6, 0.7, 0.6, { chunks: 4, collide: false });
    L.addCollider(s.lB[0], -1.4, s.zLane[1] - 1.8, s.lB[1], 0.75, s.zLane[1] + 0.1);
    // caution tape across the lane at the ground landing
    b.group(26.75, 1, s.zLane[1]);
    b.quad([26.0, 0.85, s.zLane[1] + 0.1], [27.5, 0.95, s.zLane[1] + 0.1], [27.5, 1.03, s.zLane[1] + 0.1], [26.0, 0.93, s.zLane[1] + 0.1], [0, 0, 2, 0, 2, 1, 0, 1], 'caution_tape', 2);
    b.ungroup();
    graf(0, 26.75, 3.0, 'e', 'graf_arrow', 0.6, 0.6, 1.6);
    graf(1, 26.75, 4.0, 'e', 'graf_tag2', 1.4, 0.7, 5.2 - 4);
    graf(-1, 24.75, 3.0, 'w', 'graf_eye', 0.7, 0.7, 1.5);
    P.trashPile(D, 25, 0, 5.8, 0.4);
    P.papers(D, 26.5, 4, 5.8, 0.5, 2);
  }
  // elevator shaft: pried / jammed doors, tape, warning signs, call panels
  for (const k of [-1, 0, 1]) {
    const y = k * 4;
    const z = 6.55;
    b.group(29.25, y + 1, 6.75);
    if (k === -1) {
      b.box(28.5, y, z, 29.15, y + 2.1, z + 0.04, 'elevator_door', { uv: 'fit' });
      b.push(30.0, y, z, 0.08);
      b.box(0, 0, 0, 0.75, 2.1, 0.04, 'elevator_door', { uv: 'fit' });
      b.pop();
      L.addCollider(28.5, y, z - 0.02, 29.15, y + 2.1, z + 0.06);
      L.addCollider(30.0, y, z - 0.08, 30.7, y + 2.1, z + 0.06);
    } else {
      b.box(27.9, y, z, 28.75, y + 2.1, z + 0.04, 'elevator_door', { uv: 'fit' });
      b.push(29.95, y, z, -0.12);
      b.box(0, 0, 0, 0.75, 2.1, 0.04, 'elevator_door', { uv: 'fit' });
      b.pop();
      L.addCollider(28.4, y, z - 0.02, 28.75, y + 2.1, z + 0.06);
      L.addCollider(29.95, y, z - 0.02, 30.1, y + 2.1, z + 0.12);
      // torn caution tape
      b.quad([28.5, y + 1.0, 6.9], [30.0, y + 1.1, 6.9], [30.0, y + 1.18, 6.9], [28.5, y + 1.08, 6.9], [0, 0, 2.3, 0, 2.3, 1, 0, 1], 'caution_tape', 2);
      b.quad([28.52, y + 0.35, 6.92], [28.62, y + 1.35, 6.92], [28.7, y + 1.35, 6.92], [28.6, y + 0.35, 6.92], [0, 0, 1.4, 0, 1.4, 1, 0, 1], 'caution_tape', 2);
    }
    b.ungroup();
    decalAt(k, 29.25, 7.0, 0, 1, 'sign_elevator', 1.1, 0.27, 2.45);
    decal(k, 31.0, 8.0, 'n', 'elevator_panel', 0.18, 0.36, 1.3);
    if (k >= 0) decal(k, 27.4, 8.0, 'n', 'sign_danger', 0.95, 0.24, 1.55);
  }
  graf(1, 27.0, 8.5, 'n', 'graf_dontgo', 1.7, 0.85, 1.35);
  L.emitters.push({ type: 'wind', x: 29.25, y: 1, z: 5 });
  L.emitters.push({ type: 'creak', x: 29.25, y: 2, z: 5 });
  P.puddle(D, 29.6, -4, 5.6, 1.4, 1.0);
  drip(-1, 29.6, 5.6, 12);
  P.rubblePile(D, 28.8, -4, 5.5, 0.5, 0.25, { chunks: 3, collide: false });

  // ============================================================ GROUND
  {
    const k = 0;
    corridorLamps(k, '...f..s..d.h.p');
    hangSign(k, 19, 8.5, 'sign_pharmacy', 'sign_radiology');
    hangSign(k, 37, 8.5, 'sign_stairs', 'sign_radiology');
    graf(k, 10.5, 8.5, 'n', 'graf_tag2', 1.6, 0.8, 1.3);
    graf(k, 21.3, 8.5, 'n', 'graf_arrow', 0.6, 0.6, 1.5);
    graf(k, 33.3, 8.5, 'n', 'graf_eye', 0.6, 0.6, 1.6);
    graf(k, 47.5, 8.5, 's', 'graf_getout', 1.8, 0.9, 1.3);
    graf(k, 3.5, 8.5, 's', 'graf_noone', 1.6, 0.8, 1.4);
    P.gurney(D, 15.2, 0, 8.1, 1.45, { overturned: true });
    P.ivStand(D, 7.8, 0, 9.5, { fallen: true });
    P.wheelchair(D, 44.2, 0, 7.6, 2.3, {});
    P.papers(D, 9.5, 0, 9.0, 0.7, 4);
    P.papers(D, 20.8, 0, 8.0, 0.6, 3);
    P.fallenTiles(D, 34.5, 0, 8.0, 3);
    P.wires(D, 34.5, 3.7, 8.0, 4, 1.5);
    P.puddle(D, 34.3, 0, 8.6, 1.6, 1.2);
    drip(k, 34.5, 8.0, 10);
    P.fallenTiles(D, 9.5, 0, 9.0, 2);
    P.wires(D, 9.5, 3.7, 9.0, 2, 1.0);
    P.trashPile(D, 50.5, 0, 9.3, 0.5);
    P.bin(D, 42.6, 0, 9.6, { fallen: true });
    P.glassShards(D, 1.2, 0, 8.5, 0.7);
    P.chair(D, 38.2, 0, 9.5, 2.5, { fallen: true });
    L.emitters.push({ type: 'wind', x: 0.6, y: 1.5, z: 8.5 });

    // ---- lobby
    troffer(k, 23, 13, 'dead');
    troffer(k, 28, 13, 'dead');
    troffer(k, 33, 13, 'dead', { hanging: true });
    troffer(k, 23, 17.5, 'flicker');
    troffer(k, 28, 17.5, 'dead');
    troffer(k, 33, 17.5, 'dead');
    troffer(k, 23, 22, 'dead');
    troffer(k, 28, 22, 'pulse', { intensity: 0.8 });
    troffer(k, 33, 22, 'dead');
    P.counter(D, 23.6, 0, 15.5, PI / 2, 5.0, { d: 0.6 });
    P.chair(D, 22.4, 0, 14.2, -PI / 2 + 0.4, { kind: 'office' });
    P.chair(D, 22.0, 0, 17.0, 1.2, { kind: 'office', fallen: true });
    P.cabinet(D, 20.85, 0, 12.2, PI / 2, { open: 0.3 });
    P.cabinet(D, 20.85, 0, 12.9, PI / 2);
    P.cabinet(D, 20.85, 0, 18.4, PI / 2, { open: 0.45, openY: 0.5 });
    P.crt(D, 23.7, 1.1, 14.3, PI / 2);
    note('signin', k, 23.7, 1.1, 16.2, { rot: 0.2 });
    P.papers(D, 22.3, 0, 15.5, 0.8, 5);
    decal(k, 21, 15.5, 'w', 'sign_reception', 1.6, 0.4, 2.4);
    decal(k, 21, 14.0, 'w', 'clock', 0.32, 0.32, 2.0);
    decal(k, 34.9, 16.2, 'e', 'sign_directory', 1.2, 1.2, 1.7);
    L.interactables.push({ type: 'note', id: 'directory', k, x: 35.4, y: 1.7, z: 16.2, r: 0.6 });
    decal(k, 30.0, 26.0, 's', 'poster_missing', 0.5, 0.75, 1.5);
    L.interactables.push({ type: 'note', id: 'missing', k, x: 30.0, y: 1.5, z: 26.45, r: 0.45 });
    decal(k, 34.9, 21.9, 'e', 'poster_quiet', 0.55, 0.82, 1.6);
    P.waitingChairs(D, 31.6, 0, 18.6, 0, 6, { missing: [2] });
    P.waitingChairs(D, 31.6, 0, 19.3, PI, 6);
    P.waitingChairs(D, 32.0, 0, 22.0, 0, 5, { missing: [0, 3] });
    P.waitingChairs(D, 34.9, 0, 13.2, -PI / 2, 4);
    P.vending(D, 34.95, 0, 18.0, -PI / 2);
    P.planter(D, 21.1, 0, 25.9);
    P.planter(D, 34.9, 0, 25.9);
    P.wheelchair(D, 26.2, 0, 20.5, 0.7, { tipped: true });
    P.table(D, 32.0, 0, 15.0, 0.3, { w: 0.9, d: 0.6, h: 0.45, tipped: false });
    P.papers(D, 31.8, 0.45, 15.0, 0.25, 2);
    P.rubblePile(D, 31.2, 0, 13.8, 0.9, 0.35, { chunks: 7, tiles: 3 });
    P.wires(D, 31.2, 3.7, 13.7, 4, 1.8);
    P.hangingTile(D, 30.6, 3.0, 14.6);
    P.puddle(D, 31.6, 0, 14.6, 1.5, 1.4);
    drip(k, 31.2, 13.7, 9);
    P.glassShards(D, 35.0, 0, 24.0, 0.9);
    P.trashPile(D, 34.2, 0, 23.0, 0.55);
    P.trashPile(D, 21.4, 0, 21.8, 0.5);
    P.papers(D, 27.5, 0, 24.0, 1.0, 3);
    P.bin(D, 25.0, 0, 25.9, {});
    graf(k, 21, 22.0, 'w', 'graf_tag1', 2.0, 1.0, 1.3);
    graf(k, 26.0, 25.5, 's', 'graf_smiley', 0.8, 0.8, 1.6);
    graf(k, 34.9, 12.0, 'e', 'graf_tag3', 1.6, 0.8, 1.3);
    graf(k, 21.2, 10.9, 'n', 'graf_crew', 1.3, 0.65, 1.5);
    L.emitters.push({ type: 'wind', x: 35.6, y: 1.5, z: 24 });
    L.emitters.push({ type: 'creak', x: 28, y: 2.5, z: 18 });

    // ---- pharmacy
    troffer(k, 4.25, 3.5, 'dead');
    P.shelf(D, 0.8, 0, 2.6, PI / 2, { w: 2.2, tex: 'shelf_meds', empty: 0.35 });
    P.shelf(D, 4.0, 0, 2.4, 0, { w: 2.4, tex: 'shelf_meds', twoSided: true, empty: 0.4 });
    P.counter(D, 3.0, 0, 5.1, 0, 3.6, { d: 0.5 });
    P.boxes(D, 6.6, 0, 1.4, 3);
    P.papers(D, 3.2, 0, 3.9, 0.9, 6);
    P.papers(D, 6.0, 0, 4.0, 0.6, 3);
    P.bin(D, 7.4, 0, 3.2, { fallen: true });
    P.trashPile(D, 1.5, 0, 5.6, 0.4);
    decal(k, 4.0, 3, 'n', 'poster_wash', 0.5, 0.75, 1.5);

    // ---- records
    troffer(k, 12.25, 3.5, 'dying');
    P.shelf(D, 11.0, 0, 2.8, PI / 2, { w: 3.6, d: 0.5, tex: 'shelf_files', twoSided: true, empty: 0.25 });
    P.shelf(D, 13.6, 0, 2.8, PI / 2, { w: 3.6, d: 0.5, tex: 'shelf_files', twoSided: true, empty: 0.3 });
    P.cabinet(D, 15.7, 0, 1.3, -PI / 2, { open: 0.4 });
    P.cabinet(D, 15.7, 0, 2.0, -PI / 2);
    P.cabinet(D, 15.7, 0, 2.7, -PI / 2, { open: 0.25, openY: 0.55 });
    P.desk(D, 10.0, 0, 5.4, 0, { w: 1.2, d: 0.6 });
    P.chair(D, 10.2, 0, 4.7, PI + 0.3, { kind: 'office' });
    note('file108', k, 9.7, 0.77, 5.45, { tex: 'folder', rot: -0.3 });
    for (let i = 0; i < 6; i++) P.papers(D, 9.2 + rng() * 6, 0, 1.2 + rng() * 4.8, 0.6, 4);
    P.boxes(D, 15.0, 0, 5.6, 2);
    P.puddle(D, 12.9, 0, 3.0, 1.2, 1.0);
    drip(k, 13, 3, 6);

    // ---- administration
    troffer(k, 20, 3.5, 'dead');
    P.desk(D, 19.5, 0, 2.6, 0, { w: 1.6, d: 0.8, drawerOut: true });
    P.chair(D, 19.5, 0, 1.8, 0.2, { kind: 'office' });
    P.chair(D, 19.0, 0, 3.6, PI + 0.2, {});
    P.chair(D, 20.3, 0, 3.9, 2.2, { fallen: true });
    P.crt(D, 19.0, 0.76, 2.5, 0.1);
    note('closure', k, 20.0, 0.77, 2.7, { rot: 0.15 });
    P.cabinet(D, 16.85, 0, 2.0, PI / 2);
    P.cabinet(D, 16.85, 0, 2.7, PI / 2, { open: 0.4 });
    P.cabinet(D, 16.85, 0, 3.4, PI / 2);
    P.shelf(D, 23.2, 0, 2.5, -PI / 2, { w: 1.6, h: 1.8, d: 0.35, tex: 'shelf_files' });
    decal(k, 23, 4.6, 'e', 'calendar', 0.33, 0.5, 1.6);
    decal(k, 17, 4.9, 'w', 'corkboard', 0.9, 0.9, 1.6);
    decal(k, 20, 6, 's', 'clock', 0.32, 0.32, 2.3);
    P.papers(D, 18.4, 0, 4.6, 0.7, 4);
    P.boxes(D, 22.6, 0, 5.6, 2);

    // ---- exam rooms
    troffer(k, 32.75, 3.5, 'dead');
    P.gurney(D, 33.0, 0, 3.0, 0, { sheet: true, raised: true });
    P.cabinet(D, 31.3, 0, 1.2, PI / 2, { h: 1.0 });
    P.sink(D, 34.2, 0, 4.8, -PI / 2, { mirror: true });
    decal(k, 34, 3.3, 'e', 'poster_wash', 0.5, 0.75, 1.55);
    P.ivStand(D, 31.8, 0, 3.6, { bag: true });
    P.papers(D, 32.4, 0, 5.2, 0.4, 2);
    troffer(k, 36.75, 3.5, 'dead', { hanging: true });
    P.gurney(D, 36.6, 0, 2.6, 0.15, { bare: false });
    P.monitorCart(D, 37.9, 0, 1.3, PI);
    P.wheelchair(D, 37.6, 0, 5.2, 3.6, { missingWheel: true });
    graf(k, 35.1, 3.5, 'w', 'graf_spiral', 0.7, 0.7, 1.5);
    P.fallenTiles(D, 36.2, 0, 4.3, 2);

    // ---- radiology
    troffer(k, 42, 3.5, 'dead');
    troffer(k, 47, 3.5, 'dead');
    P.xrayMachine(D, 46.5, 0, 3.0, PI / 2);
    b.box(42.3, 0, 0.5, 42.6, 2.1, 3.6, 'metal_painted');
    L.addCollider(42.3, 0, 0.5, 42.6, 2.1, 3.6);
    P.desk(D, 40.6, 0, 1.6, PI / 2, { w: 1.6, d: 0.7 });
    P.crt(D, 40.7, 0.76, 1.6, PI / 2);
    P.chair(D, 41.6, 0, 1.9, -PI / 2, { kind: 'office' });
    for (const z of [1.8, 3.2]) {
      decal(k, 50, z, 'e', 'xray_viewer', 0.9, 0.9, 1.6, { emissive: [0.62, 0.68, 0.75] });
    }
    addLamp(L, { k, x: 50.9, y: 1.6, z: 2.5, behavior: 'pulse', intensity: 0.55, radius: 4.5, color: [0.7, 0.85, 1.0], down: false });
    P.trolley(D, 49.6, 0, 5.2, 0.4);
    P.papers(D, 44.0, 0, 5.0, 0.6, 2);

    // ---- restrooms
    troffer(k, 3, 13.5, 'dead');
    P.stall(D, 0.5, 10.5, 3.4, 12.1, 0);
    P.sink(D, 2.5, 0, 16.25, PI, { mirror: true, mirrorTex: 'dark' });
    P.sink(D, 3.8, 0, 16.25, PI, { mirror: true });
    P.puddle(D, 2.2, 0, 14.2, 1.6, 1.4);
    drip(k, 2.0, 14.0, 14);
    graf(k, 5.2, 14.2, 'e', 'graf_lights', 1.4, 0.7, 1.5);
    P.trashPile(D, 4.7, 0, 15.6, 0.35);
    P.glassShards(D, 3.2, 0, 15.6, 0.5);

    // ---- emergency / triage
    troffer(k, 9.5, 13.5, 'pulse');
    troffer(k, 16.5, 13.5, 'dead');
    for (const [x0, x1] of [[6.2, 9.8], [10.2, 13.8], [14.2, 17.8]]) {
      P.curtainRun(D, x0, 13.2, x1, 13.2, 0, { drawn: 0.4 + rng() * 0.5, fromEnd: rng() < 0.5, torn: true });
      P.curtainRun(D, x1 + 0.2, 13.2, x1 + 0.2, 16.4, 0, { drawn: 0.9 });
    }
    P.bed(D, 8.0, 0, 15.3, PI, { bare: true });
    P.gurney(D, 12.0, 0, 15.2, PI + 0.2, { sheet: true });
    P.gurney(D, 16.0, 0, 14.6, 2.1, { overturned: true, side: -1 });
    P.ivStand(D, 9.3, 0, 14.4, { bag: true });
    P.ivStand(D, 13.2, 0, 14.0, {});
    P.ivStand(D, 17.0, 0, 15.8, { fallen: true });
    P.monitorCart(D, 10.8, 0, 16.0, PI);
    P.desk(D, 8.0, 0, 11.4, PI, { w: 1.4, d: 0.6 });
    P.chair(D, 8.1, 0, 12.2, 0.4, { kind: 'office' });
    P.trolley(D, 18.8, 0, 11.4, 0.2);
    P.wheelchair(D, 15.5, 0, 11.6, 1.2, {});
    P.papers(D, 11.0, 0, 12.0, 0.8, 4);
    P.glassShards(D, 15.8, 0, 16.0, 0.6);
    graf(k, 19.9, 12.0, 'e', 'graf_counts', 1.6, 0.8, 1.5);

    // ---- chapel
    for (const z of [12.3, 13.5, 14.7]) {
      P.pew(D, 37.9, 0, z, 0, 2.5, {});
      P.pew(D, 41.6, 0, z, 0, 2.5, { tipped: z === 13.5 });
    }
    b.group(40, 0.5, 16.0);
    b.box(39.2, 0, 15.75, 40.8, 0.95, 16.35, 'wood_dark');
    b.box(39.15, 0.95, 15.7, 40.85, 0.98, 16.4, 'sheet');
    for (const [cxp, h] of [[39.4, 0.18], [39.6, 0.1], [40.4, 0.22], [40.6, 0.08]]) b.cyl(cxp, 0.98, 16.05, 0.025, 0.98 + h, 5, 'white');
    b.ungroup();
    L.addCollider(39.2, 0, 15.75, 40.8, 0.95, 16.35);
    decal(k, 40, 16, 's', 'cross', 0.4, 0.8, 1.9);
    note('chapel', k, 37.2, 0.47, 12.3, { tex: 'paper', w: 0.12, d: 0.18 });
    graf(k, 36.1, 14.3, 'w', 'graf_sigil', 0.8, 0.8, 1.5);
    P.papers(D, 38.5, 0, 15.3, 0.4, 2);

    // ---- staff lounge
    troffer(k, 47, 13.5, 'dead');
    troffer(k, 52, 13.5, 'dying');
    P.table(D, 48.5, 0, 13.6, 0.1, {});
    P.chair(D, 47.8, 0, 13.0, 0.2, {});
    P.chair(D, 49.3, 0, 14.3, PI - 0.3, {});
    P.chair(D, 47.5, 0, 14.6, 2.4, { fallen: true });
    P.couch(D, 55.0, 0, 14.0, -PI / 2, { slashed: true });
    P.lockers(D, 44.3, 0, 13.5, PI / 2, 5, { open: [1, 3] });
    P.counter(D, 52.0, 0, 10.85, PI, 5.0, { d: 0.55, top: 'metal_steel' });
    P.fridge(D, 45.2, 0, 15.9, PI);
    P.tv(D, 51.2, 0, 16.0, PI);
    P.trashPile(D, 50.0, 0, 12.4, 0.5);
    P.boxes(D, 53.0, 0, 15.9, 2);
    graf(k, 55.4, 11.8, 'e', 'graf_tag3', 1.4, 0.7, 1.4);
  }

  // ============================================================= FIRST
  {
    const k = 1;
    const y = 4;
    corridorLamps(k, '..f..s.d.h.f..');
    hangSign(k, 21, 8.5, 'sign_ward_a', 'sign_surgery');
    hangSign(k, 37.5, 8.5, 'sign_dayroom', 'sign_ward_b');
    graf(k, 11.2, 8.5, 's', 'graf_108', 0.7, 0.7, 1.5);
    graf(k, 32.8, 8.5, 's', 'graf_names', 1.6, 0.8, 1.4);
    graf(k, 46.5, 8.5, 's', 'graf_tag1', 1.8, 0.9, 1.3);
    graf(k, 50.2, 8.5, 'n', 'graf_tally', 0.7, 0.7, 1.4);
    graf(k, 4.6, 8.5, 'n', 'graf_counts', 1.5, 0.75, 1.5);
    decal(k, 22.5, 8.5, 'n', 'poster_quiet', 0.5, 0.75, 1.5);
    // 108: nailed shut from the corridor, a gurney shoved against it, light under the door
    P.barricade(D, 9.5, y, 10.0, PI, 1.0);
    P.gurney(D, 9.6, y, 9.35, PI / 2 + 0.06, { bare: true });
    const under = addLamp(L, { k, x: 9.5, y: y + 0.05, z: 9.6, behavior: 'scripted', intensity: 0.35, radius: 1.6, color: [1.0, 0.85, 0.55], down: false, blockDoors: false });
    addLamp(L, { k, x: 10.2, y: y + 2.8, z: 13.5, behavior: 'scripted', intensity: 0.9, radius: 6, color: [1.0, 0.88, 0.62] });
    b.group(9.5, y, 9.9);
    b.lampPanel(under.idx, 1.25, 1.05, 0.7);
    b.quad([9.05, y + 0.006, 10.0], [9.95, y + 0.006, 10.0], [9.95, y + 0.006, 9.9], [9.05, y + 0.006, 9.9], [0.1, 0.1, 0.9, 0.1, 0.9, 0.2, 0.1, 0.2], 'white', 1);
    b.normalMode();
    b.ungroup();
    P.wheelchair(D, 16.4, y, 8.0, 0.9, {});
    P.ivStand(D, 6.1, y, 9.5, { bag: true });
    P.papers(D, 13.5, y, 8.2, 0.8, 4);
    P.fallenTiles(D, 18.7, y, 7.7, 3);
    P.wires(D, 18.7, y + 3.7, 7.7, 5, 1.7);
    P.hangingTile(D, 19.3, y + 3.0, 8.4);
    P.puddle(D, 18.5, y, 8.3, 1.4, 1.2);
    drip(k, 18.7, 7.8, 9);
    P.gurney(D, 35.2, y, 8.0, 1.35, { sheet: true });
    P.trashPile(D, 26.6, y, 9.5, 0.45);
    P.fallenTiles(D, 50.5, y, 8.2, 2);
    P.wires(D, 50.5, y + 3.7, 8.2, 3, 1.2);
    P.ivStand(D, 44.0, y, 7.5, { fallen: true });
    P.chair(D, 53.5, y, 9.4, 1.0, { fallen: true });
    P.bin(D, 25.9, y, 7.4, {});
    L.emitters.push({ type: 'wind', x: 55.6, y: y + 1.5, z: 8.5 });
    L.emitters.push({ type: 'creak', x: 10, y: y + 2, z: 12 });

    // ---- Ward A patient rooms
    const north = [[101, 0.5, 4], [102, 4.5, 8], [103, 8.5, 12], [104, 12.5, 16], [105, 16.5, 20]];
    const south = [[110, 0.5, 4], [109, 4.5, 8], [108, 8.5, 12], [107, 12.5, 16], [106, 16.5, 20]];
    const beh = { 101: 'dead', 102: 'dead', 103: 'dying', 104: 'dead', 105: 'dead', 106: 'pulse', 107: 'dead', 108: 'dead', 109: 'dead', 110: 'dead' };
    for (const [n, x0, x1] of north) {
      const cxr = (x0 + x1) / 2;
      troffer(k, cxr, 3.5, beh[n], { hanging: n === 104, axis: 'z' });
      const v = n % 5;
      P.bed(D, x0 + 1.05, y, 1.65, 0.0 + (v === 2 ? 0.25 : 0), { bare: v === 1 || v === 3, railDown: v === 0 });
      P.cabinet(D, x0 + 2.1, y, 0.85, 0, { h: 0.85 });
      P.curtainRun(D, x0 + 2.2, 0.6, x0 + 2.2, 3.4, y, { drawn: 0.3 + v * 0.15, torn: v === 2 });
      if (v !== 4) P.ivStand(D, x0 + 0.3, y, 3.2, { bag: v === 0, fallen: v === 3 });
      P.chair(D, x0 + 2.6, y, 4.2, rng() * 6, { fallen: v === 1 || v === 4 });
      P.sink(D, x1 - 0.25, y, 4.5, -PI / 2, { mirror: v !== 2 });
      P.papers(D, cxr, y, 4.5, 0.6, 2);
      if (v === 3) P.fallenTiles(D, x0 + 1.5, y, 2.8, 3);
      if (v === 1) P.wheelchair(D, x0 + 2.4, y, 2.6, rng() * 6, { tipped: true });
    }
    for (const [n, x0, x1] of south) {
      const cxr = (x0 + x1) / 2;
      troffer(k, cxr, 13.5, beh[n], { axis: 'z' });
      const v = n % 5;
      if (n === 108) {
        // nobody gets in here: a made bed and a chair turned toward the door
        P.bed(D, x1 - 1.05, y, 15.35, PI, {});
        P.chair(D, x0 + 1.4, y, 13.6, PI + 0.05, { kind: 'wood' });
        graf(k, x0 + 0.6, 13.5, 'w', 'graf_tally', 0.7, 0.7, 1.3);
        continue;
      }
      P.bed(D, x1 - 1.05, y, 15.35, PI + (v === 2 ? -0.2 : 0), { bare: v === 0 || v === 4 });
      P.cabinet(D, x1 - 2.1, y, 16.15, PI, { h: 0.85 });
      P.curtainRun(D, x1 - 2.2, 16.4, x1 - 2.2, 13.6, y, { drawn: 0.4 + v * 0.1, torn: v === 1 });
      if (v !== 3) P.ivStand(D, x1 - 0.3, y, 13.8, { bag: v === 2, fallen: v === 0 });
      P.chair(D, x0 + 1.0, y, 14.6, rng() * 6, { fallen: v === 4 });
      P.sink(D, x0 + 0.25, y, 12.0, PI / 2, { mirror: true });
      P.papers(D, cxr, y, 12.5, 0.6, 2);
    }
    P.trashPile(D, 2.2, y, 13.2, 0.45);
    P.glassShards(D, 2.0, y, 15.9, 0.6);
    P.glassShards(D, 14.3, y, 15.9, 0.6);
    P.glassShards(D, 2.0, y, 1.2, 0.6);
    P.glassShards(D, 9.8, y, 1.2, 0.6);
    P.glassShards(D, 17.9, y, 1.2, 0.6);
    P.rubblePile(D, 3.5, y, 2.7, 0.7, 0.3, { chunks: 4, tiles: 3 });
    P.wires(D, 3.5, y + 3.7, 2.7, 3, 1.4);
    graf(k, 12.6, 3.0, 'w', 'graf_sigil', 0.7, 0.7, 1.5);
    graf(k, 15.9, 14.0, 'e', 'graf_eye', 0.6, 0.6, 1.6);
    graf(k, 4.4, 3.4, 'e', 'graf_smiley', 0.7, 0.7, 1.4);
    L.emitters.push({ type: 'wind', x: 2.0, y: y + 1.5, z: 16.4 });
    L.emitters.push({ type: 'wind', x: 10.0, y: y + 1.5, z: 0.6 });

    // ---- linen store
    troffer(k, 22, 3.5, 'dead');
    P.shelf(D, 20.85, y, 3.2, PI / 2, { w: 3.6, d: 0.5, tex: 'sheet', empty: 0.3 });
    P.laundryCart(D, 22.5, y, 1.6, 0.3, {});
    P.laundryCart(D, 22.6, y, 4.8, 1.8, { tipped: true });

    // ---- scrub room & operating theatre
    troffer(k, 32.75, 3.5, 'dead', { axis: 'z' });
    for (const x of [31.8, 32.8, 33.8]) P.sink(D, x, y, 0.75, 0, { mirror: false });
    P.lockers(D, 31.25, y, 4.0, PI / 2, 3, { open: [0] });
    P.papers(D, 33.2, y, 3.8, 0.5, 2);
    troffer(k, 37.5, 3.5, 'flicker', { axis: 'z' });
    troffer(k, 41.5, 3.5, 'dead', { axis: 'z' });
    P.orTable(D, 39.6, y, 2.9, 0.08);
    P.orLamp(D, 39.4, y + 3, 2.6);
    P.anesthesia(D, 37.6, y, 1.4, 0.3);
    P.trolley(D, 41.3, y, 4.4, -0.3, {});
    P.trolley(D, 42.6, y, 1.2, 1.2, { empty: true });
    P.monitorCart(D, 38.0, y, 4.6, 2.6);
    P.cabinet(D, 43.7, y, 2.0, -PI / 2, { front: 'shelf_meds' });
    P.cabinet(D, 43.7, y, 2.7, -PI / 2, { front: 'shelf_meds', open: 0.3 });
    P.ivStand(D, 38.7, y, 3.6, { bag: true });
    b.group(39.8, y, 3.8);
    b.floorDecal(39.8, y + 0.005, 3.8, 1.4, 1.4, 0.6, 'stain_dark');
    b.floorDecal(39.6, y + 0.006, 3.2, 0.3, 0.3, 0.0, 'dark');
    b.ungroup();
    graf(k, 35.1, 4.5, 'w', 'graf_tally', 0.8, 0.8, 1.4);
    graf(k, 43.9, 5.5, 'e', 'graf_counts', 1.2, 0.6, 1.8);
    L.emitters.push({ type: 'drip', x: 33, y: y + 1.1, z: 0.8, rate: 5 });

    // ---- recovery
    troffer(k, 47, 3.5, 'dying');
    troffer(k, 52, 3.5, 'dead');
    for (const x of [46.0, 49.6, 53.4]) {
      P.bed(D, x, y, 1.65, 0, { bare: x > 50 });
      P.curtainRun(D, x + 1.2, 0.6, x + 1.2, 3.2, y, { drawn: 0.8, torn: x > 50 });
      P.monitorCart(D, x - 0.9, y, 1.0, 0.2);
    }
    P.curtainRun(D, 45.0, 3.4, 55.2, 3.4, y, { drawn: 0.45, fromEnd: true });
    P.wheelchair(D, 51.0, y, 5.2, 0.4, {});
    P.glassShards(D, 51.8, y, 1.1, 0.7);
    P.papers(D, 48.0, y, 5.0, 0.6, 3);
    L.emitters.push({ type: 'wind', x: 51.7, y: y + 1.5, z: 0.6 });

    // ---- nurse station
    troffer(k, 24, 13.5, 'steady', { intensity: 0.9 });
    P.counter(D, 23.6, y, 11.25, PI, 5.0, { d: 0.5 });
    P.desk(D, 22.0, y, 14.2, PI / 2, { w: 1.4, d: 0.7 });
    P.chair(D, 22.8, y, 14.0, -PI / 2 + 0.6, { kind: 'office' });
    P.chair(D, 25.2, y, 12.6, 2.0, { kind: 'office', fallen: true });
    P.crt(D, 22.0, y + 0.76, 13.8, PI / 2);
    P.cabinet(D, 27.2, y, 14.5, -PI / 2);
    P.cabinet(D, 27.2, y, 15.2, -PI / 2, { open: 0.4 });
    P.trolley(D, 25.5, y, 15.8, 0.1, { w: 0.6, d: 0.45 });
    decal(k, 21, 13.6, 'w', 'whiteboard', 1.6, 0.8, 1.6);
    decal(k, 24, 16, 's', 'clock', 0.32, 0.32, 2.3);
    note('nightlog', k, 23.0, y + 1.1, 11.25, { rot: 0.1 });
    P.papers(D, 24.0, y, 13.5, 0.9, 5);
    graf(k, 26.2, 16, 's', 'graf_tag2', 1.2, 0.6, 1.0);

    // ---- day room: the explorers' camp
    troffer(k, 31.75, 13.5, 'dead');
    P.campsite(D, 31.6, y, 14.0, 0.0);
    note('journal1', k, 32.2, y, 12.9, { noGeom: true, r: 0.4 });
    note('journal2', k, 30.3, y, 15.6, { tex: 'paper', rot: 0.6 });
    note('journal3', k, 31.0, y, 12.5, { tex: 'paper', rot: -0.4 });
    b.group(31.9, y + 2.9, 15.55);
    b.quad([31.3, y + 2.995, 14.95], [32.5, y + 2.995, 14.95], [32.5, y + 2.995, 16.15], [31.3, y + 2.995, 16.15], [0, 0, 1, 0, 1, 1, 0, 1], 'scorch');
    b.ungroup();
    P.couch(D, 28.6, y, 13.5, PI / 2, { slashed: true });
    P.couch(D, 34.6, y, 12.2, -PI / 2 - 0.15, {});
    P.tv(D, 34.8, y, 15.4, -PI / 2 - 0.3, { onFloor: true });
    P.table(D, 30.9, y, 11.6, 0.2, { w: 1.0, d: 0.7, tipped: true });
    P.chair(D, 34.0, y, 14.6, 1.2, {});
    P.trashPile(D, 34.6, y, 11.1, 0.5);
    P.glassShards(D, 30.5, y, 16.0, 0.8);
    P.glassShards(D, 33.5, y, 16.0, 0.8);
    graf(k, 28.1, 12.0, 'w', 'graf_names', 1.6, 0.8, 1.6);
    graf(k, 35.4, 14.5, 'e', 'graf_crew', 1.4, 0.7, 1.7);
    L.emitters.push({ type: 'wind', x: 32, y: y + 1.5, z: 16.4 });

    // ---- doctor's office
    troffer(k, 37.75, 13.5, 'dead', { axis: 'z' });
    P.desk(D, 37.8, y, 14.6, PI, { w: 1.5, d: 0.7 });
    P.chair(D, 37.8, y, 15.4, PI + 0.3, { kind: 'office' });
    P.cabinet(D, 39.2, y, 11.3, -PI / 2, { open: 0.35 });
    decal(k, 36.1, 13.4, 'w', 'xray_viewer', 0.8, 0.8, 1.6);
    note('doctor', k, 37.4, y + 0.77, 14.5, { rot: 0.2 });
    P.papers(D, 37.6, y, 12.4, 0.5, 3);

    // ---- Ward B
    troffer(k, 43, 13.5, 'pulse');
    troffer(k, 48.5, 13.5, 'dead');
    for (const [x, o] of [[41.4, {}], [44.7, { bare: true }], [48.0, {}], [50.4, { bare: true, railDown: true }]]) {
      P.bed(D, x, y, 15.35, PI + (rng() - 0.5) * 0.2, o);
      if (rng() < 0.6) P.ivStand(D, x + 0.8, y, 15.8, { bag: rng() < 0.5 });
    }
    P.curtainRun(D, 43.0, 16.4, 43.0, 13.8, y, { drawn: 0.7 });
    P.curtainRun(D, 46.3, 16.4, 46.3, 13.8, y, { drawn: 0.5, torn: true });
    P.curtainRun(D, 49.2, 16.4, 49.2, 13.8, y, { drawn: 0.9 });
    P.bed(D, 46.0, y, 12.0, PI / 2 + 0.4, { frameOnly: true });
    P.wheelchair(D, 50.6, y, 11.4, 2.0, { tipped: true });
    P.papers(D, 44.5, y, 12.2, 0.8, 3);
    P.glassShards(D, 46.2, y, 16.0, 0.6);
    P.trashPile(D, 51.0, y, 13.0, 0.4);
    graf(k, 51.4, 12.4, 'e', 'graf_getout', 1.4, 0.7, 1.5);

    // ---- isolation 112
    troffer(k, 53.75, 13.5, 'dead', { axis: 'z' });
    P.bed(D, 54.4, y, 14.9, PI, { bare: true });
    P.chair(D, 53.0, y, 12.0, 2.6, { fallen: true, kind: 'wood' });
    graf(k, 52.1, 14.5, 'w', 'graf_tally', 0.9, 0.9, 1.4);
    graf(k, 55.4, 12.2, 'e', 'graf_eye', 0.6, 0.6, 1.8);
  }

  // ============================================= damp: stains & mould
  // Scatter water stains (high, under leaks) and mould (low, where it's damp)
  // on solid wall runs only, so nothing floats across a doorway.
  for (const room of L.rooms) {
    if (room.stair || room.shaft) continue;
    const g = L.grid(room.k);
    const area = (room.x1 - room.x0) * (room.z1 - room.z0);
    const damp = room.k === -1 || room.styleName === 'tile' ? 1.5 : 1;
    const n = Math.round((area / 14) * room.decay * damp);
    for (let tries = 0, placed = 0; tries < n * 6 && placed < n; tries++) {
      const i = ci(room.x0 + 0.25 + rng() * (room.x1 - room.x0 - 0.5));
      const j = cj(room.z0 + 0.25 + rng() * (room.z1 - room.z0 - 0.5));
      if (g.at(i, j) !== T.FLOOR) continue;
      const [dname, di, dj] = [['n', 0, -1], ['s', 0, 1], ['e', 1, 0], ['w', -1, 0]][Math.floor(rng() * 4)];
      if (g.at(i + di, j + dj) !== T.SOLID) continue;
      const mould = rng() < (room.k === -1 ? 0.55 : 0.35);
      const w = mould ? 0.8 + rng() * 0.7 : 0.9 + rng() * 0.8;
      // every cell the decal spans must be backed by wall and fronted by floor
      const half = Math.ceil(w / 2 / CELL);
      let ok = true;
      for (let s = -half; s <= half && ok; s++) {
        const ai = i + (dj !== 0 ? s : 0), aj = j + (di !== 0 ? s : 0);
        if (g.at(ai + di, aj + dj) !== T.SOLID || g.at(ai, aj) !== T.FLOOR) ok = false;
      }
      if (!ok) continue;
      const x = GX0 + (i + 0.5) * CELL, z = GZ0 + (j + 0.5) * CELL;
      const ceil = room.ceilH;
      if (mould) decal(room.k, x, z, dname, 'mold', w, w * 0.8, 0.15 + w * 0.4);
      else decal(room.k, x, z, dname, 'water_stain', w, w * 0.9, ceil - w * 0.45 - 0.02);
      placed++;
    }
  }
  // exposed conduit with a burst junction box and loose wiring
  function conduit(k, x0, x1, z, dir, yy = 2.65) {
    const p = wallAt(k, (x0 + x1) / 2, z, dir);
    const zz = p.z + p.nz * 0.05;
    const y = k * 4 + yy;
    b.group((x0 + x1) / 2, y, zz);
    b.tube(x0, y, zz, x1, y, zz, 0.025, 4, 'metal_painted');
    const jx = x0 + (x1 - x0) * 0.6;
    b.box(jx - 0.1, y - 0.1, zz - 0.04, jx + 0.1, y + 0.1, zz + 0.04, 'breaker_panel', { uv: 'fit' });
    b.ungroup();
    D.at(jx, y, zz, 0);
    for (let i = 0; i < 3; i++) {
      const l = 0.5 + rng() * 0.9;
      b.tube(0, -0.08, 0, rng() * 0.3 - 0.15, -0.08 - l * 0.6, p.nz * (0.1 + rng() * 0.2), 0.008, 3, D.pick(['rubber', 'paint_red', 'plastic_white']));
    }
    D.done();
  }
  conduit(0, 3, 9, 8.5, 'n');
  conduit(0, 41, 50, 8.5, 's');
  conduit(1, 12, 20, 8.5, 'n');
  conduit(1, 42, 52, 8.5, 'n');
  conduit(-1, 40, 52, 8.5, 's', 2.4);
  conduit(-1, 18, 23, 3, 'n', 2.3);

  // ========================================================== BASEMENT
  {
    const k = -1;
    const y = -4;
    // corridor: caged bulbs on generator power, pipes, damp
    const bs = [[19, 'steady'], [24, 'dead'], [29, 'dead'], [34.5, 'flicker'], [39, 'steady'], [44, 'dead'], [49, 'dying'], [54, 'dead']];
    for (const [x, be] of bs) bulb(k, x, y + 3, 8.5, be, { intensity: 0.9 });
    P.pipeRun(D, [[16.5, y + 2.65, 7.25], [55.5, y + 2.65, 7.25]], 0.12, 'pipe_lagging');
    P.pipeRun(D, [[16.5, y + 2.75, 7.6], [55.5, y + 2.75, 7.6]], 0.06, 'metal_rust');
    P.pipeRun(D, [[16.5, y + 2.8, 9.75], [55.5, y + 2.8, 9.75]], 0.05, 'metal_rust');
    // collapsed duct: crouch to pass
    b.group(33.75, y + 1.5, 8.5);
    b.push(33.75, y + 1.42, 8.5, 0, 0.0, 0.06);
    b.box(-0.35, 0, -1.6, 0.35, 0.42, 1.6, 'metal_steel');
    b.pop();
    b.push(33.6, y + 1.84, 7.1, 0.0, 0.0, 0);
    b.box(-0.3, 0, -0.1, 0.3, 1.0, 0.25, 'metal_steel');
    b.pop();
    b.ungroup();
    L.addCollider(33.3, y + 1.24, 7, 34.2, y + 2.4, 10, 'crouch');
    P.rubblePile(D, 33.6, y, 9.3, 0.6, 0.25, { chunks: 4, collide: false });
    P.wires(D, 33.75, y + 3.7, 8.5, 4, 1.6);
    L.hints = [{ k, x: 32.0, z: 8.5, r: 2.2, text: '[C] CROUCH' }, { k, x: 35.6, z: 8.5, r: 2.2, text: '[C] CROUCH' }];
    for (const [x, z, w, d] of [[21, 8.3, 2.2, 1.6], [27.3, 9.0, 1.8, 1.4], [37.5, 8.0, 2.4, 1.7], [46, 9.1, 2.0, 1.4], [51.5, 8.4, 1.6, 1.3]]) P.puddle(D, x, y, z, w, d);
    drip(k, 21, 8.3, 10);
    drip(k, 37.5, 8.0, 7);
    drip(k, 46, 9.1, 9);
    P.trashPile(D, 25.8, y, 9.4, 0.4);
    P.boxes(D, 42.2, y, 9.5, 2);
    P.gurney(D, 48.8, y, 7.6, 0.08, { sheet: true });
    P.laundryCart(D, 23.2, y, 9.3, 1.3, {});
    P.papers(D, 40.5, y, 8.6, 0.6, 2);
    graf(k, 40, 8.5, 'n', 'graf_sigil', 0.8, 0.8, 1.4);
    graf(k, 43.2, 8.5, 's', 'graf_eye', 0.7, 0.7, 1.5);
    graf(k, 20.3, 8.5, 's', 'graf_noone', 1.4, 0.7, 1.4);
    L.emitters.push({ type: 'creak', x: 30, y: y + 2, z: 8.5 });
    L.emitters.push({ type: 'creak', x: 48, y: y + 2, z: 8.5 });

    // ---- boiler room
    bulb(k, 5.5, y + 3, 3.5, 'steady', { intensity: 1.1, radius: 7 });
    bulb(k, 12.5, y + 3, 10.5, 'steady', { intensity: 1.0, radius: 7 });
    bulb(k, 4.5, y + 3, 13.5, 'flicker', { intensity: 0.8 });
    P.boiler(D, 4.0, y, 6.2, 0, {});
    P.boiler(D, 9.2, y, 6.2, 0, {});
    P.generator(D, 12.0, y, 13.6, PI);
    note('workorder', k, 8.0, y + 0.92, 15.8, { tex: 'paper', rot: 0.4 });
    L.emitters.push({ type: 'machine', x: 12.0, y: y + 1, z: 13.6 });
    P.tank(D, 2.0, y, 13.8, 0.8, 2.4);
    P.drum(D, 14.8, y, 2.0, {});
    P.drum(D, 15.2, y, 2.7, {});
    P.drum(D, 14.6, y, 3.4, { fallen: true });
    P.drum(D, 7.0, y, 15.6, { tex: 'paint_red' });
    P.workbench(D, 8.5, y, 15.9, PI);
    P.pipeRun(D, [[4.0, y + 2.75, 8.4], [4.0, y + 2.75, 12.0], [11.0, y + 2.75, 12.0], [11.0, y + 2.75, 15.8]], 0.11, 'pipe_lagging');
    P.pipeRun(D, [[0.7, y + 2.6, 1.0], [15.8, y + 2.6, 1.0]], 0.09, 'metal_rust');
    P.pipeRun(D, [[9.2, y + 2.2, 3.4], [9.2, y + 2.8, 1.0]], 0.08, 'metal_rust');
    P.pipeRun(D, [[15.8, y + 2.5, 7.25], [12.0, y + 2.5, 7.25], [12.0, y + 2.5, 1.0]], 0.07, 'metal_rust');
    for (const [x, z, w, d] of [[6.8, 6.0, 2.6, 2.2], [3.2, 10.5, 2.0, 1.6], [13.5, 5.5, 1.8, 1.4]]) P.puddle(D, x, y, z, w, d);
    drip(k, 6.8, 6.0, 12);
    drip(k, 3.2, 10.5, 8);
    drip(k, 13.5, 5.5, 6);
    P.rubblePile(D, 7.0, y, 12.8, 0.9, 0.4, { chunks: 6 });
    P.boxes(D, 14.6, y, 15.6, 3);
    graf(k, 15.9, 11.6, 'e', 'graf_lights', 1.6, 0.8, 1.6);
    graf(k, 0.6, 6.0, 'w', 'graf_spiral', 0.8, 0.8, 1.6);
    decal(k, 15.9, 5.0, 'e', 'breaker_panel', 0.7, 0.9, 1.5);

    // ---- workshop
    bulb(k, 20, y + 3, 3.5, 'dead');
    P.workbench(D, 19.0, y, 0.9, 0);
    P.shelf(D, 16.8, y, 3.4, PI / 2, { w: 2.2, d: 0.45, tex: 'cardboard', empty: 0.4 });
    for (const z of [2.0, 3.2, 4.4]) decal(k, 23.4, z, 'e', 'breaker_panel', 0.7, 0.9, 1.6);
    P.drum(D, 22.8, y, 5.7, {});
    P.boxes(D, 18.0, y, 5.6, 3);
    P.papers(D, 20.0, y, 3.8, 0.6, 2);

    // ---- storage
    bulb(k, 32.75, y + 3, 3.5, 'dead');
    P.shelf(D, 31.3, y, 3.0, PI / 2, { w: 3.6, d: 0.5, tex: 'cardboard', empty: 0.2 });
    P.boxes(D, 33.6, y, 1.4, 3);
    P.boxes(D, 33.8, y, 4.6, 2);
    P.bed(D, 33.4, y, 3.0, PI / 2 + 0.1, { frameOnly: true });

    // ---- cold storage
    troffer(k, 39.25, 3.6, 'flicker');
    P.drawerWall(D, 35.6, y, 0.5, 9, 3, { open: { c: 8, r: 0 } });
    note('drawertag', k, 40.9, y, 3.3, { tex: 'paper', w: 0.1, d: 0.16 });
    P.gurney(D, 37.2, y, 4.6, PI / 2 + 0.1, { sheet: true });
    P.desk(D, 42.7, y, 5.6, PI, { w: 1.2, d: 0.6 });
    note('morguelog', k, 42.5, y + 0.77, 5.55, { rot: 0.1 });
    b.group(39, y, 3.5);
    b.floorDecal(39.0, y + 0.004, 3.5, 0.32, 0.32, 0, 'dark');
    b.floorDecal(39.1, y + 0.005, 3.6, 1.6, 1.6, 2.0, 'stain_dark');
    b.ungroup();
    graf(k, 35.1, 4.0, 'w', 'graf_counts', 1.4, 0.7, 1.6);
    L.emitters.push({ type: 'drip', x: 39, y: y + 2.8, z: 3.5, rate: 4 });

    // ---- autopsy
    troffer(k, 47.75, 3.5, 'dying');
    P.autopsyTable(D, 47.6, y, 3.0, 0.05);
    P.trolley(D, 49.2, y, 2.0, 0.3, {});
    P.sink(D, 51.2, y, 3.0, -PI / 2, { mirror: false });
    P.sink(D, 51.2, y, 4.2, -PI / 2, { mirror: false });
    P.cabinet(D, 44.4, y, 5.6, PI / 2, { front: 'shelf_meds' });
    b.group(46, y + 2, 1.5);
    b.tube(46.0, y + 3, 1.6, 46.0, y + 1.8, 1.6, 0.01, 3, 'chrome');
    b.cyl(46.0, y + 1.65, 1.6, 0.18, y + 1.8, 7, 'metal_steel');
    b.ungroup();
    graf(k, 44.1, 2.0, 'w', 'graf_tally', 0.7, 0.7, 1.6);

    // ---- laundry
    bulb(k, 22, y + 3, 13.5, 'pulse', { intensity: 0.7 });
    for (const x of [18.0, 19.1, 20.2, 23.0, 24.1, 25.2]) P.washer(D, x, y, 15.9, PI);
    P.laundryCart(D, 19.5, y, 12.5, 0.4, {});
    P.laundryCart(D, 24.5, y, 12.0, 2.2, { tipped: true });
    for (let i = 0; i < 3; i++) P.rubblePile(D, 21.0 + i * 1.6, y, 13.6 + (i % 2) * 0.6, 0.6, 0.25, { chunks: 0, tiles: 0, collide: false });
    P.puddle(D, 26.4, y, 13.6, 1.8, 1.4);
    drip(k, 26.4, 13.6, 8);
    graf(k, 27.4, 12.0, 'e', 'graf_tag1', 1.6, 0.8, 1.3);

    // ---- archive
    bulb(k, 31.75, y + 3, 13.5, 'dead');
    for (const x of [29.6, 31.8, 34.0]) P.shelf(D, x, y, 13.8, PI / 2, { w: 3.6, d: 0.5, tex: 'shelf_files', twoSided: true, empty: 0.2 });
    P.boxes(D, 30.6, y, 11.3, 3);
    for (let i = 0; i < 4; i++) P.papers(D, 28.6 + rng() * 6.5, y, 11.2 + rng() * 4.8, 0.6, 3);

    // ---- pathology
    troffer(k, 39.75, 13.5, 'dead');
    P.desk(D, 38.0, y, 15.8, PI, { w: 1.6, d: 0.7 });
    P.crt(D, 38.4, y + 0.76, 15.9, PI);
    P.counter(D, 41.5, y, 16.1, PI, 3.6, { d: 0.6, top: 'metal_steel', front: 'metal_painted' });
    P.fridge(D, 43.1, y, 11.2, -PI / 2);
    P.cabinet(D, 36.3, y, 12.0, PI / 2);
    P.chair(D, 38.4, y, 14.8, 0.5, { kind: 'office', fallen: true });
    P.papers(D, 39.5, y, 13.0, 0.9, 5);

    // ---- receiving
    troffer(k, 47, 13.5, 'dead');
    troffer(k, 52.5, 13.5, 'dead', { hanging: true });
    P.gurney(D, 47.5, y, 13.8, PI / 2, { sheet: true });
    P.gurney(D, 51.2, y, 14.6, PI / 2 - 0.3, { sheet: true });
    P.shelf(D, 55.2, y, 13.5, -PI / 2, { w: 2.4, d: 0.45, tex: 'cardboard', empty: 0.3 });
    P.desk(D, 45.5, y, 15.8, PI, { w: 1.2, d: 0.6 });
    P.boxes(D, 53.4, y, 11.2, 2);
    b.group(55.4, y + 1.5, 13.5);
    b.box(55.42, y, 11.2, 55.5, y + 2.6, 15.8, 'door_metal', { uv: 'world' });
    b.ungroup();
    graf(k, 49.5, 16.3, 's', 'graf_dontgo', 1.6, 0.8, 1.6);
  }
}
