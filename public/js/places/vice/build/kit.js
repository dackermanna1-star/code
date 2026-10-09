// The building kit of Vice City (adapted from The Outbreak's): every building,
// landmark and bit of street-level clutter is boxes, extruded outlines,
// roofs and flat shapes put down through this kit. It writes them straight
// into big vertex buffers - one set per 512-stud cell for the building
// masses (BASE) and their mouldings (MID), one per 256-stud cell for the
// small things seen only up close (NEAR) - so the whole city is a few draw
// calls per cell. Facades carry a window spec on their vertices and the
// material draws the windows (and the rooms behind them, and which are lit
// at night) in the shader, so a tower is a handful of triangles.
//
// No three.js here (plain numbers and typed arrays), so a city can be built
// and checked in Node.
//
//   const K = new Kit(phys);
//   K.begin(x, y, z, yaw, seed)      a building: its frame (local +z is its front), its cell
//   K.tier = BASE | MID | NEAR        where the next faces go (or K.at(MID, () => ...))
//   K.facade({kind, fh, bw, g, gk, v0, occ, variant})  the window spec for the next walls (null: none)
//   K.box(x, y, z, hx, hy, hz, m, o)  K.wall(ax, az, bx, bz, y0, y1, m, o)  K.prism(pts, y0, y1, m, o)
//   K.quad / tri / cyl / lathe / hipRoof / gableRoof / slab
//   K.sign(...), K.decal(...)          recorded for the sign and mural meshes
//   K.solid(...)                       a collision box with nothing drawn
//
// Surfaces: mat(layerKey, 0xrrggbb, {p: pattern, r: roughness 0..1, s: studs per repeat, glow 0..1, grime 0..1})
// patterns: 0 photo x tint, 4 paint (photo's shading, tint's colour), 5 flat colour,
//           6 neon tube (glows), 7 uplit paint (glows at the foot at night), 8 glass, 9 metal
import { TEX_LAYER } from '../world/textures.js';
import { rng } from '../../outbreak/noise.js';

export const CELL = 512, NCELL = 256;
export const BASE = 0, MID = 1, NEAR = 2;

// window kinds (the shader's switch): see build/materials.js
export const WIN = { none: 0, punched: 1, curtain: 2, ribbon: 3, resi: 4, block: 5, porthole: 6, high: 7, shutters: 8, office: 9 };
// ground floor kinds
export const GF = { same: 0, wall: 1, shop: 2, lobby: 3, shutter: 4, arcade: 5, garage: 6 };

/** Studs per texture repeat, and roughness, per layer. */
const SCALE = {
  asphalt: 22, asphaltWorn: 22, sidewalk: 14, pavers: 10, herringbone: 9, brickPave: 8, lawn: 14, sand: 18, wetSand: 18,
  stucco: 14, plaster: 12, facade: 16, cladding: 10, concrete: 14, blockWall: 8, brick: 7, marble: 12, floorTiles: 9,
  whiteTiles: 6, roofTiles: 8, deck: 7, metalSheet: 9, shutter: 9, rust: 10, palmBark: 6, gravel: 14,
};
const ROUGH = { marble: 0.35, whiteTiles: 0.4, floorTiles: 0.45, metalSheet: 0.55, shutter: 0.5, rust: 0.8, deck: 0.75, cladding: 0.6, facade: 0.7 };

/** sRGB 0..255 -> linear 0..255 */
const lin = (c) => { c /= 255; return Math.round(255 * (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))); };

const _mats = new Map();
/** A surface: photo layer, tint (sRGB hex), pattern and the rest (see the top of the file). Cached. */
export function mat(key, tint = 0xffffff, o = {}) {
  const id = key + ':' + tint + ':' + (o.p ?? '') + ':' + (o.r ?? '') + ':' + (o.s ?? '') + ':' + (o.glow ?? '') + ':' + (o.grime ?? '');
  let m = _mats.get(id);
  if (!m) {
    const p = o.p ?? (key === 'stucco' || key === 'plaster' ? 4 : 0);
    const grime = Math.round((o.grime ?? (p === 6 || p === 8 ? 0 : 0.35)) * 15);
    m = {
      key, l: TEX_LAYER[key] ?? 0, r: lin((tint >> 16) & 255), g: lin((tint >> 8) & 255), b: lin(tint & 255),
      p: p + grime * 16, ro: Math.round((o.r ?? ROUGH[key] ?? 0.85) * 255), sc: Math.min(255, Math.round(o.s ?? SCALE[key] ?? 12)),
      glow: Math.round((o.glow ?? 0) * 255), phys: o.phys || physOf(key, p),
    };
    _mats.set(id, m);
  }
  return m;
}
function physOf(key, p) {
  if (p === 8) return 'glass';
  if (/metal|rust|shutter/i.test(key) || p === 9) return 'metal';
  if (/deck/i.test(key)) return 'wood';
  if (/lawn/i.test(key)) return 'foliage';
  return 'concrete';
}

/** A growable set of vertex arrays (the layout the city's meshes use). */
export class VB {
  constructor(n = 4096) { this.nv = 0; this.ni = 0; this._alloc(n); }
  _alloc(n) {
    const o = this.pos ? this : null;
    this.cap = n;
    const pos = new Float32Array(n * 3), nrm = new Int8Array(n * 4), uv = new Float32Array(n * 2), lay = new Uint8Array(n * 4), tint = new Uint8Array(n * 4), win = new Uint16Array(n * 4);
    if (o) { pos.set(o.pos); nrm.set(o.nrm); uv.set(o.uv); lay.set(o.lay); tint.set(o.tint); win.set(o.win); }
    Object.assign(this, { pos, nrm, uv, lay, tint, win });
    if (!this.idx) this.idx = new Uint32Array(Math.ceil(n * 1.6));
  }
  reserve(nv, ni) {
    if (this.nv + nv > this.cap) this._alloc(Math.max(this.cap * 2, this.nv + nv + 64));
    if (this.ni + ni > this.idx.length) { const idx = new Uint32Array(Math.max(this.idx.length * 2, this.ni + ni + 96)); idx.set(this.idx); this.idx = idx; }
  }
  vert(x, y, z, nx, ny, nz, u, v, m, w) {
    const i = this.nv++, i3 = i * 3, i4 = i * 4;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.nrm[i4] = nx * 127; this.nrm[i4 + 1] = ny * 127; this.nrm[i4 + 2] = nz * 127;
    this.uv[i * 2] = u; this.uv[i * 2 + 1] = v;
    this.lay[i4] = m.l; this.lay[i4 + 1] = m.p; this.lay[i4 + 2] = m.ro; this.lay[i4 + 3] = m.sc;
    this.tint[i4] = m.r; this.tint[i4 + 1] = m.g; this.tint[i4 + 2] = m.b; this.tint[i4 + 3] = m.glow;
    if (w) { this.win[i4] = w[0]; this.win[i4 + 1] = w[1]; this.win[i4 + 2] = w[2]; this.win[i4 + 3] = w[3]; }
    return i;
  }
  tri(a, b, c) { this.idx[this.ni++] = a; this.idx[this.ni++] = b; this.idx[this.ni++] = c; }
  /** Append another buffer (merging cells). */
  append(o) {
    this.reserve(o.nv, o.ni);
    const b = this.nv;
    this.pos.set(o.pos.subarray(0, o.nv * 3), b * 3); this.nrm.set(o.nrm.subarray(0, o.nv * 4), b * 4); this.uv.set(o.uv.subarray(0, o.nv * 2), b * 2);
    this.lay.set(o.lay.subarray(0, o.nv * 4), b * 4); this.tint.set(o.tint.subarray(0, o.nv * 4), b * 4); this.win.set(o.win.subarray(0, o.nv * 4), b * 4);
    for (let i = 0; i < o.ni; i++) this.idx[this.ni + i] = o.idx[i] + b;
    this.nv += o.nv; this.ni += o.ni;
  }
  /** The arrays, as views of the used part (no copies). */
  arrays() {
    return { pos: this.pos.subarray(0, this.nv * 3), nrm: this.nrm.subarray(0, this.nv * 4), uv: this.uv.subarray(0, this.nv * 2), lay: this.lay.subarray(0, this.nv * 4), tint: this.tint.subarray(0, this.nv * 4), win: this.win.subarray(0, this.nv * 4), idx: this.idx.subarray(0, this.ni), nv: this.nv };
  }
}

/** A frame: position and turn about +y (three.js rotation.y: local +z goes to (sin yaw, cos yaw)). */
class Xf {
  constructor(x = 0, y = 0, z = 0, yaw = 0) { this.set(x, y, z, yaw); }
  set(x, y, z, yaw) { this.x = x; this.y = y; this.z = z; this.yaw = yaw; this.c = Math.cos(yaw); this.s = Math.sin(yaw); return this; }
  child(x, y, z, yaw) { return new Xf(this.x + x * this.c + z * this.s, this.y + y, this.z - x * this.s + z * this.c, this.yaw + yaw); }
}

const NOWIN = null;
const cellKey = (i, j) => i * 4096 + j;

export class Kit {
  /** phys: the collision world (or null). */
  constructor(phys) {
    this.phys = phys;
    this.big = new Map();   // 512 cells: {i, j, x, z, base: VB, mid: VB}
    this.small = new Map(); // 256 cells: {i, j, x, z, near: VB}
    this.buildings = [];
    this.signs = []; this.decals = [];
    this.tier = BASE;
    this.win = null;
    this.w = new Xf();
    this._stack = [];
    this.boxes = 0;
    this._p = [0, 0, 0];
    this.r = Math.random; // replaced per building
  }

  // ---- buildings and frames ----------------------------------------------------------------------------------------
  /** Start a building at world (x, y, z), turned by yaw (its front is local +z). Returns its record. */
  begin(x, y, z, yaw = 0, seed = 1, info = {}) {
    const B = { id: this.buildings.length, x, y, z, yaw, seed, ...info, bbox: [Infinity, Infinity, -Infinity, -Infinity], h: 0 };
    this.cur = B;
    this.buildings.push(B);
    this.r = rng((seed * 7919 + 13) >>> 0);
    this.w = new Xf(x, y, z, yaw);
    this._stack.length = 0;
    this.tier = BASE; this.win = null;
    this._cells(x, z);
    this._nv0 = [this.cell.base.nv, this.cell.mid.nv, this.ncell.near.nv];
    return B;
  }
  end() {
    const B = this.cur;
    // vertex counts by kind and tier (for tuning)
    const st = this.stats || (this.stats = {}), k = B?.kind || '?', a = st[k] || (st[k] = [0, 0, 0, 0]);
    if (this._nv0) { a[0] += this.cell.base.nv - this._nv0[0]; a[1] += this.cell.mid.nv - this._nv0[1]; a[2] += this.ncell.near.nv - this._nv0[2]; a[3]++; }
    this.cur = null; this.win = null; this.tier = BASE; return B;
  }
  /** The cells the following geometry goes to (by default the building's origin). */
  _cells(x, z) {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL), k = cellKey(i, j);
    let c = this.big.get(k);
    if (!c) this.big.set(k, (c = { i, j, x: (i + 0.5) * CELL, z: (j + 0.5) * CELL, base: new VB(4096), mid: new VB(8192) }));
    const i2 = Math.floor(x / NCELL), j2 = Math.floor(z / NCELL), k2 = cellKey(i2, j2);
    let s = this.small.get(k2);
    if (!s) this.small.set(k2, (s = { i: i2, j: j2, x: (i2 + 0.5) * NCELL, z: (j2 + 0.5) * NCELL, near: new VB(2048) }));
    this.cell = c; this.ncell = s;
  }
  get vb() { return this.tier === BASE ? this.cell.base : this.tier === MID ? this.cell.mid : this.ncell.near; }
  /** Run fn with the faces going to `tier`. */
  at(tier, fn) { const t = this.tier; this.tier = tier; try { fn(); } finally { this.tier = t; } }

  push(x, y, z, yaw = 0) { this._stack.push([this.w, this.win]); this.w = this.w.child(x, y, z, yaw); }
  pop() { [this.w, this.win] = this._stack.pop(); }
  /** World position of a local point. */
  world(x, y, z, out = this._p) { const w = this.w; out[0] = w.x + x * w.c + z * w.s; out[1] = w.y + y; out[2] = w.z - x * w.s + z * w.c; return out; }
  /** Local direction -> world (x, z). */
  dirW(x, z) { const w = this.w; return [x * w.c + z * w.s, -x * w.s + z * w.c]; }

  /**
   * The window spec for the walls that follow (null: plain walls).
   * kind (WIN), fh floor height, bw bay width, v0 local height where the upper floors start (top of the ground
   * floor), gk ground floor kind (GF, below v0), occ 0..1 how many windows are lit at night, variant 0..15.
   */
  facade(spec) { this.win = spec ? this.spec(spec) : null; }
  /** A window spec with its codes worked out (for o.win on a single wall or box). */
  spec(spec) {
    const s = { kind: 1, fh: 12, bw: 10, v0: 0, gk: 0, occ: 0.4, variant: 0, ...spec };
    s.code = (s.kind & 15) + ((s.variant & 15) << 4) + ((s.gk & 15) << 8);
    s.seed = ((this.cur ? this.cur.seed * 31 + this.buildings.length : 1) & 4095) + (Math.round(Math.max(0, Math.min(1, s.occ)) * 15) << 12);
    return s;
  }

  // ---- primitives ------------------------------------------------------------------------------------------------------
  /**
   * A vertical wall from local (ax, az) to (bx, bz), y0..y1; it faces (-dz, dx) (to the left of a->b seen
   * from above with +z down the page, i.e. outward for an outline listed anticlockwise from above).
   * o: { win: spec|false (default: the current facade), u0: texture offset along, n0/n1: [nx, nz] normals at a/b (smooth) }
   */
  wall(ax, az, bx, bz, y0, y1, m, o = {}) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 1e-4 || y1 - y0 < 1e-4) return;
    const vb = this.vb; vb.reserve(4, 6);
    const w = this.w, p = this._p;
    let nax = -dz / L, naz = dx / L, nbx = nax, nbz = naz;
    if (o.n0) { nax = o.n0[0]; naz = o.n0[1]; }
    if (o.n1) { nbx = o.n1[0]; nbz = o.n1[1]; }
    const spec = o.win === undefined ? this.win : o.win || null;
    let wa = null;
    if (spec && spec.kind !== undefined) {
      const total = o.span || L; // windows fitted to the whole run (an outline) or this wall
      const n = Math.max(1, Math.round(total / spec.bw)), bw = total / n;
      wa = [spec.code, Math.round(spec.fh * 64), Math.min(65535, Math.round(bw * 64)), spec.seed];
    }
    const u0 = o.u0 || 0, v0 = (spec ? spec.v0 : 0) + (this.cur ? this.cur.y : 0);
    const base = vb.nv;
    const wax = nax * w.c + naz * w.s, waz = -nax * w.s + naz * w.c, wbx = nbx * w.c + nbz * w.s, wbz = -nbx * w.s + nbz * w.c;
    this.world(ax, y0, az, p); vb.vert(p[0], p[1], p[2], wax, 0, waz, u0, p[1] - v0, m, wa);
    this.world(bx, y0, bz, p); vb.vert(p[0], p[1], p[2], wbx, 0, wbz, u0 + L, p[1] - v0, m, wa);
    this.world(bx, y1, bz, p); vb.vert(p[0], p[1], p[2], wbx, 0, wbz, u0 + L, p[1] - v0, m, wa);
    this.world(ax, y1, az, p); vb.vert(p[0], p[1], p[2], wax, 0, waz, u0, p[1] - v0, m, wa);
    vb.tri(base, base + 1, base + 2); vb.tri(base, base + 2, base + 3);
    if (this.cur && y1 > this.cur.h) this.cur.h = y1;
  }

  /** A horizontal polygon at height y (points [[x, z], ...] anticlockwise from above; convex or not). down: facing down. */
  cap(pts, y, m, o = {}) {
    const vb = this.vb, n = pts.length;
    if (n < 3) return;
    vb.reserve(n, (n - 2) * 3);
    const base = vb.nv, p = this._p, ny = o.down ? -1 : 1;
    for (const q of pts) { this.world(q[0], y, q[1], p); vb.vert(p[0], p[1], p[2], 0, ny, 0, o.local ? q[0] : p[0], o.local ? q[1] : p[2], m, NOWIN); }
    const tris = n === 3 || n === 4 || o.convex ? fanTris(n) : earClip(pts);
    for (let i = 0; i < tris.length; i += 3) {
      if (o.down) vb.tri(base + tris[i], base + tris[i + 2], base + tris[i + 1]);
      else vb.tri(base + tris[i], base + tris[i + 1], base + tris[i + 2]);
    }
  }

  /**
   * A box centred at local (x, y, z), half sizes (hx, hy, hz). m: a surface or {side, top, bottom, px, nx, pz, nz}.
   * o: { skip: 'py ny px nx pz nz' faces to leave out, win (spec for the sides; default the current facade),
   *      winFaces: 'pz px' only these sides get windows, col (collision; default: BASE tier), mat, extra, yaw }
   */
  box(x, y, z, hx, hy, hz, m, o = {}) {
    if (o.yaw) { this.push(x, y, z, o.yaw); const r = this.box(0, 0, 0, hx, hy, hz, m, { ...o, yaw: 0 }); this.pop(); return r; }
    const skip = o.skip || '';
    const x0 = x - hx, x1 = x + hx, z0 = z - hz, z1 = z + hz, y0 = y - hy, y1 = y + hy;
    const win = o.win === undefined ? this.win : o.win;
    const wf = o.winFaces;
    const side = (f) => pick(m, f);
    const W = (f) => (win && (!wf || wf.includes(f)) ? win : false);
    if (!skip.includes('pz')) this.wall(x0, z1, x1, z1, y0, y1, side('pz'), { win: W('pz') });
    if (!skip.includes('px')) this.wall(x1, z1, x1, z0, y0, y1, side('px'), { win: W('px') });
    if (!skip.includes('nz')) this.wall(x1, z0, x0, z0, y0, y1, side('nz'), { win: W('nz') });
    if (!skip.includes('nx')) this.wall(x0, z0, x0, z1, y0, y1, side('nx'), { win: W('nx') });
    if (!skip.includes('py')) this.cap([[x0, z1], [x1, z1], [x1, z0], [x0, z0]], y1, side('py'));
    if (o.bottom || skip.includes('+ny')) this.cap([[x0, z1], [x1, z1], [x1, z0], [x0, z0]], y0, side('ny'), { down: true });
    return this._col(o, x, y, z, hx, hy, hz, m);
  }
  /** A box from corner to corner (local). */
  span(x0, y0, z0, x1, y1, z1, m, o) {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, Math.abs(z1 - z0) / 2, m, o);
  }
  _col(o, x, y, z, hx, hy, hz, m) {
    const col = o.col ?? (this.tier === BASE);
    if (!col || !this.phys) return null;
    const c = this.world(x, y, z, [0, 0, 0]);
    const bx = this.phys.add(c[0], c[1], c[2], hx, hy, hz, this.w.yaw + (o.cyaw || 0), o.mat || pick(m, 'pz')?.phys || 'concrete', { building: true, bid: this.cur?.id, ...(o.extra || {}) });
    this.boxes++;
    return bx;
  }
  /** A collision box with nothing drawn (local centre and half sizes). */
  solid(x, y, z, hx, hy, hz, matName = 'concrete', extra = {}) {
    if (!this.phys) return null;
    const c = this.world(x, y, z, [0, 0, 0]);
    this.boxes++;
    return this.phys.add(c[0], c[1], c[2], hx, hy, hz, this.w.yaw, matName, { building: true, bid: this.cur?.id, ...extra });
  }

  /**
   * An upright extrusion of an outline (anticlockwise from above) from y0 to y1: walls (windows run on round
   * the whole outline), a top and (o.bottom) a bottom. o.smooth: the angle (radians) under which corners are
   * rounded off in the shading. o.closed (default true). o.top: false to leave the top open, or a surface.
   * o.col: 'box' adds one collision box round the outline.
   */
  prism(pts, y0, y1, m, o = {}) {
    const n = pts.length, closed = o.closed !== false;
    const ne = closed ? n : n - 1;
    let per = 0;
    const len = [];
    for (let i = 0; i < ne; i++) { const a = pts[i], b = pts[(i + 1) % n]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); len.push(l); per += l; }
    // normals at the corners (smooth where the turn is gentle)
    const en = [];
    for (let i = 0; i < ne; i++) { const a = pts[i], b = pts[(i + 1) % n], l = len[i] || 1; en.push([-(b[1] - a[1]) / l, (b[0] - a[0]) / l]); }
    const sm = o.smooth ?? 0;
    const side = pick(m, 'side');
    const spec = o.win === undefined ? this.win : o.win || null;
    let u = o.u0 || 0;
    for (let i = 0; i < ne; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      let n0 = en[i], n1 = en[i];
      if (sm > 0) {
        const ip = closed ? (i - 1 + ne) % ne : i - 1, inx = closed ? (i + 1) % ne : i + 1;
        if (ip >= 0 && angle(en[ip], en[i]) < sm) n0 = norm2(en[ip][0] + en[i][0], en[ip][1] + en[i][1]);
        if (inx < ne && angle(en[inx], en[i]) < sm) n1 = norm2(en[inx][0] + en[i][0], en[inx][1] + en[i][1]);
      }
      this.wall(a[0], a[1], b[0], b[1], y0, y1, side, { win: spec || false, u0: u, n0, n1, span: o.fit === 'wall' ? 0 : per });
      u += len[i];
    }
    if (o.top !== false && closed) this.cap(pts, y1, o.top || pick(m, 'py'));
    if (o.bottom && closed) this.cap(pts, y0, pick(m, 'ny'), { down: true });
    if (o.col) {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const q of pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
      const sh = o.col === 'inset' ? 0.82 : 1;
      this._col({ col: true, mat: o.mat }, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, (x1 - x0) / 2 * sh, (y1 - y0) / 2, (z1 - z0) / 2 * sh, m);
    }
  }

  /** An upright cylinder (n sides) at local (x, z) from y0 to y1, radius r. Windows wrap round it. */
  cyl(x, z, r, y0, y1, m, o = {}) {
    const n = o.seg ?? 16, pts = [];
    const a0 = o.a0 ?? 0, a1 = o.a1 ?? Math.PI * 2, full = o.a1 === undefined;
    const cnt = full ? n : n + 1;
    for (let i = 0; i < cnt; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([x + Math.cos(a) * r, z - Math.sin(a) * r]); }
    if (!full) pts.push([x, z]);
    this.prism(pts, y0, y1, m, { smooth: full ? 1.2 : 0, ...o, smooth: o.smooth ?? (full ? 1.2 : 0) });
  }

  /** A flat quad (local corners anticlockwise seen from the front). o.both: two-sided. uv: world-planar. */
  quad(a, b, c, d, m, o = {}) {
    this._poly([a, b, c, d], m, o);
    if (o.both) this._poly([d, c, b, a], o.back || m, o);
  }
  tri(a, b, c, m, o = {}) {
    this._poly([a, b, c], m, o);
    if (o.both) this._poly([c, b, a], o.back || m, o);
  }
  _poly(P, m, o) {
    const vb = this.vb, n = P.length;
    vb.reserve(n, (n - 2) * 3);
    const a = P[0], b = P[1], c = P[n - 1];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    const w = this.w, p = this._p;
    const nwx = nx * w.c + nz * w.s, nwz = -nx * w.s + nz * w.c;
    // texture axes: along the first edge, and across it in the plane
    const el = Math.hypot(ux, uy, uz) || 1, ex = ux / el, ey = uy / el, ez = uz / el;
    const fx = ny * ez - nz * ey, fy = nz * ex - nx * ez, fz = nx * ey - ny * ex;
    const base = vb.nv;
    for (const q of P) {
      this.world(q[0], q[1], q[2], p);
      let uu, vv;
      if (Math.abs(ny) > 0.95 && !o.local) { uu = p[0]; vv = p[2]; } else { const dx = q[0] - a[0], dy = q[1] - a[1], dz = q[2] - a[2]; uu = dx * ex + dy * ey + dz * ez; vv = dx * fx + dy * fy + dz * fz; }
      vb.vert(p[0], p[1], p[2], nwx, ny, nwz, uu, vv, m, NOWIN);
    }
    for (let i = 1; i < n - 1; i++) vb.tri(base, base + i, base + i + 1);
  }

  /** A shape turned on a lathe: profile [[r, y], ...] bottom up, at local (x, y, z). Domes, cupolas, tanks. */
  lathe(x, y, z, profile, m, o = {}) {
    const n = o.seg ?? 16, vb = this.vb, w = this.w, p = this._p;
    let len = 0;
    for (let k = 0; k < profile.length - 1; k++) {
      const [r0, y0] = profile[k], [r1, y1] = profile[k + 1];
      const sl = Math.hypot(r1 - r0, y1 - y0) || 1e-3;
      const ny = (r0 - r1) / sl, nr = (y1 - y0) / sl;
      vb.reserve(n * 4, n * 6);
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        const base = vb.nv;
        for (const [aa, rr, yy, vv] of [[a0, r0, y0, len], [a1, r0, y0, len], [a1, r1, y1, len + sl], [a0, r1, y1, len + sl]]) {
          const cx = Math.cos(aa), cz = -Math.sin(aa);
          this.world(x + cx * rr, y + yy, z + cz * rr, p);
          const nx = cx * nr, nz = cz * nr;
          vb.vert(p[0], p[1], p[2], nx * w.c + nz * w.s, ny, -nx * w.s + nz * w.c, aa * Math.max(r0, r1, 1), vv, m, NOWIN);
        }
        vb.tri(base, base + 1, base + 2); vb.tri(base, base + 2, base + 3);
      }
      len += sl;
    }
    const R = Math.max(...profile.map((q) => q[0]));
    this._bbox(x, z, R);
  }

  /** A hipped roof over local rectangle (cx, cz, hx, hz) from eave height y, rising h. ov: overhang. */
  hipRoof(cx, y, cz, hx, hz, h, m, o = {}) {
    const ov = o.ov ?? 1.5, ax = hx + ov, az = hz + ov;
    const long = ax >= az, r = long ? ax - az : az - ax;
    const A = [cx - ax, y, cz + az], B = [cx + ax, y, cz + az], C = [cx + ax, y, cz - az], D = [cx - ax, y, cz - az];
    const t = y + h;
    const R1 = long ? [cx - r, t, cz] : [cx, t, cz + r], R2 = long ? [cx + r, t, cz] : [cx, t, cz - r];
    if (long) {
      this.quad(A, B, R2, R1, m); this.quad(C, D, R1, R2, m);
      this.tri(B, C, R2, m); this.tri(D, A, R1, m);
    } else {
      this.tri(A, B, R1, m); this.tri(C, D, R2, m);
      this.quad(B, C, R2, R1, m); this.quad(D, A, R1, R2, m);
    }
    if (o.soffit !== false) this.cap([[A[0], A[2]], [B[0], B[2]], [C[0], C[2]], [D[0], D[2]]], y, o.soffit || m, { down: true });
  }
  /** A gabled roof, ridge along local x (or z with o.alongZ), gable ends filled with `end`. */
  gableRoof(cx, y, cz, hx, hz, h, m, end, o = {}) {
    const ov = o.ov ?? 1.2;
    if (o.alongZ) { this.push(cx, 0, cz, Math.PI / 2); this.gableRoof(0, y, 0, hz, hx, h, m, end, { ...o, alongZ: false }); this.pop(); return; }
    const ax = hx + ov, az = hz + ov, t = y + h;
    this.quad([cx - ax, y, cz + az], [cx + ax, y, cz + az], [cx + ax, t, cz], [cx - ax, t, cz], m);
    this.quad([cx + ax, y, cz - az], [cx - ax, y, cz - az], [cx - ax, t, cz], [cx + ax, t, cz], m);
    if (end) { this.tri([cx + hx, y, cz + hz], [cx + hx, y, cz - hz], [cx + hx, t, cz], end); this.tri([cx - hx, y, cz - hz], [cx - hx, y, cz + hz], [cx - hx, t, cz], end); }
  }

  // ---- records -------------------------------------------------------------------------------------------------------------
  /**
   * A sign: centre local (x, y, z), facing local +z turned by o.yaw; w x h studs.
   * style: 'neon' (glowing tubes), 'neonV' (vertical), 'box' (lit box sign), 'paint', 'plate', or a named one (see materials.js).
   * o: { yaw, color (0xrrggbb for neon / text), bg, fg, font, tier (default MID) }
   */
  sign(x, y, z, w, h, text, style = 'paint', o = {}) {
    const c = this.world(x, y, z, [0, 0, 0]);
    this.signs.push({ x: c[0], y: c[1], z: c[2], yaw: this.w.yaw + (o.yaw || 0), w, h, text, style, color: o.color ?? 0xffffff, bg: o.bg, fg: o.fg, font: o.font, tier: o.tier ?? MID, both: !!o.both });
  }
  /** A painted picture on a wall (a mural from the atlas): centre, facing local +z (turned by yaw), w x h. */
  decal(x, y, z, w, h, index, yaw = 0) {
    const c = this.world(x, y, z, [0, 0, 0]);
    this.decals.push({ x: c[0], y: c[1], z: c[2], yaw: this.w.yaw + yaw, w, h, index });
  }

  _bbox(x, z, r) {
    const B = this.cur; if (!B) return;
    const p = this.world(x, 0, z, [0, 0, 0]);
    if (p[0] - r < B.bbox[0]) B.bbox[0] = p[0] - r; if (p[2] - r < B.bbox[1]) B.bbox[1] = p[2] - r;
    if (p[0] + r > B.bbox[2]) B.bbox[2] = p[0] + r; if (p[2] + r > B.bbox[3]) B.bbox[3] = p[2] + r;
  }
}

function pick(m, face) {
  if (!m) return null;
  if (m.l !== undefined) return m;
  if (m[face]) return m[face];
  if (face === 'py') return m.top ?? m.side;
  if (face === 'ny') return m.bottom ?? m.side;
  return m.side ?? m.top;
}
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
const norm2 = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
function fanTris(n) { const t = []; for (let i = 1; i < n - 1; i++) t.push(0, i, i + 1); return t; }

/** Ear clipping for a simple polygon anticlockwise from above (x, z with +z south). Returns index triples. */
function earClip(pts) {
  const n = pts.length, idx = [...Array(n).keys()], out = [];
  // anticlockwise from above means the signed area in (x, -z) is positive
  const cross = (o, a, b) => (a[0] - o[0]) * (-(b[1] - o[1])) - (-(a[1] - o[1])) * (b[0] - o[0]);
  const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 5000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k - 1 + idx.length) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      const a = pts[i0], b = pts[i1], c = pts[i2];
      if (cross(a, b, c) <= 1e-9) continue; // reflex
      let ok = true;
      for (const j of idx) { if (j === i0 || j === i1 || j === i2) continue; if (inside(pts[j], a, b, c)) { ok = false; break; } }
      if (!ok) continue;
      out.push(i0, i1, i2); idx.splice(k, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
  return out;
}
