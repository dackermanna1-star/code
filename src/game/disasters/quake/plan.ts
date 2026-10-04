/**
 * Earthquake planning (pure, deterministic from a seed; unit tested):
 *
 *  - `quakeIntensity`: the shaking envelope (foreshock, main shock, aftershocks).
 *  - `planFissures`: branching rupture lines radiating from the epicentre. Each arm is a noisy
 *    1-block-spaced polyline with a width (2-6) and depth (10-30) profile tapering to the tip;
 *    sub-branches split off the main arms. The plan is rasterised into carve columns (max depth,
 *    earliest opening time) sorted by time, so the cracks open progressively outward and widen
 *    as their walls fall in. Edge columns are marked for crumbling; the deepest arm's core
 *    near the epicentre can be floored with lava.
 *  - `planFault`: a fault scarp: one side of a line through the epicentre is uplifted by a few
 *    blocks, tapering at the line's ends and away from it.
 */
import { hash3, noise2 } from '../kit';
import { smoothstep } from '../wind/vortex';

// --------------------------------------------------------------------------- shaking
export interface QuakeTimeline {
  /** Main shock start / end of strong shaking (s). */
  main: number;
  mainEnd: number;
  /** Aftershock centre times and peaks. */
  after: [number, number][];
  duration: number;
}

export function defaultTimeline(rnd: () => number): QuakeTimeline {
  return {
    main: 3.5,
    mainEnd: 12.5,
    after: [
      [14.5 + rnd() * 0.8, 0.5],
      [18 + rnd() * 1.0, 0.36],
      [21.3 + rnd() * 0.8, 0.24],
    ],
    duration: 25,
  };
}

/** Shaking intensity 0..1+ at time t (before distance falloff). */
export function quakeIntensity(t: number, tl: QuakeTimeline): number {
  if (t < 0 || t > tl.duration) return 0;
  // foreshock: a growing low rumble with a couple of jolts
  let I = 0.12 + 0.12 * smoothstep(0, tl.main, t) + 0.1 * Math.max(0, Math.sin(t * 2.3)) * smoothstep(0.5, 2, t);
  // main shock: sharp onset, violent plateau with surges, slow decay
  const on = smoothstep(tl.main - 0.15, tl.main + 0.5, t);
  const off = 1 - smoothstep(tl.mainEnd - 3.5, tl.mainEnd, t);
  const surge = 0.85 + 0.15 * Math.sin(t * 3.1) * Math.sin(t * 1.7 + 1);
  I = Math.max(I * (1 - on), on * off * surge, 0.08 * (t < tl.mainEnd + 4 ? 1 : 0) * smoothstep(tl.mainEnd + 4, tl.mainEnd, t));
  for (const [c, p] of tl.after) {
    const d = t - c;
    if (d > -0.3 && d < 2.2) I = Math.max(I, p * smoothstep(-0.3, 0.1, d) * (1 - smoothstep(0.4, 2.2, d)));
  }
  // final settling
  I *= 1 - smoothstep(tl.duration - 1.5, tl.duration, t);
  return I;
}

/** Felt shaking factor at horizontal distance d from the epicentre (felt to ~100 blocks). */
export function shakeFalloff(d: number): number {
  const k = Math.max(0, 1 - d / 105);
  return k * k * (0.35 + 0.65 * k) + (d < 12 ? 0.15 * (1 - d / 12) : 0);
}

// --------------------------------------------------------------------------- fissures
export interface Branch {
  xs: number[];
  zs: number[];
  width: number[];
  depth: number[];
  /** Rupture arrival time at each point (s after the main shock onset). */
  t: number[];
  level: number;
}

export interface CarveCol {
  x: number;
  z: number;
  /** Blocks to remove below the ground surface (0 for edge crumble columns). */
  depth: number;
  /** Opening time (s after the main shock onset). */
  t: number;
  /** Outer rim: crumbles into the crack instead of being carved. */
  edge: boolean;
  /** Floor of the deepest crack: the bottom gets lava. */
  lava: boolean;
  /** Distance along the arm (for effects). */
  s: number;
  /** Direction toward the crack centre (edge columns: crumble direction). */
  dx: number;
  dz: number;
}

export interface FissureOptions {
  arms?: number;
  minLength?: number;
  maxLength?: number;
  maxWidth?: number;
  maxDepth?: number;
  /** Rupture propagation speed (blocks/s). */
  speed?: number;
  /** Heading of the first arm (radians); arms are spread around it. */
  heading?: number;
  lava?: boolean;
}

export interface FissurePlan {
  branches: Branch[];
  cols: CarveCol[];
}

function rngOf(seed: number) {
  let s = (seed >>> 0) || 0x2545f491;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function growBranch(seed: number, x0: number, z0: number, h0: number, len: number, wMax: number, dMax: number, t0: number, speed: number, level: number): Branch {
  const b: Branch = { xs: [], zs: [], width: [], depth: [], t: [], level };
  let x = x0, z = z0;
  for (let s = 0; s <= len; s++) {
    const f = s / len;
    // gentle bends + small-scale zigzag (jagged)
    const h = h0 + 0.42 * noise2(s * 0.06, level * 3.7, seed) + 0.28 * noise2(s * 0.23, 9.1, seed + 3);
    const jag = (hash3(Math.floor(s / 2), level, 5, seed) - 0.5) * 0.9;
    const w = Math.max(level ? 1 : 1.4, wMax * Math.pow(1 - f, 0.55) * (0.72 + 0.28 * (noise2(s * 0.2, 1.3, seed + 5) * 0.5 + 0.5)));
    const d = Math.max(3, dMax * Math.pow(1 - f, 0.45) * (0.8 + 0.2 * (noise2(s * 0.15, 4.2, seed + 7) * 0.5 + 0.5)));
    b.xs.push(x - Math.sin(h) * jag);
    b.zs.push(z + Math.cos(h) * jag);
    b.width.push(w);
    b.depth.push(d);
    b.t.push(t0 + s / speed);
    x += Math.cos(h);
    z += Math.sin(h);
  }
  return b;
}

/** Plan the fissure network around the epicentre (cx, cz). */
export function planFissures(seed: number, cx: number, cz: number, o: FissureOptions = {}): FissurePlan {
  const rnd = rngOf(seed);
  const arms = o.arms ?? 3 + Math.floor(rnd() * 3);
  const minL = o.minLength ?? 40, maxL = o.maxLength ?? 60;
  const maxW = o.maxWidth ?? 6, maxD = o.maxDepth ?? 30;
  const speed = o.speed ?? 7;
  const h0 = o.heading ?? rnd() * Math.PI * 2;
  const branches: Branch[] = [];
  for (let a = 0; a < arms; a++) {
    // arm 0 and arm 1 run in opposite directions (the main rupture along the fault)
    const h = a === 0 ? h0 : a === 1 ? h0 + Math.PI + (rnd() - 0.5) * 0.3 : h0 + (Math.PI * 2 * (a - 1)) / (arms - 1) + Math.PI / (arms - 1) + (rnd() - 0.5) * 0.6;
    const main = a < 2;
    const len = main ? maxL - rnd() * (maxL - minL) * 0.4 : minL + rnd() * (maxL - minL) * 0.7;
    const w = main ? maxW * (0.85 + rnd() * 0.15) : Math.max(2, maxW * (0.45 + rnd() * 0.25));
    const d = main ? maxD * (0.8 + rnd() * 0.2) : Math.max(10, maxD * (0.4 + rnd() * 0.25));
    const arm = growBranch(seed + a * 101, cx + 0.5, cz + 0.5, h, len, w, d, rnd() * 0.3, speed, 0);
    branches.push(arm);
    // sub-branches split off at an angle
    const subs = 1 + (rnd() < 0.6 ? 1 : 0);
    for (let k = 0; k < subs; k++) {
      const i = Math.floor(len * (0.22 + rnd() * 0.45));
      const side = rnd() < 0.5 ? -1 : 1;
      const dir = Math.atan2(arm.zs[Math.min(i + 1, arm.zs.length - 1)] - arm.zs[i], arm.xs[Math.min(i + 1, arm.xs.length - 1)] - arm.xs[i]);
      const sl = 10 + rnd() * 15;
      branches.push(growBranch(seed + a * 101 + k * 13 + 7, arm.xs[i], arm.zs[i], dir + side * (0.5 + rnd() * 0.55), sl, Math.max(2, arm.width[i] * 0.6), Math.max(10, arm.depth[i] * 0.55), arm.t[i], speed * 0.8, 1));
    }
  }
  // ---- rasterise into columns
  const lavaArm = o.lava === false ? -1 : 0;
  const map = new Map<number, CarveCol>();
  const key = (x: number, z: number) => (((x + 32768) & 0xffff) << 16) | ((z + 32768) & 0xffff);
  branches.forEach((b, bi) => {
    for (let i = 0; i < b.xs.length; i++) {
      const hw = b.width[i] / 2;
      const px = b.xs[i], pz = b.zs[i];
      const R = Math.ceil(hw + 1.6);
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const x = Math.floor(px) + dx, z = Math.floor(pz) + dz;
        const ox = x + 0.5 - px, oz = z + 0.5 - pz;
        const d = Math.hypot(ox, oz);
        const jag = (hash3(x, z, 3, seed) - 0.5) * 0.7;
        const k = key(x, z);
        const cur = map.get(k);
        const l = d || 1;
        if (d <= hw + jag) {
          // U/V-shaped section with ragged walls
          const prof = Math.sqrt(Math.max(0, 1 - (d / (hw + 0.5)) ** 2));
          const depth = Math.max(1, Math.round(b.depth[i] * (0.35 + 0.65 * prof) * (0.85 + 0.3 * hash3(x, z, 9, seed))));
          const t = b.t[i] + (d / Math.max(0.5, hw)) * 1.1;
          const lava = bi === lavaArm && i < 14 && d < hw * 0.45;
          if (!cur || cur.edge) map.set(k, { x, z, depth, t, edge: false, lava, s: i, dx: -ox / l, dz: -oz / l });
          else {
            if (depth > cur.depth) cur.depth = depth;
            if (t < cur.t) cur.t = t;
            cur.lava ||= lava;
          }
        } else if (d <= hw + 1.6 && !cur) {
          map.set(k, { x, z, depth: 0, t: b.t[i] + 1.3 + hash3(x, z, 4, seed) * 2.5, edge: true, lava: false, s: i, dx: -ox / l, dz: -oz / l });
        }
      }
    }
  });
  const cols = [...map.values()].sort((a, b) => a.t - b.t);
  return { branches, cols };
}

// --------------------------------------------------------------------------- fault scarp
export interface FaultCol {
  x: number;
  z: number;
  /** Total uplift (blocks). */
  lift: number;
  /** Distance along the fault from the epicentre (rupture order). */
  along: number;
}

export interface FaultPlan {
  dirX: number;
  dirZ: number;
  length: number;
  width: number;
  maxLift: number;
  cols: FaultCol[];
}

/**
 * Columns on the uplifted side of a fault line through (cx, cz) along `heading`. The line is
 * slightly wavy; the lift tapers to 0 towards the ends and away from the line.
 */
export function planFault(seed: number, cx: number, cz: number, heading: number, o: { length?: number; width?: number; maxLift?: number } = {}): FaultPlan {
  const length = o.length ?? 76, width = o.width ?? 20, maxLift = o.maxLift ?? 3;
  const dx = Math.cos(heading), dz = Math.sin(heading);
  const nx = -dz, nz = dx;
  const cols: FaultCol[] = [];
  const half = length / 2;
  const R = Math.ceil(Math.hypot(half, width) + 2);
  for (let z = -R; z <= R; z++) for (let x = -R; x <= R; x++) {
    const px = x + 0.5, pz = z + 0.5;
    const along = px * dx + pz * dz;
    let across = px * nx + pz * nz;
    across -= 1.6 * noise2(along * 0.09, 2.5, seed) + 0.5 * (hash3(Math.floor(along / 3), 1, 2, seed) - 0.5);
    if (across < 0 || across > width || Math.abs(along) > half) continue;
    const endT = 1 - smoothstep(half * 0.55, half, Math.abs(along));
    const accT = 1 - smoothstep(width * 0.45, width, across);
    const lift = Math.round(maxLift * endT * accT);
    if (lift <= 0) continue;
    cols.push({ x: cx + x, z: cz + z, lift, along: Math.abs(along) });
  }
  cols.sort((a, b) => a.along - b.along);
  return { dirX: dx, dirZ: dz, length, width, maxLift, cols };
}

export { rngOf };
