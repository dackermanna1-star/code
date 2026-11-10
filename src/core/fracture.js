// Convex-polyhedron fracture toolkit.
//
// Every breakable piece in the simulator is a convex polyhedron stored as a
// soup of planar faces:   poly = { faces: [ { pts: [[x,y,z],…], tag, smooth } ] }
//   tag    0 = original outer surface, 1 = freshly exposed fracture surface,
//          2+ = alternative outer surfaces (e.g. the inside glaze of a vase)
//   smooth optional smoothing-group id (faces in the same group share normals)
// Points are never mutated in place, so faces may share point arrays.
//
// Fracturing is done by slicing polyhedra with planes. Material-specific
// patterns (radial glass cracks, tempered dicing, wood splitting along the
// grain, chunky ceramic/plastic shards) are just different ways of choosing
// those planes.

const EPS = 1e-7;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Small fast seeded PRNG (mulberry32). */
export function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return function rng() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Primitive polyhedra
// ---------------------------------------------------------------------------

/** Axis-aligned box centred on the origin. tags = [+x,-x,+y,-y,+z,-z]. */
export function boxPoly(hx, hy, hz, tags) {
  const p = (x, y, z) => [x * hx, y * hy, z * hz];
  const t = tags || [0, 0, 0, 0, 0, 0];
  return {
    faces: [
      { pts: [p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), p(1, -1, 1)], tag: t[0] },
      { pts: [p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1)], tag: t[1] },
      { pts: [p(-1, 1, -1), p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1)], tag: t[2] },
      { pts: [p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1)], tag: t[3] },
      { pts: [p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)], tag: t[4] },
      { pts: [p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1), p(1, -1, -1)], tag: t[5] },
    ],
  };
}

/**
 * Prism: a convex 2D polygon (CCW in the (a,b) plane, where a,b follow `axis`
 * cyclically) extruded from h0 to h1 along `axis`.
 */
export function prismPoly(poly2d, axis, h0, h1, capTag = 0, sideTag = 0, sideSmooth = 0) {
  const a = (axis + 1) % 3;
  const b = (axis + 2) % 3;
  const mk = (u, v, h) => {
    const p = [0, 0, 0];
    p[a] = u;
    p[b] = v;
    p[axis] = h;
    return p;
  };
  let pts2 = poly2d;
  if (signedArea2(pts2) < 0) pts2 = pts2.slice().reverse();
  const n = pts2.length;
  const top = pts2.map(([u, v]) => mk(u, v, h1));
  const bot = pts2.map(([u, v]) => mk(u, v, h0));
  const faces = [{ pts: top, tag: capTag }, { pts: bot.slice().reverse(), tag: capTag }];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push({ pts: [bot[i], bot[j], top[j], top[i]], tag: sideTag, smooth: sideSmooth });
  }
  return { faces };
}

/** n-gon cylinder centred on the origin along `axis`. Side faces are smooth-shaded. */
export function cylinderPoly(radius, halfH, segs = 16, axis = 1, capTag = 0, sideTag = 0) {
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    pts.push([Math.cos(t) * radius, Math.sin(t) * radius]);
  }
  return prismPoly(pts, axis, -halfH, halfH, capTag, sideTag, 1);
}

/**
 * Hexahedron from 8 corners: bottom ring b0..b3 and top ring t0..t3, both CCW
 * seen from the +top direction. Used for curved-shell tiles (vase, tubs).
 * tags = { top, bottom, sides:[4] }.
 */
export function hexaPoly(b, t, tags = {}) {
  const s = tags.sides || [0, 0, 0, 0];
  const sm = tags.sideSmooth || [0, 0, 0, 0];
  const faces = [
    { pts: [t[0], t[1], t[2], t[3]], tag: tags.top ?? 0 },
    { pts: [b[3], b[2], b[1], b[0]], tag: tags.bottom ?? 0 },
  ];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    faces.push({ pts: [b[i], b[j], t[j], t[i]], tag: s[i], smooth: sm[i] });
  }
  return { faces };
}

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

export function signedArea2(p) {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const q = p[(i + 1) % n];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return a / 2;
}

/** Newell normal (unnormalised) of a planar polygon. */
export function faceNormal(pts, out = [0, 0, 0]) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    nx += (p[1] - q[1]) * (p[2] + q[2]);
    ny += (p[2] - q[2]) * (p[0] + q[0]);
    nz += (p[0] - q[0]) * (p[1] + q[1]);
  }
  out[0] = nx; out[1] = ny; out[2] = nz;
  return out;
}

/** Volume and centroid of a closed convex polyhedron. */
export function polyMassProps(poly) {
  let vol = 0, cx = 0, cy = 0, cz = 0;
  for (const f of poly.faces) {
    const p = f.pts, a = p[0];
    for (let i = 1; i < p.length - 1; i++) {
      const b = p[i], c = p[i + 1];
      const d =
        a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0]);
      vol += d;
      cx += d * (a[0] + b[0] + c[0]);
      cy += d * (a[1] + b[1] + c[1]);
      cz += d * (a[2] + b[2] + c[2]);
    }
  }
  if (Math.abs(vol) < 1e-18) return { volume: 0, centroid: polyAverage(poly) };
  return { volume: vol / 6, centroid: [cx / (4 * vol), cy / (4 * vol), cz / (4 * vol)] };
}

function polyAverage(poly) {
  let n = 0, x = 0, y = 0, z = 0;
  for (const f of poly.faces) for (const p of f.pts) { x += p[0]; y += p[1]; z += p[2]; n++; }
  return n ? [x / n, y / n, z / n] : [0, 0, 0];
}

export function polyBounds(poly) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const f of poly.faces) {
    for (const p of f.pts) {
      for (let k = 0; k < 3; k++) {
        if (p[k] < mn[k]) mn[k] = p[k];
        if (p[k] > mx[k]) mx[k] = p[k];
      }
    }
  }
  return [mn, mx];
}

/** Unique corner points, flattened (for convex-hull colliders). */
export function polyPoints(poly, tol = 1e-5) {
  const seen = new Map();
  const out = [];
  const inv = 1 / tol;
  for (const f of poly.faces) {
    for (const p of f.pts) {
      const key = Math.round(p[0] * inv) + '_' + Math.round(p[1] * inv) + '_' + Math.round(p[2] * inv);
      if (!seen.has(key)) {
        seen.set(key, 1);
        out.push(p[0], p[1], p[2]);
      }
    }
  }
  return out;
}

export function translatePoly(poly, dx, dy, dz) {
  const map = new Map();
  const mv = (p) => {
    let q = map.get(p);
    if (!q) { q = [p[0] + dx, p[1] + dy, p[2] + dz]; map.set(p, q); }
    return q;
  };
  return { faces: poly.faces.map((f) => ({ pts: f.pts.map(mv), tag: f.tag, smooth: f.smooth })) };
}

/** Apply an arbitrary point mapping (must keep the polyhedron convex). */
export function mapPoly(poly, fn) {
  const map = new Map();
  const mv = (p) => {
    let q = map.get(p);
    if (!q) { q = fn(p); map.set(p, q); }
    return q;
  };
  return { faces: poly.faces.map((f) => ({ pts: f.pts.map(mv), tag: f.tag, smooth: f.smooth })) };
}

// ---------------------------------------------------------------------------
// Plane cutting
// ---------------------------------------------------------------------------

/**
 * Slice a convex polyhedron with the plane n·p = d.
 * Returns [front, back] (n·p > d is front); either may be null.
 */
export function cutPoly(poly, n, d, capTag = 1) {
  const frontFaces = [], backFaces = [];
  const cap = [];
  let anyF = false, anyB = false;
  for (const f of poly.faces) {
    const pts = f.pts, m = pts.length;
    const fp = [], bp = [];
    let nf = 0, nb = 0;
    let prev = pts[m - 1];
    let sp = dot(n, prev) - d;
    for (let i = 0; i < m; i++) {
      const cur = pts[i];
      const sc = dot(n, cur) - d;
      if ((sp > EPS && sc < -EPS) || (sp < -EPS && sc > EPS)) {
        const t = sp / (sp - sc);
        const ip = [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t, prev[2] + (cur[2] - prev[2]) * t];
        fp.push(ip);
        bp.push(ip);
        cap.push(ip);
      }
      if (sc >= -EPS) fp.push(cur);
      if (sc <= EPS) bp.push(cur);
      if (sc > EPS) nf++;
      else if (sc < -EPS) nb++;
      else cap.push(cur);
      prev = cur;
      sp = sc;
    }
    if (nf > 0 && fp.length >= 3) { frontFaces.push({ pts: fp, tag: f.tag, smooth: f.smooth }); anyF = true; }
    if (nb > 0 && bp.length >= 3) { backFaces.push({ pts: bp, tag: f.tag, smooth: f.smooth }); anyB = true; }
  }
  if (!anyF) return [null, poly];
  if (!anyB) return [poly, null];

  // Build the cap polygon from the intersection points.
  const uniq = [];
  for (const p of cap) {
    let dup = false;
    for (const q of uniq) {
      if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) < 1e-6) { dup = true; break; }
    }
    if (!dup) uniq.push(p);
  }
  if (uniq.length >= 3) {
    let cx = 0, cy = 0, cz = 0;
    for (const p of uniq) { cx += p[0]; cy += p[1]; cz += p[2]; }
    cx /= uniq.length; cy /= uniq.length; cz /= uniq.length;
    // basis (u, v) in the plane with u × v = n
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    let u = ax <= ay && ax <= az ? [0, -n[2], n[1]] : ay <= az ? [n[2], 0, -n[0]] : [-n[1], n[0], 0];
    const ul = Math.hypot(u[0], u[1], u[2]) || 1;
    u = [u[0] / ul, u[1] / ul, u[2] / ul];
    const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const ang = uniq.map((p) => {
      const x = p[0] - cx, y = p[1] - cy, z = p[2] - cz;
      return Math.atan2(x * v[0] + y * v[1] + z * v[2], x * u[0] + y * u[1] + z * u[2]);
    });
    const order = uniq.map((_, i) => i).sort((i, j) => ang[i] - ang[j]);
    const ccw = order.map((i) => uniq[i]); // CCW about +n
    backFaces.push({ pts: ccw, tag: capTag });
    frontFaces.push({ pts: ccw.slice().reverse(), tag: capTag });
  }
  return [{ faces: frontFaces }, { faces: backFaces }];
}

/** Keep the part of `poly` inside a convex 2D cell extruded along `axis`. */
export function clipPolyToCell(poly, axis, cell) {
  const a = (axis + 1) % 3, b = (axis + 2) % 3;
  let cur = poly;
  const n = [0, 0, 0];
  for (let i = 0, m = cell.length; i < m && cur; i++) {
    const p = cell[i], q = cell[(i + 1) % m];
    const ea = q[0] - p[0], eb = q[1] - p[1];
    const l = Math.hypot(ea, eb);
    if (l < 1e-9) continue;
    n[a] = eb / l;
    n[b] = -ea / l;
    n[axis] = 0;
    const d = n[a] * p[0] + n[b] * p[1];
    cur = cutPoly(cur, [n[0], n[1], n[2]], d)[1];
  }
  return cur;
}

// ---------------------------------------------------------------------------
// 2D crack patterns (for panes of glass)
// ---------------------------------------------------------------------------

/**
 * Spider-web pattern: radial cracks from the impact point crossed by irregular
 * concentric rings whose spacing grows with distance. Sectors subdivide further
 * out so far shards stay dagger-shaped rather than huge wedges.
 * Returns convex CCW cells covering a disc of radius ≥ `reach`.
 */
export function radialCells(cx, cy, reach, rng, o = {}) {
  const N = o.sectors ?? 10;
  const growth = o.growth ?? 1.7;
  const jit = o.jitter ?? 0.3;
  const radii = [0];
  let r = o.r0 ?? 0.05;
  while (r < reach && radii.length < 14) {
    radii.push(r);
    r *= growth * (0.88 + rng() * 0.3);
  }
  radii.push(reach * 3);
  const K = radii.length - 1;
  const splitAt = o.splitRings ?? [2, 4];
  const levelOf = (k) => {
    let l = 0;
    for (const s of splitAt) if (k >= s) l++;
    return l;
  };
  const Lmax = levelOf(K - 1);
  const M = N << Lmax;
  const ang = new Float64Array(M + 1);
  const base = rng() * Math.PI * 2;
  const step0 = 1 << Lmax;
  for (let i = 0; i < N; i++) ang[i * step0] = base + ((i + (rng() - 0.5) * 0.55) * Math.PI * 2) / N;
  ang[M] = ang[0] + Math.PI * 2;
  for (let L = 1; L <= Lmax; L++) {
    const st = 1 << (Lmax - L);
    for (let i = st; i < M; i += 2 * st) {
      const a0 = ang[i - st], a1 = ang[i + st];
      ang[i] = (a0 + a1) / 2 + (rng() - 0.5) * 0.3 * (a1 - a0);
    }
  }
  const rad = [];
  for (let i = 0; i < M; i++) {
    const row = new Float64Array(K + 1);
    for (let k = 1; k <= K; k++) row[k] = k === K ? radii[k] : radii[k] * (1 + (rng() - 0.5) * jit);
    rad.push(row);
  }
  const vLevel = (i) => {
    if (i === 0) return 0;
    let tz = 0;
    while (((i >> tz) & 1) === 0) tz++;
    return Lmax - tz;
  };
  const cache = new Map();
  const vertex = (iRaw, k) => {
    if (k === 0) return [cx, cy];
    const i = ((iRaw % M) + M) % M;
    const key = i * 32 + k;
    let p = cache.get(key);
    if (p) return p;
    const vl = vLevel(i);
    if (vl <= levelOf(k - 1)) {
      p = [cx + Math.cos(ang[i]) * rad[i][k], cy + Math.sin(ang[i]) * rad[i][k]];
    } else {
      const st = 1 << (Lmax - vl);
      const A = vertex(i - st, k), B = vertex(i + st, k);
      p = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    }
    cache.set(key, p);
    return p;
  };
  const cells = [];
  for (let k = 0; k < K; k++) {
    const L = levelOf(k);
    const st = 1 << (Lmax - L);
    const count = N << L;
    for (let s = 0; s < count; s++) {
      const i0 = s * st, i1 = i0 + st;
      const cell = k === 0
        ? [vertex(0, 0), vertex(i0, 1), vertex(i1, 1)]
        : [vertex(i0, k), vertex(i0, k + 1), vertex(i1, k + 1), vertex(i1, k)];
      if (signedArea2(cell) < 0) cell.reverse();
      cell.ring = k;
      cells.push(cell);
    }
  }
  return cells;
}

function clip2(poly, nx, ny, d) {
  const out = [];
  const m = poly.length;
  let prev = poly[m - 1];
  let sp = nx * prev[0] + ny * prev[1] - d;
  for (let i = 0; i < m; i++) {
    const cur = poly[i];
    const sc = nx * cur[0] + ny * cur[1] - d;
    if ((sp > 0 && sc < 0) || (sp < 0 && sc > 0)) {
      const t = sp / (sp - sc);
      out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
    }
    if (sc <= 0) out.push(cur);
    prev = cur;
    sp = sc;
  }
  return out;
}

/** Jittered-grid Voronoi cells covering the rectangle (tempered-glass dicing). */
export function voronoiCells(minA, minB, maxA, maxB, cell, rng, jitter = 0.8) {
  const nx = Math.max(1, Math.round((maxA - minA) / cell));
  const ny = Math.max(1, Math.round((maxB - minB) / cell));
  const sx = (maxA - minA) / nx, sy = (maxB - minB) / ny;
  const seeds = [];
  for (let j = -1; j <= ny; j++) {
    for (let i = -1; i <= nx; i++) {
      seeds.push([minA + (i + 0.5 + (rng() - 0.5) * jitter) * sx, minB + (j + 0.5 + (rng() - 0.5) * jitter) * sy]);
    }
  }
  const W = nx + 2, H = ny + 2;
  const cells = [];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const s = seeds[j * W + i];
      let poly = [[s[0] - 2 * sx, s[1] - 2 * sy], [s[0] + 2 * sx, s[1] - 2 * sy], [s[0] + 2 * sx, s[1] + 2 * sy], [s[0] - 2 * sx, s[1] + 2 * sy]];
      for (let dj = -2; dj <= 2 && poly.length >= 3; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= H) continue;
        for (let di = -2; di <= 2 && poly.length >= 3; di++) {
          const ii = i + di;
          if ((!di && !dj) || ii < 0 || ii >= W) continue;
          const o = seeds[jj * W + ii];
          const ex = o[0] - s[0], ey = o[1] - s[1];
          const l = Math.hypot(ex, ey) || 1;
          const mx = (s[0] + o[0]) / 2, my = (s[1] + o[1]) / 2;
          poly = clip2(poly, ex / l, ey / l, (ex / l) * mx + (ey / l) * my);
        }
      }
      if (poly.length >= 3) cells.push(poly);
    }
  }
  return cells;
}

/** Cut a pane (thin along `axis`) into the given 2D cells. */
export function fractureByCells(poly, axis, cells) {
  const [mn, mx] = polyBounds(poly);
  const a = (axis + 1) % 3, b = (axis + 2) % 3;
  const out = [];
  for (const cell of cells) {
    let c0 = Infinity, c1 = -Infinity, d0 = Infinity, d1 = -Infinity;
    for (const p of cell) {
      if (p[0] < c0) c0 = p[0];
      if (p[0] > c1) c1 = p[0];
      if (p[1] < d0) d0 = p[1];
      if (p[1] > d1) d1 = p[1];
    }
    if (c1 < mn[a] || c0 > mx[a] || d1 < mn[b] || d0 > mx[b]) continue;
    const piece = clipPolyToCell(poly, axis, cell);
    if (piece) out.push(piece);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3D patterns
// ---------------------------------------------------------------------------

function randUnit(rng) {
  const z = rng() * 2 - 1;
  const t = rng() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return [Math.cos(t) * s, Math.sin(t) * s, z];
}

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l; v[1] /= l; v[2] /= l;
  return v;
}

/**
 * Wood: long splits that follow the grain (slightly wandering, so splinters
 * taper) plus jagged, staggered breaks across the grain near the impact.
 */
export function fractureWood(poly, grainAxis, impact, intensity, rng, o = {}) {
  const [mn, mx] = polyBounds(poly);
  const g = grainAxis;
  const a = (g + 1) % 3, b = (g + 2) % 3;
  const ea = mx[a] - mn[a], eb = mx[b] - mn[b];
  const w = ea >= eb ? a : b; // board width
  const t = ea >= eb ? b : a; // board thickness
  const width = mx[w] - mn[w];
  const len = mx[g] - mn[g];
  const thick = mx[t] - mn[t];
  const minStrip = o.minStrip ?? Math.max(0.018, thick * 0.9);
  const maxStrips = Math.max(1, Math.min(o.maxStrips ?? 7, Math.floor(width / minStrip)));
  const want = clamp(Math.round(1.2 + intensity * 1.1 + rng() * 1.5), 2, 7);
  const nStrips = Math.min(maxStrips, want);
  const ig = clamp(impact[g], mn[g] + len * 0.08, mx[g] - len * 0.08);
  const iw = clamp(impact[w], mn[w], mx[w]);

  let pieces = [poly];
  // Along-grain splits, densest around the impact.
  const cuts = [];
  for (let i = 0; i < nStrips - 1; i++) {
    const u = rng();
    const spread = width * (0.25 + 0.75 * rng());
    let pos = iw + (u - 0.5) * spread;
    if (pos < mn[w] + minStrip * 0.6 || pos > mx[w] - minStrip * 0.6) pos = mn[w] + width * (0.12 + 0.76 * rng());
    cuts.push(pos);
  }
  for (const pos of cuts) {
    const n = [0, 0, 0];
    n[w] = 1;
    n[g] = (rng() - 0.5) * 0.1;
    n[t] = (rng() - 0.5) * 0.7;
    normalize(n);
    const pt = [0, 0, 0];
    pt[w] = pos; pt[g] = ig; pt[t] = (mn[t] + mx[t]) / 2;
    const d = dot(n, pt);
    const next = [];
    for (const p of pieces) {
      const [f, bk] = cutPoly(p, n, d);
      if (f) next.push(f);
      if (bk) next.push(bk);
    }
    pieces = next;
  }
  // Cross-grain breaks: each strip snaps at its own offset and angle.
  const crossChance = clamp(0.55 + intensity * 0.25, 0, 1);
  const out = [];
  const stagger = Math.min(len * 0.3, 0.05 + 0.09 * intensity + thick * 2);
  for (const p of pieces) {
    const [pmn, pmx] = polyBounds(p);
    const near = 1 - clamp(Math.abs((pmn[w] + pmx[w]) / 2 - iw) / (width * 0.75 + 1e-6), 0, 1);
    let parts = [p];
    const nBreaks = rng() < crossChance * (0.45 + 0.55 * near) ? (intensity > 2.5 && rng() < 0.3 ? 2 : 1) : 0;
    for (let k = 0; k < nBreaks; k++) {
      const n = [0, 0, 0];
      n[g] = 1;
      n[w] = (rng() - 0.5) * 1.5;
      n[t] = (rng() - 0.5) * 1.1;
      normalize(n);
      const pt = [0, 0, 0];
      pt[g] = clamp(ig + (rng() - 0.5) * 2 * stagger + (k ? (rng() < 0.5 ? -1 : 1) * len * (0.15 + 0.2 * rng()) : 0), pmn[g] + 0.02, pmx[g] - 0.02);
      pt[w] = (pmn[w] + pmx[w]) / 2;
      pt[t] = (pmn[t] + pmx[t]) / 2;
      const d = dot(n, pt);
      const next = [];
      for (const q of parts) {
        const [f, bk] = cutPoly(q, n, d);
        if (f) next.push(f);
        if (bk) next.push(bk);
      }
      parts = next;
    }
    for (const q of parts) out.push(q);
  }
  return out;
}

/**
 * Chunky brittle fracture (ceramic, plastic, concrete, circuit boards):
 * repeated random plane cuts, biased so pieces near the impact end up smaller.
 * Thin shells are never split through their thickness.
 */
export function fractureChunky(poly, impact, count, rng, o = {}) {
  const focus = o.focus ?? 1.2;
  let pieces = [];
  const add = (p) => {
    const mp = polyMassProps(p);
    if (mp.volume <= 0) return;
    pieces.push({ poly: p, vol: mp.volume, c: mp.centroid });
  };
  add(poly);
  let guard = count * 6;
  while (pieces.length < count && guard-- > 0) {
    let total = 0;
    for (const p of pieces) {
      const dd = Math.hypot(p.c[0] - impact[0], p.c[1] - impact[1], p.c[2] - impact[2]);
      p.w = Math.pow(p.vol, 0.85) / Math.pow(0.03 + dd, focus);
      total += p.w;
    }
    let pick = rng() * total, idx = 0;
    for (let i = 0; i < pieces.length; i++) {
      pick -= pieces[i].w;
      if (pick <= 0) { idx = i; break; }
    }
    const tgt = pieces[idx];
    const [mn, mx] = polyBounds(tgt.poly);
    const ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    let thin = 0;
    if (ext[1] < ext[thin]) thin = 1;
    if (ext[2] < ext[thin]) thin = 2;
    const others = [ext[(thin + 1) % 3], ext[(thin + 2) % 3]];
    const n = randUnit(rng);
    if (ext[thin] < 0.4 * Math.min(others[0], others[1])) {
      n[thin] *= 0.25;
      // prefer cutting across the longest dimension
      const longAxis = others[0] > others[1] ? (thin + 1) % 3 : (thin + 2) % 3;
      n[longAxis] += (n[longAxis] >= 0 ? 1 : -1) * 0.6 * (Math.max(others[0], others[1]) / (Math.min(others[0], others[1]) + 1e-6) > 1.6 ? 1 : 0);
      normalize(n);
    }
    const k = rng() * 0.45;
    const pt = [
      tgt.c[0] + (impact[0] - tgt.c[0]) * k * 0.3 + (rng() - 0.5) * ext[0] * 0.3,
      tgt.c[1] + (impact[1] - tgt.c[1]) * k * 0.3 + (rng() - 0.5) * ext[1] * 0.3,
      tgt.c[2] + (impact[2] - tgt.c[2]) * k * 0.3 + (rng() - 0.5) * ext[2] * 0.3,
    ];
    const [f, bk] = cutPoly(tgt.poly, n, dot(n, pt));
    if (!f || !bk) continue;
    const mf = polyMassProps(f), mb = polyMassProps(bk);
    if (mf.volume < tgt.vol * 0.04 || mb.volume < tgt.vol * 0.04) continue;
    pieces.splice(idx, 1);
    pieces.push({ poly: f, vol: mf.volume, c: mf.centroid }, { poly: bk, vol: mb.volume, c: mb.centroid });
  }
  return pieces.map((p) => p.poly);
}

// ---------------------------------------------------------------------------
// Adjacency (which fragments touch) — used to build breakable bonds
// ---------------------------------------------------------------------------

/**
 * Pre-compute a hull description {pts, planes, mn, mx} of a polyhedron after
 * an optional rigid transform (rot = 3x3 row-major array or null, pos = [x,y,z]).
 */
export function makeHull(poly, rot, pos) {
  const pts = [];
  const planes = [];
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const seen = new Map();
  const tp = (p) => {
    let q = seen.get(p);
    if (q) return q;
    if (rot) {
      q = [
        rot[0] * p[0] + rot[1] * p[1] + rot[2] * p[2] + pos[0],
        rot[3] * p[0] + rot[4] * p[1] + rot[5] * p[2] + pos[1],
        rot[6] * p[0] + rot[7] * p[1] + rot[8] * p[2] + pos[2],
      ];
    } else if (pos) q = [p[0] + pos[0], p[1] + pos[1], p[2] + pos[2]];
    else q = p;
    seen.set(p, q);
    pts.push(q);
    for (let k = 0; k < 3; k++) {
      if (q[k] < mn[k]) mn[k] = q[k];
      if (q[k] > mx[k]) mx[k] = q[k];
    }
    return q;
  };
  const nrm = [0, 0, 0];
  for (const f of poly.faces) {
    const fp = f.pts.map(tp);
    faceNormal(fp, nrm);
    const l = Math.hypot(nrm[0], nrm[1], nrm[2]);
    if (l < 1e-12) continue;
    const nx = nrm[0] / l, ny = nrm[1] / l, nz = nrm[2] / l;
    planes.push([nx, ny, nz, nx * fp[0][0] + ny * fp[0][1] + nz * fp[0][2]]);
  }
  return { pts, planes, mn, mx };
}

/**
 * Do two convex hulls touch (within eps)? Returns null if not, otherwise
 * { area, anchor } estimated from the overlap of their bounding boxes.
 */
export function hullContact(A, B, eps = 0.002) {
  const ext = [0, 0, 0], ctr = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const lo = Math.max(A.mn[k], B.mn[k]) - eps;
    const hi = Math.min(A.mx[k], B.mx[k]) + eps;
    if (hi < lo) return null;
    ext[k] = hi - lo;
    ctr[k] = (hi + lo) / 2;
  }
  for (const pl of A.planes) {
    let sep = true;
    for (const p of B.pts) {
      if (pl[0] * p[0] + pl[1] * p[1] + pl[2] * p[2] - pl[3] <= eps) { sep = false; break; }
    }
    if (sep) return null;
  }
  for (const pl of B.planes) {
    let sep = true;
    for (const p of A.pts) {
      if (pl[0] * p[0] + pl[1] * p[1] + pl[2] * p[2] - pl[3] <= eps) { sep = false; break; }
    }
    if (sep) return null;
  }
  const s = ext.slice().sort((x, y) => y - x);
  if (s[1] < eps * 3.5) return null; // corner / edge-only contact
  return { area: s[0] * s[1], anchor: ctr };
}

/** Is the point inside (or within eps of) the hull? Returns max plane distance. */
export function hullDistance(H, p) {
  let m = -Infinity;
  for (const pl of H.planes) {
    const s = pl[0] * p[0] + pl[1] * p[1] + pl[2] * p[2] - pl[3];
    if (s > m) m = s;
  }
  return m;
}
