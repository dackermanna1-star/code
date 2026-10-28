// Q2 (shape constructors, convex hull baking, raw hulls, cost), Q4 (mass/density/material)
import {
  Vector3, Quaternion, TransformNode, Mesh, MeshBuilder, VertexData, VertexBuffer, PhysicsBody, PhysicsMotionType,
  PhysicsShape, PhysicsShapeBox, PhysicsShapeSphere, PhysicsShapeCapsule, PhysicsShapeCylinder, PhysicsShapeConvexHull,
  PhysicsShapeMesh, PhysicsShapeContainer, PhysicsShapeType, HavokPlugin, Scene, type BoundingBox,
} from "@babylonjs/core";
import type { HavokPhysicsWithBindings } from "@babylonjs/havok";
import { makeWorld, stepN, r3, v3, hkStats } from "./physics-bodies-util";

const bb = (b: BoundingBox) => ({ min: v3(b.minimum), max: v3(b.maximum) });

/** Convex hull straight from a Float32Array of xyz points (body-local space). No scene mesh needed. */
export function createConvexHullFromPoints(scene: Scene, points: Float32Array): PhysicsShape {
  const plugin = scene.getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin;
  const hk = plugin._hknp as HavokPhysicsWithBindings;
  const numVerts = points.length / 3;
  const ptr = hk._malloc(points.length * 4);
  // create the view AFTER _malloc (malloc may grow/replace the wasm heap buffer)
  new Float32Array(hk.HEAPU8.buffer, ptr, points.length).set(points);
  const res = hk.HP_Shape_CreateConvexHull(ptr, numVerts);
  hk._free(ptr);
  if (res[0] !== hk.Result.RESULT_OK) throw new Error("HP_Shape_CreateConvexHull failed: " + String(res[0]));
  const shape = new PhysicsShape({ pluginData: res[1] }, scene);
  // optional but recommended: make raycast results report this shape (plugin only registers shapes it created)
  (plugin as unknown as { _shapes: Map<bigint, PhysicsShape> })._shapes.set(res[1][0], shape);
  return shape;
}

function randomPoints(n: number, scale: number, seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const p = new Float32Array(n * 3);
  for (let i = 0; i < p.length; i++) p[i] = (rnd() - 0.5) * scale;
  return p;
}

export async function probe() {
  const out: Record<string, unknown> = {};
  const { scene, plugin, hk } = await makeWorld();
  const hkAny = hk as HavokPhysicsWithBindings;
  const ground = new PhysicsBody(new TransformNode("g", scene), PhysicsMotionType.STATIC, false, scene);
  ground.shape = new PhysicsShapeBox(new Vector3(0, -0.5, 0), Quaternion.Identity(), new Vector3(200, 1, 200), scene);

  // ---- primitive constructors: AABB check ----
  {
    const box = new PhysicsShapeBox(new Vector3(1, 0, 0), Quaternion.Identity(), new Vector3(2, 1, 0.5), scene);
    const sph = new PhysicsShapeSphere(new Vector3(0, 1, 0), 0.5, scene);
    const cap = new PhysicsShapeCapsule(new Vector3(0, -0.5, 0), new Vector3(0, 0.5, 0), 0.25, scene);
    const cyl = new PhysicsShapeCylinder(new Vector3(0, -0.5, 0), new Vector3(0, 0.5, 0), 0.25, scene);
    out.primitiveAABBs = { box_center100_extents2x1x05: bb(box.getBoundingBox()), sphere: bb(sph.getBoundingBox()), capsule: bb(cap.getBoundingBox()), cylinder: bb(cyl.getBoundingBox()) };
    out.shapeTypes = { box: box.type, sphere: sph.type, container: new PhysicsShapeContainer(scene).type };
    out.defaults = {
      density: box.density,
      material: box.material,
      filterMembership: box.filterMembershipMask,
      filterCollide: box.filterCollideMask,
    };
  }

  // ---- convex hull from a transformed mesh: what gets baked? ----
  {
    const m = MeshBuilder.CreateBox("hullSrc", { size: 1 }, scene);
    m.position.set(5, 0, 0);
    m.rotation.y = Math.PI / 4;
    m.scaling.set(2, 1, 1);
    const hull = new PhysicsShapeConvexHull(m, scene);
    const parent = new TransformNode("sp", scene);
    parent.scaling.set(3, 3, 3);
    const m2 = MeshBuilder.CreateBox("hullSrc2", { size: 1 }, scene);
    m2.parent = parent;
    const hull2 = new PhysicsShapeConvexHull(m2, scene);
    const meshShape = new PhysicsShapeMesh(m, scene);
    out.convexHullBaking = {
      meshPos5_rotY45_scale2x1x1: bb(hull.getBoundingBox()),
      meshUnderParentScale3: bb(hull2.getBoundingBox()),
      meshShapeSameMesh: bb(meshShape.getBoundingBox()),
    };
    // mass of a MESH shape (triangle soup) vs hull
    const tn = new TransformNode("ms", scene);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
    b.shape = meshShape;
    const mpMesh = b.getMassProperties();
    b.shape = hull;
    const mpHull = b.getMassProperties();
    out.massOfMeshVsHullShape_density1000 = { meshShape: { mass: r3(mpMesh.mass!), inertia: v3(mpMesh.inertia!) }, hull2x1x1: { mass: r3(mpHull.mass!), inertia: v3(mpHull.inertia!) } };
    b.dispose(); tn.dispose(); m.dispose(); m2.dispose();
  }

  // ---- raw hull from points ----
  {
    const pts = new Float32Array([-0.1, -0.1, -0.1, 0.1, -0.1, -0.1, -0.1, 0.1, -0.1, 0.1, 0.1, -0.1, -0.1, -0.1, 0.1, 0.1, -0.1, 0.1, -0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
    const shape = createConvexHullFromPoints(scene, pts);
    const tn = new TransformNode("raw", scene);
    tn.position.set(20, 1, 0);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
    b.shape = shape;
    stepN(scene, 120);
    const hit = scene.getPhysicsEngine()!.raycast(new Vector3(20, 2, 0), new Vector3(20, -1, 0));
    // what id does the hit report?
    const hkq = plugin as unknown as { _queryCollector: unknown };
    const rawHit = hkAny.HP_QueryCollector_GetCastRayResult(hkq._queryCollector as never, 0)[1];
    const boxShape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.2, 0.2, 0.2), scene);
    const tnB = new TransformNode("rawBox", scene);
    tnB.position.set(22, 0.1, 0);
    const bB = new PhysicsBody(tnB, PhysicsMotionType.STATIC, false, scene);
    bB.shape = boxShape;
    const hitBox = scene.getPhysicsEngine()!.raycast(new Vector3(22, 2, 0), new Vector3(22, -1, 0));
    out.raycastShapeIds = { createdId: String(shape._pluginData[0]), hitColliderId: String(rawHit[1][1][0]), boxHitShapeIsBox: hitBox.shape === boxShape, boxId: String(boxShape._pluginData[0]) };
    out.rawHull = {
      typeGetter: shape.type, typeofType: typeof shape.type, isConvexHullEnum: shape.type === PhysicsShapeType.CONVEX_HULL,
      mass: r3(b.getMassProperties().mass!), restY_expected01: r3(tn.position.y), aabb: bb(shape.getBoundingBox()),
      raycastHitShapeIsOurs: hit.shape === shape, raycastHitBodyIsOurs: hit.body === b,
    };
    b.dispose(); tn.dispose();
  }

  // ---- degenerate / tiny hulls ----
  {
    const tryHull = (name: string, pts: number[]) => {
      const f = new Float32Array(pts);
      const ptr = hkAny._malloc(f.length * 4);
      new Float32Array(hkAny.HEAPU8.buffer, ptr, f.length).set(f);
      const res = hkAny.HP_Shape_CreateConvexHull(ptr, f.length / 3);
      hkAny._free(ptr);
      const ok = res[0] === hkAny.Result.RESULT_OK;
      let aabb: unknown = null, mass: unknown = null, mres: unknown = null, verts: unknown = null;
      if (ok && res[1][0]) {
        const a = hkAny.HP_Shape_GetBoundingBox(res[1], [[0, 0, 0], [0, 0, 0, 1]])[1];
        aabb = { min: a[0].map((x: number) => r3(x * 1000) / 1000), max: a[1].map((x: number) => r3(x * 1000) / 1000) };
        const mp = hkAny.HP_Shape_BuildMassProperties(res[1]);
        mres = mp[0] === hkAny.Result.RESULT_OK ? "OK" : String(mp[0]);
        mass = mp[1] ? r3(mp[1][1]) : null;
        const dg = hkAny.HP_Shape_CreateDebugDisplayGeometry(res[1]);
        if (dg[0] === hkAny.Result.RESULT_OK) { verts = hkAny.HP_DebugGeometry_GetInfo(dg[1])[1][1]; hkAny.HP_DebugGeometry_Release(dg[1]); }
        hkAny.HP_Shape_Release(res[1]);
      }
      return { name, ok, resultCode: ok ? 0 : (res[0] as unknown as { value?: number }).value ?? String(res[0]), handle: String(res[1][0]), aabb, massResult: mres, mass, debugVerts: verts };
    };
    const cube = (s: number) => { const h = s / 2; const p: number[] = []; for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) p.push(x, y, z); return p; };
    out.degenerateHulls = [
      tryHull("cube1m", cube(1)),
      tryHull("cube2cm", cube(0.02)),
      tryHull("cube5mm", cube(0.005)),
      tryHull("flat_4coplanar_1m", [0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1]),
      tryHull("triangle_3pts", [0, 0, 0, 1, 0, 0, 0, 0, 1]),
      tryHull("segment_2pts", [0, 0, 0, 1, 0, 0]),
      tryHull("single_point", [0, 0, 0]),
      tryHull("sliver_1mx1mx0.5mm", [...cube(1).map((v, i) => (i % 3 === 1 ? v * 0.0005 : v))]),
      tryHull("sphere500pts", (() => { const p: number[] = []; for (let i = 0; i < 500; i++) { const u = Math.acos(1 - 2 * (i + 0.5) / 500), t = Math.PI * (1 + Math.sqrt(5)) * i; p.push(Math.sin(u) * Math.cos(t) * 0.5, Math.cos(u) * 0.5, Math.sin(u) * Math.sin(t) * 0.5); } return p; })()),
    ];
  }
  // tiny shard resting height (convex radius?)
  {
    const s = 0.02;
    const h = s / 2;
    const p: number[] = [];
    for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) p.push(x, y, z);
    const shape = createConvexHullFromPoints(scene, new Float32Array(p));
    const tn = new TransformNode("tiny", scene);
    tn.position.set(-20, 0.2, 0);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
    b.shape = shape;
    const bx = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(s, s, s), scene);
    const tn2 = new TransformNode("tinybox", scene);
    tn2.position.set(-21, 0.2, 0);
    const b2 = new PhysicsBody(tn2, PhysicsMotionType.DYNAMIC, false, scene);
    b2.shape = bx;
    stepN(scene, 180);
    out.tiny2cm_restY_expected_0p01 = { hull: r3(tn.position.y * 1000) / 1000, box: r3(tn2.position.y * 1000) / 1000 };
    b.dispose(); b2.dispose();
  }

  // ---- cost: 200 hulls x 30 points ----
  {
    const sets: Float32Array[] = [];
    for (let i = 0; i < 200; i++) sets.push(randomPoints(30, 0.3, i + 1));
    // warm-up (JIT + wasm code paths)
    for (let i = 0; i < 50; i++) createConvexHullFromPoints(scene, randomPoints(30, 0.3, 1000 + i)).dispose();
    const before = hkStats(hk);
    let t = performance.now();
    const raw: PhysicsShape[] = sets.map((p) => createConvexHullFromPoints(scene, p));
    const tRaw = performance.now() - t;
    // temp mesh per hull
    t = performance.now();
    const viaMesh: PhysicsShape[] = [];
    for (const p of sets) {
      const m = new Mesh("tmp", scene);
      const vd = new VertexData();
      vd.positions = p;
      vd.applyToMesh(m);
      viaMesh.push(new PhysicsShapeConvexHull(m, scene));
      m.dispose();
    }
    const tMesh = performance.now() - t;
    // one reused temp mesh
    t = performance.now();
    const tmp = new Mesh("tmpReuse", scene);
    const viaReused: PhysicsShape[] = [];
    for (const p of sets) {
      tmp.setVerticesData(VertexBuffer.PositionKind, p, true);
      viaReused.push(new PhysicsShapeConvexHull(tmp, scene));
    }
    const tReused = performance.now() - t;
    tmp.dispose();
    t = performance.now();
    const raw2: PhysicsShape[] = sets.map((p) => createConvexHullFromPoints(scene, p));
    const tRaw2 = performance.now() - t;
    for (const s2 of raw2) s2.dispose();
    const sets8 = sets.map((_, i) => randomPoints(8, 0.3, 5000 + i));
    t = performance.now();
    const raw8: PhysicsShape[] = sets8.map((p) => createConvexHullFromPoints(scene, p));
    const tRaw8 = performance.now() - t;
    for (const s2 of raw8) s2.dispose();
    const sets100 = sets.map((_, i) => randomPoints(100, 0.3, 9000 + i));
    t = performance.now();
    const raw100: PhysicsShape[] = sets100.map((p) => createConvexHullFromPoints(scene, p));
    const tRaw100 = performance.now() - t;
    for (const s2 of raw100) s2.dispose();
    // bodies for the 200 raw hulls
    t = performance.now();
    const bodies: PhysicsBody[] = [];
    for (let i = 0; i < raw.length; i++) {
      const tn = new TransformNode("h" + i, scene);
      tn.position.set((i % 20) * 0.5, 2 + Math.floor(i / 20) * 0.5, 30);
      const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
      b.shape = raw[i];
      bodies.push(b);
    }
    const tBodies = performance.now() - t;
    const sameA = bb(raw[7].getBoundingBox()), sameB = bb(viaMesh[7].getBoundingBox());
    out.cost200Hulls30pts_ms = {
      rawFromFloat32Array: r3(tRaw), tempMeshEach_NullEngine: r3(tMesh), reusedTempMesh_NullEngine: r3(tReused), rawAgain: r3(tRaw2), raw200x8pts: r3(tRaw8), raw200x100pts: r3(tRaw100),
      createBodiesForThem: r3(tBodies), hkShapesAdded: hkStats(hk).shapes - before.shapes,
      rawAndMeshHullsIdenticalAABB: JSON.stringify(sameA) === JSON.stringify(sameB),
    };
    for (const b of bodies) { b.transformNode.dispose(); }
    for (const s of [...raw, ...viaMesh, ...viaReused]) s.dispose();
  }

  // ---- Q4: mass properties ----
  {
    const mk = (shape: PhysicsShape) => {
      const tn = new TransformNode("m", scene);
      tn.position.set(0, 100, 100);
      const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
      b.shape = shape;
      b.setGravityFactor(0);
      return b;
    };
    const mp = (b: PhysicsBody) => { const p = b.getMassProperties(); return { mass: r3(p.mass!), com: v3(p.centerOfMass!), inertia: v3(p.inertia!), inertiaOrientation: [r3(p.inertiaOrientation!.x), r3(p.inertiaOrientation!.y), r3(p.inertiaOrientation!.z), r3(p.inertiaOrientation!.w)] }; };
    const unit = () => new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(1, 1, 1), scene);
    const sDefault = unit();
    const bDefault = mk(sDefault);
    const sD = unit(); sD.density = 2500;
    const bD = mk(sD);
    // density changed after assignment
    const sLate = unit();
    const bLate = mk(sLate);
    sLate.density = 100;
    const lateBefore = mp(bLate);
    bLate.shape = sLate; // re-assign to recompute
    const lateAfterReassign = mp(bLate);
    // container with offset children + different densities
    const c = new PhysicsShapeContainer(scene);
    const a = unit(); a.density = 3000;
    const bch = unit(); bch.density = 1000;
    c.addChild(a, new Vector3(0, 0, 0));
    c.addChild(bch, new Vector3(2, 0, 0));
    const bC = mk(c);
    const containerMP = mp(bC);
    c.density = 5;
    bC.shape = c;
    const containerAfterContainerDensity5 = mp(bC);
    // only {mass}
    const bOnly = mk(unit());
    bOnly.setMassProperties({ mass: 50 });
    const onlyMass = mp(bOnly);
    // sticky overrides
    bOnly.setMassProperties({ mass: 50, centerOfMass: new Vector3(0, 1, 0) });
    bOnly.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(2, 2, 2), scene);
    const stickyAfterNewShape = mp(bOnly);
    bOnly.setMassProperties({});
    const afterClear = mp(bOnly);
    const computed = bOnly.computeMassProperties();
    // mass 0 on dynamic
    const tn0 = new TransformNode("m0", scene);
    tn0.position.set(40, 5, 0);
    const b0 = new PhysicsBody(tn0, PhysicsMotionType.DYNAMIC, false, scene);
    b0.shape = unit();
    b0.setMassProperties({ mass: 0 });
    stepN(scene, 60);
    out.mass = {
      defaultDensityUnitBox: mp(bDefault), density2500: mp(bD), densityChangedAfterAssign_before: lateBefore, densityChangedAfterAssign_reassigned: lateAfterReassign,
      container_3000at0_1000at2: containerMP, containerAfterSettingContainerDensity5: containerAfterContainerDensity5,
      onlyMassSet50: onlyMass, stickyOverridesAfterNewShape2m: stickyAfterNewShape, afterSetMassPropertiesEmpty: afterClear,
      computeMassProperties2mBox: { mass: r3(computed.mass!), inertia: v3(computed.inertia!) },
      dynamicMass0_yAfter1s_from5: r3(tn0.position.y), dynamicMass0_vel: v3(b0.getLinearVelocity()),
    };
  }

  // ---- material ----
  {
    const s = new PhysicsShapeSphere(Vector3.Zero(), 0.1, scene);
    const fresh = s.material;
    s.material = { friction: 0.8, restitution: 0.8 };
    const s2 = new PhysicsShapeSphere(Vector3.Zero(), 0.1, scene);
    s2.material = { friction: 0.3, staticFriction: 0.6, restitution: 0.5 };
    const nativeRoundtrip = plugin.getMaterial(s2);
    // bounce test: restitution 0.8 ball on ground (restitution 0 default, combine MAXIMUM) from 1 m
    const tn = new TransformNode("ball", scene);
    tn.position.set(60, 1.1, 0);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
    b.shape = s;
    let phase = 0, maxY = 0;
    for (let i = 0; i < 240; i++) {
      stepN(scene, 1);
      const vy = b.getLinearVelocity().y;
      if (phase === 0 && vy > 0) phase = 1;
      if (phase === 1) { maxY = Math.max(maxY, tn.position.y - 0.1); if (vy < 0) break; }
    }
    out.material = { freshShapeMaterial: fresh, getterAfterSet: s.material, nativeRoundtrip, bounceHeightFrom1m_rest08: r3(maxY) };
  }
  return out;
}
