import type { Arena } from './arena';
import { STEP_UP } from './arena';

/**
 * Ways round things, for the big levels: a grid of where a body can stand (0.4 m cells, a few
 * floors stacked in each - the yard, a container's roof, a gallery over a dance floor), the cells
 * joined where one floor runs into the next within a step, and A* across it.
 *
 * Fighters steer straight at what they want whenever the straight line is walkable (most of the
 * time) and only follow a planned way round when it isn't: a stack of containers between a guard
 * and the noise he heard, a wall between a thug and the woman he's after.
 */
const CELL = 0.4;
/** A body's half-width and height (what has to fit in a cell for it to be open). */
const CLEAR = 0.3;
const HEAD = 1.7;
/** The most a step from one cell to the next may rise or fall. */
const RISE = 0.5;
/** Floors stacked in one column. */
const MAXL = 4;
const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export interface NavPoint {
  x: number;
  y: number;
  z: number;
}

export class NavGrid {
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  /** Floor heights per node (node = column * MAXL + floor), NaN past a column's count. */
  readonly h: Float32Array;
  /** Floors in each column. */
  readonly n: Uint8Array;
  /** Built in (ms). */
  readonly buildMs: number;
  // the search's scratch (stamped, so nothing is cleared between searches)
  private gs: Float32Array;
  private from: Int32Array;
  private seen: Uint32Array;
  private shut: Uint32Array;
  private stamp = 0;
  private heap: Int32Array;
  private hf: Float32Array;
  private hn = 0;

  /** Ladders, as jumps in the grid from the foot to the top and back (node -> [node, cost]). */
  private links = new Map<number, [number, number][]>();
  constructor(private a: Arena) {
    const t0 = performance.now();
    const b = a.bounds;
    this.x0 = b.minX;
    this.z0 = b.minZ;
    this.nx = Math.max(1, Math.ceil((b.maxX - b.minX) / CELL));
    this.nz = Math.max(1, Math.ceil((b.maxZ - b.minZ) / CELL));
    const N = this.nx * this.nz * MAXL;
    this.h = new Float32Array(N).fill(NaN);
    this.n = new Uint8Array(this.nx * this.nz);
    this.gs = new Float32Array(N);
    this.from = new Int32Array(N);
    this.seen = new Uint32Array(N);
    this.shut = new Uint32Array(N);
    this.heap = new Int32Array(N);
    this.hf = new Float32Array(N);
    this.build();
    this.buildLinks();
    this.buildMs = performance.now() - t0;
  }
  private buildLinks() {
    this.links.clear();
    for (const l of this.a.ladders) {
      const lx = Math.sin(l.yaw), lz = Math.cos(l.yaw);
      const foot = this.nearestOpen(l.x - lx * 0.36, l.z - lz * 0.36, l.y0, 0.8);
      const top = this.nearestOpen(l.x + lx * 0.6, l.z + lz * 0.6, l.y1, 0.9);
      if (foot < 0 || top < 0) continue;
      const cost = (l.y1 - l.y0) * 2.5 / CELL;
      for (const [a, b] of [[foot, top], [top, foot]]) {
        let list = this.links.get(a);
        if (!list) this.links.set(a, (list = []));
        list.push([b, cost]);
      }
    }
  }

  // ------------------------------------------------------------------ the floors
  private build() {
    this.cols(0, this.nx - 1, 0, this.nz - 1);
  }
  /** Something changed in this box (a gate opened, a crate went): its cells again. */
  rebuild(minX: number, maxX: number, minZ: number, maxZ: number) {
    const m = CLEAR + CELL;
    const i0 = Math.max(0, Math.floor((minX - m - this.x0) / CELL)), i1 = Math.min(this.nx - 1, Math.floor((maxX + m - this.x0) / CELL));
    const j0 = Math.max(0, Math.floor((minZ - m - this.z0) / CELL)), j1 = Math.min(this.nz - 1, Math.floor((maxZ + m - this.z0) / CELL));
    if (i0 > i1 || j0 > j1) return;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const c = j * this.nx + i;
        this.n[c] = 0;
        for (let l = 0; l < MAXL; l++) this.h[c * MAXL + l] = NaN;
      }
    this.cols(i0, i1, j0, j1);
    this.buildLinks();
  }
  private cols(i0: number, i1: number, j0: number, j1: number) {
    const a = this.a;
    const cand: number[] = [];
    for (let j = j0; j <= j1; j++) {
      const z = this.z0 + (j + 0.5) * CELL;
      for (let i = i0; i <= i1; i++) {
        const x = this.x0 + (i + 0.5) * CELL;
        cand.length = 0;
        // the ground (or a pit), the tops of what's walked on, the stairs
        const g0 = a.groundAt(x, z, 0.05, 0.1);
        if (g0 > -1) cand.push(g0);
        for (const o of a.near(x, z, 0)) {
          if (!o.walk || x < o.minX || x > o.maxX || z < o.minZ || z > o.maxZ) continue;
          cand.push((o.y0 ?? 0) + o.h);
        }
        for (const r of a.ramps) {
          if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
          const k = r.axis === 'x' ? (x - r.minX) / Math.max(1e-6, r.maxX - r.minX) : (z - r.minZ) / Math.max(1e-6, r.maxZ - r.minZ);
          cand.push(r.y0 + (r.y1 - r.y0) * k);
        }
        if (!cand.length) continue;
        cand.sort((p, q) => p - q);
        const col = j * this.nx + i;
        let c = 0;
        let last = -1e9;
        for (const y of cand) {
          if (y - last < 0.08 || c >= MAXL) continue;
          // (the floor from here, not one under a box on top of it; with room to stand)
          if (Math.abs(a.groundAt(x, z, y + 0.02, 0.04) - y) > 0.05) continue;
          if (this.blocked(x, z, y)) continue;
          // (nor the boards under a flight of stairs: a body walking in there is on the stairs, or in them)
          if (this.underRamp(x, z, y)) continue;
          this.h[col * MAXL + c++] = y;
          last = y;
        }
        this.n[col] = c;
      }
    }
  }
  /**
   * Inside a flight of stairs: the steps are solid from the flight's foot up to its treads, so a
   * floor under them (or one whose body would put its head in them) is no floor.
   */
  private underRamp(x: number, z: number, y: number) {
    for (const r of this.a.ramps) {
      if (x < r.minX - CLEAR || x > r.maxX + CLEAR || z < r.minZ - CLEAR || z > r.maxZ + CLEAR) continue;
      // (where the body's edge meets it: beside the flight's low end is only beside it)
      const cx = Math.max(r.minX, Math.min(x, r.maxX)), cz = Math.max(r.minZ, Math.min(z, r.maxZ));
      const k = r.axis === 'x' ? (cx - r.minX) / Math.max(1e-6, r.maxX - r.minX) : (cz - r.minZ) / Math.max(1e-6, r.maxZ - r.minZ);
      const ry = r.y0 + (r.y1 - r.y0) * k;
      const base = Math.min(r.y0, r.y1);
      const inside = x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
      if (ry > y + 0.05 && y + HEAD > base && (inside || ry > y + STEP_UP)) return true;
    }
    return false;
  }
  /** Something in the way of a body standing at (x, z) on a floor at y. */
  private blocked(x: number, z: number, y: number) {
    for (const o of this.a.near(x, z, CLEAR + 0.05)) {
      const y0 = o.y0 ?? 0, top = y0 + o.h;
      if (top <= y + (o.walk ? STEP_UP : 0.02) || y0 >= y + HEAD) continue;
      const cx = Math.max(o.minX, Math.min(x, o.maxX));
      const cz = Math.max(o.minZ, Math.min(z, o.maxZ));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < CLEAR * CLEAR) return true;
    }
    return false;
  }

  /** The column at (x, z) (-1 outside the grid). */
  col(x: number, z: number) {
    const i = Math.floor((x - this.x0) / CELL), j = Math.floor((z - this.z0) / CELL);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }
  /** The node for a body at (x, y, z): its column's floor nearest y within `tol` (-1: none). */
  node(x: number, z: number, y: number, tol = 0.7) {
    const c = this.col(x, z);
    if (c < 0) return -1;
    return this.layer(c, y, tol);
  }
  private layer(c: number, y: number, tol: number) {
    let best = -1;
    let bd = tol;
    for (let l = 0; l < this.n[c]; l++) {
      const d = Math.abs(this.h[c * MAXL + l] - y);
      if (d <= bd) {
        bd = d;
        best = c * MAXL + l;
      }
    }
    return best;
  }
  /**
   * The nearest standing room to (x, y, z) within r (a goal inside a crate: the crate's side; a body
   * squeezed into a corner: the floor beside it) - on this side of any wall, never through one.
   */
  nearestOpen(x: number, z: number, y: number, r = 2): number {
    const direct = this.node(x, z, y);
    if (direct >= 0) return direct;
    const i0 = Math.floor((x - this.x0) / CELL), j0 = Math.floor((z - this.z0) / CELL);
    const R = Math.ceil(r / CELL);
    const cand: [number, number][] = [];
    for (let dj = -R; dj <= R; dj++)
      for (let di = -R; di <= R; di++) {
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
        const d = di * di + dj * dj;
        if (d > R * R) continue;
        const nd = this.layer(j * this.nx + i, y, 0.7);
        if (nd >= 0) cand.push([d, nd]);
      }
    cand.sort((p, q) => p[0] - q[0]);
    for (const [, nd] of cand) {
      const p = this.point(nd);
      if (this.a.lineOfSight(x, y + 0.6, z, p.x, p.y + 0.6, p.z)) return nd;
    }
    return -1;
  }
  point(node: number): NavPoint {
    const c = Math.floor(node / MAXL);
    const i = c % this.nx, j = Math.floor(c / this.nx);
    return { x: this.x0 + (i + 0.5) * CELL, y: this.h[node], z: this.z0 + (j + 0.5) * CELL };
  }

  // ------------------------------------------------------------------ the straight line
  /**
   * Can a body walk straight from a to b? Every cell the line crosses has a floor within a step of
   * the last one (and room to stand on it).
   */
  clearLine(ax: number, ay: number, az: number, bx: number, bz: number): boolean {
    let c = this.col(ax, az);
    if (c < 0) return true;
    let y = ay;
    let cur = this.layer(c, y, 0.7);
    // (standing where the grid says nobody fits - squeezed against a wall: the rest of the line is
    // judged from her own height; the cell she's in doesn't count against it)
    if (cur >= 0) y = this.h[cur];
    // through the cells the segment crosses (Amanatides & Woo)
    let i = Math.floor((ax - this.x0) / CELL), j = Math.floor((az - this.z0) / CELL);
    const ti = Math.floor((bx - this.x0) / CELL), tj = Math.floor((bz - this.z0) / CELL);
    const dx = bx - ax, dz = bz - az;
    const si = dx > 0 ? 1 : -1, sj = dz > 0 ? 1 : -1;
    const ddx = Math.abs(dx) < 1e-9 ? Infinity : CELL / Math.abs(dx);
    const ddz = Math.abs(dz) < 1e-9 ? Infinity : CELL / Math.abs(dz);
    let tx = Math.abs(dx) < 1e-9 ? Infinity : ((si > 0 ? this.x0 + (i + 1) * CELL - ax : ax - (this.x0 + i * CELL)) / Math.abs(dx));
    let tz = Math.abs(dz) < 1e-9 ? Infinity : ((sj > 0 ? this.z0 + (j + 1) * CELL - az : az - (this.z0 + j * CELL)) / Math.abs(dz));
    for (let n = 0; n < 4000 && (i !== ti || j !== tj); n++) {
      if (tx < tz) {
        i += si;
        tx += ddx;
      } else {
        j += sj;
        tz += ddz;
      }
      if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return false;
      c = j * this.nx + i;
      cur = this.layer(c, y, RISE);
      if (cur < 0) return false;
      y = this.h[cur];
    }
    return true;
  }

  // ------------------------------------------------------------------ the way round
  /** A way from a to b (corners only, b last), or null when there isn't one. */
  find(ax: number, ay: number, az: number, bx: number, by: number, bz: number, maxExpand = 60000, ladders = false): NavPoint[] | null {
    const s = this.nearestOpen(ax, az, ay, 1.2);
    const t = this.nearestOpen(bx, bz, by, 2.4);
    if (s < 0 || t < 0) return null;
    if (s === t) return [{ x: bx, y: this.h[t], z: bz }];
    const st = ++this.stamp;
    const tc = Math.floor(t / MAXL);
    const ti = tc % this.nx, tj = Math.floor(tc / this.nx);
    const hEst = (node: number) => {
      const c = Math.floor(node / MAXL);
      const di = Math.abs((c % this.nx) - ti), dj = Math.abs(Math.floor(c / this.nx) - tj);
      return (Math.max(di, dj) + (Math.SQRT2 - 1) * Math.min(di, dj)) * 1.001;
    };
    this.hn = 0;
    this.gs[s] = 0;
    this.seen[s] = st;
    this.from[s] = -1;
    this.push(s, hEst(s));
    let found = false;
    let expanded = 0;
    while (this.hn > 0) {
      const u = this.pop();
      if (this.shut[u] === st) continue;
      this.shut[u] = st;
      if (u === t) {
        found = true;
        break;
      }
      if (++expanded > maxExpand) break;
      const c = Math.floor(u / MAXL);
      const i = c % this.nx, j = Math.floor(c / this.nx);
      const y = this.h[u];
      if (ladders) {
        const ls = this.links.get(u);
        if (ls)
          for (const [v, w] of ls) {
            if (this.shut[v] === st) continue;
            const gv = this.gs[u] + w;
            if (this.seen[v] === st && gv >= this.gs[v]) continue;
            this.seen[v] = st;
            this.gs[v] = gv;
            this.from[v] = u;
            this.push(v, gv + hEst(v));
          }
      }
      for (const [di, dj, w] of DIRS) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= this.nx || nj >= this.nz) continue;
        const nc = nj * this.nx + ni;
        // (no cutting a corner: both sides of a diagonal step open)
        if (di && dj && (this.layer(j * this.nx + ni, y, RISE) < 0 || this.layer(nj * this.nx + i, y, RISE) < 0)) continue;
        // (every floor of the next column within a step: the stairs' first tread, and the boards beside it)
        for (let l = 0; l < this.n[nc]; l++) {
          const v = nc * MAXL + l;
          if (Math.abs(this.h[v] - y) > RISE || this.shut[v] === st) continue;
          const g = this.gs[u] + w;
          if (this.seen[v] === st && g >= this.gs[v]) continue;
          this.seen[v] = st;
          this.gs[v] = g;
          this.from[v] = u;
          this.push(v, g + hEst(v));
        }
      }
    }
    if (!found) return null;
    const cells: number[] = [];
    for (let v = t; v >= 0; v = this.from[v]) cells.push(v);
    cells.reverse();
    // pulled tight: from each corner, as far along as the straight line reaches
    const pts = cells.map((v) => this.point(v));
    pts[pts.length - 1] = { x: bx, y: pts[pts.length - 1].y, z: bz };
    const out: NavPoint[] = [];
    let anchor = { x: ax, y: ay, z: az };
    let k = 0;
    while (k < pts.length - 1) {
      let m = k + 1;
      // (never across a change of floor - a ladder, a flight of stairs: those corners stay)
      while (m + 1 < pts.length && Math.abs(pts[m + 1].y - anchor.y) < 1.0 && Math.abs(pts[m + 1].y - pts[m].y) < 1.0 && this.clearLine(anchor.x, anchor.y, anchor.z, pts[m + 1].x, pts[m + 1].z)) m++;
      out.push(pts[m]);
      anchor = pts[m];
      k = m;
    }
    if (!out.length) out.push(pts[pts.length - 1]);
    return out;
  }
  private push(v: number, f: number) {
    let i = this.hn++;
    const H = this.heap, F = this.hf;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p] <= f) break;
      H[i] = H[p];
      F[i] = F[p];
      i = p;
    }
    H[i] = v;
    F[i] = f;
  }
  private pop(): number {
    const H = this.heap, F = this.hf;
    const top = H[0];
    const n = --this.hn;
    if (n > 0) {
      const v = H[n], f = F[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && F[c + 1] < F[c]) c++;
        if (F[c] >= f) break;
        H[i] = H[c];
        F[i] = F[c];
        i = c;
      }
      H[i] = v;
      F[i] = f;
    }
    return top;
  }
}

/**
 * One walker's use of the grid: straight at the target while the line's clear, else along a way
 * round (planned again when the target wanders off it, or now and then anyway).
 */
export class NavAgent {
  /** Plans may use ladders (the player can climb; the AI's men can't). */
  ladders = false;
  private path: NavPoint[] | null = null;
  private i = 0;
  private goalX = 0;
  private goalZ = 0;
  private age = 0;
  private direct = true;
  private checkT = Math.random() * 0.3;
  private lookT = 0;
  private failT = 0;
  /** Following a way round right now (not straight at the target). */
  get detouring() {
    return !this.direct && !!this.path;
  }
  reset() {
    this.path = null;
    this.direct = true;
    this.checkT = 0;
  }
  /** Where to head this frame, from (x, y, z) for (tx, ty, tz). */
  steer(nav: NavGrid, x: number, y: number, z: number, tx: number, ty: number, tz: number, dt: number): { x: number; z: number } {
    this.checkT -= dt;
    this.failT -= dt;
    this.lookT -= dt;
    this.age += dt;
    const moved = Math.hypot(tx - this.goalX, tz - this.goalZ);
    if (this.checkT <= 0 || (this.direct && moved > 2)) {
      this.checkT = 0.25 + Math.random() * 0.1;
      // (straight there only on the same floor: a target upstairs needs a way up)
      this.direct = Math.abs(ty - y) < 1.2 && nav.clearLine(x, y, z, tx, tz);
      if (this.direct) {
        this.path = null;
        this.goalX = tx;
        this.goalZ = tz;
      }
    }
    if (this.direct) return { x: tx, z: tz };
    if ((!this.path || moved > 1.5 || this.age > 3) && this.failT <= 0) {
      this.path = nav.find(x, y, z, tx, ty, tz, 60000, this.ladders);
      this.i = 0;
      this.age = 0;
      this.goalX = tx;
      this.goalZ = tz;
      if (!this.path) this.failT = 1.5;
    }
    const path = this.path;
    if (!path) return { x: tx, z: tz };
    // (a corner is reached on its own floor: under the top of a ladder is not at the top of it)
    while (this.i < path.length - 1 && Math.hypot(path[this.i].x - x, path[this.i].z - z) < 0.5 && Math.abs(path[this.i].y - y) < 1.0) this.i++;
    // (cut on to the next corner as soon as it's in a straight line - on this floor)
    if (this.i < path.length - 1 && this.lookT <= 0) {
      this.lookT = 0.15;
      const nx = path[this.i + 1];
      if (Math.abs(nx.y - y) < 1.0 && Math.abs(path[this.i].y - y) < 1.0 && nav.clearLine(x, y, z, nx.x, nx.z)) this.i++;
    }
    const p = path[this.i];
    return this.i === path.length - 1 ? { x: tx, z: tz } : { x: p.x, z: p.z };
  }
}
