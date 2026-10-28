// Probe: clustered point light range cut-off for PBR (physical falloff) vs PBR useGLTFLightFalloff vs Standard.
import {
  Vector3, Color3, FreeCamera, PointLight, MeshBuilder, StandardMaterial, PBRMaterial, ClusteredLightContainer,
  Light, type Material,
} from "@babylonjs/core";
import { makeEngine, toScreen, readAll, lumAt, renderFrames } from "./render-lighting-util.ts";

export async function probe(): Promise<any> {
  const { engine, scene } = makeEngine();
  const cam = new FreeCamera("cam", new Vector3(0, 6, 0), scene);
  cam.setTarget(new Vector3(0, 0, 0.001));
  cam.minZ = 0.1;
  cam.maxZ = 100;
  const floor = MeshBuilder.CreateGround("floor", { width: 10, height: 10 }, scene);
  const light = new PointLight("p", new Vector3(0, 1, 0), scene);
  light.intensity = 3;
  light.range = 2;
  light.specular = Color3.Black();
  const radii = [1.2, 1.5, 1.75, 1.9, 2.2, 2.4, 2.6, 2.8, 3.0, 3.2, 3.4];
  async function profile(mat: Material): Promise<any> {
    floor.material = mat;
    await scene.whenReadyAsync();
    await renderFrames(scene, 3);
    const fb = await readAll(engine);
    const res: Record<string, number> = {};
    for (const r of radii) {
      const s = toScreen(scene, cam, new Vector3(r, 0, 0));
      res["d=" + Math.sqrt(r * r + 1).toFixed(2)] = Math.round(lumAt(fb, s.x, s.y, 1));
    }
    return res;
  }
  const pbr = new PBRMaterial("pbr", scene);
  pbr.albedoColor = new Color3(0.8, 0.8, 0.8); pbr.metallic = 0; pbr.roughness = 1;
  const pbrGltf = new PBRMaterial("pbrGltf", scene);
  pbrGltf.albedoColor = new Color3(0.8, 0.8, 0.8); pbrGltf.metallic = 0; pbrGltf.roughness = 1;
  pbrGltf.useGLTFLightFalloff = true;
  const std = new StandardMaterial("std", scene);
  std.diffuseColor = new Color3(0.8, 0.8, 0.8); std.specularColor = Color3.Black();
  const out: any = { range: light.range };
  out.unclustered = { pbr: await profile(pbr), pbrGltf: await profile(pbrGltf), std: await profile(std) };
  const cluster = new ClusteredLightContainer("c", [light], scene);
  out.clustered = { pbr: await profile(pbr), pbrGltf: await profile(pbrGltf), std: await profile(std), n: cluster.lights.length };
  // per-light falloffType other than DEFAULT is refused by the cluster
  const l2 = new PointLight("p2", new Vector3(3, 1, 3), scene);
  l2.falloffType = Light.FALLOFF_GLTF;
  out.gltfFalloffLightSupported = ClusteredLightContainer.IsLightSupported(l2);
  l2.dispose();
  floor.material = pbr; // leave the physical-falloff case on screen for the screenshot
  light.intensity = 12;
  await renderFrames(scene, 3);
  return out;
}
