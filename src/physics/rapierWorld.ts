/**
 * Rapier rigid-body world for the voxel game (`game.physics`).
 *
 * * Fixed 60 Hz steps driven by the PhysicsSystem (`step(dt)`).
 * * Terrain colliders exist only where dynamic bodies are: the sections overlapping each body's
 *   (velocity-expanded) bounds are built on demand (Rapier voxel colliders for unit cubes — one
 *   per surface class — plus cuboids for partial shapes), stitched to their neighbours with
 *   `combineVoxelStates`, updated incrementally on `blockChanged` and released when unused.
 * * Bodies are wrapped in `PhysBody` (render interpolation, water state, owner, impacts).
 *
 * The Rapier module is passed in (`new PhysicsWorld(RAPIER, world)`) so this class also runs
 * in Node (unit tests) without the browser loader.
 */
import * as THREE from 'three';
import type * as RAPIER_NS from '@dimforge/rapier3d-compat';
import type { World } from '../world/world';
import { sectionKey } from '../world/world';
import { T_LIQUID } from '../world/blocks/registry';
import { buildSectionData, blockCollision, fluidSurface } from './terrain';
import { SURFACE_MATERIALS, SURFACE_CLASS_COUNT, type PhysMaterial } from './materials';

export type RapierModule = typeof RAPIER_NS;
type RB = RAPIER_NS.RigidBody;
type Col = RAPIER_NS.Collider;

export interface Vec3Like { x: number; y: number; z: number }
export interface QuatLike { x: number; y: number; z: number; w: number }

/** Gravity applied to rigid bodies (blocks/s²). Between real (9.81) and Minecraft's entity gravity (32). */
export const RIGID_GRAVITY = 20;

/** Collision group bits. */
export const GROUP = { TERRAIN: 1, ITEM: 2, DEBRIS: 4, RAGDOLL: 8, TNT: 16, FALLING: 32 } as const;
const ALL = 0xffff;
export const groups = (member: number, filter: number = ALL) => ((member & 0xffff) << 16) | (filter & 0xffff);

export type BodyKind = 'item' | 'debris' | 'tnt' | 'ragdoll' | 'falling' | 'other';

export type ShapeSpec =
  | { type: 'box'; half: [number, number, number] }
  | { type: 'ball'; radius: number }
  | { type: 'capsule'; halfHeight: number; radius: number };

export interface BodyOptions {
  kind: BodyKind;
  position: Vec3Like;
  rotation?: QuatLike;
  linvel?: Vec3Like;
  angvel?: Vec3Like;
  shape: ShapeSpec;
  /** Total mass (kg). Overrides density. */
  mass?: number;
  density?: number;
  friction?: number;
  restitution?: number;
  /** Kinematic (position driven) instead of dynamic. */
  kinematic?: boolean;
  ccd?: boolean;
  linearDamping?: number;
  angularDamping?: number;
  /**
   * Buoyancy factor in water: ratio water density / body density. > 1 floats (Minecraft items
   * always float: ~1.6), < 1 sinks slowly. 0 = no fluid forces.
   */
  buoyancy?: number;
  /** Collision group membership bits (GROUP.*) and filter. */
  group?: number;
  filter?: number;
  owner?: any;
  canSleep?: boolean;
  gravityScale?: number;
  /** Extra solver iterations (ragdolls). */
  solverIterations?: number;
  /** Emit impact events (sounds) for this body. Default true for dynamic bodies. */
  impacts?: boolean;
}

/** A rigid body managed by the PhysicsWorld. */
export class PhysBody {
  readonly pos = new THREE.Vector3();
  readonly prevPos = new THREE.Vector3();
  readonly quat = new THREE.Quaternion();
  readonly prevQuat = new THREE.Quaternion();
  readonly half = new THREE.Vector3();
  /** Bounding radius. */
  radius = 0.5;
  /** Submerged fraction 0..1 and fluid kind (1 water, 2 lava). */
  submerged = 0;
  fluid = 0;
  removed = false;
  /** Disabled because its chunk is not loaded. */
  frozen = false;
  buoyancy = 0;
  /** Seconds since the last impact sound/event. */
  impactCooldown = 0;
  /** Per-step callback before the world step (custom forces). */
  onStep: ((b: PhysBody, dt: number) => void) | null = null;
  /** Called on a noticeable impact: `speed` = estimated impact speed (m/s). */
  onImpact: ((b: PhysBody, speed: number, other: PhysBody | null) => void) | null = null;
  userData: Record<string, any> = {};
  constructor(
    readonly rb: RB,
    readonly collider: Col,
    readonly kind: BodyKind,
    public owner: any,
    readonly mass: number,
    readonly mat: PhysMaterial,
  ) {}

  get sleeping() {
    return this.rb.isSleeping();
  }
  get dynamic() {
    return this.rb.isDynamic();
  }
  linvel(out = new THREE.Vector3()) {
    const v = this.rb.linvel();
    return out.set(v.x, v.y, v.z);
  }
  angvel(out = new THREE.Vector3()) {
    const v = this.rb.angvel();
    return out.set(v.x, v.y, v.z);
  }
  /** Interpolated transform for rendering. */
  interpolate(alpha: number, outPos: THREE.Vector3, outQuat?: THREE.Quaternion) {
    outPos.copy(this.prevPos).lerp(this.pos, alpha);
    if (outQuat) outQuat.copy(this.prevQuat).slerp(this.quat, alpha);
  }
  /** Read the current transform from Rapier (call after teleporting). */
  sync(resetPrev = false) {
    const t = this.rb.translation(), r = this.rb.rotation();
    this.pos.set(t.x, t.y, t.z);
    this.quat.set(r.x, r.y, r.z, r.w);
    if (resetPrev) {
      this.prevPos.copy(this.pos);
      this.prevQuat.copy(this.quat);
    }
  }
}

interface SectionCol {
  key: number;
  cx: number;
  sy: number;
  cz: number;
  vox: (Col | null)[];
  /** cell -> class+1 for unit voxels (0 none) */
  cells: Uint8Array;
  partial: Map<number, Col[]>;
  lastWanted: number;
}

export interface RayHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  dist: number;
  body: PhysBody | null;
}

export interface PhysicsStats {
  bodies: number;
  awake: number;
  sections: number;
  colliders: number;
  stepMs: number;
  buildMs: number;
}

const TERRAIN_GROUPS = groups(GROUP.TERRAIN, ALL);
const NEIGH26: [number, number, number][] = [];
for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dy || dz) NEIGH26.push([dx, dy, dz]);

const _v = new THREE.Vector3();

export class PhysicsWorld {
  readonly R: RapierModule;
  readonly rw: RAPIER_NS.World;
  readonly bodies = new Set<PhysBody>();
  private byCollider = new Map<number, PhysBody>();
  private sections = new Map<number, SectionCol>();
  private events: RAPIER_NS.EventQueue;
  private time = 0;
  private stepCount = 0;
  private unsub: (() => void)[] = [];
  /** Max milliseconds of optional (non-urgent) section building per step. */
  buildBudgetMs = 2;
  readonly stats: PhysicsStats = { bodies: 0, awake: 0, sections: 0, colliders: 0, stepMs: 0, buildMs: 0 };
  /** Global impact listener (sounds, events). */
  onImpact: ((b: PhysBody, speed: number, other: PhysBody | null) => void) | null = null;
  /** Bodies that left the world (y < -64): owners get notified then the body is removed. */
  onLost: ((b: PhysBody) => void) | null = null;

  constructor(R: RapierModule, public world: World, gravity = RIGID_GRAVITY) {
    this.R = R;
    this.rw = new R.World({ x: 0, y: -gravity, z: 0 });
    this.rw.timestep = 1 / 60;
    this.events = new R.EventQueue(true);
    this.attach(world);
  }

  /** Bind to a (new) block world: drops every body and terrain collider. */
  attach(world: World) {
    for (const u of this.unsub) u();
    this.unsub.length = 0;
    for (const b of [...this.bodies]) this.removeBody(b);
    for (const s of [...this.sections.values()]) this.dropSection(s);
    this.world = world;
    this.unsub.push(world.events.on('blockChanged', (e) => this.onBlockChanged(e.x, e.y, e.z)));
    this.unsub.push(world.events.on('chunkUnloaded', (e) => {
      for (let sy = 0; sy < 16; sy++) {
        const s = this.sections.get(sectionKey(e.chunk.cx, sy, e.chunk.cz));
        if (s) this.dropSection(s);
      }
    }));
  }

  dispose() {
    for (const u of this.unsub) u();
    this.rw.free();
  }

  get gravity() {
    return -this.rw.gravity.y;
  }
  set gravity(g: number) {
    this.rw.gravity = { x: 0, y: -g, z: 0 };
  }

  // ------------------------------------------------------------------ bodies
  addBody(o: BodyOptions): PhysBody {
    const R = this.R;
    const desc = o.kinematic ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.dynamic();
    desc.setTranslation(o.position.x, o.position.y, o.position.z);
    if (o.rotation) desc.setRotation(o.rotation);
    if (o.linvel) desc.setLinvel(o.linvel.x, o.linvel.y, o.linvel.z);
    if (o.angvel) desc.setAngvel(o.angvel);
    if (o.ccd) desc.setCcdEnabled(true);
    desc.setLinearDamping(o.linearDamping ?? 0.05);
    desc.setAngularDamping(o.angularDamping ?? 0.15);
    if (o.canSleep === false) desc.setCanSleep(false);
    if (o.gravityScale !== undefined) desc.setGravityScale(o.gravityScale);
    if (o.solverIterations) desc.setAdditionalSolverIterations(o.solverIterations);
    const rb = this.rw.createRigidBody(desc);
    let cd: RAPIER_NS.ColliderDesc;
    let vol: number;
    const half = new THREE.Vector3();
    switch (o.shape.type) {
      case 'box':
        cd = R.ColliderDesc.cuboid(o.shape.half[0], o.shape.half[1], o.shape.half[2]);
        half.set(o.shape.half[0], o.shape.half[1], o.shape.half[2]);
        vol = 8 * half.x * half.y * half.z;
        break;
      case 'ball':
        cd = R.ColliderDesc.ball(o.shape.radius);
        half.setScalar(o.shape.radius);
        vol = (4 / 3) * Math.PI * o.shape.radius ** 3;
        break;
      default:
        cd = R.ColliderDesc.capsule(o.shape.halfHeight, o.shape.radius);
        half.set(o.shape.radius, o.shape.halfHeight + o.shape.radius, o.shape.radius);
        vol = Math.PI * o.shape.radius ** 2 * (2 * o.shape.halfHeight + (4 / 3) * o.shape.radius);
    }
    const mass = o.mass ?? (o.density ?? 1000) * vol;
    cd.setDensity(mass / Math.max(1e-6, vol));
    const mat: PhysMaterial = { friction: o.friction ?? 0.6, restitution: o.restitution ?? 0.2, density: mass / Math.max(1e-6, vol) };
    cd.setFriction(mat.friction).setRestitution(mat.restitution);
    cd.setCollisionGroups(groups(o.group ?? GROUP.ITEM, o.filter ?? ALL));
    const wantImpacts = o.impacts ?? !o.kinematic;
    if (wantImpacts) {
      cd.setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS);
      // a resting contact produces ~m*g; report impacts above ~2 m/s of velocity change per step
      cd.setContactForceEventThreshold(mass * 2 * 60);
    }
    const col = this.rw.createCollider(cd, rb);
    const b = new PhysBody(rb, col, o.kind, o.owner ?? null, mass, mat);
    b.half.copy(half);
    b.radius = half.length();
    b.buoyancy = o.buoyancy ?? 0;
    b.sync(true);
    this.bodies.add(b);
    this.byCollider.set(col.handle, b);
    // terrain must exist under a new body immediately
    if (!o.kinematic) this.ensureAround(b, true);
    return b;
  }

  /** Attach an extra collider to a body (compound shapes). */
  addCollider(b: PhysBody, desc: RAPIER_NS.ColliderDesc): Col {
    const c = this.rw.createCollider(desc, b.rb);
    this.byCollider.set(c.handle, b);
    return c;
  }

  removeBody(b: PhysBody) {
    if (b.removed) return;
    b.removed = true;
    this.bodies.delete(b);
    const n = b.rb.numColliders();
    for (let i = 0; i < n; i++) this.byCollider.delete(b.rb.collider(i).handle);
    this.rw.removeRigidBody(b.rb);
  }

  bodyOf(c: Col | null | undefined): PhysBody | null {
    return c ? this.byCollider.get(c.handle) ?? null : null;
  }

  applyImpulse(b: PhysBody, impulse: Vec3Like, point?: Vec3Like) {
    if (b.removed || !b.rb.isDynamic()) return;
    if (point) b.rb.applyImpulseAtPoint(impulse, point, true);
    else b.rb.applyImpulse(impulse, true);
  }

  setVelocity(b: PhysBody, v: Vec3Like) {
    if (!b.removed) b.rb.setLinvel(v, true);
  }

  teleport(b: PhysBody, p: Vec3Like, q?: QuatLike) {
    b.rb.setTranslation(p, true);
    if (q) b.rb.setRotation(q, true);
    b.sync(true);
  }

  /** Wake bodies whose bounds come within `r` of a point. */
  wakeAround(x: number, y: number, z: number, r: number) {
    for (const b of this.bodies) {
      if (!b.rb.isSleeping()) continue;
      const d = r + b.radius;
      if (Math.abs(b.pos.x - x) < d && Math.abs(b.pos.y - y) < d && Math.abs(b.pos.z - z) < d) b.rb.wakeUp();
    }
  }

  // ------------------------------------------------------------------ queries
  /** Ray against rigid bodies and built terrain colliders. Use `raycastBlocks` for global terrain rays. */
  raycast(origin: Vec3Like, dir: Vec3Like, maxDist: number, opts: { terrain?: boolean; bodies?: boolean; exclude?: PhysBody | null } = {}): RayHit | null {
    const R = this.R;
    const terrain = opts.terrain ?? true, bodies = opts.bodies ?? true;
    const filter = (terrain ? GROUP.TERRAIN : 0) | (bodies ? ALL & ~GROUP.TERRAIN : 0);
    const ray = new R.Ray(origin, dir);
    const hit = this.rw.castRayAndGetNormal(ray, maxDist, true, undefined, groups(ALL, filter), undefined, opts.exclude?.rb);
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return {
      point: new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      dist: t,
      body: this.bodyOf(hit.collider),
    };
  }

  /** Bodies whose colliders' AABBs intersect the box. */
  queryBox(min: Vec3Like, max: Vec3Like, filter?: (b: PhysBody) => boolean): PhysBody[] {
    const out = new Set<PhysBody>();
    const c = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
    const h = { x: (max.x - min.x) / 2, y: (max.y - min.y) / 2, z: (max.z - min.z) / 2 };
    this.rw.collidersWithAabbIntersectingAabb(c, h, (col) => {
      const b = this.byCollider.get(col.handle);
      if (b && !b.removed && (!filter || filter(b))) out.add(b);
      return true;
    });
    return [...out];
  }

  /** Bodies with centres within `r` of a point. */
  querySphere(p: Vec3Like, r: number, filter?: (b: PhysBody) => boolean): PhysBody[] {
    const out: PhysBody[] = [];
    for (const b of this.bodies) {
      const dx = b.pos.x - p.x, dy = b.pos.y - p.y, dz = b.pos.z - p.z;
      if (dx * dx + dy * dy + dz * dz <= (r + b.radius) * (r + b.radius) && (!filter || filter(b))) out.push(b);
    }
    return out;
  }

  // ------------------------------------------------------------------ stepping
  step(dt: number) {
    const t0 = performance.now();
    this.time += dt;
    this.stepCount++;
    let buildMs = 0;
    const w = this.world;
    // 1) terrain around bodies, chunk freezing, fluid forces
    for (const b of this.bodies) {
      b.prevPos.copy(b.pos);
      b.prevQuat.copy(b.quat);
      if (b.impactCooldown > 0) b.impactCooldown -= dt;
      if (!b.rb.isDynamic()) continue;
      const loaded = w.isLoaded(Math.floor(b.pos.x), Math.floor(b.pos.z));
      if (!loaded !== b.frozen) {
        b.frozen = !loaded;
        b.rb.setEnabled(loaded);
      }
      if (b.frozen) continue;
      if (b.pos.y < -64) {
        this.onLost?.(b);
        if (!b.removed && b.pos.y < -64) this.removeBody(b);
        continue;
      }
      const tb = performance.now();
      this.ensureAround(b, false);
      buildMs += performance.now() - tb;
      if (b.buoyancy > 0) this.fluidForces(b, dt);
      b.onStep?.(b, dt);
    }
    // optional builds within budget
    if (this.pending.size) {
      const tb = performance.now();
      for (const k of this.pending) {
        this.pending.delete(k);
        if (!this.sections.has(k)) this.buildSectionKey(k);
        if (performance.now() - tb > this.buildBudgetMs) break;
      }
      buildMs += performance.now() - tb;
    }
    // 2) simulate
    this.rw.timestep = dt;
    this.rw.step(this.events);
    // 3) impacts
    this.events.drainContactForceEvents((ev) => {
      const b1 = this.byCollider.get(ev.collider1()) ?? null;
      const b2 = this.byCollider.get(ev.collider2()) ?? null;
      const f = ev.totalForceMagnitude();
      for (const [a, o] of [[b1, b2], [b2, b1]] as const) {
        if (!a || a.removed || a.impactCooldown > 0) continue;
        const speed = (f * dt) / a.mass;
        if (speed < 1.2) continue;
        a.impactCooldown = 0.12;
        a.onImpact?.(a, speed, o);
        this.onImpact?.(a, speed, o);
      }
    });
    // 4) read back
    let awake = 0;
    for (const b of this.bodies) {
      if (b.frozen) continue;
      if (!b.rb.isSleeping()) {
        awake++;
        b.sync();
      }
    }
    // 5) release unused terrain
    if (this.stepCount % 30 === 0) {
      for (const s of [...this.sections.values()]) if (this.time - s.lastWanted > 4) this.dropSection(s);
    }
    this.stats.bodies = this.bodies.size;
    this.stats.awake = awake;
    this.stats.sections = this.sections.size;
    this.stats.colliders = this.rw.colliders.len();
    this.stats.stepMs = performance.now() - t0;
    this.stats.buildMs = buildMs;
  }

  private pending = new Set<number>();

  /** Mark/build the terrain sections a body needs. `urgent` builds everything synchronously. */
  private ensureAround(b: PhysBody, urgent: boolean) {
    const v = b.rb.linvel();
    const sp = Math.hypot(v.x, v.y, v.z);
    const sleeping = b.rb.isSleeping();
    const near = b.radius + 0.6 + sp / 30; // what the next step can reach
    const far = sleeping ? b.radius + 0.3 : b.radius + 1.5 + sp * 0.25;
    this.visitSections(b.pos, near, (k, cx, sy, cz) => {
      const s = this.sections.get(k);
      if (s) s.lastWanted = this.time;
      else this.buildSection(cx, sy, cz);
    });
    if (sleeping && !urgent) return;
    this.visitSections(b.pos, far, (k) => {
      const s = this.sections.get(k);
      if (s) s.lastWanted = this.time;
      else this.pending.add(k);
    });
  }

  private visitSections(p: Vec3Like, r: number, fn: (k: number, cx: number, sy: number, cz: number) => void) {
    const x0 = Math.floor(p.x - r) >> 4, x1 = Math.floor(p.x + r) >> 4;
    const y0 = Math.max(0, Math.floor(p.y - r) >> 4), y1 = Math.min(15, Math.floor(p.y + r) >> 4);
    const z0 = Math.floor(p.z - r) >> 4, z1 = Math.floor(p.z + r) >> 4;
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++)
        for (let sy = y0; sy <= y1; sy++) fn(sectionKey(cx, sy, cz), cx, sy, cz);
  }

  private buildSectionKey(k: number) {
    const sy = k % 32;
    const ck = (k - sy) / 32;
    const cx = Math.floor(ck / 0x200000) - 0x100000;
    const cz = (ck % 0x200000) - 0x100000;
    this.buildSection(cx, sy, cz);
  }

  /** Build colliders for one section (no-op if its chunk is not loaded). */
  buildSection(cx: number, sy: number, cz: number): boolean {
    const k = sectionKey(cx, sy, cz);
    if (this.sections.has(k)) return true;
    const chunk = this.world.getChunk(cx, cz);
    if (!chunk) return false;
    const R = this.R;
    const ox = cx * 16, oy = sy * 16, oz = cz * 16;
    const get = (x: number, y: number, z: number) => this.world.getBlock(x, y, z);
    const data = buildSectionData(get, ox, oy, oz, chunk.blocks[sy]);
    const s: SectionCol = { key: k, cx, sy, cz, vox: new Array(SURFACE_CLASS_COUNT).fill(null), cells: new Uint8Array(4096), partial: new Map(), lastWanted: this.time };
    for (let c = 0; c < SURFACE_CLASS_COUNT; c++) {
      const co = data.voxels[c];
      if (!co.length) continue;
      for (let i = 0; i < co.length; i += 3) s.cells[(co[i + 1] << 8) | (co[i + 2] << 4) | co[i]] = c + 1;
      s.vox[c] = this.createVoxelCollider(s, c, co);
    }
    for (const [idx, boxes] of data.partial) s.partial.set(idx, this.createBoxes(boxes, (chunk.blocks[sy]?.[idx] ?? 0)));
    this.sections.set(k, s);
    this.pending.delete(k);
    // stitch voxel colliders (within the section and with built neighbours)
    for (let c = 0; c < SURFACE_CLASS_COUNT; c++) if (s.vox[c]) this.combineWithNeighbours(s, c);
    return true;
  }

  private createVoxelCollider(s: SectionCol, cls: number, coords: Int32Array): Col {
    const R = this.R;
    const m = SURFACE_MATERIALS[cls];
    const d = R.ColliderDesc.voxels(coords, { x: 1, y: 1, z: 1 })
      .setTranslation(s.cx * 16, s.sy * 16, s.cz * 16)
      .setFriction(m.friction)
      .setRestitution(m.restitution)
      .setFrictionCombineRule(R.CoefficientCombineRule.Min)
      .setRestitutionCombineRule(R.CoefficientCombineRule.Max)
      .setCollisionGroups(TERRAIN_GROUPS);
    return this.rw.createCollider(d);
  }

  private combineWithNeighbours(s: SectionCol, cls: number) {
    const a = s.vox[cls]!;
    for (let c = 0; c < SURFACE_CLASS_COUNT; c++) {
      const b = s.vox[c];
      if (b && c !== cls) a.combineVoxelStates(b, 0, 0, 0);
    }
    for (const [dx, dy, dz] of NEIGH26) {
      const n = this.sections.get(sectionKey(s.cx + dx, s.sy + dy, s.cz + dz));
      if (!n) continue;
      for (const b of n.vox) if (b) a.combineVoxelStates(b, dx * 16, dy * 16, dz * 16);
    }
  }

  private createBoxes(boxes: number[], state: number): Col[] {
    const R = this.R;
    const out: Col[] = [];
    const cls = state ? blockCollision(state, () => 0, 0, 0, 0).cls : 0;
    const m = SURFACE_MATERIALS[cls] ?? SURFACE_MATERIALS[0];
    for (let i = 0; i < boxes.length; i += 6) {
      const hx = (boxes[i + 3] - boxes[i]) / 2, hy = (boxes[i + 4] - boxes[i + 1]) / 2, hz = (boxes[i + 5] - boxes[i + 2]) / 2;
      if (hx <= 0.001 || hy <= 0.001 || hz <= 0.001) continue;
      const d = R.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(boxes[i] + hx, boxes[i + 1] + hy, boxes[i + 2] + hz)
        .setFriction(m.friction)
        .setRestitution(m.restitution)
        .setFrictionCombineRule(R.CoefficientCombineRule.Min)
        .setRestitutionCombineRule(R.CoefficientCombineRule.Max)
        .setCollisionGroups(TERRAIN_GROUPS);
      out.push(this.rw.createCollider(d));
    }
    return out;
  }

  private dropSection(s: SectionCol) {
    for (const c of s.vox) if (c) this.rw.removeCollider(c, false);
    for (const cs of s.partial.values()) for (const c of cs) this.rw.removeCollider(c, false);
    this.sections.delete(s.key);
    // bodies resting on it may need it again: wake them so they rebuild before falling
    this.wakeAround(s.cx * 16 + 8, s.sy * 16 + 8, s.cz * 16 + 8, 14);
  }

  /** Is the section containing the block built? (tests/debug) */
  hasSection(x: number, y: number, z: number) {
    return this.sections.has(sectionKey(x >> 4, y >> 4, z >> 4));
  }
  get sectionCount() {
    return this.sections.size;
  }

  // ------------------------------------------------------------------ incremental updates
  /** Bulk edits: while > 0, block changes only mark their sections (see beginBatch/endBatch). */
  private batchDepth = 0;
  private batchSections = new Set<number>();
  /** Start a bulk edit: per-block collider updates are deferred until endBatch. */
  beginBatch() {
    this.batchDepth++;
  }
  /** End a bulk edit: every touched section is dropped once and rebuilt lazily where bodies need it. */
  endBatch() {
    if (this.batchDepth > 0) this.batchDepth--;
    if (this.batchDepth > 0 || this.batchSections.size === 0) return;
    for (const k of this.batchSections) {
      const sec = this.sections.get(k);
      if (sec) this.dropSection(sec);
    }
    this.batchSections.clear();
  }

  private onBlockChanged(x: number, y: number, z: number) {
    if (this.batchDepth > 0) {
      // the block's section, plus neighbours when it sits on a section border
      const cx = x >> 4, sy = y >> 4, cz = z >> 4, lx = x & 15, ly = y & 15, lz = z & 15;
      this.batchSections.add(sectionKey(cx, sy, cz));
      if (lx === 0) this.batchSections.add(sectionKey(cx - 1, sy, cz));
      else if (lx === 15) this.batchSections.add(sectionKey(cx + 1, sy, cz));
      if (lz === 0) this.batchSections.add(sectionKey(cx, sy, cz - 1));
      else if (lz === 15) this.batchSections.add(sectionKey(cx, sy, cz + 1));
      if (ly === 0 && sy > 0) this.batchSections.add(sectionKey(cx, sy - 1, cz));
      else if (ly === 15 && sy < 15) this.batchSections.add(sectionKey(cx, sy + 1, cz));
      return;
    }
    this.updateBlock(x, y, z);
    // neighbour-dependent shapes (fences, panes, walls, stairs)
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const st = this.world.getBlock(x + dx, y + dy, z + dz);
      if (st && blockCollision(st, (a, b, c) => this.world.getBlock(a, b, c), x + dx, y + dy, z + dz).kind === 2) this.updateBlock(x + dx, y + dy, z + dz);
    }
    this.wakeAround(x + 0.5, y + 0.5, z + 0.5, 1.6);
  }

  /** Re-evaluate the collider of one block (if its section is built). */
  updateBlock(x: number, y: number, z: number) {
    if (y < 0 || y > 255) return;
    const s = this.sections.get(sectionKey(x >> 4, y >> 4, z >> 4));
    if (!s) return;
    const lx = x & 15, ly = y & 15, lz = z & 15;
    const idx = (ly << 8) | (lz << 4) | lx;
    const old = s.partial.get(idx);
    if (old) {
      for (const c of old) this.rw.removeCollider(c, false);
      s.partial.delete(idx);
    }
    const st = this.world.getBlock(x, y, z);
    const bc = blockCollision(st, (a, b, c) => this.world.getBlock(a, b, c), x, y, z);
    const prev = s.cells[idx];
    const want = bc.kind === 1 ? bc.cls + 1 : 0;
    if (prev !== want) {
      if (prev) this.setVoxel(s, prev - 1, lx, ly, lz, false);
      if (want) this.setVoxel(s, want - 1, lx, ly, lz, true);
      s.cells[idx] = want;
    }
    if (bc.kind === 2 && bc.boxes) {
      const wb: number[] = [];
      for (let j = 0; j < bc.boxes.length; j += 6) wb.push(x + bc.boxes[j], y + bc.boxes[j + 1], z + bc.boxes[j + 2], x + bc.boxes[j + 3], y + bc.boxes[j + 4], z + bc.boxes[j + 5]);
      s.partial.set(idx, this.createBoxes(wb, st));
    }
  }

  private setVoxel(s: SectionCol, cls: number, lx: number, ly: number, lz: number, filled: boolean) {
    let c = s.vox[cls];
    if (!c) {
      if (!filled) return;
      c = s.vox[cls] = this.createVoxelCollider(s, cls, new Int32Array([lx, ly, lz]));
      this.combineWithNeighbours(s, cls);
      return;
    }
    c.setVoxel(lx, ly, lz, filled);
    // keep internal-edge information of neighbouring voxel shapes coherent
    for (let o = 0; o < SURFACE_CLASS_COUNT; o++) {
      const b = s.vox[o];
      if (b && o !== cls) c.propagateVoxelChange(b, lx, ly, lz, 0, 0, 0);
    }
    if (lx === 0 || lx === 15 || ly === 0 || ly === 15 || lz === 0 || lz === 15) {
      for (const [dx, dy, dz] of NEIGH26) {
        if ((dx < 0 && lx !== 0) || (dx > 0 && lx !== 15) || (dy < 0 && ly !== 0) || (dy > 0 && ly !== 15) || (dz < 0 && lz !== 0) || (dz > 0 && lz !== 15)) continue;
        const n = this.sections.get(sectionKey(s.cx + dx, s.sy + dy, s.cz + dz));
        if (!n) continue;
        for (const b of n.vox) if (b) c.propagateVoxelChange(b, lx, ly, lz, dx * 16, dy * 16, dz * 16);
      }
    }
  }

  // ------------------------------------------------------------------ fluids
  private fluidForces(b: PhysBody, dt: number) {
    const w = this.world;
    const x = Math.floor(b.pos.x), z = Math.floor(b.pos.z);
    const ext = Math.max(b.half.y, Math.min(b.radius, 0.6));
    const bottom = b.pos.y - ext, top = b.pos.y + ext;
    const liq = (s: number) => T_LIQUID[s >>> 4];
    const get = (a: number, c: number, d: number) => w.getBlock(a, c, d);
    let fs = fluidSurface(get, x, Math.floor(b.pos.y), z, liq);
    if (!fs.kind) fs = fluidSurface(get, x, Math.floor(bottom + 0.05), z, liq);
    if (!fs.kind) {
      b.submerged = 0;
      b.fluid = 0;
      return;
    }
    const f = Math.max(0, Math.min(1, (fs.surface - bottom) / Math.max(0.02, top - bottom)));
    b.submerged = f;
    b.fluid = fs.kind;
    if (f <= 0) return;
    const g = this.gravity;
    const lava = fs.kind === 2;
    // buoyancy (Archimedes, scaled by the body's buoyancy factor) + quadratic-ish drag
    const up = b.buoyancy * f * b.mass * g * (lava ? 1.2 : 1);
    const v = b.rb.linvel();
    const drag = (lava ? 6 : 2.2) * f;
    const k = Math.min(1, drag * dt);
    const imp = _v.set(-v.x * k * b.mass, up * dt - v.y * k * b.mass, -v.z * k * b.mass);
    // flow push
    const flow = fluidFlow(w, x, Math.floor(Math.min(fs.surface - 0.01, b.pos.y)), z);
    imp.x += flow.x * b.mass * 1.4 * dt * f;
    imp.z += flow.z * b.mass * 1.4 * dt * f;
    b.rb.applyImpulse(imp, true);
    const av = b.rb.angvel();
    const ak = Math.min(1, 3 * f * dt);
    b.rb.setAngvel({ x: av.x * (1 - ak), y: av.y * (1 - ak), z: av.z * (1 - ak) }, true);
  }
}

/** Approximate horizontal flow direction of a fluid block (Minecraft-like level gradient). */
export function fluidFlow(w: World, x: number, y: number, z: number): { x: number; z: number } {
  const st = w.getBlock(x, y, z);
  const k = T_LIQUID[st >>> 4];
  if (!k) return { x: 0, z: 0 };
  const h = (s: number) => (T_LIQUID[s >>> 4] !== k ? -1 : (s & 8) ? 1 : (8 - (s & 7)) / 9);
  const h0 = h(st);
  let fx = 0, fz = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = w.getBlock(x + dx, y, z + dz);
    let hn = h(n);
    if (hn < 0) {
      if (n !== 0) continue; // solid neighbours block the flow; air: look at the falling edge below
      const below = w.getBlock(x + dx, y - 1, z + dz);
      hn = T_LIQUID[below >>> 4] === k ? h(below) - 1 : 0;
    }
    const d = h0 - hn;
    fx += dx * d;
    fz += dz * d;
  }
  const l = Math.hypot(fx, fz);
  if (l < 1e-4 || ((st & 7) === 0 && !(st & 8))) return { x: 0, z: 0 };
  return { x: fx / l, z: fz / l };
}
