// Serving containers for kitchen-made products: ceramic bowls, tall drink glasses, retro mugs and
// small footed dishes, plus liquid fills and the lathe / profile helpers they are built with.
//
// Look: a glossy cream glaze with pastel accents (mint, coral, butter, lilac, sky, pink) — a sunny
// retro-diner set that matches the kitchen palette. Containers are NOT food: their materials are
// made with foodMat({ food: false, cookAmount: 0 }) so they never brown / burn / get sauce, and
// survive bindFoodMaterial's cloning (glass transparency included).
//
// Every builder returns a Vessel: the root group (resting on y = 0, centred on x/z, meshes tagged
// userData.container = true) plus the interior measurements needed to fill it (see liquidFill()).
// Geometry is cached per option set, so building the same container again is cheap.

import * as THREE from 'three';
import { foodMat, lazy, smoothNormals, sweepGeometry, curveThrough, merge, paintVertices, type Profile } from './kit';

export const PASTEL = {
  mint: '#8fd5c3',
  coral: '#ff8a74',
  butter: '#ffd36e',
  lilac: '#b9a6f2',
  sky: '#8fcbf0',
  pink: '#f7a1bf',
  peach: '#ffb487',
} as const;

/** Cream glaze used inside every ceramic container. */
export const GLAZE = '#fff6ea';
const FOOT_COLOR = '#ecdcc6';

// ---------------------------------------------------------------------------------------------
// 2D profile helpers ([radius, y] curves for lathes)

export type Pt = [number, number];
/** A parametric 2D curve, t in 0..1. */
export type Curve2 = (t: number) => Pt;

export const line = (a: Pt, b: Pt): Curve2 => (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export const arc = (cx: number, cy: number, r: number, a0: number, a1: number): Curve2 => (t) => {
  const a = a0 + (a1 - a0) * t;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
};

export const reverse = (c: Curve2): Curve2 => (t) => c(1 - t);

/** Sub-range of a curve. */
export const part = (c: Curve2, t0: number, t1: number): Curve2 => (t) => c(t0 + (t1 - t0) * t);

/**
 * Offset a curve to its left (as seen walking along it) by d. For an outer wall walked upwards
 * (bottom -> rim) the left side is the inside of the wall.
 */
export function offsetLeft(c: Curve2, d: number): Curve2 {
  return (t) => {
    const e = 1e-4;
    const p = c(t), a = c(Math.max(0, t - e)), b = c(Math.min(1, t + e));
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [p[0] - (dy / l) * d, p[1] + (dx / l) * d];
  };
}

/** Offset a polyline to its left by d (per-vertex averaged normals). */
export function offsetPolyline(pts: Profile, d: number): Profile {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [Math.max(0, p[0] - (dy / l) * d), p[1] + (dx / l) * d] as Pt;
  });
}

/** Smoothstep that also accepts reversed edges (e0 > e1). */
export function sstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Find t where curve(t).y == y (assumes y is monotonic on 0..1). */
function solveY(c: Curve2, y: number): number {
  let a = 0, b = 1;
  const up = c(1)[1] >= c(0)[1];
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (c(m)[1] < y === up) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

/**
 * Round the corners of a polyline with circular fillets. `radius` per point (0 = keep sharp).
 * The first and last points are kept as they are.
 */
export function fillet(pts: Pt[], radius: number | number[], segs = 4): Profile {
  const out: Profile = [];
  for (let i = 0; i < pts.length; i++) {
    const rr = typeof radius === 'number' ? radius : radius[i] ?? 0;
    const P = pts[i];
    if (i === 0 || i === pts.length - 1 || rr <= 0) {
      out.push([P[0], P[1]]);
      continue;
    }
    const A = pts[i - 1], B = pts[i + 1];
    let u1x = A[0] - P[0], u1y = A[1] - P[1];
    const l1 = Math.hypot(u1x, u1y);
    let u2x = B[0] - P[0], u2y = B[1] - P[1];
    const l2 = Math.hypot(u2x, u2y);
    if (l1 < 1e-9 || l2 < 1e-9) {
      out.push([P[0], P[1]]);
      continue;
    }
    u1x /= l1; u1y /= l1; u2x /= l2; u2y /= l2;
    const ang = Math.acos(Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y)));
    if (ang > Math.PI - 1e-3 || ang < 1e-3) {
      out.push([P[0], P[1]]);
      continue;
    }
    const half = ang / 2;
    let d = rr / Math.tan(half);
    let r = rr;
    const dMax = Math.min(l1, l2) * 0.5;
    if (d > dMax) {
      d = dMax;
      r = d * Math.tan(half);
    }
    const t1: Pt = [P[0] + u1x * d, P[1] + u1y * d];
    const t2: Pt = [P[0] + u2x * d, P[1] + u2y * d];
    let bx = u1x + u2x, by = u1y + u2y;
    const bl = Math.hypot(bx, by);
    bx /= bl; by /= bl;
    const h = r / Math.sin(half);
    const cx = P[0] + bx * h, cy = P[1] + by * h;
    const a1 = Math.atan2(t1[1] - cy, t1[0] - cx);
    let da = Math.atan2(t2[1] - cy, t2[0] - cx) - a1;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    for (let k = 0; k <= segs; k++) {
      const a = a1 + da * (k / segs);
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return out;
}

export interface Seg {
  /** A parametric curve sampled n + 1 times... */
  curve?: Curve2;
  n?: number;
  /** ...or explicit points. */
  pts?: Pt[];
  /** Colour (hex) or colour as a function of height. */
  color?: string | ((y: number) => string);
  /** Heights where the colour changes: curves are split there so colour edges stay crisp. */
  cuts?: number[];
  /** Tag stored per point (for reshaping callbacks). */
  tag?: string;
}

export interface BuiltProfile {
  profile: Profile;
  colors: THREE.Color[];
  tags: string[];
}

/**
 * Concatenate profile pieces. Where the colour changes, the junction point is duplicated
 * (zero-length step) so vertex colours switch crisply while normals stay smooth.
 */
export function buildProfile(segs: Seg[]): BuiltProfile {
  const profile: Profile = [];
  const colors: THREE.Color[] = [];
  const tags: string[] = [];
  const colCache = new Map<string, THREE.Color>();
  const toCol = (h: string) => {
    let c = colCache.get(h);
    if (!c) colCache.set(h, (c = new THREE.Color(h)));
    return c;
  };
  let lastHex = '';
  const push = (p: Pt, hex: string, tag: string) => {
    if (profile.length) {
      const q = profile[profile.length - 1];
      if (Math.abs(q[0] - p[0]) < 1e-7 && Math.abs(q[1] - p[1]) < 1e-7 && hex === lastHex) return;
    }
    profile.push([p[0], p[1]]);
    colors.push(toCol(hex));
    tags.push(tag);
    lastHex = hex;
  };
  for (const s of segs) {
    const colorFn = typeof s.color === 'function' ? s.color : () => (s.color as string | undefined) ?? '#ffffff';
    const tag = s.tag ?? '';
    if (s.pts) {
      for (const p of s.pts) push(p, colorFn(p[1]), tag);
      continue;
    }
    const c = s.curve!;
    const n = Math.max(1, s.n ?? 8);
    const ts = [0, 1];
    const y0 = c(0)[1], y1 = c(1)[1];
    for (const cy of s.cuts ?? []) if ((cy - y0) * (cy - y1) < 0) ts.push(solveY(c, cy));
    ts.sort((a, b) => a - b);
    for (let k = 0; k < ts.length - 1; k++) {
      const ta = ts[k], tb = ts[k + 1];
      if (tb - ta < 1e-6) continue;
      const nk = Math.max(1, Math.round(n * (tb - ta)));
      const hex = colorFn(c((ta + tb) / 2)[1]);
      for (let i = 0; i <= nk; i++) push(c(ta + (tb - ta) * (i / nk)), hex, tag);
    }
  }
  return { profile, colors, tags };
}

export interface RevolveOpts {
  segments?: number;
  phiStart?: number;
  phiLength?: number;
  /**
   * Per-vertex reshaping: (profile index, angle, radius, height) -> [radius, height].
   * Keep it a pure function of its inputs so the seam closes. Angle convention matches
   * LatheGeometry: x = r sin(theta), z = r cos(theta).
   */
  map?: (j: number, theta: number, r: number, y: number) => Pt;
  /** One colour per profile point (vertex colours). */
  colors?: THREE.Color[];
  /** 'lathe': u around, v by arc length along the profile. 'planar': top-down u = x, v = z. */
  uv?: 'lathe' | 'planar';
  /** Half-size of the planar mapping square (default: 1.15 x max radius). */
  planar?: number;
}

/**
 * Lathe a [radius, y] profile around Y (like THREE.LatheGeometry, same winding: a profile that
 * walks bottom -> up the outside -> top gets outward-facing triangles), with per-vertex
 * reshaping, vertex colours, arc-length or planar UVs, and smooth welded normals.
 */
export function revolve(profile: Profile, o: RevolveOpts = {}): THREE.BufferGeometry {
  const segs = o.segments ?? 48;
  const phi0 = o.phiStart ?? 0, phiL = o.phiLength ?? Math.PI * 2;
  const n = profile.length;
  const acc = [0];
  for (let j = 1; j < n; j++) acc.push(acc[j - 1] + Math.hypot(profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]));
  const total = acc[n - 1] || 1;
  const S = o.planar ?? Math.max(1e-4, ...profile.map((p) => p[0])) * 1.15;
  const pos = new Float32Array((segs + 1) * n * 3);
  const uv = new Float32Array((segs + 1) * n * 2);
  const col = o.colors ? new Float32Array((segs + 1) * n * 3) : null;
  for (let i = 0; i <= segs; i++) {
    // exact same angle on both seam columns so the map callback gives identical results
    const th = i === segs && phiL >= Math.PI * 2 - 1e-6 ? phi0 : phi0 + (i / segs) * phiL;
    const sn = Math.sin(th), cs = Math.cos(th);
    for (let j = 0; j < n; j++) {
      let r = profile[j][0], y = profile[j][1];
      if (o.map) [r, y] = o.map(j, th, r, y);
      const k = i * n + j;
      const x = r * sn, z = r * cs;
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
      if (o.uv === 'planar') {
        uv[k * 2] = 0.5 + x / (2 * S);
        uv[k * 2 + 1] = 0.5 - z / (2 * S);
      } else {
        uv[k * 2] = i / segs;
        uv[k * 2 + 1] = acc[j] / total;
      }
      if (col) {
        const c = o.colors![j];
        col[k * 3] = c.r;
        col[k * 3 + 1] = c.g;
        col[k * 3 + 2] = c.b;
      }
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < n - 1; j++) {
      const a = j + i * n, b = a + n, c = a + n + 1, d = a + 1;
      idx.push(a, b, d, c, d, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  smoothNormals(g);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Planar canvas painter for 'planar' UVs: fn receives model-space x, z (half-size S) per pixel. */
export function paintPlanar(ctx: CanvasRenderingContext2D, size: number, S: number, fn: (x: number, z: number) => [number, number, number]) {
  const img = ctx.createImageData(size, size);
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      const x = ((px + 0.5) / size - 0.5) * 2 * S;
      const z = ((py + 0.5) / size - 0.5) * 2 * S;
      const [r, g, b] = fn(x, z);
      const i = (py * size + px) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------------------------
// Materials (non-food)

const ceramicMat = lazy(() =>
  foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12, food: false, cookAmount: 0, name: 'ceramic' }),
);

const glassMat = lazy(() => {
  const m = foodMat({
    color: '#e2f3ff',
    transparent: true,
    opacity: 0.2,
    roughness: 0.04,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    food: false,
    cookAmount: 0,
    name: 'glass',
  });
  m.depthWrite = false;
  return m;
});

/** Additive "reflections only" shell for glass: a black glossy surface added on top reads as glints. */
const glassShineMat = lazy(() => {
  const m = foodMat({ color: '#000000', roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04, food: false, cookAmount: 0, transparent: true, name: 'glass-shine' });
  m.blending = THREE.AdditiveBlending;
  m.depthWrite = false;
  m.envMapIntensity = 1.6;
  return m;
});

/** Non-food glossy ceramic in one flat colour (handles, saucers...). */
export function ceramic(): THREE.Material {
  return ceramicMat();
}

const geoCache = new Map<string, { geo: THREE.BufferGeometry; extra?: THREE.BufferGeometry; inner: Profile; rimY: number }>();

function tagContainer(m: THREE.Mesh, name: string): THREE.Mesh {
  m.name = name;
  m.userData.container = true;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Vessel

export interface Vessel {
  root: THREE.Group;
  /** Inner radius at the rim. */
  innerRadius: number;
  /** Top of the rim. */
  rimY: number;
  /** Alias of rimY (glasses). */
  topY: number;
  /** Inside bottom. */
  bottomY: number;
  /** Inner wall profile [radius, y]: inside-bottom centre -> rim. */
  inner: Profile;
  /** Inner radius at height y. */
  radiusAt(y: number): number;
  /** Height of a fill fraction (0 = inside bottom, 1 = rim). */
  levelY(fraction: number): number;
}

function profileRadius(p: Profile, y: number): number {
  if (y <= p[0][1]) return p[0][0];
  for (let i = 1; i < p.length; i++) {
    const [r1, y1] = p[i];
    const [r0, y0] = p[i - 1];
    if (y <= y1 && y1 > y0) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return p[p.length - 1][0];
}

function makeVessel(root: THREE.Group, inner: Profile, rimY: number): Vessel {
  const bottomY = inner[0][1];
  const top = inner[inner.length - 1];
  return {
    root,
    innerRadius: top[0],
    rimY,
    topY: rimY,
    bottomY,
    inner,
    radiusAt: (y) => profileRadius(inner, y),
    levelY: (f) => bottomY + (top[1] - bottomY) * THREE.MathUtils.clamp(f, 0, 1),
  };
}

// ---------------------------------------------------------------------------------------------
// Ceramic bowl

export interface BowlOpts {
  /** Outer radius at the rim (m). Default 0.075. */
  radius?: number;
  /** Overall height (m). Default 0.055. */
  height?: number;
  /** Pastel accent colour (hex). */
  color?: string;
  /** 'band': cream bowl with a pastel band, pin-stripe and rim. 'solid': pastel outside, cream inside and rim. */
  style?: 'band' | 'solid';
  /** Body shape: 0 = round serving bowl ... 1 = steep, flat-bottomed mixing bowl. */
  steep?: number;
  thickness?: number;
  /** Foot ring radius as a fraction of the radius. Default 0.48. */
  foot?: number;
  segments?: number;
}

export function servingBowl(o: BowlOpts = {}): Vessel {
  const R = o.radius ?? 0.075;
  const H = o.height ?? 0.055;
  const t = o.thickness ?? THREE.MathUtils.clamp(R * 0.065, 0.0035, 0.0058);
  const accent = o.color ?? PASTEL.mint;
  const style = o.style ?? 'band';
  const steep = o.steep ?? 0;
  const footF = o.foot ?? 0.48;
  const segs = o.segments ?? 48;
  const key = JSON.stringify(['bowl', R, H, t, accent, style, steep, footF, segs]);
  let hit = geoCache.get(key);
  if (!hit) {
    const p = 2 + steep * 2.4;
    const rf = R * footF;
    const footH = Math.max(0.004, H * 0.085);
    const Hb = H - t / 2;
    const body: Curve2 = (s) => {
      const a = (s * Math.PI) / 2;
      return [rf + (R - rf) * Math.pow(Math.sin(a), 2 / p), Hb - (Hb - footH) * Math.pow(Math.cos(a), 2 / p)];
    };
    const bandBot = Hb - H * 0.3;
    const stripeTop = bandBot - H * 0.075, stripeBot = stripeTop - H * 0.04;
    const outerColor = (y: number) =>
      style === 'solid' ? accent : y >= bandBot || (y <= stripeTop && y >= stripeBot) ? accent : GLAZE;
    const pin0 = Hb - t * 1.1 - 0.0016, pin1 = Hb - t * 1.1;
    const innerColor = (y: number) => (style === 'band' && y >= pin0 && y <= pin1 ? accent : GLAZE);
    const foot = fillet(
      [
        [0, footH * 0.45],
        [rf - 0.0065, footH * 0.45],
        [rf - 0.005, 0],
        [rf - 0.0012, 0],
        body(0),
      ],
      [0, 0.0014, 0.0011, 0.0014, 0],
      3,
    );
    const innerC = offsetLeft(body, t);
    const built = buildProfile([
      { pts: foot, color: FOOT_COLOR, tag: 'foot' },
      { curve: body, n: 13, color: outerColor, cuts: style === 'band' ? [bandBot, stripeTop, stripeBot] : [], tag: 'outer' },
      { curve: arc(R - t / 2, Hb, t / 2, 0, Math.PI), n: 6, color: style === 'band' ? accent : GLAZE, tag: 'rim' },
      { curve: reverse(innerC), n: 12, color: innerColor, cuts: style === 'band' ? [pin0, pin1] : [], tag: 'inner' },
      { curve: line(innerC(0), [0, footH + t]), n: 2, color: GLAZE, tag: 'bottom' },
    ]);
    const inner: Profile = [[0, footH + t]];
    for (let i = 0; i <= 24; i++) inner.push(innerC(i / 24));
    hit = { geo: revolve(built.profile, { segments: segs, colors: built.colors }), inner, rimY: H };
    geoCache.set(key, hit);
  }
  const root = new THREE.Group();
  root.add(tagContainer(new THREE.Mesh(hit.geo, ceramicMat()), 'bowl'));
  return makeVessel(root, hit.inner, hit.rimY);
}

// ---------------------------------------------------------------------------------------------
// Tall drink glass

export interface GlassOpts {
  /** Overall height. Default 0.135. */
  height?: number;
  /** Outer radius at the rim. Default 0.035. */
  radius?: number;
  /** Outer radius at the base. Default 0.028. */
  bottomRadius?: number;
  segments?: number;
}

export function drinkGlass(o: GlassOpts = {}): Vessel {
  const H = o.height ?? 0.135, R1 = o.radius ?? 0.035, R0 = o.bottomRadius ?? 0.028;
  const segs = o.segments ?? 40;
  const t = 0.0024, base = 0.011;
  const key = JSON.stringify(['glass', H, R1, R0, segs]);
  let hit = geoCache.get(key);
  if (!hit) {
    const y0 = 0.005;
    const wall: Curve2 = (s) => [R0 + (R1 - R0) * Math.pow(s, 1.2), y0 + (H - t / 2 - y0) * s];
    const sb = (base + 0.004 - y0) / (H - t / 2 - y0);
    const innerWall = part(offsetLeft(wall, t), sb, 1);
    const ib = innerWall(0);
    const bottom = fillet([[0, 0.0016], [R0 - 0.004, 0], wall(0)], [0, 0.0035, 0], 4);
    const ibottom = fillet([ib, [ib[0], base], [0, base]], [0, 0.0035, 0], 4);
    const built = buildProfile([
      { pts: bottom, tag: 'bottom' },
      { curve: wall, n: 10, tag: 'outer' },
      { curve: arc(R1 - t / 2, H - t / 2, t / 2, 0, Math.PI), n: 5, tag: 'rim' },
      { curve: reverse(innerWall), n: 9, tag: 'inner' },
      { pts: ibottom, tag: 'ibottom' },
    ]);
    const inner: Profile = [...ibottom].reverse().map((p) => [p[0], p[1]] as Pt);
    for (let i = 1; i <= 24; i++) inner.push(innerWall(i / 24));
    const geo = revolve(built.profile, { segments: segs });
    // outer surface only, slightly inflated: carries the additive reflections
    const shell = buildProfile([
      { pts: bottom.slice(Math.floor(bottom.length / 2)) },
      { curve: wall, n: 10 },
      { curve: arc(R1 - t / 2, H - t / 2, t / 2, 0, Math.PI * 0.6), n: 3 },
    ]);
    const extra = revolve(offsetPolyline(shell.profile, -0.0002), { segments: segs });
    hit = { geo, extra, inner, rimY: H };
    geoCache.set(key, hit);
  }
  const root = new THREE.Group();
  const glass = tagContainer(new THREE.Mesh(hit.geo, glassMat()), 'glass');
  glass.castShadow = false;
  glass.renderOrder = 2;
  root.add(glass);
  const shine = tagContainer(new THREE.Mesh(hit.extra!, glassShineMat()), 'glass-shine');
  shine.castShadow = false;
  shine.renderOrder = 3;
  shine.userData.noBounds = true;
  root.add(shine);
  return makeVessel(root, hit.inner, hit.rimY);
}

// ---------------------------------------------------------------------------------------------
// Retro mug

export interface MugOpts {
  radius?: number;
  height?: number;
  color?: string;
  segments?: number;
}

export function mug(o: MugOpts = {}): Vessel {
  const R = o.radius ?? 0.04, H = o.height ?? 0.085;
  const accent = o.color ?? PASTEL.coral;
  const segs = o.segments ?? 44;
  const t = 0.0055, base = 0.0095;
  const key = JSON.stringify(['mug', R, H, accent, segs]);
  let hit = geoCache.get(key);
  if (!hit) {
    const y0 = 0.007;
    const wall: Curve2 = (s) => [R * (0.925 + 0.075 * Math.sin(Math.PI * (0.22 + 0.78 * s))), y0 + (H - t / 2 - y0) * s];
    const sb = (base + 0.004 - y0) / (H - t / 2 - y0);
    const innerWall = part(offsetLeft(wall, t), sb, 1);
    const ib = innerWall(0);
    const w0 = wall(0);
    const bottom = fillet(
      [
        [0, 0.0016],
        [R * 0.74, 0.0016],
        [R * 0.78, 0],
        [w0[0] - 0.003, 0],
        w0,
      ],
      [0, 0.0012, 0.0012, 0.0035, 0],
      3,
    );
    const ibottom = fillet([ib, [ib[0], base], [0, base]], [0, 0.005, 0], 4);
    const stripe0 = y0 + 0.006, stripe1 = y0 + 0.0085;
    const outerColor = (y: number) => (y >= stripe0 && y <= stripe1 ? GLAZE : accent);
    const built = buildProfile([
      { pts: bottom, color: FOOT_COLOR },
      { curve: wall, n: 12, color: outerColor, cuts: [stripe0, stripe1], tag: 'outer' },
      { curve: arc(wall(1)[0] - t / 2, H - t / 2, t / 2, 0, Math.PI), n: 6, color: GLAZE, tag: 'rim' },
      { curve: reverse(innerWall), n: 10, color: GLAZE, tag: 'inner' },
      { pts: ibottom, color: GLAZE },
    ]);
    const inner: Profile = [...ibottom].reverse().map((p) => [p[0], p[1]] as Pt);
    for (let i = 1; i <= 20; i++) inner.push(innerWall(i / 20));
    const body = revolve(built.profile, { segments: segs, colors: built.colors });
    // C-shaped handle on +x
    const hx = (y: number) => wall((y - y0) / (H - t / 2 - y0))[0] - 0.002;
    const curve = curveThrough([
      [hx(H * 0.8), H * 0.8, 0],
      [R + 0.017, H * 0.82, 0],
      [R + 0.027, H * 0.62, 0],
      [R + 0.023, H * 0.38, 0],
      [hx(H * 0.27), H * 0.27, 0],
    ]);
    const handle = sweepGeometry(curve, { radius: 0.0058, squash: [1.12, 0.72], radialSegments: 12, tubularSegments: 24, caps: 'round' });
    paintVertices(handle, () => new THREE.Color(accent));
    hit = { geo: merge([body, handle]), inner, rimY: H };
    geoCache.set(key, hit);
  }
  const root = new THREE.Group();
  root.add(tagContainer(new THREE.Mesh(hit.geo, ceramicMat()), 'mug'));
  return makeVessel(root, hit.inner, hit.rimY);
}

// ---------------------------------------------------------------------------------------------
// Small footed dish (sundae / dessert dish with a scalloped rim)

export interface DishOpts {
  /** Outer radius at the rim. Default 0.055. */
  radius?: number;
  /** Bowl depth. Default 0.03. */
  depth?: number;
  color?: string;
  /** Number of scallops on the rim (0 = round). Default 8. */
  scallops?: number;
  segments?: number;
  /** Profile sampling density (1 = default; ~0.6 for a lighter dish when it holds a lot of food). */
  detail?: number;
}

export function smallDish(o: DishOpts = {}): Vessel {
  const R = o.radius ?? 0.055, D = o.depth ?? 0.03;
  const accent = o.color ?? PASTEL.pink;
  const scallops = o.scallops ?? 8;
  const segs = o.segments ?? 64;
  const detail = o.detail ?? 1;
  const nd = (n: number) => Math.max(2, Math.round(n * detail));
  const t = 0.0042;
  const key = JSON.stringify(['dish', R, D, accent, scallops, segs, detail]);
  let hit = geoCache.get(key);
  if (!hit) {
    const footR = R * 0.58, footH = 0.0055, stemR = R * 0.3, stemH = 0.011;
    const y0 = footH + stemH;
    const Hb = y0 + D - t / 2;
    const p = 2.3;
    const body: Curve2 = (s) => {
      const a = (s * Math.PI) / 2;
      return [stemR + (R - stemR) * Math.pow(Math.sin(a), 2 / p), Hb - (Hb - y0) * Math.pow(Math.cos(a), 2 / p)];
    };
    const foot = fillet(
      [
        [0, 0.0014],
        [footR - 0.003, 0],
        [footR, 0.0026],
        [footR * 0.78, footH],
        [stemR, footH + 0.0035],
        body(0),
      ],
      [0, 0.002, 0.0014, 0.0022, 0.0028, 0],
      detail < 0.8 ? 2 : 3,
    );
    const innerC = offsetLeft(body, t);
    const built = buildProfile([
      { pts: foot, color: accent, tag: 'foot' },
      { curve: body, n: nd(12), color: accent, tag: 'outer' },
      { curve: arc(R - t / 2, Hb, t / 2, 0, Math.PI), n: nd(6), color: GLAZE, tag: 'rim' },
      { curve: reverse(innerC), n: nd(11), color: GLAZE, tag: 'inner' },
      { curve: line(innerC(0), [0, y0 + t]), n: 2, color: GLAZE, tag: 'bottom' },
    ]);
    const inner: Profile = [[0, y0 + t]];
    for (let i = 0; i <= 20; i++) inner.push(innerC(i / 20));
    const tags = built.tags;
    const geo = revolve(built.profile, {
      segments: segs,
      colors: built.colors,
      map: (j, th, r, y) => {
        if (!scallops || (tags[j] !== 'outer' && tags[j] !== 'rim' && tags[j] !== 'inner')) return [r, y];
        const w = Math.pow(sstep(y0 + D * 0.15, Hb, y), 1.6);
        const petal = Math.pow(Math.abs(Math.cos((th * scallops) / 2)), 0.6) - 0.62;
        return [r * (1 + 0.075 * w * petal), y + 0.0028 * w * petal];
      },
    });
    hit = { geo, inner, rimY: Hb + t / 2 };
    geoCache.set(key, hit);
  }
  const root = new THREE.Group();
  root.add(tagContainer(new THREE.Mesh(hit.geo, ceramicMat()), 'dish'));
  return makeVessel(root, hit.inner, hit.rimY);
}

// ---------------------------------------------------------------------------------------------
// Liquid fills

export interface FillOpts {
  /** Height the liquid climbs the wall (m). Default 0.002. */
  meniscus?: number;
  /** Gap to the inner wall (m). Default 0.0007. */
  inset?: number;
  segments?: number;
  /** Number of rings across the flat surface (more for detailed surface functions). Default 6. */
  rings?: number;
  /** Only the top surface with a short skirt (enough inside opaque bowls). */
  surfaceOnly?: boolean;
  /** Extra height for surface points (x, z in vessel space): ripples, swirls, lumps. */
  surface?: (x: number, z: number) => number;
  /** Vertex colour per point: (y, part) -> hex (e.g. a frothy band at the top of a milkshake). */
  color?: (y: number, part: 'body' | 'top') => string;
  /** Planar UV half-size (default: the surface radius). */
  planar?: number;
}

/** Surface height of a fill (for placing garnishes). */
export function fillY(v: Vessel, level: number): number {
  return v.levelY(THREE.MathUtils.clamp(level, 0.03, 1));
}

/**
 * A liquid filling a vessel to `level` (0..1 of the inner depth): smooth body following the
 * inner wall with a gentle meniscus, planar UVs over the surface. Returns a mesh in vessel space.
 */
export function liquidFill(v: Vessel, level: number, mat: THREE.Material, o: FillOpts = {}): THREE.Mesh {
  const yf = fillY(v, level);
  const inset = o.inset ?? 0.0007;
  const m = o.meniscus ?? 0.002;
  const rings = o.rings ?? 6;
  const wallPts = offsetPolyline(v.inner, inset);
  const wallR = (y: number) => profileRadius(wallPts, y);
  const pts: Profile = [];
  const tags: ('body' | 'top')[] = [];
  if (o.surfaceOnly) {
    const yb = Math.max(v.bottomY + 0.0005, yf - 0.005);
    pts.push([wallR(yb), yb]);
    tags.push('body');
  } else {
    for (const p of wallPts) {
      if (p[1] >= yf) break;
      pts.push([p[0], p[1]]);
      tags.push('body');
    }
  }
  const rE = wallR(yf);
  pts.push([rE, yf]);
  tags.push('body');
  const rTop = Math.min(wallR(yf + m), rE + m);
  // meniscus: climbs the wall, curves down to the flat surface
  for (let k = 0; k <= 4; k++) {
    const u = k / 4;
    pts.push([rTop - m * 3.2 * u, yf + m * Math.pow(1 - u, 2.2)]);
    tags.push('top');
  }
  const r0 = rTop - m * 3.2;
  for (let k = 1; k <= rings; k++) {
    const u = k / rings;
    pts.push([Math.max(0, r0 * (1 - u)), yf]);
    tags.push('top');
  }
  const colors = o.color ? pts.map((p, i) => new THREE.Color(o.color!(p[1], tags[i]))) : undefined;
  const surf = o.surface;
  const geo = revolve(pts, {
    segments: o.segments ?? 44,
    uv: 'planar',
    planar: o.planar ?? rTop,
    colors,
    map: surf
      ? (j, th, r, y) => {
          if (tags[j] !== 'top') return [r, y];
          const w = sstep(rTop, rTop - m * 4, r);
          return [r, y + surf(r * Math.sin(th), r * Math.cos(th)) * w];
        }
      : undefined,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'liquid';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
