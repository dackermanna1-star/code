// Small geometry helpers for the procedural exterior.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Regular grid surface: rows x cols vertices, fill(i, j, p, uv, col) writes the
 * position {x,y,z}, uv {u,v} and optional colour {r,g,b} (when opts.color).
 * opts.closeCols: connect the last column to the first (seam duplicated is
 * avoided) – normally we keep duplicated seams for UV continuity instead.
 */
export function gridGeometry(rows, cols, fill, opts = {}) {
  const n = rows * cols;
  const pos = new Float32Array(n * 3), uvs = new Float32Array(n * 2);
  const col = opts.color ? new Float32Array(n * 3) : null;
  const p = { x: 0, y: 0, z: 0 }, uv = { u: 0, v: 0 }, c = { r: 1, g: 1, b: 1 };
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      c.r = c.g = c.b = 1;
      fill(i, j, p, uv, c);
      const k = i * cols + j;
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      uvs[k * 2] = uv.u; uvs[k * 2 + 1] = uv.v;
      if (col) { col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
    }
  }
  const idx = [];
  const flip = !!opts.flip;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j, b = a + 1, d = a + cols, e = d + 1;
      if (flip) idx.push(a, b, d, b, e, d); else idx.push(a, d, b, b, d, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  if (opts.normals !== false) g.computeVertexNormals();
  return g;
}

/** Triangle fan closing a loop of points (Vector3-like array) around its centroid. */
export function fanCap(points, uvCenter = [0.5, 0.5], flip = false) {
  const cx = points.reduce((a, p) => a + p.x, 0) / points.length;
  const cy = points.reduce((a, p) => a + p.y, 0) / points.length;
  const cz = points.reduce((a, p) => a + p.z, 0) / points.length;
  const pos = [cx, cy, cz], uv = [uvCenter[0], uvCenter[1]], idx = [];
  for (const p of points) { pos.push(p.x, p.y, p.z); uv.push(uvCenter[0], uvCenter[1]); }
  for (let i = 1; i < points.length; i++) { if (flip) idx.push(0, i + 1, i); else idx.push(0, i, i + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Make all geometries share the same attribute set (position, normal, uv[, color]) and merge. */
export function merge(list, { color = false } = {}) {
  const prepared = [];
  for (let g of list) {
    if (!g) continue;
    if (g.index === null) { /* ok */ }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (color && !g.attributes.color) {
      const c = new Float32Array(g.attributes.position.count * 3).fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    if (!color && g.attributes.color) g.deleteAttribute('color');
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    prepared.push(g.index ? g : g);
  }
  // mergeGeometries needs all indexed or all non-indexed
  const anyNonIndexed = prepared.some((g) => !g.index);
  const fixed = anyNonIndexed ? prepared.map((g) => (g.index ? g.toNonIndexed() : g)) : prepared;
  const m = mergeGeometries(fixed, false);
  return m;
}

/** Fill a vertex colour attribute with a constant colour. */
export function paint(g, color) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** Set every uv of a geometry to a constant (useful to sample a flat atlas texel). */
export function flatUV(g, u, v) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { a[i * 2] = u; a[i * 2 + 1] = v; }
  g.setAttribute('uv', new THREE.BufferAttribute(a, 2));
  return g;
}

/** Mirror a geometry across x = 0 (positions + normals) and fix the winding. */
export function mirrorX(g) {
  const m = g.clone();
  const p = m.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
  if (m.attributes.normal) { const n = m.attributes.normal; for (let i = 0; i < n.count; i++) n.setX(i, -n.getX(i)); }
  if (m.index) {
    const a = m.index.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
  } else {
    for (const k of Object.keys(m.attributes)) {
      const at = m.attributes[k], s = at.itemSize, arr = at.array;
      for (let i = 0; i < at.count; i += 3) for (let c = 0; c < s; c++) { const t = arr[(i + 1) * s + c]; arr[(i + 1) * s + c] = arr[(i + 2) * s + c]; arr[(i + 2) * s + c] = t; }
    }
  }
  return m;
}

/** Monotone piecewise-cubic (Catmull-Rom style, clamped) interpolation over sorted keys [[x, y], ...]. */
export function curve(keys) {
  const xs = keys.map((k) => k[0]), ys = keys.map((k) => k[1]);
  const n = xs.length;
  const m = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (i === 0) m[i] = (ys[1] - ys[0]) / (xs[1] - xs[0]);
    else if (i === n - 1) m[i] = (ys[n - 1] - ys[n - 2]) / (xs[n - 1] - xs[n - 2]);
    else {
      const d0 = (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1]), d1 = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
      m[i] = d0 * d1 <= 0 ? 0 : (d0 + d1) / 2;
      // Fritsch-Carlson limiter
      const a = m[i] / d0, b = m[i] / d1;
      if (a > 3) m[i] = 3 * d0; if (b > 3) m[i] = 3 * d1;
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/** Cosine-spaced samples in [a, b] (clustered at a when `oneSided`, else both ends). */
export function cosSpace(a, b, n, oneSided = false) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const w = oneSided ? 1 - Math.cos(t * Math.PI / 2) : 0.5 - 0.5 * Math.cos(t * Math.PI);
    out.push(a + (b - a) * w);
  }
  return out;
}

/** Uniform samples in [a, b] with roughly `step` spacing (at least 2). */
export function span(a, b, step) {
  const n = Math.max(2, Math.ceil(Math.abs(b - a) / step) + 1);
  const out = [];
  for (let i = 0; i < n; i++) out.push(a + (b - a) * i / (n - 1));
  return out;
}

/**
 * Lathe around the local Z axis: profile = [[r, z], ...]; segs around.
 * u = angle / 2π (0 at top, increasing towards +x), v = profile parameter (cumulative length normalised).
 * deform(x, y, z, i, j) optional -> mutate {x,y,z}.
 */
export function latheZ(profile, segs, { deform = null, vRange = [0, 1], uRange = [0, 1], flip = false } = {}) {
  // cumulative length for v
  const L = [0];
  for (let i = 1; i < profile.length; i++) L.push(L[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  const tot = L[L.length - 1] || 1;
  return gridGeometry(profile.length, segs + 1, (i, j, p, uv) => {
    const a = (j / segs) * Math.PI * 2;
    const r = profile[i][0];
    p.x = Math.sin(a) * r; p.y = Math.cos(a) * r; p.z = profile[i][1];
    if (deform) deform(p, i, j);
    uv.u = uRange[0] + (uRange[1] - uRange[0]) * (j / segs);
    uv.v = vRange[0] + (vRange[1] - vRange[0]) * (L[i] / tot);
  }, { flip });
}

/**
 * Loft of elliptic/superelliptic sections along Z.
 * sec(t) -> { z, cx, cy, w (half width), hTop, hBot, n (exponent) } for t in [0,1].
 */
export function loftZ(rows, segs, sec, { uvFn = null, flip = false } = {}) {
  return gridGeometry(rows, segs + 1, (i, j, p, uv) => {
    const t = i / (rows - 1);
    const s = sec(t);
    const a = (j / segs) * Math.PI * 2;
    const sa = Math.sin(a), ca = Math.cos(a);
    const e = 2 / (s.n || 2);
    const sx = Math.sign(sa) * Math.pow(Math.abs(sa), e), sy = Math.sign(ca) * Math.pow(Math.abs(ca), e);
    p.x = (s.cx || 0) + s.w * sx;
    p.y = s.cy + (ca >= 0 ? s.hTop : s.hBot) * sy;
    p.z = s.z;
    if (uvFn) uvFn(t, j / segs, uv); else { uv.u = j / segs; uv.v = t; }
  }, { flip });
}

export { mergeGeometries };

/**
 * Average normals of coincident vertices (lathe seams, grid seams) when the
 * angle between them is below maxDeg (keeps intentional creases sharp).
 */
export function smoothSeams(g, maxDeg = 50) {
  const p = g.attributes.position, n = g.attributes.normal;
  if (!n) return g;
  const map = new Map();
  const q = 1e4;
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i) * q)},${Math.round(p.getY(i) * q)},${Math.round(p.getZ(i) * q)}`;
    let l = map.get(key);
    if (!l) { l = []; map.set(key, l); }
    l.push(i);
  }
  const cosMax = Math.cos(maxDeg * Math.PI / 180);
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  for (const l of map.values()) {
    if (l.length < 2) continue;
    for (const i of l) {
      v.set(0, 0, 0);
      w.set(n.getX(i), n.getY(i), n.getZ(i));
      for (const j of l) {
        const nx = n.getX(j), ny = n.getY(j), nz = n.getZ(j);
        if (w.x * nx + w.y * ny + w.z * nz >= cosMax) v.x += nx, v.y += ny, v.z += nz;
      }
      v.normalize();
      g.userData._tmpN = g.userData._tmpN || new Float32Array(n.count * 3);
      g.userData._tmpN[i * 3] = v.x; g.userData._tmpN[i * 3 + 1] = v.y; g.userData._tmpN[i * 3 + 2] = v.z;
    }
  }
  const t = g.userData._tmpN;
  if (t) {
    for (const l of map.values()) if (l.length > 1) for (const i of l) n.setXYZ(i, t[i * 3], t[i * 3 + 1], t[i * 3 + 2]);
    delete g.userData._tmpN;
  }
  n.needsUpdate = true;
  return g;
}
