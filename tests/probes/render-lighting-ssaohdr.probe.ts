// Probe: does SSAO2 with the default textureType (UNSIGNED_BYTE) clamp HDR scene colour before bloom?
import { Vector3, Constants, SSAO2RenderingPipeline, DefaultRenderingPipeline, ImageProcessingConfiguration } from "@babylonjs/core";
import { makeEngine, renderFrames, readAll, lumAt, toScreen } from "./render-lighting-util.ts";
import { buildShowcase } from "./render-lighting-scene.ts";

export async function probe(): Promise<any> {
  const out: any = {};
  for (const [label, tt] of [["ssao textureType default (0=UNSIGNED_BYTE)", 0], ["ssao textureType HALF_FLOAT", Constants.TEXTURETYPE_HALF_FLOAT], ["no ssao", -1]] as [string, number][]) {
    const { engine, scene } = makeEngine();
    const s = buildShowcase(scene, engine, { ssao: false, pipeline: false });
    if (tt >= 0) new SSAO2RenderingPipeline("ssao", scene, 0.5, [s.camera], false, tt);
    const drp = new DefaultRenderingPipeline("drp", true, scene, [s.camera]);
    drp.bloomEnabled = true;
    drp.bloomThreshold = 1.0;
    drp.bloomWeight = 0.35;
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    await scene.whenReadyAsync();
    await renderFrames(scene, 6);
    const fb = await readAll(engine);
    // halo just above the TV quad (tv centre (4.98,1.3,2.4), height 0.5) and the TV itself
    const halo = toScreen(scene, s.camera, new Vector3(4.97, 1.3 + 0.36, 2.4));
    const tv = toScreen(scene, s.camera, new Vector3(4.97, 1.3, 2.4));
    out[label] = { haloLum: Math.round(lumAt(fb, halo.x, halo.y, 2)), tvLum: Math.round(lumAt(fb, tv.x, tv.y, 2)) };
    scene.dispose();
    engine.dispose();
  }
  return out;
}
