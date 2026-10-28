// Follow-ups: stale world matrix at body creation, determinism across WASM instances, applyForce math
import { Vector3, Quaternion, TransformNode, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShapeSphere, NullEngine, Scene, HavokPlugin, FreeCamera, MeshBuilder } from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { makeWorld, stepN, r3, v3 } from "./physics-bodies-util";

async function pileRun(freshWasm: boolean, sharedHk?: Awaited<ReturnType<typeof HavokPhysics>>) {
  const hk = freshWasm || !sharedHk ? await HavokPhysics({ locateFile: () => havokWasmUrl }) : sharedHk;
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera("c", new Vector3(0, 5, -10), scene);
  scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, hk));
  const g = new TransformNode("g", scene);
  const gb = new PhysicsBody(g, PhysicsMotionType.STATIC, false, scene);
  gb.shape = new PhysicsShapeBox(new Vector3(0, -0.5, 0), Quaternion.Identity(), new Vector3(50, 1, 50), scene);
  const nodes: TransformNode[] = [];
  for (let i = 0; i < 60; i++) {
    const tn = new TransformNode("p" + i, scene);
    tn.position.set((i % 4) * 0.3, 0.5 + i * 0.6, (Math.floor(i / 4) % 3) * 0.2);
    tn.rotationQuaternion = Quaternion.RotationYawPitchRoll(i * 0.3, i * 0.7, i * 0.1);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
    b.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.4, 0.3, 0.5), scene);
    nodes.push(tn);
  }
  stepN(scene, 400);
  const pos = nodes.map((n) => [n.position.x, n.position.y, n.position.z]);
  engine.dispose();
  return { pos, hk };
}
const maxDiff = (a: number[][], b: number[][]) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(a[i][k] - b[i][k]));
  return m;
};

export async function probe() {
  const out: Record<string, unknown> = {};
  // determinism
  const r1 = await pileRun(true);
  const r2 = await pileRun(true);
  const r3b = await pileRun(false, r1.hk); // second world in an already-used WASM instance
  out.determinism = {
    freshWasmVsFreshWasm_maxDiff: maxDiff(r1.pos, r2.pos),
    reusedWasmVsFresh_maxDiff: maxDiff(r1.pos, r3b.pos),
  };

  const w = await makeWorld();
  // stale world matrix at creation when node already has rotationQuaternion
  {
    const tn = new TransformNode("stale", w.scene);
    tn.rotationQuaternion = Quaternion.Identity();
    tn.computeWorldMatrix();
    tn.position.set(5, 5, 5);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, w.scene);
    b.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(1, 1, 1), w.scene);
    const createdAt = w.hk.HP_Body_GetQTransform(b._pluginData.hpBodyId)[1][0].map(r3);
    stepN(w.scene, 1);
    out.staleCreation_withRotationQuaternionPreset = { havokPosAtCreation: createdAt, nodePosAfterFirstStep: v3(tn.position) };
    b.dispose();
  }
  // applyForce vs applyImpulse
  {
    const tn = new TransformNode("f", w.scene);
    tn.position.set(0, 50, 0);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, w.scene);
    b.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(1, 1, 1), w.scene);
    b.setMassProperties({ mass: 2 });
    b.setGravityFactor(0);
    b.applyForce(new Vector3(12, 0, 0), tn.position.clone());
    const immediate = b.getLinearVelocity().x;
    stepN(w.scene, 1);
    const afterStep = b.getLinearVelocity().x;
    b.setLinearVelocity(Vector3.Zero());
    b.applyImpulse(new Vector3(0.2, 0, 0), tn.position.clone());
    const impImmediate = b.getLinearVelocity().x;
    // continuous force for 1 s via onBeforePhysicsObservable
    b.setLinearVelocity(Vector3.Zero());
    const o = w.scene.onBeforePhysicsObservable.add(() => b.applyForce(new Vector3(12, 0, 0), tn.position));
    stepN(w.scene, 60);
    w.scene.onBeforePhysicsObservable.remove(o);
    const after1sContinuous = b.getLinearVelocity().x;
    out.applyForce = { immediate: r3(immediate), afterStep: r3(afterStep), impulse02Immediate: r3(impImmediate), after1sContinuous_expected6: r3(after1sContinuous), mass: b.getMassProperties().mass };
  }
  // low-velocity behaviour: is there extra damping for slow bodies?
  {
    const lowVel: Record<string, number> = {};
    for (const v0 of [0.05, 0.1, 0.5, 1, 5]) {
      const tn = new TransformNode("lv", w.scene);
      tn.position.set(0, 200, v0 * 100);
      const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, w.scene);
      b.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(1, 1, 1), w.scene);
      b.setGravityFactor(0);
      b.setLinearVelocity(new Vector3(v0, 0, 0));
      stepN(w.scene, 1);
      const after1 = b.getLinearVelocity().x;
      stepN(w.scene, 59);
      lowVel["v" + v0] = r3(after1 / v0 * 1000) / 1000;
      lowVel["v" + v0 + "_after60"] = r3(b.getLinearVelocity().x / v0 * 1000) / 1000;
      b.dispose();
    }
    out.lowVelocityRatioAfterSteps = lowVel;
  }
  // velocity limits
  {
    w.phys.setVelocityLimits(50, 20);
    const tn = new TransformNode("vl", w.scene);
    tn.position.set(0, 300, 0);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, w.scene);
    b.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(1, 1, 1), w.scene);
    b.setGravityFactor(0);
    b.setLinearVelocity(new Vector3(100, 0, 0));
    b.setAngularVelocity(new Vector3(0, 60, 0));
    const before = { lin: r3(b.getLinearVelocity().x), ang: r3(b.getAngularVelocity().y) };
    stepN(w.scene, 1);
    out.velocityLimits_50_20 = { before, after1Step: { lin: r3(b.getLinearVelocity().x), ang: r3(b.getAngularVelocity().y) }, getters: [w.phys.getMaxLinearVelocity(), w.phys.getMaxAngularVelocity()] };
    w.phys.setVelocityLimits(200, 100);
    // shape swap keeps velocity? body origin unchanged?
    b.setLinearVelocity(new Vector3(3, 0, 0));
    b.setAngularVelocity(new Vector3(0, 2, 0));
    const posBefore = v3(tn.position);
    const offBefore = w.hk.HP_Body_GetWorldTransformOffset(b._pluginData.hpBodyId)[1];
    b.shape = new PhysicsShapeBox(new Vector3(0.5, 0, 0), Quaternion.Identity(), new Vector3(2, 1, 1), w.scene);
    const offAfterShape = w.hk.HP_Body_GetWorldTransformOffset(b._pluginData.hpBodyId)[1];
    out.shapeSwap = { linAfterSwap: v3(b.getLinearVelocity()), angAfterSwap: v3(b.getAngularVelocity()), havokPosAfterSwap: w.hk.HP_Body_GetQTransform(b._pluginData.hpBodyId)[1][0].map(r3), posBefore };
    b.setMotionType(PhysicsMotionType.STATIC);
    const offStatic = w.hk.HP_Body_GetWorldTransformOffset(b._pluginData.hpBodyId)[1];
    b.setMotionType(PhysicsMotionType.DYNAMIC);
    const offDyn = w.hk.HP_Body_GetWorldTransformOffset(b._pluginData.hpBodyId)[1];
    hkSleep(w, b);
    const offAsleep = w.hk.HP_Body_GetWorldTransformOffset(b._pluginData.hpBodyId)[1];
    out.worldTransformOffsetStability = { offBefore, offAfterShape, offStatic, offDyn, offAsleep };
  }
  // do sleeping bodies with callbacks enabled raise events? does changing the event mask wake a body?
  {
    const g = new PhysicsBody(new TransformNode("g", w.scene), PhysicsMotionType.STATIC, false, w.scene);
    g.shape = new PhysicsShapeBox(new Vector3(0, -0.5, -500), Quaternion.Identity(), new Vector3(100, 1, 100), w.scene);
    const bodies: PhysicsBody[] = [];
    for (let i = 0; i < 50; i++) {
      const tn = new TransformNode("cb" + i, w.scene);
      tn.position.set((i % 10) * 2 - 10, 0.25, -500 + Math.floor(i / 10) * 2);
      const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, w.scene);
      b.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.5, 0.5, 0.5), w.scene);
      b.setCollisionCallbackEnabled(true);
      bodies.push(b);
    }
    let n = 0;
    const o = w.plugin.onCollisionObservable.add(() => n++);
    const asleepN = () => bodies.filter((b) => w.hk.HP_Body_GetActivationState(b._pluginData.hpBodyId)[1] === w.hk.ActivationState.INACTIVE).length;
    stepN(w.scene, 10);
    const eventsWhileSettling = n / 10;
    stepN(w.scene, 120);
    n = 0;
    const asleepBefore = asleepN();
    stepN(w.scene, 30);
    const eventsPerStepWhileAsleep = n / 30;
    bodies[0].setEventMask(1);
    const asleepAfterSetEventMask = asleepN();
    bodies[1].setLinearDamping(0.2);
    const asleepAfterSetDamping = asleepN();
    w.plugin.onCollisionObservable.remove(o);
    out.callbacksWhileAsleep = { eventsWhileSettling, asleepBefore, eventsPerStepWhileAsleep, asleepAfterSetEventMask_of50: asleepAfterSetEventMask, asleepAfterSetDamping_of50: asleepAfterSetDamping };
    for (const b of bodies) b.transformNode.dispose();
  }
  // FromMesh helpers ignore mesh scaling
  {
    const m = MeshBuilder.CreateBox("fm", { size: 1 }, w.scene);
    m.scaling.set(2, 2, 2);
    const bx = PhysicsShapeBox.FromMesh(m);
    const sp = PhysicsShapeSphere.FromMesh(m);
    const a = bx.getBoundingBox(), c = sp.getBoundingBox();
    out.fromMeshOnScaledMesh_scale2 = { boxAABB: [v3(a.minimum), v3(a.maximum)], sphereAABB: [v3(c.minimum), v3(c.maximum)] };
    m.dispose();
  }
  w.engine.dispose();
  return out;
}
function hkSleep(w: Awaited<ReturnType<typeof makeWorld>>, b: PhysicsBody) {
  w.hk.HP_Body_SetActivationState(b._pluginData.hpBodyId, w.hk.ActivationState.INACTIVE);
  stepN(w.scene, 2);
}
