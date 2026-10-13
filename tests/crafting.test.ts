import { describe, expect, it } from 'vitest';
import { recipe } from '../src/shared/data/recipes';
import { makeStack } from '../src/shared/sim/inventory';
import { B } from '../src/shared/world/blocks';
import { Corpse } from '../src/sim/systems/entities';
import { MAX_QUEUE } from '../src/sim/systems/crafting';
import type { Game } from '../src/sim/game';
import type { Player } from '../src/sim/player';
import { GROUND, count, errors, give, makeGame, seconds, spawnPlayer, totals } from './helpers';

function setup(over = {}) {
  const game = makeGame(over);
  const { p, link } = spawnPlayer(game, 'Crafter', 8.5, 8.5);
  return { game, p, link };
}

function placeBench(game: Game, kind: 'workbench1' | 'workbench2' | 'workbench3', x: number, y: number, z: number) {
  game.world.set(x, y, z, B[kind]);
  return game.tiles.create(kind, x, y, z, 'Crafter');
}

const craft = (game: Game, p: Player, id: string, qty = 1) => game.handle(p, { t: 'craft', id, qty });

describe('crafting', () => {
  it('consumes exactly the ingredients when queued and delivers outputs as time passes', () => {
    const { game, p } = setup();
    give(p, 'wood', 400);
    give(p, 'stone', 200);
    craft(game, p, 'stone_hatchet', 2);
    expect(count(p, 'wood')).toBe(100);
    expect(count(p, 'stone')).toBe(50);
    expect(p.craftQueue).toHaveLength(1);
    expect(p.craftQueue[0]).toMatchObject({ id: 'stone_hatchet', n: 2, total: 2 });
    seconds(game, 5.5);
    expect(count(p, 'stone_hatchet')).toBe(0);
    seconds(game, 0.6);
    expect(count(p, 'stone_hatchet')).toBe(1);
    seconds(game, 6.1);
    expect(count(p, 'stone_hatchet')).toBe(2);
    expect(p.craftQueue).toHaveLength(0);
    // crafted tools come with full durability
    expect(p.inv.belt.slots.find((s) => s?.id === 'stone_hatchet')?.dur).toBe(400);
  });

  it('honours recipe output counts', () => {
    const { game, p } = setup();
    give(p, 'wood', 20);
    craft(game, p, 'planks');
    seconds(game, recipe('planks')!.time + 0.1);
    expect(count(p, 'planks')).toBe(4);
    expect(count(p, 'wood')).toBe(0);
  });

  it('rejects a craft with missing ingredients and takes nothing (atomic)', () => {
    const { game, p, link } = setup();
    give(p, 'wood', 400);
    give(p, 'stone', 100);
    craft(game, p, 'stone_hatchet', 2); // needs 300 wood + 150 stone
    expect(errors(link).at(-1)).toMatch(/Missing 50 Stones/);
    expect(count(p, 'wood')).toBe(400);
    expect(count(p, 'stone')).toBe(100);
    expect(p.craftQueue).toHaveLength(0);
  });

  it('rejects recipes whose blueprint is not learned, accepts them once learned', () => {
    const { game, p, link } = setup();
    placeBench(game, 'workbench1', 10, GROUND + 1, 8);
    give(p, 'wood', 100);
    give(p, 'metal_frag', 75);
    craft(game, p, 'metal_hatchet');
    expect(errors(link).at(-1)).toMatch(/Blueprint not learned/);
    expect(count(p, 'metal_frag')).toBe(75);
    p.blueprints.add('metal_hatchet');
    craft(game, p, 'metal_hatchet');
    expect(p.craftQueue).toHaveLength(1);
    expect(count(p, 'metal_frag')).toBe(0);
  });

  it('requires a workbench of the right level within range', () => {
    const { game, p, link } = setup();
    give(p, 'metal_frag', 50);
    give(p, 'gunpowder', 50);
    craft(game, p, 'pistol_ammo'); // known, needs bench 1
    expect(errors(link).at(-1)).toMatch(/Workbench Level 1/);
    // a bench too far away does not count
    placeBench(game, 'workbench1', 20, GROUND + 1, 8);
    craft(game, p, 'pistol_ammo');
    expect(p.craftQueue).toHaveLength(0);
    // in range: ok
    placeBench(game, 'workbench1', 10, GROUND + 1, 9);
    craft(game, p, 'pistol_ammo');
    expect(p.craftQueue).toHaveLength(1);
    // a level-1 bench does not unlock level-2 recipes
    give(p, 'metal_frag', 10);
    give(p, 'gunpowder', 15);
    craft(game, p, 'rifle_ammo');
    expect(errors(link).at(-1)).toMatch(/Workbench Level 2/);
  });

  it('cancelling refunds exactly the ingredients of the unfinished units', () => {
    const { game, p } = setup();
    give(p, 'wood', 450);
    give(p, 'stone', 225);
    craft(game, p, 'stone_hatchet', 3);
    expect(count(p, 'wood')).toBe(0);
    seconds(game, 6.1); // one unit done
    expect(count(p, 'stone_hatchet')).toBe(1);
    seconds(game, 3); // halfway through the second
    game.handle(p, { t: 'cancelCraft', idx: 0 });
    expect(p.craftQueue).toHaveLength(0);
    expect(count(p, 'wood')).toBe(300);
    expect(count(p, 'stone')).toBe(150);
    seconds(game, 10);
    expect(count(p, 'stone_hatchet')).toBe(1);
    // bogus indices are ignored
    game.handle(p, { t: 'cancelCraft', idx: 5 });
    game.handle(p, { t: 'cancelCraft', idx: -1 });
    expect(count(p, 'wood')).toBe(300);
  });

  it('caps the queue length and the per-request quantity', () => {
    const { game, p, link } = setup();
    give(p, 'stone', 1000);
    craft(game, p, 'rock', 1e9);
    expect(p.craftQueue[0].n).toBe(100);
    expect(count(p, 'stone')).toBe(0);
    give(p, 'cloth', 1000);
    for (let i = 0; i < MAX_QUEUE + 2; i++) craft(game, p, 'bandage', Number.NaN);
    expect(p.craftQueue).toHaveLength(MAX_QUEUE);
    expect(p.craftQueue.slice(1).every((j) => j.n === 1)).toBe(true);
    expect(errors(link).at(-1)).toMatch(/queue is full/);
    expect(count(p, 'cloth')).toBe(1000 - 4 * (MAX_QUEUE - 1));
  });

  it('rejects unknown recipe ids', () => {
    const { game, p, link } = setup();
    craft(game, p, '__proto__');
    craft(game, p, 'nope');
    expect(errors(link)).toEqual(['Unknown recipe', 'Unknown recipe']);
  });

  it('craftSpeed config shortens crafting time', () => {
    const { game, p } = setup({ craftSpeed: 2 });
    give(p, 'wood', 150);
    give(p, 'stone', 75);
    craft(game, p, 'stone_hatchet');
    seconds(game, 3.1);
    expect(count(p, 'stone_hatchet')).toBe(1);
  });

  it('dying refunds queued crafts into the corpse', () => {
    const { game, p } = setup();
    give(p, 'cloth', 50);
    give(p, 'wood', 300);
    give(p, 'stone', 150);
    const before = totals([p.inv.main, p.inv.belt]);
    craft(game, p, 'bandage', 3);
    craft(game, p, 'stone_hatchet', 2);
    seconds(game, 0.5);
    game.combat.kill(p, null, 'Test');
    expect(p.craftQueue).toHaveLength(0);
    const corpse = [...game.entities.corpses].find((c) => c.name === 'Crafter') as Corpse;
    expect(corpse).toBeDefined();
    expect(totals([corpse.container])).toEqual(before);
  });

  // Regression (was a bug, fixed): Crafting.cancelAll (src/sim/systems/crafting.ts) refunds with addToAny() into main+belt
  // and ignores the leftover, so when the inventory is full at death the refunded ingredients
  // are destroyed instead of going into the corpse (which has 36 slots vs 30 for main+belt, or
  // being dropped like entities.give does).
  it('dying with a full inventory still refunds queued crafts (nothing is destroyed)', () => {
    const { game, p } = setup();
    give(p, 'wood', 150);
    give(p, 'stone', 75);
    for (let i = 0; i < 28; i++) give(p, 'rock', 1);
    craft(game, p, 'stone_hatchet');
    expect(p.craftQueue).toHaveLength(1);
    // the freed slots get filled again
    give(p, 'rock', 1);
    give(p, 'rock', 1);
    game.combat.kill(p, null, 'Test');
    const corpse = [...game.entities.corpses].find((c) => c.name === 'Crafter')!;
    const onGround = [...game.entities.drops].reduce((n, d) => n + (d.stack.id === 'wood' ? d.stack.n : 0), 0);
    expect((totals([corpse.container]).get('wood') ?? 0) + onGround).toBe(150);
  });

  it('crafted items that do not fit are dropped at the player\'s feet, not lost', () => {
    const { game, p } = setup();
    give(p, 'stone', 10);
    craft(game, p, 'rock');
    for (let i = 0; i < 30; i++) p.inv.main.slots[i % 24] = p.inv.main.slots[i % 24] ?? makeStack('rock');
    for (let i = 0; i < 6; i++) p.inv.belt.slots[i] = p.inv.belt.slots[i] ?? makeStack('rock');
    const rocks = count(p, 'rock');
    seconds(game, 1.1);
    expect(count(p, 'rock')).toBe(rocks);
    expect([...game.entities.drops].some((d) => d.stack.id === 'rock')).toBe(true);
  });
});

describe('research & cheats', () => {
  it('researching consumes the item and the scrap and teaches the blueprint', () => {
    const { game, p, link } = setup();
    game.world.set(10, GROUND + 1, 8, B.research_table);
    const table = game.tiles.create('research_table', 10, GROUND + 1, 8, p.name);
    p.loot = { kind: 'block', key: table.key };
    table.container!.slots[0] = makeStack('metal_hatchet');
    table.container!.slots[1] = makeStack('scrap', 74);
    game.handle(p, { t: 'research' });
    expect(errors(link).at(-1)).toMatch(/needs 75 scrap/);
    expect(p.blueprints.has('metal_hatchet')).toBe(false);
    table.container!.slots[1] = makeStack('scrap', 80);
    game.handle(p, { t: 'research' });
    expect(p.blueprints.has('metal_hatchet')).toBe(true);
    expect(table.container!.get(0)).toBeNull();
    expect(table.container!.get(1)).toEqual({ id: 'scrap', n: 5 });
    // known recipes have nothing to learn
    table.container!.slots[0] = makeStack('rock');
    game.handle(p, { t: 'research' });
    expect(errors(link).at(-1)).toMatch(/no blueprint/);
    expect(table.container!.get(0)?.id).toBe('rock');
  });

  it('cheat commands are refused in worlds created without cheats', () => {
    const { game, p, link } = setup();
    for (const cmd of ['/give breach_charge 10', '/tp 0 100 0', '/heal', '/time 0.5']) game.handle(p, { t: 'chat', text: cmd });
    expect(count(p, 'breach_charge')).toBe(0);
    expect(errors(link).filter((m) => /cheats are disabled/.test(m))).toHaveLength(4);
    const cheaty = makeGame({ cheats: true });
    const { p: q } = spawnPlayer(cheaty, 'Admin', 8.5, 8.5);
    cheaty.handle(q, { t: 'chat', text: '/give breach_charge 12' });
    expect(count(q, 'breach_charge')).toBe(12);
  });
});
