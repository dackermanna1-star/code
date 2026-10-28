// Hazards from Havok body-id reuse: (1) per-body ENDED observables are not removed on dispose and get inherited by a
// new body that reuses the id; (2) dispose+create inside a collision callback can misattribute the remaining
// events of that same step to the new body.
import { Vector3, PhysicsEventType, type PhysicsBody } from "@babylonjs/core";
import { createWorld, makeGround, makeBox, r3 } from "./physics-events-common";

const hpId = (b: PhysicsBody) => String((b as any)._pluginData.hpBodyId[0]);

export async function probe() {
  const out: any = {};
  // (1) ended-observable inheritance
  {
    const w = await createWorld();
    makeGround(w);
    const x = makeBox(w, "X", new Vector3(0.5, 0.5, 0.5), new Vector3(0, 0.25, 0), 1);
    x.body.setCollisionCallbackEnabled(true);
    let xEnded = 0, xColl = 0;
    x.body.getCollisionEndedObservable().add((e) => { if (e.type === PhysicsEventType.COLLISION_FINISHED) xEnded++; });
    x.body.getCollisionObservable().add(() => xColl++);
    w.steps(5);
    const xId = hpId(x.body);
    x.mesh.dispose();
    const y = makeBox(w, "Y", new Vector3(0.5, 0.5, 0.5), new Vector3(0, 0.25, 0), 1);
    y.body.setCollisionCallbackEnabled(true);
    const yId = hpId(y.body);
    xEnded = 0; xColl = 0;
    w.steps(5);
    y.body.setLinearVelocity(new Vector3(0, 5, 0)); // leave the ground -> FINISHED
    w.steps(10);
    out.endedObservableInheritance = { sameId: xId === yId, xCollisionObserverFiredForY: xColl, xEndedObserverFiredForY: xEnded };
  }
  // (2) dispose + immediate create inside the callback
  {
    const w = await createWorld();
    makeGround(w);
    const v = makeBox(w, "victim", new Vector3(0.5, 0.5, 0.5), new Vector3(0, 1.25, 0), 1);
    v.body.setCollisionCallbackEnabled(true);
    const victimId = hpId(v.body);
    let replaced: PhysicsBody | null = null;
    const log: any[] = [];
    let stepIdx = -1;
    w.plugin.onCollisionObservable.add((e) => {
      const name = e.collider.transformNode.name;
      log.push({ step: stepIdx, collider: name, point: r3(e.point, 3), impulse: +e.impulse.toFixed(3) });
      if (!replaced && name === "victim" && e.impulse > 0.01) {
        const pos = v.mesh.position.clone();
        v.mesh.dispose();
        // spawn the replacement far away (so misattributed events are obvious by position)
        const r = makeBox(w, "replacement", new Vector3(0.3, 0.3, 0.3), new Vector3(pos.x + 10, 5, 0), 1);
        r.body.setCollisionCallbackEnabled(true);
        replaced = r.body;
        log.push({ note: "replaced", sameIdReused: hpId(r.body) === victimId });
      }
    });
    for (let i = 0; i < 40 && log.length < 30; i++) { stepIdx = i; w.step(); }
    out.disposeCreateInsideCallback = log.slice(0, 12);
  }
  return out;
}
