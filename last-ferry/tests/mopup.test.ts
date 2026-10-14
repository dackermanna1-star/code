// The end of a chapter: bosses down → mop up the stragglers → PIER HELD. The
// pier is never "held" while something can still reach the gangway, and
// nothing can end the run during the break between chapters.
import { describe, expect, it } from 'vitest';
import { MOPUP_CRAWLER_X } from '../src/config/chapters';
import { ESCAPE_X } from '../src/config/world';
import { World } from '../src/core/World';
import type { Zombie } from '../src/core/Zombie';
import { record, run, until } from './helpers';

function bossWorld(chapter: number, seed = 5): World {
  const w = new World({ seed, startChapter: chapter, skipSplash: true });
  w.skipToBoss();
  until(w, () => w.phase === 'boss', 1);
  w.step();
  return w;
}

function kill(w: World, z: Zombie): void {
  z.damage({ damage: z.life + 1e5, part: 'body', point: { x: z.x, y: 1, z: z.z }, dirX: -1, dirZ: 0, source: 'bullet', player: w.player, weapon: 'revolver' });
  w.resolveDeaths();
}

describe('mop-up', () => {
  it('Big Dave dies near the gangway: no PIER HELD while his crawlers live; the HUD counts them; killing them holds the pier', () => {
    const w = bossWorld(1);
    const dave = w.level.bosses[0];
    for (const z of w.zombies) if (z !== dave) z.removed = true; // just Dave and what he spills
    w.step();
    dave.x = 15.5;
    w.player.x = 20.5; // out of kicking range
    w.player.z = 5;
    const done = record(w, 'chapterComplete');
    const mop = record(w, 'mopUp');
    kill(w, dave);
    w.step();
    expect(done).toHaveLength(0);
    expect(mop).toHaveLength(1);
    expect(mop[0].left).toBeGreaterThanOrEqual(6);
    expect(w.mopUp).toBe(true);
    expect(w.phase).toBe('boss');
    expect(w.stragglers).toBe(mop[0].left);
    expect(w.stragglersMax).toBe(mop[0].left);
    // No more escorts once the boss is down.
    const spawns = record(w, 'spawn');
    run(w, 6);
    expect(spawns.filter((s) => !s.risen)).toHaveLength(0);
    for (const z of [...w.zombies]) if (z.alive) kill(w, z);
    w.step();
    expect(done).toEqual([{ num: 1 }]);
    expect(w.phase).toBe('between');
  });

  it('the GAMEPLAY-2 repro: kill Dave at x 15.5 and stand still — the run can be lost, but never after PIER HELD', () => {
    const w = bossWorld(1);
    const dave = w.level.bosses[0];
    dave.x = 15.5;
    const order: string[] = [];
    w.events.on('chapterComplete', () => order.push('held'));
    w.events.on('gameOver', () => order.push('over'));
    w.player.x = 2; // out of the way: nobody kicks the crawlers
    kill(w, dave);
    until(w, () => w.gameEnded || w.chapter === 2, 90);
    if (order.includes('held')) expect(order).toEqual(['held']);
    else expect(order).toEqual(['over']);
    // And the spilled crawler is named for what it is.
    if (w.gameOverInfo?.spilled) expect(w.describeGameOver()).toMatch(/Big Dave/);
  });

  it('crawlers far back (x ≤ MOPUP_CRAWLER_X) do not hold up the end: they carry over and cannot reach the gangway during the break', () => {
    const w = bossWorld(2);
    w.clearZombies();
    const far = w.spawn('shambler', MOPUP_CRAWLER_X - 0.5, 1, { risen: true });
    const pace = far.speed;
    far.speed = 0;
    for (const b of w.level.bosses) b.life = 0;
    w.resolveDeaths();
    // The Marathon: let the rest of the runners out and down.
    until(w, () => {
      for (const z of w.zombies) if (z.alive && z.isBoss) kill(w, z);
      return w.level.bossesBeaten;
    }, 60);
    far.speed = Math.max(pace, 0.75);
    until(w, () => w.phase === 'between', 2);
    expect(far.alive).toBe(true);
    until(w, () => w.chapter === 3 && w.phase === 'playing', 10);
    expect(w.gameEnded).toBe(false);
    expect(far.x).toBeLessThan(ESCAPE_X - 10);
  });

  it('during the break nothing hurts the Bosun and no body rises', () => {
    const w = bossWorld(1);
    w.clearZombies();
    for (const b of w.level.bosses) b.life = 0;
    w.resolveDeaths();
    for (const z of [...w.zombies]) if (z.alive) kill(w, z);
    const c = w.addCorpse('shambler', 10, 0, { risesIn: 0.5 });
    until(w, () => w.phase === 'between', 2);
    const rises = record(w, 'corpseRise');
    const life = w.player.life;
    w.player.hurt(500, 'blast');
    w.hazards.addGas(w.player.x, w.player.z, 2.5, 4, null);
    until(w, () => w.phase === 'splash', 5);
    until(w, () => w.phase === 'playing', 5);
    expect(w.player.life).toBe(life);
    expect(w.gameEnded).toBe(false);
    expect(rises).toHaveLength(0);
    expect(c.risesAt).not.toBeNull();
  });
});
