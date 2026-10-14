// §5 Fire & gas.
import { describe, expect, it } from 'vitest';
import { FIRE, GAS } from '../src/config/rules';
import { WEAPONS, FLARE, chapterDamage } from '../src/config/weapons';
import { aimLane, arm, hold, quiet, record, run, until } from './helpers';

describe('fire', () => {
  it('a flare is a fast, slightly arcing projectile that ignites what it hits', () => {
    const w = quiet();
    arm(w, 'flare');
    aimLane(w, 0, 14);
    const z = hold(w.spawn('shambler', 0, 0));
    const proj = record(w, 'projectile');
    const end = record(w, 'projectileEnd');
    const ign = record(w, 'ignite');
    const hits = record(w, 'hit');
    w.player.input.fire = true;
    w.step();
    w.player.input.fire = false;
    expect(proj[0]).toMatchObject({ kind: 'flare' });
    expect(proj[0].vx).toBeCloseTo(-FLARE.speed, 0);
    expect(until(w, () => end.length > 0, 2)).toBe(true);
    expect(hits[0].damage).toBeCloseTo(WEAPONS.flare.damage, 5);
    expect(ign[0]).toMatchObject({ zombieId: z.id, corpseId: null });
    expect(z.burning).toBeGreaterThan(FIRE.burnSeconds - 0.6);
  });

  it('burning: FIRE.dps (× the chapter’s damage scale) for 5 s, flailing a little faster (state burn), then it goes out', () => {
    const w = quiet();
    // A riot brute has the life to survive the whole burn.
    const z = w.spawn('riot', -10, 0);
    const v0 = z.speed;
    run(w, 0.5);
    const life0 = z.life;
    const out = record(w, 'extinguish');
    z.ignite(w.player);
    run(w, 1);
    expect(z.state).toBe('burn');
    expect(z.vx).toBeCloseTo(v0 * FIRE.panicSpeed, 5);
    expect(life0 - z.life).toBeCloseTo(FIRE.dps * 1, 1);
    run(w, FIRE.burnSeconds);
    expect(out).toEqual([{ zombieId: z.id, corpseId: null }]);
    expect(z.burning).toBe(0);
    expect(life0 - z.life).toBeCloseTo(FIRE.dps * FIRE.burnSeconds, 0);
    run(w, 0.1);
    expect(z.state).toBe('walk');
    // Later chapters burn hotter, like the guns.
    const w3 = quiet({ startChapter: 3 });
    const r = w3.spawn('riot', -10, 0);
    const l3 = r.life;
    r.ignite(null);
    run(w3, 1);
    expect(l3 - r.life).toBeCloseTo(FIRE.dps * chapterDamage(3), 1);
  });

  it('the flare is worth its price: one shot burns a lone shambler to death in every chapter, and a pack with it', () => {
    for (const ch of [1, 2, 3]) {
      const w = quiet({ startChapter: ch });
      arm(w, 'flare');
      aimLane(w, 0, 16);
      const z = w.spawn('shambler', 0, 0);
      const x0 = z.x;
      w.player.input.fire = true;
      w.step();
      w.player.input.fire = false;
      expect(until(w, () => z.dead, FIRE.burnSeconds + 1)).toBe(true);
      expect(z.deathKind).toBe('burn');
      // It dies on its feet: not even half-way to the gangway from here.
      expect(z.x - x0).toBeLessThan(6);
    }
    // Into a pack: the burst and the spread burn (nearly) all of them; the bodies never rise.
    const w = quiet({ startChapter: 2 });
    arm(w, 'flare');
    aimLane(w, 0, 16);
    const pack = [0, -0.7, -1.4, -2.1, -0.4].map((dx, i) => w.spawn('shambler', -2 + dx, (i % 3) * 0.45 - 0.45));
    w.player.input.fire = true;
    w.step();
    w.player.input.fire = false;
    run(w, FIRE.burnSeconds + 3);
    const burned = pack.filter((z) => z.dead && z.deathKind === 'burn');
    expect(burned.length).toBeGreaterThanOrEqual(4);
    for (const z of burned) expect(w.corpseById(z.corpseId!)?.risesAt ?? null).toBeNull();
    // Holstered, it reloads itself: switch to it, fire, switch back.
    arm(w, 'nailgun');
    const flare = w.player.owned.get('flare')!;
    flare.bullets = 0;
    run(w, WEAPONS.flare.reload - 0.2);
    expect(flare.bullets).toBe(0);
    run(w, 0.3);
    expect(w.player.owned.get('flare')!.bullets).toBe(1);
  });

  it('a flare on the deck burns for 8 s and ignites whatever walks through or lies there', () => {
    const w = quiet();
    arm(w, 'flare');
    aimLane(w, 0, 20);
    const zones = record(w, 'fireZone');
    w.player.input.fire = true;
    w.step();
    w.player.input.fire = false;
    until(w, () => zones.length > 0, 3);
    const f = zones[0];
    expect(f.ttl).toBe(FIRE.deckSeconds);
    const c = w.addCorpse('shambler', f.x, f.z, { risesIn: 20 });
    const z = w.spawn('shambler', f.x - 2, f.z);
    run(w, 3);
    expect(z.burning).toBeGreaterThan(0);
    expect(c.burning).toBeGreaterThan(0);
    expect(c.risesAt).toBeNull();
    run(w, FIRE.deckSeconds);
    expect(w.fires).toHaveLength(0);
  });

  it('fire spreads between zombies (within FIRE.spreadRadius) and through corpse piles', () => {
    // 70% per second for a 5 s burn: a neighbour nearly always catches fire.
    const w = quiet();
    const pairs = Array.from({ length: 40 }, (_, i) => {
      const x = -24 + (i % 10) * 4;
      const z = -4 + Math.floor(i / 10) * 2.5;
      return [hold(w.spawn('shambler', x, z)), hold(w.spawn('shambler', x + 0.6, z + 0.2))];
    });
    for (const [a] of pairs) a.ignite(w.player);
    run(w, FIRE.burnSeconds);
    const caught = pairs.filter(([, b]) => b.burning > 0 || b.dead).length;
    expect(caught / pairs.length).toBeGreaterThan(0.85);
    // Out of reach stays out of reach.
    const w3 = quiet();
    const a3 = hold(w3.spawn('shambler', -10, 0));
    const b3 = hold(w3.spawn('shambler', -10 + FIRE.spreadRadius + 0.3, 0));
    a3.ignite(w3.player);
    run(w3, 2);
    expect(b3.burning).toBe(0);
    expect(pairs.find(([, b]) => b.burning > 0)![1].burnBy).toBe(w.player);
    const w2 = quiet();
    const pile = [0, 0.5, 1.0, 1.5, 2.0].map((x) => w2.addCorpse('shambler', -5 + x, 1, { risesIn: 30 }));
    w2.bodies.ignite(pile[0], w2.player);
    run(w2, 5.5);
    expect(pile.filter((c) => c.burning > 0 || c.ash).length).toBeGreaterThanOrEqual(4);
    expect(pile.every((c) => c.risesAt === null || c.burning <= 0)).toBe(true);
  });
});

describe('gas', () => {
  it('a bloater pops into a gas cloud and two crawlers', () => {
    const w = quiet();
    const b = hold(w.spawn('bloater', -2, 1));
    const gas = record(w, 'gas');
    const spawns = record(w, 'spawn');
    b.damage({ damage: 999, part: 'body', point: { x: b.x, y: 1, z: b.z }, dirX: -1, dirZ: 0, source: 'bullet', player: w.player, weapon: 'revolver' });
    w.resolveDeaths();
    expect(b.deathKind).toBe('pop');
    expect(gas[0]).toMatchObject({ radius: GAS.radius, ttl: GAS.seconds });
    const crawlers = spawns.filter((s) => s.risen);
    expect(crawlers).toHaveLength(2);
    expect(crawlers.every((c) => w.zombieById(c.zombieId)!.crawling)).toBe(true);
    run(w, GAS.seconds + 0.1);
    expect(w.gas).toHaveLength(0);
  });

  it('the hunter loses 15 hp/s inside the gas', () => {
    const w = quiet();
    const p = w.player;
    w.hazards.addGas(p.x, p.z, GAS.radius, GAS.seconds, null);
    const hurt = record(w, 'playerHurt');
    run(w, 1);
    expect(100 - p.life).toBeCloseTo(GAS.hunterDps, 0);
    expect(hurt.every((h) => h.source === 'gas')).toBe(true);
    // Damage over time is reported in 0.2 s batches.
    const reported = hurt.reduce((a, h) => a + h.damage, 0);
    expect(reported).toBeGreaterThanOrEqual(GAS.hunterDps * 0.8 - 1e-6);
    expect(reported).toBeLessThanOrEqual(GAS.hunterDps + 1e-6);
  });

  it('fire touching gas: a gas explosion (radius 3.5, 150 damage) that ignites', () => {
    const w = quiet();
    w.hazards.addGas(-5, 0, GAS.radius, GAS.seconds, null);
    const victims = [hold(w.spawn('shambler', -5.5, 1)), hold(w.spawn('riot', -4, -1))];
    const torch = hold(w.spawn('shambler', -9, 0));
    torch.ignite(w.player);
    torch.speed = 1.5;
    const ex = record(w, 'explosion');
    expect(until(w, () => ex.length > 0, 5)).toBe(true);
    expect(ex[0].kind).toBe('gas');
    expect(ex[0].radius).toBeGreaterThanOrEqual(GAS.explosionRadius);
    expect(victims[0].dead).toBe(true);
    expect(victims[1].burning).toBeGreaterThan(0);
    expect(victims[1].life).toBeLessThan(victims[1].maxLife - 60);
    expect(w.gas).toHaveLength(0);
  });

  it('a flare through a gas cloud sets it off', () => {
    const w = quiet();
    arm(w, 'flare');
    aimLane(w, 0, 16);
    w.hazards.addGas(4, 0.1, GAS.radius, GAS.seconds, null);
    const ex = record(w, 'explosion');
    w.player.input.fire = true;
    w.step();
    w.player.input.fire = false;
    expect(until(w, () => ex.length > 0, 2)).toBe(true);
    expect(ex[0].kind).toBe('gas');
  });
});
