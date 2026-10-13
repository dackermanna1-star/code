import { describe, expect, it } from 'vitest';
import { itemDef, ITEM_LIST, WEAR_SLOTS } from '../src/shared/data/items';
import { mulberry32 } from '../src/shared/math';
import {
  addStack, addToAny, canMerge, Container, countItem, makeStack, moveItem, PlayerInventory, quickMove, removeAll, removeItem,
  spaceFor, wearSlotIndex, type ItemStack,
} from '../src/shared/sim/inventory';
import type { ContainerRef } from '../src/shared/net/protocol';
import { GROUND, aimAt, errors, give, hold, makeGame, spawnPlayer, ticks, totals } from './helpers';
import { B } from '../src/shared/world/blocks';

const fuelOnly0 = (s: ItemStack, slot: number) => slot !== 0 || !!itemDef(s.id).fuel;

function filled(size: number, ...stacks: Array<[number, string, number]>): Container {
  const c = new Container(size);
  for (const [i, id, n] of stacks) c.slots[i] = makeStack(id, n);
  return c;
}

/** Invariants that must hold for every container at all times. */
function checkContainer(c: Container) {
  const seen = new Set<ItemStack>();
  c.slots.forEach((s, i) => {
    if (!s) return;
    expect(Number.isInteger(s.n), `slot ${i} n=${s.n}`).toBe(true);
    expect(s.n).toBeGreaterThan(0);
    expect(s.n).toBeLessThanOrEqual(itemDef(s.id).stack);
    expect(c.accepts(s, i), `slot ${i} holds ${s.id} it does not accept`).toBe(true);
    expect(seen.has(s), 'two slots share one stack object (aliasing => duplication)').toBe(false);
    seen.add(s);
  });
}

describe('stacks', () => {
  it('makeStack sets per-instance state for tools and magazine weapons', () => {
    expect(makeStack('wood', 5)).toEqual({ id: 'wood', n: 5 });
    expect(makeStack('rock')).toEqual({ id: 'rock', n: 1, dur: 300 });
    expect(makeStack('pipe_pistol')).toMatchObject({ id: 'pipe_pistol', ammo: 0, dur: 400 });
    expect(() => makeStack('not_an_item')).toThrow(/Unknown item/);
  });

  it('merges only identical, stackable, stateless items', () => {
    expect(canMerge(makeStack('wood', 1), makeStack('wood', 3))).toBe(true);
    expect(canMerge(makeStack('wood', 1), makeStack('stone', 3))).toBe(false);
    expect(canMerge(makeStack('rock'), makeStack('rock'))).toBe(false); // stack size 1
    expect(canMerge(makeStack('torch'), makeStack('torch'))).toBe(false); // carries durability
  });

  it('every item definition has a sane stack size', () => {
    for (const d of ITEM_LIST) {
      expect(Number.isInteger(d.stack) && d.stack >= 1, d.key).toBe(true);
      if (d.weapon?.magazine || d.clothing) expect(d.stack, d.key).toBe(1);
    }
  });
});

describe('addStack / addToAny', () => {
  it('merges into existing stacks first, then fills empty slots, respecting max stack', () => {
    const c = filled(4, [2, 'wood', 900]);
    expect(addStack(c, makeStack('wood', 1500))).toBe(0);
    // 900 + 1500: top up slot 2 (+100), then fill empty slots in order
    expect(c.slots.map((s) => s?.n ?? 0)).toEqual([1000, 400, 1000, 0]);
  });

  it('returns what did not fit and adds nothing beyond capacity', () => {
    const c = filled(2, [0, 'wood', 1000], [1, 'stone', 10]);
    expect(spaceFor(c, makeStack('wood', 1))).toBe(0);
    expect(addStack(c, makeStack('wood', 5))).toBe(5);
    expect(countItem([c], 'wood')).toBe(1000);
    const a = new Container(1), b = new Container(1);
    expect(addToAny([a, b], makeStack('stone', 1500))).toBe(0);
    expect([a.get(0)!.n, b.get(0)!.n]).toEqual([1000, 500]);
  });

  it('honours preferred slots', () => {
    const c = new Container(6);
    addStack(c, makeStack('charcoal', 3), [5, 4]);
    expect(c.get(5)?.n).toBe(3);
  });
});

describe('moveItem', () => {
  it('moves a whole stack into an empty slot', () => {
    const a = filled(3, [0, 'wood', 50]), b = new Container(3);
    expect(moveItem(a, 0, b, 2)).toEqual({ ok: true });
    expect(a.get(0)).toBeNull();
    expect(b.get(2)).toEqual({ id: 'wood', n: 50 });
  });

  it('splits when moving part of a stack', () => {
    const a = filled(3, [0, 'wood', 50]);
    expect(moveItem(a, 0, a, 1, 20).ok).toBe(true);
    expect([a.get(0)!.n, a.get(1)!.n]).toEqual([30, 20]);
    expect(a.get(0)).not.toBe(a.get(1));
  });

  it('merges up to the max stack and leaves the remainder', () => {
    const a = filled(2, [0, 'wood', 600], [1, 'wood', 700]);
    expect(moveItem(a, 0, a, 1).ok).toBe(true);
    expect([a.get(0)!.n, a.get(1)!.n]).toEqual([300, 1000]);
    expect(moveItem(a, 0, a, 1)).toEqual({ ok: false, error: 'Stack is full' });
    expect([a.get(0)!.n, a.get(1)!.n]).toEqual([300, 1000]);
  });

  it('swaps different items on a full-stack move, refuses a partial move onto another item', () => {
    const a = filled(2, [0, 'wood', 10], [1, 'stone', 20]);
    expect(moveItem(a, 0, a, 1).ok).toBe(true);
    expect([a.get(0)!.id, a.get(1)!.id]).toEqual(['stone', 'wood']);
    expect(moveItem(a, 0, a, 1, 5)).toEqual({ ok: false, error: 'Slot occupied' });
    expect([a.get(0)!.n, a.get(1)!.n]).toEqual([20, 10]);
  });

  it('rejects invalid amounts and slots without changing anything', () => {
    const a = filled(2, [0, 'wood', 10]);
    const before = JSON.stringify(a.slots);
    for (const n of [0, -1, 11, Number.NaN, Number.POSITIVE_INFINITY, 0.5]) expect(moveItem(a, 0, a, 1, n).ok, `n=${n}`).toBe(false);
    for (const [si, di] of [[-1, 1], [0, 2], [0.5, 1], [5, 0], [0, Number.NaN]]) expect(moveItem(a, si, a, di).ok).toBe(false);
    expect(moveItem(a, 1, a, 0)).toEqual({ ok: false, error: 'Nothing to move' });
    expect(JSON.stringify(a.slots)).toBe(before);
    // fractional amounts are floored
    expect(moveItem(a, 0, a, 1, 3.9).ok).toBe(true);
    expect(a.get(1)!.n).toBe(3);
  });

  it('moving onto the same slot is a harmless no-op', () => {
    const a = filled(1, [0, 'wood', 10]);
    expect(moveItem(a, 0, a, 0).ok).toBe(true);
    expect(a.get(0)!.n).toBe(10);
  });
});

describe('wear slots', () => {
  const inv = () => new PlayerInventory();

  it('accept only clothing for the matching body slot', () => {
    const p = inv();
    p.main.slots[0] = makeStack('wood', 5);
    p.main.slots[1] = makeStack('burlap_shirt');
    expect(moveItem(p.main, 0, p.wear, wearSlotIndex('torso'))).toEqual({ ok: false, error: 'That item does not fit there' });
    expect(moveItem(p.main, 1, p.wear, wearSlotIndex('head')).ok).toBe(false);
    expect(moveItem(p.main, 1, p.wear, wearSlotIndex('torso')).ok).toBe(true);
    expect(p.wear.get(wearSlotIndex('torso'))!.id).toBe('burlap_shirt');
    expect(WEAR_SLOTS.length).toBe(p.wear.size);
  });

  it('refuse a swap that would put a non-clothing item into a wear slot', () => {
    const p = inv();
    p.wear.slots[wearSlotIndex('head')] = makeStack('burlap_hood');
    p.main.slots[0] = makeStack('stone', 30);
    expect(moveItem(p.wear, wearSlotIndex('head'), p.main, 0)).toEqual({ ok: false, error: 'Cannot swap those items' });
    expect(p.wear.get(wearSlotIndex('head'))!.id).toBe('burlap_hood');
    expect(p.main.get(0)!.id).toBe('stone');
    // swapping two hats is fine
    p.main.slots[1] = makeStack('can_helmet');
    expect(moveItem(p.wear, wearSlotIndex('head'), p.main, 1).ok).toBe(true);
    expect(p.wear.get(wearSlotIndex('head'))!.id).toBe('can_helmet');
  });

  it('quick-move into wear finds the right slot', () => {
    const p = inv();
    p.main.slots[3] = makeStack('burlap_trousers');
    expect(quickMove(p.main, 3, [p.wear]).ok).toBe(true);
    expect(p.wear.get(wearSlotIndex('legs'))!.id).toBe('burlap_trousers');
  });
});

describe('quickMove', () => {
  it('sends the stack to the first target with room, merging first', () => {
    const src = filled(2, [0, 'wood', 300]);
    const full = filled(1, [0, 'stone', 1000]);
    const t = filled(3, [1, 'wood', 900]);
    expect(quickMove(src, 0, [full, t]).ok).toBe(true);
    expect(src.get(0)).toBeNull();
    expect(t.slots.map((s) => s?.n ?? 0)).toEqual([200, 1000, 0]);
  });

  it('moves what fits and keeps the rest in the source', () => {
    const src = filled(1, [0, 'wood', 300]);
    const t = filled(1, [0, 'wood', 950]);
    expect(quickMove(src, 0, [t]).ok).toBe(true);
    expect([src.get(0)!.n, t.get(0)!.n]).toEqual([250, 1000]);
  });

  it('reports no room and changes nothing', () => {
    const src = filled(1, [0, 'wood', 300]);
    const t = filled(1, [0, 'stone', 5]);
    expect(quickMove(src, 0, [t, src])).toEqual({ ok: false, error: 'No room' });
    expect(src.get(0)!.n).toBe(300);
    expect(quickMove(src, 0, []).ok).toBe(false);
  });
});

describe('removeItem / removeAll', () => {
  it('removeItem takes across stacks and containers, all-or-nothing', () => {
    const a = filled(3, [0, 'wood', 30], [2, 'wood', 30]);
    const b = filled(1, [0, 'wood', 30]);
    expect(removeItem([a, b], 'wood', 100)).toBe(false);
    expect(countItem([a, b], 'wood')).toBe(90);
    expect(removeItem([a, b], 'wood', 75)).toBe(true);
    expect(countItem([a, b], 'wood')).toBe(15);
    expect(a.slots.every((s) => !s || s.n > 0)).toBe(true);
  });

  it('removeAll removes nothing if any ingredient is short', () => {
    const c = filled(3, [0, 'wood', 200], [1, 'stone', 74]);
    expect(removeAll([c], [['wood', 150], ['stone', 75]])).toBe(false);
    expect(countItem([c], 'wood')).toBe(200);
    expect(countItem([c], 'stone')).toBe(74);
    expect(removeAll([c], [['wood', 150], ['stone', 74]])).toBe(true);
    expect(countItem([c], 'wood')).toBe(50);
    expect(c.get(1)).toBeNull();
  });

  // Regression (was a bug, fixed): removeAll checks each [id, n] entry against the inventory independently, so a
  // cost list that names the same item twice is "affordable" when only one entry is,
  // and removeAll returns true after taking less than the total (src/shared/sim/inventory.ts
  // removeAll: the pre-check does not aggregate duplicate ids, and the result of removeItem
  // is ignored). No current recipe repeats an ingredient, but merged cost lists would.
  it('removeAll is all-or-nothing even when the same item appears twice', () => {
    const c = filled(1, [0, 'wood', 60]);
    expect(removeAll([c], [['wood', 50], ['wood', 50]])).toBe(false);
    expect(countItem([c], 'wood')).toBe(60);
  });

  it('Container.load drops unknown items and empty stacks', () => {
    const c = new Container(3);
    c.load([{ id: 'wood', n: 5 }, { id: 'unobtainium', n: 1 }, { id: 'stone', n: 0 }]);
    expect(c.slots).toEqual([{ id: 'wood', n: 5 }, null, null]);
  });
});

describe('no duplication: property-style fuzz', () => {
  const POOL = ['wood', 'stone', 'metal_frag', 'cloth', 'rock', 'stone_hatchet', 'burlap_shirt', 'burlap_hood', 'fur_vest', 'bandage', 'wooden_arrow', 'pipe_pistol'];

  function randomContainers(rnd: () => number) {
    const inv = new PlayerInventory();
    const box = new Container(6, fuelOnly0); // furnace-like filter
    const all = [inv.main, inv.belt, inv.wear, box];
    for (let k = 0; k < 25; k++) {
      const id = POOL[Math.floor(rnd() * POOL.length)];
      const max = itemDef(id).stack;
      addToAny([inv.main, inv.belt, box], makeStack(id, 1 + Math.floor(rnd() * Math.min(max, 700))));
    }
    return { inv, box, all };
  }

  it('random move/split/swap/quick-move sequences never change item totals', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rnd = mulberry32(seed);
      const { inv, box, all } = randomContainers(rnd);
      const before = totals(all);
      const pick = () => all[Math.floor(rnd() * all.length)];
      for (let step = 0; step < 400; step++) {
        const src = pick();
        const si = Math.floor(rnd() * (src.size + 1)) - (rnd() < 0.05 ? 1 : 0); // sometimes out of range
        const r = rnd();
        if (r < 0.55) {
          const dst = pick();
          const di = Math.floor(rnd() * dst.size);
          const amounts = [undefined, 1, 0, -3, 0.5, 2.7, 1e9, Number.NaN];
          const s = src.get(si);
          const n = rnd() < 0.5 && s ? 1 + Math.floor(rnd() * s.n) : amounts[Math.floor(rnd() * amounts.length)];
          moveItem(src, si, dst, di, n);
        } else if (r < 0.9) {
          const targets = [inv.main, inv.belt, inv.wear, box].filter(() => rnd() < 0.6);
          quickMove(src, Math.max(0, Math.min(src.size - 1, si)), targets);
        } else {
          // a tool wears out / is consumed elsewhere: model with an all-or-nothing removal and re-add
          const id = POOL[Math.floor(rnd() * POOL.length)];
          if (removeItem([inv.main, inv.belt], id, 1)) {
            const left = addToAny([inv.main, inv.belt, box], makeStack(id, 1));
            if (left) addStack(inv.main, makeStack(id, left)); // cannot fail: a slot was just freed or merged
          }
        }
        if (step % 50 === 0) for (const c of all) checkContainer(c);
      }
      for (const c of all) checkContainer(c);
      expect(totals(all), `seed ${seed}`).toEqual(before);
    }
  });
});

describe('server inventory requests (game.handle)', () => {
  function setup() {
    const game = makeGame();
    const { p, link } = spawnPlayer(game, 'Inv', 8.5, 8.5);
    give(p, 'wood', 1500);
    give(p, 'stone', 700);
    give(p, 'burlap_shirt', 1);
    give(p, 'cloth', 33);
    hold(p, 'rock', 1, 2);
    // a small box the player has opened
    const bx = 10, bz = 8, by = GROUND + 1;
    game.world.set(bx, by, bz, B.small_box);
    const box = game.tiles.create('small_box', bx, by, bz, p.name);
    box.container!.slots[0] = makeStack('metal_frag', 250);
    const look = aimAt(p, bx + 0.5, by + 0.5, bz + 0.5);
    game.handle(p, { t: 'interact', ...look });
    expect(game.tiles.lootContainer(p)).toBe(box.container);
    return { game, p, link, box };
  }

  it('moves between inventory and an opened box through validated requests', () => {
    const { game, p, box } = setup();
    const mainSlot = p.inv.main.slots.findIndex((s) => s?.id === 'stone');
    game.handle(p, { t: 'inv', op: 'move', from: ['main', mainSlot], to: ['loot', 3], n: 100 });
    expect(box.container!.get(3)).toEqual({ id: 'stone', n: 100 });
    game.handle(p, { t: 'inv', op: 'quick', from: ['loot', 0] });
    expect(box.container!.get(0)).toBeNull();
    expect(p.inv.main.slots.some((s) => s?.id === 'metal_frag' && s.n === 250) || p.inv.belt.slots.some((s) => s?.id === 'metal_frag')).toBe(true);
  });

  it('quick-moving clothing from the bag equips it', () => {
    const game = makeGame();
    const { p } = spawnPlayer(game, 'Dresser', 8.5, 8.5);
    give(p, 'burlap_shirt', 1);
    const i = p.inv.main.slots.findIndex((s) => s?.id === 'burlap_shirt');
    expect(i).toBeGreaterThanOrEqual(0);
    game.handle(p, { t: 'inv', op: 'quick', from: ['main', i] });
    expect(p.inv.wear.get(wearSlotIndex('torso'))?.id).toBe('burlap_shirt');
  });

  it('the loot container becomes unreachable once the player walks away', () => {
    const { game, p, box } = setup();
    p.move.x += 12;
    expect(game.tiles.lootContainer(p)).toBeNull();
    game.handle(p, { t: 'inv', op: 'quick', from: ['main', 0] });
    expect(box.container!.get(1)).toBeNull();
  });

  it('random and malformed requests never create or destroy items (inventory + box + ground)', () => {
    const { game, p, box } = setup();
    const refs: ContainerRef[] = ['main', 'belt', 'wear', 'loot'];
    const groundTotals = () => {
      const m = new Map<string, number>();
      for (const d of game.entities.drops) m.set(d.stack.id, (m.get(d.stack.id) ?? 0) + d.stack.n);
      return m;
    };
    const everything = () => {
      const m = totals([p.inv.main, p.inv.belt, p.inv.wear, box.container!]);
      for (const [k, v] of groundTotals()) m.set(k, (m.get(k) ?? 0) + v);
      return m;
    };
    const before = everything();
    const rnd = mulberry32(2024);
    const junk: unknown[] = [undefined, null, -1, 1e9, 'x', 2.5, Number.NaN, [], {}];
    for (let i = 0; i < 1500; i++) {
      const ref = () => refs[Math.floor(rnd() * refs.length)];
      const slot = () => (rnd() < 0.1 ? junk[Math.floor(rnd() * junk.length)] : Math.floor(rnd() * 30));
      const r = rnd();
      const n = rnd() < 0.3 ? junk[Math.floor(rnd() * junk.length)] : rnd() < 0.5 ? undefined : 1 + Math.floor(rnd() * 400);
      const msg = r < 0.6
        ? { t: 'inv', op: 'move', from: [ref(), slot()], to: [ref(), slot()], n }
        : r < 0.92 ? { t: 'inv', op: 'quick', from: [ref(), slot()] }
          : { t: 'inv', op: 'drop', from: [ref(), slot()], n: typeof n === 'number' && Number.isFinite(n) ? n : undefined };
      game.handle(p, msg as never);
      if (i % 100 === 0) game.tick();
      for (const c of [p.inv.main, p.inv.belt, p.inv.wear, box.container!]) checkContainer(c);
    }
    expect(everything()).toEqual(before);
  });

  // Regression (was a bug, fixed): a drop request with a non-numeric amount (e.g. n: "abc") turns into NaN, which
  // survives Math.max/Math.min clamping in InventoryOps.handle (src/sim/systems/inventoryops.ts,
  // `op === 'drop'`): the source slot becomes {n: NaN} (never cleared, since NaN <= 0 is false)
  // and an ItemDrop with n: NaN is spawned. The UI never sends this, but handle() is documented
  // as "never trusts its contents".
  it('a drop request with a non-numeric amount is rejected or clamped, never corrupts the stack', () => {
    const game = makeGame();
    const { p } = spawnPlayer(game, 'Dropper', 8.5, 8.5);
    hold(p, 'wood', 100);
    game.handle(p, { t: 'inv', op: 'drop', from: ['belt', 0], n: 'abc' as unknown as number });
    ticks(game, 1);
    const s = p.inv.belt.get(0);
    expect(s === null || Number.isInteger(s.n)).toBe(true);
    for (const d of game.entities.drops) expect(Number.isInteger(d.stack.n)).toBe(true);
  });

  it('a dead or not-yet-ready player cannot move items', () => {
    const game = makeGame();
    const { p, link } = spawnPlayer(game, 'Ghost', 8.5, 8.5);
    hold(p, 'wood', 10);
    p.ready = false;
    game.handle(p, { t: 'inv', op: 'move', from: ['belt', 0], to: ['main', 0] });
    expect(p.inv.belt.get(0)?.n).toBe(10);
    expect(errors(link)).toEqual([]);
  });
});
