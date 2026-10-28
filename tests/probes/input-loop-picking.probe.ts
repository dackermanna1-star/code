// Picking cost: scene.pickWithRay (CPU triangle tests over scene.meshes) vs Havok raycast (BVH),
// plus agreement between the two and the default pointer-picking behaviour of the scene input manager.
import {
  Vector3, MeshBuilder, PhysicsAggregate, PhysicsShapeType, Ray, PhysicsRaycastResult, type AbstractMesh,
} from "@babylonjs/core";
import { makeWorld, freshCanvas, r } from "./input-loop-util.ts";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export async function probe() {
  const out: Record<string, unknown> = {};
  for (const N of [100, 400, 1200]) {
    const w = await makeWorld({ canvas: freshCanvas() });
    w.scene.physicsEnabled = false;
    const rand = rng(42);
    const meshes: AbstractMesh[] = [];
    let tris = 0;
    for (let i = 0; i < N; i++) {
      const sphere = i % 3 === 0;
      const m = sphere
        ? MeshBuilder.CreateSphere("s" + i, { diameter: 0.4 + rand() * 0.4, segments: 12 }, w.scene)
        : MeshBuilder.CreateBox("b" + i, { size: 0.3 + rand() * 0.5 }, w.scene);
      m.position.set((rand() - 0.5) * 24, rand() * 3, (rand() - 0.5) * 24);
      m.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      tris += m.getTotalIndices() / 3;
      new PhysicsAggregate(m, sphere ? PhysicsShapeType.SPHERE : PhysicsShapeType.BOX, { mass: 0 }, w.scene);
      meshes.push(m);
    }
    w.scene.render(); // world matrices / bounding info
    const phys = w.scene.getPhysicsEngine()!;
    const rays: Array<{ o: Vector3; d: Vector3 }> = [];
    const rr = rng(7);
    for (let i = 0; i < 1000; i++) {
      const o = new Vector3((rr() - 0.5) * 20, 0.5 + rr() * 2, (rr() - 0.5) * 20);
      const d = new Vector3(rr() - 0.5, (rr() - 0.5) * 0.3, rr() - 0.5).normalize();
      rays.push({ o, d });
    }
    const L = 6;
    const ray = new Ray(Vector3.Zero(), Vector3.Forward(), L);
    const pred = (m: AbstractMesh) => m.isPickable && m.isEnabled();
    // warm-up
    for (let i = 0; i < 50; i++) {
      ray.origin.copyFrom(rays[i].o);
      ray.direction.copyFrom(rays[i].d);
      w.scene.pickWithRay(ray, pred);
    }
    const sceneHits: Array<string | null> = [];
    let t0 = performance.now();
    for (const q of rays) {
      ray.origin.copyFrom(q.o);
      ray.direction.copyFrom(q.d);
      const pi = w.scene.pickWithRay(ray, pred);
      sceneHits.push(pi?.hit ? pi.pickedMesh!.name : null);
    }
    const tScene = (performance.now() - t0) / rays.length;
    t0 = performance.now();
    for (const q of rays) {
      ray.origin.copyFrom(q.o);
      ray.direction.copyFrom(q.d);
      w.scene.pickWithRay(ray, pred, true);
    }
    const tSceneFast = (performance.now() - t0) / rays.length;
    const res = new PhysicsRaycastResult();
    const to = new Vector3();
    const physHits: Array<string | null> = [];
    for (let i = 0; i < 50; i++) phys.raycast(rays[i].o, rays[i].o.add(rays[i].d.scale(L)));
    t0 = performance.now();
    for (const q of rays) {
      q.o.addToRef(q.d.scale(L), to);
      (phys as unknown as { raycastToRef: (a: Vector3, b: Vector3, r: PhysicsRaycastResult) => void }).raycastToRef(q.o, to, res);
      physHits.push(res.hasHit ? (res.body?.transformNode.name ?? "?") : null);
    }
    const tPhys = (performance.now() - t0) / rays.length;
    let agree = 0, bothHit = 0, sceneOnly = 0, physOnly = 0;
    for (let i = 0; i < rays.length; i++) {
      if (sceneHits[i] === physHits[i]) agree++;
      if (sceneHits[i] && physHits[i]) bothHit++;
      else if (sceneHits[i]) sceneOnly++;
      else if (physHits[i]) physOnly++;
    }
    out["N" + N] = {
      meshes: N,
      totalTriangles: tris,
      scenePickWithRay_us: r(tScene * 1000, 1),
      scenePickWithRay_fastCheck_us: r(tSceneFast * 1000, 1),
      havokRaycast_us: r(tPhys * 1000, 1),
      hitAgreementPct: r((agree / rays.length) * 100, 1),
      bothHit,
      sceneOnly,
      physOnly,
    };
    if (N === 400) {
      // screen-centre pick through the camera (crosshair)
      const W = w.engine.getRenderWidth(), H = w.engine.getRenderHeight();
      t0 = performance.now();
      for (let i = 0; i < 200; i++) w.scene.pick(W / 2, H / 2, pred);
      out.scenePick_screenCentre_us_N400 = r(((performance.now() - t0) / 200) * 1000, 1);
      out.pointerPickingDefaults = {
        skipPointerMovePicking: w.scene.skipPointerMovePicking,
        skipPointerDownPicking: w.scene.skipPointerDownPicking,
        skipPointerUpPicking: w.scene.skipPointerUpPicking,
        constantlyUpdateMeshUnderPointer: w.scene.constantlyUpdateMeshUnderPointer,
      };
    }
    w.engine.dispose();
  }
  // ray starting INSIDE a shape: scene pick vs Havok raycast
  {
    const w = await makeWorld({ canvas: freshCanvas() });
    const box = MeshBuilder.CreateBox("inner", { size: 1 }, w.scene);
    new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 0 }, w.scene);
    const far = MeshBuilder.CreateBox("far", { size: 1 }, w.scene);
    far.position.z = 5;
    new PhysicsAggregate(far, PhysicsShapeType.BOX, { mass: 0 }, w.scene);
    w.scene.render();
    const pi = w.scene.pickWithRay(new Ray(Vector3.Zero(), Vector3.Forward(), 10));
    const pr = w.scene.getPhysicsEngine()!.raycast(Vector3.Zero(), new Vector3(0, 0, 10));
    out.rayFromInsideShape = {
      scenePick: pi?.hit ? { mesh: pi.pickedMesh!.name, distance: r(pi.distance, 3) } : null,
      havok: pr.hasHit ? { body: pr.body?.transformNode.name, distance: r(pr.hitDistance, 3) } : null,
    };
    w.engine.dispose();
  }
  return out;
}
