// Sleep assist vs moving bodies on piles (review round 2):
//  S0  Havok fact: touching one body of a force-slept 36-plank pile (1–2 mm gaps) wakes all of them in one step —
//      islands wake as a whole, so a moving member cannot stay awake alone on a slept pile.
//  S1  a 10 cm ball rolling across 36 settled 30×5×30 cm planks (> SLEEP_BIG_COMPONENT) at 0.25 / 0.15 m/s must never
//      be frozen while moving (asleep right after a step at > 0.1 m/s), must stop where it stops without sleep assist
//      (it rolls over 1 mm plank gaps, losing speed at each), and the pile + ball must be asleep again ~1.5 s after the ball stops.
import { Vector3, type PhysicsBody } from "@babylonjs/core";
import { makeWorld, body, floor, steps, dynBox, r, check, type World } from "./physics-sys-util.ts";

const ZERO = { x: 0, y: 0, z: 0 };
const BALL_R = 0.05;

async function planks(assist: boolean): Promise<{ w: World; pl: PhysicsBody[] }> {
  const w = await makeWorld({ sleepAssist: assist });
  floor(w, 0, 20);
  const pl: PhysicsBody[] = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) pl.push(dynBox(w, new Vector3(-0.7525 + i * 0.301, 0.025, -0.7525 + j * 0.301), new Vector3(0.3, 0.05, 0.3), 600));
  steps(w, 150);
  return { w, pl };
}

function ball(w: World, x: number, y: number, v: number): PhysicsBody {
  const b = body(w, "ball", new Vector3(x, y + BALL_R, 0.0), "dynamic", w.physics.sphereShape(ZERO, BALL_R, { density: 1100, friction: 0.6 }));
  b.setLinearVelocity(new Vector3(v, 0, 0));
  b.setAngularVelocity(new Vector3(0, 0, -v / BALL_R)); // rolling without slip
  return b;
}

async function roll(onPile: boolean, v: number, assist = true) {
  let w: World, pl: PhysicsBody[] = [];
  let asleepBefore = -1;
  if (onPile) {
    ({ w, pl } = await planks(assist));
    asleepBefore = pl.filter((p) => !w.physics.isAwake(p)).length;
  } else {
    w = await makeWorld({ sleepAssist: assist });
    floor(w, 0, 20);
  }
  const b = ball(w, -0.75, onPile ? 0.05 : 0, v);
  let prevSpeed = v, frozen = 0, frozenAtSpeed = 0, stopStep = -1;
  const trace: string[] = [];
  const tmp = new Vector3();
  for (let k = 0; k < 360; k++) {
    w.physics.step(1 / 60);
    const sp = w.physics.preStepVelocity(b, tmp).length();
    const awake = w.physics.isAwake(b);
    if (!awake && prevSpeed > 0.1) {
      frozen++;
      frozenAtSpeed = Math.max(frozenAtSpeed, prevSpeed);
    }
    if (stopStep < 0 && (sp < 0.02 || !awake)) stopStep = k;
    if (k % 30 === 29) trace.push(`${k + 1}: x=${r(b.transformNode.position.x, 3)} v=${r(sp, 3)}${awake ? "" : " asleep"}`);
    prevSpeed = awake ? sp : 0;
  }
  const res = {
    asleepBefore,
    endX: r(b.transformNode.position.x, 3),
    stopStep,
    frozen,
    frozenAtSpeed: r(frozenAtSpeed, 3),
    ballAwakeAtEnd: w.physics.isAwake(b),
    planksAwakeAtEnd: pl.filter((p) => w.physics.isAwake(p)).length,
    trace,
  };
  w.dispose();
  return res;
}

export async function probe() {
  const out: Record<string, unknown> = {};
  // ---- S0: island wake (assist off: nothing re-sleeps behind our back)
  {
    const { w, pl } = await planks(false);
    for (const p of pl) w.physics.sleep(p);
    steps(w, 2);
    const before = pl.filter((p) => w.physics.isAwake(p)).length;
    ball(w, -0.75, 0.05, 0);
    steps(w, 1);
    const after = pl.filter((p) => w.physics.isAwake(p)).length;
    out.S0_islandWake = { awakeBefore: before, awakeOneStepAfterTouchingOne: after };
    w.dispose();
  }
  for (const v of [0.25, 0.15]) {
    const pile = await roll(true, v);
    const ref = await roll(true, v, false); // same scene without sleep assist: where the ball really stops
    const ctrl = await roll(false, v);
    out[`S1_pile_v${v}`] = pile;
    out[`S1_pileNoAssist_v${v}`] = { endX: ref.endX, stopStep: ref.stopStep };
    out[`S1_floor_v${v}`] = { endX: ctrl.endX, frozen: ctrl.frozen, awakeAtEnd: ctrl.ballAwakeAtEnd };
    check(out, `S1_ballNotFrozen_v${v}`, pile.asleepBefore === 36 && pile.frozen === 0 && ctrl.frozen === 0 && Math.abs(pile.endX - ref.endX) < 0.03, { endX: pile.endX, endXNoAssist: ref.endX, frozen: pile.frozen, frozenAtSpeed: pile.frozenAtSpeed });
    // the pile and the ball sleep again within ~1.5 s of the ball stopping
    check(out, `S1_pileSleepsAfterBallStops_v${v}`, !pile.ballAwakeAtEnd && pile.planksAwakeAtEnd === 0 && ref.stopStep >= 0 && ref.stopStep < 270, { stopStep: pile.stopStep, planksAwake: pile.planksAwakeAtEnd, ballAwake: pile.ballAwakeAtEnd });
  }
  return out;
}
