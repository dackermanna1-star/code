import { describe, expect, it } from 'vitest';
import { World } from '../../src/core/World';
import { createTeammateBots } from '../../src/core/Bot';
import { Seal, Turtle, createEnemy } from '../../src/core/enemies';
import { ENEMY_Z_MAX, ENEMY_Z_MAX_COOP, ENEMY_Z_MIN, ENEMY_Z_MIN_COOP } from '../../src/config/constants';
import { LEVELS } from '../../src/config/levels';

describe('bot teammates (original co-op rules)', () => {
  it('adds up to three named bots; single player is unchanged', () => {
    const solo = new World({ seed: 1 });
    expect(solo.players.length).toBe(1);
    expect(solo.laneMin).toBe(ENEMY_Z_MIN);
    expect(solo.laneMax).toBe(ENEMY_Z_MAX);

    const w = new World({ seed: 1, teammates: 3 });
    expect(w.players.length).toBe(4);
    expect(w.player.isBot).toBe(false);
    expect(w.players.slice(1).every((p) => p.isBot)).toBe(true);
    expect(w.players.slice(1).map((p) => p.name)).toEqual(['Kiddie', 'Zombie', 'Urod']);
    expect(w.laneMin).toBe(ENEMY_Z_MIN_COOP);
    expect(w.laneMax).toBe(ENEMY_Z_MAX_COOP);
    const seven = new World({ seed: 1, teammates: 7 });
    expect(seven.players.length).toBe(8);
    expect(seven.players.slice(1).map((p) => p.name)).toEqual(['Kiddie', 'Zombie', 'Urod', 'Husky', 'Frosty', 'Blubber', 'Mukluk']);
    expect(new World({ teammates: 12 }).players.length).toBe(8);
  });

  it('scales the spawn counts like the original (n + 0.85 n per extra hunter)', () => {
    const solo = new World({ seed: 2 });
    const team = new World({ seed: 2, teammates: 2 });
    const n = LEVELS[0].enemies.reduce((a, [, k]) => a + k, 0);
    expect(solo.level.total).toBe(n);
    const want = LEVELS[0].enemies.reduce((a, [, k]) => a + k + Math.floor(0.85 * k * 2), 0);
    expect(team.level.total).toBe(want);
  });

  it('stops scaling the creatures after the 3rd bot', () => {
    const three = new World({ seed: 2, teammates: 3 });
    for (const n of [4, 5, 6, 7]) {
      const w = new World({ seed: 2, teammates: n });
      expect(w.level.total).toBe(three.level.total);
      expect(w.laneMin).toBe(three.laneMin);
      expect(w.laneMax).toBe(three.laneMax);
    }
    expect(three.level.total).toBeGreaterThan(new World({ seed: 2, teammates: 2 }).level.total);
  });

  it('seven bots spread over seven sides of the field and keep separate start spots', () => {
    const w = new World({ seed: 9, teammates: 7 });
    const bots = createTeammateBots(w, 1);
    const said: string[] = [];
    w.events.on('say', (e) => said.push(e.text));
    for (let i = 0; i < 50 * 45 && !w.gameEnded; i++) {
      for (const b of bots) b.think(w);
      w.step();
    }
    expect(w.gameEnded).toBe(false);
    for (const side of ['top', 'upper side', 'upper middle', 'middle', 'lower middle', 'lower side', 'bottom']) {
      expect(said.some((s) => s.endsWith(`keep the ${side} of the field`))).toBe(true);
    }
    const starts = new World({ seed: 9, teammates: 7 }).players.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`);
    expect(new Set(starts).size).toBe(8);
  });

  it('creatures use the wider lane band with teammates', () => {
    const w = new World({ seed: 3, teammates: 1 });
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 400; i++) {
      const e = createEnemy(w, 'seal');
      lo = Math.min(lo, e.z);
      hi = Math.max(hi, e.z);
    }
    expect(lo).toBeLessThan(ENEMY_Z_MIN);
    expect(hi).toBeGreaterThan(ENEMY_Z_MAX);
    expect(lo).toBeGreaterThanOrEqual(ENEMY_Z_MIN_COOP);
    expect(hi).toBeLessThanOrEqual(ENEMY_Z_MAX_COOP);
  });

  it('bear and turtle levels get a pair of bosses with teammates', () => {
    for (const num of [3, 4]) {
      const w = new World({ seed: num, startLevel: num, teammates: 1 });
      w.gameOver = () => {};
      const def = LEVELS[num - 1];
      for (let i = 0; i < 104 + def.ticks + 60; i++) {
        w.step();
        for (const e of w.enemies) if (!e.isBoss) e.removed = true;
      }
      expect(w.level.bosses.length).toBe(2);
      expect(Math.abs(w.level.bosses[0].z - w.level.bosses[1].z)).toBeGreaterThan(2);
    }
  });

  it('three bots hold level 1 on their own, greet, and keep separate sides', () => {
    const w = new World({ seed: 7, teammates: 3 });
    const bots = createTeammateBots(w, 1);
    const said: string[] = [];
    w.events.on('say', (e) => said.push(`${w.players[e.playerId].name}: ${e.text}`));
    // The human stands still and never fires.
    for (let i = 0; i < 50 * 60 && !w.gameEnded; i++) {
      for (const b of bots) b.think(w);
      w.step();
    }
    expect(w.gameEnded).toBe(false);
    const botKills = w.players.slice(1).reduce((a, p) => a + p.stats.kills, 0);
    expect(botKills).toBeGreaterThan(15);
    expect(w.player.stats.kills).toBe(0);
    expect(said[0]).toMatch(/^Kiddie: Hey You, Zombie, Urod, let's kill them all!/);
    expect(said.some((s) => s.startsWith('Urod: ') && s.includes('bottom'))).toBe(true);
    // Each bot spends most of its time in its own band.
    const zs = w.players.slice(1).map((p) => p.z);
    expect(zs[0]).toBeLessThan(zs[2]);
    for (const p of w.players) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    }
  });
});

describe('laser sight line (classic)', () => {
  function quiet(): World {
    const w = new World({ seed: 1 });
    (w.level as unknown as { tracks: unknown[] }).tracks = [];
    w.phase = 'playing';
    w.level.started = true;
    w.level.ticks = -1e9;
    return w;
  }

  it('stops at the first creature on the gun line, like the bullet', () => {
    const w = quiet();
    const p = w.player;
    const near = new Seal(w, { z: p.z });
    near.x = p.x - 6;
    const far = new Seal(w, { z: p.z });
    far.x = p.x - 14;
    w.addEnemy(near, false);
    w.addEnemy(far, false);
    const t = w.combat.lineTrace(p);
    expect(t.enemy).toBe(near);
    expect(t.x).toBeGreaterThan(near.x - near.def.halfLength);
    expect(t.x).toBeLessThan(near.x + near.def.halfLength + 0.1);
    // It agrees with the bot's line target.
    expect(w.combat.lineTarget(p)).toBe(near);
  });

  it('runs to the far edge when nothing is in the lane; the turtle shell stops it', () => {
    const w = quiet();
    const p = w.player;
    const off = new Seal(w, { z: p.z + 4 });
    off.x = p.x - 8;
    w.addEnemy(off, false);
    const t = w.combat.lineTrace(p);
    expect(t.enemy).toBeNull();
    expect(t.x).toBeLessThan(-20);
    const tur = new Turtle(w, { z: p.z });
    tur.x = p.x - 10;
    w.addEnemy(tur, false);
    expect(w.combat.lineTrace(p).enemy).toBe(tur);
  });
});
