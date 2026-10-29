// Smash test for the bedroom objects with the REAL physics, destruction and renderer (VFX mocked):
// keyboard, PC tower, monitor, guitar on its stand, bedside lamp, desk lamp, laptop and nightstand
// on a concrete slab are each struck the way a player would (sledge / hammer, debug strikes), then
// the scene settles. Reports per object: strike result, islands before → after, broken bonds,
// fractures, detached keycaps, and renders a before / after / two close-ups contact sheet.
// Run: node tests/probe.mjs tests/probes/content-bedrooms-smash.probe.ts --timeout 600000 --screenshot /tmp/claude-0/content-bedrooms-smash.png

import { Engine, Scene, Vector3, PointLight, Color3 } from "@babylonjs/core";
import { createPhysics } from "../../src/physics/physics.ts";
import { createRender } from "../../src/render/renderSystem.ts";
import { Destruction } from "../../src/destruction/destructionSystem.ts";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Time, FIXED_DT } from "../../src/core/time.ts";
import { Settings } from "../../src/core/settings.ts";
import { Rng } from "../../src/core/rng.ts";
import { qeuler, qmul, qrot, v3, type Quat, type Vec3, type Xform } from "../../src/geom/vec.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";
import { BEDROOM_OBJECTS } from "../../src/objects/bedroom/index.ts";
import { guitarOnStand } from "../../src/objects/bedroom/guitar.ts";
import { MockVfx, floorDef } from "./destruction-util.ts";

const round = (x: number, k = 1000): number => Math.round(x * k) / k;

export async function probe(): Promise<unknown> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  const settings = new Settings();
  const physics = await createPhysics(scene, {});
  const render = await createRender({ engine, scene, settings, skipAtmosphere: true, skipExterior: true, textures: { proceduralOnly: true } });
  const events = new EventBus<GameEvents>();
  const time = new Time();
  const d = new Destruction({ physics, render, vfx: new MockVfx(), events, time, settings, rng: new Rng(5), scene });
  const ev: Record<string, number> = {};
  for (const t of ["impact", "fracture", "bondBreak", "split", "dent", "crack", "chip", "feature"] as const) events.on(t, () => (ev[t] = (ev[t] ?? 0) + 1));
  const step = (n: number): void => {
    for (let i = 0; i < n; i++) {
      d.beforePhysics(FIXED_DT);
      physics.step(FIXED_DT);
      time.tick();
      d.afterPhysics(FIXED_DT);
      d.update(FIXED_DT);
      render.update(FIXED_DT);
    }
  };
  const I: Quat = { x: 0, y: 0, z: 0, w: 1 };
  d.spawn(floorDef(10), { p: v3(0, 0, 0), q: I });
  const lamp = new PointLight("probeLamp", new Vector3(0, 2.6, 0.4), scene);
  lamp.diffuse = Color3.FromHexString("#ffe6c4");
  lamp.intensity = 3.2;
  lamp.range = 9;
  render.addLight(lamp, null, false);

  const at = (x: number, z: number, yaw = 0): Xform => ({ p: v3(x, 0, z), q: qeuler(0, yaw, 0) });
  const ids: Record<string, number> = {};
  const spawn = (key: string, def: AssemblyDef, xf: Xform): void => {
    ids[key] = d.spawn(def, xf);
  };
  spawn("keyboard", BEDROOM_OBJECTS.keyboard({ seed: 3 }), at(-1.2, 0));
  spawn("pcTower", BEDROOM_OBJECTS.pcTower({ seed: 3 }), at(-0.4, 0, -0.6));
  spawn("monitor", BEDROOM_OBJECTS.monitor({ seed: 3 }), at(0.45, 0));
  const gs = guitarOnStand({ seed: 3 });
  const standXf = at(1.35, 0.1);
  spawn("guitarStand", gs.stand, standXf);
  const gp = qrot(standXf.q, gs.guitarPose.p);
  spawn("guitar", gs.guitar, { p: v3(standXf.p.x + gp.x, gp.y, standXf.p.z + gp.z), q: qmul(standXf.q, gs.guitarPose.q) });
  spawn("bedsideLamp", BEDROOM_OBJECTS.bedsideLamp({ seed: 3 }), at(-1.2, 1.0));
  spawn("deskLamp", BEDROOM_OBJECTS.deskLamp({ seed: 3 }), at(-0.4, 1.0, 0.5));
  spawn("laptop", BEDROOM_OBJECTS.laptop({ seed: 3 }), at(0.45, 1.0));
  spawn("nightstand", BEDROOM_OBJECTS.nightstand({ seed: 3 }), at(1.35, 1.1));
  step(60); // settle 1 s

  const islandsOf = (key: string): number => d.assembly(ids[key])?.islands.size ?? 0;
  const before: Record<string, number> = {};
  for (const k of Object.keys(ids)) before[k] = islandsOf(k);
  const settleMoves: Record<string, number> = {};

  const cam = render.camera;
  const shot = async (pos: [number, number, number], target: [number, number, number]): Promise<string> => {
    cam.position.set(pos[0], pos[1], pos[2]);
    cam.setTarget(new Vector3(target[0], target[1], target[2]));
    for (let i = 0; i < 3; i++) {
      render.update(1 / 60);
      scene.render();
    }
    return canvas.toDataURL("image/jpeg", 0.86);
  };
  await scene.whenReadyAsync();
  const overview: [[number, number, number], [number, number, number]] = [
    [0.1, 1.9, -2.3],
    [0.05, 0.35, 0.55],
  ];
  const shots: string[] = [await shot(...overview)];

  /** Debug strike on a named part (prefix match) at its centroid, travelling along dir. */
  const strike = (key: string, part: string, dir: Vec3, mass: number, speed: number, r: number, sharp = 1): unknown => {
    const asm = d.assembly(ids[key]);
    if (!asm) return { error: "no assembly" };
    // the named part, or (once it has fractured) its biggest surviving fragment `${part}#g.i`
    let p = asm.byName.get(part);
    if (!p || !p.island?.body) {
      p = undefined;
      for (const q of asm.parts) if (q.island?.body && (q.name === part || q.name.startsWith(`${part}#`) || q.name.startsWith(part)) && (!p || q.volume > p.volume)) p = q;
    }
    if (!p || !p.island?.body) return { error: `no part ${part}` };
    const wp = d.world.toWorldVec(p.island, p.centroid);
    const e0 = { ...ev };
    const res = d.strike({ point: new Vector3(wp.x, wp.y, wp.z), dir: new Vector3(dir.x, dir.y, dir.z), body: p.island.body, childIndex: -1, mass, speed, sharpness: sharp, contactRadius: r, strikerMat: "steel", source: "debug" });
    step(10);
    const delta: Record<string, number> = {};
    for (const k of Object.keys(ev)) if ((ev[k] ?? 0) - (e0[k] ?? 0) > 0) delta[k] = (ev[k] ?? 0) - (e0[k] ?? 0);
    return { part: res.partName, mat: res.targetMat, e: round(res.energy, 10), broke: res.broke, events: delta };
  };
  const SLEDGE = { m: 6, v: 7.5, r: 0.03 },
    HAMMER = { m: 0.9, v: 11, r: 0.015 };
  const down = v3(0, -1, 0);
  const log: Record<string, unknown[]> = {};
  const hit = (key: string, part: string, dir: Vec3, t: { m: number; v: number; r: number }, n = 1): void => {
    for (let i = 0; i < n; i++) (log[key] ??= []).push(strike(key, part, dir, t.m, t.v, t.r));
  };
  hit("keyboard", "key_r3_5", down, SLEDGE, 2);
  hit("pcTower", "glass", qrot(qeuler(0, -0.6, 0), v3(-1, 0, 0)), HAMMER, 2);
  hit("pcTower", "top", down, SLEDGE, 2);
  hit("monitor", "panel_lcd", v3(0, 0, -1), HAMMER, 2);
  hit("guitar", "top_lower", qrot(qeuler(-0.26, 0, 0), v3(0, 0, -1)), SLEDGE, 1);
  hit("guitar", "neck", v3(0, 0, -1), HAMMER, 1);
  hit("bedsideLamp", "base", v3(0, 0, -1), HAMMER, 2);
  hit("bedsideLamp", "bulb_glass", v3(0, 0, -1), HAMMER, 1);
  hit("deskLamp", "head_shade", down, HAMMER, 1);
  hit("laptop", "lid", down, SLEDGE, 1);
  hit("nightstand", "top", down, SLEDGE, 2);
  step(150); // let debris settle 2.5 s

  const after: Record<string, { islands: string; parts: number; damage: number }> = {};
  for (const k of Object.keys(ids)) {
    const a = d.assembly(ids[k]);
    if (!a) continue;
    after[k] = { islands: `${before[k]} → ${a.islands.size}`, parts: a.parts.size, damage: round(a.fraction, 1000) };
  }
  // keycaps knocked off: key parts no longer on the island that holds the switch plate
  const kb = d.assembly(ids.keyboard);
  let keysOff = 0,
    keysLeft = 0;
  if (kb) {
    const plateIsl = [...kb.parts].find((q) => q.name === "plate" || q.name.startsWith("plate#"))?.island ?? null;
    for (const q of kb.parts) {
      if (!q.name.startsWith("key_") || q.name.includes("#")) continue;
      if (q.island && q.island === plateIsl) keysLeft++;
      else keysOff++;
    }
  }
  const lampLights = scene.lights.filter((l) => l.name !== "probeLamp").map((l) => ({ name: l.name, on: l.isEnabled() && l.intensity > 0 }));

  shots.push(await shot(...overview));
  shots.push(await shot([-0.75, 0.85, -1.05], [-0.85, 0.12, 0.1])); // keyboard + PC
  shots.push(await shot([1.0, 1.05, -0.95], [1.0, 0.3, 0.6])); // guitar, monitor, nightstand

  const W = canvas.clientWidth || 1280,
    H = canvas.clientHeight || 720;
  const sheet = document.createElement("canvas");
  sheet.width = W;
  sheet.height = H;
  const g = sheet.getContext("2d")!;
  g.fillStyle = "#111";
  g.fillRect(0, 0, W, H);
  const labels = ["before", "after", "after: keyboard + PC", "after: guitar / monitor / nightstand"];
  await Promise.all(
    shots.map(
      (src, i) =>
        new Promise<void>((res) => {
          const im = new Image();
          im.onload = () => {
            const w = W / 2,
              h = H / 2;
            const x = (i % 2) * w,
              y = Math.floor(i / 2) * h;
            g.drawImage(im, x + 1, y + 1, w - 2, h - 2);
            g.fillStyle = "rgba(0,0,0,0.55)";
            g.fillRect(x + 1, y + 1, 260, 16);
            g.fillStyle = "#fff";
            g.font = "11px sans-serif";
            g.fillText(labels[i], x + 5, y + 13);
            res();
          };
          im.onerror = () => res();
          im.src = src;
        }),
    ),
  );
  const ov = document.createElement("img");
  ov.src = sheet.toDataURL("image/png");
  ov.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:10";
  document.body.appendChild(ov);
  await new Promise((r) => setTimeout(r, 300));
  void settleMoves;
  return { log, after, keycaps: { off: keysOff, onPlate: keysLeft }, lampLights, events: ev, stats: d.stats() };
}
