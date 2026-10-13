import { describe, expect, it } from 'vitest';
import { TIERS, UPKEEP_BRACKETS, pieceCost } from '../src/shared/data/building';
import { addStack, countItem, makeStack } from '../src/shared/sim/inventory';
import type { WorldConfig } from '../src/shared/config';
import type { Game } from '../src/sim/game';
import { OY, build, makeGame, placeTotem, seconds, settle, spawnPlayer, teleport, type Piece } from './helpers';

/** 2x2 foundations + 4 outer walls on the west/north lines, all at `tier`. */
function base(game: Game, tier: number): Piece[] {
  const out: Piece[] = [];
  for (const [i, j] of [[4, 1], [5, 1], [4, 2], [5, 2]]) out.push(build(game, null, { type: 'foundation', i, j, oy: OY }, tier));
  out.push(build(game, null, { type: 'wall', i: 4, j: 1, oy: OY, side: 'w' }, tier));
  out.push(build(game, null, { type: 'wall', i: 4, j: 2, oy: OY, side: 'w' }, tier));
  out.push(build(game, null, { type: 'wall', i: 4, j: 1, oy: OY, side: 'n' }, tier));
  out.push(build(game, null, { type: 'wall', i: 5, j: 1, oy: OY, side: 'n' }, tier));
  return out;
}

function claimedBase(tier: number, over: Partial<WorldConfig> = {}) {
  const game = makeGame(over);
  const pieces = base(game, tier);
  const { p } = spawnPlayer(game, 'Owner', 26.5, 6.5);
  // owner stands inside on the foundation; totem on foundation cell (18, OY, 6)
  teleport(game, p, 22.5, OY + 1, 6.5);
  settle(game, p);
  const totem = placeTotem(game, p, 18, OY, 6);
  return { game, pieces, totem, p, b: game.building.buildingOfTotem(totem.key)! };
}

describe('upkeep with a stocked Claim Totem', () => {
  it('charges a bracket fraction of the build cost per day', () => {
    const { game, b } = claimedBase(2);
    const perDay = game.building.upkeepPerDay(b);
    // 8 stone pieces, <= 15 pieces => 10% of 300 stone each
    expect(UPKEEP_BRACKETS[0]).toEqual({ upTo: 15, fraction: 0.1 });
    expect(perDay).toEqual({ stone: 8 * 300 * 0.1 });
  });

  it('a stocked totem prevents decay and is drained by the upkeep', () => {
    const { game, pieces, totem } = claimedBase(2);
    addStack(totem.container!, makeStack('stone', 1000));
    for (let i = 0; i < 24 * 60; i++) game.building.runUpkeep(60); // one day in 60 s periods
    for (const q of pieces) {
      expect(game.building.pieces.has(q.id)).toBe(true);
      expect(q.hp).toBe(q.maxHp);
    }
    const left = countItem([totem.container!], 'stone');
    expect(1000 - left).toBeGreaterThanOrEqual(239);
    expect(1000 - left).toBeLessThanOrEqual(240);
  });

  it('pieces whose resource is missing from the totem decay', () => {
    const { game, pieces, totem } = claimedBase(2);
    addStack(totem.container!, makeStack('wood', 1000)); // wrong resource for stone pieces
    game.building.runUpkeep(3600);
    for (const q of pieces) expect(q.hp).toBeCloseTo(q.maxHp - q.maxHp / TIERS[2].decayHours, 6);
    expect(countItem([totem.container!], 'wood')).toBe(1000);
  });

  it('decay resumes once the totem runs dry', () => {
    const { game, pieces, totem } = claimedBase(2);
    addStack(totem.container!, makeStack('stone', 10)); // ~1 hour of upkeep at 240/day
    for (let i = 0; i < 60; i++) game.building.runUpkeep(60);
    expect(pieces.every((q) => q.hp === q.maxHp)).toBe(true);
    for (let i = 0; i < 120; i++) game.building.runUpkeep(60);
    expect(countItem([totem.container!], 'stone')).toBe(0);
    expect(pieces.every((q) => q.hp < q.maxHp)).toBe(true);
  });

  it('bigger bases pay a progressively higher fraction', () => {
    const game = makeGame();
    const small = base(game, 1);
    const b = game.building.buildings.get(small[0].building)!;
    const perPiece = (bb: typeof b) => game.building.upkeepPerDay(bb).wood / bb.pieces.size;
    const smallRate = perPiece(b);
    for (let i = 0; i < 4; i++) for (let j = 3; j < 5; j++) build(game, null, { type: 'foundation', i: 4 + i, j, oy: OY }, 1);
    expect(b.pieces.size).toBe(16);
    expect(perPiece(b)).toBeGreaterThan(smallRate);
    expect(game.building.upkeepPerDay(b).wood).toBeCloseTo((8 * 200 + 8 * 200) * 0.15);
  });

  it('protectedHours reports how long the stored resources last', () => {
    const { game, totem, b } = claimedBase(2);
    addStack(totem.container!, makeStack('stone', 120)); // half a day
    expect(game.building.protectedHours(b)).toBeCloseTo(12);
  });
});

describe('decay without upkeep', () => {
  it('unclaimed pieces lose HP at maxHp / decayHours per hour', () => {
    const game = makeGame();
    const pieces = base(game, 2);
    game.building.runUpkeep(60);
    for (const q of pieces) expect(q.hp).toBeCloseTo(500 - 500 * 60 / (5 * 3600), 6);
  });

  it('twig decays away within an hour; stone survives several', () => {
    const game = makeGame();
    const twig = build(game, null, { type: 'foundation', i: 0, j: 0, oy: OY }, 0);
    const stone = build(game, null, { type: 'foundation', i: 2, j: 0, oy: OY }, 2);
    for (let i = 0; i < 59; i++) game.building.runUpkeep(60);
    expect(game.building.pieces.has(twig.id)).toBe(true);
    game.building.runUpkeep(61);
    expect(game.building.pieces.has(twig.id)).toBe(false);
    expect(stone.hp).toBeCloseTo(500 * (1 - 1 / 5), 0);
  });

  it('an empty totem does not protect anything', () => {
    const { game, pieces } = claimedBase(1);
    game.building.runUpkeep(3600);
    for (const q of pieces) expect(q.hp).toBeCloseTo(250 - 250 / 3, 6);
  });

  it('doors decay at the next tier\'s rate and are protected by their own resource', () => {
    const { game, totem } = claimedBase(2);
    build(game, null, { type: 'doorway', i: 5, j: 2, oy: OY, side: 'w' }, 2);
    const door = build(game, null, { type: 'door', i: 5, j: 2, oy: OY, side: 'w' }, 1);
    addStack(totem.container!, makeStack('stone', 1000));
    game.building.runUpkeep(3600);
    expect(door.hp).toBeCloseTo(250 - 250 / TIERS[2].decayHours, 6);
    addStack(totem.container!, makeStack('metal_frag', 100));
    const hp = door.hp;
    game.building.runUpkeep(3600);
    expect(door.hp).toBe(hp);
  });

  it('decay can be disabled or scaled by config', () => {
    const off = makeGame({ decay: { enabled: false, scale: 1 } });
    const a = build(off, null, { type: 'foundation', i: 0, j: 0, oy: OY }, 0);
    off.building.runUpkeep(7200);
    expect(a.hp).toBe(10);
    const fast = makeGame({ decay: { enabled: true, scale: 10 } });
    const b = build(fast, null, { type: 'foundation', i: 0, j: 0, oy: OY }, 2);
    fast.building.runUpkeep(60);
    expect(b.hp).toBeCloseTo(500 - (500 * 60 * 10) / (5 * 3600), 6);
  });

  it('the simulation runs upkeep on its configured period', () => {
    const game = makeGame({ upkeep: { enabled: true, periodSec: 1 }, decay: { enabled: true, scale: 360 } });
    const { p } = spawnPlayer(game, 'Watcher', 8.5, 8.5);
    const twig = build(game, p, { type: 'foundation', i: 4, j: 1, oy: OY }, 0);
    // scale 360 => a twig piece (10 HP, 1 h) loses 1 HP per simulated second
    seconds(game, 4);
    expect(twig.hp).toBeGreaterThan(4.5);
    expect(twig.hp).toBeLessThan(7.5);
    seconds(game, 8);
    expect(game.building.pieces.has(twig.id)).toBe(false);
  });

  it('decay does not reset the repair cooldown (it is not "damage by a player")', () => {
    const game = makeGame();
    const f = build(game, null, { type: 'foundation', i: 0, j: 0, oy: OY }, 2);
    game.building.runUpkeep(600);
    expect(f.lastDamaged).toBe(0);
    expect(pieceCost('foundation', 2)).toEqual([['stone', 300]]);
  });
});
