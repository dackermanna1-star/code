// Meat models: steak, chicken leg, whole chicken, sausage, bacon, ham, burger patty.
//
// Also hosts a few small protein-modelling helpers (slab geometry, tileable canvas painters) that
// seafood.ts and dairy.ts reuse.

import * as THREE from 'three';
import type { ModelDef, ModelTable, SectionOpts } from './types';
import { getDef } from '../food/catalog';
import {
  Rng,
  rng,
  fbm3,
  canvasTexture,
  latheGeometry,
  smoothProfile,
  deform,
  noisify,
  smoothNormals,
  sweepGeometry,
  curveThrough,
  merge,
  transformed,
  mesh,
  group,
  sitOnGround,
  skinMesh,
  lazy,
  foodMat,
  type Profile,
} from './kit';

// =============================================================================================
// Shared helpers (exported for seafood.ts / dairy.ts)
// =============================================================================================

export const TAU = Math.PI * 2;

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function sstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Wrapped angle difference a - b in -PI..PI. */
export function angDiff(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** '#rrggbb' + alpha -> css rgba(). */
export function rgba(hex: string, a: number): string {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}

/** Hex colour mixed towards another (sRGB-ish, for canvas painting). */
export function mixHex(a: string, b: string, t: number): string {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  ca.lerp(cb, clamp01(t));
  return '#' + ca.getHexString();
}

/** Draw at (x, y) and at its wrapped copies so a canvas tiles seamlessly. */
export function wrapped(w: number, h: number, x: number, y: number, pad: number, draw: (x: number, y: number) => void) {
  for (let ox = -1; ox <= 1; ox++)
    for (let oy = -1; oy <= 1; oy++) {
      const xx = x + ox * w, yy = y + oy * h;
      if (xx < -pad || xx > w + pad || yy < -pad || yy > h + pad) continue;
      draw(xx, yy);
    }
}

/** Tileable soft colour patches. */
export function mottleT(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  r: Rng,
  count: number,
  size: [number, number],
  alpha: [number, number],
  squash = 1,
) {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = r.next() * w, y = r.next() * h, s = r.range(size[0], size[1]);
    const a = r.range(alpha[0], alpha[1]);
    wrapped(w, h, x, y, s, (xx, yy) => {
      ctx.save();
      ctx.translate(xx, yy);
      ctx.scale(1, squash);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
      g.addColorStop(0, rgba(color, a));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.restore();
    });
  }
  ctx.restore();
}

/** Tileable little dots. */
export function specksT(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  r: Rng,
  count: number,
  size: [number, number],
  alpha = 1,
  elongate = 1,
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    const x = r.next() * w, y = r.next() * h, s = r.range(size[0], size[1]), rot = r.next() * Math.PI;
    wrapped(w, h, x, y, s * elongate + 1, (xx, yy) => {
      ctx.beginPath();
      ctx.ellipse(xx, yy, s, s * elongate, rot, 0, TAU);
      ctx.fill();
    });
  }
  ctx.restore();
}

export interface StreakOpts {
  count: number;
  /** Start region. */
  x: [number, number];
  y: [number, number];
  steps: [number, number];
  step: number;
  width: [number, number];
  color: string;
  alpha?: [number, number];
  /** Main direction (radians) and its jitter. */
  dir?: number;
  dirJitter?: number;
  /** Random turning per step. */
  turn?: number;
  /** Chance per step to fork a thinner branch. */
  branch?: number;
  /** Only draw where mask(x, y) is true. */
  mask?: (x: number, y: number) => boolean;
  /** Wrap copies for tileable textures. */
  wrap?: [number, number];
  /** Soft edges: each segment also gets a wider faint halo stroke. */
  soft?: number;
}

/** Wiggly tapering random-walk lines: marbling, fat veins, fibres. */
export function streaks(ctx: CanvasRenderingContext2D, r: Rng, o: StreakOpts) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const walk = (x: number, y: number, ang: number, n: number, w0: number, a: number, depth: number) => {
    let px = x, py = y;
    for (let i = 0; i < n; i++) {
      ang += r.gauss() * (o.turn ?? 0.35);
      const nx = px + Math.cos(ang) * o.step * r.range(0.6, 1.3);
      const ny = py + Math.sin(ang) * o.step * r.range(0.6, 1.3);
      const t = i / n;
      const lw = Math.max(0.35, w0 * (1 - t * 0.75) * r.range(0.75, 1.2));
      if (!o.mask || (o.mask(px, py) && o.mask(nx, ny))) {
        const seg = (ox: number, oy: number) => {
          ctx.beginPath();
          ctx.moveTo(px + ox, py + oy);
          ctx.lineTo(nx + ox, ny + oy);
          ctx.stroke();
        };
        const passes: [number, number][] = o.soft ? [[lw * (1 + o.soft), a * 0.3], [lw, a]] : [[lw, a]];
        for (const [pw, pa] of passes) {
          ctx.lineWidth = pw;
          ctx.strokeStyle = rgba(o.color, pa);
          if (o.wrap) {
            const [W, H] = o.wrap;
            for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) seg(ox * W, oy * H);
          } else seg(0, 0);
        }
      }
      if (depth < 2 && r.next() < (o.branch ?? 0.06)) walk(nx, ny, ang + r.sign() * r.range(0.4, 1.1), Math.floor((n - i) * 0.6), lw * 0.6, a * 0.9, depth + 1);
      px = nx;
      py = ny;
    }
  };
  for (let s = 0; s < o.count; s++) {
    const x = r.range(o.x[0], o.x[1]), y = r.range(o.y[0], o.y[1]);
    const ang = (o.dir ?? r.next() * TAU) + r.gauss() * (o.dirJitter ?? 0.4);
    const al = o.alpha ? r.range(o.alpha[0], o.alpha[1]) : 1;
    walk(x, y, ang, r.int(o.steps[0], o.steps[1]), r.range(o.width[0], o.width[1]), al, 0);
  }
  ctx.restore();
}

/** Grey bump texture made by a draw callback on mid-grey (srgb false, cached). */
export function bumpTexture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, wrap = true): THREE.Texture {
  return canvasTexture(
    w,
    h,
    (ctx, W, H) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, W, H);
      draw(ctx, W, H);
    },
    { key, srgb: false, wrap },
  );
}

const repeatCache = new Map<string, THREE.Texture>();
/** A cached clone of a (wrapping) texture with its own repeat. */
export function repeated(base: THREE.Texture, key: string, rx: number, ry: number): THREE.Texture {
  const hit = repeatCache.get(key);
  if (hit) return hit;
  const t = base.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  repeatCache.set(key, t);
  return t;
}

/** Replace a geometry's UVs with a function of the vertex position. */
export function setUV(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number, i: number) => [number, number]): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const [u, v] = fn(pos.getX(i), pos.getY(i), pos.getZ(i), i);
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

const _Y = new THREE.Vector3(0, 1, 0);
/** Bake a transform that maps local +Y onto `dir` (normalised) and moves the origin to `at`. */
export function alongDir(g: THREE.BufferGeometry, at: THREE.Vector3, dir: THREE.Vector3, roll = 0): THREE.BufferGeometry {
  const q = new THREE.Quaternion().setFromUnitVectors(_Y, dir.clone().normalize());
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(_Y, roll));
  const m = new THREE.Matrix4().compose(at, q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

export interface SlabOpts {
  /** Outline radius (m) at polar angle a: x = cos(a) * R, z = sin(a) * R. Must be periodic. */
  outline: (a: number) => number;
  /** Top height (m) at (x, z). The bottom face is flat at y = 0. */
  thickness: (x: number, z: number) => number;
  /** Horizontal size of the rounded rim (m). Default 0.6 * thickness at the rim. */
  edge?: number;
  /** < 1 squarer rim, 1 elliptic. */
  edgePow?: number;
  segments?: number;
  /** Rings on each flat face. */
  rings?: number;
  /** Rings around the rim. */
  edgeRings?: number;
  /** 'polar': outline -> unit disc of the texture (paint the face as a disc); 'planar': x/z bounds -> 0..1. */
  uv?: 'polar' | 'planar';
  /** Rim rings below this height fraction (and the bottom face) go to material group 1. */
  split?: number;
}

/**
 * A soft slab (steak, fillet, cutlet): flat bottom, gently domed top and a rounded rim that
 * follows an arbitrary star-shaped outline. Indexed, smooth normals, outward winding.
 * Groups: 0 = top + upper rim, 1 = lower rim + bottom (see `split`).
 */
export function slabGeometry(o: SlabOpts): THREE.BufferGeometry {
  const S = o.segments ?? 72;
  const RG = o.rings ?? 7;
  const ER = o.edgeRings ?? 10;
  const pw = o.edgePow ?? 0.75;
  const split = o.split ?? 0.5;
  type PP = { f: 0 | 1 | 2; t: number };
  const prof: PP[] = [];
  for (let k = 0; k < RG; k++) prof.push({ f: 0, t: k / RG });
  for (let k = 0; k <= ER; k++) prof.push({ f: 1, t: k / ER });
  for (let k = RG - 1; k >= 0; k--) prof.push({ f: 2, t: k / RG });
  const P = prof.length;
  // profile entry -> height fraction & normalised radius (rim part depends on the angle)
  const pos: number[] = [];
  const uvs: number[] = [];
  let splitIndex = RG;
  for (let k = 0; k <= ER; k++) {
    const phi = -Math.PI / 2 + (k / ER) * Math.PI;
    const s = Math.sin(phi);
    const h = 0.5 + 0.5 * Math.sign(s) * Math.pow(Math.abs(s), pw);
    if (h < split) splitIndex = RG + k + 1;
  }
  for (let j = 0; j <= S; j++) {
    const a = (j / S) * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    const R = o.outline(j === S ? 0 : a);
    const rimT = o.thickness(ca * R * 0.97, sa * R * 0.97);
    const ex = Math.min(o.edge ?? rimT * 0.6, R * 0.45);
    const rin = 1 - ex / R;
    for (const p of prof) {
      let rho: number, h: number;
      if (p.f === 1) {
        const phi = -Math.PI / 2 + p.t * Math.PI;
        const c = Math.max(0, Math.cos(phi)), s = Math.sin(phi);
        rho = rin + (1 - rin) * Math.pow(c, pw);
        h = 0.5 + 0.5 * Math.sign(s) * Math.pow(Math.abs(s), pw);
      } else {
        rho = rin * p.t;
        h = p.f === 2 ? 1 : 0;
      }
      const x = rho * R * ca, z = rho * R * sa;
      const y = h * o.thickness(x, z);
      pos.push(x, y, z);
      uvs.push(0.5 + 0.5 * rho * ca, 0.5 + 0.5 * rho * sa);
    }
  }
  const top: number[] = [], bot: number[] = [];
  for (let j = 0; j < S; j++)
    for (let i = 0; i < P - 1; i++) {
      const a = j * P + i, b = j * P + i + 1, c = (j + 1) * P + i + 1, d = (j + 1) * P + i;
      const list = i + 1 <= splitIndex - 1 ? bot : top;
      list.push(a, b, d, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex([...top, ...bot]);
  g.addGroup(0, top.length, 0);
  g.addGroup(top.length, bot.length, 1);
  if (o.uv === 'planar') {
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const sx = bb.max.x - bb.min.x, sz = bb.max.z - bb.min.z;
    setUV(g, (x, _y, z) => [(x - bb.min.x) / sx, (z - bb.min.z) / sz]);
  }
  smoothNormals(g);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * Lathe (around Y) whose UVs avoid the pole pinch: rings in the bottom / top zones get a planar
 * (x, z) projection, the side band a cylindrical one. The zones are separate merged sub-lathes
 * sharing boundary rings, so positions & normals stay continuous.
 * `zones` = [index where the side band starts, index where the top zone starts] in the profile.
 */
export function latheZoned(profile: Profile, segments: number, zones: [number, number], scale: number): THREE.BufferGeometry {
  const [i0, i1] = zones;
  const parts: THREE.BufferGeometry[] = [];
  const maxR = Math.max(...profile.map((p) => p[0]));
  const circ = TAU * maxR;
  const wraps = Math.max(1, Math.round(circ / scale));
  const bottom = latheGeometry(profile.slice(0, i0 + 1), segments);
  setUV(bottom, (x, _y, z) => [0.5 + x / scale, 0.5 - z / scale]);
  parts.push(bottom);
  const side = latheGeometry(profile.slice(i0, i1 + 1), segments);
  const P = i1 - i0 + 1;
  setUV(side, (_x, y, _z, i) => [(Math.floor(i / P) / segments) * wraps, y / scale]);
  parts.push(side);
  const topG = latheGeometry(profile.slice(i1), segments);
  setUV(topG, (x, _y, z) => [0.5 + x / scale + 0.37, 0.5 + z / scale + 0.21]);
  parts.push(topG);
  const g = merge(parts);
  smoothNormals(g);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Local helpers

function colors(id: string) {
  return getDef(id).colors;
}

function tex(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, wrap = false) {
  return canvasTexture(w, h, draw, { key, wrap });
}

/** Canvas point for polar texture coordinates (rho 0..1, angle a). */
function polarPt(s: number, rho: number, a: number): [number, number] {
  return [s * (0.5 + 0.5 * rho * Math.cos(a)), s * (0.5 - 0.5 * rho * Math.sin(a))];
}

// =============================================================================================
// STEAK - thick ribeye with a fat cap, a fat seam and marbling
// =============================================================================================

const STEAK = {
  meat: '#ad2834',
  dark: '#7f1726',
  light: '#c73b47',
  rim: '#8e1d2b',
  fat: '#f6e7d8',
  fatShade: '#ead0bf',
  marble: '#f4ddd5',
};

/** Soft white flecks, clustered like real intramuscular fat. */
function marbleFlecks(ctx: CanvasRenderingContext2D, r: Rng, w: number, h: number, count: number, clusters: number, wrap: boolean, color = STEAK.marble) {
  const centres = Array.from({ length: clusters }, () => [r.next() * w, r.next() * h, r.range(w * 0.05, w * 0.14)] as const);
  for (let i = 0; i < count; i++) {
    const [cx, cy, cr] = r.pick(centres);
    const x = cx + r.gauss() * cr * 0.5, y = cy + r.gauss() * cr * 0.5;
    const len = r.range(w * 0.003, w * 0.013), wid = len * r.range(0.3, 0.65), rot = r.next() * Math.PI, a = r.range(0.45, 0.9);
    const draw = (xx: number, yy: number) => {
      ctx.fillStyle = rgba(color, a * 0.28);
      ctx.beginPath();
      ctx.ellipse(xx, yy, len * 1.7, wid * 2, rot, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(color, a);
      ctx.beginPath();
      ctx.ellipse(xx, yy, len, wid, rot, 0, TAU);
      ctx.fill();
    };
    if (wrap) wrapped(w, h, x, y, len * 2, draw);
    else draw(x, y);
  }
}

function paintMarbledMeat(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, density = 1, wrap = false) {
  const r = rng(seed);
  ctx.fillStyle = STEAK.meat;
  ctx.fillRect(0, 0, w, h);
  mottleT(ctx, w, h, STEAK.dark, r, 36, [w * 0.05, w * 0.16], [0.18, 0.4]);
  mottleT(ctx, w, h, STEAK.light, r, 36, [w * 0.04, w * 0.12], [0.15, 0.32]);
  const wr: [number, number] | undefined = wrap ? [w, h] : undefined;
  // fine muscle grain
  streaks(ctx, r, { count: Math.round(180 * density), x: [0, w], y: [0, h], steps: [3, 8], step: w * 0.012, width: [0.6, 1.4], color: STEAK.dark, alpha: [0.12, 0.28], dir: 0.4, dirJitter: 0.5, turn: 0.15, branch: 0, wrap: wr });
  // marbling: soft veins + clustered flecks
  streaks(ctx, r, { count: Math.round(22 * density), x: [0, w], y: [0, h], steps: [5, 16], step: w * 0.014, width: [w * 0.004, w * 0.011], color: STEAK.marble, alpha: [0.5, 0.85], turn: 0.55, branch: 0.15, soft: 1.6, wrap: wr });
  marbleFlecks(ctx, r, w, h, Math.round(240 * density), 9, wrap);
}

const STEAK_CAP: [number, number] = [Math.PI * 0.2, Math.PI * 0.86];

const steakFaceTex = lazy(() =>
  tex('steak-face', 512, 512, (ctx, s) => {
    const r = rng(41);
    paintMarbledMeat(ctx, s, s, 11, 1.1);
    // darker, drier band round the rim (it is what the sides of the slab show)
    const rim = ctx.createRadialGradient(s / 2, s / 2, s * 0.4, s / 2, s / 2, s * 0.5);
    rim.addColorStop(0, rgba(STEAK.rim, 0));
    rim.addColorStop(0.8, rgba(STEAK.rim, 0.3));
    rim.addColorStop(1, rgba(STEAK.rim, 0.55));
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, s, s);
    // a soft, broken fat seam between the eye and the cap muscle
    const seamRho = (a: number) => 0.58 + 0.05 * Math.sin(a * 3 + 1) + 0.03 * Math.sin(a * 7);
    ctx.save();
    ctx.lineCap = 'round';
    for (const [p0, p1] of [
      [0.12, 0.42],
      [0.47, 0.72],
      [0.76, 1.02],
    ]) {
      const a0 = Math.PI * p0, a1 = Math.PI * p1;
      let prev = polarPt(s, seamRho(a0), a0);
      for (let i = 1; i <= 20; i++) {
        const a = a0 + ((a1 - a0) * i) / 20;
        const p = polarPt(s, seamRho(a) + r.range(-0.006, 0.006), a);
        const env = Math.pow(Math.sin((Math.PI * i) / 20), 0.8);
        const lw = s * (0.003 + 0.01 * env) * r.range(0.8, 1.2);
        for (const [k, al] of [
          [2.4, 0.25],
          [1, 0.85],
        ]) {
          ctx.lineWidth = lw * k;
          ctx.strokeStyle = rgba(STEAK.marble, al);
          ctx.beginPath();
          ctx.moveTo(prev[0], prev[1]);
          ctx.lineTo(p[0], p[1]);
          ctx.stroke();
        }
        prev = p;
      }
    }
    // the fatty "kernel" pocket
    const [kx, ky] = polarPt(s, 0.47, Math.PI * 0.98);
    for (const [k, al] of [
      [1.5, 0.3],
      [1, 0.92],
    ]) {
      ctx.fillStyle = rgba(STEAK.fat, al);
      ctx.beginPath();
      ctx.ellipse(kx, ky, s * 0.04 * k, s * 0.024 * k, 0.9, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    // fat cap along part of the outer curve
    const [c0, c1] = STEAK_CAP;
    const capIn = (a: number) => {
      const t = clamp01((a - c0) / (c1 - c0));
      return 1 - (0.02 + 0.13 * Math.pow(Math.sin(Math.PI * t), 0.55)) * (1 + 0.12 * Math.sin(a * 9));
    };
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = c0 - 0.03 + ((c1 - c0 + 0.06) * i) / 64;
      const p = polarPt(s, 1.1, a);
      i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
    }
    for (let i = 64; i >= 0; i--) {
      const a = c0 + ((c1 - c0) * i) / 64;
      const p = polarPt(s, capIn(a), a);
      ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.36, s / 2, s / 2, s * 0.52);
    g.addColorStop(0, STEAK.fatShade);
    g.addColorStop(0.55, STEAK.fat);
    g.addColorStop(1, '#f9eedd');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    mottleT(ctx, s, s, '#ecd2c0', r, 50, [s * 0.01, s * 0.04], [0.2, 0.5]);
    mottleT(ctx, s, s, '#f3dcc0', r, 30, [s * 0.02, s * 0.05], [0.2, 0.4]);
    ctx.restore();
    // thin pink membrane where the cap meets the meat
    ctx.save();
    ctx.strokeStyle = rgba('#d98a86', 0.6);
    ctx.lineWidth = s * 0.005;
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = c0 + ((c1 - c0) * i) / 64;
      const p = polarPt(s, capIn(a) + 0.004, a);
      i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
    ctx.restore();
  }),
);

const steakGrainBump = lazy(() =>
  repeated(
    bumpTexture('steak-grain-bump', 256, 256, (ctx, w, h) => {
      const r = rng(5);
      streaks(ctx, r, { count: 260, x: [0, w], y: [0, h], steps: [4, 10], step: 5, width: [0.8, 2], color: '#ffffff', alpha: [0.15, 0.35], dir: 0.4, dirJitter: 0.3, turn: 0.12, branch: 0, wrap: [w, h] });
      streaks(ctx, r, { count: 200, x: [0, w], y: [0, h], steps: [4, 10], step: 5, width: [0.8, 2], color: '#000000', alpha: [0.1, 0.3], dir: 0.4, dirJitter: 0.3, turn: 0.12, branch: 0, wrap: [w, h] });
    }),
    'steak-grain-bump-x3',
    3,
    3,
  ),
);

const steakMats = {
  face: lazy(() => {
    const c = colors('steak');
    return foodMat({ color: '#ffffff', map: steakFaceTex(), bumpMap: steakGrainBump(), bumpScale: 1.2, roughness: 0.4, flesh: c.flesh, cookColor: c.cooked, name: 'steak' });
  }),
  skin: lazy(() => {
    const c = colors('steak');
    const map = tex('steak-skin', 256, 256, (ctx, w, h) => paintMarbledMeat(ctx, w, h, 23, 0.8, true), true);
    return foodMat({ color: '#ffffff', map, bumpMap: steakGrainBump(), bumpScale: 1, roughness: 0.42, flesh: c.flesh, cookColor: c.cooked, name: 'steak-skin' });
  }),
  flesh: lazy(() => {
    const c = colors('steak');
    const map = tex('steak-flesh', 256, 256, (ctx, w, h) => {
      const r = rng(77);
      ctx.fillStyle = '#c03a45';
      ctx.fillRect(0, 0, w, h);
      mottleT(ctx, w, h, STEAK.dark, r, 30, [w * 0.05, w * 0.15], [0.1, 0.25]);
      streaks(ctx, r, { count: 14, x: [0, w], y: [0, h], steps: [5, 14], step: w * 0.02, width: [1, 2.4], color: STEAK.marble, alpha: [0.5, 0.85], branch: 0.1, wrap: [w, h] });
    }, true);
    return foodMat({ color: '#ffffff', map, roughness: 0.45, flesh: c.flesh, cookColor: c.cooked, name: 'steak-flesh' });
  }),
};

function steakOutline(r: Rng) {
  const A = 0.1 * r.range(0.97, 1.03), B = 0.069 * r.range(0.95, 1.04);
  const p1 = r.range(0, TAU), p2 = r.range(0, TAU), k1 = r.range(0.012, 0.025), k2 = r.range(0.008, 0.02);
  return (a: number) => {
    const c = Math.abs(Math.cos(a)) / A, s = Math.abs(Math.sin(a)) / B;
    let R = Math.pow(Math.pow(c, 2.5) + Math.pow(s, 2.5), -1 / 2.5);
    // flatter, slightly concave rib side (-z)
    const dn = angDiff(a, -Math.PI / 2 + 0.25);
    R *= 1 - 0.085 * Math.exp(-(dn * dn) / 0.3);
    // pear-ish: the eye end (-x) fuller, the tail end (+x) a little narrower with a soft point
    const ct = Math.cos(a);
    R *= 1 - 0.06 * ct + 0.05 * Math.exp(-(angDiff(a, 0.35) ** 2) / 0.05);
    R *= 1 + k1 * Math.sin(2 * a + p1) + k2 * Math.sin(3 * a + p2);
    return R;
  };
}

function buildSteak(r: Rng): THREE.Object3D {
  const outline = steakOutline(r);
  const T = 0.03 * r.range(0.95, 1.08);
  const ph = r.range(0, 10);
  const g = slabGeometry({
    outline,
    thickness: (x, z) => T * (1 - 0.13 * ((x * x) / 0.01 + (z * z) / 0.005)) * (1 + 0.05 * fbm3(x * 30 + ph, 0.3, z * 30, 2)),
    edge: T * 0.55,
    edgePow: 0.7,
    segments: 72,
    rings: 7,
    edgeRings: 10,
  });
  noisify(g, 0.0009, 70, ph);
  const m = mesh(g, steakMats.face());
  m.rotation.y = r.range(-0.25, 0.25);
  return sitOnGround(m);
}

function steakSection(ctx: CanvasRenderingContext2D, s: number) {
  paintMarbledMeat(ctx, s, s, 31, 0.9);
}

// =============================================================================================
// CHICKEN (drumstick + whole bird)
// =============================================================================================

function paintChickenSkin(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, seed: number) {
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  mottleT(ctx, w, h, '#f9e0c8', r, 30, [w * 0.08, w * 0.2], [0.2, 0.4]);
  mottleT(ctx, w, h, '#eba996', r, 22, [w * 0.06, w * 0.16], [0.08, 0.16]);
  mottleT(ctx, w, h, '#f4dba8', r, 14, [w * 0.08, w * 0.16], [0.08, 0.16]);
  // follicles
  specksT(ctx, w, h, '#d29a86', r, 220, [0.6, 1.2], 0.28);
  specksT(ctx, w, h, '#fff4ea', r, 120, [0.8, 1.6], 0.3);
}

const chickenBump = lazy(() =>
  bumpTexture('chicken-skin-bump', 256, 256, (ctx, w, h) => {
    const r = rng(9);
    // goose bumps: little raised domes
    for (let i = 0; i < 520; i++) {
      const x = r.next() * w, y = r.next() * h, s = r.range(1.8, 3.6);
      wrapped(w, h, x, y, s, (xx, yy) => {
        const g = ctx.createRadialGradient(xx, yy, 0, xx, yy, s);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(xx - s, yy - s, s * 2, s * 2);
      });
    }
    // soft wrinkles
    streaks(ctx, r, { count: 30, x: [0, w], y: [0, h], steps: [6, 14], step: 6, width: [1.5, 3], color: '#000000', alpha: [0.08, 0.16], turn: 0.3, branch: 0, wrap: [w, h] });
  }),
);

function chickenSkinMat(id: 'drumstick' | 'chicken', rx: number, ry: number) {
  const c = colors(id);
  const base = tex(`${id}-skin`, 256, 256, (ctx, w, h) => paintChickenSkin(ctx, w, h, c.skin, id === 'chicken' ? 3 : 4), true);
  return foodMat({
    color: '#ffffff',
    map: repeated(base, `${id}-skin-x${rx}-${ry}`, rx, ry),
    bumpMap: repeated(chickenBump(), `chicken-bump-x${rx}-${ry}`, rx, ry),
    bumpScale: 1.4,
    roughness: 0.42,
    flesh: c.flesh,
    cookColor: c.cooked,
    name: `${id}-skin`,
  });
}

function chickenFleshMat(id: 'drumstick' | 'chicken') {
  const c = colors(id);
  const map = tex(`${id}-flesh`, 256, 256, (ctx, w, h) => {
    const r = rng(15);
    ctx.fillStyle = c.flesh;
    ctx.fillRect(0, 0, w, h);
    mottleT(ctx, w, h, '#eeb0a0', r, 26, [w * 0.05, w * 0.15], [0.15, 0.3]);
    streaks(ctx, r, { count: 120, x: [0, w], y: [0, h], steps: [4, 10], step: 6, width: [0.7, 1.6], color: '#e7a594', alpha: [0.2, 0.4], dir: 0, dirJitter: 0.15, turn: 0.08, branch: 0, wrap: [w, h] });
    streaks(ctx, r, { count: 60, x: [0, w], y: [0, h], steps: [4, 10], step: 6, width: [0.7, 1.4], color: '#fbe4d8', alpha: [0.3, 0.5], dir: 0, dirJitter: 0.15, turn: 0.08, branch: 0, wrap: [w, h] });
  }, true);
  return foodMat({ color: '#ffffff', map, roughness: 0.5, flesh: c.flesh, cookColor: c.cooked, name: `${id}-flesh` });
}

const boneMat = lazy(() => foodMat({ color: '#f3e9da', roughness: 0.5, flesh: '#efe2cf', cookColor: '#b98a5a', cookAmount: 0.3, name: 'bone' }));

const drumMats = {
  skin: lazy(() => chickenSkinMat('drumstick', 4, 2)),
  flesh: lazy(() => chickenFleshMat('drumstick')),
};

const chickenMats = {
  skin: lazy(() => chickenSkinMat('chicken', 9, 5)),
  legSkin: lazy(() => chickenSkinMat('chicken', 4, 2)),
  flesh: lazy(() => chickenFleshMat('chicken')),
};

/** Drumstick meat + bone along local +Y (round end at y = 0, knuckle tip at y ~0.158). */
function drumstickGeoms(r: Rng): { meat: THREE.BufferGeometry; bone: THREE.BufferGeometry } {
  const k = r.range(0.95, 1.05);
  const prof: Profile = smoothProfile(
    [
      [0.0001, 0],
      [0.014, 0.002],
      [0.024, 0.009],
      [0.0302 * k, 0.019],
      [0.0328 * k, 0.031],
      [0.032 * k, 0.044],
      [0.0282, 0.058],
      [0.0222, 0.071],
      [0.0168, 0.083],
      [0.0132, 0.092],
      [0.0118, 0.099],
      [0.0112, 0.1035],
      [0.0094, 0.1062],
      [0.0001, 0.107],
    ],
    36,
  );
  const meat = latheGeometry(prof, 36);
  const ph = r.range(0, 10);
  const bend = r.range(0.002, 0.005);
  deform(meat, (p) => {
    p.z *= 0.9;
    p.x += bend * Math.sin((Math.PI * p.y) / 0.107);
    // the skin ends in a soft ragged collar around the bone
    const collar = sstep(0.094, 0.104, p.y);
    p.x *= 1 + collar * 0.08 * fbm3(p.x * 300 + ph, p.y * 50, p.z * 300, 2);
  });
  noisify(meat, 0.0012, 55, ph);
  const bprof: Profile = smoothProfile(
    [
      [0.0001, 0.07],
      [0.0066, 0.072],
      [0.0064, 0.1],
      [0.0061, 0.12],
      [0.0066, 0.13],
      [0.0082, 0.137],
      [0.0098, 0.1425],
      [0.0103, 0.147],
      [0.0096, 0.1515],
      [0.0072, 0.1555],
      [0.0035, 0.1575],
      [0.0001, 0.158],
    ],
    26,
  );
  const bone = latheGeometry(bprof, 24);
  deform(bone, (p) => {
    const kn = sstep(0.132, 0.145, p.y);
    p.x *= 1 + 0.32 * kn;
    p.z *= 1 - 0.1 * kn;
    // two-lobed knuckle
    p.y -= 0.0026 * Math.exp(-((p.x / 0.0032) ** 2)) * sstep(0.147, 0.157, p.y);
    p.x += bend * Math.sin((Math.PI * Math.min(p.y, 0.107)) / 0.107);
  });
  return { meat, bone };
}

function buildDrumstick(r: Rng): THREE.Object3D {
  const { meat, bone } = drumstickGeoms(r);
  const inner = new THREE.Group();
  inner.add(skinMesh(mesh(meat, drumMats.skin())));
  inner.add(mesh(bone, boneMat()));
  // lie along +X with the knuckle resting on the board: the meat's widest point (~0.033 at
  // y 0.031) and the knuckle (~0.0105 at y 0.147) both touch the ground.
  const tilt = Math.asin((0.033 - 0.0105) / (0.147 - 0.031));
  inner.rotation.z = -Math.PI / 2 - tilt;
  inner.rotation.x = r.range(-0.3, 0.3);
  const outer = new THREE.Group();
  outer.add(inner);
  outer.rotation.y = r.range(-0.3, 0.3);
  return sitOnGround(outer);
}

function chickenSection(ctx: CanvasRenderingContext2D, s: number, id: 'drumstick' | 'chicken') {
  const c = colors(id);
  const r = rng(id === 'chicken' ? 61 : 62);
  ctx.fillStyle = c.flesh;
  ctx.fillRect(0, 0, s, s);
  mottleT(ctx, s, s, '#eeaa9a', r, 26, [s * 0.05, s * 0.16], [0.15, 0.32]);
  streaks(ctx, r, { count: 90, x: [0, s], y: [0, s], steps: [5, 12], step: s * 0.025, width: [0.6, 1.5], color: '#e29c8c', alpha: [0.2, 0.45], dir: 0, dirJitter: 0.12, turn: 0.07, branch: 0 });
  streaks(ctx, r, { count: 50, x: [0, s], y: [0, s], steps: [5, 12], step: s * 0.025, width: [0.6, 1.3], color: '#fde8de', alpha: [0.35, 0.6], dir: 0, dirJitter: 0.12, turn: 0.07, branch: 0 });
  // a strip of skin along the top edge
  const g = ctx.createLinearGradient(0, 0, 0, s * 0.12);
  g.addColorStop(0, mixHex(c.skin, '#f6d3b0', 0.3));
  g.addColorStop(0.6, rgba(mixHex(c.skin, '#f8e0c8', 0.4), 0.9));
  g.addColorStop(1, rgba(c.skin, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s * 0.12);
}

function buildChicken(r: Rng): THREE.Object3D {
  const root = new THREE.Group();
  const ph = r.range(0, 10);
  // --- body: UV sphere with its poles along X (hidden by the neck and the legs), breast up
  const body = new THREE.SphereGeometry(1, 56, 34);
  body.rotateZ(Math.PI / 2);
  deform(body, (p) => {
    const nx = p.x, ny = p.y, nz = p.z;
    const rear = sstep(-1, 1, nx);
    const x = nx * 0.102;
    let y = ny >= 0 ? ny * 0.064 * (1 + 0.14 * Math.exp(-((nx + 0.15) ** 2) / 0.3)) : ny * 0.046;
    const z = nz * (0.07 + 0.016 * rear);
    // soft breast-bone groove along the top
    y -= 0.0045 * Math.exp(-((nz / 0.13) ** 2)) * sstep(0.4, 0.85, ny) * (1 - sstep(0.35, 0.85, Math.abs(nx + 0.05)));
    p.set(x, y, z);
  });
  noisify(body, 0.0011, 26, ph);
  body.translate(0, 0.046, 0);
  root.add(skinMesh(mesh(body, chickenMats.skin())));

  // --- neck stump with a soft flap of skin at the front
  const neck = new THREE.SphereGeometry(0.021, 22, 16);
  deform(neck, (p) => {
    p.x *= 1.2;
    p.y *= 0.85;
  });
  noisify(neck, 0.001, 140, ph + 3);
  root.add(skinMesh(mesh(neck, chickenMats.legSkin(), { pos: [-0.095, 0.058, 0], rot: [0, 0, 0.35] })));

  // --- legs: big thigh + chunky drumstick pointing back & up, knuckles close together
  for (const side of [-1, 1]) {
    const thigh = new THREE.SphereGeometry(0.042, 28, 20);
    deform(thigh, (p) => {
      p.x *= 1.2;
      p.z *= 0.72;
    });
    noisify(thigh, 0.001, 70, ph + side);
    root.add(skinMesh(mesh(thigh, chickenMats.legSkin(), { pos: [0.03, 0.054, side * 0.062], rot: [side * 0.2, side * 0.25, 0.45] })));
    const { meat, bone } = drumstickGeoms(rng(r.int(1, 9999)));
    const sc = 0.82;
    const start = new THREE.Vector3(0.05, 0.05, side * 0.068);
    const end = new THREE.Vector3(0.158, 0.118, side * 0.03);
    const dir = end.clone().sub(start).normalize();
    meat.scale(sc * 1.08, sc, sc * 1.08);
    bone.scale(sc, sc, sc);
    alongDir(meat, start, dir, side * 0.5);
    alongDir(bone, start, dir, side * 0.5);
    root.add(skinMesh(mesh(meat, chickenMats.legSkin())));
    root.add(mesh(bone, boneMat()));
  }

  // --- wings folded against the front sides: upper wing + tip tucked back underneath
  for (const side of [-1, 1]) {
    const pts: [number, number, number][] = [
      [-0.07, 0.074, side * 0.05],
      [-0.045, 0.062, side * 0.072],
      [-0.012, 0.047, side * 0.079],
      [-0.03, 0.03, side * 0.077],
      [-0.058, 0.03, side * 0.066],
    ];
    const wing = sweepGeometry(curveThrough(pts), {
      radius: (t) => 0.0165 * (1 - 0.55 * t) * (1 + 0.25 * Math.sin(Math.min(1, t * 1.6) * Math.PI)),
      radialSegments: 16,
      tubularSegments: 30,
    });
    // flatten against the body side
    deform(wing, (p) => {
      const zc = side * (0.068 + 0.004 * Math.sin(p.x * 30));
      p.z = zc + (p.z - zc) * 0.62;
    });
    noisify(wing, 0.0008, 110, ph + side * 2);
    root.add(skinMesh(mesh(wing, chickenMats.legSkin())));
  }
  const outer = new THREE.Group();
  outer.add(root);
  outer.rotation.y = r.range(-0.2, 0.2);
  return sitOnGround(outer);
}

// =============================================================================================
// SAUSAGE - plump curved banger with twisted ends
// =============================================================================================

const SAUSAGE_L = 0.2;
const SAUSAGE_R = 0.0185;

function sausageRadius(t: number): number {
  const d = Math.min(t, 1 - t) * SAUSAGE_L;
  const body = 1 + 0.02 * Math.sin(t * 19.0) + 0.012 * Math.sin(t * 41.0);
  const neck = sstep(0.005, 0.03, d);
  // a little twisted knob of casing at each tip
  const knob = 0.2 * Math.exp(-(((d - 0.0026) / 0.0026) ** 2));
  return SAUSAGE_R * body * (0.24 + 0.76 * Math.pow(neck, 0.6) + knob);
}

function paintSausageCasing(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const c = colors('sausage');
  const r = rng(71);
  ctx.fillStyle = c.skin;
  ctx.fillRect(0, 0, w, h);
  mottleT(ctx, w, h, '#c86a5c', r, 60, [w * 0.04, w * 0.12], [0.12, 0.28], 1.6);
  mottleT(ctx, w, h, '#f2b1a2', r, 50, [w * 0.03, w * 0.1], [0.15, 0.32], 1.6);
  // fat & herb specks seen through the casing
  specksT(ctx, w, h, '#f6d6cb', r, 200, [0.6, 1.5], 0.4, 1.3);
  specksT(ctx, w, h, '#a8483e', r, 120, [0.5, 1.3], 0.35);
  specksT(ctx, w, h, '#6a4a3a', r, 40, [0.4, 0.9], 0.3);
}

const sausageMats = {
  casing: lazy(() => {
    const c = colors('sausage');
    const map = tex('sausage-casing', 256, 512, paintSausageCasing, true);
    const bump = bumpNoiseTextureLocal('sausage-bump', 30);
    return foodMat({ color: '#ffffff', map, bumpMap: bump, bumpScale: 0.5, roughness: 0.3, flesh: c.flesh, cookColor: c.cooked, name: 'sausage-casing' });
  }),
  flesh: lazy(() => {
    const c = colors('sausage');
    const map = tex('sausage-flesh', 256, 256, (ctx, w, h) => paintSausageMeat(ctx, w, h, 5, true), true);
    return foodMat({ color: '#ffffff', map, roughness: 0.6, flesh: c.flesh, cookColor: c.cooked, name: 'sausage-flesh' });
  }),
};

function bumpNoiseTextureLocal(key: string, cells: number): THREE.Texture {
  return bumpTexture(key, 128, 128, (ctx, w, h) => {
    const r = rng(cells);
    for (let i = 0; i < cells * 8; i++) {
      const x = r.next() * w, y = r.next() * h, s = r.range(2, 7);
      const light = r.next() < 0.5;
      wrapped(w, h, x, y, s, (xx, yy) => {
        const g = ctx.createRadialGradient(xx, yy, 0, xx, yy, s);
        g.addColorStop(0, light ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)');
        g.addColorStop(1, light ? 'rgba(255,255,255,0)' : 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(xx - s, yy - s, s * 2, s * 2);
      });
    }
  });
}

function paintSausageMeat(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, wrap: boolean) {
  const c = colors('sausage');
  const r = rng(seed);
  ctx.fillStyle = c.flesh;
  ctx.fillRect(0, 0, w, h);
  mottleT(ctx, w, h, '#d98474', r, 50, [w * 0.03, w * 0.09], [0.2, 0.4]);
  mottleT(ctx, w, h, '#f4c0b0', r, 40, [w * 0.02, w * 0.07], [0.2, 0.4]);
  specksT(ctx, w, h, '#fbe7dd', r, Math.round(w * 0.9), [w * 0.004, w * 0.011], 0.85, 1.2);
  specksT(ctx, w, h, '#b45c50', r, Math.round(w * 0.5), [w * 0.003, w * 0.007], 0.45);
  specksT(ctx, w, h, '#4a3a30', r, Math.round(w * 0.12), [w * 0.002, w * 0.004], 0.5);
  void wrap;
}

function sausageCurve(r: Rng): THREE.CatmullRomCurve3 {
  const bend = r.range(0.022, 0.03) * r.sign();
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const x = (t - 0.5) * SAUSAGE_L * 0.94;
    pts.push([x, 0, -bend * (1 - (2 * t - 1) ** 2) + r.range(-0.001, 0.001)]);
  }
  return curveThrough(pts, 'catmullrom');
}

function buildSausage(r: Rng): THREE.Object3D {
  const curve = sausageCurve(r);
  const tw = r.range(0, TAU);
  const g = sweepGeometry(curve, {
    radius: sausageRadius,
    shape: (ang, t) => {
      const d = Math.min(t, 1 - t) * SAUSAGE_L;
      const k = sstep(0.0015, 0.005, d) * (1 - sstep(0.012, 0.026, d));
      return 1 + 0.16 * k * Math.sin(3 * ang + d * 600 + tw);
    },
    radialSegments: 22,
    tubularSegments: 110,
    caps: 'round',
  });
  // gentle settling: slightly flatter where it rests
  deform(g, (p) => {
    if (p.y < 0) p.y *= 0.9;
  });
  const m = mesh(g, sausageMats.casing());
  return sitOnGround(m);
}

const sausageProfile: Profile = (() => {
  const out: Profile = [[0.0001, 0]];
  const n = 28;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    out.push([sausageRadius(t), t * SAUSAGE_L]);
  }
  out.push([0.0001, SAUSAGE_L]);
  return out;
})();

function sausageSection(ctx: CanvasRenderingContext2D, s: number, opts: SectionOpts) {
  const c = colors('sausage');
  ctx.save();
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2, 0, TAU);
  ctx.clip();
  paintSausageMeat(ctx, s, s, 8, false);
  // slightly darker rim just under the casing
  const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
  g.addColorStop(0, rgba('#d88a7a', 0));
  g.addColorStop(0.85, rgba('#d88a7a', 0.25));
  g.addColorStop(1, rgba('#c8705e', 0.5));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  if (!opts.peeled) {
    ctx.strokeStyle = mixHex(c.skin, '#b0584a', 0.45);
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - s * 0.025, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

// =============================================================================================
// BACON - three wavy rashers with pink meat & creamy fat stripes
// =============================================================================================

const BACON = { meat: '#dc7378', meatDark: '#c95d66', meatLight: '#eea19f', fat: '#fbebe2', fatShade: '#f3d8cd' };

/** Stripe pattern across u (0..1 = across the rasher), v along it. */
function paintBacon(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, wrapV: boolean) {
  const r = rng(seed);
  ctx.fillStyle = BACON.fat;
  ctx.fillRect(0, 0, w, h);
  // meat bands: [centre, half width] in u
  const bands: [number, number][] = [
    [0.425, 0.13],
    [0.755, 0.14],
    [0.145, 0.018],
  ];
  const phases = bands.map(() => [r.range(0, TAU), r.range(0, TAU)]);
  const img = ctx.getImageData(0, 0, w, h);
  const meat = new THREE.Color(BACON.meat), dark = new THREE.Color(BACON.meatDark), light = new THREE.Color(BACON.meatLight), fat = new THREE.Color(BACON.fat), fatS = new THREE.Color(BACON.fatShade);
  const tmp = new THREE.Color();
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      let m = 0;
      bands.forEach(([c, hw], i) => {
        const wob = 0.03 * Math.sin(v * TAU * 3 + phases[i][0]) + 0.015 * Math.sin(v * TAU * 7 + phases[i][1]);
        const ww = hw * (1 + 0.22 * Math.sin(v * TAU * 2 + phases[i][1]));
        const d = Math.abs(u - c - wob) / ww;
        m = Math.max(m, sstep(1.0, 0.7, d) * (i === 2 ? 0.75 : 1));
      });
      const n = fbm3(u * 9, v * 30, seed, 2);
      tmp.copy(meat).lerp(n > 0 ? light : dark, Math.min(1, Math.abs(n) * 1.6));
      const f = fat.clone().lerp(fatS, clamp01(0.5 + n));
      tmp.lerp(f, 1 - m);
      const i = (y * w + x) * 4;
      img.data[i] = tmp.r * 255;
      img.data[i + 1] = tmp.g * 255;
      img.data[i + 2] = tmp.b * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // thin rind line on the fat edge
  ctx.fillStyle = rgba('#efc9b8', 0.8);
  ctx.fillRect(0, 0, w * 0.035, h);
  void wrapV;
}

const baconTex = lazy(() => tex('bacon-rasher', 128, 512, (ctx, w, h) => paintBacon(ctx, w, h, 3, true), true));

const baconMats = {
  rasher: lazy(() => {
    const c = colors('bacon');
    return foodMat({ color: '#ffffff', map: baconTex(), bumpMap: bumpNoiseTextureLocal('bacon-bump', 24), bumpScale: 0.6, roughness: 0.42, flesh: c.flesh, cookColor: c.cooked, name: 'bacon' });
  }),
  flesh: lazy(() => {
    const c = colors('bacon');
    const map = tex('bacon-flesh', 128, 128, (ctx, w, h) => {
      const r = rng(4);
      ctx.fillStyle = BACON.meatLight;
      ctx.fillRect(0, 0, w, h);
      mottleT(ctx, w, h, BACON.fat, r, 18, [w * 0.06, w * 0.14], [0.4, 0.7]);
      mottleT(ctx, w, h, BACON.meatDark, r, 20, [w * 0.05, w * 0.12], [0.15, 0.3]);
    }, true);
    return foodMat({ color: '#ffffff', map, roughness: 0.48, flesh: c.flesh, cookColor: c.cooked, name: 'bacon-flesh' });
  }),
};

/** A flat rounded strip along X (width along Z, thickness along Y) with waves. */
function rasherGeometry(r: Rng, len: number, width: number, th: number, vOff: number): THREE.BufferGeometry {
  const NL = 64;
  const K = 3;
  // stadium cross-section, CCW from +z through +y
  const cs: [number, number][] = [];
  const hw = width / 2, rr = th / 2, flat = hw - rr;
  const arcN = 4, topN = 8;
  for (let i = 0; i <= arcN; i++) {
    const a = -Math.PI / 2 + (i / arcN) * Math.PI;
    if (i > 0) cs.push([flat + Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  for (let i = 1; i < topN; i++) cs.push([flat - (2 * flat * i) / topN, rr]);
  for (let i = 0; i <= arcN; i++) {
    const a = Math.PI / 2 + (i / arcN) * Math.PI;
    cs.push([-flat + Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  for (let i = 1; i < topN; i++) cs.push([-flat + (2 * flat * i) / topN, -rr]);
  // rotate so the list starts at +z mid (angle 0) and runs towards +y: currently starts just above
  // the +z equator (first arc point skipped) - close the loop by repeating the first point.
  cs.unshift([flat + rr, 0]);
  const NC = cs.length; // ring vertices (closed by duplicate below)
  const rings: { x: number; s: number; u: number }[] = [];
  for (let k = K; k >= 1; k--) {
    const f = ((k / K) * Math.PI) / 2;
    rings.push({ x: -len / 2 - Math.sin(f) * rr, s: Math.cos(f), u: 0 });
  }
  for (let i = 0; i <= NL; i++) rings.push({ x: -len / 2 + (i / NL) * len, s: 1, u: 0 });
  for (let k = 1; k <= K; k++) {
    const f = ((k / K) * Math.PI) / 2;
    rings.push({ x: len / 2 + Math.sin(f) * rr, s: Math.cos(f), u: 0 });
  }
  const phase = r.range(0, TAU), lam = r.range(0.058, 0.072), amp = r.range(0.0035, 0.0048);
  const latA = r.range(0.002, 0.004), latP = r.range(0, TAU);
  const rip = r.range(0.0012, 0.002), ripP = r.range(0, TAU);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const ring of rings) {
    const xc = Math.max(-len / 2, Math.min(len / 2, ring.x));
    const wave = (Math.sin((xc / lam) * TAU + phase) + 0.35 * Math.sin((xc / (lam * 0.53)) * TAU + phase * 1.7)) / 1.2;
    const yc = rr + amp * (1 + wave);
    const zc = latA * Math.sin(xc * 22 + latP);
    for (let j = 0; j <= NC; j++) {
      const [cz, cy] = cs[j % NC];
      const across = cz / hw; // -1..1
      const ripple = rip * across * Math.sin(xc * 95 + ripP) * Math.abs(across);
      pos.push(ring.x, yc + cy * ring.s + ripple, zc + cz * ring.s);
      uv.push(0.5 + 0.5 * across * ring.s, vOff + (ring.x + len / 2) / len);
    }
  }
  const row = NC + 1;
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < NC; j++) {
      const a = i * row + j, b = (i + 1) * row + j, c = (i + 1) * row + j + 1, d = i * row + j + 1;
      idx.push(a, b, d, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  smoothNormals(g);
  g.computeBoundingBox();
  return g;
}

function buildBacon(r: Rng): THREE.Object3D {
  const root = new THREE.Group();
  const n = 3;
  const width = 0.034, th = 0.0042;
  for (let i = 0; i < n; i++) {
    const len = 0.21 * r.range(0.95, 1.04);
    const g = rasherGeometry(r, len, width, th, r.next());
    const m = mesh(g, baconMats.rasher());
    m.position.set(r.range(-0.006, 0.006), 0, (i - (n - 1) / 2) * (width + 0.008));
    m.rotation.y = r.range(-0.03, 0.03);
    if (i % 2) m.rotation.x = Math.PI; // flip every other one so fat edges alternate
    root.add(m);
  }
  // flipped rashers were rotated around X: re-seat each on the ground
  root.children.forEach((c) => {
    c.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(c);
    c.position.y -= b.min.y;
  });
  return sitOnGround(root);
}

function baconSection(ctx: CanvasRenderingContext2D, s: number) {
  // stripes across the face (bands run horizontally)
  const c = makeCanvasLocal(128, 128);
  paintBacon(c.ctx, 128, 128, 9, false);
  ctx.save();
  ctx.translate(s / 2, s / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(c.canvas, -s / 2, -s / 2, s, s);
  ctx.restore();
}

function makeCanvasLocal(w: number, h: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D } {
  const canvas: HTMLCanvasElement | OffscreenCanvas = typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : new OffscreenCanvas(w, h);
  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D };
}

// =============================================================================================
// HAM - a little deli ham log with two round slices
// =============================================================================================

const HAM = { flesh: '#f4a9b4', light: '#f9c6cc', dark: '#e48e9c', rim: '#e88c98', fat: '#fdf0ee' };
const HAM_R = 0.042;

/** Ham face painted as a disc inscribed in the square (rim ring unless peeled). */
function paintHamFace(ctx: CanvasRenderingContext2D, s: number, seed: number, rim = true) {
  const r = rng(seed);
  ctx.fillStyle = HAM.flesh;
  ctx.fillRect(0, 0, s, s);
  mottleT(ctx, s, s, HAM.light, r, 26, [s * 0.06, s * 0.18], [0.3, 0.55]);
  mottleT(ctx, s, s, HAM.dark, r, 24, [s * 0.05, s * 0.14], [0.15, 0.35]);
  // muscle seams: soft pale lines
  streaks(ctx, r, { count: 6, x: [s * 0.2, s * 0.8], y: [s * 0.2, s * 0.8], steps: [8, 16], step: s * 0.03, width: [s * 0.006, s * 0.012], color: HAM.light, alpha: [0.35, 0.6], turn: 0.35, branch: 0.08, soft: 1.8 });
  specksT(ctx, s, s, '#fbe2e4', r, 70, [s * 0.002, s * 0.006], 0.6);
  if (rim) {
    // thin fat layer + darker cured rim
    ctx.save();
    ctx.lineWidth = s * 0.03;
    ctx.strokeStyle = rgba(HAM.fat, 0.85);
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - s * 0.045, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = s * 0.035;
    ctx.strokeStyle = HAM.rim;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - s * 0.012, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

const hamFaceTex = lazy(() => tex('ham-face', 256, 256, (ctx, s) => paintHamFace(ctx, s, 21)));

const hamMats = {
  face: lazy(() => {
    const c = colors('ham');
    return foodMat({ color: '#ffffff', map: hamFaceTex(), roughness: 0.38, flesh: c.flesh, cookColor: c.cooked, name: 'ham-face' });
  }),
  skin: lazy(() => {
    const c = colors('ham');
    const map = tex('ham-skin', 256, 256, (ctx, w, h) => {
      const r = rng(8);
      ctx.fillStyle = HAM.rim;
      ctx.fillRect(0, 0, w, h);
      mottleT(ctx, w, h, '#f29aa8', r, 40, [w * 0.05, w * 0.15], [0.3, 0.5]);
      mottleT(ctx, w, h, '#d9707f', r, 30, [w * 0.04, w * 0.1], [0.15, 0.3]);
      specksT(ctx, w, h, '#f6b8c0', r, 50, [0.8, 1.6], 0.25);
    }, true);
    return foodMat({ color: '#ffffff', map, bumpMap: bumpNoiseTextureLocal('ham-bump', 20), bumpScale: 0.5, roughness: 0.36, flesh: c.flesh, cookColor: c.cooked, name: 'ham-skin' });
  }),
  flesh: lazy(() => {
    const c = colors('ham');
    const map = tex('ham-flesh', 128, 128, (ctx, w, h) => {
      const r = rng(12);
      ctx.fillStyle = HAM.flesh;
      ctx.fillRect(0, 0, w, h);
      mottleT(ctx, w, h, HAM.light, r, 20, [w * 0.06, w * 0.16], [0.3, 0.5]);
      mottleT(ctx, w, h, HAM.dark, r, 16, [w * 0.05, w * 0.12], [0.15, 0.3]);
    }, true);
    return foodMat({ color: '#ffffff', map, roughness: 0.42, flesh: c.flesh, cookColor: c.cooked, name: 'ham-flesh' });
  }),
};

function hamSliceGeometry(r: Rng, droop: number): THREE.BufferGeometry {
  const th = 0.0034;
  const prof: Profile = [
    [0.0001, 0],
    [HAM_R - 0.002, 0],
    [HAM_R - 0.0004, 0.0005],
    [HAM_R, th / 2],
    [HAM_R - 0.0004, th - 0.0005],
    [HAM_R - 0.002, th],
    [0.0001, th],
  ];
  const g = latheGeometry(prof, 48);
  const ph = r.range(0, 10);
  const rot = r.range(0, TAU);
  deform(g, (p) => {
    const wob = 1 + 0.03 * fbm3(Math.cos(Math.atan2(p.z, p.x)) * 1.5 + ph, Math.sin(Math.atan2(p.z, p.x)) * 1.5, 0, 2);
    p.x *= wob;
    p.z *= wob * 0.92;
    // floppy: the part hanging past the slice underneath sags towards the board
    p.y -= droop * sstep(0.35, 1.0, p.x / HAM_R);
  });
  const cr = Math.cos(rot), sr = Math.sin(rot);
  setUV(g, (x, _y, z) => {
    const u = x * cr - z * sr, v = x * sr + z * cr;
    return [0.5 + u / (2.08 * HAM_R), 0.5 - v / (2.08 * HAM_R)];
  });
  smoothNormals(g);
  return g;
}

function buildHam(r: Rng): THREE.Object3D {
  const root = new THREE.Group();
  // the log: lathed along Y, laid along X with its cut face at +x, then turned towards the viewer
  const L = 0.072;
  const prof: Profile = smoothProfile(
    [
      [0.0001, 0],
      [HAM_R * 0.62, 0.0004],
      [HAM_R * 0.88, 0.003],
      [HAM_R * 0.98, 0.011],
      [HAM_R, 0.022],
      [HAM_R, L - 0.003],
      [HAM_R * 0.995, L],
    ],
    20,
  );
  const log = latheGeometry(prof, 48);
  const ph = r.range(0, 10);
  noisify(log, 0.0007, 60, ph);
  const face = new THREE.CircleGeometry(HAM_R * 0.995, 48);
  face.rotateX(-Math.PI / 2);
  face.translate(0, L, 0);
  const logG = new THREE.Group();
  logG.add(skinMesh(mesh(log, hamMats.skin())));
  logG.add(mesh(face, hamMats.face()));
  logG.rotation.z = -Math.PI / 2; // +y -> +x
  logG.scale.set(0.9, 1, 0.97); // a slightly flattened, D-ish log
  logG.position.set(-L, HAM_R * 0.9, 0);
  const turn = new THREE.Group();
  turn.add(logG);
  const yaw = -0.6 + r.range(-0.1, 0.1);
  turn.rotation.y = yaw;
  root.add(turn);
  // slices shingled out in front of the cut face
  const dir = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const n = 3;
  for (let i = 0; i < n; i++) {
    const g = hamSliceGeometry(r, i === 0 ? 0 : 0.0034 * 0.85);
    const c = dir.clone().multiplyScalar(HAM_R * 1.05 + 0.006 + i * 0.024).addScaledVector(side, (i - 1) * 0.006 + r.range(-0.003, 0.003));
    const m = mesh(g, hamMats.face(), { pos: [c.x, i * 0.00345, c.z] });
    m.rotation.y = Math.atan2(-dir.z, dir.x) + r.range(-0.12, 0.12);
    root.add(m);
  }
  return sitOnGround(root);
}

function hamSliceShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, HAM_R, HAM_R, 0, TAU, false);
  return s;
}

// =============================================================================================
// PATTY - round raw burger patty with a ground-meat texture
// =============================================================================================

const PATTY = { base: '#b44a4d', a: '#c45c5e', b: '#ad4549', c: '#cf6f6e', d: '#9c3a40', fat: '#efcfc6' };

interface Granule {
  x: number;
  y: number;
  len: number;
  ang: number;
  w: number;
  col: string;
  bend: number;
}

function granules(seed: number, w: number, h: number, count: number): Granule[] {
  const r = rng(seed);
  const cols = [PATTY.a, PATTY.b, PATTY.c, PATTY.d, PATTY.a, PATTY.b];
  const out: Granule[] = [];
  for (let i = 0; i < count; i++) {
    const fat = r.next() < 0.08;
    out.push({
      x: r.next() * w,
      y: r.next() * h,
      len: r.range(w * 0.014, w * 0.04),
      ang: r.next() * TAU,
      w: r.range(w * 0.01, w * 0.019) * (fat ? 0.7 : 1),
      col: fat ? PATTY.fat : r.pick(cols),
      bend: r.range(-0.8, 0.8),
    });
  }
  return out;
}

/** Ground meat: densely packed short squiggly strands with fat bits. Tileable. */
function paintMince(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, height: boolean) {
  ctx.fillStyle = height ? '#404040' : PATTY.base;
  ctx.fillRect(0, 0, w, h);
  ctx.lineCap = 'round';
  const gs = granules(seed, w, h, Math.round((w * h) / 190));
  for (const g of gs) {
    wrapped(w, h, g.x, g.y, g.len + g.w, (x, y) => {
      const dx = Math.cos(g.ang) * g.len * 0.5, dy = Math.sin(g.ang) * g.len * 0.5;
      const mx = x - dy * g.bend * 0.6, my = y + dx * g.bend * 0.6;
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(x - dx, y - dy);
        ctx.quadraticCurveTo(mx, my, x + dx, y + dy);
      };
      if (height) {
        ctx.strokeStyle = '#7a7a7a';
        ctx.lineWidth = g.w;
        path();
        ctx.stroke();
        ctx.strokeStyle = '#c8c8c8';
        ctx.lineWidth = g.w * 0.5;
        path();
        ctx.stroke();
      } else {
        ctx.strokeStyle = mixHex(g.col, '#5a1a1e', 0.16);
        ctx.lineWidth = g.w;
        path();
        ctx.stroke();
        ctx.strokeStyle = g.col;
        ctx.lineWidth = g.w * 0.7;
        path();
        ctx.stroke();
        ctx.strokeStyle = rgba(mixHex(g.col, '#ffffff', 0.35), 0.6);
        ctx.lineWidth = g.w * 0.25;
        ctx.save();
        ctx.translate(-g.w * 0.15, -g.w * 0.15);
        path();
        ctx.stroke();
        ctx.restore();
      }
    });
  }
}

const minceTex = lazy(() => tex('patty-mince', 512, 512, (ctx, w, h) => paintMince(ctx, w, h, 13, false), true));
const minceBump = lazy(() => canvasTexture(512, 512, (ctx, w, h) => paintMince(ctx, w, h, 13, true), { key: 'patty-mince-bump', srgb: false, wrap: true }));

const pattyMats = {
  skin: lazy(() => {
    const c = colors('patty');
    return foodMat({ color: '#ffffff', map: minceTex(), bumpMap: minceBump(), bumpScale: 2.2, roughness: 0.5, flesh: c.flesh, cookColor: c.cooked, name: 'patty' });
  }),
};

const PATTY_R = 0.055;
const pattyProfile: Profile = smoothProfile(
  [
    [0.0001, 0],
    [0.03, 0],
    [0.046, 0.0004],
    [0.0515, 0.0025],
    [0.0545, 0.0065],
    [PATTY_R, 0.0105],
    [0.0542, 0.0148],
    [0.0505, 0.0178],
    [0.043, 0.0193],
    [0.03, 0.0192],
    [0.016, 0.0178],
    [0.006, 0.0168],
    [0.0001, 0.0166],
  ],
  30,
);

function buildPatty(r: Rng): THREE.Object3D {
  // zones: bottom face ends where the rim starts curving; the top zone begins past the rim
  const n = pattyProfile.length;
  const i0 = Math.round(n * 0.2), i1 = Math.round(n * 0.62);
  const g = latheZoned(pattyProfile, 64, [i0, i1], 0.11);
  const ph = r.range(0, 10);
  const sq = r.range(0.95, 1.0);
  deform(g, (p, nrm) => {
    const a = Math.atan2(p.z, p.x);
    const rr = Math.hypot(p.x, p.z);
    // irregular hand-formed outline
    const out = 1 + 0.025 * Math.sin(a * 3 + ph) + 0.018 * Math.sin(a * 5 + ph * 2) + 0.03 * fbm3(Math.cos(a) * 2 + ph, Math.sin(a) * 2, p.y * 20, 2);
    const f = sstep(0.02, 0.05, rr);
    p.x *= 1 + (out - 1) * f;
    p.z *= (1 + (out - 1) * f) * sq;
    // lumpy ground-meat surface
    const lump = fbm3(p.x * 160 + ph, p.y * 160, p.z * 160, 2) * 0.0011;
    p.addScaledVector(nrm, lump);
  });
  const m = mesh(g, pattyMats.skin());
  m.rotation.y = r.range(0, TAU);
  return sitOnGround(m);
}

function pattySectionV(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const s = Math.max(w, h);
  const c = makeCanvasLocal(256, 256);
  paintMince(c.ctx, 256, 256, 29, false);
  for (let x = 0; x < w; x += s * 0.5)
    for (let y = 0; y < h; y += s * 0.5) ctx.drawImage(c.canvas, x, y, s * 0.5, s * 0.5);
}

// =============================================================================================
// Table
// =============================================================================================

export const MODELS: ModelTable = {
  steak: {
    build: buildSteak,
    skin: steakMats.skin,
    flesh: steakMats.flesh,
    section: (ctx, s) => steakSection(ctx, s),
  },
  drumstick: {
    build: buildDrumstick,
    skin: drumMats.skin,
    flesh: drumMats.flesh,
    section: (ctx, s) => chickenSection(ctx, s, 'drumstick'),
  },
  chicken: {
    build: buildChicken,
    skin: chickenMats.skin,
    flesh: chickenMats.flesh,
    section: (ctx, s) => chickenSection(ctx, s, 'chicken'),
  },
  sausage: {
    build: buildSausage,
    profile: sausageProfile,
    skin: sausageMats.casing,
    flesh: sausageMats.flesh,
    section: sausageSection,
  },
  bacon: {
    build: buildBacon,
    skin: baconMats.rasher,
    flesh: baconMats.flesh,
    section: (ctx, s) => baconSection(ctx, s),
  },
  ham: {
    build: buildHam,
    sliceShape: hamSliceShape,
    skin: hamMats.skin,
    flesh: hamMats.flesh,
    section: (ctx, s, opts) => paintHamFace(ctx, s, 33, !opts.peeled),
  },
  patty: {
    build: buildPatty,
    profile: pattyProfile,
    skin: pattyMats.skin,
    flesh: pattyMats.skin,
    sectionV: pattySectionV,
  },
};

// unused-import guards (kept for future tweaks)
void transformed;
void group;
