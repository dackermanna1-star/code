// HOLDOUT — the chase field: one distance field over the open part of the valley toward the
// player, rebuilt as the player moves. Every walking zombie descends it, so no zombie plans a path
// of its own and the whole horde finds its way round buildings, through the gaps in fences and
// over the bridges to wherever the player is.
//
// A full rebuild over every open area is a Dijkstra across up to ~70 000 cells (a few ms), so it
// runs a slice per physics step into a second buffer; the zombies keep using the last finished
// field (at most a fraction of a second old) and steer straight at the player when close.

const SQ2 = Math.SQRT2;
const OFF = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

export class ChaseField {
  /** grid: a walkability grid { minX, minZ, cell, nx, nz, data } (layout.buildWalkGrid). */
  constructor(grid) {
    this.grid = grid;
    this.res = grid.cell;
    this.minX = grid.minX;
    this.minZ = grid.minZ;
    this.nx = grid.nx;
    this.nz = grid.nz;
    const n = this.nx * this.nz;
    this.mask = new Uint8Array(n); // walkable and inside an open area
    this.dist = new Float32Array(n).fill(Infinity); // the finished field
    this.work = new Float32Array(n).fill(Infinity); // the one being built
    this.hk = new Float32Array(n * 2);
    this.hv = new Int32Array(n * 2);
    this.hn = 0;
    this.busy = false;
    this.src = { x: 0, z: 0 };
    this.building = { x: 0, z: 0 };
    this.age = Infinity; // seconds since the finished field's source was sampled
    this.version = 0; // finished builds
    this.box = { i0: 0, i1: this.nx - 1, j0: 0, j1: this.nz - 1 }; // open cells' bounds
  }

  cellOf(x, z) {
    const i = Math.floor((x - this.minX) / this.res), j = Math.floor((z - this.minZ) / this.res);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }

  /** Open ground at (x, z): walkable and inside an open area. */
  free(x, z) {
    const c = this.cellOf(x, z);
    return c >= 0 && this.mask[c] === 1;
  }

  /** The open areas changed: rect list [{minX, maxX, minZ, maxZ}]. Restarts the build. */
  setOpen(rects) {
    const { nx, res, mask, grid } = this;
    mask.fill(0);
    let i0 = Infinity, i1 = -1, j0 = Infinity, j1 = -1;
    for (const r of rects) {
      const a0 = Math.max(0, Math.ceil((r.minX - this.minX) / res - 0.5)), a1 = Math.min(nx - 1, Math.floor((r.maxX - this.minX) / res - 0.5));
      const b0 = Math.max(0, Math.ceil((r.minZ - this.minZ) / res - 0.5)), b1 = Math.min(this.nz - 1, Math.floor((r.maxZ - this.minZ) / res - 0.5));
      for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) mask[j * nx + i] = grid.data[j * nx + i];
      i0 = Math.min(i0, a0);
      i1 = Math.max(i1, a1);
      j0 = Math.min(j0, b0);
      j1 = Math.max(j1, b1);
    }
    this.box = { i0, i1, j0, j1 };
    this.busy = false;
    this.age = Infinity;
  }

  /** Begin a build from (x, z): every open cell within 2.5 m of it is a source at its distance. */
  start(x, z) {
    const { nx, res, mask, work, box } = this;
    for (let j = box.j0; j <= box.j1; j++) work.fill(Infinity, j * nx + box.i0, j * nx + box.i1 + 1);
    this.hn = 0;
    const ci = Math.floor((x - this.minX) / res), cj = Math.floor((z - this.minZ) / res);
    const R = Math.ceil(2.5 / res);
    let seeded = 0;
    for (let dj = -R; dj <= R; dj++) {
      for (let di = -R; di <= R; di++) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= nx || j >= this.nz) continue;
        const c = j * nx + i;
        if (!mask[c]) continue;
        const d = Math.hypot(this.minX + (i + 0.5) * res - x, this.minZ + (j + 0.5) * res - z);
        if (d > 2.5) continue;
        work[c] = d;
        this.push(d, c);
        seeded++;
      }
    }
    this.building.x = x;
    this.building.z = z;
    this.busy = seeded > 0;
    this.buildAge = 0;
    return this.busy;
  }

  push(k, v) {
    const { hk, hv } = this;
    let i = this.hn++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= k) break;
      hk[i] = hk[p];
      hv[i] = hv[p];
      i = p;
    }
    hk[i] = k;
    hv[i] = v;
  }

  pop() {
    const { hk, hv } = this;
    const v = hv[0], k = hk[--this.hn];
    const last = hv[this.hn];
    const hn = this.hn;
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= hn) break;
      if (c + 1 < hn && hk[c + 1] < hk[c]) c++;
      if (hk[c] >= k) break;
      hk[i] = hk[c];
      hv[i] = hv[c];
      i = c;
    }
    hk[i] = k;
    hv[i] = last;
    return v;
  }

  /** Continue the build by up to `budget` cells. Returns true when a field was finished. */
  step(budget = 8000) {
    if (!this.busy) return false;
    const { nx, nz, res, mask, work } = this;
    let n = 0;
    while (this.hn > 0 && n < budget) {
      const d0 = this.hk[0];
      const c = this.pop();
      if (d0 > work[c]) continue;
      n++;
      const i = c % nx, j = (c / nx) | 0;
      for (let k = 0; k < 8; k++) {
        const o = OFF[k], di = o[0], dj = o[1];
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const c2 = jj * nx + ii;
        if (!mask[c2]) continue;
        // no corner cutting past a blocked cell
        if (di && dj && (!mask[j * nx + ii] || !mask[jj * nx + i])) continue;
        const d = d0 + o[2] * res;
        if (d < work[c2]) {
          work[c2] = d;
          this.push(d, c2);
        }
      }
    }
    if (this.hn > 0) return false;
    // finished: swap the buffers
    const t = this.dist;
    this.dist = this.work;
    this.work = t;
    this.src.x = this.building.x;
    this.src.z = this.building.z;
    this.age = this.buildAge;
    this.busy = false;
    this.version++;
    return true;
  }

  /**
   * Per physics step: start a new build when the player has moved on or the field is getting old,
   * and advance the one under way. dt: the step.
   */
  update(dt, x, z, budget = 8000) {
    this.age += dt;
    if (this.busy) this.buildAge += dt;
    else if (this.age > 0.35 || Math.hypot(x - this.src.x, z - this.src.z) > 1.2) this.start(x, z);
    return this.step(budget);
  }

  /** Build the whole field now (tests, a new run). */
  rebuild(x, z) {
    if (this.start(x, z)) while (!this.step(1e9));
  }

  /** Remaining path length to the player (Infinity off the open ground). */
  distanceAt(x, z) {
    const c = this.cellOf(x, z);
    return c < 0 ? Infinity : this.dist[c];
  }

  /**
   * Downhill direction at (x, z) into `out` (unit, y = 0): the gradient of the field, or toward the
   * lowest neighbour next to walls. Returns false where there is no way.
   */
  direction(x, z, out) {
    const { nx, nz, res, dist } = this;
    const i = Math.floor((x - this.minX) / res), j = Math.floor((z - this.minZ) / res);
    if (i < 1 || j < 1 || i >= nx - 1 || j >= nz - 1) return false;
    const c = j * nx + i, d = dist[c];
    const dl = dist[c - 1], dr = dist[c + 1], dd = dist[c - nx], du = dist[c + nx];
    let gx, gz;
    if (isFinite(d) && isFinite(dl) && isFinite(dr) && isFinite(dd) && isFinite(du)) {
      gx = dl - dr;
      gz = dd - du;
    } else {
      // next to a wall (or off the open ground): the lowest neighbour
      let best = isFinite(d) ? d : Infinity, bx = 0, bz = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const v = dist[c + dj * nx + di];
          if (v < best) {
            best = v;
            bx = di;
            bz = dj;
          }
        }
      }
      gx = bx;
      gz = bz;
    }
    const l = Math.hypot(gx, gz);
    if (l < 1e-9) return false;
    out.x = gx / l;
    out.y = 0;
    out.z = gz / l;
    return true;
  }

  /** A clear straight walk from a to b over open ground (sampled every half cell). */
  clearLine(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d / (this.res * 0.5)));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (!this.free(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }
}
