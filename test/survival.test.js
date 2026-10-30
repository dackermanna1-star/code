import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, makeRng } from '../src/physics/math.js';
import { World } from '../src/physics/world.js';
import { Ragdoll } from '../src/human/ragdoll.js';
import { BodyShape } from '../src/human/bodyShape.js';
import { SurvivalGame, waveSpec } from '../src/game/survival.js';
import { STATION, CAR } from '../src/game/subway.js';
import { freeTest } from '../src/game/flowfield.js';
import { FpsPlayer } from '../src/fps/player.js';
import { Arsenal } from '../src/fps/arsenal.js';

const segNames = new Ragdoll(new World()).segList.map((s) => s.name);
const shape = new BodyShape(segNames);
const idle = { move: { x: 0, z: 0 }, look: { dx: 0, dy: 0 }, sprint: false, crouch: false, jump: false };

test('waves grow, bring more runners, and every fifth one a brute', () => {
  const w1 = waveSpec(1), w4 = waveSpec(4), w5 = waveSpec(5), w10 = waveSpec(10);
  assert.ok(w4.kinds.length > w1.kinds.length);
  assert.equal(w1.kinds.filter((k) => k === 'runner').length, 0, 'no runners on the first wave');
  assert.ok(w4.kinds.filter((k) => k === 'runner').length > 0);
  assert.ok(w5.boss && w5.brutes >= 1);
  assert.ok(w10.brutes >= 2);
  assert.ok(!w4.boss);
});

test('a stopped train is connected to the platform through its doors (and only through them)', () => {
  const g = new SurvivalGame({ shape, rng: makeRng(1) });
  const t = g.level.addTrain(-1, 1);
  while (t.state !== 'stopped') g.level.update(1 / 60);
  g.update(1 / 60);
  const f = g.flow;
  const door = t.doors()[4];
  const inCar = f.cell(door.inside.x, door.inside.z - 0.5);
  assert.ok(f.free[inCar] && isFinite(f.dist[inCar]), 'the car interior is reachable');
  // behind a stretch of car wall between two doors there is no way out
  const wall = f.cell(door.x + 2.8, -STATION.W - 0.2);
  assert.equal(f.free[wall], 0, 'the car side wall blocks the way');
  const path = f.pathFrom(new Vec3(door.inside.x, 0, door.inside.z - 0.6), g.player.pos);
  assert.ok(path && path.length >= 2, 'a route out of the car and across the platform');
});

test('trains bring the wave in, wait for it to get off, and leave', () => {
  const g = new SurvivalGame({ shape, rng: makeRng(2) });
  g.opts.firstDelay = 0.5;
  const seen = new Set();
  let onPlatform = 0;
  for (let i = 0; i < 60 * 40; i++) {
    g.player.update(1 / 60, idle, g.playerEnv());
    g.update(1 / 60);
    for (const e of g.drainEvents()) seen.add(e.type);
    g.sb.drainFx();
    onPlatform = Math.max(onPlatform, g.alive.filter((z) => Math.abs(z.rd.pelvis.pos.z) < STATION.W - 0.3).length);
    if (seen.has('trainDeparting') && onPlatform >= 3) break;
  }
  for (const k of ['waveStart', 'trainIncoming', 'trainStopped', 'zombieSpawned', 'trainDeparting']) assert.ok(seen.has(k), k);
  assert.ok(onPlatform >= 3, `zombies came off the train onto the platform (${onPlatform})`);
});

test('a train runs down whoever is on the tracks in front of it', () => {
  const g = new SurvivalGame({ shape, rng: makeRng(3) });
  const p = g.sb.spawnPerson(new Vec3(-10, -STATION.pitDepth, STATION.trackZ), 0);
  const t = g.level.addTrain(1, 1);
  let hit = false;
  for (let i = 0; i < 60 * 20 && t.state === 'arriving'; i++) {
    g.level.update(1 / 60);
    for (const e of g.level.drainEvents()) if (e.type === 'trainHit' && e.person === p) hit = true;
    g.sb.step(1 / 60);
    g.sb.drainFx();
  }
  assert.ok(hit, 'hit');
  assert.equal(p.injury.alive, false);
  assert.equal(p.injury.deathCause, 'hit by a train');
});

test('the player is stopped by a column, drops into the track pit and climbs back out', () => {
  const g = new SurvivalGame({ shape, rng: makeRng(4) });
  const pl = g.player;
  // walk west into the column at x = -8, z = 2.4
  pl.pos.set(-6, 0, 2.4);
  pl.yaw = Math.PI / 2; // facing -x
  for (let i = 0; i < 90; i++) pl.update(1 / 60, { ...idle, move: { x: 0, z: 1 } }, g.playerEnv());
  assert.ok(pl.pos.x > -8 + 0.3 + 0.28, `held by the column (x ${pl.pos.x.toFixed(2)})`);
  // walk north off the platform edge into the pit
  pl.pos.set(10, 0, 3.6);
  pl.yaw = Math.PI; // facing +z
  for (let i = 0; i < 90; i++) pl.update(1 / 60, { ...idle, move: { x: 0, z: 1 } }, g.playerEnv());
  assert.ok(pl.pos.y < -STATION.pitDepth + 0.05, `down in the pit (y ${pl.pos.y.toFixed(2)})`);
  assert.equal(pl.alive, true, 'a 1.15 m drop does not kill');
  // turn round and climb back up
  pl.yaw = 0; // facing -z
  pl.pos.z = STATION.W + 0.45;
  for (let i = 0; i < 20; i++) pl.update(1 / 60, { ...idle, move: { x: 0, z: 1 }, jump: i < 3 }, g.playerEnv());
  for (let i = 0; i < 60; i++) pl.update(1 / 60, { ...idle, move: { x: 0, z: 1 } }, g.playerEnv());
  assert.ok(Math.abs(pl.pos.y) < 0.02 && pl.pos.z < STATION.W, `back on the platform (y ${pl.pos.y.toFixed(2)}, z ${pl.pos.z.toFixed(2)})`);
});

test('guns: rounds come out of the magazine, reloads refill it, the shotgun loads shell by shell', () => {
  const a = new Arsenal();
  const pistol = a.gun;
  for (let i = 0; i < 40; i++) a.update(1 / 60, false, false); // drawn
  let shots = 0;
  for (let i = 0; i < 60; i++) if (a.update(1 / 60, i % 2 === 0, false)) shots++;
  assert.ok(shots >= 5 && pistol.ammo === pistol.mag - shots, `semi-auto: one round per pull (${shots})`);
  a.reload();
  for (let i = 0; i < 120; i++) a.update(1 / 60, false, false);
  assert.equal(pistol.ammo, pistol.mag, 'reloaded');
  assert.equal(pistol.spare, pistol.reserve - shots, 'from the reserve');
  assert.equal(a.update(1 / 60, true, true), false, 'no firing while sprinting');
  a.select(2);
  for (let i = 0; i < 60; i++) a.update(1 / 60, false, false);
  const sg = a.gun;
  assert.equal(sg.type, 'shotgun');
  for (let i = 0; i < 300 && sg.ammo > sg.mag - 2; i++) a.update(1 / 60, i % 2 === 0, false);
  assert.equal(sg.ammo, sg.mag - 2);
  a.reload();
  let shells = 0;
  for (let i = 0; i < 200; i++) {
    a.update(1 / 60, false, false);
    shells += a.events.filter((e) => e.type === 'shell').length;
  }
  assert.equal(shells, 2, 'two shells, one at a time');
  assert.equal(sg.ammo, sg.mag);
});

test('a zombie that reaches the player hurts it', () => {
  const g = new SurvivalGame({ shape, rng: makeRng(5) });
  g.opts.firstDelay = 1e9;
  g.player.pos.set(-20, 0, 0.9);
  g.sb.spawnZombie(new Vec3(-23, 0, 0.9), Math.PI / 2, 'walker');
  const hp0 = g.player.health;
  for (let i = 0; i < 60 * 15 && g.player.health === hp0; i++) {
    g.player.update(1 / 60, idle, g.playerEnv());
    g.update(1 / 60);
    g.drainEvents();
    g.sb.drainFx();
  }
  assert.ok(g.player.health < hp0, 'clawed');
});
