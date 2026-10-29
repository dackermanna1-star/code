// Office chair caster stability: spawns chair variants side by side on a static concrete slab
// and on a soft carpet slab (jointed casters with different caster masses, fixed casters),
// settles 2 s, then pushes each chair and reports drop, tilt, roll distance and whether casters
// came apart.
// Run: node tests/probe.mjs tests/probes/content-bedrooms-chair.probe.ts --timeout 600000

import { Engine, Scene, Vector3 } from "@babylonjs/core";
import { createPhysics } from "../../src/physics/physics.ts";
import { createRender } from "../../src/render/renderSystem.ts";
import { Destruction } from "../../src/destruction/destructionSystem.ts";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Time, FIXED_DT } from "../../src/core/time.ts";
import { Settings } from "../../src/core/settings.ts";
import { Rng } from "../../src/core/rng.ts";
import { qeuler } from "../../src/geom/vec.ts";
import { Builder } from "../../src/objects/lib/builder.ts";
import { buildOfficeChair } from "../../src/objects/bedroom/officeChair.ts";
import { MockVfx } from "./destruction-util.ts";

export async function probe(): Promise<unknown> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true });
  const scene = new Scene(engine);
  const settings = new Settings();
  const physics = await createPhysics(scene, {});
  const render = await createRender({ engine, scene, settings, skipAtmosphere: true, textures: { proceduralOnly: true } });
  const events = new EventBus<GameEvents>();
  const time = new Time();
  const d = new Destruction({ physics, render, vfx: new MockVfx(), events, time, settings, rng: new Rng(7), scene });
  // static concrete floor (top at y = 0) with a 10 mm carpet slab on half of it (top at y = 0.01)
  const fb = new Builder("probeFloor", "Floor", "structure", 0, 1);
  fb.box("slab", "concrete", "concrete", [8, 0.1, 3], [0, -0.05, 0]);
  fb.world("slab", "mortar", 1e6, [0, -0.05, 0]);
  fb.box("carpet", "fabric", "carpet", [4, 0.01, 3], [2, 0.005, 0]);
  fb.bond("carpet", "slab", "glue", { strength: 500 });
  fb.world("carpet", "glue", 1e5, [2, 0, 0]);
  d.spawn(fb.build(), { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });
  const base: Array<{ name: string; opts: Record<string, unknown> }> = [
    { name: "jointed 0.07", opts: {} },
    { name: "jointed 0.15", opts: { casterKg: 0.15 } },
    { name: "jointed 0.3", opts: { casterKg: 0.3 } },
    { name: "fixed", opts: { casters: "fixed" } },
  ];
  const variants = [...base.map((v) => ({ ...v, name: `concrete ${v.name}`, x: -3.6 + 0.8 * base.indexOf(v), y: 0 })), ...base.map((v) => ({ ...v, name: `carpet ${v.name}`, x: 0.6 + 0.8 * base.indexOf(v), y: 0.01 }))];
  const ids = variants.map((v) => d.spawn(buildOfficeChair({ seed: 131, ...v.opts }), { p: { x: v.x, y: v.y, z: 0 }, q: qeuler(0, Math.PI / 2, 0) }));
  const run = (n: number): void => {
    for (let i = 0; i < n; i++) {
      d.beforePhysics(FIXED_DT);
      physics.step(FIXED_DT);
      time.tick();
      d.afterPhysics(FIXED_DT);
      d.update(FIXED_DT);
    }
  };
  const snapshot = (): Array<Record<string, unknown>> =>
    ids.map((id, k) => {
      const asm = d.world.assemblies.get(id)!;
      const main = [...asm.islands].sort((a, b) => b.mass - a.mass)[0];
      const p = main.node.position;
      const q = main.node.rotationQuaternion!;
      const up = new Vector3(0, 1, 0).applyRotationQuaternion(q);
      let broken = 0;
      for (const b of asm.bonds) if (!b.alive) broken++;
      let maxV = 0;
      for (const isl of asm.islands) if (isl.body) maxV = Math.max(maxV, isl.body.getLinearVelocity().length());
      // per-island drop (island frames start at the spawn frame): shows which joint sags
      const drops: Record<string, number> = {};
      for (const isl of asm.islands) {
        const nm = isl.parts.find((q) => q.name === "hub" || q.name === "mechanism" || q.name.endsWith("_hood") || q.name.endsWith("_wheel"))?.name ?? isl.parts[0].name;
        if (nm === "hub" || nm === "mechanism" || nm === "caster0_hood" || nm === "caster0_wheel") drops[nm] = +(isl.node.position.y - variants[k].y).toFixed(3);
      }
      return { v: variants[k].name, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), tiltDeg: +((Math.acos(Math.min(1, up.y)) * 180) / Math.PI).toFixed(1), islands: asm.islands.size, broken, maxV: +maxV.toFixed(2), drops };
    });
  run(2);
  const s0 = snapshot();
  run(118);
  const s1 = snapshot();
  // push every chair along -z (sideways) with an impulse at seat height
  for (const id of ids) {
    const asm = d.world.assemblies.get(id)!;
    const main = [...asm.islands].sort((a, b) => b.mass - a.mass)[0];
    main.body!.applyImpulse(new Vector3(0, 0, -25), main.node.getAbsolutePosition().add(new Vector3(0, 0.45, 0)));
  }
  run(120);
  const s2 = snapshot();
  return { s0, settled: s1, afterPush: s2 };
}
