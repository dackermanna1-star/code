// Probe: CPU cost of scene.render() with 2000 small unique meshes (48 verts) sharing the PBR world material,
// under various per-mesh / scene optimisation flags. Timings are CPU-side (SwiftShader: GPU cost meaningless).
import {
  Engine, Scene, Vector3, Color4, FreeCamera, HemisphericLight, DirectionalLight, Mesh, VertexData, PBRMaterial,
  SceneInstrumentation, ScenePerformancePriority, type PerfCounter,
} from "@babylonjs/core";
import { WorldMaterialPlugin, createTextureArray } from "./render-materials-worldmat.ts";
import { makeAlbedoLayers, makeNormalLayers, GeomBuilder, TEX } from "./render-materials-proctex.ts";

const COUNT = 2000;

function median(a: number[]) {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.4, 0.5, 0.6, 1);
  const cam = new FreeCamera("cam", new Vector3(0, 18, -16), scene);
  cam.setTarget(new Vector3(0, 0, 4));
  new HemisphericLight("h", new Vector3(0, 1, 0), scene).intensity = 0.5;
  const sun = new DirectionalLight("sun", new Vector3(-0.3, -1, 0.4), scene);
  sun.intensity = 2;
  const albedo = createTextureArray(scene, makeAlbedoLayers(), TEX);
  const normal = createTextureArray(scene, makeNormalLayers(), TEX);
  const mat = new PBRMaterial("world", scene);
  mat.metallic = 0;
  mat.roughness = 1;
  new WorldMaterialPlugin(mat).setTextures(albedo, normal);

  const g = new GeomBuilder();
  const surf = (layer: number) => ({ layer, normalLayer: 0, rough: 0.7, emissive: 0, tint: [1, 1, 1] as [number, number, number], metal: 0, worldSize: 0.5 });
  g.box([0, 0.15, 0], [0.15, 0.15, 0.15], () => surf(2));
  g.box([0, 0.38, 0], [0.08, 0.08, 0.08], () => surf(1));
  const meshes: Mesh[] = [];
  const tCreate0 = performance.now();
  for (let i = 0; i < COUNT; i++) {
    const m = new Mesh("m" + i, scene);
    const vd = new VertexData();
    vd.positions = g.positions;
    vd.normals = g.normals;
    vd.uvs = g.uvs;
    vd.colors = g.colors;
    vd.indices = g.indices;
    vd.applyToMesh(m);
    m.setVerticesData("surf", g.surf, false, 4);
    m.material = mat;
    m.position.set((i % 50) * 0.6 - 15, 0, Math.floor(i / 50) * 0.6 - 8);
    m.rotation.y = i * 0.3;
    meshes.push(m);
  }
  const msCreate = performance.now() - tCreate0;
  await scene.whenReadyAsync();

  const inst = new SceneInstrumentation(scene);
  inst.captureActiveMeshesEvaluationTime = true;
  inst.captureRenderTime = true;
  inst.captureFrameTime = true;
  const snap = (c: PerfCounter) => ({ t: c.total, n: c.count });
  const delta = (a: { t: number; n: number }, c: PerfCounter) => (c.count > a.n ? (c.total - a.t) / (c.count - a.n) : 0);

  const measure = async (label: string, perFrame?: (f: number) => void) => {
    for (let i = 0; i < 8; i++) { perFrame?.(i); scene.render(); }
    const rounds: number[] = [];
    let eval0 = snap(inst.activeMeshesEvaluationTimeCounter), rend0 = snap(inst.renderTimeCounter);
    for (let r = 0; r < 3; r++) {
      const t0 = performance.now();
      for (let i = 0; i < 25; i++) { perFrame?.(i); scene.render(); }
      rounds.push((performance.now() - t0) / 25);
      await new Promise((res) => setTimeout(res, 0));
    }
    return {
      label,
      msFrameMin: +Math.min(...rounds).toFixed(2),
      msFrameMedian: +median(rounds).toFixed(2),
      msActiveMeshEval: +delta(eval0, inst.activeMeshesEvaluationTimeCounter).toFixed(2),
      msRenderMeshes: +delta(rend0, inst.renderTimeCounter).toFixed(2),
      drawCalls: inst.drawCallsCounter.current,
      activeMeshes: scene.getActiveMeshes().length,
    };
  };
  const results: unknown[] = [];
  const reset = () => {
    scene.unfreezeActiveMeshes();
    scene.blockMaterialDirtyMechanism = false;
    mat.unfreeze();
    scene.performancePriority = ScenePerformancePriority.BackwardCompatible;
    scene.skipFrustumClipping = false;
    for (const m of meshes) {
      m.unfreezeWorldMatrix();
      m.isPickable = true;
      m.doNotSyncBoundingInfo = false;
      m.alwaysSelectAsActiveMesh = false;
    }
  };

  results.push(await measure("baseline (defaults)"));
  for (const m of meshes) m.freezeWorldMatrix();
  results.push(await measure("freezeWorldMatrix() all"));
  reset();
  mat.freeze();
  results.push(await measure("material.freeze()"));
  reset();
  for (const m of meshes) m.isPickable = false;
  results.push(await measure("isPickable=false"));
  reset();
  for (const m of meshes) m.doNotSyncBoundingInfo = true;
  results.push(await measure("doNotSyncBoundingInfo=true"));
  reset();
  for (const m of meshes) m.alwaysSelectAsActiveMesh = true;
  results.push(await measure("alwaysSelectAsActiveMesh=true"));
  reset();
  scene.skipFrustumClipping = true;
  results.push(await measure("scene.skipFrustumClipping=true"));
  reset();
  scene.blockMaterialDirtyMechanism = true;
  results.push(await measure("scene.blockMaterialDirtyMechanism=true"));
  reset();
  scene.skipPointerMovePicking = true;
  results.push(await measure("scene.skipPointerMovePicking=true (no pointer events in probe)"));
  scene.skipPointerMovePicking = false;
  reset();
  scene.performancePriority = ScenePerformancePriority.Aggressive;
  results.push(await measure("performancePriority=Aggressive (set after mesh creation)"));
  reset();
  await new Promise<void>((res, rej) => scene.freezeActiveMeshes(false, () => res(), (m) => rej(new Error(m))));
  results.push(await measure("scene.freezeActiveMeshes()"));
  reset();

  // combined static settings
  const combine = () => {
    mat.freeze();
    scene.blockMaterialDirtyMechanism = true;
    for (const m of meshes) {
      m.freezeWorldMatrix();
      m.isPickable = false;
      m.doNotSyncBoundingInfo = true;
    }
  };
  combine();
  results.push(await measure("COMBINED: freezeWorldMatrix+material.freeze+isPickable=false+doNotSyncBoundingInfo+blockMaterialDirty"));
  await new Promise<void>((res, rej) => scene.freezeActiveMeshes(false, () => res(), (m) => rej(new Error(m))));
  results.push(await measure("COMBINED + freezeActiveMeshes()"));
  scene.unfreezeActiveMeshes();

  // dynamic mix: 200 of 2000 move every frame (their world matrices unfrozen), rest frozen
  const movers = meshes.slice(0, 200);
  for (const m of movers) m.unfreezeWorldMatrix();
  results.push(await measure("COMBINED, 200 moving each frame", (f) => {
    for (let i = 0; i < movers.length; i++) movers[i].position.y = Math.abs(Math.sin(f * 0.2 + i)) * 0.3;
  }));
  // what a moving mesh costs if it keeps doNotSyncBoundingInfo=true: bounding box does not follow (culling/picking stale)
  reset();
  results.push(await measure("baseline again (noise check)"));

  // batching reference: merge all 2000 into 1 mesh (custom 'surf' attribute check)
  const tMerge0 = performance.now();
  const merged = Mesh.MergeMeshes(meshes, true, true);
  const msMerge = performance.now() - tMerge0;
  let mergedInfo: unknown = null;
  if (merged) {
    merged.material = mat;
    mergedInfo = { vertices: merged.getTotalVertices(), hasSurf: merged.isVerticesDataPresent("surf"), msMerge: +msMerge.toFixed(1) };
    await scene.whenReadyAsync().catch(() => undefined);
    results.push(await measure("MergeMeshes -> 1 mesh (surf dropped!)"));
  }
  engine.runRenderLoop(() => scene.render());
  return { msCreate2000: +msCreate.toFixed(1), mergedInfo, results };
}
