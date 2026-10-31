// LAST LOOKOUT — navigation: one distance field over the valley toward the compound's gates.
//
// The goal never moves (the gates), so the whole field is computed once at load (a multi-source
// Dijkstra over a 1 m grid, 8-connected, from the ground in front of every gate). Every animated
// zombie then walks downhill on it: no per-zombie path planning at all. Each cell also remembers
// which gate its descent ends at.
import { Vec3 } from '../../physics/math.js';

const SQ2 = Math.SQRT2;

export class GateField {
  constructor(layout, isWalkable, opts = {}) {
    const B = layout.bounds;
    this.res = opts.res ?? 1;
    this.minX = B.minX;
    this.minZ = B.minZ;
    this.nx = Math.ceil((B.maxX - B.minX) / this.res);
    this.nz = Math.ceil((B.maxZ - B.minZ) / this.res);
    const n = this.nx * this.nz;
    this.free = new Uint8Array(n);
    this.dist = new Float32Array(n).fill(Infinity);
    this.gate = new Int8Array(n).fill(-1);
    this.gates = layout.compound.gates.map((g, i) => {
      const cx = (g.a[0] + g.b[0]) / 2, cz = (g.a[1] + g.b[1]) / 2;
      return {
        index: i, id: g.id, a: g.a, b: g.b, normal: g.normal, centre: new Vec3(cx, 0, cz),
        // where the attackers stand: just outside the gate
        front: new Vec3(cx + g.normal[0] * 0.9, 0, cz + g.normal[1] * 0.9),
        width: Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]),
      };
    });
    this.build(isWalkable);
  }

  cell(x, z) {
    const i = Math.floor((x - this.minX) / this.res), j = Math.floor((z - this.minZ) / this.res);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }

  build(isWalkable) {
    const { nx, nz, res, free, dist, gate } = this;
    for (let j = 0; j < nz; j++) {
      const z = this.minZ + (j + 0.5) * res;
      for (let i = 0; i < nx; i++) free[j * nx + i] = isWalkable(this.minX + (i + 0.5) * res, z) ? 1 : 0;
    }
    // binary heap of (dist, cell)
    const n = nx * nz;
    const hk = new Float32Array(n * 2), hv = new Int32Array(n * 2);
    let hn = 0;
    const push = (k, v) => {
      let i = hn++;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hk[p] <= k) break;
        hk[i] = hk[p];
        hv[i] = hv[p];
        i = p;
      }
      hk[i] = k;
      hv[i] = v;
    };
    const pop = () => {
      const v = hv[0], k = hk[--hn];
      const last = hv[hn];
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
    };
    for (const g of this.gates) {
      // a short line of source cells along the gate's front
      for (let s = -0.45; s <= 0.45; s += 0.15) {
        const x = g.front.x + (g.b[0] - g.a[0]) * s, z = g.front.z + (g.b[1] - g.a[1]) * s;
        const c = this.cell(x, z);
        if (c < 0) continue;
        free[c] = 1;
        if (dist[c] > 0) {
          dist[c] = 0;
          gate[c] = g.index;
          push(0, c);
        }
      }
    }
    const off = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];
    while (hn > 0) {
      const d0 = hk[0];
      const c = pop();
      if (d0 > dist[c]) continue;
      const i = c % nx, j = (c / nx) | 0;
      for (const [di, dj, w] of off) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const c2 = jj * nx + ii;
        if (!free[c2]) continue;
        // no corner cutting past a blocked cell
        if (di && dj && (!free[j * nx + ii] || !free[jj * nx + i])) continue;
        const d = d0 + w * res;
        if (d < dist[c2]) {
          dist[c2] = d;
          gate[c2] = gate[c];
          push(d, c2);
        }
      }
    }
  }

  /** Remaining path length to the nearest gate (Infinity off the walkable ground). */
  distanceAt(x, z) {
    const c = this.cell(x, z);
    return c < 0 ? Infinity : this.dist[c];
  }

  gateAt(x, z) {
    const c = this.cell(x, z);
    return c < 0 ? -1 : this.gate[c];
  }

  /**
   * Downhill direction at (x, z) into `out` (unit, y = 0): the gradient of the field, or toward the
   * lowest neighbour next to obstacles. Returns false where there is no way (off the field).
   */
  direction(x, z, out) {
    const { nx, nz, res, dist } = this;
    const fi = (x - this.minX) / res - 0.5, fj = (z - this.minZ) / res - 0.5;
    const i = Math.round(fi), j = Math.round(fj);
    if (i < 1 || j < 1 || i >= nx - 1 || j >= nz - 1) {
      // outside: head for the middle of the field
      out.set(-x, 0, -z);
      out.normalize();
      return true;
    }
    const c = j * nx + i, d = dist[c];
    const dl = dist[c - 1], dr = dist[c + 1], dd = dist[c - nx], du = dist[c + nx];
    let gx, gz;
    if (isFinite(d) && isFinite(dl) && isFinite(dr) && isFinite(dd) && isFinite(du)) {
      gx = dl - dr;
      gz = dd - du;
    } else {
      // next to a wall: the lowest neighbour
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
    out.set(gx / l, 0, gz / l);
    return true;
  }
}
