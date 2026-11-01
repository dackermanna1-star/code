// Grid navigation: A* over 0.5m cells with door-aware passability, wall clearance costs
// and line-of-sight path smoothing (string pulling).
export class NavGrid {
  constructor(bounds, cellSize = 0.5) {
    this.bounds = bounds;
    this.cs = cellSize;
    this.w = Math.ceil((bounds.x1 - bounds.x0) / cellSize);
    this.h = Math.ceil((bounds.z1 - bounds.z0) / cellSize);
    const n = this.w * this.h;
    this.blocked = new Uint8Array(n);      // 1 = static obstacle
    this.door = new Int16Array(n).fill(-1); // door index occupying the cell
    this.extra = new Float32Array(n);       // additional traversal cost (near walls)
    this.opaque = new Uint8Array(n);        // blocks line of sight
    this.zone = new Int16Array(n).fill(-1); // room index
    // A* scratch
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Int32Array(n);
    this.closed = new Int32Array(n);
    this.searchId = 0;
    this.heap = new Int32Array(n);
    this.heapF = new Float32Array(n);
    this.doors = [];                        // door objects (with .canPass(agent))
  }
  idx(cx, cz) { return cz * this.w + cx; }
  cellX(x) { return Math.floor((x - this.bounds.x0) / this.cs); }
  cellZ(z) { return Math.floor((z - this.bounds.z0) / this.cs); }
  centerX(cx) { return this.bounds.x0 + (cx + 0.5) * this.cs; }
  centerZ(cz) { return this.bounds.z0 + (cz + 0.5) * this.cs; }
  inside(cx, cz) { return cx >= 0 && cz >= 0 && cx < this.w && cz < this.h; }

  /** Mark cells whose centres fall inside the rectangle expanded by `inflate`. */
  markRect(minX, minZ, maxX, maxZ, inflate, fn) {
    const c0 = Math.max(0, this.cellX(minX - inflate)), c1 = Math.min(this.w - 1, this.cellX(maxX + inflate));
    const r0 = Math.max(0, this.cellZ(minZ - inflate)), r1 = Math.min(this.h - 1, this.cellZ(maxZ + inflate));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const x = this.centerX(c), z = this.centerZ(r);
      const dx = Math.max(minX - x, 0, x - maxX), dz = Math.max(minZ - z, 0, z - maxZ);
      if (dx * dx + dz * dz < inflate * inflate || (dx === 0 && dz === 0)) fn(this.idx(c, r));
    }
  }
  computeClearanceCosts() {
    const { w, h } = this;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const i = this.idx(c, r);
      if (this.blocked[i]) continue;
      let near = 0;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const cc = c + dc, rr = r + dr;
        if (!this.inside(cc, rr) || this.blocked[this.idx(cc, rr)]) {
          const d = Math.max(Math.abs(dc), Math.abs(dr));
          near = Math.max(near, d === 1 ? 2 : 1);
        }
      }
      this.extra[i] = near === 2 ? 0.9 : near === 1 ? 0.3 : 0;
    }
  }

  passable(i, agent) {
    if (this.blocked[i]) return false;
    const d = this.door[i];
    if (d >= 0) { const door = this.doors[d]; if (door && !door.canPass(agent)) return false; }
    return true;
  }
  walkableAt(x, z, agent = null) {
    const cx = this.cellX(x), cz = this.cellZ(z);
    return this.inside(cx, cz) && this.passable(this.idx(cx, cz), agent);
  }
  zoneAt(x, z) {
    const cx = this.cellX(x), cz = this.cellZ(z);
    return this.inside(cx, cz) ? this.zone[this.idx(cx, cz)] : -1;
  }
  /** Nearest passable cell centre (spiral search). */
  nearestWalkable(x, z, agent = null, maxRadius = 12) {
    const cx = this.cellX(x), cz = this.cellZ(z);
    if (this.inside(cx, cz) && this.passable(this.idx(cx, cz), agent)) return [x, z];
    let best = null, bestD = Infinity;
    for (let rad = 1; rad <= maxRadius; rad++) {
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== rad) continue;
        const c = cx + dx, r = cz + dz;
        if (!this.inside(c, r) || !this.passable(this.idx(c, r), agent)) continue;
        const px = this.centerX(c), pz = this.centerZ(r);
        const d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < bestD) { bestD = d; best = [px, pz]; }
      }
      if (best) return best;
    }
    return null;
  }

  _push(i, f) {
    let n = this.heapSize++;
    const heap = this.heap, hf = this.heapF;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (hf[p] <= f) break;
      heap[n] = heap[p]; hf[n] = hf[p]; n = p;
    }
    heap[n] = i; hf[n] = f;
  }
  _pop() {
    const heap = this.heap, hf = this.heapF;
    const top = heap[0];
    const lastI = heap[--this.heapSize], lastF = hf[this.heapSize];
    let n = 0;
    const size = this.heapSize;
    while (true) {
      let c = 2 * n + 1;
      if (c >= size) break;
      if (c + 1 < size && hf[c + 1] < hf[c]) c++;
      if (hf[c] >= lastF) break;
      heap[n] = heap[c]; hf[n] = hf[c]; n = c;
    }
    if (size > 0) { heap[n] = lastI; hf[n] = lastF; }
    return top;
  }

  /**
   * Find a path from (sx,sz) to (tx,tz). Returns an array of [x,z] waypoints (smoothed),
   * excluding the start, or null when unreachable.
   */
  findPath(sx, sz, tx, tz, agent = null, maxExpand = 60000) {
    let s = this.nearestWalkable(sx, sz, agent, 4);
    let t = this.nearestWalkable(tx, tz, agent, 8);
    if (!s || !t) return null;
    const scx = this.cellX(s[0]), scz = this.cellZ(s[1]);
    const tcx = this.cellX(t[0]), tcz = this.cellZ(t[1]);
    const start = this.idx(scx, scz), goal = this.idx(tcx, tcz);
    if (start === goal) return [[tx, tz]];
    const id = ++this.searchId;
    const { w } = this;
    this.heapSize = 0;
    this.g[start] = 0; this.seen[start] = id; this.parent[start] = -1;
    const H = (i) => {
      const dx = Math.abs((i % w) - tcx), dz = Math.abs(((i / w) | 0) - tcz);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    this._push(start, H(start));
    let expanded = 0, found = false;
    while (this.heapSize > 0) {
      const cur = this._pop();
      if (this.closed[cur] === id) continue;
      this.closed[cur] = id;
      if (cur === goal) { found = true; break; }
      if (++expanded > maxExpand) break;
      const cx = cur % w, cz = (cur / w) | 0;
      for (let k = 0; k < 8; k++) {
        const dx = DX[k], dz = DZ[k];
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= this.h) continue;
        const ni = nz * w + nx;
        if (this.closed[ni] === id || !this.passable(ni, agent)) continue;
        if (dx !== 0 && dz !== 0) {
          if (!this.passable(cz * w + nx, agent) || !this.passable(nz * w + cx, agent)) continue;
        }
        const ng = this.g[cur] + (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1) + this.extra[ni];
        if (this.seen[ni] !== id || ng < this.g[ni]) {
          this.seen[ni] = id; this.g[ni] = ng; this.parent[ni] = cur;
          this._push(ni, ng + H(ni) * 1.05);
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = goal; i !== -1; i = this.parent[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map((i) => [this.centerX(i % w), this.centerZ((i / w) | 0)]);
    pts[pts.length - 1] = this.walkableAt(tx, tz, agent) ? [tx, tz] : t;
    return this.smooth([s[0], s[1]], pts, agent);
  }

  /** Remove waypoints that are directly reachable (with clearance) from earlier ones. */
  smooth(start, pts, agent) {
    const out = [];
    let anchor = start, i = 0;
    while (i < pts.length) {
      let far = i;
      for (let j = pts.length - 1; j > i; j--) {
        if (this.lineClear(anchor[0], anchor[1], pts[j][0], pts[j][1], agent)) { far = j; break; }
      }
      out.push(pts[far]);
      anchor = pts[far];
      i = far + 1;
    }
    return out;
  }
  /** Walkability along a segment, checked with a small lateral clearance. */
  lineClear(x0, z0, x1, z1, agent, clearance = 0.18) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    if (len < 1e-4) return true;
    const steps = Math.ceil(len / (this.cs * 0.5));
    const px = (-dz / len) * clearance, pz = (dx / len) * clearance;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps, x = x0 + dx * t, z = z0 + dz * t;
      if (!this.walkableAt(x, z, agent) || !this.walkableAt(x + px, z + pz, agent) || !this.walkableAt(x - px, z - pz, agent)) return false;
    }
    return true;
  }
  /** Line of sight through non-opaque cells (DDA). */
  sightClear(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    const steps = Math.ceil(len / (this.cs * 0.5));
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const cx = this.cellX(x0 + dx * t), cz = this.cellZ(z0 + dz * t);
      if (!this.inside(cx, cz)) return false;
      const i = this.idx(cx, cz);
      if (this.opaque[i]) return false;
      const d = this.door[i];
      if (d >= 0 && this.doors[d] && this.doors[d].opaque && this.doors[d].amount < 0.5) return false;
    }
    return true;
  }
}
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
