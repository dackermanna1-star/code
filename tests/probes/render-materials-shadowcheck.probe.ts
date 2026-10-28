// Probe: isolate shadow receiving: plain PBR vs PBR+WorldMaterialPlugin, MeshBuilder vs raw meshes.
import {
  Engine, Scene, Vector3, Color3, Color4, FreeCamera, HemisphericLight, DirectionalLight, ShadowGenerator, MeshBuilder,
  PBRMaterial, Matrix, VertexData, Mesh,
} from "@babylonjs/core";
import { WorldMaterialPlugin, createTextureArray } from "./render-materials-worldmat.ts";
import { makeAlbedoLayers, makeNormalLayers, TEX } from "./render-materials-proctex.ts";

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.5, 0.6, 0.7, 1);
  const cam = new FreeCamera("cam", new Vector3(0, 6, -9), scene);
  cam.setTarget(new Vector3(0, 0, 0));
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.3;
  const sunDir = new Vector3(-0.5, -1, -0.8).normalize();
  const sun = new DirectionalLight("sun", sunDir, scene);
  sun.position = sunDir.scale(-25);
  sun.intensity = 3;
  const sg = new ShadowGenerator(1024, sun);
  sg.usePercentageCloserFiltering = true;

  const albedo = createTextureArray(scene, makeAlbedoLayers(), TEX);
  const normal = createTextureArray(scene, makeNormalLayers(), TEX);

  const plain = new PBRMaterial("plain", scene);
  plain.metallic = 0;
  plain.roughness = 0.8;
  const world = new PBRMaterial("world", scene);
  world.metallic = 0;
  world.roughness = 1;
  const plugin = new WorldMaterialPlugin(world);
  plugin.setTextures(albedo, normal);

  // left half: MeshBuilder ground + plain PBR ; right half: raw ground + world material
  const g1 = MeshBuilder.CreateGround("g1", { width: 6, height: 8 }, scene);
  g1.position.x = -3.2;
  g1.material = plain;
  g1.receiveShadows = true;
  const g2 = new Mesh("g2", scene);
  const vd = new VertexData();
  vd.positions = [-3, 0, -4, 3, 0, -4, 3, 0, 4, -3, 0, 4];
  vd.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  vd.uvs = [0, 0, 6, 0, 6, 8, 0, 8];
  vd.colors = [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0];
  vd.indices = [0, 1, 2, 0, 2, 3]; // N=+Y, V=+Z, U=N×V=+X: (0,1,2) = BL,BR,TR -> front-facing from above
  vd.applyToMesh(g2);
  g2.setVerticesData("surf", [4, 0, 0.8, 0, 4, 0, 0.8, 0, 4, 0, 0.8, 0, 4, 0, 0.8, 0], false, 4);
  g2.position.x = 3.2;
  g2.material = world;
  g2.receiveShadows = true;

  const b1 = MeshBuilder.CreateBox("b1", { size: 1 }, scene);
  b1.position.set(-3.2, 0.5, 0);
  b1.material = plain;
  sg.addShadowCaster(b1);
  const b2 = MeshBuilder.CreateBox("b2", { size: 1 }, scene);
  b2.position.set(3.2, 0.5, 0);
  b2.material = plain;
  sg.addShadowCaster(b2);

  await scene.whenReadyAsync();
  for (let i = 0; i < 3; i++) scene.render();
  const w = engine.getRenderWidth(), h = engine.getRenderHeight();
  const read = async (x: number, z: number) => {
    const sp = Vector3.Project(new Vector3(x, 0, z), Matrix.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
    const d = (await engine.readPixels(Math.round(sp.x), Math.round(h - sp.y), 1, 1)) as Uint8Array;
    return [d[0], d[1], d[2]];
  };
  // shadow of a unit box with light dir (-0.5,-1,-0.8): falls towards -x,-z
  const res = {
    plain_lit: await read(-3.2 + 1.5, 1.5),
    plain_shadow: await read(-3.2 - 0.6, -0.9),
    world_lit: await read(3.2 + 1.5, 1.5),
    world_shadow: await read(3.2 - 0.6, -0.9),
    g2_SHADOW1: !!g2.subMeshes[0].materialDefines?.["SHADOW1"],
    g2_compileError: g2.subMeshes[0].effect?.getCompilationError(),
  };
  engine.runRenderLoop(() => scene.render());
  return res;
}
