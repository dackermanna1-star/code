// Bot smoke test, determinism, performance.
import { describe, expect, it } from 'vitest';
import { World } from '../src/core/World';
import { Bot } from '../src/core/Bot';
import { TICK_RATE } from '../src/config/world';
import type { ZombieKind } from '../src/config/ids';

function play(seed: number, seconds: number): { w: World; trace: string } {
  const w = new World({ seed });
  const bot = new Bot(w.player, { skill: 0.9 });
  const trace: string[] = [];
  w.events.on('zombieDeath', (e) => trace.push(`${w.tick}:${e.zombieId}:${e.deathKind}`));
  w.events.on('buy', (e) => trace.push(`${w.tick}:buy:${e.weapon}`));
  for (let i = 0; i < seconds * TICK_RATE && !w.gameEnded; i++) {
    bot.think(w);
    w.step();
  }
  return { w, trace: trace.join(',') };
}

describe('bot & simulation', () => {
  it('a skill-0.9 bot plays chapter 1: kills, buys, earns, uses the pier', () => {
    const { w } = play(1002, 200);
    const s = w.player.stats;
    expect(s.kills).toBeGreaterThan(60);
    expect(s.bought).toContain('nailgun');
    expect(s.earned).toBeGreaterThan(2500);
    expect(s.craneDrops + s.horns + s.cannonStrikes).toBeGreaterThan(0);
    expect(w.chapter > 1 || w.phase === 'between' || w.phase === 'gameover').toBe(true);
  });

  it('is deterministic for a seed', () => {
    const a = play(77, 60).trace;
    const b = play(77, 60).trace;
    const c = play(78, 60).trace;
    expect(a.length).toBeGreaterThan(100);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('200 zombies and 300 bodies tick well under 1 ms', () => {
    const w = new World({ seed: 1, quiet: true, skipSplash: true, god: true });
    const kinds: ZombieKind[] = ['shambler', 'shambler', 'shambler', 'jogger', 'bloater', 'riot'];
    for (let i = 0; i < 300; i++) w.addCorpse('shambler', w.rng.range(-26, 18), w.rng.range(-5, 5), { risesIn: 1000 });
    for (let i = 0; i < 200; i++) {
      const z = w.spawn(kinds[i % kinds.length], w.rng.range(-28, 10), w.rng.range(-4.6, 4.6));
      z.speed *= 0.1; // keep them on the deck for the whole measurement
    }
    for (let i = 0; i < 30; i++) w.zombies[i * 5].ignite(null);
    w.player.input.fire = true;
    for (let i = 0; i < 50; i++) w.step(); // warm up
    // Best of several batches: other test files run in parallel threads and steal CPU.
    let ms = Infinity;
    for (let b = 0; b < 6; b++) {
      const t0 = performance.now();
      for (let i = 0; i < 60; i++) w.step();
      ms = Math.min(ms, (performance.now() - t0) / 60);
    }
    expect(w.zombies.length).toBeGreaterThan(120); // some burned to death on the way
    expect(w.corpses.length).toBeGreaterThan(250);
    expect(ms).toBeLessThan(1);
  });
});
