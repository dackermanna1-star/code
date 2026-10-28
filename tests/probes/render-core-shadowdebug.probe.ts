// Debug: do batched world meshes cast and receive sun shadows?
import { MeshBuilder, PBRMaterial, Color3, Vector3, TransformNode } from "@babylonjs/core";
import { makeScene, snap, boxGeom } from "./render-core-util.ts";
import { loadTextures } from "../../src/render/textures.ts";
import { createWorldMaterial } from "../../src/render/worldMaterial.ts";
import { createGlassMaterial } from "../../src/render/glass.ts";
import { IslandBatcher, SurfaceTable, setActiveSurfaceTable } from "../../src/render/batch.ts";
import { S } from "../../src/render/surfaces.ts";

export async function probe(): Promise<unknown> {
  const { scene, camera, shadows } = makeScene({ bloom: false });
  const lib = await loadTextures(scene, { proceduralOnly: true });
  const world = createWorldMaterial(scene, lib);
  const glass = createGlassMaterial(scene, lib);
  const table = new SurfaceTable(lib);
  setActiveSurfaceTable(table);
  const b = new IslandBatcher(scene, world.material, glass.material, table, {
    setShadowCaster: (m, cast) => (cast ? shadows.addShadowCaster(m) : shadows.removeShadowCaster(m)),
  });
  // left: batched floor + batched cube; right: builder ground + builder sphere; middle: mixed
  const node = new TransformNode("n", scene);
  b.build(node, [boxGeom(-1.2, -0.05, 0, 2, 0.1, 2, S.concrete), boxGeom(-1.2, 0.5, 0, 0.4, 0.4, 0.4, S.wood_oak)], null, "left");
  const ground = MeshBuilder.CreateGround("g", { width: 2, height: 2 }, scene);
  ground.position.x = 1.2;
  const gm = new PBRMaterial("gm", scene);
  gm.albedoColor = new Color3(0.7, 0.7, 0.7);
  gm.metallic = 0;
  gm.roughness = 1;
  ground.material = gm;
  ground.receiveShadows = true;
  const sph = MeshBuilder.CreateSphere("s", { diameter: 0.4 }, scene);
  sph.position.set(1.2, 0.5, 0);
  sph.material = gm;
  shadows.addShadowCaster(sph);
  // builder box above the batched floor; batched cube above builder ground
  const box = MeshBuilder.CreateBox("bx", { size: 0.3 }, scene);
  box.position.set(-0.6, 0.6, 0.5);
  box.material = gm;
  shadows.addShadowCaster(box);
  const node2 = new TransformNode("n2", scene);
  b.build(node2, [boxGeom(1.7, 0.6, 0.5, 0.3, 0.3, 0.3, S.plastic, 0xff4040)], null, "cube2");
  // a plain builder mesh using the WORLD material without a surf attribute: must not glow
  const plain = MeshBuilder.CreateBox("plainWorld", { size: 0.35 }, scene);
  plain.position.set(0, 0.6, -0.4);
  plain.material = world.material;
  camera.position = new Vector3(0, 2.4, -2.6);
  camera.setTarget(new Vector3(0, 0, 0.3));
  await scene.whenReadyAsync();
  const shot = snap(scene, 4);
  const sm = shadows.getShadowMap();
  return {
    renderList: sm?.renderList?.map((m) => m.name),
    receivers: scene.meshes.filter((m) => m.receiveShadows).map((m) => m.name),
    sheets: [shot],
  };
}
