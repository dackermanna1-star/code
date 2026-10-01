// Signed-distance modelling helpers for the walker: primitives, smooth
// booleans, value noise and a narrow-band voxelizer that meshes a field with
// the greedy mesher and blends the field's gradient into the normals.
import { VoxelGrid, VoxelModel } from '../../voxel/VoxelGrid.js';
import { meshModel } from '../../voxel/mesher.js';
import { smin, sdRoundCone, sdEllipsoid, sdRoundBox, vnoise3 } from '../../spray/viewmodelParts.js';

export { smin, sdRoundCone, sdEllipsoid, sdRoundBox, vnoise3 };

export const { abs, min, max, sin, cos, sqrt, pow, exp, atan2, PI, hypot, floor } = Math;
export const clamp = (x, a, b) => min(b, max(a, x));
export const smax = (a, b, k) => -smin(-a, -b, k);
export const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const mix = (a, b, t) => a + (b - a) * t;
/** Round cone between points a and b (arrays). */
export const cone = (x, y, z, a, b, r1, r2 = r1) => sdRoundCone(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], r1, r2);
/** Ellipsoid at c with radii r. */
export const ell = (x, y, z, c, r) => sdEllipsoid(x - c[0], y - c[1], z - c[2], r[0], r[1], r[2]);
/** Sphere at c. */
export const sph = (x, y, z, c, r) => hypot(x - c[0], y - c[1], z - c[2]) - r;
/** 2D ellipse distance (approximate). */
export function ell2(x, y, rx, ry) {
  const k0 = sqrt((x / rx) ** 2 + (y / ry) ** 2);
  const k1 = sqrt((x / (rx * rx)) ** 2 + (y / (ry * ry)) ** 2);
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -min(rx, ry);
}
/** Parameter (0..1) and distance of p from segment ab. */
export function segT(x, y, z, a, b) {
  const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
  const t = clamp(((x - a[0]) * ex + (y - a[1]) * ey + (z - a[2]) * ez) / (ex * ex + ey * ey + ez * ez), 0, 1);
  return t;
}
export const n3 = (x, y, z, s) => vnoise3(x, y, z, s);

/**
 * Narrow-band voxelizer: 4^3 blocks well outside the surface are skipped, blocks
 * well inside are filled without calling mat(); only the band is evaluated per voxel.
 * Returns a mesh (BufferGeometry) in the field's coordinates.
 */
export function voxelize(P, { vs, min: b0, max: b1, sdf, mat, fill, smooth = 0.8, normalSdf = null }) {
  const nx = Math.max(1, Math.ceil((b1[0] - b0[0]) / vs));
  const ny = Math.max(1, Math.ceil((b1[1] - b0[1]) / vs));
  const nz = Math.max(1, Math.ceil((b1[2] - b0[2]) / vs));
  const g = new VoxelGrid(nx, ny, nz);
  const D = g.data;
  const B = 4, band = 1.35 * B * vs;
  for (let k0 = 0; k0 < nz; k0 += B)
    for (let j0 = 0; j0 < ny; j0 += B)
      for (let i0 = 0; i0 < nx; i0 += B) {
        const dc = sdf(b0[0] + (i0 + B / 2) * vs, b0[1] + (j0 + B / 2) * vs, b0[2] + (k0 + B / 2) * vs);
        if (dc > band) continue;
        const full = dc < -band;
        for (let k = k0; k < Math.min(nz, k0 + B); k++) {
          const z = b0[2] + (k + 0.5) * vs;
          for (let j = j0; j < Math.min(ny, j0 + B); j++) {
            const y = b0[1] + (j + 0.5) * vs;
            for (let i = i0; i < Math.min(nx, i0 + B); i++) {
              const idx = i + nx * (j + ny * k);
              if (full) {
                D[idx] = fill;
                continue;
              }
              const x = b0[0] + (i + 0.5) * vs;
              const d = sdf(x, y, z);
              if (d > 0) continue;
              const m = mat(x, y, z, d);
              if (m) D[idx] = m;
            }
          }
        }
      }
  const geo = meshModel(new VoxelModel(g, P, vs, b0));
  if (smooth > 0) fieldNormals(geo, normalSdf ?? sdf, smooth, vs * 0.75);
  return geo;
}

/**
 * Blend the field's gradient into the mesher's face normals. Unlike the props'
 * smoothing, the risers of the staircase (faces nearly perpendicular to the
 * surface) are smoothed too, or they shade as stripes across skin; only faces
 * the gradient points away from (the back of thin sheets) stay flat.
 */
function fieldNormals(geo, sdf, k, eps) {
  const pa = geo.attributes.position.array, na = geo.attributes.normal.array;
  for (let i = 0, nv = pa.length / 3; i < nv; i++) {
    const x = pa[i * 3], y = pa[i * 3 + 1], z = pa[i * 3 + 2];
    const fx = na[i * 3] / 127, fy = na[i * 3 + 1] / 127, fz = na[i * 3 + 2] / 127;
    const f1 = sdf(x + eps, y - eps, z - eps), f2 = sdf(x - eps, y - eps, z + eps);
    const f3 = sdf(x - eps, y + eps, z - eps), f4 = sdf(x + eps, y + eps, z + eps);
    let gx = f1 - f2 - f3 + f4, gy = -f1 - f2 + f3 + f4, gz = -f1 + f2 - f3 + f4;
    const gl = sqrt(gx * gx + gy * gy + gz * gz);
    if (!(gl > 1e-12)) continue;
    gx /= gl;
    gy /= gl;
    gz /= gl;
    const kk = k * sstep(-0.12, 0.12, gx * fx + gy * fy + gz * fz);
    let ox = fx * (1 - kk) + gx * kk, oy = fy * (1 - kk) + gy * kk, oz = fz * (1 - kk) + gz * kk;
    const ol = sqrt(ox * ox + oy * oy + oz * oz) || 1;
    na[i * 3] = Math.round((ox / ol) * 127);
    na[i * 3 + 1] = Math.round((oy / ol) * 127);
    na[i * 3 + 2] = Math.round((oz / ol) * 127);
  }
  geo.attributes.normal.needsUpdate = true;
}

/**
 * Replace the mesher's voxel-corner occlusion (which bands on fine staircase
 * surfaces) with a smooth occlusion sampled from the field along the normal.
 */
export function sdfAO(geo, sdf, h = 0.006, lo = 0.45) {
  const P = geo.attributes.position.array, N = geo.attributes.normal.array, M = geo.attributes.vmat.array;
  const n = P.length / 3;
  for (let v = 0; v < n; v++) {
    const nx = N[v * 3] / 127, ny = N[v * 3 + 1] / 127, nz = N[v * 3 + 2] / 127;
    // start from the surface, not the voxel corner: corners of the staircase sit
    // up to half a voxel in or out, which would shade every step as a band
    const s0 = sdf(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
    const px = P[v * 3] - nx * s0, py = P[v * 3 + 1] - ny * s0, pz = P[v * 3 + 2] - nz * s0;
    let occ = 0;
    for (let k = 1; k <= 2; k++) {
      const d = k * h * 1.5;
      const s = sdf(px + nx * d, py + ny * d, pz + nz * d);
      occ += (max(0, d - s) / d) * (k === 1 ? 0.55 : 0.45);
    }
    M[v * 4 + 3] = Math.round(clamp(1 - occ * 1.3, lo, 1) * 255);
  }
  geo.attributes.vmat.needsUpdate = true;
}
