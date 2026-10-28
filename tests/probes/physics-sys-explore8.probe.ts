// Debug: can a Havok constraint be truly freed while its bodies live (detach parent/child before release)?
import { Vector3 } from "@babylonjs/core";
import { makeWorld, body, staticBox, steps, r } from "./physics-sys-util.ts";

const ZERO = { x: 0, y: 0, z: 0 };
const IDQ = { x: 0, y: 0, z: 0, w: 1 };

export async function probe() {
  const w = await makeWorld();
  const P = w.physics;
  const hk = P.hk as unknown as Record<string, (...a: unknown[]) => unknown> & typeof P.hk;
  const stat = () => P.hk.HP_GetStatistics()[1][2];
  const res: Record<string, unknown> = { base: stat() };
  const frame = staticBox(w, new Vector3(-0.06, 1.0, 0), new Vector3(0.1, 2.1, 0.12));
  const d = body(w, "door", new Vector3(0.45, 1.0, 0), "dynamic", P.boxShape(ZERO, IDQ, { x: 0.9, y: 2.0, z: 0.04 }, { density: 250 }));
  const mk = () => P.hinge(frame, d, { pivotA: new Vector3(0.06, 0, 0), pivotB: new Vector3(-0.45, 0, 0), axisA: new Vector3(0, 1, 0), axisB: new Vector3(0, 1, 0) });
  // variant 1: detach both bodies then release
  let c = mk();
  (c as unknown as { _pluginData: unknown[] })._pluginData.slice();
  res.created1 = stat();
  let id = c._pluginData[0];
  hk.HP_Constraint_SetEnabled(id, false);
  const r1 = hk.HP_Constraint_SetParentBody(id, [BigInt(0)]);
  const r2 = hk.HP_Constraint_SetChildBody(id, [BigInt(0)]);
  hk.HP_Constraint_Release(id);
  res.afterDetachRelease = stat();
  res.detachResults = [String(r1), String(r2)];
  steps(w, 3);
  res.afterSteps = stat();
  // variant 2: release then step (deferred?)
  c = mk();
  id = c._pluginData[0];
  res.created2 = stat();
  hk.HP_Constraint_SetEnabled(id, false);
  hk.HP_Constraint_Release(id);
  steps(w, 3);
  res.afterPlainRelease = stat();
  // door still simulates fine and no crash after detach approach
  d.setAngularVelocity(new Vector3(0, 2, 0));
  steps(w, 30);
  res.doorY = r(d.transformNode.position.y, 3);
  // variant 3: detach via setting the child to the world... (measure memory churn: 500 create/detach/release cycles)
  const heap0 = P.hk.HEAPU8.length;
  for (let i = 0; i < 500; i++) {
    const cc = mk();
    const jid = cc._pluginData[0];
    hk.HP_Constraint_SetEnabled(jid, false);
    hk.HP_Constraint_SetParentBody(jid, [BigInt(0)]);
    hk.HP_Constraint_SetChildBody(jid, [BigInt(0)]);
    hk.HP_Constraint_Release(jid);
    cc._pluginData.length = 0;
  }
  res.after500DetachCycles = stat();
  res.heapGrowthBytes = P.hk.HEAPU8.length - heap0;
  return res; // (no dispose: the raw releases above bypassed the system's joint records)
}
