// Micro-debris simulation (PURE MODULE — no Babylon imports, unit-tested under Node).
//
// Tiny fragments (glass crumbs, ceramic chips, wood splinters, gypsum crumbs, ...) have no
// physics bodies. Each one is a ballistic particle with:
//   * gravity + quadratic air drag computed from its real size/density (paper flutters down at
//     ~1–2 m/s, a ceramic chip falls like a stone),
//   * tumbling rotation (quaternion, world-frame angular velocity),
//   * collision against a cached ground height (from the integrator's `groundProbe`, i.e. a
//     physics raycast straight down): bounce with restitution + Coulomb friction impulse,
//     then sliding with kinetic friction while the orientation relaxes into the nearest flat
//     resting pose, then SETTLED: frozen, persistent debris that costs nothing per step.
//   * re-probing when it travelled > 15 cm horizontally (slides off table edges, flies over
//     furniture), when an impact nearby disturbs it (`kick`), and a slow round-robin re-check
//     of settled pieces (debris left on a table falls when the table is gone).
//
// Rendering data lives here too, as dense instance arrays laid out exactly like Babylon
// thin-instance buffers (16-float row-major matrices, 4-float colour, 4-float surf), one array
// set per BIN = (spatial zone, chunk shape). Zones (default: 4 m grid cells) let the renderer
// give each instanced mesh a tight bounding box so room-based light assignment works. Each
// bin's instances are partitioned [settled prefix | moving suffix] so that a frame only needs to
// upload the moving range; scattered changes are tracked in small dirty-range lists.
//
// Hard cap: when full, the OLDEST SETTLED piece is recycled first, then the oldest overall.

import { SHAPE, SHAPE_COUNT, SHAPE_HALF } from "./chunks.ts";

export const MICRO_KINDS = ["glass", "ceramic", "wood", "gypsum", "concrete", "plastic", "metal", "foam", "paper", "soil"] as const;
export type MicroKindName = (typeof MICRO_KINDS)[number];

interface KindDef {
  density: number;
  /** Normal restitution for bounces. */
  restitution: number;
  /** Coulomb friction coefficient against the floor. */
  friction: number;
  shapes: number[];
  /** Cumulative selection weights (same length as shapes, last = 1). */
  cum: number[];
  /** Thin plates use the plate drag model (k = 0.3 / (ρ t)); others the chunk model (0.9 / (ρ s)). */
  plateThickness: number; // physical thickness (m) for plate kinds, 0 = chunky
  /** Lateral flutter acceleration amplitude (m/s²) while airborne (paper, foam). */
  flutter: number;
  /** Multiplier on tumbling spin. */
  spin: number;
}

function kind(d: Omit<KindDef, "cum"> & { weights: number[] }): KindDef {
  const total = d.weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const cum = d.weights.map((w) => (acc += w / total));
  cum[cum.length - 1] = 1;
  return { density: d.density, restitution: d.restitution, friction: d.friction, shapes: d.shapes, cum, plateThickness: d.plateThickness, flutter: d.flutter, spin: d.spin };
}

/** Physical behaviour + shape mix per micro kind (index = MICRO_KINDS order). */
export const KIND_DEFS: readonly KindDef[] = [
  // glass: mostly thin shards (annealed), some cubes (tempered dice)
  kind({ density: 2500, restitution: 0.28, friction: 0.35, shapes: [SHAPE.shardA, SHAPE.shardB, SHAPE.cube], weights: [0.4, 0.35, 0.25], plateThickness: 0.004, flutter: 0, spin: 1 }),
  // ceramic: glazed shards + nuggets
  kind({ density: 2400, restitution: 0.25, friction: 0.45, shapes: [SHAPE.shardA, SHAPE.chipA, SHAPE.chipB], weights: [0.35, 0.35, 0.3], plateThickness: 0, flutter: 0, spin: 1 }),
  // wood: splinters + chips
  kind({ density: 600, restitution: 0.3, friction: 0.55, shapes: [SHAPE.splinter, SHAPE.chipB], weights: [0.7, 0.3], plateThickness: 0, flutter: 0, spin: 1.1 }),
  // gypsum (drywall): crumbs + chips, dead bounce
  kind({ density: 700, restitution: 0.08, friction: 0.75, shapes: [SHAPE.crumb, SHAPE.chipA], weights: [0.55, 0.45], plateThickness: 0, flutter: 0, spin: 0.7 }),
  // concrete / stone
  kind({ density: 2400, restitution: 0.15, friction: 0.7, shapes: [SHAPE.crumb, SHAPE.chipA, SHAPE.chipB], weights: [0.4, 0.35, 0.25], plateThickness: 0, flutter: 0, spin: 0.8 }),
  // plastic: shards + chips, bouncy
  kind({ density: 1100, restitution: 0.42, friction: 0.45, shapes: [SHAPE.shardB, SHAPE.chipB], weights: [0.5, 0.5], plateThickness: 0.002, flutter: 0, spin: 1.2 }),
  // metal: bent flakes + nuggets
  kind({ density: 7800, restitution: 0.35, friction: 0.4, shapes: [SHAPE.flake, SHAPE.chipA], weights: [0.65, 0.35], plateThickness: 0.0008, flutter: 0, spin: 1 }),
  // foam: light crumbs, heavy drag
  kind({ density: 40, restitution: 0.1, friction: 0.85, shapes: [SHAPE.crumb], weights: [1], plateThickness: 0, flutter: 1.5, spin: 0.6 }),
  // paper: flakes that flutter
  kind({ density: 700, restitution: 0.05, friction: 0.6, shapes: [SHAPE.flake], weights: [1], plateThickness: 0.0002, flutter: 4, spin: 0.5 }),
  // soil: crumbs
  kind({ density: 1300, restitution: 0.05, friction: 0.8, shapes: [SHAPE.crumb, SHAPE.chipB], weights: [0.7, 0.3], plateThickness: 0, flutter: 0, spin: 0.6 }),
];

export const MICRO_KIND_INDEX: Readonly<Record<string, number>> = Object.fromEntries(MICRO_KINDS.map((k, i) => [k, i]));

const G = 9.81;
/** Below this impact speed a contact stops bouncing and starts sliding (m/s). */
const BOUNCE_V = 0.35;
/** Horizontal speed under which a sliding piece may settle (m/s). */
const SETTLE_V = 0.04;
/** Re-probe the ground after this much horizontal travel (m). */
const PROBE_R = 0.15;
const PROBE_R2 = PROBE_R * PROBE_R;
/** Probes start this far above the particle so resting pieces find the surface they lie on. */
const PROBE_LIFT = 0.03;
/** Pieces below this height fell out of the building. */
const KILL_Y = -30;
/** Airborne longer than this → stuck somewhere unprobed; remove. */
const MAX_AIR_TIME = 12;
/** Speed clamp (m/s) for robustness against bad inputs. */
const MAX_SPEED = 40;
const NO_GROUND = -1e9;

/** Particle states (plain constants: enums are not erasable TypeScript). */
const St = { Air: 0, Slide: 1, Settled: 2 } as const;

/** Small list of [lo, hi) index ranges with gap merging (thin-instance partial uploads). */
export class DirtyRanges {
  static readonly GAP = 48;
  static readonly MAX = 8;
  lo = new Int32Array(DirtyRanges.MAX);
  hi = new Int32Array(DirtyRanges.MAX);
  n = 0;

  add(i: number): void {
    this.addRange(i, i + 1);
  }

  addRange(a: number, b: number): void {
    if (b <= a) return;
    const gap = DirtyRanges.GAP;
    for (let r = 0; r < this.n; r++) {
      if (a <= this.hi[r] + gap && b >= this.lo[r] - gap) {
        if (a < this.lo[r]) this.lo[r] = a;
        if (b > this.hi[r]) this.hi[r] = b;
        return;
      }
    }
    if (this.n < DirtyRanges.MAX) {
      this.lo[this.n] = a;
      this.hi[this.n] = b;
      this.n++;
      return;
    }
    // Too many ranges: collapse everything into one.
    let lo = a,
      hi = b;
    for (let r = 0; r < this.n; r++) {
      lo = Math.min(lo, this.lo[r]);
      hi = Math.max(hi, this.hi[r]);
    }
    this.lo[0] = lo;
    this.hi[0] = hi;
    this.n = 1;
  }

  /** Merge overlapping/touching ranges and clamp to [0, limit). Call before reading. */
  normalize(limit: number): void {
    // insertion sort by lo (n <= 8)
    for (let i = 1; i < this.n; i++) {
      const l = this.lo[i],
        h = this.hi[i];
      let j = i - 1;
      while (j >= 0 && this.lo[j] > l) {
        this.lo[j + 1] = this.lo[j];
        this.hi[j + 1] = this.hi[j];
        j--;
      }
      this.lo[j + 1] = l;
      this.hi[j + 1] = h;
    }
    let w = 0;
    for (let r = 0; r < this.n; r++) {
      let l = Math.max(0, this.lo[r]);
      const h = Math.min(limit, this.hi[r]);
      if (h <= l) continue;
      if (w > 0 && l <= this.hi[w - 1]) {
        if (h > this.hi[w - 1]) this.hi[w - 1] = h;
        continue;
      }
      this.lo[w] = l;
      this.hi[w] = h;
      w++;
    }
    this.n = w;
  }

  clear(): void {
    this.n = 0;
  }
}

/** Dense thin-instance storage for one bin (zone × chunk shape). */
export class ShapeBuffers {
  readonly zone: number;
  readonly shape: number;
  /** Live instances: [0, settled) frozen, [settled, count) moving. */
  count = 0;
  settled = 0;
  cap = 0;
  mat: Float32Array = new Float32Array(0);
  color: Float32Array = new Float32Array(0);
  surf: Float32Array = new Float32Array(0);
  owner: Int32Array = new Int32Array(0);
  /** Incremented whenever the arrays are reallocated (renderer must re-bind its buffers). */
  version = 0;
  matDirty = new DirtyRanges();
  attrDirty = new DirtyRanges();

  constructor(zone: number, shape: number, initialCap: number) {
    this.zone = zone;
    this.shape = shape;
    this.grow(initialCap);
  }

  grow(newCap: number): void {
    if (newCap <= this.cap) return;
    const mat = new Float32Array(newCap * 16);
    const color = new Float32Array(newCap * 4);
    const surf = new Float32Array(newCap * 4);
    const owner = new Int32Array(newCap);
    mat.set(this.mat.subarray(0, this.count * 16));
    color.set(this.color.subarray(0, this.count * 4));
    surf.set(this.surf.subarray(0, this.count * 4));
    owner.set(this.owner.subarray(0, this.count));
    this.mat = mat;
    this.color = color;
    this.surf = surf;
    this.owner = owner;
    this.cap = newCap;
    this.version++;
    // Everything must be re-uploaded into the new GPU buffers.
    this.matDirty.addRange(0, this.count);
    this.attrDirty.addRange(0, this.count);
  }
}

export interface MicroSpawn {
  kind: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Largest extent of the fragment (m). */
  size: number;
  /** Linear RGB tint (0..1) + metallic in a (the renderer decides the meaning of a). */
  r: number;
  g: number;
  b: number;
  a: number;
  /** World-material surf attribute (albedo layer, normal layer, roughness, emissive). */
  s0: number;
  s1: number;
  s2: number;
  s3: number;
}

export interface MicroSimOptions {
  capacity: number;
  /** Height of the first surface below (x, y, z), or null if none (fell out of the world). */
  groundProbe: (x: number, y: number, z: number) => number | null;
  /** Raycast budget per fixed step (spawn probes + re-probes). Default 48. */
  maxProbesPerStep?: number;
  /** Settled pieces re-checked per step (round robin). Default 3. */
  recheckPerStep?: number;
  /** Spatial zone of a spawn position, 0..MAX_ZONES-1 (default: 4 m grid, see defaultZoneOf). */
  zoneOf?: (x: number, y: number, z: number) => number;
  seed?: number;
}

/** Zone slots (room zones + the fallback grid, see zones.ts). */
export const MAX_ZONES = 80;
/** Zone grid: 8 × 8 cells of ZONE_SIZE m starting at ZONE_ORIGIN (covers the apartment + balcony). */
export const ZONE_SIZE = 4;
export const ZONE_ORIGIN = -8;

export function defaultZoneOf(x: number, _y: number, z: number): number {
  const ix = Math.min(7, Math.max(0, Math.floor((x - ZONE_ORIGIN) / ZONE_SIZE)));
  const iz = Math.min(7, Math.max(0, Math.floor((z - ZONE_ORIGIN) / ZONE_SIZE)));
  return ix + iz * 8;
}

/** Horizontal bounds of a default zone (for mesh bounding boxes). */
export function zoneBounds(zone: number): { x0: number; x1: number; z0: number; z1: number } {
  const ix = zone % 8,
    iz = Math.floor(zone / 8) % 8;
  const x0 = ZONE_ORIGIN + ix * ZONE_SIZE,
    z0 = ZONE_ORIGIN + iz * ZONE_SIZE;
  return { x0, x1: x0 + ZONE_SIZE, z0, z1: z0 + ZONE_SIZE };
}

/** Ballistic micro-debris simulation with persistent settled debris. */
export class MicroSim {
  /** Instance bins indexed by zone * SHAPE_COUNT + shape (null until first used). */
  readonly bins: Array<ShapeBuffers | null> = new Array(MAX_ZONES * SHAPE_COUNT).fill(null);
  /** Bins in creation order (iteration without null checks). */
  readonly activeBins: ShapeBuffers[] = [];
  maxProbesPerStep: number;
  recheckPerStep: number;
  /** Number of ground probes performed (stats). */
  probes = 0;
  /** Spawns rejected because the input was invalid. */
  rejected = 0;
  /** Pieces recycled to make room. */
  recycled = 0;

  private cap = 0;
  private alloc = 0;
  private live = 0;
  private groundProbe: (x: number, y: number, z: number) => number | null;
  private zoneOf: (x: number, y: number, z: number) => number;
  private rngState: number;

  // ---- per-slot SoA state
  private alive = new Uint8Array(0);
  private state = new Uint8Array(0);
  private kindA = new Uint8Array(0);
  private shapeA = new Uint8Array(0);
  private binA = new Uint16Array(0);
  private pq = new Uint8Array(0);
  private gen = new Uint32Array(0);
  private sstamp = new Uint32Array(0);
  private inst = new Int32Array(0);
  private activeIdx = new Int32Array(0);
  private px = new Float32Array(0);
  private py = new Float32Array(0);
  private pz = new Float32Array(0);
  private vx = new Float32Array(0);
  private vy = new Float32Array(0);
  private vz = new Float32Array(0);
  private qx = new Float32Array(0);
  private qy = new Float32Array(0);
  private qz = new Float32Array(0);
  private qw = new Float32Array(0);
  private wx = new Float32Array(0);
  private wy = new Float32Array(0);
  private wz = new Float32Array(0);
  private sx = new Float32Array(0);
  private sy = new Float32Array(0);
  private sz = new Float32Array(0);
  private ground = new Float32Array(0);
  private probeX = new Float32Array(0);
  private probeZ = new Float32Array(0);
  private drag = new Float32Array(0);
  private tState = new Float32Array(0);
  private phase = new Float32Array(0);

  // ---- bookkeeping
  private freeStack = new Int32Array(0);
  private freeTop = 0;
  private active = new Int32Array(0);
  private activeCount = 0;
  // Probe queues: `hiQ` for airborne / sliding pieces (a stale ground height makes them hover
  // past an edge or rest on an invisible plane), `probeQ` for settled re-checks. pq flag per slot:
  // 0 = not queued, 1 = in probeQ, 2 = in hiQ (a stale probeQ entry is skipped when serviced).
  private probeQ = new Int32Array(0);
  private probeQHead = 0;
  private probeQLen = 0;
  private hiQ = new Int32Array(0);
  private hiQHead = 0;
  private hiQLen = 0;
  // FIFO rings (slot + validity stamp) for recycling order
  private spawnRingSlot = new Int32Array(0);
  private spawnRingGen = new Uint32Array(0);
  private spawnHead = 0;
  private spawnLen = 0;
  private settledRingSlot = new Int32Array(0);
  private settledRingStamp = new Uint32Array(0);
  private settledHead = 0;
  private settledLen = 0;
  private settleCounter = 0;
  private recheckCursor = 0;
  private probesLeft = 0;
  private stepId = 0;
  // Per-step probe cache (open addressing; stamp = stepId means valid)
  private static readonly CACHE = 1024;
  private cacheKey = new Int32Array(MicroSim.CACHE);
  private cacheStamp = new Uint32Array(MicroSim.CACHE);
  private cacheVal = new Float32Array(MicroSim.CACHE);
  /** Start height of the cached query (reused only for queries starting at or below it). */
  private cacheY = new Float32Array(MicroSim.CACHE);
  // Last successful probe (provisional ground for spawns beyond the probe budget)
  private lastProbeX = 0;
  private lastProbeZ = 0;
  private lastProbeY = NO_GROUND;
  private lastProbeHit = NO_GROUND;
  private tmpSlots = new Int32Array(256);

  constructor(opts: MicroSimOptions) {
    this.groundProbe = opts.groundProbe;
    this.zoneOf = opts.zoneOf ?? defaultZoneOf;
    this.maxProbesPerStep = opts.maxProbesPerStep ?? 48;
    this.recheckPerStep = opts.recheckPerStep ?? 3;
    this.rngState = (opts.seed ?? 0x2545f491) >>> 0;
    this.setCapacity(opts.capacity);
  }

  /** Live pieces (moving + settled). */
  get count(): number {
    return this.live;
  }
  get movingCount(): number {
    return this.activeCount;
  }
  get settledCount(): number {
    return this.live - this.activeCount;
  }
  get capacity(): number {
    return this.cap;
  }

  // ------------------------------------------------------------------ capacity
  /** Change the hard cap. Shrinking recycles the oldest settled pieces first. */
  setCapacity(capacity: number): void {
    const c = Math.max(1, Math.floor(Number.isFinite(capacity) ? capacity : 1));
    if (c > this.alloc) this.reallocate(c);
    this.cap = c;
    while (this.live > this.cap) {
      if (!this.recycleOne()) break;
    }
  }

  private reallocate(n: number): void {
    const old = this.alloc;
    const g8 = (a: Uint8Array) => {
      const b = new Uint8Array(n);
      b.set(a);
      return b;
    };
    const g32 = (a: Uint32Array) => {
      const b = new Uint32Array(n);
      b.set(a);
      return b;
    };
    const gi = (a: Int32Array) => {
      const b = new Int32Array(n);
      b.set(a);
      return b;
    };
    const gf = (a: Float32Array) => {
      const b = new Float32Array(n);
      b.set(a);
      return b;
    };
    this.alive = g8(this.alive);
    this.state = g8(this.state);
    this.kindA = g8(this.kindA);
    this.shapeA = g8(this.shapeA);
    {
      const b = new Uint16Array(n);
      b.set(this.binA);
      this.binA = b;
    }
    this.pq = g8(this.pq);
    this.gen = g32(this.gen);
    this.sstamp = g32(this.sstamp);
    this.inst = gi(this.inst);
    this.activeIdx = gi(this.activeIdx);
    this.px = gf(this.px);
    this.py = gf(this.py);
    this.pz = gf(this.pz);
    this.vx = gf(this.vx);
    this.vy = gf(this.vy);
    this.vz = gf(this.vz);
    this.qx = gf(this.qx);
    this.qy = gf(this.qy);
    this.qz = gf(this.qz);
    this.qw = gf(this.qw);
    this.wx = gf(this.wx);
    this.wy = gf(this.wy);
    this.wz = gf(this.wz);
    this.sx = gf(this.sx);
    this.sy = gf(this.sy);
    this.sz = gf(this.sz);
    this.ground = gf(this.ground);
    this.probeX = gf(this.probeX);
    this.probeZ = gf(this.probeZ);
    this.drag = gf(this.drag);
    this.tState = gf(this.tState);
    this.phase = gf(this.phase);
    // Free stack: keep existing free slots, add the new ones (highest first so low slots are used first).
    const fs = new Int32Array(n);
    fs.set(this.freeStack.subarray(0, this.freeTop));
    let top = this.freeTop;
    for (let i = n - 1; i >= old; i--) fs[top++] = i;
    this.freeStack = fs;
    this.freeTop = top;
    this.active = gi(this.active);
    // Rings are rebuilt (they only carry recycling hints).
    const ringN = n * 2;
    const ss = new Int32Array(ringN),
      sg = new Uint32Array(ringN);
    for (let k = 0; k < this.spawnLen; k++) {
      const j = (this.spawnHead + k) % this.spawnRingSlot.length;
      ss[k] = this.spawnRingSlot[j];
      sg[k] = this.spawnRingGen[j];
    }
    this.spawnRingSlot = ss;
    this.spawnRingGen = sg;
    this.spawnHead = 0;
    const ts = new Int32Array(ringN),
      tg = new Uint32Array(ringN);
    for (let k = 0; k < this.settledLen; k++) {
      const j = (this.settledHead + k) % this.settledRingSlot.length;
      ts[k] = this.settledRingSlot[j];
      tg[k] = this.settledRingStamp[j];
    }
    this.settledRingSlot = ts;
    this.settledRingStamp = tg;
    this.settledHead = 0;
    // Probe queue (each slot at most once thanks to the pq flag)
    const pq = new Int32Array(n);
    for (let k = 0; k < this.probeQLen; k++) pq[k] = this.probeQ[(this.probeQHead + k) % Math.max(1, this.probeQ.length)];
    this.probeQ = pq;
    this.probeQHead = 0;
    const hq = new Int32Array(n);
    for (let k = 0; k < this.hiQLen; k++) hq[k] = this.hiQ[(this.hiQHead + k) % Math.max(1, this.hiQ.length)];
    this.hiQ = hq;
    this.hiQHead = 0;
    this.alloc = n;
  }

  // ------------------------------------------------------------------ rng
  private rand(): number {
    let t = (this.rngState = (this.rngState + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ------------------------------------------------------------------ spawn
  /**
   * Spawn one piece. Returns the slot index, or -1 when rejected (invalid input, kind out of
   * range, or no room and nothing recyclable).
   */
  spawn(p: MicroSpawn): number {
    const k = p.kind | 0;
    if (k < 0 || k >= KIND_DEFS.length) {
      this.rejected++;
      return -1;
    }
    if (!(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && Number.isFinite(p.size) && p.size > 0)) {
      this.rejected++;
      return -1;
    }
    const i = this.allocSlot();
    if (i < 0) return -1;
    const def = KIND_DEFS[k];
    // shape
    const u = this.rand();
    let shape = def.shapes[def.shapes.length - 1];
    for (let j = 0; j < def.cum.length; j++) {
      if (u <= def.cum[j]) {
        shape = def.shapes[j];
        break;
      }
    }
    const size = Math.min(0.25, Math.max(0.003, p.size));
    // velocity (sanitised + clamped)
    let vx = Number.isFinite(p.vx) ? p.vx : 0,
      vy = Number.isFinite(p.vy) ? p.vy : 0,
      vz = Number.isFinite(p.vz) ? p.vz : 0;
    const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (sp > MAX_SPEED) {
      const f = MAX_SPEED / sp;
      vx *= f;
      vy *= f;
      vz *= f;
    }
    this.gen[i]++;
    this.alive[i] = 1;
    this.state[i] = St.Air;
    this.kindA[i] = k;
    this.shapeA[i] = shape;
    this.pq[i] = 0;
    this.px[i] = p.x;
    this.py[i] = p.y;
    this.pz[i] = p.z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    // random orientation (uniform quaternion, Shoemake)
    const u1 = this.rand(),
      u2 = this.rand() * Math.PI * 2,
      u3 = this.rand() * Math.PI * 2;
    const s1 = Math.sqrt(1 - u1),
      s2 = Math.sqrt(u1);
    this.qx[i] = s1 * Math.sin(u2);
    this.qy[i] = s1 * Math.cos(u2);
    this.qz[i] = s2 * Math.sin(u3);
    this.qw[i] = s2 * Math.cos(u3);
    // tumbling spin ~ speed / size, bounded
    const spin = Math.min(40, Math.max(3, (sp / size) * 0.12)) * def.spin;
    this.randUnitInto(i, spin);
    // per-axis scale jitter
    this.sx[i] = size * (0.85 + this.rand() * 0.3);
    this.sy[i] = size * (0.85 + this.rand() * 0.3);
    this.sz[i] = size * (0.85 + this.rand() * 0.3);
    // drag (quadratic coefficient, 1/m)
    this.drag[i] = def.plateThickness > 0 ? 0.3 / (def.density * Math.max(def.plateThickness, 0.0001)) : 0.9 / (def.density * size);
    this.tState[i] = 0;
    this.phase[i] = this.rand() * 100;
    // render instance (moving tail of its bin)
    let zone = 0;
    try {
      zone = this.zoneOf(p.x, p.y, p.z) | 0;
    } catch {
      zone = 0;
    }
    if (!(zone >= 0 && zone < MAX_ZONES)) zone = 0;
    const bi = zone * SHAPE_COUNT + shape;
    let sb = this.bins[bi];
    if (!sb) {
      sb = new ShapeBuffers(zone, shape, 64);
      this.bins[bi] = sb;
      this.activeBins.push(sb);
    }
    this.binA[i] = bi;
    if (sb.count >= sb.cap) sb.grow(Math.min(Math.max(sb.cap * 2, 64), Math.max(this.cap, sb.cap + 64)));
    const n = sb.count++;
    sb.owner[n] = i;
    this.inst[i] = n;
    const c = n * 4;
    sb.color[c] = p.r;
    sb.color[c + 1] = p.g;
    sb.color[c + 2] = p.b;
    sb.color[c + 3] = p.a;
    sb.surf[c] = p.s0;
    sb.surf[c + 1] = p.s1;
    sb.surf[c + 2] = p.s2;
    sb.surf[c + 3] = p.s3;
    sb.attrDirty.add(n);
    // active list
    this.activeIdx[i] = this.activeCount;
    this.active[this.activeCount++] = i;
    this.live++;
    // recycling ring
    this.ringPush(true, i, this.gen[i]);
    // ground
    this.ground[i] = NO_GROUND;
    this.initialProbe(i);
    this.writeMatrix(i);
    return i;
  }

  private randUnitInto(i: number, mag: number): void {
    const z = this.rand() * 2 - 1;
    const t = this.rand() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    this.wx[i] = r * Math.cos(t) * mag;
    this.wy[i] = r * Math.sin(t) * mag;
    this.wz[i] = z * mag;
  }

  private allocSlot(): number {
    if (this.live < this.cap && this.freeTop > 0) return this.freeStack[--this.freeTop];
    if (!this.recycleOne()) return -1;
    return this.freeTop > 0 ? this.freeStack[--this.freeTop] : -1;
  }

  /** Recycle one piece: oldest settled first, then oldest overall. */
  private recycleOne(): boolean {
    while (this.settledLen > 0) {
      const j = this.settledHead;
      const slot = this.settledRingSlot[j],
        stamp = this.settledRingStamp[j];
      this.settledHead = (this.settledHead + 1) % this.settledRingSlot.length;
      this.settledLen--;
      if (this.alive[slot] && this.state[slot] === St.Settled && this.sstamp[slot] === stamp) {
        this.kill(slot);
        this.recycled++;
        return true;
      }
    }
    while (this.spawnLen > 0) {
      const j = this.spawnHead;
      const slot = this.spawnRingSlot[j],
        g = this.spawnRingGen[j];
      this.spawnHead = (this.spawnHead + 1) % this.spawnRingSlot.length;
      this.spawnLen--;
      if (this.alive[slot] && this.gen[slot] === g) {
        this.kill(slot);
        this.recycled++;
        return true;
      }
    }
    return false;
  }

  private ringPush(spawnRing: boolean, slot: number, stamp: number): void {
    if (spawnRing) {
      const n = this.spawnRingSlot.length;
      if (this.spawnLen === n) {
        this.spawnHead = (this.spawnHead + 1) % n;
        this.spawnLen--;
      }
      const j = (this.spawnHead + this.spawnLen) % n;
      this.spawnRingSlot[j] = slot;
      this.spawnRingGen[j] = stamp;
      this.spawnLen++;
    } else {
      const n = this.settledRingSlot.length;
      if (this.settledLen === n) {
        this.settledHead = (this.settledHead + 1) % n;
        this.settledLen--;
      }
      const j = (this.settledHead + this.settledLen) % n;
      this.settledRingSlot[j] = slot;
      this.settledRingStamp[j] = stamp;
      this.settledLen++;
    }
  }

  // ------------------------------------------------------------------ ground probes
  // Per-step cache of ground probes on a 4 cm horizontal grid. Several entries per cell (one per
  // start height) live in the open-addressing run. A probe started at height Y0 returned the
  // first surface v below Y0; it answers a query from y <= Y0 exactly when v <= y (nothing lies
  // between v and Y0, hence nothing between v and y). A query from ABOVE the cached start (a
  // piece on a thin table top vs a probe from under it) never reuses it.
  private cacheSlot(x: number, z: number): number {
    const ix = Math.floor(x * 25),
      iz = Math.floor(z * 25);
    return (Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663)) | 0;
  }

  /** Look up the per-step cache; returns NaN on miss. */
  private cacheGet(key: number, y: number): number {
    const mask = MicroSim.CACHE - 1;
    let h = key & mask;
    for (let probe = 0; probe < 6; probe++) {
      if (this.cacheStamp[h] !== this.stepId) return NaN;
      if (this.cacheKey[h] === key && this.cacheY[h] >= y - 1e-4) {
        const v = this.cacheVal[h];
        if (v <= y + PROBE_LIFT) return v;
      }
      h = (h + 1) & mask;
    }
    return NaN;
  }

  private cachePut(key: number, v: number, y: number): void {
    const mask = MicroSim.CACHE - 1;
    let h = key & mask;
    for (let probe = 0; probe < 6; probe++) {
      if (this.cacheStamp[h] !== this.stepId || (this.cacheKey[h] === key && Math.abs(this.cacheY[h] - y) < 0.03)) {
        this.cacheStamp[h] = this.stepId;
        this.cacheKey[h] = key;
        this.cacheVal[h] = v;
        this.cacheY[h] = y;
        return;
      }
      h = (h + 1) & mask;
    }
  }

  /** Probe (cached / budgeted). Returns ground height, NO_GROUND for none, NaN if over budget. */
  private probeAt(x: number, y: number, z: number): number {
    const key = this.cacheSlot(x, z);
    const c = this.cacheGet(key, y);
    if (c === c) return c;
    if (this.probesLeft <= 0) return NaN;
    this.probesLeft--;
    this.probes++;
    let h: number | null;
    try {
      h = this.groundProbe(x, y + PROBE_LIFT, z);
    } catch {
      h = null;
    }
    const v = h === null || !Number.isFinite(h) ? NO_GROUND : Math.min(h, y + PROBE_LIFT);
    this.cachePut(key, v, y);
    if (v > NO_GROUND) {
      this.lastProbeX = x;
      this.lastProbeZ = z;
      this.lastProbeY = y;
      this.lastProbeHit = v;
    }
    return v;
  }

  private initialProbe(i: number): void {
    const x = this.px[i],
      y = this.py[i],
      z = this.pz[i];
    const v = this.probeAt(x, y, z);
    if (v === v) {
      this.ground[i] = v;
      this.probeX[i] = x;
      this.probeZ[i] = z;
      return;
    }
    // Over budget: borrow the last nearby probe (same burst) and queue a real one.
    const dx = x - this.lastProbeX,
      dz = z - this.lastProbeZ;
    if (this.lastProbeHit > NO_GROUND && dx * dx + dz * dz < 1.0 && this.lastProbeHit <= y + PROBE_LIFT) {
      this.ground[i] = this.lastProbeHit;
    }
    this.probeX[i] = x;
    this.probeZ[i] = z;
    this.queueProbe(i);
  }

  private queueProbe(i: number): void {
    const f = this.pq[i];
    if (f === 2) return;
    if (this.state[i] !== St.Settled) {
      // moving piece: high priority (promoted even if it already waits in the plain queue)
      const n = this.hiQ.length;
      if (this.hiQLen >= n) return;
      this.hiQ[(this.hiQHead + this.hiQLen) % n] = i;
      this.hiQLen++;
      this.pq[i] = 2;
      return;
    }
    if (f === 1) return;
    const n = this.probeQ.length;
    if (this.probeQLen >= n) return;
    this.probeQ[(this.probeQHead + this.probeQLen) % n] = i;
    this.probeQLen++;
    this.pq[i] = 1;
  }

  /** Pending probes (both queues; stats/tests). */
  get queuedProbes(): number {
    return this.probeQLen + this.hiQLen;
  }

  private serviceProbes(): void {
    // moving pieces first
    const nh = this.hiQ.length;
    while (this.hiQLen > 0 && this.probesLeft > 0) {
      const i = this.hiQ[this.hiQHead];
      this.hiQHead = (this.hiQHead + 1) % nh;
      this.hiQLen--;
      if (this.pq[i] !== 2) continue;
      this.pq[i] = 0;
      if (!this.serviceOne(i)) return;
    }
    const n = this.probeQ.length;
    while (this.probeQLen > 0 && this.probesLeft > 0) {
      const i = this.probeQ[this.probeQHead];
      this.probeQHead = (this.probeQHead + 1) % n;
      this.probeQLen--;
      if (this.pq[i] !== 1) continue; // promoted to the high-priority queue (or killed)
      this.pq[i] = 0;
      if (!this.serviceOne(i)) return;
    }
  }

  /** Probe one queued slot; false when the budget ran out (the slot is requeued). */
  private serviceOne(i: number): boolean {
    if (!this.alive[i]) return true;
    const x = this.px[i],
      y = this.py[i],
      z = this.pz[i];
    const v = this.probeAt(x, y, z);
    if (v !== v) {
      this.queueProbe(i);
      return false;
    }
    this.applyProbe(i, v, x, z);
    return true;
  }

  private applyProbe(i: number, v: number, x: number, z: number): void {
    const old = this.ground[i];
    this.ground[i] = v;
    this.probeX[i] = x;
    this.probeZ[i] = z;
    const st = this.state[i];
    if (st === St.Slide) {
      if (v < old - 0.01) {
        // slid off an edge: fall
        this.state[i] = St.Air;
        this.tState[i] = 0;
      }
    } else if (st === St.Settled) {
      if (v < old - 0.015) {
        // whatever it was resting on is gone
        this.wake(i);
      } else {
        this.ground[i] = old; // keep the exact resting height
      }
    }
  }

  // ------------------------------------------------------------------ simulation
  /** Advance the simulation by dt seconds (call once per fixed step). */
  step(dt: number): void {
    if (!(dt > 0)) return;
    if (dt > 0.05) dt = 0.05;
    this.stepId = (this.stepId + 1) >>> 0 || 1;
    // Raise the budget while many moving pieces wait for a fresh ground height (a big shatter
    // thrown off a counter), up to 3× the nominal budget.
    this.probesLeft = this.maxProbesPerStep + Math.min(2 * this.maxProbesPerStep, this.hiQLen >> 2);
    if (this.lowWaterMarks.length < this.activeBins.length) this.lowWaterMarks = new Int32Array(this.bins.length);
    const lowWater = this.lowWaterMarks;
    const nb = this.activeBins.length;
    for (let s = 0; s < nb; s++) lowWater[s] = this.activeBins[s].settled;
    // Service the probe queue BEFORE integrating so this step uses fresh heights.
    this.serviceProbes();

    const airSpin = Math.exp(-0.25 * dt);
    const slideSpin = Math.exp(-10 * dt);
    const relax = 1 - Math.exp(-14 * dt);
    const gdt = G * dt;

    for (let ai = 0; ai < this.activeCount; ai++) {
      const i = this.active[ai];
      let x = this.px[i],
        y = this.py[i],
        z = this.pz[i];
      let vx = this.vx[i],
        vy = this.vy[i],
        vz = this.vz[i];
      let st = this.state[i];
      const kd = KIND_DEFS[this.kindA[i]];
      const t = (this.tState[i] += dt);

      if (st === St.Air) {
        vy -= gdt;
        if (kd.flutter > 0) {
          const ph = this.phase[i] + t;
          vx += kd.flutter * Math.sin(ph * 7.3) * dt;
          vz += kd.flutter * Math.cos(ph * 5.1) * dt;
        }
        const sp2 = vx * vx + vy * vy + vz * vz;
        const k = this.drag[i];
        if (sp2 > 1e-10) {
          const f = 1 / (1 + k * Math.sqrt(sp2) * dt);
          vx *= f;
          vy *= f;
          vz *= f;
        }
        x += vx * dt;
        y += vy * dt;
        z += vz * dt;
        this.integrateSpin(i, dt, airSpin);
      } else {
        // sliding on the ground: kinetic friction + spin damping + pose relaxation
        const vt = Math.sqrt(vx * vx + vz * vz);
        if (vt > 1e-9) {
          const dv = Math.min(vt, kd.friction * gdt);
          const f = (vt - dv) / vt;
          vx *= f;
          vz *= f;
        }
        vy = 0;
        x += vx * dt;
        z += vz * dt;
        this.integrateSpin(i, dt, slideSpin);
      }

      // Robustness: kill anything that went non-finite.
      if (!(x === x && y === y && z === z)) {
        this.kill(i);
        ai--;
        continue;
      }

      // Horizontal travel → re-probe the ground (edges, furniture).
      const dxp = x - this.probeX[i],
        dzp = z - this.probeZ[i];
      if (dxp * dxp + dzp * dzp > PROBE_R2) this.queueProbe(i);

      const gy = this.ground[i];
      if (st === St.Air) {
        const h = this.halfHeight(i);
        if (y - h <= gy) {
          y = gy + h;
          if (vy < -BOUNCE_V) {
            const vin = -vy;
            const e = kd.restitution * (0.75 + 0.5 * this.rand());
            vy = vin * e;
            const vt = Math.sqrt(vx * vx + vz * vz);
            if (vt > 1e-9) {
              const dv = Math.min(vt, kd.friction * (1 + e) * vin);
              const f = (vt - dv) / vt;
              vx *= f;
              vz *= f;
            }
            // impacts scramble the tumbling
            const size = Math.max(this.sx[i], this.sy[i], this.sz[i]);
            const spin = Math.min(35, (vin / size) * 0.2) * kd.spin;
            const owx = this.wx[i] * 0.35,
              owy = this.wy[i] * 0.35,
              owz = this.wz[i] * 0.35;
            this.randUnitInto(i, spin);
            this.wx[i] += owx;
            this.wy[i] += owy;
            this.wz[i] += owz;
          } else {
            vy = 0;
            st = St.Slide;
            this.state[i] = st;
            this.tState[i] = 0;
          }
        } else if (y < KILL_Y || t > MAX_AIR_TIME) {
          this.kill(i);
          ai--;
          continue;
        }
      }

      if (st === St.Slide) {
        const angle = this.relaxPose(i, relax);
        y = gy + this.halfHeight(i);
        const vt2 = vx * vx + vz * vz;
        if ((vt2 < SETTLE_V * SETTLE_V && angle < 0.05) || this.tState[i] > 1.5) {
          this.px[i] = x;
          this.py[i] = y;
          this.pz[i] = z;
          this.settle(i);
          ai--;
          continue;
        }
      }

      this.px[i] = x;
      this.py[i] = y;
      this.pz[i] = z;
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.vz[i] = vz;
      this.writeMatrix(i);
    }

    this.recheckSettled();
    // Moving regions (plus anything that settled this step) need re-upload. Bins created during
    // this step (index >= nb) were fully marked dirty by their spawns.
    for (let s = 0; s < nb; s++) {
      const sb = this.activeBins[s];
      const lo = Math.min(lowWater[s], sb.settled);
      if (sb.count > lo) sb.matDirty.addRange(lo, sb.count);
    }
  }
  private lowWaterMarks = new Int32Array(MAX_ZONES * SHAPE_COUNT);

  /** Integrate orientation by the world-frame angular velocity, then damp the spin. */
  private integrateSpin(i: number, dt: number, damp: number): void {
    const wx = this.wx[i],
      wy = this.wy[i],
      wz = this.wz[i];
    if (wx * wx + wy * wy + wz * wz < 1e-6) return;
    const qx = this.qx[i],
      qy = this.qy[i],
      qz = this.qz[i],
      qw = this.qw[i];
    const h = 0.5 * dt;
    // q' = q + ½ dt (ω, 0) ⊗ q   (Hamilton product, world-frame ω)
    let nx = qx + h * (wx * qw + wy * qz - wz * qy);
    let ny = qy + h * (-wx * qz + wy * qw + wz * qx);
    let nz = qz + h * (wx * qy - wy * qx + wz * qw);
    let nw = qw + h * (-wx * qx - wy * qy - wz * qz);
    const l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
    nx *= l;
    ny *= l;
    nz *= l;
    nw *= l;
    this.qx[i] = nx;
    this.qy[i] = ny;
    this.qz[i] = nz;
    this.qw[i] = nw;
    this.wx[i] = wx * damp;
    this.wy[i] = wy * damp;
    this.wz[i] = wz * damp;
  }

  /** Vertical half-extent of the oriented box (support function along +Y). */
  private halfHeight(i: number): number {
    const qx = this.qx[i],
      qy = this.qy[i],
      qz = this.qz[i],
      qw = this.qw[i];
    const s3 = this.shapeA[i] * 3;
    const r10 = 2 * (qx * qy + qw * qz);
    const r11 = 1 - 2 * (qx * qx + qz * qz);
    const r12 = 2 * (qy * qz - qw * qx);
    return Math.abs(r10) * SHAPE_HALF[s3] * this.sx[i] + Math.abs(r11) * SHAPE_HALF[s3 + 1] * this.sy[i] + Math.abs(r12) * SHAPE_HALF[s3 + 2] * this.sz[i];
  }

  /**
   * Rotate a fraction `frac` of the way towards the nearest flat resting pose (the local axis
   * closest to vertical becomes exactly vertical). Returns the remaining angle (rad).
   */
  private relaxPose(i: number, frac: number): number {
    const qx = this.qx[i],
      qy = this.qy[i],
      qz = this.qz[i],
      qw = this.qw[i];
    // Columns of R = world directions of the local axes; we need their x/y/z components.
    const r10 = 2 * (qx * qy + qw * qz),
      r11 = 1 - 2 * (qx * qx + qz * qz),
      r12 = 2 * (qy * qz - qw * qx);
    let ax: number, ay: number, az: number;
    const a0 = Math.abs(r10),
      a1 = Math.abs(r11),
      a2 = Math.abs(r12);
    if (a1 >= a0 && a1 >= a2) {
      ax = 2 * (qx * qy - qw * qz);
      ay = r11;
      az = 2 * (qy * qz + qw * qx);
    } else if (a0 >= a2) {
      ax = 1 - 2 * (qy * qy + qz * qz);
      ay = r10;
      az = 2 * (qx * qz - qw * qy);
    } else {
      ax = 2 * (qx * qz + qw * qy);
      ay = r12;
      az = 1 - 2 * (qx * qx + qy * qy);
    }
    const s = ay >= 0 ? 1 : -1;
    const cosT = Math.min(1, Math.abs(ay));
    const theta = Math.acos(cosT);
    if (theta < 1e-4) return 0;
    // axis = a × (0, s, 0) = (-az s, 0, ax s), |axis| = sin θ
    let nx = -az * s,
      nz = ax * s;
    const nl = Math.sqrt(nx * nx + nz * nz);
    if (nl < 1e-9) return 0;
    nx /= nl;
    nz /= nl;
    const step = theta < 0.02 ? theta : theta * frac;
    const half = step * 0.5;
    const sn = Math.sin(half),
      cs = Math.cos(half);
    const dx = nx * sn,
      dz = nz * sn,
      dw = cs; // dy = 0
    // q ← d ⊗ q
    let rx = dw * qx + dx * qw - dz * qy;
    let ry = dw * qy - dx * qz + dz * qx;
    let rz = dw * qz + dx * qy + dz * qw;
    let rw = dw * qw - dx * qx - dz * qz;
    const l = 1 / Math.sqrt(rx * rx + ry * ry + rz * rz + rw * rw);
    rx *= l;
    ry *= l;
    rz *= l;
    rw *= l;
    this.qx[i] = rx;
    this.qy[i] = ry;
    this.qz[i] = rz;
    this.qw[i] = rw;
    return theta - step;
  }

  /** Write the instance matrix (Babylon row-major layout: rows = scaled local axes, row 3 = translation). */
  private writeMatrix(i: number): void {
    const sb = this.bins[this.binA[i]]!;
    const o = this.inst[i] * 16;
    const m = sb.mat;
    const x = this.qx[i],
      y = this.qy[i],
      z = this.qz[i],
      w = this.qw[i];
    const xx = x * x,
      yy = y * y,
      zz = z * z,
      xy = x * y,
      xz = x * z,
      yz = y * z,
      wx = w * x,
      wy = w * y,
      wz = w * z;
    const sx = this.sx[i],
      sy = this.sy[i],
      sz = this.sz[i];
    m[o] = (1 - 2 * (yy + zz)) * sx;
    m[o + 1] = 2 * (xy + wz) * sx;
    m[o + 2] = 2 * (xz - wy) * sx;
    m[o + 3] = 0;
    m[o + 4] = 2 * (xy - wz) * sy;
    m[o + 5] = (1 - 2 * (xx + zz)) * sy;
    m[o + 6] = 2 * (yz + wx) * sy;
    m[o + 7] = 0;
    m[o + 8] = 2 * (xz + wy) * sz;
    m[o + 9] = 2 * (yz - wx) * sz;
    m[o + 10] = (1 - 2 * (xx + yy)) * sz;
    m[o + 11] = 0;
    m[o + 12] = this.px[i];
    m[o + 13] = this.py[i];
    m[o + 14] = this.pz[i];
    m[o + 15] = 1;
  }

  // ------------------------------------------------------------------ partition ops
  private swapInstances(sb: ShapeBuffers, a: number, b: number): void {
    if (a === b) return;
    const ma = a * 16,
      mb = b * 16;
    const m = sb.mat;
    for (let k = 0; k < 16; k++) {
      const t = m[ma + k];
      m[ma + k] = m[mb + k];
      m[mb + k] = t;
    }
    const ca = a * 4,
      cb = b * 4;
    for (let k = 0; k < 4; k++) {
      let t = sb.color[ca + k];
      sb.color[ca + k] = sb.color[cb + k];
      sb.color[cb + k] = t;
      t = sb.surf[ca + k];
      sb.surf[ca + k] = sb.surf[cb + k];
      sb.surf[cb + k] = t;
    }
    const oa = sb.owner[a],
      ob = sb.owner[b];
    sb.owner[a] = ob;
    sb.owner[b] = oa;
    this.inst[ob] = a;
    this.inst[oa] = b;
    sb.matDirty.add(a);
    sb.matDirty.add(b);
    sb.attrDirty.add(a);
    sb.attrDirty.add(b);
  }

  /** Move instance `from` into slot `to` (overwriting it). */
  private moveInstance(sb: ShapeBuffers, from: number, to: number): void {
    if (from === to) return;
    sb.mat.copyWithin(to * 16, from * 16, from * 16 + 16);
    sb.color.copyWithin(to * 4, from * 4, from * 4 + 4);
    sb.surf.copyWithin(to * 4, from * 4, from * 4 + 4);
    const o = sb.owner[from];
    sb.owner[to] = o;
    this.inst[o] = to;
    sb.matDirty.add(to);
    sb.attrDirty.add(to);
  }

  private activeRemove(i: number): void {
    const ai = this.activeIdx[i];
    if (ai < 0) return;
    const last = this.active[--this.activeCount];
    this.active[ai] = last;
    this.activeIdx[last] = ai;
    this.activeIdx[i] = -1;
  }

  private activeAdd(i: number): void {
    if (this.activeIdx[i] >= 0) return;
    this.activeIdx[i] = this.activeCount;
    this.active[this.activeCount++] = i;
  }

  private settle(i: number): void {
    // Snap fully into the resting pose.
    for (let k = 0; k < 4; k++) if (this.relaxPose(i, 1) < 1e-4) break;
    this.py[i] = this.ground[i] + this.halfHeight(i);
    this.vx[i] = this.vy[i] = this.vz[i] = 0;
    this.wx[i] = this.wy[i] = this.wz[i] = 0;
    this.state[i] = St.Settled;
    this.tState[i] = 0;
    this.activeRemove(i);
    const sb = this.bins[this.binA[i]]!;
    this.writeMatrix(i);
    this.swapInstances(sb, this.inst[i], sb.settled);
    sb.settled++;
    this.sstamp[i] = ++this.settleCounter;
    this.ringPush(false, i, this.sstamp[i]);
  }

  /** Make a settled piece dynamic again. */
  private wake(i: number): void {
    if (this.state[i] !== St.Settled) return;
    const sb = this.bins[this.binA[i]]!;
    sb.settled--;
    this.swapInstances(sb, this.inst[i], sb.settled);
    this.state[i] = St.Air;
    this.tState[i] = 0;
    this.activeAdd(i);
  }

  private kill(i: number): void {
    if (!this.alive[i]) return;
    const sb = this.bins[this.binA[i]]!;
    const idx = this.inst[i];
    if (this.state[i] === St.Settled) {
      // hole in the settled prefix: fill with the last settled, then fill that with the last moving
      const lastSettled = sb.settled - 1;
      this.moveInstance(sb, lastSettled, idx);
      const last = sb.count - 1;
      if (last !== lastSettled) this.moveInstance(sb, last, lastSettled);
      sb.settled--;
    } else {
      this.moveInstance(sb, sb.count - 1, idx);
      this.activeRemove(i);
    }
    sb.count--;
    this.alive[i] = 0;
    this.inst[i] = -1;
    this.live--;
    this.freeStack[this.freeTop++] = i;
  }

  /** Round-robin re-check of a few settled pieces: did their support disappear? */
  private recheckSettled(): void {
    if (this.recheckPerStep <= 0 || this.live === this.activeCount) return;
    let checked = 0;
    let scanned = 0;
    const maxScan = 64;
    while (checked < this.recheckPerStep && scanned < maxScan && this.probesLeft > 0) {
      const i = this.recheckCursor;
      this.recheckCursor = (this.recheckCursor + 1) % this.alloc;
      scanned++;
      if (!this.alive[i] || this.state[i] !== St.Settled) continue;
      checked++;
      const v = this.probeAt(this.px[i], this.py[i] - this.halfHeight(i) + 0.005, this.pz[i]);
      if (v === v) this.applyProbe(i, v, this.px[i], this.pz[i]);
    }
  }

  // ------------------------------------------------------------------ disturbances
  /**
   * Shock from an impact/explosion at (x, y, z): pieces within `radius` get a velocity kick of
   * up to `speed` (m/s), falling off with distance, mostly upwards/outwards. Settled pieces
   * wake up. Returns the number of pieces disturbed.
   */
  kick(x: number, y: number, z: number, radius: number, speed: number): number {
    if (!(radius > 0 && speed > 0 && Number.isFinite(x + y + z))) return 0;
    const r2 = radius * radius;
    let n = 0;
    for (const sb of this.activeBins) {
      for (let k = 0; k < sb.count; k++) {
        const i = sb.owner[k];
        const dx = this.px[i] - x,
          dy = (this.py[i] - y) * 1.5,
          dz = this.pz[i] - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) continue;
        if (n >= this.tmpSlots.length) {
          const t = new Int32Array(this.tmpSlots.length * 2);
          t.set(this.tmpSlots);
          this.tmpSlots = t;
        }
        this.tmpSlots[n++] = i;
      }
    }
    for (let k = 0; k < n; k++) {
      const i = this.tmpSlots[k];
      const dx = this.px[i] - x,
        dz = this.pz[i] - z;
      const dh = Math.sqrt(dx * dx + dz * dz);
      const d = Math.sqrt(dh * dh + (this.py[i] - y) * (this.py[i] - y));
      const f = 1 - Math.min(1, d / radius);
      const v = speed * f * f * (0.5 + 0.7 * this.rand());
      if (v < 0.05) continue;
      const kd = KIND_DEFS[this.kindA[i]];
      if (this.state[i] === St.Settled) this.wake(i);
      const ux = dh > 1e-6 ? dx / dh : this.rand() - 0.5,
        uz = dh > 1e-6 ? dz / dh : this.rand() - 0.5;
      this.vx[i] += ux * v * 0.6;
      this.vz[i] += uz * v * 0.6;
      this.vy[i] = Math.max(this.vy[i], 0) + v * (0.6 + 0.4 * this.rand());
      this.state[i] = St.Air;
      this.tState[i] = 0;
      const size = Math.max(this.sx[i], this.sy[i], this.sz[i]);
      this.randUnitInto(i, Math.min(30, (v / size) * 0.15) * kd.spin);
    }
    return n;
  }

  /** Re-probe settled pieces near a point (something under them may have moved/broken). */
  disturb(x: number, y: number, z: number, radius: number): void {
    if (!(radius > 0)) return;
    const r2 = radius * radius;
    for (const sb of this.activeBins) {
      for (let k = 0; k < sb.settled; k++) {
        const i = sb.owner[k];
        const dx = this.px[i] - x,
          dy = this.py[i] - y,
          dz = this.pz[i] - z;
        if (dx * dx + dy * dy + dz * dz <= r2) this.queueProbe(i);
      }
    }
  }

  /** Remove every piece. */
  clear(): void {
    for (let i = 0; i < this.alloc; i++) if (this.alive[i]) this.kill(i);
    this.spawnLen = this.settledLen = this.probeQLen = this.hiQLen = 0;
    for (const sb of this.activeBins) {
      sb.matDirty.clear();
      sb.attrDirty.clear();
    }
  }

  // ------------------------------------------------------------------ introspection (tests/debug)
  /** Snapshot of one slot (tests). */
  debugSlot(i: number): { alive: boolean; state: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; ground: number; shape: number; bin: number; inst: number; up: number } {
    const qx = this.qx[i],
      qy = this.qy[i],
      qz = this.qz[i],
      qw = this.qw[i];
    const r10 = 2 * (qx * qy + qw * qz),
      r11 = 1 - 2 * (qx * qx + qz * qz),
      r12 = 2 * (qy * qz - qw * qx);
    return {
      alive: !!this.alive[i],
      state: this.state[i],
      x: this.px[i],
      y: this.py[i],
      z: this.pz[i],
      vx: this.vx[i],
      vy: this.vy[i],
      vz: this.vz[i],
      ground: this.ground[i],
      shape: this.shapeA[i],
      bin: this.binA[i],
      inst: this.inst[i],
      up: Math.max(Math.abs(r10), Math.abs(r11), Math.abs(r12)),
    };
  }

  /** Verify internal invariants (tests). Returns an error message or null. */
  checkInvariants(): string | null {
    let live = 0;
    for (let b = 0; b < this.bins.length; b++) {
      const sb = this.bins[b];
      if (!sb) continue;
      const s = b;
      if (sb.settled < 0 || sb.settled > sb.count) return `bin ${s}: settled ${sb.settled} count ${sb.count}`;
      for (let k = 0; k < sb.count; k++) {
        const i = sb.owner[k];
        if (!this.alive[i]) return `bin ${s} inst ${k}: owner ${i} dead`;
        if (this.inst[i] !== k) return `bin ${s} inst ${k}: owner ${i} has inst ${this.inst[i]}`;
        if (this.binA[i] !== b || this.shapeA[i] !== sb.shape) return `slot ${i}: bin/shape mismatch`;
        const settled = this.state[i] === St.Settled;
        if (settled !== k < sb.settled) return `bin ${s} inst ${k}: settled=${settled} but partition ${sb.settled}`;
        if (settled !== this.activeIdx[i] < 0) return `slot ${i}: settled=${settled} activeIdx ${this.activeIdx[i]}`;
      }
      live += sb.count;
    }
    if (live !== this.live) return `live ${this.live} vs instances ${live}`;
    for (let a = 0; a < this.activeCount; a++) {
      const i = this.active[a];
      if (this.activeIdx[i] !== a) return `active ${a}: slot ${i} activeIdx ${this.activeIdx[i]}`;
      if (!this.alive[i]) return `active ${a}: slot ${i} dead`;
    }
    if (this.live + this.freeTop !== this.alloc) return `live ${this.live} + free ${this.freeTop} != alloc ${this.alloc}`;
    return null;
  }
}
