// Pooled CPU particle groups: one Babylon ParticleSystem per group (puff / bits / spark / glint
// / drop), shared by all effect kinds, fed by a burst queue so any number of bursts at different
// positions can be emitted in one frame (verified pattern: identity emitter + manualEmitCount +
// custom start functions that pull per-particle parameters from the queue).
//
// Babylon's built-in particle update is replaced by our own (`updateFunction`) so the motion is
// physical (air relaxation, settling, turbulence, quadratic drag, ground contact), time-correct
// (SI units, driven by the dt given to Vfx.update — 0 freezes everything) and per-profile.
// Per-particle custom data lives in Particle fields that Babylon copies on recycle but never
// writes on the CPU path: `initialColor` (base rgb + peak alpha), `colorDead` (r = encoded wall
// plane, g = ground height, b = start size, a = end-size growth), `metadata` (profile).

import { ParticleSystem, Vector3, type BaseTexture, type Matrix, type Particle, type Scene, type Observer } from "@babylonjs/core";
import type { EmitterHandle, VfxKind } from "../core/context.ts";
import type { Vec3 } from "../geom/vec.ts";
import { ATLAS_GRID, BITS_ATLAS_SIZE, PUFF_ATLAS_SIZE } from "./atlas.ts";
import { EMITTER_LAYERS, GROUP_IDS, GROUPS, KIND_LAYERS, PROFILES, type GroupId, type ParticleProfile } from "./profiles.ts";

export const NO_GROUND = -1e9;

/** Environment services the particle system needs from Vfx. */
export interface FxEnv {
  /** Ground height below (x, y, z) or NO_GROUND (cached by the caller). */
  groundAt(x: number, y: number, z: number): number;
  /** Local light level factor (~0.06..1.15). */
  light(x: number, y: number, z: number): number;
  /** settings.quality.particles (0.4..1.3). */
  quality(): number;
  /** Called when a droplet hits the ground (puddles). */
  onDropLanded?(x: number, y: number, z: number, profile: ParticleProfile): void;
}

/** One queued emission (pooled). */
interface BurstRecord {
  prof: ParticleProfile;
  count: number;
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  dx: number;
  dy: number;
  dz: number;
  sizeScale: number;
  speedScale: number;
  radius: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  ground: number;
  /** Encoded wall plane (0 = none). */
  plane: number;
  /** Reflect directions that point into the surface. */
  surface: boolean;
}

export interface BurstOptions {
  tint?: number;
  dir?: Vec3;
  /** Override the spawn radius (m), e.g. the size of a broken panel. */
  radius?: number;
  /** Count multiplier on top of intensity scaling. */
  countScale?: number;
  /** Exact particle count (emitters); bypasses intensity/count scaling (not the budget). */
  exact?: number;
}

const TWO_PI = Math.PI * 2;

/** Pack a vertical wall plane (normal angle θ in the XZ plane + offset d) into one double. */
function encodePlane(nx: number, nz: number, d: number): number {
  const theta = Math.atan2(nz, nx);
  const it = Math.round(((theta + Math.PI) / TWO_PI) * 4095);
  const id = Math.round((Math.min(999, Math.max(-999, d)) + 1000) * 1000);
  return 1 + it + 4096 * id;
}

class ParticleGroup {
  readonly id: GroupId;
  readonly ps: ParticleSystem;
  readonly capacity: number;
  readonly stretched: boolean;
  pendingDt = 0;
  private time = 0;
  private queue: BurstRecord[] = [];
  private head = 0;
  private left = 0;
  private cur: BurstRecord | null = null;
  private deferred: BurstRecord[] = [];
  private inUpdate = false;
  private animated = false;
  private queuedTotal = 0;
  // velocity handed from the position function to the direction function
  private nvx = 0;
  private nvy = 0;
  private nvz = 0;
  private readonly fx: ParticleFx;
  private readonly obs: Observer<Scene>;
  private readonly scene: Scene;
  emitted = 0;
  dropped = 0;

  constructor(id: GroupId, scene: Scene, texture: BaseTexture, capacity: number, fx: ParticleFx) {
    this.id = id;
    this.fx = fx;
    this.scene = scene;
    this.capacity = capacity;
    const def = GROUPS[id];
    this.stretched = def.stretched;
    const ps = new ParticleSystem(`vfx_${id}`, capacity, scene, null, true);
    ps.particleTexture = texture;
    ps.emitter = Vector3.Zero(); // identity emitter matrix: start functions write WORLD coordinates
    ps.manualEmitCount = 0; // manual mode: only queued bursts emit
    ps.minEmitPower = ps.maxEmitPower = 1; // the direction function writes the full velocity (m/s)
    ps.gravity = Vector3.Zero();
    ps.blendMode = def.blend === "add" ? ParticleSystem.BLENDMODE_ADD : ParticleSystem.BLENDMODE_STANDARD;
    ps.billboardMode = def.stretched ? ParticleSystem.BILLBOARDMODE_STRETCHED : ParticleSystem.BILLBOARDMODE_ALL;
    const atlasPx = def.atlas === "puff" ? PUFF_ATLAS_SIZE : BITS_ATLAS_SIZE;
    ps.spriteCellWidth = ps.spriteCellHeight = atlasPx / ATLAS_GRID;
    ps.startSpriteCellID = 0;
    ps.endSpriteCellID = ATLAS_GRID * ATLAS_GRID - 1;
    ps.spriteCellChangeSpeed = 0;
    ps.spriteRandomStartCell = false;
    ps.minLifeTime = ps.maxLifeTime = 1;
    ps.startPositionFunction = (_wm: Matrix, pos: Vector3, p: Particle) => this.startPosition(pos, p);
    ps.startDirectionFunction = (_wm: Matrix, dir: Vector3) => {
      dir.set(this.nvx, this.nvy, this.nvz);
    };
    ps.updateFunction = (particles: Particle[]) => this.update(particles);
    ps.start();
    this.ps = ps;
    // After the frame's animate(): drop records the system could not take (capacity), recycle
    // consumed ones, and promote records enqueued during the update (splashes) to the queue.
    this.obs = scene.onAfterParticlesRenderingObservable.add(() => this.afterAnimate());
  }

  get live(): number {
    return this.ps.particles.length;
  }

  get queued(): number {
    return this.queuedTotal;
  }

  enqueue(rec: BurstRecord): void {
    if (rec.count <= 0) {
      this.fx.release(rec);
      return;
    }
    if (this.inUpdate) this.deferred.push(rec);
    else this.queue.push(rec);
    this.queuedTotal += rec.count;
    this.ps.manualEmitCount += rec.count;
  }

  private next(): BurstRecord | null {
    while (this.left <= 0) {
      if (this.head >= this.queue.length) return null;
      this.cur = this.queue[this.head++];
      this.left = this.cur.count;
    }
    this.left--;
    this.queuedTotal--;
    this.emitted++;
    return this.cur;
  }

  private afterAnimate(): void {
    if (!this.animated) return; // not ready / paused this frame: keep everything queued
    this.animated = false;
    // whatever is left in the main queue was truncated by capacity
    let lost = this.left;
    for (let i = this.head; i < this.queue.length; i++) lost += this.queue[i].count;
    this.dropped += lost;
    this.queuedTotal -= lost;
    for (let i = 0; i < this.queue.length; i++) this.fx.release(this.queue[i]);
    this.queue.length = 0;
    this.head = 0;
    this.left = 0;
    this.cur = null;
    if (this.deferred.length) {
      const t = this.queue;
      this.queue = this.deferred;
      this.deferred = t;
    }
    // manualEmitCount now equals the deferred total (animate() zeroed it before our update ran)
    let total = 0;
    for (let i = 0; i < this.queue.length; i++) total += this.queue[i].count;
    this.queuedTotal = total;
    this.ps.manualEmitCount = total;
  }

  /** Per-particle initialisation (creation queue: lifetime → position → direction → size → angle → colour). */
  private startPosition(pos: Vector3, p: Particle): void {
    const b = this.next();
    const ps = this.ps;
    if (!b) {
      pos.set(0, -1e5, 0);
      p.metadata = null;
      p.lifeTime = 1e-4;
      this.nvx = this.nvy = this.nvz = 0;
      return;
    }
    const prof = b.prof;
    const rnd = Math.random;
    // position: random point in a sphere, pushed off the surface along the normal
    let ux: number, uy: number, uz: number;
    {
      const z = rnd() * 2 - 1,
        t = rnd() * TWO_PI,
        s = Math.sqrt(1 - z * z);
      ux = s * Math.cos(t);
      uy = s * Math.sin(t);
      uz = z;
    }
    const r = b.radius * Math.cbrt(rnd());
    let px = ux * r,
      py = uy * r,
      pz = uz * r;
    if (b.surface) {
      const side = px * b.nx + py * b.ny + pz * b.nz;
      if (side < 0) {
        px -= 2 * side * b.nx;
        py -= 2 * side * b.ny;
        pz -= 2 * side * b.nz;
      }
    }
    pos.set(b.x + px + b.nx * prof.offset, b.y + py + b.ny * prof.offset, b.z + pz + b.nz * prof.offset);
    // velocity: around dir with spread; never into the surface for surface bursts
    let dx: number, dy: number, dz: number;
    {
      const z = rnd() * 2 - 1,
        t = rnd() * TWO_PI,
        s = Math.sqrt(1 - z * z);
      dx = b.dx + s * Math.cos(t) * prof.spread;
      dy = b.dy + s * Math.sin(t) * prof.spread;
      dz = b.dz + z * prof.spread;
    }
    if (b.surface) {
      const side = dx * b.nx + dy * b.ny + dz * b.nz;
      if (side < 0) {
        dx -= 2 * side * b.nx;
        dy -= 2 * side * b.ny;
        dz -= 2 * side * b.nz;
      }
    }
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const speed = (prof.speed[0] + (prof.speed[1] - prof.speed[0]) * rnd()) * b.speedScale;
    this.nvx = (dx / dl) * speed;
    this.nvy = (dy / dl) * speed;
    this.nvz = (dz / dl) * speed;
    // lifetime (already randomised by Babylon from min/max; we own it)
    p.lifeTime = prof.life[0] + (prof.life[1] - prof.life[0]) * rnd();
    // size, scale, rotation: written into the system fields read by the next creation steps
    const size = (prof.size[0] + (prof.size[1] - prof.size[0]) * rnd()) * b.sizeScale;
    const grow = prof.grow[0] + (prof.grow[1] - prof.grow[0]) * rnd();
    const sx = prof.scaleX[0] + (prof.scaleX[1] - prof.scaleX[0]) * rnd();
    let sy = prof.scaleY[0] + (prof.scaleY[1] - prof.scaleY[0]) * rnd();
    if (this.stretched) sy = Math.max(1, (speed * prof.stretch) / Math.max(size, 1e-4));
    ps.minSize = ps.maxSize = size;
    ps.minScaleX = ps.maxScaleX = sx;
    ps.minScaleY = ps.maxScaleY = sy;
    const spin = (rnd() * 2 - 1) * prof.spin;
    ps.minAngularSpeed = ps.maxAngularSpeed = spin;
    const ang = rnd() * TWO_PI;
    ps.minInitialRotation = ps.maxInitialRotation = ang;
    // colour: per-particle brightness variation; first frame alpha honours fade-in
    const v = 1 + (rnd() * 2 - 1) * prof.colorVar;
    const cr = b.r * v,
      cg = b.g * v,
      cb = b.b * v;
    const a0 = prof.fadeIn > 0 ? 0 : b.alpha;
    ps.color1.set(cr, cg, cb, a0);
    ps.color2.set(cr, cg, cb, a0);
    p.initialColor.set(cr, cg, cb, b.alpha);
    p.colorDead.set(b.plane, b.ground, size, grow);
    const cells = prof.cells;
    p.cellIndex = cells[(rnd() * cells.length) | 0];
    p.metadata = prof;
  }

  /** Our per-frame particle update (replaces Babylon's update queue). */
  private update(particles: Particle[]): void {
    this.animated = true;
    const dt = this.pendingDt;
    this.pendingDt = 0;
    if (!(dt > 0)) return;
    this.inUpdate = true;
    const time = (this.time += dt);
    const stretched = this.stretched;
    const ps = this.ps;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const prof = p.metadata as ParticleProfile | null;
      p.age += dt;
      if (!prof || p.age >= p.lifeTime) {
        ps.recycleParticle(p);
        i--;
        continue;
      }
      const v = p.direction;
      const pos = p.position;
      const seed = p.id * 0.6180339887;
      const ph = (seed - Math.floor(seed)) * TWO_PI;
      if (prof.drag > 0) {
        const a = Math.exp(-prof.drag * dt);
        let tx = 0,
          ty = 0,
          tz = 0;
        if (prof.turb > 0) {
          const T = prof.turb;
          tx = T * Math.sin(time * 1.3 + ph);
          ty = T * 0.5 * Math.sin(time * 0.9 + ph * 1.7);
          tz = T * Math.cos(time * 1.1 + ph * 2.3);
        }
        v.x = tx + (v.x - tx) * a;
        v.y = ty + (v.y - ty) * a;
        v.z = tz + (v.z - tz) * a;
      }
      v.y += prof.gravity * dt;
      if (prof.quadDrag > 0) {
        const sp = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        const f = 1 / (1 + prof.quadDrag * sp * dt);
        v.x *= f;
        v.y *= f;
        v.z *= f;
      }
      if (prof.flutter > 0) {
        v.x += prof.flutter * Math.sin(time * 6.3 + ph * 3) * dt;
        v.z += prof.flutter * Math.cos(time * 5.1 + ph * 5) * dt;
      }
      pos.x += v.x * dt;
      pos.y += v.y * dt;
      pos.z += v.z * dt;
      // keep big soft puffs from slicing through the wall they came out of
      const cd = p.colorDead;
      if (cd.r !== 0) {
        const code = cd.r - 1;
        const it = code % 4096;
        const d = Math.floor(code / 4096) / 1000 - 1000;
        const th = (it / 4095) * TWO_PI - Math.PI;
        const nx = Math.cos(th),
          nz = Math.sin(th);
        const dist = pos.x * nx + pos.z * nz - d;
        const minD = p.size * 0.4;
        if (dist < minD) {
          pos.x += nx * (minD - dist);
          pos.z += nz * (minD - dist);
          const vn = v.x * nx + v.z * nz;
          if (vn < 0) {
            v.x -= vn * nx;
            v.z -= vn * nz;
          }
        }
      }
      // ground contact
      if (prof.collide !== 0) {
        const gy = cd.g;
        const rr = p.size * (prof.group === "puff" ? 0.4 : 0.3);
        if (pos.y < gy + rr) {
          if (prof.dieOnGround) {
            this.fx.dropLanded(pos.x, gy, pos.z, prof);
            ps.recycleParticle(p);
            i--;
            continue;
          }
          pos.y = gy + rr;
          if (prof.collide === 2 && v.y < -0.7) {
            v.y = -v.y * prof.bounce;
            v.x *= 0.75;
            v.z *= 0.75;
            p.angularSpeed *= -0.7;
          } else {
            if (v.y < 0) v.y = 0;
            const f = Math.exp(-prof.friction * dt);
            v.x *= f;
            v.z *= f;
            p.angularSpeed *= f;
          }
        }
      }
      // size growth (ease-out)
      const t = p.age / p.lifeTime;
      const grow = cd.a;
      p.size = grow !== 1 ? cd.b * (1 + (grow - 1) * (1 - (1 - t) * (1 - t))) : cd.b;
      // alpha envelope
      const ic = p.initialColor;
      let a = ic.a;
      if (t < prof.fadeIn) a *= t / prof.fadeIn;
      if (prof.fadeOut > 0 && t > 1 - prof.fadeOut) a *= (1 - t) / prof.fadeOut;
      if (prof.flicker > 0) {
        let h = Math.sin((Math.floor(time * 24) + p.id) * 12.9898) * 43758.5453;
        h -= Math.floor(h);
        a *= 1 - prof.flicker + prof.flicker * 2 * h * h;
      }
      if (prof.cool > 0) {
        // hot spark: white-yellow → orange → dull red while it dims
        const k = prof.cool * t;
        const dim = 1 - 0.7 * k;
        p.color.set(ic.r * dim, ic.g * (1 - 0.6 * k) * dim, ic.b * (1 - 0.9 * k) * dim, a);
      } else {
        p.color.set(ic.r, ic.g, ic.b, a);
      }
      p.angle += p.angularSpeed * dt;
      if (stretched) {
        const sp = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        p.scale.y = Math.max(1, (sp * prof.stretch) / Math.max(p.size, 1e-4));
      }
    }
    this.inUpdate = false;
  }

  dispose(): void {
    this.scene.onAfterParticlesRenderingObservable.remove(this.obs);
    this.ps.dispose(false);
    this.queue.length = 0;
    this.deferred.length = 0;
  }
}

export class FxEmitter implements EmitterHandle {
  readonly kind: VfxKind;
  x: number;
  y: number;
  z: number;
  dx = 0;
  dy = 1;
  dz = 0;
  rate: number;
  tint: number | undefined;
  alive = true;
  acc: number[];
  light = 1;
  lightAge = 1e9;
  ground = NO_GROUND;
  groundX = Infinity;
  groundZ = Infinity;
  groundAge = 1e9;
  /** Seconds this emitter has been running (for consumers like puddle growth). */
  age = 0;

  constructor(kind: VfxKind, pos: Vec3, dir: Vec3, rate: number, tint: number | undefined) {
    this.kind = kind;
    this.x = Number.isFinite(pos.x) ? pos.x : 0;
    this.y = Number.isFinite(pos.y) ? pos.y : 0;
    this.z = Number.isFinite(pos.z) ? pos.z : 0;
    this.setDirection(dir);
    this.rate = Number.isFinite(rate) ? Math.max(0, rate) : 0;
    this.tint = tint;
    this.acc = EMITTER_LAYERS[kind].map(() => Math.random());
  }

  setPosition(p: Vec3): void {
    if (!Number.isFinite(p.x + p.y + p.z)) return;
    this.x = p.x;
    this.y = p.y;
    this.z = p.z;
  }

  setDirection(d: Vec3): void {
    const l = Math.hypot(d.x, d.y, d.z);
    if (!(l > 1e-9) || !Number.isFinite(l)) return;
    this.dx = d.x / l;
    this.dy = d.y / l;
    this.dz = d.z / l;
  }

  setRate(r: number): void {
    this.rate = Number.isFinite(r) ? Math.max(0, r) : 0;
  }

  stop(): void {
    this.alive = false;
  }
}

/** All particle groups + bursts + emitters + budget. */
export class ParticleFx {
  readonly groups: Record<GroupId, ParticleGroup>;
  readonly emitters: FxEmitter[] = [];
  private pool: BurstRecord[] = [];
  private readonly env: FxEnv;
  private totalCapacity = 0;

  constructor(scene: Scene, env: FxEnv, puffAtlas: BaseTexture, bitsAtlas: BaseTexture, capacityScale = 1.3) {
    this.env = env;
    const groups = {} as Record<GroupId, ParticleGroup>;
    for (const id of GROUP_IDS) {
      const def = GROUPS[id];
      const cap = Math.max(64, Math.round(def.capacity * capacityScale));
      groups[id] = new ParticleGroup(id, scene, def.atlas === "puff" ? puffAtlas : bitsAtlas, cap, this);
      this.totalCapacity += def.capacity;
    }
    this.groups = groups;
  }

  /** Live particles over all groups. */
  get particleCount(): number {
    let n = 0;
    for (const id of GROUP_IDS) n += this.groups[id].live;
    return n;
  }

  get queuedCount(): number {
    let n = 0;
    for (const id of GROUP_IDS) n += this.groups[id].queued;
    return n;
  }

  /** Soft budget for the current quality (live + queued). */
  get budget(): number {
    return this.totalCapacity * Math.max(0.1, this.env.quality());
  }

  get stats(): { live: number; queued: number; budget: number; emitted: number; dropped: number; emitters: number } {
    let emitted = 0,
      dropped = 0;
    for (const id of GROUP_IDS) {
      emitted += this.groups[id].emitted;
      dropped += this.groups[id].dropped;
    }
    return { live: this.particleCount, queued: this.queuedCount, budget: this.budget, emitted, dropped, emitters: this.emitters.length };
  }

  release(r: BurstRecord): void {
    if (this.pool.length < 1024) this.pool.push(r);
  }

  private record(): BurstRecord {
    return (
      this.pool.pop() ?? {
        prof: PROFILES.dust,
        count: 0,
        x: 0,
        y: 0,
        z: 0,
        nx: 0,
        ny: 1,
        nz: 0,
        dx: 0,
        dy: 1,
        dz: 0,
        sizeScale: 1,
        speedScale: 1,
        radius: 0,
        r: 1,
        g: 1,
        b: 1,
        alpha: 1,
        ground: NO_GROUND,
        plane: 0,
        surface: true,
      }
    );
  }

  /** Graceful degradation: full counts below 45 % of the budget, down to 12 % near it. */
  private budgetFactor(): number {
    const budget = this.budget;
    const load = this.particleCount + this.queuedCount;
    const knee = 0.45 * budget;
    if (load <= knee) return 1;
    return Math.max(0.12, 1 - (load - knee) / (0.5 * budget));
  }

  /** One-shot effect of a public kind (all its layers). */
  burst(kind: VfxKind, pos: Vec3, normal: Vec3, intensity: number, opts?: BurstOptions): number {
    const layers = KIND_LAYERS[kind];
    if (!layers) return 0;
    let n = 0;
    for (const l of layers) {
      const prof = PROFILES[l.p];
      n += this.layer(prof, pos, normal, intensity * (l.i ?? 1), opts, l.n ?? 1);
    }
    return n;
  }

  /** Emit one profile layer. Returns the number of particles queued. */
  layer(prof: ParticleProfile, pos: Vec3, normal: Vec3, intensity: number, opts: BurstOptions | undefined, layerScale = 1): number {
    if (!prof || !Number.isFinite(pos.x + pos.y + pos.z)) return 0;
    const I = Number.isFinite(intensity) ? Math.min(20, Math.max(0, intensity)) : 0;
    if (I <= 0 && opts?.exact === undefined) return 0;
    const group = this.groups[prof.group];
    const q = Math.max(0.05, this.env.quality());
    let count: number;
    if (opts?.exact !== undefined) {
      count = opts.exact * this.budgetFactor();
    } else {
      count = prof.count * Math.pow(I, prof.countExp) * layerScale * (opts?.countScale ?? 1) * q * this.budgetFactor();
      count = Math.min(count, prof.maxCount * q * Math.max(1, layerScale));
    }
    count = Math.floor(count + Math.random());
    const room = group.capacity - group.live - group.queued;
    if (count > room) count = room;
    if (count <= 0) return 0;

    // normal & direction
    let nx = normal.x,
      ny = normal.y,
      nz = normal.z;
    let nl = Math.hypot(nx, ny, nz);
    if (!(nl > 1e-6) || !Number.isFinite(nl)) {
      nx = 0;
      ny = 1;
      nz = 0;
      nl = 1;
    }
    nx /= nl;
    ny /= nl;
    nz /= nl;
    let dx = nx,
      dy = ny,
      dz = nz;
    let surface = true;
    const od = opts?.dir;
    if (od) {
      const l = Math.hypot(od.x, od.y, od.z);
      if (l > 1e-6 && Number.isFinite(l)) {
        dx = od.x / l;
        dy = od.y / l;
        dz = od.z / l;
        surface = dx * nx + dy * ny + dz * nz > -0.2;
      }
    }

    const rec = this.record();
    rec.prof = prof;
    rec.count = count;
    rec.x = pos.x;
    rec.y = pos.y;
    rec.z = pos.z;
    rec.nx = nx;
    rec.ny = ny;
    rec.nz = nz;
    rec.dx = dx;
    rec.dy = dy;
    rec.dz = dz;
    rec.surface = surface && opts?.exact === undefined;
    const Ie = Math.max(I, 0.05);
    rec.sizeScale = Math.pow(Ie, prof.sizeExp);
    rec.speedScale = Math.pow(Ie, prof.speedExp);
    rec.radius = opts?.radius !== undefined && Number.isFinite(opts.radius) ? Math.max(0, opts.radius) : prof.radius * Math.pow(Ie, prof.radiusExp);
    // colour: profile colour mixed with the tint, scaled by local light and hdr
    let r = prof.color[0],
      g = prof.color[1],
      b = prof.color[2];
    if (opts?.tint !== undefined && Number.isFinite(opts.tint) && prof.tintMix > 0) {
      const t = opts.tint | 0;
      const tr = ((t >> 16) & 255) / 255,
        tg = ((t >> 8) & 255) / 255,
        tb = (t & 255) / 255;
      r += (tr - r) * prof.tintMix;
      g += (tg - g) * prof.tintMix;
      b += (tb - b) * prof.tintMix;
    }
    const L = prof.lit > 0 ? this.env.light(pos.x, pos.y, pos.z) : 1;
    const k = (1 + (L - 1) * prof.lit) * prof.hdr;
    rec.r = r * k;
    rec.g = g * k;
    rec.b = b * k;
    rec.alpha = prof.alpha;
    rec.ground = prof.collide !== 0 ? this.env.groundAt(pos.x, pos.y + 0.05, pos.z) : NO_GROUND;
    // big puffs from a wall stay on the room side of it
    rec.plane = prof.group === "puff" && surface && Math.abs(ny) < 0.6 && Math.hypot(nx, nz) > 0.5 ? encodePlane(nx / Math.hypot(nx, nz), nz / Math.hypot(nx, nz), (pos.x * nx + pos.z * nz) / Math.hypot(nx, nz)) : 0;
    group.enqueue(rec);
    return count;
  }

  dropLanded(x: number, y: number, z: number, prof: ParticleProfile): void {
    this.env.onDropLanded?.(x, y, z, prof);
  }

  emitter(kind: VfxKind, pos: Vec3, dir: Vec3, rate: number, opts?: { tint?: number }): EmitterHandle {
    const e = new FxEmitter(kind, pos, dir, rate, opts?.tint);
    if (EMITTER_LAYERS[kind]) this.emitters.push(e);
    else e.alive = false;
    return e;
  }

  /** Per-frame: distribute dt to the groups and run the emitters. */
  update(dt: number): void {
    const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    for (const id of GROUP_IDS) this.groups[id].pendingDt = d;
    if (d <= 0) return;
    const q = Math.max(0.05, this.env.quality());
    const f = this.budgetFactor();
    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i];
      if (!e.alive) {
        this.emitters.splice(i, 1);
        i--;
        continue;
      }
      e.age += d;
      if (e.rate <= 0) continue;
      // refresh cached light / ground occasionally (emitters follow moving islands)
      e.lightAge += d;
      if (e.lightAge > 0.5) {
        e.light = this.env.light(e.x, e.y, e.z);
        e.lightAge = 0;
      }
      e.groundAge += d;
      const moved = (e.x - e.groundX) ** 2 + (e.z - e.groundZ) ** 2 > 0.01;
      if (moved || e.groundAge > 0.5) {
        e.ground = this.env.groundAt(e.x, e.y + 0.02, e.z);
        e.groundX = e.x;
        e.groundZ = e.z;
        e.groundAge = 0;
      }
      const layers = EMITTER_LAYERS[e.kind];
      for (let li = 0; li < layers.length; li++) {
        const L = layers[li];
        const clump = L.clump ?? 1;
        e.acc[li] += (L.rate * e.rate * q * f * d) / clump;
        if (e.acc[li] < 1) continue;
        const bursts = Math.floor(e.acc[li]);
        e.acc[li] -= bursts;
        this.emitLayer(e, PROFILES[L.p], bursts * clump);
      }
    }
  }

  private emitLayer(e: FxEmitter, prof: ParticleProfile, n: number): void {
    const group = this.groups[prof.group];
    const room = group.capacity - group.live - group.queued;
    const count = Math.min(n, room);
    if (count <= 0) return;
    const rec = this.record();
    rec.prof = prof;
    rec.count = count;
    rec.x = e.x;
    rec.y = e.y;
    rec.z = e.z;
    rec.nx = rec.dx = e.dx;
    rec.ny = rec.dy = e.dy;
    rec.nz = rec.dz = e.dz;
    rec.surface = false;
    const I = Math.max(0.3, Math.min(2.5, e.rate));
    rec.sizeScale = Math.pow(I, prof.sizeExp);
    rec.speedScale = Math.pow(I, Math.max(prof.speedExp, 0.35));
    rec.radius = prof.radius;
    let r = prof.color[0],
      g = prof.color[1],
      b = prof.color[2];
    if (e.tint !== undefined && Number.isFinite(e.tint) && prof.tintMix > 0) {
      const t = e.tint | 0;
      r += (((t >> 16) & 255) / 255 - r) * prof.tintMix;
      g += (((t >> 8) & 255) / 255 - g) * prof.tintMix;
      b += ((t & 255) / 255 - b) * prof.tintMix;
    }
    const k = (1 + (e.light - 1) * prof.lit) * prof.hdr;
    rec.r = r * k;
    rec.g = g * k;
    rec.b = b * k;
    rec.alpha = prof.alpha;
    rec.ground = e.ground;
    rec.plane = 0;
    group.enqueue(rec);
  }

  dispose(): void {
    for (const id of GROUP_IDS) this.groups[id].dispose();
    this.emitters.length = 0;
    this.pool.length = 0;
  }
}
