// Probe: grab-highlight alternatives when SSAO2 is on. Left half of the returned images:
// A) SSAO2 prepass + SelectionOutlineLayer { useDepthOcclusion: false } on the red crate
// B) SSAO2 with forceGeometryBuffer=true (no prepass) + renderOutline on the red crate
import { Color3, SelectionOutlineLayer, SSAO2RenderingPipeline, DefaultRenderingPipeline, Constants, ImageProcessingConfiguration } from "@babylonjs/core";
import { makeEngine, renderFrames, captureCanvas } from "./render-lighting-util.ts";
import { buildShowcase } from "./render-lighting-scene.ts";

export async function probe(): Promise<any> {
  const out: any = { pngs: {} };
  {
    const { engine, scene } = makeEngine();
    const s = buildShowcase(scene, engine, {});
    const red = s.room.props.find((m) => m.name === "crate2")!;
    const sol = new SelectionOutlineLayer("sol", scene, { useDepthOcclusion: false });
    sol.outlineColor = new Color3(1, 0.85, 0.2);
    sol.outlineThickness = 2;
    sol.addSelection(red);
    await scene.whenReadyAsync();
    await renderFrames(scene, 4);
    out.A = { dc: s.si.drawCallsCounter.current, prePass: scene.prePassRenderer?.enabled };
    out.pngs.A = captureCanvas(engine, 640, 0.6);
    scene.dispose();
    engine.dispose();
  }
  {
    const { engine, scene } = makeEngine();
    const s = buildShowcase(scene, engine, { ssao: false, pipeline: false });
    const ssao = new SSAO2RenderingPipeline("ssao", scene, 0.5, [s.camera], true /* forceGeometryBuffer */, Constants.TEXTURETYPE_HALF_FLOAT);
    ssao.radius = 0.6; ssao.totalStrength = 1.2;
    const drp = new DefaultRenderingPipeline("drp", true, scene, [s.camera]);
    drp.bloomEnabled = true; drp.bloomThreshold = 1; drp.fxaaEnabled = true;
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    const red = s.room.props.find((m) => m.name === "crate2")!;
    red.renderOutline = true;
    red.outlineColor = new Color3(1, 0.85, 0.2);
    red.outlineWidth = 0.03;
    await scene.whenReadyAsync();
    await renderFrames(scene, 4);
    out.B = { dc: s.si.drawCallsCounter.current, prePass: !!scene.prePassRenderer?.enabled, gbuffer: !!scene.geometryBufferRenderer };
    out.pngs.B = captureCanvas(engine, 640, 0.6);
  }
  return out;
}
