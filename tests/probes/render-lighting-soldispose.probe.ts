// Probe: does disposing a SelectionOutlineLayer leave the scene depth renderer running (extra geometry pass)?
import { Vector3, FreeCamera, HemisphericLight, SelectionOutlineLayer, SceneInstrumentation } from "@babylonjs/core";
import { makeEngine, renderFrames } from "./render-lighting-util.ts";
import { buildRoom } from "./render-lighting-room.ts";

export async function probe(): Promise<any> {
  const { scene } = makeEngine();
  const cam = new FreeCamera("cam", new Vector3(0.5, 1.6, 3.6), scene);
  cam.setTarget(new Vector3(3, 0.8, 0.8));
  new HemisphericLight("h", new Vector3(0, 1, 0), scene);
  const si = new SceneInstrumentation(scene);
  const room = buildRoom(scene);
  const dc = async () => { await scene.whenReadyAsync(); await renderFrames(scene, 3); return si.drawCallsCounter.current; };
  const out: any = { baseline: await dc() };
  const sol = new SelectionOutlineLayer("sol", scene);
  sol.addSelection(room.props[0]);
  out.withLayer = await dc();
  out.depthRenderersWhileActive = Object.keys((scene as any)._depthRenderer ?? {}).length;
  sol.dispose();
  out.afterDispose = await dc();
  out.depthRenderersAfterDispose = Object.keys((scene as any)._depthRenderer ?? {}).length;
  scene.disableDepthRenderer();
  out.afterDisableDepthRenderer = await dc();
  const sol2 = new SelectionOutlineLayer("sol2", scene, { useDepthOcclusion: false });
  sol2.addSelection(room.props[0]);
  out.withLayerNoDepthOcclusion = await dc();
  return out;
}
