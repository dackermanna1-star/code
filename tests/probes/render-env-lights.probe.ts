// Probe: Lighting behaviour — clustered interior lights (one slot for 16 lights), power cut,
// flicker, owner intensity changes, setEnabled honoured, removal/disposal bookkeeping,
// point-shadow promotion/demotion, the cached sun shadow map (draw calls only when casters
// move) and quality changes.
// Run: node tests/probe.mjs tests/probes/render-env-lights.probe.ts
import { ClusteredLightContainer, Color3, MeshBuilder, PointLight, Scene, SceneInstrumentation, SpotLight, UniversalCamera, Vector3, type Light } from "@babylonjs/core";
import { QUALITY, Settings } from "../../src/core/settings.ts";
import { Lighting } from "../../src/render/lighting.ts";
import { makeEngine, makeCamera, pbr, frames, whenReady } from "./render-env-util.ts";

function lum(px: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < px.length; i += 4) s += px[i] * 0.2126 + px[i + 1] * 0.7152 + px[i + 2] * 0.0722;
  return Math.round((s / (px.length / 4)) * 100) / 100;
}

export async function probe(): Promise<unknown> {
  const { scene, engine } = makeEngine();
  const cam = makeCamera(scene);
  cam.position.set(6.4, 9, 4.4);
  cam.setTarget(new Vector3(6.4, 0, 4.401));
  const settings = new Settings();
  settings.data.quality = "medium"; // pointShadows 0 at first
  const lighting = new Lighting(scene, settings);
  const inst = new SceneInstrumentation(scene);
  const out: Record<string, unknown> = {};
  const fail: string[] = [];
  const check = (name: string, ok: boolean, info?: unknown) => {
    out[name] = info === undefined ? ok : { ok, info };
    if (!ok) fail.push(name);
  };

  // Floor + a few casters.
  const floor = MeshBuilder.CreateBox("floor", { width: 12.8, height: 0.1, depth: 8.8 }, scene);
  floor.position.set(6.4, -0.05, 4.4);
  floor.material = pbr(scene, 0xb0a898, 0.9);
  lighting.registerReceiver(floor);
  const boxes = [0, 1, 2, 3].map((i) => {
    const b = MeshBuilder.CreateBox("crate" + i, { size: 0.6 }, scene);
    b.position.set(2 + i * 3, 0.3, 4.4);
    b.material = pbr(scene, 0x8a6a4a, 0.7);
    lighting.registerReceiver(b);
    lighting.setShadowCaster(b, true);
    return b;
  });
  check("pbrGltfFalloff", (floor.material as unknown as { useGLTFLightFalloff: boolean }).useGLTFLightFalloff === true);

  // 15 ceiling points + 1 spot, all mains.
  const lights: Light[] = [];
  for (let i = 0; i < 15; i++) {
    const l = new PointLight("p" + i, new Vector3(1 + (i % 5) * 2.7, 2.45, 1.5 + Math.floor(i / 5) * 2.9), scene);
    l.diffuse = new Color3(1, 0.75, 0.5);
    l.intensity = 1.5;
    l.range = 3.5;
    lighting.addLight(l, null, true);
    lights.push(l);
  }
  const spot = new SpotLight("spot", new Vector3(6.4, 2.6, 4.4), new Vector3(0, -1, 0), 1.2, 2, scene);
  spot.intensity = 2;
  lighting.addLight(spot, "living", true); // no range given → default range
  lights.push(spot);
  check("clustered16", lighting.clusteredCount === 16, lighting.clusteredCount);
  check("sceneLights3", scene.lights.length === 3, scene.lights.map((l) => l.name));
  check("defaultRange", spot.range === lighting.tuning.defaultRange, spot.range);

  await whenReady(scene, 240000);
  lighting.sun.intensity = 0; // isolate the interior lights for the luminance checks
  lighting.sky.intensity = 0;
  lighting.update(1 / 60);
  await frames(scene, 3);
  const w = engine.getRenderWidth();
  const h = engine.getRenderHeight();
  const read = async () => lum((await engine.readPixels(0, 0, w, h, true, false)) as Uint8Array);
  const lumOn = await read();

  // ---- power cut
  lighting.setPower(false);
  lighting.update(1 / 60);
  await frames(scene, 2);
  const lumOff = await read();
  check("powerOffIntensities", lights.every((l) => l.intensity === 0) && !lighting.powered);
  check("powerOffDarker", lumOff < lumOn * 0.3, { lumOn, lumOff });
  lighting.setPower(true);
  lighting.update(1 / 60);
  check("powerOnRestored", lights.every((l, i) => l.intensity === (i < 15 ? 1.5 : 2)));

  // ---- flicker
  const fl = lights[0];
  lighting.flicker(fl, 1);
  const samples: number[] = [];
  for (let i = 0; i < 50; i++) {
    lighting.update(1 / 60);
    samples.push(fl.intensity);
  }
  for (let i = 0; i < 20; i++) lighting.update(1 / 60);
  check("flickerVaries", Math.min(...samples) < 1.2 && Math.max(...samples) > 1.2, { min: Math.min(...samples), max: Math.max(...samples) });
  check("flickerEnds", fl.intensity === 1.5, fl.intensity);

  // ---- owner changes intensity / disables a clustered light
  lights[1].intensity = 3;
  lighting.update(1 / 60);
  lighting.setPower(false);
  lighting.setPower(true);
  check("ownerIntensityAdopted", lights[1].intensity === 3, lights[1].intensity);
  lights[2].setEnabled(false);
  lighting.update(1 / 60);
  check("setEnabledHonoured", lights[2].intensity === 0, lights[2].intensity);
  lights[2].setEnabled(true);
  lighting.update(1 / 60);
  check("reEnabled", lights[2].intensity === 1.5, lights[2].intensity);

  // ---- removal / disposal
  lighting.removeLight(lights[3]);
  lights[3].dispose();
  check("removeThenDispose", lighting.clusteredCount === 15 && lighting.lightCount === 15 && scene.lights.indexOf(lights[3]) < 0);
  lights[4].dispose(); // owner forgot removeLight
  check("disposeWithoutRemove", lighting.clusteredCount === 14 && lighting.lightCount === 14);
  lighting.removeLight(lights[5]); // kept by its owner
  lighting.update(1 / 60);
  check("removeKeepsLight", scene.lights.indexOf(lights[5]) >= 0 && lighting.clusteredCount === 13, scene.lights.map((l) => l.name));
  lights[5].dispose();
  await frames(scene, 2);

  // ---- point shadows (High: 1 light nearest the camera)
  cam.position.set(1.5, 1.6, 1.5);
  cam.setTarget(new Vector3(4, 1, 4));
  cam.computeWorldMatrix(); // globalPosition is refreshed by rendering otherwise
  lighting.applyQuality(QUALITY.high);
  lighting.update(1 / 60);
  const sh1 = lighting.shadowedLights.map((l) => l.name);
  check("pointShadowPromoted", sh1.length === 1 && sh1[0] === "p0", { sh1, clustered: lighting.clusteredCount, scene: scene.lights.map((l) => l.name) });
  check("promotedLeftCluster", lighting.clusteredCount === 12 && scene.lights.some((l) => l.name === "p0"));
  await frames(scene, 3);
  cam.position.set(11.8, 1.6, 7.3);
  cam.computeWorldMatrix();
  for (let i = 0; i < 40; i++) lighting.update(1 / 60);
  const sh2 = lighting.shadowedLights.map((l) => l.name);
  check("pointShadowMoved", sh2.length === 1 && sh2[0] !== "p0", sh2);
  check("demotedRejoined", lighting.clusteredCount === 12 && !scene.lights.some((l) => l.name === "p0"), lighting.clusteredCount);
  await frames(scene, 3);

  // ---- cached sun shadows: no shadow pass while nothing moves
  lighting.sun.intensity = 5;
  lighting.applyQuality(QUALITY.medium); // no point shadows: only the sun map is cached
  lighting.update(1 / 60);
  await frames(scene, 4);
  const idle: number[] = [];
  for (let i = 0; i < 4; i++) {
    lighting.update(1 / 60);
    await frames(scene, 1);
    idle.push(inst.drawCallsCounter.current);
  }
  const moving: number[] = [];
  for (let i = 0; i < 4; i++) {
    boxes[1].position.x += 0.05;
    lighting.update(1 / 60);
    await frames(scene, 1);
    moving.push(inst.drawCallsCounter.current);
  }
  check("shadowCacheIdleCheaper", Math.max(...idle.slice(1)) < Math.min(...moving.slice(1)), { idle, moving });

  // ---- quality change keeps casters
  lighting.applyQuality(QUALITY.low);
  const rl = lighting.sunShadows.getShadowMap()?.renderList?.length ?? -1;
  check("qualityKeepsCasters", lighting.sunShadows.mapSize === 1024 && rl === 4, { size: lighting.sunShadows.mapSize, rl });
  lighting.setShadowCaster(boxes[0], false);
  check("casterRemoved", (lighting.sunShadows.getShadowMap()?.renderList?.length ?? -1) === 3);
  await frames(scene, 2);

  lighting.dispose();
  check("disposed", scene.lights.length === 0, scene.lights.map((l) => l.name));

  // ---- fallback without clustering: only the 4 nearest lights are enabled
  const proto = ClusteredLightContainer.prototype as unknown as object;
  const desc = Object.getOwnPropertyDescriptor(proto, "isSupported");
  Object.defineProperty(proto, "isSupported", { get: () => false, configurable: true });
  const scene2 = new Scene(engine);
  let fb: Lighting;
  try {
    fb = new Lighting(scene2, settings);
  } finally {
    if (desc) Object.defineProperty(proto, "isSupported", desc);
  }
  const cam2 = new UniversalCamera("cam2", new Vector3(0, 1.6, 0), scene2);
  scene2.activeCamera = cam2;
  cam2.computeWorldMatrix();
  const fls: PointLight[] = [];
  for (let i = 0; i < 7; i++) {
    const l = new PointLight("f" + i, new Vector3(i * 1.5, 2.4, 0), scene2);
    l.intensity = 1;
    l.range = 4;
    fb.addLight(l, null, true);
    fls.push(l);
  }
  fb.update(1 / 60);
  const enabled = fls.filter((l) => l.isEnabled() && l.intensity > 0).map((l) => l.name);
  check("fallbackNoCluster", fb.cluster === null);
  check("fallbackNearest4", enabled.join(",") === "f0,f1,f2,f3", enabled);
  fb.dispose();
  scene2.dispose();
  return { fail, ...out };
}
