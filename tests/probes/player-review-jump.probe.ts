// Reviewer probe: does an ordinary in-place jump (≈1 m apex) on a real tile floor assembly stomp/damage it?
import { Destruction } from "../../src/destruction/destructionSystem.ts";
import { buildFloor } from "../../src/world/structure/floors.ts";
import { FIXED_DT } from "../../src/core/time.ts";
import { PlayerCore } from "../../src/player/playerCore.ts";
import { makeWorld, key } from "./player-util.ts";

export async function probe() {
  const w = await makeWorld();
  const render = w.ctx.render as unknown as Record<string, unknown>;
  render.buildIsland = () => ({ opaque: null, glass: null });
  render.disposeIsland = () => {};
  const destruction = new Destruction(w.ctx as never);
  (w.ctx as { destruction: unknown }).destruction = destruction;
  const counts: Record<string, number> = {};
  for (const ev of ["impact", "fracture", "chip", "crack", "dent", "bondBreak", "split", "damage", "land", "footstep"] as const) {
    counts[ev] = 0;
    w.events.on(ev, () => counts[ev]++);
  }
  const strikes: Array<{ source: string; speed: number; mass: number }> = [];
  const orig = destruction.strike.bind(destruction);
  (destruction as unknown as { strike: typeof orig }).strike = (s) => { strikes.push({ source: s.source, speed: +s.speed.toFixed(2), mass: s.mass }); return orig(s); };
  w.box("slab", [20, 0.2, 20], [6, -0.12, 6]);
  const out: Record<string, unknown> = {};
  const res: Record<string, unknown> = {};
  for (const room of ["bath"] as const) {
    destruction.spawn(buildFloor(room), { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });
  }
  const p = new PlayerCore(w.ctx, null);
  (w.ctx as { player: unknown }).player = p;
  w.input.setEnabled(true);
  w.input.setFallback(true);
  const step = (n: number) => { for (let i = 0; i < n; i++) { w.input.update(); p.fixedUpdate(FIXED_DT); destruction.beforePhysics(FIXED_DT); w.physics.step(FIXED_DT); destruction.afterPhysics(FIXED_DT); w.ctx.time.tick(); destruction.update(FIXED_DT); p.update(FIXED_DT);} };
  for (const [room, x, z] of [["bath", 1.2, 7.0]] as const) {
    p.teleport({ x, y: 1.65, z }, 0, 0);
    step(60);
    for (const k of Object.keys(counts)) counts[k] = 0;
    strikes.length = 0;
    const before = destruction.list().map((a) => a.damage);
    for (let j = 0; j < 3; j++) {
      key("Space", true); step(2); key("Space", false); step(70);
    }
    const after = destruction.list().map((a) => a.damage);
    res[room] = { events: { ...counts }, strikes: strikes.slice(0, 6), nStrikes: strikes.length, dmgBefore: before.map((d) => +d.toFixed(4)), dmgAfter: after.map((d) => +d.toFixed(4)) };
  }
  out.jumps = res;
  return out;
}
