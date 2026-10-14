// §4.2 Corpses are terrain: the meat barricade.
import { describe, expect, it } from 'vitest';
import { BARRICADE, FIRE } from '../src/config/rules';
import { CRANE } from '../src/config/world';
import { quiet, record, run, until } from './helpers';

const factor = (n: number) => 1 / (1 + BARRICADE.slowK * Math.min(BARRICADE.maxN, n));

describe('the meat barricade', () => {
  it('bodies just ahead in the lane slow a zombie by 1 / (1 + 0.45 n), capped at 4', () => {
    for (const n of [0, 1, 2, 3, 6]) {
      const w = quiet();
      const z = w.spawn('shambler', 0, 0);
      z.speed = 1;
      // Lay n bodies 0.3–0.6 m ahead in its lane (piles spill along the lane past 3).
      for (let i = 0; i < n; i++) w.addCorpse('shambler', 0.3 + (i % 3) * 0.1, (i < 3 ? 0 : 0.2) - 0.05, { risesIn: null });
      w.step();
      const ahead = w.bodies.countAhead(z.x + z.def.halfLength * 0.3, z.z);
      expect(z.slow).toBeCloseTo(factor(ahead), 6);
      if (n === 0) expect(z.slow).toBe(1);
      if (n >= 1 && n <= 3) expect(ahead).toBe(n);
      if (n === 6) expect(z.slow).toBeGreaterThanOrEqual(factor(4) - 1e-9);
    }
  });

  it('piles hold at most 3 bodies per 0.75 m cell; extra bodies spill to a neighbour', () => {
    const w = quiet();
    for (let i = 0; i < 9; i++) w.addCorpse('shambler', 2.1, 0.3, { risesIn: null });
    expect(w.corpses.length).toBe(9);
    expect(w.bodies.pileAt(2.1, 0.3)).toBe(BARRICADE.perCell);
    const cells = new Set(w.corpses.map((c) => `${Math.floor((c.x + 34) / 0.75)},${Math.floor((c.z + 6.75) / 0.75)}`));
    for (const key of cells) {
      const [cx, cz] = key.split(',').map(Number);
      expect(w.bodies.pileAt(-34 + (cx + 0.5) * 0.75, -6.75 + (cz + 0.5) * 0.75)).toBeLessThanOrEqual(3);
    }
    expect(cells.size).toBeGreaterThanOrEqual(3);
  });

  it('a killing blow pushes the body at most 1.2 m (the ragdoll lands there)', () => {
    const w = quiet();
    for (const dmg of [20, 200, 2000]) {
      const z = w.spawn('shambler', -5, 1);
      z.speed = 0;
      const x0 = z.x;
      const z0 = z.z;
      z.damage({ damage: z.life + dmg, part: 'body', point: { x: z.x, y: 1, z: z.z }, dirX: -1, dirZ: 0, source: 'bullet', player: w.player, weapon: 'revolver' });
      w.resolveDeaths();
      const c = w.corpseById(z.corpseId!)!;
      const d = Math.hypot(c.x - x0, c.z - z0);
      expect(d).toBeLessThanOrEqual(BARRICADE.pushMax + 0.4); // (+ spill inside a full cell)
      expect(c.x).toBeLessThan(x0 + 0.01);
    }
  });

  it('joggers trip over bodies (state trip for 0.9 s) and get up again', () => {
    const w = quiet();
    for (let i = 0; i < 14; i++) w.addCorpse('shambler', -6 + i * 0.6, 0, { risesIn: null });
    const j = w.spawn('jogger', -12, 0);
    j.vz = 0;
    const trips = record(w, 'trip');
    expect(until(w, () => trips.length > 0, 6)).toBe(true);
    expect(j.state).toBe('trip');
    const t0 = w.tick;
    until(w, () => j.state !== 'trip', 3);
    expect((w.tick - t0) / 50).toBeCloseTo(BARRICADE.tripSeconds, 1);
    expect(['run', 'trip']).toContain(j.state);
  });

  it('burning bodies turn to ash after 6 s and stop counting', () => {
    const w = quiet();
    const c = w.addCorpse('shambler', 0.4, 0, { risesIn: null });
    const z = w.spawn('shambler', 0, 0);
    z.speed = 1;
    expect(w.obstaclesAhead(z)).toBe(1);
    const gone = record(w, 'corpseGone');
    w.bodies.ignite(c, w.player);
    z.x = -30; // out of the way of the flames
    run(w, FIRE.corpseAshSeconds + 0.1);
    expect(gone).toEqual([{ corpseId: c.id, reason: 'ash' }]);
    expect(c.ash).toBe(true);
    z.x = 0;
    expect(w.obstaclesAhead(z)).toBe(0);
  });

  it('Big Dave tramples bodies (not slowed)', () => {
    const w = quiet();
    for (let i = 0; i < 6; i++) w.addCorpse('shambler', 1.2 + i * 0.1, 0, { risesIn: null });
    const d = w.spawn('bigdave', 0, 0, { boss: true });
    run(w, 1);
    expect(d.slow).toBe(1);
  });

  it('the crane’s crate barricade slows zombies like 4 bodies for 20 s', () => {
    const w = quiet();
    w.pier.cutRope(w.player);
    run(w, CRANE.dropTime + 0.1);
    expect(w.crane.state).toBe('down');
    const z = w.spawn('shambler', CRANE.hookX, CRANE.hookZ);
    z.speed = 1;
    w.step();
    expect(z.slow).toBeCloseTo(factor(4), 6);
    run(w, CRANE.barricadeSeconds);
    expect(w.crane.state).toBe('gone');
    z.x = CRANE.hookX;
    z.z = CRANE.hookZ;
    w.step();
    expect(z.slow).toBe(1);
  });
});
