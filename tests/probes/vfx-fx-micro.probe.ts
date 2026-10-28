// Probe: 3000 micro-debris pieces of every kind (glass, ceramic, wood, gypsum, concrete,
// plastic, metal, foam, paper, soil) thrown from several break points onto the floor and a table
// top, rendered with render-core's world material via per-instance surf/color attributes.
// Measures the simulation step (moving → all settled), instance uploads, draw calls, and that
// settled debris costs nothing; checks pieces rest on the right surfaces. Screenshot: close-up.
import { MeshBuilder, PBRMaterial, Color3 } from "@babylonjs/core";
import { S } from "../../src/render/surfaces.ts";
import type { MicroKind } from "../../src/destruction/model/materials.ts";
import { makeFxScene, makeGroundProbe, makeVfx, renderUntil, tryWorldMaterial, addPointLight, stats, gpuSync } from "./vfx-fx-util.ts";

export async function probe(): Promise<any> {
  const { engine, scene, sun, shadows } = makeFxScene({ wallZ: 3.0, cam: [0.2, 1.25, -0.9], target: [0.15, 0.1, 1.1], shadows: true });
  addPointLight(scene, 0.6, 2.2, 0.6, 1.6);
  const table = { min: [0.55, 0, 0.9] as [number, number, number], max: [1.35, 0.72, 1.6] as [number, number, number] };
  const tm = MeshBuilder.CreateBox("table", { width: 0.8, height: 0.04, depth: 0.7 }, scene);
  tm.position.set(0.95, 0.7, 1.25);
  const tmat = new PBRMaterial("tableMat", scene);
  tmat.albedoColor = new Color3(0.45, 0.3, 0.18);
  tmat.metallic = 0;
  tmat.roughness = 0.6;
  tm.material = tmat;
  tm.receiveShadows = true;
  shadows?.addShadowCaster(tm);
  void sun;
  const wm = await tryWorldMaterial(scene);
  const { vfx } = makeVfx(scene, makeGroundProbe([table]), wm.material);
  const out: any = { worldMaterial: wm.info };
  out.ready = await renderUntil(scene, () => scene.isReady());

  const kinds: Array<[MicroKind, number, number]> = [
    ["glass", S.glass, 0xffffff],
    ["ceramic", S.ceramic_glaze, 0xf4f1ea],
    ["wood", S.wood_oak, 0xffffff],
    ["gypsum", S.gypsum, 0xffffff],
    ["concrete", S.concrete_broken, 0xffffff],
    ["plastic", S.plastic, 0xd23b2a],
    ["metal", S.steel_brushed, 0xffffff],
    ["foam", S.foam, 0xe8d27a],
    ["paper", S.paper_printed, 0xffffff],
    ["soil", S.soil, 0xffffff],
  ];
  // 10 break points (one per kind) on an arc in front of the camera + over the table
  const N = 3000;
  let spawned = 0;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    const k = i % kinds.length;
    const [kind, surf, tint] = kinds[k];
    const onTable = k === 1 || k === 4 || k === 8; // some break right above the table
    const cx = onTable ? 0.75 + (k % 3) * 0.2 : -0.9 + k * 0.17,
      cz = onTable ? 1.25 : 0.95 + (k % 2) * 0.35;
    const cy = onTable ? 1.0 : 0.6 + (k % 3) * 0.3;
    const a = Math.random() * Math.PI * 2,
      sp = 0.4 + Math.random() * 2.2;
    const size = kind === "glass" ? 0.006 + Math.random() * 0.018 : kind === "paper" ? 0.015 + Math.random() * 0.025 : 0.005 + Math.random() * 0.02;
    vfx.micro(kind, { x: cx, y: cy, z: cz }, { x: Math.cos(a) * sp, y: Math.random() * 2.2, z: Math.sin(a) * sp }, size, surf, tint);
    spawned++;
  }
  out.spawnMs = +(performance.now() - t0).toFixed(2);
  out.afterSpawn = { micro: vfx.microCount, moving: vfx.sim.movingCount };
  // simulate up to 8 s at 60 Hz; render at low res, sync GPU; collect sim + upload timings
  const simMs: number[] = [];
  const syncMs: number[] = [];
  const movingAt: number[] = [];
  let settledFrame = -1;
  for (let f = 0; f < 480; f++) {
    engine.setHardwareScalingLevel(4);
    vfx.fixedUpdate(1 / 60);
    simMs.push(vfx.stats().fixedMs);
    const s0 = performance.now();
    vfx.update(1 / 60);
    syncMs.push(performance.now() - s0);
    if (f % 30 === 0) movingAt.push(vfx.sim.movingCount);
    if (f % 4 === 0) {
      scene.render();
      gpuSync(engine);
    }
    if (vfx.sim.movingCount === 0 && settledFrame < 0) settledFrame = f;
    if (settledFrame >= 0 && f > settledFrame + 30) break;
  }
  engine.setHardwareScalingLevel(1);
  out.settledAfterFrames = settledFrame;
  out.movingEvery30 = movingAt;
  out.simMsFirst60 = stats(simMs.slice(0, 60));
  out.simMsAll = stats(simMs);
  out.syncMsFirst60 = stats(syncMs.slice(0, 60));
  // settled cost
  const idle: number[] = [];
  for (let f = 0; f < 60; f++) {
    vfx.fixedUpdate(1 / 60);
    idle.push(vfx.stats().fixedMs);
    vfx.update(1 / 60);
  }
  out.simMsSettled = stats(idle);
  out.stats = vfx.stats();
  out.invariants = vfx.sim.checkInvariants();
  // where did pieces end up? count resting on the table top vs floor, none below the floor
  let onTableN = 0,
    floorN = 0,
    below = 0,
    nan = 0;
  for (const sb of vfx.sim.activeBins) {
    for (let k = 0; k < sb.count; k++) {
      const y = sb.mat[k * 16 + 13],
        x = sb.mat[k * 16 + 12],
        z = sb.mat[k * 16 + 14];
      if (!Number.isFinite(x + y + z)) nan++;
      else if (y < -0.001) below++;
      else if (y > 0.7 && x >= table.min[0] && x <= table.max[0] && z >= table.min[2] && z <= table.max[2]) onTableN++;
      else if (y < 0.05) floorN++;
    }
  }
  out.rest = { onTable: onTableN, floor: floorN, below, nan };
  out.bins = vfx.sim.activeBins.length;
  // tight-loop timing (no rendering in between): pure sim cost for 3000 freshly thrown pieces
  {
    const { MicroSim } = await import("../../src/vfx/microSim.ts");
    const sim = new MicroSim({ capacity: 6000, groundProbe: makeGroundProbe([table]) });
    const spawn = { kind: 0, x: 0, y: 1, z: 1, vx: 0, vy: 0, vz: 0, size: 0.012, r: 1, g: 1, b: 1, a: 1, s0: 0, s1: 0, s2: 128, s3: 0 };
    const tight: number[] = [];
    for (let rep = 0; rep < 3; rep++) {
      for (let i = 0; i < 3000; i++) {
        spawn.kind = i % 10;
        spawn.x = -1 + (i % 50) * 0.04;
        spawn.z = 0.8 + Math.floor(i / 50) * 0.01;
        spawn.y = 0.5 + (i % 7) * 0.15;
        spawn.vx = Math.cos(i) * 2;
        spawn.vy = Math.sin(i * 1.3) * 2;
        spawn.vz = Math.sin(i) * 2;
        sim.spawn(spawn);
      }
      for (let f = 0; f < 40; f++) {
        const t = performance.now();
        sim.step(1 / 60);
        tight.push(performance.now() - t);
      }
      sim.clear();
    }
    out.tightSim3000MovingMs = stats(tight);
  }
  out.microMeshes = vfx.microRender.meshCount;
  // final frame at full resolution
  scene.render();
  scene.render();
  gpuSync(engine);
  void spawned;
  return out;
}
