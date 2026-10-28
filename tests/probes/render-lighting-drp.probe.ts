// Probe: DefaultRenderingPipeline.imageProcessing object lifetime across rebuilds and where its settings live.
import { Vector3, FreeCamera, MeshBuilder, DefaultRenderingPipeline, ImageProcessingConfiguration } from "@babylonjs/core";
import { makeEngine, renderFrames } from "./render-lighting-util.ts";

export async function probe(): Promise<any> {
  const { engine, scene } = makeEngine();
  const cam = new FreeCamera("c", new Vector3(0, 1, -4), scene);
  cam.setTarget(Vector3.Zero());
  MeshBuilder.CreateBox("b", {}, scene);
  const drp = new DefaultRenderingPipeline("drp", true, scene, [cam]);
  const ip1 = drp.imageProcessing;
  ip1.toneMappingEnabled = true;
  ip1.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip1.exposure = 1.3;
  drp.fxaaEnabled = true; // triggers a rebuild
  const ip2 = drp.imageProcessing;
  await scene.whenReadyAsync();
  await renderFrames(scene, 2);
  const cfg = scene.imageProcessingConfiguration;
  return {
    sameObjectAfterRebuild: ip1 === ip2,
    oldObjectDisposedEffect: ip1.getEffect() === null || ip1.getEffect() === undefined,
    sceneConfig: { toneMappingEnabled: cfg.toneMappingEnabled, toneMappingType: cfg.toneMappingType, exposure: cfg.exposure },
    newPPReads: { toneMappingEnabled: ip2.toneMappingEnabled, exposure: ip2.exposure },
    ipUsesSceneConfig: ip2.imageProcessingConfiguration === cfg,
    engineName: engine.name,
  };
}
