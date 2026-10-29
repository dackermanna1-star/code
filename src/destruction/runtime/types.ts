// Runtime data model of the destruction system (docs/ARCHITECTURE.md §4.1):
//   Part      — one convex piece (collision + fracture source) in the shared ASSEMBLY frame
//   Bond      — a joint between two parts (or a part and the world) with energy health
//   Island    — a rigid body: TransformNode + PhysicsBody (container of part shapes) + meshes
//   Assembly  — parts + bonds + islands + joint groups + features of one spawned object
//   JointGroup— hinge/slider bonds (+ optional latch) that become physics constraints
// All parts of an assembly live in ONE frame (the assembly frame at spawn); an island's node
// maps that frame to the world, so a part's coordinates never change when islands split.

import type { PhysicsBody, PhysicsConstraint, PhysicsShape, TransformNode } from "@babylonjs/core";
import type { Vec3, Xform } from "../../geom/vec.ts";
import type { Bounds, ConvexPoly } from "../../geom/poly.ts";
import type { Crack, Dent, RenderGeom } from "../../geom/meshgen.ts";
import type { MaterialDef, MaterialId } from "../model/materials.ts";
import type { BondState, DamagePoint, FracturePlan, PartState } from "../model/damage.ts";
import type { AssemblyCategory, AssemblyDef, BondKind, JointDef } from "../model/types.ts";
import type { IslandMeshes } from "../../core/context.ts";
import type { BoxInfo } from "./polyUtil.ts";
import type { PartGrid } from "./partGrid.ts";
import type { PartFeature } from "../features/feature.ts";

export class Part implements PartState {
  readonly id: number;
  /** Blueprint name; fragments get "<parent>#<gen>.<cell>". */
  readonly name: string;
  readonly asm: Assembly;
  island: Island | null = null;
  readonly matId: MaterialId;
  readonly mat: MaterialDef;
  /** Convex hull in the assembly (= island) frame. Treated as immutable except surface swaps. */
  poly: ConvexPoly;
  readonly volume: number;
  /** kg (density × volume, or the blueprint override scaled for fragments). */
  readonly mass: number;
  readonly centroid: Vec3;
  readonly ext: [number, number, number];
  readonly bounds: Bounds;
  readonly grain?: Vec3;
  readonly tessCell: number;
  supported: boolean;
  readonly strength: number;
  /** Visual-only detail (no collider while its island has collidable parts). */
  readonly noCollide: boolean;
  tags: readonly string[];
  /** Fatigue memory (island frame) — replaced by each damage outcome; decays lazily. */
  dmg: DamagePoint[] = [];
  /** Sim time at which `dmg` was last decayed. */
  dmgTime = 0;
  dents: Dent[] = [];
  cracks: Crack[] = [];
  readonly gen: number;
  /** Live bonds touching this part (rigid + joint + world). */
  bonds: Bond[] = [];
  /** Oriented box description when the poly is a rectangular box (cheap box collider). */
  readonly box: BoxInfo | null;

  // ---- engine state
  /** Child collision shape (owned by the part; reused across island rebuilds). */
  shape: PhysicsShape | null = null;
  /** Layer bits currently applied to `shape`. */
  shapeLayer = 0;
  geom: RenderGeom | null = null;
  geomDirty = true;
  /** Render chunk key inside its island. */
  chunkKey = 0;
  features: PartFeature[] | null = null;
  alive = true;
  /** A fracture plan for this part is queued (skip further damage planning until applied). */
  pendingFracture = false;
  /** Extra velocity (island frame, m/s) to give the island this part ends up in after a split. */
  pendingKick: Vec3 | null = null;
  /** Cumulative energy absorbed (J) — feature triggers (power panel, alarm...). */
  absorbed = 0;
  /** Sim time of the last collider refresh after a crumple. */
  colliderTime = -1;
  /** The part's shape is currently a child of its island's container. */
  inContainer = false;
  /** `shape` is a cheap oriented-box stand-in, queued for a hull refinement (World.refineShapes). */
  approxShape = false;
  /** Detached by a split whose island creation is deferred (World.pendingGroups): no island yet. */
  limbo = false;
  /** Volume already counted as broken in the assembly's damage accounting. */
  counted = false;
  /** Scratch index for graph algorithms (valid only inside one call). */
  tmp = 0;

  constructor(init: {
    id: number;
    name: string;
    asm: Assembly;
    matId: MaterialId;
    mat: MaterialDef;
    poly: ConvexPoly;
    volume: number;
    mass: number;
    centroid: Vec3;
    ext: [number, number, number];
    bounds: Bounds;
    grain?: Vec3;
    tessCell: number;
    supported: boolean;
    strength: number;
    noCollide: boolean;
    tags: readonly string[];
    gen: number;
    box: BoxInfo | null;
  }) {
    this.id = init.id;
    this.name = init.name;
    this.asm = init.asm;
    this.matId = init.matId;
    this.mat = init.mat;
    this.poly = init.poly;
    this.volume = init.volume;
    this.mass = init.mass;
    this.centroid = init.centroid;
    this.ext = init.ext;
    this.bounds = init.bounds;
    this.grain = init.grain;
    this.tessCell = init.tessCell;
    this.supported = init.supported;
    this.strength = init.strength;
    this.noCollide = init.noCollide;
    this.tags = init.tags;
    this.gen = init.gen;
    this.box = init.box;
  }

  hasTag(t: string): boolean {
    return this.tags.includes(t);
  }
}

export class Bond implements BondState {
  readonly id: number;
  readonly kind: BondKind;
  readonly asm: Assembly;
  /** Endpoint A (the moving part for joints/latches). Re-pointed when A fractures. */
  a: Part;
  /** Endpoint B or null for the static world. */
  b: Part | null;
  readonly world: boolean;
  /** Assembly-frame anchor. */
  readonly anchor: Vec3;
  health: number;
  readonly max: number;
  farMass = 0;
  readonly joint: JointDef | null;
  group: JointGroup | null = null;
  /** Rigid bonds merge parts into one island (all kinds except hinge/slider/latch). */
  readonly rigid: boolean;
  /** Blueprint bond (counted by the damage accounting) vs one created by a fracture at runtime. */
  readonly original: boolean;
  alive = true;

  constructor(id: number, asm: Assembly, kind: BondKind, a: Part, b: Part | null, max: number, anchor: Vec3, joint: JointDef | null, original = false) {
    this.id = id;
    this.asm = asm;
    this.kind = kind;
    this.a = a;
    this.b = b;
    this.world = b === null;
    this.max = max;
    this.health = max;
    this.anchor = anchor;
    this.joint = joint;
    this.rigid = kind !== "hinge" && kind !== "slider" && kind !== "latch";
    this.original = original;
  }

  other(p: Part): Part | null {
    return this.a === p ? this.b : this.a;
  }
}

/** A spatial sub-batch of an island's render geometry (big static islands are chunked). */
export class Chunk {
  readonly key: number;
  readonly parts = new Set<Part>();
  meshes: IslandMeshes | null = null;
  dirty = true;
  /** Must be rebuilt this step (membership changed) vs. cosmetic (dents/cracks), budgeted. */
  structural = true;
  constructor(key: number) {
    this.key = key;
  }
}

export interface ConsolidationRef {
  /** The cell batches holding this island's world-space geometry (DebrisSystem batches; big islands span several). */
  batches: object[];
  /** Of these, batches not rebuilt since the island was added (its own meshes stay until 0). */
  pending: number;
  /** World-space geometry is in the batch meshes (island meshes disposed). */
  inBatch: boolean;
  /** Index in DebrisSystem's list of consolidated islands. */
  idx: number;
  /** Node pose when consolidated: any change means the body moved (woken) and must get its own meshes back. */
  px: number;
  py: number;
  pz: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export class Island {
  readonly id: number;
  readonly asm: Assembly;
  parts: Part[] = [];
  node: TransformNode;
  body: PhysicsBody | null = null;
  container: PhysicsShape | null = null;
  /** Container child index → part (mirrors the Havok container order). */
  childParts: Part[] = [];
  /** Parts present in `parts` but not yet in the container / to be removed from it. */
  pendingAdd: Part[] = [];
  pendingRemove = new Set<Part>();
  /** Container must be rebuilt from scratch at the next sync. */
  rebuildContainer = false;
  isStatic: boolean;
  /** Collision layer bits of the island's shapes. */
  layer = 0;
  mass = 0;
  /** Mass-weighted centroid (island frame). */
  com: Vec3 = { x: 0, y: 0, z: 0 };
  bounds: Bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  /** Largest characteristic size (m). */
  extent = 0;
  metricsDirty = true;
  /** Render chunks (single key 0 unless `chunked`). */
  chunked = false;
  chunks = new Map<number, Chunk>();
  /** Spatial grid of part AABBs for hit-part lookup (large islands). */
  grid: PartGrid | null = null;
  gridParts: Part[] = [];
  gridDirty = true;
  alive = true;
  // ---- activity / debris lifecycle
  /** Index in DebrisSystem's round-robin list (-1 = not tracked). */
  rrIndex = -1;
  awake = true;
  sleepTime = 0;
  lastCheck = 0;
  consolidated: ConsolidationRef | null = null;
  /** Previous body.disableSync while consolidated. */
  savedDisableSync = false;
  /** Sim time of the last impact/strike involving this island. */
  lastHit = -1;
  /** World.stepIndex of the last Interactions.pull() on this (dynamic) island. */
  pulledStep = -1;
  /** Created for pieces that broke off (fracture fragments, split-off parts; not the keeper of a split, not a spawn). */
  piece = false;
  /** Split operation that created this island (siblings share it) and when. */
  birth = 0;
  birthTime = -1;

  constructor(id: number, asm: Assembly, node: TransformNode, isStatic: boolean) {
    this.id = id;
    this.asm = asm;
    this.node = node;
    this.isStatic = isStatic;
  }
}

/** One physics constraint realised for a joint group between two islands. */
export interface JointConstraint {
  c: PhysicsConstraint;
  kind: "hinge" | "ball" | "slider";
  moving: Island;
  /** Fixed side island, or null when anchored to the assembly's world anchor body. */
  fixed: Island | null;
  /** Bonds forming it. */
  bonds: Bond[];
  /** Pivot (assembly frame). */
  pivot: Vec3;
  /** Latch motor engaged in this constraint. */
  latched: boolean;
  /** Hinge angle between the built pose and the constraint's zero (0 for sliders; see joints.ts). */
  offset: number;
  /** Signature used to avoid needless re-creation. */
  sig: string;
  /** Sustained (windowed minimum) reaction force (N), axial torque and bending torque (N·m). */
  fEma: number;
  tAxisEma: number;
  tPerpEma: number;
  /** Ring buffer of the last steps' [force, axial torque, bending torque]. */
  hist: Float32Array;
  histPos: number;
  histCount: number;
}

export class JointGroup {
  readonly id: string;
  readonly kind: "hinge" | "slider";
  readonly asm: Assembly;
  /** Hinge/slider bonds of the group (dead ones keep alive=false). */
  readonly bonds: Bond[] = [];
  latch: Bond | null = null;
  /** Joint definition (axis, limits, friction, spring) — from the first bond. */
  readonly def: JointDef;
  constraints: JointConstraint[] = [];
  dirty = true;
  /** Latch temporarily released by the use key; re-latches when swung back near the closed pose. */
  released = false;
  /** The joint has been opened far enough since release to arm automatic re-latching. */
  armed = false;
  releaseTime = 0;
  /** Velocity motor (ceiling fan, turntable) driving this joint, rad/s; 0 = none. */
  motorSpeed = 0;
  motorTorque = 0;
  motorOn = false;

  constructor(id: string, kind: "hinge" | "slider", asm: Assembly, def: JointDef) {
    this.id = id;
    this.kind = kind;
    this.asm = asm;
    this.def = def;
  }

  get latchIntact(): boolean {
    return !!this.latch && this.latch.alive;
  }
}

export class Assembly {
  readonly id: number;
  readonly def: AssemblyDef;
  readonly type: string;
  readonly name: string;
  readonly category: AssemblyCategory;
  readonly value: number;
  readonly room: string | null;
  readonly xf: Xform;
  readonly parts = new Set<Part>();
  readonly bonds = new Set<Bond>();
  readonly islands = new Set<Island>();
  readonly groups = new Map<string, JointGroup>();
  readonly features: PartFeature[] = [];
  /** Blueprint name → part (original parts only). */
  readonly byName = new Map<string, Part>();
  /** Static, shape-less body at the spawn transform: fixed side of joints bonded to "world". */
  anchorBody: PhysicsBody | null = null;
  anchorNode: TransformNode | null = null;
  // ---- damage accounting
  initialVolume = 0;
  initialBonds = 0;
  brokenVolume = 0;
  brokenBonds = 0;
  dentVolume = 0;
  fraction = 0;
  /** Fraction already converted into reported valueLost. */
  reported = 0;
  alive = true;

  constructor(id: number, def: AssemblyDef, xf: Xform) {
    this.id = id;
    this.def = def;
    this.type = def.type;
    this.name = def.name;
    this.category = def.category;
    this.value = Number.isFinite(def.value) ? Math.max(0, def.value) : 0;
    this.room = def.room ?? null;
    this.xf = xf;
  }
}

/** A fracture waiting in the time-budgeted queue. */
export interface FractureRequest {
  part: Part;
  plan: FracturePlan;
  energy: number;
  /** World impact position / direction (for events). */
  pos: Vec3;
  dir: Vec3;
  /** Caused by a deliberate strike (tool/fist) rather than a passive collision. */
  strike: boolean;
  seq: number;
}

/**
 * A component detached by a split whose island is created in a later step (World budget): its
 * parts wait in limbo (no body, no mesh) and appear at the pose and velocity they had when they
 * broke off.
 */
export interface PendingGroup {
  asm: Assembly;
  parts: Part[];
  anchored: boolean;
  mass: number;
  birth: number;
  birthTime: number;
  /** World pose of the parent island node at the split (assembly frame → world). */
  px: number;
  py: number;
  pz: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  /** Parent velocity / angular velocity / world COM at the split. */
  v: Vec3;
  w: Vec3;
  com: Vec3;
}
