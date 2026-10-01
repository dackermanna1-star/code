// Polyline helpers. Polylines are flat number arrays [x0, y0, x1, y1, ...].

import { noise1 } from './noise.js';

export function polyLen(p) {
  let L = 0;
  for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return L;
}

/** Resample to roughly uniform spacing ds (keeps endpoints). */
export function resample(p, ds, maxPts = 400) {
  const n = p.length >> 1;
  if (n < 2) return p.slice();
  const L = polyLen(p);
  if (L <= 1e-9) return [p[0], p[1], p[0] + 1e-6, p[1]];
  let cnt = Math.max(2, Math.min(maxPts, Math.ceil(L / ds) + 1));
  const step = L / (cnt - 1);
  const out = [p[0], p[1]];
  let seg = 0;
  let segStart = 0;
  let segLen = Math.hypot(p[2] - p[0], p[3] - p[1]);
  for (let k = 1; k < cnt - 1; k++) {
    const target = k * step;
    while (segStart + segLen < target && seg < n - 2) {
      segStart += segLen;
      seg++;
      segLen = Math.hypot(p[seg * 2 + 2] - p[seg * 2], p[seg * 2 + 3] - p[seg * 2 + 1]);
    }
    const t = segLen > 1e-12 ? (target - segStart) / segLen : 0;
    out.push(
      p[seg * 2] + (p[seg * 2 + 2] - p[seg * 2]) * t,
      p[seg * 2 + 1] + (p[seg * 2 + 3] - p[seg * 2 + 1]) * t,
    );
  }
  out.push(p[p.length - 2], p[p.length - 1]);
  return out;
}

/** Chaikin corner cutting (open polyline, endpoints kept). */
export function chaikin(p, iters = 1, amount = 0.25) {
  let cur = p;
  for (let it = 0; it < iters; it++) {
    const n = cur.length >> 1;
    if (n < 3) return cur;
    const out = [cur[0], cur[1]];
    for (let i = 0; i < n - 1; i++) {
      const x0 = cur[i * 2], y0 = cur[i * 2 + 1], x1 = cur[i * 2 + 2], y1 = cur[i * 2 + 3];
      if (i > 0) out.push(x0 + (x1 - x0) * amount, y0 + (y1 - y0) * amount);
      if (i < n - 2) out.push(x0 + (x1 - x0) * (1 - amount), y0 + (y1 - y0) * (1 - amount));
    }
    out.push(cur[cur.length - 2], cur[cur.length - 1]);
    cur = out;
  }
  return cur;
}

/** Ramer-Douglas-Peucker simplification. */
export function rdp(p, eps) {
  const n = p.length >> 1;
  if (n < 3) return p.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = p[a * 2], ay = p[a * 2 + 1], bx = p[b * 2], by = p[b * 2 + 1];
    const dx = bx - ax, dy = by - ay;
    const L = Math.hypot(dx, dy) || 1e-12;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((p[i * 2] - ax) * dy - (p[i * 2 + 1] - ay) * dx) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (best > eps && bi > 0) {
      keep[bi] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i * 2], p[i * 2 + 1]);
  return out;
}

/** Apply affine [a b c d e f]: x' = a x + c y + e, y' = b x + d y + f */
export function affine(p, a, b, c, d, e, f) {
  const out = new Array(p.length);
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i], y = p[i + 1];
    out[i] = a * x + c * y + e;
    out[i + 1] = b * x + d * y + f;
  }
  return out;
}

export function rotateAround(p, cx, cy, ang) {
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const out = new Array(p.length);
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i] - cx, y = p[i + 1] - cy;
    out[i] = cx + x * cs - y * sn;
    out[i + 1] = cy + x * sn + y * cs;
  }
  return out;
}

export function translate(p, dx, dy) {
  const out = new Array(p.length);
  for (let i = 0; i < p.length; i += 2) {
    out[i] = p[i] + dx;
    out[i + 1] = p[i + 1] + dy;
  }
  return out;
}

export function bboxOf(polys, pad = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) {
    for (let i = 0; i < p.length; i += 2) {
      const x = p[i], y = p[i + 1];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x0 === Infinity) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

export function unionBox(a, b) {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

/** Smooth hand wobble: displace points along their normal with 1D noise of arc length. */
export function wobble(p, amp, freq, seed, tangentAmp = 0) {
  const n = p.length >> 1;
  if (n < 2 || amp <= 0) return p;
  const out = new Array(p.length);
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) s += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    let tx = p[i1 * 2] - p[i0 * 2], ty = p[i1 * 2 + 1] - p[i0 * 2 + 1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const d = (noise1(s * freq, seed) * 2 - 1) * amp;
    const dt = tangentAmp ? (noise1(s * freq + 37.1, seed + 7) * 2 - 1) * tangentAmp : 0;
    out[i * 2] = p[i * 2] - ty * d + tx * dt;
    out[i * 2 + 1] = p[i * 2 + 1] + tx * d + ty * dt;
  }
  return out;
}

/** Point and unit tangent at fraction t of the polyline length. */
export function sampleAt(p, t) {
  const L = polyLen(p);
  let target = Math.max(0, Math.min(1, t)) * L;
  const n = p.length >> 1;
  for (let i = 0; i < n - 1; i++) {
    const dx = p[i * 2 + 2] - p[i * 2], dy = p[i * 2 + 3] - p[i * 2 + 1];
    const l = Math.hypot(dx, dy);
    if (target <= l || i === n - 2) {
      const u = l > 1e-12 ? Math.min(1, target / l) : 0;
      return { x: p[i * 2] + dx * u, y: p[i * 2 + 1] + dy * u, tx: l ? dx / l : 1, ty: l ? dy / l : 0 };
    }
    target -= l;
  }
  return { x: p[0], y: p[1], tx: 1, ty: 0 };
}

export function cubicPts(x0, y0, x1, y1, x2, y2, x3, y3, segs, out) {
  for (let i = 1; i <= segs; i++) {
    const t = i / segs, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push(a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3);
  }
}

export function quadPts(x0, y0, x1, y1, x2, y2, segs, out) {
  for (let i = 1; i <= segs; i++) {
    const t = i / segs, u = 1 - t;
    out.push(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2);
  }
}

/** Point-in-polygon (flat array, closed implicitly). */
export function pointInPoly(poly, x, y) {
  let inside = false;
  const n = poly.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2], yi = poly[i * 2 + 1], xj = poly[j * 2], yj = poly[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

/** Irregular blob polygon around a center (closed, flat array). */
export function blobPoly(cx, cy, rx, ry, rng, irregularity = 0.25, n = 18) {
  const out = [];
  const ph = rng.range(0, 100);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 1 + irregularity * (noise1(i * 0.9 + ph, 11) * 2 - 1) + irregularity * 0.4 * rng.range(-1, 1);
    out.push(cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r);
  }
  return out;
}

/** Jagged polyline between two points (for torn paper edges etc.). */
export function jaggedLine(x0, y0, x1, y1, rng, amp, step, out = []) {
  const L = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(L / step));
  const nx = -(y1 - y0) / (L || 1), ny = (x1 - x0) / (L || 1);
  let off = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (i > 0 && i < n) off = off * 0.45 + rng.range(-1, 1) * amp;
    else off = 0;
    out.push(x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off);
  }
  return out;
}
