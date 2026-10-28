// Game loop & physics stepping: how scene.render() advances Havok, and how to drive it ourselves
// at a fixed 60 Hz from src/core/time.ts without render() adding wall-clock steps.
import {
  Engine, Scene, Vector3, MeshBuilder, PhysicsAggregate, PhysicsShapeType, HavokPlugin, PhysicsEventType,
  type IPhysicsCollisionEvent, type IBasePhysicsCollisionEvent,
} from "@babylonjs/core";
import { Time, FIXED_DT } from "../../src/core/time.ts";
import { makeWorld, freshCanvas, r, type World } from "./input-loop-util.ts";

/** Wrap plugin.executeStep to record every Havok step (delta seconds). */
function spySteps(plugin: HavokPlugin) {
  const deltas: number[] = [];
  const orig = plugin.executeStep.bind(plugin);
  plugin.executeStep = (delta, bodies) => {
    deltas.push(delta);
    orig(delta, bodies);
  };
  return deltas;
}

function runLoop(engine: Engine, frames: number, body: (frame: number) => void): Promise<void> {
  return new Promise((res) => {
    let f = 0;
    const fn = () => {
      body(f);
      if (++f >= frames) {
        engine.stopRenderLoop(fn);
        res();
      }
    };
    engine.runRenderLoop(fn);
  });
}

function sphere(w: World, y: number) {
  const m = MeshBuilder.CreateSphere("s", { diameter: 0.5, segments: 8 }, w.scene);
  m.position.set(0, y, 0);
  const agg = new PhysicsAggregate(m, PhysicsShapeType.SPHERE, { mass: 1 }, w.scene);
  return { m, agg };
}

export async function probe() {
  const out: Record<string, unknown> = {};

  // ---- T1: default behaviour under a real render loop (physicsEnabled = true) --------------------
  {
    const w = await makeWorld({ canvas: freshCanvas() });
    const deltas = spySteps(w.plugin);
    const order: string[] = [];
    let frameIdx = 0;
    const log = (s: string) => frameIdx === 10 && order.push(s);
    w.engine.onBeginFrameObservable.add(() => log("engine.onBeginFrame"));
    w.scene.onBeforeAnimationsObservable.add(() => log("scene.onBeforeAnimations"));
    w.scene.onBeforePhysicsObservable.add(() => log("scene.onBeforePhysics"));
    w.scene.onAfterPhysicsObservable.add(() => log("scene.onAfterPhysics"));
    w.scene.onBeforeStepObservable.add(() => log("scene.onBeforeStep"));
    w.scene.onBeforeRenderObservable.add(() => log("scene.onBeforeRender"));
    w.scene.onAfterRenderObservable.add(() => log("scene.onAfterRender"));
    w.engine.onEndFrameObservable.add(() => log("engine.onEndFrame"));
    const engDt: number[] = [];
    const sceneDt: number[] = [];
    await runLoop(w.engine, 40, (f) => {
      frameIdx = f;
      log("runRenderLoop callback (before scene.render)");
      engDt.push(w.engine.getDeltaTime());
      w.scene.render();
      sceneDt.push(w.scene.deltaTime);
    });
    out.T1_default_renderLoop = {
      frames: 40,
      havokSteps: deltas.length,
      stepDeltaSec_first5: deltas.slice(0, 5).map((d) => r(d)),
      stepDeltaSec_10to14: deltas.slice(10, 15).map((d) => r(d)),
      engineGetDeltaTimeMs_10to14: engDt.slice(10, 15).map((d) => r(d, 2)),
      sceneDeltaTimeMs_10to14: sceneDt.slice(10, 15).map((d) => r(d, 2)),
      orderWithinOneFrame: order,
      getTimeStep: w.engine.getTimeStep(),
      physicsEngineTimeStep: w.scene.getPhysicsEngine()!.getTimeStep(),
    };
    w.engine.dispose();
  }

  // ---- T2: scene.physicsEnabled=false + our Time accumulator driving Havok -----------------------
  {
    const w = await makeWorld({ canvas: freshCanvas() });
    const deltas = spySteps(w.plugin);
    const ground = MeshBuilder.CreateBox("g", { width: 10, height: 0.2, depth: 10 }, w.scene);
    ground.position.y = -0.1;
    new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, w.scene);
    const box = MeshBuilder.CreateBox("b", { size: 0.5 }, w.scene);
    box.position.y = 1.0;
    const agg = new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 1, restitution: 0.3 }, w.scene);
    agg.body.setCollisionCallbackEnabled(true);
    agg.body.setCollisionEndedCallbackEnabled(true);
    w.scene.physicsEnabled = false; // <- scene.render() no longer calls _advancePhysicsEngineStep
    const time = new Time();
    const phys = w.scene.getPhysicsEngine()!;
    let inStep = false;
    let stepsFromRender = 0;
    let collisionsInStep = 0;
    let collisionsOutsideStep = 0;
    let bodyObsEvents = 0;
    const types: Record<string, number> = {};
    let beforePhysicsNotified = 0;
    w.scene.onBeforePhysicsObservable.add(() => beforePhysicsNotified++);
    const onCol = (ev: IPhysicsCollisionEvent | IBasePhysicsCollisionEvent) => {
      if (inStep) collisionsInStep++;
      else collisionsOutsideStep++;
      types[ev.type] = (types[ev.type] ?? 0) + 1;
    };
    w.plugin.onCollisionObservable.add(onCol);
    w.plugin.onCollisionEndedObservable.add(onCol);
    agg.body.getCollisionObservable().add(() => bodyObsEvents++);
    const stepsPerFrame: number[] = [];
    let syncChecked = { meshY: 0, bodyY: 0, equal: false };
    const t0 = performance.now();
    await runLoop(w.engine, 90, (f) => {
      const n = time.beginFrame(w.engine.getDeltaTime() / 1000);
      stepsPerFrame.push(n);
      for (let i = 0; i < n; i++) {
        inStep = true;
        // Option A (what the scene does internally, incl. onBefore/AfterPhysicsObservable):
        w.scene._advancePhysicsEngineStep(FIXED_DT * 1000);
        // Option B equivalent without observables: phys._step(FIXED_DT);
        inStep = false;
        time.tick();
      }
      if (f === 5 && n > 0) {
        // body -> mesh sync happened inside the step (before render)
        const bodyPos = agg.body.getObjectCenterWorld(); // read from Havok
        syncChecked = { meshY: r(box.position.y), bodyY: r(bodyPos.y), equal: Math.abs(box.position.y - bodyPos.y) < 1e-4 };
      }
      const before = deltas.length;
      w.scene.render();
      stepsFromRender += deltas.length - before;
    });
    const realSec = (performance.now() - t0) / 1000;
    out.T2_manual_fixed_step = {
      frames: 90,
      realSeconds: r(realSec, 3),
      simSeconds: r(time.simTime, 3),
      havokSteps: deltas.length,
      allDeltasFixed: deltas.every((d) => Math.abs(d - FIXED_DT) < 1e-12),
      stepsAddedByScene_render: stepsFromRender,
      stepsPerFrameHistogram: stepsPerFrame.reduce<Record<number, number>>((h, n) => ((h[n] = (h[n] ?? 0) + 1), h), {}),
      onBeforePhysicsObservableFired: beforePhysicsNotified,
      collisionEventsInsideOurStep: collisionsInStep,
      collisionEventsOutside: collisionsOutsideStep,
      collisionTypes: types,
      bodyObservableEvents: bodyObsEvents,
      boxRestY: r(box.position.y, 3),
      syncAfterStep: syncChecked,
      phys_step_is_function: typeof phys._step,
    };
    w.engine.dispose();
  }

  // ---- T3: exactness — N manual steps of free fall, both _step and executeStep -------------------
  {
    const w = await makeWorld({ canvas: freshCanvas() });
    w.scene.physicsEnabled = false;
    const a = sphere(w, 100);
    const N = 60;
    const phys = w.scene.getPhysicsEngine()!;
    for (let i = 0; i < N; i++) phys._step(FIXED_DT);
    const g = 9.81;
    const dropped = 100 - a.m.position.y;
    const semiImplicit = g * FIXED_DT * FIXED_DT * (N * (N + 1)) / 2; // v+=g dt; x+=v dt
    const analytic = 0.5 * g * (N * FIXED_DT) ** 2;
    const v = a.agg.body.getLinearVelocity().length();
    // renders afterwards must not move it
    const yBefore = a.m.position.y;
    for (let i = 0; i < 30; i++) w.scene.render();
    out.T3_free_fall_60_manual_steps = {
      dropped: r(dropped, 5),
      predicted_semiImplicitEuler: r(semiImplicit, 5),
      predicted_analytic: r(analytic, 5),
      velocity: r(v, 5),
      predicted_velocity: r(g * N * FIXED_DT, 5),
      movedBy30RendersWithPhysicsDisabled: r(a.m.position.y - yBefore, 6),
    };
    // _step(0) and _step(big) clamping
    a.agg.body.setLinearVelocity(Vector3.Zero());
    phys._step(0);
    const vAfterZero = a.agg.body.getLinearVelocity().length();
    a.agg.body.setLinearVelocity(Vector3.Zero());
    phys._step(0.5);
    const vAfterHalf = a.agg.body.getLinearVelocity().length();
    out.T3_step_clamping = {
      velocityAfter_step0: r(vAfterZero, 5),
      equals_g_over_60: Math.abs(vAfterZero - g / 60) < 1e-3,
      velocityAfter_step0_5: r(vAfterHalf, 5),
      equals_g_times_0_1: Math.abs(vAfterHalf - g * 0.1) < 1e-3,
    };
    w.engine.dispose();
  }

  // ---- T4: does setTimeStep(0) stop render-driven stepping? (it should NOT be used) ---------------
  {
    const w = await makeWorld({ canvas: freshCanvas(), useDelta: true });
    const a = sphere(w, 100);
    w.scene.getPhysicsEngine()!.setTimeStep(0);
    for (let i = 0; i < 20; i++) w.scene.render();
    const movedUseDelta = 100 - a.m.position.y;
    // applyForce scales by getTimeStep(): with timeStep 0 forces do nothing
    a.agg.body.setLinearVelocity(Vector3.Zero());
    a.agg.body.applyForce(new Vector3(100, 0, 0), a.m.position);
    const vxAfterForce = a.agg.body.getLinearVelocity().x;
    w.engine.dispose();

    const w2 = await makeWorld({ canvas: freshCanvas(), useDelta: false });
    const b = sphere(w2, 100);
    w2.scene.getPhysicsEngine()!.setTimeStep(0);
    let err = "";
    try {
      for (let i = 0; i < 20; i++) w2.scene.render();
    } catch (e) {
      err = String(e);
    }
    out.T4_setTimeStep0 = {
      useDeltaTrue_movedAfter20Renders: r(movedUseDelta, 5),
      useDeltaTrue_applyForce100N_vx: r(vxAfterForce, 5),
      useDeltaFalse_movedAfter20Renders: r(100 - b.m.position.y, 5),
      useDeltaFalse_error: err,
    };
    w2.engine.dispose();
  }

  // ---- T5: deterministicLockstep engine option -------------------------------------------------
  {
    const w = await makeWorld({
      canvas: freshCanvas(),
      engine: { deterministicLockstep: true, lockstepMaxSteps: 4, timeStep: 1 / 60 },
    });
    const deltas = spySteps(w.plugin);
    let stepsThisFrame = 0;
    const perFrame: number[] = [];
    w.scene.onBeforeStepObservable.add(() => stepsThisFrame++);
    const stepIds: number[] = [];
    const engDt: number[] = [];
    await runLoop(w.engine, 60, () => {
      stepsThisFrame = 0;
      engDt.push(w.engine.getDeltaTime());
      w.scene.render();
      perFrame.push(stepsThisFrame);
      stepIds.push(w.scene.getStepId());
    });
    out.T5_deterministicLockstep = {
      isDeterministicLockStep: w.engine.isDeterministicLockStep(),
      getLockstepMaxSteps: w.engine.getLockstepMaxSteps(),
      getTimeStep_ms: w.engine.getTimeStep(),
      havokSteps: deltas.length,
      allDeltasFixed: deltas.every((d) => Math.abs(d - 1 / 60) < 1e-9),
      stepsPerFrameHistogram: perFrame.reduce<Record<number, number>>((h, n) => ((h[n] = (h[n] ?? 0) + 1), h), {}),
      finalStepId: stepIds[stepIds.length - 1],
      avgEngineDeltaMs: r(engDt.slice(5).reduce((a, b) => a + b, 0) / (engDt.length - 5), 2),
    };
    w.engine.dispose();
  }

  // ---- T6: render() WITHOUT runRenderLoop: engine.getDeltaTime() never updates -------------------
  {
    const w = await makeWorld({ canvas: freshCanvas() });
    const deltas = spySteps(w.plugin);
    for (let i = 0; i < 10; i++) w.scene.render();
    out.T6_manual_render_no_loop = {
      engineGetDeltaTime: w.engine.getDeltaTime(),
      havokStepDeltas: deltas.slice(0, 3).map((d) => r(d, 5)),
      note: "Scene.MinDeltaTime (1 ms) clamp -> 0.001 s steps",
    };
    w.engine.dispose();
  }

  // ---- T7: cost of one fixed step with 200 dynamic boxes (awake) ----------------------------------
  {
    const w = await makeWorld({ canvas: freshCanvas() });
    w.scene.physicsEnabled = false;
    const ground = MeshBuilder.CreateBox("g", { width: 40, height: 0.2, depth: 40 }, w.scene);
    new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, w.scene);
    for (let i = 0; i < 200; i++) {
      const b = MeshBuilder.CreateBox("b" + i, { size: 0.4 }, w.scene);
      b.position.set((i % 10) - 5, 0.5 + Math.floor(i / 100) * 0.5, Math.floor((i % 100) / 10) - 5);
      new PhysicsAggregate(b, PhysicsShapeType.BOX, { mass: 1 }, w.scene);
    }
    const phys = w.scene.getPhysicsEngine()!;
    for (let i = 0; i < 10; i++) phys._step(FIXED_DT);
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) phys._step(FIXED_DT);
    out.T7_step_cost_200_boxes_ms = r((performance.now() - t0) / 60, 3);
    w.engine.dispose();
  }
  void PhysicsEventType;
  void Scene;
  return out;
}
