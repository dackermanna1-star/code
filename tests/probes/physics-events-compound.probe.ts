// Q4: compound (PhysicsShapeContainer) bodies - is the hit CHILD shape identifiable in collision events / raycasts?
// Also: thin-instance colliderIndex, raw HP_World_GetCollisionEvents layout, body-id reuse after dispose.
import {
  Vector3,
  Quaternion,
  MeshBuilder,
  Matrix,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeContainer,
  PhysicsAggregate,
  PhysicsShapeType,
  PhysicsRaycastResult,
  type IPhysicsCollisionEvent,
  type PhysicsShape,
} from "@babylonjs/core";
import { createWorld, makeGround, makeBox, r3, rn } from "./physics-events-common";

export async function probe() {
  const w = await createWorld();
  const hk: any = w.hk;
  const out: any = {};
  makeGround(w);

  // Compound: 3 distinct child boxes + one child that re-uses child0's shape object (shared shape)
  const container = new PhysicsShapeContainer(w.scene);
  const mkChild = () => new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.4, 0.4, 0.4), w.scene);
  const children: PhysicsShape[] = [mkChild(), mkChild(), mkChild()];
  container.addChild(children[0], new Vector3(-0.6, 0, 0));
  container.addChild(children[1], new Vector3(0, 0, 0));
  container.addChild(children[2], new Vector3(0.6, 0, 0));
  container.addChild(children[0], new Vector3(0, 0.6, 0)); // index 3 = same shape object as index 0
  const mesh = MeshBuilder.CreateBox("compound", { width: 1.6, height: 0.4, depth: 0.4 }, w.scene);
  mesh.position.set(0, 1.5, 0);
  mesh.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 0, 1), 0.35); // right end (+x) is higher -> left child (-x) lands first
  const body = new PhysicsBody(mesh, PhysicsMotionType.DYNAMIC, false, w.scene);
  body.shape = container;
  body.setMassProperties({ mass: 3 });
  body.setCollisionCallbackEnabled(true);
  out.numChildren = container.getNumChildren();
  const shapeIds = {
    container: String(container._pluginData[0]),
    child0: String(children[0]._pluginData[0]),
    child1: String(children[1]._pluginData[0]),
    child2: String(children[2]._pluginData[0]),
  };
  out.shapeIds = shapeIds;
  out.bodyId = String((body as any)._pluginData.hpBodyId[0]);
  const idName = (id: any) => {
    const s = String(id);
    for (const [k, v] of Object.entries(shapeIds)) if (v === s) return k;
    return s;
  };

  let stepIdx = -1;
  const babylonEvents: any[] = [];
  w.plugin.onCollisionObservable.add((e: IPhysicsCollisionEvent) => {
    if (babylonEvents.length < 6) babylonEvents.push({ step: stepIdx, type: e.type, collider: e.collider.transformNode.name, ci: e.colliderIndex, ai: e.collidedAgainstIndex, point: r3(e.point, 3) });
  });
  // Raw events read AFTER the step (the world's event list stays valid until the next HP_World_Step)
  const raw: any[] = [];
  const rawMem: any[] = [];
  let pathIterTest: any = null;
  w.scene.onAfterPhysicsObservable.add(() => {
    let addr = hk.HP_World_GetCollisionEvents(w.plugin.world)[1];
    while (addr) {
      const ev = hk.HP_Event_AsCollision(addr)[1]; // [type, contactA, contactB, impulse]
      const [type, ca, cb, impulse] = ev;
      const desc = (c: any) => ({
        body: String(c[0][0]),
        collider: idName(c[1][0]),
        shapePath: [idName(c[2][0]), String(c[2][1])],
        pos: r3({ x: c[3][0], y: c[3][1], z: c[3][2] }, 3),
        tri: c[5],
      });
      if (raw.length < 40) raw.push({ step: stepIdx, type: type?.value ?? type, impulse: rn(impulse, 4), A: desc(ca), B: desc(cb) });
      if (rawMem.length < 2) {
        const i32 = new Int32Array(hk.HEAPU8.buffer, addr, 36);
        const f32 = new Float32Array(hk.HEAPU8.buffer, addr, 36);
        rawMem.push({ ints: Array.from(i32), floats: Array.from(f32).map((x) => +x.toFixed(4)) });
      }
      if (!pathIterTest && String(ca[0][0]) === out.bodyId) {
        try {
          const r = hk.HP_Shape_PathIterator_GetNext(ca[2]);
          const r2 = r[1] ? hk.HP_Shape_PathIterator_GetNext(r[1]) : null;
          pathIterTest = { input: [idName(ca[2][0]), String(ca[2][1])], result: r[0]?.value ?? r[0], next: r[1] ? [idName(r[1][0]), String(r[1][1])] : null, childIndex: r[2], second: r2 ? { result: r2[0]?.value ?? r2[0], next: r2[1] ? [idName(r2[1][0]), String(r2[1][1])] : null, childIndex: r2[2] } : null };
        } catch (err) {
          pathIterTest = { error: String(err) };
        }
      }
      addr = hk.HP_World_GetNextCollisionEvent(Number(w.plugin.world), addr);
    }
  });
  for (let i = 0; i < 90; i++) { stepIdx = i; w.step(); }
  out.babylonEvents = babylonEvents;
  out.rawFirst = raw.slice(0, 40);
  out.rawMem = rawMem;
  out.pathIterTest = pathIterTest;

  // Raycasts straight down onto each child (body now resting / tumbling: use current child world positions)
  const wm = mesh.computeWorldMatrix(true);
  const childLocal = [new Vector3(-0.6, 0, 0), new Vector3(0, 0, 0), new Vector3(0.6, 0, 0), new Vector3(0, 0.6, 0)];
  const rays: any[] = [];
  for (let i = 0; i < 4; i++) {
    const c = Vector3.TransformCoordinates(childLocal[i], wm);
    const res = new PhysicsRaycastResult();
    // horizontal ray toward the child centre from the camera side (-z), so the top child is hit directly
    w.pe.raycastToRef(new Vector3(c.x, c.y, -3), new Vector3(c.x, c.y, 3), res);
    rays.push({
      child: i, centre: r3(c, 3), hasHit: res.hasHit, bodyIsCompound: res.body === body, bodyIndex: res.bodyIndex,
      shapeIsContainer: res.shape === container, shapeIndexInChildren: res.shape ? children.indexOf(res.shape) : null,
      shapeId: res.shape ? idName(res.shape._pluginData[0]) : null, triangleIndex: res.triangleIndex,
    });
  }
  out.raycastChildren = rays;

  // Thin instances: colliderIndex == instance index?
  const ti = MeshBuilder.CreateBox("thin", { size: 0.3 }, w.scene);
  const mats: Matrix[] = [];
  for (let k = 0; k < 3; k++) mats.push(Matrix.Translation(5 + k, 0.5 + k * 0.5, 0));
  const buf = new Float32Array(16 * 3);
  mats.forEach((m, k) => m.copyToArray(buf, k * 16));
  ti.thinInstanceSetBuffer("matrix", buf, 16);
  const agg = new PhysicsAggregate(ti, PhysicsShapeType.BOX, { mass: 1 }, w.scene);
  agg.body.setCollisionCallbackEnabled(true);
  const tiEvents = new Set<string>();
  const perInstance = new Map<number, number>();
  for (let k = 0; k < 3; k++) agg.body.getCollisionObservable(k).add((e) => perInstance.set(k, (perInstance.get(k) ?? 0) + 1));
  w.plugin.onCollisionObservable.add((e) => {
    if (e.collider === agg.body || e.collidedAgainst === agg.body) tiEvents.add(`${e.collider.transformNode.name}[${e.colliderIndex}] -> ${e.collidedAgainst.transformNode.name}[${e.collidedAgainstIndex}]`);
  });
  w.steps(90);
  out.thinInstance = { instances: (agg.body as any)._pluginDataInstances.length, pairs: [...tiEvents], perInstanceObservableCounts: Object.fromEntries(perInstance) };
  const tiRay = new PhysicsRaycastResult();
  w.pe.raycastToRef(new Vector3(6, 5, 0), new Vector3(6, -1, 0), tiRay);
  out.thinInstanceRay = { hasHit: tiRay.hasHit, bodyIsThin: tiRay.body === agg.body, bodyIndex: tiRay.bodyIndex, point: r3(tiRay.hitPointWorld, 3) };

  // Body id reuse: dispose a body and create a new one immediately -> same hpBodyId?
  const ids: string[] = [];
  let reused = 0;
  for (let k = 0; k < 10; k++) {
    const b = makeBox(w, "tmp" + k, new Vector3(0.2, 0.2, 0.2), new Vector3(-5, 3 + k, 0), 1);
    const oldId = String((b.body as any)._pluginData.hpBodyId[0]);
    b.mesh.dispose();
    const nb = makeBox(w, "tmpN" + k, new Vector3(0.2, 0.2, 0.2), new Vector3(-5, 3 + k, 0), 1);
    const newId = String((nb.body as any)._pluginData.hpBodyId[0]);
    if (newId === oldId) reused++;
    ids.push(`${oldId}->${newId}`);
  }
  out.bodyIdReuse = { reused, of: 10, sample: ids.slice(0, 3) };
  return out;
}
