// Getting up. Scenario sets (env SETS, comma separated; default all):
//  knock    a 160 N*s shove (back / forward / side) knocks the dummy down, full injury model; cases are
//           split into "able" (ableToGetUp() held at some point while down) and "injured" (it never did,
//           e.g. a broken leg or extreme pain). 30 s each.
//  nofrac   the same knock-downs with bone fractures disabled (instrumented: isolates the get-up from
//           the bracing injuries the fall may cause). 30 s.
//  lying    lying starts, uninjured: prone, supine, on the left / right side. 20 s.
//  injured  injured variants from lying: broken femur (must stay down), broken forearm (one-arm
//           get-up), ~30% blood loss (too weak: stays down), ~20% blood loss (weaker, slower), after a
//           knockout (dazed, later). 30 s.
// Metrics: stood = balance held >= 4 s; first = the first attempt reached standing; time = start of the
// first attempt -> standing; extraFalls = falls after having stood; helper = mean get-up helper lift
// (fraction of body weight); vmax = peak centre-of-mass speed while getting up.
// SEEDS=1,2 limits the knock-down seeds (default 1..6 for knock, 1..3 for nofrac).
import { scene, run, report, Vec3, makeRng } from './common.mjs';
import { Sandbox } from '../../src/game/sandbox.js';
import { layDown, getUpTracker } from './lying.mjs';

const sets = (process.env.SETS || 'knock,nofrac,lying,injured').split(',');
const seedList = (n) => (process.env.SEEDS ? process.env.SEEDS.split(',').map(Number) : Array.from({ length: n }, (_, i) => i + 1));
const SHOVES = { back: new Vec3(0, 0, -160), fwd: new Vec3(0, 0, 160), side: new Vec3(160, 0, 0) };
const out = {};

function runCase(sb, person, seconds, label) {
  const tr = getUpTracker(person);
  let wasAble = false;
  run(sb, seconds, (i, t) => {
    tr.tick(t);
    if (person.ctl.mode === 'ground' && person.ctl.ableToGetUp()) wasAble = true;
  });
  const s = tr.summary();
  const inj = person.injury;
  const ph = s.phases.map((p) => p.split('@')[0]).join('>');
  console.log(`${label.padEnd(16)} ${s.standAt >= 0 ? `stood ${s.duration.toFixed(1)}s after starting (at ${s.standAt.toFixed(1)}s)` : 'never stood'.padEnd(30)} first=${s.firstOk} tries=${s.attempts} falls=${s.falls} helper=${(100 * s.helperFrac).toFixed(1)}% vmax=${s.maxComV.toFixed(2)} final=${person.ctl.mode} pain=${inj.pain.toFixed(2)} fx=${inj.fractures.map((f) => f.label).join('/') || '-'} | ${ph}`);
  return { ...s, able: wasAble, stood: s.standAt >= 0 };
}

function summarize(list) {
  const stood = list.filter((r) => r.stood);
  const tried = list.filter((r) => r.attempts > 0);
  return {
    n: list.length,
    stood: stood.length,
    first: tried.filter((r) => r.firstOk === true).length,
    tried: tried.length,
    // time from the start of the run until 4 s of standing were completed (baseline definition)
    meanTime: stood.length ? +(stood.reduce((a, r) => a + r.standAt + 4, 0) / stood.length).toFixed(1) : null,
    // duration of the successful get-up itself (first attempt start -> standing)
    upTime: stood.length ? +(stood.reduce((a, r) => a + r.duration, 0) / stood.length).toFixed(1) : null,
    extraFalls: list.reduce((a, r) => a + r.falls, 0),
    helper: tried.length ? +(tried.reduce((a, r) => a + r.helperFrac, 0) / tried.length).toFixed(3) : null,
    vmax: tried.length ? +Math.max(...tried.map((r) => r.maxComV)).toFixed(2) : null,
  };
}

function knock(nofrac) {
  const res = [];
  for (const d of ['back', 'fwd', 'side']) {
    for (const seed of seedList(nofrac ? 3 : 6)) {
      const { sb, person } = scene(seed);
      if (nofrac) {
        person.injury.queueBreak = () => {};
        person.injury.addFracture = () => {};
      }
      const chest = person.rd.segments.chest.body;
      sb.shove(chest, chest.pos.clone(), SHOVES[d], 0.15);
      res.push(runCase(sb, person, 30, `${nofrac ? 'nofrac' : 'knock'} ${d} ${seed}`));
    }
  }
  return res;
}

function lyingScene(seed, kind, yaw = 0) {
  const sb = new Sandbox({ rng: makeRng(seed) });
  const person = sb.spawnPerson(new Vec3(0, 0, 0), 0);
  layDown(person, kind, yaw);
  return { sb, person };
}

if (sets.includes('knock')) {
  const res = knock(false);
  const able = res.filter((r) => r.able), injured = res.filter((r) => !r.able);
  out.knock = { ...summarize(res), able: summarize(able), injured: summarize(injured) };
}
if (sets.includes('nofrac')) out.nofrac = summarize(knock(true));
if (sets.includes('lying')) {
  const res = [];
  for (const kind of ['prone', 'supine', 'sideL', 'sideR']) {
    for (const seed of [1, 2]) {
      const { sb, person } = lyingScene(seed, kind, seed === 2 ? 2.1 : 0);
      res.push(runCase(sb, person, 20, `lying ${kind} ${seed}`));
    }
  }
  out.lying = summarize(res);
}
if (sets.includes('injured')) {
  const v = {};
  const variant = (name, kind, setup, check) => {
    const { sb, person } = lyingScene(3, kind);
    run(sb, 0.05);
    setup(person, sb);
    const r = runCase(sb, person, 30, `inj ${name}`);
    v[name] = check(r, person);
  };
  // a broken femur: the leg cannot bear weight, the dummy must stay down
  variant('femur', 'supine', (p) => p.injury.breakLongBone(p.rd.segments.thighR, 0.5, false), (r) => (r.stood ? 'STOOD' : 'down'));
  // a broken forearm: gets up using the other arm
  variant('forearm', 'prone', (p) => p.injury.breakLongBone(p.rd.segments.forearmL, 0.5, false), (r) => (r.stood ? +r.duration.toFixed(1) : 'down'));
  // ~30% blood loss (class III shock): too weak to stand, stays down
  variant('bloodloss', 'prone', (p) => (p.injury.blood = 3500), (r) => (r.stood ? +r.duration.toFixed(1) : 'down'));
  // ~20% blood loss: somewhat weak, slower
  variant('bloodloss20', 'prone', (p) => (p.injury.blood = 3900), (r) => (r.stood ? +r.duration.toFixed(1) : 'down'));
  // knocked out for 6 s: comes round dazed, gets up later and slower
  variant('knockout', 'supine', (p) => p.injury.knockOut(6, 0.4), (r) => (r.stood ? +r.standAt.toFixed(1) : 'down'));
  out.injured = v;
}
// headline numbers keep the original definition (knock-down set, all cases) for comparison
const k = out.knock || out.nofrac || out.lying || {};
report('getup', { stood: k.stood, total: k.n, meanTime: k.meanTime, extraFalls: k.extraFalls, ...out });
