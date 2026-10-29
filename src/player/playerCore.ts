// PlayerCore: all player logic with an injected tool system (player.ts wires the real
// ToolSystem; probes inject their own or none).
//
// The player: Havok character controller (capsule 1.8 m × r 0.3, crouch capsule 1.1 m), walking /
// sprinting / crouching with acceleration + friction, jumping (≈1 m apex, coyote time + input
// buffer), air control, slopes, step-up, landing stomps, footsteps, the first-person camera rig,
// hands-on interaction (grab / throw / slam / pull / use) and the tool system.
//
// Coordinates: `position` is the EYE position; `teleport(pos, yaw, pitch)` takes an eye position
// too (plan.ts SPAWN.pos.y = 1.65 = standing eye height). Pitch > 0 looks down (see camera.ts).
//
// Per fixed step (called by the game loop before destruction.beforePhysics and the physics step):
//   look → crouch → support query → desired velocity → controller integrate (+ own step-up) →
//   landing / stomp → footsteps → actions (grab, throw, slam, kick, stomp, use, slots) → hand joint
//   / pull (interaction.ts) → tools.
// Per render frame: look (so the view turns at display rate even with 0 fixed steps), camera
// bob/dip/shake/FOV, tool viewmodel.

import {
  CharacterSupportedState,
  PhysicsCharacterController,
  PhysicsShapeCapsule,
  PhysicsMotionType,
  ProximityCastResult,
  Quaternion,
  ShapeCastResult,
  Vector3,
  type CharacterSurfaceInfo,
  type HavokPlugin,
  type PhysicsBody,
  type PhysicsShape,
  type UniversalCamera,
} from "@babylonjs/core";
import { Layer, type GameContext, type PlayerSystem, type TargetInfo, type ToolId } from "../core/context.ts";
import { SPAWN } from "../world/plan.ts";
import { FIXED_DT, MAX_STEPS_PER_FRAME } from "../core/time.ts";
import type { IToolSystem, ToolContext } from "./contracts.ts";
import { CameraRig, type CameraInputs } from "./camera.ts";
import { Footsteps, type SupportProbe } from "./footsteps.ts";
import { Interaction, PRY_REACH, type CrosshairState, type InteractionView } from "./interaction.ts";

/** Tunables (SI units). */
export const PLAYER = {
  mass: 80,
  height: 1.8,
  radius: 0.3,
  crouchHeight: 1.1,
  eyeStand: 1.65,
  eyeCrouch: 1.0,
  walkSpeed: 3.6,
  sprintSpeed: 6.0,
  crouchSpeed: 1.6,
  /** Ground acceleration towards the wished velocity and braking when there is no input (m/s²). */
  groundAccel: 30,
  groundFriction: 24,
  airAccel: 5,
  jumpHeight: 1.0,
  gravity: 9.81,
  coyoteTime: 0.12,
  jumpBuffer: 0.15,
  /**
   * Landing faster than this (m/s) on one of our bodies stomps it. An ordinary ≈1 m jump lands at
   * ≈4.4–4.6 m/s and must not crack tiles or kick furniture apart, so the threshold sits well above
   * it (≈1.5 m drop), and only the energy beyond a normal jump landing is delivered (see onLand).
   */
  stompSpeed: 5.5,
  /** Anchored/structural floors (tiles, laminate, slabs) only take a landing stomp above this (≈2.9 m drop). */
  stompSpeedStatic: 7.5,
  /** Effective mass of a landing stomp (≈ 0.4 × body mass through the legs). */
  stompMass: 0.4 * 80,
  /** Contact radius of a landing stomp: a shoe heel / forefoot (m). */
  stompContactRadius: 0.09,
  /** Landings faster than this emit a `land` event. */
  landEventSpeed: 1.0,
  stepHeight: 0.25,
  maxSlopeDeg: 50,
  /** Horizontal push the body can exert on loose furniture while walking into it (N). */
  pushForce: 600,
  /**
   * The player's weight on a dynamic body it stands on is capped at this many times that body's own
   * weight (see loadSupport): a rug lying on the floor is pressed onto the floor, not hammered into it.
   */
  supportLoadCap: 2,
  /** Falling below this height (off the balcony) respawns the player. */
  killY: -25,
} as const;

export const TOOL_SLOTS: readonly ToolId[] = ["hands", "hammer", "sledgehammer", "crowbar", "bat", "axe", "extinguisher"];
const SLOT_ACTIONS = ["slot1", "slot2", "slot3", "slot4", "slot5", "slot6", "slot7"] as const;
const DOWN = new Vector3(0, -1, 0);
const GRAVITY = new Vector3(0, -PLAYER.gravity, 0);
/**
 * What can carry the player: the capsule only collides with STATIC | DYNAMIC, so debris lying under
 * the foot ray is not "what you stand on" (footsteps.ts presses/crunches debris with its own sweep).
 */
const SUPPORT_MASK = Layer.STATIC | Layer.DYNAMIC;
/** Crowbar fallback target query (debris included). */
const PRY_MASK = Layer.STATIC | Layer.DYNAMIC | Layer.DEBRIS;
/** Vertical speed of a normal jump take-off = its landing speed on flat ground (m/s). */
const JUMP_SPEED = Math.sqrt(2 * PLAYER.gravity * PLAYER.jumpHeight);

export class PlayerCore implements PlayerSystem {
  readonly rig: CameraRig;
  readonly interaction: Interaction;
  readonly footsteps: Footsteps;
  readonly tools: IToolSystem | null;
  /** Player velocity (m/s, world). */
  readonly velocity = new Vector3();
  /** Capsule foot position (on the ground when supported). */
  readonly foot = new Vector3();
  grounded = false;
  crouched = false;
  /** Last support probe (what is under the feet), null in the air. */
  support: SupportProbe | null = null;

  private readonly ctx: GameContext;
  private readonly cc: PhysicsCharacterController;
  private readonly standShape: PhysicsShape;
  private readonly crouchShape: PhysicsShape;
  private readonly surface: CharacterSurfaceInfo = {
    isSurfaceDynamic: false,
    supportedState: CharacterSupportedState.UNSUPPORTED,
    averageSurfaceNormal: new Vector3(0, 1, 0),
    averageSurfaceVelocity: new Vector3(),
    averageAngularSurfaceVelocity: new Vector3(),
  };
  private readonly tc: ToolContext;
  private readonly view: InteractionView;
  private readonly camIn: CameraInputs = { footX: 0, footY: 0, footZ: 0, eyeHeight: PLAYER.eyeStand, speed: 0, grounded: false, sprinting: false, stridePhase: 0 };
  private plugin: HavokPlugin | null = null;

  private jumpBufferT = 0;
  private coyoteT = 0;
  private jumpLockT = 0; // after a jump: ignore "supported" for a moment
  private airTime = 0;
  private airVy = 0; // vertical velocity of the last airborne step (landing speed)
  private sprinting = false;
  private hSpeed = 0;
  private wheelAcc = 0;
  private readonly prevFoot = new Vector3();
  private hasPrevFoot = false;
  /**
   * Render interpolation: simulation seconds since the last fixed step (0..FIXED_DT), i.e. the game
   * clock's fixed-step accumulator after this frame's steps. Read from the clock when it exposes it
   * (see clockRemainder); otherwise mirrored here: each fixed step subtracts FIXED_DT, each frame
   * adds its dt·scale.
   */
  private sinceFixed = 0;
  /** Fixed steps run since the last update() (simulated time of this frame). */
  private stepsThisFrame = 0;
  /** Clock accumulator seen by the previous update(), -1 = none yet. */
  private clockAccPrev = -1;
  /** Stride phase at the previous / last fixed step (head-bob interpolation). */
  private phasePrev = 0;
  private phaseCur = 0;
  /**
   * Fixed steps since the last update() call. While render frames are running the crosshair target
   * is raycast per frame (update) instead of per step; headless stepping falls back to per step.
   */
  private stepsSinceFrame = 1e9;

  // scratch
  private readonly v = new Vector3();
  private readonly wish = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly rayFrom = new Vector3();
  private readonly rayTo = new Vector3();
  private readonly proxIn = new ProximityCastResult();
  private readonly proxHit = new ProximityCastResult();
  private readonly identityQ = Quaternion.Identity();
  private readonly castIn = new ShapeCastResult();
  private readonly castHit = new ShapeCastResult();
  private readonly c0 = new Vector3();
  private readonly s0 = new Vector3();
  private readonly s1 = new Vector3();
  private readonly stompPoint = new Vector3();
  private readonly stompDir = new Vector3(0, -1, 0);

  constructor(ctx: GameContext, tools: IToolSystem | null) {
    this.ctx = ctx;
    const scene = ctx.scene;
    this.rig = new CameraRig(ctx.render.camera, ctx.settings, ctx.render);
    this.footsteps = new Footsteps(ctx);
    this.interaction = new Interaction(ctx);

    this.standShape = this.makeCapsule(PLAYER.height);
    this.crouchShape = this.makeCapsule(PLAYER.crouchHeight);
    const spawn = ctx.world?.spawn ?? SPAWN;
    const center = new Vector3(spawn.pos.x, spawn.pos.y - PLAYER.eyeStand + PLAYER.height / 2 + 0.05, spawn.pos.z);
    this.cc = new PhysicsCharacterController(center, { shape: this.standShape, capsuleHeight: PLAYER.height, capsuleRadius: PLAYER.radius }, scene);
    const cc = this.cc;
    cc.maxSlopeCosine = Math.cos((PLAYER.maxSlopeDeg * Math.PI) / 180);
    // Babylon's built-in step-up backs off by keepDistance (5 cm) from a forward cast only
    // v·dt long (6 cm at walking speed), so it practically never fires for this capsule; we use
    // our own (tryStepUp). With maxStepHeight = 0 the rounded capsule bottom still rides over
    // edges up to ≈ r·(1 − cos maxSlope) ≈ 10 cm by itself.
    cc.maxStepHeight = 0;
    cc.characterStrength = PLAYER.pushForce;
    // No built-in weight impulses: Babylon applies characterMass·g·dt along EVERY manifold contact's
    // normal (weight × contact count, tilted by the capsule's round bottom), which pumped a 7.8 kg rug
    // up and down at ~1 m/s under a player standing still (13–23 N·s per step) and dragged it, and the
    // coffee table standing on it shook apart. loadSupport() applies the weight instead: as the
    // support's gravity factor (vertical, through its centre of mass, capped).
    cc.characterMass = 0;
    cc.maxCharacterSpeedForSolver = 30;
    // Default 0.05/0.1 lets the capsule hover 5–15 cm above the floor depending on how it
    // arrived; 0.02/0.03 keeps it at 1.4–5 cm (api-notes §7.3).
    cc.keepDistance = 0.02;
    cc.keepContactTolerance = 0.03;
    this.syncFoot();

    this.tools = tools;
    this.tc = { eye: this.rig.eye, forward: this.rig.forward, right: this.rig.right, up: this.rig.up, velocity: this.velocity, ignore: this.body, holding: false };
    this.view = { eye: this.rig.eye, forward: this.rig.forward, right: this.rig.right, up: this.rig.up, yaw: 0, velocity: this.velocity, playerBody: this.body, support: null, tool: "hands" };
    this.teleport(spawn.pos, spawn.yaw, spawn.pitch);
  }

  // ------------------------------------------------------------------ PlayerSystem
  get position(): Vector3 {
    return this.rig.eye;
  }

  get forward(): Vector3 {
    return this.rig.forward;
  }

  get tool(): ToolId {
    return this.tools?.current ?? "hands";
  }

  get holding(): PhysicsBody | null {
    return this.interaction.held;
  }

  get camera(): UniversalCamera {
    return this.ctx.render.camera;
  }

  get target(): TargetInfo | null {
    return this.interaction.target;
  }

  /** The character controller's kinematic body (ignored by our own queries). */
  get body(): PhysicsBody | null {
    return (this.cc as unknown as { _body?: PhysicsBody })._body ?? null;
  }

  /** Horizontal speed (m/s). */
  get speed(): number {
    return this.hSpeed;
  }

  /** Crosshair state for the HUD. */
  get crosshair(): CrosshairState {
    return this.interaction.crosshair(this.tool);
  }

  /** Charge meter 0..1 for the HUD (throw charge, or the tool's swing charge), -1 = hidden. */
  get charge(): number {
    if (this.interaction.throwCharge >= 0) return this.interaction.throwCharge;
    const c = (this.tools as unknown as { charge?: number } | null)?.charge;
    return typeof c === "number" && Number.isFinite(c) && c > 0 ? Math.min(1, c) : -1;
  }

  setTool(t: ToolId): void {
    this.tools?.select(t);
  }

  teleport(pos: { x: number; y: number; z: number }, yaw: number, pitch: number): void {
    this.interaction.reset();
    if (this.crouched) this.setCrouched(false);
    const footY = pos.y - PLAYER.eyeStand;
    this.tmp.set(pos.x, footY + this.cc.footOffset + this.groundGap, pos.z);
    this.cc.setPosition(this.tmp);
    this.cc.setVelocity(this.v.setAll(0));
    this.velocity.setAll(0);
    this.rig.setAngles(yaw, pitch);
    this.rig.reset(PLAYER.eyeStand);
    this.grounded = false;
    this.airTime = 0;
    this.airVy = 0;
    this.jumpBufferT = this.coyoteT = this.jumpLockT = 0;
    this.hasPrevFoot = false;
    this.sinceFixed = 0;
    this.clockAccPrev = -1;
    this.phasePrev = this.phaseCur = this.footsteps.phase;
    this.syncFoot();
    this.updateEye(0);
  }

  fixedUpdate(dt: number): void {
    if (!(dt > 0)) return;
    this.sinceFixed -= FIXED_DT;
    this.stepsThisFrame++;
    this.phasePrev = this.phaseCur;
    const input = this.ctx.input;
    const holdingBefore = this.interaction.held !== null;
    const rotating = holdingBefore && input.down("rotate");
    this.applyLook(rotating);

    // ---- crouch (capsule resize; standing up needs head room)
    const wantCrouch = input.down("crouch");
    if (wantCrouch && !this.crouched) this.setCrouched(true);
    else if (!wantCrouch && this.crouched && this.canStand()) this.setCrouched(false);

    // ---- support
    this.cc.checkSupportToRef(dt, DOWN, this.surface);
    if (this.jumpLockT > 0) this.jumpLockT -= dt;
    const supported = this.surface.supportedState === CharacterSupportedState.SUPPORTED && this.jumpLockT <= 0;
    const sliding = this.surface.supportedState === CharacterSupportedState.SLIDING && this.jumpLockT <= 0;
    const wasGrounded = this.grounded;
    this.grounded = supported;
    if (supported) this.coyoteT = PLAYER.coyoteTime;
    else if (this.coyoteT > 0) this.coyoteT -= dt;

    // ---- landing
    let landSpeed = 0;
    if (supported && !wasGrounded && this.airTime > 0.05) landSpeed = Math.max(0, -this.airVy);

    // ---- desired velocity
    if (input.pressed("jump")) this.jumpBufferT = PLAYER.jumpBuffer;
    else if (this.jumpBufferT > 0) this.jumpBufferT -= dt;
    this.computeWish(input.move.x, input.move.y, input.down("sprint"));
    const v = this.v.copyFrom(this.cc.getVelocity());
    if (!(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z))) v.setAll(0);
    if (supported) this.groundMove(v, dt);
    else if (sliding) this.slideMove(v, dt);
    else this.airMove(v, dt);
    // jump (buffered, with coyote time)
    if (this.jumpBufferT > 0 && (supported || this.coyoteT > 0) && !sliding) {
      const sv = supported ? Math.max(0, this.surface.averageSurfaceVelocity.y) : 0;
      v.y = JUMP_SPEED + sv;
      this.jumpBufferT = 0;
      this.coyoteT = 0;
      this.jumpLockT = 0.12;
      this.grounded = false;
    }
    if (v.y < -55) v.y = -55;
    if (!this.grounded) {
      this.airTime += dt;
      this.airVy = v.y;
    } else this.airTime = 0;

    // ---- move the capsule
    this.cc.setVelocity(v);
    this.c0.copyFrom(this.cc.getPosition());
    this.cc.integrate(dt, this.surface, GRAVITY);
    // blocked while walking on the ground → try to step up onto a low obstacle
    if (supported && this.grounded) {
      const want = Math.hypot(v.x - this.surface.averageSurfaceVelocity.x, v.z - this.surface.averageSurfaceVelocity.z) * dt;
      const c = this.cc.getPosition();
      const got = Math.hypot(c.x - this.c0.x, c.z - this.c0.z);
      if (want > 0.004 && got < want * 0.5) this.tryStepUp(v);
    }
    this.velocity.copyFrom(this.cc.getVelocity());
    if (!(Number.isFinite(this.velocity.x) && Number.isFinite(this.velocity.y) && Number.isFinite(this.velocity.z))) {
      this.velocity.setAll(0);
      this.cc.setVelocity(this.velocity);
    }
    this.syncFoot();
    // step-up / step-down smoothing: vertical motion not explained by the velocity
    if (this.hasPrevFoot && wasGrounded && this.grounded) {
      const dy = this.foot.y - this.prevFoot.y - v.y * dt;
      if (Math.abs(dy) > 0.02 && Math.abs(dy) < 0.5) this.rig.absorbStep(dy);
    }
    const moved = this.hasPrevFoot ? Math.hypot(this.foot.x - this.prevFoot.x, this.foot.z - this.prevFoot.z) : 0;
    this.prevFoot.copyFrom(this.foot);
    this.hasPrevFoot = true;
    this.updateEye(dt);

    // fell off the building → respawn
    if (this.foot.y < PLAYER.killY) {
      const sp = this.ctx.world?.spawn ?? SPAWN;
      this.teleport(sp.pos, sp.yaw, sp.pitch);
      this.ctx.hud?.toast("You fell 31 floors. Let's pretend that didn't happen.", 4);
      return;
    }

    // ---- what is under the feet
    this.support = this.grounded || landSpeed > 0 ? this.probeSupport() : null;
    this.view.support = this.support ? this.support.body : null;
    this.loadSupport();

    if (landSpeed > 0) this.onLand(landSpeed);

    // ---- footsteps (stride distance relative to the ground)
    if (this.grounded && moved > 0 && moved < 0.5) {
      const rel = this.relativeGroundSpeed();
      const dist = Math.min(moved, rel * dt * 1.5 + 1e-3);
      if (this.footsteps.advance(dist, rel)) this.footsteps.step(this.foot.x, this.foot.y, this.foot.z, rel, this.support, this.rig.right, this.body);
    }
    this.phaseCur = this.footsteps.phase;

    // ---- actions
    this.view.tool = this.tool;
    this.view.yaw = this.rig.yaw;
    this.tc.holding = this.interaction.held !== null;
    this.handleActions(dt);
    this.interaction.fixedUpdate(dt, this.view, ++this.stepsSinceFrame > MAX_STEPS_PER_FRAME);
    this.tc.holding = this.interaction.held !== null;
    this.tools?.fixedUpdate(dt, this.tc);
  }

  update(dt: number): void {
    const rawDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    // Simulation time of this frame for the camera springs (pause, slow-mo and hit-stop slow them
    // down with the physics) and the interpolation factor; mouse look stays on real time.
    // Exact from the clock's accumulator when readable: simulated = steps·FIXED_DT + Δaccumulator.
    const acc = this.clockRemainder();
    let simDt: number;
    if (acc !== null) {
      simDt = this.clockAccPrev >= 0 ? this.stepsThisFrame * FIXED_DT + acc - this.clockAccPrev : rawDt * this.timeScale();
      this.clockAccPrev = acc;
      this.sinceFixed = acc;
    } else {
      simDt = rawDt * this.timeScale();
      this.sinceFixed += simDt;
    }
    simDt = Math.min(0.25, Math.max(0, simDt));
    this.stepsThisFrame = 0;
    this.stepsSinceFrame = 0;
    const rotating = this.interaction.held !== null && this.ctx.input.down("rotate");
    this.applyLook(rotating);
    // crosshair target follows the view every frame (one raycast per frame)
    this.view.tool = this.tool;
    this.interaction.updateFrameTarget(this.view);
    // Render interpolation: the gameplay eye moves once per fixed step; the rendered camera blends
    // between the last two fixed-step eyes by the frame time since the last step (≤ 1 step of lag,
    // no judder at any refresh rate). The bob phase is interpolated the same way.
    this.sinceFixed = Math.min(FIXED_DT, Math.max(0, this.sinceFixed));
    const alpha = this.sinceFixed / FIXED_DT;
    const ci = this.camIn;
    ci.footX = this.foot.x;
    ci.footY = this.foot.y;
    ci.footZ = this.foot.z;
    ci.eyeHeight = this.crouched ? PLAYER.eyeCrouch : PLAYER.eyeStand;
    ci.speed = this.grounded ? this.relativeGroundSpeed() : 0;
    ci.grounded = this.grounded;
    ci.sprinting = this.sprinting;
    // (resetToStrike only moves the phase forward to the next strike: a plain lerp is fine)
    ci.stridePhase = this.phasePrev + (this.phaseCur - this.phasePrev) * alpha;
    this.rig.updateCamera(ci, simDt, alpha);
    this.tc.holding = this.interaction.held !== null;
    this.tools?.update(dt, this.tc);
  }

  debugAction(a: "swing" | "chargeSwing" | "kick" | "stomp" | "grab" | "throw" | "use" | "pry", power?: number): void {
    const t = this.tools;
    this.view.tool = this.tool;
    this.view.yaw = this.rig.yaw;
    this.tc.holding = this.interaction.held !== null;
    switch (a) {
      case "swing":
        t?.debugSwing(clamp01(power ?? 0), this.tc);
        break;
      case "chargeSwing":
        t?.debugSwing(clamp01(power ?? 1), this.tc);
        break;
      case "kick":
        if (this.interaction.canSlam) this.interaction.slam();
        else t?.kick(this.tc);
        break;
      case "stomp":
        t?.stomp(this.tc);
        break;
      case "grab":
        if (this.interaction.held) this.interaction.drop("debug");
        else this.interaction.tryGrab(this.view);
        break;
      case "throw":
        this.interaction.throwHeld(this.view, clamp01(power ?? 1));
        break;
      case "use":
        this.interaction.use(this.view);
        break;
      case "pry":
        this.debugPry(power ?? 1);
        break;
    }
  }

  dispose(): void {
    this.interaction.dispose();
    this.cc.dispose();
    this.standShape.dispose();
    this.crouchShape.dispose();
  }

  /** Game clock time scale (0 = paused), sanitized. */
  private timeScale(): number {
    const s = this.ctx.time?.scale;
    return typeof s === "number" && Number.isFinite(s) ? Math.max(0, s) : 1;
  }

  /**
   * Simulation seconds the game clock has accumulated towards its next fixed step, after this
   * frame's steps — exact render interpolation that also covers hit-stop (which slows the clock
   * without touching Time.scale) and the clock's spiral-of-death reset. Uses a public `alpha`
   * (0..1) if Time provides one, else Time's accumulator field. Only trusted while the clock is
   * driven by beginFrame (frameDt > 0); null → update() mirrors the accumulator from dt·scale.
   */
  private clockRemainder(): number | null {
    const t = this.ctx.time as unknown as { alpha?: unknown; acc?: unknown; frameDt?: unknown } | undefined;
    if (!t || !(typeof t.frameDt === "number" && t.frameDt > 0)) return null;
    if (typeof t.alpha === "number" && Number.isFinite(t.alpha)) return Math.min(1, Math.max(0, t.alpha)) * FIXED_DT;
    if (typeof t.acc === "number" && Number.isFinite(t.acc)) return Math.min(FIXED_DT, Math.max(0, t.acc));
    return null;
  }

  // ------------------------------------------------------------------ movement
  /** Gap the controller keeps between the capsule and the ground (keepDistance). */
  private get groundGap(): number {
    return this.cc.keepDistance;
  }

  private makeCapsule(height: number): PhysicsShape {
    const r = PLAYER.radius;
    const s = new PhysicsShapeCapsule(new Vector3(0, height / 2 - r, 0), new Vector3(0, -height / 2 + r, 0), r, this.ctx.scene);
    // The controller's casts use the capsule's own filter: walk on/against structure and
    // furniture, pass through small debris and the held object.
    s.filterMembershipMask = Layer.PLAYER;
    s.filterCollideMask = Layer.STATIC | Layer.DYNAMIC;
    s.material = { friction: 0.5, restitution: 0 };
    return s;
  }

  private setCrouched(on: boolean): void {
    if (on === this.crouched) return;
    this.crouched = on;
    const h = on ? PLAYER.crouchHeight : PLAYER.height;
    this.cc.setShapeOptions({ shape: on ? this.crouchShape : this.standShape, capsuleHeight: h, capsuleRadius: PLAYER.radius }, true);
    this.syncFoot();
  }

  /** Is there head room for the standing capsule at the current foot position? */
  private canStand(): boolean {
    const plugin = this.getPlugin();
    const body = this.body;
    if (!plugin || !body) return true;
    const p = this.tmp.set(this.foot.x, this.foot.y + PLAYER.height / 2 + this.groundGap + 0.01, this.foot.z);
    const query: Parameters<HavokPlugin["shapeProximity"]>[0] = {
      shape: this.standShape,
      position: p,
      rotation: this.identityQ,
      maxDistance: 0,
      shouldHitTriggers: false,
      ignoreBody: body,
    };
    try {
      plugin.shapeProximity(query, this.proxIn, this.proxHit);
    } catch {
      return true;
    }
    return !this.proxHit.hasHit;
  }

  private computeWish(mx: number, my: number, sprintHeld: boolean): void {
    let len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
      len = 1;
    }
    const yaw = this.rig.yaw;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    // forward (sy, 0, cy), right (cy, 0, -sy)
    this.wish.set(sy * my + cy * mx, 0, cy * my - sy * mx);
    let speed: number = PLAYER.walkSpeed;
    this.sprinting = false;
    if (this.crouched) speed = PLAYER.crouchSpeed;
    else if (sprintHeld && my > 0.3) {
      speed = PLAYER.sprintSpeed;
      this.sprinting = len > 0.1;
    }
    // carrying heavy things slows you down; mid-swing a little too
    if (this.interaction.held && this.interaction.holdMode === "dynamic") {
      const m = this.interaction.heldMass;
      speed *= 1 - 0.5 * Math.min(1, Math.max(0, (m - 10) / 50));
    }
    if (this.tools?.busy) speed *= 0.9;
    this.wish.scaleInPlace(speed * Math.min(1, len));
    // Tether: what you hold or pull holds you back. Walking away from it is limited by the arm's
    // stretch (none below 0.5 m, fully stopped at 1.1 m), so heavy things are dragged at their own
    // pace and anchored ones are pulled at full strength instead of slipping out of the hand.
    const st = this.interaction.stretch;
    const sh = Math.hypot(st.x, st.z);
    if (this.interaction.held && sh > 0.5) {
      const ux = st.x / sh, uz = st.z / sh; // object → hand direction (horizontal)
      const along = this.wish.x * ux + this.wish.z * uz;
      if (along > 0) {
        const k = Math.max(0, Math.min(1, 1 - (sh - 0.5) / 0.6));
        this.wish.x -= ux * along * (1 - k);
        this.wish.z -= uz * along * (1 - k);
      }
    }
  }

  private groundMove(v: Vector3, dt: number): void {
    const sv = this.surface.averageSurfaceVelocity;
    const n = this.surface.averageSurfaceNormal;
    // horizontal velocity relative to the (possibly moving) ground
    let rx = v.x - sv.x, rz = v.z - sv.z;
    const wx = this.wish.x, wz = this.wish.z;
    const wLen = Math.hypot(wx, wz);
    const dx = wx - rx, dz = wz - rz;
    const dLen = Math.hypot(dx, dz);
    let rate: number = PLAYER.groundFriction;
    if (wLen > 1e-3) rate = wx * rx + wz * rz < 0 ? PLAYER.groundAccel + PLAYER.groundFriction : PLAYER.groundAccel;
    const maxDelta = rate * dt;
    if (dLen > maxDelta) {
      rx += (dx / dLen) * maxDelta;
      rz += (dz / dLen) * maxDelta;
    } else {
      rx = wx;
      rz = wz;
    }
    // follow the surface: keep the horizontal speed, add the slope's vertical component
    let vy = 0;
    if (n.y > 0.2 && Number.isFinite(n.y)) vy = -(n.x * rx + n.z * rz) / n.y;
    v.set(rx + sv.x, vy + sv.y, rz + sv.z);
  }

  private slideMove(v: Vector3, dt: number): void {
    const n = this.surface.averageSurfaceNormal;
    v.y -= PLAYER.gravity * dt;
    const vn = v.x * n.x + v.y * n.y + v.z * n.z;
    if (vn < 0) {
      v.x -= n.x * vn;
      v.y -= n.y * vn;
      v.z -= n.z * vn;
    }
    this.airControl(v, dt, PLAYER.airAccel * 0.5);
  }

  private airMove(v: Vector3, dt: number): void {
    this.airControl(v, dt, PLAYER.airAccel);
    v.y -= PLAYER.gravity * dt;
  }

  private airControl(v: Vector3, dt: number, accel: number): void {
    const wx = this.wish.x, wz = this.wish.z;
    if (wx * wx + wz * wz < 1e-6) return; // no input: keep momentum
    const dx = wx - v.x, dz = wz - v.z;
    const dLen = Math.hypot(dx, dz);
    const maxDelta = accel * dt;
    if (dLen <= maxDelta) {
      v.x = wx;
      v.z = wz;
    } else {
      v.x += (dx / dLen) * maxDelta;
      v.z += (dz / dLen) * maxDelta;
    }
  }

  private relativeGroundSpeed(): number {
    const sv = this.surface.averageSurfaceVelocity;
    const s = Math.hypot(this.velocity.x - sv.x, this.velocity.z - sv.z);
    this.hSpeed = s;
    return s;
  }

  private syncFoot(): void {
    const c = this.cc.getPosition();
    this.foot.set(c.x, c.y - this.cc.footOffset - this.groundGap, c.z);
  }

  private updateEye(dt: number): void {
    const ci = this.camIn;
    ci.footX = this.foot.x;
    ci.footY = this.foot.y;
    ci.footZ = this.foot.z;
    ci.eyeHeight = this.crouched ? PLAYER.eyeCrouch : PLAYER.eyeStand;
    this.rig.updateEye(ci, dt);
  }

  private applyLook(rotatingHeld: boolean): void {
    const look = this.ctx.input.consumeLook();
    if (look.dx === 0 && look.dy === 0) return;
    if (rotatingHeld) this.interaction.addRotation(look.dx, look.dy);
    else this.rig.addLookPixels(look.dx, look.dy);
  }

  // ------------------------------------------------------------------ support / landing
  private getPlugin(): HavokPlugin | null {
    if (this.plugin) return this.plugin;
    const fromSys = (this.ctx.physics as unknown as { plugin?: HavokPlugin }).plugin;
    this.plugin = fromSys ?? (this.ctx.scene.getPhysicsEngine()?.getPhysicsPlugin() as HavokPlugin | undefined) ?? null;
    return this.plugin;
  }

  /** Capsule shape cast (the capsule's own filter); returns the hit fraction (1 = clear) or -1 if starting in penetration. */
  private castCapsule(from: Vector3, to: Vector3): number {
    const plugin = this.getPlugin();
    const body = this.body;
    if (!plugin || !body) return -1;
    const shape = this.crouched ? this.crouchShape : this.standShape;
    try {
      plugin.shapeCast({ shape, rotation: this.identityQ, startPosition: from, endPosition: to, shouldHitTriggers: false, ignoreBody: body }, this.castIn, this.castHit);
    } catch {
      return -1;
    }
    if (!this.castHit.hasHit) return 1;
    return this.castHit.hitFraction;
  }

  /**
   * Step up onto a low STATIC/ANIMATED obstacle (≤ PLAYER.stepHeight) that blocks the capsule:
   * cast up (head room), forward ~10 cm at that height, then down onto the obstacle; teleport the
   * capsule onto the landing if it is walkable and higher than the current foot. The capsule then
   * rests on the obstacle's edge, where the rounded bottom's contact is walkable and the controller
   * carries on normally. The camera absorbs the vertical jump (CameraRig.absorbStep).
   */
  private tryStepUp(v: Vector3): boolean {
    const hs = Math.hypot(v.x, v.z);
    if (hs < 0.2) return false;
    const dx = v.x / hs, dz = v.z / hs;
    const gap = this.groundGap;
    const c = this.cc.getPosition();
    // 1. head room
    const up = this.s0.copyFrom(c);
    const upEnd = this.s1.set(c.x, c.y + PLAYER.stepHeight, c.z);
    const fu = this.castCapsule(up, upEnd);
    if (fu < 0) return false;
    const rise = Math.max(0, fu * PLAYER.stepHeight - 0.01);
    if (rise < 0.06) return false;
    // 2. forward at the raised height
    const ex = c.x, ey = c.y + rise, ez = c.z;
    const fwd = 0.1;
    this.s0.set(ex, ey, ez);
    this.s1.set(ex + dx * fwd, ey, ez + dz * fwd);
    const ff = this.castCapsule(this.s0, this.s1);
    if (ff < 0) return false;
    const fwdDist = Math.max(0, ff * fwd - 0.01);
    if (fwdDist < 0.04) return false;
    // 3. down onto the obstacle
    const sx = ex + dx * fwdDist, sz = ez + dz * fwdDist;
    const down = rise + gap;
    this.s0.set(sx, ey, sz);
    this.s1.set(sx, ey - down, sz);
    const fd = this.castCapsule(this.s0, this.s1);
    if (fd < 0 || fd >= 1) return false;
    const hitBody = this.castHit.body;
    if (!hitBody || hitBody.getMotionType(this.castHit.bodyIndex ?? 0) === PhysicsMotionType.DYNAMIC) return false;
    if (this.castHit.hitNormal.y < this.cc.maxSlopeCosine) return false;
    const landY = ey - fd * down + gap; // hover keepDistance above the contact like the controller does
    const rose = landY - c.y;
    if (rose < 0.02 || rose > PLAYER.stepHeight + 0.01) return false;
    this.tmp2.set(sx, landY, sz);
    // the landing must not overlap anything
    const plugin = this.getPlugin();
    const body = this.body;
    if (plugin && body) {
      try {
        plugin.shapeProximity(
          { shape: this.crouched ? this.crouchShape : this.standShape, position: this.tmp2, rotation: this.identityQ, maxDistance: 0, shouldHitTriggers: false, ignoreBody: body },
          this.proxIn,
          this.proxHit,
        );
        if (this.proxHit.hasHit && this.proxHit.hitDistance < -0.005) return false;
      } catch {
        return false;
      }
    }
    this.cc.setPosition(this.tmp2);
    return true;
  }

  /** Body / point / material under the feet: a short downward ray, else the controller's contacts. */
  private probeSupport(): SupportProbe | null {
    const f = this.foot;
    this.rayFrom.set(f.x, f.y + 0.4, f.z);
    this.rayTo.set(f.x, f.y - 0.25, f.z);
    let hit = null;
    try {
      hit = this.ctx.physics.raycast(this.rayFrom, this.rayTo, SUPPORT_MASK, this.body);
    } catch {
      hit = null;
    }
    if (hit) return { body: hit.body, point: hit.point, normal: hit.normal, childIndex: hit.childIndex };
    // standing on an edge: use the most upward-facing contact of the controller's manifold
    const manifold = (this.cc as unknown as { _manifold?: Array<{ position: Vector3; normal: Vector3; bodyB?: { body: PhysicsBody } }> })._manifold;
    if (!manifold) return null;
    let best: { position: Vector3; normal: Vector3; bodyB?: { body: PhysicsBody } } | null = null;
    for (const c of manifold) {
      if (!c.bodyB?.body || c.bodyB.body.isDisposed || c.normal.y < 0.5) continue;
      if (!best || c.normal.y > best.normal.y) best = c;
    }
    if (!best || !best.bodyB) return null;
    return { body: best.bodyB.body, point: best.position.clone(), normal: best.normal.clone(), childIndex: -1 };
  }

  /**
   * The player's weight on the dynamic body under the feet, as that body's gravity factor
   * (1 + carried load / own mass): Havok integrates it like a heavier body — vertical whatever the
   * contact normal, through the centre of mass, with no impulses for the solver to bounce. Impulses
   * did not work: a 7.8 kg rug pressed by 2.5–23 N·s per step between the player and the floor
   * bounced off it (restitution), tilted on the floor's few contact points (a real rug is limp) and
   * made the glass coffee table standing on it hop, creep 1.6 cm/s and take 7–12 J "hits". The load is
   * capped at supportLoadCap × the body's own weight (a light body crushed by many times its weight
   * only makes the solver jitter; it stays put either way). Stepping onto or off a body wakes it (a
   * plank resting on something unstable reacts); a sleeping body under a player standing still stays
   * asleep — its gravity factor does not move it. Landing stomps (onLand) strike at the contact point.
   */
  private loadSupport(): void {
    const sp = this.support;
    let target: PhysicsBody | null = null;
    let factor = 1;
    if (sp && this.grounded && sp.body !== this.body && !sp.body.isDisposed && sp.body._pluginData && sp.body.getMotionType() === PhysicsMotionType.DYNAMIC) {
      let m: number | null = null;
      try {
        m = this.ctx.destruction.massOf(sp.body);
      } catch {
        m = null;
      }
      if (m === null || !(m > 0)) m = sp.body.getMassProperties().mass ?? 0;
      if (m > 0 && Number.isFinite(m)) {
        target = sp.body;
        factor = 1 + Math.min(PLAYER.mass, PLAYER.supportLoadCap * m) / m;
      }
    }
    const prev = this.loaded;
    if (prev && prev !== target) {
      if (!prev.isDisposed && prev._pluginData) {
        prev.setGravityFactor(1);
        this.ctx.physics.wake(prev);
      }
      this.loaded = null;
    }
    if (target) {
      if (prev !== target) {
        target.setGravityFactor(factor);
        this.loadedFactor = factor;
        this.ctx.physics.wake(target);
      } else if (Math.abs(this.loadedFactor - factor) > 0.01) {
        target.setGravityFactor(factor);
        this.loadedFactor = factor;
      }
      this.loaded = target;
    }
  }

  /** Body carrying the player's weight through its gravity factor (loadSupport), and that factor. */
  private loaded: PhysicsBody | null = null;
  private loadedFactor = 1;

  private onLand(speed: number): void {
    this.rig.land(speed);
    this.footsteps.resetToStrike();
    const sp = this.support;
    const mat = this.footsteps.materialAt(this.foot.x, this.foot.y, this.foot.z, sp);
    if (speed >= PLAYER.landEventSpeed) {
      const p = sp ? sp.point : this.foot;
      this.ctx.events.emit("land", { pos: { x: p.x, y: p.y, z: p.z }, speed, mat });
    }
    if (speed > 4.5) this.ctx.render.shake(Math.min(0.45, (speed - 4.5) / 12));
    // stomp: landing hard on one of our bodies damages it. Only landings clearly harder than a
    // normal jump count, and only the energy beyond a jump landing reaches the target (the legs
    // absorb an ordinary landing): v_eff = √(v² − v_jump²). Anchored floors need a real fall.
    if (speed > PLAYER.stompSpeed && sp) {
      let ours = false;
      let anchored = false;
      try {
        ours = this.ctx.destruction.massOf(sp.body) !== null;
        anchored = ours && this.ctx.destruction.isStatic(sp.body);
      } catch {
        ours = false;
      }
      const effSpeed = Math.sqrt(Math.max(0, speed * speed - JUMP_SPEED * JUMP_SPEED));
      if (ours && effSpeed > 0.5 && (!anchored || speed > PLAYER.stompSpeedStatic)) {
        try {
          // (strike copies point/dir: scratch vectors are safe)
          this.ctx.destruction.strike({
            point: this.stompPoint.copyFrom(sp.point),
            dir: this.stompDir.set(0, -1, 0),
            body: sp.body,
            childIndex: sp.childIndex,
            mass: PLAYER.stompMass,
            speed: effSpeed,
            sharpness: 1,
            contactRadius: PLAYER.stompContactRadius,
            strikerMat: "flesh",
            source: "stomp",
          });
        } catch (e) {
          console.warn("stomp strike failed", e);
        }
      }
    }
  }

  // ------------------------------------------------------------------ actions
  private handleActions(dt: number): void {
    const input = this.ctx.input;
    const it = this.interaction;
    const tools = this.tools;
    if (input.pressed("grab")) it.toggleGrab(this.view);
    const wheel = input.consumeWheel();
    if (it.held) {
      // Edges that mean nothing while holding are consumed here, so a press made while holding
      // does not fire a stale use / pry on the step after a throw or drop (edges latch ≈250 ms).
      input.pressed("use");
      input.pressed("alt");
      input.released("alt");
      if (input.pressed("fire")) {
        // free dynamic holds charge a throw; doors/drawers and anchored things are just let go
        // (a thrown velocity on a jointed body would spike its joint load)
        if (it.canThrow) it.beginCharge();
        else it.drop("fire");
      }
      if (it.held && input.released("fire") && it.isCharging) it.throwHeld(this.view);
      // F: slam a free held object (ignored during the slam cooldown); while pulling a door /
      // anchored thing it kicks instead, so the press is never lost
      if (input.pressed("kick")) {
        if (it.canSlam) it.slam();
        else tools?.kick(this.tc);
      }
      if (input.pressed("drop")) it.drop("key");
      if (wheel !== 0) it.addWheel(wheel);
      this.wheelAcc = 0;
    } else {
      if (input.pressed("kick")) tools?.kick(this.tc);
      if (input.pressed("drop") && tools && tools.current !== "hands") tools.select("hands");
      if (input.pressed("use")) it.use(this.view);
      // wheel cycles tools when the hands are free
      if (wheel !== 0 && tools) {
        this.wheelAcc += wheel;
        if (Math.abs(this.wheelAcc) >= 1) {
          const dir = this.wheelAcc > 0 ? -1 : 1; // wheel forward = previous slot
          this.wheelAcc = 0;
          const i = TOOL_SLOTS.indexOf(tools.current);
          tools.select(TOOL_SLOTS[(i + dir + TOOL_SLOTS.length) % TOOL_SLOTS.length]);
        }
      }
    }
    if (input.pressed("stomp")) tools?.stomp(this.tc);
    for (let i = 0; i < SLOT_ACTIONS.length; i++) {
      if (input.pressed(SLOT_ACTIONS[i]) && tools) tools.select(TOOL_SLOTS[i]);
    }
    void dt;
  }

  /** Debug/test pry: hold the alt action with the crowbar for `seconds` (falls back to a direct pry). */
  private debugPry(seconds: number): void {
    const tools = this.tools;
    if (tools && tools.current !== "crowbar") tools.select("crowbar");
    const input = this.ctx.input as unknown as { hold?: (a: "alt", s: number) => void };
    if (tools && typeof input.hold === "function") {
      input.hold("alt", Math.max(0.05, seconds));
      return;
    }
    // no tool system / foreign input: one direct pry impulse of `seconds` duration
    this.rayFrom.copyFrom(this.rig.eye);
    this.rayTo.copyFrom(this.rig.forward).scaleInPlace(PRY_REACH).addInPlace(this.rig.eye);
    const hit = this.ctx.physics.raycast(this.rayFrom, this.rayTo, PRY_MASK, this.body);
    if (hit) this.ctx.destruction.pry(hit.body, hit.point, this.tmp2.copyFrom(this.rig.forward), 3000, Math.max(0.016, seconds));
  }
}

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
}
