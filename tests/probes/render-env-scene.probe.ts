// Probe: stand-in apartment lit by the render-env Lighting + PostFX + Exterior + Atmosphere.
// Returns screenshots (data URLs) of several viewpoints plus timing/stat numbers.
// Run: node tests/probe.mjs tests/probes/render-env-scene.probe.ts
//   (or a wrapper that writes value.shots.* to PNG files).
import { Settings } from "../../src/core/settings.ts";
import { Lighting } from "../../src/render/lighting.ts";
import { PostFX } from "../../src/render/postfx.ts";
import { Exterior } from "../../src/render/exterior.ts";
import { Atmosphere } from "../../src/render/atmosphere.ts";
import { makeEngine, makeCamera, buildStandIn, registerAll, addCeilingLights, frames, look, shot } from "./render-env-util.ts";

const VIEWS: Record<string, [[number, number, number], [number, number, number]]> = {
  spawn: [
    [7.4, 1.65, 2.2],
    [4.0, 1.4, 0.9],
  ],
  slider: [
    [8.6, 1.6, 4.2],
    [5.6, 1.0, -1.0],
  ],
  sunPatch: [
    [5.2, 1.6, 3.6],
    [9.2, 1.0, 1.0],
  ],
  master: [
    [3.2, 1.6, 3.9],
    [1.6, 1.2, 0.0],
  ],
  balcony: [
    [6.6, 1.6, -1.1],
    [-120, 40, -150],
  ],
  balconyDown: [
    [6.6, 1.65, -1.2],
    [6.2, -6, -3.5],
  ],
  bed2: [
    [9.8, 1.6, 3.8],
    [12.8, 1.3, 1.8],
  ],
  facade: [
    [24, 6, -28],
    [4, 0, 2],
  ],
};

export async function probe(): Promise<unknown> {
  const params = new URLSearchParams(location.search);
  const only = (globalThis as { __views?: string[] }).__views ?? (params.get("views") ? params.get("views")!.split(",") : null);
  const { scene, canvas } = makeEngine();
  const cam = makeCamera(scene);
  const settings = new Settings();
  settings.data.quality = "high";
  settings.data.ps2Mode = false;
  const t0 = performance.now();
  const lighting = new Lighting(scene, settings);
  const standIn = buildStandIn(scene);
  registerAll(lighting, standIn);
  for (const l of addCeilingLights(scene)) lighting.addLight(l, (l.metadata as { room: string }).room, true);
  const t1 = performance.now();
  const exterior = new Exterior(scene, lighting);
  exterior.build();
  const t2 = performance.now();
  const atmosphere = new Atmosphere(scene, lighting);
  atmosphere.build();
  const t3 = performance.now();
  const post = new PostFX(scene, cam, settings);
  const t4 = performance.now();
  console.log(`setup done lighting ${(t1 - t0).toFixed(0)} ext ${(t2 - t1).toFixed(0)} atm ${(t3 - t2).toFixed(0)} post ${(t4 - t3).toFixed(0)}`);
  await scene.whenReadyAsync();
  console.log("ready");
  const t5 = performance.now();
  const shots: Record<string, string> = {};
  const timings: Record<string, number> = {};
  for (const [name, [pos, target]] of Object.entries(VIEWS)) {
    if (only && !only.includes(name)) continue;
    look(cam, pos, target);
    for (let i = 0; i < 4; i++) {
      lighting.update(1 / 60);
      exterior.update(1 / 60);
      atmosphere.update(1 / 60);
      post.update(1 / 60);
      await frames(scene, 1);
    }
    const ts = performance.now();
    for (let i = 0; i < 3; i++) scene.render();
    timings[name] = +((performance.now() - ts) / 3).toFixed(1);
    shots[name] = shot(canvas);
    console.log(`view ${name} ${timings[name]} ms/frame`);
  }
  // PS2 mode and SSAO off comparisons from the slider view.
  if (!only || only.includes("ps2")) {
    look(cam, VIEWS.slider[0], VIEWS.slider[1]);
    post.setPS2(true);
    await frames(scene, 4);
    shots.ps2 = shot(canvas);
    post.setPS2(false);
    await frames(scene, 2);
  }
  if (!only || only.includes("nossao")) {
    look(cam, VIEWS.spawn[0], VIEWS.spawn[1]);
    post.applyQuality({ ...settings.quality, ssao: false });
    await frames(scene, 4);
    shots.nossao = shot(canvas);
    post.applyQuality(settings.quality);
    await frames(scene, 2);
  }
  return {
    shots,
    timings,
    setupMs: { lighting: +(t1 - t0).toFixed(1), exterior: +(t2 - t1).toFixed(1), atmosphere: +(t3 - t2).toFixed(1), post: +(t4 - t3).toFixed(1), ready: +(t5 - t4).toFixed(1) },
    cascaded: lighting.cascaded,
    lights: lighting.lightCount,
    meshes: scene.meshes.length,
    activeIndices: scene.getActiveIndices(),
    postProcesses: cam._postProcesses.filter((p) => p).map((p) => p!.name),
  };
}
