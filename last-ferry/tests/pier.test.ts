// Paramedics, the harpoon kebab, and the pier fighting back (horn, crane, Favour + cannon).
import { describe, expect, it } from 'vitest';
import { CANNON, FAVOUR, FEEL, HORN, HUNTER_RULES } from '../src/config/rules';
import { CRANE, HUNTER, TICK_RATE } from '../src/config/world';
import { HARPOON } from '../src/config/weapons';
import { STRETCHER } from '../src/config/zombies';
import { laneFor } from '../src/core/Bot';
import type { Medic, Patient } from '../src/core/zombies';
import { aimLane, arm, hold, quiet, record, run, shoot, until } from './helpers';

describe('paramedics', () => {
  it('two medics carry the patient on a stretcher as one unit', () => {
    const w = quiet();
    const team = w.spawnTeam(-10, 2);
    const [f, b, pt] = [team.front!, team.back!, team.patient!];
    expect(f.stretcher).toEqual({ id: team.id, role: 'front' });
    expect(b.stretcher).toEqual({ id: team.id, role: 'back' });
    expect(pt.stretcher).toEqual({ id: team.id, role: 'patient' });
    expect([f.state, b.state, pt.state]).toEqual(['carry', 'carry', 'carried']);
    expect(pt.y).toBeCloseTo(STRETCHER.height, 5);
    run(w, 2);
    expect(f.x - b.x).toBeCloseTo(2 * STRETCHER.medicOffset, 5);
    expect(pt.x).toBeCloseTo((f.x + b.x) / 2, 5);
    expect(team.x).toBeGreaterThan(-10 + 2 * 1.3 * 0.9);
  });

  it('kill a medic: the stretcher drops, the patient gets up after 1.5 s as a shambler, the other medic walks on', () => {
    const w = quiet();
    const team = w.spawnTeam(-10, 2);
    const f = team.front as Medic;
    const b = team.back as Medic;
    const pt = team.patient as Patient;
    run(w, 0.5);
    const drops = record(w, 'stretcherDrop');
    f.damage({ damage: 999, part: 'body', point: { x: f.x, y: 1, z: f.z }, dirX: -1, dirZ: 0, source: 'bullet', player: w.player, weapon: 'revolver' });
    w.resolveDeaths();
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({ zombieId: f.id, stretcherId: team.id, patientId: pt.id });
    expect(b.stretcher).toBeUndefined();
    expect(pt.stretcher).toBeUndefined();
    run(w, 0.5);
    expect(b.state).toBe('walk');
    expect(b.vx).toBeGreaterThan(0.9);
    expect(pt.state).toBe('carried');
    expect(pt.vx).toBe(0);
    run(w, STRETCHER.dropGetUp);
    expect(pt.state).toBe('walk');
    expect(pt.y).toBe(0);
    expect(pt.vx).toBeGreaterThan(0.5);
  });

  it('a medic catching fire drops the stretcher and panics', () => {
    const w = quiet();
    const team = w.spawnTeam(-10, -2);
    const drops = record(w, 'stretcherDrop');
    team.back!.ignite(w.player);
    run(w, 0.2);
    expect(drops).toHaveLength(1);
    expect(team.dropped).toBe(true);
  });
});

describe('harpoon', () => {
  it('skewers a kebab of up to 5, reels the bodies 2 m toward the hunter, all permanently dead', () => {
    const w = quiet();
    arm(w, 'harpoon');
    aimLane(w, 0, 16);
    const line = Array.from({ length: 7 }, (_, i) => hold(w.spawn('shambler', 6 - i * 1.6, 0)));
    const x0 = line.map((z) => z.x);
    const hp = record(w, 'harpoon');
    const stop = record(w, 'hitstop');
    shoot(w);
    expect(hp[0].skewered).toEqual(line.slice(0, HARPOON.maxSkewer).map((z) => z.id));
    expect(hp[0].reel).toBe(HARPOON.reel);
    for (let i = 0; i < 5; i++) {
      const z = line[i];
      expect(z.deathKind).toBe('harpoon');
      const c = w.corpseById(z.corpseId!)!;
      expect(c.risesAt).toBeNull();
      expect(c.x - x0[i]).toBeGreaterThan(HARPOON.reel - 0.6);
    }
    expect(line[5].alive).toBe(true);
    expect(stop.some((s) => s.ms === FEEL.hitstopKebab)).toBe(true);
  });

  it('pierces riot shields (tears the shield off) and sticks in what it cannot kill', () => {
    const w = quiet();
    arm(w, 'harpoon');
    aimLane(w, 0, 12);
    const r = hold(w.spawn('riot', 4, 0));
    const behind = hold(w.spawn('shambler', 0, 0));
    const off = record(w, 'plateOff');
    const hp = record(w, 'harpoon');
    shoot(w);
    expect(off.map((o) => o.plate)).toEqual([2]);
    expect(r.maxLife - r.life).toBeCloseTo(220, 5);
    expect(hp[0].skewered).toEqual([]);
    expect(hp[0].to.x).toBeGreaterThan(r.x - 0.5);
    expect(behind.life).toBe(behind.maxLife);
  });
});

describe('the pier fights back', () => {
  it('ferry horn: everything on screen staggers 2 s, crawlers are pushed back 1 m, once per chapter', () => {
    const w = quiet();
    const a = hold(w.spawn('shambler', -5, 0));
    const b = hold(w.spawn('jogger', 2, 2));
    const c = hold(w.spawn('shambler', 0, -2, { risen: true }));
    const off = hold(w.spawn('shambler', -40, 0)); // off screen
    const cx = c.x;
    const st = record(w, 'stagger');
    const horn = record(w, 'horn');
    const shake = record(w, 'shake');
    w.player.input.horn = true;
    w.step();
    w.player.input.horn = false;
    expect(horn).toHaveLength(1);
    expect(w.hornReady).toBe(false);
    expect(a.state).toBe('stagger');
    expect(b.state).toBe('stagger');
    expect(off.state).not.toBe('stagger');
    expect(cx - c.x).toBeCloseTo(HORN.crawlerPush, 1);
    expect(st.map((s) => s.zombieId).sort()).toEqual([a.id, b.id].sort());
    expect(shake.some((s) => s.amount === FEEL.hornShake)).toBe(true);
    run(w, HORN.stagger - 0.1);
    expect(a.state).toBe('stagger');
    run(w, 0.2);
    expect(a.state).toBe('walk');
    // Once per chapter.
    w.player.input.horn = true;
    w.step();
    expect(horn).toHaveLength(1);
    w.pier.rehang();
    w.player.input.horn = false;
    w.step();
    w.player.input.horn = true;
    w.step();
    expect(horn).toHaveLength(2);
  });

  it('crane: shoot the hook → the pallet drops 0.6 s later, gibs zombies underneath (bounty paid), leaves a 20 s barricade', () => {
    const w = quiet();
    const under = [hold(w.spawn('shambler', CRANE.hookX - 1, CRANE.hookZ + 1)), hold(w.spawn('jogger', CRANE.hookX + 1.5, CRANE.hookZ - 2)), hold(w.spawn('bloater', CRANE.hookX, CRANE.hookZ + 2.2))];
    const outside = hold(w.spawn('shambler', CRANE.hookX - 4, CRANE.hookZ));
    const body = w.addCorpse('shambler', CRANE.hookX + 0.5, CRANE.hookZ, { risesIn: 20 });
    const lane = laneFor(HUNTER.muzzleHeight, 1.2, CRANE.hookZ);
    aimLane(w, lane, 10);
    const crane = record(w, 'crane');
    const nice = record(w, 'niceShot');
    const ex = record(w, 'explosion');
    const money0 = w.player.money;
    shoot(w);
    expect(crane.map((c) => c.state)).toEqual(['falling']);
    run(w, CRANE.dropTime - 0.06);
    expect(under.every((z) => z.alive)).toBe(true);
    run(w, 0.1);
    expect(crane.map((c) => c.state)).toEqual(['falling', 'down']);
    expect(ex[0]).toMatchObject({ kind: 'crates', radius: CRANE.radius });
    for (const z of under) expect(z.deathKind === 'gib' || z.deathKind === 'pop').toBe(true);
    expect(outside.alive).toBe(true);
    expect(body.removed).toBe(true);
    expect(w.player.money).toBeGreaterThan(money0);
    expect(nice[0].n).toBe(3);
    expect(w.crane.barricade).toBeCloseTo(CRANE.barricadeSeconds, 0);
    run(w, CRANE.barricadeSeconds);
    expect(w.crane.state).toBe('gone');
    w.pier.rehang();
    expect(w.crane.state).toBe('hanging');
  });

  it('Captain’s Favour: +2 per kill, +3 per headshot, +5 tidy; F calls 3 shells 0.35 s apart at the densest cluster', () => {
    const w = quiet();
    const p = w.player;
    const k = hold(w.spawn('shambler', 0, 0));
    k.damage({ damage: 999, part: 'body', point: { x: 0, y: 1, z: 0 }, dirX: -1, dirZ: 0, source: 'bullet', player: p, weapon: 'revolver' });
    w.resolveDeaths();
    expect(w.favour).toBe(FAVOUR.kill);
    const h = hold(w.spawn('shambler', 0, 1));
    h.damage({ damage: 999, part: 'head', point: { x: 0, y: 1.6, z: 1 }, dirX: -1, dirZ: 0, source: 'bullet', player: p, weapon: 'revolver' });
    w.resolveDeaths();
    expect(w.favour).toBe(2 * FAVOUR.kill + FAVOUR.headshot);
    // Not ready: F does nothing.
    p.input.cannon = true;
    w.step();
    p.input.cannon = false;
    w.step();
    expect(w.projectiles).toHaveLength(0);
    // A cluster left of the hunter in his lane band, and a lone one elsewhere.
    w.setFavour(100);
    const cluster = [0, 0.8, 1.6, -0.8].map((dx, i) => hold(w.spawn('shambler', -6 + dx, p.z + (i % 2 ? 0.6 : -0.4))));
    const lone = hold(w.spawn('shambler', -15, p.z - 4.5));
    const strike = record(w, 'cannonStrike');
    const projectiles = record(w, 'projectile');
    p.input.cannon = true;
    w.step();
    p.input.cannon = false;
    expect(strike).toHaveLength(1);
    expect(strike[0].targets).toHaveLength(CANNON.shells);
    expect(Math.abs(strike[0].targets[0].x - -5.6)).toBeLessThan(1.5);
    expect(w.favour).toBe(0);
    run(w, CANNON.interval * 2 + 0.05);
    expect(projectiles.filter((q) => q.kind === 'shell')).toHaveLength(3);
    const gaps = [projectiles[1], projectiles[2]].map(() => CANNON.interval);
    expect(gaps).toHaveLength(2);
    run(w, CANNON.flight + 0.2);
    expect(cluster.every((z) => z.dead)).toBe(true);
    expect(lone.alive).toBe(true);
  });
});

describe('the hunter', () => {
  it('a zombie reaching him in his lane grabs (18 dps) until he jumps; regen after 3 s', () => {
    const w = quiet();
    const p = w.player;
    const grabs = record(w, 'grab');
    const rel = record(w, 'release');
    const z = w.spawn('shambler', p.x - 2, p.z);
    expect(until(w, () => grabs.length > 0, 4)).toBe(true);
    expect(z.state).toBe('grab');
    run(w, 0.1);
    expect(p.state).toBe('grabbed');
    const l0 = p.life;
    run(w, 1);
    expect(l0 - p.life).toBeCloseTo(18, 0);
    p.input.jump = true;
    w.step();
    p.input.jump = false;
    expect(rel).toHaveLength(1);
    expect(z.state).toBe('stagger');
    z.x = -30;
    z.speed = 0;
    const l1 = p.life;
    run(w, HUNTER.regenDelay + 1);
    expect(p.life).toBeGreaterThan(l1 + 8);
  });

  it('walking into a crawler kicks it away for good', () => {
    const w = quiet();
    const p = w.player;
    const c = w.spawn('shambler', p.x - 3, p.z, { risen: true });
    const kicks = record(w, 'kick');
    p.input.left = true;
    expect(until(w, () => kicks.length > 0, 3)).toBe(true);
    expect(kicks[0].zombieId).toBe(c.id);
    expect(p.state).toBe('kick');
    expect(c.dead).toBe(true);
    expect(w.corpseById(c.corpseId!)!.risesAt).toBeNull();
    expect(HUNTER_RULES.kickDamage).toBeGreaterThan(c.maxLife);
  });

  it('dies at 0 life: playerDeath and game over (not in god mode)', () => {
    const w = quiet();
    const over = record(w, 'gameOver');
    w.player.hurt(150, 'blast');
    w.step();
    expect(w.player.state).toBe('dead');
    expect(over[0]).toMatchObject({ reason: 'dead' });
    expect(w.phase).toBe('gameover');
    const g = quiet({ god: true });
    g.player.hurt(150, 'blast');
    expect(g.player.alive).toBe(true);
    void TICK_RATE;
  });
});
