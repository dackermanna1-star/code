// Fruit models: apple, banana, orange, lemon, strawberry, watermelon, pineapple, grapes, cherry,
// peach, pear, kiwi, blueberry, mango, coconut, avocado.
//
// Approach
//  - Bodies are lathes whose UV v follows the profile's arc length, so canvas textures can be
//    painted with an even world-space density (seeds, pores, pineapple eyes).
//  - Broad colour (blush, ripeness gradients) comes from vertex colours; fine detail from canvas
//    maps and normal maps generated from painted height fields. Where a map has to *lighten*
//    (lenticels, streaks) the map's base is a light grey and the vertex colours are boosted.
//  - `profile` (for the generic cut forms) always starts at the lowest point on the axis, so the
//    forms' face UVs line up with `sectionV`.
//  - Templates (materials, textures) are cached; builders only make geometry.

import * as THREE from 'three';
import type { ModelDef, ModelTable, SectionOpts } from './types';
import { getDef } from '../food/catalog';
import {
  type Rng,
  type Profile,
  type LeafOpts,
  rng,
  fbm3,
  noise3,
  canvasTexture,
  makeCanvas,
  smoothProfile,
  profileRadiusAt,
  profileMaxRadius,
  latheGeometry,
  smoothNormals,
  deform,
  sweepGeometry,
  curveThrough,
  leafGeometry,
  merge,
  mesh,
  paintVertices,
  col,
  lazy,
  foodMat,
} from './kit';

// =============================================================================================
// Small math helpers

type Ctx = CanvasRenderingContext2D;
type V3 = [number, number, number];
const TAU = Math.PI * 2;
const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const angDiff = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
};
const colorsOf = (id: string) => getDef(id).colors;
/** sRGB channel (0..1) to linear. */
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

// =============================================================================================
// Geometry helpers

interface Lathe {
  prof: Profile;
  arc: number[];
  total: number;
}

function latheInfo(prof: Profile): Lathe {
  const arc = [0];
  for (let i = 1; i < prof.length; i++) arc.push(arc[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  return { prof, arc, total: arc[arc.length - 1] };
}

/** Profile radius at arc-length fraction v (0 = first point, 1 = last). */
function radiusAtV(L: Lathe, v: number): number {
  const s = clamp(v) * L.total;
  for (let i = 1; i < L.arc.length; i++) {
    if (s <= L.arc[i]) {
      const t = (s - L.arc[i - 1]) / Math.max(1e-9, L.arc[i] - L.arc[i - 1]);
      return lerp(L.prof[i - 1][0], L.prof[i][0], t);
    }
  }
  return L.prof[L.prof.length - 1][0];
}

/** Lathe with arc-length V and welded normals. u = 0 at +Z, increasing towards +X. */
function lathe(prof: Profile, segs = 48): THREE.BufferGeometry {
  const g = latheGeometry(prof, segs);
  const L = latheInfo(prof);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const n = prof.length;
  for (let i = 0; i <= segs; i++) for (let j = 0; j < n; j++) uv.setY(i * n + j, L.arc[j] / L.total);
  uv.needsUpdate = true;
  smoothNormals(g);
  return g;
}

/** Reverse triangle winding (and normals). */
function flipFaces(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = g.index;
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
    idx.needsUpdate = true;
  }
  const n = g.attributes.normal as THREE.BufferAttribute | undefined;
  if (n) {
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    n.needsUpdate = true;
  }
  return g;
}

/**
 * kit.leafGeometry's front faces point down (-Y); the food shader paints back faces with the
 * `flesh` colour, so flip it: textured side up, `flesh` = underside colour.
 */
function leafGeo(o: LeafOpts): THREE.BufferGeometry {
  return flipFaces(leafGeometry(o));
}

function stemGeo(pts: V3[], r0: number, r1: number, o: { tub?: number; radial?: number; caps?: 'round' | 'flat'; shape?: (a: number, t: number) => number } = {}): THREE.BufferGeometry {
  return sweepGeometry(curveThrough(pts), {
    radius: (t) => lerp(r0, r1, t),
    radialSegments: o.radial ?? 8,
    tubularSegments: o.tub ?? 10,
    caps: o.caps ?? 'round',
    shape: o.shape,
  });
}

/** Vertex colours from (position, uv). */
function paintUV(g: THREE.BufferGeometry, fn: (p: THREE.Vector3, u: number, v: number, n: THREE.Vector3) => THREE.Color): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const out = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (nor) n.fromBufferAttribute(nor, i);
    const c = fn(p, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, n);
    out[i * 3] = c.r;
    out[i * 3 + 1] = c.g;
    out[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return g;
}

function solidColor(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = col(hex);
  return paintVertices(g, () => c);
}

/**
 * Wrap an object in a group, centred on x/z (on `centre`'s bounds when given) and resting on
 * y = 0, using precise (vertex) bounds so rotated items don't float.
 */
function seat(root: THREE.Object3D, centre?: THREE.Object3D): THREE.Group {
  const wrap = new THREE.Group();
  wrap.add(root);
  wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  const c = (centre ? new THREE.Box3().setFromObject(centre, true) : box).getCenter(new THREE.Vector3());
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.position.y -= box.min.y;
  return wrap;
}

/** Position + yaw/pitch/roll (applied roll, pitch, then yaw). */
function place<T extends THREE.Object3D>(o: T, pos: V3, yaw = 0, pitch = 0, roll = 0): T {
  o.position.set(pos[0], pos[1], pos[2]);
  o.rotation.set(pitch, yaw, roll, 'YXZ');
  return o;
}

function grp(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}

/** Points spread evenly over a sphere-ish volume shell (Fibonacci). */
function fib(i: number, n: number): [number, number] {
  const y = 1 - (2 * (i + 0.5)) / n;
  const a = i * 2.39996323;
  return [a, Math.asin(y)];
}

// =============================================================================================
// Canvas helpers

/** Draw at x and, when the shape crosses the u seam, also at x +- w. */
function wrapX(w: number, x: number, reach: number, draw: (x: number) => void) {
  draw(x);
  if (x - reach < 0) draw(x + w);
  if (x + reach > w) draw(x - w);
}

function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.01, r), 0, TAU);
}

function fillCircle(ctx: Ctx, x: number, y: number, r: number, style: string | CanvasGradient) {
  circle(ctx, x, y, r);
  ctx.fillStyle = style;
  ctx.fill();
}

function fillEllipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot: number, style: string | CanvasGradient) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  ctx.fillStyle = style;
  ctx.fill();
}

function radial(ctx: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createRadialGradient(x, y, Math.max(0, r0), x, y, Math.max(0.01, r1));
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function linear(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** Teardrop path: pointed end towards angle `ang` (radians, canvas space). */
function teardrop(ctx: Ctx, x: number, y: number, len: number, wid: number, ang: number) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  // local frame: +a = towards the tip
  const P = (a: number, b: number): [number, number] => [x + ca * a - sa * b, y + sa * a + ca * b];
  ctx.beginPath();
  ctx.moveTo(...P(len / 2, 0));
  ctx.bezierCurveTo(...P(len * 0.2, wid * 0.55), ...P(-len * 0.5, wid * 0.62), ...P(-len / 2, 0));
  ctx.bezierCurveTo(...P(-len * 0.5, -wid * 0.62), ...P(len * 0.2, -wid * 0.55), ...P(len / 2, 0));
  ctx.closePath();
}

/** A shiny seed: teardrop with a soft gradient and a tiny highlight. */
function seed(ctx: Ctx, x: number, y: number, len: number, wid: number, ang: number, dark: string, light: string, hi = 'rgba(255,255,255,0.55)') {
  teardrop(ctx, x, y, len, wid, ang);
  ctx.fillStyle = radial(ctx, x - Math.cos(ang) * len * 0.1, y - Math.sin(ang) * len * 0.1, 0, len * 0.6, [[0, light], [1, dark]]);
  ctx.fill();
  const hx = x + Math.cos(ang + 1.9) * wid * 0.18 - Math.cos(ang) * len * 0.08;
  const hy = y + Math.sin(ang + 1.9) * wid * 0.18 - Math.sin(ang) * len * 0.08;
  fillEllipse(ctx, hx, hy, len * 0.16, wid * 0.12, ang, hi);
}

/** Random soft blobs, wrapping in x. */
function blobs(ctx: Ctx, w: number, h: number, r: Rng, n: number, rgb: string, size: [number, number], alpha: [number, number], yRange: [number, number] = [0, 1]) {
  for (let i = 0; i < n; i++) {
    const x = r.next() * w, y = lerp(yRange[0], yRange[1], r.next()) * h, s = r.range(size[0], size[1]), a = r.range(alpha[0], alpha[1]);
    wrapX(w, x, s, (xx) => {
      ctx.fillStyle = radial(ctx, xx, y, 0, s, [[0, `rgba(${rgb},${a})`], [1, `rgba(${rgb},0)`]]);
      ctx.fillRect(xx - s, y - s, s * 2, s * 2);
    });
  }
}

/** Speckle dots inside a disc (centre cx, cy, radius R), between radii [r0, r1] fractions. */
function discDots(ctx: Ctx, cx: number, cy: number, R: number, r: Rng, n: number, color: string, size: [number, number], r0 = 0, r1 = 1, elong = 1, radialAlign = false) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU, d = Math.sqrt(lerp(r0 * r0, r1 * r1, r.next())) * R;
    const s = r.range(size[0], size[1]);
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, s * elong, s, radialAlign ? a : r.next() * Math.PI, 0, TAU);
    ctx.fill();
  }
}

/** Fine radial fibres inside a disc. */
function discFibres(ctx: Ctx, cx: number, cy: number, R: number, r: Rng, n: number, color: string, width: [number, number], r0: number, r1: number) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU, a2 = a + r.range(-0.05, 0.05);
    const d0 = lerp(r0, r1, r.next() * 0.5) * R, d1 = lerp(d0 / R, r1, r.range(0.4, 1)) * R;
    ctx.lineWidth = r.range(width[0], width[1]);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * d0, cy + Math.sin(a) * d0);
    ctx.lineTo(cx + Math.cos(a2) * d1, cy + Math.sin(a2) * d1);
    ctx.stroke();
  }
}

/**
 * Normal map from a painted height field (white = high). Tileable in x (and y if wrapY).
 * `strength` scales the slope per pixel.
 */
function normalTex(key: string, w: number, h: number, paint: (ctx: Ctx, w: number, h: number) => void, strength: number, wrapY = false, repeat?: [number, number]): THREE.Texture {
  const t = canvasTexture(
    w,
    h,
    (ctx) => {
      const hc = makeCanvas(w, h) as HTMLCanvasElement;
      const hx = hc.getContext('2d', { willReadFrequently: true }) as Ctx;
      paint(hx, w, h);
      const src = hx.getImageData(0, 0, w, h).data;
      const H = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) H[i] = src[i * 4] / 255;
      const out = ctx.createImageData(w, h);
      const d = out.data;
      for (let y = 0; y < h; y++) {
        const yu = wrapY ? (y - 1 + h) % h : Math.max(0, y - 1);
        const yd = wrapY ? (y + 1) % h : Math.min(h - 1, y + 1);
        for (let x = 0; x < w; x++) {
          const xl = (x - 1 + w) % w, xr = (x + 1) % w;
          const dx = (H[y * w + xr] - H[y * w + xl]) * strength;
          const dy = (H[yd * w + x] - H[yu * w + x]) * strength;
          // canvas y runs down = -v: n = (-dh/du, -dh/dv, 1) = (-dx, +dy, 1)
          const nx = -dx, ny = dy;
          const l = Math.sqrt(nx * nx + ny * ny + 1);
          const i = (y * w + x) * 4;
          d[i] = (nx / l * 0.5 + 0.5) * 255;
          d[i + 1] = (ny / l * 0.5 + 0.5) * 255;
          d[i + 2] = (1 / l * 0.5 + 0.5) * 255;
          d[i + 3] = 255;
        }
      }
      ctx.putImageData(out, 0, 0);
    },
    { key, srgb: false, wrap: true },
  );
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}

/** Tileable value-noise field painted per pixel (cheap: low-res then scaled up smoothly). */
function noiseField(ctx: Ctx, w: number, h: number, cells: [number, number], seed: number, map: (n: number) => string, alpha = 1) {
  const cw = cells[0], ch = cells[1];
  const small = makeCanvas(cw * 3, ch * 3) as HTMLCanvasElement;
  const sx = small.getContext('2d') as Ctx;
  const img = sx.createImageData(cw, ch);
  const r = rng(seed);
  const vals: number[] = [];
  for (let i = 0; i < cw * ch; i++) vals.push(r.next());
  for (let i = 0; i < cw * ch; i++) {
    const hex = map(vals[i]);
    img.data[i * 4] = parseInt(hex.slice(1, 3), 16);
    img.data[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
    img.data[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
    img.data[i * 4 + 3] = 255;
  }
  // tile 3x3 so smoothing wraps, then draw the middle tile scaled up
  for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) sx.putImageData(img, tx * cw, ty * ch);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, cw * 3, ch * 3, -w, -h, w * 3, h * 3);
  ctx.restore();
}

/**
 * Visit points spread evenly (world space) over a lathe surface, in texture space.
 * cb(x, y, ku, kv): pixel position, pixels per metre around (ku) and along (kv).
 */
function scatterLathe(
  L: Lathe,
  spacing: number,
  r: Rng,
  w: number,
  h: number,
  cb: (x: number, y: number, ku: number, kv: number, i: number) => void,
  o: { uRepeat?: number; jitter?: number; v0?: number; v1?: number } = {},
) {
  const rowStep = spacing * 0.866;
  const rows = Math.max(1, Math.round(L.total / rowStep));
  const jit = o.jitter ?? 0.3;
  let i = 0;
  for (let j = 0; j < rows; j++) {
    const v = (j + 0.5) / rows;
    if (v < (o.v0 ?? 0) || v > (o.v1 ?? 1)) continue;
    const rad = Math.max(2e-4, radiusAtV(L, v));
    const circ = (TAU * rad) / (o.uRepeat ?? 1);
    const n = Math.max(1, Math.round(circ / spacing));
    const ku = w / circ, kv = h / L.total;
    const off = (j % 2) * 0.5;
    for (let k = 0; k < n; k++) {
      const u = (((k + off + r.range(-jit, jit)) / n) % 1 + 1) % 1;
      const vv = clamp(v + (r.range(-jit, jit) * rowStep) / L.total);
      cb(u * w, (1 - vv) * h, Math.min(ku, kv * 8), kv, i++);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Cross-section helpers (sectionV): map fruit coordinates to the face canvas.

interface VMap {
  X: (x: number) => number;
  Y: (y: number) => number;
  R: number;
  H: number;
  /** pixels per metre (x, y) */
  kx: number;
  ky: number;
}

function vmap(prof: Profile, w: number, h: number): VMap {
  const R = profileMaxRadius(prof);
  const y0 = prof[0][1];
  const H = Math.max(prof[prof.length - 1][1] - y0, ...prof.map((p) => p[1] - y0));
  const kx = w / (2 * R), ky = h / H;
  return { X: (x) => w / 2 + x * kx, Y: (y) => (H - (y - y0)) * ky, R, H, kx, ky };
}

/** Profile offset inwards by d (metres), clamped to the axis. */
function insetProfile(prof: Profile, d: number): Profile {
  if (d <= 0) return prof;
  const out: Profile = [];
  for (let i = 0; i < prof.length; i++) {
    const a = prof[Math.max(0, i - 1)], b = prof[Math.min(prof.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    out.push([Math.max(0, prof[i][0] - ty * d), prof[i][1] + tx * d]);
  }
  return out;
}

/** Path of the mirrored silhouette (optionally inset). */
function silhouette(ctx: Ctx, prof: Profile, m: VMap, inset = 0) {
  const p = insetProfile(prof, inset);
  ctx.beginPath();
  p.forEach(([r, y], i) => (i ? ctx.lineTo(m.X(r), m.Y(y)) : ctx.moveTo(m.X(r), m.Y(y))));
  for (let i = p.length - 1; i >= 0; i--) ctx.lineTo(m.X(-p[i][0]), m.Y(p[i][1]));
  ctx.closePath();
}

function fillSil(ctx: Ctx, prof: Profile, m: VMap, inset: number, style: string | CanvasGradient) {
  silhouette(ctx, prof, m, inset);
  ctx.fillStyle = style;
  ctx.fill();
}

/** Layered flesh for sectionV: gradient by distance from the skin, via stacked insets. */
function layeredSil(ctx: Ctx, prof: Profile, m: VMap, layers: [number, string][]) {
  for (const [d, c] of layers) fillSil(ctx, prof, m, d, c);
}

// =============================================================================================
// Shared textures & materials

function leafTexture(key: string, base: string, mid: string, vein: string, edge: string, veins = 8): THREE.Texture {
  return canvasTexture(
    128,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = linear(ctx, 0, 0, w, 0, [[0, edge], [0.3, base], [0.5, mid], [0.7, base], [1, edge]]);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = linear(ctx, 0, 0, 0, h, [[0, 'rgba(0,0,0,0.10)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(255,255,190,0.16)']]);
      ctx.fillRect(0, 0, w, h);
      noiseField(ctx, w, h, [8, 16], key.length * 7, (n) => (n > 0.5 ? '#ffffff' : '#000000'), 0.05);
      ctx.strokeStyle = vein;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.6;
      for (let k = 0; k < veins; k++) {
        const y = h * (0.94 - (k * 0.86) / veins);
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(w / 2, y);
          ctx.quadraticCurveTo(w / 2 + s * w * 0.2, y - h * 0.035, w / 2 + s * w * 0.47, y - h * 0.12);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(w / 2, h);
      ctx.lineTo(w / 2, h * 0.02);
      ctx.stroke();
    },
    { key },
  );
}

const fruitLeafMat = lazy(() =>
  foodMat({
    color: '#ffffff',
    map: leafTexture('fruit-leaf', '#4f9f3a', '#62b24a', '#9ed27a', '#3d8530'),
    roughness: 0.5,
    flesh: '#86bf62',
    cookColor: '#5a5424',
    cookAmount: 0.35,
    name: 'fruit-leaf',
  }),
);

const darkLeafMat = lazy(() =>
  foodMat({
    color: '#ffffff',
    map: leafTexture('fruit-leaf-dark', '#3f8a35', '#4f9a40', '#8cc46a', '#2f6e2a', 10),
    roughness: 0.45,
    flesh: '#7bb05a',
    cookColor: '#4a4a20',
    cookAmount: 0.35,
    name: 'fruit-leaf-dark',
  }),
);

const woodyStemMat = lazy(() => foodMat({ color: '#6e4a2a', roughness: 0.8, flesh: '#8c6a40', cookColor: '#3a2614', cookAmount: 0.35, name: 'fruit-stem' }));
const greenStemMat = lazy(() => foodMat({ color: '#6f8f34', roughness: 0.6, flesh: '#9ab860', cookColor: '#4a4a20', cookAmount: 0.35, name: 'fruit-stem-green' }));
/** Vertex-coloured stem (green -> brown gradients). */
const vcStemMat = lazy(() => foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.7, flesh: '#9a8a50', cookColor: '#3a2614', cookAmount: 0.35, name: 'fruit-stem-vc' }));

/** Template that copies a material with a different normal scale. */
function withNormalScale<T extends THREE.MeshStandardMaterial>(m: T, s: number): T {
  m.normalScale.set(s, s);
  return m;
}

/** A small leaf on a short stalk, attached at `at`, pointing along yaw, rising by pitch. */
function addLeaf(parent: THREE.Object3D, at: V3, yaw: number, pitch: number, len: number, width: number, mat: THREE.Material, curl = -0.3, roll = 0) {
  const g = leafGeo({ length: len, width, curl, fold: 0.22, segments: 9, seed: yaw * 10 });
  parent.add(place(mesh(g, mat), at, yaw, pitch, roll));
}

// =============================================================================================
// APPLE

const APPLE_H = 0.0744;
/** Whole body (with calyx basin). */
const APPLE_BODY: Profile = smoothProfile(
  [
    [0.0001, 0.0062],
    [0.0042, 0.0054],
    [0.0088, 0.0031],
    [0.0145, 0.0009],
    [0.0205, 0.0002],
    [0.0275, 0.0035],
    [0.0352, 0.0125],
    [0.0408, 0.0262],
    [0.0425, 0.0408],
    [0.0406, 0.054],
    [0.0352, 0.0642],
    [0.0266, 0.0716],
    [0.0172, 0.0744],
    [0.0102, 0.0721],
    [0.0048, 0.0668],
    [0.0001, 0.0645],
  ],
  44,
);
/** For cut forms: same body without the bottom basin (starts at the lowest axis point). */
const APPLE_CUT: Profile = smoothProfile(
  [
    [0.0001, 0.0],
    [0.009, 0.0004],
    [0.018, 0.0018],
    [0.0275, 0.0062],
    [0.0352, 0.0145],
    [0.0408, 0.0272],
    [0.0425, 0.0412],
    [0.0406, 0.054],
    [0.0352, 0.0642],
    [0.0266, 0.0716],
    [0.0172, 0.0744],
    [0.0102, 0.0721],
    [0.0048, 0.0668],
    [0.0001, 0.0645],
  ],
  36,
);

const APPLE_MAP_BASE = 0xe4 / 255;
const APPLE_BOOST = 1 / lin(APPLE_MAP_BASE);

const appleSkinTex = lazy(() =>
  canvasTexture(
    512,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#e4e4e4';
      ctx.fillRect(0, 0, w, h);
      const r = rng(101);
      // broad soft bands
      for (let i = 0; i < 40; i++) {
        const x = r.next() * w, bw = r.range(8, 30), dark = r.next() < 0.6, a = r.range(0.05, 0.14);
        const rgb = dark ? '110,24,30' : '255,255,250';
        wrapX(w, x, bw, (xx) => {
          ctx.fillStyle = linear(ctx, xx - bw, 0, xx + bw, 0, [[0, `rgba(${rgb},0)`], [0.5, `rgba(${rgb},${a})`], [1, `rgba(${rgb},0)`]]);
          ctx.fillRect(xx - bw, 0, bw * 2, h);
        });
      }
      // fine streaks running stem -> calyx
      ctx.lineCap = 'round';
      for (let i = 0; i < 260; i++) {
        const x = r.next() * w, y0 = r.range(-0.15, 0.55) * h, len = r.range(0.25, 0.75) * h;
        const wob1 = r.range(-5, 5), wob2 = r.range(-7, 7);
        const dark = r.next() < 0.78;
        ctx.strokeStyle = dark ? `rgba(120,18,28,${r.range(0.08, 0.24)})` : `rgba(255,252,240,${r.range(0.18, 0.42)})`;
        ctx.lineWidth = r.range(0.8, 2.4);
        wrapX(w, x, 12, (xx) => {
          ctx.beginPath();
          ctx.moveTo(xx, y0);
          ctx.quadraticCurveTo(xx + wob1, y0 + len * 0.5, xx + wob2, y0 + len);
          ctx.stroke();
        });
      }
      // lenticels (pale freckles)
      for (let i = 0; i < 420; i++) {
        const x = r.next() * w, y = r.range(0.12, 0.9) * h, s = r.range(0.6, 1.5);
        ctx.fillStyle = `rgba(255,248,220,${r.range(0.45, 0.85)})`;
        wrapX(w, x, 2, (xx) => {
          ctx.beginPath();
          ctx.ellipse(xx, y, s * 1.2, s, 0, 0, TAU);
          ctx.fill();
        });
      }
    },
    { key: 'fruit-apple-skin' },
  ),
);

const appleSkinMat = lazy(() =>
  foodMat({
    color: '#ffffff',
    map: appleSkinTex(),
    vertexColors: true,
    roughness: 0.38,
    clearcoat: 0.65,
    clearcoatRoughness: 0.3,
    flesh: colorsOf('apple').flesh,
    cookColor: colorsOf('apple').cooked,
    name: 'apple-skin',
  }),
);

const appleSkinCutMat = lazy(() => {
  const m = foodMat({ color: '#c8231f', map: appleSkinTex(), roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.3, flesh: colorsOf('apple').flesh, cookColor: colorsOf('apple').cooked });
  m.color.multiplyScalar(APPLE_BOOST);
  return m;
});

const appleFleshMat = lazy(() => foodMat({ color: colorsOf('apple').flesh, roughness: 0.5, flesh: colorsOf('apple').flesh, cookColor: colorsOf('apple').cooked }));

interface AppleShape {
  sx: number;
  sy: number;
  sz: number;
  lobe: number;
  lobePh: number;
  lean: number;
  leanDir: number;
  seed: number;
}

function appleXf(s: AppleShape, H: number) {
  return (p: THREE.Vector3) => {
    const a = Math.atan2(p.x, p.z), t = p.y / H, rad = Math.hypot(p.x, p.z);
    const k = 1 + s.lobe * Math.cos(5 * a + s.lobePh) * sstep(0.62, 0.05, t) * sstep(0, 0.014, rad) + 0.018 * fbm3(Math.cos(a) * 1.2 + s.seed, t * 1.4, Math.sin(a) * 1.2, 2) * sstep(0, 0.012, rad);
    p.x *= k * s.sx;
    p.z *= k * s.sz;
    p.y *= s.sy;
    const l = s.lean * t * t * H;
    p.x += Math.cos(s.leanDir) * l;
    p.z += Math.sin(s.leanDir) * l;
  };
}

function buildApple(r: Rng): THREE.Object3D {
  const k = r.range(0.94, 1.06);
  const s: AppleShape = {
    sx: k * r.range(0.97, 1.03),
    sz: k * r.range(0.97, 1.03),
    sy: k * r.range(0.95, 1.04),
    lobe: r.range(0.008, 0.02),
    lobePh: r.range(0, TAU),
    lean: r.range(-0.07, 0.07),
    leanDir: r.range(0, TAU),
    seed: r.range(0, 50),
  };
  const xf = appleXf(s, APPLE_H);
  const g = lathe(APPLE_BODY, 48);
  deform(g, (p) => xf(p));
  const H = APPLE_H * s.sy;
  const sunA = r.range(0, TAU);
  const yellowAmt = r.range(0.25, 0.75);
  const RED = col('#cc261f'), DEEP = col('#8c1016'), YEL = col('#efb446'), GRN = col('#c2bd4c');
  const nseed = s.seed;
  paintVertices(g, (p) => {
    const t = clamp(p.y / H);
    const a = Math.atan2(p.x, p.z), rad = Math.hypot(p.x, p.z);
    const sun = Math.cos(angDiff(a, sunA));
    const n = fbm3(p.x * 48 + nseed, p.y * 48, p.z * 48, 3);
    const c = RED.clone().lerp(DEEP, clamp(0.25 + sun * 0.3 + (t - 0.5) * 0.35 + n * 0.6) * 0.8);
    const y = (0.15 - sun * 0.5 + (0.42 - t) * 0.8 + n * 1.1) * yellowAmt * 1.5;
    c.lerp(YEL, sstep(0.2, 0.85, y) * 0.85);
    const cav = t > 0.7 ? sstep(0.017, 0.005, rad) : t < 0.25 ? sstep(0.012, 0.003, rad) * 0.85 : 0;
    c.lerp(GRN, cav * 0.85);
    return c.multiplyScalar(APPLE_BOOST);
  });
  const body = mesh(g, appleSkinMat(), { skin: true, name: 'apple-body' });
  const root = grp(body);
  // stem from the cavity bottom
  const base = new THREE.Vector3(0, 0.0645, 0);
  xf(base);
  const bend = r.range(-0.004, 0.004), bend2 = r.range(-0.003, 0.003);
  const top = new THREE.Vector3(base.x + bend, base.y + r.range(0.016, 0.02), base.z + bend2);
  const stemPts: V3[] = [
    [base.x, base.y - 0.003, base.z],
    [base.x, base.y + 0.006, base.z],
    [lerp(base.x, top.x, 0.6), base.y + 0.012, lerp(base.z, top.z, 0.6)],
    [top.x, top.y, top.z],
  ];
  root.add(mesh(stemGeo(stemPts, 0.0019, 0.0014, { caps: 'round' }), woodyStemMat()));
  if (r.next() < 0.75) {
    const at: V3 = [lerp(base.x, top.x, 0.55), base.y + 0.011, lerp(base.z, top.z, 0.55)];
    addLeaf(root, at, r.range(0, TAU), r.range(-0.5, -0.25), r.range(0.03, 0.036), r.range(0.015, 0.018), fruitLeafMat(), -0.35, r.range(-0.3, 0.3));
  }
  return seat(root, body);
}

function appleSection(ctx: Ctx, s: number, o: SectionOpts) {
  const c = s / 2;
  if (!o.peeled) fillCircle(ctx, c, c, c, radial(ctx, c, c, c * 0.9, c, [[0, '#c51d22'], [1, '#9e1219']]));
  const rf = o.peeled ? c : c * 0.952;
  fillCircle(ctx, c, c, rf, radial(ctx, c, c, 0, rf, [[0, '#fbf3d5'], [0.55, '#f8efca'], [0.88, '#f4eabb'], [1, o.peeled ? '#ecdfa0' : '#efe6ad']]));
  const r = rng(11);
  // juicy cell texture
  discDots(ctx, c, c, rf, r, 260, 'rgba(255,255,245,0.35)', [s * 0.004, s * 0.009], 0.1, 0.98);
  discDots(ctx, c, c, rf, r, 160, 'rgba(214,196,130,0.18)', [s * 0.003, s * 0.007], 0.1, 0.98);
  // vascular bundles
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU + 0.31;
    fillCircle(ctx, c + Math.cos(a) * 0.47 * rf, c + Math.sin(a) * 0.47 * rf, s * 0.013, 'rgba(206,186,120,0.45)');
  }
  // core star: 5 carpels
  const ro = 0.36 * rf, ri = 0.13 * rf;
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const rr = i % 2 === 0 ? ro : ri;
    const x = c + Math.cos(a) * rr, y = c + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else {
      const am = a - TAU / 20;
      const rm = (ro + ri) * 0.62;
      ctx.quadraticCurveTo(c + Math.cos(am) * rm, c + Math.sin(am) * rm, x, y);
    }
  }
  ctx.closePath();
  ctx.fillStyle = radial(ctx, c, c, 0, ro, [[0, '#f6ecc8'], [1, '#efe1b0']]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(196,170,104,0.75)';
  ctx.lineWidth = s * 0.008;
  ctx.stroke();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU - Math.PI / 2;
    const px = c + Math.cos(a) * 0.21 * rf, py = c + Math.sin(a) * 0.21 * rf;
    fillEllipse(ctx, px, py, 0.1 * rf, 0.05 * rf, a, 'rgba(232,214,160,0.9)');
    ctx.strokeStyle = 'rgba(190,160,96,0.6)';
    ctx.lineWidth = s * 0.005;
    ctx.stroke();
    seed(ctx, px, py, 0.13 * rf, 0.07 * rf, a + Math.PI, '#3e1e0c', '#8a4c22');
  }
}

function appleSectionV(ctx: Ctx, w: number, h: number, o: SectionOpts) {
  const prof = APPLE_CUT;
  const m = vmap(prof, w, h);
  ctx.fillStyle = o.peeled ? '#ecdfa0' : '#b3161d';
  ctx.fillRect(0, 0, w, h);
  const d0 = o.peeled ? 0 : 0.0016;
  layeredSil(ctx, prof, m, [
    [d0, '#efe6ad'],
    [d0 + 0.002, '#f4eabd'],
    [d0 + 0.006, '#f8efca'],
    [d0 + 0.013, '#faf2d2'],
  ]);
  const r = rng(12);
  ctx.save();
  silhouette(ctx, prof, m, d0);
  ctx.clip();
  for (let i = 0; i < 300; i++) {
    const x = r.next() * w, y = r.next() * h;
    fillCircle(ctx, x, y, r.range(1, 2.4), r.next() < 0.6 ? 'rgba(255,255,245,0.35)' : 'rgba(214,196,130,0.16)');
  }
  // core: lens from the stem cavity to the calyx
  const cx = m.X(0);
  const yTop = m.Y(0.06), yBot = m.Y(0.008);
  const cw = 0.011 * m.kx;
  ctx.beginPath();
  ctx.moveTo(cx, yTop);
  ctx.bezierCurveTo(cx + cw * 1.6, lerp(yTop, yBot, 0.25), cx + cw * 1.5, lerp(yTop, yBot, 0.8), cx, yBot);
  ctx.bezierCurveTo(cx - cw * 1.5, lerp(yTop, yBot, 0.8), cx - cw * 1.6, lerp(yTop, yBot, 0.25), cx, yTop);
  ctx.fillStyle = 'rgba(238,224,170,0.85)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,174,108,0.7)';
  ctx.lineWidth = w * 0.006;
  ctx.stroke();
  // vascular lines to stem and calyx
  ctx.strokeStyle = 'rgba(205,184,120,0.55)';
  ctx.lineWidth = w * 0.007;
  ctx.beginPath();
  ctx.moveTo(cx, m.Y(0.0645));
  ctx.lineTo(cx, yTop);
  ctx.moveTo(cx, yBot);
  ctx.lineTo(cx, m.Y(0.0));
  ctx.stroke();
  // seed pockets + seeds
  const sy = m.Y(0.034);
  for (const sgn of [-1, 1]) {
    const sx = cx + sgn * cw * 0.55;
    fillEllipse(ctx, sx, sy, cw * 0.55, 0.009 * m.ky, 0, 'rgba(228,208,150,0.9)');
    seed(ctx, sx, sy, 0.0125 * m.ky, 0.0068 * m.kx, -Math.PI / 2 + sgn * 0.12, '#3e1e0c', '#8a4c22');
  }
  // calyx remnant at the bottom
  fillEllipse(ctx, cx, m.Y(0.001), 0.003 * m.kx, 0.0016 * m.ky, 0, '#7a5a30');
  ctx.restore();
}

const APPLE: ModelDef = {
  build: buildApple,
  profile: APPLE_CUT,
  skin: appleSkinCutMat,
  flesh: appleFleshMat,
  section: appleSection,
  sectionV: appleSectionV,
};

// =============================================================================================
// BANANA

const BANANA_RAD: Profile = smoothProfile(
  [
    [0.0046, 0],
    [0.0062, 0.06],
    [0.0112, 0.16],
    [0.0157, 0.3],
    [0.0171, 0.45],
    [0.0171, 0.6],
    [0.0161, 0.75],
    [0.0127, 0.88],
    [0.0076, 0.96],
    [0.0044, 1],
  ],
  48,
);
const bananaR = (t: number) => profileRadiusAt(BANANA_RAD, t);
const BANANA_LEN = 0.19;
/** Coin profile for the 'long' cut style: [radius, x] along the straightened body. */
const BANANA_PROFILE: Profile = (() => {
  const p: Profile = [[0.0001, 0]];
  for (let i = 0; i <= 24; i++) {
    const t = 0.01 + (i / 24) * 0.98;
    p.push([bananaR(t), t * BANANA_LEN]);
  }
  p.push([0.0001, BANANA_LEN]);
  return p;
})();

function bananaCurve(r: Rng): THREE.CatmullRomCurve3 {
  const k = r.range(0.85, 1.2), lift = r.range(0.8, 1.2);
  return curveThrough([
    [-0.091, 0.02 * lift, -0.032 * k],
    [-0.061, 0.0062 * lift, -0.002 * k],
    [-0.021, 0.0, 0.0155 * k],
    [0.022, 0.0, 0.0185 * k],
    [0.061, 0.0052 * lift, 0.004 * k],
    [0.089, 0.017 * lift, -0.021 * k],
  ]);
}

const bananaSkinTex = lazy(() =>
  canvasTexture(
    256,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      const r = rng(31);
      // faint longitudinal streaks
      for (let i = 0; i < 60; i++) {
        const x = r.next() * w, a = r.range(0.04, 0.12);
        ctx.strokeStyle = `rgba(150,120,40,${a})`;
        ctx.lineWidth = r.range(1, 3);
        wrapX(w, x, 3, (xx) => {
          ctx.beginPath();
          ctx.moveTo(xx, 0);
          ctx.lineTo(xx, h);
          ctx.stroke();
        });
      }
      // ridge lines (ridges at u = k/5)
      for (let k = 0; k <= 5; k++) {
        const x = (k / 5) * w;
        ctx.strokeStyle = 'rgba(130,110,40,0.28)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x, h * 0.05);
        ctx.lineTo(x, h * 0.95);
        ctx.stroke();
      }
      // sugar spots
      for (let i = 0; i < 70; i++) {
        const x = r.next() * w, y = r.range(0.15, 0.85) * h, s = r.range(0.8, 2.6);
        const a = r.range(0.35, 0.75);
        wrapX(w, x, 4, (xx) => fillEllipse(ctx, xx, y, s, s * 1.6, 0, `rgba(105,62,24,${a})`));
      }
      for (let i = 0; i < 10; i++) {
        const x = r.next() * w, y = r.range(0.2, 0.8) * h, s = r.range(5, 11);
        wrapX(w, x, s, (xx) => fillEllipse(ctx, xx, y, s, s * 2, 0, radial(ctx, xx, y, 0, s * 2, [[0, 'rgba(140,90,30,0.22)'], [1, 'rgba(140,90,30,0)']])));
      }
    },
    { key: 'fruit-banana-skin' },
  ),
);

const bananaSkinMat = lazy(() =>
  foodMat({ color: '#ffffff', map: bananaSkinTex(), vertexColors: true, roughness: 0.52, clearcoat: 0.15, clearcoatRoughness: 0.5, flesh: colorsOf('banana').flesh, cookColor: colorsOf('banana').cooked, name: 'banana-skin' }),
);
const bananaSkinCutMat = lazy(() => foodMat({ color: colorsOf('banana').skin, map: bananaSkinTex(), roughness: 0.52, flesh: colorsOf('banana').flesh, cookColor: colorsOf('banana').cooked }));

const bananaFruitTex = lazy(() =>
  canvasTexture(
    128,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#fbf0c8';
      ctx.fillRect(0, 0, w, h);
      const r = rng(33);
      for (let i = 0; i < 90; i++) {
        const x = r.next() * w;
        ctx.strokeStyle = r.next() < 0.5 ? `rgba(236,214,150,${r.range(0.3, 0.6)})` : `rgba(255,252,236,${r.range(0.4, 0.8)})`;
        ctx.lineWidth = r.range(0.8, 2.5);
        wrapX(w, x, 3, (xx) => {
          ctx.beginPath();
          ctx.moveTo(xx, 0);
          ctx.bezierCurveTo(xx + 2, h * 0.3, xx - 2, h * 0.7, xx + 1, h);
          ctx.stroke();
        });
      }
      // stringy phloem bundles
      for (let k = 0; k < 5; k++) {
        const x = ((k + 0.3) / 5) * w;
        ctx.strokeStyle = 'rgba(214,180,110,0.55)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x, h * 0.04);
        ctx.bezierCurveTo(x + 3, h * 0.35, x - 3, h * 0.65, x, h * 0.96);
        ctx.stroke();
      }
    },
    { key: 'fruit-banana-fruit' },
  ),
);

const bananaFruitMat = lazy(() =>
  foodMat({ color: '#ffffff', map: bananaFruitTex(), vertexColors: true, roughness: 0.48, flesh: colorsOf('banana').flesh, cookColor: colorsOf('banana').cooked, name: 'banana-fruit' }),
);
const bananaFleshMat = lazy(() => foodMat({ color: colorsOf('banana').flesh, roughness: 0.5, flesh: colorsOf('banana').flesh, cookColor: colorsOf('banana').cooked }));

function bananaBody(curve: THREE.Curve<THREE.Vector3>, r: Rng): THREE.BufferGeometry {
  const g = sweepGeometry(curve, {
    radius: (t) => bananaR(t),
    shape: (a, t) => 1 + 0.055 * Math.cos(5 * a) * sstep(0.0, 0.14, t) * sstep(1.0, 0.9, t),
    radialSegments: 30,
    tubularSegments: 56,
    caps: 'round',
  });
  const green = r.range(0.0, 0.55);
  const YEL = col('#f7d443'), YEL2 = col('#f2c731'), GRN = col('#a7bd3a'), TIP = col('#3a2a18'), NECK = col('#8a8a3a');
  return paintUV(g, (p, u, v) => {
    const t = clamp(v);
    const ridge = Math.pow(Math.max(0, Math.cos(5 * u * TAU)), 6);
    const c = YEL.clone().lerp(YEL2, 0.5 - 0.5 * ridge);
    c.lerp(GRN, sstep(0.22, 0.02, t) * (0.55 + green * 0.45) + green * 0.25 * sstep(0.6, 0.1, t));
    c.lerp(NECK, sstep(0.02, -0.02, v));
    c.lerp(TIP, sstep(0.955, 0.99, v));
    return c;
  });
}

function bananaStalk(curve: THREE.Curve<THREE.Vector3>, r: Rng): THREE.BufferGeometry {
  const p0 = curve.getPoint(0), t0 = curve.getTangent(0).negate();
  const up = new THREE.Vector3(0, 1, 0);
  const pts: V3[] = [];
  const len = r.range(0.02, 0.026);
  for (let i = 0; i <= 3; i++) {
    const s = (i / 3) * len - 0.004;
    const q = p0.clone().addScaledVector(t0, s).addScaledVector(up, Math.max(0, s) * Math.max(0, s) * 9);
    pts.push([q.x, q.y, q.z]);
  }
  const g = stemGeo(pts, 0.0043, 0.0039, { caps: 'flat', radial: 10, tub: 6, shape: (a) => 1 + 0.07 * Math.cos(5 * a) });
  const tip = new THREE.Vector3(...pts[3]);
  const GRN = col('#8f9a3c'), BRN = col('#5c4424'), END = col('#3e2c18');
  return paintVertices(g, (p) => {
    const d = p.distanceTo(tip);
    return GRN.clone().lerp(BRN, sstep(0.016, 0.004, d)).lerp(END, sstep(0.0025, 0.0005, d));
  });
}

function buildBanana(r: Rng): THREE.Object3D {
  const curve = bananaCurve(r);
  const body = mesh(bananaBody(curve, r), bananaSkinMat(), { skin: true, name: 'banana-body' });
  const stalk = mesh(bananaStalk(curve, r), vcStemMat());
  stalk.userData.part = 'skin';
  const root = grp(body, stalk);
  root.rotation.y = r.range(-0.35, 0.35);
  return seat(root, body);
}

function peeledBanana(r: Rng): THREE.Object3D {
  const curve = bananaCurve(r);
  const g = sweepGeometry(curve, {
    radius: (t) => bananaR(lerp(0.06, 0.97, t)) * 0.83,
    shape: (a) => 1 + 0.02 * Math.cos(5 * a),
    radialSegments: 24,
    tubularSegments: 48,
    caps: 'round',
  });
  const CREAM = col('#fbf1c9'), TIPC = col('#d8b878');
  paintUV(g, (p, u, v) => CREAM.clone().lerp(TIPC, sstep(0.97, 1.05, v) * 0.6));
  const m = mesh(g, bananaFruitMat(), { name: 'banana-fruit' });
  const root = grp(m);
  root.rotation.y = r.range(-0.35, 0.35);
  return seat(root);
}

function bananaSection(ctx: Ctx, s: number, o: SectionOpts) {
  const c = s / 2;
  let rf = c;
  if (!o.peeled) {
    // pentagonal-ish peel ring
    fillCircle(ctx, c, c, c, '#efc93a');
    fillCircle(ctx, c, c, c * 0.93, '#f6eccb');
    rf = c * 0.86;
  }
  fillCircle(ctx, c, c, rf, radial(ctx, c, c, 0, rf, [[0, '#fbf3d6'], [0.5, '#fbf1cc'], [1, '#f6e6b3']]));
  const r = rng(17);
  discFibres(ctx, c, c, rf, r, 70, 'rgba(255,253,240,0.5)', [s * 0.004, s * 0.009], 0.25, 0.97);
  // three-lobed centre with tiny seeds
  ctx.fillStyle = 'rgba(238,222,170,0.75)';
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * TAU;
    const rr = rf * (0.17 + 0.07 * Math.cos(3 * a));
    const x = c + Math.cos(a) * rr, y = c + Math.sin(a) * rr;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.fill();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    for (let j = 0; j < 3; j++) {
      const d = rf * (0.07 + j * 0.055), aa = a + (j - 1) * 0.35;
      fillCircle(ctx, c + Math.cos(aa) * d, c + Math.sin(aa) * d, s * 0.012, 'rgba(92,60,30,0.85)');
    }
  }
}

const BANANA: ModelDef = {
  build: buildBanana,
  peeled: peeledBanana,
  profile: BANANA_PROFILE,
  skin: bananaSkinCutMat,
  flesh: bananaFleshMat,
  section: bananaSection,
  iconRotation: [0, 0.3, 0],
};

// =============================================================================================
// CITRUS (orange, lemon)

/** Oblate citrus sphere, optional pole dimples. */
function citrusProfile(R: number, H: number, dTop: number, dBot: number, n = 48): Profile {
  const pts: Profile = [];
  for (let i = 0; i <= n; i++) {
    const th = -Math.PI / 2 + (i / n) * Math.PI;
    const r = R * Math.cos(th);
    let y = (H / 2) * (1 + Math.sin(th));
    const q = (r / R) ** 2;
    if (th > 0) y -= dTop * Math.exp(-q / 0.012);
    else y += dBot * Math.exp(-q / 0.01);
    pts.push([Math.max(0.0001, r), y]);
  }
  return pts;
}

const ORANGE_R = 0.0425, ORANGE_H = 0.081;
const ORANGE_BODY = citrusProfile(ORANGE_R, ORANGE_H, 0.0028, 0.0018, 48);
const ORANGE_CUT = citrusProfile(ORANGE_R, ORANGE_H, 0, 0, 32);

interface Pore {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

function poreField(prof: Profile, w: number, h: number, spacing: number, radius: number, seedN: number, uRepeat: number): Pore[] {
  const L = latheInfo(prof);
  const r = rng(seedN);
  const out: Pore[] = [];
  scatterLathe(
    L,
    spacing,
    r,
    w,
    h,
    (x, y, ku, kv) => {
      const k = r.range(0.7, 1.3);
      out.push({ x, y, rx: radius * ku * k, ry: radius * kv * k });
    },
    { uRepeat, jitter: 0.42 },
  );
  return out;
}

const orangePores = lazy(() => poreField(ORANGE_BODY, 512, 512, 0.0017, 0.0006, 41, 2));

const orangeColorTex = lazy(() => {
  const t = canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#f7860f';
      ctx.fillRect(0, 0, w, h);
      noiseField(ctx, w, h, [10, 10], 5, (n) => (n > 0.5 ? '#ff9a1f' : '#e9720a'), 0.4);
      const r = rng(6);
      blobs(ctx, w, h, r, 30, '255,170,50', [10, 40], [0.04, 0.12]);
      for (const p of orangePores()) wrapX(w, p.x, p.rx + 1, (xx) => fillEllipse(ctx, xx, p.y, p.rx * 1.3, p.ry * 1.3, 0, 'rgba(206,104,10,0.30)'));
    },
    { key: 'fruit-orange-color' },
  );
  t.repeat.set(2, 1);
  return t;
});

const orangeNormalTex = lazy(() =>
  normalTex(
    'fruit-orange-normal',
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(0, 0, w, h);
      noiseField(ctx, w, h, [24, 24], 9, (n) => (n > 0.5 ? '#b0b0b0' : '#8a8a8a'), 0.8);
      for (const p of orangePores())
        wrapX(w, p.x, p.rx * 1.6, (xx) => {
          ctx.fillStyle = radial(ctx, xx, p.y, 0, Math.max(p.rx, p.ry) * 1.6, [[0, 'rgba(20,20,20,0.85)'], [0.6, 'rgba(60,60,60,0.4)'], [1, 'rgba(60,60,60,0)']]);
          ctx.beginPath();
          ctx.ellipse(xx, p.y, p.rx * 1.6, p.ry * 1.6, 0, 0, TAU);
          ctx.fill();
        });
    },
    2.4,
    false,
    [2, 1],
  ),
);

const orangeSkinMat = lazy(() =>
  withNormalScale(
    foodMat({ color: '#ffffff', map: orangeColorTex(), normalMap: orangeNormalTex(), roughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.5, flesh: colorsOf('orange').flesh, cookColor: colorsOf('orange').cooked, name: 'orange-skin' }),
    0.9,
  ),
);
const orangeSkinCutMat = lazy(() => foodMat({ color: colorsOf('orange').skin, roughness: 0.5, flesh: colorsOf('orange').flesh, cookColor: colorsOf('orange').cooked }));
const orangeFleshTex = lazy(() =>
  canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#f9a33a';
      ctx.fillRect(0, 0, w, h);
      const r = rng(8);
      for (let i = 0; i < 70; i++) {
        const x = r.next() * w, y = r.next() * h;
        teardrop(ctx, x, y, r.range(10, 18), r.range(4, 7), r.range(-0.4, 0.4) - Math.PI / 2);
        ctx.fillStyle = r.next() < 0.5 ? 'rgba(255,200,110,0.45)' : 'rgba(230,130,20,0.35)';
        ctx.fill();
      }
    },
    { key: 'fruit-orange-flesh', wrap: true },
  ),
);
const orangeFleshMat = lazy(() => foodMat({ color: '#ffffff', map: orangeFleshTex(), roughness: 0.32, flesh: colorsOf('orange').flesh, cookColor: colorsOf('orange').cooked }));

/** Little star-shaped calyx button (citrus, persimmon-ish). Built at the origin, facing +Y. */
function calyxGeo(R: number, h: number, petals: number, colA: string, colB: string): THREE.BufferGeometry {
  const prof: Profile = smoothProfile([[0.0001, 0], [R * 0.85, 0.00005], [R, h * 0.3], [R * 0.8, h * 0.7], [R * 0.4, h * 0.95], [0.0001, h]], 10);
  const g = lathe(prof, 30);
  deform(g, (p) => {
    const a = Math.atan2(p.x, p.z), rr = Math.hypot(p.x, p.z);
    const k = 0.62 + 0.38 * Math.pow(Math.abs(Math.cos((petals * a) / 2)), 0.7);
    const f = lerp(1, k, sstep(0.25 * R, 0.8 * R, rr));
    p.x *= f;
    p.z *= f;
  });
  const A = col(colA), B = col(colB);
  return paintVertices(g, (p) => A.clone().lerp(B, sstep(0.5 * R, 0, Math.hypot(p.x, p.z))));
}

function citrusPeeledProfile(prof: Profile, k: number): Profile {
  return prof.map(([r, y]) => [Math.max(0.0001, r * k), y * k]);
}

function buildOrange(r: Rng): THREE.Object3D {
  const g = lathe(ORANGE_BODY, 48);
  const k = r.range(0.94, 1.05), sy = r.range(0.95, 1.02), seedN = r.range(0, 40);
  deform(g, (p) => {
    const n = fbm3(p.x * 30 + seedN, p.y * 30, p.z * 30, 2);
    const f = k * (1 + n * 0.025);
    p.x *= f;
    p.z *= f;
    p.y *= k * sy;
  });
  const body = mesh(g, orangeSkinMat(), { skin: true, name: 'orange-body' });
  const top = ORANGE_H * k * sy - 0.0028 * k;
  const cal = mesh(calyxGeo(0.0042, 0.0016, 5, '#6d8a2c', '#5a4a26'), vcStemMat(), { pos: [0, top - 0.0003, 0], rot: [0, r.range(0, TAU), 0] });
  cal.userData.part = 'skin';
  const nub = mesh(stemGeo([[0, top, 0], [0, top + 0.0018, 0], [0.0003, top + 0.0032, 0]], 0.0011, 0.0009, { tub: 3, radial: 6 }), woodyStemMat());
  nub.userData.part = 'skin';
  const root = grp(body, cal, nub);
  root.rotation.set(r.range(-0.12, 0.12), 0, r.range(-0.12, 0.12));
  return seat(root, body);
}

// peeled orange: segments + pith
const ORANGE_SEGS = 10;
const orangePeeledTex = lazy(() =>
  canvasTexture(
    512,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#f7a744';
      ctx.fillRect(0, 0, w, h);
      noiseField(ctx, w, h, [16, 8], 13, (n) => (n > 0.5 ? '#fbbd62' : '#f39a34'), 0.6);
      const r = rng(14);
      // pith patches
      blobs(ctx, w, h, r, 70, '255,244,222', [6, 22], [0.25, 0.6]);
      // segment seams
      for (let k = 0; k <= ORANGE_SEGS; k++) {
        const x = (k / ORANGE_SEGS) * w;
        ctx.strokeStyle = 'rgba(255,246,228,0.95)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      // fibrous pith strands
      ctx.lineCap = 'round';
      for (let i = 0; i < 160; i++) {
        const x = r.next() * w, y0 = r.range(-0.1, 0.8) * h, len = r.range(0.15, 0.6) * h, wob = r.range(-14, 14);
        ctx.strokeStyle = `rgba(255,248,232,${r.range(0.45, 0.9)})`;
        ctx.lineWidth = r.range(0.8, 2.4);
        wrapX(w, x, 16, (xx) => {
          ctx.beginPath();
          ctx.moveTo(xx, y0);
          ctx.quadraticCurveTo(xx + wob, y0 + len / 2, xx + wob * 0.3, y0 + len);
          ctx.stroke();
        });
      }
      // pith caps at the poles
      ctx.fillStyle = linear(ctx, 0, 0, 0, h, [[0, 'rgba(255,246,228,1)'], [0.07, 'rgba(255,246,228,0.6)'], [0.14, 'rgba(255,246,228,0)'], [0.88, 'rgba(255,246,228,0)'], [0.95, 'rgba(255,246,228,0.6)'], [1, 'rgba(255,246,228,1)']]);
      ctx.fillRect(0, 0, w, h);
    },
    { key: 'fruit-orange-peeled' },
  ),
);
const orangePeeledMat = lazy(() => foodMat({ color: '#ffffff', map: orangePeeledTex(), roughness: 0.62, flesh: colorsOf('orange').flesh, cookColor: colorsOf('orange').cooked, name: 'orange-peeled' }));

function peeledOrange(r: Rng): THREE.Object3D {
  const prof = citrusPeeledProfile(ORANGE_CUT, 0.92);
  const g = lathe(prof, 60);
  const k = r.range(0.95, 1.04);
  const R = ORANGE_R * 0.92;
  deform(g, (p) => {
    const a = Math.atan2(p.x, p.z), rr = Math.hypot(p.x, p.z);
    const ph = (((a / TAU) * ORANGE_SEGS) % 1 + 1) % 1;
    const d = Math.min(ph, 1 - ph) * (TAU / ORANGE_SEGS);
    const groove = Math.exp(-((d / 0.075) ** 2)) * 0.03 + (1 - Math.cos(ph * TAU)) * -0.006;
    const f = 1 - groove * sstep(0.1 * R, 0.5 * R, rr);
    p.x *= f * k;
    p.z *= f * k;
    p.y *= k;
  });
  const body = mesh(g, orangePeeledMat(), { name: 'orange-peeled' });
  const root = grp(body);
  root.rotation.y = r.range(0, TAU);
  return seat(root);
}

/** Citrus wheel: rind, pith, segments with vesicles. */
function citrusSection(ctx: Ctx, s: number, o: SectionOpts, c: { rind: string; rindDark: string; pith: string; flesh: string; fleshLight: string; fleshDark: string; segs: number; pith0: number; rind0: number; seeds: number; seedCol: string }) {
  const R = s / 2;
  const cx = R, cy = R;
  if (!o.peeled) {
    fillCircle(ctx, cx, cy, R, radial(ctx, cx, cy, R * 0.85, R, [[0, c.rind], [1, c.rindDark]]));
  }
  const rp = o.peeled ? R : R * c.rind0;
  fillCircle(ctx, cx, cy, rp, c.pith);
  const rs = o.peeled ? R * 0.965 : rp * c.pith0;
  const r = rng(c.segs * 13 + c.seeds);
  const core = rs * 0.1;
  for (let k = 0; k < c.segs; k++) {
    const a0 = (k / c.segs) * TAU + 0.02, a1 = ((k + 1) / c.segs) * TAU - 0.02;
    const gap = s * 0.007;
    ctx.save();
    ctx.beginPath();
    // wedge with rounded outer corners
    const am = (a0 + a1) / 2;
    const off = gap / Math.sin((a1 - a0) / 2);
    const ox = cx + Math.cos(am) * Math.min(off, core), oy = cy + Math.sin(am) * Math.min(off, core);
    ctx.moveTo(ox, oy);
    ctx.lineTo(cx + Math.cos(a0) * rs * 0.94, cy + Math.sin(a0) * rs * 0.94);
    ctx.quadraticCurveTo(cx + Math.cos(a0) * rs, cy + Math.sin(a0) * rs, cx + Math.cos(a0 + 0.06) * rs, cy + Math.sin(a0 + 0.06) * rs);
    ctx.arc(cx, cy, rs, a0 + 0.06, a1 - 0.06);
    ctx.quadraticCurveTo(cx + Math.cos(a1) * rs, cy + Math.sin(a1) * rs, cx + Math.cos(a1) * rs * 0.94, cy + Math.sin(a1) * rs * 0.94);
    ctx.closePath();
    ctx.fillStyle = radial(ctx, cx, cy, core, rs, [[0, c.fleshLight], [0.6, c.flesh], [1, c.fleshDark]]);
    ctx.fill();
    ctx.clip();
    // juice vesicles radiating outwards
    for (let i = 0; i < 46; i++) {
      const a = lerp(a0, a1, r.next()), d = lerp(0.2, 0.95, Math.sqrt(r.next())) * rs;
      const len = rs * r.range(0.12, 0.2), wid = rs * r.range(0.035, 0.06);
      teardrop(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, len, wid, a + Math.PI);
      ctx.fillStyle = r.next() < 0.6 ? 'rgba(255,255,235,0.28)' : 'rgba(120,60,0,0.08)';
      ctx.fill();
    }
    ctx.restore();
  }
  // core
  fillCircle(ctx, cx, cy, core * 1.25, c.pith);
  // seeds
  for (let i = 0; i < c.seeds; i++) {
    const k = r.int(0, c.segs - 1);
    const a = ((k + 0.5) / c.segs) * TAU, d = rs * r.range(0.22, 0.3);
    seed(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, rs * 0.13, rs * 0.07, a + Math.PI, '#d8c890', c.seedCol, 'rgba(255,255,255,0.6)');
  }
}

/** Lengthwise citrus half: rind, pith and segments converging at the poles. */
function citrusSectionV(ctx: Ctx, w: number, h: number, o: SectionOpts, prof: Profile, c: { rind: string; pith: string; flesh: string; fleshLight: string; fleshDark: string; rindT: number; pithT: number }) {
  const m = vmap(prof, w, h);
  ctx.fillStyle = o.peeled ? c.pith : c.rind;
  ctx.fillRect(0, 0, w, h);
  const d0 = o.peeled ? 0 : c.rindT;
  fillSil(ctx, prof, m, d0, c.pith);
  const d1 = d0 + c.pithT;
  fillSil(ctx, prof, m, d1, c.flesh);
  ctx.save();
  silhouette(ctx, prof, m, d1);
  ctx.clip();
  const inner = insetProfile(prof, d1);
  const cx = m.X(0);
  const r = rng(77);
  // segments: lens shapes between meridian-like membranes
  const N = 3;
  const ys = inner.map((p) => p[1]);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const radAt = (y: number) => {
    let best = 0;
    for (let i = 1; i < inner.length; i++) {
      const [r0, y0] = inner[i - 1], [r1, y1] = inner[i];
      if ((y - y0) * (y - y1) <= 0 && y1 !== y0) best = Math.max(best, lerp(r0, r1, (y - y0) / (y1 - y0)));
    }
    return best;
  };
  for (let k = -N; k < N; k++) {
    const f0 = k / N, f1 = (k + 1) / N;
    ctx.beginPath();
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const y = lerp(yMax, yMin, i / steps), rr = radAt(y) * 0.97;
      const x = m.X(f0 * rr);
      if (i) ctx.lineTo(x, m.Y(y));
      else ctx.moveTo(x, m.Y(y));
    }
    for (let i = steps; i >= 0; i--) {
      const y = lerp(yMax, yMin, i / steps), rr = radAt(y) * 0.97;
      ctx.lineTo(m.X(f1 * rr), m.Y(y));
    }
    ctx.closePath();
    const midX = m.X(((f0 + f1) / 2) * m.R * 0.7);
    ctx.fillStyle = radial(ctx, midX, h / 2, 0, h * 0.5, [[0, c.fleshLight], [0.7, c.flesh], [1, c.fleshDark]]);
    ctx.fill();
    ctx.strokeStyle = c.pith;
    ctx.lineWidth = w * 0.012;
    ctx.stroke();
  }
  // vesicles: elongated along the segments
  for (let i = 0; i < 160; i++) {
    const x = r.next() * w, y = r.range(0.05, 0.95) * h;
    const dx = (x - cx) / (w / 2);
    const ang = -Math.PI / 2 + dx * 0.5 * Math.sign(y - h / 2 || 1);
    teardrop(ctx, x, y, w * r.range(0.05, 0.09), w * r.range(0.018, 0.03), ang);
    ctx.fillStyle = r.next() < 0.6 ? 'rgba(255,255,235,0.25)' : 'rgba(120,60,0,0.07)';
    ctx.fill();
  }
  // central pith column
  ctx.fillStyle = c.pith;
  ctx.beginPath();
  ctx.ellipse(cx, m.Y((yMin + yMax) / 2), w * 0.018, (yMax - yMin) * m.ky * 0.48, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

const ORANGE_SECTION = { rind: '#f8961f', rindDark: '#e57d10', pith: '#fdf3df', flesh: '#f9a12f', fleshLight: '#fcbb56', fleshDark: '#f28e1c', segs: 10, pith0: 0.92, rind0: 0.955, seeds: 0, seedCol: '#f2e8c6' };

const ORANGE: ModelDef = {
  build: buildOrange,
  peeled: peeledOrange,
  profile: ORANGE_CUT,
  skin: orangeSkinCutMat,
  flesh: orangeFleshMat,
  section: (ctx, s, o) => citrusSection(ctx, s, o, ORANGE_SECTION),
  sectionV: (ctx, w, h, o) => citrusSectionV(ctx, w, h, o, ORANGE_CUT, { rind: '#f28a1a', pith: '#fdf3df', flesh: '#f9a12f', fleshLight: '#fcbb56', fleshDark: '#f28e1c', rindT: 0.0018, pithT: 0.0022 }),
};

// ---------------------------------------------------------------------------------------------
// LEMON (lies on its side; profile upright)

const LEMON_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0.0],
    [0.0028, 0.0009],
    [0.005, 0.0036],
    [0.0098, 0.008],
    [0.0172, 0.0152],
    [0.0242, 0.0258],
    [0.0272, 0.0372],
    [0.0262, 0.0488],
    [0.0218, 0.0588],
    [0.0146, 0.0664],
    [0.0078, 0.0712],
    [0.0046, 0.0736],
    [0.0001, 0.075],
  ],
  44,
);
const LEMON_H = 0.075;

const lemonPores = lazy(() => poreField(LEMON_PROFILE, 512, 512, 0.0014, 0.0005, 43, 2));
const lemonColorTex = lazy(() => {
  const t = canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#f8df45';
      ctx.fillRect(0, 0, w, h);
      noiseField(ctx, w, h, [10, 10], 7, (n) => (n > 0.5 ? '#fbe965' : '#efcf2c'), 0.5);
      // greenish tips
      ctx.fillStyle = linear(ctx, 0, 0, 0, h, [[0, 'rgba(176,190,50,0.65)'], [0.08, 'rgba(176,190,50,0)'], [0.92, 'rgba(176,190,50,0)'], [1, 'rgba(176,190,50,0.55)']]);
      ctx.fillRect(0, 0, w, h);
      for (const p of lemonPores()) wrapX(w, p.x, p.rx + 1, (xx) => fillEllipse(ctx, xx, p.y, p.rx * 1.3, p.ry * 1.3, 0, 'rgba(200,160,10,0.28)'));
    },
    { key: 'fruit-lemon-color' },
  );
  t.repeat.set(2, 1);
  return t;
});
const lemonNormalTex = lazy(() =>
  normalTex(
    'fruit-lemon-normal',
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(0, 0, w, h);
      noiseField(ctx, w, h, [20, 20], 19, (n) => (n > 0.5 ? '#b4b4b4' : '#868686'), 0.8);
      for (const p of lemonPores())
        wrapX(w, p.x, p.rx * 1.6, (xx) => {
          ctx.fillStyle = radial(ctx, xx, p.y, 0, Math.max(p.rx, p.ry) * 1.6, [[0, 'rgba(20,20,20,0.8)'], [0.6, 'rgba(60,60,60,0.35)'], [1, 'rgba(60,60,60,0)']]);
          ctx.beginPath();
          ctx.ellipse(xx, p.y, p.rx * 1.6, p.ry * 1.6, 0, 0, TAU);
          ctx.fill();
        });
    },
    2.2,
    false,
    [2, 1],
  ),
);
const lemonSkinMat = lazy(() =>
  withNormalScale(
    foodMat({ color: '#ffffff', map: lemonColorTex(), normalMap: lemonNormalTex(), roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.35, flesh: colorsOf('lemon').flesh, cookColor: colorsOf('lemon').cooked, name: 'lemon-skin' }),
    1.3,
  ),
);
const lemonSkinCutMat = lazy(() => foodMat({ color: colorsOf('lemon').skin, roughness: 0.45, flesh: colorsOf('lemon').flesh, cookColor: colorsOf('lemon').cooked }));
const lemonFleshTex = lazy(() =>
  canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#f9ec8c';
      ctx.fillRect(0, 0, w, h);
      const r = rng(9);
      for (let i = 0; i < 70; i++) {
        teardrop(ctx, r.next() * w, r.next() * h, r.range(10, 18), r.range(4, 7), r.range(-0.4, 0.4) - Math.PI / 2);
        ctx.fillStyle = r.next() < 0.5 ? 'rgba(255,255,220,0.5)' : 'rgba(200,170,40,0.25)';
        ctx.fill();
      }
    },
    { key: 'fruit-lemon-flesh', wrap: true },
  ),
);
const lemonFleshMat = lazy(() => foodMat({ color: '#ffffff', map: lemonFleshTex(), roughness: 0.3, flesh: colorsOf('lemon').flesh, cookColor: colorsOf('lemon').cooked }));

function buildLemon(r: Rng): THREE.Object3D {
  const g = lathe(LEMON_PROFILE, 44);
  const k = r.range(0.94, 1.05), seedN = r.range(0, 40), fat = r.range(0.96, 1.06);
  deform(g, (p) => {
    const n = fbm3(p.x * 34 + seedN, p.y * 34, p.z * 34, 2);
    const f = k * fat * (1 + n * 0.03);
    p.x *= f;
    p.z *= f;
    p.y *= k;
  });
  const body = mesh(g, lemonSkinMat(), { name: 'lemon-body' });
  const top = LEMON_H * k;
  const cal = mesh(calyxGeo(0.0034, 0.0013, 5, '#7d8a30', '#5e4a26'), vcStemMat(), { pos: [0, top - 0.0009, 0] });
  const up = grp(body, cal);
  // lie on its side
  up.rotation.set(0, 0, Math.PI / 2 + r.range(-0.08, 0.08));
  const root = grp(up);
  root.rotation.y = r.range(-0.35, 0.35);
  return seat(root, body);
}

const LEMON_SECTION = { rind: '#f7dc3c', rindDark: '#e8c628', pith: '#fdf8e4', flesh: '#f8ea86', fleshLight: '#fbf3b4', fleshDark: '#f2dd62', segs: 9, pith0: 0.88, rind0: 0.965, seeds: 2, seedCol: '#f6efd2' };

const LEMON: ModelDef = {
  build: buildLemon,
  profile: LEMON_PROFILE,
  skin: lemonSkinCutMat,
  flesh: lemonFleshMat,
  section: (ctx, s, o) => citrusSection(ctx, s, o, LEMON_SECTION),
  sectionV: (ctx, w, h, o) => citrusSectionV(ctx, w, h, o, LEMON_PROFILE, { rind: '#f2d530', pith: '#fdf8e4', flesh: '#f8ea86', fleshLight: '#fbf3b4', fleshDark: '#f2dd62', rindT: 0.0012, pithT: 0.0024 }),
};

// =============================================================================================
// STRAWBERRY (profile upright, tip at y = 0; the whole lies on its side)

const STRAW_H = 0.0455;
const STRAW_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0.0],
    [0.0032, 0.0011],
    [0.0072, 0.0048],
    [0.0112, 0.0106],
    [0.0147, 0.0185],
    [0.0168, 0.0268],
    [0.0177, 0.0338],
    [0.0171, 0.0396],
    [0.0146, 0.0435],
    [0.0102, 0.0455],
    [0.0052, 0.0458],
    [0.002, 0.0449],
    [0.0001, 0.0444],
  ],
  40,
);

interface Seed2D {
  x: number;
  y: number;
  ku: number;
  kv: number;
}

const strawSeeds = lazy(() => {
  const out: Seed2D[] = [];
  scatterLathe(latheInfo(STRAW_PROFILE), 0.0042, rng(57), 512, 256, (x, y, ku, kv) => out.push({ x, y, ku, kv }), { v0: 0.03, v1: 0.9, jitter: 0.25 });
  return out;
});

const strawColorTex = lazy(() =>
  canvasTexture(
    512,
    256,
    (ctx, w, h) => {
      // gradient by height: deep red tip -> red -> lighter shoulders -> pale under the calyx
      ctx.fillStyle = linear(ctx, 0, h, 0, 0, [
        [0, '#b80f24'],
        [0.12, '#d01a2e'],
        [0.5, '#e3263a'],
        [0.8, '#ea3443'],
        [0.9, '#ee5a52'],
        [0.97, '#f2b48a'],
        [1, '#e8d0a0'],
      ]);
      ctx.fillRect(0, 0, w, h);
      noiseField(ctx, w, h, [16, 8], 21, (n) => (n > 0.5 ? '#ff5a5a' : '#a80a20'), 0.18);
      for (const s of strawSeeds()) {
        const px = 0.0012 * s.ku, py = 0.0013 * s.kv;
        wrapX(w, s.x, px * 1.5, (xx) => {
          // pit shadow
          fillEllipse(ctx, xx, s.y, px * 1.25, py * 1.25, 0, radial(ctx, xx, s.y, 0, Math.max(px, py) * 1.3, [[0, 'rgba(110,0,16,0.55)'], [1, 'rgba(110,0,16,0)']]));
          // seed
          fillEllipse(ctx, xx, s.y - py * 0.1, px * 0.42, py * 0.62, 0, '#e8c040');
          fillEllipse(ctx, xx - px * 0.1, s.y - py * 0.25, px * 0.2, py * 0.28, 0, '#fbe57a');
        });
      }
    },
    { key: 'fruit-straw-color' },
  ),
);

const strawNormalTex = lazy(() =>
  normalTex(
    'fruit-straw-normal',
    512,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#a0a0a0';
      ctx.fillRect(0, 0, w, h);
      for (const s of strawSeeds()) {
        const px = 0.0012 * s.ku, py = 0.0013 * s.kv;
        wrapX(w, s.x, px * 1.6, (xx) => {
          ctx.fillStyle = radial(ctx, xx, s.y, 0, Math.max(px, py) * 1.5, [[0, 'rgba(10,10,10,0.9)'], [0.7, 'rgba(70,70,70,0.4)'], [1, 'rgba(90,90,90,0)']]);
          ctx.beginPath();
          ctx.ellipse(xx, s.y, px * 1.5, py * 1.5, 0, 0, TAU);
          ctx.fill();
          fillEllipse(ctx, xx, s.y - py * 0.1, px * 0.45, py * 0.6, 0, radial(ctx, xx, s.y, 0, py * 0.6, [[0, '#d8d8d8'], [1, '#909090']]));
        });
      }
    },
    3.2,
  ),
);

const strawSkinMat = lazy(() =>
  withNormalScale(
    foodMat({ color: '#ffffff', map: strawColorTex(), normalMap: strawNormalTex(), roughness: 0.3, clearcoat: 0.75, clearcoatRoughness: 0.22, flesh: colorsOf('strawberry').flesh, cookColor: colorsOf('strawberry').cooked, name: 'straw-skin' }),
    0.8,
  ),
);
const strawSkinCutMat = lazy(() => foodMat({ color: colorsOf('strawberry').skin, roughness: 0.32, clearcoat: 0.5, flesh: colorsOf('strawberry').flesh, cookColor: colorsOf('strawberry').cooked }));
const strawFleshTex = lazy(() =>
  canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = radial(ctx, w / 2, h / 2, 0, w * 0.7, [[0, '#fbd0d0'], [0.45, '#f47f86'], [1, '#e53848']]);
      ctx.fillRect(0, 0, w, h);
      const r = rng(4);
      ctx.strokeStyle = 'rgba(255,230,230,0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 10; i++) {
        const a = r.next() * TAU;
        ctx.beginPath();
        ctx.moveTo(w / 2, h / 2);
        ctx.lineTo(w / 2 + Math.cos(a) * w * 0.7, h / 2 + Math.sin(a) * h * 0.7);
        ctx.stroke();
      }
    },
    { key: 'fruit-straw-flesh' },
  ),
);
const strawFleshMat = lazy(() => foodMat({ color: '#ffffff', map: strawFleshTex(), roughness: 0.32, flesh: colorsOf('strawberry').flesh, cookColor: colorsOf('strawberry').cooked }));
const sepalMat = lazy(() =>
  foodMat({ color: '#ffffff', map: leafTexture('fruit-sepal', '#3f9636', '#52aa42', '#8fd06a', '#2f7a2a', 4), roughness: 0.55, flesh: '#7ab85a', cookColor: '#4a4a20', cookAmount: 0.35, name: 'sepal' }),
);

/**
 * Drape a flat leaf (built along +Z from the origin) down a lathe profile from its top centre:
 * leaf z -> arc length down the profile, x -> across, y -> lift off the surface.
 */
function drapeLeaf(g: THREE.BufferGeometry, prof: Profile, yaw: number, offset: number, tipLift: number, len: number): THREE.BufferGeometry {
  const pts = [...prof].reverse();
  const arc = [0];
  for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const pos = g.attributes.position as THREE.BufferAttribute;
  const sn = Math.sin(yaw), cs = Math.cos(yaw);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = Math.max(0, pos.getZ(i));
    let j = 1;
    while (j < pts.length - 1 && arc[j] < z) j++;
    const t = clamp((z - arc[j - 1]) / Math.max(1e-9, arc[j] - arc[j - 1]));
    const rr = lerp(pts[j - 1][0], pts[j][0], t), py = lerp(pts[j - 1][1], pts[j][1], t);
    let tr = pts[j][0] - pts[j - 1][0], ty = pts[j][1] - pts[j - 1][1];
    const l = Math.hypot(tr, ty) || 1;
    tr /= l;
    ty /= l;
    const nr = -ty, ny = tr;
    const lift = offset + y + tipLift * Math.pow(z / len, 2.2);
    const R = rr + nr * lift;
    pos.setXYZ(i, R * sn + x * cs, py + ny * lift, R * cs - x * sn);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** Strawberry calyx (sepals draped over the shoulders + a short stem), in the upright frame. */
function strawCalyx(r: Rng, xf: (p: THREE.Vector3) => void): THREE.Object3D {
  const g = new THREE.Group();
  const n = r.int(7, 9);
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const len = r.range(0.0125, 0.0165), wid = r.range(0.0055, 0.0072);
    const lg = leafGeo({ length: len, width: wid, curl: 0, fold: 0.18, segments: 7, outline: (t) => Math.pow(1 - t, 0.9) * Math.min(1, t * 6 + 0.35) });
    const yaw = (i / n) * TAU + r.range(-0.18, 0.18);
    drapeLeaf(lg, STRAW_PROFILE, yaw, 0.0005, r.range(0.0015, 0.0035), len);
    deform(lg, (p) => xf(p));
    geos.push(lg);
  }
  g.add(mesh(merge(geos), sepalMat()));
  const top = new THREE.Vector3(0, 0.0446, 0);
  xf(top);
  const bend = r.range(-0.003, 0.003);
  g.add(mesh(stemGeo([[top.x, top.y - 0.002, top.z], [top.x, top.y + 0.004, top.z], [top.x + bend * 0.5, top.y + 0.008, top.z + 0.0005], [top.x + bend, top.y + 0.0105, top.z + 0.001]], 0.0012, 0.001, { tub: 6, radial: 7 }), greenStemMat()));
  return g;
}

function buildStrawberry(r: Rng): THREE.Object3D {
  const g = lathe(STRAW_PROFILE, 44);
  const k = r.range(0.9, 1.08), sx = r.range(0.95, 1.06), sz = r.range(0.94, 1.04), seedN = r.range(0, 30), lean = r.range(-0.08, 0.08);
  const xf = (p: THREE.Vector3) => {
    const n = fbm3(p.x * 70 + seedN, p.y * 70, p.z * 70, 2);
    const f = 1 + n * 0.035;
    p.x = (p.x * sx * f + lean * (STRAW_H - p.y) * 0.5) * k;
    p.z *= sz * f * k;
    p.y *= k;
  };
  deform(g, xf);
  const body = mesh(g, strawSkinMat(), { name: 'straw-body' });
  const calyx = strawCalyx(r, xf);
  const up = grp(body, calyx);
  up.rotation.set(0, 0, -(Math.PI / 2) * r.range(0.72, 0.86));
  const root = grp(up);
  root.rotation.y = r.range(-0.6, 0.6) + Math.PI;
  return seat(root, body);
}

function strawSection(ctx: Ctx, s: number, o: SectionOpts) {
  const c = s / 2;
  fillCircle(ctx, c, c, c, radial(ctx, c, c, 0, c, [[0, '#fff1ee'], [0.22, '#fcd6d4'], [0.45, '#f6909a'], [0.7, '#ec4d5a'], [0.9, '#e0283a'], [1, '#c8142a']]));
  const r = rng(22);
  // vascular strands from the pith to the seeds
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + r.range(-0.1, 0.1);
    ctx.strokeStyle = 'rgba(255,236,236,0.55)';
    ctx.lineWidth = s * r.range(0.008, 0.013);
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * c * 0.2, c + Math.sin(a) * c * 0.2);
    ctx.quadraticCurveTo(c + Math.cos(a + 0.12) * c * 0.6, c + Math.sin(a + 0.12) * c * 0.6, c + Math.cos(a) * c * 0.95, c + Math.sin(a) * c * 0.95);
    ctx.stroke();
  }
  discDots(ctx, c, c, c, r, 140, 'rgba(255,255,255,0.18)', [s * 0.004, s * 0.009], 0.3, 0.95);
  // seeds at the rim
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + r.range(-0.08, 0.08);
    fillEllipse(ctx, c + Math.cos(a) * c * 0.965, c + Math.sin(a) * c * 0.965, s * 0.014, s * 0.009, a, '#e8c040');
  }
}

function strawSectionV(ctx: Ctx, w: number, h: number) {
  const prof = STRAW_PROFILE;
  const m = vmap(prof, w, h);
  ctx.fillStyle = '#c8142a';
  ctx.fillRect(0, 0, w, h);
  layeredSil(ctx, prof, m, [
    [0.0005, '#dc2236'],
    [0.0018, '#e8404e'],
    [0.0034, '#f27480'],
    [0.0052, '#f8aeb2'],
  ]);
  // pale pith: elongated teardrop along the axis
  const cx = m.X(0);
  const yTop = m.Y(0.043), yBot = m.Y(0.012);
  ctx.beginPath();
  ctx.moveTo(cx, yBot);
  ctx.bezierCurveTo(cx + 0.007 * m.kx, lerp(yBot, yTop, 0.4), cx + 0.0085 * m.kx, lerp(yBot, yTop, 0.95), cx, yTop);
  ctx.bezierCurveTo(cx - 0.0085 * m.kx, lerp(yBot, yTop, 0.95), cx - 0.007 * m.kx, lerp(yBot, yTop, 0.4), cx, yBot);
  ctx.fillStyle = radial(ctx, cx, lerp(yBot, yTop, 0.6), 0, (yBot - yTop) * 0.7, [[0, '#fff4f0'], [0.7, '#fde0dc'], [1, 'rgba(250,200,200,0.4)']]);
  ctx.fill();
  // strands from the pith to the surface
  const r = rng(23);
  ctx.save();
  silhouette(ctx, prof, m, 0);
  ctx.clip();
  ctx.lineCap = 'round';
  for (let i = 0; i < 18; i++) {
    const t = r.range(0.1, 0.95), sgn = i % 2 ? 1 : -1;
    const y0 = lerp(yBot, yTop, t);
    ctx.strokeStyle = 'rgba(255,230,230,0.5)';
    ctx.lineWidth = w * r.range(0.008, 0.014);
    ctx.beginPath();
    ctx.moveTo(cx + sgn * 0.002 * m.kx, y0);
    ctx.quadraticCurveTo(cx + sgn * 0.01 * m.kx, y0 + h * 0.03, cx + sgn * 0.02 * m.kx, y0 + h * r.range(0.04, 0.12));
    ctx.stroke();
  }
  // calyx attachment
  fillEllipse(ctx, cx, m.Y(0.0445), 0.004 * m.kx, 0.0012 * m.ky, 0, '#f4e2c0');
  ctx.restore();
}

const STRAWBERRY: ModelDef = {
  build: buildStrawberry,
  profile: STRAW_PROFILE,
  skin: strawSkinCutMat,
  flesh: strawFleshMat,
  section: strawSection,
  sectionV: strawSectionV,
};

// =============================================================================================

// @@REST@@

export const MODELS: ModelTable = {
  apple: APPLE,
  banana: BANANA,
  orange: ORANGE,
  lemon: LEMON,
  strawberry: STRAWBERRY,
};
