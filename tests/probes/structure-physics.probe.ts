// Headless runtime probe for the structure (no screenshots): spawn every structural assembly
// into the real Physics + Destruction (render/vfx mocked), settle 2 s, verify nothing moved or
// fell, check that every door/window/slider joint group got a constraint and that the slabs,
// walls and floors are static islands, and report counts and timings.
// Run: PROBE_LOGS=1 node tests/probe.mjs tests/probes/structure-physics.probe.ts --timeout 600000

import { Engine, Scene, Color4, FreeCamera, Vector3, type UniversalCamera } from "@babylonjs/core";
import { createPhysics } from "../../src/physics/physics.ts";
import { Destruction } from "../../src/destruction/destructionSystem.ts";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Time, FIXED_DT } from "../../src/core/time.ts";
import { Settings } from "../../src/core/settings.ts";
import { Rng } from "../../src/core/rng.ts";
import { buildStructure, structureStats } from "../../src/world/structure.ts";
import { MockRender, MockVfx } from "./destruction-util.ts";

export async function probe(): Promise<unknown> {
  const log = (m: string) => console.log(`[structure-physics] ${m}`);
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.5, 0.55, 0.6, 1);
  const cam = new FreeCamera("cam", new Vector3(6, 1.6, 2), scene) as unknown as UniversalCamera;
  // maxHullPoints 64: works around a physics.ts bug (prepareHull path (d) passes its whole
  // 128-point scratch buffer to rawHull, whose k-point view then overflows → RangeError for any
  // part with more than maxHullPoints (default 16) vertices, e.g. 10+-segment cylinders)
  const physics = await createPhysics(scene, { maxHullPoints: 64 });
  const render = new MockRender(scene, cam);
  const events = new EventBus<GameEvents>();
  const time = new Time();
  const settings = new Settings();
  const counts: Record<string, number> = {};
  for (const t of ["impact", "fracture", "bondBreak", "split", "jointBreak"] as Array<keyof GameEvents>) events.on(t, () => (counts[t] = (counts[t] ?? 0) + 1));
  const d = new Destruction({ physics, render, vfx: new MockVfx(), events, time, settings, rng: new Rng(7), scene });
  log("systems ready");

  const tb = performance.now();
  const pieces = buildStructure();
  const buildMs = performance.now() - tb;
  log(`built ${pieces.length} assemblies in ${buildMs.toFixed(0)} ms`);
  const ts = performance.now();
  const ids: number[] = [];
  const slow: Array<{ name: string; ms: number }> = [];
  for (const p of pieces) {
    const t = performance.now();
    ids.push(d.spawn(p.def, p.xf));
    const ms = performance.now() - t;
    if (ms > 150) slow.push({ name: p.def.name, ms: Math.round(ms) });
  }
  const spawnMs = performance.now() - ts;
  log(`spawned in ${spawnMs.toFixed(0)} ms`);
  const before = ids.map((id) => d.positionOf(id));
  const afterSpawn = { destruction: d.stats(), physics: physics.stats() };

  // per-assembly island summary
  const islandInfo = ids.map((id, i) => {
    const a = d.assembly(id)!;
    const isl = [...a.islands];
    return {
      name: pieces[i].def.name,
      islands: isl.length,
      static: isl.filter((s) => s.isStatic).length,
      groups: a.groups.size,
      constraints: [...a.groups.values()].reduce((s, g) => s + g.constraints.length, 0),
    };
  });
  // centres of mass of the moving (jointed) islands at spawn
  const dynStart = new Map<number, { name: string; isl: { id: number }; p: { x: number; y: number; z: number } }>();
  ids.forEach((id, i) => {
    for (const isl of d.assembly(id)!.islands) {
      if (isl.isStatic) continue;
      dynStart.set(isl.id, { name: pieces[i].def.name, isl, p: d.world.toWorldVec(isl, isl.com) });
    }
  });
  const tStep = performance.now();
  for (let i = 0; i < 120; i++) {
    d.beforePhysics(FIXED_DT);
    physics.step(FIXED_DT);
    time.tick();
    d.afterPhysics(FIXED_DT);
    d.update(FIXED_DT);
  }
  const stepMs = (performance.now() - tStep) / 120;
  log(`settled 120 steps, ${stepMs.toFixed(1)} ms/step`);
  const moved: Array<{ name: string; dist: number }> = [];
  ids.forEach((id, i) => {
    const a = before[i],
      b = d.positionOf(id);
    if (!a || !b) return;
    const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    if (dist > 0.002) moved.push({ name: pieces[i].def.name, dist: Math.round(dist * 1000) / 1000 });
  });
  // every jointed assembly: its moving islands (leaves, sashes, sliding panel) must hang in place
  const dynamicMoved: Array<{ name: string; island: number; dist: number }> = [];
  ids.forEach((id) => {
    for (const isl of d.assembly(id)!.islands) {
      const s0 = dynStart.get(isl.id);
      if (!s0 || isl.isStatic) continue;
      const p = d.world.toWorldVec(isl, isl.com);
      const dist = Math.hypot(p.x - s0.p.x, p.y - s0.p.y, p.z - s0.p.z);
      dynamicMoved.push({ name: s0.name, island: isl.id, dist: Math.round(dist * 10000) / 10000 });
    }
  });
  const jointed = islandInfo.filter((x) => x.groups > 0);
  return {
    structure: structureStats(pieces),
    timingsMs: { build: Math.round(buildMs), spawn: Math.round(spawnMs), stepAvg: Math.round(stepMs * 10) / 10 },
    slowSpawns: slow,
    afterSpawn,
    afterSettle: { destruction: d.stats(), physics: physics.stats() },
    events: counts,
    moved,
    dynamicMoved,
    jointed,
    nonStaticStructure: islandInfo.filter((x) => x.groups === 0 && x.static !== x.islands),
  };
}
