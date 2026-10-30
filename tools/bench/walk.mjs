// Walking benchmark: send the dummy to points in every direction (and over the obstacle course),
// report arrivals, falls, time and pace. Usage: node tools/bench/walk.mjs [case ...] [--seeds=N]
// Cases: dirs (8 targets 5 m away), far (10 m), obstacles (log, curb, plank, step one at a time;
// obs:<type> for one), course (the obstacle course), or a single "x,z" target. Each case runs in its own worker thread.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { scene, run, report, Vec3 } from './common.mjs';

const DIRS = [0, 45, 90, 135, 180, -135, -90, -45];

function cases(names) {
  const out = [];
  for (const n of names) {
    if (n === 'dirs') for (const d of DIRS) out.push({ name: `dir${d}`, x: 5 * Math.sin((d * Math.PI) / 180), z: 5 * Math.cos((d * Math.PI) / 180), T: 16 });
    else if (n === 'far') out.push({ name: 'far', x: 2, z: 10, T: 20 });
    else if (n === 'course') out.push({ name: 'course', x: 8.5, z: -3.5, T: 40, course: true, start: [-9, -3.5], yaw: Math.PI / 2 });
    else if (n === 'obstacles') for (const o of ['log', 'curb', 'plank', 'step']) out.push({ name: o, obstacle: o, x: 5, z: 0, T: 16, start: [0, 0], yaw: Math.PI / 2 });
    else if (n.startsWith('obs:')) out.push({ name: n.slice(4), obstacle: n.slice(4), x: 5, z: 0, T: 16, start: [0, 0], yaw: Math.PI / 2 });
    else if (/^-?[\d.]+,-?[\d.]+$/.test(n)) {
      const [x, z] = n.split(',').map(Number);
      out.push({ name: n, x, z, T: 20 });
    }
  }
  return out;
}

function simulate(c, seed) {
  const { sb, person } = scene(seed);
  const custom = c.course || c.obstacle;
  const course = c.course ? sb.buildCourse() : null;
  // a single obstacle 2.5 m ahead, across the way
  if (c.obstacle) sb.addObstacle(c.obstacle, new Vec3(2.5, 0, 0), Math.PI / 2);
  if (custom) sb.removePerson(person);
  const p = custom ? sb.spawnPerson(new Vec3(c.start[0], 0, c.start[1]), c.yaw) : person;
  if (custom) run(sb, 1);
  const ctl = p.ctl;
  // (the course goes over the step platform: via a waypoint on top of it)
  if (c.course) sb.walkTo(p, course.via);
  const path = sb.walkTo(p, new Vec3(c.x, 0, c.z), { append: !!c.course });
  if (!path) return { case: c.name, seed, ok: false, reason: 'no path' };
  let falls = 0, steps = 0, catches = 0, tEnd = null, status = 'walking', dist = 0;
  const last = new Vec3().copy(p.rd.pelvis.pos);
  run(sb, c.T, (i, t) => {
    for (const e of ctl.events) {
      if (e.type === 'mode' && e.to === 'falling') falls++;
      if (e.type === 'step') {
        steps++;
        if (e.kind === 'catch') catches++;
      }
      if (e.type === 'walkEnd') {
        status = e.status;
        tEnd = t;
      }
    }
    const q = p.rd.pelvis.pos;
    dist += Math.hypot(q.x - last.x, q.z - last.z);
    last.copy(q);
    if (tEnd !== null && t > tEnd + 1) return false;
  });
  const q = p.rd.pelvis.pos;
  const miss = Math.hypot(q.x - c.x, q.z - c.z);
  return {
    case: c.name, seed, status, ok: status === 'arrived' && falls === 0, falls, steps, catches,
    t: tEnd === null ? null : +tEnd.toFixed(2), miss: +miss.toFixed(2), pace: tEnd ? +(dist / tEnd).toFixed(2) : null,
    mode: ctl.mode,
  };
}

if (isMainThread) {
  const args = process.argv.slice(2);
  const seeds = +(args.find((a) => a.startsWith('--seeds=')) || '--seeds=1').split('=')[1];
  const names = args.filter((a) => !a.startsWith('--'));
  const list = cases(names.length ? names : ['dirs', 'far']);
  const jobs = [];
  for (const c of list) for (let s = 1; s <= seeds; s++) jobs.push({ c, seed: s });
  const results = [];
  let next = 0;
  const conc = 4;
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
      w.on('error', (e) => {
        results.push({ case: job.c.name, seed: job.seed, ok: false, error: String(e) });
        console.log('error', job.c.name, e);
      });
      w.on('exit', () => {
        active--;
        launch();
      });
    };
    for (let i = 0; i < conc; i++) launch();
  });
  const ok = results.filter((r) => r.ok).length;
  const times = results.filter((r) => r.ok).map((r) => r.t);
  const paces = results.filter((r) => r.ok && r.pace).map((r) => r.pace);
  report('walk', {
    arrived: `${ok}/${results.length}`,
    falls: results.reduce((a, r) => a + (r.falls || 0), 0),
    catches: results.reduce((a, r) => a + (r.catches || 0), 0),
    meanTime: times.length ? +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2) : null,
    meanPace: paces.length ? +(paces.reduce((a, b) => a + b, 0) / paces.length).toFixed(2) : null,
  });
} else {
  parentPort.postMessage(simulate(workerData.c, workerData.seed));
}
