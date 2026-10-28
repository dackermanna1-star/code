// Probe: every surface on a grid of cubes (one batched island: opaque + glass split), lit by a
// shadow-casting sun + sky fill, ACES + bloom. Checks texture arrays, tiling, normals,
// roughness/metallic, emissive bloom, glass, shadows. Also times buildIsland.
import { Vector3, TransformNode } from "@babylonjs/core";
import { makeScene, boxGeom, renderFrames, setBoxWinding, snap } from "./render-core-util.ts";
import { createInteriorEnvironment, EnvironmentCapture } from "../../src/render/reflections.ts";
import { loadTextures } from "../../src/render/textures.ts";
import { createWorldMaterial } from "../../src/render/worldMaterial.ts";
import { createGlassMaterial } from "../../src/render/glass.ts";
import { IslandBatcher, SurfaceTable, setActiveSurfaceTable } from "../../src/render/batch.ts";
import { SURFACES, S } from "../../src/render/surfaces.ts";
import type { RenderGeom } from "../../src/geom/meshgen.ts";

export async function probe(): Promise<unknown> {
  const params = new URLSearchParams(location.search);
  setBoxWinding(params.get("cw") !== "1");
  const { scene, camera, shadows, engine } = makeScene({ bloom: true });
  const t0 = performance.now();
  const lib = await loadTextures(scene, { proceduralOnly: true });
  const texMs = performance.now() - t0;
  const world = createWorldMaterial(scene, lib);
  const glass = createGlassMaterial(scene, lib);
  const table = new SurfaceTable(lib);
  setActiveSurfaceTable(table);
  const batcher = new IslandBatcher(scene, world.material, glass.material, table, {
    setShadowCaster: (m, cast) => (cast ? shadows.addShadowCaster(m) : shadows.removeShadowCaster(m)),
  });

  const cols = 12;
  const sp = 0.52;
  const geoms: RenderGeom[] = [];
  const order: string[] = [];
  SURFACES.forEach((s, i) => {
    const c = i % cols,
      r = Math.floor(i / cols);
    const x = (c - (cols - 1) / 2) * sp,
      z = r * sp;
    geoms.push(boxGeom(x, 0.2, z, 0.38, 0.38, 0.38, i, 0xffffff));
    order.push(`${i}:${s.name}`);
  });
  // floor slab under everything
  geoms.push(boxGeom(0, -0.05, 2, 8, 0.1, 6, S.concrete, 0xffffff));
  const node = new TransformNode("island", scene);
  const tb = performance.now();
  const meshes = batcher.build(node, geoms, null, "grid");
  const buildMs = performance.now() - tb;
  const verts = geoms.reduce((a, g) => a + g.vertexCount, 0);
  // rebuild reusing buffers
  const tr = performance.now();
  for (let k = 0; k < 10; k++) batcher.build(node, geoms, meshes, "grid");
  const rebuildMs = (performance.now() - tr) / 10;

  const marks: Record<string, number> = {};
  const T0 = performance.now();
  const mark = (k: string): void => {
    marks[k] = Math.round(performance.now() - T0);
    console.log("mark", k, marks[k]);
  };
  const env = createInteriorEnvironment(scene, 64);
  mark("env");
  const capture = new EnvironmentCapture(scene, env);
  camera.position = new Vector3(0, 2.6, -2.2);
  camera.setTarget(new Vector3(0, 0, 1.6));
  await scene.whenReadyAsync();
  mark("ready");
  renderFrames(scene, 4);
  mark("frames");
  const sheets: string[] = [];
  sheets.push(snap(scene));
  mark("snap0");
  // close-ups: front rows (woods/walls/ceramics/metals) and back rows (printed/emissive)
  camera.position = new Vector3(-1.6, 1.1, -1.0);
  camera.setTarget(new Vector3(-1.2, 0.1, 0.8));
  sheets.push(snap(scene));
  camera.position = new Vector3(1.6, 1.1, -1.0);
  camera.setTarget(new Vector3(1.2, 0.1, 0.8));
  sheets.push(snap(scene));
  camera.position = new Vector3(-1.4, 1.3, 1.2);
  camera.setTarget(new Vector3(-1.2, 0.1, 3.2));
  sheets.push(snap(scene));
  camera.position = new Vector3(1.4, 1.3, 1.2);
  camera.setTarget(new Vector3(1.2, 0.1, 3.2));
  sheets.push(snap(scene));
  void capture;
  return {
    sheets,
    timings: marks,
    texMs: Math.round(texMs),
    texReport: lib.report,
    layers: lib.layerCounts,
    vertices: verts,
    buildMs: Math.round(buildMs * 100) / 100,
    rebuildMs: Math.round(rebuildMs * 100) / 100,
    msPer1000: Math.round((rebuildMs / (verts / 1000)) * 1000) / 1000,
    stats: batcher.stats,
    opaque: !!meshes.opaque,
    glass: !!meshes.glass,
    drawCalls: (engine as unknown as { _drawCalls?: { current: number } })._drawCalls?.current ?? null,
    order: order.join(" "),
  };
}
