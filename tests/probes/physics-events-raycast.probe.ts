// Q7: raycast API: fields, distance semantics, filters, triggers, ignoreBody, multi-hit, inside-start, mesh triangleIndex,
// container children, freshly created bodies, performance.
import {
  Vector3,
  Quaternion,
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeMesh,
  PhysicsShapeContainer,
  PhysicsRaycastResult,
  type IRaycastQuery,
  type PhysicsShape,
} from "@babylonjs/core";
import { createWorld, makeGround, makeBox, r3, rn, type World } from "./physics-events-common";

function rayInfo(res: PhysicsRaycastResult, names?: (s: PhysicsShape | undefined) => any) {
  return {
    hasHit: res.hasHit,
    body: res.body?.transformNode.name ?? null,
    bodyIndex: res.bodyIndex ?? null,
    shape: names ? names(res.shape) : res.shape ? res.shape.getClassName() : null,
    point: r3(res.hitPointWorld, 4),
    normal: r3(res.hitNormalWorld, 4),
    dist: rn(res.hitDistance, 4),
    tri: res.triangleIndex,
  };
}

export async function probe() {
  const out: any = {};
  const w = await createWorld();
  const hk: any = w.hk;
  const ground = makeGround(w); // top at y=0
  const pe = w.pe;

  console.log("section 1", JSON.stringify(out).slice(0, 4000));
  // 1. basic hit + field semantics
  const res = new PhysicsRaycastResult();
  pe.raycastToRef(new Vector3(0, 5, 0), new Vector3(0, -5, 0), res);
  out.basic = { ...rayInfo(res), rayFrom: r3(res.rayFromWorld), rayTo: r3(res.rayToWorld), hitPointAlias: res.hitPoint === res.hitPointWorld, normalAlias: res.hitNormal === res.hitNormalWorld };
  const sameVec = res.hitPointWorld;
  pe.raycastToRef(new Vector3(1, 3, 0), new Vector3(1, -5, 0), res);
  out.resultVectorsReused = { sameInstance: sameVec === res.hitPointWorld, nowY: rn(sameVec.y) };
  // convenience variant
  const r2 = pe.raycast(new Vector3(0, 5, 0), new Vector3(0, 4, 0));
  out.noHit = rayInfo(r2);

  console.log("section 2", JSON.stringify(out).slice(0, 4000));
  // 2. box hit from the side, normal and distance; ray starting inside the box
  const box = makeBox(w, "box", new Vector3(1, 1, 1), new Vector3(5, 0.5, 0), 0);
  pe.raycastToRef(new Vector3(2, 0.5, 0), new Vector3(8, 0.5, 0), res);
  out.boxSide = rayInfo(res);
  pe.raycastToRef(new Vector3(5, 0.5, 0), new Vector3(8, 0.5, 0), res);
  out.startInsideBox = rayInfo(res);
  pe.raycastToRef(new Vector3(5.2, 0.5, 0), new Vector3(2, 0.5, 0), res);
  out.startInsideBoxTowardNegX = rayInfo(res);

  console.log("section 3", JSON.stringify(out).slice(0, 4000));
  // 3. mesh shape: triangleIndex; hit from below (back face)
  const plane = MeshBuilder.CreateGround("meshPlane", { width: 2, height: 2, subdivisions: 2 }, w.scene);
  plane.position.set(-5, 1, 0);
  const pb = new PhysicsBody(plane, PhysicsMotionType.STATIC, false, w.scene);
  pb.shape = new PhysicsShapeMesh(plane, w.scene);
  w.step();
  pe.raycastToRef(new Vector3(-5.5, 3, 0.5), new Vector3(-5.5, -0.5, 0.5), res);
  out.meshFromAbove = rayInfo(res);
  pe.raycastToRef(new Vector3(-4.5, 0.5, -0.5), new Vector3(-4.5, 3, -0.5), res);
  out.meshFromBelow = rayInfo(res);
  out.meshIndicesCount = plane.getTotalIndices() / 3;

  console.log("section 4", JSON.stringify(out).slice(0, 4000));
  // 4. collision filters: shape membership / collide masks vs query masks
  const mk = (name: string, x: number, membership: number, collide: number) => {
    const b = makeBox(w, name, new Vector3(0.5, 0.5, 0.5), new Vector3(x, 0.25, 5), 0);
    b.shape.filterMembershipMask = membership;
    b.shape.filterCollideMask = collide;
    return b;
  };
  mk("f_m2_cAll", 0, 2, ~0);
  mk("f_mAll_c1", 2, ~0 >>> 0, 1);
  mk("f_m2_c4", 4, 2, 4);
  w.step();
  const fq = (x: number, q?: IRaycastQuery) => {
    pe.raycastToRef(new Vector3(x, 3, 5), new Vector3(x, 0.4, 5), res, q);
    return res.hasHit ? res.body!.transformNode.name : "miss";
  };
  out.filters = {
    "shape(m=2,c=all)": { none: fq(0), "q(m=1,c=1)": fq(0, { membership: 1, collideWith: 1 }), "q(m=1,c=2)": fq(0, { membership: 1, collideWith: 2 }), "q(m=4,c=2)": fq(0, { membership: 4, collideWith: 2 }) },
    "shape(m=all,c=1)": { none: fq(2), "q(m=1,c=all)": fq(2, { membership: 1, collideWith: ~0 }), "q(m=2,c=all)": fq(2, { membership: 2, collideWith: ~0 }), "q(collideWith only=1)": fq(2, { collideWith: 1 }) },
    "shape(m=2,c=4)": { none: fq(4), "q(m=4,c=2)": fq(4, { membership: 4, collideWith: 2 }), "q(m=1,c=2)": fq(4, { membership: 1, collideWith: 2 }) },
  };

  console.log("section 5", JSON.stringify(out).slice(0, 4000));
  // 5. triggers + ignoreBody
  const trig = makeBox(w, "trigger", new Vector3(1, 1, 1), new Vector3(0, 0.5, -5), 0);
  trig.shape.isTrigger = true;
  w.step();
  pe.raycastToRef(new Vector3(0, 3, -5), new Vector3(0, -1, -5), res);
  const trigDefault = rayInfo(res).body;
  pe.raycastToRef(new Vector3(0, 3, -5), new Vector3(0, -1, -5), res, { shouldHitTriggers: true });
  const trigOn = rayInfo(res).body;
  pe.raycastToRef(new Vector3(0, 3, -5), new Vector3(0, -1, -5), res, { shouldHitTriggers: true, ignoreBody: trig.body });
  const trigIgnored = rayInfo(res).body;
  out.triggerAndIgnore = { default: trigDefault, shouldHitTriggers: trigOn, ignoreTriggerBody: trigIgnored };

  console.log("section 6", JSON.stringify(out).slice(0, 4000));
  // 6. multi-hit: plugin built with maxQueryCollectorHits=1 (default)
  const row = [0, 1, 2].map((k) => makeBox(w, "row" + k, new Vector3(0.3, 0.3, 0.3), new Vector3(10 + k, 0.5, 0), 0));
  w.step();
  const multiDefault = pe.raycastMulti(new Vector3(8, 0.5, 0), new Vector3(14, 0.5, 0));
  out.multiDefault = { n: multiDefault.length, bodies: multiDefault.map((r) => r.body?.transformNode.name), getMax: w.plugin.getMaxQueryCollectorHits() };
  w.plugin.setMaxQueryCollectorHits(16);
  const multiAfterSet = pe.raycastMulti(new Vector3(8, 0.5, 0), new Vector3(14, 0.5, 0));
  out.multiAfterSetMax16 = { n: multiAfterSet.length, bodies: multiAfterSet.map((r) => `${r.body?.transformNode.name}@${rn(r.hitDistance, 3)}`), getMaxAfterSet: w.plugin.getMaxQueryCollectorHits() };
  // pre-sized array -> only fills provided slots
  const two = [new PhysicsRaycastResult(), new PhysicsRaycastResult()];
  pe.raycastToRef(new Vector3(8, 0.5, 0), new Vector3(14, 0.5, 0), two);
  out.multiPresized2 = two.map((r) => r.body?.transformNode.name ?? null);
  // single result object while multi collector exists -> nearest?
  pe.raycastToRef(new Vector3(14, 0.5, 0), new Vector3(8, 0.5, 0), res);
  out.singleAfterMulti_reverseDir = rayInfo(res).body;

  console.log("section 7", JSON.stringify(out).slice(0, 4000));
  // 7. compound: container children hit by multi ray (same body, several shapes?) + raw shape path
  const container = new PhysicsShapeContainer(w.scene);
  const kids = [0, 1, 2].map(() => new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.3, 0.3, 0.3), w.scene));
  kids.forEach((k, i) => container.addChild(k, new Vector3(i * 0.6 - 0.6, 0, 0)));
  container.addChild(kids[0], new Vector3(1.2, 0, 0)); // shared shape object at index 3
  const cm = MeshBuilder.CreateBox("compound", { size: 0.1 }, w.scene);
  cm.position.set(0, 0.5, 10);
  const cb = new PhysicsBody(cm, PhysicsMotionType.STATIC, false, w.scene);
  cb.shape = container;
  w.step();
  const kidName = (s: PhysicsShape | undefined) => (s ? (s === container ? "container" : "kid" + kids.indexOf(s)) : null);
  const mh = pe.raycastMulti(new Vector3(-2, 0.5, 10), new Vector3(2, 0.5, 10));
  out.compoundMulti = mh.map((r) => ({ body: r.body?.transformNode.name, shape: kidName(r.shape), x: rn(r.hitPointWorld.x, 3) }));
  console.log("section 8", JSON.stringify(out).slice(0, 4000));
  // 8. freshly created body (no step yet) and teleported mesh before step
  const fresh = makeBox(w, "fresh", new Vector3(0.5, 0.5, 0.5), new Vector3(20, 0.25, 0), 0);
  pe.raycastToRef(new Vector3(20, 3, 0), new Vector3(20, -1, 0), res);
  const freshBeforeStep = rayInfo(res).body;
  w.step();
  pe.raycastToRef(new Vector3(20, 3, 0), new Vector3(20, -1, 0), res);
  const freshAfterStep = rayInfo(res).body;
  out.freshBody = { beforeStep: freshBeforeStep, afterStep: freshAfterStep };
  const dyn = makeBox(w, "dynTele", new Vector3(0.5, 0.5, 0.5), new Vector3(24, 0.25, 0), 1);
  w.steps(2);
  dyn.mesh.position.set(26, 0.25, 0); // teleport via transform (body.disablePreStep default true -> ignored?)
  pe.raycastToRef(new Vector3(26, 3, 0), new Vector3(26, -1, 0), res);
  const teleBefore = rayInfo(res).body;
  w.step();
  pe.raycastToRef(new Vector3(26, 3, 0), new Vector3(26, -1, 0), res);
  out.teleportViaMeshPosition = { disablePreStep: dyn.body.disablePreStep, rayAtNewPosBeforeStep: teleBefore, rayAtNewPosAfterStep: rayInfo(res).body, meshXAfterStep: rn(dyn.mesh.position.x) };

  console.log("section 9", JSON.stringify(out).slice(0, 4000));
  // 9. performance: 500 random static/dynamic boxes, 20k rays
  for (let i = 0; i < 500; i++) {
    makeBox(w, "p" + i, new Vector3(0.3, 0.3, 0.3), new Vector3(-15 + (i % 25) * 1.2, 0.15 + Math.floor(i / 25) * 0.0, -15 + Math.floor(i / 25) * 1.2), i % 2 ? 1 : 0);
  }
  w.steps(2);
  const from = new Vector3(), to = new Vector3();
  let hits = 0;
  const N = 20000;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    from.set(-15 + Math.random() * 30, 2, -15 + Math.random() * 30);
    to.set(from.x + Math.random() - 0.5, -1, from.z + Math.random() - 0.5);
    pe.raycastToRef(from, to, res);
    if (res.hasHit) hits++;
  }
  const t1 = performance.now();
  const multiN = 5000;
  const t2 = performance.now();
  for (let i = 0; i < multiN; i++) {
    from.set(-16, 0.15, -15 + Math.random() * 30);
    to.set(16, 0.15, from.z);
    pe.raycastMulti(from, to);
  }
  const t3 = performance.now();
  out.perf = { rays: N, msTotal: rn(t1 - t0, 2), usPerRay: rn(((t1 - t0) * 1000) / N, 3), hits, multiRays: multiN, usPerMultiRay: rn(((t3 - t2) * 1000) / multiN, 3) };
  return out;
}
