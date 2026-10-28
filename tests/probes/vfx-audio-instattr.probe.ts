// Probe: custom per-instance attribute on thin instances read by a MaterialPluginBase plugin
// (how micro-debris could carry a per-instance "surf"/tint into the world material).
import { MeshBuilder, StandardMaterial, MaterialPluginBase, Matrix, Color3, Vector3, type Material, type AbstractMesh, type MaterialDefines, type Scene } from "@babylonjs/core";
import { makeScene, renderUntil, gpuSync } from "./vfx-audio-util.ts";

class InstSurfPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    // name, priority, defines (with defaults), addToPluginList, enable
    super(material, "InstSurf", 200, { INSTSURF: false }, true, true);
  }
  override getClassName(): string {
    return "InstSurfPlugin";
  }
  override prepareDefines(defines: MaterialDefines, _scene: Scene, mesh: AbstractMesh): void {
    defines["INSTSURF"] = mesh.isVerticesDataPresent("instSurf");
  }
  override getAttributes(attributes: string[], _scene: Scene, mesh: AbstractMesh): void {
    if (mesh.isVerticesDataPresent("instSurf")) attributes.push("instSurf");
  }
  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType === "vertex") {
      return {
        CUSTOM_VERTEX_DEFINITIONS: "#ifdef INSTSURF\nattribute vec4 instSurf;\nvarying vec4 vInstSurf;\n#endif\n",
        CUSTOM_VERTEX_MAIN_END: "#ifdef INSTSURF\nvInstSurf = instSurf;\n#endif\n",
      };
    }
    if (shaderType === "fragment") {
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: "#ifdef INSTSURF\nvarying vec4 vInstSurf;\n#endif\n",
        CUSTOM_FRAGMENT_UPDATE_DIFFUSE: "#ifdef INSTSURF\ndiffuseColor.rgb *= vInstSurf.rgb;\n#endif\n",
      };
    }
    return null;
  }
}

export async function probe(): Promise<any> {
  const { engine, scene, camera } = makeScene({ wall: false });
  camera.position.set(0, 1.5, -3);
  camera.setTarget(new Vector3(0, 0.3, 0));
  const mat = new StandardMaterial("instMat", scene);
  mat.diffuseColor = Color3.White();
  const plugin = new InstSurfPlugin(mat);
  const box = MeshBuilder.CreateBox("chip", { size: 0.25 }, scene);
  box.material = mat;
  const n = 9;
  const mats = new Float32Array(n * 16);
  const surf = new Float32Array(n * 4);
  const m = new Matrix();
  for (let i = 0; i < n; i++) {
    Matrix.TranslationToRef((i % 3) * 0.5 - 0.5, 0.15, Math.floor(i / 3) * 0.5 - 0.3, m);
    m.copyToArray(mats, i * 16);
    // R, G, B stripes by column
    surf.set([i % 3 === 0 ? 1 : 0.15, i % 3 === 1 ? 1 : 0.15, i % 3 === 2 ? 1 : 0.15, 1], i * 4);
  }
  box.thinInstanceSetBuffer("matrix", mats, 16, true);
  box.thinInstanceSetBuffer("instSurf", surf, 4, true); // any kind name -> instanced VertexBuffer (divisor 1)
  const ready = await renderUntil(scene, () => scene.isReady());
  for (let i = 0; i < 3; i++) {
    scene.render();
    gpuSync(engine);
  }
  // read back a few pixels to prove the per-instance attribute reached the fragment shader
  const pixels = (await engine.readPixels(0, 0, engine.getRenderWidth(), engine.getRenderHeight())) as Uint8Array;
  const w = engine.getRenderWidth(), h = engine.getRenderHeight();
  let red = 0, green = 0, blue = 0;
  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w; x += 4) {
      const o = (y * w + x) * 4;
      const r = pixels[o], g = pixels[o + 1], b = pixels[o + 2];
      if (r > 120 && g < 70 && b < 70) red++;
      if (g > 120 && r < 70 && b < 70) green++;
      if (b > 120 && r < 70 && g < 70) blue++;
    }
  }
  return {
    ready,
    pluginEnabled: !!plugin,
    hasInstSurf: box.isVerticesDataPresent("instSurf"),
    instanceCount: box.thinInstanceCount,
    saturatedPixelSamples: { red, green, blue },
  };
}
