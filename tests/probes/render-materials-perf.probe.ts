// Probe: CPU cost of scene.render() with 2000 small unique meshes (48 verts) sharing the PBR world material,
// under various per-mesh / scene optimisation flags. CPU-side timings only: tiny render resolution so SwiftShader
// rasterisation is negligible, GPU queue drained (gl.finish) before each timed batch, configs interleaved over
// several rounds and summarised by per-frame min / p25 / median (the box is heavily shared, so min ~ intrinsic).
import {
  Engine, Scene, Vector3, Color4, FreeCamera, HemisphericLight, DirectionalLight, Mesh, VertexData, PBRMaterial,
  SceneInstrumentation, ScenePerformancePriority,
} from "@babylonjs/core";
import { WorldMaterialPlugin, createTextureArray } from "./render-materials-worldmat.ts";
import { makeAlbedoLayers, makeNormalLayers, GeomBuilder, TEX } from "./render-materials-proctex.ts";

const COUNT = 2000;
const ROUNDS = 6;
const FRAMES = 5;

interface Config { name: string; apply: () => void | Promise<void>; unapply: () => void; perFrame?: (f: number) => void }

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  engine.setHardwareScalingLevel(10);
  const gl = (engine as unknown as { _gl: WebGL2RenderingContext })._gl;
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

  const freezeActive = () => new Promise<void>((res, rej) => scene.freezeActiveMeshes(false, () => res(), (m) => rej(new Error(m))));
  const forAll = (f: (m: Mesh) => void) => { for (const m of meshes) f(m); };
  const movers = meshes.slice(0, 200);
  const moveFrame = (f: number) => { for (let i = 0; i < movers.length; i++) movers[i].position.y = Math.abs(Math.sin(f * 0.2 + i)) * 0.3; };
  const combinedOn = () => {
    mat.freeze();
    scene.blockMaterialDirtyMechanism = true;
    forAll((m) => { m.freezeWorldMatrix(); m.isPickable = false; m.doNotSyncBoundingInfo = true; });
  };
  const combinedOff = () => {
    mat.unfreeze();
    scene.blockMaterialDirtyMechanism = false;
    forAll((m) => { m.unfreezeWorldMatrix(); m.isPickable = true; m.doNotSyncBoundingInfo = false; });
  };
  const configs: Config[] = [
    { name: "baseline (defaults)", apply: () => {}, unapply: () => {} },
    { name: "freezeWorldMatrix() on all", apply: () => forAll((m) => m.freezeWorldMatrix()), unapply: () => forAll((m) => m.unfreezeWorldMatrix()) },
    { name: "material.freeze()", apply: () => mat.freeze(), unapply: () => mat.unfreeze() },
    { name: "isPickable=false", apply: () => forAll((m) => (m.isPickable = false)), unapply: () => forAll((m) => (m.isPickable = true)) },
    { name: "doNotSyncBoundingInfo=true", apply: () => forAll((m) => (m.doNotSyncBoundingInfo = true)), unapply: () => forAll((m) => (m.doNotSyncBoundingInfo = false)) },
    { name: "alwaysSelectAsActiveMesh=true", apply: () => forAll((m) => (m.alwaysSelectAsActiveMesh = true)), unapply: () => forAll((m) => (m.alwaysSelectAsActiveMesh = false)) },
    { name: "scene.skipFrustumClipping=true", apply: () => { scene.skipFrustumClipping = true; }, unapply: () => { scene.skipFrustumClipping = false; } },
    { name: "scene.blockMaterialDirtyMechanism=true", apply: () => { scene.blockMaterialDirtyMechanism = true; }, unapply: () => { scene.blockMaterialDirtyMechanism = false; } },
    {
      name: "performancePriority=Aggressive + its creation-time mesh flags",
      apply: () => { scene.performancePriority = ScenePerformancePriority.Aggressive; forAll((m) => { m.alwaysSelectAsActiveMesh = true; m.isPickable = false; m.doNotSyncBoundingInfo = true; }); },
      unapply: () => { scene.performancePriority = ScenePerformancePriority.BackwardCompatible; forAll((m) => { m.alwaysSelectAsActiveMesh = false; m.isPickable = true; m.doNotSyncBoundingInfo = false; }); },
    },
    { name: "scene.freezeActiveMeshes()", apply: freezeActive, unapply: () => scene.unfreezeActiveMeshes() },
    { name: "COMBINED (freezeWorldMatrix+material.freeze+isPickable=false+doNotSyncBoundingInfo+blockMaterialDirty)", apply: combinedOn, unapply: combinedOff },
    { name: "COMBINED + freezeActiveMeshes()", apply: async () => { combinedOn(); await freezeActive(); }, unapply: () => { scene.unfreezeActiveMeshes(); combinedOff(); } },
    { name: "baseline, 200 moving each frame", apply: () => {}, unapply: () => {}, perFrame: moveFrame },
    {
      name: "COMBINED, 200 moving each frame (movers unfrozen, bounding info synced)",
      apply: () => { combinedOn(); for (const m of movers) { m.unfreezeWorldMatrix(); m.doNotSyncBoundingInfo = false; } },
      unapply: combinedOff,
      perFrame: moveFrame,
    },
  ];
  const samples: number[][] = configs.map(() => []);
  const evalSamples: number[][] = configs.map(() => []);
  const T0 = performance.now();
  for (let r = 0; r < ROUNDS; r++) {
    for (let c = 0; c < configs.length; c++) {
      const cfg = configs[c];
      await cfg.apply();
      for (let i = 0; i < 2; i++) { cfg.perFrame?.(i); scene.render(); }
      gl.finish();
      await new Promise((res) => setTimeout(res, 5));
      for (let i = 0; i < FRAMES; i++) {
        cfg.perFrame?.(i + 2);
        const t0 = performance.now();
        scene.render();
        samples[c].push(performance.now() - t0);
        evalSamples[c].push(inst.activeMeshesEvaluationTimeCounter.current);
      }
      cfg.unapply();
      gl.finish();
    }
    console.log(`[perf] round ${r} done at ${((performance.now() - T0) / 1000).toFixed(1)}s`);
  }
  const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2); };
  const results = configs.map((cfg, c) => ({
    config: cfg.name,
    min: pct(samples[c], 0),
    p25: pct(samples[c], 0.25),
    median: pct(samples[c], 0.5),
    evalMin: pct(evalSamples[c], 0),
  }));

  // creation-time effect of performancePriority on NEW meshes
  scene.performancePriority = ScenePerformancePriority.Intermediate;
  const late = new Mesh("late", scene);
  const lateFlags = { isPickable: late.isPickable, alwaysSelectAsActiveMesh: late.alwaysSelectAsActiveMesh, doNotSyncBoundingInfo: late.doNotSyncBoundingInfo, autoClear: scene.autoClear };
  scene.performancePriority = ScenePerformancePriority.BackwardCompatible;
  late.dispose();

  // batching reference: MergeMeshes all 2000 (drops custom 'surf')
  const tMerge0 = performance.now();
  const merged = Mesh.MergeMeshes(meshes, true, true);
  const msMerge = performance.now() - tMerge0;
  let mergedFrame = 0;
  if (merged) {
    merged.material = mat;
    for (let i = 0; i < 3; i++) scene.render();
    gl.finish();
    const ts: number[] = [];
    for (let i = 0; i < 10; i++) { const t0 = performance.now(); scene.render(); ts.push(performance.now() - t0); }
    mergedFrame = Math.min(...ts);
  }
  engine.runRenderLoop(() => scene.render());
  return {
    msCreate2000: +msCreate.toFixed(1),
    results,
    meshCreatedUnderIntermediate: lateFlags,
    merge: { msMerge2000: +msMerge.toFixed(1), vertices: merged?.getTotalVertices(), hasSurf: merged?.isVerticesDataPresent("surf"), msFrameMin: +mergedFrame.toFixed(3) },
  };
}
