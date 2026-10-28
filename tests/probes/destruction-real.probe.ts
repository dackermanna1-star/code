// Integration probe with the REAL renderer (procedural textures), REAL VFX and REAL content
// (reference microwave, chair, coffee table, mugs) on a concrete slab: smash things and take a
// before/after contact sheet. Reports fracture/split counts, per-strike times, step times.
// Run: node tests/probe.mjs tests/probes/destruction-real.probe.ts --timeout 600000 --screenshot /tmp/claude-0/destruction-real.png
import { Engine, Scene, Vector3, PointLight, Color3, Layer as BLayer } from "@babylonjs/core";
import { createPhysics } from "../../src/physics/physics.ts";
import { createRender } from "../../src/render/renderSystem.ts";
import { createVfx } from "../../src/vfx/vfx.ts";
import { Destruction } from "../../src/destruction/destructionSystem.ts";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Time, FIXED_DT } from "../../src/core/time.ts";
import { Settings } from "../../src/core/settings.ts";
import { Rng } from "../../src/core/rng.ts";
import { Layer } from "../../src/core/context.ts";
import { buildObject } from "../../src/objects/registry.ts";
import { floorDef, paneDef, round } from "./destruction-util.ts";
import { qaxisAngle } from "../../src/geom/vec.ts";

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  const settings = new Settings();
  const physics = await createPhysics(scene, {});
  const render = await createRender({ engine, scene, settings, skipAtmosphere: true, skipExterior: true, textures: { proceduralOnly: true } });
  const events = new EventBus<GameEvents>();
  const time = new Time();
  const tmpA = new Vector3(),
    tmpB = new Vector3();
  const vfx = createVfx({
    scene,
    events,
    settings,
    worldMaterial: render.worldMaterial,
    groundProbe: (x, y, z) => {
      tmpA.set(x, y + 0.05, z);
      tmpB.set(x, y - 20, z);
      const h = physics.raycast(tmpA, tmpB, Layer.STATIC);
      return h ? h.point.y : null;
    },
  });
  const d = new Destruction({ physics, render, vfx, events, time, settings, rng: new Rng(99), scene });
  const ev: Record<string, number> = {};
  for (const t of ["impact", "fracture", "bondBreak", "split", "dent", "crack", "chip", "feature", "damage"] as const) events.on(t, () => (ev[t] = (ev[t] ?? 0) + 1));
  const I = { x: 0, y: 0, z: 0, w: 1 };
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      d.beforePhysics(FIXED_DT);
      physics.step(FIXED_DT);
      time.tick();
      d.afterPhysics(FIXED_DT);
      vfx.fixedUpdate(FIXED_DT);
      d.update(FIXED_DT);
      vfx.update(FIXED_DT);
      render.update(FIXED_DT);
    }
  };
  d.spawn(floorDef(10), { p: { x: 0, y: 0, z: 0 }, q: I });
  const lamp = new PointLight("probeLamp", new Vector3(0, 2.6, 0), scene);
  lamp.diffuse = Color3.FromHexString("#ffe0b0");
  lamp.intensity = 3;
  lamp.range = 9;
  render.addLight(lamp, null, false);
  const ids: Record<string, number> = {};
  const tSpawn = performance.now();
  ids.microwave = d.spawn(buildObject("microwave"), { p: { x: -0.5, y: 0, z: 0 }, q: qaxisAngle({ x: 0, y: 1, z: 0 }, 0.4) });
  ids.chair = d.spawn(buildObject("chair"), { p: { x: 0.7, y: 0, z: 0.3 }, q: qaxisAngle({ x: 0, y: 1, z: 0 }, -0.6) });
  ids.coffee = d.spawn(buildObject("coffeeTable"), { p: { x: 0.1, y: 0, z: 1.4 }, q: I });
  ids.mug1 = d.spawn(buildObject("mug"), { p: { x: 0.0, y: 0.6, z: 1.4 }, q: I });
  ids.pane = d.spawn(paneDef(), { p: { x: -1.6, y: 0.6, z: 1.2 }, q: qaxisAngle({ x: 0, y: 1, z: 0 }, 0.9) });
  const spawnMs = round(performance.now() - tSpawn, 10);
  step(30);
  const cam = render.camera;
  cam.position.set(2.4, 1.7, -2.4);
  cam.setTarget(new Vector3(-0.2, 0.5, 0.5));
  await scene.whenReadyAsync();
  for (let i = 0; i < 3; i++) scene.render();
  const before = canvas.toDataURL("image/jpeg", 0.85);

  const strike = (id: number, part: string | null, local: { x: number; y: number; z: number } | null, dir: Vector3, mass: number, speed: number, r: number, sharp = 1) => {
    const asm = d.assembly(id)!;
    let isl = [...asm.islands][0];
    let lp = local;
    if (part) {
      const p = asm.byName.get(part) ?? [...asm.parts].find((q) => q.name.startsWith(part));
      if (p?.island) {
        isl = p.island;
        lp = lp ?? { x: p.centroid.x, y: p.bounds.max.y, z: p.centroid.z };
      }
    }
    if (!lp) {
      // top centre of the island's bounds
      const b = isl.bounds;
      lp = { x: (b.min.x + b.max.x) / 2, y: b.max.y, z: (b.min.z + b.max.z) / 2 };
    }
    const wp = d.world.toWorldVec(isl, lp);
    const t0 = performance.now();
    const res = d.strike({ point: new Vector3(wp.x, wp.y, wp.z), dir, body: isl.body!, childIndex: -1, mass, speed, sharpness: sharp, contactRadius: r, strikerMat: "steel", source: "debug" });
    return { part: res.partName, e: round(res.energy, 10), broke: res.broke, ms: round(performance.now() - t0, 10) };
  };
  const log: unknown[] = [];
  // sledge the microwave from above three times, hammer the chair seat, smash the coffee table glass,
  // hammer the pane, throw the mug at the floor
  for (let i = 0; i < 3; i++) {
    log.push({ microwave: strike(ids.microwave, null, null, new Vector3(0, -1, 0), 6, 7.5, 0.03) });
    step(8);
  }
  const mw = d.assembly(ids.microwave)!;
  log.push({ chairSeat: strike(ids.chair, "seat", null, new Vector3(0, -1, 0), 6, 8, 0.03) });
  step(6);
  log.push({ coffeeTop: strike(ids.coffee, "top_pane0", null, new Vector3(0, -1, 0), 0.9, 11, 0.015) });
  step(6);
  const pane = d.assembly(ids.pane)!;
  const pIsl = [...pane.islands][0];
  const gp = pane.byName.get("glass")!;
  log.push({ pane: strike(ids.pane, "glass", { x: gp.centroid.x, y: gp.centroid.y, z: gp.centroid.z - 0.002 }, new Vector3(Math.sin(0.9), 0, Math.cos(0.9)), 0.9, 11, 0.015) });
  void pIsl;
  const mug = [...d.assembly(ids.mug1)!.islands][0];
  physics.wake(mug.body!);
  mug.body!.setLinearVelocity(new Vector3(0, 4, -1));
  const tSteps = performance.now();
  step(120);
  const stepMs = round((performance.now() - tSteps) / 120, 100);
  await scene.whenReadyAsync();
  for (let i = 0; i < 3; i++) scene.render();
  const after = canvas.toDataURL("image/jpeg", 0.85);
  cam.position.set(0.4, 1.1, -1.0);
  cam.setTarget(new Vector3(-0.5, 0.25, 0.1));
  for (let i = 0; i < 2; i++) scene.render();
  const closeup = canvas.toDataURL("image/jpeg", 0.85);

  // contact sheet: before | after | microwave close-up
  const W = canvas.clientWidth || 1280,
    H = canvas.clientHeight || 720;
  const sheet = document.createElement("canvas");
  sheet.width = W;
  sheet.height = H;
  const g = sheet.getContext("2d")!;
  g.fillStyle = "#111";
  g.fillRect(0, 0, W, H);
  const imgs = [before, after, closeup];
  await Promise.all(
    imgs.map(
      (src, i) =>
        new Promise<void>((res) => {
          const im = new Image();
          im.onload = () => {
            const w = W / 2,
              h = H / 2;
            const x = (i % 2) * w,
              y = Math.floor(i / 2) * h;
            g.drawImage(im, x + 1, y + 1, w - 2, h - 2);
            res();
          };
          im.onerror = () => res();
          im.src = src;
        }),
    ),
  );
  const ov = document.createElement("img");
  ov.src = sheet.toDataURL("image/png");
  ov.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;z-index:10";
  document.body.appendChild(ov);
  await new Promise((r) => setTimeout(r, 300));
  void BLayer;
  return {
    spawnMs,
    stepMs,
    log,
    microwave: { islands: mw.islands.size, parts: mw.parts.size, damage: round(mw.fraction, 100) },
    stats: d.stats(),
    events: ev,
    physics: physics.stats(),
    vfx: { particles: vfx.particleCount, micro: vfx.microCount },
    meshes: scene.meshes.length,
  };
}
