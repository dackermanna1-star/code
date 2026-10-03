// Vegetable models: tomato, carrot, potato, onion, garlic, broccoli, cucumber, lettuce, bell pepper,
// chili, corn, mushroom, eggplant, pumpkin, peas, basil.
//
// Conventions (see src/models/types.ts): real-world size in metres, resting on y = 0, centred on x/z.
// Round items stand upright (profile [r, y]); long / potato items lie along X (profile [r, x]).
// Every surface is a foodMat so cooking and bites work. Template materials are lazy() singletons and
// canvas textures are cached by key, so builders stay cheap when called many times.
//
// Body materials returned by skin() never use vertex colours (generic cut pieces have no colour
// attribute); vertex-coloured variants are only used inside build().

import * as THREE from 'three';
import type { ModelDef, ModelTable, SectionOpts } from './types';
import {
  Rng,
  fbm3,
  canvasTexture,
  radialFill,
  latheGeometry,
  smoothProfile,
  profileRadiusAt,
  profileHeight,
  profileMaxRadius,
  smoothNormals,
  deform,
  blobGeometry,
  sweepGeometry,
  curveThrough,
  merge,
  transformed,
  mesh,
  group,
  sitOnGround,
  paintVertices,
  lazy,
  foodMat,
  type Profile,
  type SweepOpts,
} from './kit';
import { getDef } from '../food/catalog';

// =============================================================================================
// Small helpers (private to this file)

type Ctx = CanvasRenderingContext2D;
type V3 = [number, number, number];
type Mat = THREE.Material;

const TAU = Math.PI * 2;
const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const colors = (id: string) => getDef(id).colors;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** '#rrggbb' -> 'rgba(r,g,b,a)' for canvas painting (sRGB). */
function rgba(hex: string, a = 1): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Mix two '#rrggbb' colours in sRGB (for canvas painting). */
function mixHex(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(mix((na >> s) & 255, (nb >> s) & 255, clamp(t)));
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

/** Linear colour for vertex colours. */
const lin = (hex: string) => new THREE.Color(hex);

type Stops = [number, THREE.Color][];
const stops = (s: [number, string][]): Stops => s.map(([t, h]) => [t, lin(h)]);
function ramp(s: Stops, t: number): THREE.Color {
  if (t <= s[0][0]) return s[0][1].clone();
  for (let i = 1; i < s.length; i++)
    if (t <= s[i][0]) {
      const [t0, c0] = s[i - 1], [t1, c1] = s[i];
      return c0.clone().lerp(c1, (t - t0) / (t1 - t0 || 1));
    }
  return s[s.length - 1][1].clone();
}

/** Lathe (around +Y) with welded smooth normals. UV: u around, v up the profile. */
function lathe(profile: Profile, segs: number): THREE.BufferGeometry {
  const g = latheGeometry(profile, segs);
  smoothNormals(g);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Radial edit around the Y axis: fn(angle, y, radius) -> new radius. Lathe angle convention (x = r sin a, z = r cos a). */
function radial(g: THREE.BufferGeometry, fn: (a: number, y: number, r: number) => number): THREE.BufferGeometry {
  return deform(g, (p) => {
    const r = Math.hypot(p.x, p.z);
    if (r < 1e-7) return;
    const k = fn(Math.atan2(p.x, p.z), p.y, r) / r;
    p.x *= k;
    p.z *= k;
  });
}

/** Lathe built around +Y -> lying along +X (profile start at x = 0). */
function toX<T extends THREE.BufferGeometry>(g: T): T {
  g.rotateZ(-Math.PI / 2);
  return g;
}

function tube(pts: V3[], radius: number | ((t: number) => number), o: Partial<SweepOpts> = {}): THREE.BufferGeometry {
  return sweepGeometry(curveThrough(pts), { radius, radialSegments: 8, tubularSegments: 12, caps: 'round', ...o });
}

/** Vertex colours graded along the segment a -> b. */
function gradeAlong(g: THREE.BufferGeometry, a: V3, b: V3, s: Stops): THREE.BufferGeometry {
  const A = V(...a), D = V(...b).sub(A);
  const L2 = Math.max(1e-12, D.lengthSq());
  const tmp = V();
  return paintVertices(g, (p) => ramp(s, clamp(tmp.copy(p).sub(A).dot(D) / L2)));
}

/** Vertex colours from the uv attribute. */
function paintUV(g: THREE.BufferGeometry, fn: (u: number, v: number, p: THREE.Vector3) => THREE.Color): THREE.BufferGeometry {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const p = V();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const c = fn(uv.getX(i), uv.getY(i), p);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Matrix mapping local +Z to `dir` (local +Y as close to `up` as possible), placed at `at`. */
function frame(at: THREE.Vector3, dir: THREE.Vector3, up = V(0, 1, 0), roll = 0): THREE.Matrix4 {
  const z = dir.clone().normalize();
  let x = up.clone().cross(z);
  if (x.lengthSq() < 1e-8) x = V(1, 0, 0).cross(z);
  x.normalize();
  const y = z.clone().cross(x).normalize();
  if (roll) {
    x.applyAxisAngle(z, roll);
    y.applyAxisAngle(z, roll);
  }
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(at);
}

function placed(g: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const c = g.clone();
  c.applyMatrix4(m);
  return c;
}

/** Profile walked by arc length from the top (for draping calyxes / caps over a lathe body). */
class ProfilePath {
  private r: number[] = [];
  private y: number[] = [];
  private s: number[] = [];
  readonly length: number;
  constructor(profile: Profile) {
    const pts = profile.slice().reverse();
    let acc = 0;
    pts.forEach(([r, y], i) => {
      if (i > 0) acc += Math.hypot(r - pts[i - 1][0], y - pts[i - 1][1]);
      this.r.push(r);
      this.y.push(y);
      this.s.push(acc);
    });
    this.length = acc;
  }
  /** [radius, y, normalR, normalY] at arc length s from the top. */
  at(s: number): [number, number, number, number] {
    s = clamp(s, 0, this.length);
    let i = 1;
    while (i < this.s.length - 1 && this.s[i] < s) i++;
    const t = (s - this.s[i - 1]) / Math.max(1e-9, this.s[i] - this.s[i - 1]);
    const dr = this.r[i] - this.r[i - 1], dy = this.y[i] - this.y[i - 1];
    const l = Math.hypot(dr, dy) || 1;
    return [mix(this.r[i - 1], this.r[i], t), mix(this.y[i - 1], this.y[i], t), -dy / l, dr / l];
  }
}

interface StarOpts {
  points: number;
  /** Arc length (from the top) covered by the solid centre. */
  inner: number;
  /** Arc length reached by each point's tip. */
  tips: number[];
  /** Higher = thinner points. */
  sharp?: number;
  phase?: number;
  rings?: number;
  segs?: number;
  /** Base lift off the surface. */
  offset?: number;
  /** Extra lift towards the tips (curling away from the body). */
  lift?: number[];
  /** Swirl of the points (radians at the tips). */
  twist?: number;
  /** Optional radial modulation so the sheet follows a lobed body. */
  shape?: (a: number, y: number, r: number) => number;
}

/**
 * A star-shaped sheet (calyx, stem base) draped over the top of a lathe body, following its
 * profile by arc length so long points drape down the sides. UV: u around, v = 0 centre .. 1 tips.
 */
function drapedStar(path: ProfilePath, o: StarOpts): THREE.BufferGeometry {
  const rings = o.rings ?? 8, segs = o.segs ?? o.points * 14;
  const tipMax = Math.max(...o.tips);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const rho = i / rings;
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * TAU;
      const local = ((a - (o.phase ?? 0)) * o.points) / TAU;
      const near = Math.round(local);
      const k = ((near % o.points) + o.points) % o.points;
      const spike = Math.pow(Math.abs(Math.cos(Math.PI * (local - near))), o.sharp ?? 3);
      const L = o.inner + (o.tips[k] - o.inner) * spike;
      const s = rho * L;
      const [pr, py, nr, ny] = path.at(s);
      const lift = (o.offset ?? 0.0006) + (o.lift?.[k] ?? 0) * Math.pow(sstep(o.inner, tipMax, s), 1.6);
      const a2 = a + (o.twist ?? 0) * rho * spike;
      let rr = pr + nr * lift;
      const yy = py + ny * lift;
      if (o.shape) rr = o.shape(a2, yy, rr);
      pos.push(Math.sin(a2) * rr, yy, Math.cos(a2) * rr);
      uv.push(j / segs, rho);
    }
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j, b = a + segs + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  smoothNormals(g);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

interface LeafSpec {
  length: number;
  width: number;
  /** Half-width multiplier (0..1) along the leaf, t = 0 base .. 1 tip. */
  outline?: (t: number) => number;
  /** U-shaped cupping across the leaf (fraction of the half width; + = edges up). */
  cup?: number;
  /** Total bend along the length in radians (+ = tip curls up). */
  curl?: number;
  /** Edge wave amplitude (m). */
  ruffle?: number;
  ruffleFreq?: number;
  /** Twist about the midrib (radians at the tip). */
  twist?: number;
  segL?: number;
  segW?: number;
  seed?: number;
}

/**
 * Leaf lying along +Z from the origin with its upper (front) side facing +Y.
 * UV: u across (0..1), v along (0 base .. 1 tip).
 */
function leafGeom(o: LeafSpec): THREE.BufferGeometry {
  const segL = o.segL ?? 16, segW = o.segW ?? 8;
  const outline = o.outline ?? ((t: number) => Math.sin(Math.PI * Math.pow(t, 0.75)));
  const kappa = (o.curl ?? 0) / o.length;
  const seed = o.seed ?? 0;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segL; i++) {
    const v = i / segL;
    const z = v * o.length;
    let mz = z, my = 0, ny = 1, nz = 0;
    if (Math.abs(kappa) > 1e-6) {
      const a = kappa * z;
      mz = Math.sin(a) / kappa;
      my = (1 - Math.cos(a)) / kappa;
      ny = Math.cos(a);
      nz = -Math.sin(a);
    }
    const ol = Math.max(0, outline(v));
    const hw = ol * o.width * 0.5;
    for (let j = 0; j <= segW; j++) {
      const u = j / segW;
      const ac = (u - 0.5) * 2;
      const x = ac * hw;
      let y = (o.cup ?? 0) * ac * ac * hw;
      if (o.ruffle)
        y += o.ruffle * ac * ac * Math.sin(v * (o.ruffleFreq ?? 20) + seed + Math.abs(ac) * 2.3 + (ac < 0 ? 1.7 : 0)) * Math.min(1, ol * 4);
      let xx = x, yy = y;
      if (o.twist) {
        const tw = o.twist * v, c = Math.cos(tw), s = Math.sin(tw);
        xx = x * c - y * s;
        yy = x * s + y * c;
      }
      pos.push(xx, my + ny * yy, mz + nz * yy);
      uv.push(u, v);
    }
  }
  for (let i = 0; i < segL; i++)
    for (let j = 0; j < segW; j++) {
      const a = i * (segW + 1) + j, b = a + segW + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Flat ribbon along a curve (shreds). UV: u across, v along. Front faces the Frenet normal. */
function ribbonGeom(curve: THREE.Curve<THREE.Vector3>, width: (t: number) => number, segs: number, twist = 0): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const P = V(), B = V();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    B.copy(frames.binormals[i]).applyAxisAngle(frames.tangents[i], twist * t);
    const w = width(t) / 2;
    pos.push(P.x - B.x * w, P.y - B.y * w, P.z - B.z * w, P.x + B.x * w, P.y + B.y * w, P.z + B.z * w);
    uv.push(0, t, 1, t);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------------
// Canvas painting helpers

function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.01, r), 0, TAU);
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}

function ringStroke(ctx: Ctx, cx: number, cy: number, r: number, lw: number, color: string) {
  circle(ctx, cx, cy, r);
  ctx.lineWidth = lw;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function softSpot(ctx: Ctx, x: number, y: number, rx: number, ry: number, color: string, a: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

interface SpotOpts {
  n: number;
  /** Radius range as a fraction of the canvas width. */
  size: [number, number];
  alpha: [number, number];
  seed: number;
  /** Vertical stretch (ry / rx) so spots look round on the model. */
  ys?: number;
  /** Vertical range (0..1 of the canvas height). */
  y?: [number, number];
}

/** Soft blotches, wrapping horizontally (lathe textures). */
function blotches(ctx: Ctx, w: number, h: number, color: string, o: SpotOpts) {
  const r = new Rng(o.seed);
  for (let i = 0; i < o.n; i++) {
    const x = r.next() * w, y = mix(o.y?.[0] ?? 0, o.y?.[1] ?? 1, r.next()) * h;
    const rx = r.range(o.size[0], o.size[1]) * w, ry = rx * (o.ys ?? 1);
    const a = r.range(o.alpha[0], o.alpha[1]);
    for (const dx of [-w, 0, w]) if (x + dx + rx > 0 && x + dx - rx < w) softSpot(ctx, x + dx, y, rx, ry, color, a);
  }
}

/** Small hard dots, wrapping horizontally. */
function dots(ctx: Ctx, w: number, h: number, color: string, o: SpotOpts) {
  const r = new Rng(o.seed);
  for (let i = 0; i < o.n; i++) {
    const x = r.next() * w, y = mix(o.y?.[0] ?? 0, o.y?.[1] ?? 1, r.next()) * h;
    const rx = r.range(o.size[0], o.size[1]) * w, ry = rx * (o.ys ?? 1);
    ctx.fillStyle = rgba(color, r.range(o.alpha[0], o.alpha[1]));
    for (const dx of [-w, 0, w])
      if (x + dx + rx > 0 && x + dx - rx < w) {
        ellipse(ctx, x + dx, y, rx, ry, 0);
        ctx.fill();
      }
  }
}

/** Generic mottled flesh texture (dice, sticks, mash): works with any UV layout. */
function fleshTex(key: string, base: string, light: string, dark: string, extra?: (ctx: Ctx, w: number, h: number) => void) {
  return canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, light, { n: 26, size: [0.08, 0.22], alpha: [0.12, 0.3], seed: 1 });
      blotches(ctx, w, h, dark, { n: 18, size: [0.06, 0.16], alpha: [0.06, 0.16], seed: 2 });
      extra?.(ctx, w, h);
    },
    { key, wrap: true },
  );
}

/** Path of a profile's silhouette in a sectionV canvas (x = -R..R across, y = top..bottom). */
function silhouettePath(ctx: Ctx, profile: Profile, w: number, h: number) {
  const R = profileMaxRadius(profile), y0 = profile[0][1], H = profileHeight(profile);
  const X = (r: number) => (r / R) * (w / 2), Y = (y: number) => h - ((y - y0) / H) * h;
  ctx.beginPath();
  for (const [r, y] of profile) ctx.lineTo(w / 2 + X(r), Y(y));
  for (let i = profile.length - 1; i >= 0; i--) ctx.lineTo(w / 2 - X(profile[i][0]), Y(profile[i][1]));
  ctx.closePath();
}

/** Superellipse-ish chamber in polar space (tomato locules, pepper lobes...). */
function polarBlob(ctx: Ctx, cx: number, cy: number, ac: number, half: number, r0: number, r1: number, p = 4, steps = 56) {
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * TAU, c = Math.cos(t), s = Math.sin(t);
    const sx = Math.sign(c) * Math.pow(Math.abs(c), 2 / p);
    const sy = Math.sign(s) * Math.pow(Math.abs(s), 2 / p);
    const a = ac + half * sx * (0.75 + 0.25 * (sy + 1) * 0.5);
    const rr = (r0 + r1) / 2 + ((r1 - r0) / 2) * sy;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** A seed: small ellipse with a soft halo. */
function seed(ctx: Ctx, x: number, y: number, a: number, b: number, rot: number, fill: string, edge: string, halo?: string) {
  if (halo) {
    ctx.fillStyle = halo;
    ellipse(ctx, x, y, a * 1.7, b * 2, rot);
    ctx.fill();
  }
  ctx.fillStyle = fill;
  ellipse(ctx, x, y, a, b, rot);
  ctx.fill();
  ctx.lineWidth = Math.max(0.6, b * 0.25);
  ctx.strokeStyle = edge;
  ctx.stroke();
}

/** Soft glossy highlight streak on a cut face (wet look). */
function sheen(ctx: Ctx, x: number, y: number, rx: number, ry: number, a = 0.18) {
  softSpot(ctx, x, y, rx, ry, '#ffffff', a);
}

// ---------------------------------------------------------------------------------------------
// Shared plant-part materials (stems, calyxes, roots) - vertex coloured, little browning.

const plantMats = new Map<string, Mat>();
function plantMat(key: string, flesh: string, o: { roughness?: number; clearcoat?: number; cookColor?: string; sheen?: number } = {}): Mat {
  let m = plantMats.get(key);
  if (!m)
    plantMats.set(
      key,
      (m = foodMat({
        color: '#ffffff',
        vertexColors: true,
        roughness: o.roughness ?? 0.55,
        clearcoat: o.clearcoat,
        clearcoatRoughness: 0.35,
        sheen: o.sheen,
        sheenColor: '#fff4dc',
        flesh,
        cookColor: o.cookColor ?? '#5a4a1e',
        cookAmount: 0.35,
      })),
    );
  return m;
}

// =============================================================================================
// TOMATO (round)

const TOMATO = colors('tomato');
const TOMATO_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0.0045], [0.0105, 0.0012], [0.022, 0.0034], [0.0322, 0.0108], [0.0386, 0.0222], [0.04, 0.0335],
    [0.0381, 0.0452], [0.0322, 0.0552], [0.0222, 0.0617], [0.0112, 0.0642], [0.0046, 0.0626], [0.0001, 0.0606],
  ],
  44,
);
const TOMATO_TOP = 0.0642;
const tomatoPath = new ProfilePath(TOMATO_PROFILE);

const tomatoSkinTex = () =>
  canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#d8572c');
      g.addColorStop(0.12, '#ea5a30');
      g.addColorStop(0.35, '#e8482f');
      g.addColorStop(0.75, '#e13a2c');
      g.addColorStop(1, '#d43326');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, '#f4733e', { n: 70, size: [0.025, 0.07], alpha: [0.08, 0.2], seed: 3, ys: 2.2 });
      blotches(ctx, w, h, '#c4281f', { n: 60, size: [0.025, 0.07], alpha: [0.06, 0.16], seed: 4, ys: 2.2 });
      // pale streaks radiating from the stem
      const r = new Rng(9);
      for (let i = 0; i < 30; i++) {
        const x = r.next() * w, len = r.range(0.06, 0.26) * h;
        const sg = ctx.createLinearGradient(0, 0, 0, len);
        sg.addColorStop(0, 'rgba(255,196,120,0.38)');
        sg.addColorStop(1, 'rgba(255,196,120,0)');
        ctx.strokeStyle = sg;
        ctx.lineWidth = r.range(1.2, 3.2);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.quadraticCurveTo(x + r.range(-3, 3), len * 0.5, x + r.range(-5, 5), len);
        ctx.stroke();
      }
      // tiny pale freckles
      dots(ctx, w, h, '#ffd2a0', { n: 50, size: [0.003, 0.006], alpha: [0.25, 0.5], seed: 12, ys: 2.2, y: [0.1, 0.9] });
      // blossom end
      const bg = ctx.createLinearGradient(0, h * 0.93, 0, h);
      bg.addColorStop(0, 'rgba(160,60,30,0)');
      bg.addColorStop(1, 'rgba(150,85,40,0.55)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, h * 0.93, w, h * 0.07);
    },
    { key: 'veg/tomato/skin' },
  );

const tomatoSkin = lazy(() =>
  foodMat({ color: '#ffffff', map: tomatoSkinTex(), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.09, flesh: TOMATO.flesh, cookColor: TOMATO.cooked, name: 'tomato-skin' }),
);
const tomatoFlesh = lazy(() =>
  foodMat({
    color: '#ffffff',
    map: fleshTex('veg/tomato/flesh', '#f05a48', '#fb9a7c', '#d63e30', (ctx, w, h) =>
      dots(ctx, w, h, '#f8e2a4', { n: 14, size: [0.025, 0.04], alpha: [0.85, 1], seed: 5, ys: 0.6 }),
    ),
    roughness: 0.32,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    flesh: TOMATO.flesh,
    cookColor: TOMATO.cooked,
  }),
);

function tomatoShape(lobes: number, ph: number, s: number, amp: number) {
  return (a: number, y: number, rad: number) => {
    const h = y / TOMATO_TOP;
    const c = Math.cos((lobes * (a + ph)) / 2);
    const f = Math.sqrt(c * c + 0.035);
    const am = amp * (0.15 + 0.85 * sstep(0.25, 0.9, h));
    const n = fbm3(Math.sin(a) * 1.6 + s, h * 1.8, Math.cos(a) * 1.6, 2);
    return rad * (1 + am * (f - 0.72) + 0.022 * n);
  };
}

/** Green star calyx + stub stem for the top of a lathe body. */
function calyxAndStem(
  r: Rng,
  path: ProfilePath,
  topY: number,
  o: {
    points: number;
    inner: number;
    tip: [number, number];
    sharp?: number;
    lift?: [number, number];
    twist?: number;
    shape?: StarOpts['shape'];
    stemLen: number;
    stemR: number;
    stemBend?: number;
    green: [string, string];
    stemCol: [string, string];
    matKey: string;
  },
): THREE.Mesh[] {
  const tips = Array.from({ length: o.points }, () => r.range(o.tip[0], o.tip[1]));
  const lift = Array.from({ length: o.points }, () => r.range(o.lift?.[0] ?? 0.001, o.lift?.[1] ?? 0.004));
  const star = drapedStar(path, {
    points: o.points,
    inner: o.inner,
    tips,
    sharp: o.sharp ?? 3,
    phase: r.range(0, TAU),
    offset: 0.0007,
    lift,
    twist: o.twist ?? r.range(-0.25, 0.25),
    shape: o.shape,
    rings: 9,
  });
  const cs = stops([[0, o.green[0]], [1, o.green[1]]]);
  paintUV(star, (_u, v) => ramp(cs, v));
  const bend = o.stemBend ?? 0.3;
  const ang = r.range(0, TAU);
  const dx = Math.sin(ang) * bend * o.stemLen, dz = Math.cos(ang) * bend * o.stemLen;
  const y0 = topY - 0.002;
  const pts: V3[] = [
    [0, y0, 0],
    [dx * 0.15, y0 + o.stemLen * 0.45, dz * 0.15],
    [dx * 0.55, y0 + o.stemLen * 0.85, dz * 0.55],
    [dx, y0 + o.stemLen, dz],
  ];
  const stem = tube(pts, (t) => o.stemR * (1.25 - 0.3 * t), { radialSegments: 9, tubularSegments: 10, caps: 'round' });
  gradeAlong(stem, pts[0], pts[3], stops([[0, o.stemCol[0]], [0.8, o.stemCol[0]], [1, o.stemCol[1]]]));
  const mat = plantMat(o.matKey, o.green[1]);
  return [mesh(star, mat), mesh(stem, mat)];
}

function buildTomato(r: Rng): THREE.Object3D {
  const g = lathe(TOMATO_PROFILE, 56);
  const shape = tomatoShape(r.next() < 0.5 ? 5 : 6, r.range(0, TAU), r.range(0, 50), r.range(0.07, 0.1));
  radial(g, shape);
  const sx = r.range(0.97, 1.03), sy = r.range(0.95, 1.04);
  const body = mesh(g, tomatoSkin(), { scale: [sx, sy, 2 - sx] });
  const parts = calyxAndStem(r, tomatoPath, TOMATO_TOP, {
    points: r.next() < 0.6 ? 5 : 6,
    inner: 0.0042,
    tip: [0.019, 0.026],
    sharp: 2.6,
    lift: [0.001, 0.005],
    shape,
    stemLen: 0.0085,
    stemR: 0.0021,
    green: ['#3f7d27', '#6fae45'],
    stemCol: ['#4e8a2f', '#b9c48a'],
    matKey: 'tomato-green',
  });
  for (const p of parts) p.scale.set(sx, sy, 2 - sx);
  return sitOnGround(group(body, ...parts));
}

function tomatoChamber(ctx: Ctx, path: () => void, cx: number, cy: number, rad: number) {
  path();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
  g.addColorStop(0, '#fcc09c');
  g.addColorStop(0.6, '#f99c7a');
  g.addColorStop(1, '#f2785e');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, rad * 0.06);
  ctx.strokeStyle = 'rgba(214,52,40,0.55)';
  ctx.stroke();
}

function tomatoSection(ctx: Ctx, s: number, o: SectionOpts) {
  const R = s / 2, r = new Rng(31);
  ctx.fillStyle = '#e84a3a';
  ctx.fillRect(0, 0, s, s);
  const bg = ctx.createRadialGradient(R, R, 0, R, R, R);
  bg.addColorStop(0, '#f47a62');
  bg.addColorStop(0.5, '#ef5a46');
  bg.addColorStop(1, '#e5463a');
  ctx.fillStyle = bg;
  circle(ctx, R, R, R);
  ctx.fill();
  const n = 4, ph = 0.35;
  for (let k = 0; k < n; k++) {
    const ac = ph + (k / n) * TAU, half = (Math.PI / n) * 0.74;
    const r0 = R * 0.3, r1 = R * 0.8;
    const mx = R + Math.cos(ac) * R * 0.56, my = R + Math.sin(ac) * R * 0.56;
    tomatoChamber(ctx, () => polarBlob(ctx, R, R, ac, half, r0, r1, 3.2), mx, my, R * 0.36);
    for (let i = 0; i < 5; i++) {
      const a = ac + (i - 2) * half * 0.36 + r.range(-0.05, 0.05);
      const rr = R * (0.63 + r.range(-0.04, 0.04) - Math.abs(i - 2) * 0.025);
      seed(ctx, R + Math.cos(a) * rr, R + Math.sin(a) * rr, s * 0.026, s * 0.015, a, '#f9e7ae', 'rgba(222,180,110,0.9)', 'rgba(255,236,200,0.45)');
    }
  }
  // core (columella)
  ctx.fillStyle = '#f37862';
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * TAU;
    const rr = R * (0.2 + 0.035 * Math.cos(n * (a - ph)) + 0.01 * Math.sin(3 * a));
    ctx.lineTo(R + Math.cos(a) * rr, R + Math.sin(a) * rr);
  }
  ctx.fill();
  softSpot(ctx, R, R, R * 0.14, R * 0.14, '#ffc4a8', 0.6);
  if (!o.peeled) ringStroke(ctx, R, R, R - s * 0.01, s * 0.02, '#c8281d');
  sheen(ctx, R * 0.7, R * 0.6, R * 0.35, R * 0.18, 0.16);
}

function tomatoSectionV(ctx: Ctx, w: number, h: number, o: SectionOpts) {
  const r = new Rng(17);
  ctx.fillStyle = '#ea4d3c';
  ctx.fillRect(0, 0, w, h);
  const bg = ctx.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, Math.max(w, h) * 0.55);
  bg.addColorStop(0, '#f47a62');
  bg.addColorStop(1, '#e6463a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  for (const side of [-1, 1]) {
    const cx = w / 2 + side * w * 0.255, cy = h * 0.54, rx = w * 0.15, ry = h * 0.3;
    tomatoChamber(ctx, () => ellipse(ctx, cx, cy, rx, ry, side * 0.12), cx, cy, Math.max(rx, ry));
    for (let i = 0; i < 6; i++) {
      const t = (i / 5 - 0.5) * 2.1;
      const x = cx + side * rx * 0.55 * Math.cos(t * 0.8), y = cy + ry * 0.62 * Math.sin(t * 0.8);
      seed(ctx, x + r.range(-2, 2), y, w * 0.022, h * 0.016, side * 0.5 + t * 0.3, '#f9e7ae', 'rgba(222,180,110,0.9)', 'rgba(255,236,200,0.45)');
    }
  }
  // core: pale stem scar at the top fading into a red column
  const cg = ctx.createLinearGradient(0, 0, 0, h);
  cg.addColorStop(0, '#f6d7b8');
  cg.addColorStop(0.18, '#f58a70');
  cg.addColorStop(1, '#f06650');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(w * 0.43, h * 0.04);
  ctx.quadraticCurveTo(w * 0.5, h * 0.0, w * 0.57, h * 0.04);
  ctx.quadraticCurveTo(w * 0.6, h * 0.5, w * 0.555, h * 0.9);
  ctx.quadraticCurveTo(w * 0.5, h * 0.95, w * 0.445, h * 0.9);
  ctx.quadraticCurveTo(w * 0.4, h * 0.5, w * 0.43, h * 0.04);
  ctx.fill();
  if (!o.peeled) {
    silhouettePath(ctx, TOMATO_PROFILE, w, h);
    ctx.lineWidth = Math.max(2, w * 0.035);
    ctx.strokeStyle = '#c42a1e';
    ctx.stroke();
  }
  sheen(ctx, w * 0.35, h * 0.3, w * 0.2, h * 0.1, 0.14);
}

// =============================================================================================
// CARROT (long)

const CARROT = colors('carrot');
const CARROT_L = 0.17;
const CARROT_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0], [0.0076, 0.0011], [0.0123, 0.0042], [0.0143, 0.0095], [0.0147, 0.018], [0.0141, 0.04],
    [0.0127, 0.07], [0.0106, 0.1], [0.0081, 0.125], [0.0055, 0.145], [0.003, 0.159], [0.0013, 0.1665], [0.0001, 0.17],
  ],
  60,
);

/** Carrot skin: canvas bottom = crown (profile start), top = tip. Horizontal growth rings. */
function carrotTex(peeled: boolean) {
  return canvasTexture(
    256,
    512,
    (ctx, w, h) => {
      const base = peeled ? CARROT.peeled ?? '#f8a03e' : CARROT.skin;
      const g = ctx.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, peeled ? '#f29436' : '#b98a2c');
      g.addColorStop(0.02, peeled ? '#f6a040' : '#d9741e');
      g.addColorStop(0.08, base);
      g.addColorStop(0.7, mixHex(base, '#ffb050', 0.18));
      g.addColorStop(1, mixHex(base, '#e06a18', 0.3));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const r = new Rng(peeled ? 41 : 40);
      // faint longitudinal streaks (peeler strokes when peeled)
      for (let i = 0; i < (peeled ? 40 : 24); i++) {
        const x = r.next() * w, wd = r.range(4, peeled ? 22 : 12);
        ctx.fillStyle = rgba(r.next() < 0.5 ? '#ffc070' : '#d86410', r.range(0.05, peeled ? 0.16 : 0.1));
        for (const dx of [-w, 0, w]) ctx.fillRect(x + dx, 0, wd, h);
      }
      // growth rings: partial horizontal grooves with a light lip
      const nRings = peeled ? 30 : 70;
      for (let i = 0; i < nRings; i++) {
        const y = r.range(0.03, 0.97) * h, x0 = r.next() * w, len = r.range(0.25, 0.75) * w;
        const lw = r.range(1, peeled ? 1.8 : 2.6);
        for (const dx of [-w, 0]) {
          ctx.strokeStyle = rgba(peeled ? '#e07a20' : '#b9561a', r.range(0.25, peeled ? 0.35 : 0.6));
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.moveTo(x0 + dx, y);
          ctx.bezierCurveTo(x0 + dx + len * 0.3, y + r.range(-2, 2), x0 + dx + len * 0.7, y + r.range(-2, 2), x0 + dx + len, y + r.range(-1, 1));
          ctx.stroke();
          ctx.strokeStyle = rgba('#ffc27a', 0.28);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x0 + dx + len * 0.1, y - lw);
          ctx.lineTo(x0 + dx + len * 0.9, y - lw);
          ctx.stroke();
        }
      }
      if (!peeled) {
        // tiny root-hair pits
        dots(ctx, w, h, '#8a4412', { n: 60, size: [0.004, 0.009], alpha: [0.35, 0.7], seed: 44, ys: 0.45, y: [0.1, 0.95] });
        blotches(ctx, w, h, '#ffb35a', { n: 40, size: [0.04, 0.1], alpha: [0.08, 0.18], seed: 45, ys: 1.6 });
      }
    },
    { key: peeled ? 'veg/carrot/peeled' : 'veg/carrot/skin' },
  );
}

function carrotBumpTex() {
  return canvasTexture(
    256,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, w, h);
      const r = new Rng(40);
      for (let i = 0; i < 90; i++) {
        const y = r.range(0.03, 0.97) * h, x0 = r.next() * w, len = r.range(0.25, 0.75) * w;
        for (const dx of [-w, 0]) {
          ctx.strokeStyle = rgba('#202020', r.range(0.5, 0.9));
          ctx.lineWidth = r.range(1.2, 3);
          ctx.beginPath();
          ctx.moveTo(x0 + dx, y);
          ctx.lineTo(x0 + dx + len, y + r.range(-2, 2));
          ctx.stroke();
        }
      }
    },
    { key: 'veg/carrot/bump', srgb: false },
  );
}

const carrotSkin = lazy(() =>
  foodMat({ color: '#ffffff', map: carrotTex(false), bumpMap: carrotBumpTex(), bumpScale: 1.2, roughness: 0.55, flesh: CARROT.flesh, cookColor: CARROT.cooked, name: 'carrot-skin' }),
);
const carrotPeeled = lazy(() =>
  foodMat({ color: '#ffffff', map: carrotTex(true), roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.4, flesh: CARROT.flesh, cookColor: CARROT.cooked }),
);
const carrotFlesh = lazy(() =>
  foodMat({ color: '#ffffff', map: fleshTex('veg/carrot/flesh', CARROT.flesh, '#fbb050', '#e07a20'), roughness: 0.45, flesh: CARROT.flesh, cookColor: CARROT.cooked }),
);

function carrotBody(r: Rng, peeled: boolean): THREE.BufferGeometry {
  const g = lathe(CARROT_PROFILE, 36);
  const s = r.range(0, 50);
  const rings = Array.from({ length: peeled ? 2 : 7 }, () => [r.range(0.015, 0.15), r.range(0.0012, 0.003), r.range(0.015, 0.04)]);
  const bendX = r.range(-0.004, 0.004), bendZ = r.range(-0.014, 0.014);
  deform(g, (p) => {
    const t = p.y / CARROT_L;
    let k = 1 + (peeled ? 0.012 : 0.03) * fbm3(p.x * 160 + s, p.y * 55, p.z * 160, 2);
    for (const [y0, wd, dp] of rings) k -= dp * Math.exp(-(((p.y - y0) / wd) ** 2));
    p.x = p.x * k + bendX * t * t;
    p.z = p.z * k + bendZ * t * t;
  });
  return toX(g);
}

/** Pinnate frond outline (feathery carrot leaves). */
const frondOutline = (lobes: number) => (t: number) =>
  Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.8) * (0.42 + 0.58 * Math.pow(Math.abs(Math.sin(Math.PI * t * lobes)), 0.6));

function carrotGreens(r: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = r.int(5, 7);
  const stemCol = stops([[0, '#9bb85a'], [0.25, '#7fae45'], [1, '#5f9a35']]);
  const frondCol = stops([[0, '#3f8a2a'], [0.5, '#4f9a32'], [1, '#6db345']]);
  for (let i = 0; i < n; i++) {
    const spread = n > 1 ? (i / (n - 1) - 0.5) * 2 : 0;
    const yaw = spread * 0.85 + r.range(-0.12, 0.12);
    const len = r.range(0.026, 0.04);
    const lift = r.range(0.004, 0.011);
    const dir = V(-Math.cos(yaw), 0, Math.sin(yaw));
    const p0 = V(0.004, r.range(-0.003, 0.004), r.range(-0.003, 0.003));
    const p1 = p0.clone().addScaledVector(dir, len * 0.35).add(V(0, lift, 0));
    const p2 = p0.clone().addScaledVector(dir, len * 0.75).add(V(0, lift * 0.7, 0));
    const p3 = p0.clone().addScaledVector(dir, len).add(V(0, lift * 0.25, 0));
    const pts: V3[] = [p0, p1, p2, p3].map((p) => p.toArray() as V3);
    const st = tube(pts, (t) => 0.0014 * (1 - 0.45 * t), { radialSegments: 6, tubularSegments: 10, caps: 'round' });
    gradeAlong(st, pts[0], pts[3], stemCol);
    parts.push(st);
    // fronds: one big at the end, one or two smaller along the stem
    const fronds: [THREE.Vector3, THREE.Vector3, number][] = [[p3, p3.clone().sub(p2).setY(-0.004).normalize(), 1]];
    if (r.next() < 0.8) fronds.push([p2, dir.clone().applyAxisAngle(V(0, 1, 0), r.sign() * r.range(0.5, 0.9)).setY(0.05), 0.6]);
    for (const [at, d, sc] of fronds) {
      const L = r.range(0.026, 0.034) * sc;
      const leaf = leafGeom({ length: L, width: L * r.range(0.6, 0.75), outline: frondOutline(r.int(4, 5)), cup: 0.25, curl: r.range(-0.6, -0.2), ruffle: 0.0007, ruffleFreq: 30, segL: 18, segW: 6, seed: r.range(0, 9) });
      paintUV(leaf, (u, v) => ramp(frondCol, v * 0.6 + (1 - Math.abs(u - 0.5) * 2) * 0.3));
      parts.push(placed(leaf, frame(at, d, V(0, 1, 0), r.range(-0.4, 0.4))));
    }
  }
  return merge(parts);
}

function carrotSection(ctx: Ctx, s: number, o: SectionOpts) {
  const R = s / 2;
  radialFill(ctx, s, [[0, '#fbc061'], [0.36, '#f9b04a'], [0.46, '#fcc66a'], [0.5, '#f59a36'], [0.85, '#f39234'], [1, '#ee8a2c']]);
  // star-ish core pattern
  ctx.strokeStyle = 'rgba(255,214,140,0.55)';
  ctx.lineWidth = s * 0.008;
  const r = new Rng(3);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + r.range(-0.1, 0.1);
    ctx.beginPath();
    ctx.moveTo(R + Math.cos(a) * R * 0.06, R + Math.sin(a) * R * 0.06);
    ctx.lineTo(R + Math.cos(a) * R * r.range(0.3, 0.42), R + Math.sin(a) * R * r.range(0.3, 0.42));
    ctx.stroke();
  }
  ringStroke(ctx, R, R, R * 0.47, s * 0.012, 'rgba(255,220,150,0.7)');
  softSpot(ctx, R, R, R * 0.08, R * 0.08, '#ffe0a0', 0.8);
  if (!o.peeled) ringStroke(ctx, R, R, R - s * 0.012, s * 0.024, '#e0701c');
  sheen(ctx, R * 0.75, R * 0.65, R * 0.3, R * 0.15, 0.14);
}

function buildCarrot(r: Rng, peeled = false): THREE.Object3D {
  const body = mesh(carrotBody(r, peeled), peeled ? carrotPeeled() : carrotSkin(), { skin: !peeled });
  if (peeled) return sitOnGround(group(body));
  const greens = mesh(carrotGreens(r), plantMat('carrot-greens', '#8cc060', { roughness: 0.6 }));
  return sitOnGround(group(body, greens));
}

// =============================================================================================
// POTATO (potato: lies along X)

const POTATO = colors('potato');
const POTATO_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0], [0.012, 0.0035], [0.021, 0.01], [0.027, 0.02], [0.0305, 0.034], [0.0315, 0.05],
    [0.0305, 0.066], [0.027, 0.08], [0.021, 0.09], [0.012, 0.0965], [0.0001, 0.1],
  ],
  32,
);

function potatoTex() {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#cfa266';
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, '#a8783f', { n: 70, size: [0.03, 0.09], alpha: [0.1, 0.25], seed: 1, ys: 0.6 });
      blotches(ctx, w, h, '#e2bd82', { n: 60, size: [0.03, 0.08], alpha: [0.12, 0.28], seed: 2, ys: 0.6 });
      // russet netting
      const r = new Rng(5);
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 90; i++) {
        const x = r.next() * w, y = r.next() * h;
        ctx.strokeStyle = rgba('#8a6236', r.range(0.12, 0.28));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + r.range(-8, 8), y + r.range(-6, 6), x + r.range(-14, 14), y + r.range(-8, 8));
        ctx.stroke();
      }
      dots(ctx, w, h, '#6b4522', { n: 420, size: [0.002, 0.006], alpha: [0.35, 0.8], seed: 7, ys: 0.7 });
      dots(ctx, w, h, '#f0d7a0', { n: 160, size: [0.002, 0.004], alpha: [0.5, 0.9], seed: 8, ys: 0.7 });
    },
    { key: 'veg/potato/skin', wrap: true },
  );
}

function potatoPeeledTex() {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#f2e0a2';
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, '#fbefc4', { n: 50, size: [0.04, 0.1], alpha: [0.15, 0.35], seed: 1 });
      blotches(ctx, w, h, '#e6cc84', { n: 40, size: [0.03, 0.08], alpha: [0.1, 0.2], seed: 2 });
      dots(ctx, w, h, '#b48a4a', { n: 10, size: [0.006, 0.012], alpha: [0.35, 0.6], seed: 3 });
    },
    { key: 'veg/potato/peeled', wrap: true },
  );
}

const potatoSkinV = lazy(() =>
  foodMat({ color: '#ffffff', map: potatoTex(), vertexColors: true, roughness: 0.82, flesh: POTATO.flesh, cookColor: POTATO.cooked, name: 'potato-skin' }),
);
const potatoSkin = lazy(() => foodMat({ color: '#ffffff', map: potatoTex(), roughness: 0.82, flesh: POTATO.flesh, cookColor: POTATO.cooked }));
const potatoPeeledMat = lazy(() =>
  foodMat({ color: '#ffffff', map: potatoPeeledTex(), vertexColors: true, roughness: 0.45, clearcoat: 0.2, clearcoatRoughness: 0.4, flesh: POTATO.flesh, cookColor: POTATO.cooked }),
);
const potatoFlesh = lazy(() =>
  foodMat({ color: '#ffffff', map: fleshTex('veg/potato/flesh', POTATO.flesh, '#fbf0c8', '#e6cc84'), roughness: 0.5, flesh: POTATO.flesh, cookColor: POTATO.cooked }),
);

function potatoGeom(r: Rng, peeled: boolean): THREE.BufferGeometry {
  const seedN = r.range(0, 100);
  const g = blobGeometry(0.05, { detail: 13, amp: peeled ? 0.0018 : 0.003, freq: 24, seed: seedN, scale: [1, 0.56, 0.67] });
  const bulge = r.range(-0.14, 0.14), bend = r.range(-0.007, 0.007), lean = r.range(-0.004, 0.004);
  const shapeFn = (p: THREE.Vector3) => {
    const tx = p.x / 0.05;
    p.y *= 1 + bulge * tx;
    p.z *= 1 - bulge * 0.4 * tx;
    p.z += bend * (1 - tx * tx);
    p.y += lean * tx;
  };
  const pos = g.attributes.position as THREE.BufferAttribute;
  const eyes: THREE.Vector3[] = [];
  const nEyes = peeled ? 3 : r.int(6, 9);
  for (let i = 0; i < nEyes; i++) {
    const e = V().fromBufferAttribute(pos, r.int(0, pos.count - 1));
    shapeFn(e);
    eyes.push(e);
  }
  const ER = 0.0062;
  deform(g, (p, n) => {
    shapeFn(p);
    if (peeled) return;
    for (const e of eyes) {
      const d = p.distanceTo(e);
      if (d < ER * 1.5) {
        const k = 1 - Math.min(1, d / ER);
        const brow = Math.exp(-(((d / ER - 1.05) / 0.25) ** 2));
        p.addScaledVector(n, -0.0017 * k * k * k + 0.0005 * brow);
      }
    }
  });
  // vertex shading: soft patches, darker eyes
  paintVertices(g, (p) => {
    let k = 1 + 0.1 * fbm3(p.x * 60 + seedN, p.y * 60, p.z * 60, 2);
    let warm = 0;
    for (const e of eyes) {
      const d = p.distanceTo(e) / ER;
      if (d < 1.4) {
        k *= peeled ? 1 - 0.25 * (1 - d / 1.4) : 0.55 + 0.45 * Math.min(1, d / 1.1);
        warm += (1 - d / 1.4) * 0.5;
      }
    }
    return [k * (1 + 0.04 * warm), k, k * (1 - 0.08 * warm)];
  });
  return g;
}

function buildPotato(r: Rng): THREE.Object3D {
  return sitOnGround(mesh(potatoGeom(r, false), potatoSkinV(), { skin: true }));
}

function potatoFace(ctx: Ctx, w: number, h: number, o: SectionOpts) {
  const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2;
  ctx.fillStyle = '#f3e2a6';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, '#faefc4');
  g.addColorStop(0.65, '#f6e6ae');
  g.addColorStop(0.84, '#efd894');
  g.addColorStop(0.88, '#f4e3a8');
  g.addColorStop(1, '#eed99a');
  ctx.fillStyle = g;
  circle(ctx, 0, 0, rx);
  ctx.fill();
  ringStroke(ctx, 0, 0, rx * 0.85, Math.max(1, rx * 0.025), 'rgba(226,198,118,0.55)');
  ctx.restore();
  dots(ctx, w, h, '#fff8dc', { n: 30, size: [0.004, 0.008], alpha: [0.4, 0.7], seed: 4, y: [0.2, 0.8] });
  if (!o.peeled) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ringStroke(ctx, 0, 0, rx - Math.max(1.5, w * 0.012), Math.max(3, w * 0.024), '#b9874a');
    ctx.restore();
  }
  sheen(ctx, w * 0.38, h * 0.36, w * 0.18, h * 0.1, 0.18);
}

// =============================================================================================
// ONION (round, peelable)

const ONION = colors('onion');
const ONION_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0.0035], [0.0072, 0.001], [0.0165, 0.0026], [0.0285, 0.0092], [0.0382, 0.0202], [0.0425, 0.0332],
    [0.0418, 0.0455], [0.0368, 0.0565], [0.0282, 0.0652], [0.0172, 0.0722], [0.0092, 0.0772], [0.0046, 0.0812],
    [0.0024, 0.0846], [0.0001, 0.0862],
  ],
  46,
);
const ONION_PEELED_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0.0032], [0.007, 0.001], [0.0162, 0.0026], [0.0278, 0.0094], [0.0372, 0.0204], [0.0412, 0.0332],
    [0.0405, 0.0452], [0.0356, 0.0558], [0.0268, 0.0638], [0.0158, 0.0698], [0.0072, 0.0728], [0.0026, 0.0738], [0.0001, 0.074],
  ],
  44,
);

function onionSkinTex() {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#9c6230');
      g.addColorStop(0.1, '#b7783a');
      g.addColorStop(0.3, '#d29149');
      g.addColorStop(0.65, '#cf8f45');
      g.addColorStop(0.9, '#b47236');
      g.addColorStop(1, '#8e5a2c');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, '#e9b56a', { n: 40, size: [0.04, 0.12], alpha: [0.12, 0.3], seed: 1, ys: 2 });
      blotches(ctx, w, h, '#a0602a', { n: 30, size: [0.03, 0.09], alpha: [0.1, 0.22], seed: 2, ys: 2 });
      const r = new Rng(13);
      // longitudinal veins
      for (let i = 0; i < 110; i++) {
        const x = r.next() * w, y0 = r.range(-0.1, 0.4) * h, y1 = r.range(0.6, 1.1) * h;
        const dark = r.next() < 0.6;
        ctx.strokeStyle = rgba(dark ? '#8a4f22' : '#f0c27e', r.range(0.12, dark ? 0.45 : 0.35));
        ctx.lineWidth = r.range(0.6, dark ? 1.8 : 2.4);
        const wob = r.range(-5, 5);
        for (const dx of [-w, 0, w]) {
          ctx.beginPath();
          ctx.moveTo(x + dx, y0);
          ctx.bezierCurveTo(x + dx + wob, mix(y0, y1, 0.33), x + dx - wob, mix(y0, y1, 0.66), x + dx + wob * 0.3, y1);
          ctx.stroke();
        }
      }
      // papery flakes (lighter patches with a crisp edge)
      for (let i = 0; i < 7; i++) {
        const x = r.next() * w, y = r.range(0.25, 0.8) * h, rw = r.range(10, 26), rh = r.range(20, 50);
        ctx.fillStyle = rgba('#e8bf7c', r.range(0.35, 0.6));
        ctx.beginPath();
        ctx.ellipse(x, y, rw, rh, r.range(-0.2, 0.2), 0, TAU);
        ctx.fill();
        ctx.strokeStyle = rgba('#7a4a20', 0.3);
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    },
    { key: 'veg/onion/skin' },
  );
}

function onionPeeledTex() {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#e6e2b4');
      g.addColorStop(0.15, '#f4ecd2');
      g.addColorStop(0.8, '#f3ead4');
      g.addColorStop(1, '#e8dcb8');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const r = new Rng(21);
      for (let i = 0; i < 70; i++) {
        const x = r.next() * w;
        ctx.strokeStyle = rgba(r.next() < 0.5 ? '#d8d3a4' : '#ffffff', r.range(0.15, 0.4));
        ctx.lineWidth = r.range(0.6, 1.6);
        for (const dx of [-w, 0, w]) {
          ctx.beginPath();
          ctx.moveTo(x + dx, 0);
          ctx.bezierCurveTo(x + dx + 3, h * 0.33, x + dx - 3, h * 0.66, x + dx, h);
          ctx.stroke();
        }
      }
    },
    { key: 'veg/onion/peeled' },
  );
}

const onionSkin = lazy(() =>
  foodMat({ color: '#ffffff', map: onionSkinTex(), roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35, sheen: 0.4, sheenColor: '#ffd9a0', sheenRoughness: 0.5, flesh: ONION.flesh, cookColor: ONION.cooked, name: 'onion-skin' }),
);
const onionPeeledMat = lazy(() =>
  foodMat({ color: '#ffffff', map: onionPeeledTex(), roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.18, flesh: ONION.flesh, cookColor: ONION.cooked }),
);
const onionFlesh = lazy(() =>
  foodMat({ color: '#ffffff', map: fleshTex('veg/onion/flesh', ONION.flesh, '#fffaf0', '#e2d8b4'), roughness: 0.35, clearcoat: 0.3, flesh: ONION.flesh, cookColor: ONION.cooked }),
);

function onionBody(r: Rng, profile: Profile, ridges: number): THREE.BufferGeometry {
  const g = lathe(profile, 52);
  const s = r.range(0, 50), ph = r.range(0, TAU);
  const top = profile[profile.length - 1][1];
  radial(g, (a, y, rad) => {
    const h = y / top;
    const rib = ridges ? 0.007 * Math.sin(ridges * a + ph + 2 * Math.sin(3 * a)) * Math.sin(Math.PI * h) : 0;
    return rad * (1 + rib + 0.03 * fbm3(Math.sin(a) * 1.5 + s, h * 2, Math.cos(a) * 1.5, 2));
  });
  return g;
}

/** Dry papery neck and root hairs of an onion / garlic bulb. */
function bulbEnds(r: Rng, topY: number, o: { neckLen: number; neckR: number; strands: number; roots: number; rootLen: [number, number]; plateR: number; neck: [string, string]; root: string }): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const nc = stops([[0, o.neck[0]], [1, o.neck[1]]]);
  for (let i = 0; i < o.strands; i++) {
    const a = r.range(0, TAU), lean = r.range(0.15, 0.45);
    const L = o.neckLen * r.range(0.75, 1.1);
    const pts: V3[] = [
      [0, topY - 0.003, 0],
      [Math.sin(a) * 0.0006, topY + L * 0.35, Math.cos(a) * 0.0006],
      [Math.sin(a) * L * lean * 0.5, topY + L * 0.7, Math.cos(a) * L * lean * 0.5],
      [Math.sin(a + 0.6) * L * lean, topY + L, Math.cos(a + 0.6) * L * lean],
    ];
    const st = tube(pts, (t) => o.neckR * (1 - 0.8 * t), { radialSegments: 6, tubularSegments: 10, caps: 'round', squash: [1, 0.45] });
    gradeAlong(st, pts[0], pts[3], nc);
    parts.push(st);
  }
  const rc = lin(o.root);
  const plate = new THREE.CylinderGeometry(o.plateR, o.plateR * 0.8, 0.002, 14, 1);
  plate.translate(0, 0.0012, 0);
  paintVertices(plate, () => rc.clone().multiplyScalar(0.92));
  parts.push(plate.toNonIndexed());
  for (let i = 0; i < o.roots; i++) {
    const a = (i / o.roots) * TAU + r.range(-0.2, 0.2);
    const L = r.range(o.rootLen[0], o.rootLen[1]);
    const d0 = r.range(0, o.plateR * 0.7);
    const pts: V3[] = [
      [Math.sin(a) * d0, 0.0011, Math.cos(a) * d0],
      [Math.sin(a) * (d0 + L * 0.4), 0.0006 + r.range(0, 0.0012), Math.cos(a) * (d0 + L * 0.4)],
      [Math.sin(a + r.range(-0.5, 0.5)) * (d0 + L), 0.0004 + r.range(0, 0.0015), Math.cos(a + r.range(-0.5, 0.5)) * (d0 + L)],
    ];
    const rt = tube(pts, 0.00042, { radialSegments: 4, tubularSegments: 6, caps: 'round' });
    paintVertices(rt, () => rc);
    parts.push(rt);
  }
  return merge(parts);
}

function buildOnion(r: Rng): THREE.Object3D {
  const body = mesh(onionBody(r, ONION_PROFILE, 22), onionSkin(), { skin: true });
  const top = ONION_PROFILE[ONION_PROFILE.length - 1][1];
  const ends = mesh(
    bulbEnds(r, top, { neckLen: 0.013, neckR: 0.0026, strands: 3, roots: 16, rootLen: [0.004, 0.009], plateR: 0.0065, neck: ['#b07a40', '#7a5028'], root: '#d9c39a' }),
    plantMat('onion-ends', '#e8d8b0', { roughness: 0.7, cookColor: '#4a3418' }),
  );
  return sitOnGround(group(body, ends));
}

function buildOnionPeeled(r: Rng): THREE.Object3D {
  const body = mesh(onionBody(r, ONION_PEELED_PROFILE, 0), onionPeeledMat());
  const top = ONION_PEELED_PROFILE[ONION_PEELED_PROFILE.length - 1][1];
  // trimmed neck nub and root plate
  const nub = new THREE.CylinderGeometry(0.0028, 0.0042, 0.003, 12, 1);
  nub.translate(0, top + 0.0005, 0);
  paintVertices(nub, () => lin('#e4dcae'));
  const plate = new THREE.CylinderGeometry(0.006, 0.0052, 0.0018, 14, 1);
  plate.translate(0, 0.0011, 0);
  paintVertices(plate, () => lin('#cfba8a'));
  const ends = mesh(merge([nub, plate]), plantMat('onion-trim', ONION.flesh, { roughness: 0.6 }));
  return sitOnGround(group(body, ends));
}

function onionRingPath(ctx: Ctx, cx: number, cy: number, rr: number, ph: number) {
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * TAU;
    const k = 1 + 0.018 * Math.sin(2 * a + ph) + 0.01 * Math.sin(3 * a + ph * 1.7);
    ctx.lineTo(cx + Math.cos(a) * rr * k, cy + Math.sin(a) * rr * k);
  }
  ctx.closePath();
}

function onionSection(ctx: Ctx, s: number, o: SectionOpts) {
  const R = s / 2, r = new Rng(8);
  ctx.fillStyle = '#f6efd9';
  ctx.fillRect(0, 0, s, s);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const rr = R * (o.peeled ? 1 : 0.955) * Math.pow(1 - t, 0.92);
    const off = t * R * 0.07;
    const cx = R + off, cy = R - off * 0.4;
    const ph = r.range(0, TAU);
    onionRingPath(ctx, cx, cy, rr, ph);
    const g = ctx.createRadialGradient(cx, cy, rr * 0.75, cx, cy, rr);
    g.addColorStop(0, i % 2 ? '#f8f2df' : '#f5edd5');
    g.addColorStop(1, '#efe5c4');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = Math.max(1, s * (0.008 - t * 0.004));
    ctx.strokeStyle = 'rgba(206,196,150,0.85)';
    ctx.stroke();
    onionRingPath(ctx, cx, cy, rr * 0.965, ph);
    ctx.lineWidth = Math.max(0.6, s * 0.004);
    ctx.strokeStyle = 'rgba(255,255,250,0.7)';
    ctx.stroke();
  }
  softSpot(ctx, R + R * 0.07, R - R * 0.03, R * 0.1, R * 0.1, '#e4e8b0', 0.9);
  if (!o.peeled) {
    ringStroke(ctx, R, R, R - s * 0.012, s * 0.024, '#c98a40');
    ringStroke(ctx, R, R, R - s * 0.026, s * 0.006, 'rgba(150,90,40,0.5)');
  }
  sheen(ctx, R * 0.7, R * 0.6, R * 0.35, R * 0.16, 0.2);
}

function onionSectionV(ctx: Ctx, w: number, h: number, o: SectionOpts) {
  const profile = o.peeled ? ONION_PEELED_PROFILE : ONION_PROFILE;
  const R = profileMaxRadius(profile), H = profileHeight(profile);
  ctx.fillStyle = '#f5edd5';
  ctx.fillRect(0, 0, w, h);
  const plateY = 0.07; // relative height of the basal plate
  const X = (r: number) => (r / R) * (w / 2), Y = (y: number) => h - (y / H) * h;
  const n = 8;
  for (let i = 0; i < n; i++) {
    const sx = Math.pow(1 - i / n, 0.95) * (o.peeled ? 1 : 0.95), sy = 1 - i * 0.035;
    ctx.beginPath();
    const pts = profile.filter(([, y]) => y >= plateY * H);
    for (const [rr, y] of pts) ctx.lineTo(w / 2 + X(rr) * sx, Y(plateY * H + (y - plateY * H) * sy));
    for (let k = pts.length - 1; k >= 0; k--) ctx.lineTo(w / 2 - X(pts[k][0]) * sx, Y(plateY * H + (pts[k][1] - plateY * H) * sy));
    ctx.closePath();
    ctx.fillStyle = i % 2 ? '#f8f1de' : '#f4ebd2';
    ctx.fill();
    ctx.lineWidth = Math.max(1, w * 0.008);
    ctx.strokeStyle = 'rgba(206,196,150,0.85)';
    ctx.stroke();
  }
  // basal plate
  ctx.fillStyle = '#e2d3a6';
  ctx.beginPath();
  ctx.ellipse(w / 2, Y(plateY * H * 0.6), w * 0.13, h * 0.05, 0, 0, TAU);
  ctx.fill();
  // green heart
  ctx.strokeStyle = 'rgba(200,214,140,0.9)';
  ctx.lineWidth = w * 0.02;
  ctx.beginPath();
  ctx.moveTo(w / 2, Y(plateY * H));
  ctx.quadraticCurveTo(w / 2 + w * 0.01, h * 0.5, w / 2, h * 0.12);
  ctx.stroke();
  if (!o.peeled) {
    silhouettePath(ctx, profile, w, h);
    ctx.lineWidth = Math.max(2, w * 0.03);
    ctx.strokeStyle = '#c98a40';
    ctx.stroke();
  }
  sheen(ctx, w * 0.35, h * 0.4, w * 0.2, h * 0.1, 0.18);
}

// =============================================================================================
// GARLIC (round, peelable -> cloves)

const GARLIC = colors('garlic');
const GARLIC_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0.003], [0.0085, 0.0008], [0.0165, 0.0022], [0.0232, 0.0072], [0.0272, 0.0158], [0.0276, 0.0242],
    [0.0252, 0.0322], [0.0195, 0.0398], [0.0125, 0.0458], [0.0062, 0.0502], [0.003, 0.0538], [0.0001, 0.0558],
  ],
  44,
);
const GARLIC_TOP = 0.0558;

function garlicSkinTex() {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#e8dcc4');
      g.addColorStop(0.15, '#f6f1e6');
      g.addColorStop(0.7, '#f3ece0');
      g.addColorStop(0.92, '#e9dccb');
      g.addColorStop(1, '#cdb48e');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const r = new Rng(23);
      for (let i = 0; i < 90; i++) {
        const x = r.next() * w, y0 = r.range(0.2, 0.6) * h, y1 = r.range(0.85, 1.0) * h;
        const purple = r.next() < 0.55;
        ctx.strokeStyle = rgba(purple ? '#b98aae' : '#cdbb9c', r.range(0.12, purple ? 0.4 : 0.3));
        ctx.lineWidth = r.range(0.6, 2.2);
        for (const dx of [-w, 0, w]) {
          ctx.beginPath();
          ctx.moveTo(x + dx, y0);
          ctx.quadraticCurveTo(x + dx + r.range(-3, 3), (y0 + y1) / 2, x + dx, y1);
          ctx.stroke();
        }
      }
      blotches(ctx, w, h, '#c99ac0', { n: 16, size: [0.04, 0.1], alpha: [0.08, 0.2], seed: 4, ys: 1.6, y: [0.55, 0.95] });
      blotches(ctx, w, h, '#ffffff', { n: 30, size: [0.04, 0.1], alpha: [0.2, 0.4], seed: 5, ys: 1.6 });
    },
    { key: 'veg/garlic/skin' },
  );
}

const garlicSkin = lazy(() =>
  foodMat({ color: '#ffffff', map: garlicSkinTex(), roughness: 0.5, sheen: 0.6, sheenColor: '#ffffff', sheenRoughness: 0.45, clearcoat: 0.2, clearcoatRoughness: 0.4, flesh: GARLIC.flesh, cookColor: GARLIC.cooked, name: 'garlic-skin' }),
);
const garlicCloveMat = lazy(() =>
  foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.25, flesh: GARLIC.flesh, cookColor: GARLIC.cooked }),
);
const garlicFlesh = lazy(() =>
  foodMat({ color: '#ffffff', map: fleshTex('veg/garlic/flesh', GARLIC.peeled ?? '#f4ecc8', '#fffbe6', '#e6d8a8'), roughness: 0.38, clearcoat: 0.3, flesh: GARLIC.flesh, cookColor: GARLIC.cooked }),
);

function garlicBulb(r: Rng): THREE.BufferGeometry {
  const g = lathe(GARLIC_PROFILE, 64);
  const n = r.int(7, 9), ph = r.range(0, TAU), s = r.range(0, 50);
  const amps = Array.from({ length: n }, () => r.range(0.75, 1.25));
  radial(g, (a, y, rad) => {
    const h = y / GARLIC_TOP;
    const aw = a + ph + 0.18 * Math.sin(2 * a + s);
    const local = (aw * n) / TAU;
    const k = ((Math.floor(local) % n) + n) % n;
    const c = Math.abs(Math.cos(Math.PI * (local - Math.floor(local) - 0.5)));
    const clove = Math.pow(c, 0.45);
    const depth = 0.12 * sstep(0.04, 0.3, h) * (1 - sstep(0.7, 0.95, h)) * amps[k];
    return rad * (1 - depth * (1 - clove)) * (1 + 0.025 * fbm3(Math.sin(a) * 2 + s, h * 2, Math.cos(a) * 2, 2));
  });
  return g;
}

function buildGarlic(r: Rng): THREE.Object3D {
  const body = mesh(garlicBulb(r), garlicSkin(), { skin: true });
  const ends = mesh(
    bulbEnds(r, GARLIC_TOP, { neckLen: 0.012, neckR: 0.0022, strands: 2, roots: 14, rootLen: [0.003, 0.006], plateR: 0.006, neck: ['#efe6d6', '#cdb48e'], root: '#c8ad84' }),
    plantMat('garlic-ends', '#f0e6cc', { roughness: 0.6, sheen: 0.4 }),
  );
  return sitOnGround(group(body, ends));
}

/** One peeled clove: crescent wedge, flat base, pointed tip. Built along +Y (base at 0). */
function garlicClove(r: Rng, L: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 20, 18);
  const bend = r.range(0.12, 0.2) * L;
  deform(g, (p) => {
    const t = (p.y + 1) / 2; // 0 base .. 1 tip
    const prof = Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.94)), 0.75) * (1 - 0.35 * t * t);
    const back = p.z > 0 ? 1 : 0.55; // flatter inner side
    const narrow = 1 - 0.38 * Math.max(0, -p.z);
    const x = p.x * prof * L * 0.27 * narrow;
    const z = p.z * prof * L * 0.24 * back;
    p.set(x, t * L, z + bend * Math.sin(Math.PI * t) - bend * 0.5);
  });
  const base = stops([[0, '#d6be8e'], [0.07, '#efe2b8'], [0.2, '#f6eecb'], [0.85, '#f4ecc6'], [1, '#e6e2a8']]);
  paintVertices(g, (p) => ramp(base, p.y / L));
  return g;
}

function buildGarlicPeeled(r: Rng): THREE.Object3D {
  const n = 3;
  const meshes: THREE.Object3D[] = [];
  for (let i = 0; i < n; i++) {
    const L = r.range(0.022, 0.027);
    const g = garlicClove(r, L);
    // lie on the curved back, fanned out
    const m = mesh(g, garlicCloveMat());
    m.rotation.set(Math.PI / 2 + r.range(-0.15, 0.15), 0, 0);
    const holder = new THREE.Group();
    holder.add(m);
    holder.rotation.y = (i / n) * TAU * 0.8 + r.range(-0.3, 0.3);
    holder.position.set(Math.sin(i * 2.1) * 0.006, 0, Math.cos(i * 2.1) * 0.006);
    meshes.push(holder);
  }
  // settle each clove on the ground
  const root = new THREE.Group();
  for (const m of meshes) {
    root.add(m);
    m.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(m);
    m.position.y -= b.min.y;
  }
  return sitOnGround(root);
}

function garlicSection(ctx: Ctx, s: number, o: SectionOpts) {
  const R = s / 2, r = new Rng(14);
  ctx.fillStyle = '#efe6d8';
  ctx.fillRect(0, 0, s, s);
  const n = 8;
  for (let k = 0; k < n; k++) {
    const ac = (k / n) * TAU + r.range(-0.08, 0.08), half = (Math.PI / n) * 0.86;
    polarBlob(ctx, R, R, ac, half, R * 0.2, R * 0.9, 3);
    const cx = R + Math.cos(ac) * R * 0.55, cy = R + Math.sin(ac) * R * 0.55;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.4);
    g.addColorStop(0, '#fbf6dc');
    g.addColorStop(1, '#f2e8c4');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = Math.max(1, s * 0.01);
    ctx.strokeStyle = 'rgba(220,206,180,0.95)';
    ctx.stroke();
  }
  circle(ctx, R, R, R * 0.12);
  ctx.fillStyle = '#e8dcbf';
  ctx.fill();
  if (!o.peeled) ringStroke(ctx, R, R, R - s * 0.015, s * 0.03, '#f6f1e6');
  sheen(ctx, R * 0.7, R * 0.62, R * 0.3, R * 0.15, 0.2);
}

function garlicSectionV(ctx: Ctx, w: number, h: number, o: SectionOpts) {
  ctx.fillStyle = '#efe6d8';
  ctx.fillRect(0, 0, w, h);
  for (const side of [-1, 1]) {
    const cx = w / 2 + side * w * 0.25;
    ctx.beginPath();
    ctx.moveTo(cx - side * w * 0.17, h * 0.88);
    ctx.bezierCurveTo(cx + side * w * 0.3, h * 0.92, cx + side * w * 0.22, h * 0.25, w / 2 + side * w * 0.03, h * 0.08);
    ctx.bezierCurveTo(cx - side * w * 0.1, h * 0.35, cx - side * w * 0.2, h * 0.6, cx - side * w * 0.17, h * 0.88);
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, '#e8d8ac');
    g.addColorStop(0.15, '#f8f1d6');
    g.addColorStop(1, '#f4ebc4');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = Math.max(1, w * 0.012);
    ctx.strokeStyle = 'rgba(220,206,180,0.95)';
    ctx.stroke();
  }
  ctx.fillStyle = '#dccaa0';
  ctx.fillRect(w * 0.47, h * 0.3, w * 0.06, h * 0.62);
  ctx.fillStyle = '#cdb48e';
  ctx.fillRect(w * 0.3, h * 0.9, w * 0.4, h * 0.1);
  if (!o.peeled) {
    silhouettePath(ctx, GARLIC_PROFILE, w, h);
    ctx.lineWidth = Math.max(2, w * 0.03);
    ctx.strokeStyle = '#f6f1e6';
    ctx.stroke();
  }
}

// =============================================================================================
// BROCCOLI (bunch): pale stem, branches, florets made of clustered bumpy domes

const BROCCOLI = colors('broccoli');

function budTex() {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#c8d8b0';
      ctx.fillRect(0, 0, w, h);
      const r = new Rng(77);
      for (let i = 0; i < 900; i++) {
        const x = r.next() * w, y = r.next() * h, s = r.range(3, 6.5);
        for (const dx of [-w, 0, w])
          for (const dy of [-h, 0, h]) {
            if (x + dx < -s || x + dx > w + s || y + dy < -s || y + dy > h + s) continue;
            const g = ctx.createRadialGradient(x + dx - s * 0.3, y + dy - s * 0.3, 0, x + dx, y + dy, s);
            g.addColorStop(0, '#ffffff');
            g.addColorStop(0.55, '#e4ecd6');
            g.addColorStop(1, '#7e9470');
            ctx.fillStyle = g;
            circle(ctx, x + dx, y + dy, s);
            ctx.fill();
          }
      }
    },
    { key: 'veg/broccoli/buds', wrap: true },
  );
}

function budBumpTex() {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#202020';
      ctx.fillRect(0, 0, w, h);
      const r = new Rng(77);
      for (let i = 0; i < 900; i++) {
        const x = r.next() * w, y = r.next() * h, s = r.range(3, 6.5);
        for (const dx of [-w, 0, w])
          for (const dy of [-h, 0, h]) {
            if (x + dx < -s || x + dx > w + s || y + dy < -s || y + dy > h + s) continue;
            const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, s);
            g.addColorStop(0, '#ffffff');
            g.addColorStop(1, '#303030');
            ctx.fillStyle = g;
            circle(ctx, x + dx, y + dy, s);
            ctx.fill();
          }
      }
    },
    { key: 'veg/broccoli/budbump', srgb: false, wrap: true },
  );
}

const broccoliHeadMat = lazy(() =>
  foodMat({ color: '#ffffff', map: budTex(), bumpMap: budBumpTex(), bumpScale: 1.5, vertexColors: true, roughness: 0.7, flesh: BROCCOLI.flesh, cookColor: BROCCOLI.cooked, name: 'broccoli-head' }),
);
const broccoliSkin = lazy(() =>
  foodMat({ color: BROCCOLI.skin, map: budTex(), bumpMap: budBumpTex(), bumpScale: 1.5, roughness: 0.7, flesh: BROCCOLI.flesh, cookColor: BROCCOLI.cooked }),
);
const broccoliFlesh = lazy(() =>
  foodMat({ color: '#ffffff', map: fleshTex('veg/broccoli/flesh', BROCCOLI.flesh, '#c4dc96', '#6ea044'), roughness: 0.6, flesh: BROCCOLI.flesh, cookColor: BROCCOLI.cooked }),
);

function stalkTex() {
  return canvasTexture(
    128,
    256,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, '#e2ebbf');
      g.addColorStop(0.05, '#dfe8b8');
      g.addColorStop(0.08, '#a9c97a');
      g.addColorStop(0.6, '#9cc26c');
      g.addColorStop(1, '#86b45a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h * 0.94);
      ctx.fillStyle = '#e2ebc0';
      ctx.fillRect(0, h * 0.94, w, h * 0.06);
      const r = new Rng(3);
      for (let i = 0; i < 40; i++) {
        const x = r.next() * w;
        ctx.strokeStyle = rgba(r.next() < 0.5 ? '#c8dea0' : '#7aa64e', r.range(0.2, 0.45));
        ctx.lineWidth = r.range(0.8, 2.2);
        ctx.beginPath();
        ctx.moveTo(x, h * 0.93);
        ctx.lineTo(x + r.range(-3, 3), r.range(0, 0.4) * h);
        ctx.stroke();
      }
    },
    { key: 'veg/broccoli/stalk' },
  );
}
const broccoliStalkMat = lazy(() =>
  foodMat({ color: '#ffffff', map: stalkTex(), roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.4, flesh: '#c9df9a', cookColor: BROCCOLI.cooked, cookAmount: 0.6 }),
);
const broccoliBranchMat = () => plantMat('broccoli-branch', '#c9df9a', { roughness: 0.5 });

/** One floret head: a dome of clustered bumps, axis +Y, base at the origin. */
function floretHead(r: Rng, R: number, detail: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const K = r.int(9, 12);
  const bumps: { c: THREE.Vector3; a: number }[] = [];
  const cosMax = Math.cos(1.75);
  for (let k = 0; k < K; k++) {
    const ct = 1 - ((k + 0.5) / K) * (1 - cosMax);
    const th = Math.acos(ct) + r.range(-0.1, 0.1);
    const ph = k * 2.399963 + r.range(-0.3, 0.3);
    bumps.push({ c: V(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)), a: r.range(0.48, 0.66) });
  }
  const bumpAt = (v: THREE.Vector3) => {
    let b = 0, b2 = 0;
    for (const { c, a } of bumps) {
      const d = v.distanceTo(c) / a;
      if (d < 1) {
        const h = Math.sqrt(1 - d * d);
        if (h > b) {
          b2 = b;
          b = h;
        } else if (h > b2) b2 = h;
      }
    }
    return [b, b2];
  };
  const tmp = V();
  deform(g, (p) => {
    tmp.copy(p).normalize();
    const [b] = bumpAt(tmp);
    const under = sstep(0.15, -0.75, tmp.y); // 0 top .. 1 underside
    const rad = R * (0.8 + 0.2 * b) * (1 - 0.12 * under);
    p.copy(tmp).multiplyScalar(rad);
    p.y = p.y * (1 - 0.35 * under) + R * 0.55;
  });
  // planar UVs from above (dense bud texture)
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) / R) * 0.9 + 0.5;
    uv[i * 2 + 1] = (pos.getZ(i) / R) * 0.9 + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const dark = lin('#285e1d'), mid = lin('#3f8a2e'), top = lin('#62a83e'), yel = lin('#86b04a'), pale = lin('#9cc46a');
  const tint = r.range(-0.08, 0.08);
  paintVertices(g, (p) => {
    tmp.copy(p).setY(p.y - R * 0.55).normalize();
    const [b] = bumpAt(tmp);
    const c = b < 0.35 ? dark.clone().lerp(mid, b / 0.35) : mid.clone().lerp(top, (b - 0.35) / 0.65);
    if (b > 0.8) c.lerp(yel, (b - 0.8) * 1.2 + tint);
    return c.lerp(pale, sstep(0.0, -0.8, tmp.y));
  });
  return g;
}

interface Floret {
  head: THREE.BufferGeometry;
  branch: THREE.BufferGeometry;
}

/** A floret on its branch: branch from `from` to the head base at `at`, head axis `dir`. */
function floret(r: Rng, from: THREE.Vector3, at: THREE.Vector3, dir: THREE.Vector3, R: number, detail: number, branchR: number): Floret {
  const head = floretHead(r, R, detail);
  head.applyMatrix4(frame(at, dir).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
  const mid = from.clone().lerp(at, 0.5).addScaledVector(dir, -R * 0.15);
  const end = at.clone().addScaledVector(dir, R * 0.35);
  const pts: V3[] = [from.toArray() as V3, mid.toArray() as V3, end.toArray() as V3];
  const branch = tube(pts, (t) => branchR * (1.15 - 0.3 * t), { radialSegments: 7, tubularSegments: 8, caps: 'none' });
  gradeAlong(branch, pts[0], pts[2], stops([[0, '#a3c674'], [1, '#8cb85e']]));
  return { head, branch };
}

function buildBroccoli(r: Rng): THREE.Object3D {
  const trunkH = r.range(0.046, 0.054);
  const trunkProfile: Profile = smoothProfile(
    [
      [0.0001, 0], [0.0118, 0], [0.0124, 0.002], [0.0112, trunkH * 0.45], [0.0118, trunkH * 0.8], [0.0145, trunkH], [0.0001, trunkH + 0.004],
    ],
    16,
  );
  const trunk = lathe(trunkProfile, 22);
  const heads: THREE.BufferGeometry[] = [], branches: THREE.BufferGeometry[] = [];
  const C0 = V(0, trunkH + 0.026, 0);
  const add = (polar: number, az: number, R: number, detail: number, reach: number) => {
    const dir = V(Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az));
    const at = C0.clone().addScaledVector(dir, reach);
    const from = V(Math.sin(az) * 0.006 * Math.sin(polar) * 1.5, trunkH - 0.002, Math.cos(az) * 0.006 * Math.sin(polar) * 1.5);
    const f = floret(r, from, at, dir, R, detail, 0.0048 * (R / 0.024));
    heads.push(f.head);
    branches.push(f.branch);
  };
  add(r.range(0, 0.12), r.range(0, TAU), r.range(0.025, 0.028), 5, 0.012);
  const n1 = r.int(5, 6), ph1 = r.range(0, TAU);
  for (let i = 0; i < n1; i++) add(r.range(0.6, 0.72), ph1 + (i / n1) * TAU + r.range(-0.15, 0.15), r.range(0.021, 0.025), 5, r.range(0.016, 0.02));
  const n2 = r.int(3, 4);
  for (let i = 0; i < n2; i++) add(r.range(1.1, 1.25), ph1 + ((i + 0.5) / n2) * TAU + r.range(-0.3, 0.3), r.range(0.015, 0.018), 4, r.range(0.015, 0.018));
  return sitOnGround(
    group(mesh(trunk, broccoliStalkMat()), mesh(merge(branches), broccoliBranchMat()), mesh(merge(heads), broccoliHeadMat())),
  );
}

function broccoliPiece(r: Rng): THREE.Object3D {
  const R = r.range(0.016, 0.02);
  const tilt = r.range(-0.25, 0.25);
  const dir = V(Math.sin(tilt), Math.cos(tilt), 0);
  const base = V(0, 0, 0), at = V(Math.sin(tilt) * 0.022, 0.024, 0);
  const f = floret(r, base, at, dir, R, 5, 0.0045);
  const stalk = tube([[0, -0.004, 0], [0, 0.004, 0], [Math.sin(tilt) * 0.006, 0.012, 0]], 0.0052, { radialSegments: 9, tubularSegments: 6, caps: 'flat' });
  gradeAlong(stalk, [0, -0.004, 0], [0, 0.012, 0], stops([[0, '#dfe8b8'], [0.12, '#b6d084'], [1, '#9cc26c']]));
  return sitOnGround(group(mesh(merge([f.branch, stalk]), broccoliBranchMat()), mesh(f.head, broccoliHeadMat())));
}

function broccoliSection(ctx: Ctx, s: number) {
  const R = s / 2;
  radialFill(ctx, s, [[0, '#d9e8b0'], [0.6, '#c4dc96'], [0.9, '#a8cc78'], [1, '#86b45a']]);
  softSpot(ctx, R, R, R * 0.5, R * 0.5, '#e8f0c8', 0.5);
  dots(ctx, s, s, '#b8d488', { n: 30, size: [0.01, 0.02], alpha: [0.3, 0.6], seed: 2 });
}

// =============================================================================================
// CUCUMBER (long, peelable)

const CUCUMBER = colors('cucumber');
const CUKE_L = 0.215;
const CUKE_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0], [0.0095, 0.0018], [0.0158, 0.0072], [0.0198, 0.017], [0.0218, 0.033], [0.0225, 0.06], [0.0226, 0.11],
    [0.0222, 0.15], [0.0206, 0.18], [0.0175, 0.198], [0.012, 0.209], [0.0062, 0.2135], [0.0001, CUKE_L],
  ],
  64,
);

/** Cucumber skin. Canvas bottom = blossom end (x = 0), top = stem end. */
function cucumberTex(peeled: boolean) {
  return canvasTexture(
    256,
    512,
    (ctx, w, h) => {
      const r = new Rng(peeled ? 61 : 60);
      if (!peeled) {
        const g = ctx.createLinearGradient(0, h, 0, 0);
        g.addColorStop(0, '#9aa84a');
        g.addColorStop(0.03, '#5d9036');
        g.addColorStop(0.2, '#3f7d2c');
        g.addColorStop(0.7, '#357028');
        g.addColorStop(0.97, '#2c6222');
        g.addColorStop(1, '#5a7a32');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        // pale stripes from the blossom end
        for (let i = 0; i < 9; i++) {
          const x = ((i + r.range(-0.2, 0.2)) / 9) * w, len = r.range(0.45, 0.9) * h, wd = r.range(6, 13);
          const sg = ctx.createLinearGradient(0, h, 0, h - len);
          sg.addColorStop(0, rgba('#a8cc6a', 0.75));
          sg.addColorStop(0.6, rgba('#8fbc58', 0.4));
          sg.addColorStop(1, rgba('#8fbc58', 0));
          ctx.fillStyle = sg;
          for (const dx of [-w, 0, w]) {
            ctx.beginPath();
            ctx.ellipse(x + dx, h - len / 2, wd / 2, len / 2, 0, 0, TAU);
            ctx.fill();
          }
        }
        blotches(ctx, w, h, '#2a5a1c', { n: 60, size: [0.02, 0.06], alpha: [0.15, 0.3], seed: 3, ys: 1.3 });
        blotches(ctx, w, h, '#78a848', { n: 40, size: [0.015, 0.045], alpha: [0.1, 0.25], seed: 4, ys: 1.3 });
        // warts: pale dots with a darker rim
        for (let i = 0; i < 170; i++) {
          const x = r.next() * w, y = r.range(0.04, 0.96) * h, s = r.range(1.6, 3);
          for (const dx of [-w, 0, w]) {
            ctx.fillStyle = rgba('#244f18', 0.5);
            ellipse(ctx, x + dx, y + 0.8, s * 1.4, s * 1.2);
            ctx.fill();
            ctx.fillStyle = rgba('#d8ecb0', 0.85);
            ellipse(ctx, x + dx, y, s * 0.75, s * 0.65);
            ctx.fill();
          }
        }
      } else {
        const g = ctx.createLinearGradient(0, h, 0, 0);
        g.addColorStop(0, '#d2e6a0');
        g.addColorStop(0.5, '#c2e092');
        g.addColorStop(1, '#b3d683');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 18; i++) {
          const x = r.next() * w, y = r.range(0.1, 0.9) * h, len = r.range(0.15, 0.5) * h, wd = r.range(5, 14);
          ctx.fillStyle = rgba('#6f9e46', r.range(0.25, 0.55));
          for (const dx of [-w, 0, w]) {
            ctx.beginPath();
            ctx.ellipse(x + dx, y, wd / 2, len / 2, 0, 0, TAU);
            ctx.fill();
          }
        }
        blotches(ctx, w, h, '#e4f2c0', { n: 50, size: [0.03, 0.08], alpha: [0.2, 0.4], seed: 5, ys: 1.3 });
      }
    },
    { key: peeled ? 'veg/cucumber/peeled' : 'veg/cucumber/skin' },
  );
}

function cucumberBumpTex() {
  return canvasTexture(
    256,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#606060';
      ctx.fillRect(0, 0, w, h);
      const r = new Rng(60);
      // replay the same random stream as the colour texture's wart loop
      for (let i = 0; i < 9; i++) r.range(-0.2, 0.2), r.range(0.45, 0.9), r.range(6, 13);
      for (let i = 0; i < 170; i++) {
        const x = r.next() * w, y = r.range(0.04, 0.96) * h, s = r.range(1.6, 3);
        for (const dx of [-w, 0, w]) {
          const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, s * 1.6);
          g.addColorStop(0, '#ffffff');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x + dx - s * 2, y - s * 2, s * 4, s * 4);
        }
      }
    },
    { key: 'veg/cucumber/bump', srgb: false },
  );
}

const cucumberSkin = lazy(() =>
  foodMat({ color: '#ffffff', map: cucumberTex(false), bumpMap: cucumberBumpTex(), bumpScale: 1.4, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.3, flesh: CUCUMBER.flesh, cookColor: CUCUMBER.cooked, name: 'cucumber-skin' }),
);
const cucumberPeeled = lazy(() =>
  foodMat({ color: '#ffffff', map: cucumberTex(true), roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.25, flesh: CUCUMBER.flesh, cookColor: CUCUMBER.cooked }),
);
const cucumberFlesh = lazy(() =>
  foodMat({
    color: '#ffffff',
    map: fleshTex('veg/cucumber/flesh', '#d4ebac', '#eef7d6', '#b8d88a', (ctx, w, h) =>
      dots(ctx, w, h, '#f4f8e4', { n: 12, size: [0.02, 0.035], alpha: [0.7, 0.95], seed: 6, ys: 0.55 }),
    ),
    roughness: 0.3,
    clearcoat: 0.4,
    flesh: CUCUMBER.flesh,
    cookColor: CUCUMBER.cooked,
  }),
);

function buildCucumber(r: Rng, peeled = false): THREE.Object3D {
  const g = lathe(CUKE_PROFILE, 40);
  const s = r.range(0, 50), ridges = 9, ph = r.range(0, TAU);
  const bendX = r.range(-0.006, 0.006), bendZ = r.range(-0.018, 0.018);
  deform(g, (p) => {
    const t = p.y / CUKE_L;
    const a = Math.atan2(p.x, p.z);
    const k = 1 + (peeled ? 0.004 : 0.012) * Math.cos(ridges * a + ph) * Math.sin(Math.PI * t) + 0.03 * fbm3(p.x * 70 + s, p.y * 28, p.z * 70, 2);
    const b = 4 * t * (1 - t);
    p.x = p.x * k + bendX * b;
    p.z = p.z * k + bendZ * b;
  });
  toX(g);
  const body = mesh(g, peeled ? cucumberPeeled() : cucumberSkin(), { skin: !peeled });
  if (peeled) return sitOnGround(group(body));
  const pts: V3[] = [[CUKE_L - 0.003, 0, 0], [CUKE_L + 0.003, 0.0004, 0.0008], [CUKE_L + 0.008, 0.0012, r.range(-0.002, 0.002)]];
  const nub = tube(pts, (t) => 0.0034 * (1 - 0.35 * t), { radialSegments: 8, tubularSegments: 6, caps: 'flat' });
  gradeAlong(nub, pts[0], pts[2], stops([[0, '#5f8a36'], [0.7, '#8a9a4a'], [1, '#c8c088']]));
  return sitOnGround(group(body, mesh(nub, plantMat('cucumber-nub', '#c8d898'))));
}

function cucumberSection(ctx: Ctx, s: number, o: SectionOpts) {
  const R = s / 2, r = new Rng(19);
  radialFill(ctx, s, [[0, '#e2f2c4'], [0.5, '#d6ecb0'], [0.78, '#cfe8a4'], [0.88, '#bfe08e'], [0.94, '#a8d478'], [1, '#a8d478']]);
  // seed core: soft rounded triangle
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * TAU;
    const rr = R * (0.5 + 0.08 * Math.cos(3 * a));
    ctx.lineTo(R + Math.cos(a) * rr, R + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(196,224,150,0.8)';
  ctx.fill();
  ctx.lineWidth = s * 0.008;
  ctx.strokeStyle = 'rgba(232,244,206,0.9)';
  ctx.stroke();
  for (let k = 0; k < 3; k++) {
    const a0 = (k / 3) * TAU;
    for (const side of [-1, 1])
      for (let i = 0; i < 4; i++) {
        const a = a0 + side * 0.32 + r.range(-0.05, 0.05);
        const rr = R * (0.16 + i * 0.085);
        seed(ctx, R + Math.cos(a) * rr, R + Math.sin(a) * rr, s * 0.026, s * 0.012, a, '#f3f7e2', 'rgba(200,220,170,0.9)', 'rgba(236,246,214,0.6)');
      }
  }
  ctx.strokeStyle = 'rgba(232,244,206,0.9)';
  ctx.lineWidth = s * 0.01;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    ctx.beginPath();
    ctx.moveTo(R, R);
    ctx.lineTo(R + Math.cos(a) * R * 0.4, R + Math.sin(a) * R * 0.4);
    ctx.stroke();
  }
  if (!o.peeled) {
    ringStroke(ctx, R, R, R - s * 0.016, s * 0.032, '#2f6a22');
    ringStroke(ctx, R, R, R - s * 0.035, s * 0.008, 'rgba(90,150,60,0.6)');
  }
  sheen(ctx, R * 0.72, R * 0.62, R * 0.32, R * 0.16, 0.22);
}

// =============================================================================================
// LETTUCE (leafy): layered ruffled leaves around a pale heart

const LETTUCE = colors('lettuce');

function lettuceLeafTex() {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      // u across (x), v along: canvas bottom = base, top = tip
      const g = ctx.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, '#eef6cc');
      g.addColorStop(0.25, '#d2ec98');
      g.addColorStop(0.6, '#9dd25a');
      g.addColorStop(1, '#7cc045');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // darker, frilly outer edges
      const eg = ctx.createLinearGradient(0, 0, w, 0);
      eg.addColorStop(0, rgba('#5aa632', 0.75));
      eg.addColorStop(0.22, rgba('#5aa632', 0));
      eg.addColorStop(0.78, rgba('#5aa632', 0));
      eg.addColorStop(1, rgba('#5aa632', 0.75));
      ctx.fillStyle = eg;
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, '#b8e070', { n: 40, size: [0.04, 0.1], alpha: [0.15, 0.3], seed: 2 });
      // veins
      const r = new Rng(4);
      for (let i = 0; i < 9; i++) {
        const y = h * (0.92 - i * 0.1);
        for (const side of [-1, 1]) {
          ctx.strokeStyle = rgba('#eef8d0', 0.7);
          ctx.lineWidth = r.range(1.5, 3);
          ctx.beginPath();
          ctx.moveTo(w / 2, y);
          ctx.quadraticCurveTo(w / 2 + side * w * 0.2, y - h * 0.05, w / 2 + side * w * 0.48, y - h * r.range(0.12, 0.2));
          ctx.stroke();
        }
      }
      // midrib
      const mg = ctx.createLinearGradient(0, h, 0, 0);
      mg.addColorStop(0, '#f6faea');
      mg.addColorStop(1, 'rgba(240,248,214,0.4)');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.moveTo(w * 0.42, h);
      ctx.lineTo(w * 0.495, 0);
      ctx.lineTo(w * 0.505, 0);
      ctx.lineTo(w * 0.58, h);
      ctx.closePath();
      ctx.fill();
    },
    { key: 'veg/lettuce/leaf' },
  );
}

const lettuceLeafMat = lazy(() =>
  foodMat({ color: '#ffffff', map: lettuceLeafTex(), roughness: 0.45, clearcoat: 0.25, clearcoatRoughness: 0.35, flesh: LETTUCE.flesh, cookColor: LETTUCE.cooked, cookAmount: 0.6, name: 'lettuce-leaf' }),
);
const lettuceHeartMat = lazy(() =>
  foodMat({ color: '#ffffff', map: lettuceLeafTex(), roughness: 0.5, flesh: LETTUCE.flesh, cookColor: LETTUCE.cooked, cookAmount: 0.6 }),
);
const lettuceFlesh = lazy(() =>
  foodMat({ color: '#ffffff', map: fleshTex('veg/lettuce/flesh', LETTUCE.flesh, '#eef6cc', '#8cc84a'), roughness: 0.45, flesh: LETTUCE.flesh, cookColor: LETTUCE.cooked, cookAmount: 0.6 }),
);

const lettuceOutline = (seed: number) => (t: number) =>
  Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 1.45))), 0.55) * (0.3 + 0.7 * sstep(0, 0.35, t)) * (1 + 0.07 * Math.sin(t * 34 + seed));

function lettuceLeaf(r: Rng, L: number, W: number, curl: number, ruffle: number): THREE.BufferGeometry {
  return leafGeom({ length: L, width: W, outline: lettuceOutline(r.range(0, 9)), cup: r.range(-0.25, -0.12), curl, ruffle, ruffleFreq: r.range(30, 40), segL: 16, segW: 12, seed: r.range(0, 9) });
}

function buildLettuce(r: Rng): THREE.Object3D {
  const leaves: THREE.BufferGeometry[] = [];
  const whorls = [
    { n: 5, L: [0.07, 0.08], W: [0.07, 0.08], beta: [0.12, 0.22], curl: [-1.7, -1.3], ruffle: 0.0025, r0: 0.008, y0: 0.012 },
    { n: 6, L: [0.088, 0.098], W: [0.088, 0.1], beta: [0.38, 0.5], curl: [-1.25, -0.95], ruffle: 0.0045, r0: 0.014, y0: 0.008 },
    { n: 7, L: [0.095, 0.108], W: [0.1, 0.115], beta: [0.75, 0.95], curl: [-0.75, -0.45], ruffle: 0.006, r0: 0.02, y0: 0.006 },
  ];
  let az0 = r.range(0, TAU);
  for (const wh of whorls) {
    for (let i = 0; i < wh.n; i++) {
      const az = az0 + (i / wh.n) * TAU + r.range(-0.2, 0.2);
      const out = V(Math.sin(az), 0, Math.cos(az));
      const beta = r.range(wh.beta[0], wh.beta[1]);
      const dir = out.clone().multiplyScalar(Math.sin(beta)).add(V(0, Math.cos(beta), 0));
      const at = out.clone().multiplyScalar(wh.r0).add(V(0, wh.y0, 0));
      const leaf = lettuceLeaf(r, r.range(wh.L[0], wh.L[1]), r.range(wh.W[0], wh.W[1]), r.range(wh.curl[0], wh.curl[1]), wh.ruffle);
      leaves.push(placed(leaf, frame(at, dir, out, r.range(-0.12, 0.12))));
    }
    az0 += Math.PI / wh.n;
  }
  const heart = blobGeometry(0.036, { detail: 5, amp: 0.002, seed: r.range(0, 9), scale: [1, 1.05, 1] });
  heart.translate(0, 0.042, 0);
  return sitOnGround(group(mesh(heart, lettuceHeartMat()), mesh(merge(leaves), lettuceLeafMat())));
}

function lettucePiece(r: Rng): THREE.Object3D {
  const g = leafGeom({ length: r.range(0.1, 0.12), width: r.range(0.09, 0.11), outline: lettuceOutline(r.range(0, 9)), cup: 0.12, curl: r.range(0.15, 0.35), ruffle: 0.005, ruffleFreq: 36, segL: 16, segW: 12, seed: r.range(0, 9) });
  g.translate(0, 0, -0.05);
  g.rotateY(r.range(0, TAU));
  return sitOnGround(mesh(g, lettuceLeafMat()));
}

/** Pile of thin curly strips (lettuce / basil chiffonade). */
function shreds(r: Rng, n: number, pileR: number, len: [number, number], width: [number, number], palette: string[], mat: Mat): THREE.Object3D {
  const parts: THREE.BufferGeometry[] = [];
  const pal = palette.map(lin);
  for (let i = 0; i < n; i++) {
    const [dx, dz] = r.disc();
    const h = (1 - Math.hypot(dx, dz)) * pileR * 0.55 + r.range(0, pileR * 0.12);
    const c = V(dx * pileR, h + 0.002, dz * pileR);
    const L = r.range(len[0], len[1]);
    const az = r.range(0, TAU), curl = r.range(1.4, 3.6) * r.sign(), rise = r.range(-0.25, 0.25);
    const rc = L / Math.abs(curl);
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const a = az + curl * (t - 0.5);
      pts.push(c.clone().add(V((Math.sin(a) - Math.sin(az)) * rc, rise * (t - 0.5) * L + Math.sin(t * 6 + i) * 0.0015, (Math.cos(a) - Math.cos(az)) * rc)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const w = r.range(width[0], width[1]);
    const g = ribbonGeom(curve, (t) => w * (0.6 + 0.4 * Math.sin(Math.PI * t)), 14, r.range(-2, 2));
    const col = pal[r.int(0, pal.length - 1)].clone().lerp(pal[0], r.range(0, 0.3));
    paintUV(g, (u) => col.clone().multiplyScalar(1 - 0.12 * Math.abs(u - 0.5) * 2));
    parts.push(g);
  }
  return sitOnGround(mesh(merge(parts), mat));
}

const shredMats = new Map<string, Mat>();
function shredMat(id: string, roughness: number): Mat {
  let m = shredMats.get(id);
  if (!m) {
    const c = colors(id);
    shredMats.set(id, (m = foodMat({ color: '#ffffff', vertexColors: true, roughness, clearcoat: 0.3, clearcoatRoughness: 0.3, flesh: c.flesh, cookColor: c.cooked, cookAmount: 0.6 })));
  }
  return m;
}

// =============================================================================================
// BELL PEPPER (round): four glossy lobes, thick green stem

const PEPPER = colors('bell-pepper');
const PEPPER_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0.0062], [0.012, 0.0026], [0.027, 0.0028], [0.0398, 0.0115], [0.0472, 0.028], [0.0496, 0.047], [0.0494, 0.065],
    [0.0468, 0.079], [0.0405, 0.0885], [0.0302, 0.0935], [0.0198, 0.0925], [0.0118, 0.0868], [0.0001, 0.0835],
  ],
  44,
);
const PEPPER_TOP = 0.0935;
const pepperPath = new ProfilePath(PEPPER_PROFILE);

function pepperTex() {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#d23a24');
      g.addColorStop(0.1, '#e4402c');
      g.addColorStop(0.5, '#e5392b');
      g.addColorStop(0.9, '#d63026');
      g.addColorStop(1, '#c42a20');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // creases (lathe angle a = pi/4 + k pi/2 -> u = 0.125 + k/4)
      for (let k = 0; k < 4; k++) {
        const x = (0.125 + k / 4) * w;
        const cg = ctx.createLinearGradient(x - 16, 0, x + 16, 0);
        cg.addColorStop(0, rgba('#a8201a', 0));
        cg.addColorStop(0.5, rgba('#a8201a', 0.45));
        cg.addColorStop(1, rgba('#a8201a', 0));
        ctx.fillStyle = cg;
        ctx.fillRect(x - 16, 0, 32, h);
        const lx = (k / 4) * w;
        for (const dx of [0, w]) softSpot(ctx, lx + dx, h * 0.5, w * 0.06, h * 0.4, '#f25a40', 0.25);
      }
      blotches(ctx, w, h, '#b82018', { n: 30, size: [0.02, 0.05], alpha: [0.05, 0.12], seed: 3, ys: 2 });
      blotches(ctx, w, h, '#f26a4a', { n: 30, size: [0.02, 0.05], alpha: [0.05, 0.12], seed: 4, ys: 2 });
    },
    { key: 'veg/pepper/skin' },
  );
}

const pepperSkin = lazy(() =>
  foodMat({ color: '#ffffff', map: pepperTex(), roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06, flesh: PEPPER.flesh, cookColor: PEPPER.cooked, name: 'pepper-skin' }),
);
const pepperInner = lazy(() =>
  foodMat({ color: '#f26a4c', roughness: 0.35, clearcoat: 0.4, clearcoatRoughness: 0.3, flesh: PEPPER.flesh, cookColor: PEPPER.cooked }),
);
const pepperFlesh = lazy(() =>
  foodMat({ color: '#ffffff', map: fleshTex('veg/pepper/flesh', PEPPER.flesh, '#f8907a', '#d84a32'), roughness: 0.32, clearcoat: 0.5, flesh: PEPPER.flesh, cookColor: PEPPER.cooked }),
);

function pepperShape(amps: number[], s: number) {
  return (a: number, y: number, rad: number) => {
    const h = y / PEPPER_TOP;
    const c = Math.cos(2 * a);
    const f = Math.sqrt(c * c + 0.025);
    let wa = 0, ws = 0;
    for (let k = 0; k < 4; k++) {
      const wk = Math.pow(Math.max(0, Math.cos(a - (k * Math.PI) / 2)), 2);
      wa += amps[k] * wk;
      ws += wk;
    }
    const am = (0.075 + 0.07 * (1 - sstep(0.0, 0.4, h)) + 0.035 * sstep(0.72, 0.95, h)) * (wa / ws);
    const n = fbm3(Math.sin(a) * 1.4 + s, h * 1.6, Math.cos(a) * 1.4, 2);
    return rad * (1 + am * (f - 0.62) + 0.02 * n);
  };
}

function pepperBody(r: Rng): { g: THREE.BufferGeometry; shape: (a: number, y: number, rad: number) => number } {
  const g = lathe(PEPPER_PROFILE, 60);
  const amps = [0, 1, 2, 3].map(() => r.range(0.8, 1.2));
  const shape = pepperShape(amps, r.range(0, 50));
  deform(g, (p) => {
    const rad = Math.hypot(p.x, p.z);
    if (rad < 1e-7) return;
    const a = Math.atan2(p.x, p.z);
    const k = shape(a, p.y, rad) / rad;
    const h = p.y / PEPPER_TOP;
    const c = Math.cos(2 * a);
    const crease = 1 - Math.sqrt(c * c + 0.025);
    // four feet at the bottom
    p.y += crease * 0.0085 * (1 - sstep(0.0, 0.3, h)) * sstep(0.004, 0.025, rad);
    p.x *= k;
    p.z *= k;
  });
  return { g, shape };
}

function buildPepper(r: Rng): THREE.Object3D {
  const { g, shape } = pepperBody(r);
  const body = mesh(g, pepperSkin());
  const tips = 5;
  const star = drapedStar(pepperPath, {
    points: tips,
    inner: 0.0075,
    tips: Array.from({ length: tips }, () => r.range(0.0125, 0.016)),
    sharp: 1.6,
    phase: r.range(0, TAU),
    offset: 0.0009,
    lift: Array.from({ length: tips }, () => r.range(0.0005, 0.0015)),
    twist: 0.2,
    shape,
    rings: 7,
    segs: 60,
  });
  paintUV(star, (_u, v) => ramp(stops([[0, '#2f6a22'], [0.7, '#3f7d2a'], [1, '#4a8a30']]), v));
  const ang = r.range(0, TAU), bend = r.range(0.004, 0.008);
  const y0 = 0.0835 - 0.003, L = r.range(0.016, 0.02);
  const pts: V3[] = [
    [0, y0, 0],
    [0, y0 + L * 0.4, 0],
    [Math.sin(ang) * bend * 0.6, y0 + L * 0.8, Math.cos(ang) * bend * 0.6],
    [Math.sin(ang) * bend * 1.4, y0 + L * 1.02, Math.cos(ang) * bend * 1.4],
  ];
  const stem = tube(pts, (t) => 0.0052 * (1 + 0.9 * Math.pow(1 - sstep(0, 0.3, t), 2)) * (1 - 0.1 * t), { radialSegments: 12, tubularSegments: 14, caps: 'flat', shape: (an) => 1 + 0.06 * Math.cos(5 * an) });
  gradeAlong(stem, pts[0], pts[3], stops([[0, '#356f25'], [0.85, '#4a8530'], [0.97, '#7a9a4a'], [1, '#c8cf9a']]));
  const gm = plantMat('pepper-stem', '#b8d08a', { roughness: 0.3, clearcoat: 0.8 });
  const root = group(body, mesh(star, gm), mesh(stem, gm));
  root.rotation.y = r.range(0, TAU);
  return sitOnGround(root);
}

function pepperSection(ctx: Ctx, s: number, o: SectionOpts) {
  const R = s / 2, r = new Rng(27);
  ctx.fillStyle = '#e8402e';
  ctx.fillRect(0, 0, s, s);
  const wall = R * 0.16;
  // hollow interior
  ctx.beginPath();
  for (let i = 0; i <= 80; i++) {
    const a = (i / 80) * TAU;
    const c = Math.cos(2 * a + 0.4);
    const rr = (R - wall) * (1 - 0.07 * (1 - Math.sqrt(c * c + 0.02)));
    ctx.lineTo(R + Math.cos(a) * rr, R + Math.sin(a) * rr);
  }
  ctx.closePath();
  const hg = ctx.createRadialGradient(R, R, 0, R, R, R - wall);
  hg.addColorStop(0, '#5a1410');
  hg.addColorStop(0.75, '#7a1c14');
  hg.addColorStop(1, '#b0301f');
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.lineWidth = s * 0.014;
  ctx.strokeStyle = '#f47a5c';
  ctx.stroke();
  // pith ribs + seeds
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 4 - 0.2;
    ctx.strokeStyle = '#f6e4d0';
    ctx.lineWidth = s * 0.03;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(R + Math.cos(a) * (R - wall), R + Math.sin(a) * (R - wall));
    ctx.quadraticCurveTo(R + Math.cos(a + 0.2) * R * 0.5, R + Math.sin(a + 0.2) * R * 0.5, R + Math.cos(a) * R * 0.32, R + Math.sin(a) * R * 0.32);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const aa = a + r.range(-0.35, 0.35), rr = R * r.range(0.25, 0.5);
      seed(ctx, R + Math.cos(aa) * rr, R + Math.sin(aa) * rr, s * 0.03, s * 0.022, r.range(0, TAU), '#f6e2b2', 'rgba(210,170,110,0.9)');
    }
  }
  if (!o.peeled) ringStroke(ctx, R, R, R - s * 0.008, s * 0.016, '#c22a1e');
  sheen(ctx, R * 0.6, R * 0.35, R * 0.25, R * 0.08, 0.25);
}

function pepperSectionV(ctx: Ctx, w: number, h: number, o: SectionOpts) {
  const r = new Rng(28);
  ctx.fillStyle = '#e8402e';
  ctx.fillRect(0, 0, w, h);
  // cavity: the silhouette shrunk inwards
  ctx.save();
  ctx.translate(w / 2, h * 0.52);
  ctx.scale(0.8, 0.8);
  ctx.translate(-w / 2, -h * 0.52);
  silhouettePath(ctx, PEPPER_PROFILE, w, h);
  const hg = ctx.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, w * 0.5);
  hg.addColorStop(0, '#5a1410');
  hg.addColorStop(0.8, '#7a1c14');
  hg.addColorStop(1, '#a52c1c');
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.lineWidth = w * 0.016;
  ctx.strokeStyle = '#f47a5c';
  ctx.stroke();
  ctx.restore();
  // placenta with seeds hanging from the top
  ctx.fillStyle = '#f6e6d2';
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.3, w * 0.12, h * 0.13, 0, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 16; i++) {
    const a = r.range(0, TAU), d = r.range(0.4, 1);
    seed(ctx, w / 2 + Math.cos(a) * w * 0.12 * d, h * 0.3 + Math.sin(a) * h * 0.13 * d + h * 0.02, w * 0.024, h * 0.018, a, '#f6e2b2', 'rgba(210,170,110,0.9)');
  }
  ctx.fillStyle = '#4a8530';
  ctx.fillRect(w * 0.46, 0, w * 0.08, h * 0.16);
  if (!o.peeled) {
    silhouettePath(ctx, PEPPER_PROFILE, w, h);
    ctx.lineWidth = Math.max(2, w * 0.025);
    ctx.strokeStyle = '#c22a1e';
    ctx.stroke();
  }
}

// =============================================================================================
// CHILI (long): slender glossy hooked pod with a green cap

const CHILI = colors('chili');
const CHILI_L = 0.094;
const chiliRadius = (t: number) => 0.0084 * (0.72 + 0.28 * sstep(0, 0.12, t)) * Math.pow(1 - t, 0.72) + 0.0004;
const CHILI_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0], [0.0046, 0.0012], [0.0067, 0.0045], ...[0.03, 0.12, 0.25, 0.4, 0.55, 0.7, 0.82, 0.92, 0.98].map((t) => [chiliRadius(t), 0.006 + t * (CHILI_L - 0.006)] as [number, number]),
    [0.0001, CHILI_L + 0.0006],
  ],
  40,
);

function chiliTex() {
  return canvasTexture(
    128,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#d4251c';
      ctx.fillRect(0, 0, w, h);
      const r = new Rng(5);
      for (let i = 0; i < 16; i++) {
        const x = r.next() * w;
        ctx.fillStyle = rgba(r.next() < 0.5 ? '#a8140e' : '#f0503a', r.range(0.12, 0.3));
        for (const dx of [-w, 0, w]) {
          ctx.beginPath();
          ctx.ellipse(x + dx, h * r.range(0.3, 0.7), r.range(2, 6), h * r.range(0.25, 0.5), 0, 0, TAU);
          ctx.fill();
        }
      }
      const g = ctx.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, 'rgba(140,20,10,0.35)');
      g.addColorStop(0.15, 'rgba(140,20,10,0)');
      g.addColorStop(0.9, 'rgba(140,20,10,0)');
      g.addColorStop(1, 'rgba(120,15,8,0.3)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    { key: 'veg/chili/skin' },
  );
}
const chiliSkin = lazy(() =>
  foodMat({ color: '#ffffff', map: chiliTex(), roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.07, flesh: CHILI.flesh, cookColor: CHILI.cooked, name: 'chili-skin' }),
);
const chiliFlesh = lazy(() =>
  foodMat({ color: '#ffffff', map: fleshTex('veg/chili/flesh', CHILI.flesh, '#f8a080', '#c8301e'), roughness: 0.32, clearcoat: 0.5, flesh: CHILI.flesh, cookColor: CHILI.cooked }),
);

function buildChili(r: Rng): THREE.Object3D {
  const hook = r.range(0.014, 0.024) * r.sign();
  const curve = curveThrough([
    [0, 0, 0],
    [CHILI_L * 0.3, 0.0005, hook * 0.08],
    [CHILI_L * 0.6, 0.0012, -hook * 0.05],
    [CHILI_L * 0.85, 0.0022, -hook * 0.45],
    [CHILI_L * 0.98, 0.004, -hook],
  ]);
  const g = sweepGeometry(curve, { radius: chiliRadius, radialSegments: 18, tubularSegments: 40, caps: 'round', shape: (a, t) => 1 + 0.045 * Math.cos(3 * a + 0.5) * sstep(0.05, 0.3, t) });
  const body = mesh(g, chiliSkin());
  // calyx cup on the shoulder + curved stem
  const r0 = chiliRadius(0);
  const domeProfile: Profile = smoothProfile([[0.0001, r0], [r0 * 0.5, r0 * 0.87], [r0 * 0.87, r0 * 0.5], [r0, 0], [r0, -0.004]], 16);
  const cap = drapedStar(new ProfilePath(domeProfile), {
    points: 5,
    inner: r0 * 0.9,
    tips: Array.from({ length: 5 }, () => r.range(r0 * 1.35, r0 * 1.75)),
    sharp: 1.4,
    phase: r.range(0, TAU),
    offset: 0.0005,
    lift: Array.from({ length: 5 }, () => r.range(0.0002, 0.0008)),
    rings: 6,
    segs: 50,
  });
  paintUV(cap, (_u, v) => ramp(stops([[0, '#3d7a28'], [1, '#5a9a38']]), v));
  const T0 = curve.getTangent(0);
  const back = T0.clone().negate();
  const capM = frame(V(0, 0, 0), back).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  cap.applyMatrix4(capM);
  const sd = r.sign();
  const stemPts: V3[] = [
    [-r0 * 0.6, 0, 0],
    [-r0 - 0.004, 0.0015, sd * 0.001],
    [-r0 - 0.011, 0.0045, sd * 0.004],
    [-r0 - 0.017, 0.006, sd * 0.009],
  ];
  const stem = tube(stemPts, (t) => 0.0017 * (1.25 - 0.4 * t), { radialSegments: 8, tubularSegments: 12, caps: 'round' });
  gradeAlong(stem, stemPts[0], stemPts[3], stops([[0, '#3f7a28'], [0.85, '#5a8a36'], [1, '#a8b070']]));
  const gm = plantMat('chili-green', '#9cc070', { roughness: 0.4, clearcoat: 0.5 });
  return sitOnGround(group(body, mesh(cap, gm), mesh(stem, gm)));
}

function chiliSection(ctx: Ctx, s: number, o: SectionOpts) {
  const R = s / 2, r = new Rng(9);
  ctx.fillStyle = '#d82c1e';
  ctx.fillRect(0, 0, s, s);
  const inner = R * 0.68;
  const g = ctx.createRadialGradient(R, R, 0, R, R, inner);
  g.addColorStop(0, '#fbd2a8');
  g.addColorStop(0.7, '#f7a476');
  g.addColorStop(1, '#ee7a52');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i <= 50; i++) {
    const a = (i / 50) * TAU;
    const rr = inner * (1 + 0.06 * Math.cos(3 * a + 0.5));
    ctx.lineTo(R + Math.cos(a) * rr, R + Math.sin(a) * rr);
  }
  ctx.fill();
  ctx.lineWidth = s * 0.02;
  ctx.strokeStyle = '#f0603e';
  ctx.stroke();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + r.range(-0.2, 0.2), rr = inner * r.range(0.25, 0.65);
    seed(ctx, R + Math.cos(a) * rr, R + Math.sin(a) * rr, s * 0.07, s * 0.05, a + 1.2, '#fbe9b6', 'rgba(220,170,100,0.9)');
  }
  if (!o.peeled) ringStroke(ctx, R, R, R - s * 0.012, s * 0.024, '#b81c12');
  sheen(ctx, R * 0.7, R * 0.6, R * 0.3, R * 0.14, 0.22);
}

// =============================================================================================
// CORN (long): cob of individual kernels, husk leaves opening at the stem end

const CORN = colors('corn');
const COB_L = 0.158;
const COB_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0], [0.0125, 0.0018], [0.0195, 0.0075], [0.0228, 0.019], [0.0238, 0.045], [0.0235, 0.085], [0.0215, 0.115],
    [0.0178, 0.137], [0.0122, 0.15], [0.0062, 0.1562], [0.0001, COB_L],
  ],
  48,
);
const KERNEL_ROWS = 14;

/** Unit kernel: hexagonal pillow, footprint x/y in [-0.5, 0.5], height z 0..1. */
const kernelTemplate = lazy(() => {
  const pos: number[] = [], idx: number[] = [];
  const ring = (k: number, sc: number, z: number) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      pos.push(Math.cos(a) * 0.5 * sc, (Math.sin(a) * 0.5 * sc) / 0.866, z);
    }
    return k;
  };
  ring(0, 1, 0);
  ring(6, 0.62, 0.78);
  pos.push(0, 0, 1);
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    idx.push(i, j, 6 + j, i, 6 + j, 6 + i);
    idx.push(6 + i, 6 + j, 12);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
});

const cornKernelMat = lazy(() =>
  foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.22, flesh: CORN.flesh, cookColor: CORN.cooked, name: 'corn-kernels' }),
);
const cornCobMat = lazy(() => foodMat({ color: '#e9cf86', roughness: 0.75, flesh: '#f3e3b0', cookColor: CORN.cooked }));

function cornSkinTex() {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#b8902e';
      ctx.fillRect(0, 0, w, h);
      const cols = KERNEL_ROWS, rows = 12;
      const r = new Rng(3);
      for (let j = 0; j < cols; j++)
        for (let i = 0; i < rows; i++) {
          const cw = w / cols, ch = h / rows;
          const x = j * cw + cw / 2, y = i * ch + ch / 2 + (j % 2) * ch * 0.5;
          const g = ctx.createRadialGradient(x - cw * 0.12, y - ch * 0.15, 0, x, y, cw * 0.6);
          g.addColorStop(0, '#fbe58a');
          g.addColorStop(0.6, r.next() < 0.3 ? '#f2bd34' : '#f6c93e');
          g.addColorStop(1, '#d9a22a');
          ctx.fillStyle = g;
          for (const dy of [-h, 0]) {
            ctx.beginPath();
            ctx.roundRect(x - cw * 0.44, y + dy - ch * 0.42, cw * 0.88, ch * 0.84, cw * 0.3);
            ctx.fill();
          }
        }
    },
    { key: 'veg/corn/skin', wrap: true },
  );
}
const cornSkin = lazy(() => foodMat({ color: '#ffffff', map: cornSkinTex(), roughness: 0.36, clearcoat: 0.5, clearcoatRoughness: 0.25, flesh: CORN.flesh, cookColor: CORN.cooked }));
const cornFlesh = lazy(() =>
  foodMat({ color: '#ffffff', map: fleshTex('veg/corn/flesh', CORN.flesh, '#fbe58a', '#e0b030'), roughness: 0.36, clearcoat: 0.4, flesh: CORN.flesh, cookColor: CORN.cooked }),
);

function huskTex() {
  return canvasTexture(
    128,
    256,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, '#d6dc98');
      g.addColorStop(0.3, '#a6c860');
      g.addColorStop(0.75, '#8cbc4c');
      g.addColorStop(1, '#c8c878');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const eg = ctx.createLinearGradient(0, 0, w, 0);
      eg.addColorStop(0, rgba('#e8ecb0', 0.6));
      eg.addColorStop(0.2, rgba('#e8ecb0', 0));
      eg.addColorStop(0.8, rgba('#e8ecb0', 0));
      eg.addColorStop(1, rgba('#e8ecb0', 0.6));
      ctx.fillStyle = eg;
      ctx.fillRect(0, 0, w, h);
      const r = new Rng(8);
      for (let i = 0; i < 26; i++) {
        const x = r.next() * w;
        ctx.strokeStyle = rgba(r.next() < 0.5 ? '#6e9a38' : '#e6f0b8', r.range(0.25, 0.5));
        ctx.lineWidth = r.range(0.6, 1.6);
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.bezierCurveTo(x, h * 0.6, mix(x, w / 2, 0.3), h * 0.3, mix(x, w / 2, 0.85), 0);
        ctx.stroke();
      }
    },
    { key: 'veg/corn/husk' },
  );
}
const huskMat = lazy(() => foodMat({ color: '#ffffff', map: huskTex(), roughness: 0.55, flesh: '#eef0c4', cookColor: '#7a6a2a', cookAmount: 0.35 }));

function buildCorn(r: Rng): THREE.Object3D {
  const tpl = kernelTemplate();
  const kernels: THREE.BufferGeometry[] = [];
  const pal = ['#f6c93e', '#f8d250', '#f3be34', '#f9da6a', '#f5c43a'].map(lin);
  const pitch = 0.0074;
  const nAlong = Math.floor((COB_L - 0.012) / pitch);
  const m = new THREE.Matrix4(), X = V(), Y = V(0, 1, 0), Z = V();
  const shade = [0.58, 1.0, 1.14];
  for (let j = 0; j < KERNEL_ROWS; j++) {
    for (let i = 0; i < nAlong; i++) {
      const y = 0.006 + (i + 0.5 + (j % 2) * 0.5) * pitch;
      if (y > COB_L - 0.005) continue;
      const re = profileRadiusAt(COB_PROFILE, y);
      if (re < 0.004) continue;
      const kh = Math.min(0.0058, re * 0.3);
      const a = ((j + r.range(-0.08, 0.08)) / KERNEL_ROWS) * TAU;
      Z.set(Math.sin(a), 0, Math.cos(a));
      X.set(Math.cos(a), 0, -Math.sin(a));
      // tilt with the profile slope near the ends
      const slope = (profileRadiusAt(COB_PROFILE, y + 0.002) - profileRadiusAt(COB_PROFILE, y - 0.002)) / 0.004;
      const Zt = Z.clone().addScaledVector(Y, -slope).normalize();
      const Yt = Zt.clone().cross(X).normalize();
      const wdt = ((TAU * re) / KERNEL_ROWS) * 0.98, len = pitch * 1.02 * Math.min(1, re / 0.012 + 0.2);
      m.makeBasis(X.clone().multiplyScalar(wdt), Yt.clone().multiplyScalar(len), Zt.clone().multiplyScalar(kh * r.range(0.95, 1.08)));
      m.setPosition(Z.clone().multiplyScalar(re - kh).add(V(0, y, 0)));
      const k = tpl.clone().applyMatrix4(m);
      const base = pal[r.int(0, pal.length - 1)].clone().multiplyScalar(r.range(0.94, 1.05));
      const col = new Float32Array(13 * 3);
      for (let v = 0; v < 13; v++) {
        const c = base.clone().multiplyScalar(shade[v < 6 ? 0 : v < 12 ? 1 : 2]);
        col.set([c.r, c.g, c.b], v * 3);
      }
      k.setAttribute('color', new THREE.BufferAttribute(col, 3));
      kernels.push(k);
    }
  }
  const kGeom = merge(kernels);
  const coreProfile: Profile = COB_PROFILE.map(([rr, y]) => [Math.max(0.0001, rr - 0.0048 * sstep(0, 0.012, rr)), y]);
  const core = lathe(coreProfile, 24);
  // stalk stub at the base
  const stub = tube([[0, 0.004, 0], [0, -0.004, 0], [0.001, -0.014, 0.0005]], (t) => 0.0078 * (1 - 0.15 * t), { radialSegments: 12, tubularSegments: 6, caps: 'flat' });
  gradeAlong(stub, [0, 0.004, 0], [0.001, -0.014, 0.0005], stops([[0, '#b8c070'], [0.9, '#a8b060'], [1, '#e2dcae']]));
  // husk leaves opening at the base (avoid the side that rests on the ground: local azimuth +pi/2)
  const husks: THREE.BufferGeometry[] = [];
  const azs = [-Math.PI / 2 + r.range(-0.2, 0.2), -Math.PI / 2 + 2.05 + r.range(-0.15, 0.15), -Math.PI / 2 - 2.05 + r.range(-0.15, 0.15), -Math.PI / 2 + r.sign() * 1.0];
  azs.forEach((az, i) => {
    const out = V(Math.sin(az), 0, Math.cos(az));
    const beta = i === 0 ? r.range(0.25, 0.4) : r.range(0.35, 0.55);
    const dir = V(0, 1, 0).multiplyScalar(Math.cos(beta)).addScaledVector(out, Math.sin(beta));
    const at = out.clone().multiplyScalar(0.011).add(V(0, -0.006, 0));
    const L = i === 3 ? r.range(0.07, 0.08) : r.range(0.085, 0.1);
    const leaf = leafGeom({
      length: L,
      width: r.range(0.04, 0.05),
      outline: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.85)), 0.7) * (1 - 0.25 * t),
      cup: -0.55,
      curl: r.range(0.45, 0.75),
      ruffle: 0.0012,
      ruffleFreq: 14,
      twist: r.range(-0.3, 0.3),
      segL: 16,
      segW: 9,
      seed: r.range(0, 9),
    });
    husks.push(placed(leaf, frame(at, dir, out)));
  });
  const root = group(
    mesh(toX(kGeom), cornKernelMat()),
    mesh(toX(core), cornCobMat()),
    mesh(toX(stub), plantMat('corn-stalk', '#e8e4b8', { roughness: 0.6 })),
    mesh(toX(merge(husks)), huskMat()),
  );
  return sitOnGround(root);
}

function cornSection(ctx: Ctx, s: number) {
  const R = s / 2;
  ctx.fillStyle = '#d9a52c';
  ctx.fillRect(0, 0, s, s);
  const n = KERNEL_ROWS;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(a);
    const g = ctx.createLinearGradient(R * 0.4, 0, R, 0);
    g.addColorStop(0, '#f6d870');
    g.addColorStop(0.6, '#f8d050');
    g.addColorStop(1, '#f2be36');
    ctx.fillStyle = g;
    const half = Math.tan(Math.PI / n) * R * 0.92;
    ctx.beginPath();
    ctx.moveTo(R * 0.42, -half * 0.42);
    ctx.lineTo(R * 0.88, -half * 0.9);
    ctx.quadraticCurveTo(R * 1.02, 0, R * 0.88, half * 0.9);
    ctx.lineTo(R * 0.42, half * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // core disc (centred)
  const cg = ctx.createRadialGradient(R, R, 0, R, R, R * 0.43);
  cg.addColorStop(0, '#fbf3d6');
  cg.addColorStop(0.75, '#f3e4b4');
  cg.addColorStop(1, '#e2c888');
  ctx.fillStyle = cg;
  circle(ctx, R, R, R * 0.43);
  ctx.fill();
  sheen(ctx, R * 0.75, R * 0.55, R * 0.3, R * 0.12, 0.2);
}

// =============================================================================================
// Table

export const MODELS: ModelTable = {
  tomato: {
    build: buildTomato,
    profile: TOMATO_PROFILE,
    skin: tomatoSkin,
    flesh: tomatoFlesh,
    section: tomatoSection,
    sectionV: tomatoSectionV,
  },
  carrot: {
    build: (r) => buildCarrot(r, false),
    peeled: (r) => buildCarrot(r, true),
    profile: CARROT_PROFILE,
    skin: carrotSkin,
    flesh: carrotFlesh,
    section: carrotSection,
  },
  potato: {
    build: buildPotato,
    peeled: (r) => sitOnGround(mesh(potatoGeom(r, true), potatoPeeledMat())),
    profile: POTATO_PROFILE,
    skin: potatoSkin,
    flesh: potatoFlesh,
    section: (ctx, s, o) => potatoFace(ctx, s, s, o),
    sectionV: potatoFace,
  },
  onion: {
    build: buildOnion,
    peeled: buildOnionPeeled,
    profile: ONION_PROFILE,
    skin: onionSkin,
    flesh: onionFlesh,
    section: onionSection,
    sectionV: onionSectionV,
  },
  broccoli: {
    build: buildBroccoli,
    piece: (r) => broccoliPiece(r),
    skin: broccoliSkin,
    flesh: broccoliFlesh,
    section: (ctx, s) => broccoliSection(ctx, s),
  },
  cucumber: {
    build: (r) => buildCucumber(r, false),
    peeled: (r) => buildCucumber(r, true),
    profile: CUKE_PROFILE,
    skin: cucumberSkin,
    flesh: cucumberFlesh,
    section: cucumberSection,
  },
  lettuce: {
    build: buildLettuce,
    piece: (r) => lettucePiece(r),
    skin: lettuceLeafMat,
    flesh: lettuceFlesh,
    forms: {
      shredded: (r) => shreds(r, 46, 0.045, [0.03, 0.06], [0.004, 0.007], ['#e8f4c0', '#c8e67a', '#9fd45e', '#7cc045'], shredMat('lettuce', 0.5)),
    },
  },
  'bell-pepper': {
    build: buildPepper,
    profile: PEPPER_PROFILE,
    skin: pepperSkin,
    flesh: pepperFlesh,
    section: pepperSection,
    sectionV: pepperSectionV,
  },
  chili: {
    build: buildChili,
    profile: CHILI_PROFILE,
    skin: chiliSkin,
    flesh: chiliFlesh,
    section: chiliSection,
  },
  corn: {
    build: buildCorn,
    profile: COB_PROFILE,
    skin: cornSkin,
    flesh: cornFlesh,
    section: (ctx, s) => cornSection(ctx, s),
  },
  garlic: {
    build: buildGarlic,
    peeled: buildGarlicPeeled,
    profile: GARLIC_PROFILE,
    skin: garlicSkin,
    flesh: garlicFlesh,
    section: garlicSection,
    sectionV: garlicSectionV,
  },
};

