import { afterEach, describe, expect, it } from 'vitest';
import { Wand, countProjectiles, defaultShotState, formationAngles } from '../src/magic/casting';
import { SPELLS, SPELL_LIST, spellProjectileIds } from '../src/magic/spells';
import { PROJECTILES } from '../src/magic/projectileDefs';
import {
  MINES_WAND_TEMPLATES, generateWand, randomSpell, spellPrice, starterBombWand, starterWand, wandName, wandPrice,
} from '../src/magic/wandGen';
import type { CastResult, Shot, SpellDef, SpellInstance, WandStats } from '../src/magic/types';

// ---------------------------------------------------------------------------- helpers

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stats(over: Partial<WandStats> = {}): WandStats {
  return {
    name: 'test', shuffle: false, actionsPerRound: 1, castDelay: 0, rechargeTime: 0, manaMax: 1000,
    manaChargeSpeed: 0, capacity: 26, spread: 0, speedMult: 1, spriteSeed: 0, ...over,
  };
}

function inst(id: string, uses?: number): SpellInstance {
  if (!SPELLS[id]) throw new Error('unknown spell ' + id);
  return { id, uses: uses ?? SPELLS[id].maxUses };
}

function wand(ids: (string | SpellInstance)[], over: Partial<WandStats> = {}, alwaysCast: string[] = []): Wand {
  return new Wand(stats(over), ids.map((x) => (typeof x === 'string' ? inst(x) : x)), alwaysCast);
}

const rng = mulberry32(12345);

/** Waits until the wand is ready (ticking timers), then casts. */
function castNext(w: Wand, r: () => number = rng): CastResult {
  w.tick(w.waitFrames);
  const res = w.cast(r);
  expect(res.fired).toBe(true);
  return res;
}

const ids = (shot: Shot): string[] => shot.projectiles.map((p) => p.projectile);

// ---------------------------------------------------------------------------- mana

describe('mana', () => {
  const homing = SPELLS.HOMING.mana; // 70
  const spark = SPELLS.LIGHT_BULLET.mana; // 5

  const castWithMana = (mana: number): CastResult => {
    const w = wand(['HOMING', 'LIGHT_BULLET']);
    w.mana = mana;
    return w.cast(rng);
  };

  it('casts Homing + Spark bolt when both are affordable', () => {
    const r = castWithMana(homing + spark);
    expect(r.drawn).toEqual(['HOMING', 'LIGHT_BULLET']);
    expect(ids(r.root)).toEqual(['spark_bolt']);
    expect(r.root.state.extra).toContain('homing');
    expect(r.manaSpent).toBe(homing + spark);
    expect(r.skippedForMana).toEqual([]);
  });

  it('casts only Homing when the Spark bolt can no longer be paid (70-74)', () => {
    for (const m of [homing, homing + spark - 1]) {
      const r = castWithMana(m);
      expect(r.drawn).toEqual(['HOMING']);
      expect(r.skippedForMana).toEqual(['LIGHT_BULLET']);
      expect(r.producedProjectile).toBe(false);
    }
  });

  it('skips unaffordable Homing and draws the Spark bolt in its place (5-69)', () => {
    for (const m of [spark, homing - 1]) {
      const r = castWithMana(m);
      expect(r.drawn).toEqual(['LIGHT_BULLET']);
      expect(r.skippedForMana).toEqual(['HOMING']);
      expect(ids(r.root)).toEqual(['spark_bolt']);
      expect(r.root.state.homing).toBe(0);
    }
  });

  it('casts nothing below the cheapest spell', () => {
    const r = castWithMana(spark - 1);
    expect(r.drawn).toEqual([]);
    expect(r.skippedForMana).toEqual(['HOMING', 'LIGHT_BULLET']);
    expect(r.producedProjectile).toBe(false);
  });

  it('subtracts mana at draw time and caps mana at max at cast start', () => {
    const w = wand(['LIGHT_BULLET'], { manaMax: 100 });
    w.mana = 250; // e.g. after Add Mana overflow
    const r = w.cast(rng);
    expect(r.manaSpent).toBe(5);
    expect(w.mana).toBe(95);
  });

  it('Add Mana refunds exactly 30 (not double-counted) and may exceed the max during a cast', () => {
    const w = wand(['MANA_REDUCE', 'LIGHT_BULLET'], { manaMax: 100 });
    const r = w.cast(rng);
    expect(r.drawn).toEqual(['MANA_REDUCE', 'LIGHT_BULLET']);
    expect(w.mana).toBe(100 + 30 - 5);
    expect(r.manaSpent).toBe(-25);
  });

  it('Add Mana makes an otherwise unaffordable spell castable', () => {
    const w = wand(['MANA_REDUCE', 'ROCKET'], { manaMax: 100 });
    w.mana = 45; // Magic missile costs 70
    const r = w.cast(rng);
    expect(ids(r.root)).toEqual(['magic_missile']);
    expect(w.mana).toBe(5);
  });

  it('regenerates mana over time at manaChargeSpeed per second, capped at max', () => {
    const w = wand(['LIGHT_BULLET'], { manaMax: 100, manaChargeSpeed: 30 });
    w.mana = 0;
    w.tick(60);
    expect(w.mana).toBeCloseTo(30);
    w.tick(30, 2); // rate multiplier (e.g. perks/stains)
    expect(w.mana).toBeCloseTo(60);
    w.tick(600);
    expect(w.mana).toBe(100);
  });

  it('payload mana is paid up front at cast time', () => {
    const w = wand(['LIGHT_BULLET_TRIGGER', 'BOMB']);
    w.mana = 100;
    const r = w.cast(rng);
    expect(r.manaSpent).toBe(SPELLS.LIGHT_BULLET_TRIGGER.mana + SPELLS.BOMB.mana);
    expect(ids(r.root.projectiles[0].trigger!.payload)).toEqual(['bomb']);
  });
});

// ---------------------------------------------------------------------------- timers

describe('cast delay and recharge', () => {
  it('cast delay = wand cast delay + root spell cast delays', () => {
    const w = wand(['LIGHT_BULLET', 'LIGHT_BULLET'], { castDelay: 10, rechargeTime: 20 });
    const r = w.cast(rng);
    expect(r.castDelayFrames).toBe(13);
    expect(r.root.state.fireRateWait).toBe(3); // root-state contribution
    expect(r.reloaded).toBe(false);
  });

  it('waits max(castDelay, recharge) at the end of the deck because both timers run concurrently', () => {
    const slow = wand(['LIGHT_BULLET'], { castDelay: 30, rechargeTime: 20 });
    const r1 = slow.cast(rng);
    expect(r1.castDelayFrames).toBe(33);
    expect(r1.reloadFrames).toBe(20);
    slow.tick(20);
    expect(slow.isReady()).toBe(false);
    slow.tick(12);
    expect(slow.isReady()).toBe(false);
    slow.tick(1);
    expect(slow.isReady()).toBe(true);

    const reload = wand(['LIGHT_BULLET'], { castDelay: 5, rechargeTime: 40 });
    reload.cast(rng);
    expect(reload.waitFrames).toBe(40);
    reload.tick(39);
    expect(reload.cast(rng).fired).toBe(false);
    reload.tick(1);
    expect(reload.cast(rng).fired).toBe(true);
  });

  it('negative total cast delay becomes 1 frame; negative recharge becomes 0', () => {
    const w = wand(['LUMINOUS_DRILL'], { castDelay: 5, rechargeTime: 5 });
    const r = w.cast(rng);
    expect(r.castDelayFrames).toBe(1);
    expect(r.reloadFrames).toBe(0);
    expect(r.reloaded).toBe(true);
  });

  it('a cast that produced no projectile applies no cast delay (but still reloads)', () => {
    const w = wand(['ROCKET'], { castDelay: 30, rechargeTime: 25 });
    w.mana = 10;
    const r = w.cast(rng);
    expect(r.fired).toBe(true);
    expect(r.producedProjectile).toBe(false);
    expect(r.castDelayFrames).toBe(0);
    expect(w.castDelayTimer).toBe(0);
    expect(r.reloaded).toBe(true);
    expect(r.reloadFrames).toBe(25);
  });

  it('recharge changes accumulate over the whole cycle and reset after a reload', () => {
    const w = wand(['CHAINSAW', 'LIGHT_BULLET', 'LIGHT_BULLET'], { rechargeTime: 60 });
    expect(castNext(w).reloaded).toBe(false);
    expect(castNext(w).reloaded).toBe(false);
    const r = castNext(w);
    expect(r.reloaded).toBe(true);
    expect(r.reloadFrames).toBe(50); // Chainsaw's -10 from the first cast still counts
    castNext(w);
    castNext(w);
    expect(castNext(w).reloadFrames).toBe(50);
  });

  it("Chainsaw sets the cast delay accumulated so far (including the wand's) to zero", () => {
    const before = wand(['BURST_2', 'LIGHT_BULLET', 'CHAINSAW'], { castDelay: 20 }).cast(rng);
    expect(before.castDelayFrames).toBe(1); // 20 + 3 -> 0 -> clamped to one frame
    const after = wand(['BURST_2', 'CHAINSAW', 'LIGHT_BULLET'], { castDelay: 20 }).cast(rng);
    expect(after.castDelayFrames).toBe(3); // reset to 0, then Spark bolt adds 3
  });

  it('cannot cast while timers are running', () => {
    const w = wand(['LIGHT_BULLET', 'LIGHT_BULLET'], { castDelay: 10 });
    expect(w.cast(rng).fired).toBe(true);
    const r = w.cast(rng);
    expect(r.fired).toBe(false);
    expect(r.drawn).toEqual([]);
  });
});

// ---------------------------------------------------------------------------- deck mechanics

describe('deck, wrapping and reload', () => {
  it('root draws never wrap: 2 spells/cast with 3 Spark bolts alternates 2, 1, 2, 1', () => {
    const w = wand(['LIGHT_BULLET', 'LIGHT_BULLET', 'LIGHT_BULLET'], { actionsPerRound: 2 });
    const counts: number[] = [];
    const reloads: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const r = castNext(w);
      counts.push(r.root.projectiles.length);
      reloads.push(r.reloaded);
    }
    expect(counts).toEqual([2, 1, 2, 1]);
    expect(reloads).toEqual([false, true, false, true]);
  });

  it('a multicast at the end of the deck wraps to the start and forces a reload', () => {
    const w = wand(['LIGHT_BULLET', 'RUBBER_BALL', 'SPITTER', 'BURST_2']);
    expect(ids(castNext(w).root)).toEqual(['spark_bolt']);
    expect(ids(castNext(w).root)).toEqual(['bouncing_burst']);
    expect(ids(castNext(w).root)).toEqual(['spitter_bolt']);
    const r = castNext(w);
    expect(r.drawn).toEqual(['BURST_2', 'LIGHT_BULLET', 'RUBBER_BALL']);
    expect(ids(r.root)).toEqual(['spark_bolt', 'bouncing_burst']);
    expect(r.reloaded).toBe(true);
    // The reload rebuilds the whole deck in order: the Spitter left over after the wrap is not next.
    expect(w.deckPreview()).toEqual(['LIGHT_BULLET', 'RUBBER_BALL', 'SPITTER', 'BURST_2']);
    expect(ids(castNext(w).root)).toEqual(['spark_bolt']);
  });

  it('remaining root draws keep drawing after a wrap (3 Chainsaw, Spark bolt, Light; 3 spells/cast)', () => {
    const w = wand(['CHAINSAW', 'CHAINSAW', 'CHAINSAW', 'LIGHT_BULLET', 'LIGHT'], { actionsPerRound: 3 });
    const r1 = castNext(w);
    expect(ids(r1.root)).toEqual(['chainsaw', 'chainsaw', 'chainsaw']);
    expect(r1.reloaded).toBe(false);
    const r2 = castNext(w);
    expect(ids(r2.root)).toEqual(['spark_bolt', 'chainsaw', 'chainsaw']);
    expect(r2.root.state.extra).toContain('light'); // one shot state: Light applies to all three
    expect(r2.reloaded).toBe(true);
  });

  it('shuffle reorders the deck but preserves the multiset of spells', () => {
    const spellIds = ['LIGHT_BULLET', 'RUBBER_BALL', 'SPITTER', 'BUBBLESHOT', 'DIGGER', 'CHAINSAW', 'ARROW', 'LASER'];
    const sorted = [...spellIds].sort();
    let differs = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const r = mulberry32(seed);
      const w = wand(spellIds, { shuffle: true, manaMax: 10000 });
      for (let cycle = 0; cycle < 3; cycle++) {
        const order: string[] = [];
        let res: CastResult;
        do {
          res = castNext(w, r);
          order.push(...res.drawn);
        } while (!res.reloaded);
        expect([...order].sort()).toEqual(sorted);
        if (order.join() !== spellIds.join()) differs++;
      }
    }
    expect(differs).toBeGreaterThan(20);
    // A non-shuffle wand always plays in slot order.
    const fixed = wand(spellIds, { manaMax: 10000 });
    const order: string[] = [];
    for (let i = 0; i < spellIds.length; i++) order.push(...castNext(fixed).drawn);
    expect(order).toEqual(spellIds);
  });

  it('spell order changes the result', () => {
    const a = wand(['DAMAGE', 'LIGHT_BULLET', 'LIGHT_BULLET']);
    const b = wand(['LIGHT_BULLET', 'DAMAGE', 'LIGHT_BULLET']);
    const a1 = castNext(a);
    const b1 = castNext(b);
    expect(a1.root.state.damageProjectile).toBe(10);
    expect(b1.root.state.damageProjectile).toBe(0);
    const a2 = castNext(a);
    const b2 = castNext(b);
    expect(a2.root.state.damageProjectile).toBe(0);
    expect(b2.root.state.damageProjectile).toBe(10);
    expect(a2.reloaded).toBe(true);
    expect(b2.reloaded).toBe(true);
  });
});

// ---------------------------------------------------------------------------- multicasts and modifiers

describe('multicasts and modifiers', () => {
  it('Double spell puts 2 projectiles into one shot', () => {
    const r = wand(['BURST_2', 'LIGHT_BULLET', 'RUBBER_BALL']).cast(rng);
    expect(ids(r.root)).toEqual(['spark_bolt', 'bouncing_burst']);
    expect(r.castDelayFrames).toBe(3 - 2); // both cast delays are summed
  });

  it('a modifier before a multicast applies to both of its spells (one shot state)', () => {
    const r = wand(['DAMAGE', 'BURST_2', 'LIGHT_BULLET', 'LIGHT_BULLET']).cast(rng);
    expect(r.drawn).toEqual(['DAMAGE', 'BURST_2', 'LIGHT_BULLET', 'LIGHT_BULLET']);
    expect(r.root.projectiles).toHaveLength(2);
    expect(r.root.state.damageProjectile).toBe(10);
    expect(r.manaSpent).toBe(5 + 0 + 5 + 5);
  });

  it('modifiers are additive / multiplicative on the shot state', () => {
    const r = wand(['SPEED', 'SPEED', 'HEAVY_SHOT', 'CRITICAL_HIT', 'LIGHT_BULLET']).cast(rng);
    expect(r.root.state.speedMult).toBeCloseTo(2.5 * 2.5 * 0.3);
    expect(r.root.state.damageProjectile).toBeCloseTo(43.75);
    expect(r.root.state.critChance).toBe(15 + 5); // Spark bolt adds +5% to its shot
    expect(r.root.state.spread).toBe(-1);
  });

  it('formation spells set the pattern; formationAngles distributes projectiles', () => {
    const r = wand(['I_SHAPE', 'LIGHT_BULLET', 'LIGHT_BULLET']).cast(rng);
    expect(r.root.state.patternDegrees).toBe(180);
    expect(formationAngles(180, 2)).toEqual([0, 180]);
    expect(formationAngles(90, 3)).toEqual([-90, 0, 90]);
    expect(formationAngles(45, 2)).toEqual([-45, 45]);
    expect(formationAngles(180, 6)).toEqual([0, 60, 120, 180, -120, -60]);
    expect(formationAngles(0, 3)).toEqual([0, 0, 0]);
  });

  it('scatter adds spread to the shot', () => {
    const r = wand(['SCATTER_3', 'LIGHT_BULLET', 'LIGHT_BULLET', 'LIGHT_BULLET']).cast(rng);
    expect(r.root.projectiles).toHaveLength(3);
    expect(r.root.state.spread).toBe(20 - 3);
  });

  it('a modifier alone wraps into an empty deck harmlessly and reloads', () => {
    const r = wand(['DAMAGE'], { rechargeTime: 15 }).cast(rng);
    expect(r.drawn).toEqual(['DAMAGE']);
    expect(r.producedProjectile).toBe(false);
    expect(r.reloaded).toBe(true);
  });
});

// ---------------------------------------------------------------------------- triggers

describe('trigger payloads', () => {
  it('isolates payload state (Double spell, Spark bolt w/ trigger, Damage plus, Digging bolt, Speed up)', () => {
    const r = wand(['BURST_2', 'LIGHT_BULLET_TRIGGER', 'DAMAGE', 'DIGGER', 'SPEED']).cast(rng);
    expect(r.drawn).toEqual(['BURST_2', 'LIGHT_BULLET_TRIGGER', 'DAMAGE', 'DIGGER', 'SPEED']);
    // Root: the trigger spark bolt, sped up by Speed up (drawn after the payload closed), no Damage plus.
    expect(ids(r.root)).toEqual(['spark_bolt']);
    expect(r.root.state.speedMult).toBe(2.5);
    expect(r.root.state.damageProjectile).toBe(0);
    // Payload: Damage plus only affects the Digging bolt.
    const trig = r.root.projectiles[0].trigger!;
    expect(trig.kind).toBe('hit');
    expect(ids(trig.payload)).toEqual(['digging_bolt']);
    expect(trig.payload.state.damageProjectile).toBe(10);
    expect(trig.payload.state.speedMult).toBe(1);
    expect(countProjectiles(r.root)).toBe(2);
  });

  it('modifiers before the trigger do not reach the payload', () => {
    const r = wand(['HEAVY_SHOT', 'LIGHT_BULLET_TRIGGER', 'LIGHT_BULLET']).cast(rng);
    expect(r.root.state.damageProjectile).toBeCloseTo(43.75);
    expect(r.root.projectiles[0].trigger!.payload.state.damageProjectile).toBe(0);
  });

  it('payload cast delay is ignored but recharge changes inside the payload count', () => {
    const w = wand(['LIGHT_BULLET_TRIGGER', 'RECHARGE', 'BOMB'], { castDelay: 10, rechargeTime: 60 });
    const r = w.cast(rng);
    const payload = r.root.projectiles[0].trigger!.payload;
    expect(ids(payload)).toEqual(['bomb']);
    expect(payload.state.fireRateWait).toBe(-10 + 100);
    expect(r.castDelayFrames).toBe(10 + 3); // wand + trigger spark bolt only
    expect(r.reloaded).toBe(true);
    expect(r.reloadFrames).toBe(60 - 20); // Reduce recharge time inside the payload still counts
  });

  it('timer and double triggers draw the right number of cards', () => {
    const timer = wand(['LIGHT_BULLET_TIMER', 'SPITTER', 'LIGHT_BULLET']).cast(rng);
    const t = timer.root.projectiles[0].trigger!;
    expect(t.kind).toBe('timer');
    expect(t.timerFrames).toBe(10);
    expect(ids(t.payload)).toEqual(['spitter_bolt']);
    expect(timer.reloaded).toBe(false);

    const dbl = wand(['LIGHT_BULLET_TRIGGER_2', 'SPITTER', 'RUBBER_BALL', 'LIGHT_BULLET']).cast(rng);
    expect(ids(dbl.root.projectiles[0].trigger!.payload)).toEqual(['spitter_bolt', 'bouncing_burst']);
  });

  it('a trigger at the end of the deck wraps for its payload and forces a reload', () => {
    const w = wand(['LIGHT_BULLET', 'LIGHT_BULLET_TRIGGER']);
    castNext(w);
    const r = castNext(w);
    expect(ids(r.root.projectiles[0].trigger!.payload)).toEqual(['spark_bolt']);
    expect(r.reloaded).toBe(true);
  });
});

// ---------------------------------------------------------------------------- uses

describe('limited uses', () => {
  const TEST_ID = 'TEST_LIMITED_MODIFIER';
  afterEach(() => {
    delete SPELLS[TEST_ID];
  });

  it('decrements uses only on casts that produced a projectile', () => {
    const w = wand(['BOMB']);
    w.mana = 10; // cannot afford the bomb
    w.cast(rng);
    expect(w.spells[0]!.uses).toBe(3);
    w.mana = 1000;
    castNext(w);
    expect(w.spells[0]!.uses).toBe(2);

    // A limited-use modifier only spends a charge when its cast produced a projectile.
    const def: SpellDef = { ...SPELLS.DAMAGE, id: TEST_ID, maxUses: 5 };
    SPELLS[TEST_ID] = def;
    const alone = new Wand(stats(), [{ id: TEST_ID, uses: 5 }]);
    alone.cast(rng);
    expect(alone.spells[0]!.uses).toBe(5);
    const withBolt = new Wand(stats(), [{ id: TEST_ID, uses: 5 }, inst('LIGHT_BULLET')]);
    withBolt.cast(rng);
    expect(withBolt.spells[0]!.uses).toBe(4);
  });

  it('a card reaching 0 uses leaves the cycle until refreshed', () => {
    const w = wand([inst('BOMB', 1), 'LIGHT_BULLET']);
    expect(ids(castNext(w).root)).toEqual(['bomb']);
    expect(w.spells[0]!.uses).toBe(0);
    expect(castNext(w).reloaded).toBe(true);
    expect(w.deckPreview()).toEqual(['LIGHT_BULLET']);
    expect(ids(castNext(w).root)).toEqual(['spark_bolt']);
    w.refreshCharges();
    expect(w.spells[0]!.uses).toBe(3);
    expect(w.deckPreview()).toEqual(['BOMB', 'LIGHT_BULLET']);
  });

  it('0-use spells are skipped (next card drawn instead) and never cause a wrap', () => {
    const w = wand([inst('BOMB', 0), 'LIGHT_BULLET']);
    const r = w.cast(rng);
    expect(r.drawn).toEqual(['LIGHT_BULLET']);
    expect(r.skippedForMana).toEqual([]);

    // As the last card: the draw is used up, nothing wraps around to the Spark bolt.
    const end = wand(['LIGHT_BULLET', inst('BOMB', 0)]);
    castNext(end);
    const r2 = castNext(end);
    expect(r2.drawn).toEqual([]);
    expect(r2.producedProjectile).toBe(false);
    expect(r2.reloaded).toBe(true);
    expect(ids(castNext(end).root)).toEqual(['spark_bolt']);
  });

  it('uses are written through to the wand inventory instances', () => {
    const bombs = inst('BOMB');
    const w = new Wand(stats(), [bombs]);
    castNext(w);
    castNext(w);
    expect(bombs.uses).toBe(1);
  });
});

// ---------------------------------------------------------------------------- always cast

describe('always cast', () => {
  it('plays Always Casts at the front of every cast, free, without consuming a card', () => {
    const w = wand(['LIGHT_BULLET', 'LIGHT_BULLET'], {}, ['DAMAGE']);
    const r1 = castNext(w);
    expect(r1.drawn).toEqual(['DAMAGE', 'LIGHT_BULLET']);
    expect(r1.root.projectiles).toHaveLength(1); // AC modifier's draw_actions(1) draws nothing extra
    expect(r1.root.state.damageProjectile).toBe(10);
    expect(r1.manaSpent).toBe(5);
    const r2 = castNext(w);
    expect(r2.drawn).toEqual(['DAMAGE', 'LIGHT_BULLET']);
    expect(w.deckPreview()).toEqual(['LIGHT_BULLET', 'LIGHT_BULLET']);
  });

  it('an Always Cast projectile is added first; AC limited spells are unlimited', () => {
    const w = wand(['LIGHT_BULLET'], {}, ['BOMB']);
    for (let i = 0; i < 5; i++) {
      const r = castNext(w);
      expect(ids(r.root)).toEqual(['bomb', 'spark_bolt']);
    }
  });

  it('an Always Cast multicast draws from the deck', () => {
    const r = wand(['LIGHT_BULLET', 'LIGHT_BULLET', 'LIGHT_BULLET'], {}, ['BURST_2']).cast(rng);
    expect(r.root.projectiles).toHaveLength(3);
  });

  it('an Always Cast trigger never fires a payload', () => {
    const r = wand(['RUBBER_BALL'], {}, ['LIGHT_BULLET_TRIGGER']).cast(rng);
    expect(r.root.projectiles[0].trigger!.payload.projectiles).toEqual([]);
    expect(ids(r.root)).toEqual(['spark_bolt', 'bouncing_burst']);
  });
});

// ---------------------------------------------------------------------------- wand object

describe('Wand object', () => {
  it('refreshDeck picks up inventory edits; clone is independent', () => {
    const w = wand(['LIGHT_BULLET', 'RUBBER_BALL']);
    castNext(w);
    const c = w.clone();
    expect(ids(castNext(c).root)).toEqual(['bouncing_burst']);
    expect(ids(castNext(w).root)).toEqual(['bouncing_burst']);
    w.spells[1] = inst('SPITTER');
    w.spells.push(null);
    w.refreshDeck();
    expect(w.deckPreview()).toEqual(['LIGHT_BULLET', 'SPITTER']);
    expect(w.capacity).toBe(26);
  });

  it('defaultShotState is neutral', () => {
    const s = defaultShotState();
    expect(s.speedMult).toBe(1);
    expect(s.fireRateWait).toBe(0);
    expect(s.extra).toEqual([]);
  });
});

// ---------------------------------------------------------------------------- data integrity

describe('spell and projectile data', () => {
  it('spell ids are unique and every referenced projectile exists', () => {
    expect(new Set(SPELL_LIST.map((s) => s.id)).size).toBe(SPELL_LIST.length);
    expect(SPELL_LIST.length).toBeGreaterThanOrEqual(55);
    for (const def of SPELL_LIST) {
      for (const p of spellProjectileIds(def)) expect(PROJECTILES[p], `${def.id} -> ${p}`).toBeDefined();
      expect(def.spawnTiers.length, def.id).toBe(def.spawnWeights.length);
      for (const t of def.spawnTiers) expect(t >= 0 && t <= 6, def.id).toBe(true);
      expect(Object.keys(def.stats).length, def.id).toBeGreaterThan(0);
    }
  });

  it('every projectile has sane units and allowed sounds', () => {
    const cast = new Set(['cast_spark', 'cast_generic', 'cast_heavy', 'cast_fire', 'cast_bomb', 'cast_dig', 'cast_electric', 'cast_ice', 'cast_heal', 'cast_teleport', 'cast_material']);
    const hit = new Set(['impact_small', 'impact_dirt', 'explosion_small', 'explosion_big', 'electric_zap', 'freeze', 'glass_break', 'water_splash']);
    for (const p of Object.values(PROJECTILES)) {
      expect(cast.has(p.castSound), p.id).toBe(true);
      if (p.hitSound) expect(hit.has(p.hitSound), p.id).toBe(true);
      expect(p.speed[0] <= p.speed[1], p.id).toBe(true);
      expect(p.lifetime[0] <= p.lifetime[1], p.id).toBe(true);
      expect(p.visual.color, p.id).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('can run every spell in a real wand without throwing', () => {
    for (const def of SPELL_LIST) {
      const w = wand([def.id, 'LIGHT_BULLET', 'LIGHT_BULLET', 'LIGHT_BULLET', 'LIGHT_BULLET', 'LIGHT_BULLET', 'LIGHT_BULLET'], { manaMax: 10000 });
      const r = w.cast(rng);
      expect(r.drawn[0], def.id).toBe(def.id);
    }
  });
});

// ---------------------------------------------------------------------------- wand generation

describe('wand generation', () => {
  it('starter wand matches the Noita ranges', () => {
    for (let seed = 1; seed < 200; seed++) {
      const { stats: s, spells } = starterWand(mulberry32(seed));
      expect(s.shuffle).toBe(false);
      expect(s.actionsPerRound).toBe(1);
      expect(s.castDelay).toBeGreaterThanOrEqual(9);
      expect(s.castDelay).toBeLessThanOrEqual(15);
      expect(s.rechargeTime).toBeGreaterThanOrEqual(20);
      expect(s.rechargeTime).toBeLessThanOrEqual(28);
      expect(s.manaMax).toBeGreaterThanOrEqual(80);
      expect(s.manaMax).toBeLessThanOrEqual(130);
      expect([2, 3]).toContain(s.capacity);
      expect(spells.length).toBeGreaterThanOrEqual(1);
      expect(spells.length).toBeLessThanOrEqual(s.capacity);
      expect(new Set(spells.map((x) => x.id)).size).toBe(1);
      expect(['LIGHT_BULLET', 'RUBBER_BALL', 'SLOW_BULLET', 'SPITTER']).toContain(spells[0].id);
    }
  });

  it('starter bomb wand: one explosive, always a Bomb on the first run', () => {
    expect(starterBombWand(mulberry32(3), true).spells.map((s) => s.id)).toEqual(['BOMB']);
    const seen = new Set<string>();
    for (let seed = 1; seed < 300; seed++) {
      const g = starterBombWand(mulberry32(seed));
      expect(g.stats.capacity).toBe(1);
      expect(g.stats.shuffle).toBe(true);
      expect(g.spells).toHaveLength(1);
      seen.add(g.spells[0].id);
    }
    expect([...seen].sort()).toEqual(['BOMB', 'DYNAMITE', 'GRENADE', 'MINE', 'ROCKET']);
  });

  it('generated wands are valid, castable, and improve with tier', () => {
    const avg = (tier: number, f: (s: WandStats) => number) => {
      let sum = 0;
      for (let seed = 1; seed <= 200; seed++) sum += f(generateWand(mulberry32(seed * 7 + tier), tier).stats);
      return sum / 200;
    };
    for (let tier = 1; tier <= 6; tier++) {
      for (let seed = 1; seed <= 50; seed++) {
        const g = generateWand(mulberry32(seed * 31 + tier), tier, { forceSpells: true });
        expect(g.spells.length).toBeGreaterThan(0);
        expect(g.spells.length).toBeLessThanOrEqual(g.stats.capacity);
        expect(g.stats.actionsPerRound).toBeLessThanOrEqual(g.stats.capacity);
        for (const s of g.spells) {
          expect(SPELLS[s.id]).toBeDefined();
          expect(['projectile', 'static', 'modifier', 'multicast']).toContain(SPELLS[s.id].type);
        }
        expect(g.stats.name.length).toBeGreaterThan(0);
        const w = new Wand(g.stats, g.spells, g.alwaysCast);
        w.cast(mulberry32(seed));
      }
    }
    expect(avg(6, (s) => s.manaMax)).toBeGreaterThan(avg(1, (s) => s.manaMax) * 2);
    expect(avg(6, (s) => s.capacity)).toBeGreaterThan(avg(1, (s) => s.capacity));
    expect(avg(6, (s) => s.actionsPerRound)).toBeGreaterThan(1.5);
    expect(avg(1, (s) => s.actionsPerRound)).toBe(1);
  });

  it('tier 1 wands mostly use the Mines templates; forced shuffle is honoured', () => {
    let templ = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const g = generateWand(mulberry32(seed), 1, { shuffle: false });
      expect(g.stats.shuffle).toBe(false);
      if (MINES_WAND_TEMPLATES.some((t) => t.capacity === g.stats.capacity && t.manaMax === g.stats.manaMax && t.castDelay === g.stats.castDelay)) templ++;
    }
    expect(templ / 300).toBeGreaterThan(0.8);
  });

  it('randomSpell respects spawn tiers', () => {
    const r = mulberry32(99);
    for (let i = 0; i < 300; i++) {
      const id = randomSpell(r, 0);
      expect(SPELLS[id].spawnTiers).toContain(0);
      expect(['BLACK_HOLE', 'LIGHTNING', 'DEATH_CROSS', 'LUMINOUS_DRILL', 'SEA_LAVA']).not.toContain(id);
    }
    const counts: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const id = randomSpell(r, 0, (d) => d.type === 'projectile');
      counts[id] = (counts[id] ?? 0) + 1;
    }
    // Spark bolt has the highest tier-0 weight (2).
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    expect(top).toBe('LIGHT_BULLET');
  });

  it('prices and names', () => {
    expect(spellPrice('LIGHT_BULLET', 1)).toBe(100);
    expect(spellPrice('BLACK_HOLE', 3)).toBeGreaterThan(spellPrice('LIGHT_BULLET', 3));
    expect(spellPrice('LIGHT_BULLET', 6)).toBeGreaterThan(spellPrice('LIGHT_BULLET', 1));
    const t1 = generateWand(mulberry32(5), 1).stats;
    const t6 = generateWand(mulberry32(5), 6).stats;
    expect(wandPrice(t1)).toBeGreaterThanOrEqual(50);
    expect(wandName(t6)).toMatch(/^\w+ \w+$/);
  });
});
