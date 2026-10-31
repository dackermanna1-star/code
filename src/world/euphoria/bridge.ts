import * as THREE from 'three';
import {
  Body,
  Controller,
  ControllerMode,
  ControllerWound,
  LANDMARKS,
  Quat,
  Ragdoll as LabRagdoll,
  Segment,
  Shape,
  Vec3,
  World,
  withBuildScale,
} from './engine.js';
import { B, BONE_COUNT, PARENT, SkeletonDef } from '../../anim/skeleton';
import type { Pose, PoseFK } from '../../anim/pose';
import type { Arena } from '../arena';
import type { CorpseShape, RagdollInit, RagdollLike } from '../ragdollTypes';
import type { Wound } from '../../character/material';
import { clamp, rotY } from '../../core/math';

/**
 * Bridge between the game and the Ragdoll Lab "euphoria" engine (engine.js):
 *
 *  - EuphoriaSim owns the lab's XPBD world: floor, the arena's walls/pillars/crates as
 *    static boxes, settled corpses as static capsules (so new bodies pile up on old
 *    ones) and kinematic proxies of the Rapier props with two-way impulse coupling.
 *  - ActiveRagdoll takes a character over from the animation system with its exact pose
 *    and per-limb momentum, runs the lab's controller on it (balance + stepping, falling
 *    with protective arms, ground writhing / wound holding, physical get-up, dying
 *    collapse, death twitches) and writes the simulated pose back onto the 22-bone
 *    skeleton every frame.
 */

export const EUPHORIA_STEP = 1 / 60;
const Y = new THREE.Vector3(0, 1, 0);

/** Lab segment that drives each of our bones (bones not listed follow a parent segment). */
const SEGS: { seg: string; bone: number }[] = [
  { seg: 'pelvis', bone: B.hips },
  { seg: 'abdomen', bone: B.spine },
  { seg: 'chest', bone: B.chest },
  { seg: 'neck', bone: B.neck },
  { seg: 'head', bone: B.head },
  { seg: 'upperArmL', bone: B.uarmL },
  { seg: 'forearmL', bone: B.farmL },
  { seg: 'handL', bone: B.handL },
  { seg: 'upperArmR', bone: B.uarmR },
  { seg: 'forearmR', bone: B.farmR },
  { seg: 'handR', bone: B.handR },
  { seg: 'thighL', bone: B.thighL },
  { seg: 'shinL', bone: B.shinL },
  { seg: 'footL', bone: B.footL },
  { seg: 'thighR', bone: B.thighR },
  { seg: 'shinR', bone: B.shinR },
  { seg: 'footR', bone: B.footR },
];
const SEG_INDEX: Record<string, number> = Object.fromEntries(SEGS.map((s, i) => [s.seg, i]));
const BONE_SEG: number[] = (() => {
  const m = new Array(BONE_COUNT).fill(-1);
  SEGS.forEach((s, i) => (m[s.bone] = i));
  m[B.clavL] = m[B.clavR] = SEG_INDEX.chest;
  m[B.toeL] = SEG_INDEX.footL;
  m[B.toeR] = SEG_INDEX.footR;
  return m;
})();

/** Bind-pose limb directions of the lab body (its arms hang 12° off vertical; ours are in a 48° A-pose). */
const LAB_DIR: (THREE.Vector3 | null)[] = (() => {
  const lm = (n: string) => new THREE.Vector3(LANDMARKS[n].x, LANDMARKS[n].y, LANDMARKS[n].z);
  const dir = (a: string, b: string) => lm(b).sub(lm(a)).normalize();
  const mir = (v: THREE.Vector3) => new THREE.Vector3(-v.x, v.y, v.z);
  const ua = dir('shoulderL', 'elbowL'), fa = dir('elbowL', 'wristL'), th = dir('hipL', 'kneeL'), sh = dir('kneeL', 'ankleL');
  const d: (THREE.Vector3 | null)[] = new Array(BONE_COUNT).fill(null);
  d[B.uarmL] = ua; d[B.farmL] = fa; d[B.handL] = fa;
  d[B.thighL] = th; d[B.shinL] = sh;
  d[B.uarmR] = mir(ua); d[B.farmR] = mir(fa); d[B.handR] = mir(fa);
  d[B.thighR] = mir(th); d[B.shinR] = mir(sh);
  return d;
})();

/** Per-skeleton rest-frame corrections: W_bone = R_labSegment * C[bone]. */
interface BoneMap {
  C: THREE.Quaternion[];
  Ci: THREE.Quaternion[];
}
const boneMaps = new WeakMap<SkeletonDef, BoneMap>();
function boneMap(def: SkeletonDef): BoneMap {
  let m = boneMaps.get(def);
  if (m) return m;
  const C: THREE.Quaternion[] = [];
  const Ci: THREE.Quaternion[] = [];
  for (let i = 0; i < BONE_COUNT; i++) {
    const q = new THREE.Quaternion();
    const d = LAB_DIR[i];
    if (d) q.setFromUnitVectors(def.restDir[i].clone().normalize(), d);
    C.push(q);
    Ci.push(q.clone().invert());
  }
  m = { C, Ci };
  boneMaps.set(def, m);
  return m;
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _imp = new THREE.Vector3();
const _at = new THREE.Vector3();
const _lv = new Vec3();
const _lq = new Quat();
const Z = new THREE.Vector3(0, 0, 1);

export interface EuphoriaImpact {
  rag: ActiveRagdoll;
  seg: string;
  point: THREE.Vector3;
  speed: number;
  impulse: number;
  other: 'floor' | 'static' | 'prop' | 'body';
  material: string;
}

interface PropProxy {
  body: Body;
  mass: number;
  sync: () => { p: THREE.Vector3; q: THREE.Quaternion } | null;
  push: (imp: THREE.Vector3, at: THREE.Vector3) => void;
}

/** The lab world, stepped at a fixed 60 Hz alongside the game's Rapier world. */
export class EuphoriaSim {
  world: World;
  actives: ActiveRagdoll[] = [];
  /** Render interpolation factor between the last two physics states. */
  alpha = 1;
  maxActive: number;
  baseSubsteps: number;
  /** Smoothed cost of one 60 Hz step (ms). */
  stepMs = 0;
  /** Adaptive quality: substeps drop when a step costs more than this. */
  budgetMs = 5;
  stepsLastFrame = 0;
  onImpact: ((i: EuphoriaImpact) => void) | null = null;
  staticCount = 0;
  /** Lifetime counters (debug overlay / tests). */
  counters = { created: 0, peak: 0, steps: 0, stepMsTotal: 0, worstStepMs: 0 };
  /** Gameplay behaviour counts (filled in by the AI). */
  events: Record<string, number> = {};
  private acc = 0;
  private proxies: PropProxy[] = [];
  private byLab = new Map<LabRagdoll, ActiveRagdoll>();

  constructor(arena: Arena, substeps = 10, maxActive = 8) {
    this.baseSubsteps = substeps;
    this.maxActive = maxActive;
    this.world = new World({ substeps, groundHalfSize: 40 });
    for (const o of arena.obstacles) {
      const hx = (o.maxX - o.minX) / 2, hz = (o.maxZ - o.minZ) / 2, hy = o.h / 2;
      const mat = o.kind === 'crate' ? 'wood' : o.kind === 'prop' ? 'metal' : 'concrete';
      this.addBox(new THREE.Vector3((o.minX + o.maxX) / 2, hy, (o.minZ + o.maxZ) / 2), new THREE.Vector3(hx, hy, hz), mat);
    }
  }

  count(name: string) {
    this.events[name] = (this.events[name] ?? 0) + 1;
  }

  get capacity() {
    return this.maxActive - this.actives.length;
  }

  addBox(center: THREE.Vector3, half: THREE.Vector3, material = 'concrete', friction = 0.75, rot?: THREE.Quaternion) {
    const r = 0.01;
    const b = new Body({ name: 'static', isStatic: true });
    b.addShape(Shape.box(Math.max(0.005, half.x - r), Math.max(0.005, half.y - r), Math.max(0.005, half.z - r), { radius: r, friction, restitution: 0.05, material }));
    b.makeStatic();
    b.setPose(center, rot ?? new Quat());
    this.world.addBody(b);
    this.staticCount++;
    return b;
  }

  /** Permanent static colliders (settled corpses) so later bodies land on top of earlier ones. */
  addStaticShapes(shapes: CorpseShape[], material = 'flesh') {
    if (!shapes.length) return null;
    const b = new Body({ name: 'corpse', isStatic: true });
    for (const s of shapes) {
      const c = _v.copy(s.a).add(s.b).multiplyScalar(0.5);
      const len = s.a.distanceTo(s.b);
      const opts: Record<string, unknown> = { friction: 0.85, restitution: 0.02, material, localPos: new Vec3(c.x, c.y, c.z) };
      if (s.kind === 'ball' || len < 1e-3) b.addShape(Shape.sphere(s.radius, opts));
      else {
        _q.setFromUnitVectors(Y, _v2.copy(s.b).sub(s.a).normalize());
        opts.localRot = new Quat(_q.x, _q.y, _q.z, _q.w);
        b.addShape(Shape.capsule(s.radius, len / 2, opts));
      }
    }
    b.makeStatic();
    b.setPose(new Vec3(), new Quat());
    this.world.addBody(b);
    this.staticCount++;
    return b;
  }

  /** A Rapier body mirrored into the lab world. Ragdoll contacts push it back (scaled by mass ratio). */
  addProxy(shape: Shape, mass: number, sync: PropProxy['sync'], push: PropProxy['push']) {
    const b = new Body({ name: 'prop', isStatic: true });
    b.addShape(shape);
    b.makeStatic();
    b.kinematic = true;
    const st = sync();
    if (st) b.setPose(st.p, st.q);
    this.world.addBody(b);
    this.proxies.push({ body: b, mass, sync, push });
  }

  register(r: ActiveRagdoll) {
    this.actives.push(r);
    this.byLab.set(r.rd, r);
    this.counters.created++;
    this.counters.peak = Math.max(this.counters.peak, this.actives.length);
    // bodies that already interpenetrate another ragdoll when they go physical would be shoved
    // apart in one step (and fly): let such pairs pass through each other until they separate
    const others: Body[] = [];
    for (const o of this.actives) if (o !== r) others.push(...o.rd.bodies);
    // moving proxies (standing fighters, props) too - including the fighter's own capsule
    for (const p of this.proxies) others.push(p.body);
    for (const a of r.rd.bodies)
      for (const b of others) {
        if (!aabbOverlap(a, b)) continue;
        (a.ignore ??= new Set()).add(b);
        (b.ignore ??= new Set()).add(a);
        r.grace.push([a, b]);
      }
  }
  unregister(r: ActiveRagdoll) {
    const i = this.actives.indexOf(r);
    if (i >= 0) this.actives.splice(i, 1);
    this.byLab.delete(r.rd);
  }

  update(dt: number) {
    this.stepsLastFrame = 0;
    if (!this.actives.length) {
      this.acc = 0;
      this.alpha = 1;
      return;
    }
    this.syncProxies();
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= EUPHORIA_STEP && n < 3) {
      const t0 = performance.now();
      for (const r of this.actives) r.preStep(EUPHORIA_STEP);
      this.world.step(EUPHORIA_STEP);
      for (let i = this.actives.length - 1; i >= 0; i--) this.actives[i].postStep(EUPHORIA_STEP);
      this.feedbackProxies();
      this.collectImpacts();
      this.acc -= EUPHORIA_STEP;
      n++;
      const ms = performance.now() - t0;
      this.stepMs = this.stepMs * 0.92 + ms * 0.08;
      const c = this.counters;
      c.steps++;
      c.stepMsTotal += ms;
      c.worstStepMs = Math.max(c.worstStepMs, ms);
    }
    if (n === 3) this.acc = Math.min(this.acc, EUPHORIA_STEP * 0.5);
    this.stepsLastFrame = n;
    this.alpha = clamp(this.acc / EUPHORIA_STEP, 0, 1);
    // adaptive substeps: keep the solver inside its time budget under heavy load
    const w = this.world;
    if (this.stepMs > this.budgetMs && w.substeps > 6) w.substeps--;
    else if (this.stepMs < this.budgetMs * 0.55 && w.substeps < this.baseSubsteps) w.substeps++;
  }

  private syncProxies() {
    for (let i = this.proxies.length - 1; i >= 0; i--) {
      const p = this.proxies[i];
      const st = p.sync();
      if (!st) {
        this.world.removeBody(p.body);
        this.proxies.splice(i, 1);
        continue;
      }
      p.body.setPose(st.p, st.q);
    }
  }

  private feedbackProxies() {
    for (const p of this.proxies) {
      const b = p.body;
      if (!b.contactCount) continue;
      // the lab treats the proxy as immovable: hand the prop its share of the momentum exchange
      const k = clamp(p.mass / (p.mass + 25), 0.2, 0.8);
      _imp.set(b.contactImpulse.x, b.contactImpulse.y, b.contactImpulse.z).multiplyScalar(k);
      if (_imp.lengthSq() < 1e-6) continue;
      p.push(_imp, _at.set(b.pos.x, b.pos.y, b.pos.z));
    }
  }

  private collectImpacts() {
    const cb = this.onImpact;
    if (!cb) return;
    for (const im of this.world.impactList) {
      if (im.speed < 1.1) continue;
      const la = im.bodyA.userData.ragdoll as LabRagdoll | undefined;
      const lb = im.bodyB ? (im.bodyB.userData.ragdoll as LabRagdoll | undefined) : undefined;
      const ra = la ? this.byLab.get(la) : undefined;
      const rb = lb ? this.byLab.get(lb) : undefined;
      const owner = ra ?? rb;
      if (!owner || owner.time - owner.lastImpact < 0.11) continue;
      owner.lastImpact = owner.time;
      const body = ra ? im.bodyA : im.bodyB!;
      const seg = ((body.userData.segment as Segment | undefined)?.name) ?? 'pelvis';
      const otherShape = ra ? im.shapeB : im.shapeA;
      const otherBody = ra ? im.bodyB : im.bodyA;
      let other: EuphoriaImpact['other'] = 'floor';
      if (otherBody && otherBody.userData.ragdoll) other = 'body';
      else if (otherShape?.body?.kinematic) other = 'prop';
      else if (otherShape?.body) other = 'static';
      cb({
        rag: owner,
        seg,
        point: new THREE.Vector3(im.point.x, im.point.y, im.point.z),
        speed: im.speed,
        impulse: im.impulse,
        other,
        material: otherShape?.material ?? 'concrete',
      });
    }
  }

  /** Run a throwaway body for a while so the JIT has compiled the solver before the first fight. */
  prewarm(def: SkeletonDef, fk: PoseFK, frames = 90) {
    const cb = this.onImpact;
    this.onImpact = null;
    const r = new ActiveRagdoll(this, { def, fk, dt: EUPHORIA_STEP, rootX: 0, rootZ: -30, rootYaw: 0, vel: new THREE.Vector3(), scale: def.scale });
    r.hit(new THREE.Vector3(0, 0, 160), undefined, 'chest', 1);
    for (let i = 0; i < frames; i++) {
      if (i === 45) r.kill('limp');
      this.update(EUPHORIA_STEP);
    }
    r.dispose();
    this.onImpact = cb;
    this.stepMs = 0;
    this.counters = { created: 0, peak: 0, steps: 0, stepMsTotal: 0, worstStepMs: 0 };
    this.events = {};
  }
}

export type DeathStyle = 'collapse' | 'limp';

/** A character driven by the lab's active-ragdoll controller. */
export class ActiveRagdoll implements RagdollLike {
  readonly active = true;
  rd: LabRagdoll;
  ctl: Controller;
  time = 0;
  calmTime = 0;
  settled = false;
  disposed = false;
  dead = false;
  /** Time the controller has been standing balanced (stagger recovery). */
  standTime = 0;
  lastImpact = -1;
  /** Body pairs (this ragdoll, another) ignoring each other until they stop overlapping. */
  grace: [Body, Body][] = [];
  private segs: Segment[];
  private map: BoneMap;
  private def: SkeletonDef;
  private hipsOff = new THREE.Vector3();
  private W: THREE.Quaternion[] = Array.from({ length: BONE_COUNT }, () => new THREE.Quaternion());
  private buckleT = 0;
  private legBase = { L: 1, R: 1 };
  private shrugQ = new THREE.Quaternion();
  readonly scale: number;

  constructor(public sim: EuphoriaSim, init: RagdollInit) {
    const { def } = init;
    this.def = def;
    this.scale = init.scale;
    this.map = boneMap(def);
    const s = init.scale;
    const bulk = clamp(def.spec.bulk, 0.85, 1.5);
    this.rd = withBuildScale(s, bulk, () => new LabRagdoll(sim.world, { position: new Vec3(init.rootX, 0, init.rootZ), yaw: init.rootYaw }));
    this.segs = SEGS.map((x) => this.rd.segments[x.seg]);
    const pb = this.rd.segments.pelvis.bindPos;
    this.hipsOff.set(def.rest[B.hips].x - pb.x, def.rest[B.hips].y - pb.y, def.rest[B.hips].z - pb.z);
    this.poseFrom(init);
    for (const b of this.rd.bodies) {
      b.maxLinearSpeed = 22;
      b.maxAngularSpeed = 40;
    }
    this.rd.addToWorld();
    this.ctl = withBuildScale(s, bulk, () => new Controller(this.rd, { rng: Math.random }));
    this.ctl.reactions = 'realistic';
    sim.register(this);
  }

  /** Place every lab body on the animated pose and give it that pose's momentum. */
  private poseFrom(init: RagdollInit) {
    const bodies = this.segs.map((s) => s.body);
    const n = bodies.length;
    const prevP: THREE.Vector3[] = [];
    const prevQ: THREE.Quaternion[] = [];
    const dt = Math.max(1 / 240, init.dt);
    if (init.prevFk) {
      this.applyFk(init.prevFk, init.rootX, init.rootZ, init.rootYaw);
      for (const b of bodies) {
        prevP.push(new THREE.Vector3(b.pos.x, b.pos.y, b.pos.z));
        prevQ.push(new THREE.Quaternion(b.rot.x, b.rot.y, b.rot.z, b.rot.w));
      }
    }
    this.applyFk(init.fk, init.rootX, init.rootZ, init.rootYaw);
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      b.vel.set(init.vel.x, init.vel.y, init.vel.z);
      b.angVel.set(0, 0, 0);
      if (!init.prevFk) continue;
      _v.set(b.pos.x - prevP[i].x, b.pos.y - prevP[i].y, b.pos.z - prevP[i].z).divideScalar(dt);
      if (_v.length() > 8) _v.setLength(8);
      b.vel.x += _v.x;
      b.vel.y += _v.y;
      b.vel.z += _v.z;
      _lq.multiplyConjB(b.rot, prevQ[i]);
      const k = (_lq.w >= 0 ? 2 : -2) / dt;
      _lv.set(_lq.x * k, _lq.y * k, _lq.z * k);
      const w = _lv.length();
      if (w > 20) _lv.scale(20 / w);
      b.angVel.copy(_lv);
    }
  }

  private applyFk(fk: PoseFK, rootX: number, rootZ: number, rootYaw: number) {
    const { Ci } = this.map;
    _qr.setFromAxisAngle(Y, rootYaw);
    const R: THREE.Quaternion[] = SEGS.map(({ bone }) => new THREE.Quaternion().copy(_qr).multiply(fk.rot[bone]).multiply(Ci[bone]));
    const local: Record<string, THREE.Quaternion> = {};
    SEGS.forEach((s, i) => {
      const seg = this.segs[i];
      if (!seg.parent || !seg.joint) return;
      const pi = SEG_INDEX[seg.parent.name];
      local[seg.joint.name] = R[pi].clone().invert().multiply(R[i]);
    });
    const hp = fk.pos[B.hips];
    const [x, z] = rotY(hp.x, hp.z, rootYaw);
    const pelvis = _v.set(rootX + x, hp.y, rootZ + z).sub(_v2.copy(this.hipsOff).applyQuaternion(R[0]));
    this.rd.applyPose(pelvis, R[0], local);
  }

  // ------------------------------------------------------------------ stepping
  preStep(dt: number) {
    if (this.buckleT > 0) {
      this.buckleT -= dt;
      if (this.buckleT <= 0) {
        this.ctl.legStrength.L = this.legBase.L;
        this.ctl.legStrength.R = this.legBase.R;
      }
    }
    this.ctl.update(dt);
  }

  postStep(dt: number) {
    this.time += dt;
    for (let i = this.grace.length - 1; i >= 0; i--) {
      const [a, b] = this.grace[i];
      if (aabbOverlap(a, b) && this.time < 1.5) continue;
      a.ignore?.delete(b);
      b.ignore?.delete(a);
      this.grace.splice(i, 1);
    }
    const c = this.ctl;
    if (c.mode === 'balance' && c.sens.upTilt < 0.4 && c.sens.pelvisH > 0.72 * this.scale && c.sens.comVel.length() < 0.6) this.standTime += dt;
    else this.standTime = 0;
    if (this.dead) {
      let maxV = 0;
      for (const b of this.rd.bodies) maxV = Math.max(maxV, b.vel.length(), b.angVel.length() * 0.15);
      if (maxV < 0.14) this.calmTime += dt;
      else this.calmTime = 0;
      if ((this.calmTime > 0.5 && this.time > 1.2) || this.time > 8) this.settled = true;
    }
  }

  /** Bookkeeping hook of RagdollLike; the simulation itself is stepped by EuphoriaSim. */
  update(dt: number) {
    void dt;
  }
  read() {}

  // ------------------------------------------------------------------ queries
  get mode(): ControllerMode {
    return this.ctl.mode;
  }
  /** Standing balanced and calm. */
  get upright() {
    return this.standTime > 0.3;
  }
  get getUpPhase() {
    return this.ctl.mode === 'getup' ? this.ctl.gu?.phase ?? 'start' : null;
  }
  /** Lying (or kneeling) on the floor rather than standing / staggering. */
  get grounded() {
    const m = this.ctl.mode;
    return m === 'falling' || m === 'ground' || m === 'unconscious' || m === 'dead' || (m === 'getup' && this.ctl.sens.pelvisH < 0.6 * this.scale);
  }
  pelvisPos(out: THREE.Vector3) {
    const p = this.rd.pelvis.pos;
    return out.set(p.x, p.y, p.z);
  }
  chestPos(out: THREE.Vector3) {
    const p = this.rd.segments.chest.body.pos;
    return out.set(p.x, p.y, p.z);
  }
  headPos(out: THREE.Vector3) {
    const p = this.rd.segments.head.body.pos;
    return out.set(p.x, p.y, p.z);
  }
  pelvisVel(out: THREE.Vector3) {
    const v = this.rd.pelvis.vel;
    return out.set(v.x, v.y, v.z);
  }
  rootPos(out: THREE.Vector3) {
    const p = this.rd.pelvis.pos;
    return out.set(p.x, 0, p.z);
  }
  faceUp() {
    const q = this.rd.segments.chest.body.rot;
    return _v.copy(Z).applyQuaternion(_q.set(q.x, q.y, q.z, q.w)).y > 0;
  }
  /** Yaw the pelvis faces (used when handing a standing body back to animation). */
  heading() {
    const q = this.rd.pelvis.rot;
    _v.copy(Z).applyQuaternion(_q.set(q.x, q.y, q.z, q.w));
    return Math.atan2(_v.x, _v.z);
  }
  bodyNear(at: THREE.Vector3): Segment {
    let best = this.segs[2];
    let bd = Infinity;
    for (const s of this.segs) {
      const p = s.body.pos;
      const d = (p.x - at.x) ** 2 + (p.y - at.y) ** 2 + (p.z - at.z) ** 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ actions
  impulse(imp: THREE.Vector3, at?: THREE.Vector3, partName?: string) {
    const seg = partName ? this.rd.segments[partName] ?? this.rd.segments.chest : at ? this.bodyNear(at) : this.rd.segments.chest;
    this.applyDistributed(seg, imp, at);
  }

  /**
   * The struck part takes what it can (a few m/s of delta-v, less for the head) and the
   * rest travels into the torso core at the same point, so blows rotate the whole body
   * instead of flinging one light segment off at absurd speed.
   */
  private applyDistributed(seg: Segment, imp: THREE.Vector3, at?: THREE.Vector3) {
    const b = seg.body;
    const name = seg.name;
    const upper = !/^(pelvis|thigh|shin|foot)/.test(name);
    const core = upper ? this.rd.segments.chest : this.rd.segments.pelvis;
    const p = at ?? b.pos;
    if (seg === core) {
      b.applyImpulse(imp, p);
      return;
    }
    const len = imp.length();
    const cap = b.mass * (name === 'head' || name === 'neck' ? 4.5 : 7);
    const k = len > cap ? cap / len : 1;
    b.applyImpulse(_imp.copy(imp).multiplyScalar(k), p);
    if (k < 1) core.body.applyImpulse(_imp.copy(imp).multiplyScalar(1 - k), p);
  }

  /** A blow: impulse plus the controller's flinch / startle / attention response. */
  hit(imp: THREE.Vector3, at?: THREE.Vector3, partName?: string, strength = 0.6) {
    const seg = partName ? this.rd.segments[partName] ?? this.rd.segments.chest : at ? this.bodyNear(at) : this.rd.segments.chest;
    this.applyDistributed(seg, imp, at);
    const len = imp.length();
    if (len > 1e-4) this.ctl.onHit({ strength: clamp(strength, 0, 1.5), segment: seg.name, dir: new Vec3(imp.x / len, imp.y / len, imp.z / len), kind: 'blunt' });
  }

  launch(v: THREE.Vector3, spin = 0) {
    for (const b of this.rd.bodies) {
      b.vel.x += v.x;
      b.vel.y += v.y;
      b.vel.z += v.z;
      if (spin) {
        b.angVel.x += (Math.random() - 0.5) * spin;
        b.angVel.y += (Math.random() - 0.5) * spin * 0.5;
        b.angVel.z += (Math.random() - 0.5) * spin;
      }
    }
  }

  /** Make the body go down along `dir` (protective arms, knees give) instead of trying to step out of it. */
  forceFall(dir: THREE.Vector3) {
    const c = this.ctl;
    if (!c.alive || c.mode !== 'balance') return;
    c.fallDir.set(dir.x, 0, dir.z);
    if (c.fallDir.lengthSq() < 1e-6) c.fallDir.set(Math.sin(c.heading), 0, Math.cos(c.heading));
    c.fallDir.normalize();
    c.fallCause = 'balance';
    (c as unknown as { kneel: unknown }).kneel = null;
    c.setMode('falling');
  }

  /** Knees buckle for `sec` seconds (legStrength drops to `strength`). */
  buckle(sec: number, strength = 0.25) {
    this.buckleT = Math.max(this.buckleT, sec);
    this.ctl.legStrength.L = Math.min(this.ctl.legStrength.L, strength);
    this.ctl.legStrength.R = Math.min(this.ctl.legStrength.R, strength);
  }

  /** Physiology inputs from the game's damage model. */
  setCondition(o: { pain?: number; legL?: number; legR?: number; armL?: number; armR?: number; balance?: number }) {
    const c = this.ctl;
    if (o.pain !== undefined) c.pain = clamp(o.pain, 0, 1);
    if (o.legL !== undefined) this.legBase.L = clamp(o.legL, 0, 1);
    if (o.legR !== undefined) this.legBase.R = clamp(o.legR, 0, 1);
    if (this.buckleT <= 0) {
      c.legStrength.L = this.legBase.L;
      c.legStrength.R = this.legBase.R;
    }
    if (o.armL !== undefined) c.armStrength.L = clamp(o.armL, 0, 1);
    if (o.armR !== undefined) c.armStrength.R = clamp(o.armR, 0, 1);
    if (o.balance !== undefined) c.balanceSkill = clamp(o.balance, 0.05, 1);
  }

  /** An incoming strike the body can see coming (arms come up to block it). */
  threat(point: THREE.Vector3, from: THREE.Vector3, tti: number) {
    this.ctl.threat = { point: new Vec3(point.x, point.y, point.z), from: new Vec3(from.x, from.y, from.z).normalize(), tti, miss: 0, body: null };
  }

  /** Map the character's painted wounds onto lab bodies so the hands clutch them. */
  setWounds(ws: Wound[]) {
    const def = this.def;
    const { C } = this.map;
    const picks = ws
      .filter((w) => w.type !== 2)
      .map((w) => ({ w, pr: w.intensity * w.radius * (w.type === 0 ? 14 : 6) }))
      .filter((x) => x.pr > 0.12)
      .sort((a, b) => b.pr - a.pr)
      .slice(0, 3);
    const out: ControllerWound[] = [];
    for (const { w, pr } of picks) {
      // nearest bone segment (joint -> child joint) in rest space
      let best = 0;
      let bd = Infinity;
      SEGS.forEach(({ bone }, i) => {
        const a = def.rest[bone];
        const child = bone === B.head ? null : SEGS.find((s) => PARENT[s.bone] === bone || (bone === B.chest && s.bone === B.neck));
        const b = child ? def.rest[child.bone] : _v2.copy(a).add(_v.set(0, 0.12 * def.scale, 0));
        const d = distToSegmentSq(w.pos, a, b);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      const { bone } = SEGS[best];
      const seg = this.segs[best];
      const o = _v.copy(w.pos).sub(def.rest[bone]).applyQuaternion(C[bone]);
      const anchor = seg.joint ? (seg.joint.userData.bindAnchor as Vec3) : null;
      const local = new Vec3();
      if (anchor) local.set(o.x + anchor.x - seg.bindPos.x, o.y + anchor.y - seg.bindPos.y, o.z + anchor.z - seg.bindPos.z);
      else local.set(o.x + this.hipsOff.x, o.y + this.hipsOff.y, o.z + this.hipsOff.z);
      const axis = LAB_DIR[bone] ?? Y;
      const nrm = _v2.copy(o).addScaledVector(axis, -o.dot(axis));
      if (nrm.lengthSq() < 1e-6) nrm.set(0, 0, 1);
      nrm.normalize();
      out.push({ body: seg.body, segment: seg, local, normal: new Vec3(nrm.x, nrm.y, nrm.z), priority: pr });
    }
    this.ctl.wounds = out;
  }

  /** Death: 'collapse' = the dying stagger of a fatally hurt person; 'limp' = instant loss of all tone. */
  kill(style: DeathStyle = 'collapse', cause = '') {
    if (this.dead) return;
    this.dead = true;
    const c = this.ctl;
    c.reactions = style === 'collapse' ? 'rdr' : 'realistic';
    c.alive = false;
    (c as unknown as { residualHold: number }).residualHold = 0.35;
    if (style === 'limp') c.tone = Math.min(c.tone, 0.2);
    c.onDeath(cause);
    this.calmTime = 0;
    this.settled = false;
  }

  /** Knocked out cold but alive (fencing reflex on hard head trauma). */
  knockOut(severity = 0.8) {
    this.ctl.onKnockOut(severity);
    this.ctl.conscious = false;
  }
  wake() {
    if (!this.dead) this.ctl.conscious = true;
  }

  /** Simplified static colliders for the settled body (torso, head, upper limbs). */
  corpseShapes(): CorpseShape[] {
    const out: CorpseShape[] = [];
    const use = ['pelvis', 'abdomen', 'chest', 'head', 'thighL', 'thighR', 'shinL', 'shinR', 'upperArmL', 'upperArmR'];
    for (const name of use) {
      const seg = this.rd.segments[name];
      const sh = seg.body.shapes[0];
      if (!sh) continue;
      sh.updateWorld(seg.body.pos, seg.body.rot);
      const q = _q.set(sh.wRot.x, sh.wRot.y, sh.wRot.z, sh.wRot.w);
      const c = new THREE.Vector3(sh.wPos.x, sh.wPos.y, sh.wPos.z);
      if (sh.type === 1) {
        const ax = _v.set(0, sh.halfHeight, 0).applyQuaternion(q);
        out.push({ kind: 'capsule', a: c.clone().sub(ax), b: c.clone().add(ax), radius: sh.radius * 0.9 });
      } else if (sh.type === 2) {
        // rounded box -> capsule along its longest axis, thickness from its thinnest
        const h = sh.halfExtents;
        const ext = [h.x, h.y, h.z];
        const long = ext.indexOf(Math.max(...ext));
        const thin = Math.min(...ext);
        const ax = _v.set(long === 0 ? ext[0] : 0, long === 1 ? ext[1] : 0, long === 2 ? ext[2] : 0).applyQuaternion(q);
        out.push({ kind: 'capsule', a: c.clone().sub(ax), b: c.clone().add(ax), radius: (thin + sh.radius) * 0.9 });
      } else out.push({ kind: 'ball', a: c.clone(), b: c.clone(), radius: sh.radius * 0.9 });
    }
    for (const s of out) {
      s.a.y = Math.max(s.a.y, s.radius * 0.8);
      s.b.y = Math.max(s.b.y, s.radius * 0.8);
    }
    return out;
  }

  // ------------------------------------------------------------------ pose output
  writePose(def: SkeletonDef, rootX: number, rootZ: number, rootYaw: number, out: Pose) {
    const a = this.sim.alpha;
    const { C } = this.map;
    const W = this.W;
    for (let i = 0; i < SEGS.length; i++) {
      const b = this.segs[i].body;
      _q.set(b.frameRot.x, b.frameRot.y, b.frameRot.z, b.frameRot.w);
      _q2.set(b.rot.x, b.rot.y, b.rot.z, b.rot.w);
      if (_q.dot(_q2) < 0) _q2.set(-_q2.x, -_q2.y, -_q2.z, -_q2.w);
      _q.slerp(_q2, a);
      W[SEGS[i].bone].copy(_q).multiply(C[SEGS[i].bone]);
    }
    // clavicles shrug with raised arms; toes follow the feet
    for (const [clav, uarm, side] of [[B.clavL, B.uarmL, 1], [B.clavR, B.uarmR, -1]] as const) {
      _v.copy(def.restDir[uarm]).applyQuaternion(W[uarm]);
      _v2.set(0, -1, 0).applyQuaternion(W[B.chest]);
      const elev = Math.acos(clamp(_v.dot(_v2), -1, 1));
      this.shrugQ.setFromAxisAngle(Z, side * clamp((elev - 1.5) * 0.3, 0, 0.32));
      W[clav].copy(W[B.chest]).multiply(this.shrugQ);
    }
    W[B.toeL].copy(W[B.footL]);
    W[B.toeR].copy(W[B.footR]);
    _qi.setFromAxisAngle(Y, -rootYaw);
    out.q[B.root].identity();
    out.q[B.hips].copy(_qi).multiply(W[B.hips]);
    for (let i = 2; i < BONE_COUNT; i++) out.q[i].copy(W[PARENT[i]]).invert().multiply(W[i]);
    // hips position from the interpolated pelvis body
    const pb = this.segs[0].body;
    _v.set(pb.framePos.x + (pb.pos.x - pb.framePos.x) * a, pb.framePos.y + (pb.pos.y - pb.framePos.y) * a, pb.framePos.z + (pb.pos.z - pb.framePos.z) * a);
    _v.add(_v2.copy(this.hipsOff).applyQuaternion(W[B.hips]));
    const [x, z] = rotY(_v.x - rootX, _v.z - rootZ, -rootYaw);
    out.hips.set(x, _v.y, z);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const [a, b] of this.grace) {
      a.ignore?.delete(b);
      b.ignore?.delete(a);
    }
    this.grace.length = 0;
    const w = this.sim.world as unknown as { removeConstraint(c: unknown): void };
    this.rd.removeFromWorld();
    const fs = (this.ctl as unknown as { footSpring: Record<string, unknown> }).footSpring;
    for (const k of ['L', 'R']) if (fs?.[k]) w.removeConstraint(fs[k]);
    this.sim.unregister(this);
  }
}

function aabbOverlap(a: Body, b: Body) {
  return !(
    a.aabbMin.x > b.aabbMax.x || a.aabbMax.x < b.aabbMin.x ||
    a.aabbMin.y > b.aabbMax.y || a.aabbMax.y < b.aabbMin.y ||
    a.aabbMin.z > b.aabbMax.z || a.aabbMax.z < b.aabbMin.z
  );
}

function distToSegmentSq(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz || 1;
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2, 0, 1);
  const dx = a.x + abx * t - p.x, dy = a.y + aby * t - p.y, dz = a.z + abz * t - p.z;
  return dx * dx + dy * dy + dz * dz;
}
