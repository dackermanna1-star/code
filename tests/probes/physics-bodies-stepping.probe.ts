// Q11: stepping semantics, fixed timestep, determinism; stale world-matrix pitfall
import {
  Vector3, Quaternion, TransformNode, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsPrestepType, Scene, Engine,
  NullEngine, NullEngineOptions, HavokPlugin, FreeCamera,
} from "@babylonjs/core";
import { getHavok } from "./physics-bodies-util";
import { makeWorld, stepN, r3, type PhysWorld } from "./physics-bodies-util";

function dropBox(w: PhysWorld, y = 100) {
  const tn = new TransformNode("b", w.scene);
  tn.position.set(0, y, 0);
  const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, w.scene);
  b.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(1, 1, 1), w.scene);
  return { tn, b };
}
// simulated time from free fall: t = |v| / g
const simTime = (b: PhysicsBody) => r3(b.getLinearVelocity().length() / 9.81);

/** Recommended fixed-step driver: decoupled from render rate, capped, fires onBefore/AfterPhysicsObservable. */
export class FixedStepper {
  acc = 0;
  steps = 0;
  readonly scene: Scene;
  readonly dt: number;
  readonly maxStepsPerFrame: number;
  constructor(scene: Scene, engine: Engine, dt = 1 / 60, maxStepsPerFrame = 4) {
    this.scene = scene;
    this.dt = dt;
    this.maxStepsPerFrame = maxStepsPerFrame;
    scene.physicsEnabled = false; // stop scene.render() from stepping physics itself
    scene.onBeforeRenderObservable.add(() => this.frame(engine.getDeltaTime() / 1000));
  }
  frame(frameSeconds: number) {
    this.acc += Math.min(frameSeconds, 0.25);
    let n = 0;
    while (this.acc >= this.dt && n < this.maxStepsPerFrame) {
      this.scene._advancePhysicsEngineStep(this.dt * 1000); // == physicsEngine._step(dt) + observables
      this.acc -= this.dt;
      n++;
      this.steps++;
    }
    if (n === this.maxStepsPerFrame) this.acc = Math.min(this.acc, this.dt); // drop backlog (no spiral of death)
    return this.acc / this.dt; // interpolation alpha for rendering, if wanted
  }
}

export async function probe() {
  const out: Record<string, unknown> = {};

  // 1) manual scene.render() loop, useDelta=true (default): deltaTime is 0 without runRenderLoop -> 1 ms per render
  {
    const w = await makeWorld({ useDelta: true });
    const { b } = dropBox(w);
    for (let i = 0; i < 60; i++) w.scene.render();
    out.manualRender_useDeltaTrue_60renders_simSeconds = simTime(b);
    out.engineDeltaTimeWithoutRenderLoop = w.engine.getDeltaTime();
    w.engine.dispose();
  }
  // 2) manual render loop, useDelta=false: each executeStep advances plugin fixed timestep (1/60)
  {
    const w = await makeWorld({ useDelta: false });
    const { b } = dropBox(w);
    for (let i = 0; i < 60; i++) w.scene.render();
    out.manualRender_useDeltaFalse_60renders_simSeconds = simTime(b);
    w.phys.setTimeStep(1 / 120);
    const v0 = b.getLinearVelocity().length();
    for (let i = 0; i < 60; i++) w.scene.render();
    out.useDeltaFalse_afterSetTimeStep120_60renders_addedSimSeconds = r3((b.getLinearVelocity().length() - v0) / 9.81);
    w.engine.dispose();
  }
  // 3) _advancePhysicsEngineStep semantics: clamp + subTimeStep accumulator
  {
    const w = await makeWorld({ useDelta: true });
    const { b } = dropBox(w);
    let notified = 0;
    w.scene.onBeforePhysicsObservable.add(() => notified++);
    w.scene._advancePhysicsEngineStep(500); // 0.5 s requested, _step clamps to 0.1
    out.advance500ms_noSubstep = { steps: notified, simSeconds: simTime(b) };
    b.setLinearVelocity(Vector3.Zero());
    notified = 0;
    w.phys.setSubTimeStep(1000 / 60);
    w.scene._advancePhysicsEngineStep(50);
    out.advance50ms_subTimeStep16_7 = { steps: notified, simSeconds: simTime(b), getSubTimeStep: w.phys.getSubTimeStep() };
    w.engine.dispose();
  }
  // 4) real render loop timing (headless rAF), default setup vs FixedStepper
  async function runFor(ms: number, configure: (w: PhysWorld) => void) {
    const w = await makeWorld({ useDelta: true });
    const { b } = dropBox(w, 1000);
    let physSteps = 0, frames = 0;
    w.scene.onBeforePhysicsObservable.add(() => physSteps++);
    configure(w);
    w.engine.runRenderLoop(() => { frames++; w.scene.render(); });
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, ms));
    w.engine.stopRenderLoop();
    const wall = (performance.now() - t0) / 1000;
    const res = { wallSeconds: r3(wall), frames, physSteps, simSeconds: simTime(b) };
    w.engine.dispose();
    return res;
  }
  out.renderLoop_default = await runFor(1500, () => {});
  out.renderLoop_subTimeStep = await runFor(1500, (w) => w.phys.setSubTimeStep(1000 / 60));
  let stepper: FixedStepper | null = null;
  out.renderLoop_fixedStepper = await runFor(1500, (w) => { stepper = new FixedStepper(w.scene, w.engine); });
  out.fixedStepperSteps = (stepper as FixedStepper | null)?.steps;
  // engine deterministic lockstep (built-in fixed step for animations + physics)
  {
    const engine = new NullEngine(Object.assign(new NullEngineOptions(), { deterministicLockstep: true, lockstepMaxSteps: 4, timeStep: 1 / 60 }));
    const scene = new Scene(engine);
    new FreeCamera("c", new Vector3(0, 5, -10), scene);
    scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, await getHavok()));
    const tn = new TransformNode("b", scene);
    tn.position.set(0, 1000, 0);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
    b.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(1, 1, 1), scene);
    let physSteps = 0, frames = 0;
    scene.onBeforePhysicsObservable.add(() => physSteps++);
    engine.runRenderLoop(() => { frames++; scene.render(); });
    await new Promise((r) => setTimeout(r, 1500));
    engine.stopRenderLoop();
    out.renderLoop_engineDeterministicLockstep = { frames, physSteps, simSeconds: simTime(b), isLockStep: engine.isDeterministicLockStep(), maxSteps: engine.getLockstepMaxSteps(), timeStepMs: engine.getTimeStep() };
    engine.dispose();
  }

  // 5) determinism: two fresh worlds, same inputs, stepN -> bitwise identical?
  async function pileRun() {
    const w = await makeWorld();
    const g = new TransformNode("g", w.scene);
    const gb = new PhysicsBody(g, PhysicsMotionType.STATIC, false, w.scene);
    gb.shape = new PhysicsShapeBox(new Vector3(0, -0.5, 0), Quaternion.Identity(), new Vector3(50, 1, 50), w.scene);
    const nodes: TransformNode[] = [];
    for (let i = 0; i < 60; i++) {
      const tn = new TransformNode("p" + i, w.scene);
      tn.position.set((i % 4) * 0.3, 0.5 + i * 0.6, Math.floor(i / 4) % 3 * 0.2);
      tn.rotationQuaternion = Quaternion.RotationYawPitchRoll(i * 0.3, i * 0.7, i * 0.1);
      const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, w.scene);
      b.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.4, 0.3, 0.5), w.scene);
      nodes.push(tn);
    }
    stepN(w.scene, 400);
    const pos = nodes.map((n) => [n.position.x, n.position.y, n.position.z, n.rotationQuaternion!.w]);
    w.engine.dispose();
    return pos;
  }
  const a = await pileRun();
  const c = await pileRun();
  let maxDiff = 0;
  for (let i = 0; i < a.length; i++) for (let k = 0; k < 4; k++) maxDiff = Math.max(maxDiff, Math.abs(a[i][k] - c[i][k]));
  out.determinism_SAME_wasm_instance_secondWorld_maxAbsDiff = maxDiff; // nonzero! see physics-bodies-misc for fresh-instance determinism

  // 6) stale world matrix pitfall (no render between changes => same renderId)
  {
    const w = await makeWorld();
    const tn = new TransformNode("stale", w.scene);
    tn.computeWorldMatrix(); // something reads the world matrix this frame...
    tn.position.set(5, 5, 5); // ...then we move it and create the body in the same frame
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, w.scene);
    b.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(1, 1, 1), w.scene);
    const created = w.hk.HP_Body_GetQTransform(b._pluginData.hpBodyId)[1][0].map(r3);
    const tn2 = new TransformNode("fresh", w.scene);
    tn2.computeWorldMatrix();
    tn2.position.set(5, 5, 5);
    tn2.computeWorldMatrix(true); // FIX
    const b2 = new PhysicsBody(tn2, PhysicsMotionType.DYNAMIC, false, w.scene);
    b2.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(1, 1, 1), w.scene);
    const created2 = w.hk.HP_Body_GetQTransform(b2._pluginData.hpBodyId)[1][0].map(r3);
    // ACTION prestep with several substeps per frame and no render in between
    const an = new TransformNode("anim", w.scene);
    an.position.set(0, 10, 0);
    an.computeWorldMatrix(true);
    const ab = new PhysicsBody(an, PhysicsMotionType.ANIMATED, false, w.scene);
    ab.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(1, 1, 1), w.scene);
    ab.setPrestepType(PhysicsPrestepType.ACTION);
    for (let i = 0; i < 30; i++) { an.position.x += 0.1; stepN(w.scene, 1); }
    const actionNoRender = r3(an.position.x);
    for (let i = 0; i < 30; i++) { an.position.x += 0.1; w.scene.incrementRenderId(); stepN(w.scene, 1); }
    const actionWithRenderIdBump = r3(an.position.x);
    out.staleWorldMatrix = { bodyCreatedAt_expected555: created, withForceCompute: created2, actionNoRender_expected3: actionNoRender, actionWithRenderIdBump_expected3: actionWithRenderIdBump };
    w.engine.dispose();
  }
  return out;
}
