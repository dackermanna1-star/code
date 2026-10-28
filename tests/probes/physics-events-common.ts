// Shared setup helpers for the physics-events-* probes (not a probe itself).
import {
  Engine,
  Scene,
  Vector3,
  Quaternion,
  MeshBuilder,
  HavokPlugin,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeSphere,
  PhysicsMaterialCombineMode,
  FreeCamera,
  HemisphericLight,
  PhysicsEngineV2,
  type Mesh,
  type PhysicsShape,
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

export type HK = Awaited<ReturnType<typeof HavokPhysics>>;

export interface World {
  engine: Engine;
  scene: Scene;
  plugin: HavokPlugin;
  hk: HK;
  pe: PhysicsEngineV2;
  /** Advance exactly one fixed physics step (1/60 s, plugin built with useDelta=false). */
  step: () => void;
  steps: (n: number) => void;
}

let hkPromise: Promise<HK> | null = null;
export function loadHavok(): Promise<HK> {
  if (!hkPromise) hkPromise = HavokPhysics({ locateFile: () => havokWasmUrl });
  return hkPromise;
}

/**
 * Creates engine + scene + Havok with a FIXED time step: `new HavokPlugin(false, hk)` makes executeStep ignore
 * the frame delta and always use plugin.getTimeStep() (default 1/60). `scene.animate()` then advances physics by
 * exactly one step (and fires onBefore/AfterPhysicsObservable) without rendering.
 */
export async function createWorld(opts: { maxQueryCollectorHits?: number; render?: boolean; engine?: Engine } = {}): Promise<World> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = opts.engine ?? new Engine(canvas, true);
  const scene = new Scene(engine);
  new FreeCamera("c", new Vector3(0, 3, -8), scene).setTarget(new Vector3(0, 0.5, 0));
  new HemisphericLight("h", new Vector3(0, 1, 0), scene);
  const hk = await loadHavok();
  const plugin = new HavokPlugin(false, hk, opts.maxQueryCollectorHits ? { maxQueryCollectorHits: opts.maxQueryCollectorHits } : {});
  scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
  const pe = scene.getPhysicsEngine() as PhysicsEngineV2;
  const step = () => (opts.render ? scene.render() : scene.animate());
  return { engine, scene, plugin, hk, pe, step, steps: (n: number) => { for (let i = 0; i < n; i++) step(); } };
}

export function setMat(shape: PhysicsShape, friction = 0.5, restitution = 0) {
  shape.material = {
    friction,
    staticFriction: friction,
    restitution,
    frictionCombine: PhysicsMaterialCombineMode.MINIMUM,
    restitutionCombine: PhysicsMaterialCombineMode.MAXIMUM,
  };
}

/** Body with an explicit box shape (extents = full size). mass 0 => STATIC. */
export function makeBox(
  w: World,
  name: string,
  size: Vector3,
  pos: Vector3,
  mass: number,
  opts: { restitution?: number; friction?: number; rot?: Quaternion; motion?: PhysicsMotionType } = {},
): { mesh: Mesh; body: PhysicsBody; shape: PhysicsShapeBox } {
  const mesh = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, w.scene);
  mesh.position.copyFrom(pos);
  if (opts.rot) mesh.rotationQuaternion = opts.rot.clone();
  const motion = opts.motion ?? (mass > 0 ? PhysicsMotionType.DYNAMIC : PhysicsMotionType.STATIC);
  const body = new PhysicsBody(mesh, motion, false, w.scene);
  const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), size.clone(), w.scene);
  setMat(shape, opts.friction ?? 0.5, opts.restitution ?? 0);
  body.shape = shape;
  if (mass > 0) body.setMassProperties({ mass });
  return { mesh, body, shape };
}

export function makeSphere(
  w: World,
  name: string,
  radius: number,
  pos: Vector3,
  mass: number,
  opts: { restitution?: number; friction?: number } = {},
): { mesh: Mesh; body: PhysicsBody; shape: PhysicsShapeSphere } {
  const mesh = MeshBuilder.CreateSphere(name, { diameter: radius * 2, segments: 8 }, w.scene);
  mesh.position.copyFrom(pos);
  const body = new PhysicsBody(mesh, mass > 0 ? PhysicsMotionType.DYNAMIC : PhysicsMotionType.STATIC, false, w.scene);
  const shape = new PhysicsShapeSphere(Vector3.Zero(), radius, w.scene);
  setMat(shape, opts.friction ?? 0.5, opts.restitution ?? 0);
  body.shape = shape;
  if (mass > 0) body.setMassProperties({ mass });
  return { mesh, body, shape };
}

/** Static ground slab whose TOP surface is at y = 0. */
export function makeGround(w: World, size = 40) {
  return makeBox(w, "ground", new Vector3(size, 1, size), new Vector3(0, -0.5, 0), 0);
}

export const r3 = (v: { x: number; y: number; z: number } | null | undefined, d = 4) =>
  v ? [+v.x.toFixed(d), +v.y.toFixed(d), +v.z.toFixed(d)] : null;
export const rn = (n: number | undefined, d = 4) => (n === undefined ? undefined : +n.toFixed(d));
