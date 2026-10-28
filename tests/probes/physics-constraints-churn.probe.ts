// Constraint churn in ONE world: memory growth per created+disposed constraint, step cost, crash check.
import { Vector3, Physics6DoFConstraint, BallAndSocketConstraint, PhysicsConstraintAxis, PhysicsConstraintMotorType, PhysicsMotionType } from "@babylonjs/core";
import { makeWorld, makeBox, stepN, hkStats, r3, newHavok } from "./physics-constraints-util.ts";

export async function probe() {
  const out: Record<string, unknown> = {};
  const w = await makeWorld(await newHavok());
  const anchor = makeBox(w.scene, "anchor", new Vector3(0.2, 0.2, 0.2), new Vector3(0, 5, 0), { motion: PhysicsMotionType.STATIC });
  const bodies = [];
  for (let i = 0; i < 20; i++) bodies.push(makeBox(w.scene, "b" + i, new Vector3(0.1, 0.1, 0.1), new Vector3(i * 0.3, 4, 0), { mass: 1 }));
  stepN(w.scene, 2);
  const heap0 = w.hk.HEAPU8.length;
  const t0 = performance.now();
  let created = 0;
  const rounds: unknown[] = [];
  for (let round = 0; round < 5; round++) {
    for (let k = 0; k < 4000; k++) {
      const b = bodies[k % 20];
      const c = new Physics6DoFConstraint({ pivotA: new Vector3((k % 20) * 0.3, -1, 0), pivotB: Vector3.Zero() }, [{ axis: PhysicsConstraintAxis.LINEAR_DISTANCE, minLimit: 0, maxLimit: 0.01 }], w.scene);
      anchor.addConstraint(b, c);
      c.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.POSITION);
      c.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, 10);
      if (k % 50 === 0) stepN(w.scene, 1);
      c.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, 0);
      c.dispose();
      created++;
    }
    const ts = performance.now();
    stepN(w.scene, 60);
    rounds.push({ created, heapMB: r3(w.hk.HEAPU8.length / 1048576), stats: hkStats(w.hk), msPerStep: r3((performance.now() - ts) / 60) });
  }
  out.rounds = rounds;
  out.heapGrowthBytesPerConstraint = r3((w.hk.HEAPU8.length - heap0) / created);
  out.totalMs = Math.round(performance.now() - t0);
  // body + constraint churn: dispose bodies with live constraints, recreate
  for (let k = 0; k < 500; k++) {
    const b = makeBox(w.scene, "t" + k, new Vector3(0.1, 0.1, 0.1), new Vector3(10, 4, 0), { mass: 1 });
    const c = new BallAndSocketConstraint(new Vector3(10, -1, 0), Vector3.Zero(), Vector3.Up(), Vector3.Up(), w.scene);
    anchor.addConstraint(b, c);
    stepN(w.scene, 1);
    if (k % 2) { c.dispose(); const s = b.shape; b.dispose(); s?.dispose(); } else { const s = b.shape; b.dispose(); s?.dispose(); c.dispose(); }
  }
  out.afterBodyChurn = { stats: hkStats(w.hk), heapMB: r3(w.hk.HEAPU8.length / 1048576) };
  return out;
}
