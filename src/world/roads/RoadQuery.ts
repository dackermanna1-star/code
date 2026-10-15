// Exact road-surface queries (CPU): distance to the nearest road edge from a spatial hash of road centreline
// segments. Used by World.getSurface so footsteps/impacts right next to a road are not reported as asphalt (the
// 2 m terrain cells are too coarse for a 1.4 m gravel shoulder), and by anything else that needs "am I on a road".
import type { RoadDef } from '../layout/types';

const CELL = 32;

export interface RoadHit {
  /** Signed distance to the road edge (m, negative = on the road surface). */
  edge: number;
  kind: 'asphalt' | 'dirt';
  roadId: number;
}

export class RoadQuery {
  private cells = new Map<number, number[]>();
  /** Flattened segments: ax, az, bx, bz, half width, kind (0 asphalt / 1 dirt), road id. */
  private segs: Float64Array;

  constructor(roads: readonly RoadDef[]) {
    const s: number[] = [];
    for (const r of roads) {
      const p = r.points;
      for (let i = 1; i < p.length; i++) s.push(p[i - 1].x, p[i - 1].z, p[i].x, p[i].z, r.width / 2, r.kind === 'asphalt' ? 0 : 1, r.id);
    }
    this.segs = new Float64Array(s);
    const n = this.segs.length / 7;
    for (let k = 0; k < n; k++) {
      const o = k * 7;
      const hw = this.segs[o + 4] + 2;
      const x0 = Math.floor((Math.min(this.segs[o], this.segs[o + 2]) - hw) / CELL), x1 = Math.floor((Math.max(this.segs[o], this.segs[o + 2]) + hw) / CELL);
      const z0 = Math.floor((Math.min(this.segs[o + 1], this.segs[o + 3]) - hw) / CELL), z1 = Math.floor((Math.max(this.segs[o + 1], this.segs[o + 3]) + hw) / CELL);
      for (let cx = x0; cx <= x1; cx++)
        for (let cz = z0; cz <= z1; cz++) {
          const key = cx * 65536 + cz;
          let l = this.cells.get(key);
          if (!l) this.cells.set(key, (l = []));
          l.push(k);
        }
    }
  }

  /**
   * Nearest road (by edge distance) to (x, z) among roads whose edge is within ~2 m; writes into `out` and returns
   * it, or returns null when no road is that close.
   */
  nearest(x: number, z: number, out: RoadHit): RoadHit | null {
    const l = this.cells.get(Math.floor(x / CELL) * 65536 + Math.floor(z / CELL));
    if (!l) return null;
    const s = this.segs;
    let best = Infinity, bk = -1;
    for (const k of l) {
      const o = k * 7;
      const ax = s[o], az = s[o + 1], dx = s[o + 2] - ax, dz = s[o + 3] - az;
      const L2 = dx * dx + dz * dz || 1e-9;
      let t = ((x - ax) * dx + (z - az) * dz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = ax + dx * t - x, cz = az + dz * t - z;
      const e = Math.sqrt(cx * cx + cz * cz) - s[o + 4];
      if (e < best) {
        best = e;
        bk = k;
      }
    }
    if (bk < 0 || best > 2) return null;
    out.edge = best;
    out.kind = s[bk * 7 + 5] === 0 ? 'asphalt' : 'dirt';
    out.roadId = s[bk * 7 + 6];
    return out;
  }
}
