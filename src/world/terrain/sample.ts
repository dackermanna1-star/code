// Exact terrain sampling that matches both the rendered mesh and the Rapier heightfield collider.
//
// Rapier (parry) splits every heightfield cell along the diagonal (x0, z1)-(x1, z0) (verified by
// tests/world.heightfield.test.ts), and the CDLOD terrain mesh uses the same split, so the surface is
// piecewise linear on these triangles. getHeight interpolates on the triangle containing the point (this is
// the "bilinear" query of the IWorld contract, made exact for the triangulated surface).

/**
 * Height at world (x, z) on a grid of n x n samples spaced `cell` meters (row-major, index = j*n + i).
 * Points outside the grid are clamped to the border.
 */
export function heightAt(h: Float32Array, n: number, cell: number, x: number, z: number): number {
  let fx = x / cell, fz = z / cell;
  const max = n - 1;
  if (fx < 0) fx = 0;
  else if (fx > max) fx = max;
  if (fz < 0) fz = 0;
  else if (fz > max) fz = max;
  let i = Math.floor(fx), j = Math.floor(fz);
  if (i >= max) i = max - 1;
  if (j >= max) j = max - 1;
  const u = fx - i, v = fz - j;
  const o = j * n + i;
  const h00 = h[o], h10 = h[o + 1], h01 = h[o + n], h11 = h[o + n + 1];
  if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
  return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}

/** Smooth (per-sample central-difference normals, bilinearly blended) unit normal written into out. */
export function normalAt(h: Float32Array, n: number, cell: number, x: number, z: number, out: { x: number; y: number; z: number }): void {
  let fx = x / cell, fz = z / cell;
  const max = n - 1;
  fx = fx < 0 ? 0 : fx > max ? max : fx;
  fz = fz < 0 ? 0 : fz > max ? max : fz;
  let i = Math.floor(fx), j = Math.floor(fz);
  if (i >= max) i = max - 1;
  if (j >= max) j = max - 1;
  const u = fx - i, v = fz - j;
  let nx = 0, nz = 0;
  for (let c = 0; c < 4; c++) {
    const ii = i + (c & 1), jj = j + (c >> 1);
    const w = (c & 1 ? u : 1 - u) * (c >> 1 ? v : 1 - v);
    const il = ii > 0 ? ii - 1 : ii, ir = ii < max ? ii + 1 : ii;
    const jl = jj > 0 ? jj - 1 : jj, jr = jj < max ? jj + 1 : jj;
    nx += (w * (h[jj * n + il] - h[jj * n + ir])) / ((ir - il) * cell);
    nz += (w * (h[jl * n + ii] - h[jr * n + ii])) / ((jr - jl) * cell);
  }
  const inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
  out.x = nx * inv;
  out.y = inv;
  out.z = nz * inv;
}

/** Geometric normal of the collider triangle under (x, z). */
export function triangleNormalAt(h: Float32Array, n: number, cell: number, x: number, z: number, out: { x: number; y: number; z: number }): void {
  const max = n - 1;
  const fx = Math.min(Math.max(x / cell, 0), max), fz = Math.min(Math.max(z / cell, 0), max);
  const i = Math.min(Math.floor(fx), max - 1), j = Math.min(Math.floor(fz), max - 1);
  const u = fx - i, v = fz - j;
  const o = j * n + i;
  const h00 = h[o], h10 = h[o + 1], h01 = h[o + n], h11 = h[o + n + 1];
  let dhdx: number, dhdz: number;
  if (u + v <= 1) {
    dhdx = (h10 - h00) / cell;
    dhdz = (h01 - h00) / cell;
  } else {
    dhdx = (h11 - h01) / cell;
    dhdz = (h11 - h10) / cell;
  }
  const inv = 1 / Math.sqrt(dhdx * dhdx + 1 + dhdz * dhdz);
  out.x = -dhdx * inv;
  out.y = inv;
  out.z = -dhdz * inv;
}

/** Column-major (Rapier) copy of a row-major n x n height grid: rapier[j + i*n] = h[j*n + i]. */
export function toRapierHeights(h: Float32Array, n: number): Float32Array {
  const out = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const row = j * n;
    for (let i = 0; i < n; i++) out[j + i * n] = h[row + i];
  }
  return out;
}
