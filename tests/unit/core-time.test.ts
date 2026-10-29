// Fixed-step clock: accumulator, hit-stop and the spiral-of-death step cap (src/core/time.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIXED_DT, MAX_STEPS_PER_FRAME, STEP_BUDGET_MS, Time } from "../../src/core/time.ts";

/** A Time whose step-cost clock advances `stepMs` per executed step (manual clock). */
function clocked(stepMs: number): { t: Time; frame: (dt: number) => number; setStep: (ms: number) => void } {
  const t = new Time();
  let now = 0;
  let cost = stepMs;
  t.now = () => now;
  return {
    t,
    setStep: (ms) => (cost = ms),
    frame: (dt) => {
      const n = t.beginFrame(dt);
      for (let i = 0; i < n; i++) {
        now += cost;
        t.tick();
      }
      return n;
    },
  };
}

test("accumulator: one step per 60 Hz frame, catch-up up to the cap, then time is dropped", () => {
  const { t, frame } = clocked(1);
  assert.equal(frame(FIXED_DT), 1);
  assert.equal(frame(FIXED_DT * 2.5), 2);
  assert.equal(frame(FIXED_DT * 0.6), 1); // 0.5 + 0.6 carried
  assert.equal(frame(0.25), MAX_STEPS_PER_FRAME); // 15 steps owed: capped, the rest dropped
  assert.equal(frame(FIXED_DT * 0.5), 0);
  assert.equal(t.step, 1 + 2 + 1 + MAX_STEPS_PER_FRAME);
});

test("cheap steps keep the full cap", () => {
  const { t, frame } = clocked(STEP_BUDGET_MS / MAX_STEPS_PER_FRAME - 0.5);
  for (let i = 0; i < 20; i++) frame(FIXED_DT);
  assert.equal(frame(0.25), MAX_STEPS_PER_FRAME);
  assert.equal(t.maxSteps, MAX_STEPS_PER_FRAME);
});

test("expensive steps lower the per-frame cap (no spiral), and it recovers when steps get cheap", () => {
  const { t, frame, setStep } = clocked(100);
  frame(FIXED_DT);
  assert.ok(t.stepCostMs >= 99);
  // a 100 ms step makes the next frame owe ~6 steps: only one runs
  assert.equal(frame(0.1), 1);
  assert.equal(t.maxSteps, 1);
  setStep(9); // 20 ms budget / 9 ms → 2 steps
  for (let i = 0; i < 30; i++) frame(FIXED_DT);
  assert.equal(frame(0.25), 2);
  setStep(1);
  for (let i = 0; i < 30; i++) frame(FIXED_DT);
  assert.equal(frame(0.25), MAX_STEPS_PER_FRAME);
});

test("ticks outside beginFrame (stepSync, tests) do not feed the step cost", () => {
  const t = new Time();
  let now = 0;
  t.now = () => now;
  for (let i = 0; i < 10; i++) {
    now += 500;
    t.tick();
  }
  assert.equal(t.stepCostMs, 0);
  assert.equal(t.beginFrame(0.25), MAX_STEPS_PER_FRAME);
});

test("paused clock runs no steps; hit-stop slows the accumulator", () => {
  const t = new Time();
  t.scale = 0;
  assert.equal(t.beginFrame(0.1), 0);
  t.scale = 1;
  t.hitStop(0.1, 0.1);
  let steps = 0;
  for (let i = 0; i < 6; i++) steps += t.beginFrame(FIXED_DT);
  assert.ok(steps <= 1, `hit-stop should hold the clock back (ran ${steps} steps)`);
});
