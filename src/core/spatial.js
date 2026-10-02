// Uniform-grid spatial hash for dynamic objects (fighters, ragdoll particles).
// Rebuilt every step; buckets are recycled so steady-state use allocates nothing.

export class SpatialHash {
  constructor(cellSize, stampKey) {
    this.cell = cellSize;
    this.inv = 1 / cellSize;
    this.buckets = new Map();
    this.used = [];
    this.stamp = 1;
    this.key = stampKey;
  }

  clear() {
    for (let i = 0; i < this.used.length; i++) this.used[i].length = 0;
    this.used.length = 0;
  }

  _bucket(cx, cy) {
    const k = (cx + 32768) * 65536 + (cy + 32768);
    let b = this.buckets.get(k);
    if (!b) {
      b = [];
      this.buckets.set(k, b);
    }
    if (b.length === 0) this.used.push(b);
    return b;
  }

  insert(obj, x, y, r) {
    const inv = this.inv;
    const x0 = Math.floor((x - r) * inv);
    const x1 = Math.floor((x + r) * inv);
    const y0 = Math.floor((y - r) * inv);
    const y1 = Math.floor((y + r) * inv);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) this._bucket(cx, cy).push(obj);
    }
  }

  query(x, y, r, out) {
    out.length = 0;
    const key = this.key;
    const stamp = ++this.stamp;
    const inv = this.inv;
    const x0 = Math.floor((x - r) * inv);
    const x1 = Math.floor((x + r) * inv);
    const y0 = Math.floor((y - r) * inv);
    const y1 = Math.floor((y + r) * inv);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const b = this.buckets.get((cx + 32768) * 65536 + (cy + 32768));
        if (!b) continue;
        for (let i = 0; i < b.length; i++) {
          const o = b[i];
          if (o[key] !== stamp) {
            o[key] = stamp;
            out.push(o);
          }
        }
      }
    }
    return out;
  }
}
