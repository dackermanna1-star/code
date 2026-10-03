import { describe, it, expect } from 'vitest';
import { S, BLOCK_BY_NAME } from '../src/world/blocks/registry';
import '../src/world/blocks/blocks';
import { foodTick, eatFood, addExhaustion, xpForLevel, totalXpForLevel, deathXp, splitXp, orbValue, type FoodState } from '../src/game/survival/food';
import { findPortalShape, findAnyPortalShape, findEndPortalInterior, netherScale, type PortalPredicates } from '../src/game/survival/portalShape';
import { cropGrowthSpeed, cropGrowthChance } from '../src/game/survival/farming';

function ctx(health: number, difficulty: any = 'normal', regen = true) {
  const c = {
    health, maxHealth: 20, difficulty, naturalRegeneration: regen, healed: 0, starved: 0,
    heal(n: number) { c.healed += n; c.health += n; },
    starve() { c.starved++; c.health = Math.max(0, c.health - 1); },
  };
  return c;
}

describe('hunger', () => {
  it('exhaustion over 4 drains saturation first, then food', () => {
    const s: FoodState = { food: 20, saturation: 1, exhaustion: 4.5, timer: 0 };
    foodTick(s, ctx(20));
    expect(s.saturation).toBe(0);
    expect(s.food).toBe(20);
    expect(s.exhaustion).toBeCloseTo(0.5);
    s.exhaustion = 4.1;
    foodTick(s, ctx(20));
    expect(s.food).toBe(19);
  });
  it('peaceful never loses food', () => {
    const s: FoodState = { food: 10, saturation: 0, exhaustion: 4.1, timer: 0 };
    foodTick(s, ctx(20, 'peaceful'));
    expect(s.food).toBe(10);
  });
  it('exhaustion caps at 40', () => {
    const s: FoodState = { food: 20, saturation: 5, exhaustion: 39, timer: 0 };
    addExhaustion(s, 5);
    expect(s.exhaustion).toBe(40);
  });
  it('saturated fast regeneration heals every 10 ticks', () => {
    const s: FoodState = { food: 20, saturation: 5, exhaustion: 0, timer: 0 };
    const c = ctx(10);
    for (let i = 0; i < 10; i++) foodTick(s, c);
    expect(c.healed).toBeCloseTo(5 / 6);
    expect(s.exhaustion).toBeCloseTo(5);
  });
  it('slow regeneration at food >= 18 heals 1 every 80 ticks', () => {
    const s: FoodState = { food: 18, saturation: 0, exhaustion: 0, timer: 0 };
    const c = ctx(10);
    for (let i = 0; i < 79; i++) foodTick(s, c);
    expect(c.healed).toBe(0);
    foodTick(s, c);
    expect(c.healed).toBe(1);
    expect(s.exhaustion).toBe(6);
  });
  it('no regeneration with the gamerule off', () => {
    const s: FoodState = { food: 20, saturation: 5, exhaustion: 0, timer: 0 };
    const c = ctx(10, 'normal', false);
    for (let i = 0; i < 100; i++) foodTick(s, c);
    expect(c.healed).toBe(0);
  });
  it('starvation stops at 10 (easy), 1 (normal), kills on hard', () => {
    for (const [d, floor] of [['easy', 10], ['normal', 1], ['hard', 0]] as const) {
      const s: FoodState = { food: 0, saturation: 0, exhaustion: 0, timer: 0 };
      const c = ctx(20, d);
      for (let i = 0; i < 80 * 30; i++) foodTick(s, c);
      expect(c.health).toBe(floor);
    }
  });
  it('eating adds nutrition and saturation = nutrition * modifier * 2, capped by food', () => {
    const s: FoodState = { food: 10, saturation: 0, exhaustion: 0, timer: 0 };
    eatFood(s, 8, 0.8); // steak
    expect(s.food).toBe(18);
    expect(s.saturation).toBeCloseTo(12.8);
    eatFood(s, 4, 1.2);
    expect(s.food).toBe(20);
    expect(s.saturation).toBe(20);
  });
});

describe('experience', () => {
  it('vanilla level costs', () => {
    expect(xpForLevel(0)).toBe(7);
    expect(xpForLevel(14)).toBe(35);
    expect(xpForLevel(15)).toBe(37);
    expect(xpForLevel(29)).toBe(107);
    expect(xpForLevel(30)).toBe(112);
    expect(xpForLevel(31)).toBe(121);
  });
  it('total XP matches the sum of level costs', () => {
    let sum = 0;
    for (let l = 0; l < 50; l++) {
      expect(totalXpForLevel(l)).toBeCloseTo(sum);
      sum += xpForLevel(l);
    }
    expect(totalXpForLevel(30)).toBe(1395);
  });
  it('death XP and orb splitting', () => {
    expect(deathXp(3)).toBe(21);
    expect(deathXp(30)).toBe(100);
    expect(orbValue(2)).toBe(1);
    expect(orbValue(20)).toBe(17);
    const parts = splitXp(100);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts[0]).toBe(73);
  });
});

describe('nether portal shape', () => {
  const OBS = S('obsidian');
  const P: PortalPredicates = {
    isFrame: (s) => s === OBS,
    isEmpty: (s) => s === 0 || s >>> 4 === BLOCK_BY_NAME.get('fire')!.id || s >>> 4 === BLOCK_BY_NAME.get('nether_portal')!.id,
    isPortal: (s) => s >>> 4 === BLOCK_BY_NAME.get('nether_portal')!.id,
  };
  function frame(w: number, h: number, axis: 0 | 1, corners = true) {
    const m = new Map<string, number>();
    for (let i = -1; i <= w; i++)
      for (let j = -1; j <= h; j++) {
        const edge = i === -1 || i === w || j === -1 || j === h;
        const corner = (i === -1 || i === w) && (j === -1 || j === h);
        if (!edge || (corner && !corners)) continue;
        const x = axis === 0 ? i : 0, z = axis === 0 ? 0 : i;
        m.set(`${x},${10 + j},${z}`, OBS);
      }
    return (x: number, y: number, z: number) => m.get(`${x},${y},${z}`) ?? 0;
  }
  // a big surrounding of solid ground would also be "not empty"; the map defaults to air
  it('detects the minimal 2x3 frame without corners (X axis)', () => {
    const get = frame(2, 3, 0, false);
    const s = findPortalShape(get, P, 0, 11, 0, 0)!;
    expect(s).not.toBeNull();
    expect(s.width).toBe(2);
    expect(s.height).toBe(3);
    expect(s.y).toBe(10);
  });
  it('detects Z-axis and large 21x21 frames', () => {
    expect(findAnyPortalShape(frame(4, 5, 1), P, 0, 12, 2)?.axis).toBe(1);
    const big = findAnyPortalShape(frame(21, 21, 0), P, 5, 20, 0);
    expect(big?.width).toBe(21);
    expect(big?.height).toBe(21);
  });
  it('rejects too small, too big and broken frames', () => {
    expect(findAnyPortalShape(frame(1, 3, 0), P, 0, 10, 0)).toBeNull();
    expect(findAnyPortalShape(frame(2, 2, 0), P, 0, 10, 0)).toBeNull();
    expect(findAnyPortalShape(frame(22, 5, 0), P, 3, 10, 0)).toBeNull();
    const get = frame(3, 4, 0);
    const broken = (x: number, y: number, z: number) => (x === 1 && y === 14 && z === 0 ? 0 : get(x, y, z));
    expect(findAnyPortalShape(broken, P, 1, 11, 0)).toBeNull();
  });
  it('finds the end portal ring', () => {
    const eyes = new Set<string>();
    for (let k = 0; k < 3; k++) for (const [x, z] of [[-1, k], [3, k], [k, -1], [k, 3]]) eyes.add(`${x},${z}`);
    const has = (x: number, z: number) => eyes.has(`${x},${z}`);
    expect(findEndPortalInterior(has, 3, 1)).toEqual([0, 0]);
    expect(findEndPortalInterior(has, 1, -1)).toEqual([0, 0]);
    eyes.delete('1,3');
    expect(findEndPortalInterior(has, 3, 1)).toBeNull();
  });
  it('8:1 coordinates', () => {
    expect(netherScale(800, -17, true)).toEqual([100, -3]);
    expect(netherScale(100, -3, false)).toEqual([800, -24]);
  });
});

describe('crop growth', () => {
  const FARM_WET = S('farmland', 7), FARM_DRY = S('farmland', 0), WHEAT = S('wheat');
  const wheatId = WHEAT >>> 4;
  function field(farm: number, crops: [number, number][]) {
    return {
      getBlock(x: number, y: number, z: number) {
        if (y === 63 && Math.abs(x) <= 1 && Math.abs(z) <= 1) return farm;
        if (y === 64 && crops.some(([a, b]) => a === x && b === z)) return WHEAT;
        return 0;
      },
    };
  }
  it('fully hydrated 3x3 gives speed 10 and a 1/3 chance', () => {
    const f = cropGrowthSpeed(field(FARM_WET, [[0, 0]]), 0, 64, 0, wheatId);
    expect(f).toBe(10);
    expect(cropGrowthChance(f)).toBeCloseTo(1 / 3);
  });
  it('dry farmland gives speed 4', () => {
    expect(cropGrowthSpeed(field(FARM_DRY, [[0, 0]]), 0, 64, 0, wheatId)).toBe(4);
    expect(cropGrowthChance(4)).toBeCloseTo(1 / 7);
  });
  it('rows on both axes or diagonals halve the speed', () => {
    expect(cropGrowthSpeed(field(FARM_WET, [[0, 0], [1, 0]]), 0, 64, 0, wheatId)).toBe(10);
    expect(cropGrowthSpeed(field(FARM_WET, [[0, 0], [1, 0], [0, 1]]), 0, 64, 0, wheatId)).toBe(5);
    expect(cropGrowthSpeed(field(FARM_WET, [[0, 0], [1, 1]]), 0, 64, 0, wheatId)).toBe(5);
  });
});
