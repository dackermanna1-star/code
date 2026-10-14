// Chapter flow, boarding, time of day, game over, victory; economy and rewards.
import { describe, expect, it } from 'vitest';
import { CHAPTERS, SPLASH_SECONDS, BETWEEN_SECONDS } from '../src/config/chapters';
import { ESCAPE_X, TICK_RATE } from '../src/config/world';
import { FAVOUR, FEEL, MONEY } from '../src/config/rules';
import { World } from '../src/core/World';
import { Bot } from '../src/core/Bot';
import { aimLane, arm, depthFor, hold, quiet, record, run, shoot, until } from './helpers';

describe('chapter flow', () => {
  it('splash → playing → boss → between → next chapter … → victory', () => {
    const w = new World({ seed: 3, god: true });
    const ev: string[] = [];
    for (const n of ['chapterSplash', 'chapterStart', 'bossSpawn', 'chapterComplete', 'victory'] as const) {
      w.events.on(n, (e) => ev.push(`${n}:${'num' in e ? e.num : ''}`));
    }
    const splash = record(w, 'chapterSplash');
    w.step();
    expect(splash[0]).toEqual({ num: 1, name: 'Last Light', clock: '18:40' });
    expect(w.phase).toBe('splash');
    run(w, SPLASH_SECONDS);
    expect(w.phase).toBe('playing');
    for (let ch = 1; ch <= 3; ch++) {
      w.skipToBoss();
      until(w, () => w.phase === 'boss', 1);
      expect(w.bossLife).not.toBeNull();
      w.clearZombies();
      for (const b of w.level.bosses) b.life = 0;
      until(w, () => w.phase !== 'boss', 30);
      // Marathon runners still to come are spawned and must be beaten too.
      while (w.phase === 'boss') {
        for (const b of w.level.bosses) b.life = 0;
        run(w, 0.5);
      }
      expect(w.phase).toBe('between');
      expect(w.bossLife).toBeNull();
      run(w, BETWEEN_SECONDS + 0.02);
      if (ch < 3) {
        expect(w.phase).toBe('splash');
        expect(w.chapter).toBe(ch + 1);
        expect(w.hornReady).toBe(true);
        expect(w.crane.state).toBe('hanging');
        run(w, SPLASH_SECONDS);
      }
    }
    expect(w.phase).toBe('victory');
    expect(w.timeOfDay).toBe(1);
    expect(ev).toEqual([
      'chapterSplash:1', 'chapterStart:1', 'bossSpawn:1', 'chapterComplete:1',
      'chapterSplash:2', 'chapterStart:2', 'bossSpawn:2', 'chapterComplete:2',
      'chapterSplash:3', 'chapterStart:3', 'bossSpawn:3', 'chapterComplete:3', 'victory:',
    ]);
  });

  it('the boarding queue fills with the spawn phase; time of day follows it', () => {
    const w = new World({ seed: 9, god: true });
    const boarding = record(w, 'boarding');
    const def = CHAPTERS[0];
    run(w, SPLASH_SECONDS);
    expect(w.phase).toBe('playing');
    run(w, def.spawnSeconds / 2);
    expect(w.boarded).toBeCloseTo(def.passengers / 2, -1);
    expect(w.timeOfDay).toBeCloseTo((def.timeOfDay[0] + def.timeOfDay[1]) / 2, 1);
    run(w, def.spawnSeconds / 2 + 1);
    expect(w.boarded).toBe(def.passengers);
    expect(boarding.at(-1)).toEqual({ boarded: def.passengers, total: def.passengers });
    expect(boarding[0]).toEqual({ boarded: 0, total: def.passengers });
    const w3 = new World({ seed: 9, startChapter: 3, skipSplash: true, god: true });
    expect(w3.timeOfDay).toBeCloseTo(CHAPTERS[2].timeOfDay[0], 5);
  });

  it('a zombie past ESCAPE_X ends the game (gangway); god mode just removes it', () => {
    const w = quiet();
    const over = record(w, 'gameOver');
    const z = w.spawn('shambler', ESCAPE_X - 0.5, -4);
    z.speed = 2;
    until(w, () => w.gameEnded, 3);
    expect(over).toEqual([{ reason: 'gangway', zombieId: z.id }]);
    expect(w.describeGameOver()).toMatch(/gangway/);
    const g = quiet({ god: true });
    const z2 = g.spawn('shambler', ESCAPE_X - 0.5, -4);
    z2.speed = 2;
    run(g, 2);
    expect(g.gameEnded).toBe(false);
    expect(z2.removed).toBe(true);
  });

  it('bodies and their rise timers carry over between chapters (the timers hold during the break)', () => {
    const w = new World({ seed: 4, god: true, skipSplash: true });
    const c = w.addCorpse('shambler', -3, 1, { risesIn: 30 });
    const left = () => c.risesAt! - w.tick;
    w.skipToBoss();
    until(w, () => w.phase === 'boss', 1);
    w.clearZombies();
    for (const b of w.level.bosses) b.life = 0;
    until(w, () => w.phase === 'between', 2);
    const atBreak = left();
    until(w, () => w.phase === 'playing' && w.chapter === 2, 10);
    expect(w.corpses).toContain(c);
    // Between chapters and during the next chapter's title the dead rest.
    expect(left()).toBeGreaterThanOrEqual(atBreak - 1);
    expect(c.twitching).toBe(false);
  });

  it('a god-mode bot plays the whole game to victory', () => {
    const w = new World({ seed: 21, god: true });
    const bot = new Bot(w.player, { skill: 0.9 });
    const victory = record(w, 'victory');
    for (let i = 0; i < TICK_RATE * 60 * 14 && !w.gameEnded; i++) {
      bot.think(w);
      w.step();
    }
    expect(victory).toHaveLength(1);
    expect(w.player.kills).toBeGreaterThan(200);
  }, 60000);
});

describe('economy & rewards', () => {
  it('bounties go to the killer; a headshot kill adds $15 and +3 Favour', () => {
    const w = quiet();
    aimLane(w, 0, 6);
    const z = hold(w.spawn('shambler', 3.5, depthFor(0, 1.62)));
    const money = record(w, 'money');
    shoot(w);
    expect(z.deathKind).toBe('headshot');
    expect(money.map((m) => [m.reason, m.amount])).toEqual([
      ['bounty', z.bounty],
      ['headshot', MONEY.headshotBonus],
    ]);
    expect(w.player.money).toBe(z.bounty + MONEY.headshotBonus);
    expect(w.favour).toBe(FAVOUR.kill + FAVOUR.headshot);
  });

  it('nice shot: 3+ kills by one trigger pull pay $25 × (n−2) × chapter and fill the Favour; slow motion only for a massacre', () => {
    const w = quiet({ startChapter: 2 });
    arm(w, 'harpoon');
    aimLane(w, 0, 16);
    for (let i = 0; i < 4; i++) hold(w.spawn('shambler', 6 - i * 1.5, 0));
    const nice = record(w, 'niceShot');
    const money = record(w, 'money');
    const slow = record(w, 'slowmo');
    shoot(w);
    expect(nice).toEqual([{ playerId: 0, n: 4, source: 'shot' }]);
    expect(money.find((m) => m.reason === 'nice')!.amount).toBe(25 * 2 * 2);
    expect(slow).toEqual([]);
    expect(w.favour).toBe(4 * FAVOUR.kill + FAVOUR.nice);
  });

  it('slow motion: a MASSACRE (6+) or a set piece, at most once per cooldown; boss deaths always', () => {
    const w = quiet();
    const p = w.player;
    const slow = record(w, 'slowmo');
    const six = Array.from({ length: FEEL.massacre }, (_, i) => w.spawn('shambler', -5 - i, 0));
    w.combat.reward(p, six.slice(0, 5));
    expect(slow).toHaveLength(0);
    w.combat.reward(p, six);
    expect(slow).toEqual([FEEL.niceSlowmo]);
    // Within the cooldown: no second one, not even for a crane drop.
    run(w, FEEL.slowmoCooldown - 0.5);
    w.combat.reward(p, six.slice(0, 3), 'crane');
    expect(slow).toHaveLength(1);
    run(w, 0.6);
    w.combat.reward(p, six.slice(0, 3), 'gas');
    expect(slow).toHaveLength(2);
    // A boss death ignores the cooldown.
    const dave = w.spawn('bigdave', -10, 0, { boss: true });
    dave.damage({ damage: 1e6, part: 'body', point: { x: dave.x, y: 1.5, z: 0 }, dirX: -1, dirZ: 0, source: 'bullet', player: p, weapon: 'revolver' });
    w.resolveDeaths();
    expect(slow.at(-1)).toEqual(FEEL.bossSlowmo);
  });

  it('three headshot kills in a row: a HEADSHOT ×3 streak; each headshot kill asks for a 45 ms hit-stop', () => {
    const w = quiet();
    aimLane(w, 0, 6);
    const streak = record(w, 'headshotStreak');
    const stop = record(w, 'hitstop');
    for (let i = 0; i < 3; i++) {
      hold(w.spawn('shambler', 3.5, depthFor(0, 1.62)));
      shoot(w);
    }
    expect(streak).toEqual([{ playerId: 0, n: 3 }]);
    expect(stop.filter((s) => s.ms === FEEL.hitstopHeadshot)).toHaveLength(3);
  });

  it('kills by fire are credited to whoever lit it', () => {
    const w = quiet();
    const z = hold(w.spawn('shambler', -10, 0));
    z.life = 10;
    z.ignite(w.player);
    run(w, 1.2);
    expect(z.dead).toBe(true);
    expect(w.player.kills).toBe(1);
    expect(w.player.money).toBe(z.bounty);
  });
});
