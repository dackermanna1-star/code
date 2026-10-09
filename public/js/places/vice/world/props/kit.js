// Shared helpers for the props: the materials (photo-texture "surface" shader
// from surface.js, with polygon offsets for things lying on the ground and an
// instanced variant whose per-instance colour only paints the parts marked
// for it), colours, solid shapes written into Geo buffers, a spatial index
// of the roads (so nothing is put down in the traffic), and NearSet: small
// repeated things (benches, hydrants, umbrellas...) drawn as one instanced
// mesh per kind, holding only the ones near the camera.
//
//   const M = propMaterials(tex, glow)      -> {surf, flat, paint, inst, glass}
//   tint(0xrrggbb) -> [r, g, b] linear      shade(t, k) -> darker / lighter
//   cyl(g, x, y, z, r, h, seg, o)  cylAB(g, a, b, r0, r1, seg, o)  ball(g, x, y, z, r, o)  slab(g, pts, y0, y1, o)
//   const R = new RoadIndex(plan); R.near(x, z, pad) -> true if (x, z) is on a road or its sidewalk (+pad)
//   const N = new NearSet(scene); const t = N.type(geo, mat, {R, shadow}); N.add(t, x, y, z, heading, s, color); N.build(); N.update(cam)
import * as THREE from 'three';
import { surfaceMaterial, Geo } from '../surface.js';
import { TEX_LAYER } from '../textures.js';

export const L = TEX_LAYER;
export const GROUND = 3;
export const TAU = Math.PI * 2;

// ---- colours -------------------------------------------------------------------
const _c = new THREE.Color();
/** An sRGB hex colour as a linear tint [r, g, b] (multiplies the photo texture). */
export function tint(hex, k = 1) { _c.setHex(hex); return [_c.r * k, _c.g * k, _c.b * k]; }
export function shade(t, k) { return [t[0] * k, t[1] * k, t[2] * k]; }
export function mix(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
/** Mark every vertex as instance-paintable (info.x = 1) for Geo.quad/box. */
export const PAINT = [[1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0]];

// ---- materials -------------------------------------------------------------------
/**
 * surf: plain static props. flat / paint: things lying on the ground (paths, runways, their
 * markings) pulled towards the camera so they never fight with the ground or each other.
 * inst: for InstancedMeshes - instanceColor only tints vertices whose info.x is 1.
 */
export function propMaterials(tex, glow) {
  const surf = surfaceMaterial(tex, { glowUniform: glow, key: 'props' });
  const flat = surfaceMaterial(tex, { glowUniform: glow, key: 'props', params: { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3 } });
  const paint = surfaceMaterial(tex, { glowUniform: glow, key: 'props', params: { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 } });
  const inst = surfaceMaterial(tex, { glowUniform: glow, key: 'propsI' });
  const base = inst.onBeforeCompile;
  inst.onBeforeCompile = (sh, r) => {
    base(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `
#if defined( USE_INSTANCING_COLOR )
  vColor = mix(vec3(1.0), instanceColor.rgb, info.x);
#endif`);
  };
  inst.customProgramCacheKey = () => 'vc-surf-propsI';
  // windows that light up at night in a warm colour, each pane a little different (lay.z = how many are lit)
  const win = surfaceMaterial(tex, { glowUniform: glow, key: 'propsWin', fragEmit: `{
    vec2 cell = floor(vec2(vWp.x + vWp.z, vWp.y) / vec2(3.6, 4.5));
    float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    float on = step(1.0 - vLay.z * 0.8, h * 0.999);
    totalEmissiveRadiance += mix(vec3(1.0, 0.7, 0.4), vec3(0.7, 0.82, 1.0), step(0.8, fract(h * 7.31))) * on * glow * (0.35 + 0.65 * h);
  }` });
  // chain-link fences: a wire mesh drawn in code, cut out
  const fence = new THREE.MeshStandardMaterial({ map: fenceTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4, color: 0xb8bcc0 });
  return { surf, flat, paint, inst, win, fence };
}
function fenceTex() {
  return canvasTex(64, 64, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.strokeStyle = '#d8dadc'; x.lineWidth = 2.2;
    for (const k of [-1, 0, 1]) {
      x.beginPath(); x.moveTo(k * w, 0); x.lineTo(k * w + w, h); x.stroke();
      x.beginPath(); x.moveTo(k * w + w, 0); x.lineTo(k * w, h); x.stroke();
    }
  }, { repeat: true });
}

// ---- shapes written into a surface.js Geo ------------------------------------------
/** A vertical cylinder (sides, optional top cap) standing on y. */
export function cyl(g, x, y, z, r, h, seg = 8, o = {}) {
  const top = y + h, s = o.scale || 8;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const p0 = [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r];
    const q1 = [p1[0], top, p1[2]], q0 = [p0[0], top, p0[2]];
    const am = (a0 + a1) / 2;
    g.quad(p1, p0, q0, q1, { ...o, normal: [Math.cos(am), 0, Math.sin(am)], uvs: [[(i + 1) / seg * r * TAU / s, y / s], [i / seg * r * TAU / s, y / s], [i / seg * r * TAU / s, top / s], [(i + 1) / seg * r * TAU / s, top / s]] });
  }
  if (o.cap !== false) {
    const pts = [];
    for (let i = 0; i < seg; i++) { const a = (i / seg) * TAU; pts.push([x + Math.cos(a) * r, top, z + Math.sin(a) * r]); }
    g.fan(pts, { ...o, tint: o.capTint || o.tint });
  }
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _up = new THREE.Vector3();
/** A tapered tube from a to b ([x, y, z]), radii r0 -> r1 (no caps). */
export function cylAB(g, a, b, r0, r1, seg = 6, o = {}) {
  _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]); _d.subVectors(_b, _a);
  const len = _d.length(); if (len < 1e-4) return; _d.divideScalar(len);
  _up.set(0, 1, 0); if (Math.abs(_d.y) > 0.95) _up.set(1, 0, 0);
  _t1.crossVectors(_d, _up).normalize(); _t2.crossVectors(_d, _t1).normalize();
  const s = o.scale || 8;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const P = (c, r, an) => [c.x + (_t1.x * Math.cos(an) + _t2.x * Math.sin(an)) * r, c.y + (_t1.y * Math.cos(an) + _t2.y * Math.sin(an)) * r, c.z + (_t1.z * Math.cos(an) + _t2.z * Math.sin(an)) * r];
    const am = (a0 + a1) / 2;
    const n = [_t1.x * Math.cos(am) + _t2.x * Math.sin(am), _t1.y * Math.cos(am) + _t2.y * Math.sin(am), _t1.z * Math.cos(am) + _t2.z * Math.sin(am)];
    const u0 = (i / seg) * r0 * TAU / s, u1 = ((i + 1) / seg) * r0 * TAU / s;
    g.quad(P(_a, r0, a0), P(_a, r0, a1), P(_b, r1, a1), P(_b, r1, a0), { ...o, normal: n, uvs: [[u0, 0], [u1, 0], [u1, len / s], [u0, len / s]] });
  }
}
/** A low-poly ball (an octahedron split once: 32 faces). */
export function ball(g, x, y, z, r, o = {}, sy = 1) {
  const V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const F = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
  const n = (p) => { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; };
  const m = (p, q) => n([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]);
  const W = (p) => [x + p[0] * r, y + p[1] * r * sy, z + p[2] * r];
  for (const [i, j, k] of F) {
    const A = V[i], B = V[j], C = V[k], ab = m(A, B), bc = m(B, C), ca = m(C, A);
    for (const [p, q, s] of [[A, ab, ca], [ab, B, bc], [ca, bc, C], [ab, bc, ca]]) tri(g, W(p), W(q), W(s), o, [p, q, s]);
  }
}
/** One triangle (counter-clockwise from the front), optional per-vertex normals. */
export function tri(g, a, b, c, o = {}, nrm = null) {
  const t = o.tint || [1, 1, 1], Ly = o.lay ?? 0, R = o.rough ?? 0.85, G = o.glow || 0, s = 1 / (o.scale || 8);
  let fn = null;
  if (!nrm) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
    fn = [nx / l, ny / l, nz / l];
  }
  const base = g.count;
  [a, b, c].forEach((p, i) => {
    const N = nrm ? nrm[i] : fn;
    const u = Math.abs(N[1]) > 0.7 ? p[0] * s : (Math.abs(N[0]) > Math.abs(N[2]) ? p[2] * s : p[0] * s), v = Math.abs(N[1]) > 0.7 ? p[2] * s : p[1] * s;
    g.vert(p[0], p[1], p[2], N[0], N[1], N[2], u, v, Ly, R, G, t[0], t[1], t[2], o.info ? o.info[0] : null);
  });
  g.idx.push(base, base + 1, base + 2);
}
/** A vertical prism: the polygon pts [[x, z]] (convex, in increasing atan2(z, x) order = clockwise on the map) from y0 to y1, with a top. */
export function slab(g, pts, y0, y1, o = {}) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    g.quad([q[0], y0, q[1]], [p[0], y0, p[1]], [p[0], y1, p[1]], [q[0], y1, q[1]], { ...o, tint: o.sideTint || o.tint });
  }
  if (o.top !== false) g.fan(pts.map((p) => [p[0], y1, p[1]]), { ...o, tint: o.topTint || o.tint, lay: o.topLay ?? o.lay });
}
/** A flat quad lying on the ground along a->b (centre line), half width hw, at heights from fy(x, z). */
export function strip(g, ax, az, bx, bz, hw, fy, o = {}, step = 12) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz); if (len < 0.01) return;
  const rx = -dz / len * hw, rz = dx / len * hw, n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const x0 = ax + dx * t0, z0 = az + dz * t0, x1 = ax + dx * t1, z1 = az + dz * t1;
    const P = (x, z) => [x, fy(x, z), z];
    g.quad(P(x0 + rx, z0 + rz), P(x1 + rx, z1 + rz), P(x1 - rx, z1 - rz), P(x0 - rx, z0 - rz), { normal: [0, 1, 0], ...o });
  }
}
/** Flip the last quad written to g if it faces down (for quads whose winding isn't known). */
export function faceUp(g) {
  const n = g.idx.length, i0 = g.idx[n - 6], i1 = g.idx[n - 5], i2 = g.idx[n - 4], P = g.pos;
  const ax = P[i1 * 3] - P[i0 * 3], az = P[i1 * 3 + 2] - P[i0 * 3 + 2], bx = P[i2 * 3] - P[i0 * 3], bz = P[i2 * 3 + 2] - P[i0 * 3 + 2];
  if (az * bx - ax * bz >= 0) return;
  for (let k = n - 6; k < n; k += 3) { const t = g.idx[k + 1]; g.idx[k + 1] = g.idx[k + 2]; g.idx[k + 2] = t; }
  // and its normals (unless they were given pointing up)
  const v0 = g.count - 4;
  if (g.nor[v0 * 3 + 1] < 0) for (let k = v0 * 3; k < g.count * 3; k++) g.nor[k] = -g.nor[k];
}

// ---- deterministic randomness ----------------------------------------------------------
export function rnd(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hash(x, z, s = 0) {
  let h = Math.imul((x | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((z | 0) + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(s + 1, 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// ---- polylines -------------------------------------------------------------------------
/** Resample a polyline [[x, z]] every `step` studs: [{x, z, tx, tz, d}]. */
export function resample(pts, step, closed = false) {
  const P = closed ? [...pts, pts[0]] : pts, out = [];
  let total = 0; const segs = [];
  for (let i = 0; i < P.length - 1; i++) { const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); segs.push(L); total += L; }
  const n = Math.max(1, Math.round(total / step));
  let si = 0, acc = 0;
  for (let k = 0; k <= n; k++) {
    const d = (k / n) * total;
    while (si < segs.length - 1 && acc + segs[si] < d) { acc += segs[si]; si++; }
    const L = segs[si] || 1, t = Math.min(1, Math.max(0, (d - acc) / L));
    const a = P[si], b = P[si + 1];
    out.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / L, tz: (b[1] - a[1]) / L, d });
  }
  return out;
}
/** Catmull-Rom through [[x, z]] (open), every `step` studs. */
export function spline(pts, step = 8) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ---- the roads, for "is anything in the way" -----------------------------------------
const RC = 64;
export class RoadIndex {
  constructor(plan) {
    this.grid = new Map();
    for (const e of plan.edges) {
      if (e.elevated) continue;
      const hw = e.width / 2 + (e.walk || 0);
      for (let i = 0; i < e.pts.length - 1; i++) {
        const a = e.pts[i], b = e.pts[i + 1];
        const s = { ax: a.x, az: a.z, bx: b.x, bz: b.z, hw, e, y: Math.max(a.y, b.y) };
        const x0 = Math.min(a.x, b.x) - hw - 40, x1 = Math.max(a.x, b.x) + hw + 40, z0 = Math.min(a.z, b.z) - hw - 40, z1 = Math.max(a.z, b.z) + hw + 40;
        for (let gx = Math.floor(x0 / RC); gx <= Math.floor(x1 / RC); gx++) for (let gz = Math.floor(z0 / RC); gz <= Math.floor(z1 / RC); gz++) {
          const k = gx * 8192 + gz; let c = this.grid.get(k); if (!c) this.grid.set(k, (c = [])); c.push(s);
        }
      }
    }
  }
  /** The nearest road segment's clearance: distance from (x, z) to the edge of its sidewalk (negative inside). */
  clear(x, z, low = false) {
    const c = this.grid.get(Math.floor(x / RC) * 8192 + Math.floor(z / RC));
    let best = 40;
    if (!c) return best;
    for (const s of c) {
      if (low && s.y > GROUND + 6) continue; // bridges high overhead don't count
      const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz;
      let t = L2 > 0 ? ((x - s.ax) * dx + (z - s.az) * dz) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) - s.hw;
      if (d < best) best = d;
    }
    return best;
  }
  near(x, z, pad = 0, low = false) { return this.clear(x, z, low) < pad; }
}

// ---- NearSet: one InstancedMesh per kind, filled with the ones near the camera ---------
const NC = 128;
export class NearSet {
  constructor(scene) { this.scene = scene; this.types = []; this.items = []; this.cells = new Map(); this.at = new THREE.Vector3(1e9, 0, 0); this.dirty = true; }
  /** A kind of thing: geometry, material, R = draw distance, shadow, phys box half sizes [hx, hy, hz] (local). */
  type(geo, mat, o = {}) { this.types.push({ geo, mat, R: o.R || 380, shadow: o.shadow ?? true, n: 0, mesh: null, name: o.name || '' }); return this.types.length - 1; }
  add(t, x, y, z, heading = 0, s = 1, color = null) {
    const it = { t, x, y, z, h: heading, s, c: color, i: this.items.length, dead: false };
    this.items.push(it); this.types[t].n++;
    return it;
  }
  build() {
    const n = this.items.length;
    this.mat = new Float32Array(n * 16); this.col = new Float32Array(n * 3);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    for (const it of this.items) {
      q.setFromAxisAngle(Y, it.h); p.set(it.x, it.y, it.z); sc.setScalar(it.s);
      m.compose(p, q, sc); m.toArray(this.mat, it.i * 16);
      const c = it.c || [1, 1, 1]; this.col[it.i * 3] = c[0]; this.col[it.i * 3 + 1] = c[1]; this.col[it.i * 3 + 2] = c[2];
      const k = Math.floor(it.x / NC) * 8192 + Math.floor(it.z / NC);
      let cell = this.cells.get(k); if (!cell) this.cells.set(k, (cell = [])); cell.push(it);
    }
    this.maxR = 0;
    for (const T of this.types) {
      this.maxR = Math.max(this.maxR, T.R);
      const cap = Math.max(1, Math.min(T.n, 6000));
      const mesh = new THREE.InstancedMesh(T.geo, T.mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.castShadow = T.shadow; mesh.receiveShadow = true; mesh.count = 0; mesh.visible = false;
      mesh.name = 'near:' + T.name;
      T.mesh = mesh; T.cap = cap;
      this.scene.add(mesh);
    }
  }
  /** Refill the instance lists when the camera has moved a bit (or something changed). */
  update(cam) {
    if (!this.dirty && this.at.distanceToSquared(cam) < 100) return;
    this.dirty = false; this.at.copy(cam);
    for (const T of this.types) T.k = 0;
    const R = this.maxR, ci = Math.floor(cam.x / NC), cj = Math.floor(cam.z / NC), cr = Math.ceil(R / NC);
    for (let i = ci - cr; i <= ci + cr; i++) for (let j = cj - cr; j <= cj + cr; j++) {
      const cell = this.cells.get(i * 8192 + j); if (!cell) continue;
      for (const it of cell) {
        if (it.dead) continue;
        const T = this.types[it.t], dx = it.x - cam.x, dz = it.z - cam.z;
        if (dx * dx + dz * dz > T.R * T.R || T.k >= T.cap) continue;
        T.mesh.instanceMatrix.array.set(this.mat.subarray(it.i * 16, it.i * 16 + 16), T.k * 16);
        T.mesh.instanceColor.array.set(this.col.subarray(it.i * 3, it.i * 3 + 3), T.k * 3);
        T.k++;
      }
    }
    for (const T of this.types) {
      T.mesh.count = T.k; T.mesh.visible = T.k > 0;
      if (T.k) { T.mesh.instanceMatrix.needsUpdate = true; T.mesh.instanceColor.needsUpdate = true; }
    }
  }
  /** How many are drawn now (for stats). */
  get drawn() { let n = 0; for (const T of this.types) n += T.k || 0; return n; }
}

// ---- canvas textures -------------------------------------------------------------
export function canvasTex(w, h, draw, o = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  draw(x, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = o.aniso || 4;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/**
 * A polyline [[x, z]] moved sideways by d (+ = to the right of travel, i.e. (-tz, tx)),
 * with mitred corners (limited). For a land polygon in map order, + is inland.
 */
export function offsetLine(pts, d, closed = false) {
  const n = pts.length, out = [];
  const nrm = (i) => { const a = pts[i], b = pts[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };
  for (let i = 0; i < n; i++) {
    const hasPrev = closed || i > 0, hasNext = closed || i < n - 1;
    const n0 = hasPrev ? nrm((i - 1 + n) % n) : nrm(i), n1 = hasNext ? nrm(i) : nrm((i - 1 + n) % n);
    let mx = n0[0] + n1[0], mz = n0[1] + n1[1]; const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) { mx = n1[0]; mz = n1[1]; } else { mx /= ml; mz /= ml; }
    const k = Math.min(3, 1 / Math.max(0.2, mx * n1[0] + mz * n1[1]));
    out.push([pts[i][0] + mx * d * k, pts[i][1] + mz * d * k]);
  }
  if (closed) out.push(out[0]);
  return out;
}

/** Merge geometries with position, normal and color (and optional extra attrs) into one, each by its matrix. */
export function mergeColored(list, extra = null) {
  let nv = 0, ni = 0;
  for (const { geo } of list) { nv += geo.attributes.position.count; ni += geo.index ? geo.index.count : geo.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  const ex = extra ? new Float32Array(nv * 4) : null;
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let vo = 0, io = 0;
  for (const { geo, m, tintC, x4 } of list) {
    const P = geo.attributes.position, N = geo.attributes.normal, C = geo.attributes.color, c = P.count;
    nm.getNormalMatrix(m);
    for (let i = 0; i < c; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m); pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
      const t = tintC || [1, 1, 1];
      if (C) { col[(vo + i) * 3] = C.getX(i) * t[0]; col[(vo + i) * 3 + 1] = C.getY(i) * t[1]; col[(vo + i) * 3 + 2] = C.getZ(i) * t[2]; } else { col[(vo + i) * 3] = t[0]; col[(vo + i) * 3 + 1] = t[1]; col[(vo + i) * 3 + 2] = t[2]; }
      if (ex) ex.set(x4 || [0, 0, 0, 0], (vo + i) * 4);
    }
    if (geo.index) { const I = geo.index.array; for (let k = 0; k < I.length; k++) idx[io + k] = I[k] + vo; io += I.length; }
    else { for (let k = 0; k < c; k++) idx[io + k] = vo + k; io += c; }
    vo += c;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (ex) g.setAttribute('bob', new THREE.BufferAttribute(ex, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// ---- a faster Geo: the same interface as surface.js's, with typed arrays inside ----------
export class FastGeo extends Geo {
  constructor() { super(); this.n = 0; this.cap = 0; this._grow(1024); }
  _grow(cap) {
    const g = (A, k) => { const b = new Float32Array(cap * k); if (A) b.set(A.subarray(0, this.n * k)); return b; };
    this.pos = g(this.cap ? this.pos : null, 3); this.nor = g(this.cap ? this.nor : null, 3); this.uv = g(this.cap ? this.uv : null, 2);
    this.lay = g(this.cap ? this.lay : null, 4); this.tint = g(this.cap ? this.tint : null, 3); this.info = g(this.cap ? this.info : null, 4);
    this.cap = cap;
  }
  get count() { return this.n; }
  vert(x, y, z, nx, ny, nz, u, v, Ly, rough, glow, r, g, b, info) {
    if (this.n >= this.cap) this._grow(this.cap * 3);
    const i = this.n, P = this.pos, N = this.nor;
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; N[i * 3] = nx; N[i * 3 + 1] = ny; N[i * 3 + 2] = nz;
    this.uv[i * 2] = u; this.uv[i * 2 + 1] = v;
    const Lq = this.lay; Lq[i * 4] = Ly; Lq[i * 4 + 1] = rough; Lq[i * 4 + 2] = glow;
    const T = this.tint; T[i * 3] = r; T[i * 3 + 1] = g; T[i * 3 + 2] = b;
    if (info) { const I = this.info; I[i * 4] = info[0]; I[i * 4 + 1] = info[1]; I[i * 4 + 2] = info[2]; I[i * 4 + 3] = info[3]; }
    return this.n++;
  }
  geometry() {
    const n = this.n, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, n * 2), 2));
    g.setAttribute('lay', new THREE.BufferAttribute(this.lay.slice(0, n * 4), 4));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint.slice(0, n * 3), 3));
    g.setAttribute('info', new THREE.BufferAttribute(this.info.slice(0, n * 4), 4));
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
/** surface.js's Chunks, with FastGeo buffers. */
export class FastChunks {
  constructor(size = 512) { this.size = size; this.map = new Map(); }
  get(mat, x, z) {
    const i = Math.floor(x / this.size), j = Math.floor(z / this.size), k = `${mat}|${i}|${j}`;
    let g = this.map.get(k);
    if (!g) { g = new FastGeo(); g.mat = mat; this.map.set(k, g); }
    return g;
  }
  meshes(materials, o = {}) {
    const out = [];
    for (const g of this.map.values()) {
      if (!g.count || !materials[g.mat]) continue;
      const m = new THREE.Mesh(g.geometry(), materials[g.mat]);
      m.receiveShadow = true; m.castShadow = !!o.shadow?.has(g.mat);
      m.matrixAutoUpdate = false; m.updateMatrix();
      m.userData.mat = g.mat;
      for (const a of Object.values(m.geometry.attributes)) a.onUpload(freeArray);
      m.geometry.index.onUpload(freeArray);
      out.push(m);
    }
    this.map.clear();
    return out;
  }
}
function freeArray() { this.array = null; }
