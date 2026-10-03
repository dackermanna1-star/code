/**
 * Dense structure-of-arrays particle pool.
 *
 * Live particles always occupy indices [0, count): `alloc()` appends, `kill(i)` swap-removes
 * (the last live particle moves into slot i), so iteration is a tight loop over typed arrays and
 * neither allocation nor removal ever allocates memory. Iterate backwards or re-test the same
 * index after `kill(i)`.
 *
 * Pure data (no THREE / DOM dependencies) so it can be unit tested in node.
 */

/** Per-particle flag bits (`flags` array). */
export const enum PFlag {
  /** Collides with blocks (voxel test). */
  Collide = 1,
  /** Resting on the ground (collision checks are skipped until disturbed). */
  Resting = 2,
  /** Re-sample world light when the particle crosses into another block. */
  TrackLight = 4,
  /** Particle has touched the ground at least once. */
  Landed = 8,
  /** Emissive: ignore world light. */
  Emissive = 16,
  /** Generic custom state bit for type-specific behaviour (e.g. drip phase). */
  StateA = 32,
  StateB = 64,
  /** Dies on first ground contact (spawning its "land" sub-effect). */
  DieOnLand = 128,
}

export class ParticlePool {
  readonly capacity: number;
  /** Number of live particles. */
  count = 0;
  /** Total particles ever allocated (stats). */
  allocated = 0;
  /** Allocation requests rejected because the pool was full (stats). */
  dropped = 0;

  // ---- kinematics (positions in double precision: world coordinates can be large)
  readonly px: Float64Array;
  readonly py: Float64Array;
  readonly pz: Float64Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  // ---- lifetime
  readonly age: Float32Array;
  readonly life: Float32Array;
  // ---- appearance
  readonly size: Float32Array;
  readonly rot: Float32Array;
  readonly spin: Float32Array;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  readonly a: Float32Array;
  /** Per-particle random 0..1 (shader variation, curves). */
  readonly seed: Float32Array;
  /** Particle type id. */
  readonly type: Uint8Array;
  /** Sprite (atlas layer) or block texture layer. */
  readonly sprite: Uint16Array;
  readonly flags: Uint16Array;
  /** Packed world light sky<<12 | R<<8 | G<<4 | B. */
  readonly light: Uint16Array;
  /** Hash of the block cell the light was sampled in. */
  readonly cell: Int32Array;
  /** Type specific values (attractor target, uv offsets, emissive, ...). */
  readonly u0: Float32Array;
  readonly u1: Float32Array;
  readonly u2: Float32Array;
  readonly u3: Float32Array;

  /** Every array, for generic copy (swap-remove). */
  private readonly arrays: (Float64Array | Float32Array | Uint8Array | Uint16Array | Int32Array)[];

  constructor(capacity: number) {
    this.capacity = capacity;
    const f64 = () => new Float64Array(capacity);
    const f32 = () => new Float32Array(capacity);
    this.px = f64(); this.py = f64(); this.pz = f64();
    this.vx = f32(); this.vy = f32(); this.vz = f32();
    this.age = f32(); this.life = f32();
    this.size = f32(); this.rot = f32(); this.spin = f32();
    this.r = f32(); this.g = f32(); this.b = f32(); this.a = f32();
    this.seed = f32();
    this.type = new Uint8Array(capacity);
    this.sprite = new Uint16Array(capacity);
    this.flags = new Uint16Array(capacity);
    this.light = new Uint16Array(capacity);
    this.cell = new Int32Array(capacity);
    this.u0 = f32(); this.u1 = f32(); this.u2 = f32(); this.u3 = f32();
    this.arrays = [
      this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.age, this.life, this.size, this.rot, this.spin,
      this.r, this.g, this.b, this.a, this.seed, this.type, this.sprite, this.flags, this.light, this.cell,
      this.u0, this.u1, this.u2, this.u3,
    ];
  }

  get free(): number {
    return this.capacity - this.count;
  }

  /**
   * Allocates a particle and resets its fields to defaults (alive, age 0). Returns the index
   * or -1 when the pool is full.
   */
  alloc(type: number, x: number, y: number, z: number, life: number): number {
    if (this.count >= this.capacity) {
      this.dropped++;
      return -1;
    }
    const i = this.count++;
    this.allocated++;
    this.type[i] = type;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = 0; this.vy[i] = 0; this.vz[i] = 0;
    this.age[i] = 0;
    this.life[i] = life > 1e-4 ? life : 1e-4;
    this.size[i] = 0.1;
    this.rot[i] = 0; this.spin[i] = 0;
    this.r[i] = 1; this.g[i] = 1; this.b[i] = 1; this.a[i] = 1;
    this.seed[i] = Math.random();
    this.sprite[i] = 0;
    this.flags[i] = 0;
    this.light[i] = 0xf000;
    this.cell[i] = 0x7fffffff;
    this.u0[i] = 0; this.u1[i] = 0; this.u2[i] = 0; this.u3[i] = 0;
    return i;
  }

  /** Removes particle i (swap with the last live particle). */
  kill(i: number) {
    const last = --this.count;
    if (i !== last) {
      const arrs = this.arrays;
      for (let k = 0; k < arrs.length; k++) arrs[k][i] = arrs[k][last];
    }
  }

  /** Normalised age 0..1. */
  t(i: number): number {
    const v = this.age[i] / this.life[i];
    return v > 1 ? 1 : v;
  }

  clear() {
    this.count = 0;
  }

  /**
   * Advances ages by dt and removes expired particles (calling `onExpire(i)` first; it must not
   * allocate in this pool — queue sub-effects and spawn them after the step). Returns the number
   * of particles that expired.
   */
  step(dt: number, onExpire?: (i: number) => void): number {
    let n = 0;
    for (let i = 0; i < this.count; ) {
      if ((this.age[i] += dt) >= this.life[i]) {
        onExpire?.(i);
        this.kill(i);
        n++;
        continue; // the former last particle now sits at i and still needs its step
      }
      i++;
    }
    return n;
  }

  /** Swaps two particles. */
  swap(i: number, j: number) {
    if (i === j) return;
    const arrs = this.arrays;
    for (let k = 0; k < arrs.length; k++) {
      const a = arrs[k];
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
  }
}
