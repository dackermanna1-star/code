// Modelling kit: small, dependable helpers for building stylised food & props procedurally.
//
// Conventions (IMPORTANT for every model builder):
//  - Units are metres. Build food at real-world size; the game scales food up (FOOD_SCALE).
//  - A whole item rests on y = 0 and is centred on x = z = 0 (use `sitOnGround`).
//  - Use `foodMat()` for every food surface so cooking / bites work. Mark the outer skin meshes
//    with `skinMesh()` (or userData.part = 'skin') so generic peeling can swap them.
//  - Cache textures with a key (canvasTexture(..., { key })) - builders run many times.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export { foodMat } from '../render/foodMaterial';
export type { FoodMatParams } from '../render/foodMaterial';

// ---------------------------------------------------------------------------------------------
// Random

export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = (Math.floor(Math.abs(seed) * 9301 + 49297) % 233280) + 1;
  }
  /** 0..1 */
  next(): number {
    // mulberry32
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }
  /** Roughly normal, mean 0, sd 1. */
  gauss(): number {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 1.7;
  }
  /** Random point in unit disc. */
  disc(): [number, number] {
    const a = this.next() * Math.PI * 2;
    const r = Math.sqrt(this.next());
    return [Math.cos(a) * r, Math.sin(a) * r];
  }
}

export function rng(seed: number): Rng {
  return new Rng(seed);
}

// ---------------------------------------------------------------------------------------------
// Noise (value noise, deterministic). Returns roughly -1..1.

function hash3(x: number, y: number, z: number): number {
  let h = x * 374761393 + y * 668265263 + z * 1274126177;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 50000 - 1;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi);
  const c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1);
  const c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
  return l(l(l(c000, c100, xf), l(c010, c110, xf), yf), l(l(c001, c101, xf), l(c011, c111, xf), yf), zf);
}

export function fbm3(x: number, y: number, z: number, octaves = 3): number {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < octaves; i++) {
    s += noise3(x * f, y * f, z * f) * a;
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

// ---------------------------------------------------------------------------------------------
// Canvas textures

const texCache = new Map<string, THREE.Texture>();

export interface CanvasTexOpts {
  /** Cache key: identical keys return the same texture (strongly recommended). */
  key?: string;
  /** Colour texture (sRGB). Set false for bump / roughness data. Default true. */
  srgb?: boolean;
  repeat?: [number, number];
  wrap?: boolean;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

/** Draw into a canvas and wrap it as a texture. */
export function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  opts: CanvasTexOpts = {},
): THREE.Texture {
  if (opts.key) {
    const hit = texCache.get(opts.key);
    if (hit) return hit;
  }
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c as HTMLCanvasElement);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.wrap || opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  t.anisotropy = 4;
  t.needsUpdate = true;
  if (opts.key) texCache.set(opts.key, t);
  return t;
}

/** Mottle a canvas region with soft noise of a colour (subtle organic variation). */
export function mottle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  opts: { count?: number; size?: [number, number]; alpha?: [number, number]; seed?: number } = {},
) {
  const r = rng(opts.seed ?? 7);
  const count = opts.count ?? 160;
  const [s0, s1] = opts.size ?? [w * 0.02, w * 0.08];
  const [a0, a1] = opts.alpha ?? [0.04, 0.14];
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = r.next() * w, y = r.next() * h, s = r.range(s0, s1);
    const g = ctx.createRadialGradient(x, y, 0, x, y, s);
    ctx.globalAlpha = r.range(a0, a1);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - s, y - s, s * 2, s * 2);
  }
  ctx.restore();
}

/** Scatter little dots / seeds / specks. */
export function specks(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  opts: { count?: number; size?: [number, number]; alpha?: number; seed?: number; elongate?: number } = {},
) {
  const r = rng(opts.seed ?? 3);
  const [s0, s1] = opts.size ?? [1, 3];
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = opts.alpha ?? 1;
  for (let i = 0; i < (opts.count ?? 100); i++) {
    const x = r.next() * w, y = r.next() * h, s = r.range(s0, s1);
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * (opts.elongate ?? 1), r.next() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Radial gradient disc filling the canvas (useful for cross-sections). */
export function radialFill(ctx: CanvasRenderingContext2D, s: number, stops: [number, string][]) {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Simple cached solid-colour + noise texture (bumps for e.g. orange peel). */
export function noiseTexture(key: string, base: string, dark: string, light: string, size = 256, scale = 18): THREE.Texture {
  return canvasTexture(
    size,
    size,
    (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const cd = new THREE.Color(dark), cl = new THREE.Color(light), cb = new THREE.Color(base);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const n = fbm3((x / w) * scale, (y / h) * scale, 0.5, 3);
          const c = n < 0 ? cb.clone().lerp(cd, -n) : cb.clone().lerp(cl, n);
          const i = (y * w + x) * 4;
          img.data[i] = c.r * 255;
          img.data[i + 1] = c.g * 255;
          img.data[i + 2] = c.b * 255;
        }
      ctx.putImageData(img, 0, 0);
    },
    { key, wrap: true },
  );
}

/** Grey bump texture from noise (srgb false). Higher scale = finer bumps. */
export function bumpNoiseTexture(key: string, scale = 24, size = 256, sharp = false): THREE.Texture {
  return canvasTexture(
    size,
    size,
    (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          // tileable-ish by sampling on a torus
          const u = x / w, v = y / h;
          const a = u * Math.PI * 2, b = v * Math.PI * 2;
          let n = fbm3(Math.cos(a) * scale * 0.16, Math.sin(a) * scale * 0.16, Math.cos(b) * scale * 0.16 + Math.sin(b) * 3, 3);
          if (sharp) n = Math.abs(n) * 2 - 0.5;
          const g = Math.max(0, Math.min(255, 128 + n * 160));
          const i = (y * w + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
          img.data[i + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
    },
    { key, srgb: false, wrap: true },
  );
}

// ---------------------------------------------------------------------------------------------
// Geometry

/** [radius, y] pairs, bottom to top. Start and end with radius ~0 for a closed solid. */
export type Profile = [number, number][];

/** Smoothly resample a profile with a Catmull-Rom spline. */
export function smoothProfile(points: Profile, samples = 32): Profile {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([r, y]) => new THREE.Vector3(r, y, 0)),
    false,
    'centripetal',
  );
  const out: Profile = [];
  for (let i = 0; i <= samples; i++) {
    const p = curve.getPoint(i / samples);
    out.push([Math.max(0.0001, p.x), p.y]);
  }
  out[0][0] = Math.max(0.0001, points[0][0]);
  out[out.length - 1][0] = Math.max(0.0001, points[points.length - 1][0]);
  return out;
}

/** Radius of a profile at height y (linear interpolation). */
export function profileRadiusAt(profile: Profile, y: number): number {
  if (y <= profile[0][1]) return profile[0][0];
  for (let i = 1; i < profile.length; i++) {
    const [r1, y1] = profile[i];
    const [r0, y0] = profile[i - 1];
    if (y <= y1) {
      const t = (y - y0) / Math.max(1e-6, y1 - y0);
      return r0 + (r1 - r0) * t;
    }
  }
  return profile[profile.length - 1][0];
}

export function profileHeight(profile: Profile): number {
  return profile[profile.length - 1][1] - profile[0][1];
}

export function profileMaxRadius(profile: Profile): number {
  return Math.max(...profile.map((p) => p[0]));
}

/** Lathe around the Y axis. UV: u around, v up. */
export function latheGeometry(profile: Profile, segments = 32, phiStart = 0, phiLength = Math.PI * 2): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)),
    segments,
    phiStart,
    phiLength,
  );
  return g;
}

/**
 * Smooth normals by averaging face normals of all vertices sharing a position (welds UV seams
 * and poles without touching the index/UVs). Use for organic shapes; it removes hard edges.
 */
export function smoothNormals(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const idx = geom.index;
  const keyOf = (i: number) => `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`;
  const keys: string[] = new Array(pos.count);
  for (let i = 0; i < pos.count; i++) keys[i] = keyOf(i);
  const acc = new Map<string, THREE.Vector3>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    const fn = ab.cross(ac); // area-weighted
    for (const i of [i0, i1, i2]) {
      const k = keys[i];
      let v = acc.get(k);
      if (!v) acc.set(k, (v = new THREE.Vector3()));
      v.add(fn);
    }
  }
  const nor = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = acc.get(keys[i]);
    if (v && v.lengthSq() > 0) {
      const n = v.clone().normalize();
      nor[i * 3] = n.x;
      nor[i * 3 + 1] = n.y;
      nor[i * 3 + 2] = n.z;
    } else nor[i * 3 + 1] = 1;
  }
  geom.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return geom;
}

/**
 * Edit vertex positions. `fn` receives the position (mutable) and its smooth normal.
 * Keep edits a pure function of the position so duplicated seam vertices move together.
 * Normals are re-smoothed afterwards.
 */
export function deform(geom: THREE.BufferGeometry, fn: (p: THREE.Vector3, n: THREE.Vector3, i: number) => void): THREE.BufferGeometry {
  const pos = geom.attributes.position as THREE.BufferAttribute;
  smoothNormals(geom);
  const nor = geom.attributes.normal as THREE.BufferAttribute;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    fn(p, n, i);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  pos.needsUpdate = true;
  smoothNormals(geom);
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}

/** Push vertices along their normals by noise (organic lumps). Displacement depends only on position, so seams stay closed. */
export function noisify(geom: THREE.BufferGeometry, amp: number, freq: number, seed = 0): THREE.BufferGeometry {
  return deform(geom, (p, n) => {
    const d = fbm3(p.x * freq + seed, p.y * freq + seed * 0.7, p.z * freq - seed * 0.3, 3) * amp;
    p.addScaledVector(n, d);
  });
}

/** Lumpy sphere (potatoes, dough, blobs). Keeps the icosphere UVs (u around, v up). */
export function blobGeometry(radius: number, opts: { detail?: number; amp?: number; freq?: number; seed?: number; scale?: [number, number, number] } = {}): THREE.BufferGeometry {
  const g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, opts.detail ?? 5);
  const [sx, sy, sz] = opts.scale ?? [1, 1, 1];
  g.scale(sx, sy, sz);
  const amp = opts.amp ?? radius * 0.08;
  const freq = opts.freq ?? 2.2 / radius;
  const seed = opts.seed ?? 1;
  deform(g, (p) => {
    const len = p.length();
    const d = fbm3(p.x * freq + seed, p.y * freq + seed * 1.3, p.z * freq + seed * 0.7, 3) * amp;
    p.multiplyScalar((len + d) / len);
  });
  return g;
}

/** Spherical UVs for blobs & icospheres. */
export function addSphericalUV(g: THREE.BufferGeometry) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  const c = new THREE.Vector3();
  g.computeBoundingBox();
  g.boundingBox!.getCenter(c);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).sub(c).normalize();
    uv[i * 2] = 0.5 + Math.atan2(p.z, p.x) / (Math.PI * 2);
    uv[i * 2 + 1] = 0.5 + Math.asin(Math.max(-1, Math.min(1, p.y))) / Math.PI;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export function roundedBox(w: number, h: number, d: number, r: number, segs = 4): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, segs, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
}

export interface SweepOpts {
  /** Radius along the curve, t in 0..1. */
  radius: number | ((t: number) => number);
  /** Optional cross-section shape multiplier: (angle 0..2PI, t) -> scale. E.g. banana ridges. */
  shape?: (angle: number, t: number) => number;
  radialSegments?: number;
  tubularSegments?: number;
  /** End caps: 'round' (domes), 'flat', or 'none'. Default 'round'. */
  caps?: 'round' | 'flat' | 'none';
  /** Squash cross-section: [sideways, up] multipliers. */
  squash?: [number, number];
}

/**
 * Sweep a circle (or custom cross-section) along a curve with varying radius.
 * Great for bananas, sausages, chilies, carrots lying down, noodles, crab legs, shrimp.
 */
export function sweepGeometry(curve: THREE.Curve<THREE.Vector3>, o: SweepOpts): THREE.BufferGeometry {
  const radial = o.radialSegments ?? 16;
  const tubular = o.tubularSegments ?? 48;
  const radiusAt = typeof o.radius === 'number' ? () => o.radius as number : o.radius;
  const shape = o.shape ?? (() => 1);
  const [sqx, sqy] = o.squash ?? [1, 1];
  const frames = curve.computeFrenetFrames(tubular, false);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const caps = o.caps ?? 'round';
  const capRings = caps === 'round' ? 5 : 0;

  // build rings: optional start cap rings, body rings, end cap rings
  const rings: { center: THREE.Vector3; N: THREE.Vector3; B: THREE.Vector3; r: number; t: number; v: number }[] = [];
  const P = new THREE.Vector3();
  const T0 = frames.tangents[0], T1 = frames.tangents[tubular];
  const r0 = radiusAt(0), r1 = radiusAt(1);
  if (caps === 'round') {
    const start = curve.getPoint(0);
    for (let k = capRings; k >= 1; k--) {
      const a = (k / capRings) * (Math.PI / 2);
      rings.push({ center: start.clone().addScaledVector(T0, -Math.sin(a) * r0), N: frames.normals[0], B: frames.binormals[0], r: Math.max(1e-5, Math.cos(a) * r0), t: 0, v: -k / (capRings * 8) });
    }
  }
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, P);
    rings.push({ center: P.clone(), N: frames.normals[i], B: frames.binormals[i], r: radiusAt(t), t, v: t });
  }
  if (caps === 'round') {
    const end = curve.getPoint(1);
    for (let k = 1; k <= capRings; k++) {
      const a = (k / capRings) * (Math.PI / 2);
      rings.push({ center: end.clone().addScaledVector(T1, Math.sin(a) * r1), N: frames.normals[tubular], B: frames.binormals[tubular], r: Math.max(1e-5, Math.cos(a) * r1), t: 1, v: 1 + k / (capRings * 8) });
    }
  }
  for (const ring of rings) {
    for (let j = 0; j <= radial; j++) {
      const ang = (j / radial) * Math.PI * 2;
      const s = shape(ang, ring.t) * ring.r;
      const cx = Math.cos(ang) * s * sqx, cy = Math.sin(ang) * s * sqy;
      positions.push(
        ring.center.x + ring.N.x * cy + ring.B.x * cx,
        ring.center.y + ring.N.y * cy + ring.B.y * cx,
        ring.center.z + ring.N.z * cy + ring.B.z * cx,
      );
      uvs.push(j / radial, ring.v);
    }
  }
  const rowLen = radial + 1;
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * rowLen + j, b = (i + 1) * rowLen + j, c = (i + 1) * rowLen + j + 1, d = i * rowLen + j + 1;
      indices.push(a, b, d, b, c, d);
    }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  if (caps === 'flat') {
    const parts: THREE.BufferGeometry[] = [g];
    for (const end of [0, 1]) {
      const ring = end === 0 ? rings[0] : rings[rings.length - 1];
      const pts: number[] = [ring.center.x, ring.center.y, ring.center.z];
      const uv: number[] = [0.5, 0.5];
      const idx: number[] = [];
      for (let j = 0; j <= radial; j++) {
        const ang = (j / radial) * Math.PI * 2;
        const s = shape(ang, ring.t) * ring.r;
        const cx = Math.cos(ang) * s * sqx, cy = Math.sin(ang) * s * sqy;
        pts.push(ring.center.x + ring.N.x * cy + ring.B.x * cx, ring.center.y + ring.N.y * cy + ring.B.y * cx, ring.center.z + ring.N.z * cy + ring.B.z * cx);
        uv.push(0.5 + Math.cos(ang) * 0.5, 0.5 + Math.sin(ang) * 0.5);
        if (j > 0) end === 0 ? idx.push(0, j + 1, j) : idx.push(0, j, j + 1);
      }
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      cg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      cg.setIndex(idx);
      parts.push(cg);
    }
    g.computeVertexNormals();
    smoothNormals(g);
    const capsMerged = mergeGeometries(parts.map((p, i) => {
      const q = p.toNonIndexed();
      if (i > 0) q.computeVertexNormals();
      return q;
    }))!;
    capsMerged.computeBoundingBox();
    capsMerged.computeBoundingSphere();
    return capsMerged;
  }
  smoothNormals(g);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Convenience: a smooth curve through points. */
export function curveThrough(points: [number, number, number][], tension: 'centripetal' | 'catmullrom' = 'centripetal'): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, tension);
}

export interface LeafOpts {
  length: number;
  width: number;
  /** Bend along the length (positive = curls up). */
  curl?: number;
  /** Fold across the midrib (V shape). */
  fold?: number;
  /** Ruffle amplitude on the edges (lettuce). */
  ruffle?: number;
  segments?: number;
  /** Leaf outline: width multiplier along the length t 0..1. */
  outline?: (t: number) => number;
  seed?: number;
}

/**
 * Double-sided leaf / sheet lying along +Z from the origin, facing +Y.
 * UV: u across (0..1), v along (0..1) - paint veins in a texture accordingly.
 */
export function leafGeometry(o: LeafOpts): THREE.BufferGeometry {
  const segL = o.segments ?? 14, segW = 8;
  const outline = o.outline ?? ((t: number) => Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - 0.15 * t));
  const g = new THREE.PlaneGeometry(1, 1, segW, segL);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const seed = o.seed ?? 1;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5; // 0..1 across
    const v = pos.getY(i) + 0.5; // 0..1 along
    const across = (u - 0.5) * 2; // -1..1
    const w = outline(v) * o.width * 0.5;
    let x = across * w;
    let z = v * o.length;
    let y = Math.abs(across) * (o.fold ?? 0) * w;
    const curl = o.curl ?? 0;
    y += curl * v * v * o.length * 0.5;
    z -= curl * curl * v * v * v * o.length * 0.15;
    const ruffle = o.ruffle ?? 0;
    if (ruffle) y += Math.sin(v * 23 + seed + across * 3) * Math.cos(across * 7 + seed) * ruffle * Math.abs(across);
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

export function merge(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = geoms.map((g) => {
    let x = g.index ? g.toNonIndexed() : g;
    if (!x.attributes.uv) {
      x = x.clone();
      x.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2));
    }
    if (!x.attributes.normal) x.computeVertexNormals();
    // keep only common attributes
    for (const name of Object.keys(x.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) x.deleteAttribute(name);
    return x;
  });
  const hasColor = prepared.some((g) => g.attributes.color);
  if (hasColor)
    for (const g of prepared)
      if (!g.attributes.color) {
        const c = new Float32Array(g.attributes.position.count * 3).fill(1);
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      }
  const m = mergeGeometries(prepared, false);
  if (!m) throw new Error('merge failed (attribute mismatch)');
  return m;
}

/** Bake a transform into a clone of the geometry. */
export function transformed(g: THREE.BufferGeometry, opts: { pos?: [number, number, number]; rot?: [number, number, number]; scale?: number | [number, number, number] }): THREE.BufferGeometry {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(opts.rot ?? [0, 0, 0])));
  const s = typeof opts.scale === 'number' ? new THREE.Vector3(opts.scale, opts.scale, opts.scale) : new THREE.Vector3(...(opts.scale ?? [1, 1, 1]));
  m.compose(new THREE.Vector3(...(opts.pos ?? [0, 0, 0])), q, s);
  const c = g.clone();
  c.applyMatrix4(m);
  return c;
}

export interface MeshOpts {
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: number | [number, number, number];
  castShadow?: boolean;
  receiveShadow?: boolean;
  name?: string;
  /** Marks this mesh as the peelable outer skin. */
  skin?: boolean;
}

export function mesh(geom: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], o: MeshOpts = {}): THREE.Mesh {
  const m = new THREE.Mesh(geom, mat);
  if (o.pos) m.position.set(...o.pos);
  if (o.rot) m.rotation.set(...o.rot);
  if (o.scale !== undefined) typeof o.scale === 'number' ? m.scale.setScalar(o.scale) : m.scale.set(...o.scale);
  m.castShadow = o.castShadow ?? true;
  m.receiveShadow = o.receiveShadow ?? true;
  if (o.name) m.name = o.name;
  if (o.skin) m.userData.part = 'skin';
  return m;
}

/** Mark a mesh as peelable skin (returns it). */
export function skinMesh<T extends THREE.Object3D>(m: T): T {
  m.userData.part = 'skin';
  return m;
}

export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}

/** Wrap an object in a group, re-centred on x/z and resting on y = 0. */
export function sitOnGround(obj: THREE.Object3D): THREE.Group {
  const wrapper = new THREE.Group();
  wrapper.add(obj);
  wrapper.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= box.min.y;
  return wrapper;
}

/** Vertex colours for a geometry via a function of position (for gradients / blush). */
export function paintVertices(geom: THREE.BufferGeometry, fn: (p: THREE.Vector3) => THREE.Color | [number, number, number]): THREE.BufferGeometry {
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const c = fn(p);
    const [r, g, b] = c instanceof THREE.Color ? [c.r, c.g, c.b] : c;
    col[i * 3] = r;
    col[i * 3 + 1] = g;
    col[i * 3 + 2] = b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geom;
}

/** Linear-space Color from hex for vertex colours. */
export function col(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

export function lerpColor(a: string | THREE.Color, b: string | THREE.Color, t: number): THREE.Color {
  const ca = typeof a === 'string' ? new THREE.Color(a) : a.clone();
  const cb = typeof b === 'string' ? new THREE.Color(b) : b;
  return ca.lerp(cb, Math.max(0, Math.min(1, t)));
}

/** A lazily-created, cached value (handy for template materials). */
export function lazy<T>(make: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= make());
}
