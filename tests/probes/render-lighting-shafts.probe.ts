// Probe: showcase + fake additive light-shaft prism from the window along the sun direction.
import { Vector3 } from "@babylonjs/core";
import { makeEngine, renderFrames, captureCanvas } from "./render-lighting-util.ts";
import { buildShowcase, createLightShaft } from "./render-lighting-scene.ts";
import { ROOM } from "./render-lighting-room.ts";

export async function probe(): Promise<any> {
  const { engine, scene } = makeEngine();
  const s = buildShowcase(scene, engine, {});
  const w = ROOM.win;
  const corners = [new Vector3(w.x0, w.y0, 0), new Vector3(w.x1, w.y0, 0), new Vector3(w.x1, w.y1, 0), new Vector3(w.x0, w.y1, 0)];
  const shaft = createLightShaft(scene, corners, s.sun.direction.clone(), 6);
  await scene.whenReadyAsync();
  await renderFrames(scene, 8);
  return { png: captureCanvas(engine), shaftVisible: shaft.isEnabled() && shaft.isVisible, drawCalls: s.si.drawCallsCounter.current, transparentQueue: shaft.material!.needAlphaBlending() };
}
