// Collision for the Outbreak: the ground (the height map), and boxes - every
// wall, floor, stair, fence, trunk, car and door is a box, turned about the
// vertical axis - filed in a grid so only the nearby ones are looked at.
// People are upright cylinders that slide along walls and step up stairs;
// bullets and eyes are rays.
//
// Box: { x, y, z (centre), hx, hy, hz (half sizes), yaw, mat, solid, top? }
import { clamp } from './noise.js';

const CELL = 32;
const key = (i, j) => (i + 512) * 2048 + (j + 512);

export class Phys {
  constructor(T) {
    this.T = T;
    this.grid = new Map();
    this.count = 0;
    this._stamp = 1;
  }

  // --- boxes ----------------------------------------------------------------------------------------------------------
  /** Add a box: x,y,z centre, hx,hy,hz half extents, yaw (radians, as three.js rotation.y). */
  add(x, y, z, hx, hy, hz, yaw = 0, mat = 'concrete', extra) {
    const b = { x, y, z, hx, hy, hz, yaw, c: Math.cos(yaw), s: Math.sin(yaw), mat, solid: true, stamp: 0, cells: null, ...extra };
    this._insert(b);
    this.count++;
    return b;
  }
  _extent(b) {
    const ex = Math.abs(b.hx * b.c) + Math.abs(b.hz * b.s), ez = Math.abs(b.hx * b.s) + Math.abs(b.hz * b.c);
    return [b.x - ex, b.z - ez, b.x + ex, b.z + ez];
  }
  _insert(b) {
    const [x0, z0, x1, z1] = this._extent(b);
    b.cells = [];
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const k = key(i, j);
      let list = this.grid.get(k);
      if (!list) this.grid.set(k, (list = []));
      list.push(b);
      b.cells.push(k);
    }
  }
  remove(b) {
    if (!b.cells) return;
    for (const k of b.cells) { const list = this.grid.get(k); if (!list) continue; const i = list.indexOf(b); if (i >= 0) list.splice(i, 1); }
    b.cells = null;
    this.count--;
  }
  /** Move/turn a box (doors). */
  move(b, x, y, z, yaw) {
    this.remove(b);
    b.x = x; b.y = y; b.z = z; b.yaw = yaw; b.c = Math.cos(yaw); b.s = Math.sin(yaw);
    this._insert(b); this.count++;
  }
  /** Every box whose cells touch the rectangle. */
  query(x0, z0, x1, z1, fn) {
    const st = ++this._stamp;
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const list = this.grid.get(key(i, j));
      if (!list) continue;
      for (let q = 0; q < list.length; q++) { const b = list[q]; if (b.stamp === st) continue; b.stamp = st; if (fn(b) === false) return; }
    }
  }
  /** Local (box space) coordinates of a world point. */
  local(b, x, z) { const dx = x - b.x, dz = z - b.z; return [dx * b.c - dz * b.s, dx * b.s + dz * b.c]; }

  // --- the ground -------------------------------------------------------------------------------------------------------
  /**
   * The highest thing to stand on under (x, z) that's not above y + step:
   * the land or the top of a box. r: how far round the point to look.
   */
  groundAt(x, y, z, r = 0.6, step = 1.6) {
    let g = this.T.heightAt(x, z), box = null;
    if (this.T.holes && this.holeAt(x, z, y, g)) g = -1e9;
    this.query(x - r, z - r, x + r, z + r, (b) => {
      if (!b.solid || b.noStand) return;
      const top = b.y + b.hy;
      if (top > y + step || top <= g) return;
      const [lx, lz] = this.local(b, x, z);
      if (Math.abs(lx) <= b.hx + r && Math.abs(lz) <= b.hz + r) { g = top; box = b; }
    });
    this._groundBox = box;
    return g;
  }

  // --- moving people ----------------------------------------------------------------------------------------------------
  /**
   * Move an upright cylinder (feet at p) by velocity v for dt: slide along
   * walls, step up stairs and kerbs, fall, land. Mutates p and v.
   * o: { r, h, step, grounded } -> returns { grounded, ground, wall, landed, fall, box }
   */
  moveBody(p, v, dt, o) {
    const r = o.r ?? 1.1, h = o.h ?? 5, step = o.step ?? 1.6;
    const res = this._res || (this._res = {});
    res.wall = false; res.landed = false; res.fall = 0; res.box = null;
    // sideways, in pieces small enough not to pass through a wall
    const dist = Math.hypot(v.x, v.z) * dt, n = Math.max(1, Math.ceil(dist / 0.5));
    for (let s = 0; s < n; s++) {
      p.x += v.x * dt / n; p.z += v.z * dt / n;
      if (this._push(p, r, h, step, v)) res.wall = true;
    }
    // up and down
    const wasGrounded = !!o.grounded;
    const g = o.gravity ?? 196.2 * 0.5;
    v.y -= g * dt;
    let ny = p.y + v.y * dt;
    // a ceiling
    if (v.y > 0) {
      let ceil = Infinity;
      this.query(p.x - r, p.z - r, p.x + r, p.z + r, (b) => {
        if (!b.solid) return;
        const bot = b.y - b.hy;
        if (bot < p.y + h - 0.2 || bot > ny + h + 0.5) return;
        const [lx, lz] = this.local(b, p.x, p.z);
        if (Math.abs(lx) < b.hx + r * 0.7 && Math.abs(lz) < b.hz + r * 0.7) ceil = Math.min(ceil, bot);
      });
      if (ny + h > ceil) { ny = ceil - h; v.y = 0; }
    }
    const ground = this.groundAt(p.x, Math.max(p.y, ny), p.z, r * 0.55, step);
    res.box = this._groundBox;
    if (ny <= ground + 0.02 || (wasGrounded && v.y <= 0 && p.y - ground < 1.4 && p.y >= ground - 0.01)) {
      if (!wasGrounded) { res.landed = true; res.fall = o.fallFrom != null ? o.fallFrom - ground : 0; }
      p.y = ground; v.y = 0; res.grounded = true;
    } else {
      p.y = ny; res.grounded = false;
    }
    res.ground = ground;
    return res;
  }
  /** Push a cylinder out of any boxes it overlaps; true if it hit one. */
  _push(p, r, h, step, v) {
    let hit = false;
    for (let it = 0; it < 2; it++) {
      let moved = false;
      this.query(p.x - r, p.z - r, p.x + r, p.z + r, (b) => {
        if (!b.solid) return;
        const top = b.y + b.hy, bot = b.y - b.hy;
        if (top <= p.y + step + 0.01 || bot >= p.y + h) return;
        const [lx, lz] = this.local(b, p.x, p.z);
        const cx = clamp(lx, -b.hx, b.hx), cz = clamp(lz, -b.hz, b.hz);
        let dx = lx - cx, dz = lz - cz, d = Math.hypot(dx, dz);
        if (d >= r) return;
        let px, pz;
        if (d < 1e-5) {
          // inside: out the nearest side
          const ox = b.hx - Math.abs(lx), oz = b.hz - Math.abs(lz);
          if (ox < oz) { px = Math.sign(lx || 1) * (ox + r); pz = 0; } else { px = 0; pz = Math.sign(lz || 1) * (oz + r); }
        } else { const k = (r - d) / d; px = dx * k; pz = dz * k; }
        // back to world space
        const wx = px * b.c + pz * b.s, wz = -px * b.s + pz * b.c;
        p.x += wx; p.z += wz;
        // lose the speed into the wall
        if (v) { const L = Math.hypot(wx, wz) || 1, nx = wx / L, nz = wz / L, vn = v.x * nx + v.z * nz; if (vn < 0) { v.x -= vn * nx; v.z -= vn * nz; } }
        hit = moved = true;
      });
      if (!moved) break;
    }
    return hit;
  }

  // --- rays ---------------------------------------------------------------------------------------------------------------
  /**
   * The first thing a ray hits: { d, x, y, z, nx, ny, nz, box, kind } or null.
   * o.terrain (default true), o.skip (fn(box) -> true to ignore).
   */
  ray(ox, oy, oz, dx, dy, dz, max, o = {}) {
    let best = max, hit = null;
    // boxes: walk the grid cells along the ray
    const st = ++this._stamp;
    const test = (b) => {
      if (b.stamp === st) return; b.stamp = st;
      if (!b.solid && !b.shootable) return;
      if (o.skip && o.skip(b)) return;
      const t = this._rayBox(b, ox, oy, oz, dx, dy, dz, best);
      if (t !== null && t < best) { best = t; hit = { d: t, box: b, kind: 'box', n: this._n }; }
    };
    let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tdx = Math.abs(CELL / (dx || 1e-9)), tdz = Math.abs(CELL / (dz || 1e-9));
    let tx = ((dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL)) / Math.abs(dx || 1e-9);
    let tz = ((dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL)) / Math.abs(dz || 1e-9);
    let t = 0;
    for (let guard = 0; guard < 400 && t <= best; guard++) {
      // the cell and its neighbours (boxes can stick out of their cells only into cells they're filed in)
      const list = this.grid.get(key(cx, cz));
      if (list) for (let q = 0; q < list.length; q++) test(list[q]);
      if (tx < tz) { t = tx; tx += tdx; cx += stepX; } else { t = tz; tz += tdz; cz += stepZ; }
    }
    // the land
    if (o.terrain !== false) {
      const tt = this.rayTerrain(ox, oy, oz, dx, dy, dz, best);
      if (tt !== null && tt < best) { best = tt; hit = { d: tt, box: null, kind: 'terrain' }; }
    }
    if (!hit) return null;
    hit.x = ox + dx * hit.d; hit.y = oy + dy * hit.d; hit.z = oz + dz * hit.d;
    if (hit.kind === 'terrain') { const n = this.T.normalAt(hit.x, hit.z); hit.nx = n[0]; hit.ny = n[1]; hit.nz = n[2]; hit.mat = 'dirt'; }
    else { hit.nx = hit.n[0]; hit.ny = hit.n[1]; hit.nz = hit.n[2]; hit.mat = hit.box.mat; }
    return hit;
  }
  _rayBox(b, ox, oy, oz, dx, dy, dz, max) {
    // into the box's frame
    const rx = ox - b.x, rz = oz - b.z;
    const lox = rx * b.c - rz * b.s, loz = rx * b.s + rz * b.c, loy = oy - b.y;
    const ldx = dx * b.c - dz * b.s, ldz = dx * b.s + dz * b.c, ldy = dy;
    let t0 = 0, t1 = max, ax = -1, sgn = 1;
    const slab = (o, d, h, axis) => {
      if (Math.abs(d) < 1e-9) return o >= -h && o <= h;
      let a = (-h - o) / d, c = (h - o) / d, s = -1;
      if (a > c) { const tmp = a; a = c; c = tmp; s = 1; }
      if (a > t0) { t0 = a; ax = axis; sgn = s; }
      if (c < t1) t1 = c;
      return t0 <= t1;
    };
    if (!slab(lox, ldx, b.hx, 0) || !slab(loy, ldy, b.hy, 1) || !slab(loz, ldz, b.hz, 2)) return null;
    if (t0 <= 0 && ax === -1) return null; // starts inside
    // the face normal, back in world space
    let nx = 0, ny = 0, nz = 0;
    if (ax === 0) nx = sgn; else if (ax === 1) ny = sgn; else nz = sgn;
    this._n = [nx * b.c + nz * b.s, ny, -nx * b.s + nz * b.c];
    return t0;
  }
  /**
   * Is (x, z) somewhere the land doesn't count? Inside a cut-away hole always;
   * over an underground room only if you're down in it (y well below the surface).
   */
  holeAt(x, z, y, g) {
    for (const h of this.T.holes) {
      const dx = x - h.x, dz = z - h.z, lx = dx * h.c - dz * h.s, lz = dx * h.s + dz * h.c;
      if (Math.abs(lx) < h.hx && Math.abs(lz) < h.hz) { if (h.render || y < g - 2.5) return true; }
    }
    return false;
  }

  /** March along a ray over the land (then home in on the crossing). */
  rayTerrain(ox, oy, oz, dx, dy, dz, max) {
    const T = this.T;
    if (T.holes && this.holeAt(ox, oz, oy, T.heightAt(ox, oz))) return null;
    let t = 0, prev = oy - T.heightAt(ox, oz);
    if (prev < 0) return 0;
    const stepBase = 3;
    while (t < max) {
      const st = Math.max(stepBase, Math.min(24, prev * 0.6));
      const nt = Math.min(max, t + st);
      const y = oy + dy * nt, x = ox + dx * nt, z = oz + dz * nt;
      const d = y - T.heightAt(x, z);
      if (d < 0) {
        let a = t, b = nt;
        for (let i = 0; i < 10; i++) { const m = (a + b) / 2; if (oy + dy * m - T.heightAt(ox + dx * m, oz + dz * m) < 0) b = m; else a = m; }
        return (a + b) / 2;
      }
      prev = d; t = nt;
      if (t >= max) break;
    }
    return null;
  }
  /** Can a see b? (nothing solid in between) */
  sees(ax, ay, az, bx, by, bz, o) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz);
    if (L < 0.01) return true;
    const h = this.ray(ax, ay, az, dx / L, dy / L, dz / L, L - 0.5, o);
    return !h;
  }
}
