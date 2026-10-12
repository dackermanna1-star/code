import { describe, expect, it } from 'vitest';
import { World } from '../../src/core/World';
import { Bot } from '../../src/core/Bot';
import { Seal, Turtle, Walrus } from '../../src/core/enemies';
import type { Player } from '../../src/core/Player';
import type { BulletPath, HitPart } from '../../src/core/Events';
import { FP, aimDir, type Aim } from '../../src/config/firstPerson';
import { PLAYER, PLAYER_Z_MAX, PLAYER_Z_MIN, playerXLimit } from '../../src/config/constants';
import { spreadToYaw } from '../../src/config/weapons';

/** World with level spawning disabled so tests control the field. */
function quietWorld(seed = 1): World {
  const w = new World({ seed });
  (w.level as unknown as { tracks: unknown[] }).tracks = [];
  w.phase = 'playing';
  w.level.started = true;
  w.level.ticks = -1e9;
  return w;
}

function seal(w: World, x: number, z: number, life?: number): Seal {
  const s = new Seal(w, { straight: true });
  s.x = x;
  s.z = z;
  s.vx = s.vz = 0;
  if (life) s.life = s.maxLife = life;
  w.enemies.push(s);
  return s;
}

/** Aim from the player's eye at a world point. */
function aimAt(p: Player, x: number, y: number, z: number): Aim {
  const e = p.eye();
  const dx = x - e.x;
  const dz = z - e.z;
  p.aim = { yaw: Math.atan2(dz, -dx), pitch: Math.atan2(y - e.y, Math.hypot(dx, dz)) };
  return p.aim;
}

/** Fire one trigger pull and collect what happened. */
function fire(w: World): { parts: HitPart[]; paths: BulletPath[]; rics: number } {
  const parts: HitPart[] = [];
  const paths: BulletPath[] = [];
  let rics = 0;
  const offs = [
    w.events.on('hit', (e) => parts.push(e.part)),
    w.events.on('shot', (e) => paths.push(...e.paths)),
    w.events.on('ricochet', () => rics++),
  ];
  w.player.input.fire = true;
  w.step();
  w.player.input.fire = false;
  for (const off of offs) off();
  return { parts, paths, rics };
}

describe('first-person hitscan', () => {
  it('aiming at a seal body hits it; over its head misses', () => {
    const w = quietWorld();
    const p = w.player;
    p.x = 10;
    p.z = 0;
    const s = seal(w, 0, 0);
    aimAt(p, -0.12, 0.3, 0);
    const r = fire(w);
    expect(r.parts).toEqual(['body']);
    expect(s.life).toBeLessThan(s.maxLife);
    // The bullet path starts at the eye and stops in the seal.
    expect(r.paths[0].from).toEqual(p.eye());
    expect(r.paths[0].to.x).toBeGreaterThan(-0.7);

    const w2 = quietWorld();
    w2.player.x = 10;
    w2.player.z = 0;
    const s2 = seal(w2, 0, 0);
    aimAt(w2.player, 0.36, 1.6, 0);
    const r2 = fire(w2);
    expect(r2.parts).toEqual([]);
    expect(s2.life).toBe(s2.maxLife);
    expect(r2.paths[0].ground).toBeUndefined();
    expect(Math.hypot(r2.paths[0].to.x - 10, r2.paths[0].to.y - FP.eyeHeight, r2.paths[0].to.z)).toBeCloseTo(FP.range, 3);
  });

  it('aiming at the head is a headshot with its bonus', () => {
    const w = quietWorld();
    const p = w.player;
    p.x = 10;
    p.z = 0;
    seal(w, 0, 0);
    aimAt(p, 0.36, 0.95, 0);
    const r = fire(w);
    expect(r.parts).toEqual(['head']);
    expect(p.stats.headshots).toBe(1);
    expect(p.money).toBeGreaterThanOrEqual(10);
  });

  it('shoots where it looks: yaw 90 degrees hits a creature to the side, not the one in the classic lane', () => {
    const w = quietWorld();
    const p = w.player;
    p.x = 0;
    p.z = -2;
    const side = seal(w, 0, 6);
    const lane = seal(w, -8, -2);
    aimAt(p, -0.12, 0.3, 6);
    expect(p.aim!.yaw).toBeCloseTo(Math.PI / 2, 1);
    const r = fire(w);
    expect(r.parts).toEqual(['body']);
    expect(side.life).toBeLessThan(side.maxLife);
    expect(lane.life).toBe(lane.maxLife);
    // Hit direction follows the ray (+z).
    expect(side.lastHit!.dirZ).toBeGreaterThan(0.99);
  });

  it('never hits creatures behind the eye, but hits one right in front', () => {
    const w = quietWorld();
    const p = w.player;
    p.x = 0;
    p.z = 0;
    const behind = seal(w, 3, 0);
    const behindLow = seal(w, 1, 0);
    p.aim = { yaw: 0, pitch: -0.1 };
    fire(w);
    expect(behind.life).toBe(behind.maxLife);
    expect(behindLow.life).toBe(behindLow.maxLife);

    // A walrus whose body encloses the hunter's eye (biting range) is hittable.
    const w2 = quietWorld();
    const p2 = w2.player;
    p2.x = 0;
    p2.z = 0;
    const wal = new Walrus(w2, { boss: true, z: 0, x: -1.2 });
    wal.vx = 0;
    w2.enemies.push(wal);
    p2.aim = { yaw: 0, pitch: 0 };
    expect(wal.hitVolumes().some((v) => Math.hypot((p2.x - v.x) / v.rx, (FP.eyeHeight - v.y) / v.ry, (p2.z - v.z) / v.rz) < 1)).toBe(true);
    const r = fire(w2);
    expect(r.parts.length).toBe(1);
    expect(wal.life).toBeLessThan(wal.maxLife);
    // ...but not when the hunter turns his back on it.
    const life = wal.life;
    p2.aim = { yaw: Math.PI, pitch: 0 };
    for (let i = 0; i < 20; i++) w2.step();
    fire(w2);
    expect(wal.life).toBe(life);
  });

  it('the M4 pierces two seals in line; the pistol stops at the first', () => {
    for (const [wid, expectHits] of [['m4', 2], ['pistol', 1]] as const) {
      const w = quietWorld();
      const p = w.player;
      p.money = 10000;
      if (wid !== 'pistol') p.buy(wid);
      p.x = 10;
      p.z = 0;
      const a = seal(w, 0, 0, 1000);
      const b = seal(w, -4, 0, 1000);
      aimAt(p, -4.12, 0.45, 0);
      const r = fire(w);
      expect(r.parts.length).toBe(expectHits);
      expect(a.life).toBeLessThan(1000);
      if (expectHits === 2) expect(b.life).toBeLessThan(1000);
      else expect(b.life).toBe(1000);
    }
  });

  it('turtle shell deflects bullets (ricochet path, no damage), the head takes damage', () => {
    const w = quietWorld();
    const p = w.player;
    p.x = 12;
    p.z = 0;
    const t = new Turtle(w, {});
    t.x = 0;
    t.z = 0;
    t.vx = 0;
    w.enemies.push(t);
    aimAt(p, -0.3, 1.2, 0);
    const r = fire(w);
    expect(r.rics).toBe(1);
    expect(t.life).toBe(t.maxLife);
    const ric = r.paths.filter((q) => q.ric);
    expect(ric.length).toBe(1);
    // The ricochet leaves from the shell, not from the eye.
    expect(ric[0].from.x).toBeLessThan(2);

    for (let i = 0; i < 20; i++) w.step();
    aimAt(p, 1.55, 0.8, 0);
    const r2 = fire(w);
    expect(r2.parts).toEqual(['head']);
    expect(t.life).toBeLessThan(t.maxLife);
  });

  it('shotgun pellets stay inside the spread cone, hit a near target and spread out with distance', () => {
    const near = (dist: number, seed: number) => {
      const w = quietWorld(seed);
      const p = w.player;
      p.money = 5000;
      p.buy('shotgun');
      p.x = 10;
      p.z = 0;
      const s = seal(w, 10 - dist, 0, 100000);
      const aim = aimAt(p, s.x - 0.12, 0.35, 0);
      const r = fire(w);
      return { r, aim };
    };
    let nearHits = 0;
    let farHits = 0;
    const maxYaw = spreadToYaw(7.5);
    for (let seed = 1; seed <= 6; seed++) {
      const n = near(3, seed);
      nearHits += n.r.parts.length;
      farHits += near(18, seed).r.parts.length;
      expect(n.r.paths.length).toBe(8);
      // Every pellet leaves within the cone around the aim.
      const d = aimDir(n.aim);
      for (const q of n.r.paths) {
        const v = { x: q.to.x - q.from.x, y: q.to.y - q.from.y, z: q.to.z - q.from.z };
        const l = Math.hypot(v.x, v.y, v.z);
        const ang = Math.acos((v.x * d.x + v.y * d.y + v.z * d.z) / l);
        expect(ang).toBeLessThanOrEqual(maxYaw + 1e-6);
      }
    }
    expect(nearHits).toBeGreaterThanOrEqual(6 * 4);
    expect(farHits).toBeLessThan(nearHits / 2);
  });

  it('bullets aimed at the ice stop there and say so', () => {
    const w = quietWorld();
    const p = w.player;
    p.x = 0;
    p.z = 0;
    p.aim = { yaw: 0.3, pitch: -0.5 };
    const r = fire(w);
    expect(r.paths[0].ground).toBe('ice');
    expect(r.paths[0].to.y).toBeCloseTo(0, 6);
    const tr = w.combat.aimTrace(p)!;
    expect(tr.enemy).toBeNull();
    expect(tr.ground).toBe('ice');
  });

  it('aimTrace reports the creature under the reticle', () => {
    const w = quietWorld();
    const p = w.player;
    p.x = 8;
    p.z = 1;
    const s = seal(w, 0, 1);
    aimAt(p, 0.36, 0.95, 1);
    const tr = w.combat.aimTrace(p)!;
    expect(tr.enemy).toBe(s);
    expect(tr.part).toBe('head');
    expect(tr.dist).toBeGreaterThan(7);
    p.aim = null;
    expect(w.combat.aimTrace(p)).toBeNull();
  });
});

describe('first-person projectiles and movement', () => {
  it('a grenade thrown at yaw PI/2 travels towards +z; looking up throws farther, down shorter', () => {
    const throwAt = (pitch: number) => {
      const w = quietWorld();
      const p = w.player;
      p.money = 2000;
      p.buy('grenades');
      p.x = 0;
      p.z = -10;
      p.aim = { yaw: Math.PI / 2, pitch };
      let ex: { x: number; z: number } | null = null;
      let land: number | null = null;
      w.events.on('explosion', (e) => (ex ??= { x: e.pos.x, z: e.pos.z }));
      w.events.on('grenadeBounce', (e) => (land ??= e.pos.z));
      p.input.fire = true;
      for (let i = 0; i < 10 && !w.combat.projectiles.length; i++) w.step();
      p.input.fire = false;
      const g = w.combat.projectiles[0];
      expect(g.vz).toBeGreaterThan(5);
      expect(Math.abs(g.vx)).toBeLessThan(0.5);
      expect(g.heading).toBeCloseTo(Math.PI / 2, 5);
      for (let i = 0; i < 80 && !ex; i++) w.step();
      return { ex: ex!, land: land! };
    };
    const level = throwAt(0);
    expect(level.ex.z).toBeGreaterThan(-10 + 4);
    expect(Math.abs(level.ex.x)).toBeLessThan(0.5);
    // Where it first lands (it bounces and skids on until the fuse runs out).
    const up = throwAt(0.4);
    expect(up.land).toBeGreaterThan(level.land + 1);
    const down = throwAt(-0.8);
    expect(down.land).toBeLessThan(level.land - 2);
    expect(down.land).toBeGreaterThan(-10);
  });

  it('a launcher round flies along the aim heading', () => {
    const w = quietWorld();
    const p = w.player;
    p.money = 6000;
    p.buy('flunk');
    p.x = 0;
    p.z = 0;
    p.aim = { yaw: Math.PI / 2, pitch: 0.1 };
    p.input.fire = true;
    w.step();
    const r = w.combat.projectiles[0];
    expect(r.kind).toBe('round');
    expect(r.vz).toBeGreaterThan(20);
    expect(Math.abs(r.vx)).toBeLessThan(0.5);
  });

  it('recoil pushes away from the aim heading', () => {
    for (const [yaw, ex, ez] of [[0, 1, 0], [Math.PI / 2, 0, -1], [Math.PI, -1, 0]] as const) {
      const w = quietWorld();
      const p = w.player;
      p.money = 10000;
      p.buy('awp');
      p.x = 0;
      p.z = 0;
      p.aim = { yaw, pitch: 0 };
      p.input.fire = true;
      w.step();
      const sp = Math.hypot(p.vx, p.vz);
      expect(sp).toBeGreaterThan(5);
      expect(p.vx / sp).toBeCloseTo(ex, 5);
      expect(p.vz / sp).toBeCloseTo(ez, 5);
      expect(p.vy).toBeGreaterThan(3);
    }
  });

  it('input.move walks diagonally, keeps its direction and respects the floe limits', () => {
    const w = quietWorld();
    const p = w.player;
    p.x = 0;
    p.z = 0;
    p.aim = { yaw: 0, pitch: 0 };
    p.input.move = { x: -Math.SQRT1_2, z: Math.SQRT1_2 };
    for (let i = 0; i < 40; i++) w.step();
    expect(p.state).toBe('walk');
    expect(p.x).toBeLessThan(-1.5);
    expect(p.z).toBeGreaterThan(1.5);
    // Direction kept: velocity along the desired direction, within a few degrees.
    expect(Math.abs(Math.atan2(p.vz, -p.vx) - Math.PI / 4)).toBeLessThan(0.1);
    // Over-long inputs are normalised: no faster than the per-axis maxima.
    p.input.move = { x: -3, z: 0 };
    for (let i = 0; i < 100; i++) w.step();
    expect(Math.abs(p.vx)).toBeLessThanOrEqual(PLAYER.maxSpeedX + 1e-9);
    expect(Math.abs(p.vz)).toBeLessThan(0.05); // friction stopped the depth slide
    // Limits.
    p.input.move = { x: -1, z: -1 };
    for (let i = 0; i < 600; i++) w.step();
    expect(p.z).toBeCloseTo(PLAYER_Z_MIN, 6);
    expect(p.x).toBeCloseTo(-playerXLimit(p.z), 2);
    p.input.move = { x: 0, z: 1 };
    for (let i = 0; i < 600; i++) w.step();
    expect(p.z).toBeCloseTo(PLAYER_Z_MAX, 6);
    // Releasing the stick: the hunter slides to a stop on the ice.
    p.input.move = { x: 0.6, z: 0 };
    for (let i = 0; i < 30; i++) w.step();
    p.input.move = { x: 0, z: 0 };
    for (let i = 0; i < 100; i++) w.step();
    expect(p.vx).toBe(0);
    expect(p.state).toBe('stand');
  });

  it('kicks a crawling seal in front of the heading, not one behind', () => {
    const w = quietWorld();
    const p = w.player;
    p.x = 0;
    p.z = 0;
    p.aim = { yaw: Math.PI / 2, pitch: -0.3 }; // looking at +z
    const front = seal(w, 0, 0.8);
    front.setState('crawl');
    const behind = seal(w, 0, -0.8);
    behind.setState('crawl');
    w.step();
    expect(front.dead).toBe(true);
    expect(behind.dead).toBe(false);
    expect(front.lastHit!.dirZ).toBeCloseTo(1, 5);
  });
});

describe('first-person play', () => {
  it('an aiming bot plays level 1 in first person: kills, earns, nothing breaks', () => {
    const w = new World({ seed: 3 });
    const bot = new Bot(w.player, { skill: 1 });
    const p = w.player;
    p.aim = { yaw: 0, pitch: 0 };
    let ric = 0;
    w.events.on('shot', (e) => {
      for (const q of e.paths) {
        expect(Number.isFinite(q.to.x + q.to.y + q.to.z)).toBe(true);
        if (q.ric) ric++;
      }
    });
    for (let i = 0; i < 50 * 60 && !w.gameEnded; i++) {
      bot.think(w);
      const inp = p.input;
      inp.move = { x: (inp.right ? 1 : 0) - (inp.left ? 1 : 0), z: (inp.down ? 1 : 0) - (inp.up ? 1 : 0) };
      // Look at the creature closest to escaping; fire when it is under the reticle.
      let best = null;
      for (const e of w.enemies) if (e.alive && (!best || e.x > best.x)) best = e;
      inp.fire = false;
      if (best) {
        const v = best.hitVolumes()[0];
        aimAt(p, v.x, v.y, v.z);
        inp.fire = w.combat.aimTrace(p)?.enemy === best;
      }
      w.step();
      expect(Number.isFinite(p.x + p.z + p.vx + p.vz)).toBe(true);
    }
    expect(w.phase).not.toBe('gameover');
    expect(p.stats.kills).toBeGreaterThan(15);
    expect(p.stats.hits / p.stats.shots).toBeGreaterThan(0.6);
    expect(ric).toBe(0);
  });
});

describe('classic mode is unchanged (aim null)', () => {
  // Reference numbers recorded from the code before first-person mode existed.
  const r = (n: number) => Math.round(n * 1e6) / 1e6;

  it('bot game on level 1', () => {
    const w = new World({ seed: 42 });
    const bot = new Bot(w.player, { skill: 1 });
    for (let i = 0; i < 50 * 50 && !w.gameEnded; i++) {
      bot.think(w);
      w.step();
    }
    const p = w.player;
    expect({ x: r(p.x), z: r(p.z), money: p.money, hits: p.stats.hits, kills: p.stats.kills, shots: p.stats.shots, rng: r(w.rng.next()) }).toEqual({
      x: 17.341857,
      z: -2.62628,
      money: 830,
      hits: 31,
      kills: 23,
      shots: 31,
      rng: 0.726364,
    });
  });

  it('shotgun into a line of seals', () => {
    const w = quietWorld(5);
    const p = w.player;
    p.money = 4000;
    p.buy('shotgun');
    p.x = 12;
    p.z = 0.5;
    const seals = [[0, 0], [-3, 0.8], [-6, -0.6]].map(([x, z]) => seal(w, x, z, 500));
    const t = new Turtle(w, {});
    t.x = -10;
    t.z = 0.3;
    t.vx = 0;
    w.enemies.push(t);
    let ends = 0;
    let dmg = 0;
    w.events.on('shot', (e) => {
      for (const q of e.paths) ends += q.to.x + q.to.y * 3 + q.to.z * 7;
    });
    w.events.on('hit', (e) => (dmg += e.damage + e.point.x));
    p.input.fire = true;
    for (let i = 0; i < 200; i++) w.step();
    expect({ ends: r(ends), dmg: r(dmg), lives: seals.map((s) => s.life), x: r(p.x) }).toEqual({
      ends: -448.554341,
      dmg: 662.996025,
      lives: [-20, 380, 500],
      x: 18.689872,
    });
  });

  it('grenades and turtle ricochets', () => {
    const w = quietWorld(9);
    const p = w.player;
    p.money = 2000;
    p.buy('grenades');
    p.x = 6;
    p.z = -1;
    let ex = '';
    w.events.on('explosion', (e) => (ex += `${r(e.pos.x)},${r(e.pos.z)};`));
    p.input.fire = true;
    p.input.up = true;
    for (let i = 0; i < 150; i++) w.step();
    expect(ex).toBe('-4.0325,-2.444983;-4.0325,-12.826621;');

    const w2 = quietWorld(11);
    const p2 = w2.player;
    p2.x = 15;
    p2.z = 0;
    const t = new Turtle(w2, {});
    t.x = 0;
    t.z = 0.6;
    w2.enemies.push(t);
    let rics = 0;
    let ends = 0;
    w2.events.on('ricochet', () => rics++);
    w2.events.on('shot', (e) => {
      for (const q of e.paths) ends += q.to.x + q.to.y * 3 + q.to.z * 7;
    });
    p2.input.fire = true;
    for (let i = 0; i < 400; i++) w2.step();
    expect({ rics, ends: r(ends), tx: r(t.x), life: t.life }).toEqual({ rics: 24, ends: 262.242265, tx: 15, life: 2500 });
  });
});
