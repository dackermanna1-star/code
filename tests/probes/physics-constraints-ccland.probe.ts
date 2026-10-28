// Landing speed detection (stomps) and support body on landing.
import { Vector3, PhysicsMotionType } from "@babylonjs/core";
import { makeWorld, makeBox, stepN, r3, newHavok } from "./physics-constraints-util.ts";
import { FpsMover, supportContacts, type MoveInput } from "./physics-constraints-ccutil.ts";

const DT = 1 / 60;
const idle: MoveInput = { forward: 0, right: 0, yaw: 0, speed: 0, jump: false };

export async function probe() {
  const out: Record<string, unknown> = {};
  for (const [h, onCrate] of [[0.5, false], [2, false], [2, true]] as [number, boolean][]) {
    const w = await makeWorld(await newHavok());
    makeBox(w.scene, "floor", new Vector3(40, 0.2, 40), new Vector3(0, -0.1, 0), { motion: PhysicsMotionType.STATIC });
    const top = onCrate ? 0.6 : 0;
    if (onCrate) makeBox(w.scene, "crate", new Vector3(0.8, 0.6, 0.8), new Vector3(0, 0.3, 0), { mass: 50 });
    const m = new FpsMover(w.scene, new Vector3(0, top + h, 0));
    m.cc.keepDistance = 0.02; m.cc.keepContactTolerance = 0.03; m.cc.characterMass = 80;
    const landings: { step: number; speed: number; support: string[] }[] = [];
    for (let k = 0; k < 120; k++) {
      m.step(DT, idle); stepN(w.scene, 1);
      if (m.landingSpeed > 0) landings.push({ step: k, speed: r3(m.landingSpeed), support: supportContacts(m.cc).map((c) => c.body.transformNode.name) });
    }
    out[`drop${h}m${onCrate ? "_ontoCrate" : ""}`] = { landings, expectSpeed: r3(Math.sqrt(2 * 9.81 * (h - 0.02))), restFeet: r3(m.feetY) };
    m.cc.dispose(); w.dispose();
  }
  return out;
}
