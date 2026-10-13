import { describe, expect, it } from 'vitest';
import { BUILD_PITCH } from '../src/shared/constants';
import { MIN_STABILITY, pieceCost, pieceMaxHp } from '../src/shared/data/building';
import { pieceGeometry } from '../src/shared/sim/buildgeom';
import { B, STRUCT_TIER_BLOCKS } from '../src/shared/world/blocks';
import type { Game } from '../src/sim/game';
import type { Player } from '../src/sim/player';
import {
  GROUND, OY, aimAt, build, count, errors, give, hold, makeGame, placeTotem, resetCooldowns, seconds, spawnPlayer, teleport, settle,
} from './helpers';

const P = BUILD_PITCH;
const F = (i: number, j: number, tier = 0) => ({ type: 'foundation' as const, i, j, oy: OY, tier });

function setup() {
  const game = makeGame();
  const { p, link } = spawnPlayer(game, 'Builder', 8.5, 8.5);
  return { game, p, link };
}

const blockAt = (game: Game, c: [number, number, number]) => game.world.getBlock(c[0], c[1], c[2]);

function hammer(game: Game, p: Player, mode: 'upgrade' | 'repair' | 'demolish', target: [number, number, number], tier?: number) {
  hold(p, 'hammer', 1, 4);
  resetCooldowns(p);
  game.handle(p, { t: 'hammer', mode, ...aimAt(p, target[0] + 0.5, target[1] + 0.5, target[2] + 0.5), tier });
}

describe('placement rules', () => {
  it('foundations must sit on the ground (not floating, not inside terrain)', () => {
    const { game } = setup();
    expect(game.building.buildAt(null, { type: 'foundation', i: 4, j: 1, oy: OY + 3 })).toBe('Foundations must be placed on the ground');
    expect(game.building.buildAt(null, { type: 'foundation', i: 4, j: 1, oy: GROUND })).toBe('Blocked by terrain or another object');
    const f = build(game, null, F(4, 1));
    expect(f.stability).toBe(1);
    for (const c of f.geom.cells) expect(blockAt(game, c)).toBe(B.struct_twig);
  });

  it('a foundation needs at least two grounded cells', () => {
    const { game } = setup();
    // dig out the ground under the foundation footprint except one cell
    for (let z = 5; z <= 7; z++) for (let x = 17; x <= 19; x++) if (!(x === 17 && z === 5)) game.world.set(x, GROUND, z, B.air);
    expect(game.building.buildAt(null, F(4, 1))).toBe('Foundations must be placed on the ground');
    game.world.set(18, GROUND, 5, B.dirt);
    expect(typeof game.building.buildAt(null, F(4, 1))).toBe('object');
  });

  it('walls and floors need support', () => {
    const { game } = setup();
    expect(game.building.buildAt(null, { type: 'wall', i: 4, j: 1, oy: OY, side: 'w' })).toBe('Not enough support');
    expect(game.building.buildAt(null, { type: 'floor', i: 4, j: 1, oy: OY + P })).toBe('Not enough support');
    build(game, null, F(4, 1));
    const w = build(game, null, { type: 'wall', i: 4, j: 1, oy: OY, side: 'w' });
    expect(w.stability).toBe(1);
    const floor = build(game, null, { type: 'floor', i: 4, j: 1, oy: OY + P });
    expect(floor.stability).toBeCloseTo(0.8);
  });

  it('a socket can only hold one piece', () => {
    const { game } = setup();
    build(game, null, F(4, 1));
    build(game, null, { type: 'wall', i: 4, j: 1, oy: OY, side: 'n' });
    expect(game.building.buildAt(null, { type: 'window', i: 4, j: 1, oy: OY, side: 'n' })).toBe('Something is already built there');
    expect(game.building.buildAt(null, F(4, 1))).toBe('Something is already built there');
  });

  it('cannot build a piece into a player', () => {
    const { game, p } = setup();
    build(game, null, F(4, 1));
    teleport(game, p, 16.5, OY + 1, 6.5); // standing on the west grid line of cell (4,1)
    settle(game, p);
    expect(game.building.buildAt(null, { type: 'wall', i: 4, j: 1, oy: OY, side: 'w' })).toBe('Something is in the way');
  });

  it('builds through the real request path, charging the tier cost', () => {
    const { game, p, link } = setup();
    hold(p, 'building_plan');
    const look = aimAt(p, 13.5, GROUND + 1, 9.5); // top face of the ground in cell (3,2)
    game.handle(p, { t: 'build', piece: 'foundation', ...look, rot: 0 });
    expect(errors(link).at(-1)).toMatch(/Need 50 Wood/);
    expect(game.building.pieces.size).toBe(0);
    give(p, 'wood', 60);
    resetCooldowns(p);
    game.handle(p, { t: 'build', piece: 'foundation', ...look, rot: 0 });
    expect(game.building.pieces.size).toBe(1);
    const f = [...game.building.pieces.values()][0];
    expect(f.socket).toMatchObject({ type: 'foundation', i: 3, j: 2, oy: OY });
    expect(count(p, 'wood')).toBe(10);
    // a requested tier is charged at that tier's price
    give(p, 'stone', 300);
    resetCooldowns(p);
    game.handle(p, { t: 'build', piece: 'foundation', ...aimAt(p, 5.5, GROUND + 1, 13.5), rot: 0, tier: 2 });
    expect(count(p, 'stone')).toBe(0);
    expect([...game.building.pieces.values()].some((q) => q.tier === 2)).toBe(true);
    // unknown piece types are ignored
    resetCooldowns(p);
    game.handle(p, { t: 'build', piece: 'door', ...look, rot: 0 });
    game.handle(p, { t: 'build', piece: 'constructor', ...look, rot: 0 });
    expect(game.building.pieces.size).toBe(2);
  });
});

describe('stability', () => {
  it('decays with distance from the ground and refuses unsupported overhangs', () => {
    const { game } = setup();
    build(game, null, F(4, 1));
    build(game, null, { type: 'wall', i: 4, j: 1, oy: OY, side: 'w' });
    const f1 = build(game, null, { type: 'floor', i: 4, j: 1, oy: OY + P });
    const f2 = build(game, null, { type: 'floor', i: 5, j: 1, oy: OY + P });
    expect(f1.stability).toBeCloseTo(0.8);
    expect(f2.stability).toBeCloseTo(0.4);
    // 0.4 * 0.5 = 0.2 < MIN_STABILITY
    expect(MIN_STABILITY).toBeGreaterThan(0.2);
    expect(game.building.buildAt(null, { type: 'floor', i: 6, j: 1, oy: OY + P })).toBe('Not enough support');
    // walls on a floor inherit its stability; a wall stacked on a wall gets 0.9
    const up = build(game, null, { type: 'wall', i: 4, j: 1, oy: OY + P, side: 'n' });
    expect(up.stability).toBeCloseTo(0.8);
    const stacked = build(game, null, { type: 'wall', i: 4, j: 1, oy: OY + P, side: 'w' });
    expect(stacked.stability).toBeCloseTo(0.9);
  });

  it('destroying the only supporting wall collapses everything resting on it', () => {
    const { game } = setup();
    build(game, null, F(4, 1, 2));
    const wall = build(game, null, { type: 'wall', i: 4, j: 1, oy: OY, side: 'w' }, 1);
    const floor = build(game, null, { type: 'floor', i: 4, j: 1, oy: OY + P });
    const upper = build(game, null, { type: 'wall', i: 4, j: 1, oy: OY + P, side: 'n' });
    expect(game.building.pieces.size).toBe(4);
    game.building.damagePiece(wall, 1e6, 'explosive', null);
    expect(game.building.pieces.has(wall.id)).toBe(false);
    expect(game.building.pieces.has(floor.id)).toBe(false);
    expect(game.building.pieces.has(upper.id)).toBe(false);
    expect(game.building.pieces.size).toBe(1);
    for (const piece of [wall, floor, upper]) for (const c of piece.geom.cells) expect(blockAt(game, c)).toBe(B.air);
  });

  it('a floor with a second supporting wall survives losing one', () => {
    const { game } = setup();
    build(game, null, F(4, 1, 2));
    const w1 = build(game, null, { type: 'wall', i: 4, j: 1, oy: OY, side: 'w' }, 1);
    build(game, null, { type: 'wall', i: 5, j: 1, oy: OY, side: 'w' }, 1);
    const floor = build(game, null, { type: 'floor', i: 4, j: 1, oy: OY + P });
    game.building.damagePiece(w1, 1e6, 'explosive', null);
    expect(game.building.pieces.has(floor.id)).toBe(true);
    expect(floor.stability).toBeCloseTo(0.8);
  });

  it('half walls do not hold up floors', () => {
    const { game } = setup();
    build(game, null, F(4, 1));
    build(game, null, { type: 'half_wall', i: 4, j: 1, oy: OY, side: 'w' });
    expect(game.building.buildAt(null, { type: 'floor', i: 4, j: 1, oy: OY + P })).toBe('Not enough support');
  });

  it('recomputeStability after a load-like rebuild keeps a valid structure intact', () => {
    const { game } = setup();
    build(game, null, F(4, 1));
    build(game, null, { type: 'wall', i: 4, j: 1, oy: OY, side: 'w' });
    const floor = build(game, null, { type: 'floor', i: 4, j: 1, oy: OY + P });
    game.building.recomputeStability(floor.building);
    expect(game.building.pieces.size).toBe(3);
    expect(floor.stability).toBeCloseTo(0.8);
  });
});

describe('frames (floor rings & corner pillars)', () => {
  it('appear with their pieces and vanish when no piece claims them', () => {
    const { game } = setup();
    const f = build(game, null, F(4, 1));
    const ring: [number, number, number] = [16, OY, 4];
    expect(blockAt(game, ring)).toBe(B.struct_twig);
    const wall = build(game, null, { type: 'wall', i: 4, j: 1, oy: OY, side: 'w' }, 2);
    const pillars: Array<[number, number, number]> = [[16, OY + 1, 4], [16, OY + 3, 4], [16, OY + 1, 8], [16, OY + 3, 8]];
    for (const c of pillars) expect(blockAt(game, c)).toBe(B.struct_stone); // highest claiming tier
    expect(blockAt(game, ring)).toBe(B.struct_stone);
    game.building.destroyPiece(wall);
    for (const c of pillars) expect(blockAt(game, c)).toBe(B.air);
    expect(blockAt(game, ring)).toBe(B.struct_twig);
    game.building.destroyPiece(f);
    expect(blockAt(game, ring)).toBe(B.air);
    expect(game.building.isFrame(16, OY, 4)).toBe(false);
  });

  it('a ring shared by two foundations survives losing one of them', () => {
    const { game } = setup();
    const a = build(game, null, F(4, 1));
    build(game, null, F(5, 1));
    game.building.destroyPiece(a);
    expect(blockAt(game, [20, OY, 6])).toBe(B.struct_twig); // shared edge x = 20
    expect(blockAt(game, [16, OY, 6])).toBe(B.air); //          a's outer edge
  });

  it('frames are not gatherable and block freeform block placement', () => {
    const { game, p } = setup();
    build(game, null, F(4, 1));
    hold(p, 'stone_pickaxe');
    teleport(game, p, 14.5, OY, 6.5);
    settle(game, p);
    for (let i = 0; i < 10; i++) {
      resetCooldowns(p);
      game.handle(p, { t: 'swing', ...aimAt(p, 16.5, OY + 0.5, 6.5) });
    }
    expect(blockAt(game, [16, OY, 6])).toBe(B.struct_twig);
    expect(game.tiles.canPlaceBlock(p, 'cobblestone', 16, OY + 1, 4)).toBeNull(); // no frame there yet
    build(game, null, { type: 'wall', i: 4, j: 1, oy: OY, side: 'n' });
    game.world.set(16, OY + 1, 4, B.air); // even if the pillar block were missing, the cell stays reserved
    expect(game.tiles.canPlaceBlock(p, 'cobblestone', 16, OY + 1, 4)).toBe('Something is already there');
  });
});

describe('doors & locks', () => {
  function house() {
    const { game, p, link } = setup();
    build(game, p, F(4, 1, 2), 2);
    const doorway = build(game, p, { type: 'doorway', i: 4, j: 1, oy: OY, side: 'w' }, 2);
    teleport(game, p, 18.5, OY + 1, 6.5); // inside, on the foundation
    settle(game, p);
    return { game, p, link, doorway };
  }
  const doorCells: Array<[number, number, number]> = [[16, OY + 1, 6], [16, OY + 2, 6]];

  function placeDoor(game: Game, p: Player, item = 'wooden_door') {
    hold(p, item, 1, 1);
    resetCooldowns(p);
    game.handle(p, { t: 'place', ...aimAt(p, 16.5, OY + 1.5, 5.5) }); // aim at the doorway frame
  }
  const toggle = (game: Game, p: Player) => {
    resetCooldowns(p);
    game.handle(p, { t: 'interact', ...aimAt(p, 16.5, OY + 1.5, 6.5) });
  };

  it('a doorway leaves a 1x2 hole; a door placed in it is solid until opened', () => {
    const { game, p } = house();
    for (const c of doorCells) expect(blockAt(game, c)).toBe(B.air);
    placeDoor(game, p);
    const door = [...game.building.pieces.values()].find((q) => q.type === 'door')!;
    expect(door).toBeDefined();
    expect(door.hp).toBe(200);
    expect(p.inv.belt.get(1)).toBeNull(); // door item consumed
    for (const c of doorCells) expect(blockAt(game, c)).toBe(B.door_wood);
    toggle(game, p);
    expect(door.open).toBe(true);
    for (const c of doorCells) expect(blockAt(game, c)).toBe(B.door_wood_open);
    toggle(game, p);
    expect(door.open).toBe(false);
    // a second door cannot go into the same doorway
    placeDoor(game, p, 'metal_door');
    expect([...game.building.pieces.values()].filter((q) => q.type === 'door')).toHaveLength(1);
    expect(p.inv.belt.get(1)?.id).toBe('metal_door');
  });

  it('doors only go into doorways', () => {
    const { game, p, link } = setup();
    build(game, p, F(4, 1));
    build(game, p, { type: 'wall', i: 4, j: 1, oy: OY, side: 'w' });
    teleport(game, p, 18.5, OY + 1, 6.5);
    settle(game, p);
    placeDoor(game, p);
    expect(errors(link).at(-1)).toMatch(/Aim at a doorway/);
    expect(p.inv.belt.get(1)?.id).toBe('wooden_door');
  });

  it('destroying the doorway takes the door with it', () => {
    const { game, p, doorway } = house();
    placeDoor(game, p);
    game.building.damagePiece(doorway, 1e6, 'explosive', null);
    expect([...game.building.pieces.values()].some((q) => q.type === 'door')).toBe(false);
    for (const c of doorCells) expect(blockAt(game, c)).toBe(B.air);
  });

  it('a code lock keeps unauthorized players out until they enter the code', () => {
    const { game, p, link } = house();
    placeDoor(game, p);
    const door = [...game.building.pieces.values()].find((q) => q.type === 'door')!;
    hold(p, 'code_lock', 1, 2);
    resetCooldowns(p);
    game.handle(p, { t: 'place', ...aimAt(p, 16.5, OY + 1.5, 6.5) });
    expect(door.lock).toBeDefined();
    expect(link.of('lockui').at(-1)?.mode).toBe('set');
    game.handle(p, { t: 'lock', op: 'set', code: '12a4' });
    expect(door.lock!.code).toBe('');
    game.handle(p, { t: 'lock', op: 'set', code: '1234' });
    expect(door.lock!.code).toBe('1234');

    const { p: thief, link: thiefLink } = spawnPlayer(game, 'Thief', 13.5, 6.5);
    toggle(game, thief);
    expect(door.open).toBe(false);
    expect(errors(thiefLink).at(-1)).toBe('Locked');
    expect(thiefLink.of('lockui').at(-1)?.mode).toBe('enter');
    // brute forcing hurts
    const hp = thief.vitals.hp;
    game.handle(thief, { t: 'lock', op: 'enter', code: '0000' });
    expect(thief.vitals.hp).toBeCloseTo(hp - 5);
    game.handle(thief, { t: 'lock', op: 'enter', code: '1234' }); // too fast: rate limited
    expect(door.lock!.authorized).not.toContain('Thief');
    seconds(game, 2);
    game.handle(thief, { t: 'lock', op: 'enter', code: '1234' });
    expect(door.lock!.authorized).toContain('Thief');
    toggle(game, thief);
    expect(door.open).toBe(true);
    // only the owner may remove the lock or change the code without being authorized
    game.handle(thief, { t: 'lock', op: 'remove' });
    expect(door.lock).toBeDefined();
    // the owner is always allowed through
    toggle(game, p);
    expect(door.open).toBe(false);
  });

  it('changing the code de-authorizes everyone else', () => {
    const { game, p } = house();
    placeDoor(game, p);
    const door = [...game.building.pieces.values()].find((q) => q.type === 'door')!;
    door.lock = { code: '1111', owner: p.name, authorized: [p.name, 'Friend'] };
    p.lockTarget = { kind: 'piece', id: door.id };
    game.handle(p, { t: 'lock', op: 'set', code: '2222' });
    expect(door.lock.authorized).toEqual([p.name]);
  });
});

describe('hammer: upgrade, repair, demolish', () => {
  function wallSetup() {
    const { game, p, link } = setup();
    build(game, p, F(4, 1), 0);
    const wall = build(game, p, { type: 'wall', i: 4, j: 1, oy: OY, side: 'w' }, 0);
    teleport(game, p, 18.5, OY + 1, 6.5);
    settle(game, p);
    const cell: [number, number, number] = [16, OY + 2, 6];
    return { game, p, link, wall, cell };
  }

  it('upgrading charges the target tier cost and changes tier, HP and blocks', () => {
    const { game, p, link, wall, cell } = wallSetup();
    give(p, 'stone', 299);
    hammer(game, p, 'upgrade', cell, 2);
    expect(errors(link).at(-1)).toMatch(/Need 300 Stones/);
    expect(wall.tier).toBe(0);
    expect(count(p, 'stone')).toBe(299);
    give(p, 'stone', 1);
    hammer(game, p, 'upgrade', cell, 2);
    expect(wall.tier).toBe(2);
    expect(wall.hp).toBe(pieceMaxHp('wall', 2));
    expect(wall.maxHp).toBe(500);
    expect(count(p, 'stone')).toBe(0);
    for (const c of wall.geom.cells) expect(blockAt(game, c)).toBe(STRUCT_TIER_BLOCKS[2]);
    expect(pieceCost('wall', 2)).toEqual([['stone', 300]]);
    // cannot "upgrade" to the same or a lower tier
    give(p, 'wood', 1000);
    hammer(game, p, 'upgrade', cell, 1);
    expect(wall.tier).toBe(2);
    expect(errors(link).at(-1)).toMatch(/Already at that tier/);
    hammer(game, p, 'upgrade', cell, 9);
    expect(wall.tier).toBe(2);
  });

  it('upgrade without an explicit tier goes one tier up', () => {
    const { game, p, wall, cell } = wallSetup();
    give(p, 'wood', 200);
    hammer(game, p, 'upgrade', cell);
    expect(wall.tier).toBe(1);
    expect(count(p, 'wood')).toBe(0);
  });

  it('repair is blocked right after damage, then restores up to 20% per hit for a fee', () => {
    const { game, p, link, wall, cell } = wallSetup();
    give(p, 'stone', 300);
    hammer(game, p, 'upgrade', cell, 2);
    game.building.damagePiece(wall, 300, 'explosive', null);
    expect(wall.hp).toBe(200);
    give(p, 'stone', 1000);
    hammer(game, p, 'repair', cell);
    expect(errors(link).at(-1)).toMatch(/Recently damaged/);
    expect(wall.hp).toBe(200);
    wall.lastDamaged = Date.now() - 31_000;
    const before = count(p, 'stone');
    hammer(game, p, 'repair', cell);
    expect(wall.hp).toBe(300);
    // 100 HP of a 500 HP / 300-stone wall at 50% => 30 stone
    expect(before - count(p, 'stone')).toBe(30);
  });

  it('owners can demolish only within the demolish window; strangers never', () => {
    const { game, p, link, wall, cell } = wallSetup();
    const { p: other, link: otherLink } = spawnPlayer(game, 'Other', 19.5, 5.5);
    hammer(game, other, 'demolish', cell);
    expect(errors(otherLink).at(-1)).toMatch(/not authorized/);
    expect(game.building.pieces.has(wall.id)).toBe(true);
    wall.placedAt = Date.now() - 11 * 60_000;
    hammer(game, p, 'demolish', cell);
    expect(errors(link).at(-1)).toMatch(/within 10 min/);
    expect(game.building.pieces.has(wall.id)).toBe(true);
    wall.placedAt = Date.now() - 9 * 60_000;
    hammer(game, p, 'demolish', cell);
    expect(game.building.pieces.has(wall.id)).toBe(false);
    for (const c of wall.geom.cells) expect(blockAt(game, c)).toBe(B.air);
  });

  it('demolishing a door gives the door back', () => {
    const { game, p } = setup();
    build(game, p, F(4, 1), 2);
    build(game, p, { type: 'doorway', i: 4, j: 1, oy: OY, side: 'w' }, 2);
    const door = build(game, p, { type: 'door', i: 4, j: 1, oy: OY, side: 'w' }, 1);
    expect(door.hp).toBe(250);
    teleport(game, p, 18.5, OY + 1, 6.5);
    settle(game, p);
    hammer(game, p, 'demolish', [16, OY + 1, 6]);
    expect(game.building.pieces.has(door.id)).toBe(false);
    expect(count(p, 'metal_door')).toBe(1);
  });
});

describe('building privilege', () => {
  function claimed() {
    const game = makeGame();
    const { p: owner } = spawnPlayer(game, 'Owner', 14.5, 6.5);
    build(game, owner, F(4, 1), 2);
    const totem = placeTotem(game, owner, 18, OY, 6);
    const { p: stranger, link } = spawnPlayer(game, 'Stranger', 9.5, 14.5);
    return { game, owner, stranger, link, totem };
  }

  it('placing a Claim Totem authorizes the owner and claims a zone around the building', () => {
    const { game, owner, stranger, totem } = claimed();
    expect(totem.auth).toEqual(['Owner']);
    const b = game.building.buildingOfTotem(totem.key)!;
    expect(b).toBeDefined();
    expect(game.building.privilegeState(owner)).toBe(1);
    expect(game.building.privilegeState(stranger)).toBe(2);
    // the zone ends 3 building cells (12 blocks) beyond the outermost piece
    expect(game.building.isBlocked(stranger, 4.5, OY, 6)).toBe(true);
    expect(game.building.isBlocked(stranger, 3.5, OY, 6)).toBe(false);
    expect(game.building.isBlocked(stranger, 18, OY + 30, 6)).toBe(false);
  });

  it('a totem needs a foundation or floor under it, one per building', () => {
    const { game, owner } = claimed();
    hold(owner, 'claim_totem', 1, 5);
    resetCooldowns(owner);
    game.handle(owner, { t: 'place', ...aimAt(owner, 17.5, OY + 0.99, 5.5) });
    expect(game.tiles.at(17, OY + 1, 5)).toBeUndefined();
    resetCooldowns(owner);
    game.handle(owner, { t: 'place', ...aimAt(owner, 12.5, GROUND + 0.99, 6.5) });
    expect(game.tiles.at(12, GROUND + 1, 6)).toBeUndefined();
    expect(owner.inv.belt.get(5)?.id).toBe('claim_totem');
  });

  it('strangers cannot build, place blocks or upgrade inside the zone', () => {
    const { game, stranger, link } = claimed();
    expect(game.building.buildAt(stranger, F(2, 1))).toBe('Building blocked');
    expect(game.building.buildAt(stranger, { type: 'wall', i: 4, j: 1, oy: OY, side: 'w' })).toBe('Building blocked');
    expect(game.tiles.canPlaceBlock(stranger, 'cobblestone', 10, GROUND + 1, 14)).toBe('Building blocked');
    // the owner can
    expect(typeof game.building.buildAt([...game.players.values()][0], { type: 'wall', i: 4, j: 1, oy: OY, side: 'w' })).toBe('object');
    teleport(game, stranger, 14.5, OY, 6.5);
    give(stranger, 'stone', 1000);
    hammer(game, stranger, 'upgrade', [16, OY + 2, 6], 3);
    expect(errors(link).at(-1)).toMatch(/Building blocked/);
  });

  it('cannot connect a new piece to two different claimed buildings', () => {
    const game = makeGame();
    const { p: a } = spawnPlayer(game, 'A', 14.5, 6.5);
    build(game, a, F(4, 1), 2);
    placeTotem(game, a, 18, OY, 6);
    build(game, a, F(6, 1), 2);
    // a second, separate building with its own totem two cells away
    expect(game.building.buildings.size).toBe(2);
    const second = [...game.building.buildings.values()].find((b) => !b.totem)!;
    const t = game.tiles.create('claim_totem', 26, OY + 1, 6, 'A');
    game.world.set(26, OY + 1, 6, B.claim_totem);
    game.building.attachTotem(second.id, t.key);
    expect(game.building.buildAt(a, F(5, 1))).toBe('Cannot join two claimed buildings');
  });

  it('destroying the base under the totem removes the claim', () => {
    const { game, stranger, totem } = claimed();
    const f = [...game.building.pieces.values()][0];
    game.building.damagePiece(f, 1e6, 'explosive', null);
    expect(game.tiles.at(totem.x, totem.y, totem.z)).toBeUndefined();
    expect(game.building.privilegeState(stranger)).toBe(0);
    expect(game.building.isBlocked(stranger, 18, OY, 6)).toBe(false);
  });
});

describe('geometry', () => {
  it('pieces of a cell share grid lines and never overlap', () => {
    const sockets = [
      { type: 'foundation' as const, i: 0, j: 0, oy: 10 },
      { type: 'wall' as const, i: 0, j: 0, oy: 10, side: 'w' as const },
      { type: 'wall' as const, i: 1, j: 0, oy: 10, side: 'w' as const },
      { type: 'wall' as const, i: 0, j: 0, oy: 10, side: 'n' as const },
      { type: 'doorway' as const, i: 0, j: 1, oy: 10, side: 'n' as const },
      { type: 'floor' as const, i: 0, j: 0, oy: 14 },
    ];
    const seen = new Map<string, number>();
    sockets.forEach((s, idx) => {
      for (const c of pieceGeometry(s).cells) {
        const k = c.join(',');
        expect(seen.has(k), `cell ${k} shared by #${seen.get(k)} and #${idx}`).toBe(false);
        seen.set(k, idx);
      }
    });
    // rooms are 3x3x3 inside
    const interior = pieceGeometry(sockets[0]).cells;
    expect(interior).toHaveLength(9);
    expect(pieceGeometry({ type: 'doorway', i: 0, j: 0, oy: 10, side: 'w' }).holes).toHaveLength(2);
    expect(pieceGeometry({ type: 'window', i: 0, j: 0, oy: 10, side: 'w' }).holes).toHaveLength(1);
  });
});
