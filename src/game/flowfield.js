import { Vec3, clamp } from '../physics/math.js';

/**
 * Distance field over a walkable grid toward one goal (the player), shared by every zombie: one
 * Dijkstra from the goal's cell (re-run a few times a second), then each zombie walks downhill from
 * its own cell. A route is the descent line simplified to a few waypoints by line of sight, so the
 * gait gets smooth legs around the columns and benches instead of a staircase of grid cells.
 *
 * The walkable mask comes from `isFree(x, z)` (sampled at cell centres, after the obstacles are
 * grown by the body's half-width); it is rebuilt when the layout changes (a train stops or leaves).
 */
export class FlowField {
  constructor(rect, opts = {}) {
    this.res = opts.res ?? 0.25;
    this.minX = rect.minX;
    this.minZ = rect.minZ;
    this.nx = Math.ceil((rect.maxX - rect.minX) / this.res);
    this.nz = Math.ceil((rect.maxZ - rect.minZ) / this.res);
    const n = this.nx * this.nz;
    this.free = new Uint8Array(n);
    this.dist = new Float32Array(n).fill(Infinity);
    this.goalCell = -1;
    this.goal = new Vec3();
    this.version = -1;
    this.buckets = null;
  }

  cell(x, z) {
    const i = Math.floor((x - this.minX) / this.res), j = Math.floor((z - this.minZ) / this.res);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }

  centre(c, out = new Vec3()) {
    const i = c % this.nx, j = (c / this.nx) | 0;
    return out.set(this.minX + (i + 0.5) * this.res, 0, this.minZ + (j + 0.5) * this.res);
  }

  /** Rebuild the walkable mask: `isFree(x, z)` true where a body can stand and pass. */
  rebuild(isFree, version) {
    const { nx, nz, res, free } = this;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) free[j * nx + i] = isFree(this.minX + (i + 0.5) * res, this.minZ + (j + 0.5) * res) ? 1 : 0;
    }
    this.version = version;
    this.goalCell = -1;
  }

  /** Nearest walkable cell to (x, z) within a few cells, or -1. */
  nearestFree(x, z, reach = 6) {
    const c = this.cell(x, z);
    if (c >= 0 && this.free[c]) return c;
    const i0 = Math.floor((x - this.minX) / this.res), j0 = Math.floor((z - this.minZ) / this.res);
    let best = -1, bd = Infinity;
    for (let dj = -reach; dj <= reach; dj++) {
      for (let di = -reach; di <= reach; di++) {
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
        const k = j * this.nx + i;
        if (!this.free[k]) continue;
        const d = di * di + dj * dj;
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
    }
    return best;
  }

  /** Distances (m) from every walkable cell to the goal (8-neighbour, bucketed Dijkstra). */
  update(goal) {
    const g = this.nearestFree(goal.x, goal.z, 8);
    this.goal.copy(goal);
    if (g < 0) {
      this.goalCell = -1;
      return false;
    }
    const { nx, nz, free, dist } = this;
    dist.fill(Infinity);
    this.goalCell = g;
    // integer costs (orthogonal 10, diagonal 14) in a circular bucket queue: linear time
    const B = 15;
    const buckets = this.buckets || (this.buckets = Array.from({ length: B }, () => []));
    for (const b of buckets) b.length = 0;
    const cost = new Int32Array(nx * nz).fill(0x7fffffff);
    cost[g] = 0;
    buckets[0].push(g);
    let cur = 0, pending = 1;
    const di = [1, -1, 0, 0, 1, 1, -1, -1], dj = [0, 0, 1, -1, 1, -1, 1, -1], dc = [10, 10, 10, 10, 14, 14, 14, 14];
    while (pending > 0) {
      const bucket = buckets[cur % B];
      while (bucket.length) {
        const c = bucket.pop();
        pending--;
        if (cost[c] !== cur) continue;
        const i = c % nx, j = (c / nx) | 0;
        for (let k = 0; k < 8; k++) {
          const ii = i + di[k], jj = j + dj[k];
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          const n = jj * nx + ii;
          if (!free[n]) continue;
          // no corner cutting past a blocked cell
          if (k >= 4 && (!free[j * nx + ii] || !free[jj * nx + i])) continue;
          const nc = cur + dc[k];
          if (nc < cost[n]) {
            cost[n] = nc;
            buckets[nc % B].push(n);
            pending++;
          }
        }
      }
      cur++;
    }
    for (let c = 0; c < nx * nz; c++) if (cost[c] !== 0x7fffffff) dist[c] = cost[c] * this.res * 0.1;
    return true;
  }

  /** Is the goal of the field near `p` (so routes to `p` can use it)? */
  covers(p) {
    return this.goalCell >= 0 && Math.hypot(p.x - this.goal.x, p.z - this.goal.z) < 1.5;
  }

  /** Straight walkable line between cells a and b (grid ray march)? */
  lineFree(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / (this.res * 0.5));
    for (let k = 1; k <= n; k++) {
      const t = k / n, c = this.cell(ax + (bx - ax) * t, az + (bz - az) * t);
      if (c < 0 || !this.free[c]) return false;
    }
    return true;
  }

  /**
   * Route from `from` toward the goal along the field: up to three waypoints, the last one the
   * goal itself (`to`). Null when `from` is not connected to the goal.
   */
  pathFrom(from, to) {
    let c = this.nearestFree(from.x, from.z, 4);
    if (c < 0 || !isFinite(this.dist[c])) return null;
    const { nx, nz, dist } = this;
    const out = [];
    let ax = from.x, az = from.z;
    const p = new Vec3();
    for (let leg = 0; leg < 3; leg++) {
      if (this.lineFree(ax, az, to.x, to.z)) break;
      // walk downhill, remembering the furthest cell still in plain view of the leg's start
      let seen = -1;
      for (let steps = 0; steps < 400 && c !== this.goalCell; steps++) {
        const i = c % nx, j = (c / nx) | 0;
        let best = c, bd = dist[c];
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di, jj = j + dj;
            if ((!di && !dj) || ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
            const n = jj * nx + ii;
            if (dist[n] < bd) {
              bd = dist[n];
              best = n;
            }
          }
        }
        if (best === c) break;
        c = best;
        this.centre(c, p);
        if (this.lineFree(ax, az, p.x, p.z)) seen = c;
        else if (seen >= 0) break;
      }
      if (seen < 0) break;
      this.centre(seen, p);
      out.push(p.clone());
      ax = p.x;
      az = p.z;
      c = seen;
    }
    out.push(new Vec3(to.x, 0, to.z));
    return out;
  }
}

/** Grows blocked boxes by `r` for the walkable test. */
export function freeTest(boxes, floorOk, r = 0.3) {
  return (x, z) => {
    if (!floorOk(x, z)) return false;
    for (const b of boxes) {
      if (b.max.y < 0.15 || b.min.y > 1.8) continue; // floors and things overhead
      if (x > b.min.x - r && x < b.max.x + r && z > b.min.z - r && z < b.max.z + r) return false;
    }
    return true;
  };
}

export { clamp };
