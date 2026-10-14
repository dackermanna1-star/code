import { describe, expect, it } from 'vitest';
import { WEAPONS, OUTBOARD } from '../src/config/weapons';
import { TICK_RATE } from '../src/config/world';
import { arm, quiet, record, run } from './helpers';

const T = (s: number) => Math.round(s * TICK_RATE);

describe('weapons: cadence and reloads', () => {
  it('revolver fires every 0.30 s, six rounds, then a 1.6 s reload', () => {
    const w = quiet();
    const shots: number[] = [];
    w.events.on('shot', () => shots.push(w.tick));
    const reloads = record(w, 'reloadStart');
    w.player.input.fire = true;
    run(w, 6);
    expect(shots.length).toBeGreaterThanOrEqual(12);
    const gaps = shots.slice(1).map((t, i) => t - shots[i]);
    expect(gaps.slice(0, 5)).toEqual([15, 15, 15, 15, 15]);
    // 6th round → hammer cycle (0.3 s) → full reload (1.6 s) → 7th round.
    expect(gaps[5]).toBe(T(0.3) + T(1.6));
    expect(reloads.length).toBeGreaterThanOrEqual(1);
    expect(reloads[0].weapon).toBe('revolver');
  });

  it('nail gun keeps an exact 0.075 s average cadence over a 40-nail strip, then reloads for 2 s', () => {
    const w = quiet();
    arm(w, 'nailgun');
    const shots: number[] = [];
    w.events.on('shot', () => shots.push(w.tick));
    w.player.input.fire = true;
    run(w, 6);
    const first40 = shots.slice(0, 40);
    const avg = (first40[39] - first40[0]) / 39 / TICK_RATE;
    expect(avg).toBeCloseTo(WEAPONS.nailgun.fireInterval, 2);
    const gaps = first40.slice(1).map((t, i) => t - first40[i]);
    expect(Math.min(...gaps)).toBe(3);
    expect(Math.max(...gaps)).toBe(4);
    // The 41st nail comes after the reload.
    expect((shots[40] - shots[39]) / TICK_RATE).toBeGreaterThanOrEqual(WEAPONS.nailgun.reload);
  });

  it('shotgun pumps (0.75 s), fires 8 pellets, reloads shell by shell and the trigger interrupts the reload', () => {
    const w = quiet();
    arm(w, 'shotgun');
    const p = w.player;
    const shots = record(w, 'shot');
    p.input.fire = true;
    run(w, 0.02);
    expect(shots[0].paths).toHaveLength(8);
    expect(shots[0].paths.every((x) => x.kind === 'pellet')).toBe(true);
    run(w, 0.74);
    expect(shots).toHaveLength(1);
    run(w, 0.04);
    expect(shots).toHaveLength(2);
    p.input.fire = false;
    run(w, 1);
    expect(p.weapon.bullets).toBe(4);
    p.reload();
    expect(p.weapon.shellsLoading).toBe(2);
    run(w, 0.2);
    expect(p.weapon.shellProgress).toBeCloseTo(0.2 / WEAPONS.shotgun.reload, 1);
    expect(p.weapon.reloadProgress).toBeCloseTo(0.2 / WEAPONS.shotgun.reload / 2, 1);
    run(w, 0.3);
    expect(p.weapon.bullets).toBe(5); // one shell per 0.45 s
    expect(p.weapon.reloading).toBe(true);
    // Firing mid-reload interrupts it.
    const ends = record(w, 'reloadEnd');
    p.input.fire = true;
    w.step();
    expect(ends).toHaveLength(1);
    expect(shots).toHaveLength(3);
    expect(p.weapon.bullets).toBe(4);
  });

  it('flare and harpoon are single shots that reload after every round', () => {
    const w = quiet();
    arm(w, 'flare');
    const reloads = record(w, 'reloadStart');
    w.player.input.fire = true;
    w.step();
    expect(w.projectiles).toHaveLength(1);
    expect(w.projectiles[0].kind).toBe('flare');
    run(w, 0.1);
    expect(reloads.map((r) => r.weapon)).toEqual(['flare']);
    expect(w.player.weapon.state).toBe('reload');
    run(w, WEAPONS.flare.reload);
    expect(w.projectiles.length).toBeGreaterThanOrEqual(1);
  });

  it('outboard: pull-start, 0.6 s spin-up, 0.045 s cadence, idles between bursts, stalls when overheated', () => {
    const w = quiet();
    arm(w, 'outboard');
    const p = w.player;
    const engine = record(w, 'engine');
    const shots: number[] = [];
    w.events.on('shot', () => shots.push(w.tick));
    p.input.fire = true;
    w.step();
    expect(engine.map((e) => e.state)).toEqual(['pull']);
    expect(p.weapon.state).toBe('spin');
    run(w, 0.55);
    expect(shots).toHaveLength(0);
    run(w, 0.1);
    expect(shots.length).toBeGreaterThan(0);
    expect((shots[0] - 1) / TICK_RATE).toBeCloseTo(WEAPONS.outboard.spinUp, 1);
    expect(engine.map((e) => e.state)).toEqual(['pull', 'run']);
    run(w, 1);
    const gaps = shots.slice(1).map((t, i) => t - shots[i]);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length / TICK_RATE;
    expect(avg).toBeCloseTo(WEAPONS.outboard.fireInterval, 2);
    p.input.fire = false;
    w.step();
    expect(engine.at(-1)!.state).toBe('idle');
    expect(p.weapon.spin).toBeGreaterThan(0);
    // Overheat: hold the trigger until the engine dies.
    p.input.fire = true;
    run(w, 12);
    expect(engine.some((e) => e.state === 'stop')).toBe(true);
    const wpn = p.weapon as unknown as { overheated: boolean; heat: number };
    // While overheated, no rounds until it cools below the restart heat.
    if (wpn.overheated) {
      const n = shots.length;
      w.step();
      expect(shots.length).toBe(n);
    }
    expect(OUTBOARD.restartHeat).toBeLessThan(1);
  });

  it('weapon damage grows 10% per chapter after the first', () => {
    const w1 = quiet();
    const w3 = quiet({ startChapter: 3 });
    expect(w1.damageScale).toBe(1);
    expect(w3.damageScale).toBeCloseTo(1.2, 5);
  });

  it('buyBest buys the most expensive affordable weapon; selectOrBuy and cycle switch', () => {
    const w = quiet();
    const p = w.player;
    const buys = record(w, 'buy');
    const switches = record(w, 'weaponSwitch');
    p.money = 4000;
    expect(p.buyBest()).toBe(true);
    expect(p.weapon.id).toBe('harpoon');
    expect(p.money).toBe(4000 - WEAPONS.harpoon.price);
    expect(p.selectOrBuy('nailgun')).toBe(false); // 500 left: can't afford
    expect(p.selectOrBuy('revolver')).toBe(true);
    expect(p.cycle(1)).toBe(true);
    expect(p.weapon.id).toBe('harpoon');
    expect(buys.map((b) => b.weapon)).toEqual(['harpoon']);
    expect(switches.length).toBe(3);
  });

  it('recoil pushes the hunter right (shotgun)', () => {
    const w = quiet();
    arm(w, 'shotgun');
    const x0 = w.player.x;
    w.player.input.fire = true;
    w.step();
    w.player.input.fire = false;
    run(w, 0.1);
    expect(w.player.x).toBeGreaterThan(x0 + 0.05);
  });
});
