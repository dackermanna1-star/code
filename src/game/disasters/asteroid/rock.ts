/**
 * Procedural asteroid geometry: a displaced icosphere (fbm lumps, slight elongation) pocked by
 * bowl-shaped impact craters with raised rims, with per-vertex albedo (dark basaltic rock,
 * darker crater floors, brighter fresh rims and ejecta rays).
 */
import * as THREE from 'three';

function h3(x: number, y: number, z: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 3D value noise in [0,1]. */
export function vnoise3(x: number, y: number, z: number, s = 0): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const x00 = l(h3(ix, iy, iz, s), h3(ix + 1, iy, iz, s), fx);
  const x10 = l(h3(ix, iy + 1, iz, s), h3(ix + 1, iy + 1, iz, s), fx);
  const x01 = l(h3(ix, iy, iz + 1, s), h3(ix + 1, iy, iz + 1, s), fx);
  const x11 = l(h3(ix, iy + 1, iz + 1, s), h3(ix + 1, iy + 1, iz + 1, s), fx);
  return l(l(x00, x10, fy), l(x01, x11, fy), fz);
}

function fbm3(x: number, y: number, z: number, oct: number, s: number): number {
  let a = 0.5, sum = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    sum += a * vnoise3(x, y, z, s + i * 17);
    n += a;
    x = x * 2.03 + 1.7; y = y * 2.03 + 9.2; z = z * 2.03 + 3.1;
    a *= 0.5;
  }
  return sum / n;
}

export interface RockOptions {
  detail?: number;
  seed?: number;
  craters?: number;
  /** Amplitude of the large lumps (fraction of the radius). */
  lumps?: number;
  /** Axis scale (elongation). */
  scale?: [number, number, number];
  /** Albedo range. */
  albedo?: [number, number];
}

/** Indexed geodesic sphere (icosahedron subdivided `level` times, midpoint cache). */
export function icosphere(level: number): { pos: Float32Array; index: Uint32Array } {
  const t = (1 + Math.sqrt(5)) / 2;
  const v: number[] = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1];
  let f: number[] = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  for (let i = 0; i < v.length; i += 3) {
    const l = Math.hypot(v[i], v[i + 1], v[i + 2]);
    v[i] /= l; v[i + 1] /= l; v[i + 2] /= l;
  }
  for (let s = 0; s < level; s++) {
    const cache = new Map<number, number>();
    const mid = (a: number, b: number) => {
      const key = a < b ? a * 1048576 + b : b * 1048576 + a;
      const c = cache.get(key);
      if (c !== undefined) return c;
      let x = v[a * 3] + v[b * 3], y = v[a * 3 + 1] + v[b * 3 + 1], z = v[a * 3 + 2] + v[b * 3 + 2];
      const l = Math.hypot(x, y, z);
      x /= l; y /= l; z /= l;
      const i = v.length / 3;
      v.push(x, y, z);
      cache.set(key, i);
      return i;
    };
    const nf: number[] = [];
    for (let i = 0; i < f.length; i += 3) {
      const a = f[i], b = f[i + 1], c = f[i + 2];
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      nf.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    f = nf;
  }
  return { pos: Float32Array.from(v), index: Uint32Array.from(f) };
}

/**
 * Builds a unit-radius rock (indexed, normals, vertex colours) a slice at a time so a detailed
 * mesh never stalls a frame: call `step(ms)` until it returns true, then use `geometry`.
 */
export class RockBuilder {
  readonly geometry = new THREE.BufferGeometry();
  private pos: Float32Array;
  private index: Uint32Array;
  private col: Float32Array;
  private i = 0;
  private cd: number[] = [];
  private cr: number[] = [];
  private cdep: number[] = [];
  private ccos: number[] = [];
  private seed: number;
  done = false;

  constructor(private o: RockOptions = {}) {
    const sphere = icosphere(o.detail ?? 5);
    this.pos = sphere.pos;
    this.index = sphere.index;
    this.col = new Float32Array(this.pos.length);
    const seed = (this.seed = o.seed ?? 1);
    const nc = o.craters ?? 34;
    for (let i = 0; i < nc; i++) {
      const u = h3(i, 1, 0, seed) * 2 - 1, a = h3(i, 2, 0, seed) * Math.PI * 2, s = Math.sqrt(1 - u * u);
      this.cd.push(Math.cos(a) * s, u, Math.sin(a) * s);
      // power-law sizes: many small, a few large
      const rad = 0.07 + 0.42 * Math.pow(h3(i, 3, 0, seed), 3.2);
      this.cr.push(rad);
      this.cdep.push(rad * (0.28 + 0.2 * h3(i, 4, 0, seed)));
      this.ccos.push(Math.cos(Math.min(Math.PI, rad * 1.9)));
    }
  }

  /** Displace vertices for up to `ms` milliseconds. Returns true when the geometry is ready. */
  step(ms = 4): boolean {
    if (this.done) return true;
    const t0 = performance.now();
    const { pos, col, cd, cr, cdep, ccos, seed } = this;
    const n = pos.length / 3, nc = cr.length;
    const [sx, sy, sz] = this.o.scale ?? [1.22, 0.9, 1.0];
    const lumps = this.o.lumps ?? 0.32;
    const [a0, a1] = this.o.albedo ?? [0.05, 0.13];
    while (this.i < n) {
      const i = this.i++;
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      let r = 1 + (fbm3(x * 1.4, y * 1.4, z * 1.4, 3, seed) - 0.5) * 2 * lumps + (fbm3(x * 5, y * 5, z * 5, 3, seed + 50) - 0.5) * 0.09;
      let crater = 0, rim = 0;
      for (let k = 0; k < nc; k++) {
        const d = x * cd[k * 3] + y * cd[k * 3 + 1] + z * cd[k * 3 + 2];
        if (d < ccos[k]) continue;
        const t = Math.acos(Math.min(1, d)) / cr[k];
        if (t < 1) {
          r += -cdep[k] * (1 - t * t) + cdep[k] * 0.35 * Math.pow(t, 6);
          crater = Math.max(crater, 1 - t);
        } else if (t < 1.9) {
          const f = (1.9 - t) / 0.9;
          r += cdep[k] * 0.35 * f * f * f;
          rim = Math.max(rim, f);
        }
      }
      pos[i * 3] = x * r * sx; pos[i * 3 + 1] = y * r * sy; pos[i * 3 + 2] = z * r * sz;
      // albedo: dark basalt, darker crater floors, brighter fresh rims, streaks
      let alb = a0 + (a1 - a0) * (0.35 + 0.65 * fbm3(x * 3, y * 3, z * 3, 3, seed + 70));
      alb *= (1 - 0.35 * crater) * (1 + 0.45 * rim * rim) * (0.85 + 0.3 * vnoise3(x * 9, y * 9, z * 9, seed + 90));
      const warm = 0.9 + 0.2 * vnoise3(x * 2, y * 2, z * 2, seed + 30);
      col[i * 3] = alb * warm * 1.05;
      col[i * 3 + 1] = alb * 0.97;
      col[i * 3 + 2] = alb * (1.05 - 0.15 * warm);
      if ((i & 63) === 0 && performance.now() - t0 > ms) return false;
    }
    const g = this.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(this.index, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    this.done = true;
    return true;
  }
}

/** Unit-radius rock built synchronously (small detail levels). */
export function rockGeometry(o: RockOptions = {}): THREE.BufferGeometry {
  const b = new RockBuilder(o);
  while (!b.step(1e9));
  return b.geometry;
}
