// temp diagnostics: pile re-sleep after a block drop
import { Vector3, Quaternion, type PhysicsBody } from "@babylonjs/core";
import { Layer } from "../../src/core/context.ts";
import { makeWorld, body, staticBox, floor, steps, randomPoints, r } from "./physics-sys-util.ts";
const ZERO = { x: 0, y: 0, z: 0 };
const IDQ = { x: 0, y: 0, z: 0, w: 1 };
export async function probe() {
  const w = await makeWorld({});
  const half = 3;
  floor(w, 0, 60);
  staticBox(w, new Vector3(half + 0.25, 3, 0), new Vector3(0.5, 6, half * 2 + 1));
  staticBox(w, new Vector3(-half - 0.25, 3, 0), new Vector3(0.5, 6, half * 2 + 1));
  staticBox(w, new Vector3(0, 3, half + 0.25), new Vector3(half * 2 + 1, 6, 0.5));
  staticBox(w, new Vector3(0, 3, -half - 0.25), new Vector3(half * 2 + 1, 6, 0.5));
  const bodies: PhysicsBody[] = [];
  for (let i = 0; i < 1000; i++) {
    const s = w.physics.hullShape(randomPoints(i + 1, 20, 0.175), { density: 600, friction: 0.6, layer: Layer.DEBRIS });
    bodies.push(body(w, "h", new Vector3(-2.7 + (i % 10) * 0.6, 0.4 + Math.floor(i / 100) * 0.6, -2.7 + (Math.floor(i / 10) % 10) * 0.6), "dynamic", s, { rot: Quaternion.RotationYawPitchRoll(i, i * 0.37, i * 0.11) }));
  }
  const trace: unknown[] = [];
  for (let k = 0; k < 900; k++) {
    w.physics.step(1 / 60);
    if (k % 20 === 0) { const d = w.physics.debugStats(); trace.push([k, bodies.filter((b) => w.physics.isAwake(b)).length, d.sleepPass.size, d.sleepPass.slow, r(d.sleepPass.fastest, 2), d.sleepPass.slept]); }
  }
  const block = body(w, "block", new Vector3(0, 9, 0), "dynamic", w.physics.boxShape(ZERO, IDQ, { x: 0.6, y: 0.6, z: 0.6 }, { density: 230 }));
  const t2: unknown[] = [];
  let pvy = 0;
  for (let k = 0; k < 160; k++) {
    const a = performance.now();
    w.physics.step(1 / 60);
    const ms = performance.now() - a;
    const vy = block.getLinearVelocity().y;
    const d = w.physics.debugStats();
    const P = w.physics as any;
    const tr = (P.fast as any[]).filter((rec) => !rec.asleepKnown && P._stepIndex - rec.driftStep <= 16 && rec.motion === 2 || false);
    const trv = tr.map((rec) => { const v = rec.body.getLinearVelocity(); return r(v.length(), 2) + "@" + r(rec.body.transformNode.position.x, 1) + "," + r(rec.body.transformNode.position.y, 1) + "," + r(rec.body.transformNode.position.z, 1); });
    if (k % 4 === 0 && k > 76 && k < 150) t2.push(["trav", tr.length, trv.slice(0, 8).join(" ")]);
    if (k % 4 === 0 || Math.abs(vy - pvy) > 1) t2.push([k, r(ms, 1), bodies.filter((b) => w.physics.isAwake(b)).length, d.sleepPass.step, d.sleepPass.size, d.sleepPass.slow, r(d.sleepPass.fastest, 2), d.sleepPass.slept, r(block.transformNode.position.y, 2), r(vy, 2)]);
    pvy = vy;
  }
  w.dispose();
  return { trace: trace.map((x) => JSON.stringify(x)), t2: t2.map((x) => JSON.stringify(x)) };
}
