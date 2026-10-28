// Q7 detail: what does PhysicsRaycastResult.shape contain per shape type, and for container children?
// (raw hitData[1] = collider shape id, hitData[2] = shape path).
import {
  Vector3,
  Quaternion,
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeSphere,
  PhysicsShapeCapsule,
  PhysicsShapeCylinder,
  PhysicsShapeConvexHull,
  PhysicsShapeMesh,
  PhysicsShapeContainer,
  PhysicsAggregate,
  PhysicsShapeType,
  PhysicsRaycastResult,
  type PhysicsShape,
} from "@babylonjs/core";
import { createWorld } from "./physics-events-common";

export async function probe() {
  const step = (globalThis as any).__step ?? "all";
  const out: any = {};
  const w = await createWorld({ maxQueryCollectorHits: 8 });
  const hk: any = w.hk;
  const pe = w.pe;
  const shapes: Record<string, PhysicsShape> = {};
  const place = (name: string, shape: PhysicsShape, x: number) => {
    const m = MeshBuilder.CreateBox(name, { size: 0.5 }, w.scene);
    m.position.set(x, 0, 0);
    const b = new PhysicsBody(m, PhysicsMotionType.STATIC, false, w.scene);
    b.shape = shape;
    shapes[name] = shape;
    return b;
  };
  place("box", new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.5, 0.5, 0.5), w.scene), 0);
  place("sphere", new PhysicsShapeSphere(Vector3.Zero(), 0.25, w.scene), 2);
  place("capsule", new PhysicsShapeCapsule(new Vector3(0, -0.2, 0), new Vector3(0, 0.2, 0), 0.2, w.scene), 4);
  place("cylinder", new PhysicsShapeCylinder(new Vector3(0, -0.2, 0), new Vector3(0, 0.2, 0), 0.2, w.scene), 6);
  const hullSrc = MeshBuilder.CreateSphere("hullSrc", { diameter: 0.5, segments: 4 }, w.scene);
  place("hull", new PhysicsShapeConvexHull(hullSrc, w.scene), 8);
  hullSrc.setEnabled(false);
  const meshSrc = MeshBuilder.CreateBox("meshSrc", { size: 0.5 }, w.scene);
  place("mesh", new PhysicsShapeMesh(meshSrc, w.scene), 10);
  meshSrc.setEnabled(false);
  const cont = new PhysicsShapeContainer(w.scene);
  const kid = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.3, 0.3, 0.3), w.scene);
  cont.addChild(kid, new Vector3(0, 0, 0));
  place("container1", cont, 12);
  // 3-child static container, and 1-child / 3-child DYNAMIC containers (gravity off)
  const mkKid = () => new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.3, 0.3, 0.3), w.scene);
  const cont3 = new PhysicsShapeContainer(w.scene);
  const kids3 = [mkKid(), mkKid(), mkKid()];
  kids3.forEach((k, i) => cont3.addChild(k, new Vector3(0, 0, (i - 1) * 0.4)));
  place("container3", cont3, 16);
  const contD1 = new PhysicsShapeContainer(w.scene);
  const kidD1 = mkKid();
  contD1.addChild(kidD1, Vector3.Zero());
  const bD1 = place("containerDyn1", contD1, 18);
  bD1.setMotionType(PhysicsMotionType.DYNAMIC);
  bD1.setGravityFactor(0);
  const contD3 = new PhysicsShapeContainer(w.scene);
  const kidsD3 = [mkKid(), mkKid(), mkKid()];
  kidsD3.forEach((k, i) => contD3.addChild(k, new Vector3(0, 0, (i - 1) * 0.4)));
  const bD3 = place("containerDyn3", contD3, 20);
  bD3.setMotionType(PhysicsMotionType.DYNAMIC);
  bD3.setGravityFactor(0);
  const dynBox = place("boxDyn", new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.5, 0.5, 0.5), w.scene), 22);
  dynBox.setMotionType(PhysicsMotionType.DYNAMIC);
  dynBox.setGravityFactor(0);
  // PhysicsAggregate BOX (shape created internally)
  const am = MeshBuilder.CreateBox("aggBox", { size: 0.5 }, w.scene);
  am.position.set(14, 0, 0);
  const agg = new PhysicsAggregate(am, PhysicsShapeType.BOX, { mass: 0 }, w.scene);
  shapes["aggBox"] = agg.shape;
  w.step();

  const res = new PhysicsRaycastResult();
  const names = (s: PhysicsShape | undefined) => {
    if (!s) return null;
    for (const [k, v] of Object.entries(shapes)) if (v === s) return k;
    if (s === kid) return "container1.kid";
    if (kids3.includes(s)) return "container3.kid" + kids3.indexOf(s);
    if (s === kidD1) return "containerDyn1.kid";
    if (kidsD3.includes(s)) return "containerDyn3.kid" + kidsD3.indexOf(s);
    return "other:" + s.getClassName();
  };
  const xs: Record<string, number> = { box: 0, sphere: 2, capsule: 4, cylinder: 6, hull: 8, mesh: 10, container1: 12, aggBox: 14, container3: 16, containerDyn1: 18, containerDyn3: 20, boxDyn: 22 };
  const table: any = {};
  for (const [k, x] of Object.entries(xs)) {
    pe.raycastToRef(new Vector3(x, 3, 0), new Vector3(x, -3, 0), res);
    table[k] = { hasHit: res.hasHit, shape: names(res.shape), tri: res.triangleIndex };
  }
  out.resultShapeByType = table;

  if (step === "all" || step === "raw") {
    // Raw cast through the single-hit collector, read hitData[1] and hitData[2]
    const coll = (w.plugin as any)._queryCollector;
    const raw: any = {};
    for (const [k, x] of Object.entries(xs)) {
      hk.HP_World_CastRayWithCollector(w.plugin.world, coll, [[x, 3, 0], [x, -3, 0], [-1, -1], false, [BigInt(0)]]);
      const n = hk.HP_QueryCollector_GetNumHits(coll)[1];
      if (n > 0) {
        const [frac, hit] = hk.HP_QueryCollector_GetCastRayResult(coll, 0)[1];
        raw[k] = { frac: +frac.toFixed(4), bodyId: String(hit[0][0]), colliderId: String(hit[1][0]), pathShape: String(hit[2][0]), pathData: String(hit[2][1]), shapeIdOfBodyShape: String((shapes[k] as any)._pluginData[0]), kidId: k === "container1" ? String(kid._pluginData[0]) : undefined };
      }
    }
    out.raw = raw;
  }
  return out;
}
