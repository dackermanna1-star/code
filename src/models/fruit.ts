// Fruit models: apple, banana, orange, lemon, strawberry, watermelon, pineapple, grapes, cherry,
// peach, pear, kiwi, blueberry, mango, coconut, avocado.
//
// Approach
//  - Bodies are lathes whose UV v follows the profile's arc length, so canvas textures can be
//    painted with an even world-space density (seeds, pores, pineapple eyes).
//  - Broad colour (blush, ripeness gradients) comes from vertex colours; fine detail from canvas
//    maps and normal maps generated from painted height fields. Where a map has to *lighten*
//    (lenticels, streaks) the map's base is a light grey and the vertex colours are boosted.
//  - Big procedural skins (watermelon stripes, pineapple eye lattice, avocado pebbles) are painted
//    per pixel in metres over the lathe's texture space (`latheField`), giving colour + a float
//    height field that becomes the normal map without 8-bit banding (`normalField`).
//  - `profile` (for the generic cut forms) always starts at the lowest point on the axis, so the
//    forms' face UVs line up with `sectionV`. Items that lie down (lemon, strawberry, watermelon,
//    kiwi, mango, avocado, coconut) keep an upright profile and rotate in `build`.
//  - 'bunch' items (grapes, cherry, blueberry) merge their pieces into one or two meshes;
//    `piece` builds one grape / cherry with stem / berry.
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
      writeNormals(ctx, H, w, h, strength, wrapY);
    },
    { key, srgb: false, wrap: true },
  );
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}

/** Height field (row-major, canvas orientation) -> tangent-space normal map pixels. */
function writeNormals(ctx: Ctx, H: Float32Array, w: number, h: number, strength: number, wrapY: boolean) {
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
}

/** Normal map straight from a float height field (no 8-bit banding). */
function normalField(key: string, w: number, h: number, field: () => Float32Array, strength: number, wrapY = false): THREE.Texture {
  return canvasTexture(w, h, (ctx) => writeNormals(ctx, field(), w, h, strength, wrapY), { key, srgb: false, wrap: true });
}

// ---------------------------------------------------------------------------------------------
// Per-pixel painting (big procedural skins: stripes, eyes, pebbles, hair)

type RGB = [number, number, number];
const hexRGB = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** o += (c - o) * t */
function blend(o: RGB, c: RGB, t: number) {
  if (t <= 0) return;
  if (t > 1) t = 1;
  o[0] += (c[0] - o[0]) * t;
  o[1] += (c[1] - o[1]) * t;
  o[2] += (c[2] - o[2]) * t;
}
function setRGB(o: RGB, c: RGB) {
  o[0] = c[0];
  o[1] = c[1];
  o[2] = c[2];
}

/** Fill a canvas pixel by pixel (opaque). `fn` writes 0..255 sRGB into `o`. */
function pixels(ctx: Ctx, w: number, h: number, fn: (x: number, y: number, o: RGB) => void) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const o: RGB = [0, 0, 0];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      fn(x, y, o);
      const i = (y * w + x) * 4;
      d[i] = o[0];
      d[i + 1] = o[1];
      d[i + 2] = o[2];
      d[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

/** Value noise seamless in u (0..1 wraps around a circle of radius fu). */
const noiseU = (u: number, v: number, fu: number, fv: number, s = 0) => noise3(Math.cos(u * TAU) * fu + s, Math.sin(u * TAU) * fu - s * 0.7, v * fv + s * 0.31);
const fbmU = (u: number, v: number, fu: number, fv: number, s = 0, oct = 3) => fbm3(Math.cos(u * TAU) * fu + s, Math.sin(u * TAU) * fu - s * 0.7, v * fv + s * 0.31, oct);

/** Cheap integer hash -> 0..1. */
const hash1 = (n: number) => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Colour from gradient stops at t. */
function stopColor(stops: [number, string][], t: number): THREE.Color {
  if (t <= stops[0][0]) return col(stops[0][1]);
  for (let i = 1; i < stops.length; i++)
    if (t <= stops[i][0]) return col(stops[i - 1][1]).lerp(col(stops[i][1]), (t - stops[i - 1][0]) / Math.max(1e-6, stops[i][0] - stops[i - 1][0]));
  return col(stops[stops.length - 1][1]);
}

/** Stem tube vertex-coloured along its length (t = distance from the first point / span). Use with vcStemMat(). */
function colorStem(pts: V3[], r0: number, r1: number, stops: [number, string][], o: { tub?: number; radial?: number; caps?: 'round' | 'flat' } = {}): THREE.BufferGeometry {
  const g = stemGeo(pts, r0, r1, o);
  const a = new THREE.Vector3(...pts[0]);
  const span = Math.max(1e-6, a.distanceTo(new THREE.Vector3(...pts[pts.length - 1])));
  return paintVertices(g, (p) => stopColor(stops, p.distanceTo(a) / span));
}

/** Bake position / Euler (YXZ: yaw, pitch, roll) / scale into a geometry. */
function bake(g: THREE.BufferGeometry, pos: V3, yaw = 0, pitch = 0, roll = 0, scale: number | V3 = 1): THREE.BufferGeometry {
  const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ')), s);
  return g.applyMatrix4(m);
}

/** Tileable value-noise field painted per pixel (cheap: low-res then scaled up smoothly). */
function noiseField(ctx: Ctx, w: number, h: number, cells: [number, number], seed: number, map: (n: number) => string, alpha = 1) {
  const cw = cells[0], ch = cells[1];
  const small = makeCanvas(cw * 3, ch * 3) as HTMLCanvasElement;
  const sx = small.getContext('2d', { willReadFrequently: true }) as Ctx;
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
// WATERMELON (oval; lies on its side. Profile upright: blossom end at y = 0, stem end on top)

const WM_L = 0.258, WM_R = 0.1;
const WM_PROFILE: Profile = (() => {
  const pts: Profile = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const th = -Math.PI / 2 + (i / n) * Math.PI;
    pts.push([Math.max(0.0001, WM_R * Math.pow(Math.max(0, Math.cos(th)), 0.86)), (WM_L / 2) * (1 + Math.sin(th))]);
  }
  return pts;
})();
const WM_STRIPES = 15;
/** Texture u of the field spot: faces down / sideways once the melon lies down. */
const WM_SPOT_U = 0.86;

/** Striped rind. `whole` adds the field spot and the pole scars (not wanted on cut pieces). */
function wmSkinTex(whole: boolean): THREE.Texture {
  const w = whole ? 1024 : 512, h = whole ? 512 : 256;
  return canvasTexture(
    w,
    h,
    (ctx) => {
      const L = latheInfo(WM_PROFILE);
      const LIGHT = hexRGB('#a2cf66'), LIGHT2 = hexRGB('#bddf84'), LIGHTD = hexRGB('#7db44c');
      const DARK = hexRGB('#2c6b2b'), DARK2 = hexRGB('#1f5323'), DARKL = hexRGB('#3e8838');
      const SPOT = hexRGB('#e8d88c'), SPOT2 = hexRGB('#d2bd6a'), BLOSSOM = hexRGB('#8c7c46'), STEM = hexRGB('#5d6e2c');
      const tmp: RGB = [0, 0, 0];
      let rowY = -1, sv = 0, rad = 0;
      pixels(ctx, w, h, (x, y, o) => {
        if (y !== rowY) {
          rowY = y;
          const v = 1 - (y + 0.5) / h;
          sv = v * L.total;
          rad = Math.max(0.004, radiusAtV(L, v));
        }
        const u = (x + 0.5) / w;
        // pale ground netted with darker veins
        const n1 = fbmU(u, sv, 5, 30, 1.7, 3);
        setRGB(o, LIGHT);
        blend(o, n1 > 0 ? LIGHT2 : LIGHTD, Math.abs(n1) * 1.8);
        blend(o, LIGHTD, sstep(0.84, 0.96, 1 - Math.abs(fbmU(u, sv, 12, 70, 4.1, 2))) * 0.9);
        // jagged dark stripes running from pole to pole
        const fu = u * WM_STRIPES;
        const k0 = Math.floor(fu);
        let cover = 0;
        for (let kk = k0 - 1; kk <= k0 + 1; kk++) {
          const k = ((kk % WM_STRIPES) + WM_STRIPES) % WM_STRIPES;
          const d = fu - (kk + 0.5 + 0.16 * noise3(k * 3.7, sv * 18, 0.5));
          const hw = 0.25 * (1 + 0.2 * noise3(k * 5.3, sv * 26, 1.1)) + 0.085 * fbm3(k * 7.1 + (d > 0 ? 13.1 : 0), sv * 120, 2.3, 2);
          cover = Math.max(cover, sstep(hw + 0.03, hw - 0.03, Math.abs(d)));
        }
        if (cover > 0) {
          const n2 = fbmU(u, sv, 9, 50, 7.7, 2);
          setRGB(tmp, DARK);
          blend(tmp, n2 > 0 ? DARKL : DARK2, Math.abs(n2) * 1.6);
          blend(o, tmp, cover);
        }
        if (whole) {
          let du = u - WM_SPOT_U;
          du -= Math.round(du);
          const ex = (du * TAU * rad) / 0.052, ey = (sv - L.total * 0.52) / 0.08;
          const sp = sstep(1, 0.55, Math.sqrt(ex * ex + ey * ey) + 0.3 * fbmU(u, sv, 7, 40, 9.1, 2));
          if (sp > 0) {
            setRGB(tmp, SPOT);
            blend(tmp, SPOT2, 0.5 + 0.5 * noiseU(u, sv, 20, 120, 3.3));
            blend(o, tmp, sp * 0.95);
          }
          blend(o, BLOSSOM, sstep(0.011, 0.005, sv) * 0.9);
          blend(o, STEM, sstep(0.014, 0.006, L.total - sv) * 0.8);
        }
      });
    },
    { key: whole ? 'fruit-wm-skin' : 'fruit-wm-skin-cut' },
  );
}

const wmSkinMat = lazy(() =>
  foodMat({ color: '#ffffff', map: wmSkinTex(true), roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.3, flesh: colorsOf('watermelon').flesh, cookColor: colorsOf('watermelon').cooked, name: 'watermelon-skin' }),
);
const wmSkinCutMat = lazy(() =>
  foodMat({ color: '#ffffff', map: wmSkinTex(false), roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.35, flesh: colorsOf('watermelon').flesh, cookColor: colorsOf('watermelon').cooked }),
);
const wmFleshTex = lazy(() =>
  canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#f2475a';
      ctx.fillRect(0, 0, w, h);
      const r = rng(61);
      blobs(ctx, w, h, r, 60, '255,140,150', [3, 8], [0.2, 0.45]);
      blobs(ctx, w, h, r, 40, '196,18,44', [3, 9], [0.12, 0.3]);
    },
    { key: 'fruit-wm-flesh', wrap: true },
  ),
);
const wmFleshMat = lazy(() => foodMat({ color: '#ffffff', map: wmFleshTex(), roughness: 0.28, flesh: colorsOf('watermelon').flesh, cookColor: colorsOf('watermelon').cooked }));

function buildWatermelon(r: Rng): THREE.Object3D {
  const g = lathe(WM_PROFILE, 64);
  const k = r.range(0.95, 1.04), fat = r.range(0.95, 1.04), seedN = r.range(0, 40);
  deform(g, (p) => {
    const n = fbm3(p.x * 8 + seedN, p.y * 8, p.z * 8, 2);
    const f = k * fat * (1 + n * 0.025);
    p.x *= f;
    p.z *= f;
    p.y *= k;
  });
  const body = mesh(g, wmSkinMat(), { name: 'watermelon-body' });
  const top = WM_L * k, c = r.range(0.006, 0.01) * r.sign();
  const stem = mesh(
    colorStem([[0, top - 0.004, 0], [0, top + 0.004, 0], [c * 0.4, top + 0.011, 0.003], [c, top + 0.014, 0.008]], 0.0034, 0.0022, [[0, '#6f7f34'], [0.7, '#7a6a3a'], [1, '#5a4422']], { tub: 8, radial: 9 }),
    vcStemMat(),
  );
  const spin = grp(body, stem);
  spin.rotation.y = r.range(-0.3, 0.3);
  const up = grp(spin);
  up.rotation.z = Math.PI / 2 + r.range(-0.03, 0.03);
  const root = grp(up);
  root.rotation.y = r.range(-0.5, 0.5);
  return seat(root, body);
}

function wmSection(ctx: Ctx, s: number, o: SectionOpts) {
  const c = s / 2;
  const r = rng(63);
  let R = c;
  if (!o.peeled) {
    // striped rind edge
    const n = WM_STRIPES * 2;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, c, (i / n) * TAU, ((i + 1) / n) * TAU + 0.01);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? '#2c6b2b' : '#6fa646';
      ctx.fill();
    }
    R = c * 0.965;
    fillCircle(ctx, c, c, R, radial(ctx, c, c, R * 0.84, R, [[0, '#f6f4dc'], [0.45, '#e4f0bc'], [0.8, '#b9d98a'], [1, '#8fc263']]));
    R = c * 0.845;
  }
  // flesh: deep red heart, paler near the rind
  fillCircle(ctx, c, c, R, radial(ctx, c, c, 0, R, [[0, '#ee324c'], [0.65, '#f1435a'], [0.86, '#f3606f'], [0.95, '#f7a8a2'], [1, '#f9dcc6']]));
  // juicy crystals
  discDots(ctx, c, c, R * 0.93, r, 380, 'rgba(255,175,180,0.3)', [s * 0.004, s * 0.011]);
  discDots(ctx, c, c, R * 0.93, r, 240, 'rgba(186,14,40,0.18)', [s * 0.004, s * 0.01]);
  // seeds in a loose ring, tips pointing to the centre
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r.range(-0.16, 0.16), d = R * r.range(0.5, 0.66);
    seed(ctx, c + Math.cos(a) * d, c + Math.sin(a) * d, s * 0.055, s * 0.032, a + Math.PI + r.range(-0.3, 0.3), '#160e0a', '#5a3a26');
  }
  for (let i = 0; i < 5; i++) {
    const a = r.range(0, TAU), d = R * r.range(0.35, 0.6);
    seed(ctx, c + Math.cos(a) * d, c + Math.sin(a) * d, s * 0.035, s * 0.02, a + Math.PI, '#e8d6c0', '#fff6ea', 'rgba(255,255,255,0.3)');
  }
}

function wmSectionV(ctx: Ctx, w: number, h: number, o: SectionOpts) {
  const prof = WM_PROFILE;
  const m = vmap(prof, w, h);
  ctx.fillStyle = o.peeled ? '#cfe3a0' : '#2c6b2b';
  ctx.fillRect(0, 0, w, h);
  const d0 = o.peeled ? 0 : 0.0032;
  layeredSil(ctx, prof, m, [
    [d0, '#8fc263'],
    [d0 + 0.003, '#c6e09a'],
    [d0 + 0.007, '#eef3d4'],
    [d0 + 0.0105, '#f8d8c6'],
    [d0 + 0.0125, '#f5909a'],
    [d0 + 0.0155, '#f35a6a'],
    [d0 + 0.022, '#f2475a'],
    [d0 + 0.045, '#ef384f'],
  ]);
  const r = rng(64);
  ctx.save();
  silhouette(ctx, prof, m, d0 + 0.013);
  ctx.clip();
  for (let i = 0; i < 700; i++) fillCircle(ctx, r.next() * w, r.next() * h, w * r.range(0.004, 0.01), r.next() < 0.6 ? 'rgba(255,175,180,0.28)' : 'rgba(186,14,40,0.16)');
  // seeds on an inner shell, pointing towards the core
  const ring = insetProfile(prof, 0.045);
  const cx = m.X(0);
  for (let i = 0; i < 30; i++) {
    const j = Math.floor(r.range(0.1, 0.9) * (ring.length - 1));
    const side = i % 2 ? 1 : -1;
    const px = m.X(side * ring[j][0] * r.range(0.85, 1.12)), py = m.Y(ring[j][1] + r.range(-0.004, 0.004));
    const ty = m.Y(clamp(ring[j][1], WM_L * 0.3, WM_L * 0.7));
    const ang = Math.atan2(ty - py, cx - px) + r.range(-0.25, 0.25);
    if (i % 7 === 6) seed(ctx, px, py, 0.006 * m.kx, 0.0035 * m.kx, ang, '#e8d6c0', '#fff6ea', 'rgba(255,255,255,0.3)');
    else seed(ctx, px, py, 0.0095 * m.kx, 0.0056 * m.kx, ang, '#160e0a', '#5a3a26');
  }
  ctx.restore();
}

const WATERMELON: ModelDef = {
  build: buildWatermelon,
  profile: WM_PROFILE,
  skin: wmSkinCutMat,
  flesh: wmFleshMat,
  section: wmSection,
  sectionV: wmSectionV,
  iconRotation: [0, 0.4, 0],
};

// =============================================================================================
// PINEAPPLE (upright; spiral lattice of eyes; crown of stiff leaves)

const PINE_H = 0.136;
const PINE_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0.0],
    [0.016, 0.0003],
    [0.03, 0.0022],
    [0.04, 0.0075],
    [0.0465, 0.018],
    [0.0498, 0.036],
    [0.0505, 0.056],
    [0.0496, 0.076],
    [0.0465, 0.096],
    [0.041, 0.112],
    [0.033, 0.1235],
    [0.0225, 0.1315],
    [0.0115, 0.1352],
    [0.0001, PINE_H],
  ],
  36,
);
const PINE_PEELED: Profile = PINE_PROFILE.map(([rr, y]) => [Math.max(0.0001, rr * 0.9), y]);
const PINE_N = 12; // eyes per ring
const PINE_ROW = 0.0128; // metres between rows
const PINE_STEP = 0.6; // column shift per row: rows become spirals
const PINE_T = 512;

interface Eye {
  d1: number;
  d2: number;
  dx: number;
  dy: number;
  id: number;
}

/** Nearest / second-nearest eye centre (metres) at texture u and arc length sv. dx, dy: offset from the eye centre (dy towards the crown). */
function pineEye(u: number, sv: number, circ: number, e: Eye) {
  const sx = circ / PINE_N;
  const X = u * PINE_N, Y = sv / PINE_ROW;
  const j0 = Math.floor(Y);
  e.d1 = e.d2 = 1e9;
  for (let j = j0 - 1; j <= j0 + 2; j++) {
    const off = j * PINE_STEP;
    const kc = Math.round(X - off);
    for (let k = kc - 1; k <= kc + 1; k++) {
      let dX = X - (k + off);
      dX -= Math.round(dX / PINE_N) * PINE_N;
      const dx = dX * sx, dy = (Y - j) * PINE_ROW;
      const d = Math.hypot(dx, dy);
      if (d < e.d1) {
        e.d2 = e.d1;
        e.d1 = d;
        e.dx = dx;
        e.dy = dy;
        e.id = (((k % PINE_N) + PINE_N) % PINE_N) * 131 + j * 7919;
      } else if (d < e.d2) e.d2 = d;
    }
  }
}

interface Field {
  col: Uint8ClampedArray;
  H: Float32Array;
}

/** Paint colour + height per pixel over a lathe's texture space. fn(u, v, sv, circ, o) returns the height. */
function latheField(prof: Profile, w: number, h: number, fn: (u: number, v: number, sv: number, circ: number, o: RGB) => number): Field {
  const L = latheInfo(prof);
  const colr = new Uint8ClampedArray(w * h * 4);
  const H = new Float32Array(w * h);
  const o: RGB = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    const v = 1 - (y + 0.5) / h, sv = v * L.total;
    const circ = TAU * Math.max(0.002, radiusAtV(L, v));
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      H[i] = fn((x + 0.5) / w, v, sv, circ, o);
      colr[i * 4] = o[0];
      colr[i * 4 + 1] = o[1];
      colr[i * 4 + 2] = o[2];
      colr[i * 4 + 3] = 255;
    }
  }
  return { col: colr, H };
}

function fieldTex(key: string, w: number, h: number, f: () => Field): THREE.Texture {
  return canvasTexture(
    w,
    h,
    (ctx) => {
      const img = ctx.createImageData(w, h);
      img.data.set(f().col);
      ctx.putImageData(img, 0, 0);
    },
    { key },
  );
}

const pineSkinField = lazy(() => {
  const GOLD = hexRGB('#e6aa3c'), ORANGE = hexRGB('#c47628'), DEEP = hexRGB('#8a5220'), GROOVE = hexRGB('#4c2e12');
  const GREEN = hexRGB('#86963a'), TIP = hexRGB('#3a2410'), LIP = hexRGB('#f2d488'), SCAR = hexRGB('#a8865a'), SCAR2 = hexRGB('#7c5c34');
  const e: Eye = { d1: 0, d2: 0, dx: 0, dy: 0, id: 0 };
  return latheField(PINE_PROFILE, PINE_T, PINE_T, (u, v, sv, circ, o) => {
    pineEye(u, sv, circ, e);
    const edge = e.d2 - e.d1;
    const rnd = hash1(e.id);
    const dome = sstep(0.0003, 0.0055, edge);
    // facet: deep edges -> orange -> golden centre; greener near the crown
    setRGB(o, DEEP);
    blend(o, ORANGE, sstep(0, 0.002, edge));
    blend(o, GOLD, dome * (0.55 + 0.4 * rnd) * sstep(0.013, 0.003, e.d1));
    blend(o, GREEN, (sstep(0.6, 0.95, v) * 0.75 + sstep(0.25, 0.08, v) * 0.35) * (0.45 + 0.7 * rnd) * (0.4 + 0.6 * dome));
    // pale lip curving under each eye's spike
    const lipR = Math.hypot(e.dx * 0.85, e.dy - 0.0042);
    const lip = sstep(0.0016, 0.0005, Math.abs(lipR - 0.0078)) * sstep(0.0005, -0.0025, e.dy) * dome;
    blend(o, LIP, lip * 0.85);
    // dark dried spike at the top of the eye
    const sp = Math.hypot(e.dx / 0.0012, (e.dy - 0.0036) / 0.0022);
    blend(o, TIP, sstep(1.05, 0.55, sp));
    // grooves between eyes
    blend(o, GROOVE, sstep(0.0013, 0.0002, edge) * 0.9);
    let height = dome * (0.55 + 0.45 * sstep(0.012, 0.0, e.d1)) + lip * 0.12 + sstep(1.1, 0.2, sp) * 0.4;
    // flat stem scar at the bottom, plain under the crown
    const scar = sstep(0.075, 0.045, v);
    if (scar > 0) {
      const ring = 0.5 + 0.5 * Math.sin(sv * 900 + noiseU(u, sv, 3, 60) * 3);
      const sc: RGB = [SCAR[0], SCAR[1], SCAR[2]];
      blend(sc, SCAR2, ring * 0.5);
      blend(o, sc, scar);
      height = lerp(height, 0.3 + ring * 0.05, scar);
    }
    const top = sstep(0.93, 0.97, v);
    blend(o, hexRGB('#6a6a2c'), top);
    return lerp(height, 0.4, top);
  });
});

const pinePeeledField = lazy(() => {
  const FLESH = hexRGB('#f6cf45'), LIGHT = hexRGB('#fbe07a'), DEEP = hexRGB('#eab232'), PIT = hexRGB('#5c3a14'), RIM = hexRGB('#c08a30');
  const e: Eye = { d1: 0, d2: 0, dx: 0, dy: 0, id: 0 };
  return latheField(PINE_PEELED, PINE_T, PINE_T, (u, v, sv, circ, o) => {
    pineEye(u, sv, circ, e);
    const fib = noiseU(u, sv, 40, 30, 2.2);
    setRGB(o, FLESH);
    blend(o, fib > 0 ? LIGHT : DEEP, Math.abs(fib) * 1.4);
    // little brown pits where the eyes were cut out
    const pr = Math.hypot(e.dx, (e.dy - 0.001) * 1.2);
    const rim = sstep(0.0042, 0.0026, pr);
    blend(o, RIM, rim * 0.75);
    blend(o, PIT, sstep(0.0024, 0.001, pr));
    const ends = sstep(0.06, 0.02, v) + sstep(0.95, 0.99, v);
    blend(o, DEEP, ends * 0.6);
    return 0.6 + fib * 0.04 - rim * 0.45 - sstep(0.0024, 0.0008, pr) * 0.2;
  });
});

const pineSkinMat = lazy(() =>
  withNormalScale(
    foodMat({
      color: '#ffffff',
      map: fieldTex('fruit-pine-skin', PINE_T, PINE_T, pineSkinField),
      normalMap: normalField('fruit-pine-normal', PINE_T, PINE_T, () => pineSkinField().H, 4.5),
      roughness: 0.62,
      flesh: colorsOf('pineapple').flesh,
      cookColor: colorsOf('pineapple').cooked,
      name: 'pineapple-skin',
    }),
    1,
  ),
);
const pinePeeledMat = lazy(() =>
  foodMat({
    color: '#ffffff',
    map: fieldTex('fruit-pine-peeled', PINE_T, PINE_T, pinePeeledField),
    normalMap: normalField('fruit-pine-peeled-n', PINE_T, PINE_T, () => pinePeeledField().H, 4),
    roughness: 0.4,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
    flesh: colorsOf('pineapple').flesh,
    cookColor: colorsOf('pineapple').cooked,
    name: 'pineapple-peeled',
  }),
);
const pineFleshTex = lazy(() =>
  canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#f8d64e';
      ctx.fillRect(0, 0, w, h);
      const r = rng(75);
      ctx.lineCap = 'round';
      for (let i = 0; i < 70; i++) {
        const x = r.next() * w, y = r.next() * h, len = r.range(10, 30);
        ctx.strokeStyle = r.next() < 0.6 ? `rgba(255,246,190,${r.range(0.3, 0.6)})` : `rgba(226,170,40,${r.range(0.2, 0.4)})`;
        ctx.lineWidth = r.range(1, 2.4);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + r.range(-3, 3), y + len);
        ctx.stroke();
      }
    },
    { key: 'fruit-pine-flesh', wrap: true },
  ),
);
const pineFleshMat = lazy(() => foodMat({ color: '#ffffff', map: pineFleshTex(), roughness: 0.34, flesh: colorsOf('pineapple').flesh, cookColor: colorsOf('pineapple').cooked }));

const pineLeafMat = lazy(() =>
  foodMat({
    color: '#ffffff',
    map: canvasTexture(
      64,
      256,
      (ctx, w, h) => {
        ctx.fillStyle = linear(ctx, 0, 0, w, 0, [[0, '#6c9c64'], [0.14, '#3d8446'], [0.5, '#2c6c3a'], [0.86, '#3d8446'], [1, '#6c9c64']]);
        ctx.fillRect(0, 0, w, h);
        const r = rng(71);
        for (let i = 0; i < 16; i++) {
          const x = r.next() * w;
          ctx.strokeStyle = r.next() < 0.5 ? `rgba(190,226,190,${r.range(0.15, 0.3)})` : `rgba(14,50,24,${r.range(0.15, 0.3)})`;
          ctx.lineWidth = r.range(0.8, 2);
          ctx.beginPath();
          ctx.moveTo(x, h);
          ctx.lineTo(lerp(x, w / 2, 0.6), 0);
          ctx.stroke();
        }
        // dry tip (canvas top = leaf tip), reddish edges, pale base
        ctx.fillStyle = linear(ctx, 0, 0, w, 0, [[0, 'rgba(150,70,50,0.35)'], [0.08, 'rgba(150,70,50,0)'], [0.92, 'rgba(150,70,50,0)'], [1, 'rgba(150,70,50,0.35)']]);
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = linear(ctx, 0, 0, 0, h, [[0, 'rgba(150,118,60,0.8)'], [0.06, 'rgba(150,118,60,0)'], [0.86, 'rgba(200,214,150,0)'], [1, 'rgba(200,214,150,0.55)']]);
        ctx.fillRect(0, 0, w, h);
      },
      { key: 'fruit-pine-leaf' },
    ),
    roughness: 0.42,
    clearcoat: 0.2,
    clearcoatRoughness: 0.45,
    flesh: '#5f8e62',
    cookColor: '#5a5424',
    cookAmount: 0.35,
    name: 'pineapple-leaf',
  }),
);

/** Rosette of stiff, sword-shaped leaves (one merged mesh) sitting at height `top`. */
function pineCrown(r: Rng, top: number): THREE.Mesh {
  const geos: THREE.BufferGeometry[] = [];
  const n = 27;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); // 0 = inner (tall, upright) .. 1 = outer (short, spreading)
    const len = lerp(0.08, 0.036, t) * r.range(0.86, 1.1);
    const wid = lerp(0.016, 0.022, t) * r.range(0.9, 1.1);
    const g = leafGeo({ length: len, width: wid, curl: -lerp(0.1, 0.55, t) * r.range(0.7, 1.25), fold: 0.42, segments: 6, seed: i, outline: (s) => Math.pow(1 - s, 0.8) * Math.min(1, 0.72 + s * 4) });
    const yaw = i * 2.39996 + r.range(-0.2, 0.2);
    const rad = lerp(0.001, 0.012, t);
    geos.push(bake(g, [Math.sin(yaw) * rad, top - 0.007 + t * 0.004, Math.cos(yaw) * rad], yaw, -lerp(1.4, 0.38, t) + r.range(-0.12, 0.12), r.range(-0.25, 0.25)));
  }
  return mesh(merge(geos), pineLeafMat(), { name: 'pineapple-crown' });
}

function pineBuild(r: Rng, peeled: boolean): THREE.Object3D {
  const k = r.range(0.95, 1.05), fat = r.range(0.96, 1.05), seedN = r.range(0, 30);
  const g = lathe(peeled ? PINE_PEELED : PINE_PROFILE, 40);
  deform(g, (p) => {
    const f = fat * k * (1 + fbm3(p.x * 25 + seedN, p.y * 25, p.z * 25, 2) * 0.02);
    p.x *= f;
    p.z *= f;
    p.y *= k;
  });
  const body = mesh(g, peeled ? pinePeeledMat() : pineSkinMat(), { name: 'pineapple-body' });
  const root = grp(body, pineCrown(r, PINE_H * k));
  root.rotation.y = r.range(0, TAU);
  return seat(root, body);
}

function pineSection(ctx: Ctx, s: number, o: SectionOpts) {
  const c = s / 2;
  const r = rng(73);
  let R = c;
  if (!o.peeled) {
    fillCircle(ctx, c, c, c, '#7a4a1c');
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      fillCircle(ctx, c + Math.cos(a) * c * 0.975, c + Math.sin(a) * c * 0.975, s * 0.034, i % 2 ? '#c8822c' : '#b06e26');
    }
    R = c * 0.925;
  }
  fillCircle(ctx, c, c, R, radial(ctx, c, c, 0, R, [[0, '#f8eab0'], [0.19, '#f7e49a'], [0.25, '#f9da5c'], [0.75, '#f8d44c'], [1, '#f0c23a']]));
  discFibres(ctx, c, c, R, r, 130, 'rgba(255,250,214,0.45)', [s * 0.003, s * 0.007], 0.22, 0.9);
  discFibres(ctx, c, c, R, r, 70, 'rgba(222,164,36,0.3)', [s * 0.003, s * 0.006], 0.22, 0.9);
  // eye pits poking into the flesh
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + r.range(-0.08, 0.08);
    seed(ctx, c + Math.cos(a) * R * 0.94, c + Math.sin(a) * R * 0.94, s * 0.065, s * 0.034, a + Math.PI, '#5c3812', '#a8782a', 'rgba(255,255,255,0.12)');
  }
  // fibrous core
  fillCircle(ctx, c, c, R * 0.21, radial(ctx, c, c, 0, R * 0.21, [[0, '#fcf4cc'], [0.75, '#f8eab0'], [1, 'rgba(248,234,176,0)']]));
  discFibres(ctx, c, c, R * 0.2, r, 30, 'rgba(226,196,110,0.4)', [s * 0.002, s * 0.004], 0.1, 0.95);
}

function pineSectionV(ctx: Ctx, w: number, h: number, o: SectionOpts) {
  const prof = PINE_PROFILE;
  const m = vmap(prof, w, h);
  ctx.fillStyle = o.peeled ? '#e8b83a' : '#7a4a1c';
  ctx.fillRect(0, 0, w, h);
  const d0 = o.peeled ? 0 : 0.0042;
  layeredSil(ctx, prof, m, [[d0, '#f0c23a'], [d0 + 0.006, '#f8d44c'], [d0 + 0.02, '#f9da5c']]);
  const r = rng(74);
  ctx.save();
  silhouette(ctx, prof, m, d0);
  ctx.clip();
  // fibres fanning out from the core
  const cx = m.X(0);
  ctx.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const y0 = r.range(0.06, 0.94) * h, side = r.sign();
    ctx.strokeStyle = r.next() < 0.6 ? 'rgba(255,248,206,0.45)' : 'rgba(222,164,36,0.28)';
    ctx.lineWidth = w * r.range(0.004, 0.009);
    ctx.beginPath();
    ctx.moveTo(cx + side * 0.008 * m.kx, y0);
    ctx.lineTo(cx + side * 0.06 * m.kx, y0 - (y0 - h / 2) * 0.25 - h * 0.04);
    ctx.stroke();
  }
  // eye pits along the rim
  const L = latheInfo(prof);
  for (let s = 0.02; s < L.total - 0.015; s += 0.0105) {
    let i = 1;
    while (i < L.arc.length - 1 && L.arc[i] < s) i++;
    const [rr, yy] = prof[i];
    if (rr < 0.012) continue;
    for (const side of [-1, 1]) {
      const px = m.X(side * (rr - 0.0072)), py = m.Y(yy);
      seed(ctx, px, py, 0.0085 * m.kx, 0.0045 * m.kx, side > 0 ? Math.PI : 0, '#5c3812', '#a8782a', 'rgba(255,255,255,0.12)');
    }
  }
  // core column
  const yb = m.Y(0.008), yt = m.Y(PINE_H - 0.008);
  ctx.fillStyle = linear(ctx, cx - 0.012 * m.kx, 0, cx + 0.012 * m.kx, 0, [[0, 'rgba(250,236,180,0)'], [0.3, '#f8eab4'], [0.5, '#fcf2cc'], [0.7, '#f8eab4'], [1, 'rgba(250,236,180,0)']]);
  ctx.fillRect(cx - 0.012 * m.kx, yt, 0.024 * m.kx, yb - yt);
  ctx.restore();
}

const PINEAPPLE: ModelDef = {
  build: (r) => pineBuild(r, false),
  peeled: (r) => pineBuild(r, true),
  profile: PINE_PROFILE,
  skin: pineSkinMat,
  flesh: pineFleshMat,
  section: pineSection,
  sectionV: pineSectionV,
};

// =============================================================================================
// GRAPES (bunch lying on its side: stem end towards +X, tip towards -X)

const GRAPE_COLORS = ['#4a1c5e', '#5a2370', '#662a7c', '#4e2048', '#5e2660', '#3e1a50'];
const GRAPE_MAP = 0xd8 / 255;
const GRAPE_BOOST = 1 / lin(GRAPE_MAP);

/** Waxy bloom: whitish dusty patches (multiplied by the per-grape vertex colour). */
const grapeBloomTex = lazy(() =>
  canvasTexture(
    128,
    64,
    (ctx, w, h) => {
      ctx.fillStyle = '#d8d8dc';
      ctx.fillRect(0, 0, w, h);
      const r = rng(81);
      blobs(ctx, w, h, r, 30, '255,255,255', [5, 14], [0.25, 0.55]);
      blobs(ctx, w, h, r, 10, '150,140,160', [6, 14], [0.06, 0.14]);
    },
    { key: 'fruit-grape-bloom', wrap: true },
  ),
);
const grapeMat = lazy(() =>
  foodMat({ color: '#ffffff', map: grapeBloomTex(), vertexColors: true, roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.3, flesh: colorsOf('grapes').flesh, cookColor: colorsOf('grapes').cooked, name: 'grape-skin' }),
);
const grapeCoreMat = lazy(() => foodMat({ color: '#24082a', roughness: 0.95, flesh: colorsOf('grapes').flesh, cookColor: colorsOf('grapes').cooked, name: 'grape-core' }));
const grapeSkinCutMat = lazy(() => foodMat({ color: colorsOf('grapes').skin, roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.25, flesh: colorsOf('grapes').flesh, cookColor: colorsOf('grapes').cooked }));
const grapeFleshMat = lazy(() => foodMat({ color: colorsOf('grapes').flesh, roughness: 0.22, clearcoat: 0.4, clearcoatRoughness: 0.2, flesh: colorsOf('grapes').flesh, cookColor: colorsOf('grapes').cooked }));

/** One grape: slightly oval, local +Y = stem end. Vertex coloured (reddish near the stem, darker below). */
function grapeGeo(r: Rng, rad: number, segs = 12, rings = 9): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(rad, segs, rings);
  g.scale(1, r.range(1.06, 1.16), 1);
  const base = col(r.pick(GRAPE_COLORS)), top = base.clone().lerp(col('#8e3050'), 0.3), low = base.clone().multiplyScalar(0.6);
  const k = GRAPE_BOOST * r.range(0.88, 1.1);
  return paintVertices(g, (p) => {
    const t = p.y / (rad * 1.1);
    return base.clone().lerp(top, sstep(0.35, 1, t)).lerp(low, sstep(-0.1, -1, t) * 0.7).multiplyScalar(k);
  });
}

const UP = new THREE.Vector3(0, 1, 0);

function buildGrapes(r: Rng): THREE.Object3D {
  // Staggered rings of grapes on a cone lying on the table (shoulders at x = 0, tip towards -X).
  const L = 0.09, R0 = 0.028, R1 = 0.007, AX = 0.024;
  const cand: { c: THREE.Vector3; rad: number; t: number }[] = [];
  const slant = Math.hypot(L, R0 - R1);
  let row = 0;
  for (let t = 0; t <= 1.001; row++) {
    const rad = 0.0096 * lerp(1, 0.85, t);
    const cr = lerp(R0, R1, t);
    const n = Math.max(1, Math.round((TAU * cr) / (rad * 1.95)));
    const off = (row % 2) * 0.5 + r.range(-0.15, 0.15);
    for (let k = 0; k < n; k++) {
      const phi = ((k + off + r.range(-0.12, 0.12)) / n) * TAU;
      const c = new THREE.Vector3(-t * L + r.range(-0.002, 0.002), AX + Math.sin(phi) * cr * 0.92, Math.cos(phi) * cr);
      cand.push({ c, rad: rad * r.range(0.94, 1.06), t });
    }
    t += (rad * 1.65) / slant;
  }
  // close the shoulders with a few grapes around the stalk
  for (let k = 0; k < 4; k++) {
    const phi = (k / 4) * TAU + r.range(-0.3, 0.3);
    cand.push({ c: new THREE.Vector3(0.0075, AX + Math.sin(phi) * R0 * 0.42, Math.cos(phi) * R0 * 0.42), rad: 0.009 * r.range(0.94, 1.06), t: 0 });
  }
  // rest on the table; keep grapes that don't overlap (top ones first: they are the visible ones)
  for (const q of cand) q.c.y = Math.max(q.c.y, q.rad * 1.05);
  cand.sort((p, q) => q.c.y - p.c.y);
  const spots: { c: THREE.Vector3; rad: number; axis: THREE.Vector3 }[] = [];
  for (const q of cand) {
    if (spots.length >= 38) break;
    if (spots.some((s) => s.c.distanceTo(q.c) < (s.rad + q.rad) * 0.82)) continue;
    const attach = new THREE.Vector3(q.c.x + 0.006, AX, 0);
    spots.push({ c: q.c, rad: q.rad, axis: attach.sub(q.c).normalize() });
  }
  const grapes: THREE.BufferGeometry[] = [];
  const stems: THREE.BufferGeometry[] = [];
  const quat = new THREE.Quaternion(), spin = new THREE.Quaternion(), m4 = new THREE.Matrix4();
  for (const s of spots) {
    const hidden = s.c.y < AX - R0 * 0.35;
    const g = hidden ? grapeGeo(r, s.rad, 9, 6) : grapeGeo(r, s.rad, 12, 9);
    quat.setFromUnitVectors(UP, s.axis).multiply(spin.setFromAxisAngle(UP, r.range(0, TAU)));
    g.applyMatrix4(m4.compose(s.c, quat, new THREE.Vector3(1, 1, 1)));
    grapes.push(g);
    if (hidden || s.c.x < -0.03) continue; // pedicels only show between the shoulder grapes
    const a = s.c.clone().addScaledVector(s.axis, s.rad * 1.02);
    const b = new THREE.Vector3(s.c.x + 0.006, AX, 0);
    stems.push(colorStem([[a.x, a.y, a.z], [lerp(a.x, b.x, 0.5), lerp(a.y, b.y, 0.5) + 0.001, lerp(a.z, b.z, 0.5)], [b.x, b.y, b.z]], 0.00075, 0.0009, [[0, '#8a8a3e'], [1, '#7a7a3a']], { tub: 2, radial: 4, caps: 'flat' }));
  }
  // dark core so gaps between grapes never show the background
  const core = new THREE.IcosahedronGeometry(1, 1);
  core.scale(L * 0.5, R0 * 0.62, R0 * 0.7);
  core.translate(-L * 0.42, AX - 0.002, 0);
  const coreMesh = mesh(core, grapeCoreMat(), { name: 'grape-core' });
  // main stalk through the bunch, out at the shoulders, with the woody cut cross-piece
  const e: V3 = [0.044, AX + 0.016, r.range(-0.004, 0.004)];
  stems.push(colorStem([e, [0.027, AX + 0.007, 0], [0.006, AX - 0.002, 0], [-0.04, AX - 0.004, 0.002], [-L * 0.85, AX - 0.004, 0]], 0.0027, 0.0013, [[0, '#6a5030'], [0.18, '#7c7a3a'], [1, '#8a9a46']], { tub: 10, radial: 7, caps: 'flat' }));
  const tw = r.range(0.006, 0.009);
  stems.push(colorStem([[e[0] + 0.001, e[1], e[2] - tw], [e[0] + 0.0015, e[1] + 0.001, e[2]], [e[0] + 0.001, e[1], e[2] + tw]], 0.0017, 0.0015, [[0, '#5e4428'], [1, '#6a5030']], { tub: 4, radial: 7 }));
  const root = grp(mesh(merge(grapes), grapeMat(), { name: 'grapes' }), coreMesh, mesh(merge(stems), vcStemMat(), { name: 'grape-stems' }));
  root.rotation.y = r.range(-0.5, 0.5);
  return seat(root);
}

function grapePiece(r: Rng): THREE.Object3D {
  const rad = r.range(0.0085, 0.0095);
  const stem = colorStem([[0, rad * 0.95, 0], [0.0008, rad + 0.003, 0], [0.0025, rad + 0.0055, 0.001]], 0.0008, 0.0006, [[0, '#8a9a46'], [1, '#6a5030']], { tub: 3, radial: 5, caps: 'flat' });
  const o = grp(mesh(grapeGeo(r, rad), grapeMat()), mesh(stem, vcStemMat()));
  o.rotation.set(r.range(1.25, 1.5), r.range(0, TAU), 0, 'YXZ');
  return seat(o);
}

const GRAPES: ModelDef = {
  build: buildGrapes,
  piece: (r) => grapePiece(r),
  skin: grapeSkinCutMat,
  flesh: grapeFleshMat,
  iconRotation: [0, 0.5, 0],
};

// =============================================================================================
// CHERRY (pair on joined stems; piece = one cherry with its stem)

const CHERRY_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0.0],
    [0.0022, 0.0003],
    [0.0056, 0.0018],
    [0.0087, 0.0046],
    [0.0108, 0.0086],
    [0.0118, 0.0126],
    [0.0115, 0.0164],
    [0.01, 0.0196],
    [0.0072, 0.0216],
    [0.0042, 0.0217],
    [0.0019, 0.0204],
    [0.0001, 0.0196],
  ],
  22,
);
const CHERRY_TOP = 0.0196;

const cherryMat = lazy(() =>
  foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, flesh: colorsOf('cherry').flesh, cookColor: colorsOf('cherry').cooked, name: 'cherry-skin' }),
);
const cherrySkinCutMat = lazy(() => foodMat({ color: colorsOf('cherry').skin, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1, flesh: colorsOf('cherry').flesh, cookColor: colorsOf('cherry').cooked }));
const cherryFleshMat = lazy(() => foodMat({ color: colorsOf('cherry').flesh, roughness: 0.25, clearcoat: 0.4, flesh: colorsOf('cherry').flesh, cookColor: colorsOf('cherry').cooked }));

/** One cherry, stem dimple at (0, top, 0); suture groove on the +Z side. Returns [geometry, top y]. */
function cherryGeo(r: Rng): [THREE.BufferGeometry, number] {
  const g = lathe(CHERRY_PROFILE, 28);
  const k = r.range(0.93, 1.06), seedN = r.range(0, 50);
  deform(g, (p) => {
    const a = Math.atan2(p.x, p.z), rad = Math.hypot(p.x, p.z);
    const groove = 1 - 0.05 * Math.exp(-((angDiff(a, 0) / 0.2) ** 2)) * sstep(0.003, 0.009, rad) * sstep(0.0215, 0.012, p.y);
    const f = k * groove * (1 + fbm3(p.x * 110 + seedN, p.y * 110, p.z * 110, 2) * 0.025);
    p.x *= f;
    p.z *= f;
    p.y *= k;
  });
  const H = 0.0217 * k;
  const TOP = col('#b41624'), MID = col('#96101d'), LOW = col('#4e0610'), DIMPLE = col('#6a2016');
  paintVertices(g, (p) => {
    const t = clamp(p.y / H);
    const c = LOW.clone().lerp(MID, sstep(0.0, 0.5, t)).lerp(TOP, sstep(0.55, 0.95, t) * 0.7);
    c.multiplyScalar(1 + fbm3(p.x * 260 + seedN, p.y * 260, p.z * 260, 2) * 0.3);
    if (t > 0.8) c.lerp(DIMPLE, sstep(0.0042, 0.0015, Math.hypot(p.x, p.z)) * 0.6);
    return c;
  });
  return [g, CHERRY_TOP * k];
}

function cherryStem(base: THREE.Vector3, tip: THREE.Vector3, bow: THREE.Vector3): THREE.BufferGeometry {
  const p1 = base.clone().lerp(tip, 0.35).add(bow), p2 = base.clone().lerp(tip, 0.72).addScaledVector(bow, 0.55);
  return colorStem(
    [[base.x, base.y - 0.0015, base.z], [p1.x, p1.y, p1.z], [p2.x, p2.y, p2.z], [tip.x, tip.y, tip.z]],
    0.0011,
    0.00085,
    [[0, '#6e7a2c'], [0.12, '#6f9236'], [0.85, '#7f8a3a'], [1, '#6a5030']],
    { tub: 12, radial: 6 },
  );
}

/** A cherry placed at (x, z), leaning by `lean`, random spin. Returns its geometry and stem base point. */
function placedCherry(r: Rng, x: number, z: number, lean: number): [THREE.BufferGeometry, THREE.Vector3] {
  const [g, top] = cherryGeo(r);
  const m4 = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.range(0, TAU), lean, 'ZYX')), new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m4);
  return [g, new THREE.Vector3(0, top, 0).applyMatrix4(m4)];
}

function buildCherry(r: Rng): THREE.Object3D {
  const J = new THREE.Vector3(r.range(-0.003, 0.003), r.range(0.046, 0.052), r.range(-0.014, -0.009));
  const bodies: THREE.BufferGeometry[] = [];
  const stems: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const [g, base] = placedCherry(r, s * r.range(0.0118, 0.0132), s * r.range(-0.003, 0.003), -s * r.range(0.08, 0.22));
    bodies.push(g);
    stems.push(cherryStem(base, J, new THREE.Vector3(s * r.range(0.002, 0.004), 0, r.range(0.001, 0.004))));
  }
  stems.push(colorStem([[J.x, J.y - 0.001, J.z], [J.x + 0.0005, J.y + 0.0025, J.z - 0.0006], [J.x + 0.001, J.y + 0.0045, J.z - 0.0012]], 0.0017, 0.0014, [[0, '#6a5030'], [1, '#5a4024']], { tub: 3, radial: 7 }));
  const root = grp(mesh(merge(bodies), cherryMat(), { name: 'cherries' }), mesh(merge(stems), vcStemMat(), { name: 'cherry-stems' }));
  if (r.next() < 0.85) addLeaf(root, [J.x, J.y + 0.002, J.z], r.range(-2.4, -0.8) * r.sign(), r.range(-0.35, -0.1), r.range(0.036, 0.044), r.range(0.016, 0.019), fruitLeafMat(), -0.25, r.range(-0.3, 0.3));
  root.rotation.y = r.range(-0.6, 0.6);
  return seat(root);
}

function cherryPiece(r: Rng): THREE.Object3D {
  const [g, base] = placedCherry(r, 0, 0, r.range(-0.15, 0.15));
  const tip = new THREE.Vector3(r.range(-0.006, 0.006), base.y + r.range(0.026, 0.032), r.range(-0.012, -0.006));
  const root = grp(mesh(g, cherryMat()), mesh(cherryStem(base, tip, new THREE.Vector3(r.range(0.002, 0.004), 0, r.range(0.002, 0.004))), vcStemMat()));
  root.rotation.y = r.range(0, TAU);
  return seat(root);
}

const CHERRY: ModelDef = {
  build: buildCherry,
  piece: (r) => cherryPiece(r),
  skin: cherrySkinCutMat,
  flesh: cherryFleshMat,
};

// =============================================================================================
// BLUEBERRY (little heap; piece = one berry)

const BB_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0.0],
    [0.003, 0.0004],
    [0.0055, 0.0019],
    [0.0067, 0.0045],
    [0.0068, 0.0066],
    [0.0061, 0.0089],
    [0.0047, 0.0106],
    [0.0036, 0.0113],
    [0.0027, 0.0109],
    [0.0016, 0.0101],
    [0.0001, 0.0099],
  ],
  9,
);
const BB_C = 0.0057; // centre height
const BB_MAP = 0xdc / 255;
const BB_BOOST = 1 / lin(BB_MAP);

const bbBloomTex = lazy(() =>
  canvasTexture(
    128,
    64,
    (ctx, w, h) => {
      ctx.fillStyle = '#dcdcdc';
      ctx.fillRect(0, 0, w, h);
      const r = rng(91);
      blobs(ctx, w, h, r, 36, '255,255,255', [4, 12], [0.3, 0.6], [0.05, 0.8]);
      blobs(ctx, w, h, r, 12, '90,90,110', [3, 8], [0.12, 0.25], [0.1, 0.8]);
    },
    { key: 'fruit-bb-bloom', wrap: true },
  ),
);
const bbMat = lazy(() =>
  foodMat({
    color: '#ffffff',
    map: bbBloomTex(),
    vertexColors: true,
    roughness: 0.5,
    clearcoat: 0.3,
    clearcoatRoughness: 0.45,
    sheen: 0.45,
    sheenColor: '#94a6de',
    sheenRoughness: 0.5,
    flesh: colorsOf('blueberry').flesh,
    cookColor: colorsOf('blueberry').cooked,
    name: 'blueberry-skin',
  }),
);
const bbSkinCutMat = lazy(() => foodMat({ color: colorsOf('blueberry').skin, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.45, flesh: colorsOf('blueberry').flesh, cookColor: colorsOf('blueberry').cooked }));
const bbFleshMat = lazy(() => foodMat({ color: colorsOf('blueberry').flesh, roughness: 0.3, clearcoat: 0.3, flesh: colorsOf('blueberry').flesh, cookColor: colorsOf('blueberry').cooked }));

/** One berry centred at the origin (crown up). */
function berryGeo(r: Rng): THREE.BufferGeometry {
  const g = lathe(BB_PROFILE, 15);
  const k = r.range(0.88, 1.08), ph = r.range(0, TAU);
  deform(g, (p) => {
    const a = Math.atan2(p.x, p.z), rad = Math.hypot(p.x, p.z);
    // five little sepal points around the crown
    if (p.y > 0.0092) p.y += 0.0009 * Math.pow(Math.max(0, Math.cos(5 * a + ph)), 2) * sstep(0.0016, 0.003, rad) * sstep(0.0048, 0.0037, rad);
    p.multiplyScalar(k);
    p.y -= BB_C * k;
  });
  const base = col(r.pick(['#2e3474', '#283068', '#32366e', '#25285c', '#363e80'])).multiplyScalar(BB_BOOST * r.range(0.85, 1.1));
  const CROWN = col('#2a2236').multiplyScalar(BB_BOOST), RIM = col('#544a6e').multiplyScalar(BB_BOOST);
  return paintVertices(g, (p) => {
    const rad = Math.hypot(p.x, p.z) / k, y = p.y / k + BB_C;
    const c = base.clone().lerp(RIM, sstep(0.0098, 0.0109, y) * sstep(0.0048, 0.0035, rad));
    return c.lerp(CROWN, sstep(0.0028, 0.0016, rad) * sstep(0.0095, 0.0105, y));
  });
}

/** Orient a centred berry (random spin, tilt) and move it. */
function placeBerry(g: THREE.BufferGeometry, r: Rng, pos: V3, tilt: number): THREE.BufferGeometry {
  return bake(g, pos, r.range(0, TAU), tilt * r.sign(), r.range(-0.3, 0.3));
}

function buildBlueberry(r: Rng): THREE.Object3D {
  const rho = 0.0063; // sphere radius used for stacking
  const sp = rho * 2.06;
  // bottom layer: jittered hex packing, the 14 closest to a slightly random centre
  const grid: [number, number][] = [];
  for (let i = -3; i <= 3; i++)
    for (let j = -3; j <= 3; j++) {
      const x = (i + j * 0.5) * sp, z = j * sp * 0.866;
      if (Math.hypot(x, z) < 0.036) grid.push([x + r.range(-0.0005, 0.0005), z + r.range(-0.0005, 0.0005)]);
    }
  const [ox, oz] = r.disc();
  const near = (p: [number, number]) => Math.hypot(p[0] - ox * 0.005, (p[1] - oz * 0.005) * 1.25) + r.next() * 0.006;
  const low = grid.map((p) => [p, near(p)] as const).sort((a, b) => a[1] - b[1]).slice(0, 14).map((e) => e[0]);
  const geos: THREE.BufferGeometry[] = [];
  for (const [x, z] of low) geos.push(placeBerry(berryGeo(r), r, [x, rho, z], r.range(0, 0.5)));
  // top layer: berries nestled in the hollows between three touching berries
  const high: V3[] = [];
  const tri: [number, number, number][] = [];
  for (let a = 0; a < low.length; a++)
    for (let b = a + 1; b < low.length; b++)
      for (let c = b + 1; c < low.length; c++) {
        const d = (i: number, j: number) => Math.hypot(low[i][0] - low[j][0], low[i][1] - low[j][1]);
        if (d(a, b) < sp * 1.25 && d(b, c) < sp * 1.25 && d(a, c) < sp * 1.25) tri.push([a, b, c]);
      }
  tri.sort(() => r.next() - 0.5);
  for (const [a, b, c] of tri) {
    if (high.length >= 6) break;
    const x = (low[a][0] + low[b][0] + low[c][0]) / 3, z = (low[a][1] + low[b][1] + low[c][1]) / 3;
    let y = rho;
    for (const i of [a, b, c]) y = Math.max(y, rho + Math.sqrt(Math.max(0, 4 * rho * rho - (low[i][0] - x) ** 2 - (low[i][1] - z) ** 2)));
    if (high.some((h) => Math.hypot(h[0] - x, h[1] - y, h[2] - z) < rho * 2.02)) continue;
    high.push([x, y, z]);
  }
  for (const p of high) geos.push(placeBerry(berryGeo(r), r, p, r.range(0.2, 1.1)));
  return seat(mesh(merge(geos), bbMat(), { name: 'blueberries' }));
}

function blueberryPiece(r: Rng): THREE.Object3D {
  return seat(mesh(placeBerry(berryGeo(r), r, [0, 0, 0], r.range(0, 0.7)), bbMat()));
}

const BLUEBERRY: ModelDef = {
  build: buildBlueberry,
  piece: (r) => blueberryPiece(r),
  skin: bbSkinCutMat,
  flesh: bbFleshMat,
};

// =============================================================================================
// PEACH (fuzzy sheen, speckled blush, suture groove)

const PEACH_H = 0.0735;
const PEACH_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0.0],
    [0.004, 0.0004],
    [0.011, 0.0022],
    [0.02, 0.0068],
    [0.0295, 0.0145],
    [0.036, 0.0255],
    [0.0388, 0.0375],
    [0.0378, 0.0495],
    [0.0335, 0.0598],
    [0.0262, 0.0678],
    [0.0175, 0.0726],
    [0.0098, 0.0735],
    [0.0048, 0.0712],
    [0.0018, 0.0688],
    [0.0001, 0.068],
  ],
  40,
);
const PEACH_MAP = 0xe8 / 255;
const PEACH_BOOST = 1 / lin(PEACH_MAP);

/** Fine freckles + fuzz grain, multiplied over the vertex-colour blush. */
const peachSkinTex = lazy(() =>
  canvasTexture(
    512,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(0, 0, w, h);
      noiseField(ctx, w, h, [64, 32], 37, (n) => (n > 0.5 ? '#f2f2f2' : '#dcdcdc'), 0.5);
      const r = rng(103);
      for (let i = 0; i < 1500; i++) {
        const x = r.next() * w, y = r.range(0.04, 0.96) * h, s = r.range(0.5, 1.4);
        const a = r.range(0.25, 0.6);
        wrapX(w, x, 2, (xx) => fillEllipse(ctx, xx, y, s, s * 1.3, 0, `rgba(176,40,40,${a})`));
      }
      blobs(ctx, w, h, r, 40, '170,50,40', [6, 18], [0.06, 0.16]);
    },
    { key: 'fruit-peach-skin' },
  ),
);
const peachSkinMat = lazy(() =>
  foodMat({
    color: '#ffffff',
    map: peachSkinTex(),
    vertexColors: true,
    roughness: 0.62,
    sheen: 1,
    sheenColor: '#ffdcc8',
    sheenRoughness: 0.42,
    flesh: colorsOf('peach').flesh,
    cookColor: colorsOf('peach').cooked,
    name: 'peach-skin',
  }),
);
const peachSkinCutMat = lazy(() => {
  const m = foodMat({ color: '#f08a50', map: peachSkinTex(), roughness: 0.62, sheen: 1, sheenColor: '#ffdcc8', sheenRoughness: 0.42, flesh: colorsOf('peach').flesh, cookColor: colorsOf('peach').cooked });
  m.color.multiplyScalar(PEACH_BOOST);
  return m;
});
const peachFleshMat = lazy(() => foodMat({ color: colorsOf('peach').flesh, roughness: 0.32, clearcoat: 0.3, clearcoatRoughness: 0.3, flesh: colorsOf('peach').flesh, cookColor: colorsOf('peach').cooked }));

function buildPeach(r: Rng): THREE.Object3D {
  const k = r.range(0.94, 1.06), sx = r.range(0.97, 1.04), sz = r.range(0.97, 1.03), sy = r.range(0.95, 1.04);
  const a0 = r.range(0, TAU), cheek = r.range(0.015, 0.035), seedN = r.range(0, 40);
  const xf = (p: THREE.Vector3) => {
    const a = Math.atan2(p.x, p.z), rad = Math.hypot(p.x, p.z), t = p.y / PEACH_H;
    const da = angDiff(a, a0);
    const groove = 1 - 0.075 * Math.exp(-((da / 0.16) ** 2)) * sstep(0.004, 0.016, rad) * sstep(0.12, 0.55, t);
    const f = k * groove * (1 + cheek * Math.sin(da) * sstep(0, 0.01, rad)) * (1 + fbm3(p.x * 40 + seedN, p.y * 40, p.z * 40, 2) * 0.018);
    p.x *= f * sx;
    p.z *= f * sz;
    p.y *= k * sy;
  };
  const g = lathe(PEACH_PROFILE, 48);
  deform(g, xf);
  const H = PEACH_H * k * sy;
  const sunA = r.range(0, TAU), blushAmt = r.range(0.55, 1);
  const YEL = col('#f9c862'), ORA = col('#f5a64e'), RED = col('#dc4a3c'), DEEP = col('#ae2a32'), STEM = col('#cfc062');
  paintVertices(g, (p) => {
    const t = clamp(p.y / H), a = Math.atan2(p.x, p.z), rad = Math.hypot(p.x, p.z);
    const n = fbm3(p.x * 55 + seedN, p.y * 55, p.z * 55, 3);
    const b = sstep(-0.35, 0.65, Math.cos(angDiff(a, sunA)) * 0.75 + (t - 0.35) * 0.7 + n * 1.1) * blushAmt;
    const c = YEL.clone().lerp(ORA, clamp(0.35 + n * 0.8 + (0.5 - t) * 0.3));
    c.lerp(RED, b).lerp(DEEP, sstep(0.55, 1, b) * 0.55);
    if (t > 0.85) c.lerp(STEM, sstep(0.008, 0.002, rad) * 0.7);
    return c.multiplyScalar(PEACH_BOOST);
  });
  const body = mesh(g, peachSkinMat(), { skin: true, name: 'peach-body' });
  const root = grp(body);
  const base = new THREE.Vector3(0, 0.0686, 0);
  xf(base);
  root.add(mesh(colorStem([[base.x, base.y - 0.002, base.z], [base.x, base.y + 0.003, base.z], [base.x + 0.0008, base.y + 0.0065, base.z + 0.0004]], 0.0017, 0.0014, [[0, '#7a6a34'], [1, '#5e4426']], { tub: 4, radial: 7 }), vcStemMat()));
  if (r.next() < 0.65) addLeaf(root, [base.x, base.y + 0.0045, base.z], r.range(0, TAU), r.range(-0.45, -0.2), r.range(0.05, 0.06), r.range(0.0145, 0.017), darkLeafMat(), -0.3, r.range(-0.3, 0.3));
  root.rotation.set(r.range(-0.1, 0.1), r.range(0, TAU), r.range(-0.1, 0.1));
  return seat(root, body);
}

/** Peach stone: wrinkled almond shape, pointed end towards `ang` (canvas radians). */
function peachPit(ctx: Ctx, x: number, y: number, len: number, wid: number, ang: number, r: Rng) {
  teardrop(ctx, x, y, len, wid, ang);
  ctx.save();
  ctx.fillStyle = radial(ctx, x - wid * 0.15, y - len * 0.1, 0, len * 0.6, [[0, '#b46a40'], [0.6, '#94502e'], [1, '#6e3620']]);
  ctx.fill();
  ctx.clip();
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const px = x + r.range(-0.5, 0.5) * wid, py = y + r.range(-0.5, 0.5) * len;
    ctx.strokeStyle = r.next() < 0.6 ? 'rgba(70,30,16,0.55)' : 'rgba(214,150,100,0.4)';
    ctx.lineWidth = Math.max(1, wid * r.range(0.025, 0.05));
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + r.range(-0.15, 0.15) * wid, py + r.range(-0.15, 0.15) * len, px + r.range(-0.25, 0.25) * wid, py + r.range(-0.2, 0.2) * len);
    ctx.stroke();
  }
  ctx.restore();
  fillEllipse(ctx, x - wid * 0.18, y - len * 0.12, wid * 0.12, len * 0.07, ang + Math.PI / 2, 'rgba(255,220,190,0.35)');
}

function peachSection(ctx: Ctx, s: number, o: SectionOpts) {
  const c = s / 2;
  const r = rng(105);
  let R = c;
  if (!o.peeled) {
    fillCircle(ctx, c, c, c, radial(ctx, c, c, c * 0.9, c, [[0, '#e8703e'], [1, '#c43c2c']]));
    R = c * 0.972;
  }
  fillCircle(ctx, c, c, R, radial(ctx, c, c, 0, R, [[0, '#e0583c'], [0.3, '#f08a4c'], [0.42, '#f8b05a'], [0.85, '#fbc36e'], [1, o.peeled ? '#f8bc66' : '#f9b45e']]));
  discFibres(ctx, c, c, R, r, 80, 'rgba(206,60,44,0.35)', [s * 0.003, s * 0.007], 0.25, 0.55);
  discDots(ctx, c, c, R * 0.97, r, 220, 'rgba(255,236,190,0.3)', [s * 0.004, s * 0.009], 0.35, 1);
  peachPit(ctx, c, c, R * 0.5, R * 0.4, -Math.PI / 2 + 0.3, r);
}

function peachSectionV(ctx: Ctx, w: number, h: number, o: SectionOpts) {
  const prof = PEACH_PROFILE;
  const m = vmap(prof, w, h);
  ctx.fillStyle = o.peeled ? '#f8b860' : '#d24c36';
  ctx.fillRect(0, 0, w, h);
  const d0 = o.peeled ? 0 : 0.001;
  layeredSil(ctx, prof, m, [[d0, '#f4a054'], [d0 + 0.002, '#fabc66'], [d0 + 0.008, '#fbc36e']]);
  const r = rng(106);
  ctx.save();
  silhouette(ctx, prof, m, d0);
  ctx.clip();
  const px = m.X(0), py = m.Y(0.036);
  ctx.fillStyle = radial(ctx, px, py, 0.006 * m.kx, 0.028 * m.kx, [[0, 'rgba(214,64,46,0.9)'], [0.45, 'rgba(238,120,70,0.5)'], [1, 'rgba(250,180,100,0)']]);
  ctx.fillRect(0, 0, w, h);
  ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const a = r.range(0, TAU), d0f = r.range(0.011, 0.016), d1f = d0f + r.range(0.006, 0.014);
    ctx.strokeStyle = 'rgba(206,64,44,0.35)';
    ctx.lineWidth = w * r.range(0.004, 0.008);
    ctx.beginPath();
    ctx.moveTo(px + Math.cos(a) * d0f * m.kx, py + Math.sin(a) * d0f * 1.3 * m.ky);
    ctx.lineTo(px + Math.cos(a) * d1f * m.kx, py + Math.sin(a) * d1f * 1.3 * m.ky);
    ctx.stroke();
  }
  for (let i = 0; i < 200; i++) fillCircle(ctx, r.next() * w, r.next() * h, w * r.range(0.004, 0.009), 'rgba(255,236,190,0.25)');
  peachPit(ctx, px, py, 0.034 * m.ky, 0.024 * m.kx, -Math.PI / 2, r);
  ctx.restore();
}

const PEACH: ModelDef = {
  build: buildPeach,
  profile: PEACH_PROFILE,
  skin: peachSkinCutMat,
  flesh: peachFleshMat,
  section: peachSection,
  sectionV: peachSectionV,
};

// =============================================================================================
// PEAR (calyx basin at the bottom; the cut profile starts at the lowest point)

const PEAR_H = 0.0972;
const PEAR_TOP: Profile = [
  [0.0325, 0.0405],
  [0.0272, 0.0505],
  [0.0228, 0.0595],
  [0.0198, 0.0685],
  [0.0176, 0.0768],
  [0.015, 0.0848],
  [0.0112, 0.0918],
  [0.0062, 0.0962],
  [0.0026, PEAR_H],
  [0.0001, 0.0962],
];
const PEAR_BODY: Profile = smoothProfile(
  [[0.0001, 0.0042], [0.0035, 0.0036], [0.0085, 0.0018], [0.0155, 0.0004], [0.0235, 0.0024], [0.0302, 0.0088], [0.0342, 0.0185], [0.0352, 0.0295], ...PEAR_TOP],
  46,
);
const PEAR_CUT: Profile = smoothProfile([[0.0001, 0.0], [0.009, 0.0005], [0.018, 0.0024], [0.0262, 0.0066], [0.0318, 0.014], [0.0347, 0.024], [0.0352, 0.0315], ...PEAR_TOP], 40);
const PEAR_MAP = 0xe6 / 255;
const PEAR_BOOST = 1 / lin(PEAR_MAP);

const pearSkinTex = lazy(() =>
  canvasTexture(
    512,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#e6e6e6';
      ctx.fillRect(0, 0, w, h);
      noiseField(ctx, w, h, [40, 20], 41, (n) => (n > 0.5 ? '#eeeeee' : '#d8d8d8'), 0.6);
      const r = rng(111);
      // russet freckles, denser towards the stem (canvas top)
      for (let i = 0; i < 900; i++) {
        const x = r.next() * w, y = Math.pow(r.next(), 1.4) * h * 0.95 + h * 0.03, s = r.range(0.7, 1.6);
        const a = r.range(0.35, 0.75);
        wrapX(w, x, 3, (xx) => fillEllipse(ctx, xx, y, s * 1.2, s, 0, `rgba(120,86,40,${a})`));
      }
      // russet patch around the stem
      blobs(ctx, w, h, r, 30, '140,104,56', [8, 26], [0.15, 0.35], [0.0, 0.16]);
      ctx.fillStyle = linear(ctx, 0, 0, 0, h, [[0, 'rgba(130,96,50,0.6)'], [0.06, 'rgba(130,96,50,0)'], [1, 'rgba(0,0,0,0)']]);
      ctx.fillRect(0, 0, w, h);
    },
    { key: 'fruit-pear-skin' },
  ),
);
const pearSkinMat = lazy(() =>
  foodMat({ color: '#ffffff', map: pearSkinTex(), vertexColors: true, roughness: 0.48, clearcoat: 0.22, clearcoatRoughness: 0.45, flesh: colorsOf('pear').flesh, cookColor: colorsOf('pear').cooked, name: 'pear-skin' }),
);
const pearSkinCutMat = lazy(() => {
  const m = foodMat({ color: colorsOf('pear').skin, map: pearSkinTex(), roughness: 0.48, clearcoat: 0.2, flesh: colorsOf('pear').flesh, cookColor: colorsOf('pear').cooked });
  m.color.multiplyScalar(PEAR_BOOST);
  return m;
});
const pearFleshMat = lazy(() => foodMat({ color: colorsOf('pear').flesh, roughness: 0.4, flesh: colorsOf('pear').flesh, cookColor: colorsOf('pear').cooked }));

function buildPear(r: Rng): THREE.Object3D {
  const k = r.range(0.94, 1.05), fat = r.range(0.95, 1.06), lean = r.range(0.006, 0.014), leanDir = r.range(0, TAU), seedN = r.range(0, 40);
  const xf = (p: THREE.Vector3) => {
    const t = p.y / PEAR_H;
    const f = k * fat * (1 + fbm3(p.x * 38 + seedN, p.y * 38, p.z * 38, 2) * 0.03);
    p.x *= f;
    p.z *= f;
    const l = lean * sstep(0.35, 1, t) * sstep(0.35, 1, t);
    p.x += Math.cos(leanDir) * l;
    p.z += Math.sin(leanDir) * l;
    p.y *= k;
  };
  const g = lathe(PEAR_BODY, 48);
  deform(g, xf);
  const H = PEAR_H * k;
  const sunA = r.range(0, TAU), blush = r.next() < 0.6 ? r.range(0.15, 0.45) : 0;
  const GRN = col('#a6bf38'), YEL = col('#d9d454'), PALE = col('#e2dc78'), RED = col('#d0743c'), BASIN = col('#8a7a3a');
  paintVertices(g, (p) => {
    const t = clamp(p.y / H), a = Math.atan2(p.x, p.z), rad = Math.hypot(p.x, p.z);
    const n = fbm3(p.x * 45 + seedN, p.y * 45, p.z * 45, 3);
    const sun = Math.cos(angDiff(a, sunA));
    const c = GRN.clone().lerp(YEL, clamp(0.45 + sun * 0.3 - (t - 0.35) * 0.6 + n * 0.8));
    c.lerp(PALE, sstep(0.3, 0.9, sun * 0.6 + n) * 0.35);
    c.lerp(RED, blush * sstep(0.2, 0.9, sun + n * 0.8) * sstep(0.75, 0.2, t));
    if (t < 0.1) c.lerp(BASIN, sstep(0.009, 0.002, rad) * 0.8);
    return c.multiplyScalar(PEAR_BOOST);
  });
  const body = mesh(g, pearSkinMat(), { skin: true, name: 'pear-body' });
  const root = grp(body);
  const base = new THREE.Vector3(0, 0.0962, 0);
  xf(base);
  const bx = r.range(-0.005, 0.005), bz = r.range(-0.004, 0.004), len = r.range(0.02, 0.026);
  root.add(
    mesh(
      colorStem([[base.x, base.y - 0.003, base.z], [base.x, base.y + 0.004, base.z], [base.x + bx * 0.4, base.y + len * 0.6, base.z + bz * 0.4], [base.x + bx, base.y + len, base.z + bz]], 0.0021, 0.0015, [[0, '#7a6234'], [0.2, '#6a5030'], [1, '#4e3820']], { tub: 10, radial: 8 }),
      vcStemMat(),
    ),
  );
  if (r.next() < 0.45) addLeaf(root, [base.x + bx * 0.3, base.y + len * 0.45, base.z + bz * 0.3], r.range(0, TAU), r.range(-0.5, -0.2), r.range(0.04, 0.048), r.range(0.02, 0.024), fruitLeafMat(), -0.3, r.range(-0.3, 0.3));
  root.rotation.y = r.range(0, TAU);
  return seat(root, body);
}

/** Small pear core: five-lobed star with seeds (horizontal slice). */
function pearSection(ctx: Ctx, s: number, o: SectionOpts) {
  const c = s / 2;
  const r = rng(113);
  let R = c;
  if (!o.peeled) {
    fillCircle(ctx, c, c, c, radial(ctx, c, c, c * 0.9, c, [[0, '#c8d050'], [1, '#98ae34']]));
    R = c * 0.968;
  }
  fillCircle(ctx, c, c, R, radial(ctx, c, c, 0, R, [[0, '#f8f4d8'], [0.6, '#f6f1cc'], [0.92, '#f1ecbc'], [1, o.peeled ? '#ece6b0' : '#e8e8a8']]));
  // gritty stone cells
  discDots(ctx, c, c, R * 0.96, r, 320, 'rgba(214,204,150,0.35)', [s * 0.002, s * 0.005], 0.05, 1);
  discDots(ctx, c, c, R * 0.96, r, 200, 'rgba(255,255,248,0.45)', [s * 0.003, s * 0.007], 0.05, 1);
  const ro = 0.27 * R, ri = 0.12 * R;
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const rr = i % 2 === 0 ? ro : ri;
    const x = c + Math.cos(a) * rr, y = c + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else {
      const am = a - TAU / 20, rm = (ro + ri) * 0.6;
      ctx.quadraticCurveTo(c + Math.cos(am) * rm, c + Math.sin(am) * rm, x, y);
    }
  }
  ctx.closePath();
  ctx.fillStyle = radial(ctx, c, c, 0, ro, [[0, '#f4ecc8'], [1, '#ebdfb0']]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,170,110,0.7)';
  ctx.lineWidth = s * 0.007;
  ctx.stroke();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU - Math.PI / 2;
    if (k % 2 === 1 && r.next() < 0.5) continue;
    seed(ctx, c + Math.cos(a) * 0.16 * R, c + Math.sin(a) * 0.16 * R, 0.11 * R, 0.06 * R, a + Math.PI, '#3a1e0e', '#7a4a24');
  }
}

function pearSectionV(ctx: Ctx, w: number, h: number, o: SectionOpts) {
  const prof = PEAR_CUT;
  const m = vmap(prof, w, h);
  ctx.fillStyle = o.peeled ? '#ece6b0' : '#a8be3a';
  ctx.fillRect(0, 0, w, h);
  const d0 = o.peeled ? 0 : 0.0012;
  layeredSil(ctx, prof, m, [[d0, '#ebe8b0'], [d0 + 0.002, '#f2edc4'], [d0 + 0.007, '#f6f1cf']]);
  const r = rng(114);
  ctx.save();
  silhouette(ctx, prof, m, d0);
  ctx.clip();
  for (let i = 0; i < 400; i++) fillCircle(ctx, r.next() * w, r.next() * h, w * r.range(0.002, 0.006), r.next() < 0.5 ? 'rgba(214,204,150,0.35)' : 'rgba(255,255,248,0.4)');
  const cx = m.X(0);
  // vascular line from the calyx through the core to the stem
  ctx.strokeStyle = 'rgba(200,184,120,0.65)';
  ctx.lineWidth = w * 0.012;
  ctx.beginPath();
  ctx.moveTo(cx, m.Y(0.001));
  ctx.lineTo(cx, m.Y(0.0965));
  ctx.stroke();
  // core: lens around the seeds in the bulb
  const yT = m.Y(0.047), yB = m.Y(0.012), cw = 0.0095 * m.kx;
  ctx.beginPath();
  ctx.moveTo(cx, yT);
  ctx.bezierCurveTo(cx + cw * 1.5, lerp(yT, yB, 0.25), cx + cw * 1.4, lerp(yT, yB, 0.8), cx, yB);
  ctx.bezierCurveTo(cx - cw * 1.4, lerp(yT, yB, 0.8), cx - cw * 1.5, lerp(yT, yB, 0.25), cx, yT);
  ctx.fillStyle = 'rgba(238,226,176,0.9)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(196,172,110,0.7)';
  ctx.lineWidth = w * 0.006;
  ctx.stroke();
  for (const sgn of [-1, 1]) seed(ctx, cx + sgn * cw * 0.5, m.Y(0.029), 0.011 * m.ky, 0.006 * m.kx, -Math.PI / 2 + sgn * 0.15, '#3a1e0e', '#7a4a24');
  fillEllipse(ctx, cx, m.Y(0.001), 0.0035 * m.kx, 0.0015 * m.ky, 0, '#6a5030');
  ctx.restore();
}

const PEAR: ModelDef = {
  build: buildPear,
  profile: PEAR_CUT,
  skin: pearSkinCutMat,
  flesh: pearFleshMat,
  section: pearSection,
  sectionV: pearSectionV,
};

// =============================================================================================
// KIWI (fuzzy brown ellipsoid lying on its side; profile upright: blossom end at y = 0)

const KIWI_L = 0.0698;
const KIWI_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0.0],
    [0.004, 0.0004],
    [0.0085, 0.0018],
    [0.0135, 0.0048],
    [0.019, 0.0105],
    [0.0232, 0.019],
    [0.0252, 0.029],
    [0.0256, 0.038],
    [0.025, 0.047],
    [0.0228, 0.0555],
    [0.0185, 0.0625],
    [0.013, 0.0668],
    [0.0075, 0.0692],
    [0.0035, 0.0698],
    [0.0001, KIWI_L],
  ],
  36,
);
const KIWI_PEELED: Profile = KIWI_PROFILE.map(([rr, y]) => [Math.max(0.0001, rr * 0.95), y * 0.97]);

/** Hair strokes along the fruit (shared by the colour and normal maps). */
function kiwiHairs(ctx: Ctx, w: number, h: number, light: string, dark: string, n: number) {
  const r = rng(123);
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = r.next() * w, y = r.next() * h, len = r.range(4, 11), a = r.range(-0.6, 0.6) + Math.PI / 2;
    ctx.strokeStyle = r.next() < 0.55 ? light : dark;
    ctx.globalAlpha = r.range(0.2, 0.55);
    ctx.lineWidth = r.range(0.6, 1.3);
    wrapX(w, x, len, (xx) => {
      ctx.beginPath();
      ctx.moveTo(xx, y);
      ctx.lineTo(xx + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
}

const kiwiSkinTex = lazy(() =>
  canvasTexture(
    512,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#7c5c30';
      ctx.fillRect(0, 0, w, h);
      noiseField(ctx, w, h, [24, 12], 51, (n) => (n > 0.5 ? '#8e6c3a' : '#664a22'), 0.7);
      kiwiHairs(ctx, w, h, '#b8966a', '#3e2a12', 3600);
      // darker, balder ends
      ctx.fillStyle = linear(ctx, 0, 0, 0, h, [[0, 'rgba(70,48,22,0.85)'], [0.05, 'rgba(70,48,22,0)'], [0.95, 'rgba(70,48,22,0)'], [1, 'rgba(60,40,20,0.9)']]);
      ctx.fillRect(0, 0, w, h);
    },
    { key: 'fruit-kiwi-skin' },
  ),
);
const kiwiNormalTex = lazy(() =>
  normalTex(
    'fruit-kiwi-normal',
    512,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, w, h);
      noiseField(ctx, w, h, [48, 24], 53, (n) => (n > 0.5 ? '#949494' : '#6c6c6c'), 0.8);
      kiwiHairs(ctx, w, h, '#d0d0d0', '#404040', 3600);
    },
    2,
  ),
);
const kiwiSkinMat = lazy(() =>
  withNormalScale(
    foodMat({
      color: '#ffffff',
      map: kiwiSkinTex(),
      normalMap: kiwiNormalTex(),
      roughness: 0.86,
      sheen: 1,
      sheenColor: '#dcc090',
      sheenRoughness: 0.55,
      flesh: colorsOf('kiwi').flesh,
      cookColor: colorsOf('kiwi').cooked,
      name: 'kiwi-skin',
    }),
    0.7,
  ),
);
const kiwiPeeledTex = lazy(() =>
  canvasTexture(
    512,
    256,
    (ctx) => {
      const L = latheInfo(KIWI_PEELED);
      const G = hexRGB('#7cc242'), G2 = hexRGB('#9ad25a'), GD = hexRGB('#62a832'), CORE = hexRGB('#eef4c8'), SEED = hexRGB('#2e3a14');
      pixels(ctx, 512, 256, (x, y, o) => {
        const u = (x + 0.5) / 512, v = 1 - (y + 0.5) / 256, sv = v * L.total;
        const n = fbmU(u, sv, 3, 190, 4.4, 3);
        setRGB(o, G);
        blend(o, n > 0 ? G2 : GD, Math.abs(n) * 1.1);
        const pole = Math.min(sv, L.total - sv);
        // fine fibres radiating from the core, only near the ends
        blend(o, G2, sstep(0.013, 0.005, pole) * (0.4 + 0.6 * noiseU(u, sv, 45, 40, 2.2)) * 0.6);
        blend(o, CORE, sstep(0.0065, 0.0025, pole));
        // the seed ring shows faintly through the flesh near each end
        const sd = noiseU(u, sv, 70, 600, 8.8);
        blend(o, SEED, sstep(0.45, 0.75, sd) * sstep(0.004, 0.0015, Math.abs(pole - 0.0105)) * 0.7);
      });
    },
    { key: 'fruit-kiwi-peeled' },
  ),
);
const kiwiPeeledMat = lazy(() =>
  foodMat({ color: '#ffffff', map: kiwiPeeledTex(), roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25, flesh: colorsOf('kiwi').flesh, cookColor: colorsOf('kiwi').cooked, name: 'kiwi-peeled' }),
);
const kiwiSkinCutMat = lazy(() => foodMat({ color: '#ffffff', map: kiwiSkinTex(), roughness: 0.86, sheen: 1, sheenColor: '#dcc090', sheenRoughness: 0.55, flesh: colorsOf('kiwi').flesh, cookColor: colorsOf('kiwi').cooked }));
const kiwiFleshMat = lazy(() => foodMat({ color: colorsOf('kiwi').flesh, roughness: 0.28, clearcoat: 0.4, clearcoatRoughness: 0.25, flesh: colorsOf('kiwi').flesh, cookColor: colorsOf('kiwi').cooked }));

function kiwiBuild(r: Rng, peeled: boolean): THREE.Object3D {
  const k = r.range(0.94, 1.05), sx = r.range(1.0, 1.06), sz = r.range(0.9, 0.97), seedN = r.range(0, 30);
  const g = lathe(peeled ? KIWI_PEELED : KIWI_PROFILE, 40);
  deform(g, (p) => {
    const f = k * (1 + fbm3(p.x * 45 + seedN, p.y * 45, p.z * 45, 2) * 0.03);
    p.x *= f * sx;
    p.z *= f * sz;
    p.y *= k;
  });
  const body = mesh(g, peeled ? kiwiPeeledMat() : kiwiSkinMat(), { name: 'kiwi-body' });
  const up = grp(body);
  if (!peeled) {
    const top = KIWI_L * k;
    up.add(mesh(colorStem([[0, top - 0.002, 0], [0, top + 0.0005, 0], [0.0002, top + 0.0018, 0]], 0.0034, 0.0028, [[0, '#6a5030'], [1, '#4a3420']], { tub: 2, radial: 10, caps: 'flat' }), vcStemMat()));
    up.add(mesh(colorStem([[0, 0.0014, 0], [0, -0.0004, 0], [0.0002, -0.0012, 0]], 0.0016, 0.0009, [[0, '#4a3420'], [1, '#2e2010']], { tub: 2, radial: 7 }), vcStemMat()));
  }
  up.rotation.z = Math.PI / 2 + r.range(-0.05, 0.05);
  const root = grp(up);
  root.rotation.y = r.range(-0.6, 0.6);
  return seat(root, body);
}

function kiwiSection(ctx: Ctx, s: number, o: SectionOpts) {
  const c = s / 2;
  const r = rng(121);
  let R = c;
  if (!o.peeled) {
    fillCircle(ctx, c, c, c, '#7a5a30');
    R = c * 0.962;
  }
  fillCircle(ctx, c, c, R, radial(ctx, c, c, 0, R, [[0, '#f6f6dc'], [0.18, '#eaf2c4'], [0.27, '#bfe080'], [0.45, '#94d050'], [0.85, '#80c444'], [1, '#6cb238']]));
  // white rays from the core
  ctx.lineCap = 'round';
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU + r.range(-0.05, 0.05);
    ctx.strokeStyle = `rgba(236,248,214,${r.range(0.3, 0.55)})`;
    ctx.lineWidth = s * r.range(0.005, 0.009);
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * R * 0.22, c + Math.sin(a) * R * 0.22);
    ctx.lineTo(c + Math.cos(a) * R * r.range(0.5, 0.7), c + Math.sin(a) * R * r.range(0.5, 0.7));
    ctx.stroke();
  }
  discDots(ctx, c, c, R * 0.95, r, 200, 'rgba(210,240,160,0.3)', [s * 0.004, s * 0.009], 0.45, 1);
  // ring of black seeds
  for (let i = 0; i < 52; i++) {
    const a = (i / 52) * TAU + r.range(-0.04, 0.04), d = R * r.range(0.3, 0.42);
    seed(ctx, c + Math.cos(a) * d, c + Math.sin(a) * d, s * r.range(0.03, 0.04), s * 0.017, a + r.range(-0.3, 0.3), '#0a0604', '#2a1c10', 'rgba(255,255,255,0.3)');
  }
  // creamy core
  fillEllipse(ctx, c, c, R * 0.19, R * 0.15, r.range(0, Math.PI), radial(ctx, c, c, 0, R * 0.19, [[0, '#fdfdf0'], [0.7, '#f4f6d8'], [1, 'rgba(240,246,204,0.6)']]));
}

function kiwiSectionV(ctx: Ctx, w: number, h: number, o: SectionOpts) {
  const prof = KIWI_PROFILE;
  const m = vmap(prof, w, h);
  ctx.fillStyle = o.peeled ? '#86c84a' : '#7a5a30';
  ctx.fillRect(0, 0, w, h);
  const d0 = o.peeled ? 0 : 0.0009;
  layeredSil(ctx, prof, m, [[d0, '#6cb238'], [d0 + 0.003, '#7cc242'], [d0 + 0.008, '#8ccc4a'], [d0 + 0.0135, '#b2dc72']]);
  const r = rng(122);
  ctx.save();
  silhouette(ctx, prof, m, d0);
  ctx.clip();
  const cx = m.X(0);
  ctx.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    const y = m.Y(r.range(0.008, 0.062)), side = r.sign();
    ctx.strokeStyle = `rgba(236,248,214,${r.range(0.3, 0.5)})`;
    ctx.lineWidth = w * r.range(0.005, 0.008);
    ctx.beginPath();
    ctx.moveTo(cx + side * 0.004 * m.kx, y);
    ctx.lineTo(cx + side * r.range(0.012, 0.016) * m.kx, y + r.range(-0.004, 0.004) * m.ky);
    ctx.stroke();
  }
  // seeds flanking the core
  for (let i = 0; i < 64; i++) {
    const yy = r.range(0.01, 0.06), side = i % 2 ? 1 : -1;
    const spread = Math.sin((Math.PI * (yy - 0.004)) / 0.062);
    const x = cx + side * r.range(0.0058, 0.0095) * spread * m.kx;
    seed(ctx, x, m.Y(yy), 0.0024 * m.kx, 0.0012 * m.kx, side > 0 ? r.range(-0.4, 0.4) : Math.PI + r.range(-0.4, 0.4), '#0a0604', '#2a1c10', 'rgba(255,255,255,0.25)');
  }
  // creamy core column
  const yT = m.Y(0.063), yB = m.Y(0.006), cw = 0.0042 * m.kx;
  ctx.beginPath();
  ctx.moveTo(cx, yT);
  ctx.bezierCurveTo(cx + cw * 1.3, lerp(yT, yB, 0.2), cx + cw * 1.3, lerp(yT, yB, 0.8), cx, yB);
  ctx.bezierCurveTo(cx - cw * 1.3, lerp(yT, yB, 0.8), cx - cw * 1.3, lerp(yT, yB, 0.2), cx, yT);
  ctx.fillStyle = '#f6f8de';
  ctx.fill();
  ctx.restore();
}

const KIWI: ModelDef = {
  build: (r) => kiwiBuild(r, false),
  peeled: (r) => kiwiBuild(r, true),
  profile: KIWI_PROFILE,
  skin: kiwiSkinCutMat,
  flesh: kiwiFleshMat,
  section: kiwiSection,
  sectionV: kiwiSectionV,
};

// =============================================================================================
// MANGO (flattened kidney shape lying on its flat side; profile upright: beak at y = 0)

const MANGO_L = 0.12;
const MANGO_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0.0],
    [0.005, 0.0008],
    [0.012, 0.004],
    [0.02, 0.011],
    [0.028, 0.022],
    [0.036, 0.04],
    [0.0405, 0.058],
    [0.0415, 0.072],
    [0.0395, 0.087],
    [0.034, 0.1],
    [0.0255, 0.11],
    [0.0155, 0.1165],
    [0.006, 0.1195],
    [0.0001, MANGO_L],
  ],
  40,
);
const MANGO_MAP = 0xe2 / 255;
const MANGO_BOOST = 1 / lin(MANGO_MAP);

const mangoSkinTex = lazy(() =>
  canvasTexture(
    512,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#e2e2e2';
      ctx.fillRect(0, 0, w, h);
      noiseField(ctx, w, h, [32, 16], 61, (n) => (n > 0.5 ? '#eaeaea' : '#d8d8d8'), 0.6);
      const r = rng(131);
      // pale lenticel dots
      for (let i = 0; i < 1100; i++) {
        const x = r.next() * w, y = r.range(0.03, 0.97) * h, s = r.range(0.5, 1.2);
        wrapX(w, x, 2, (xx) => fillCircle(ctx, xx, y, s, `rgba(255,255,236,${r.range(0.5, 0.9)})`));
      }
      for (let i = 0; i < 160; i++) {
        const x = r.next() * w, y = r.range(0.03, 0.97) * h;
        wrapX(w, x, 2, (xx) => fillCircle(ctx, xx, y, r.range(0.5, 1), 'rgba(90,60,30,0.4)'));
      }
    },
    { key: 'fruit-mango-skin' },
  ),
);
const mangoSkinMat = lazy(() =>
  foodMat({ color: '#ffffff', map: mangoSkinTex(), vertexColors: true, roughness: 0.38, clearcoat: 0.45, clearcoatRoughness: 0.3, flesh: colorsOf('mango').flesh, cookColor: colorsOf('mango').cooked, name: 'mango-skin' }),
);
const mangoSkinCutMat = lazy(() => {
  const m = foodMat({ color: colorsOf('mango').skin, map: mangoSkinTex(), roughness: 0.38, clearcoat: 0.4, flesh: colorsOf('mango').flesh, cookColor: colorsOf('mango').cooked });
  m.color.multiplyScalar(MANGO_BOOST);
  return m;
});
const mangoFleshMat = lazy(() => foodMat({ color: colorsOf('mango').flesh, roughness: 0.28, clearcoat: 0.4, clearcoatRoughness: 0.25, flesh: colorsOf('mango').flesh, cookColor: colorsOf('mango').cooked }));
/** Peeled: glossy golden flesh with fibres running along the fruit. */
const mangoPeeledMat = lazy(() =>
  foodMat({
    color: '#ffffff',
    map: canvasTexture(
      256,
      256,
      (ctx, w, h) => {
        const BASE = hexRGB('#ffae2c'), LIGHT = hexRGB('#ffca52'), DEEP = hexRGB('#f2921a'), STEM = hexRGB('#f8c040');
        pixels(ctx, w, h, (x, y, o) => {
          const u = (x + 0.5) / w, v = 1 - (y + 0.5) / h;
          const f = noiseU(u, v, 16, 5, 1.1), b = fbmU(u, v, 1.5, 3, 3.3, 2);
          setRGB(o, BASE);
          blend(o, f > 0 ? LIGHT : DEEP, Math.abs(f) * 0.7 + Math.abs(b) * 0.3);
          blend(o, STEM, sstep(0.75, 1, v) * 0.5);
        });
      },
      { key: 'fruit-mango-peeled' },
    ),
    roughness: 0.3,
    clearcoat: 0.55,
    clearcoatRoughness: 0.22,
    flesh: colorsOf('mango').flesh,
    cookColor: colorsOf('mango').cooked,
    name: 'mango-peeled',
  }),
);

function buildMango(r: Rng, peeled = false): THREE.Object3D {
  const k = r.range(0.94, 1.05), flat = r.range(0.76, 0.84), bend = r.range(0.004, 0.008), beak = r.range(0.004, 0.008), seedN = r.range(0, 40);
  const g = lathe(MANGO_PROFILE, 48);
  deform(g, (p) => {
    const t = p.y / MANGO_L;
    const f = k * (peeled ? 0.95 : 1) * (1 + fbm3(p.x * 35 + seedN, p.y * 35, p.z * 35, 2) * (peeled ? 0.035 : 0.022));
    p.x = p.x * f + bend * Math.sin(Math.PI * t) - beak * sstep(0.3, 0, t);
    p.z *= f * flat;
    p.y *= k;
  });
  const H = MANGO_L * k;
  const sunA = Math.PI + r.range(-0.5, 0.5), blushAmt = r.range(0.5, 1), green = r.range(0.15, 0.6);
  const GRN = col('#86a83a'), YEL = col('#f6c632'), ORA = col('#f7a232'), RED = col('#e2503a'), DEEP = col('#c03838');
  paintVertices(g, (p) => {
    const t = clamp(p.y / H), a = Math.atan2(p.x, p.z);
    const n = fbm3(p.x * 40 + seedN, p.y * 40, p.z * 40, 3);
    const sun = Math.cos(angDiff(a, sunA));
    const c = YEL.clone().lerp(ORA, clamp(0.3 + n * 0.7 + sun * 0.2));
    c.lerp(GRN, clamp(sstep(0.5, 0.98, t) * 0.7 + green * sstep(0.2, -0.6, sun) + n * 0.3 - 0.1));
    const b = sstep(0.0, 0.8, sun * 0.8 + (t - 0.4) * 0.8 + n * 0.9) * blushAmt;
    c.lerp(RED, b).lerp(DEEP, sstep(0.6, 1, b) * 0.4);
    return c.multiplyScalar(MANGO_BOOST);
  });
  const body = mesh(g, peeled ? mangoPeeledMat() : mangoSkinMat(), { skin: !peeled, name: 'mango-body' });
  const up = grp(body);
  if (!peeled) up.add(mesh(colorStem([[0, H - 0.003, 0], [0, H + 0.002, 0], [0.0004, H + 0.005, 0.0002]], 0.0022, 0.0018, [[0, '#6e6a30'], [1, '#4e3a20']], { tub: 3, radial: 8, caps: 'flat' }), vcStemMat()));
  up.rotation.x = Math.PI / 2;
  const root = grp(up);
  root.rotation.y = r.range(0, TAU);
  return seat(root, body);
}

/** Flat fibrous mango stone (cream with hairy fibres). */
function mangoPit(ctx: Ctx, x: number, y: number, rx: number, ry: number, r: Rng) {
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const a = r.range(0, TAU);
    const px = x + Math.cos(a) * rx * 0.95, py = y + Math.sin(a) * ry * 0.95;
    ctx.strokeStyle = `rgba(250,226,150,${r.range(0.35, 0.7)})`;
    ctx.lineWidth = Math.max(1, rx * r.range(0.02, 0.04));
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(a + r.range(-0.4, 0.4)) * rx * r.range(0.15, 0.35), py + Math.sin(a + r.range(-0.4, 0.4)) * ry * r.range(0.1, 0.3));
    ctx.stroke();
  }
  fillEllipse(ctx, x, y, rx, ry, 0, radial(ctx, x - rx * 0.2, y - ry * 0.2, 0, Math.max(rx, ry), [[0, '#fbf2d6'], [0.7, '#f2e2b0'], [1, '#e6cc8a']]));
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.clip();
  for (let i = 0; i < 40; i++) {
    const py = y + r.range(-1, 1) * ry, px = x + r.range(-1, 1) * rx;
    ctx.strokeStyle = 'rgba(214,184,120,0.45)';
    ctx.lineWidth = Math.max(1, rx * 0.025);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + r.range(-0.3, 0.3) * rx, py + r.range(-0.15, 0.15) * ry);
    ctx.stroke();
  }
  ctx.restore();
}

function mangoSection(ctx: Ctx, s: number, o: SectionOpts) {
  const c = s / 2;
  const r = rng(133);
  let R = c;
  if (!o.peeled) {
    ctx.fillStyle = linear(ctx, 0, 0, s, s, [[0, '#d8483a'], [0.5, '#f0a030'], [1, '#9aa83a']]);
    ctx.fillRect(0, 0, s, s);
    R = c * 0.97;
  }
  fillCircle(ctx, c, c, R, radial(ctx, c, c, 0, R, [[0, '#ffc23a'], [0.5, '#ffb52e'], [0.9, '#fca826'], [1, o.peeled ? '#ffb830' : '#f6c040']]));
  discFibres(ctx, c, c, R, r, 90, 'rgba(255,226,140,0.35)', [s * 0.003, s * 0.007], 0.2, 0.95);
  discDots(ctx, c, c, R * 0.95, r, 160, 'rgba(240,140,20,0.2)', [s * 0.004, s * 0.009], 0.2, 1);
  mangoPit(ctx, c, c, R * 0.44, R * 0.11, r);
}

function mangoSectionV(ctx: Ctx, w: number, h: number, o: SectionOpts) {
  const prof = MANGO_PROFILE;
  const m = vmap(prof, w, h);
  ctx.fillStyle = o.peeled ? '#ffb830' : '#e6702e';
  ctx.fillRect(0, 0, w, h);
  const d0 = o.peeled ? 0 : 0.0012;
  layeredSil(ctx, prof, m, [[d0, '#fbab28'], [d0 + 0.004, '#ffb52e'], [d0 + 0.012, '#ffbe38']]);
  const r = rng(134);
  ctx.save();
  silhouette(ctx, prof, m, d0);
  ctx.clip();
  const px = m.X(0), py = m.Y(0.062);
  ctx.lineCap = 'round';
  for (let i = 0; i < 80; i++) {
    const a = r.range(0, TAU);
    ctx.strokeStyle = 'rgba(255,226,140,0.35)';
    ctx.lineWidth = w * r.range(0.004, 0.008);
    ctx.beginPath();
    ctx.moveTo(px + Math.cos(a) * 0.02 * m.kx, py + Math.sin(a) * 0.04 * m.ky);
    ctx.lineTo(px + Math.cos(a) * 0.036 * m.kx, py + Math.sin(a) * 0.056 * m.ky);
    ctx.stroke();
  }
  mangoPit(ctx, px, py, 0.021 * m.kx, 0.04 * m.ky, r);
  ctx.restore();
}

const MANGO: ModelDef = {
  build: (r) => buildMango(r),
  peeled: (r) => buildMango(r, true),
  profile: MANGO_PROFILE,
  skin: mangoSkinCutMat,
  flesh: mangoFleshMat,
  section: mangoSection,
  sectionV: mangoSectionV,
};

// =============================================================================================
// COCONUT (hairy brown husk with three eyes; profile upright: eyes on top)

const COCO_L = 0.118, COCO_R = 0.053;
const COCO_PROFILE: Profile = (() => {
  const pts: Profile = [];
  const n = 36;
  for (let i = 0; i <= n; i++) {
    const th = -Math.PI / 2 + (i / n) * Math.PI;
    const s = Math.sin(th);
    pts.push([Math.max(0.0001, COCO_R * Math.cos(th) * (1 - 0.06 * s)), (COCO_L / 2) * (1 + s)]);
  }
  return pts;
})();

function cocoHairs(ctx: Ctx, w: number, h: number, cols: string[], n: number) {
  const r = rng(143);
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = r.next() * w, y = r.range(-0.04, 0.97) * h, len = r.range(8, 26), a = Math.PI / 2 + r.range(-0.45, 0.45), bend = r.range(-4, 4);
    ctx.strokeStyle = r.pick(cols);
    ctx.globalAlpha = r.range(0.3, 0.75);
    ctx.lineWidth = r.range(0.5, 1.2);
    wrapX(w, x, len, (xx) => {
      ctx.beginPath();
      ctx.moveTo(xx, y);
      ctx.quadraticCurveTo(xx + Math.cos(a) * len * 0.5 + bend, y + Math.sin(a) * len * 0.5, xx + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
}

const cocoHairTex = lazy(() =>
  canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#4a2c16';
      ctx.fillRect(0, 0, w, h);
      noiseField(ctx, w, h, [20, 20], 71, (n) => (n > 0.5 ? '#664024' : '#341c0a'), 0.8);
      cocoHairs(ctx, w, h, ['#2a160a', '#22120a', '#5a3a20', '#7a5230', '#946a42', '#b08454', '#c49868'], 9000);
      // smoother, darker cap around the eyes (top)
      ctx.fillStyle = linear(ctx, 0, 0, 0, h, [[0, 'rgba(52,32,16,0.95)'], [0.035, 'rgba(52,32,16,0.5)'], [0.07, 'rgba(52,32,16,0)']]);
      ctx.fillRect(0, 0, w, h);
    },
    { key: 'fruit-coco-hair' },
  ),
);
const cocoHairNormal = lazy(() =>
  normalTex(
    'fruit-coco-hair-n',
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#707070';
      ctx.fillRect(0, 0, w, h);
      noiseField(ctx, w, h, [40, 40], 73, (n) => (n > 0.5 ? '#868686' : '#5a5a5a'), 0.8);
      cocoHairs(ctx, w, h, ['#e8e8e8', '#c8c8c8', '#d8d8d8', '#303030', '#404040'], 9000);
    },
    3,
  ),
);
const cocoHairMat = lazy(() =>
  foodMat({
    color: '#ffffff',
    map: cocoHairTex(),
    normalMap: cocoHairNormal(),
    roughness: 0.92,
    sheen: 0.8,
    sheenColor: '#c89c6c',
    sheenRoughness: 0.65,
    flesh: colorsOf('coconut').flesh,
    cookColor: colorsOf('coconut').cooked,
    name: 'coconut-husk',
  }),
);
const cocoEyeMat = lazy(() => foodMat({ color: '#24160c', roughness: 0.75, flesh: colorsOf('coconut').flesh, cookColor: '#140c06', name: 'coconut-eye' }));
const cocoSkinCutMat = lazy(() => foodMat({ color: '#ffffff', map: cocoHairTex(), roughness: 0.92, sheen: 1, sheenColor: '#e8c494', sheenRoughness: 0.7, flesh: colorsOf('coconut').flesh, cookColor: colorsOf('coconut').cooked }));
const cocoFleshMat = lazy(() => foodMat({ color: colorsOf('coconut').flesh, roughness: 0.55, flesh: colorsOf('coconut').flesh, cookColor: colorsOf('coconut').cooked }));

function buildCoconut(r: Rng): THREE.Object3D {
  const k = r.range(0.94, 1.05), seedN = r.range(0, 40), ph = r.range(0, TAU);
  const g = lathe(COCO_PROFILE, 48);
  deform(g, (p) => {
    const a = Math.atan2(p.x, p.z), rad = Math.hypot(p.x, p.z);
    const ridge = 1 + 0.035 * Math.cos(3 * a + ph) * sstep(0.004, 0.02, rad);
    const f = k * ridge * (1 + fbm3(p.x * 30 + seedN, p.y * 30, p.z * 30, 3) * 0.04);
    p.x *= f;
    p.z *= f;
    p.y *= k;
  });
  const body = mesh(g, cocoHairMat(), { name: 'coconut-body' });
  const up = grp(body);
  // three eyes in a little triangle at the top
  const eye = new THREE.SphereGeometry(0.0034, 10, 6);
  const eyes: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const a = ph / 3 + (i / 3) * TAU, d = 0.0072 * k;
    // the shell is ~0.6 mm below the pole at this radius; sink the eyes a little
    eyes.push(bake(eye.clone(), [Math.sin(a) * d, COCO_L * k - 0.0011, Math.cos(a) * d], a, 0, 0, [i === 0 ? 1.1 : 0.9, 0.45, 1]));
  }
  up.add(mesh(merge(eyes), cocoEyeMat(), { name: 'coconut-eyes' }));
  up.rotation.z = (Math.PI / 2) * r.range(0.6, 0.7);
  const root = grp(up);
  root.rotation.y = r.range(0, TAU);
  return seat(root, body);
}

function cocoSection(ctx: Ctx, s: number, o: SectionOpts) {
  const c = s / 2;
  const r = rng(141);
  let R = c;
  if (!o.peeled) {
    fillCircle(ctx, c, c, c, '#6b4423');
    discFibres(ctx, c, c, c, r, 200, 'rgba(176,134,84,0.7)', [s * 0.003, s * 0.006], 0.93, 1.0);
    R = c * 0.95;
    fillCircle(ctx, c, c, R, radial(ctx, c, c, R * 0.9, R, [[0, '#2e1c0e'], [1, '#4a2e18']]));
    R = c * 0.915;
  }
  fillCircle(ctx, c, c, R, '#8a6242');
  const rm = R * 0.975;
  fillCircle(ctx, c, c, rm, radial(ctx, c, c, rm * 0.7, rm, [[0, '#fdfbf3'], [0.8, '#fbf8ee'], [1, '#f2ecdc']]));
  // the hollow: shaded so it reads as a cavity (shadow under the top-left rim, lit far wall)
  const rh = rm * 0.74;
  fillCircle(ctx, c, c, rh, radial(ctx, c + rh * 0.2, c + rh * 0.25, rh * 0.1, rh * 1.15, [[0, '#ece5d4'], [0.6, '#ddd3be'], [1, '#bdb099']]));
  ctx.save();
  circle(ctx, c, c, rh);
  ctx.clip();
  fillCircle(ctx, c + rh * 0.12, c + rh * 0.14, rh * 0.98, 'rgba(0,0,0,0)');
  ctx.fillStyle = radial(ctx, c - rh * 0.55, c - rh * 0.55, rh * 0.3, rh * 1.3, [[0, 'rgba(120,100,70,0.45)'], [0.5, 'rgba(120,100,70,0.12)'], [1, 'rgba(120,100,70,0)']]);
  ctx.fillRect(0, 0, s, s);
  ctx.restore();
  ctx.strokeStyle = 'rgba(160,140,110,0.5)';
  ctx.lineWidth = s * 0.006;
  circle(ctx, c, c, rh);
  ctx.stroke();
}

function cocoSectionV(ctx: Ctx, w: number, h: number, o: SectionOpts) {
  const prof = COCO_PROFILE;
  const m = vmap(prof, w, h);
  ctx.fillStyle = o.peeled ? '#4a2e18' : '#6b4423';
  ctx.fillRect(0, 0, w, h);
  const d0 = o.peeled ? 0 : 0.0028;
  layeredSil(ctx, prof, m, [[d0, '#3a2412'], [d0 + 0.0022, '#8a6242'], [d0 + 0.0028, '#f2ecdc'], [d0 + 0.004, '#fbf8ee']]);
  ctx.save();
  silhouette(ctx, prof, m, d0 + 0.0135);
  ctx.fillStyle = radial(ctx, w * 0.6, h * 0.6, w * 0.05, w * 0.7, [[0, '#ece5d4'], [0.6, '#ddd3be'], [1, '#bdb099']]);
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = radial(ctx, w * 0.2, h * 0.15, w * 0.1, w * 0.8, [[0, 'rgba(120,100,70,0.45)'], [1, 'rgba(120,100,70,0)']]);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  if (!o.peeled) {
    const r = rng(142);
    ctx.save();
    ctx.fillStyle = 'rgba(176,134,84,0.6)';
    for (let i = 0; i < 150; i++) {
      const x = r.next() * w, y = r.next() * h;
      fillCircle(ctx, x, y, w * 0.004, 'rgba(176,134,84,0.25)');
    }
    ctx.restore();
  }
}

const COCONUT: ModelDef = {
  build: buildCoconut,
  profile: COCO_PROFILE,
  skin: cocoSkinCutMat,
  flesh: cocoFleshMat,
  section: cocoSection,
  sectionV: cocoSectionV,
};

// =============================================================================================
// AVOCADO (pebbly Hass skin, lies on its side; profile upright: bulb at the bottom)

const AVO_H = 0.099;
const AVO_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0.0],
    [0.008, 0.0006],
    [0.016, 0.0028],
    [0.024, 0.0075],
    [0.0305, 0.0155],
    [0.0338, 0.026],
    [0.0342, 0.037],
    [0.0322, 0.048],
    [0.0285, 0.058],
    [0.0248, 0.068],
    [0.0218, 0.077],
    [0.0185, 0.0855],
    [0.0138, 0.0925],
    [0.0078, 0.097],
    [0.003, 0.0988],
    [0.0001, AVO_H],
  ],
  40,
);
const AVO_PIT_Y = 0.032, AVO_PIT_R = 0.0195;

const avoSkinField = lazy(() => {
  const BASE = hexRGB('#2e4a1c'), TOPC = hexRGB('#557430'), LOW = hexRGB('#1a2c10'), DARK = hexRGB('#2a2428'), OLIVE = hexRGB('#5e7232');
  return latheField(AVO_PROFILE, 512, 512, (u, v, sv, circ, o) => {
    // pebbles ~1.5 mm: two octaves of value noise, rounded tops
    const n1 = noiseU(u, sv, 20, 640, 1.3), n2 = noiseU(u, sv, 42, 1300, 5.1);
    const hgt = sstep(-0.35, 0.55, n1 * 0.75 + n2 * 0.45);
    const big = fbmU(u, sv, 2.2, 40, 9.7, 3);
    setRGB(o, BASE);
    blend(o, TOPC, hgt * 0.75);
    blend(o, LOW, (1 - hgt) * 0.6);
    blend(o, DARK, sstep(0.05, 0.4, big) * 0.75);
    blend(o, OLIVE, sstep(-0.1, -0.45, big) * 0.45);
    const pole = Math.min(sv, latheInfo(AVO_PROFILE).total - sv);
    blend(o, hexRGB('#4a3a22'), sstep(0.004, 0.0015, pole) * 0.8);
    return hgt;
  });
});
const avoSkinMat = lazy(() =>
  withNormalScale(
    foodMat({
      color: '#ffffff',
      map: fieldTex('fruit-avo-skin', 512, 512, avoSkinField),
      normalMap: normalField('fruit-avo-normal', 512, 512, () => avoSkinField().H, 2.2),
      roughness: 0.55,
      clearcoat: 0.3,
      clearcoatRoughness: 0.45,
      flesh: colorsOf('avocado').flesh,
      cookColor: colorsOf('avocado').cooked,
      name: 'avocado-skin',
    }),
    1,
  ),
);
const avoSkinCutMat = lazy(() => foodMat({ color: '#ffffff', map: fieldTex('fruit-avo-skin', 512, 512, avoSkinField), roughness: 0.55, clearcoat: 0.25, flesh: colorsOf('avocado').flesh, cookColor: colorsOf('avocado').cooked }));
const avoFleshMat = lazy(() => foodMat({ color: colorsOf('avocado').flesh, roughness: 0.42, flesh: colorsOf('avocado').flesh, cookColor: colorsOf('avocado').cooked }));

function buildAvocado(r: Rng): THREE.Object3D {
  const k = r.range(0.94, 1.05), fat = r.range(0.95, 1.06), seedN = r.range(0, 40), lean = r.range(-0.004, 0.004);
  const g = lathe(AVO_PROFILE, 48);
  deform(g, (p) => {
    const t = p.y / AVO_H;
    const f = k * fat * (1 + fbm3(p.x * 30 + seedN, p.y * 30, p.z * 30, 3) * 0.035);
    p.x = p.x * f + lean * t * t;
    p.z *= f;
    p.y *= k;
  });
  const body = mesh(g, avoSkinMat(), { skin: true, name: 'avocado-body' });
  const top = AVO_H * k;
  const stem = mesh(colorStem([[lean, top - 0.002, 0], [lean, top + 0.0015, 0], [lean + 0.0003, top + 0.0035, 0.0002]], 0.0028, 0.0024, [[0, '#6a5a30'], [1, '#4a3820']], { tub: 3, radial: 9, caps: 'flat' }), vcStemMat());
  const up = grp(body, stem);
  up.rotation.z = Math.PI / 2 + r.range(0.12, 0.2);
  const root = grp(up);
  root.rotation.y = r.range(-0.7, 0.7);
  return seat(root, body);
}

/** Glossy brown avocado stone (canvas disc at x, y, radius pr). */
function avoPit(ctx: Ctx, x: number, y: number, prx: number, pry: number) {
  fillEllipse(ctx, x, y, prx * 1.08, pry * 1.08, 0, 'rgba(150,140,60,0.4)');
  fillEllipse(ctx, x, y, prx, pry, 0, radial(ctx, x - prx * 0.3, y - pry * 0.35, Math.min(prx, pry) * 0.05, Math.max(prx, pry) * 1.15, [[0, '#c48a5c'], [0.35, '#9c6038'], [0.8, '#6e3c20'], [1, '#56301a']]));
  fillEllipse(ctx, x - prx * 0.36, y - pry * 0.42, prx * 0.26, pry * 0.14, -0.6, 'rgba(255,238,218,0.5)');
}

function avoSection(ctx: Ctx, s: number, o: SectionOpts) {
  const c = s / 2;
  const r = rng(151);
  let R = c;
  if (!o.peeled) {
    fillCircle(ctx, c, c, c, '#22301a');
    R = c * 0.972;
  }
  fillCircle(ctx, c, c, R, radial(ctx, c, c, 0, R, [[0, '#f2eab0'], [0.42, '#ebe6a0'], [0.62, '#d6e07c'], [0.82, '#b4d05a'], [0.94, '#8cbc3e'], [1, '#6ea630']]));
  discDots(ctx, c, c, R * 0.95, r, 160, 'rgba(255,255,220,0.25)', [s * 0.005, s * 0.012], 0.4, 1);
  avoPit(ctx, c, c, R * 0.38, R * 0.38);
}

function avoSectionV(ctx: Ctx, w: number, h: number, o: SectionOpts) {
  const prof = AVO_PROFILE;
  const m = vmap(prof, w, h);
  ctx.fillStyle = o.peeled ? '#9cc84a' : '#22301a';
  ctx.fillRect(0, 0, w, h);
  const d0 = o.peeled ? 0 : 0.0011;
  layeredSil(ctx, prof, m, [[d0, '#6ea630'], [d0 + 0.0015, '#8cbc3e'], [d0 + 0.004, '#b4d05a'], [d0 + 0.008, '#d6e07c'], [d0 + 0.012, '#ebe6a0']]);
  const r = rng(152);
  ctx.save();
  silhouette(ctx, prof, m, d0);
  ctx.clip();
  for (let i = 0; i < 200; i++) fillCircle(ctx, r.next() * w, r.next() * h, w * r.range(0.005, 0.012), 'rgba(255,255,220,0.2)');
  avoPit(ctx, m.X(0), m.Y(AVO_PIT_Y), AVO_PIT_R * m.kx, AVO_PIT_R * 1.08 * m.ky);
  ctx.restore();
}

const AVOCADO: ModelDef = {
  build: buildAvocado,
  profile: AVO_PROFILE,
  skin: avoSkinCutMat,
  flesh: avoFleshMat,
  section: avoSection,
  sectionV: avoSectionV,
};

// =============================================================================================

export const MODELS: ModelTable = {
  apple: APPLE,
  banana: BANANA,
  orange: ORANGE,
  lemon: LEMON,
  strawberry: STRAWBERRY,
  watermelon: WATERMELON,
  pineapple: PINEAPPLE,
  grapes: GRAPES,
  cherry: CHERRY,
  blueberry: BLUEBERRY,
  peach: PEACH,
  pear: PEAR,
  kiwi: KIWI,
  mango: MANGO,
  coconut: COCONUT,
  avocado: AVOCADO,
};
