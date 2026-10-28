// Probe: misc verifications — physics time instrumentation, SSAO runtime toggle & chain order, MSAA with/without
// SSAO prepass, GlowLayer + prepass compatibility, fog, light includedOnlyMeshes.
import {
  Vector3, Color3, Color4, FreeCamera, HemisphericLight, PointLight, MeshBuilder, StandardMaterial, PBRMaterial,
  DefaultRenderingPipeline, SSAO2RenderingPipeline, SceneInstrumentation, GlowLayer, HavokPlugin, PhysicsAggregate,
  PhysicsShapeType, Scene, Constants, Engine,
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { makeEngine, renderFrames, readAll, lumAt, toScreen } from "./render-lighting-util.ts";
import { createPs2PostProcess, keepLast, chainNames } from "./render-lighting-scene.ts";

function edgeAA(fb: { data: Uint8Array; w: number; h: number }): number {
  // count pixels with intermediate luminance in a band around the box silhouette
  let n = 0;
  for (let y = 150; y < 570; y += 1) {
    for (let x = 340; x < 940; x += 3) {
      const l = lumAt(fb, x, y, 0);
      if (l > 25 && l < 230) n++;
    }
  }
  return n;
}

export async function probe(): Promise<any> {
  const out: any = {};
  // ---------------------------------------------------------------- 1) physics time instrumentation
  {
    const { engine, scene } = makeEngine();
    new FreeCamera("c", new Vector3(0, 2, -6), scene);
    const si = new SceneInstrumentation(scene);
    si.capturePhysicsTime = true; // before enablePhysics -> silently refused
    const before = si.capturePhysicsTime;
    const hk = await HavokPhysics({ locateFile: () => havokWasmUrl });
    scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, hk));
    si.capturePhysicsTime = true; // after enablePhysics -> works
    const ground = MeshBuilder.CreateBox("g", { width: 10, height: 0.2, depth: 10 }, scene);
    new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);
    for (let i = 0; i < 50; i++) {
      const b = MeshBuilder.CreateBox("b" + i, { size: 0.3 }, scene);
      b.position.set((i % 7) - 3, 1 + Math.floor(i / 7) * 0.4, 0);
      new PhysicsAggregate(b, PhysicsShapeType.BOX, { mass: 1 }, scene);
    }
    scene.physicsEnabled = false; // FixedStepper style: step manually through the scene so observables fire
    for (let i = 0; i < 30; i++) { scene._advancePhysicsEngineStep(1000 / 60); scene.render(); }
    out.physicsTime = { capturePhysicsTimeBeforeEnable: before, after: si.capturePhysicsTime, avgMs: +si.physicsTimeCounter.average.toFixed(3), count: si.physicsTimeCounter.count, lastSecAvg: si.physicsTimeCounter.lastSecAverage };
    scene.dispose();
    engine.dispose();
  }

  // ---------------------------------------------------------------- 2) SSAO toggle & order; 3) MSAA
  const { engine, scene } = makeEngine();
  scene.clearColor = new Color4(0, 0, 0, 1);
  const cam = new FreeCamera("cam", new Vector3(0, 0, -5), scene);
  cam.setTarget(Vector3.Zero());
  const box = MeshBuilder.CreateBox("box", { size: 2 }, scene);
  box.rotation.z = 0.17;
  box.rotation.y = 0.3;
  const bm = new StandardMaterial("bm", scene);
  bm.disableLighting = true;
  bm.emissiveColor = Color3.White();
  box.material = bm;
  new HemisphericLight("h", new Vector3(0, 1, 0), scene).intensity = 0.5;

  const drp = new DefaultRenderingPipeline("drp", true, scene, [cam]);
  drp.imageProcessingEnabled = true;
  async function aa(label: string): Promise<any> {
    await scene.whenReadyAsync();
    await renderFrames(scene, 3);
    const fb = await readAll(engine);
    return { label, intermediatePixels: edgeAA(fb) };
  }
  out.msaa = [];
  out.msaa.push(await aa("DRP samples=1"));
  drp.samples = 4;
  out.msaa.push(await aa("DRP samples=4"));
  drp.samples = 1;
  drp.fxaaEnabled = true;
  out.msaa.push(await aa("DRP fxaa"));
  drp.fxaaEnabled = false;
  drp.dispose();

  // SSAO first, then DRP (correct order)
  const ssao = new SSAO2RenderingPipeline("ssao", scene, 1.0, [cam], false, Constants.TEXTURETYPE_HALF_FLOAT);
  ssao.totalStrength = 0.0001; // isolate AA measurement
  const drp2 = new DefaultRenderingPipeline("drp2", true, scene, [cam]);
  out.msaa.push(await aa("SSAO + DRP samples=1"));
  drp2.samples = 4;
  out.msaa.push(await aa("SSAO + DRP samples=4 (MSAA on DRP's first PP: no effect expected)"));
  drp2.samples = 1;
  ssao.textureSamples = 4;
  out.msaa.push(await aa("SSAO textureSamples=4 (prepass MSAA)"));
  out.prePassSamples = scene.prePassRenderer?.samples;
  ssao.textureSamples = 1;

  // toggle SSAO at runtime
  const ps2 = createPs2PostProcess(cam, engine);
  drp2.onBuildObservable.add(() => keepLast(cam, ps2));
  const compact = () => chainNames(cam).filter((n) => n !== "null");
  out.toggle = { initial: compact() };
  scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline("ssao", cam);
  await renderFrames(scene, 2);
  out.toggle.afterDetach = compact();
  out.toggle.prePassEnabledAfterDetach = scene.prePassRenderer?.enabled;
  scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssao", cam);
  out.toggle.afterReattach = compact();
  drp2.prepare(); // rebuild -> DRP effects re-appended after SSAO; hook moves ps2 last
  out.toggle.afterPrepare = compact();
  await renderFrames(scene, 2);
  out.toggle.prePassEnabledAfterReattach = scene.prePassRenderer?.enabled;

  // ---------------------------------------------------------------- 4) GlowLayer with SSAO prepass active
  const glowMesh = MeshBuilder.CreatePlane("glowQuad", { size: 0.6 }, scene);
  glowMesh.position.set(2.2, 1.2, 0);
  const gm = new StandardMaterial("gm", scene);
  gm.disableLighting = true;
  gm.emissiveColor = new Color3(0.2, 0.6, 1);
  glowMesh.material = gm;
  await renderFrames(scene, 3);
  const pNear = toScreen(scene, cam, new Vector3(2.2, 1.2 + 0.45, 0));
  let fb = await readAll(engine);
  const lumNoGlow = Math.round(lumAt(fb, pNear.x, pNear.y, 1));
  const glow = new GlowLayer("glow", scene, { blurKernelSize: 64, mainTextureRatio: 0.5 });
  glow.intensity = 1.5;
  glow.addIncludedOnlyMesh(glowMesh);
  await scene.whenReadyAsync();
  await renderFrames(scene, 4);
  fb = await readAll(engine);
  out.glowWithPrepass = { lumAboveQuadNoGlow: lumNoGlow, lumAboveQuadWithGlow: Math.round(lumAt(fb, pNear.x, pNear.y, 1)) };
  glow.dispose();

  // ---------------------------------------------------------------- 5) fog
  {
    const s2 = new Scene(engine);
    s2.clearColor = new Color4(0, 0, 0, 1);
    const c2 = new FreeCamera("c2", new Vector3(0, 0, -5), s2);
    c2.setTarget(Vector3.Zero());
    c2.maxZ = 500;
    new HemisphericLight("h2", new Vector3(0, 0, -1), s2).intensity = 1;
    const far = MeshBuilder.CreateBox("far", { size: 10 }, s2);
    far.position.z = 60;
    const pm = new PBRMaterial("pm", s2);
    pm.albedoColor = new Color3(0.2, 0.2, 0.8);
    pm.metallic = 0;
    pm.roughness = 1;
    far.material = pm;
    const sample = async () => { await s2.whenReadyAsync(); for (let i = 0; i < 3; i++) s2.render(); const f = await readAll(engine); const i = ((f.h - 1 - 360) * f.w + 640) * 4; return [f.data[i], f.data[i + 1], f.data[i + 2]]; };
    const noFog = await sample();
    s2.fogMode = Scene.FOGMODE_EXP2;
    s2.fogDensity = 0.02;
    s2.fogColor = new Color3(0.9, 0.6, 0.4);
    const exp2 = await sample();
    s2.fogMode = Scene.FOGMODE_LINEAR;
    s2.fogStart = 10;
    s2.fogEnd = 80;
    const linear = await sample();
    pm.fogEnabled = false;
    const matFogOff = await sample();
    out.fog = { noFog, exp2_0_02: exp2, linear_10_80: linear, materialFogEnabledFalse: matFogOff };
    s2.dispose();
  }

  // ---------------------------------------------------------------- 6) includedOnlyMeshes
  {
    const s3 = new Scene(engine);
    const c3 = new FreeCamera("c3", new Vector3(0, 0, -5), s3);
    c3.setTarget(Vector3.Zero());
    const a = MeshBuilder.CreateBox("a", { size: 1 }, s3);
    a.position.x = -1;
    const b = MeshBuilder.CreateBox("b", { size: 1 }, s3);
    b.position.x = 1;
    const p = new PointLight("p", new Vector3(0, 0, -3), s3);
    p.includedOnlyMeshes.push(a);
    out.includedOnly = { aLights: a.lightSources.map((l) => l.name), bLights: b.lightSources.map((l) => l.name) };
    p.includedOnlyMeshes = [];
    out.includedOnly.afterClear = { aLights: a.lightSources.map((l) => l.name), bLights: b.lightSources.map((l) => l.name) };
    p.excludedMeshes.push(b);
    out.includedOnly.excludedB = { aLights: a.lightSources.map((l) => l.name), bLights: b.lightSources.map((l) => l.name) };
    s3.dispose();
  }
  void Engine;
  return out;
}
