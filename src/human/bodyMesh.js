import { Vec3 } from '../physics/math.js';
import { landmark } from './anatomy.js';

/**
 * Polygonises the sculpted body (BodyShape) with Naive Surface Nets. The torso and limbs are meshed
 * at ~6.5 mm, while the head and hands, where detail matters, get their own finer grids. Fine
 * patches overlap the coarse mesh by a centimetre and are pushed 0.6 mm under its surface inside
 * the overlap, so the seam is invisible without stitching. Output is plain typed arrays
 * (positions/normals in sculpt space, 4 skin influences per vertex) usable in Node and the browser.
 */

const _p = new Vec3();
const _g = new Vec3();

function smoothstep(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Fine-detail regions in sculpt space: bounding box + cutting plane (normal points into the patch). */
function detailRegions(shape) {
  const regions = [];
  const bounds = (segNames, extra = 0.012) => {
    const mn = new Vec3(Infinity, Infinity, Infinity), mx = new Vec3(-Infinity, -Infinity, -Infinity);
    for (const n of segNames) {
      for (const p of shape.segPrims[shape.segIndex[n]]) {
        mn.x = Math.min(mn.x, p.min.x); mn.y = Math.min(mn.y, p.min.y); mn.z = Math.min(mn.z, p.min.z);
        mx.x = Math.max(mx.x, p.max.x); mx.y = Math.max(mx.y, p.max.y); mx.z = Math.max(mx.z, p.max.z);
      }
    }
    mn.x -= extra; mn.y -= extra; mn.z -= extra;
    mx.x += extra; mx.y += extra; mx.z += extra;
    return [mn, mx];
  };
  {
    // head: everything above a horizontal cut through the upper neck
    const [mn, mx] = bounds(['head', 'neck']);
    const P1 = new Vec3(0, 1.548, 0);
    mn.y = P1.y - 0.03;
    regions.push({ name: 'head', min: mn, max: mx, h: 0.0028, point: P1, normal: new Vec3(0, 1, 0) });
  }
  for (const s of ['L', 'R']) {
    const mp = shape.modelPose['hand' + s];
    const W = landmark('wrist' + s).sub(mp.pivot).applyQuat(mp.q).add(mp.pivot);
    const E = landmark('elbow' + s).sub(mp.pivot).applyQuat(mp.q).add(mp.pivot);
    const n = new Vec3().subVectors(W, E).normalize();
    const P1 = W.clone().addScaled(n, -0.012);
    const [mn, mx] = bounds(['hand' + s]);
    // include the overlap zone on the forearm
    const back = P1.clone().addScaled(n, -0.03);
    mn.x = Math.min(mn.x, back.x - 0.04); mn.y = Math.min(mn.y, back.y - 0.04); mn.z = Math.min(mn.z, back.z - 0.04);
    mx.x = Math.max(mx.x, back.x + 0.04); mx.y = Math.max(mx.y, back.y + 0.04); mx.z = Math.max(mx.z, back.z + 0.04);
    regions.push({ name: 'hand' + s, min: mn, max: mx, h: 0.0024, point: P1, normal: n });
  }
  return regions;
}

const inBox = (r, x, y, z) => x >= r.min.x && x <= r.max.x && y >= r.min.y && y <= r.max.y && z >= r.min.z && z <= r.max.z;
const planeDist = (r, x, y, z) => (x - r.point.x) * r.normal.x + (y - r.point.y) * r.normal.y + (z - r.point.z) * r.normal.z;

const OVERLAP = 0.022; // width of the overlap band behind the cut (covers the coarse mesh's ragged edge)
const SINK = 0.0006; // how far a fine patch hides below the coarse surface inside the overlap

const CORNERS = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];
const EDGES = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/**
 * Naive Surface Nets over one grid. `keep(x,y,z)` selects cells (by centre) that may emit
 * vertices; `sink(x,y,z)` pushes vertices inward along the normal. Appends to `out`.
 */
function surfaceNets(shape, grid, keep, sink, out) {
  const { min, h } = grid;
  const nx = Math.ceil((grid.max.x - min.x) / h) + 1;
  const ny = Math.ceil((grid.max.y - min.y) / h) + 1;
  const nz = Math.ceil((grid.max.z - min.z) / h) + 1;
  const F = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  // block-wise evaluation: blocks certainly far from the surface are filled without sampling
  const B = 4;
  const halfDiag = (B - 1) * h * 0.5 * Math.sqrt(3);
  for (let bk = 0; bk < nz; bk += B) {
    for (let bj = 0; bj < ny; bj += B) {
      for (let bi = 0; bi < nx; bi += B) {
        const i1 = Math.min(bi + B, nx), j1 = Math.min(bj + B, ny), k1 = Math.min(bk + B, nz);
        const cx = min.x + (bi + (i1 - bi - 1) * 0.5) * h;
        const cy = min.y + (bj + (j1 - bj - 1) * 0.5) * h;
        const cz = min.z + (bk + (k1 - bk - 1) * 0.5) * h;
        const dc = shape.sdf(cx, cy, cz);
        if (Math.abs(dc) > halfDiag * 1.25 + 2 * h) {
          const fill = dc > 0 ? shape.band : -shape.band;
          for (let k = bk; k < k1; k++) for (let j = bj; j < j1; j++) for (let i = bi; i < i1; i++) F[idx(i, j, k)] = fill;
          continue;
        }
        for (let k = bk; k < k1; k++) {
          const z = min.z + k * h;
          for (let j = bj; j < j1; j++) {
            const y = min.y + j * h;
            for (let i = bi; i < i1; i++) F[idx(i, j, k)] = shape.sdf(min.x + i * h, y, z);
          }
        }
      }
    }
  }

  // vertices: one per sign-changing cell
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cellVert = new Int32Array(cx * cy * cz).fill(-1);
  const cidx = (i, j, k) => i + cx * (j + cy * k);
  const v = new Float64Array(8);
  const pos = out.pos, nrm = out.nrm, surf = out.surf;
  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const o = CORNERS[c];
          const val = F[idx(i + o[0], j + o[1], k + o[2])];
          v[c] = val;
          if (val < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        const mx = min.x + (i + 0.5) * h, my = min.y + (j + 0.5) * h, mz = min.z + (k + 0.5) * h;
        if (keep && !keep(mx, my, mz)) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of EDGES) {
          const va = v[a], vb = v[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          const oa = CORNERS[a], ob = CORNERS[b];
          sx += oa[0] + (ob[0] - oa[0]) * t;
          sy += oa[1] + (ob[1] - oa[1]) * t;
          sz += oa[2] + (ob[2] - oa[2]) * t;
          n++;
        }
        _p.set(min.x + (i + sx / n) * h, min.y + (j + sy / n) * h, min.z + (k + sz / n) * h);
        // project onto the true surface (one Newton step along the gradient, which is also the
        // vertex normal: the step is sub-millimetre so the gradient barely changes)
        const d = shape.sdf(_p.x, _p.y, _p.z);
        shape.gradient(_p.x, _p.y, _p.z, _g);
        _p.addScaled(_g, -d);
        // never leave the cell's neighbourhood (guards against bad projections in creases)
        const lim = h * 1.5;
        _p.x = Math.min(Math.max(_p.x, mx - lim), mx + lim);
        _p.y = Math.min(Math.max(_p.y, my - lim), my + lim);
        _p.z = Math.min(Math.max(_p.z, mz - lim), mz + lim);
        const s = sink ? sink(_p.x, _p.y, _p.z) : 0;
        cellVert[cidx(i, j, k)] = pos.length / 3;
        surf.push(_p.x, _p.y, _p.z);
        pos.push(_p.x - _g.x * s, _p.y - _g.y * s, _p.z - _g.z * s);
        nrm.push(_g.x, _g.y, _g.z);
      }
    }
  }

  // faces: one quad per sign-changing grid edge whose four surrounding cells all emitted vertices
  const tri = out.tri;
  const quad = (a, b, c, d) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    const P = pos, N = nrm;
    const ux = P[c * 3] - P[a * 3], uy = P[c * 3 + 1] - P[a * 3 + 1], uz = P[c * 3 + 2] - P[a * 3 + 2];
    const wx = P[d * 3] - P[b * 3], wy = P[d * 3 + 1] - P[b * 3 + 1], wz = P[d * 3 + 2] - P[b * 3 + 2];
    // orientation: the quad normal must agree with the field gradient at its corners
    const n0 = uy * wz - uz * wy, n1 = uz * wx - ux * wz, n2 = ux * wy - uy * wx;
    const gx = N[a * 3] + N[b * 3] + N[c * 3] + N[d * 3];
    const gy = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1] + N[d * 3 + 1];
    const gz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2] + N[d * 3 + 2];
    const flip = n0 * gx + n1 * gy + n2 * gz < 0;
    // split along the shorter diagonal
    if (ux * ux + uy * uy + uz * uz <= wx * wx + wy * wy + wz * wz) {
      if (!flip) tri.push(a, b, c, a, c, d);
      else tri.push(a, c, b, a, d, c);
    } else if (!flip) tri.push(a, b, d, b, c, d);
    else tri.push(a, d, b, b, d, c);
  };
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const in0 = F[idx(i, j, k)] < 0;
        // edge along +x: cells (i, j-1..j, k-1..k)
        if (i < cx && j >= 1 && j < cy && k >= 1 && k < cz && in0 !== F[idx(i + 1, j, k)] < 0) {
          quad(cellVert[cidx(i, j - 1, k - 1)], cellVert[cidx(i, j, k - 1)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j - 1, k)]);
        }
        // edge along +y: cells (i-1..i, j, k-1..k)
        if (j < cy && i >= 1 && i < cx && k >= 1 && k < cz && in0 !== F[idx(i, j + 1, k)] < 0) {
          quad(cellVert[cidx(i - 1, j, k - 1)], cellVert[cidx(i, j, k - 1)], cellVert[cidx(i, j, k)], cellVert[cidx(i - 1, j, k)]);
        }
        // edge along +z: cells (i-1..i, j-1..j, k)
        if (k < cz && i >= 1 && i < cx && j >= 1 && j < cy && in0 !== F[idx(i, j, k + 1)] < 0) {
          quad(cellVert[cidx(i - 1, j - 1, k)], cellVert[cidx(i, j - 1, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i - 1, j, k)]);
        }
      }
    }
  }
}

/**
 * Build the complete body mesh. Returns
 * { positions, normals, surface (unsunk positions), indices, skinIndex, skinWeight, segment, region }
 */
export function buildBodyMesh(shape, opts = {}) {
  const hBody = opts.h ?? 0.0072;
  const fine = opts.fine ?? 0.8;
  const regions = detailRegions(shape);
  const out = { pos: [], nrm: [], surf: [], tri: [] };
  const regionOf = [];
  const mark = (r) => {
    while (regionOf.length < out.pos.length / 3) regionOf.push(r);
  };
  // coarse body: everything outside the detail patches (cut at their planes)
  surfaceNets(
    shape,
    { min: shape.bmin, max: shape.bmax, h: hBody },
    (x, y, z) => {
      for (const r of regions) if (inBox(r, x, y, z) && planeDist(r, x, y, z) > 0) return false;
      return true;
    },
    null,
    out,
  );
  mark(0);
  regions.forEach((r, ri) => {
    surfaceNets(
      shape,
      { min: r.min, max: r.max, h: r.h / fine },
      (x, y, z) => inBox(r, x, y, z) && planeDist(r, x, y, z) >= -OVERLAP,
      (x, y, z) => SINK * (1 - smoothstep(0.004, 0.012, planeDist(r, x, y, z))),
      out,
    );
    mark(ri + 1);
  });
  const nv = out.pos.length / 3;
  const positions = Float32Array.from(out.pos);
  const normals = Float32Array.from(out.nrm);
  const surface = Float32Array.from(out.surf);
  const indices = nv > 65535 ? Uint32Array.from(out.tri) : Uint16Array.from(out.tri);
  const skinIndex = new Uint16Array(nv * 4);
  const skinWeight = new Float32Array(nv * 4);
  const segment = new Uint8Array(nv);
  const wi = [0, 0, 0, 0], ww = [0, 0, 0, 0];
  for (let i = 0; i < nv; i++) {
    const dom = shape.skinWeights(surface[i * 3], surface[i * 3 + 1], surface[i * 3 + 2], wi, ww);
    segment[i] = dom;
    for (let k = 0; k < 4; k++) {
      skinIndex[i * 4 + k] = wi[k];
      skinWeight[i * 4 + k] = ww[k];
    }
  }
  return {
    positions,
    normals,
    surface,
    indices,
    skinIndex,
    skinWeight,
    segment,
    region: Uint8Array.from(regionOf),
    regions: regions.map((r) => r.name),
  };
}
