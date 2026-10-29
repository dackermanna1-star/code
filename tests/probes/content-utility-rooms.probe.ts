// Runtime probe for the bathroom, laundry, foyer and balcony: spawn the apartment structure (or a
// light stand-in shell) + the fixtures in these rooms + every content-utility placement into the
// real Physics + Render + Destruction systems (VFX mocked), settle ~2.5 s, report which
// assemblies moved (things that slide, tip or fall) and unexpected splits, timings, and render a
// 4×4 contact sheet of the four rooms.
// Run: node tests/probe.mjs tests/probes/content-utility-rooms.probe.ts --timeout 600000 --screenshot /tmp/claude-0/content-utility-sheet.png
// Set globalThis.__utilityLight = true (see content-utility-light.probe.ts) for the light shell.

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
import { furnishUtilityItems } from "../../src/world/furnish/utility.ts";
import { MockVfx } from "./destruction-util.ts";
import { Builder } from "../../src/objects/lib/builder.ts";
import manifest from "../../public/assets/textures/manifest.json";

const photoUrls = import.meta.glob("../../public/assets/textures/*.jpg", { query: "?url", import: "default", eager: true }) as Record<string, string>;

const MY_ROOMS = ["bath", "utility", "foyer", "balcony"];

const VIEWS: Array<[string, [number, number, number], [number, number, number]]> = [
  ["bath: from the door", [1.85, 1.6, 5.85], [0.7, 0.8, 8.4]],
  ["bath: vanity + mirror", [0.55, 1.5, 7.2], [2.4, 1.05, 7.48]],
  ["bath: toilet", [2.05, 1.45, 6.3], [0.2, 0.45, 7.05]],
  ["bath: tub + shower", [1.75, 1.45, 7.35], [0.3, 0.9, 8.45]],
  ["laundry: from the door", [3.35, 1.6, 5.85], [3.1, 0.9, 8.6]],
  ["laundry: machines + shelf", [3.25, 1.55, 6.75], [3.25, 1.2, 8.8]],
  ["laundry: heater", [3.8, 1.45, 6.0], [2.65, 0.8, 7.1]],
  ["laundry: shelf close", [3.3, 1.75, 7.6], [3.2, 1.6, 8.8]],
  ["foyer: from the arch", [9.55, 1.6, 5.1], [11.6, 1.0, 8.3]],
  ["foyer: panel + closet", [10.8, 1.6, 6.4], [12.5, 1.3, 8.0]],
  ["foyer: console by the door", [11.4, 1.6, 6.9], [9.8, 0.95, 8.65]],
  ["foyer: west wall", [11.3, 1.45, 6.1], [9.3, 0.45, 7.2]],
  ["balcony: from the slider", [6.8, 1.65, 0.6], [5.6, 0.35, -1.0]],
  ["balcony: AC + plants", [6.4, 1.5, -1.1], [8.4, 0.35, -0.5]],
  ["balcony: bistro set", [7.6, 1.4, -0.4], [5.0, 0.45, -1.1]],
  ["bath: from above the tub", [1.9, 2.4, 8.5], [0.6, 0.4, 7.4]],
];

export async function probe(): Promise<unknown> {
  const LIGHT = !!(globalThis as { __utilityLight?: boolean }).__utilityLight;
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  const settings = new Settings();
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

  const t0 = performance.now();
  let structureParts = 0;
  if (!LIGHT) {
    for (const p of buildStructure()) {
      d.spawn(p.def, p.xf);
      structureParts += p.def.parts.length;
    }
  } else {
    // light mode: static floors + walls of the four rooms (no openings)
    const b = new Builder("probeShell", "Probe Shell", "structure", 0);
    const boxes: Array<[string, [number, number, number], [number, number, number]]> = [
      ["floor_n", [13.2, 0.2, 4.6], [6.4, -0.1, 6.6]],
      ["floor_b", [4.8, 0.2, 1.6], [6.7, -0.12, -0.9]],
      ["wall_w", [0.2, 2.7, 3.4], [-0.1, 1.35, 7.2]],
      ["wall_n", [13.2, 2.7, 0.2], [6.4, 1.35, 8.9]],
      ["wall_e", [0.2, 2.7, 4.6], [12.9, 1.35, 6.6]],
      ["wall_bu", [0.115, 2.7, 3.2], [2.5, 1.35, 7.2]],
      ["wall_uk", [0.115, 2.7, 3.2], [4.0, 1.35, 7.2]],
      ["wall_kf", [0.115, 2.7, 3.0], [9.2, 1.35, 7.3]],
      ["facade", [4.8, 2.7, 0.2], [6.7, 1.35, -0.1]],
    ];
    const names = boxes.map(([n, s, p]) => b.box(n, "concrete", "paint_wall", s, p));
    for (const n of names) b.world(n, "mortar", 1e6);
    d.spawn(b.build(), { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });
  }
  const structureMs = performance.now() - t0;
  let fixtures = 0;
  if (!LIGHT)
    try {
      const mod = await import("../../src/world/furnish/fixtures.ts");
      for (const p of mod.furnishFixtures())
        if (MY_ROOMS.includes(p.room)) {
          d.spawn(p.def, p.xf);
          fixtures++;
        }
    } catch {
      /* fixtures optional */
    }

  const tb = performance.now();
  const items = furnishUtilityItems();
  const buildMs = performance.now() - tb;
  const ts = performance.now();
  // spawn AWAKE so the settle shows anything that slides, tips or falls
  const ids = items.map((it) => d.spawn({ ...it.def, startAsleep: false }, it.xf));
  const spawnMs = performance.now() - ts;
  const before = ids.map((id) => d.positionOf(id));
  const stats0 = { destruction: d.stats(), physics: physics.stats() };

  const tStep = performance.now();
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
  const moved: Array<{ id: string; dist: number; dy: number }> = [];
  ids.forEach((id, i) => {
    const a = before[i],
      b = d.positionOf(id);
    if (!a || !b) return;
    const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    if (dist > 0.005) moved.push({ id: items[i].id, dist: Math.round(dist * 1000) / 1000, dy: Math.round((b.y - a.y) * 1000) / 1000 });
  });
  const islands = d
    .list()
    .filter((a) => ids.includes(a.id))
    .map((a) => ({ a, it: items[ids.indexOf(a.id)] }))
    .filter(({ a, it }) => a.islands > 1 + it.def.parts.filter((p) => p.tags?.includes("loose")).length + new Set(it.def.bonds.filter((b) => b.kind === "hinge" || b.kind === "slider").map((b) => b.joint!.group)).size)
    .map(({ a, it }) => `${it.id}:${a.islands}`);

  for (const r of ROOMS)
    for (const [x, z] of r.lights) {
      if (!MY_ROOMS.includes(r.id)) continue;
      const l = new PointLight(`stand-in-${r.id}`, new Vector3(x, 2.45, z), scene);
      l.diffuse = Color3.FromHexString("#ffe2b8");
      l.intensity = 2.2;
      l.range = 6;
      render.addLight(l, r.id, true);
    }
  await scene.whenReadyAsync();
  const cam = render.camera;
  cam.minZ = 0.03;
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
  const cols = 4,
    rows = 4;
  const cw = W / cols,
    ch = H / rows;
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
    mode: LIGHT ? "light shell" : "full structure",
    utility: { assemblies: items.length, parts: items.reduce((s, i) => s + i.def.parts.length, 0), fixtures, structureParts },
    timingsMs: { structure: Math.round(structureMs), build: Math.round(buildMs), spawn: Math.round(spawnMs), stepAvg: Math.round(stepMs * 10) / 10 },
    stats0,
    afterSettle: { destruction: d.stats(), physics: physics.stats() },
    steps,
    stepError,
    moved,
    unexpectedIslands: islands,
  };
}
