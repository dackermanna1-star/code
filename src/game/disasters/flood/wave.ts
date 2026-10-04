/**
 * Tsunami logic without rendering: the wave frame (along / lateral coordinates), front
 * kinematics and height decay over land, the flood (inundation) level per column, the
 * breaking-wave cross-section used by both the mesh and the spray emitters, and the basin
 * (puddle) solver used when the water drains. Unit tested in tests/disasters.flood.test.ts.
 */
import { hash3 } from '../kit';

export interface WavePlan {
  /** Placement point. */
  px: number;
  pz: number;
  /** Travel direction (unit, horizontal): from far out toward the placement point. */
  dx: number;
  dz: number;
  /** Lateral axis (unit). */
  nx: number;
  nz: number;
  /** y of the top water block of the sea (surface at seaY + 1). */
  seaY: number;
  /** Crest height above the sea surface over deep water. */
  H0: number;
  /** Lateral half width of the wave front. */
  halfW: number;
  /** Start of the front (along coordinate, negative = out at sea). */
  sStart: number;
  /** Furthest inland reach of the front. */
  sMax: number;
  /** Front speed over water (blocks/s). */
  speed: number;
  /** Height e-folding distance over land (blocks). */
  landDecay: number;
  seed: number;
}

export function planWave(x: number, z: number, fx: number, fz: number, seaY: number, seed: number, o: Partial<WavePlan> = {}): WavePlan {
  const l = Math.hypot(fx, fz) || 1;
  // the wave comes FROM the facing direction
  const dx = -fx / l, dz = -fz / l;
  return {
    px: x, pz: z, dx, dz, nx: -dz, nz: dx, seaY,
    H0: 22 + Math.floor(hash3(seed, 2, 9) * 12),
    halfW: 64, sStart: -135, sMax: 110, speed: 10, landDecay: 42, seed,
    ...o,
  };
}

/** World (x,z) -> [along s, lateral u]. */
export function toLocal(p: WavePlan, x: number, z: number): [number, number] {
  const rx = x - p.px, rz = z - p.pz;
  return [rx * p.dx + rz * p.dz, rx * p.nx + rz * p.nz];
}
export function toWorld(p: WavePlan, s: number, u: number): [number, number] {
  return [p.px + p.dx * s + p.nx * u, p.pz + p.dz * s + p.nz * u];
}

/** Lateral wobble of the front line (blocks); identical in the vertex shader. */
export function wobble(u: number): number {
  return 2.5 * Math.sin(u * 0.045 + 1.3) + 1.5 * Math.sin(u * 0.11 + 0.4);
}

/** Lateral taper of the crest height (wave ends), 0..1. */
export function taper(p: WavePlan, u: number): number {
  const a = Math.abs(u), e0 = p.halfW - 14, e1 = p.halfW + 12;
  if (a <= e0) return 1;
  if (a >= e1) return 0;
  const k = 1 - (a - e0) / (e1 - e0);
  return k * k * (3 - 2 * k);
}

export interface FrontState {
  /** Front (toe) position along the travel axis. */
  s: number;
  /** Seconds since start. */
  t: number;
  /** Crest height now. */
  H: number;
  /** Distance travelled over land. */
  land: number;
  /** 0 = travelling, 1 = stopped (wave collapsed into the flood). */
  done: boolean;
}

export const EMERGE_S = 4;

export function frontStart(p: WavePlan): FrontState {
  return { s: p.sStart, t: 0, H: 0, land: 0, done: false };
}

/**
 * Advance the front by dt. `coastS` is the representative coastline position along the
 * axis: past it the wave slows (0.8x) and its height decays exp(-land/landDecay); it
 * stops when the crest is under 2.5 blocks or at sMax.
 */
export function advanceFront(p: WavePlan, f: FrontState, dt: number, coastS: number): FrontState {
  if (f.done) return f;
  f.t += dt;
  const onLand = f.s > coastS;
  const v = p.speed * (onLand ? 0.8 : 1) * (f.t < EMERGE_S ? 0.5 + 0.5 * (f.t / EMERGE_S) : 1);
  f.s += v * dt;
  if (onLand) f.land += v * dt;
  const emerge = Math.min(1, f.t / EMERGE_S);
  // shoaling: the wall steepens and grows a little as it approaches the coast
  const shoal = 1 + 0.15 * Math.max(0, Math.min(1, 1 - (coastS - f.s) / 60)) * (onLand ? 0 : 1);
  f.H = p.H0 * (0.25 + 0.75 * emerge * emerge) * shoal * Math.exp(-f.land / p.landDecay);
  if ((f.t > EMERGE_S && f.H < 2.5) || f.s >= p.sMax) f.done = true;
  return f;
}

/** Seconds until the front reaches along-coordinate s (ignores slowing on land). */
export function arrivalTime(p: WavePlan, s: number): number {
  const d = s - p.sStart;
  // first EMERGE_S seconds at average 0.75 speed
  const d0 = p.speed * EMERGE_S * 0.75;
  if (d <= d0) return (d / d0) * EMERGE_S;
  return EMERGE_S + (d - d0) / p.speed;
}

/** Maximum inundation depth at the coast for a wave of crest height H. */
export function coastDepth(H: number): number {
  return Math.min(14, Math.round(H * 0.45));
}

/**
 * Flood surface (y of the top water block) for a column at along-coordinate s whose row
 * coastline is at coastS. Land columns decay inland; sea columns within 24 blocks of the
 * coast ramp up from the sea level so the flood joins the sea smoothly. `Hpass` is the crest
 * height when the front passed this column.
 */
export function floodLevel(p: WavePlan, s: number, coastS: number, Hpass: number, sea: boolean): number {
  const depth = coastDepth(p.H0 * 1.1);
  let d: number;
  if (sea) {
    const k = Math.max(0, 1 - (coastS - s) / 24);
    d = depth * k;
  } else {
    d = depth * Math.exp(-Math.max(0, s - coastS) / 50);
  }
  d = Math.min(d, Hpass * 0.75);
  return p.seaY + Math.max(0, Math.round(d));
}

// ------------------------------------------------------------------------------- profile

/** Cross-section control points (a, y) in units of the crest height, back -> toe. */
const STEEP: [number, number][] = [
  [-3.0, 0.0], [-2.3, 0.07], [-1.7, 0.2], [-1.2, 0.4], [-0.8, 0.62], [-0.5, 0.82], [-0.28, 0.95], [-0.1, 1.0], [0.05, 0.98], [0.14, 0.9],
  [0.19, 0.8], [0.2, 0.7], [0.19, 0.6], [0.17, 0.5], [0.15, 0.4], [0.12, 0.3], [0.09, 0.2], [0.06, 0.11], [0.03, 0.04], [0.0, 0.0],
];
const PLUNGE: [number, number][] = [
  [-3.0, 0.0], [-2.3, 0.07], [-1.7, 0.2], [-1.2, 0.4], [-0.8, 0.63], [-0.5, 0.84], [-0.25, 0.97], [0.0, 1.03], [0.28, 1.0], [0.5, 0.9],
  [0.66, 0.74], [0.72, 0.58], [0.64, 0.5], [0.48, 0.52], [0.33, 0.56], [0.22, 0.5], [0.16, 0.38], [0.12, 0.22], [0.06, 0.08], [0.0, 0.0],
];
export const PROFILE_N = 48;
/** Parameter (0..1) of the crest and of the lip tip on the profile. */
export const S_CREST = 7.5 / 19;
export const S_LIP = 11 / 19;

function catmull(pts: [number, number][], t: number): [number, number] {
  const n = pts.length - 1;
  const i = Math.min(n - 1, Math.max(0, Math.floor(t)));
  const f = t - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  const c = (a: number, b: number, cc: number, d: number) => 0.5 * (2 * b + (-a + cc) * f + (2 * a - 5 * b + 4 * cc - d) * f * f + (-a + 3 * b - 3 * cc + d) * f * f * f);
  return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])];
}

/** Resampled profiles: [steep, plunging], each PROFILE_N (a,y) pairs. */
export const PROFILES: [Float32Array, Float32Array] = (() => {
  const res = [STEEP, PLUNGE].map((pts) => {
    const out = new Float32Array(PROFILE_N * 2);
    for (let i = 0; i < PROFILE_N; i++) {
      const [a, y] = catmull(pts, (i / (PROFILE_N - 1)) * (pts.length - 1));
      out[i * 2] = a;
      out[i * 2 + 1] = Math.max(0, y);
    }
    return out;
  });
  return [res[0], res[1]];
})();

/** Profile point (a, y) at parameter s (0..1) and curl c (0 steep .. 1 plunging). */
export function profileAt(s: number, c: number, out: [number, number] = [0, 0]): [number, number] {
  const fi = Math.min(PROFILE_N - 1, Math.max(0, s * (PROFILE_N - 1)));
  const i = Math.floor(fi), j = Math.min(PROFILE_N - 1, i + 1), f = fi - i;
  const [A, B] = PROFILES;
  const a0 = A[i * 2] + (A[j * 2] - A[i * 2]) * f, y0 = A[i * 2 + 1] + (A[j * 2 + 1] - A[i * 2 + 1]) * f;
  const a1 = B[i * 2] + (B[j * 2] - B[i * 2]) * f, y1 = B[i * 2 + 1] + (B[j * 2 + 1] - B[i * 2 + 1]) * f;
  out[0] = a0 + (a1 - a0) * c;
  out[1] = y0 + (y1 - y0) * c;
  return out;
}

/** Curl of the wave (0..1) given the distance of the front to the coast. */
export function curlFor(frontS: number, coastS: number, t: number): number {
  const k = 1 - Math.min(1, Math.max(0, (coastS - frontS) / 70));
  return Math.min(1, 0.15 + 0.85 * k * k + 0.05 * Math.sin(t * 0.7));
}

// ------------------------------------------------------------------------------- puddles

/**
 * Basin solver for draining, over columns: `bottom[i]` is the y of column i's lowest flood
 * cell (or -1 if it has none). A bottom cell keeps its water (a puddle) when each of its 4
 * horizontal neighbours either holds water in (`sealed`) or is itself a kept bottom cell at
 * the same height; cells next to a leak are eroded iteratively. `neighbour(i, d)` returns the
 * column index in direction d (0..3) or -1. Returns 1 for kept columns.
 */
export function solveBasins(n: number, bottom: Int16Array, neighbour: (i: number, d: number) => number, sealed: (i: number, d: number) => boolean): Uint8Array {
  const b = new BasinSolver(n, bottom, neighbour, sealed);
  while (!b.step(Infinity));
  return b.keep;
}

/** Resumable form of solveBasins: call step(deadline) until it returns true. */
export class BasinSolver {
  readonly keep: Uint8Array;
  private queue: Int32Array;
  private qh = 0;
  private qt = 0;
  private init = 0;
  constructor(readonly n: number, readonly bottom: Int16Array, readonly neighbour: (i: number, d: number) => number, readonly sealed: (i: number, d: number) => boolean) {
    this.keep = new Uint8Array(n);
    this.queue = new Int32Array(n * 4 + 4);
  }
  /** Works until `deadline` (performance.now() ms); true when finished. */
  step(deadline: number): boolean {
    const { keep, queue, bottom, n } = this;
    const cap = queue.length;
    const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    let ops = 0;
    for (; this.init < n; this.init++) {
      if ((++ops & 1023) === 0 && clock() > deadline) return false;
      const i = this.init;
      if (bottom[i] >= 0) { keep[i] = 1; queue[this.qt++] = i; }
    }
    while (this.qh !== this.qt) {
      if ((++ops & 127) === 0 && clock() > deadline) return false;
      const i = queue[this.qh];
      this.qh = (this.qh + 1) % cap;
      if (!keep[i]) continue;
      let leaks = false;
      for (let d = 0; d < 4 && !leaks; d++) {
        const j = this.neighbour(i, d);
        if (j >= 0 && keep[j] && bottom[j] === bottom[i]) continue;
        if (!this.sealed(i, d)) leaks = true;
      }
      if (!leaks) continue;
      keep[i] = 0;
      for (let d = 0; d < 4; d++) {
        const j = this.neighbour(i, d);
        if (j >= 0 && keep[j]) { queue[this.qt] = j; this.qt = (this.qt + 1) % cap; }
      }
    }
    return true;
  }
}

/** Sortable packing of (key, index) into one float64 (native typed-array sort, no comparator). */
export function packOrder(keys: Float32Array): Uint32Array {
  const n = keys.length;
  const tmp = new Float64Array(n);
  for (let i = 0; i < n; i++) tmp[i] = Math.floor((keys[i] + 4096) * 64) * 1048576 + i;
  tmp.sort();
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = tmp[i] % 1048576;
  return out;
}
