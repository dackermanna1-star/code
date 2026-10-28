// Physics system: Havok (Babylon Physics V2) wrapped for a fixed-step destruction sandbox.
//
// Design (every point below was measured — see tests/probes/physics-sys-*.probe.ts and docs/api-notes/):
//  * FIXED STEP, OWN LOOP. scene.physicsEnabled is forced off, so scene.render() never advances physics.
//    step(dt) runs `substeps` raw HP_World_Step(dt/substeps) calls itself (Babylon's prestep is replicated so
//    TELEPORT/ACTION bodies such as the character controller still work), then syncs bodies once, then
//    aggregates collision events into impacts and dispatches them. scene.onBefore/AfterPhysicsObservable fire
//    once per fixed step. applyForce(F) == F·dt per fixed step (plugin time step = dt).
//  * ADAPTIVE SUBSTEPS: thin hull fragments (≤ ~1 cm thick) spinning at 30 m/s tunnel through a 5 cm static slab
//    in up to 4/10 trials at 1 substep and never at 2; 60 m/s needs 4 — failures start at ~30 m/s per substep.
//    A fixed 2 substeps doubles the cost of every active step (1000-hull pile: 35–42 ms vs 8–27 ms), so each
//    step uses `substeps` (minimum, default 1) and adds substeps while THIN dynamic bodies move fast:
//    n = ceil(v_eff / fastThinSpeed (15 m/s)), up to maxSubsteps (4). Thinness = smallest dimension of the
//    equivalent box of the body's per-unit-mass principal inertia (s_k = √(6(I_i + I_j − I_k)), free from Havok);
//    speed = body-buffer displacement of the last step (+ corner speed ω·r), and freshly shaped/kicked thin
//    bodies get their velocity read once (expectFast() does the same for strikes).
//  * SMALL BOXES ARE HULLS: Havok BOX shapes with all extents ≤ ~3 cm, or two small extents (2×2×30 cm sticks),
//    fall through static floors when rotated, even at 1 m/s. 8-point hulls of the same geometry never do, so
//    boxShape() emits a hull below a size threshold.
//  * EVENTS: every body made by createBody() gets event mask STARTED|CONTINUED|FINISHED (does not wake
//    startAsleep bodies). Events are read straight from the Havok event list (no per-event allocation); when
//    something else listens to Babylon's collision observables the Babylon notifier is used instead so those
//    listeners keep working. Raw contact-point events → ImpactAggregator (impacts.ts) → RawImpact per pair.
//  * SYNC: unparented nodes are synced from the world body buffer (allocation-free, ~0.1 µs/body, change
//    detection so sleeping bodies cost almost nothing and their world matrices stay clean); parented/foreign
//    bodies use Babylon's sync. World matrices of moved nodes are refreshed so fixed-step code never sees stale
//    matrices.
//  * SLEEP ASSIST: large touching piles never deactivate in Havok (1000 hulls: 15–18 ms/step forever, far more with
//    collision events). Dynamic bodies that stay slow (0.1 m/s, 0.5 rad/s) for 1.5 s are put to sleep; they still
//    wake on contact (the 1000-hull pile is asleep after ~6–9 s and costs < 0.1 ms/step).
//  * FILTERS: a filter change on a body's root leaf shape is ignored by Havok until the body's shape is re-set
//    (HP_Body_SetShape(0) then the shape); setLayer() does that for every body using the shape and restores
//    the sleep state.
//
// OWNERSHIP: the physics system owns containers created by containerShape() once they are assigned to a body:
// setShape() disposes the previous owned container and disposeBody() disposes the body's owned container.
// Leaf shapes (hull/box/sphere, i.e. container children) are always owned by the caller: dispose them when no
// body/container uses them any more (disposeShape(shape) or disposeShape(container, true) for everything).
// Physics nodes must stay unparented with unit scaling; move static bodies with teleport().

import {
  Quaternion,
  Vector3,
  PhysicsBody,
  PhysicsShape,
  PhysicsShapeBox,
  PhysicsShapeSphere,
  PhysicsShapeContainer,
  PhysicsShapeType,
  PhysicsMotionType,
  PhysicsConstraint,
  PhysicsConstraintType,
  PhysicsConstraintAxis,
  PhysicsConstraintAxisLimitMode,
  PhysicsConstraintMotorType,
  PhysicsActivationControl,
  PhysicsMaterialCombineMode,
  PhysicsEventType,
  PhysicsRaycastResult,
  ShapeCastResult,
  HavokPlugin,
  TransformNode,
  type Scene,
  type Node,
  type Observer,
  type Observable,
  type PhysicsEngineV2,
  type IPhysicsCollisionEvent,
  type IBasePhysicsCollisionEvent,
  type IRaycastQuery,
} from "@babylonjs/core";
import HavokPhysics, { type HavokPhysicsWithBindings } from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { Layer } from "../core/context.ts";
import type { HingeOpts, LayerBits, PhysicsStats, PhysicsSystem, RawImpact, RayHit, ShapeOpts, SliderOpts, SweepHit } from "../core/context.ts";
import type { Quat, Vec3 } from "../geom/vec.ts";
import { ImpactAggregator, EV_CONTINUED, EV_FINISHED, EV_STARTED, type ImpactConfig, type ImpactOut, type ImpactSide } from "./impacts.ts";
import { ALL_LAYERS, defaultCollideMask } from "./layers.ts";

export { ALL_LAYERS, defaultCollideMask, layerName, layersCollide } from "./layers.ts";
export { DEFAULT_IMPACT_CONFIG, type ImpactConfig } from "./impacts.ts";

export type Motion = "static" | "dynamic" | "animated";

export interface SleepAssistConfig {
  enabled: boolean;
  /** A dynamic body slower than these for `seconds` is put to sleep (m/s, rad/s, s). */
  linear: number;
  angular: number;
  seconds: number;
}

export interface PhysicsOptions {
  /** Minimum Havok world steps per fixed step (1–8). Default 1; adaptive substepping adds more when needed. */
  substeps?: number;
  /** Add substeps while thin dynamic bodies move fast (see header). Default true. */
  adaptiveSubsteps?: boolean;
  /** Upper bound for adaptive substeps. Default 4. */
  maxSubsteps?: number;
  /** Effective speed (m/s) a thin body may move per substep. Default 15 (tunnelling starts ≈ 30). */
  fastThinSpeed?: number;
  /** Bodies whose smallest equivalent dimension is below this (m) count as thin. Default 0.02. */
  thinWidth?: number;
  /** Gravity along Y (m/s²). Default −9.81. */
  gravity?: number;
  /** Impact aggregation tuning (minImpulse, minDeltaV, spikeFactor, …). */
  impacts?: Partial<ImpactConfig>;
  /** World speed limits. Defaults 80 m/s and 60 rad/s (nothing in an apartment is faster; tames spinning shards). */
  maxLinearVelocity?: number;
  maxAngularVelocity?: number;
  /** Force-sleep slow dynamic bodies (large piles never sleep otherwise). Default enabled (0.1 m/s, 0.5 rad/s, 1.5 s). */
  sleepAssist?: boolean | Partial<SleepAssistConfig>;
  /** Dynamic bodies lighter than this get this mass (kg); keeps solver mass ratios sane. Default 0.005. */
  minDynamicMass?: number;
  /** Refresh world matrices of moved nodes right after each step. Default true. */
  syncWorldMatrices?: boolean;
  /** Read collision events straight from Havok memory when nobody else listens. Default true. */
  rawEvents?: boolean;
  /** Max hits returned by raycastAll(). Default 32. */
  maxRayHits?: number;
}

/** What onImpact delivers: the RawImpact contract plus aggregation details. */
export interface PhysicsImpact extends RawImpact {
  /** Largest single-step pair impulse in the merged episode (N·s). */
  peak: number;
  /** Fixed steps merged into this impact. */
  steps: number;
  /** Contact points in the peak step. */
  contacts: number;
}

export interface PhysicsDebugStats extends PhysicsStats {
  ownBodies: number;
  fastSynced: number;
  movedLastStep: number;
  contactPairs: number;
  eventsLastStep: number;
  impactsLastStep: number;
  forcedSleeps: number;
  minSubsteps: number;
  /** Substeps actually used by the last step (adaptive). */
  substepsLast: number;
  /** Fastest thin dynamic body seen in the last step (m/s, incl. corner speed). */
  thinSpeedLast: number;
  stepIndex: number;
  /** Last step breakdown (ms). */
  havokMs: number;
  eventsMs: number;
  syncMs: number;
  impactsMs: number;
}

// ---------------------------------------------------------------------------------------------- internals
const EVENT_MASK = EV_STARTED | EV_CONTINUED | EV_FINISHED;
const STATIC = PhysicsMotionType.STATIC;
const ANIMATED = PhysicsMotionType.ANIMATED;
const DYNAMIC = PhysicsMotionType.DYNAMIC;
const DEFAULT_FRICTION = 0.5;
const DEFAULT_RESTITUTION = 0;
/** μs ≈ 1.2 μk (real dry contacts have stiction; also keeps resting stacks from creeping). */
const STATIC_FRICTION_RATIO = 1.2;
/** Hinge-angle sign so hingeAngle() matches Havok's ANGULAR_X limits/motor (verified by physics-sys-joints probe). */
const HINGE_SIGN = 1;
/** Null handle (shape / body) for HP_Body_SetShape and constraint detaching. */
const NULL_ID: [bigint] = [BigInt(0)];
const IDENTITY_Q = Quaternion.Identity();

type HP_Id = [bigint];

/** The private parts of HavokPlugin this system relies on (all verified against Babylon 9.30.0). */
interface PluginInternals {
  world: HP_Id;
  _bodies: Map<bigint, { body: PhysicsBody; index: number }>;
  _shapes: Map<bigint, PhysicsShape>;
  _bodyCollisionObservable: Map<bigint, Observable<IPhysicsCollisionEvent>>;
  _bodyCollisionEndedObservable: Map<bigint, Observable<IBasePhysicsCollisionEvent>>;
  _constraintToBodyIdPair?: Map<bigint, unknown>;
  _worldRegions?: unknown[];
  _notifyCollisions(world?: HP_Id): void;
  _notifyTriggers(world?: HP_Id): void;
  _releasePendingWorldRegions?: () => void;
  onCollisionObservable: Observable<IPhysicsCollisionEvent>;
  onCollisionEndedObservable: Observable<IBasePhysicsCollisionEvent>;
}

class BodyRec implements ImpactSide {
  readonly body: PhysicsBody;
  readonly serial: number;
  readonly foreign: boolean;
  /** Havok body handle and its low 32 bits (what raw events carry). */
  hpId: HP_Id;
  id: number;
  mass = Infinity;
  muteUntil = 0;
  disposed = false;
  motion: PhysicsMotionType = STATIC;
  shape: PhysicsShape | null = null;
  fastSlot = -1;
  /** Byte offset of the transform inside the world body buffer. */
  offset = 0;
  joints: Set<JointRec> | null = null;
  keepAwake = false;
  heldAwake = false;
  /** We overrode mass (min-mass clamp) / inertia (degenerate shape): undone on the next setShape. */
  massClamped = false;
  inertiaFixed = false;
  slow = 0;
  moved = false;
  awakePoll = false;
  /** Smallest equivalent-box dimension < thinWidth (tunnelling-prone when fast). */
  thin = false;
  /** Half diagonal of the equivalent box (m): corner speed = ω·radius. */
  radius = 0;
  /** Step index until which the body's velocity is polled before stepping (fresh / expectFast). */
  watchUntil = -1;
  disposeObserver: Observer<Node> | null = null;

  constructor(body: PhysicsBody, serial: number, foreign: boolean) {
    this.body = body;
    this.serial = serial;
    this.foreign = foreign;
    this.hpId = body._pluginData.hpBodyId;
    this.id = Number(BigInt.asIntN(32, this.hpId[0]));
  }
}

interface ShapeInfo {
  kind: "hull" | "box" | "sphere" | "container" | "other";
  /** Created by containerShape(): disposed by the physics system when its last body releases it. */
  owned: boolean;
  /** Container children in Havok order. */
  children: PhysicsShape[] | null;
  childIndex: Map<PhysicsShape, number> | null;
  /** Containers (created here) holding this shape. */
  parents: Set<PhysicsShape> | null;
  /** Bodies whose root shape this is. */
  users: Set<BodyRec> | null;
}

interface JointRec {
  c: PhysicsConstraint;
  kind: "hinge" | "slider" | "ball";
  a: BodyRec;
  b: BodyRec;
  pivotA: Vector3;
  pivotB: Vector3;
  axisA: Vector3;
  axisB: Vector3;
  perpA: Vector3;
  perpB: Vector3;
}

const newInfo = (kind: ShapeInfo["kind"], owned = false): ShapeInfo => ({ kind, owned, children: null, childIndex: null, parents: null, users: null });
const now = (): number => performance.now();
const toMotion = (m: Motion): PhysicsMotionType => (m === "static" ? STATIC : m === "dynamic" ? DYNAMIC : ANIMATED);
const finite3 = (v: Vec3): boolean => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/** Create the physics system: fresh Havok WASM instance (deterministic per world), plugin, engine. */
export async function createPhysics(scene: Scene, opts: PhysicsOptions = {}): Promise<Physics> {
  const hk = (await HavokPhysics({ locateFile: () => havokWasmUrl })) as HavokPhysicsWithBindings;
  return new Physics(scene, hk, opts);
}

export class Physics implements PhysicsSystem {
  readonly scene: Scene;
  /** Raw Havok module (HP_* functions) for advanced use (character controller, custom queries). */
  readonly hk: HavokPhysicsWithBindings;
  readonly plugin: HavokPlugin;
  readonly engine: PhysicsEngineV2;
  /** Static, shape-less body at the origin with identity transform: anchor for world-fixed joints. */
  readonly worldBody: PhysicsBody;
  /** Minimum Havok world steps per fixed step (adaptive substepping may add more). */
  minSubsteps: number;
  adaptiveSubsteps: boolean;
  maxSubsteps: number;
  fastThinSpeed: number;
  thinWidth: number;
  syncWorldMatrices: boolean;
  rawEvents: boolean;
  minDynamicMass: number;
  readonly sleepAssist: SleepAssistConfig;
  /** Impact aggregation parameters (mutable at runtime). */
  readonly impacts: ImpactConfig;

  private readonly P: PluginInternals;
  private readonly world: HP_Id;
  private readonly worldNum: number;
  private readonly agg: ImpactAggregator<BodyRec>;
  private readonly impactOut: ImpactOut<BodyRec>[] = [];
  private subscribers: Array<(e: RawImpact) => void> = [];
  private readonly recs = new WeakMap<PhysicsBody, BodyRec>();
  private readonly byId = new Map<number, BodyRec>();
  private readonly own = new Set<BodyRec>();
  private readonly shapes = new WeakMap<PhysicsShape, ShapeInfo>();
  private readonly joints = new Map<PhysicsConstraint, JointRec>();
  private readonly worldRec: BodyRec;
  private serials = 1;
  private _stepIndex = 0;
  private _disposed = false;
  private inNodeDispose = 0;
  // body-buffer sync
  private fast: BodyRec[] = [];
  private fastPrev = new Float32Array(12 * 256);
  private heapBuf: ArrayBufferLike | null = null;
  private f32: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private i32: Int32Array<ArrayBufferLike> = new Int32Array(0);
  private pollCursor = 0;
  /** Thin bodies whose velocity must be read before the next step (fresh fragments, expectFast). */
  private watch: BodyRec[] = [];
  private thinSpeed = 0;
  private substepsLast = 1;
  // hull scratch memory in the WASM heap
  private scratchPtr = 0;
  private scratchFloats = 0;
  // Babylon-notifier fallback (when other code listens to collision observables)
  private capture = false;
  private bjsObs: [Observer<IPhysicsCollisionEvent>, Observer<IBasePhysicsCollisionEvent>] | null = null;
  // queries
  private readonly rayResult = new PhysicsRaycastResult();
  private readonly rayQuery: IRaycastQuery = { membership: ALL_LAYERS, collideWith: ALL_LAYERS, shouldHitTriggers: false };
  private readonly castIn = new ShapeCastResult();
  private readonly castHit = new ShapeCastResult();
  private readonly sweepShapes = new Map<number, { shape: PhysicsShape; filter: number }>();
  // temporaries
  private readonly tv0 = new Vector3();
  private readonly tv1 = new Vector3();
  private readonly tv2 = new Vector3();
  private readonly tv3 = new Vector3();
  private readonly tq0 = new Quaternion();
  private readonly tq1 = new Quaternion();
  // stats
  private stepMsEma = 0;
  private movedLast = 0;
  private eventsLast = 0;
  private impactsLast = 0;
  private forcedSleeps = 0;
  private tHavok = 0;
  private tEvents = 0;
  private tSync = 0;
  private tImpacts = 0;
  private warnedRegions = false;
  private readonly sceneDisposeObs: Observer<Scene> | null;

  constructor(scene: Scene, hk: HavokPhysicsWithBindings, opts: PhysicsOptions = {}) {
    if (scene.getPhysicsEngine()) throw new Error("Physics: the scene already has a physics engine");
    if ((scene as unknown as { floatingOriginMode?: boolean }).floatingOriginMode) throw new Error("Physics: floating-origin mode is not supported");
    this.scene = scene;
    this.hk = hk;
    this.minSubsteps = clampInt(opts.substeps ?? 1, 1, 8);
    this.substepsLast = this.minSubsteps;
    this.adaptiveSubsteps = opts.adaptiveSubsteps ?? true;
    this.maxSubsteps = clampInt(opts.maxSubsteps ?? 4, 1, 8);
    this.fastThinSpeed = opts.fastThinSpeed && opts.fastThinSpeed > 0 ? opts.fastThinSpeed : 15;
    this.thinWidth = opts.thinWidth && opts.thinWidth > 0 ? opts.thinWidth : 0.02;
    this.syncWorldMatrices = opts.syncWorldMatrices ?? true;
    this.rawEvents = opts.rawEvents ?? true;
    this.minDynamicMass = opts.minDynamicMass ?? 0.005;
    const sa = typeof opts.sleepAssist === "object" ? opts.sleepAssist : {};
    this.sleepAssist = { enabled: opts.sleepAssist !== false && sa.enabled !== false, linear: sa.linear ?? 0.1, angular: sa.angular ?? 0.5, seconds: sa.seconds ?? 1.5 };
    this.agg = new ImpactAggregator<BodyRec>(opts.impacts);
    this.impacts = this.agg.cfg;

    this.plugin = new HavokPlugin(true, hk, { maxQueryCollectorHits: clampInt(opts.maxRayHits ?? 32, 2, 256) });
    if (!scene.enablePhysics(new Vector3(0, opts.gravity ?? -9.81, 0), this.plugin)) throw new Error("Physics: enablePhysics failed");
    this.engine = scene.getPhysicsEngine() as unknown as PhysicsEngineV2;
    scene.physicsEnabled = false; // scene.render() must never step physics by wall clock
    this.engine.setTimeStep(1 / 60);
    this.engine.setVelocityLimits(opts.maxLinearVelocity ?? 80, opts.maxAngularVelocity ?? 60);
    this.P = this.plugin as unknown as PluginInternals;
    this.world = this.P.world;
    // HP_World_GetNextCollisionEvent takes the world as a plain number (as Babylon's notifier does)
    this.worldNum = Number(this.world);

    // world anchor: static, no shape (verified to work as a constraint parent), never collides
    const wn = new TransformNode("physics:world", scene);
    wn.rotationQuaternion = Quaternion.Identity();
    wn.computeWorldMatrix(true);
    this.worldBody = new PhysicsBody(wn, STATIC, false, scene);
    this.worldRec = this.register(this.worldBody, false);
    this.worldRec.motion = STATIC;

    this.sceneDisposeObs = scene.onDisposeObservable.add(() => this.dispose());
  }

  // ================================================================================== stepping
  get stepIndex(): number {
    return this._stepIndex;
  }

  /**
   * Substeps used by the most recent step (per-substep quantities such as Havok's constraint impulses divide by
   * dt / substeps). Assigning sets the minimum (`minSubsteps`).
   */
  get substeps(): number {
    return this.substepsLast;
  }

  set substeps(n: number) {
    this.minSubsteps = clampInt(n, 1, 8);
  }

  get minImpulse(): number {
    return this.agg.cfg.minImpulse;
  }

  set minImpulse(v: number) {
    if (v >= 0) this.agg.cfg.minImpulse = v;
  }

  /**
   * Advance exactly one fixed step of dt seconds (split into 1..maxSubsteps Havok steps, see header), sync nodes,
   * then dispatch the step's impacts. dt ≤ 0, NaN or > 0.5 s is ignored.
   */
  step(dt: number): void {
    if (this._disposed || !(dt > 0) || dt > 0.5) return;
    const t0 = now();
    const scene = this.scene;
    const hk = this.hk;
    const P = this.P;
    scene.physicsEnabled = false;
    if (this.plugin.getTimeStep() !== dt) this.plugin.setTimeStep(dt); // applyForce(F) == F·dt per fixed step
    if (!this.warnedRegions && P._worldRegions && P._worldRegions.length > 1) {
      this.warnedRegions = true;
      console.warn("Physics: floating-origin world regions are not supported; only the default world is stepped");
    }
    scene.onBeforePhysicsObservable.notifyObservers(scene);
    const n = this.chooseSubsteps();
    this.substepsLast = n;
    const h = dt / n;
    const babylonEvents = !this.rawEvents || this.externalListeners();
    if (babylonEvents) this.ensureBjsObservers();
    this.agg.beginStep(this._stepIndex);
    let tHavok = 0;
    let tEvents = 0;
    let events = 0;
    for (let s = 0; s < n; s++) {
      this.prestep();
      const a = now();
      hk.HP_World_SetIdealStepTime(this.world, h);
      hk.HP_World_Step(this.world, h);
      const b = now();
      if (babylonEvents) {
        const before = this.agg.events;
        this.capture = true;
        try {
          P._notifyCollisions(this.world);
        } finally {
          this.capture = false;
        }
        events += this.agg.events - before;
      } else events += this.walkRawEvents();
      P._notifyTriggers(this.world);
      tHavok += b - a;
      tEvents += now() - b;
    }
    const t1 = now();
    this.syncForeign();
    this.fastSync(dt);
    P._releasePendingWorldRegions?.();
    const t2 = now();
    const count = this.agg.endStep(this.impactOut);
    this._stepIndex++;
    this.dispatch(count);
    scene.onAfterPhysicsObservable.notifyObservers(scene);
    const t3 = now();
    this.tHavok = tHavok;
    this.tEvents = tEvents;
    this.tSync = t2 - t1;
    this.tImpacts = t3 - t2;
    this.eventsLast = events;
    this.impactsLast = count;
    const ms = t3 - t0;
    this.stepMsEma = this.stepMsEma === 0 ? ms : this.stepMsEma + (ms - this.stepMsEma) * 0.1;
  }

  /** Subscribe to impacts (delivered after each step, never from inside Havok). Returns an unsubscribe function. */
  onImpact(cb: (e: RawImpact) => void): () => void {
    this.subscribers = [...this.subscribers, cb];
    return () => {
      this.subscribers = this.subscribers.filter((f) => f !== cb);
    };
  }

  /** Suppress impacts involving `body` for the next `steps` fixed steps (fresh fragments spawned in contact). */
  muteImpacts(body: PhysicsBody, steps: number): void {
    const rec = this.recs.get(body);
    if (rec) rec.muteUntil = Math.max(rec.muteUntil, this._stepIndex + Math.max(0, steps | 0));
  }

  /**
   * Note that `body` may have been given a large velocity outside the step (strike, kick): if it is thin, its
   * velocity is read before the next step so adaptive substepping can react immediately.
   */
  expectFast(body: PhysicsBody): void {
    const rec = this.recs.get(body);
    if (rec && !rec.disposed && rec.motion === DYNAMIC && rec.thin) this.watchRec(rec, 1);
  }

  private watchRec(rec: BodyRec, steps: number): void {
    if (rec.watchUntil < this._stepIndex) this.watch.push(rec);
    rec.watchUntil = Math.max(rec.watchUntil, this._stepIndex + steps);
  }

  /** Substeps for this step: minimum, plus enough that no thin body moves more than fastThinSpeed·dt per substep. */
  private chooseSubsteps(): number {
    const lo = clampInt(this.minSubsteps, 1, 8);
    if (!this.adaptiveSubsteps) {
      this.watch.length = 0;
      return lo;
    }
    let v = this.thinSpeed;
    if (this.watch.length > 0) {
      const hk = this.hk;
      let keep = 0;
      for (let i = 0; i < this.watch.length; i++) {
        const rec = this.watch[i];
        if (rec.disposed || rec.motion !== DYNAMIC || !rec.body._pluginData) {
          rec.watchUntil = -1;
          continue;
        }
        const lv = hk.HP_Body_GetLinearVelocity(rec.hpId)[1];
        const av = hk.HP_Body_GetAngularVelocity(rec.hpId)[1];
        const ve = Math.hypot(lv[0], lv[1], lv[2]) + Math.hypot(av[0], av[1], av[2]) * rec.radius;
        if (ve > v) v = ve;
        if (rec.watchUntil > this._stepIndex) this.watch[keep++] = rec;
        else rec.watchUntil = -1;
      }
      this.watch.length = keep;
    }
    const need = Number.isFinite(v) ? Math.ceil(v / this.fastThinSpeed) : this.maxSubsteps;
    return Math.min(Math.max(lo, need), Math.max(lo, clampInt(this.maxSubsteps, 1, 8)));
  }

  private dispatch(count: number): void {
    if (count === 0) return;
    const subs = this.subscribers;
    if (subs.length === 0) return;
    const out = this.impactOut;
    for (let i = 0; i < count; i++) {
      const o = out[i];
      // a handler may have disposed one of the bodies while we were dispatching earlier impacts
      if (o.a.disposed || o.b.disposed || o.a.body.isDisposed || o.b.body.isDisposed) continue;
      const ev: PhysicsImpact = {
        bodyA: o.a.body,
        bodyB: o.b.body,
        point: new Vector3(o.px, o.py, o.pz),
        normal: new Vector3(o.nx, o.ny, o.nz),
        impulse: o.impulse,
        started: o.started,
        peak: o.peak,
        steps: o.steps,
        contacts: o.contacts,
      };
      for (let k = 0; k < subs.length; k++) {
        try {
          subs[k](ev);
        } catch (e) {
          console.error("physics: onImpact handler failed", e);
        }
      }
    }
  }

  /** Babylon's prestep (TELEPORT/ACTION bodies, e.g. the character controller), as executeStep does it. */
  private prestep(): void {
    const bodies = this.engine.getBodies();
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (!b.disablePreStep) this.plugin.setPhysicsBodyTransformation(b, b.transformNode);
    }
  }

  /** Babylon sync for bodies we do not sync from the body buffer (parented / foreign). */
  private syncForeign(): void {
    const bodies = this.engine.getBodies();
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (!b.disableSync) this.plugin.sync(b);
    }
  }

  // ---------------------------------------------------------------------------------- collision events
  /** Allocation-free walk of this world step's Havok collision events (layout: Babylon's CollisionEvent). */
  private walkRawEvents(): number {
    const hk = this.hk;
    let addr = hk.HP_World_GetCollisionEvents(this.world)[1];
    if (!addr) return 0;
    this.views();
    const i32 = this.i32;
    const f32 = this.f32;
    const agg = this.agg;
    let count = 0;
    while (addr) {
      const w = addr >> 2;
      const ra = this.recFromId(i32[w + 2]);
      const rb = this.recFromId(i32[w + 18]);
      if (ra !== null && rb !== null) {
        const type = i32[w];
        if (type === EV_FINISHED) agg.add(ra, rb, EV_FINISHED, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        // contact A: position f32[w+10..12], normal f32[w+13..15] (A→B); contact B: position f32[w+26..28]; impulse f32[w+34]
        else agg.add(ra, rb, type === EV_STARTED ? EV_STARTED : EV_CONTINUED, f32[w + 10], f32[w + 11], f32[w + 12], f32[w + 26], f32[w + 27], f32[w + 28], f32[w + 13], f32[w + 14], f32[w + 15], f32[w + 34]);
      }
      count++;
      addr = hk.HP_World_GetNextCollisionEvent(this.worldNum, addr);
    }
    return count;
  }

  /** True when someone else observes Babylon's collision observables (then Babylon must dispatch events). */
  private externalListeners(): boolean {
    const P = this.P;
    if (this.liveObservers(P.onCollisionObservable) > 0 || this.liveObservers(P.onCollisionEndedObservable) > 0) return true;
    let any = false;
    // per-body maps: purge empty entries (Babylon never deletes the "ended" ones: they leak and Havok reuses ids)
    if (P._bodyCollisionObservable.size) {
      for (const [k, o] of P._bodyCollisionObservable) {
        if (o.hasObservers()) any = true;
        else P._bodyCollisionObservable.delete(k);
      }
    }
    if (P._bodyCollisionEndedObservable.size) {
      for (const [k, o] of P._bodyCollisionEndedObservable) {
        if (o.hasObservers()) any = true;
        else P._bodyCollisionEndedObservable.delete(k);
      }
    }
    return any;
  }

  private liveObservers<T>(o: Observable<T>): number {
    let n = 0;
    const mine = this.bjsObs;
    for (const obs of o.observers) {
      if ((obs as unknown as { _willBeUnregistered?: boolean })._willBeUnregistered) continue;
      if (mine !== null && (obs === (mine[0] as unknown) || obs === (mine[1] as unknown))) continue;
      n++;
    }
    return n;
  }

  private ensureBjsObservers(): void {
    if (this.bjsObs) return;
    const P = this.P;
    const o1 = P.onCollisionObservable.add((e) => {
      if (!this.capture) return;
      const ra = this.recOf(e.collider);
      const rb = this.recOf(e.collidedAgainst);
      const p = e.point;
      const nrm = e.normal;
      if (ra === null || rb === null || !p || !nrm) return;
      const d = Number.isFinite(e.distance) ? e.distance : 0; // contact B ≈ A + n·distance
      const type = e.type === PhysicsEventType.COLLISION_STARTED ? EV_STARTED : EV_CONTINUED;
      this.agg.add(ra, rb, type, p.x, p.y, p.z, p.x + nrm.x * d, p.y + nrm.y * d, p.z + nrm.z * d, nrm.x, nrm.y, nrm.z, e.impulse);
    })!;
    const o2 = P.onCollisionEndedObservable.add((e) => {
      if (!this.capture || e.type !== PhysicsEventType.COLLISION_FINISHED) return;
      const ra = this.recOf(e.collider);
      const rb = this.recOf(e.collidedAgainst);
      if (ra !== null && rb !== null) this.agg.add(ra, rb, EV_FINISHED, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    })!;
    this.bjsObs = [o1, o2];
  }

  // ---------------------------------------------------------------------------------- body-buffer sync
  private views(): void {
    const buf = this.hk.HEAPU8.buffer;
    if (buf !== this.heapBuf) {
      this.heapBuf = buf;
      this.f32 = new Float32Array(buf);
      this.i32 = new Int32Array(buf);
    }
  }

  private fastSync(dt: number): void {
    const list = this.fast;
    let moved = 0;
    if (list.length > 0) {
      this.views();
      const hk = this.hk;
      const f32 = this.f32;
      const base = hk.HP_World_GetBodyBuffer(this.world)[1] >> 2;
      const prev = this.fastPrev;
      const sa = this.sleepAssist;
      const assist = sa.enabled;
      const linLim2 = sa.linear * dt * (sa.linear * dt);
      const angLim2 = sa.angular * dt * (sa.angular * dt);
      const sleepSteps = Math.max(1, Math.round(sa.seconds / dt));
      const wm = this.syncWorldMatrices;
      const INACTIVE = hk.ActivationState.INACTIVE;
      const invDt = 1 / dt;
      let thinSpeed = 0;
      for (let i = 0; i < list.length; i++) {
        const rec = list[i];
        const body = rec.body;
        if (body._pluginData == null) {
          // disposed behind our back (body.dispose()): forget it; the swap moved another body into slot i
          this.forget(rec);
          i--;
          continue;
        }
        const node = body.transformNode;
        if (node.parent !== null) {
          // re-parented after creation: world values can't go into local position → Babylon's sync takes over
          this.removeFast(rec);
          body.disableSync = rec.motion === STATIC;
          i--;
          continue;
        }
        const o = base + (rec.offset >> 2);
        const p = i * 12;
        const r0 = f32[o], r1 = f32[o + 1], r2 = f32[o + 2];
        const r4 = f32[o + 4], r5 = f32[o + 5], r6 = f32[o + 6];
        const r8 = f32[o + 8], r9 = f32[o + 9], r10 = f32[o + 10];
        const tx = f32[o + 12], ty = f32[o + 13], tz = f32[o + 14];
        if (
          tx === prev[p + 9] && ty === prev[p + 10] && tz === prev[p + 11] &&
          r0 === prev[p] && r1 === prev[p + 1] && r2 === prev[p + 2] &&
          r4 === prev[p + 3] && r5 === prev[p + 4] && r6 === prev[p + 5] &&
          r8 === prev[p + 6] && r9 === prev[p + 7] && r10 === prev[p + 8]
        ) {
          rec.moved = false;
          rec.slow = 0;
          continue;
        }
        const assistable = assist && rec.motion === DYNAMIC && !rec.keepAwake && rec.joints === null;
        if (assistable || (rec.thin && rec.motion === DYNAMIC)) {
          // displacement this step; Frobenius product of consecutive rotations = 1 + 2cosθ → 3 − dot ≈ θ²
          const dx = tx - prev[p + 9], dy = ty - prev[p + 10], dz = tz - prev[p + 11];
          const dot = r0 * prev[p] + r1 * prev[p + 1] + r2 * prev[p + 2] + r4 * prev[p + 3] + r5 * prev[p + 4] + r6 * prev[p + 5] + r8 * prev[p + 6] + r9 * prev[p + 7] + r10 * prev[p + 8];
          const d2 = dx * dx + dy * dy + dz * dz;
          const a2 = 3 - dot;
          if (rec.thin) {
            const ve = (Math.sqrt(d2) + (a2 > 0 ? Math.sqrt(a2) : 0) * rec.radius) * invDt;
            if (ve > thinSpeed) thinSpeed = ve;
          }
          if (assistable) {
            if (d2 < linLim2 && a2 < angLim2) {
              if (++rec.slow >= sleepSteps) {
                hk.HP_Body_SetActivationState(rec.hpId, INACTIVE);
                rec.slow = 0;
                this.forcedSleeps++;
              }
            } else rec.slow = 0;
          }
        }
        prev[p] = r0;
        prev[p + 1] = r1;
        prev[p + 2] = r2;
        prev[p + 3] = r4;
        prev[p + 4] = r5;
        prev[p + 5] = r6;
        prev[p + 6] = r8;
        prev[p + 7] = r9;
        prev[p + 8] = r10;
        prev[p + 9] = tx;
        prev[p + 10] = ty;
        prev[p + 11] = tz;
        rec.moved = true;
        moved++;
        node.position.set(tx, ty, tz);
        // rotation matrix (Babylon layout: m11=r0 m12=r4 m13=r8 / m21=r1 m22=r5 m23=r9 / m31=r2 m32=r6 m33=r10) → quaternion
        let qx: number, qy: number, qz: number, qw: number;
        const tr = r0 + r5 + r10;
        if (tr > 0) {
          const s = 0.5 / Math.sqrt(tr + 1);
          qw = 0.25 / s;
          qx = (r6 - r9) * s;
          qy = (r8 - r2) * s;
          qz = (r1 - r4) * s;
        } else if (r0 > r5 && r0 > r10) {
          const s = 2 * Math.sqrt(1 + r0 - r5 - r10);
          qw = (r6 - r9) / s;
          qx = 0.25 * s;
          qy = (r4 + r1) / s;
          qz = (r8 + r2) / s;
        } else if (r5 > r10) {
          const s = 2 * Math.sqrt(1 + r5 - r0 - r10);
          qw = (r8 - r2) / s;
          qx = (r4 + r1) / s;
          qy = 0.25 * s;
          qz = (r9 + r6) / s;
        } else {
          const s = 2 * Math.sqrt(1 + r10 - r0 - r5);
          qw = (r1 - r4) / s;
          qx = (r8 + r2) / s;
          qy = (r9 + r6) / s;
          qz = 0.25 * s;
        }
        const q = node.rotationQuaternion!;
        // keep the sign continuous (q and −q are the same rotation; consumers may interpolate)
        if (q.x * qx + q.y * qy + q.z * qz + q.w * qw < 0) q.set(-qx, -qy, -qz, -qw);
        else q.set(qx, qy, qz, qw);
        if (wm) node.computeWorldMatrix(true);
      }
      this.thinSpeed = thinSpeed;
      // round-robin activation polling (stats only; isAwake() always asks Havok)
      const ACTIVE = hk.ActivationState.ACTIVE;
      const k = Math.min(list.length, 48);
      for (let j = 0; j < k; j++) {
        if (this.pollCursor >= list.length) this.pollCursor = 0;
        const rec = list[this.pollCursor++];
        rec.awakePoll = rec.motion !== STATIC && hk.HP_Body_GetActivationState(rec.hpId)[1] === ACTIVE;
      }
    }
    this.movedLast = moved;
    if (list.length === 0) this.thinSpeed = 0;
  }

  private addFast(rec: BodyRec): void {
    const hk = this.hk;
    rec.body.disableSync = true;
    rec.offset = hk.HP_Body_GetWorldTransformOffset(rec.hpId)[1];
    const slot = this.fast.length;
    this.fast.push(rec);
    rec.fastSlot = slot;
    if ((slot + 1) * 12 > this.fastPrev.length) {
      const grown = new Float32Array(this.fastPrev.length * 2);
      grown.set(this.fastPrev);
      this.fastPrev = grown;
    }
    // seed with the current Havok transform so the first sync doesn't count as movement
    this.views();
    const f32 = this.f32;
    const o = (hk.HP_World_GetBodyBuffer(this.world)[1] >> 2) + (rec.offset >> 2);
    const p = slot * 12;
    const prev = this.fastPrev;
    prev[p] = f32[o];
    prev[p + 1] = f32[o + 1];
    prev[p + 2] = f32[o + 2];
    prev[p + 3] = f32[o + 4];
    prev[p + 4] = f32[o + 5];
    prev[p + 5] = f32[o + 6];
    prev[p + 6] = f32[o + 8];
    prev[p + 7] = f32[o + 9];
    prev[p + 8] = f32[o + 10];
    prev[p + 9] = f32[o + 12];
    prev[p + 10] = f32[o + 13];
    prev[p + 11] = f32[o + 14];
  }

  private removeFast(rec: BodyRec): void {
    const slot = rec.fastSlot;
    if (slot < 0) return;
    const lastIdx = this.fast.length - 1;
    const last = this.fast[lastIdx];
    if (slot !== lastIdx) {
      this.fast[slot] = last;
      last.fastSlot = slot;
      this.fastPrev.copyWithin(slot * 12, lastIdx * 12, lastIdx * 12 + 12);
    }
    this.fast.pop();
    rec.fastSlot = -1;
    if (this.pollCursor > this.fast.length) this.pollCursor = 0;
  }

  // ================================================================================== bodies
  /**
   * Create a body on `node` (unparented TransformNode, unit scaling). Assign its shape with setShape().
   * startAsleep bodies stay asleep through their first setShape() (they hover until touched if in mid-air).
   */
  createBody(node: TransformNode, motion: Motion, startAsleep = false): PhysicsBody {
    this.alive();
    if (node.physicsBody && !node.physicsBody.isDisposed) throw new Error(`createBody: node '${node.name}' already has a physics body`);
    if (!node.rotationQuaternion) node.rotationQuaternion = Quaternion.FromEulerVector(node.rotation);
    node.computeWorldMatrix(true); // stale-matrix pitfall: the body is created at node.absolutePosition
    const mt = toMotion(motion);
    const body = new PhysicsBody(node, mt, mt !== STATIC && startAsleep, this.scene);
    const rec = this.register(body, false);
    rec.motion = mt;
    body.setEventMask(EVENT_MASK);
    // node.dispose() disposes the body (Babylon); run our cleanup first (joints must go before the body)
    rec.disposeObserver = node.onDisposeObservable.add(
      () => {
        this.inNodeDispose++;
        try {
          this.disposeBody(body);
        } finally {
          this.inNodeDispose--;
        }
      },
      undefined,
      true,
    );
    if (node.parent === null) this.addFast(rec);
    else body.disableSync = mt === STATIC;
    return body;
  }

  /** Dispose a body: removes its joints, its owned container, registry entries and Babylon/Havok objects. Leaf shapes stay (caller-owned). */
  disposeBody(body: PhysicsBody): void {
    const rec = this.recs.get(body);
    if (rec === undefined || rec.foreign) {
      if (rec) this.forget(rec);
      if (!body.isDisposed) {
        this.clearBodyObservables(body);
        body.dispose();
      }
      return;
    }
    if (rec.disposed) return;
    if (rec === this.worldRec && !this._disposed) throw new Error("disposeBody: the world body is owned by the physics system");
    if (rec.joints) for (const j of [...rec.joints]) this.removeConstraint(j.c);
    this.forget(rec);
    if (rec.disposeObserver) {
      // inside node disposal the node clears its own observable; elsewhere remove immediately (no setTimeout)
      if (this.inNodeDispose === 0) rec.disposeObserver.remove();
      rec.disposeObserver = null;
    }
    const shape = rec.shape;
    rec.shape = null;
    if (!body.isDisposed) {
      this.clearBodyObservables(body);
      body.dispose();
    }
    if (shape) this.releaseShapeUse(rec, shape);
  }

  /** Assign (or re-assign after an in-place container edit) a body's shape; recomputes mass/COM/inertia from leaf densities. */
  setShape(body: PhysicsBody, shape: PhysicsShape): void {
    const rec = this.req(body);
    if (!shape || shape._pluginData === undefined) throw new Error("setShape: shape is null or disposed");
    const prev = rec.shape;
    // our own mass/inertia overrides must not stick to the new shape (Babylon's overrides are sticky)
    if (rec.massClamped) {
      body._pluginData.userMassProps.mass = undefined;
      rec.massClamped = false;
    }
    if (rec.inertiaFixed) {
      body._pluginData.userMassProps.inertia = undefined;
      rec.inertiaFixed = false;
    }
    const info = this.shapes.get(shape);
    if (info?.children) this.syncChildren(shape, info);
    body.shape = shape; // HP_Body_SetShape + mass properties (Havok wakes bodies whose shape changes)
    if (prev !== shape) {
      if (prev) this.releaseShapeUse(rec, prev);
      const i = this.info(shape);
      (i.users ??= new Set()).add(rec);
      rec.shape = shape;
    }
    this.ensureMass(rec);
  }

  /** Change motion type at runtime. Going dynamic validates mass properties and wakes the body. */
  setMotion(body: PhysicsBody, motion: Motion): void {
    const rec = this.req(body);
    const mt = toMotion(motion);
    if (rec.motion !== mt) {
      body.setMotionType(mt);
      rec.motion = mt;
      rec.slow = 0;
    }
    // Babylon resets disableSync on every motion change; the body-buffer sync owns unparented nodes
    body.disableSync = rec.fastSlot >= 0 ? true : mt === STATIC;
    if (mt === DYNAMIC) {
      this.ensureMass(rec);
      this.wake(body);
    } else rec.mass = Infinity;
  }

  /** Current motion type of a body. */
  getMotion(body: PhysicsBody): Motion {
    const mt = this.recs.get(body)?.motion ?? body.getMotionType();
    return mt === STATIC ? "static" : mt === DYNAMIC ? "dynamic" : "animated";
  }

  wake(body: PhysicsBody): void {
    const id = body._pluginData?.hpBodyId;
    if (!id) return;
    const rec = this.recs.get(body);
    if ((rec ? rec.motion : body.getMotionType()) === STATIC) return;
    this.hk.HP_Body_SetActivationState(id, this.hk.ActivationState.ACTIVE);
    if (rec) rec.slow = 0;
  }

  /** Put a body to sleep now (it wakes on contact, impulses, velocity changes). */
  sleep(body: PhysicsBody): void {
    const id = body._pluginData?.hpBodyId;
    if (id) this.hk.HP_Body_SetActivationState(id, this.hk.ActivationState.INACTIVE);
  }

  isAwake(body: PhysicsBody): boolean {
    const id = body._pluginData?.hpBodyId;
    if (!id) return false;
    const rec = this.recs.get(body);
    if ((rec ? rec.motion : body.getMotionType()) === STATIC) return false;
    return this.hk.HP_Body_GetActivationState(id)[1] === this.hk.ActivationState.ACTIVE;
  }

  /** Keep a body permanently awake (held objects, slow scripted drags) or return it to simulation control. */
  setKeepAwake(body: PhysicsBody, on: boolean): void {
    const rec = this.recs.get(body);
    if (rec) {
      rec.keepAwake = on;
      if (!on) rec.heldAwake = false;
    }
    if (body._pluginData) this.plugin.setActivationControl(body, on ? PhysicsActivationControl.ALWAYS_ACTIVE : PhysicsActivationControl.SIMULATION_CONTROLLED);
  }

  /** Linear / angular damping (per-step factor 1/(1+c·dt)). */
  setDamping(body: PhysicsBody, linear: number, angular: number): void {
    if (Number.isFinite(linear) && linear >= 0) body.setLinearDamping(linear);
    if (Number.isFinite(angular) && angular >= 0) body.setAngularDamping(angular);
  }

  /** Mass (kg) of a dynamic body; Infinity for static/animated/unknown. */
  massOf(body: PhysicsBody): number {
    const rec = this.recs.get(body);
    if (!rec) return body.getMotionType() === DYNAMIC ? (body.getMassProperties().mass ?? Infinity) : Infinity;
    return rec.motion === DYNAMIC ? rec.mass : Infinity;
  }

  /** Re-read a body's mass after external setMassProperties() calls. */
  refreshMass(body: PhysicsBody): void {
    const rec = this.recs.get(body);
    if (rec) this.ensureMass(rec);
  }

  /** Move a body (any motion type) immediately; node and Havok agree afterwards. */
  teleport(body: PhysicsBody, pos: Vec3, rot?: Quat | null, resetVelocity = true): void {
    const id = body._pluginData?.hpBodyId;
    if (!id) return;
    if (!finite3(pos)) throw new Error("teleport: non-finite position");
    const node = body.transformNode;
    const q = node.rotationQuaternion ?? (node.rotationQuaternion = Quaternion.Identity());
    if (rot) q.set(rot.x, rot.y, rot.z, rot.w).normalize();
    node.position.set(pos.x, pos.y, pos.z);
    this.hk.HP_Body_SetQTransform(id, [
      [pos.x, pos.y, pos.z],
      [q.x, q.y, q.z, q.w],
    ]);
    if (resetVelocity && (this.recs.get(body)?.motion ?? body.getMotionType()) !== STATIC) {
      this.hk.HP_Body_SetLinearVelocity(id, [0, 0, 0]);
      this.hk.HP_Body_SetAngularVelocity(id, [0, 0, 0]);
    }
    node.computeWorldMatrix(true);
    this.wake(body);
  }

  private register(body: PhysicsBody, foreign: boolean): BodyRec {
    const rec = new BodyRec(body, this.serials++, foreign);
    this.recs.set(body, rec);
    this.byId.set(rec.id, rec);
    if (!foreign) this.own.add(rec);
    return rec;
  }

  /** Drop registry state for a body (does not touch Havok). */
  private forget(rec: BodyRec): void {
    rec.disposed = true;
    if (this.byId.get(rec.id) === rec) this.byId.delete(rec.id);
    if (rec.fastSlot >= 0) this.removeFast(rec);
    this.own.delete(rec);
  }

  private req(body: PhysicsBody): BodyRec {
    const rec = this.recs.get(body);
    if (rec === undefined || rec.foreign) throw new Error("physics: body was not created by this physics system");
    if (rec === this.worldRec) throw new Error("physics: the world body cannot be modified");
    if (rec.disposed || body.isDisposed) throw new Error("physics: body is disposed");
    return rec;
  }

  /** Record for any body (foreign bodies get a lightweight record on first sight). */
  private recOf(body: PhysicsBody): BodyRec | null {
    const rec = this.recs.get(body);
    if (rec !== undefined && !rec.disposed) return rec;
    if (body.isDisposed || !body._pluginData) return null;
    return this.adopt(body);
  }

  private recFromId(id: number): BodyRec | null {
    const rec = this.byId.get(id);
    if (rec !== undefined && rec.body._pluginData != null) return rec;
    if (rec !== undefined) this.forget(rec); // stale: disposed behind our back, Havok reused the id
    const info = this.P._bodies.get(BigInt(id));
    return info ? this.recOf(info.body) : null;
  }

  private adopt(body: PhysicsBody): BodyRec | null {
    if (body._pluginDataInstances && body._pluginDataInstances.length > 0) return null; // thin-instanced: unsupported
    const rec = this.register(body, true);
    rec.motion = body.getMotionType();
    if (rec.motion === DYNAMIC) {
      const m = this.hk.HP_Body_GetMassProperties(rec.hpId)[1][1];
      rec.mass = m > 0 ? m : Infinity;
    }
    return rec;
  }

  private clearBodyObservables(body: PhysicsBody): void {
    const id = body._pluginData?.hpBodyId?.[0];
    if (id === undefined) return;
    const P = this.P;
    const a = P._bodyCollisionObservable.get(id);
    if (a) {
      a.clear();
      P._bodyCollisionObservable.delete(id);
    }
    const b = P._bodyCollisionEndedObservable.get(id);
    if (b) {
      b.clear();
      P._bodyCollisionEndedObservable.delete(id);
    }
  }

  /** Cache the mass; clamp tiny/invalid dynamic masses and repair degenerate inertia. */
  private ensureMass(rec: BodyRec): void {
    if (rec.motion !== DYNAMIC) {
      rec.mass = Infinity;
      return;
    }
    const hk = this.hk;
    const props = hk.HP_Body_GetMassProperties(rec.hpId)[1];
    let m = props[1];
    const user = rec.body._pluginData.userMassProps;
    if (!(m >= this.minDynamicMass) || !Number.isFinite(m)) {
      if (user.mass === undefined || rec.massClamped) {
        user.mass = this.minDynamicMass;
        rec.massClamped = true;
        rec.body.setMassProperties(user); // keeps the shape's COM and per-unit-mass inertia
        m = this.minDynamicMass;
      }
    }
    const inertia = props[2];
    // equivalent box of the per-unit-mass principal inertia: s_k² = 6(I_i + I_j − I_k)
    const i0 = inertia[0], i1 = inertia[1], i2 = inertia[2];
    const s0 = Math.sqrt(Math.max(0, 6 * (i1 + i2 - i0)));
    const s1 = Math.sqrt(Math.max(0, 6 * (i0 + i2 - i1)));
    const s2 = Math.sqrt(Math.max(0, 6 * (i0 + i1 - i2)));
    if (Number.isFinite(s0 + s1 + s2)) {
      rec.thin = Math.min(s0, s1, s2) < this.thinWidth;
      rec.radius = 0.5 * Math.sqrt(s0 * s0 + s1 * s1 + s2 * s2);
      if (rec.thin) this.watchRec(rec, 2); // fresh thin fragment: read its kick velocity before the next steps
    }
    if (!(inertia[0] > 0 && inertia[1] > 0 && inertia[2] > 0 && Number.isFinite(inertia[0] + inertia[1] + inertia[2]))) {
      // degenerate shape: use a solid sphere of the shape's bounding radius (per unit mass)
      let r = 0.05;
      const shape = rec.body.shape;
      if (shape && shape._pluginData !== undefined) {
        const bb = shape.getBoundingBox();
        r = Math.max(0.01, 0.5 * Vector3.Distance(bb.minimum, bb.maximum));
      }
      const I = 0.4 * r * r;
      user.inertia = new Vector3(I, I, I);
      rec.inertiaFixed = true;
      rec.body.setMassProperties(user);
    }
    rec.mass = m;
  }

  // ================================================================================== shapes
  /** Convex hull from packed xyz points in the body frame (raw Havok, no temporary mesh). */
  hullShape(points: Float32Array | ArrayLike<number>, opts?: ShapeOpts): PhysicsShape {
    this.alive();
    const n = Math.floor(points.length / 3);
    if (n < 1 || points.length !== n * 3) throw new Error(`hullShape: expected packed xyz triples, got ${points.length} floats`);
    for (let i = 0; i < points.length; i++) if (!Number.isFinite(points[i])) throw new Error("hullShape: non-finite coordinate");
    const shape = this.rawHull(points, n);
    this.shapes.set(shape, newInfo("hull"));
    this.applyLeafOpts(shape, opts);
    return shape;
  }

  /**
   * Box (full size) centred at `center` with `rotation`, in the body frame. Boxes whose largest extent is
   * < 10 cm or whose middle extent is < 5 cm are built as 8-point hulls (Havok boxes that small tunnel).
   */
  boxShape(center: Vec3, rotation: Quat, size: Vec3, opts?: ShapeOpts): PhysicsShape {
    this.alive();
    if (!finite3(center) || !finite3(size)) throw new Error("boxShape: non-finite input");
    const sx = Math.max(Math.abs(size.x), 1e-4), sy = Math.max(Math.abs(size.y), 1e-4), sz = Math.max(Math.abs(size.z), 1e-4);
    const q = this.tq0.set(rotation.x, rotation.y, rotation.z, rotation.w);
    const ql = q.length();
    if (!(ql > 1e-6) || !Number.isFinite(ql)) q.set(0, 0, 0, 1);
    else q.scaleInPlace(1 / ql);
    const lo = Math.min(sx, sy, sz), hi = Math.max(sx, sy, sz);
    const mid = sx + sy + sz - lo - hi;
    let shape: PhysicsShape;
    if (hi < 0.1 || mid < 0.05) {
      const pts = new Float32Array(24);
      const c = this.tv0;
      let k = 0;
      for (let ix = -1; ix <= 1; ix += 2)
        for (let iy = -1; iy <= 1; iy += 2)
          for (let iz = -1; iz <= 1; iz += 2) {
            c.set(ix * sx * 0.5, iy * sy * 0.5, iz * sz * 0.5).applyRotationQuaternionInPlace(q);
            pts[k++] = c.x + center.x;
            pts[k++] = c.y + center.y;
            pts[k++] = c.z + center.z;
          }
      shape = this.rawHull(pts, 8);
    } else {
      shape = new PhysicsShapeBox(this.tv1.set(center.x, center.y, center.z), q, this.tv2.set(sx, sy, sz), this.scene);
    }
    this.shapes.set(shape, newInfo("box"));
    this.applyLeafOpts(shape, opts);
    return shape;
  }

  sphereShape(center: Vec3, radius: number, opts?: ShapeOpts): PhysicsShape {
    this.alive();
    if (!finite3(center) || !(radius > 0) || !Number.isFinite(radius)) throw new Error("sphereShape: invalid centre/radius");
    const shape = new PhysicsShapeSphere(this.tv0.set(center.x, center.y, center.z), radius, this.scene);
    this.shapes.set(shape, newInfo("sphere"));
    this.applyLeafOpts(shape, opts);
    return shape;
  }

  /**
   * Compound of child shapes already expressed in the body frame (identity child transforms). Children keep
   * their own density/material/filter; fields given in `opts` override them on every child. The container is
   * owned by the physics system once a body uses it (see header). Each child must be a distinct shape object.
   */
  containerShape(children: PhysicsShape[], opts?: ShapeOpts): PhysicsShape {
    this.alive();
    const seen = new Set<PhysicsShape>();
    for (const ch of children) {
      if (!ch || ch._pluginData === undefined) throw new Error("containerShape: child is null or disposed");
      if (seen.has(ch)) throw new Error("containerShape: the same shape object appears twice (child index would be ambiguous)");
      seen.add(ch);
    }
    const c = new PhysicsShapeContainer(this.scene);
    for (const ch of children) {
      c.addChild(ch);
      (this.info(ch).parents ??= new Set()).add(c);
      if (opts) this.applyPartialOpts(ch, opts);
    }
    const info = newInfo("container", true);
    info.children = children.slice();
    this.shapes.set(c, info);
    return c;
  }

  /**
   * Remove children (by index) from the body's container in place and refresh mass properties (cheaper than
   * building a new container). Returns the removed child shapes — NOT disposed (reuse or dispose them).
   */
  removeChildren(body: PhysicsBody, indices: number[]): PhysicsShape[] {
    const rec = this.req(body);
    const c = rec.shape;
    const info = c ? this.shapes.get(c) : undefined;
    if (!c || !info?.children) throw new Error("removeChildren: body's shape is not a container made by containerShape()");
    this.syncChildren(c, info);
    const removed: PhysicsShape[] = [];
    const sorted = [...new Set(indices)].filter((i) => i >= 0 && i < info.children!.length).sort((x, y) => y - x);
    for (const i of sorted) {
      const ch = info.children[i];
      c.removeChild(i); // collision changes immediately; indices above i shift down
      info.children.splice(i, 1);
      this.shapes.get(ch)?.parents?.delete(c);
      removed.push(ch);
    }
    info.childIndex = null;
    this.setShape(body, c); // mass/COM/inertia are stale until the shape is re-assigned
    return removed;
  }

  /** Children of a container (empty for leaves). */
  childrenOf(shape: PhysicsShape): readonly PhysicsShape[] {
    const info = this.shapes.get(shape);
    if (info?.children) return info.children;
    return shape.type === PhysicsShapeType.CONTAINER ? this.readChildren(shape) : [];
  }

  /** Dispose a shape (deep: also its children). Safe while bodies still use it (Havok refcounts natively). */
  disposeShape(shape: PhysicsShape, deep = false): void {
    if (!shape || shape._pluginData === undefined) return;
    const info = this.shapes.get(shape);
    const kids = info?.children ?? (shape.type === PhysicsShapeType.CONTAINER ? this.readChildren(shape) : null);
    if (kids) {
      for (const k of kids) {
        this.shapes.get(k)?.parents?.delete(shape);
        if (deep) this.disposeShape(k, true);
      }
    }
    if (info?.users) for (const r of info.users) if (r.shape === shape) r.shape = null;
    shape.dispose();
    this.shapes.delete(shape);
  }

  /**
   * Set membership/collide masks on a shape (containers: on every leaf — Havok ignores container masks) and
   * refresh every body using it so the change applies immediately. HELD bodies are kept awake while held.
   */
  setLayer(shape: PhysicsShape, layer: LayerBits, collideWith?: LayerBits): void {
    if (!shape || shape._pluginData === undefined) return;
    const mask = collideWith ?? defaultCollideMask(layer);
    const leaves: PhysicsShape[] = [];
    this.collectLeaves(shape, leaves, 0);
    for (const l of leaves) this.hk.HP_Shape_SetFilterInfo(l._pluginData, [layer | 0, mask | 0]);
    const held = (layer & Layer.HELD) !== 0;
    for (const rec of this.bodiesUsing(shape)) {
      this.refreshFilter(rec);
      if (held && !rec.keepAwake) {
        this.setKeepAwake(rec.body, true);
        rec.heldAwake = true;
      } else if (!held && rec.heldAwake) this.setKeepAwake(rec.body, false);
    }
  }

  /** Membership and collide masks of a (leaf) shape; containers report their first leaf. */
  layerOf(shape: PhysicsShape): { layer: LayerBits; collideWith: LayerBits } {
    const leaves: PhysicsShape[] = [];
    this.collectLeaves(shape, leaves, 0);
    const s = leaves[0] ?? shape;
    if (s._pluginData === undefined) return { layer: 0, collideWith: 0 };
    const f = this.hk.HP_Shape_GetFilterInfo(s._pluginData)[1];
    return { layer: f[0], collideWith: f[1] };
  }

  private rawHull(points: Float32Array | ArrayLike<number>, n: number): PhysicsShape {
    const hk = this.hk;
    const floats = n * 3;
    if (floats > this.scratchFloats) {
      if (this.scratchPtr) hk._free(this.scratchPtr);
      this.scratchFloats = Math.max(floats, 64 * 3);
      this.scratchPtr = hk._malloc(this.scratchFloats * 4);
    }
    new Float32Array(hk.HEAPU8.buffer, this.scratchPtr, floats).set(points); // view after malloc (heap may grow)
    const res = hk.HP_Shape_CreateConvexHull(this.scratchPtr, n);
    if (res[0] !== hk.Result.RESULT_OK) throw new Error("hullShape: HP_Shape_CreateConvexHull failed");
    const shape = new PhysicsShape({ pluginData: res[1] }, this.scene);
    // wrapped native shapes need: a real .type, and registration so raycasts/child lookups resolve them
    (shape as unknown as { _type: PhysicsShapeType })._type = PhysicsShapeType.CONVEX_HULL;
    this.P._shapes.set(res[1][0], shape);
    return shape;
  }

  private applyLeafOpts(shape: PhysicsShape, opts: ShapeOpts | undefined): void {
    const hk = this.hk;
    if (opts?.density !== undefined) {
      if (!(opts.density > 0) || !Number.isFinite(opts.density)) throw new Error(`shape: invalid density ${opts.density}`);
      hk.HP_Shape_SetDensity(shape._pluginData, opts.density);
    }
    this.setMaterial(shape, opts?.friction ?? DEFAULT_FRICTION, opts?.restitution ?? DEFAULT_RESTITUTION);
    const layer = opts?.layer ?? Layer.DYNAMIC;
    hk.HP_Shape_SetFilterInfo(shape._pluginData, [layer | 0, (opts?.collideWith ?? defaultCollideMask(layer)) | 0]);
  }

  /** Only the fields present in opts (containerShape overrides). */
  private applyPartialOpts(shape: PhysicsShape, opts: ShapeOpts): void {
    const hk = this.hk;
    if (opts.density !== undefined) {
      if (!(opts.density > 0) || !Number.isFinite(opts.density)) throw new Error(`shape: invalid density ${opts.density}`);
      hk.HP_Shape_SetDensity(shape._pluginData, opts.density);
    }
    if (opts.friction !== undefined || opts.restitution !== undefined) {
      const cur = shape.material;
      this.setMaterial(shape, opts.friction ?? cur.friction ?? DEFAULT_FRICTION, opts.restitution ?? cur.restitution ?? DEFAULT_RESTITUTION);
    }
    if (opts.layer !== undefined || opts.collideWith !== undefined) {
      const f = hk.HP_Shape_GetFilterInfo(shape._pluginData)[1];
      const layer = opts.layer ?? f[0];
      hk.HP_Shape_SetFilterInfo(shape._pluginData, [layer | 0, (opts.collideWith ?? (opts.layer !== undefined ? defaultCollideMask(layer) : f[1])) | 0]);
    }
  }

  private setMaterial(shape: PhysicsShape, friction: number, restitution: number): void {
    const mu = Number.isFinite(friction) ? Math.min(Math.max(friction, 0), 2) : DEFAULT_FRICTION;
    const e = Number.isFinite(restitution) ? Math.min(Math.max(restitution, 0), 1) : DEFAULT_RESTITUTION;
    shape.material = {
      friction: mu,
      staticFriction: Math.min(2, mu * STATIC_FRICTION_RATIO),
      restitution: e,
      frictionCombine: PhysicsMaterialCombineMode.GEOMETRIC_MEAN,
      restitutionCombine: PhysicsMaterialCombineMode.MAXIMUM,
    };
  }

  private info(shape: PhysicsShape): ShapeInfo {
    let i = this.shapes.get(shape);
    if (i === undefined) {
      i = newInfo(shape.type === PhysicsShapeType.CONTAINER ? "container" : "other");
      if (i.kind === "container") i.children = this.readChildren(shape);
      this.shapes.set(shape, i);
    }
    return i;
  }

  private releaseShapeUse(rec: BodyRec, shape: PhysicsShape): void {
    const i = this.shapes.get(shape);
    if (!i) return;
    i.users?.delete(rec);
    if (i.owned && (!i.users || i.users.size === 0) && shape._pluginData !== undefined) this.disposeShape(shape, false);
  }

  /** Children straight from Havok (containers made elsewhere, or edited in place). */
  private readChildren(c: PhysicsShape): PhysicsShape[] {
    const hk = this.hk;
    const out: PhysicsShape[] = [];
    if (c._pluginData === undefined) return out;
    const n = hk.HP_Shape_GetNumChildren(c._pluginData)[1];
    for (let i = 0; i < n; i++) {
      const s = this.P._shapes.get(hk.HP_Shape_GetChildShape(c._pluginData, i)[1][0]);
      if (s) out.push(s);
    }
    return out;
  }

  /** Repair our child list if the container was edited directly (addChild/removeChild by other code). */
  private syncChildren(c: PhysicsShape, info: ShapeInfo): void {
    const n = this.hk.HP_Shape_GetNumChildren(c._pluginData)[1];
    if (info.children && n === info.children.length) return;
    const fresh = this.readChildren(c);
    if (info.children) for (const k of info.children) if (!fresh.includes(k)) this.shapes.get(k)?.parents?.delete(c);
    for (const k of fresh) (this.info(k).parents ??= new Set()).add(c);
    info.children = fresh;
    info.childIndex = null;
  }

  private collectLeaves(shape: PhysicsShape, out: PhysicsShape[], depth: number): void {
    const info = this.shapes.get(shape);
    const kids = info?.children ?? (shape.type === PhysicsShapeType.CONTAINER ? this.readChildren(shape) : null);
    if (kids && depth < 8) for (const k of kids) this.collectLeaves(k, out, depth + 1);
    else if (!kids) out.push(shape);
  }

  private bodiesUsing(shape: PhysicsShape): Set<BodyRec> {
    const out = new Set<BodyRec>();
    const visit = (s: PhysicsShape, depth: number): void => {
      const i = this.shapes.get(s);
      if (!i) return;
      if (i.users) for (const r of i.users) if (!r.disposed) out.add(r);
      if (i.parents && depth < 8) for (const p of i.parents) visit(p, depth + 1);
    };
    visit(shape, 0);
    return out;
  }

  /** Make Havok re-read leaf filters of a body's shape (it caches them per body); keeps the sleep state. */
  private refreshFilter(rec: BodyRec): void {
    const body = rec.body;
    const shape = body.shape;
    if (!body._pluginData || !shape || shape._pluginData === undefined) return;
    const hk = this.hk;
    const asleep = rec.motion !== STATIC && hk.HP_Body_GetActivationState(rec.hpId)[1] === hk.ActivationState.INACTIVE;
    hk.HP_Body_SetShape(rec.hpId, NULL_ID);
    hk.HP_Body_SetShape(rec.hpId, shape._pluginData);
    if (asleep) hk.HP_Body_SetActivationState(rec.hpId, hk.ActivationState.INACTIVE);
  }

  // ================================================================================== queries
  /** Closest hit along from→to. `collideWith` = layers to hit (default all); `ignore` = one body to skip. */
  raycast(from: Vector3, to: Vector3, collideWith: LayerBits = ALL_LAYERS, ignore: PhysicsBody | null = null): RayHit | null {
    if (this._disposed || !finite3(from) || !finite3(to) || Vector3.DistanceSquared(from, to) < 1e-12) return null;
    const q = this.rayQuery;
    q.collideWith = collideWith;
    q.ignoreBody = ignore && ignore._pluginData ? ignore : undefined;
    const r = this.rayResult;
    this.engine.raycastToRef(from, to, r, q);
    q.ignoreBody = undefined;
    if (!r.hasHit || !r.body) return null;
    return { body: r.body, point: r.hitPointWorld.clone(), normal: r.hitNormalWorld.clone(), distance: r.hitDistance, childIndex: this.childIndexOf(r.body, r.shape) };
  }

  /** Every hit along from→to (one per leaf shape, nearest first, up to maxRayHits) — e.g. counting walls for audio occlusion. */
  raycastAll(from: Vector3, to: Vector3, collideWith: LayerBits = ALL_LAYERS, ignore: PhysicsBody | null = null): RayHit[] {
    if (this._disposed || !finite3(from) || !finite3(to) || Vector3.DistanceSquared(from, to) < 1e-12) return [];
    const q = this.rayQuery;
    q.collideWith = collideWith;
    q.ignoreBody = ignore && ignore._pluginData ? ignore : undefined;
    const results: PhysicsRaycastResult[] = [];
    this.engine.raycastToRef(from, to, results, q);
    q.ignoreBody = undefined;
    const hits: RayHit[] = [];
    for (const r of results) {
      if (!r.hasHit || !r.body) continue;
      hits.push({ body: r.body, point: r.hitPointWorld.clone(), normal: r.hitNormalWorld.clone(), distance: r.hitDistance, childIndex: this.childIndexOf(r.body, r.shape) });
    }
    return hits;
  }

  /** Sphere cast from→to: first hit with world contact point, surface normal and fraction along the sweep. */
  sphereSweep(from: Vector3, to: Vector3, radius: number, collideWith: LayerBits = ALL_LAYERS, ignore: PhysicsBody | null = null): SweepHit | null {
    if (this._disposed || !finite3(from) || !finite3(to) || !(radius > 0) || !Number.isFinite(radius)) return null;
    const s = this.sweepSphere(radius);
    if (s.filter !== collideWith) {
      // the query shape's own masks are the query filter (two-way rule like rays)
      this.hk.HP_Shape_SetFilterInfo(s.shape._pluginData, [ALL_LAYERS, collideWith | 0]);
      s.filter = collideWith;
    }
    const hit = this.castHit;
    this.plugin.shapeCast(
      { shape: s.shape, rotation: IDENTITY_Q, startPosition: from, endPosition: to, shouldHitTriggers: false, ignoreBody: ignore && ignore._pluginData ? ignore : undefined },
      this.castIn,
      hit,
    );
    if (!hit.hasHit || !hit.body) return null;
    const f = Math.min(Math.max(hit.hitFraction, 0), 1);
    return {
      body: hit.body,
      point: hit.hitPoint.clone(),
      normal: hit.hitNormal.clone(),
      distance: f * Vector3.Distance(from, to),
      childIndex: this.childIndexOf(hit.body, hit.shape),
      fraction: f,
    };
  }

  private sweepSphere(radius: number): { shape: PhysicsShape; filter: number } {
    const key = Math.round(radius * 1e4);
    let s = this.sweepShapes.get(key);
    if (!s) {
      if (this.sweepShapes.size >= 32) {
        // bounded cache: drop the oldest radius
        const [k0, v0] = this.sweepShapes.entries().next().value!;
        v0.shape.dispose();
        this.sweepShapes.delete(k0);
      }
      const shape = new PhysicsShapeSphere(Vector3.Zero(), key / 1e4, this.scene);
      this.hk.HP_Shape_SetFilterInfo(shape._pluginData, [ALL_LAYERS, ALL_LAYERS]);
      s = { shape, filter: ALL_LAYERS };
      this.sweepShapes.set(key, s);
    }
    return s;
  }

  /** Index of the hit child inside the body's container (−1 if the body's shape is a leaf or unknown). */
  private childIndexOf(body: PhysicsBody, hit: PhysicsShape | undefined): number {
    const root = body.shape;
    if (!root) return -1;
    const info = this.shapes.get(root);
    const kids = info?.children ?? (root.type === PhysicsShapeType.CONTAINER ? this.readChildren(root) : null);
    if (!kids) return -1;
    if (kids.length === 1) return 0; // Havok reports no child for single-child containers
    if (!hit) return -1;
    if (info) {
      if (!info.childIndex) {
        info.childIndex = new Map();
        for (let i = 0; i < kids.length; i++) info.childIndex.set(kids[i], i);
      }
      const i = info.childIndex.get(hit);
      if (i !== undefined) return i;
      // container edited behind our back: resync and retry once
      this.syncChildren(root, info);
      return info.children ? info.children.indexOf(hit) : -1;
    }
    return kids.indexOf(hit);
  }

  // ================================================================================== constraints
  /** Hinge about axisA/axisB (body-local) through pivotA/pivotB; limits relative to the creation pose. */
  hinge(a: PhysicsBody, b: PhysicsBody, o: HingeOpts): PhysicsConstraint {
    const j = this.makeJoint("hinge", PhysicsConstraintType.HINGE, a, b, o.pivotA, o.pivotB, o.axisA, o.axisB, !!o.collideConnected);
    const c = j.c;
    if (o.min !== undefined || o.max !== undefined) this.setHingeLimits(c, o.min, o.max);
    if (o.friction !== undefined && o.friction > 0) this.plugin.setAxisFriction(c, PhysicsConstraintAxis.ANGULAR_X, o.friction);
    if (o.motor) this.setHingeMotor(c, o.motor.target, o.motor.maxForce);
    return c;
  }

  /** Prismatic joint (no relative rotation) along axisA/axisB with linear limits [min, max] (m) relative to the creation pose. */
  slider(a: PhysicsBody, b: PhysicsBody, o: SliderOpts): PhysicsConstraint {
    const j = this.makeJoint("slider", PhysicsConstraintType.PRISMATIC, a, b, o.pivotA, o.pivotB, o.axisA, o.axisB, !!o.collideConnected);
    this.setSliderLimits(j.c, o.min, o.max);
    if (o.friction !== undefined && o.friction > 0) this.plugin.setAxisFriction(j.c, PhysicsConstraintAxis.LINEAR_X, o.friction);
    return j.c;
  }

  ball(a: PhysicsBody, b: PhysicsBody, pivotA: Vector3, pivotB: Vector3, collideConnected = false): PhysicsConstraint {
    return this.makeJoint("ball", PhysicsConstraintType.BALL_AND_SOCKET, a, b, pivotA, pivotB, Vector3.Right(), Vector3.Right(), collideConnected).c;
  }

  removeConstraint(c: PhysicsConstraint): void {
    const j = this.joints.get(c);
    const pd = c._pluginData as HP_Id[] | undefined;
    if (pd && pd.length > 0) {
      const hk = this.hk;
      const map = this.P._constraintToBodyIdPair;
      // never touch a Havok body that was released behind our back (direct body.dispose())
      const bodiesAlive = !j || (j.a.body._pluginData != null && j.b.body._pluginData != null);
      for (const id of pd) {
        map?.delete(id[0]);
        // HP_Constraint_Release alone keeps the constraint alive (inert) as long as its bodies live — forever
        // for world-anchored joints. Detaching both bodies first lets Havok free it (verified: counts drop).
        hk.HP_Constraint_SetEnabled(id, false as unknown as number); // embind bool (Babylon passes a boolean too)
        if (bodiesAlive) {
          hk.HP_Constraint_SetParentBody(id, NULL_ID);
          hk.HP_Constraint_SetChildBody(id, NULL_ID);
        }
      }
      c.dispose(); // release + empties _pluginData (a second release would trap in WASM)
    }
    if (!j) return;
    this.joints.delete(c);
    for (const r of [j.a, j.b]) {
      if (r.joints) {
        r.joints.delete(j);
        if (r.joints.size === 0) r.joints = null;
      }
      if (!r.disposed && r.motion === DYNAMIC) this.wake(r.body); // a door released from its hinges starts to fall
    }
  }

  /** Angular limits (rad) of a hinge relative to its creation pose; both undefined (or ≥ ±π) = free. */
  setHingeLimits(c: PhysicsConstraint, min?: number, max?: number): void {
    const P = this.plugin;
    const ax = PhysicsConstraintAxis.ANGULAR_X;
    const lo0 = min !== undefined && Number.isFinite(min) ? Math.max(min, -Math.PI) : -Math.PI;
    const hi0 = max !== undefined && Number.isFinite(max) ? Math.min(max, Math.PI) : Math.PI;
    if (lo0 <= -Math.PI && hi0 >= Math.PI) P.setAxisMode(c, ax, PhysicsConstraintAxisLimitMode.FREE);
    else {
      const lo = Math.min(lo0, hi0), hi = Math.max(lo0, hi0);
      P.setAxisMode(c, ax, PhysicsConstraintAxisLimitMode.LIMITED);
      P.setAxisMinLimit(c, ax, lo);
      P.setAxisMaxLimit(c, ax, hi);
    }
    this.wakeJoint(c);
  }

  /** Position motor driving the hinge angle to `target` (rad) with at most `maxForce` (N·m); maxForce ≤ 0 removes it. */
  setHingeMotor(c: PhysicsConstraint, target: number, maxForce: number): void {
    const P = this.plugin;
    const ax = PhysicsConstraintAxis.ANGULAR_X;
    if (!(maxForce > 0) || !Number.isFinite(target)) this.disableMotor(c, ax);
    else {
      P.setAxisMotorType(c, ax, PhysicsConstraintMotorType.POSITION);
      P.setAxisMotorTarget(c, ax, target);
      P.setAxisMotorMaxForce(c, ax, maxForce);
    }
    this.wakeJoint(c);
  }

  /** Velocity motor (rad/s) with torque limit (N·m) — ceiling fans, motors; maxTorque ≤ 0 removes it. */
  setHingeVelocityMotor(c: PhysicsConstraint, velocity: number, maxTorque: number): void {
    const P = this.plugin;
    const ax = PhysicsConstraintAxis.ANGULAR_X;
    if (!(maxTorque > 0) || !Number.isFinite(velocity)) this.disableMotor(c, ax);
    else {
      P.setAxisMotorType(c, ax, PhysicsConstraintMotorType.VELOCITY);
      P.setAxisMotorTarget(c, ax, velocity);
      P.setAxisMotorMaxForce(c, ax, maxTorque);
    }
    this.wakeJoint(c);
  }

  /** Havok ignores motor type NONE (the type stays POSITION/VELOCITY): a motor is only off with zero max force. */
  private disableMotor(c: PhysicsConstraint, ax: PhysicsConstraintAxis): void {
    if (!c._pluginData || c._pluginData.length === 0) return;
    this.plugin.setAxisMotorMaxForce(c, ax, 0);
    this.plugin.setAxisMotorType(c, ax, PhysicsConstraintMotorType.NONE);
    this.wakeJoint(c);
  }

  /** Hinge joint friction (N·m). */
  setHingeFriction(c: PhysicsConstraint, friction: number): void {
    if (friction >= 0) this.plugin.setAxisFriction(c, PhysicsConstraintAxis.ANGULAR_X, friction);
  }

  /** Slider travel limits (m) relative to the creation pose. */
  setSliderLimits(c: PhysicsConstraint, min: number, max: number): void {
    const P = this.plugin;
    const ax = PhysicsConstraintAxis.LINEAR_X;
    const lo = Number.isFinite(min) ? min : -1e3, hi = Number.isFinite(max) ? max : 1e3;
    P.setAxisMode(c, ax, PhysicsConstraintAxisLimitMode.LIMITED);
    P.setAxisMinLimit(c, ax, Math.min(lo, hi));
    P.setAxisMaxLimit(c, ax, Math.max(lo, hi));
    this.wakeJoint(c);
  }

  /** Current hinge angle (rad, 0 = creation pose, same sign as limits/motor targets). */
  hingeAngle(c: PhysicsConstraint): number {
    const j = this.joints.get(c);
    if (!j || j.kind !== "hinge" || j.a.disposed || j.b.disposed) return NaN;
    const qa = this.bodyRotation(j.a, this.tq0);
    const qb = this.bodyRotation(j.b, this.tq1);
    const ax = j.axisA.applyRotationQuaternionToRef(qa, this.tv0);
    const pa = j.perpA.applyRotationQuaternionToRef(qa, this.tv1);
    const pb = j.perpB.applyRotationQuaternionToRef(qb, this.tv2);
    const cr = Vector3.CrossToRef(pa, pb, this.tv3);
    return HINGE_SIGN * Math.atan2(Vector3.Dot(cr, ax), Vector3.Dot(pa, pb));
  }

  /** Current slider travel (m along axisA, 0 = creation pose). */
  sliderPosition(c: PhysicsConstraint): number {
    const j = this.joints.get(c);
    if (!j || j.kind !== "slider" || j.a.disposed || j.b.disposed) return NaN;
    const ta = this.bodyTransform(j.a);
    const tb = this.bodyTransform(j.b);
    const qa = this.tq0.set(ta[1][0], ta[1][1], ta[1][2], ta[1][3]);
    const qb = this.tq1.set(tb[1][0], tb[1][1], tb[1][2], tb[1][3]);
    const pa = j.pivotA.applyRotationQuaternionToRef(qa, this.tv0).addInPlaceFromFloats(ta[0][0], ta[0][1], ta[0][2]);
    const pb = j.pivotB.applyRotationQuaternionToRef(qb, this.tv1).addInPlaceFromFloats(tb[0][0], tb[0][1], tb[0][2]);
    const ax = j.axisA.applyRotationQuaternionToRef(qa, this.tv2);
    return Vector3.Dot(pb.subtractInPlace(pa), ax);
  }

  /**
   * Constraint load during the last world step: linear force (N) and torque (N·m) magnitudes, from Havok's
   * applied impulses. Joint bonds use this to fail under sustained pulls (rip doors off their hinges).
   */
  constraintLoad(c: PhysicsConstraint): { force: number; torque: number } {
    const pd = c._pluginData as HP_Id[] | undefined;
    if (!pd || pd.length === 0) return { force: 0, torque: 0 };
    const r = this.hk.HP_Constraint_GetAppliedImpulses(pd[0]);
    const h = this.plugin.getTimeStep() / this.substepsLast;
    const l = r[1], t = r[2];
    return { force: Math.hypot(l[0], l[1], l[2]) / h, torque: Math.hypot(t[0], t[1], t[2]) / h };
  }

  private makeJoint(
    kind: JointRec["kind"],
    type: PhysicsConstraintType,
    a: PhysicsBody,
    b: PhysicsBody,
    pivotA: Vector3,
    pivotB: Vector3,
    axisA: Vector3,
    axisB: Vector3,
    collide: boolean,
  ): JointRec {
    this.alive();
    if (a === b) throw new Error(`${kind}: a body cannot be jointed to itself`);
    const ra = this.jointRec(a);
    const rb = this.jointRec(b);
    if (!finite3(pivotA) || !finite3(pivotB)) throw new Error(`${kind}: non-finite pivot`);
    const axA = axisA.normalizeToNew();
    const axB = axisB.normalizeToNew();
    if (!(axA.lengthSquared() > 0.5) || !(axB.lengthSquared() > 0.5)) throw new Error(`${kind}: zero-length axis`);
    // Perpendicular axes must describe the SAME world direction at creation, otherwise angular limits are not
    // relative to the creation pose (and a prismatic joint twists the bodies on its first step).
    const perpA = anyPerpendicular(axA);
    const qa = this.bodyRotation(ra, this.tq0);
    const qb = this.bodyRotation(rb, this.tq1);
    const perpB = perpA.applyRotationQuaternion(qa).applyRotationQuaternionInPlace(Quaternion.Inverse(qb));
    perpB.subtractInPlace(axB.scale(Vector3.Dot(perpB, axB)));
    if (perpB.lengthSquared() < 1e-8) perpB.copyFrom(anyPerpendicular(axB));
    perpB.normalize();
    const c = new PhysicsConstraint(
      type,
      { pivotA: pivotA.clone(), pivotB: pivotB.clone(), axisA: axA, axisB: axB, perpAxisA: perpA, perpAxisB: perpB, collision: collide },
      this.scene,
    );
    a.addConstraint(b, c);
    const j: JointRec = { c, kind, a: ra, b: rb, pivotA: pivotA.clone(), pivotB: pivotB.clone(), axisA: axA, axisB: axB, perpA, perpB };
    this.joints.set(c, j);
    (ra.joints ??= new Set()).add(j);
    (rb.joints ??= new Set()).add(j);
    if (ra.motion === DYNAMIC) this.wake(a);
    if (rb.motion === DYNAMIC) this.wake(b);
    return j;
  }

  private jointRec(body: PhysicsBody): BodyRec {
    if (body === this.worldBody) return this.worldRec;
    const rec = this.recOf(body);
    if (!rec || rec.disposed || body.isDisposed) throw new Error("constraint: body is disposed or unknown");
    return rec;
  }

  private wakeJoint(c: PhysicsConstraint): void {
    const j = this.joints.get(c);
    if (!j) return;
    if (j.a.motion === DYNAMIC && !j.a.disposed) this.wake(j.a.body);
    if (j.b.motion === DYNAMIC && !j.b.disposed) this.wake(j.b.body);
  }

  private bodyTransform(rec: BodyRec): [[number, number, number], [number, number, number, number]] {
    if (rec === this.worldRec)
      return [
        [0, 0, 0],
        [0, 0, 0, 1],
      ];
    return this.hk.HP_Body_GetQTransform(rec.hpId)[1] as [[number, number, number], [number, number, number, number]];
  }

  private bodyRotation(rec: BodyRec, out: Quaternion): Quaternion {
    const t = this.bodyTransform(rec);
    return out.set(t[1][0], t[1][1], t[1][2], t[1][3]);
  }

  // ================================================================================== stats / lifecycle
  stats(): PhysicsStats {
    let awake = 0;
    for (const rec of this.fast) if (rec.motion !== STATIC && (rec.moved || rec.awakePoll)) awake++;
    return { bodies: this.engine.getBodies().length, awake, stepMs: this.stepMsEma, constraints: this.joints.size };
  }

  debugStats(): PhysicsDebugStats {
    return {
      ...this.stats(),
      ownBodies: this.own.size,
      fastSynced: this.fast.length,
      movedLastStep: this.movedLast,
      contactPairs: this.agg.size,
      eventsLastStep: this.eventsLast,
      impactsLastStep: this.impactsLast,
      forcedSleeps: this.forcedSleeps,
      minSubsteps: this.minSubsteps,
      substepsLast: this.substepsLast,
      thinSpeedLast: this.thinSpeed,
      stepIndex: this._stepIndex,
      havokMs: this.tHavok,
      eventsMs: this.tEvents,
      syncMs: this.tSync,
      impactsMs: this.tImpacts,
    };
  }

  get disposed(): boolean {
    return this._disposed;
  }

  /** Release everything this system created and disable the scene's physics engine. Bodies made by createBody become invalid. */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    for (const c of [...this.joints.keys()]) this.removeConstraint(c);
    this.subscribers = [];
    for (const s of this.sweepShapes.values()) s.shape.dispose();
    this.sweepShapes.clear();
    if (this.scratchPtr) {
      this.hk._free(this.scratchPtr);
      this.scratchPtr = 0;
      this.scratchFloats = 0;
    }
    if (this.bjsObs) {
      this.P.onCollisionObservable.remove(this.bjsObs[0]);
      this.P.onCollisionEndedObservable.remove(this.bjsObs[1]);
      this.bjsObs = null;
    }
    this.agg.clear();
    for (const rec of [...this.own]) {
      if (rec.disposeObserver) {
        rec.disposeObserver.remove();
        rec.disposeObserver = null;
      }
      this.forget(rec);
    }
    this.byId.clear();
    if (!this.worldBody.isDisposed) this.worldBody.dispose();
    this.worldBody.transformNode.dispose();
    if (this.sceneDisposeObs) this.sceneDisposeObs.remove();
    if (this.scene.getPhysicsEngine() === (this.engine as unknown)) this.scene.disablePhysicsEngine();
  }

  private alive(): void {
    if (this._disposed) throw new Error("physics: system is disposed");
  }
}

// ---------------------------------------------------------------------------------------------- helpers
function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.round(Number.isFinite(v) ? v : lo);
  return n < lo ? lo : n > hi ? hi : n;
}

/** A deterministic unit vector perpendicular to unit vector a. */
function anyPerpendicular(a: Vector3): Vector3 {
  const ref = Math.abs(a.x) < 0.9 ? Vector3.Right() : Vector3.Up();
  return Vector3.Cross(a, ref).normalize();
}
