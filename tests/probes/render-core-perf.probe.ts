// Probe: buildIsland performance (create vs reuse, small/medium/large islands, glass split).
import { TransformNode } from "@babylonjs/core";
import { makeScene, boxGeom } from "./render-core-util.ts";
import { loadTextures } from "../../src/render/textures.ts";
import { createWorldMaterial } from "../../src/render/worldMaterial.ts";
import { createGlassMaterial } from "../../src/render/glass.ts";
import { IslandBatcher, SurfaceTable, setActiveSurfaceTable } from "../../src/render/batch.ts";
import { S, SURFACES } from "../../src/render/surfaces.ts";
import type { RenderGeom } from "../../src/geom/meshgen.ts";

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

export async function probe(): Promise<unknown> {
  const { scene } = makeScene({ bloom: false });
  const lib = await loadTextures(scene, { proceduralOnly: true });
  const world = createWorldMaterial(scene, lib);
  const glass = createGlassMaterial(scene, lib);
  const table = new SurfaceTable(lib);
  setActiveSurfaceTable(table);
  const b = new IslandBatcher(scene, world.material, glass.material, table, {});
  const make = (n: number, glassEvery = 0): RenderGeom[] => {
    const g: RenderGeom[] = [];
    for (let i = 0; i < n; i++) {
      const surf = glassEvery && i % glassEvery === 0 ? S.glass : i % SURFACES.length === S.glass ? S.wood_oak : i % SURFACES.length;
      g.push(boxGeom((i % 20) * 0.3, Math.floor(i / 400) * 0.3, Math.floor(i / 20) % 20 * 0.3, 0.2, 0.2, 0.2, surf, 0xffffff));
    }
    return g;
  };
  const cases: Array<[string, RenderGeom[]]> = [
    ["small_10parts_240v", make(10)],
    ["medium_100parts_2400v", make(100)],
    ["large_800parts_19200v", make(800)],
    ["mixed_glass_200parts_4800v", make(200, 5)],
  ];
  const out: Record<string, unknown> = {};
  for (const [name, geoms] of cases) {
    const verts = geoms.reduce((a, g) => a + g.vertexCount, 0);
    const node = new TransformNode(name, scene);
    // warm-up
    let m = b.build(node, geoms, null, name);
    for (let i = 0; i < 5; i++) m = b.build(node, geoms, m, name);
    const reuse: number[] = [];
    for (let i = 0; i < 40; i++) {
      const t = performance.now();
      m = b.build(node, geoms, m, name);
      reuse.push(performance.now() - t);
    }
    const create: number[] = [];
    for (let i = 0; i < 10; i++) {
      const t = performance.now();
      const fresh = b.build(node, geoms, null, name + "_c");
      create.push(performance.now() - t);
      b.dispose(fresh);
    }
    b.dispose(m);
    const r = median(reuse),
      c = median(create);
    const rMin = Math.min(...reuse),
      cMin = Math.min(...create);
    out[name] = {
      vertices: verts,
      reuseMs: Math.round(r * 1000) / 1000,
      createMs: Math.round(c * 1000) / 1000,
      reusePer1000: Math.round((r / (verts / 1000)) * 1000) / 1000,
      createPer1000: Math.round((c / (verts / 1000)) * 1000) / 1000,
      // min-of-N: least disturbed by the other agents' probes on this 4-CPU box
      reuseMinPer1000: Math.round((rMin / (verts / 1000)) * 1000) / 1000,
      createMinPer1000: Math.round((cMin / (verts / 1000)) * 1000) / 1000,
    };
  }
  // fracture-like churn: 12 small islands disposed, 12 new ones built (pool hits)
  const small = make(3);
  const churn: number[] = [];
  let live = Array.from({ length: 12 }, (_, i) => b.build(new TransformNode("f" + i, scene), small, null, "frag" + i));
  for (let round = 0; round < 10; round++) {
    const t = performance.now();
    for (const m of live) b.dispose(m);
    live = Array.from({ length: 12 }, (_, i) => b.build(new TransformNode("f" + i, scene), small, null, "frag" + i));
    churn.push((performance.now() - t) / 12);
  }
  for (const m of live) b.dispose(m);
  out.churnPerIslandMs = Math.round(median(churn) * 1000) / 1000;
  out.batchStats = b.stats;
  b.clearPool();
  out.meshesLeft = scene.meshes.length;
  out.geometriesLeft = scene.geometries.length;
  return out;
}
