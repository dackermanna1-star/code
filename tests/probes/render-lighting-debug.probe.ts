import { Vector3, Color3, FreeCamera, HemisphericLight, Ray, ShadowGenerator } from "@babylonjs/core";
import { makeEngine, toScreen, readAll, lumAt, renderFrames } from "./render-lighting-util.ts";
import { buildRoom, makeSun } from "./render-lighting-room.ts";
export async function probe(): Promise<any> {
  const { engine, scene } = makeEngine();
  const cam = new FreeCamera("cam", new Vector3(2.5, 2.9, 2.0), scene);
  cam.setTarget(new Vector3(2.5, 0, 2.0001));
  cam.fov = 1.25; cam.minZ = 0.05; cam.maxZ = 200;
  const room = buildRoom(scene);
  for (const m of room.meshes) m.receiveShadows = true;
  const sun = makeSun(scene, 225, 20); sun.intensity = 3;
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene); hemi.intensity = 0.25;
  const sg = new ShadowGenerator(2048, sun); for (const m of room.casters) sg.addShadowCaster(m);
  sun.autoCalcShadowZBounds = true; sg.usePercentageCloserFiltering = true; sg.bias = 0.0005; sg.normalBias = 0.02;
  await scene.whenReadyAsync();
  await renderFrames(scene, 4);
  const fb = await readAll(engine);
  let mn = 1e9, mx = -1e9;
  for (let i = 0; i < fb.data.length; i += 4) { const l = fb.data[i] + fb.data[i + 1] + fb.data[i + 2]; mn = Math.min(mn, l); mx = Math.max(mx, l); }
  const small = await (await import("./render-lighting-util.ts")).readAvg(engine, 979, 236, 2);
  (window as any).__dbg = { len: fb.data.length, ctor: fb.data.constructor.name, mn, mx, small, first: Array.from(fb.data.slice(0, 8)) };
  const pts = [new Vector3(4.47, 0, 2.72), new Vector3(4.0, 0, 3.3), new Vector3(1.0, 0, 1.0), new Vector3(2.5, 0, 2.0)];
  const toSun = sun.direction.scale(-1).normalize();
  return [(window as any).__dbg, ...pts.map((p) => {
    const s = toScreen(scene, cam, p);
    const hit = scene.pickWithRay(new Ray(p.add(new Vector3(0, 0.002, 0)), toSun, 60), (m) => room.meshes.includes(m as any));
    return { p: p.asArray(), s, lum: Math.round(lumAt(fb, s.x, s.y, 1)), hit: hit?.hit, hitMesh: hit?.pickedMesh?.name, };
  })];
}
