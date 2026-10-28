// Approximate local light level for unlit particles/decals, so dust in a dark corridor is dim
// and a puff in a lamp's pool of light is bright. Particles are unlit sprites in Babylon; we
// scale their colour at spawn by this factor instead.
//
// The estimate sums the scene's enabled lights at a point (lights inside clustered light
// containers included): hemispheric = global fill, directional (sun) = a fraction (most of
// the apartment is not in direct sun), point/spot = inverse-square falloff windowed by range
// and the spot cone. The sum is mapped through a soft knee to roughly [0.06, 1.15].
// An integrator may supply an exact sampler instead (createVfx opts.lightLevel).

import type { Light, Scene } from "@babylonjs/core";

/** Fraction of the directional (sun) light assumed to reach a random interior point. */
const SUN_INDOOR = 0.12;
const MIN_LEVEL = 0.06;
const MAX_LEVEL = 1.15;

interface LightLike {
  intensity: number;
  diffuse?: { r: number; g: number; b: number };
  groundColor?: { r: number; g: number; b: number };
  range?: number;
  angle?: number;
  isEnabled(): boolean;
  getClassName(): string;
  getAbsolutePosition?(): { x: number; y: number; z: number };
  direction?: { x: number; y: number; z: number };
  lights?: Light[];
}

function lum(c: { r: number; g: number; b: number } | undefined): number {
  return c ? (c.r + c.g + c.b) / 3 : 1;
}

export class LightSampler {
  /** Optional exact sampler from the integrator (returns a level ~0..1.2). */
  override: ((x: number, y: number, z: number) => number) | null = null;
  private cacheKeys = new Int32Array(256);
  private cacheVals = new Float32Array(256);
  private cacheTime = new Float32Array(256).fill(-1);
  private now = 0;
  private readonly scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /** Advance the cache clock (seconds). */
  tick(dt: number): void {
    this.now += dt;
  }

  /** Light level factor at a world position (cached ~0.3 s per 25 cm cell). */
  sample(x: number, y: number, z: number): number {
    if (!Number.isFinite(x + y + z)) return 0.6;
    const ix = Math.floor(x * 4),
      iy = Math.floor(y * 4),
      iz = Math.floor(z * 4);
    const key = (Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791)) | 0;
    const slot = key & 255;
    if (this.cacheKeys[slot] === key && this.now - this.cacheTime[slot] < 0.3 && this.cacheTime[slot] >= 0) return this.cacheVals[slot];
    const v = this.compute(x, y, z);
    this.cacheKeys[slot] = key;
    this.cacheVals[slot] = v;
    this.cacheTime[slot] = this.now;
    return v;
  }

  private compute(x: number, y: number, z: number): number {
    if (this.override) {
      try {
        const v = this.override(x, y, z);
        if (Number.isFinite(v)) return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, v));
      } catch {
        /* fall back to the estimate */
      }
    }
    let b = 0;
    const lights = this.scene.lights as unknown as LightLike[];
    for (let i = 0; i < lights.length; i++) b += this.contrib(lights[i], x, y, z, 0);
    return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, (b / (b + 0.45)) * 1.45));
  }

  private contrib(l: LightLike, x: number, y: number, z: number, depth: number): number {
    if (!l || !l.isEnabled() || !(l.intensity > 0)) return 0;
    if (Array.isArray(l.lights) && depth === 0) {
      let s = 0;
      for (const c of l.lights as unknown as LightLike[]) s += this.contrib(c, x, y, z, 1);
      return s;
    }
    const cls = l.getClassName();
    const I = l.intensity * lum(l.diffuse);
    if (cls === "HemisphericLight") return l.intensity * (lum(l.diffuse) + lum(l.groundColor)) * 0.5;
    if (cls === "DirectionalLight") return I * SUN_INDOOR;
    if (cls === "PointLight" || cls === "SpotLight") {
      const p = l.getAbsolutePosition?.();
      if (!p) return 0;
      const dx = x - p.x,
        dy = y - p.y,
        dz = z - p.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      let a = I / (d2 + 0.25);
      const range = l.range ?? Infinity;
      if (Number.isFinite(range) && range > 0) {
        const q = Math.min(1, d2 / (range * range));
        a *= (1 - q * q) * (1 - q * q);
      }
      if (cls === "SpotLight" && l.direction && l.angle) {
        const d = Math.sqrt(d2) || 1;
        const cosT = (dx * l.direction.x + dy * l.direction.y + dz * l.direction.z) / (d * (Math.hypot(l.direction.x, l.direction.y, l.direction.z) || 1));
        const cosHalf = Math.cos(l.angle / 2);
        a *= cosT >= cosHalf ? 1 : Math.max(0, 1 - (cosHalf - cosT) * 6) * 0.2; // spill
      }
      return a;
    }
    // Area lights and anything else: treat as weak fill.
    return I * 0.1;
  }
}
