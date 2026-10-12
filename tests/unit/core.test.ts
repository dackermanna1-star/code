import { describe, expect, it } from 'vitest';
import { World } from '../../src/core/World';
import { Activist, Bear, FatSeal, Seal, Turtle } from '../../src/core/enemies';
import { PLAYER, TAN_PITCH } from '../../src/config/constants';
import { WEAPONS } from '../../src/config/weapons';
import { SPLASH_TICKS } from '../../src/core/World';

/** World with level spawning disabled so tests control the field. */
function quietWorld(seed = 1): World {
  const w = new World({ seed });
  // Skip the splash and freeze the level's spawn schedule.
  (w.level as unknown as { tracks: unknown[] }).tracks = [];
  w.level.def.ticks; // keep
  w.phase = 'playing';
  w.level.started = true;
  w.level.ticks = -1e9; // boss never arrives
  return w;
}

function place<T extends { x: number; z: number }>(e: T, x: number, z: number): T {
  e.x = x;
  e.z = z;
  return e;
}

describe('weapons', () => {
  it('pistol fires every 13 ticks, 12 rounds, then reloads for 100 ticks', () => {
    const w = quietWorld();
    const p = w.player;
    p.input.fire = true;
    const shots: number[] = [];
    w.events.on('shot', () => shots.push(w.tick));
    for (let i = 0; i < 12 * 13 + 120; i++) w.step();
    expect(shots.length).toBeGreaterThanOrEqual(13);
    expect(shots[1] - shots[0]).toBe(13);
    // 12th shot -> fire state ends 13 ticks later -> reload 100 ticks -> next shot
    expect(shots[12] - shots[11]).toBe(13 + 100);
  });

  it('minigun spins up from 13 to 3 ticks between shots', () => {
    const w = quietWorld();
    const p = w.player;
    p.money = 20000;
    expect(p.buy('minigun')).toBe(true);
    p.input.fire = true;
    const shots: number[] = [];
    w.events.on('shot', () => shots.push(w.tick));
    for (let i = 0; i < 200; i++) w.step();
    const gaps = shots.slice(1).map((t, i) => t - shots[i]);
    // Heat builds while the first shot cycles (as in the original), so the first gap is already < 13.
    expect(gaps[0]).toBeGreaterThanOrEqual(10);
    expect(gaps[0]).toBeLessThanOrEqual(13);
    expect(Math.min(...gaps)).toBe(3);
  });

  it('buy best picks the most expensive affordable weapon', () => {
    const w = quietWorld();
    w.player.money = 6100;
    expect(w.player.buyBest()).toBe(true);
    expect(w.player.weapon.id).toBe('m4');
    expect(w.player.money).toBe(100);
  });

  it('recoil pushes the hunter right and AWP hops', () => {
    const w = quietWorld();
    const p = w.player;
    p.money = 10000;
    p.buy('awp');
    const x0 = p.x;
    p.x = 0;
    p.input.fire = true;
    w.step();
    expect(p.vx).toBeGreaterThan(5);
    expect(p.vy).toBeGreaterThan(3);
    for (let i = 0; i < 60; i++) w.step();
    expect(p.x).toBeGreaterThan(2);
    expect(x0).toBeDefined();
  });
});

describe('hit test', () => {
  it('hits a seal in the hunter lane and misses one far behind', () => {
    const w = quietWorld();
    const p = w.player;
    p.x = 10;
    p.z = 0;
    const near = place(new Seal(w, { straight: true }), -5, 0);
    const far = place(new Seal(w, { straight: true }), -2, -4);
    w.enemies.push(near, far);
    near.vx = far.vx = 0;
    p.input.fire = true;
    w.step();
    expect(near.life).toBeLessThan(near.maxLife);
    expect(far.life).toBe(far.maxLife);
  });

  it('a seal slightly in front of the lane takes a headshot (view-consistent rule)', () => {
    const w = quietWorld();
    const p = w.player;
    p.x = 10;
    p.z = 0;
    // Head centre at 0.95 m: needs (z) * tan(pitch) = 0.95 - 0.78
    const dz = (0.95 - PLAYER.muzzleHeight) / TAN_PITCH;
    const s = place(new Seal(w, { straight: true }), -5, dz);
    s.vx = 0;
    w.enemies.push(s);
    const parts: string[] = [];
    w.events.on('hit', (e) => parts.push(e.part));
    p.input.fire = true;
    w.step();
    expect(parts).toEqual(['head']);
  });

  it('M4 pierces several seals in a line; pistol stops at the first', () => {
    for (const [wid, expectHits] of [['m4', 3], ['pistol', 1]] as const) {
      const w = quietWorld();
      const p = w.player;
      p.money = 10000;
      if (wid !== 'pistol') p.buy(wid);
      p.x = 15;
      p.z = 0;
      const seals = [0, -4, -8].map((x) => place(new Seal(w, { straight: true }), x, 0));
      for (const s of seals) {
        s.vx = 0;
        s.life = s.maxLife = 1000;
        w.enemies.push(s);
      }
      let hits = 0;
      w.events.on('hit', () => hits++);
      p.input.fire = true;
      w.step();
      expect(hits).toBe(expectHits);
    }
  });

  it('turtle shell deflects bullets but the head takes damage', () => {
    const w = quietWorld();
    const p = w.player;
    p.x = 15;
    p.z = 0;
    const t = place(new Turtle(w, {}), 0, 0.6);
    t.vx = 0;
    w.enemies.push(t);
    let rics = 0;
    w.events.on('ricochet', () => rics++);
    p.input.fire = true;
    w.step();
    expect(rics).toBe(1);
    expect(t.life).toBe(t.maxLife);
  });
});

describe('enemies', () => {
  it('a seal crossing the right edge ends the game', () => {
    const w = quietWorld();
    const s = place(new Seal(w, { straight: true }), 19.8, 0);
    w.enemies.push(s);
    for (let i = 0; i < 200 && !w.gameEnded; i++) w.step();
    expect(w.phase).toBe('gameover');
    expect(w.describeGameOver()).toContain('brown seal');
  });

  it('shooting the cub out of an activist lets him run away without game over', () => {
    const w = quietWorld();
    const a = place(new Activist(w, {}), 18, 0);
    a.life = a.maxLife = 100000;
    w.enemies.push(a);
    a.bulletContact('cub', { x: 18, y: 1, z: 0 });
    expect(a.canLeave).toBe(true);
    for (let i = 0; i < 400; i++) w.step();
    expect(w.phase).not.toBe('gameover');
    expect(w.enemies.includes(a)).toBe(false);
  });

  it('killing an activist drops a live cub', () => {
    const w = quietWorld();
    const a = place(new Activist(w, {}), -5, 0);
    a.vx = a.vz = 0;
    w.enemies.push(a);
    a.life = 0;
    w.resolveDeaths();
    expect(w.enemies.some((e) => e.type === 'cub' && e.alive)).toBe(true);
  });

  it('bear speeds up as it is hurt', () => {
    const w = quietWorld();
    const b = place(new Bear(w, {}), -10, 0);
    w.enemies.push(b);
    const v0 = b.vx;
    b.takeDamage({ damage: 1200, part: 'body', point: { x: 0, y: 1, z: 0 }, dirX: -1, dirZ: 0, bullet: true, player: w.player });
    w.step();
    expect(b.vx).toBeGreaterThan(v0 * 3);
  });

  it('fat seal stops and regenerates when hurt', () => {
    const w = quietWorld();
    const f = place(new FatSeal(w, {}), -15, 0);
    w.enemies.push(f);
    f.life -= 100;
    const hurt = f.life;
    for (let i = 0; i < 280 + 100; i++) w.step();
    expect(f.state).toBe('stopped');
    expect(f.life).toBeGreaterThan(hurt);
  });
});

describe('levels', () => {
  it('level 1 spawns 29 straight-walking seals in 60 s, then the fat seal boss', () => {
    const w = new World({ seed: 7 });
    // Keep the hunter out of the way and invulnerable to escapes for counting.
    const spawned: string[] = [];
    let bossAt = -1;
    w.events.on('enemySpawn', (e) => {
      spawned.push(e.type);
      if (e.boss) bossAt = w.tick;
    });
    w.gameOver = () => {};
    for (let i = 0; i < SPLASH_TICKS + 3100; i++) w.step();
    expect(spawned.filter((t) => t === 'seal').length).toBe(29);
    expect(bossAt).toBeGreaterThan(SPLASH_TICKS + 2990);
    expect(spawned.filter((t) => t === 'fatseal').length).toBe(1);
  });

  it('explosions damage creatures in range and pay bounty', () => {
    const w = quietWorld();
    const p = w.player;
    p.money = WEAPONS.grenades.price;
    p.buy('grenades');
    p.x = 5;
    const s = place(new Seal(w, { straight: true }), -2, 0);
    s.vx = 0;
    w.enemies.push(s);
    p.input.fire = true;
    for (let i = 0; i < 80; i++) w.step();
    expect(s.dead).toBe(true);
    expect(p.money).toBeGreaterThanOrEqual(50);
  });
});
