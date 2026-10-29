// Runtime probe for the two bedrooms: spawn the structure + the bedroom fixtures (if present) +
// every bedroom placement into the real Physics + Render + Destruction systems (VFX mocked),
// settle 3 s, report what moved (things that slide, tip, roll or fall), joints/islands/timings,
// and render a 4×3 contact sheet of both rooms.
// Run: node tests/probe.mjs tests/probes/content-bedrooms-room.probe.ts --timeout 600000 --screenshot /tmp/claude-0/content-bedrooms-sheet.png

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
import { bedroomItems } from "../../src/world/furnish/bedrooms.ts";
import { MockVfx } from "./destruction-util.ts";
import manifest from "../../public/assets/textures/manifest.json";

const photoUrls = import.meta.glob("../../public/assets/textures/*.jpg", { query: "?url", import: "default", eager: true }) as Record<string, string>;

const VIEWS: Array<[string, [number, number, number], [number, number, number]]> = [
  ["master: from the door", [3.3, 1.6, 4.0], [0.8, 0.6, 2.0]],
  ["master: bed from the foot", [3.0, 1.45, 2.2], [0.3, 0.6, 2.2]],
  ["master: south nightstand", [1.15, 1.05, 0.45], [0.2, 0.62, 1.1]],
  ["master: dresser + mirror", [1.7, 1.45, 1.25], [3.9, 0.95, 1.25]],
  ["master: wardrobe", [1.6, 1.5, 2.9], [3.8, 1.0, 2.85]],
  ["master: window corner → NE", [0.5, 1.6, 0.4], [3.6, 0.8, 3.0]],
  ["bed2: desk setup", [11.15, 1.4, 0.75], [12.5, 0.85, 1.6]],
  ["bed2: desk from the chair", [11.45, 1.3, 1.45], [12.5, 0.85, 1.45]],
  ["bed2: bed + posters", [9.8, 1.6, 0.6], [12.0, 0.7, 3.4]],
  ["bed2: bookshelf + guitar", [11.0, 1.35, 1.7], [9.3, 0.9, 1.9]],
  ["bed2: from the door", [10.0, 1.65, 4.0], [11.5, 0.8, 0.8]],
  ["bed2: PC glass side", [12.15, 1.1, 1.35], [12.4, 0.95, 0.88]],
];

export async function probe(): Promise<unknown> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  const settings = new Settings();
  const physics = await createPhysics(scene, {});
  let render;
  try {
    render = await createRender({ engine, scene, settings, skipAtmosphere: true, textures: { manifest: manifest as never, resolve: (f: string) => photoUrls[`../../public/assets/textures/${f}`] ?? f } });
  } catch {
    render = await createRender({ engine, scene, settings, skipAtmosphere: true, textures: { proceduralOnly: true } });
  }
  const events = new EventBus<GameEvents>();
  const time = new Time();
  const d = new Destruction({ physics, render, vfx: new MockVfx(), events, time, settings, rng: new Rng(7), scene });

  const mark = (m: string): void => console.log(`[bedrooms-room] ${m} t=${Math.round(performance.now())}ms heap=${Math.round(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1e6)}MB`);
  mark("systems ready");
  for (const p of buildStructure()) d.spawn(p.def, p.xf);
  mark("structure spawned");
  let fixtures = 0;
  try {
    const mod = await import("../../src/world/furnish/fixtures.ts");
    for (const p of mod.furnishFixtures())
      if (p.room === "master" || p.room === "bed2") {
        d.spawn(p.def, p.xf);
        fixtures++;
      }
  } catch {
    /* fixtures optional */
  }
  mark(`fixtures spawned (${fixtures})`);
  const tb = performance.now();
  const items = bedroomItems();
  const buildMs = performance.now() - tb;
  const ts = performance.now();
  const ids = items.map((it) => d.spawn(it.placement.def, it.placement.xf));
  const spawnMs = performance.now() - ts;
  const before = ids.map((id) => d.positionOf(id));
  const stats0 = { destruction: d.stats(), physics: physics.stats() };
  mark(`bedroom items spawned (${ids.length})`);

  const tStep = performance.now();
  const N = 180;
  for (let i = 0; i < N; i++) {
    d.beforePhysics(FIXED_DT);
    physics.step(FIXED_DT);
    time.tick();
    d.afterPhysics(FIXED_DT);
    d.update(FIXED_DT);
  }
  const stepMs = (performance.now() - tStep) / N;
  mark("settled");
  const moved: Array<{ id: string; dist: number; dy: number }> = [];
  ids.forEach((id, i) => {
    const a = before[i],
      b = d.positionOf(id);
    if (!a || !b) return;
    const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    if (dist > 0.005) moved.push({ id: items[i].id, dist: Math.round(dist * 1000) / 1000, dy: Math.round((b.y - a.y) * 1000) / 1000 });
  });
  const list = d.list();
  const islands = list
    .filter((a) => ids.includes(a.id))
    .map((a) => ({ a, it: items[ids.indexOf(a.id)] }))
    .filter(({ a }) => a.islands > 1)
    .map(({ a, it }) => `${it.id}:${a.islands}`);
  const damaged = list
    .filter((a) => ids.includes(a.id) && a.damage > 0.001)
    .map((a) => `${items[ids.indexOf(a.id)].id}:${a.damage.toFixed(3)}`);

  if (!fixtures)
    for (const r of ROOMS)
      for (const [x, z] of r.lights) {
        if (r.id !== "master" && r.id !== "bed2") continue;
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
    mark(`shot ${shots.length}`);
  }
  const Wd = canvas.clientWidth || 1280,
    Ht = canvas.clientHeight || 720;
  const sheet = document.createElement("canvas");
  sheet.width = Wd;
  sheet.height = Ht;
  const g = sheet.getContext("2d")!;
  g.fillStyle = "#111";
  g.fillRect(0, 0, Wd, Ht);
  const cols = 4,
    rows = 3;
  const cw = Wd / cols,
    ch = Ht / rows;
  await Promise.all(
    shots.map(
      (src, i) =>
        new Promise<void>((res) => {
          const img = new Image();
          img.onload = () => {
            const x = (i % cols) * cw,
              y = Math.floor(i / cols) * ch;
            g.drawImage(img, x + 1, y + 1, cw - 2, ch - 2);
            g.fillStyle = "rgba(0,0,0,0.55)";
            g.fillRect(x + 1, y + 1, 190, 16);
            g.fillStyle = "#fff";
            g.font = "11px sans-serif";
            g.fillText(VIEWS[i][0], x + 5, y + 13);
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
    bedrooms: { assemblies: items.length, parts: items.reduce((s, i) => s + i.placement.def.parts.length, 0), fixtures },
    timingsMs: { build: Math.round(buildMs), spawn: Math.round(spawnMs), stepAvg: Math.round(stepMs * 10) / 10 },
    stats0,
    afterSettle: { destruction: d.stats(), physics: physics.stats() },
    moved,
    islands,
    damaged,
  };
}
