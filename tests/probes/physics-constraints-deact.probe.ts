// Does Havok's deactivation damping eat small continuous forces (door push, slow drags)? ALWAYS_ACTIVE fixes it?
import { Vector3, HingeConstraint, PhysicsMotionType, PhysicsActivationControl } from "@babylonjs/core";
import { makeWorld, makeBox, stepN, localToWorld, relAngle, r3, deg, newHavok } from "./physics-constraints-util.ts";

export async function probe() {
  const out: Record<string, unknown> = {};
  for (const mode of ["default", "ALWAYS_ACTIVE"] as const) {
    for (const F of [2, 5, 20]) {
      const w = await makeWorld(await newHavok());
      const frame = makeBox(w.scene, "frame", new Vector3(0.1, 2.1, 0.1), new Vector3(-0.5, 1.05, 0), { motion: PhysicsMotionType.STATIC });
      const door = makeBox(w.scene, "door", new Vector3(0.9, 2.0, 0.04), new Vector3(0, 1.05, 0), { mass: 20 });
      door.setAngularDamping(0);
      if (mode === "ALWAYS_ACTIVE") w.plugin.setActivationControl(door, PhysicsActivationControl.ALWAYS_ACTIVE);
      const c = new HingeConstraint(new Vector3(0.05, 0, 0), new Vector3(-0.45, 0, 0), Vector3.Up(), Vector3.Up(), w.scene);
      frame.addConstraint(door, c);
      stepN(w.scene, 10);
      const obs = w.scene.onBeforePhysicsObservable.add(() => door.applyForce(new Vector3(0, 0, F), localToWorld(door, new Vector3(0.45, 0, 0))));
      stepN(w.scene, 60);
      w.scene.onBeforePhysicsObservable.remove(obs);
      const I = 20 * (0.81 + 0.0016) / 12 + 20 * 0.2025;
      out[`door_${mode}_${F}N`] = { omega: r3(door.getAngularVelocity().y), expectOmega: r3(-(F * 0.9) / I), angleDeg: deg(relAngle(frame, door, Vector3.Up(), new Vector3(1, 0, 0))), expectDeg: deg(-0.5 * (F * 0.9) / I) };
      w.dispose();
    }
    // free box, no gravity, pushed with 1 N for 1 s
    const w = await makeWorld(await newHavok(), new Vector3(0, 0, 0));
    const box = makeBox(w.scene, "box", new Vector3(0.3, 0.3, 0.3), new Vector3(0, 1, 0), { mass: 10 });
    if (mode === "ALWAYS_ACTIVE") w.plugin.setActivationControl(box, PhysicsActivationControl.ALWAYS_ACTIVE);
    stepN(w.scene, 10);
    const obs = w.scene.onBeforePhysicsObservable.add(() => box.applyForce(new Vector3(1, 0, 0), box.transformNode.position));
    stepN(w.scene, 60);
    w.scene.onBeforePhysicsObservable.remove(obs);
    out[`box10kg_${mode}_1N`] = { v: r3(box.getLinearVelocity().x), expect: 0.1, x: r3(box.transformNode.position.x), expectX: 0.05 };
    w.dispose();
  }
  return out;
}
