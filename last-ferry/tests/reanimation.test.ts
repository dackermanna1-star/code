// §4.1 "Not dead till the head's gone".
import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../src/config/chapters';
import { MONEY, REANIMATION } from '../src/config/rules';
import { TICK_RATE } from '../src/config/world';
import { ZOMBIES } from '../src/config/zombies';
import type { World } from '../src/core/World';
import type { DamageInfo, Zombie } from '../src/core/Zombie';
import { arm, aimLane, depthFor, hold, quiet, record, run, shoot, until } from './helpers';

/** Kill a zombie with one blow (default: an ordinary body shot). */
function kill(w: World, z: Zombie, o: Partial<DamageInfo> = {}): void {
  z.damage({
    damage: z.life + 5,
    part: 'body',
    point: { x: z.x, y: 1, z: z.z },
    dirX: -1,
    dirZ: 0,
    source: 'bullet',
    player: w.player,
    weapon: 'revolver',
    ...o,
  });
  w.resolveDeaths();
}

describe('reanimation', () => {
  it('a body-shot kill leaves a downed body that rises after the chapter’s delay', () => {
    for (const ch of [1, 2, 3]) {
      const w = quiet({ startChapter: ch });
      const [a, b] = CHAPTERS[ch - 1].riseDelay;
      for (let i = 0; i < 12; i++) {
        const z = hold(w.spawn('shambler', -5 + i, -3 + i * 0.5));
        kill(w, z);
        const c = w.corpseById(z.corpseId!)!;
        expect(c.deathKind).toBe('down');
        const d = (c.risesAt! - w.tick) / TICK_RATE;
        expect(d).toBeGreaterThanOrEqual(a - 0.02);
        expect(d).toBeLessThanOrEqual(b + 0.02);
      }
    }
  });

  it('twitches 2 s before rising, then gets up as a crawler of the same kind and look', () => {
    const w = quiet();
    const z = hold(w.spawn('jogger', 0, 1));
    kill(w, z);
    const c = w.corpseById(z.corpseId!)!;
    const twitch = record(w, 'corpseTwitch');
    const rise = record(w, 'corpseRise');
    const spawns = record(w, 'spawn');
    const at = c.risesAt!;
    until(w, () => twitch.length > 0, 20);
    expect(at - w.tick).toBe(Math.round(REANIMATION.twitchSeconds * TICK_RATE));
    expect(c.twitching).toBe(true);
    until(w, () => rise.length > 0, 5);
    expect(w.tick).toBe(at);
    const cr = w.zombieById(rise[0].zombieId)!;
    expect(cr).toBeDefined();
    expect(cr.risen).toBe(true);
    expect(cr.kind).toBe('jogger');
    expect(cr.look).toBe(z.look);
    expect(cr.state).toBe('rise');
    expect(cr.bounty).toBe(REANIMATION.crawlerBounty);
    expect(cr.maxLife).toBe(Math.max(REANIMATION.crawlerMinLife, Math.round(ZOMBIES.jogger.life * REANIMATION.crawlerLifeFrac)));
    expect(cr.speed).toBeGreaterThanOrEqual(REANIMATION.crawlSpeed[0]);
    expect(cr.speed).toBeLessThanOrEqual(REANIMATION.crawlSpeed[1]);
    expect(spawns.at(-1)).toMatchObject({ zombieId: cr.id, risen: true, kind: 'jogger' });
    expect(c.removed).toBe(true);
    expect(w.corpses.includes(c)).toBe(false);
    run(w, REANIMATION.riseSeconds + 0.1);
    expect(cr.state).toBe('crawl');
    expect(cr.vx).toBeGreaterThan(0);
  });

  it('a risen crawler that is killed stays dead', () => {
    const w = quiet();
    const cr = w.spawn('shambler', 0, 0, { risen: true });
    kill(w, cr);
    expect(cr.deathKind).toBe('down');
    expect(w.corpseById(cr.corpseId!)!.risesAt).toBeNull();
  });

  it('stays dead: headshot, gib, pop, harpoon, stomp, burn, drown', () => {
    const w = quiet();
    // Headshot.
    const a = hold(w.spawn('shambler', 0, 0));
    kill(w, a, { part: 'head' });
    expect(a.deathKind).toBe('headshot');
    expect(w.corpseById(a.corpseId!)!.risesAt).toBeNull();
    // Gibbed by the cannon: no body at all.
    const b = hold(w.spawn('shambler', -4, 2));
    w.explode(b.x, 0.3, b.z, 3, 400, 'cannon', w.player);
    expect(b.deathKind).toBe('gib');
    expect(b.corpseId).toBeNull();
    // A bloater pops: no body.
    const c = hold(w.spawn('bloater', -8, -2));
    kill(w, c);
    expect(c.deathKind).toBe('pop');
    expect(c.corpseId).toBeNull();
    // Harpooned: a body that never rises.
    const d = hold(w.spawn('shambler', -12, 0));
    kill(w, d, { source: 'harpoon', weapon: 'harpoon' });
    expect(d.deathKind).toBe('harpoon');
    expect(w.corpseById(d.corpseId!)!.risesAt).toBeNull();
    // Burned (4 s × 12 dps finishes a wounded one).
    const e = hold(w.spawn('shambler', -16, 3));
    e.life = 30;
    e.ignite(w.player);
    run(w, 3);
    expect(e.dead).toBe(true);
    expect(e.deathKind).toBe('burn');
    // Drowned: knocked off the pier's edge.
    const f = hold(w.spawn('shambler', 5, 4.8));
    w.explode(5, 0.3, 4.55, 3, 5, 'cannon', w.player);
    expect(f.deathKind).toBe('drown');
    expect(f.corpseId).toBeNull();
  });

  it('a crawler stomped by the hunter stays dead and pays a tidy bonus', () => {
    const w = quiet();
    const p = w.player;
    const money = record(w, 'money');
    const stomps = record(w, 'stomp');
    p.input.jump = true;
    w.step();
    p.input.jump = false;
    // It crawls in underneath while he is in the air (on the ground he would kick it).
    const cr = hold(w.spawn('shambler', p.x - 0.2, p.z, { risen: true }));
    until(w, () => stomps.length > 0, 2);
    expect(stomps[0].killed).toBe(true);
    expect(cr.deathKind).toBe('stomp');
    expect(w.corpseById(cr.corpseId!)!.risesAt).toBeNull();
    expect(money.some((m) => m.reason === 'tidy' && m.amount === MONEY.tidy)).toBe(true);
    // A stomp is worth more than letting it get up and kicking it.
    expect(MONEY.tidy).toBeGreaterThan(REANIMATION.crawlerBounty);
    expect(p.stats.stomps).toBe(1);
  });

  it('downed bodies are made permanent by fire, a stomp, an explosion or three nails', () => {
    const w = quiet();
    const perm = record(w, 'corpsePermanent');
    const c1 = w.addCorpse('shambler', -10, -3, { risesIn: 10 });
    w.bodies.ignite(c1, w.player);
    expect(c1.risesAt).toBeNull();
    const c2 = w.addCorpse('shambler', -4, 3, { risesIn: 10 });
    w.explode(-4, 0.3, 3, 3, 400, 'cannon', w.player);
    expect(c2.risesAt).toBeNull();
    // Stomp a body.
    const p = w.player;
    const c3 = w.addCorpse('shambler', p.x, p.z, { risesIn: 10 });
    p.input.jump = true;
    w.step();
    p.input.jump = false;
    run(w, 0.8);
    expect(c3.risesAt).toBeNull();
    expect(perm.map((e) => e.reason)).toEqual(['burned', 'blast', 'stomp']);
  });

  it('three nails in a downed body pin it to the planks', () => {
    const w = quiet();
    arm(w, 'nailgun');
    const p = w.player;
    // A body lying where the nail gun's line appears to cross it at ~0.15 m.
    const zc = depthFor(0, 0.15);
    const c = w.addCorpse('shambler', 9, zc, { risesIn: 30 });
    aimLane(w, 0, 11);
    expect(w.combat.lineTrace(p)).toMatchObject({ kind: 'corpse', id: c.id });
    const nails = record(w, 'nail');
    const perm = record(w, 'corpsePermanent');
    for (let i = 0; i < 12 && c.risesAt !== null; i++) shoot(w);
    expect(nails.filter((n) => n.corpseId === c.id).length).toBeGreaterThanOrEqual(REANIMATION.nailsToPin);
    expect(c.risesAt).toBeNull();
    expect(perm[0]).toEqual({ corpseId: c.id, reason: 'nailed' });
    expect(c.pinNails).toBe(REANIMATION.nailsToPin);
  });

  it('riot brutes, bloaters and Big Dave never rise', () => {
    const w = quiet();
    const r = hold(w.spawn('riot', 0, 0));
    kill(w, r, { source: 'harpoon' });
    expect(w.corpseById(r.corpseId!)!.risesAt).toBeNull();
    const r2 = hold(w.spawn('riot', -3, 2));
    kill(w, r2, { part: 'legs' });
    expect(r2.deathKind).toBe('down');
    expect(w.corpseById(r2.corpseId!)!.risesAt).toBeNull();
    const d = hold(w.spawn('bigdave', -10, 0, { boss: true }));
    kill(w, d);
    expect(d.deathKind).toBe('pop');
    expect(d.corpseId).toBeNull();
  });
});
