// Runtime probe for the living/dining room: spawn a light stand-in shell (or, via
// content-living-full.probe.ts, the real structure + living-room fixtures) and every living-room
// placement AWAKE into the real Physics + Render + Destruction systems (VFX mocked), settle 2.5 s,
// report which assemblies moved (things that slide, tip or fall) or split, counts/timings, and
// render a 3×3 contact sheet of the room.
// Run: node tests/probe.mjs tests/probes/content-living-room.probe.ts --timeout 500000 --screenshot /tmp/claude-0/content-living-sheet.png

import { Engine, Scene, Vector3, PointLight, Color3 } from "@babylonjs/core";
import { createPhysics } from "../../src/physics/physics.ts";
import { createRender } from "../../src/render/renderSystem.ts";
import { Destruction } from "../../src/destruction/destructionSystem.ts";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Time, FIXED_DT } from "../../src/core/time.ts";
import { Settings } from "../../src/core/settings.ts";
import { Rng } from "../../src/core/rng.ts";
import { ROOMS } from "../../src/world/plan.ts";
import { buildStructure } from "../../src/world/structure.ts";
import { furnishLivingItems, worldAabb } from "../../src/world/furnish/living.ts";
import { MockVfx } from "./destruction-util.ts";
import { Builder } from "../../src/objects/lib/builder.ts";
import type { Vec3 } from "../../src/geom/vec.ts";

/**
 * Spawn the full structure + fixtures (heavy) or a light stand-in shell. The full variant is
 * tests/probes/content-living-full.probe.ts, which sets `globalThis.__livingFull` before calling.
 */
const structureMode = (): boolean => !!(globalThis as { __livingFull?: boolean }).__livingFull;
import manifest from "../../public/assets/textures/manifest.json";

const photoUrls = import.meta.glob("../../public/assets/textures/*.jpg", { query: "?url", import: "default", eager: true }) as Record<string, string>;

const VIEWS: Array<[string, [number, number, number], [number, number, number]]> = [
  ["from the window → TV wall", [8.6, 1.6, 0.35], [4.3, 0.9, 2.6]],
  ["sofa view → TV", [7.9, 1.25, 2.4], [4.1, 0.9, 2.35]],
  ["TV wall → sofa", [4.7, 1.5, 1.4], [8.6, 0.8, 2.6]],
  ["bookcase close", [5.4, 1.4, 0.9], [4.1, 1.1, 0.95]],
  ["dining table", [7.9, 1.6, 3.2], [6.2, 0.75, 4.2]],
  ["coffee table top-down", [6.5, 2.2, 2.9], [6.5, 0.4, 2.3]],
  ["armchair + fig corner", [6.4, 1.5, 1.6], [8.6, 0.8, 0.5]],
  ["console + devices", [5.0, 0.8, 2.35], [4.2, 0.35, 2.35]],
  ["from the hall", [4.4, 1.65, 4.85], [8.0, 0.8, 1.2]],
];

export async function probe(): Promise<unknown> {
  const STRUCTURE = structureMode();
  const mark = (m: string): void => console.log(`[living-room] ${m} t=${Math.round(performance.now())}ms heap=${Math.round(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1e6)}MB`);
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  const settings = new Settings();
  // estimateImpacts off: the physics module's same-step estimator is mid-edit in the shared tree
  const physics = await createPhysics(scene, { estimateImpacts: false });
  let render;
  try {
    render = await createRender({ engine, scene, settings, skipAtmosphere: true, textures: { manifest: manifest as never, resolve: (f: string) => photoUrls[`../../public/assets/textures/${f}`] ?? f } });
  } catch {
    render = await createRender({ engine, scene, settings, skipAtmosphere: true, textures: { proceduralOnly: true } });
  }
  const events = new EventBus<GameEvents>();
  const time = new Time();
  const d = new Destruction({ physics, render, vfx: new MockVfx(), events, time, settings, rng: new Rng(7), scene });

  if (STRUCTURE) {
    // only the structure around the living room (the whole apartment is too heavy for SwiftShader)
    for (const p of buildStructure()) {
      const bb = worldAabb(p.def, p.xf);
      if (bb.max.x > 3.7 && bb.min.x < 9.5 && bb.max.z > -0.4 && bb.min.z < 5.6) d.spawn(p.def, p.xf);
    }
  }
  else {
    // light mode: a static floor slab + the two walls the room's furniture stands against
    const b = new Builder("probeShell", "Probe Shell", "structure", 0);
    const f = b.box("floor", "concrete", "wood_oak", [5.6, 0.2, 5.4], [6.6, -0.1, 2.5]);
    const w = b.box("wall_w", "gypsum", "paint_wall", [0.115, 2.7, 4.4], [4.0, 1.35, 2.2]);
    const e = b.box("wall_e", "gypsum", "paint_wall", [0.115, 2.7, 4.4], [9.2, 1.35, 2.2]);
    const s2 = b.box("wall_s", "concrete", "paint_wall", [5.4, 2.7, 0.2], [6.6, 1.35, -0.1]);
    for (const p of [f, w, e, s2]) b.world(p, "mortar", 1e6);
    d.spawn(b.build(), { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });
  }
  mark("structure/shell spawned");
  let fixtures = 0;
  if (STRUCTURE) try {
    const mod = await import("../../src/world/furnish/fixtures.ts");
    for (const p of mod.furnishFixtures()) if (p.room === "living") {
      d.spawn(p.def, p.xf);
      fixtures++;
    }
  } catch {
    /* fixtures optional */
  }
  const tb = performance.now();
  const items = furnishLivingItems();
  const buildMs = performance.now() - tb;
  const ts = performance.now();
  // spawn AWAKE (the default is asleep) so the settle test shows anything that slides, tips or falls
  const ids = items.map((it) => d.spawn({ ...it.def, startAsleep: false }, it.xf));
  const spawnMs = performance.now() - ts;
  mark(`living items spawned (${ids.length})`);
  const before = ids.map((id) => d.positionOf(id));
  // part-level drift of the seats (loose cushions are their own islands) and the pillows
  const watch = items.map((it, i) => ({ it, id: ids[i] })).filter(({ it }) => /^(sofa|armchair|pillow)/.test(it.id));
  const partPos = () => {
    const out = new Map<string, Vec3>();
    for (const { it, id } of watch) {
      const asm = d.assembly(id);
      if (!asm) continue;
      for (const pt of asm.parts) if (pt.island) out.set(`${it.id}.${pt.name}`, d.world.toWorldVec(pt.island, pt.centroid));
    }
    return out;
  };
  const parts0 = partPos();
  const stats0 = { destruction: d.stats(), physics: physics.stats() };

  const tStep = performance.now();
  // settle 2.5 s; a failure in another module's step code is reported, the screenshots still render
  const N = 150;
  let steps = 0;
  let stepError: string | null = null;
  try {
    for (; steps < N; steps++) {
      d.beforePhysics(FIXED_DT);
      physics.step(FIXED_DT);
      time.tick();
      d.afterPhysics(FIXED_DT);
      d.update(FIXED_DT);
    }
  } catch (e) {
    stepError = String(e);
  }
  const stepMs = (performance.now() - tStep) / Math.max(1, steps);
  mark(`settled (${steps} steps)`);
  const moved: Array<{ id: string; dist: number; dy: number }> = [];
  ids.forEach((id, i) => {
    const a = before[i],
      b = d.positionOf(id);
    if (!a || !b) return;
    const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    if (dist > 0.005) moved.push({ id: items[i].id, dist: Math.round(dist * 1000) / 1000, dy: Math.round((b.y - a.y) * 1000) / 1000 });
  });
  const partsMoved: Array<{ part: string; dist: number; dy: number }> = [];
  for (const [k, b] of partPos()) {
    const a = parts0.get(k);
    if (!a) continue;
    const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    if (dist > 0.005) partsMoved.push({ part: k, dist: Math.round(dist * 1000) / 1000, dy: Math.round((b.y - a.y) * 1000) / 1000 });
  }
  const brokenIslands = d
    .list()
    .filter((a) => ids.includes(a.id))
    .map((a) => ({ a, it: items[ids.indexOf(a.id)] }))
    // expected islands: the body + one per loose part + one per joint group (doors, drawers)
    .filter(({ a, it }) => a.islands > 1 + it.def.parts.filter((p) => p.tags?.includes("loose")).length + new Set(it.def.bonds.filter((b) => b.kind === "hinge" || b.kind === "slider").map((b) => b.joint!.group)).size)
    .map(({ a, it }) => `${it.id}:${a.islands}`);

  for (const r of ROOMS)
    for (const [x, z] of r.lights) {
      const l = new PointLight(`stand-in-${r.id}`, new Vector3(x, 2.45, z), scene);
      l.diffuse = Color3.FromHexString("#ffd9a8");
      l.intensity = 2.5;
      l.range = 7;
      render.addLight(l, r.id, true);
    }
  await scene.whenReadyAsync();
  mark("scene ready");
  const cam = render.camera;
  const shots: string[] = [];
  for (const [, pos, target] of VIEWS) {
    cam.position.set(pos[0], pos[1], pos[2]);
    cam.setTarget(new Vector3(target[0], target[1], target[2]));
    for (let i = 0; i < 3; i++) {
      render.update(1 / 60);
      scene.render();
    }
    shots.push(canvas.toDataURL("image/jpeg", 0.88));
  }
  const W = canvas.clientWidth || 1280,
    H = canvas.clientHeight || 720;
  const sheet = document.createElement("canvas");
  sheet.width = W;
  sheet.height = H;
  const g = sheet.getContext("2d")!;
  g.fillStyle = "#111";
  g.fillRect(0, 0, W, H);
  const cw = W / 3,
    ch = H / 3;
  await Promise.all(
    shots.map(
      (src, i) =>
        new Promise<void>((res) => {
          const img = new Image();
          img.onload = () => {
            const x = (i % 3) * cw,
              y = Math.floor(i / 3) * ch;
            g.drawImage(img, x + 1, y + 1, cw - 2, ch - 2);
            g.fillStyle = "rgba(0,0,0,0.55)";
            g.fillRect(x + 1, y + 1, 200, 18);
            g.fillStyle = "#fff";
            g.font = "12px sans-serif";
            g.fillText(VIEWS[i][0], x + 6, y + 14);
            res();
          };
          img.onerror = () => res();
          img.src = src;
        }),
    ),
  );
  const ov = document.createElement("img");
  ov.src = sheet.toDataURL("image/png");
  ov.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:10";
  document.body.appendChild(ov);
  await new Promise((r) => setTimeout(r, 300));
  return {
    living: { assemblies: items.length, parts: items.reduce((s, i) => s + i.def.parts.length, 0), fixtures },
    timingsMs: { build: Math.round(buildMs), spawn: Math.round(spawnMs), stepAvg: Math.round(stepMs * 10) / 10 },
    stats0,
    afterSettle: { destruction: d.stats(), physics: physics.stats() },
    steps,
    stepError,
    moved,
    partsMoved,
    brokenIslands,
  };
}
