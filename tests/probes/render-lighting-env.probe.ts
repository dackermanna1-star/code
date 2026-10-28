// Probe: environment (IBL) without external files.
// A) ReflectionProbe rendering only the gradient sky dome once -> scene.environmentTexture
// B) RawCubeTexture generated on the CPU (orientation markers) -> scene.environmentTexture
import {
  Vector3, Color3, FreeCamera, MeshBuilder, PBRMaterial, ReflectionProbe, RawCubeTexture, RenderTargetTexture,
  Constants, StandardMaterial, Texture, DirectionalLight,
} from "@babylonjs/core";
import { makeEngine, toScreen, readAll, renderFrames } from "./render-lighting-util.ts";
import { createSkyDome } from "./render-lighting-scene.ts";
import { sunDirection } from "./render-lighting-room.ts";

export async function probe(): Promise<any> {
  const { engine, scene } = makeEngine();
  const cam = new FreeCamera("cam", new Vector3(0, 1, 6), scene); // north of the spheres, looking south (-Z)
  cam.setTarget(new Vector3(0, 1, 0));
  cam.minZ = 0.05;
  cam.maxZ = 1000;
  const sun = new DirectionalLight("sunDirOnly", sunDirection(225, 20), scene);
  sun.intensity = 0; // only used for the sky shader direction
  const skyMat = createSkyDome(scene, sun);
  const dome = scene.getMeshByName("skyDome")!;
  const mk = (name: string, x: number, metallic: number, roughness: number) => {
    const s = MeshBuilder.CreateSphere(name, { diameter: 1.4, segments: 32 }, scene);
    s.position.set(x, 1, 0);
    const m = new PBRMaterial(name + "Mat", scene);
    m.albedoColor = new Color3(0.9, 0.9, 0.9);
    m.metallic = metallic;
    m.roughness = roughness;
    s.material = m;
    return s;
  };
  const chrome = mk("chrome", -1.7, 1, 0.05);
  const rough = mk("rough", 0, 0, 1);
  const satin = mk("satin", 1.7, 0, 0.35);

  async function sample(label: string): Promise<any> {
    await scene.whenReadyAsync();
    await renderFrames(scene, 6);
    await new Promise((r) => setTimeout(r, 300)); // sphericalPolynomial readback is async
    await renderFrames(scene, 4);
    const fb = await readAll(engine);
    const px = (p: Vector3) => {
      const s = toScreen(scene, cam, p);
      const i = ((fb.h - 1 - s.y) * fb.w + s.x) * 4;
      return [fb.data[i], fb.data[i + 1], fb.data[i + 2]];
    };
    const r = 0.7 * 0.97;
    return {
      label,
      roughTop: px(rough.position.add(new Vector3(0, r, 0))),
      roughBottom: px(rough.position.add(new Vector3(0, -r, 0.2))),
      roughFront: px(rough.position.add(new Vector3(0, 0, r))),
      chromeCenter: px(chrome.position.add(new Vector3(0, 0, r))),   // reflects the view ray back: sky behind camera (north)
      chromeUpper: px(chrome.position.add(new Vector3(0, r * 0.7, r * 0.7))),
      chromeLeft: px(chrome.position.add(new Vector3(r * 0.7, 0, r * 0.7))), // screen-left = +X (east) side when looking south
      chromeRight: px(chrome.position.add(new Vector3(-r * 0.7, 0, r * 0.7))),
      satinFront: px(satin.position.add(new Vector3(0, 0, r))),
      envSet: !!scene.environmentTexture, sphericalPolynomial: !!(scene.environmentTexture as any)?.sphericalPolynomial,
    };
  }
  const out: any = {};
  out.noEnv = await sample("no environment");

  // A) ReflectionProbe of the sky dome only, rendered once.
  const probeA = new ReflectionProbe("skyProbe", 128, scene, true, true, true);
  probeA.renderList!.push(dome);
  probeA.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
  probeA.position.set(0, 1, 0);
  scene.environmentTexture = probeA.cubeTexture;
  out.probe = await sample("ReflectionProbe(sky only, once)");
  out.probeTex = { isCube: probeA.cubeTexture.isCube, size: probeA.cubeTexture.getSize(), refreshRate: probeA.refreshRate, gammaSpace: probeA.cubeTexture.gammaSpace };
  scene.environmentIntensity = 0.5;
  out.probeHalfIntensity = await sample("ReflectionProbe, scene.environmentIntensity=0.5");
  scene.environmentIntensity = 1;

  // B) RawCubeTexture with face colours to learn the face order/orientation as seen by PBR reflections.
  const size = 16;
  const faceColors = [[255, 0, 0], [0, 255, 255], [0, 255, 0], [255, 0, 255], [0, 0, 255], [255, 255, 0]]; // +X red, -X cyan, +Y green, -Y magenta, +Z blue, -Z yellow
  const faces = faceColors.map((c) => {
    const d = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; }
    return d;
  });
  const raw = new RawCubeTexture(scene, faces, size, Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_UNSIGNED_BYTE, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  raw.gammaSpace = false;
  scene.environmentTexture = raw;
  dome.setEnabled(false);
  out.raw = await sample("RawCubeTexture face markers");
  // skybox using the same raw cube to see the face mapping from inside
  const sky = MeshBuilder.CreateBox("skybox", { size: 100, sideOrientation: 1 }, scene);
  const skyM = new StandardMaterial("skyboxMat", scene);
  skyM.backFaceCulling = false;
  skyM.disableLighting = true;
  const rt = raw.clone();
  rt.coordinatesMode = Texture.SKYBOX_MODE;
  skyM.reflectionTexture = rt;
  sky.material = skyM;
  sky.infiniteDistance = true;
  await renderFrames(scene, 3);
  const fb = await readAll(engine);
  const at = (x: number, y: number) => { const i = ((fb.h - 1 - y) * fb.w + x) * 4; return [fb.data[i], fb.data[i + 1], fb.data[i + 2]]; };
  out.skyboxLookingSouthCenterTop = at(640, 20); // camera looks -Z (south): expect the -Z face
  cam.setTarget(new Vector3(10, 1, 6)); // look +X (east)
  await renderFrames(scene, 3);
  const fb2 = await readAll(engine);
  out.skyboxLookingEast = (() => { const i = ((fb2.h - 1 - 20) * fb2.w + 640) * 4; return [fb2.data[i], fb2.data[i + 1], fb2.data[i + 2]]; })();
  cam.setTarget(new Vector3(0, 1, 0));
  sky.dispose();
  // leave the probe-based env for the screenshot
  dome.setEnabled(true);
  scene.environmentTexture = probeA.cubeTexture;
  await renderFrames(scene, 4);
  out.skyMatName = skyMat.name;
  return out;
}
