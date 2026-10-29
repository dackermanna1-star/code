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

export async function probe(): Promise<unknown> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true });
  const out: Record<string, unknown> = {};
  const weldWhere = (def: any, f: (b: any) => boolean) => { for (const b of def.bonds) if (b.joint && f(b)) { b.kind = "weld"; delete b.joint; b.strength = 60; } };
  const weld = (def: any) => weldWhere(def, (b) => b.a === "turret");
  const variants: Record<string, (def: any) => void> = { bar1: () => {}, bar2: () => {}, bar3: () => {} };
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
    void patch;
    const bb = new Builder("bar", "Bar", "misc", 0, 1);
    bb.box("post", "steel", "steel_brushed", [0.04, 0.3, 0.04], [0, 0.15, 0], { mass: 2 });
    // bar 0.4 m long sticking out along +Z from a pivot at the post top, 1 kg → τ = 0.2·9.81 ≈ 2 N·m
    const fr = name === "bar1" ? 5 : name === "bar2" ? 20 : 0;
    bb.box("bar", "steel", "steel_brushed", [0.02, 0.02, 0.4], [0, 0.32, 0.2 + 0.021], { mass: 1 });
    bb.hinge("bar", "post", { pivots: name === "bar3" ? [[-0.01, 0.32, 0.01], [0.01, 0.32, 0.01]] : [[-0.01, 0.32, 0.01], [0.01, 0.32, 0.01]], axis: [1, 0, 0], min: -80, max: 80, friction: fr || 5, strength: 1e4 });
    const def = bb.build();
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
          info += ` ${isl.parts[0].name}[${(e.x*57.3).toFixed(1)},${(e.y*57.3).toFixed(1)},${(e.z*57.3).toFixed(1)}] p(${(isl.node.position.x*1000).toFixed(1)},${(isl.node.position.z*1000).toFixed(1)})`;
        }
        trace.push(`s${s} awake=${physics.stats().awake}${info}`);
      }
    }
    const a = d.world.assemblies.get(id)!;
    const gs: string[] = [];
    for (const g of a.groups.values()) gs.push(`${(g as any).id ?? ""}:${g.constraints.map((c) => c.kind + "(" + c.moving.parts[0].name + "->" + (c.fixed?.parts[0].name ?? "anchor") + ")").join(",")}`);
    const plug: any = (scene.getPhysicsEngine() as any)?.getPhysicsPlugin();
    for (const g of a.groups.values()) for (const jc of g.constraints) gs.push(`fric=${plug?.getAxisFriction?.(jc.c, 3)} mode=${plug?.getAxisMode?.(jc.c, 3)} min=${plug?.getAxisMinLimit?.(jc.c, 3)} max=${plug?.getAxisMaxLimit?.(jc.c, 3)} def=${JSON.stringify(g.def)}`);
    let dead = 0; for (const b of a.bonds) if (!b.alive) dead++;
    out[name] = { trace, gs, dead };
    scene.dispose();
  }
  return out;
}
