// temporary experiment (deleted after use)
import { Vector3, Quaternion, type PhysicsBody } from "@babylonjs/core";
import { Layer } from "../../src/core/context.ts";
import { makeWorld, body, floor, staticBox, steps, r, randomPoints } from "./physics-sys-util.ts";
async function pile(n: number, assist: { linear: number; angular: number; seconds: number } | false, fallback = 4, majority = 1) {
  const w = await makeWorld({ sleepAssist: assist === false ? false : assist });
  const P = w.physics;
  (P as unknown as { sleepFallbackTmp: number }).sleepFallbackTmp = fallback;
  (P as unknown as { sleepMajorityTmp: number }).sleepMajorityTmp = majority;
  floor(w, 0, 60);
  const half = n > 200 ? 3 : 1;
  staticBox(w, new Vector3(half + 0.25, 3, 0), new Vector3(0.5, 6, half * 2 + 1));
  staticBox(w, new Vector3(-half - 0.25, 3, 0), new Vector3(0.5, 6, half * 2 + 1));
  staticBox(w, new Vector3(0, 3, half + 0.25), new Vector3(half * 2 + 1, 6, 0.5));
  staticBox(w, new Vector3(0, 3, -half - 0.25), new Vector3(half * 2 + 1, 6, 0.5));
  const bodies: PhysicsBody[] = [];
  const per = n > 200 ? 10 : 6;
  const sp = n > 200 ? 0.6 : 0.3;
  for (let i = 0; i < n; i++) {
    const s = P.hullShape(randomPoints(i + 1, 20, n > 200 ? 0.175 : 0.12), { density: 600, friction: 0.6, layer: Layer.DEBRIS });
    bodies.push(body(w, "h", new Vector3(-((per - 1) * sp) / 2 + (i % per) * sp, 0.4 + Math.floor(i / (per * per)) * sp, -((per - 1) * sp) / 2 + (Math.floor(i / per) % per) * sp), "dynamic", s, { rot: Quaternion.RotationYawPitchRoll(i, i * 0.37, i * 0.11) }));
  }
  const trace: number[] = [];
  const ms: number[] = [];
  for (let k = 0; k < 12; k++) {
    const t = performance.now();
    steps(w, 60);
    ms.push(r((performance.now() - t) / 60, 2));
    trace.push(bodies.filter((b) => P.isAwake(b)).length);
  }
  // speed distribution of awake bodies
  const speeds = bodies.filter((b) => P.isAwake(b)).map((b) => [b.getLinearVelocity().length(), b.getAngularVelocity().length()]);
  speeds.sort((a, b) => b[1] - a[1]);
  const fs = P.debugStats().forcedSleeps;
  const recs = (P as unknown as { recs: WeakMap<object, { slow: number; movedStep: number; boundR: number; radius: number; keepAwake: boolean; joints: unknown }> }).recs;
  const rs = bodies.map((b) => recs.get(b)!);
  const slowVals = rs.map((x) => x.slow).sort((a, b) => a - b);
  const dbg = { stepIndex: P.stepIndex, slowMin: slowVals[0], slowMed: slowVals[slowVals.length >> 1], slowMax: slowVals[slowVals.length - 1], recentMovers: rs.filter((x) => x.movedStep >= P.stepIndex - 8).length, boundR: rs.slice(0, 3).map((x) => r(x.boundR, 3)), radius: rs.slice(0, 3).map((x) => r(x.radius, 3)), lowSlow: slowVals.slice(0, 8) };
  // tap: wake everything with a block drop, count awake over time
  const blk = body(w, "block", new Vector3(0, 6, 0), "dynamic", P.boxShape({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0.4, y: 0.4, z: 0.4 }, { density: 400 }));
  const after: number[] = [];
  for (let k = 0; k < 8; k++) {
    steps(w, 30);
    after.push(bodies.filter((b) => P.isAwake(b)).length);
  }
  w.dispose();
  return { dbg, awakePerSecond: trace, msPerStepPerSecond: ms, forcedSleeps: fs, topAwakeSpeeds: speeds.slice(0, 5).map((s) => [r(s[0], 3), r(s[1], 3)]), awakeEveryHalfSecondAfterBlock: after };
}
export async function probe() {
  const out: Record<string, unknown> = {};
  out.V1_120 = await pile(120, { linear: 0.08, angular: 0.2, seconds: 0.6 }, 1, 1);
  out.V1_1000 = await pile(1000, { linear: 0.08, angular: 0.2, seconds: 0.6 }, 1, 1);
  return out;
}
