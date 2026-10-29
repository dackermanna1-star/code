// THROWAWAY: desk lamp settle variants on a slab.
import { Engine, Scene, Quaternion } from "@babylonjs/core";
import { createPhysics } from "../../src/physics/physics.ts";
import { createRender } from "../../src/render/renderSystem.ts";
import { Destruction } from "../../src/destruction/destructionSystem.ts";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Time, FIXED_DT } from "../../src/core/time.ts";
import { Settings } from "../../src/core/settings.ts";
import { Rng } from "../../src/core/rng.ts";
import { Builder } from "../../src/objects/lib/builder.ts";
import { buildDeskLamp } from "../../src/objects/bedroom/lamps.ts";
import { MockVfx } from "./destruction-util.ts";

const V = (globalThis as any).__variants as string[] | undefined;

export async function probe(): Promise<unknown> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true });
  const out: Record<string, unknown> = {};
  const weldWhere = (def: any, f: (b: any) => boolean) => { for (const b of def.bonds) if (b.joint && f(b)) { b.kind = "weld"; delete b.joint; b.strength = 60; } };
  const only = (def: any) => { weldWhere(def, (b) => b.a === "turret"); weldWhere(def, (b) => !b.a.startsWith("arm1")); };
  const sh = (def: any, f: (j: any) => void) => { for (const b of def.bonds) if (b.joint && b.a.startsWith("arm1")) f(b.joint); };
  const heavy = (def: any) => { for (const p of def.parts) if (p.name === "base_weight") p.mass = 20; };
  const variants: Record<string, (def: any) => void> = {
    lockedHeavy: (def) => { only(def); heavy(def); sh(def, (j) => { j.min = -0.001; j.max = 0.001; }); },
    f5Heavy: (def) => { only(def); heavy(def); },
    curHeavy: (def) => { heavy(def); },
  };
  void V;
  for (const [name, patch] of Object.entries(variants)) {
    const scene = new Scene(engine);
    const settings = new Settings();
    const physics = await createPhysics(scene, {});
    const render = await createRender({ engine, scene, settings, skipAtmosphere: true, textures: { proceduralOnly: true } });
    const events = new EventBus<GameEvents>();
    const time = new Time();
    const d = new Destruction({ physics, render, vfx: new MockVfx(), events, time, settings, rng: new Rng(7), scene });
    const fb = new Builder("probeFloor", "Floor", "structure", 0, 1);
    fb.box("slab", "concrete", "concrete", [3, 0.1, 3], [0, -0.05, 0]);
    fb.world("slab", "mortar", 1e6, [0, -0.05, 0]);
    d.spawn(fb.build(), { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });
    const def = buildDeskLamp({ seed: 120 });
    patch(def);
    const id = d.spawn(def, { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });
    const trace: string[] = [];
    for (let s = 0; s <= 900; s++) {
      d.beforePhysics(FIXED_DT); physics.step(FIXED_DT); time.tick(); d.afterPhysics(FIXED_DT); d.update(FIXED_DT);
      if (s < 80 ? s % 8 === 0 : s % 150 === 0) {
        const a = d.world.assemblies.get(id)!;
        let info = "";
        for (const isl of a.islands) {
          const q = isl.node.rotationQuaternion ?? Quaternion.Identity();
          const e = q.toEulerAngles();
          info += ` ${isl.parts[0].name}[${(e.x*57.3).toFixed(1)},${(e.y*57.3).toFixed(1)},${(e.z*57.3).toFixed(1)}] p(${(isl.node.position.x*1000).toFixed(1)},${(isl.node.position.y*1000).toFixed(1)},${(isl.node.position.z*1000).toFixed(1)})`;
        }
        trace.push(`s${s} awake=${physics.stats().awake}${info}`);
      }
    }
    out[name] = { trace };
    scene.dispose();
  }
  return out;
}
