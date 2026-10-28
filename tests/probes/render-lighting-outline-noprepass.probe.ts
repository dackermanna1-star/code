// Probe: renderOutline / renderOverlay without SSAO2 (no prepass) for comparison.
import { Color3 } from "@babylonjs/core";
import { makeEngine, renderFrames, captureCanvas, readAll, lumAt, toScreen } from "./render-lighting-util.ts";
import { buildShowcase } from "./render-lighting-scene.ts";

export async function probe(): Promise<any> {
  const { engine, scene } = makeEngine();
  const s = buildShowcase(scene, engine, { ssao: false });
  const red = s.room.props.find((m) => m.name === "crate2")!;
  const blue = s.room.props.find((m) => m.name === "crate1")!;
  await scene.whenReadyAsync();
  await renderFrames(scene, 4);
  const centreBlue = toScreen(scene, s.camera, blue.getBoundingInfo().boundingBox.centerWorld);
  let fb = await readAll(engine);
  const before = { blueCentre: Math.round(lumAt(fb, centreBlue.x, centreBlue.y, 2)), dc: s.si.drawCallsCounter.current };
  red.renderOutline = true;
  red.outlineColor = new Color3(1, 0.85, 0.2);
  red.outlineWidth = 0.03;
  blue.renderOverlay = true;
  blue.overlayColor = new Color3(1, 0.9, 0.3);
  blue.overlayAlpha = 0.35;
  await scene.whenReadyAsync();
  await renderFrames(scene, 4);
  fb = await readAll(engine);
  const after = { blueCentre: Math.round(lumAt(fb, centreBlue.x, centreBlue.y, 2)), dc: s.si.drawCallsCounter.current };
  return { png: captureCanvas(engine, 800, 0.7), before, after };
}
