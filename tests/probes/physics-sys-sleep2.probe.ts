// Sleep assist round 3 (idle apartment never slept — tests/idle.mjs):
//  J1  jointed bodies sleep: a door on a two-pivot hinge held by a latch position motor at its target and a drawer on
//      a slider are asleep ~1 s after creation; a push wakes the door, it swings and sleeps again once at rest.
//  J2  grouping by world AABBs: a 2.4 m rug with a box on it sleeps while a kept-awake body stands 0.6 m beside the
//      rug (inside the rug's 1.5 m bounding SPHERE, which used to chain them into one never-sleeping group).
//  J3  support loss wakes sleepers (Havok does not): boxes asleep on a dynamic plank / a static shelf / one child of a
//      static container fall when the plank or shelf is disposed or the child removed.
//  J4  wake echoes are not impacts: waking a sleeping stack reports no impact; a ball dropped on a sleeping box does.
//  J5  a negligible impulse leaves a sleeping body asleep; a real one wakes and moves it.
import { Vector3, type PhysicsBody } from "@babylonjs/core";
import { makeWorld, body, floor, steps, dynBox, staticBox, r, check, type World } from "./physics-sys-util.ts";
import type { RawImpact } from "../../src/core/context.ts";

const ZERO = { x: 0, y: 0, z: 0 };
const IQ = { x: 0, y: 0, z: 0, w: 1 };
const y = (b: PhysicsBody): number => b.transformNode.position.y;

export async function probe() {
  const out: Record<string, unknown> = {};

  // ---- J1 jointed bodies
  {
    const w = await makeWorld();
    floor(w, 0, 20);
    const frame = staticBox(w, new Vector3(0, 1.0, 0), new Vector3(0.05, 2, 0.05));
    const door = dynBox(w, new Vector3(0.48, 1.0, 0), new Vector3(0.9, 1.98, 0.04), 500);
    const c = w.physics.hinge(frame, door, {
      pivotA: new Vector3(0.03, 0, 0),
      pivotB: new Vector3(-0.45, 0, 0),
      axisA: new Vector3(0, 1, 0),
      axisB: new Vector3(0, 1, 0),
      min: -1.6,
      max: 1.6,
      motor: { target: 0, maxForce: 300 },
    });
    const cab = staticBox(w, new Vector3(2, 0.4, 0), new Vector3(0.6, 0.8, 0.6));
    const drawer = dynBox(w, new Vector3(2, 0.6, -0.35), new Vector3(0.5, 0.15, 0.1), 600);
    w.physics.slider(cab, drawer, { pivotA: new Vector3(0, 0.2, -0.35), pivotB: Vector3.Zero(), axisA: new Vector3(0, 0, 1), axisB: new Vector3(0, 0, 1), min: -0.4, max: 0 });
    let doorAsleepAt = -1, drawerAsleepAt = -1;
    for (let k = 0; k < 180; k++) {
      steps(w, 1);
      if (doorAsleepAt < 0 && !w.physics.isAwake(door)) doorAsleepAt = k;
      if (drawerAsleepAt < 0 && !w.physics.isAwake(drawer)) drawerAsleepAt = k;
    }
    check(out, "J1_jointedSleep", doorAsleepAt >= 0 && doorAsleepAt < 90 && drawerAsleepAt >= 0 && drawerAsleepAt < 90, { doorAsleepAt, drawerAsleepAt });
    // release the latch and push: it swings, then comes to rest and sleeps again
    w.physics.setHingeMotor(c, 0, 0);
    door.applyImpulse(new Vector3(0, 0, 12), new Vector3(0.9, 1.0, 0));
    steps(w, 30);
    const swung = Math.abs(w.physics.hingeAngle(c));
    let resleptAt = -1;
    for (let k = 0; k < 900 && resleptAt < 0; k++) {
      steps(w, 1);
      if (!w.physics.isAwake(door)) resleptAt = k;
    }
    check(out, "J1_doorSwingsAndResleeps", swung > 0.2 && resleptAt >= 0, { swung: r(swung, 3), resleptAt, angle: r(w.physics.hingeAngle(c), 3) });
    w.dispose();
  }

  // ---- J2 AABB grouping
  {
    const w = await makeWorld();
    floor(w, 0, 20);
    const rug = dynBox(w, new Vector3(0, 0.005, 0), new Vector3(2.4, 0.01, 1.7), 200);
    const onRug = dynBox(w, new Vector3(0.5, 0.21, 0), new Vector3(0.4, 0.4, 0.4), 300);
    const restless = dynBox(w, new Vector3(1.85, 0.2, 0), new Vector3(0.4, 0.4, 0.4), 300); // 0.45 m off the rug edge
    w.physics.setKeepAwake(restless, true);
    steps(w, 120);
    check(out, "J2_rugSleepsBesideAwakeBody", !w.physics.isAwake(rug) && !w.physics.isAwake(onRug) && w.physics.isAwake(restless), {
      rug: w.physics.isAwake(rug),
      onRug: w.physics.isAwake(onRug),
      restless: w.physics.isAwake(restless),
    });
    w.dispose();
  }

  // ---- J3 support loss
  {
    const w = await makeWorld();
    floor(w, 0, 20);
    const plank = dynBox(w, new Vector3(0, 0.55, 0), new Vector3(1.2, 0.05, 0.4), 600);
    const legs = [-0.5, 0.5].map((x) => staticBox(w, new Vector3(x, 0.26, 0), new Vector3(0.05, 0.52, 0.3)));
    const onPlank = dynBox(w, new Vector3(0, 0.676, 0), new Vector3(0.2, 0.2, 0.2), 300);
    const shelf = staticBox(w, new Vector3(3, 1.0, 0), new Vector3(0.8, 0.03, 0.3));
    const onShelf = dynBox(w, new Vector3(3, 1.116, 0), new Vector3(0.2, 0.2, 0.2), 300);
    // static container: two slabs side by side, a box on the second
    const s1 = w.physics.boxShape({ x: -0.3, y: 0, z: 0 }, IQ, { x: 0.6, y: 0.03, z: 0.3 });
    const s2 = w.physics.boxShape({ x: 0.3, y: 0, z: 0 }, IQ, { x: 0.6, y: 0.03, z: 0.3 });
    const cont = body(w, "shelf2", new Vector3(-3, 1.0, 0), "static", w.physics.containerShape([s1, s2]));
    const onChild = dynBox(w, new Vector3(-2.7, 1.116, 0), new Vector3(0.2, 0.2, 0.2), 300);
    steps(w, 150);
    const asleep = [onPlank, onShelf, onChild].map((b) => !w.physics.isAwake(b));
    const y0 = [y(onPlank), y(onShelf), y(onChild)];
    w.physics.disposeBody(plank);
    w.physics.disposeBody(shelf);
    w.physics.removeChildren(cont, [1]);
    steps(w, 60);
    const drops = [y(onPlank), y(onShelf), y(onChild)].map((v, i) => r(y0[i] - v, 3));
    check(out, "J3_supportLossWakes", asleep.every(Boolean) && drops.every((d) => d > 0.3), { asleepBefore: asleep, drops, legs: legs.length, woken: w.physics.debugStats().wokenBySupportLoss });
    w.dispose();
  }

  // ---- J4 wake echoes vs real hits
  {
    const w = await makeWorld();
    floor(w, 0, 20);
    const rug = dynBox(w, new Vector3(0, 0.005, 0), new Vector3(2.4, 0.01, 1.7), 200);
    const table = dynBox(w, new Vector3(0.3, 0.235, 0), new Vector3(1.0, 0.45, 0.6), 60);
    const box = dynBox(w, new Vector3(3, 0.15, 0), new Vector3(0.3, 0.3, 0.3), 400);
    steps(w, 150);
    const asleep = !w.physics.isAwake(rug) && !w.physics.isAwake(table) && !w.physics.isAwake(box);
    const seen: RawImpact[] = [];
    const off = w.physics.onImpact((e) => seen.push(e));
    let echoes = 0;
    for (let k = 0; k < 5; k++) {
      w.physics.wake(rug);
      steps(w, 40);
      echoes += seen.length;
      seen.length = 0;
    }
    // a real hit on the sleeping box
    const ball = body(w, "ball", new Vector3(3, 1.0, 0), "dynamic", w.physics.sphereShape(ZERO, 0.05, { density: 1000 }));
    steps(w, 40);
    const hits = seen.filter((e) => e.bodyA === ball || e.bodyB === ball).length;
    off();
    check(out, "J4_wakeEchoesAreNotImpacts", asleep && echoes === 0 && hits > 0, { asleep, echoes, hits });
    w.dispose();
  }

  // ---- J5 negligible impulses
  {
    const w: World = await makeWorld();
    floor(w, 0, 20);
    const b = dynBox(w, new Vector3(0, 0.1, 0), new Vector3(0.2, 0.2, 0.2), 500);
    steps(w, 90);
    const asleep0 = !w.physics.isAwake(b);
    b.applyImpulse(new Vector3(0.004, 0, 0), new Vector3(0, 0.1, 0)); // 4 kg: Δv 1 mm/s
    steps(w, 1);
    const asleepAfterTiny = !w.physics.isAwake(b);
    const x0 = b.transformNode.position.x;
    b.applyImpulse(new Vector3(4, 0, 0), new Vector3(0, 0.1, 0)); // Δv 1 m/s
    steps(w, 20);
    check(out, "J5_negligibleImpulseIgnored", asleep0 && asleepAfterTiny && b.transformNode.position.x - x0 > 0.05, { asleep0, asleepAfterTiny, moved: r(b.transformNode.position.x - x0, 3) });
    w.dispose();
  }
  return out;
}
