// Which container child was hit? (raycast hitData collider id / shape path), and collision-event raw words
import { Vector3, Quaternion, TransformNode, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShapeContainer, HavokPlugin } from "@babylonjs/core";
import type { HavokPhysicsWithBindings } from "@babylonjs/havok";
import { makeWorld, stepN } from "./physics-bodies-util";

export async function probe() {
  const out: Record<string, unknown> = {};
  const { scene, plugin, hk } = await makeWorld();
  const H = hk as HavokPhysicsWithBindings;
  const c = new PhysicsShapeContainer(scene);
  const kids = [0, 1, 2].map(() => new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.5, 0.5, 0.5), scene));
  kids.forEach((k, i) => c.addChild(k, new Vector3(i * 2, 0, 0)));
  const tn = new TransformNode("cont", scene);
  const b = new PhysicsBody(tn, PhysicsMotionType.STATIC, false, scene);
  b.shape = c;
  const coll = (plugin as unknown as { _queryCollector: [bigint] })._queryCollector;
  const rays: unknown[] = [];
  for (let i = 0; i < 3; i++) {
    const rr = scene.getPhysicsEngine()!.raycast(new Vector3(i * 2, 5, 0), new Vector3(i * 2, -5, 0));
    const r = H.HP_QueryCollector_GetCastRayResult(coll as never, 0)[1];
    const contact = r[1];
    const path = contact[2];
    const it: unknown[] = [];
    rays.push({ child: i, colliderId: String(contact[1][0]), shapePath: [String(path[0]), String(path[1])], resultShapeIsChild: rr.shape === kids[i], childShapeId: String(kids[i]._pluginData[0]), containerId: String(c._pluginData[0]) });
  }
  out.raycastChildIdentification = rays;
  // collision events: raw words carry the collider (child shape) id
  {
    const ground = new PhysicsBody(new TransformNode("g", scene), PhysicsMotionType.STATIC, false, scene);
    ground.shape = new PhysicsShapeBox(new Vector3(0, -2.5, 0), Quaternion.Identity(), new Vector3(50, 1, 50), scene);
    const c2 = new PhysicsShapeContainer(scene);
    const kids2 = [0, 1, 2].map(() => new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.3, 0.3, 0.3), scene));
    // tilted so that child 2 lands first
    kids2.forEach((k, i) => c2.addChild(k, new Vector3(i * 0.5, -i * 0.2, 0)));
    const tn2 = new TransformNode("faller", scene);
    tn2.position.set(20, 0, 0);
    const b2 = new PhysicsBody(tn2, PhysicsMotionType.DYNAMIC, false, scene);
    b2.shape = c2;
    b2.setCollisionCallbackEnabled(true);
    const kidIds = kids2.map((k) => Number(k._pluginData[0]));
    // Track the address of the event the plugin is currently dispatching by wrapping the two iterator calls.
    let curEvent = 0;
    const hkW = H as unknown as { HP_World_GetCollisionEvents: (w: unknown) => [unknown, number]; HP_World_GetNextCollisionEvent: (w: number, prev: number) => number };
    const origFirst = hkW.HP_World_GetCollisionEvents.bind(H);
    const origNext = hkW.HP_World_GetNextCollisionEvent.bind(H);
    hkW.HP_World_GetCollisionEvents = (w) => { const r = origFirst(w); curEvent = r[1]; return r; };
    hkW.HP_World_GetNextCollisionEvent = (w, prev) => { curEvent = origNext(w, prev); return curEvent; };
    const seen: Record<string, number> = {};
    let firstStartedChild = -1;
    let dump: number[] = [];
    plugin.onCollisionObservable.add((ev) => {
      if (!curEvent || (ev.collider !== b2 && ev.collidedAgainst !== b2)) return;
      const i32 = new Int32Array(H.HEAPU8.buffer, curEvent, 40);
      // contact A: words 2..17 (bodyId @2, colliderId @4); contact B: words 18..33 (bodyId @18, colliderId @20)
      const col = ev.collider === b2 ? i32[4] : i32[20];
      const childIdx = kidIds.indexOf(col);
      const key = `${ev.type}_child${childIdx}`;
      seen[key] = (seen[key] ?? 0) + 1;
      if (firstStartedChild < 0 && ev.type === "COLLISION_STARTED") { firstStartedChild = childIdx; dump = Array.from(i32); }
    });
    stepN(scene, 90);
    out.collisionEventChildIds = { counts: seen, firstStartedChild_expected2: firstStartedChild, fallerY: tn2.position.y, dump, kidIds, bodyId: Number(b2._pluginData.hpBodyId[0]), groundBodyId: Number(ground._pluginData.hpBodyId[0]), groundShapeId: Number(ground.shape!._pluginData[0]), containerId: Number(c2._pluginData[0]) };
  }
  void HavokPlugin;
  void stepN;
  return out;
}
