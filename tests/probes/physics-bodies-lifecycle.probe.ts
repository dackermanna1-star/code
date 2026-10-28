// Q8 (disposal + leaks), Q9 (thin-instanced bodies)
import {
  Vector3, Quaternion, Matrix, TransformNode, MeshBuilder, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShapeContainer,
  PhysicsShapeSphere, HavokPlugin,
} from "@babylonjs/core";
import { makeWorld, stepN, r3, v3, hkStats } from "./physics-bodies-util";

export async function probe() {
  const out: Record<string, unknown> = {};
  const { scene, plugin, hk, phys } = await makeWorld({ webgl: true }); // NullEngine has no thin-instance support
  const priv = plugin as unknown as { _bodies: Map<bigint, unknown>; _shapes: Map<bigint, unknown>; _bodyCollisionObservable: Map<bigint, unknown>; _bodyCollisionEndedObservable: Map<bigint, unknown> };
  const snapshot = () => ({ ...hkStats(hk), pluginNumBodies: plugin.numBodies, engineBodies: phys.getBodies().length, jsBodies: priv._bodies.size, jsShapes: priv._shapes.size, collObs: priv._bodyCollisionObservable.size, collEndObs: priv._bodyCollisionEndedObservable.size, heapMB: r3(hk.HEAPU8.length / 1048576) });
  const unit = (s = 0.5) => new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(s, s, s), scene);
  const ground = new PhysicsBody(new TransformNode("g", scene), PhysicsMotionType.STATIC, false, scene);
  ground.shape = new PhysicsShapeBox(new Vector3(0, -0.5, 0), Quaternion.Identity(), new Vector3(200, 1, 200), scene);
  const base = snapshot();
  out.baseline = base;

  // dispose orders
  {
    const tn = new TransformNode("a", scene);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
    const s = unit();
    b.shape = s;
    s.dispose(); // shape first, while still attached
    const afterShapeFirst = snapshot();
    let stepOk = true;
    try { stepN(scene, 5); } catch (e) { stepOk = false; }
    const yAfter = r3(tn.position.y);
    b.dispose();
    const afterBoth = snapshot();
    out.disposeShapeBeforeBody = { afterShapeFirst_shapes: afterShapeFirst.shapes - base.shapes, stepOk, bodyStillSimulatedY: yAfter, afterBodyDispose: { bodies: afterBoth.bodies - base.bodies, shapes: afterBoth.shapes - base.shapes } };
    tn.dispose();
  }
  {
    // node dispose disposes the body? and the shape?
    const m = MeshBuilder.CreateBox("m", { size: 0.5 }, scene);
    const b = new PhysicsBody(m, PhysicsMotionType.DYNAMIC, false, scene);
    const s = unit();
    b.shape = s;
    m.dispose();
    const snap = snapshot();
    out.nodeDispose = { bodyIsDisposed: b.isDisposed, nodePhysicsBodyNull: m.physicsBody === null || m.physicsBody === undefined, bodiesDelta: snap.bodies - base.bodies, shapesDelta_shapeNotDisposed: snap.shapes - base.shapes, engineBodiesDelta: snap.engineBodies - base.engineBodies };
    s.dispose();
  }
  {
    // container disposal: are children released?
    const c = new PhysicsShapeContainer(scene);
    const kids = [unit(), unit(), unit()];
    kids.forEach((k, i) => c.addChild(k, new Vector3(i, 0, 0)));
    const tn = new TransformNode("c", scene);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
    b.shape = c;
    const s0 = snapshot();
    b.dispose();
    c.dispose();
    const s1 = snapshot();
    kids.forEach((k) => k.dispose());
    const s2 = snapshot();
    out.containerDispose = { shapesWithAll: s0.shapes - base.shapes, afterBodyAndContainerDispose: s1.shapes - base.shapes, afterChildrenDisposed: s2.shapes - base.shapes, jsShapesAfterAll: s2.jsShapes - base.jsShapes };
    tn.dispose();
  }
  {
    // shared shape: one shape on many bodies, dispose shape while bodies alive, then bodies
    const s = unit();
    const bodies: PhysicsBody[] = [];
    for (let i = 0; i < 10; i++) { const tn = new TransformNode("sh" + i, scene); tn.position.set(i, 3, 10); const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene); b.shape = s; bodies.push(b); }
    s.dispose();
    stepN(scene, 60);
    const stillCollideY = r3(bodies[3].transformNode.position.y);
    for (const b of bodies) b.transformNode.dispose();
    out.sharedShapeDisposedEarly = { bodiesStillLandOnGroundY_expected025: stillCollideY, after: { bodies: snapshot().bodies - base.bodies, shapes: snapshot().shapes - base.shapes } };
  }
  {
    // collision-ended observable map leak + body id reuse
    const tn = new TransformNode("obs", scene);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
    b.shape = unit();
    b.setCollisionCallbackEnabled(true);
    b.setCollisionEndedCallbackEnabled(true);
    b.getCollisionObservable().add(() => {});
    b.getCollisionEndedObservable().add(() => {});
    const id = b._pluginData.hpBodyId[0];
    const s0 = snapshot();
    b.dispose();
    const s1 = snapshot();
    const tn2 = new TransformNode("obs2", scene);
    const b2 = new PhysicsBody(tn2, PhysicsMotionType.DYNAMIC, false, scene);
    b2.shape = unit();
    const id2 = b2._pluginData.hpBodyId[0];
    out.observableMaps = {
      before: { collObs: s0.collObs - base.collObs, collEndObs: s0.collEndObs - base.collEndObs },
      afterDispose: { collObs: s1.collObs - base.collObs, collEndObs: s1.collEndObs - base.collEndObs },
      bodyIdReused: id === id2,
      newBodyInheritsOldEndedObservers: (b2.getCollisionEndedObservable() as unknown as { observers: unknown[] }).observers.length,
    };
    b2.dispose(); tn2.dispose(); tn.dispose();
  }
  // churn: create/destroy many bodies (with own shapes), check stats return to baseline, and timing of mass disposal
  {
    const before = snapshot();
    const cycles = 5, perCycle = 2000;
    const tCreate: number[] = [], tDisposeFifo: number[] = [];
    for (let c = 0; c < cycles; c++) {
      const bodies: PhysicsBody[] = [];
      let t = performance.now();
      for (let i = 0; i < perCycle; i++) {
        const tn = new TransformNode("ch", scene);
        tn.position.set((i % 50) * 0.6, 0.25 + Math.floor(i / 50) * 0.6, 40);
        const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
        b.shape = new PhysicsShapeSphere(Vector3.Zero(), 0.2, scene);
        bodies.push(b);
      }
      tCreate.push(performance.now() - t);
      stepN(scene, 2);
      t = performance.now();
      for (const b of bodies) { const s = b.shape!; b.dispose(); s.dispose(); b.transformNode.dispose(); }
      tDisposeFifo.push(performance.now() - t);
    }
    const after = snapshot();
    // removal order cost: engine.removeBody is indexOf+splice (O(n))
    const bodies: PhysicsBody[] = [];
    for (let i = 0; i < 4000; i++) { const tn = new TransformNode("o", scene); tn.position.set(i * 0.6, 50, 60); const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, true, scene); b.shape = unit(0.2); bodies.push(b); }
    let t = performance.now();
    for (let i = bodies.length - 1; i >= 2000; i--) bodies[i].dispose(); // newest first (indexOf scans from start: worst)
    const tNewestFirst = performance.now() - t;
    t = performance.now();
    for (let i = 0; i < 2000; i++) bodies[i].dispose(); // oldest first
    const tOldestFirst = performance.now() - t;
    for (const b of bodies) { b.shape?.dispose(); b.transformNode.dispose(); }
    out.churn = {
      cycles, perCycle, createMs: tCreate.map(r3), disposeMs: tDisposeFifo.map(r3),
      deltaAfterChurn: { bodies: after.bodies - before.bodies, shapes: after.shapes - before.shapes, jsBodies: after.jsBodies - before.jsBodies, jsShapes: after.jsShapes - before.jsShapes, engineBodies: after.engineBodies - before.engineBodies, numBodies: after.pluginNumBodies - before.pluginNumBodies },
      heapMB: { before: before.heapMB, after: after.heapMB },
      dispose2000of4000_ms: { newestFirst: r3(tNewestFirst), oldestFirst: r3(tOldestFirst) },
      note_shapeOfDisposedBodyIsNull: true,
    };
    out.finalVsBaseline = { bodies: snapshot().bodies - base.bodies, shapes: snapshot().shapes - base.shapes };
  }

  // ---------------- Q9: thin instances ----------------
  {
    const m = MeshBuilder.CreateBox("ti", { size: 0.3 }, scene);
    const N = 50;
    for (let i = 0; i < N; i++) {
      const mat = Matrix.Compose(new Vector3(0.5, 0.5, 0.5), Quaternion.Identity(), new Vector3((i % 10) * 0.5, 1 + Math.floor(i / 10) * 0.5, -20));
      m.thinInstanceAdd(mat, i === N - 1);
    }
    const s0 = snapshot();
    const b = new PhysicsBody(m, PhysicsMotionType.DYNAMIC, false, scene);
    b.shape = unit(0.15); // shape must already include the instance scale (0.3 * 0.5)
    const s1 = snapshot();
    b.setLinearVelocity(new Vector3(0, 5, 0), 3); // per-instance
    b.applyImpulse(new Vector3(0, 0, 10), new Vector3(0, 1, -20), 4);
    stepN(scene, 2);
    const vel3 = v3(b.getLinearVelocity(3)), vel4 = v3(b.getLinearVelocity(4)), vel5 = v3(b.getLinearVelocity(5));
    stepN(scene, 120);
    const mdata = m.thinInstanceGetWorldMatrices();
    const scaleAfterSync = r3(new Vector3(mdata[0].m[0], mdata[0].m[1], mdata[0].m[2]).length());
    // add instances later
    m.thinInstanceAdd(Matrix.Compose(new Vector3(0.5, 0.5, 0.5), Quaternion.Identity(), new Vector3(0, 5, -20)));
    b.updateBodyInstances();
    const afterAdd = { numInstances: b.numInstances, hkBodies: snapshot().bodies - s0.bodies };
    stepN(scene, 60);
    const md = (m as unknown as { _thinInstanceDataStorage: { matrixData: Float32Array } })._thinInstanceDataStorage.matrixData;
    const newInstanceY = { fromMatrixData: r3(md[N * 16 + 13]), fromCachedGetWorldMatrices_stale: r3(m.thinInstanceGetWorldMatrices()[N].m[13]), fromHavok: r3(hk.HP_Body_GetQTransform(b._pluginDataInstances[N].hpBodyId)[1][0][1]) };
    // remove (only from the end)
    m.thinInstanceCount = N - 10;
    b.updateBodyInstances();
    const afterRemove = { numInstances: b.numInstances, hkBodies: snapshot().bodies - s0.bodies };
    // per-instance motion type / mass
    b.setMotionType(PhysicsMotionType.STATIC, 0);
    b.setMassProperties({ mass: 5 }, 1);
    // per-instance collision observable index
    let instanceEvents = 0, sampleIndex = -1;
    b.setCollisionCallbackEnabled(true);
    const o = plugin.onCollisionObservable.add((ev) => { if (ev.collider === b || ev.collidedAgainst === b) { instanceEvents++; sampleIndex = ev.collider === b ? ev.colliderIndex : ev.collidedAgainstIndex; } });
    b.applyImpulse(new Vector3(0, 30, 0), new Vector3(0, 0, -20), 7);
    stepN(scene, 60);
    plugin.onCollisionObservable.remove(o);
    const perInstance = { motionType0: b.getMotionType(0), motionType2: b.getMotionType(2), mass1: r3(b.getMassProperties(1).mass!), mass2: r3(b.getMassProperties(2).mass!) };
    // dispose
    const tDisp = performance.now();
    m.dispose();
    const dispMs = performance.now() - tDisp;
    out.q9_thinInstances = {
      hkBodiesCreatedFor50: s1.bodies - s0.bodies, numInstances: s1.bodies - s0.bodies,
      perInstanceVel: { vel3, vel4, vel5 }, instanceScaleAfterSync_was05: scaleAfterSync,
      afterAdd, newInstanceFellToY: newInstanceY, afterRemove,
      perInstance,
      instanceEvents, sampleIndex, disposeMs: r3(dispMs), afterMeshDispose: { bodiesDelta: snapshot().bodies - s0.bodies, bodyDisposed: b.isDisposed },
    };
  }
  void HavokPlugin;
  return out;
}
