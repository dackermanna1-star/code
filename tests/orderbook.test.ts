import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OrderBook, ReadyBurger } from '../src/game/OrderBook';
import type { Customer } from '../src/game/Customer';

const customer = (id: string) => ({ def: { id, name: id }, arrivedAt: 0, order: null }) as unknown as Customer;

test('cancelling a ticket voids it, bins its burger and moves the build on', () => {
  const book = new OrderBook();
  const a = book.create(customer('ana'), 'bun_sesame', [{ id: 'patty_beef', doneness: 'medium' }], 1);
  const b = book.create(customer('bo'), 'bun_sesame', [{ id: 'cheese_american' }], 2);
  assert.equal(book.activeBuildId, a.id);
  let disposed = 0;
  let removed = 0;
  const ready = { order: b, stack: { dispose: () => disposed++ }, tray: { removeFromParent: () => removed++ }, slot: 0 } as unknown as ReadyBurger;
  book.markReady(b, ready);

  book.cancel(a);
  assert.equal(a.status, 'void');
  assert.notEqual(book.activeBuildId, a.id, 'the build moves off a voided ticket');
  assert.ok(!book.visible.includes(a), 'voided tickets leave the rail');

  book.cancel(b);
  assert.equal(b.status, 'void');
  assert.equal(book.ready.length, 0, 'the finished burger is binned');
  assert.equal(disposed, 1);
  assert.equal(removed, 1);
  assert.equal(book.visible.length, 0);

  // served tickets stay served
  const c = book.create(customer('cy'), 'bun_sesame', [], 3);
  book.markServed(c);
  book.cancel(c);
  assert.equal(c.status, 'served');
});
