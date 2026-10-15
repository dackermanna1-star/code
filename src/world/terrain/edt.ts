// Exact Euclidean distance transform (Felzenszwalb & Huttenlocher), O(n) per row/column.

const INF = 1e20;

function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/**
 * Distance (in grid cells) from every cell to the nearest cell where `isSource(i)` is true.
 * Returns Float32Array of Euclidean distances.
 */
export function distanceTransform(w: number, h: number, isSource: ((idx: number) => boolean) | Uint8Array): Float32Array {
  const grid = new Float64Array(w * h);
  if (typeof isSource === 'function') for (let i = 0; i < w * h; i++) grid[i] = isSource(i) ? 0 : INF;
  else for (let i = 0; i < w * h; i++) grid[i] = isSource[i] ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  // columns
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  // rows
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) f[x] = grid[row + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[row + x] = Math.sqrt(d[x]);
  }
  return out;
}

/** Signed distance (cells): positive inside the mask, negative outside. */
export function signedDistance(w: number, h: number, mask: Uint8Array): Float32Array {
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inv[i] = mask[i] ? 0 : 1;
  const inside = distanceTransform(w, h, inv); // distance from inside cells to nearest outside
  const outside = distanceTransform(w, h, mask);
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = mask[i] ? inside[i] - 0.5 : -(outside[i] - 0.5);
  return out;
}
