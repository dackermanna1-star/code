// =============================================================================
// Flight-director maths: scalar helpers, ISA atmosphere, smooth followers and
// non-allocating samplers for layout.js paths (and our own multi-radius
// fillet paths used for the descent route).
// Pure JS (no Three.js) so the node self-test can use it directly.
// =============================================================================
import { DEG } from '../core/constants.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp01((v - a) / (b - a));
export const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const smootherstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
/** Frame-rate independent exponential approach. */
export const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
/** Move `cur` towards `target` by at most `step`. */
export const approach = (cur, target, step) => (cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step));
export const wrap360 = (d) => ((d % 360) + 360) % 360;
export const wrap180 = (d) => { let x = ((d + 180) % 360 + 360) % 360 - 180; if (x === -180) x = 180; return x; };
export const wrapPi = (r) => { let x = r % (2 * Math.PI); if (x > Math.PI) x -= 2 * Math.PI; else if (x < -Math.PI) x += 2 * Math.PI; return x; };
/** Piecewise-linear table lookup: table = [[x0, y0], [x1, y1], ...] sorted by x. */
export function table(tab, x) {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) {
    if (x <= tab[i][0]) { const a = tab[i - 1], b = tab[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
  }
  return tab[tab.length - 1][1];
}

// ----------------------------------------------------------------------------- atmosphere
export const RHO0 = 1.225;
export const ISA_SCRATCH = { T: 288.15, rho: RHO0, a: 340.3 };
/** International Standard Atmosphere at geometric altitude h (m). Writes {T (K), rho, a} into out. */
export function isaInto(h, out = ISA_SCRATCH) {
  const hh = h < -500 ? -500 : h;
  let T, rho;
  if (hh < 11000) { T = 288.15 - 0.0065 * hh; rho = RHO0 * Math.pow(T / 288.15, 4.2559); }
  else { T = 216.65; rho = 0.36392 * Math.exp(-(hh - 11000) / 6341.6); }
  out.T = T; out.rho = rho; out.a = Math.sqrt(1.4 * 287.053 * T);
  return out;
}
/** Equivalent (≈ indicated) airspeed -> true airspeed. */
export const tasFromIas = (ias, rho) => ias * Math.sqrt(RHO0 / rho);
export const iasFromTas = (tas, rho) => tas * Math.sqrt(rho / RHO0);

// ----------------------------------------------------------------------------- followers
/**
 * Second-order (critically damped) follower with rate and acceleration limits.
 * st = { x, v } is updated in place. Produces C1-continuous motion.
 */
export function follow(st, target, dt, wn, vmax, amax) {
  let a = wn * wn * (target - st.x) - 2 * wn * st.v;
  if (a > amax) a = amax; else if (a < -amax) a = -amax;
  st.v += a * dt;
  if (st.v > vmax) st.v = vmax; else if (st.v < -vmax) st.v = -vmax;
  st.x += st.v * dt;
  return st;
}
/** Damped spring (mass-normalised): x'' = w²(eq - x) - 2ζw x' + f. Updates st {x, v, a}. */
export function spring(st, eq, dt, w, zeta, force = 0) {
  const a = w * w * (eq - st.x) - 2 * zeta * w * st.v + force;
  st.v += a * dt;
  st.x += st.v * dt;
  st.a = a;
  return st;
}

// ----------------------------------------------------------------------------- paths
// A path is { samples: [{x, z, heading, s}], length, reverse?, kappa?: Float32Array }
// (layout.buildPath output, optionally prepared with preparePath).
const _pa = { x: 0, z: 0, heading: 0, i: 0 };
const _pb = { x: 0, z: 0, heading: 0, i: 0 };

/** Non-allocating samplePath(): writes {x, z, heading, i} into out. */
export function pathPoint(path, s, out) {
  const S = path.samples, n = S.length;
  if (s <= 0 || n < 2) { const p = S[0]; out.x = p.x; out.z = p.z; out.heading = p.heading; out.i = 0; return out; }
  if (s >= path.length) { const p = S[n - 1]; out.x = p.x; out.z = p.z; out.heading = p.heading; out.i = n - 2; return out; }
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m].s <= s) lo = m; else hi = m; }
  const a = S[lo], b = S[hi];
  const t = (s - a.s) / Math.max(1e-9, b.s - a.s);
  out.x = a.x + (b.x - a.x) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.heading = wrap360(a.heading + wrap180(b.heading - a.heading) * t);
  out.i = lo;
  return out;
}

/** Nose heading (deg) from the chord s-w..s+w: smooths curvature steps at fillet ends. */
export function chordHeading(path, s, w = 3) {
  pathPoint(path, Math.max(0, s - w), _pa);
  pathPoint(path, Math.min(path.length, s + w), _pb);
  const dx = _pb.x - _pa.x, dz = _pb.z - _pa.z;
  if (dx * dx + dz * dz < 0.25) return pathPoint(path, s, _pa).heading;
  let h = Math.atan2(dx, -dz) / DEG;
  if (path.reverse) h += 180;
  return wrap360(h);
}

/** Adds `reverse` and a signed curvature table (rad/m, + = turning right) to a built path. */
export function preparePath(path, reverse = false, w = 3) {
  path.reverse = reverse;
  const S = path.samples, n = S.length;
  const k = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = S[i].s;
    const a = chordHeading(path, Math.max(0, s - w), w), b = chordHeading(path, Math.min(path.length, s + w), w);
    const ds = Math.min(path.length, s + w) - Math.max(0, s - w);
    k[i] = ds > 0.5 ? wrap180(b - a) * DEG / ds : 0;
  }
  path.kappa = k;
  return path;
}

/** Curvature at s (interpolated from the prepared table). */
export function pathKappa(path, s) {
  if (!path.kappa) return 0;
  pathPoint(path, s, _pa);
  const i = _pa.i, S = path.samples;
  if (i >= S.length - 1) return path.kappa[S.length - 1];
  const t = clamp01((s - S[i].s) / Math.max(1e-9, S[i + 1].s - S[i].s));
  return path.kappa[i] + (path.kappa[i + 1] - path.kappa[i]) * t;
}

/** Concatenate two built paths (b starts where a ends). Returns a new path (not prepared). */
export function concatPaths(a, b) {
  const samples = a.samples.map((p) => ({ ...p }));
  const last = samples[samples.length - 1];
  for (let i = 0; i < b.samples.length; i++) {
    const p = b.samples[i];
    if (i === 0 && Math.hypot(p.x - last.x, p.z - last.z) < 0.05) continue;
    samples.push({ x: p.x, z: p.z, heading: p.heading, s: a.length + p.s });
  }
  return { samples, length: a.length + b.length };
}

/**
 * Like layout.buildPath, but with a fillet radius per corner (radii[i] for points[i]) and a
 * configurable sample step. Used for the en-route descent path (km-scale turns).
 */
export function buildFilletPath(points, radii, step = 20) {
  const P = points.map(([x, z]) => ({ x, z }));
  const out = [];
  const push = (x, z) => { const l = out[out.length - 1]; if (l && Math.hypot(x - l.x, z - l.z) < 1e-6) return; out.push({ x, z }); };
  const corners = [];
  push(P[0].x, P[0].z);
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const d1x = b.x - a.x, d1z = b.z - a.z, l1 = Math.hypot(d1x, d1z);
    const d2x = c.x - b.x, d2z = c.z - b.z, l2 = Math.hypot(d2x, d2z);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const u1x = d1x / l1, u1z = d1z / l1, u2x = d2x / l2, u2z = d2z / l2;
    const turn = Math.acos(clamp(u1x * u2x + u1z * u2z, -1, 1));
    let r = radii[i] || 0;
    if (turn < 1e-3 || r <= 0) { push(b.x, b.z); continue; }
    let t = r * Math.tan(turn / 2);
    const maxT = Math.min(l1, l2) * 0.5;
    if (t > maxT) { t = maxT; r = t / Math.tan(turn / 2); }
    const sx = b.x - u1x * t, sz = b.z - u1z * t, ex = b.x + u2x * t, ez = b.z + u2z * t;
    const cross = u1x * u2z - u1z * u2x;
    const nx = cross > 0 ? -u1z : u1z, nz = cross > 0 ? u1x : -u1x;
    const cx = sx + nx * r, cz = sz + nz * r;
    push(sx, sz);
    const a0 = Math.atan2(sz - cz, sx - cx), a1 = Math.atan2(ez - cz, ex - cx);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const n = Math.max(2, Math.ceil(Math.abs(da) * r / step));
    for (let k = 1; k <= n; k++) { const ang = a0 + da * (k / n); push(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r); }
    corners.push({ index: i, radius: r, turnDeg: turn / DEG, right: cross > 0 });
  }
  push(P[P.length - 1].x, P[P.length - 1].z);
  const dense = [];
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i], b = out[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) dense.push({ x: a.x + (b.x - a.x) * (k / n), z: a.z + (b.z - a.z) * (k / n) });
  }
  dense.push({ ...out[out.length - 1] });
  let s = 0;
  for (let i = 0; i < dense.length; i++) {
    const p = dense[i];
    if (i > 0) s += Math.hypot(p.x - dense[i - 1].x, p.z - dense[i - 1].z);
    p.s = s;
    const q = dense[Math.min(i + 1, dense.length - 1)], o = dense[Math.max(i - 1, 0)];
    p.heading = wrap360(Math.atan2(q.x - o.x, -(q.z - o.z)) / DEG);
  }
  return { samples: dense, length: s, corners };
}

/**
 * Closest point on a path to (x, z), searching around a hint index. Returns s.
 * window = number of samples searched on either side (use a large value for a global search).
 */
export function projectOnPath(path, x, z, hintS = 0, window = 40) {
  const S = path.samples, n = S.length;
  pathPoint(path, hintS, _pa);
  const i0 = Math.max(0, _pa.i - window), i1 = Math.min(n - 2, _pa.i + window);
  let best = Infinity, bestS = hintS;
  for (let i = i0; i <= i1; i++) {
    const a = S[i], b = S[i + 1];
    const ex = b.x - a.x, ez = b.z - a.z;
    const L2 = ex * ex + ez * ez;
    let t = L2 > 1e-9 ? ((x - a.x) * ex + (z - a.z) * ez) / L2 : 0;
    t = clamp01(t);
    const px = a.x + ex * t, pz = a.z + ez * t;
    const d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < best) { best = d; bestS = a.s + (b.s - a.s) * t; }
  }
  return bestS;
}

// ----------------------------------------------------------------------------- geodesy
/** Great-circle interpolation between two lat/lon points (degrees). Writes {lat, lon, bearing} into out. */
export function greatCircle(lat1, lon1, lat2, lon2, f, out) {
  const p1 = lat1 * DEG, l1 = lon1 * DEG, p2 = lat2 * DEG, l2 = lon2 * DEG;
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d < 1e-9) { out.lat = lat1; out.lon = lon1; out.bearing = 90; return out; }
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const zz = A * Math.sin(p1) + B * Math.sin(p2);
  const lat = Math.atan2(zz, Math.sqrt(x * x + y * y)), lon = Math.atan2(y, x);
  const by = Math.sin(l2 - lon) * Math.cos(p2);
  const bx = Math.cos(lat) * Math.sin(p2) - Math.sin(lat) * Math.cos(p2) * Math.cos(l2 - lon);
  out.lat = lat / DEG; out.lon = lon / DEG; out.bearing = wrap360(Math.atan2(by, bx) / DEG);
  out.distanceKm = d * 6371.0;
  return out;
}
