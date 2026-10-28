// Physics system: fixed-step stepping, determinism, render isolation, sync, observables, prestep, applyForce.
import { Vector3, Quaternion, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsPrestepType, TransformNode } from "@babylonjs/core";
import { makeWorld, floor, dynBox, steps, check, r, v3 } from "./physics-sys-util.ts";


export async function probe() {
  const out: Record<string, unknown> = {};
  const g = 9.81;

  // ---- T1: free fall after N fixed steps vs semi-implicit Euler (per substep) and analytic
  for (const substeps of [1, 2, 4]) {
    const w = await makeWorld({ substeps });
    const b = dynBox(w, new Vector3(0, 100, 0), new Vector3(0.3, 0.3, 0.3), 500);
    const N = 60;
    steps(w, N);
    const M = N * substeps;
    const h = 1 / 60 / substeps;
    const semi = (g * h * h * M * (M + 1)) / 2;
    const analytic = 0.5 * g * (N / 60) ** 2;
    const dropped = 100 - b.transformNode.position.y;
    const vy = b.getLinearVelocity().y;
    // Havok's integrator lands between semi-implicit Euler and the exact parabola. One step more or less would
    // be ±3 % (½g(61/60)² = 5.07 m), so a 0.5 % tolerance proves the step count and dt are exact.
    const ok = Math.abs(dropped - analytic) / analytic < 0.005 && Math.abs(vy + g) < 0.01 && w.physics.stepIndex === N;
    check(out, `T1_freeFall_substeps${substeps}`, ok, { dropped: r(dropped, 5), analytic: r(analytic, 5), semiImplicitEuler: r(semi, 5), errVsAnalyticPct: r((100 * (dropped - analytic)) / analytic, 3), vy: r(vy, 5), stepIndex: w.physics.stepIndex });
    w.dispose();
  }

  // ---- T2: scene.render() / runRenderLoop never advance physics
  {
    const w = await makeWorld();
    floor(w);
    const b = dynBox(w, new Vector3(0, 5, 0), new Vector3(0.3, 0.3, 0.3), 500);
    const y0 = b.transformNode.position.y;
    for (let i = 0; i < 120; i++) w.scene.render();
    const afterRenders = b.transformNode.position.y;
    await new Promise<void>((res) => {
      let f = 0;
      const fn = () => {
        w.scene.render();
        if (++f >= 30) {
          w.engine.stopRenderLoop(fn);
          res();
        }
      };
      w.engine.runRenderLoop(fn);
    });
    const afterLoop = b.transformNode.position.y;
    // interleaving renders between steps gives exactly the same trajectory as stepping alone
    const w2 = await makeWorld();
    floor(w2);
    const b2 = dynBox(w2, new Vector3(0, 5, 0), new Vector3(0.3, 0.3, 0.3), 500);
    for (let i = 0; i < 90; i++) {
      w.physics.step(1 / 60);
      for (let k = 0; k < 3; k++) w.scene.render();
      w2.physics.step(1 / 60);
    }
    check(out, "T2_renderDoesNotStep", afterRenders === y0 && afterLoop === y0 && b.transformNode.position.y === b2.transformNode.position.y, {
      y0,
      afterRenders,
      afterLoop,
      interleaved: r(b.transformNode.position.y, 6),
      reference: r(b2.transformNode.position.y, 6),
      physicsEnabled: w.scene.physicsEnabled,
    });
    w.dispose();
    w2.dispose();
  }

  // ---- T3: bitwise determinism of two fresh worlds (pile of 60 rotated boxes and hulls)
  {
    const run = async () => {
      const w = await makeWorld();
      floor(w);
      const bodies: PhysicsBody[] = [];
      for (let i = 0; i < 60; i++) {
        const rot = Quaternion.RotationYawPitchRoll(i * 0.37, i * 0.71, i * 0.13);
        bodies.push(dynBox(w, new Vector3((i % 5) * 0.31 - 0.6, 0.5 + Math.floor(i / 5) * 0.32, ((i * 7) % 5) * 0.05), new Vector3(0.25, 0.2 + (i % 3) * 0.05, 0.3), 400 + i * 10, { rot }));
      }
      steps(w, 240);
      const pos = bodies.map((b) => [b.transformNode.position.x, b.transformNode.position.y, b.transformNode.position.z, b.transformNode.rotationQuaternion!.w]).flat();
      w.dispose();
      return pos;
    };
    const a = await run();
    const b = await run();
    let maxDiff = 0;
    for (let i = 0; i < a.length; i++) maxDiff = Math.max(maxDiff, Math.abs(a[i] - b[i]));
    check(out, "T3_bitwiseDeterminism", maxDiff === 0, { maxDiff, sample: a.slice(0, 4).map((x) => r(x, 5)) });
  }

  // ---- T4: observables once per fixed step (any substeps); prestep TELEPORT bodies (character controller style)
  {
    const w = await makeWorld({ substeps: 3 });
    let before = 0;
    let after = 0;
    w.scene.onBeforePhysicsObservable.add(() => before++);
    w.scene.onAfterPhysicsObservable.add(() => after++);
    // a body created directly through Babylon (foreign) with TELEPORT prestep, moved via its node
    const n = new TransformNode("cc", w.scene);
    n.position.set(0, 1, 0);
    n.rotationQuaternion = Quaternion.Identity();
    n.computeWorldMatrix(true);
    const cc = new PhysicsBody(n, PhysicsMotionType.ANIMATED, false, w.scene);
    cc.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.6, 1.8, 0.6), w.scene);
    cc.setPrestepType(PhysicsPrestepType.TELEPORT);
    for (let i = 0; i < 10; i++) {
      n.position.x = i * 0.1;
      w.physics.step(1 / 60);
    }
    const hk = w.physics.hk.HP_Body_GetQTransform(cc._pluginData.hpBodyId)[1][0];
    check(out, "T4_observablesOncePerStep_andPrestep", before === 10 && after === 10 && Math.abs(hk[0] - 0.9) < 1e-6, { before, after, havokX: r(hk[0], 6), nodeX: r(n.position.x, 6) });
    w.dispose();
  }

  // ---- T5: node == Havok after each step; world matrix already fresh (no computeWorldMatrix needed)
  {
    const w = await makeWorld();
    floor(w);
    const b = dynBox(w, new Vector3(0.2, 2, -0.3), new Vector3(0.3, 0.2, 0.4), 600, { rot: Quaternion.RotationYawPitchRoll(0.4, 0.9, 0.2) });
    b.setAngularVelocity(new Vector3(3, -2, 5));
    b.setLinearVelocity(new Vector3(1, 3, -0.5));
    let maxPosErr = 0;
    let maxRotErr = 0;
    let maxWmErr = 0;
    for (let i = 0; i < 90; i++) {
      w.physics.step(1 / 60);
      const t = w.physics.hk.HP_Body_GetQTransform(b._pluginData.hpBodyId)[1];
      const p = b.transformNode.position;
      const q = b.transformNode.rotationQuaternion!;
      maxPosErr = Math.max(maxPosErr, Math.abs(p.x - t[0][0]), Math.abs(p.y - t[0][1]), Math.abs(p.z - t[0][2]));
      const dot = Math.abs(q.x * t[1][0] + q.y * t[1][1] + q.z * t[1][2] + q.w * t[1][3]);
      maxRotErr = Math.max(maxRotErr, 1 - dot);
      const m = b.transformNode.getWorldMatrix().m; // NOT recomputed here: must already be fresh
      maxWmErr = Math.max(maxWmErr, Math.abs(m[12] - p.x), Math.abs(m[13] - p.y), Math.abs(m[14] - p.z));
    }
    check(out, "T5_syncAfterEachStep", maxPosErr < 1e-6 && maxRotErr < 1e-6 && maxWmErr < 1e-6, { maxPosErr, maxRotErr, maxWmErr });
    w.dispose();
  }

  // ---- T6: applyForce(F) once per fixed step == continuous force (impulse F·dt), independent of substeps
  for (const substeps of [1, 3]) {
    const w = await makeWorld({ substeps, gravity: 0 });
    const b = dynBox(w, new Vector3(0, 0, 0), new Vector3(0.5, 0.5, 0.5), 16); // 2 kg
    const m = w.physics.massOf(b);
    for (let i = 0; i < 60; i++) {
      b.applyForce(new Vector3(12, 0, 0), b.transformNode.position);
      w.physics.step(1 / 60);
    }
    const vx = b.getLinearVelocity().x;
    check(out, `T6_applyForce_substeps${substeps}`, Math.abs(vx - (12 / m) * 1) < 0.01, { mass: r(m, 3), vx: r(vx, 4), expected: r(12 / m, 4) });
    w.dispose();
  }

  // ---- T7: invalid dt ignored; stepIndex
  {
    const w = await makeWorld();
    const b = dynBox(w, new Vector3(0, 5, 0), new Vector3(0.3, 0.3, 0.3), 500);
    w.physics.step(0);
    w.physics.step(NaN);
    w.physics.step(-1);
    const unchanged = b.transformNode.position.y === 5 && w.physics.stepIndex === 0;
    w.physics.step(1 / 60);
    check(out, "T7_invalidDtIgnored", unchanged && w.physics.stepIndex === 1, { stepIndex: w.physics.stepIndex, y: v3(b.transformNode.position) });
    w.dispose();
  }
  return out;
}
