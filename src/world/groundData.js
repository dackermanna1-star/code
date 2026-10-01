// Ground heightfield for the alley floor: 10 cm voxel columns with heights
// quantized to 5 mm. Built from a drainage profile, wandering tire ruts,
// potholes, raised patches, concrete aprons and drains. Puddles come from a
// priority-flood depression fill, capped to a rain depth so water collects in
// ruts, potholes and the low centre line instead of flooding everything.
import { RNG } from '../core/rng.js';
import { fbm2, valueNoise2, smoothstep } from '../core/noise.js';

export const G = {
  cell: 0.1,
  x0: -23,
  z0: -80,
  nx: 460,
  nz: 1065, // to z = 26.5
  hq: 0.005, // height quantum
};

export const GMAT = {
  ASPHALT: 1,
  PATCH: 2,
  CONCRETE: 3,
  GRAVEL: 4,
  GRATE: 5,
  MANHOLE: 6,
  BRICK: 7,
  STREET: 8,
  SIDEWALK: 9,
  CURB: 10,
};

// Regions that get ground geometry (x0, z0, x1, z1)
const REGIONS = [
  [-3.15, -74.3, 3.15, 14.3], // main alley (slightly under the facades)
  [-22.3, -79.8, 22.3, -73.7], // cross alley
  [-5.2, -45.2, -2.8, -36.8], // L2 dock recess
  [2.8, -46.2, 5.9, -30.8], // R3 setback yard
  [2.8, -14.7, 9.4, -7.8], // fenced yard
  [-23, 14.0, 23, 26.5], // street behind the fence
];

export const DRAINS = [
  { x: 0.05, z: -27.2, w: 0.6, d: 0.45, kind: 'grate' },
  { x: -0.1, z: -61.0, w: 0.6, d: 0.45, kind: 'grate' },
  { x: 0.4, z: -76.8, w: 0.6, d: 0.45, kind: 'grate' },
];
export const MANHOLES = [
  { x: -0.45, z: -12.6, r: 0.33 },
  { x: 0.6, z: -47.8, r: 0.33 },
];
const POTHOLES = [
  { x: 0.9, z: -5.2, r: 0.42, d: 0.045 },
  { x: -1.2, z: -18.9, r: 0.55, d: 0.055 },
  { x: 0.55, z: -33.5, r: 0.36, d: 0.04 },
  { x: -0.7, z: -41.2, r: 0.62, d: 0.05 },
  { x: 1.4, z: -55.6, r: 0.4, d: 0.04 },
  { x: -1.6, z: -67.3, r: 0.48, d: 0.05 },
  { x: 4.5, z: -76.4, r: 0.7, d: 0.05 },
  { x: -9.5, z: -77.6, r: 0.55, d: 0.045 },
];
const PATCHES = [
  [-2.0, -10.4, 0.4, -6.3, 0.004],
  [-0.6, -25.6, 1.9, -22.7, -0.002],
  [-2.4, -49.6, -0.3, -44.2, 0.005],
  [0.2, -70.4, 2.6, -64.8, 0.003],
  [-7.4, -79.2, -2.6, -75.1, 0.004],
];

export function inGround(x, z) {
  for (const r of REGIONS) if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return true;
  return false;
}

function rutCenter(z, side) {
  return side * (0.86 + 0.12 * Math.sin(z * 0.071 + side * 1.3) + 0.05 * Math.sin(z * 0.23));
}

/** Analytic (unquantized) height at a point. */
export function baseHeight(x, z) {
  let h = 0;
  if (z > 14.0) {
    // street: crowned road, curbs + sidewalk near the buildings across
    if (z > 23.6) h = 0.14; // sidewalk
    else if (z < 15.6) h = 0.13; // near sidewalk (alley mouth)
    else h = 0.02 * Math.sin(((z - 15.6) / 8.0) * Math.PI);
    return h;
  }
  const inCross = z < -73.9;
  if (!inCross) {
    // V-shaped drainage toward the centre line
    const ax = Math.min(1, Math.abs(x) / 2.8);
    h += 0.042 * Math.pow(ax, 1.25);
    // longitudinal slope toward drains
    let dd = 1e9;
    for (const d of DRAINS) dd = Math.min(dd, Math.abs(z - d.z) + Math.abs(x - d.x) * 0.5);
    h += Math.min(0.06, dd * 0.0016);
    // tire ruts
    for (const s of [-1, 1]) {
      const c = rutCenter(z, s);
      const t = (x - c) / 0.2;
      h -= 0.011 * Math.exp(-t * t) * (0.7 + 0.3 * valueNoise2(z * 0.3, s * 7, 11));
    }
  } else {
    const az = Math.min(1, Math.abs(z + 76.8) / 2.8);
    h += 0.035 * Math.pow(az, 1.3);
    h += Math.min(0.05, Math.abs(x - 0.4) * 0.0018);
  }
  // large undulation
  h += (fbm2(x * 0.45, z * 0.45, 3, 5) - 0.5) * 0.026;
  h += (valueNoise2(x * 2.2, z * 2.2, 9) - 0.5) * 0.005;
  // potholes
  for (const p of POTHOLES) {
    const dx = x - p.x, dz = z - p.z;
    const a = Math.atan2(dz, dx);
    const rr = p.r * (0.8 + 0.35 * valueNoise2(Math.cos(a) * 2 + p.x, Math.sin(a) * 2 + p.z, 21));
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < rr * 1.15) h -= p.d * smoothstep(rr * 1.15, rr * 0.7, d);
  }
  // patches
  for (const p of PATCHES) if (x >= p[0] && x <= p[2] && z >= p[1] && z <= p[3]) h += p[4];
  // concrete aprons along some walls (raised)
  if (!inCross && Math.abs(x) > 2.5 && apronAt(x, z)) h += 0.018;
  // drains are recessed
  for (const d of DRAINS) {
    const dx = Math.abs(x - d.x), dz = Math.abs(z - d.z);
    if (dx < d.w / 2 + 0.25 && dz < d.d / 2 + 0.25) h -= 0.022 * smoothstep(0.25, 0.0, Math.max(dx - d.w / 2, dz - d.d / 2, 0));
  }
  return h;
}

function apronAt(x, z) {
  // aprons in front of some door zones / along stretches of wall
  const spans = x < 0 ? [[3.0, -2.0], [-34.0, -48.0], [-56.0, -63.0]] : [[-2.0, -6.5], [-18.5, -26.0], [-57.0, -62.0]];
  for (const [a, b] of spans) if (z <= a && z >= b) return true;
  return false;
}

export function materialAt(x, z) {
  if (z > 14.0) {
    if (z > 23.6 || z < 15.6) return GMAT.SIDEWALK;
    return GMAT.STREET;
  }
  for (const d of DRAINS) if (Math.abs(x - d.x) <= d.w / 2 && Math.abs(z - d.z) <= d.d / 2) return GMAT.GRATE;
  for (const m of MANHOLES) if ((x - m.x) ** 2 + (z - m.z) ** 2 <= m.r * m.r) return GMAT.MANHOLE;
  for (const p of POTHOLES) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r * 0.55 && valueNoise2(x * 6, z * 6, 3) > 0.45) return GMAT.BRICK; // old brick paving shows through
    if (d < p.r * 0.85) return GMAT.GRAVEL;
  }
  for (const p of PATCHES) if (x >= p[0] && x <= p[2] && z >= p[1] && z <= p[3]) return GMAT.PATCH;
  if (z > -73.9 && Math.abs(x) > 2.5 && apronAt(x, z)) return GMAT.CONCRETE;
  if (Math.abs(x) > 2.65 && z > -73.9 && valueNoise2(x * 3, z * 3, 7) > 0.5) return GMAT.GRAVEL;
  return GMAT.ASPHALT;
}

/** Priority-flood depression filling, then cap each basin to a rain depth. */
function computeWater(hq, mask, nx, nz, cap) {
  const N = nx * nz;
  const filled = new Float32Array(N);
  const done = new Uint8Array(N);
  // binary heap of indices keyed by filled height
  const heap = new Int32Array(N);
  let hs = 0;
  const key = filled;
  const push = (i) => {
    let k = hs++;
    heap[k] = i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (key[heap[p]] <= key[heap[k]]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    heap[0] = heap[--hs];
    let k = 0;
    for (;;) {
      const l = 2 * k + 1, r = l + 1;
      let m = k;
      if (l < hs && key[heap[l]] < key[heap[m]]) m = l;
      if (r < hs && key[heap[r]] < key[heap[m]]) m = r;
      if (m === k) break;
      [heap[m], heap[k]] = [heap[k], heap[m]];
      k = m;
    }
    return top;
  };
  // seed with boundary cells (mask edge) and drains (water escapes there)
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const id = i + j * nx;
      if (!mask[id]) continue;
      let edge = i === 0 || j === 0 || i === nx - 1 || j === nz - 1;
      if (!edge) edge = !mask[id - 1] || !mask[id + 1] || !mask[id - nx] || !mask[id + nx];
      if (edge || hq.drain[id]) {
        filled[id] = hq.h[id];
        done[id] = 1;
        push(id);
      }
    }
  while (hs > 0) {
    const c = pop();
    const ci = c % nx, cj = (c / nx) | 0;
    const nb = [ci > 0 ? c - 1 : -1, ci < nx - 1 ? c + 1 : -1, cj > 0 ? c - nx : -1, cj < nz - 1 ? c + nx : -1];
    for (const n of nb) {
      if (n < 0 || done[n] || !mask[n]) continue;
      done[n] = 1;
      filled[n] = Math.max(hq.h[n], filled[c]);
      push(n);
    }
  }
  // basins: connected components of filled > h; cap their level
  const level = new Float32Array(N);
  const comp = new Int32Array(N).fill(-1);
  const stack = [];
  let nc = 0;
  for (let id = 0; id < N; id++) {
    if (!mask[id] || comp[id] >= 0 || filled[id] - hq.h[id] < 0.0005) continue;
    // flood the component
    const cells = [];
    stack.push(id);
    comp[id] = nc;
    let minH = 1e9;
    let maxF = -1e9;
    while (stack.length) {
      const c = stack.pop();
      cells.push(c);
      minH = Math.min(minH, hq.h[c]);
      maxF = Math.max(maxF, filled[c]);
      const ci = c % nx, cj = (c / nx) | 0;
      const nb = [ci > 0 ? c - 1 : -1, ci < nx - 1 ? c + 1 : -1, cj > 0 ? c - nx : -1, cj < nz - 1 ? c + nx : -1];
      for (const n of nb) {
        if (n < 0 || !mask[n] || comp[n] >= 0) continue;
        if (filled[n] - hq.h[n] < 0.0005) continue;
        comp[n] = nc;
        stack.push(n);
      }
    }
    const lvl = Math.min(maxF, minH + cap(cells.length));
    for (const c of cells) level[c] = lvl;
    nc++;
  }
  const depth = new Float32Array(N);
  for (let id = 0; id < N; id++) if (mask[id]) depth[id] = Math.max(0, level[id] - hq.h[id]);
  return { depth, level };
}

export function buildGroundData() {
  const { nx, nz, cell, x0, z0, hq: q } = G;
  const N = nx * nz;
  const h = new Float32Array(N);
  const mat = new Uint8Array(N);
  const mask = new Uint8Array(N);
  const drain = new Uint8Array(N);
  for (let j = 0; j < nz; j++) {
    const z = z0 + (j + 0.5) * cell;
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * cell;
      const id = i + j * nx;
      if (!inGround(x, z)) continue;
      mask[id] = 1;
      const m = materialAt(x, z);
      mat[id] = m;
      let hh = baseHeight(x, z);
      if (m === GMAT.GRATE) {
        hh -= 0.01;
        drain[id] = 1;
      }
      if (m === GMAT.MANHOLE) hh = Math.round(hh / q) * q + 0.003;
      h[id] = Math.round(hh / q) * q;
    }
  }
  const hq = { h, drain };
  // rain cap: small basins hold a little water, larger ones a bit more
  const { depth, level } = computeWater(hq, mask, nx, nz, (n) => 0.006 + Math.min(0.022, n * 0.00012));
  return { h, mat, mask, depth, level, nx, nz, cell, x0, z0 };
}

export function makeSampler(data) {
  const { h, depth, mat, mask, nx, nz, cell, x0, z0 } = data;
  const idx = (x, z) => {
    const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return -1;
    return i + j * nx;
  };
  return {
    height(x, z) {
      const id = idx(x, z);
      return id < 0 || !mask[id] ? 0 : h[id];
    },
    /** Bilinear smooth height (for feet / camera). */
    smoothHeight(x, z) {
      const fx = (x - x0) / cell - 0.5, fz = (z - z0) / cell - 0.5;
      const i = Math.floor(fx), j = Math.floor(fz);
      const tx = fx - i, tz = fz - j;
      const g = (a, b) => {
        if (a < 0 || b < 0 || a >= nx || b >= nz) return 0;
        const id = a + b * nx;
        return mask[id] ? Math.max(h[id], h[id] + depth[id] * 0) : 0;
      };
      return (g(i, j) * (1 - tx) + g(i + 1, j) * tx) * (1 - tz) + (g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx) * tz;
    },
    water(x, z) {
      const id = idx(x, z);
      return id < 0 ? 0 : depth[id];
    },
    material(x, z) {
      const id = idx(x, z);
      return id < 0 ? 0 : mat[id];
    },
  };
}
