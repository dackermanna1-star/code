// Uniform 2D spatial hash over the map footprint, rebuilt from scratch each
// simulation tick with a counting sort (O(n), cache friendly, no per-item
// bookkeeping when units move). Items must expose `pos` with x/z.

export class SpatialGrid {
  constructor(minX, minZ, size, cellSize) {
    this.minX = minX;
    this.minZ = minZ;
    this.cellSize = cellSize;
    this.n = Math.ceil(size / cellSize);
    this.cellCount = this.n * this.n;
    this.start = new Int32Array(this.cellCount + 1);
    this.write = new Int32Array(this.cellCount);
    this.items = [];
    this.count = 0;
    this._cells = new Int32Array(1024);
  }

  cellX(x) {
    const c = Math.floor((x - this.minX) / this.cellSize);
    return c < 0 ? 0 : c >= this.n ? this.n - 1 : c;
  }

  cellZ(z) {
    const c = Math.floor((z - this.minZ) / this.cellSize);
    return c < 0 ? 0 : c >= this.n ? this.n - 1 : c;
  }

  rebuild(list, filter = null) {
    const start = this.start;
    start.fill(0);
    let cells = this._cells;
    if (cells.length < list.length) {
      cells = this._cells = new Int32Array(Math.max(list.length, cells.length * 2));
    }
    let count = 0;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (filter !== null && !filter(it)) {
        cells[i] = -1;
        continue;
      }
      const c = this.cellZ(it.pos.z) * this.n + this.cellX(it.pos.x);
      cells[i] = c;
      start[c + 1]++;
      count++;
    }
    for (let c = 0; c < this.cellCount; c++) start[c + 1] += start[c];
    this.write.set(start.subarray(0, this.cellCount));
    const items = this.items;
    if (items.length < count) items.length = count;
    for (let i = 0; i < list.length; i++) {
      const c = cells[i];
      if (c >= 0) items[this.write[c]++] = list[i];
    }
    this.count = count;
  }

  // Collects items within radius r (2D) of (x, z) into `out`.
  queryRadius(x, z, r, out, filter = null) {
    out.length = 0;
    const r2 = r * r;
    const x0 = this.cellX(x - r);
    const x1 = this.cellX(x + r);
    const z0 = this.cellZ(z - r);
    const z1 = this.cellZ(z + r);
    const items = this.items;
    for (let cz = z0; cz <= z1; cz++) {
      const row = cz * this.n;
      for (let cx = x0; cx <= x1; cx++) {
        const c = row + cx;
        const end = this.start[c + 1];
        for (let i = this.start[c]; i < end; i++) {
          const it = items[i];
          const dx = it.pos.x - x;
          const dz = it.pos.z - z;
          if (dx * dx + dz * dz <= r2 && (filter === null || filter(it))) out.push(it);
        }
      }
    }
    return out;
  }

  // Calls fn(item, distSq) for items within r; stop early by returning true.
  forEachInRadius(x, z, r, fn) {
    const r2 = r * r;
    const x0 = this.cellX(x - r);
    const x1 = this.cellX(x + r);
    const z0 = this.cellZ(z - r);
    const z1 = this.cellZ(z + r);
    const items = this.items;
    for (let cz = z0; cz <= z1; cz++) {
      const row = cz * this.n;
      for (let cx = x0; cx <= x1; cx++) {
        const c = row + cx;
        const end = this.start[c + 1];
        for (let i = this.start[c]; i < end; i++) {
          const it = items[i];
          const dx = it.pos.x - x;
          const dz = it.pos.z - z;
          const d2 = dx * dx + dz * dz;
          if (d2 <= r2 && fn(it, d2) === true) return;
        }
      }
    }
  }

  // Items in the cells touched by a segment's bounding box (broad phase for
  // projectiles: their per-tick segments are short compared to a cell).
  querySegment(ax, az, bx, bz, pad, out) {
    out.length = 0;
    const x0 = this.cellX(Math.min(ax, bx) - pad);
    const x1 = this.cellX(Math.max(ax, bx) + pad);
    const z0 = this.cellZ(Math.min(az, bz) - pad);
    const z1 = this.cellZ(Math.max(az, bz) + pad);
    const items = this.items;
    for (let cz = z0; cz <= z1; cz++) {
      const row = cz * this.n;
      for (let cx = x0; cx <= x1; cx++) {
        const c = row + cx;
        const end = this.start[c + 1];
        for (let i = this.start[c]; i < end; i++) out.push(items[i]);
      }
    }
    return out;
  }

  // Number of items in the cell containing (x, z).
  densityAt(x, z) {
    const c = this.cellZ(z) * this.n + this.cellX(x);
    return this.start[c + 1] - this.start[c];
  }
}

// Static grid for things that rarely move (structures, trees, cover points):
// each cell keeps a plain array; an item can be registered in several cells.
export class StaticGrid {
  constructor(minX, minZ, size, cellSize) {
    this.minX = minX;
    this.minZ = minZ;
    this.cellSize = cellSize;
    this.n = Math.ceil(size / cellSize);
    this.cells = new Array(this.n * this.n);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    this.stamp = 1;
  }

  cellX(x) {
    const c = Math.floor((x - this.minX) / this.cellSize);
    return c < 0 ? 0 : c >= this.n ? this.n - 1 : c;
  }

  cellZ(z) {
    const c = Math.floor((z - this.minZ) / this.cellSize);
    return c < 0 ? 0 : c >= this.n ? this.n - 1 : c;
  }

  cellAt(x, z) {
    return this.cells[this.cellZ(z) * this.n + this.cellX(x)];
  }

  insertPoint(item, x, z) {
    this.cellAt(x, z).push(item);
  }

  insertRect(item, x0, z0, x1, z1) {
    const cx0 = this.cellX(x0);
    const cx1 = this.cellX(x1);
    const cz0 = this.cellZ(z0);
    const cz1 = this.cellZ(z1);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) this.cells[cz * this.n + cx].push(item);
    }
  }

  remove(item, x0, z0, x1 = x0, z1 = z0) {
    const cx0 = this.cellX(x0);
    const cx1 = this.cellX(x1);
    const cz0 = this.cellZ(z0);
    const cz1 = this.cellZ(z1);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const cell = this.cells[cz * this.n + cx];
        const i = cell.indexOf(item);
        if (i >= 0) {
          cell[i] = cell[cell.length - 1];
          cell.pop();
        }
      }
    }
  }

  // Unique items whose cells overlap the square around (x, z). Uses a stamp
  // field on the items to dedupe multi-cell entries.
  queryRect(x0, z0, x1, z1, out) {
    out.length = 0;
    const stamp = ++this.stamp;
    const cx0 = this.cellX(x0);
    const cx1 = this.cellX(x1);
    const cz0 = this.cellZ(z0);
    const cz1 = this.cellZ(z1);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const cell = this.cells[cz * this.n + cx];
        for (let i = 0; i < cell.length; i++) {
          const it = cell[i];
          if (it._stamp !== stamp) {
            it._stamp = stamp;
            out.push(it);
          }
        }
      }
    }
    return out;
  }

  queryRadius(x, z, r, out) {
    return this.queryRect(x - r, z - r, x + r, z + r, out);
  }
}
