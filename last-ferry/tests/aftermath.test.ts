// The departure sequence: after victory the pier keeps living (World.aftermath)
// while the ferry pulls away — and nothing can end the game any more.
import { describe, expect, it } from 'vitest';
import { PIER } from '../src/config/world';
import { World } from '../src/core/World';
import { Bot } from '../src/core/Bot';
import { record, run, until } from './helpers';

/** A world that has just won (chapter 3 beaten). */
function won(seed = 5): World {
  const w = new World({ seed, startChapter: 3, skipSplash: true, money: 20000 });
  w.skipToBoss();
  until(w, () => w.phase === 'boss', 2);
  w.clearZombies();
  for (const b of w.level.bosses) b.life = 0;
  until(w, () => w.phase === 'victory', 10);
  expect(w.phase).toBe('victory');
  return w;
}

describe('aftermath (victory departure)', () => {
  it('is off by default: a won world is frozen', () => {
    const w = won();
    const t = w.tick;
    run(w, 1);
    expect(w.tick).toBe(t);
  });

  it('keeps simulating: stragglers arrive and walk on; nothing ends the game', () => {
    const w = won();
    w.aftermath = true;
    const over = record(w, 'gameOver');
    const spawns = record(w, 'spawn');
    const t = w.tick;
    run(w, 6);
    expect(w.tick).toBe(t + 300);
    expect(spawns.length).toBeGreaterThanOrEqual(2);
    expect(w.zombies.some((z) => z.alive && z.distance > 1)).toBe(true);
    expect(w.phase).toBe('victory');
    expect(over).toHaveLength(0);
  });

  it('the dead who reach the end of the pier walk off it into the sea', () => {
    const w = won();
    w.aftermath = true;
    const deaths = record(w, 'zombieDeath');
    const zb = w.spawn('shambler', 21.4, 0.2, { life: 999 });
    until(w, () => !zb.alive, 6);
    expect(zb.alive).toBe(false);
    const d = deaths.find((e) => e.zombieId === zb.id)!;
    expect(d.deathKind).toBe('drown');
    expect(d.corpseId).toBeNull();
    expect(d.point.x).toBeGreaterThan(PIER.maxX - 0.4);
    expect(w.phase).toBe('victory');
  });

  it('the Bosun cannot die after the ferry has left; the bot keeps fighting', () => {
    const w = won();
    w.aftermath = true;
    const p = w.player;
    const bot = new Bot(p, { skill: 0.9 });
    const deaths = record(w, 'playerDeath');
    for (let i = 0; i < 4; i++) w.spawn('shambler', p.x - 0.6, p.z, { life: 5000 });
    for (let i = 0; i < 50 * 8; i++) {
      bot.think(w);
      w.step();
    }
    expect(deaths).toHaveLength(0);
    expect(p.alive).toBe(true);
    expect(p.stats.shots).toBeGreaterThan(0);
  });
});
