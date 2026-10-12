import { describe, expect, it } from 'vitest';
import { World } from '../../src/core/World';
import { Bot } from '../../src/core/Bot';
import { LEVELS } from '../../src/config/levels';

describe('bot simulation', () => {
  it('plays level 1 to the boss without exceptions and earns money', () => {
    const w = new World({ seed: 42 });
    const bot = new Bot(w.player, { skill: 1 });
    let deaths = 0;
    w.events.on('enemyDeath', () => deaths++);
    for (let i = 0; i < 50 * 70 && !w.gameEnded; i++) {
      bot.think(w);
      w.step();
    }
    expect(deaths).toBeGreaterThan(10);
    expect(w.player.stats.moneyEarned).toBeGreaterThan(500);
  });

  it('every level can start and spawn its bosses', () => {
    for (const def of LEVELS) {
      const w = new World({ seed: def.num, startLevel: def.num });
      w.gameOver = () => {};
      let bosses = 0;
      w.events.on('enemySpawn', (e) => {
        if (e.boss) bosses++;
      });
      // Remove regular enemies as they spawn so "boss alone" levels can proceed.
      for (let i = 0; i < 104 + def.ticks + 60; i++) {
        w.step();
        for (const e of w.enemies) if (!e.isBoss) e.removed = true;
      }
      expect(bosses).toBe(def.bosses.length);
    }
  });
});
