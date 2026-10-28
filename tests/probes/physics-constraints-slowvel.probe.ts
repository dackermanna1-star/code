// Characterise Havok's slow-velocity damping: threshold and per-step decrement, linear and angular, mass dependence.
import { Vector3, PhysicsActivationControl } from "@babylonjs/core";
import { makeWorld, makeBox, stepN, r3, newHavok } from "./physics-constraints-util.ts";

export async function probe() {
  const out: Record<string, unknown> = {};
  const lin: unknown[] = [];
  for (const mass of [1, 10, 100]) {
    for (const v0 of [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.5]) {
      const w = await makeWorld(await newHavok(), new Vector3(0, 0, 0));
      const box = makeBox(w.scene, "box", new Vector3(0.3, 0.3, 0.3), new Vector3(0, 1, 0), { mass });
      w.plugin.setActivationControl(box, PhysicsActivationControl.ALWAYS_ACTIVE);
      box.setAngularDamping(0);
      stepN(w.scene, 3);
      box.setLinearVelocity(new Vector3(v0, 0, 0));
      stepN(w.scene, 1);
      const v1 = box.getLinearVelocity().x;
      stepN(w.scene, 9);
      const v10 = box.getLinearVelocity().x;
      lin.push({ mass, v0, dvFirstStep: r3((v0 - v1) * 1000) / 1000, v10: r3(v10 * 1000) / 1000 });
      w.dispose();
    }
  }
  out.linear = lin;
  const ang: unknown[] = [];
  for (const w0 of [0.05, 0.1, 0.2, 0.3, 0.5, 1]) {
    const w = await makeWorld(await newHavok(), new Vector3(0, 0, 0));
    const box = makeBox(w.scene, "box", new Vector3(0.3, 0.3, 0.3), new Vector3(0, 1, 0), { mass: 10 });
    w.plugin.setActivationControl(box, PhysicsActivationControl.ALWAYS_ACTIVE);
    box.setAngularDamping(0);
    stepN(w.scene, 3);
    box.setAngularVelocity(new Vector3(0, w0, 0));
    stepN(w.scene, 1);
    const a1 = box.getAngularVelocity().y;
    stepN(w.scene, 9);
    ang.push({ w0, dwFirstStep: r3((w0 - a1) * 1000) / 1000, w10: r3(box.getAngularVelocity().y * 1000) / 1000 });
    w.dispose();
  }
  out.angular = ang;
  // with gravity: box sliding slowly on a frictionless floor
  {
    const w = await makeWorld(await newHavok());
    makeBox(w.scene, "floor", new Vector3(20, 0.2, 20), new Vector3(0, -0.1, 0), { motion: 0, friction: 0 });
    const box = makeBox(w.scene, "box", new Vector3(0.3, 0.3, 0.3), new Vector3(0, 0.15, 0), { mass: 10, friction: 0 });
    stepN(w.scene, 30);
    box.setLinearVelocity(new Vector3(0.1, 0, 0));
    stepN(w.scene, 30);
    out.slidingFrictionless_v0_0_1 = { vAfter0_5s: r3(box.getLinearVelocity().x * 1000) / 1000 };
    w.dispose();
  }
  return out;
}
