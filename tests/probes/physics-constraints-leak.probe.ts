// Constraint lifecycle: Havok object counts after dispose, body disposal, scene disposal; re-enable far away.
import { Vector3, BallAndSocketConstraint, HingeConstraint, PhysicsMotionType } from "@babylonjs/core";
import { makeWorld, makeBox, stepN, hkStats, appliedImpulses, r3, v3, newHavok } from "./physics-constraints-util.ts";

export async function probe() {
  const out: Record<string, unknown> = {};
  const hk = await newHavok();
  const w = await makeWorld(hk);
  out.s0 = hkStats(hk);
  const anchor = makeBox(w.scene, "anchor", new Vector3(0.2, 0.2, 0.2), new Vector3(0, 5, 0), { motion: PhysicsMotionType.STATIC });
  const bodies = [];
  const cons = [];
  for (let i = 0; i < 100; i++) {
    const b = makeBox(w.scene, "b" + i, new Vector3(0.1, 0.1, 0.1), new Vector3(i * 0.3, 4, 0), { mass: 1 });
    const c = new BallAndSocketConstraint(new Vector3(i * 0.3, -1, 0), Vector3.Zero(), Vector3.Up(), Vector3.Up(), w.scene);
    anchor.addConstraint(b, c);
    bodies.push(b); cons.push(c);
  }
  stepN(w.scene, 2);
  out.s1_100created = hkStats(hk);
  for (const c of cons) c.dispose();
  out.s2_disposedNoStep = hkStats(hk);
  stepN(w.scene, 2);
  out.s3_disposedStepped = hkStats(hk);
  // constraints whose bodies are disposed first
  const cons2 = [];
  for (let i = 0; i < 50; i++) {
    const c = new BallAndSocketConstraint(new Vector3(i * 0.3, -1, 0), Vector3.Zero(), Vector3.Up(), Vector3.Up(), w.scene);
    anchor.addConstraint(bodies[i], c);
    cons2.push(c);
  }
  out.s4_50more = hkStats(hk);
  for (let i = 0; i < 50; i++) { const s = bodies[i].shape; bodies[i].dispose(); s?.dispose(); }
  stepN(w.scene, 2);
  out.s5_bodiesDisposed_constraintsAlive = hkStats(hk);
  for (const c of cons2) c.dispose();
  stepN(w.scene, 2);
  out.s6_thenConstraintsDisposed = hkStats(hk);

  // re-enabling a disabled constraint after the bodies drifted apart -> snap?
  {
    const post = makeBox(w.scene, "post", new Vector3(0.2, 0.2, 0.2), new Vector3(20, 3, 0), { motion: PhysicsMotionType.STATIC });
    const bob = makeBox(w.scene, "bob", new Vector3(0.3, 0.3, 0.3), new Vector3(20, 2, 0), { mass: 5 });
    const ball = new BallAndSocketConstraint(new Vector3(0, -1, 0), Vector3.Zero(), Vector3.Up(), Vector3.Up(), w.scene);
    post.addConstraint(bob, ball);
    stepN(w.scene, 10);
    ball.isEnabled = false;
    stepN(w.scene, 30); // falls ~1.2 m
    const yFallen = bob.transformNode.position.y;
    ball.isEnabled = true;
    const track: number[][] = [];
    for (let i = 0; i < 8; i++) { stepN(w.scene, 1); track.push([r3(bob.transformNode.position.y), r3(bob.getLinearVelocity().y), r3(appliedImpulses(hk, ball).lin.y)]); }
    out.reenableAfterDrift = { yFallen: r3(yFallen), track_y_vy_impulseY: track };
    ball.dispose();
  }

  // hinge with both bodies removed via scene.dispose -> counts after
  const h = new HingeConstraint(Vector3.Zero(), Vector3.Zero(), Vector3.Up(), Vector3.Up(), w.scene);
  anchor.addConstraint(bodies[60], h);
  out.s7_beforeSceneDispose = hkStats(hk);
  w.dispose();
  out.s8_afterSceneDispose = hkStats(hk);
  return out;
}
