// Seal Hunter's view-consistent hit rule: what looks like a hit on screen is a hit.
import { describe, expect, it } from 'vitest';
import { CAMERA_POS, viewHeightAt, worldToScreen } from '../src/config/view';
import { CRANE, HUNTER } from '../src/config/world';
import { PLATE_CHEST, PLATE_HELMET, PLATE_SHIELD } from '../src/config/ids';
import { RIOT_PLATES } from '../src/config/zombies';
import { laneFor } from '../src/core/Bot';
import type { Riot } from '../src/core/zombies';
import { aimLane, arm, depthFor, fireOnce, hold, quiet, record, run, shoot } from './helpers';

describe('view-consistent hit rule', () => {
  it('the gun line crosses a zombie at the height where the tracer appears to cross it on screen', () => {
    // A point on the gun line and the point at viewHeightAt on the zombie's plane project to the same pixel.
    const z0 = 0.4;
    const zc = -1.1;
    const y = viewHeightAt(1.0, z0, zc);
    // The same camera ray also shifts x a little with depth (perspective).
    const xl = -12;
    const xp = CAMERA_POS.x + ((xl - CAMERA_POS.x) * (zc - CAMERA_POS.z)) / (z0 - CAMERA_POS.z);
    const a = worldToScreen(xl, 1.0, z0);
    const b = worldToScreen(xp, y, zc);
    expect(a.u).toBeCloseTo(b.u, 6);
    expect(a.v).toBeCloseTo(b.v, 6);
    expect(laneFor(1.0, y, zc)).toBeCloseTo(z0, 9);
    // Farther away (−z) → the line appears lower on the body; nearer → higher.
    expect(viewHeightAt(1, 0, -1)).toBeLessThan(1);
    expect(viewHeightAt(1, 0, 1)).toBeGreaterThan(1);
  });

  it('a shambler in the lane is hit in the body, one standing ~0.85 m nearer the camera in the head', () => {
    const w = quiet();
    aimLane(w, 0);
    const body = hold(w.spawn('shambler', 4, 0));
    expect(w.combat.lineTrace(w.player)).toMatchObject({ kind: 'zombie', id: body.id, part: 'body' });
    body.x = -30;
    const zHead = depthFor(0, 1.6);
    expect(zHead).toBeGreaterThan(0.6);
    expect(zHead).toBeLessThan(1.1);
    const head = hold(w.spawn('shambler', 4, zHead));
    expect(w.combat.lineTrace(w.player)).toMatchObject({ kind: 'zombie', id: head.id, part: 'head' });
  });

  it('the line passes over zombies standing well in front and under those far behind', () => {
    const w = quiet();
    aimLane(w, 0);
    hold(w.spawn('shambler', 4, depthFor(0, 2.05)));
    hold(w.spawn('shambler', 2, depthFor(0, -0.15)));
    expect(w.combat.lineTrace(w.player).kind).toBe('none');
  });

  it('headshots deal the kind’s head multiplier and kill a shambler outright', () => {
    const w = quiet();
    aimLane(w, 0, 6);
    const z = hold(w.spawn('shambler', 3.5, depthFor(0, 1.62)));
    const hits = record(w, 'hit');
    const deaths = record(w, 'zombieDeath');
    fireOnce(w);
    expect(hits[0].part).toBe('head');
    expect(hits[0].damage).toBeCloseTo(34 * 3, 5);
    expect(deaths[0]).toMatchObject({ zombieId: z.id, deathKind: 'headshot' });
  });

  it('crawlers have a low profile: the gun line at 1 m passes over them unless the hunter stands ~1 m nearer the camera', () => {
    const w = quiet();
    aimLane(w, 0);
    const c = hold(w.spawn('shambler', 3, 0, { risen: true }));
    run(w, 2); // finish rising
    hold(c);
    expect(c.state).toBe('crawl');
    expect(w.combat.lineTrace(w.player).kind).toBe('none');
    // Stand where the line appears to cross the crawler at 0.3 m.
    const lane = laneFor(HUNTER.muzzleHeight, 0.3, c.z);
    expect(lane - c.z).toBeGreaterThan(0.7);
    expect(lane - c.z).toBeLessThan(1.3);
    aimLane(w, lane);
    expect(w.combat.lineTrace(w.player)).toMatchObject({ kind: 'zombie', id: c.id });
  });

  it('pellets spread over lanes; the nearest thing on each pellet’s line is hit', () => {
    const w = quiet();
    arm(w, 'shotgun');
    aimLane(w, 0, 10);
    for (let i = 0; i < 6; i++) hold(w.spawn('shambler', 4 - i * 0.9, -2 + i * 0.8));
    const shots = record(w, 'shot');
    const hits = record(w, 'hit');
    fireOnce(w);
    const zs = new Set(shots[0].paths.map((p) => p.to.z.toFixed(2)));
    expect(zs.size).toBeGreaterThan(3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(8);
  });

  it('the stretcher stops a round and does nothing', () => {
    const w = quiet();
    aimLane(w, 0, 4.2);
    const team = w.spawnTeam(2, depthFor(0, 0.83));
    // Move the front medic out of the line for this shot (the team re-places him next tick).
    team.front!.z = 5;
    const hits = record(w, 'hit');
    fireOnce(w);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ part: 'stretcher', damage: 0 });
    expect(team.back!.life).toBe(team.back!.maxLife);
  });

  it('riot plates: the shield blocks body hits from the front, the helmet makes the head immune, the chest plate halves body damage', () => {
    const w = quiet();
    aimLane(w, 0, 6);
    const r = hold(w.spawn('riot', 2, 0)) as Riot;
    const off = record(w, 'plateOff');
    const hits = record(w, 'hit');
    // Body height: the shield takes it.
    expect(w.combat.lineTrace(w.player).part).toBe('plate');
    for (let i = 0; i < 20 && !off.length; i++) shoot(w);
    expect(r.life).toBe(r.maxLife);
    expect(off[0].plate).toBe(PLATE_SHIELD);
    expect(hits.filter((h) => h.part === 'plate').length).toBe(Math.ceil(RIOT_PLATES.shield / 34));
    expect(r.plates & PLATE_SHIELD).toBe(0);
    // Now the chest plate: half damage to the body.
    const before = r.life;
    shoot(w);
    expect(before - r.life).toBeCloseTo(17, 5);
    // Head height: the helmet takes it, life untouched.
    r.x = 2;
    r.z = depthFor(0, 1.82);
    const l2 = r.life;
    shoot(w);
    expect(r.life).toBe(l2);
    expect(r.plates & PLATE_HELMET).toBe(PLATE_HELMET);
    expect(r.plates & PLATE_CHEST).toBe(PLATE_CHEST);
  });

  it('the crane’s hook block sits on the gun line: stand in its lane and fire to cut the rope', () => {
    const w = quiet();
    const lane = laneFor(HUNTER.muzzleHeight, (CRANE.hookY0 + CRANE.hookY1) / 2, CRANE.hookZ);
    aimLane(w, lane, 10);
    expect(w.combat.lineTrace(w.player).kind).toBe('hook');
    const crane = record(w, 'crane');
    fireOnce(w);
    expect(crane[0].state).toBe('falling');
    // A zombie in the line in front of the hook protects it.
    const w2 = quiet();
    aimLane(w2, lane, 10);
    hold(w2.spawn('shambler', 0, lane));
    expect(w2.combat.lineTrace(w2.player).kind).toBe('zombie');
  });
});
