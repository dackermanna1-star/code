// Pacing and economy rules from the review round: the spawn crescendo, gas
// explosions as nice shots, the deck gun not refilling its own meter, stomp
// economics, honest end-of-run stats, and chapter retries keeping the arsenal.
import { describe, expect, it } from 'vitest';
import { CHAPTERS, KIND_FROM, PACKS, RAMP } from '../src/config/chapters';
import { FAVOUR, GAS, HUNTER_RULES, MONEY, REANIMATION } from '../src/config/rules';
import { TICK_RATE } from '../src/config/world';
import { Bot } from '../src/core/Bot';
import { botSkill } from '../src/core/Bot';
import { rampInverse } from '../src/core/Chapter';
import { World } from '../src/core/World';
import { aimLane, arm, hold, quiet, record, run, shoot } from './helpers';

describe('the spawn crescendo', () => {
  it('rampInverse is the inverse CDF of a density rising from base to base + slope', () => {
    expect(rampInverse(0)).toBeCloseTo(0, 9);
    expect(rampInverse(1)).toBeCloseTo(1, 9);
    // Half the spawns come after the middle of the phase … more than half of the time is gone by then.
    expect(rampInverse(0.5)).toBeGreaterThan(0.55);
    const a = RAMP.base;
    const b = RAMP.slope;
    for (const u of [0.2, 0.5, 0.8]) {
      const q = (a * u + (b * u * u) / 2) / (a + b / 2);
      expect(rampInverse(q)).toBeCloseTo(u, 9);
    }
  });

  for (const def of CHAPTERS) {
    it(`chapter ${def.num}: pressure builds to the boss — totals kept, quiet start, packs only later, busiest at the end`, () => {
      const thirds = [0, 0, 0];
      let packsEarly = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const w = new World({ seed, startChapter: def.num, skipSplash: true, god: true });
        const q = w.level.queue;
        // Totals per kind as the chapter table says.
        for (const [kind, n] of def.spawns) expect(q.filter((e) => e.kind === kind)).toHaveLength(n);
        const T = w.level.spawnTicks;
        for (const e of q) thirds[Math.min(2, Math.floor((3 * e.at) / T))]++;
        // Late kinds don't turn up before their start.
        for (const e of q) {
          const from = def.from?.[e.kind] ?? KIND_FROM[e.kind] ?? 0;
          expect(e.at).toBeGreaterThanOrEqual(Math.floor(from * T) - 1);
        }
        // Surges (two of a kind within 1.2 s) only from PACKS.from on (allowing the odd pair by chance).
        const sh = q.filter((e) => e.kind === 'shambler').map((e) => e.at);
        for (let i = 1; i < sh.length; i++) if (sh[i] - sh[i - 1] < 1.2 * TICK_RATE && sh[i] < (PACKS.shambler!.from - 0.05) * T) packsEarly++;
      }
      expect(thirds[0]).toBeLessThan(thirds[1]);
      expect(thirds[1]).toBeLessThan(thirds[2]);
      expect(thirds[2]).toBeGreaterThan(1.6 * thirds[0]);
      expect(packsEarly).toBeLessThan(12 * 2);
    });
  }

  it('chapter 1 opens gently: a few lone shamblers in the first 10 s', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = new World({ seed, skipSplash: true, god: true });
      const early = w.level.queue.filter((e) => e.at < 10 * TICK_RATE);
      expect(early.length).toBeGreaterThanOrEqual(1);
      expect(early.length).toBeLessThanOrEqual(5);
      expect(early.every((e) => e.kind === 'shambler')).toBe(true);
    }
  });
});

describe('rewards and the meter', () => {
  it('a flare into a bloater’s gas: the explosion is a nice shot (GAS!), paid to whoever lit it', () => {
    const w = quiet();
    arm(w, 'flare');
    aimLane(w, 0, 16);
    w.hazards.addGas(2, 0, GAS.radius, GAS.seconds, null);
    for (const [x, z] of [[1.5, 0.6], [2.5, -0.5], [2, 1.2], [1, -1]]) hold(w.spawn('shambler', x, z));
    const nice = record(w, 'niceShot');
    const money0 = w.player.money;
    shoot(w);
    run(w, 1);
    expect(nice[0]).toMatchObject({ source: 'gas' });
    expect(nice[0].n).toBeGreaterThanOrEqual(3);
    expect(w.player.money - money0).toBeGreaterThanOrEqual(w.niceShotBonus(nice[0].n));
  });

  it('the deck gun does not refill its own meter: its kills and its nice shot add no Favour', () => {
    const w = quiet();
    w.setFavour(100);
    const p = w.player;
    for (let i = 0; i < 6; i++) hold(w.spawn('shambler', -6 + (i % 3) * 0.7, p.z + (i < 3 ? 0.4 : -0.4)));
    const nice = record(w, 'niceShot');
    p.input.cannon = true;
    w.step();
    p.input.cannon = false;
    run(w, 3);
    expect(nice.some((n) => n.source === 'cannon')).toBe(true);
    expect(w.favour).toBe(0);
  });

  it('stomp economics: finishing a downed body pays more than kicking the crawler it becomes; only finished bodies count as stomped', () => {
    expect(MONEY.tidy).toBeGreaterThan(REANIMATION.crawlerBounty);
    expect(HUNTER_RULES.stompReachX).toBeGreaterThanOrEqual(1.1);
    const w = quiet();
    const p = w.player;
    // A jump on empty planks.
    p.input.jump = true;
    w.step();
    p.input.jump = false;
    run(w, 1);
    expect(p.stats.stomps).toBe(0);
    // A body a step to the side is still in reach.
    const c = w.addCorpse('shambler', p.x + 0.9, p.z + 0.5, { risesIn: 10 });
    const money0 = p.money;
    p.input.jump = true;
    w.step();
    p.input.jump = false;
    run(w, 1);
    expect(c.risesAt).toBeNull();
    expect(p.stats.stomps).toBe(1);
    expect(p.money - money0).toBe(MONEY.tidy);
    expect(w.favour).toBe(FAVOUR.tidy);
  });

  it('the run’s stats add up: KILLS = the kinds put down + the crawlers', () => {
    const w = new World({ seed: 9, god: true });
    const bot = new Bot(w.player, { skill: 0.95 });
    for (let i = 0; i < 90 * TICK_RATE; i++) {
      bot.think(w);
      w.step();
    }
    const s = w.player.stats;
    const byKind = Object.values(s.killsByKind).reduce((a, b) => a + (b ?? 0), 0);
    expect(s.kills).toBeGreaterThan(20);
    expect(byKind + s.risenKills).toBe(s.kills);
  }, 30000);
});

describe('retry and skill', () => {
  it('a chapter retry starts with the money and the guns the chapter began with', () => {
    const w = new World({ startChapter: 2, money: 2400, weapons: ['revolver', 'nailgun', 'shotgun'], weapon: 'nailgun' });
    const p = w.player;
    expect(w.chapter).toBe(2);
    expect(p.money).toBe(2400);
    expect([...p.owned.keys()]).toEqual(['revolver', 'nailgun', 'shotgun']);
    expect(p.weapon.id).toBe('nailgun');
  });

  it('the bot’s skill is a real knob: reaction, aim error and buying all get worse as it drops', () => {
    const hi = botSkill(1);
    const mid = botSkill(0.9);
    const lo = botSkill(0.8);
    expect(hi.noise).toBe(0);
    expect(mid.reaction).toBeGreaterThan(hi.reaction);
    expect(lo.reaction).toBeGreaterThan(mid.reaction);
    expect(lo.noise).toBeGreaterThan(mid.noise);
    expect(lo.buyDelay).toBeGreaterThan(mid.buyDelay);
    expect(lo.headAim).toBeLessThan(mid.headAim);
  });
});
