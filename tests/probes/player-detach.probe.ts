// Detach: grab the chair by a front leg, then break every bond of that leg (as a kick or pull
// would). The hand must follow the leg to its new body instead of steering the rest of the chair.
// Also: jointed throw refusal, edges consumed while holding, and the footstep debris support rule.
import { FIXED_DT } from "../../src/core/time.ts";
import { Destruction } from "../../src/destruction/destructionSystem.ts";
import { buildObject } from "../../src/objects/registry.ts";
import { PlayerCore } from "../../src/player/playerCore.ts";
import { makeWorld, r2 } from "./player-util.ts";

export async function probe() {
  const w = await makeWorld();
  const render = w.ctx.render as unknown as Record<string, unknown>;
  render.buildIsland = () => ({ opaque: null, glass: null });
  render.disposeIsland = () => {};
  const destruction = new Destruction(w.ctx as never);
  (w.ctx as { destruction: unknown }).destruction = destruction;
  w.box("floor", [14, 0.2, 14], [0, -0.1, 0]);
  const I = { x: 0, y: 0, z: 0, w: 1 };
  const chairId = destruction.spawn(buildObject("chair"), { p: { x: 0, y: 0, z: 1.0 }, q: I });
  const p = new PlayerCore(w.ctx, null);
  (w.ctx as { player: unknown }).player = p;
  w.input.setEnabled(true);
  w.input.setFallback(true);
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      w.input.update();
      p.fixedUpdate(FIXED_DT);
      destruction.beforePhysics(FIXED_DT);
      w.physics.step(FIXED_DT);
      destruction.afterPhysics(FIXED_DT);
      w.ctx.time.tick();
      destruction.update(FIXED_DT);
    }
  };
  step(30);
  const out: Record<string, unknown> = {};
  const world = destruction.world;
  const asm = world.assemblies.get(chairId)!;
  const leg = [...asm.parts].find((q) => q.name === "leg_fl")!;
  // aim at the front-left leg, 15 cm above the floor
  const lb = leg.island!;
  const legWorld = world.toWorldVec(lb, { x: (leg.bounds.min.x + leg.bounds.max.x) / 2, y: 0.15, z: (leg.bounds.min.z + leg.bounds.max.z) / 2 });
  const eye = { x: legWorld.x, y: 1.0, z: legWorld.z - 0.8 };
  const pitch = Math.atan2(eye.y - legWorld.y, legWorld.z - eye.z);
  p.teleport({ x: eye.x, y: 1.65, z: eye.z }, 0, pitch);
  // crouch so the leg is within reach and the ray is not blocked by the seat
  w.input.hold("crouch", 3);
  step(30);
  out.target = p.target ? { part: p.target.partName, asm: p.target.assemblyName } : null;
  p.debugAction("grab");
  const chairBody = p.holding;
  out.grabbed = chairBody !== null;
  step(10);
  // rip the leg off: break all of its bonds (topology is flushed in the destruction step)
  for (const b of leg.bonds.slice()) world.breakBond(b);
  step(3);
  const heldAfter = p.holding;
  const legBody = leg.island?.body ?? null;
  out.afterBreak = {
    stillHolding: heldAfter !== null,
    holdingLeg: heldAfter !== null && heldAfter === legBody,
    holdingRestOfChair: heldAfter !== null && heldAfter === chairBody,
    legSeparate: legBody !== chairBody,
    chairIslands: destruction.list().find((a) => a.id === chairId)?.islands ?? null,
  };
  // the leg comes with the hand: look up, it rises
  const y0 = legBody ? legBody.transformNode.position.y : 0;
  w.input.addLook(0, -250);
  step(40);
  out.legLifted = legBody ? r2(legBody.transformNode.position.y - y0) : null;
  // stale edges: press use + alt while holding, then drop: no use / pry after the drop
  let uses = 0;
  const origUse = destruction.use.bind(destruction);
  (destruction as unknown as { use: typeof origUse }).use = (...a) => {
    uses++;
    return origUse(...a);
  };
  w.input.tap("use");
  step(1);
  p.debugAction("grab"); // drop
  step(5);
  out.staleUseAfterDrop = uses;
  out.nan = [p.position.x, p.position.y, p.position.z].some((x) => !Number.isFinite(x));
  return out;
}
