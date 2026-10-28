// Trace: are small impulses / slow velocities eaten by Havok (zero gravity, free box)?
import { Vector3, PhysicsActivationControl } from "@babylonjs/core";
import { makeWorld, makeBox, stepN, r3, newHavok } from "./physics-constraints-util.ts";

export async function probe() {
  const out: Record<string, unknown> = {};
  for (const active of [false, true]) {
    for (const F of [0.5, 1, 3, 10]) {
      const w = await makeWorld(await newHavok(), new Vector3(0, 0, 0));
      const box = makeBox(w.scene, "box", new Vector3(0.3, 0.3, 0.3), new Vector3(0, 1, 0), { mass: 10 });
      if (active) w.plugin.setActivationControl(box, PhysicsActivationControl.ALWAYS_ACTIVE);
      stepN(w.scene, 10);
      const trace: number[] = [];
      let vBeforeStep0 = 0;
      for (let i = 0; i < 60; i++) {
        box.applyForce(new Vector3(F, 0, 0), box.transformNode.position);
        if (i === 0) vBeforeStep0 = box.getLinearVelocity().x;
        stepN(w.scene, 1);
        if (i < 5 || i % 10 === 9) trace.push(r3(box.getLinearVelocity().x * 1000) / 1000);
      }
      out[`${active ? "AA" : "def"}_F${F}`] = { vAfterFirstImpulseBeforeStep: r3(vBeforeStep0 * 1000) / 1000, trace, expectFinal: r3(F * 60 / 60 / 10), x: r3(box.transformNode.position.x) };
      w.dispose();
    }
  }
  // decay of a set velocity
  for (const v0 of [0.02, 0.05, 0.1, 0.3]) {
    const w = await makeWorld(await newHavok(), new Vector3(0, 0, 0));
    const box = makeBox(w.scene, "box", new Vector3(0.3, 0.3, 0.3), new Vector3(0, 1, 0), { mass: 10 });
    w.plugin.setActivationControl(box, PhysicsActivationControl.ALWAYS_ACTIVE);
    stepN(w.scene, 5);
    box.setLinearVelocity(new Vector3(v0, 0, 0));
    const tr: number[] = [];
    for (let i = 0; i < 60; i++) { stepN(w.scene, 1); if (i % 10 === 0) tr.push(r3(box.getLinearVelocity().x * 1000) / 1000); }
    out[`decay_AA_v${v0}`] = tr;
    w.dispose();
  }
  // velocity set each step (kinematic-like drive of a dynamic body)
  {
    const w = await makeWorld(await newHavok(), new Vector3(0, 0, 0));
    const box = makeBox(w.scene, "box", new Vector3(0.3, 0.3, 0.3), new Vector3(0, 1, 0), { mass: 10 });
    stepN(w.scene, 5);
    for (let i = 0; i < 60; i++) { box.setLinearVelocity(new Vector3(0.02, 0, 0)); stepN(w.scene, 1); }
    out.setVelocityEachStep_0_02 = { x: r3(box.transformNode.position.x * 1000) / 1000, expect: 0.02 };
    w.dispose();
  }
  return out;
}
