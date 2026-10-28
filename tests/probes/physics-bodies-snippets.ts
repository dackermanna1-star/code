// Verified helper snippets quoted in docs/api-notes/physics-bodies-shapes.md (exercised by physics-bodies-snippets.probe.ts).
import {
  Scene, Engine, Vector3, Quaternion, Matrix, TransformNode, HavokPlugin, PhysicsBody, PhysicsShape, PhysicsShapeType,
  PhysicsShapeContainer, PhysicsMotionType, PhysicsPrestepType, PhysicsActivationControl,
} from "@babylonjs/core";
import HavokPhysics, { type HavokPhysicsWithBindings } from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

// ---------- setup ----------
export async function enableHavok(scene: Scene): Promise<{ plugin: HavokPlugin; hk: HavokPhysicsWithBindings }> {
  const hk = await HavokPhysics({ locateFile: () => havokWasmUrl }); // a NEW wasm instance per call
  const plugin = new HavokPlugin(true, hk); // true = world step uses the delta passed to executeStep
  scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
  return { plugin, hk };
}
export const hkOf = (scene: Scene) => (scene.getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin)._hknp as HavokPhysicsWithBindings;
export const pluginOf = (scene: Scene) => scene.getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin;

// ---------- bodies ----------
/** Body on a plain TransformNode (or Mesh). Forces a fresh world matrix first (stale-matrix pitfall). */
export function createBody(node: TransformNode, shape: PhysicsShape, motion: PhysicsMotionType, scene: Scene, startsAsleep = false): PhysicsBody {
  if (!node.rotationQuaternion) node.rotationQuaternion = Quaternion.FromEulerVector(node.rotation);
  node.computeWorldMatrix(true);
  const body = new PhysicsBody(node, motion, startsAsleep, scene);
  body.shape = shape; // set shape.density / filters / material BEFORE this line (mass is computed here)
  return body;
}

/** Immediate teleport of a (dynamic) body whose node has no parent. Velocities are NOT reset by Havok; we zero them. */
export function teleportBody(body: PhysicsBody, pos: Vector3, rot: Quaternion): void {
  const node = body.transformNode;
  node.position.copyFrom(pos);
  node.rotationQuaternion!.copyFrom(rot);
  body.setPrestepType(PhysicsPrestepType.TELEPORT);
  pluginOf(node.getScene()).setPhysicsBodyTransformation(body, node); // HP_Body_SetQTransform now
  body.setPrestepType(PhysicsPrestepType.DISABLED);
  body.setLinearVelocity(Vector3.Zero());
  body.setAngularVelocity(Vector3.Zero());
}

// ---------- shapes ----------
/** Convex hull from raw body-local xyz points; no Mesh needed. */
export function createConvexHullFromPoints(scene: Scene, points: Float32Array): PhysicsShape {
  const plugin = pluginOf(scene);
  const hk = plugin._hknp as HavokPhysicsWithBindings;
  const n = points.length / 3;
  const ptr = hk._malloc(points.length * 4);
  new Float32Array(hk.HEAPU8.buffer, ptr, points.length).set(points); // view AFTER _malloc (heap may grow)
  const res = hk.HP_Shape_CreateConvexHull(ptr, n);
  hk._free(ptr);
  if (res[0] !== hk.Result.RESULT_OK) throw new Error("HP_Shape_CreateConvexHull failed");
  const shape = new PhysicsShape({ pluginData: res[1] }, scene);
  // fix-ups for wrapped native shapes: .type would otherwise be a raw [Result, ShapeType] tuple,
  // and raycast results only resolve shapes registered in plugin._shapes
  (shape as unknown as { _type: PhysicsShapeType })._type = PhysicsShapeType.CONVEX_HULL;
  (plugin as unknown as { _shapes: Map<bigint, PhysicsShape> })._shapes.set(res[1][0], shape);
  return shape;
}

/** Child shape object at index i (works for shapes created via Babylon constructors or createConvexHullFromPoints). */
export function getContainerChild(container: PhysicsShapeContainer, i: number): PhysicsShape | undefined {
  const plugin = (container as unknown as { _physicsPlugin: HavokPlugin })._physicsPlugin;
  const hk = plugin._hknp as HavokPhysicsWithBindings;
  const id = hk.HP_Shape_GetChildShape(container._pluginData, i)[1][0];
  return (plugin as unknown as { _shapes: Map<bigint, PhysicsShape> })._shapes.get(id);
}
/**
 * Remove container children (highest index first: indices shift down) and refresh mass properties.
 * Returns the removed child shapes (NOT disposed: reuse them for the detached piece's new body, or dispose them).
 * Child transforms are not readable at runtime (HP_Shape_GetChildQSTransform is not exported) - track them yourself.
 */
export function removeContainerChildren(body: PhysicsBody, container: PhysicsShapeContainer, indices: number[]): PhysicsShape[] {
  const removed: PhysicsShape[] = [];
  for (const i of [...indices].sort((a, b) => b - a)) {
    const child = getContainerChild(container, i);
    if (child) removed.push(child);
    container.removeChild(i); // collision geometry updates immediately
  }
  body.shape = container; // REQUIRED: recomputes mass/COM/inertia (not live otherwise)
  return removed;
}

// ---------- collision layers ----------
export const Layer = { WORLD: 1, PLAYER: 2, DEBRIS: 4, PROPS: 8 } as const;
/** Pair collides iff (a.membership & b.collide) && (b.membership & a.collide). Apply to LEAF shapes (container's own mask is ignored). */
export function setLayer(shape: PhysicsShape, membership: number, collideWith: number): void {
  shape.filterMembershipMask = membership;
  shape.filterCollideMask = collideWith;
}

// ---------- activation ----------
export function isAsleep(body: PhysicsBody): boolean {
  const hk = hkOf(body.transformNode.getScene());
  return hk.HP_Body_GetActivationState(body._pluginData.hpBodyId)[1] === hk.ActivationState.INACTIVE;
}
export function setAsleep(body: PhysicsBody, asleep: boolean): void {
  const hk = hkOf(body.transformNode.getScene());
  hk.HP_Body_SetActivationState(body._pluginData.hpBodyId, asleep ? hk.ActivationState.INACTIVE : hk.ActivationState.ACTIVE);
}
export function keepAwake(body: PhysicsBody, on: boolean): void {
  pluginOf(body.transformNode.getScene()).setActivationControl(body, on ? PhysicsActivationControl.ALWAYS_ACTIVE : PhysicsActivationControl.SIMULATION_CONTROLLED);
}

// ---------- disposal ----------
/** Dispose body + its shapes without leaks. body.dispose() nulls body.shape, so grab it first. */
export function disposeBodyAndShapes(body: PhysicsBody, disposeNode = true): void {
  const shape = body.shape;
  body.getCollisionEndedObservable().clear(); // plugin never deletes this map entry; Havok reuses body ids
  body.getCollisionObservable().clear();
  body.dispose();
  if (shape) {
    if (shape instanceof PhysicsShapeContainer) {
      const kids: PhysicsShape[] = [];
      for (let i = 0; i < shape.getNumChildren(); i++) {
        const k = getContainerChild(shape, i);
        if (k) kids.push(k);
      }
      shape.dispose();
      for (const k of kids) k.dispose(); // only if children are not shared with other containers!
    } else {
      shape.dispose();
    }
  }
  if (disposeNode) body.transformNode.dispose();
}

// ---------- stepping ----------
/** Fixed-timestep driver decoupled from render rate; caps substeps; keeps onBefore/AfterPhysicsObservable working. */
export class FixedStepper {
  acc = 0;
  readonly scene: Scene;
  readonly dt: number;
  readonly maxSteps: number;
  constructor(scene: Scene, engine: Engine, dt = 1 / 60, maxSteps = 4) {
    this.scene = scene;
    this.dt = dt;
    this.maxSteps = maxSteps;
    scene.physicsEnabled = false; // scene.render() no longer steps physics
    scene.onBeforeRenderObservable.add(() => this.advance(engine.getDeltaTime() / 1000));
  }
  /** returns interpolation alpha in [0,1) */
  advance(frameSeconds: number): number {
    this.acc += Math.min(frameSeconds, 0.25);
    let n = 0;
    while (this.acc >= this.dt && n < this.maxSteps) {
      this.scene._advancePhysicsEngineStep(this.dt * 1000);
      this.acc -= this.dt;
      n++;
    }
    if (n === this.maxSteps) this.acc = Math.min(this.acc, this.dt);
    return this.acc / this.dt;
  }
}
/** Tests: advance exactly n steps (requires physicsEngine.getSubTimeStep() === 0). */
export function stepN(scene: Scene, n: number, dt = 1 / 60): void {
  for (let i = 0; i < n; i++) scene._advancePhysicsEngineStep(dt * 1000);
}

// ---------- fast sync for many bodies ----------
/**
 * Replaces Babylon's per-body sync (HP_Body_GetQTransform, ~1.5 us/body/step even when asleep) by reading the
 * world body buffer directly (~0.1-0.2 us/body). Bodies registered here get disableSync = true.
 * Nodes must be unparented and have rotationQuaternion.
 */
export class FastBodySync {
  readonly bodies: PhysicsBody[] = [];
  readonly offsets: number[] = [];
  private readonly tmp = new Matrix();
  readonly scene: Scene;
  constructor(scene: Scene) {
    this.scene = scene;
    scene.onAfterPhysicsObservable.add(() => this.sync());
  }
  add(body: PhysicsBody): void {
    const hk = hkOf(this.scene);
    body.disableSync = true;
    this.bodies.push(body);
    this.offsets.push(hk.HP_Body_GetWorldTransformOffset(body._pluginData.hpBodyId)[1]); // stable while in world
  }
  remove(body: PhysicsBody): void {
    const i = this.bodies.indexOf(body);
    if (i < 0) return;
    const last = this.bodies.length - 1;
    this.bodies[i] = this.bodies[last]; this.offsets[i] = this.offsets[last];
    this.bodies.pop(); this.offsets.pop();
  }
  sync(): void {
    const hk = hkOf(this.scene);
    const base = hk.HP_World_GetBodyBuffer(pluginOf(this.scene).world)[1]; // re-read every step (moves when bodies are added)
    const f32 = new Float32Array(hk.HEAPU8.buffer); // re-create every step (heap may grow)
    for (let i = 0; i < this.bodies.length; i++) {
      const o = (base + this.offsets[i]) >> 2;
      const node = this.bodies[i].transformNode;
      node.position.set(f32[o + 12], f32[o + 13], f32[o + 14]);
      Matrix.FromArrayToRef(f32, o, this.tmp);
      Quaternion.FromRotationMatrixToRef(this.tmp, node.rotationQuaternion!);
    }
  }
}

/** Large touching piles never sleep on their own (>~1000 bodies). Call every N steps: forces slow bodies asleep; they still wake on impact. */
export function forceSleepSlowBodies(bodies: PhysicsBody[], slowCounter: Int32Array, stepsSinceLastCall: number, linThresh = 0.15, angThresh = 0.6, slowSteps = 60): void {
  const v = new Vector3();
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    b.getLinearVelocityToRef(v);
    const lin = v.length();
    b.getAngularVelocityToRef(v);
    slowCounter[i] = lin < linThresh && v.length() < angThresh ? slowCounter[i] + stepsSinceLastCall : 0;
    if (slowCounter[i] >= slowSteps) setAsleep(b, true);
  }
}
