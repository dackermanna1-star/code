/**
 * Primitive surfaces (pure math, worker-safe): face lists for the texture atlas, rest-space
 * surface points for painting, and triangle meshes (rounded/bevelled boxes, tubes, ellipsoids,
 * membranes) with UVs into the atlas rects.
 */
import type { BoxPrim, EllipsoidPrim, FaceName, PrimDef, SheetPrim, TubePrim, V3 } from './def';

export interface FaceInfo {
  face: FaceName;
  w: number;
  h: number;
}

/** Rect in normalized atlas coordinates (u0, v0, u1, v1). */
export type UVRect = [number, number, number, number];

export interface MeshArrays {
  pos: number[];
  nrm: number[];
  uv: number[];
  idx: number[];
}

export interface SurfPoint {
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
}

// ------------------------------------------------------------------------------- math helpers
type M3 = number[]; // row-major 3x3

export function eulerZYX(r: V3 | undefined): M3 {
  if (!r) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const [ax, ay, az] = r;
  const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
  // Rz * Ry * Rx
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mul3(Rz, mul3(Ry, Rx));
}
function mul3(a: M3, b: M3): M3 {
  const o = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return o;
}
function apply3(m: M3, x: number, y: number, z: number, out: number[], o = 0) {
  out[o] = m[0] * x + m[1] * y + m[2] * z;
  out[o + 1] = m[3] * x + m[4] * y + m[5] * z;
  out[o + 2] = m[6] * x + m[7] * y + m[8] * z;
}
const norm3 = (v: number[], o = 0) => {
  const l = Math.hypot(v[o], v[o + 1], v[o + 2]) || 1;
  v[o] /= l; v[o + 1] /= l; v[o + 2] /= l;
};

// ------------------------------------------------------------------------------- box
interface FaceFrame { n: V3; u: V3; v: V3; }
const BOX_FACES: Record<Exclude<FaceName, 'surf'>, FaceFrame> = {
  front: { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  back: { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  right: { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  left: { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  top: { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  bottom: { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
};
export const BOX_FACE_NAMES = ['front', 'back', 'right', 'left', 'top', 'bottom'] as const;

function boxHalf(p: BoxPrim): { c: V3; h: V3 } {
  const inf = p.inflate ?? 0;
  const c: V3 = [(p.from[0] + p.to[0]) / 2, (p.from[1] + p.to[1]) / 2, (p.from[2] + p.to[2]) / 2];
  const h: V3 = [Math.abs(p.to[0] - p.from[0]) / 2 + inf, Math.abs(p.to[1] - p.from[1]) / 2 + inf, Math.abs(p.to[2] - p.from[2]) / 2 + inf];
  return { c, h };
}
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const absDot = (a: V3, h: V3) => Math.abs(a[0]) * h[0] + Math.abs(a[1]) * h[1] + Math.abs(a[2]) * h[2];

function boxFaces(p: BoxPrim): FaceInfo[] {
  const { h } = boxHalf(p);
  const out: FaceInfo[] = [];
  for (const f of BOX_FACE_NAMES) {
    if (p.skip?.includes(f)) continue;
    const fr = BOX_FACES[f];
    out.push({ face: f, w: 2 * absDot(fr.u, h), h: 2 * absDot(fr.v, h) });
  }
  return out;
}

/** Taper scale (x,z) at local y fraction t, and its derivative. */
function taperAt(p: BoxPrim, t: number): [number, number, number, number] {
  const b = p.taper?.bottom ?? [1, 1], tp = p.taper?.top ?? [1, 1];
  return [b[0] + (tp[0] - b[0]) * t, b[1] + (tp[1] - b[1]) * t, tp[0] - b[0], tp[1] - b[1]];
}

function boxPoint(p: BoxPrim, face: FaceName, u: number, v: number, out: SurfPoint) {
  const { c, h } = boxHalf(p);
  const fr = BOX_FACES[face as Exclude<FaceName, 'surf'>];
  const w = 2 * absDot(fr.u, h), hh = 2 * absDot(fr.v, h);
  const hn = absDot(fr.n, h);
  let lx = fr.n[0] * hn + fr.u[0] * (u - w / 2) + fr.v[0] * (v - hh / 2);
  const ly = fr.n[1] * hn + fr.u[1] * (u - w / 2) + fr.v[1] * (v - hh / 2);
  let lz = fr.n[2] * hn + fr.u[2] * (u - w / 2) + fr.v[2] * (v - hh / 2);
  const t = h[1] > 0 ? (ly + h[1]) / (2 * h[1]) : 0;
  const [sx, sz] = taperAt(p, t);
  lx *= sx; lz *= sz;
  const R = eulerZYX(p.rot);
  const o = p.origin ?? c;
  const tmp = [0, 0, 0];
  apply3(R, lx + c[0] - o[0], ly + c[1] - o[1], lz + c[2] - o[2], tmp);
  out.x = tmp[0] + o[0]; out.y = tmp[1] + o[1]; out.z = tmp[2] + o[2];
  apply3(R, fr.n[0], fr.n[1], fr.n[2], tmp);
  out.nx = tmp[0]; out.ny = tmp[1]; out.nz = tmp[2];
}

/** Grid coordinates across [0, L] with rounded-edge zones of radius r. */
function edgeGrid(L: number, r: number, seg: number, div: number): number[] {
  const out: number[] = [];
  const rr = Math.min(r, L / 2);
  if (rr <= 1e-6) {
    for (let i = 0; i <= div; i++) out.push((L * i) / div);
    return out;
  }
  for (let k = 0; k < seg; k++) out.push(rr - rr * Math.tan(((seg - k) / seg) * (Math.PI / 4)));
  const mid0 = rr, mid1 = L - rr;
  const nd = Math.max(1, div);
  if (mid1 - mid0 > 1e-6) for (let i = 0; i <= nd; i++) out.push(mid0 + ((mid1 - mid0) * i) / nd);
  else out.push(L / 2);
  for (let k = 1; k <= seg; k++) out.push(L - rr + rr * Math.tan((k / seg) * (Math.PI / 4)));
  // dedupe
  const d: number[] = [];
  for (const x of out) if (!d.length || x - d[d.length - 1] > 1e-7) d.push(x);
  return d;
}

function boxMesh(p: BoxPrim, rects: Partial<Record<FaceName, UVRect>>, mirror: boolean, out: MeshArrays) {
  const { c, h } = boxHalf(p);
  const r = Math.min(p.r ?? 0.02, h[0], h[1], h[2]);
  const seg = r > 0 ? p.seg ?? 2 : 1;
  const divs: V3 = typeof p.div === 'number' ? [p.div, p.div, p.div] : p.div ?? [1, 1, 1];
  const R = eulerZYX(p.rot);
  const o = p.origin ?? c;
  const tmp = [0, 0, 0], tn = [0, 0, 0];
  for (const f of BOX_FACE_NAMES) {
    if (p.skip?.includes(f)) continue;
    const rect = rects[f];
    if (!rect) continue;
    const fr = BOX_FACES[f];
    const W = 2 * absDot(fr.u, h), H = 2 * absDot(fr.v, h);
    const hn = absDot(fr.n, h);
    const divU = Math.abs(fr.u[0]) ? divs[0] : Math.abs(fr.u[1]) ? divs[1] : divs[2];
    const divV = Math.abs(fr.v[0]) ? divs[0] : Math.abs(fr.v[1]) ? divs[1] : divs[2];
    const gu = edgeGrid(W, r, seg, divU), gv = edgeGrid(H, r, seg, divV);
    const nu = gu.length, nv = gv.length;
    const base = out.pos.length / 3;
    const grid: number[] = [];
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = gu[i] - W / 2, b = gv[j] - H / 2;
        // flat point in box-local (centered) coordinates
        const px = fr.n[0] * hn + fr.u[0] * a + fr.v[0] * b;
        const py = fr.n[1] * hn + fr.u[1] * a + fr.v[1] * b;
        const pz = fr.n[2] * hn + fr.u[2] * a + fr.v[2] * b;
        // rounding
        const qx = Math.max(-(h[0] - r), Math.min(h[0] - r, px));
        const qy = Math.max(-(h[1] - r), Math.min(h[1] - r, py));
        const qz = Math.max(-(h[2] - r), Math.min(h[2] - r, pz));
        let dx = px - qx, dy = py - qy, dz = pz - qz;
        const dl = Math.hypot(dx, dy, dz);
        let nx = fr.n[0], ny = fr.n[1], nz = fr.n[2];
        let x = px, y = py, z = pz;
        if (r > 0 && dl > 1e-9) {
          dx /= dl; dy /= dl; dz /= dl;
          nx = dx; ny = dy; nz = dz;
          x = qx + dx * r; y = qy + dy * r; z = qz + dz * r;
        }
        // taper (x/z scale along local y) with analytic normal correction
        if (p.taper) {
          const t = (y + h[1]) / (2 * h[1]);
          const [sx, sz, dsx, dsz] = taperAt(p, t);
          const ax = x * (dsx / (2 * h[1])), cz = z * (dsz / (2 * h[1]));
          const nnx = sz * nx, nny = -ax * sz * nx + sx * sz * ny - sx * cz * nz, nnz = sx * nz;
          x *= sx; z *= sz;
          const l = Math.hypot(nnx, nny, nnz) || 1;
          nx = nnx / l; ny = nny / l; nz = nnz / l;
        }
        // to rest space
        apply3(R, x + c[0] - o[0], y + c[1] - o[1], z + c[2] - o[2], tmp);
        apply3(R, nx, ny, nz, tn);
        let X = tmp[0] + o[0], Y = tmp[1] + o[1], Z = tmp[2] + o[2];
        if (p.displace) {
          const d = p.displace(X, Y, Z, tn[0], tn[1], tn[2]);
          X += tn[0] * d; Y += tn[1] * d; Z += tn[2] * d;
        }
        out.pos.push(X, Y, Z);
        out.nrm.push(tn[0], tn[1], tn[2]);
        grid.push(X, Y, Z);
        let uu = gu[i] / W, vv = gv[j] / H;
        if (mirror) uu = 1 - uu;
        out.uv.push(rect[0] + (rect[2] - rect[0]) * uu, rect[1] + (rect[3] - rect[1]) * vv);
      }
    for (let j = 0; j < nv - 1; j++)
      for (let i = 0; i < nu - 1; i++) {
        const a = base + j * nu + i, b = a + 1, cc = a + nu, d = cc + 1;
        out.idx.push(a, b, cc, b, d, cc);
      }
    if (p.displace) gridNormals(out, base, nu, nv, grid, mirror);
  }
}

/** Recompute normals of a regular grid patch from its positions (after displacement). */
function gridNormals(out: MeshArrays, base: number, nu: number, nv: number, g: number[], flip: boolean) {
  const P = (i: number, j: number, k: number) => g[(j * nu + i) * 3 + k];
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(nu - 1, i + 1);
      const j0 = Math.max(0, j - 1), j1 = Math.min(nv - 1, j + 1);
      const ux = P(i1, j, 0) - P(i0, j, 0), uy = P(i1, j, 1) - P(i0, j, 1), uz = P(i1, j, 2) - P(i0, j, 2);
      const vx = P(i, j1, 0) - P(i, j0, 0), vy = P(i, j1, 1) - P(i, j0, 1), vz = P(i, j1, 2) - P(i, j0, 2);
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-12) continue;
      const k = (base + j * nu + i) * 3;
      // keep the analytic orientation (outward)
      const s = nx * out.nrm[k] + ny * out.nrm[k + 1] + nz * out.nrm[k + 2] < 0 ? -1 : 1;
      void flip;
      nx *= s / l; ny *= s / l; nz *= s / l;
      out.nrm[k] = nx; out.nrm[k + 1] = ny; out.nrm[k + 2] = nz;
    }
}

// ------------------------------------------------------------------------------- tube
function catmull(pts: V3[], t: number, out: number[]) {
  const n = pts.length;
  if (n === 1) { out[0] = pts[0][0]; out[1] = pts[0][1]; out[2] = pts[0][2]; return; }
  const f = t * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  const u = f - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
  for (let k = 0; k < 3; k++) {
    const a = p0[k], b = p1[k], c = p2[k], d = p3[k];
    out[k] = 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  }
}
function tubeRadius(p: TubePrim, t: number): number {
  const r = p.radius;
  if (typeof r === 'number') return r;
  if (typeof r === 'function') return r(t);
  const f = t * (r.length - 1);
  const i = Math.min(r.length - 2, Math.floor(f));
  const u = f - i;
  const s = u * u * (3 - 2 * u);
  return r[i] + (r[i + 1] - r[i]) * s;
}

interface TubeFrame { c: number[]; t: number[]; n: number[]; b: number[]; r: number; s: number; }
function tubeFrames(p: TubePrim, segs: number): { frames: TubeFrame[]; length: number } {
  const frames: TubeFrame[] = [];
  const c = [0, 0, 0], c2 = [0, 0, 0];
  let len = 0;
  let prev: number[] | null = null;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    catmull(p.path, t, c);
    const e = 1e-3;
    catmull(p.path, Math.min(1, t + e), c2);
    const cb = [0, 0, 0];
    catmull(p.path, Math.max(0, t - e), cb);
    const tg = [c2[0] - cb[0], c2[1] - cb[1], c2[2] - cb[2]];
    norm3(tg);
    if (prev) len += Math.hypot(c[0] - prev[0], c[1] - prev[1], c[2] - prev[2]);
    prev = [c[0], c[1], c[2]];
    frames.push({ c: [c[0], c[1], c[2]], t: tg, n: [0, 0, 0], b: [0, 0, 0], r: tubeRadius(p, t), s: len });
  }
  // parallel transport frames
  const t0 = frames[0].t;
  let up = Math.abs(t0[1]) > 0.9 ? [0, 0, -1] : [0, 1, 0];
  let n = cross(up, t0);
  norm3(n);
  n = cross(t0, n);
  norm3(n);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (i > 0) {
      // project previous normal onto the plane of this tangent
      const pn = frames[i - 1].n;
      const d = pn[0] * f.t[0] + pn[1] * f.t[1] + pn[2] * f.t[2];
      n = [pn[0] - f.t[0] * d, pn[1] - f.t[1] * d, pn[2] - f.t[2] * d];
      norm3(n);
    }
    f.n = n;
    f.b = cross(f.t, n);
    norm3(f.b);
  }
  void up;
  return { frames, length: len };
}
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const frameCache = new WeakMap<TubePrim, Map<number, { frames: TubeFrame[]; length: number }>>();
function cachedFrames(p: TubePrim, segs: number) {
  let m = frameCache.get(p);
  if (!m) frameCache.set(p, (m = new Map()));
  let f = m.get(segs);
  if (!f) m.set(segs, (f = tubeFrames(p, segs)));
  return f;
}

/** Total length of the tube's UV strip (body + caps), matching tubeMesh. */
function tubeV(p: TubePrim, segs: number) {
  const { frames, length } = cachedFrames(p, segs);
  const r0 = frames[0].r, r1 = frames[frames.length - 1].r;
  return { total: length + (p.caps ? (r0 + r1) * 0.5 : 0), cap0: p.caps ? r0 * 0.5 : 0, length };
}

function tubeFaces(p: TubePrim): FaceInfo[] {
  const segs = p.segs ?? 12;
  const { frames } = cachedFrames(p, segs);
  let rmax = 0;
  for (const f of frames) rmax = Math.max(rmax, f.r);
  const a = p.aspect ?? [1, 1];
  return [{ face: 'surf', w: Math.PI * rmax * (a[0] + a[1]), h: tubeV(p, segs).total }];
}

function tubePoint(p: TubePrim, u: number, v: number, w: number, h: number, out: SurfPoint) {
  const segs = p.segs ?? 12;
  const { frames } = cachedFrames(p, segs);
  const tv = tubeV(p, segs);
  const s = Math.max(0, Math.min(tv.length, (v / h) * tv.total - tv.cap0));
  let i = 0;
  while (i < frames.length - 2 && frames[i + 1].s < s) i++;
  const f0 = frames[i], f1 = frames[i + 1];
  const k = f1.s > f0.s ? Math.min(1, (s - f0.s) / (f1.s - f0.s)) : 0;
  const L = (a: number[], b: number[], j: number) => a[j] + (b[j] - a[j]) * k;
  const r = f0.r + (f1.r - f0.r) * k;
  const th = (u / w) * Math.PI * 2;
  const a = p.aspect ?? [1, 1];
  const cs = Math.cos(th), sn = Math.sin(th);
  const ox = L(f0.n, f1.n, 0) * cs * a[0] + L(f0.b, f1.b, 0) * sn * a[1];
  const oy = L(f0.n, f1.n, 1) * cs * a[0] + L(f0.b, f1.b, 1) * sn * a[1];
  const oz = L(f0.n, f1.n, 2) * cs * a[0] + L(f0.b, f1.b, 2) * sn * a[1];
  out.x = L(f0.c, f1.c, 0) + ox * r;
  out.y = L(f0.c, f1.c, 1) + oy * r;
  out.z = L(f0.c, f1.c, 2) + oz * r;
  const nx = L(f0.n, f1.n, 0) * cs / a[0] + L(f0.b, f1.b, 0) * sn / a[1];
  const ny = L(f0.n, f1.n, 1) * cs / a[0] + L(f0.b, f1.b, 1) * sn / a[1];
  const nz = L(f0.n, f1.n, 2) * cs / a[0] + L(f0.b, f1.b, 2) * sn / a[1];
  const l = Math.hypot(nx, ny, nz) || 1;
  out.nx = nx / l; out.ny = ny / l; out.nz = nz / l;
}

function tubeMesh(p: TubePrim, rect: UVRect, mirror: boolean, out: MeshArrays) {
  const sides = p.sides ?? 10;
  const segs = p.segs ?? 12;
  const { frames, length } = cachedFrames(p, segs);
  const a = p.aspect ?? [1, 1];
  const capRings = p.caps ? 3 : 0;
  // ring list: caps (start), body, caps (end)
  type Ring = { c: number[]; n: number[]; b: number[]; t: number[]; r: number; v: number; nt: number };
  const rings: Ring[] = [];
  const r0 = frames[0].r, r1 = frames[frames.length - 1].r;
  const totalV = length + (p.caps ? (r0 + r1) * 0.5 : 0);
  const capOff0 = p.caps ? r0 * 0.5 : 0;
  for (let k = capRings; k >= 1; k--) {
    const f = frames[0];
    const phi = (k / (capRings + 1)) * (Math.PI / 2);
    rings.push({ c: [f.c[0] - f.t[0] * Math.sin(phi) * f.r, f.c[1] - f.t[1] * Math.sin(phi) * f.r, f.c[2] - f.t[2] * Math.sin(phi) * f.r], n: f.n, b: f.b, t: f.t, r: f.r * Math.cos(phi), v: capOff0 * (1 - k / (capRings + 1)), nt: -Math.sin(phi) });
  }
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const dr = i > 0 && i < frames.length - 1 ? (frames[i + 1].r - frames[i - 1].r) / Math.max(1e-6, frames[i + 1].s - frames[i - 1].s) : 0;
    rings.push({ c: f.c, n: f.n, b: f.b, t: f.t, r: f.r, v: capOff0 + f.s, nt: -dr });
  }
  for (let k = 1; k <= capRings; k++) {
    const f = frames[frames.length - 1];
    const phi = (k / (capRings + 1)) * (Math.PI / 2);
    rings.push({ c: [f.c[0] + f.t[0] * Math.sin(phi) * f.r, f.c[1] + f.t[1] * Math.sin(phi) * f.r, f.c[2] + f.t[2] * Math.sin(phi) * f.r], n: f.n, b: f.b, t: f.t, r: f.r * Math.cos(phi), v: capOff0 + length + (r1 * 0.5 * k) / (capRings + 1), nt: Math.sin(phi) });
  }
  if (p.caps) {
    // closing points
    const f0 = frames[0], f1 = frames[frames.length - 1];
    rings.unshift({ c: [f0.c[0] - f0.t[0] * f0.r, f0.c[1] - f0.t[1] * f0.r, f0.c[2] - f0.t[2] * f0.r], n: f0.n, b: f0.b, t: f0.t, r: 0, v: 0, nt: -1 });
    rings.push({ c: [f1.c[0] + f1.t[0] * f1.r, f1.c[1] + f1.t[1] * f1.r, f1.c[2] + f1.t[2] * f1.r], n: f1.n, b: f1.b, t: f1.t, r: 0, v: totalV, nt: 1 });
  }
  const base = out.pos.length / 3;
  for (const rg of rings) {
    for (let s = 0; s <= sides; s++) {
      const th = (s / sides) * Math.PI * 2;
      const cs = Math.cos(th), sn = Math.sin(th);
      const ox = rg.n[0] * cs * a[0] + rg.b[0] * sn * a[1];
      const oy = rg.n[1] * cs * a[0] + rg.b[1] * sn * a[1];
      const oz = rg.n[2] * cs * a[0] + rg.b[2] * sn * a[1];
      let X = rg.c[0] + ox * rg.r, Y = rg.c[1] + oy * rg.r, Z = rg.c[2] + oz * rg.r;
      // normal of the elliptic section + slope
      let nx = rg.n[0] * cs / a[0] + rg.b[0] * sn / a[1];
      let ny = rg.n[1] * cs / a[0] + rg.b[1] * sn / a[1];
      let nz = rg.n[2] * cs / a[0] + rg.b[2] * sn / a[1];
      let l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const tw = Math.abs(rg.nt) >= 1 ? 1 : rg.nt;
      if (Math.abs(rg.nt) >= 1) { nx = rg.t[0] * rg.nt; ny = rg.t[1] * rg.nt; nz = rg.t[2] * rg.nt; }
      else {
        const cw = Math.sqrt(Math.max(0, 1 - tw * tw));
        nx = nx * cw + rg.t[0] * tw; ny = ny * cw + rg.t[1] * tw; nz = nz * cw + rg.t[2] * tw;
      }
      l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      if (p.displace) {
        const d = p.displace(X, Y, Z, nx, ny, nz);
        X += nx * d; Y += ny * d; Z += nz * d;
      }
      out.pos.push(X, Y, Z);
      out.nrm.push(nx, ny, nz);
      let uu = s / sides;
      if (mirror) uu = 1 - uu;
      const vv = Math.max(0, Math.min(1, rg.v / totalV));
      out.uv.push(rect[0] + (rect[2] - rect[0]) * uu, rect[1] + (rect[3] - rect[1]) * vv);
    }
  }
  const stride = sides + 1;
  for (let j = 0; j < rings.length - 1; j++)
    for (let s = 0; s < sides; s++) {
      const i0 = base + j * stride + s, i1 = i0 + 1, i2 = i0 + stride, i3 = i2 + 1;
      // b = t x n: (i0->i1 = b) x (i0->i2 = t) = n (outward) -> CCW seen from outside
      out.idx.push(i0, i1, i2, i1, i3, i2);
    }
}

// ------------------------------------------------------------------------------- ellipsoid
function ellFaces(p: EllipsoidPrim): FaceInfo[] {
  const [rx, ry, rz] = p.radius;
  return [{ face: 'surf', w: Math.PI * (rx + rz), h: Math.PI * ry }];
}
function ellPoint(p: EllipsoidPrim, u: number, v: number, w: number, h: number, out: SurfPoint) {
  const th = (u / w) * Math.PI * 2, ph = (1 - v / h) * Math.PI;
  const [rx, ry, rz] = p.radius;
  const lx = Math.sin(ph) * Math.cos(th), ly = Math.cos(ph), lz = Math.sin(ph) * Math.sin(th);
  const R = eulerZYX(p.rot);
  const t = [0, 0, 0];
  apply3(R, lx * rx, ly * ry, lz * rz, t);
  out.x = p.center[0] + t[0]; out.y = p.center[1] + t[1]; out.z = p.center[2] + t[2];
  apply3(R, lx / rx, ly / ry, lz / rz, t);
  norm3(t);
  out.nx = t[0]; out.ny = t[1]; out.nz = t[2];
}
function ellMesh(p: EllipsoidPrim, rect: UVRect, mirror: boolean, out: MeshArrays) {
  const rings = p.rings ?? 10, sides = p.sides ?? 14;
  const [rx, ry, rz] = p.radius;
  const R = eulerZYX(p.rot);
  const t = [0, 0, 0];
  const base = out.pos.length / 3;
  for (let j = 0; j <= rings; j++) {
    const ph = (j / rings) * Math.PI;
    for (let s = 0; s <= sides; s++) {
      const th = (s / sides) * Math.PI * 2;
      const lx = Math.sin(ph) * Math.cos(th), ly = Math.cos(ph), lz = Math.sin(ph) * Math.sin(th);
      apply3(R, lx * rx, ly * ry, lz * rz, t);
      let X = p.center[0] + t[0], Y = p.center[1] + t[1], Z = p.center[2] + t[2];
      apply3(R, lx / rx, ly / ry, lz / rz, t);
      norm3(t);
      if (p.displace) {
        const d = p.displace(X, Y, Z, t[0], t[1], t[2]);
        X += t[0] * d; Y += t[1] * d; Z += t[2] * d;
      }
      out.pos.push(X, Y, Z);
      out.nrm.push(t[0], t[1], t[2]);
      let uu = s / sides;
      if (mirror) uu = 1 - uu;
      out.uv.push(rect[0] + (rect[2] - rect[0]) * uu, rect[1] + (rect[3] - rect[1]) * (1 - j / rings));
    }
  }
  const stride = sides + 1;
  for (let j = 0; j < rings; j++)
    for (let s = 0; s < sides; s++) {
      const i0 = base + j * stride + s, i1 = i0 + 1, i2 = i0 + stride, i3 = i2 + 1;
      out.idx.push(i0, i1, i2, i1, i3, i2);
    }
}

// ------------------------------------------------------------------------------- sheet
function sheetFaces(p: SheetPrim): FaceInfo[] {
  return [{ face: 'surf', w: p.size[0], h: p.size[1] }];
}
function sheetPoint(p: SheetPrim, u: number, v: number, w: number, h: number, out: SurfPoint) {
  const s = u / w, t = v / h;
  const a = p.at(s, t);
  const e = 1e-3;
  const as = p.at(Math.min(1, s + e), t), as0 = p.at(Math.max(0, s - e), t);
  const at = p.at(s, Math.min(1, t + e)), at0 = p.at(s, Math.max(0, t - e));
  const du = [as[0] - as0[0], as[1] - as0[1], as[2] - as0[2]], dv = [at[0] - at0[0], at[1] - at0[1], at[2] - at0[2]];
  const n = cross(du, dv);
  norm3(n);
  out.x = a[0]; out.y = a[1]; out.z = a[2];
  out.nx = n[0]; out.ny = n[1]; out.nz = n[2];
}
function sheetMesh(p: SheetPrim, rect: UVRect, mirror: boolean, out: MeshArrays) {
  const nu = p.nu ?? 8, nv = p.nv ?? 6;
  const th = p.thickness ?? 0;
  const sides = th > 0 ? [1, -1] : [1];
  const sp: SurfPoint = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
  for (const sd of sides) {
    const base = out.pos.length / 3;
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const s = i / nu, t = j / nv;
        sheetPoint(p, s * p.size[0], t * p.size[1], p.size[0], p.size[1], sp);
        let X = sp.x + sp.nx * th * 0.5 * sd, Y = sp.y + sp.ny * th * 0.5 * sd, Z = sp.z + sp.nz * th * 0.5 * sd;
        if (p.displace) {
          const d = p.displace(X, Y, Z, sp.nx, sp.ny, sp.nz);
          X += sp.nx * d; Y += sp.ny * d; Z += sp.nz * d;
        }
        out.pos.push(X, Y, Z);
        out.nrm.push(sp.nx * sd, sp.ny * sd, sp.nz * sd);
        let uu = s;
        if (mirror) uu = 1 - uu;
        out.uv.push(rect[0] + (rect[2] - rect[0]) * uu, rect[1] + (rect[3] - rect[1]) * t);
      }
    const stride = nu + 1;
    const flip = sd < 0;
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const i0 = base + j * stride + i, i1 = i0 + 1, i2 = i0 + stride, i3 = i2 + 1;
        if (flip) out.idx.push(i0, i2, i1, i1, i2, i3);
        else out.idx.push(i0, i1, i2, i1, i3, i2);
      }
  }
}

// ------------------------------------------------------------------------------- dispatch
export function primFaces(p: PrimDef): FaceInfo[] {
  switch (p.kind) {
    case 'box': return boxFaces(p);
    case 'tube': return tubeFaces(p);
    case 'ellipsoid': return ellFaces(p);
    case 'sheet': return sheetFaces(p);
  }
}

export function primPoint(p: PrimDef, face: FaceName, u: number, v: number, w: number, h: number, out: SurfPoint): void {
  switch (p.kind) {
    case 'box': return boxPoint(p, face, u, v, out);
    case 'tube': return tubePoint(p, u, v, w, h, out);
    case 'ellipsoid': return ellPoint(p, u, v, w, h, out);
    case 'sheet': return sheetPoint(p, u, v, w, h, out);
  }
}

/** Append the primitive's triangles to `out`. `rects` maps faces to atlas UV rects. */
export function primMesh(p: PrimDef, rects: Partial<Record<FaceName, UVRect>>, mirror: boolean, out: MeshArrays): void {
  const full: UVRect = [0, 0, 1, 1];
  switch (p.kind) {
    case 'box': return boxMesh(p, rects, mirror, out);
    case 'tube': return tubeMesh(p, rects.surf ?? full, mirror, out);
    case 'ellipsoid': return ellMesh(p, rects.surf ?? full, mirror, out);
    case 'sheet': return sheetMesh(p, rects.surf ?? full, mirror, out);
  }
}

/** Axis-aligned rest-space bounds of a primitive (approximate for curved prims). */
export function primBounds(p: PrimDef): [V3, V3] {
  const mn: V3 = [Infinity, Infinity, Infinity], mx: V3 = [-Infinity, -Infinity, -Infinity];
  const add = (x: number, y: number, z: number) => {
    mn[0] = Math.min(mn[0], x); mn[1] = Math.min(mn[1], y); mn[2] = Math.min(mn[2], z);
    mx[0] = Math.max(mx[0], x); mx[1] = Math.max(mx[1], y); mx[2] = Math.max(mx[2], z);
  };
  const arr: MeshArrays = { pos: [], nrm: [], uv: [], idx: [] };
  const rects: Partial<Record<FaceName, UVRect>> = {};
  for (const f of primFaces(p)) rects[f.face] = [0, 0, 1, 1];
  primMesh({ ...p, displace: undefined } as PrimDef, rects, false, arr);
  for (let i = 0; i < arr.pos.length; i += 3) add(arr.pos[i], arr.pos[i + 1], arr.pos[i + 2]);
  return [mn, mx];
}

export { dot as _dot };
