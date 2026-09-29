import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateOrder, available } from '../src/game/Order';
import { ROSTER } from '../src/characters/Roster';
import { INGREDIENTS, isPatty } from '../src/food/Ingredients';

test('orders only use unlocked ingredients and are deterministic', () => {
  for (const rank of [1, 3, 6, 10, 15, 20]) {
    for (const c of ROSTER) {
      const a = generateOrder(c, { rank, day: 1 });
      const b = generateOrder(c, { rank, day: 1 });
      assert.deepEqual(a, b);
      assert.ok(INGREDIENTS[a.bun].unlockRank <= rank);
      for (const l of a.layers) assert.ok(INGREDIENTS[l.id].unlockRank <= rank, `${l.id} locked at rank ${rank}`);
      assert.ok(a.layers.some((l) => isPatty(l.id)), 'has a patty');
      for (const l of a.layers) if (isPatty(l.id)) assert.ok(l.doneness);
      for (const l of a.layers) assert.ok(!c.dislikes.includes(l.id), `${c.id} got disliked ${l.id}`);
    }
  }
});

test('complexity grows with rank', () => {
  const avg = (rank: number) => ROSTER.reduce((s, c) => s + generateOrder(c, { rank, day: 1 }).layers.length, 0) / ROSTER.length;
  assert.ok(avg(15) > avg(1) + 1, `rank 15 avg ${avg(15)} vs rank 1 ${avg(1)}`);
  assert.ok(available(1).toppings.length >= 3);
});

test('chicken is always well done', () => {
  for (const c of ROSTER) for (let v = 0; v < 5; v++) {
    const o = generateOrder(c, { rank: 20, day: v }, v);
    for (const l of o.layers) if (l.id === 'patty_chicken') assert.equal(l.doneness, 'well');
  }
});
