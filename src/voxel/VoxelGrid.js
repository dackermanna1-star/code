// Dense voxel storage plus a small "modeling" toolkit. Values are palette
// indices (0 = empty). Index order: x fastest, then y, then z.

export class Palette {
  constructor() {
    this.entries = [null];
    this.byName = new Map();
  }

  /**
   * @param {string} name
   * @param {object} e { color:[r,g,b] sRGB 0-255, rough, metal, cls, vari }
   */
  add(name, e) {
    if (this.byName.has(name)) return this.byName.get(name);
    const idx = this.entries.length;
    this.entries.push({
      color: e.color,
      rough: e.rough ?? 0.85,
      metal: e.metal ?? 0,
      cls: e.cls ?? 0,
      vari: e.vari ?? 0.1,
      name,
    });
    this.byName.set(name, idx);
    return idx;
  }

  get(name) {
    const i = this.byName.get(name);
    if (i === undefined) throw new Error(`palette entry ${name} missing`);
    return i;
  }

  has(name) {
    return this.byName.has(name);
  }

  /** Adds (or reuses) an entry for an arbitrary quantized color. */
  color(rgb, base) {
    const q = rgb.map((c) => Math.max(0, Math.min(255, Math.round(c / 4) * 4)));
    const name = `${base?.name ?? 'c'}#${q.join(',')}`;
    if (this.byName.has(name)) return this.byName.get(name);
    return this.add(name, { ...(base ?? {}), color: q });
  }
}

export class VoxelGrid {
  constructor(nx, ny, nz) {
    this.nx = nx | 0;
    this.ny = ny | 0;
    this.nz = nz | 0;
    this.data = new Uint16Array(this.nx * this.ny * this.nz);
  }

  idx(x, y, z) {
    return x + this.nx * (y + this.ny * z);
  }

  inside(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.nx && y < this.ny && z < this.nz;
  }

  get(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= this.nx || y >= this.ny || z >= this.nz) return 0;
    return this.data[x + this.nx * (y + this.ny * z)];
  }

  set(x, y, z, v) {
    x |= 0;
    y |= 0;
    z |= 0;
    if (x < 0 || y < 0 || z < 0 || x >= this.nx || y >= this.ny || z >= this.nz) return;
    this.data[x + this.nx * (y + this.ny * z)] = v;
  }

  /** Half-open box [x0,x1) x [y0,y1) x [z0,z1), clipped to the grid. */
  box(x0, y0, z0, x1, y1, z1, v) {
    x0 = Math.max(0, Math.round(x0));
    y0 = Math.max(0, Math.round(y0));
    z0 = Math.max(0, Math.round(z0));
    x1 = Math.min(this.nx, Math.round(x1));
    y1 = Math.min(this.ny, Math.round(y1));
    z1 = Math.min(this.nz, Math.round(z1));
    const { nx, ny, data } = this;
    for (let z = z0; z < z1; z++) {
      for (let y = y0; y < y1; y++) {
        const row = nx * (y + ny * z);
        data.fill(v, row + x0, row + Math.max(x0, x1));
      }
    }
  }

  /** Box that only overwrites voxels for which pred(currentValue) is true. */
  boxIf(x0, y0, z0, x1, y1, z1, v, pred) {
    x0 = Math.max(0, Math.round(x0));
    y0 = Math.max(0, Math.round(y0));
    z0 = Math.max(0, Math.round(z0));
    x1 = Math.min(this.nx, Math.round(x1));
    y1 = Math.min(this.ny, Math.round(y1));
    z1 = Math.min(this.nz, Math.round(z1));
    for (let z = z0; z < z1; z++)
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = this.idx(x, y, z);
          if (pred(this.data[i], x, y, z)) this.data[i] = v;
        }
  }

  /** Vertical (Y axis) cylinder; voxel centers within r of (cx,cz). */
  cylY(cx, cz, r, y0, y1, v, rInner = -1) {
    const r2 = r * r;
    const ri2 = rInner > 0 ? rInner * rInner : -1;
    const xa = Math.floor(cx - r - 1), xb = Math.ceil(cx + r + 1);
    const za = Math.floor(cz - r - 1), zb = Math.ceil(cz + r + 1);
    for (let z = za; z <= zb; z++)
      for (let x = xa; x <= xb; x++) {
        const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 <= r2 && d2 >= ri2) for (let y = Math.round(y0); y < Math.round(y1); y++) this.set(x, y, z, v);
      }
  }

  /** Cylinder along X axis centered on (cy,cz). */
  cylX(cy, cz, r, x0, x1, v, rInner = -1) {
    const r2 = r * r;
    const ri2 = rInner > 0 ? rInner * rInner : -1;
    for (let z = Math.floor(cz - r - 1); z <= Math.ceil(cz + r + 1); z++)
      for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
        const dy = y + 0.5 - cy, dz = z + 0.5 - cz;
        const d2 = dy * dy + dz * dz;
        if (d2 <= r2 && d2 >= ri2) for (let x = Math.round(x0); x < Math.round(x1); x++) this.set(x, y, z, v);
      }
  }

  /** Cylinder along Z axis centered on (cx,cy). */
  cylZ(cx, cy, r, z0, z1, v, rInner = -1) {
    const r2 = r * r;
    const ri2 = rInner > 0 ? rInner * rInner : -1;
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2 && d2 >= ri2) for (let z = Math.round(z0); z < Math.round(z1); z++) this.set(x, y, z, v);
      }
  }

  ellipsoid(cx, cy, cz, rx, ry, rz, v) {
    for (let z = Math.floor(cz - rz - 1); z <= Math.ceil(cz + rz + 1); z++)
      for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
        for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
          if (dx * dx + dy * dy + dz * dz <= 1) this.set(x, y, z, v);
        }
  }

  /** Capsule between two points (voxel units). */
  line(ax, ay, az, bx, by, bz, r, v) {
    const minx = Math.floor(Math.min(ax, bx) - r - 1), maxx = Math.ceil(Math.max(ax, bx) + r + 1);
    const miny = Math.floor(Math.min(ay, by) - r - 1), maxy = Math.ceil(Math.max(ay, by) + r + 1);
    const minz = Math.floor(Math.min(az, bz) - r - 1), maxz = Math.ceil(Math.max(az, bz) + r + 1);
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const len2 = abx * abx + aby * aby + abz * abz || 1e-9;
    const r2 = r * r;
    for (let z = minz; z <= maxz; z++)
      for (let y = miny; y <= maxy; y++)
        for (let x = minx; x <= maxx; x++) {
          const px = x + 0.5 - ax, py = y + 0.5 - ay, pz = z + 0.5 - az;
          let t = (px * abx + py * aby + pz * abz) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = px - abx * t, dy = py - aby * t, dz = pz - abz * t;
          if (dx * dx + dy * dy + dz * dz <= r2) this.set(x, y, z, v);
        }
  }

  /** Axis-aligned square-section bar between two points (voxel units). */
  bar(ax, ay, az, bx, by, bz, half, v) {
    const steps = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay), Math.abs(bz - az)) * 2) + 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      this.box(x - half, y - half, z - half, x + half, y + half, z + half, v);
    }
  }

  forEach(fn) {
    const { nx, ny, nz, data } = this;
    let i = 0;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++, i++) fn(data[i], x, y, z, i);
  }

  /** Replace voxel values via fn(value,x,y,z) -> newValue (undefined keeps). */
  map(fn) {
    const { nx, ny, nz, data } = this;
    let i = 0;
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++, i++) {
          const v = data[i];
          const r = fn(v, x, y, z);
          if (r !== undefined) data[i] = r;
        }
  }

  /** True if voxel is solid and at least one 6-neighbour is empty. */
  isSurface(x, y, z) {
    if (!this.get(x, y, z)) return false;
    return (
      !this.get(x + 1, y, z) || !this.get(x - 1, y, z) || !this.get(x, y + 1, z) ||
      !this.get(x, y - 1, z) || !this.get(x, y, z + 1) || !this.get(x, y, z - 1)
    );
  }

  count() {
    let c = 0;
    for (let i = 0; i < this.data.length; i++) if (this.data[i]) c++;
    return c;
  }
}

/** A voxel model: grid + palette + scale. origin = local position of voxel (0,0,0) corner in meters. */
export class VoxelModel {
  constructor(grid, palette, voxelSize, origin = [0, 0, 0]) {
    this.grid = grid;
    this.palette = palette;
    this.voxelSize = voxelSize;
    this.origin = origin;
  }

  get size() {
    return [this.grid.nx * this.voxelSize, this.grid.ny * this.voxelSize, this.grid.nz * this.voxelSize];
  }
}
