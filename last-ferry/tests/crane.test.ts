// The cargo crane is a deliberate play: only a shot fired while the gun line
// is lined up with the hook block (its lane ± CRANE.laneBand) cuts the rope.
// Stray rounds at zombies in other lanes never do, a crowd standing under the
// pallet can't shield the hook, and the bot drops it on purpose.
import { describe, expect, it } from 'vitest';
import { CRANE, HUNTER } from '../src/config/world';
import { MUZZLE_Z } from '../src/config/weapons';
import { Bot } from '../src/core/Bot';
import { Pier } from '../src/core/Pier';
import { World } from '../src/core/World';
import { aimLane, arm, hold, quiet, record, run, shoot, until } from './helpers';

const lane = () => Pier.hookLane(HUNTER.muzzleHeight);

describe('the crane', () => {
  it('lined up with the hook (± laneBand): the shot cuts the rope; just outside the band it does not', () => {
    for (const off of [0, CRANE.laneBand * 0.9, -CRANE.laneBand * 0.9]) {
      const w = quiet();
      aimLane(w, lane() + off, 10);
      expect(w.pier.hookLined(w.player.muzzle())).toBe(true);
      expect(w.combat.lineTrace(w.player).kind).toBe('hook');
      const crane = record(w, 'crane');
      shoot(w);
      expect(crane.map((c) => c.state)).toEqual(['falling']);
    }
    for (const off of [CRANE.laneBand + 0.05, -(CRANE.laneBand + 0.05), 0.6, -0.6]) {
      const w = quiet();
      aimLane(w, lane() + off, 10);
      expect(w.pier.hookLined(w.player.muzzle())).toBe(false);
      expect(w.combat.lineTrace(w.player).kind).not.toBe('hook');
      shoot(w);
      run(w, 0.2);
      expect(w.crane.state).toBe('hanging');
    }
  });

  it('stray fire never cuts it: nail gun, shotgun and outboard sprayed from every other lane at zombies behind the hook', () => {
    const w = quiet({ god: true });
    arm(w, 'nailgun', 'shotgun', 'outboard');
    const ids = ['nailgun', 'shotgun', 'outboard'] as const;
    for (let z0 = -5; z0 <= 5; z0 += 0.25) {
      if (Math.abs(z0 - lane()) <= CRANE.laneBand + 0.02) continue;
      for (const id of ids) {
        w.player.switchTo(id);
        aimLane(w, z0, 12);
        // Targets left of the hook, in and around this lane.
        for (const dz of [-0.6, 0, 0.6]) hold(w.spawn('shambler', -12, Math.max(-4.8, Math.min(4.8, z0 + dz)), { life: 1e6 }));
        w.player.input.fire = true;
        for (let i = 0; i < 25; i++) w.step();
        w.player.input.fire = false;
        w.clearZombies();
        w.player.owned.get(id)!.bullets = w.player.owned.get(id)!.def.clip;
      }
    }
    expect(w.crane.state).toBe('hanging');
    expect(w.player.stats.shots).toBeGreaterThan(300);
  });

  it('a crowd standing under the pallet does not shield the hook; a zombie in front of the drop square does', () => {
    const w = quiet();
    aimLane(w, lane(), 10);
    const under = [CRANE.hookX + 1.8, CRANE.hookX + 1.0, CRANE.hookX + 0.2].map((x) => hold(w.spawn('shambler', x, lane())));
    const crane = record(w, 'crane');
    const nice = record(w, 'niceShot');
    shoot(w);
    expect(crane[0]?.state).toBe('falling');
    run(w, CRANE.dropTime + 0.1);
    expect(under.every((z) => z.dead && z.deathKind === 'gib')).toBe(true);
    expect(nice[0]).toMatchObject({ n: 3, source: 'crane' });
    // In front of the square (between the Bosun and the crane) it takes the round.
    const w2 = quiet();
    aimLane(w2, lane(), 10);
    const front = hold(w2.spawn('shambler', CRANE.hookX + CRANE.radius + 3, lane()));
    expect(w2.combat.lineTrace(w2.player)).toMatchObject({ kind: 'zombie', id: front.id });
  });

  it('a flare fired lined up flies over the crowd to the hook; fired from another lane it does not cut the rope', () => {
    const w = quiet();
    arm(w, 'flare');
    aimLane(w, lane(), 10);
    hold(w.spawn('shambler', CRANE.hookX + 1, lane()));
    shoot(w);
    expect(until(w, () => w.crane.state !== 'hanging', 2)).toBe(true);
    const w2 = quiet();
    arm(w2, 'flare');
    aimLane(w2, lane() + 0.6, 10);
    shoot(w2);
    run(w2, 2);
    expect(w2.crane.state).toBe('hanging');
  });

  it('the bot never wastes it: every drop it makes lands on a crowd, and it does drop it', () => {
    let drops = 0;
    // Collected and checked after the runs (an expect thrown inside a handler is caught by the EventBus).
    const crowdAtDrop: number[] = [];
    for (const seed of [1001, 1002, 1003, 1004]) {
      const w = new World({ seed });
      const bot = new Bot(w.player, { skill: 0.95 });
      let under = 0;
      w.events.on('crane', (e) => {
        if (e.state !== 'falling') return;
        drops++;
        crowdAtDrop.push(under);
      });
      for (let i = 0; i < 50 * 140 && !w.gameEnded; i++) {
        bot.think(w);
        under = w.pier.under;
        w.step();
      }
    }
    expect(drops).toBeGreaterThan(0);
    for (const n of crowdAtDrop) expect(n).toBeGreaterThanOrEqual(CRANE.crowd);
  }, 60000);

  it('the hook lane follows the gun height (a jump changes it) and the muzzle offset of the weapon', () => {
    const w = quiet();
    arm(w, 'shotgun');
    aimLane(w, lane(), 10);
    expect(w.pier.hookLined(w.player.muzzle())).toBe(true);
    expect(w.player.z).toBeCloseTo(lane() - MUZZLE_Z.shotgun, 9);
    w.player.y = 1.2;
    expect(w.pier.hookLined(w.player.muzzle())).toBe(false);
    // Once the crane is down there is nothing to line up with.
    w.player.y = 0;
    w.pier.cutRope(w.player);
    expect(w.pier.hookLined(w.player.muzzle())).toBe(false);
  });
});
