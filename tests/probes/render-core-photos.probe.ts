// Probe: photo texture path (manifest + JPG decode into the texture arrays) on the surface grid.
// The probe harness serves only the bundle, so the JPGs are bundled via import.meta.glob and
// resolved through TextureLoadOptions.resolve.
import { Vector3, TransformNode } from "@babylonjs/core";
import { makeScene, boxGeom, snap } from "./render-core-util.ts";
import { loadTextures, type ManifestRow } from "../../src/render/textures.ts";
import { createWorldMaterial } from "../../src/render/worldMaterial.ts";
import { createGlassMaterial } from "../../src/render/glass.ts";
import { IslandBatcher, SurfaceTable, setActiveSurfaceTable } from "../../src/render/batch.ts";
import { createInteriorEnvironment } from "../../src/render/reflections.ts";
import { SURFACES, S } from "../../src/render/surfaces.ts";
import type { RenderGeom } from "../../src/geom/meshgen.ts";

const files = import.meta.glob("../../public/assets/textures/*.jpg", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const manifests = import.meta.glob("../../public/assets/textures/manifest.json", { import: "default", eager: true }) as Record<string, ManifestRow[]>;

export async function probe(): Promise<unknown> {
  const byName: Record<string, string> = {};
  for (const [k, v] of Object.entries(files)) byName[k.split("/").pop() as string] = v;
  const manifest = Object.values(manifests)[0] ?? [];
  const { scene, camera, shadows } = makeScene({ bloom: true });
  const t0 = performance.now();
  const lib = await loadTextures(scene, { manifest, resolve: (f) => byName[f] ?? `missing/${f}` });
  const texMs = performance.now() - t0;
  scene.environmentTexture = createInteriorEnvironment(scene, 64);
  const world = createWorldMaterial(scene, lib);
  const glass = createGlassMaterial(scene, lib);
  const table = new SurfaceTable(lib);
  setActiveSurfaceTable(table);
  const batcher = new IslandBatcher(scene, world.material, glass.material, table, {
    setShadowCaster: (m, cast) => (cast ? shadows.addShadowCaster(m) : shadows.removeShadowCaster(m)),
  });
  const cols = 12,
    sp = 0.52;
  const geoms: RenderGeom[] = [];
  SURFACES.forEach((_s, i) => {
    const c = i % cols,
      r = Math.floor(i / cols);
    geoms.push(boxGeom((c - (cols - 1) / 2) * sp, 0.2, r * sp, 0.38, 0.38, 0.38, i));
  });
  geoms.push(boxGeom(0, -0.05, 2, 8, 0.1, 6, S.concrete));
  batcher.build(new TransformNode("grid", scene), geoms, null, "grid");
  await scene.whenReadyAsync();
  const sheets: string[] = [];
  camera.position = new Vector3(0, 2.6, -2.2);
  camera.setTarget(new Vector3(0, 0, 1.6));
  sheets.push(snap(scene, 3));
  camera.position = new Vector3(-1.6, 1.1, -1.0);
  camera.setTarget(new Vector3(-1.2, 0.1, 0.8));
  sheets.push(snap(scene, 2));
  camera.position = new Vector3(1.6, 1.1, -1.0);
  camera.setTarget(new Vector3(1.2, 0.1, 0.8));
  sheets.push(snap(scene, 2));
  return { texMs: Math.round(texMs), report: { photo: lib.report.photo.length, procedural: lib.report.procedural.length, fallback: lib.report.fallback }, layers: lib.layerCounts, files: Object.keys(byName).length, sheets };
}
