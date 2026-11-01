// Static + dynamic axis-aligned box colliders with a uniform spatial hash.
// Characters are circles on the XZ plane; boxes also carry a Y range for camera rays.
export class ColliderSet {
  constructor(bounds, cellSize = 4) {
    this.bounds = bounds;
    this.cellSize = cellSize;
    this.cols = Math.ceil((bounds.x1 - bounds.x0) / cellSize);
    this.rows = Math.ceil((bounds.z1 - bounds.z0) / cellSize);
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    this.boxes = [];
    this._stamp = 0;
  }
  _range(minX, minZ, maxX, maxZ) {
    const cs = this.cellSize, b = this.bounds;
    return [
      Math.max(0, Math.floor((minX - b.x0) / cs)), Math.max(0, Math.floor((minZ - b.z0) / cs)),
      Math.min(this.cols - 1, Math.floor((maxX - b.x0) / cs)), Math.min(this.rows - 1, Math.floor((maxZ - b.z0) / cs)),
    ];
  }
  add(box) {
    const b = { minY: 0, maxY: 3, enabled: true, opaque: false, kind: 'static', blocksCamera: true, ...box, id: this.boxes.length, _seen: 0 };
    this.boxes.push(b);
    const [c0, r0, c1, r1] = this._range(b.minX, b.minZ, b.maxX, b.maxZ);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r * this.cols + c].push(b);
    return b;
  }
  /** Collect enabled boxes overlapping an XZ rectangle. */
  query(minX, minZ, maxX, maxZ, out = []) {
    out.length = 0;
    const stamp = ++this._stamp;
    const [c0, r0, c1, r1] = this._range(minX, minZ, maxX, maxZ);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      for (const b of this.cells[r * this.cols + c]) {
        if (b._seen === stamp || !b.enabled) continue;
        b._seen = stamp;
        if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
        out.push(b);
      }
    }
    return out;
  }
  /**
   * Push a circle out of all overlapping boxes. Returns {x, z, hit, nx, nz} where n is the
   * accumulated contact normal (useful for sliding / wall impacts).
   */
  resolveCircle(x, z, r, y0 = 0.05, y1 = 1.7, filter = null) {
    const res = this._res || (this._res = { x: 0, z: 0, hit: false, nx: 0, nz: 0, box: null });
    res.hit = false; res.nx = 0; res.nz = 0; res.box = null;
    const list = this._q || (this._q = []);
    for (let iter = 0; iter < 3; iter++) {
      this.query(x - r, z - r, x + r, z + r, list);
      let moved = false;
      for (const b of list) {
        if (b.maxY < y0 || b.minY > y1) continue;
        if (filter && !filter(b)) continue;
        const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
        const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
        let dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2), push = r - d;
          dx /= d; dz /= d;
          x += dx * push; z += dz * push;
          res.nx += dx; res.nz += dz;
        } else {
          // Centre inside the box: exit along the shallowest axis.
          const left = x - b.minX, right = b.maxX - x, top = z - b.minZ, bottom = b.maxZ - z;
          const m = Math.min(left, right, top, bottom);
          if (m === left) { x = b.minX - r; res.nx -= 1; }
          else if (m === right) { x = b.maxX + r; res.nx += 1; }
          else if (m === top) { z = b.minZ - r; res.nz -= 1; }
          else { z = b.maxZ + r; res.nz += 1; }
        }
        res.hit = true; res.box = b; moved = true;
      }
      if (!moved) break;
    }
    res.x = x; res.z = z;
    const nl = Math.hypot(res.nx, res.nz);
    if (nl > 0) { res.nx /= nl; res.nz /= nl; }
    return res;
  }
  /** True if a circle at (x,z) overlaps any box (in the given height band). */
  overlapsCircle(x, z, r, y0 = 0.05, y1 = 1.7, filter = null) {
    const list = this.query(x - r, z - r, x + r, z + r, this._q2 || (this._q2 = []));
    for (const b of list) {
      if (b.maxY < y0 || b.minY > y1) continue;
      if (filter && !filter(b)) continue;
      const cx = Math.max(b.minX, Math.min(x, b.maxX)), cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
    }
    return false;
  }
  /**
   * Ray vs boxes in 3D (slab test). Returns the nearest hit distance t in [0, maxT] or maxT.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxT, filter = null) {
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    const list = this.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), this._q3 || (this._q3 = []));
    let best = maxT;
    for (const b of list) {
      if (filter && !filter(b)) continue;
      const t = rayBox(ox, oy, oz, dx, dy, dz, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }
}

export function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity;
  const axes = [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]];
  for (const [o, d, a, b] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < a || o > b) return -1; continue; }
    let t1 = (a - o) / d, t2 = (b - o) / d;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : 0;
}
