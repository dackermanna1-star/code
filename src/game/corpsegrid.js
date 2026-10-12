// Baked bodies bucketed by area (zombie survival), so a bullet only looks at the bodies
// along its own path instead of every body of the run (gore.corpseHit).
//  - a flat grid of CELL x CELL columns (x, y; height doesn't matter): a body goes into
//    every column its hit radius overlaps
//  - a segment walks the columns its x, y shadow crosses (Amanatides-Woo), clipped to the
//    box around all the bodies first, and gets each body once (a stamp per query)
// A body whose hit radius reaches the segment in 3D also does in x, y, so it is in one
// of the columns walked: the same bodies get tested as with a full scan.
const CELL = 128;
const OFF = 1024, SPAN = 2048; // column index -> key (maps fit in +-131072 units)
const key = (ix, iy) => (ix + OFF) * SPAN + iy + OFF;

export class CorpseGrid {
  constructor() {
    this.cells = new Map(); // key -> [record] (in the order they were added)
    this.box = [Infinity, Infinity, -Infinity, -Infinity]; // x0, y0, x1, y1 of every body's radius
    this.stamp = 0;
    this.out = []; // the last query's records (reused)
  }

  clear() {
    this.cells.clear();
    this.box[0] = this.box[1] = Infinity; this.box[2] = this.box[3] = -Infinity;
  }

  /** File record rec (its .center) under every column within r of it. */
  add(rec, r) {
    const c = rec.center, B = this.box;
    const x0 = c[0] - r, y0 = c[1] - r, x1 = c[0] + r, y1 = c[1] + r;
    if (x0 < B[0]) B[0] = x0;
    if (y0 < B[1]) B[1] = y0;
    if (x1 > B[2]) B[2] = x1;
    if (y1 > B[3]) B[3] = y1;
    rec.qid = 0;
    for (let ix = Math.floor(x0 / CELL), ex = Math.floor(x1 / CELL); ix <= ex; ix++) {
      for (let iy = Math.floor(y0 / CELL), ey = Math.floor(y1 / CELL); iy <= ey; iy++) {
        const k = key(ix, iy);
        const list = this.cells.get(k);
        if (list) list.push(rec); else this.cells.set(k, [rec]);
      }
    }
  }

  /**
   * The records filed along segment a-b (each once; nearest columns first). Returns the
   * reused array this.out.
   */
  along(a, b) {
    const out = this.out, B = this.box;
    out.length = 0;
    if (!(B[0] <= B[2])) return out;
    // clip the x, y shadow to the box around all the bodies (Liang-Barsky)
    const dx = b[0] - a[0], dy = b[1] - a[1];
    let t0 = 0, t1 = 1;
    if (dx === 0) { if (a[0] < B[0] || a[0] > B[2]) return out; } else {
      let ta = (B[0] - a[0]) / dx, tb = (B[2] - a[0]) / dx;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
    }
    if (dy === 0) { if (a[1] < B[1] || a[1] > B[3]) return out; } else {
      let ta = (B[1] - a[1]) / dy, tb = (B[3] - a[1]) / dy;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
    }
    if (t0 > t1) return out;
    const sx = a[0] + dx * t0, sy = a[1] + dy * t0;
    let ix = Math.floor(sx / CELL), iy = Math.floor(sy / CELL);
    const ex = Math.floor((a[0] + dx * t1) / CELL), ey = Math.floor((a[1] + dy * t1) / CELL);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    // t (of the whole segment) at the next column edge in x / y, and per column
    const ddx = dx !== 0 ? CELL / Math.abs(dx) : Infinity, ddy = dy !== 0 ? CELL / Math.abs(dy) : Infinity;
    let nx = dx !== 0 ? ((dx > 0 ? (ix + 1) * CELL : ix * CELL) - a[0]) / dx : Infinity;
    let ny = dy !== 0 ? ((dy > 0 ? (iy + 1) * CELL : iy * CELL) - a[1]) / dy : Infinity;
    const q = ++this.stamp;
    // (steps: a guard against float edge cases, never reached in practice)
    for (let n = Math.abs(ex - ix) + Math.abs(ey - iy) + 2; n > 0; n--) {
      const list = this.cells.get(key(ix, iy));
      if (list) for (let i = 0; i < list.length; i++) { const r = list[i]; if (r.qid !== q) { r.qid = q; out.push(r); } }
      if (ix === ex && iy === ey) break;
      if (nx < ny) { ix += stepX; nx += ddx; } else { iy += stepY; ny += ddy; }
    }
    return out;
  }
}
