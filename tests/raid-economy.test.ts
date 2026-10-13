/**
 * Raid economy (docs/RESEARCH.md §R3, "Facts -> design decisions"):
 *   Breach Charge (275 structure dmg): 2 / 4 / 8 for stone / sheet-metal / armored walls,
 *   1 for wooden and sheet-metal doors. Fuse Charge (55): ~10 for a stone wall.
 *   Wooden doors take double explosive damage. Melee does ~nothing to stone; twig dies to anything.
 */
import { describe, expect, it } from 'vitest';
import { DOORS, TIERS } from '../src/shared/data/building';
import { itemDef, type ExplosiveStats } from '../src/shared/data/items';
import type { Game } from '../src/sim/game';
import type { Piece } from '../src/sim/systems/building';
import { GROUND, OY, aimAt, build, hold, makeGame, resetCooldowns, seconds, spawnPlayer, teleport, settle, swingAt } from './helpers';

const BREACH = itemDef('breach_charge').explosive!;
const FUSE = itemDef('fuse_charge').explosive!;
const GRENADE = itemDef('tin_grenade').explosive!;

/** Wall on the west grid line of cell (4,1): cells x=16, y=OY+1..OY+3, z=5..7. Outside face x=16. */
function wallTarget(tier: number) {
  const game = makeGame();
  // an armored foundation so splash damage to it never brings the wall down early
  build(game, null, { type: 'foundation', i: 4, j: 1, oy: OY }, 4);
  const wall = build(game, null, { type: 'wall', i: 4, j: 1, oy: OY, side: 'w' }, tier);
  return { game, wall };
}

function doorTarget(doorTier: number) {
  const game = makeGame();
  build(game, null, { type: 'foundation', i: 4, j: 1, oy: OY }, 4);
  build(game, null, { type: 'doorway', i: 4, j: 1, oy: OY, side: 'w' }, 4);
  const door = build(game, null, { type: 'door', i: 4, j: 1, oy: OY, side: 'w' }, doorTier);
  return { game, door };
}

/** A charge stuck on the outside face of the wall, centred on the middle cell. */
const WALL_FACE = { x: 16 - 0.2, y: OY + 2.5, z: 6.5 };
/** A charge stuck on the door, between its two cells. */
const DOOR_FACE = { x: 16 - 0.2, y: OY + 2.0, z: 6.5 };

function explosionsToDestroy(game: Game, piece: Piece, at: { x: number; y: number; z: number }, st: ExplosiveStats): number {
  let n = 0;
  while (game.building.pieces.has(piece.id) && n < 200) {
    game.combat.explode(at.x, at.y, at.z, st, null);
    n++;
  }
  return n;
}

describe('raid economy: breach charges on walls', () => {
  it.each([
    ['twig', 0, 1],
    ['wood', 1, 1],
    ['stone', 2, 2],
    ['sheet metal', 3, 4],
    ['armored', 4, 8],
  ])('%s wall (tier %i) needs %i breach charge(s)', (_name, tier, expected) => {
    const { game, wall } = wallTarget(tier as number);
    expect(explosionsToDestroy(game, wall, WALL_FACE, BREACH)).toBe(expected);
  });

  it('one charge short leaves the wall standing (targets are exact, not off-by-one)', () => {
    for (const [tier, n] of [[2, 2], [3, 4], [4, 8]]) {
      const { game, wall } = wallTarget(tier);
      for (let i = 0; i < n - 1; i++) game.combat.explode(WALL_FACE.x, WALL_FACE.y, WALL_FACE.z, BREACH, null);
      expect(game.building.pieces.has(wall.id), `tier ${tier}`).toBe(true);
      expect(wall.hp).toBeGreaterThan(0);
      expect(wall.hp).toBeLessThanOrEqual(BREACH.structureDamage);
    }
  });
});

describe('raid economy: doors', () => {
  it.each([
    ['wooden', 0, 1],
    ['sheet metal', 1, 1],
    ['armored', 2, 4],
  ])('%s door (tier %i) needs %i breach charge(s)', (_name, tier, expected) => {
    const { game, door } = doorTarget(tier as number);
    expect(explosionsToDestroy(game, door, DOOR_FACE, BREACH)).toBe(expected);
  });

  it('wooden doors take double explosive damage', () => {
    const wood = doorTarget(0), metal = doorTarget(1);
    expect(wood.game.building.damagePiece(wood.door, 50, 'explosive', null)).toBe(100);
    expect(metal.game.building.damagePiece(metal.door, 50, 'explosive', null)).toBe(50);
    expect(DOORS[0].damageMult.explosive).toBe(2);
    expect(explosionsToDestroy(wood.game, wood.door, DOOR_FACE, FUSE)).toBe(Math.ceil((200 - 100) / (2 * FUSE.structureDamage)));
  });
});

describe('raid economy: fuse charges', () => {
  it('a stone wall takes about 10 fuse charges', () => {
    const { game, wall } = wallTarget(2);
    const n = explosionsToDestroy(game, wall, WALL_FACE, FUSE);
    expect(n).toBe(10);
  });

  it('fuse charges are the cheap-but-worse option: more charges per wall than breach charges at every tier', () => {
    for (const tier of [2, 3, 4]) {
      const a = wallTarget(tier), b = wallTarget(tier);
      expect(explosionsToDestroy(a.game, a.wall, WALL_FACE, FUSE)).toBeGreaterThan(4 * explosionsToDestroy(b.game, b.wall, WALL_FACE, BREACH));
    }
  });
});

describe('raid economy: thrown charges (end to end)', () => {
  function raider(game: Game) {
    const { p } = spawnPlayer(game, 'Raider', 12.5, 6.5);
    return p;
  }

  it('two thrown breach charges stick to a stone wall and destroy it', () => {
    const { game, wall } = wallTarget(2);
    const p = raider(game);
    let thrown = 0;
    while (game.building.pieces.has(wall.id) && thrown < 6) {
      hold(p, 'breach_charge', 1);
      teleport(game, p, 12.5, OY, 6.5);
      settle(game, p);
      resetCooldowns(p);
      game.handle(p, { t: 'throw', ...aimAt(p, 16, OY + 2.5, 6.5) });
      expect(p.inv.belt.get(0)).toBeNull();
      thrown++;
      const charge = [...game.combat.explosives][0];
      expect(charge).toBeDefined();
      seconds(game, 1);
      expect(charge.stuck).toBe(true);
      expect(Math.abs(charge.x - 16)).toBeLessThan(0.6); // stuck on the wall face
      teleport(game, p, 2.5, OY, 6.5); // take cover
      seconds(game, BREACH.fuse);
      expect(game.combat.explosives.size).toBe(0);
    }
    expect(thrown).toBe(2);
  });

  it('thrown fuse charges (which can dud and re-ignite) take about 10 for a stone wall', () => {
    const { game, wall } = wallTarget(2);
    const p = raider(game);
    let thrown = 0;
    while (game.building.pieces.has(wall.id) && thrown < 20) {
      hold(p, 'fuse_charge', 1);
      teleport(game, p, 12.5, OY, 6.5);
      settle(game, p);
      resetCooldowns(p);
      game.handle(p, { t: 'throw', ...aimAt(p, 16, OY + 2.5, 6.5) });
      thrown++;
      teleport(game, p, 2.5, OY, 6.5);
      // fuse 5.5 s, plus up to 8 s if it dudded
      seconds(game, FUSE.fuse + 9);
      expect(game.combat.explosives.size).toBe(0);
    }
    expect(thrown).toBeGreaterThanOrEqual(10);
    expect(thrown).toBeLessThanOrEqual(11);
  });
});

describe('raid economy: melee & small arms', () => {
  it('melee does next to nothing to stone', () => {
    const { game, wall } = wallTarget(2);
    const { p } = spawnPlayer(game, 'Smasher', 14.5, 6.5);
    hold(p, 'rock');
    for (let i = 0; i < 50; i++) swingAt(game, p, 16, OY + 2, 6);
    expect(wall.hp).toBeGreaterThan(500 * 0.97);
    expect(wall.hp).toBeLessThan(500);
    // the multiplier means a rock needs thousands of swings
    expect(Math.ceil(500 / (itemDef('rock').weapon!.damage * TIERS[2].damageMult.melee!))).toBeGreaterThan(2000);
    // and bullets are useless too
    expect(game.building.damagePiece(wall, 100, 'bullet', null)).toBeCloseTo(1);
    // arrows do literally nothing
    expect(game.building.damagePiece(wall, 100, 'arrow', null)).toBe(0);
  });

  it('twig dies to anything', () => {
    // two rock swings
    {
      const { game, wall } = wallTarget(0);
      const { p } = spawnPlayer(game, 'Smasher', 14.5, 6.5);
      hold(p, 'rock');
      swingAt(game, p, 16, OY + 2, 6);
      expect(game.building.pieces.has(wall.id)).toBe(true);
      swingAt(game, p, 16, OY + 2, 6);
      expect(game.building.pieces.has(wall.id)).toBe(false);
    }
    // bare hands (3 punches)
    {
      const { game, wall } = wallTarget(0);
      const { p } = spawnPlayer(game, 'Puncher', 14.5, 6.5);
      for (let i = 0; i < 3; i++) swingAt(game, p, 16, OY + 2, 6);
      expect(game.building.pieces.has(wall.id)).toBe(false);
    }
    // any explosive, even a grenade landing a couple of blocks away
    {
      const { game, wall } = wallTarget(0);
      game.combat.explode(14.5, OY + 1, 6.5, GRENADE, null);
      expect(game.building.pieces.has(wall.id)).toBe(false);
    }
    // a couple of arrows or bullets
    {
      const { game, wall } = wallTarget(0);
      game.building.damagePiece(wall, itemDef('hunting_bow').weapon!.structureDamage!, 'arrow', null);
      game.building.damagePiece(wall, itemDef('hunting_bow').weapon!.structureDamage!, 'arrow', null);
      expect(game.building.pieces.has(wall.id)).toBe(false);
    }
  });

  it('wood walls resist bullets but not melee', () => {
    const { game, wall } = wallTarget(1);
    expect(game.building.damagePiece(wall, 100, 'melee', null)).toBe(60);
    expect(game.building.damagePiece(wall, 100, 'bullet', null)).toBe(8);
  });
});

describe('raid economy: data sanity', () => {
  it('tier HP matches the researched values and explosives are unresisted', () => {
    expect(TIERS.map((t) => t.hp)).toEqual([10, 250, 500, 1000, 2000]);
    for (const t of TIERS) expect(t.damageMult.explosive).toBe(1);
    expect(DOORS.map((d) => d.hp)).toEqual([200, 250, 1000]);
    expect(BREACH.structureDamage).toBe(275);
    expect(FUSE.structureDamage).toBe(55);
    expect(BREACH.dudChance ?? 0).toBe(0);
  });

  it('explosions also chew through natural terrain (no invulnerable cave bases)', () => {
    const { game } = wallTarget(2);
    const below = { x: 10, y: GROUND, z: 10 };
    game.world.ensureSyncAt(below.x, below.z); // unloaded chunks read as solid bedrock on the server
    expect(game.world.getBlock(below.x, below.y, below.z)).toBe(4); // grass
    game.combat.explode(below.x + 0.5, below.y + 1.2, below.z + 0.5, BREACH, null);
    expect(game.world.getBlock(below.x, below.y, below.z)).toBe(0);
  });
});
