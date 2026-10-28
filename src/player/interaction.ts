// Hands-on interaction: crosshair target, physics grab/hold, throw, slam, pull on anchored or
// jointed islands, and the use key.
//
// HOLD MECHANISM (dynamic islands). The grab point P (fixed in the body frame, where the ray hit)
// is driven towards a target T in front of the camera by a force-capped "velocity servo":
//   v_des = v_T + (T − P)/τ            (τ ≈ 75 ms, clamped)
//   J     = β · K⁻¹ (v_des − v_P) + m g dt ŷ      applied AT P
//   |J|  ≤ F_max · dt                  (F_max = 450 N lift strength, 1400 N during a slam)
// where K = (1/m)·E − [r]× I⁻¹ [r]× is the point effective-mass matrix (r = P − COM), so the
// servo is stable for any grab offset and mass, and gravity compensation acting at P makes the
// body hang naturally below the grab point. Objects heavier than F_max/g (≈ 46 kg) can't be
// lifted: they are dragged and tilted. While held, the body is ALWAYS_ACTIVE, angular damping is
// raised, and its leaf shapes are moved to the HELD collision layer (no collision with the
// player capsule, ignored by tool sweeps) — restored shortly after release.
//
// ANCHORED/JOINTED islands (wall cabinets, doors, toilet lids): the grab point stays where it is
// (static) or swings with the joint (dynamic), and the actual spring force is passed every fixed
// step to `destruction.pull(...)`, which stresses hinges / world bonds until they give.

import {
  PhysicsActivationControl,
  PhysicsMotionType,
  PhysicsShapeType,
  Quaternion,
  Vector3,
  type HavokPlugin,
  type PhysicsBody,
  type PhysicsShape,
} from "@babylonjs/core";
import { Layer, type GameContext, type RayHit, type TargetInfo, type ToolId } from "../core/context.ts";

export type CrosshairState = "default" | "grab" | "pry" | "use" | "hold";

/** Per-step view of the player handed to the interaction logic. */
export interface InteractionView {
  eye: Vector3;
  forward: Vector3;
  right: Vector3;
  up: Vector3;
  /** Player velocity (m/s). */
  velocity: Vector3;
  /** The player's own physics body (ignored by queries). */
  playerBody: PhysicsBody | null;
  /** Body currently under the player's feet (null in the air). */
  support: PhysicsBody | null;
  tool: ToolId;
}

export const REACH = 2.6;
export const PRY_REACH = 1.3;
export const LIFT_FORCE = 450; // N
export const SLAM_FORCE = 1400; // N
export const HOLD_MIN = 0.6;
export const HOLD_MAX = 2.5;
export const THROW_MAX_ENERGY = 250; // J
export const THROW_MAX_SPEED = 16; // m/s
/** Fraction of the max throw energy for a quick tap (no charge). */
const THROW_TAP_FRACTION = 0.2;
const CHARGE_DELAY = 0.2; // s before charge starts building
const CHARGE_FULL = 1.0; // s held for a full throw
const DROP_STRETCH = 1.2; // m between grab point and hold target → hand slips
const DROP_STRETCH_TIME = 0.3; // s
const SLAM_TIME = 0.15; // s
const SLAM_COOLDOWN = 0.45; // s
const HOLD_ANG_DAMPING = 4;
const SERVO_TAU = 0.075; // s
const SERVO_TAU_SLAM = 0.045;
const SERVO_BETA = 0.55;
const SERVO_MAX_REL_SPEED = 12; // m/s
const STATIC_SPRING_K = 2000; // N/m for pulling on anchored islands
const ROTATE_RAD_PER_PX = 0.006;
const ROTATE_MAX_TORQUE = 35; // N·m
const RELEASE_MAX_SPEED = 16; // m/s
const LAYER_RESTORE_DELAY = 0.35; // s after release before the body collides with the player again
const G = 9.81;

const QUERY_MASK = Layer.STATIC | Layer.DYNAMIC | Layer.DEBRIS;
const HELD_COLLIDE = Layer.STATIC | Layer.DYNAMIC | Layer.DEBRIS;

interface MassCache {
  mass: number;
  com: Vector3; // body-local
  inertia: Vector3; // principal, per unit mass
  inertiaQ: Quaternion; // body-local orientation of the principal axes
}

interface Hold {
  body: PhysicsBody;
  mode: "dynamic" | "static";
  local: Vector3; // grab point in the body frame
  dist: number;
  minDist: number;
  mass: MassCache;
  massAge: number;
  prevAngDamping: number;
  leaves: Map<PhysicsShape, [number, number]>; // leaf → original [membership, collide]
  shapeRef: PhysicsShape | null;
  shapeChildren: number;
  stretchTime: number;
  slamTime: number;
  prevT: Vector3;
  hasPrevT: boolean;
  rotDx: number;
  rotDy: number;
  lastForce: Vector3;
  age: number;
}

interface PendingRestore {
  body: PhysicsBody;
  leaves: Map<PhysicsShape, [number, number]>;
  t: number;
}

// ---------------------------------------------------------------- small 3×3 helpers (row-major)
function quatToMat(q: Quaternion, m: Float64Array): void {
  const { x, y, z, w } = q;
  m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y - z * w); m[2] = 2 * (x * z + y * w);
  m[3] = 2 * (x * y + z * w); m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z - x * w);
  m[6] = 2 * (x * z - y * w); m[7] = 2 * (y * z + x * w); m[8] = 1 - 2 * (x * x + y * y);
}

/** out = R · diag(d) · Rᵀ */
function rotDiag(R: Float64Array, dx: number, dy: number, dz: number, out: Float64Array): void {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out[i * 3 + j] = R[i * 3] * dx * R[j * 3] + R[i * 3 + 1] * dy * R[j * 3 + 1] + R[i * 3 + 2] * dz * R[j * 3 + 2];
    }
  }
}

/** Inverse of a 3×3 matrix; returns false when (near) singular. */
function inv3(m: Float64Array, out: Float64Array): boolean {
  const a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return false;
  const s = 1 / det;
  out[0] = A * s; out[1] = -(b * i - c * h) * s; out[2] = (b * f - c * e) * s;
  out[3] = B * s; out[4] = (a * i - c * g) * s; out[5] = -(a * f - c * d) * s;
  out[6] = C * s; out[7] = -(a * h - b * g) * s; out[8] = (a * e - b * d) * s;
  return true;
}

function finiteVec(v: Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

export class Interaction {
  /** Info about what the crosshair is on (or what is held). */
  target: TargetInfo | null = null;
  /** Distance to the crosshair hit (m), or -1. */
  targetDistance = -1;
  /** Throw charge 0..1 while charging, -1 otherwise. */
  throwCharge = -1;

  private readonly ctx: GameContext;
  private hold: Hold | null = null;
  private pending: PendingRestore[] = [];
  private time = 0;
  private charging = false;
  private chargeStart = 0;
  private slamCooldown = 0;
  private targetHit: RayHit | null = null;
  private targetAge = 0;
  private plugin: HavokPlugin | null = null;

  // scratch (no per-step allocations in the hold servo)
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly P = new Vector3();
  private readonly T = new Vector3();
  private readonly com = new Vector3();
  private readonly r = new Vector3();
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly vP = new Vector3();
  private readonly vT = new Vector3();
  private readonly J = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly qTmp = new Quaternion();
  private readonly R = new Float64Array(9);
  private readonly RI = new Float64Array(9);
  private readonly Iinv = new Float64Array(9);
  private readonly K = new Float64Array(9);
  private readonly Kinv = new Float64Array(9);
  private readonly leafScratch: PhysicsShape[] = [];

  constructor(ctx: GameContext) {
    this.ctx = ctx;
  }

  // ---------------------------------------------------------------- public state
  get held(): PhysicsBody | null {
    return this.hold ? this.hold.body : null;
  }

  get holdMode(): "dynamic" | "static" | null {
    return this.hold ? this.hold.mode : null;
  }

  get heldMass(): number {
    return this.hold ? this.hold.mass.mass : 0;
  }

  /** True when the held object is light enough to be lifted (else it is dragged). */
  get canLift(): boolean {
    return !!this.hold && this.hold.mass.mass * G <= LIFT_FORCE * 0.95;
  }

  /** Current hold distance (m). */
  get holdDistance(): number {
    return this.hold ? this.hold.dist : 0;
  }

  /** Last force (N) applied by the hand (pull force for anchored islands). */
  get handForce(): number {
    return this.hold ? this.hold.lastForce.length() : 0;
  }

  crosshair(tool: ToolId): CrosshairState {
    if (this.hold) return "hold";
    const t = this.target;
    if (!t) return "default";
    if (tool === "crowbar" && this.targetDistance >= 0 && this.targetDistance <= PRY_REACH) return "pry";
    if (t.usable) return "use";
    if (t.grabbable) return "grab";
    return "default";
  }

  /** Accumulate a rotate-held-object mouse delta (sensitivity-scaled pixels). */
  addRotation(dx: number, dy: number): void {
    if (!this.hold) return;
    if (Number.isFinite(dx)) this.hold.rotDx += dx;
    if (Number.isFinite(dy)) this.hold.rotDy += dy;
  }

  /** Mouse wheel: change the hold distance (notches; positive = push away). */
  addWheel(notches: number): void {
    if (!this.hold || !Number.isFinite(notches) || notches === 0) return;
    const h = this.hold;
    h.dist = Math.max(Math.max(HOLD_MIN, h.minDist), Math.min(HOLD_MAX, h.dist + notches * 0.15));
  }

  // ---------------------------------------------------------------- per fixed step
  fixedUpdate(dt: number, view: InteractionView): void {
    this.time += dt;
    if (this.slamCooldown > 0) this.slamCooldown -= dt;
    this.processPendingRestores(false);

    // crosshair target (or the held object)
    if (this.hold) {
      this.targetHit = null;
      if (--this.targetAge <= 0) {
        this.targetAge = 10;
        this.target = this.safeTarget(this.hold.body, this.P, -1);
      }
      this.targetDistance = this.hold.dist;
    } else {
      this.updateTarget(view);
    }

    const h = this.hold;
    if (!h) {
      this.charging = false;
      this.throwCharge = -1;
      return;
    }
    if (h.body.isDisposed || !h.body.transformNode || h.body.transformNode.isDisposed()) {
      this.release(false);
      return;
    }
    h.age += dt;
    // standing on what you hold → let go
    if (view.support && view.support === h.body) {
      this.drop("standing");
      return;
    }
    // anchored island ripped loose → becomes a normal held object
    if (h.mode === "static" && !this.isAnchored(h.body)) this.promoteToDynamic(h);

    if (h.mode === "dynamic") this.stepDynamic(h, dt, view);
    else this.stepStatic(h, dt, view);

    if (this.hold && this.charging) {
      const held = this.time - this.chargeStart;
      this.throwCharge = Math.max(0, Math.min(1, (held - CHARGE_DELAY) / (CHARGE_FULL - CHARGE_DELAY)));
    } else {
      this.throwCharge = -1;
    }
  }

  // ---------------------------------------------------------------- actions
  /** RMB: grab what the crosshair is on, or drop what is held. */
  toggleGrab(view: InteractionView): boolean {
    if (this.hold) {
      this.drop("toggle");
      return false;
    }
    return this.tryGrab(view);
  }

  tryGrab(view: InteractionView): boolean {
    if (this.hold) return true;
    const hit = this.cast(view, REACH);
    if (!hit) return false;
    const body = hit.body;
    if (view.support && view.support === body) return false; // can't lift what you stand on
    const info = this.safeTarget(body, hit.point, hit.childIndex);
    let mode: "dynamic" | "static";
    if (info) {
      if (!info.grabbable) return false;
      mode = info.isStatic ? "static" : "dynamic";
    } else {
      // not a destruction body: only free dynamic bodies can be held
      if (body.getMotionType() !== PhysicsMotionType.DYNAMIC) return false;
      mode = "dynamic";
    }
    const node = body.transformNode;
    const q = node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation);
    const local = new Vector3();
    hit.point.subtractToRef(node.position, this.tmp);
    Quaternion.InverseToRef(q, this.qTmp);
    this.tmp.applyRotationQuaternionToRef(this.qTmp, local);
    const mass = this.readMass(body, info?.mass ?? null);
    const minDist = mode === "dynamic" ? this.minHoldDistance(body, hit.point) : 0.2;
    const dist =
      mode === "dynamic"
        ? Math.max(Math.max(HOLD_MIN, minDist), Math.min(HOLD_MAX, hit.distance))
        : Math.max(0.2, hit.distance);
    const h: Hold = {
      body,
      mode,
      local,
      dist,
      minDist,
      mass,
      massAge: 0,
      prevAngDamping: 0.1,
      leaves: new Map(),
      shapeRef: null,
      shapeChildren: -1,
      stretchTime: 0,
      slamTime: 0,
      prevT: new Vector3(),
      hasPrevT: false,
      rotDx: 0,
      rotDy: 0,
      lastForce: new Vector3(),
      age: 0,
    };
    this.hold = h;
    this.charging = false;
    if (mode === "dynamic") this.beginDynamic(h);
    this.target = info;
    this.targetAge = 10;
    this.ctx.events.emit("grab", { pos: { x: hit.point.x, y: hit.point.y, z: hit.point.z }, mass: mass.mass });
    return true;
  }

  /** Release what is held (keeps its current velocity, clamped). */
  drop(_reason: string = "drop"): void {
    if (!this.hold) return;
    const pos = this.grabPointWorld(this.hold, this.tmp2);
    this.release(true);
    this.ctx.events.emit("drop", { pos: { x: pos.x, y: pos.y, z: pos.z } });
  }

  /** LMB pressed while holding: start charging a throw. */
  beginCharge(): void {
    if (!this.hold || this.hold.mode !== "dynamic") return;
    this.charging = true;
    this.chargeStart = this.time;
    this.throwCharge = 0;
  }

  get isCharging(): boolean {
    return this.charging;
  }

  /**
   * Throw the held object along the view: E = THROW_MAX_ENERGY · (0.2 + 0.8·charge),
   * v = min(√(2E/m), 16 m/s) + player velocity. Returns the energy given (J), 0 if nothing thrown.
   */
  throwHeld(view: InteractionView, charge?: number): number {
    const h = this.hold;
    if (!h) return 0;
    if (h.mode !== "dynamic") {
      this.drop("throw-static");
      return 0;
    }
    let c = charge;
    if (c === undefined) c = this.charging ? Math.max(0, Math.min(1, (this.time - this.chargeStart - CHARGE_DELAY) / (CHARGE_FULL - CHARGE_DELAY))) : 0;
    c = Math.max(0, Math.min(1, Number.isFinite(c) ? c : 0));
    const body = h.body;
    const m = Math.max(0.05, h.mass.mass);
    const energy = THROW_MAX_ENERGY * (THROW_TAP_FRACTION + (1 - THROW_TAP_FRACTION) * c);
    const speed = Math.min(Math.sqrt((2 * energy) / m), THROW_MAX_SPEED);
    const given = 0.5 * m * speed * speed;
    const pos = this.grabPointWorld(h, this.tmp2).clone();
    this.release(false);
    const vel = view.forward.scale(speed).addInPlace(view.velocity);
    if (finiteVec(vel)) body.setLinearVelocity(vel);
    body.getAngularVelocityToRef(this.w);
    body.setAngularVelocity(this.w.scaleInPlace(0.5));
    this.charging = false;
    this.throwCharge = -1;
    this.ctx.events.emit("throw", { pos: { x: pos.x, y: pos.y, z: pos.z }, energy: given, mass: m });
    return given;
  }

  /** F while holding: thrust the held object forward/down hard for a moment. */
  slam(): boolean {
    const h = this.hold;
    if (!h || h.mode !== "dynamic" || this.slamCooldown > 0) return false;
    h.slamTime = SLAM_TIME;
    this.slamCooldown = SLAM_COOLDOWN;
    return true;
  }

  /** E: use what the crosshair is on. */
  use(view: InteractionView): boolean {
    const hit = this.cast(view, REACH);
    if (!hit) return false;
    try {
      return this.ctx.destruction.use(hit.body, hit.point, view.eye.clone());
    } catch (e) {
      console.warn("destruction.use failed", e);
      return false;
    }
  }

  /** Immediately forget everything (teleport / dispose). */
  reset(): void {
    if (this.hold) this.release(false);
    this.processPendingRestores(true);
    this.target = null;
    this.targetHit = null;
    this.targetDistance = -1;
    this.charging = false;
    this.throwCharge = -1;
  }

  // ---------------------------------------------------------------- internals: targeting
  private cast(view: InteractionView, reach: number): RayHit | null {
    this.from.copyFrom(view.eye);
    view.forward.scaleToRef(reach, this.to);
    this.to.addInPlace(view.eye);
    try {
      return this.ctx.physics.raycast(this.from, this.to, QUERY_MASK, view.playerBody);
    } catch (e) {
      console.warn("raycast failed", e);
      return null;
    }
  }

  private updateTarget(view: InteractionView): void {
    const hit = this.cast(view, REACH);
    this.targetHit = hit;
    if (!hit) {
      this.target = null;
      this.targetDistance = -1;
      return;
    }
    this.targetDistance = hit.distance;
    this.target = this.safeTarget(hit.body, hit.point, hit.childIndex);
  }

  private safeTarget(body: PhysicsBody, point: Vector3, childIndex: number): TargetInfo | null {
    try {
      return this.ctx.destruction.target(body, point, childIndex);
    } catch {
      return null;
    }
  }

  private isAnchored(body: PhysicsBody): boolean {
    try {
      return this.ctx.destruction.isStatic(body);
    } catch {
      return body.getMotionType() !== PhysicsMotionType.DYNAMIC;
    }
  }

  // ---------------------------------------------------------------- internals: holding
  private getPlugin(): HavokPlugin | null {
    if (this.plugin) return this.plugin;
    const fromSys = (this.ctx.physics as unknown as { plugin?: HavokPlugin }).plugin;
    const fromScene = this.ctx.scene.getPhysicsEngine()?.getPhysicsPlugin() as HavokPlugin | undefined;
    this.plugin = fromSys ?? fromScene ?? null;
    return this.plugin;
  }

  private readMass(body: PhysicsBody, fallbackMass: number | null): MassCache {
    let mp: { mass?: number; centerOfMass?: Vector3; inertia?: Vector3; inertiaOrientation?: Quaternion } = {};
    try {
      mp = body.getMassProperties();
    } catch {
      /* body without mass properties */
    }
    let mass = mp.mass ?? 0;
    if (!(mass > 0) || !Number.isFinite(mass)) {
      let dm: number | null = null;
      try {
        dm = this.ctx.destruction.massOf(body);
      } catch {
        dm = null;
      }
      mass = dm ?? fallbackMass ?? 10;
    }
    const inertia = mp.inertia && finiteVec(mp.inertia) ? mp.inertia.clone() : new Vector3(0.1, 0.1, 0.1);
    // guard degenerate (zero) principal moments
    inertia.x = Math.max(inertia.x, 1e-5);
    inertia.y = Math.max(inertia.y, 1e-5);
    inertia.z = Math.max(inertia.z, 1e-5);
    return {
      mass: Math.max(0.01, mass),
      com: mp.centerOfMass && finiteVec(mp.centerOfMass) ? mp.centerOfMass.clone() : Vector3.Zero(),
      inertia,
      inertiaQ: mp.inertiaOrientation ? mp.inertiaOrientation.clone() : Quaternion.Identity(),
    };
  }

  /** Hold distance below which a big object would clip into the camera. */
  private minHoldDistance(body: PhysicsBody, grabPoint: Vector3): number {
    try {
      const { min, max } = body.transformNode.getHierarchyBoundingVectors(true);
      if (!finiteVec(min) || !finiteVec(max) || min.x > max.x) return HOLD_MIN; // no meshes
      let far = 0;
      for (let i = 0; i < 8; i++) {
        const x = i & 1 ? max.x : min.x, y = i & 2 ? max.y : min.y, z = i & 4 ? max.z : min.z;
        const d = Math.hypot(x - grabPoint.x, y - grabPoint.y, z - grabPoint.z);
        if (d > far) far = d;
      }
      return Math.min(2.0, Math.max(HOLD_MIN, 0.3 + 0.55 * far));
    } catch {
      return HOLD_MIN;
    }
  }

  private grabPointWorld(h: Hold, out: Vector3): Vector3 {
    const node = h.body.transformNode;
    const q = node.rotationQuaternion;
    if (q) h.local.applyRotationQuaternionToRef(q, out);
    else out.copyFrom(h.local);
    out.addInPlace(node.position);
    return out;
  }

  private beginDynamic(h: Hold): void {
    const body = h.body;
    try {
      h.prevAngDamping = body.getAngularDamping();
    } catch {
      h.prevAngDamping = 0.1;
    }
    body.setAngularDamping(HOLD_ANG_DAMPING);
    const plugin = this.getPlugin();
    try {
      plugin?.setActivationControl(body, PhysicsActivationControl.ALWAYS_ACTIVE);
    } catch {
      /* instanced body / unsupported */
    }
    // re-grab during the post-release grace period: take over the remembered original masks
    const idx = this.pending.findIndex((p) => p.body === body);
    if (idx >= 0) {
      h.leaves = this.pending[idx].leaves;
      this.pending.splice(idx, 1);
    }
    this.applyHeldLayer(h);
    body.getLinearVelocityToRef(this.v);
    if (this.v.lengthSquared() < 1e-6) body.setLinearVelocity(this.v.set(0, 1e-3, 0)); // wake
  }

  private promoteToDynamic(h: Hold): void {
    h.mode = "dynamic";
    h.mass = this.readMass(h.body, null);
    h.massAge = 0;
    h.minDist = this.minHoldDistance(h.body, this.grabPointWorld(h, this.tmp));
    h.dist = Math.max(Math.max(HOLD_MIN, h.minDist), Math.min(HOLD_MAX, h.dist));
    this.beginDynamic(h);
  }

  /** Move the body's leaf shapes to the HELD layer (remembering the original masks). */
  private applyHeldLayer(h: Hold): void {
    const shape = h.body.shape;
    h.shapeRef = shape;
    h.shapeChildren = shape && shape.type === PhysicsShapeType.CONTAINER ? shape.getNumChildren() : -1;
    if (!shape) return;
    const leaves = this.leafScratch;
    leaves.length = 0;
    const complete = this.collectLeaves(shape, leaves);
    for (const leaf of leaves) {
      if (!leaf._pluginData) continue;
      if (!h.leaves.has(leaf)) h.leaves.set(leaf, [leaf.filterMembershipMask, leaf.filterCollideMask]);
      leaf.filterMembershipMask = Layer.HELD;
      leaf.filterCollideMask = HELD_COLLIDE;
    }
    if (!complete) {
      // children not reachable through the plugin registry: let the physics system do it
      try {
        this.ctx.physics.setLayer(shape, Layer.HELD, HELD_COLLIDE);
      } catch {
        /* ignore */
      }
    }
    leaves.length = 0;
  }

  /** Leaf shapes of a (possibly nested) container. Returns false if some child was not found. */
  private collectLeaves(shape: PhysicsShape, out: PhysicsShape[]): boolean {
    if (shape.type !== PhysicsShapeType.CONTAINER) {
      out.push(shape);
      return true;
    }
    const plugin = this.getPlugin() as unknown as {
      _hknp?: { HP_Shape_GetChildShape?: (s: unknown, i: number) => [unknown, [bigint]] };
      _shapes?: Map<bigint, PhysicsShape>;
    } | null;
    const hk = plugin?._hknp;
    const registry = plugin?._shapes;
    if (!hk?.HP_Shape_GetChildShape || !registry) return false;
    let complete = true;
    const n = shape.getNumChildren();
    for (let i = 0; i < n; i++) {
      let child: PhysicsShape | undefined;
      try {
        child = registry.get(hk.HP_Shape_GetChildShape(shape._pluginData, i)[1][0]);
      } catch {
        child = undefined;
      }
      if (!child) {
        complete = false;
        continue;
      }
      if (!this.collectLeaves(child, out)) complete = false;
    }
    return complete;
  }

  private restoreLeaves(leaves: Map<PhysicsShape, [number, number]>): void {
    for (const [leaf, [m, c]] of leaves) {
      if (!leaf._pluginData) continue; // disposed (fractured away)
      // only undo our own change (the destruction system may have re-layered the leaf since)
      if (leaf.filterMembershipMask === Layer.HELD && leaf.filterCollideMask === HELD_COLLIDE) {
        leaf.filterMembershipMask = m;
        leaf.filterCollideMask = c;
      }
    }
    leaves.clear();
  }

  private processPendingRestores(all: boolean): void {
    if (!this.pending.length) return;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (all || p.body.isDisposed || this.time >= p.t) {
        this.restoreLeaves(p.leaves);
        this.pending.splice(i, 1);
      }
    }
  }

  /** End the hold. `clampVelocity` limits the release speed (drops, not throws). */
  private release(clampVelocity: boolean): void {
    const h = this.hold;
    if (!h) return;
    this.hold = null;
    this.charging = false;
    this.throwCharge = -1;
    this.target = null;
    const body = h.body;
    const alive = !body.isDisposed && !!body.transformNode && !body.transformNode.isDisposed();
    if (h.mode === "dynamic" && alive) {
      try {
        body.setAngularDamping(h.prevAngDamping);
      } catch {
        /* ignore */
      }
      try {
        this.getPlugin()?.setActivationControl(body, PhysicsActivationControl.SIMULATION_CONTROLLED);
      } catch {
        /* ignore */
      }
      if (clampVelocity) {
        body.getLinearVelocityToRef(this.v);
        const s = this.v.length();
        if (s > RELEASE_MAX_SPEED) body.setLinearVelocity(this.v.scaleInPlace(RELEASE_MAX_SPEED / s));
      }
    }
    if (h.leaves.size) {
      if (alive) this.pending.push({ body, leaves: h.leaves, t: this.time + LAYER_RESTORE_DELAY });
      else this.restoreLeaves(h.leaves);
    }
  }

  private stepStatic(h: Hold, dt: number, view: InteractionView): void {
    const P = this.grabPointWorld(h, this.P);
    const T = this.T;
    view.forward.scaleToRef(h.dist, T);
    T.addInPlace(view.eye);
    T.subtractToRef(P, this.tmp); // stretch
    const stretch = this.tmp.length();
    if (!Number.isFinite(stretch)) {
      this.drop("nan");
      return;
    }
    if (stretch > DROP_STRETCH) {
      h.stretchTime += dt;
      if (h.stretchTime > 0.12) {
        this.drop("slipped");
        return;
      }
    } else h.stretchTime = 0;
    const f = Math.min(LIFT_FORCE, stretch * STATIC_SPRING_K);
    if (stretch > 1e-6) this.tmp.scaleToRef(f / stretch, h.lastForce);
    else h.lastForce.setAll(0);
    if (f > 1) {
      try {
        this.ctx.destruction.pull(h.body, P.clone(), h.lastForce.clone(), dt);
      } catch (e) {
        console.warn("destruction.pull failed", e);
      }
    }
  }

  private stepDynamic(h: Hold, dt: number, view: InteractionView): void {
    const body = h.body;
    const node = body.transformNode;
    const q = node.rotationQuaternion;
    if (!q) {
      this.drop("no-rotation");
      return;
    }
    // keep the HELD layer on new leaves (the island may have been rebuilt by a fracture)
    const shape = body.shape;
    const nChildren = shape && shape.type === PhysicsShapeType.CONTAINER ? shape.getNumChildren() : -1;
    if (shape !== h.shapeRef || nChildren !== h.shapeChildren) {
      this.applyHeldLayer(h);
      h.massAge = 1e9; // force a mass refresh
    }
    if ((h.massAge += dt) > 0.5) {
      h.mass = this.readMass(body, h.mass.mass);
      h.massAge = 0;
    }
    const m = h.mass.mass;

    // pose
    const P = this.grabPointWorld(h, this.P);
    h.mass.com.applyRotationQuaternionToRef(q, this.com);
    this.com.addInPlace(node.position);
    P.subtractToRef(this.com, this.r);
    body.getLinearVelocityToRef(this.v);
    body.getAngularVelocityToRef(this.w);
    if (!finiteVec(P) || !finiteVec(this.v) || !finiteVec(this.w)) {
      this.drop("nan");
      return;
    }
    Vector3.CrossToRef(this.w, this.r, this.vP);
    this.vP.addInPlace(this.v);

    // hold target (slam: thrust forward and down)
    const T = this.T;
    let tau = SERVO_TAU;
    let fMax = LIFT_FORCE;
    if (h.slamTime > 0) {
      h.slamTime -= dt;
      this.tmp.set(view.forward.x, view.forward.y - 0.75, view.forward.z).normalize();
      this.tmp.scaleToRef(h.dist + 0.7, T);
      tau = SERVO_TAU_SLAM;
      fMax = SLAM_FORCE;
    } else {
      view.forward.scaleToRef(h.dist, T);
    }
    T.addInPlace(view.eye);
    // target velocity (the target moves with the player and the view)
    if (h.hasPrevT) {
      T.subtractToRef(h.prevT, this.vT).scaleInPlace(1 / dt);
      const s = this.vT.length();
      if (s > 25) this.vT.scaleInPlace(25 / s);
    } else this.vT.copyFrom(view.velocity);
    h.prevT.copyFrom(T);
    h.hasPrevT = true;

    // error, stuck check
    const e = this.tmp;
    T.subtractToRef(P, e);
    const stretch = e.length();
    if (stretch > DROP_STRETCH && h.slamTime <= 0) {
      h.stretchTime += dt;
      if (h.stretchTime > DROP_STRETCH_TIME) {
        this.drop("stuck");
        return;
      }
    } else h.stretchTime = 0;
    // too heavy to lift: only drag and tilt (limit the vertical goal)
    if (m * G > LIFT_FORCE * 0.95) e.y = Math.max(-0.3, Math.min(0.2, e.y));

    // desired point velocity
    const vDes = this.tmp2;
    e.scaleToRef(1 / tau, vDes);
    const rel = vDes.length();
    if (rel > SERVO_MAX_REL_SPEED) vDes.scaleInPlace(SERVO_MAX_REL_SPEED / rel);
    vDes.addInPlace(this.vT);
    vDes.subtractInPlace(this.vP).scaleInPlace(SERVO_BETA); // Δv at P

    // K = (1/m)E − [r]× I⁻¹ [r]×
    this.worldInvInertia(q, h.mass, this.Iinv);
    this.pointMassMatrix(this.r, m, this.Iinv, this.K);
    const J = this.J;
    if (inv3(this.K, this.Kinv)) {
      const k = this.Kinv;
      J.set(
        k[0] * vDes.x + k[1] * vDes.y + k[2] * vDes.z,
        k[3] * vDes.x + k[4] * vDes.y + k[5] * vDes.z,
        k[6] * vDes.x + k[7] * vDes.y + k[8] * vDes.z,
      );
    } else vDes.scaleToRef(m, J);
    J.y += m * G * dt; // gravity compensation at the grab point
    const jMax = fMax * dt;
    const jLen = J.length();
    if (!Number.isFinite(jLen)) {
      this.drop("nan");
      return;
    }
    if (jLen > jMax) J.scaleInPlace(jMax / jLen);
    body.applyImpulse(J, P);
    J.scaleToRef(1 / dt, h.lastForce);

    // R + mouse: rotate the held object about the camera axes (torque-limited)
    if (h.rotDx !== 0 || h.rotDy !== 0) {
      const wy = (h.rotDx * ROTATE_RAD_PER_PX) / dt;
      const wx = (h.rotDy * ROTATE_RAD_PER_PX) / dt;
      h.rotDx = h.rotDy = 0;
      const wd = this.tmp2.set(
        view.up.x * wy + view.right.x * wx,
        view.up.y * wy + view.right.y * wx,
        view.up.z * wy + view.right.z * wx,
      );
      wd.subtractInPlace(this.w); // Δω
      // L = I_w Δω with I_w = R diag(m·I) Rᵀ
      this.worldInertia(q, h.mass, this.Iinv);
      const I = this.Iinv;
      const L = this.tmp.set(
        I[0] * wd.x + I[1] * wd.y + I[2] * wd.z,
        I[3] * wd.x + I[4] * wd.y + I[5] * wd.z,
        I[6] * wd.x + I[7] * wd.y + I[8] * wd.z,
      ).scaleInPlace(0.6);
      const lMax = ROTATE_MAX_TORQUE * dt;
      const lLen = L.length();
      if (Number.isFinite(lLen) && lLen > 0) {
        if (lLen > lMax) L.scaleInPlace(lMax / lLen);
        body.applyAngularImpulse(L);
      }
    }

    // jointed islands (doors, lids): the hand force stresses their joints
    try {
      this.ctx.destruction.pull(body, P.clone(), h.lastForce.clone(), dt);
    } catch (err) {
      console.warn("destruction.pull failed", err);
    }
  }

  /** World inverse inertia tensor (row-major) from cached principal moments (per unit mass). */
  private worldInvInertia(q: Quaternion, mc: MassCache, out: Float64Array): void {
    this.principalFrame(q, mc);
    const m = mc.mass;
    rotDiag(this.RI, 1 / (m * mc.inertia.x), 1 / (m * mc.inertia.y), 1 / (m * mc.inertia.z), out);
  }

  private worldInertia(q: Quaternion, mc: MassCache, out: Float64Array): void {
    this.principalFrame(q, mc);
    const m = mc.mass;
    rotDiag(this.RI, m * mc.inertia.x, m * mc.inertia.y, m * mc.inertia.z, out);
  }

  /** this.RI = rotation(body) · rotation(principal axes). */
  private principalFrame(q: Quaternion, mc: MassCache): void {
    q.multiplyToRef(mc.inertiaQ, this.qTmp);
    quatToMat(this.qTmp, this.RI);
  }

  /** K = (1/m)E − [r]× A [r]× for symmetric A (world inverse inertia). */
  private pointMassMatrix(r: Vector3, m: number, A: Float64Array, out: Float64Array): void {
    // X = [r]× (row-major)
    const X = this.R;
    X[0] = 0; X[1] = -r.z; X[2] = r.y;
    X[3] = r.z; X[4] = 0; X[5] = -r.x;
    X[6] = -r.y; X[7] = r.x; X[8] = 0;
    // out = −X A X + (1/m)E
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let s = 0;
        for (let k = 0; k < 3; k++) {
          // (A X)[k][j]
          const ax = A[k * 3] * X[j] + A[k * 3 + 1] * X[3 + j] + A[k * 3 + 2] * X[6 + j];
          s += X[i * 3 + k] * ax;
        }
        out[i * 3 + j] = -s + (i === j ? 1 / m : 0);
      }
    }
  }
}
