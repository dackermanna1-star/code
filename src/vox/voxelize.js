// Voxel monsters: every rotated sprite frame is rebuilt as a 3D model by
// carving a block of voxels with the silhouettes of its eight rotations (a
// visual hull). Surface voxels take their colour from the rotation that
// faces them best, so each view of the model reproduces the original art.
// The model is then cut into rigid body parts (pelvis, chest, head, upper
// and lower arms and legs) for ragdolls.
//
// Pure JS with no DOM or GL, so it also runs in Node and in workers.

const BIG = 1e9;

// Per-sprite build settings. kind: 'humanoid' and 'beast' are cut at
// anatomical heights, 'spider' splits legs off a thick core, 'rigid' is a
// single body. ragdoll: false keeps the original sprite death animation.
export const VOX_TYPES = {
  POSS: { kind: 'humanoid' },
  SPOS: { kind: 'humanoid' },
  CPOS: { kind: 'humanoid' },
  SSWV: { kind: 'humanoid' },
  PLAY: { kind: 'humanoid' },
  TROO: { kind: 'humanoid' },
  BOSS: { kind: 'humanoid' },
  BOS2: { kind: 'humanoid' },
  SKEL: { kind: 'humanoid', body: { trunk: 1.0 } },
  VILE: { kind: 'humanoid', body: { trunk: 1.0 } },
  CYBR: { kind: 'humanoid', body: { hip: 0.44, knee: 0.22 } },
  FATT: { kind: 'humanoid', body: { hip: 0.34, knee: 0.17, waist: 0.55, neck: 0.86 } },
  SARG: { kind: 'beast' },
  HEAD: { kind: 'rigid' },
  PAIN: { kind: 'rigid', ragdoll: false },
  SKUL: { kind: 'rigid', ragdoll: false },
  SPID: { kind: 'spider', coreK: 0.5, maxVoxels: 1.6e6 },
  BSPI: { kind: 'spider', coreK: 0.5 },
};

const MAX_LABELS = 24;

// --- Grid helpers -------------------------------------------------------------
// Solid voxels never touch the grid border, so neighbour lookups by flat
// offset from a solid voxel always stay inside the grid.

function offsets6(nx, ny) { return [1, -1, nx, -nx, nx * ny, -nx * ny]; }
function offsets26(nx, ny) {
  const o = [];
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx || dy || dz) o.push(dx + dy * nx + dz * nx * ny);
  }
  return o;
}

// Connected components of voxels with mask[i] === value. Returns
// { comp: Int32Array (0 = none, else id), sizes: [0, size1, ...] }.
function components(mask, value, N, offs) {
  const comp = new Int32Array(N);
  const sizes = [0];
  const queue = new Int32Array(N);
  const no = offs.length;
  for (let s = 0; s < N; s++) {
    if (comp[s] || mask[s] !== value) continue;
    const id = sizes.length;
    let qh = 0, qt = 0;
    queue[qt++] = s;
    comp[s] = id;
    while (qh < qt) {
      const c = queue[qh++];
      for (let k = 0; k < no; k++) {
        const n = c + offs[k];
        if (comp[n] || mask[n] !== value) continue;
        comp[n] = id;
        queue[qt++] = n;
      }
    }
    sizes.push(qt);
  }
  return { comp, sizes };
}

// 1D lower envelope of parabolas (Felzenszwalb & Huttenlocher).
function edt1(f, d, n, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -BIG; z[1] = BIG;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q; z[k] = s; z[k + 1] = BIG;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

// In place: out[p] = min over q of |p - q|^2 + out[q].
function envelope3(out, nx, ny, nz) {
  const m = Math.max(nx, ny, nz);
  const f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  const pass = (n, count, base, stride) => {
    for (let c = 0; c < count; c++) {
      const b = base(c);
      for (let q = 0; q < n; q++) f[q] = out[b + q * stride];
      edt1(f, d, n, v, z);
      for (let q = 0; q < n; q++) out[b + q * stride] = d[q];
    }
  };
  pass(nx, ny * nz, (c) => c * nx, 1);
  pass(ny, nx * nz, (c) => (Math.floor(c / nx) * ny * nx) + (c % nx), nx);
  pass(nz, nx * ny, (c) => c, nx * ny);
}

// Squared distance from each solid voxel to the nearest empty voxel.
export function edt3(solid, nx, ny, nz) {
  const N = nx * ny * nz;
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = solid[i] ? BIG : 0;
  envelope3(out, nx, ny, nz);
  return out;
}

// --- Carving --------------------------------------------------------------------

// Plain sprite data for one frame (what a worker needs to build it).
export function frameViews(res, frame) {
  if (!frame || !frame.rotate) return null;
  const out = [];
  for (let r = 0; r < 8; r++) {
    const info = res.images[frame.images[r]];
    if (!info || !info.img) return null;
    out.push({ w: info.width, h: info.height, left: info.leftOffset, top: info.topOffset, flip: !!frame.flip[r], pixels: info.img.pixels, mask: info.img.mask });
  }
  return out;
}

// Builds the voxel model of one rotated sprite frame from `frameViews`
// output. Returns null when nothing solid is left.
export function buildVoxelModel(viewData, opts = {}) {
  if (!viewData) return null;
  const views = viewData.map((d, r) => {
    const a = Math.PI + r * Math.PI / 4;
    return { img: d, w: d.w, h: d.h, left: d.left, top: d.top, flip: d.flip, vx: Math.cos(a), vy: Math.sin(a), rx: Math.sin(a), ry: -Math.cos(a) };
  });
  const cfg = opts.cfg || {};
  const tol = cfg.tol ?? 1;
  let half = 0, top = -BIG, bot = BIG;
  for (const v of views) {
    half = Math.max(half, v.left, v.w - v.left);
    top = Math.max(top, v.top);
    bot = Math.min(bot, v.top - v.h);
  }
  // Very large monsters use 2-unit voxels to keep memory sensible.
  const maxVoxels = cfg.maxVoxels ?? 2.5e6;
  const reach = half / 0.92;
  let s = 1;
  if ((2 * reach + 4) * (2 * reach + 4) * (top - bot + 4) > maxVoxels) s = 2;
  const R = Math.ceil(reach) + 2 * s;
  let nx = Math.ceil(2 * R / s), ny = nx;
  const gz0 = bot - s;
  let nz = Math.ceil((top - bot + 2 * s) / s);
  let g0 = [-R, -R, gz0];
  let N = nx * ny * nz;
  let solid = new Uint8Array(N);

  // Carve: keep voxels inside all but `tol` silhouettes. Views 0/4 bound y
  // and 2/6 bound x, so each slice only scans the union of their spans.
  const rowOff = new Int32Array(8);
  let count = 0;
  const lo = [nx, ny, nz], hi = [-1, -1, -1];
  const span = (v, ro, axisSign) => {
    // Opaque extent of a row as a range of model coordinate along the
    // view's screen-right axis (sign +1 or -1 picks the axis direction).
    let u0 = -1, u1 = -1;
    for (let u = 0; u < v.w; u++) if (v.img.mask[ro + u]) { if (u0 < 0) u0 = u; u1 = u; }
    if (u0 < 0) return null;
    if (v.flip) { const t = v.w - 1 - u1; u1 = v.w - 1 - u0; u0 = t; }
    const a = u0 - v.left, b = u1 + 1 - v.left;
    return axisSign > 0 ? [a, b] : [-b, -a];
  };
  const unionIdx = (r1, r2, n) => {
    let a = BIG, b = -BIG;
    for (const r of [r1, r2]) if (r) { a = Math.min(a, r[0]); b = Math.max(b, r[1]); }
    if (a > b) return null;
    return [Math.max(1, Math.floor((a + R) / s) - 1), Math.min(n - 2, Math.ceil((b + R) / s) + 1)];
  };
  for (let k = 1; k < nz - 1; k++) {
    const pz = gz0 + (k + 0.5) * s;
    let rowsIn = 0;
    for (let vi = 0; vi < 8; vi++) {
      const v = views[vi];
      const row = Math.floor(v.top - pz);
      rowOff[vi] = row >= 0 && row < v.h ? row * v.w : -1;
      if (rowOff[vi] >= 0) rowsIn++;
    }
    if (rowsIn < 8 - tol) continue;
    // View 0 looks along -x (right = +y), view 4 along +x (right = -y);
    // view 2 has right = -x, view 6 right = +x.
    const yr = unionIdx(rowOff[0] >= 0 ? span(views[0], rowOff[0], 1) : null, rowOff[4] >= 0 ? span(views[4], rowOff[4], -1) : null, ny);
    const xr = unionIdx(rowOff[2] >= 0 ? span(views[2], rowOff[2], -1) : null, rowOff[6] >= 0 ? span(views[6], rowOff[6], 1) : null, nx);
    if (!yr || !xr) continue;
    for (let j = yr[0]; j <= yr[1]; j++) {
      const py = -R + (j + 0.5) * s;
      for (let i = xr[0]; i <= xr[1]; i++) {
        const px = -R + (i + 0.5) * s;
        let empty = 0;
        for (let vi = 0; vi < 8; vi++) {
          const v = views[vi];
          const ro = rowOff[vi];
          let inside = false;
          if (ro >= 0) {
            let u = Math.floor(px * v.rx + py * v.ry + v.left);
            if (v.flip) u = v.w - 1 - u;
            inside = u >= 0 && u < v.w && v.img.mask[ro + u] !== 0;
          }
          if (!inside && ++empty > tol) break;
        }
        if (empty <= tol) {
          solid[(k * ny + j) * nx + i] = 1;
          count++;
          if (i < lo[0]) lo[0] = i; if (j < lo[1]) lo[1] = j; if (k < lo[2]) lo[2] = k;
          if (i > hi[0]) hi[0] = i; if (j > hi[1]) hi[1] = j; if (k > hi[2]) hi[2] = k;
        }
      }
    }
  }
  if (!count) return null;

  // Crop to the solid's bounds plus a one-voxel empty border.
  {
    const cx = hi[0] - lo[0] + 3, cy = hi[1] - lo[1] + 3, cz = hi[2] - lo[2] + 3;
    const out = new Uint8Array(cx * cy * cz);
    for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) {
      const src = (k * ny + j) * nx;
      const dst = ((k - lo[2] + 1) * cy + (j - lo[1] + 1)) * cx + 1;
      for (let i = lo[0]; i <= hi[0]; i++) out[dst + i - lo[0]] = solid[src + i];
    }
    g0 = [g0[0] + (lo[0] - 1) * s, g0[1] + (lo[1] - 1) * s, g0[2] + (lo[2] - 1) * s];
    nx = cx; ny = cy; nz = cz; N = nx * ny * nz;
    solid = out;
  }

  // Drop specks: only components of a reasonable size survive.
  {
    const { comp, sizes } = components(solid, 1, N, offsets26(nx, ny));
    let biggest = 0;
    for (let c = 1; c < sizes.length; c++) biggest = Math.max(biggest, sizes[c]);
    const keepMin = Math.max(6, Math.min(biggest, count * 0.004));
    count = 0;
    for (let i = 0; i < N; i++) {
      if (solid[i] && sizes[comp[i]] < keepMin) solid[i] = 0;
      if (solid[i]) count++;
    }
  }

  const model = {
    nx, ny, nz, s, g0, count, top, bot,
    solid,
    color: null,
    labels: new Uint8Array(N),
    parts: [],
    joints: [],
  };
  model.color = colourModel(model, views);
  segmentModel(model, cfg);
  return model;
}

// Colour every solid voxel: surface voxels from the best-facing rotation
// that sees them, the rest from the nearest coloured voxel (so a bending
// joint shows skin, not a hole).
function colourModel(model, views) {
  const { nx, ny, nz, s, g0, solid } = model;
  const N = nx * ny * nz;
  // Outward normals from the gradient of a 5^3 box-blurred occupancy.
  const a = new Float32Array(N), b = new Float32Array(N);
  for (let i = 0; i < N; i++) a[i] = solid[i];
  // Running-sum box filter of radius 2 along one axis.
  const box = (src, dst, stride, n, outer) => {
    for (let c = 0; c < outer.length; c++) {
      const b0 = outer[c];
      let sum = 0;
      for (let q = 0; q < 2 && q < n; q++) sum += src[b0 + q * stride];
      for (let q = 0; q < n; q++) {
        if (q + 2 < n) sum += src[b0 + (q + 2) * stride];
        if (q - 3 >= 0) sum -= src[b0 + (q - 3) * stride];
        dst[b0 + q * stride] = sum;
      }
    }
  };
  const rowsX = new Int32Array(ny * nz), rowsY = new Int32Array(nx * nz), rowsZ = new Int32Array(nx * ny);
  for (let c = 0; c < ny * nz; c++) rowsX[c] = c * nx;
  for (let z = 0, c = 0; z < nz; z++) for (let x = 0; x < nx; x++) rowsY[c++] = z * nx * ny + x;
  for (let c = 0; c < nx * ny; c++) rowsZ[c] = c;
  box(a, b, 1, nx, rowsX);
  box(b, a, nx, ny, rowsY);
  box(a, b, nx * ny, nz, rowsZ);
  const sm = b;
  // Horizontal normal per solid voxel (views are all horizontal).
  // Only voxels within two steps of empty space (5^3 sum < 125) can be
  // seen; list them with their coordinates and normals.
  const sx = 1, sy = nx, sz = nx * ny;
  const surf = [];
  for (let i = 0; i < N; i++) if (solid[i] && sm[i] < 124.5) surf.push(i);
  const M = surf.length;
  const sPx = new Float32Array(M), sPy = new Float32Array(M), sRow = new Int32Array(M);
  const nrmX = new Float32Array(M), nrmY = new Float32Array(M);
  for (let m = 0; m < M; m++) {
    const i = surf[m];
    const gx = sm[i + sx] - sm[i - sx], gy = sm[i + sy] - sm[i - sy], gz = sm[i + sz] - sm[i - sz];
    const gl = Math.hypot(gx, gy, gz) || 1;
    nrmX[m] = gx / gl; nrmY[m] = gy / gl;
    sPx[m] = g0[0] + (i % nx + 0.5) * s;
    sPy[m] = g0[1] + (Math.floor(i / nx) % ny + 0.5) * s;
    sRow[m] = Math.floor(i / (nx * ny));
  }

  const color = new Int16Array(N).fill(-1);
  const best = new Float32Array(M).fill(-BIG);
  const pix = new Int32Array(M);
  const dep = new Float32Array(M);
  const zRow = new Int32Array(nz);
  for (const v of views) {
    const W = v.w, H = v.h;
    const depth = new Float32Array(W * H).fill(BIG);
    for (let z = 0; z < nz; z++) zRow[z] = Math.floor(v.top - (g0[2] + (z + 0.5) * s));
    for (let m = 0; m < M; m++) {
      pix[m] = -1;
      const row = zRow[sRow[m]];
      if (row < 0 || row >= H) continue;
      const px = sPx[m], py = sPy[m];
      let u = Math.floor(px * v.rx + py * v.ry + v.left);
      if (v.flip) u = W - 1 - u;
      if (u < 0 || u >= W) continue;
      const p = row * W + u;
      if (!v.img.mask[p]) continue;
      const d = px * v.vx + py * v.vy;
      pix[m] = p;
      dep[m] = d;
      if (d < depth[p]) depth[p] = d;
    }
    const tolD = 1.5 * s;
    for (let m = 0; m < M; m++) {
      const p = pix[m];
      if (p < 0 || dep[m] > depth[p] + tolD) continue;
      // Outward normal is -grad; it faces the viewer when -n . v > 0.
      const facing = nrmX[m] * v.vx + nrmY[m] * v.vy;
      const score = facing - (dep[m] - depth[p]) * 0.25 / s;
      if (score > best[m]) { best[m] = score; color[surf[m]] = v.img.pixels[p]; }
    }
  }
  // Fill the rest by breadth-first growth from coloured voxels.
  const offs = offsets6(nx, ny);
  const queue = new Int32Array(N);
  let qh = 0, qt = 0;
  for (let i = 0; i < N; i++) if (solid[i] && color[i] >= 0) queue[qt++] = i;
  while (qh < qt) {
    const c = queue[qh++];
    for (let k = 0; k < 6; k++) {
      const n = c + offs[k];
      if (!solid[n] || color[n] >= 0) continue;
      color[n] = color[c];
      queue[qt++] = n;
    }
  }
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) out[i] = color[i] >= 0 ? color[i] : 0;
  return out;
}

// --- Segmentation ---------------------------------------------------------------

// Proportions (fractions of the model's height above its feet) where a
// standing body is cut: crotch, knees, waist and neck; arms are what lies
// further out than `trunk` times the pelvis half-width.
const BODY = { hip: 0.46, knee: 0.23, waist: 0.62, neck: 0.85, trunk: 1.1 };
const BEAST = { hip: 0.3, knee: 0.15 };

// [name, parent, joint kind]
const HUMAN_PARTS = [
  ['pelvis', null, null],
  ['chest', 'pelvis', 'waist'],
  ['head', 'chest', 'neck'],
  ['upperarmL', 'chest', 'shoulder'],
  ['forearmL', 'upperarmL', 'elbow'],
  ['upperarmR', 'chest', 'shoulder'],
  ['forearmR', 'upperarmR', 'elbow'],
  ['thighL', 'pelvis', 'hip'],
  ['shinL', 'thighL', 'knee'],
  ['thighR', 'pelvis', 'hip'],
  ['shinR', 'thighR', 'knee'],
  // Hands and whatever they hold out in front of the chest.
  ['hands', 'chest', 'grip'],
];
const BEAST_PARTS = [
  ['hips', null, null],
  ['front', 'hips', 'spine'],
  ['thighL', 'hips', 'hip'],
  ['shinL', 'thighL', 'knee'],
  ['thighR', 'hips', 'hip'],
  ['shinR', 'thighR', 'knee'],
];

function segmentModel(model, cfg) {
  const kind = cfg.kind || 'humanoid';
  if (kind === 'rigid') wholeBody(model);
  else if (kind === 'spider') segmentByThickness(model, cfg);
  else segmentAnatomical(model, cfg, kind);
}

function wholeBody(model) {
  const { solid, labels } = model;
  const part = new Int8Array(solid.length).fill(-1);
  for (let i = 0; i < solid.length; i++) if (solid[i]) part[i] = 0;
  labels.fill(0);
  assembleParts(model, part, [['body', null, null]], 0);
}

// Per-voxel model coordinates.
function coordTables(model) {
  const { nx, ny, nz, s, g0 } = model;
  const X = new Float32Array(nx), Y = new Float32Array(ny), Z = new Float32Array(nz);
  for (let i = 0; i < nx; i++) X[i] = g0[0] + (i + 0.5) * s;
  for (let i = 0; i < ny; i++) Y[i] = g0[1] + (i + 0.5) * s;
  for (let i = 0; i < nz; i++) Z[i] = g0[2] + (i + 0.5) * s;
  return { X, Y, Z };
}

// Cuts a standing body with planes at anatomical heights: legs below the
// crotch split left/right and at the knee, the head above the neck, arms
// outside the trunk, and the trunk at the waist.
function segmentAnatomical(model, cfg, kind) {
  const { nx, ny, nz, s, solid } = model;
  const N = nx * ny * nz;
  const beast = kind === 'beast';
  const P = { ...BODY, ...(beast ? BEAST : null), ...(cfg.body || null) };
  const defs = beast ? BEAST_PARTS : HUMAN_PARTS;
  const id = Object.fromEntries(defs.map((d, i) => [d[0], i]));
  const { X, Y, Z } = coordTables(model);
  let zFloor = BIG, zTop = -BIG;
  for (let k = 0; k < nz; k++) for (let i = k * nx * ny, e = i + nx * ny; i < e; i++) {
    if (solid[i]) { zFloor = Math.min(zFloor, Z[k]); zTop = Math.max(zTop, Z[k]); break; }
  }
  zFloor -= s / 2; zTop += s / 2;
  const H = zTop - zFloor;
  const zHip = zFloor + P.hip * H, zKnee = zFloor + P.knee * H, zWaist = zFloor + P.waist * H, zNeck = zFloor + P.neck * H;
  // Body centre line from everything below the waist.
  let sx = 0, sy = 0, n = 0;
  for (let k = 0; k < nz; k++) {
    if (Z[k] >= zWaist) break;
    for (let j = 0; j < ny; j++) for (let i = 0, v = (k * ny + j) * nx; i < nx; i++, v++) {
      if (solid[v]) { sx += X[i]; sy += Y[j]; n++; }
    }
  }
  const xc = n ? sx / n : 0, yc = n ? sy / n : 0;
  // Trunk half-width from the pelvis band; arms reach outside it.
  const widths = [];
  for (let k = 0; k < nz; k++) {
    if (Z[k] < zHip || Z[k] >= zHip + 0.1 * H) continue;
    for (let j = 0; j < ny; j++) for (let i = 0, v = (k * ny + j) * nx; i < nx; i++, v++) if (solid[v]) widths.push(Math.abs(Y[j] - yc));
  }
  widths.sort((p, q) => p - q);
  const wP = widths.length ? widths[Math.floor(widths.length * 0.92)] : H * 0.15;
  const wT = Math.max(3, wP * P.trunk);
  // Front of the trunk, from the waist band: anything held further out
  // (guns, claws reaching forward) hangs from the chest on its own.
  const fronts = [];
  for (let k = 0; k < nz; k++) {
    if (Z[k] < zHip || Z[k] >= zWaist) continue;
    for (let j = 0; j < ny; j++) {
      if (Math.abs(Y[j] - yc) > wT) continue;
      for (let i = 0, v = (k * ny + j) * nx; i < nx; i++, v++) if (solid[v]) fronts.push(X[i] - xc);
    }
  }
  fronts.sort((p, q) => p - q);
  const xFront = xc + (fronts.length ? fronts[Math.floor(fronts.length * 0.9)] : wT) + 3 * s;
  // Head axis from the upper half of the region above the neck.
  let hx = xc, hy = yc;
  {
    let ax = 0, ay = 0, an = 0;
    const zh = zNeck + 0.5 * (zTop - zNeck);
    for (let k = 0; k < nz; k++) {
      if (Z[k] < zh) continue;
      for (let j = 0; j < ny; j++) {
        if (Math.abs(Y[j] - yc) > wT) continue;
        for (let i = 0, v = (k * ny + j) * nx; i < nx; i++, v++) if (solid[v]) { ax += X[i]; ay += Y[j]; an++; }
      }
    }
    if (an) { hx = ax / an; hy = ay / an; }
  }
  const rh = Math.max(4, Math.min(wT, (zTop - zNeck) * 0.9)) * 1.3;

  const part = new Int8Array(N).fill(-1);
  for (let k = 0; k < nz; k++) {
    const z = Z[k];
    for (let j = 0; j < ny; j++) {
      const y = Y[j];
      const rel = y - yc;
      const side = rel >= 0 ? 'L' : 'R';
      const out = Math.abs(rel) > wT;
      for (let i = 0, v = (k * ny + j) * nx; i < nx; i++, v++) {
        if (!solid[v]) continue;
        const x = X[i];
        let p;
        if (beast) {
          if (z < zHip) p = (z < zKnee ? 'shin' : 'thigh') + side;
          else p = x >= xc ? 'front' : 'hips';
        } else if (z < zKnee) p = 'shin' + side;
        else if (z < zHip) p = (out ? 'upperarm' : 'thigh') + side;
        else if (z >= zNeck && Math.hypot(x - hx, y - hy) <= rh) p = 'head';
        else if (out) p = 'upperarm' + side;
        else if (x > xFront && z < zNeck) p = 'hands';
        else p = z < zWaist ? 'pelvis' : 'chest';
        part[v] = id[p];
      }
    }
  }
  keepLargestPieces(model, part, defs.length);

  // Forearms: the far half of each arm, measured along it from the shoulder.
  if (!beast) {
    for (const side of ['L', 'R']) {
      const ua = id['upperarm' + side], fa = id['forearm' + side];
      const geo = geodesic(model, part, ua, id.chest);
      let L = 0;
      for (let i = 0; i < N; i++) if (part[i] === ua && geo[i] > L) L = geo[i];
      if (L * s < 12) continue;
      for (let i = 0; i < N; i++) if (part[i] === ua && geo[i] >= L * 0.5) part[i] = fa;
    }
    keepLargestPieces(model, part, defs.length);
  }
  assembleParts(model, part, defs, Math.max(20 / (s * s * s), model.count * 0.012));
}

// Each part keeps only its largest connected piece; stray bits join the
// nearest part by region growing.
function keepLargestPieces(model, part, numParts) {
  const { nx, ny } = model;
  const N = part.length;
  const offs = offsets26(nx, ny);
  // Components of equal part index, all parts in one sweep.
  const comp = new Int32Array(N);
  const sizes = [0], owner = [-1];
  const queue = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    const p = part[s];
    if (p < 0 || comp[s]) continue;
    const id = sizes.length;
    let qh = 0, qt = 0;
    queue[qt++] = s;
    comp[s] = id;
    while (qh < qt) {
      const c = queue[qh++];
      for (let k = 0; k < 26; k++) {
        const n = c + offs[k];
        if (comp[n] || part[n] !== p) continue;
        comp[n] = id;
        queue[qt++] = n;
      }
    }
    sizes.push(qt);
    owner.push(p);
  }
  const biggest = new Int32Array(numParts);
  for (let c = 1; c < sizes.length; c++) if (!biggest[owner[c]] || sizes[c] > sizes[biggest[owner[c]]]) biggest[owner[c]] = c;
  let stray = false;
  for (let i = 0; i < N; i++) {
    if (part[i] >= 0 && comp[i] !== biggest[part[i]]) { part[i] = -2; stray = true; }
  }
  if (stray) growInto(model, part, -2);
}

// Assigns voxels marked `mark` to the nearest labelled neighbour (BFS).
function growInto(model, part, mark) {
  const { nx, ny } = model;
  const N = part.length;
  const offs = offsets6(nx, ny);
  const queue = new Int32Array(N);
  let qh = 0, qt = 0;
  for (let i = 0; i < N; i++) if (part[i] >= 0) queue[qt++] = i;
  while (qh < qt) {
    const c = queue[qh++];
    for (let k = 0; k < 6; k++) {
      const nb = c + offs[k];
      if (part[nb] !== mark) continue;
      part[nb] = part[c];
      queue[qt++] = nb;
    }
  }
  // Isolated leftovers (touching nothing) join part 0.
  for (let i = 0; i < N; i++) if (part[i] === mark) part[i] = 0;
}

// Steps (26-connected) through part `p` from its voxels touching part
// `from`. Unreached voxels get 0.
function geodesic(model, part, p, from) {
  const { nx, ny } = model;
  const N = part.length;
  const o6 = offsets6(nx, ny), o26 = offsets26(nx, ny);
  const geo = new Int32Array(N).fill(-1);
  const queue = new Int32Array(N);
  let qh = 0, qt = 0;
  for (let i = 0; i < N; i++) {
    if (part[i] !== p) continue;
    for (let k = 0; k < 6; k++) if (part[i + o6[k]] === from) { geo[i] = 0; queue[qt++] = i; break; }
  }
  while (qh < qt) {
    const c = queue[qh++];
    for (let k = 0; k < 26; k++) {
      const nb = c + o26[k];
      if (part[nb] !== p || geo[nb] >= 0) continue;
      geo[nb] = geo[c] + 1;
      queue[qt++] = nb;
    }
  }
  for (let i = 0; i < N; i++) if (geo[i] < 0) geo[i] = 0;
  return geo;
}

// Multi-legged bodies: the core is every ball of radius >= tau that fits
// inside the shape (a morphological opening); what's left are legs, each
// split at mid-length.
function segmentByThickness(model, cfg) {
  const { nx, ny, nz, s, solid } = model;
  const N = nx * ny * nz;
  const dt2 = edt3(solid, nx, ny, nz);
  let bestI = -1, bestV = 0;
  for (let i = 0; i < N; i++) if (dt2[i] > bestV) { bestV = dt2[i]; bestI = i; }
  const dtMax = Math.sqrt(bestV);
  if (dtMax < 2) { wholeBody(model); return; }
  const tau = Math.max(cfg.coreMin ?? 2.2, (cfg.coreK ?? 0.5) * dtMax);
  const seedMask = new Uint8Array(N);
  for (let i = 0; i < N; i++) seedMask[i] = dt2[i] >= tau * tau ? 1 : 0;
  const seeds = components(seedMask, 1, N, offsets26(nx, ny));
  const seedId = seeds.comp[bestI];
  // Opening: min over seeds q of |p - q|^2 - dt2(q) is negative inside a ball.
  const f = new Float32Array(N);
  for (let i = 0; i < N; i++) f[i] = seeds.comp[i] === seedId ? -dt2[i] : BIG;
  envelope3(f, nx, ny, nz);
  const part = new Int8Array(N).fill(-1);
  for (let i = 0; i < N; i++) if (solid[i]) part[i] = f[i] < 0 ? 0 : -3;
  const legs = components(part, -3, N, offsets6(nx, ny));
  const minLeg = Math.max(14 / (s * s * s), model.count * 0.012);
  const order = [];
  for (let c = 1; c < legs.sizes.length; c++) if (legs.sizes[c] >= minLeg) order.push(c);
  order.sort((p, q) => legs.sizes[q] - legs.sizes[p]);
  const maxLegs = Math.min(order.length, Math.floor((MAX_LABELS - 1) / 2));
  const defs = [['body', null, null]];
  const legOf = new Map();
  for (let k = 0; k < maxLegs; k++) {
    legOf.set(order[k], defs.length);
    defs.push(['leg' + k, 'body', 'legroot'], ['foot' + k, 'leg' + k, 'legmid']);
  }
  for (let i = 0; i < N; i++) {
    if (part[i] !== -3) continue;
    const d = legOf.get(legs.comp[i]);
    part[i] = d === undefined ? -2 : d;
  }
  growInto(model, part, -2);
  for (const d of legOf.values()) {
    const geo = geodesic(model, part, d, 0);
    let L = 0;
    for (let i = 0; i < N; i++) if (part[i] === d && geo[i] > L) L = geo[i];
    if (L * s < 12) continue;
    for (let i = 0; i < N; i++) if (part[i] === d && geo[i] >= L * 0.5) part[i] = d + 1;
  }
  keepLargestPieces(model, part, defs.length);
  assembleParts(model, part, defs, minLeg * 0.4);
}

// Turns a per-voxel part index into labelled parts and joints. Parts that
// are too small fold into their parent; children of a folded part attach
// to the next part up.
function assembleParts(model, part, defs, minSize) {
  const { labels } = model;
  const N = part.length;
  const counts = new Array(defs.length).fill(0);
  for (let i = 0; i < N; i++) if (part[i] >= 0) counts[part[i]]++;
  const index = Object.fromEntries(defs.map((d, i) => [d[0], i]));
  const target = defs.map((d, i) => i);
  const resolve = (k) => { while (target[k] !== k) k = target[k]; return k; };
  // Leaves first, so a small forearm folds into its upper arm before that is judged.
  for (let k = defs.length - 1; k > 0; k--) {
    if (counts[k] >= minSize || defs[k][1] === null) continue;
    const up = resolve(index[defs[k][1]]);
    target[k] = up;
    counts[up] += counts[k];
    counts[k] = 0;
  }
  const labelOf = new Array(defs.length).fill(0);
  const parts = [];
  for (let k = 0; k < defs.length; k++) {
    if (resolve(k) !== k || !counts[k]) continue;
    labelOf[k] = parts.length + 1;
    parts.push({ label: labelOf[k], kind: defs[k][0].replace(/[LR0-9]+$/, ''), name: defs[k][0] });
  }
  labels.fill(0);
  if (!parts.length) return;
  for (let i = 0; i < N; i++) if (part[i] >= 0) labels[i] = labelOf[resolve(part[i])] || 1;
  const joints = [];
  for (let k = 0; k < defs.length; k++) {
    if (!labelOf[k] || defs[k][1] === null) continue;
    // Walk up past folded or empty parts; the joint keeps the kind of the
    // link nearest the root that survived.
    let parent = index[defs[k][1]];
    let kind = defs[k][2];
    while (!labelOf[resolve(parent)]) {
      kind = defs[parent][2] || kind;
      if (defs[parent][1] === null) break;
      parent = index[defs[parent][1]];
    }
    parent = resolve(parent);
    if (!labelOf[parent] || parent === k) continue;
    joints.push({ a: labelOf[parent] - 1, b: labelOf[k] - 1, kind, anchor: null });
  }
  model.parts = parts;
  model.joints = joints;
  finishParts(model);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

// Mass properties, voxel bounds, collision spheres and joint anchors.
function finishParts(model) {
  const { nx, ny, nz, s, labels, parts } = model;
  const P = parts.length;
  const sums = parts.map(() => ({ n: 0, x: 0, y: 0, z: 0, xx: 0, yy: 0, zz: 0, xy: 0, xz: 0, yz: 0, lo: [BIG, BIG, BIG], hi: [-BIG, -BIG, -BIG] }));
  // Interfaces between parts: sums of face-midpoints per (a, b) pair.
  const iface = new Map();
  const { X, Y, Z } = coordTables(model);
  const o6 = offsets6(nx, ny);
  const half = [[s / 2, 0, 0], [-s / 2, 0, 0], [0, s / 2, 0], [0, -s / 2, 0], [0, 0, s / 2], [0, 0, -s / 2]];
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0, i = (z * ny + y) * nx; x < nx; x++, i++) {
    const l = labels[i];
    if (!l) continue;
    const S = sums[l - 1];
    const px = X[x], py = Y[y], pz = Z[z];
    S.n++; S.x += px; S.y += py; S.z += pz;
    S.xx += px * px; S.yy += py * py; S.zz += pz * pz; S.xy += px * py; S.xz += px * pz; S.yz += py * pz;
    if (x < S.lo[0]) S.lo[0] = x; if (y < S.lo[1]) S.lo[1] = y; if (z < S.lo[2]) S.lo[2] = z;
    if (x + 1 > S.hi[0]) S.hi[0] = x + 1; if (y + 1 > S.hi[1]) S.hi[1] = y + 1; if (z + 1 > S.hi[2]) S.hi[2] = z + 1;
    for (let k = 0; k < 6; k += 2) {
      for (let sgn = 0; sgn < 2; sgn++) {
        const o = l < labels[i + o6[k + sgn]] ? labels[i + o6[k + sgn]] : 0;
        if (!o) continue;
        const key = l * 64 + o;
        let e = iface.get(key);
        if (!e) iface.set(key, e = [0, 0, 0, 0]);
        const h = half[k + sgn];
        e[0] += px + h[0]; e[1] += py + h[1]; e[2] += pz + h[2]; e[3]++;
      }
    }
  }
  const vm = s * s * s; // mass per voxel
  for (let k = 0; k < P; k++) {
    const p = parts[k], S = sums[k];
    p.count = S.n;
    const cx = S.x / S.n, cy = S.y / S.n, cz = S.z / S.n;
    p.com = [cx, cy, cz];
    p.lo = S.lo; p.hi = S.hi;
    p.mass = S.n * vm;
    // Inertia tensor about the centre of mass (+ each voxel's own cube term).
    const cxx = S.xx / S.n - cx * cx, cyy = S.yy / S.n - cy * cy, czz = S.zz / S.n - cz * cz;
    const cxy = S.xy / S.n - cx * cy, cxz = S.xz / S.n - cx * cz, cyz = S.yz / S.n - cy * cz;
    const own = s * s / 6;
    const m = p.mass;
    p.inertia = [
      m * (cyy + czz + own), -m * cxy, -m * cxz,
      -m * cxy, m * (cxx + czz + own), -m * cyz,
      -m * cxz, -m * cyz, m * (cxx + cyy + own),
    ];
    p.spheres = fitSpheres(model, p);
  }
  for (const j of model.joints) {
    const la = j.a + 1, lb = j.b + 1;
    const e = iface.get(Math.min(la, lb) * 64 + Math.max(la, lb));
    if (e) j.anchor = [e[0] / e[3], e[1] / e[3], e[2] / e[3]];
    else j.anchor = nearestPoint(model, lb, parts[j.a].com);
  }
  // Hinges need the parent's own root joint to know the upper bone.
  for (const j of model.joints) {
    const up = model.joints.find((q) => q.b === j.a);
    if (up) j.upper = up.anchor;
  }
  for (const j of model.joints) setupJoint(model, j);
  model.mass = parts.reduce((a, p) => a + p.mass, 0);
}

// Voxel of part `label` nearest to point p (parts that don't touch).
function nearestPoint(model, label, p) {
  const { nx, ny, nz, labels } = model;
  const { X, Y, Z } = coordTables(model);
  let best = p, bd = BIG;
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0, i = (z * ny + y) * nx; x < nx; x++, i++) {
    if (labels[i] !== label) continue;
    const d = (X[x] - p[0]) ** 2 + (Y[y] - p[1]) ** 2 + (Z[z] - p[2]) ** 2;
    if (d < bd) { bd = d; best = [X[x], Y[y], Z[z]]; }
  }
  return best;
}

// Greedy medial spheres: repeatedly take the deepest voxel not yet covered.
function fitSpheres(model, part) {
  const { nx, ny, s, g0, labels } = model;
  const [x0, y0, z0] = part.lo, [x1, y1, z1] = part.hi;
  const bx = x1 - x0 + 2, by = y1 - y0 + 2, bz = z1 - z0 + 2;
  const local = new Uint8Array(bx * by * bz);
  for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (labels[(z * ny + y) * nx + x] === part.label) local[((z - z0 + 1) * by + (y - y0 + 1)) * bx + (x - x0 + 1)] = 1;
  }
  const d2 = edt3(local, bx, by, bz);
  const covered = new Uint8Array(local.length);
  const total = part.count;
  let cov = 0;
  const spheres = [];
  const big = part.kind === 'chest' || part.kind === 'pelvis' || part.kind === 'body' || part.kind === 'front' || part.kind === 'hips';
  const maxS = big ? 6 : 4;
  while (spheres.length < maxS && cov < total * 0.9) {
    let bi = -1, bv = 0;
    for (let i = 0; i < local.length; i++) if (local[i] && !covered[i] && d2[i] > bv) { bv = d2[i]; bi = i; }
    if (bi < 0) break;
    const r = Math.sqrt(bv);
    if (spheres.length && r < 1.2) break;
    const x = bi % bx, y = Math.floor(bi / bx) % by, z = Math.floor(bi / (bx * by));
    // Reach a little past the inscribed ball to cover the sphere's cap.
    const rc = r + 1.5;
    const ri = Math.ceil(rc);
    for (let dz = -ri; dz <= ri; dz++) for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) {
      if (dx * dx + dy * dy + dz * dz > rc * rc) continue;
      const X = x + dx, Y = y + dy, Z = z + dz;
      if (X < 0 || Y < 0 || Z < 0 || X >= bx || Y >= by || Z >= bz) continue;
      const n = (Z * by + Y) * bx + X;
      if (local[n] && !covered[n]) { covered[n] = 1; cov++; }
    }
    const px = g0[0] + (x - 1 + x0 + 0.5) * s, py = g0[1] + (y - 1 + y0 + 0.5) * s, pz = g0[2] + (z - 1 + z0 + 0.5) * s;
    // Radius out to the voxels' surface (half a voxel past the last centre).
    spheres.push([px - part.com[0], py - part.com[1], pz - part.com[2], Math.max(1, (r - 0.5) * s + 0.5)]);
  }
  if (!spheres.length) spheres.push([0, 0, 0, Math.max(1, s)]);
  return spheres;
}

// Limits in radians. Ball joints: the child bone stays inside a cone of
// half-angle `swing` whose axis is the rest direction tilted `tilt` toward
// the body's front (hips and spines bend forward much further than back),
// and twists at most `twist`. Hinges: [min, max] flexion, positive bending
// a lower leg backwards.
export const JOINT_LIMITS = {
  waist: { swing: 0.6, tilt: 0.3, twist: 0.4 },
  spine: { swing: 0.45, tilt: 0, twist: 0.3 },
  neck: { swing: 0.7, tilt: 0.2, twist: 0.8 },
  shoulder: { swing: 1.6, tilt: 0.5, twist: 0.9 },
  grip: { swing: 1.3, tilt: 0, twist: 0.6 },
  hip: { swing: 1.15, tilt: 0.85, twist: 0.4 },
  knee: { hinge: [-0.05, 2.4] },
  elbow: { hinge: [-2.4, 0.05] },
  legroot: { swing: 0.9, tilt: 0, twist: 0.3 },
  legmid: { swing: 1.2, tilt: 0, twist: 0.3 },
};

function setupJoint(model, j) {
  const pa = model.parts[j.a], pb = model.parts[j.b];
  const lim = JOINT_LIMITS[j.kind] || { swing: 1.0, twist: 0.5 };
  // Rest bone direction of the child, from the joint to its centre of mass.
  j.dirB = norm(sub(pb.com, j.anchor));
  if (lim.hinge && j.upper) {
    j.dirA = norm(sub(j.anchor, j.upper));
    // Lateral hinge axis, orthogonal to the upper bone.
    const d = j.dirA[1];
    j.axis = norm([-j.dirA[0] * d, 1 - j.dirA[1] * d, -j.dirA[2] * d]);
    // Keep the rest pose inside the range.
    const rest = signedAngle(j.dirA, j.dirB, j.axis);
    j.hinge = [Math.min(lim.hinge[0], rest - 0.1), Math.max(lim.hinge[1], rest + 0.1)];
  } else {
    // Cone axis: the rest bone tilted toward +x (front).
    const d = j.dirB;
    let k = [d[1] * 0 - d[2] * 0, d[2] * 1 - d[0] * 0, d[0] * 0 - d[1] * 1]; // d x (1,0,0)
    const kl = Math.hypot(k[0], k[1], k[2]);
    let axis = d;
    const tilt = lim.tilt || 0;
    if (kl > 1e-3 && tilt) {
      k = [k[0] / kl, k[1] / kl, k[2] / kl];
      // Rotating d about k (= d x front) by +tilt moves it toward the front.
      const c = Math.cos(tilt), sn = Math.sin(tilt);
      const kd = k[0] * d[0] + k[1] * d[1] + k[2] * d[2];
      const kx = [k[1] * d[2] - k[2] * d[1], k[2] * d[0] - k[0] * d[2], k[0] * d[1] - k[1] * d[0]];
      axis = norm([d[0] * c + kx[0] * sn + k[0] * kd * (1 - c), d[1] * c + kx[1] * sn + k[1] * kd * (1 - c), d[2] * c + kx[2] * sn + k[2] * kd * (1 - c)]);
      // Front means the end of the bone moves toward +x.
      if (axis[0] < d[0]) axis = norm([2 * d[0] - axis[0], 2 * d[1] - axis[1], 2 * d[2] - axis[2]]);
    }
    j.cone = axis;
    const restAngle = Math.acos(Math.max(-1, Math.min(1, axis[0] * d[0] + axis[1] * d[1] + axis[2] * d[2])));
    j.swing = Math.max(lim.swing ?? 1.0, restAngle + 0.1);
    j.twist = lim.twist ?? 0.5;
    // Twist reference perpendicular to the bone.
    const up = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    j.ref = norm([d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]]);
  }
  j.ra = sub(j.anchor, pa.com);
  j.rb = sub(j.anchor, pb.com);
}

// Angle from a to b around axis, both projected onto the axis' plane.
export function signedAngle(a, b, axis) {
  const pa = projectOut(a, axis), pb = projectOut(b, axis);
  const cx = pa[1] * pb[2] - pa[2] * pb[1], cy = pa[2] * pb[0] - pa[0] * pb[2], cz = pa[0] * pb[1] - pa[1] * pb[0];
  const sn = cx * axis[0] + cy * axis[1] + cz * axis[2];
  const cs = pa[0] * pb[0] + pa[1] * pb[1] + pa[2] * pb[2];
  return Math.atan2(sn, cs);
}

function projectOut(v, n) {
  const d = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
  return [v[0] - n[0] * d, v[1] - n[1] * d, v[2] - n[2] * d];
}

// Interleaved colour/label bytes for an RG8 3D texture.
export function textureData(model) {
  const N = model.nx * model.ny * model.nz;
  const out = new Uint8Array(N * 2);
  for (let i = 0; i < N; i++) {
    out[i * 2] = model.color[i];
    out[i * 2 + 1] = model.labels[i];
  }
  return out;
}

// Drops the build-only arrays; keeps what rendering and physics need.
export function compactModel(model) {
  return {
    nx: model.nx, ny: model.ny, nz: model.nz, s: model.s, g0: model.g0, count: model.count,
    top: model.top, bot: model.bot, mass: model.mass, parts: model.parts, joints: model.joints,
    data: textureData(model),
  };
}
