// Shared helpers for the kitchen props & decor: geometry builders (rounded boxes, filleted lathe
// profiles, extruded rounded panels, tubes), a small cached material library, canvas textures and
// a static-mesh merger that batches non-animated parts to keep draw calls low on mobile.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];

// ---------------------------------------------------------------------------------------------
// Deterministic random + value noise

export class Rand {
  private s: number;
  constructor(seed = 1) {
    this.s = (Math.floor(Math.abs(seed) * 7919) % 2147483647) + 1;
  }
  next(): number {
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
}

const PERM = (() => {
  const r = new Rand(1337);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return new Uint8Array([...p, ...p]);
})();

function fade(t: number) {
  return t * t * (3 - 2 * t);
}

/** 2D value noise in -1..1, tileable with periods px / py (integer lattice units). */
export function noise2(x: number, y: number, px = 256, py = 256): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const h = (i: number, j: number) => PERM[(PERM[(((i % px) + px) % px) & 255] + ((((j % py) + py) % py) & 255)) & 511] / 127.5 - 1;
  const u = fade(xf), v = fade(yf);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal noise; (px, py) = base-octave periods for seamless tiling (x in 0..px wraps). */
export function fbm2(x: number, y: number, oct = 3, px = 256, py = 256): number {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += noise2(x * f, y * f, px * f, py * f) * a;
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return s / n;
}

// ---------------------------------------------------------------------------------------------
// Canvas textures (cached by key)

const texCache = new Map<string, THREE.Texture>();

function newCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas | null {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}

export interface TexOpts {
  srgb?: boolean;
  repeat?: [number, number];
  wrap?: boolean;
  aniso?: number;
  mipmaps?: boolean;
}

/** Cached canvas texture. Falls back to a 1x1 white texture where no canvas exists (node tests). */
export function canvasTex(
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  o: TexOpts = {},
): THREE.Texture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const t = makeCanvasTexture(w, h, draw, o);
  texCache.set(key, t);
  return t;
}

/** Uncached variant (for textures that are redrawn later, e.g. displays, chalkboard). */
export function makeCanvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  o: TexOpts = {},
): THREE.Texture {
  const c = newCanvas(w, h);
  let t: THREE.Texture;
  if (c) {
    const ctx = c.getContext('2d') as CanvasRenderingContext2D | null;
    if (ctx) draw(ctx, w, h);
    t = new THREE.CanvasTexture(c as HTMLCanvasElement);
  } else {
    t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  }
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (o.wrap || o.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
  t.anisotropy = o.aniso ?? 4;
  if (o.mipmaps === false) {
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
  }
  t.needsUpdate = true;
  return t;
}

/** Per-pixel painter helper: fn returns [r,g,b] (0..255) or [r,g,b,a]. */
export function paintPixels(ctx: CanvasRenderingContext2D, w: number, h: number, fn: (x: number, y: number) => number[]) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = fn(x, y);
      const i = (y * w + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = c.length > 3 ? c[3] : 255;
    }
  ctx.putImageData(img, 0, 0);
}

/** '#rrggbb' -> [r, g, b] 0..255 (canvas / sRGB space). */
export function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

/** Hex colour shifted lighter (+) / darker (-) in sRGB canvas space. */
export function shade(hex: string, amt: number): string {
  return mixHex(hex, amt >= 0 ? '#ffffff' : '#000000', Math.abs(amt));
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = hexRgb(a), cb = hexRgb(b);
  return toHex(ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t);
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Friendly rounded font stack used for labels & chalk. */
export const FONT_STACK = "'Baloo 2', 'Fredoka', 'Nunito', 'Trebuchet MS', 'Verdana', 'DejaVu Sans', sans-serif";
/** Chalk-style stack for the menu board. */
export const CHALK_FONT_STACK = "'Baloo 2', 'Fredoka', 'Nunito', 'Comic Sans MS', 'Chalkboard SE', 'Trebuchet MS', 'DejaVu Sans', sans-serif";

// ---------------------------------------------------------------------------------------------
// Materials (cached; never mutate a cached material - use `own()` for gameplay-animated ones)

const matCache = new Map<string, THREE.Material>();

function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key) as T | undefined;
  if (!m) {
    m = make();
    m.name = key;
    matCache.set(key, m);
  }
  return m;
}

/** Glossy painted enamel (appliances, cabinets). */
export function enamel(color: string, rough = 0.32): THREE.MeshStandardMaterial {
  return cached(`enamel:${color}:${rough}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }));
}

/** Candy-gloss lacquer with a clearcoat (hero appliances). */
export function lacquer(color: string, rough = 0.42): THREE.MeshPhysicalMaterial {
  return cached(`lacquer:${color}:${rough}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.18 }));
}

export function matte(color: string, rough = 0.8): THREE.MeshStandardMaterial {
  return cached(`matte:${color}:${rough}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }));
}

export function chrome(): THREE.MeshStandardMaterial {
  return cached('chrome', () => new THREE.MeshStandardMaterial({ color: '#e9eef3', roughness: 0.22, metalness: 0.85 }));
}

export function steel(): THREE.MeshStandardMaterial {
  return cached('steel', () => new THREE.MeshStandardMaterial({ color: '#d3dae0', roughness: 0.36, metalness: 0.75 }));
}

export function darkSteel(): THREE.MeshStandardMaterial {
  return cached('darkSteel', () => new THREE.MeshStandardMaterial({ color: '#8f9aa5', roughness: 0.4, metalness: 0.7 }));
}

export function copper(): THREE.MeshStandardMaterial {
  return cached('copper', () => new THREE.MeshStandardMaterial({ color: '#e0905f', roughness: 0.3, metalness: 0.8 }));
}

export function brass(): THREE.MeshStandardMaterial {
  return cached('brass', () => new THREE.MeshStandardMaterial({ color: '#e7c27a', roughness: 0.3, metalness: 0.8 }));
}

export function castIron(): THREE.MeshStandardMaterial {
  return cached('castIron', () => new THREE.MeshStandardMaterial({ color: '#3a3533', roughness: 0.55, metalness: 0.35 }));
}

export function rubber(color = '#2b2626'): THREE.MeshStandardMaterial {
  return cached(`rubber:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0 }));
}

export function ceramic(color: string): THREE.MeshStandardMaterial {
  return cached(`ceramic:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.22, metalness: 0 }));
}

export function glass(tint = '#dff4ff', opacity = 0.22): THREE.MeshStandardMaterial {
  return cached(
    `glass:${tint}:${opacity}`,
    () =>
      new THREE.MeshStandardMaterial({
        color: tint,
        roughness: 0.04,
        metalness: 0.1,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        envMapIntensity: 1.6,
      }),
  );
}

/** Material with a map (cached by key). */
export function textured(key: string, map: THREE.Texture, o: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return cached(`tex:${key}`, () => new THREE.MeshStandardMaterial({ map, roughness: 0.6, metalness: 0, ...o }));
}

/** Basic (unlit) cached material. */
export function basic(color: string, o: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  return cached(`basic:${color}:${JSON.stringify(o, (k, v) => (v && typeof v === 'object' && 'isTexture' in v ? (v as THREE.Texture).uuid : v))}`, () => new THREE.MeshBasicMaterial({ color, ...o }));
}

/** A fresh (uncached) glow material gameplay can animate (opacity starts at 0). */
export function glowMat(color: string, o: { additive?: boolean; map?: THREE.Texture | null; side?: THREE.Side } = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    map: o.map ?? null,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
    side: o.side ?? THREE.FrontSide,
    toneMapped: false,
  });
}

/** A fresh emissive indicator-lamp material (emissiveIntensity starts at 0). */
export function lampMat(color: string, emissive: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0, roughness: 0.25, metalness: 0 });
}

// ---------------------------------------------------------------------------------------------
// Geometry

/** Rounded box centred at the origin. */
export function rbox(w: number, h: number, d: number, r: number, segs = 3): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, segs, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
}

/** Rounded box with its bottom at y = 0. */
export function rboxB(w: number, h: number, d: number, r: number, segs = 3): THREE.BufferGeometry {
  return rbox(w, h, d, r, segs).translate(0, h / 2, 0);
}

export type P2 = [number, number];
/** A polyline vertex with an optional fillet radius (third value). */
export type FP = [number, number] | [number, number, number];

/**
 * Replace corners of a polyline by circular fillets. Each point may carry a radius as 3rd value.
 * Returns a dense polyline. Endpoints are kept as is.
 */
export function fillet(pts: FP[], arcSegs = 6, closed = false): P2[] {
  const n = pts.length;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const r = p[2] ?? 0;
    const hasPrev = closed || i > 0;
    const hasNext = closed || i < n - 1;
    if (!r || !hasPrev || !hasNext) {
      out.push([p[0], p[1]]);
      continue;
    }
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const ux = a[0] - p[0], uy = a[1] - p[1];
    const vx = b[0] - p[0], vy = b[1] - p[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < 1e-9 || lv < 1e-9) {
      out.push([p[0], p[1]]);
      continue;
    }
    const nux = ux / lu, nuy = uy / lu, nvx = vx / lv, nvy = vy / lv;
    const cos = Math.max(-1, Math.min(1, nux * nvx + nuy * nvy));
    const ang = Math.acos(cos); // interior angle
    if (ang > Math.PI - 1e-3) {
      out.push([p[0], p[1]]);
      continue;
    }
    const half = ang / 2;
    let t = r / Math.tan(half);
    const tMax = Math.min(lu, lv) * 0.5;
    let rr = r;
    if (t > tMax) {
      t = tMax;
      rr = t * Math.tan(half);
    }
    const bx = nux + nvx, by = nuy + nvy;
    const bl = Math.hypot(bx, by);
    const dist = rr / Math.sin(half);
    const cx = p[0] + (bx / bl) * dist, cy = p[1] + (by / bl) * dist;
    const t1x = p[0] + nux * t, t1y = p[1] + nuy * t;
    const t2x = p[0] + nvx * t, t2y = p[1] + nvy * t;
    let a1 = Math.atan2(t1y - cy, t1x - cx);
    let a2 = Math.atan2(t2y - cy, t2x - cx);
    let da = a2 - a1;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    for (let k = 0; k <= arcSegs; k++) {
      const aa = a1 + (da * k) / arcSegs;
      out.push([cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr]);
    }
    void a2;
  }
  return out;
}

/**
 * Lathe a [radius, y] profile (use `fillet` for rounded corners). V is arc-length based.
 * Profile direction defines facing: going up on the outside = outward faces.
 */
export function lathe(profile: P2[], segs = 48, phiStart = 0, phiLength = Math.PI * 2): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
  const g = new THREE.LatheGeometry(pts, segs, phiStart, phiLength);
  // arc-length v
  const L: number[] = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = L[L.length - 1] || 1;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const n = pts.length;
  for (let i = 0; i < uv.count; i++) uv.setY(i, L[i % n] / total);
  return g;
}

/** Cylinder with its base at y = 0. */
export function cylB(rTop: number, rBot: number, h: number, segs = 32, open = false): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rTop, rBot, h, segs, 1, open).translate(0, h / 2, 0);
}

/** Smooth rounded "puck": a cylinder with rounded top & bottom edges, base at y=0. */
export function puck(r: number, h: number, bevel: number, segs = 40, arc = 4): THREE.BufferGeometry {
  const b = Math.min(bevel, r * 0.5, h * 0.5);
  return lathe(fillet([[0, 0], [r, 0, b], [r, h, b], [0, h]], arc), segs);
}

/** Tube through points (Catmull-Rom). */
export function tube(points: V3[], radius: number, tubular = 32, radial = 10, closed = false, tension = 0.5): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'catmullrom', tension);
  return new THREE.TubeGeometry(curve, tubular, radius, radial, closed);
}

/** Tube along an arbitrary curve with rounded end caps (spheres). */
export function cappedTube(points: V3[], radius: number, tubular = 32, radial = 10, tension = 0.5): THREE.BufferGeometry {
  const t = tube(points, radius, tubular, radial, false, tension);
  const s1 = new THREE.SphereGeometry(radius, radial, Math.max(4, radial / 2)).translate(...points[0]);
  const s2 = new THREE.SphereGeometry(radius, radial, Math.max(4, radial / 2)).translate(...points[points.length - 1]);
  return mergeGeo([t, s1, s2]);
}

/** Capsule along X, centred. */
export function pillX(length: number, radius: number, cap = 6, radial = 16): THREE.BufferGeometry {
  return new THREE.CapsuleGeometry(radius, Math.max(0.0001, length - 2 * radius), cap, radial).rotateZ(Math.PI / 2);
}

/** Rounded-rect THREE.Shape centred at the origin. */
export function roundedRectShape(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape();
  const x = cx - w / 2, y = cy - h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.absarc(x + w - rr, y + rr, rr, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - rr);
  s.absarc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2, false);
  s.lineTo(x + rr, y + h);
  s.absarc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + rr);
  s.absarc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5, false);
  return s;
}

export function roundedRectPath(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Path {
  const s = new THREE.Path();
  const x = cx - w / 2, y = cy - h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  s.moveTo(x + rr, y);
  s.absarc(x + rr, y + rr, rr, -Math.PI / 2, -Math.PI, true);
  s.lineTo(x, y + h - rr);
  s.absarc(x + rr, y + h - rr, rr, Math.PI, Math.PI / 2, true);
  s.lineTo(x + w - rr, y + h);
  s.absarc(x + w - rr, y + h - rr, rr, Math.PI / 2, 0, true);
  s.lineTo(x + w, y + rr);
  s.absarc(x + w - rr, y + rr, rr, 0, -Math.PI / 2, true);
  s.lineTo(x + rr, y);
  return s;
}

/**
 * Extrude a shape along +Z with soft bevels; the result spans z = 0..depth (bevel included)
 * and gets smooth (creased) normals so the bevels shade like moulded plastic / enamel.
 */
export function softExtrude(shape: THREE.Shape, depth: number, bevel: number, opts: { curveSegs?: number; bevelSegs?: number; uvScale?: number } = {}): THREE.BufferGeometry {
  const b = Math.min(bevel, depth / 2 - 1e-4);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, depth - 2 * b),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: opts.bevelSegs ?? 3,
    curveSegments: opts.curveSegs ?? 10,
  });
  g.translate(0, 0, b);
  const c = toCreasedNormals(g, Math.PI / 3.2);
  flattenCaps(c);
  if (opts.uvScale) {
    const uv = c.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * opts.uvScale, uv.getY(i) * opts.uvScale);
  }
  g.dispose();
  return c;
}

/**
 * Keep large flat cap faces (normal ~ +-Z) perfectly flat after smoothing, so bevel shading does
 * not bleed across the long cap triangles (which would look "pillowy").
 */
function flattenCaps(g: THREE.BufferGeometry) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    const n = b.sub(a).cross(c.sub(a));
    const len = n.length();
    if (len < 1e-12) continue;
    n.divideScalar(len);
    if (Math.abs(n.z) > 0.9995) for (let k = 0; k < 3; k++) nor.setXYZ(i + k, 0, 0, Math.sign(n.z));
  }
  nor.needsUpdate = true;
}

/** Rounded-rect slab facing +Z (front face at z = depth), centred in x/y. */
export function panel(w: number, h: number, depth: number, r: number, bevel: number, curveSegs = 8): THREE.BufferGeometry {
  return softExtrude(roundedRectShape(w, h, r), depth, bevel, { curveSegs });
}

/** Planar UVs from world-ish coordinates (useful after merges/transforms). axis: which plane. */
export function planarUV(g: THREE.BufferGeometry, axis: 'xy' | 'xz' | 'zy', scale = 1, offset: [number, number] = [0, 0]): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const [u, v] = axis === 'xy' ? [x, y] : axis === 'xz' ? [x, -z] : [z, y];
    uv[i * 2] = u * scale + offset[0];
    uv[i * 2 + 1] = v * scale + offset[1];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Merge geometries (normalises attributes to position/normal/uv, converts to non-indexed). */
export function mergeGeo(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = geoms.map((g0) => {
    let g = g0.index ? g0.toNonIndexed() : g0.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    g.morphAttributes = {};
    g.clearGroups();
    return g;
  });
  const m = mergeGeometries(prepared, false);
  if (!m) throw new Error('mergeGeo failed');
  return m;
}

/** Bake a transform into a clone of the geometry. */
export function xf(g: THREE.BufferGeometry, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: number | V3 = 1): THREE.BufferGeometry {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));
  const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale);
  m.compose(new THREE.Vector3(...pos), q, s);
  const c = g.clone();
  c.applyMatrix4(m);
  if (m.determinant() < 0) flipWinding(c);
  return c;
}

export function flipWinding(g: THREE.BufferGeometry) {
  if (g.index) {
    const idx = g.index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    g.index.needsUpdate = true;
  } else {
    for (const name of Object.keys(g.attributes)) {
      const a = g.attributes[name] as THREE.BufferAttribute;
      const n = a.itemSize;
      const arr = a.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3 * n) {
        for (let k = 0; k < n; k++) {
          const t = arr[i + n + k];
          arr[i + n + k] = arr[i + 2 * n + k];
          arr[i + 2 * n + k] = t;
        }
      }
      a.needsUpdate = true;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Scene-graph helpers

export interface PartOpts {
  pos?: V3;
  rot?: V3;
  scale?: number | V3;
  cast?: boolean;
  receive?: boolean;
  name?: string;
  order?: number;
}

/** Create a mesh, configure it and add it to the parent. */
export function part(parent: THREE.Object3D, geom: THREE.BufferGeometry, mat: THREE.Material, o: PartOpts = {}): THREE.Mesh {
  const m = new THREE.Mesh(geom, mat);
  if (o.pos) m.position.set(...o.pos);
  if (o.rot) m.rotation.set(...o.rot);
  if (o.scale !== undefined) typeof o.scale === 'number' ? m.scale.setScalar(o.scale) : m.scale.set(...o.scale);
  const transparent = (mat as THREE.Material).transparent;
  m.castShadow = o.cast ?? !transparent;
  m.receiveShadow = o.receive ?? true;
  if (o.name) m.name = o.name;
  if (o.order !== undefined) m.renderOrder = o.order;
  parent.add(m);
  return m;
}

export function grp(parent: THREE.Object3D | null, pos: V3 = [0, 0, 0], name?: string, rot?: V3): THREE.Group {
  const g = new THREE.Group();
  g.position.set(...pos);
  if (rot) g.rotation.set(...rot);
  if (name) g.name = name;
  if (parent) parent.add(g);
  return g;
}

/** Flag objects (and their subtrees) as dynamic so `mergeStatic` leaves them alone. */
export function dynamic<T extends THREE.Object3D>(o: T): T {
  o.userData.dynamic = true;
  return o;
}

/**
 * Merge all static meshes below `root` that share a material (and shadow flags) into single
 * meshes in root space. Subtrees flagged `userData.dynamic` (or in `keep`) are untouched.
 */
export function mergeStatic(root: THREE.Object3D, keep: THREE.Object3D[] = []): void {
  root.updateMatrixWorld(true);
  const keepSet = new Set(keep);
  const inv = root.matrixWorld.clone().invert();
  type Bucket = { mat: THREE.Material; cast: boolean; receive: boolean; order: number; geoms: THREE.BufferGeometry[]; meshes: THREE.Mesh[] };
  const buckets = new Map<string, Bucket>();
  const visit = (o: THREE.Object3D) => {
    if (o !== root && (keepSet.has(o) || o.userData.dynamic)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !Array.isArray(m.material) && m.visible && !(m as unknown as THREE.InstancedMesh).isInstancedMesh) {
      const mat = m.material as THREE.Material;
      const key = `${mat.uuid}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat, cast: m.castShadow, receive: m.receiveShadow, order: m.renderOrder, geoms: [], meshes: [] }));
      const mtx = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
      const g = m.geometry.clone();
      g.applyMatrix4(mtx);
      if (mtx.determinant() < 0) flipWinding(g);
      b.geoms.push(g);
      b.meshes.push(m);
    }
    for (const c of [...o.children]) visit(c);
  };
  visit(root);
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue;
    let merged: THREE.BufferGeometry;
    try {
      merged = mergeGeo(b.geoms);
    } catch {
      continue;
    }
    for (const m of b.meshes) m.removeFromParent();
    const mm = new THREE.Mesh(merged, b.mat);
    mm.castShadow = b.cast;
    mm.receiveShadow = b.receive;
    mm.renderOrder = b.order;
    mm.name = 'merged:' + (b.mat.name || b.mat.type);
    mm.matrixAutoUpdate = false;
    root.add(mm);
  }
}

/** Count triangles of all meshes below an object. */
export function countTriangles(root: THREE.Object3D): { tris: number; meshes: number } {
  let tris = 0, meshes = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    const n = g.index ? g.index.count : g.attributes.position.count;
    tris += n / 3;
  });
  return { tris: Math.round(tris), meshes };
}
