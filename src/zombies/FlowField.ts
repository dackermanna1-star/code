import { ARENA } from '../world/config';

/**
 * Dijkstra flow field toward the player over a 1m grid covering the arena.
 * Structures add traversal cost (smart zombies path around them through gaps,
 * or through the cheapest barrier when fully walled in).
 */
export class FlowField {
  readonly cell = 1;
  readonly minX = -ARENA.halfWidth - 0.5;
  readonly minZ = ARENA.zMin - 0.5;
  readonly cols: number;
  readonly rows: number;
  readonly cost: Float32Array;
  readonly dist: Float32Array;
  readonly dirX: Float32Array;
  readonly dirZ: Float32Array;
  private heap: Int32Array;
  private heapKey: Float32Array;
  private heapN = 0;
  private targetCell = -1;
  dirty = true;
  private timer = 0;

  constructor() {
    this.cols = Math.ceil((ARENA.halfWidth * 2 + 1) / this.cell);
    this.rows = Math.ceil((ARENA.zMax - ARENA.zMin + 1) / this.cell);
    const n = this.cols * this.rows;
    this.cost = new Float32Array(n).fill(1);
    this.dist = new Float32Array(n);
    this.dirX = new Float32Array(n);
    this.dirZ = new Float32Array(n);
    this.heap = new Int32Array(n * 8);
    this.heapKey = new Float32Array(n * 8);
  }

  index(x: number, z: number) {
    const cx = Math.floor((x - this.minX) / this.cell);
    const cz = Math.floor((z - this.minZ) / this.cell);
    if (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) return -1;
    return cz * this.cols + cx;
  }

  resetCosts() {
    this.cost.fill(1);
    this.dirty = true;
  }

  /** Adds cost over an oriented rectangle footprint. */
  addRect(cx: number, cz: number, hw: number, hd: number, yaw: number, cost: number) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const r = Math.hypot(hw, hd) + 0.5;
    for (let z = cz - r; z <= cz + r; z += this.cell * 0.5) {
      for (let x = cx - r; x <= cx + r; x += this.cell * 0.5) {
        const lx = (x - cx) * c - (z - cz) * s;
        const lz = (x - cx) * s + (z - cz) * c;
        if (Math.abs(lx) <= hw + 0.3 && Math.abs(lz) <= hd + 0.3) {
          const i = this.index(x, z);
          if (i >= 0) this.cost[i] = Math.max(this.cost[i], cost);
        }
      }
    }
    this.dirty = true;
  }

  private push(i: number, k: number) {
    let n = this.heapN++;
    const h = this.heap;
    const hk = this.heapKey;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (hk[p] <= k) break;
      h[n] = h[p];
      hk[n] = hk[p];
      n = p;
    }
    h[n] = i;
    hk[n] = k;
  }
  private pop(): number {
    const h = this.heap;
    const hk = this.heapKey;
    const top = h[0];
    const n = --this.heapN;
    if (n > 0) {
      const li = h[n];
      const lk = hk[n];
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && hk[c + 1] < hk[c]) c++;
        if (hk[c] >= lk) break;
        h[i] = h[c];
        hk[i] = hk[c];
        i = c;
      }
      h[i] = li;
      hk[i] = lk;
    }
    return top;
  }

  update(dt: number, tx: number, tz: number) {
    this.timer -= dt;
    const tc = this.index(tx, tz);
    if (tc < 0) return;
    if (!this.dirty && tc === this.targetCell) return;
    if (this.timer > 0 && !this.dirty) return;
    this.timer = 0.3;
    this.targetCell = tc;
    this.dirty = false;
    this.compute(tc);
  }

  private compute(target: number) {
    const { cols, rows, cost, dist } = this;
    dist.fill(1e9);
    this.heapN = 0;
    dist[target] = 0;
    this.push(target, 0);
    const D = Math.SQRT2;
    while (this.heapN > 0) {
      const i = this.pop();
      const di = dist[i];
      const x = i % cols;
      const z = (i / cols) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        const nz = z + dz;
        if (nz < 0 || nz >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= cols) continue;
          const j = nz * cols + nx;
          const step = (dx !== 0 && dz !== 0 ? D : 1) * (cost[j] + cost[i]) * 0.5;
          const nd = di + step;
          if (nd < dist[j]) {
            dist[j] = nd;
            this.push(j, nd);
          }
        }
      }
    }
    // gradient directions
    for (let i = 0; i < cols * rows; i++) {
      const x = i % cols;
      const z = (i / cols) | 0;
      let best = dist[i];
      let bx = 0;
      let bz = 0;
      for (let dz = -1; dz <= 1; dz++) {
        const nz = z + dz;
        if (nz < 0 || nz >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= cols || (dx === 0 && dz === 0)) continue;
          const d = dist[nz * cols + nx];
          if (d < best) {
            best = d;
            bx = dx;
            bz = dz;
          }
        }
      }
      const l = Math.hypot(bx, bz) || 1;
      this.dirX[i] = bx / l;
      this.dirZ[i] = bz / l;
    }
  }

  /** Smoothed direction at a world position (bilinear). Returns false if outside. */
  sample(x: number, z: number, out: { x: number; z: number }) {
    const fx = (x - this.minX) / this.cell - 0.5;
    const fz = (z - this.minZ) / this.cell - 0.5;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;
    let sx = 0;
    let sz = 0;
    let w = 0;
    for (let k = 0; k < 4; k++) {
      const cx = x0 + (k & 1);
      const cz = z0 + (k >> 1);
      if (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) continue;
      const wk = ((k & 1) ? tx : 1 - tx) * ((k >> 1) ? tz : 1 - tz);
      const i = cz * this.cols + cx;
      sx += this.dirX[i] * wk;
      sz += this.dirZ[i] * wk;
      w += wk;
    }
    if (w <= 0) return false;
    const l = Math.hypot(sx, sz);
    if (l < 1e-4) return false;
    out.x = sx / l;
    out.z = sz / l;
    return true;
  }
}
