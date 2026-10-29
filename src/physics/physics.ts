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
  /**
   * Adaptive collision-event masks (see header): CONTINUED events only for bodies that are fast (> hotSpeed) or were
   * in an impact within hotSteps. Default true; false gives every body STARTED|CONTINUED|FINISHED.
   */
  adaptiveEvents?: boolean;
  /** Body speed (m/s, incl. corner speed) above which its contacts report CONTINUED events. Default 0.5. */
  hotSpeed?: number;
  /** Fixed steps a body stays "hot" after being fast or in an impact. Default 30. */
  hotSteps?: number;
  /** Same-step `started` impacts from pre-step velocities (see impacts.ts). Default true. */
  estimateImpacts?: boolean;
  /** Hull inputs with more points are decimated to at most this many k-DOP support points (4–64). Default 16. */
  maxHullPoints?: number;
  /** Hull inputs thinner than this (m) are thickened to it (coplanar / collinear / single points). Default 0.001. */
  minHullThickness?: number;
  /** Gravity along Y (m/s²). Default −9.81. */
  gravity?: number;
  /** Impact aggregation tuning (minImpulse, minDeltaV, spikeFactor, …). */
  impacts?: Partial<ImpactConfig>;
  /** World speed limits. Defaults 80 m/s and 60 rad/s (nothing in an apartment is faster; tames spinning shards). */
  maxLinearVelocity?: number;
  maxAngularVelocity?: number;
  /** Force-sleep slow dynamic bodies (large piles never sleep otherwise). Default enabled (0.08 m/s, 0.2 rad/s, 0.6 s; see header). */
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
  /** Bodies with CONTINUED events enabled (adaptive event masks). */
  hotBodies: number;
  /** Same-step (estimated) started impacts so far. */
  earlyImpacts: number;
  /** hullShape(): calls, EMA / last time (ms), last input/output point counts, box substitutions, thickened inputs. */
  hullCount: number;
  hullMsAvg: number;
  hullMsLast: number;
  hullPointsInLast: number;
  hullPointsOutLast: number;
  hullBoxes: number;
  hullThickened: number;
  /** Last step breakdown (ms). */
  havokMs: number;
  eventsMs: number;
  syncMs: number;
  impactsMs: number;
}

// ---------------------------------------------------------------------------------------------- internals
const EVENT_MASK = EV_STARTED | EV_CONTINUED | EV_FINISHED;
/** Mask of "cold" bodies under adaptive event masks: contact starts and ends only. */
const COLD_MASK = EV_STARTED | EV_FINISHED;
const STATIC = PhysicsMotionType.STATIC;
const ANIMATED = PhysicsMotionType.ANIMATED;
const DYNAMIC = PhysicsMotionType.DYNAMIC;
/**
 * Sleep assist: a body moving less than STILL_FRACTION of the slow thresholds counts STILL_WEIGHT slow steps per step
 * (pile neighbours woken by a hit elsewhere re-sleep in seconds/STILL_WEIGHT instead of `seconds`).
 */
const STILL_FRACTION = 0.25;
const STILL_WEIGHT = 4;
/** Sleep assist: the island-coherent sleep pass runs every this many steps; bounding spheres within SLEEP_MARGIN (m) touch. */
const SLEEP_PASS_STEPS = 4;
const SLEEP_MARGIN = 0.03;
/** Sleep pass members: moved within this many steps. Components larger than SLEEP_BIG_COMPONENT let members that were
 *  slow for SLEEP_FALLBACK × `seconds` sleep on their own. */
const SLEEP_RECENT_STEPS = 8;
const SLEEP_BIG_COMPONENT = 32;
const SLEEP_FALLBACK = 4;
/** STARTED events within this many steps of a body's mask change are echoes of existing contacts (see queueHeat). */
const MASK_ECHO_STEPS = 4;
/** Impulse estimator: a body slower than this (m/s) before the step counts as resting (supported) — see pointTerms. */
const RESTING_SPEED = 0.15;
const DEFAULT_FRICTION = 0.5;
const DEFAULT_RESTITUTION = 0;
/** μs ≈ 1.2 μk (real dry contacts have stiction; also keeps resting stacks from creeping). */
const STATIC_FRICTION_RATIO = 1.2;
/** Hinge-angle sign so hingeAngle() matches Havok's ANGULAR_X limits/motor (verified by physics-sys-joints probe). */
const HINGE_SIGN = 1;
/** Null handle (shape / body) for HP_Body_SetShape and constraint detaching. */
const NULL_ID: [bigint] = [BigInt(0)];
const IDENTITY_Q = Quaternion.Identity();
const IDENTITY_QT: [[number, number, number], [number, number, number, number]] = [
  [0, 0, 0],
  [0, 0, 0, 1],
];

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
  /** Bounding radius about the COM (m, from the shape's AABB): proximity grouping of the sleep pass. */
  boundR = 0;
  /** Last step in which the body moved (sleep pass membership). */
  movedStep = -1e9;
  /** Step index until which the body's velocity is polled before stepping (fresh / expectFast). */
  watchUntil = -1;
  // ---- velocity cache (impulse estimation, adaptive substeps, adaptive event masks)
  /**
   * COM linear (m/s) and angular (rad/s) velocity at the START of fixed step `vStep`: derived from the body-buffer
   * motion of the previous step (semi-implicit Euler: displacement/dt is the end-of-step velocity), or read from
   * Havok when something changed it between steps (setLinearVelocity / applyImpulse / …). A body whose vStep is
   * not the current step did not move in the previous step: its velocity is zero.
   */
  vx = 0;
  vy = 0;
  vz = 0;
  wx = 0;
  wy = 0;
  wz = 0;
  vStep = -1;
  /** Velocity at the start of step `pvStep` (kept when the sync overwrites v): what that step's collisions acted on. */
  pvx = 0;
  pvy = 0;
  pvz = 0;
  pwx = 0;
  pwy = 0;
  pwz = 0;
  pvStep = -1;
  /** Velocity changed outside the step: re-read from Havok before the next step. */
  velDirty = false;
  /** COM in the body frame and mean per-unit-mass principal inertia (m²) for the rotational effective mass. */
  comX = 0;
  comY = 0;
  comZ = 0;
  kk = 0;
  /** Largest restitution of the body's leaf shapes (Havok combines restitution with MAXIMUM). */
  restitution = 0;
  /** Current Havok event mask and the step until which CONTINUED events stay enabled (adaptive masks). */
  mask = 0;
  hotUntil = -1;
  /** Step in which the body was queued for heating (dedupe). */
  heatStamp = -1;
  /** Step of the last event-mask change (Havok re-reports the body's existing contacts as STARTED afterwards). */
  maskStep = -1e9;
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
  /** Leaf restitution (set with the material) — feeds the impact estimator without reading Havok. */
  restitution: number;
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
  /** Queried through appliedImpulse()/constraintLoad(): its impulses are summed over every substep. */
  tracked: boolean;
  /** Step whose substep impulses `acc` holds (linear xyz, angular xyz; N·s, world). */
  accStep: number;
  acc: Float64Array;
}

/** What appliedImpulse() returns: the constraint's impulse over the last fixed step (all substeps), world frame. */
export interface ConstraintImpulse {
  /** Linear impulse (N·s); force = linear / dt. */
  linear: Vector3;
  /** Angular impulse (N·m·s); torque = angular / dt. */
  angular: Vector3;
  /** Duration of that fixed step (s). */
  dt: number;
}

const newInfo = (kind: ShapeInfo["kind"], owned = false): ShapeInfo => ({ kind, owned, children: null, childIndex: null, parents: null, users: null, restitution: 0 });
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
  /** Adaptive event masks (fixed at creation, see header). */
  readonly adaptiveEvents: boolean;
  hotSpeed: number;
  hotSteps: number;
  maxHullPoints: number;
  minHullThickness: number;
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
  /** Gravity along Y (m/s²) given at creation (the impulse estimator's support heuristic). */
  private readonly gravityY: number;
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
  /** Bodies whose velocity was changed between steps (wrapped plugin setters / impulses). */
  private velDirty: BodyRec[] = [];
  /** Bodies in a contact start this step: heated (CONTINUED events on) after the step. */
  private heatQueue: BodyRec[] = [];
  private hotCount = 0;
  /** Joints whose impulses are summed over substeps (queried by appliedImpulse / constraintLoad). */
  private readonly trackedJoints = new Set<JointRec>();
  private hullCount = 0;
  private hullMsEma = 0;
  private hullMsLast = 0;
  private hullInLast = 0;
  private hullOutLast = 0;
  private hullBoxes = 0;
  private hullThickened = 0;
  /** Hull preparation scratch (normalised coordinates, selected indices, output points). */
  private hullNorm = new Float64Array(3 * 256);
  private readonly hullSel = new Int32Array(128);
  private readonly hullOut = new Float32Array(3 * 128);
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
    this.adaptiveEvents = opts.adaptiveEvents ?? true;
    this.hotSpeed = opts.hotSpeed !== undefined && opts.hotSpeed >= 0 ? opts.hotSpeed : 0.5;
    this.hotSteps = clampInt(opts.hotSteps ?? 30, 1, 100000);
    this.maxHullPoints = clampInt(opts.maxHullPoints ?? 16, 4, 64);
    this.minHullThickness = opts.minHullThickness !== undefined && opts.minHullThickness >= 0 ? opts.minHullThickness : 0.001;
    this.gravityY = opts.gravity ?? -9.81;
    const sa = typeof opts.sleepAssist === "object" ? opts.sleepAssist : {};
    this.sleepAssist = { enabled: opts.sleepAssist !== false && sa.enabled !== false, linear: sa.linear ?? 0.08, angular: sa.angular ?? 0.2, seconds: sa.seconds ?? 0.6 };
    this.agg = new ImpactAggregator<BodyRec>(opts.impacts);
    this.impacts = this.agg.cfg;
    if (opts.estimateImpacts !== false) this.agg.estimator = (a, b, px, py, pz, nx, ny, nz) => this.estimateImpulse(a, b, px, py, pz, nx, ny, nz);

    this.plugin = new HavokPlugin(true, hk, { maxQueryCollectorHits: clampInt(opts.maxRayHits ?? 32, 2, 256) });
    if (!scene.enablePhysics(new Vector3(0, opts.gravity ?? -9.81, 0), this.plugin)) throw new Error("Physics: enablePhysics failed");
    this.engine = scene.getPhysicsEngine() as unknown as PhysicsEngineV2;
    scene.physicsEnabled = false; // scene.render() must never step physics by wall clock
    this.engine.setTimeStep(1 / 60);
    this.engine.setVelocityLimits(opts.maxLinearVelocity ?? 80, opts.maxAngularVelocity ?? 60);
    this.P = this.plugin as unknown as PluginInternals;
    this.world = this.P.world;
    this.wrapVelocityChanges();
    // HP_World_GetNextCollisionEvent takes the world as a plain number (as Babylon's notifier does)
    this.worldNum = Number(this.world);

    // world anchor: static, no shape (verified to work as a constraint parent), never collides
    const wn = new TransformNode("physics:world", scene);
    wn.rotationQuaternion = Quaternion.Identity();
    wn.computeWorldMatrix(true);
    this.worldBody = new PhysicsBody(wn, STATIC, false, scene);
    this.worldRec = this.register(this.worldBody, false);
    this.worldRec.motion = STATIC;

    // Scene.dispose() notifies this BEFORE disposing nodes; the scene disables its physics engine itself afterwards
    // (bodies must leave the world before it is released), so only our own resources are released here.
    this.sceneDisposeObs = scene.onDisposeObservable.add(() => this.release(false));
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
      // Havok only keeps the LAST world step's constraint impulses: sum them per substep for queried joints
      if (n > 1 && this.trackedJoints.size > 0) this.accumulateJointImpulses(s === 0);
      tHavok += b - a;
      tEvents += now() - b;
    }
    // impacts are aggregated BEFORE the sync: the estimator needs the pre-step velocities and poses that the sync
    // replaces with this step's results
    const t1 = now();
    const count = this.agg.endStep(this.impactOut);
    this.heatImpacts(count);
    const t2 = now();
    this.syncForeign();
    this.fastSync(dt);
    if (this.sleepAssist.enabled && this._stepIndex % SLEEP_PASS_STEPS === 0) this.sleepPass(dt);
    P._releasePendingWorldRegions?.();
    const t3 = now();
    this._stepIndex++;
    this.dispatch(count);
    scene.onAfterPhysicsObservable.notifyObservers(scene);
    const t4 = now();
    this.tHavok = tHavok;
    this.tEvents = tEvents;
    this.tSync = t3 - t2;
    this.tImpacts = t2 - t1 + (t4 - t3);
    this.eventsLast = events;
    this.impactsLast = count;
    const ms = t4 - t0;
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
    if (rec && !rec.disposed && rec.motion !== STATIC) this.touchVelocity(body);
  }

  /**
   * COM linear (m/s) and angular (rad/s) velocity a body had at the START of the last completed step — i.e. before
   * that step's collisions changed it (destruction can restore a projectile's velocity when its target breaks).
   * Zero for static/unknown bodies. Writes into the given vectors (allocation-free) and returns `lin`.
   */
  preStepVelocity(body: PhysicsBody, lin: Vector3, ang?: Vector3): Vector3 {
    lin.setAll(0);
    ang?.setAll(0);
    const rec = this.recs.get(body);
    if (!rec || rec.disposed || rec.motion === STATIC) return lin;
    const last = this._stepIndex - 1;
    if (rec.pvStep === last) {
      lin.set(rec.pvx, rec.pvy, rec.pvz);
      ang?.set(rec.pwx, rec.pwy, rec.pwz);
    } else if (rec.vStep === last) {
      // the body did not move during that step: v still holds its start velocity
      lin.set(rec.vx, rec.vy, rec.vz);
      ang?.set(rec.wx, rec.wy, rec.wz);
    }
    return lin;
  }

  private watchRec(rec: BodyRec, steps: number): void {
    if (rec.watchUntil < this._stepIndex) this.watch.push(rec);
    rec.watchUntil = Math.max(rec.watchUntil, this._stepIndex + steps);
  }

  /** Read the Havok velocity of every body changed between steps; returns the fastest thin dynamic one (m/s). */
  private readDirtyVelocities(): number {
    const hk = this.hk;
    const list = this.velDirty;
    const step = this._stepIndex;
    let thin = 0;
    for (let i = 0; i < list.length; i++) {
      const rec = list[i];
      rec.velDirty = false;
      if (rec.disposed || !rec.body._pluginData || rec.motion === STATIC) continue;
      const lv = hk.HP_Body_GetLinearVelocity(rec.hpId)[1];
      const av = hk.HP_Body_GetAngularVelocity(rec.hpId)[1];
      if (!Number.isFinite(lv[0] + lv[1] + lv[2] + av[0] + av[1] + av[2])) continue;
      rec.vx = lv[0];
      rec.vy = lv[1];
      rec.vz = lv[2];
      rec.wx = av[0];
      rec.wy = av[1];
      rec.wz = av[2];
      rec.vStep = step;
      const sp = Math.hypot(lv[0], lv[1], lv[2]) + Math.hypot(av[0], av[1], av[2]) * rec.radius;
      if (rec.thin && rec.motion === DYNAMIC && sp > thin) thin = sp;
      if (sp > this.hotSpeed) this.heat(rec); // a velocity change wakes the body anyway
    }
    list.length = 0;
    return thin;
  }

  /**
   * Route every velocity change made through Babylon (body.setLinearVelocity / setAngularVelocity / applyImpulse /
   * applyAngularImpulse; applyForce / applyTorque call the impulse methods through `this`, so the instance
   * wrappers see them too) into the velocity cache, so strikes, kicks and throws are seen before the next step
   * without callers having to say so (expectFast() is no longer required). Raw HP_Body_* calls bypass this: follow
   * them with expectFast(body).
   */
  private wrapVelocityChanges(): void {
    const plugin = this.plugin as unknown as Record<string, (body: PhysicsBody, ...rest: unknown[]) => unknown>;
    for (const name of ["setLinearVelocity", "setAngularVelocity", "applyImpulse", "applyAngularImpulse"]) {
      const orig = plugin[name];
      if (typeof orig !== "function") continue;
      plugin[name] = (body: PhysicsBody, ...rest: unknown[]): unknown => {
        const r = orig.call(this.plugin, body, ...rest);
        this.touchVelocity(body);
        return r;
      };
    }
  }

  private touchVelocity(body: PhysicsBody): void {
    const rec = this.recs.get(body);
    if (rec !== undefined && !rec.velDirty && !rec.disposed) {
      rec.velDirty = true;
      this.velDirty.push(rec);
    }
  }

  // ---------------------------------------------------------------------------------- adaptive event masks
  /**
   * Enable CONTINUED events for `rec` for the next hotSteps steps. Setting a mask wakes a body, so sleeping bodies
   * are left cold (Havok re-reports contacts of islands that wake/sleep as STARTED: heating those would undo every
   * forced sleep).
   */
  private heat(rec: BodyRec): void {
    if (!this.adaptiveEvents || rec.motion === STATIC || rec.disposed || rec.foreign || !rec.body._pluginData) return;
    if (rec.mask !== EVENT_MASK) {
      const hk = this.hk;
      if (rec.motion === DYNAMIC && hk.HP_Body_GetActivationState(rec.hpId)[1] !== hk.ActivationState.ACTIVE) return;
      this.setMask(rec, EVENT_MASK);
    }
    rec.hotUntil = this._stepIndex + this.hotSteps;
  }

  /** Back to STARTED|FINISHED; keeps a sleeping body asleep (setting a mask wakes it). */
  private cool(rec: BodyRec, keepSleep: boolean): void {
    if (rec.mask === COLD_MASK || !rec.body._pluginData) return;
    const hk = this.hk;
    const asleep = keepSleep && hk.HP_Body_GetActivationState(rec.hpId)[1] === hk.ActivationState.INACTIVE;
    this.setMask(rec, COLD_MASK);
    if (asleep) hk.HP_Body_SetActivationState(rec.hpId, hk.ActivationState.INACTIVE);
  }

  private setMask(rec: BodyRec, mask: number): void {
    if (!rec.body._pluginData) return;
    this.hk.HP_Body_SetEventMask(rec.hpId, mask);
    if (rec.mask === EVENT_MASK) this.hotCount--;
    if (mask === EVENT_MASK) this.hotCount++;
    rec.mask = mask;
    rec.maskStep = this._stepIndex;
  }

  /**
   * Queue a body seen in a contact start (called while walking events: masks are changed after the step). A mask
   * change makes Havok re-report the body's existing contacts as STARTED 1–2 steps later: those are not new contacts
   * (re-heating on them would keep every cooled body hot forever).
   */
  private queueHeat(rec: BodyRec): void {
    if (rec.heatStamp === this._stepIndex || rec.motion === STATIC || rec.foreign) return;
    if (this._stepIndex - rec.maskStep <= MASK_ECHO_STEPS) return;
    rec.heatStamp = this._stepIndex;
    this.heatQueue.push(rec);
  }

  /**
   * After the step's impacts are known: bodies in an emitted impact and bodies whose contacts just started report
   * CONTINUED events for hotSteps (rebounds, crushing, slow presses get measured); everything else stays cold.
   */
  private heatImpacts(count: number): void {
    const q = this.heatQueue;
    if (!this.adaptiveEvents) {
      q.length = 0;
      return;
    }
    const out = this.impactOut;
    for (let i = 0; i < count; i++) {
      this.heat(out[i].a);
      this.heat(out[i].b);
    }
    for (let i = 0; i < q.length; i++) if (!q[i].disposed && q[i].body._pluginData) this.heat(q[i]);
    q.length = 0;
  }

  // ---------------------------------------------------------------------------------- impulse estimate
  /**
   * Pre-step impulse estimate for a new contact between a and b at world point p with unit normal n (from a to b):
   * J ≈ (1+e)·v_n / (1/m_a + 1/m_b + |r_a×n|²/(m_a·k_a) + |r_b×n|²/(m_b·k_b)), v_n = approach speed of the two
   * contact points from the velocities cached at the start of this step (before Havok's solver changed them),
   * e = max restitution (Havok combines with MAXIMUM), k = mean per-unit-mass principal inertia. 0 when the points
   * are not approaching; NaN when a velocity is unknown (bodies not synced from the body buffer).
   */
  private estimateImpulse(a: BodyRec, b: BodyRec, px: number, py: number, pz: number, nx: number, ny: number, nz: number): number {
    this.estVn = 0;
    const ea = this.pointTerms(a, px, py, pz, nx, ny, nz, 1);
    if (ea !== ea) return NaN;
    const eb = this.pointTerms(b, px, py, pz, nx, ny, nz, -1);
    if (eb !== eb) return NaN;
    const vn = this.estVn;
    const inv = ea + eb;
    if (!(inv > 0)) return NaN; // two immovable bodies
    if (!(vn > 0)) return 0;
    const e = a.restitution > b.restitution ? a.restitution : b.restitution;
    const j = ((1 + e) * vn) / inv;
    return Number.isFinite(j) ? j : NaN;
  }

  /** Approach speed accumulator of estimateImpulse() (avoids returning tuples). */
  private estVn = 0;

  /**
   * One side of estimateImpulse(): adds sign·(point velocity · n) to estVn and returns the side's inverse effective
   * mass along n (0 for static/animated), or NaN when its velocity is unknown.
   */
  private pointTerms(rec: BodyRec, px: number, py: number, pz: number, nx: number, ny: number, nz: number, sign: number): number {
    if (rec.motion === STATIC || rec === this.worldRec) return 0;
    if (rec.fastSlot < 0 || rec.disposed) return NaN;
    const node = rec.body.transformNode;
    const q = node.rotationQuaternion;
    if (q === null) return NaN;
    // COM in world (the node still holds the pre-step pose: the sync runs after the impacts are aggregated)
    const c = this.tv3.set(rec.comX, rec.comY, rec.comZ).applyRotationQuaternionInPlace(q);
    let rx = px - node.position.x - c.x, ry = py - node.position.y - c.y, rz = pz - node.position.z - c.z;
    // lever arm sanity: contact points are on the surface, so |r| ≲ the body's half diagonal
    const rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
    const rmax = 1.5 * rec.radius + 0.01;
    if (rl > rmax) {
      const s = rmax / rl;
      rx *= s;
      ry *= s;
      rz *= s;
    }
    let resting = true;
    if (rec.vStep === this._stepIndex) {
      // v_point = v + ω × r
      const vx = rec.vx + rec.wy * rz - rec.wz * ry;
      const vy = rec.vy + rec.wz * rx - rec.wx * rz;
      const vz = rec.vz + rec.wx * ry - rec.wy * rx;
      this.estVn += sign * (vx * nx + vy * ny + vz * nz);
      resting = vx * vx + vy * vy + vz * vz < RESTING_SPEED * RESTING_SPEED;
    }
    if (rec.motion !== DYNAMIC || !(rec.mass > 0) || !Number.isFinite(rec.mass)) return 0;
    let inv = 1 / rec.mass;
    if (rec.kk > 0) {
      const cx = ry * nz - rz * ny, cy = rz * nx - rx * nz, cz = rx * ny - ry * nx;
      inv += (cx * cx + cy * cy + cz * cz) / (rec.mass * rec.kk);
    }
    if (resting && this.gravityY !== 0) {
      // a resting body pushed down (along gravity) is backed by whatever supports it (a box landing on a resting
      // box, a mug crushed against the floor): the support takes the load, so it acts much heavier along the
      // vertical. Pushed sideways it is free. The push on this side is −n for a (sign +1), +n for b.
      const c = -sign * ny * (this.gravityY < 0 ? -1 : 1);
      if (c > 0) inv *= 1 - Math.min(1, c * c);
    }
    return inv;
  }

  /** Substeps for this step: minimum, plus enough that no thin body moves more than fastThinSpeed·dt per substep. */
  private chooseSubsteps(): number {
    const lo = clampInt(this.minSubsteps, 1, 8);
    // bodies whose velocity was set / kicked between steps: refresh the velocity cache (impulse estimates, event
    // masks) and let thin ones drive the substep count right away (a struck shard's first step must not tunnel)
    let v = this.thinSpeed;
    if (this.velDirty.length > 0) {
      const vd = this.readDirtyVelocities();
      if (vd > v) v = vd;
    }
    if (!this.adaptiveSubsteps) {
      this.watch.length = 0;
      return lo;
    }
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
        else {
          if (type === EV_STARTED) {
            this.queueHeat(ra);
            this.queueHeat(rb);
          }
          // contact A: position f32[w+10..12], normal f32[w+13..15] (A→B); contact B: position f32[w+26..28]; impulse f32[w+34]
          agg.add(ra, rb, type === EV_STARTED ? EV_STARTED : EV_CONTINUED, f32[w + 10], f32[w + 11], f32[w + 12], f32[w + 26], f32[w + 27], f32[w + 28], f32[w + 13], f32[w + 14], f32[w + 15], f32[w + 34]);
        }
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
      if (type === EV_STARTED) {
        this.queueHeat(ra);
        this.queueHeat(rb);
      }
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
      const stillLin2 = linLim2 * STILL_FRACTION * STILL_FRACTION;
      const stillAng2 = angLim2 * STILL_FRACTION * STILL_FRACTION;
      const slowCap = SLEEP_FALLBACK * Math.max(1, Math.round(sa.seconds / dt));
      const wm = this.syncWorldMatrices;
      const invDt = 1 / dt;
      const step = this._stepIndex;
      const adaptive = this.adaptiveEvents;
      const hotSpeed = this.hotSpeed;
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
          // not moved (asleep, static, or perfectly still): velocity 0 (vStep goes stale), no work; perfectly still
          // counts as very slow (resting pile bodies are bit-identical now and then)
          rec.moved = false;
          if (rec.slow < slowCap) rec.slow += STILL_WEIGHT;
          if (adaptive && rec.mask === EVENT_MASK && rec.hotUntil < step) this.cool(rec, true);
          continue;
        }
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
        const q = node.rotationQuaternion!; // still the pre-step orientation
        // keep the sign continuous (q and −q are the same rotation; consumers may interpolate)
        if (q.x * qx + q.y * qy + q.z * qz + q.w * qw < 0) {
          qx = -qx;
          qy = -qy;
          qz = -qz;
          qw = -qw;
        }
        const dx = tx - prev[p + 9], dy = ty - prev[p + 10], dz = tz - prev[p + 11];
        if (rec.motion !== STATIC) {
          // ---- velocity cache. ω from Δq = q_new·q_old⁻¹ (world-frame rotation of this step): ω = axis·θ/dt
          const ox = -q.x, oy = -q.y, oz = -q.z, ow = q.w;
          const ex = qw * ox + qx * ow + qy * oz - qz * oy;
          const ey = qw * oy - qx * oz + qy * ow + qz * ox;
          const ez = qw * oz + qx * oy - qy * ox + qz * ow;
          const ew = qw * ow - qx * ox - qy * oy - qz * oz; // = q_new·q_old ≥ 0 after the sign fix
          const sn = Math.sqrt(ex * ex + ey * ey + ez * ez);
          const theta = sn > 1e-12 ? 2 * Math.atan2(sn, ew) : 0;
          const k = sn > 1e-12 ? (theta / sn) * invDt : 2 * invDt;
          const wx = ex * k, wy = ey * k, wz = ez * k;
          // linear: COM displacement / dt (origin displacement + change of the rotated COM offset — exact for any
          // spin). Under gravity Havok's integrator lags the end velocity by up to GRAVITY_LAG·|g|·dt (see constant).
          let vx = dx * invDt, vy = dy * invDt, vz = dz * invDt;
          const cx0 = rec.comX, cy0 = rec.comY, cz0 = rec.comZ;
          if (cx0 !== 0 || cy0 !== 0 || cz0 !== 0) {
            // c' = q·c·q⁻¹ for the new and the old orientation: c + w·t + q×t, t = 2·(q×c)
            const ux = 2 * (qy * cz0 - qz * cy0), uy = 2 * (qz * cx0 - qx * cz0), uz = 2 * (qx * cy0 - qy * cx0);
            const ox2 = q.x, oy2 = q.y, oz2 = q.z, ow2 = q.w;
            const vx2 = 2 * (oy2 * cz0 - oz2 * cy0), vy2 = 2 * (oz2 * cx0 - ox2 * cz0), vz2 = 2 * (ox2 * cy0 - oy2 * cx0);
            vx += (qw * ux + (qy * uz - qz * uy) - (ow2 * vx2 + (oy2 * vz2 - oz2 * vy2))) * invDt;
            vy += (qw * uy + (qz * ux - qx * uz) - (ow2 * vy2 + (oz2 * vx2 - ox2 * vz2))) * invDt;
            vz += (qw * uz + (qx * uy - qy * ux) - (ow2 * vz2 + (ox2 * vy2 - oy2 * vx2))) * invDt;
          }
          if (Number.isFinite(vx + vy + vz + wx + wy + wz)) {
            // keep this step's start velocity (what its collisions acted on); store the start of the next one
            if (rec.vStep === step) {
              rec.pvx = rec.vx;
              rec.pvy = rec.vy;
              rec.pvz = rec.vz;
              rec.pwx = rec.wx;
              rec.pwy = rec.wy;
              rec.pwz = rec.wz;
            } else rec.pvx = rec.pvy = rec.pvz = rec.pwx = rec.pwy = rec.pwz = 0;
            rec.pvStep = step;
            rec.vx = vx;
            rec.vy = vy;
            rec.vz = vz;
            rec.wx = wx;
            rec.wy = wy;
            rec.wz = wz;
            rec.vStep = step + 1;
            const sp = Math.sqrt(vx * vx + vy * vy + vz * vz) + Math.sqrt(wx * wx + wy * wy + wz * wz) * rec.radius;
            if (rec.thin && rec.motion === DYNAMIC && sp > thinSpeed) thinSpeed = sp;
            if (adaptive) {
              if (sp > hotSpeed) this.heat(rec);
              else if (rec.mask === EVENT_MASK && rec.hotUntil < step) this.cool(rec, true);
            }
          }
          // ---- sleep assist: count steps with per-step displacement and rotation angle below the thresholds;
          // practically still bodies (woken pile neighbours) count STILL_WEIGHT per step. sleepPass() decides.
          if (assist && rec.motion === DYNAMIC) {
            const d2 = dx * dx + dy * dy + dz * dz;
            const a2 = theta * theta;
            if (d2 < linLim2 && a2 < angLim2) {
              if (rec.slow < slowCap) rec.slow += d2 < stillLin2 && a2 < stillAng2 ? STILL_WEIGHT : 1;
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
        rec.movedStep = step;
        moved++;
        node.position.set(tx, ty, tz);
        q.set(qx, qy, qz, qw);
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

  /**
   * Island-coherent force-sleep (header "SLEEP ASSIST"). Havok deactivates whole islands: putting single bodies of an
   * active island to sleep is undone by their neighbours next step and the wake/sleep churn agitates the pile (measured:
   * 120-hull pile never slept, 3000 forced sleeps, spin up to 1.2 rad/s). So the awake dynamic bodies are grouped into
   * proximity components (bounding spheres around the COM touching, sweep-and-prune + union-find) and a component is
   * put to sleep only when EVERY member has been slow for `seconds` (kept-awake / jointed members block theirs).
   */
  private sleepPass(dt: number): void {
    const list = this.fast;
    const mem = this.sleepMem;
    mem.length = 0;
    // members: dynamic bodies that moved recently (awake; a resting body is bit-identical now and then)
    const recent = this._stepIndex - SLEEP_RECENT_STEPS;
    for (let i = 0; i < list.length; i++) {
      const rec = list[i];
      if (rec.movedStep >= recent && rec.motion === DYNAMIC && !rec.disposed) mem.push(rec);
    }
    const n = mem.length;
    if (n === 0) return;
    if (this.sleepPos.length < n * 4) {
      this.sleepPos = new Float64Array(n * 8);
      this.sleepOrder = new Int32Array(n * 2);
      this.sleepParent = new Int32Array(n * 2);
      this.sleepBlocked = new Uint8Array(n * 2);
      this.sleepSize = new Int32Array(n * 2);
    }
    const pos = this.sleepPos, order = this.sleepOrder, parent = this.sleepParent, blocked = this.sleepBlocked;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const rec = mem[i];
      const node = rec.body.transformNode;
      const q = node.rotationQuaternion!;
      const c = this.tv3.set(rec.comX, rec.comY, rec.comZ).applyRotationQuaternionInPlace(q).addInPlace(node.position);
      pos[i * 4] = c.x;
      pos[i * 4 + 1] = c.y;
      pos[i * 4 + 2] = c.z;
      pos[i * 4 + 3] = Math.max(rec.boundR, rec.radius, 0.02) + SLEEP_MARGIN;
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
      if (c.z < minZ) minZ = c.z;
      if (c.z > maxZ) maxZ = c.z;
      order[i] = i;
      parent[i] = i;
      blocked[i] = 0;
    }
    // sweep and prune along the axis of largest spread
    const axis = maxX - minX >= maxY - minY && maxX - minX >= maxZ - minZ ? 0 : maxY - minY >= maxZ - minZ ? 1 : 2;
    const ord = order.subarray(0, n);
    ord.sort((a, b) => pos[a * 4 + axis] - pos[a * 4 + 3] - (pos[b * 4 + axis] - pos[b * 4 + 3]));
    const sleepSteps = Math.max(1, Math.round(this.sleepAssist.seconds / dt));
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    for (let oi = 0; oi < n; oi++) {
      const i = ord[oi];
      const ri = pos[i * 4 + 3];
      const hiI = pos[i * 4 + axis] + ri;
      for (let oj = oi + 1; oj < n; oj++) {
        const j = ord[oj];
        const rj = pos[j * 4 + 3];
        if (pos[j * 4 + axis] - rj > hiI) break;
        const dx = pos[i * 4] - pos[j * 4], dy = pos[i * 4 + 1] - pos[j * 4 + 1], dz = pos[i * 4 + 2] - pos[j * 4 + 2];
        const rr = ri + rj;
        if (dx * dx + dy * dy + dz * dz <= rr * rr) {
          const a = find(i), b = find(j);
          if (a !== b) parent[a] = b;
        }
      }
    }
    const size = this.sleepSize;
    for (let i = 0; i < n; i++) size[i] = 0;
    for (let i = 0; i < n; i++) {
      const root = find(i);
      size[root]++;
      if (!this.sleepOk(mem[i], sleepSteps)) blocked[root] = 1;
    }
    const hk = this.hk;
    const INACTIVE = hk.ActivationState.INACTIVE;
    const fallback = SLEEP_FALLBACK * sleepSteps;
    for (let i = 0; i < n; i++) {
      const rec = mem[i];
      const root = find(i);
      // big piles are rarely calm everywhere at once: their members that stayed slow SLEEP_FALLBACK× longer freeze
      // individually (the calm bulk of a pile sleeps while a few bodies on top still jitter)
      if (blocked[root] && !(size[root] > SLEEP_BIG_COMPONENT && rec.slow >= fallback && this.sleepOk(rec, sleepSteps))) continue;
      if (rec.mask === EVENT_MASK) this.setMask(rec, COLD_MASK); // (setting a mask wakes: before sleeping)
      hk.HP_Body_SetActivationState(rec.hpId, INACTIVE);
      rec.slow = 0;
      this.forcedSleeps++;
    }
    mem.length = 0;
  }

  private sleepOk(rec: BodyRec, sleepSteps: number): boolean {
    return rec.slow >= sleepSteps && !rec.keepAwake && rec.joints === null;
  }

  private readonly sleepMem: BodyRec[] = [];
  private sleepPos = new Float64Array(0);
  private sleepOrder = new Int32Array(0);
  private sleepParent = new Int32Array(0);
  private sleepBlocked = new Uint8Array(0);
  private sleepSize = new Int32Array(0);

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
    this.seedPrev(rec);
  }

  /** Copy the body's current Havok transform into its sync baseline (the next sync must not count it as motion). */
  private seedPrev(rec: BodyRec): void {
    if (rec.fastSlot < 0 || !rec.body._pluginData) return;
    this.views();
    const f32 = this.f32;
    const o = (this.hk.HP_World_GetBodyBuffer(this.world)[1] >> 2) + (rec.offset >> 2);
    const p = rec.fastSlot * 12;
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
    // adaptive masks: cold (STARTED|FINISHED) until the body is fast or in a contact start/impact (see header)
    const mask = this.adaptiveEvents ? COLD_MASK : EVENT_MASK;
    body.setEventMask(mask);
    rec.mask = mask;
    if (mask === EVENT_MASK) this.hotCount++;
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
    rec.restitution = this.restitutionOf(shape, 0);
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
      rec.vStep = rec.pvStep = -1;
      // a hot static body would make every contact with it report CONTINUED events (either-body rule)
      if (mt === STATIC && this.adaptiveEvents && rec.mask === EVENT_MASK) this.setMask(rec, COLD_MASK);
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

  /**
   * Force-sleep policy (see header): dynamic, unjointed, not-kept-awake bodies slower than `linear` (m/s) and
   * `angular` (rad/s) for `seconds` are deactivated (they still wake on contact); practically still bodies count
   * 4× faster. Omitted thresholds keep their current values. Defaults: on, 0.08 m/s, 0.2 rad/s, 0.6 s.
   */
  setAutoSleep(enabled: boolean, thresholds: { linear?: number; angular?: number; seconds?: number } = {}): void {
    const sa = this.sleepAssist;
    sa.enabled = !!enabled;
    if (thresholds.linear !== undefined && thresholds.linear >= 0 && Number.isFinite(thresholds.linear)) sa.linear = thresholds.linear;
    if (thresholds.angular !== undefined && thresholds.angular >= 0 && Number.isFinite(thresholds.angular)) sa.angular = thresholds.angular;
    if (thresholds.seconds !== undefined && thresholds.seconds > 0 && Number.isFinite(thresholds.seconds)) sa.seconds = thresholds.seconds;
    for (const rec of this.fast) rec.slow = 0;
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
    const rec = this.recs.get(body);
    if (resetVelocity && (rec?.motion ?? body.getMotionType()) !== STATIC) {
      this.hk.HP_Body_SetLinearVelocity(id, [0, 0, 0]);
      this.hk.HP_Body_SetAngularVelocity(id, [0, 0, 0]);
    }
    node.computeWorldMatrix(true);
    if (rec) {
      // the jump is not motion: re-seed the sync baseline (else the next sync sees distance/dt as speed — forced
      // substeps for thin bodies, a reset sleep counter, a bogus velocity cache)
      this.seedPrev(rec);
      rec.vStep = rec.pvStep = -1; // velocity 0 from here (resetVelocity) …
      if (!resetVelocity) this.touchVelocity(body); // … or re-read from Havok before the next step
    }
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
    if (rec.mask === EVENT_MASK) this.hotCount--;
    rec.mask = 0;
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
    const com = props[0];
    if (Number.isFinite(com[0] + com[1] + com[2])) {
      rec.comX = com[0];
      rec.comY = com[1];
      rec.comZ = com[2];
    } else rec.comX = rec.comY = rec.comZ = 0;
    const shp = rec.body.shape;
    if (shp && shp._pluginData !== undefined) {
      const bb = hk.HP_Shape_GetBoundingBox(shp._pluginData, IDENTITY_QT)[1];
      const mn = bb[0], mx = bb[1];
      const ex = Math.max(Math.abs(mx[0] - rec.comX), Math.abs(mn[0] - rec.comX));
      const ey = Math.max(Math.abs(mx[1] - rec.comY), Math.abs(mn[1] - rec.comY));
      const ez = Math.max(Math.abs(mx[2] - rec.comZ), Math.abs(mn[2] - rec.comZ));
      const br = Math.sqrt(ex * ex + ey * ey + ez * ez);
      rec.boundR = Number.isFinite(br) ? br : 0;
    }
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
      rec.kk = I;
    } else rec.kk = (inertia[0] + inertia[1] + inertia[2]) / 3;
    rec.mass = m;
  }

  // ================================================================================== shapes
  /** Convex hull from packed xyz points in the body frame (raw Havok, no temporary mesh). */
  hullShape(points: Float32Array | ArrayLike<number>, opts?: ShapeOpts): PhysicsShape {
    this.alive();
    const t0 = now();
    const n = Math.floor(points.length / 3);
    if (n < 1 || points.length !== n * 3) throw new Error(`hullShape: expected packed xyz triples, got ${points.length} floats`);
    for (let i = 0; i < points.length; i++) if (!Number.isFinite(points[i])) throw new Error("hullShape: non-finite coordinate");
    this.hullKind = "hull";
    const shape = this.prepareHull(points, n);
    this.shapes.set(shape, newInfo(this.hullKind));
    this.applyLeafOpts(shape, opts);
    const ms = now() - t0;
    this.hullCount++;
    this.hullMsLast = ms;
    this.hullMsEma = this.hullCount === 1 ? ms : this.hullMsEma + (ms - this.hullMsEma) * 0.05;
    this.hullInLast = n;
    return shape;
  }

  /** Kind of the shape the last prepareHull() produced. */
  private hullKind: ShapeInfo["kind"] = "hull";
  /** Principal axes (rows) and frame extents of the current hull input. */
  private readonly hullAxes = new Float64Array(9);
  private readonly hullLo = new Float64Array(3);
  private readonly hullHi = new Float64Array(3);

  /**
   * Hull input → Havok shape (header "HULLS"): principal frame → (a) the points fill their box (all 8 corners
   * present, in the principal or the body frame) → box; (b) degenerate (≥ 2 extents < minHullThickness: segment,
   * point) → box of clamped size; (c) planar → in-plane support points extruded to minHullThickness; (d) more than
   * maxHullPoints → k-DOP support points; (e) else the points as they are.
   */
  private prepareHull(pts: Float32Array | ArrayLike<number>, n: number): PhysicsShape {
    // ---- centroid, covariance, principal axes
    let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < n; i++) {
      mx += pts[i * 3];
      my += pts[i * 3 + 1];
      mz += pts[i * 3 + 2];
    }
    mx /= n;
    my /= n;
    mz /= n;
    let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0;
    for (let i = 0; i < n; i++) {
      const dx = pts[i * 3] - mx, dy = pts[i * 3 + 1] - my, dz = pts[i * 3 + 2] - mz;
      cxx += dx * dx;
      cxy += dx * dy;
      cxz += dx * dz;
      cyy += dy * dy;
      cyz += dy * dz;
      czz += dz * dz;
    }
    const ax = this.hullAxes;
    principalAxes(cxx, cxy, cxz, cyy, cyz, czz, ax);
    const lo = this.hullLo, hi = this.hullHi;
    frameExtents(pts, n, ax, lo, hi);
    const thick = this.minHullThickness;
    const ext0 = hi[0] - lo[0], ext1 = hi[1] - lo[1], ext2 = hi[2] - lo[2];
    const maxExt = Math.max(ext0, ext1, ext2);
    const tol = Math.max(5e-4, 0.005 * maxExt);
    // ---- (a) box-shaped input (planks, slabs, bricks, intact box parts of a dented buffer)
    if (n >= 4 && boxCornersPresent(pts, n, ax, lo, hi, tol)) return this.frameBox(ax, lo, hi, thick);
    // the principal frame is arbitrary for cubes / squares: also try the body axes
    const alo = this.boxLo, ahi = this.boxHi;
    frameExtents(pts, n, AXES_IDENTITY, alo, ahi);
    if (n >= 4 && boxCornersPresent(pts, n, AXES_IDENTITY, alo, ahi, tol)) return this.frameBox(AXES_IDENTITY, alo, ahi, thick);
    // ---- (b)/(c) degenerate inputs: Havok inflates them by its convex radius (a zero-thickness 10 cm square
    // weighed 2 kg) or gives ~0 volume (clamped to minDynamicMass) — make them minHullThickness thick instead
    const thinAxis = ext0 <= ext1 && ext0 <= ext2 ? 0 : ext1 <= ext2 ? 1 : 2;
    const thinCount = (ext0 < thick ? 1 : 0) + (ext1 < thick ? 1 : 0) + (ext2 < thick ? 1 : 0);
    if (thinCount >= 2) {
      this.hullThickened++;
      return this.frameBox(ax, lo, hi, thick);
    }
    if (thinCount === 1) {
      this.hullThickened++;
      return this.planarHull(pts, n, thinAxis, thick);
    }
    if (n <= 8 && n <= this.maxHullPoints) {
      this.hullOutLast = n;
      return this.rawHull(pts, n);
    }
    // ---- candidates: distinct support points along the k-DOP + Fibonacci directions (principal frame, normalised)
    const norm = this.normalised(pts, n, ax, lo, hi);
    const cand = this.hullCand;
    const m = selectSupport(norm, n, 3, KDOP_DIRS, cand.length, cand);
    // (a') box test in the frame of the support points: uneven point density (face points of one side) tilts the
    // principal axes of the whole cloud, while the supports of a box are its corners
    if (m >= 8) {
      let sx = 0, sy = 0, sz = 0;
      for (let i = 0; i < m; i++) {
        const j = cand[i] * 3;
        sx += pts[j];
        sy += pts[j + 1];
        sz += pts[j + 2];
      }
      sx /= m;
      sy /= m;
      sz /= m;
      let qxx = 0, qxy = 0, qxz = 0, qyy = 0, qyz = 0, qzz = 0;
      for (let i = 0; i < m; i++) {
        const j = cand[i] * 3;
        const dx = pts[j] - sx, dy = pts[j + 1] - sy, dz = pts[j + 2] - sz;
        qxx += dx * dx;
        qxy += dx * dy;
        qxz += dx * dz;
        qyy += dy * dy;
        qyz += dy * dz;
        qzz += dz * dz;
      }
      const ax2 = this.hullAxes2;
      principalAxes(qxx, qxy, qxz, qyy, qyz, qzz, ax2);
      frameExtents(pts, n, ax2, alo, ahi);
      if (boxCornersPresent(pts, n, ax2, alo, ahi, tol)) return this.frameBox(ax2, alo, ahi, thick);
    }
    // ---- (d) more than maxHullPoints: keep a well-spread subset of the supports (farthest-point sampling in the
    // normalised frame, seeded with the outermost support) — round shapes keep their roundness, boxy ones their corners
    const max = this.maxHullPoints;
    if (n <= max) {
      this.hullOutLast = n;
      return this.rawHull(pts, n);
    }
    const k = farthestSubset(norm, cand, m, max, this.hullSel, this.hullDist);
    const sel = this.hullSel;
    const out = this.hullOut;
    for (let i = 0; i < k; i++) {
      const j = sel[i] * 3;
      out[i * 3] = pts[j];
      out[i * 3 + 1] = pts[j + 1];
      out[i * 3 + 2] = pts[j + 2];
    }
    this.hullOutLast = k;
    return this.rawHull(out.subarray(0, k * 3), k);
  }

  private readonly hullAxes2 = new Float64Array(9);
  private readonly hullCand = new Int32Array(KDOP_COUNT);
  private readonly hullDist = new Float64Array(KDOP_COUNT);

  private readonly boxLo = new Float64Array(3);
  private readonly boxHi = new Float64Array(3);

  /** Box spanning [lo, hi] in the frame with axes `ax` (rows), every size at least `minSize`. */
  private frameBox(ax: Float64Array, lo: Float64Array, hi: Float64Array, minSize: number): PhysicsShape {
    const m0 = 0.5 * (lo[0] + hi[0]), m1 = 0.5 * (lo[1] + hi[1]), m2 = 0.5 * (lo[2] + hi[2]);
    const cx = ax[0] * m0 + ax[3] * m1 + ax[6] * m2;
    const cy = ax[1] * m0 + ax[4] * m1 + ax[7] * m2;
    const cz = ax[2] * m0 + ax[5] * m1 + ax[8] * m2;
    const e0 = this.tv0.set(ax[0], ax[1], ax[2]), e1 = this.tv1.set(ax[3], ax[4], ax[5]), e2 = this.tv2.set(ax[6], ax[7], ax[8]);
    const q = Quaternion.RotationQuaternionFromAxisToRef(e0, e1, e2, this.tq1);
    const sx = Math.max(hi[0] - lo[0], minSize), sy = Math.max(hi[1] - lo[1], minSize), sz = Math.max(hi[2] - lo[2], minSize);
    this.hullBoxes++;
    this.hullKind = "box";
    this.hullOutLast = 8;
    return this.makeBox(cx, cy, cz, q, sx, sy, sz);
  }

  /** Planar input: in-plane support points, each emitted twice at ±thick/2 about the mid-plane. */
  private planarHull(pts: Float32Array | ArrayLike<number>, n: number, thinAxis: number, thick: number): PhysicsShape {
    const ax = this.hullAxes, lo = this.hullLo, hi = this.hullHi;
    const a = thinAxis === 0 ? 1 : 0, b = thinAxis === 2 ? 1 : 2;
    const norm = this.normalised(pts, n, ax, lo, hi);
    // pack the two in-plane normalised coordinates for the 2D support search
    const flat = this.hullFlat.length >= n * 2 ? this.hullFlat : (this.hullFlat = new Float64Array(n * 2 + 64));
    for (let i = 0; i < n; i++) {
      flat[i * 2] = norm[i * 3 + a];
      flat[i * 2 + 1] = norm[i * 3 + b];
    }
    const sel = this.hullSel;
    const k = selectSupport(flat, n, 2, PLANAR_DIRS, Math.max(3, Math.floor(this.maxHullPoints / 2)), sel);
    const tx = ax[thinAxis * 3], ty = ax[thinAxis * 3 + 1], tz = ax[thinAxis * 3 + 2];
    const mid = 0.5 * (lo[thinAxis] + hi[thinAxis]);
    const out = this.hullOut;
    for (let i = 0; i < k; i++) {
      const j = sel[i] * 3;
      const px = pts[j], py = pts[j + 1], pz = pts[j + 2];
      const d = mid - (px * tx + py * ty + pz * tz);
      for (let s = 0; s < 2; s++) {
        const off = d + (s === 0 ? -0.5 : 0.5) * thick;
        const o = (i * 2 + s) * 3;
        out[o] = px + tx * off;
        out[o + 1] = py + ty * off;
        out[o + 2] = pz + tz * off;
      }
    }
    this.hullOutLast = k * 2;
    return this.rawHull(out.subarray(0, k * 6), k * 2);
  }

  private hullFlat = new Float64Array(512);

  /** Points in the frame's normalised coordinates (−1..1 per axis; flat axes map to 0). */
  private normalised(pts: Float32Array | ArrayLike<number>, n: number, ax: Float64Array, lo: Float64Array, hi: Float64Array): Float64Array {
    if (this.hullNorm.length < n * 3) this.hullNorm = new Float64Array(n * 3 + 192);
    const norm = this.hullNorm;
    for (let k = 0; k < 3; k++) {
      const mid = 0.5 * (lo[k] + hi[k]);
      const half = 0.5 * (hi[k] - lo[k]);
      const inv = half > 1e-9 ? 1 / half : 0;
      const ex = ax[k * 3], ey = ax[k * 3 + 1], ez = ax[k * 3 + 2];
      for (let i = 0; i < n; i++) norm[i * 3 + k] = (pts[i * 3] * ex + pts[i * 3 + 1] * ey + pts[i * 3 + 2] * ez - mid) * inv;
    }
    return norm;
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
    const shape = this.makeBox(center.x, center.y, center.z, q, sx, sy, sz);
    this.shapes.set(shape, newInfo("box"));
    this.applyLeafOpts(shape, opts);
    return shape;
  }

  /** Box geometry → Havok box, or an 8-point hull below the tunnelling size threshold (see header). */
  private makeBox(cx: number, cy: number, cz: number, q: Quaternion, sx: number, sy: number, sz: number): PhysicsShape {
    const lo = Math.min(sx, sy, sz), hi = Math.max(sx, sy, sz);
    const mid = sx + sy + sz - lo - hi;
    if (hi < 0.1 || mid < 0.05) {
      const pts = this.boxPts;
      const c = this.tv3;
      let k = 0;
      for (let ix = -1; ix <= 1; ix += 2)
        for (let iy = -1; iy <= 1; iy += 2)
          for (let iz = -1; iz <= 1; iz += 2) {
            c.set(ix * sx * 0.5, iy * sy * 0.5, iz * sz * 0.5).applyRotationQuaternionInPlace(q);
            pts[k++] = c.x + cx;
            pts[k++] = c.y + cy;
            pts[k++] = c.z + cz;
          }
      return this.rawHull(pts, 8);
    }
    return new PhysicsShapeBox(this.tv3.set(cx, cy, cz), q, this.tv2.set(sx, sy, sz), this.scene);
  }

  private readonly boxPts = new Float32Array(24);

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

  /** Largest leaf restitution of a shape (from our shape records; Havok combines restitution with MAXIMUM). */
  private restitutionOf(shape: PhysicsShape, depth: number): number {
    const info = this.shapes.get(shape);
    if (!info) return 0;
    if (!info.children) return info.restitution;
    let e = 0;
    if (depth < 8) for (const k of info.children) e = Math.max(e, this.restitutionOf(k, depth + 1));
    return e;
  }

  private setMaterial(shape: PhysicsShape, friction: number, restitution: number): void {
    const mu = Number.isFinite(friction) ? Math.min(Math.max(friction, 0), 2) : DEFAULT_FRICTION;
    const e = Number.isFinite(restitution) ? Math.min(Math.max(restitution, 0), 1) : DEFAULT_RESTITUTION;
    const info = this.shapes.get(shape);
    if (info) info.restitution = e;
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
    this.trackedJoints.delete(j);
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
   * Impulse the solver applied through `c` during the last fixed step, summed over all of its substeps (Havok itself
   * only keeps the last world step's impulses): linear (N·s) and angular (N·m·s) in world space, plus that step's
   * dt — force = linear / dt. The first query of a joint after a multi-substep step can only see the last substep and
   * scales it by the substep count; from then on the joint is tracked and summed exactly every step.
   * Writes into `out` when given (allocation-free polling).
   */
  appliedImpulse(c: PhysicsConstraint, out?: ConstraintImpulse): ConstraintImpulse {
    const res = out ?? { linear: new Vector3(), angular: new Vector3(), dt: 0 };
    res.linear.setAll(0);
    res.angular.setAll(0);
    res.dt = this.plugin.getTimeStep();
    const pd = c._pluginData as HP_Id[] | undefined;
    if (!pd || pd.length === 0) return res;
    const j = this.joints.get(c);
    const n = this.substepsLast;
    if (j && n > 1 && j.accStep === this._stepIndex - 1) {
      const a = j.acc;
      res.linear.set(a[0], a[1], a[2]);
      res.angular.set(a[3], a[4], a[5]);
    } else {
      const r = this.hk.HP_Constraint_GetAppliedImpulses(pd[0]);
      const l = r[1], t = r[2];
      if (Number.isFinite(l[0] + l[1] + l[2] + t[0] + t[1] + t[2])) {
        res.linear.set(l[0] * n, l[1] * n, l[2] * n);
        res.angular.set(t[0] * n, t[1] * n, t[2] * n);
      }
    }
    if (j && !j.tracked) {
      j.tracked = true;
      this.trackedJoints.add(j);
    }
    return res;
  }

  /**
   * Constraint load during the last fixed step: average linear force (N) and torque (N·m) magnitudes over all its
   * substeps (see appliedImpulse). Joint bonds use this to fail under sustained pulls (rip doors off their hinges).
   */
  constraintLoad(c: PhysicsConstraint): { force: number; torque: number } {
    const r = this.appliedImpulse(c, this.loadScratch);
    const dt = r.dt > 0 ? r.dt : 1 / 60;
    return { force: r.linear.length() / dt, torque: r.angular.length() / dt };
  }

  private readonly loadScratch: ConstraintImpulse = { linear: new Vector3(), angular: new Vector3(), dt: 0 };

  /** After each substep of a multi-substep step: add the tracked joints' applied impulses (first substep resets). */
  private accumulateJointImpulses(first: boolean): void {
    const hk = this.hk;
    const step = this._stepIndex;
    for (const j of this.trackedJoints) {
      const pd = j.c._pluginData as HP_Id[] | undefined;
      const a = j.acc;
      if (first || j.accStep !== step) {
        a.fill(0);
        j.accStep = step;
      }
      if (!pd || pd.length === 0) continue;
      const r = hk.HP_Constraint_GetAppliedImpulses(pd[0]);
      const l = r[1], t = r[2];
      if (!Number.isFinite(l[0] + l[1] + l[2] + t[0] + t[1] + t[2])) continue;
      a[0] += l[0];
      a[1] += l[1];
      a[2] += l[2];
      a[3] += t[0];
      a[4] += t[1];
      a[5] += t[2];
    }
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
    const j: JointRec = { c, kind, a: ra, b: rb, pivotA: pivotA.clone(), pivotB: pivotB.clone(), axisA: axA, axisB: axB, perpA, perpB, tracked: false, accStep: -1, acc: new Float64Array(6) };
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
      hotBodies: this.hotCount,
      earlyImpacts: this.agg.earlyEmitted,
      hullCount: this.hullCount,
      hullMsAvg: this.hullMsEma,
      hullMsLast: this.hullMsLast,
      hullPointsInLast: this.hullInLast,
      hullPointsOutLast: this.hullOutLast,
      hullBoxes: this.hullBoxes,
      hullThickened: this.hullThickened,
      havokMs: this.tHavok,
      eventsMs: this.tEvents,
      syncMs: this.tSync,
      impactsMs: this.tImpacts,
    };
  }

  get disposed(): boolean {
    return this._disposed;
  }

  /**
   * Dispose every body made by createBody (their nodes stay), the world body and internal resources, then disable
   * the scene's physics engine. Foreign bodies (made directly with Babylon) must be disposed before this.
   */
  dispose(): void {
    this.release(true);
  }

  private release(disableEngine: boolean): void {
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
    // dispose every body we created (joints and owned containers go with them) so that later node disposal never
    // touches a released world; nodes and leaf shapes stay with their owners
    for (const rec of [...this.own]) if (rec !== this.worldRec) this.disposeBody(rec.body);
    this.byId.clear();
    if (!this.worldBody.isDisposed) this.worldBody.dispose();
    this.worldBody.transformNode.dispose();
    if (disableEngine) {
      // (on the scene-dispose path we are inside that observable's notification: removing would splice its array
      // mid-iteration; the scene clears it anyway)
      this.sceneDisposeObs?.remove();
      if (this.scene.getPhysicsEngine() === (this.engine as unknown)) this.scene.disablePhysicsEngine();
    }
  }

  private alive(): void {
    if (this._disposed) throw new Error("physics: system is disposed");
  }
}

// ---------------------------------------------------------------------------------------------- helpers
const AXES_IDENTITY = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

/** Support directions in a frame's normalised coordinates: 8 corners, 6 faces, 12 edges, then a 40-point Fibonacci
 *  sphere (66 in all: enough distinct candidates to pick a well-spread subset of up to 64). */
const KDOP_DIRS: Float64Array = (() => {
  const d: number[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) d.push(x, y, z);
  d.push(1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1);
  for (const [i, j] of [
    [0, 1],
    [0, 2],
    [1, 2],
  ])
    for (const a of [-1, 1])
      for (const b of [-1, 1]) {
        const v = [0, 0, 0];
        v[i] = a;
        v[j] = b;
        d.push(v[0], v[1], v[2]);
      }
  const m = 40;
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < m; k++) {
    const y = 1 - (2 * (k + 0.5)) / m;
    const r = Math.sqrt(1 - y * y);
    d.push(Math.cos(ga * k) * r, y, Math.sin(ga * k) * r);
  }
  return new Float64Array(d);
})();

const KDOP_COUNT = KDOP_DIRS.length / 3;

/** 2D support directions (planar hulls): 4 corners, 4 edges, then 56 evenly spread angles. */
const PLANAR_DIRS: Float64Array = (() => {
  const d: number[] = [1, 1, 1, -1, -1, 1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1];
  const m = 56;
  for (let k = 0; k < m; k++) d.push(Math.cos(((k + 0.5) * 2 * Math.PI) / m), Math.sin(((k + 0.5) * 2 * Math.PI) / m));
  return new Float64Array(d);
})();

/**
 * Up to `max` distinct support points of `n` points (`dim` coordinates each, packed) along `dirs` in order; writes
 * point indices into `sel`, returns how many.
 */
function selectSupport(c: Float64Array, n: number, dim: number, dirs: Float64Array, max: number, sel: Int32Array): number {
  let k = 0;
  const nd = dirs.length / dim;
  for (let d = 0; d < nd && k < max; d++) {
    const o = d * dim;
    const dx = dirs[o], dy = dirs[o + 1], dz = dim === 3 ? dirs[o + 2] : 0;
    let best = -1;
    let bv = -Infinity;
    for (let i = 0; i < n; i++) {
      const j = i * dim;
      const v = dim === 3 ? c[j] * dx + c[j + 1] * dy + c[j + 2] * dz : c[j] * dx + c[j + 1] * dy;
      if (v > bv + 1e-12) {
        bv = v;
        best = i;
      }
    }
    if (best < 0) break;
    let dup = false;
    for (let s = 0; s < k; s++) if (sel[s] === best) dup = true;
    if (!dup) sel[k++] = best;
  }
  return k;
}

/**
 * Farthest-point sampling: up to `max` of the `m` candidate point indices (normalised coordinates `c`, 3 per point),
 * starting with the one farthest from the origin, each next one farthest from those already chosen. Writes indices
 * into `sel`; returns how many.
 */
function farthestSubset(c: Float64Array, cand: Int32Array, m: number, max: number, sel: Int32Array, dist: Float64Array): number {
  if (m <= max) {
    for (let i = 0; i < m; i++) sel[i] = cand[i];
    return m;
  }
  let first = 0;
  let best = -1;
  for (let i = 0; i < m; i++) {
    const j = cand[i] * 3;
    const d = c[j] * c[j] + c[j + 1] * c[j + 1] + c[j + 2] * c[j + 2];
    if (d > best) {
      best = d;
      first = i;
    }
    dist[i] = Infinity;
  }
  let k = 0;
  let pick = first;
  while (k < max) {
    sel[k++] = cand[pick];
    const pj = cand[pick] * 3;
    const px = c[pj], py = c[pj + 1], pz = c[pj + 2];
    dist[pick] = -1;
    let next = -1;
    let nd = -1;
    for (let i = 0; i < m; i++) {
      if (dist[i] < 0) continue;
      const j = cand[i] * 3;
      const dx = c[j] - px, dy = c[j + 1] - py, dz = c[j + 2] - pz;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < dist[i]) dist[i] = d;
      if (dist[i] > nd) {
        nd = dist[i];
        next = i;
      }
    }
    if (next < 0) break;
    pick = next;
  }
  return k;
}

/** Eigenvectors of the symmetric 3×3 covariance (cyclic Jacobi) → rows of `out`, a right-handed orthonormal frame. */
function principalAxes(cxx: number, cxy: number, cxz: number, cyy: number, cyz: number, czz: number, out: Float64Array): void {
  const A = [cxx, cxy, cxz, cxy, cyy, cyz, cxz, cyz, czz];
  const V = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const scale = cxx * cxx + cyy * cyy + czz * czz;
  for (let sweep = 0; sweep < 24; sweep++) {
    const off = A[1] * A[1] + A[2] * A[2] + A[5] * A[5];
    if (!(off > 1e-24 * scale) || !(off > 1e-300)) break;
    for (let r = 0; r < 3; r++) {
      const p = r === 2 ? 1 : 0, q = r === 0 ? 1 : 2;
      const apq = A[p * 3 + q];
      if (Math.abs(apq) < 1e-300) continue;
      const theta = (A[q * 3 + q] - A[p * 3 + p]) / (2 * apq);
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = A[k * 3 + p], akq = A[k * 3 + q];
        A[k * 3 + p] = c * akp - s * akq;
        A[k * 3 + q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = A[p * 3 + k], aqk = A[q * 3 + k];
        A[p * 3 + k] = c * apk - s * aqk;
        A[q * 3 + k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = V[k * 3 + p], vkq = V[k * 3 + q];
        V[k * 3 + p] = c * vkp - s * vkq;
        V[k * 3 + q] = s * vkp + c * vkq;
      }
    }
  }
  // eigenvectors are V's columns; e2 = e0 × e1 makes the frame right-handed (a proper rotation)
  const e0x = V[0], e0y = V[3], e0z = V[6];
  const e1x = V[1], e1y = V[4], e1z = V[7];
  const l0 = Math.hypot(e0x, e0y, e0z) || 1, l1 = Math.hypot(e1x, e1y, e1z) || 1;
  out[0] = e0x / l0;
  out[1] = e0y / l0;
  out[2] = e0z / l0;
  out[3] = e1x / l1;
  out[4] = e1y / l1;
  out[5] = e1z / l1;
  out[6] = out[1] * out[5] - out[2] * out[4];
  out[7] = out[2] * out[3] - out[0] * out[5];
  out[8] = out[0] * out[4] - out[1] * out[3];
  if (!Number.isFinite(out[0] + out[1] + out[2] + out[3] + out[4] + out[5] + out[6] + out[7] + out[8])) out.set(AXES_IDENTITY);
}

/** Per-axis min/max of the points' coordinates in the frame with axes `ax` (rows). */
function frameExtents(pts: Float32Array | ArrayLike<number>, n: number, ax: Float64Array, lo: Float64Array, hi: Float64Array): void {
  for (let k = 0; k < 3; k++) {
    const ex = ax[k * 3], ey = ax[k * 3 + 1], ez = ax[k * 3 + 2];
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = pts[i * 3] * ex + pts[i * 3 + 1] * ey + pts[i * 3 + 2] * ez;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    lo[k] = mn;
    hi[k] = mx;
  }
}

/**
 * True when every corner of the frame box [lo, hi] has an input point within `tol` (per axis): the points then lie
 * in the box and contain its corners, so their convex hull IS the box (within tol).
 */
function boxCornersPresent(pts: Float32Array | ArrayLike<number>, n: number, ax: Float64Array, lo: Float64Array, hi: Float64Array, tol: number): boolean {
  let found = 0;
  for (let i = 0; i < n && found !== 255; i++) {
    let lowMask = 0, highMask = 0;
    for (let k = 0; k < 3; k++) {
      const v = pts[i * 3] * ax[k * 3] + pts[i * 3 + 1] * ax[k * 3 + 1] + pts[i * 3 + 2] * ax[k * 3 + 2];
      if (v - lo[k] <= tol) lowMask |= 1 << k;
      if (hi[k] - v <= tol) highMask |= 1 << k;
    }
    if (((lowMask | highMask) & 7) !== 7) continue;
    // every corner whose bit pattern (1 = high side) this point is near
    for (let corner = 0; corner < 8; corner++) {
      let ok = true;
      for (let k = 0; k < 3 && ok; k++) ok = (corner >> k) & 1 ? ((highMask >> k) & 1) === 1 : ((lowMask >> k) & 1) === 1;
      if (ok) found |= 1 << corner;
    }
  }
  return found === 255;
}

function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.round(Number.isFinite(v) ? v : lo);
  return n < lo ? lo : n > hi ? hi : n;
}

/** A deterministic unit vector perpendicular to unit vector a. */
function anyPerpendicular(a: Vector3): Vector3 {
  const ref = Math.abs(a.x) < 0.9 ? Vector3.Right() : Vector3.Up();
  return Vector3.Cross(a, ref).normalize();
}
