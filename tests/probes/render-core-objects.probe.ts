// Probe: real content objects (builder kit + area modules) → geom.polyToRenderGeom → batched
// islands with the world/glass materials, screens on `screen` features, IBL + sun + bloom.
// Visual check of textures/tints/printed surfaces on actual furniture and appliances.
import { Vector3, TransformNode } from "@babylonjs/core";
import { makeScene, snap } from "./render-core-util.ts";
import { loadTextures, type ManifestRow } from "../../src/render/textures.ts";
import { createWorldMaterial } from "../../src/render/worldMaterial.ts";
import { createGlassMaterial } from "../../src/render/glass.ts";
import { IslandBatcher, SurfaceTable, setActiveSurfaceTable } from "../../src/render/batch.ts";
import { createInteriorEnvironment } from "../../src/render/reflections.ts";
import { createScreen } from "../../src/render/screens.ts";
import { polyToRenderGeom, type RenderGeom } from "../../src/geom/meshgen.ts";
import { polyBox, faceAttr } from "../../src/geom/poly.ts";
import { S } from "../../src/render/surfaces.ts";
import { buildObject, registerObjects } from "../../src/objects/registry.ts";
import { LIVING_OBJECTS } from "../../src/objects/living/index.ts";
import { KITCHEN_OBJECTS } from "../../src/objects/kitchen/index.ts";
import { BEDROOM_OBJECTS } from "../../src/objects/bedroom/index.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";

const files = import.meta.glob("../../public/assets/textures/*.jpg", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const manifests = import.meta.glob("../../public/assets/textures/manifest.json", { import: "default", eager: true }) as Record<string, ManifestRow[]>;

export async function probe(): Promise<unknown> {
  registerObjects(LIVING_OBJECTS);
  registerObjects(KITCHEN_OBJECTS);
  registerObjects(BEDROOM_OBJECTS);
  const byName: Record<string, string> = {};
  for (const [k, v] of Object.entries(files)) byName[k.split("/").pop() as string] = v;
  const manifest = Object.values(manifests)[0] ?? [];
  const { scene, camera, shadows } = makeScene({ bloom: true, clear: [0.3, 0.33, 0.38] });
  const lib = await loadTextures(scene, { manifest, resolve: (f) => byName[f] ?? `missing/${f}` });
  scene.environmentTexture = createInteriorEnvironment(scene, 64);
  const world = createWorldMaterial(scene, lib);
  const glass = createGlassMaterial(scene, lib);
  const table = new SurfaceTable(lib);
  setActiveSurfaceTable(table);
  const batcher = new IslandBatcher(scene, world.material, glass.material, table, {
    setShadowCaster: (m, cast) => (cast ? shadows.addShadowCaster(m) : shadows.removeShadowCaster(m)),
  });
  const rows: string[][] = [
    ["microwave", "toaster", "kettle", "coffeeMaker", "tv55", "soundbar", "gameConsole"],
    ["mediaConsole", "coffeeTable", "framedPainting", "bookcase", "tableLamp", "ceramicVase", "fiddleLeafFig"],
    ["sofa3", "armchair", "dresser", "nightstand", "alarmClock", "smartphone", "desk"],
  ];
  const errors: string[] = [];
  const screens: string[] = [];
  let parts = 0,
    verts = 0,
    buildMs = 0;
  const gx = 1.6;
  rows.forEach((row, ri) => {
    row.forEach((type, ci) => {
      let def: AssemblyDef;
      try {
        def = buildObject(type);
      } catch (e) {
        errors.push(`${type}: ${String(e).slice(0, 120)}`);
        return;
      }
      const geoms: RenderGeom[] = [];
      for (const p of def.parts) {
        try {
          geoms.push(polyToRenderGeom(p.poly, { tessCell: p.tessCell }));
        } catch (e) {
          errors.push(`${type}/${p.name}: ${String(e).slice(0, 80)}`);
        }
      }
      parts += def.parts.length;
      verts += geoms.reduce((a, g) => a + g.vertexCount, 0);
      const node = new TransformNode(type, scene);
      node.position.set((ci - (row.length - 1) / 2) * gx, 0, -ri * 2.2);
      const t = performance.now();
      batcher.build(node, geoms, null, type);
      buildMs += performance.now() - t;
      for (const f of def.features ?? []) {
        if (f.type !== "screen") continue;
        const part = def.parts.find((p) => p.name === f.part);
        if (!part) continue;
        try {
          // force on so every screen placement is visible in the screenshots
          createScreen(scene, { parent: node, poly: part.poly }, f.content, { state: "on", mains: f.mains });
          screens.push(`${type}:${f.content}`);
        } catch (e) {
          errors.push(`${type} screen: ${String(e).slice(0, 80)}`);
        }
      }
    });
  });
  // floor
  const floor = new TransformNode("floor", scene);
  batcher.build(floor, [polyToRenderGeom(polyBox({ x: 14, y: 0.04, z: 9 }, faceAttr(S.wood_oak), { p: { x: 0, y: -0.02, z: -2.2 }, q: { x: 0, y: 0, z: 0, w: 1 } }))], null, "floor");
  await scene.whenReadyAsync();
  const sheets: string[] = [];
  const views: Array<[number[], number[]]> = [
    [[0, 1.6, 3.2], [0, 0.4, -1.6]],
    [[-3.2, 0.9, 1.6], [-3.2, 0.3, 0]],
    [[2.4, 1.0, 1.4], [2.4, 0.5, 0]],
    [[-2.4, 1.3, -0.7], [-2.4, 0.6, -2.2]],
    [[1.6, 1.3, -0.7], [1.6, 0.6, -2.2]],
    [[-1.6, 1.4, -2.9], [-1.6, 0.5, -4.4]],
    // top-down on the smartphone (row 2, col 5 → x = 3.2) and alarm clock (x = 1.6)
    [[-2.4, 0.75, -4.0], [-2.4, 0.0, -4.4]],
  ];
  for (const [p, t] of views) {
    camera.position = new Vector3(p[0], p[1], p[2]);
    camera.setTarget(new Vector3(t[0], t[1], t[2]));
    sheets.push(snap(scene, 2));
  }
  return { parts, verts, buildMs: Math.round(buildMs * 10) / 10, errors, screens, layers: lib.layerCounts, sheets };
}
