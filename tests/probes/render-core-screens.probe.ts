// Probe: screens of every kind and state on batched device bodies (world material).
import { Vector3, TransformNode } from "@babylonjs/core";
import { makeScene, snap, boxGeom } from "./render-core-util.ts";
import { loadTextures } from "../../src/render/textures.ts";
import { createWorldMaterial } from "../../src/render/worldMaterial.ts";
import { createGlassMaterial } from "../../src/render/glass.ts";
import { IslandBatcher, SurfaceTable, setActiveSurfaceTable } from "../../src/render/batch.ts";
import { createInteriorEnvironment } from "../../src/render/reflections.ts";
import { createScreen, setScreensPowered, type ScreenKind, type ScreenState, type ScreenHandle } from "../../src/render/screens.ts";
import { polyBox, faceAttr } from "../../src/geom/poly.ts";
import { S } from "../../src/render/surfaces.ts";
import type { RenderGeom } from "../../src/geom/meshgen.ts";

export async function probe(): Promise<unknown> {
  const { scene, camera } = makeScene({ bloom: true, clear: [0.12, 0.12, 0.14] });
  scene.environmentTexture = createInteriorEnvironment(scene, 64);
  const lib = await loadTextures(scene, { proceduralOnly: true });
  const world = createWorldMaterial(scene, lib);
  const glass = createGlassMaterial(scene, lib);
  const table = new SurfaceTable(lib);
  setActiveSurfaceTable(table);
  const batcher = new IslandBatcher(scene, world.material, glass.material, table, {});
  const specs: Array<{ kind: ScreenKind; state: ScreenState; w: number; h: number; x: number; y: number }> = [
    { kind: "tv", state: "on", w: 0.9, h: 0.52, x: -1.5, y: 1.25 },
    { kind: "tv", state: "off", w: 0.9, h: 0.52, x: -0.5, y: 1.25 },
    { kind: "tv", state: "cracked", w: 0.9, h: 0.52, x: 0.5, y: 1.25 },
    { kind: "tv", state: "dead", w: 0.9, h: 0.52, x: 1.5, y: 1.25 },
    { kind: "monitor", state: "on", w: 0.6, h: 0.375, x: -1.5, y: 0.5 },
    { kind: "laptop", state: "on", w: 0.34, h: 0.21, x: -0.75, y: 0.5 },
    { kind: "phone", state: "on", w: 0.07, h: 0.14, x: -0.25, y: 0.5 },
    { kind: "microwave", state: "on", w: 0.12, h: 0.045, x: 0.2, y: 0.5 },
    { kind: "monitor", state: "cracked", w: 0.6, h: 0.375, x: 0.9, y: 0.5 },
  ];
  const handles: ScreenHandle[] = [];
  const geoms: RenderGeom[] = [];
  const node = new TransformNode("devices", scene);
  for (const s of specs) {
    const bez = Math.max(0.012, s.w * 0.03);
    // body (dark plastic) behind the panel, panel part = thin box whose -Z face shows the image
    geoms.push(boxGeom(s.x, s.y, 0.03, s.w + bez * 2, s.h + bez * 2, 0.05, S.plastic_glossy, 0x1a1a1c));
    const panel = polyBox({ x: s.w, y: s.h, z: 0.004 }, faceAttr(S.lcd_off), { p: { x: s.x, y: s.y, z: 0.003 }, q: { x: 0, y: 0, z: 0, w: 1 } });
    handles.push(createScreen(scene, { parent: node, poly: panel, front: { x: 0, y: 0, z: -1 } }, s.kind, { state: s.state }));
  }
  geoms.push(boxGeom(0, -0.05, 0.5, 5, 0.1, 2, S.wood_oak));
  batcher.build(node, geoms, null, "devices");
  camera.position = new Vector3(0, 0.95, -2.6);
  camera.setTarget(new Vector3(0, 0.85, 0));
  await scene.whenReadyAsync();
  const sheets: string[] = [];
  sheets.push(snap(scene, 3));
  // advance time a few seconds for animation + measure update cost
  const t0 = performance.now();
  for (let i = 0; i < 30; i++) scene.render();
  const frameMs = (performance.now() - t0) / 30;
  sheets.push(snap(scene, 2));
  // power cut: mains screens go black (laptop/phone stay on)
  setScreensPowered(scene, false);
  sheets.push(snap(scene, 2));
  setScreensPowered(scene, true);
  handles[0].setState("cracked");
  handles[4].setState("dead");
  sheets.push(snap(scene, 2));
  for (const h of handles) h.dispose();
  return { frameMs: Math.round(frameMs * 10) / 10, screensLeft: scene.meshes.filter((m) => m.name.startsWith("screen_")).length, sheets };
}
