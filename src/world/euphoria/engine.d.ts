/** Type declarations for the parts of the Ragdoll Lab engine (engine.js) the game uses. */

export interface XYZ {
  x: number;
  y: number;
  z: number;
}
export interface XYZW extends XYZ {
  w: number;
}

export class Vec3 implements XYZ {
  x: number;
  y: number;
  z: number;
  constructor(x?: number, y?: number, z?: number);
  set(x: number, y: number, z: number): this;
  copy(v: XYZ): this;
  clone(): Vec3;
  setZero(): this;
  add(v: XYZ): this;
  sub(v: XYZ): this;
  addVectors(a: XYZ, b: XYZ): this;
  subVectors(a: XYZ, b: XYZ): this;
  scale(s: number): this;
  addScaled(v: XYZ, s: number): this;
  negate(): this;
  dot(v: XYZ): number;
  crossVectors(a: XYZ, b: XYZ): this;
  lengthSq(): number;
  length(): number;
  normalize(): this;
  distanceTo(v: XYZ): number;
  lerp(v: XYZ, t: number): this;
  applyQuat(q: XYZW): this;
  applyQuatInv(q: XYZW): this;
}

export class Quat implements XYZW {
  x: number;
  y: number;
  z: number;
  w: number;
  constructor(x?: number, y?: number, z?: number, w?: number);
  set(x: number, y: number, z: number, w: number): this;
  copy(q: XYZW): this;
  clone(): Quat;
  identity(): this;
  multiplyQuats(a: XYZW, b: XYZW): this;
  multiply(q: XYZW): this;
  multiplyConjA(a: XYZW, b: XYZW): this;
  multiplyConjB(a: XYZW, b: XYZW): this;
  conjugate(): this;
  normalize(): this;
  setFromAxisAngle(axis: XYZ, angle: number): this;
  setFromUnitVectors(a: XYZ, b: XYZ): this;
  toRotVec(out: Vec3): Vec3;
  setFromRotVec(v: XYZ): this;
  slerp(q: XYZW, t: number): this;
}

export class Shape {
  type: number; // 0 sphere, 1 capsule, 2 (rounded) box
  radius: number;
  halfHeight: number;
  halfExtents: Vec3;
  localPos: Vec3;
  localRot: Quat;
  friction: number;
  restitution: number;
  material: string;
  collides: boolean;
  tag: string | null;
  body: Body | null;
  wPos: Vec3;
  wRot: Quat;
  static sphere(r: number, opts?: Record<string, unknown>): Shape;
  static capsule(r: number, halfHeight: number, opts?: Record<string, unknown>): Shape;
  static box(hx: number, hy: number, hz: number, opts?: Record<string, unknown>): Shape;
  updateWorld(pos: XYZ, rot: XYZW): void;
}

export class Body {
  id: number;
  name: string;
  pos: Vec3;
  rot: Quat;
  vel: Vec3;
  angVel: Vec3;
  /** State at the start of the last world step (render interpolation). */
  framePos: Vec3;
  frameRot: Quat;
  mass: number;
  invMass: number;
  isStatic: boolean;
  shapes: Shape[];
  force: Vec3;
  torque: Vec3;
  contactImpulse: Vec3;
  contactCount: number;
  groundContact: boolean;
  collisionGroup: number;
  collisionMask: number;
  userData: Record<string, unknown>;
  aabbMin: Vec3;
  aabbMax: Vec3;
  ignore: Set<Body> | null;
  maxLinearSpeed: number;
  maxAngularSpeed: number;
  /** Game flag: a static body whose pose the game moves every frame (prop proxy). */
  kinematic?: boolean;
  _aabbReady?: boolean;
  constructor(opts?: { name?: string; isStatic?: boolean; linearDamping?: number; angularDamping?: number });
  addShape(s: Shape): Shape;
  makeStatic(): void;
  setPose(pos: XYZ, rot: XYZW): void;
  applyImpulse(imp: XYZ, at: XYZ): void;
  applyAngularImpulse(imp: XYZ): void;
  applyForceAt(f: XYZ, at: XYZ): void;
  velocityAt(p: XYZ, out: Vec3): Vec3;
  localToWorld(p: XYZ, out: Vec3): Vec3;
  worldToLocal(p: XYZ, out: Vec3): Vec3;
  kineticEnergy(): number;
}

export interface ImpactRecord {
  bodyA: Body;
  bodyB: Body | null;
  shapeA: Shape | null;
  shapeB: Shape | null;
  impulse: number;
  speed: number;
  point: Vec3;
  normal: Vec3;
}

export class World {
  gravity: Vec3;
  substeps: number;
  groundY: number;
  bodies: Body[];
  staticBodies: Body[];
  impactList: ImpactRecord[];
  stats: { contacts: number; pairs: number; stepMs: number };
  constructor(opts?: { gravity?: number; substeps?: number; groundHalfSize?: number });
  setGroundRect(minX: number, minZ: number, maxX: number, maxZ: number): void;
  addBody(b: Body): Body;
  removeBody(b: Body): void;
  step(dt: number): void;
  surfaceAt(x: number, z: number, top?: number): number;
}

export class Joint {
  name: string;
  parent: Body;
  child: Body;
  enabled: boolean;
  userData: Record<string, unknown>;
}

export interface Segment {
  name: string;
  side: 'L' | 'R' | 'C';
  body: Body;
  bindPos: Vec3;
  parent: Segment | null;
  children: Segment[];
  joint: Joint | null;
}

export class Ragdoll {
  world: World;
  segments: Record<string, Segment>;
  segList: Segment[];
  joints: Record<string, Joint>;
  jointList: Joint[];
  bodies: Body[];
  totalMass: number;
  constructor(world: World, opts?: { position?: XYZ; yaw?: number });
  addToWorld(): void;
  removeFromWorld(): void;
  resetPose(pos: XYZ, yaw?: number): void;
  /** Pelvis world pose + per-joint local rotations (parent^-1 * child). */
  applyPose(pelvisPos: XYZ, pelvisRot: XYZW, local: Record<string, XYZW>): void;
  readonly pelvis: Body;
  computeCOM(out?: Vec3): Vec3;
  computeCOMVelocity(out?: Vec3): Vec3;
  allBodies(): Body[];
  isRagdollBody(b: Body | null): boolean;
  kineticEnergy(): number;
}

export type ControllerMode = 'balance' | 'falling' | 'ground' | 'getup' | 'unconscious' | 'dead';

export interface ControllerWound {
  body: Body;
  segment: Segment;
  /** Point in the body's local frame. */
  local: Vec3;
  /** Outward normal in the body's local frame. */
  normal: Vec3;
  priority: number;
}

export interface ControllerThreat {
  point: Vec3;
  from: Vec3;
  tti: number;
  miss: number;
  body: Body | null;
}

export interface ControllerSenses {
  com: Vec3;
  comVel: Vec3;
  floorY: number;
  upTilt: number;
  chestTilt: number;
  pelvisH: number;
  headH: number;
  footContact: { L: boolean; R: boolean };
  torsoGround: boolean;
}

export class Controller {
  rd: Ragdoll;
  mode: ControllerMode;
  modeTime: number;
  time: number;
  tone: number;
  toneTarget: number;
  alive: boolean;
  conscious: boolean;
  pain: number;
  fear: number;
  startle: number;
  legStrength: { L: number; R: number };
  armStrength: { L: number; R: number };
  spineStrength: number;
  neckStrength: number;
  balanceSkill: number;
  strengthScale: number;
  autoGetUp: boolean;
  assistGain: number;
  stepAssist: number;
  vAssist: number;
  chestAssist: number;
  respiration: number;
  reactions: 'realistic' | 'rdr';
  fearless: boolean;
  wounds: ControllerWound[];
  threat: ControllerThreat | null;
  lookTarget: XYZ | null;
  heading: number;
  fallDir: Vec3;
  fallCause: string;
  lostReason?: string;
  sens: ControllerSenses;
  gu: { phase: string; kind: string; t: number } | null;
  events: { type: string; [k: string]: unknown }[];
  dying: { t: number; dur: number; done?: boolean } | null;
  constructor(rd: Ragdoll, opts?: { rng?: () => number });
  update(dt: number): void;
  setMode(m: ControllerMode): void;
  resumeBalance(): void;
  onHit(h: { strength: number; segment: string; dir?: XYZ | null; kind?: string }): void;
  onKnockOut(severity: number): void;
  onDeath(cause?: string): void;
  ableToGetUp(strict?: boolean): boolean;
}

export const LANDMARKS: Record<string, Vec3>;
export const SEGMENT_DEFS: { name: string; parent: string | null; mass: number; joint?: string }[];
export const JOINT_DEFS: Record<string, { k: number; d: number; tmax: number }>;

/** Build ragdolls/controllers for a body of height scale `s` and bulk `b` inside `fn`. */
export function withBuildScale<T>(s: number, b: number, fn: () => T): T;
