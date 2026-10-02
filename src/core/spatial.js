// Spatial grids for dynamic objects (fighters, ragdoll particles), rebuilt
// every step. Buckets are recycled so steady-state use allocates nothing.

// Dense grid of points over a fixed region. Each object sits in exactly one
// cell, so queries need no de-duplication; the grid's pad (or the caller)
// widens the query radius by the object's extent, and callers do the exact
// test.
export class PointGrid {
  constructor(cellSize, pad = 0) {
    this.pad = pad; // added to every query radius (object extent)
    this.cell = cellSize;
    this.inv = 1 / cellSize;
    this.cols = 0;
    this.rows = 0;
    this.cx0 = 0;
    this.cy0 = 0;
    this.cells = [];
    this.used = [];
  }

  setBounds(x0, y0, x1, y1) {
    this.cx0 = Math.floor(x0 * this.inv);
    this.cy0 = Math.floor(y0 * this.inv);
    this.cols = Math.floor(x1 * this.inv) - this.cx0 + 1;
    this.rows = Math.floor(y1 * this.inv) - this.cy0 + 1;
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    this.used.length = 0;
  }

  clear() {
    for (let i = 0; i < this.used.length; i++) this.used[i].length = 0;
    this.used.length = 0;
  }

  insert(obj, x, y) {
    let cx = Math.floor(x * this.inv) - this.cx0;
    let cy = Math.floor(y * this.inv) - this.cy0;
    if (cx < 0) cx = 0;
    else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.rows) cy = this.rows - 1;
    const b = this.cells[cy * this.cols + cx];
    if (b.length === 0) this.used.push(b);
    b.push(obj);
  }

  query(x, y, r, out) {
    out.length = 0;
    r += this.pad;
    const inv = this.inv;
    let x0 = Math.floor((x - r) * inv) - this.cx0;
    let x1 = Math.floor((x + r) * inv) - this.cx0;
    let y0 = Math.floor((y - r) * inv) - this.cy0;
    let y1 = Math.floor((y + r) * inv) - this.cy0;
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 >= this.cols) x1 = this.cols - 1;
    if (y1 >= this.rows) y1 = this.rows - 1;
    const cols = this.cols;
    const cells = this.cells;
    for (let cy = y0; cy <= y1; cy++) {
      const row = cy * cols;
      for (let cx = x0; cx <= x1; cx++) {
        const b = cells[row + cx];
        for (let i = 0; i < b.length; i++) out.push(b[i]);
      }
    }
    return out;
  }
}
