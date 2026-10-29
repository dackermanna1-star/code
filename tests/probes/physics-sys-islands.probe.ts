// Havok island facts behind the sleep assist (simulation perf work, docs/perf/profile.md "simulation optimizations"):
//  I1  do two bodies that touched once stay in one island after they separated? (sleep A only while B is awake far
//      away: does Havok re-wake A? Then sleep both, wake B: does A wake too?)
//  I2  the same for bodies that never touched but rest close to each other (gap scan 3–20 cm)
//  I3  control: two bodies that never came close.
import { Vector3, type PhysicsBody } from "@babylonjs/core";
import { makeWorld, floor, steps, dynBox, r, type World } from "./physics-sys-util.ts";

function asleep(w: World, b: PhysicsBody): boolean {
  return !w.physics.isAwake(b);
}

/** A rests at x = 0; B starts at x = gap + 0.2 (boxes 0.2 m) and slides away to x ≈ 3 m, then both rest. */
async function scenario(gap: number, slide: boolean): Promise<Record<string, unknown>> {
  const w = await makeWorld({ sleepAssist: false });
  floor(w, 0, 40);
  const a = dynBox(w, new Vector3(0, 0.1, 0), new Vector3(0.2, 0.2, 0.2), 500);
  const b = dynBox(w, new Vector3(0.2 + gap, 0.1, 0), new Vector3(0.2, 0.2, 0.2), 500);
  steps(w, 30);
  if (slide) {
    b.setLinearVelocity(new Vector3(6, 0, 0));
    steps(w, 120);
  }
  const bx = b.transformNode.position.x;
  // keep B awake (moving slowly) and put A to sleep: does Havok re-wake A?
  b.setLinearVelocity(new Vector3(0.3, 0, 0));
  w.physics.sleep(a);
  steps(w, 2);
  const aRewokenWhileBAwake = !asleep(w, a);
  // both asleep, then wake B only
  w.physics.sleep(a);
  w.physics.sleep(b);
  steps(w, 2);
  const bothAsleep = asleep(w, a) && asleep(w, b);
  w.physics.wake(b);
  steps(w, 1);
  const aWokeWithB = !asleep(w, a);
  // after a long common sleep (Havok may split islands while deactivated), once more
  w.physics.sleep(a);
  w.physics.sleep(b);
  steps(w, 120);
  w.physics.wake(b);
  steps(w, 1);
  const aWokeWithBLater = !asleep(w, a);
  w.dispose();
  return { gap, slide, bDistance: r(bx, 2), aRewokenWhileBAwake, bothAsleep, aWokeWithB, aWokeWithBLater };
}

export async function probe() {
  const near: Record<string, unknown> = {};
  for (const g of [0.03, 0.05, 0.07, 0.09, 0.11, 0.13, 0.15, 0.2]) {
    const s = await scenario(g, false);
    near[`gap${Math.round(g * 100)}cm`] = s.aRewokenWhileBAwake ? "linked" : "separate";
  }
  return {
    I1_touchedThenSeparated: await scenario(0, true),
    I2_nearGaps: near,
    I3_far3m: await scenario(3, false),
  };
}
