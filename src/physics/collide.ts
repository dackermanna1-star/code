// Narrow phase: sphere samples against voxel grids. Contacts are generated against *exposed* voxel
// faces/edges/corners only, so bodies slide smoothly over voxel seams (no internal-edge snagging).

export interface GridView {
  data: Uint8Array;
  sx: number; sy: number; sz: number;
  /** grid coordinate of data[0] */
  ox: number; oy: number; oz: number;
  /** value returned outside the data box */
  outside: number;
}

export function gridGet(g: GridView, x: number, y: number, z: number): number {
  x -= g.ox; y -= g.oy; z -= g.oz;
  if (x < 0 || y < 0 || z < 0 || x >= g.sx || y >= g.sy || z >= g.sz) return g.outside;
  return g.data[x + g.sx * (z + g.sz * y)];
}

/** Raw contacts in the target grid's frame (voxel units). */
export class RawContacts {
  n = 0;
  cap = 0;
  p = new Float64Array(0);
  nrm = new Float64Array(0);
  depth = new Float64Array(0);
  sample = new Int32Array(0);
  feat = new Int32Array(0);
  mat = new Uint8Array(0);
  constructor(cap = 256) { this.grow(cap); }
  private grow(cap: number): void {
    const p = new Float64Array(cap * 3), nrm = new Float64Array(cap * 3), depth = new Float64Array(cap);
    const sample = new Int32Array(cap), feat = new Int32Array(cap), mat = new Uint8Array(cap);
    p.set(this.p); nrm.set(this.nrm); depth.set(this.depth); sample.set(this.sample); feat.set(this.feat); mat.set(this.mat);
    this.p = p; this.nrm = nrm; this.depth = depth; this.sample = sample; this.feat = feat; this.mat = mat;
    this.cap = cap;
  }
  reset(): void { this.n = 0; }
  push(px: number, py: number, pz: number, nx: number, ny: number, nz: number, depth: number, sample: number, feat: number, mat: number): void {
    if (this.n >= this.cap) this.grow(this.cap * 2);
    const i = this.n++;
    this.p[i * 3] = px; this.p[i * 3 + 1] = py; this.p[i * 3 + 2] = pz;
    this.nrm[i * 3] = nx; this.nrm[i * 3 + 1] = ny; this.nrm[i * 3 + 2] = nz;
    this.depth[i] = depth; this.sample[i] = sample; this.feat[i] = feat; this.mat[i] = mat;
  }
}

/**
 * Contacts between a sphere (center p, radius r, grid voxel units) and the solid voxels of g.
 * Normals point from the grid towards the sphere. depth > 0 means penetration; contacts with
 * depth > -margin are reported (speculative contacts).
 */
export function sphereVsGrid(g: GridView, px: number, py: number, pz: number, r: number, margin: number, sample: number, out: RawContacts): void {
  const reach = r + margin;
  const x0 = Math.floor(px - reach), x1 = Math.floor(px + reach);
  const y0 = Math.floor(py - reach), y1 = Math.floor(py + reach);
  const z0 = Math.floor(pz - reach), z1 = Math.floor(pz + reach);
  const reach2 = reach * reach;
  const data = g.data, gsx = g.sx, gsy = g.sy, gsz = g.sz, gox = g.ox, goy = g.oy, goz = g.oz, outside = g.outside;
  for (let y = y0; y <= y1; y++) {
    const ly = y - goy;
    for (let z = z0; z <= z1; z++) {
      const lz = z - goz;
      for (let x = x0; x <= x1; x++) {
        const lx = x - gox;
        let v: number;
        if (lx < 0 || ly < 0 || lz < 0 || lx >= gsx || ly >= gsy || lz >= gsz) v = outside;
        else v = data[lx + gsx * (lz + gsz * ly)];
        if (!v) continue;
        const cx = px < x ? -1 : px > x + 1 ? 1 : 0;
        const cy = py < y ? -1 : py > y + 1 ? 1 : 0;
        const cz = pz < z ? -1 : pz > z + 1 ? 1 : 0;
        if (cx !== 0 || cy !== 0 || cz !== 0) {
          // all clamped faces must be exposed, otherwise this feature is internal
          if (cx !== 0 && gridGet(g, x + cx, y, z)) continue;
          if (cy !== 0 && gridGet(g, x, y + cy, z)) continue;
          if (cz !== 0 && gridGet(g, x, y, z + cz)) continue;
          const qx = cx < 0 ? x : cx > 0 ? x + 1 : px;
          const qy = cy < 0 ? y : cy > 0 ? y + 1 : py;
          const qz = cz < 0 ? z : cz > 0 ? z + 1 : pz;
          const dx = px - qx, dy = py - qy, dz = pz - qz;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= reach2) continue;
          const d = Math.sqrt(d2);
          const inv = d > 1e-9 ? 1 / d : 0;
          out.push(qx, qy, qz, dx * inv, dy * inv, dz * inv, r - d, sample, (x * 73856093) ^ (y * 19349663) ^ (z * 83492791), v);
        } else {
          // sphere center inside this voxel: exit through the nearest exposed face
          let best = 1e9, bn = -1;
          let dd: number;
          if (!gridGet(g, x + 1, y, z)) { dd = x + 1 - px; if (dd < best) { best = dd; bn = 0; } }
          if (!gridGet(g, x - 1, y, z)) { dd = px - x; if (dd < best) { best = dd; bn = 1; } }
          if (!gridGet(g, x, y + 1, z)) { dd = y + 1 - py; if (dd < best) { best = dd; bn = 2; } }
          if (!gridGet(g, x, y - 1, z)) { dd = py - y; if (dd < best) { best = dd; bn = 3; } }
          if (!gridGet(g, x, y, z + 1)) { dd = z + 1 - pz; if (dd < best) { best = dd; bn = 4; } }
          if (!gridGet(g, x, y, z - 1)) { dd = pz - z; if (dd < best) { best = dd; bn = 5; } }
          if (bn < 0) continue;
          const nx = bn === 0 ? 1 : bn === 1 ? -1 : 0, ny = bn === 2 ? 1 : bn === 3 ? -1 : 0, nz = bn === 4 ? 1 : bn === 5 ? -1 : 0;
          out.push(px + nx * best, py + ny * best, pz + nz * best, nx, ny, nz, r + best, sample, (x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ 0x5555, v);
        }
      }
    }
  }
}

/**
 * Fast variant of sphereVsGrid for a padded cache box (caller guarantees all lookups including the
 * +-1 neighbours stay inside the data box). `coarse` is a 4x4x4-cell occupancy grid of the same box
 * used to reject samples far from any solid voxel.
 */
export function sphereVsCache(g: GridView, coarse: Uint8Array, cx: number, cy: number, cz: number,
  px: number, py: number, pz: number, r: number, margin: number, sample: number, out: RawContacts): void {
  const reach = r + margin;
  const gox = g.ox, goy = g.oy, goz = g.oz;
  const x0 = Math.floor(px - reach), x1 = Math.floor(px + reach);
  const y0 = Math.floor(py - reach), y1 = Math.floor(py + reach);
  const z0 = Math.floor(pz - reach), z1 = Math.floor(pz + reach);
  // coarse rejection
  const ca = (x0 - gox) >> 2, cb = (x1 - gox) >> 2, cc = (y0 - goy) >> 2, cd = (y1 - goy) >> 2, ce = (z0 - goz) >> 2, cf = (z1 - goz) >> 2;
  let any = 0;
  for (let y = cc; y <= cd && !any; y++) for (let z = ce; z <= cf && !any; z++) for (let x = ca; x <= cb; x++) {
    if (coarse[x + cx * (z + cz * y)]) { any = 1; break; }
  }
  if (!any) return;
  const data = g.data, sx = g.sx, sxz = g.sx * g.sz;
  const reach2 = reach * reach;
  const n0 = out.n;
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      let idx = (x0 - gox) + sx * ((z - goz) + g.sz * (y - goy));
      for (let x = x0; x <= x1; x++, idx++) {
        const v = data[idx];
        if (!v) continue;
        const kx = px < x ? -1 : px > x + 1 ? 1 : 0;
        const ky = py < y ? -1 : py > y + 1 ? 1 : 0;
        const kz = pz < z ? -1 : pz > z + 1 ? 1 : 0;
        if (kx !== 0 || ky !== 0 || kz !== 0) {
          if (kx !== 0 && data[idx + kx]) continue;
          if (ky !== 0 && data[idx + ky * sxz]) continue;
          if (kz !== 0 && data[idx + kz * sx]) continue;
          const qx = kx < 0 ? x : kx > 0 ? x + 1 : px;
          const qy = ky < 0 ? y : ky > 0 ? y + 1 : py;
          const qz = kz < 0 ? z : kz > 0 ? z + 1 : pz;
          const dx = px - qx, dy = py - qy, dz = pz - qz;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= reach2) continue;
          const d = Math.sqrt(d2);
          const inv = d > 1e-9 ? 1 / d : 0;
          out.push(qx, qy, qz, dx * inv, dy * inv, dz * inv, r - d, sample, (x * 73856093) ^ (y * 19349663) ^ (z * 83492791), v);
        } else {
          let best = 1e9, bn = -1, dd: number;
          if (!data[idx + 1]) { dd = x + 1 - px; if (dd < best) { best = dd; bn = 0; } }
          if (!data[idx - 1]) { dd = px - x; if (dd < best) { best = dd; bn = 1; } }
          if (!data[idx + sxz]) { dd = y + 1 - py; if (dd < best) { best = dd; bn = 2; } }
          if (!data[idx - sxz]) { dd = py - y; if (dd < best) { best = dd; bn = 3; } }
          if (!data[idx + sx]) { dd = z + 1 - pz; if (dd < best) { best = dd; bn = 4; } }
          if (!data[idx - sx]) { dd = pz - z; if (dd < best) { best = dd; bn = 5; } }
          if (bn < 0) continue;
          const nx = bn === 0 ? 1 : bn === 1 ? -1 : 0, ny = bn === 2 ? 1 : bn === 3 ? -1 : 0, nz = bn === 4 ? 1 : bn === 5 ? -1 : 0;
          out.push(px + nx * best, py + ny * best, pz + nz * best, nx, ny, nz, r + best, sample, (x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ 0x5555, v);
        }
      }
    }
  }
  if (out.n === n0) {
    // fully buried sample (e.g. pushed deep into the ground): push it up to the first open voxel
    const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
    let idx = (ix - gox) + sx * ((iz - goz) + g.sz * (iy - goy));
    if (ix - gox >= 0 && iy - goy >= 0 && iz - goz >= 0 && ix - gox < sx && iy - goy < g.sy && iz - goz < g.sz && data[idx]) {
      let yy = iy;
      while (yy - goy < g.sy - 1 && data[idx]) { idx += sxz; yy++; }
      const depth = yy - py + r;
      out.push(px, yy, pz, 0, 1, 0, Math.min(depth, 3), sample, (ix * 73856093) ^ 0x777, data[(ix - gox) + sx * ((iz - goz) + g.sz * (iy - goy))]);
    }
  }
}

/** Build 4x4x4 coarse occupancy of a cache box. Returns dims [cx, cy, cz]. */
export function buildCoarse(data: Uint8Array, sx: number, sy: number, sz: number, out: Uint8Array): [number, number, number] {
  const cx = (sx + 3) >> 2, cy = (sy + 3) >> 2, cz = (sz + 3) >> 2;
  out.fill(0, 0, cx * cy * cz);
  let i = 0;
  for (let y = 0; y < sy; y++) {
    const oy = (y >> 2) * cz;
    for (let z = 0; z < sz; z++) {
      const oz = (oy + (z >> 2)) * cx;
      for (let x = 0; x < sx; x++, i++) if (data[i]) out[oz + (x >> 2)] = 1;
    }
  }
  return [cx, cy, cz];
}

/**
 * Reduce contacts [from, to) of `c` to a small, temporally stable set per normal-direction bucket:
 * the extreme points of the contact patch along the four tangent diagonals (stable from frame to frame,
 * which keeps warm starting coherent) plus the deepest point when it is clearly deeper.
 * `unit` = length of one meter in the contact units (1 for meters, 10 for voxel units).
 */
export function reduceContacts(c: RawContacts, from: number, to: number, maxPerBucket: number, keep: number[], unit = 1): void {
  keep.length = 0;
  const n = to - from;
  if (n <= maxPerBucket) { for (let i = from; i < to; i++) keep.push(i); return; }
  const buckets = BUCKETS;
  for (let b = 0; b < 6; b++) buckets[b].length = 0;
  for (let i = from; i < to; i++) {
    const nx = c.nrm[i * 3], ny = c.nrm[i * 3 + 1], nz = c.nrm[i * 3 + 2];
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const b = ax >= ay && ax >= az ? (nx > 0 ? 0 : 1) : ay >= az ? (ny > 0 ? 2 : 3) : (nz > 0 ? 4 : 5);
    buckets[b].push(i);
  }
  const P = c.p, D = c.depth;
  for (const bk of buckets) {
    if (bk.length === 0) continue;
    if (bk.length <= maxPerBucket) { for (const i of bk) keep.push(i); continue; }
    // average normal and tangent frame
    let nx = 0, ny = 0, nz = 0;
    for (const i of bk) { nx += c.nrm[i * 3]; ny += c.nrm[i * 3 + 1]; nz += c.nrm[i * 3 + 2]; }
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let t1x: number, t1y: number, t1z: number;
    if (Math.abs(nx) > 0.57) { t1x = ny; t1y = -nx; t1z = 0; } else { t1x = 0; t1y = nz; t1z = -ny; }
    const tl = 1 / Math.hypot(t1x, t1y, t1z); t1x *= tl; t1y *= tl; t1z *= tl;
    const t2x = ny * t1z - nz * t1y, t2y = nz * t1x - nx * t1z, t2z = nx * t1y - ny * t1x;
    const start = keep.length;
    let deepest = bk[0];
    for (const i of bk) if (D[i] > D[deepest]) deepest = i;
    for (let k = 0; k < 4; k++) {
      const sa = k & 1 ? -1 : 1, sb = k & 2 ? -1 : 1;
      const dx = t1x * sa + t2x * sb, dy = t1y * sa + t2y * sb, dz = t1z * sa + t2z * sb;
      let best = -1, bv = -Infinity;
      for (const i of bk) {
        // small depth weight breaks ties towards deeper points
        const v = P[i * 3] * dx + P[i * 3 + 1] * dy + P[i * 3 + 2] * dz + D[i] * 0.25;
        if (v > bv + 1e-9 * unit) { bv = v; best = i; }
      }
      let dup = false;
      for (let j = start; j < keep.length; j++) if (keep[j] === best) { dup = true; break; }
      if (!dup) keep.push(best);
    }
    let minSel = Infinity;
    for (let j = start; j < keep.length; j++) minSel = Math.min(minSel, D[keep[j]]);
    if (D[deepest] > minSel + 0.004 * unit) {
      let dup = false;
      for (let j = start; j < keep.length; j++) if (keep[j] === deepest) { dup = true; break; }
      if (!dup) keep.push(deepest);
    }
  }
}

const BUCKETS: number[][] = [[], [], [], [], [], []];
