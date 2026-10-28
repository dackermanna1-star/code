// Q6: trigger shapes (PhysicsShape.isTrigger) and plugin.onTriggerCollisionObservable.
import { Vector3, Quaternion, PhysicsMotionType, PhysicsEventType, type IBasePhysicsCollisionEvent, type PhysicsBody } from "@babylonjs/core";
import { createWorld, makeGround, makeBox, makeSphere, rn } from "./physics-events-common";

export async function probe() {
  const out: any = {};
  const w = await createWorld();
  makeGround(w);
  let stepIdx = -1;
  const nm = (b: PhysicsBody) => b.transformNode.name;
  const trig: any[] = [];
  const coll: any[] = [];
  w.plugin.onTriggerCollisionObservable.add((e: IBasePhysicsCollisionEvent) =>
    trig.push({ step: stepIdx, type: e.type, collider: nm(e.collider), against: nm(e.collidedAgainst), ci: e.colliderIndex, ai: e.collidedAgainstIndex, keys: Object.keys(e).sort().join(",") }),
  );
  w.plugin.onCollisionObservable.add((e) => { if (nm(e.collider).startsWith("T") || nm(e.collidedAgainst).startsWith("T")) coll.push({ step: stepIdx, type: e.type, a: nm(e.collider), b: nm(e.collidedAgainst) }); });

  // T1: static trigger volume 1 m above ground; dynamic box (no callbacks at all) falls through it
  const t1 = makeBox(w, "T1_trigger_static", new Vector3(1, 0.5, 1), new Vector3(0, 1.5, 0), 0);
  t1.shape.isTrigger = true;
  const faller = makeBox(w, "faller_nocb", new Vector3(0.3, 0.3, 0.3), new Vector3(0, 3, 0), 1);
  // T2: static trigger + ANIMATED body moving through it
  const t2 = makeBox(w, "T2_trigger_static", new Vector3(1, 1, 1), new Vector3(4, 0.5, 0), 0);
  t2.shape.isTrigger = true;
  const anim = makeBox(w, "anim_nocb", new Vector3(0.3, 0.3, 0.3), new Vector3(2.5, 0.5, 0), 0, { motion: PhysicsMotionType.ANIMATED });
  // T3: static trigger overlapping a static box from the start
  const t3 = makeBox(w, "T3_trigger_static", new Vector3(1, 1, 1), new Vector3(8, 0.5, 0), 0);
  t3.shape.isTrigger = true;
  makeBox(w, "static_inside_T3", new Vector3(0.3, 0.3, 0.3), new Vector3(8, 0.5, 0), 0);
  // T4: DYNAMIC trigger (gravity off, kept in place) that a dynamic ball rolls through
  const t4 = makeBox(w, "T4_trigger_dynamic", new Vector3(1, 1, 1), new Vector3(12, 0.6, 0), 1);
  t4.shape.isTrigger = true;
  t4.body.setGravityFactor(0);
  const ball = makeSphere(w, "ball_nocb", 0.15, new Vector3(10.5, 0.15, 0), 1);
  // T5: trigger + sleeping body inside: body comes to rest inside the trigger volume (on ground)
  const t5 = makeBox(w, "T5_trigger_static", new Vector3(2, 1, 2), new Vector3(-4, 0.5, 0), 0);
  t5.shape.isTrigger = true;
  const sleeper = makeBox(w, "sleeper_nocb", new Vector3(0.3, 0.3, 0.3), new Vector3(-4, 0.6, 0), 1);
  // T6: body inside a trigger gets disposed -> TRIGGER_EXITED?
  const t6 = makeBox(w, "T6_trigger_static", new Vector3(1, 1, 1), new Vector3(-8, 0.5, 0), 0);
  t6.shape.isTrigger = true;
  const doomed = makeBox(w, "doomed_nocb", new Vector3(0.3, 0.3, 0.3), new Vector3(-8, 0.3, 0), 1);

  let fallerMinY = 99;
  for (let i = 0; i < 240; i++) {
    stepIdx = i;
    if (i === 5) ball.body.setLinearVelocity(new Vector3(3, 0, 0));
    anim.body.setTargetTransform(new Vector3(2.5 + Math.min(i, 120) * (3 / 120), 0.5, 0), Quaternion.Identity());
    if (i === 100) doomed.mesh.dispose();
    w.step();
    fallerMinY = Math.min(fallerMinY, faller.mesh.position.y);
  }
  out.triggerEvents = trig;
  out.collisionEventsInvolvingTriggers = coll.slice(0, 5);
  out.collisionEventsInvolvingTriggersCount = coll.length;
  out.fallerPassedThroughTrigger = { finalY: rn(faller.mesh.position.y, 3), minY: rn(fallerMinY, 3) };
  out.t4Moved = rn(t4.mesh.position.y, 3);
  out.enumValues = { ENTERED: PhysicsEventType.TRIGGER_ENTERED, EXITED: PhysicsEventType.TRIGGER_EXITED };
  out.isTriggerGetter = t1.shape.isTrigger;
  void sleeper;
  return out;
}
