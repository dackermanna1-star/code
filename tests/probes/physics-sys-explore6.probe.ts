// Debug: per-step raw pair impulse sequence for a corner-first hit vs the impacts emitted.
import { Vector3, Quaternion } from "@babylonjs/core";
import { makeWorld, staticBox, body, r } from "./physics-sys-util.ts";

export async function probe() {
  const out: Record<string, unknown> = {};
  for (const rot of [Quaternion.RotationYawPitchRoll(0.3, 0.2, 0.1), Quaternion.RotationYawPitchRoll(0.6, 0.5, 0.3), Quaternion.RotationYawPitchRoll(1.1, 0.1, 0.7)]) {
    const w = await makeWorld({ gravity: 0 });
    staticBox(w, new Vector3(2, 0, 0), new Vector3(0.2, 3, 3)).transformNode.name = "wall";
    const b = body(w, "thrown", new Vector3(0, 0, 0), "dynamic", w.physics.boxShape({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0.2, y: 0.2, z: 0.2 }, { density: 1.5 / 0.008 }), { rot });
    b.setLinearVelocity(new Vector3(8, 0, 0));
    const seq: string[] = [];
    let cur = 0, n = 0, types = "";
    w.physics.plugin.onCollisionObservable.add((e) => {
      cur += e.impulse;
      n++;
      types += e.type === "COLLISION_STARTED" ? "S" : "C";
    });
    w.physics.plugin.onCollisionEndedObservable.add((e) => {
      if (e.type === "COLLISION_FINISHED") types += "F";
    });
    const imps: string[] = [];
    w.physics.onImpact((e) => imps.push(`@${w.physics.stepIndex}:${e.started ? "S" : "C"}${r(e.impulse, 3)}`));
    let vx0 = 8;
    for (let i = 0; i < 40; i++) {
      cur = 0;
      n = 0;
      types = "";
      w.physics.step(1 / 60);
      const vx = b.getLinearVelocity().x;
      if (n > 0 || types) seq.push(`${i + 1}:${r(cur, 3)}[${types}] dvx=${r(1.5 * (vx0 - vx), 3)}`);
      vx0 = vx;
    }
    out[`rot_${r(rot.y, 2)}`] = { seq, imps, vxEnd: r(b.getLinearVelocity().x, 3) };
    w.dispose();
  }
  return out;
}
