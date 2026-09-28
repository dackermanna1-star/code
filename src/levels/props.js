// Static prop library. Props are merged into level geometry batches (cheap)
// and register approximate collision boxes. Coordinates: (x, y, z) is the
// floor point under the prop's centre; ry rotates around Y (0 = default).
// Most props are built so their "front" faces -Z before rotation.
//
// Detail: props are assembled from boxes, rounded boxes, cylinders, tubes,
// tori and extruded profiles (car bodies), all merged per material/sector, so
// a detailed prop costs vertices, not draw calls. `emissiveTint` is a
// vertex-coloured unlit HDR material (tint = light colour & brightness) for
// lamps, indicator LEDs, screens and vehicle lights. `lightCone` adds a soft
// volumetric beam (merged per level, medium/high quality only).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { trs, unitBox, unitCyl, unitSphere, unitCone } from '../world/geom.js';
import { F_DEFAULT, F_SOLID, F_SHOOT, F_SIGHT } from '../world/collision.js';
import { materials } from '../render/materials.js';
import { buildConeBatch } from '../render/lights.js';
import { makeRng } from '../core/math.js';

const rnd = makeRng(1234); // layout-affecting randomness (kept stable: pallet stacks etc.)
const drnd = makeRng(4321); // purely visual detail randomness
const Q = new THREE.Quaternion(), V = new THREE.Vector3(), V2 = new THREE.Vector3(), S = new THREE.Vector3(), M4 = new THREE.Matrix4(), UPY = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------ custom materials --
// Registered into the shared material cache so merged buckets can use them.
function ensureMaterials() {
  if (materials.cache.has('emissiveTint')) return;
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.6, 2.6), vertexColors: true });
  glow.name = 'emissiveTint';
  materials.cache.set('emissiveTint', glow);
  // chain-link fence mesh: analytic woven diamond wire (2 m per tile, ~6 cm
  // diamonds). Colour+alpha, normal and roughness maps are generated per pixel.
  // Rendered alpha-blended (depthWrite off) instead of alpha-tested: with
  // mipmapping an alpha-tested fine mesh turns into an opaque grey slab at
  // distance; blended, the far mips fade to a see-through haze like real wire.
  const link = new THREE.MeshStandardMaterial({ color: 0xa4a6a2, metalness: 0.85, roughness: 1, vertexColors: true, transparent: true, depthWrite: false, alphaTest: 0.02 });
  // FrontSide on purpose: the mesh is a thin box, so each side of the fence
  // shows exactly one correctly-lit wire layer (DoubleSide would stack 2-4).
  link.side = THREE.FrontSide;
  const maps = chainLinkMaps();
  Object.assign(link, maps);
  link.normalScale.set(1.2, 1.2);
  link.name = 'chainLink';
  materials.cache.set('chainLink', link);
}
function chainLinkMaps() {
  const N = 1024, s = 32, r = 1.75; // texels per tile, diamond period, wire radius (texels)
  const col = new Uint8Array(N * N * 4), nrm = new Uint8Array(N * N * 4), rgh = new Uint8Array(N * N * 4);
  const R2 = Math.SQRT1_2;
  // low-frequency rust/zinc variation
  const lf = new Float32Array(64 * 64);
  for (let i = 0; i < lf.length; i++) lf[i] = drnd();
  const lfAt = (x, y) => {
    const fx = (x / N) * 64, fy = (y / N) * 64, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const a = (i, j) => lf[((j & 63) << 6) | (i & 63)];
    return (a(ix, iy) * (1 - tx) + a(ix + 1, iy) * tx) * (1 - ty) + (a(ix, iy + 1) * (1 - tx) + a(ix + 1, iy + 1) * tx) * ty;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // signed distance to the nearest wire of each diagonal family
    let a = (((x - y) % s) + s) % s; if (a > s / 2) a -= s;
    let b = (x + y) % s; if (b > s / 2) b -= s;
    const dA = a * R2, dB = b * R2;
    // weave: which family is on top alternates per crossing
    const cA = Math.floor((x - y + s * 64 + s / 2) / s), cB = Math.floor((x + y + s / 2) / s);
    const topA = ((cA + cB) & 1) === 0;
    let d, nx, ny, lift;
    if (Math.abs(dA) < Math.abs(dB) || (Math.abs(dA) < r && topA && Math.abs(dB) < r)) { d = dA; nx = R2; ny = -R2; lift = topA ? 1 : 0.6; }
    else { d = dB; nx = R2; ny = R2; lift = topA ? 0.6 : 1; }
    const ad = Math.abs(d), i = (y * N + x) * 4;
    const alpha = Math.max(0, Math.min(1, r + 0.6 - ad));
    const t = Math.min(1, ad / r), h = Math.sqrt(Math.max(0, 1 - t * t));
    const px = Math.sign(d) * t;
    // normal (tangent space): wire cross-section curvature across the wire
    let vx = px * nx, vy = px * ny, vz = Math.max(0.15, h);
    const L = Math.hypot(vx, vy, vz); vx /= L; vy /= L; vz /= L;
    nrm[i] = (vx * 0.5 + 0.5) * 255; nrm[i + 1] = (-vy * 0.5 + 0.5) * 255; nrm[i + 2] = (vz * 0.5 + 0.5) * 255; nrm[i + 3] = 255;
    const n = lfAt(x, y), rust = Math.max(0, n - 0.62) * 2.6 * (0.6 + 0.4 * drnd());
    const shade = (0.62 + 0.38 * h * lift) * (0.9 + 0.2 * drnd());
    col[i] = Math.min(255, (205 * (1 - rust) + 150 * rust) * shade);
    col[i + 1] = Math.min(255, (208 * (1 - rust) + 92 * rust) * shade);
    col[i + 2] = Math.min(255, (204 * (1 - rust) + 55 * rust) * shade);
    col[i + 3] = alpha * 255;
    rgh[i] = rgh[i + 2] = 0; rgh[i + 1] = Math.min(255, (0.38 + 0.25 * n + rust * 0.4) * 255); rgh[i + 3] = 255;
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { map: mk(col, true), normalMap: mk(nrm, false), roughnessMap: mk(rgh, false) };
}

const UNTEXTURED = new Set(['glass', 'glassDirty', 'emissiveWarm', 'emissiveCool', 'emissiveRed', 'emissiveGreen', 'emissiveWindow', 'emissiveTint', 'plastic', 'plasticGloss', 'chrome', 'carPaint', 'blackMatte', 'paper', 'waterSurface', 'foliage', 'chainLink']);
const meshOpts = (mat, tint) => (UNTEXTURED.has(mat) ? { tint, uvScale: 1 } : { tint, worldUV: materials.scaleOf(mat) });

// cached geometries
const GEO = new Map();
const cached = (key, make) => { let g = GEO.get(key); if (!g) { g = make(); GEO.set(key, g); } return g; };
const q2 = (v) => Math.round(v * 100) / 100;
function rboxGeo(sx, sy, sz, r, seg = 1) {
  r = Math.min(r, sx / 2 - 0.001, sy / 2 - 0.001, sz / 2 - 0.001);
  return cached(`rb${q2(sx)},${q2(sy)},${q2(sz)},${q2(r)},${seg}`, () => {
    // indexed + no UVs (props use world-space UVs): far fewer vertices
    const g = new RoundedBoxGeometry(sx, sy, sz, seg, Math.max(0.002, r));
    g.deleteAttribute('uv');
    return mergeVertices(g, 1e-4);
  });
}
function torusGeo(R, r, rs = 6, ts = 16, arc = Math.PI * 2) {
  return cached(`to${q2(R)},${q2(r)},${rs},${ts},${q2(arc)}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc));
}
function frustumGeo(r0, r1, seg = 12, open = false) {
  return cached(`fr${q2(r0)},${q2(r1)},${seg},${open}`, () => new THREE.CylinderGeometry(r0, r1, 1, seg, 1, open));
}
function halfCylGeo(seg = 10) {
  return cached(`hc${seg}`, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1, false, 0, Math.PI));
}

// Local-space part helper bound to a prop transform.
class P {
  constructor(L, x, y, z, ry = 0) {
    ensureMaterials();
    this.L = L;
    this.base = trs(x, y, z, 0, ry, 0);
    this.x = x; this.y = y; this.z = z; this.ry = ry;
  }
  _m(cx, cy, cz, rot, sx, sy, sz) {
    return trs(cx, cy, cz, rot?.[0] || 0, rot?.[1] || 0, rot?.[2] || 0, sx, sy, sz).premultiply(this.base);
  }
  // box centred at local (cx, cy, cz) with size (sx, sy, sz)
  box(cx, cy, cz, sx, sy, sz, mat, tint, rot) {
    this.L.mesh(unitBox(), mat, this._m(cx, cy, cz, rot, sx, sy, sz), { tint, worldUV: materials.scaleOf(mat) });
    return this;
  }
  cyl(cx, cy, cz, r, h, mat, tint, rot, seg = 12) {
    this.L.mesh(unitCyl(seg), mat, this._m(cx, cy, cz, rot, r * 2, h, r * 2), r > 0.25 ? meshOpts(mat, tint) : { tint, uvScale: 1 });
    return this;
  }
  cylX(cx, cy, cz, r, len, mat, tint, seg = 12) { return this.cyl(cx, cy, cz, r, len, mat, tint, [0, 0, Math.PI / 2], seg); }
  cylZ(cx, cy, cz, r, len, mat, tint, seg = 12) { return this.cyl(cx, cy, cz, r, len, mat, tint, [Math.PI / 2, 0, 0], seg); }
  // truncated cone (r0 top radius, r1 bottom radius)
  frustum(cx, cy, cz, r0, r1, h, mat, tint, rot, seg = 12) {
    this.L.mesh(frustumGeo(r0, r1, seg), mat, this._m(cx, cy, cz, rot, 1, h, 1), { tint, uvScale: 1 });
    return this;
  }
  cone(cx, cy, cz, r, h, mat, tint, rot, seg = 12) {
    this.L.mesh(unitCone(seg), mat, this._m(cx, cy, cz, rot, r * 2, h, r * 2), { tint, uvScale: 1 });
    return this;
  }
  sph(cx, cy, cz, r, mat, tint, sc = [1, 1, 1], seg = 10) {
    this.L.mesh(unitSphere(seg), mat, this._m(cx, cy, cz, null, r * 2 * sc[0], r * 2 * sc[1], r * 2 * sc[2]), { tint, uvScale: 1 });
    return this;
  }
  geo(g, mat, cx, cy, cz, rot = [0, 0, 0], sc = [1, 1, 1], tint) {
    this.L.mesh(g, mat, this._m(cx, cy, cz, rot, sc[0], sc[1], sc[2]), meshOpts(mat, tint));
    return this;
  }
  // rounded box (true radius, cached geometry per size)
  rbox(cx, cy, cz, sx, sy, sz, r, mat, tint, rot, seg = 1) {
    this.L.mesh(rboxGeo(sx, sy, sz, r, seg), mat, this._m(cx, cy, cz, rot, 1, 1, 1), meshOpts(mat, tint));
    return this;
  }
  torus(cx, cy, cz, R, r, mat, tint, rot, rs = 6, ts = 16, arc) {
    this.L.mesh(torusGeo(R, r, rs, ts, arc), mat, this._m(cx, cy, cz, rot, 1, 1, 1), { tint, uvScale: 1 });
    return this;
  }
  // cylinder between two local points
  tube(x0, y0, z0, x1, y1, z1, r, mat, tint, seg = 8) {
    V.set(x1 - x0, y1 - y0, z1 - z0);
    const len = V.length();
    if (len < 1e-4) return this;
    Q.setFromUnitVectors(UPY, V.multiplyScalar(1 / len));
    M4.compose(V2.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Q, S.set(r * 2, len, r * 2)).premultiply(this.base);
    this.L.mesh(unitCyl(seg), mat, M4, { tint, uvScale: 1 });
    return this;
  }
  // unlit coloured light surface (lamps, LEDs, screens). tint = colour & brightness.
  glow(cx, cy, cz, sx, sy, sz, tint = 0xffd9a0, rot) {
    this.L.mesh(unitBox(), 'emissiveTint', this._m(cx, cy, cz, rot, sx, sy, sz), { tint, uvScale: 1 });
    return this;
  }
  glowSph(cx, cy, cz, r, tint = 0xffd9a0) { return this.sph(cx, cy, cz, r, 'emissiveTint', tint, [1, 1, 1], 8); }
  // world position of a local point
  at(lx, ly, lz, out = new THREE.Vector3()) { return out.set(lx, ly, lz).applyMatrix4(this.base); }
  light(lx, ly, lz, color, intensity, range, opts = {}) {
    const w = this.at(lx, ly, lz);
    return this.L.light(w.x, w.y, w.z, color, intensity, range, opts);
  }
  // volumetric beam from a local point along a local direction
  beam(lx, ly, lz, dx, dy, dz, len, radius, color, lightRef, strength) {
    const w = this.at(lx, ly, lz);
    const d = new THREE.Vector3(dx, dy, dz).applyAxisAngle(UPY, this.ry);
    lightCone(this.L, w.x, w.y, w.z, [d.x, d.y, d.z], len, radius, color, lightRef, strength);
    return this;
  }
  // collision box in local space (converted to world AABB)
  col(cx, cy, cz, sx, sy, sz, surf = 'metal', flags = F_DEFAULT) {
    const m = trs(cx, cy, cz, 0, 0, 0, sx, sy, sz).premultiply(this.base);
    const bb = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5)).applyMatrix4(m);
    this.L.col.addBox(bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z, surf, flags);
    this.L._expand(bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z);
    return this;
  }
}
export const prop = (L, x, y, z, ry) => {
  if (!L._propHook) {
    // small-detail materials don't need to cast shadows (saves shadow-pass draw
    // calls); alpha-tested wire mesh would cast solid shadows without a depth material
    L._propHook = true;
    (L.postBuild || (L.postBuild = [])).push(() => {
      for (const m of L.meshes || []) if (NO_SHADOW.has(m.material?.name)) m.castShadow = false;
    });
  }
  return new P(L, x, y, z, ry);
};
const NO_SHADOW = new Set(['chrome', 'paper', 'plasticGloss', 'chainLink', 'emissiveTint', 'glass', 'glassDirty']);

// Volumetric light cone (soft additive beam in fog). dir: world direction the
// light shines; lightRef: optional virtual light (L.light) whose on/flicker
// the beam follows. Merged into one mesh per level; skipped on low quality.
export function lightCone(L, x, y, z, dir = [0, -1, 0], len = 6, radius = 2, color = 0xffc070, lightRef = null, strength = 1) {
  const q = L.game?.quality;
  if (!q || q.cones === false) return;
  if (!L._cones) {
    L._cones = [];
    L.postBuild = L.postBuild || [];
    L.postBuild.push(() => {
      const list = L._cones;
      for (let i = 0; i < list.length; i += 64) {
        const b = buildConeBatch(list.slice(i, i + 64), 0.055);
        L.addObject(b.mesh);
        L.dynamics.push({ update: () => b.update() });
      }
    });
  }
  L._cones.push({ x, y, z, dir, len, radius, color, light: lightRef, tint: strength });
}

const pickC = (arr) => arr[Math.floor(rnd() * arr.length)];
const dpick = (arr) => arr[Math.floor(drnd() * arr.length)];
const CAR_COLORS = [0x7a1a14, 0x1a2a4a, 0x2a2a2a, 0x8a8a88, 0xc8c4b8, 0x1e3a2a, 0x5a4a2a, 0x3a1a2a, 0x9a7a2a];
const SKIN = [0x9a8a78, 0x8a7a6a, 0x7a6450, 0x5a4636, 0xa8988a, 0x6e5a48];

// ------------------------------------------------------------ furniture --
export function table(L, x, y, z, ry = 0, w = 1.4, d = 0.8, mat = 'wood') {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 0.735, 0, w, 0.045, d, 0.012, mat);
  // apron + tapered legs
  p.box(0, 0.67, d / 2 - 0.07, w - 0.16, 0.09, 0.025, mat, 0xb8b8b8);
  p.box(0, 0.67, -d / 2 + 0.07, w - 0.16, 0.09, 0.025, mat, 0xb8b8b8);
  p.box(w / 2 - 0.07, 0.67, 0, 0.025, 0.09, d - 0.16, mat, 0xb8b8b8);
  p.box(-w / 2 + 0.07, 0.67, 0, 0.025, 0.09, d - 0.16, mat, 0xb8b8b8);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.frustum(sx * (w / 2 - 0.06), 0.36, sz * (d / 2 - 0.06), 0.028, 0.02, 0.72, mat, 0xc0c0c0, null, 6);
  // everyday clutter on top
  if (drnd() < 0.5) {
    const ix = (drnd() - 0.5) * (w - 0.4), iz = (drnd() - 0.5) * (d - 0.3);
    p.cyl(ix, 0.8, iz, 0.04, 0.09, 'plastic', dpick([0xd8d4c8, 0x8a2a1a, 0x2a4a6a]), null, 10); // mug
    p.box(ix + 0.18, 0.762, iz + 0.05, 0.21, 0.004, 0.29, 'paper', 0xd8d4c8, [0, drnd() * 3, 0]);
  }
  if (drnd() < 0.25) { const ix = (drnd() - 0.5) * (w - 0.4); p.cyl(ix, 0.87, 0, 0.035, 0.23, 'glassDirty', 0x2a4a1a, null, 8); p.cyl(ix, 1.01, 0, 0.012, 0.06, 'glassDirty', 0x2a4a1a, null, 6); }
  p.col(0, 0.745, 0, w, 0.06, d, 'wood');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.col(sx * (w / 2 - 0.05), 0.36, sz * (d / 2 - 0.05), 0.06, 0.72, 0.06, 'wood', F_SOLID | F_SHOOT);
  return p;
}
export function chair(L, x, y, z, ry = 0, mat = 'woodDark', tipped = false) {
  const p = prop(L, x, y, z, ry);
  const build = (q) => {
    q.rbox(0, 0.45, 0, 0.44, 0.045, 0.42, 0.01, mat);
    for (const sx of [-1, 1]) {
      q.box(sx * 0.19, 0.22, -0.18, 0.035, 0.45, 0.035, mat);
      q.box(sx * 0.19, 0.52, 0.19, 0.035, 1.04, 0.035, mat, null, [-0.06, 0, 0]);
    }
    for (let i = 0; i < 3; i++) q.box(-0.1 + i * 0.1, 0.72, 0.205, 0.025, 0.38, 0.02, mat, null, [-0.06, 0, 0]);
    q.box(0, 0.94, 0.215, 0.42, 0.07, 0.03, mat, null, [-0.06, 0, 0]);
    q.box(0, 0.12, 0, 0.36, 0.02, 0.02, mat);
    q.box(0, 0.12, 0, 0.02, 0.02, 0.36, mat);
  };
  if (tipped) {
    // lying on its back
    const q = prop(L, x, y, z, ry);
    q.base = trs(x, y, z, 0, ry, 0).multiply(trs(0, 0.22, -0.25, -Math.PI / 2 + 0.08, 0, 0));
    build(q);
    p.col(0, 0.2, -0.1, 0.45, 0.4, 0.5, 'wood', F_SOLID);
    return p;
  }
  build(p);
  p.col(0, 0.5, 0, 0.44, 1.0, 0.44, 'wood', F_SOLID | F_SHOOT);
  return p;
}
export function sofa(L, x, y, z, ry = 0, color = 0x5a3a2a) {
  const p = prop(L, x, y, z, ry);
  const m = 'fabric';
  const dk = new THREE.Color(color).multiplyScalar(0.8).getHex();
  p.rbox(0, 0.25, 0.02, 1.96, 0.3, 0.86, 0.05, m, dk); // base
  p.rbox(0, 0.62, 0.36, 1.96, 0.56, 0.2, 0.08, m, color); // back
  for (const sx of [-1, 1]) p.rbox(sx * 0.9, 0.5, 0.02, 0.2, 0.34, 0.9, 0.08, m, color); // arms
  // seat cushions (slightly sagging, one askew)
  for (const [cx, rz] of [[-0.4, 0.02], [0.4, drnd() < 0.3 ? 0.1 : -0.02]]) p.rbox(cx, 0.46, -0.05, 0.78, 0.16, 0.7, 0.06, m, color, [0, rz * 0.5, rz]);
  // back cushions
  for (const cx of [-0.4, 0.4]) p.rbox(cx, 0.72, 0.22, 0.76, 0.42, 0.16, 0.07, m, color, [-0.15, 0, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(sx * 0.9, 0.05, sz * 0.36, 0.03, 0.1, 'woodDark', null, null, 6);
  if (drnd() < 0.4) p.rbox(-0.7 + drnd() * 0.2, 0.62, 0.05, 0.36, 0.34, 0.12, 0.06, m, dpick([0x8a7a5a, 0x6a2a2a, 0x3a4a5a]), [-0.3, 0.3, 0.2]);
  p.col(0, 0.45, 0, 2.0, 0.9, 0.9, 'fabric');
  return p;
}
export function bed(L, x, y, z, ry = 0, color = 0x8a8a9a, hospital = false) {
  const p = prop(L, x, y, z, ry);
  if (hospital) {
    p.box(0, 0.42, 0, 0.92, 0.08, 1.95, 'metalClean');
    for (const sz of [-0.9, 0.9]) p.box(0, 0.3, sz, 0.85, 0.05, 0.05, 'metalClean');
    p.rbox(0, 0.57, 0, 0.88, 0.16, 1.92, 0.05, 'fabric', 0xd8dcd8);
    p.rbox(0, 0.66, -0.05, 0.9, 0.05, 1.5, 0.02, 'fabric', 0xb8c8c0, [0, 0, 0]); // blanket
    p.rbox(0, 0.72, 0.78, 0.6, 0.12, 0.34, 0.05, 'fabric', 0xeeeeee, [0.25, 0, 0]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { p.cyl(sx * 0.4, 0.2, sz * 0.88, 0.022, 0.4, 'metalClean', null, null, 6); p.cylX(sx * 0.4, 0.055, sz * 0.88, 0.05, 0.04, 'rubber', null, 10); }
    p.box(0, 0.8, 0.99, 0.95, 0.5, 0.04, 'plastic', 0xd0d4d0); // headboard
    p.box(0, 0.7, -0.99, 0.95, 0.36, 0.04, 'plastic', 0xd0d4d0); // footboard
    for (const sx of [-1, 1]) { // side rails
      p.box(sx * 0.47, 0.8, 0.35, 0.03, 0.02, 0.9, 'metalClean');
      p.box(sx * 0.47, 0.68, 0.35, 0.03, 0.02, 0.9, 'metalClean');
      for (const sz of [-0.05, 0.75]) p.box(sx * 0.47, 0.73, sz, 0.02, 0.14, 0.02, 'metalClean');
    }
    p.box(0.3, 0.72, -0.99, 0.2, 0.1, 0.05, 'plastic', 0xe8e8e0); // chart holder
    p.glow(-0.2, 0.75, -1.015, 0.04, 0.02, 0.01, 0x30ff60);
    p.col(0, 0.4, 0, 0.95, 0.8, 2.0, 'metal');
    return p;
  }
  p.box(0, 0.16, 0, 1.5, 0.22, 2.02, 'woodDark');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * 0.7, 0.06, sz * 0.96, 0.08, 0.12, 0.08, 'woodDark');
  p.rbox(0, 0.38, 0, 1.44, 0.22, 1.94, 0.06, 'fabric', 0xd8d2c0);
  // duvet draping over the sides, rumpled
  p.rbox(0, 0.51, -0.12, 1.52, 0.07, 1.62, 0.03, 'fabric', color, [0.02, 0, drnd() < 0.5 ? 0.02 : -0.02]);
  p.rbox(0.5 * (drnd() < 0.5 ? -1 : 1), 0.56, -0.3, 0.6, 0.08, 0.5, 0.04, 'fabric', color, [0.1, drnd(), 0.1]);
  for (const cx of [-0.35, 0.35]) p.rbox(cx, 0.58, 0.78, 0.56, 0.13, 0.36, 0.06, 'fabric', 0xeeeeea, [0.15, drnd() * 0.2 - 0.1, 0]);
  p.rbox(0, 0.72, 1.02, 1.56, 1.0, 0.07, 0.02, 'woodDark');
  p.box(0, 1.2, 1.0, 1.6, 0.06, 0.1, 'woodDark');
  p.col(0, 0.3, 0, 1.5, 0.62, 2.05, 'fabric');
  return p;
}
export function dresser(L, x, y, z, ry = 0, mat = 'woodDark') {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.5, 0.01, 1.16, 0.96, 0.48, mat);
  p.rbox(0, 0.995, 0, 1.22, 0.035, 0.52, 0.01, mat);
  p.box(0, 0.03, 0, 1.12, 0.06, 0.46, mat, 0x777777);
  for (let i = 0; i < 3; i++) {
    const open = drnd() < 0.2 ? 0.12 : 0;
    p.rbox(0, 0.2 + i * 0.3, -0.245 - open, 1.08, 0.26, 0.03, 0.008, mat, 0xd0d0d0);
    for (const hx of [-0.3, 0.3]) p.box(hx, 0.2 + i * 0.3, -0.268 - open, 0.1, 0.018, 0.02, 'chrome', 0xb09a6a);
  }
  if (drnd() < 0.6) { p.box(-0.3, 1.13, 0.1, 0.18, 0.24, 0.02, 'woodDark', null, [-0.2, 0.3, 0]); p.box(-0.3, 1.13, 0.095, 0.14, 0.19, 0.005, 'paper', dpick([0x6a7a8a, 0x8a7a6a])); }
  if (drnd() < 0.5) p.cyl(0.35, 1.07, 0, 0.05, 0.1, 'glassDirty', 0xa8b8b0, null, 8);
  p.col(0, 0.5, 0, 1.2, 1.0, 0.5, 'wood');
  return p;
}
export function bookshelf(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  // carcass: sides, back, shelves
  for (const sx of [-1, 1]) p.box(sx * 0.49, 1.0, 0, 0.025, 2.0, 0.35, 'woodDark');
  p.box(0, 1.0, 0.165, 0.96, 2.0, 0.02, 'woodDark', 0x999999);
  for (let i = 0; i < 5; i++) p.box(0, 0.08 + i * 0.47, 0, 0.96, 0.025, 0.34, 'woodDark');
  p.box(0, 1.99, 0, 1.0, 0.03, 0.36, 'woodDark');
  for (let i = 0; i < 4; i++) {
    let bx = -0.44;
    let lean = 0;
    while (bx < 0.42) {
      const bw = 0.03 + rnd() * 0.05;
      const bh = 0.25 + rnd() * 0.12;
      if (rnd() < 0.85) {
        const col = pickC([0x6a2a2a, 0x2a3a5a, 0x3a5a3a, 0x8a7a5a, 0x4a4a4a]);
        p.box(bx + bw / 2, 0.095 + i * 0.47 + bh / 2, -0.03, bw, bh, 0.24, 'fabric', col, lean ? [0, 0, lean] : null);
        if (drnd() < 0.3) p.box(bx + bw / 2, 0.095 + i * 0.47 + bh * 0.8, -0.151, bw * 0.8, 0.015, 0.002, 'paper', 0xc8b878);
        lean = 0;
      } else lean = drnd() < 0.5 ? 0.25 : 0;
      bx += bw + 0.005;
    }
  }
  p.col(0, 1.0, 0, 1.0, 2.0, 0.35, 'wood');
  return p;
}
export function tv(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  // low media cabinet
  p.box(0, 0.25, 0, 1.0, 0.46, 0.44, 'woodDark');
  p.rbox(0, 0.49, 0, 1.04, 0.03, 0.46, 0.008, 'woodDark');
  p.box(-0.24, 0.25, -0.223, 0.44, 0.36, 0.01, 'glassDirty', 0x202428);
  p.box(0.25, 0.3, -0.12, 0.34, 0.07, 0.24, 'plastic', 0x1a1a1a); // VCR
  p.glow(0.34, 0.3, -0.241, 0.05, 0.015, 0.004, 0x40ff50);
  // CRT television
  p.rbox(0, 0.76, 0.02, 0.74, 0.5, 0.42, 0.04, 'plastic', 0x242424);
  p.rbox(0, 0.72, 0.28, 0.5, 0.36, 0.2, 0.05, 'plastic', 0x1e1e1e);
  p.rbox(-0.05, 0.77, -0.19, 0.58, 0.42, 0.02, 0.03, 'plasticGloss', 0x10151a);
  for (let i = 0; i < 3; i++) p.cylZ(0.3, 0.64 + i * 0.05, -0.2, 0.012, 0.02, 'plastic', 0x777777, 8);
  // rabbit ears
  p.tube(0, 1.01, 0.05, -0.2, 1.35, 0.1, 0.004, 'chrome');
  p.tube(0, 1.01, 0.05, 0.22, 1.32, 0.1, 0.004, 'chrome');
  p.col(0, 0.5, 0, 1.0, 1.0, 0.45, 'wood');
  return p;
}
export function fridge(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  const tint = dpick([0xe8e8e0, 0xd8d0b8, 0xe0e0d8]);
  p.rbox(0, 0.9, 0.02, 0.75, 1.8, 0.66, 0.04, 'paintedWhite', tint);
  p.rbox(0, 1.42, -0.325, 0.74, 0.7, 0.05, 0.025, 'paintedWhite', tint); // freezer door
  p.rbox(0, 0.56, -0.325, 0.74, 1.02, 0.05, 0.025, 'paintedWhite', tint); // fridge door
  p.box(0, 1.065, -0.35, 0.72, 0.012, 0.012, 'blackMatte');
  p.rbox(0.3, 1.25, -0.37, 0.03, 0.3, 0.04, 0.012, 'chrome');
  p.rbox(0.3, 0.9, -0.37, 0.03, 0.4, 0.04, 0.012, 'chrome');
  p.box(0, 0.05, -0.33, 0.66, 0.08, 0.02, 'blackMatte');
  // magnets + a note
  for (let i = 0; i < 4; i++) p.box(-0.25 + drnd() * 0.4, 0.8 + drnd() * 0.8, -0.354, 0.04, 0.04, 0.008, 'plastic', dpick([0xc02020, 0x2050c0, 0xe0c020, 0x20a040]));
  p.box(-0.1, 1.2, -0.352, 0.15, 0.2, 0.002, 'paper', 0xe8e4d0, [0, 0, 0.1]);
  p.col(0, 0.9, 0, 0.75, 1.8, 0.7, 'metal');
  return p;
}
export function stove(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 0.45, 0, 0.75, 0.9, 0.65, 0.02, 'paintedWhite', 0xe0e0d8);
  p.box(0, 0.905, 0, 0.72, 0.012, 0.62, 'blackMatte');
  for (const [bx, bz, r] of [[-0.18, -0.14, 0.09], [0.18, -0.14, 0.07], [-0.18, 0.14, 0.07], [0.18, 0.14, 0.09]]) {
    p.torus(bx, 0.915, bz, r, 0.008, 'metalDark', null, [Math.PI / 2, 0, 0], 4, 14);
    p.torus(bx, 0.915, bz, r * 0.55, 0.006, 'metalDark', null, [Math.PI / 2, 0, 0], 4, 12);
  }
  p.box(0, 1.02, 0.3, 0.75, 0.22, 0.05, 'paintedWhite', 0xd8d8d0); // backsplash panel
  for (let i = 0; i < 4; i++) p.cylZ(-0.24 + i * 0.16, 1.0, 0.27, 0.022, 0.03, 'plastic', 0x222222, 10);
  p.glow(0.3, 1.04, 0.272, 0.08, 0.03, 0.004, 0x60ff60);
  p.rbox(0, 0.45, -0.33, 0.66, 0.46, 0.03, 0.02, 'paintedWhite', 0xd8d8d0);
  p.box(0, 0.45, -0.35, 0.48, 0.26, 0.01, 'glassDirty', 0x181818);
  p.cylX(0, 0.72, -0.37, 0.013, 0.56, 'chrome', null, 8);
  p.box(0, 0.1, -0.33, 0.66, 0.12, 0.02, 'paintedWhite', 0xc8c8c0);
  if (drnd() < 0.5) { p.cyl(-0.18, 0.99, -0.14, 0.12, 0.13, 'metalClean', null, null, 14); p.cylX(-0.37, 1.0, -0.14, 0.012, 0.16, 'blackMatte', null, 6); }
  p.col(0, 0.45, 0, 0.75, 0.9, 0.65, 'metal');
  return p;
}
export function counter(L, x, y, z, ry = 0, len = 2.4, top = 'marble') {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.46, 0.02, len, 0.84, 0.58, 'woodPale');
  p.box(0, 0.05, -0.24, len, 0.1, 0.04, 'woodPale', 0x444444); // kick
  p.rbox(0, 0.9, -0.02, len + 0.02, 0.04, 0.66, 0.012, top);
  const n = Math.floor(len / 0.6);
  for (let i = 0; i < n; i++) {
    const cx = -len / 2 + 0.3 + i * 0.6;
    p.rbox(cx, 0.48, -0.285, 0.57, 0.72, 0.025, 0.008, 'woodPale', 0xc8c8c8);
    p.box(cx + (i % 2 ? -0.22 : 0.22), 0.7, -0.305, 0.02, 0.12, 0.02, 'chrome');
  }
  // backsplash + a few items
  p.box(0, 0.98, 0.31, len, 0.12, 0.02, top);
  if (len >= 1.8) {
    p.box(len * 0.2, 0.84, -0.02, 0.5, 0.12, 0.38, 'metalClean', 0x9a9a9a); // sink basin rim
    p.box(len * 0.2, 0.921, -0.02, 0.44, 0.005, 0.32, 'blackMatte', 0x333333);
    p.tube(len * 0.2, 0.92, 0.22, len * 0.2, 1.1, 0.2, 0.012, 'chrome');
    p.tube(len * 0.2, 1.1, 0.2, len * 0.2, 1.08, 0.08, 0.012, 'chrome');
  }
  if (drnd() < 0.6) { p.rbox(-len * 0.3, 1.02, 0.08, 0.3, 0.2, 0.22, 0.03, 'plastic', dpick([0xd8d8d0, 0x8a2a1a, 0x2a2a2a])); }
  if (drnd() < 0.5) p.cyl(-len * 0.05, 0.99, -0.1, 0.06, 0.14, 'plastic', dpick([0xc03020, 0x2050a0, 0xe0e0d0]), null, 10);
  p.col(0, 0.46, 0, len, 0.92, 0.64, 'wood');
  return p;
}
export function desk(L, x, y, z, ry = 0, computer = true) {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 0.74, 0, 1.5, 0.035, 0.75, 0.01, 'woodPale');
  p.box(-0.55, 0.37, 0, 0.4, 0.72, 0.7, 'woodPale', 0xd8d8d8);
  for (let i = 0; i < 3; i++) { p.box(-0.55, 0.14 + i * 0.22, -0.352, 0.37, 0.19, 0.012, 'woodPale', 0xc8c8c8); p.box(-0.55, 0.2 + i * 0.22, -0.362, 0.12, 0.015, 0.015, 'chrome'); }
  p.box(0.72, 0.37, 0, 0.04, 0.72, 0.7, 'woodPale');
  p.box(0.1, 0.45, 0.33, 1.2, 0.45, 0.02, 'woodPale', 0xc0c0c0); // modesty panel
  if (computer) {
    // LCD monitor on a stand
    p.rbox(0.1, 1.02, 0.14, 0.52, 0.34, 0.035, 0.012, 'plastic', 0x1c1c1c);
    const on = drnd() < 0.25;
    if (on) p.glow(0.1, 1.025, 0.12, 0.47, 0.29, 0.005, 0x1a3a5a); else p.box(0.1, 1.025, 0.121, 0.47, 0.29, 0.004, 'plasticGloss', 0x0a0c10);
    p.box(0.1, 0.83, 0.16, 0.05, 0.16, 0.03, 'plastic', 0x1c1c1c);
    p.box(0.1, 0.765, 0.16, 0.22, 0.012, 0.16, 'plastic', 0x1c1c1c);
    p.rbox(0.05, 0.768, -0.12, 0.44, 0.02, 0.15, 0.006, 'plastic', 0x2a2a2a); // keyboard
    p.rbox(0.36, 0.768, -0.12, 0.06, 0.02, 0.1, 0.01, 'plastic', 0x2a2a2a); // mouse
    p.rbox(-0.55, 0.62, 0.12, 0.2, 0.44, 0.44, 0.01, 'plastic', 0x2a2a2a); // tower under desk
    if (on) p.glow(-0.5, 0.78, -0.105, 0.015, 0.015, 0.004, 0x40ff60);
  }
  // paperwork
  for (let i = 0; i < 2 + Math.floor(drnd() * 3); i++) p.box(-0.45 + drnd() * 0.3, 0.76 + i * 0.004, -0.1 + drnd() * 0.2, 0.21, 0.004, 0.29, 'paper', dpick([0xe0dcd0, 0xd8d4c8, 0xe8e0a8]), [0, drnd() * 0.8 - 0.4, 0]);
  if (drnd() < 0.5) p.cyl(0.55, 0.8, -0.2, 0.04, 0.09, 'plastic', dpick([0xe0e0d8, 0x8a2a1a, 0x2a4a6a]), null, 10);
  p.col(0, 0.38, 0, 1.5, 0.78, 0.75, 'wood');
  return p;
}
export function officeChair(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  const col = dpick([0x222222, 0x1e2430, 0x2a2a2a]);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    const cx = Math.cos(a) * 0.3, cz = Math.sin(a) * 0.3;
    p.tube(0, 0.1, 0, cx, 0.07, cz, 0.02, 'metalDark');
    p.sph(cx, 0.035, cz, 0.032, 'plastic', 0x151515, [1, 1, 1], 6);
  }
  p.cyl(0, 0.1, 0, 0.045, 0.06, 'metalDark', null, null, 8);
  p.cyl(0, 0.27, 0, 0.022, 0.34, 'chrome', null, null, 8);
  p.box(0, 0.43, 0, 0.3, 0.04, 0.3, 'metalDark');
  p.rbox(0, 0.48, 0, 0.5, 0.08, 0.5, 0.035, 'fabric', col);
  p.box(0, 0.62, 0.24, 0.06, 0.3, 0.03, 'metalDark', null, [-0.12, 0, 0]);
  p.rbox(0, 0.85, 0.26, 0.46, 0.5, 0.07, 0.035, 'fabric', col, [-0.1, 0, 0]);
  for (const sx of [-1, 1]) { p.box(sx * 0.24, 0.58, 0.02, 0.03, 0.16, 0.03, 'plastic', 0x1a1a1a); p.rbox(sx * 0.24, 0.66, 0.02, 0.06, 0.03, 0.26, 0.012, 'plastic', 0x1a1a1a); }
  p.col(0, 0.5, 0, 0.55, 1.0, 0.55, 'fabric', F_SOLID | F_SHOOT);
  return p;
}
export function filingCabinet(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  const tint = dpick([0xa8aca8, 0x8a9088, 0xb8b4a0]);
  p.rbox(0, 0.66, 0, 0.47, 1.32, 0.62, 0.01, 'paintedWhite', tint);
  for (let i = 0; i < 4; i++) {
    const open = drnd() < 0.12 ? 0.22 : 0;
    const cy = 0.18 + i * 0.32;
    p.rbox(0, cy, -0.312 - open, 0.43, 0.28, 0.02, 0.006, 'paintedWhite', tint);
    if (open) { p.box(0, cy + 0.02, -0.2 - open / 2, 0.4, 0.22, open, 'paintedWhite', tint); for (let k = 0; k < 6; k++) p.box(-0.15 + k * 0.06, cy + 0.12, -0.2 - open / 2, 0.005, 0.2, 0.2, 'paper', 0xd8c890); }
    p.box(0, cy + 0.05, -0.326 - open, 0.14, 0.03, 0.012, 'chrome');
    p.box(0, cy + 0.1, -0.323 - open, 0.08, 0.035, 0.005, 'paper', 0xe8e4d8);
  }
  p.col(0, 0.66, 0, 0.47, 1.32, 0.62, 'metal');
  return p;
}
export function lamp(L, x, y, z) {
  const p = prop(L, x, y, z, 0);
  p.frustum(0, 0.025, 0, 0.1, 0.15, 0.05, 'metalDark', null, null, 16);
  p.cyl(0, 0.78, 0, 0.012, 1.5, 'chrome', 0x9a8a6a, null, 6);
  p.frustum(0, 1.55, 0, 0.14, 0.23, 0.28, 'fabric', 0xd8c8a0, null, 16);
  p.glowSph(0, 1.5, 0, 0.04, 0x806040);
  return p;
}
export function cabinetWall(L, x, y, z, ry = 0, len = 2.4) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 1.9, 0.15, len, 0.7, 0.35, 'woodPale');
  for (let i = 0; i < Math.floor(len / 0.6); i++) {
    const cx = -len / 2 + 0.3 + i * 0.6;
    const open = drnd() < 0.15;
    p.rbox(cx, 1.9, -0.028, 0.56, 0.64, 0.02, 0.006, 'woodPale', 0xc8c8c8, open ? [0, i % 2 ? 1.2 : -1.2, 0] : null);
    p.box(cx + (i % 2 ? -0.22 : 0.22), 1.66, -0.045, 0.02, 0.1, 0.02, 'chrome');
  }
  return p;
}
export function toilet(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.frustum(0, 0.18, 0.02, 0.13, 0.16, 0.36, 'plasticGloss', 0xeeeee8, null, 14); // pedestal
  p.sph(0, 0.36, -0.08, 0.2, 'plasticGloss', 0xeeeee8, [1, 0.45, 1.25], 14); // bowl
  p.torus(0, 0.42, -0.08, 0.17, 0.03, 'plasticGloss', 0xf0f0ea, [Math.PI / 2, 0, 0], 6, 18);
  p.sph(0, 0.415, -0.08, 0.14, 'blackMatte', 0x303a3a, [1, 0.05, 1.2], 10);
  if (drnd() < 0.6) p.rbox(0, 0.62, 0.12, 0.38, 0.4, 0.03, 0.03, 'plasticGloss', 0xeeeee8, [-0.2, 0, 0]); // raised lid
  p.rbox(0, 0.62, 0.21, 0.42, 0.4, 0.18, 0.03, 'plasticGloss', 0xeeeee8);
  p.rbox(0, 0.835, 0.21, 0.44, 0.03, 0.2, 0.012, 'plasticGloss', 0xeeeee8);
  p.box(-0.15, 0.76, 0.115, 0.05, 0.015, 0.02, 'chrome');
  p.col(0, 0.4, 0, 0.4, 0.8, 0.6, 'tile');
  return p;
}
export function bathtub(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 0.28, 0, 0.75, 0.56, 1.7, 0.06, 'plasticGloss', 0xeeeee8);
  p.rbox(0, 0.36, 0, 0.6, 0.42, 1.55, 0.12, 'plasticGloss', 0xd8d8d0);
  p.box(0, 0.53, 0, 0.55, 0.01, 1.45, 'blackMatte', 0x2a2a28);
  p.tube(0, 0.55, 0.8, 0, 0.66, 0.8, 0.015, 'chrome');
  p.tube(0, 0.66, 0.8, 0, 0.64, 0.68, 0.015, 'chrome');
  for (const sx of [-0.1, 0.1]) p.cyl(sx, 0.62, 0.84, 0.025, 0.04, 'chrome', null, null, 8);
  p.col(0, 0.28, 0, 0.75, 0.56, 1.7, 'tile');
  return p;
}
export function sink(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 0.85, 0, 0.55, 0.12, 0.45, 0.04, 'plasticGloss', 0xeeeeee);
  p.box(0, 0.91, -0.02, 0.4, 0.005, 0.28, 'blackMatte', 0x3a3a38);
  p.frustum(0, 0.42, 0.06, 0.08, 0.11, 0.8, 'plasticGloss', 0xeeeeee, null, 12);
  p.tube(0, 0.92, 0.17, 0, 1.05, 0.17, 0.015, 'chrome');
  p.tube(0, 1.05, 0.17, 0, 1.03, 0.07, 0.013, 'chrome');
  for (const sx of [-0.12, 0.12]) p.cyl(sx, 0.94, 0.17, 0.022, 0.04, 'chrome', null, null, 8);
  p.rbox(0, 1.32, 0.215, 0.52, 0.62, 0.02, 0.01, 'chrome');
  p.box(0, 1.32, 0.203, 0.46, 0.56, 0.004, 'glassDirty', 0x8a9a98);
  if (drnd() < 0.4) p.box(0.1, 1.4, 0.2, 0.2, 0.3, 0.003, 'blackMatte', 0x5a4a40, [0, 0, 0.6]); // crack stain
  p.col(0, 0.5, 0, 0.55, 1.0, 0.45, 'tile', F_SOLID | F_SHOOT);
  return p;
}
export function rug(L, x, y, z, w, d, color) {
  L.box(x - w / 2, y, z - d / 2, x + w / 2, y + 0.012, z + d / 2, 'carpet', { tint: color, collide: false });
  // border band
  const c = new THREE.Color(color ?? 0x6a2a2a).multiplyScalar(0.55).getHex();
  L.box(x - w / 2 + 0.08, y + 0.012, z - d / 2 + 0.08, x + w / 2 - 0.08, y + 0.014, z - d / 2 + 0.14, 'carpet', { tint: c, collide: false });
  L.box(x - w / 2 + 0.08, y + 0.012, z + d / 2 - 0.14, x + w / 2 - 0.08, y + 0.014, z + d / 2 - 0.08, 'carpet', { tint: c, collide: false });
}
export function picture(L, x, y, z, ry, w = 0.6, h = 0.45) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0, 0, w, h, 0.03, 'woodDark');
  p.box(0, 0, -0.012, w - 0.06, h - 0.06, 0.01, 'paper', 0xd8d0c0);
  const c = pickC([0x5a6a7a, 0x7a5a3a, 0x3a5a3a, 0x8a7a6a]);
  p.box(0, 0.02, -0.018, w - 0.14, h * 0.45, 0.004, 'paper', c);
  p.box(0, -h * 0.18, -0.018, w - 0.14, h * 0.25, 0.004, 'paper', new THREE.Color(c).multiplyScalar(0.6).getHex());
  p.box(0, 0, -0.022, w - 0.06, h - 0.06, 0.002, 'glassDirty', 0x9aa8a8);
  return p;
}

// ---------------------------------------------------------- containers --
export function crate(L, x, y, z, ry = 0, s = 1, mat = 'wood') {
  const p = prop(L, x, y, z, ry);
  const h = 0.8 * s, e = 0.07 * s;
  p.box(0, h / 2, 0, 0.78 * s, 0.78 * s, 0.78 * s, mat, 0x8a8078); // inner box (dark gaps between planks)
  // planks on the four sides + top
  for (let i = 0; i < 4; i++) {
    const py = (0.1 + i * 0.2) * s;
    for (const [sz] of [[-1], [1]]) p.box(0, py, sz * 0.395 * s, 0.7 * s, 0.17 * s, 0.018 * s, mat, i % 2 ? 0xd0c8b8 : 0xe0d8c8);
    for (const sx of [-1, 1]) p.box(sx * 0.395 * s, py, 0, 0.018 * s, 0.17 * s, 0.7 * s, mat, i % 2 ? 0xe0d8c8 : 0xd0c8b8);
  }
  for (let i = 0; i < 4; i++) p.box((-0.3 + i * 0.2) * s, h - 0.009 * s, 0, 0.17 * s, 0.02 * s, 0.7 * s, mat, 0xd8d0c0);
  // corner battens + frame
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * 0.37 * s, h / 2, sz * 0.37 * s, e, h, e, mat, 0xb0a490);
  for (const sy of [e / 2, h - e / 2]) for (const sz of [-1, 1]) p.box(0, sy, sz * 0.405 * s, 0.8 * s, e, 0.02 * s, mat, 0xb0a490);
  p.box(0, h / 2, -0.412 * s, 0.1 * s, 0.9 * s, 0.012, mat, 0xa89878, [0, 0, 0.78]);
  if (drnd() < 0.5) p.box(0.1 * s, h * 0.55, -0.419 * s, 0.34 * s, 0.12 * s, 0.002, 'plastic', 0x1a1a1a); // stencil
  p.col(0, 0.4 * s, 0, 0.8 * s, 0.8 * s, 0.8 * s, 'wood');
  return p;
}
export function pallet(L, x, y, z, ry = 0, boxes = true) {
  const p = prop(L, x, y, z, ry);
  for (let i = 0; i < 5; i++) p.box(-0.5 + i * 0.25, 0.12, 0, 0.12, 0.02, 1.2, 'wood', 0xbbaa88);
  for (const sz of [-0.5, 0, 0.5]) p.box(0, 0.055, sz, 1.1, 0.11, 0.1, 'wood', 0xa89878);
  for (let i = 0; i < 3; i++) p.box(-0.45 + i * 0.45, 0.01, 0, 0.12, 0.02, 1.2, 'wood', 0x9a8a70);
  let h = 0.13;
  if (boxes) {
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const ox = (rnd() - 0.5) * 0.1, oz = (rnd() - 0.5) * 0.1;
      const tint = dpick([0x9a8060, 0x8a7050, 0xa89070]);
      p.rbox(ox, h + 0.25, oz, 1.0, 0.5, 1.0, 0.015, 'fabric', tint);
      p.box(ox, h + 0.25, oz, 1.01, 0.05, 1.01, 'plastic', 0xc8b890); // packing tape
      if (drnd() < 0.5) p.box(ox + 0.2, h + 0.3, oz - 0.506, 0.25, 0.15, 0.003, 'plastic', 0xe8e4d8);
      h += 0.5;
    }
    if (drnd() < 0.5) p.box(0, h / 2 + 0.05, 0, 1.03, h - 0.1, 1.03, 'glassDirty', 0xb8c0c0); // stretch wrap
  }
  p.col(0, h / 2, 0, 1.15, h, 1.2, 'wood');
  return p;
}
export function barrel(L, x, y, z, color = 0x3a4a6a, rusty = true) {
  const p = prop(L, x, y, z, 0);
  const mat = rusty ? 'rust' : 'paintedBlue';
  p.cyl(0, 0.45, 0, 0.29, 0.88, mat, color, null, 16);
  for (const hy of [0.02, 0.3, 0.6, 0.88]) p.torus(0, hy, 0, 0.292, 0.014, mat, color, [Math.PI / 2, 0, 0], 4, 18);
  p.cyl(0, 0.895, 0, 0.27, 0.01, mat, new THREE.Color(color).multiplyScalar(0.7).getHex(), null, 16);
  p.cyl(0.14, 0.9, 0.08, 0.035, 0.02, 'metalDark', null, null, 8);
  p.cyl(-0.16, 0.9, -0.05, 0.02, 0.02, 'metalDark', null, null, 6);
  if (!rusty && drnd() < 0.6) p.box(0, 0.5, -0.285, 0.22, 0.2, 0.01, 'paintedYellow', 0xd8b020, [0, 0, 0.78]); // hazard label
  p.col(0, 0.45, 0, 0.6, 0.9, 0.6, 'metal');
  return p;
}
export function dumpster(L, x, y, z, ry = 0, color = 0x2e4a36) {
  const p = prop(L, x, y, z, ry);
  const m = 'paintedGreen';
  // tapered body: back wall vertical, front slopes out at the top
  p.box(0, 0.72, 0.2, 1.9, 1.16, 0.7, m, color);
  p.box(0, 0.7, -0.33, 1.9, 1.12, 0.36, m, color, [0.1, 0, 0]);
  p.box(0, 0.16, 0, 1.84, 0.08, 1.0, 'metalDark');
  for (const sx of [-1, 1]) {
    p.box(sx * 0.96, 0.75, 0, 0.04, 1.1, 1.08, m, new THREE.Color(color).multiplyScalar(0.85).getHex()); // side ribs
    p.box(sx * 0.99, 0.55, 0, 0.1, 0.18, 0.9, 'metalDark'); // fork pocket
    for (const sz of [-0.2, 0.25]) p.box(sx * 0.97, 0.9, sz, 0.02, 0.9, 0.06, m, color);
  }
  p.box(0, 1.28, 0, 2.0, 0.07, 1.14, 'metalDark'); // top lip
  // lids: one closed, one propped open
  const open = drnd() < 0.5;
  p.rbox(-0.48, 1.34, 0.02, 0.94, 0.05, 1.12, 0.02, 'rubber', 0x1c1f1c, [0.08, 0, 0]);
  if (open) p.rbox(0.48, 1.62, 0.62, 0.94, 0.05, 1.12, 0.02, 'rubber', 0x1c1f1c, [1.35, 0, 0]);
  else p.rbox(0.48, 1.34, 0.02, 0.94, 0.05, 1.12, 0.02, 'rubber', 0x1c1f1c, [0.1, 0, 0]);
  if (open) for (let i = 0; i < 3; i++) p.sph(0.3 + drnd() * 0.4, 1.28, -0.2 + drnd() * 0.4, 0.22, 'rubber', dpick([0x151518, 0x2a3a2a, 0x151518]), [1, 0.6, 1]);
  for (const sx of [-0.8, 0.8]) for (const sz of [-0.42, 0.42]) { p.box(sx, 0.11, sz, 0.08, 0.06, 0.08, 'metalDark'); p.cylX(sx, 0.065, sz, 0.065, 0.05, 'rubber', null, 10); }
  // grime streak + sticker
  p.box(0.4, 0.7, -0.52, 0.5, 0.6, 0.01, 'rust', 0x6a4a36, [0.1, 0, 0]);
  p.box(-0.5, 0.95, -0.54, 0.3, 0.16, 0.005, 'paintedWhite', 0xd8d8d0, [0.1, 0, 0]);
  p.col(0, 0.7, 0, 1.9, 1.4, 1.1, 'metal');
  return p;
}
export function trashCan(L, x, y, z) {
  const p = prop(L, x, y, z, 0);
  p.cyl(0, 0.44, 0, 0.27, 0.86, 'metal', 0x6a6a64, null, 16);
  for (let i = 0; i < 4; i++) p.torus(0, 0.12 + i * 0.22, 0, 0.272, 0.012, 'metal', 0x5a5a54, [Math.PI / 2, 0, 0], 4, 18);
  p.torus(0, 0.87, 0, 0.275, 0.02, 'metal', 0x7a7a74, [Math.PI / 2, 0, 0], 4, 18);
  for (const sx of [-1, 1]) p.torus(sx * 0.28, 0.7, 0, 0.05, 0.01, 'metal', 0x5a5a54, [0, Math.PI / 2, 0], 4, 8, Math.PI);
  if (drnd() < 0.55) { // lid on, slightly askew
    p.frustum(0, 0.9, 0, 0.26, 0.29, 0.06, 'metal', 0x7a7a74, [0.05, 0, 0.04], 16);
    p.box(0, 0.96, 0, 0.14, 0.03, 0.03, 'metal', 0x5a5a54);
  } else p.sph(0, 0.86, 0, 0.24, 'rubber', 0x151518, [1, 0.5, 1]); // overflowing bag
  p.col(0, 0.45, 0, 0.55, 0.9, 0.55, 'metal', F_SOLID | F_SHOOT);
  return p;
}
export function trashBags(L, x, y, z, n = 4) {
  const p = prop(L, x, y, z, rnd() * 6);
  for (let i = 0; i < n; i++) {
    const bx = (rnd() - 0.5) * 1.0, bz = (rnd() - 0.5) * 0.8, r = 0.3 + rnd() * 0.1;
    const col = drnd() < 0.75 ? 0x131316 : dpick([0x2a3a2a, 0x3a3a3a, 0xa8a8a0]);
    const sq = 0.65 + drnd() * 0.2;
    p.sph(bx, r * sq * 0.9, bz, r, 'rubber', col, [1, sq, 0.9 + drnd() * 0.2], 12);
    // knotted neck
    p.cone(bx + r * 0.2, r * sq * 1.7, bz, 0.07, 0.16, 'rubber', col, [0.3, 0, -0.5], 6);
  }
  if (n >= 4) for (let i = 0; i < 3; i++) p.box((drnd() - 0.5) * 1.4, 0.004, (drnd() - 0.5) * 1.2, 0.2, 0.004, 0.28, 'paper', 0xc8c4b0, [0, drnd() * 6, 0]);
  return p;
}
export function debris(L, x, y, z, r = 1.2, mat = 'concrete', n = 8) {
  const p = prop(L, x, y, z, rnd() * 6);
  for (let i = 0; i < n; i++) {
    const s = 0.15 + rnd() * 0.4;
    const px = (rnd() - 0.5) * r * 2, pz = (rnd() - 0.5) * r * 2;
    const sx = s * (1 + rnd()), sy = s * 0.6, rot = [rnd() * 0.5, rnd() * 3, rnd() * 0.5];
    if (drnd() < 0.5) p.rbox(px, s / 3, pz, sx, sy, s, s * 0.12, mat, 0xd0d0d0, rot, 1);
    else p.box(px, s / 3, pz, sx, sy, s, mat, null, rot);
    if (drnd() < 0.3) p.box(px + s * 0.4, 0.02, pz, s * 0.6, 0.04, s * 0.4, mat, 0xb0b0b0, [0, drnd() * 3, 0]); // chip
  }
  // splinters / rebar poking out
  for (let i = 0; i < Math.ceil(n / 4); i++) {
    const a = drnd() * 6.28, rr = drnd() * r;
    const px = Math.cos(a) * rr, pz = Math.sin(a) * rr;
    if (mat.startsWith('wood')) p.box(px, 0.04, pz, 0.05, 0.03, 0.6 + drnd() * 0.6, mat, 0xc0b0a0, [0.1, drnd() * 3, 0]);
    else p.tube(px, 0.02, pz, px + (drnd() - 0.5) * 0.8, 0.1 + drnd() * 0.3, pz + (drnd() - 0.5) * 0.8, 0.008, 'rust');
  }
  // dust skirt
  for (let i = 0; i < 6; i++) p.box((drnd() - 0.5) * r * 2.2, 0.005, (drnd() - 0.5) * r * 2.2, 0.06 + drnd() * 0.1, 0.02, 0.05 + drnd() * 0.08, mat, 0xb8b8b8, [0, drnd() * 3, 0]);
  return p;
}
export function papers(L, x, y, z, r = 2, n = 10) {
  const p = prop(L, x, y, z, 0);
  for (let i = 0; i < n; i++) {
    const px = (rnd() - 0.5) * r * 2, pz = (rnd() - 0.5) * r * 2, a = rnd() * 6;
    const fold = drnd() < 0.3;
    const tint = dpick([0xd8d4c8, 0xe0dcd0, 0xc8c4b0, 0xd8d0a8, 0xe8e8e0]);
    if (fold) { p.box(px, 0.02, pz, 0.21, 0.003, 0.15, 'paper', tint, [0.25, a, 0]); p.box(px, 0.02, pz + 0.07, 0.21, 0.003, 0.15, 'paper', tint, [-0.25, a, 0]); }
    else p.box(px, 0.004 + i * 0.0006, pz, 0.21, 0.003, 0.29, 'paper', tint, [0, a, 0]);
    if (drnd() < 0.25) p.box(px, 0.005 + i * 0.0006, pz, 0.15, 0.002, 0.01, 'blackMatte', 0x333333, [0, a, 0]); // printed line
  }
  return p;
}

// ------------------------------------------------------------- vehicles --
// Side profile -> extruded body. Profile points are (s, y) with s = forward.
function arcPts(out, cx, cy, r, a0, a1, n = 8) {
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
}
function extrudeProfile(key, pts, width, bevel = 0.035) {
  return cached(key, () => {
    const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
    const depth = Math.max(0.01, width - bevel * 2);
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.7, bevelSegments: 1, curveSegments: 4 });
    // shape (s, y) extruded along +z  ->  local (x = z - depth/2, y, z = -s)
    g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, -depth / 2, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
    g.computeVertexNormals();
    return g;
  });
}
function wheelArchBottom(pts, s0, s1, wheels, sill, r, cy) {
  // bottom edge from s0 (rear) to s1 (front) with arches over the wheels
  pts.push([s0, sill]);
  for (const w of wheels) { pts.push([w - r, sill]); arcPts(pts, w, cy, r, Math.PI, 0, 6); pts.push([w + r, sill]); }
  pts.push([s1, sill]);
}
const SEDAN = (() => {
  const body = [];
  wheelArchBottom(body, -2.14, 2.12, [-1.4, 1.4], 0.3, 0.43, 0.34);
  body.push([2.21, 0.38], [2.24, 0.52], [2.23, 0.64], [2.17, 0.73], [2.0, 0.78], [1.5, 0.84], [0.95, 0.9], [-0.2, 0.93], [-1.42, 0.94], [-1.62, 0.94], [-2.05, 0.91], [-2.18, 0.84], [-2.23, 0.7], [-2.23, 0.5], [-2.2, 0.38]);
  const glass = [[0.98, 0.9], [0.62, 1.08], [0.12, 1.37], [-0.35, 1.41], [-0.88, 1.39], [-1.22, 1.16], [-1.47, 0.94], [-0.2, 0.93]];
  const roof = [[0.14, 1.36], [-0.35, 1.415], [-0.9, 1.385], [-0.88, 1.35], [-0.35, 1.375], [0.16, 1.32]];
  return { body, glass, roof };
})();
const VAN = (() => {
  const body = [];
  wheelArchBottom(body, -2.46, 2.4, [-1.6, 1.6], 0.32, 0.46, 0.36);
  body.push([2.5, 0.42], [2.53, 0.62], [2.5, 0.86], [2.35, 0.98], [1.95, 1.08], [1.45, 1.9], [1.2, 2.04], [-2.3, 2.08], [-2.48, 2.0], [-2.52, 1.2], [-2.52, 0.5]);
  return { body };
})();
function tyre(p, x, y, z, r, w, rimMat, rimTint, burnt, flat) {
  const ry = flat ? r * 0.8 : r;
  if (!burnt) {
    p.cylX(x, y - (r - ry), z, r, w, 'rubber', 0x141414, 18);
    p.torus(x + Math.sign(x) * w * 0.5, y - (r - ry), z, r * 0.84, r * 0.14, 'rubber', 0x1a1a1a, [0, Math.PI / 2, 0], 5, 18);
  }
  const hx = x + Math.sign(x) * (w * 0.5 + 0.005);
  p.cylX(hx - Math.sign(x) * 0.02, burnt ? r * 0.72 : y, z, r * 0.62, 0.06, rimMat, rimTint, 14);
  p.cylX(hx + Math.sign(x) * 0.012, burnt ? r * 0.72 : y, z, r * 0.2, 0.03, rimMat, rimTint, 10);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5 + (x > 0 ? 0.3 : 0);
    p.box(hx, (burnt ? r * 0.72 : y) + Math.sin(a) * r * 0.4, z + Math.cos(a) * r * 0.4, 0.02, r * 0.14, r * 0.42, rimMat, rimTint, [a, 0, 0]);
  }
}
export function car(L, x, y, z, ry = 0, opts = {}) {
  const color = opts.color ?? pickC(CAR_COLORS);
  const p = prop(L, x, y, z, ry);
  const burnt = !!opts.burnt;
  const police = !!opts.police, taxi = !!opts.taxi;
  const dmg = opts.damaged ?? (!burnt && drnd() < 0.35);
  const body = burnt ? 'rust' : 'carPaint';
  const bc = burnt ? dpick([0x3a3430, 0x2a2622, 0x4a3a30]) : police ? 0x14171d : color;
  const lift = burnt ? -0.1 : 0; // burnt cars sit on their rims
  const pb = prop(L, x, y, z, ry);
  pb.base = p.base.clone().multiply(trs(0, lift, 0, burnt ? 0.012 : 0, 0, burnt ? 0.02 : 0));
  pb.box(0, 0.35, 0, 1.6, 0.14, 3.9, 'blackMatte', 0x333333); // floor pan
  pb.geo(extrudeProfile('sedanBody', SEDAN.body, 1.78), body, 0, 0, 0, [0, 0, 0], [1, 1, 1], bc);
  // cabin
  if (burnt) {
    pb.geo(extrudeProfile('sedanRoof', SEDAN.roof, 1.56, 0.012), body, 0, 0, 0, [0, 0, 0], [1, 1, 1], bc);
    for (const sx of [-1, 1]) {
      pb.tube(sx * 0.76, 0.92, -0.97, sx * 0.72, 1.36, -0.13, 0.035, body, bc);
      pb.box(sx * 0.76, 1.15, 0.36, 0.06, 0.46, 0.1, body, bc);
      pb.tube(sx * 0.76, 0.93, 1.46, sx * 0.72, 1.37, 0.88, 0.05, body, bc);
    }
    // charred seat frames
    for (const sz of [-0.2, 0.75]) { pb.box(0, 0.6, sz, 1.3, 0.06, 0.5, 'metalDark', 0x222222); pb.box(0, 0.85, sz + 0.25, 1.3, 0.45, 0.04, 'metalDark', 0x1a1a1a, [-0.15, 0, 0]); }
    pb.box(0, 0.85, -0.85, 1.5, 0.18, 0.3, 'blackMatte');
    pb.torus(-0.38, 0.95, -0.62, 0.17, 0.015, 'metalDark', null, [1.2, 0, 0], 4, 12);
  } else {
    pb.geo(extrudeProfile('sedanGlass', SEDAN.glass, 1.5, 0.02), dmg && drnd() < 0.3 ? 'blackMatte' : 'glassDirty', 0, 0, 0, [0, 0, 0], [1, 1, 1], 0x1c2226);
    pb.geo(extrudeProfile('sedanRoof', SEDAN.roof, 1.56, 0.012), body, 0, 0, 0, [0, 0, 0], [1, 1, 1], bc);
    for (const sx of [-1, 1]) {
      pb.tube(sx * 0.765, 0.91, -0.98, sx * 0.735, 1.36, -0.13, 0.035, body, bc); // A
      pb.box(sx * 0.768, 1.15, 0.36, 0.05, 0.46, 0.09, body, bc); // B
      pb.tube(sx * 0.765, 0.93, 1.46, sx * 0.735, 1.37, 0.88, 0.055, body, bc); // C
      pb.box(sx * 0.77, 0.925, 0.25, 0.03, 0.03, 2.4, 'blackMatte'); // window seal
    }
    // interior: seats, dash, wheel
    const seat = dpick([0x2a2622, 0x3a3430, 0x4a4238, 0x1e1e22]);
    for (const sx of [-0.4, 0.4]) {
      pb.rbox(sx, 0.62, -0.12, 0.5, 0.14, 0.5, 0.04, 'plastic', seat);
      pb.rbox(sx, 0.92, 0.14, 0.48, 0.58, 0.14, 0.05, 'plastic', seat, [-0.2, 0, 0]);
      pb.rbox(sx, 1.24, 0.2, 0.24, 0.14, 0.1, 0.04, 'plastic', seat);
    }
    pb.rbox(0, 0.64, 0.95, 1.4, 0.14, 0.5, 0.04, 'plastic', seat);
    pb.rbox(0, 0.9, 1.22, 1.4, 0.5, 0.14, 0.05, 'plastic', seat, [-0.2, 0, 0]);
    pb.rbox(0, 0.86, -0.82, 1.48, 0.2, 0.36, 0.05, 'plastic', 0x1a1a1a);
    pb.torus(-0.4, 0.95, -0.6, 0.17, 0.018, 'plastic', 0x151515, [1.15, 0, 0], 5, 14);
    pb.tube(-0.4, 0.95, -0.6, -0.4, 0.86, -0.78, 0.025, 'plastic', 0x151515);
    if (dmg) pb.box(0, 1.15, -0.55, 1.2, 0.3, 0.005, 'plastic', 0xd8d8d0, [0.5, 0, 0]); // deflated airbag / tarp
  }
  // wheels
  const rim = burnt ? 'rust' : 'chrome', rimT = burnt ? 0x3a2a20 : dpick([0x9a9a9a, 0x5a5a5a, 0xb0b0b0]);
  const flat = !burnt && dmg && drnd() < 0.5 ? Math.floor(drnd() * 4) : -1;
  let wi = 0;
  for (const sz of [-1.4, 1.4]) for (const sx of [-0.8, 0.8]) tyre(pb, sx, 0.34, sz, 0.33, 0.22, rim, rimT, burnt, wi++ === flat);
  // bumpers, grille, lights, plates, mirrors, handles
  const trim = burnt ? 'metalDark' : 'plastic';
  pb.rbox(0, 0.46, -2.22, 1.8, 0.2, 0.14, 0.05, trim, burnt ? 0x2a2622 : 0x1c1c1c);
  pb.rbox(0, 0.48, 2.22, 1.8, 0.2, 0.14, 0.05, trim, burnt ? 0x2a2622 : 0x1c1c1c);
  pb.box(0, 0.64, -2.235, 0.7, 0.12, 0.03, 'blackMatte');
  if (!burnt) {
    for (let i = 0; i < 3; i++) pb.box(0, 0.6 + i * 0.035, -2.25, 0.66, 0.012, 0.01, 'chrome', 0x9a9a9a);
    const hl = opts.lights ? 0xfff0d0 : 0x3a3830;
    for (const sx of [-1, 1]) {
      pb.rbox(sx * 0.62, 0.66, -2.2, 0.36, 0.13, 0.08, 0.03, 'plastic', 0xd8d8d8);
      pb.glow(sx * 0.62, 0.66, -2.245, 0.3, 0.09, 0.01, sx > 0 && dmg ? 0x080808 : hl);
      pb.glow(sx * 0.66, 0.74, 2.225, 0.3, 0.11, 0.012, opts.lights ? 0xff2a18 : 0x4a0a06);
      pb.glow(sx * 0.66, 0.66, 2.225, 0.3, 0.04, 0.012, 0x5a3a10);
      pb.rbox(sx * 0.94, 1.0, -0.86, 0.08, 0.1, 0.16, 0.03, body, bc); // mirror
      pb.box(sx * 0.94, 1.0, -0.94, 0.06, 0.08, 0.005, 'chrome');
      for (const sz of [-0.28, 0.72]) pb.box(sx * 0.9, 0.84, sz, 0.02, 0.025, 0.14, 'chrome', 0x9a9a9a);
      for (const sz of [-0.98, 0.36, 1.42]) pb.box(sx * 0.892, 0.62, sz, 0.004, 0.5, 0.006, 'blackMatte'); // door seams
    }
    pb.box(0, 0.47, -2.3, 0.5, 0.11, 0.01, 'paintedWhite', 0xe0dcc8);
    pb.box(0, 0.62, 2.235, 0.5, 0.11, 0.01, 'paintedWhite', 0xe0dcc8);
    if (opts.lights) {
      const lp = p.light(0, 0.7, -3.2, 0xfff0d0, 8, 12, { flicker: 0 });
      p.beam(0.62, 0.66, -2.3, 0, -0.08, -1, 9, 1.4, 0xfff0d0, lp, 0.6);
      p.beam(-0.62, 0.66, -2.3, 0, -0.08, -1, 9, 1.4, 0xfff0d0, lp, 0.6);
    }
  }
  if (dmg && !burnt) {
    // crumpled corner + buckled hood
    const sx = drnd() < 0.5 ? -1 : 1;
    pb.rbox(sx * 0.5, 0.8, -1.7, 0.8, 0.06, 0.9, 0.02, body, bc, [0.25, 0.1 * sx, 0.12 * sx]);
    pb.box(sx * 0.88, 0.55, -1.9, 0.05, 0.3, 0.5, 'metalDark', 0x2a2a2a, [0, 0.3 * sx, 0]);
  }
  if (police) {
    for (const sx of [-1, 1]) pb.box(sx * 0.893, 0.62, 0.2, 0.006, 0.44, 2.2, 'carPaint', 0xe8e8e8); // white doors
    pb.box(0, 1.435, 0.25, 1.1, 0.05, 0.28, 'metalDark');
    pb.rbox(0, 1.49, 0.25, 1.2, 0.1, 0.26, 0.04, 'plastic', 0x1a1a1a);
    pb.glow(-0.3, 1.5, 0.25, 0.5, 0.08, 0.2, opts.lights === false ? 0x3a0808 : 0xff2010);
    pb.glow(0.3, 1.5, 0.25, 0.5, 0.08, 0.2, opts.lights === false ? 0x081030 : 0x2050ff);
    pb.rbox(0, 0.62, -2.36, 1.2, 0.36, 0.08, 0.03, 'metalDark', 0x222222); // push bar
    for (const sx of [-0.45, 0.45]) pb.box(sx, 0.62, -2.3, 0.06, 0.4, 0.14, 'metalDark', 0x222222);
    pb.tube(-0.7, 1.42, 0.9, -0.72, 2.2, 0.95, 0.006, 'blackMatte'); // antenna
  }
  if (taxi) {
    pb.rbox(0, 1.5, 0.25, 0.6, 0.18, 0.2, 0.04, 'plastic', 0xe8d030);
    pb.glow(0, 1.5, 0.25, 0.5, 0.1, 0.21, 0x6a5a20);
    for (const sx of [-1, 1]) for (let i = 0; i < 10; i++) pb.box(sx * 0.892, 0.82, -0.9 + i * 0.2, 0.004, 0.06, 0.1, 'blackMatte', i % 2 ? 0x111111 : 0xe8e8e0);
  }
  if (burnt) {
    // soot + melted tyres
    pb.box(0, 0.02, 0, 2.2, 0.01, 4.6, 'blackMatte', 0x0a0a0a);
    for (const sz of [-1.4, 1.4]) for (const sx of [-0.8, 0.8]) pb.cyl(sx, 0.03, sz, 0.3, 0.05, 'blackMatte', 0x111111, null, 10);
  }
  p.col(0, 0.72, 0, 1.8, 1.0, 4.4, 'metal');
  p.col(0, 1.2, 0.25, 1.6, 0.5, 2.2, 'metal');
  return p;
}
export const policeCar = (L, x, y, z, ry = 0, opts = {}) => car(L, x, y, z, ry, { ...opts, police: true });
export const taxi = (L, x, y, z, ry = 0, opts = {}) => car(L, x, y, z, ry, { color: 0xd8b020, ...opts, taxi: true });
export function van(L, x, y, z, ry = 0, color = 0xd8d4c8) {
  const p = prop(L, x, y, z, ry);
  p.geo(extrudeProfile('vanBody', VAN.body, 1.98, 0.05), 'carPaint', 0, 0, 0, [0, 0, 0], [1, 1, 1], color);
  p.box(0, 0.38, 0, 1.7, 0.14, 4.6, 'metalDark', 0x333333);
  // windshield (sloped) + cab side windows
  p.box(0, 1.5, -1.73, 1.72, 0.92, 0.03, 'glassDirty', 0x1a2024, [-0.55, 0, 0]);
  for (const sx of [-1, 1]) {
    p.box(sx * 0.995, 1.55, -1.05, 0.02, 0.5, 0.85, 'glassDirty', 0x1a2024);
    p.box(sx * 1.0, 1.1, -0.55, 0.01, 1.2, 0.01, 'blackMatte'); // door seam
    p.box(sx * 1.0, 1.1, 0.35, 0.01, 1.4, 0.01, 'blackMatte'); // sliding door
    p.box(sx * 1.0, 1.72, 0.9, 0.012, 0.035, 2.6, 'blackMatte'); // slide rail
    p.box(sx * 1.02, 1.15, -0.62, 0.03, 0.04, 0.16, 'chrome', 0x9a9a9a);
    p.rbox(sx * 1.1, 1.45, -1.3, 0.1, 0.22, 0.14, 0.03, 'plastic', 0x1a1a1a);
  }
  for (const sx of [-1, 1]) p.box(sx * 0.45, 1.25, 2.51, 0.02, 1.5, 0.02, 'blackMatte');
  p.box(0, 1.25, 2.52, 0.02, 1.5, 0.02, 'blackMatte');
  for (const sx of [-0.5, 0.5]) p.box(sx, 1.65, 2.52, 0.7, 0.4, 0.01, 'glassDirty', 0x1a2024);
  // interior seats (visible through the windshield)
  for (const sx of [-0.45, 0.45]) { p.rbox(sx, 0.8, -0.9, 0.5, 0.14, 0.5, 0.04, 'plastic', 0x2a2a2a); p.rbox(sx, 1.15, -0.65, 0.48, 0.6, 0.14, 0.05, 'plastic', 0x2a2a2a, [-0.15, 0, 0]); }
  p.rbox(0, 1.15, -1.55, 1.8, 0.2, 0.3, 0.05, 'plastic', 0x1a1a1a);
  for (const sz of [-1.6, 1.6]) for (const sx of [-0.88, 0.88]) tyre(p, sx, 0.36, sz, 0.35, 0.24, 'metalClean', 0x9a9a9a, false, false);
  p.rbox(0, 0.52, -2.5, 1.98, 0.22, 0.14, 0.05, 'plastic', 0x1c1c1c);
  p.rbox(0, 0.52, 2.52, 1.98, 0.22, 0.14, 0.05, 'plastic', 0x1c1c1c);
  p.box(0, 0.78, -2.53, 0.9, 0.16, 0.02, 'blackMatte');
  for (const sx of [-1, 1]) { p.glow(sx * 0.72, 0.8, -2.53, 0.3, 0.12, 0.01, 0x3a3830); p.glow(sx * 0.9, 1.1, 2.53, 0.12, 0.35, 0.01, 0x4a0a06); }
  p.box(0, 0.5, 2.6, 0.5, 0.11, 0.01, 'paintedWhite', 0xe0dcc8);
  if (drnd() < 0.5) p.box(0.998, 1.25, 0.6, 0.004, 0.5, 1.6, 'paintedBlue', dpick([0x2a4a8a, 0x8a2a1a, 0x2a6a3a])); // company livery
  p.col(0, 1.15, 0, 2.0, 2.0, 5.0, 'metal');
  return p;
}
export function truck(L, x, y, z, ry = 0, color = 0xc8c4b8) {
  const p = prop(L, x, y, z, ry);
  const cab = color === 0x3a4a2a ? 0x3a4a2a : dpick([0x7a1a14, 0x1a2a4a, 0xd8d4c8, 0x2a2a2a]);
  // cargo box
  p.rbox(0, 2.0, 1.5, 2.46, 2.6, 7.4, 0.04, 'paintedWhite', color);
  for (let i = 0; i < 12; i++) for (const sx of [-1, 1]) p.box(sx * 1.235, 2.0, -2.0 + i * 0.64, 0.02, 2.5, 0.05, 'paintedWhite', new THREE.Color(color).multiplyScalar(0.85).getHex());
  p.box(0, 3.31, 1.5, 2.48, 0.04, 7.42, 'metalDark', 0x777777);
  p.box(0, 0.7, 1.5, 2.46, 0.12, 7.42, 'metalDark', 0x444444);
  // roll-up rear door
  for (let i = 0; i < 12; i++) p.box(0, 0.85 + i * 0.2, 5.21, 2.2, 0.18, 0.02, 'metal', 0xb8b8b0);
  p.box(0, 0.75, 5.24, 2.2, 0.05, 0.05, 'metalDark');
  p.box(0, 0.55, 5.1, 2.4, 0.1, 0.35, 'metalDark', 0x3a3a3a); // bumper
  for (const sx of [-1, 1]) p.glow(sx * 1.05, 0.55, 5.28, 0.18, 0.08, 0.01, 0x4a0a06);
  // chassis + cab
  p.box(0, 0.75, -0.5, 1.2, 0.28, 10, 'metalDark', 0x222222);
  p.rbox(0, 1.55, -3.35, 2.36, 1.9, 2.1, 0.12, 'carPaint', cab);
  p.rbox(0, 0.95, -4.45, 2.2, 0.7, 0.25, 0.06, 'metalDark', 0x3a3a3a); // bumper/grille
  for (let i = 0; i < 5; i++) p.box(0, 1.2 + i * 0.07, -4.41, 1.2, 0.03, 0.02, 'chrome', 0x9a9a9a);
  p.box(0, 2.0, -4.41, 2.0, 0.85, 0.04, 'glassDirty', 0x1a2024, [-0.08, 0, 0]);
  for (const sx of [-1, 1]) {
    p.box(sx * 1.185, 2.05, -3.2, 0.02, 0.7, 1.1, 'glassDirty', 0x1a2024);
    p.glow(sx * 0.85, 1.2, -4.42, 0.3, 0.16, 0.02, 0x3a3830);
    p.tube(sx * 1.2, 2.3, -3.9, sx * 1.45, 2.3, -3.9, 0.02, 'metalDark');
    p.rbox(sx * 1.47, 2.1, -3.9, 0.08, 0.4, 0.2, 0.02, 'plastic', 0x1a1a1a);
    p.cylX(sx * 1.1, 0.95, -2.6, 0.25, 0.5, 'metalClean', 0x9a9a9a, 12); // fuel tank
    p.box(sx * 1.2, 0.9, -3.8, 0.05, 0.5, 0.3, 'metalDark'); // step
  }
  for (const sz of [-3.3, 0.5, 3.8]) for (const sx of [-1.02, 1.02]) tyre(p, sx, 0.5, sz, 0.5, 0.3, 'metalClean', 0x8a8a8a, false, false);
  for (const sz of [0.5, 3.8]) for (const sx of [-0.7, 0.7]) p.cylX(sx, 0.5, sz, 0.49, 0.28, 'rubber', 0x141414, 16);
  p.col(0, 1.9, 1.5, 2.5, 2.8, 7.5, 'metal');
  p.col(0, 1.3, -3.3, 2.4, 2.3, 2.2, 'metal');
  return p;
}

// Big vehicles --------------------------------------------------------------
// City bus (12 m). opts: {color, lit, burnt, number}
export function bus(L, x, y, z, ry = 0, opts = {}) {
  const p = prop(L, x, y, z, ry);
  const burnt = !!opts.burnt;
  const body = burnt ? 'rust' : 'carPaint', c = burnt ? 0x3a3430 : (opts.color ?? dpick([0xd8d4c8, 0xc8b030, 0x2a5a8a]));
  const len = 12, w = 2.55;
  p.rbox(0, 1.75, 0, w, 2.7, len, 0.14, body, c);
  p.box(0, 0.55, 0, w - 0.3, 0.3, len - 1, 'metalDark', 0x222222);
  // window band + pillars
  for (const sx of [-1, 1]) {
    p.box(sx * (w / 2 + 0.004), 2.2, 0.3, 0.01, 1.05, len - 2.2, burnt ? 'blackMatte' : 'glassDirty', 0x141a1e);
    for (let i = 0; i < 9; i++) p.box(sx * (w / 2 + 0.008), 2.2, -4.4 + i * 1.25, 0.02, 1.08, 0.1, body, c);
    p.box(sx * (w / 2 + 0.006), 1.35, 0, 0.012, 0.2, len - 0.4, body, burnt ? 0x2a2622 : 0x8a1a14); // livery stripe
  }
  // doors (right side)
  for (const dz of [-4.6, 0.6]) p.box(w / 2 + 0.01, 1.55, dz, 0.02, 2.3, 1.2, burnt ? 'blackMatte' : 'glassDirty', 0x1a2024);
  // front: big windshield, destination sign, lights
  p.box(0, 2.05, -len / 2 - 0.005, w - 0.2, 1.5, 0.02, burnt ? 'blackMatte' : 'glassDirty', 0x1a2024);
  p.box(0, 2.98, -len / 2 - 0.01, w - 0.5, 0.26, 0.02, 'blackMatte');
  if (!burnt) {
    p.glow(0, 2.98, -len / 2 - 0.02, w - 0.6, 0.18, 0.01, opts.lit ? 0xffa020 : 0x3a2808);
    for (const sx of [-1, 1]) { p.glow(sx * 0.95, 0.75, -len / 2 - 0.02, 0.28, 0.14, 0.01, 0x3a3830); p.glow(sx * 1.0, 0.9, len / 2 + 0.02, 0.2, 0.3, 0.01, 0x4a0a06); }
    // seats inside
    for (let i = 0; i < 8; i++) for (const sx of [-0.8, 0.8]) p.rbox(sx, 1.1, -3.5 + i * 1.0, 0.8, 0.5, 0.18, 0.05, 'plastic', 0x2a3a6a, [-0.15, 0, 0]);
  }
  p.rbox(0, 0.62, -len / 2 - 0.05, w, 0.3, 0.2, 0.06, 'plastic', 0x1a1a1a);
  p.box(0, 3.15, 1.5, 1.6, 0.3, 2.5, 'metal', 0x9a9a98); // roof AC pod
  for (const sz of [-3.5, 3.2]) for (const sx of [-1.05, 1.05]) tyre(p, sx, 0.5, sz, 0.5, 0.3, burnt ? 'rust' : 'metalClean', 0x9a9a9a, burnt, false);
  p.col(0, 1.75, 0, w, 3.1, len, 'metal');
  return p;
}
// Box-body ambulance.
export function ambulance(L, x, y, z, ry = 0, opts = {}) {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 1.75, 0.8, 2.3, 2.3, 4.0, 0.08, 'carPaint', 0xe8e8e0);
  for (const sx of [-1, 1]) {
    p.box(sx * 1.155, 1.3, 0.8, 0.01, 0.25, 4.0, 'carPaint', 0xb02018);
    p.box(sx * 1.156, 2.2, 0.4, 0.01, 0.5, 0.14, 'carPaint', 0xb02018); p.box(sx * 1.156, 2.2, 0.4, 0.01, 0.14, 0.5, 'carPaint', 0xb02018);
  }
  p.rbox(0, 1.25, -1.9, 2.1, 1.5, 1.6, 0.12, 'carPaint', 0xe8e8e0);
  p.box(0, 1.65, -2.66, 1.8, 0.7, 0.03, 'glassDirty', 0x1a2024, [-0.3, 0, 0]);
  for (const sx of [-1, 1]) p.box(sx * 1.05, 1.62, -1.9, 0.02, 0.5, 0.8, 'glassDirty', 0x1a2024);
  p.rbox(0, 0.6, -2.72, 2.1, 0.25, 0.14, 0.05, 'plastic', 0x1a1a1a);
  p.box(0, 3.0, -0.95, 1.8, 0.12, 0.3, 'plastic', 0x1a1a1a);
  const on = opts.lights ?? false;
  p.glow(-0.45, 3.02, -0.95, 0.7, 0.1, 0.26, on ? 0xff2010 : 0x3a0808);
  p.glow(0.45, 3.02, -0.95, 0.7, 0.1, 0.26, on ? 0x2050ff : 0x081030);
  for (const sx of [-1, 1]) { p.glow(sx * 1.1, 2.8, 2.81, 0.12, 0.12, 0.01, on ? 0xff2010 : 0x3a0808); p.glow(sx * 0.8, 0.9, -2.8, 0.26, 0.12, 0.01, 0x3a3830); }
  // rear doors (one ajar)
  p.box(-0.55, 1.7, 2.82, 1.05, 2.0, 0.04, 'carPaint', 0xe0e0d8);
  p.box(0.9, 1.7, 3.2, 0.04, 2.0, 1.0, 'carPaint', 0xe0e0d8, [0, -0.5, 0]);
  p.box(0, 0.6, 2.9, 2.2, 0.12, 0.3, 'metalDark');
  for (const sz of [-1.9, 1.6]) for (const sx of [-0.98, 0.98]) tyre(p, sx, 0.4, sz, 0.4, 0.26, 'metalClean', 0x9a9a9a, false, false);
  p.col(0, 1.5, 0.3, 2.3, 3.0, 5.4, 'metal');
  return p;
}
// Articulated truck: tractor + 12 m trailer (the trailer roof is walkable).
export function semi(L, x, y, z, ry = 0, opts = {}) {
  const p = prop(L, x, y, z, ry);
  const cab = opts.color ?? dpick([0x8a1a14, 0x1a2a4a, 0xd8d4c8, 0x2a4a2a]);
  const tl = opts.trailerLen ?? 12;
  const tz = 2.2 + tl / 2; // trailer centre
  // tractor (conventional hood), faces -Z
  p.box(0, 0.9, -1.2, 1.1, 0.3, 6.0, 'metalDark', 0x222222);
  p.rbox(0, 1.35, -3.5, 2.0, 1.1, 1.8, 0.12, 'carPaint', cab); // hood
  p.rbox(0, 1.45, -4.42, 1.6, 1.0, 0.1, 0.03, 'chrome', 0xa0a0a0); // grille
  for (let i = 0; i < 8; i++) p.box(0, 1.05 + i * 0.1, -4.48, 1.4, 0.03, 0.02, 'blackMatte');
  p.rbox(0, 2.2, -1.9, 2.45, 2.4, 1.6, 0.14, 'carPaint', cab); // cab
  p.rbox(0, 3.1, -0.7, 2.4, 1.2, 1.0, 0.14, 'carPaint', cab); // sleeper top
  p.box(0, 2.6, -2.72, 2.1, 0.8, 0.03, 'glassDirty', 0x1a2024, [-0.15, 0, 0]);
  for (const sx of [-1, 1]) {
    p.box(sx * 1.23, 2.55, -2.0, 0.02, 0.6, 0.9, 'glassDirty', 0x1a2024);
    p.cyl(sx * 1.1, 3.2, -1.1, 0.09, 2.6, 'chrome', 0xb0b0b0, null, 10); // stacks
    p.cylX(sx * 1.05, 1.0, -1.5, 0.32, 0.7, 'chrome', 0xc0c0c0, 14); // fuel tanks
    p.glow(sx * 0.85, 1.25, -4.45, 0.25, 0.14, 0.02, 0x3a3830);
    p.rbox(sx * 1.35, 2.7, -2.5, 0.08, 0.45, 0.2, 0.02, 'chrome');
  }
  p.rbox(0, 0.85, -4.45, 2.3, 0.3, 0.2, 0.05, 'chrome', 0x9a9a9a);
  p.box(0, 1.2, 1.0, 1.2, 0.1, 1.2, 'metalDark', 0x2a2a2a); // fifth wheel
  for (const sz of [-3.5, 0.2, 1.5]) for (const sx of [-1.05, 1.05]) tyre(p, sx, 0.5, sz, 0.5, 0.3, 'metalClean', 0x9a9a9a, false, false);
  // trailer
  if (opts.trailer !== false) {
    const tc = opts.trailerColor ?? dpick([0xd8d8d0, 0xc8c4b8, 0x8a8a86]);
    p.rbox(0, 2.55, tz, 2.55, 2.7, tl, 0.05, 'paintedWhite', tc);
    for (let i = 0; i < Math.floor(tl / 0.6); i++) for (const sx of [-1, 1]) p.box(sx * 1.28, 2.55, tz - tl / 2 + 0.3 + i * 0.6, 0.02, 2.6, 0.04, 'paintedWhite', new THREE.Color(tc).multiplyScalar(0.82).getHex());
    p.box(0, 1.15, tz, 2.4, 0.2, tl, 'metalDark', 0x333333);
    for (const sx of [-1, 1]) p.box(sx * 1.2, 0.9, tz + 1, 0.05, 0.4, tl - 6, 'paintedRed', 0xb02018); // side guard
    for (const sx of [-0.6, 0.6]) p.box(sx, 0.6, tz - tl / 2 + 3, 0.08, 0.9, 0.08, 'metalDark'); // landing legs
    for (const sz of [tz + tl / 2 - 2.4, tz + tl / 2 - 1.2]) for (const sx of [-1.05, 1.05]) tyre(p, sx, 0.5, sz, 0.5, 0.3, 'metalClean', 0x9a9a9a, false, false);
    for (const sx of [-1, 1]) p.box(sx * 0.62, 2.55, tz + tl / 2 + 0.02, 1.2, 2.6, 0.03, 'metal', 0xb8b8b0);
    for (let i = 0; i < 4; i++) p.box(0, 1.5 + i * 0.7, tz + tl / 2 + 0.05, 0.04, 0.06, 0.04, 'chrome');
    for (const sx of [-1, 1]) p.glow(sx * 1.1, 1.0, tz + tl / 2 + 0.06, 0.16, 0.1, 0.01, 0x4a0a06);
    p.col(0, 2.55, tz, 2.55, 2.7, tl, 'metal');
    p.col(0, 1.05, tz, 2.4, 0.6, tl, 'metal', F_SOLID | F_SHOOT);
  }
  p.col(0, 1.4, -3.5, 2.0, 1.4, 1.8, 'metal');
  p.col(0, 2.2, -1.4, 2.45, 3.0, 2.6, 'metal');
  p.col(0, 0.8, 1.0, 2.2, 1.0, 2.2, 'metal', F_SOLID | F_SHOOT);
  return p;
}
// Airport / road fuel tanker. opts: {color, pump:true (pump unit + hose reel at the rear)}
export function fuelTanker(L, x, y, z, ry = 0, opts = {}) {
  const p = prop(L, x, y, z, ry);
  const c = opts.color ?? 0xd8d4c8;
  p.box(0, 0.85, 0.3, 1.1, 0.3, 8.5, 'metalDark', 0x222222);
  p.rbox(0, 1.6, -3.2, 2.4, 2.0, 1.9, 0.14, 'carPaint', opts.cabColor ?? 0xc8a020);
  p.box(0, 2.1, -4.16, 2.1, 0.8, 0.03, 'glassDirty', 0x1a2024, [-0.1, 0, 0]);
  for (const sx of [-1, 1]) { p.box(sx * 1.205, 2.1, -3.2, 0.02, 0.6, 1.0, 'glassDirty', 0x1a2024); p.glow(sx * 0.85, 1.1, -4.17, 0.28, 0.14, 0.02, 0x3a3830); }
  p.rbox(0, 0.85, -4.2, 2.3, 0.3, 0.2, 0.05, 'metalDark', 0x333333);
  p.glow(0, 2.68, -3.2, 0.3, 0.12, 0.3, 0xc07010); // amber beacon
  // elliptical tank
  p.cyl(0, 2.05, 1.2, 1.2, 6.6, 'metalClean', c, [Math.PI / 2, 0, 0], 20);
  for (const sz of [-2.1, 4.5]) p.sph(0, 2.05, sz, 1.2, 'metalClean', c, [1, 1, 0.25], 16);
  for (let i = 0; i < 4; i++) p.torus(0, 2.05, -1.2 + i * 1.6, 1.21, 0.03, 'metalClean', 0xa0a0a0, [0, 0, 0], 4, 22);
  p.box(0, 3.3, 1.2, 0.6, 0.06, 6.0, 'diamond'); // catwalk
  for (let i = 0; i < 3; i++) p.cyl(0, 3.3, -0.6 + i * 1.8, 0.22, 0.12, 'metalDark', null, null, 12); // hatches
  for (const sx of [-1, 1]) { p.box(sx * 0.35, 3.62, 1.2, 0.03, 0.03, 6.0, 'paintedYellow', 0xd8b020); for (let i = 0; i < 5; i++) p.box(sx * 0.35, 3.47, -1.5 + i * 1.35, 0.03, 0.3, 0.03, 'paintedYellow', 0xd8b020); }
  for (const sx of [-1, 1]) { p.box(sx * 1.21, 2.0, 1.4, 0.01, 0.35, 0.6, 'paintedRed', 0xc02018); p.box(sx * 1.212, 2.0, 1.4, 0.005, 0.12, 0.35, 'paintedWhite', 0xe8e8e0); }
  if (opts.pump !== false) {
    p.box(0, 1.35, 4.85, 2.3, 1.0, 0.8, 'metal', 0x8a8a86);
    p.cylX(0, 1.45, 4.9, 0.38, 1.4, 'paintedRed', 0x9a1a14, 16); // hose reel
    p.torus(0, 1.45, 4.9, 0.3, 0.05, 'rubber', 0x151515, [0, Math.PI / 2, 0], 6, 16);
    p.box(0.8, 1.6, 5.26, 0.4, 0.3, 0.02, 'blackMatte');
    p.glow(0.72, 1.62, 5.28, 0.08, 0.08, 0.01, opts.pumpOn ? 0x30ff60 : 0x3a0808);
    p.glow(0.88, 1.62, 5.28, 0.08, 0.08, 0.01, opts.pumpOn ? 0x103a10 : 0xff2010);
    for (let i = 0; i < 6; i++) p.tube(-0.9 + i * 0.1, 0.9, 5.1, -0.8 + i * 0.12, 0.05, 5.8 + i * 0.25, 0.04, 'rubber', 0x151515);
  }
  for (const sz of [-3.2, 2.6, 3.9]) for (const sx of [-1.02, 1.02]) tyre(p, sx, 0.5, sz, 0.5, 0.3, 'metalClean', 0x9a9a9a, false, false);
  p.col(0, 1.4, -3.2, 2.4, 2.4, 1.9, 'metal');
  p.col(0, 2.0, 1.4, 2.4, 2.6, 7.2, 'metal');
  if (opts.pump !== false) p.col(0, 1.3, 4.85, 2.3, 1.2, 0.8, 'metal');
  return p;
}

// ------------------------------------------------------- street furniture --
export function streetLight(L, x, y, z, ry = 0, opts = {}) {
  const p = prop(L, x, y, z, ry);
  p.frustum(0, 0.25, 0, 0.16, 0.2, 0.5, 'metalDark', null, null, 10); // base collar
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; p.cyl(Math.cos(a) * 0.17, 0.02, Math.sin(a) * 0.17, 0.025, 0.04, 'metalDark', null, null, 6); }
  p.frustum(0, 3.4, 0, 0.065, 0.11, 5.8, 'metalDark', null, null, 10);
  p.box(0, 1.3, -0.1, 0.12, 0.3, 0.02, 'metalDark', 0x555555); // access hatch
  // curved arm
  p.tube(0, 6.1, 0, 0, 6.42, -0.45, 0.05, 'metalDark');
  p.tube(0, 6.42, -0.45, 0, 6.42, -1.1, 0.045, 'metalDark');
  // cobra-head luminaire
  p.rbox(0, 6.36, -1.35, 0.36, 0.14, 0.62, 0.06, 'metalDark', 0x4a4e52);
  const on = opts.on !== false;
  p.frustum(0, 6.26, -1.38, 0.15, 0.1, 0.08, on ? 'emissiveTint' : 'glassDirty', on ? 0xffc890 : 0x2a2a28, [0, 0, 0], 10);
  p.col(0, 3.2, 0, 0.2, 6.4, 0.2, 'metal');
  if (on) {
    const lp = new THREE.Vector3(0, 6.0, -1.35).applyMatrix4(p.base);
    const lt = L.light(lp.x, lp.y, lp.z, 0xffc070, opts.intensity ?? 30, opts.range ?? 22, { flicker: opts.flicker || 0 });
    p.beam(0, 6.2, -1.38, 0, -1, 0, 6.3, 2.6, 0xffb060, lt, 1);
  }
  return p;
}
export function trafficLight(L, x, y, z, ry = 0, opts = {}) {
  const p = prop(L, x, y, z, ry);
  p.frustum(0, 0.2, 0, 0.13, 0.16, 0.4, 'metalDark', null, null, 10);
  p.cyl(0, 2.6, 0, 0.08, 5.2, 'metalDark', null, null, 10);
  p.tube(0, 5.0, 0, 0, 5.1, -2.8, 0.06, 'metalDark');
  p.tube(0, 4.3, 0, 0, 5.05, -1.4, 0.035, 'metalDark');
  const state = opts.state ?? (drnd() < 0.6 ? 'red' : drnd() < 0.5 ? 'amber' : 'off');
  const head = (hz) => {
    p.rbox(0, 4.65, hz, 0.34, 0.98, 0.26, 0.04, 'paintedYellow', 0x3a3a18);
    p.box(0, 4.65, hz - 0.14, 0.44, 1.08, 0.02, 'blackMatte');
    const cols = [['red', 0xff2a10, 0x2a0604], ['amber', 0xffa010, 0x2a1a04], ['green', 0x30ff90, 0x04200e]];
    cols.forEach(([n, onC, offC], i) => {
      const cy = 4.95 - i * 0.3;
      p.cylZ(0, cy, hz - 0.155, 0.1, 0.02, 'emissiveTint', state === n ? onC : offC, 14);
      p.cylZ(0, cy + 0.06, hz - 0.21, 0.12, 0.12, 'blackMatte', null, 12); // visor (approx)
    });
  };
  head(-2.6);
  if (drnd() < 0.5) head(-1.2);
  // pedestrian signal + push button box on the pole
  p.rbox(0, 2.8, -0.2, 0.3, 0.32, 0.2, 0.02, 'paintedYellow', 0x3a3a18);
  p.glow(0, 2.8, -0.305, 0.2, 0.2, 0.01, state === 'red' ? 0x6a2008 : 0x0a0a0a);
  p.box(0, 1.1, -0.1, 0.12, 0.18, 0.08, 'paintedYellow', 0x6a6a20);
  if (state !== 'off') {
    const lp = p.at(0, 4.6, -2.9);
    L.light(lp.x, lp.y, lp.z, state === 'red' ? 0xff2a10 : 0xffa010, 3, 6, { flicker: 0 });
  }
  p.col(0, 2.6, 0, 0.18, 5.2, 0.18, 'metal');
  return p;
}
export function hydrant(L, x, y, z) {
  const p = prop(L, x, y, z, 0);
  const c = dpick([0xb02a1a, 0xc8a020, 0xb02a1a]);
  p.cyl(0, 0.03, 0, 0.16, 0.06, 'paintedRed', c, null, 10);
  p.cyl(0, 0.33, 0, 0.12, 0.56, 'paintedRed', c, null, 14);
  p.torus(0, 0.58, 0, 0.125, 0.02, 'paintedRed', c, [Math.PI / 2, 0, 0], 4, 14);
  p.sph(0, 0.62, 0, 0.13, 'paintedRed', c, [1, 0.8, 1], 12);
  p.cyl(0, 0.76, 0, 0.03, 0.06, 'paintedRed', c, null, 5);
  for (const [dx, dz, r] of [[1, 0, 0.055], [-1, 0, 0.055], [0, -1, 0.07]]) {
    p.tube(0, 0.46, 0, dx * 0.18, 0.46, dz * 0.18, r, 'paintedRed', c, 10);
    p.cyl(dx * 0.19, 0.46, dz * 0.19, r * 1.2, 0.03, 'paintedRed', c, [dz ? Math.PI / 2 : 0, 0, dx ? Math.PI / 2 : 0], 6);
  }
  p.tube(0.2, 0.44, 0, 0.12, 0.3, -0.12, 0.006, 'metalDark'); // chain
  p.col(0, 0.4, 0, 0.3, 0.8, 0.3, 'metal');
  return p;
}
export function mailbox(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  const c = 0x2a4a8a;
  p.rbox(0, 0.78, 0, 0.5, 0.86, 0.5, 0.02, 'paintedBlue', c);
  p.geo(halfCylGeo(14), 'paintedBlue', 0, 1.21, 0, [0, 0, Math.PI / 2], [0.5, 0.5, 0.5], c);
  p.rbox(0, 1.12, -0.255, 0.34, 0.1, 0.03, 0.01, 'paintedBlue', 0x223a70, [0.3, 0, 0]); // pull-down slot
  p.box(0, 1.05, -0.252, 0.28, 0.012, 0.01, 'blackMatte');
  p.box(0, 0.7, -0.252, 0.3, 0.2, 0.004, 'paintedWhite', 0xd8d8d0);
  p.box(0, 0.7, -0.254, 0.24, 0.05, 0.004, 'paintedRed', 0xb02a1a);
  for (const sx of [-0.2, 0.2]) for (const sz of [-0.2, 0.2]) p.box(sx, 0.18, sz, 0.05, 0.36, 0.05, 'metalDark');
  p.col(0, 0.7, 0, 0.5, 1.4, 0.5, 'metal');
  return p;
}
export function newsBox(L, x, y, z, ry = 0, color = 0xb81a1a) {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 0.62, 0, 0.45, 0.72, 0.4, 0.02, 'paintedRed', color);
  p.box(0, 1.0, 0, 0.47, 0.05, 0.42, 'paintedRed', new THREE.Color(color).multiplyScalar(0.7).getHex());
  p.box(0, 0.72, -0.201, 0.36, 0.34, 0.01, 'glassDirty', 0x303030);
  p.box(0, 0.7, -0.17, 0.32, 0.26, 0.01, 'paper', 0xd8d4c8, [-0.2, 0, 0]); // newspaper inside
  p.box(0, 0.78, -0.176, 0.26, 0.05, 0.004, 'blackMatte', 0x222222, [-0.2, 0, 0]);
  p.box(0.12, 0.93, -0.205, 0.1, 0.07, 0.02, 'metalClean'); // coin mech
  p.box(0, 0.5, -0.21, 0.2, 0.03, 0.02, 'chrome');
  p.box(0, 0.35, -0.203, 0.4, 0.1, 0.004, 'paintedWhite', 0xe8e8e0);
  for (const sx of [-0.18, 0.18]) p.box(sx, 0.13, 0, 0.04, 0.26, 0.36, 'metalDark');
  p.col(0, 0.55, 0, 0.45, 1.1, 0.4, 'metal');
  return p;
}
export function bench(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  for (let i = 0; i < 4; i++) p.rbox(0, 0.45, -0.17 + i * 0.115, 1.8, 0.035, 0.09, 0.01, 'wood', 0xa89078);
  for (let i = 0; i < 3; i++) p.rbox(0, 0.62 + i * 0.12, 0.23 + i * 0.012, 1.8, 0.09, 0.03, 0.01, 'wood', 0xa89078, [-0.1, 0, 0]);
  for (const sx of [-0.8, 0.8]) {
    p.box(sx, 0.22, -0.18, 0.05, 0.44, 0.05, 'metalDark');
    p.box(sx, 0.22, 0.18, 0.05, 0.44, 0.05, 'metalDark');
    p.box(sx, 0.42, 0, 0.05, 0.04, 0.46, 'metalDark');
    p.box(sx, 0.62, 0.23, 0.05, 0.44, 0.04, 'metalDark', null, [-0.1, 0, 0]);
    p.box(sx, 0.62, -0.1, 0.05, 0.04, 0.34, 'metalDark');
  }
  p.col(0, 0.45, 0, 1.8, 0.9, 0.5, 'wood', F_SOLID | F_SHOOT);
  return p;
}
export function vending(L, x, y, z, ry = 0, color = 0xb02a1a) {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 0.95, 0.02, 0.9, 1.9, 0.76, 0.03, 'paintedRed', color);
  p.box(-0.12, 1.1, -0.37, 0.58, 1.36, 0.02, 'metalDark', 0x1a1a1a);
  // product rows behind the glass
  for (let r = 0; r < 5; r++) for (let k = 0; k < 5; k++) p.box(-0.34 + k * 0.11, 0.55 + r * 0.26, -0.3, 0.08, 0.14, 0.08, 'plastic', dpick([0xc02020, 0x2050c0, 0xe0c020, 0x20a040, 0xe8e8e0, 0x8a4a1a]));
  for (let r = 0; r < 5; r++) p.box(-0.12, 0.47 + r * 0.26, -0.3, 0.55, 0.01, 0.2, 'metalClean');
  const lit = drnd() < 0.6;
  if (lit) p.glow(-0.12, 1.78, -0.35, 0.52, 0.02, 0.02, 0x9ab0c0);
  p.box(-0.12, 1.1, -0.385, 0.56, 1.34, 0.01, 'glassDirty', 0x303838);
  p.box(0.3, 1.25, -0.39, 0.2, 0.6, 0.02, 'metal', 0x2a2a2a);
  for (let i = 0; i < 4; i++) p.glow(0.3, 1.45 - i * 0.07, -0.402, 0.12, 0.04, 0.004, lit ? 0x406080 : 0x101418);
  p.box(0.3, 1.0, -0.4, 0.06, 0.12, 0.01, 'metalClean');
  p.box(-0.12, 0.28, -0.39, 0.5, 0.14, 0.03, 'blackMatte');
  p.box(0, 1.84, -0.365, 0.86, 0.1, 0.01, 'paintedWhite', 0xe8e8e0);
  p.col(0, 0.95, 0, 0.9, 1.9, 0.8, 'metal');
  return p;
}
export function planter(L, x, y, z, r = 0.5) {
  const p = prop(L, x, y, z, 0);
  p.frustum(0, 0.3, 0, r, r * 0.88, 0.6, 'concrete', null, null, 16);
  p.torus(0, 0.6, 0, r - 0.03, 0.04, 'concrete', 0xb8b8b0, [Math.PI / 2, 0, 0], 4, 18);
  p.cyl(0, 0.57, 0, r - 0.05, 0.02, 'dirt', 0x5a4a3a, null, 14);
  const dead = drnd() < 0.3;
  const fc = dead ? 0x4a3a22 : dpick([0x2a3a1e, 0x34421e, 0x243218]);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + drnd(), d = (i ? r * 0.45 : 0);
    p.sph(Math.cos(a) * d, 0.85 + drnd() * 0.15, Math.sin(a) * d, r * (0.45 + drnd() * 0.2), 'foliage', fc, [1, 0.8, 1], 8);
  }
  p.col(0, 0.5, 0, r * 2, 1.0, r * 2, 'concrete');
  return p;
}
export function fenceChain(L, x0, z0, x1, z1, y = 0, h = 3) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = Math.atan2(-(z1 - z0), x1 - x0);
  const p = prop(L, (x0 + x1) / 2, y, (z0 + z1) / 2, ry);
  const n = Math.max(1, Math.round(len / 2.5));
  for (let i = 0; i <= n; i++) {
    const px = -len / 2 + (len / n) * i;
    const end = i === 0 || i === n;
    p.cyl(px, h / 2, 0, end ? 0.045 : 0.035, h, 'metal', 0x8a8a86, null, 8);
    p.sph(px, h + 0.02, 0, end ? 0.05 : 0.04, 'metal', 0x8a8a86, [1, 0.6, 1], 6);
    p.cyl(px, 0.05, 0, 0.1, 0.1, 'concrete', null, null, 8);
    if (end) {
      // terminal post: flat tension bar threaded through the mesh + bolted bands
      const bx = px + (i === 0 ? 0.07 : -0.07);
      p.box(bx, h / 2, 0.012, 0.018, h - 0.2, 0.006, 'metal', 0x7e7e7a);
      for (let k = 0; k < 4; k++) { const by = 0.3 + k * (h - 0.6) / 3; p.box(px + (bx - px) / 2, by, 0.012, 0.13, 0.025, 0.012, 'metal', 0x9a9a96); p.cyl(bx, by, 0.022, 0.007, 0.012, 'metalDark', null, [Math.PI / 2, 0, 0], 6); }
    } else p.torus(px, h - 0.05, 0, 0.04, 0.008, 'metal', 0x9a9a96, [Math.PI / 2, 0, 0], 4, 10); // rail clamp
  }
  p.cyl(0, h - 0.05, 0, 0.022, len, 'metal', 0x8a8a86, [0, 0, Math.PI / 2], 6);
  p.cyl(0, 0.1, 0, 0.012, len, 'metal', 0x8a8a86, [0, 0, Math.PI / 2], 6);
  // wire mesh (alpha-tested chain link)
  p.box(0, h / 2 + 0.02, 0, len, h - 0.12, 0.004, 'chainLink');
  // barbed wire strands on top
  for (const dy of [0.12, 0.24]) p.cyl(0, h + dy, -0.08, 0.004, len, 'metalDark', null, [0, 0, Math.PI / 2], 4);
  for (let i = 0; i <= n; i++) p.box(-len / 2 + (len / n) * i, h + 0.12, -0.05, 0.03, 0.3, 0.03, 'metal', 0x8a8a86, [0.5, 0, 0]);
  p.col(0, h / 2, 0, len, h, 0.1, 'metal', F_SOLID | F_SHOOT);
  return p;
}
// Chain-link gate leaf: welded tube frame with mid brace, wire mesh infill,
// hinge knuckles on the -X edge and a fork latch + padlock on the +X edge.
// (x, y, z) is the floor point under the hinge; the leaf extends along local
// +X by w (ry swings it). Collision is one thin slab.
export function fenceGate(L, x, y, z, ry = 0, w = 1.4, h = 2.2, locked = false) {
  const p = prop(L, x, y, z, ry);
  const t = 0x8a8a86, cx = w / 2, cy = 0.08 + h / 2;
  for (const sx of [0.03, w - 0.03]) p.cyl(sx, cy, 0, 0.022, h, 'metal', t, null, 8);
  for (const sy of [0.08, 0.08 + h / 2, 0.08 + h]) p.cyl(cx, sy, 0, 0.02, w - 0.04, 'metal', t, [0, 0, Math.PI / 2], 8);
  p.tube(0.05, 0.1, 0, w - 0.05, 0.06 + h / 2, 0, 0.012, 'metal', t, 6); // diagonal brace
  p.box(cx, cy, 0, w - 0.06, h - 0.04, 0.004, 'chainLink');
  for (const hy of [0.35, h - 0.2]) { p.cyl(-0.02, hy, 0, 0.03, 0.12, 'metalDark', null, null, 8); p.box(0.0, hy, 0, 0.06, 0.03, 0.02, 'metalDark'); }
  p.box(w + 0.01, 0.08 + h * 0.55, 0, 0.08, 0.05, 0.05, 'metalDark');
  if (locked) {
    p.tube(w - 0.02, 0.08 + h * 0.5, 0.02, w + 0.04, 0.08 + h * 0.5, 0.02, 0.006, 'metalDark', null, 5);
    p.rbox(w + 0.05, 0.08 + h * 0.47, 0.03, 0.05, 0.06, 0.025, 0.006, 'metalClean', 0xc0a050);
    p.torus(w + 0.05, 0.08 + h * 0.5 + 0.01, 0.03, 0.018, 0.004, 'chrome', null, [0, 0, 0], 4, 10, Math.PI);
  }
  p.col(cx, cy, 0, w, h, 0.08, 'metal', F_SOLID | F_SHOOT);
  return p;
}
// Picnic / fishing cooler: moulded tub with rounded corners, hinged white lid,
// latch tabs, fold-down handles on the ends, drain plug and a maker's label.
// open=true props the lid up.
export function cooler(L, x, y, z, ry = 0, color = 0x2a5a9a, open = false) {
  const p = prop(L, x, y, z, ry);
  const W = 0.62, D = 0.38, H = 0.36;
  p.rbox(0, H / 2 + 0.01, 0, W, H, D, 0.04, 'plasticGloss', color, null, 2);
  p.rbox(0, 0.012, 0, W - 0.04, 0.024, D - 0.04, 0.01, 'plastic', 0x2a2a2a); // base skid
  p.box(0, 0.3, -D / 2 - 0.002, W - 0.08, 0.012, 0.004, 'plastic', new THREE.Color(color).multiplyScalar(0.7).getHex()); // moulded rib
  // lid
  if (open) p.rbox(0, H + 0.2, D / 2 + 0.02, W + 0.01, 0.4, 0.05, 0.02, 'plastic', 0xe8e6e0, [-0.25, 0, 0]);
  else {
    p.rbox(0, H + 0.035, 0, W + 0.01, 0.06, D + 0.01, 0.025, 'plastic', 0xe8e6e0, null, 2);
    p.box(-0.12, H + 0.066, 0.02, 0.07, 0.006, 0.05, 'plastic', 0xc8c6c0); // cup holders
    p.box(0.12, H + 0.066, 0.02, 0.07, 0.006, 0.05, 'plastic', 0xc8c6c0);
    for (const sx of [-0.2, 0.2]) p.box(sx, H + 0.01, -D / 2 - 0.012, 0.06, 0.05, 0.016, 'plastic', 0xd8d6d0); // latches
  }
  if (open) { p.box(0, H - 0.02, 0, W - 0.06, 0.02, D - 0.06, 'waterSurface', 0x6a8088); p.cyl(0.12, H - 0.02, 0.02, 0.033, 0.12, 'metalClean', 0xb02020, [0.3, 0, 1.3], 10); }
  // end handles
  for (const sx of [-1, 1]) {
    p.box(sx * (W / 2 + 0.012), H - 0.06, 0, 0.02, 0.03, 0.2, 'plastic', 0xd8d6d0);
    p.box(sx * (W / 2 + 0.006), H - 0.03, -0.09, 0.012, 0.06, 0.02, 'plastic', 0xd8d6d0);
    p.box(sx * (W / 2 + 0.006), H - 0.03, 0.09, 0.012, 0.06, 0.02, 'plastic', 0xd8d6d0);
  }
  p.cyl(W / 2 - 0.08, 0.05, -D / 2 - 0.004, 0.018, 0.012, 'plastic', 0x1a1a1a, [Math.PI / 2, 0, 0], 8); // drain plug
  p.box(-0.1, 0.19, -D / 2 - 0.004, 0.24, 0.07, 0.003, 'paper', 0xe8e4d8); // label
  p.box(-0.1, 0.205, -D / 2 - 0.0065, 0.2, 0.018, 0.002, 'plastic', 0xb02020);
  p.box(-0.13, 0.172, -D / 2 - 0.0065, 0.14, 0.008, 0.002, 'plastic', 0x2a2a2a);
  p.col(0, (H + 0.06) / 2, 0, W, H + 0.07, D, 'plastic', F_SOLID | F_SHOOT);
  return p;
}
// Plywood sheet leaning against a wall: face-grain veneer, splintered edge,
// a spray-painted mark and a batten screwed across. (x, z) is the foot of the
// sheet, the wall is behind it along local +Z at distance lean*h.
export function plywood(L, x, y, z, ry = 0, w = 1.2, h = 2.2, lean = 0.12, mark = true) {
  const p = prop(L, x, y, z, ry);
  const a = Math.asin(Math.min(0.5, lean));
  const cz = Math.sin(a) * h / 2, cy = Math.cos(a) * h / 2;
  p.box(0, cy, cz, w, h, 0.018, 'woodPale', 0xc8b08a, [-a, 0, 0]);
  p.box(0, cy, cz - 0.0095 * Math.cos(a), w - 0.02, h - 0.02, 0.002, 'wood', 0xd8c09a, [-a, 0, 0]);
  p.box(0, cy * 0.9, cz * 0.9 - 0.02, w - 0.1, 0.07, 0.02, 'woodDark', 0x8a7a60, [-a, 0, 0]);
  for (const sx of [-0.4, 0.4]) p.cyl(sx * w, cy * 0.9, cz * 0.9 - 0.032, 0.006, 0.006, 'metalDark', null, [Math.PI / 2 - a, 0, 0], 6);
  if (mark) p.box(0.1, cy * 1.2, cz * 1.2 - 0.011, w * 0.5, 0.04, 0.001, 'plastic', 0xd83a1a, [-a, 0, 0.35]);
  p.box(w / 2 - 0.08, 0.06, 0.01, 0.12, 0.1, 0.02, 'woodDark', 0x6a5a40, [0, 0.4, 0.2]); // broken-off chunk
  p.col(0, h / 2, cz, w, h, 2 * cz + 0.04, 'wood', F_SOLID | F_SHOOT);
  return p;
}
// Sawhorse: 2x4 top beam on splayed legs with gusset plates and a lower
// cross-brace; long axis along local X.
export function sawhorse(L, x, y, z, ry = 0, len = 1.0, tint = 0xc8b08a, collide = true) {
  const p = prop(L, x, y, z, ry);
  const h = 0.72, sp = 0.2;
  p.box(0, h - 0.045, 0, len, 0.09, 0.045, 'woodPale', tint);
  for (const sx of [-1, 1]) {
    const lx = sx * (len / 2 - 0.12);
    for (const sz of [-1, 1]) p.box(lx, h / 2 - 0.03, sz * sp / 2, 0.07, h - 0.02, 0.035, 'woodPale', tint, [sz * -0.27, 0, 0]);
    p.box(lx, h - 0.16, 0, 0.012, 0.14, 0.24, 'woodPale', 0xa89070); // gusset
    p.box(lx, 0.22, 0, 0.04, 0.06, sp + 0.15, 'woodPale', 0xb09878); // spreader
  }
  p.box(0, 0.26, sp / 2 + 0.04, len - 0.3, 0.06, 0.02, 'woodPale', 0xb09878, [0.27, 0, 0]);
  for (const sx of [-1, 1]) p.cyl(sx * (len / 2 - 0.12), h - 0.16, 0.125, 0.006, 0.01, 'metalDark', null, [Math.PI / 2, 0, 0], 6);
  if (collide) p.col(0, h / 2, 0, len, h, 0.5, 'wood', F_SOLID | F_SHOOT);
  return p;
}
// Kettle barbecue grill: enamelled bowl + lid with handle and vents, grate,
// three legs with wheels, ash catcher, side hook with tongs.
export function kettleGrill(L, x, y, z, ry = 0, color = 0x1a1a1c, lidOff = false) {
  const p = prop(L, x, y, z, ry);
  const R = 0.29, by = 0.72;
  p.sph(0, by, 0, R, 'plasticGloss', color, [1, 0.72, 1], 14); // bowl (lower half hidden by lid or showing coals)
  p.torus(0, by, 0, R, 0.012, 'metal', 0x8a8a86, [Math.PI / 2, 0, 0], 4, 22);
  if (lidOff) {
    p.cyl(0, by + 0.02, 0, R - 0.02, 0.005, 'metalDark', 0x4a4a48, null, 16);
    for (let i = -3; i <= 3; i++) p.box(i * 0.07, by + 0.03, 0, 0.008, 0.008, 2 * Math.sqrt(Math.max(0.01, (R - 0.03) ** 2 - (i * 0.07) ** 2)), 'metal', 0x9a9a96);
    p.sph(0.45, 0.2, -0.1, R, 'plasticGloss', color, [1, 0.72, 1], 12); // lid on the floor
  } else {
    p.sph(0, by + 0.02, 0, R + 0.005, 'plasticGloss', color, [1, 0.62, 1], 14);
    p.box(0, by + 0.23, 0, 0.16, 0.025, 0.035, 'wood', 0x3a2618);
    for (const sx of [-1, 1]) p.box(sx * 0.07, by + 0.205, 0, 0.012, 0.035, 0.012, 'chrome');
    p.cyl(0.12, by + 0.18, 0.05, 0.035, 0.008, 'chrome', null, [0.35, 0, -0.35], 10); // vent
  }
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3 + 0.5, ex = Math.cos(a) * 0.26, ez = Math.sin(a) * 0.26;
    p.tube(Math.cos(a) * 0.16, by - 0.12, Math.sin(a) * 0.16, ex, 0.04, ez, 0.012, 'metal', 0x8a8a86);
    if (i < 2) p.cylX(ex, 0.045, ez, 0.045, 0.03, 'rubber', 0x1a1a1a, 10);
  }
  p.cyl(0, 0.3, 0, 0.18, 0.01, 'metal', 0x6a6a66, null, 14); // ash-catcher tray
  p.cyl(0, 0.36, 0, 0.1, 0.12, 'metal', 0x8a8a86, null, 12); // ash pan
  p.box(R + 0.02, by - 0.05, 0, 0.06, 0.012, 0.012, 'chrome');
  p.tube(R + 0.05, by - 0.05, 0, R + 0.08, by - 0.36, 0.02, 0.006, 'chrome'); // tongs
  p.col(0, 0.5, 0, 0.62, 1.0, 0.62, 'metal');
  return p;
}
export function barricade(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  // striped rail on A-frame legs
  p.box(0, 0.9, 0, 2.0, 0.25, 0.06, 'paintedWhite', 0xd8d8d0);
  for (let i = 0; i < 4; i++) p.box(-0.75 + i * 0.5, 0.9, -0.035, 0.22, 0.24, 0.01, 'paintedRed', 0xc02a1a, [0, 0, 0.5]);
  p.box(0, 0.55, 0, 1.9, 0.12, 0.05, 'paintedWhite', 0xc8c8c0);
  for (const sx of [-0.8, 0.8]) {
    p.box(sx, 0.5, 0.15, 0.06, 1.05, 0.06, 'wood', 0xb0a080, [0.3, 0, 0]);
    p.box(sx, 0.5, -0.15, 0.06, 1.05, 0.06, 'wood', 0xb0a080, [-0.3, 0, 0]);
    p.box(sx, 0.3, 0, 0.04, 0.04, 0.3, 'metalDark');
  }
  // flashing amber lamp on one end
  p.box(0.85, 1.07, 0, 0.06, 0.1, 0.06, 'metalDark');
  p.cyl(0.85, 1.18, 0, 0.07, 0.12, 'emissiveTint', drnd() < 0.5 ? 0xc07010 : 0x3a2004, null, 10);
  p.col(0, 0.55, 0, 2.0, 1.1, 0.5, 'wood', F_SOLID | F_SHOOT);
  return p;
}
export function sandbags(L, x, y, z, ry = 0, len = 3, rows = 3) {
  const p = prop(L, x, y, z, ry);
  for (let r = 0; r < rows; r++) {
    const n = Math.floor(len / 0.6);
    for (let i = 0; i < n; i++) {
      const tint = dpick([0x8a7a58, 0x7e6e4e, 0x948464, 0x857552]);
      p.rbox(-len / 2 + 0.3 + i * 0.6 + (r % 2) * 0.15 + (drnd() - 0.5) * 0.04, 0.1 + r * 0.19, (drnd() - 0.5) * 0.05, 0.58, 0.2, 0.42, 0.08, 'fabric', tint, [0, (drnd() - 0.5) * 0.15, (drnd() - 0.5) * 0.08], 1);
    }
  }
  p.col(0, rows * 0.1, 0, len, rows * 0.2, 0.45, 'fabric');
  return p;
}
export function acUnit(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  const t = dpick([0xa8aca8, 0xb8b4a8, 0x98a0a0]);
  p.box(0, 0.08, 0, 1.7, 0.08, 1.3, 'metalDark'); // rails
  p.rbox(0, 0.62, 0, 1.6, 1.0, 1.2, 0.03, 'metal', t);
  p.box(0, 1.14, 0, 1.62, 0.04, 1.22, 'metal', 0x8a8e8a);
  // fan grille + blades on top
  p.torus(0.2, 1.17, 0, 0.45, 0.02, 'metalDark', null, [Math.PI / 2, 0, 0], 4, 20);
  p.torus(0.2, 1.17, 0, 0.3, 0.012, 'metalDark', null, [Math.PI / 2, 0, 0], 4, 16);
  p.box(0.2, 1.17, 0, 0.9, 0.015, 0.03, 'metalDark'); p.box(0.2, 1.17, 0, 0.03, 0.015, 0.9, 'metalDark');
  p.cyl(0.2, 1.14, 0, 0.44, 0.01, 'blackMatte', null, null, 16);
  for (let i = 0; i < 3; i++) p.box(0.2, 1.1, 0, 0.38, 0.01, 0.12, 'metalDark', 0x555555, [0.3, i * 2.09, 0]);
  // louvred sides
  for (let i = 0; i < 8; i++) { p.box(0, 0.3 + i * 0.1, -0.605, 1.5, 0.02, 0.03, 'metal', 0x7a7e7a, [0.6, 0, 0]); p.box(0.805, 0.3 + i * 0.1, 0, 0.03, 0.02, 1.1, 'metal', 0x7a7e7a, [0, 0, 0.6]); }
  p.box(-0.55, 0.7, -0.61, 0.3, 0.4, 0.02, 'metal', t); // service panel
  p.box(-0.55, 0.85, -0.625, 0.12, 0.06, 0.01, 'paintedWhite', 0xe8e8e0);
  // refrigerant pipes into the roof
  p.tube(-0.6, 0.4, 0.61, -0.6, 0.4, 0.9, 0.03, 'metalClean', 0xb08a50);
  p.tube(-0.6, 0.4, 0.9, -0.6, 0.02, 0.9, 0.03, 'metalClean', 0xb08a50);
  p.tube(-0.45, 0.35, 0.61, -0.45, 0.02, 0.61, 0.02, 'blackMatte');
  p.col(0, 0.6, 0, 1.6, 1.2, 1.2, 'metal');
  return p;
}
export function waterTower(L, x, y, z) {
  const p = prop(L, x, y, z, 0);
  // steel legs with cross bracing
  for (const sx of [-1.4, 1.4]) for (const sz of [-1.4, 1.4]) { p.box(sx, 2.5, sz, 0.18, 5.0, 0.18, 'metalDark'); p.box(sx, 0.1, sz, 0.35, 0.2, 0.35, 'concrete'); }
  for (const [ax, az, bx, bz] of [[-1.4, -1.4, 1.4, -1.4], [-1.4, 1.4, 1.4, 1.4], [-1.4, -1.4, -1.4, 1.4], [1.4, -1.4, 1.4, 1.4]]) {
    p.tube(ax, 0.6, az, bx, 4.6, bz, 0.03, 'metalDark');
    p.tube(bx, 0.6, bz, ax, 4.6, az, 0.03, 'metalDark');
    p.tube(ax, 2.6, az, bx, 2.6, bz, 0.04, 'metalDark');
  }
  p.box(0, 5.02, 0, 3.2, 0.12, 3.2, 'metalDark'); // platform
  p.cyl(0, 6.8, 0, 2.2, 3.6, 'woodDark', 0x9a8a78, null, 24);
  for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; p.box(Math.cos(a) * 2.21, 6.8, Math.sin(a) * 2.21, 0.02, 3.58, 0.03, 'woodDark', 0x6a5a48, [0, -a, 0]); } // stave gaps
  for (let i = 0; i < 5; i++) p.torus(0, 5.2 + i * 0.8, 0, 2.23, 0.025, 'metalDark', null, [Math.PI / 2, 0, 0], 4, 28);
  p.geo(new THREE.ConeGeometry(2.4, 1.2, 24), 'metalDark', 0, 9.2, 0);
  p.cyl(0, 9.9, 0, 0.08, 0.3, 'metalDark', null, null, 8);
  // ladder + catwalk rail
  for (const sx of [-0.2, 0.2]) p.box(sx, 6.0, -2.3, 0.04, 8.0, 0.04, 'metalDark');
  for (let i = 0; i < 26; i++) p.box(0, 2.2 + i * 0.3, -2.3, 0.4, 0.025, 0.025, 'metalDark');
  p.torus(0, 6.0, 0, 2.55, 0.02, 'metalDark', null, [Math.PI / 2, 0, 0], 4, 28);
  p.tube(0, 5.0, 0, 0, 0.3, 0, 0.12, 'rust'); // outlet pipe
  p.col(0, 6.8, 0, 4.4, 3.6, 4.4, 'wood');
  for (const sx of [-1.4, 1.4]) for (const sz of [-1.4, 1.4]) p.col(sx, 2.5, sz, 0.2, 5, 0.2, 'metal');
  return p;
}
export function antenna(L, x, y, z, h = 8) {
  const p = prop(L, x, y, z, 0);
  // triangular lattice mast
  const r = 0.22;
  const leg = (i) => [Math.cos(i * 2.094) * r, Math.sin(i * 2.094) * r];
  for (let i = 0; i < 3; i++) { const [a, b] = leg(i); p.cyl(a, h / 2, b, 0.02, h, 'metalDark', null, null, 5); }
  const seg = Math.max(3, Math.round(h / 0.8));
  for (let k = 0; k < seg; k++) for (let i = 0; i < 3; i++) {
    const [a, b] = leg(i), [c, d] = leg((i + 1) % 3);
    p.tube(a, k * h / seg, b, c, (k + 1) * h / seg, d, 0.008, 'metalDark', null, 4);
  }
  for (let i = 1; i < 4; i++) p.box(0, h * i / 4, 0, 1.2 - i * 0.25, 0.03, 0.03, 'metalDark');
  p.cylZ(0.3, h * 0.6, 0, 0.2, 0.06, 'paintedWhite', 0xd8d8d0, 14); // dish
  p.cylZ(0.3, h * 0.6, -0.05, 0.05, 0.1, 'metalDark', null, 8);
  p.cyl(0, h + 0.4, 0, 0.015, 0.8, 'metalDark', null, null, 5);
  p.box(0, 0.05, 0, 0.8, 0.1, 0.8, 'concrete');
  p.glowSph(0, h + 0.05, 0, 0.07, 0xff2010);
  const lp = new THREE.Vector3(0, h + 0.1, 0).applyMatrix4(p.base);
  L.light(lp.x, lp.y, lp.z, 0xff2010, 3, 6, { flicker: 0 });
  p.col(0, h / 2, 0, 0.2, h, 0.2, 'metal');
  return p;
}
export function pipe(L, x0, y0, z0, x1, y1, z1, r = 0.12, mat = 'metal', tint) {
  const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
  const len = a.distanceTo(b);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const seg = r > 0.05 ? 14 : 8;
  const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(r * 2, len, r * 2));
  L.mesh(unitCyl(seg), mat, m, { tint, uvScale: 1 });
  if (r < 0.02) return; // wires / cables
  // flanges (+ intermediate couplings on long runs)
  const n = Math.max(0, Math.floor(len / 3));
  const ts = [0.02, 0.98];
  for (let i = 1; i <= n; i++) ts.push(i / (n + 1));
  for (const t of ts) {
    const fp = a.clone().lerp(b, t);
    L.mesh(unitCyl(seg), 'metalDark', new THREE.Matrix4().compose(fp, q, new THREE.Vector3(r * 2.6, Math.min(0.06, len * 0.1), r * 2.6)), { uvScale: 1 });
  }
}

// ------------------------------------------------------------- subway --
export function subwayCar(L, x, y, z, ry = 0, opts = {}) {
  const p = prop(L, x, y, z, ry);
  const len = opts.len ?? 16, w = 3.0;
  const color = opts.color ?? 0xa8aca8;
  p.box(0, 0.25, 0, w - 0.2, 0.5, len - 0.4, 'metalDark'); // undercarriage
  for (const sz of [-len / 2 + 2.5, len / 2 - 2.5]) { p.box(0, 0.25, sz, 2.2, 0.4, 2.2, 'metalDark', 0x222222); for (const sx of [-0.75, 0.75]) for (const dz of [-0.7, 0.7]) p.cylX(sx, 0.3, sz + dz, 0.3, 0.1, 'metalDark', 0x3a3a3a, 12); }
  p.box(0, 0.6, 0, w, 0.2, len, 'diamond', 0x777777); // floor
  for (const sx of [-1, 1]) {
    p.box(sx * (w / 2 - 0.04), 1.2, 0, 0.08, 1.0, len, 'metalClean', color);
    p.box(sx * (w / 2 - 0.04), 2.95, 0, 0.08, 0.7, len, 'metalClean', color);
    p.box(sx * (w / 2 - 0.04), 2.15, 0, 0.04, 0.9, len - 0.2, 'glassDirty', 0x202628);
    for (let i = 0; i <= 8; i++) p.box(sx * (w / 2 - 0.02), 2.15, -len / 2 + 0.1 + i * (len - 0.2) / 8, 0.06, 0.9, 0.1, 'metalClean', color);
    p.box(sx * (w / 2 + 0.005), 1.72, 0, 0.01, 0.12, len, 'paintedBlue', 0x2a4a9a);
    for (let i = 0; i < Math.floor(len / 0.5); i++) p.box(sx * (w / 2 + 0.003), 1.2, -len / 2 + 0.25 + i * 0.5, 0.006, 0.9, 0.02, 'metalClean', 0x8a8e8e); // fluting
  }
  p.rbox(0, 3.35, 0, w, 0.14, len, 0.06, 'metalClean', color); // roof
  p.box(0, 1.9, len / 2 - 0.04, w, 2.6, 0.08, 'metalClean', color);
  p.box(0, 1.9, -len / 2 + 0.04, w, 2.6, 0.08, 'metalClean', color);
  for (const sz of [-1, 1]) { p.box(0, 2.0, sz * (len / 2 - 0.02), 0.9, 1.9, 0.02, 'metalDark', 0x3a3a3a); p.box(0, 2.3, sz * (len / 2), 0.6, 0.6, 0.02, 'glassDirty', 0x202628); }
  // longitudinal seats + grab bars
  for (const sx of [-1, 1]) {
    p.rbox(sx * (w / 2 - 0.35), 1.05, 0, 0.5, 0.1, len - 3, 0.03, 'plastic', 0x2a3a6a);
    p.box(sx * (w / 2 - 0.13), 1.35, 0, 0.06, 0.5, len - 3, 'plastic', 0x2a3a6a);
    p.cylZ(sx * 0.9, 2.75, 0, 0.018, len - 1, 'chrome', null, 8);
  }
  for (let i = -2; i <= 2; i++) p.cyl(0, 2.0, i * 3, 0.025, 2.8, 'chrome');
  for (let i = 0; i < Math.floor(len / 1.4); i++) p.box(0.3, 2.9, -len / 2 + 1 + i * 1.4, 0.3, 0.2, 0.01, 'paper', dpick([0xe0d8c0, 0xc8d8e0, 0xe0c0b0])); // ads
  p.box(0, 3.22, 0, 0.25, 0.04, len - 1, opts.lit ? 'emissiveCool' : 'blackMatte');
  p.col(0, 0.35, 0, w, 0.7, len, 'metal');
  const gap = opts.doors ? 1.4 : 0;
  for (const sx of [-1, 1]) {
    if (gap) {
      p.col(sx * (w / 2 - 0.05), 2.0, -len / 4 - gap / 4, 0.1, 2.8, len / 2 - gap / 2, 'metal');
      p.col(sx * (w / 2 - 0.05), 2.0, len / 4 + gap / 4, 0.1, 2.8, len / 2 - gap / 2, 'metal');
    } else p.col(sx * (w / 2 - 0.05), 2.0, 0, 0.1, 2.8, len, 'metal');
  }
  p.col(0, 3.35, 0, w, 0.14, len, 'metal');
  p.col(0, 2.0, len / 2 - 0.05, w, 2.8, 0.1, 'metal');
  p.col(0, 2.0, -len / 2 + 0.05, w, 2.8, 0.1, 'metal');
  if (opts.lit) {
    for (let i = -1; i <= 1; i++) {
      const lp = new THREE.Vector3(0, 3.0, i * len / 3).applyMatrix4(p.base);
      L.light(lp.x, lp.y, lp.z, 0xd8f0ff, 8, 8, { flicker: 0.5 });
    }
  }
  return p;
}
export function turnstile(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 0.5, 0, 0.3, 1.0, 0.9, 0.03, 'metalClean');
  p.box(0, 1.01, 0, 0.32, 0.02, 0.92, 'metalClean', 0x707070);
  p.box(0, 0.9, -0.3, 0.2, 0.08, 0.14, 'blackMatte');
  p.glow(0, 0.95, -0.35, 0.12, 0.03, 0.01, drnd() < 0.5 ? 0x30ff60 : 0xff3020);
  p.cylX(0.18, 0.85, 0, 0.05, 0.06, 'chrome', null, 10);
  for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.3; p.tube(0.2, 0.85, 0, 0.2 + Math.cos(a) * 0.45 * 0.7, 0.85 + Math.sin(a) * 0.45 * 0.3, Math.sin(a) * 0.3, 0.02, 'chrome'); }
  p.col(0, 0.5, 0, 0.3, 1.0, 0.9, 'metal');
  return p;
}
export function generator(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.15, 0, 3.2, 0.3, 1.6, 'metalDark');
  p.rbox(-0.4, 1.0, 0, 2.2, 1.4, 1.4, 0.05, 'paintedYellow', 0x9a7a1a);
  p.rbox(1.1, 0.9, 0, 0.8, 1.2, 1.3, 0.04, 'metal', 0x6a6a64);
  p.cyl(-0.9, 2.0, 0.3, 0.15, 0.8, 'metalDark');
  p.cyl(-0.9, 2.42, 0.3, 0.17, 0.05, 'rust');
  for (let i = 0; i < 6; i++) p.box(-1.2 + i * 0.3, 1.0, -0.71, 0.05, 1.0, 0.02, 'metalDark');
  p.box(1.1, 1.1, -0.66, 0.5, 0.4, 0.02, 'blackMatte');
  for (let i = 0; i < 3; i++) p.glow(0.95 + i * 0.15, 1.2, -0.672, 0.05, 0.05, 0.005, [0x30ff60, 0xffa010, 0xff2010][i]);
  p.box(1.1, 0.95, -0.672, 0.3, 0.1, 0.005, 'paintedWhite', 0xe8e8e0);
  p.box(-0.4, 1.72, 0, 2.0, 0.04, 1.2, 'paintedYellow', 0x7a5a10);
  p.tube(1.5, 0.3, 0.5, 1.9, 0.02, 0.9, 0.04, 'rubber', 0x151515);
  p.col(0, 0.85, 0, 3.2, 1.7, 1.6, 'metal');
  return p;
}
export function electricPanel(L, x, y, z, ry = 0, lit = true) {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 1.1, 0, 1.2, 2.2, 0.4, 0.02, 'metal', 0x8a9088);
  for (let i = 0; i < 3; i++) {
    p.rbox(-0.4 + i * 0.4, 1.15, -0.205, 0.37, 1.9, 0.02, 0.01, 'metal', 0x9aa098);
    p.box(-0.26 + i * 0.4, 1.2, -0.222, 0.025, 0.14, 0.025, 'chrome');
    p.box(-0.4 + i * 0.4, 1.75, -0.217, 0.14, 0.1, 0.004, 'paintedYellow', 0xd8b020);
  }
  if (lit) {
    p.glow(-0.45, 2.02, -0.216, 0.04, 0.04, 0.01, 0x30ff60);
    p.glow(-0.37, 2.02, -0.216, 0.04, 0.04, 0.01, 0xff2010);
    p.glow(-0.29, 2.02, -0.216, 0.04, 0.04, 0.01, 0xffa010);
  }
  p.box(0, 2.3, 0.05, 1.1, 0.2, 0.3, 'metalDark'); // cable duct
  for (let i = 0; i < 4; i++) p.cyl(-0.4 + i * 0.27, 2.9, 0.05, 0.035, 1.0, 'blackMatte', null, null, 6);
  p.col(0, 1.1, 0, 1.2, 2.2, 0.4, 'metal');
  return p;
}
export function pumpMachine(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.2, 0, 2.4, 0.4, 1.2, 'concreteDark');
  p.cyl(-0.5, 0.95, 0, 0.5, 1.1, 'paintedGreen', 0x2e5a4a, [0, 0, Math.PI / 2], 20);
  for (const sx of [-1.0, 0.0]) p.torus(sx, 0.95, 0, 0.51, 0.03, 'paintedGreen', 0x264a3c, [0, Math.PI / 2, 0], 4, 20);
  p.rbox(0.6, 0.9, 0, 0.9, 1.0, 0.9, 0.05, 'paintedGreen', 0x2e5a4a);
  for (let i = 0; i < 8; i++) p.box(0.6, 0.55 + i * 0.1, -0.46, 0.8, 0.03, 0.02, 'paintedGreen', 0x1e3a30);
  p.cyl(-1.2, 0.95, 0, 0.18, 0.5, 'metalDark', null, [0, 0, Math.PI / 2]);
  p.cyl(0.6, 1.7, 0, 0.12, 0.8, 'metal');
  for (let i = 0; i < 8; i++) { const a = i * 0.785; p.cylX(-1.46, 0.95 + Math.sin(a) * 0.14, Math.cos(a) * 0.14, 0.02, 0.04, 'metalDark', null, 6); }
  p.box(0.6, 1.2, -0.46, 0.25, 0.15, 0.005, 'paintedWhite', 0xe8e8e0);
  p.col(0, 0.8, 0, 2.4, 1.6, 1.2, 'metal');
  return p;
}
export function valveWheel(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.torus(0, 0, 0, 0.25, 0.028, 'paintedRed', 0xa02a1a, [0, 0, 0], 6, 20);
  for (let i = 0; i < 3; i++) p.box(0, 0, 0, 0.5, 0.03, 0.03, 'paintedRed', 0xa02a1a, [0, 0, i * 1.047]);
  p.cylZ(0, 0, 0.03, 0.05, 0.1, 'metalDark', null, 10);
  p.cylZ(0, 0, 0.12, 0.025, 0.18, 'metalClean', null, 8);
  return p;
}

// ------------------------------------------------------------ hospital --
export function gurney(L, x, y, z, ry = 0, sheet = true) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.8, 0, 0.65, 0.05, 1.95, 'metalClean');
  for (const sx of [-1, 1]) p.cylZ(sx * 0.33, 0.83, 0, 0.018, 1.95, 'metalClean', null, 8);
  if (sheet) {
    p.rbox(0, 0.86, 0, 0.62, 0.07, 1.9, 0.03, 'fabric', 0xe8ece8);
    p.rbox(0, 0.9, -0.5, 0.64, 0.05, 0.9, 0.02, 'fabric', dpick([0xe0e4e0, 0xb8c8c0, 0xd8d0c0]), [0.02, 0, drnd() * 0.06]);
    if (drnd() < 0.3) p.box(0.1, 0.94, 0.2, 0.3, 0.004, 0.4, 'fabric', 0x4a0806); // bloodstain
  }
  p.rbox(0, 0.92, 0.82, 0.5, 0.1, 0.3, 0.04, 'fabric', 0xeeeeee);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { p.box(sx * 0.28, 0.42, sz * 0.85, 0.04, 0.76, 0.04, 'metalClean'); p.cylX(sx * 0.28, 0.06, sz * 0.85, 0.06, 0.05, 'rubber', null, 10); }
  p.box(0, 0.35, 0, 0.5, 0.03, 1.6, 'metalClean', 0x9aa0a0);
  p.col(0, 0.45, 0, 0.65, 0.9, 1.95, 'metal', F_SOLID | F_SHOOT);
  return p;
}
export function wheelchair(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.5, 0, 0.46, 0.04, 0.44, 'fabric', 0x2a2a2a);
  p.box(0, 0.78, 0.22, 0.46, 0.5, 0.03, 'fabric', 0x2a2a2a);
  for (const sx of [-0.25, 0.25]) {
    p.torus(sx * 1.2, 0.3, 0.05, 0.3, 0.022, 'rubber', 0x1a1a1a, [0, Math.PI / 2, 0], 6, 20);
    p.torus(sx * 1.22, 0.3, 0.05, 0.26, 0.008, 'metalClean', null, [0, Math.PI / 2, 0], 4, 18);
    p.box(sx * 1.2, 0.3, 0.05, 0.01, 0.5, 0.01, 'metalClean'); p.box(sx * 1.2, 0.3, 0.05, 0.01, 0.01, 0.5, 'metalClean');
    p.tube(sx, 0.5, -0.2, sx, 0.5, 0.24, 0.012, 'metalClean');
    p.tube(sx, 0.5, 0.24, sx, 1.05, 0.28, 0.012, 'metalClean');
    p.tube(sx, 0.5, -0.2, sx, 0.12, -0.3, 0.012, 'metalClean');
    p.cylX(sx, 0.07, -0.3, 0.06, 0.03, 'rubber', null, 10);
    p.box(sx, 0.66, 0.02, 0.04, 0.02, 0.36, 'plastic', 0x1a1a1a);
  }
  p.col(0, 0.5, 0, 0.65, 1.0, 0.7, 'metal', F_SOLID | F_SHOOT);
  return p;
}
export function ivStand(L, x, y, z) {
  const p = prop(L, x, y, z, 0);
  p.cyl(0, 0.9, 0, 0.013, 1.8, 'metalClean', null, null, 6);
  p.box(0, 1.8, 0, 0.3, 0.015, 0.015, 'metalClean');
  p.rbox(0.12, 1.62, 0, 0.1, 0.2, 0.04, 0.015, 'glass', 0xccddcc);
  p.box(0.12, 1.58, 0, 0.08, 0.1, 0.035, 'plastic', 0xe8e4b0);
  p.tube(0.12, 1.52, 0, 0.18, 0.9, 0.1, 0.003, 'plastic', 0xd8e0e0);
  p.rbox(0, 1.1, -0.03, 0.12, 0.16, 0.08, 0.02, 'plastic', 0xd8d8d0); // pump
  p.glow(0, 1.13, -0.072, 0.06, 0.03, 0.004, 0x30c070);
  for (let i = 0; i < 5; i++) { const a = i * 1.2566; p.box(Math.cos(a) * 0.15, 0.04, Math.sin(a) * 0.15, 0.3, 0.02, 0.02, 'metalClean', null, [0, -a, 0]); p.sph(Math.cos(a) * 0.29, 0.025, Math.sin(a) * 0.29, 0.025, 'plastic', 0x151515, [1, 1, 1], 6); }
  return p;
}
export function medCabinet(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 1.0, 0, 1.0, 2.0, 0.45, 0.02, 'paintedWhite', 0xd8dcd8);
  for (let i = 0; i < 3; i++) p.box(0, 0.95 + i * 0.35 - 0.08, -0.05, 0.9, 0.015, 0.36, 'metalClean');
  for (let i = 0; i < 3; i++) for (let k = 0; k < 5; k++) p.box(-0.35 + k * 0.17, 0.95 + i * 0.35, -0.1, 0.08, 0.14, 0.08, 'plastic', pickC([0xd8d8d0, 0xc86818, 0x3a6aa0, 0xeeeeee]));
  p.box(-0.24, 1.35, -0.23, 0.44, 1.1, 0.01, 'glass', 0xccdddd);
  p.box(0.24, 1.35, -0.23, 0.44, 1.1, 0.01, 'glass', 0xccdddd);
  for (const sx of [-0.47, 0, 0.47]) p.box(sx, 1.35, -0.232, 0.03, 1.12, 0.02, 'paintedWhite', 0xc8ccc8);
  p.box(0, 0.4, -0.228, 0.96, 0.7, 0.02, 'paintedWhite', 0xd0d4d0);
  for (const sx of [-0.05, 0.05]) p.box(sx, 0.62, -0.245, 0.02, 0.1, 0.02, 'chrome');
  p.box(0, 0.4, -0.24, 0.2, 0.2, 0.004, 'paintedRed', 0xc02a1a);
  p.col(0, 1.0, 0, 1.0, 2.0, 0.45, 'metal');
  return p;
}
export function receptionDesk(L, x, y, z, ry = 0, len = 4) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.55, 0, len, 1.1, 0.7, 'woodPale', 0xc8c0b0);
  for (let i = 0; i < Math.floor(len / 0.8); i++) p.box(-len / 2 + 0.4 + i * 0.8, 0.55, -0.355, 0.02, 1.0, 0.01, 'woodPale', 0x8a8070);
  p.rbox(0, 1.12, -0.1, len + 0.1, 0.05, 0.9, 0.015, 'marble');
  p.box(0, 0.78, 0.5, len - 0.2, 0.04, 0.5, 'woodPale');
  // monitors, phone, papers behind the counter
  for (let i = 0; i < Math.max(1, Math.floor(len / 2)); i++) {
    const cx = -len / 2 + 1 + i * 2;
    p.rbox(cx, 1.02, 0.42, 0.45, 0.3, 0.03, 0.01, 'plastic', 0x1c1c1c, [-0.15, 0, 0]);
    p.box(cx, 1.02, 0.44, 0.41, 0.26, 0.005, 'plasticGloss', 0x0a0c10, [-0.15, 0, 0]);
    p.box(cx, 0.85, 0.48, 0.15, 0.1, 0.12, 'plastic', 0x1c1c1c);
    p.box(cx + 0.4, 0.82, 0.4, 0.2, 0.06, 0.18, 'plastic', 0x2a2a2a);
  }
  for (let i = 0; i < 4; i++) p.box(-len / 2 + drnd() * len, 1.15, -0.1 + drnd() * 0.3, 0.21, 0.004, 0.29, 'paper', 0xe0dcd0, [0, drnd() * 3, 0]);
  p.col(0, 0.58, 0, len, 1.16, 0.8, 'wood');
  return p;
}
export function curtainRail(L, x, y, z, ry = 0, len = 2.2, closed = 0.6) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 2.4, 0, len, 0.03, 0.03, 'metalClean');
  const cw = len * closed;
  const n = Math.max(3, Math.round(cw / 0.12));
  for (let i = 0; i < n; i++) {
    const cx = -len / 2 + (i + 0.5) * cw / n;
    p.box(cx, 1.5, (i % 2 ? 0.03 : -0.03), cw / n * 1.15, 1.8, 0.02, 'fabric', 0x8ab0a8, [0, i % 2 ? 0.35 : -0.35, 0]);
  }
  p.box(-len / 2 + cw / 2, 2.35, 0, cw, 0.08, 0.02, 'fabric', 0x7a9a92);
  return p;
}

// ------------------------------------------------------------- rooftop --
export function helipad(L, x, y, z, r = 9) {
  const p = prop(L, x, y, z, 0);
  p.cyl(0, 0.05, 0, r, 0.1, 'concreteDark', null, null, 40);
  p.geo(new THREE.TorusGeometry(r * 0.7, 0.15, 4, 48), 'paintedYellow', 0, 0.11, 0, [Math.PI / 2, 0, 0], [1, 1, 0.1], 0xd8c030);
  p.box(-1.4, 0.11, 0, 0.5, 0.01, 4.2, 'paintedWhite', 0xe8e8e0);
  p.box(1.4, 0.11, 0, 0.5, 0.01, 4.2, 'paintedWhite', 0xe8e8e0);
  p.box(0, 0.11, 0, 2.3, 0.01, 0.5, 'paintedWhite', 0xe8e8e0);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    p.cyl(Math.cos(a) * (r - 0.2), 0.14, Math.sin(a) * (r - 0.2), 0.08, 0.08, 'metalDark', null, null, 8);
    p.cyl(Math.cos(a) * (r - 0.2), 0.2, Math.sin(a) * (r - 0.2), 0.06, 0.05, 'emissiveTint', 0x30ff60, null, 8);
  }
  p.col(0, 0.05, 0, r * 1.6, 0.1, r * 1.6, 'concrete');
  return p;
}
export function radioTable(L, x, y, z, ry = 0) {
  const p = table(L, x, y, z, ry, 1.2, 0.7, 'woodDark');
  p.rbox(0, 0.9, 0.05, 0.5, 0.28, 0.32, 0.02, 'metal', 0x4a5040);
  p.glow(-0.1, 0.94, -0.115, 0.2, 0.08, 0.01, 0x40a050);
  for (let i = 0; i < 3; i++) p.cylZ(0.08 + i * 0.07, 0.88, -0.12, 0.018, 0.02, 'plastic', 0x222222, 8);
  p.cyl(0.18, 1.3, 0.1, 0.01, 0.5, 'metalDark');
  p.rbox(0.35, 0.8, -0.1, 0.12, 0.06, 0.2, 0.02, 'plastic', 0x222222);
  p.tube(0.35, 0.8, -0.05, 0.1, 0.78, 0.05, 0.006, 'blackMatte');
  return p;
}

// ---------------------------------------------------------- dead bodies --
// A static corpse lying on the floor: articulated limbs in a random sprawl.
export function corpse(L, x, y, z, ry = 0, color = 0x4a4a52) {
  const p = prop(L, x, y, z, ry);
  const skin = dpick(SKIN);
  const pants = dpick([0x2a2a34, 0x3a3a2a, 0x1e2430, 0x4a3a2a, 0x2a2622]);
  const shoe = dpick([0x1a1614, 0x2a2420, 0x3a3a3a]);
  const back = drnd() < 0.5; // lying on the back (face up) vs face down
  const t = 0.11; // torso half-height above the floor
  p.rbox(0, t, -0.05, 0.4, 0.2, 0.62, 0.08, 'fabric', color, [0, drnd() * 0.2 - 0.1, (drnd() - 0.5) * 0.2]); // torso
  p.rbox(0, 0.1, 0.32, 0.36, 0.18, 0.24, 0.07, 'fabric', pants); // hips
  // head + hair
  const hx = (drnd() - 0.5) * 0.1, hz = -0.48;
  p.cyl(hx * 0.5, 0.1, -0.38, 0.05, 0.08, 'plastic', skin, [Math.PI / 2, 0, 0], 8);
  p.sph(hx, 0.1, hz, 0.105, 'plastic', skin, [0.9, 0.9, 1.08], 12);
  p.sph(hx, back ? 0.07 : 0.14, hz + 0.01, 0.1, 'blackMatte', dpick([0x2a1e16, 0x1a1410, 0x5a4a3a, 0x8a8a88]), [0.95, 0.7, 1.05], 10);
  // arms: shoulder -> elbow -> hand, random sprawl
  for (const sx of [-1, 1]) {
    const up = drnd();
    const a1 = sx * (0.3 + up * 1.4), a2 = a1 + sx * (drnd() - 0.3) * 1.2;
    const sxp = sx * 0.21, szp = -0.28;
    const ex = sxp + Math.sin(a1) * 0.3, ez = szp + Math.cos(a1) * 0.3 * (up > 0.7 ? -1 : 1);
    const hx2 = ex + Math.sin(a2) * 0.27, hz2 = ez + Math.cos(a2) * 0.27 * (up > 0.7 ? -1 : 1);
    p.tube(sxp, 0.1, szp, ex, 0.06, ez, 0.052, 'fabric', color, 8);
    p.tube(ex, 0.06, ez, hx2, 0.045, hz2, 0.042, drnd() < 0.5 ? 'plastic' : 'fabric', drnd() < 0.5 ? skin : color, 8);
    p.sph(hx2, 0.04, hz2, 0.045, 'plastic', skin, [0.8, 0.5, 1.2], 8);
  }
  // legs: hip -> knee -> foot
  for (const sx of [-1, 1]) {
    const a = sx * drnd() * 0.5, bend = drnd() * 0.9;
    const kx = sx * 0.1 + Math.sin(a) * 0.42, kz = 0.38 + Math.cos(a) * 0.42;
    const fx = kx + Math.sin(a + sx * bend) * 0.4, fz = kz + Math.cos(a + sx * bend) * 0.4;
    const ky = bend > 0.7 ? 0.18 : 0.08;
    p.tube(sx * 0.1, 0.09, 0.38, kx, ky, kz, 0.075, 'fabric', pants, 8);
    p.tube(kx, ky, kz, fx, 0.06, fz, 0.06, 'fabric', pants, 8);
    p.rbox(fx, 0.06, fz + 0.05, 0.1, 0.1, 0.26, 0.04, 'rubber', shoe, [0, a + sx * bend, back ? 0 : 1.2]);
  }
  // blood-soaked patch on the clothes
  if (drnd() < 0.6) p.rbox((drnd() - 0.5) * 0.2, t + 0.1, -0.1 + drnd() * 0.3, 0.26, 0.012, 0.3, 0.006, 'fabric', 0x3a0604);
  return p;
}
export function bodyBag(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  const c = dpick([0x101418, 0x14181a, 0x1a1a14, 0x2a3a4a]);
  p.rbox(0, 0.13, 0.1, 0.58, 0.24, 1.5, 0.1, 'rubber', c);
  p.sph(0, 0.16, -0.7, 0.22, 'rubber', c, [1.2, 0.75, 1.1], 12); // head end
  p.rbox(0, 0.11, 0.8, 0.44, 0.18, 0.3, 0.08, 'rubber', c); // feet end
  p.box(0.08, 0.265, 0, 0.012, 0.01, 1.7, 'chrome', 0x8a8a8a); // zipper
  for (const sz of [-0.5, 0.2, 0.7]) for (const sx of [-1, 1]) p.box(sx * 0.3, 0.1, sz, 0.02, 0.05, 0.12, 'rubber', 0x2a2a2a); // handles
  p.box(0, 0.26, -0.3, 0.12, 0.004, 0.08, 'plastic', 0xd8d4c0); // toe tag / label
  return p;
}

// ================================================================ NEW PROPS
// ------------------------------------------------------------ hazards etc --
export function gasCan(L, x, y, z, ry = 0, color = 0xb02018) {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 0.2, 0, 0.3, 0.36, 0.17, 0.03, 'plastic', color);
  p.tube(-0.08, 0.36, 0, 0.08, 0.4, 0, 0.018, 'plastic', color); // handle
  p.tube(0.1, 0.36, 0, 0.18, 0.46, 0, 0.018, 'plastic', 0x1a1a1a); // spout
  p.col(0, 0.2, 0, 0.3, 0.4, 0.18, 'metal', F_SOLID | F_SHOOT);
  return p;
}
// Large residential/industrial propane tank (horizontal, on saddles).
export function propaneTank(L, x, y, z, ry = 0, len = 3) {
  const p = prop(L, x, y, z, ry);
  const c = 0xd8d8d0;
  p.cylX(0, 0.75, 0, 0.55, len - 1.0, 'paintedWhite', c, 20);
  for (const sx of [-1, 1]) p.sph(sx * (len / 2 - 0.5), 0.75, 0, 0.55, 'paintedWhite', c, [0.9, 1, 1], 16);
  for (const sx of [-0.35, 0.35]) p.box(sx * len, 0.2, 0, 0.18, 0.4, 0.9, 'concrete');
  p.rbox(0, 1.35, 0, 0.3, 0.12, 0.3, 0.03, 'metal', 0x9a9a9a); // valve dome
  p.cyl(0, 1.45, 0, 0.1, 0.12, 'paintedWhite', c, null, 10);
  p.cyl(0.05, 1.54, 0, 0.03, 0.12, 'metalClean', 0xb08a50, null, 8);
  p.box(0, 0.75, -0.555, 0.5, 0.2, 0.01, 'paintedRed', 0xb02018); // FLAMMABLE placard
  p.col(0, 0.7, 0, len, 1.4, 1.1, 'metal');
  return p;
}
// Concrete jersey barrier (len along X).
export function concreteBarrier(L, x, y, z, ry = 0, len = 3, tint = 0xb8b4a8) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.12, 0, len, 0.24, 0.6, 'concrete', tint);
  p.box(0, 0.36, 0, len, 0.26, 0.42, 'concrete', tint);
  p.box(0, 0.62, 0, len, 0.3, 0.2, 'concrete', tint);
  for (const sz of [-1, 1]) {
    p.box(0, 0.33, sz * 0.25, len, 0.32, 0.12, 'concrete', tint, [sz * -0.45, 0, 0]);
    p.box(0, 0.62, sz * 0.12, len, 0.3, 0.06, 'concrete', tint, [sz * -0.12, 0, 0]);
  }
  if (drnd() < 0.6) p.box(0, 0.45, -0.28, len * 0.8, 0.08, 0.005, 'paintedWhite', 0xd8d8d0, [0.45, 0, 0]); // reflective stripe
  for (const sx of [-1, 1]) p.box(sx * (len / 2 - 0.2), 0.08, 0, 0.16, 0.08, 0.62, 'blackMatte', 0x333333);
  p.col(0, 0.4, 0, len, 0.8, 0.55, 'concrete');
  return p;
}
export function trafficCone(L, x, y, z) {
  const p = prop(L, x, y, z, drnd() * 6);
  p.box(0, 0.015, 0, 0.36, 0.03, 0.36, 'rubber', 0x1a1a1a);
  p.frustum(0, 0.37, 0, 0.025, 0.14, 0.68, 'plastic', 0xe05010, null, 14);
  p.frustum(0, 0.45, 0, 0.065, 0.085, 0.12, 'plastic', 0xe8e8e8, null, 14);
  return p;
}
export function phoneBooth(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.05, 0, 0.9, 0.1, 0.9, 'metalDark');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * 0.42, 1.2, sz * 0.42, 0.06, 2.3, 0.06, 'metalClean', 0x8a8a8a);
  for (const sx of [-1, 1]) p.box(sx * 0.43, 1.25, 0, 0.01, 1.7, 0.78, 'glassDirty', 0x2a3234);
  p.box(0, 1.25, 0.43, 0.78, 1.7, 0.01, 'metalClean', 0x9a9a9a);
  p.box(0, 2.3, 0, 0.92, 0.2, 0.92, 'metalDark', 0x3a3a3a);
  p.glow(0, 2.3, -0.465, 0.6, 0.12, 0.01, 0x506a8a);
  p.rbox(0, 1.35, 0.38, 0.3, 0.5, 0.1, 0.02, 'metalClean', 0x6a6a6a); // phone
  p.box(0.08, 1.4, 0.32, 0.05, 0.2, 0.06, 'plastic', 0x151515, [0, 0, 0.3]);
  p.tube(0.08, 1.3, 0.33, 0.1, 0.6, 0.2, 0.006, 'blackMatte'); // dangling cord
  p.box(0.1, 0.55, 0.2, 0.06, 0.2, 0.05, 'plastic', 0x151515, [1.2, 0, 0.2]); // dangling handset
  p.col(0, 1.2, 0.43, 0.9, 2.4, 0.06, 'metal');
  for (const sx of [-1, 1]) p.col(sx * 0.43, 1.2, 0, 0.06, 2.4, 0.9, 'metal');
  return p;
}
export function parkingMeter(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.cyl(0, 0.55, 0, 0.03, 1.1, 'metalDark', null, null, 8);
  p.rbox(0, 1.22, 0, 0.2, 0.3, 0.14, 0.05, 'metalClean', 0x7a7e7a);
  p.box(0, 1.28, -0.072, 0.12, 0.08, 0.005, 'glassDirty', 0x1a2020);
  p.glow(0, 1.28, -0.07, 0.06, 0.03, 0.004, drnd() < 0.5 ? 0xff2010 : 0x0a0a0a);
  p.box(0, 1.14, -0.075, 0.03, 0.03, 0.01, 'blackMatte');
  p.col(0, 0.7, 0, 0.12, 1.4, 0.12, 'metal', F_SOLID | F_SHOOT);
  return p;
}
export function busStop(L, x, y, z, ry = 0, len = 3.2) {
  const p = prop(L, x, y, z, ry);
  for (const sx of [-1, 1]) { p.box(sx * len / 2, 1.25, 0.6, 0.08, 2.5, 0.08, 'metalDark'); p.box(sx * len / 2, 1.25, -0.6, 0.08, 2.5, 0.08, 'metalDark'); }
  p.rbox(0, 2.55, 0, len + 0.3, 0.1, 1.5, 0.03, 'metalDark', 0x4a4e52);
  p.box(0, 1.3, 0.6, len, 1.8, 0.02, 'glassDirty', 0x303838);
  p.box(-len / 2, 1.3, 0, 0.02, 1.8, 1.1, 'glassDirty', 0x303838);
  p.box(len / 2 + 0.02, 1.3, 0, 0.06, 1.8, 1.1, 'metalDark');
  p.glow(len / 2 + 0.055, 1.35, 0, 0.005, 1.5, 0.9, drnd() < 0.5 ? 0x7a7a6a : 0x1a1a18); // ad panel
  p.box(len / 2 - 0.005, 1.35, 0, 0.005, 1.4, 0.85, 'paper', dpick([0xd8c8a0, 0xa8c0d0, 0xd0a8a0]));
  for (let i = 0; i < 3; i++) p.rbox(-0.5 + i * 0.5, 0.48, 0.35, 0.45, 0.05, 0.35, 0.01, 'metalClean', 0x9a9a9a);
  p.box(0, 0.24, 0.35, len * 0.6, 0.04, 0.05, 'metalDark');
  p.box(-len / 2 + 0.3, 2.95, -0.7, 0.05, 0.7, 0.05, 'metalDark');
  p.box(-len / 2 + 0.3, 3.1, -0.7, 0.45, 0.45, 0.02, 'paintedWhite', 0xe8e8e0);
  p.col(0, 1.3, 0.6, len, 2.6, 0.1, 'glass', F_SOLID | F_SHOOT);
  p.col(-len / 2, 1.3, 0, 0.1, 2.6, 1.2, 'glass', F_SOLID | F_SHOOT);
  p.col(len / 2, 1.3, 0, 0.1, 2.6, 1.2, 'metal');
  return p;
}

// --------------------------------------------------------------- office --
// Cubicle pod: fabric partitions with desk, chair, monitor and clutter.
export function cubicle(L, x, y, z, ry = 0, o = {}) {
  const p = prop(L, x, y, z, ry);
  const w = o.w ?? 2.2, d = o.d ?? 2.0, h = o.h ?? 1.45, fab = o.fabric ?? dpick([0x5a6470, 0x6a6458, 0x4e5a52]);
  // back + side walls (open front at -Z)
  p.rbox(0, h / 2, d / 2, w, h, 0.06, 0.02, 'fabric', fab);
  for (const sx of [-1, 1]) p.rbox(sx * w / 2, h / 2, 0, 0.06, h, d, 0.02, 'fabric', fab);
  p.box(0, h + 0.01, d / 2, w + 0.06, 0.03, 0.08, 'metal', 0x8a8e8e);
  for (const sx of [-1, 1]) p.box(sx * w / 2, h + 0.01, 0, 0.08, 0.03, d + 0.06, 'metal', 0x8a8e8e);
  // L-shaped work surface
  p.box(0, 0.74, d / 2 - 0.4, w - 0.1, 0.035, 0.7, 'woodPale', 0xc8c0b0);
  p.box(w / 2 - 0.4, 0.74, -0.1, 0.7, 0.035, d - 0.9, 'woodPale', 0xc8c0b0);
  p.box(-w / 2 + 0.3, 0.37, d / 2 - 0.4, 0.4, 0.72, 0.6, 'metal', 0x8a8e8e);
  // monitor, keyboard, tray, pinned papers, photo
  p.rbox(0.1, 1.0, d / 2 - 0.2, 0.48, 0.32, 0.04, 0.01, 'plastic', 0x1c1c1c);
  p.box(0.1, 1.0, d / 2 - 0.222, 0.44, 0.28, 0.004, drnd() < 0.2 ? 'emissiveTint' : 'plasticGloss', drnd() < 0.2 ? 0x1a3050 : 0x0a0c10);
  p.box(0.1, 0.82, d / 2 - 0.18, 0.2, 0.14, 0.12, 'plastic', 0x1c1c1c);
  p.rbox(0.05, 0.77, d / 2 - 0.5, 0.44, 0.02, 0.15, 0.006, 'plastic', 0x2a2a2a);
  p.box(-0.6, 0.8, d / 2 - 0.3, 0.3, 0.08, 0.35, 'plastic', 0x2a2a2a);
  for (let i = 0; i < 4; i++) p.box(-w / 2 + 0.4 + drnd() * (w - 0.8), 1.05 + drnd() * 0.3, d / 2 - 0.035, 0.2, 0.26, 0.004, 'paper', dpick([0xe0dcd0, 0xe8e0a0, 0xc8e0e8]), [0, 0, (drnd() - 0.5) * 0.3]);
  if (drnd() < 0.6) p.box(w / 2 - 0.3, 0.8, 0.3, 0.12, 0.1, 0.02, 'woodDark', null, [-0.3, 0.6, 0]);
  for (let i = 0; i < 3; i++) p.box(w / 2 - 0.4 + drnd() * 0.2, 0.76 + i * 0.004, -0.2 + drnd() * 0.4, 0.21, 0.004, 0.29, 'paper', 0xe0dcd0, [0, drnd() * 3, 0]);
  if (o.chair !== false) { const [cx, cz] = rotPt(x, z, ry, 0, d / 2 - 0.95); officeChair(L, cx, y, cz, ry + Math.PI + (drnd() - 0.5) * 1.2); }
  p.col(0, h / 2, d / 2, w, h, 0.08, 'fabric', F_SOLID | F_SHOOT | F_SIGHT);
  for (const sx of [-1, 1]) p.col(sx * w / 2, h / 2, 0, 0.08, h, d, 'fabric', F_SOLID | F_SHOOT | F_SIGHT);
  p.col(0, 0.4, d / 2 - 0.4, w - 0.1, 0.78, 0.7, 'wood', F_SOLID | F_SHOOT);
  return p;
}
// helper: world [x, z] of local (lx, lz) for a prop at (x, z, ry)
function rotPt(x, z, ry, lx, lz) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}
// Industrial metal shelving with boxes / bins.
export function metalShelf(L, x, y, z, ry = 0, w = 1.8, h = 2.0, fill = 0.7) {
  const p = prop(L, x, y, z, ry);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * (w / 2 - 0.03), h / 2, sz * 0.27, 0.04, h, 0.04, 'paintedBlue', 0x3a4a6a);
  const n = Math.max(3, Math.round(h / 0.5));
  for (let i = 0; i < n; i++) {
    const sy = 0.1 + i * (h - 0.15) / (n - 1);
    p.box(0, sy, 0, w, 0.03, 0.58, 'metal', 0x9a9e9a);
    p.box(0, sy - 0.03, -0.29, w, 0.06, 0.02, 'paintedYellow', 0xc89020);
    if (i === n - 1) continue;
    let bx = -w / 2 + 0.08;
    while (bx < w / 2 - 0.2) {
      const bw = 0.2 + drnd() * 0.35, bh = 0.15 + drnd() * 0.25;
      if (drnd() < fill) {
        const kind = drnd();
        if (kind < 0.55) p.rbox(bx + bw / 2, sy + bh / 2 + 0.015, (drnd() - 0.5) * 0.1, bw * 0.95, bh, 0.45, 0.01, 'fabric', dpick([0x9a8060, 0x8a7050, 0xa89070]));
        else if (kind < 0.8) p.rbox(bx + bw / 2, sy + 0.1, 0, bw * 0.9, 0.18, 0.4, 0.02, 'plastic', dpick([0x2a4a8a, 0x8a2a1a, 0x3a3a3a, 0xc8a020]));
        else p.cyl(bx + bw / 2, sy + 0.14, 0, 0.1, 0.26, 'metal', dpick([0x8a2a1a, 0x2a4a6a, 0x9a9a9a]), null, 10);
      }
      bx += bw + 0.03;
    }
  }
  p.col(0, h / 2, 0, w, h, 0.6, 'metal');
  return p;
}
// Ceiling cable tray from (x0,z0) to (x1,z1) at height y, with cables and hangers.
export function cableTray(L, x0, y, z0, x1, z1, w = 0.45) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = Math.atan2(-(z1 - z0), x1 - x0);
  const p = prop(L, (x0 + x1) / 2, y, (z0 + z1) / 2, ry);
  p.box(0, 0, 0, len, 0.015, w, 'metal', 0x8a8e8a);
  for (const sz of [-1, 1]) p.box(0, 0.05, sz * w / 2, len, 0.1, 0.012, 'metal', 0x8a8e8a);
  for (let i = 0; i < Math.floor(len / 0.3); i++) p.box(-len / 2 + 0.15 + i * 0.3, -0.005, 0, 0.03, 0.01, w, 'metal', 0x7a7e7a);
  for (let k = 0; k < 5; k++) p.cylX(0, 0.03 + (k % 2) * 0.03, -w / 2 + 0.08 + k * (w - 0.16) / 4, 0.018 + drnd() * 0.012, len, 'rubber', dpick([0x1a1a1a, 0x2a2a2a, 0x3a2a1a, 0x1a2a3a]), 6);
  for (let i = 0; i <= Math.floor(len / 1.5); i++) { const hx = -len / 2 + 0.1 + i * 1.5; for (const sz of [-1, 1]) p.box(hx, 0.3, sz * (w / 2 + 0.02), 0.012, 0.6, 0.012, 'metalDark'); }
  return p;
}
// Rectangular ductwork run with seams and hanger straps (x0..x1 at y, z).
export function duct(L, x0, y0, z0, x1, y1, z1, w = 0.6, h = 0.4) {
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  const ry = Math.atan2(-(z1 - z0), x1 - x0);
  const p = prop(L, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, ry);
  p.box(0, 0, 0, len, h, w, 'metalClean', 0xa8acac);
  for (let i = 0; i <= Math.floor(len / 1.2); i++) {
    const sx = -len / 2 + i * 1.2;
    p.box(sx, 0, 0, 0.04, h + 0.04, w + 0.04, 'metalClean', 0x8a8e8e);
    p.box(sx + 0.3, h / 2 + 0.3, 0, 0.03, 0.6, 0.02, 'metalDark');
  }
  return p;
}

// ----------------------------------------------------------- greenhouse --
export function planterBox(L, x, y, z, ry = 0, len = 2.4, o = {}) {
  const p = prop(L, x, y, z, ry);
  const dead = o.dead ?? drnd() < 0.4;
  p.box(0, 0.3, 0, len, 0.6, 0.7, 'wood', 0x8a7a60);
  for (let i = 0; i < 3; i++) p.box(0, 0.1 + i * 0.2, -0.355, len, 0.17, 0.02, 'wood', i % 2 ? 0x9a8a70 : 0x8a7a60);
  p.box(0, 0.58, 0, len - 0.08, 0.04, 0.62, 'dirt', 0x4a3a2a);
  const n = Math.floor(len / 0.35);
  for (let i = 0; i < n; i++) {
    const px = -len / 2 + 0.2 + i * (len - 0.4) / Math.max(1, n - 1);
    const hgt = dead ? 0.15 + drnd() * 0.3 : 0.3 + drnd() * 0.45;
    const col = dead ? dpick([0x5a4a2a, 0x4a3a22, 0x6a5a3a]) : dpick([0x2e4a1e, 0x3a5a22, 0x284018]);
    for (let k = 0; k < 4; k++) {
      const a = k * 1.57 + drnd();
      p.box(px + Math.cos(a) * 0.05, 0.6 + hgt / 2, Math.sin(a) * 0.05, 0.02, hgt, 0.09, 'foliage', col, [0.3 * Math.cos(a), a, 0.35 * Math.sin(a) + (dead ? 0.6 : 0)]);
    }
    if (!dead && drnd() < 0.4) p.sph(px, 0.62 + hgt * 0.8, 0, 0.05, 'plastic', dpick([0xb02018, 0xd8a020, 0x6a8a2a]), [1, 1, 1], 6);
    p.cyl(px + 0.08, 0.6 + hgt * 0.4, 0.08, 0.006, hgt * 0.8 + 0.1, 'wood', 0xa89070, null, 4); // stake
  }
  p.col(0, 0.3, 0, len, 0.6, 0.7, 'wood');
  return p;
}
export function growTable(L, x, y, z, ry = 0, len = 2.4) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.8, 0, len, 0.05, 1.1, 'metal', 0x9a9e9a);
  for (const sz of [-1, 1]) p.box(0, 0.86, sz * 0.54, len, 0.1, 0.02, 'metal', 0x9a9e9a);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * (len / 2 - 0.05), 0.4, sz * 0.5, 0.04, 0.8, 0.04, 'metal', 0x8a8e8a);
  p.box(0, 0.25, 0, len - 0.1, 0.03, 1.0, 'metal', 0x7a7e7a);
  // pots in a grid
  for (let i = 0; i < Math.floor(len / 0.3); i++) for (let k = 0; k < 3; k++) {
    if (drnd() < 0.15) continue;
    const px = -len / 2 + 0.2 + i * 0.3, pz = -0.32 + k * 0.32;
    p.frustum(px, 0.9, pz, 0.09, 0.07, 0.14, 'plastic', dpick([0x1a1a1a, 0x8a4a2a, 0x2a2a2a]), null, 8);
    const dead = drnd() < 0.5;
    p.sph(px, 1.03 + drnd() * 0.05, pz, 0.08 + drnd() * 0.04, 'foliage', dead ? 0x5a4a2a : dpick([0x2e4a1e, 0x3a5a22]), [1, dead ? 0.4 : 0.9, 1], 6);
  }
  p.col(0, 0.45, 0, len, 0.9, 1.1, 'metal', F_SOLID | F_SHOOT);
  return p;
}
// Hanging grow lamp bar (pinkish LED) with light + beam. on: lit.
export function growLight(L, x, y, z, ry = 0, len = 2.0, on = true) {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 0, 0, len, 0.05, 0.22, 0.015, 'metalDark', 0x2a2a2a);
  p.glow(0, -0.028, 0, len - 0.1, 0.005, 0.16, on ? 0xc070d0 : 0x151015);
  for (const sx of [-1, 1]) p.cyl(sx * (len / 2 - 0.1), 0.6, 0, 0.004, 1.2, 'metalDark', null, null, 4);
  if (on) {
    const lt = p.light(0, -0.3, 0, 0xd890e8, 6, 5, { flicker: 0 });
    p.beam(0, -0.05, 0, 0, -1, 0, 1.6, 0.9, 0xc080d8, lt, 0.5);
  }
  return p;
}

// -------------------------------------------------------- hotel kitchen --
export function steelTable(L, x, y, z, ry = 0, len = 1.8, d = 0.75) {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 0.9, 0, len, 0.04, d, 0.01, 'metalClean', 0xb8bcbc);
  p.box(0, 0.93, d / 2 - 0.02, len, 0.08, 0.02, 'metalClean', 0xb8bcbc);
  p.box(0, 0.25, 0, len - 0.1, 0.03, d - 0.1, 'metalClean', 0xa8acac);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(sx * (len / 2 - 0.05), 0.45, sz * (d / 2 - 0.05), 0.02, 0.9, 'metalClean', null, null, 8);
  for (let i = 0; i < 3; i++) if (drnd() < 0.6) p.cyl(-len / 2 + 0.3 + drnd() * (len - 0.6), 1.0, (drnd() - 0.5) * 0.3, 0.12 + drnd() * 0.08, 0.16, 'metalClean', 0x9a9e9e, null, 14);
  if (drnd() < 0.5) p.box(0, 0.94, -0.1, 0.45, 0.03, 0.3, 'wood', 0xc8b090); // cutting board
  for (let i = 0; i < 3; i++) if (drnd() < 0.5) p.cyl(-len / 2 + 0.2 + drnd() * (len - 0.4), 0.33, (drnd() - 0.5) * 0.4, 0.12, 0.16, 'metalClean', 0x9a9e9e, null, 12);
  p.col(0, 0.47, 0, len, 0.94, d, 'metal', F_SOLID | F_SHOOT);
  return p;
}
// Industrial range: burner grates on top, oven doors below.
export function kitchenRange(L, x, y, z, ry = 0, len = 1.8) {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 0.45, 0, len, 0.9, 0.85, 0.02, 'metalClean', 0xa8acac);
  p.box(0, 0.905, 0, len - 0.04, 0.015, 0.8, 'blackMatte');
  const n = Math.max(2, Math.round(len / 0.45));
  for (let i = 0; i < n; i++) for (const sz of [-0.2, 0.2]) {
    const bx = -len / 2 + (i + 0.5) * len / n;
    p.torus(bx, 0.93, sz, 0.12, 0.012, 'metalDark', 0x2a2a2a, [Math.PI / 2, 0, 0], 4, 14);
    p.box(bx, 0.93, sz, 0.3, 0.02, 0.02, 'metalDark', 0x2a2a2a);
    p.box(bx, 0.93, sz, 0.02, 0.02, 0.3, 'metalDark', 0x2a2a2a);
  }
  for (let i = 0; i < n; i++) p.cylZ(-len / 2 + (i + 0.5) * len / n, 0.8, -0.44, 0.025, 0.04, 'blackMatte', null, 10);
  for (let i = 0; i < Math.max(1, Math.floor(len / 0.9)); i++) {
    const ox = -len / 2 + 0.45 + i * 0.9;
    p.rbox(ox, 0.42, -0.43, 0.8, 0.55, 0.03, 0.01, 'metalClean', 0xb8bcbc);
    p.cylX(ox, 0.66, -0.47, 0.015, 0.6, 'chrome', null, 8);
    p.box(ox, 0.42, -0.447, 0.4, 0.2, 0.005, 'glassDirty', 0x151515);
  }
  p.box(0, 1.1, 0.4, len, 0.4, 0.05, 'metalClean', 0x9a9e9e); // back riser + shelf
  p.box(0, 1.32, 0.33, len, 0.03, 0.2, 'metalClean', 0x9a9e9e);
  if (drnd() < 0.7) p.cyl(-len / 4, 1.05, -0.2, 0.18, 0.22, 'metalClean', 0x8a8e8e, null, 14);
  p.col(0, 0.45, 0, len, 0.9, 0.85, 'metal');
  return p;
}
export function fryer(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 0.45, 0, 0.55, 0.9, 0.8, 0.02, 'metalClean', 0xa8acac);
  p.box(0, 0.88, -0.05, 0.45, 0.04, 0.5, 'blackMatte', 0x3a2a10); // oil
  for (const sx of [-0.1, 0.1]) { p.box(sx, 0.95, -0.05, 0.16, 0.12, 0.3, 'metalClean', 0x8a8e8e); p.box(sx, 0.98, -0.32, 0.03, 0.03, 0.28, 'blackMatte'); }
  p.box(0, 1.1, 0.38, 0.55, 0.4, 0.04, 'metalClean', 0x9a9e9e);
  p.glow(-0.15, 0.7, -0.405, 0.04, 0.04, 0.005, 0xff3010);
  p.col(0, 0.45, 0, 0.55, 0.9, 0.8, 'metal');
  return p;
}
export function exhaustHood(L, x, y, z, ry = 0, len = 3.0) {
  // (x, y, z): point under the hood's centre; y = hood bottom
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.35, 0, len, 0.7, 1.1, 'metalClean', 0xb0b4b4);
  p.box(0, 0.02, -0.5, len, 0.06, 0.1, 'metalClean', 0x9a9e9e);
  for (let i = 0; i < Math.floor(len / 0.5); i++) p.box(-len / 2 + 0.25 + i * 0.5, 0.15, 0, 0.45, 0.3, 0.9, 'metal', 0x7a7e7a, [0.5, 0, 0]); // baffle filters
  p.box(0, 1.1, 0.2, 0.6, 0.8, 0.5, 'metalClean', 0xa8acac); // duct
  for (let i = 0; i < Math.floor(len / 1.2); i++) p.glow(-len / 2 + 0.6 + i * 1.2, -0.005, -0.3, 0.3, 0.01, 0.1, 0x6a6a5a);
  return p;
}
export function kitchenShelf(L, x, y, z, ry = 0, w = 1.5) {
  const p = prop(L, x, y, z, ry);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(sx * (w / 2 - 0.02), 0.95, sz * 0.24, 0.015, 1.9, 'chrome', null, null, 6);
  for (let i = 0; i < 4; i++) {
    const sy = 0.2 + i * 0.55;
    p.box(0, sy, 0, w, 0.02, 0.5, 'chrome', 0x9a9e9e);
    for (let k = 0; k < Math.floor(w / 0.08); k++) p.box(-w / 2 + 0.04 + k * 0.08, sy + 0.012, 0, 0.006, 0.006, 0.5, 'chrome');
    let bx = -w / 2 + 0.1;
    while (bx < w / 2 - 0.15) {
      const r = 0.06 + drnd() * 0.1;
      if (drnd() < 0.7) {
        if (drnd() < 0.5) p.cyl(bx + r, sy + 0.12, 0, r, 0.22, 'metalClean', 0x9a9e9e, null, 12);
        else p.rbox(bx + r, sy + 0.1, 0, r * 2, 0.2, 0.3, 0.02, 'plastic', dpick([0xe8e8e0, 0xc8a020, 0x2a4a8a, 0x8a2a1a]));
      }
      bx += r * 2 + 0.04;
    }
  }
  p.col(0, 0.95, 0, w, 1.9, 0.5, 'metal', F_SOLID | F_SHOOT);
  return p;
}

// --------------------------------------------------------- construction --
// Scaffold bay run: len (x) by 1.2 m deep, `levels` lifts of 2 m, planked decks
// (walkable), cross braces and toe boards. Returns the prop.
export function scaffolding(L, x, y, z, ry = 0, len = 6, levels = 2, o = {}) {
  const p = prop(L, x, y, z, ry);
  const bay = 2.0, d = 1.2, lift = 2.0;
  const nb = Math.max(1, Math.round(len / bay));
  const bw = len / nb;
  const H = levels * lift;
  for (let i = 0; i <= nb; i++) for (const sz of [-d / 2, d / 2]) {
    const px = -len / 2 + i * bw;
    p.cyl(px, (H + 1.1) / 2, sz, 0.024, H + 1.1, 'metalClean', 0x9a9e9e, null, 6);
    p.box(px, 0.02, sz, 0.15, 0.04, 0.15, 'wood', 0xa89070);
  }
  for (let l = 1; l <= levels; l++) {
    const ly = l * lift;
    // deck planks
    for (let k = 0; k < 4; k++) p.box(0, ly - 0.03, -d / 2 + 0.15 + k * 0.3, len, 0.05, 0.26, 'wood', dpick([0xb09a78, 0xa08a68, 0x9a8a70]));
    for (const sz of [-d / 2, d / 2]) { p.cylX(0, ly - 0.08, sz, 0.022, len, 'metalClean', 0x9a9e9e, 6); p.cylX(0, ly + 1.0, sz, 0.022, len, 'metalClean', 0x9a9e9e, 6); p.cylX(0, ly + 0.5, sz, 0.02, len, 'metalClean', 0x9a9e9e, 6); }
    p.box(0, ly + 0.08, -d / 2 - 0.02, len, 0.15, 0.025, 'wood', 0xc8b090); // toe board
    for (let i = 0; i < nb; i++) { const px = -len / 2 + (i + 0.5) * bw; p.tube(px - bw / 2, ly - lift, d / 2, px + bw / 2, ly, d / 2, 0.02, 'metalClean', 0x8a8e8e, 6); }
    if (o.walkable !== false) p.col(0, ly - 0.03, 0, len, 0.06, d, 'wood', F_SOLID | F_SHOOT);
  }
  p.cylX(0, 0.15, 0, 0.02, len, 'metalClean', 0x9a9e9e, 6);
  if (o.netting) p.box(0, H / 2 + 0.5, d / 2 + 0.05, len, H + 1, 0.004, 'chainLink', 0x3a6a3a);
  for (let i = 0; i <= nb; i++) p.col(-len / 2 + i * bw, (H + 1.1) / 2, -d / 2, 0.06, H + 1.1, 0.06, 'metal', F_SOLID | F_SHOOT);
  for (let i = 0; i <= nb; i++) p.col(-len / 2 + i * bw, (H + 1.1) / 2, d / 2, 0.06, H + 1.1, 0.06, 'metal', F_SOLID | F_SHOOT);
  return p;
}
export function rebarBundle(L, x, y, z, ry = 0, len = 4, n = 14) {
  const p = prop(L, x, y, z, ry);
  for (const sx of [-len / 3, len / 3]) p.box(sx, 0.05, 0, 0.1, 0.1, 0.8, 'wood', 0x9a8a70);
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 6), k = i % 6;
    p.cylX((drnd() - 0.5) * 0.3, 0.13 + row * 0.035, -0.18 + k * 0.07 + (row % 2) * 0.035, 0.016, len, 'rust', dpick([0x7a5a40, 0x6a4a36, 0x8a6a4a]), 6);
  }
  for (const sx of [-len / 4, len / 4]) p.torus(sx, 0.17, 0, 0.2, 0.008, 'metalDark', null, [0, Math.PI / 2, 0], 4, 12);
  p.col(0, 0.12, 0, len, 0.24, 0.5, 'metal', F_SOLID | F_SHOOT);
  return p;
}
export function cementMixer(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  const c = dpick([0xd8a020, 0xc05020, 0x3a6a9a]);
  p.box(0, 0.45, 0, 0.9, 0.08, 1.4, 'metalDark');
  p.cylX(0, 0.25, 0.5, 0.25, 0.9, 'rubber', 0x151515, 14);
  p.tube(0, 0.45, -0.7, 0, 0.35, -1.2, 0.03, 'metalDark');
  p.box(0, 0.3, -0.5, 0.06, 0.6, 0.06, 'metalDark');
  // drum tilted toward the front
  const tilt = [-0.6, 0, 0];
  p.frustum(0, 1.15, 0.05, 0.42, 0.28, 0.5, 'paintedYellow', c, tilt, 16);
  p.frustum(0, 1.46, -0.19, 0.3, 0.42, 0.42, 'paintedYellow', c, tilt, 16);
  p.torus(0, 1.28, -0.05, 0.43, 0.03, 'paintedYellow', c, [Math.PI / 2 - 0.6, 0, 0], 5, 18);
  p.torus(0, 1.64, -0.33, 0.28, 0.03, 'metalDark', 0x2a2a2a, [Math.PI / 2 - 0.6, 0, 0], 4, 14);
  p.box(0.35, 0.8, 0.3, 0.1, 0.8, 0.1, 'metalDark');
  p.rbox(0.4, 0.75, 0.4, 0.3, 0.3, 0.35, 0.03, 'paintedYellow', c); // motor
  p.box(0, 0.47, 0.1, 0.8, 0.1, 0.02, 'blackMatte', 0x5a5a5a);
  p.col(0, 0.8, 0, 1.0, 1.6, 1.5, 'metal');
  return p;
}
export function portableToilet(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  const c = dpick([0x2a5a9a, 0x3a7a3a, 0xc85a20, 0x8a8a86]);
  p.rbox(0, 1.15, 0, 1.1, 2.2, 1.1, 0.05, 'plastic', c);
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) p.box(sx * 0.555, 1.1, -0.4 + i * 0.16, 0.02, 1.9, 0.05, 'plastic', c);
  p.rbox(0, 2.32, 0, 1.2, 0.16, 1.2, 0.06, 'plastic', 0xe8e8e0); // roof
  p.rbox(0, 1.1, -0.56, 0.8, 1.95, 0.05, 0.03, 'plastic', c); // door
  p.box(0.3, 1.1, -0.6, 0.04, 0.2, 0.04, 'plastic', 0x1a1a1a);
  p.box(0.3, 1.3, -0.59, 0.1, 0.05, 0.01, 'emissiveTint', drnd() < 0.5 ? 0xa02010 : 0x207030); // occupied indicator
  p.box(0, 1.75, -0.59, 0.3, 0.2, 0.004, 'paintedWhite', 0xe8e8e0);
  p.col(0, 1.2, 0, 1.15, 2.4, 1.15, 'plastic');
  return p;
}
// Site office trailer (len along X). Steps + door on the -Z side.
export function siteTrailer(L, x, y, z, ry = 0, len = 7) {
  const p = prop(L, x, y, z, ry);
  const c = dpick([0xd8d4c8, 0xb8b4a8, 0xc8b890]);
  p.box(0, 0.45, 0, len - 0.4, 0.3, 2.3, 'metalDark', 0x222222);
  p.rbox(0, 1.85, 0, len, 2.5, 2.6, 0.04, 'paintedWhite', c);
  for (let i = 0; i < Math.floor(len / 0.3); i++) p.box(-len / 2 + 0.15 + i * 0.3, 1.85, -1.305, 0.04, 2.4, 0.02, 'paintedWhite', new THREE.Color(c).multiplyScalar(0.85).getHex());
  for (const wx of [-len / 2 + 1.2, len / 2 - 1.2]) { p.box(wx, 2.1, -1.31, 1.2, 0.8, 0.02, 'glassDirty', 0x1a2024); p.box(wx, 2.1, -1.32, 1.3, 0.9, 0.01, 'metalDark', 0x3a3a3a); }
  p.box(0, 1.65, -1.31, 0.9, 2.0, 0.03, 'metal', 0x9a9e9e);
  p.box(0.3, 1.6, -1.33, 0.1, 0.03, 0.03, 'chrome');
  // steps + landing
  for (let i = 0; i < 3; i++) p.box(0, 0.15 + i * 0.2, -1.55 - (2 - i) * 0.25, 1.2, 0.05, 0.3, 'diamond');
  p.box(0, 0.62, -1.5, 1.4, 0.05, 0.4, 'diamond');
  for (const sx of [-0.65, 0.65]) p.tube(sx, 0.15, -2.2, sx, 1.5, -1.5, 0.02, 'metalDark');
  for (const sx of [-len / 3, len / 3]) for (const sz of [-0.9, 0.9]) p.box(sx, 0.18, sz, 0.3, 0.36, 0.3, 'concrete'); // blocks
  p.glow(-0.8, 2.5, -1.35, 0.2, 0.12, 0.04, 0xffe0b0);
  p.col(0, 1.75, 0, len, 2.7, 2.6, 'metal');
  for (let i = 0; i < 3; i++) p.col(0, 0.08 + i * 0.2, -1.55 - (2 - i) * 0.25, 1.2, 0.16 + i * 0.2, 0.3, 'metal', F_SOLID | F_SHOOT);
  return p;
}
// Concrete formwork panels with props (len along X, h tall).
export function formwork(L, x, y, z, ry = 0, len = 4, h = 2.8) {
  const p = prop(L, x, y, z, ry);
  const n = Math.max(1, Math.round(len / 1.2));
  for (let i = 0; i < n; i++) {
    const px = -len / 2 + (i + 0.5) * len / n;
    p.box(px, h / 2, 0, len / n - 0.02, h, 0.03, 'wood', dpick([0xc89a50, 0xb88a40, 0xd8a860])); // plywood face (orange formply)
    for (const sy of [0.3, h / 2, h - 0.3]) p.box(px, sy, 0.08, len / n, 0.1, 0.1, 'metalDark', 0x3a3a3a); // walers
    p.box(px, h / 2, 0.05, 0.08, h, 0.08, 'wood', 0xa89070);
    p.tube(px, h * 0.7, 0.1, px, 0.02, 1.6, 0.03, 'metalClean', 0xd8a020); // push-pull prop
  }
  for (let i = 0; i < n * 3; i++) p.cylZ(-len / 2 + 0.2 + drnd() * (len - 0.4), 0.3 + drnd() * (h - 0.6), -0.05, 0.012, 0.15, 'rust', 0x5a4a3a, 5); // tie rods
  p.col(0, h / 2, 0.05, len, h, 0.2, 'wood');
  return p;
}
// Pad-mount / substation transformer with cooling fins, bushings and cables.
export function transformer(L, x, y, z, ry = 0, o = {}) {
  const p = prop(L, x, y, z, ry);
  const w = o.w ?? 2.2, d = o.d ?? 1.6, h = o.h ?? 2.2;
  const c = o.color ?? 0x6a7a6a;
  p.box(0, 0.1, 0, w + 0.4, 0.2, d + 0.4, 'concrete');
  p.rbox(0, 0.2 + h / 2, 0, w, h, d, 0.03, 'paintedGreen', c);
  for (const sx of [-1, 1]) for (let i = 0; i < 10; i++) p.box(sx * (w / 2 + 0.12), 0.25 + h * 0.45, -d / 2 + 0.12 + i * (d - 0.24) / 9, 0.24, h * 0.8, 0.025, 'paintedGreen', c); // fins
  for (let i = 0; i < 3; i++) {
    const bx = -w / 3 + i * w / 3;
    for (let k = 0; k < 4; k++) p.cyl(bx, 0.3 + h + k * 0.08, 0.1, 0.07 - k * 0.008, 0.06, 'plastic', 0x8a5a3a, null, 10); // bushings
    p.tube(bx, h + 0.6, 0.1, bx + 0.1, h + 2.2, 0.8, 0.018, 'blackMatte');
  }
  p.box(0, 0.2 + h * 0.6, -d / 2 - 0.01, 0.5, 0.35, 0.01, 'paintedYellow', 0xd8b020); // DANGER plate
  p.box(0, 0.2 + h * 0.6, -d / 2 - 0.015, 0.3, 0.06, 0.004, 'blackMatte');
  p.col(0, 0.2 + h / 2, 0, w + 0.5, h + 0.4, d, 'metal');
  return p;
}
// Portable flood light tower / work light: bright light + beam aimed forward-down.
export function floodLight(L, x, y, z, ry = 0, o = {}) {
  const p = prop(L, x, y, z, ry);
  const h = o.h ?? 4.5, on = o.on !== false;
  const tower = o.tower !== false;
  if (tower) {
    p.rbox(0, 0.55, 0, 1.2, 0.7, 2.0, 0.05, 'paintedYellow', 0xd8a020);
    for (const sz of [-0.6, 0.6]) p.cylX(0, 0.25, sz, 0.25, 1.3, 'rubber', 0x151515, 12);
    p.cyl(0, h / 2 + 0.6, 0.6, 0.06, h - 0.6, 'metalClean', 0x9a9e9e, null, 8);
  } else {
    for (let i = 0; i < 3; i++) { const a = i * 2.094; p.tube(0, h * 0.6, 0, Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6, 0.02, 'paintedYellow', 0xd8a020); }
    p.cyl(0, h * 0.8, 0, 0.025, h * 0.4, 'metalDark', null, null, 6);
  }
  const hy = tower ? h + 0.3 : h, hz = tower ? 0.6 : 0;
  p.box(0, hy, hz, 1.4, 0.05, 0.05, 'metalDark');
  for (const sx of [-0.45, 0.45]) {
    p.rbox(sx, hy + 0.15, hz - 0.05, 0.4, 0.34, 0.16, 0.03, 'metalDark', 0x2a2a2a, [0.35, 0, 0]);
    p.glow(sx, hy + 0.13, hz - 0.14, 0.34, 0.28, 0.01, on ? 0xfff6e0 : 0x1a1a18, [0.35, 0, 0]);
  }
  if (on) {
    const lt = p.light(0, hy - 0.3, hz - 1.6, o.color ?? 0xfff0d8, o.intensity ?? 45, o.range ?? 26, { flicker: o.flicker ?? 0 });
    p.beam(0, hy + 0.1, hz - 0.2, 0, -0.45, -1, o.beamLen ?? 12, 3.5, 0xfff0d8, lt, 0.8);
  }
  p.col(0, tower ? 0.55 : h * 0.4, tower ? 0 : 0, tower ? 1.2 : 0.6, tower ? 1.1 : h * 0.8, tower ? 2.0 : 0.6, 'metal', F_SOLID | F_SHOOT);
  return p;
}

// -------------------------------------------------------------- airport --
export function checkInDesk(L, x, y, z, ry = 0, n = 2) {
  // row of n check-in positions along X; passengers side = -Z
  const p = prop(L, x, y, z, ry);
  const w = n * 1.6;
  p.box(0, 0.55, 0, w, 1.1, 0.7, 'woodPale', 0xd8d4cc);
  p.rbox(0, 1.12, -0.12, w + 0.05, 0.04, 0.5, 0.01, 'marble', 0xe0e0d8);
  p.box(0, 0.52, -0.355, w, 1.0, 0.01, 'metalClean', 0xa8acac);
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + 0.8 + i * 1.6;
    // bag scale / belt in front of each desk
    p.box(cx + 0.55, 0.25, -0.75, 0.9, 0.5, 0.7, 'metalClean', 0x9a9e9e);
    p.box(cx + 0.55, 0.51, -0.75, 0.8, 0.02, 0.6, 'rubber', 0x1a1a1a);
    // monitor + position sign on a post
    p.rbox(cx - 0.2, 1.3, 0.1, 0.4, 0.28, 0.03, 0.01, 'plastic', 0x1c1c1c, [0.2, Math.PI, 0]);
    p.cyl(cx, 1.75, 0.3, 0.025, 1.3, 'metalClean', null, null, 8);
    p.box(cx, 2.4, 0.3, 0.8, 0.35, 0.06, 'metalDark', 0x1a1a1a);
    p.glow(cx, 2.4, 0.265, 0.72, 0.26, 0.01, drnd() < 0.5 ? 0x2a4a8a : 0x0c1018);
    p.box(cx + 0.55, 0.55, -0.9, 0.35, 0.25, 0.01, 'plastic', 0x0a0c10);
  }
  // queue stanchions with belt
  for (let i = 0; i < n + 1; i++) {
    const sx = -w / 2 + i * 1.6;
    p.cyl(sx, 0.48, -2.0, 0.03, 0.96, 'chrome', null, null, 8);
    p.cyl(sx, 0.02, -2.0, 0.15, 0.03, 'chrome', null, null, 12);
    if (i < n) p.box(sx + 0.8, 0.88, -2.0, 1.55, 0.05, 0.01, 'fabric', 0x1a2a6a);
  }
  p.col(0, 0.58, 0, w, 1.16, 0.8, 'wood');
  for (let i = 0; i < n; i++) p.col(-w / 2 + 1.35 + i * 1.6, 0.26, -0.75, 0.9, 0.52, 0.7, 'metal', F_SOLID | F_SHOOT);
  return p;
}
// Departure/arrival flap board. (x, y, z) = centre of the board face; ry = facing.
export function departureBoard(L, x, y, z, ry = 0, w = 4, h = 2.2, o = {}) {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 0, 0.08, w + 0.2, h + 0.2, 0.18, 0.03, 'metalDark', 0x1a1c20);
  p.box(0, 0, -0.012, w, h, 0.01, 'blackMatte', 0x050608);
  const on = o.on !== false;
  const rows = Math.floor((h - 0.3) / 0.16);
  p.glow(0, h / 2 - 0.1, -0.02, w - 0.1, 0.1, 0.005, on ? 0xd8d8d0 : 0x151515); // header bar
  for (let r = 0; r < rows; r++) {
    const ry2 = h / 2 - 0.3 - r * 0.16;
    if (!on) continue;
    const cancelled = drnd() < 0.55;
    let cx = -w / 2 + 0.1;
    // time | flight | destination | gate | status
    for (const [cw, col] of [[0.35, 0xe8b030], [0.45, 0xe8b030], [w * 0.4, 0xe8e8e0], [0.25, 0xe8b030], [0.7, cancelled ? 0xff3020 : 0x30e070]]) {
      let tx = cx;
      const chars = Math.max(2, Math.floor(cw / 0.07));
      for (let k = 0; k < chars; k++) {
        if (drnd() < 0.18) { tx += 0.07; continue; }
        p.glow(tx + 0.028, ry2, -0.02, 0.055, 0.09, 0.004, col);
        tx += 0.07;
      }
      cx += cw + 0.1;
      if (cx > w / 2 - 0.2) break;
    }
  }
  if (on && o.light !== false) p.light(0, 0, -1.2, 0xe8c080, 4, 6, { flicker: 0.1 });
  if (o.hanging) for (const sx of [-w / 3, w / 3]) p.cyl(sx, h / 2 + 1.0, 0.08, 0.015, 2.0, 'metalDark', null, null, 6);
  return p;
}
export function suitcase(L, x, y, z, ry = 0, color, upright = drnd() < 0.5) {
  const p = prop(L, x, y, z, ry);
  const c = color ?? dpick([0x1a1a1a, 0x2a3a5a, 0x6a1a14, 0x3a4a3a, 0x8a7a5a, 0x4a2a4a, 0xc8b8a0]);
  if (upright) {
    p.rbox(0, 0.36, 0, 0.44, 0.62, 0.26, 0.05, 'plastic', c);
    p.box(0, 0.36, 0, 0.45, 0.02, 0.27, 'plastic', new THREE.Color(c).multiplyScalar(0.6).getHex());
    for (const sx of [-0.12, 0.12]) p.cyl(sx, 0.75, 0.1, 0.01, 0.2, 'chrome', null, null, 6);
    p.box(0, 0.86, 0.1, 0.28, 0.025, 0.03, 'plastic', 0x1a1a1a);
    for (const sx of [-0.17, 0.17]) p.cylX(sx, 0.03, 0.1, 0.028, 0.03, 'rubber', null, 8);
  } else {
    p.rbox(0, 0.13, 0, 0.62, 0.24, 0.44, 0.05, 'plastic', c);
    p.box(0, 0.13, 0, 0.63, 0.02, 0.45, 'plastic', new THREE.Color(c).multiplyScalar(0.6).getHex());
    p.box(0, 0.26, 0, 0.18, 0.02, 0.04, 'plastic', 0x1a1a1a);
  }
  if (drnd() < 0.4) p.box(0.1, upright ? 0.75 : 0.26, upright ? 0.14 : 0.1, 0.05, 0.08, 0.005, 'plastic', 0xe8d890); // tag
  return p;
}
// Scattered pile of luggage (visual; small collider).
export function luggagePile(L, x, y, z, n = 6, r = 1.2) {
  for (let i = 0; i < n; i++) {
    const a = drnd() * 6.28, d = Math.sqrt(drnd()) * r;
    suitcase(L, x + Math.cos(a) * d, y, z + Math.sin(a) * d, drnd() * 6.28);
  }
  const p = prop(L, x, y, z, 0);
  p.col(0, 0.25, 0, r * 1.2, 0.5, r * 1.2, 'fabric', F_SOLID | F_SHOOT);
  return p;
}
// Airport luggage trolley.
export function luggageCart(L, x, y, z, ry = 0, loaded = true) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.18, 0, 0.55, 0.03, 0.8, 'metalClean', 0xa8acac);
  for (const sx of [-0.25, 0.25]) { p.tube(sx, 0.18, 0.4, sx, 1.05, 0.5, 0.015, 'metalClean'); p.tube(sx, 0.18, -0.4, sx, 0.45, -0.42, 0.015, 'metalClean'); }
  p.cylX(0, 1.05, 0.5, 0.02, 0.56, 'plastic', 0x1a1a1a, 8);
  p.box(0, 0.7, 0.45, 0.5, 0.25, 0.01, 'paintedBlue', 0x2a4a8a);
  for (const sx of [-0.24, 0.24]) for (const sz of [-0.32, 0.32]) p.cylX(sx, 0.07, sz, 0.07, 0.04, 'rubber', null, 10);
  if (loaded) { suitcase(L, ...rotPtXZ(x, z, ry, 0, 0.05), y + 0.2, ry, undefined, false); if (drnd() < 0.6) suitcase(L, ...rotPtXZ(x, z, ry, 0, -0.05), y + 0.44, ry + 0.2, undefined, false); }
  p.col(0, 0.5, 0, 0.6, 1.0, 0.9, 'metal', F_SOLID | F_SHOOT);
  return p;
}
function rotPtXZ(x, z, ry, lx, lz) { const [a, b] = rotPt(x, z, ry, lx, lz); return [a, b]; }
// Baggage dolly (towed train cart), open sides with a canvas roof.
export function baggageCart(L, x, y, z, ry = 0, o = {}) {
  const p = prop(L, x, y, z, ry);
  const len = 3.0, w = 1.5;
  p.box(0, 0.45, 0, w, 0.08, len, 'metalDark', 0x3a3a3a);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { p.cyl(sx * (w / 2 - 0.05), 1.1, sz * (len / 2 - 0.05), 0.03, 1.3, 'metalDark', null, null, 6); tyre(p, sx * 0.6, 0.22, sz * 1.1, 0.22, 0.14, 'metalDark', 0x5a5a5a, false, false); }
  p.rbox(0, 1.8, 0, w + 0.1, 0.08, len + 0.1, 0.03, 'fabric', o.color ?? dpick([0x2a4a8a, 0x8a1a14, 0x3a5a3a]));
  p.tube(0, 0.45, -len / 2, 0, 0.4, -len / 2 - 0.9, 0.03, 'metalDark');
  if (o.loaded !== false) for (let i = 0; i < 5; i++) suitcase(L, ...rotPtXZ(x, z, ry, (drnd() - 0.5) * 0.9, -1.1 + i * 0.55), y + 0.5, ry + (drnd() - 0.5) * 0.6, undefined, false);
  p.col(0, 0.95, 0, w, 1.9, len, 'metal', F_SOLID | F_SHOOT);
  return p;
}
// Straight belt conveyor (len along X), with rollers and side guards.
export function conveyor(L, x, y, z, ry = 0, len = 6, h = 0.7, o = {}) {
  const p = prop(L, x, y, z, ry);
  p.box(0, h, 0, len, 0.04, 0.8, 'rubber', 0x1a1a1a);
  p.box(0, h - 0.1, 0, len, 0.16, 0.9, 'metalClean', 0x8a8e8e);
  for (const sz of [-1, 1]) p.box(0, h + 0.12, sz * 0.46, len, 0.25, 0.03, 'metalClean', 0xa8acac);
  for (let i = 0; i <= Math.floor(len / 1.5); i++) for (const sz of [-0.38, 0.38]) p.box(-len / 2 + 0.1 + i * 1.5, (h - 0.15) / 2, sz, 0.06, h - 0.15, 0.06, 'metalDark');
  for (const sx of [-1, 1]) p.cylZ(sx * len / 2, h - 0.02, 0, 0.08, 0.82, 'metalClean', null, 10);
  if (o.bags !== false) for (let i = 0; i < Math.floor(len / 1.4); i++) if (drnd() < 0.6) suitcase(L, ...rotPtXZ(x, z, ry, -len / 2 + 0.7 + i * 1.4, 0), y + h + 0.02, ry + (drnd() - 0.5) * 0.5, undefined, false);
  p.col(0, (h + 0.25) / 2, 0, len, h + 0.25, 0.95, 'metal', F_SOLID | F_SHOOT);
  return p;
}
// Oval baggage-claim carousel (sloped plate ring around a central island).
export function carousel(L, x, y, z, ry = 0, len = 8, w = 3) {
  const p = prop(L, x, y, z, ry);
  const straight = len - w;
  p.rbox(0, 0.3, 0, straight + 0.8, 0.6, 0.8, 0.05, 'metalClean', 0x9a9e9e); // centre island
  p.box(0, 0.62, 0, straight + 0.9, 0.04, 0.9, 'metalClean', 0xb8bcbc);
  for (const sz of [-1, 1]) {
    p.box(0, 0.3, sz * (w / 2 - 0.35), straight, 0.6, 0.7, 'metalClean', 0x8a8e8e);
    for (let i = 0; i < Math.floor(straight / 0.45); i++) p.box(-straight / 2 + 0.22 + i * 0.45, 0.62, sz * (w / 2 - 0.35), 0.42, 0.03, 0.7, 'rubber', 0x1c1c1e, [sz * 0.25, 0, 0]);
    p.box(0, 0.55, sz * (w / 2 - 0.02), straight, 0.2, 0.05, 'metalClean', 0xb8bcbc);
  }
  for (const sx of [-1, 1]) {
    const cx = sx * straight / 2;
    p.geo(halfCylGeo(14), 'metalClean', cx, 0.3, 0, [0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0], [w, 0.6, w], 0x8a8e8e);
    for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * Math.PI; p.box(cx + sx * Math.cos(a) * (w / 2 - 0.35), 0.62, Math.sin(a) * (w / 2 - 0.35), 0.42, 0.03, 0.7, 'rubber', 0x1c1c1e, [0, -a, 0]); }
  }
  for (let i = 0; i < 6; i++) { const t = drnd() * straight - straight / 2; suitcase(L, ...rotPtXZ(x, z, ry, t, (drnd() < 0.5 ? -1 : 1) * (w / 2 - 0.35)), y + 0.64, ry + drnd(), undefined, false); }
  p.col(0, 0.35, 0, len, 0.7, w, 'metal', F_SOLID | F_SHOOT);
  return p;
}
// Row of linked airport/waiting-room seats (n seats along X), optional back-to-back.
export function seatingRow(L, x, y, z, ry = 0, n = 5, o = {}) {
  const p = prop(L, x, y, z, ry);
  const c = o.color ?? dpick([0x2a3a5a, 0x3a3a3a, 0x5a2a2a, 0x2a4a4a]);
  const w = n * 0.62;
  const row = (sz, flip) => {
    p.box(0, 0.36, sz, w, 0.05, 0.06, 'metalClean', 0x9a9e9e);
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + 0.31 + i * 0.62;
      p.rbox(cx, 0.45, sz - flip * 0.02, 0.52, 0.06, 0.46, 0.025, 'plastic', c);
      p.rbox(cx, 0.72, sz + flip * 0.22, 0.52, 0.5, 0.05, 0.025, 'plastic', c, [flip * -0.15, 0, 0]);
      if (i > 0) p.box(cx - 0.31, 0.6, sz, 0.05, 0.03, 0.4, 'metalClean', 0x9a9e9e);
    }
  };
  row(0, 1);
  if (o.double) row(-0.55, -1);
  for (const sx of [-w / 2 + 0.2, w / 2 - 0.2]) p.box(sx, 0.18, o.double ? -0.27 : 0, 0.06, 0.36, o.double ? 1.0 : 0.45, 'metalClean', 0x8a8e8e);
  if (drnd() < 0.4) suitcase(L, ...rotPtXZ(x, z, ry, -w / 2 + 0.31 + Math.floor(drnd() * n) * 0.62, -0.5), y, ry + drnd(), undefined, true);
  p.col(0, 0.45, o.double ? -0.27 : 0, w, 0.9, o.double ? 1.1 : 0.55, 'metal', F_SOLID | F_SHOOT);
  return p;
}
// Walk-through metal detector arch; passage along Z. on: status lights lit.
export function metalDetector(L, x, y, z, ry = 0, on = true) {
  const p = prop(L, x, y, z, ry);
  for (const sx of [-1, 1]) {
    p.rbox(sx * 0.48, 1.05, 0, 0.14, 2.1, 0.6, 0.04, 'plastic', 0xc8c8c0);
    for (let i = 0; i < 6; i++) p.glow(sx * 0.405, 0.4 + i * 0.28, -0.22, 0.01, 0.05, 0.05, on ? (i < 2 ? 0x30ff60 : 0x103010) : 0x101010);
  }
  p.rbox(0, 2.18, 0, 1.12, 0.2, 0.62, 0.04, 'plastic', 0xc8c8c0);
  p.box(0, 2.18, -0.315, 0.3, 0.1, 0.01, 'blackMatte');
  p.glow(-0.07, 2.18, -0.322, 0.05, 0.05, 0.005, on ? 0x30ff60 : 0x101010);
  p.glow(0.07, 2.18, -0.322, 0.05, 0.05, 0.005, on ? 0x3a0808 : 0x101010);
  p.box(0, 0.01, 0, 0.9, 0.02, 0.8, 'rubber', 0x2a2a2a);
  for (const sx of [-1, 1]) p.col(sx * 0.48, 1.05, 0, 0.16, 2.1, 0.6, 'plastic');
  p.col(0, 2.18, 0, 1.12, 0.2, 0.6, 'plastic');
  return p;
}
// X-ray bag scanner with in/out rollers (len along X).
export function xrayScanner(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 0.85, 0, 1.6, 1.3, 1.1, 0.06, 'plastic', 0xc8c8c0);
  p.box(0, 0.62, -0.001, 1.62, 0.5, 0.8, 'blackMatte');
  for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) p.box(sx * (0.8 + 0.12 * 0.5 + 0.15), 0.7, -0.35 + k * 0.14, 0.02, 0.4, 0.12, 'plastic', 0x1a1a1a); // lead curtains
  for (const sx of [-1, 1]) { p.box(sx * 1.6, 0.7, 0, 1.6, 0.06, 0.8, 'metalClean', 0x9a9e9e); for (let i = 0; i < 12; i++) p.cylZ(sx * (0.9 + i * 0.13), 0.74, 0, 0.025, 0.76, 'chrome', null, 8); for (const sz of [-0.35, 0.35]) p.box(sx * 1.6, 0.35, sz, 1.4, 0.7, 0.04, 'metalClean', 0x8a8e8e); }
  p.rbox(0, 1.72, 0.4, 0.5, 0.35, 0.05, 0.02, 'plastic', 0x1c1c1c, [0.3, 0, 0]);
  p.glow(0, 1.72, 0.37, 0.44, 0.29, 0.005, 0x305a70, [0.3, 0, 0]);
  p.col(0, 0.75, 0, 4.8, 1.5, 1.1, 'metal', F_SOLID | F_SHOOT);
  return p;
}
// Baggage tug / tow tractor.
export function baggageTug(L, x, y, z, ry = 0, color = 0xd8a020) {
  const p = prop(L, x, y, z, ry);
  p.rbox(0, 0.6, 0, 1.4, 0.6, 2.4, 0.08, 'carPaint', color);
  p.rbox(0, 1.0, -0.6, 1.3, 0.35, 0.9, 0.08, 'carPaint', color);
  p.rbox(0, 0.95, 0.5, 0.5, 0.5, 0.5, 0.05, 'plastic', 0x1a1a1a); // seat
  p.rbox(0, 1.3, 0.62, 0.5, 0.5, 0.1, 0.04, 'plastic', 0x1a1a1a);
  p.torus(0, 1.3, 0.05, 0.18, 0.02, 'plastic', 0x151515, [1.0, 0, 0], 5, 14);
  for (const sx of [-0.62, 0.62]) for (const sz of [0.7, 1.2]) p.cyl(sx, 1.6, sz - 0.2, 0.025, 1.6, 'metalDark', null, null, 6);
  p.rbox(0, 2.42, 0.3, 1.4, 0.06, 1.2, 0.03, 'metalDark', 0x2a2a2a);
  p.glow(0, 2.5, 0.3, 0.15, 0.1, 0.15, 0xc07010);
  for (const sx of [-1, 1]) for (const sz of [-0.8, 0.8]) tyre(p, sx * 0.72, 0.32, sz, 0.32, 0.22, 'metalDark', 0x6a6a6a, false, false);
  for (const sx of [-1, 1]) p.glow(sx * 0.45, 0.75, -1.21, 0.2, 0.1, 0.01, 0x3a3830);
  p.box(0, 0.4, 1.25, 0.2, 0.15, 0.2, 'metalDark'); // hitch
  p.col(0, 0.8, 0, 1.4, 1.6, 2.4, 'metal');
  return p;
}
// Truck-mounted passenger stairs; the stair side faces +Z (top at -Z end).
export function aircraftStairs(L, x, y, z, ry = 0, h = 3.5, o = {}) {
  const p = prop(L, x, y, z, ry);
  const len = h * 1.4;
  p.box(0, 0.6, 0, 1.8, 0.4, len + 1.5, 'carPaint', o.color ?? 0xe8e8e0);
  for (const sx of [-0.8, 0.8]) for (const sz of [-len / 2, len / 2]) tyre(p, sx, 0.35, sz, 0.35, 0.22, 'metalDark', 0x6a6a6a, false, false);
  p.rbox(0, 1.25, len / 2 + 0.3, 1.8, 1.0, 1.1, 0.08, 'carPaint', o.color ?? 0xe8e8e0);
  p.box(0, 1.45, len / 2 + 0.86, 1.5, 0.5, 0.02, 'glassDirty', 0x1a2024);
  const steps = Math.round((h - 0.8) / 0.2);
  for (let i = 0; i < steps; i++) {
    const sy = 0.8 + (i + 1) * (h - 0.8) / steps, sz = len / 2 - (i + 0.5) * len / steps;
    p.box(0, sy - 0.02, sz, 1.1, 0.04, len / steps + 0.02, 'diamond');
    if (o.walkable !== false) p.col(0, sy - 0.1, sz, 1.1, 0.2, len / steps, 'metal', F_SOLID | F_SHOOT);
  }
  p.box(0, h, -len / 2 - 0.5, 1.3, 0.06, 1.1, 'diamond');
  for (const sx of [-0.6, 0.6]) { p.tube(sx, 1.8, len / 2, sx, h + 1.0, -len / 2, 0.03, 'metalClean'); p.box(sx, (h + 0.8) / 2, 0, 0.06, h - 0.6, 0.06, 'metalDark', null, [Math.atan2(len, h) - Math.PI / 2 + Math.PI / 2, 0, 0]); for (let i = 0; i < 4; i++) p.tube(sx, 0.8 + i * (h - 0.8) / 4, len / 2 - i * len / 4, sx, 1.8 + i * (h - 0.8) / 4, len / 2 - i * len / 4, 0.015, 'metalClean'); }
  if (o.walkable !== false) p.col(0, h - 0.1, -len / 2 - 0.5, 1.3, 0.2, 1.1, 'metal', F_SOLID | F_SHOOT);
  p.col(0, 0.6, 0, 1.8, 0.8, len + 1.5, 'metal', F_SOLID | F_SHOOT);
  p.col(0, 1.25, len / 2 + 0.3, 1.8, 1.0, 1.1, 'metal');
  return p;
}
// Jet-bridge tunnel segment (len along -Z from the terminal) on a wheeled leg.
export function jetBridge(L, x, y, z, ry = 0, len = 12, o = {}) {
  const p = prop(L, x, y, z, ry);
  const fy = o.floorY ?? 4.2, w = 2.6, h = 2.6;
  p.rbox(0, fy + h / 2, -len / 2, w, h, len, 0.1, 'metal', 0xb8bcbc);
  for (let i = 0; i < Math.floor(len / 1.2); i++) for (const sx of [-1, 1]) p.box(sx * (w / 2 + 0.01), fy + h / 2, -0.6 - i * 1.2, 0.02, h - 0.2, 0.05, 'metal', 0x9a9e9e);
  for (const sx of [-1, 1]) p.box(sx * (w / 2 + 0.012), fy + h * 0.6, -len / 2, 0.01, 0.6, len - 1, 'glassDirty', 0x1a2024);
  p.box(0, fy + h + 0.08, -len / 2, 0.5, 0.2, len, 'metalDark');
  p.rbox(0, fy + h / 2, -len - 0.8, w + 0.6, h + 0.4, 1.6, 0.15, 'metal', 0x9a9e9e); // cab/rotunda
  p.box(0, fy + h / 2, -len - 1.62, w, h, 0.05, 'rubber', 0x1a1a1a); // canopy bellows
  // drive leg
  const lz = -len * 0.7;
  for (const sx of [-0.5, 0.5]) p.box(sx, fy / 2, lz, 0.2, fy, 0.2, 'metalDark');
  p.box(0, 0.6, lz, 2.4, 0.5, 0.8, 'paintedYellow', 0xc8a020);
  for (const sx of [-1, 1]) tyre(p, sx * 1.0, 0.45, lz, 0.45, 0.35, 'metalDark', 0x6a6a6a, false, false);
  p.glow(0, fy + h - 0.05, -len / 2, 0.2, 0.02, len - 1, 0xc8d8e0);
  p.col(0, fy + h / 2, -len / 2, w, h, len, 'metal');
  p.col(0, fy / 2, lz, 1.2, fy, 0.6, 'metal');
  return p;
}
// Runway / taxiway edge light: color 0x2050ff taxi blue, 0x30ff60 centreline, 0xffffff edge, 0xff2010 end.
export function runwayLight(L, x, y, z, color = 0x3060ff, o = {}) {
  const p = prop(L, x, y, z, 0);
  p.cyl(0, 0.15, 0, 0.03, 0.3, 'paintedYellow', 0xd8b020, null, 6);
  p.cyl(0, 0.33, 0, 0.06, 0.08, 'emissiveTint', color, null, 8);
  p.cyl(0, 0.38, 0, 0.065, 0.02, 'metalDark', null, null, 8);
  if (o.light) L.light(x, y + 0.5, z, color, o.intensity ?? 2, o.range ?? 4, { flicker: 0 });
  return p;
}
// C-130-style transport plane, nose toward -Z. opts.rampDown (default true) and
// hollow (default true): cargo hold with floor at y+1.1, walkable ramp at the tail.
export function transportPlane(L, x, y, z, ry = 0, o = {}) {
  const p = prop(L, x, y, z, ry);
  const c = o.color ?? 0x5a6258;
  const fy = 1.1, R = 2.1, cy = fy + 1.4, flen = 24;
  // fuselage
  p.cylZ(0, cy, 0, R, flen, 'metal', c, 24);
  p.sph(0, cy - 0.2, -flen / 2, R, 'metal', c, [1, 0.95, 1.3], 18); // nose
  p.sph(0, cy + 0.1, -flen / 2 - 1.5, 1.2, 'metal', 0x3a3e3a, [1, 0.8, 1.2], 12); // radome
  for (const sx of [-0.55, 0, 0.55]) p.box(sx, cy + 1.0, -flen / 2 - 0.95, 0.5, 0.35, 0.05, 'glassDirty', 0x1a2024, [-0.7, sx * -0.6, 0]); // cockpit windows
  p.frustum(0, cy + 0.9, flen / 2 + 3.5, 0.5, R, 7, 'metal', c, [-Math.PI / 2 - 0.12, 0, 0], 20); // upswept tail cone
  // wing + engines
  const wy = cy + R - 0.1;
  p.rbox(0, wy, -1.5, 40, 0.35, 4.0, 0.12, 'metal', c);
  for (const ex of [-12, -6, 6, 12]) {
    p.cylZ(ex, wy - 0.45, -3.4, 0.7, 4.0, 'metal', c, 14);
    p.sph(ex, wy - 0.45, -5.4, 0.55, 'metalDark', 0x2a2a2a, [1, 1, 0.6], 10);
    for (let k = 0; k < 4; k++) p.box(ex, wy - 0.45, -5.75, 0.25, 4.0, 0.06, 'metalDark', 0x1a1a1a, [0, 0, k * 0.785 + ex]);
    p.box(ex, wy - 1.1, -3.2, 0.5, 0.4, 2.2, 'metal', c);
  }
  // tail fin + stabilisers
  p.rbox(0, cy + 4.8, flen / 2 + 3.8, 0.4, 7.0, 4.5, 0.15, 'metal', c, [0.25, 0, 0]);
  p.rbox(0, cy + 1.6, flen / 2 + 5.0, 15, 0.25, 3.0, 0.1, 'metal', c);
  // landing gear sponsons + wheels
  for (const sx of [-1, 1]) {
    p.rbox(sx * (R - 0.1), fy + 0.3, 1.0, 1.0, 1.4, 7.0, 0.3, 'metal', c);
    for (const sz of [-0.2, 2.0]) tyre(p, sx * (R - 0.35), 0.62, sz, 0.62, 0.4, 'metalDark', 0x4a4a4a, false, false);
  }
  tyre(p, 0, 0.5, -flen / 2 + 1.5, 0.5, 0.3, 'metalDark', 0x4a4a4a, false, false);
  p.box(0, 1.1, -flen / 2 + 1.5, 0.2, 1.4, 0.2, 'metalDark');
  // markings, windows, lights
  for (let i = 0; i < 8; i++) for (const sx of [-1, 1]) p.cylX(sx * (R - 0.02), cy + 0.4, -8 + i * 2.2, 0.14, 0.06, 'glassDirty', 0x1a2024, 10);
  for (const sx of [-1, 1]) { p.glowSph(sx * 20, wy, -1.5, 0.12, sx > 0 ? 0x30ff60 : 0xff2010); p.box(sx * (R + 0.01), cy + 0.2, -9.5, 0.02, 1.7, 0.9, 'blackMatte', 0x2a2e2a); }
  p.glowSph(0, cy + 7.9, flen / 2 + 4.6, 0.15, 0xff2010);
  if (o.lights !== false) p.light(0, cy + 8.2, flen / 2 + 4.6, 0xff2010, 3, 8, { flicker: 0.8 });
  // rear ramp
  const rampDown = o.rampDown !== false;
  const rampLen = 3.6;
  const r0z = flen / 2 - 0.2;
  if (rampDown) {
    const ang = Math.atan2(fy, rampLen);
    p.box(0, fy / 2, r0z + Math.cos(ang) * rampLen / 2, 3.0, 0.12, rampLen, 'diamond', null, [ang, 0, 0]);
    p.rbox(0, cy + 1.5, r0z + 1.2, 3.0, 0.15, 2.6, 0.05, 'metal', c, [-0.4, 0, 0]); // upper door raised
    if (o.lights !== false) { const lt = p.light(0, cy + 0.8, flen / 2 - 2, 0xc8d8ff, 8, 10, { flicker: 0 }); p.beam(0, cy + 1.2, flen / 2 - 1, 0, -0.5, 1, 5, 1.8, 0xc8d8ff, lt, 0.5); }
  } else p.box(0, cy - 0.2, r0z + 1.6, 3.2, 2.6, 0.12, 'metal', c, [0.6, 0, 0]);
  // colliders
  const hollow = o.hollow !== false;
  if (hollow) {
    p.col(0, fy - 0.15, 0, 3.4, 0.3, flen, 'metal'); // cargo floor
    for (const sx of [-1, 1]) p.col(sx * (R - 0.1), cy, 0, 0.2, 2 * R, flen, 'metal');
    p.col(0, cy + R - 0.1, 0, 2 * R, 0.2, flen, 'metal');
    p.col(0, cy, -flen / 2 - 0.3, 2 * R, 2 * R, 0.6, 'metal');
    p.col(0, fy - 0.6, 0, 2 * R, 1.0, flen, 'metal', F_SOLID | F_SHOOT);
    if (rampDown) {
      const n = Math.ceil(fy / 0.18);
      for (let i = 0; i < n; i++) { const t = (i + 1) / n; p.col(0, fy * t - 0.09, r0z + rampLen * (1 - t) + rampLen / n / 2, 3.0, 0.18, rampLen / n, 'metal', F_SOLID | F_SHOOT); }
    } else p.col(0, cy, r0z + 1.2, 2 * R, 2 * R, 1.0, 'metal');
  } else p.col(0, cy, 0, 2 * R, 2 * R, flen, 'metal');
  p.col(0, wy, -1.5, 40, 0.4, 4, 'metal', F_SHOOT | F_SIGHT);
  p.col(0, cy + 4.8, flen / 2 + 3.8, 0.5, 7, 4, 'metal', F_SHOOT | F_SIGHT);
  return p;
}
// Airliner fuselage section / wreck. len along Z; broken: jagged ends; burnt: charred.
export function airlinerSection(L, x, y, z, ry = 0, o = {}) {
  const p = prop(L, x, y, z, ry);
  const len = o.len ?? 12, R = 2.0, cy = (o.ground ? R - 0.4 : R + 1.2);
  const burnt = !!o.burnt;
  const skin = burnt ? 'rust' : 'metalClean', c = burnt ? 0x2a2622 : (o.color ?? 0xe8e8e8);
  p.cylZ(0, cy, 0, R, len, skin, c, 24);
  if (!burnt) { for (const sx of [-1, 1]) p.box(sx * (R + 0.005), cy - 0.35, 0, 0.01, 0.35, len, 'paintedBlue', o.stripe ?? 0x1a3a8a); }
  for (let i = 0; i < Math.floor(len / 0.55); i++) for (const sx of [-1, 1]) p.cylX(sx * (R - 0.01), cy + 0.45, -len / 2 + 0.4 + i * 0.55, 0.1, 0.05, burnt ? 'blackMatte' : (o.lit ? 'emissiveTint' : 'glassDirty'), burnt ? 0x050505 : (o.lit ? 0x8a7a5a : 0x1a2024), 8);
  for (const sx of [-1, 1]) p.box(sx * (R + 0.01), cy + 0.1, -len / 2 + 1.5, 0.02, 1.9, 0.9, 'blackMatte', burnt ? 0x111111 : 0x5a5a5a); // door
  if (o.wing) {
    p.rbox(R + 5, cy - 1.2, 0, 11, 0.35, 4, 0.1, skin, c, [0, 0.35, -0.08]);
    p.cylZ(R + 3.8, cy - 2.1, -0.8, 1.1, 3.4, skin, burnt ? 0x1a1816 : 0xd8d8d8, 16);
    p.cylZ(R + 3.8, cy - 2.1, -2.55, 0.9, 0.1, 'metalDark', 0x151515, 16);
  }
  // broken ends: ragged ribs and panels
  if (o.broken !== false) for (const sz of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const l = 0.2 + drnd() * 1.1;
      p.box(Math.cos(a) * R, cy + Math.sin(a) * R, sz * (len / 2 + l / 2 - 0.1), 0.5, 0.06, l, skin, c, [0, 0, a + Math.PI / 2]);
    }
    p.torus(0, cy, sz * (len / 2 - 0.1), R - 0.05, 0.08, 'metalDark', 0x3a3a3a, [0, 0, 0], 4, 24);
  }
  if (burnt) for (let i = 0; i < 6; i++) p.box((drnd() - 0.5) * R, cy + R * 0.9, (drnd() - 0.5) * len, 1.0 + drnd(), 0.05, 1.0 + drnd() * 2, 'blackMatte', 0x080808, [0, drnd(), (drnd() - 0.5) * 0.4]);
  p.box(0, cy - R * 0.55, 0, R * 1.6, 0.1, len - 0.2, 'metalDark', 0x2a2a2a); // cabin floor
  p.col(0, cy, 0, 2 * R, 2 * R, len, 'metal');
  if (o.wing) p.col(R + 5, cy - 1.2, 0, 10, 0.6, 4, 'metal', F_SOLID | F_SHOOT);
  return p;
}

export { rnd as propRng };
