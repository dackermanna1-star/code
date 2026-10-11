// Bot navigation graph, generated from the collision world: a 32-unit grid of
// standable spots discovered by flood fill from the spawns, linked by walk / drop /
// jump edges. A* pathfinding + string pulling.

import { TraceResult, MASK_WORLD_PLAYER } from '../engine/collision.js';
import { HULL_STAND } from '../engine/pmove.js';

const CELL = 32;
const STEP = 18;
const MAX_DROP = 260;
const MAX_JUMP = 40;

export class NavGraph {
  constructor(world, bounds) {
    this.world = world;
    this.bounds = bounds;
    this.nodes = []; // { id, x, y, z (floor), ix, iy, edges: [{to, kind, cost}] , area }
    this.columns = new Map(); // key ix,iy -> [nodes]
    this.tr = new TraceResult();
  }

  key(ix, iy) { return ix * 100000 + iy; }

  // floor z below (x, y, zTop) for a standing hull, or null
  dropToFloor(x, y, zTop, maxDrop = 4096) {
    const h = HULL_STAND;
    const start = [x, y, zTop + 36];
    if (this.world.testBox(start, h.mins, h.maxs, MASK_WORLD_PLAYER)) return null;
    const end = [x, y, zTop + 36 - maxDrop];
    this.world.trace(start, end, h.mins, h.maxs, MASK_WORLD_PLAYER, this.tr);
    if (this.tr.fraction >= 1 || this.tr.startsolid) return null;
    if (this.tr.normal[2] < 0.7) return null;
    return this.tr.endpos[2] - 36;
  }

  nodeAt(ix, iy, z) {
    const l = this.columns.get(this.key(ix, iy));
    if (!l) return null;
    for (const n of l) if (Math.abs(n.z - z) < 24) return n;
    return null;
  }

  addNode(ix, iy, z) {
    const n = { id: this.nodes.length, x: this.bounds[0] + (ix + 0.5) * CELL, y: this.bounds[1] + (iy + 0.5) * CELL, z, ix, iy, edges: [] };
    this.nodes.push(n);
    const k = this.key(ix, iy);
    let l = this.columns.get(k);
    if (!l) this.columns.set(k, l = []);
    l.push(n);
    return n;
  }

  // Flood fill from seed positions (feet positions).
  build(seeds) {
    const h = HULL_STAND;
    const queue = [];
    for (const s of seeds) {
      const ix = Math.floor((s[0] - this.bounds[0]) / CELL), iy = Math.floor((s[1] - this.bounds[1]) / CELL);
      const x = this.bounds[0] + (ix + 0.5) * CELL, y = this.bounds[1] + (iy + 0.5) * CELL;
      const z = this.dropToFloor(x, y, s[2] + 20);
      if (z == null || this.nodeAt(ix, iy, z)) continue;
      queue.push(this.addNode(ix, iy, z));
    }
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const a = [0, 0, 0], b = [0, 0, 0];
    while (queue.length) {
      const n = queue.shift();
      for (const [dx, dy] of dirs) {
        const ix = n.ix + dx, iy = n.iy + dy;
        const x = this.bounds[0] + (ix + 0.5) * CELL, y = this.bounds[1] + (iy + 0.5) * CELL;
        if (x < this.bounds[0] || y < this.bounds[1] || x > this.bounds[2] || y > this.bounds[3]) continue;
        // move horizontally at step height + jump allowance
        let kind = 'walk';
        a[0] = n.x; a[1] = n.y; a[2] = n.z + 36 + STEP + 1;
        b[0] = x; b[1] = y; b[2] = a[2];
        this.world.trace(a, b, h.mins, h.maxs, MASK_WORLD_PLAYER, this.tr);
        if (this.tr.fraction < 1 || this.tr.startsolid) {
          // try a jump
          a[2] = n.z + 36 + MAX_JUMP + 1; b[2] = a[2];
          if (this.world.testBox(a, h.mins, h.maxs, MASK_WORLD_PLAYER)) continue;
          this.world.trace(a, b, h.mins, h.maxs, MASK_WORLD_PLAYER, this.tr);
          if (this.tr.fraction < 1 || this.tr.startsolid) continue;
          kind = 'jump';
        }
        if (dx && dy) {
          // diagonal: both orthogonal neighbours must be passable too (avoid corner cutting)
          const ox = [n.x + dx * CELL, n.y, a[2]], oy = [n.x, n.y + dy * CELL, a[2]];
          if (this.world.testBox(ox, h.mins, h.maxs, MASK_WORLD_PLAYER) || this.world.testBox(oy, h.mins, h.maxs, MASK_WORLD_PLAYER)) continue;
        }
        this.world.trace(b, [x, y, b[2] - 36 - MAX_DROP - STEP], h.mins, h.maxs, MASK_WORLD_PLAYER, this.tr);
        if (this.tr.fraction >= 1 || this.tr.startsolid || this.tr.normal[2] < 0.7) continue;
        const z = this.tr.endpos[2] - 36;
        const dz = z - n.z;
        if (kind === 'jump' && dz < STEP) continue; // jump only needed to get up
        if (dz < -STEP - 2) kind = 'drop';
        let m = this.nodeAt(ix, iy, z);
        if (!m) {
          m = this.addNode(ix, iy, z);
          queue.push(m);
        }
        const dist = Math.hypot(m.x - n.x, m.y - n.y, (m.z - n.z) * 0.5);
        if (!n.edges.some((e) => e.to === m.id)) n.edges.push({ to: m.id, kind, cost: dist * (kind === 'jump' ? 2 : 1) });
      }
    }
    // node clearance (distance to walls) for path preference
    for (const n of this.nodes) n.wallPenalty = n.edges.length < 8 ? (8 - n.edges.length) * 6 : 0;
    return this;
  }

  nearest(pos, maxDist = 200) {
    const ix = Math.floor((pos[0] - this.bounds[0]) / CELL), iy = Math.floor((pos[1] - this.bounds[1]) / CELL);
    let best = null, bd = Infinity;
    for (let r = 0; r <= 4; r++) {
      for (let x = ix - r; x <= ix + r; x++) for (let y = iy - r; y <= iy + r; y++) {
        if (Math.max(Math.abs(x - ix), Math.abs(y - iy)) !== r) continue;
        const l = this.columns.get(this.key(x, y));
        if (!l) continue;
        for (const n of l) {
          const dz = pos[2] - n.z;
          if (dz < -40 || dz > 120) continue;
          const d = Math.hypot(n.x - pos[0], n.y - pos[1]) + Math.abs(dz) * 0.5;
          if (d < bd) { bd = d; best = n; }
        }
      }
      if (best && r >= 1) break;
    }
    return bd <= maxDist ? best : null;
  }

  // A* from node a to node b. Returns array of nodes or null.
  findPath(a, b, { avoid = null } = {}) {
    if (!a || !b) return null;
    const N = this.nodes.length;
    const g = this._g || (this._g = new Float64Array(N));
    const f = this._f || (this._f = new Float64Array(N));
    const from = this._from || (this._from = new Int32Array(N));
    const stamp = this._stamp || (this._stamp = new Int32Array(N));
    const closed = this._closed || (this._closed = new Int32Array(N));
    const run = (this._run = (this._run || 0) + 1);
    const heap = new MinHeap();
    const h = (n) => Math.hypot(n.x - b.x, n.y - b.y, n.z - b.z);
    g[a.id] = 0; f[a.id] = h(a); from[a.id] = -1; stamp[a.id] = run;
    heap.push(a.id, f[a.id]);
    let iter = 0;
    while (heap.size) {
      const id = heap.pop();
      if (closed[id] === run) continue;
      closed[id] = run;
      if (id === b.id) break;
      if (++iter > 20000) return null;
      const n = this.nodes[id];
      for (const e of n.edges) {
        const m = this.nodes[e.to];
        let cost = e.cost + m.wallPenalty;
        if (avoid) cost += avoid(m) || 0;
        const ng = g[id] + cost;
        if (stamp[m.id] !== run || ng < g[m.id]) {
          stamp[m.id] = run;
          g[m.id] = ng;
          from[m.id] = id;
          f[m.id] = ng + h(m);
          heap.push(m.id, f[m.id]);
        }
      }
    }
    if (stamp[b.id] !== run) return null;
    const path = [];
    for (let id = b.id; id !== -1; id = from[id]) path.push(this.nodes[id]);
    path.reverse();
    return path;
  }

  // Can a player walk straight from p to q (feet positions)? Used for string pulling.
  canWalk(p, q) {
    const h = HULL_STAND;
    if (Math.abs(q[2] - p[2]) > 64) return false;
    const steps = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 24);
    let z = p[2];
    const a = [0, 0, 0], b = [0, 0, 0];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t;
      const px = p[0] + (q[0] - p[0]) * (i - 1) / steps, py = p[1] + (q[1] - p[1]) * (i - 1) / steps;
      a[0] = px; a[1] = py; a[2] = z + 36 + STEP + 1;
      b[0] = x; b[1] = y; b[2] = a[2];
      this.world.trace(a, b, h.mins, h.maxs, MASK_WORLD_PLAYER, this.tr);
      if (this.tr.fraction < 1) return false;
      this.world.trace(b, [x, y, b[2] - 36 - STEP - 40], h.mins, h.maxs, MASK_WORLD_PLAYER, this.tr);
      if (this.tr.fraction >= 1 || this.tr.normal[2] < 0.7) return false;
      const nz = this.tr.endpos[2] - 36;
      if (nz < z - STEP - 2) return false; // would fall
      z = nz;
    }
    return Math.abs(z - q[2]) < 24;
  }

  smooth(path, startFeet) {
    if (!path || path.length < 2) return path ? path.map((n) => [n.x, n.y, n.z, 'walk']) : null;
    const pts = path.map((n, i) => [n.x, n.y, n.z, i > 0 ? (path[i - 1].edges.find((e) => e.to === n.id)?.kind || 'walk') : 'walk']);
    const out = [];
    let cur = startFeet || pts[0];
    let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 12);
      for (; j > i + 1; j--) {
        let ok = true;
        for (let k = i + 1; k <= j; k++) if (pts[k][3] !== 'walk') { ok = false; break; }
        if (ok && this.canWalk(cur, pts[j])) break;
      }
      out.push(pts[j]);
      cur = pts[j];
      i = j;
    }
    return out;
  }
}

class MinHeap {
  constructor() { this.ids = []; this.ks = []; }
  get size() { return this.ids.length; }
  push(id, k) {
    const a = this.ids, ks = this.ks;
    let i = a.length;
    a.push(id); ks.push(k);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (ks[p] <= k) break;
      a[i] = a[p]; ks[i] = ks[p];
      i = p;
    }
    a[i] = id; ks[i] = k;
  }
  pop() {
    const a = this.ids, ks = this.ks;
    const top = a[0];
    const lastId = a.pop(), lastK = ks.pop();
    if (a.length) {
      let i = 0;
      const n = a.length;
      while (true) {
        let l = i * 2 + 1, r = l + 1, m = i;
        let mk = lastK;
        if (l < n && ks[l] < mk) { m = l; mk = ks[l]; }
        if (r < n && ks[r] < mk) { m = r; mk = ks[r]; }
        if (m === i) break;
        a[i] = a[m]; ks[i] = ks[m];
        i = m;
      }
      a[i] = lastId; ks[i] = lastK;
    }
    return top;
  }
}
