// Close-up visual probe (real renderer + VFX): a window pane mid-shatter and after settling,
// a pine table snapped by a sledge, a microwave after sledge blows, drywall-like gypsum panel
// with a punched hole. 2×2 contact sheet.
// Run: node tests/probe.mjs tests/probes/destruction-closeup.probe.ts --timeout 900000 --screenshot /tmp/claude-0/destruction-closeup.png
import { Engine, Scene, Vector3, PointLight, Color3 } from "@babylonjs/core";
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
import { floorDef, paneDef, tableDef, boxPart, round } from "./destruction-util.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";
import { qaxisAngle } from "../../src/geom/vec.ts";

function wallPanelDef(): AssemblyDef {
  // 1.2 × 1.2 m drywall sheet screwed to two studs, studs anchored to the world
  return {
    type: "testDrywall",
    name: "Drywall",
    category: "structure",
    value: 40,
    parts: [
      boxPart("sheet", "gypsum", "paint_wall", { x: 1.2, y: 1.2, z: 0.0125 }, { x: 0, y: 0.6, z: 0 }, { supported: true, tint: 0xeee7da }),
      boxPart("studL", "softwood", "wood_pine", { x: 0.038, y: 1.2, z: 0.089 }, { x: -0.4, y: 0.6, z: 0.0508 }, { grain: { x: 0, y: 1, z: 0 } }),
      boxPart("studR", "softwood", "wood_pine", { x: 0.038, y: 1.2, z: 0.089 }, { x: 0.4, y: 0.6, z: 0.0508 }, { grain: { x: 0, y: 1, z: 0 } }),
    ],
    bonds: [
      { a: "sheet", b: "studL", kind: "screw", strength: 35 * 4, anchor: { x: -0.4, y: 0.6, z: 0.00625 } },
      { a: "sheet", b: "studR", kind: "screw", strength: 35 * 4, anchor: { x: 0.4, y: 0.6, z: 0.00625 } },
      { a: "studL", b: "world", kind: "nail", strength: 2000, anchor: { x: -0.4, y: 0, z: 0.05 } },
      { a: "studR", b: "world", kind: "nail", strength: 2000, anchor: { x: 0.4, y: 0, z: 0.05 } },
    ],
  };
}

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  const settings = new Settings();
  const physics = await createPhysics(scene, {});
  const render = await createRender({ engine, scene, settings, skipAtmosphere: true, skipExterior: true, textures: { proceduralOnly: true } });
  const events = new EventBus<GameEvents>();
  const time = new Time();
  const tA = new Vector3(),
    tB = new Vector3();
  const vfx = createVfx({
    scene,
    events,
    settings,
    worldMaterial: render.worldMaterial,
    groundProbe: (x, y, z) => {
      tA.set(x, y + 0.05, z);
      tB.set(x, y - 20, z);
      const h = physics.raycast(tA, tB, Layer.STATIC);
      return h ? h.point.y : null;
    },
  });
  const d = new Destruction({ physics, render, vfx, events, time, settings, rng: new Rng(5), scene });
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
  d.spawn(floorDef(12), { p: { x: 0, y: 0, z: 0 }, q: I });
  for (const [x, z] of [
    [0, -1],
    [3, 2],
    [-3, 2],
  ]) {
    const l = new PointLight("l", new Vector3(x, 2.4, z), scene);
    l.diffuse = Color3.FromHexString("#ffe6c4");
    l.intensity = 2.5;
    l.range = 8;
    render.addLight(l, null, false);
  }
  const paneId = d.spawn(paneDef(), { p: { x: 0, y: 0.5, z: 0 }, q: I });
  const tableId = d.spawn(tableDef(), { p: { x: 3, y: 0, z: 0 }, q: I });
  const mwId = d.spawn(buildObject("microwave"), { p: { x: -3, y: 0, z: 0 }, q: qaxisAngle({ x: 0, y: 1, z: 0 }, 0.3) });
  const wallId = d.spawn(wallPanelDef(), { p: { x: 0, y: 0, z: 4 }, q: I });
  step(20);
  const cam = render.camera;
  const shots: string[] = [];
  const shoot = async (pos: [number, number, number], tgt: [number, number, number]) => {
    cam.position.set(...pos);
    cam.setTarget(new Vector3(...tgt));
    await scene.whenReadyAsync();
    for (let i = 0; i < 2; i++) {
      render.update(1 / 60);
      scene.render();
    }
    shots.push(canvas.toDataURL("image/jpeg", 0.88));
  };
  const strike = (id: number, partName: string, local: { x: number; y: number; z: number }, dir: Vector3, mass: number, speed: number, r: number, mat: "steel" | "flesh" = "steel") => {
    const asm = d.assembly(id)!;
    // the original part may have fractured: use the live fragment nearest to the target point
    let p = asm.byName.get(partName);
    if (!p || !p.alive || !p.island) {
      let best = Infinity;
      for (const q of asm.parts) {
        if (!q.name.startsWith(partName) || !q.island) continue;
        const dd = (q.centroid.x - local.x) ** 2 + (q.centroid.y - local.y) ** 2 + (q.centroid.z - local.z) ** 2;
        if (dd < best) {
          best = dd;
          p = q;
        }
      }
    }
    const isl = p!.island!;
    const wp = d.world.toWorldVec(isl, local);
    return d.strike({ point: new Vector3(wp.x, wp.y, wp.z), dir, body: isl.body!, childIndex: -1, mass, speed, sharpness: 1, contactRadius: r, strikerMat: mat, source: "debug" });
  };
  const out: Record<string, unknown> = {};
  // pane: hammer, shoot mid-flight (4 steps later) and after settling
  out.pane = strike(paneId, "glass", { x: 0.12, y: 0.62, z: -0.002 }, new Vector3(0, 0, 1), 0.9, 11, 0.015);
  step(5);
  await shoot([0.9, 1.3, -1.6], [0, 0.95, 0.1]);
  step(90);
  await shoot([0.5, 1.0, -1.0], [0, 0.3, 0.4]);
  // table: sledge, settle
  out.table = strike(tableId, "top", { x: 0.15, y: 0.75, z: 0.05 }, new Vector3(0, -1, 0), 6, 8.5, 0.03);
  step(90);
  // microwave: 4 sledge blows from above
  for (let i = 0; i < 4; i++) {
    const mw = d.assembly(mwId)!;
    const top = mw.byName.get("case_top");
    const isl = top?.island ?? [...mw.islands][0];
    const b = isl.bounds;
    const wp = d.world.toWorldVec(isl, { x: (b.min.x + b.max.x) / 2 + (i - 1.5) * 0.06, y: b.max.y, z: (b.min.z + b.max.z) / 2 });
    d.strike({ point: new Vector3(wp.x, wp.y, wp.z), dir: new Vector3(0, -1, 0), body: isl.body!, childIndex: -1, mass: 6, speed: 7.5, sharpness: 1, contactRadius: 0.03, strikerMat: "steel", source: "debug" });
    step(10);
  }
  // drywall: two punches + a sledge at the same spot
  out.punch1 = strike(wallId, "sheet", { x: 0, y: 0.75, z: -0.00625 }, new Vector3(0, 0, 1), 1.5, 8.5, 0.04, "flesh");
  step(5);
  out.punch2 = strike(wallId, "sheet", { x: 0.02, y: 0.76, z: -0.00625 }, new Vector3(0, 0, 1), 1.5, 8.5, 0.04, "flesh");
  step(5);
  out.sledge = strike(wallId, "sheet", { x: -0.15, y: 0.45, z: -0.00625 }, new Vector3(0, 0, 1), 6, 7, 0.03);
  step(60);
  await shoot([3.9, 1.5, -1.3], [3.0, 0.3, 0.1]);
  await shoot([-0.5, 1.3, 2.4], [0, 0.6, 4]);
  out.wall = { parts: d.assembly(wallId)!.parts.size, islands: d.assembly(wallId)!.islands.size };
  out.microwave = { parts: d.assembly(mwId)!.parts.size, islands: d.assembly(mwId)!.islands.size, damage: round(d.assembly(mwId)!.fraction, 100) };
  out.stats = d.stats();
  // sheet
  const W = canvas.clientWidth || 1280,
    H = canvas.clientHeight || 720;
  const sheet = document.createElement("canvas");
  sheet.width = W;
  sheet.height = H;
  const g = sheet.getContext("2d")!;
  g.fillStyle = "#111";
  g.fillRect(0, 0, W, H);
  await Promise.all(
    shots.map(
      (src, i) =>
        new Promise<void>((res) => {
          const im = new Image();
          im.onload = () => {
            const w = W / 2,
              h = H / 2;
            g.drawImage(im, (i % 2) * w + 1, Math.floor(i / 2) * h + 1, w - 2, h - 2);
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
  return out;
}
