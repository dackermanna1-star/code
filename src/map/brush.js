// Convex brush primitives (Hammer/Quake style) and polygon utilities.
// All coordinates are GoldSrc world units (x east, y north, z up).

import { CONTENTS_SOLID } from '../engine/collision.js';

const EPS = 0.01;

// A face plane: n·p = d, n points out of the brush. tex = texture spec.
export function plane(n, d, tex) {
  const l = Math.hypot(n[0], n[1], n[2]);
  return { n: [n[0] / l, n[1] / l, n[2] / l], d: d / l, tex };
}

export function planeFromPoints(a, b, c, tex) {
  // normal = (b-a) x (c-a)
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  const l = Math.hypot(n[0], n[1], n[2]);
  n[0] /= l; n[1] /= l; n[2] /= l;
  return { n, d: n[0] * a[0] + n[1] * a[1] + n[2] * a[2], tex };
}

export class Brush {
  constructor(planes, opts = {}) {
    this.planes = planes;
    this.contents = opts.contents ?? CONTENTS_SOLID;
    this.visible = opts.visible ?? true;
    this.castShadow = opts.castShadow ?? true;
    this.surface = opts.surface || null; // footstep/impact material override
    this.name = opts.name || '';
    this.detail = !!opts.detail; // detail brushes don't clip others in CSG
    this.id = -1;
    this.polys = null;
    this.mins = null;
    this.maxs = null;
  }

  // Compute face polygons and bounds.
  computePolys() {
    const polys = [];
    const mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < this.planes.length; i++) {
      const p = this.planes[i];
      let w = baseWinding(p.n, p.d);
      for (let j = 0; j < this.planes.length && w; j++) {
        if (j === i) continue;
        const q = this.planes[j];
        // identical plane? skip
        if (Math.abs(q.n[0] - p.n[0]) < 1e-6 && Math.abs(q.n[1] - p.n[1]) < 1e-6 && Math.abs(q.n[2] - p.n[2]) < 1e-6 && Math.abs(q.d - p.d) < 1e-4) continue;
        w = clipKeepBack(w, q.n, q.d);
      }
      if (w && w.length >= 3) {
        for (const v of w) {
          for (let a = 0; a < 3; a++) {
            v[a] = snap(v[a]);
            if (v[a] < mins[a]) mins[a] = v[a];
            if (v[a] > maxs[a]) maxs[a] = v[a];
          }
        }
        polys.push(w);
      } else polys.push(null);
    }
    this.polys = polys;
    this.mins = mins;
    this.maxs = maxs;
    return polys;
  }
}

function snap(x) {
  const r = Math.round(x * 8) / 8;
  return Math.abs(r - x) < 0.01 ? r : x;
}

export function baseWinding(n, d) {
  // find major axis
  let x = -1, max = -Infinity;
  for (let i = 0; i < 3; i++) {
    const v = Math.abs(n[i]);
    if (v > max) { max = v; x = i; }
  }
  const up = [0, 0, 0];
  if (x === 2) up[0] = 1; else up[2] = 1;
  let v = dot(up, n);
  up[0] -= v * n[0]; up[1] -= v * n[1]; up[2] -= v * n[2];
  normalize(up);
  const org = [n[0] * d, n[1] * d, n[2] * d];
  const right = cross(up, n);
  const S = 65536;
  for (let i = 0; i < 3; i++) { up[i] *= S; right[i] *= S; }
  return [
    [org[0] - right[0] + up[0], org[1] - right[1] + up[1], org[2] - right[2] + up[2]],
    [org[0] + right[0] + up[0], org[1] + right[1] + up[1], org[2] + right[2] + up[2]],
    [org[0] + right[0] - up[0], org[1] + right[1] - up[1], org[2] + right[2] - up[2]],
    [org[0] - right[0] - up[0], org[1] - right[1] - up[1], org[2] - right[2] - up[2]],
  ];
}

// Split polygon by plane; returns {front, back} (either may be null).
export function splitPolygon(w, n, d, eps = EPS) {
  const dists = new Array(w.length);
  const sides = new Array(w.length);
  let nf = 0, nb = 0;
  for (let i = 0; i < w.length; i++) {
    const dd = dot(w[i], n) - d;
    dists[i] = dd;
    if (dd > eps) { sides[i] = 1; nf++; }
    else if (dd < -eps) { sides[i] = -1; nb++; }
    else sides[i] = 0;
  }
  if (!nf && !nb) return { front: null, back: null, on: true };
  if (!nf) return { front: null, back: w };
  if (!nb) return { front: w, back: null };
  const front = [], back = [];
  for (let i = 0; i < w.length; i++) {
    const p1 = w[i];
    if (sides[i] === 0) { front.push(p1); back.push(p1); continue; }
    if (sides[i] === 1) front.push(p1); else back.push(p1);
    const j = (i + 1) % w.length;
    if (sides[j] === 0 || sides[j] === sides[i]) continue;
    const p2 = w[j];
    const t = dists[i] / (dists[i] - dists[j]);
    const mid = [snap(p1[0] + (p2[0] - p1[0]) * t), snap(p1[1] + (p2[1] - p1[1]) * t), snap(p1[2] + (p2[2] - p1[2]) * t)];
    front.push(mid);
    back.push(mid.slice());
  }
  return { front: front.length >= 3 ? front : null, back: back.length >= 3 ? back : null };
}

export function clipKeepBack(w, n, d) {
  const r = splitPolygon(w, n, d);
  if (r.on) return w; // coplanar; keep
  return r.back;
}

export function polyArea(w) {
  let ax = 0, ay = 0, az = 0;
  for (let i = 1; i + 1 < w.length; i++) {
    const c = cross(sub(w[i], w[0]), sub(w[i + 1], w[0]));
    ax += c[0]; ay += c[1]; az += c[2];
  }
  return 0.5 * Math.hypot(ax, ay, az);
}

export function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
export function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function normalize(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  a[0] /= l; a[1] /= l; a[2] /= l;
  return a;
}

// ---------------------------------------------------------------------------
// Texture specs.
// tex can be a string (texture name, world-aligned) or an object:
//   { name, fit: true|false, scale:[su,sv], offset:[ou,ov], rot: deg }
// Face selection keys for helpers: all, top, bottom, sides, n(+y) s(-y) e(+x) w(-x)

export function resolveTex(spec, normal) {
  if (!spec) return null;
  if (typeof spec === 'string' || spec.name || spec === null) return spec;
  // keyed object
  const [x, y, z] = normal;
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let key;
  if (az >= ax && az >= ay) key = z > 0 ? 'top' : 'bottom';
  else if (ax >= ay) key = x > 0 ? 'e' : 'w';
  else key = y > 0 ? 'n' : 's';
  if (key in spec) return spec[key];
  if ((key === 'top' || key === 'bottom') && 'caps' in spec) return spec.caps;
  if (key !== 'top' && key !== 'bottom' && 'sides' in spec) return spec.sides;
  return spec.all ?? null;
}

// Axis-aligned box brush.
export function boxBrush(min, max, tex, opts) {
  const t = (n) => resolveTex(tex, n);
  const planes = [
    plane([1, 0, 0], max[0], t([1, 0, 0])),
    plane([-1, 0, 0], -min[0], t([-1, 0, 0])),
    plane([0, 1, 0], max[1], t([0, 1, 0])),
    plane([0, -1, 0], -min[1], t([0, -1, 0])),
    plane([0, 0, 1], max[2], t([0, 0, 1])),
    plane([0, 0, -1], -min[2], t([0, 0, -1])),
  ];
  return new Brush(planes, opts);
}

// Extrude a convex 2D polygon. axis: 'x' | 'y' | 'z' is the extrusion direction.
// pts2: [[a,b],...] in the plane of the other two axes, in (y,z) for 'x', (x,z) for 'y', (x,y) for 'z'.
export function prismBrush(axis, pts2, lo, hi, tex, opts) {
  const ai = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const [ua, ub] = ai === 0 ? [1, 2] : ai === 1 ? [0, 2] : [0, 1];
  const to3 = (a, b, c) => { const p = [0, 0, 0]; p[ua] = a; p[ub] = b; p[ai] = c; return p; };
  let cx = 0, cy = 0;
  for (const p of pts2) { cx += p[0]; cy += p[1]; }
  cx /= pts2.length; cy /= pts2.length;
  const planes = [];
  const t = (n) => resolveTex(tex, n);
  for (let i = 0; i < pts2.length; i++) {
    const p = pts2[i], q = pts2[(i + 1) % pts2.length];
    let nx = q[1] - p[1], ny = -(q[0] - p[0]);
    const mx = (p[0] + q[0]) / 2 - cx, my = (p[1] + q[1]) / 2 - cy;
    if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
    const l = Math.hypot(nx, ny);
    if (l < 1e-9) continue;
    nx /= l; ny /= l;
    const n = to3(nx, ny, 0);
    planes.push(plane(n, nx * p[0] + ny * p[1], t(n)));
  }
  const nhi = [0, 0, 0]; nhi[ai] = 1;
  const nlo = [0, 0, 0]; nlo[ai] = -1;
  planes.push(plane(nhi, hi, t(nhi)));
  planes.push(plane(nlo, -lo, t(nlo)));
  return new Brush(planes, opts);
}
