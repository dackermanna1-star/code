// Probe: on-demand shadow map refresh (refreshRate = RENDER_ONCE + resetRefreshCounter()).
import { Vector3, FreeCamera, HemisphericLight, ShadowGenerator, SceneInstrumentation, RenderTargetTexture } from "@babylonjs/core";
import { makeEngine, renderFrames, readAll, lumAt, toScreen } from "./render-lighting-util.ts";
import { buildRoom, makeSun } from "./render-lighting-room.ts";

export async function probe(): Promise<any> {
  const { engine, scene } = makeEngine();
  const cam = new FreeCamera("cam", new Vector3(2.5, 2.9, 2.0), scene);
  cam.setTarget(new Vector3(2.5, 0, 2.0001));
  cam.fov = 1.25;
  cam.minZ = 0.05;
  const si = new SceneInstrumentation(scene);
  const room = buildRoom(scene);
  for (const m of room.meshes) m.receiveShadows = true;
  const sun = makeSun(scene);
  sun.intensity = 3;
  sun.autoCalcShadowZBounds = true;
  new HemisphericLight("h", new Vector3(0, 1, 0), scene).intensity = 0.3;
  const sg = new ShadowGenerator(1024, sun);
  for (const m of room.casters) sg.addShadowCaster(m);
  sg.usePercentageCloserFiltering = true;
  sg.bias = 0.0005;
  sg.normalBias = 0.02;
  const map = sg.getShadowMap()!;
  map.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
  await scene.whenReadyAsync();
  const dc: number[] = [];
  for (let i = 0; i < 4; i++) { await renderFrames(scene, 1); dc.push(si.drawCallsCounter.current); }
  // the table's shadow on the floor; move the table out of the sun and compare before/after refresh
  const table = room.props.find((m) => m.name === "table")!;
  const shadowPt = toScreen(scene, cam, new Vector3(4.1, 0, 2.7));
  let fb = await readAll(engine);
  const before = Math.round(lumAt(fb, shadowPt.x, shadowPt.y, 1));
  table.position.y += 5; // move far away (out of the room)
  await renderFrames(scene, 2);
  fb = await readAll(engine);
  const movedNoRefresh = Math.round(lumAt(fb, shadowPt.x, shadowPt.y, 1));
  map.resetRefreshCounter();
  const dc2: number[] = [];
  for (let i = 0; i < 3; i++) { await renderFrames(scene, 1); dc2.push(si.drawCallsCounter.current); }
  fb = await readAll(engine);
  const movedAfterReset = Math.round(lumAt(fb, shadowPt.x, shadowPt.y, 1));
  return { drawCallsRenderOnce: dc, floorLumUnderTableShadow: before, afterMoveNoRefresh: movedNoRefresh, afterResetRefreshCounter: movedAfterReset, drawCallsAfterReset: dc2 };
}
