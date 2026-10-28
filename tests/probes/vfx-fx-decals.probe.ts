// Probe: every decal kind on the floor and on the wall (impact, scorch, crack, puddle, settled
// dust), puddle growth via water(), recycling at capacity, and pixel readouts (decal vs bare
// surface) to verify the blend: marks darken, dust lightens, puddles darken + glint.
import { Matrix, Vector3 } from "@babylonjs/core";
import { makeFxScene, makeGroundProbe, makeVfx, renderUntil, addPointLight, label, gpuSync } from "./vfx-fx-util.ts";

export async function probe(): Promise<any> {
  const W = 2.4;
  const { engine, scene, camera } = makeFxScene({ wallZ: W, cam: [0, 1.7, -1.6], target: [0, 0.6, 1.6] });
  addPointLight(scene, 0.3, 2.3, 0.9, 2);
  const { vfx } = makeVfx(scene, makeGroundProbe());
  const d = vfx.decals;
  const out: any = {};
  // floor row
  const floorKinds = ["impact", "scorch", "crack", "puddle", "dust"] as const;
  floorKinds.forEach((k, i) => {
    const x = -1.6 + i * 0.8;
    d.add(k, x, 0, 0.9, 0, 1, 0, k === "puddle" ? 0.6 : k === "dust" ? 0.7 : 0.4, k === "dust" ? { tint: 0xdedbd3 } : undefined);
    label(scene, k, x, 0.003, 0.45, 0.5).rotation.x = Math.PI / 2;
  });
  // wall row
  ["impact", "scorch", "crack", "dust"].forEach((k, i) => {
    const x = -1.2 + i * 0.8;
    d.add(k as never, x, 1.3, W, 0, 0, -1, 0.35);
  });
  // a growing puddle fed with water (20 x 0.25 L = 5 L → ~2 m² film, capped at r = 1.4 m)
  for (let i = 0; i < 20; i++) d.water(1.4, 0, 1.9, 0.25, 1);
  out.afterWater = { puddles: d.puddleCount, area: +d.puddleArea.toFixed(3) };
  out.ready = await renderUntil(scene, () => d.material.isReady(d.mesh) && scene.isReady());
  // let dust fade in fully (5 s) at 10 Hz updates
  for (let i = 0; i < 60; i++) d.update(0.1);
  vfx.update(1 / 60);
  scene.render();
  scene.render();
  gpuSync(engine);
  const w = engine.getRenderWidth(),
    h = engine.getRenderHeight();
  const read = async (x: number, y: number, z: number) => {
    const sp = Vector3.Project(new Vector3(x, y, z), Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(w, h));
    const px = (await engine.readPixels(Math.round(sp.x), Math.round(h - sp.y), 1, 1)) as Uint8Array;
    return [px[0], px[1], px[2]];
  };
  out.pixels = {
    floorBare: await read(-1.2, 0, 0.9),
    impact: await read(-1.6, 0, 0.9),
    scorch: await read(-0.8, 0, 0.9),
    puddle: await read(0.8, 0, 0.9),
    puddleBareNear: await read(0.8, 0, 0.5),
    dust: await read(1.6, 0, 0.9),
    bigPuddle: await read(1.4, 0, 1.9),
    wallBare: await read(-1.6, 1.3, W),
    wallScorch: await read(-0.4, 1.3, W),
  };
  // capacity recycling: add 400 impact marks → count stays at capacity, puddles survive
  for (let i = 0; i < 400; i++) d.add("impact", -3 + (i % 20) * 0.05, 0, -0.5 + Math.floor(i / 20) * 0.05, 0, 1, 0, 0.05);
  out.afterFlood = { count: d.count, capacity: d.capacity, puddles: d.puddleCount };
  // restore the showcase decals for the screenshot? keep flood (shows recycling); re-render
  vfx.update(1 / 60);
  scene.render();
  gpuSync(engine);
  out.ip = { enabled: scene.imageProcessingConfiguration.isEnabled, byPost: scene.imageProcessingConfiguration.applyByPostProcess };
  return out;
}
