// Diagnostic probe for the bedroom placements: spawn the structure + bedroom fixtures + all
// bedroom items, settle 3 s and report every broken bond (with part names), fractured part,
// strong impact and the per-step awake-body count, to find unstable or self-damaging setups.
// Run: node tests/probe.mjs tests/probes/content-bedrooms-diag.probe.ts --timeout 600000

import { Engine, Scene } from "@babylonjs/core";
import { createPhysics } from "../../src/physics/physics.ts";
import { createRender } from "../../src/render/renderSystem.ts";
import { Destruction } from "../../src/destruction/destructionSystem.ts";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Time, FIXED_DT } from "../../src/core/time.ts";
import { Settings } from "../../src/core/settings.ts";
import { Rng } from "../../src/core/rng.ts";
import { buildStructure } from "../../src/world/structure.ts";
import { bedroomItems } from "../../src/world/furnish/bedrooms.ts";
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
  for (const p of buildStructure()) d.spawn(p.def, p.xf);
  try {
    const mod = await import("../../src/world/furnish/fixtures.ts");
    for (const p of mod.furnishFixtures()) if (p.room === "master" || p.room === "bed2") d.spawn(p.def, p.xf);
  } catch {
    /* optional */
  }
  const only = (globalThis as unknown as { __only?: string[] }).__only;
  const items = bedroomItems().filter((it) => !only || only.some((o) => it.id.startsWith(o)));
  const ids = items.map((it) => d.spawn(it.placement.def, it.placement.xf));
  const idOf = new Map<number, string>(ids.map((id, i) => [id, items[i].id]));
  let step = 0;
  const impacts: string[] = [];
  const breaks: string[] = [];
  events.on("impact", (e) => {
    if (e.energy > 0.5 && impacts.length < 60) impacts.push(`s${step} E=${e.energy.toFixed(2)} J=${e.impulse.toFixed(2)} v=${e.speed.toFixed(2)} ${e.matA}/${e.matB} m=${e.massA.toFixed(2)}/${(e as { massB?: number }).massB?.toFixed?.(2)} @(${e.pos.x.toFixed(2)},${e.pos.y.toFixed(2)},${e.pos.z.toFixed(2)})`);
  });
  events.on("bondBreak", (e) => {
    if (breaks.length < 80) breaks.push(`s${step} ${e.kind} ${e.matA}/${e.matB} E=${e.energy.toFixed(1)} @(${e.pos.x.toFixed(2)},${e.pos.y.toFixed(2)},${e.pos.z.toFixed(2)})`);
  });
  const awake: number[] = [];
  for (step = 0; step < 180; step++) {
    d.beforePhysics(FIXED_DT);
    physics.step(FIXED_DT);
    time.tick();
    d.afterPhysics(FIXED_DT);
    d.update(FIXED_DT);
    if (step % 10 === 0) awake.push(physics.stats().awake);
  }
  const dead: string[] = [];
  const fractured: string[] = [];
  for (const asm of d.world.assemblies.values()) {
    const id = idOf.get(asm.id);
    if (!id) continue;
    for (const b of asm.def.bonds) void b;
    for (const bond of asm.bonds) if (!bond.alive) dead.push(`${id}: ${bond.kind} ${bond.a.name} — ${bond.b ? bond.b.name : "world"} (max ${bond.max.toFixed(0)} J)`);
    for (const part of asm.parts) if (!part.alive || part.name.includes("#")) fractured.push(`${id}: ${part.name}`);
  }
  // positions of jointed / dynamic islands that drifted
  const moved: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const asm = d.world.assemblies.get(ids[i]);
    if (!asm) continue;
    for (const isl of asm.islands) {
      const p = isl.node.position;
      const q = isl.node.rotationQuaternion;
      const ang = q ? 2 * Math.acos(Math.min(1, Math.abs(q.w))) : 0;
      const ref = items[i].placement.xf;
      const dq = Math.abs(Math.abs(ref.q.w) - Math.abs(q?.w ?? 1));
      if (Math.hypot(p.x - ref.p.x, p.y - ref.p.y, p.z - ref.p.z) > 0.01 || dq > 0.01) moved.push(`${items[i].id} island(${isl.parts.length} parts: ${[...isl.parts].slice(0, 2).map((pp) => pp.name).join(",")}) Δp=(${(p.x - ref.p.x).toFixed(3)},${(p.y - ref.p.y).toFixed(3)},${(p.z - ref.p.z).toFixed(3)}) rot=${((ang * 180) / Math.PI).toFixed(1)}°`);
    }
  }
  return { items: items.length, awake, impacts, breaks, dead, fractured, moved: moved.slice(0, 80) };
}
