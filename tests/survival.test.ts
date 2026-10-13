import { describe, expect, it, vi } from 'vitest';
import { itemDef } from '../src/shared/data/items';
import { makeStack, wearSlotIndex } from '../src/shared/sim/inventory';
import { applyFood, MAX_CALORIES, newVitals, tickVitals, type Vitals, type VitalsEnv } from '../src/shared/sim/vitals';
import { Biome } from '../src/shared/world/biomes';
import type { Player } from '../src/sim/player';
import { count, drive, hold, makeGame, seconds, settle, spawnPlayer, teleport } from './helpers';

const ENV: VitalsEnv = { airTemp: 20, warmth: 0, nearFire: false, inWater: false, raining: false, radZone: 0, radProtection: 0, exertion: 0, metabolismRate: 1 };

function vit(over: Partial<Vitals> = {}): Vitals {
  return { ...newVitals(), hp: 80, cal: 300, hyd: 150, ...over };
}

/** Run tickVitals for `secs` in 0.5 s steps; returns total damage by type. */
function simulate(v: Vitals, env: Partial<VitalsEnv>, secs: number) {
  const total: Record<string, number> = {};
  let flags: string[] = [];
  for (let t = 0; t < secs; t += 0.5) {
    const r = tickVitals(v, { ...ENV, ...env }, 0.5);
    for (const [k, n] of r.damage) total[k] = (total[k] ?? 0) + n;
    flags = r.flags;
  }
  return { total, flags };
}

const WARM_KIT = ['burlap_hood', 'burlap_shirt', 'fur_vest', 'burlap_trousers', 'burlap_shoes', 'hide_gloves'];
function dress(p: Player, ids = WARM_KIT) {
  for (const id of ids) p.inv.wear.slots[wearSlotIndex(itemDef(id).clothing!.slot)] = makeStack(id);
}

describe('metabolism (pure)', () => {
  it('a fed, comfortable player takes no damage and slowly regenerates', () => {
    const v = vit();
    const { total, flags } = simulate(v, {}, 60);
    expect(total).toEqual({});
    expect(flags).toEqual([]);
    expect(v.hp).toBeCloseTo(80 + 0.1 * 60, 1);
  });

  it('starvation and dehydration hurt once the bars are empty', () => {
    const starving = vit({ cal: 0 });
    const s = simulate(starving, {}, 10);
    expect(s.total.hunger).toBeCloseTo(0.2 * 10);
    expect(s.flags).toContain('starving');
    const parched = vit({ hyd: 0 });
    const d = simulate(parched, {}, 10);
    expect(d.total.thirst).toBeCloseTo(0.25 * 10);
    expect(d.flags).toContain('dehydrated');
    // and no regeneration while starving
    expect(starving.hp).toBe(80);
  });

  it('bars drain over time, faster with exertion and the metabolism rate', () => {
    // full HP so natural regeneration (which also burns calories) does not muddy the rates
    const idle = vit({ hp: 100 }), busy = vit({ hp: 100 }), fast = vit({ hp: 100 });
    simulate(idle, {}, 100);
    simulate(busy, { exertion: 1 }, 100);
    simulate(fast, { metabolismRate: 3 }, 100);
    expect(300 - idle.cal).toBeCloseTo(0.055 * 100, 5);
    expect(busy.cal).toBeLessThan(idle.cal);
    expect((300 - fast.cal) / (300 - idle.cal)).toBeCloseTo(3, 5);
  });

  it('freezing air hurts without clothing; clothing, fire or shelter prevent it', () => {
    const naked = vit();
    const n = simulate(naked, { airTemp: -20 }, 10);
    expect(n.total.cold).toBeCloseTo((-4 - -20) * 0.03 * 10, 5);
    expect(n.flags).toContain('cold');
    const clothed = vit();
    const c = simulate(clothed, { airTemp: -20, warmth: 26 }, 10);
    expect(c.total.cold).toBeUndefined();
    expect(c.flags).toContain('cold'); // still uncomfortable (6 °C)
    const byFire = vit();
    expect(simulate(byFire, { airTemp: -20, nearFire: true }, 10).total.cold).toBeUndefined();
  });

  it('being wet makes the cold worse', () => {
    const dry = vit(), wet = vit({ wet: 1 });
    const a = simulate(dry, { airTemp: -6, warmth: 0 }, 2).total.cold ?? 0;
    const b = simulate(wet, { airTemp: -6, warmth: 0, inWater: true }, 2).total.cold ?? 0;
    expect(b).toBeGreaterThan(a);
  });

  it('extreme heat hurts', () => {
    const v = vit();
    expect(simulate(v, { airTemp: 50 }, 10).total.heat).toBeCloseTo((50 - 42) * 0.04 * 10, 5);
  });

  it('bleeding drains HP until it stops, and blocks regeneration', () => {
    const v = vit({ bleed: 5 });
    const { total } = simulate(v, {}, 10);
    expect(total.bleed).toBeCloseTo(2.5, 5); // 0.5 HP/s for the 5 s it lasts
    expect(v.bleed).toBe(0);
  });

  it('radiation accumulates in a zone and is blocked by protection', () => {
    const bare = vit(), suit = vit();
    simulate(bare, { radZone: 10 }, 10);
    simulate(suit, { radZone: 10, radProtection: 0.9 }, 10);
    expect(bare.rad).toBeCloseTo(100);
    expect(suit.rad).toBeCloseTo(10);
    expect(simulate(bare, { radZone: 10 }, 2).total.radiation).toBeGreaterThan(0);
  });

  it('food refills bars; a full stomach refuses more', () => {
    const v = vit({ cal: MAX_CALORIES });
    expect(applyFood(v, { calories: 90, hydration: 0 })).toBe(false);
    const h = vit({ cal: 100, hyd: 50 });
    expect(applyFood(h, { calories: 25, hydration: 10 })).toBe(true);
    expect([h.cal, h.hyd]).toEqual([125, 60]);
    expect(applyFood(h, { calories: 20, hydration: 0, poison: 12 })).toBe(true);
    expect(h.poison).toBe(12);
  });
});

describe('survival through the simulation', () => {
  function setup() {
    const game = makeGame();
    const { p, link } = spawnPlayer(game, 'Survivor', 8.5, 8.5);
    // comfortable fixed weather for deterministic metabolism
    vi.spyOn(game.survival, 'airTemperature').mockReturnValue(20);
    return { game, p, link };
  }

  it('an empty stomach starves the player to death', () => {
    const { game, p } = setup();
    p.vitals.cal = 0;
    p.vitals.hp = 3;
    seconds(game, 5);
    expect(p.vitals.hp).toBeLessThan(3);
    seconds(game, 15);
    expect(p.alive).toBe(false);
    expect(p.killedBy).toBe('Starvation');
    expect(p.flags).toContain('starving');
  });

  it('dehydration hurts and prevents sprinting', () => {
    const { game, p } = setup();
    p.vitals.hyd = 0;
    const hp = p.vitals.hp;
    const x0 = p.x;
    drive(game, p, 2, { f: 1, sprint: true, yaw: -Math.PI / 2 });
    const dehydratedDist = p.x - x0;
    expect(p.vitals.hp).toBeLessThan(hp);
    p.vitals.hyd = 200;
    const x1 = p.x;
    drive(game, p, 2, { f: 1, sprint: true, yaw: -Math.PI / 2 });
    expect(p.x - x1).toBeGreaterThan(dehydratedDist * 1.3);
  });

  it('cold air without clothing deals cold damage; warm clothing prevents it', () => {
    const { game, p } = setup();
    vi.spyOn(game.survival, 'airTemperature').mockReturnValue(-20);
    const hp = p.vitals.hp;
    seconds(game, 10);
    expect(p.flags).toContain('cold');
    expect(p.vitals.hp).toBeLessThan(hp - 2);
    expect(p.lastDamagedBy).toBe('cold');
    dress(p);
    expect(p.warmth()).toBe(26);
    const hp2 = p.vitals.hp;
    seconds(game, 10);
    expect(p.vitals.hp).toBeGreaterThanOrEqual(hp2);
  });

  it('a naked player freezes at night in a real snow biome', () => {
    const game = makeGame();
    const gen = game.world.gen;
    let spot: [number, number, number] | null = null;
    for (let r = 64; r < 3000 && !spot; r += 64) {
      for (let z = -r; z <= r && !spot; z += 64) for (let x = -r; x <= r && !spot; x += 64) {
        if (Math.max(Math.abs(x), Math.abs(z)) !== r) continue;
        const c = gen.column(x, z);
        if (c.biome === Biome.Snowy && gen.climateTempC(x, c.height + 1, z) < -6) spot = [x, c.height + 1, z];
      }
    }
    expect(spot).not.toBeNull();
    const [x, y, z] = spot!;
    const { p } = spawnPlayer(game, 'Explorer', 8.5, 8.5);
    teleport(game, p, x + 0.5, y + 2, z + 0.5);
    settle(game, p);
    drive(game, p, 1); // land
    expect(game.survival.sheltered(p.x, p.y, p.z)).toBe(false);
    game.time = game.config.dayLengthMin * 60 * (1 - game.config.nightFraction / 2); // midnight
    game.weather = 0;
    expect(game.isNight()).toBe(true);
    expect(game.survival.airTemperature(p.x, p.y, p.z)).toBeLessThan(-12);
    p.vitals.hp = 100;
    drive(game, p, 10);
    expect(p.flags).toContain('cold');
    expect(p.vitals.hp).toBeLessThan(97);
  });

  it('a bandage takes time to apply, heals a little and stops bleeding', () => {
    const { game, p } = setup();
    p.vitals.hp = 50;
    p.vitals.bleed = 30;
    hold(p, 'bandage', 2);
    game.handle(p, { t: 'consume' });
    p.vitals.bleed = 30;
    seconds(game, 1);
    expect(count(p, 'bandage')).toBe(2);
    expect(p.vitals.bleed).toBeGreaterThan(0);
    seconds(game, 1.1);
    expect(count(p, 'bandage')).toBe(1);
    expect(p.vitals.bleed).toBe(0);
    // bled a bit during the 2 s, then +5
    expect(p.vitals.hp).toBeGreaterThan(50 + 5 - 1.5);
    expect(p.vitals.hp).toBeLessThan(50 + 5 + 0.5);
  });

  it('switching items cancels a medical use without consuming it', () => {
    const { game, p } = setup();
    p.vitals.hp = 50;
    hold(p, 'bandage', 1);
    game.handle(p, { t: 'consume' });
    seconds(game, 0.5);
    game.handle(p, { t: 'select', slot: 1 });
    seconds(game, 3);
    expect(count(p, 'bandage')).toBe(1);
    expect(p.vitals.hp).toBeLessThan(52);
  });

  it('a syringe heals instantly plus over time', () => {
    const { game, p } = setup();
    p.vitals.hp = 40;
    hold(p, 'medical_syringe', 1);
    game.handle(p, { t: 'consume' });
    seconds(game, 1.3);
    expect(p.vitals.hp).toBeGreaterThanOrEqual(55);
    expect(p.vitals.hot).toBeGreaterThan(15);
    seconds(game, 12);
    expect(p.vitals.hp).toBeGreaterThan(40 + 15 + 20 - 0.5);
    expect(count(p, 'medical_syringe')).toBe(0);
  });

  it('medical items are refused at full health when not bleeding', () => {
    const { game, p, link } = setup();
    p.vitals.hp = 100;
    hold(p, 'bandage', 1);
    game.handle(p, { t: 'consume' });
    expect(link.of('msg').at(-1)?.text).toMatch(/full health/);
    seconds(game, 3);
    expect(count(p, 'bandage')).toBe(1);
  });

  it('eating consumes one item and fills the bars; raw meat poisons', () => {
    const { game, p, link } = setup();
    p.vitals.cal = 100;
    p.vitals.hyd = 100;
    hold(p, 'berries', 5);
    game.handle(p, { t: 'consume' });
    expect(count(p, 'berries')).toBe(4);
    expect(p.vitals.cal).toBe(125);
    expect(p.vitals.hyd).toBe(110);
    hold(p, 'raw_meat', 1);
    game.handle(p, { t: 'consume' });
    expect(p.vitals.poison).toBe(12);
    seconds(game, 2);
    expect(p.flags).toContain('poisoned');
    p.vitals.cal = MAX_CALORIES;
    hold(p, 'cooked_meat', 1);
    game.handle(p, { t: 'consume' });
    expect(link.of('msg').at(-1)?.text).toMatch(/full/);
    expect(count(p, 'cooked_meat')).toBe(1);
  });

  it('standing next to a lit campfire keeps a naked player warm', () => {
    const { game, p } = setup();
    vi.spyOn(game.survival, 'airTemperature').mockReturnValue(-15);
    const fire = game.tiles.create('campfire', 10, p.y, 8, p.name);
    fire.lit = true;
    fire.container!.slots[0] = makeStack('wood', 100);
    const hp = p.vitals.hp;
    seconds(game, 10);
    expect(p.vitals.hp).toBeGreaterThanOrEqual(hp);
    expect(game.tiles.fireNear(p.x, p.y, p.z)).toBe(true);
  });
});
