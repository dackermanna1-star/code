/**
 * objectMeshes.js — procedural, cached, PBR meshes for throwable props, debris shards and
 * first-person weapon viewmodels. No external assets: every texture is generated at runtime
 * (DataTexture / CanvasTexture) the first time a type is requested and then shared.
 *
 * Conventions
 *  - Units are metres. Every Mesh has castShadow = receiveShadow = true (except muzzle flashes).
 *  - Throwables: the returned Object3D's origin/axes are exactly the physics body frame
 *    (centre of mass at the origin, capsules along local +Y, dumbbell handle along local +X).
 *  - Weapons: barrel along local -Z, grip down (-Y), origin at the centre of the firing grip.
 *    Children named 'muzzle' (barrel tip) and 'ejector' (ejection port, absent on the revolver).
 *  - Geometries, materials and textures are built once per type and shared between instances;
 *    the create* functions return cheap clones (Object3D.clone shares geometry + material).
 */
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const fract = (x) => x - Math.floor(x);

// ---------------------------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------------------------
const _cache = new Map();
function cached(key, make) {
  let v = _cache.get(key);
  if (v === undefined) {
    v = make();
    _cache.set(key, v);
  }
  return v;
}

function shadowed(obj, cast = true, receive = true) {
  obj.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return obj;
}

/** Build (once) and clone a template object. Clones share geometry and materials. */
function fromTemplate(key, build) {
  const tpl = cached('tpl:' + key, () => shadowed(build()));
  return tpl.clone(true);
}

// ---------------------------------------------------------------------------------------------
// Random + noise
// ---------------------------------------------------------------------------------------------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _perlin = null;
function noise3(x, y, z) {
  if (_perlin === null) _perlin = new ImprovedNoise();
  return _perlin.noise(x, y, z);
}
function fbm3(x, y, z, oct = 4, gain = 0.5) {
  let s = 0, a = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x, y, z);
    n += a;
    a *= gain;
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 3.7;
    z = z * 2.03 + 9.3;
  }
  return s / n;
}

function ihash(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
const _g2 = (() => {
  const g = new Float32Array(512);
  for (let i = 0; i < 256; i++) {
    const a = (i / 256) * TAU + 0.3;
    g[2 * i] = Math.cos(a);
    g[2 * i + 1] = Math.sin(a);
  }
  return g;
})();
/** Periodic 2D gradient noise (period px, py in lattice cells, integers). Range ≈ [-1, 1]. */
function pnoise2(x, y, px, py, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py;
  const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
  const a = (ihash(x0, y0, seed) & 255) << 1, b = (ihash(x1, y0, seed) & 255) << 1;
  const c = (ihash(x0, y1, seed) & 255) << 1, d = (ihash(x1, y1, seed) & 255) << 1;
  const n00 = _g2[a] * xf + _g2[a + 1] * yf;
  const n10 = _g2[b] * (xf - 1) + _g2[b + 1] * yf;
  const n01 = _g2[c] * xf + _g2[c + 1] * (yf - 1);
  const n11 = _g2[d] * (xf - 1) + _g2[d + 1] * (yf - 1);
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  return (n00 + (n10 - n00) * u + (n01 - n00) * v + (n00 - n10 - n01 + n11) * u * v) * 1.41;
}
/** Tileable fbm on the unit square: (u, v) in [0,1) tiles with base frequency (fx, fy). */
function tfbm(u, v, fx, fy, oct = 4, seed = 0, gain = 0.5) {
  let s = 0, a = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * pnoise2(u * fx, v * fy, fx, fy, seed + i * 131);
    n += a;
    a *= gain;
    fx *= 2;
    fy *= 2;
  }
  return s / n;
}
/** Tileable cellular noise: returns distance to nearest feature point (in cell units) and its id. */
function tcell(u, v, cx, cy, seed, out) {
  const x = u * cx, y = v * cy;
  const xi = Math.floor(x), yi = Math.floor(y);
  let best = 9, id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = xi + i, gy = yi + j;
      const wx = ((gx % cx) + cx) % cx, wy = ((gy % cy) + cy) % cy;
      const h = ihash(wx, wy, seed);
      const fx = gx + (h & 1023) / 1023, fy = gy + ((h >>> 10) & 1023) / 1023;
      const d = (fx - x) * (fx - x) + (fy - y) * (fy - y);
      if (d < best) {
        best = d;
        id = h;
      }
    }
  }
  out[0] = Math.sqrt(best);
  out[1] = (id >>> 20) / 4096;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Texture generation
// ---------------------------------------------------------------------------------------------
function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

function finishTexture(t, { srgb = true, wrap = true, aniso = 8, repeat = null } = {}) {
  t.wrapS = t.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}

/**
 * Generate `count` RGBA8 textures in one pass. fn(u, v, outs, i, j) writes 0..1 floats into
 * outs[k][0..3] (v measured from the bottom, three.js UV convention). Returns the raw buffers.
 */
function genBuffers(w, h, count, fn) {
  const bufs = [], outs = [];
  for (let k = 0; k < count; k++) {
    bufs.push(new Uint8ClampedArray(w * h * 4));
    outs.push([0, 0, 0, 1]);
  }
  for (let j = 0; j < h; j++) {
    const v = (j + 0.5) / h;
    for (let i = 0; i < w; i++) {
      for (let k = 0; k < count; k++) outs[k][3] = 1;
      fn((i + 0.5) / w, v, outs, i, j);
      const o = (j * w + i) * 4;
      for (let k = 0; k < count; k++) {
        const b = bufs[k], c = outs[k];
        b[o] = c[0] * 255 + 0.5;
        b[o + 1] = c[1] * 255 + 0.5;
        b[o + 2] = c[2] * 255 + 0.5;
        b[o + 3] = c[3] * 255 + 0.5;
      }
    }
  }
  return bufs;
}
function dataTexture(buf, w, h, opts) {
  const t = new THREE.DataTexture(new Uint8Array(buf.buffer), w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.flipY = false;
  return finishTexture(t, opts);
}
/** One-pass generation of several textures; specs = [{srgb, wrap, repeat}, ...]. */
function genTextures(w, h, specs, fn) {
  const bufs = genBuffers(w, h, specs.length, fn);
  return bufs.map((b, k) => dataTexture(b, w, h, specs[k]));
}
function canvasTexture(canvas, opts) {
  return finishTexture(new THREE.CanvasTexture(canvas), opts);
}

/** Unit direction for equirect UV on THREE.SphereGeometry. */
function sphereDir(u, v, out) {
  const th = (1 - v) * Math.PI, ph = u * TAU;
  const s = Math.sin(th);
  out[0] = -Math.cos(ph) * s;
  out[1] = Math.cos(th);
  out[2] = Math.sin(ph) * s;
  return out;
}

const hex3 = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
function mix3(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}
function mixInto(out, b, t) {
  out[0] += (b[0] - out[0]) * t;
  out[1] += (b[1] - out[1]) * t;
  out[2] += (b[2] - out[2]) * t;
  return out;
}
function set3(out, a, k = 1) {
  out[0] = a[0] * k;
  out[1] = a[1] * k;
  out[2] = a[2] * k;
  return out;
}

// Shared tileable textures -------------------------------------------------------------------

/** Fine stipple/grain height noise (tileable, linear) used as bump on polymers & cast iron. */
function stippleTexture() {
  return cached('tex:stipple', () =>
    genTextures(256, 256, [{ srgb: false }], (u, v, o) => {
      const n = 0.5 + 0.35 * tfbm(u, v, 32, 32, 3, 7) + 0.25 * pnoise2(u * 96, v * 96, 96, 96, 3);
      o[0][0] = o[0][1] = o[0][2] = clamp(n, 0, 1);
    })[0],
  );
}

/** Diamond knurl / checkering height tile (8×8 pyramids per tile). */
function knurlTexture() {
  return cached('tex:knurl', () =>
    genTextures(128, 128, [{ srgb: false }], (u, v, o) => {
      const a = (u + v) * 8, b = (u - v) * 8;
      const fa = fract(a), fb = fract(b);
      const h = Math.min(fa, 1 - fa) + Math.min(fb, 1 - fb); // 0 at grooves, 1 at peaks
      o[0][0] = o[0][1] = o[0][2] = clamp(h * 1.1, 0, 1);
    })[0],
  );
}

/** Tileable wood: grain runs along U. kind: 'pine' (crate) | 'walnut' (gun furniture). */
function woodTextures(kind) {
  return cached('tex:wood:' + kind, () => {
    const walnut = kind === 'walnut';
    const light = walnut ? hex3(0x5b331c) : hex3(0xd6b483);
    const dark = walnut ? hex3(0x23120a) : hex3(0xa47a4a);
    const tmp = [0, 0, 0];
    const knots = walnut ? [] : [[0.23, 0.31, 0.022], [0.71, 0.77, 0.016]];
    const W = walnut ? 512 : 512, H = 256;
    return genTextures(W, H, [{ srgb: true }, { srgb: false }], (u, v, o) => {
      // grain coordinate across the board with low-frequency warping
      let w = v * (walnut ? 26 : 30) + (walnut ? 0.9 : 1.1) * tfbm(u, v, 2, 4, 3, 11) + 0.3 * tfbm(u, v, 8, 6, 2, 5);
      let kd = 0;
      for (const [ku, kv, kr] of knots) {
        let du = u - ku, dv = v - kv;
        du -= Math.round(du);
        dv -= Math.round(dv);
        const d = Math.sqrt(du * du * 4 + dv * dv); // texture spans 2:1
        if (d < kr * 4) {
          const f = 1 - d / (kr * 4);
          w += f * f * 3.5 * Math.sign(dv || 1);
          kd = Math.max(kd, smooth(kr * 1.2, kr * 0.55, d));
        }
      }
      const ring = fract(w);
      const late = smooth(0.62, 0.86, ring) * (1 - smooth(0.9, 1.0, ring));
      const fib = pnoise2(u * 6, v * 180, 6, 180, 21) * 0.5 + pnoise2(u * 20, v * 360, 20, 360, 23) * 0.3;
      const blot = tfbm(u, v, 3, 2, 3, 31);
      mix3(tmp, light, dark, clamp(late * (walnut ? 0.45 : 0.5) + 0.16 * fib + (walnut ? 0.3 : 0.18) * blot + (walnut ? 0.25 : 0.12), 0, 1));
      if (kd > 0) mixInto(tmp, walnut ? [0.16, 0.09, 0.05] : [0.42, 0.26, 0.13], kd * 0.9);
      o[0][0] = tmp[0];
      o[0][1] = tmp[1];
      o[0][2] = tmp[2];
      const hgt = clamp(0.6 - late * 0.35 + fib * 0.12 - kd * 0.2, 0, 1);
      o[1][0] = o[1][1] = o[1][2] = hgt;
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------

/**
 * Lathe around +Y with crease-aware normals and arc-length V. pts: [[r, y], ...] walked so that
 * the outside of the solid is on the right ((dy, -dr) is the outward normal), like LatheGeometry.
 * o: { segs, crease (deg), phi0, phiLen, uScale, vScale (null = normalised), colors: per segment }
 */
function lathe(pts, o = {}) {
  const segs = o.segs ?? 32, phi0 = o.phi0 ?? 0, phiLen = o.phiLen ?? TAU;
  const cosC = Math.cos((o.crease ?? 35) * DEG);
  const uScale = o.uScale ?? 1;
  const n = pts.length;
  const segN = [], segL = [];
  for (let j = 0; j < n - 1; j++) {
    const dr = pts[j + 1][0] - pts[j][0], dy = pts[j + 1][1] - pts[j][1];
    const l = Math.hypot(dr, dy);
    segL.push(l);
    segN.push(l > 0 ? [dy / l, -dr / l] : [1, 0]);
  }
  const cum = [0];
  for (let j = 0; j < n - 1; j++) cum.push(cum[j] + segL[j]);
  const total = cum[n - 1] || 1;
  const vOf = (s) => (o.vScale != null ? s * o.vScale : s / total);
  const blend = (a, b) => {
    if (a[0] * b[0] + a[1] * b[1] < cosC) return null;
    const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  const pos = [], nor = [], uv = [], col = [], idx = [];
  for (let j = 0; j < n - 1; j++) {
    if (segL[j] < 1e-9) continue;
    let k = j - 1;
    while (k >= 0 && segL[k] < 1e-9) k--;
    const nA = (k >= 0 && blend(segN[k], segN[j])) || segN[j];
    k = j + 1;
    while (k < n - 1 && segL[k] < 1e-9) k++;
    const nB = (k < n - 1 && blend(segN[j], segN[k])) || segN[j];
    const c = o.colors ? o.colors[Math.min(j, o.colors.length - 1)] : null;
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const phi = phi0 + (i / segs) * phiLen, s = Math.sin(phi), cs = Math.cos(phi);
      const ring = [[pts[j], nA, cum[j]], [pts[j + 1], nB, cum[j + 1]]];
      for (const [P, N, sv] of ring) {
        pos.push(P[0] * s, P[1], P[0] * cs);
        nor.push(N[0] * s, N[1], N[0] * cs);
        uv.push((i / segs) * uScale, vOf(sv));
        if (c) col.push(c[0], c[1], c[2]);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = base + i * 2, b = base + (i + 1) * 2;
      idx.push(a, b, a + 1, b + 1, a + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (o.colors) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** Lathe whose axis is the weapon barrel axis: profile [[r, x2]] with x2 = distance forward (-Z). */
function axisLathe(pts, o = {}) {
  const g = lathe(pts, o);
  g.rotateX(-Math.PI / 2); // +Y -> -Z
  g.translate(o.cx ?? 0, o.cy ?? 0, 0);
  return g;
}
/** Lathe whose axis is +X (profile y = distance along +X). */
function xLathe(pts, o = {}) {
  const g = lathe(pts, o);
  g.rotateZ(-Math.PI / 2); // +Y -> +X
  return g;
}

/**
 * Polygon with filleted corners. pts: [[x, y, r?], ...] (closed). Corner radius r (or defR)
 * is clamped to fit. Returns a dense [[x, y], ...] list.
 */
function roundPoly(pts, defR = 0, segs = 4) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const P = pts[i], A = pts[(i + n - 1) % n], B = pts[(i + 1) % n];
    const r = P[2] ?? defR;
    if (!(r > 0)) {
      out.push([P[0], P[1]]);
      continue;
    }
    let ax = A[0] - P[0], ay = A[1] - P[1], bx = B[0] - P[0], by = B[1] - P[1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    ax /= la; ay /= la; bx /= lb; by /= lb;
    const cosT = clamp(ax * bx + ay * by, -1, 1);
    const th = Math.acos(cosT);
    if (th < 1e-3 || th > Math.PI - 1e-3) {
      out.push([P[0], P[1]]);
      continue;
    }
    let t = r / Math.tan(th / 2);
    const tMax = Math.min(la, lb) * 0.5;
    let rr = r;
    if (t > tMax) {
      t = tMax;
      rr = t * Math.tan(th / 2);
    }
    const t1 = [P[0] + ax * t, P[1] + ay * t], t2 = [P[0] + bx * t, P[1] + by * t];
    let mx = ax + bx, my = ay + by;
    const ml = Math.hypot(mx, my);
    mx /= ml; my /= ml;
    const dc = rr / Math.sin(th / 2);
    const C = [P[0] + mx * dc, P[1] + my * dc];
    let a1 = Math.atan2(t1[1] - C[1], t1[0] - C[0]);
    let a2 = Math.atan2(t2[1] - C[1], t2[0] - C[0]);
    let da = a2 - a1;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    for (let k = 0; k <= segs; k++) {
      const a = a1 + (da * k) / segs;
      out.push([C[0] + Math.cos(a) * rr, C[1] + Math.sin(a) * rr]);
    }
  }
  return out;
}
/** Rounded rectangle centred at (cx, cy). */
function rrect(cx, cy, w, h, r, segs = 3) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  return roundPoly([[x0, y0, r], [x1, y0, r], [x1, y1, r], [x0, y1, r]], 0, segs);
}
function circlePts(cx, cy, r, n = 24, a0 = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}
function shapeOf(outline, holes = []) {
  const s = new THREE.Shape(outline.map((p) => new THREE.Vector2(p[0], p[1])));
  for (const h of holes) s.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
  return s;
}

/** Extrude a 2D outline with an inset bevel so the total size equals outline × thick exactly. */
function extrudeRaw(outline, thick, o = {}) {
  const bevel = Math.min(o.bevel ?? 0, thick * 0.45);
  const depth = Math.max(1e-4, thick - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shapeOf(outline, o.holes || []), {
    depth,
    steps: 1,
    curveSegments: 4,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: o.bevelSegs ?? 2,
  });
  g.translate(0, 0, -depth / 2); // centred on z = 0
  return g;
}

/** Side-profile part: outline in (x2 forward, y up), thickness along X centred at cx. */
function sideExtrude(outline, thick, o = {}) {
  const g = extrudeRaw(outline, thick, o);
  g.rotateY(Math.PI / 2); // shape x -> -Z, extrusion -> +X
  g.translate(o.cx ?? 0, 0, 0);
  return g;
}
/** Cross-section part: section in (X, Y), extruded along the barrel axis between x2Back..x2Front. */
function axialExtrude(section, x2Back, x2Front, o = {}) {
  const g = extrudeRaw(section, x2Front - x2Back, o);
  g.translate(0, 0, -(x2Front + x2Back) / 2);
  return g;
}
/** Box given by min/max corners in weapon design coordinates (x2 forward). */
function box2(x2a, x2b, ya, yb, xa, xb) {
  const g = new THREE.BoxGeometry(Math.abs(xb - xa), Math.abs(yb - ya), Math.abs(x2b - x2a));
  g.translate((xa + xb) / 2, (ya + yb) / 2, -(x2a + x2b) / 2);
  return g;
}
/** Cylinder between two 3D points (THREE.Vector3 or arrays). */
function cylBetween(a, b, r0, r1 = r0, segs = 12, open = false) {
  const A = new THREE.Vector3().fromArray(a), B = new THREE.Vector3().fromArray(b);
  const d = new THREE.Vector3().subVectors(B, A);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, segs, 1, open);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(A.x, A.y, A.z);
  return g;
}

/** Smooth normals across edges flatter than `deg`. Works in mm-scale coordinates (see note). */
function creased(g, deg = 32) {
  // toCreasedNormals hashes positions at 0.01 units, so callers must work in millimetres.
  const out = toCreasedNormals(g, deg * DEG);
  return out;
}
function creasedMetres(g, deg = 32) {
  g.scale(1000, 1000, 1000);
  const out = toCreasedNormals(g, deg * DEG);
  out.scale(0.001, 0.001, 0.001);
  return out;
}

/** Prepare a list of geometries for mergeGeometries (non-indexed, same attribute set). */
function mergeList(geos) {
  const needColor = geos.some((g) => g.attributes.color);
  const prepared = geos.map((g0) => {
    const g = g0.index ? g0.toNonIndexed() : g0.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    const cnt = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(cnt * 2), 2));
    if (needColor && !g.attributes.color) {
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(cnt * 3).fill(1), 3));
    }
    g.morphAttributes = {};
    g.clearGroups();
    return g;
  });
  return mergeGeometries(prepared, false);
}

/** Collects geometry per material key and emits one merged mesh per material. */
class Parts {
  constructor() {
    this.map = new Map();
  }
  add(key, geo, color = null) {
    if (color) {
      const cnt = geo.attributes.position.count, arr = new Float32Array(cnt * 3);
      for (let i = 0; i < cnt; i++) arr.set(color, i * 3);
      geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    }
    let a = this.map.get(key);
    if (!a) this.map.set(key, (a = []));
    a.push(geo);
    return geo;
  }
  build(parent = new THREE.Group(), scale = 1) {
    for (const [key, geos] of this.map) {
      const g = mergeList(geos);
      if (scale !== 1) g.scale(scale, scale, scale);
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const m = new THREE.Mesh(g, getMat(key));
      m.name = key;
      parent.add(m);
    }
    return parent;
  }
}

// ---------------------------------------------------------------------------------------------
// Material registry (lazily created, shared)
// ---------------------------------------------------------------------------------------------
const MATS = {};
function getMat(key) {
  return cached('mat:' + key, () => {
    const f = MATS[key];
    if (!f) throw new Error('objectMeshes: unknown material ' + key);
    const m = f();
    m.name = key;
    return m;
  });
}

// =============================================================================================
// THROWABLES
// =============================================================================================

/** Collider description of every throwable (used for documentation + debug overlays). */
export const THROWABLE_COLLIDERS = {
  baseball: { shape: 'sphere', radius: 0.0373 },
  brick: { shape: 'box', halfExtents: [0.1075, 0.0325, 0.05125] },
  bowlingBall: { shape: 'sphere', radius: 0.109 },
  bottle: { shape: 'capsule', radius: 0.032, halfHeight: 0.085 },
  crate: { shape: 'box', halfExtents: [0.225, 0.225, 0.225] },
  pipe: { shape: 'capsule', radius: 0.024, halfHeight: 0.5 },
  dumbbell: { shape: 'dumbbell', handleRadius: 0.017, handleHalfLength: 0.13, plateRadius: 0.09, plateX: 0.15, plateThickness: 0.04 },
  watermelon: { shape: 'sphere', radius: 0.13 },
  soccerBall: { shape: 'sphere', radius: 0.11 },
};

function sphereWrap(t) {
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------------------------------------------------------------------------------------------
// Baseball
// ---------------------------------------------------------------------------------------------
const BASEBALL_R = 0.0373;
const SEAM_A = 0.64;
function seamPt(t, out) {
  const a = SEAM_A, b = 1 - SEAM_A, c = 2 * Math.sqrt(a * b);
  out[0] = a * Math.cos(t) + b * Math.cos(3 * t);
  out[1] = a * Math.sin(t) - b * Math.sin(3 * t);
  out[2] = c * Math.sin(2 * t);
  return out;
}

function baseballTextures() {
  return cached('tex:baseball', () => {
    const N = 1024, STEP = 16, P = new Float32Array(N * 3), tmp = [0, 0, 0], d = [0, 0, 0], c = [0, 0, 0];
    for (let k = 0; k < N; k++) P.set(seamPt((k / N) * TAU, tmp), k * 3);
    const Rmm = BASEBALL_R * 1000;
    const base = hex3(0xebe3d3), dirt = hex3(0xc2b092), redTint = hex3(0xd9a9a0);
    const [map, bump] = genTextures(512, 256, [{ srgb: true }, { srgb: false }], (u, v, o) => {
      sphereDir(u, v, d);
      let best = -2, bk = 0;
      for (let k = 0; k < N; k += STEP) {
        const dot = P[3 * k] * d[0] + P[3 * k + 1] * d[1] + P[3 * k + 2] * d[2];
        if (dot > best) {
          best = dot;
          bk = k;
        }
      }
      for (let s = -STEP; s <= STEP; s++) {
        const k = (bk + s + N) % N;
        const dot = P[3 * k] * d[0] + P[3 * k + 1] * d[1] + P[3 * k + 2] * d[2];
        if (dot > best) best = dot;
      }
      const dist = Math.acos(clamp(best, -1, 1)) * Rmm; // mm to seam centre line
      const n1 = fbm3(d[0] * 5, d[1] * 5, d[2] * 5, 2);
      const grain = noise3(d[0] * 110, d[1] * 110, d[2] * 110);
      set3(c, base, 1 + 0.035 * n1 + 0.02 * grain);
      const scuff = smooth(0.12, 0.45, fbm3(d[0] * 3 + 11, d[1] * 3, d[2] * 3, 3));
      mixInto(c, dirt, scuff * 0.45);
      mixInto(c, redTint, Math.exp(-((dist - 2.2) * (dist - 2.2)) / 3) * 0.12);
      const groove = Math.exp(-(dist * dist) / 0.22);
      c[0] *= 1 - 0.35 * groove;
      c[1] *= 1 - 0.38 * groove;
      c[2] *= 1 - 0.4 * groove;
      o[0][0] = c[0];
      o[0][1] = c[1];
      o[0][2] = c[2];
      let h = 0.6 + 0.07 * grain;
      h -= 0.5 * groove;
      h += 0.12 * Math.exp(-((dist - 1.25) * (dist - 1.25)) / 0.35);
      o[1][0] = o[1][1] = o[1][2] = clamp(h, 0, 1);
    });
    return { map: sphereWrap(map), bump: sphereWrap(bump) };
  });
}

/** Red double stitches: 108 chevrons of thread following the figure-8 seam. */
function baseballStitchGeometry() {
  const R = BASEBALL_R;
  const M = 4096, pts = [], cum = [0];
  for (let k = 0; k <= M; k++) {
    pts.push(seamPt((k / M) * TAU, [0, 0, 0]));
    if (k) {
      const a = pts[k], b = pts[k - 1];
      cum.push(cum[k - 1] + Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * R);
    }
  }
  const L = cum[M];
  const NS = 108;
  const pos = [], nor = [], idx = [];
  const P = new THREE.Vector3(), T = new THREE.Vector3(), B = new THREE.Vector3(), Nn = new THREE.Vector3();
  const tA = new THREE.Vector3(), tB = new THREE.Vector3();
  const surf = (along, across, h) =>
    new THREE.Vector3().copy(P).multiplyScalar(R).addScaledVector(T, along).addScaledVector(B, across).normalize().multiplyScalar(R + h);
  const SIDES = 5, TR = 0.00043;
  for (let i = 0; i < NS; i++) {
    const s = ((i + 0.5) / NS) * L;
    let lo = 0, hi = M;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < s) lo = mid;
      else hi = mid;
    }
    const t = ((lo + (s - cum[lo]) / (cum[hi] - cum[lo] || 1)) / M) * TAU;
    P.fromArray(seamPt(t, [0, 0, 0])).normalize();
    tA.fromArray(seamPt(t + 1e-3, [0, 0, 0]));
    tB.fromArray(seamPt(t - 1e-3, [0, 0, 0]));
    T.subVectors(tA, tB).normalize();
    Nn.copy(P);
    B.crossVectors(Nn, T).normalize();
    for (const side of [1, -1]) {
      const ctrl = [
        surf(-0.0001, side * 0.0033, -0.0003),
        surf(0.00062, side * 0.00195, 0.00026),
        surf(0.00135, side * 0.0006, -0.0003),
      ];
      const base = pos.length / 3;
      for (let r = 0; r < ctrl.length; r++) {
        const C = ctrl[r];
        const A = new THREE.Vector3().subVectors(ctrl[Math.min(r + 1, ctrl.length - 1)], ctrl[Math.max(r - 1, 0)]).normalize();
        const up = C.clone().normalize();
        const n1 = up.clone().addScaledVector(A, -up.dot(A)).normalize();
        const n2 = new THREE.Vector3().crossVectors(A, n1);
        const rr = r === 0 || r === ctrl.length - 1 ? TR * 0.8 : TR;
        for (let k = 0; k < SIDES; k++) {
          const a = (k / SIDES) * TAU;
          const dx = n1.x * Math.cos(a) + n2.x * Math.sin(a);
          const dy = n1.y * Math.cos(a) + n2.y * Math.sin(a);
          const dz = n1.z * Math.cos(a) + n2.z * Math.sin(a);
          pos.push(C.x + dx * rr, C.y + dy * rr, C.z + dz * rr);
          nor.push(dx, dy, dz);
        }
      }
      for (let r = 0; r < ctrl.length - 1; r++) {
        for (let k = 0; k < SIDES; k++) {
          const a = base + r * SIDES + k, b = base + r * SIDES + ((k + 1) % SIDES);
          const c = a + SIDES, d = b + SIDES;
          idx.push(a, c, b, b, c, d);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  // make winding consistent with outward normals
  fixWinding(g);
  return g;
}

/** Flip triangles whose geometric normal disagrees with the stored vertex normals. */
function fixWinding(g) {
  const p = g.attributes.position, n = g.attributes.normal, ix = g.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < ix.length; i += 3) {
    a.fromBufferAttribute(p, ix[i]);
    b.fromBufferAttribute(p, ix[i + 1]);
    c.fromBufferAttribute(p, ix[i + 2]);
    b.sub(a);
    c.sub(a);
    b.cross(c);
    nn.fromBufferAttribute(n, ix[i]).add(c.set(n.getX(ix[i + 1]), n.getY(ix[i + 1]), n.getZ(ix[i + 1])));
    if (b.dot(nn) < 0) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
  }
  g.index.needsUpdate = true;
}

MATS.baseballLeather = () => {
  const t = baseballTextures();
  return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 1.2, roughness: 0.58, metalness: 0 });
};
MATS.baseballThread = () => new THREE.MeshStandardMaterial({ color: 0xb3121c, roughness: 0.82, metalness: 0 });

function buildBaseball() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(cached('geo:baseball', () => new THREE.SphereGeometry(BASEBALL_R, 48, 32)), getMat('baseballLeather')));
  g.add(new THREE.Mesh(cached('geo:baseballStitch', baseballStitchGeometry), getMat('baseballThread')));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Brick: 215 × 65 × 102.5 mm, rounded arrises, two frogs on the top bed face, atlas texture.
// ---------------------------------------------------------------------------------------------
const BRICK_HMM = [107.5, 32.5, 51.25];
const BRICK_R = 3.2; // edge rounding (mm)
const BRICK_FROGS = [-52, 52];
function brickFrogDepth(x, z) {
  let d = 0;
  for (const cx of BRICK_FROGS) {
    const t = Math.min((38 - Math.abs(x - cx)) / 8, (26 - Math.abs(z)) / 8);
    if (t > 0) d = Math.max(d, Math.min(t, 1) * 8);
  }
  return d;
}
// Faces: [normal axis, sign, uAxis, vAxis] with cross(e_u, e_v) = outward normal.
const BOX_FACES = [
  [0, 1, 1, 2],
  [0, -1, 2, 1],
  [1, 1, 2, 0],
  [1, -1, 0, 2],
  [2, 1, 0, 1],
  [2, -1, 1, 0],
];
// Atlas rectangles in mm (texture space 450 × 245 mm -> 512 × 256 px): [x0, y0, hAxis, vAxis]
const BRICK_ATLAS_MM = [450, 245];
const BRICK_ATLAS = {
  '0,1': [2, 177, 2, 1],
  '0,-1': [108, 177, 2, 1],
  '1,1': [2, 2, 0, 2],
  '1,-1': [222, 2, 0, 2],
  '2,1': [2, 108, 0, 1],
  '2,-1': [222, 108, 0, 1],
};

/** Map an unrounded surface point (mm) to its rounded position + normal (+ frog for top face). */
function brickSurface(p, out, nrm) {
  const h = BRICK_HMM, r = BRICK_R;
  let len2 = 0;
  const c = [0, 0, 0], d = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    c[k] = clamp(p[k], -(h[k] - r), h[k] - r);
    d[k] = p[k] - c[k];
    len2 += d[k] * d[k];
  }
  const len = Math.sqrt(len2) || 1;
  for (let k = 0; k < 3; k++) {
    nrm[k] = d[k] / len;
    out[k] = c[k] + nrm[k] * r;
  }
  let depth = 0;
  if (nrm[1] > 0.999999) {
    depth = brickFrogDepth(out[0], out[2]);
    out[1] -= depth;
  }
  return depth;
}

function brickTextures() {
  return cached('tex:brick', () => {
    const [AW, AH] = BRICK_ATLAS_MM;
    const h = BRICK_HMM;
    const rects = Object.entries(BRICK_ATLAS).map(([k, r]) => {
      const [axis, sign] = k.split(',').map(Number);
      return { axis, sign, x0: r[0], y0: r[1], ha: r[2], va: r[3], w: 2 * h[r[2]], hgt: 2 * h[r[3]] };
    });
    const clayA = hex3(0x6f2b1c), clayB = hex3(0x8f3f28), burnt = hex3(0x451c13), sand = hex3(0xa98066);
    const mortar = hex3(0x8e887d), dark = hex3(0x351810);
    const p = [0, 0, 0], q = [0, 0, 0], nr = [0, 0, 0], c = [0, 0, 0];
    const [map, bump] = genTextures(512, 256, [{ srgb: true }, { srgb: false }], (u, v, o) => {
      const X = u * AW, Y = v * AH;
      // nearest rect (clamped) so the padding bleeds plausible colour
      let best = null, bd = 1e9;
      for (const R of rects) {
        const dx = Math.max(R.x0 - X, 0, X - (R.x0 + R.w)), dy = Math.max(R.y0 - Y, 0, Y - (R.y0 + R.hgt));
        const dd = dx + dy;
        if (dd < bd) {
          bd = dd;
          best = R;
        }
      }
      const R = best;
      const a = clamp((X - R.x0) / R.w, 0, 1), b = clamp((Y - R.y0) / R.hgt, 0, 1);
      p[R.axis] = R.sign * h[R.axis];
      p[R.ha] = (a * 2 - 1) * h[R.ha];
      p[R.va] = (b * 2 - 1) * h[R.va];
      const depth = brickSurface(p, q, nr);
      const n1 = fbm3(q[0] * 0.018, q[1] * 0.018, q[2] * 0.018, 4);
      const n2 = fbm3(q[0] * 0.07 + 5, q[1] * 0.07, q[2] * 0.07, 3);
      const n3 = noise3(q[0] * 0.55, q[1] * 0.55, q[2] * 0.55);
      const n4 = noise3(q[0] * 1.6 + 3, q[1] * 1.6, q[2] * 1.6);
      mix3(c, clayA, clayB, clamp(0.5 + n1 * 1.5, 0, 1));
      mixInto(c, burnt, smooth(0.08, 0.4, n2) * 0.55);
      if (n4 > 0.42) mixInto(c, dark, smooth(0.42, 0.6, n4) * 0.8);
      if (n3 < -0.5) mixInto(c, sand, smooth(-0.5, -0.7, n3) * 0.6);
      // mortar dust: on beds, in the frogs and on worn edges
      const md = fbm3(q[0] * 0.06 + 20, q[1] * 0.06, q[2] * 0.06, 4) + 0.35 * n3;
      let m = smooth(0.25, 0.55, md) * 0.35;
      if (nr[1] > 0.5) m += smooth(0.0, 0.4, md + 0.1) * 0.25 + smooth(1.0, 7.0, depth) * smooth(-0.2, 0.3, md) * 0.4;
      if (nr[1] < -0.5) m += smooth(0.0, 0.4, md) * 0.3;
      const edge = 1 - Math.max(Math.abs(nr[0]), Math.abs(nr[1]), Math.abs(nr[2]));
      m += smooth(0.05, 0.25, edge) * 0.25 * clamp(0.5 + n3, 0, 1);
      mixInto(c, mortar, clamp(m, 0, 0.8));
      const k = 0.94 + 0.08 * n3;
      o[0][0] = c[0] * k;
      o[0][1] = c[1] * k;
      o[0][2] = c[2] * k;
      let hh = 0.55 + 0.22 * n3 + 0.1 * n4 + 0.08 * n2;
      if (n4 > 0.5) hh -= 0.25 * smooth(0.5, 0.65, n4);
      o[1][0] = o[1][1] = o[1][2] = clamp(hh, 0, 1);
    });
    map.wrapS = map.wrapT = bump.wrapS = bump.wrapT = THREE.ClampToEdgeWrapping;
    return { map, bump };
  });
}

function brickGeometry() {
  const h = BRICK_HMM, r = BRICK_R;
  const linesFor = (axis, extra) => {
    const L = [-h[axis], h[axis]];
    for (let k = 1; k <= 3; k++) L.push(-h[axis] + (r * k) / 3, h[axis] - (r * k) / 3);
    for (const e of extra) L.push(e);
    L.sort((a, b) => a - b);
    return L.filter((x, i) => i === 0 || x - L[i - 1] > 1e-6);
  };
  const lines = [
    linesFor(0, [-90, -82, -67, -52, -37, -22, -14, 0, 14, 22, 37, 52, 67, 82, 90]),
    linesFor(1, [-16, 0, 16]),
    linesFor(2, [-26, -18, 0, 18, 26]),
  ];
  const [AW, AH] = BRICK_ATLAS_MM;
  const pos = [], nor = [], uv = [];
  const p = [0, 0, 0];
  for (const [axis, sign, ua, va] of BOX_FACES) {
    const rect = BRICK_ATLAS[axis + ',' + sign];
    const LU = lines[ua], LV = lines[va];
    const grid = [];
    for (let i = 0; i < LU.length; i++) {
      for (let j = 0; j < LV.length; j++) {
        p[axis] = sign * h[axis];
        p[ua] = LU[i];
        p[va] = LV[j];
        const q = [0, 0, 0], n = [0, 0, 0];
        const depth = brickSurface(p, q, n);
        // gentle irregularity (hand-moulded look)
        const jit = 0.45 * noise3(q[0] * 0.045, q[1] * 0.045 + 7, q[2] * 0.045) + 0.2 * noise3(q[0] * 0.2, q[1] * 0.2, q[2] * 0.2 + 3);
        for (let k = 0; k < 3; k++) q[k] += n[k] * jit;
        const U = (rect[0] + ((p[rect[2]] + h[rect[2]]) / (2 * h[rect[2]])) * 2 * h[rect[2]]) / AW;
        const V = (rect[1] + ((p[rect[3]] + h[rect[3]]) / (2 * h[rect[3]])) * 2 * h[rect[3]]) / AH;
        grid.push({ q, n, depth, uv: [U, V], x: p[0], z: p[2] });
      }
    }
    const at = (i, j) => grid[i * LV.length + j];
    const isTop = axis === 1 && sign === 1;
    for (let i = 0; i < LU.length - 1; i++) {
      for (let j = 0; j < LV.length - 1; j++) {
        const v00 = at(i, j), v10 = at(i + 1, j), v11 = at(i + 1, j + 1), v01 = at(i, j + 1);
        let tris = [[v00, v10, v11], [v00, v11, v01]];
        const frogCell = isTop && (v00.depth || v10.depth || v11.depth || v01.depth);
        if (frogCell) {
          const cx = (v00.x + v11.x) / 2, cz = (v00.z + v11.z) / 2, dc = brickFrogDepth(cx, cz);
          if (Math.abs((v10.depth + v01.depth) / 2 - dc) < Math.abs((v00.depth + v11.depth) / 2 - dc)) {
            tris = [[v00, v10, v01], [v10, v11, v01]];
          }
        }
        for (const t of tris) {
          let fn = null;
          if (frogCell) {
            const a = t[0].q, b = t[1].q, c = t[2].q;
            const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
            fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
            const l = Math.hypot(fn[0], fn[1], fn[2]) || 1;
            fn = fn.map((x) => x / l);
          }
          for (const vv of t) {
            pos.push(vv.q[0] * 0.001, vv.q[1] * 0.001, vv.q[2] * 0.001);
            const nn = fn || vv.n;
            nor.push(nn[0], nn[1], nn[2]);
            uv.push(vv.uv[0], vv.uv[1]);
          }
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

MATS.brick = () => {
  const t = brickTextures();
  return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 3.0, roughness: 0.93, metalness: 0 });
};
function buildBrick() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(cached('geo:brick', brickGeometry), getMat('brick')));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Bowling ball: marbled reactive urethane, clear-coated, three real finger holes (alpha cut).
// ---------------------------------------------------------------------------------------------
const BOWL_R = 0.109;
function bowlingHoles() {
  return cached('bowl:holes', () => {
    const dir = (latD, lonD) => {
      const la = latD * DEG, lo = lonD * DEG;
      return new THREE.Vector3(Math.sin(lo) * Math.cos(la), Math.sin(la), Math.cos(lo) * Math.cos(la));
    };
    return [
      { d: dir(-26, 0), r: 0.0127, depth: 0.062 },
      { d: dir(24, -7.6), r: 0.0108, depth: 0.052 },
      { d: dir(24, 7.6), r: 0.0108, depth: 0.052 },
    ].map((hh) => ({ ...hh, cut: Math.asin((hh.r + 0.0012) / BOWL_R) }));
  });
}

function bowlingTextures() {
  return cached('tex:bowling', () => {
    const holes = bowlingHoles();
    const navy = hex3(0x070c2e), blue = hex3(0x1c3aa8), purple = hex3(0x4a1878), pale = hex3(0x9fb3f5);
    const d = [0, 0, 0], c = [0, 0, 0];
    const [map] = genTextures(512, 256, [{ srgb: true }], (u, v, o) => {
      sphereDir(u, v, d);
      const x = d[0] * 1.7, y = d[1] * 1.7, z = d[2] * 1.7;
      const qx = noise3(x, y, z), qy = noise3(x + 5.2, y + 1.3, z + 2.8), qz = noise3(x + 1.7, y + 9.2, z + 3.1);
      const r = fbm3(x * 1.3 + 2.4 * qx, y * 1.3 + 2.4 * qy, z * 1.3 + 2.4 * qz, 4);
      const s = 0.5 + 0.5 * Math.sin(7 * r + 3 * qx);
      mix3(c, navy, blue, smooth(0.15, 0.95, s));
      mixInto(c, purple, smooth(0.0, 0.5, qy) * 0.75);
      const vein = Math.pow(1 - Math.abs(Math.sin(11 * r + 2 * qz)), 10);
      mixInto(c, pale, vein * 0.4);
      const sparkle = noise3(d[0] * 160, d[1] * 160, d[2] * 160);
      if (sparkle > 0.62) mixInto(c, pale, (sparkle - 0.62) * 1.2);
      // darker bevel rings around the holes
      for (const hh of holes) {
        const ang = Math.acos(clamp(d[0] * hh.d.x + d[1] * hh.d.y + d[2] * hh.d.z, -1, 1));
        const e = (ang - hh.cut) * BOWL_R * 1000;
        if (e < 3) {
          const k = 1 - 0.45 * smooth(3, 0, e);
          c[0] *= k;
          c[1] *= k;
          c[2] *= k;
        }
      }
      o[0][0] = c[0];
      o[0][1] = c[1];
      o[0][2] = c[2];
    });
    const texA = Math.PI / 512;
    const [alpha] = genTextures(1024, 512, [{ srgb: false }], (u, v, o) => {
      sphereDir(u, v, d);
      let a = 1;
      for (const hh of holes) {
        const ang = Math.acos(clamp(d[0] * hh.d.x + d[1] * hh.d.y + d[2] * hh.d.z, -1, 1));
        a = Math.min(a, clamp(0.5 + (ang - hh.cut) / (2 * texA), 0, 1));
      }
      o[0][0] = o[0][1] = o[0][2] = a;
    });
    return { map: sphereWrap(map), alpha: sphereWrap(alpha) };
  });
}

MATS.bowlingShell = () => {
  const t = bowlingTextures();
  return new THREE.MeshPhysicalMaterial({
    map: t.map,
    alphaMap: t.alpha,
    alphaTest: 0.5,
    roughness: 0.2,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  });
};
MATS.bowlingBore = () => new THREE.MeshStandardMaterial({ color: 0x15151d, roughness: 0.6, metalness: 0 });

function buildBowlingBall() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(cached('geo:bowl', () => new THREE.SphereGeometry(BOWL_R, 64, 44)), getMat('bowlingShell')));
  const bores = cached('geo:bowlBores', () => {
    const list = [];
    for (const hh of bowlingHoles()) {
      const rc = hh.r + 0.0012;
      const yRim = Math.sqrt(BOWL_R * BOWL_R - rc * rc) + 0.00025;
      const y1 = yRim - 0.0016;
      const geo = lathe([[rc, yRim], [hh.r, y1], [hh.r, yRim - hh.depth], [hh.r * 0.6, yRim - hh.depth - 0.002], [0, yRim - hh.depth - 0.0025]], { segs: 40, crease: 50 });
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), hh.d));
      list.push(geo);
    }
    return mergeList(list);
  });
  g.add(new THREE.Mesh(bores, getMat('bowlingBore')));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Bottle: 234 mm longneck, green glass (transmission), paper label, foil neck band, crown cap.
// Origin = capsule centre: bottle base at y = -0.117, top of cap at y = +0.117.
// ---------------------------------------------------------------------------------------------
const BOTTLE_GLASS_MM = [
  [0, 5.5], [7, 4.8], [14, 3.0], [21, 0.9], [25, 0], [28.8, 0.9], [30.9, 3.2], [31.5, 7.5],
  [31.5, 128], [31.1, 135], [29.6, 143], [26.6, 151], [22.3, 159], [18.4, 166], [15.6, 173],
  [14.0, 180], [13.3, 188], [12.95, 200], [12.8, 211.5], [13.55, 213.2], [13.75, 215.6],
  [13.1, 217.3], [12.85, 219.3], [13.55, 220.8], [13.6, 226.5], [12.6, 228.6], [10.2, 229.2],
];
const mmY = (h) => (h - 117) * 0.001;

function bottleLabelTexture() {
  return cached('tex:bottleLabel', () => {
    const W = 1024, H = 336;
    const cv = makeCanvas(W, H), g = cv.getContext('2d');
    const [paper] = genBuffers(W, H, 1, (u, v, o) => {
      const n = pnoise2(u * 256, v * 84, 256, 84, 5) * 0.025 + pnoise2(u * 64, v * 21, 64, 21, 6) * 0.02;
      o[0][0] = 0.937 + n;
      o[0][1] = 0.89 + n;
      o[0][2] = 0.77 + n * 0.8;
    });
    g.putImageData(new ImageData(paper, W, H), 0, 0);
    const R = rng(77);
    g.fillStyle = '#6e1212';
    g.fillRect(0, 0, W, 30);
    g.fillRect(0, H - 30, W, 30);
    g.fillStyle = '#c8a24a';
    g.fillRect(0, 30, W, 7);
    g.fillRect(0, H - 37, W, 7);
    for (const cx of [W * 0.25, W * 0.75]) {
      g.save();
      g.translate(cx, H / 2);
      g.scale(1.5, 1);
      g.beginPath();
      g.arc(0, 0, 96, 0, TAU);
      g.fillStyle = '#6e1212';
      g.fill();
      g.lineWidth = 6;
      g.strokeStyle = '#c8a24a';
      g.stroke();
      g.beginPath();
      g.arc(0, 0, 84, 0, TAU);
      g.lineWidth = 2;
      g.stroke();
      g.restore();
      g.fillStyle = '#f4e8c8';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = 'bold 62px Georgia, "Times New Roman", serif';
      g.fillText('LAGER', cx, H / 2 + 6);
      g.font = 'bold 21px Georgia, "Times New Roman", serif';
      g.fillText('HOLLOW  CREEK', cx, H / 2 - 52);
      g.font = 'italic 17px Georgia, "Times New Roman", serif';
      g.fillText('brewed since 1897', cx, H / 2 + 54);
      g.fillStyle = '#c8a24a';
      for (const sx of [-150, 150]) {
        g.beginPath();
        g.arc(cx + sx, H / 2, 6, 0, TAU);
        g.fill();
      }
    }
    // small print on the back sides (lines of "text")
    g.fillStyle = 'rgba(80,50,30,0.55)';
    for (const cx of [W * 0.5, W]) {
      for (let i = 0; i < 12; i++) {
        const lw = 70 + R() * 70;
        g.fillRect(cx - lw / 2, 70 + i * 13, lw, 3);
        if (cx === W) g.fillRect(-lw / 2, 70 + i * 13, lw, 3);
      }
    }
    g.fillStyle = '#222';
    for (let i = 0; i < 24; i++) g.fillRect(W * 0.5 - 40 + i * 3.4, 270, i % 3 ? 1.6 : 2.6, 30); // barcode
    return canvasTexture(cv, { srgb: true });
  });
}
function bottleFoilTexture() {
  return cached('tex:bottleFoil', () => {
    const cv = makeCanvas(256, 64), g = cv.getContext('2d');
    g.fillStyle = '#7a1010';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#d9b45a';
    g.fillRect(0, 6, 256, 4);
    g.fillRect(0, 54, 256, 4);
    g.font = 'bold 22px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('HC', 64, 33);
    g.fillText('HC', 192, 33);
    return canvasTexture(cv, { srgb: true });
  });
}

function crownCapGeometry() {
  const L = [
    [14.25, 221.2, 0.8], [14.6, 222.6, 0.7], [14.75, 226.8, 0.45], [14.45, 230.6, 0.15],
    [13.6, 232.9, 0.02], [12.4, 233.8, 0], [6, 234, 0], [0, 234, 0],
  ];
  const S = 126, pos = [], uv = [], idx = [];
  for (let j = 0; j < L.length; j++) {
    for (let i = 0; i <= S; i++) {
      const phi = (i / S) * TAU, r = L[j][0] + L[j][2] * Math.cos(21 * phi);
      pos.push(r * Math.sin(phi) * 0.001, mmY(L[j][1]), r * Math.cos(phi) * 0.001);
      uv.push(i / S, j / (L.length - 1));
    }
  }
  for (let j = 0; j < L.length - 1; j++) {
    for (let i = 0; i < S; i++) {
      const a = j * (S + 1) + i, b = a + 1, d = a + S + 1, c = d + 1;
      idx.push(a, b, d, c, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

MATS.bottleGlass = () =>
  new THREE.MeshPhysicalMaterial({
    color: 0x3f9a52,
    metalness: 0,
    roughness: 0.08,
    transmission: 0.75,
    thickness: 0.003,
    ior: 1.52,
    attenuationColor: new THREE.Color(0x2a7a3a),
    attenuationDistance: 0.04,
    specularIntensity: 1,
    side: THREE.DoubleSide,
  });
MATS.bottleLabel = () => new THREE.MeshStandardMaterial({ map: bottleLabelTexture(), roughness: 0.72, metalness: 0 });
MATS.bottleFoil = () => new THREE.MeshStandardMaterial({ map: bottleFoilTexture(), roughness: 0.32, metalness: 0.75 });
MATS.bottleCap = () => new THREE.MeshStandardMaterial({ color: 0xd2a74f, roughness: 0.28, metalness: 1 });

function buildBottle() {
  const g = new THREE.Group();
  const glass = cached('geo:bottleGlass', () =>
    lathe(BOTTLE_GLASS_MM.map(([r, h]) => [r * 0.001, mmY(h)]), { segs: 48, crease: 50 }),
  );
  const label = cached('geo:bottleLabel', () => lathe([[0.03185, mmY(52)], [0.03185, mmY(118)]], { segs: 64 }));
  const foil = cached('geo:bottleFoil', () => lathe([[0.01395, mmY(183)], [0.01335, mmY(196)]], { segs: 40 }));
  g.add(new THREE.Mesh(glass, getMat('bottleGlass')));
  g.add(new THREE.Mesh(label, getMat('bottleLabel')));
  g.add(new THREE.Mesh(foil, getMat('bottleFoil')));
  g.add(new THREE.Mesh(cached('geo:bottleCap', crownCapGeometry), getMat('bottleCap')));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Wooden crate: 450 mm cube of planks with gaps, perimeter frames, diagonal braces, nails.
// ---------------------------------------------------------------------------------------------
const CRATE_S = 0.225;

/** Sutherland–Hodgman clip of a convex/concave polygon against an axis-aligned rectangle. */
function clipRect(poly, x0, y0, x1, y1) {
  const clip = (pts, inside, inter) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const A = pts[i], B = pts[(i + 1) % pts.length];
      const ia = inside(A), ib = inside(B);
      if (ia && ib) out.push(B);
      else if (ia && !ib) out.push(inter(A, B));
      else if (!ia && ib) out.push(inter(A, B), B);
    }
    return out;
  };
  const ix = (x) => (A, B) => [x, A[1] + ((B[1] - A[1]) * (x - A[0])) / (B[0] - A[0])];
  const iy = (y) => (A, B) => [A[0] + ((B[0] - A[0]) * (y - A[1])) / (B[1] - A[1]), y];
  let p = poly;
  p = clip(p, (P) => P[0] >= x0, ix(x0));
  p = clip(p, (P) => P[0] <= x1, ix(x1));
  p = clip(p, (P) => P[1] >= y0, iy(y0));
  p = clip(p, (P) => P[1] <= y1, iy(y1));
  return p;
}

function crateGeometry() {
  const S = CRATE_S, tf = 0.019, wf = 0.068, tp = 0.014, gap = 0.011, wb = 0.07;
  const R = rng(4242);
  const wood = [], nails = [];
  const tint = () => {
    const k = 0.78 + R() * 0.3;
    return [k * (0.98 + R() * 0.06), k, k * (0.92 + R() * 0.1)];
  };
  const setUV = (g, fnUV) => {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const r = fnUV(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
      uv.setXY(i, r[0], r[1]);
    }
  };
  const board = (mn, mx, longAxis) => {
    const g = new THREE.BoxGeometry(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
    g.translate((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2);
    const ou = R(), ov = R();
    setUV(g, (x, y, z, nx, ny, nz) => {
      const P = [x, y, z], an = [Math.abs(nx), Math.abs(ny), Math.abs(nz)];
      const fa = an[0] > an[1] ? (an[0] > an[2] ? 0 : 2) : an[1] > an[2] ? 1 : 2;
      const others = [0, 1, 2].filter((k) => k !== fa);
      const ua = longAxis !== fa ? longAxis : others[0];
      const va = others.find((k) => k !== ua);
      return [P[ua] / 0.5 + ou, P[va] / 0.25 + ov];
    });
    wood.push({ g, c: tint() });
  };
  for (let n = 0; n < 3; n++) {
    const a = (n + 1) % 3, b = (n + 2) % 3;
    const ext = [S, S, S];
    // ownership: top/bottom frames are full size, ±Z frames span full X, ±X frames are inset
    const ea = n === 1 ? S : n === 2 ? (a === 0 ? S : S - tf) : S - tf;
    const eb = n === 1 ? S : n === 2 ? (b === 0 ? S : S - tf) : S - tf;
    ext[a] = ea;
    ext[b] = eb;
    for (const s of [1, -1]) {
      const lay = (d0, d1) => (s > 0 ? [d0, d1] : [-d1, -d0]);
      const fr = lay(S - tf, S), pl = lay(S - tf - tp, S - tf);
      const mk = (a0, a1, b0, b1, d, longAxis) => {
        const mn = [0, 0, 0], mx = [0, 0, 0];
        mn[a] = a0; mx[a] = a1; mn[b] = b0; mx[b] = b1; mn[n] = d[0]; mx[n] = d[1];
        board(mn, mx, longAxis);
      };
      // frame
      mk(-ea, ea, -eb, -eb + wf, fr, a);
      mk(-ea, ea, eb - wf, eb, fr, a);
      mk(-ea, -ea + wf, -eb + wf, eb - wf, fr, b);
      mk(ea - wf, ea, -eb + wf, eb - wf, fr, b);
      // planks (run along a, stacked along b)
      const pb0 = -eb + 0.012, pb1 = eb - 0.012, cnt = 4;
      const pw = (pb1 - pb0 - gap * (cnt - 1)) / cnt;
      for (let k = 0; k < cnt; k++) mk(-ea + 0.012, ea - 0.012, pb0 + k * (pw + gap), pb0 + k * (pw + gap) + pw, pl, a);
      // diagonal brace in the frame layer
      const ia = ea - wf, ib = eb - wf, flip = (n + (s > 0 ? 0 : 1)) % 2 === 0 ? 1 : -1;
      const L = Math.hypot(ia, ib) * 2.2, ang = Math.atan2(ib * flip, ia);
      const ca = Math.cos(ang), sa = Math.sin(ang), hw = wb / 2;
      const band = [[-L * ca + hw * sa, -L * sa - hw * ca], [L * ca + hw * sa, L * sa - hw * ca], [L * ca - hw * sa, L * sa + hw * ca], [-L * ca - hw * sa, -L * sa + hw * ca]];
      const poly = clipRect(band, -ia, -ib, ia, ib);
      const bg = new THREE.ExtrudeGeometry(shapeOf(poly), { depth: tf, bevelEnabled: false, curveSegments: 1 });
      const ou = R(), ov = R();
      setUV(bg, (x, y) => [(x * ca + y * sa) / 0.5 + ou, (-x * sa + y * ca) / 0.25 + ov]);
      const ea3 = new THREE.Vector3(), eb3 = new THREE.Vector3(), en3 = new THREE.Vector3();
      ea3.setComponent(a, 1);
      eb3.setComponent(b, 1);
      en3.setComponent(n, 1);
      const M = new THREE.Matrix4().makeBasis(ea3, eb3, en3);
      M.setPosition(en3.clone().multiplyScalar(fr[0]));
      bg.applyMatrix4(M);
      wood.push({ g: bg, c: tint() });
      // nails: frame corners, plank ends, brace ends
      const nailAt = (pa, pb) => {
        const ng = new THREE.CylinderGeometry(0.0031, 0.0034, 0.0018, 7);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), en3.clone().multiplyScalar(s));
        ng.applyQuaternion(q);
        const P = new THREE.Vector3();
        P.setComponent(a, pa);
        P.setComponent(b, pb);
        P.setComponent(n, s * (S + 0.0003));
        ng.translate(P.x, P.y, P.z);
        nails.push(ng);
      };
      for (const sa2 of [-1, 1]) {
        for (const sb of [-1, 1]) {
          nailAt(sa2 * (ea - wf * 0.3), sb * (eb - wf * 0.5));
          nailAt(sa2 * (ea - wf * 0.7), sb * (eb - wf * 0.5));
        }
        for (let k = 0; k < cnt; k++) nailAt(sa2 * (ea - wf * 0.5), pb0 + k * (pw + gap) + pw / 2);
      }
      const bx = ia - wb * 0.55, by = (ib - wb * 0.55) * flip;
      nailAt(bx, by);
      nailAt(-bx, -by);
    }
  }
  const woodGeos = wood.map(({ g, c }) => {
    const cnt = g.attributes.position.count, arr = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) arr.set(c, i * 3);
    g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    return g;
  });
  const si = S - tf - tp - 0.0008;
  return {
    wood: mergeList(woodGeos),
    inner: new THREE.BoxGeometry(si * 2, si * 2, si * 2),
    nails: mergeList(nails),
  };
}

MATS.crateWood = () => {
  const [map, bump] = woodTextures('pine');
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.2, roughness: 0.86, metalness: 0, vertexColors: true });
};
MATS.crateInner = () => new THREE.MeshStandardMaterial({ color: 0x1b130c, roughness: 1, metalness: 0 });
MATS.nail = () => new THREE.MeshStandardMaterial({ color: 0x4a443d, roughness: 0.55, metalness: 0.8 });

function buildCrate() {
  const geo = cached('geo:crate', crateGeometry);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo.wood, getMat('crateWood')));
  g.add(new THREE.Mesh(geo.inner, getMat('crateInner')));
  g.add(new THREE.Mesh(geo.nails, getMat('nail')));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Pipe: 1½" schedule-40 galvanised steel, hollow, chamfered ends, rust spots.
// ---------------------------------------------------------------------------------------------
const PIPE = { ro: 0.02413, ri: 0.0204, L: 0.52, c: 0.0009 };
function pipeProfile() {
  const { ro, ri, L, c } = PIPE;
  return [[ri, -L], [ro - c, -L], [ro, -L + c], [ro, L - c], [ro - c, L], [ri, L], [ri, -L]];
}
/** Arc length along the pipe profile -> texture V (outer wall gets most of the texture). */
function pipeVMap() {
  return cached('pipe:vmap', () => {
    const prof = pipeProfile(), cum = [0];
    for (let j = 0; j < prof.length - 1; j++) cum.push(cum[j] + Math.hypot(prof[j + 1][0] - prof[j][0], prof[j + 1][1] - prof[j][1]));
    const S = [0, cum[2], cum[3], cum[5], cum[6]], V = [0, 0.012, 0.788, 0.8, 1];
    const interp = (x, X, Y) => {
      let k = 0;
      while (k < X.length - 2 && x > X[k + 1]) k++;
      return Y[k] + ((Y[k + 1] - Y[k]) * (x - X[k])) / (X[k + 1] - X[k] || 1);
    };
    return { prof, cum, toV: (s) => interp(s, S, V), toS: (v) => interp(v, V, S) };
  });
}
function pipeTextures() {
  return cached('tex:pipe', () => {
    const { prof, cum, toS } = pipeVMap();
    const zinc = hex3(0x6f757b), zincDark = hex3(0x50555a), whiteRust = hex3(0x9c9d97);
    const rust = hex3(0x6a3214), rustDark = hex3(0x3c1d0e), steel = hex3(0xaeb2b6);
    const c = [0, 0, 0], cell = [0, 0];
    const outerLen = cum[3] - cum[2];
    const cellsU = 22, cellsV = Math.round((22 * outerLen) / (0.776 * TAU * PIPE.ro));
    const [map, rm] = genTextures(128, 2048, [{ srgb: true }, { srgb: false }], (u, v, o) => {
      const s = toS(v);
      let j = 0;
      while (j < prof.length - 2 && cum[j + 1] < s) j++;
      const t = clamp((s - cum[j]) / (cum[j + 1] - cum[j] || 1), 0, 1);
      const r = lerp(prof[j][0], prof[j + 1][0], t), y = lerp(prof[j][1], prof[j + 1][1], t);
      const part = j === 2 ? 'outer' : j === 5 ? 'inner' : 'rim';
      const phi = u * TAU, X = r * Math.sin(phi) * 40, Z = r * Math.cos(phi) * 40, Y = y * 40;
      tcell(u, v, cellsU, cellsV, 9, cell);
      const brush = pnoise2(u * 128, v * 64, 128, 64, 4) * 0.6 + pnoise2(u * 128, v * 512, 128, 512, 5) * 0.25;
      set3(c, zinc, 0.97 + 0.035 * cell[1] + 0.045 * brush);
      const mot = fbm3(X * 0.5, Y * 0.5, Z * 0.5, 2);
      mixInto(c, zincDark, smooth(0.0, 0.5, mot) * 0.45);
      const wr = smooth(0.25, 0.55, fbm3(X * 1.2 + 4, Y * 1.2, Z * 1.2, 2));
      mixInto(c, whiteRust, wr * 0.4);
      let rough = 0.52 + 0.06 * cell[1] + wr * 0.25 + 0.06 * brush, metal = 0.75 - wr * 0.4;
      let rs = fbm3(X * 0.9 + 13, Y * 0.9, Z * 0.9, 4) + 0.18 * noise3(X * 6, Y * 6, Z * 6);
      if (part === 'inner') rs += 0.32;
      const ra = smooth(0.2, 0.42, rs);
      if (ra > 0) {
        mixInto(c, rust, ra);
        mixInto(c, rustDark, smooth(0.36, 0.6, rs) * 0.75);
        rough = lerp(rough, 0.92, ra);
        metal = lerp(metal, 0.1, ra);
      }
      if (part === 'inner') {
        c[0] *= 0.5;
        c[1] *= 0.47;
        c[2] *= 0.45;
        rough = Math.max(rough, 0.75);
      } else if (part === 'rim') {
        mix3(c, steel, rust, ra * 0.4);
        rough = 0.35;
        metal = 1;
      }
      o[0][0] = c[0];
      o[0][1] = c[1];
      o[0][2] = c[2];
      o[1][0] = 1;
      o[1][1] = clamp(rough, 0, 1);
      o[1][2] = clamp(metal, 0, 1);
    });
    return { map, rm };
  });
}
MATS.pipe = () => {
  const t = pipeTextures();
  return new THREE.MeshStandardMaterial({ map: t.map, roughnessMap: t.rm, metalnessMap: t.rm, roughness: 1, metalness: 1 });
};
function buildPipe() {
  const g = new THREE.Group();
  const geo = cached('geo:pipe', () => {
    const { toV, prof } = pipeVMap();
    const total = prof.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - prof[i - 1][0], p[1] - prof[i - 1][1]) : 0), 0);
    const lg = lathe(prof, { segs: 36, crease: 30 });
    const uv = lg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, toV(uv.getY(i) * total));
    return lg;
  });
  g.add(new THREE.Mesh(geo, getMat('pipe')));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Dumbbell: handle along local +X (knurled centre, chrome ends, collars), cast-iron plates.
// ---------------------------------------------------------------------------------------------
// Plate profile in plate-local mm: [r, y]; y = -20 faces the grip, y = +20 faces outwards.
const PLATE_PROFILE = [
  [15.5, -20], [30, -20], [33, -14], [74, -14], [77, -20], [87.5, -20], [90, -17.5], [90, 17.5],
  [87.5, 20], [77, 20], [74, 14], [33, 14], [30, 20], [15.5, 20],
];
function plateTextures() {
  return cached('tex:plate', () => {
    const P = PLATE_PROFILE, cum = [0];
    for (let j = 0; j < P.length - 1; j++) cum.push(cum[j] + Math.hypot(P[j + 1][0] - P[j][0], P[j + 1][1] - P[j][1]));
    const total = cum[cum.length - 1];
    const jw = 10; // segment [74,14] -> [33,14]: outer web face
    const v0 = cum[jw] / total, v1 = cum[jw + 1] / total;
    const W = 1024, H = 512;
    const [cb, bb] = genBuffers(W, H, 2, (u, v, o) => {
      const n = pnoise2(u * 220, v * 120, 220, 120, 3) * 0.6 + pnoise2(u * 520, v * 260, 520, 260, 8) * 0.4;
      const m = tfbm(u, v, 12, 6, 3, 41);
      const k = 0.15 + 0.025 * n + 0.02 * m;
      o[0][0] = k;
      o[0][1] = k * 1.02;
      o[0][2] = k * 1.06;
      o[1][0] = o[1][1] = o[1][2] = clamp(0.5 + 0.35 * n, 0, 1);
    });
    const mk = (buf, textColor) => {
      const cv = makeCanvas(W, H), g = cv.getContext('2d');
      // genBuffers row 0 is v≈0; canvas row 0 becomes v=1 after flipY, so draw flipped rows
      const img = new ImageData(W, H);
      for (let j = 0; j < H; j++) img.data.set(buf.subarray((H - 1 - j) * W * 4, (H - j) * W * 4), j * W * 4);
      g.putImageData(img, 0, 0);
      const yTop = (1 - v1) * H, yBot = (1 - v0) * H, band = yBot - yTop;
      g.fillStyle = textColor;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `bold ${Math.round(band * 0.5)}px Arial, Helvetica, sans-serif`;
      for (const [u, txt] of [[0.125, '10 KG'], [0.375, '22 LB'], [0.625, '10 KG'], [0.875, '22 LB']]) {
        g.fillText(txt, u * W, (yTop + yBot) / 2);
      }
      return cv;
    };
    const map = canvasTexture(mk(cb, '#9a9ea3'), { srgb: true });
    const bump = canvasTexture(mk(bb, '#ffffff'), { srgb: false });
    return { map, bump };
  });
}
function knurlBand() {
  return cached('geo:dbKnurl', () => xLathe([[0.017, -0.062], [0.017, 0.062]], { segs: 48, uScale: 9, vScale: 1 / 0.012 }));
}
MATS.chrome = () => new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.14 });
MATS.knurlSteel = () =>
  new THREE.MeshStandardMaterial({ color: 0xc7cbd0, metalness: 1, roughness: 0.34, bumpMap: knurlTexture(), bumpScale: 2.0 });
MATS.castIron = () => {
  const t = plateTextures();
  return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 1.3, metalness: 0.55, roughness: 0.5 });
};
function buildDumbbell() {
  const geos = cached('geo:dumbbell', () => {
    const mm = (pts) => pts.map(([r, x]) => [r * 0.001, x * 0.001]);
    const inner = mm([[16.3, 62], [16.3, 63.6], [17, 64.3], [17, 111], [23.8, 111.4], [24.6, 112.3], [24.6, 129.3], [24, 130]]);
    const outer = mm([
      [15.2, 170], [27.4, 170.2], [28.2, 171], [28.2, 173.6], [27.4, 174.2], [27.4, 175.2], [28.2, 175.8], [28.2, 178.2],
      [27.4, 178.8], [27.4, 179.8], [28.2, 180.4], [28.2, 184.4], [27.2, 185.4], [14.6, 185.6], [14.6, 188.6], [13.6, 189.6], [0, 189.6],
    ]);
    const right = mergeList([xLathe(inner, { segs: 40, crease: 40 }), xLathe(outer, { segs: 40, crease: 40 })]);
    const left = right.clone().rotateY(Math.PI);
    const chrome = mergeList([right, left]);
    const plate = xLathe(PLATE_PROFILE.map(([r, y]) => [r * 0.001, y * 0.001]), { segs: 72, crease: 30 });
    const plateR = plate.clone().translate(0.15, 0, 0);
    const plateL = plate.clone().rotateY(Math.PI).translate(-0.15, 0, 0);
    return { chrome, plates: mergeList([plateR, plateL]) };
  });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(knurlBand(), getMat('knurlSteel')));
  g.add(new THREE.Mesh(geos.chrome, getMat('chrome')));
  g.add(new THREE.Mesh(geos.plates, getMat('castIron')));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Watermelon: ellipsoid (long axis local Z), jagged dark stripes, field spot, dried stem.
// ---------------------------------------------------------------------------------------------
const MELON_R = 0.13, MELON_SCALE = [1.0, 0.95, 1.12];
function melonTextures() {
  return cached('tex:melon', () => {
    const light = hex3(0x8fb85a), lightB = hex3(0x6d9a40), dark = hex3(0x1c4718), darkB = hex3(0x12330f);
    const field = hex3(0xd8c87a), stem = hex3(0x7a6a3a);
    const d = [0, 0, 0], c = [0, 0, 0];
    const [map, bump] = genTextures(512, 256, [{ srgb: true }, { srgb: false }], (u, v, o) => {
      sphereDir(u, v, d);
      const phi = u * TAU;
      const j = fbm3(d[0] * 2.6, d[1] * 1.2, d[2] * 2.6, 4) * 1.5 + noise3(d[0] * 11, d[1] * 6, d[2] * 11) * 0.45 + noise3(d[0] * 34, d[1] * 20, d[2] * 34) * 0.16;
      const s = 0.5 + 0.5 * Math.cos(phi * 16 + j * 2.8);
      const dk = smooth(0.32, 0.5, s);
      mix3(c, light, lightB, smooth(-0.2, 0.4, noise3(d[0] * 18, d[1] * 9, d[2] * 18)) * 0.8);
      const veins = Math.pow(Math.abs(noise3(d[0] * 26, d[1] * 13, d[2] * 26)), 0.5);
      mixInto(c, dark, (1 - smooth(0.0, 0.25, veins)) * 0.35);
      mixInto(c, dark, dk);
      mixInto(c, darkB, dk * smooth(0.1, 0.6, fbm3(d[0] * 7, d[1] * 7, d[2] * 7, 3)) * 0.6);
      const fs = smooth(0.8, 0.94, d[0] + 0.1 * fbm3(d[0] * 5, d[1] * 5, d[2] * 5, 3));
      mixInto(c, field, fs * 0.8);
      const pole = Math.abs(d[1]);
      mixInto(c, stem, smooth(0.985, 0.998, pole) * 0.9);
      o[0][0] = c[0];
      o[0][1] = c[1];
      o[0][2] = c[2];
      o[1][0] = o[1][1] = o[1][2] = clamp(0.5 + 0.18 * noise3(d[0] * 60, d[1] * 60, d[2] * 60) + 0.08 * dk, 0, 1);
    });
    return { map: sphereWrap(map), bump: sphereWrap(bump) };
  });
}
MATS.melonRind = () => {
  const t = melonTextures();
  return new THREE.MeshPhysicalMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 0.6, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35 });
};
MATS.melonStem = () => new THREE.MeshStandardMaterial({ color: 0x5d4c2c, roughness: 0.85, metalness: 0 });
function buildWatermelon() {
  const geo = cached('geo:melon', () => {
    const g = new THREE.SphereGeometry(1, 56, 40);
    g.rotateX(Math.PI / 2); // poles along ±Z (long axis)
    g.scale(MELON_R * MELON_SCALE[0], MELON_R * MELON_SCALE[1], MELON_R * MELON_SCALE[2]);
    return g;
  });
  const stemGeo = cached('geo:melonStem', () => {
    const zT = MELON_R * MELON_SCALE[2];
    return mergeList([
      cylBetween([0, 0, zT - 0.004], [0.002, 0.003, zT + 0.009], 0.0042, 0.0032, 8),
      cylBetween([0.002, 0.003, zT + 0.009], [0.006, 0.007, zT + 0.016], 0.0032, 0.0024, 8),
    ]);
  });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, getMat('melonRind')));
  g.add(new THREE.Mesh(stemGeo, getMat('melonStem')));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Soccer ball: truncated-icosahedron panels (12 black pentagons, 20 white hexagons).
// ---------------------------------------------------------------------------------------------
const SOCCER_R = 0.11;
function truncIcosa() {
  return cached('soccer:faces', () => {
    const p = (1 + Math.sqrt(5)) / 2;
    const V = [[0, 1, p], [0, -1, p], [0, 1, -p], [0, -1, -p], [1, p, 0], [-1, p, 0], [1, -p, 0], [-1, -p, 0], [p, 0, 1], [-p, 0, 1], [p, 0, -1], [-p, 0, -1]].map((a) => new THREE.Vector3(...a));
    const near = (a, b) => Math.abs(a.distanceTo(b) - 2) < 1e-6;
    const verts = [], normals = [], pent = [];
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 12; j++) if (i !== j && near(V[i], V[j])) verts.push(V[i].clone().lerp(V[j], 1 / 3));
    }
    for (let i = 0; i < 12; i++) {
      normals.push(V[i].clone().normalize());
      pent.push(true);
    }
    for (let i = 0; i < 12; i++) {
      for (let j = i + 1; j < 12; j++) {
        for (let k = j + 1; k < 12; k++) {
          if (near(V[i], V[j]) && near(V[j], V[k]) && near(V[i], V[k])) {
            normals.push(V[i].clone().add(V[j]).add(V[k]).normalize());
            pent.push(false);
          }
        }
      }
    }
    const F = normals.length, data = new Float32Array(F * 4);
    for (let f = 0; f < F; f++) {
      let h = 0;
      for (const v of verts) h = Math.max(h, normals[f].dot(v));
      data[4 * f] = normals[f].x / h;
      data[4 * f + 1] = normals[f].y / h;
      data[4 * f + 2] = normals[f].z / h;
      data[4 * f + 3] = pent[f] ? 1 : 0;
    }
    return { F, data };
  });
}
function soccerTextures() {
  return cached('tex:soccer', () => {
    const { F, data } = truncIcosa();
    const d = [0, 0, 0], k = new Float32Array(F);
    const seamW = 0.55 / (SOCCER_R * 1000);
    const [map, bump] = genTextures(1024, 512, [{ srgb: true }, { srgb: false }], (u, v, o) => {
      sphereDir(u, v, d);
      let b0 = -1, b1 = -1, b2 = -1, i0 = 0, i1 = 0, i2 = 0;
      for (let f = 0; f < F; f++) {
        const val = data[4 * f] * d[0] + data[4 * f + 1] * d[1] + data[4 * f + 2] * d[2];
        k[f] = val;
        if (val > b0) {
          b2 = b1; i2 = i1; b1 = b0; i1 = i0; b0 = val; i0 = f;
        } else if (val > b1) {
          b2 = b1; i2 = i1; b1 = val; i1 = f;
        } else if (val > b2) {
          b2 = val; i2 = f;
        }
      }
      let edge = 1;
      for (const g of [i1, i2]) {
        const gx = data[4 * i0] - data[4 * g], gy = data[4 * i0 + 1] - data[4 * g + 1], gz = data[4 * i0 + 2] - data[4 * g + 2];
        const dot = gx * d[0] + gy * d[1] + gz * d[2];
        const tx = gx - d[0] * dot, ty = gy - d[1] * dot, tz = gz - d[2] * dot;
        const gl = Math.hypot(tx, ty, tz) || 1;
        edge = Math.min(edge, (k[i0] - k[g]) / gl);
      }
      const isPent = data[4 * i0 + 3] > 0.5;
      const dirt = fbm3(d[0] * 4, d[1] * 4, d[2] * 4, 2);
      let col = isPent ? 0.045 : 0.9 - 0.05 * smooth(0.1, 0.6, dirt);
      const seam = 1 - smooth(seamW * 0.6, seamW * 1.6, edge);
      col = lerp(col, isPent ? 0.03 : 0.32, seam);
      const grain = ((ihash(u * 4096, v * 4096, 3) & 1023) / 1023 - 0.5) * 0.02;
      o[0][0] = o[0][1] = o[0][2] = clamp(col + grain, 0, 1);
      if (!isPent) {
        o[0][2] *= 0.985;
        o[0][0] *= 1.0;
      }
      const hgt = smooth(0, seamW * 5, edge) * 0.8 + 0.2 * smooth(seamW * 5, 0.25, edge) + grain * 4;
      o[1][0] = o[1][1] = o[1][2] = clamp(hgt, 0, 1);
    });
    return { map: sphereWrap(map), bump: sphereWrap(bump) };
  });
}
MATS.soccer = () => {
  const t = soccerTextures();
  return new THREE.MeshPhysicalMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 2.0, roughness: 0.42, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.3 });
};
function buildSoccerBall() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(cached('geo:soccer', () => new THREE.SphereGeometry(SOCCER_R, 56, 40)), getMat('soccer')));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Debris shards
// ---------------------------------------------------------------------------------------------
MATS.shardGlass = () =>
  new THREE.MeshStandardMaterial({ color: 0x4f9e5c, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
MATS.melonFlesh = () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, flatShading: true });

function flatNormals(g) {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals();
  return ng;
}
function shardGeometry(kind, variant) {
  return cached(`geo:shard:${kind}:${variant}`, () => {
    const R = rng(1000 + variant * 31 + kind.length * 7);
    if (kind === 'glass') {
      const n = 4 + Math.floor(R() * 3), pts = [];
      const scale = 0.007 + R() * 0.007;
      for (let i = 0; i < n; i++) {
        const a = ((i + R() * 0.7) / n) * TAU;
        const r = scale * (0.45 + R() * 0.9) * (i === 0 ? 1.6 : 1);
        pts.push([Math.cos(a) * r, Math.sin(a) * r * (0.6 + R() * 0.5)]);
      }
      const g = new THREE.ExtrudeGeometry(shapeOf(pts), { depth: 0.0026, bevelEnabled: false });
      g.translate(0, 0, -0.0013);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        p.setZ(i, p.getZ(i) + (x * x) / (2 * 0.032)); // bottle wall curvature
      }
      g.computeBoundingBox();
      const c = g.boundingBox.getCenter(new THREE.Vector3());
      g.translate(-c.x, -c.y, -c.z);
      g.computeVertexNormals();
      return g;
    }
    if (kind === 'wood') {
      const len = 0.03 + R() * 0.035, rings = [0, 0.12, 0.35, 0.6, 0.85, 1];
      const secs = rings.map((t, i) => {
        const end = i === 0 || i === rings.length - 1;
        const w = end ? 0.0006 + R() * 0.0012 : 0.0035 + R() * 0.0045 * Math.sin(t * Math.PI + 0.3);
        const th = end ? 0.0005 : 0.0018 + R() * 0.0018;
        const oy = (R() - 0.5) * 0.002, oz = (R() - 0.5) * 0.0025;
        const x = (t - 0.5) * len;
        return [[x, oy - th / 2, oz - w / 2], [x, oy - th / 2, oz + w / 2], [x, oy + th / 2, oz + w / 2], [x, oy + th / 2, oz - w / 2]];
      });
      const pos = [], uv = [];
      const quad = (a, b, c, d) => {
        for (const P of [a, b, c, a, c, d]) {
          pos.push(P[0], P[1], P[2]);
          uv.push(P[0] / 0.5 + 0.3, (P[2] + P[1]) / 0.25 + 0.6);
        }
      };
      for (let i = 0; i < secs.length - 1; i++) {
        const A = secs[i], B = secs[i + 1];
        for (let k = 0; k < 4; k++) quad(A[k], A[(k + 1) % 4], B[(k + 1) % 4], B[k]);
      }
      const A = secs[0], B = secs[secs.length - 1];
      quad(A[3], A[2], A[1], A[0]);
      quad(B[0], B[1], B[2], B[3]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      fixWindingSoup(g);
      const col = new Float32Array(pos.length).fill(1);
      for (let i = 0; i < col.length; i += 3) {
        col[i] = 0.92;
        col[i + 1] = 0.8;
        col[i + 2] = 0.62;
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return g;
    }
    // melon: chunk of red flesh with a strip of rind on its -Y side
    const r = 0.012 + R() * 0.008;
    const base = new THREE.IcosahedronGeometry(1, 1);
    const g = base.index ? base.toNonIndexed() : base;
    const p = g.attributes.position;
    const sx = 1 + R() * 0.5, sz = 0.8 + R() * 0.4, seed = R() * 10;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.22 * noise3(x * 1.7 + seed, y * 1.7, z * 1.7);
      p.setXYZ(i, x * k * r * sx, Math.max(y * k, -0.55) * r, z * k * r * sz);
    }
    g.computeVertexNormals();
    const cols = new Float32Array(p.count * 3);
    const lin = (h) => new THREE.Color(h).toArray();
    const red = lin(0xc8202e), red2 = lin(0xe8445a), white = lin(0xd9e4b8), green = lin(0x2a5a1e), seedCol = lin(0x1a120c);
    for (let f = 0; f < p.count; f += 3) {
      const cy = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3 / r;
      let c;
      if (cy < -0.5) c = green;
      else if (cy < -0.36) c = white;
      else c = mix3([0, 0, 0], red, red2, R());
      if (cy > -0.2 && R() < 0.035) c = seedCol;
      for (let k = 0; k < 3; k++) cols.set(c, (f + k) * 3);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    g.translate(-c.x, -c.y, -c.z);
    return g;
  });
}
/** Ensure a non-indexed closed triangle soup faces outwards (relative to its centroid). */
function fixWindingSoup(g) {
  const p = g.attributes.position, ctr = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) ctr.x += p.getX(i), ctr.y += p.getY(i), ctr.z += p.getZ(i);
  ctr.divideScalar(p.count);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    m.copy(a).add(b).add(c).divideScalar(3).sub(ctr);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.dot(m) < 0) {
      p.setXYZ(i + 1, c.x, c.y, c.z);
      p.setXYZ(i + 2, b.x, b.y, b.z);
      const uv = g.attributes.uv;
      if (uv) {
        const u1 = uv.getX(i + 1), v1 = uv.getY(i + 1);
        uv.setXY(i + 1, uv.getX(i + 2), uv.getY(i + 2));
        uv.setXY(i + 2, u1, v1);
      }
    }
  }
  g.computeVertexNormals();
}

export const SHARD_KINDS = ['glass', 'wood', 'melon'];
/**
 * Small debris mesh. kind: 'glass' | 'wood' | 'melon'. variant (0..3) picks one of four cached
 * shapes (random when omitted). Geometry/material are shared; origin at the shard's centre.
 * Glass uses a transparent material (depthWrite false); wood reuses the crate wood material.
 */
export function createShardMesh(kind = 'glass', variant) {
  if (!SHARD_KINDS.includes(kind)) throw new Error(`createShardMesh: unknown kind '${kind}'`);
  const v = variant === undefined ? Math.floor(Math.random() * 4) : ((variant % 4) + 4) % 4;
  const mat = kind === 'glass' ? getMat('shardGlass') : kind === 'wood' ? getMat('crateWood') : getMat('melonFlesh');
  const m = new THREE.Mesh(shardGeometry(kind, v), mat);
  m.name = 'shard_' + kind;
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.shard = kind;
  return m;
}

const THROWABLE_BUILDERS = {
  baseball: buildBaseball,
  brick: buildBrick,
  bowlingBall: buildBowlingBall,
  bottle: buildBottle,
  crate: buildCrate,
  pipe: buildPipe,
  dumbbell: buildDumbbell,
  watermelon: buildWatermelon,
  soccerBall: buildSoccerBall,
};
export const THROWABLE_TYPES = Object.keys(THROWABLE_BUILDERS);

/**
 * Visual for a throwable physics body. The returned Object3D has an identity transform whose
 * local frame equals the body frame (see THROWABLE_COLLIDERS); copy the body pose onto it.
 */
export function createThrowableMesh(type) {
  const build = THROWABLE_BUILDERS[type];
  if (!build) throw new Error(`createThrowableMesh: unknown type '${type}'`);
  return fromTemplate('throw:' + type, () => {
    const g = build();
    g.name = type;
    g.userData = { throwable: type, collider: THROWABLE_COLLIDERS[type] };
    return g;
  });
}

// =============================================================================================
// WEAPON VIEWMODELS
// Modelled in millimetre "design" coordinates: x2 = distance forward along the bore (model -Z),
// y = up, X = right. Each weapon picks an origin (ox, oy) at the centre of its firing grip; the
// final geometry is converted to metres in the model frame (barrel -Z, grip -Y, origin = hand).
// =============================================================================================
const MM = 0.001;

function cloneRepeat(tex, rx, ry) {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}
const stippleFor = (mmPerTile) => cached('tex:stipple:' + mmPerTile, () => cloneRepeat(stippleTexture(), 1 / mmPerTile, 1 / mmPerTile));
function walnutTextures() {
  return cached('tex:walnutGun', () => {
    const [map, bump] = woodTextures('walnut');
    return { map: cloneRepeat(map, 1 / 320, 1 / 160), bump: cloneRepeat(bump, 1 / 320, 1 / 160) };
  });
}

MATS.gunBlued = () => new THREE.MeshStandardMaterial({ color: 0x262a31, metalness: 0.85, roughness: 0.3 });
MATS.gunNitride = () => new THREE.MeshStandardMaterial({ color: 0x2b2c2f, metalness: 0.7, roughness: 0.45 });
MATS.gunPark = () => new THREE.MeshStandardMaterial({ color: 0x2d2e2e, metalness: 0.55, roughness: 0.6, bumpMap: stippleFor(18), bumpScale: 0.3 });
MATS.gunAnod = () => new THREE.MeshStandardMaterial({ color: 0x25262a, metalness: 0.6, roughness: 0.44, bumpMap: stippleFor(40), bumpScale: 0.12 });
MATS.gunBarrel = () => new THREE.MeshStandardMaterial({ color: 0x303236, metalness: 0.8, roughness: 0.4 });
MATS.gunPolymer = () => new THREE.MeshStandardMaterial({ color: 0x1d1e20, metalness: 0, roughness: 0.74, bumpMap: stippleFor(10), bumpScale: 0.6 });
MATS.gunPolymerOD = () => new THREE.MeshStandardMaterial({ color: 0x4a4f37, metalness: 0, roughness: 0.82, bumpMap: stippleFor(8), bumpScale: 0.8 });
MATS.gunPolymerMag = () => new THREE.MeshStandardMaterial({ color: 0x2a2b2d, metalness: 0, roughness: 0.66, bumpMap: stippleFor(14), bumpScale: 0.35 });
MATS.gunRubber = () => new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0, roughness: 0.93, bumpMap: stippleFor(6), bumpScale: 0.5 });
MATS.gunWalnut = () => {
  const t = walnutTextures();
  return new THREE.MeshPhysicalMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 0.25, roughness: 0.5, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.3 });
};
MATS.gunWalnutCheck = () => {
  const t = walnutTextures();
  return new THREE.MeshPhysicalMaterial({ map: t.map, bumpMap: cloneRepeat(knurlTexture(), 1 / 11, 1 / 11), bumpScale: 1.2, roughness: 0.6, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.45 });
};
MATS.gunSteelBright = () => new THREE.MeshStandardMaterial({ color: 0xaeb2b7, metalness: 1, roughness: 0.27 });
MATS.gunBore = () => new THREE.MeshStandardMaterial({ color: 0x070707, metalness: 0.2, roughness: 0.85 });
MATS.gunBrass = () => new THREE.MeshStandardMaterial({ color: 0xcfa24e, metalness: 1, roughness: 0.28 });
MATS.gunCopper = () => new THREE.MeshStandardMaterial({ color: 0xb8703f, metalness: 1, roughness: 0.3 });
MATS.gunSightWhite = () => new THREE.MeshStandardMaterial({ color: 0xf2f2ea, emissive: 0x303030, roughness: 0.5, metalness: 0 });
MATS.gunLens = () =>
  new THREE.MeshPhysicalMaterial({ color: 0x0c2036, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.55, depthWrite: false, iridescence: 0.7, iridescenceIOR: 1.8, specularIntensity: 1 });
MATS.gunRedDot = () => new THREE.MeshBasicMaterial({ color: 0xff2a14, toneMapped: false });

// --- design-space helpers (millimetres) ---
/** Give cap triangles (faces perpendicular to `axis`) their exact face normal (no smoothing smear). */
function flattenCaps(g, axis) {
  const p = g.attributes.position, n = g.attributes.normal;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1).sub(a);
    c.fromBufferAttribute(p, i + 2).sub(a);
    b.cross(c);
    const l = b.length();
    if (l < 1e-12) continue;
    b.divideScalar(l);
    if (Math.abs(b.getComponent(axis)) > 0.9995) for (let k = 0; k < 3; k++) n.setXYZ(i + k, b.x, b.y, b.z);
  }
  n.needsUpdate = true;
  return g;
}
/** Rotate a geometry's UVs (degrees) — e.g. to run wood grain along an angled grip. */
function rotUV(g, deg) {
  const uv = g.attributes.uv, c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, u * c - v * s, u * s + v * c);
  }
  return g;
}
const SE = (outline, thick, o = {}) =>
  flattenCaps(creased(sideExtrude(roundPoly(outline, 0, o.fs ?? 3), thick, { ...o, holes: (o.holes || []).map((h) => roundPoly(h, 0, o.fs ?? 3)) }), o.crease ?? 38), 0);
const AE = (section, x2Back, x2Front, o = {}) =>
  flattenCaps(creased(axialExtrude(roundPoly(section, 0, o.fs ?? 3), x2Back, x2Front, { ...o, holes: (o.holes || []).map((h) => roundPoly(h, 0, o.fs ?? 3)) }), o.crease ?? 38), 2);
const AL = (profile, o = {}) => axisLathe(profile, { segs: 24, crease: 40, ...o });
const BX = (x2a, x2b, ya, yb, Xa, Xb) => box2(x2a, x2b, ya, yb, Xa, Xb);
/** Cylinder along X at design (y, x2). */
const XC = (X0, X1, y, x2, r, segs = 16) => cylBetween([X0, y, -x2], [X1, y, -x2], r, r, segs);
/** Cylinder along the bore axis direction at (X, y) from x2a to x2b. */
const ZC = (X, y, x2a, x2b, r, segs = 16) => cylBetween([X, y, -x2a], [X, y, -x2b], r, r, segs);
/** Cylinder along Y at (X, x2) from ya to yb. */
const YC = (X, x2, ya, yb, r, segs = 16) => cylBetween([X, ya, -x2], [X, yb, -x2], r, r, segs);

/** Merge collected parts into meshes. pivot [X, y, x2] (design mm) becomes the group origin. */
function addParts(root, parts, ox, oy, name = null, pivot = null) {
  const target = name ? new THREE.Group() : root;
  if (name) {
    target.name = name;
    root.add(target);
  }
  const p = pivot || [0, oy, ox];
  for (const [key, geos] of parts.map) {
    const g = mergeList(geos);
    g.translate(-p[0], -p[1], p[2]);
    g.scale(MM, MM, MM);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const m = new THREE.Mesh(g, getMat(key));
    m.name = name ? `${name}:${key}` : key;
    target.add(m);
  }
  if (name) target.position.set(p[0] * MM, (p[1] - oy) * MM, -(p[2] - ox) * MM);
  return target;
}
function marker(root, name, X, y, x2, ox, oy) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(X * MM, (y - oy) * MM, -(x2 - ox) * MM);
  root.add(o);
  return o;
}
/** Picatinny rail along the bore axis: base + cross-slotted teeth. top = rail top height. */
function picatinny(P, mat, x2a, x2b, top, opts = {}) {
  const w = opts.width ?? 21.2, h = 9.4, half = w / 2;
  P.add(mat, AE([[-half + 2.4, top - h], [half - 2.4, top - h], [half - 2.4, top - 6.2], [half, top - 4.6], [half - 1.4, top - 3.2], [-half + 1.4, top - 3.2], [-half, top - 4.6], [-half + 2.4, top - 6.2]], x2a, x2b, { bevel: 0.25 }));
  const pitch = 10.01, tooth = 5.2;
  for (let x = x2a + 1.2; x + tooth <= x2b - 0.8; x += pitch) P.add(mat, BX(x, x + tooth, top - 3.4, top, -half + 1.5, half - 1.5));
}

// ---------------------------------------------------------------------------------------------
// Pistol: polymer-frame 9 mm (Glock 19 proportions). Design: x from slide rear, y from mag base.
// Children: 'slide' (moves +Z on recoil), 'muzzle', 'ejector'.
// ---------------------------------------------------------------------------------------------
function buildPistol() {
  const ox = 13, oy = 50;
  const root = new THREE.Group();
  const F = new Parts(), S = new Parts();
  const bore = 112, top = 127.5;
  // slide: two halves; the right one carries the ejection port notch
  const slideL = [[0, 99], [174, 99], [174, 121, 1.5], [170, 126, 3], [158, top, 2], [3, top, 2], [0, 124.5, 1.5]];
  const slideR = [[0, 99], [174, 99], [174, 121, 1.5], [170, 126, 3], [158, top, 2], [111, top], [111, 116.2, 1.6], [80, 116.2, 1.6], [80, top], [3, top, 2], [0, 124.5, 1.5]];
  S.add('gunNitride', SE(slideL, 14.25, { cx: -5.625, bevel: 1.1 }));
  S.add('gunNitride', SE(slideR, 14.25, { cx: 5.625, bevel: 1.1 }));
  for (let i = 0; i < 8; i++) {
    const x = 5.5 + i * 2.7;
    for (const s of [-1, 1]) S.add('gunNitride', BX(x, x + 1.25, 101.5, 123.5, s * 12.65, s * 13.25));
  }
  S.add('gunBlued', BX(71, 79.5, 117.5, 120.5, 12.6, 13.1)); // extractor
  // sights: U-notch rear with white outline, front post with dot
  S.add('gunNitride', AE([[-8, 127], [8, 127], [8, 132.6, 0.8], [6, 133.6], [1.8, 133.6], [1.8, 130.5, 0.4], [-1.8, 130.5, 0.4], [-1.8, 133.6], [-6, 133.6], [-8, 132.6, 0.8]], 7, 16, { bevel: 0.4 }));
  S.add('gunSightWhite', AE([[-2.8, 133.6], [-2.8, 129.7, 1], [2.8, 129.7, 1], [2.8, 133.6], [1.85, 133.6], [1.85, 130.55], [-1.85, 130.55], [-1.85, 133.6]], 6.8, 7.05));
  S.add('gunNitride', AE([[-1.7, 127], [1.7, 127], [1.7, 133.4, 0.5], [-1.7, 133.4, 0.5]], 160, 165.5, { bevel: 0.3 }));
  S.add('gunSightWhite', ZC(0, 131.4, 159.8, 160.1, 0.95, 12));
  // muzzle: barrel crown + bore, recoil spring guide
  S.add('gunBarrel', AL([[6.3, 171], [6.3, 174.5], [5.8, 174.95], [4.7, 174.95]], { cy: bore }));
  S.add('gunBore', AL([[4.75, 174.9], [0, 174.9]], { cy: bore }));
  S.add('gunBore', AL([[3.6, 174.05], [0, 174.05]], { cy: 103.5 }));
  // barrel hood visible through the port (static, stays with the frame)
  F.add('gunBarrel', BX(81, 110.5, 113, 126.2, -4.5, 9.5));
  F.add('gunBarrel', BX(80.6, 82, 116, 125.4, -4.5, 9.8));
  // frame: upper (dust cover / rails), trigger guard, grip, magazine base
  F.add('gunPolymer', SE([[1, 99.6], [166, 99.6], [167, 92, 2], [150, 89.5, 1], [104, 89.5, 1.5], [100, 86], [50, 86], [10, 93], [2, 97]], 24, { bevel: 1.2 }));
  F.add('gunPolymer', SE([[104.5, 89.6], [103, 70, 4], [98, 64.5, 4.5], [62, 64.5, 5], [55, 70, 3], [50, 82], [52, 89.6]], 13, {
    bevel: 1.6,
    holes: [[[98.8, 86.5], [98.3, 72, 3], [94, 68.6, 3], [64, 68.6, 4], [58.6, 74, 3], [57.6, 86.5]]],
  }));
  const grip = [[-16, 6, 2.5], [29, 7, 2.5]];
  const f0 = [29, 7], f1 = [55, 71], dl = Math.hypot(f1[0] - f0[0], f1[1] - f0[1]);
  const dir = [(f1[0] - f0[0]) / dl, (f1[1] - f0[1]) / dl], nrm = [dir[1], -dir[0]];
  for (let i = 1; i < 20; i++) {
    const t = i / 20;
    let off = 0;
    if (t > 0.08 && t < 0.9) off = 1.7 * Math.cos((TAU * 3 * (t - 0.08)) / 0.82) - 0.4;
    grip.push([f0[0] + (f1[0] - f0[0]) * t + nrm[0] * off, f0[1] + (f1[1] - f0[1]) * t + nrm[1] * off]);
  }
  grip.push([55, 71], [58, 80], [52, 92], [14, 96.5], [-1.5, 98, 1.5], [-6, 95.5, 3], [-7.5, 90.5, 3], [-10, 72], [-13.5, 52, 8], [-15.5, 32], [-17, 14, 3]);
  F.add('gunPolymer', SE(grip, 30, { bevel: 3.6, bevelSegs: 3 }));
  F.add('gunPolymer', SE([[-17.5, 0, 2.5], [31.5, 0.8, 2.5], [32, 7], [-18, 7]], 27, { bevel: 1.5 }));
  // trigger, slide stop, takedown lever
  F.add('gunPolymer', SE([[68, 87], [72.8, 86], [73.8, 81], [72.8, 76], [70, 72.6], [68.4, 72.4, 1], [67.4, 74], [69.4, 77], [70.1, 81], [69.2, 86]], 6, { bevel: 0.8 }));
  F.add('gunNitride', BX(58, 75, 96.8, 99.4, -12.6, -11.4));
  F.add('gunBlued', BX(83, 86.5, 94.5, 97.5, -12.3, 12.3));
  addParts(root, F, ox, oy);
  addParts(root, S, ox, oy, 'slide');
  marker(root, 'muzzle', 0, bore, 175.2, ox, oy);
  marker(root, 'ejector', 6, 122, 96, ox, oy);
  return root;
}

// ---------------------------------------------------------------------------------------------
// Revolver: .357 Magnum, 4" barrel, vent rib, full underlug, fluted 6-shot cylinder (loaded),
// checkered walnut grips. Design: x from rear of grip, y from butt. Children: 'cylinder'
// (rotate about its local Z axis), 'hammer' (pivot at the hammer pin), 'muzzle'. No 'ejector'.
// ---------------------------------------------------------------------------------------------
function buildRevolver() {
  const ox = 37, oy = 52;
  const root = new THREE.Group();
  const F = new Parts(), C = new Parts(), H = new Parts();
  const bore = 115, cylY = 102, cylR = 19.5, cx0 = 60, cx1 = 101;
  F.add('gunBlued', SE([[113, 84], [113, 128, 2], [50, 128, 2], [45, 125, 2], [42, 117], [38, 104, 4], [33, 92], [62, 79], [66, 74, 2], [67, 64, 6], [74, 56.5, 8], [88, 56.5, 8], [95, 64, 5], [97, 79, 3]], 24, {
    bevel: 1.6,
    holes: [rrect(80.5, 102, 44, 41, 2).map((p) => [p[0], p[1]]), [[70, 76], [70.5, 66, 5], [76, 60.5, 6], [86.5, 60.5, 6], [91.5, 66, 4], [92.5, 76]]],
  }));
  // barrel, underlug, vent rib, sights
  F.add('gunBlued', AL([[9, 101.6], [9, 213], [8.3, 214], [5.4, 214], [4.6, 213.4]], { cy: bore, segs: 28 }));
  F.add('gunBore', AL([[4.6, 213.4], [4.6, 196], [0, 196]], { cy: bore, segs: 16 }));
  F.add('gunBlued', SE([[113, 93], [207, 93, 6], [214, 99, 3], [214, 112], [113, 112]], 13, { bevel: 1.5 }));
  const vents = [];
  for (let i = 0; i < 6; i++) vents.push(rrect(124 + i * 15, 124.4, 10, 4.4, 1).map((p) => [p[0], p[1]]));
  F.add('gunBlued', SE([[106, 121], [214, 121], [214, 127.5, 0.8], [106, 127.5]], 7.5, { bevel: 0.6, holes: vents }));
  F.add('gunBlued', SE([[197, 127.3], [213, 127.3], [213, 135.4, 0.8], [210.5, 136.2], [197, 127.6]], 3.2, { bevel: 0.4 }));
  F.add('gunBlued', AE([[-5.5, 127.5], [5.5, 127.5], [5.5, 132.5, 0.6], [1.3, 132.5], [1.3, 130], [-1.3, 130], [-1.3, 132.5], [-5.5, 132.5, 0.6]], 57, 70, { bevel: 0.4 }));
  F.add('gunSightWhite', AE([[-1.35, 130], [1.35, 130], [1.35, 130.4], [-1.35, 130.4]], 56.9, 57.1));
  // grip (checkered walnut) + medallions, trigger, latch, screws
  F.add('gunWalnutCheck', rotUV(SE([[33, 93, 3], [63, 80, 3], [65, 70], [62.5, 55], [59, 35, 6], [55, 14, 6], [50, 4, 6], [26, 0.5, 8], [14, 3, 8], [9.5, 20], [13, 48], [20, 70], [28, 85]], 36, { bevel: 7, bevelSegs: 3, crease: 45 }), 72));
  F.add('gunBrass', XC(-18.3, 18.3, 75, 39, 3.6, 20));
  F.add('gunBlued', SE([[80.2, 77.5], [81.6, 71], [79.6, 64.5], [75.4, 61.4, 1.2], [74.4, 63.4], [77.4, 70], [77, 77.5]], 7, { bevel: 0.8 }));
  F.add('gunBlued', SE([[49, 111, 1.5], [58, 111, 1.5], [58, 117.5, 1.5], [49, 117.5, 1.5]], 2.2, { cx: -12.6, bevel: 0.6 }));
  for (const [x, y] of [[52, 90], [86, 84.5], [104, 90]]) F.add('gunBlued', XC(11.8, 12.3, y, x, 1.8, 12));
  // cylinder: fluted section between plain ends, chambers bored through, loaded with JHPs
  const chamberR = 4.8, bolt = 12.9;
  const holes = [circlePts(0, 0, 3.0, 8)];
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 + (k * TAU) / 6;
    holes.push(circlePts(Math.cos(a) * bolt, Math.sin(a) * bolt, chamberR, 12));
  }
  const fluted = [];
  for (let i = 0; i < 120; i++) {
    const th = (i / 120) * TAU;
    let fl = 0;
    for (let k = 0; k < 6; k++) {
      let d = th - (Math.PI / 2 + Math.PI / 6 + (k * TAU) / 6);
      d = Math.atan2(Math.sin(d), Math.cos(d));
      fl = Math.max(fl, 2.7 * Math.sqrt(Math.max(0, 1 - (d / 0.2) ** 2)));
    }
    fluted.push([Math.cos(th) * (cylR - fl), Math.sin(th) * (cylR - fl)]);
  }
  const plain = circlePts(0, 0, cylR, 48);
  const cylSec = (sec, a, b, bevel) =>
    flattenCaps(creased(axialExtrude(sec, a, b, { bevel, holes, bevelSegs: 1 }).translate(0, cylY, 0), 50), 2);
  C.add('gunBlued', cylSec(plain, cx0, cx0 + 5, 0.8));
  C.add('gunBlued', cylSec(fluted, cx0 + 5, cx1 - 7, 0));
  C.add('gunBlued', cylSec(plain, cx1 - 7, cx1, 1.2));
  C.add('gunSteelBright', ZC(0, cylY, cx0, cx1 + 0.4, 2.6, 12));
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 + (k * TAU) / 6, X = Math.cos(a) * bolt, Y = cylY + Math.sin(a) * bolt;
    C.add('gunCopper', axisLathe([[0, cx1 - 2.4], [2.2, cx1 - 2.4], [3.3, cx1 - 3.4], [4.35, cx1 - 5.4], [4.55, cx1 - 8], [4.55, cx1 - 16]], { segs: 10, crease: 50, cx: X, cy: Y }));
    C.add('gunBore', axisLathe([[1.6, cx1 - 2.35], [0, cx1 - 2.35]], { segs: 10, cx: X, cy: Y }));
  }
  // hammer
  H.add('gunBlued', SE([[44, 106], [46, 118], [44, 126, 2], [38, 132, 3], [27, 135.5, 2], [25, 132.5, 1.5], [33, 128], [37, 120], [37, 108, 3]], 6.5, { bevel: 0.8 }));
  addParts(root, F, ox, oy);
  addParts(root, C, ox, oy, 'cylinder', [0, cylY, (cx0 + cx1) / 2]);
  addParts(root, H, ox, oy, 'hammer', [0, 108, 41]);
  marker(root, 'muzzle', 0, bore, 214.3, ox, oy);
  return root;
}

/** Swap the u/v channels (to run wood grain along a lathe's length). */
function swapUV(g) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    uv.setXY(i, uv.getY(i), u);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Pump shotgun: 12 ga, 18.5" barrel, walnut stock and ribbed pump forend (870 proportions).
// Design: x from the butt, y = 0 on the bore axis. Children: 'pump' (slides +Z), 'muzzle', 'ejector'.
// ---------------------------------------------------------------------------------------------
function buildShotgun() {
  const ox = 285, oy = -30;
  const root = new THREE.Group();
  const F = new Parts(), PU = new Parts();
  const recv = [[300, 8], [306, 15, 4], [503, 15, 2], [507, 11, 2], [507, -31, 3], [500, -35, 3], [310, -35], [300, -26]];
  F.add('gunPark', SE(recv, 19, { cx: -5.5, bevel: 1.5 }));
  F.add('gunPark', SE(recv, 13, { cx: 8.5, bevel: 1.5, holes: [rrect(432, -1, 62, 21, 3)] }));
  F.add('gunBarrel', BX(406, 459, -8, 7, 3.5, 11));
  F.add('gunBore', BX(420, 495, -35.4, -34.8, -10, 10));
  // trigger plate, guard, trigger, cross-bolt safety
  F.add('gunPolymer', SE([[305, -34], [400, -34], [400, -42, 1], [305, -44, 1]], 24, { bevel: 1.5 }));
  F.add('gunPolymer', SE([[396, -41], [390, -53], [383, -61, 6], [342, -61, 6], [334, -52], [328, -42]], 14, {
    bevel: 1.5,
    holes: [[[344, -44.5], [383, -44.5], [380.5, -56, 4], [346.5, -56.5, 4]]],
  }));
  F.add('gunBlued', SE([[360, -44], [364.5, -44], [365.6, -50], [362.2, -57.6, 1], [360.4, -57], [362.2, -50]], 6, { bevel: 0.6 }));
  F.add('gunBlued', XC(-12.6, 12.6, -38.5, 352, 2.6, 14));
  // walnut stock + rubber recoil pad
  F.add('gunWalnut', SE([[18, -42, 3], [18, -172, 4], [120, -118], [200, -82], [245, -66, 25], [275, -56, 12], [302, -42], [302, -26], [300, 8], [290, -6, 10], [250, -18], [200, -24], [100, -32]], 38, { bevel: 8, bevelSegs: 3, crease: 45 }));
  F.add('gunRubber', SE([[0, -40.5, 4], [18.5, -40.5], [18.5, -173.5], [0, -173.5, 5]], 40, { bevel: 4, bevelSegs: 2, crease: 45 }));
  // barrel + bead, magazine tube + cap, barrel ring
  F.add('gunBlued', AL([[10.8, 506], [10.8, 978], [10.3, 980.5], [9.6, 980.5]], { segs: 28 }));
  F.add('gunBore', AL([[9.6, 980.45], [9.25, 979.8], [9.25, 940], [0, 940]], { segs: 20 }));
  F.add('gunBrass', new THREE.SphereGeometry(1.9, 10, 8).translate(0, 11.9, -973));
  const magY = -25.5;
  F.add('gunBlued', AL([[11.2, 505], [11.2, 899]], { cy: magY, segs: 24 }));
  F.add('gunBlued', AL([[11.5, 898], [12.6, 900], [12.6, 903], [12.0, 904], [12.6, 905], [12.6, 908], [12.0, 909], [12.6, 910], [12.6, 916], [11.5, 920], [8, 922], [0, 922.5]], { cy: magY, segs: 24, crease: 30 }));
  F.add('gunBlued', SE([[880, -6], [898, -6], [898, -33], [880, -33]], 15, { bevel: 2 }));
  // pump: ribbed walnut forend around the magazine tube + action bars
  const fe = [[11.6, 560], [17, 560.5], [21, 566], [22.4, 575]];
  for (let i = 0; i < 10; i++) {
    const x0 = 584 + i * 16.5;
    fe.push([22.4, x0], [20.4, x0 + 1.3], [20.4, x0 + 3.9], [22.4, x0 + 5.2]);
  }
  fe.push([22.4, 748], [21, 755], [17, 759.5], [11.6, 760]);
  PU.add('gunWalnut', swapUV(AL(fe, { cy: magY, segs: 32, crease: 30, uScale: TAU * 22, vScale: 1 })));
  for (const s of [-1, 1]) PU.add('gunBlued', BX(498, 566, -19.5, -15.5, s * 9, s * 10.6));
  addParts(root, F, ox, oy);
  addParts(root, PU, ox, oy, 'pump');
  marker(root, 'muzzle', 0, 0, 981.5, ox, oy);
  marker(root, 'ejector', 12, -1, 432, ox, oy);
  return root;
}

// ---------------------------------------------------------------------------------------------
// SMG: compact 9 mm roller-delayed SMG (MP5A3 proportions, stock collapsed), curved magazine.
// Design: x from the receiver rear, y = 0 on the bore axis. Children: 'muzzle', 'ejector'.
// ---------------------------------------------------------------------------------------------
function buildSMG() {
  const ox = 58, oy = -88;
  const root = new THREE.Group();
  const F = new Parts();
  const arc = (a0, a1, n, r = 14, cy = 24) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push([Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return out;
  };
  const fullSec = [...arc(0, Math.PI, 20), [-14, -20, 3], [14, -20, 3]];
  const a30 = Math.asin(6 / 14);
  const portSec = [[14, 10], [8, 10], [8, 30], ...arc(a30, Math.PI, 18), [-14, -20, 3], [14, -20, 3]];
  F.add('gunPark', AE(fullSec, 0, 150));
  F.add('gunPark', AE(portSec, 150, 205));
  F.add('gunPark', AE(fullSec, 205, 232));
  F.add('gunBarrel', BX(151, 204, 11, 29, 5.5, 8.6));
  F.add('gunPolymer', AE([...arc(0, Math.PI, 20, 14.4), [-14.4, -20.4, 3], [14.4, -20.4, 3]], -7, 0.5, { bevel: 1.5 }));
  // stamped reinforcement ribs along the receiver sides
  for (const s of [-1, 1]) F.add('gunPark', BX(20, 200, 3, 6.5, s * 13.6, s * 14.6));
  // cocking tube, front sight hood & post, cocking handle
  F.add('gunPark', AL([[10, 228], [10, 330], [9.4, 331.5], [6, 332], [0, 332]], { cy: 24, segs: 24 }));
  F.add('gunPark', AL([[8.6, 317], [10.8, 317], [10.8, 326], [8.6, 326], [8.6, 317]], { cy: 45, segs: 24, crease: 30 }));
  F.add('gunPark', SE([[315.5, 32], [327.5, 32], [327.5, 36.5], [315.5, 36.5]], 8, { bevel: 0.8 }));
  F.add('gunPark', YC(0, 321.5, 33, 45.5, 1.0, 10));
  F.add('gunPark', BX(296, 308, 18, 30, -10.5, -7));
  F.add('gunPark', cylBetween([-9, 25, -302], [-24, 31, -311], 3.0, 2.6, 10));
  F.add('gunPolymer', new THREE.SphereGeometry(5.2, 12, 8).scale(1.25, 1, 1).translate(-26, 32, -312.5));
  // handguard, barrel with 3-lug ring, muzzle
  F.add('gunPolymer', AE(rrect(0, -4.5, 44, 35, 10, 4), 212, 318, { bevel: 2.2, bevelSegs: 2 }));
  for (let i = 0; i < 4; i++) F.add('gunPolymer', AE(rrect(0, -22, 30, 2.4, 1, 2), 232 + i * 21, 244 + i * 21, { bevel: 0.6 }));
  F.add('gunPark', AL([[8.5, 316], [8.5, 368], [7.8, 369], [4.8, 369], [4.5, 368.5]], { segs: 24 }));
  F.add('gunPark', AL([[9.4, 340], [10.6, 341], [10.6, 352], [9.4, 353]], { segs: 24, crease: 30 }));
  for (let k = 0; k < 3; k++) {
    const g = BX(341, 352, 9.8, 12.6, -2, 2);
    g.rotateZ(Math.PI / 2 + (k * TAU) / 3 - Math.PI / 2);
    F.add('gunPark', g);
  }
  F.add('gunBore', AL([[4.5, 368.45], [4.5, 355], [0, 355]], { segs: 16 }));
  // rear drum sight
  F.add('gunPark', BX(8, 38, 37, 44, -10, 10));
  F.add('gunPark', XC(-9, 9, 50, 22, 8.5, 20));
  for (const s of [-1, 1]) F.add('gunPark', SE([[10, 37], [36, 37], [32, 57, 3], [14, 57, 3]], 2.2, { cx: s * 11.6, bevel: 0.5 }));
  // magazine well + curved 30-round magazine
  F.add('gunPark', SE([[133, -15], [176, -15], [176, -42, 2], [133, -42, 2]], 27, { bevel: 1.5 }));
  const Rc = 330, mag = [], back = [];
  for (let i = 0; i <= 16; i++) {
    const s = -25 + (i / 16) * 200, a = s / Rc;
    const cxm = 155 + Rc * (1 - Math.cos(a)), cym = -40 - Rc * Math.sin(a);
    const nx = Math.cos(a), ny = Math.sin(a);
    mag.push([cxm + nx * 18, cym + ny * 18]);
    back.push([cxm - nx * 18, cym - ny * 18]);
  }
  F.add('gunPark', SE([...mag, ...back.reverse()], 22, { bevel: 1.6 }));
  {
    const a = 175 / Rc, cxm = 155 + Rc * (1 - Math.cos(a)), cym = -40 - Rc * Math.sin(a);
    const plate = SE([[-21, -3, 1.5], [21, -3, 1.5], [21, 4], [-21, 4]], 25, { bevel: 1.5 });
    plate.rotateX(a); // tilt in the (x2, y) plane so the plate is square to the curved magazine
    plate.translate(0, cym, -cxm);
    F.add('gunPolymer', plate);
  }
  // lower: trigger housing + pistol grip + guard, trigger, selector
  F.add('gunPolymer', SE([[20, -19], [20, -30], [36, -38, 6], [34, -70], [30, -110], [31, -140, 8], [38, -148, 5], [72, -148, 5], [76, -140], [78, -115], [82, -95], [80, -82], [86, -70, 4], [122, -68, 8], [129, -55, 6], [132, -38], [138, -30], [138, -19]], 28, {
    bevel: 2.5,
    bevelSegs: 2,
    holes: [[[92, -40], [126, -40], [124, -56, 5], [117, -63, 5], [92, -63, 4], [89, -52]]],
  }));
  F.add('gunBlued', SE([[100, -40], [104, -40], [105, -48], [101.6, -56, 1], [99.6, -55], [101.5, -48]], 6, { bevel: 0.6 }));
  F.add('gunPark', SE([[28, -27, 1], [44, -23.5, 1], [44, -20.5, 1], [28, -22.5, 1]], 2, { cx: -14.8, bevel: 0.4 }));
  // collapsed A3 stock: rods, yoke, rubber butt pad
  for (const s of [-1, 1]) F.add('gunSteelBright', ZC(s * 18.6, -3, -58, 205, 4.2, 14));
  F.add('gunPark', XC(-18.6, 18.6, -3, -56, 4.6, 14));
  F.add('gunRubber', SE([[-68, 30, 6], [-52, 30, 4], [-52, -97, 4], [-68, -97, 8]], 50, { bevel: 5, crease: 45 }));
  addParts(root, F, ox, oy);
  marker(root, 'muzzle', 0, 0, 370, ox, oy);
  marker(root, 'ejector', 12, 20, 178, ox, oy);
  return root;
}

// ---------------------------------------------------------------------------------------------
// AR-style carbine: flat-top upper with rail, M-LOK free-float handguard (real slots), A2 flash
// hider, polymer 30-round magazine, collapsible stock, red-dot optic, folded BUIS.
// Design: x from the butt, y = 0 on the bore axis. Children: 'muzzle', 'ejector'.
// ---------------------------------------------------------------------------------------------
function buildRifle() {
  const ox = 276, oy = -85;
  const root = new THREE.Group();
  const F = new Parts();
  const railTop = 28;
  // buffer tube, castle nut, stock, butt pad
  F.add('gunAnod', AL([[0, 60], [12.5, 60], [14.5, 62], [14.5, 252]], { segs: 24 }));
  F.add('gunAnod', AL([[14.5, 245], [17, 246], [17, 254], [14.5, 255]], { segs: 10, crease: 30 }));
  F.add('gunPolymer', SE([[0, 24, 2], [130, 24, 3], [168, 18, 4], [172, 10], [172, -16, 4], [160, -22], [110, -26], [50, -60], [12, -100, 6], [0, -104, 4]], 42, { bevel: 3, crease: 40 }));
  F.add('gunRubber', SE([[-5, 25, 3], [0.5, 25], [0.5, -106], [-5, -106, 4]], 44, { bevel: 2.2 }));
  // lower receiver with integral guard, controls
  F.add('gunAnod', SE([[250, -12], [430, -12], [436, -18, 3], [436, -30], [428, -38], [426, -66], [427, -70, 1.5], [358, -70, 1.5], [356, -62], [352, -50], [350, -58, 4], [296, -58, 6], [290, -48], [282, -36], [262, -26], [250, -22]], 22, {
    bevel: 1.2,
    holes: [[[300, -41], [344, -41], [344, -53, 3], [300, -53, 4]]],
  }));
  F.add('gunBlued', SE([[316, -41], [320, -41], [321, -47], [318.2, -53.5, 1], [316.6, -53], [318.2, -47]], 6, { bevel: 0.5 }));
  F.add('gunAnod', XC(10.8, 12.8, -30, 344, 3.2, 12));
  F.add('gunAnod', SE([[330, -24, 1], [342, -22, 1], [342, -17, 1], [330, -19, 1]], 2, { cx: -11.8, bevel: 0.4 }));
  F.add('gunAnod', SE([[278, -26, 1], [291, -23.5, 1], [291, -20.5, 1], [278, -22, 1]], 2.2, { cx: -12.3, bevel: 0.4 }));
  F.add('gunAnod', XC(-12.6, -11, -22, 282, 4, 14));
  for (const x of [264, 428]) F.add('gunAnod', XC(-11.6, 11.6, -16, x, 2.6, 10));
  // pistol grip
  F.add('gunPolymer', SE([[300, -40], [292, -60], [290, -75], [292.5, -82, 2], [286.5, -90], [276, -125, 6], [274, -131, 3], [248, -128, 5], [248, -122], [258, -90], [266, -62], [274, -42], [280, -36]], 28, { bevel: 4, bevelSegs: 3, crease: 45 }));
  // upper receiver (port opening in the right half), bolt carrier, dust cover, FA, deflector
  const upper = [[250, -12], [440, -12], [440, 18.6], [256, 18.6], [250, 12]];
  F.add('gunAnod', SE(upper, 15, { cx: -4, bevel: 1 }));
  F.add('gunAnod', SE(upper, 11, { cx: 6, bevel: 1, holes: [rrect(362, 3.5, 62, 15, 2)] }));
  F.add('gunBarrel', BX(332, 392, -3, 10, 1, 6.5));
  F.add('gunAnod', BX(331, 393, -22, -11.5, 11.4, 12.4));
  F.add('gunAnod', cylBetween([10.5, 6, -300], [16, 5, -276], 6.2, 6.2, 14));
  F.add('gunBlued', cylBetween([16, 5, -276], [17.6, 4.8, -270], 5, 5, 14));
  F.add('gunAnod', SE([[316, 2], [330, 0], [330, 16], [322, 16]], 5, { cx: 13, bevel: 1 }));
  F.add('gunAnod', BX(238, 252, 12, 18, -9, 9));
  for (const s of [-1, 1]) F.add('gunAnod', BX(238, 247, 12, 17, s * 9, s * 16));
  picatinny(F, 'gunAnod', 252, 438, railTop);
  // free-float octagonal M-LOK handguard (8 panels, slots on the sides/bottom)
  const apo = 20.5, pt = 2.2, pw = 2 * (apo + pt / 2) * Math.tan(Math.PI / 8) + 0.4;
  for (let k = 0; k < 8; k++) {
    const ang = (k * TAU) / 8; // 0 = right side, PI/2 = top
    const slotted = k === 0 || k === 4 || k === 5 || k === 6 || k === 7;
    const holes = [];
    if (slotted) for (let j = 0; j < 5; j++) holes.push(rrect(470 + j * 46, 0, 32, 7, 3.4, 2));
    const panel = SE([[440, -pw / 2], [700, -pw / 2], [700, pw / 2], [440, pw / 2]], pt, { cx: apo + pt / 2, bevel: 0, holes });
    panel.rotateZ(ang);
    F.add('gunAnod', panel);
  }
  picatinny(F, 'gunAnod', 442, 698, railTop);
  // barrel, gas block, A2 flash hider, folded sights
  F.add('gunBlued', AL([[9.5, 440], [9.5, 788]], { segs: 20 }));
  F.add('gunPark', BX(598, 620, -2, 16, -9, 9));
  F.add('gunBlued', AL([[9.5, 787], [11, 790], [11, 838], [10.4, 841], [8.0, 842], [7.0, 841.5]], { segs: 24, crease: 30 }));
  F.add('gunBore', AL([[7, 841.45], [7, 820], [0, 820]], { segs: 16 }));
  for (const a of [30, 90, 150, 210, 330]) {
    const g = BX(813, 836, 10.6, 11.25, -1.3, 1.3);
    g.rotateZ(((a - 90) * Math.PI) / 180);
    F.add('gunBore', g);
  }
  F.add('gunAnod', BX(684, 698, railTop, railTop + 5.5, -5, 5));
  F.add('gunAnod', BX(256, 276, railTop, railTop + 6.5, -9, 9));
  // polymer magazine
  F.add('gunPolymerMag', SE([[424, -62], [426, -110], [432, -150], [444, -190], [452, -214], [453, -221, 3], [389, -219, 3], [388, -212], [381, -190], [370, -150], [365, -110], [363, -62]], 23, { bevel: 1.6 }));
  F.add('gunPolymerMag', SE([[385, -217], [456, -219], [457, -227, 3], [384, -225, 3]], 25.5, { bevel: 1.5 }));
  // red-dot optic on a riser mount
  const oc = 58;
  F.add('gunAnod', SE([[330, railTop], [372, railTop], [370, 42, 3], [334, 42, 3]], 20, { bevel: 1.5 }));
  F.add('gunAnod', XC(10, 17, 33, 351, 6, 16));
  F.add('gunAnod', AL([[12.6, 328.5], [16.2, 328.5], [16.8, 331], [16.8, 393], [16.2, 395.5], [12.6, 395.5], [12.4, 393], [12.4, 331], [12.6, 328.5]], { cy: oc, segs: 32, crease: 30 }));
  F.add('gunAnod', YC(0, 362, oc + 15, oc + 22, 6.2, 16));
  F.add('gunAnod', XC(15, 22.5, oc, 362, 6.2, 16));
  F.add('gunLens', AL([[0, 332], [12.45, 332]], { cy: oc, segs: 24 }));
  F.add('gunLens', AL([[12.45, 392], [0, 392]], { cy: oc, segs: 24 }));
  F.add('gunRedDot', AL([[0, 390.5], [0.7, 390.5]], { cy: oc, segs: 10 }));
  addParts(root, F, ox, oy);
  marker(root, 'muzzle', 0, 0, 842.6, ox, oy);
  marker(root, 'ejector', 11.5, 3.5, 362, ox, oy);
  return root;
}

// ---------------------------------------------------------------------------------------------
// Bolt-action sniper rifle: OD synthetic stock, 26" heavy barrel + brake, 30 mm scope in rings,
// folded bipod, detachable box magazine. Children: 'bolt' (pivot on the bore axis), 'muzzle',
// 'ejector'. Design: x from the butt, y = 0 on the bore axis.
// ---------------------------------------------------------------------------------------------
function buildSniper() {
  const ox = 341, oy = -76;
  const root = new THREE.Group();
  const F = new Parts(), B = new Parts();
  F.add('gunPolymerOD', SE([
    [12, -10, 4], [12, -152, 5], [110, -102], [200, -74], [300, -52, 15], [318, -62], [322, -98, 6], [330, -110, 6], [356, -104, 8],
    [366, -60, 10], [380, -50], [560, -52], [900, -44, 4], [912, -30, 6], [904, -12, 6], [640, -13], [360, -13], [352, -10, 4],
    [325, -18, 10], [285, -27, 12], [250, -8, 8], [60, -6],
  ], 44, { bevel: 7, bevelSegs: 3, crease: 45 }));
  F.add('gunRubber', SE([[0, -9, 4], [12.5, -9], [12.5, -153], [0, -153, 5]], 46, { bevel: 4, crease: 45 }));
  // receiver, rail, rings
  F.add('gunBlued', AL([[9.5, 352], [13, 352], [16.2, 355], [17.2, 360], [17.2, 586], [16, 589], [14.5, 589]], { segs: 32, crease: 30 }));
  picatinny(F, 'gunAnod', 362, 584, 26.5);
  const sc = 55;
  for (const x of [425, 535]) {
    F.add('gunAnod', AL([[15.2, x - 7], [19.5, x - 7], [20.5, x - 6], [20.5, x + 6], [19.5, x + 7], [15.2, x + 7]], { cy: sc, segs: 28, crease: 30 }));
    F.add('gunAnod', SE([[x - 9, 26.5], [x + 9, 26.5], [x + 7, 40, 2], [x - 7, 40, 2]], 22, { bevel: 1 }));
    F.add('gunAnod', XC(11, 14, 31, x, 4.2, 6));
  }
  // scope
  const sp = [[13.5, 326], [19.5, 326], [21, 328], [21, 341]];
  for (let i = 0; i < 4; i++) sp.push([20.2, 342 + i * 2.5], [21, 343.2 + i * 2.5]);
  sp.push([20.5, 352], [18.5, 362], [17, 370], [17.6, 372]);
  for (let i = 0; i < 6; i++) sp.push([17.6, 373 + i * 2.6], [17.0, 374.2 + i * 2.6], [17.6, 375.4 + i * 2.6]);
  sp.push([17.6, 389], [15, 392], [15, 590], [27, 625], [28, 628], [28, 682], [27.4, 684], [25, 684], [24.5, 683]);
  F.add('gunAnod', AL(sp, { cy: sc, segs: 28, crease: 30 }));
  F.add('gunAnod', AL([[15, 470], [18.5, 476], [18.5, 514], [15, 520]], { cy: sc, segs: 28, crease: 30 }));
  F.add('gunLens', AL([[0, 327.5], [13.6, 327.5]], { cy: sc, segs: 24 }));
  F.add('gunLens', AL([[24.6, 682.5], [0, 682.5]], { cy: sc, segs: 28 }));
  F.add('gunAnod', YC(0, 495, sc + 14, sc + 19, 9.5, 20));
  F.add('gunAnod', YC(0, 495, sc + 19, sc + 33, 12.5, 24));
  F.add('gunAnod', YC(0, 495, sc + 33, sc + 34.5, 11.2, 24));
  F.add('gunAnod', XC(14, 21, sc, 495, 9.5, 20));
  F.add('gunAnod', XC(21, 33, sc, 495, 12.5, 24));
  F.add('gunAnod', XC(33, 34.3, sc, 495, 11.2, 24));
  F.add('gunAnod', XC(-21, -14, sc, 495, 9.5, 20));
  F.add('gunAnod', XC(-31, -21, sc, 495, 15, 24));
  for (let i = 0; i < 5; i++) {
    F.add('gunAnod', YC(0, 495, sc + 21 + i * 2.4, sc + 22 + i * 2.4, 12.9, 18));
    F.add('gunAnod', XC(23 + i * 2.1, 24 + i * 2.1, sc, 495, 12.9, 18));
  }
  // barrel + brake
  F.add('gunBlued', AL([[15, 588], [15, 630], [11.2, 1105], [11.2, 1110]], { segs: 28, crease: 20 }));
  F.add('gunBlued', AL([[13, 1108], [13.5, 1110], [13.5, 1168], [12.5, 1170], [6, 1170], [5.5, 1169.5]], { segs: 28, crease: 30 }));
  F.add('gunBore', AL([[5.5, 1169.45], [5.5, 1150], [0, 1150]], { segs: 16 }));
  for (let j = 0; j < 3; j++) for (const s of [-1, 1]) F.add('gunBore', BX(1118 + j * 16, 1128 + j * 16, -6, 6, s * 13.2, s * 13.75));
  // bipod (Harris-style, legs folded forward)
  F.add('gunBlued', BX(845, 875, -56, -44, -16, 16));
  F.add('gunBlued', XC(-18, 18, -50, 868, 5, 14));
  for (const s of [-1, 1]) {
    F.add('gunBlued', ZC(s * 12, -50, 868, 1040, 5.2, 14));
    F.add('gunSteelBright', ZC(s * 12, -50, 1040, 1088, 3.9, 12));
    F.add('gunRubber', ZC(s * 12, -50, 1088, 1101, 6, 14));
  }
  // magazine, release, trigger guard, trigger
  F.add('gunPolymer', SE([[440, -40], [512, -40], [510, -82, 3], [442, -82, 3]], 26, { bevel: 2 }));
  F.add('gunAnod', BX(424, 432, -62, -52, -4, 4));
  F.add('gunAnod', SE([[370, -46], [452, -46], [446, -56], [434, -75, 6], [385, -75, 6], [375, -60]], 14, { bevel: 1.5, holes: [[[387, -52], [432, -52], [428, -70, 4], [390, -70, 4]]] }));
  F.add('gunBlued', SE([[402, -52], [406, -52], [407, -58], [404, -67, 1], [402.4, -66.5], [403.8, -58]], 6, { bevel: 0.5 }));
  // bolt: shroud, cocking piece, bent handle with tactical knob
  B.add('gunBlued', AL([[0, 322], [6, 322], [9, 324], [10.5, 330], [11, 352.5]], { segs: 24, crease: 30 }));
  B.add('gunBlued', BX(316, 323, -5, 4, -3.5, 3.5));
  B.add('gunSteelBright', BX(360, 372, -4, 6, 9, 18));
  B.add('gunBlued', cylBetween([14, 2, -366], [46, -20, -363], 4.2, 3.8, 12));
  B.add('gunPolymer', new THREE.SphereGeometry(9, 18, 12).scale(1, 1.15, 1).translate(50, -24, -362.5));
  addParts(root, F, ox, oy);
  addParts(root, B, ox, oy, 'bolt', [0, 0, 380]);
  marker(root, 'muzzle', 0, 0, 1170.6, ox, oy);
  marker(root, 'ejector', 17.5, 6, 500, ox, oy);
  return root;
}

// ---------------------------------------------------------------------------------------------
// Weapon factory
// ---------------------------------------------------------------------------------------------
const WEAPON_BUILDERS = {
  pistol: buildPistol,
  revolver: buildRevolver,
  shotgun: buildShotgun,
  smg: buildSMG,
  rifle: buildRifle,
  sniper: buildSniper,
};
export const WEAPON_TYPES = Object.keys(WEAPON_BUILDERS);
const WEAPON_CALIBER = { pistol: '9mm', revolver: '357', shotgun: '12ga', smg: '9mm', rifle: '556', sniper: '308' };

/**
 * First-person weapon model in metres: barrel along local -Z, grip down (-Y), origin at the
 * centre of the firing-hand grip. Named children: 'muzzle' (barrel tip, local -Z = shot
 * direction) and 'ejector' (ejection port; absent on the revolver). Moving parts are separate
 * groups: pistol 'slide', revolver 'cylinder' + 'hammer', shotgun 'pump', sniper 'bolt'.
 */
export function createWeaponModel(type) {
  const build = WEAPON_BUILDERS[type];
  if (!build) throw new Error(`createWeaponModel: unknown type '${type}'`);
  return fromTemplate('weapon:' + type, () => {
    const g = build();
    g.name = type;
    g.updateMatrixWorld(true);
    const pos = (n) => {
      const o = g.getObjectByName(n);
      return o ? o.position.toArray().map((v) => +v.toFixed(4)) : null;
    };
    g.userData = { weapon: type, caliber: WEAPON_CALIBER[type], muzzle: pos('muzzle'), ejector: pos('ejector') };
    return g;
  });
}

// ---------------------------------------------------------------------------------------------
// Muzzle flash: two crossed flame planes along -Z + a camera-facing star, additive & unlit.
// ---------------------------------------------------------------------------------------------
function flashTextures() {
  return cached('tex:flash', () => {
    const R = rng(99);
    // star (front view)
    const S = 128, cs = makeCanvas(S, S), g = cs.getContext('2d');
    g.globalCompositeOperation = 'lighter';
    const c = S / 2;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + R() * 0.4, len = 40 + R() * 22, w = 0.16 + R() * 0.1;
      const grd = g.createLinearGradient(c, c, c + Math.cos(a) * len, c + Math.sin(a) * len);
      grd.addColorStop(0, 'rgba(255,226,150,1)');
      grd.addColorStop(0.5, 'rgba(255,140,40,0.6)');
      grd.addColorStop(1, 'rgba(255,90,20,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(c + Math.cos(a - w) * 7, c + Math.sin(a - w) * 7);
      g.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len);
      g.lineTo(c + Math.cos(a + w) * 7, c + Math.sin(a + w) * 7);
      g.closePath();
      g.fill();
    }
    const rg = g.createRadialGradient(c, c, 0, c, c, c * 0.62);
    rg.addColorStop(0, 'rgba(255,252,230,1)');
    rg.addColorStop(0.2, 'rgba(255,214,120,0.95)');
    rg.addColorStop(0.5, 'rgba(255,130,35,0.5)');
    rg.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, S, S);
    const star = canvasTexture(cs, { srgb: true, wrap: false });
    // side flame (v = 0 at the muzzle, v = 1 at the tip)
    const [side] = genTextures(64, 128, [{ srgb: true, wrap: false }], (u, v, o) => {
      const across = Math.abs(u - 0.5) * 2;
      const width = 0.18 + 0.75 * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.15)), 0.8) * (1 - v * 0.55);
      const streak = 0.65 + 0.35 * pnoise2(u * 12, v * 3, 12, 3, 4) + 0.2 * pnoise2(u * 24, v * 6, 24, 6, 6);
      const body = smooth(width, width * 0.15, across) * Math.pow(1 - v, 1.35) * streak;
      const core = smooth(0.35, 0.0, across) * smooth(0.55, 0.0, v);
      const I = clamp(body * 1.15 + core * 0.9, 0, 1);
      o[0][0] = Math.pow(I, 0.6);
      o[0][1] = Math.pow(I, 1.25) * 0.86;
      o[0][2] = Math.pow(I, 2.6) * 0.62;
      o[0][3] = I;
    });
    return { star, side };
  });
}
function flashMaterial(map) {
  return new THREE.MeshBasicMaterial({
    map,
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
}
/**
 * Muzzle flash to attach to a weapon's 'muzzle' child: flames extend ~17 cm along local -Z.
 * Unlit additive planes (no shadows). Each call gets its own material instances, so you can
 * animate `opacity` per flash; randomise `rotation.z` and scale per shot for variety.
 */
export function createMuzzleFlashMesh() {
  const t = flashTextures();
  const geos = cached('geo:flash', () => {
    const L = 0.17, W = 0.1;
    const a = new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2).translate(0, 0, -L / 2 + 0.004);
    const b = a.clone().rotateZ(Math.PI / 2);
    const star = new THREE.PlaneGeometry(0.115, 0.115).translate(0, 0, -0.01);
    return { side: mergeList([a, b]), star };
  });
  const g = new THREE.Group();
  g.name = 'muzzleFlash';
  const side = new THREE.Mesh(geos.side, flashMaterial(t.side));
  const star = new THREE.Mesh(geos.star, flashMaterial(t.star));
  side.name = 'flashSide';
  star.name = 'flashStar';
  for (const m of [side, star]) {
    m.castShadow = false;
    m.receiveShadow = false;
    m.frustumCulled = false;
    m.renderOrder = 10;
    g.add(m);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Spent casings: brass (shotgun: red plastic hull on a brass head). Axis along local Z with the
// mouth toward -Z (same orientation as the weapon that ejects it), origin at the casing centre.
// ---------------------------------------------------------------------------------------------
const CASING_PROFILES = {
  '9mm': [[0, 0.3], [1.9, 0.3], [2.0, 0], [4.6, 0], [4.98, 0.4], [4.98, 1.25], [4.25, 1.55], [4.15, 2.0], [4.6, 2.6], [4.95, 3.0], [4.82, 19.15], [4.5, 19.15], [4.45, 18.5], [4.45, 6], [0, 5.5]],
  '357': [[0, 0.3], [1.9, 0.3], [2.0, 0], [5.3, 0], [5.6, 0.3], [5.6, 1.4], [4.85, 1.5], [4.8, 33], [4.5, 33], [4.45, 32.3], [4.45, 8], [0, 7.5]],
  '556': [[0, 0.3], [2.1, 0.3], [2.2, 0], [4.4, 0], [4.73, 0.4], [4.73, 1.1], [4.0, 1.4], [3.9, 2.0], [4.5, 2.6], [4.8, 3.0], [4.5, 36.5], [3.2, 39.5], [3.15, 44.7], [2.85, 44.7], [2.8, 44.0], [2.8, 38], [0, 37.5]],
  '308': [[0, 0.3], [2.5, 0.3], [2.6, 0], [5.6, 0], [6.0, 0.4], [6.0, 1.3], [5.2, 1.6], [5.1, 2.3], [5.7, 3.0], [5.97, 3.4], [5.75, 39.6], [4.4, 43.2], [4.35, 51.2], [4.0, 51.2], [3.95, 50.4], [3.95, 44], [0, 43.5]],
};
MATS.casingBrass = () => new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, metalness: 1, roughness: 0.3 });
MATS.hullRed = () => new THREE.MeshStandardMaterial({ color: 0xa3221d, metalness: 0, roughness: 0.5 });

function casingGeometry(cal) {
  return cached('geo:casing:' + cal, () => {
    const brass = new THREE.Color(0xcfa24e), primer = new THREE.Color(0xc4c2bc);
    const col = (n, primerSegs = 2) => Array.from({ length: n }, (_, i) => (i < primerSegs ? primer : brass).toArray());
    let g, len;
    if (cal === '12ga') {
      const head = [[0, 0.4], [2.6, 0.4], [2.7, 0], [10.9, 0], [11.2, 0.4], [11.2, 1.4], [10.4, 1.7], [10.35, 12], [10.1, 12.3]];
      const hull = [[10.12, 12.1], [10.15, 64], [10.6, 67], [10.9, 70], [10.3, 70.4], [9.6, 67.5], [9.35, 64], [9.35, 16], [0, 15.5]];
      const hg = lathe(head, { segs: 20, crease: 40, colors: col(head.length - 1) });
      const pg = lathe(hull, { segs: 20, crease: 40 });
      const list = [hg, pg].map((x) => {
        const y = x.toNonIndexed();
        if (!y.attributes.color) y.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(y.attributes.position.count * 3).fill(1), 3));
        return y;
      });
      g = mergeGeometries(list, true);
      len = 70.4;
    } else {
      const prof = CASING_PROFILES[cal];
      g = lathe(prof, { segs: 16, crease: 40, colors: col(prof.length - 1) });
      len = Math.max(...prof.map((p) => p[1]));
    }
    g.translate(0, -len / 2, 0);
    g.rotateX(-Math.PI / 2); // mouth -> -Z
    g.scale(MM, MM, MM);
    g.computeBoundingSphere();
    return g;
  });
}
/** Spent cartridge case for the given weapon type (or caliber '9mm' | '357' | '556' | '308' | '12ga'). */
export function createCasingMesh(type = 'pistol') {
  const cal = WEAPON_CALIBER[type] || type;
  if (!CASING_PROFILES[cal] && cal !== '12ga') throw new Error(`createCasingMesh: unknown type '${type}'`);
  const geo = casingGeometry(cal);
  const mat = cal === '12ga' ? [getMat('casingBrass'), getMat('hullRed')] : getMat('casingBrass');
  const m = new THREE.Mesh(geo, mat);
  m.name = 'casing_' + cal;
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.caliber = cal;
  return m;
}
