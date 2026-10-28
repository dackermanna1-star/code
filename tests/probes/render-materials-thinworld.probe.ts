// Probe: WorldMaterialPlugin (PBR) on thin instances (per-instance colour) and on InstancedMesh.
import { Engine, Scene, Vector3, Color4, FreeCamera, HemisphericLight, Mesh, VertexData, PBRMaterial, Matrix, VertexBuffer } from "@babylonjs/core";
import { WorldMaterialPlugin, createTextureArray } from "./render-materials-worldmat.ts";
import { GeomBuilder, type SurfAttrs } from "./render-materials-proctex.ts";

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 1);
  const cam = new FreeCamera("cam", new Vector3(0, 0, -6), scene);
  cam.setTarget(Vector3.Zero());
  new HemisphericLight("h", new Vector3(0, 0, -1), scene).intensity = 1.5;
  const white = new Uint8Array(4 * 4 * 4).fill(255);
  const mat = new PBRMaterial("w", scene);
  mat.metallic = 0;
  mat.roughness = 1;
  new WorldMaterialPlugin(mat).setTextures(createTextureArray(scene, [white], 4, { mipmaps: false }), null);
  const S: SurfAttrs = { layer: 0, normalLayer: 0, rough: 1, emissive: 0, tint: [1, 1, 1], metal: 0, worldSize: 1 };
  const g = new GeomBuilder();
  g.quad([0, 0, 0], [0, 0, -1], [0, 1, 0], 0.4, 0.4, S);
  const build = (name: string) => {
    const m = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = g.positions; vd.normals = g.normals; vd.uvs = g.uvs; vd.colors = g.colors; vd.indices = g.indices;
    vd.applyToMesh(m);
    m.setVerticesData("surf", g.surf, false, 4);
    m.material = mat;
    return m;
  };
  // thin instances
  const thin = build("thin");
  const mats = new Float32Array(16 * 3), cols = new Float32Array(4 * 3);
  [[-2, 1, 1, 0, 0], [0, 1, 0, 1, 0], [2, 1, 0, 0, 1]].forEach(([x, y, r, gg, b], i) => {
    Matrix.Translation(x, y, 0).copyToArray(mats, i * 16);
    cols.set([r, gg, b, 1], i * 4);
  });
  thin.thinInstanceSetBuffer("matrix", mats, 16, true);
  thin.thinInstanceSetBuffer("color", cols, 4, true);
  // InstancedMesh with per-instance colour
  const src = build("src");
  src.registerInstancedBuffer(VertexBuffer.ColorKind, 4);
  src.instancedBuffers.color = new Color4(1, 1, 0, 1);
  src.position.set(-1, -1, 0);
  const inst = src.createInstance("inst");
  inst.position.set(1, -1, 0);
  inst.instancedBuffers.color = new Color4(0, 1, 1, 1);
  await scene.whenReadyAsync();
  scene.render();
  scene.render();
  const w = engine.getRenderWidth(), h = engine.getRenderHeight();
  const read = async (x: number, y: number) => {
    const sp = Vector3.Project(new Vector3(x, y, 0), Matrix.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
    const d = (await engine.readPixels(Math.round(sp.x), Math.round(h - sp.y), 1, 1)) as Uint8Array;
    return [d[0], d[1], d[2]];
  };
  const res = {
    thinCompileError: thin.subMeshes[0].effect?.getCompilationError(),
    thinDefines: { INSTANCES: !!thin.subMeshes[0].materialDefines?.["INSTANCES"], THIN_INSTANCES: !!thin.subMeshes[0].materialDefines?.["THIN_INSTANCES"], INSTANCESCOLOR: !!thin.subMeshes[0].materialDefines?.["INSTANCESCOLOR"] },
    thinPixels_red_green_blue: [await read(-2, 1), await read(0, 1), await read(2, 1)],
    instancedPixels_yellow_cyan: [await read(-1, -1), await read(1, -1)],
  };
  engine.runRenderLoop(() => scene.render());
  return res;
}
