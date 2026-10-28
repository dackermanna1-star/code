// Debug probe: procedural environment on plain PBR spheres (metal/rough sweep) + world-material cube.
import { MeshBuilder, PBRMaterial, Color3, Vector3, TransformNode } from "@babylonjs/core";
import { makeScene, snap, boxGeom } from "./render-core-util.ts";
import { createInteriorEnvironment } from "../../src/render/reflections.ts";
import { loadTextures } from "../../src/render/textures.ts";
import { createWorldMaterial } from "../../src/render/worldMaterial.ts";
import { createGlassMaterial } from "../../src/render/glass.ts";
import { IslandBatcher, SurfaceTable, setActiveSurfaceTable } from "../../src/render/batch.ts";
import { S } from "../../src/render/surfaces.ts";

export async function probe(): Promise<unknown> {
  const { scene, camera, engine } = makeScene({ bloom: false });
  const env = createInteriorEnvironment(scene, 64);
  scene.environmentTexture = env;
  const caps = engine.getCaps();
  const spheres: string[] = [];
  for (let i = 0; i < 5; i++) {
    const s = MeshBuilder.CreateSphere("s" + i, { diameter: 0.5, segments: 24 }, scene);
    s.position.set((i - 2) * 0.6, 0.6, 0);
    const m = new PBRMaterial("m" + i, scene);
    m.metallic = 1;
    m.roughness = i * 0.22;
    m.albedoColor = new Color3(0.9, 0.9, 0.9);
    s.material = m;
    spheres.push(s.name);
  }
  const lib = await loadTextures(scene, { proceduralOnly: true });
  const world = createWorldMaterial(scene, lib);
  const glass = createGlassMaterial(scene, lib);
  const table = new SurfaceTable(lib);
  setActiveSurfaceTable(table);
  const b = new IslandBatcher(scene, world.material, glass.material, table, {});
  const node = new TransformNode("n", scene);
  b.build(node, [boxGeom(-0.6, 0.0, 0, 0.4, 0.4, 0.4, S.chrome), boxGeom(0, 0.0, 0, 0.4, 0.4, 0.4, S.steel_brushed), boxGeom(0.6, 0.0, 0, 0.4, 0.4, 0.4, S.copper)], null, "metals");
  camera.position = new Vector3(0, 0.6, -2.2);
  camera.setTarget(new Vector3(0, 0.3, 0));
  await scene.whenReadyAsync();
  const shot = snap(scene, 3);
  world.plugin.normalScale = 0;
  const shot2 = snap(scene, 2);
  world.plugin.normalScale = 1;
  // rotate the cubes' island 45° so faces see other env directions
  node.rotation.y = Math.PI / 4;
  const shot3 = snap(scene, 2);
  const m0 = scene.getMaterialByName("m0") as PBRMaterial;
  return {
    hdrCaps: { hfRender: caps.textureHalfFloatRender, hfLinear: caps.textureHalfFloatLinearFiltering, fRender: caps.textureFloatRender },
    envReady: env.isReady(),
    envSP: !!env.sphericalPolynomial,
    envType: env.getInternalTexture()?.type,
    defines: (m0 as unknown as { _defines?: unknown })._defines ? null : null,
    sheets: [shot, shot2, shot3],
  };
}
