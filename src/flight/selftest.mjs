// =============================================================================
// Flight director self-test (node, no browser):
//   node src/flight/selftest.mjs [--dt 0.25] [--quick]
// Simulates the whole journey with a fake app object (large frame dt, sub-stepped
// internally) and asserts continuity: no position / attitude jumps, sane
// altitudes / attitudes / g-loads, phases in order, ends parked at the arrival
// gate. Also exercises the settings variants, jumpTo for every phase, skipTo
// (with the fade) and restart.
// =============================================================================
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const threeUrl = pathToFileURL(path.join(root, 'vendor/three/build/three.module.js')).href;
const addonsUrl = pathToFileURL(path.join(root, 'vendor/three/examples/jsm/')).href;
const hook = `
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: ${JSON.stringify(threeUrl)}, shortCircuit: true };
  if (spec.startsWith('three/addons/')) return { url: new URL(spec.slice(13), ${JSON.stringify(addonsUrl)}).href, shortCircuit: true };
  return next(spec, ctx);
}`;
register('data:text/javascript,' + encodeURIComponent(hook), import.meta.url);

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const DT = Number(opt('dt', 0.25));
const QUICK = args.includes('--quick');

const THREE = await import('three');
const { EventBus } = await import('../core/events.js');
const { createFlightState, PHASE_IDS } = await import('./state.js');
const { ARRIVAL, DEPARTURE, gateById } = await import('../world/layout.js');
const { FT, KT, DEG } = await import('../core/constants.js');
const { init } = await import('./director.js');

let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL: ${msg}`); };
const ok = (cond, msg) => { if (!cond) fail(msg); return cond; };

function makeApp(settings = {}, debug = {}) {
  const updates = [];
  const S = { gateMinutes: 2, cruiseMinutes: 10, pacing: 'compressed', timeOfDay: 'auto', units: 'imperial', ...settings };
  const app = {
    events: new EventBus(),
    settings: { get: (k) => S[k], set: (k, v) => { S[k] = v; } },
    debug, timeScale: 1, paused: false, time: 0, dt: 0,
    sun: { direction: new THREE.Vector3(-0.4, 0.5, 0.3).normalize() },
    pipeline: { fade: 0 },
    flight: { state: createFlightState() },
    addUpdate(fn, prio, name) { updates.push({ fn, prio, name }); updates.sort((a, b) => a.prio - b.prio); return () => {}; },
    tick(dt) { app.dt = dt; app.time += dt; for (const u of updates) u.fn(dt, app.time); },
  };
  app.world = {
    departureOrigin: new THREE.Vector3(0, 0, 0),
    arrivalOrigin: new THREE.Vector3(...ARRIVAL.origin),
    setArrivalOrigin(v) { this.arrivalOrigin.copy(v); app.events.emit('world:arrivalMoved', { origin: this.arrivalOrigin.clone() }); },
    groundHeight() { return 0; },
  };
  app.events.on('app:ready', () => {});
  return app;
}

function logEvents(app, list) {
  const names = ['flight:phase', 'flight:doors', 'flight:bridge', 'flight:pushback', 'flight:engineStart', 'flight:thrust', 'flight:liftoff',
    'flight:gear', 'flight:flaps', 'flight:spoilers', 'flight:reverse', 'flight:touchdown', 'flight:turbulence', 'flight:holdShort',
    'cabin:announce', 'cabin:chime', 'cabin:seatbelt', 'cabin:lights', 'flight:apu', 'flight:engineShutdown', 'world:arrivalMoved'];
  for (const n of names) app.events.on(n, (p) => list.push({ t: app.time, n, p }));
}

/** Fly the whole journey; returns stats. */
async function fullFlight(label, settings, { dt = DT, actions = {} } = {}) {
  console.log(`\n=== ${label} (dt ${dt}) ===`);
  const app = makeApp(settings);
  const events = [];
  logEvents(app, events);
  const api = await init(app);
  const st = api.state;
  const d = api.director;
  const phaseT = {}, order = [];
  let last = st.phase; order.push(last); phaseT[last] = 0;
  const prev = { p: st.position.clone(), h: st.heading, pitch: st.pitch, roll: st.roll, v: st.groundSpeed };
  const stats = { maxBank: 0, minPitch: 0, maxPitch: 0, maxG: 1, minG: 1, maxLatG: 0, maxLatGGround: 0, maxJump: 0, maxHdgRate: 0, maxPitchRate: 0, maxRollRate: 0, maxAlt: 0, maxIas: 0 };
  const perPhase = {};
  let t = 0, td = null;
  app.events.on('flight:touchdown', (p) => { td = { ...p, x: st.position.x - app.world.arrivalOrigin.x, z: st.position.z - app.world.arrivalOrigin.z, ias: st.airspeed / KT }; });
  let liftoff = null;
  app.events.on('flight:liftoff', () => { liftoff = { x: st.position.x, ias: st.airspeed / KT, pitch: st.pitch / DEG }; });
  const limit = 3 * 3600;
  while (t < limit) {
    for (const [k, fn] of Object.entries(actions)) if (st.phase === k && !fn.done && st.phaseTime > (fn.after || 5)) { fn.done = true; fn(api); }
    app.tick(dt); t += dt;
    if (st.phase !== last) { phaseT[st.phase] = t; order.push(st.phase); last = st.phase; }
    // continuity
    const dp = st.position.distanceTo(prev.p);
    const allowed = Math.max(prev.v, st.groundSpeed) * dt * 1.35 + Math.abs(st.verticalSpeed) * dt * 1.5 + 0.25;
    stats.maxJump = Math.max(stats.maxJump, dp - allowed);
    if (dp > allowed) { fail(`position jump ${dp.toFixed(2)} m > ${allowed.toFixed(2)} at t=${t.toFixed(1)} (${st.phase})`); if (failures > 20) break; }
    let dh = st.heading - prev.h; while (dh > 180) dh -= 360; while (dh < -180) dh += 360;
    stats.maxHdgRate = Math.max(stats.maxHdgRate, Math.abs(dh) / dt);
    stats.maxPitchRate = Math.max(stats.maxPitchRate, Math.abs(st.pitch - prev.pitch) / DEG / dt);
    stats.maxRollRate = Math.max(stats.maxRollRate, Math.abs(st.roll - prev.roll) / DEG / dt);
    stats.maxBank = Math.max(stats.maxBank, Math.abs(st.roll) / DEG);
    stats.minPitch = Math.min(stats.minPitch, st.pitch / DEG);
    stats.maxPitch = Math.max(stats.maxPitch, st.pitch / DEG);
    stats.maxAlt = Math.max(stats.maxAlt, st.altitude);
    stats.maxIas = Math.max(stats.maxIas, st.airspeed / KT);
    if (st.phase !== 'landing') { stats.maxG = Math.max(stats.maxG, st.gForce.y); stats.minG = Math.min(stats.minG, st.gForce.y); }
    if (st.onGround) stats.maxLatGGround = Math.max(stats.maxLatGGround, Math.abs(st.gForce.x));
    else stats.maxLatG = Math.max(stats.maxLatG, Math.abs(st.gForce.x));
    const pp = perPhase[st.phase] || (perPhase[st.phase] = { minPitch: 99, maxPitch: -99, maxBank: 0, maxGs: 0, minAlt: 1e9, maxAlt: -1e9 });
    pp.minPitch = Math.min(pp.minPitch, st.pitch / DEG); pp.maxPitch = Math.max(pp.maxPitch, st.pitch / DEG);
    pp.maxBank = Math.max(pp.maxBank, Math.abs(st.roll) / DEG); pp.maxGs = Math.max(pp.maxGs, st.groundSpeed);
    pp.minAlt = Math.min(pp.minAlt, st.altitude); pp.maxAlt = Math.max(pp.maxAlt, st.altitude);
    if (!st.onGround) ok(st.altitudeAGL > -0.5, `below ground in flight at t=${t.toFixed(1)} agl=${st.altitudeAGL.toFixed(1)}`);
    for (const v of [st.position.x, st.position.y, st.position.z, st.pitch, st.roll, st.heading, st.gForce.y]) if (!Number.isFinite(v)) { fail(`NaN in state at t=${t}`); break; }
    prev.p.copy(st.position); prev.h = st.heading; prev.pitch = st.pitch; prev.roll = st.roll; prev.v = st.groundSpeed;
    if (st.phase === 'arrived' && st.phaseTime > 30) break;
  }
  // ---- report
  const dur = order.map((p, i) => `${p} ${(((phaseT[order[i + 1]] ?? t) - phaseT[p]) / 60).toFixed(1)}m`).join(' | ');
  console.log(`  phases: ${dur}`);
  console.log(`  total ${(t / 60).toFixed(1)} min; maxAlt ${(stats.maxAlt / FT).toFixed(0)} ft; maxIAS ${stats.maxIas.toFixed(0)} kt; bank max ${stats.maxBank.toFixed(1)}°; pitch ${stats.minPitch.toFixed(1)}..${stats.maxPitch.toFixed(1)}°`);
  console.log(`  g (excl. landing) ${stats.minG.toFixed(2)}..${stats.maxG.toFixed(2)}; lateral g air ${stats.maxLatG.toFixed(3)} ground ${stats.maxLatGGround.toFixed(3)}; rates hdg ${stats.maxHdgRate.toFixed(1)} pitch ${stats.maxPitchRate.toFixed(2)} roll ${stats.maxRollRate.toFixed(2)} °/s`);
  for (const [k, v] of Object.entries(perPhase)) console.log(`   ${k.padEnd(9)} pitch ${v.minPitch.toFixed(1)}..${v.maxPitch.toFixed(1)}  bank ${v.maxBank.toFixed(1)}  gs ${(v.maxGs / KT).toFixed(0)}kt  alt ${(v.minAlt / FT).toFixed(0)}..${(v.maxAlt / FT).toFixed(0)}ft`);
  if (liftoff) console.log(`  liftoff at x=${liftoff.x.toFixed(0)} ias=${liftoff.ias.toFixed(0)} kt pitch=${liftoff.pitch.toFixed(1)}°`);
  if (td) console.log(`  touchdown at x=${td.x.toFixed(0)} z=${td.z.toFixed(2)} sink=${td.verticalSpeed.toFixed(2)} m/s intensity=${td.intensity.toFixed(2)} ias=${td.ias.toFixed(0)} kt`);
  const ann = events.filter((e) => e.n === 'cabin:announce').map((e) => e.p.id);
  console.log(`  announcements: ${ann.join(', ')}`);
  // ---- assertions
  ok(order.join(',') === PHASE_IDS.join(','), `phase order: ${order.join(',')}`);
  ok(st.phase === 'arrived', `ended in ${st.phase}`);
  const g = gateById(ARRIVAL, ARRIVAL.ownGate);
  const gx = app.world.arrivalOrigin.x + g.x, gz = app.world.arrivalOrigin.z + g.z;
  const dg = Math.hypot(st.position.x - gx, st.position.z - gz);
  ok(dg < 0.3, `parked ${dg.toFixed(2)} m from the arrival gate`);
  let dh = st.heading - g.heading; while (dh > 180) dh -= 360; while (dh < -180) dh += 360;
  ok(Math.abs(dh) < 1.0, `parked heading ${st.heading.toFixed(2)}`);
  ok(stats.maxBank < 30, `max bank ${stats.maxBank.toFixed(1)}`);
  ok(stats.maxPitch < 17 && stats.minPitch > -7, `pitch range ${stats.minPitch.toFixed(1)}..${stats.maxPitch.toFixed(1)}`);
  ok(Math.abs(stats.maxAlt - 36000 * FT) < 30, `cruise altitude ${(stats.maxAlt / FT).toFixed(0)}`);
  ok(stats.maxLatGGround < 0.14, `ground lateral g ${stats.maxLatGGround.toFixed(3)}`);
  ok(stats.maxLatG < 0.08, `air lateral g ${stats.maxLatG.toFixed(3)}`);
  ok(td && td.verticalSpeed > 0.5 && td.verticalSpeed < 2.2, `touchdown sink ${td && td.verticalSpeed.toFixed(2)}`);
  ok(td && td.x > -1300 && td.x < -900 && Math.abs(td.z) < 3, `touchdown point ${td && td.x.toFixed(0)},${td && td.z.toFixed(1)}`);
  ok(liftoff && liftoff.ias > 150 && liftoff.ias < 172 && liftoff.x < 1000, `liftoff ${liftoff && liftoff.ias.toFixed(0)} kt at x=${liftoff && liftoff.x.toFixed(0)}`);
  for (const id of ['boarding_welcome', 'doors_closed', 'doors_armed', 'safety_demo', 'fa_takeoff', 'seatbelt_off', 'captain_cruise', 'descent_captain', 'descent_purser', 'fa_landing', 'landing_welcome', 'doors_disarm', 'farewell']) {
    ok(ann.includes(id), `announcement ${id} played`);
  }
  for (const n of ['flight:doors', 'flight:bridge', 'flight:pushback', 'flight:engineStart', 'flight:liftoff', 'flight:gear', 'flight:flaps', 'flight:spoilers', 'flight:reverse', 'flight:touchdown', 'flight:holdShort', 'cabin:seatbelt', 'cabin:lights', 'cabin:chime', 'world:arrivalMoved']) {
    ok(events.some((e) => e.n === n), `event ${n} emitted`);
  }
  ok(st.engines.every((e) => !e.running && e.n1 < 5), 'engines shut down at the gate');
  ok(st.cabin.bridgeConnected && !st.cabin.doorsClosed && !st.cabin.seatbelt, 'gate state at arrival');
  return { app, api, events, stats, phaseT, order };
}

async function jumpTests() {
  console.log('\n=== jumpTo / skipTo / restart ===');
  const app = makeApp();
  const api = await init(app);
  const st = api.state;
  for (const id of PHASE_IDS) {
    for (const p of [0, 0.5]) {
      const t0 = Date.now();
      const okj = api.jumpTo(id, p);
      const ms = Date.now() - t0;
      ok(okj && st.phase === id, `jumpTo(${id}, ${p}) -> ${st.phase}`);
      // run a few seconds: no NaN, no jumps
      const p0 = st.position.clone();
      for (let i = 0; i < 20; i++) app.tick(0.1);
      const dp = st.position.distanceTo(p0);
      ok(dp < st.groundSpeed * 2.5 + 30, `motion after jump ${id} ${dp.toFixed(1)} m`);
      ok(Number.isFinite(st.position.x + st.position.y + st.pitch + st.gForce.y), `finite after jump ${id}`);
      if (p === 0.5 || id === 'approach') console.log(`  ${id.padEnd(9)} p=${p}: ${ms} ms  alt ${(st.altitude / FT).toFixed(0)} ft  ias ${(st.airspeed / KT).toFixed(0)} kt  pitch ${(st.pitch / DEG).toFixed(1)}  bank ${(st.roll / DEG).toFixed(1)}  flaps ${st.flapsDeg.toFixed(0)} gear ${st.gear.toFixed(1)}  ${api.getStatusText()}`);
    }
  }
  // skip with fade
  api.jumpTo('cruise', 0.2);
  let skipEv = null;
  app.events.on('flight:skip', (p) => { skipEv = p; });
  api.skipTo('approach');
  let maxFade = 0;
  for (let i = 0; i < 40; i++) { app.tick(0.05); maxFade = Math.max(maxFade, app.pipeline.fade); }
  ok(skipEv && skipEv.to === 'approach' && st.phase === 'approach', `skipTo(approach) -> ${st.phase}`);
  ok(maxFade > 0.99 && app.pipeline.fade < 0.01, `fade ${maxFade.toFixed(2)} -> ${app.pipeline.fade.toFixed(2)}`);
  const lx = st.position.x - app.world.arrivalOrigin.x;
  ok(lx < -18000 && lx > -24000 && Math.abs(st.altitude / FT - 2800) < 150, `approach start ${lx.toFixed(0)} m, ${(st.altitude / FT).toFixed(0)} ft`);
  // time to touchdown from the approach skip
  let tt = 0;
  while (st.onGround === false && tt < 600) { app.tick(0.25); tt += 0.25; }
  console.log(`  approach skip -> touchdown in ${(tt / 60).toFixed(1)} min`);
  ok(tt > 120 && tt < 330, `approach skip lands within ~3-5 min (${(tt / 60).toFixed(1)})`);
  let rs = null;
  app.events.on('flight:restart', (p) => { rs = p; });
  api.restart();
  for (let i = 0; i < 40; i++) app.tick(0.05);
  ok(rs && st.phase === 'gate' && st.cabin.bridgeConnected && !st.cabin.doorsClosed, 'restart -> gate');
  const tl = api.timeline();
  ok(tl.length === 12 && Math.abs(tl[11].end - 1) < 1e-9 && tl[0].start === 0, 'timeline covers 0..1');
}

async function waitingVariants() {
  console.log('\n=== gateMinutes 0 / cruiseMinutes 0 (wait for the player) ===');
  const app = makeApp({ gateMinutes: 0, cruiseMinutes: 0 });
  const api = await init(app);
  const st = api.state;
  for (let i = 0; i < 600; i++) app.tick(0.5);
  ok(st.phase === 'gate', `waits at the gate (${st.phase})`);
  api.beginDeparture();
  let n = 0;
  while (st.phase !== 'cruise' && n++ < 20000) app.tick(0.25);
  ok(st.phase === 'cruise', 'reached cruise');
  for (let i = 0; i < 2400; i++) app.tick(0.5);
  ok(st.phase === 'cruise', `stays in cruise (${st.phase}) x=${(st.position.x / 1000).toFixed(0)} km`);
  api.beginDescent();
  n = 0;
  while (st.phase !== 'arrived' && n++ < 30000) app.tick(0.25);
  ok(st.phase === 'arrived', `arrived after beginDescent (${st.phase})`);
}

const t0 = Date.now();
await fullFlight('compressed journey', {});
if (!QUICK) {
  await fullFlight('realistic pacing', { pacing: 'realistic', cruiseMinutes: 3 }, { dt: 0.5 });
  await fullFlight('small frame dt (60 fps)', { gateMinutes: 2, cruiseMinutes: 4 }, { dt: 1 / 60 });
  await jumpTests();
  await waitingVariants();
}
console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
