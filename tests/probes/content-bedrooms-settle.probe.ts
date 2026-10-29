// Settling checks for the bedroom-2 desk and two jointed objects (reviewer findings):
//  * desk + desk lamp (bed2 structure + fixtures): everything must fall asleep and the desk must
//    not creep (the old spring-loaded lamp shoulder never slept and walked the desk ~1.8 mm/s);
//  * the full desk set (desk + PC + monitor + laptop + lamp + smalls): asleep, desk drift < 2 mm;
//  * laptop alone on a slab: the lid must hold its built 115° (within 2°);
//  * office chair alone: the caster wheels must be realised as ball joints (they rely on the
//    runtime's single-pivot hinge → ball rule) and must not sink visibly into the hood.
// Returns { ok, checks, ... }. Run:
//   node tests/probe.mjs tests/probes/content-bedrooms-settle.probe.ts --timeout 600000

import { Engine, Scene, Vector3, Quaternion } from "@babylonjs/core";
import { createPhysics } from "../../src/physics/physics.ts";
import { createRender } from "../../src/render/renderSystem.ts";
import { Destruction } from "../../src/destruction/destructionSystem.ts";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Time, FIXED_DT } from "../../src/core/time.ts";
import { Settings } from "../../src/core/settings.ts";
import { Rng } from "../../src/core/rng.ts";
import { qeuler } from "../../src/geom/vec.ts";
import { Builder } from "../../src/objects/lib/builder.ts";
import { buildStructure } from "../../src/world/structure.ts";
import { bedroomItems } from "../../src/world/furnish/bedrooms.ts";
import { buildLaptop } from "../../src/objects/bedroom/laptop.ts";
import { buildOfficeChair } from "../../src/objects/bedroom/officeChair.ts";
import type { Island } from "../../src/destruction/runtime/types.ts";
import { MockVfx } from "./destruction-util.ts";

type Ctx = { scene: Scene; physics: Awaited<ReturnType<typeof createPhysics>>; d: Destruction; run: (n: number) => void };

export async function probe(): Promise<unknown> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true });
  const make = async (): Promise<Ctx> => {
    const scene = new Scene(engine);
    const settings = new Settings();
    const physics = await createPhysics(scene, {});
    const render = await createRender({ engine, scene, settings, skipAtmosphere: true, textures: { proceduralOnly: true } });
    const events = new EventBus<GameEvents>();
    const time = new Time();
    const d = new Destruction({ physics, render, vfx: new MockVfx(), events, time, settings, rng: new Rng(7), scene });
    const run = (n: number): void => {
      for (let i = 0; i < n; i++) {
        d.beforePhysics(FIXED_DT);
        physics.step(FIXED_DT);
        time.tick();
        d.afterPhysics(FIXED_DT);
        d.update(FIXED_DT);
      }
    };
    return { scene, physics, d, run };
  };
  const slab = (d: Destruction): void => {
    const fb = new Builder("probeFloor", "Floor", "structure", 0, 1);
    fb.box("slab", "concrete", "concrete", [6, 0.1, 3], [0, -0.05, 0]);
    fb.world("slab", "mortar", 1e6, [0, -0.05, 0]);
    d.spawn(fb.build(), { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });
  };
  /** World position of an assembly-frame point carried by an island. */
  const toWorld = (isl: Island, p: { x: number; y: number; z: number }): Vector3 => {
    const q = isl.node.rotationQuaternion ?? Quaternion.Identity();
    return new Vector3(p.x, p.y, p.z).applyRotationQuaternion(q).addInPlace(isl.node.position);
  };
  const islandOf = (asmId: number, d: Destruction, part: string): Island => [...d.world.assemblies.get(asmId)!.islands].find((i) => i.parts.some((p) => p.name === part))!;
  const relAngleDeg = (a: Island, b: Island): number => {
    const qa = a.node.rotationQuaternion ?? Quaternion.Identity();
    const qb = b.node.rotationQuaternion ?? Quaternion.Identity();
    const r = Quaternion.Inverse(qa).multiply(qb);
    return (2 * Math.acos(Math.min(1, Math.abs(r.w))) * 180) / Math.PI;
  };
  const checks: Record<string, boolean> = {};
  const out: Record<string, unknown> = {};

  // ---- desk variants in the real bedroom 2
  for (const [name, only] of [
    ["deskLamp", ["b_desk", "b_lamp"]],
    ["deskFull", ["b_desk", "b_pc", "b_monitor", "b_speaker", "b_keyboard", "b_mouse", "b_mug", "b_laptop", "b_lamp", "b_papers"]],
  ] as Array<[string, string[]]>) {
    const c = await make();
    for (const p of buildStructure()) c.d.spawn(p.def, p.xf);
    const mod = await import("../../src/world/furnish/fixtures.ts");
    for (const p of mod.furnishFixtures()) if (p.room === "bed2") c.d.spawn(p.def, p.xf);
    const items = bedroomItems().filter((it) => only.some((o) => it.id === o || it.id.startsWith(o + "_") || (o === "b_speaker" && it.id.startsWith(o))));
    const ids = items.map((it) => c.d.spawn(it.placement.def, it.placement.xf));
    const deskK = items.findIndex((it) => it.id === "b_desk");
    const lampK = items.findIndex((it) => it.id === "b_lamp");
    const pos = (k: number): Vector3 => {
      const p = c.d.positionOf(ids[k])!;
      return new Vector3(p.x, p.y, p.z);
    };
    const trace: string[] = [];
    c.run(180); // 3 s settle
    const desk3 = pos(deskK),
      lamp3 = pos(lampK);
    let awakeEnd = 0;
    for (let s = 0; s < 600; s += 60) {
      c.run(60);
      awakeEnd = c.physics.stats().awake;
      const dd = pos(deskK).subtract(desk3);
      trace.push(`t=${(3 + (s + 60) / 60).toFixed(0)}s awake=${awakeEnd} desk=(${(dd.x * 1000).toFixed(2)},${(dd.z * 1000).toFixed(2)})mm`);
    }
    const deskDrift = pos(deskK).subtract(desk3).length() * 1000;
    const lampDrift = pos(lampK).subtract(lamp3).length() * 1000;
    const deskTotal = pos(deskK).subtract(new Vector3(items[deskK].placement.xf.p.x, items[deskK].placement.xf.p.y, items[deskK].placement.xf.p.z)).length() * 1000;
    const lampBase = islandOf(ids[lampK], c.d, "base_weight");
    const joints: Record<string, number> = {};
    for (const nm of ["turret", "arm1_l", "elbow", "head_knuckle"]) {
      const isl = islandOf(ids[lampK], c.d, nm);
      if (isl !== lampBase) joints[nm] = +relAngleDeg(lampBase, isl).toFixed(2);
    }
    out[name] = { trace, deskDriftMm_3to13s: +deskDrift.toFixed(2), deskFromPlacementMm: +deskTotal.toFixed(2), lampDriftMm_3to13s: +lampDrift.toFixed(2), lampJointAnglesDeg: joints, awakeEnd };
    checks[`${name}: all asleep after 13 s`] = awakeEnd === 0;
    checks[`${name}: desk drifts < 2 mm over 10 s`] = deskDrift < 2;
    checks[`${name}: lamp drifts < 2 mm over 10 s`] = lampDrift < 2;
    c.scene.dispose();
  }

  // ---- laptop lid + office chair casters on a plain slab
  {
    const c = await make();
    slab(c.d);
    const lap = c.d.spawn(buildLaptop({ seed: 119 }), { p: { x: -1.5, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });
    const chair = c.d.spawn(buildOfficeChair({ seed: 131 }), { p: { x: 1, y: 0, z: 0 }, q: qeuler(0, Math.PI / 2, 0) });
    c.run(60);
    const lidAngle = (): number => relAngleDeg(islandOf(lap, c.d, "bottom"), islandOf(lap, c.d, "lid_back"));
    const lid1s = lidAngle();
    c.run(540);
    const lid10s = lidAngle();
    out.laptop = { lidDeviationDeg_1s: +lid1s.toFixed(2), lidDeviationDeg_10s: +lid10s.toFixed(2) };
    checks["laptop: lid holds its built angle within 2°"] = lid10s < 2;
    // casters: constraint kinds and wheel-centre displacement relative to its hood (sag)
    const asm = c.d.world.assemblies.get(chair)!;
    const kinds: string[] = [];
    for (const g of asm.groups.values()) for (const jc of g.constraints) if (jc.moving.parts.some((p) => p.name.endsWith("_wheel"))) kinds.push(jc.kind);
    const def = buildOfficeChair({ seed: 131 });
    const sag: number[] = [];
    const clear: number[] = [];
    for (let k = 0; k < 5; k++) {
      const wheelDef = def.parts.find((p) => p.name === `caster${k}_wheel`)!;
      const hoodDef = def.parts.find((p) => p.name === `caster${k}_hood`)!;
      let cx = 0,
        cy = 0,
        cz = 0,
        top = -Infinity,
        under = Infinity;
      for (const v of wheelDef.poly.verts) {
        cx += v.x / wheelDef.poly.verts.length;
        cy += v.y / wheelDef.poly.verts.length;
        cz += v.z / wheelDef.poly.verts.length;
        top = Math.max(top, v.y);
      }
      for (const v of hoodDef.poly.verts) under = Math.min(under, v.y);
      const ctr = { x: cx, y: cy, z: cz };
      const wW = toWorld(islandOf(chair, c.d, `caster${k}_wheel`), ctr);
      const hW = toWorld(islandOf(chair, c.d, `caster${k}_hood`), ctr);
      const dy = (wW.y - hW.y) * 1000; // + = wheel pushed up into the hood
      sag.push(+dy.toFixed(1));
      clear.push(+((under - top) * 1000 - dy).toFixed(1)); // remaining gap wheel top → hood underside
    }
    out.chair = { casterConstraintKinds: kinds, wheelRiseIntoHoodMm: sag, wheelTopToHoodGapMm: clear };
    checks["chair: 5 caster ball joints"] = kinds.length === 5 && kinds.every((k) => k === "ball");
    checks["chair: wheels do not pass > 2 mm into the hood"] = clear.every((g) => g > -2);
    c.scene.dispose();
  }
  return { ok: Object.values(checks).every(Boolean), checks, ...out };
}
