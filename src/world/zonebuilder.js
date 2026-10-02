// ZoneBuilder: the cell grid + entity lists a zone generator writes into.
// Cells are 1m squares. Heights are relative to the level base (level * LEVEL_H).
// Each cell owns its west edge (line x) and north edge (line z) for thin walls.
import { RNG } from '../core/rng.js';
import { M } from './materials.js';
import { propLightFor } from './props.js';

// Wall material pairs are packed into one 32-bit value: material on the minus side in the low 16
// bits, plus side in the high 16 bits.
export const packMats = (minus, plus) => ((minus & 0xffff) | ((plus & 0xffff) << 16)) >>> 0;
export const matMinus = (packed) => packed & 0xffff;
export const matPlus = (packed) => packed >>> 16;

export const W = {
  NONE: 0, WALL: 1, HALF: 2, DOOR: 3, WINDOW: 4, RAIL: 5, GLASS: 6, ARCH: 7, LOW: 8, FULL: 9, PART: 10, UPPER: 11, BIGDOOR: 12,
};
// wall types that block walking at standing height
export const W_BLOCKS = new Set([W.WALL, W.HALF, W.WINDOW, W.RAIL, W.GLASS, W.FULL, W.PART]);

export const CF = { STAIRS: 1, VOID: 2, NOLIGHTBLEED: 4, WET: 8, NOPROPS: 16, GATE: 32, KEEP: 64, ROOMWALL: 128, HOLE_CEIL: 256 };

export class ZoneBuilder {
  constructor(zone, seedOverride) {
    this.zone = zone;
    this.x0 = zone.x0; this.z0 = zone.z0;
    this.x1 = zone.x1; this.z1 = zone.z1;
    this.w = zone.x1 - zone.x0; this.d = zone.z1 - zone.z0;
    const n = this.w * this.d;
    const p = zone.params || {};
    this.floor = new Float32Array(n);
    this.ceil = new Float32Array(n).fill(p.ceilH ?? 3);
    this.fmat = new Uint16Array(n).fill(p.floorMat ?? M.carpet_y);
    this.cmat = new Uint16Array(n).fill(p.ceilMat ?? M.ceil_tile);
    this.wmat = new Uint16Array(n).fill(p.wallMat ?? M.wp_stripe);
    this.solid = new Uint16Array(n);
    this.wallW = new Uint8Array(n);
    this.wallN = new Uint8Array(n);
    this.wmW = new Uint32Array(n);
    this.wmN = new Uint32Array(n);
    this.flags = new Uint16Array(n);
    this.room = new Int16Array(n).fill(-1);
    this.brushes = [];
    this.props = [];
    this.lights = [];
    this.fixtures = [];
    this.decals = [];
    this.emitters = [];
    this.specials = [];
    this.dynamics = [];
    this.gates = [];
    this.rng = new RNG(seedOverride ?? zone.seed);
    this.params = p;
  }

  in(x, z) { return x >= this.x0 && x < this.x1 && z >= this.z0 && z < this.z1; }
  i(x, z) { return (z - this.z0) * this.w + (x - this.x0); }

  // --- cell setters (silently ignore out-of-zone coordinates)
  setFloor(x, z, h, mat) { if (!this.in(x, z)) return; const i = this.i(x, z); this.floor[i] = h; if (mat) this.fmat[i] = mat; }
  setCeil(x, z, h, mat) { if (!this.in(x, z)) return; const i = this.i(x, z); this.ceil[i] = h; if (mat) this.cmat[i] = mat; }
  setSolid(x, z, mat) { if (!this.in(x, z)) return; this.solid[this.i(x, z)] = mat ?? this.params.wallMat ?? M.wp_stripe; }
  clearSolid(x, z) { if (this.in(x, z)) this.solid[this.i(x, z)] = 0; }
  isSolid(x, z) { return this.in(x, z) && this.solid[this.i(x, z)] !== 0; }
  setFlag(x, z, f) { if (this.in(x, z)) this.flags[this.i(x, z)] |= f; }
  hasFlag(x, z, f) { return this.in(x, z) && (this.flags[this.i(x, z)] & f) !== 0; }
  getFloor(x, z) { return this.in(x, z) ? this.floor[this.i(x, z)] : NaN; }
  getCeil(x, z) { return this.in(x, z) ? this.ceil[this.i(x, z)] : NaN; }

  fill(x0, z0, x1, z1, fn) {
    const ax = Math.max(x0, this.x0), az = Math.max(z0, this.z0), bx = Math.min(x1, this.x1), bz = Math.min(z1, this.z1);
    for (let z = az; z < bz; z++) for (let x = ax; x < bx; x++) fn(x, z, this.i(x, z));
  }
  rectFloor(x0, z0, x1, z1, h, mat) { this.fill(x0, z0, x1, z1, (x, z, i) => { this.floor[i] = h; if (mat) this.fmat[i] = mat; }); }
  rectCeil(x0, z0, x1, z1, h, mat) { this.fill(x0, z0, x1, z1, (x, z, i) => { this.ceil[i] = h; if (mat) this.cmat[i] = mat; }); }
  rectSolid(x0, z0, x1, z1, mat) { this.fill(x0, z0, x1, z1, (x, z, i) => { this.solid[i] = mat ?? this.params.wallMat; }); }
  rectClear(x0, z0, x1, z1) { this.fill(x0, z0, x1, z1, (x, z, i) => { this.solid[i] = 0; }); }
  rectWallMat(x0, z0, x1, z1, mat) { this.fill(x0, z0, x1, z1, (x, z, i) => { this.wmat[i] = mat; }); }
  rectRoom(x0, z0, x1, z1, id) { this.fill(x0, z0, x1, z1, (x, z, i) => { this.room[i] = id; }); }

  // Edge walls. side 'W' = west edge of cell (x,z); 'N' = north edge.
  // matMinus faces -x/-z (seen from the west/north cell), matPlus faces +x/+z.
  setWall(x, z, side, type, matMinus, matPlus) {
    if (!this.in(x, z)) return;
    const i = this.i(x, z);
    const mm = matMinus ?? this.params.wallMat ?? M.wp_stripe;
    const mp = matPlus ?? mm;
    if (side === 'W') { this.wallW[i] = type; this.wmW[i] = packMats(mm, mp); }
    else { this.wallN[i] = type; this.wmN[i] = packMats(mm, mp); }
  }
  getWall(x, z, side) {
    if (!this.in(x, z)) return -1;
    return side === 'W' ? this.wallW[this.i(x, z)] : this.wallN[this.i(x, z)];
  }
  // Wall along a grid line. Horizontal: z fixed, x from a to b. Vertical: x fixed, z from a to b.
  hLine(z, xa, xb, type, matMinus, matPlus) { for (let x = xa; x < xb; x++) this.setWall(x, z, 'N', type, matMinus, matPlus); }
  vLine(x, za, zb, type, matMinus, matPlus) { for (let z = za; z < zb; z++) this.setWall(x, z, 'W', type, matMinus, matPlus); }
  // walls around a rectangle of cells [x0,x1) x [z0,z1); inner = material facing into the rect
  roomWalls(x0, z0, x1, z1, type, inner, outer) {
    this.hLine(z0, x0, x1, type, outer, inner);
    this.hLine(z1, x0, x1, type, inner, outer);
    this.vLine(x0, z0, z1, type, outer, inner);
    this.vLine(x1, z0, z1, type, inner, outer);
  }

  // --- entities (x/z absolute, y relative to level base)
  box(x0, y0, z0, x1, y1, z1, mat, opts = {}) {
    const b = { x0, y0, z0, x1, y1, z1, mat, collide: opts.collide !== false, render: opts.render !== false, uv: opts.uv || 'world', sub: opts.sub || 0, flags: opts.flags || 0, skip: opts.skip || 0, tint: opts.tint || null, alpha: opts.alpha };
    this.brushes.push(b);
    return b;
  }
  prop(type, x, y, z, rot = 0, opts = {}) {
    const p = { type, x, y, z, rot, opts, seed: this.rng.int(0, 0x7fffffff) };
    this.props.push(p);
    const L = propLightFor(p);
    if (L) this.light(L.x, L.y, L.z, { color: L.color, rad: L.rad, int: L.int, ch: opts.ch || 0 });
    return p;
  }
  // Animated prop. anim: {spin: rad/s about y} and/or {osc: [amplitude rad, freq Hz, phase]}.
  dynamic(type, x, y, z, rot = 0, opts = {}, anim = {}) {
    const d = { type, x, y, z, rot, opts, anim, seed: this.rng.int(0, 0x7fffffff) };
    this.dynamics.push(d);
    return d;
  }
  light(x, y, z, opts = {}) {
    const l = {
      x, y, z,
      r: opts.color ? opts.color[0] : 1.0, g: opts.color ? opts.color[1] : 0.95, b: opts.color ? opts.color[2] : 0.82,
      rad: opts.rad ?? 6, int: opts.int ?? 0.62, ch: opts.ch ?? 0, local: !!opts.local,
    };
    this.lights.push(l);
    return l;
  }
  // ceiling light fixture (visual). kind: panel | troffer | tube | bulb | cage | highbay | none
  fixture(x, z, kind, on, opts = {}) {
    const f = { x, z, kind, on, ch: opts.ch ?? 0, rot: opts.rot ?? 0, y: opts.y, w: opts.w, l: opts.l, hang: opts.hang ?? 0 };
    this.fixtures.push(f);
    return f;
  }
  decal(x, y, z, face, w, h, tex, opts = {}) {
    // face: 'px','nx','pz','nz' (wall facing), 'up' (floor), 'down' (ceiling)
    const d = { x, y, z, face, w, h, tex, rot: opts.rot || 0, lit: opts.lit !== false, flags: opts.flags || 0, glow: opts.glow || 0, ch: opts.ch || 0 };
    this.decals.push(d);
    return d;
  }
  emitter(x, y, z, snd, opts = {}) {
    const e = { x, y, z, snd, vol: opts.vol ?? 1, rad: opts.rad ?? 12 };
    this.emitters.push(e);
    return e;
  }
  special(obj) { this.specials.push(obj); return obj; }

  // remove entities whose anchor falls inside a rect (used by stamps)
  clearEntities(x0, z0, x1, z1) {
    const inside = (x, z) => x >= x0 && x < x1 && z >= z0 && z < z1;
    this.props = this.props.filter((p) => !inside(p.x, p.z));
    this.lights = this.lights.filter((l) => !inside(l.x, l.z));
    this.fixtures = this.fixtures.filter((f) => !inside(f.x, f.z));
    this.decals = this.decals.filter((d) => !inside(d.x, d.z));
    this.emitters = this.emitters.filter((e) => !inside(e.x, e.z));
    this.brushes = this.brushes.filter((b) => !(b.x0 < x1 && b.x1 > x0 && b.z0 < z1 && b.z1 > z0));
    this.dynamics = this.dynamics.filter((p) => !inside(p.x, p.z));
  }

  // walkability between adjacent cells (used by connectivity checks)
  passable(x, z, dx, dz) {
    const nx = x + dx, nz = z + dz;
    if (!this.in(nx, nz) || !this.in(x, z)) return false;
    const a = this.i(x, z), b = this.i(nx, nz);
    if (this.solid[b] || this.solid[a]) return false;
    if (this.flags[b] & CF.VOID) return false;
    const fa = this.floor[a], fb = this.floor[b];
    if (Number.isNaN(fb) || Number.isNaN(fa)) return false;
    if (Math.abs(fb - fa) > 1.4 && !((this.flags[a] | this.flags[b]) & CF.STAIRS)) return false;
    let wt;
    if (dx === 1) wt = this.wallW[b];
    else if (dx === -1) wt = this.wallW[a];
    else if (dz === 1) wt = this.wallN[b];
    else wt = this.wallN[a];
    if (W_BLOCKS.has(wt)) return false;
    const ca = this.ceil[b];
    if (!Number.isNaN(ca) && ca - fb < 0.95) return false;
    return true;
  }
}
