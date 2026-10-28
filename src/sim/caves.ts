/**
 * Cave tunnels, traced from a skylight's mouth under intact ground.
 *
 * The path meanders (two sinusoids in heading, faded in after a straight
 * entrance passage), descends gently as lava tubes do, and ends in a
 * breakdown choke where the roof would grow thinner than a few metres, where
 * the ground above drops below the liquid level, or at its natural length.
 * Deterministic: renderer and simulation trace the same tunnel from their
 * own generators.
 */
import type { SurfaceGenerator } from '../terrain/surface';
import { inTunnelSection, type CaveSite } from '../terrain/caves';
import { Rng } from '../core/rng';

export interface Tunnel {
  site: CaveSite;
  /** skylight floor height (m relative to the radius) */
  floor0: number;
  n: number;
  /** arc length from the mouth (m); the first ring sits 1 m inside the skylight */
  s: number[];
  /** unit direction of each ring's floor centre */
  dir: [number, number, number][];
  /** horizontal unit tangent of each ring */
  fwd: [number, number, number][];
  /** floor height (m relative to the radius) */
  floor: number[];
  /** cross-section scale (1, tapering into the end choke) */
  scale: number[];
  length: number;
}

const STEP = 1.5;
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function traceTunnel(gen: SurfaceGenerator, site: CaveSite): Tunnel | null {
  const floor0 = gen.caveFloor(site);
  if (isNaN(floor0)) return null;
  const R = gen.R;
  const rng = new Rng(site.seed);
  const k = site.kind;
  const target = k === 'lava-tube' ? rng.range(150, 450) : k === 'ice' ? rng.range(80, 250) : rng.range(100, 320);
  const A1 = rng.range(0.25, 0.6), L1 = rng.range(40, 90), P1 = rng.range(0, 6.28);
  const A2 = rng.range(0.08, 0.25), L2 = rng.range(12, 25), P2 = rng.range(0, 6.28);
  const grade = k === 'lava-tube' ? rng.range(0, 0.04) : rng.range(-0.02, 0.03);
  const P3 = rng.range(0, 6.28);
  const sea = gen.liquidLevel();
  const t: Tunnel = { site, floor0, n: 0, s: [], dir: [], fwd: [], floor: [], scale: [], length: 0 };
  // start 1 m inside the skylight, at the far wall
  let px = site.dir[0] * R + site.U[0] * (site.lf - 1), py = site.dir[1] * R + site.U[1] * (site.lf - 1), pz = site.dir[2] * R + site.U[2] * (site.lf - 1);
  let end = target;
  for (let s = -1; s <= end + 1e-6; s += STEP) {
    const l = Math.hypot(px, py, pz);
    const ux = px / l, uy = py / l, uz = pz / l;
    const taper = sstep(3 * site.rt, 6 * site.rt, s);
    const th = taper * (A1 * Math.sin(s / L1 + P1) - A1 * Math.sin(P1) + A2 * Math.sin(s / L2 + P2) - A2 * Math.sin(P2));
    const c = Math.cos(th), sn = Math.sin(th);
    let fx = c * site.U[0] + sn * site.V[0], fy = c * site.U[1] + sn * site.V[1], fz = c * site.U[2] + sn * site.V[2];
    const dn = fx * ux + fy * uy + fz * uz;
    fx -= dn * ux; fy -= dn * uy; fz -= dn * uz;
    const fl = Math.hypot(fx, fy, fz);
    fx /= fl; fy /= fl; fz /= fl;
    const floor = floor0 - grade * Math.max(s, 0) + 0.6 * taper * Math.sin(s / 23 + P3);
    // roof: stop where the rock above would be too thin, or the ground above is under liquid
    if (s > 3 * site.rt && end === target) {
      const surf = gen.sample(ux, uy, uz, 4).height;
      if (surf - (floor + site.hc) < Math.max(2.5, 0.25 * site.rt) || surf < sea + 0.5) end = s + 8;
    }
    const scale = 1 - 0.75 * sstep(end - 8, end, s);
    t.s.push(s); t.dir.push([ux, uy, uz]); t.fwd.push([fx, fy, fz]); t.floor.push(floor); t.scale.push(scale);
    px += fx * STEP; py += fy * STEP; pz += fz * STEP;
  }
  t.n = t.s.length;
  t.length = t.s[t.n - 1];
  return t;
}

export interface TunnelLocal {
  /** arc length from the mouth (m) */
  s: number;
  /** lateral offset (m, + toward the ring's left) and height above the floor (m) */
  v: number;
  y: number;
  /** floor and ceiling radius (m from the planet's centre) at this point */
  floorR: number;
  ceilR: number;
  /** half-width and ceiling height of the (tapered) section here */
  rt: number;
  hc: number;
  inside: boolean;
  /** body-fixed lateral axis and tangent at this point */
  side: [number, number, number];
  fwd: [number, number, number];
}

/** Where a body-fixed point lies relative to a tunnel (nearest point on its axis). */
export function tunnelLocal(t: Tunnel, R: number, x: number, y: number, z: number): TunnelLocal {
  let best = Infinity, bi = 0, bt = 0;
  for (let i = 0; i + 1 < t.n; i++) {
    const a = t.dir[i], b = t.dir[i + 1];
    const ra = R + t.floor[i], rb = R + t.floor[i + 1];
    const ax = a[0] * ra, ay = a[1] * ra, az = a[2] * ra;
    const ex = b[0] * rb - ax, ey = b[1] * rb - ay, ez = b[2] * rb - az;
    const e2 = ex * ex + ey * ey + ez * ez;
    const tt = Math.min(1, Math.max(0, ((x - ax) * ex + (y - ay) * ey + (z - az) * ez) / e2));
    const qx = ax + ex * tt - x, qy = ay + ey * tt - y, qz = az + ez * tt - z;
    // distance across the section only (height above the floor is free)
    const d = qx * qx + qy * qy + qz * qz - ((qx * a[0] + qy * a[1] + qz * a[2]) ** 2) * 0.9;
    if (d < best) { best = d; bi = i; bt = tt; }
  }
  const lerp = (p: number, q: number) => p + (q - p) * bt;
  const a = t.dir[bi], b = t.dir[bi + 1];
  let ux = lerp(a[0], b[0]), uy = lerp(a[1], b[1]), uz = lerp(a[2], b[2]);
  const ul = Math.hypot(ux, uy, uz);
  ux /= ul; uy /= ul; uz /= ul;
  const fa = t.fwd[bi], fb = t.fwd[bi + 1];
  let fx = lerp(fa[0], fb[0]), fy = lerp(fa[1], fb[1]), fz = lerp(fa[2], fb[2]);
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl; fy /= fl; fz /= fl;
  // side = up × fwd
  const sx = uy * fz - uz * fy, sy = uz * fx - ux * fz, sz = ux * fy - uy * fx;
  const floor = lerp(t.floor[bi], t.floor[bi + 1]);
  const fr = R + floor;
  const dx = x - ux * fr, dy = y - uy * fr, dz = z - uz * fr;
  const v = dx * sx + dy * sy + dz * sz;
  const hgt = Math.hypot(x, y, z) - fr;
  const sc = lerp(t.scale[bi], t.scale[bi + 1]);
  const rt = t.site.rt * sc, hc = t.site.hc * sc;
  const s = lerp(t.s[bi], t.s[bi + 1]);
  return {
    s, v, y: hgt, floorR: fr + floorAt(rt, hc, v), ceilR: fr + ceilingAt(rt, hc, v), rt, hc,
    inside: s > -0.5 && s < t.length && inTunnelSection(rt, hc, v, hgt),
    side: [sx, sy, sz], fwd: [fx, fy, fz],
  };
}

/** Floor height at lateral offset v: flat in the middle, curving up into the walls (as the rendered section). */
export function floorAt(rt: number, hc: number, v: number) {
  const yc = 0.45 * hc, f = 0.12 * hc;
  const ye = yc * (1 - Math.sqrt(Math.max(0, 1 - Math.min(1, (v / rt) ** 2))));
  return yc * Math.max(0, (ye - f) / (yc - f));
}

/** Ceiling height above the floor at lateral offset v (same section as inTunnelSection). */
export function ceilingAt(rt: number, hc: number, v: number) {
  const yc = 0.45 * hc;
  const q = Math.min(1, (v / rt) ** 2);
  return yc + (hc - yc) * Math.sqrt(1 - q);
}

/** Tunnels near a body-fixed point, traced once and cached per generator. */
export class CaveIndex {
  private tunnels = new Map<number, Tunnel | null>();
  constructor(readonly gen: SurfaceGenerator) {}

  tunnel(site: CaveSite): Tunnel | null {
    let t = this.tunnels.get(site.key);
    if (t === undefined) { t = traceTunnel(this.gen, site); this.tunnels.set(site.key, t); }
    return t;
  }

  /** Tunnels whose skylight lies within `range` metres of the point. */
  near(x: number, y: number, z: number, range = 800): Tunnel[] {
    const l = Math.hypot(x, y, z);
    const out: Tunnel[] = [];
    const R = this.gen.R;
    for (const s of this.gen.cavesNear(x / l, y / l, z / l)) {
      const d = Math.hypot(s.dir[0] * R - (x / l) * R, s.dir[1] * R - (y / l) * R, s.dir[2] * R - (z / l) * R);
      if (d > range + 500) continue;
      const t = this.tunnel(s);
      if (t) out.push(t);
    }
    return out;
  }

  /** The tunnel containing a body-fixed point, with local coordinates, or null. */
  locate(x: number, y: number, z: number): { tunnel: Tunnel; local: TunnelLocal } | null {
    for (const t of this.near(x, y, z, 600)) {
      const local = tunnelLocal(t, this.gen.R, x, y, z);
      if (local.inside) return { tunnel: t, local };
    }
    return null;
  }
}
