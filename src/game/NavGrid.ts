import * as THREE from 'three';

/**
 * Tiny grid navigation for the dining room: rasterized obstacles, A* search
 * and line-of-sight path smoothing.
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;

  constructor(
    readonly minX: number,
    readonly minZ: number,
    readonly maxX: number,
    readonly maxZ: number,
    readonly cell = 0.2,
  ) {
    this.cols = Math.ceil((maxX - minX) / cell);
    this.rows = Math.ceil((maxZ - minZ) / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
  }

  private idx(c: number, r: number) {
    return r * this.cols + c;
  }
  toCell(x: number, z: number): [number, number] {
    return [Math.floor((x - this.minX) / this.cell), Math.floor((z - this.minZ) / this.cell)];
  }
  toWorld(c: number, r: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.minX + (c + 0.5) * this.cell, 0, this.minZ + (r + 0.5) * this.cell);
  }
  inside(c: number, r: number) {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows;
  }
  isBlocked(c: number, r: number) {
    return !this.inside(c, r) || this.blocked[this.idx(c, r)] > 0;
  }

  blockRect(x0: number, z0: number, x1: number, z1: number, pad = 0.18) {
    const [c0, r0] = this.toCell(Math.min(x0, x1) - pad, Math.min(z0, z1) - pad);
    const [c1, r1] = this.toCell(Math.max(x0, x1) + pad, Math.max(z0, z1) + pad);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (this.inside(c, r)) this.blocked[this.idx(c, r)]++;
  }

  blockCircle(x: number, z: number, radius: number, pad = 0.18) {
    const rr = radius + pad;
    const [c0, r0] = this.toCell(x - rr, z - rr);
    const [c1, r1] = this.toCell(x + rr, z + rr);
    const p = new THREE.Vector3();
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        if (!this.inside(c, r)) continue;
        this.toWorld(c, r, p);
        if (Math.hypot(p.x - x, p.z - z) <= rr) this.blocked[this.idx(c, r)]++;
      }
  }

  /** Line of sight on the grid (supercover walk). */
  los(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const d = a.distanceTo(b);
    const steps = Math.ceil(d / (this.cell * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const [c, r] = this.toCell(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (this.isBlocked(c, r)) return false;
    }
    return true;
  }

  private nearestFree(c: number, r: number): [number, number] {
    if (!this.isBlocked(c, r)) return [c, r];
    for (let rad = 1; rad < 12; rad++)
      for (let dr = -rad; dr <= rad; dr++)
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.abs(dr) !== rad && Math.abs(dc) !== rad) continue;
          if (!this.isBlocked(c + dc, r + dr)) return [c + dc, r + dr];
        }
    return [c, r];
  }

  /** A* from a to b (both world). Returns smoothed world waypoints ending exactly at b. */
  find(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] {
    if (this.los(a, b)) return [b.clone()];
    let [sc, sr] = this.toCell(a.x, a.z);
    let [gc, gr] = this.toCell(b.x, b.z);
    [sc, sr] = this.nearestFree(sc, sr);
    [gc, gr] = this.nearestFree(gc, gr);
    const N = this.cols * this.rows;
    const g = new Float32Array(N).fill(Infinity);
    const f = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open: number[] = [];
    const start = this.idx(sc, sr);
    const goal = this.idx(gc, gr);
    const h = (i: number) => {
      const c = i % this.cols;
      const r = (i / this.cols) | 0;
      const dx = Math.abs(c - gc);
      const dz = Math.abs(r - gr);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    g[start] = 0;
    f[start] = h(start);
    open.push(start);
    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
    ];
    let found = false;
    let guard = 0;
    while (open.length && guard++ < 20000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open.splice(bi, 1);
      if (cur === goal) {
        found = true;
        break;
      }
      closed[cur] = 1;
      const cc = cur % this.cols;
      const cr = (cur / this.cols) | 0;
      for (const [dc, dr, cost] of dirs) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (this.isBlocked(nc, nr)) continue;
        if (dc && dr && (this.isBlocked(cc + dc, cr) || this.isBlocked(cc, cr + dr))) continue;
        const ni = this.idx(nc, nr);
        if (closed[ni]) continue;
        const ng = g[cur] + cost;
        if (ng < g[ni]) {
          came[ni] = cur;
          g[ni] = ng;
          f[ni] = ng + h(ni);
          if (!open.includes(ni)) open.push(ni);
        }
      }
    }
    if (!found) return [b.clone()];
    const cells: THREE.Vector3[] = [];
    for (let i = goal; i !== -1; i = came[i]) cells.push(this.toWorld(i % this.cols, (i / this.cols) | 0));
    cells.reverse();
    cells[cells.length - 1] = b.clone();
    // string pulling
    const out: THREE.Vector3[] = [];
    let anchor = a.clone();
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.los(anchor, cells[j])) j--;
      out.push(cells[j].clone());
      anchor = cells[j];
      i = j + 1;
    }
    return out;
  }
}
