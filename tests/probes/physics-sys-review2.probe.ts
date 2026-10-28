// Reviewer probe 2: heavy-on-light impulse accounting; forced-sleep floating.
import { Vector3, type PhysicsBody } from "@babylonjs/core";
import { makeWorld, staticBox, dynBox, steps, r } from "./physics-sys-util.ts";

async function heavy(drop: number, boxKg: number) {
  const w = await makeWorld();
  const fl = staticBox(w, new Vector3(0, -0.1, 0), new Vector3(20, 0.2, 20));
  const mug = dynBox(w, new Vector3(0, 0.05, 0), new Vector3(0.08, 0.1, 0.08), 600);
  steps(w, 30);
  const box = dynBox(w, new Vector3(0, 0.1 + drop + 0.2, 0), new Vector3(0.4, 0.4, 0.4), boxKg / 0.064);
  const name = (b: PhysicsBody) => (b === mug ? "mug" : b === box ? "box" : b === fl ? "floor" : "?");
  const t0 = w.physics.stepIndex;
  const evs: string[] = [];
  let vImpact = 0;
  w.physics.onImpact((ev) => {
    const e = ev as unknown as { peak: number; steps: number };
    evs.push(`@${w.physics.stepIndex - t0} ${name(ev.bodyA)}-${name(ev.bodyB)} J=${r(ev.impulse, 2)} st=${ev.started} peak=${r(e.peak, 2)} steps=${e.steps}`);
  });
  const vy: number[] = [];
  for (let i = 0; i < 50; i++) {
    const v = box.getLinearVelocity().y;
    if (v < vImpact) vImpact = v;
    w.physics.step(1 / 60);
    vy.push(r(box.getLinearVelocity().y, 2));
  }
  const out = { boxMass: r(w.physics.massOf(box), 2), expectedBoxMomentum: r(-vImpact * w.physics.massOf(box), 1), boxVy: vy.slice(14, 26).join(","), boxRestY: r(box.transformNode.position.y, 3), evs };
  w.dispose();
  return out;
}

async function forcedFloat(mode: string) {
  const w = await makeWorld();
  staticBox(w, new Vector3(0, -0.1, 0), new Vector3(20, 0.2, 20));
  const support = mode === "static" ? staticBox(w, new Vector3(0, 0.5, 0), new Vector3(1, 1, 1)) : dynBox(w, new Vector3(0, 0.5, 0), new Vector3(1, 1, 1), 300);
  const top = dynBox(w, new Vector3(0, 1.1, 0), new Vector3(0.3, 0.2, 0.3), 500);
  steps(w, 40);
  // what the sleep assist does: HP_Body_SetActivationState(INACTIVE) per body
  w.physics.sleep(top);
  if (mode !== "static") w.physics.sleep(support);
  steps(w, 2);
  const asleep = !w.physics.isAwake(top);
  support.transformNode.dispose();
  const y0 = top.transformNode.position.y;
  steps(w, 60);
  const y1 = top.transformNode.position.y;
  w.dispose();
  return { asleep, y0: r(y0, 3), y1: r(y1, 3), FLOATS: y1 > y0 - 0.05 };
}

export async function probe() {
  return {
    heavy20kg_45cm: await heavy(0.45, 20),
    heavy5kg_45cm: await heavy(0.45, 5),
    forcedFloatDyn: await forcedFloat("dyn"),
    forcedFloatStatic: await forcedFloat("static"),
  };
}
