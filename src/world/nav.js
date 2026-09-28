// Layered navigation grid generated from collision geometry.
// Each XZ column can hold several walkable surfaces (multi-storey buildings,
// stairwells). Nodes are linked in 8 directions with walk / climb / drop links.
// Provides time-sliced multi-source flow fields (for hordes), static distance
// fields (chapter progress, distance-to-exit) and A* for survivor bots.
import { F_SOLID, F_NONAV } from './collision.js';

export const LINK_WALK = 0, LINK_CLIMB = 1, LINK_DROP = 2;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const DIAG_ORTHO = { 4: [0, 2], 5: [0, 3], 6: [1, 2], 7: [1, 3] };
const STEP = 0.55, CLIMB_MAX = 3.4, DROP_MAX = 8, CLEAR_H = 1.75, CLEAR_R = 0.235;

class Heap {
  constructor(cap = 1 << 16) { this.n = new Int32Array(cap); this.k = new Float32Array(cap); this.size = 0; }
  clear() { this.size = 0; }
  push(node, key) {
    if (this.size >= this.n.length) {
      const nn = new Int32Array(this.n.length * 2); nn.set(this.n); this.n = nn;
      const nk = new Float32Array(this.k.length * 2); nk.set(this.k); this.k = nk;
    }
    let i = this.size++;
    const N = this.n, K = this.k;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p] <= key) break;
      N[i] = N[p]; K[i] = K[p]; i = p;
    }
    N[i] = node; K[i] = key;
  }
  pop() {
    const N = this.n, K = this.k;
    const top = N[0];
    this.topKey = K[0];
    const ln = N[--this.size], lk = K[this.size];
    let i = 0;
    const half = this.size >> 1;
    while (i < half) {
      let c = 2 * i + 1;
      if (c + 1 < this.size && K[c + 1] < K[c]) c++;
      if (K[c] >= lk) break;
      N[i] = N[c]; K[i] = K[c]; i = c;
    }
    N[i] = ln; K[i] = lk;
    return top;
  }
}

export class NavGrid {
  constructor(col, bounds, cs = 0.5) {
    this.col = col;
    this.cs = cs;
    this.minX = Math.floor(bounds.minX) - 1;
    this.minZ = Math.floor(bounds.minZ) - 1;
    this.minY = bounds.minY - 1;
    this.maxY = bounds.maxY + 1;
    this.nx = Math.ceil((bounds.maxX - this.minX + 1) / cs);
    this.nz = Math.ceil((bounds.maxZ - this.minZ + 1) / cs);
    this.fields = {};
    this.doorOf = null;
    this.blocked = null; // dynamic node blocking (Uint8Array)
  }

  build() {
    const { col, cs, nx, nz } = this;
    const colStart = new Int32Array(nx * nz + 1);
    let cap = nx * nz;
    let nodeY = new Float32Array(cap);
    let n = 0;
    const tops = [];
    const b = col.b;
    for (let cz = 0; cz < nz; cz++) {
      for (let cx = 0; cx < nx; cx++) {
        const c = cz * nx + cx;
        colStart[c] = n;
        const x = this.minX + (cx + 0.5) * cs, z = this.minZ + (cz + 0.5) * cs;
        const k = col.query(x - 0.02, this.minY, z - 0.02, x + 0.02, this.maxY, z + 0.02, F_SOLID);
        if (k === 0) continue;
        tops.length = 0;
        const bots = this._bots || (this._bots = []);
        bots.length = 0;
        for (let j = 0; j < k; j++) {
          const i = col.scratch[j];
          bots.push(b[i * 6 + 1], b[i * 6 + 4]); // every box through the column (for occlusion)
          if (col.flags[i] & F_NONAV) continue;
          tops.push(b[i * 6 + 4]);
        }
        tops.sort((p, q) => p - q);
        // merge surfaces closer than 8 cm, keeping the highest (stacked finishes / slabs)
        const merged = this._merged || (this._merged = []);
        merged.length = 0;
        for (const y of tops) {
          if (merged.length && y - merged[merged.length - 1] < 0.08) merged[merged.length - 1] = y;
          else merged.push(y);
        }
        for (const y of merged) {
          // covered: another box containing the column centre spans through this surface
          let covered = false;
          for (let q = 0; q < bots.length; q += 2) if (bots[q] <= y + 0.05 && bots[q + 1] > y + 0.05) { covered = true; break; }
          if (covered) continue;
          // head clearance (anything taller than a step within the body radius)
          const kk = col.query(x - CLEAR_R, y + STEP, z - CLEAR_R, x + CLEAR_R, y + CLEAR_H, z + CLEAR_R, F_SOLID);
          if (kk > 0) continue;
          // floating low obstacles right above the surface (bench seats, table rails)
          const k2 = col.query(x - 0.05, y + 0.08, z - 0.05, x + 0.05, y + STEP, z + 0.05, F_SOLID);
          let floating = false;
          for (let j = 0; j < k2; j++) { const i = col.scratch[j]; if (b[i * 6 + 1] > y + 0.05) { floating = true; break; } }
          if (floating) continue;
          if (n >= cap) {
            cap *= 2;
            const ny = new Float32Array(cap); ny.set(nodeY); nodeY = ny;
          }
          nodeY[n++] = y;
        }
      }
    }
    colStart[nx * nz] = n;
    this.N = n;
    this.colStart = colStart;
    this.nodeY = nodeY.slice(0, n);
    this.nodeCol = new Int32Array(n);
    for (let c = 0; c < nx * nz; c++) for (let i = colStart[c]; i < colStart[c + 1]; i++) this.nodeCol[i] = c;
    // links
    const links = new Int32Array(n * 8).fill(-1);
    const ltype = new Uint8Array(n * 8);
    for (let i = 0; i < n; i++) {
      const c = this.nodeCol[i];
      const cx = c % nx, cz = (c / nx) | 0;
      const y = this.nodeY[i];
      const x = this.minX + (cx + 0.5) * cs, z = this.minZ + (cz + 0.5) * cs;
      for (let d = 0; d < 8; d++) {
        const ax = cx + DIRS[d][0], az = cz + DIRS[d][1];
        if (ax < 0 || az < 0 || ax >= nx || az >= nz) continue;
        const c2 = az * nx + ax;
        let best = -1, bestDy = 1e9, bestType = -1;
        const x2 = this.minX + (ax + 0.5) * cs, z2 = this.minZ + (az + 0.5) * cs;
        for (let m = colStart[c2]; m < colStart[c2 + 1]; m++) {
          const dy = this.nodeY[m] - y;
          const ady = Math.abs(dy);
          if (ady <= STEP) {
            if (bestType !== 0 || ady < bestDy) { best = m; bestDy = ady; bestType = 0; }
          } else if (d < 4 && bestType !== 0 && ady < bestDy) {
            if (dy > STEP && dy <= CLIMB_MAX) {
              // climb: headroom above the current column and above the target surface
              if (col.query(x - 0.15, y + CLEAR_H, z - 0.15, x + 0.15, this.nodeY[m] + CLEAR_H - 0.2, z + 0.15, F_SOLID) === 0 &&
                  col.query(x2 - 0.15, this.nodeY[m] + 0.1, z2 - 0.15, x2 + 0.15, this.nodeY[m] + CLEAR_H - 0.2, z2 + 0.15, F_SOLID) === 0) {
                best = m; bestDy = ady; bestType = 1;
              }
            } else if (dy < -STEP && dy >= -DROP_MAX) {
              if (col.query(x2 - 0.15, this.nodeY[m] + CLEAR_H, z2 - 0.15, x2 + 0.15, y + CLEAR_H, z2 + 0.15, F_SOLID) === 0) {
                best = m; bestDy = ady; bestType = 2;
              }
            }
          }
        }
        // vault: nothing reachable in the adjacent column (thin wall top, clearance
        // gap beside a parapet) -> drop to a surface two columns away if the
        // column in between is empty below us and clear above us.
        if (best < 0 && d < 4) {
          const bx = cx + DIRS[d][0] * 2, bz = cz + DIRS[d][1] * 2;
          let pit = false;
          for (let m = colStart[c2]; m < colStart[c2 + 1]; m++) if (this.nodeY[m] < y + STEP) { pit = true; break; }
          if (!pit && bx >= 0 && bz >= 0 && bx < nx && bz < nz &&
              col.query(x2 - 0.15, y + 0.1, z2 - 0.15, x2 + 0.15, y + CLEAR_H, z2 + 0.15, F_SOLID) === 0) {
            const c3 = bz * nx + bx;
            const x3 = this.minX + (bx + 0.5) * cs, z3 = this.minZ + (bz + 0.5) * cs;
            for (let m = colStart[c3]; m < colStart[c3 + 1]; m++) {
              const dy = this.nodeY[m] - y;
              if (dy < -STEP && dy >= -DROP_MAX && -dy < bestDy &&
                  col.query(x3 - 0.15, this.nodeY[m] + CLEAR_H, z3 - 0.15, x3 + 0.15, y + CLEAR_H, z3 + 0.15, F_SOLID) === 0) {
                best = m; bestDy = -dy; bestType = 2;
              }
            }
          }
        }
        if (best >= 0) {
          links[i * 8 + d] = best;
          ltype[i * 8 + d] = bestType;
        }
      }
    }
    // prune diagonal links that cut corners
    for (let i = 0; i < n; i++) {
      for (let d = 4; d < 8; d++) {
        if (links[i * 8 + d] < 0) continue;
        if (ltype[i * 8 + d] !== LINK_WALK) { links[i * 8 + d] = -1; continue; }
        const ox = DIAG_ORTHO[d][0], oz = DIAG_ORTHO[d][1];
        if (links[i * 8 + ox] < 0 || ltype[i * 8 + ox] !== 0 || links[i * 8 + oz] < 0 || ltype[i * 8 + oz] !== 0) links[i * 8 + d] = -1;
      }
    }
    this.links = links;
    this.ltype = ltype;
    this.doorOf = new Int16Array(n).fill(-1);
    this.blocked = new Uint8Array(n);
    this.heap = new Heap(1 << 16);
    // Connected-component labels (walk+drop graph) for spawn validation
    this.flow = new FlowField(this);
  }

  colIndex(x, z) {
    const cx = Math.floor((x - this.minX) / this.cs), cz = Math.floor((z - this.minZ) / this.cs);
    if (cx < 0 || cz < 0 || cx >= this.nx || cz >= this.nz) return -1;
    return cz * this.nx + cx;
  }
  nodeX(i) { return this.minX + ((this.nodeCol[i] % this.nx) + 0.5) * this.cs; }
  nodeZ(i) { return this.minZ + (((this.nodeCol[i] / this.nx) | 0) + 0.5) * this.cs; }

  // Node whose surface best supports a body at (x,y,z) (feet position).
  nodeAt(x, y, z) {
    const c = this.colIndex(x, z);
    if (c < 0) return -1;
    let best = -1, bestScore = 1e9;
    for (let m = this.colStart[c]; m < this.colStart[c + 1]; m++) {
      const dy = y - this.nodeY[m];
      // prefer surfaces slightly below feet
      const score = dy >= -0.6 ? Math.abs(dy) : Math.abs(dy) * 4 + 2;
      if (score < bestScore && Math.abs(dy) < 3) { bestScore = score; best = m; }
    }
    return best;
  }
  nearestNode(x, y, z, maxR = 3) {
    const n = this.nodeAt(x, y, z);
    if (n >= 0) return n;
    const cs = this.cs;
    const R = Math.ceil(maxR / cs);
    let best = -1, bd = 1e9;
    const ccx = Math.floor((x - this.minX) / cs), ccz = Math.floor((z - this.minZ) / cs);
    for (let r = 1; r <= R; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const cx = ccx + dx, cz = ccz + dz;
          if (cx < 0 || cz < 0 || cx >= this.nx || cz >= this.nz) continue;
          const c = cz * this.nx + cx;
          for (let m = this.colStart[c]; m < this.colStart[c + 1]; m++) {
            const dy = Math.abs(this.nodeY[m] - y);
            if (dy > 2.2) continue;
            const d = dx * dx + dz * dz + dy * dy * 4;
            if (d < bd) { bd = d; best = m; }
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  // Full (synchronous) Dijkstra, for static fields.
  computeStatic(name, sources, opts = {}) {
    const dist = new Float32Array(this.N).fill(1e9);
    const h = this.heap;
    h.clear();
    for (const s of sources) {
      const n = this.nearestNode(s[0], s[1], s[2], 4);
      if (n >= 0) { dist[n] = 0; h.push(n, 0); }
    }
    const reverse = opts.reverse !== false; // distances measured for travel TOWARDS sources
    this._dijkstra(dist, h, Infinity, opts.survivor ?? true, 1e9);
    this.fields[name] = dist;
    return dist;
  }

  // Reverse adjacency (incoming edges) in CSR form so distance fields handle one-way links (drops).
  buildReverse() {
    const N = this.N, L = this.links, T = this.ltype;
    const cnt = new Int32Array(N + 1);
    for (let u = 0; u < N; u++) for (let d = 0; d < 8; d++) { const v = L[u * 8 + d]; if (v >= 0) cnt[v + 1]++; }
    for (let i = 0; i < N; i++) cnt[i + 1] += cnt[i];
    const src = new Int32Array(cnt[N]);
    const typ = new Uint8Array(cnt[N]);
    const dia = new Uint8Array(cnt[N]);
    const fill = cnt.slice();
    for (let u = 0; u < N; u++) for (let d = 0; d < 8; d++) {
      const v = L[u * 8 + d];
      if (v < 0) continue;
      const k = fill[v]++;
      src[k] = u; typ[k] = T[u * 8 + d]; dia[k] = d >= 4 ? 1 : 0;
    }
    this.revStart = cnt; this.revSrc = src; this.revType = typ; this.revDiag = dia;
  }

  // Multi-source Dijkstra: dist[w] = cost of travelling from w to the nearest source.
  _dijkstra(dist, h, budget, survivorMode, limit) {
    if (!this.revStart) this.buildReverse();
    const RS = this.revStart, RSrc = this.revSrc, RT = this.revType, RD = this.revDiag, Y = this.nodeY;
    const cs = this.cs;
    let processed = 0;
    while (h.size > 0) {
      const u = h.pop();
      const du = h.topKey;
      if (du > dist[u]) continue;
      if (du > limit) continue;
      for (let k = RS[u], e = RS[u + 1]; k < e; k++) {
        const w = RSrc[k];
        const t = RT[k];
        // edge w -> u
        let cost = RD[k] ? 1.414 : 1;
        if (t === LINK_CLIMB) {
          if (survivorMode) continue;
          cost += 1.5 + (Y[u] - Y[w]) * 0.8;
        } else if (t === LINK_DROP) {
          if (survivorMode && Y[w] - Y[u] > 4.2) continue;
          cost += 0.6;
        }
        if (this.blocked[w]) cost += 30;
        const nd = du + cost * cs;
        if (nd < dist[w]) { dist[w] = nd; h.push(w, nd); }
      }
      if (++processed >= budget) return false;
    }
    return true;
  }

  // Direction of travel descending a field from node n. Returns neighbour node or -1.
  descend(field, n) {
    let best = -1, bd = field[n];
    for (let d = 0; d < 8; d++) {
      const v = this.links[n * 8 + d];
      if (v < 0) continue;
      if (field[v] < bd) { bd = field[v]; best = v; }
    }
    return best;
  }

  // A* for survivor bots. Returns array of node indices (start..goal) or null.
  findPath(sx, sy, sz, gx, gy, gz, maxExpand = 30000) {
    const s = this.nearestNode(sx, sy, sz, 2), g = this.nearestNode(gx, gy, gz, 3);
    if (s < 0 || g < 0) return null;
    if (s === g) return [s];
    if (!this._g || this._g.length !== this.N) {
      this._g = new Float32Array(this.N);
      this._came = new Int32Array(this.N);
      this._seen = new Uint32Array(this.N);
      this._stamp = 0;
      this._heapA = new Heap(1 << 14);
    }
    const st = ++this._stamp;
    const G = this._g, came = this._came, seen = this._seen, h = this._heapA;
    h.clear();
    const gxn = this.nodeX(g), gzn = this.nodeZ(g), gyn = this.nodeY[g];
    const heur = (n) => {
      const dx = this.nodeX(n) - gxn, dz = this.nodeZ(n) - gzn, dy = this.nodeY[n] - gyn;
      return Math.sqrt(dx * dx + dz * dz + dy * dy) * 1.05;
    };
    G[s] = 0; came[s] = -1; seen[s] = st;
    h.push(s, heur(s));
    let exp = 0;
    let found = false;
    let closest = s, closestH = heur(s);
    while (h.size > 0 && exp < maxExpand) {
      const u = h.pop();
      if (u === g) { found = true; break; }
      exp++;
      const gu = G[u];
      for (let d = 0; d < 8; d++) {
        const v = this.links[u * 8 + d];
        if (v < 0) continue;
        const t = this.ltype[u * 8 + d];
        if (t === LINK_CLIMB) continue; // survivors cannot climb high ledges
        if (t === LINK_DROP && this.nodeY[u] - this.nodeY[v] > 4.2) continue;
        let cost = (d < 4 ? 1 : 1.414) * this.cs;
        if (t === LINK_DROP) cost += 2;
        if (this.blocked[v]) cost += 20;
        const ng = gu + cost;
        if (seen[v] !== st || ng < G[v]) {
          seen[v] = st;
          G[v] = ng;
          came[v] = u;
          const hv = heur(v);
          if (hv < closestH) { closestH = hv; closest = v; }
          h.push(v, ng + hv);
        }
      }
    }
    const end = found ? g : closest;
    const path = [];
    let c = end;
    let guard = 0;
    while (c >= 0 && guard++ < 100000) { path.push(c); c = came[c]; if (c === s) { path.push(s); break; } }
    path.reverse();
    path.partial = !found;
    return path;
  }

  // Line walk test on the nav grid (for path smoothing): same-height walkable straight line?
  walkable(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.ceil(len / (this.cs * 0.5));
    let y = ay;
    let prev = this.nodeAt(ax, ay, az);
    if (prev < 0) return false;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + dx * t, z = az + dz * t;
      // side clearance: sample perpendicular offsets
      const n = this.nodeAt(x, y, z);
      if (n < 0) return false;
      if (Math.abs(this.nodeY[n] - y) > STEP) return false;
      if (n !== prev) {
        // must be linked (walk) to previous
        let ok = false;
        for (let d = 0; d < 8; d++) if (this.links[prev * 8 + d] === n && this.ltype[prev * 8 + d] === 0) { ok = true; break; }
        if (!ok) return false;
      }
      y = this.nodeY[n];
      prev = n;
    }
    return true;
  }
}

// Time-sliced multi-source flow field towards survivors. Double buffered.
export class FlowField {
  constructor(nav) {
    this.nav = nav;
    this.cur = new Float32Array(nav.N).fill(1e9);
    this.next = new Float32Array(nav.N).fill(1e9);
    this.heap = new Heap(1 << 15);
    this.building = false;
    this.limit = 90; // metres
    this.version = 0;
  }
  start(sources) {
    this.next.fill(1e9);
    this.heap.clear();
    for (const n of sources) {
      if (n < 0) continue;
      this.next[n] = 0;
      this.heap.push(n, 0);
    }
    this.building = true;
  }
  step(budget = 12000) {
    if (!this.building) return true;
    const done = this.nav._dijkstra(this.next, this.heap, budget, false, this.limit);
    if (done) {
      const t = this.cur; this.cur = this.next; this.next = t;
      this.building = false;
      this.version++;
    }
    return done;
  }
}
