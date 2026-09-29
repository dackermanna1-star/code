import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sideAccuracy, scoreGrill, scoreBuild, scoreWait, combine, computeTip, lcs, placementAccuracy } from '../src/game/Scoring';
import { DONENESS } from '../src/food/Ingredients';

test('side accuracy peaks at target and zeroes when burnt', () => {
  const t = DONENESS.medium.target;
  assert.equal(sideAccuracy(t, t), 1);
  assert.ok(sideAccuracy(t + 0.1, t) < 1 && sideAccuracy(t + 0.1, t) > 0.6);
  assert.equal(sideAccuracy(1.05, t), 0);
  assert.equal(sideAccuracy(0, t), 0);
});

test('lcs', () => {
  assert.equal(lcs(['a', 'b', 'c'], ['a', 'c']), 2);
  assert.equal(lcs([], ['a']), 0);
  assert.equal(lcs(['x', 'y'], ['y', 'x']), 1);
});

test('grill score rewards matching doneness', () => {
  const order = [{ id: 'patty_beef' as const, doneness: 'medium' as const }];
  const perfect = scoreGrill(order, [{ id: 'patty_beef', dx: 0, dz: 0, cook: { top: 0.6, bottom: 0.6 } }]);
  assert.equal(perfect.score, 100);
  const raw = scoreGrill(order, [{ id: 'patty_beef', dx: 0, dz: 0, cook: { top: 0.1, bottom: 0.6 } }]);
  assert.ok(raw.score < 60, `raw side should be punished: ${raw.score}`);
  const missing = scoreGrill(order, []);
  assert.equal(missing.score, 0);
});

test('build score: perfect, missing and sloppy', () => {
  const order = [{ id: 'patty_beef' as const, doneness: 'medium' as const }, { id: 'lettuce' as const }, { id: 'ketchup' as const }];
  const layers = order.map((l) => ({ id: l.id, dx: 0, dz: 0 }));
  const good = scoreBuild('bun_sesame', order, { bun: 'bun_sesame', bottom: { dx: 0, dz: 0 }, top: { dx: 0, dz: 0, bun: 'bun_sesame' }, layers });
  assert.equal(good.score, 100);
  const miss = scoreBuild('bun_sesame', order, { bun: 'bun_sesame', bottom: { dx: 0, dz: 0 }, top: { dx: 0, dz: 0, bun: 'bun_sesame' }, layers: layers.slice(0, 2) });
  assert.ok(miss.score < good.score && miss.notes.some((n) => n.includes('ketchup')));
  const sloppy = scoreBuild('bun_sesame', order, { bun: 'bun_sesame', bottom: { dx: 0.03, dz: 0 }, top: { dx: 0, dz: 0.04, bun: 'bun_sesame' }, layers: layers.map((l) => ({ ...l, dx: 0.03 })) });
  assert.ok(sloppy.score < 85);
  assert.ok(placementAccuracy(0, 0) === 1 && placementAccuracy(0.1, 0) === 0);
});

test('wait score decays after grace', () => {
  assert.equal(scoreWait(10, 1).score, 100);
  assert.ok(scoreWait(150, 1).score < 60);
  assert.ok(scoreWait(150, 1.5).score > scoreWait(150, 1).score);
});

test('combine + tips', () => {
  const r = combine({ score: 100, notes: [] }, { score: 100, notes: [] }, { score: 100, notes: [] });
  assert.equal(r.total, 100);
  assert.equal(r.stars, 5);
  const bad = combine({ score: 20, notes: [] }, { score: 30, notes: [] }, { score: 40, notes: [] }, 1.4);
  assert.ok(bad.total < 30 && bad.stars === 1);
  assert.ok(computeTip(100, 5, 1, 1) > computeTip(60, 5, 1, 1));
});
