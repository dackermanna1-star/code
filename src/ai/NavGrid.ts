import * as THREE from 'three';
import { ctx } from '../game/ctx';
import { RAPIER, CG, groups } from '../physics/Physics';

const FLOOR_RAY = groups(0xffff, CG.STATIC);
const OBSTACLE = groups(0xffff, CG.STATIC | CG.PROP);
const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, p: number): void {
    const it = this.items,
      pr = this.prio;
    it.push(item);
    pr.push(p);
    let i = it.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (pr[par] <= pr[i]) break;
      [it[i], it[par]] = [it[par], it[i]];
      [pr[i], pr[par]] = [pr[par], pr[i]];
      i = par;
    }
  }
  pop(): number {
    const it = this.items,
      pr = this.prio;
    const top = it[0];
    const lastI = it.pop()!;
    const lastP = pr.pop()!;
    if (it.length > 0) {
      it[0] = lastI;
      pr[0] = lastP;
      let i = 0;
      const n = it.length;
      for (;;) {
        const l = i * 2 + 1,
          r = l + 1;
        let m = i;
        if (l < n && pr[l] < pr[m]) m = l;
        if (r < n && pr[r] < pr[m]) m = r;
        if (m === i) break;
        [it[i], it[m]] = [it[m], it[i]];
        [pr[i], pr[m]] = [pr[m], pr[i]];
        i = m;
      }
    }
    return top;
  }
  clear(): void {
    this.items.length = 0;
    this.prio.length = 0;
  }
}

export interface FlowField {
  target: number;
  dist: Float32Array;
  time: number;
}

/** Multi-level walkable grid built by sampling static colliders. */
export class NavGrid {
  cell = 0.4;
  minX = 0;
  minZ = 0;
  nx = 0;
  nz = 0;
  nodeX: number[] = [];
  nodeY: number[] = [];
  nodeZ: number[] = [];
  /** column -> list of node indices */
  columns: Int32Array[] = [];
  neighbors: Int32Array = new Int32Array(0);
  /** distance to nearest obstacle in cells (for wall-avoid costs) */
  clearance: Uint8Array = new Uint8Array(0);
  count = 0;
  private heap = new MinHeap();
  buildMs = 0;

  build(bounds: THREE.Box3, opts: { radius?: number; height?: number; step?: number } = {}): void {
    const t0 = performance.now();
    const radius = opts.radius ?? 0.26;
    const height = opts.height ?? 1.75;
    const step = opts.step ?? 0.42;
    this.minX = bounds.min.x;
    this.minZ = bounds.min.z;
    this.nx = Math.ceil((bounds.max.x - bounds.min.x) / this.cell);
    this.nz = Math.ceil((bounds.max.z - bounds.min.z) / this.cell);
    const world = ctx.physics.world;
    world.step(); // make sure the query BVH is current
    const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    const capsule = new RAPIER.Capsule(height / 2 - radius, radius);
    const topY = bounds.max.y + 0.5;
    const botY = bounds.min.y - 0.5;
    this.columns = new Array(this.nx * this.nz);
    const xs: number[] = [],
      ys: number[] = [],
      zs: number[] = [];
    for (let iz = 0; iz < this.nz; iz++)
      for (let ix = 0; ix < this.nx; ix++) {
        const x = this.minX + (ix + 0.5) * this.cell;
        const z = this.minZ + (iz + 0.5) * this.cell;
        const list: number[] = [];
        let y = topY;
        for (let guard = 0; guard < 6 && y > botY; guard++) {
          ray.origin.x = x;
          ray.origin.y = y;
          ray.origin.z = z;
          const hit = world.castRayAndGetNormal(ray, y - botY, true, undefined, FLOOR_RAY);
          if (!hit) break;
          const hy = y - hit.timeOfImpact;
          if (hit.normal.y > 0.7) {
            // clearance: capsule above the floor
            const blocked = world.intersectionWithShape({ x, y: hy + height / 2 + 0.06, z }, { x: 0, y: 0, z: 0, w: 1 }, capsule, undefined, OBSTACLE, undefined, undefined, (c) => {
              const b = c.parent();
              return !b || b.isFixed();
            });
            if (!blocked) {
              list.push(xs.length);
              xs.push(x);
              ys.push(hy);
              zs.push(z);
            }
          }
          y = hy - 0.32;
        }
        this.columns[ix + iz * this.nx] = new Int32Array(list);
      }
    this.nodeX = xs;
    this.nodeY = ys;
    this.nodeZ = zs;
    this.count = xs.length;
    this.neighbors = new Int32Array(this.count * 8).fill(-1);
    const losRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    for (let iz = 0; iz < this.nz; iz++)
      for (let ix = 0; ix < this.nx; ix++) {
        const col = this.columns[ix + iz * this.nx];
        for (const a of col) {
          for (let d = 0; d < 8; d++) {
            const [dx, dz] = DIRS[d];
            const jx = ix + dx,
              jz = iz + dz;
            if (jx < 0 || jz < 0 || jx >= this.nx || jz >= this.nz) continue;
            const b = this.findInColumn(jx, jz, ys[a], step);
            if (b < 0) continue;
            if (d >= 4) {
              // no corner cutting
              if (this.findInColumn(ix + dx, iz, ys[a], step) < 0 || this.findInColumn(ix, iz + dz, ys[a], step) < 0) continue;
            }
            // knee-height LOS between centers
            const ox = xs[a],
              oy = ys[a] + 0.45,
              oz = zs[a];
            const tx = xs[b] - ox,
              ty = ys[b] + 0.45 - oy,
              tz = zs[b] - oz;
            const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
            losRay.origin.x = ox;
            losRay.origin.y = oy;
            losRay.origin.z = oz;
            losRay.dir.x = tx / len;
            losRay.dir.y = ty / len;
            losRay.dir.z = tz / len;
            if (world.castRay(losRay, len, true, undefined, FLOOR_RAY)) continue;
            this.neighbors[a * 8 + d] = b;
          }
        }
      }
    // clearance (BFS from blocked edges)
    this.clearance = new Uint8Array(this.count).fill(255);
    const queue: number[] = [];
    for (let i = 0; i < this.count; i++) {
      let n = 0;
      for (let d = 0; d < 4; d++) if (this.neighbors[i * 8 + d] >= 0) n++;
      if (n < 4) {
        this.clearance[i] = 0;
        queue.push(i);
      }
    }
    for (let qi = 0; qi < queue.length; qi++) {
      const i = queue[qi];
      const c = this.clearance[i];
      if (c >= 4) continue;
      for (let d = 0; d < 4; d++) {
        const j = this.neighbors[i * 8 + d];
        if (j >= 0 && this.clearance[j] > c + 1) {
          this.clearance[j] = c + 1;
          queue.push(j);
        }
      }
    }
    this.buildMs = performance.now() - t0;
  }

  private findInColumn(ix: number, iz: number, y: number, tol: number): number {
    const col = this.columns[ix + iz * this.nx];
    if (!col) return -1;
    let best = -1;
    let bd = tol;
    for (const n of col) {
      const d = Math.abs(this.nodeY[n] - y);
      if (d <= bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  /** Nearest walkable node to a world position (prefers same level). */
  nearest(p: THREE.Vector3, maxRing = 6): number {
    const ix = Math.floor((p.x - this.minX) / this.cell);
    const iz = Math.floor((p.z - this.minZ) / this.cell);
    for (let r = 0; r <= maxRing; r++) {
      let best = -1;
      let bd = Infinity;
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const jx = ix + dx,
            jz = iz + dz;
          if (jx < 0 || jz < 0 || jx >= this.nx || jz >= this.nz) continue;
          const col = this.columns[jx + jz * this.nx];
          for (const n of col) {
            const dy = this.nodeY[n] - p.y;
            if (dy > 0.9 || dy < -1.6) continue;
            const ddx = this.nodeX[n] - p.x,
              ddz = this.nodeZ[n] - p.z;
            const d = ddx * ddx + ddz * ddz + dy * dy * 4;
            if (d < bd) {
              bd = d;
              best = n;
            }
          }
        }
      if (best >= 0) return best;
    }
    return -1;
  }

  nodePos(n: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.nodeX[n], this.nodeY[n], this.nodeZ[n]);
  }

  /** Dijkstra distance field toward a target node. */
  flowField(target: number, maxDist = 80, out?: Float32Array): Float32Array {
    const dist = out && out.length === this.count ? out : new Float32Array(this.count);
    dist.fill(Infinity);
    if (target < 0) return dist;
    const heap = this.heap;
    heap.clear();
    dist[target] = 0;
    heap.push(target, 0);
    const nb = this.neighbors;
    const cl = this.clearance;
    while (heap.size) {
      const a = heap.pop();
      const da = dist[a];
      if (da > maxDist) break;
      for (let d = 0; d < 8; d++) {
        const b = nb[a * 8 + d];
        if (b < 0) continue;
        const wallCost = cl[b] === 0 ? 0.6 : cl[b] === 1 ? 0.25 : 0;
        const nd = da + DIRS[d][2] + wallCost + Math.abs(this.nodeY[b] - this.nodeY[a]) * 0.5;
        if (nd < dist[b]) {
          dist[b] = nd;
          heap.push(b, nd);
        }
      }
    }
    return dist;
  }

  /** Best neighbor to move toward according to a distance field. */
  descend(field: Float32Array, n: number): number {
    let best = -1;
    let bd = field[n];
    for (let d = 0; d < 8; d++) {
      const b = this.neighbors[n * 8 + d];
      if (b >= 0 && field[b] < bd) {
        bd = field[b];
        best = b;
      }
    }
    return best;
  }

  /** A* path between nodes; returns node list (start..goal) or null. */
  path(start: number, goal: number, maxExpand = 6000): number[] | null {
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [start];
    const g = new Map<number, number>();
    const came = new Map<number, number>();
    const heap = this.heap;
    heap.clear();
    const gx = this.nodeX[goal],
      gy = this.nodeY[goal],
      gz = this.nodeZ[goal];
    const h = (n: number) => {
      const dx = Math.abs(this.nodeX[n] - gx) / this.cell,
        dz = Math.abs(this.nodeZ[n] - gz) / this.cell;
      return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz) + Math.abs(this.nodeY[n] - gy) * 2;
    };
    g.set(start, 0);
    heap.push(start, h(start));
    let expanded = 0;
    while (heap.size) {
      const a = heap.pop();
      if (a === goal) break;
      if (++expanded > maxExpand) return null;
      const ga = g.get(a)!;
      for (let d = 0; d < 8; d++) {
        const b = this.neighbors[a * 8 + d];
        if (b < 0) continue;
        const wallCost = this.clearance[b] === 0 ? 0.6 : this.clearance[b] === 1 ? 0.25 : 0;
        const nb = ga + DIRS[d][2] + wallCost;
        const old = g.get(b);
        if (old === undefined || nb < old) {
          g.set(b, nb);
          came.set(b, a);
          heap.push(b, nb + h(b));
        }
      }
    }
    if (!came.has(goal)) return null;
    const out = [goal];
    let c = goal;
    while (c !== start) {
      c = came.get(c)!;
      out.push(c);
    }
    out.reverse();
    return out;
  }

  /** String-pull a node path into world waypoints using LOS checks. */
  smooth(nodes: number[]): THREE.Vector3[] {
    const pts = nodes.map((n) => new THREE.Vector3(this.nodeX[n], this.nodeY[n], this.nodeZ[n]));
    if (pts.length <= 2) return pts;
    const out: THREE.Vector3[] = [pts[0]];
    let anchor = 0;
    for (let i = 2; i < pts.length; i++) {
      if (!this.walkableLine(pts[anchor], pts[i])) {
        out.push(pts[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  /** Is the straight walk between two points free (same level, no static obstacles)? */
  walkableLine(a: THREE.Vector3, b: THREE.Vector3): boolean {
    if (Math.abs(a.y - b.y) > 0.5) return false;
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.ceil(len / (this.cell * 0.8));
    let prevY = a.y;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = a.x + dx * t,
        z = a.z + dz * t;
      const ix = Math.floor((x - this.minX) / this.cell);
      const iz = Math.floor((z - this.minZ) / this.cell);
      if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return false;
      const n = this.findInColumn(ix, iz, prevY, 0.45);
      if (n < 0 || this.clearance[n] === 0) return false;
      prevY = this.nodeY[n];
    }
    return true;
  }

  randomNodeNear(p: THREE.Vector3, radius: number): number {
    for (let k = 0; k < 20; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      const q = new THREE.Vector3(p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r);
      const n = this.nearest(q, 2);
      if (n >= 0) return n;
    }
    return this.nearest(p);
  }

  /** debug: points mesh of nodes */
  debugMesh(): THREE.Points {
    const pos = new Float32Array(this.count * 3);
    const col = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) {
      pos[i * 3] = this.nodeX[i];
      pos[i * 3 + 1] = this.nodeY[i] + 0.05;
      pos[i * 3 + 2] = this.nodeZ[i];
      const c = this.clearance[i];
      col[i * 3] = c === 0 ? 1 : 0.2;
      col[i * 3 + 1] = c === 0 ? 0.2 : 1;
      col[i * 3 + 2] = 0.3;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ size: 0.08, vertexColors: true }));
  }
}
