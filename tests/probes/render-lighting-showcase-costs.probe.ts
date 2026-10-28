// Probe: draw-call overhead of each feature in the showcase + numeric SSAO effect at a floor/wall corner +
// hardware-scaling numbers for a cheap "PS2 mode" alternative.
import { Vector3 } from "@babylonjs/core";
import { makeEngine, renderFrames, readAll, lumAt, toScreen } from "./render-lighting-util.ts";
import { buildShowcase } from "./render-lighting-scene.ts";

export async function probe(): Promise<any> {
  const out: any = { variants: [] as any[] };
  const variants: [string, any][] = [
    ["full (SSAO2 + DRP + clustered + sun SG)", {}],
    ["no SSAO", { ssao: false }],
    ["no SSAO, no DRP", { ssao: false, pipeline: false }],
    ["full + PS2 PP", { ps2: true }],
  ];
  for (const [label, opts] of variants) {
    const { engine, scene } = makeEngine();
    const s = buildShowcase(scene, engine, opts);
    await scene.whenReadyAsync();
    await renderFrames(scene, 6);
    const corner = toScreen(scene, s.camera, new Vector3(4.97, 0.03, 3.3));
    const open = toScreen(scene, s.camera, new Vector3(3.0, 0.0, 3.3));
    let fb = await readAll(engine);
    const v: any = { label, drawCalls: s.si.drawCallsCounter.current, cornerLum: Math.round(lumAt(fb, corner.x, corner.y, 2)), openFloorLum: Math.round(lumAt(fb, open.x, open.y, 2)) };
    if (s.ssao) {
      s.ssao.totalStrength = 0;
      await renderFrames(scene, 3);
      fb = await readAll(engine);
      v.cornerLumSsaoStrength0 = Math.round(lumAt(fb, corner.x, corner.y, 2));
      v.openFloorLumSsaoStrength0 = Math.round(lumAt(fb, open.x, open.y, 2));
    }
    out.variants.push(v);
    scene.dispose();
    engine.dispose();
  }
  // hardware scaling: render at 448 lines and let CSS upscale with image-rendering: pixelated
  const { engine, scene } = makeEngine();
  const s = buildShowcase(scene, engine, { ps2: false });
  const canvas = engine.getRenderingCanvas()!;
  const level = canvas.clientHeight / 448;
  engine.setHardwareScalingLevel(level);
  canvas.style.imageRendering = "pixelated";
  await scene.whenReadyAsync();
  await renderFrames(scene, 4);
  out.hardwareScaling = { level: +level.toFixed(3), renderSize: [engine.getRenderWidth(), engine.getRenderHeight()], clientSize: [canvas.clientWidth, canvas.clientHeight], bloomKernelAfter: s.drp?.bloomKernel, drawCalls: s.si.drawCallsCounter.current };
  return out;
}
