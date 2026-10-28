// Copy-pasteable helpers verified by physics-events-helpers.probe.ts (see docs/api-notes/physics-events-queries.md).
import {
  Vector3,
  Quaternion,
  Matrix,
  Observable,
  PhysicsRaycastResult,
  ShapeCastResult,
  PhysicsEventType,
  PhysicsMotionType,
  type Scene,
  type HavokPlugin,
  type PhysicsEngineV2,
  type PhysicsBody,
  type PhysicsShape,
  type IPhysicsCollisionEvent,
  type IBasePhysicsCollisionEvent,
  type IRaycastQuery,
  type Observer,
} from "@babylonjs/core";

// ---------------------------------------------------------------------------------------------
// 1. Impact aggregation: Havok reports ONE EVENT PER CONTACT POINT per step (a flat box = 4 events),
//    the main impulse may arrive on STARTED *or* on the following CONTINUED step (speculative contacts),
//    resting contacts keep reporting ~m*g*dt per step while awake, and point/normal Vector3s are reused.
//    This aggregates per body pair per physics step and emits impacts above a resting baseline.
// ---------------------------------------------------------------------------------------------
export interface ImpactEvent {
  bodyA: PhysicsBody; indexA: number; // pair order is arbitrary (first-seen collider): check both bodies
  bodyB: PhysicsBody; indexB: number;
  impulse: number; // total normal impulse of this pair in this step (N*s), sum over contact points
  excess: number; // impulse above the pair's resting baseline (what you should feed into damage)
  point: Vector3; // impulse-weighted average contact point (world, on bodyA's surface), owned by the event
  normal: Vector3; // unit, points from bodyA toward bodyB (world)
  contacts: number; // number of contact points aggregated
  isNew: boolean; // first emission for this pair after `newImpactCooldownSteps` quiet steps (use for sounds)
  step: number;
}

interface PairAcc {
  a: PhysicsBody; ia: number; b: PhysicsBody; ib: number; lo: number; hi: number;
  imp: number; wsum: number; px: number; py: number; pz: number; nx: number; ny: number; nz: number; n: number;
  baseline: number; started: boolean; lastSeenStep: number; lastEmitStep: number;
}

export interface ImpactTrackerOptions {
  /** Minimum excess impulse (N*s) to emit. Default 0.5 */
  minExcessImpulse?: number;
  /** Minimum excess / (lightest DYNAMIC mass of the pair) in m/s. Filters resting/spawn load (~g*dt = 0.16). Default 0.5 */
  minDeltaV?: number;
  /** Baseline EMA factor per step (0..1). Default 0.25 */
  baselineAlpha?: number;
  /** Steps without emission before an impact counts as "new". Default 6 (~100 ms) */
  newImpactCooldownSteps?: number;
  /** Drop pair state after this many steps without events (bodies asleep keep no events!). Default 600 */
  forgetAfterSteps?: number;
}

export class ImpactTracker {
  readonly onImpact = new Observable<ImpactEvent>();
  // pairs keyed lo -> hi with numeric keys (transformNode.uniqueId * 4096 + instanceIndex), no string allocation
  private pairs = new Map<number, Map<number, PairAcc>>();
  private touched: PairAcc[] = [];
  private finished: PairAcc[] = [];
  private stepNo = 0;
  private collObs: Observer<IPhysicsCollisionEvent>;
  private endObs: Observer<IBasePhysicsCollisionEvent>;
  private afterObs: Observer<Scene>;
  private opts: Required<ImpactTrackerOptions>;
  private muted = new WeakMap<PhysicsBody, number>(); // body -> step until which its impacts are ignored
  // events of one pair arrive consecutively (one per contact point): cache the last lookup
  private lastC: PhysicsBody | null = null; private lastCI = -1; private lastO: PhysicsBody | null = null; private lastOI = -1;
  private lastPair: PairAcc | null = null;

  constructor(scene: Scene, plugin: HavokPlugin, opts: ImpactTrackerOptions = {}) {
    this.opts = { minExcessImpulse: 0.5, minDeltaV: 0.5, baselineAlpha: 0.25, newImpactCooldownSteps: 6, forgetAfterSteps: 600, ...opts };
    this.collObs = plugin.onCollisionObservable.add((e) => this.accumulate(e));
    // FINISHED is reported per contact point / manifold (mesh floors churn manifolds while still touching), so a
    // pair is only forgotten if it reported no contact event in the same step.
    this.endObs = plugin.onCollisionEndedObservable.add((e) => {
      if (e.type !== PhysicsEventType.COLLISION_FINISHED) return;
      const p = this.find(e.collider, e.colliderIndex, e.collidedAgainst, e.collidedAgainstIndex, false);
      if (p) this.finished.push(p);
    });
    this.afterObs = scene.onAfterPhysicsObservable.add(() => this.flush());
  }

  /** Ignore impacts involving `body` for `steps` physics steps (e.g. freshly spawned fragments touching neighbours). */
  mute(body: PhysicsBody, steps = 8) {
    this.muted.set(body, this.stepNo + steps);
  }

  private isMuted(b: PhysicsBody) {
    const until = this.muted.get(b);
    return until !== undefined && this.stepNo < until;
  }

  /** Mass used for the delta-v test: Infinity for STATIC / ANIMATED bodies. */
  private massOf(b: PhysicsBody, index: number): number {
    if (b.getMotionType(index) !== PhysicsMotionType.DYNAMIC) return Infinity;
    return b.getMassProperties(index).mass ?? 1;
  }

  private find(a: PhysicsBody, ia: number, b: PhysicsBody, ib: number, create: boolean): PairAcc | null {
    const ka = a.transformNode.uniqueId * 4096 + ia, kb = b.transformNode.uniqueId * 4096 + ib;
    const lo = ka < kb ? ka : kb, hi = ka < kb ? kb : ka; // canonical: (A,B) and (B,A) share one accumulator
    let m = this.pairs.get(lo);
    if (!m) {
      if (!create) return null;
      m = new Map();
      this.pairs.set(lo, m);
    }
    let p = m.get(hi);
    if (!p && create) {
      p = { a, ia, b, ib, lo, hi, imp: 0, wsum: 0, px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0, n: 0, baseline: 0, started: false, lastSeenStep: -1, lastEmitStep: -1e9 };
      m.set(hi, p);
    }
    return p ?? null;
  }

  private remove(p: PairAcc) {
    const m = this.pairs.get(p.lo);
    if (m) { m.delete(p.hi); if (m.size === 0) this.pairs.delete(p.lo); }
    if (this.lastPair === p) this.lastPair = null;
  }

  private accumulate(e: IPhysicsCollisionEvent) {
    if (e.type === PhysicsEventType.COLLISION_FINISHED) return; // (never delivered here, defensive)
    let p: PairAcc;
    if (this.lastPair && e.collider === this.lastC && e.colliderIndex === this.lastCI && e.collidedAgainst === this.lastO && e.collidedAgainstIndex === this.lastOI) {
      p = this.lastPair;
    } else {
      p = this.find(e.collider, e.colliderIndex, e.collidedAgainst, e.collidedAgainstIndex, true)!;
      this.lastPair = p; this.lastC = e.collider; this.lastCI = e.colliderIndex; this.lastO = e.collidedAgainst; this.lastOI = e.collidedAgainstIndex;
    }
    if (p.lastSeenStep !== this.stepNo) {
      p.imp = p.wsum = p.px = p.py = p.pz = p.nx = p.ny = p.nz = 0; p.n = 0; p.started = false;
      p.lastSeenStep = this.stepNo;
      this.touched.push(p);
    }
    // STARTED = new manifold -> resting baseline restarts at 0. CONTINUED after a gap (island woke up) keeps it.
    if (e.type === PhysicsEventType.COLLISION_STARTED) p.started = true;
    const w = e.impulse > 1e-6 ? e.impulse : 1e-6;
    const pt = e.point!, nrm = e.normal!; // reused objects: read the numbers now, never keep the refs
    const s = p.a === e.collider && p.ia === e.colliderIndex ? w : -w; // normal points collider -> collidedAgainst
    p.imp += e.impulse;
    p.wsum += w;
    p.px += pt.x * w; p.py += pt.y * w; p.pz += pt.z * w;
    p.nx += nrm.x * s; p.ny += nrm.y * s; p.nz += nrm.z * s;
    p.n++;
  }

  private flush() {
    const o = this.opts;
    for (const p of this.touched) {
      if (p.a.isDisposed || p.b.isDisposed) continue; // an earlier onImpact handler may have disposed it
      if (p.started) p.baseline = 0;
      const excess = p.imp - p.baseline;
      if (excess >= o.minExcessImpulse && !this.isMuted(p.a) && !this.isMuted(p.b) && excess / Math.min(this.massOf(p.a, p.ia), this.massOf(p.b, p.ib)) >= o.minDeltaV) {
        const wt = p.wsum;
        const normal = new Vector3(p.nx, p.ny, p.nz);
        const len = normal.length();
        if (len > 1e-9) normal.scaleInPlace(1 / len);
        this.onImpact.notifyObservers({
          bodyA: p.a, indexA: p.ia, bodyB: p.b, indexB: p.ib,
          impulse: p.imp, excess, contacts: p.n, step: this.stepNo,
          point: new Vector3(p.px / wt, p.py / wt, p.pz / wt), normal,
          isNew: this.stepNo - p.lastEmitStep > o.newImpactCooldownSteps,
        });
        p.lastEmitStep = this.stepNo;
      }
      // EMA baseline tracks sustained (resting / pushing) load; impacts rise far above it
      p.baseline += (p.imp - p.baseline) * o.baselineAlpha;
    }
    this.touched.length = 0;
    for (const p of this.finished) if (p.lastSeenStep !== this.stepNo) this.remove(p);
    this.finished.length = 0;
    if (this.stepNo % 60 === 0) {
      for (const m of this.pairs.values())
        for (const p of m.values())
          if (p.a.isDisposed || p.b.isDisposed || this.stepNo - p.lastSeenStep > o.forgetAfterSteps) this.remove(p);
    }
    this.lastPair = null; // never carry the consecutive-event cache across steps
    this.stepNo++;
  }

  dispose() {
    this.collObs.remove();
    this.endObs.remove();
    this.afterObs.remove();
    this.onImpact.clear();
    this.pairs.clear();
    this.finished.length = 0;
    this.lastPair = null;
  }
}

// ---------------------------------------------------------------------------------------------
// 2. Raycast returning plain data (cloned), with optional child-shape index for compound bodies.
// ---------------------------------------------------------------------------------------------
export interface RayHit {
  body: PhysicsBody;
  bodyIndex: number; // thin-instance index (0 for normal bodies)
  shape: PhysicsShape | undefined; // leaf shape: set for MESH shapes and for containers with >= 2 children, else undefined
  point: Vector3;
  normal: Vector3;
  distance: number; // world units from `from`
  triangleIndex: number; // MESH shapes only, else -1
}
const _rayRes = new PhysicsRaycastResult();
export function raycastPhysics(pe: PhysicsEngineV2, from: Vector3, to: Vector3, query?: IRaycastQuery): RayHit | null {
  pe.raycastToRef(from, to, _rayRes, query);
  if (!_rayRes.hasHit || !_rayRes.body) return null;
  return {
    body: _rayRes.body,
    bodyIndex: _rayRes.bodyIndex ?? 0,
    shape: _rayRes.shape,
    point: _rayRes.hitPointWorld.clone(),
    normal: _rayRes.hitNormalWorld.clone(),
    distance: _rayRes.hitDistance,
    triangleIndex: _rayRes.triangleIndex,
  };
}

// ---------------------------------------------------------------------------------------------
// 3. Sphere sweep A -> B (tool swing hit detection). Returns first hit (fraction 0 = already overlapping at A).
// ---------------------------------------------------------------------------------------------
export interface SweepHit {
  body: PhysicsBody;
  bodyIndex: number;
  shape: PhysicsShape | undefined; // child shape for containers with >= 2 children, else undefined
  point: Vector3; // world contact point on the hit body
  normal: Vector3; // world surface normal of the hit body (points back toward the sweep)
  fraction: number; // 0..1 along A->B
  centre: Vector3; // sphere centre at time of impact = A + (B-A)*fraction
}
const _inRes = new ShapeCastResult();
const _hitRes = new ShapeCastResult();
export function sphereSweep(
  plugin: HavokPlugin,
  sphere: PhysicsShape, // e.g. new PhysicsShapeSphere(Vector3.Zero(), r, scene); its filter masks act as the query filter
  a: Vector3,
  b: Vector3,
  ignoreBody?: PhysicsBody,
): SweepHit | null {
  plugin.shapeCast({ shape: sphere, rotation: Quaternion.Identity(), startPosition: a, endPosition: b, shouldHitTriggers: false, ignoreBody }, _inRes, _hitRes);
  if (!_hitRes.hasHit || !_hitRes.body) return null;
  return {
    body: _hitRes.body,
    bodyIndex: _hitRes.bodyIndex ?? 0,
    shape: _hitRes.shape,
    point: _hitRes.hitPoint.clone(),
    normal: _hitRes.hitNormal.clone(),
    fraction: _hitRes.hitFraction,
    centre: Vector3.Lerp(a, b, _hitRes.hitFraction),
  };
}

// ---------------------------------------------------------------------------------------------
// 4. Child of a compound body nearest to a world point (collision events never carry the child index).
//    children: body-local AABBs of the children (centre = translation passed to container.addChild,
//    half = half extents; for rotated children use their local AABB).
// ---------------------------------------------------------------------------------------------
const _invM = new Matrix();
const _lp = new Vector3();
export function nearestChildIndex(body: PhysicsBody, worldPoint: Vector3, children: { centre: Vector3; half: Vector3 }[]): number {
  // computeWorldMatrix(true): inside physics callbacks the cached world matrix is stale (last render / last compute)
  body.transformNode.computeWorldMatrix(true).invertToRef(_invM);
  Vector3.TransformCoordinatesToRef(worldPoint, _invM, _lp);
  let best = -1, bestD = Infinity, bestC = Infinity;
  for (let i = 0; i < children.length; i++) {
    const { centre: c, half: h } = children[i];
    const dx = Math.max(Math.abs(_lp.x - c.x) - h.x, 0), dy = Math.max(Math.abs(_lp.y - c.y) - h.y, 0), dz = Math.max(Math.abs(_lp.z - c.z) - h.z, 0);
    const d = dx * dx + dy * dy + dz * dz; // 0 when the point is on/inside the child's box
    const dc = Vector3.DistanceSquared(_lp, c); // tie-break: closest centre
    if (d < bestD - 1e-8 || (Math.abs(d - bestD) <= 1e-8 && dc < bestC)) { bestD = d; bestC = dc; best = i; }
  }
  return best;
}
