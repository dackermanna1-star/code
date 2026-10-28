// Q5: cost of collision callbacks on 1000 resting bodies: events per step and ms per step (CPU timing indicative).
// Bodies are forced ALWAYS_ACTIVE for the steady-state measurement (otherwise they sleep after ~20 steps and
// produce no events at all), plus a "natural" run that lets them sleep.
import { Vector3, Engine, PhysicsActivationControl, type IPhysicsCollisionEvent } from "@babylonjs/core";
import { createWorld, makeGround, makeBox, rn, type World } from "./physics-events-common";
import { ImpactTracker } from "./physics-events-helpers";

type Mode = "off" | "on_no_observer" | "on_plugin_count" | "on_plugin_aggregate" | "on_perbody_obs" | "mask_started_only" | "on_impact_tracker";

async function run(engine: Engine, mode: Mode, awake: boolean, n = 1000) {
  const w: World = await createWorld({ engine });
  makeGround(w, 80);
  const bodies = [];
  const side = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const b = makeBox(w, "b" + i, new Vector3(0.25, 0.25, 0.25), new Vector3((i % side) * 0.5 - side * 0.25, 0.125, Math.floor(i / side) * 0.5 - side * 0.25), 1);
    if (mode === "mask_started_only") b.body.setEventMask(1);
    else if (mode !== "off") b.body.setCollisionCallbackEnabled(true);
    if (awake) w.plugin.setActivationControl(b.body, PhysicsActivationControl.ALWAYS_ACTIVE);
    bodies.push(b);
  }
  let events = 0;
  const agg = new Map<object, number>();
  if (mode === "on_plugin_count" || mode === "mask_started_only" || mode === "off") w.plugin.onCollisionObservable.add(() => { events++; });
  if (mode === "on_plugin_aggregate")
    w.plugin.onCollisionObservable.add((e: IPhysicsCollisionEvent) => {
      events++;
      agg.set(e.collider, (agg.get(e.collider) ?? 0) + e.impulse);
      if (e.impulse > 5) e.point?.clone();
    });
  if (mode === "on_perbody_obs") for (const b of bodies) b.body.getCollisionObservable().add(() => { events++; });
  let tracker: ImpactTracker | null = null;
  if (mode === "on_impact_tracker") {
    tracker = new ImpactTracker(w.scene, w.plugin);
    w.plugin.onCollisionObservable.add(() => { events++; });
  }
  const STEPS = 240;
  const evPerStep: number[] = [];
  const msPerStep: number[] = [];
  for (let i = 0; i < STEPS; i++) {
    events = 0;
    agg.clear();
    const t0 = performance.now();
    w.step();
    msPerStep.push(performance.now() - t0);
    evPerStep.push(events);
  }
  const win = (a: number, b: number) => ({
    avgMs: rn(msPerStep.slice(a, b).reduce((p, c) => p + c, 0) / (b - a), 3),
    avgEvents: rn(evPerStep.slice(a, b).reduce((p, c) => p + c, 0) / (b - a), 1),
  });
  const lastStepWithEvents = evPerStep.reduce((acc, e, i) => (e > 0 ? i : acc), -1);
  tracker?.dispose();
  w.scene.dispose();
  return { mode, awake, first20: win(0, 20), steps40to240: win(40, 240), lastStepWithEvents };
}

export async function probe() {
  const first = await createWorld();
  const engine = first.engine;
  first.scene.dispose();
  const modes: Mode[] = ["off", "on_no_observer", "on_plugin_count", "on_plugin_aggregate", "on_perbody_obs", "mask_started_only", "on_impact_tracker"];
  const rounds: Record<string, number[]> = {};
  const events: Record<string, number> = {};
  for (let r = 0; r < 3; r++) {
    for (const m of modes) {
      const res = await run(engine, m, true);
      (rounds[m] ??= []).push(res.steps40to240.avgMs!);
      events[m] = res.steps40to240.avgEvents!;
    }
  }
  const awakeSummary = modes.map((m) => {
    const v = [...rounds[m]].sort((a, b) => a - b);
    return { mode: m, eventsPerStep: events[m], msPerStepMedian: v[1], msRuns: rounds[m] };
  });
  const natural = [await run(engine, "off", false), await run(engine, "on_plugin_count", false)];
  return { awake1000: awakeSummary, naturalSleep: natural };
}
