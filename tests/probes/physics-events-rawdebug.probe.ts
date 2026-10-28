// Debug: is HP_World_GetCollisionEvents / GetNextCollisionEvent destructive (consume-once)?
// Also: tap the plugin's own iteration to read full ContactPoints (incl. child shape ids) for the event being dispatched.
import { Vector3, Quaternion, MeshBuilder, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShapeContainer } from "@babylonjs/core";
import { createWorld, makeGround, makeBox, r3 } from "./physics-events-common";

export async function probe() {
  const out: any = {};
  {
    const w = await createWorld();
    const hk: any = w.hk;
    makeGround(w);
    const b = makeBox(w, "b", new Vector3(0.5, 0.5, 0.5), new Vector3(0, 0.25, 0), 1);
    b.body.setCollisionCallbackEnabled(true);
    const p: any = w.plugin;
    p._notifyCollisions = () => {}; // disable plugin consumption
    w.step();
    const world = p.world;
    const a1 = hk.HP_World_GetCollisionEvents(world)[1];
    const a2 = hk.HP_World_GetCollisionEvents(world)[1];
    const seq: number[] = [];
    let addr = a1;
    while (addr && seq.length < 50) { seq.push(addr); addr = hk.HP_World_GetNextCollisionEvent(Number(world), addr); }
    const a3 = hk.HP_World_GetCollisionEvents(world)[1];
    let n3 = 0; addr = a3; while (addr && n3 < 50) { n3++; addr = hk.HP_World_GetNextCollisionEvent(Number(world), addr); }
    const asColl = a1 ? hk.HP_Event_AsCollision(a1) : null;
    const asColl2 = a1 ? hk.HP_Event_AsCollision(a1) : null;
    out.destructiveTest = { a1, a2, seqLen: seq.length, a3, n3, asCollOk: !!asColl, asCollTwiceSame: JSON.stringify(asColl?.[1]?.[1]?.[3]) === JSON.stringify(asColl2?.[1]?.[1]?.[3]) };
  }
  {
    // Tap the plugin's iteration: wrap the two HP_* iterator functions on the injected module object.
    const w = await createWorld();
    const hk: any = w.hk;
    makeGround(w);
    const container = new PhysicsShapeContainer(w.scene);
    const kids = [0, 1, 2].map(() => new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.4, 0.4, 0.4), w.scene));
    kids.forEach((k, i) => container.addChild(k, new Vector3((i - 1) * 0.6, 0, 0)));
    const mesh = MeshBuilder.CreateBox("compound", { width: 1.6, height: 0.4, depth: 0.4 }, w.scene);
    mesh.position.set(0, 1.0, 0);
    mesh.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 0, 1), 0.35);
    const body = new PhysicsBody(mesh, PhysicsMotionType.DYNAMIC, false, w.scene);
    body.shape = container;
    body.setMassProperties({ mass: 3 });
    body.setCollisionCallbackEnabled(true);
    const kidIndexById = new Map<string, number>(kids.map((k, i) => [String(k._pluginData[0]), i]));
    const p: any = w.plugin;
    let current = 0;
    const origFirst = hk.HP_World_GetCollisionEvents;
    const origNext = hk.HP_World_GetNextCollisionEvent;
    hk.HP_World_GetCollisionEvents = (world: any) => { const r = origFirst(world); current = r[1]; return r; };
    hk.HP_World_GetNextCollisionEvent = (world: any, prev: number) => { const a = origNext(world, prev); current = a; return a; };
    const rows: any[] = [];
    const memRows: any[] = [];
    w.plugin.onCollisionObservable.add((e) => {
      if (rows.length >= 12 || !current) return;
      const ev = hk.HP_Event_AsCollision(current)[1];
      const [type, ca, cb, imp] = ev;
      const i32 = new Int32Array(hk.HEAPU8.buffer, current, 36);
      const childA = kidIndexById.get(String(ca[1][0]));
      const childB = kidIndexById.get(String(cb[1][0]));
      rows.push({
        babylon: { collider: e.collider.transformNode.name, point: r3(e.point, 3), impulse: +e.impulse.toFixed(4) },
        raw: { type: type?.value ?? type, impulse: +imp.toFixed(4), A_body: String(ca[0][0]), A_colliderShape: String(ca[1][0]), A_child: childA, A_path: [String(ca[2][0]), String(ca[2][1])], A_pos: r3({ x: ca[3][0], y: ca[3][1], z: ca[3][2] }, 3), B_colliderShape: String(cb[1][0]), B_child: childB },
        memInts: { A_body: i32[2], A_collider_lo: i32[4], A_collider_hi: i32[5], A_path: [i32[6], i32[7], i32[8], i32[9]], A_tri: i32[16], B_body: i32[18], B_collider_lo: i32[20], B_tri: i32[32] },
      });
    });
    w.steps(60);
    hk.HP_World_GetCollisionEvents = origFirst;
    hk.HP_World_GetNextCollisionEvent = origNext;
    out.tap = { containerId: String(container._pluginData[0]), kidIds: kids.map((k) => String(k._pluginData[0])), groundBody: String((w.pe.getBodies()[0] as any)._pluginData.hpBodyId[0]), compoundBody: String((body as any)._pluginData.hpBodyId[0]), rows };
    // shape path iterator on the first row's path
    try {
      const first = rows[0];
      if (first) {
        const it: [bigint, bigint] = [BigInt(first.raw.A_path[0]), BigInt(first.raw.A_path[1])];
        const r = hk.HP_Shape_PathIterator_GetNext(it);
        out.pathIter = { res: r[0]?.value ?? r[0], next: r[1] ? [String(r[1][0]), String(r[1][1])] : null, third: r[2] };
      }
    } catch (err) { out.pathIter = { error: String(err) }; }
    void memRows;
  }
  return out;
}
