// Shared helpers for the physics-constraints-* probes (not a probe itself).
import {
  NullEngine,
  Scene,
  Vector3,
  Quaternion,
  HavokPlugin,
  PhysicsEngineV2,
  PhysicsBody,
  PhysicsShapeBox,
  PhysicsMotionType,
  TransformNode,
  FreeCamera,
  type PhysicsShape,
  type PhysicsConstraint,
} from "@babylonjs/core";
import HavokPhysics, { type HavokPhysicsWithBindings } from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

export async function newHavok(): Promise<HavokPhysicsWithBindings> {
  return HavokPhysics({ locateFile: () => havokWasmUrl });
}

export interface CWorld {
  engine: NullEngine;
  scene: Scene;
  plugin: HavokPlugin;
  hk: HavokPhysicsWithBindings;
  phys: PhysicsEngineV2;
  dispose(): void;
}

/** Fixed-step world: HavokPlugin(false) => every step is plugin.getTimeStep() (1/60). Fresh WASM per world if hk omitted. */
export async function makeWorld(hk?: HavokPhysicsWithBindings, gravity = new Vector3(0, -9.81, 0)): Promise<CWorld> {
  const h = hk ?? (await newHavok());
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera("cam", new Vector3(0, 2, -6), scene);
  const plugin = new HavokPlugin(false, h);
  scene.enablePhysics(gravity, plugin);
  const phys = scene.getPhysicsEngine() as PhysicsEngineV2;
  return {
    engine, scene, plugin, hk: h, phys,
    dispose() { scene.dispose(); engine.dispose(); },
  };
}

/** Exactly n physics steps of 1/60 s (fires onBefore/AfterPhysicsObservable). */
export function stepN(scene: Scene, n: number, dtMs = 1000 / 60): void {
  for (let i = 0; i < n; i++) scene._advancePhysicsEngineStep(dtMs);
}

export interface BoxOpts {
  motion?: PhysicsMotionType;
  mass?: number; // overrides density-derived mass
  density?: number;
  friction?: number;
  restitution?: number;
  rot?: Quaternion;
  membership?: number;
  collide?: number;
}

export function makeBox(scene: Scene, name: string, size: Vector3, pos: Vector3, o: BoxOpts = {}): PhysicsBody {
  const node = new TransformNode(name, scene);
  node.position.copyFrom(pos);
  node.rotationQuaternion = o.rot ? o.rot.clone() : Quaternion.Identity();
  node.computeWorldMatrix(true);
  const body = new PhysicsBody(node, o.motion ?? PhysicsMotionType.DYNAMIC, false, scene);
  const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), size, scene);
  shape.material = { friction: o.friction ?? 0.5, restitution: o.restitution ?? 0 };
  if (o.density !== undefined) shape.density = o.density;
  if (o.membership !== undefined) shape.filterMembershipMask = o.membership;
  if (o.collide !== undefined) shape.filterCollideMask = o.collide;
  body.shape = shape;
  if (o.mass !== undefined) body.setMassProperties({ mass: o.mass });
  return body;
}

export function bodyShape(b: PhysicsBody): PhysicsShape | null { return b.shape; }

/** World position of a body-local point (uses the node's current position/rotationQuaternion, not the cached world matrix). */
export function localToWorld(b: PhysicsBody, local: Vector3): Vector3 {
  const n = b.transformNode;
  return local.applyRotationQuaternion(n.rotationQuaternion!).addInPlace(n.position);
}

/** Signed angle of `child` relative to `parent` about `axis` (parent-local), measured between `perp` (parent-local) and `perp` (child-local). */
export function relAngle(parent: PhysicsBody, child: PhysicsBody, axis: Vector3, perp: Vector3): number {
  const qp = parent.transformNode.rotationQuaternion!, qc = child.transformNode.rotationQuaternion!;
  const aW = axis.applyRotationQuaternion(qp);
  const pP = perp.applyRotationQuaternion(qp);
  const pC = perp.applyRotationQuaternion(qc);
  // remove axial component of pC
  pC.subtractInPlace(aW.scale(Vector3.Dot(pC, aW)));
  return Math.atan2(Vector3.Dot(Vector3.Cross(pP, pC), aW), Vector3.Dot(pP, pC));
}

export function jointId(c: PhysicsConstraint): [bigint] {
  return (c as unknown as { _pluginData: [bigint][] })._pluginData[0];
}

/** Linear + angular impulse (world, N*s and N*m*s) applied by the constraint during the last step. */
export function appliedImpulses(hk: HavokPhysicsWithBindings, c: PhysicsConstraint): { lin: Vector3; ang: Vector3 } {
  const r = hk.HP_Constraint_GetAppliedImpulses(jointId(c));
  return { lin: Vector3.FromArray(r[1]), ang: Vector3.FromArray(r[2]) };
}

export function hkStats(hk: HavokPhysicsWithBindings) {
  const s = hk.HP_GetStatistics()[1];
  return { bodies: s[0], shapes: s[1], constraints: s[2], worlds: s[4], collectors: s[5] };
}

export const DEG = Math.PI / 180;
export const r3 = (x: number) => Math.round(x * 1000) / 1000;
export const r2 = (x: number) => Math.round(x * 100) / 100;
export const v3 = (v: Vector3) => [r3(v.x), r3(v.y), r3(v.z)];
export const deg = (rad: number) => Math.round((rad / DEG) * 10) / 10;
