// Reviewer probe 3: thin piece struck close to a slab without expectFast (first step at 1 substep).
import { Vector3, Quaternion } from "@babylonjs/core";
import { Layer } from "../../src/core/context.ts";
import { makeWorld, body, staticBox, steps } from "./physics-sys-util.ts";

async function run(dist: number, speed: number, expect: boolean) {
  const w = await makeWorld({ gravity: 0 });
  staticBox(w, new Vector3(0, 0, 0), new Vector3(0.05, 6, 6));
  let tunnels = 0;
  for (let t = 0; t < 20; t++) {
    const rot = Quaternion.RotationYawPitchRoll(t * 0.7 + 0.2, t * 1.3 + 0.3, t * 0.4 + 0.1);
    const p: number[] = [];
    for (const ix of [-0.5, 0.5]) for (const iy of [-0.5, 0.5]) for (const iz of [-0.5, 0.5]) p.push(ix * 0.04, iy * 0.02, iz * 0.004);
    const b = body(w, "p", new Vector3(-dist, (t % 5) * 0.8 - 2, Math.floor(t / 5) * 1.2 - 2), "dynamic", w.physics.hullShape(p, { density: 2500, layer: Layer.DEBRIS }), { rot });
    steps(w, 3);
    b.setLinearVelocity(new Vector3(speed, 0, 0));
    b.setAngularVelocity(new Vector3(60, 80, 30));
    if (expect) w.physics.expectFast(b);
    let prev = b.transformNode.position.x, crossed = false;
    for (let i = 0; i < 20; i++) {
      w.physics.step(1 / 60);
      const x = b.transformNode.position.x;
      if (prev < 0 && x > 0) crossed = true;
      prev = x;
    }
    if (crossed) tunnels++;
    const s = b.shape!;
    b.transformNode.dispose();
    w.physics.disposeShape(s);
  }
  w.dispose();
  return `${tunnels}/20`;
}
export async function probe() {
  const o: Record<string, string> = {};
  for (const d of [0.15, 0.3]) for (const v of [30, 45]) {
    o[`d${d}_v${v}_noExpect`] = await run(d, v, false);
    o[`d${d}_v${v}_expect`] = await run(d, v, true);
  }
  return o;
}
