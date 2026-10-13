import { describe, expect, it } from 'vitest';
import { itemDef } from '../src/shared/data/items';
import { B, blockDef } from '../src/shared/world/blocks';
import type { Game } from '../src/sim/game';
import type { Player } from '../src/sim/player';
import { GROUND, OY, build, count, errors, hold, makeGame, placeTotem, spawnPlayer, swingAt } from './helpers';

const Y = GROUND + 1; // first block above the ground

function setup(over = {}) {
  const game = makeGame(over);
  const { p, link } = spawnPlayer(game, 'Gatherer', 8.5, 8.5);
  return { game, p, link };
}

/** Swing at a block until it breaks; returns the number of swings. */
function mine(game: Game, p: Player, x: number, y: number, z: number, max = 100): number {
  let n = 0;
  while (game.world.getBlock(x, y, z) !== B.air && n < max) {
    swingAt(game, p, x, y, z);
    n++;
  }
  return n;
}

function oakTree(game: Game, x: number, z: number, height = 5) {
  for (let y = 1; y <= height; y++) game.world.set(x, GROUND + y, z, B.oak_log);
  for (let dy = height - 1; dy <= height + 1; dy++) {
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if ((dx || dz || dy > height) && game.world.getBlock(x + dx, GROUND + dy, z + dz) === B.air) game.world.set(x + dx, GROUND + dy, z + dz, B.oak_leaves);
    }
  }
}

describe('gathering stone', () => {
  it('a rock breaks stone in 7 swings and pays out proportionally to damage (9 stone total)', () => {
    const { game, p } = setup();
    hold(p, 'rock');
    game.world.set(9, Y, 8, B.stone);
    const got: number[] = [];
    for (let i = 0; i < 7; i++) {
      swingAt(game, p, 9, Y, 8);
      got.push(count(p, 'stone'));
    }
    // rock: 9 damage/swing vs 60 HP; yield 15 * 0.6 = 9, paid as floor(9 * damage fraction)
    expect(got).toEqual([1, 2, 4, 5, 6, 8, 9]);
    expect(game.world.getBlock(9, Y, 8)).toBe(B.air);
    expect(p.held()!.dur).toBe(itemDef('rock').durability! - 7);
  });

  it('a stone pickaxe is faster, yields more and adds the finishing bonus', () => {
    const { game, p } = setup();
    hold(p, 'stone_pickaxe');
    game.world.set(9, Y, 8, B.stone);
    expect(mine(game, p, 9, Y, 8)).toBe(5);
    expect(count(p, 'stone')).toBe(15 + 3);
    expect(p.held()!.dur).toBe(400 - 5);
  });

  it('ore yields ore + stone, scaled by the tool', () => {
    const { game, p } = setup();
    hold(p, 'stone_pickaxe');
    game.world.set(9, Y, 8, B.metal_ore);
    expect(mine(game, p, 9, Y, 8)).toBe(Math.ceil(90 / 14));
    expect(count(p, 'metal_ore')).toBe(10 + 2);
    expect(count(p, 'stone')).toBe(5 + 1);
  });

  it('the wrong tool is slower and yields less', () => {
    const { game, p } = setup();
    hold(p, 'stone_hatchet');
    game.world.set(9, Y, 8, B.stone);
    expect(mine(game, p, 9, Y, 8)).toBe(Math.ceil(60 / (14 * 0.35)));
    expect(count(p, 'stone')).toBe(Math.floor(15 * 0.4) + Math.floor(15 * 0.4 * 0.2));
  });

  it('bare hands barely scratch stone', () => {
    const { game, p } = setup();
    game.world.set(9, Y, 8, B.stone);
    swingAt(game, p, 9, Y, 8);
    expect(game.world.getBlock(9, Y, 8)).toBe(B.stone);
    expect(count(p, 'stone')).toBe(0);
  });

  it('respects the swing cooldown (no free hits from spamming requests)', () => {
    const { game, p } = setup();
    hold(p, 'rock');
    game.world.set(9, Y, 8, B.stone);
    swingAt(game, p, 9, Y, 8);
    for (let i = 0; i < 20; i++) game.handle(p, { t: 'swing', yaw: p.yaw, pitch: p.pitch });
    expect(count(p, 'stone')).toBe(1);
    expect(p.held()!.dur).toBe(299);
  });

  it('gatherRate scales yields', () => {
    const { game, p } = setup({ gatherRate: 2 });
    hold(p, 'stone_pickaxe');
    game.world.set(9, Y, 8, B.stone);
    mine(game, p, 9, Y, 8);
    expect(count(p, 'stone')).toBe(30 + 6);
  });

  it('a tool breaks when its durability runs out', () => {
    const { game, p, link } = setup();
    hold(p, 'rock');
    p.held()!.dur = 2;
    game.world.set(9, Y, 8, B.stone);
    swingAt(game, p, 9, Y, 8);
    swingAt(game, p, 9, Y, 8);
    expect(p.inv.belt.get(0)).toBeNull();
    expect(errors(link).some((m) => /Rock broke/.test(m))).toBe(true);
    swingAt(game, p, 9, Y, 8); // bare hand now
    expect(count(p, 'stone')).toBe(2);
  });

  it('unbreakable blocks cannot be gathered', () => {
    const { game, p } = setup();
    hold(p, 'stone_pickaxe');
    game.world.set(9, Y, 8, B.bedrock);
    for (let i = 0; i < 20; i++) swingAt(game, p, 9, Y, 8);
    expect(game.world.getBlock(9, Y, 8)).toBe(B.bedrock);
    expect(p.held()!.dur).toBe(400);
  });
});

describe('gathering wood', () => {
  it('felling a tree with a rock: base log pays per hit, the rest of the trunk pays 50%', () => {
    const { game, p } = setup();
    oakTree(game, 10, 8);
    hold(p, 'rock');
    expect(mine(game, p, 10, Y, 8)).toBe(Math.ceil(40 / 9));
    // base: floor(12 * 0.6) = 7; 4 remaining logs * 12 * 0.6 * 0.5 = 14.4 -> 14
    expect(count(p, 'wood')).toBe(7 + 14);
    for (let y = Y; y <= GROUND + 5; y++) expect(game.world.getBlock(10, y, 8)).toBe(B.air);
    let leaves = 0;
    for (let y = Y; y <= GROUND + 7; y++) for (let z = 5; z <= 11; z++) for (let x = 7; x <= 13; x++) if (game.world.getBlock(x, y, z) === B.oak_leaves) leaves++;
    expect(leaves).toBe(0);
  });

  it('a hatchet fells faster and yields more wood', () => {
    const { game, p } = setup();
    oakTree(game, 10, 8);
    hold(p, 'stone_hatchet');
    expect(mine(game, p, 10, Y, 8)).toBe(Math.ceil(40 / 14));
    expect(count(p, 'wood')).toBe(12 + 24);
    expect(p.held()!.dur).toBe(400 - 3);
  });

  it('hitting a log higher up does not fell the whole tree', () => {
    const { game, p } = setup();
    oakTree(game, 10, 8);
    // stand on a pillar to reach the 2nd log
    hold(p, 'stone_hatchet');
    for (let i = 0; i < 3; i++) swingAt(game, p, 10, Y + 1, 8);
    expect(game.world.getBlock(10, Y + 1, 8)).toBe(B.air);
    expect(game.world.getBlock(10, Y + 2, 8)).toBe(B.oak_log);
    expect(count(p, 'wood')).toBe(12);
  });

  it('plants give fixed yields regardless of tool', () => {
    const { game, p } = setup();
    game.world.set(9, Y, 8, B.hemp);
    swingAt(game, p, 9, Y, 8);
    expect(count(p, 'cloth')).toBe(8);
    expect(game.world.getBlock(9, Y, 8)).toBe(B.air);
  });

  it('breaking a block drops plants and torches resting on it', () => {
    const { game, p } = setup();
    hold(p, 'stone_pickaxe');
    game.world.set(9, Y, 8, B.dirt);
    game.world.set(9, Y + 1, 8, B.torch);
    mine(game, p, 9, Y, 8);
    expect(game.world.getBlock(9, Y + 1, 8)).toBe(B.air);
    expect(blockDef(B.torch).needsSupport).toBe(true);
  });
});

describe('gathering inside a claimed base', () => {
  function claimedBase() {
    const game = makeGame();
    const { p: owner, link: ownerLink } = spawnPlayer(game, 'Owner', 14.5, 6.5);
    const { p: raider, link: raiderLink } = spawnPlayer(game, 'Raider', 8.5, 2.5);
    build(game, owner, { type: 'foundation', i: 4, j: 1, oy: OY }, 2);
    placeTotem(game, owner, 18, OY, 6);
    return { game, owner, raider, ownerLink, raiderLink };
  }

  it('an unauthorized player cannot mine inside the Claim Totem zone', () => {
    const { game, raider, raiderLink } = claimedBase();
    expect(game.building.privilegeState(raider)).toBe(2);
    hold(raider, 'stone_pickaxe');
    game.world.set(9, Y, 2, B.stone);
    for (let i = 0; i < 10; i++) swingAt(game, raider, 9, Y, 2);
    expect(game.world.getBlock(9, Y, 2)).toBe(B.stone);
    expect(count(raider, 'stone')).toBe(0);
    expect(errors(raiderLink).at(-1)).toMatch(/Building blocked/);
    // nor dig the ground under the base
    swingAt(game, raider, 9, GROUND, 3);
    expect(game.world.getBlock(9, GROUND, 3)).toBe(B.grass);
  });

  it('authorized players (owner, or after authorizing at the totem) can mine there', () => {
    const { game, owner, raider } = claimedBase();
    hold(owner, 'stone_pickaxe');
    game.world.set(15, Y, 5, B.stone);
    mine(game, owner, 15, Y, 5);
    expect(count(owner, 'stone')).toBe(18);

    // the raider authorizes at the (unlocked) totem
    raider.loot = { kind: 'block', key: `18,${OY + 1},6` };
    raider.move.x = 16.5; raider.move.z = 4.5;
    game.handle(raider, { t: 'totem', op: 'auth' });
    expect(game.building.privilegeState(raider)).toBe(1);
  });

  it('mining just outside the zone is allowed', () => {
    const { game, raider } = claimedBase();
    // zone = building cell (4,1) +- 3 cells => x in [4, 32), z in [-8, 20)
    raider.move.x = -3.5; raider.move.z = 2.5;
    hold(raider, 'stone_pickaxe');
    game.world.set(-3, Y, 3, B.stone);
    expect(game.building.isBlocked(raider, -2.5, Y + 0.5, 3.5)).toBe(false);
    mine(game, raider, -3, Y, 3);
    expect(count(raider, 'stone')).toBe(18);
  });
});
