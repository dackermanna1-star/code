// Probe: full showcase (no PS2). Screenshot shows the final look.
import { makeEngine, renderFrames } from "./render-lighting-util.ts";
import { buildShowcase, chainNames } from "./render-lighting-scene.ts";

export async function probe(): Promise<any> {
  const { engine, scene } = makeEngine();
  const s = buildShowcase(scene, engine, { ps2: false });
  await scene.whenReadyAsync();
  await renderFrames(scene, 8);
  return {
    chain: chainNames(s.camera),
    drawCalls: s.si.drawCallsCounter.current,
    prePassEnabled: !!scene.prePassRenderer?.enabled,
    prePassSamples: scene.prePassRenderer?.samples,
    applyByPostProcess: scene.imageProcessingConfiguration.applyByPostProcess,
    sceneLights: scene.lights.map((l) => l.name),
    autoClear: scene.autoClear,
  };
}
