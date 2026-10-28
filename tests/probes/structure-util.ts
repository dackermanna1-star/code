// Shared setup for tests/probes/structure-*.probe.ts (not a probe itself): real Physics + Render
// + Destruction (VFX mocked) with the whole structure spawned and settled, stand-in ceiling lights
// at the plan's light positions, and helpers to shoot camera views into a contact sheet.

import { Engine, Scene, Vector3, PointLight, Color3 } from "@babylonjs/core";
import { createPhysics, type Physics } from "../../src/physics/physics.ts";
import { createRender, type Render } from "../../src/render/renderSystem.ts";
import { Destruction } from "../../src/destruction/destructionSystem.ts";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Time, FIXED_DT } from "../../src/core/time.ts";
import { Settings } from "../../src/core/settings.ts";
import { Rng } from "../../src/core/rng.ts";
import { ROOMS } from "../../src/world/plan.ts";
import { buildStructure, type StructurePiece } from "../../src/world/structure.ts";
import { MockVfx } from "./destruction-util.ts";
import manifest from "../../public/assets/textures/manifest.json";

const photoUrls = import.meta.glob("../../public/assets/textures/*.jpg", { query: "?url", import: "default", eager: true }) as Record<string, string>;

export type View = [string, [number, number, number], [number, number, number]];

export interface StructureSim {
  engine: Engine;
  scene: Scene;
  canvas: HTMLCanvasElement;
  physics: Physics;
  render: Render;
  d: Destruction;
  pieces: StructurePiece[];
  ids: number[];
  timings: Record<string, number>;
  texMode: string;
  step(n: number): void;
}

export async function setupStructure(log: (m: string) => void, quality: "low" | "medium" | "high" = "medium"): Promise<StructureSim> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  const settings = new Settings();
  settings.data.quality = quality;
  const physics = await createPhysics(scene, {});
  const timings: Record<string, number> = {};
  let t = performance.now();
  let texMode = "photo";
  let render: Render;
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
  timings.render = Math.round(performance.now() - t);
  log(`render ready (${texMode}) in ${timings.render} ms`);
  const time = new Time();
  const d = new Destruction({ physics, render, vfx: new MockVfx(), events: new EventBus<GameEvents>(), time, settings, rng: new Rng(7), scene });
  t = performance.now();
  const pieces = buildStructure();
  timings.build = Math.round(performance.now() - t);
  t = performance.now();
  const ids = pieces.map((p) => d.spawn(p.def, p.xf));
  timings.spawn = Math.round(performance.now() - t);
  log(`spawned ${ids.length} assemblies in ${timings.spawn} ms`);
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      d.beforePhysics(FIXED_DT);
      physics.step(FIXED_DT);
      time.tick();
      d.afterPhysics(FIXED_DT);
      d.update(FIXED_DT);
    }
  };
  for (const r of ROOMS) {
    for (const [x, z] of r.lights) {
      const l = new PointLight(`stand-in-${r.id}`, new Vector3(x, 2.45, z), scene);
      l.diffuse = Color3.FromHexString("#ffd9a8");
      l.intensity = 3.2;
      l.range = 7;
      render.addLight(l, r.id, true);
    }
  }
  return { engine, scene, canvas, physics, render, d, pieces, ids, timings, texMode, step };
}

/** Render each view (a few frames) and return JPEG data URLs. */
export async function shoot(sim: StructureSim, views: View[], log: (m: string) => void, frames = 2): Promise<string[]> {
  await sim.scene.whenReadyAsync();
  const cam = sim.render.camera;
  const shots: string[] = [];
  for (const [name, pos, target] of views) {
    cam.position.set(pos[0], pos[1], pos[2]);
    cam.setTarget(new Vector3(target[0], target[1], target[2]));
    for (let i = 0; i < frames; i++) {
      sim.render.update(1 / 60);
      sim.scene.render();
    }
    shots.push(sim.canvas.toDataURL("image/jpeg", 0.88));
    log(`view ${shots.length}/${views.length}: ${name}`);
  }
  return shots;
}

/** Compose shots into a labelled grid and overlay it on the page (for the runner's screenshot). */
export async function contactSheet(views: View[], shots: string[], cols = 3): Promise<void> {
  const W = 1280,
    H = 720;
  const rows = Math.ceil(shots.length / cols);
  const sheet = document.createElement("canvas");
  sheet.width = W;
  sheet.height = H;
  const g = sheet.getContext("2d")!;
  g.fillStyle = "#111";
  g.fillRect(0, 0, W, H);
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
            g.fillRect(x + 1, y + 1, 200, 18);
            g.fillStyle = "#fff";
            g.font = "12px sans-serif";
            g.fillText(views[i][0], x + 6, y + 14);
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
}
