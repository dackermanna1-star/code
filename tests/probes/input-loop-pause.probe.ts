// Pausing & stepping details: public-API stepping via plugin.executeStep(dt, getBodies()), _step(0) vs
// _step(1/60), what keeps moving while physics is not stepped (Animatables, ParticleSystems), and how to
// freeze them; deltaTime units after a stall.
import {
  Vector3, Color4, MeshBuilder, PhysicsAggregate, PhysicsShapeType, ParticleSystem, Texture, Animation,
  PhysicsEngineV2, type IParticleSystem,
} from "@babylonjs/core";
import { FIXED_DT } from "../../src/core/time.ts";
import { makeWorld, freshCanvas, r, frames, sleep, type World } from "./input-loop-util.ts";

function sphere(w: World, y: number, name = "s") {
  const m = MeshBuilder.CreateSphere(name, { diameter: 0.5, segments: 8 }, w.scene);
  m.position.set(0, y, 0);
  const agg = new PhysicsAggregate(m, PhysicsShapeType.SPHERE, { mass: 1 }, w.scene);
  return { m, agg };
}

function particlePositions(ps: IParticleSystem): number[] {
  const parts = (ps as unknown as { particles: Array<{ position: Vector3 }> }).particles ?? [];
  return parts.slice(0, 3).map((p) => r(p.position.y, 4));
}

export async function probe() {
  const out: Record<string, unknown> = {};

  // A) _step vs plugin.executeStep(dt, getBodies()) give identical results
  {
    const w1 = await makeWorld({ canvas: freshCanvas() });
    w1.scene.physicsEnabled = false;
    const a = sphere(w1, 50);
    for (let i = 0; i < 60; i++) w1.scene.getPhysicsEngine()!._step(FIXED_DT);
    const yA = a.m.position.y;
    w1.engine.dispose();
    const w2 = await makeWorld({ canvas: freshCanvas() });
    w2.scene.physicsEnabled = false;
    const b = sphere(w2, 50);
    const pe = w2.scene.getPhysicsEngine() as PhysicsEngineV2; // getBodies() is not on IPhysicsEngine
    for (let i = 0; i < 60; i++) w2.plugin.executeStep(FIXED_DT, pe.getBodies());
    out.A_step_vs_executeStep = { yAfter60_step: r(yA, 6), yAfter60_executeStep: r(b.m.position.y, 6), identical: yA === b.m.position.y };
    w2.engine.dispose();
  }

  // B) single step from rest: _step(0) vs _step(1/60)
  {
    const w = await makeWorld({ canvas: freshCanvas() });
    w.scene.physicsEnabled = false;
    const a = sphere(w, 50, "a");
    const pe = w.scene.getPhysicsEngine()!;
    pe._step(1 / 60);
    const v1 = a.agg.body.getLinearVelocity().y;
    a.agg.body.setLinearVelocity(Vector3.Zero());
    pe._step(1 / 60);
    const v2 = a.agg.body.getLinearVelocity().y;
    a.agg.body.setLinearVelocity(Vector3.Zero());
    pe._step(0);
    const v3 = a.agg.body.getLinearVelocity().y;
    out.B_single_step_velocity = {
      firstStepFromCreation: r(v1, 5),
      afterSetVelocityZero_step1_60: r(v2, 5),
      afterSetVelocityZero_step0: r(v3, 5),
      g_over_60: r(-9.81 / 60, 5),
      step0_equals_step1_60: Math.abs(v2 - v3) < 1e-6,
    };
    w.engine.dispose();
  }

  // C) what moves while physics is not stepped: Animatable + ParticleSystem; how to freeze them
  {
    const w = await makeWorld({ canvas: freshCanvas() });
    w.scene.physicsEnabled = false;
    w.scene.clearColor = new Color4(0, 0, 0, 1);
    const anim = MeshBuilder.CreateBox("anim", { size: 0.3 }, w.scene);
    const a = new Animation("a", "position.x", 60, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);
    a.setKeys([{ frame: 0, value: 0 }, { frame: 600, value: 100 }]);
    anim.animations.push(a);
    w.scene.beginAnimation(anim, 0, 600, true);
    const emitter = MeshBuilder.CreateBox("em", { size: 0.1 }, w.scene);
    const ps = new ParticleSystem("ps", 200, w.scene);
    ps.particleTexture = new Texture("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", w.scene);
    ps.emitter = emitter;
    ps.emitRate = 100;
    ps.minLifeTime = ps.maxLifeTime = 100;
    ps.direction1 = ps.direction2 = new Vector3(0, 1, 0);
    ps.minEmitPower = ps.maxEmitPower = 1;
    ps.gravity = Vector3.Zero();
    ps.start();
    const loop = () => w.scene.render();
    w.engine.runRenderLoop(loop);
    await frames(20);
    const s0 = { animX: r(anim.position.x, 3), particles: ps.getActiveCount(), p: particlePositions(ps) };
    await frames(20);
    const s1 = { animX: r(anim.position.x, 3), particles: ps.getActiveCount(), p: particlePositions(ps) };
    // freeze: animations via scene.animationsEnabled=false, particles via updateSpeed=0
    w.scene.animationsEnabled = false;
    const tFreeze = performance.now();
    const savedSpeed = ps.updateSpeed;
    ps.updateSpeed = 0;
    await frames(20);
    const s2 = { animX: r(anim.position.x, 3), particles: ps.getActiveCount(), p: particlePositions(ps) };
    await frames(20);
    const s3 = { animX: r(anim.position.x, 3), particles: ps.getActiveCount(), p: particlePositions(ps) };
    const frozenSec = (performance.now() - tFreeze) / 1000;
    w.scene.animationsEnabled = true;
    ps.updateSpeed = savedSpeed;
    const tRes0 = performance.now();
    await frames(10);
    const s4 = { animX: r(anim.position.x, 3), particles: ps.getActiveCount(), p: particlePositions(ps) };
    out.C1_animationsEnabledFalse_resume = {
      frozenRealSec: r(frozenSec, 3),
      resumedRealSec: r((performance.now() - tRes0) / 1000, 3),
      advanceAfterResume: r(s4.animX - s3.animX, 3),
      expectedIfNoJump: r(10 * ((performance.now() - tRes0) / 1000), 3),
    };
    // clean alternative for Animatables: animationTimeScale = 0 (clock keeps ticking, delta scaled to 0)
    w.scene.animationTimeScale = 0;
    const tPause = performance.now();
    await frames(20);
    const s4b = { animX: r(anim.position.x, 3), pausedRealSec: r((performance.now() - tPause) / 1000, 3) };
    w.scene.animationTimeScale = 1;
    const tRes = performance.now();
    await frames(10);
    const s4c = { animX: r(anim.position.x, 3), resumedRealSec: r((performance.now() - tRes) / 1000, 3) };
    out.C2_animationTimeScale0 = {
      before: s4,
      frozen20f: s4b,
      resumed10f: s4c,
      animUnitsPerSec: 10,
      advanceAfterResume: r(s4c.animX - s4b.animX, 3),
      expectedIfNoJump: r(10 * s4c.resumedRealSec, 3),
    };
    // scene.particlesEnabled=false: systems are neither animated nor drawn
    w.scene.particlesEnabled = false;
    await frames(10);
    const s5 = { particles: ps.getActiveCount(), p: particlePositions(ps) };
    w.scene.particlesEnabled = true;
    out.C_pause = {
      running_20f: s0,
      running_40f: s1,
      frozen_after20f: s2,
      frozen_after40f: s3,
      resumed_10f: s4,
      particlesEnabledFalse_10f: s5,
      animationTimeScaleProp: w.scene.animationTimeScale,
      animatableJumpOnResume: "see resumed_10f.animX vs frozen (Animatable keeps its own clock?)",
    };
    // D) deltaTime after a main-thread stall (e.g. tab switch / long task) and its units
    let maxDt = 0;
    let maxSceneDt = 0;
    const obs = w.scene.onAfterRenderObservable.add(() => {
      maxDt = Math.max(maxDt, w.engine.getDeltaTime());
      maxSceneDt = Math.max(maxSceneDt, w.scene.deltaTime);
    });
    await frames(3);
    const t0 = performance.now();
    while (performance.now() - t0 < 400) {
      /* block main thread 400 ms */
    }
    await frames(3);
    await sleep(10);
    w.scene.onAfterRenderObservable.remove(obs);
    out.D_after_400ms_stall = { maxEngineDeltaMs: r(maxDt, 1), maxSceneDeltaTimeMs: r(maxSceneDt, 1), avgFps: r(w.engine.getFps(), 1) };
    w.engine.stopRenderLoop(loop);
    w.engine.dispose();
  }
  return out;
}
