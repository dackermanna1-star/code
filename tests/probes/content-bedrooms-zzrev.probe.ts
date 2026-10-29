// THROWAWAY reviewer probe: desk drift isolation + keyboard drop key-shedding.
import { Engine, Scene, Vector3 } from "@babylonjs/core";
import { createPhysics } from "../../src/physics/physics.ts";
import { createRender } from "../../src/render/renderSystem.ts";
import { Destruction } from "../../src/destruction/destructionSystem.ts";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Time, FIXED_DT } from "../../src/core/time.ts";
import { Settings } from "../../src/core/settings.ts";
import { Rng } from "../../src/core/rng.ts";
import { buildStructure } from "../../src/world/structure.ts";
import { bedroomItems } from "../../src/world/furnish/bedrooms.ts";
import { buildKeyboard } from "../../src/objects/bedroom/peripherals.ts";
import { MockVfx } from "./destruction-util.ts";

export async function probe(): Promise<unknown> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true });
  const out: Record<string, unknown> = {};
  const variants: Array<[string, string[] | null]> = [
    ["chairAlone", ["b_chair"]],
    ["deskLamp", ["b_desk", "b_lamp"]],
    ["deskNoLamp", ["b_desk", "b_pc", "b_monitor", "b_speaker", "b_keyboard", "b_mouse", "b_mug", "b_laptop", "b_papers"]],
  ];
  for (const [name, only] of variants) {
    const scene = new Scene(engine);
    const settings = new Settings();
    const physics = await createPhysics(scene, {});
    const render = await createRender({ engine, scene, settings, skipAtmosphere: true, textures: { proceduralOnly: true } });
    const events = new EventBus<GameEvents>();
    const time = new Time();
    const d = new Destruction({ physics, render, vfx: new MockVfx(), events, time, settings, rng: new Rng(7), scene });
    for (const p of buildStructure()) if (p.def.room === undefined || true) d.spawn(p.def, p.xf);
    const mod = await import("../../src/world/furnish/fixtures.ts");
    for (const p of mod.furnishFixtures()) if (p.room === "bed2") d.spawn(p.def, p.xf);
    const items = bedroomItems().filter((it) => !only || only.some((o) => it.id.startsWith(o)));
    const ids = items.map((it) => d.spawn(it.placement.def, it.placement.xf));
    const contacts: string[] = [];
    events.on("impact", (e) => {
      if (contacts.length < 20) contacts.push(`${e.matA}/${e.matB} E=${e.energy.toFixed(3)} @(${e.pos.x.toFixed(2)},${e.pos.y.toFixed(2)},${e.pos.z.toFixed(2)})`);
    });
    const trace: string[] = [];
    for (let s = 0; s < 180; s++) {
      d.beforePhysics(FIXED_DT);
      physics.step(FIXED_DT);
      time.tick();
      d.afterPhysics(FIXED_DT);
      d.update(FIXED_DT);
      if (s % 30 === 0 || s < 5) {
        const p = d.positionOf(ids[0])!;
        const r = items[0].placement.xf.p;
        let lampInfo = "";
        const li = items.findIndex((it) => it.id === "b_lamp");
        if (li >= 0) {
          const a = d.world.assemblies.get(ids[li])!;
          for (const isl of a.islands) {
            const q = isl.node.rotationQuaternion;
            const ang = q ? (2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180) / Math.PI : 0;
            lampInfo += ` ${[...isl.parts][0].name}:${ang.toFixed(1)}deg`;
          }
        }
        trace.push(`s${s} d=(${((p.x - r.x) * 1000).toFixed(1)},${((p.y - r.y) * 1000).toFixed(1)},${((p.z - r.z) * 1000).toFixed(1)})mm awake=${physics.stats().awake}${lampInfo}`);
      }
    }
    const moved = ids.map((id, i) => {
      const p = d.positionOf(id)!;
      const r = items[i].placement.xf.p;
      return `${items[i].id}: (${((p.x - r.x) * 1000).toFixed(1)},${((p.y - r.y) * 1000).toFixed(1)},${((p.z - r.z) * 1000).toFixed(1)})mm`;
    });
    out[name] = { trace, moved, contacts };
    scene.dispose();
  }
  return out;
  // keyboard drops on a concrete floor from 0.75 m and a 6 m/s throw
  {
    const scene = new Scene(engine);
    const settings = new Settings();
    const physics = await createPhysics(scene, {});
    const render = await createRender({ engine, scene, settings, skipAtmosphere: true, textures: { proceduralOnly: true } });
    const events = new EventBus<GameEvents>();
    const time = new Time();
    const d = new Destruction({ physics, render, vfx: new MockVfx(), events, time, settings, rng: new Rng(7), scene });
    for (const p of buildStructure()) d.spawn(p.def, p.xf);
    const kb1 = d.spawn(buildKeyboard({ seed: 116 }), { p: { x: 6, y: 0.75, z: 2 }, q: { x: 0, y: 0, z: 0, w: 1 } });
    const kb2 = d.spawn(buildKeyboard({ seed: 117 }), { p: { x: 7, y: 0.75, z: 2 }, q: { x: 0.2, y: 0, z: 0.1, w: 0.97 } });
    const kb3 = d.spawn(buildKeyboard({ seed: 118 }), { p: { x: 5, y: 1.2, z: 2 }, q: { x: 0, y: 0, z: 0, w: 1 } });
    const a3 = d.world.assemblies.get(kb3)!;
    for (const isl of a3.islands) isl.body?.setLinearVelocity(new Vector3(0, -2, 6));
    const run = (n: number): void => {
      for (let i = 0; i < n; i++) {
        d.beforePhysics(FIXED_DT);
        physics.step(FIXED_DT);
        time.tick();
        d.afterPhysics(FIXED_DT);
        d.update(FIXED_DT);
      }
    };
    run(150);
    const loose = (id: number): number => {
      const a = d.world.assemblies.get(id)!;
      let n = 0;
      for (const b of a.bonds) if (!b.alive && b.a.name.startsWith("key_")) n++;
      return n;
    };
    out.keyboard = { flatDrop: loose(kb1), tiltedDrop: loose(kb2), throw6ms: loose(kb3) };
    scene.dispose();
  }
  return out;
}
