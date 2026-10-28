// Probe: does GlowLayer with addIncludedOnlyMesh lose occlusion by other meshes (glow leaking through walls)?
import { Vector3, Color3, Color4, FreeCamera, HemisphericLight, MeshBuilder, StandardMaterial, GlowLayer, SceneInstrumentation } from "@babylonjs/core";
import { makeEngine, renderFrames, readAll, lumAt } from "./render-lighting-util.ts";

export async function probe(): Promise<any> {
  const { engine, scene } = makeEngine();
  scene.clearColor = new Color4(0, 0, 0, 1);
  const cam = new FreeCamera("c", new Vector3(0, 0, -6), scene);
  cam.setTarget(Vector3.Zero());
  new HemisphericLight("h", new Vector3(0, 0, -1), scene).intensity = 0.3;
  const si = new SceneInstrumentation(scene);
  const wall = MeshBuilder.CreateBox("wall", { width: 4, height: 4, depth: 0.2 }, scene);
  const wm = new StandardMaterial("wm", scene);
  wm.diffuseColor = new Color3(0.5, 0.5, 0.5);
  wall.material = wm;
  const bulb = MeshBuilder.CreatePlane("bulb", { size: 1 }, scene);
  bulb.position.z = 2; // behind the wall
  const bm = new StandardMaterial("bm", scene);
  bm.disableLighting = true;
  bm.emissiveColor = new Color3(1, 0.8, 0.4);
  bulb.material = bm;
  const measure = async () => { await scene.whenReadyAsync(); await renderFrames(scene, 3); const fb = await readAll(engine); return { wallCenterLum: Math.round(lumAt(fb, 640, 360, 2)), drawCalls: si.drawCallsCounter.current }; };
  const out: any = { noGlow: await measure() };
  const glow = new GlowLayer("glow", scene, { blurKernelSize: 64 });
  glow.intensity = 2;
  out.glowAllMeshes = await measure();
  glow.addIncludedOnlyMesh(bulb);
  out.glowIncludedOnlyBulb = await measure();
  return out;
}
