// Bot navigation graph, generated from the collision world: a 32-unit grid of
// standable spots discovered by flood fill from the spawns, linked by walk / drop /
// jump edges. A* pathfinding + string pulling.

import { TraceResult, MASK_WORLD_PLAYER } from '../engine/collision.js';
import { HULL_STAND } from '../engine/pmove.js';

const CELL = 32;
const STEP = 18;
const MAX_DROP = 260;
const MAX_JUMP = 40;
// offsets tried inside a cell whose centre doesn't fit a player
// floor under the centre of a standing spot: spots supported only at the hull's
// edge (tops of thin walls and parapets, lips of ledges) can be crossed but are
// expensive to walk along, where a player keeps sliding off
const SUPPORT = [[0, 0], [14, 0], [-14, 0], [0, 14], [0, -14]];
const NUDGE = [[0, 0], [9, 0], [-9, 0], [0, 9], [0, -9], [9, 9], [-9, 9], [9, -9], [-9, -9], [14, 0], [-14, 0], [0, 14], [0, -14]];

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

  addNode(ix, iy, z, x = null, y = null) {
    const n = { id: this.nodes.length, x: x ?? this.bounds[0] + (ix + 0.5) * CELL, y: y ?? this.bounds[1] + (iy + 0.5) * CELL, z, ix, iy, edges: [] };
    this.nodes.push(n);
    const k = this.key(ix, iy);
    let l = this.columns.get(k);
    if (!l) this.columns.set(k, l = []);
    l.push(n);
    return n;
  }

  // Can a standing player get from node n to (x, y)? Walk (step-up height) or
  // jump; then drop to the floor there. Returns { z, kind } or null.
  step(n, x, y, diag) {
    const h = HULL_STAND, a = this._sa || (this._sa = [0, 0, 0]), b = this._sb || (this._sb = [0, 0, 0]);
    let kind = 'walk';
    // flat first (rooms barely taller than a player), then lifted by a step
    a[0] = n.x; a[1] = n.y; a[2] = n.z + 36 + 1;
    b[0] = x; b[1] = y; b[2] = a[2];
    this.world.trace(a, b, h.mins, h.maxs, MASK_WORLD_PLAYER, this.tr);
    if (this.tr.fraction < 1 || this.tr.startsolid) {
      a[2] = n.z + 36 + STEP + 1; b[2] = a[2];
      this.world.trace(a, b, h.mins, h.maxs, MASK_WORLD_PLAYER, this.tr);
    }
    if (this.tr.fraction < 1 || this.tr.startsolid) {
      a[2] = n.z + 36 + MAX_JUMP + 1; b[2] = a[2];
      if (this.world.testBox(a, h.mins, h.maxs, MASK_WORLD_PLAYER)) return null;
      this.world.trace(a, b, h.mins, h.maxs, MASK_WORLD_PLAYER, this.tr);
      if (this.tr.fraction < 1 || this.tr.startsolid) return null;
      kind = 'jump';
    }
    if (diag) {
      // diagonal: both orthogonal neighbours must be passable too (avoid corner cutting)
      if (this.world.testBox([x, n.y, a[2]], h.mins, h.maxs, MASK_WORLD_PLAYER) || this.world.testBox([n.x, y, a[2]], h.mins, h.maxs, MASK_WORLD_PLAYER)) return null;
    }
    this.world.trace(b, [x, y, b[2] - 36 - MAX_DROP - STEP], h.mins, h.maxs, MASK_WORLD_PLAYER, this.tr);
    if (this.tr.fraction >= 1 || this.tr.startsolid || this.tr.normal[2] < 0.7) return null;
    const z = this.tr.endpos[2] - 36;
    const dz = z - n.z;
    if (kind === 'jump' && dz < STEP) return null; // jump only needed to get up
    if (dz < -STEP - 2) kind = 'drop';
    return { z, kind };
  }

  // 0: no floor under the middle of the hull; 1: top of a thin wall (floor drops
  // away on both sides); 2: on a lip; 5: solid ground
  support(x, y, z) {
    const t = this.tr2 || (this.tr2 = new TraceResult());
    const hit = (ox, oy) => {
      this.world.trace([x + ox, y + oy, z + 4], [x + ox, y + oy, z - 24], [0, 0, 0], [0, 0, 0], MASK_WORLD_PLAYER, t);
      return t.fraction < 1 && !t.startsolid;
    };
    let c = 0;
    for (const [ox, oy] of SUPPORT) if (hit(ox, oy)) c++;
    if (!c) return 0;
    if ((!hit(26, 0) && !hit(-26, 0)) || (!hit(0, 26) && !hit(0, -26))) return 1;
    return c >= 4 ? 5 : 2;
  }

  /** m was expanded before n existed: give it the edge back to n when that move works. */
  linkBack(m, n, diag) {
    if (m.edges.some((e) => e.to === n.id)) return;
    const r = this.step(m, n.x, n.y, diag);
    if (r && Math.abs(r.z - n.z) < 24) this.link(m, n, r.kind);
  }

  link(n, m, kind) {
    if (n.edges.some((e) => e.to === m.id)) return;
    const dist = Math.hypot(m.x - n.x, m.y - n.y, (m.z - n.z) * 0.5);
    n.edges.push({ to: m.id, kind, cost: kind === 'jump' ? dist * 2 + 40 : dist });
  }

  // Flood fill from seed positions (feet positions).
  build(seeds) {
    const queue = [];
    for (const s of seeds) {
      const ix = Math.floor((s[0] - this.bounds[0]) / CELL), iy = Math.floor((s[1] - this.bounds[1]) / CELL);
      const x = this.bounds[0] + (ix + 0.5) * CELL, y = this.bounds[1] + (iy + 0.5) * CELL;
      let z = this.dropToFloor(x, y, s[2] + 2), nx = x, ny = y;
      if (z == null) { z = this.dropToFloor(s[0], s[1], s[2] + 2); nx = s[0]; ny = s[1]; }
      if (z == null || this.nodeAt(ix, iy, z)) continue;
      queue.push(this.addNode(ix, iy, z, nx, ny));
    }
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (queue.length) {
      const n = queue.shift();
      for (const [dx, dy] of dirs) {
        const ix = n.ix + dx, iy = n.iy + dy;
        const cx = this.bounds[0] + (ix + 0.5) * CELL, cy = this.bounds[1] + (iy + 0.5) * CELL;
        if (cx < this.bounds[0] || cy < this.bounds[1] || cx > this.bounds[2] || cy > this.bounds[3]) continue;
        const diag = !!(dx && dy);
        // nodes already in that cell: link when the straight move works
        let done = false;
        const col = this.columns.get(this.key(ix, iy));
        if (col) {
          for (const m of col) {
            if (m.z - n.z > MAX_JUMP + 4 || n.z - m.z > MAX_DROP + STEP) continue;
            const r = this.step(n, m.x, m.y, diag);
            if (r && Math.abs(r.z - m.z) < 24) { this.link(n, m, r.kind); this.linkBack(m, n, diag); done = true; break; }
          }
        }
        if (done) continue;
        // the cell centre, else a position nudged inside the cell (lets the graph
        // through gaps a 32-unit grid can't line up with: 64-wide passages,
        // half-open doors)
        let best = null;
        for (const [ox, oy] of NUDGE) {
          const r = this.step(n, cx + ox, cy + oy, diag);
          if (!r) continue;
          const m = this.nodeAt(ix, iy, r.z);
          if (m) {
            const r2 = this.step(n, m.x, m.y, diag);
            if (r2 && Math.abs(r2.z - m.z) < 24) { this.link(n, m, r2.kind); this.linkBack(m, n, diag); }
            best = null;
            break;
          }
          // prefer a spot with floor under its centre
          const sup = this.support(cx + ox, cy + oy, r.z);
          if (sup > 0 && (!best || sup > best.sup)) best = { x: cx + ox, y: cy + oy, r, sup };
          if (sup >= 5) break;
        }
        if (best) {
          const m = this.addNode(ix, iy, best.r.z, best.x, best.y);
          m.support = best.sup;
          queue.push(m);
          this.link(n, m, best.r.kind);
        }
      }
    }
    // node clearance (distance to walls) for path preference
    for (const n of this.nodes) n.wallPenalty = (n.edges.length < 8 ? (8 - n.edges.length) * 6 : 0) + ((n.support ?? 5) === 1 ? 160 : (n.support ?? 5) === 2 ? 30 : 0);
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

  // Nearest node by horizontal distance within maxDist, ignoring nodes more than
  // dzMax above/below pos (used to snap hand-placed waypoints to the graph).
  nearestXY(pos, maxDist = 200, dzMax = 96) {
    const ix = Math.floor((pos[0] - this.bounds[0]) / CELL), iy = Math.floor((pos[1] - this.bounds[1]) / CELL);
    const r = Math.ceil(maxDist / CELL);
    let best = null, bd = Infinity;
    for (let x = ix - r; x <= ix + r; x++) for (let y = iy - r; y <= iy + r; y++) {
      const l = this.columns.get(this.key(x, y));
      if (!l) continue;
      for (const n of l) {
        const dz = Math.abs(n.z - pos[2]);
        if (dz > dzMax) continue;
        const d = Math.hypot(n.x - pos[0], n.y - pos[1]) + dz * 0.35;
        if (d < bd) { bd = d; best = n; }
      }
    }
    return bd <= maxDist ? best : null;
  }

  // Nodes reachable from `start` within `radius` (path length), breadth first.
  // Returns [{ node, dist }] in increasing distance; at most `limit` entries.
  around(start, radius, limit = 400) {
    if (!start) return [];
    const seen = new Map([[start.id, 0]]);
    const out = [{ node: start, dist: 0 }];
    for (let i = 0; i < out.length && out.length < limit; i++) {
      const { node, dist } = out[i];
      for (const e of node.edges) {
        if (e.kind === 'jump') continue;
        const m = this.nodes[e.to];
        const d = dist + Math.hypot(m.x - node.x, m.y - node.y);
        if (d > radius || seen.has(m.id)) continue;
        seen.set(m.id, d);
        out.push({ node: m, dist: d });
      }
    }
    return out;
  }

  // Length of a node path (sum of edge lengths), or Infinity for no path.
  pathLength(path) {
    if (!path) return Infinity;
    let l = 0;
    for (let i = 1; i < path.length; i++) l += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    return l;
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
  canWalk(p, q, margin = 0) {
    const h = margin ? { mins: [-16 - margin, -16 - margin, -36], maxs: [16 + margin, 16 + margin, 36] } : HULL_STAND;
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
    if (!path || path.length < 2) return path ? path.map((n) => [n.x, n.y, n.z, 'walk', n.id]) : null;
    const pts = path.map((n, i) => [n.x, n.y, n.z, i > 0 ? (path[i - 1].edges.find((e) => e.to === n.id)?.kind || 'walk') : 'walk', n.id]);
    const out = [];
    let cur = startFeet || pts[0];
    let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 12);
      for (; j > i + 1; j--) {
        let ok = true;
        for (let k = i + 1; k <= j; k++) if (pts[k][3] !== 'walk') { ok = false; break; }
        if (ok && this.canWalk(cur, pts[j], 4)) break;
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
