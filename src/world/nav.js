// Navigation: per-movement-class cost grids over the map and a weighted A*
// path finder with optional threat costs (used to plan flanking routes that
// avoid known enemy fire lanes). Path requests go through a queue processed
// under a per-frame time budget.

import { MAT } from './terrain.js';
import { clamp } from '../core/math.js';

export const MOVE_INF = 0;
export const MOVE_TRACK = 1;
export const MOVE_WHEEL = 2;

const BLOCKED = 255;
const SQRT2 = Math.SQRT2;
const NEIGH = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

export class NavGrid {
  constructor(map, res = 4) {
    this.map = map;
    this.terrain = map.terrain;
    this.res = res;
    this.half = this.terrain.half;
    this.n = Math.round(this.terrain.size / res);
    const N = this.n * this.n;
    this.cost = [new Uint8Array(N), new Uint8Array(N), new Uint8Array(N)];
    this.base = [new Uint8Array(N), new Uint8Array(N), new Uint8Array(N)]; // terrain-only costs
    // A* scratch.
    this.g = new Float32Array(N);
    this.from = new Int32Array(N);
    this.seen = new Uint32Array(N);
    this.closed = new Uint32Array(N);
    this.search = 0;
    this.heap = new Int32Array(N);
    this.heapF = new Float32Array(N);
    this.heapSize = 0;
    this.version = 0;
  }

  cellX(x) {
    return clamp(Math.floor((x + this.half) / this.res), 0, this.n - 1);
  }

  cellZ(z) {
    return clamp(Math.floor((z + this.half) / this.res), 0, this.n - 1);
  }

  centerX(cx) {
    return (cx + 0.5) * this.res - this.half;
  }

  centerZ(cz) {
    return (cz + 0.5) * this.res - this.half;
  }

  build() {
    const t = this.terrain;
    const n = this.n;
    const forest = this.map.forest;
    for (let cz = 0; cz < n; cz++) {
      for (let cx = 0; cx < n; cx++) {
        const x = this.centerX(cx);
        const z = this.centerZ(cz);
        const i = cz * n + cx;
        const slope = Math.max(t.slopeAt(x, z), t.slopeAt(x + 1.5, z + 1.5), t.slopeAt(x - 1.5, z - 1.5));
        const fi = clamp(Math.floor((x + this.half) / forest.res), 0, forest.n - 1) + clamp(Math.floor((z + this.half) / forest.res), 0, forest.n - 1) * forest.n;
        const fd = forest.dens[fi];
        const m = t.materialAt(x, z);
        const road = m === MAT.ROAD || m === MAT.CONCRETE;
        const water = t.heightAt(x, z) < t.waterLevel;
        const edge = !t.inBounds(x, z, 24);
        // Infantry.
        let ci = 10 + slope * 18 + fd * 4;
        if (slope > 1.5 || water || edge) ci = BLOCKED;
        // Tracked.
        let ct = 10 + slope * 45 + fd * 22 - (road ? 2 : 0);
        if (slope > 0.75 || water || edge) ct = BLOCKED;
        // Wheeled.
        let cw = road ? 6 : 11 + slope * 60 + fd * 70;
        if (slope > 0.55 || fd > 0.75 || water || edge) cw = BLOCKED;
        this.base[0][i] = ci >= BLOCKED ? BLOCKED : clamp(Math.round(ci), 1, 254);
        this.base[1][i] = ct >= BLOCKED ? BLOCKED : clamp(Math.round(ct), 1, 254);
        this.base[2][i] = cw >= BLOCKED ? BLOCKED : clamp(Math.round(cw), 1, 254);
      }
    }
    this.rebuildStructures(-this.half, -this.half, this.half, this.half);
  }

  // Recompute a region from terrain base costs plus structures (call after
  // destruction or crater deformation).
  rebuildStructures(x0, z0, x1, z1) {
    const n = this.n;
    const cx0 = this.cellX(x0);
    const cx1 = this.cellX(x1);
    const cz0 = this.cellZ(z0);
    const cz1 = this.cellZ(z1);
    for (let k = 0; k < 3; k++) {
      const c = this.cost[k];
      const b = this.base[k];
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cx = cx0; cx <= cx1; cx++) c[cz * n + cx] = b[cz * n + cx];
      }
    }
    const structs = this.map.structures.grid.queryRect(x0 - 40, z0 - 40, x1 + 40, z1 + 40, []);
    for (const s of structs) this.rasterStructure(s, cx0, cz0, cx1, cz1);
    this.version++;
  }

  rasterStructure(s, rcx0 = 0, rcz0 = 0, rcx1 = this.n - 1, rcz1 = this.n - 1) {
    const n = this.n;
    const c = Math.cos(s.yaw);
    const sn = Math.sin(s.yaw);
    const isBuilding = s.kind === 'building';
    const low = s.isLow;
    if (s.destroyed && !isBuilding) return; // flattened walls/props are free
    const thin = Math.min(s.hx, s.hz) < 1.0;
    // Margins per class: infantry, tracked, wheeled.
    const margins = [0.5, 2.0, 1.8];
    const [bx0, bz0, bx1, bz1] = s.bounds();
    for (let k = 0; k < 3; k++) {
      let pen;
      if (s.destroyed) {
        // Rubble: slow for infantry and tracks, blocks wheels.
        pen = k === 0 ? 30 : k === 1 ? 60 : BLOCKED;
      } else if (isBuilding) {
        pen = BLOCKED;
      } else if (k === 0) {
        pen = low ? 14 : s.type === 'hedge' ? 18 : BLOCKED;
        if (s.type === 'tank_trap' || s.type === 'fence') pen = 8;
      } else if (k === 1) {
        pen = s.crushable ? 18 : s.type === 'stone_wall' ? 40 : BLOCKED;
      } else {
        pen = s.crushable && s.type !== 'hedge' ? 40 : BLOCKED;
      }
      const m = margins[k];
      const cost = this.cost[k];
      if (thin) {
        // Sample along the long axis so thin walls can't be skipped diagonally.
        const longX = s.hx > s.hz;
        const L = longX ? s.hx : s.hz;
        const W = (longX ? s.hz : s.hx) + m;
        for (let d = -L - m; d <= L + m; d += 1) {
          for (let w = -W; w <= W; w += Math.max(0.5, W)) {
            const lx = longX ? d : w;
            const lz = longX ? w : d;
            const x = s.x + lx * c + lz * sn;
            const z = s.z - lx * sn + lz * c;
            const cx = this.cellX(x);
            const cz = this.cellZ(z);
            if (cx < rcx0 || cx > rcx1 || cz < rcz0 || cz > rcz1) continue;
            const i = cz * n + cx;
            // Idempotent per wall: several samples land in the same cell.
            if (cost[i] !== BLOCKED) cost[i] = pen === BLOCKED ? BLOCKED : Math.min(254, Math.max(cost[i], this.base[k][i] + pen));
          }
        }
        continue;
      }
      const cx0 = Math.max(rcx0, this.cellX(bx0 - m));
      const cx1 = Math.min(rcx1, this.cellX(bx1 + m));
      const cz0 = Math.max(rcz0, this.cellZ(bz0 - m));
      const cz1 = Math.min(rcz1, this.cellZ(bz1 + m));
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const rx = this.centerX(cx) - s.x;
          const rz = this.centerZ(cz) - s.z;
          const lx = rx * c - rz * sn;
          const lz = rx * sn + rz * c;
          if (Math.abs(lx) <= s.hx + m && Math.abs(lz) <= s.hz + m) {
            const i = cz * n + cx;
            if (cost[i] !== BLOCKED) cost[i] = pen === BLOCKED ? BLOCKED : Math.min(254, cost[i] + pen);
          }
        }
      }
    }
  }

  // Dynamic soft obstacle (e.g. a wreck): blocks vehicles, slows infantry.
  markObstacle(x, z, radius) {
    const n = this.n;
    const r = Math.ceil(radius / this.res);
    const cx = this.cellX(x);
    const cz = this.cellZ(z);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const xx = cx + dx;
        const zz = cz + dz;
        if (xx < 0 || zz < 0 || xx >= n || zz >= n) continue;
        if (Math.hypot(dx, dz) * this.res > radius + this.res * 0.5) continue;
        const i = zz * n + xx;
        this.cost[1][i] = BLOCKED;
        this.cost[2][i] = BLOCKED;
        if (this.cost[0][i] !== BLOCKED) this.cost[0][i] = Math.min(254, this.cost[0][i] + 10);
      }
    }
    this.version++;
  }

  passable(x, z, cls) {
    return this.cost[cls][this.cellZ(z) * this.n + this.cellX(x)] !== BLOCKED;
  }

  costAt(x, z, cls) {
    return this.cost[cls][this.cellZ(z) * this.n + this.cellX(x)];
  }

  // Nearest passable cell centre to (x, z) by ring search; null if none nearby.
  nearestPassable(x, z, cls, maxRing = 12) {
    const cx = this.cellX(x);
    const cz = this.cellZ(z);
    const cost = this.cost[cls];
    const n = this.n;
    if (cost[cz * n + cx] !== BLOCKED) return { x, z };
    for (let r = 1; r <= maxRing; r++) {
      let best = null;
      let bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const xx = cx + dx;
          const zz = cz + dz;
          if (xx < 0 || zz < 0 || xx >= n || zz >= n) continue;
          if (cost[zz * n + xx] === BLOCKED) continue;
          const d = dx * dx + dz * dz;
          if (d < bestD) {
            bestD = d;
            best = { x: this.centerX(xx), z: this.centerZ(zz) };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  // Straight-line walkability (Bresenham-ish sampling every half cell).
  lineWalkable(ax, az, bx, bz, cls, maxCost = 60) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / (this.res * 0.5));
    const cost = this.cost[cls];
    for (let s = 0; s <= steps; s++) {
      const t = s / Math.max(1, steps);
      const c = cost[this.cellZ(az + (bz - az) * t) * this.n + this.cellX(ax + (bx - ax) * t)];
      if (c === BLOCKED || c > maxCost) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ A*
  heapPush(node, f) {
    let i = this.heapSize++;
    const heap = this.heap;
    const hf = this.heapF;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hf[p] <= f) break;
      heap[i] = heap[p];
      hf[i] = hf[p];
      i = p;
    }
    heap[i] = node;
    hf[i] = f;
  }

  heapPop() {
    const heap = this.heap;
    const hf = this.heapF;
    const top = heap[0];
    const lastN = heap[--this.heapSize];
    const lastF = hf[this.heapSize];
    let i = 0;
    const size = this.heapSize;
    while (true) {
      let c = 2 * i + 1;
      if (c >= size) break;
      if (c + 1 < size && hf[c + 1] < hf[c]) c++;
      if (hf[c] >= lastF) break;
      heap[i] = heap[c];
      hf[i] = hf[c];
      i = c;
    }
    heap[i] = lastN;
    hf[i] = lastF;
    return top;
  }

  // Returns an array of {x, z} waypoints (smoothed) or null.
  // opts: { threat: {grid, n, res, weight}, maxNodes, heuristicWeight, allowPartial }
  findPath(sx, sz, tx, tz, cls, opts = {}) {
    const n = this.n;
    const cost = this.cost[cls];
    let start = this.nearestPassable(sx, sz, cls, 6);
    let goal = this.nearestPassable(tx, tz, cls, 16);
    if (!start || !goal) return null;
    const s = this.cellZ(start.z) * n + this.cellX(start.x);
    const gcx = this.cellX(goal.x);
    const gcz = this.cellZ(goal.z);
    const gIdx = gcz * n + gcx;
    const maxNodes = opts.maxNodes ?? 24000;
    const hw = opts.heuristicWeight ?? 1.35;
    const threat = opts.threat || null;
    const search = ++this.search;
    if (search >= 0xfffffff0) {
      this.seen.fill(0);
      this.closed.fill(0);
      this.search = 1;
    }
    const sid = this.search;
    const g = this.g;
    const from = this.from;
    const seen = this.seen;
    const closed = this.closed;
    this.heapSize = 0;
    g[s] = 0;
    from[s] = -1;
    seen[s] = sid;
    const h = (cx, cz) => {
      const dx = Math.abs(cx - gcx);
      const dz = Math.abs(cz - gcz);
      return (Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz)) * 10 * hw;
    };
    this.heapPush(s, h(s % n, (s / n) | 0));
    let expanded = 0;
    let best = s;
    let bestH = Infinity;
    let found = false;
    while (this.heapSize > 0) {
      const cur = this.heapPop();
      if (closed[cur] === sid) continue;
      closed[cur] = sid;
      if (cur === gIdx) {
        found = true;
        break;
      }
      const cx = cur % n;
      const cz = (cur / n) | 0;
      const hc = h(cx, cz);
      if (hc < bestH) {
        bestH = hc;
        best = cur;
      }
      if (++expanded > maxNodes) break;
      const gc = g[cur];
      for (let k = 0; k < 8; k++) {
        const nb = NEIGH[k];
        const nx = cx + nb[0];
        const nz = cz + nb[1];
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const ni = nz * n + nx;
        const c = cost[ni];
        if (c === BLOCKED || closed[ni] === sid) continue;
        // No corner cutting past blocked cells.
        if (nb[2] !== 1 && (cost[cz * n + nx] === BLOCKED || cost[nz * n + cx] === BLOCKED)) continue;
        let step = c * nb[2];
        if (threat !== null) {
          const tc = clamp(Math.floor((this.centerX(nx) + this.half) / threat.res), 0, threat.n - 1) + clamp(Math.floor((this.centerZ(nz) + this.half) / threat.res), 0, threat.n - 1) * threat.n;
          step += threat.grid[tc] * threat.weight * nb[2];
        }
        const ng = gc + step;
        if (seen[ni] !== sid || ng < g[ni]) {
          seen[ni] = sid;
          g[ni] = ng;
          from[ni] = cur;
          this.heapPush(ni, ng + h(nx, nz));
        }
      }
    }
    let end = found ? gIdx : best;
    if (!found && opts.allowPartial === false) return null;
    if (end === s) return [{ x: goal.x, z: goal.z }];
    // Reconstruct.
    const cells = [];
    for (let c = end; c !== -1; c = from[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => ({ x: this.centerX(c % n), z: this.centerZ((c / n) | 0) }));
    if (found) pts[pts.length - 1] = { x: goal.x, z: goal.z };
    return this.smooth(pts, cls);
  }

  // String pulling: keep only waypoints needed to stay on walkable cells.
  smooth(pts, cls) {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let anchor = 0;
    let i = 2;
    while (i < pts.length) {
      const a = pts[anchor];
      const b = pts[i];
      const span = i - anchor;
      if (span > 40 || !this.lineWalkable(a.x, a.z, b.x, b.z, cls, cls === 0 ? 40 : 50)) {
        out.push(pts[i - 1]);
        anchor = i - 1;
      }
      i++;
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
}

// Queue of path requests processed with a time budget per frame.
export class PathService {
  constructor(nav) {
    this.nav = nav;
    this.queue = [];
    this.stats = { solved: 0, ms: 0 };
  }

  request(owner, sx, sz, tx, tz, cls, opts, cb) {
    // Replace any pending request from the same owner.
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].owner === owner) {
        this.queue[i] = { owner, sx, sz, tx, tz, cls, opts, cb };
        return;
      }
    }
    this.queue.push({ owner, sx, sz, tx, tz, cls, opts, cb });
  }

  cancel(owner) {
    this.queue = this.queue.filter((q) => q.owner !== owner);
  }

  pending(owner) {
    return this.queue.some((q) => q.owner === owner);
  }

  update(budgetMs = 4) {
    const t0 = performance.now();
    while (this.queue.length > 0 && performance.now() - t0 < budgetMs) {
      const q = this.queue.shift();
      const path = this.nav.findPath(q.sx, q.sz, q.tx, q.tz, q.cls, q.opts || {});
      this.stats.solved++;
      q.cb(path);
    }
    this.stats.ms = performance.now() - t0;
  }
}
