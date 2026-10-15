// Rasterization helpers on the terrain sample grid.
import type { Polygon, XZ } from '../../layout/types';

/** Math.hypot is very slow in V8 hot loops; use these instead. */
export const hyp = (a: number, b: number): number => Math.sqrt(a * a + b * b);
export const hyp3 = (a: number, b: number, c: number): number => Math.sqrt(a * a + b * b + c * c);

/** Scanline-fill polygons into a mask of (w x h) samples spaced `cell` meters (sample at i*cell, j*cell). */
export function rasterizePolygons(polys: Polygon[], w: number, h: number, cell: number, mask: Uint8Array, value = 1): void {
  const xs: number[] = [];
  for (let j = 0; j < h; j++) {
    const z = j * cell;
    xs.length = 0;
    for (const poly of polys) {
      for (let k = 0, l = poly.length - 1; k < poly.length; l = k++) {
        const a = poly[k], b = poly[l];
        if (a.z > z !== b.z > z) xs.push(a.x + ((z - a.z) / (b.z - a.z)) * (b.x - a.x));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k] / cell)), i1 = Math.min(w - 1, Math.floor(xs[k + 1] / cell));
      for (let i = i0; i <= i1; i++) mask[j * w + i] = value;
    }
  }
}

/** Dense polyline samples (x, z, tangent) every `step` meters. */
export function densify(points: readonly XZ[], step: number): { x: number; z: number; tx: number; tz: number; s: number }[] {
  const out: { x: number; z: number; tx: number; tz: number; s: number }[] = [];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const L = hyp(b.x - a.x, b.z - a.z);
    if (L < 1e-6) continue;
    const tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
    const k = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx, tz, s: acc + L * t });
    }
    acc += L;
  }
  const last = points[points.length - 1];
  const prev = out[out.length - 1];
  out.push({ x: last.x, z: last.z, tx: prev?.tx ?? 1, tz: prev?.tz ?? 0, s: acc });
  return out;
}

/**
 * "Splat" a set of samples into per-grid-sample nearest-distance buffers.
 * For each grid sample within `radius(k)` of sample k, keeps the minimum distance and the index of that sample.
 */
export function splatNearest(
  samples: { x: number; z: number }[],
  radius: (k: number) => number,
  w: number,
  cell: number,
  dist: Float32Array,
  owner: Int32Array,
): void {
  for (let k = 0; k < samples.length; k++) {
    const s = samples[k];
    const r = radius(k);
    const i0 = Math.max(0, Math.floor((s.x - r) / cell)), i1 = Math.min(w - 1, Math.ceil((s.x + r) / cell));
    const j0 = Math.max(0, Math.floor((s.z - r) / cell)), j1 = Math.min(w - 1, Math.ceil((s.z + r) / cell));
    const r2 = r * r;
    for (let j = j0; j <= j1; j++) {
      const dz = j * cell - s.z;
      const dz2 = dz * dz;
      if (dz2 > r2) continue;
      const row = j * w;
      for (let i = i0; i <= i1; i++) {
        const dx = i * cell - s.x;
        const d2 = dx * dx + dz2;
        if (d2 > r2) continue;
        const d = Math.sqrt(d2);
        const idx = row + i;
        if (d < dist[idx]) {
          dist[idx] = d;
          owner[idx] = k;
        }
      }
    }
  }
}

/** Signed distance to an oriented rect (negative inside). Rotation convention = three.js rotation.y. */
export function rectSd(x: number, z: number, cx: number, cz: number, hw: number, hd: number, cos: number, sin: number): number {
  const dx = x - cx, dz = z - cz;
  const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
  const qx = Math.abs(lx) - hw, qz = Math.abs(lz) - hd;
  const ox = qx > 0 ? qx : 0, oz = qz > 0 ? qz : 0;
  return Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(qx, qz), 0);
}
