import { test } from "node:test";
import assert from "node:assert/strict";
import { ImpactAggregator, EV_STARTED, EV_CONTINUED, EV_FINISHED, type ImpactSide, type ImpactOut } from "../../src/physics/impacts.ts";

interface Side extends ImpactSide {
  name: string;
}
const side = (serial: number, mass: number, name = "s" + serial): Side => ({ serial, mass, muteUntil: 0, disposed: false, name });

type Ev = { a: Side; b: Side; type: number; impulse: number; contacts?: number; gap?: number; nSign?: number };

/** A box `a` resting on/landing on `b` below it: contacts on a's bottom (y=gap) and b's top (y=0), normal a→b = −Y. */
function feed(agg: ImpactAggregator<Side>, step: number, evs: Ev[]): ImpactOut<Side>[] {
  agg.beginStep(step);
  for (const e of evs) {
    const k = e.contacts ?? 4;
    const s = e.nSign ?? 1;
    for (let i = 0; i < k; i++) {
      const x = (i % 2) - 0.5, z = (i >> 1) - 0.5;
      if (e.type === EV_FINISHED) agg.add(e.a, e.b, EV_FINISHED, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      else if (s > 0) agg.add(e.a, e.b, e.type, x, e.gap ?? 0, z, x, 0, z, 0, -1, 0, e.impulse / k);
      // the same contact reported from B's side: points swapped, normal flipped
      else agg.add(e.b, e.a, e.type, x, 0, z, x, e.gap ?? 0, z, 0, 1, 0, e.impulse / k);
    }
  }
  const out: ImpactOut<Side>[] = [];
  const n = agg.endStep(out);
  return out.slice(0, n).map((o) => ({ ...o }));
}

function run(agg: ImpactAggregator<Side>, seq: Ev[][], start = 0) {
  const emitted: Array<{ step: number; imp: ImpactOut<Side> }> = [];
  seq.forEach((evs, i) => {
    for (const imp of feed(agg, start + i, evs)) emitted.push({ step: start + i, imp });
  });
  return emitted;
}

const near = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b} ± ${tol}, got ${a}`);

test("1 kg box dropped 1 m: speculative STARTED + CONTINUED peak merge into ONE started impact ≈ m·v", () => {
  const floor = side(1, Infinity, "floor"), box = side(2, 1, "box");
  const agg = new ImpactAggregator<Side>();
  const rest = 0.1635;
  const seq: Ev[][] = [
    [{ a: box, b: floor, type: EV_STARTED, impulse: 0.284, gap: 0.07 }],
    [{ a: box, b: floor, type: EV_CONTINUED, impulse: 4.339 }],
    ...Array.from({ length: 10 }, () => [{ a: box, b: floor, type: EV_CONTINUED, impulse: rest }]),
  ];
  const em = run(agg, seq);
  assert.equal(em.length, 1, JSON.stringify(em.map((e) => [e.step, e.imp.impulse])));
  const { step, imp } = em[0];
  assert.equal(step, 3, "emitted once the resting load is steady (2 steps after the main impulse)");
  assert.equal(imp.started, true);
  near(imp.impulse, 0.284 + 4.339 + 2 * rest - 4 * rest, 1e-6);
  near(imp.impulse, 4.43, 0.2, "≈ m·v for a 1 m drop");
  assert.equal(imp.a, floor, "pair ordered by serial");
  // normal points from a (floor) to b (box): +Y
  near(imp.ny, 1, 1e-9);
  near(imp.py, 0, 0.05, "midpoint between the surfaces, impulse-weighted");
  assert.equal(imp.steps, 4);
  assert.equal(imp.contacts, 4);
});

test("2 m drop with the whole impulse on the STARTED step", () => {
  const floor = side(1, Infinity), box = side(2, 1);
  const agg = new ImpactAggregator<Side>();
  const em = run(agg, [[{ a: box, b: floor, type: EV_STARTED, impulse: 6.41 }], [{ a: box, b: floor, type: EV_CONTINUED, impulse: 0.1635 }], [{ a: box, b: floor, type: EV_CONTINUED, impulse: 0.1635 }]]);
  assert.equal(em.length, 1);
  near(em[0].imp.impulse, 6.41 - 0.1635, 1e-6);
  assert.equal(em[0].step, 2);
});

test("restitution bounce: rebound impulse (next step) is merged → ≈ (1+e)·m·v, emitted after separation", () => {
  const floor = side(1, Infinity), ball = side(2, 1);
  const agg = new ImpactAggregator<Side>();
  const em = run(agg, [
    [{ a: ball, b: floor, type: EV_STARTED, impulse: 0.318, contacts: 1 }],
    [{ a: ball, b: floor, type: EV_CONTINUED, impulse: 4.257, contacts: 1 }],
    [{ a: ball, b: floor, type: EV_CONTINUED, impulse: 3.311, contacts: 1 }],
    [{ a: ball, b: floor, type: EV_FINISHED, impulse: 0, contacts: 1 }],
    [],
    [],
  ]);
  assert.equal(em.length, 1);
  assert.equal(em[0].step, 3);
  near(em[0].imp.impulse, 0.318 + 4.257 + 3.311, 1e-6);
  near(em[0].imp.impulse, 1.8 * 4.43, 0.2);
});

test("separation without FINISHED events also closes the episode", () => {
  const floor = side(1, Infinity), ball = side(2, 1);
  const agg = new ImpactAggregator<Side>();
  const em = run(agg, [[{ a: ball, b: floor, type: EV_STARTED, impulse: 2, contacts: 1 }], []]);
  assert.equal(em.length, 1);
  assert.equal(em[0].step, 1);
  near(em[0].imp.impulse, 2, 1e-9);
});

test("heavy box spawned in contact (30 kg) and woken resting pairs produce no impacts", () => {
  const floor = side(1, Infinity), crate = side(2, 30), box = side(3, 1);
  const agg = new ImpactAggregator<Side>();
  const seq: Ev[][] = [[{ a: crate, b: floor, type: EV_STARTED, impulse: 4.905 }]];
  for (let i = 0; i < 30; i++) seq.push([{ a: crate, b: floor, type: EV_CONTINUED, impulse: 4.905 + 0.05 * Math.sin(i) }, { a: box, b: floor, type: EV_CONTINUED, impulse: 0.1635 }]);
  assert.deepEqual(run(agg, seq), []);
});

test("sustained contact: a spike above k×baseline is reported as a non-started impact of the excess", () => {
  const floor = side(1, Infinity), box = side(2, 1);
  const agg = new ImpactAggregator<Side>();
  const seq: Ev[][] = [[{ a: box, b: floor, type: EV_STARTED, impulse: 0.1635 }]];
  for (let i = 0; i < 12; i++) seq.push([{ a: box, b: floor, type: EV_CONTINUED, impulse: 0.1635 }]);
  seq.push([{ a: box, b: floor, type: EV_CONTINUED, impulse: 3.0 }]); // something slammed onto the box
  for (let i = 0; i < 5; i++) seq.push([{ a: box, b: floor, type: EV_CONTINUED, impulse: 0.1635 }]);
  const em = run(agg, seq);
  assert.equal(em.length, 1, JSON.stringify(em.map((e) => [e.step, e.imp.impulse, e.imp.started])));
  assert.equal(em[0].imp.started, false);
  assert.equal(em[0].step, 13);
  near(em[0].imp.impulse, 3.0 - 0.1635, 0.02);
});

test("muted bodies are tracked but not reported; un-muted they report again", () => {
  const floor = side(1, Infinity), box = side(2, 1);
  box.muteUntil = 3;
  const agg = new ImpactAggregator<Side>();
  const drop = (): Ev[][] => [[{ a: box, b: floor, type: EV_STARTED, impulse: 3 }], [{ a: box, b: floor, type: EV_CONTINUED, impulse: 0.16 }], []];
  assert.equal(run(agg, drop(), 0).length, 0); // steps 0..2 (closes on separation at step 2 < muteUntil)
  assert.equal(run(agg, [[]], 3).length, 0);
  assert.equal(run(agg, drop(), 4).length, 1);
});

test("(A,B) and (B,A) reports of the same contact are one pair with a consistent normal", () => {
  const floor = side(1, Infinity), box = side(2, 1);
  const agg = new ImpactAggregator<Side>();
  const em = run(agg, [[{ a: box, b: floor, type: EV_STARTED, impulse: 1.0, contacts: 2 }, { a: box, b: floor, type: EV_STARTED, impulse: 1.0, contacts: 2, nSign: -1 }], []]);
  assert.equal(em.length, 1);
  near(em[0].imp.impulse, 2.0, 1e-9);
  near(em[0].imp.ny, 1, 1e-9);
  assert.equal(agg.size, 1);
});

test("thresholds: minImpulse floor and Δv gate (impulse / lightest dynamic mass)", () => {
  const floor = side(1, Infinity), pebble = side(2, 0.01), crate = side(3, 10), shard = side(4, 0.05);
  const agg = new ImpactAggregator<Side>({ minImpulse: 0.02, minDeltaV: 0.25 });
  // pebble: 0.015 N·s is below the 0.02 floor even though Δv = 1.5 m/s
  assert.equal(run(agg, [[{ a: pebble, b: floor, type: EV_STARTED, impulse: 0.015, contacts: 1 }], []], 0).length, 0);
  // crate: 1 N·s → Δv 0.1 m/s → rejected
  assert.equal(run(agg, [[{ a: crate, b: floor, type: EV_STARTED, impulse: 1 }], []], 10).length, 0);
  // glass shard landing at 3 m/s: 0.15 N·s → reported (audible tinkle)
  assert.equal(run(agg, [[{ a: shard, b: floor, type: EV_STARTED, impulse: 0.15, contacts: 1 }], []], 20).length, 1);
  // dynamic vs dynamic uses the lighter body
  assert.equal(run(agg, [[{ a: shard, b: crate, type: EV_STARTED, impulse: 0.15, contacts: 1 }], []], 30).length, 1);
});

test("heavy-on-light impulse spread over 5 steps becomes one started impact", () => {
  const bottom = side(1, 1), top = side(2, 10);
  const agg = new ImpactAggregator<Side>();
  const steps = [1.55, 20.96, 30.13, 16.49, 2.54];
  const seq: Ev[][] = steps.map((imp, i) => [{ a: top, b: bottom, type: i === 0 ? EV_STARTED : EV_CONTINUED, impulse: imp }]);
  for (let i = 0; i < 5; i++) seq.push([{ a: top, b: bottom, type: EV_CONTINUED, impulse: 1.64 }]);
  const em = run(agg, seq);
  assert.equal(em.length, 1, JSON.stringify(em.map((e) => [e.step, e.imp.impulse])));
  assert.equal(em[0].imp.started, true);
  // the episode ends when the load is steady (1.64, 1.64): 7 steps, resting level 1.64
  near(em[0].imp.impulse, 1.55 + 20.96 + 30.13 + 16.49 + 2.54 + 1.64 + 1.64 - 7 * 1.64, 1e-6);
  near(em[0].imp.peak, 30.13, 1e-9);
});

test("slow approach: zero-impulse speculative contact keeps the episode open until the real bump", () => {
  const wall = side(1, Infinity), box = side(2, 2);
  const agg = new ImpactAggregator<Side>();
  const seq: Ev[][] = [];
  for (let i = 0; i < 5; i++) seq.push([{ a: box, b: wall, type: i === 0 ? EV_STARTED : EV_CONTINUED, impulse: 0, contacts: 4, gap: 0.05 - i * 0.01 }]);
  seq.push([{ a: box, b: wall, type: EV_CONTINUED, impulse: 1.2 }]);
  for (let i = 0; i < 4; i++) seq.push([{ a: box, b: wall, type: EV_CONTINUED, impulse: 0.0 }]);
  const em = run(agg, seq);
  assert.equal(em.length, 1);
  assert.equal(em[0].imp.started, true);
  near(em[0].imp.impulse, 1.2, 1e-6);
});

test("rattle: FINISHED-only step then STARTED again is a new episode", () => {
  const floor = side(1, Infinity), box = side(2, 1);
  const agg = new ImpactAggregator<Side>();
  const em = run(agg, [
    [{ a: box, b: floor, type: EV_STARTED, impulse: 1.0 }],
    [{ a: box, b: floor, type: EV_CONTINUED, impulse: 0.16 }],
    [{ a: box, b: floor, type: EV_FINISHED, impulse: 0 }],
    [{ a: box, b: floor, type: EV_STARTED, impulse: 0.9 }],
    [{ a: box, b: floor, type: EV_CONTINUED, impulse: 0.16 }],
    [{ a: box, b: floor, type: EV_CONTINUED, impulse: 0.16 }],
  ]);
  assert.equal(em.length, 2);
  near(em[0].imp.impulse, 1.16, 1e-6, "separated: nothing subtracted");
  near(em[1].imp.impulse, 0.9 + 0.32 - 3 * 0.16, 1e-6);
  assert.ok(em.every((e) => e.imp.started));
});

test("disposed bodies are skipped and their pairs swept; silent pairs are forgotten and pooled", () => {
  const floor = side(1, Infinity), box = side(2, 1), other = side(3, 1);
  const agg = new ImpactAggregator<Side>({ forgetSteps: 100 });
  run(agg, [[{ a: box, b: floor, type: EV_STARTED, impulse: 2 }, { a: other, b: floor, type: EV_STARTED, impulse: 2 }]], 1);
  box.disposed = true;
  const em = run(agg, [[]], 2); // both separate; only the live pair may report
  assert.equal(em.length, 1, "only the live pair reports");
  assert.equal(em[0].imp.b, other);
  run(agg, [[]], 64); // sweep step
  assert.equal(agg.size, 1, "disposed pair swept");
  run(agg, [[]], 256); // > forgetSteps of silence
  assert.equal(agg.size, 0, "silent pair forgotten");
  // pooled pair objects are reused cleanly
  const b2 = side(5, 1);
  const em2 = run(agg, [[{ a: b2, b: floor, type: EV_STARTED, impulse: 2 }], []], 300);
  assert.equal(em2.length, 1);
  assert.equal(em2[0].imp.b, b2);
});

test("substep events of one step accumulate into that step", () => {
  const floor = side(1, Infinity), box = side(2, 1);
  const agg = new ImpactAggregator<Side>();
  agg.beginStep(0);
  // two substeps: speculative STARTED then the main impulse
  agg.add(box, floor, EV_STARTED, 0, 0.02, 0, 0, 0, 0, 0, -1, 0, 0.2);
  agg.add(box, floor, EV_CONTINUED, 0, 0, 0, 0, 0, 0, 0, -1, 0, 4.2);
  const out: ImpactOut<Side>[] = [];
  assert.equal(agg.endStep(out), 0);
  agg.beginStep(1);
  agg.add(box, floor, EV_CONTINUED, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0.16);
  assert.equal(agg.endStep(out), 0);
  agg.beginStep(2);
  agg.add(box, floor, EV_CONTINUED, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0.16);
  assert.equal(agg.endStep(out), 1);
  near(out[0].impulse, 4.4 + 0.32 - 3 * 0.16, 1e-6);
});

test("garbage in (NaN / negative impulses, self pairs) never produces NaN output", () => {
  const floor = side(1, Infinity), box = side(2, NaN);
  const agg = new ImpactAggregator<Side>();
  agg.beginStep(0);
  agg.add(box, box, EV_STARTED, 0, 0, 0, 0, 0, 0, 0, -1, 0, 5);
  agg.add(box, floor, EV_STARTED, 0, 0, 0, 0, 0, 0, 0, -1, 0, NaN);
  agg.add(box, floor, EV_STARTED, 0, 0, 0, 0, 0, 0, 0, -1, 0, -3);
  agg.add(box, floor, EV_STARTED, 0, 0, 0, 0, 0, 0, 0, -1, 0, 2);
  const out: ImpactOut<Side>[] = [];
  agg.endStep(out);
  agg.beginStep(1);
  const n = agg.endStep(out);
  assert.equal(n, 1);
  for (const k of ["px", "py", "pz", "nx", "ny", "nz", "impulse"] as const) assert.ok(Number.isFinite(out[0][k]), k);
  near(out[0].impulse, 2, 1e-9);
});

test("corner hit: a smaller follow-up impulse before separating is part of the impact, not a resting load", () => {
  const wall = side(1, Infinity), box = side(2, 1.5);
  const agg = new ImpactAggregator<Side>();
  const em = run(agg, [[{ a: box, b: wall, type: EV_STARTED, impulse: 11.041 }], [{ a: box, b: wall, type: EV_CONTINUED, impulse: 2.136 }], [{ a: box, b: wall, type: EV_FINISHED, impulse: 0 }]]);
  assert.equal(em.length, 1);
  near(em[0].imp.impulse, 13.177, 1e-6);
});

test("an impact spread evenly over two steps is not mistaken for a resting load", () => {
  const floor = side(1, Infinity), box = side(2, 1);
  const agg = new ImpactAggregator<Side>();
  const seq: Ev[][] = [[{ a: box, b: floor, type: EV_STARTED, impulse: 10 }], [{ a: box, b: floor, type: EV_CONTINUED, impulse: 10 }]];
  for (let i = 0; i < 4; i++) seq.push([{ a: box, b: floor, type: EV_CONTINUED, impulse: 0.16 }]);
  const em = run(agg, seq);
  assert.equal(em.length, 1);
  near(em[0].imp.impulse, 20 + 0.32 - 4 * 0.16, 1e-6);
});

test("episodes never exceed maxEpisodeSteps (fluctuating tail)", () => {
  const floor = side(1, Infinity), box = side(2, 1);
  const agg = new ImpactAggregator<Side>({ maxEpisodeSteps: 5 });
  const seq: Ev[][] = [[{ a: box, b: floor, type: EV_STARTED, impulse: 5 }]];
  const tail = [2, 0.5, 1.5, 0.4, 1.2, 0.3, 1.1];
  for (const t of tail) seq.push([{ a: box, b: floor, type: EV_CONTINUED, impulse: t }]);
  const em = run(agg, seq);
  assert.ok(em.length >= 1);
  assert.equal(em[0].step, 4);
  assert.equal(em[0].imp.steps, 5);
  near(em[0].imp.impulse, 5 + 2 + 0.5 + 1.5 + 0.4 - 5 * 0.4, 1e-6);
});
