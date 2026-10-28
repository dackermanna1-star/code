// Exercises every helper in physics-bodies-snippets.ts
import { NullEngine, Scene, FreeCamera, Vector3, Quaternion, TransformNode, PhysicsMotionType, PhysicsShapeBox, PhysicsShapeContainer, PhysicsShapeType, PhysicsBody } from "@babylonjs/core";
import {
  enableHavok, createBody, teleportBody, createConvexHullFromPoints, removeContainerChildren, Layer, setLayer, isAsleep, setAsleep,
  keepAwake, disposeBodyAndShapes, stepN, FastBodySync, forceSleepSlowBodies,
} from "./physics-bodies-snippets";

export async function probe() {
  const out: Record<string, unknown> = {};
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera("c", new Vector3(0, 5, -10), scene);
  const { hk } = await enableHavok(scene);
  const stats = () => { const s = hk.HP_GetStatistics()[1]; return { bodies: s[0], shapes: s[1] }; };
  const base = stats();
  const groundShape = new PhysicsShapeBox(new Vector3(0, -0.5, 0), Quaternion.Identity(), new Vector3(50, 1, 50), scene);
  setLayer(groundShape, Layer.WORLD, ~0);
  const ground = createBody(new TransformNode("g", scene), groundShape, PhysicsMotionType.STATIC, scene);

  // raw hull body + fast sync + teleport
  const cube = new Float32Array([-0.1, -0.1, -0.1, 0.1, -0.1, -0.1, -0.1, 0.1, -0.1, 0.1, 0.1, -0.1, -0.1, -0.1, 0.1, 0.1, -0.1, 0.1, -0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
  const hull = createConvexHullFromPoints(scene, cube);
  setLayer(hull, Layer.DEBRIS, Layer.WORLD | Layer.DEBRIS);
  const n1 = new TransformNode("h", scene);
  n1.position.set(0, 2, 0);
  const b1 = createBody(n1, hull, PhysicsMotionType.DYNAMIC, scene);
  const fast = new FastBodySync(scene);
  fast.add(b1);
  stepN(scene, 120);
  out.hullRestY_expected01 = Math.round(n1.position.y * 1000) / 1000;
  out.hullType = hull.type === PhysicsShapeType.CONVEX_HULL;
  const hit = scene.getPhysicsEngine()!.raycast(new Vector3(0, 3, 0), new Vector3(0, -1, 0));
  out.raycastBodyIsHull = hit.body === b1;
  teleportBody(b1, new Vector3(3, 1, 0), Quaternion.Identity());
  stepN(scene, 1);
  out.afterTeleport = [Math.round(n1.position.x * 1000) / 1000, Math.round(n1.position.y * 1000) / 1000];

  // container: remove children + mass refresh
  const c = new PhysicsShapeContainer(scene);
  for (let i = 0; i < 4; i++) c.addChild(new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.5, 0.5, 0.5), scene), new Vector3(i * 0.5, 0.25, 0));
  const n2 = new TransformNode("c", scene);
  n2.position.set(-5, 0.01, 0);
  const b2 = createBody(n2, c, PhysicsMotionType.DYNAMIC, scene);
  const m0 = b2.getMassProperties().mass;
  const removed = removeContainerChildren(b2, c, [0, 3]);
  out.containerMass = { before: m0, after: b2.getMassProperties().mass, children: c.getNumChildren(), removedReturned: removed.length };
  // reuse a removed child as the shape of a new, detached body
  const n3 = new TransformNode("piece", scene);
  n3.position.set(-5, 2, 0);
  const b3 = createBody(n3, removed[0], PhysicsMotionType.DYNAMIC, scene);
  removed[1].dispose();

  // activation helpers
  stepN(scene, 120);
  out.asleepAfter120 = isAsleep(b2);
  setAsleep(b2, false);
  out.awakeAfterSet = !isAsleep(b2);
  keepAwake(b2, true);
  stepN(scene, 200);
  out.keptAwake = !isAsleep(b2);
  keepAwake(b2, false);

  // force-sleep helper
  const bodies: PhysicsBody[] = [b2];
  const counters = new Int32Array(bodies.length);
  for (let i = 0; i < 10; i++) { stepN(scene, 10); forceSleepSlowBodies(bodies, counters, 10); }
  out.forceSlept = isAsleep(b2);

  // disposal leaves no leaks
  fast.remove(b1);
  disposeBodyAndShapes(b1);
  disposeBodyAndShapes(b2);
  disposeBodyAndShapes(b3);
  disposeBodyAndShapes(ground);
  out.leakCheck = { before: base, after: stats() };
  engine.dispose();
  return out;
}
