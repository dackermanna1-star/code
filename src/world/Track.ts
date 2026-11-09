/**
 * Deterministic level layout: the road's centerline, elevation profile, forks,
 * dips (gaps) and the list of placed features (ramps, wrecks, barricades...).
 *
 * Everything here is pure math seeded from the level id, so `heightAt` etc.
 * can be queried anywhere (even for chunks that are not built) and the route
 * is identical on every run.
 *
 * Cross-section of the road at any z (left to right, +X is right):
 *
 *   terrain | shoulder | wall | ... | road (left branch) | island | road (right branch) | ...
 *
 * Outside a fork, `f = 0` and the two branch halves meet in the middle into
 * one 13 m road. Inside a fork they slide apart by ±f and a raised divider
 * island fills the gap.
 */
import type { BiomeId, LevelDef } from "../data/levels";
import { Rng, clamp, lerp, noise1, noise2, smoothstep } from "./rng";

export const CHUNK = 50; // m per streamed chunk
export const HW = 6.5; // half width of a road branch
export const SHOULDER = 10; // road edge -> boundary wall distance
export const BEYOND = 150; // road continues this far past the evac zone
export const START_FLAT = 30; // flat start area length

/** Lateral offsets (m beyond the road edge) of the terrain grid columns. */
export const TERRAIN_D = [0, 0.9, 2.6, 5, 7.6, 10, 11.6, 14, 18, 24, 32, 44, 60, 80, 105, 135];
/** Columns with index < this are part of the static collider. */
export const TERRAIN_COLLIDE = 9;

export interface Fork {
  z0: number; // split begins
  z1: number; // merge complete
  ramp: number; // length of the split/merge transitions
  D: number; // max lateral offset of each branch center
  mainSide: 1 | -1; // which branch is the main (safe) path
}

export interface Dip {
  zc: number;
  half: number; // half length
  depth: number;
  /** 0 = whole road; ±1 = only that branch (sign of x - base). */
  side: 0 | 1 | -1;
}

export type FeatureKind = "ramp" | "lip" | "wreck" | "barricade" | "crates" | "barrels" | "ice";

export interface Feature {
  kind: FeatureKind;
  /** Start z (ramps: leading edge); obstacles: center. */
  z: number;
  /** Length along the road. */
  len: number;
  /** Lateral offset from the lane center. */
  u: number;
  /** Width across the road. */
  w: number;
  /** Height (ramps). */
  h: number;
  /** 0 = main path / whole road; ±1 = fork branch on that side. */
  lane: 0 | 1 | -1;
  variant: string;
  seed: number;
}

/** Biome terrain shape parameters (heights in m beyond the road edge). */
interface TerrainProfile {
  shoulder: number; // rise of the drivable shoulder up to the wall
  curb?: boolean; // city sidewalk curb right at the road edge
  rise: number; // extra rise beyond the wall
  riseD: number; // distance over which `rise` happens
  noise: number; // amplitude of rolling noise far from the road
  noiseScale: number;
  hills: number; // amplitude of the road's rolling hills
  curves: number; // amplitude of the road's lateral curves
}

const PROFILES: Record<BiomeId, TerrainProfile> = {
  desert: { shoulder: 0.45, rise: 3.5, riseD: 50, noise: 4, noiseScale: 50, hills: 9, curves: 24 },
  suburbs: { shoulder: 0.3, rise: 0.5, riseD: 22, noise: 0.7, noiseScale: 40, hills: 5, curves: 16 },
  city: { shoulder: 0.25, curb: true, rise: 0, riseD: 20, noise: 0, noiseScale: 40, hills: 4, curves: 10 },
  frozen: { shoulder: 0.9, rise: 30, riseD: 120, noise: 6, noiseScale: 35, hills: 12, curves: 26 },
  military: { shoulder: 0.5, rise: 2.2, riseD: 30, noise: 1.8, noiseScale: 40, hills: 6, curves: 18 },
};

export class Track {
  readonly length: number;
  readonly endZ: number;
  readonly seed: number;
  readonly profile: TerrainProfile;
  readonly forks: Fork[] = [];
  readonly dips: Dip[] = [];
  readonly features: Feature[] = [];
  /** City overpass positions (z). */
  readonly overpasses: number[] = [];
  /** Distance sign positions. */
  readonly signs: number[] = [];
  /** Reserved z-ranges; `soft` ranges (ramp landings) only block static wrecks. */
  private occupied: { a: number; b: number; lane: number; soft: boolean }[] = [];

  constructor(readonly def: LevelDef) {
    this.length = def.length;
    this.endZ = def.length + BEYOND;
    this.seed = 1013 + def.id * 7919;
    this.profile = PROFILES[def.biome];
    this.layout();
  }

  // ---------------------------------------------------------------- shape

  /** 0 in the flat start area and around the evac zone, 1 elsewhere. */
  flatness(z: number): number {
    return smoothstep(START_FLAT, START_FLAT + 80, z) * (1 - smoothstep(this.length - 150, this.length - 60, z));
  }

  /** Centerline of the (un-forked) road. */
  baseCenter(z: number): number {
    const k = this.flatness(z);
    if (k <= 0) return 0;
    const c = this.profile.curves;
    return k * (c * noise1(z / 290 + 0.31, this.seed + 2) + c * 0.22 * noise1(z / 115 + 0.7, this.seed + 3));
  }

  /** Road elevation ignoring dips. */
  baseHeight(z: number): number {
    const k = this.flatness(z);
    if (k <= 0) return 0;
    const a = this.profile.hills;
    return k * (a * noise1(z / 320 + 0.47, this.seed + 5) + a * 0.33 * noise1(z / 95 + 0.13, this.seed + 6));
  }

  /** Lateral offset of each fork branch from the base center. */
  forkOffset(z: number): number {
    for (const f of this.forks) {
      if (z > f.z0 && z < f.z1) return f.D * (smoothstep(f.z0, f.z0 + f.ramp, z) - smoothstep(f.z1 - f.ramp, f.z1, z));
    }
    return 0;
  }

  forkAt(z: number): Fork | null {
    for (const f of this.forks) if (z >= f.z0 && z <= f.z1) return f;
    return null;
  }

  /** Sum of dip depths affecting the given side (sign of x - base). */
  dipAt(z: number, side: number): number {
    let d = 0;
    for (const p of this.dips) {
      const t = (z - p.zc) / p.half;
      if (t <= -1 || t >= 1) continue;
      if (p.side !== 0 && p.side !== side) continue;
      d -= p.depth * (0.5 + 0.5 * Math.cos(Math.PI * t));
    }
    return d;
  }

  /** Road surface height on a branch side (-1 left, +1 right). */
  roadHeight(z: number, side: number): number {
    return this.baseHeight(z) + this.dipAt(z, side);
  }

  /** Center x of a lane: 0 = main path, ±1 = branch on that side. */
  laneX(z: number, lane: number): number {
    const base = this.baseCenter(z);
    const f = this.forkOffset(z);
    if (lane === 0) {
      const fk = this.forkAt(z);
      return base + (fk ? fk.mainSide * f : 0);
    }
    return base + lane * f;
  }

  leftEdge(z: number): number {
    return this.baseCenter(z) - this.forkOffset(z) - HW;
  }

  rightEdge(z: number): number {
    return this.baseCenter(z) + this.forkOffset(z) + HW;
  }

  /** Island (divider) half-width at z, 0 if none. */
  islandHalf(z: number): number {
    return Math.max(0, this.forkOffset(z) - HW);
  }

  /** Island surface height; t = 0..1 across the island of width w. */
  islandHeight(z: number, t: number, w: number): number {
    const hA = this.roadHeight(z, -1);
    const hB = this.roadHeight(z, 1);
    const curb = 0.3 * clamp(w / 1.5, 0, 1);
    const mound = Math.min(1.3, w * 0.16) * Math.pow(Math.sin(Math.PI * clamp(t, 0, 1)), 0.7);
    const inside = t > 0 && t < 1 ? 1 : 0;
    return lerp(hA, hB, t) + curb * inside + mound;
  }

  /** Terrain height at distance d beyond a road edge on `side`. */
  terrainHeight(d: number, z: number, side: number, x: number): number {
    const p = this.profile;
    const hEdge = this.roadHeight(z, side);
    const blend = smoothstep(SHOULDER, SHOULDER + 22, d);
    const ref = lerp(hEdge, this.baseHeight(z), blend);
    let bank = p.curb ? p.shoulder * smoothstep(0.15, 0.85, d) : p.shoulder * smoothstep(0.9, SHOULDER, d);
    bank += p.rise * smoothstep(SHOULDER + 1.5, p.riseD, d);
    if (p.noise > 0) bank += p.noise * smoothstep(SHOULDER + 2, SHOULDER + 34, d) * (0.6 + 0.6 * noise2(x / p.noiseScale, z / p.noiseScale, this.seed + 11));
    return ref + bank;
  }

  /** Ground surface height (road, island or terrain) at any (x, z). */
  heightAt(x: number, z: number): number {
    const base = this.baseCenter(z);
    const f = this.forkOffset(z);
    const le = base - f - HW;
    const re = base + f + HW;
    if (x < le) return this.terrainHeight(le - x, z, -1, x);
    if (x > re) return this.terrainHeight(x - re, z, 1, x);
    if (f > HW) {
      const a = base - f + HW;
      const b = base + f - HW;
      if (x > a && x < b) return this.islandHeight(z, (x - a) / (b - a), b - a);
    }
    return this.roadHeight(z, x < base ? -1 : 1);
  }

  /** Tire friction multiplier (ice patches in the frozen biome). */
  frictionAt(x: number, z: number): number {
    for (const f of this.features) {
      if (f.kind !== "ice") continue;
      if (z < f.z - f.len / 2 || z > f.z + f.len / 2) continue;
      const cx = this.laneX(z, f.lane) + f.u;
      if (Math.abs(x - cx) < f.w / 2) return 0.25;
    }
    return 1;
  }

  /** Ramp/obstacle features overlapping [z0, z1). */
  featuresIn(z0: number, z1: number): Feature[] {
    return this.features.filter((f) => f.z >= z0 && f.z < z1);
  }

  // --------------------------------------------------------------- layout

  private isFree(a: number, b: number, lane: number, ignoreSoft = false): boolean {
    for (const o of this.occupied) {
      if (b <= o.a || a >= o.b) continue;
      if (ignoreSoft && o.soft) continue;
      if (lane === 0 || o.lane === 0 || lane === o.lane) return false;
    }
    return true;
  }

  private reserve(a: number, b: number, lane: number, soft = false): void {
    this.occupied.push({ a, b, lane, soft });
  }

  /** Zones where nothing random may be placed. */
  private blocked(a: number, b: number): boolean {
    const L = this.length;
    const cp = this.def.checkpointAt;
    if (a < 75 || b > L - 90) return true;
    if (b > cp - 40 && a < cp + 30) return true;
    for (const z of this.overpasses) if (b > z - 45 && a < z + 30) return true;
    for (const f of this.forks) {
      // keep the split and merge transitions clean
      if (b > f.z0 - 20 && a < f.z0 + f.ramp + 10) return true;
      if (b > f.z1 - f.ramp - 10 && a < f.z1 + 20) return true;
    }
    return false;
  }

  private inFork(a: number, b: number): Fork | null {
    for (const f of this.forks) if (b > f.z0 && a < f.z1) return f;
    return null;
  }

  private layout(): void {
    const def = this.def;
    const L = this.length;
    const rng = new Rng(this.seed);
    const biome = def.biome;

    // Distance signs every 250 m (not at the evac).
    for (let z = 250; z < L - 60; z += 250) this.signs.push(z);

    // Forks: one per level, a second one on long levels.
    const forkLen = 270;
    const ramp = 60;
    const f1 = Math.round(L * rng.range(0.19, 0.26));
    this.forks.push({ z0: f1, z1: f1 + forkLen, ramp, D: 11, mainSide: rng.sign() });
    if (L >= 2800) {
      const f2 = Math.round(L * rng.range(0.62, 0.68));
      this.forks.push({ z0: f2, z1: f2 + forkLen, ramp, D: 11, mainSide: rng.sign() });
    }

    // City overpasses.
    if (biome === "city") {
      for (let z = 330; z < L - 200; z += rng.range(420, 560)) {
        if (!this.inFork(z - 50, z + 50) && Math.abs(z - def.checkpointAt) > 70) this.overpasses.push(Math.round(z));
      }
    }

    // Fork contents: the risky branch gets big ramps and a gap; the safe
    // branch gets wrecks and barricades to weave through.
    for (const f of this.forks) {
      const risky = (-f.mainSide) as 1 | -1;
      const safe = f.mainSide;
      const p0 = f.z0 + f.ramp + 5; // island fully formed after ~this
      const p1 = f.z1 - f.ramp - 5;
      // ramp, gap, mega-ramp on the risky side
      this.addRamp(rng, p0 + 4, risky, 2.6, "concrete", 0);
      const dz = (p0 + p1) / 2 + 12;
      this.dips.push({ zc: dz, half: 10, depth: 3.6, side: risky });
      this.addLip(rng, dz - 10, risky, 2.4);
      this.addRamp(rng, p1 - 16, risky, 3.8, rng.pick(this.rampVariants()), 0);
      // obstacles on the safe side
      const n = 4;
      for (let i = 0; i < n; i++) {
        const z = p0 + 10 + (i + 0.5) * ((p1 - p0 - 20) / n);
        const kind = (["wreck", "barricade", "barrels", "wreck"] as const)[i % 4];
        this.addObstacle(rng, kind, z, safe, i % 2 ? 2.2 : -2.2);
      }
    }

    // Gaps on the main road: deep washouts with a takeoff lip.
    for (let z = 380 + rng.range(0, 120); z < L - 200; z += rng.range(480, 680)) {
      for (let tries = 0; tries < 12; tries++, z += 25) {
        const half = rng.range(8, 10);
        const lipLen = 6.5;
        const a = z - half - lipLen - 6;
        const b = z + half + 30;
        if (b > L - 120) break;
        if (this.blocked(a, b) || this.inFork(a - 30, b + 30) || !this.isFree(a, b, 0)) continue;
        this.dips.push({ zc: z, half, depth: rng.range(3, 3.8), side: 0 });
        this.addLip(rng, z - half, 0, rng.range(1.9, 2.5));
        this.reserve(a, b, 0);
        break;
      }
    }

    // Ramps along the main road; more and bigger further in.
    const rf = def.rampFrequency;
    for (let z = 95; z < L - 100; ) {
      const p = z / L;
      const spacing = (100 / (rf * (0.75 + 0.75 * p))) * rng.range(0.75, 1.25);
      const big = rng.chance(0.1 + 0.25 * p);
      const h = big ? rng.range(3.2, 4) : clamp(1.2 + rng.range(0, 1) * (1.0 + 2.2 * p), 1.2, 3.4);
      const variant = rng.pick(this.rampVariants());
      for (let tries = 0; tries < 4; tries++) {
        const zz = z + tries * 12;
        if (this.inFork(zz - 20, zz + 40)) break;
        if (this.addRamp(rng, zz, 0, h, variant, null)) break;
      }
      z += spacing;
    }

    // Obstacles: static wrecks, breakable barricades, crates, explosive barrels.
    const of = def.obstacleFrequency;
    for (let z = 110; z < L - 100; ) {
      const p = z / L;
      const spacing = (100 / (of * (0.75 + 0.75 * p))) * rng.range(0.7, 1.3);
      const kind = rng.weighted<FeatureKind>({ wreck: 3.5, barricade: 3, barrels: 2.2, crates: 1.6 });
      for (let tries = 0; tries < 4; tries++) {
        const zz = z + tries * 9;
        if (this.inFork(zz - 15, zz + 15)) break;
        if (this.addObstacle(rng, kind, zz, 0, null)) break;
      }
      z += spacing;
    }

    // Ice patches (frozen only): cosmetic + low friction, do not reserve.
    if (biome === "frozen") {
      for (let z = 140; z < L - 100; z += rng.range(70, 140)) {
        const w = rng.range(4, 9);
        this.features.push({ kind: "ice", z, len: rng.range(8, 18), u: rng.range(-HW + w / 2, HW - w / 2), w, h: 0, lane: 0, variant: "ice", seed: rng.int(0, 1e9) });
      }
    }

    this.features.sort((a, b) => a.z - b.z);
  }

  private rampVariants(): string[] {
    switch (this.def.biome) {
      case "desert": return ["planks", "dune", "carRamp", "trailer", "planks", "dune"];
      case "suburbs": return ["planks", "carRamp", "dirt", "planks", "trailer"];
      case "city": return ["rubble", "carRamp", "planks", "trailer", "concrete"];
      case "frozen": return ["snow", "planks", "snow", "carRamp", "trailer"];
      case "military": return ["sandbag", "planks", "carRamp", "trailer", "concrete"];
    }
  }

  /**
   * Place a ramp starting at z. `uFixed` null = random lateral position.
   * Returns false if the spot is taken.
   */
  private addRamp(rng: Rng, z: number, lane: 0 | 1 | -1, h: number, variant: string, uFixed: number | null): boolean {
    let w = rng.range(4.6, 6.4);
    let lenK = 2.7;
    if (variant === "trailer") { w = 3.4; lenK = 3.4; h = Math.max(h, 2.2); }
    if (variant === "dune" || variant === "snow" || variant === "dirt" || variant === "rubble") { w += 1.2; lenK = 3.0; }
    if (variant === "concrete") { w = lane === 0 ? 2 * HW : 2 * HW - 0.6; lenK = 2.6; }
    const len = Math.max(3.4, h * lenK);
    const landing = 18 + h * 7;
    const a = z - 6, b = z + len + landing;
    if (lane === 0 && this.blocked(a, b)) return false;
    if (!this.isFree(a, b, lane)) return false;
    const maxU = Math.max(0, HW - w / 2 - 0.4);
    const u = uFixed ?? (variant === "concrete" ? 0 : rng.range(-maxU, maxU));
    this.features.push({ kind: "ramp", z, len, u, w, h, lane, variant, seed: rng.int(0, 1e9) });
    this.reserve(a, z + len + 10, lane);
    this.reserve(z + len + 10, b, lane, true);
    return true;
  }

  /** Full-width takeoff lip ending at zEnd (the edge of a gap). */
  private addLip(rng: Rng, zEnd: number, lane: 0 | 1 | -1, h: number): void {
    const len = h * 2.5;
    this.features.push({ kind: "lip", z: zEnd - len, len, u: 0, w: 2 * HW - (lane === 0 ? 0 : 0.6), h, lane, variant: "lip", seed: rng.int(0, 1e9) });
    this.reserve(zEnd - len - 8, zEnd + 25, lane);
  }

  private addObstacle(rng: Rng, kind: FeatureKind, z: number, lane: 0 | 1 | -1, uFixed: number | null): boolean {
    const len = kind === "wreck" ? 6 : kind === "barricade" ? 3 : 4;
    const a = z - len / 2 - 4, b = z + len / 2 + 6;
    if (lane === 0 && this.blocked(a, b)) return false;
    if (!this.isFree(a, b, lane, kind !== "wreck")) return false;
    const w = kind === "wreck" ? 3 : kind === "barricade" ? rng.range(5, 8) : 3.5;
    const maxU = HW - w / 2 - 0.5;
    const u = uFixed ?? rng.range(-maxU, maxU);
    const variant = kind;
    this.features.push({ kind, z, len, u, w, h: 0, lane, variant, seed: rng.int(0, 1e9) });
    this.reserve(a, b, lane);
    return true;
  }
}
