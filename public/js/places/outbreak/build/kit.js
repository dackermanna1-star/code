// The building kit: everything built in the Outbreak - houses, blocks of
// flats, hangars, fences, cars, beds and shelves - is boxes and a few flat
// shapes (roofs, gables) put down through this kit. It writes them straight
// into big shared vertex buffers, one set for each 256-stud square of the
// map, so a whole town is a handful of draw calls; each face gets one of the
// photo textures (by layer), a tint, and how much sky light reaches it (less
// indoors). Solid things become collision boxes as they're placed. Doors,
// loot spots and the rooms/doorways the infected find their way through are
// recorded on the building as it's built.
//
// No three.js in the kit itself (it's plain numbers and typed arrays) so a
// whole map can be built and checked without a browser.
import { rng } from '../noise.js';
import { SURF } from '../texdata.js';

const SURF_LAYER = Object.fromEntries(SURF.map((t, i) => [t.key, i]));

export const CELL = 256;

/** How many studs one repeat of each texture covers. */
export const SURF_SCALE = {
  plaster: 9, plasterOld: 10, stucco: 10, brick: 7, brickOld: 8, panel: 16, concrete: 12, roofTile: 8, roofSlate: 8,
  metal: 7, metalRust: 8, planks: 9, woodFloor: 9, tiles: 6, container: 14, rust: 9, pavement: 12, pavers: 9,
  asphalt: 14, track: 16, bark: 6, bark2: 6, stone: 11, fabric: 4, woodFine: 5, metalPlate: 6, milMetal: 10,
  wallpaper: 9, linoleum: 8, whiteTiles: 6, woodPaint: 9, concFloor: 14,
};
const ROUGH = { metal: 150, metalRust: 200, rust: 200, container: 170, milMetal: 175, metalPlate: 140, tiles: 120, whiteTiles: 90, linoleum: 150, woodFine: 160, glass: 20 };

const _mats = new Map();
/**
 * A surface: photo texture `key`, tint (0xrrggbb, multiplies the photo), and
 * o.p a pattern drawn over it (1 stripes, 2 small diamonds, 3 painted band, 4 plain paint, 5 flat colour).
 */
export function mat(key, tint = 0xffffff, o = {}) {
  // the stained concrete render reads as rock unless it's painted over
  if (key === 'stucco' && o.p === undefined) o = { ...o, p: 4 };
  const id = key + ':' + tint + ':' + (o.p || 0) + ':' + (o.r ?? '') + ':' + (o.scale ?? '');
  let m = _mats.get(id);
  if (!m) {
    m = { key, l: SURF_LAYER[key] ?? 0, r: (tint >> 16) & 255, g: (tint >> 8) & 255, b: tint & 255, p: o.p || 0, ro: o.r ?? ROUGH[key] ?? 235, sc: 1 / (o.scale ?? SURF_SCALE[key] ?? 10), phys: o.phys || physOf(key) };
    _mats.set(id, m);
  }
  return m;
}
function physOf(key) {
  if (/metal|rust|container|milMetal|metalPlate/i.test(key)) return 'metal';
  if (/plank|wood|bark/i.test(key)) return 'wood';
  if (/fabric/.test(key)) return 'cloth';
  if (/glass/.test(key)) return 'glass';
  return 'concrete';
}

/** A growable set of vertex arrays. */
export class VB {
  constructor(n = 2048) { this._alloc(n); this.nv = 0; this.ni = 0; }
  _alloc(n) {
    const o = this.pos ? this : null;
    this.cap = n;
    const pos = new Float32Array(n * 3), nrm = new Int8Array(n * 4), uv = new Float32Array(n * 2), tint = new Uint8Array(n * 4), lay = new Uint8Array(n * 4);
    const idx = new Uint32Array(Math.ceil(n * 1.6));
    if (o) { pos.set(o.pos); nrm.set(o.nrm); uv.set(o.uv); tint.set(o.tint); lay.set(o.lay); idx.set(o.idx.subarray(0, Math.min(o.idx.length, idx.length))); }
    Object.assign(this, { pos, nrm, uv, tint, lay, idx });
  }
  reserve(nv, ni) {
    if (this.nv + nv > this.cap) this._alloc(Math.max(this.cap * 2, this.nv + nv + 64));
    if (this.ni + ni > this.idx.length) { const idx = new Uint32Array(Math.max(this.idx.length * 2, this.ni + ni + 96)); idx.set(this.idx); this.idx = idx; }
  }
  vert(x, y, z, nx, ny, nz, u, v, m, ao) {
    const i = this.nv++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.nrm[i * 4] = nx * 127; this.nrm[i * 4 + 1] = ny * 127; this.nrm[i * 4 + 2] = nz * 127;
    this.uv[i * 2] = u; this.uv[i * 2 + 1] = v;
    this.tint[i * 4] = m.r; this.tint[i * 4 + 1] = m.g; this.tint[i * 4 + 2] = m.b; this.tint[i * 4 + 3] = ao * 255;
    this.lay[i * 4] = m.l; this.lay[i * 4 + 1] = m.p; this.lay[i * 4 + 2] = m.ro;
    return i;
  }
  tri(a, b, c) { this.idx[this.ni++] = a; this.idx[this.ni++] = b; this.idx[this.ni++] = c; }
  /** The arrays, trimmed. */
  arrays() {
    return { pos: this.pos.slice(0, this.nv * 3), nrm: this.nrm.slice(0, this.nv * 4), uv: this.uv.slice(0, this.nv * 2), tint: this.tint.slice(0, this.nv * 4), lay: this.lay.slice(0, this.nv * 4), idx: this.idx.slice(0, this.ni), nv: this.nv };
  }
}

/** A transform: position and turn about the vertical (three.js rotation.y convention). */
class Xf {
  constructor(x = 0, y = 0, z = 0, yaw = 0) { this.set(x, y, z, yaw); }
  set(x, y, z, yaw) { this.x = x; this.y = y; this.z = z; this.yaw = yaw; this.c = Math.cos(yaw); this.s = Math.sin(yaw); return this; }
  child(x, y, z, yaw) { return new Xf(this.x + x * this.c + z * this.s, this.y + y, this.z - x * this.s + z * this.c, this.yaw + yaw); }
}

// each face: its name, outward normal, and the two axes across it (t x b = n, so the corners go round anticlockwise seen from outside)
const FACES = [
  { name: 'px', n: [1, 0, 0], t: [0, 0, -1], b: [0, 1, 0] },
  { name: 'nx', n: [-1, 0, 0], t: [0, 0, 1], b: [0, 1, 0] },
  { name: 'py', n: [0, 1, 0], t: [1, 0, 0], b: [0, 0, -1] },
  { name: 'ny', n: [0, -1, 0], t: [1, 0, 0], b: [0, 0, 1] },
  { name: 'pz', n: [0, 0, 1], t: [1, 0, 0], b: [0, 1, 0] },
  { name: 'nz', n: [0, 0, -1], t: [-1, 0, 0], b: [0, 1, 0] },
];
const CU = [-1, 1, 1, -1], CV = [-1, -1, 1, 1];

export class Kit {
  /** phys: the collision world (or null). */
  constructor(phys) {
    this.phys = phys;
    this.cells = new Map(); // key -> { x, z, opaque: VB, glass: VB }
    this.buildings = [];
    this.doors = [];
    this.loot = [];
    this.ao = 1;
    this.w = new Xf(); this.b = new Xf();
    this._stack = [];
    // the random numbers: a wrapper round a swappable generator, so a deferred job can have its own
    this._rng = rng(1);
    this.r = () => this._rng();
    this.lazy = false; // when set, furniture (defer) is kept for later instead of built now
    this._p = [0, 0, 0]; this._q = [0, 0, 0];
    this.boxes = 0;
  }

  // --- buildings and frames ---------------------------------------------------------------------------------------
  /** Start a building (or prop group) at world (x, y, z) turned by yaw. */
  begin(site) {
    const B = { id: this.buildings.length, site, x: site.x, y: site.y, z: site.z, yaw: site.yaw || 0, kind: site.tpl || site.kind, rooms: [], links: [], doors: [], loot: [], stairs: [], ladders: [], colliders: [], bbox: [Infinity, Infinity, -Infinity, -Infinity], ins: [] };
    this.cur = B;
    this._rng = rng((site.seed ?? 1) * 7919 + 13);
    B.jobs = [];
    this.w = new Xf(site.x, site.y, site.z, site.yaw || 0);
    this.b = new Xf();
    this._stack.length = 0;
    this.ao = 1;
    const k = cellKey(site.x, site.z);
    let c = this.cells.get(k);
    if (!c) this.cells.set(k, (c = { key: k, x: Math.floor(site.x / CELL) * CELL + CELL / 2, z: Math.floor(site.z / CELL) * CELL + CELL / 2, opaque: new VB(8192), inner: new VB(8192), detail: new VB(4096), glass: new VB(512), buildings: [] }));
    c.buildings.push(B);
    this.cell = c;
    this.buildings.push(B);
    return B;
  }
  end() { const B = this.cur; this.cur = null; return B; }
  _keep(bx) { if (this.collect) this.collect.push(bx); else if (this.cur) this.cur.colliders.push(bx); }

  /**
   * Furniture and clutter: built now, or (K.lazy) kept as a job to build when
   * someone comes near - with the frame it was asked for in, and its own seed.
   */
  defer(fn) {
    if (!this.lazy || this.collect) { fn(); return; }
    const B = this.cur;
    B.jobs.push({ fn, w: this.w, b: this.b, ao: this.ao, detail: this.detail, seed: ((B.site.seed ?? 1) * 131 + B.jobs.length * 7919 + 17) >>> 0 });
  }
  /**
   * Run a building's jobs into the vertex buffer `vb` (one buffer for everything). Returns
   * { colliders, loot } made on the way. Loot spots get keys that are the same every time.
   */
  runJobs(B, vb) {
    const out = { colliders: [], loot: [], ladders: [] };
    for (let ji = 0; ji < B.jobs.length; ji++) this.runJob(B, ji, vb, out);
    return out;
  }
  /** Run one of a building's jobs into vb, adding what it makes to out ({ colliders, loot, ladders }). */
  runJob(B, ji, vb, out) {
    const save = [this.w, this.b, this.ao, this.detail, this.cur, this.cell, this._rng, this.collect, this.lootTo, this._stack, this.ladderTo];
    const j = B.jobs[ji];
    this.cur = B; this.cell = { opaque: vb, inner: vb, detail: vb, glass: vb };
    this.collect = out.colliders; this.lootTo = out.loot; this.ladderTo = out.ladders;
    this.w = j.w; this.b = j.b; this.ao = j.ao; this.detail = j.detail; this._stack = [];
    this._rng = rng(j.seed);
    this._lootKey = B.id + ':' + ji + ':';
    this._lootN = 0;
    try { j.fn(); } catch (e) { console.warn('outbreak: furnishing failed', B.kind, e); }
    [this.w, this.b, this.ao, this.detail, this.cur, this.cell, this._rng, this.collect, this.lootTo, this._stack, this.ladderTo] = save;
    this._lootKey = null;
  }

  /** Which buffer a face goes in: glass; indoors (drawn only up close); small details (drawn at middle distance); the rest. */
  _vb(ao, glass) { const c = this.cell; return glass ? c.glass : ao < 0.7 ? c.inner : this.detail ? c.detail : c.opaque; }
  /** Small things (window frames, fences, cars): drawn only within a few hundred studs. */
  details(fn) { const d = this.detail; this.detail = true; try { fn(); } finally { this.detail = d; } }

  /** Nest a frame: (x, y, z) and turn yaw, relative to the current one. */
  push(x, y, z, yaw = 0) {
    this._stack.push([this.w, this.b, this.ao]);
    this.w = this.w.child(x, y, z, yaw);
    this.b = this.b.child(x, y, z, yaw);
  }
  pop() { [this.w, this.b, this.ao] = this._stack.pop(); }
  /** Indoors from here on (until pop/outdoors): sky light falls off. */
  indoors(ao = 0.56) { this.ao = ao; }
  outdoors() { this.ao = 1; }
  /** World position of a local point. */
  world(x, y, z, out = this._p) { const w = this.w; out[0] = w.x + x * w.c + z * w.s; out[1] = w.y + y; out[2] = w.z - x * w.s + z * w.c; return out; }

  // --- primitives -----------------------------------------------------------------------------------------------------
  /**
   * A box: centre (x, y, z), half sizes (hx, hy, hz), in the current frame.
   * m: a surface, or { px, nx, py, ny, pz, nz, side, top, bottom, all } for different faces.
   * o: { col (default true), skip: 'ny pz' faces to leave out, ao, aoF: {face: ao}, glass, noStand, shootable, mat, yaw (a turn of its own), id }
   */
  box(x, y, z, hx, hy, hz, m, o = {}) {
    if (o.yaw) { this.push(x, y, z, o.yaw); const r = this.box(0, 0, 0, hx, hy, hz, m, { ...o, yaw: 0 }); this.pop(); return r; }
    const skip = o.skip || '';
    const cell = this.cell;
    const w = this.w, b = this.b;
    const ao0 = o.ao ?? this.ao;
    const p = this._p;
    // a pane in a building's own glass: remember where its faces are, so it can be broken later
    const gv0 = o.glass && cell.key !== undefined ? cell.glass.nv : -1;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], name = F.name;
      if (skip && skip.includes(name)) continue;
      const mf = pick(m, name);
      if (!mf) continue;
      const ao = o.aoF?.[name] ?? ao0;
      // indoor faces go in their own buffer (drawn only up close)
      const vb = this._vb(ao, o.glass);
      vb.reserve(4, 6);
      const n = F.n, t = F.t, bb = F.b;
      const base = vb.nv;
      // the normal in the world and building frames
      const nwx = n[0] * w.c + n[2] * w.s, nwz = -n[0] * w.s + n[2] * w.c;
      const nbx = n[0] * b.c + n[2] * b.s, nbz = -n[0] * b.s + n[2] * b.c;
      const vert = n[1] === 0;
      for (let k = 0; k < 4; k++) {
        const cu = CU[k], cv = CV[k];
        const lx = x + (n[0] + t[0] * cu + bb[0] * cv) * hx;
        const ly = y + (n[1] + t[1] * cu + bb[1] * cv) * hy;
        const lz = z + (n[2] + t[2] * cu + bb[2] * cv) * hz;
        this.world(lx, ly, lz, p);
        // texture coordinates from the building-frame position, so neighbouring boxes line up
        const bx = b.x + lx * b.c + lz * b.s, by = b.y + ly, bz = b.z - lx * b.s + lz * b.c;
        const tu = vert ? bx * nbz - bz * nbx : bx, tv = vert ? by : -bz * n[1];
        // a little darker at the foot of walls standing on a floor
        const foot = o.foot && vert && cv < 0 ? 0.72 : 1;
        vb.vert(p[0], p[1], p[2], nwx, n[1], nwz, tu * mf.sc, tv * mf.sc, mf, ao * foot);
      }
      vb.tri(base, base + 1, base + 2); vb.tri(base, base + 2, base + 3);
    }
    this._bbox(x, z, hx, hz);
    if (o.col !== false && this.phys) {
      const c = this.world(x, y, z, this._q);
      const bx = this.phys.add(c[0], c[1], c[2], hx, hy, hz, w.yaw, o.mat || pick(m, 'px')?.phys || 'concrete', o.glass ? { glass: true, noStand: o.noStand, building: this.cur?.id } : o.extra ? { ...o.extra, noStand: o.noStand, building: this.cur?.id } : { noStand: o.noStand, building: this.cur?.id });
      if (gv0 >= 0) { bx.gkey = cell.key; bx.gv0 = gv0; bx.gv1 = cell.glass.nv; }
      this.boxes++;
      this._keep(bx);
      return bx;
    }
    return null;
  }

  /** A box from corner (x0, y0, z0) to (x1, y1, z1). */
  span(x0, y0, z0, x1, y1, z1, m, o) {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, Math.abs(z1 - z0) / 2, m, o);
  }

  /** A flat four-cornered shape (points in the current frame, counter-clockwise seen from the front). Both sides if o.both. */
  quad(a, b, c, d, m, o = {}) {
    const vbOf = (ao) => this._vb(ao, o.glass);
    // the normal
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    const w = this.w, bf = this.b;
    // texture axes: along the first edge, and up the shape
    const eL = Math.hypot(ux, uy, uz) || 1, ex = ux / eL, ey = uy / eL, ez = uz / eL;
    const fx = ny * ez - nz * ey, fy = nz * ex - nx * ez, fz = nx * ey - ny * ex;
    const ao = o.ao ?? this.ao;
    const emit = (flip) => {
      const vb = vbOf(flip ? (o.backAo ?? ao) : ao);
      vb.reserve(4, 6);
      const base = vb.nv;
      const sgn = flip ? -1 : 1;
      const nwx = sgn * (nx * w.c + nz * w.s), nwz = sgn * (-nx * w.s + nz * w.c), nwy = sgn * ny;
      for (const q of [a, b, c, d]) {
        const p = this.world(q[0], q[1], q[2]);
        const bx = bf.x + q[0] * bf.c + q[2] * bf.s, by = bf.y + q[1], bz = bf.z - q[0] * bf.s + q[2] * bf.c;
        // project on the shape's own axes (in the building frame these turn with it)
        const lu = q[0] * ex + q[1] * ey + q[2] * ez, lv = q[0] * fx + q[1] * fy + q[2] * fz;
        const mm = flip ? (o.back || m) : m;
        vb.vert(p[0], p[1], p[2], nwx, nwy, nwz, (o.uvWorld ? bx : lu) * mm.sc, (o.uvWorld ? by : lv) * mm.sc, mm, flip ? (o.backAo ?? ao) : ao);
      }
      if (flip) { vb.tri(base, base + 2, base + 1); vb.tri(base, base + 3, base + 2); }
      else { vb.tri(base, base + 1, base + 2); vb.tri(base, base + 2, base + 3); }
    };
    emit(false);
    if (o.both || o.back) emit(true);
  }
  /** A triangle (gable ends). */
  tri(a, b, c, m, o = {}) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    const w = this.w, bf = this.b, ao = o.ao ?? this.ao;
    const nbx = nx * bf.c + nz * bf.s, nbz = -nx * bf.s + nz * bf.c;
    const emit = (flip, mm, aa) => {
      const vb = this._vb(aa, false);
      vb.reserve(3, 3);
      const base = vb.nv, sgn = flip ? -1 : 1;
      for (const q of [a, b, c]) {
        const p = this.world(q[0], q[1], q[2]);
        const bx = bf.x + q[0] * bf.c + q[2] * bf.s, by = bf.y + q[1], bz = bf.z - q[0] * bf.s + q[2] * bf.c;
        vb.vert(p[0], p[1], p[2], sgn * (nx * w.c + nz * w.s), sgn * ny, sgn * (-nx * w.s + nz * w.c), (bx * nbz - bz * nbx) * sgn * mm.sc, by * mm.sc, mm, aa);
      }
      if (flip) vb.tri(base, base + 2, base + 1); else vb.tri(base, base + 1, base + 2);
    };
    emit(false, m, ao);
    if (o.back) emit(true, o.back, o.backAo ?? 0.4);
  }

  /**
   * An upright n-sided prism (barrels, pipes, posts, tanks): base centre (x, y, z), radius r, height h.
   * o: { seg (8), cap (true), col (true), ao, top: surface for the cap, ry: turn }
   */
  cyl(x, y, z, r, h, m, o = {}) {
    const n = o.seg ?? 8, ao = o.ao ?? this.ao, vb = this._vb(ao, false);
    const w = this.w, bf = this.b, mt = o.top || m, p = this._p;
    vb.reserve(n * 4 + n + 2, n * 6 + n * 3);
    const circ = 2 * Math.PI * r;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + (o.ry || 0), a1 = ((i + 1) / n) * Math.PI * 2 + (o.ry || 0), am = (a0 + a1) / 2;
      const nx = Math.cos(am), nz = Math.sin(am);
      const nwx = nx * w.c + nz * w.s, nwz = -nx * w.s + nz * w.c;
      const base = vb.nv;
      const corners = [[a0, 0], [a1, 0], [a1, h], [a0, h]];
      for (const [a, yy] of corners) {
        this.world(x + Math.cos(a) * r, y + yy, z + Math.sin(a) * r, p);
        vb.vert(p[0], p[1], p[2], nwx, 0, nwz, (a / (Math.PI * 2)) * circ * m.sc, (bf.y + y + yy) * m.sc, m, ao * (yy === 0 && o.foot ? 0.75 : 1));
      }
      // wound so it faces out: going round the circle towards -angle seen from outside
      vb.tri(base, base + 2, base + 1); vb.tri(base, base + 3, base + 2);
    }
    if (o.cap !== false) {
      const c0 = vb.nv;
      this.world(x, y + h, z, p);
      vb.vert(p[0], p[1], p[2], 0, 1, 0, 0, 0, mt, ao);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (o.ry || 0);
        this.world(x + Math.cos(a) * r, y + h, z + Math.sin(a) * r, p);
        vb.vert(p[0], p[1], p[2], 0, 1, 0, Math.cos(a) * r * mt.sc, Math.sin(a) * r * mt.sc, mt, ao);
      }
      for (let i = 0; i < n; i++) vb.tri(c0, c0 + 1 + ((i + 1) % n), c0 + 1 + i);
    }
    this._bbox(x, z, r, r);
    if (o.col !== false && this.phys) {
      const c = this.world(x, y + h / 2, z, this._q);
      const bx = this.phys.add(c[0], c[1], c[2], r * 0.9, h / 2, r * 0.9, w.yaw, o.mat || m.phys, { ...o.extra, noStand: o.noStand, building: this.cur?.id });
      this.boxes++;
      this._keep(bx);
      return bx;
    }
    return null;
  }

  /**
   * A shape turned on a lathe (domes, onion domes, tanks, lamp shades): profile [[radius, height], ...] from the bottom up,
   * centred on local (x, y, z). o: { seg (12), col: a collision box of the widest radius (default false) }.
   */
  lathe(x, y, z, profile, m, o = {}) {
    const n = o.seg ?? 12, ao = o.ao ?? this.ao, vb = this._vb(ao, false);
    const w = this.w, p = this._p;
    let len = 0;
    for (let k = 0; k < profile.length - 1; k++) {
      const [r0, y0] = profile[k], [r1, y1] = profile[k + 1];
      const segL = Math.hypot(r1 - r0, y1 - y0) || 1e-3;
      // the slope of this band gives the normal's tilt
      const ny = (r0 - r1) / segL, nr = (y1 - y0) / segL;
      vb.reserve(n * 4, n * 6);
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
        const nx = Math.cos(am) * nr, nz = Math.sin(am) * nr;
        const nwx = nx * w.c + nz * w.s, nwz = -nx * w.s + nz * w.c;
        const base = vb.nv;
        for (const [a, rr, yy, vv] of [[a0, r0, y0, len], [a1, r0, y0, len], [a1, r1, y1, len + segL], [a0, r1, y1, len + segL]]) {
          this.world(x + Math.cos(a) * rr, y + yy, z + Math.sin(a) * rr, p);
          vb.vert(p[0], p[1], p[2], nwx, ny, nwz, a * Math.max(r0, r1) * m.sc, vv * m.sc, m, ao);
        }
        vb.tri(base, base + 2, base + 1); vb.tri(base, base + 3, base + 2);
      }
      len += segL;
    }
    const R = Math.max(...profile.map((q) => q[0]));
    this._bbox(x, z, R, R);
    if (o.col && this.phys) {
      const h0 = profile[0][1], h1 = profile[profile.length - 1][1];
      const c = this.world(x, y + (h0 + h1) / 2, z, this._q);
      const bx = this.phys.add(c[0], c[1], c[2], R * 0.85, (h1 - h0) / 2, R * 0.85, w.yaw, o.mat || m.phys, { building: this.cur?.id });
      this.boxes++;
      this._keep(bx);
    }
  }

  /** A painted sign on a wall: centre (x, y, z), facing the frame's +z (turned by yaw), w x h, the words and a style. */
  sign(x, y, z, w, h, text, style = 'shop', yaw = 0) {
    const yy = this.w.yaw + yaw;
    const c = this.world(x, y, z, [0, 0, 0]);
    (this.signs || (this.signs = [])).push({ x: c[0], y: c[1], z: c[2], yaw: yy, w, h, text, style });
  }

  /**
   * A lying cylinder along local x or z (tanks, pipes, fuselages, logs): centre (x, y, z), radius r, length L.
   */
  cylAxis(x, y, z, r, L, m, o = {}) {
    const n = o.seg ?? 10, ao = o.ao ?? this.ao, vb = this._vb(ao, false), axis = o.axis || 'x';
    const w = this.w, p = this._p;
    const P = (a, s) => (axis === 'x' ? [x + s * L / 2, y + Math.sin(a) * r, z + Math.cos(a) * r] : [x + Math.cos(a) * r, y + Math.sin(a) * r, z + s * L / 2]);
    vb.reserve(n * 4 + 2 * (n + 1), n * 6 + n * 6);
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, am = (a0 + a1) / 2;
      const nl = axis === 'x' ? [0, Math.sin(am), Math.cos(am)] : [Math.cos(am), Math.sin(am), 0];
      const nwx = nl[0] * w.c + nl[2] * w.s, nwz = -nl[0] * w.s + nl[2] * w.c;
      const base = vb.nv;
      for (const [a, s, u] of [[a0, -1, 0], [a0, 1, L], [a1, 1, L], [a1, -1, 0]]) {
        const q = P(a, s); this.world(q[0], q[1], q[2], p);
        vb.vert(p[0], p[1], p[2], nwx, nl[1], nwz, u * m.sc, a * r * m.sc, m, ao);
      }
      if (axis === 'x') { vb.tri(base, base + 1, base + 2); vb.tri(base, base + 2, base + 3); }
      else { vb.tri(base, base + 2, base + 1); vb.tri(base, base + 3, base + 2); }
    }
    if (o.cap !== false) for (const s of [-1, 1]) {
      const mc = o.capMat || m, c0 = vb.nv;
      const cc = axis === 'x' ? [x + s * L / 2, y, z] : [x, y, z + s * L / 2];
      const nl = axis === 'x' ? [s, 0, 0] : [0, 0, s];
      const nwx = nl[0] * w.c + nl[2] * w.s, nwz = -nl[0] * w.s + nl[2] * w.c;
      this.world(cc[0], cc[1], cc[2], p); vb.vert(p[0], p[1], p[2], nwx, 0, nwz, 0, 0, mc, ao);
      for (let i = 0; i < n; i++) { const q = P(i / n * Math.PI * 2, s); this.world(q[0], q[1], q[2], p); vb.vert(p[0], p[1], p[2], nwx, 0, nwz, Math.cos(i / n * 6.283) * r * mc.sc, Math.sin(i / n * 6.283) * r * mc.sc, mc, ao); }
      for (let i = 0; i < n; i++) {
        const a = c0 + 1 + i, b = c0 + 1 + (i + 1) % n;
        const flip = (axis === 'x') === (s > 0);
        if (flip) vb.tri(c0, b, a); else vb.tri(c0, a, b);
      }
    }
    this._bbox(x, z, axis === 'x' ? L / 2 : r, axis === 'x' ? r : L / 2);
    if (o.col !== false && this.phys) {
      const c = this.world(x, y, z, this._q);
      const bx = this.phys.add(c[0], c[1], c[2], axis === 'x' ? L / 2 : r * 0.85, r * 0.85, axis === 'x' ? r * 0.85 : L / 2, w.yaw, o.mat || m.phys, { building: this.cur?.id, noStand: o.noStand });
      this.boxes++;
      this._keep(bx);
    }
  }

  /** The height of the land under a local point, in the current frame (0 if there's no land to ask). */
  groundAt(x, z) {
    const T = this.phys?.T || this.T;
    if (!T) return 0;
    const p = this.world(x, 0, z, this._q);
    return T.heightAt(p[0], p[2]) - this.w.y;
  }

  /** A collision box with nothing drawn. */
  solid(x, y, z, hx, hy, hz, matName = 'concrete', o = {}) {
    if (!this.phys) return null;
    const c = this.world(x, y, z, this._q);
    const bx = this.phys.add(c[0], c[1], c[2], hx, hy, hz, this.w.yaw + (o.yaw || 0), matName, { noStand: o.noStand, building: this.cur?.id, ...(o.extra || {}) });
    this.boxes++;
    this._keep(bx);
    return bx;
  }

  // --- what the building records ------------------------------------------------------------------------------------
  /** A room (local rectangle at floor height y): for the infected's way-finding and for "indoors". */
  room(x0, z0, x1, z1, y, h = 9, tag = '') {
    const a = this.world(x0, y, z0, [0, 0, 0]), b = this.world(x1, y, z1, [0, 0, 0]);
    const c = this.world((x0 + x1) / 2, y, (z0 + z1) / 2, [0, 0, 0]);
    const R = { id: this.cur.rooms.length, x: c[0], y: c[1], z: c[2], hx: Math.abs(x1 - x0) / 2, hz: Math.abs(z1 - z0) / 2, h, yaw: this.w.yaw, tag, corners: [a, b], links: [] };
    this.cur.rooms.push(R);
    return R;
  }
  /** A doorway between two rooms (or a room and outside: null) at local (x, z), floor height y. */
  link(ra, rb, x, y, z, w = 4) {
    const p = this.world(x, y, z, [0, 0, 0]);
    const L = { x: p[0], y: p[1], z: p[2], w, a: ra ? ra.id : -1, b: rb ? rb.id : -1, door: null };
    this.cur.links.push(L);
    if (ra) ra.links.push(L); if (rb) rb.links.push(L);
    return L;
  }
  /** Stairs from (x0, y0, z0) up to (x1, y1, z1) (local): a link between floors. */
  stairLink(ra, rb, x0, y0, z0, x1, y1, z1) {
    const a = this.world(x0, y0, z0, [0, 0, 0]), b = this.world(x1, y1, z1, [0, 0, 0]);
    const S = { a: ra ? ra.id : -1, b: rb ? rb.id : -1, from: a, to: b, stairs: true };
    this.cur.links.push(S);
    if (ra) ra.links.push(S); if (rb) rb.links.push(S);
    return S;
  }
  /** Somewhere loot can lie: local (x, y, z) on a surface; cat: what sort of things. */
  lootAt(x, y, z, cat, o = {}) {
    const p = this.world(x, y, z, [0, 0, 0]);
    const L = { x: p[0], y: p[1], z: p[2], cat, b: this.cur?.id ?? -1, shelf: !!o.shelf, spread: o.spread ?? 0.8, yaw: this.w.yaw };
    if (this.lootTo) { L.key = this._lootKey + (this._lootN++); this.lootTo.push(L); return L; }
    L.key = 'g' + this.loot.length;
    this.loot.push(L);
    this.cur?.loot.push(L);
    return L;
  }
  /**
   * A door leaf hung in a doorway: centre of the doorway (x, z) at floor y, the
   * wall running along the local x axis (turn with yaw), width w, height h.
   * kind: 'wood' | 'metal' | 'plank' | 'glass' | 'gate'. o.open: starts open (0..1). o.hinge: -1 left / 1 right.
   */
  door(x, y, z, w, h, kind = 'wood', o = {}) {
    const yaw = this.w.yaw + (o.yaw || 0);
    const hs = o.hinge ?? (this.r() < 0.5 ? -1 : 1);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const cen = this.world(x, y, z, [0, 0, 0]);
    // the hinge: one end of the doorway
    const hx = cen[0] + hs * (w / 2) * c, hz = cen[2] - hs * (w / 2) * s;
    const D = { id: this.doors.length, b: this.cur?.id ?? -1, kind, x: cen[0], y: cen[1], z: cen[2], hx, hz, yaw, w, h, hinge: hs, open: o.open ?? (this.r() < 0.25 ? 1 : 0), target: 0, side: o.side ?? 1, locked: !!o.locked, hp: kind === 'metal' ? 220 : kind === 'gate' ? 160 : 100, box: null, link: o.link || null };
    D.target = D.open;
    if (o.link) o.link.door = D;
    this.doors.push(D);
    this.cur?.doors.push(D);
    return D;
  }
  /** A ladder (local base point, height h): climbed facing the frame's -z. */
  ladderAt(x, y, z, h) {
    const p = this.world(x, y, z, [0, 0, 0]);
    const L = { x: p[0], y: p[1], z: p[2], h, yaw: this.w.yaw, b: this.cur?.id ?? -1 };
    if (this.ladderTo) { this.ladderTo.push(L); return L; }
    (this.ladders || (this.ladders = [])).push(L);
    this.cur?.ladders?.push(L);
    return L;
  }
  /** Something that turns with the building but is drawn by its own instanced model (cars, crates...). */
  instance(kind, x, y, z, yaw = 0, o = {}) {
    const p = this.world(x, y, z, [0, 0, 0]);
    const I = { kind, x: p[0], y: p[1], z: p[2], yaw: this.w.yaw + yaw, ...o };
    this.cur?.ins.push(I);
    return I;
  }

  _bbox(x, z, hx, hz) {
    const B = this.cur; if (!B) return;
    const r = Math.hypot(hx, hz), p = this.world(x, 0, z, this._q);
    if (p[0] - r < B.bbox[0]) B.bbox[0] = p[0] - r; if (p[2] - r < B.bbox[1]) B.bbox[1] = p[2] - r;
    if (p[0] + r > B.bbox[2]) B.bbox[2] = p[0] + r; if (p[2] + r > B.bbox[3]) B.bbox[3] = p[2] + r;
  }
}

function pick(m, face) {
  if (!m) return null;
  if (m.l !== undefined) return m;
  if (m[face] !== undefined) return m[face];
  if (face === 'py') return m.top ?? m.all ?? m.side;
  if (face === 'ny') return m.bottom ?? m.all ?? m.side;
  return m.side ?? m.all;
}

export function cellKey(x, z) { return Math.floor(x / CELL) * 4096 + Math.floor(z / CELL); }
