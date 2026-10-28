// Q8: HavokPlugin.shapeCast / shapeProximity / pointProximity semantics.
import {
  Vector3,
  Quaternion,
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeSphere,
  PhysicsShapeContainer,
  ShapeCastResult,
  ProximityCastResult,
  type PhysicsShape,
  type HavokPlugin,
} from "@babylonjs/core";
import { createWorld, makeGround, makeBox, r3, rn } from "./physics-events-common";

type ShapeCastQuery = Parameters<HavokPlugin["shapeCast"]>[0];
type ShapeProxQuery = Parameters<HavokPlugin["shapeProximity"]>[0];
type PointProxQuery = Parameters<HavokPlugin["pointProximity"]>[0];

const info = (r: ShapeCastResult | ProximityCastResult, names?: (s?: PhysicsShape) => any) => ({
  hasHit: r.hasHit,
  body: r.body?.transformNode.name ?? null,
  bodyIndex: r.bodyIndex ?? null,
  shape: names ? names(r.shape) : r.shape ? r.shape.getClassName() : null,
  point: r3(r.hitPoint, 4),
  normal: r3(r.hitNormal, 4),
  fraction: r instanceof ShapeCastResult ? rn(r.hitFraction, 4) : undefined,
  distance: r instanceof ProximityCastResult ? rn(r.hitDistance, 4) : undefined,
  tri: r.triangleIndex,
});

export async function probe() {
  const out: any = {};
  const w = await createWorld();
  const plugin = w.plugin;
  makeGround(w); // top y=0
  const target = makeBox(w, "target", new Vector3(1, 1, 1), new Vector3(5, 0.5, 0), 0); // faces at x=4.5..5.5, y 0..1
  const sphere = new PhysicsShapeSphere(Vector3.Zero(), 0.1, w.scene); // query shape, not attached to any body
  const inRes = new ShapeCastResult();
  const hitRes = new ShapeCastResult();

  // 1. sphere sweep along +x at y=0.5 from x=2 to x=8 -> should touch face x=4.5 when centre at x=4.4
  const q: ShapeCastQuery = { shape: sphere, rotation: Quaternion.Identity(), startPosition: new Vector3(2, 0.5, 0), endPosition: new Vector3(8, 0.5, 0), shouldHitTriggers: false };
  plugin.shapeCast(q, inRes, hitRes);
  const centreAtHit = Vector3.Lerp(q.startPosition, q.endPosition, hitRes.hitFraction);
  out.sweepX = { input: info(inRes), hit: info(hitRes), centreAtHit: r3(centreAtHit, 4), expectedCentreX: 4.4 };

  // 2. diagonal sweep hitting the top face, with an offset start so local vs world is distinguishable
  const q2: ShapeCastQuery = { ...q, startPosition: new Vector3(5.2, 3, 0.3), endPosition: new Vector3(5.2, -1, 0.3) };
  plugin.shapeCast(q2, inRes, hitRes);
  out.sweepDownOntoTop = { input: info(inRes), hit: info(hitRes), centreAtHit: r3(Vector3.Lerp(q2.startPosition, q2.endPosition, hitRes.hitFraction), 4), expectedCentreY: 1.1 };

  // 3. start already penetrating the target
  plugin.shapeCast({ ...q, startPosition: new Vector3(4.5, 0.5, 0), endPosition: new Vector3(8, 0.5, 0) }, inRes, hitRes);
  out.startPenetrating = { input: info(inRes), hit: info(hitRes) };
  plugin.shapeCast({ ...q, startPosition: new Vector3(5, 0.5, 0), endPosition: new Vector3(8, 0.5, 0) }, inRes, hitRes);
  out.startDeepInside = { input: info(inRes), hit: info(hitRes) };

  // 4. miss
  plugin.shapeCast({ ...q, startPosition: new Vector3(2, 3, 0), endPosition: new Vector3(8, 3, 0) }, inRes, hitRes);
  out.miss = { input: info(inRes), hit: info(hitRes) };

  // 5. rotated box cast (a "hammer head" 0.3x0.1x0.1 rotated 90deg about z) sweeping down
  const head = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.3, 0.1, 0.1), w.scene);
  const rot = Quaternion.RotationAxis(new Vector3(0, 0, 1), Math.PI / 2); // long axis now vertical
  plugin.shapeCast({ shape: head, rotation: rot, startPosition: new Vector3(5, 3, 0), endPosition: new Vector3(5, 0, 0), shouldHitTriggers: false }, inRes, hitRes);
  out.rotatedBoxDown = { input: info(inRes), hit: info(hitRes), centreAtHit: r3(Vector3.Lerp(new Vector3(5, 3, 0), new Vector3(5, 0, 0), hitRes.hitFraction), 4), expectedCentreY: 1.15 };

  // 6. ignoreBody + filters: the query shape's own filter masks
  const blocker = makeBox(w, "blocker", new Vector3(0.2, 2, 2), new Vector3(3, 1, 0), 0);
  blocker.shape.filterMembershipMask = 2;
  plugin.shapeCast(q, inRes, hitRes);
  const withBlocker = info(hitRes).body;
  plugin.shapeCast({ ...q, ignoreBody: blocker.body }, inRes, hitRes);
  const ignoringBlocker = info(hitRes).body;
  sphere.filterCollideMask = ~2; // query shape should not collide with membership 2
  plugin.shapeCast(q, inRes, hitRes);
  const queryCollideMaskExcl2 = info(hitRes).body;
  sphere.filterCollideMask = ~0;
  sphere.filterMembershipMask = 4;
  blocker.shape.filterCollideMask = ~4; // blocker refuses membership 4
  plugin.shapeCast(q, inRes, hitRes);
  const blockerRefusesQueryMembership = info(hitRes).body;
  sphere.filterMembershipMask = ~0;
  blocker.shape.filterCollideMask = ~0;
  out.ignoreAndFilters = { withBlocker, ignoringBlocker, queryCollideMaskExcl2, blockerRefusesQueryMembership };
  blocker.mesh.dispose();

  // 7. compound target: which child?
  const cont = new PhysicsShapeContainer(w.scene);
  const kids = [0, 1, 2].map(() => new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.3, 0.3, 0.3), w.scene));
  kids.forEach((k, i) => cont.addChild(k, new Vector3(0, 0, (i - 1) * 0.6)));
  const cm = MeshBuilder.CreateBox("compound", { size: 0.1 }, w.scene);
  cm.position.set(0, 0.5, 5);
  const cb = new PhysicsBody(cm, PhysicsMotionType.STATIC, false, w.scene);
  cb.shape = cont;
  const kidName = (s?: PhysicsShape) => (s ? (s === cont ? "container" : kids.includes(s) ? "kid" + kids.indexOf(s) : s.getClassName()) : null);
  const childHits: any[] = [];
  for (let i = 0; i < 3; i++) {
    plugin.shapeCast({ shape: sphere, rotation: Quaternion.Identity(), startPosition: new Vector3(-2, 0.5, 5 + (i - 1) * 0.6), endPosition: new Vector3(2, 0.5, 5 + (i - 1) * 0.6), shouldHitTriggers: false }, inRes, hitRes);
    childHits.push({ aim: i, hit: info(hitRes, kidName) });
  }
  out.compoundChildren = childHits;

  // 8. shapeProximity
  const pin = new ProximityCastResult();
  const phit = new ProximityCastResult();
  const sp = (pos: Vector3, maxDistance: number) => {
    const pq: ShapeProxQuery = { shape: sphere, position: pos, rotation: Quaternion.Identity(), maxDistance, shouldHitTriggers: false };
    plugin.shapeProximity(pq, pin, phit);
    return { input: info(pin), hit: info(phit) };
  };
  out.shapeProximity = {
    near_gap0p3_max1: sp(new Vector3(4.1, 0.5, 0), 1), // sphere surface 0.3 from face x=4.5
    near_gap0p3_max0p2: sp(new Vector3(4.1, 0.5, 0), 0.2),
    overlapping_max0: sp(new Vector3(4.45, 0.5, 0), 0),
    inside_max0: sp(new Vector3(5, 0.5, 0), 0),
  };

  // 9. pointProximity
  const pp = (pos: Vector3, maxDistance: number) => {
    const pq: PointProxQuery = { position: pos, maxDistance, collisionFilter: {}, shouldHitTriggers: false };
    const r = new ProximityCastResult();
    plugin.pointProximity(pq, r);
    return info(r);
  };
  out.pointProximity = {
    gap0p5_max1: pp(new Vector3(4.0, 0.5, 0), 1),
    gap0p5_max0p4: pp(new Vector3(4.0, 0.5, 0), 0.4),
    inside_max0: pp(new Vector3(5, 0.5, 0), 0),
    inside_max1: pp(new Vector3(5, 0.5, 0.3), 1),
  };

  // 10. multiple hits along a sweep through the raw API with a bigger collector
  makeBox(w, "wallA", new Vector3(0.2, 1, 1), new Vector3(10, 0.5, 0), 0);
  makeBox(w, "wallB", new Vector3(0.2, 1, 1), new Vector3(11, 0.5, 0), 0);
  makeBox(w, "wallC", new Vector3(0.2, 1, 1), new Vector3(12, 0.5, 0), 0);
  try {
    const hk: any = w.hk;
    const coll = hk.HP_QueryCollector_Create(16)[1];
    hk.HP_World_ShapeCastWithCollector(plugin.world, coll, [sphere._pluginData, [0, 0, 0, 1], [9, 0.5, 0], [13, 0.5, 0], false, [BigInt(0)]]);
    const n = hk.HP_QueryCollector_GetNumHits(coll)[1];
    const hits: any[] = [];
    const bodies = (plugin as any)._bodies as Map<bigint, { body: PhysicsBody; index: number }>;
    for (let i = 0; i < n; i++) {
      const [frac, , hitShape] = hk.HP_QueryCollector_GetShapeCastResult(coll, i)[1];
      hits.push({ frac: rn(frac, 4), body: bodies.get(hitShape[0][0])?.body.transformNode.name, x: rn(hitShape[3][0], 3) });
    }
    hk.HP_QueryCollector_Release(coll);
    out.rawMultiShapeCast = { n, hits };
  } catch (e) {
    out.rawMultiShapeCast = String(e);
  }

  // 11. performance: 5000 sphere casts of 1 m among 300 boxes
  for (let i = 0; i < 300; i++) makeBox(w, "p" + i, new Vector3(0.3, 0.3, 0.3), new Vector3(-15 + (i % 20) * 1.5, 0.15, -15 + Math.floor(i / 20) * 1.5), 0);
  const s = new Vector3(), e = new Vector3();
  const N = 5000;
  let hits = 0;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    s.set(-15 + Math.random() * 28, 0.15, -15 + Math.random() * 22);
    e.set(s.x + 1, 0.15, s.z);
    plugin.shapeCast({ shape: sphere, rotation: Quaternion.Identity(), startPosition: s, endPosition: e, shouldHitTriggers: false }, inRes, hitRes);
    if (hitRes.hasHit) hits++;
  }
  const t1 = performance.now();
  out.perf = { casts: N, usPerCast: rn(((t1 - t0) * 1000) / N, 2), hits };
  void target;
  return out;
}
