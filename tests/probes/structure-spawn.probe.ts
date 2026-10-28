// Runtime probe for the apartment structure: spawn every structural assembly into the real
// Physics + Render + Destruction systems (VFX mocked), settle 2 s, verify nothing moved or fell,
// report counts/timings, and render a 3×3 contact sheet of the rooms (stand-in ceiling lights at
// the plan's light positions; fixtures are another module's job).
// Run: node tests/probe.mjs tests/probes/structure-spawn.probe.ts --timeout 400000 --screenshot /tmp/claude-0/structure-sheet.png

import { Engine, Scene, Vector3, PointLight, Color3 } from "@babylonjs/core";
import { createPhysics } from "../../src/physics/physics.ts";
import { createRender } from "../../src/render/renderSystem.ts";
import { Destruction } from "../../src/destruction/destructionSystem.ts";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Time, FIXED_DT } from "../../src/core/time.ts";
import { Settings } from "../../src/core/settings.ts";
import { Rng } from "../../src/core/rng.ts";
import { ROOMS } from "../../src/world/plan.ts";
import { buildStructure, structureStats } from "../../src/world/structure.ts";
import { MockVfx } from "./destruction-util.ts";
import manifest from "../../public/assets/textures/manifest.json";

const photoUrls = import.meta.glob("../../public/assets/textures/*.jpg", { query: "?url", import: "default", eager: true }) as Record<string, string>;

const VIEWS: Array<[string, [number, number, number], [number, number, number]]> = [
  ["living → TV wall / hall", [8.9, 1.6, 0.45], [4.3, 1.2, 4.2]],
  ["living → kitchen", [6.6, 1.65, 0.9], [6.4, 1.1, 8.8]],
  ["balcony slider", [6.4, 1.6, 3.2], [6.2, 0.9, -1.6]],
  ["master bedroom", [3.6, 1.6, 4.05], [0.9, 1.1, 0.0]],
  ["hallway → west", [4.6, 1.6, 5.0], [0.0, 1.0, 5.0]],
  ["bathroom", [2.25, 1.6, 5.85], [0.4, 0.9, 8.6]],
  ["laundry plumbing", [3.85, 1.6, 6.1], [2.55, 0.9, 7.8]],
  ["foyer → front door", [9.7, 1.6, 4.75], [11.1, 1.1, 8.8]],
  ["bedroom 2", [9.6, 1.6, 4.05], [12.6, 1.1, 1.6]],
];

export async function probe(): Promise<unknown> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  const settings = new Settings();
  settings.data.quality = "medium"; // keep SwiftShader frame times sane (shadows on, no SSAO)
  const physics = await createPhysics(scene, {});
  const log = (m: string) => console.log(`[structure-spawn] ${m}`);
  const t0 = performance.now();
  let texMode = "photo";
  let render;
  try {
    render = await createRender({
      engine,
      scene,
      settings,
      skipAtmosphere: true,
      textures: { manifest: manifest as never, resolve: (f: string) => photoUrls[`../../public/assets/textures/${f}`] ?? f },
    });
  } catch (e) {
    texMode = "procedural (" + String(e) + ")";
    render = await createRender({ engine, scene, settings, skipAtmosphere: true, textures: { proceduralOnly: true } });
  }
  const renderMs = performance.now() - t0;
  log(`render ready (${texMode}) in ${renderMs.toFixed(0)} ms`);
  const events = new EventBus<GameEvents>();
  const time = new Time();
  const d = new Destruction({ physics, render, vfx: new MockVfx(), events, time, settings, rng: new Rng(7), scene });

  // ---- build + spawn
  const tb = performance.now();
  const pieces = buildStructure();
  const buildMs = performance.now() - tb;
  const ts = performance.now();
  const ids: number[] = [];
  for (const p of pieces) ids.push(d.spawn(p.def, p.xf));
  const spawnMs = performance.now() - ts;
  log(`spawned ${ids.length} assemblies in ${spawnMs.toFixed(0)} ms`);
  const before = ids.map((id) => d.positionOf(id));
  const afterSpawn = { destruction: d.stats(), physics: physics.stats() };

  // ---- settle 2 s
  const tStep = performance.now();
  for (let i = 0; i < 120; i++) {
    d.beforePhysics(FIXED_DT);
    physics.step(FIXED_DT);
    time.tick();
    d.afterPhysics(FIXED_DT);
    d.update(FIXED_DT);
  }
  const stepMs = (performance.now() - tStep) / 120;
  log(`settled (${stepMs.toFixed(1)} ms/step)`);
  const moved: Array<{ name: string; dist: number }> = [];
  ids.forEach((id, i) => {
    const a = before[i],
      b = d.positionOf(id);
    if (!a || !b) return;
    const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    if (dist > 0.002) moved.push({ name: pieces[i].def.name, dist: Math.round(dist * 1000) / 1000 });
  });
  const listed = d.list();

  // ---- stand-in ceiling lights (warm) at the plan light positions
  for (const r of ROOMS) {
    for (const [x, z] of r.lights) {
      const l = new PointLight(`stand-in-${r.id}`, new Vector3(x, 2.45, z), scene);
      l.diffuse = Color3.FromHexString("#ffd9a8");
      l.intensity = 3.2;
      l.range = 7;
      render.addLight(l, r.id, true);
    }
  }
  await scene.whenReadyAsync();
  const cam = render.camera;
  const shots: string[] = [];
  const tr = performance.now();
  for (const [, pos, target] of VIEWS) {
    cam.position.set(pos[0], pos[1], pos[2]);
    cam.setTarget(new Vector3(target[0], target[1], target[2]));
    for (let i = 0; i < 2; i++) {
      render.update(1 / 60);
      scene.render();
    }
    shots.push(canvas.toDataURL("image/jpeg", 0.88));
    log(`view ${shots.length}/${VIEWS.length}`);
  }
  const frameMs = (performance.now() - tr) / (VIEWS.length * 2);
  const drawInfo = { meshes: scene.meshes.length, activeMeshes: scene.getActiveMeshes().length, activeTris: Math.round(scene.getActiveIndices() / 3) };

  // ---- contact sheet overlay for the runner's screenshot
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
            g.fillRect(x + 1, y + 1, 190, 18);
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

  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    texMode,
    structure: structureStats(pieces),
    timingsMs: { render: Math.round(renderMs), build: Math.round(buildMs), spawn: Math.round(spawnMs), stepAvg: r1(stepMs), frameAvg: Math.round(frameMs) },
    afterSpawn,
    afterSettle: { destruction: d.stats(), physics: physics.stats() },
    moved,
    assemblies: listed.length,
    draw: drawInfo,
  };
}
