// Probe: 15 interior point lights. Compare maxSimultaneousLights=4 (default), =16, and ClusteredLightContainer,
// for StandardMaterial and PBRMaterial. Samples floor brightness under each light.
import {
  Vector3, Color3, FreeCamera, PointLight, HemisphericLight, MeshBuilder, StandardMaterial, PBRMaterial,
  ClusteredLightContainer, SceneInstrumentation, TransformNode, ShadowGenerator, type Material,
} from "@babylonjs/core";
import { makeEngine, toScreen, readAvg, lum, renderFrames, now } from "./render-lighting-util.ts";

export async function probe(): Promise<any> {
  const { engine, scene } = makeEngine();
  const cam = new FreeCamera("cam", new Vector3(6, 11, 4), scene);
  cam.setTarget(new Vector3(6, 0, 4.001));
  cam.minZ = 0.1;
  const si = new SceneInstrumentation(scene);

  const floor = MeshBuilder.CreateGround("floor", { width: 13, height: 9, subdivisions: 1 }, scene);
  floor.position.set(6, 0, 4);
  const std = new StandardMaterial("std", scene);
  std.diffuseColor = new Color3(0.8, 0.8, 0.8);
  std.specularColor = new Color3(0, 0, 0);
  const pbr = new PBRMaterial("pbr", scene);
  pbr.albedoColor = new Color3(0.8, 0.8, 0.8);
  pbr.metallic = 0;
  pbr.roughness = 0.9;

  const lights: PointLight[] = [];
  const positions: Vector3[] = [];
  for (let iz = 0; iz < 3; iz++) {
    for (let ix = 0; ix < 5; ix++) {
      const p = new Vector3(1 + ix * 2.5, 2.2, 1.2 + iz * 2.8);
      const l = new PointLight("pl" + lights.length, p.clone(), scene);
      l.diffuse = new Color3(1, 0.8, 0.55);
      l.specular = new Color3(0, 0, 0);
      l.intensity = 1.2;
      l.range = 3.0;
      lights.push(l);
      positions.push(new Vector3(p.x, 0, p.z));
    }
  }

  async function measure(label: string, mat: Material): Promise<any> {
    floor.material = mat;
    const t0 = now();
    const ready = await Promise.race([scene.whenReadyAsync().then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 8000))]);
    const compileMs = Math.round(now() - t0);
    if (!ready) return { label, ready, compileMs };
    await renderFrames(scene, 4);
    const lums: number[] = [];
    for (const p of positions) {
      const s = toScreen(scene, cam, p);
      lums.push(lum(await readAvg(engine, s.x, s.y, 2)));
    }
    const t1 = now();
    for (let i = 0; i < 10; i++) scene.render();
    const ms = (now() - t1) / 10;
    return { label, compileMs, litCount: lums.filter((v) => v > 40).length, lums, drawCalls: si.drawCallsCounter.current, cpuMsPerFrameSwiftShader: +ms.toFixed(1), lightSourcesOnFloor: floor.lightSources.map((l) => l.name).length };
  }

  const out: any = { results: [] };
  // 1) default limit 4
  out.results.push(await measure("std max4 (default)", std));
  out.results.push(await measure("pbr max4 (default)", pbr));
  // 2) raise limit (each light = 1 vertex UBO; WebGL2 limit here is 14 vertex UBOs)
  for (const n of [8, 11, 12]) {
    const s2 = new StandardMaterial("std" + n, scene);
    s2.diffuseColor = new Color3(0.8, 0.8, 0.8);
    s2.specularColor = new Color3(0, 0, 0);
    s2.maxSimultaneousLights = n;
    out.results.push(await measure("std max" + n, s2));
    const p2 = new PBRMaterial("pbr" + n, scene);
    p2.albedoColor = new Color3(0.8, 0.8, 0.8);
    p2.metallic = 0;
    p2.roughness = 0.9;
    p2.maxSimultaneousLights = n;
    out.results.push(await measure("pbr max" + n, p2));
    floor.material = std;
    s2.dispose();
    p2.dispose();
  }

  // 3) clustered: one container for all 15 point lights + a hemispheric fill outside the cluster
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.05;
  const cluster = new ClusteredLightContainer("cluster", lights, scene);
  out.clusterInfo = { isSupported: cluster.isSupported, count: cluster.lights.length, sceneLights: scene.lights.map((l) => l.name) };
  out.results.push(await measure("std clustered (max4)", std));
  out.results.push(await measure("pbr clustered (max4)", pbr));

  // 4) toggling a clustered light: setEnabled(false) vs intensity=0
  floor.material = std;
  const target = lights[7];
  const tp = toScreen(scene, cam, positions[7]);
  await renderFrames(scene, 2);
  const before = lum(await readAvg(engine, tp.x, tp.y));
  target.setEnabled(false);
  await renderFrames(scene, 2);
  const afterDisable = lum(await readAvg(engine, tp.x, tp.y));
  target.setEnabled(true);
  target.intensity = 0;
  await renderFrames(scene, 2);
  const afterIntensity0 = lum(await readAvg(engine, tp.x, tp.y));
  target.intensity = 1.2;
  // removeLight puts it back into scene.lights (as a normal light)
  const idx = cluster.removeLight(target);
  await renderFrames(scene, 2);
  const afterRemove = lum(await readAvg(engine, tp.x, tp.y));
  out.toggle = { before, afterDisable, afterIntensity0, afterRemove, removeIndex: idx, inSceneLightsAfterRemove: scene.lights.includes(target) };
  cluster.addLight(target);

  // 5) parented light moves with its node
  const node = new TransformNode("island", scene);
  const moving = lights[0];
  cluster.removeLight(moving);
  moving.parent = node;
  moving.position.set(1, 2.2, 1.2);
  cluster.addLight(moving);
  node.position.x = 5; // light now at x=6
  await renderFrames(scene, 2);
  const oldSpot = lum(await readAvg(engine, toScreen(scene, cam, new Vector3(1, 0, 1.2)).x, toScreen(scene, cam, new Vector3(1, 0, 1.2)).y));
  const newSpot = toScreen(scene, cam, new Vector3(6, 0, 1.2));
  out.parented = { oldSpotLum: oldSpot, newSpotLum: lum(await readAvg(engine, newSpot.x, newSpot.y)) };

  // 6) a shadow-casting light cannot join
  const shadowed = new PointLight("shadowed", new Vector3(6, 2, 4), scene);
  new ShadowGenerator(256, shadowed);
  out.shadowLightSupported = ClusteredLightContainer.IsLightSupported(shadowed);
  shadowed.dispose();

  // 7) default range (MAX_VALUE) vs clustering
  out.defaultRange = new PointLight("tmp", Vector3.Zero(), scene).range;
  await renderFrames(scene, 2);
  return out;
}
