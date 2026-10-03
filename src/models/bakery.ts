// Bakery models: bread loaf, burger bun, hot dog bun, baguette, tortilla, croissant, dough,
// flour bag, rice sack (+ cooked rice), spaghetti (+ cooked nest).
//
// The first part of this file is a small set of procedural helpers (tileable texture noise,
// per-pixel canvas textures, parametric surfaces, loaf-like "tubes", crumb painting) that are
// also used by sweets.ts and pantry.ts.

import * as THREE from 'three';
import type { ModelDef, ModelTable, SectionOpts } from './types';
import type { FoodState } from '../food/types';
import { getDef } from '../food/catalog';
import {
  type Rng,
  type Profile,
  rng,
  foodMat,
  makeCanvas,
  smoothNormals,
  noisify,
  merge,
  mesh,
  group,
  sitOnGround,
  lazy,
  fbm3,
  sweepGeometry,
  curveThrough,
  paintVertices,
} from './kit';

// =============================================================================================
// Shared helpers
// =============================================================================================

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export function sstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export type RGB = [number, number, number];
/** '#rrggbb' -> [r, g, b] in 0..255 (sRGB). */
export function rgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function setc(out: number[], c: readonly number[]): void {
  out[0] = c[0];
  out[1] = c[1];
  out[2] = c[2];
}
/** out = mix(out, c, t), in place. */
export function mixc(out: number[], c: readonly number[], t: number): void {
  if (t <= 0) return;
  if (t > 1) t = 1;
  out[0] += (c[0] - out[0]) * t;
  out[1] += (c[1] - out[1]) * t;
  out[2] += (c[2] - out[2]) * t;
}
export function mulc(out: number[], k: number): void {
  out[0] *= k;
  out[1] *= k;
  out[2] *= k;
}
/** Colour ramp lookup: stops sorted by position. */
export function ramp(out: number[], stops: readonly [number, RGB][], t: number): void {
  if (t <= stops[0][0]) return setc(out, stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const k = (t - t0) / Math.max(1e-9, t1 - t0);
      out[0] = c0[0] + (c1[0] - c0[0]) * k;
      out[1] = c0[1] + (c1[1] - c0[1]) * k;
      out[2] = c0[2] + (c1[2] - c0[2]) * k;
      return;
    }
  }
  setc(out, stops[stops.length - 1][1]);
}
export const hexOf = (c: readonly number[]): string =>
  '#' + c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');

function ihash(x: number, y: number, s: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) % 65536) / 32768 - 1;
}

/** Tileable value noise over u, v in [0, 1) with integer frequencies. Returns -1..1. */
export function tnoise(u: number, v: number, fx: number, fy: number, seed = 0): number {
  const X = u * fx, Y = v * fy;
  const xi = Math.floor(X), yi = Math.floor(Y);
  let xf = X - xi, yf = Y - yi;
  xf = xf * xf * (3 - 2 * xf);
  yf = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % fx) + fx) % fx, y0 = ((yi % fy) + fy) % fy;
  const x1 = (x0 + 1) % fx, y1 = (y0 + 1) % fy;
  const a = ihash(x0, y0, seed), b = ihash(x1, y0, seed), c = ihash(x0, y1, seed), d = ihash(x1, y1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

/** Tileable fractal noise (-1..1). */
export function tfbm(u: number, v: number, fx: number, fy: number, seed = 0, oct = 4): number {
  let s = 0, a = 1, n = 0;
  for (let o = 0; o < oct; o++) {
    s += tnoise(u, v, fx << o, fy << o, seed + o * 31) * a;
    n += a;
    a *= 0.5;
  }
  return s / n;
}

export interface PixelTex {
  map: THREE.Texture;
  bump: THREE.Texture | null;
}
const pixCache = new Map<string, PixelTex>();

function toTexture(c: HTMLCanvasElement | OffscreenCanvas, srgb: boolean, wrap: boolean): THREE.Texture {
  const t = new THREE.CanvasTexture(c as HTMLCanvasElement);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/**
 * Cached per-pixel texture (+ optional bump map) written in UV space: `fn(u, v, col, bump)`
 * receives the texel's UV (v = 0 at the bottom, matching three.js UVs) and writes col[0..2]
 * (0..255 sRGB) and bump[0] (0..1, default 0.5). `post` can draw extra canvas details.
 */
export function pixelTex(
  key: string,
  w: number,
  h: number,
  fn: (u: number, v: number, col: number[], bump: number[]) => void,
  o: {
    bump?: boolean;
    wrap?: boolean;
    post?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
    postBump?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  } = {},
): PixelTex {
  const hit = pixCache.get(key);
  if (hit) return hit;
  const cc = makeCanvas(w, h);
  const ctx = cc.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  const img = ctx.createImageData(w, h);
  let bc: HTMLCanvasElement | OffscreenCanvas | null = null;
  let bctx: CanvasRenderingContext2D | null = null;
  let bimg: ImageData | null = null;
  if (o.bump) {
    bc = makeCanvas(w, h);
    bctx = bc.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    bimg = bctx.createImageData(w, h);
  }
  const col = [0, 0, 0];
  const b = [0.5];
  const d = img.data;
  for (let py = 0; py < h; py++) {
    const v = 1 - (py + 0.5) / h;
    for (let px = 0; px < w; px++) {
      const u = (px + 0.5) / w;
      b[0] = 0.5;
      fn(u, v, col, b);
      const i = (py * w + px) * 4;
      d[i] = col[0];
      d[i + 1] = col[1];
      d[i + 2] = col[2];
      d[i + 3] = 255;
      if (bimg) {
        const g = clamp01(b[0]) * 255;
        bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = g;
        bimg.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  o.post?.(ctx, w, h);
  if (bctx && bimg) {
    bctx.putImageData(bimg, 0, 0);
    o.postBump?.(bctx, w, h);
  }
  const res: PixelTex = { map: toTexture(cc, true, !!o.wrap), bump: bc ? toTexture(bc, false, !!o.wrap) : null };
  pixCache.set(key, res);
  return res;
}

/** Plain cached canvas texture (like kit.canvasTexture, but wrap/srgb explicit). */
export function drawTex(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, o: { wrap?: boolean; srgb?: boolean } = {}): THREE.Texture {
  const hit = pixCache.get(key);
  if (hit) return hit.map;
  const cc = makeCanvas(w, h);
  const ctx = cc.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  draw(ctx, w, h);
  const t = toTexture(cc, o.srgb !== false, !!o.wrap);
  pixCache.set(key, { map: t, bump: null });
  return t;
}

/**
 * Parametric grid surface. fn(u, v) writes the position; UVs are (u, v). Default winding gives
 * normals along dS/dv x dS/du. Normals are smoothed across seams / poles.
 */
export function paramSurface(
  nu: number,
  nv: number,
  fn: (u: number, v: number, out: THREE.Vector3, i: number, j: number) => void,
  flip = false,
): THREE.BufferGeometry {
  const row = nu + 1;
  const cnt = row * (nv + 1);
  const pos = new Float32Array(cnt * 3);
  const uv = new Float32Array(cnt * 2);
  const p = new THREE.Vector3();
  let k = 0;
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      p.set(0, 0, 0);
      fn(u, v, p, i, j);
      pos[k * 3] = p.x;
      pos[k * 3 + 1] = p.y;
      pos[k * 3 + 2] = p.z;
      uv[k * 2] = u;
      uv[k * 2 + 1] = v;
      k++;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  smoothNormals(g);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Reverse triangle winding in place (after mirroring). */
export function flipWinding(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = g.index;
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
    idx.needsUpdate = true;
  } else {
    for (const name of Object.keys(g.attributes)) {
      const a = g.attributes[name] as THREE.BufferAttribute;
      const s = a.itemSize;
      const arr = a.array as Float32Array;
      for (let t = 0; t < a.count; t += 3) {
        for (let c = 0; c < s; c++) {
          const i1 = (t + 1) * s + c, i2 = (t + 2) * s + c;
          const tmp = arr[i1];
          arr[i1] = arr[i2];
          arr[i2] = tmp;
        }
      }
      a.needsUpdate = true;
    }
  }
  return g;
}

/** Mirror a geometry across z = 0 keeping it front-facing. */
export function mirrorZ(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const c = g.clone();
  c.scale(1, 1, -1);
  flipWinding(c);
  c.computeBoundingBox();
  c.computeBoundingSphere();
  return c;
}

/** Overwrite UVs with a planar projection of x/z (top view) over a square of the given size. */
export function planarUV(g: THREE.BufferGeometry, size: number, cx = 0, cz = 0): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - cx) / size + 0.5;
    uv[i * 2 + 1] = 0.5 - (pos.getZ(i) - cz) / size;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Mirror the u coordinate (so printing reads left-to-right on rings that run clockwise). */
export function flipU(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  uv.needsUpdate = true;
  return g;
}

/** Squash a surface's v coordinate to a constant (sample a plain band of a shared texture). */
export function plainUV(g: THREE.BufferGeometry, v: number): THREE.BufferGeometry {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, v);
  uv.needsUpdate = true;
  return g;
}

/** Give a geometry a constant vertex colour (for merged multi-colour meshes). */
export function tintGeometry(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  return paintVertices(g, () => c);
}

/** A closed (or open) 2D outline resampled uniformly by arc length, with outward normals. */
export interface Outline {
  n: number;
  a: Float64Array; // first coordinate
  b: Float64Array; // second coordinate
  na: Float64Array; // outward normal
  nb: Float64Array;
  perimeter: number;
}

/** Control points must run counter-clockwise (a right, b up) for outward normals. */
export function makeOutline(ctrl: [number, number][], n: number, closed = true): Outline {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, y]) => new THREE.Vector3(x, y, 0)), closed, 'centripetal');
  const pts = curve.getSpacedPoints(n);
  const a = new Float64Array(n + 1), b = new Float64Array(n + 1), na = new Float64Array(n + 1), nb = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    a[i] = pts[i].x;
    b[i] = pts[i].y;
  }
  if (closed) {
    a[n] = a[0];
    b[n] = b[0];
  } else {
    a[0] = ctrl[0][0];
    b[0] = ctrl[0][1];
    a[n] = ctrl[ctrl.length - 1][0];
    b[n] = ctrl[ctrl.length - 1][1];
  }
  for (let i = 0; i <= n; i++) {
    let i0 = i - 1, i1 = i + 1;
    if (closed) {
      if (i0 < 0) i0 = n - 1;
      if (i1 > n) i1 = 1;
    } else {
      i0 = Math.max(0, i0);
      i1 = Math.min(n, i1);
    }
    const ta = a[i1] - a[i0], tb = b[i1] - b[i0];
    const l = Math.hypot(ta, tb) || 1;
    na[i] = tb / l;
    nb[i] = -ta / l;
  }
  return { n, a, b, na, nb, perimeter: curve.getLength() };
}

/** Mirror a half outline (from the bottom centre up the +a side to the top centre) into a full loop. */
export function symmetric(half: [number, number][]): [number, number][] {
  return [...half, ...half.slice(1, -1).reverse().map(([a, b]) => [-a, b] as [number, number])];
}

/** Linear lookup in an outline array by u (0..1). */
export function olAt(arr: Float64Array, u: number): number {
  const n = arr.length - 1;
  const f = clamp01(u) * n;
  const i = Math.min(n - 1, Math.floor(f));
  return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
}

/** Ring stations along a loaf: x positions and section scale s (superellipse side silhouette). */
export interface Stations {
  nv: number;
  x: Float64Array;
  s: Float64Array;
}

export function makeStations(halfLen: number, halfH: number, m: number, k: number, nv: number): Stations {
  const N = 1600;
  const X = new Float64Array(N + 1), S = new Float64Array(N + 1), L = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const xn = Math.sin(-Math.PI / 2 + (Math.PI * i) / N);
    X[i] = xn * halfLen;
    S[i] = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(xn), m)), 1 / k);
    if (i > 0) L[i] = L[i - 1] + Math.hypot(X[i] - X[i - 1], (S[i] - S[i - 1]) * halfH);
  }
  const x = new Float64Array(nv + 1), s = new Float64Array(nv + 1);
  let p = 0;
  for (let j = 0; j <= nv; j++) {
    const target = (L[N] * j) / nv;
    while (p < N - 1 && L[p + 1] < target) p++;
    const t = clamp01((target - L[p]) / Math.max(1e-12, L[p + 1] - L[p]));
    x[j] = X[p] + (X[p + 1] - X[p]) * t;
    s[j] = S[p] + (S[p + 1] - S[p]) * t;
  }
  x[0] = -halfLen;
  x[nv] = halfLen;
  s[0] = 0;
  s[nv] = 0;
  return { nv, x, s };
}

export function stationX(st: Stations, v: number): number {
  const f = clamp01(v) * st.nv;
  const i = Math.min(st.nv - 1, Math.floor(f));
  return st.x[i] + (st.x[i + 1] - st.x[i]) * (f - i);
}

export interface TubeOpts {
  /** Height the cross-section shrinks towards at the rounded ends. */
  anchor: number;
  /** Displacement along the outline normal (metres), faded out towards the ends. */
  disp?: (u: number, x: number) => number;
  warp?: (p: THREE.Vector3, u: number, x: number, s: number) => void;
}

/**
 * Loaf-like body lying along X: the outline (in the z/y plane) is swept along X and shrinks
 * towards rounded ends. UV: u around the outline (0 = start of the outline), v along X.
 */
export function tubeGeometry(ol: Outline, st: Stations, o: TubeOpts): THREE.BufferGeometry {
  return paramSurface(ol.n, st.nv, (u, _v, out, i, j) => {
    const s = st.s[j], x = st.x[j];
    let z = ol.a[i] * s, y = o.anchor + (ol.b[i] - o.anchor) * s;
    if (o.disp) {
      const d = o.disp(u, x) * sstep(0.62, 0.96, s);
      z += ol.na[i] * d;
      y += ol.nb[i] * d;
    }
    out.set(x, y, z);
    if (o.warp) o.warp(out, u, x, s);
  });
}

// ---------------------------------------------------------------------------------------------
// Clip-plane cut forms: wedges / chunks of a disc-shaped item that keep the whole model's detail
// (glaze, sprinkles, chips...). Each piece is a full copy clipped by FoodVisual (userData.clipPlanes)
// plus textured cut faces built from the profile.

/** Cut-face material from a sectionV painter (canvas x = -R..R across, y = top..bottom). */
export function sectionVMaterial(key: string, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, aspect: number, flesh: string, cooked: string, roughness = 0.75): THREE.Material {
  const h = Math.round(Math.max(64, Math.min(512, 256 * aspect)));
  return foodMat({ color: '#ffffff', map: drawTex(key, 256, h, paint), roughness, flesh, cookColor: cooked });
}

/** Flat cut face (profile half-shape or ring loop) facing +z in the XY plane; uv maps x = -R..R, y = 0..H. */
function profileFace(prof: Profile, mirror: boolean, R: number, H: number, inset = 0.985): THREE.BufferGeometry {
  const ring = prof[0][0] > R * 0.2 && prof[prof.length - 1][0] > R * 0.2;
  const sx = mirror ? -1 : 1;
  const pts: THREE.Vector2[] = [];
  if (!ring) pts.push(new THREE.Vector2(0, prof[0][1]));
  for (const [r, y] of prof) pts.push(new THREE.Vector2(sx * r * inset, y));
  if (!ring) pts.push(new THREE.Vector2(0, prof[prof.length - 1][1]));
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts), 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + R) / (2 * R), pos.getY(i) / H);
  uv.needsUpdate = true;
  return g;
}

export interface ClipCutOpts {
  /** Number of wedges around the item. */
  n: number;
  /** Profile ([r, y]) for the textured cut faces (omit for plain flesh-coloured cuts). */
  profile?: Profile;
  faceMat?: THREE.Material;
  /** Radial gap between wedges (display layout). */
  gap?: number;
  /** Chunks: scatter this many of the wedges in a heap instead (diced). */
  scatter?: { count: number; radius: number; scale: number };
}

/** Wedges (or scattered chunks) made from clipped copies of the whole model. */
export function clipCut(build: (k: number) => THREE.Object3D, o: ClipCutOpts, r: Rng): THREE.Object3D {
  const out = new THREE.Group();
  const d = (Math.PI * 2) / o.n;
  const start = r.range(0, Math.PI * 2);
  let R = 0, H = 0;
  if (o.profile) {
    for (const [pr, py] of o.profile) {
      R = Math.max(R, pr);
      H = Math.max(H, py);
    }
  }
  const count = o.scatter ? o.scatter.count : o.n;
  const placed: [number, number][] = [];
  for (let k = 0; k < count; k++) {
    const p0 = start + k * d, p1 = p0 + d;
    const holder = new THREE.Group();
    holder.add(build(k));
    if (o.profile && o.faceMat) {
      const eps = 0.004;
      const f0 = profileFace(o.profile, false, R, H);
      f0.rotateY(p0 + eps - Math.PI / 2);
      const f1 = profileFace(o.profile, true, R, H);
      f1.rotateY(p1 - eps + Math.PI / 2);
      holder.add(mesh(f0, o.faceMat), mesh(f1, o.faceMat));
    }
    holder.userData.clipPlanes = [
      new THREE.Plane(new THREE.Vector3(-Math.cos(p0), 0, Math.sin(p0)), 0),
      new THREE.Plane(new THREE.Vector3(Math.cos(p1), 0, -Math.sin(p1)), 0),
    ];
    const mid = (p0 + p1) / 2;
    const wrap = new THREE.Group();
    if (o.scatter) {
      // recentre the wedge on its own visible part, then heap the chunks
      const inner = new THREE.Group();
      inner.add(holder);
      const cr = R * 0.55;
      holder.position.set(-Math.sin(mid) * cr, 0, -Math.cos(mid) * cr);
      inner.scale.setScalar(o.scatter.scale * r.range(0.85, 1.1));
      inner.rotation.y = r.range(0, Math.PI * 2);
      let best: [number, number] = [0, 0];
      for (let t = 0; t < 30; t++) {
        const [dx, dz] = r.disc();
        const c: [number, number] = [dx * o.scatter.radius, dz * o.scatter.radius];
        best = c;
        if (placed.every((q) => Math.hypot(q[0] - c[0], q[1] - c[1]) > o.scatter!.radius * 0.45)) break;
      }
      placed.push(best);
      wrap.position.set(best[0], k >= count - 2 ? 0.004 : 0, best[1]);
      wrap.rotation.set(r.range(-0.12, 0.12), 0, r.range(-0.12, 0.12));
      wrap.add(inner);
    } else {
      const gap = o.gap ?? 0.006;
      wrap.position.set(Math.sin(mid) * gap, 0, Math.cos(mid) * gap);
      wrap.add(holder);
    }
    out.add(wrap);
  }
  return out;
}

/** Lathe profile resampled by arc length, with the v (0..1) of every point and outward normals. */
export interface ArcProfile {
  r: Float64Array;
  y: Float64Array;
  nr: Float64Array;
  ny: Float64Array;
  v: Float64Array;
}

export function arcProfile(ctrl: [number, number][], n: number): ArcProfile {
  const ol = makeOutline(ctrl, n - 1, false);
  const r = new Float64Array(n), y = new Float64Array(n), v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    r[i] = Math.max(1e-4, ol.a[i]);
    y[i] = ol.b[i];
    v[i] = i / (n - 1);
  }
  // profile runs bottom -> top on the +r side: outward normal is (dy, -dr) = (-nb, na) of the
  // outline convention, i.e. flipped. Recompute directly.
  const nr = new Float64Array(n), ny = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    const dr = r[i1] - r[i0], dy = y[i1] - y[i0];
    const l = Math.hypot(dr, dy) || 1;
    nr[i] = dy / l;
    ny[i] = -dr / l;
  }
  return { r, y, nr, ny, v };
}

/** Value of a profile array at parameter v (0..1). */
export function apAt(arr: Float64Array, v: number): number {
  const n = arr.length - 1;
  const f = clamp01(v) * n;
  const i = Math.min(n - 1, Math.floor(f));
  return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
}

/** Lathe a range [i0, i1] of an arc profile (optionally with extra end points) keeping its v as UV. */
export function latheArc(pts: { r: number; y: number; v: number }[], segments: number): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    pts.map((p) => new THREE.Vector2(Math.max(1e-4, p.r), p.y)),
    segments,
  );
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const n = pts.length;
  for (let i = 0; i <= segments; i++) for (let j = 0; j < n; j++) uv.setY(i * n + j, pts[j].v);
  uv.needsUpdate = true;
  return g;
}

export function profilePoints(ap: ArcProfile): { r: number; y: number; v: number }[] {
  return Array.from(ap.r, (r, i) => ({ r, y: ap.y[i], v: ap.v[i] }));
}

/** Soft elliptical blob (radial gradient through a transform). */
export function softEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, color: string, alpha: number, hard = 0.35) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, color);
  g.addColorStop(hard, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export interface CrumbOpts {
  seed: number;
  count: number;
  rmin: number;
  rmax: number;
  hole: string;
  lip: string;
  /** Draw wrapped copies near the edges (tileable texture). */
  wrap?: boolean;
  /** Vertical squash of holes (<1 flatter). */
  squash?: number;
  /** Bias towards small holes (higher = more small ones). */
  bias?: number;
  alpha?: [number, number];
}

/** Air holes for bread crumb, cake, croissant interiors. Clip the context beforehand if needed. */
export function paintCrumb(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, o: CrumbOpts) {
  const r = rng(o.seed);
  const [a0, a1] = o.alpha ?? [0.5, 0.85];
  for (let i = 0; i < o.count; i++) {
    const cx = x0 + r.next() * w, cy = y0 + r.next() * h;
    const rad = o.rmin + (o.rmax - o.rmin) * Math.pow(r.next(), o.bias ?? 2.4);
    const rx = rad * r.range(0.75, 1.35), ry = rad * r.range(0.55, 1.0) * (o.squash ?? 1);
    const rot = r.range(-0.6, 0.6);
    const al = r.range(a0, a1);
    const offs: [number, number][] = [[0, 0]];
    if (o.wrap) {
      const m = rad * 1.6;
      const xs = [0];
      const ys = [0];
      if (cx - x0 < m) xs.push(w);
      if (x0 + w - cx < m) xs.push(-w);
      if (cy - y0 < m) ys.push(h);
      if (y0 + h - cy < m) ys.push(-h);
      offs.length = 0;
      for (const ox of xs) for (const oy of ys) offs.push([ox, oy]);
    }
    for (const [ox, oy] of offs) {
      softEllipse(ctx, cx + ox, cy + oy, rx, ry, rot, o.hole, al, 0.45);
      softEllipse(ctx, cx + ox + rx * 0.08, cy + oy + ry * 0.42, rx * 0.72, ry * 0.42, rot, o.lip, al * 0.55, 0.3);
    }
  }
}

/** Fine speckle (flour, sugar, crumb grain). */
export function speckle(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, color: string, count: number, size: [number, number], alpha: [number, number], seed: number, accept?: (x: number, y: number) => boolean) {
  const r = rng(seed);
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = x0 + r.next() * w, y = y0 + r.next() * h;
    const s = r.range(size[0], size[1]);
    const a = r.range(alpha[0], alpha[1]);
    const rot = r.next() * Math.PI;
    const el = r.range(0.5, 1);
    if (accept && !accept(x, y)) continue;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * el, rot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Tileable crumb texture for flesh materials (dice, croutons, cut faces). */
export function crumbTileTexture(key: string, base: string, hole: string, lip: string, seed: number, holeScale = 1): THREE.Texture {
  return drawTex(
    key,
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const n = tfbm(x / w, y / h, 8, 8, seed, 3) * 0.06 + tnoise(x / w, y / h, 64, 64, seed + 3) * 0.03;
          const i = (y * w + x) * 4;
          d[i] *= 1 + n;
          d[i + 1] *= 1 + n;
          d[i + 2] *= 1 + n * 1.2;
        }
      ctx.putImageData(img, 0, 0);
      paintCrumb(ctx, 0, 0, w, h, { seed, count: Math.round(260 / holeScale), rmin: 1.2 * holeScale, rmax: 7 * holeScale, hole, lip, wrap: true, squash: 0.85 });
    },
    { wrap: true },
  );
}

/** Random unit vector perpendicular to n. */
function randomTangent(n: THREE.Vector3, r: Rng): THREE.Vector3 {
  const a = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const t1 = new THREE.Vector3().crossVectors(n, a).normalize();
  const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
  const ang = r.range(0, Math.PI * 2);
  return t1.multiplyScalar(Math.cos(ang)).addScaledVector(t2, Math.sin(ang));
}

/** Matrix placing a unit primitive at p, x axis along t, y axis along n, scaled by s. */
export function frameMatrix(p: THREE.Vector3, n: THREE.Vector3, t: THREE.Vector3, s: [number, number, number]): THREE.Matrix4 {
  const y = n.clone().normalize();
  const x = t.clone().addScaledVector(y, -t.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  const m = new THREE.Matrix4().makeBasis(x.multiplyScalar(s[0]), y.multiplyScalar(s[1]), z.multiplyScalar(s[2]));
  m.setPosition(p);
  return m;
}

/** Copies of a small primitive placed with matrices, merged (optionally with per-copy colours). */
export function scatterMerge(base: THREE.BufferGeometry, mats: THREE.Matrix4[], colors?: THREE.Color[]): THREE.BufferGeometry {
  const parts = mats.map((m, i) => {
    const g = base.clone().applyMatrix4(m);
    if (colors) tintGeometry(g, colors[i % colors.length]);
    return g;
  });
  const g = merge(parts);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export { randomTangent };

/** A little ellipsoid primitive (seeds, grains, sprinkles) with a pointy end option. */
export function seedGeometry(ws = 6, hs = 4, taper = 0): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, ws, hs);
  if (taper) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      // sphere's pole axis is Y; we want the long axis on X: taper z/y by x
      const x = pos.getX(i);
      const k = 1 - taper * (x + 1) * 0.5;
      pos.setY(i, pos.getY(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    g.computeVertexNormals();
  }
  return g;
}

// =============================================================================================
// Bread loaf (bloomer): domed loaf along X with diagonal scores and a flour dusting
// =============================================================================================

const BREAD = getDef('bread').colors;

const BREAD_HALF: [number, number][] = [
  [0, 0],
  [0.026, 0],
  [0.044, 0.0012],
  [0.0535, 0.0075],
  [0.0578, 0.021],
  [0.0606, 0.04],
  [0.0606, 0.06],
  [0.0555, 0.0795],
  [0.0435, 0.0935],
  [0.024, 0.1018],
  [0, 0.1045],
];
const LOAF_NU = 52;
const LOAF_NV = 56;
const loafOutline = lazy(() => makeOutline(symmetric(BREAD_HALF), LOAF_NU));
const loafStations = lazy(() => makeStations(0.121, 0.05, 2.6, 2.3, LOAF_NV));

const BREAD_SCORES = [-0.068, -0.034, 0, 0.034, 0.068];
const SC_ANG = 0.62;
const SC_COS = Math.cos(SC_ANG), SC_SIN = Math.sin(SC_ANG);
const scoreOut = { g: 0, e: 0 };
/** Score field at (a = arc distance from the top centre, x): groove 0..1 and raised ear 0..1. */
function breadScore(a: number, x: number) {
  let g = 0, e = 0;
  for (const xk of BREAD_SCORES) {
    const dx = x - xk;
    const d = dx * SC_COS - a * SC_SIN;
    const l = dx * SC_SIN + a * SC_COS;
    const al = Math.abs(l);
    if (al > 0.037) continue;
    const m = 1 - sstep(0.012, 0.037, al);
    const w = 0.0072 * (0.3 + 0.7 * Math.sqrt(m));
    const t = d / w;
    if (t > -1 && t < 1) {
      const q = 1 - t * t;
      g = Math.max(g, q * q * Math.sqrt(m));
    }
    const te = (d - w * 1.05) / (w * 0.55);
    e = Math.max(e, Math.exp(-te * te) * m);
  }
  scoreOut.g = g;
  scoreOut.e = e;
  return scoreOut;
}

const BREAD_RAMP: [number, RGB][] = [
  [0, rgb('#c39560')],
  [0.3, rgb('#d6a35f')],
  [0.45, rgb('#d99f56')],
  [0.62, rgb('#c98a44')],
  [0.8, rgb('#b8783a')],
  [1, rgb('#ad6a30')],
];

const breadTex = lazy(() => {
  const ol = loafOutline(), st = loafStations();
  const P = ol.perimeter;
  const cream = rgb('#f4dfae'), creamDeep = rgb('#eccb8a'), ear = rgb('#a35f28'), flour = rgb('#f6f0e5'), endc = rgb('#ad672b');
  return pixelTex(
    'bread-loaf',
    512,
    512,
    (u, v, col, b) => {
      const x = stationX(st, v);
      const ny = olAt(ol.nb, u);
      const a = (u - 0.5) * P;
      ramp(col, BREAD_RAMP, (ny + 1) * 0.5);
      const n1 = tfbm(u, v, 10, 12, 3, 4);
      const n2 = tfbm(u, v, 40, 48, 7, 3);
      mulc(col, 1 + 0.1 * n1 - (n2 > 0.2 ? (n2 - 0.2) * 0.35 : 0));
      // ends brown more
      mixc(col, endc, sstep(0.085, 0.12, Math.abs(x)) * 0.35);
      const sc = breadScore(a, x);
      const tg = sstep(0.03, 0.42, sc.g);
      // flour dusting on top (not inside the scores)
      const fl = sstep(0.25, 0.85, ny) * (0.45 + 0.55 * sstep(-0.3, 0.35, tfbm(u, v, 6, 7, 21, 3))) * (1 - tg) * (1 - sstep(0.09, 0.118, Math.abs(x)) * 0.6);
      mixc(col, flour, fl * 0.5);
      mixc(col, ear, (sc.e * 0.6 + sstep(0.0, 0.25, sc.g) * 0.7) * (1 - tg));
      mixc(col, cream, tg * 0.97);
      mixc(col, creamDeep, sstep(0.6, 1, sc.g) * 0.45 * (0.7 + 0.3 * n1));
      b[0] = 0.55 + 0.07 * n1 + 0.05 * n2 - 0.38 * sc.g + 0.12 * sc.e + 0.04 * tnoise(u, v, 128, 128, 9);
    },
    {
      bump: true,
      post: (ctx, w, h) => {
        // fine flour specks on the top, avoiding the scores
        speckle(ctx, w * 0.28, 0, w * 0.44, h, '#fbf8f1', 2600, [0.5, 1.4], [0.35, 0.9], 77, (px, py) => {
          const u = px / w, v = 1 - py / h;
          const sc = breadScore((u - 0.5) * P, stationX(st, v));
          return sc.g < 0.15 && Math.abs(stationX(st, v)) < 0.112;
        });
      },
    },
  );
});

const breadMat = lazy(() => {
  const t = breadTex();
  return foodMat({ color: '#ffffff', map: t.map, bumpMap: t.bump, bumpScale: 3.5, roughness: 0.66, flesh: BREAD.flesh, cookColor: BREAD.cooked, name: 'bread-crust' });
});

/** Generic golden crust (slice sides, crouton crust bits). */
export function crustTile(key: string, base: string, dark: string, seed: number): PixelTex {
  const c0 = rgb(base), c1 = rgb(dark);
  return pixelTex(
    key,
    128,
    128,
    (u, v, col, b) => {
      setc(col, c0);
      const n = tfbm(u, v, 4, 4, seed, 4);
      mixc(col, c1, sstep(-0.1, 0.6, n) * 0.6);
      mulc(col, 1 + 0.06 * tnoise(u, v, 32, 32, seed + 5));
      b[0] = 0.5 + 0.25 * n;
    },
    { bump: true, wrap: true },
  );
}

const breadSkin = lazy(() => {
  const t = crustTile('bread-crust-tile', '#cf9246', '#b4732f', 11);
  return foodMat({ color: '#ffffff', map: t.map, bumpMap: t.bump, bumpScale: 1.5, roughness: 0.62, flesh: BREAD.flesh, cookColor: BREAD.cooked });
});
const breadFlesh = lazy(() =>
  foodMat({ color: '#ffffff', map: crumbTileTexture('bread-crumb-tile', BREAD.flesh, '#d8b77c', '#fff6dc', 5), roughness: 0.85, flesh: BREAD.flesh, cookColor: '#c98a42' }),
);

/** Bevel the generic slab slicer adds around the slice shape (thickness 0.011 * 0.18). */
const SLICE_BEVEL = 0.002;

function breadSection(ctx: CanvasRenderingContext2D, s: number) {
  const ol = loafOutline();
  let minA = Infinity, maxA = -Infinity, maxB = -Infinity, minB = Infinity;
  for (let i = 0; i < ol.n; i++) {
    minA = Math.min(minA, ol.a[i]);
    maxA = Math.max(maxA, ol.a[i]);
    minB = Math.min(minB, ol.b[i]);
    maxB = Math.max(maxB, ol.b[i]);
  }
  const W = maxA - minA + 2 * SLICE_BEVEL, H = maxB - minB + 2 * SLICE_BEVEL;
  const X = (a: number) => ((a - minA + SLICE_BEVEL) / W) * s;
  const Y = (b: number) => (1 - (b - minB + SLICE_BEVEL) / H) * s;
  const path = (inset: number) => {
    ctx.beginPath();
    for (let i = 0; i < ol.n; i++) {
      const a = ol.a[i] - ol.na[i] * inset, b = ol.b[i] - ol.nb[i] * inset;
      if (i === 0) ctx.moveTo(X(a), Y(b));
      else ctx.lineTo(X(a), Y(b));
    }
    ctx.closePath();
  };
  ctx.fillStyle = '#b5743a';
  ctx.fillRect(0, 0, s, s);
  path(0.0012);
  ctx.fillStyle = '#d29a55';
  ctx.fill();
  path(0.0028);
  const g = ctx.createRadialGradient(s * 0.5, s * 0.55, s * 0.05, s * 0.5, s * 0.55, s * 0.6);
  g.addColorStop(0, '#fbecc8');
  g.addColorStop(0.7, BREAD.flesh);
  g.addColorStop(1, '#ead2a0');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  path(0.0028);
  ctx.clip();
  speckle(ctx, 0, 0, s, s, '#e3c792', 900, [0.4, 1.1], [0.3, 0.7], 41);
  paintCrumb(ctx, 0, 0, s, s, { seed: 17, count: 230, rmin: s * 0.004, rmax: s * 0.022, hole: '#cfae72', lip: '#fff7e0', squash: 1.1, alpha: [0.45, 0.8] });
  ctx.restore();
}

function breadSliceShape(): THREE.Shape {
  const ol = loafOutline();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < ol.n; i++) pts.push(new THREE.Vector2(ol.a[i], ol.b[i]));
  return new THREE.Shape(pts);
}

function buildBread(r: Rng): THREE.Object3D {
  const ol = loafOutline(), st = loafStations();
  const P = ol.perimeter;
  const seed = r.range(0, 50);
  const lump = r.range(0.0008, 0.0014);
  const geo = tubeGeometry(ol, st, {
    anchor: 0.034,
    disp: (u, x) => {
      const sc = breadScore((u - 0.5) * P, x);
      return -0.0058 * sc.g + 0.002 * sc.e;
    },
    warp: (p) => {
      // gentle organic lumps, stronger on top
      const k = 0.4 + 0.6 * sstep(0.02, 0.09, p.y);
      const n = fbm3(p.x * 22 + seed, p.y * 22, p.z * 22 - seed, 3);
      p.y += n * lump * k;
      p.z += n * lump * 0.6 * Math.sign(p.z);
    },
  });
  const m = mesh(geo, breadMat(), { skin: true, name: 'loaf' });
  const g = group(m);
  g.scale.setScalar(r.range(0.97, 1.03));
  return sitOnGround(g);
}

// =============================================================================================
// Burger bun: glossy golden dome with sesame seeds and a pale side band
// =============================================================================================

const BUN = getDef('bun').colors;
const BUN_CTRL: [number, number][] = [
  [0.0001, 0],
  [0.028, 0],
  [0.0455, 0.0012],
  [0.0515, 0.0045],
  [0.0545, 0.0098],
  [0.0553, 0.016],
  [0.0547, 0.0225],
  [0.052, 0.031],
  [0.0465, 0.0405],
  [0.0375, 0.0495],
  [0.025, 0.0565],
  [0.012, 0.0603],
  [0.0001, 0.0615],
];
const bunProf = lazy(() => arcProfile(BUN_CTRL, 40));
const BUN_CUT = 0.0615 * 0.42;

const BUN_RAMP: [number, RGB][] = [
  [0, rgb('#cf9d60')],
  [0.0035, rgb('#dcb177')],
  [0.0085, rgb('#f2d8a6')],
  [0.0155, rgb('#f0d199')],
  [0.0235, rgb('#e2a65a')],
  [0.034, rgb('#d48b3d')],
  [0.05, rgb('#c97b31')],
  [0.0615, rgb('#bd6f2b')],
];

const bunTex = lazy(() => {
  const pr = bunProf();
  return pixelTex(
    'bun-crust',
    256,
    256,
    (u, v, col, b) => {
      const y = apAt(pr.y, v);
      ramp(col, BUN_RAMP, y);
      const n1 = tfbm(u, v, 12, 4, 13, 4);
      const n2 = tnoise(u, v, 96, 32, 14);
      mulc(col, 1 + 0.07 * n1 + 0.025 * n2);
      // soft egg-wash streaks on the dome
      const streak = tnoise(u, v, 40, 3, 15);
      mulc(col, 1 + 0.04 * streak * sstep(0.025, 0.04, y));
      b[0] = 0.5 + 0.1 * n1 + 0.06 * n2;
    },
    { bump: true },
  );
});

const bunMat = lazy(() => {
  const t = bunTex();
  return foodMat({ color: '#ffffff', map: t.map, bumpMap: t.bump, bumpScale: 1.2, roughness: 0.5, clearcoat: 0.45, clearcoatRoughness: 0.32, flesh: BUN.flesh, cookColor: BUN.cooked, name: 'bun-crust' });
});
const sesameMat = lazy(() => foodMat({ color: '#f7ecd2', roughness: 0.42, flesh: '#f7ecd2', cookColor: '#c99643', cookAmount: 0.7, name: 'sesame' }));

/** Round cut face with a thin golden crust ring (bun halves). */
function roundCrumbFace(ctx: CanvasRenderingContext2D, s: number, crumb: string, crust: string, seed: number, ring = 0.035) {
  ctx.fillStyle = crust;
  ctx.fillRect(0, 0, s, s);
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * (0.5 - ring));
  g.addColorStop(0, '#fff3d6');
  g.addColorStop(0.75, crumb);
  g.addColorStop(1, '#efd6a2');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * (0.5 - ring), 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * (0.5 - ring), 0, Math.PI * 2);
  ctx.clip();
  speckle(ctx, 0, 0, s, s, '#e6cc98', 700, [0.4, 1.0], [0.3, 0.7], seed + 1);
  paintCrumb(ctx, 0, 0, s, s, { seed, count: 170, rmin: s * 0.004, rmax: s * 0.016, hole: '#d8ba82', lip: '#fff8e4', alpha: [0.4, 0.75] });
  ctx.restore();
}

const bunFaceMat = lazy(() =>
  foodMat({
    color: '#ffffff',
    map: drawTex('bun-face', 256, 256, (ctx, s) => roundCrumbFace(ctx, s, BUN.flesh, '#d39a52', 23)),
    roughness: 0.85,
    flesh: BUN.flesh,
    cookColor: '#c98a42',
  }),
);
const bunFlesh = lazy(() =>
  foodMat({ color: '#ffffff', map: crumbTileTexture('bun-crumb-tile', BUN.flesh, '#dcc08a', '#fffaea', 9, 0.8), roughness: 0.85, flesh: BUN.flesh, cookColor: '#c98a42' }),
);

function sesameSeeds(r: Rng, pr: ArcProfile, yMin: number): THREE.BufferGeometry {
  const base = seedGeometry(6, 4, 0.45);
  const mats: THREE.Matrix4[] = [];
  const placed: THREE.Vector3[] = [];
  // find v range where y > yMin
  let vMin = 0;
  for (let i = 0; i < pr.y.length; i++)
    if (pr.y[i] > yMin) {
      vMin = pr.v[i];
      break;
    }
  for (let tries = 0; tries < 400 && mats.length < 30; tries++) {
    // area-uniform on the dome: favour larger radii
    const v = lerp(vMin, 0.985, r.next());
    const phi = r.range(0, Math.PI * 2);
    const rad = apAt(pr.r, v), y = apAt(pr.y, v);
    if (r.next() > rad / 0.05 + 0.15) continue;
    const p = new THREE.Vector3(rad * Math.sin(phi), y, rad * Math.cos(phi));
    if (placed.some((q) => q.distanceTo(p) < 0.0072)) continue;
    const nr = apAt(pr.nr, v), ny = apAt(pr.ny, v);
    const n = new THREE.Vector3(nr * Math.sin(phi), ny, nr * Math.cos(phi)).normalize();
    placed.push(p);
    const t = randomTangent(n, r);
    mats.push(frameMatrix(p.clone().addScaledVector(n, 0.00035), n, t, [0.0025 * r.range(0.9, 1.1), 0.00105, 0.0015]));
  }
  return scatterMerge(base, mats);
}

function buildBun(r: Rng): THREE.Object3D {
  const pr = bunProf();
  const body = mesh(latheArc(profilePoints(pr), 48), bunMat(), { skin: true, name: 'bun' });
  const seeds = mesh(sesameSeeds(r, pr, 0.036), sesameMat(), { name: 'sesame' });
  const g = group(body, seeds);
  g.scale.set(r.range(0.98, 1.02), r.range(0.96, 1.04), r.range(0.98, 1.02));
  return sitOnGround(g);
}

/** Split an arc profile at height yc: bottom part (with the cut point) and top part. */
function splitProfile(pr: ArcProfile, yc: number) {
  const pts = profilePoints(pr);
  let k = pts.findIndex((p) => p.y > yc);
  if (k <= 0) k = 1;
  const a = pts[k - 1], b = pts[k];
  const t = (yc - a.y) / Math.max(1e-9, b.y - a.y);
  const cut = { r: lerp(a.r, b.r, t), y: yc, v: lerp(a.v, b.v, t) };
  return { bottom: [...pts.slice(0, k), cut], top: [cut, ...pts.slice(k)], cutR: cut.r };
}

function bunHalves(r: Rng): THREE.Object3D {
  const pr = bunProf();
  const { bottom, top, cutR } = splitProfile(pr, BUN_CUT);
  // bottom heel: cut face up
  const heel = new THREE.Group();
  heel.add(mesh(latheArc(bottom, 48), bunMat(), { skin: true }));
  const f1 = new THREE.CircleGeometry(cutR, 48);
  f1.rotateX(-Math.PI / 2);
  f1.translate(0, BUN_CUT, 0);
  heel.add(mesh(f1, bunFaceMat()));
  heel.userData.bunPart = 'bottom';
  // crown: dome up, cut face down
  const crown = new THREE.Group();
  crown.add(mesh(latheArc(top, 48), bunMat(), { skin: true }));
  const f2 = new THREE.CircleGeometry(cutR, 48);
  f2.rotateX(Math.PI / 2);
  f2.translate(0, BUN_CUT, 0);
  crown.add(mesh(f2, bunFaceMat()));
  crown.add(mesh(sesameSeeds(r, pr, 0.036), sesameMat()));
  crown.position.y = -BUN_CUT + 0.0005;
  crown.userData.bunPart = 'top';
  const hw = new THREE.Group();
  hw.add(heel);
  hw.position.set(-0.058, 0, 0.004);
  const cw = new THREE.Group();
  cw.add(crown);
  cw.position.set(0.058, 0, -0.004);
  cw.rotation.y = r.range(-0.4, 0.4);
  return sitOnGround(group(hw, cw));
}

// =============================================================================================
// Hot dog bun: long soft bun with pale sides and a split on top; halved = opened bun
// =============================================================================================

const HOTDOG = getDef('hotdog-bun').colors;
const HOTDOG_HALF: [number, number][] = [
  [0, 0],
  [0.015, 0],
  [0.0235, 0.0018],
  [0.0278, 0.0075],
  [0.0293, 0.017],
  [0.0287, 0.027],
  [0.0255, 0.0355],
  [0.018, 0.0423],
  [0.0095, 0.0454],
  [0, 0.046],
];
const HD_H = 0.046;
const HD_ANCHOR = 0.016;
const HD_HALFLEN = 0.083;
const hdOutline = lazy(() => makeOutline(symmetric(HOTDOG_HALF), 44));
const hdHalfOutline = lazy(() => makeOutline(HOTDOG_HALF, 22, false));
const hdStations = lazy(() => makeStations(HD_HALFLEN, 0.023, 2.3, 2.0, 48));

const HD_RAMP: [number, RGB][] = [
  [0, rgb('#d4a86c')],
  [0.25, rgb('#ead0a0')],
  [0.45, rgb('#f3ddb0')],
  [0.6, rgb('#ecc283')],
  [0.75, rgb('#e0a252')],
  [1, rgb('#d38a3a')],
];

const hdSplit = (a: number, x: number) => Math.exp(-((a / 0.0024) ** 2)) * (1 - sstep(0.05, 0.068, Math.abs(x)));

const hotdogTex = lazy(() => {
  const ol = hdOutline(), st = hdStations();
  const P = ol.perimeter;
  const crumb = rgb('#f5e2b8'), lip = rgb('#c27d34');
  return pixelTex(
    'hotdog-crust',
    256,
    512,
    (u, v, col, b) => {
      const x = stationX(st, v);
      const ny = olAt(ol.nb, u);
      ramp(col, HD_RAMP, (ny + 1) * 0.5);
      const n1 = tfbm(u, v, 8, 12, 31, 4);
      mulc(col, 1 + 0.07 * n1 + 0.02 * tnoise(u, v, 64, 96, 32));
      // the ends brown a little more
      mixc(col, rgb('#cf8a3c'), sstep(0.06, 0.082, Math.abs(x)) * 0.5 * sstep(-0.3, 0.4, ny));
      const a = (u - 0.5) * P;
      const sp = hdSplit(a, x);
      mixc(col, lip, sstep(0.05, 0.4, sp) * 0.35);
      mixc(col, crumb, sstep(0.5, 0.85, sp));
      b[0] = 0.5 + 0.08 * n1 - 0.4 * sp;
    },
    { bump: true },
  );
});

const hotdogMat = lazy(() => {
  const t = hotdogTex();
  return foodMat({ color: '#ffffff', map: t.map, bumpMap: t.bump, bumpScale: 1.5, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4, flesh: HOTDOG.flesh, cookColor: HOTDOG.cooked });
});

const hotdogFaceMat = lazy(() => {
  const st = hdStations();
  const tex = drawTex('hotdog-face', 512, 160, (ctx, w, h) => {
    ctx.fillStyle = '#d9a35e';
    ctx.fillRect(0, 0, w, h);
    // the face silhouette (planar uv: x across the length, y up) with a thin crust edge
    const X = (x: number) => ((x + HD_HALFLEN) / (2 * HD_HALFLEN)) * w;
    const Y = (y: number) => (1 - y / HD_H) * h;
    ctx.beginPath();
    for (let j = 0; j <= st.nv; j++) {
      const s = Math.max(0, st.s[j] - 0.06);
      const yt = HD_ANCHOR + (HD_H - 0.0015 - HD_ANCHOR) * s;
      if (j === 0) ctx.moveTo(X(st.x[j] * 0.97), Y(yt));
      else ctx.lineTo(X(st.x[j] * 0.97), Y(yt));
    }
    for (let j = st.nv; j >= 0; j--) {
      const s = Math.max(0, st.s[j] - 0.06);
      ctx.lineTo(X(st.x[j] * 0.97), Y(HD_ANCHOR - (HD_ANCHOR - 0.0015) * s));
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f2dcae');
    g.addColorStop(0.5, '#fbeccb');
    g.addColorStop(1, '#f0d7a6');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    speckle(ctx, 0, 0, w, h, '#e3c894', 700, [0.4, 1.0], [0.3, 0.7], 51);
    paintCrumb(ctx, 0, 0, w, h, { seed: 52, count: 160, rmin: 1.5, rmax: 6, hole: '#d9bb83', lip: '#fff8e2', alpha: [0.4, 0.75] });
    ctx.restore();
  });
  return foodMat({ color: '#ffffff', map: tex, roughness: 0.85, flesh: HOTDOG.flesh, cookColor: '#c98a42' });
});

function buildHotdogBun(r: Rng): THREE.Object3D {
  const ol = hdOutline(), st = hdStations();
  const P = ol.perimeter;
  const seed = r.range(0, 40);
  const geo = tubeGeometry(ol, st, {
    anchor: HD_ANCHOR,
    disp: (u, x) => -0.0034 * hdSplit((u - 0.5) * P, x),
    warp: (p) => {
      p.y += fbm3(p.x * 30 + seed, p.y * 30, p.z * 30, 2) * 0.0007 * sstep(0.01, 0.04, p.y);
    },
  });
  const g = group(mesh(geo, hotdogMat(), { skin: true, name: 'hotdog-bun' }));
  g.scale.setScalar(r.range(0.98, 1.02));
  return sitOnGround(g);
}

/** One half (the +z side) of a hot dog bun split from the top: body + flat cut face (z = 0). */
function hotdogHalfGroup(): THREE.Group {
  const ol = hdHalfOutline(), st = hdStations();
  const body = tubeGeometry(ol, st, { anchor: HD_ANCHOR });
  // map u onto the whole bun's texture (first half of the full outline)
  const uv = body.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5);
  // cut face strip in the z = 0 plane
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= st.nv; j++) {
    const s = st.s[j], x = st.x[j];
    const yb = HD_ANCHOR * (1 - s), yt = HD_ANCHOR + (HD_H - HD_ANCHOR) * s;
    pos.push(x, yb, 0, x, yt, 0);
    uvs.push((x + HD_HALFLEN) / (2 * HD_HALFLEN), yb / HD_H, (x + HD_HALFLEN) / (2 * HD_HALFLEN), yt / HD_H);
    if (j < st.nv) {
      const A = j * 2, B = A + 1, C = A + 2, D = A + 3;
      idx.push(A, B, C, B, D, C);
    }
  }
  const face = new THREE.BufferGeometry();
  face.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  face.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  face.setIndex(idx);
  face.computeVertexNormals();
  const g = new THREE.Group();
  g.add(mesh(body, hotdogMat(), { skin: true }), mesh(face, hotdogFaceMat()));
  return g;
}

function hotdogHalves(r: Rng): THREE.Object3D {
  const proto = hotdogHalfGroup();
  const open = 0.5 + r.range(-0.05, 0.05);
  const hinge = 0.008;
  const out = new THREE.Group();
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.y = hinge;
    const half = new THREE.Group();
    for (const c of proto.children) {
      const m = c as THREE.Mesh;
      const geo = side === 1 ? m.geometry : mirrorZ(m.geometry);
      half.add(mesh(geo, m.material as THREE.Material, { skin: m.userData.part === 'skin' }));
    }
    half.position.y = -hinge;
    pivot.add(half);
    pivot.rotation.x = side * open;
    pivot.position.z = side * 0.003;
    out.add(pivot);
  }
  return sitOnGround(out);
}

// =============================================================================================
// Baguette: long crusty stick with diagonal scores (grignes) and raised ears
// =============================================================================================

const BAGUETTE = getDef('baguette').colors;
const BAG_HALF: [number, number][] = [
  [0, 0],
  [0.013, 0.0004],
  [0.0228, 0.0038],
  [0.0288, 0.0115],
  [0.0308, 0.0215],
  [0.0292, 0.0318],
  [0.0232, 0.0412],
  [0.0128, 0.0472],
  [0, 0.0492],
];
const BAG_HALFLEN = 0.158;
const BAG_ANCHOR = 0.021;
const bagOutline = lazy(() => makeOutline(symmetric(BAG_HALF), 40));
const BAG_M = 3.4, BAG_K = 1.65;
const bagStations = lazy(() => makeStations(BAG_HALFLEN, 0.025, BAG_M, BAG_K, 76));

const BAG_SC_X = [-0.1, -0.05, 0, 0.05, 0.1];
const BAG_SC_A = [0.0025, -0.002, 0.0025, -0.002, 0.0025];
const BAG_B = 0.2;
const BAG_CB = Math.cos(BAG_B), BAG_SB = Math.sin(BAG_B);
const BAG_LK = 0.034, BAG_W = 0.0054;
function bagScore(a: number, x: number) {
  let g = 0, e = 0;
  for (let k = 0; k < BAG_SC_X.length; k++) {
    const dx = x - BAG_SC_X[k], da = a - BAG_SC_A[k];
    const along = dx * BAG_CB + da * BAG_SB;
    if (Math.abs(along) > BAG_LK) continue;
    const perp = -dx * BAG_SB + da * BAG_CB;
    const q = along / BAG_LK;
    const lens = Math.sqrt(Math.max(0, 1 - q * q));
    const w = BAG_W * (0.2 + 0.8 * lens);
    const t = perp / w;
    if (t > -1 && t < 1) {
      const z = 1 - t * t;
      g = Math.max(g, z * z * Math.sqrt(lens));
    }
    const te = (perp + w * 1.05) / (BAG_W * 0.55);
    e = Math.max(e, Math.exp(-te * te) * lens);
  }
  scoreOut.g = g;
  scoreOut.e = e;
  return scoreOut;
}

const BAG_RAMP: [number, RGB][] = [
  [0, rgb('#cfa266')],
  [0.3, rgb('#dcaa62')],
  [0.5, rgb('#d9a056')],
  [0.7, rgb('#cc8a41')],
  [1, rgb('#bd7432')],
];

const baguetteTex = lazy(() => {
  const ol = bagOutline(), st = bagStations();
  const P = ol.perimeter;
  const cream = rgb('#f1d49c'), deep = rgb('#e6bd78'), ear = rgb('#94531f'), dust = rgb('#efe6d4');
  return pixelTex(
    'baguette-crust',
    256,
    768,
    (u, v, col, b) => {
      const x = stationX(st, v);
      const ny = olAt(ol.nb, u);
      ramp(col, BAG_RAMP, (ny + 1) * 0.5);
      const n1 = tfbm(u, v, 6, 20, 41, 4);
      const n2 = tfbm(u, v, 24, 80, 42, 3);
      mulc(col, 1 + 0.09 * n1 - (n2 > 0.15 ? (n2 - 0.15) * 0.4 : 0));
      // the tips get darker & crispier
      mixc(col, rgb('#a9652b'), sstep(0.12, 0.157, Math.abs(x)) * 0.45);
      // a little flour on the underside
      mixc(col, dust, sstep(-0.3, -0.85, ny) * 0.35 * (0.5 + 0.5 * n1));
      const sc = bagScore((u - 0.5) * P, x);
      const tg = sstep(0.03, 0.4, sc.g);
      mixc(col, ear, sc.e * 0.6 * (1 - tg));
      mixc(col, cream, tg * 0.95);
      mixc(col, deep, sstep(0.55, 1, sc.g) * 0.45);
      b[0] = 0.55 + 0.08 * n1 + 0.06 * n2 - 0.4 * sc.g + 0.18 * sc.e;
    },
    {
      bump: true,
      post: (ctx, w, h) => speckle(ctx, 0, 0, w, h, '#fbf6ea', 500, [0.4, 1.0], [0.2, 0.6], 43, (px) => Math.abs(px / w - 0.5) > 0.3),
    },
  );
});

const baguetteMat = lazy(() => {
  const t = baguetteTex();
  return foodMat({ color: '#ffffff', map: t.map, bumpMap: t.bump, bumpScale: 3.5, roughness: 0.58, flesh: BAGUETTE.flesh, cookColor: BAGUETTE.cooked, name: 'baguette-crust' });
});
const baguetteSkin = lazy(() => {
  const t = crustTile('baguette-crust-tile', '#d29447', '#b06c2c', 12);
  return foodMat({ color: '#ffffff', map: t.map, bumpMap: t.bump, bumpScale: 1.5, roughness: 0.58, flesh: BAGUETTE.flesh, cookColor: BAGUETTE.cooked });
});
const baguetteFlesh = lazy(() =>
  foodMat({ color: '#ffffff', map: crumbTileTexture('baguette-crumb-tile', BAGUETTE.flesh, '#cfac70', '#fff6dc', 6, 1.3), roughness: 0.85, flesh: BAGUETTE.flesh, cookColor: '#c98a42' }),
);

const baguetteProfile = lazy((): Profile => {
  const pts: Profile = [];
  const R = Math.sqrt(0.0306 * 0.0246);
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const xn = -Math.cos((Math.PI * i) / n);
    const s = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(xn), BAG_M)), 1 / BAG_K);
    pts.push([Math.max(0.0005, R * s), (xn + 1) * BAG_HALFLEN]);
  }
  return pts;
});

function baguetteSection(ctx: CanvasRenderingContext2D, s: number) {
  const c = s / 2;
  ctx.fillStyle = '#ae6a2e';
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
  // irregular crust ring
  const r = rng(61);
  ctx.beginPath();
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = c * (0.88 + 0.025 * Math.sin(a * 5 + 1) + 0.015 * r.range(-1, 1));
    const x = c + Math.cos(a) * rr, y = c + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#d39d58';
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, c * 0.84, 0, Math.PI * 2);
  ctx.clip();
  const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.84);
  g.addColorStop(0, '#fbeccb');
  g.addColorStop(0.8, BAGUETTE.flesh);
  g.addColorStop(1, '#ecd09c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  speckle(ctx, 0, 0, s, s, '#e2c590', 600, [0.4, 1.1], [0.3, 0.7], 62);
  // open crumb: some big irregular holes
  paintCrumb(ctx, 0, 0, s, s, { seed: 63, count: 60, rmin: s * 0.01, rmax: s * 0.06, hole: '#c9a466', lip: '#fff6dc', bias: 1.8, alpha: [0.55, 0.9] });
  paintCrumb(ctx, 0, 0, s, s, { seed: 64, count: 120, rmin: s * 0.004, rmax: s * 0.014, hole: '#d6b67c', lip: '#fff6dc', alpha: [0.4, 0.7] });
  ctx.restore();
}

function buildBaguette(r: Rng): THREE.Object3D {
  const ol = bagOutline(), st = bagStations();
  const P = ol.perimeter;
  const bend = r.range(0.003, 0.007) * r.sign();
  const seed = r.range(0, 30);
  const geo = tubeGeometry(ol, st, {
    anchor: BAG_ANCHOR,
    disp: (u, x) => {
      const sc = bagScore((u - 0.5) * P, x);
      return -0.0042 * sc.g + 0.0026 * sc.e;
    },
    warp: (p, _u, x) => {
      const xn = x / BAG_HALFLEN;
      p.z += bend * (1 - xn * xn);
      p.y += 0.0035 * xn * xn * xn * xn;
      const n = fbm3(p.x * 25 + seed, p.y * 25, p.z * 25, 2);
      p.y += n * 0.0009 * sstep(0.005, 0.03, p.y);
    },
  });
  return sitOnGround(group(mesh(geo, baguetteMat(), { skin: true, name: 'baguette' })));
}

// =============================================================================================
// Tortilla: thin flour tortilla with toasty spots
// =============================================================================================

const TORT = getDef('tortilla').colors;
const TORT_R = 0.1;
const TORT_T = 0.0032;
const tortillaProfile = lazy((): Profile => {
  const R = TORT_R, T = TORT_T;
  const radii = [0.0001, 0.02, 0.04, 0.058, 0.073, 0.084, 0.092, 0.0965];
  const p: Profile = radii.map((r) => [r, 0] as [number, number]);
  // rounded rim (half circle of radius T/2 centred at R - T/2)
  const rc = R - T / 2;
  for (let k = 1; k < 6; k++) {
    const a = -Math.PI / 2 + (k / 6) * Math.PI;
    p.push([rc + Math.cos(a) * (T / 2) * 1.2, T / 2 + Math.sin(a) * (T / 2)]);
  }
  for (let i = radii.length - 1; i >= 0; i--) p.push([radii[i], T]);
  return p;
});

const tortillaTex = lazy(() =>
  drawTex('tortilla-top', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = TORT.skin;
    ctx.fillRect(0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const u = x / w, v = y / h;
        const n = tfbm(u, v, 6, 6, 71, 4);
        const rr = Math.hypot(u - 0.5, v - 0.5) * 2;
        const k = 1 + 0.05 * n - sstep(0.85, 1.0, rr) * 0.06;
        const i = (y * w + x) * 4;
        d[i] *= k;
        d[i + 1] *= k;
        d[i + 2] *= k * 0.98;
      }
    ctx.putImageData(img, 0, 0);
    const r = rng(72);
    // toasty blotches: clusters of soft spots with darker cores
    for (let i = 0; i < 70; i++) {
      const cx = r.range(0.04, 0.96) * w, cy = r.range(0.04, 0.96) * h;
      const big = r.next() < 0.3;
      const sz = big ? r.range(10, 22) : r.range(3, 9);
      const n = big ? r.int(4, 8) : r.int(1, 3);
      for (let k = 0; k < n; k++) {
        const ox = r.range(-1, 1) * sz * 0.9, oy = r.range(-1, 1) * sz * 0.9;
        const s2 = sz * r.range(0.4, 0.9);
        softEllipse(ctx, cx + ox, cy + oy, s2, s2 * r.range(0.6, 1), r.range(0, 3), '#d2a25e', big ? 0.5 : 0.55, 0.2);
        softEllipse(ctx, cx + ox, cy + oy, s2 * 0.5, s2 * 0.38, r.range(0, 3), r.next() < 0.5 ? '#b37b3a' : '#98622c', r.range(0.45, 0.85), 0.35);
      }
    }
    speckle(ctx, 0, 0, w, h, '#8a5a2c', 260, [0.6, 1.8], [0.3, 0.8], 73);
    speckle(ctx, 0, 0, w, h, '#fffaf0', 1600, [0.5, 1.3], [0.25, 0.7], 74);
  }),
);

const tortillaMat = lazy(() =>
  foodMat({ color: '#ffffff', map: tortillaTex(), bumpMap: tortillaTex(), bumpScale: 0.6, roughness: 0.78, sheen: 0.25, sheenColor: '#fff6e0', sheenRoughness: 0.8, flesh: TORT.flesh, cookColor: TORT.cooked, name: 'tortilla' }),
);
const tortillaFlesh = lazy(() => foodMat({ color: TORT.flesh, roughness: 0.8, flesh: TORT.flesh, cookColor: TORT.cooked }));

function buildTortilla(r: Rng): THREE.Object3D {
  const prof = tortillaProfile();
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 72);
  const seed = r.range(0, 50);
  const ph = r.range(0, 6);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const rr = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    // irregular edge (pure function of the angle)
    const edge = 1 + 0.012 * Math.sin(a * 3 + ph) + 0.008 * Math.sin(a * 7 + ph * 2) + 0.006 * fbm3(Math.cos(a) * 3 + seed, Math.sin(a) * 3, 0, 2);
    const k = rr > 0.06 ? lerp(1, edge, sstep(0.06, 0.098, rr)) : 1;
    // soft waves, stronger towards the rim
    const t = rr / TORT_R;
    const wave = fbm3(x * 14 + seed, z * 14 - seed, 0.5, 2) * 0.0035 * t * t + Math.sin(a * 3 + ph) * 0.0018 * t * t * t;
    pos.setXYZ(i, x * k, y + wave, z * k);
  }
  smoothNormals(g);
  planarUV(g, TORT_R * 2.1);
  return sitOnGround(group(mesh(g, tortillaMat(), { skin: true, name: 'tortilla' })));
}

function tortillaSectionV(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = TORT.flesh;
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(176,122,58,0.55)');
  g.addColorStop(0.25, 'rgba(176,122,58,0)');
  g.addColorStop(0.75, 'rgba(176,122,58,0)');
  g.addColorStop(1, 'rgba(176,122,58,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// =============================================================================================
// Croissant: crescent of puffy rolled bands, glossy and flaky
// =============================================================================================

const CROISSANT = getDef('croissant').colors;
const CR_NU = 30;
const CR_NB = 84;
const CR_CAP = 4;
const CR_RM = 0.026, CR_RT = 0.0062;
const CR_TOP = 0.98, CR_BOT = 0.58;
const CR_BANDS = 7;
const CR_SPREAD = 2.95;
const CR_RC = 0.056;

function crPhase(u: number, t: number): number {
  const c = 2 * t - 1;
  const ph = CR_BANDS / 2 + (CR_BANDS / 2) * Math.sign(c) * Math.pow(Math.abs(c), 1.3);
  const w = Math.max(-1, Math.min(1, c * 2.6));
  return ph + w * (u - 0.5) * 1.1;
}
function crRadius(t: number): number {
  return CR_RT + (CR_RM - CR_RT) * Math.pow(Math.sin(Math.PI * clamp01(t)), 0.9);
}
function crBand(u: number, t: number): number {
  const ph = crPhase(u, t);
  const f = ph - Math.floor(ph);
  return Math.pow(Math.sin(Math.PI * f), 0.6);
}

interface CrRing {
  c: THREE.Vector3;
  side: THREE.Vector3;
  up: THREE.Vector3;
  rad: number;
  scale: number;
  t: number;
  v: number;
}

function croissantRings(): CrRing[] {
  const centre = (t: number) => {
    const a = (t - 0.5) * CR_SPREAD;
    const rc = CR_RC * (1 - 0.16 * Math.pow(2 * t - 1, 4));
    const rad = crRadius(t);
    return new THREE.Vector3(rc * Math.sin(a), rad * CR_BOT, rc * Math.cos(a));
  };
  const rings: CrRing[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const frame = (t: number) => {
    const T = centre(Math.min(1, t + 0.001)).sub(centre(Math.max(0, t - 0.001))).normalize();
    const side = new THREE.Vector3().crossVectors(T, up).normalize();
    const u2 = new THREE.Vector3().crossVectors(side, T).normalize();
    return { T, side, up: u2 };
  };
  const f0 = frame(0), f1 = frame(1);
  for (let k = CR_CAP; k >= 1; k--) {
    const a = (k / CR_CAP) * (Math.PI / 2);
    rings.push({ c: centre(0).addScaledVector(f0.T, -Math.sin(a) * CR_RT * 1.1), side: f0.side, up: f0.up, rad: CR_RT, scale: Math.max(0.02, Math.cos(a)), t: 0, v: 0 });
  }
  for (let j = 0; j <= CR_NB; j++) {
    const t = j / CR_NB;
    const f = frame(t);
    rings.push({ c: centre(t), side: f.side, up: f.up, rad: crRadius(t), scale: 1, t, v: t });
  }
  for (let k = 1; k <= CR_CAP; k++) {
    const a = (k / CR_CAP) * (Math.PI / 2);
    rings.push({ c: centre(1).addScaledVector(f1.T, Math.sin(a) * CR_RT * 1.1), side: f1.side, up: f1.up, rad: CR_RT, scale: Math.max(0.02, Math.cos(a)), t: 1, v: 1 });
  }
  return rings;
}

/** Croissant surface; optional clamp of y for split halves. */
function croissantGeometry(seed: number, clampY?: { y: number; keep: 'bottom' | 'top' }): THREE.BufferGeometry {
  const rings = croissantRings();
  const nv = rings.length - 1;
  const g = paramSurface(CR_NU, nv, (u, _v, out, _i, j) => {
    const R = rings[j];
    const th = u * Math.PI * 2;
    const band = crBand(u, R.t);
    const flake = 0.012 * Math.sin(crPhase(u, R.t) * Math.PI * 2 * 4);
    const m = (0.84 + 0.16 * band + flake * band) * R.scale;
    const cs = -Math.cos(th);
    const vf = cs < 0 ? CR_BOT : CR_TOP;
    out.copy(R.c).addScaledVector(R.side, Math.sin(th) * R.rad * m).addScaledVector(R.up, cs * R.rad * vf * m);
    const n = fbm3(out.x * 60 + seed, out.y * 60, out.z * 60, 2);
    out.y += n * 0.0012 * sstep(0.004, 0.02, out.y);
  });
  // texture v = t along the croissant (caps clamp to the ends)
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const row = CR_NU + 1;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= CR_NU; i++) uv.setY(j * row + i, rings[j].v);
  if (clampY) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const clamped = new Uint8Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (clampY.keep === 'bottom' ? y > clampY.y : y < clampY.y) {
        pos.setY(i, clampY.y);
        clamped[i] = 1;
      }
    }
    // drop triangles lying entirely in the cut plane
    const idx = g.index!;
    const keep: number[] = [];
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      if (clamped[a] && clamped[b] && clamped[c]) continue;
      keep.push(a, b, c);
    }
    g.setIndex(keep);
    smoothNormals(g);
  }
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

const croissantTex = lazy(() => {
  const crest = rgb('#c46f26'), crestTop = rgb('#a9581b'), groove = rgb('#f0bf6c'), grooveDeep = rgb('#f6d58f'), under = rgb('#dda457');
  return pixelTex(
    'croissant',
    256,
    512,
    (u, v, col, b) => {
      const band = crBand(u, v);
      const top = 0.5 + 0.5 * Math.cos((u - 0.5) * Math.PI * 2); // 1 on top, 0 underneath
      setc(col, groove);
      mixc(col, crest, sstep(0.15, 0.75, band));
      mixc(col, crestTop, sstep(0.55, 1, band) * sstep(0.45, 0.95, top) * 0.75);
      mixc(col, grooveDeep, sstep(0.25, 0, band) * 0.7);
      mixc(col, under, sstep(0.35, 0.05, top) * 0.55);
      // flaky streaks running along each band
      const ph = crPhase(u, v);
      const fl = Math.sin(ph * Math.PI * 2 * 5 + tfbm(u, v, 8, 16, 81, 2) * 3);
      mulc(col, 1 + 0.06 * fl + 0.06 * tfbm(u, v, 10, 24, 82, 3));
      // tips a bit darker
      mixc(col, rgb('#a65a22'), sstep(0.12, 0.0, Math.min(v, 1 - v)) * 0.35);
      b[0] = 0.25 + 0.5 * band + 0.06 * fl + 0.05 * tnoise(u, v, 64, 128, 83);
    },
    { bump: true },
  );
});

const croissantMat = lazy(() => {
  const t = croissantTex();
  return foodMat({ color: '#ffffff', map: t.map, bumpMap: t.bump, bumpScale: 2.5, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3, flesh: CROISSANT.flesh, cookColor: CROISSANT.cooked, name: 'croissant' });
});

function croissantCrumb(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = CROISSANT.flesh;
  ctx.fillRect(0, 0, w, h);
  // honeycomb layers: wavy bands with open cells
  const r = rng(91);
  for (let i = 0; i < 26; i++) {
    const y = (i / 26) * h + r.range(-2, 2);
    ctx.strokeStyle = r.next() < 0.5 ? 'rgba(214,170,98,0.55)' : 'rgba(255,246,220,0.6)';
    ctx.lineWidth = r.range(1, 2.5);
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const yy = y + Math.sin(x * 0.03 + i) * 3 + Math.sin(x * 0.11 + i * 2) * 1.5;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  paintCrumb(ctx, 0, 0, w, h, { seed: 92, count: 90, rmin: 2, rmax: 9, hole: '#d1a560', lip: '#fff2d2', squash: 0.55, alpha: [0.5, 0.85] });
}

const croissantFlesh = lazy(() =>
  foodMat({ color: '#ffffff', map: drawTex('croissant-crumb', 256, 256, croissantCrumb, { wrap: true }), roughness: 0.75, flesh: CROISSANT.flesh, cookColor: '#c98a42' }),
);

function buildCroissant(r: Rng): THREE.Object3D {
  const g = group(mesh(croissantGeometry(r.range(0, 40)), croissantMat(), { skin: true, name: 'croissant' }));
  g.scale.setScalar(r.range(0.97, 1.03));
  return sitOnGround(g);
}

/** Horizontal cut face of the croissant at height y: strip between the two crossings of each ring. */
function croissantCutFace(geo: THREE.BufferGeometry, y: number): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const rings = croissantRings();
  const row = CR_NU + 1;
  const left: (THREE.Vector3 | null)[] = [];
  const right: (THREE.Vector3 | null)[] = [];
  const P = (k: number) => new THREE.Vector3(pos.getX(k), pos.getY(k), pos.getZ(k));
  for (let j = 0; j < rings.length; j++) {
    let a: THREE.Vector3 | null = null, b: THREE.Vector3 | null = null;
    for (let i = 0; i < CR_NU; i++) {
      const p0 = P(j * row + i), p1 = P(j * row + i + 1);
      if ((p0.y - y) * (p1.y - y) < 0) {
        const t = (y - p0.y) / (p1.y - p0.y);
        const q = p0.lerp(p1, t);
        if (i < CR_NU / 2) a = q;
        else b = q;
      }
    }
    left.push(a);
    right.push(b);
  }
  const verts: number[] = [];
  for (let j = 0; j < rings.length - 1; j++) {
    const a0 = left[j], b0 = right[j], a1 = left[j + 1], b1 = right[j + 1];
    if (!a0 || !b0 || !a1 || !b1) continue;
    verts.push(a0.x, y, a0.z, b0.x, y, b0.z, a1.x, y, a1.z, b0.x, y, b0.z, b1.x, y, b1.z, a1.x, y, a1.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  // make every triangle face up
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let t = 0; t < p.count; t += 3) {
    const ax = p.getX(t), az = p.getZ(t), bx = p.getX(t + 1), bz = p.getZ(t + 1), cx = p.getX(t + 2), cz = p.getZ(t + 2);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (ny < 0) {
      p.setXYZ(t + 1, cx, y, cz);
      p.setXYZ(t + 2, bx, y, bz);
    }
  }
  planarUV(g, 0.06);
  g.computeVertexNormals();
  return g;
}

function croissantHalves(r: Rng): THREE.Object3D {
  const seed = r.range(0, 40);
  const yc = CR_RM * CR_BOT * 0.95 + 0.001;
  const bottomGeo = croissantGeometry(seed, { y: yc, keep: 'bottom' });
  const bottom = new THREE.Group();
  bottom.add(mesh(bottomGeo, croissantMat(), { skin: true }));
  const full = croissantGeometry(seed);
  bottom.add(mesh(croissantCutFace(full, yc), croissantFlesh()));
  bottom.userData.bunPart = 'bottom';
  const top = new THREE.Group();
  const tm = mesh(croissantGeometry(seed, { y: yc, keep: 'top' }), croissantMat(), { skin: true });
  tm.position.y = -yc + 0.0004;
  top.add(tm);
  top.userData.bunPart = 'top';
  const bw = new THREE.Group();
  bw.add(bottom);
  bw.position.set(0, 0, 0.026);
  const tw = new THREE.Group();
  tw.add(top);
  tw.position.set(0.012, 0, -0.04);
  tw.rotation.y = r.range(-0.25, 0.25);
  return sitOnGround(group(bw, tw));
}

// =============================================================================================
// Dough: soft pale ball with a floury top
// =============================================================================================

const DOUGH = getDef('dough').colors;

const doughTopTex = lazy(() =>
  drawTex('dough-top', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#efd8ae';
    ctx.fillRect(0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const u = x / w, v = y / h;
        const n = tfbm(u, v, 5, 5, 101, 4);
        const rr = Math.hypot(u - 0.5, v - 0.5) * 2;
        // flour: soft patches concentrated on the top
        const fl = sstep(0.62, 0.15, rr) * sstep(-0.25, 0.35, tfbm(u, v, 4, 4, 102, 3));
        const i = (y * w + x) * 4;
        const k = 1 + 0.035 * n;
        d[i] = lerp(d[i] * k, 253, fl * 0.85);
        d[i + 1] = lerp(d[i + 1] * k, 251, fl * 0.85);
        d[i + 2] = lerp(d[i + 2] * k, 246, fl * 0.85);
      }
    ctx.putImageData(img, 0, 0);
    speckle(ctx, 0, 0, w, h, '#ffffff', 2600, [0.6, 1.6], [0.35, 0.9], 103, (x, y) => Math.hypot(x / w - 0.5, y / h - 0.5) < 0.32);
  }),
);
const doughBumpTex = lazy(() =>
  pixelTex('dough-bump', 128, 128, (u, v, col, b) => {
    const n = tfbm(u, v, 6, 6, 104, 4);
    setc(col, [128, 128, 128]);
    b[0] = 0.5 + 0.3 * n;
  }, { bump: true, wrap: true }),
);

const doughMat = lazy(() =>
  foodMat({ color: '#ffffff', map: doughTopTex(), bumpMap: doughBumpTex().bump, bumpScale: 0.8, roughness: 0.72, sheen: 0.6, sheenColor: '#fffaf0', sheenRoughness: 0.7, flesh: DOUGH.flesh, cookColor: DOUGH.cooked, name: 'dough' }),
);
const doughSkinTex = lazy(() =>
  drawTex(
    'dough-skin',
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = DOUGH.skin;
      ctx.fillRect(0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const n = tfbm(x / w, y / h, 4, 4, 105, 4);
          const fl = sstep(0.2, 0.6, tfbm(x / w, y / h, 3, 3, 106, 3)) * 0.5;
          const i = (y * w + x) * 4;
          d[i] = lerp(d[i] * (1 + 0.03 * n), 252, fl);
          d[i + 1] = lerp(d[i + 1] * (1 + 0.03 * n), 249, fl);
          d[i + 2] = lerp(d[i + 2] * (1 + 0.03 * n), 243, fl);
        }
      ctx.putImageData(img, 0, 0);
      speckle(ctx, 0, 0, w, h, '#ffffff', 500, [0.5, 1.3], [0.3, 0.8], 107);
    },
    { wrap: true },
  ),
);
const doughSkin = lazy(() =>
  foodMat({ color: '#ffffff', map: doughSkinTex(), bumpMap: doughBumpTex().bump, bumpScale: 0.6, roughness: 0.72, sheen: 0.5, sheenColor: '#fffaf0', sheenRoughness: 0.7, flesh: DOUGH.flesh, cookColor: DOUGH.cooked }),
);
const doughFlesh = lazy(() => foodMat({ color: DOUGH.flesh, roughness: 0.7, flesh: DOUGH.flesh, cookColor: DOUGH.cooked }));

function buildDough(r: Rng): THREE.Object3D {
  const R = 0.05;
  const g = new THREE.IcosahedronGeometry(R, 4) as THREE.BufferGeometry;
  const seed = r.range(0, 40);
  const sq = r.range(0.6, 0.66);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const yb = -R * sq * 0.62;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i) * sq, z = pos.getZ(i);
    // soft flattened bottom (smooth max)
    const k = 0.006;
    const dy = y - yb;
    y = yb + 0.5 * (dy + Math.sqrt(dy * dy + k * k)) - k * 0.5;
    // spread out a little near the bottom (sagging)
    const sag = 1 + 0.08 * sstep(R * 0.1, yb, y);
    x *= sag;
    z *= sag;
    const n = fbm3(x * 30 + seed, y * 30, z * 30, 3);
    const rr = Math.hypot(x, y - yb * 0.3, z) || 1;
    x += (x / rr) * n * 0.0016;
    y += ((y - yb * 0.3) / rr) * n * 0.0016;
    z += (z / rr) * n * 0.0016;
    pos.setXYZ(i, x, y, z);
  }
  smoothNormals(g);
  planarUV(g, R * 2.3);
  return sitOnGround(group(mesh(g, doughMat(), { skin: true, name: 'dough' })));
}

// =============================================================================================
// Flour: cute paper bag with a rolled top, label, flour inside and a little puff
// =============================================================================================

const FLOUR = getDef('flour').colors;
const BAG_A = 0.05, BAG_D = 0.034, BAG_HGT = 0.118;

/** Rounded-rectangle ring (superellipse) resampled by arc length; u = 0 at the back centre, 0.5 at the front. */
function squircle(a: number, d: number, nExp: number, n: number): { x: Float64Array; z: Float64Array; nx: Float64Array; nz: Float64Array; len: number } {
  const N = 1200;
  const X: number[] = [], Z: number[] = [], L: number[] = [0];
  for (let i = 0; i <= N; i++) {
    const th = -Math.PI / 2 + (i / N) * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    X.push(a * Math.sign(c) * Math.pow(Math.abs(c), 2 / nExp));
    Z.push(d * Math.sign(s) * Math.pow(Math.abs(s), 2 / nExp));
    if (i > 0) L.push(L[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]));
  }
  const x = new Float64Array(n + 1), z = new Float64Array(n + 1), nx = new Float64Array(n + 1), nz = new Float64Array(n + 1);
  let p = 0;
  for (let i = 0; i <= n; i++) {
    const target = (L[N] * i) / n;
    while (p < N - 1 && L[p + 1] < target) p++;
    const t = clamp01((target - L[p]) / Math.max(1e-12, L[p + 1] - L[p]));
    x[i] = X[p] + (X[p + 1] - X[p]) * t;
    z[i] = Z[p] + (Z[p + 1] - Z[p]) * t;
  }
  x[n] = x[0];
  z[n] = z[0];
  for (let i = 0; i <= n; i++) {
    const i0 = i === 0 ? n - 1 : i - 1, i1 = i === n ? 1 : i + 1;
    const tx = x[i1] - x[i0], tz = z[i1] - z[i0];
    const l = Math.hypot(tx, tz) || 1;
    // ring runs back -> +x -> front -> -x: outward normal is (tz, -tx)
    nx[i] = tz / l;
    nz[i] = -tx / l;
  }
  return { x, z, nx, nz, len: L[N] };
}

const flourRing = lazy(() => squircle(BAG_A, BAG_D, 5, 64));

/** Bag body silhouette: [scale, y] from the bottom centre up to the open top. */
const FLOUR_BODY: [number, number][] = [
  [0, 0],
  [0.6, 0],
  [0.9, 0.0008],
  [0.97, 0.004],
  [1.0, 0.012],
  [1.03, 0.04],
  [1.035, 0.07],
  [1.01, 0.1],
  [0.985, BAG_HGT],
];

function drawWheat(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number, color: string, dark: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.strokeStyle = dark;
  ctx.lineWidth = len * 0.045;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, len * 0.5);
  ctx.quadraticCurveTo(len * 0.04, 0, 0, -len * 0.5);
  ctx.stroke();
  for (let k = 0; k < 6; k++) {
    const yy = -len * 0.42 + k * len * 0.105;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * len * 0.055, yy);
      ctx.rotate(s * 0.55);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, len * 0.06, len * 0.115, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = len * 0.012;
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, -len * 0.5, len * 0.05, len * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const flourBagTex = lazy(() => {
  const ring = flourRing();
  const W = 1024, H = 384;
  return pixelTex(
    'flour-bag',
    W,
    H,
    (u, v, col, b) => {
      setc(col, rgb('#f4eee2'));
      const n = tfbm(u, v, 24, 8, 111, 4);
      const fib = tnoise(u, v, 256, 24, 112);
      mulc(col, 1 + 0.025 * n + 0.012 * fib - sstep(0.25, 0, v) * 0.05);
      // creases: a few soft vertical folds + a horizontal one
      const cr = Math.abs(tnoise(u, v, 14, 3, 113));
      const crease = sstep(0.06, 0, cr) * 0.07;
      mulc(col, 1 - crease);
      b[0] = 0.5 + 0.12 * n + 0.04 * fib - crease * 3;
    },
    {
      bump: true,
      post: (ctx, w, h) => {
        void ring;
        // retro stripes near the bottom
        ctx.fillStyle = '#e8665e';
        ctx.fillRect(0, h * 0.84, w, h * 0.055);
        ctx.fillStyle = '#7fb8e0';
        ctx.fillRect(0, h * 0.915, w, h * 0.02);
        // front label (front centre at u = 0.5)
        const cx = w * 0.5, cy = h * 0.42;
        ctx.save();
        ctx.fillStyle = '#fff7e4';
        ctx.strokeStyle = '#e8665e';
        ctx.lineWidth = 5;
        const lw = w * 0.205, lh = h * 0.62, rr = 26;
        ctx.beginPath();
        ctx.roundRect(cx - lw / 2, cy - lh / 2, lw, lh, rr);
        ctx.fill();
        ctx.stroke();
        // badge
        ctx.fillStyle = '#fbe08e';
        ctx.beginPath();
        ctx.arc(cx, cy - lh * 0.13, lh * 0.27, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6;
        ctx.stroke();
        drawWheat(ctx, cx, cy - lh * 0.13, lh * 0.42, 0, '#d9a03a', '#b07a26');
        drawWheat(ctx, cx - lh * 0.12, cy - lh * 0.1, lh * 0.36, -0.38, '#e3ad48', '#b07a26');
        drawWheat(ctx, cx + lh * 0.12, cy - lh * 0.1, lh * 0.36, 0.38, '#e3ad48', '#b07a26');
        ctx.fillStyle = '#e8665e';
        ctx.font = `bold ${Math.round(lh * 0.2)}px "Trebuchet MS", "Verdana", "DejaVu Sans", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('FLOUR', cx, cy + lh * 0.3);
        ctx.restore();
      },
    },
  );
});

const flourBagMat = lazy(() => {
  const t = flourBagTex();
  return foodMat({ color: '#ffffff', map: t.map, bumpMap: t.bump, bumpScale: 1.2, roughness: 0.82, flesh: '#e6dccb', cookColor: '#c8a878', cookAmount: 0, food: false, name: 'flour-bag' });
});
const flourPowderMat = lazy(() => foodMat({ color: '#fdfbf6', roughness: 0.95, flesh: FLOUR.flesh, cookColor: FLOUR.cooked, cookAmount: 0.5, emissive: '#fffaf0', emissiveIntensity: 0.06, name: 'flour' }));
const flourPuffMat = lazy(() => foodMat({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.88, emissive: '#ffffff', emissiveIntensity: 0.12, flesh: '#ffffff', cookAmount: 0, name: 'flour-puff' }));

function buildFlour(r: Rng): THREE.Object3D {
  const ring = flourRing();
  const prof = makeOutline(FLOUR_BODY.map(([s, y]) => [s * BAG_A, y] as [number, number]), 26, false);
  const seed = r.range(0, 30);
  // body: u around the ring, v up the profile
  const body = paramSurface(64, 26, (u, _v, out, i, j) => {
    const s = prof.a[j] / BAG_A, y = prof.b[j];
    out.set(ring.x[i] * s, y, ring.z[i] * s);
    const n = fbm3(out.x * 40 + seed, out.y * 40, out.z * 40, 2) * 0.0007 * sstep(0.002, 0.01, y);
    out.x += ring.nx[i] * n;
    out.z += ring.nz[i] * n;
  });
  flipU(body);
  // rolled cuff at the top edge
  const topS = FLOUR_BODY[FLOUR_BODY.length - 1][0];
  const rt = 0.0058;
  const cuff = paramSurface(64, 12, (u, v, out, i) => {
    const ph = v * Math.PI * 2;
    const ox = ring.x[i] * topS + ring.nx[i] * rt * 0.8;
    const oz = ring.z[i] * topS + ring.nz[i] * rt * 0.8;
    const c = Math.cos(ph), s = Math.sin(ph);
    out.set(ox + ring.nx[i] * c * rt, BAG_HGT - rt * 0.4 + s * rt, oz + ring.nz[i] * c * rt);
  });
  plainUV(cuff, 0.965);
  // flour surface inside
  const fs = 0.96;
  const powder = paramSurface(64, 8, (u, v, out, i) => {
    const k = 1 - v;
    const y = BAG_HGT - 0.006 + 0.007 * (1 - k * k) + fbm3(ring.x[i] * k * 60, 0, ring.z[i] * k * 60 + seed, 2) * 0.0012 * (1 - k);
    out.set(ring.x[i] * fs * k, y, ring.z[i] * fs * k);
  }, true);
  const g = group(
    mesh(body, flourBagMat(), { name: 'flour-bag' }),
    mesh(cuff, flourBagMat(), { name: 'flour-cuff' }),
    mesh(powder, flourPowderMat(), { name: 'flour' }),
  );
  // a little puff of flour above the opening
  const puff: THREE.BufferGeometry[] = [];
  const blobs = r.int(4, 6);
  for (let k = 0; k < blobs; k++) {
    const rad = r.range(0.006, 0.011) * (k === 0 ? 1.25 : 1);
    const sg = new THREE.IcosahedronGeometry(rad, 2);
    sg.translate(r.range(-0.014, 0.014) + (k === 0 ? 0 : 0), BAG_HGT + 0.008 + r.range(0, 0.016) + (k === 0 ? 0.004 : 0), r.range(-0.01, 0.01));
    puff.push(sg);
  }
  const pg = merge(puff);
  smoothNormals(pg);
  const pm = mesh(pg, flourPuffMat(), { name: 'puff', castShadow: false });
  g.add(pm);
  g.rotation.y = r.range(-0.12, 0.12);
  return sitOnGround(g);
}

// =============================================================================================
// Rice: small cloth sack with grains at the open top; boiled -> fluffy mound of cooked rice
// =============================================================================================

const RICE = getDef('rice').colors;
const SACK_H = 0.1;
const sackRing = lazy(() => squircle(0.05, 0.043, 2.6, 56));
const SACK_BODY: [number, number][] = [
  [0, 0],
  [0.62, 0],
  [0.9, 0.0015],
  [0.99, 0.008],
  [1.05, 0.03],
  [1.06, 0.048],
  [1.0, 0.068],
  [0.9, 0.082],
  [0.86, 0.088],
  [0.9, 0.094],
  [1.0, SACK_H],
];

const sackTex = lazy(() =>
  pixelTex(
    'rice-sack',
    512,
    256,
    (u, v, col, b) => {
      // linen weave
      const fx = 220, fy = 80;
      const wx = Math.sin(u * fx * Math.PI * 2), wy = Math.sin(v * fy * Math.PI * 2);
      const weave = (wx * 0.5 + 0.5) * (wy > 0 ? 1 : 0.6) + (wy * 0.5 + 0.5) * (wx > 0 ? 0.6 : 1);
      setc(col, rgb('#ece0c4'));
      const n = tfbm(u, v, 16, 8, 121, 4);
      mulc(col, 0.93 + 0.06 * weave + 0.04 * n + 0.02 * tnoise(u, v, 128, 64, 122));
      // slubs
      const slub = tnoise(u, v, 8, 160, 123);
      mulc(col, 1 - sstep(0.6, 0.9, slub) * 0.06);
      b[0] = 0.45 + 0.25 * weave + 0.08 * n;
    },
    {
      bump: true,
      post: (ctx, w, h) => {
        // printed stamp on the front (u = 0.5)
        const cx = w * 0.5, cy = h * 0.5;
        ctx.save();
        ctx.globalAlpha = 0.88;
        ctx.strokeStyle = '#5f9fd6';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(cx, cy - h * 0.02, w * 0.1, h * 0.25, 0, 0, Math.PI * 2);
        ctx.stroke();
        // rice bowl icon
        ctx.fillStyle = '#5f9fd6';
        ctx.beginPath();
        ctx.ellipse(cx, cy - h * 0.06, w * 0.045, h * 0.055, 0, 0, Math.PI);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(cx, cy - h * 0.065, w * 0.042, h * 0.05, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#5f9fd6';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = '#e8665e';
        ctx.font = `bold ${Math.round(h * 0.13)}px "Trebuchet MS", "Verdana", "DejaVu Sans", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('RICE', cx, cy + h * 0.11);
        ctx.restore();
      },
    },
  ),
);
const sackMat = lazy(() => {
  const t = sackTex();
  return foodMat({ color: '#ffffff', map: t.map, bumpMap: t.bump, bumpScale: 1.4, roughness: 0.9, sheen: 0.4, sheenColor: '#fff8e8', sheenRoughness: 0.8, flesh: '#e2d4b4', cookAmount: 0, food: false, name: 'rice-sack' });
});
const twineMat = lazy(() => foodMat({ color: '#b98a52', roughness: 0.85, flesh: '#b98a52', cookAmount: 0, food: false, name: 'twine' }));
const riceGrainMat = lazy(() => foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.4, flesh: RICE.flesh, cookColor: RICE.cooked, name: 'rice-grains' }));
const riceBedTex = lazy(() =>
  drawTex('rice-bed', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e9e2d0';
    ctx.fillRect(0, 0, w, h);
    const r = rng(131);
    for (let i = 0; i < 900; i++) {
      const x = r.next() * w, y = r.next() * h, a = r.range(0, Math.PI);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = r.next() < 0.5 ? '#fbf9f2' : '#f3eee0';
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.2, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.ellipse(-0.6, -0.5, 2.4, 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }),
);
const riceBedMat = lazy(() => foodMat({ color: '#ffffff', map: riceBedTex(), roughness: 0.55, flesh: RICE.flesh, cookColor: RICE.cooked, name: 'rice-bed' }));

const GRAIN_COLS = ['#fdfcf7', '#f8f4e8', '#fbf8ef', '#f4efe0'].map((h) => new THREE.Color(h));

function buildRice(r: Rng): THREE.Object3D {
  const ring = sackRing();
  const prof = makeOutline(SACK_BODY.map(([s, y]) => [s * 0.05, y] as [number, number]), 30, false);
  const seed = r.range(0, 30);
  const body = paramSurface(56, 30, (u, _v, out, i, j) => {
    const s = prof.a[j] / 0.05, y = prof.b[j];
    out.set(ring.x[i] * s, y, ring.z[i] * s);
    // soft cloth folds, mostly near the neck
    const fold = Math.sin(u * Math.PI * 2 * 9 + seed) * 0.0012 * sstep(0.06, 0.09, y) + fbm3(out.x * 35 + seed, y * 35, out.z * 35, 2) * 0.0012;
    out.x += ring.nx[i] * fold;
    out.z += ring.nz[i] * fold;
  });
  flipU(body);
  // folded-down rim
  const rt = 0.005;
  const cuff = paramSurface(56, 10, (u, v, out, i) => {
    const ph = v * Math.PI * 2;
    const c = Math.cos(ph), s = Math.sin(ph);
    const w = 1 + 0.03 * Math.sin(u * Math.PI * 2 * 7 + seed);
    out.set(ring.x[i] * w + ring.nx[i] * (rt * 0.6 + c * rt), SACK_H - rt * 0.3 + s * rt * 0.9, ring.z[i] * w + ring.nz[i] * (rt * 0.6 + c * rt));
  });
  plainUV(cuff, 0.95);
  // twine around the neck
  const tw = paramSurface(56, 6, (u, v, out, i) => {
    const ph = v * Math.PI * 2;
    const s = 0.868;
    out.set(ring.x[i] * s + ring.nx[i] * (0.0012 + Math.cos(ph) * 0.0017), 0.0868 + Math.sin(ph) * 0.0017, ring.z[i] * s + ring.nz[i] * (0.0012 + Math.cos(ph) * 0.0017));
  });
  // grain bed (dome) inside the opening
  const bed = paramSurface(56, 8, (u, v, out, i) => {
    const k = 1 - v;
    out.set(ring.x[i] * 0.97 * k, SACK_H - 0.004 + 0.012 * (1 - k * k), ring.z[i] * 0.97 * k);
  }, true);
  planarUV(bed, 0.04);
  // loose 3D grains on top of the bed
  const base = seedGeometry(6, 4, 0.15);
  const mats: THREE.Matrix4[] = [];
  const cols: THREE.Color[] = [];
  for (let k = 0; k < 70; k++) {
    const [dx, dz] = r.disc();
    const kk = Math.hypot(dx, dz);
    const y = SACK_H - 0.004 + 0.012 * (1 - kk * kk) + 0.0008;
    const p = new THREE.Vector3(dx * 0.046, y, dz * 0.04);
    const n = new THREE.Vector3(dx * 0.4, 1, dz * 0.4).normalize();
    mats.push(frameMatrix(p, n, randomTangent(n, r), [0.0034 * r.range(0.9, 1.1), 0.0011, 0.0013]));
    cols.push(GRAIN_COLS[k % GRAIN_COLS.length]);
  }
  const grains = scatterMerge(base, mats, cols);
  const g = group(
    mesh(body, sackMat(), { name: 'sack' }),
    mesh(cuff, sackMat(), { name: 'sack-rim' }),
    mesh(tw, twineMat(), { name: 'twine' }),
    mesh(bed, riceBedMat(), { name: 'rice-bed' }),
    mesh(grains, riceGrainMat(), { name: 'rice-grains' }),
  );
  g.rotation.y = r.range(-0.15, 0.15);
  return sitOnGround(g);
}

const cookedRiceTex = lazy(() =>
  drawTex('rice-cooked', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#ece6d8';
    ctx.fillRect(0, 0, w, h);
    const r = rng(141);
    for (let i = 0; i < 2600; i++) {
      const x = r.next() * w, y = r.next() * h, a = r.range(0, Math.PI);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = r.next() < 0.6 ? '#fefdf9' : '#f6f2e8';
      ctx.beginPath();
      ctx.ellipse(0, 0, 5.2, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.ellipse(-0.8, -0.8, 3, 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }),
);
const cookedRiceMat = lazy(() => foodMat({ color: '#ffffff', map: cookedRiceTex(), roughness: 0.5, flesh: RICE.flesh, cookColor: RICE.cooked, name: 'rice-mound' }));
const cookedGrainMat = lazy(() => foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35, flesh: RICE.flesh, cookColor: RICE.cooked, name: 'rice-cooked-grains' }));

function cookedRice(r: Rng): THREE.Object3D {
  const R = 0.05, H = 0.05;
  const seed = r.range(0, 40);
  const dome = (k: number) => H * Math.pow(Math.max(0, 1 - k * k), 0.75);
  const mound = paramSurface(48, 14, (u, v, out) => {
    const k = 1 - v; // v = 0 rim, 1 top
    const a = u * Math.PI * 2;
    const rr = R * k * (1 + 0.04 * Math.sin(a * 3 + seed));
    let y = dome(k);
    if (k > 0.985) y = 0;
    out.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
    const n = fbm3(out.x * 70 + seed, out.y * 70, out.z * 70, 2);
    out.y += n * 0.0025 * (1 - k * 0.3) * (y > 0 ? 1 : 0);
  }, true);
  planarUV(mound, 0.05);
  // cooked grains all over the surface
  const base = seedGeometry(6, 4, 0.1);
  const mats: THREE.Matrix4[] = [];
  const cols: THREE.Color[] = [];
  const N = 190;
  for (let k = 0; k < N; k++) {
    // area-uniform on the dome (approximately)
    const kk = Math.sqrt(r.next()) * 0.98;
    const a = r.range(0, Math.PI * 2);
    const rr = R * kk * (1 + 0.04 * Math.sin(a * 3 + seed));
    const y = dome(kk);
    const slope = (H * 0.75 * 2 * kk) / R / Math.pow(Math.max(0.05, 1 - kk * kk), 0.25);
    const n = new THREE.Vector3(Math.cos(a) * slope, 1, Math.sin(a) * slope).normalize();
    const p = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr).addScaledVector(n, 0.0006);
    const t = randomTangent(n, r);
    // some grains stand a bit up out of the surface
    const tilt = r.next() < 0.3 ? r.range(0.3, 0.8) : r.range(0, 0.2);
    const nn = n.clone().applyAxisAngle(t.clone().cross(n).normalize(), tilt);
    mats.push(frameMatrix(p, nn, t, [0.0031 * r.range(0.85, 1.15), 0.0014, 0.0015]));
    cols.push(GRAIN_COLS[k % GRAIN_COLS.length]);
  }
  const grains = scatterMerge(base, mats, cols);
  return sitOnGround(group(mesh(mound, cookedRiceMat(), { name: 'rice-mound' }), mesh(grains, cookedGrainMat(), { name: 'rice-grains' })));
}

// =============================================================================================
// Spaghetti: dry bundle tied with a paper band; boiled -> a nest of soft noodles
// =============================================================================================

const SPAG = getDef('spaghetti').colors;
const SPAG_LEN = 0.25;
const SPAG_R = 0.0011;
const BUNDLE_R = 0.0112;

const spagMat = lazy(() => foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.36, clearcoat: 0.35, clearcoatRoughness: 0.35, flesh: SPAG.flesh, cookColor: SPAG.cooked, name: 'spaghetti' }));
const SPAG_COLS = ['#f1d78a', '#efd283', '#f3db93', '#ecce7e', '#f5df9c'].map((h) => new THREE.Color(h));

const spagBandTex = lazy(() =>
  drawTex('spaghetti-band', 512, 128, (ctx, w, h) => {
    // u around the band, v along the bundle
    ctx.fillStyle = '#fff4dc';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5f9fd6';
    ctx.fillRect(0, h * 0.1, w, h * 0.12);
    ctx.fillRect(0, h * 0.78, w, h * 0.12);
    ctx.fillStyle = '#e8665e';
    ctx.fillRect(0, h * 0.26, w, h * 0.04);
    ctx.fillRect(0, h * 0.7, w, h * 0.04);
    // label text (rotated so it reads along the bundle), twice around
    ctx.fillStyle = '#e8665e';
    ctx.font = `bold ${Math.round(h * 0.13)}px "Trebuchet MS", "Verdana", "DejaVu Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let k = 0; k < 2; k++) {
      ctx.save();
      ctx.translate(w * (0.25 + 0.5 * k), h * 0.5);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('PASTA', 0, 0);
      ctx.restore();
    }
  }),
);
const spagBandMat = lazy(() => foodMat({ color: '#ffffff', map: spagBandTex(), roughness: 0.7, flesh: '#f6ecd6', cookAmount: 0, food: false, name: 'pasta-band' }));

function buildSpaghetti(r: Rng): THREE.Object3D {
  // rod positions in the bundle cross-section (y, z)
  const pts: [number, number][] = [];
  for (let tries = 0; tries < 3000 && pts.length < 52; tries++) {
    const [a, b] = r.disc();
    const p: [number, number] = [a * (BUNDLE_R - SPAG_R), b * (BUNDLE_R - SPAG_R)];
    if (pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > SPAG_R * 2.05)) pts.push(p);
  }
  const rods: THREE.BufferGeometry[] = [];
  pts.forEach(([py, pz], i) => {
    const half = SPAG_LEN / 2;
    const l0 = half + r.range(-0.004, 0.002), l1 = half + r.range(-0.004, 0.002);
    const fan = 1.22 + r.range(-0.05, 0.08);
    const curve = curveThrough([
      [-l0, py * fan, pz * fan],
      [0, py, pz],
      [l1, py * fan, pz * fan],
    ]);
    const geo = sweepGeometry(curve, { radius: SPAG_R, radialSegments: 6, tubularSegments: 4, caps: 'flat' });
    tintGeometry(geo, SPAG_COLS[i % SPAG_COLS.length]);
    rods.push(geo);
  });
  const bundle = merge(rods);
  bundle.translate(0, BUNDLE_R * 1.22, 0);
  bundle.scale(1, 0.9, 1);
  // paper band
  const bandR = BUNDLE_R + 0.0009;
  const band = new THREE.CylinderGeometry(bandR, bandR, 0.042, 40, 1, true);
  band.rotateZ(Math.PI / 2);
  band.translate(0, BUNDLE_R * 1.22, 0);
  band.scale(1, 0.9, 1);
  const g = group(mesh(bundle, spagMat(), { name: 'spaghetti' }), mesh(band, spagBandMat(), { name: 'band' }));
  g.rotation.y = r.range(-0.12, 0.12);
  return sitOnGround(g);
}

const cookedSpagMat = lazy(() => foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.3, clearcoat: 0.55, clearcoatRoughness: 0.3, flesh: SPAG.flesh, cookColor: SPAG.cooked, name: 'spaghetti-cooked' }));
const COOKED_COLS = ['#f6e2a4', '#f3dc98', '#f8e6ad', '#f1d891'].map((h) => new THREE.Color(h));

function cookedSpaghetti(r: Rng): THREE.Object3D {
  const strands: THREE.BufferGeometry[] = [];
  const R = 0.055, H = 0.034;
  const n = 16;
  for (let s = 0; s < n; s++) {
    const a0 = r.range(0, Math.PI * 2);
    const turns = r.range(1.2, 2.0) * r.sign();
    const r0 = r.range(0.25, 0.95);
    const ph = r.range(0, 6);
    const pts: [number, number, number][] = [];
    const K = 22;
    for (let k = 0; k <= K; k++) {
      const t = k / K;
      const a = a0 + turns * Math.PI * 2 * t;
      const rr = R * Math.min(0.97, Math.max(0.12, r0 + 0.32 * Math.sin(t * Math.PI * 2.3 + ph) + r.range(-0.05, 0.05)));
      const kk = rr / R;
      const y = H * Math.pow(Math.max(0, 1 - kk * kk), 0.8) * r.range(0.82, 1.0) + 0.0016 + Math.sin(t * 9 + ph) * 0.0015;
      pts.push([Math.cos(a) * rr, y, Math.sin(a) * rr]);
    }
    const geo = sweepGeometry(curveThrough(pts), { radius: 0.00155, radialSegments: 5, tubularSegments: 46, caps: 'flat' });
    tintGeometry(geo, COOKED_COLS[s % COOKED_COLS.length]);
    strands.push(geo);
  }
  const g = merge(strands);
  return sitOnGround(group(mesh(g, cookedSpagMat(), { name: 'spaghetti-nest' })));
}

// =============================================================================================

export const MODELS: ModelTable = {
  bread: {
    build: buildBread,
    sliceShape: breadSliceShape,
    section: (ctx, s) => breadSection(ctx, s),
    skin: breadSkin,
    flesh: breadFlesh,
  },
  bun: {
    build: buildBun,
    skin: bunMat,
    flesh: bunFlesh,
    forms: { halved: (r) => bunHalves(r) },
  },
  'hotdog-bun': {
    build: buildHotdogBun,
    skin: hotdogMat,
    flesh: bunFlesh,
    forms: { halved: (r) => hotdogHalves(r) },
  },
  baguette: {
    build: buildBaguette,
    profile: baguetteProfile(),
    section: (ctx, s) => baguetteSection(ctx, s),
    skin: baguetteSkin,
    flesh: baguetteFlesh,
  },
  tortilla: {
    build: buildTortilla,
    profile: tortillaProfile(),
    sectionV: (ctx, w, h) => tortillaSectionV(ctx, w, h),
    skin: tortillaMat,
    flesh: tortillaFlesh,
  },
  croissant: {
    build: buildCroissant,
    skin: croissantMat,
    flesh: croissantFlesh,
    forms: { halved: (r) => croissantHalves(r) },
  },
  dough: {
    build: buildDough,
    skin: doughSkin,
    flesh: doughFlesh,
  },
  flour: {
    build: buildFlour,
  },
  rice: {
    build: buildRice,
    flesh: lazy(() => foodMat({ color: RICE.flesh, roughness: 0.5, flesh: RICE.flesh, cookColor: RICE.cooked })),
    variant: (state: FoodState, r: Rng) => (state.cook.boil > 0.6 ? cookedRice(r) : null),
  },
  spaghetti: {
    build: buildSpaghetti,
    flesh: lazy(() => foodMat({ color: SPAG.flesh, roughness: 0.4, flesh: SPAG.flesh, cookColor: SPAG.cooked })),
    variant: (state: FoodState, r: Rng) => (state.cook.boil > 0.6 ? cookedSpaghetti(r) : null),
  },
};

// keep the SectionOpts import meaningful for readers of this file
export type { SectionOpts };
