// Regression probe for the review fixes: slider re-created while open, impact static flags,
// exception safety of spawn/fracture, batched debris restore, kicks on static→dynamic, single
// damage path for pulled joints, silent removal of non-finite islands, damage accounting,
// motor hinges not treated as doors, hard-wired lights dying with their mount, unlit bulb
// shards, deferred island creation under a tiny budget, leak check.
import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, doorDef, drawerDef, paneDef, blockDef, boxPart, round } from "./destruction-util.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";
import { S } from "../../src/render/surfaces.ts";

const I = { x: 0, y: 0, z: 0, w: 1 };

export async function probe() {
  const sim = await makeSim();
  const { d, physics } = sim;
  const out: Record<string, unknown> = {};
  const base = sim.counts();
  const floorId = d.spawn(floorDef(16), { p: { x: 0, y: 0, z: 0 }, q: I });
  const ids: number[] = [floorId];
  const strikeAt = (body: any, p: { x: number; y: number; z: number }, dir: Vector3, mass: number, speed: number, r = 0.015) =>
    d.strike({ point: new Vector3(p.x, p.y, p.z), dir, body, childIndex: -1, mass, speed, sharpness: 1, contactRadius: r, strikerMat: "steel", source: "debug" });

  // ---------------------------------------------------------------- 1. slider re-created open
  {
    const id = d.spawn(drawerDef(), { p: { x: 5, y: 0, z: -5 }, q: I });
    ids.push(id);
    const asm = d.assembly(id)!;
    const g = [...asm.groups.values()][0];
    const box = asm.byName.get("box")!;
    sim.step(10);
    for (let i = 0; i < 240 && (d.joints.coordinate(g) ?? 0) < 0.235; i++) {
      const isl = box.island!;
      const c = d.world.toWorldVec(isl, isl.com);
      isl.body!.applyForce(new Vector3(0, 0, 40), new Vector3(c.x, c.y, c.z));
      sim.step(1);
    }
    box.island!.body!.setLinearVelocity(new Vector3(0, 0, 0));
    sim.step(5);
    const before = d.joints.coordinate(g)!;
    d.world.breakBond(g.bonds[0]);
    d.joints.refreshDirty();
    const jc = g.constraints[0];
    const physPos = jc ? (physics as any).sliderPosition(jc.c) : NaN;
    sim.step(20);
    const after20 = d.joints.coordinate(g)!;
    let minIn = 10;
    for (let i = 0; i < 90; i++) {
      const isl = box.island!;
      const c = d.world.toWorldVec(isl, isl.com);
      isl.body!.applyForce(new Vector3(0, 0, -60), new Vector3(c.x, c.y, c.z));
      sim.step(1);
      minIn = Math.min(minIn, d.joints.coordinate(g)!);
    }
    let maxOut = -10;
    for (let i = 0; i < 120; i++) {
      const isl = box.island!;
      const c = d.world.toWorldVec(isl, isl.com);
      isl.body!.applyForce(new Vector3(0, 0, 60), new Vector3(c.x, c.y, c.z));
      sim.step(1);
      maxOut = Math.max(maxOut, d.joints.coordinate(g)!);
    }
    out.slider = { before: round(before), physPosAtCreation: round(physPos), after20: round(after20), minIn: round(minIn), maxOut: round(maxOut), constraints: g.constraints.map((c) => c.kind), ok: Math.abs(after20 - before) < 0.03 && minIn > -0.015 && maxOut > 0.38 && maxOut < 0.42 };
  }

  // ---------------------------------------------------------------- 2. impact static flags
  {
    const imps: any[] = [];
    const off = sim.events.on("impact", (e: any) => imps.push(e));
    const id = d.spawn({ ...blockDef("softwood", { x: 0.2, y: 0.06, z: 0.1 }, "brick", "wood_pine"), startAsleep: false } as AssemblyDef, { p: { x: 3, y: 0.6, z: 3 }, q: I });
    ids.push(id);
    sim.step(60);
    (off as unknown as (() => void) | undefined)?.();
    const flagged = imps.filter((e) => typeof e.staticA === "boolean" && typeof e.staticB === "boolean");
    const floorHit = imps.find((e) => e.staticA !== e.staticB);
    out.staticFlags = { events: imps.length, flagged: flagged.length, floorHit: floorHit ? { staticA: floorHit.staticA, staticB: floorHit.staticB, matA: floorHit.matA, matB: floorHit.matB } : null, ok: imps.length > 0 && flagged.length === imps.length && !!floorHit };
  }

  // ---------------------------------------------------------------- 3. exception safety
  {
    const P = physics as any;
    const c0 = sim.counts();
    const origBody = P.createBody;
    let calls = 0;
    P.createBody = function (...a: unknown[]) {
      if (++calls === 2) throw new Error("injected createBody failure");
      return origBody.apply(this, a);
    };
    let threw = false;
    try {
      d.spawn(doorDef({ latch: 40 }), { p: { x: -5, y: 0, z: 5 }, q: I });
    } catch {
      threw = true;
    }
    P.createBody = origBody;
    const c1 = sim.counts();
    const spawnLeak = Object.fromEntries(Object.entries(c1).map(([k, v]) => [k, v - (c0 as any)[k]]).filter(([, v]) => v !== 0));
    // fracture with every collider creation failing after the first few
    const paneId = d.spawn(paneDef(), { p: { x: -5, y: 1, z: -5 }, q: I });
    ids.push(paneId);
    const pane = d.assembly(paneId)!;
    const glass = pane.byName.get("glass")!;
    sim.step(2);
    const shapes0 = physics.hk.HP_GetStatistics()[1][1];
    const parts0 = d.stats().parts;
    const names = ["hullShape", "boxShape", "sphereShape"];
    const orig: Record<string, any> = {};
    let made = 0;
    for (const n of names) {
      orig[n] = P[n];
      P[n] = function (...a: unknown[]) {
        if (++made > 3) throw new RangeError("injected shape failure");
        return orig[n].apply(this, a);
      };
    }
    const gp = d.world.toWorldVec(glass.island!, { x: 0.1, y: 0.6, z: -0.002 });
    strikeAt(glass.island!.body!, gp, new Vector3(0, 0, 1), 0.9, 11);
    for (const n of names) P[n] = orig[n];
    const orphans = [...pane.parts].filter((p) => !p.island && !p.limbo).length;
    const shapes1 = physics.hk.HP_GetStatistics()[1][1];
    const intact = glass.alive && !glass.pendingFracture;
    // and it still works afterwards
    const r2 = strikeAt(glass.island!.body!, gp, new Vector3(0, 0, 1), 0.9, 11);
    sim.step(30);
    out.exceptions = { spawnThrew: threw, spawnLeak, fractureOrphans: orphans, shapesDelta: shapes1 - shapes0, partsDelta: d.stats().parts - parts0 > 0, glassIntactAfterFailure: intact, secondStrikeBroke: r2.broke, ok: threw && Object.keys(spawnLeak).length === 0 && orphans === 0 && shapes1 === shapes0 && intact && r2.broke };
  }

  // ---------------------------------------------------------------- 4. batched debris restore
  {
    sim.settings.data.quality = "low"; // consolidateAfter 1 s
    const blocks: any[] = [];
    for (let i = 0; i < 48; i++) {
      const x = 8.1 + (i % 7) * 0.26,
        z = 8.1 + Math.floor(i / 7) * 0.26;
      const id = d.spawn({ ...blockDef("softwood", { x: 0.06, y: 0.06, z: 0.06 }, "cube", "wood_pine"), startAsleep: false } as AssemblyDef, { p: { x, y: 0.0, z }, q: I });
      ids.push(id);
      blocks.push([...d.assembly(id)!.islands][0]);
    }
    let inBatch = 0;
    for (let i = 0; i < 60 * 12 && inBatch < blocks.length; i++) {
      sim.step(1);
      inBatch = blocks.filter((b) => b.consolidated?.inBatch).length;
    }
    const b0 = sim.render.builds;
    const t0 = performance.now();
    for (const b of blocks) if (b.consolidated) d.debris.restore(b);
    sim.step(1);
    out.debrisRestore = { consolidated: inBatch, buildIslandCalls: sim.render.builds - b0, ms: round(performance.now() - t0, 10), ok: inBatch === 48 && sim.render.builds - b0 <= 50 };
    sim.settings.data.quality = "high";
  }

  // ---------------------------------------------------------------- 5. kick on static→dynamic
  {
    const def: AssemblyDef = { type: "testWallBlock", name: "Wall Block", category: "misc", value: 1, parts: [boxPart("b", "softwood", "wood_pine", { x: 0.2, y: 0.2, z: 0.2 }, { x: 0, y: 0.1, z: 0 })], bonds: [{ a: "b", b: "world", kind: "screw", strength: 50 }] };
    const id = d.spawn(def, { p: { x: -8, y: 2, z: 0 }, q: I });
    ids.push(id);
    const part = d.assembly(id)!.byName.get("b")!;
    part.pendingKick = { x: 0, y: 4, z: 0 };
    d.world.breakBond(part.bonds[0]);
    d.world.flushTopology();
    const v = new Vector3();
    part.island!.body!.getLinearVelocityToRef(v);
    out.kick = { static: part.island!.isStatic, vy: round(v.y), pendingLeft: part.pendingKick, ok: !part.island!.isStatic && v.y > 3.5 && part.pendingKick === null };
  }

  // ---------------------------------------------------------------- 6. pulled joints: one damage path
  {
    const run = (mode: "both" | "pull" | "force", x: number): number => {
      const id = d.spawn(doorDef({ latch: 40 }), { p: { x, y: 0, z: -9 }, q: I });
      ids.push(id);
      const asm = d.assembly(id)!;
      const g = [...asm.groups.values()][0];
      const slab = asm.byName.get("slab")!;
      sim.step(5);
      for (let i = 0; i < 60 * 4; i++) {
        const isl = slab.island!;
        const p = d.world.toWorldVec(isl, { x: 0.3, y: 1.0, z: 0 });
        const F = new Vector3(0, 0, -300);
        if (mode !== "pull") isl.body!.applyForce(F, new Vector3(p.x, p.y, p.z));
        if (mode !== "force") d.pull(isl.body!, new Vector3(p.x, p.y, p.z), F, 1 / 60);
        sim.step(1);
        if (!g.latch?.alive) return round(i / 60, 100);
      }
      return -1;
    };
    const both = run("both", -12),
      pull = run("pull", -10),
      force = run("force", -8);
    out.pullOnce = { latchBreakS: { both, pull, force }, ok: both > 0 && pull > 0 && Math.abs(both - pull) <= 0.1 + 0.25 * pull };
  }

  // ---------------------------------------------------------------- 7. non-finite island: silent
  {
    const id = d.spawn({ ...blockDef("plastic", { x: 0.1, y: 0.1, z: 0.1 }), startAsleep: false } as AssemblyDef, { p: { x: 10, y: 1, z: -10 }, q: I });
    ids.push(id);
    const isl = [...d.assembly(id)!.islands][0];
    const fell: any[] = [];
    const off = sim.events.on("fellOut", (e: any) => fell.push(e));
    isl.node.position.x = NaN;
    (d.debris as any).check(isl);
    (off as unknown as (() => void) | undefined)?.();
    out.nanRemoval = { removed: !isl.alive, fellOutEvents: fell.length, ok: !isl.alive && fell.length === 0 };
  }

  // ---------------------------------------------------------------- 8. damage accounting
  {
    const id = d.spawn({ ...blockDef("ceramic", { x: 0.3, y: 0.02, z: 0.3 }, "tile", "ceramic_white"), startAsleep: false } as AssemblyDef, { p: { x: 12, y: 0, z: 12 }, q: I });
    ids.push(id);
    const asm = d.assembly(id)!;
    sim.step(20);
    for (let k = 0; k < 12; k++) {
      const live = [...asm.parts].filter((p) => p.alive && p.island);
      if (!live.length) break;
      const p = live[k % live.length];
      const wp = d.world.toWorldVec(p.island!, { x: p.centroid.x, y: p.bounds.max.y, z: p.centroid.z });
      strikeAt(p.island!.body!, wp, new Vector3(0, -1, 0), 1.2, 9, 0.01);
      sim.step(10);
    }
    const pane = d.assembly(ids[3])!; // the pane from step 3 (fractured twice)
    out.accounting = {
      tile: { initialVolume: asm.initialVolume, brokenVolume: asm.brokenVolume, ratio: round(asm.brokenVolume / asm.initialVolume), parts: asm.parts.size, fraction: round(asm.fraction) },
      pane: { initialBonds: pane.initialBonds, brokenBonds: pane.brokenBonds, ratio: round(pane.brokenBonds / pane.initialBonds) },
      ok: asm.brokenVolume <= asm.initialVolume * 1.0001 && pane.brokenBonds <= pane.initialBonds,
    };
  }

  // ---------------------------------------------------------------- 9. motor hinge is not a door
  {
    const def: AssemblyDef = {
      type: "testFan",
      name: "Ceiling Fan",
      category: "fixture",
      value: 80,
      parts: [boxPart("mount", "steel", "metal_painted" as any, { x: 0.12, y: 0.1, z: 0.12 }, { x: 0, y: 2.4, z: 0 }), boxPart("rotor", "plywood", "plywood", { x: 1.1, y: 0.02, z: 0.12 }, { x: 0, y: 2.3, z: 0 })],
      bonds: [
        { a: "mount", b: "world", kind: "screw", strength: 400 },
        { a: "rotor", b: "mount", kind: "hinge", anchor: { x: 0, y: 2.33, z: 0 }, joint: { axis: { x: 0, y: 1, z: 0 }, pivot: { x: 0, y: 2.33, z: 0 }, group: "rotor#spin", friction: 0.05 } as any },
        { a: "rotor", b: "mount", kind: "hinge", anchor: { x: 0, y: 2.31, z: 0 }, joint: { axis: { x: 0, y: 1, z: 0 }, pivot: { x: 0, y: 2.31, z: 0 }, group: "rotor#spin", friction: 0.05 } as any },
      ],
      features: [{ type: "motor", part: "rotor", joint: "rotor#spin", speed: 8, mains: true }],
    } as AssemblyDef;
    const id = d.spawn(def, { p: { x: -12, y: 0, z: 12 }, q: I });
    ids.push(id);
    sim.step(30);
    const rotor = d.assembly(id)!.byName.get("rotor")!;
    const p = d.world.toWorldVec(rotor.island!, { x: 0.4, y: 2.3, z: 0 });
    const t = d.target(rotor.island!.body!, new Vector3(p.x, p.y, p.z), -1);
    const used = d.use(rotor.island!.body!, new Vector3(p.x, p.y, p.z), new Vector3(p.x, 1.6, p.z + 1));
    out.fan = { usable: t?.usable ?? null, used, ok: !!t && t.usable === null && used === false };
  }

  // ---------------------------------------------------------------- 10. hard-wired light dies with its mount
  const fixture = (x: number): AssemblyDef =>
    ({
      type: "testFixture",
      name: "Ceiling Light",
      category: "fixture",
      value: 40,
      room: "living",
      parts: [boxPart("canopy", "steel", "chrome", { x: 0.12, y: 0.04, z: 0.12 }, { x: 0, y: 2.48, z: 0 }), boxPart("bulb", "glass", "bulb_on", { x: 0.06, y: 0.08, z: 0.06 }, { x: 0, y: 2.42, z: 0 })],
      bonds: [
        { a: "canopy", b: "world", kind: "screw", strength: 60, anchor: { x: 0, y: 2.5, z: 0 } },
        { a: "bulb", b: "canopy", kind: "glue", strength: 30 },
      ],
      features: [{ type: "light", part: "bulb", pos: { x: 0, y: 2.4, z: 0 }, kind: "point", color: 0xffeedd, intensity: 1, range: 6, mains: true }],
    }) as unknown as AssemblyDef;
  {
    const id = d.spawn(fixture(0), { p: { x: 14, y: 0, z: -14 }, q: I });
    ids.push(id);
    const asm = d.assembly(id)!;
    const l0 = sim.scene.lights.length;
    const feats: any[] = [];
    const off = sim.events.on("feature", (e: any) => feats.push(e));
    const canopy = asm.byName.get("canopy")!;
    d.world.breakBond(canopy.bonds.find((b) => b.world)!);
    d.world.flushTopology();
    sim.step(30);
    (off as unknown as (() => void) | undefined)?.();
    out.wiredLight = { lightsBefore: l0, lightsAfter: sim.scene.lights.length, events: feats.map((e) => e.kind), ok: sim.scene.lights.length === l0 - 1 && feats.some((e) => e.kind === "lightBroken") };
  }

  // ---------------------------------------------------------------- 11. shattered bulb is unlit
  {
    const id = d.spawn(fixture(0), { p: { x: 14, y: 0, z: -10 }, q: I });
    ids.push(id);
    const asm = d.assembly(id)!;
    sim.step(2);
    const bulb = asm.byName.get("bulb")!;
    const wp = d.world.toWorldVec(bulb.island!, { x: 0.03, y: 2.42, z: 0 });
    strikeAt(bulb.island!.body!, wp, new Vector3(-1, 0, 0), 0.6, 8, 0.01);
    sim.step(20);
    const frags = [...asm.parts].filter((p) => p.name.startsWith("bulb#"));
    const lit = frags.filter((p) => p.poly.faces.some((f) => f.attr.surf === S.bulb_on)).length;
    out.bulbShards = { bulbAlive: bulb.alive, fragments: frags.length, litFragments: lit, ok: !bulb.alive && frags.length > 0 && lit === 0 };
  }

  // ---------------------------------------------------------------- 12. deferred islands, tiny budget
  {
    const id = d.spawn(paneDef(), { p: { x: -14, y: 1, z: -14 }, q: I });
    ids.push(id);
    const asm = d.assembly(id)!;
    sim.step(2);
    const glass = asm.byName.get("glass")!;
    d.fractureBudgetMs = 0.0005;
    const gp = d.world.toWorldVec(glass.island!, { x: 0.05, y: 0.55, z: -0.002 });
    strikeAt(glass.island!.body!, gp, new Vector3(0, 0, 1), 4, 14, 0.04);
    const after = d.world.pendingWork();
    let steps = 0;
    let maxPending = after.islands;
    while ((d.world.pendingWork().islands > 0 || d.fracture.pending > 0) && steps < 600) {
      sim.step(1);
      steps++;
      maxPending = Math.max(maxPending, d.world.pendingWork().islands);
    }
    d.fractureBudgetMs = 4;
    sim.step(120);
    const orphans = [...asm.parts].filter((p) => !p.island).length;
    const sumParts = [...d.world.islands].reduce((a, i) => a + i.parts.length, 0);
    out.deferred = { pendingAfterStrike: after, maxPending, stepsToDrain: steps, orphans, refineLeft: d.world.pendingWork().refine, partsConsistent: sumParts === d.stats().parts, islands: asm.islands.size, ok: after.islands > 0 && orphans === 0 && sumParts === d.stats().parts && d.world.pendingWork().refine === 0 };
  }

  // ---------------------------------------------------------------- leak check
  for (const id of ids) d.despawn(id);
  d.dispose();
  sim.step(2);
  const fin = sim.counts();
  out.leak = Object.fromEntries(Object.entries(fin).map(([k, v]) => [k, v - (base as Record<string, number>)[k]]).filter(([, v]) => v !== 0));
  out.allOk = Object.values(out).every((v: any) => !v || typeof v !== "object" || !("ok" in v) || v.ok) && Object.keys(out.leak as object).length === 0;
  return out;
}
