// Probe: numeric check that per-vertex roughness (surf.z) and metallic (color.a) reach the PBR shader.
// Quads face the camera; a directional light shines along the view direction so each quad centre is at the
// mirror direction (peak specular). Lower roughness => brighter peak. Metallic + white albedo => no diffuse.
import { Engine, Scene, Vector3, Color4, FreeCamera, Camera, DirectionalLight, Mesh, VertexData, PBRMaterial, Matrix } from "@babylonjs/core";
import { WorldMaterialPlugin, createTextureArray } from "./render-materials-worldmat.ts";
import { GeomBuilder, type SurfAttrs } from "./render-materials-proctex.ts";

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 1);
  // Ortho camera far away: PBR computes V from vEyePosition, so the eye must be distant for V to be ~constant
  const cam = new FreeCamera("cam", new Vector3(0, 0, -3000), scene);
  cam.setTarget(Vector3.Zero());
  cam.maxZ = 6000;
  cam.mode = Camera.ORTHOGRAPHIC_CAMERA;
  const a = engine.getRenderWidth() / engine.getRenderHeight();
  cam.orthoTop = 3; cam.orthoBottom = -3; cam.orthoLeft = -3 * a; cam.orthoRight = 3 * a;
  const sun = new DirectionalLight("sun", new Vector3(0, 0, 1), scene); // same direction as the view
  sun.intensity = 2;
  const white = new Uint8Array(4 * 4 * 4).fill(255);
  const albedo = createTextureArray(scene, [white], 4, { mipmaps: false });
  const mat = new PBRMaterial("w", scene);
  mat.metallic = 0;
  mat.roughness = 1;
  new WorldMaterialPlugin(mat).setTextures(albedo, null);
  const g = new GeomBuilder();
  const S = (rough: number, metal: number): SurfAttrs => ({ layer: 0, normalLayer: 0, rough, emissive: 0, tint: [0.5, 0.5, 0.5], metal, worldSize: 1 });
  const cases: Array<[string, number, number, number]> = [
    ["rough0.05_dielectric", 0.05, 0, -4], ["rough0.5_dielectric", 0.5, 0, -2], ["rough1.0_dielectric", 1.0, 0, 0],
    ["rough0.3_metal", 0.3, 1, 2], ["rough0.3_dielectric", 0.3, 0, 4],
  ];
  for (const [, r, m, x] of cases) g.quad([x, 0, 0], [0, 0, -1], [0, 1, 0], 0.8, 0.8, S(r, m));
  const mesh = new Mesh("q", scene);
  const vd = new VertexData();
  vd.positions = g.positions; vd.normals = g.normals; vd.uvs = g.uvs; vd.colors = g.colors; vd.indices = g.indices;
  vd.applyToMesh(mesh);
  mesh.setVerticesData("surf", g.surf, false, 4);
  mesh.material = mat;
  await scene.whenReadyAsync();
  scene.render();
  scene.render();
  const w = engine.getRenderWidth(), h = engine.getRenderHeight();
  const out: Record<string, number[]> = {};
  for (const [name, , , x] of cases) {
    const sp = Vector3.Project(new Vector3(x, 0, 0), Matrix.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
    const d = (await engine.readPixels(Math.round(sp.x), Math.round(h - sp.y), 1, 1)) as Uint8Array;
    out[name] = [d[0], d[1], d[2]];
  }
  // off-specular lighting (45 deg): dielectric shows diffuse, metal (no environment) ~black
  sun.direction = new Vector3(0.7, 0, 0.7).normalize();
  scene.render();
  for (const [name, , , x] of cases) {
    const sp = Vector3.Project(new Vector3(x, 0, 0), Matrix.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
    const d = (await engine.readPixels(Math.round(sp.x), Math.round(h - sp.y), 1, 1)) as Uint8Array;
    out[name + "_offSpecular45"] = [d[0], d[1], d[2]];
  }
  engine.runRenderLoop(() => scene.render());
  return out;
}
