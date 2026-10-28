// Debug probe: walking into a 15 cm static step — trace the controller state per step.
import { Vector3 } from "@babylonjs/core";
import { Player } from "../../src/player/player.ts";
import { makeWorld, key, r3, v3 } from "./player-util.ts";

export async function probe() {
  const out: Record<string, unknown> = {};
  for (const stepH of [0.25, 0]) {
    for (const h of [0.15, 0.08]) {
      const w = await makeWorld();
      w.box("floor", [40, 0.2, 40], [0, -0.1, 0]);
      w.box("step", [1.2, h, 1.2], [0, h / 2, 6]);
      const p = new Player(w.ctx, { tools: null });
      (w.ctx as { player: unknown }).player = p;
      w.input.setEnabled(true);
      w.input.setFallback(true);
      const cc = (p as unknown as { cc: { maxStepHeight: number; _manifold: Array<{ position: Vector3; normal: Vector3; distance: number }> } }).cc;
      cc.maxStepHeight = stepH;
      p.teleport({ x: 0, y: 1.65, z: 4.6 }, 0, 0);
      w.step(10);
      key("KeyW", true);
      const trace: unknown[] = [];
      for (let i = 0; i < 40; i++) {
        w.step(1);
        if (i % 3 === 0 || i > 30)
          trace.push({
            i,
            foot: v3(p.foot),
            vel: v3(p.velocity),
            grounded: p.grounded,
            manifold: cc._manifold.map((c) => ({ p: v3(c.position), n: v3(c.normal), d: r3(c.distance) })),
          });
      }
      key("KeyW", false);
      out[`maxStep${stepH}_h${h}`] = { finalFoot: v3(p.foot), trace: trace.slice(-8) };
      w.engine.dispose();
    }
  }
  return out;
}
