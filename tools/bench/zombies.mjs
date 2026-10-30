// Zombie chase benchmark: zombies go after a moving (non-physical) player for a while; reports
// unprovoked falls per zombie-minute (nobody shoots or shoves them here), hits on the player and
// the physics cost. Usage: node tools/bench/zombies.mjs [scenario ...] [--seeds=N] [--time=S]
// Scenarios: circle (3 runners after a player circling at 1.6 m/s), strafe (a walker, a runner
// and a brute after a player darting between random points), retreat (3 walkers after a player
// backing away and side-stepping), horde (6 mixed, player circling slowly). Each run in a worker.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { report, Vec3 } from './common.mjs';
import { Sandbox } from '../../src/game/sandbox.js';
import { makeRng } from '../../src/physics/math.js';

const SCENARIOS = {
  circle: { kinds: ['runner', 'runner', 'runner'], player: 'circle', speed: 1.6 },
  strafe: { kinds: ['walker', 'runner', 'brute'], player: 'dart', speed: 2.4 },
  retreat: { kinds: ['walker', 'walker', 'walker'], player: 'retreat', speed: 0.6 },
  horde: { kinds: ['walker', 'runner', 'walker', 'runner', 'walker', 'brute'], player: 'circle', speed: 1.1 },
};

function simulate(name, seed, T) {
  const sc = SCENARIOS[name];
  const rng = makeRng(seed);
  const sb = new Sandbox({ rng: makeRng(seed * 7 + 1) });
  let hits = 0, dmg = 0;
  const player = { pos: new Vec3(0, 0, 4), height: 1.75, radius: 0.3, alive: true, damage: (a) => { hits++; dmg += a; } };
  sb.setPlayer(player);
  const zs = sc.kinds.map((k, i) => sb.spawnZombie(new Vec3(-4 + i * 1.6, 0, -7 - (i % 2)), 0, k));
  let falls = 0;
  const goal = new Vec3(0, 0, 4);
  let t0 = performance.now();
  for (let i = 0; i < T * 60; i++) {
    const t = i / 60;
    if (sc.player === 'circle') {
      const w = sc.speed / 5;
      player.pos.set(5 * Math.sin(w * t), 0, 5 * Math.cos(w * t));
    } else {
      // dart: run to random points; retreat: back away from the nearest zombie, side-stepping
      if (player.pos.distanceTo(goal) < 0.2) {
        if (sc.player === 'dart') goal.set((rng() - 0.5) * 16, 0, (rng() - 0.5) * 16);
        else {
          let near = null, nd = Infinity;
          for (const z of zs) {
            const d = z.rd.pelvis.pos.distanceTo(player.pos);
            if (d < nd) { nd = d; near = z; }
          }
          const away = new Vec3().subVectors(player.pos, near.rd.pelvis.pos).normalize();
          goal.set(player.pos.x + away.x * 3 + (rng() - 0.5) * 3, 0, player.pos.z + away.z * 3 + (rng() - 0.5) * 3);
          goal.x = Math.max(-9, Math.min(9, goal.x));
          goal.z = Math.max(-9, Math.min(9, goal.z));
        }
      }
      const d = new Vec3().subVectors(goal, player.pos);
      const l = d.length();
      if (l > 1e-6) player.pos.addScaled(d, Math.min(l, (sc.speed / 60)) / l);
    }
    sb.step(1 / 60);
    sb.drainFx();
    for (const z of zs) for (const e of z.ctl.events) if (e.type === 'mode' && e.to === 'falling') falls++;
  }
  const ms = (performance.now() - t0) / (T * 60);
  return { scenario: name, seed, zombies: zs.length, falls, hits, damage: Math.round(dmg), msPerFrame: +ms.toFixed(2) };
}

if (isMainThread) {
  const args = process.argv.slice(2);
  const seeds = +(args.find((a) => a.startsWith('--seeds=')) || '--seeds=4').split('=')[1];
  const T = +(args.find((a) => a.startsWith('--time=')) || '--time=30').split('=')[1];
  const names = args.filter((a) => !a.startsWith('--'));
  const list = names.length ? names : ['circle', 'strafe', 'retreat'];
  const jobs = [];
  for (const n of list) for (let s = 1; s <= seeds; s++) jobs.push({ name: n, seed: s, T });
  const results = [];
  let next = 0;
  await new Promise((resolve) => {
    let active = 0;
    const launch = () => {
      if (next >= jobs.length) {
        if (active === 0) resolve();
        return;
      }
      const job = jobs[next++];
      active++;
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: job });
      w.on('message', (r) => {
        results.push(r);
        console.log(JSON.stringify(r));
      });
      w.on('error', (e) => console.log('error', job.name, e));
      w.on('exit', () => {
        active--;
        launch();
      });
    };
    for (let i = 0; i < 4; i++) launch();
  });
  const zmin = results.reduce((a, r) => a + (r.zombies * T) / 60, 0);
  const falls = results.reduce((a, r) => a + r.falls, 0);
  const byScenario = {};
  for (const r of results) {
    const b = (byScenario[r.scenario] ||= { falls: 0, zmin: 0, hits: 0 });
    b.falls += r.falls;
    b.zmin += (r.zombies * T) / 60;
    b.hits += r.hits;
  }
  for (const b of Object.values(byScenario)) b.fallsPerZombieMin = +(b.falls / b.zmin).toFixed(3);
  report('zombies', { falls, zombieMinutes: +zmin.toFixed(1), fallsPerZombieMin: +(falls / zmin).toFixed(3), byScenario });
} else {
  parentPort.postMessage(simulate(workerData.name, workerData.seed, workerData.T));
}
