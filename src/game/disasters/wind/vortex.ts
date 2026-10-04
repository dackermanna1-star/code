/**
 * Tornado math shared by the simulation (entities, particles, flying debris) and the funnel
 * shader (the GLSL in funnel.ts mirrors `funnelRadius` and `axisOffset` exactly).
 *
 * Pure functions, no THREE / DOM: unit tested in tests/disasters.wind.test.ts.
 *
 *  - `TornadoPath`: a seeded, noisy track that starts at the spawner and drifts roughly along
 *    the player's facing (slow heading meander, speed surges, the occasional loop).
 *  - `tornadoLife`: the life cycle (funnel lowering from the cloud, touchdown, mature stage,
 *    rope-out and dissipation) as smooth 0..1 envelopes.
 *  - funnel geometry: radius profile and the bent / swaying axis.
 *  - `vortexWind`: a modified Rankine vortex with ground inflow and a core updraft.
 */
import { hash3, noise2 } from '../kit';

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ------------------------------------------------------------------------------------- path
export interface PathOptions {
  /** Mean forward speed (blocks/s). */
  speed?: number;
  /** Seconds of track to precompute. */
  duration: number;
  /** Sample spacing (s). */
  step?: number;
}

/** A seeded noisy track, precomputed at `step` resolution and linearly interpolated. */
export class TornadoPath {
  readonly xs: Float64Array;
  readonly zs: Float64Array;
  readonly step: number;
  readonly duration: number;
  constructor(readonly seed: number, x0: number, z0: number, fx: number, fz: number, o: PathOptions) {
    const step = (this.step = o.step ?? 0.05);
    this.duration = o.duration;
    const n = Math.ceil(o.duration / step) + 2;
    this.xs = new Float64Array(n);
    this.zs = new Float64Array(n);
    const v0 = o.speed ?? 2.2;
    const l = Math.hypot(fx, fz) || 1;
    const h0 = Math.atan2(fz / l, fx / l);
    let x = x0, z = z0;
    for (let i = 0; i < n; i++) {
      this.xs[i] = x;
      this.zs[i] = z;
      const t = i * step;
      // heading wanders slowly around the initial direction (bounded: never turns back on the player)
      const h = h0 + 0.55 * noise2(t * 0.045, 0.5, seed) + 0.22 * noise2(t * 0.21, 7.5, seed + 1);
      // speed surges and lulls; a short stall now and then
      const surge = 0.5 + 0.5 * noise2(t * 0.11, 3.5, seed + 2);
      const v = v0 * (0.45 + 0.95 * surge);
      x += Math.cos(h) * v * step;
      z += Math.sin(h) * v * step;
    }
  }

  /** Position at time t (clamped to the precomputed range). */
  at(t: number, out: { x: number; z: number } = { x: 0, z: 0 }) {
    const f = Math.max(0, t) / this.step;
    const i = Math.min(this.xs.length - 2, Math.floor(f));
    const k = Math.min(1, f - i);
    out.x = this.xs[i] + (this.xs[i + 1] - this.xs[i]) * k;
    out.z = this.zs[i] + (this.zs[i + 1] - this.zs[i]) * k;
    return out;
  }

  /** Unit direction of travel at time t. */
  heading(t: number, out: { x: number; z: number } = { x: 0, z: 0 }) {
    const a = this.at(Math.max(0, t - 0.5)), b = this.at(t + 0.5);
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    out.x = dx / l;
    out.z = dz / l;
    return out;
  }
}

// ------------------------------------------------------------------------------- life cycle
export interface LifeState {
  /** 0..1 how far the condensation funnel has lowered from the cloud base (1 = touching down). */
  reach: number;
  /** 0..1 wind strength (lifting, ripping). */
  strength: number;
  /** 0..1 rope-out (thin, contorted, stretched funnel). */
  rope: number;
  /** 0..1 overall visibility of the funnel. */
  fade: number;
  /** 0..1 presence of the wall cloud / storm (darkening, rain). */
  storm: number;
}

/** Envelopes for time t of a tornado lasting `dur` seconds. */
export function tornadoLife(t: number, dur: number, out: LifeState = { reach: 0, strength: 0, rope: 0, fade: 0, storm: 0 }): LifeState {
  out.storm = smoothstep(0, 4, t) * (1 - smoothstep(dur - 3, dur + 1, t));
  out.reach = smoothstep(1.5, 7, t) * (1 - smoothstep(dur - 5, dur - 0.5, t) * 0.85);
  out.strength = smoothstep(4.5, 9, t) * (1 - smoothstep(dur - 11, dur - 3, t));
  out.rope = smoothstep(dur - 13, dur - 4, t);
  out.fade = smoothstep(1.5, 4, t) * (1 - smoothstep(dur - 4, dur, t));
  return out;
}

// ---------------------------------------------------------------------------- funnel shape
export interface FunnelShape {
  /** Cloud base height above the ground (blocks). */
  H: number;
  /** Funnel radius at the ground and where it meets the cloud. */
  rBase: number;
  rTop: number;
  /** Lean of the top relative to the base (blocks, xz): the cloud lags behind the motion. */
  tiltX: number;
  tiltZ: number;
  /** Sway amplitude (grows while roping out). */
  wob: number;
  /** Phase seeds. */
  s1: number;
  s2: number;
}

/** Funnel radius at height fraction u (0 ground .. 1 cloud base). Mirrored in GLSL. */
export function funnelRadius(u: number, rBase: number, rTop: number, rope: number): number {
  const uu = clamp01(u);
  const r = rBase + (rTop - rBase) * Math.pow(uu, 2.4);
  return r * (1 - 0.62 * rope);
}

/** Horizontal offset of the funnel axis at height fraction u and time t. Mirrored in GLSL. */
export function axisOffset(u: number, t: number, s: FunnelShape, out: { x: number; z: number } = { x: 0, z: 0 }) {
  const uu = clamp01(u);
  const lean = Math.pow(uu, 1.3);
  const bell = 4 * uu * (1 - uu);
  out.x = s.tiltX * lean + s.wob * bell * Math.sin(t * 0.9 + uu * 5.0 + s.s1);
  out.z = s.tiltZ * lean + s.wob * bell * Math.cos(t * 0.75 + uu * 4.2 + s.s2);
  return out;
}

// ------------------------------------------------------------------------------- wind field
export interface Wind {
  /** Tangential (counter-clockwise seen from above, +), radial (+ outward) and vertical speed. */
  vt: number;
  vr: number;
  vy: number;
}

/**
 * Wind (blocks/s) at horizontal distance r from the axis and height h above the ground.
 * Modified Rankine vortex: solid-body rotation inside the core radius rc, decaying as
 * (rc/r)^0.7 outside; strong inflow near the ground; updraft concentrated in the core.
 */
export function vortexWind(r: number, h: number, rc: number, strength: number, out: Wind = { vt: 0, vr: 0, vy: 0 }): Wind {
  const vmax = 34 * strength;
  const x = r / Math.max(0.5, rc);
  out.vt = x < 1 ? vmax * x : vmax * Math.pow(1 / x, 0.7);
  // inflow: strongest just outside the core, near the ground
  const ground = Math.exp(-Math.max(0, h) / 9);
  out.vr = -vmax * 0.42 * ground * (x < 1 ? x : Math.pow(1 / x, 0.5)) * smoothstep(0.3, 1.0, x);
  // updraft: in and around the core, a bit everywhere near the axis
  out.vy = vmax * 0.5 * Math.exp(-x * x * 0.6) * (0.5 + 0.5 * smoothstep(0, 6, h));
  return out;
}

/** Fraction 0..1 of the wind that still reaches a point at horizontal distance r (for forces). */
export function influence(r: number, rc: number): number {
  return 1 - smoothstep(rc * 1.2, rc * 4 + 9, r);
}

// --------------------------------------------------------------------------------- ripping
/**
 * Random column offset (dx, dz) around the base where the tornado tries to rip a block this
 * attempt: concentrated in the core and the debris ring.
 */
export function ripOffset(rnd: () => number, radius: number, out: { x: number; z: number } = { x: 0, z: 0 }) {
  const a = rnd() * Math.PI * 2;
  const r = Math.pow(rnd(), 0.75) * radius;
  out.x = Math.cos(a) * r;
  out.z = Math.sin(a) * r;
  return out;
}

/** Deterministic per-piece randoms for debris (release height, orbit factor). */
export function pieceRandom(id: number, k: number, seed: number) {
  return hash3(id, k, 17, seed);
}
