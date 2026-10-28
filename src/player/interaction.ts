// Hands-on interaction: crosshair target, physics grab/hold, throw, slam, pull on anchored or
// jointed islands, and the use key.
//
// HOLD MECHANISM (dynamic islands) — the one recommended by docs/api-notes/physics-constraints-
// character.md §6: a Physics6DoFConstraint between a persistent ANIMATED "hand" anchor (collides
// with nothing) and the held body, pivot = the grab point in the body frame, with POSITION motors
// on the three linear axes of the anchor frame (camera yaw): lift 450 N on Y, push 300 N on X/Z.
// Havok solves hand + contacts implicitly: exact hold, no jitter with heavy swings, stable against
// walls, objects heavier than ≈46 kg can only be dragged/tilted, and the joint's applied impulse is
// the exact hand force (fed to destruction.pull for doors and lids). No angular motors by default,
// so a body hangs naturally from where it was grabbed (angular damping raised while held); R + mouse
// re-creates the joint with angular POSITION motors (40 N·m) whose targets follow the mouse.
// While held the body is ALWAYS_ACTIVE and its leaf shapes are on the HELD layer (no collision with
// the player capsule, ignored by tool sweeps) — restored shortly after release.
//
// ANCHORED islands (wall cabinets, fixtures) can't be moved by a joint to an animated anchor (both
// infinite mass): the grab point stays put and a capped spring force (2000 N/m, ≤ 450 N) is passed
// to destruction.pull every fixed step until the island breaks loose — then it becomes a normal
// held object.

import {
  Physics6DoFConstraint,
  PhysicsActivationControl,
  PhysicsBody,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
  PhysicsShapeSphere,
  PhysicsShapeType,
  Quaternion,
  TransformNode,
  Vector3,
  type HavokPlugin,
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
  /** Camera yaw (rad): the hand anchor's frame turns with it. */
  yaw: number;
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
/** Hand strength: vertical (lift) and horizontal (push/pull) motor caps (N). */
export const LIFT_FORCE = 450;
export const PUSH_FORCE = 300;
/** Motor caps during the 0.15 s slam thrust (N): a two-handed overhead slam is a few times body weight briefly. */
export const SLAM_FORCE = 1200;
/** Angular motor torque once the player rotates the held object with R (N·m). */
export const HOLD_TORQUE = 40;
export const HOLD_MIN = 0.6;
export const HOLD_MAX = 2.5;
/** Initial hold distance when picking something up (it is brought this close). */
export const HOLD_PICKUP = 1.15;
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
const HOLD_ANG_DAMPING = 3;
const STATIC_SPRING_K = 2000; // N/m for pulling on anchored islands
const ROTATE_RAD_PER_PX = 0.006;
const RELEASE_MAX_SPEED = 16; // m/s
const LAYER_RESTORE_DELAY = 0.35; // s after release before the body collides with the player again
const G = 9.81;

const QUERY_MASK = Layer.STATIC | Layer.DYNAMIC | Layer.DEBRIS;
const HELD_COLLIDE = Layer.STATIC | Layer.DYNAMIC | Layer.DEBRIS;
const LIN_AXES = [PhysicsConstraintAxis.LINEAR_X, PhysicsConstraintAxis.LINEAR_Y, PhysicsConstraintAxis.LINEAR_Z] as const;
const ANG_AXES = [PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxis.ANGULAR_Y, PhysicsConstraintAxis.ANGULAR_Z] as const;
const AX = new Vector3(1, 0, 0);
const AY = new Vector3(0, 1, 0);

interface Hold {
  body: PhysicsBody;
  mode: "dynamic" | "static";
  /** Doors / drawers: held where the hand is, stay on their layer. */
  jointed: boolean;
  local: Vector3; // grab point in the body frame
  dist: number;
  minDist: number;
  mass: number;
  massAge: number;
  prevAngDamping: number;
  leaves: Map<PhysicsShape, [number, number]>; // leaf → original [membership, collide]
  shapeRef: PhysicsShape | null;
  shapeChildren: number;
  stretchTime: number;
  slamTime: number;
  joint: Physics6DoFConstraint | null;
  slamCaps: boolean;
  angular: boolean;
  rotPitch: number;
  rotYaw: number;
  rotDx: number;
  rotDy: number;
  lastForce: Vector3;
}

interface PendingRestore {
  body: PhysicsBody;
  leaves: Map<PhysicsShape, [number, number]>;
  t: number;
}

type HavokRaw = {
  HP_Body_SetQTransform?: (id: unknown, t: [number[], number[]]) => unknown;
  HP_Constraint_GetAppliedImpulses?: (id: unknown) => [unknown, number[], number[]];
  HP_Shape_GetChildShape?: (s: unknown, i: number) => [unknown, [bigint]];
};

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
  /** Arm stretch: hold target − grab point (world, m); zero when nothing is held. */
  readonly stretch = new Vector3();

  private readonly ctx: GameContext;
  private hold: Hold | null = null;
  private pending: PendingRestore[] = [];
  private time = 0;
  private charging = false;
  private chargeStart = 0;
  private slamCooldown = 0;
  private targetAge = 0;
  private plugin: HavokPlugin | null = null;
  private anchor: PhysicsBody | null = null;
  private anchorShape: PhysicsShape | null = null;

  // scratch
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly P = new Vector3();
  private readonly T = new Vector3();
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly yawQ = new Quaternion();
  private readonly qInv = new Quaternion();
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
    return this.hold ? this.hold.mass : 0;
  }

  /** True when the held object is light enough to be lifted (else it is dragged). */
  get canLift(): boolean {
    return !!this.hold && this.hold.mass * G <= LIFT_FORCE * 0.95;
  }

  /** Current hold distance (m). */
  get holdDistance(): number {
    return this.hold ? this.hold.dist : 0;
  }

  /** Force (N) the hand applied during the last step (joint load, or the pull spring). */
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
    const lo = h.mode === "static" || h.jointed ? 0.2 : Math.max(HOLD_MIN, h.minDist);
    h.dist = Math.max(lo, Math.min(HOLD_MAX, h.dist + notches * 0.15));
  }

  // ---------------------------------------------------------------- per fixed step
  fixedUpdate(dt: number, view: InteractionView): void {
    this.time += dt;
    if (this.slamCooldown > 0) this.slamCooldown -= dt;
    this.processPendingRestores(false);

    // crosshair target (or the held object)
    if (this.hold) {
      if (--this.targetAge <= 0 && this.alive(this.hold.body)) {
        this.targetAge = 10;
        this.target = this.safeTarget(this.hold.body, this.grabPointWorld(this.hold, this.P), -1);
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
    if (!this.alive(h.body)) {
      this.release(false);
      return;
    }
    // standing on what you hold → let go
    if (view.support && view.support === h.body) {
      this.drop("standing");
      return;
    }
    // anchored island ripped loose → becomes a normal held object
    if (h.mode === "static" && !this.isAnchored(h.body)) this.promoteToDynamic(h, view);
    if (!this.hold) return;

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
    Quaternion.InverseToRef(q, this.qInv);
    this.tmp.applyRotationQuaternionToRef(this.qInv, local);
    const jointed = info?.usable === "door" || info?.usable === "drawer";
    const minDist = mode === "dynamic" && !jointed ? this.minHoldDistance(body, hit.point) : 0.2;
    // Picking something up brings it towards you; doors/drawers and anchored things are held
    // where the hand is.
    const dist = mode === "static" || jointed ? Math.max(0.2, hit.distance) : Math.max(Math.max(HOLD_MIN, minDist), Math.min(HOLD_PICKUP, hit.distance));
    const h: Hold = {
      body,
      mode,
      jointed,
      local,
      dist,
      minDist,
      mass: this.readMass(body, info?.mass ?? null),
      massAge: 0,
      prevAngDamping: 0.1,
      leaves: new Map(),
      shapeRef: null,
      shapeChildren: -1,
      stretchTime: 0,
      slamTime: 0,
      joint: null,
      slamCaps: false,
      angular: false,
      rotPitch: 0,
      rotYaw: 0,
      rotDx: 0,
      rotDy: 0,
      lastForce: new Vector3(),
    };
    this.hold = h;
    this.charging = false;
    if (mode === "dynamic" && !this.beginDynamic(h, view)) {
      this.hold = null;
      return false;
    }
    this.target = info;
    this.targetAge = 10;
    this.ctx.events.emit("grab", { pos: { x: hit.point.x, y: hit.point.y, z: hit.point.z }, mass: h.mass });
    return true;
  }

  /** Release what is held (keeps its current velocity, clamped). */
  drop(_reason: string = "drop"): void {
    if (!this.hold) return;
    const pos = this.alive(this.hold.body) ? this.grabPointWorld(this.hold, this.tmp2) : this.P;
    const p = { x: pos.x, y: pos.y, z: pos.z };
    this.release(true);
    this.ctx.events.emit("drop", { pos: p });
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
   * v = min(√(2E/m), 16 m/s) + player velocity. Returns the kinetic energy given (J), 0 if nothing.
   */
  throwHeld(view: InteractionView, charge?: number): number {
    const h = this.hold;
    if (!h) return 0;
    if (h.mode !== "dynamic" || !this.alive(h.body)) {
      this.drop("throw-static");
      return 0;
    }
    let c = charge;
    if (c === undefined) c = this.charging ? (this.time - this.chargeStart - CHARGE_DELAY) / (CHARGE_FULL - CHARGE_DELAY) : 0;
    c = Math.max(0, Math.min(1, Number.isFinite(c) ? c : 0));
    const body = h.body;
    const m = Math.max(0.05, h.mass);
    const energy = THROW_MAX_ENERGY * (THROW_TAP_FRACTION + (1 - THROW_TAP_FRACTION) * c);
    const speed = Math.min(Math.sqrt((2 * energy) / m), THROW_MAX_SPEED);
    const given = 0.5 * m * speed * speed;
    const pos = this.grabPointWorld(h, this.tmp2);
    const p = { x: pos.x, y: pos.y, z: pos.z };
    this.release(false);
    const vel = this.v.copyFrom(view.forward).scaleInPlace(speed).addInPlace(view.velocity);
    if (finiteVec(vel)) body.setLinearVelocity(vel);
    body.getAngularVelocityToRef(this.w);
    body.setAngularVelocity(this.w.scaleInPlace(0.5));
    this.charging = false;
    this.throwCharge = -1;
    this.ctx.events.emit("throw", { pos: p, energy: given, mass: m });
    return given;
  }

  /** F while holding: thrust the held object forward/down hard for a moment. */
  slam(): boolean {
    const h = this.hold;
    if (!h || h.mode !== "dynamic" || h.jointed || this.slamCooldown > 0) return false;
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

  /** Immediately forget everything (teleport). */
  reset(): void {
    if (this.hold) this.release(false);
    this.processPendingRestores(true);
    this.target = null;
    this.targetDistance = -1;
    this.charging = false;
    this.throwCharge = -1;
  }

  dispose(): void {
    this.reset();
    if (this.anchor && !this.anchor.isDisposed) {
      const node = this.anchor.transformNode;
      this.anchor.dispose();
      node.dispose();
    }
    this.anchorShape?.dispose();
    this.anchor = null;
    this.anchorShape = null;
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

  private alive(body: PhysicsBody): boolean {
    return !body.isDisposed && !!body.transformNode && !body.transformNode.isDisposed();
  }

  // ---------------------------------------------------------------- internals: holding
  private getPlugin(): HavokPlugin | null {
    if (this.plugin) return this.plugin;
    const fromSys = (this.ctx.physics as unknown as { plugin?: HavokPlugin }).plugin;
    const fromScene = this.ctx.scene.getPhysicsEngine()?.getPhysicsPlugin() as HavokPlugin | undefined;
    this.plugin = fromSys ?? fromScene ?? null;
    return this.plugin;
  }

  private get hk(): HavokRaw | null {
    return (this.getPlugin() as unknown as { _hknp?: HavokRaw } | null)?._hknp ?? null;
  }

  private readMass(body: PhysicsBody, fallbackMass: number | null): number {
    let mass = 0;
    try {
      mass = body.getMassProperties().mass ?? 0;
    } catch {
      mass = 0;
    }
    if (!(mass > 0) || !Number.isFinite(mass)) {
      let dm: number | null = null;
      try {
        dm = this.ctx.destruction.massOf(body);
      } catch {
        dm = null;
      }
      mass = dm ?? fallbackMass ?? 10;
    }
    return Math.max(0.01, mass);
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

  /** The persistent ANIMATED "hand" body the grab joints attach to (collides with nothing). */
  private ensureAnchor(): PhysicsBody | null {
    if (this.anchor && !this.anchor.isDisposed) return this.anchor;
    const scene = this.ctx.scene;
    if (!scene.getPhysicsEngine()) return null;
    const n = new TransformNode("playerHandAnchor", scene);
    n.position.set(0, -50, 0);
    n.rotationQuaternion = Quaternion.Identity();
    n.computeWorldMatrix(true);
    const b = new PhysicsBody(n, PhysicsMotionType.ANIMATED, false, scene);
    const s = new PhysicsShapeSphere(Vector3.Zero(), 0.01, scene);
    s.filterMembershipMask = 0;
    s.filterCollideMask = 0;
    b.shape = s;
    this.anchor = b;
    this.anchorShape = s;
    return b;
  }

  /** Teleport the anchor (zero initial joint error). */
  private placeAnchor(p: Vector3, q: Quaternion): void {
    const a = this.anchor;
    if (!a) return;
    const n = a.transformNode;
    n.position.copyFrom(p);
    n.rotationQuaternion!.copyFrom(q);
    const id = (a as unknown as { _pluginData?: { hpBodyId?: unknown } })._pluginData?.hpBodyId;
    const hk = this.hk;
    if (hk?.HP_Body_SetQTransform && id !== undefined) hk.HP_Body_SetQTransform(id, [[p.x, p.y, p.z], [q.x, q.y, q.z, q.w]]);
    else a.setTargetTransform(p, q);
  }

  /** (Re)create the grab joint at the current pose (no jump: the anchor starts at the grab point). */
  private createJoint(h: Hold, view: InteractionView): boolean {
    const anchor = this.ensureAnchor();
    if (!anchor) return false;
    this.destroyJoint(h);
    const body = h.body;
    const node = body.transformNode;
    const q = node.rotationQuaternion;
    if (!q) return false;
    Quaternion.RotationYawPitchRollToRef(view.yaw, 0, 0, this.yawQ);
    Quaternion.InverseToRef(q, this.qInv);
    // anchor axes (camera-yaw frame) expressed in the body frame → zero relative rotation now
    const ax = AX.applyRotationQuaternion(this.yawQ).applyRotationQuaternion(this.qInv);
    const ay = AY.applyRotationQuaternion(this.yawQ).applyRotationQuaternion(this.qInv);
    this.placeAnchor(this.grabPointWorld(h, this.P), this.yawQ);
    try {
      const c = new Physics6DoFConstraint(
        { pivotA: Vector3.Zero(), pivotB: h.local.clone(), axisA: AX.clone(), perpAxisA: AY.clone(), axisB: ax, perpAxisB: ay },
        [],
        this.ctx.scene,
      );
      anchor.addConstraint(body, c); // axis setters only work after this
      for (let i = 0; i < 3; i++) {
        c.setAxisMotorType(LIN_AXES[i], PhysicsConstraintMotorType.POSITION);
        c.setAxisMotorTarget(LIN_AXES[i], 0);
      }
      h.joint = c;
      h.slamCaps = !(h.slamTime > 0); // make applyCaps write the caps below
      this.applyCaps(h, h.slamTime > 0);
      if (h.angular) {
        for (const a of ANG_AXES) {
          c.setAxisMotorType(a, PhysicsConstraintMotorType.POSITION);
          c.setAxisMotorTarget(a, 0);
          c.setAxisMotorMaxForce(a, HOLD_TORQUE);
        }
        h.rotPitch = h.rotYaw = 0;
      }
      return true;
    } catch (e) {
      console.warn("grab joint failed", e);
      this.destroyJoint(h);
      return false;
    }
  }

  private destroyJoint(h: Hold): void {
    if (!h.joint) return;
    try {
      h.joint.dispose();
    } catch {
      /* body already gone */
    }
    h.joint = null;
  }

  /** Linear motor caps: normal hand strength, or the brief slam thrust. */
  private applyCaps(h: Hold, slam: boolean): void {
    if (!h.joint || h.slamCaps === slam) return;
    h.slamCaps = slam;
    const caps = slam ? [SLAM_FORCE, SLAM_FORCE, SLAM_FORCE] : [PUSH_FORCE, LIFT_FORCE, PUSH_FORCE];
    for (let i = 0; i < 3; i++) h.joint.setAxisMotorMaxForce(LIN_AXES[i], caps[i]);
  }

  /** World force (N) the joint applied to the held body during the last step. */
  private readJointForce(h: Hold, out: Vector3): void {
    out.setAll(0);
    const ids = (h.joint as unknown as { _pluginData?: unknown[] } | null)?._pluginData;
    const hk = this.hk;
    if (!ids || ids.length === 0 || !hk?.HP_Constraint_GetAppliedImpulses) return;
    try {
      const lin = hk.HP_Constraint_GetAppliedImpulses(ids[0])[1];
      const dt = this.getPlugin()?.getTimeStep() || 1 / 60;
      out.set(lin[0] / dt, lin[1] / dt, lin[2] / dt);
      if (!finiteVec(out)) out.setAll(0);
    } catch {
      out.setAll(0);
    }
  }

  private beginDynamic(h: Hold, view: InteractionView): boolean {
    const body = h.body;
    if (body.getMotionType() !== PhysicsMotionType.DYNAMIC) return false;
    try {
      h.prevAngDamping = body.getAngularDamping();
    } catch {
      h.prevAngDamping = 0.1;
    }
    body.setAngularDamping(HOLD_ANG_DAMPING);
    try {
      this.getPlugin()?.setActivationControl(body, PhysicsActivationControl.ALWAYS_ACTIVE);
    } catch {
      /* instanced body / unsupported */
    }
    if (!h.jointed) {
      // re-grab during the post-release grace period: take over the remembered original masks
      const idx = this.pending.findIndex((p) => p.body === body);
      if (idx >= 0) {
        h.leaves = this.pending[idx].leaves;
        this.pending.splice(idx, 1);
      }
      this.applyHeldLayer(h);
    }
    if (!this.createJoint(h, view)) {
      this.release(false);
      return false;
    }
    return true;
  }

  private promoteToDynamic(h: Hold, view: InteractionView): void {
    h.mode = "dynamic";
    h.mass = this.readMass(h.body, null);
    h.massAge = 0;
    if (!h.jointed) {
      h.minDist = this.minHoldDistance(h.body, this.grabPointWorld(h, this.tmp));
      h.dist = Math.max(Math.max(HOLD_MIN, h.minDist), Math.min(HOLD_MAX, h.dist));
    }
    if (!this.beginDynamic(h, view)) this.hold = null;
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
    const hk = this.hk;
    const registry = (this.getPlugin() as unknown as { _shapes?: Map<bigint, PhysicsShape> } | null)?._shapes;
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
    this.stretch.setAll(0);
    this.destroyJoint(h);
    const body = h.body;
    const alive = this.alive(body);
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
    this.stretch.copyFrom(this.tmp);
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
    if (!h.joint && !this.createJoint(h, view)) {
      this.drop("no-joint");
      return;
    }
    // keep the HELD layer on new leaves (the island may have been rebuilt by a fracture)
    if (!h.jointed) {
      const shape = body.shape;
      const nChildren = shape && shape.type === PhysicsShapeType.CONTAINER ? shape.getNumChildren() : -1;
      if (shape !== h.shapeRef || nChildren !== h.shapeChildren) {
        this.applyHeldLayer(h);
        h.massAge = 1e9;
      }
    }
    if ((h.massAge += dt) > 0.5) {
      h.mass = this.readMass(body, h.mass);
      h.massAge = 0;
    }

    // last step's hand force (exact joint load) → bond stress on jointed islands, HUD
    this.readJointForce(h, h.lastForce);

    const P = this.grabPointWorld(h, this.P);
    if (!finiteVec(P)) {
      this.drop("nan");
      return;
    }
    // hold target (slam: thrust forward and down)
    const T = this.T;
    if (h.slamTime > 0) {
      // A POSITION motor stops at its target, so aim well beyond (through the floor): the object
      // keeps accelerating at the slam cap until it hits something.
      h.slamTime -= dt;
      this.tmp.set(view.forward.x, view.forward.y - 0.75, view.forward.z).normalize();
      this.tmp.scaleToRef(h.dist + 2.5, T);
    } else view.forward.scaleToRef(h.dist, T);
    T.addInPlace(view.eye);
    this.applyCaps(h, h.slamTime > 0);
    // too heavy to lift: keep the hand near the object's height (drag and tilt, don't "reach")
    if (h.mass * G > LIFT_FORCE * 0.95) T.y = Math.max(P.y - 0.3, Math.min(T.y, P.y + 0.25));

    // stretch & stuck check
    T.subtractToRef(P, this.tmp);
    this.stretch.copyFrom(this.tmp);
    const stretch = this.tmp.length();
    if (stretch > DROP_STRETCH && h.slamTime <= 0) {
      h.stretchTime += dt;
      if (h.stretchTime > DROP_STRETCH_TIME) {
        this.drop("stuck");
        return;
      }
    } else h.stretchTime = 0;

    // R + mouse: rotate relative to the hand (angular motors, enabled on first use)
    if (h.rotDx !== 0 || h.rotDy !== 0) {
      if (!h.angular) {
        h.angular = true;
        this.createJoint(h, view); // zero = current orientation, no snap
      }
      h.rotYaw += h.rotDx * ROTATE_RAD_PER_PX;
      h.rotPitch = Math.max(-1.5, Math.min(1.5, h.rotPitch + h.rotDy * ROTATE_RAD_PER_PX));
      h.rotDx = h.rotDy = 0;
      if (h.joint) {
        h.joint.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, h.rotPitch);
        h.joint.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_Y, h.rotYaw);
      }
    }

    // drive the hand anchor (before the physics step)
    Quaternion.RotationYawPitchRollToRef(view.yaw, 0, 0, this.yawQ);
    this.anchor?.setTargetTransform(T, this.yawQ);

    // jointed islands (doors, lids): the hand force stresses their joints
    try {
      this.ctx.destruction.pull(body, P.clone(), h.lastForce.clone(), dt);
    } catch (err) {
      console.warn("destruction.pull failed", err);
    }
  }
}
