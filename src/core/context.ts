// GameContext: the service container passed to every system, plus the cross-system
// interfaces (contracts). Each system class `implements` its interface here. Changing an
// interface is an orchestrator decision — propose changes in your report.

import type {
  AbstractMesh,
  Engine,
  Mesh,
  PhysicsBody,
  PhysicsConstraint,
  PhysicsShape,
  Scene,
  TransformNode,
  Vector3,
  Material,
  Light,
  UniversalCamera,
} from "@babylonjs/core";
import type { Vec3, Xform, Quat } from "../geom/vec.ts";
import type { RenderGeom } from "../geom/meshgen.ts";
import type { AssemblyDef, BondKind, FeatureDef } from "../destruction/model/types.ts";
import type { MaterialId, MicroKind } from "../destruction/model/materials.ts";
import type { EventBus, GameEvents } from "./events.ts";
import type { Rng } from "./rng.ts";
import type { Settings, QualityPreset } from "./settings.ts";
import type { Time } from "./time.ts";

// ======================================================================== physics
/** Collision layers (bit masks) — see docs/api-notes/physics-*.md for filter semantics. */
export const Layer = {
  /** Static structure & anchored islands. */
  STATIC: 1 << 0,
  /** Dynamic islands (furniture, appliances, large fragments). */
  DYNAMIC: 1 << 1,
  /** Small dynamic debris (does not push the player around). */
  DEBRIS: 1 << 2,
  /** Player character capsule. */
  PLAYER: 1 << 3,
  /** Object currently held by the player. */
  HELD: 1 << 4,
  /** Trigger volumes. */
  TRIGGER: 1 << 5,
} as const;
export type LayerBits = number;

export interface RayHit {
  body: PhysicsBody;
  point: Vector3;
  normal: Vector3;
  distance: number;
  /** Index of the hit child shape in a container shape, or -1 if unknown. */
  childIndex: number;
}

export interface SweepHit extends RayHit {
  /** 0..1 along the sweep. */
  fraction: number;
}

/** Normalised collision report produced by the physics system each step. */
export interface RawImpact {
  bodyA: PhysicsBody;
  bodyB: PhysicsBody;
  point: Vector3; // world, copied (safe to keep)
  normal: Vector3; // world unit, from A towards B, copied
  /** Normal impulse magnitude (N·s) for the step. */
  impulse: number;
  started: boolean;
}

export interface ShapeOpts {
  density?: number;
  friction?: number;
  restitution?: number;
  /** Membership bits (Layer). */
  layer?: LayerBits;
  /** Collide-with bits. */
  collideWith?: LayerBits;
}

export interface HingeOpts {
  /** Pivot and axis in each body's LOCAL frame. */
  pivotA: Vector3;
  pivotB: Vector3;
  axisA: Vector3;
  axisB: Vector3;
  /** Angular limits (radians) relative to the creation pose; omit for free rotation. */
  min?: number;
  max?: number;
  friction?: number;
  /** Position motor holding a target angle with limited torque (latches/springs). */
  motor?: { target: number; maxForce: number };
  collideConnected?: boolean;
}

export interface SliderOpts {
  pivotA: Vector3;
  pivotB: Vector3;
  axisA: Vector3;
  axisB: Vector3;
  min: number;
  max: number;
  friction?: number;
  collideConnected?: boolean;
}

export interface PhysicsStats {
  bodies: number;
  awake: number;
  stepMs: number;
  constraints: number;
}

export interface PhysicsSystem {
  /** Advance exactly one fixed step of FIXED_DT, then dispatch buffered impacts. */
  step(dt: number): void;
  /** Called with every impact above `minImpulse` (N·s) after each step. */
  onImpact(cb: (e: RawImpact) => void): void;
  minImpulse: number;

  createBody(node: TransformNode, motion: "static" | "dynamic" | "animated", startAsleep?: boolean): PhysicsBody;
  disposeBody(body: PhysicsBody): void;
  /** Convex hull from packed xyz points in the body frame. */
  hullShape(points: Float32Array, opts?: ShapeOpts): PhysicsShape;
  boxShape(center: Vec3, rotation: Quat, size: Vec3, opts?: ShapeOpts): PhysicsShape;
  sphereShape(center: Vec3, radius: number, opts?: ShapeOpts): PhysicsShape;
  /** Compound of child shapes (children already expressed in the body frame). */
  containerShape(children: PhysicsShape[], opts?: ShapeOpts): PhysicsShape;
  setShape(body: PhysicsBody, shape: PhysicsShape): void;
  setMotion(body: PhysicsBody, motion: "static" | "dynamic" | "animated"): void;
  setLayer(shape: PhysicsShape, layer: LayerBits, collideWith?: LayerBits): void;
  wake(body: PhysicsBody): void;
  isAwake(body: PhysicsBody): boolean;

  raycast(from: Vector3, to: Vector3, collideWith?: LayerBits, ignore?: PhysicsBody | null): RayHit | null;
  sphereSweep(from: Vector3, to: Vector3, radius: number, collideWith?: LayerBits, ignore?: PhysicsBody | null): SweepHit | null;

  hinge(a: PhysicsBody, b: PhysicsBody, o: HingeOpts): PhysicsConstraint;
  slider(a: PhysicsBody, b: PhysicsBody, o: SliderOpts): PhysicsConstraint;
  ball(a: PhysicsBody, b: PhysicsBody, pivotA: Vector3, pivotB: Vector3, collideConnected?: boolean): PhysicsConstraint;
  removeConstraint(c: PhysicsConstraint): void;
  /** Static body representing the building (target for world-anchored joints). */
  readonly worldBody: PhysicsBody;

  stats(): PhysicsStats;

  // ---- optional helpers (all implemented by src/physics/physics.ts; optional so test doubles may omit them)
  /** Fixed steps completed so far. */
  readonly stepIndex?: number;
  /** Hinge position motor: drive to `target` (rad) with at most `maxForce` (N·m); maxForce ≤ 0 releases it. */
  setHingeMotor?(c: PhysicsConstraint, target: number, maxForce: number): void;
  /** Hinge angular limits (rad, relative to the creation pose); both undefined = free. */
  setHingeLimits?(c: PhysicsConstraint, min?: number, max?: number): void;
  /** Current hinge angle (rad, 0 = creation pose, same sign as limits/motor targets); NaN if unknown. */
  hingeAngle?(c: PhysicsConstraint): number;
  /** Current slider travel (m along axisA, 0 = creation pose); NaN if unknown. */
  sliderPosition?(c: PhysicsConstraint): number;
  /** Average constraint force (N) / torque (N·m) magnitudes over the last fixed step (all substeps). */
  constraintLoad?(c: PhysicsConstraint): { force: number; torque: number };
  /** Constraint impulse over the last fixed step (all substeps), world N·s / N·m·s, plus that step's dt. */
  appliedImpulse?(c: PhysicsConstraint, out?: { linear: Vector3; angular: Vector3; dt: number }): { linear: Vector3; angular: Vector3; dt: number };
  /** Move a body immediately (node and physics agree; sync baseline re-seeded); resets velocity by default. */
  teleport?(body: PhysicsBody, pos: Vec3, rot?: Quat | null, resetVelocity?: boolean): void;
  /** Keep a body permanently awake (held objects) or return it to simulation control. */
  setKeepAwake?(body: PhysicsBody, on: boolean): void;
  /** Body spun by a powered motor (fan rotor): kept out of the sleep assist's pile grouping. */
  setDriven?(body: PhysicsBody, on: boolean): void;
  /** Suppress impacts involving `body` for the next `steps` fixed steps (fragments spawned in contact). */
  muteImpacts?(body: PhysicsBody, steps: number): void;
  /** Velocity was changed by raw Havok calls: re-read it before the next step (Babylon setters are tracked already). */
  expectFast?(body: PhysicsBody): void;
  /** Mass (kg) of a dynamic body; Infinity for static/animated/unknown. */
  massOf?(body: PhysicsBody): number;
  /** Every hit along from→to, nearest first. */
  raycastAll?(from: Vector3, to: Vector3, collideWith?: LayerBits, ignore?: PhysicsBody | null): RayHit[];
  /** Dispose a shape (deep: also its children). */
  disposeShape?(shape: PhysicsShape, deep?: boolean): void;
  /** Force-sleep policy for slow dynamic bodies (thresholds in m/s, rad/s, s). */
  setAutoSleep?(enabled: boolean, thresholds?: { linear?: number; angular?: number; seconds?: number }): void;
}

// ======================================================================== render
export interface IslandMeshes {
  opaque: Mesh | null;
  glass: Mesh | null;
}

export interface RenderSystem {
  readonly worldMaterial: Material;
  readonly glassMaterial: Material;
  readonly camera: UniversalCamera;
  /** Build/replace the batched meshes of an island from its parts' render geometry (island frame). */
  buildIsland(node: TransformNode, geoms: RenderGeom[], prev: IslandMeshes | null, name: string): IslandMeshes;
  disposeIsland(m: IslandMeshes): void;
  /** Register shadow casters (large = also in far cascades). */
  setShadowCaster(mesh: AbstractMesh, cast: boolean, large?: boolean): void;
  /** Interior light bookkeeping (room-based light assignment, flicker, power). */
  addLight(light: Light, roomId: string | null, mains: boolean): void;
  removeLight(light: Light): void;
  setPower(on: boolean): void;
  /** Camera shake (0..1 trauma) and full-screen impact flash. */
  shake(trauma: number): void;
  /** Current camera shake offsets (metres / radians) for the player camera to apply this frame. */
  getShake(): { pos: Vec3; rot: Vec3 };
  flash(intensity: number, color?: number): void;
  setPS2Mode(on: boolean): void;
  /** Re-capture the reflection environment (call after the apartment is built). */
  captureEnvironment(): void;
  applyQuality(q: QualityPreset): void;
  update(dt: number): void;
}

// ======================================================================== destruction
export type ToolId = "hands" | "hammer" | "sledgehammer" | "crowbar" | "bat" | "axe" | "extinguisher";

export interface StrikeInput {
  /** World contact point and unit direction of travel of the striker. */
  point: Vector3;
  dir: Vector3;
  /** Body that was hit (from the sweep/raycast). */
  body: PhysicsBody;
  childIndex: number;
  /** Effective striking mass (kg) and speed (m/s) at contact. */
  mass: number;
  speed: number;
  /** Concentration multiplier (1 = blunt; axe ~2.2 on wood). */
  sharpness: number;
  /** Contact radius (m). */
  contactRadius: number;
  /** Striker material (steel for tools, flesh for fists/feet). */
  strikerMat: MaterialId;
  source: "tool" | "fist" | "kick" | "stomp" | "slam" | "debug";
  tool?: ToolId;
}

export interface StrikeResult {
  /** Energy delivered to the target (J). */
  energy: number;
  /** Impulse applied to the target body (N·s). */
  impulse: number;
  /** Target hardness 0..1 (recoil, hit-stop, "ouch"). */
  hardness: number;
  targetMat: MaterialId | null;
  partName: string | null;
  assemblyName: string | null;
  broke: boolean;
}

export interface TargetInfo {
  assemblyId: number;
  assemblyType: string;
  assemblyName: string;
  partName: string;
  mat: MaterialId;
  /** 0..1 damage of the assembly. */
  damage: number;
  /** Island mass (kg) and whether it is static/anchored. */
  mass: number;
  isStatic: boolean;
  /** Can be grabbed (dynamic, or static/jointed but pullable). */
  grabbable: boolean;
  /** Has a joint (door/drawer) — E toggles it. */
  usable: "door" | "drawer" | "switch" | "tv" | "faucet" | null;
}

export interface DestructionStats {
  assemblies: number;
  islands: number;
  dynamicIslands: number;
  parts: number;
  fractures: number;
  bondsBroken: number;
  /** Dynamic islands on the DEBRIS layer (small bodies, intact small objects included; consolidated ones too). */
  debrisIslands: number;
  /** Dynamic islands that broke off something (fracture fragments, split-off pieces) — the HUD's debris count. */
  debrisPieces?: number;
  consolidated: number;
  valueDestroyed: number;
  totalValue: number;
  msLastStep: number;
}

export interface DestructionSystem {
  spawn(def: AssemblyDef, xf: Xform): number;
  strike(s: StrikeInput): StrikeResult;
  /** Crowbar pry: apply leverage stress to bonds near the point for dt seconds. Returns stress 0..1 of the weakest affected bond (0 if none). */
  pry(body: PhysicsBody, point: Vector3, dir: Vector3, force: number, dt: number): number;
  /** Player pulling a grabbed body with force (N) at a world point: stresses joints/world bonds. */
  pull(body: PhysicsBody, point: Vector3, force: Vector3, dt: number): void;
  /** Use-key interaction (open/close door/drawer, toggle switch/TV/faucet). */
  use(body: PhysicsBody, point: Vector3, from: Vector3): boolean;
  target(body: PhysicsBody, point: Vector3, childIndex: number): TargetInfo | null;
  /** Island mass if this body is one of ours (else null). */
  massOf(body: PhysicsBody): number | null;
  isStatic(body: PhysicsBody): boolean;
  /** Material under a point on a body (footsteps, landing). */
  materialAt(body: PhysicsBody, point: Vector3, childIndex: number): MaterialId | null;
  beforePhysics(dt: number): void;
  afterPhysics(dt: number): void;
  update(dt: number): void;
  stats(): DestructionStats;
  /** Debug/introspection: list spawned assemblies. */
  list(): Array<{ id: number; type: string; name: string; damage: number; islands: number; parts: number; pos: Vec3 }>;
  /** World position of an assembly's first island (debug/tests). */
  positionOf(id: number): Vec3 | null;
}

// ======================================================================== audio
export interface LoopHandle {
  setPosition(p: Vec3): void;
  setGain(g: number): void;
  stop(fadeSec?: number): void;
}

export interface RoomAcoustics {
  id: string;
  /** Reverb time RT60 (s), brightness 0..1, wet level 0..1. */
  rt60: number;
  brightness: number;
  wet: number;
}

export interface AudioSystem {
  /** Must be called from a user gesture before audio can start. */
  resume(): Promise<void>;
  /** Listener pose (call every frame). */
  setListener(pos: Vector3, forward: Vector3, up: Vector3): void;
  /** One-shot by sound id (see src/audio/bank.ts). */
  play(id: string, pos: Vec3 | null, opts?: { gain?: number; pitch?: number; size?: number; priority?: number }): void;
  loop(id: string, pos: Vec3 | null, opts?: { gain?: number; pitch?: number }): LoopHandle;
  setMasterVolume(v: number): void;
  update(dt: number): void;
  readonly activeVoices: number;
}

// ======================================================================== vfx
export type VfxKind =
  | "dust"
  | "drywallDust"
  | "concreteDust"
  | "woodChips"
  | "splinters"
  | "sparks"
  | "glassGlitter"
  | "water"
  | "waterDrip"
  | "smoke"
  | "feathers"
  | "foam"
  | "paper"
  | "soil"
  | "ceramicChips"
  | "plasticBits"
  | "insulationFluff"
  | "liquid"
  | "extinguisher";

export interface EmitterHandle {
  setPosition(p: Vec3): void;
  setDirection(d: Vec3): void;
  setRate(r: number): void;
  stop(): void;
}

export interface VfxSystem {
  burst(kind: VfxKind, pos: Vec3, normal: Vec3, intensity: number, opts?: { tint?: number; dir?: Vec3 }): void;
  emitter(kind: VfxKind, pos: Vec3, dir: Vec3, rate: number, opts?: { tint?: number }): EmitterHandle;
  /** One micro-debris particle (no physics body): small fragment with ballistic motion. */
  micro(kind: MicroKind, pos: Vec3, vel: Vec3, size: number, surf: number, tint: number): void;
  /** Persistent decal (impact mark, scorch, puddle) on a surface. */
  decal(kind: "impact" | "scorch" | "puddle" | "crack", pos: Vec3, normal: Vec3, size: number): void;
  fixedUpdate(dt: number): void;
  update(dt: number): void;
  readonly particleCount: number;
  readonly microCount: number;
}

// ======================================================================== input / player / world / hud
export type Action =
  | "fire"
  | "alt"
  | "grab"
  | "jump"
  | "crouch"
  | "sprint"
  | "use"
  | "kick"
  | "stomp"
  | "drop"
  | "rotate"
  | "pause"
  | "debug"
  | "slot1"
  | "slot2"
  | "slot3"
  | "slot4"
  | "slot5"
  | "slot6"
  | "slot7";

export interface InputSystem {
  /** Movement axes in [-1,1]: x = strafe right, y = forward. */
  readonly move: { x: number; y: number };
  /** Mouse look delta since last consume (pixels, already sensitivity-scaled). */
  consumeLook(): { dx: number; dy: number };
  consumeWheel(): number;
  down(a: Action): boolean;
  /** True once per press (edge), cleared when read. */
  pressed(a: Action): boolean;
  released(a: Action): boolean;
  readonly locked: boolean;
  requestLock(): void;
  exitLock(): void;
  update(): void;
}

export interface PlayerSystem {
  readonly position: Vector3; // eye position
  readonly forward: Vector3;
  readonly tool: ToolId;
  readonly holding: PhysicsBody | null;
  readonly camera: UniversalCamera;
  setTool(t: ToolId): void;
  teleport(pos: Vec3, yaw: number, pitch: number): void;
  fixedUpdate(dt: number): void;
  update(dt: number): void;
  /** Debug/test hooks: perform an action as if the player pressed it this step. */
  debugAction(a: "swing" | "chargeSwing" | "kick" | "stomp" | "grab" | "throw" | "use" | "pry", power?: number): void;
  readonly target: TargetInfo | null;
}

export interface RoomInfo {
  id: string;
  name: string;
  min: Vec3;
  max: Vec3;
  acoustics: RoomAcoustics;
  floor: MaterialId;
}

export interface WorldSystem {
  build(): Promise<void>;
  roomAt(p: Vec3): RoomInfo | null;
  readonly rooms: RoomInfo[];
  readonly spawn: { pos: Vec3; yaw: number; pitch: number };
}

export interface HudSystem {
  update(dt: number): void;
  toast(text: string, seconds?: number): void;
  setLoading(progress: number, label: string): void;
  hideLoading(): void;
  readonly menuOpen: boolean;
}

export interface DebugSystem {
  update(dt: number): void;
}

// ======================================================================== context
export interface GameContext {
  engine: Engine;
  scene: Scene;
  canvas: HTMLCanvasElement;
  time: Time;
  settings: Settings;
  rng: Rng;
  events: EventBus<GameEvents>;
  physics: PhysicsSystem;
  render: RenderSystem;
  destruction: DestructionSystem;
  audio: AudioSystem;
  vfx: VfxSystem;
  input: InputSystem;
  player: PlayerSystem;
  world: WorldSystem;
  hud: HudSystem;
  debug: DebugSystem;
}

// Re-exported for convenience in implementations.
export type { BondKind, FeatureDef, Xform };
