// Probe: draw-call cost of shadow types and effect layers / outlines / VLS in the test room.
import {
  Vector3, Color3, FreeCamera, HemisphericLight, PointLight, SpotLight, ShadowGenerator, SceneInstrumentation,
  MeshBuilder, StandardMaterial, GlowLayer, HighlightLayer, SelectionOutlineLayer, VolumetricLightScatteringPostProcess,
  Texture, type Mesh,
} from "@babylonjs/core";
import { makeEngine, renderFrames, now } from "./render-lighting-util.ts";
import { buildRoom, makeSun } from "./render-lighting-room.ts";

export async function probe(): Promise<any> {
  const { engine, scene } = makeEngine();
  const cam = new FreeCamera("cam", new Vector3(0.5, 1.6, 3.6), scene);
  cam.setTarget(new Vector3(3, 0.8, 0.8));
  cam.minZ = 0.05;
  cam.maxZ = 200;
  const si = new SceneInstrumentation(scene);
  si.captureRenderTargetsRenderTime = true;
  const room = buildRoom(scene);
  for (const m of room.meshes) m.receiveShadows = true;
  const sun = makeSun(scene);
  sun.intensity = 3;
  new HemisphericLight("hemi", new Vector3(0, 1, 0), scene).intensity = 0.3;
  // emissive "TV screen" quad
  const screen = MeshBuilder.CreatePlane("screen", { width: 0.8, height: 0.45 }, scene);
  screen.position.set(4.95, 1.2, 2.0);
  screen.rotation.y = Math.PI / 2;
  const sm = new StandardMaterial("screenMat", scene);
  sm.emissiveColor = new Color3(0.4, 0.7, 1.0);
  sm.disableLighting = true;
  screen.material = sm;

  const out: any = { meshes: scene.meshes.length, steps: [] as any[] };
  async function step(label: string): Promise<void> {
    await scene.whenReadyAsync();
    await renderFrames(scene, 4);
    const t0 = now();
    for (let i = 0; i < 5; i++) scene.render();
    out.steps.push({ label, drawCalls: si.drawCallsCounter.current, activeMeshes: scene.getActiveMeshes().length, rtts: (scene as any)._renderTargets?.length, swiftMs: +((now() - t0) / 5).toFixed(1) });
  }
  await step("baseline (no shadows)");

  const sunSg = new ShadowGenerator(2048, sun);
  for (const m of room.casters) sunSg.addShadowCaster(m);
  sunSg.usePercentageCloserFiltering = true;
  await step("+ sun ShadowGenerator (14 casters)");

  const pl = new PointLight("bulb", new Vector3(2.5, 2.6, 2), scene);
  pl.intensity = 2;
  const pSg = new ShadowGenerator(512, pl);
  for (const m of room.casters) pSg.addShadowCaster(m);
  pSg.usePoissonSampling = true;
  await step("+ point light cube ShadowGenerator 512");
  out.pointShadowMapIsCube = pSg.getShadowMap()!.isCube;
  pSg.getShadowMap()!.refreshRate = 0;
  await step("point shadow refreshRate=0 (render once)");
  pSg.dispose();
  pl.dispose();

  const spot = new SpotLight("spot", new Vector3(2.5, 2.9, 2), new Vector3(0, -1, 0), Math.PI / 2, 2, scene);
  const spSg = new ShadowGenerator(1024, spot);
  for (const m of room.casters) spSg.addShadowCaster(m);
  spSg.usePercentageCloserFiltering = true;
  await step("+ spot ShadowGenerator 1024 (PCF)");
  spSg.dispose();
  spot.dispose();

  const glow = new GlowLayer("glow", scene, { mainTextureRatio: 0.5, blurKernelSize: 32 });
  glow.intensity = 0.8;
  await step("+ GlowLayer (all meshes)");
  glow.addIncludedOnlyMesh(screen as Mesh);
  await step("GlowLayer includedOnly [screen]");
  glow.dispose();

  const hl = new HighlightLayer("hl", scene);
  hl.addMesh(room.props[0], Color3.Yellow());
  await step("+ HighlightLayer (1 mesh)");
  hl.dispose();

  const prop = room.props[1];
  prop.renderOutline = true;
  prop.outlineColor = Color3.Yellow();
  prop.outlineWidth = 0.02;
  await step("+ renderOutline on 1 mesh");
  prop.renderOutline = false;
  prop.renderOverlay = true;
  prop.overlayColor = new Color3(1, 0.9, 0.3);
  prop.overlayAlpha = 0.25;
  await step("+ renderOverlay on 1 mesh");
  prop.renderOverlay = false;

  const sol = new SelectionOutlineLayer("sol", scene);
  sol.addSelection(room.props[0]);
  await step("+ SelectionOutlineLayer (1 mesh)");
  sol.dispose();

  const sunDisc = MeshBuilder.CreatePlane("sunDisc", { size: 3 }, scene);
  const sdm = new StandardMaterial("sunDiscMat", scene);
  sdm.emissiveColor = new Color3(1, 0.85, 0.6);
  sdm.disableLighting = true;
  sunDisc.material = sdm;
  sunDisc.position = new Vector3(2.5, 1.5, 2).subtract(sun.direction.scale(40));
  sunDisc.billboardMode = 7;
  const vls = new VolumetricLightScatteringPostProcess("vls", 0.5, cam, sunDisc, 64, Texture.BILINEAR_SAMPLINGMODE, engine, false, scene);
  vls.exposure = 0.25;
  await step("+ VolumetricLightScatteringPostProcess (ratio .5, 64 samples)");
  out.vlsPassRenderList = vls.getPass().renderList?.length ?? "null (all meshes)";
  vls.dispose(cam);
  return out;
}
