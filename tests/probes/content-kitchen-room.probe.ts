// Runtime probe for the kitchen: spawn the structure + every kitchen placement (+ kitchen fixtures
// if present) into the real Physics + Render + Destruction systems (VFX mocked), settle 3 s,
// report which assemblies moved (slid, tipped, fell) or split, timings/counts, and render a 3×3
// contact sheet of the kitchen.
// Run: node tests/probe.mjs tests/probes/content-kitchen-room.probe.ts --timeout 600000 --screenshot /tmp/claude-0/content-kitchen-sheet.png

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
import { kitchenLayout } from "../../src/world/furnish/kitchen.ts";
import { MockVfx } from "./destruction-util.ts";
import manifest from "../../public/assets/textures/manifest.json";

const photoUrls = import.meta.glob("../../public/assets/textures/*.jpg", { query: "?url", import: "default", eager: true }) as Record<string, string>;

const VIEWS: Array<[string, [number, number, number], [number, number, number]]> = [
  ["from the living room", [6.6, 1.65, 3.6], [6.6, 0.9, 7.6]],
  ["sink + dish rack", [6.0, 1.6, 7.2], [5.6, 0.9, 8.6]],
  ["range + hood", [7.4, 1.5, 7.0], [7.4, 1.2, 8.7]],
  ["fridge corner", [7.6, 1.5, 6.4], [8.8, 1.0, 8.3]],
  ["west run appliances", [5.6, 1.5, 6.6], [4.2, 0.95, 7.4]],
  ["island + stools", [8.3, 1.4, 5.2], [6.6, 0.7, 6.4]],
  ["corner + microwave", [5.4, 1.5, 7.4], [4.3, 1.0, 8.6]],
  ["worktop top-down", [6.2, 2.3, 7.6], [6.2, 0.9, 8.5]],
  ["from the foyer opening", [9.0, 1.6, 5.1], [5.0, 0.9, 7.8]],
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

  // only the structure around the kitchen (the whole apartment is heavy for a headless page)
  let structure = 0;
  for (const p of buildStructure()) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of p.def.parts)
      for (const v of q.poly.verts) {
        const w = { x: v.x + p.xf.p.x, z: v.z + p.xf.p.z };
        x0 = Math.min(x0, w.x); x1 = Math.max(x1, w.x); z0 = Math.min(z0, w.z); z1 = Math.max(z1, w.z);
      }
    if (x1 < 3.7 || x0 > 9.5 || z1 < 4.6 || z0 > 9.2) continue;
    d.spawn(p.def, p.xf);
    structure++;
  }
  let fixtures = 0;
  try {
    const mod = await import("../../src/world/furnish/fixtures.ts");
    for (const p of mod.furnishFixtures())
      if (p.room === "kitchen") {
        d.spawn(p.def, p.xf);
        fixtures++;
      }
  } catch {
    /* fixtures optional */
  }
  const log: string[] = [];
  const r3 = (v: { x: number; y: number; z: number }) => `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
  events.on("fracture", (e) => log.length < 60 && log.push(`t${time.simTime.toFixed(2)} fracture ${e.mat} E=${e.energy.toFixed(2)} @${r3(e.pos)}`));
  events.on("bondBreak", (e) => log.length < 60 && log.push(`t${time.simTime.toFixed(2)} bond ${e.kind} ${e.matA}/${e.matB} E=${e.energy.toFixed(2)} @${r3(e.pos)}`));
  events.on("impact", (e) => e.energy > 0.5 && log.length < 60 && log.push(`t${time.simTime.toFixed(2)} impact ${e.matA}/${e.matB} E=${e.energy.toFixed(2)} v=${e.speed.toFixed(2)} @${r3(e.pos)}`));
  const tb = performance.now();
  const L = kitchenLayout();
  const buildMs = performance.now() - tb;
  const ts = performance.now();
  const ids = L.placements.map((it) => d.spawn(it.def, it.xf));
  const spawnMs = performance.now() - ts;
  const idOf = (i: number): number => ids[i];
  const before = L.placements.map((_, i) => d.positionOf(idOf(i)));
  const stats0 = { destruction: d.stats(), physics: physics.stats() };

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
  const moved: Array<{ i: number; type: string; dist: number; dy: number }> = [];
  L.placements.forEach((p, i) => {
    const a = before[i],
      b = d.positionOf(idOf(i));
    if (!a || !b) return;
    const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    if (dist > 0.005) moved.push({ i, type: p.type, dist: Math.round(dist * 1000) / 1000, dy: Math.round((b.y - a.y) * 1000) / 1000 });
  });
  const after = d.list();
  const split: string[] = [];
  L.placements.forEach((p, i) => {
    const a = after.find((q) => q.id === idOf(i));
    if (!a) return;
    const joints = new Set(p.def.bonds.filter((bd) => bd.kind === "hinge" || bd.kind === "slider").map((bd) => bd.joint?.group)).size;
    const loose = p.def.parts.filter((q) => q.tags?.includes("loose")).length;
    if (a.islands > 1 + joints + loose) split.push(`${p.type}#${i}:${a.islands}`);
    if (a.damage > 0.001) split.push(`${p.type}#${i} damaged ${a.damage.toFixed(3)}`);
  });

  for (const r of ROOMS)
    for (const [x, z] of r.lights) {
      const l = new PointLight(`stand-in-${r.id}-${x}`, new Vector3(x, 2.45, z), scene);
      l.diffuse = Color3.FromHexString("#ffd9a8");
      l.intensity = 2.5;
      l.range = 7;
      render.addLight(l, r.id, true);
    }
  await scene.whenReadyAsync();
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
    kitchen: { structure, assemblies: L.placements.length, parts: L.placements.reduce((s, p) => s + p.def.parts.length, 0), fixtures },
    timingsMs: { build: Math.round(buildMs), spawn: Math.round(spawnMs), stepAvg: Math.round(stepMs * 10) / 10 },
    stats0,
    afterSettle: { destruction: d.stats(), physics: physics.stats() },
    moved,
    split,
    log,
  };
}
