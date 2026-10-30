import { Vec3 } from '../physics/math.js';

/**
 * Route planning for walking people: a height grid of the arena (floor plus the tops of the fixed
 * obstacles) searched with A*. A move between neighbouring cells is possible when the height
 * difference is one a person can step (up to ~25 cm: kerbs, logs, stairs); taller props are walls
 * the route keeps a body's width away from. Stepping onto or over something costs a little extra,
 * so short detours around small obstacles are taken and long ones are not - like people do.
 * The gait itself deals with where exactly each foot goes.
 */
export class NavGrid {
  constructor(world, opts = {}) {
    this.world = world;
    this.half = opts.half ?? 11.5;
    this.res = opts.res ?? 0.1;
    this.maxRise = opts.maxRise ?? 0.26;
    this.clearance = opts.clearance ?? 0.28; // body half-width kept from walls
    this.n = Math.round((this.half * 2) / this.res);
    this.h = new Float32Array(this.n * this.n);
    this.blocked = new Uint8Array(this.n * this.n);
    this.version = -1;
  }

  idx(i, j) {
    return j * this.n + i;
  }

  cellOf(x, z) {
    const i = Math.floor((x + this.half) / this.res), j = Math.floor((z + this.half) / this.res);
    return [Math.max(0, Math.min(this.n - 1, i)), Math.max(0, Math.min(this.n - 1, j))];
  }

  center(i, j, out = new Vec3()) {
    return out.set(-this.half + (i + 0.5) * this.res, 0, -this.half + (j + 0.5) * this.res);
  }

  /** Re-sample the heights when the set of fixed obstacles changed. */
  rebuild(version) {
    if (version === this.version) return;
    this.version = version;
    const { n, h, blocked, world } = this;
    h.fill(world.groundY);
    blocked.fill(0);
    const statics = world.staticBodies.filter((b) => b.userData && b.userData.obstacle);
    if (!statics.length) return;
    const p = new Vec3();
    for (const b of statics) {
      const [i0, j0] = this.cellOf(b.aabbMin.x - this.res, b.aabbMin.z - this.res);
      const [i1, j1] = this.cellOf(b.aabbMax.x + this.res, b.aabbMax.z + this.res);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          this.center(i, j, p);
          h[this.idx(i, j)] = world.surfaceAt(p.x, p.z, 5);
        }
      }
    }
    // walls: a cell whose neighbour is much higher (or much lower: a drop off a landing) is no place
    // to walk; widen them by the body's half-width so routes keep clear of the edges
    const wall = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = h[this.idx(i, j)];
        for (let k = 0; k < 4; k++) {
          const ii = i + (k === 0 ? 1 : k === 1 ? -1 : 0), jj = j + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          if (Math.abs(h[this.idx(ii, jj)] - a) > this.maxRise) wall[this.idx(i, j)] = 1;
        }
      }
    }
    const rc = Math.ceil(this.clearance / this.res);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (!wall[this.idx(i, j)]) continue;
        for (let dj = -rc; dj <= rc; dj++) {
          for (let di = -rc; di <= rc; di++) {
            if (di * di + dj * dj > rc * rc) continue;
            const ii = i + di, jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
            blocked[this.idx(ii, jj)] = 1;
          }
        }
      }
    }
  }

  heightAt(x, z) {
    const [i, j] = this.cellOf(x, z);
    return this.h[this.idx(i, j)];
  }

  passable(i, j) {
    return i >= 0 && j >= 0 && i < this.n && j < this.n && !this.blocked[this.idx(i, j)];
  }

  /** Can one walk straight from cell a to cell b (every cell on the way passable, steps steppable)? */
  lineClear(ai, aj, bi, bj) {
    const steps = Math.max(Math.abs(bi - ai), Math.abs(bj - aj)) * 2;
    let pi = ai, pj = aj;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const i = Math.round(ai + (bi - ai) * t), j = Math.round(aj + (bj - aj) * t);
      if (!this.passable(i, j)) return false;
      if (Math.abs(this.h[this.idx(i, j)] - this.h[this.idx(pi, pj)]) > this.maxRise) return false;
      pi = i;
      pj = j;
    }
    return true;
  }

  /** Nearest passable cell to (i, j) within a few metres. */
  nearestFree(i, j) {
    if (this.passable(i, j)) return [i, j];
    for (let r = 1; r < 40; r++) {
      let best = null, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (!this.passable(i + di, j + dj)) continue;
          const d = di * di + dj * dj;
          if (d < bd) {
            bd = d;
            best = [i + di, j + dj];
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * Route from `from` to `to` (world points). Returns waypoints (Vec3 with y = surface height),
   * ending at the goal (moved to the nearest reachable spot if it is inside an obstacle), or null.
   */
  findPath(from, to) {
    const { n, h } = this;
    // (never right at the edge of the floor)
    const lim = this.half - 0.4;
    to = new Vec3(Math.max(-lim, Math.min(lim, to.x)), to.y, Math.max(-lim, Math.min(lim, to.z)));
    const s0 = this.cellOf(from.x, from.z);
    const g0 = this.cellOf(to.x, to.z);
    const s = this.nearestFree(s0[0], s0[1]) || s0;
    const g = this.nearestFree(g0[0], g0[1]);
    if (!g) return null;
    const goalMoved = g[0] !== g0[0] || g[1] !== g0[1];
    const start = this.idx(s[0], s[1]), goal = this.idx(g[0], g[1]);
    const N = n * n;
    const gScore = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = new MinHeap();
    const hx = (k) => {
      const i = k % n, j = (k / n) | 0;
      return Math.hypot(i - g[0], j - g[1]);
    };
    gScore[start] = 0;
    heap.push(start, hx(start));
    let found = false, expanded = 0;
    while (heap.size) {
      const k = heap.pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (k === goal) {
        found = true;
        break;
      }
      if (++expanded > 200000) break;
      const i = k % n, j = (k / n) | 0;
      const hk = h[k];
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ii = i + di, jj = j + dj;
          if (!this.passable(ii, jj)) continue;
          // no corner cutting past a blocked cell
          if (di && dj && (!this.passable(i + di, j) || !this.passable(i, j + dj))) continue;
          const kk = this.idx(ii, jj);
          if (closed[kk]) continue;
          const dh = Math.abs(h[kk] - hk);
          if (dh > this.maxRise) continue;
          // a step up or down costs a little extra effort (~15 cm of level walking for a kerb)
          const c = (di && dj ? Math.SQRT2 : 1) + (dh > 0.03 ? 0.6 + 4 * dh : 0);
          const ng = gScore[k] + c;
          if (ng < gScore[kk]) {
            gScore[kk] = ng;
            came[kk] = k;
            heap.push(kk, ng + hx(kk));
          }
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = goal; k >= 0; k = came[k]) {
      cells.push(k);
      if (k === start) break;
    }
    cells.reverse();
    // string pulling: keep only the cells where the straight line would cross something
    const pts = [cells[0]];
    let a = cells[0];
    for (let q = 1; q < cells.length; q++) {
      const b = cells[q];
      if (!this.lineClear(a % n, (a / n) | 0, b % n, (b / n) | 0)) {
        a = cells[q - 1];
        pts.push(a);
      }
    }
    if (pts[pts.length - 1] !== cells[cells.length - 1]) pts.push(cells[cells.length - 1]);
    const out = [];
    for (let q = 1; q < pts.length; q++) {
      const k = pts[q];
      const p = this.center(k % n, (k / n) | 0);
      p.y = h[k];
      out.push(p);
    }
    // finish on the exact spot that was asked for (when it is walkable)
    const last = goalMoved ? out[out.length - 1] || this.center(g[0], g[1]) : new Vec3(to.x, h[goal], to.z);
    if (out.length) out[out.length - 1] = last;
    else out.push(last);
    return out;
  }
}

class MinHeap {
  constructor() {
    this.k = [];
    this.p = [];
  }

  get size() {
    return this.k.length;
  }

  push(key, pri) {
    const K = this.k, P = this.p;
    let i = K.length;
    K.push(key);
    P.push(pri);
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (P[par] <= pri) break;
      K[i] = K[par];
      P[i] = P[par];
      i = par;
    }
    K[i] = key;
    P[i] = pri;
  }

  pop() {
    const K = this.k, P = this.p;
    const top = K[0];
    const lk = K.pop(), lp = P.pop();
    if (K.length) {
      let i = 0;
      const n = K.length;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mp = lp;
        if (l < n && P[l] < mp) {
          m = l;
          mp = P[l];
        }
        if (r < n && P[r] < mp) m = r;
        if (m === i) break;
        K[i] = K[m];
        P[i] = P[m];
        i = m;
      }
      K[i] = lk;
      P[i] = lp;
    }
    return top;
  }
}
