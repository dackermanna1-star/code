// Bosses: Big Dave, The Marathon, The Riot Squad.
import { describe, expect, it } from 'vitest';
import { BIG_DAVE, BOSS_BOUNTY, MARATHON, RIOT_PLATES, RIOT_SQUAD, ZOMBIES } from '../src/config/zombies';
import { FEEL, GAS } from '../src/config/rules';
import { PLATE_CHEST, PLATE_HELMET, PLATE_SHIELD } from '../src/config/ids';
import { RIOT_SQUAD_Z } from '../src/config/chapters';
import { World } from '../src/core/World';
import type { Riot } from '../src/core/zombies';
import { quiet, record, run, until } from './helpers';

/** A real (not quiet) chapter: field cleared, boss called in (marathon: first wave out). */
function bossWorld(chapter: number): World {
  const w = new World({ seed: 11, startChapter: chapter, skipSplash: true, god: true });
  w.clearZombies();
  w.skipToBoss();
  until(w, () => w.phase === 'boss', 1);
  w.step();
  return w;
}

describe('Big Dave', () => {
  it('belches a gas cloud 4 m ahead in his lane every few seconds', () => {
    const w = quiet();
    const d = w.spawn('bigdave', -20, 1, { boss: true });
    const belch = record(w, 'belch');
    const gas = record(w, 'gas');
    const daveX: number[] = [];
    w.events.on('belch', () => daveX.push(d.x));
    run(w, BIG_DAVE.belchEvery * 3 + 0.4 + BIG_DAVE.belchSeconds / 2 + 0.1);
    expect(belch.length).toBe(3);
    expect(gas[0].x - belch[0].x).toBeCloseTo(0, 5);
    expect(belch[0].z).toBeCloseTo(d.z, 5);
    expect(belch[0].x - daveX[0]).toBeCloseTo(BIG_DAVE.belchAhead, 5);
    expect(gas[0].radius).toBe(GAS.radius);
  });

  it('enrages at 50% life: tears off the apron and walks faster', () => {
    const w = quiet();
    const d = w.spawn('bigdave', -20, 0, { boss: true });
    run(w, 0.5);
    const en = record(w, 'enrage');
    d.damage({ damage: d.maxLife * 0.55, part: 'body', point: { x: d.x, y: 1.5, z: d.z }, dirX: -1, dirZ: 0, source: 'bullet', player: w.player, weapon: 'nailgun' });
    w.step();
    expect(en).toHaveLength(1);
    expect(d.enraged).toBe(true);
    expect(d.state).toBe('enrage');
    run(w, BIG_DAVE.enrageSeconds + 0.1);
    expect(['walk', 'belch']).toContain(d.state);
    expect(d.speed).toBe(BIG_DAVE.enragedSpeed);
  });

  it('dies in a huge pop: a radius-4 gas cloud, 6 crawlers, boss slow motion, $1000', () => {
    const w = quiet();
    const d = w.spawn('bigdave', -10, 0, { boss: true });
    const gas = record(w, 'gas');
    const spawns = record(w, 'spawn');
    const slow = record(w, 'slowmo');
    const money = record(w, 'money');
    const deaths = record(w, 'zombieDeath');
    d.damage({ damage: 99999, part: 'body', point: { x: d.x, y: 1.5, z: d.z }, dirX: -1, dirZ: 0, source: 'bullet', player: w.player, weapon: 'revolver' });
    w.resolveDeaths();
    expect(deaths[0]).toMatchObject({ kind: 'bigdave', deathKind: 'pop', boss: true, corpseId: null });
    expect(gas.at(-1)!.radius).toBe(BIG_DAVE.popGasRadius);
    expect(spawns.filter((s) => s.risen)).toHaveLength(BIG_DAVE.popCrawlers);
    expect(slow).toContainEqual(FEEL.bossSlowmo);
    expect(money.find((m) => m.reason === 'bounty')!.amount).toBe(ZOMBIES.bigdave.bounty);
  });

  it('arrives at the end of chapter 1’s spawn phase and the boss bar tracks his life', () => {
    const w = bossWorld(1);
    const dave = w.level.bosses[0];
    expect(dave.kind).toBe('bigdave');
    expect(w.phase).toBe('boss');
    expect(w.bossName).toBe('Big Dave');
    expect(w.bossLife).toBe(1);
    dave.life = dave.maxLife * 0.25;
    expect(w.bossLife).toBeCloseTo(0.25, 5);
  });
});

describe('The Marathon', () => {
  it('40 runners in waves of 8 every 4 s, the 40th wears the gold medal', () => {
    const w = new World({ seed: 5, startChapter: 2, skipSplash: true, god: true });
    w.skipToBoss();
    const boss = record(w, 'bossSpawn');
    const spawns: Array<{ t: number; id: number }> = [];
    w.events.on('spawn', (e) => e.boss && spawns.push({ t: w.tick, id: e.zombieId }));
    until(w, () => boss.length > 0, 1);
    expect(boss[0].name).toBe('The Marathon');
    run(w, MARATHON.waveEvery * 5 + 0.1);
    expect(spawns).toHaveLength(MARATHON.total);
    const waves = new Map<number, number>();
    for (const s of spawns) waves.set(s.t, (waves.get(s.t) ?? 0) + 1);
    expect([...waves.values()]).toEqual([8, 8, 8, 8, 8]);
    const times = [...waves.keys()];
    expect((times[1] - times[0]) / 50).toBeCloseTo(MARATHON.waveEvery, 1);
    const runners = spawns.map((s) => w.zombieById(s.id)).filter((z) => z);
    const medal = w.level.bosses.filter((z) => z.medal);
    expect(medal).toHaveLength(1);
    expect(medal[0].id).toBe(spawns[39].id);
    expect(medal[0].bounty).toBe(BOSS_BOUNTY.marathonMedal);
    expect(runners.every((z) => z!.kind === 'jogger' && z!.isBoss)).toBe(true);
  });

  it('waits for a clear field (the boss comes alone)', () => {
    const w = new World({ seed: 5, startChapter: 2, skipSplash: true, god: true });
    w.level.skipSpawns();
    w.spawn('shambler', -20, 0);
    const boss = record(w, 'bossSpawn');
    run(w, 3);
    expect(boss).toHaveLength(0);
    w.clearZombies();
    run(w, 0.1);
    expect(boss).toHaveLength(1);
  });

  it('the boss bar counts runners not yet out as full life', () => {
    const w = bossWorld(2);
    expect(w.bossLife).toBeCloseTo(1, 5);
    expect(w.level.bossesLeft).toBe(MARATHON.total);
    expect(w.level.bosses).toHaveLength(MARATHON.perWave);
    for (const z of w.level.bosses) z.life = 0;
    w.resolveDeaths();
    expect(w.bossLife).toBeCloseTo((MARATHON.total - MARATHON.perWave) / MARATHON.total, 5);
  });
});

describe('The Riot Squad', () => {
  it('three brutes in formation at z −3, 0, +3 with all plates on, $800 each; ordinary spawns continue', () => {
    const w = bossWorld(3);
    const squad = w.level.bosses as Riot[];
    expect(squad.map((z) => z.z)).toEqual(RIOT_SQUAD_Z);
    for (const r of squad) {
      expect(r.kind).toBe('riot');
      expect(r.plates).toBe(PLATE_HELMET | PLATE_SHIELD | PLATE_CHEST);
      expect(r.bounty).toBe(BOSS_BOUNTY.riot);
      expect(r.maxLife).toBe(ZOMBIES.riot.life * RIOT_SQUAD.lifeMult);
      expect(r.plateHp[PLATE_SHIELD]).toBe(RIOT_PLATES.shield * RIOT_SQUAD.plateMult);
    }
    const spawns = record(w, 'spawn');
    run(w, 6);
    expect(spawns.filter((s) => !s.boss).length).toBeGreaterThan(1);
    expect(w.bossName).toBe('The Riot Squad');
  });
});
