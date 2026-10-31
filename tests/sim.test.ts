import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHeadless, createSimulation } from '../src/game/battle';
import { createBattle } from '../src/sim/generator';
import { Rng } from '../src/core/rng';
import { C } from '../src/sim/constants';

const seeds = (n: number, s: number) => {
  const r = new Rng(s);
  return Array.from({ length: n }, () => r.nextU32());
};

test('battles are deterministic for a given seed', () => {
  for (const seed of seeds(12, 1)) {
    const a = runHeadless(seed);
    const b = runHeadless(seed);
    assert.equal(a.winner, b.winner);
    assert.equal(a.ticks, b.ticks);
    assert.equal(a.method, b.method);
    assert.deepEqual(a.stats, b.stats);
  }
});

test('every battle ends with exactly one winner and one loser', () => {
  for (const seed of seeds(250, 2)) {
    const r = runHeadless(seed);
    assert.equal(r.timedOut, false, `seed ${seed} did not finish`);
    assert.ok(r.winner === 0 || r.winner === 1);
    assert.ok(r.hpLeft > 0, `winner must be alive (seed ${seed})`);
  }
});

test('simultaneous knockouts never produce a draw (final clash decides)', () => {
  for (const seed of seeds(25, 3)) {
    const { sim } = createSimulation(createBattle(seed), { headless: true });
    for (let i = 0; i < 300 && !sim.over; i++) sim.step();
    if (sim.decided) continue;
    sim.fighters[0].hp = 0;
    sim.fighters[1].hp = 0;
    sim.step();
    assert.ok(sim.sequences.some((s) => s.kind === 'finalClash'), 'final clash should start');
    let guard = 0;
    while (!sim.over && guard++ < 60 * 30) sim.step();
    assert.ok(sim.over, 'final clash must resolve');
    assert.ok(sim.winner === 0 || sim.winner === 1);
    assert.equal(sim.fighters[sim.winner === 0 ? 1 : 0].hp, 0);
  }
});

test('the time limit forces a decisive ending', () => {
  for (const seed of seeds(10, 4)) {
    const { sim } = createSimulation(createBattle(seed), { headless: true });
    sim.step();
    // Jump to the final second of the time limit.
    sim.tick = C.T_FINAL * 60 - 2;
    sim.fighters[0].hp = Math.max(sim.fighters[0].hp, 500);
    sim.fighters[1].hp = Math.max(sim.fighters[1].hp, 500);
    let guard = 0;
    while (!sim.over && guard++ < 60 * 40) sim.step();
    assert.ok(sim.over);
    assert.ok(sim.winner === 0 || sim.winner === 1);
  }
});

test('no starting-side or index bias (statistical, fixed seeds)', () => {
  const n = 1200;
  let left = 0, zero = 0;
  for (const seed of seeds(n, 5)) {
    const r = runHeadless(seed);
    if (r.startSide[r.winner] === -1) left++;
    if (r.winner === 0) zero++;
  }
  // 99.9% interval for a fair coin with n=1200 is about ±4.7%.
  assert.ok(Math.abs(left / n - 0.5) < 0.047, `left-side win rate ${(left / n).toFixed(3)}`);
  assert.ok(Math.abs(zero / n - 0.5) < 0.047, `fighter-0 win rate ${(zero / n).toFixed(3)}`);
});

test('fighter generation is exchangeable (same distribution for both slots)', () => {
  const n = 3000;
  const count: [Record<string, number>, Record<string, number>] = [{}, {}];
  for (const seed of seeds(n, 6)) {
    const b = createBattle(seed);
    for (const i of [0, 1] as const) count[i][b.fighters[i].weapon] = (count[i][b.fighters[i].weapon] ?? 0) + 1;
  }
  for (const k of Object.keys(count[0])) {
    const d = Math.abs((count[0][k] ?? 0) - (count[1][k] ?? 0)) / n;
    assert.ok(d < 0.035, `weapon ${k} frequency differs between slots by ${d}`);
  }
});
