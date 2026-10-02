// Layout of the Pool Rooms (pocket 6): an endless lattice of 16 m rooms. Every room, every wall
// opening and every pool is a pure function of its lattice coordinates, so any zone can compute
// its own part. Rooms are joined through arches, colonnades or plain openings; a grid of
// "highways" (every second row and column of rooms is always open) keeps everything connected.
import { M, CF } from '../gen/common.js';
import { hr } from './e_util.js';

export const R = 16;
export const WATER_Y = -0.2;

// the arrival hall: four rooms merged into one 32 x 32 m promenade between two long pools
export const ARRIVAL = { i0: 9, j0: 8, x0: 144, z0: 128, x1: 176, z1: 160, ceil: 5.0 };
const isArrival = (i, j) => i >= ARRIVAL.i0 && i <= ARRIVAL.i0 + 1 && j >= ARRIVAL.j0 && j <= ARRIVAL.j0 + 1;

export function roomType(i, j) {
  if (isArrival(i, j)) return 'arrival';
  const u = hr(i, j, 1);
  const next = i >= ARRIVAL.i0 - 1 && i <= ARRIVAL.i0 + 2 && j >= ARRIVAL.j0 - 1 && j <= ARRIVAL.j0 + 2;
  if (next && u >= 0.72) return 'pillars';
  return u < 0.26 ? 'pool' : u < 0.38 ? 'flood' : u < 0.5 ? 'pillars' : u < 0.62 ? 'plunge' : u < 0.72 ? 'lanes' : 'corr';
}

// 0 closed wall, 1 arch, 2 two arches, 3 colonnade, 4 fully open
const edgeCache = new Map();
export function edgeType(dir, i, j) {
  const key = dir + i + ',' + j;
  let t = edgeCache.get(key);
  if (t !== undefined) return t;
  const ai = dir === 'V' ? i - 1 : i, aj = dir === 'V' ? j : j - 1;
  const aA = isArrival(ai, aj), bA = isArrival(i, j);
  if (aA && bA) t = 4;
  else if (aA || bA) t = (dir === 'V' ? j - ARRIVAL.j0 : i - ARRIVAL.i0) === 0 ? 5 : 6;   // one arch on the hall's axis
  else if ((dir === 'V' && i === ARRIVAL.i0 + 1 && (j === ARRIVAL.j0 - 1 || j === ARRIVAL.j0 + 2))
    || (dir === 'H' && j === ARRIVAL.j0 + 1 && (i === ARRIVAL.i0 - 1 || i === ARRIVAL.i0 + 2))) t = 4;   // no wall behind the hall's arches
  else {
    const highway = dir === 'V' ? (j & 1) === 0 : (i & 1) === 0;
    const u = hr(i, j, dir === 'V' ? 51 : 52);
    if (highway) t = u < 0.5 ? 1 : u < 0.66 ? 2 : u < 0.86 ? 3 : 4;
    else t = u < 0.4 ? 0 : u < 0.66 ? 1 : u < 0.76 ? 2 : u < 0.88 ? 3 : 4;
    if (dir === 'H' && (i & 1) && (j & 1) && t === 0) t = 1;
    if (t >= 2 && (roomType(ai, aj) === 'corr' || roomType(i, j) === 'corr')) t = 1;
  }
  edgeCache.set(key, t);
  if (edgeCache.size > 20000) edgeCache.clear();
  return t;
}
export function edgeOpenAt(type, t) {
  if (type === 0) return false;
  if (type === 1) return t >= 6 && t < 10;
  if (type === 2) return (t >= 2 && t < 6) || (t >= 10 && t < 14);
  if (type === 5) return t >= 14;
  if (type === 6) return t < 2;
  return true;
}
// centres (along the wall) of the arches of an edge type
export const archCentres = (type) => (type === 1 ? [8] : type === 2 ? [4, 12] : type === 5 ? [16] : []);

// ---------------------------------------------------------------------------- rooms
const rooms = new Map();
export function roomAt(i, j) {
  const key = i + ',' + j;
  let r = rooms.get(key);
  if (!r) {
    r = new Room(i, j);
    rooms.set(key, r);
    if (rooms.size > 4000) { rooms.clear(); rooms.set(key, r); }
  }
  return r;
}
export const solidAt = (x, z) => {
  const i = Math.floor(x / R), j = Math.floor(z / R);
  return roomAt(i, j).S[(z - j * R) * R + (x - i * R)] !== 0;
};
// ceiling height next to the middle of a wall edge (for the height of arches)
export function wallHeight(dir, i, j, t) {
  const a = dir === 'V' ? roomAt(i - 1, j) : roomAt(i, j - 1), b = roomAt(i, j);
  return Math.max(a.ceilH, b.ceilH);
}

class Room {
  constructor(i, j) {
    this.i = i; this.j = j; this.x0 = i * R; this.z0 = j * R;
    this.type = roomType(i, j);
    const n = R * R;
    this.F = new Float32Array(n); this.C = new Float32Array(n);
    this.FM = new Uint8Array(n).fill(M.ei_tile_floor); this.WM = new Uint8Array(n).fill(M.ei_tile_wall);
    this.S = new Uint8Array(n); this.FL = new Uint16Array(n);
    this.pools = [];     // water slabs: {u0, v0, u1, v1} in local cells
    this.pillars = [];   // {x, z} absolute centres
    this.wells = [];     // {x, z, s} absolute centre, size in cells
    this.panels = [];    // ceiling light panels, absolute {x, z}
    this.drips = [];
    this.ceilH = 4.4;
    this.paint();
  }
  rect(u0, v0, u1, v1, fn) { for (let v = Math.max(0, v0); v < Math.min(R, v1); v++) for (let u = Math.max(0, u0); u < Math.min(R, u1); u++) fn(u, v, v * R + u); }

  // pool with a coping ring; shallow: side with the entry ramp ('N' 'S' 'E' 'W' or null)
  addPool(u0, v0, w, d, shallow, D, dry = false) {
    this.rect(u0 - 1, v0 - 1, u0 + w + 1, v0 + d + 1, (u, v, k) => { this.FM[k] = M.ei_tile_edge; this.WM[k] = M.ei_tile_edge; });
    this.rect(u0, v0, u0 + w, v0 + d, (u, v, k) => {
      let s = 9;
      if (shallow === 'N') s = v - v0; else if (shallow === 'S') s = v0 + d - 1 - v;
      else if (shallow === 'W') s = u - u0; else if (shallow === 'E') s = u0 + w - 1 - u;
      this.F[k] = -Math.min(D, 0.3 + 0.28 * s);
      this.FM[k] = dry ? M.ei_tile_edge : M.ei_tile_pool; this.WM[k] = dry ? M.ei_tile_edge : M.ei_tile_pool; if (!dry) this.FL[k] |= CF.WET;
    });
    this.pools.push({ u0, v0, u1: u0 + w, v1: v0 + d, shallow, D, deck: true, dry });
  }
  well(u, v, s) { // light well over local cells [u, u+s) x [v, v+s)
    const top = Math.min(this.ceilH + 1.3, 6.0);
    this.rect(u, v, u + s, v + s, (uu, vv, k) => { this.C[k] = top; });
    this.wells.push({ x: this.x0 + u + s / 2, z: this.z0 + v + s / 2, s, top });
  }
  pillar(u, v) { this.pillars.push({ x: this.x0 + u, z: this.z0 + v }); }

  paint() {
    const { i, j, type } = this;
    const h = (s) => hr(i, j, s);
    const alt = h(2) < 0.5;
    this.C.fill(this.ceilH);
    this.FM.fill(alt ? M.ei_tile_floor : M.ei_tile_floor_b);
    if (type === 'arrival') return this.paintArrival();
    if (type === 'pool') {
      this.ceilH = [4.0, 4.4, 4.8][Math.floor(h(4) * 3)];
      this.C.fill(this.ceilH);
      const w = 6 + 2 * Math.floor(h(5) * 3), d = 6 + 2 * Math.floor(h(6) * 3);
      const u0 = (R - w) >> 1, v0 = (R - d) >> 1;
      this.addPool(u0, v0, w, d, ['N', 'S', 'E', 'W'][Math.floor(h(7) * 4)], h(8) < 0.5 ? 1.0 : 1.2, h(10) < 0.18);
      for (const [a, b] of [[u0 - 1, v0 - 1], [u0 + w + 1, v0 - 1], [u0 - 1, v0 + d + 1], [u0 + w + 1, v0 + d + 1]]) this.pillar(a, b);
      this.well(u0 + (w >> 1) - 1, v0 + (d >> 1) - 1, 3);
      if (w >= 8) { this.well(u0 + 1, v0 + 1, 2); this.well(u0 + w - 3, v0 + d - 3, 2); }
    } else if (type === 'flood') {
      this.ceilH = [4.4, 4.8][Math.floor(h(4) * 2)];
      this.C.fill(this.ceilH);
      const D = 0.5 + 0.05 * Math.floor(h(8) * 5);
      this.rect(2, 2, 14, 14, (u, v, k) => { this.F[k] = -0.3; this.FM[k] = M.ei_tile_pool; this.WM[k] = M.ei_tile_edge; this.FL[k] |= CF.WET; });
      this.rect(3, 3, 13, 13, (u, v, k) => { this.F[k] = -D; });
      this.rect(1, 1, 15, 15, (u, v, k) => { if (u === 1 || v === 1 || u === 14 || v === 14) { this.FM[k] = M.ei_tile_edge; this.WM[k] = M.ei_tile_edge; } });
      this.pools.push({ u0: 2, v0: 2, u1: 14, v1: 14 });
      for (const a of [4.5, 8, 11.5]) for (const b of [4.5, 8, 11.5]) if (a !== 8 || b !== 8) this.pillar(a, b);
      this.well(6, 6, 4);
    } else if (type === 'pillars') {
      this.ceilH = [4.4, 4.8][Math.floor(h(4) * 2)];
      this.C.fill(this.ceilH);
      for (const a of [4, 8, 12]) for (const b of [4, 8, 12]) this.pillar(a, b);
      for (const [a, b] of [[5, 5], [10, 5], [5, 10], [10, 10]]) this.well(a, b, 2);
    } else if (type === 'plunge') {
      this.ceilH = 4.4; this.C.fill(this.ceilH);
      const D = h(8) < 0.5 ? 1.0 : 1.2;
      this.addPool(2, 2, 5, 5, 'E', D); this.addPool(9, 2, 5, 5, 'W', D);
      this.addPool(2, 9, 5, 5, 'E', D); this.addPool(9, 9, 5, 5, 'W', D);
      this.pillar(1, 1); this.pillar(15, 1); this.pillar(1, 15); this.pillar(15, 15);
      for (const [a, b] of [[3, 3], [10, 3], [3, 10], [10, 10]]) this.well(a, b, 3);
    } else if (type === 'lanes') {
      this.ceilH = 4.4; this.C.fill(this.ceilH);
      const D = h(8) < 0.5 ? 1.0 : 1.2;
      this.addPool(5, 2, 6, 12, h(7) < 0.5 ? 'N' : 'S', D, h(10) < 0.15);
      for (const v of [4, 8, 12]) { this.pillar(3.5, v); this.pillar(12.5, v); }
      this.well(6, 3, 4); this.well(6, 9, 4);
    } else { // corridors: 4 m wide, a cross of arms cut out of solid tile
      this.ceilH = 3.2 + 0.2 * Math.floor(h(4) * 3);
      this.C.fill(this.ceilH);
      const arm = { N: edgeType('H', i, j) !== 0, S: edgeType('H', i, j + 1) !== 0, W: edgeType('V', i, j) !== 0, E: edgeType('V', i + 1, j) !== 0 };
      const flooded = h(3) < 0.45, D = 0.5 + 0.05 * Math.floor(h(8) * 5);
      this.S.fill(1);
      const open = (u0, v0, u1, v1) => this.rect(u0, v0, u1, v1, (u, v, k) => { this.S[k] = 0; });
      open(6, 6, 10, 10);
      if (arm.N) open(6, 0, 10, 6);
      if (arm.S) open(6, 10, 10, 16);
      if (arm.W) open(0, 6, 6, 10);
      if (arm.E) open(10, 6, 16, 10);
      if (flooded) {
        this.rect(0, 0, R, R, (u, v, k) => {
          if (this.S[k]) return;
          const e = Math.min(u, v, 15 - u, 15 - v);
          if (e === 0) return;
          this.F[k] = e === 1 ? -0.3 : -D;
          this.FM[k] = M.ei_tile_pool; this.WM[k] = M.ei_tile_edge; this.FL[k] |= CF.WET;
        });
        this.pools.push({ u0: 6, v0: 6, u1: 10, v1: 10 });
        if (arm.N) this.pools.push({ u0: 6, v0: 0, u1: 10, v1: 6 });
        if (arm.S) this.pools.push({ u0: 6, v0: 10, u1: 10, v1: R });
        if (arm.W) this.pools.push({ u0: 0, v0: 6, u1: 6, v1: 10 });
        if (arm.E) this.pools.push({ u0: 10, v0: 6, u1: R, v1: 10 });
      }
      this.corr = { arm, flooded };
      for (let t = 2; t < 16; t += 4) {
        if (arm.N && t < 8) this.panels.push({ x: this.x0 + 8, z: this.z0 + t });
        if (arm.S && t > 8) this.panels.push({ x: this.x0 + 8, z: this.z0 + t });
        if (arm.W && t < 8) this.panels.push({ x: this.x0 + t, z: this.z0 + 8 });
        if (arm.E && t > 8) this.panels.push({ x: this.x0 + t, z: this.z0 + 8 });
      }
      this.panels.push({ x: this.x0 + 8, z: this.z0 + 8 });
      if (h(9) < 0.5) this.drips.push({ x: this.x0 + 8, z: this.z0 + 8 });
    }
  }

  // the promenade between two long pools; paints this room's quarter of the hall
  paintArrival() {
    const A = ARRIVAL;
    this.ceilH = A.ceil; this.C.fill(A.ceil);
    this.FM.fill(M.ei_tile_floor);
    const pools = [{ x0: 147, x1: 152, shallow: 'E' }, { x0: 168, x1: 173, shallow: 'W' }];
    for (let v = 0; v < R; v++) for (let u = 0; u < R; u++) {
      const x = this.x0 + u, z = this.z0 + v, k = v * R + u;
      if ((x + z) % 2 === 0 && x >= 153 && x < 167) this.FM[k] = M.ei_tile_floor_b;
      for (const p of pools) {
        const inRing = x >= p.x0 - 1 && x < p.x1 + 1 && z >= 130 && z < 158;
        if (inRing) { this.FM[k] = M.ei_tile_edge; this.WM[k] = M.ei_tile_edge; }
        if (x >= p.x0 && x < p.x1 && z >= 131 && z < 157) {
          const s = p.shallow === 'E' ? p.x1 - 1 - x : x - p.x0;
          this.F[k] = -Math.min(1.2, 0.3 + 0.28 * s);
          this.FM[k] = M.ei_tile_pool; this.WM[k] = M.ei_tile_pool; this.FL[k] |= CF.WET;
        }
      }
    }
    // each room of the hall contributes the part of the features that lies inside it
    const inside = (x, z) => x >= this.x0 && x < this.x0 + R && z >= this.z0 && z < this.z0 + R;
    for (const p of pools) {
      const u0 = Math.max(0, p.x0 - this.x0), u1 = Math.min(R, p.x1 - this.x0), v0 = Math.max(0, 131 - this.z0), v1 = Math.min(R, 157 - this.z0);
      if (u0 < u1 && v0 < v1) this.pools.push({ u0, v0, u1, v1, shallow: p.shallow, D: 1.2, part: true });
    }
    for (const x of [152.5, 167.5]) for (const z of [132.5, 138.5, 144.5, 150.5, 156.5]) if (inside(x, z)) this.pillars.push({ x, z });
    const wells = [];
    for (const wx of [148, 169]) for (const wz of [133, 142, 151]) wells.push([wx, wz, 3]);
    for (const wz of [133, 153]) wells.push([158, wz, 4]);
    for (const [wx, wz, s] of wells) {
      this.rect(wx - this.x0, wz - this.z0, wx - this.x0 + s, wz - this.z0 + s, (u, v, k) => { this.C[k] = 6.0; });
      if (inside(wx + s / 2, wz + s / 2)) this.wells.push({ x: wx + s / 2, z: wz + s / 2, s, top: 6.0 });
    }
  }
}
