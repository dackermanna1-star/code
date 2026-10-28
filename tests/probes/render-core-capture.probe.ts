// Probe: EnvironmentCapture (ReflectionProbe render once → SH readback → scene.environmentTexture).
import { MeshBuilder, PBRMaterial, Color3, Vector3, TransformNode, CubeMapToSphericalPolynomialTools } from "@babylonjs/core";
import { makeScene, snap, boxGeom } from "./render-core-util.ts";
import { loadTextures } from "../../src/render/textures.ts";
import { createWorldMaterial } from "../../src/render/worldMaterial.ts";
import { createGlassMaterial } from "../../src/render/glass.ts";
import { IslandBatcher, SurfaceTable, setActiveSurfaceTable } from "../../src/render/batch.ts";
import { createInteriorEnvironment, EnvironmentCapture } from "../../src/render/reflections.ts";
import { S } from "../../src/render/surfaces.ts";

export async function probe(): Promise<unknown> {
  const { scene, camera } = makeScene({ bloom: false });
  const lib = await loadTextures(scene, { proceduralOnly: true });
  const world = createWorldMaterial(scene, lib);
  const glass = createGlassMaterial(scene, lib);
  const table = new SurfaceTable(lib);
  setActiveSurfaceTable(table);
  const b = new IslandBatcher(scene, world.material, glass.material, table, {});
  // a small coloured room so the capture differs clearly from the procedural env
  const node = new TransformNode("room", scene);
  b.build(
    node,
    [
      boxGeom(0, -0.05, 0, 4, 0.1, 4, S.carpet, 0x3060c0),
      boxGeom(0, 2.55, 0, 4, 0.1, 4, S.paint_wall, 0xffffff),
      boxGeom(-2.05, 1.25, 0, 0.1, 2.5, 4, S.paint_wall, 0xd04040),
      boxGeom(2.05, 1.25, 0, 0.1, 2.5, 4, S.paint_wall, 0x40c040),
      boxGeom(0, 1.25, 2.05, 4, 2.5, 0.1, S.paint_wall, 0xe0d040),
      boxGeom(0, 1.25, -2.05, 4, 2.5, 0.1, S.paint_wall, 0xffffff),
      boxGeom(0, 0.45, 0, 0.6, 0.6, 0.6, S.chrome),
    ],
    null,
    "room",
  );
  const s = MeshBuilder.CreateSphere("ball", { diameter: 0.6, segments: 32 }, scene);
  s.position.set(0, 1.2, 0);
  const m = new PBRMaterial("ballMat", scene);
  m.metallic = 1;
  m.roughness = 0.05;
  m.albedoColor = new Color3(0.95, 0.95, 0.95);
  s.material = m;
  const env = createInteriorEnvironment(scene, 64);
  const cap = new EnvironmentCapture(scene, env);
  camera.position = new Vector3(0, 1.4, -1.8);
  camera.setTarget(new Vector3(0, 0.9, 0));
  await scene.whenReadyAsync();
  const sheets: string[] = [snap(scene, 2)];
  const log: string[] = [];
  const t0 = performance.now();
  let done: boolean | null = null;
  cap.capture({ position: new Vector3(0, 1.3, 0), size: 64, meshes: scene.meshes.filter((x) => x !== s), box: { center: new Vector3(0, 1.25, 0), size: new Vector3(4, 2.5, 4) } }).then((ok) => (done = ok));
  // instrument: count faces rendered
  const probeTex = (scene.reflectionProbes ?? [])[0]?.cubeTexture;
  let faces = 0;
  probeTex?.onAfterRenderObservable.add(() => faces++);
  for (let i = 0; i < 40 && done === null; i++) {
    scene.render();
    await new Promise((r) => setTimeout(r, 20));
    if (i % 5 === 0) log.push(`i${i}:faces=${faces}:done=${done}:refresh=${probeTex?.refreshRate}:shouldRender=${probeTex ? (probeTex as unknown as { _currentRefreshId: number })._currentRefreshId : -1}`);
  }
  const ms = performance.now() - t0;
  // fallback diagnostic: try the SH readback directly
  let shOk: string = "skipped";
  if (!done && probeTex) {
    try {
      const p = CubeMapToSphericalPolynomialTools.ConvertCubeMapTextureToSphericalPolynomial(probeTex);
      const r = await Promise.race([p, new Promise((res) => setTimeout(() => res("timeout"), 3000))]);
      shOk = r === "timeout" ? "timeout" : r ? "ok" : "null";
    } catch (e) {
      shOk = "error " + String(e);
    }
  }
  sheets.push(snap(scene, 2));
  return { done, ms: Math.round(ms), faces, log, shOk, envIsProbe: scene.environmentTexture === probeTex, sheets };
}
