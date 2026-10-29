// Probe: the world material under interior lights and as thin instances.
//  1. Batched floor (world material) lit by 4 point lights in a ClusteredLightContainer (the
//     render-env setup) + 1 ordinary point light: every pool must be lit, and fall to the
//     ambient level beyond `range` (GLTF falloff, no tile seams); intensity 0 turns one off.
//  2. Thin-instanced cubes sharing the world material with per-instance `surf` + `color`
//     buffers (the VFX micro-debris path): textured, emissive bulb instance glows, mains power
//     off (plugin.setPowered(false)) kills mains emissive but not always-on (city_windows).
import { Vector3, TransformNode, PointLight, Color3, ClusteredLightContainer, MeshBuilder, Matrix } from "@babylonjs/core";
import { makeScene, boxGeom, snap, lumAtWorld, renderFrames, readyOrTimeout } from "./render-core-util.ts";
import { loadTextures } from "../../src/render/textures.ts";
import { createWorldMaterial } from "../../src/render/worldMaterial.ts";
import { createGlassMaterial } from "../../src/render/glass.ts";
import { IslandBatcher, SurfaceTable, setActiveSurfaceTable, surfAttrib, colorAttrib } from "../../src/render/batch.ts";
import { S } from "../../src/render/surfaces.ts";

export async function probe(): Promise<unknown> {
  const { scene, camera, sun } = makeScene({ bloom: true, clear: [0.02, 0.02, 0.03] });
  // night-ish: the sun barely contributes so the point-light pools dominate
  sun.intensity = 0.05;
  const hemi = scene.getLightByName("hemi");
  if (hemi) hemi.intensity = 0.04;
  const lib = await loadTextures(scene, { proceduralOnly: true });
  const world = createWorldMaterial(scene, lib);
  const glass = createGlassMaterial(scene, lib);
  const table = new SurfaceTable(lib);
  setActiveSurfaceTable(table);
  const b = new IslandBatcher(scene, world.material, glass.material, table, {});
  b.build(new TransformNode("floorNode", scene), [boxGeom(0, -0.05, 0, 10, 0.1, 6, S.paint_wall, 0xd8d8d8)], null, "floor");

  // ---- point lights: 4 clustered + 1 plain
  const pools = [new Vector3(-3.5, 0, -1.2), new Vector3(-1.2, 0, 1.3), new Vector3(1.2, 0, -1.3), new Vector3(3.5, 0, 1.2)];
  const plainPool = new Vector3(0, 0, 0);
  const mk = (p: Vector3, name: string): PointLight => {
    const l = new PointLight(name, new Vector3(p.x, 1.4, p.z), scene);
    l.diffuse = Color3.FromHexString("#ffd2a0");
    l.intensity = 2.5;
    l.range = 2.2;
    return l;
  };
  const clustered = pools.map((p, i) => mk(p, "cl" + i));
  const cluster = new ClusteredLightContainer("cluster", clustered, scene);
  const plain = mk(plainPool, "plain");
  plain.intensity = 1.5;
  // ---- thin instances (VFX micro-debris path)
  const cube = MeshBuilder.CreateBox("ti", { size: 0.5 }, scene);
  cube.material = world.material;
  const instSurf = [S.wood_oak, S.bulb_on, S.steel_brushed, S.rug_pattern, S.city_windows];
  const n = instSurf.length;
  const mats = new Float32Array(n * 16),
    surf = new Float32Array(n * 4),
    col = new Float32Array(n * 4);
  const instPos: Vector3[] = [];
  instSurf.forEach((s, i) => {
    const p = new Vector3(-2 + i * 1.0, 0.25, 2.3);
    instPos.push(p);
    Matrix.Translation(p.x, p.y, p.z).copyToArray(mats, i * 16);
    surfAttrib(s, surf, i * 4);
    colorAttrib(s, 0xffffff, col, i * 4);
  });
  cube.thinInstanceSetBuffer("matrix", mats, 16, false);
  cube.thinInstanceSetBuffer("surf", surf, 4, false);
  cube.thinInstanceSetBuffer("color", col, 4, false);

  camera.position = new Vector3(0, 7.5, -3.2);
  camera.setTarget(new Vector3(0, 0, 0.3));
  const notReady = await readyOrTimeout(scene, 20000);
  await renderFrames(scene, 4);
  const L = async (p: Vector3): Promise<number> => lumAtWorld(scene, p, 2);
  const lit = { clustered: [] as number[], plain: 0, between: 0, beyondRange: 0 };
  for (const p of pools) lit.clustered.push(await L(p));
  lit.plain = await L(plainPool);
  lit.between = await L(new Vector3(-2.35, 0, 0.05));
  lit.beyondRange = await L(new Vector3(-4.6, 0, 2.6));
  const sheets = [snap(scene, 2)];
  // one clustered light off via intensity (setEnabled is ignored by clusters)
  clustered[0].intensity = 0;
  await renderFrames(scene, 2);
  const offPool = await L(pools[0]);
  clustered[0].intensity = 2.5;
  // thin instances: top faces
  const top = (i: number): Vector3 => new Vector3(instPos[i].x, 0.5, instPos[i].z);
  const inst = { wood: await L(top(0)), bulb: await L(top(1)), steel: await L(top(2)), rug: await L(top(3)), city: await L(top(4)) };
  world.plugin.setPowered(false);
  await renderFrames(scene, 2);
  const instOff = { bulb: await L(top(1)), city: await L(top(4)) };
  sheets.push(snap(scene, 2));
  world.plugin.setPowered(true);
  return {
    notReady,
    clusterSupported: cluster.isSupported,
    sceneLights: scene.lights.map((l) => l.name),
    lit,
    offPool,
    inst,
    instOff,
    checks: {
      allPoolsLit: lit.clustered.every((v) => v > lit.beyondRange + 25) && lit.plain > lit.beyondRange + 25,
      clusteredOffWorks: offPool < lit.clustered[0] - 25,
      bulbInstanceGlows: inst.bulb > 200,
      mainsOffKillsBulb: instOff.bulb < inst.bulb - 60,
      cityAlwaysOn: instOff.city > inst.city - 10,
    },
    sheets,
  };
}
