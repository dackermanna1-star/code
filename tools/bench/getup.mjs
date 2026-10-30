// Getting up. Scenario sets (env SETS, comma separated; default knock,nofrac,lying,onearm,injured):
//  knock    a 160 N*s shove (back / forward / side) knocks the dummy down, full injury model; cases are
//           split into "able" (ableToGetUp() held at some point while down) and "injured" (it never did,
//           e.g. a broken leg or extreme pain). 30 s each.
//  nofrac   the same knock-downs with bone fractures disabled (instrumented: isolates the get-up from
//           the bracing injuries the fall may cause). 30 s.
//  lying    lying starts, uninjured: prone, supine, on the left / right side, each seed at its own random
//           heading. 20 s.
//  onearm   lying starts with a broken forearm (left / right): the one-armed get-up. 30 s.
//  injured  injured variants from lying: broken femur (must stay down), broken forearm (one-arm
//           get-up), ~30% blood loss (too weak: stays down), ~20% blood loss (weaker, slower), after a
//           knockout (dazed, later). 30 s.
//  assist   the lying set at assistGain 0.5: how far the get-up depends on the helpers.
// Sizes: knock seeds 1..6 (the headline, comparable with earlier runs), nofrac 1..3, lying 2 seeds,
// onearm 1 seed; FULL=1 runs the held-out sizes (knock and nofrac 1..12, lying 6 seeds, onearm 3
// seeds) and adds the assist set. SEEDS=1,2 overrides the knock-down seeds.
// Metrics: stood = balance held >= 4 s; first = the first attempt reached standing; upTime = start of the
// first attempt -> standing; extraFalls = falls after having stood; ko = knockouts after the start;
// helperF / helperFmax = net external helper force on the whole body while getting up (fraction of body
// weight, mean of the cases / peak), helperT / helperTmax = the same for the torque (N*m); vmax = peak
// centre-of-mass speed while getting up.
import { scene, run, report, Vec3, makeRng } from './common.mjs';
import { Sandbox } from '../../src/game/sandbox.js';
import { layDown, getUpTracker } from './lying.mjs';

const FULL = !!process.env.FULL;
const sets = (process.env.SETS || `knock,nofrac,lying,onearm,injured${FULL ? ',assist' : ''}`).split(',');
const seedList = (n) => (process.env.SEEDS ? process.env.SEEDS.split(',').map(Number) : Array.from({ length: n }, (_, i) => i + 1));
const SHOVES = { back: new Vec3(0, 0, -160), fwd: new Vec3(0, 0, 160), side: new Vec3(160, 0, 0) };
const KINDS = ['prone', 'supine', 'sideL', 'sideR'];
const out = {};

function runCase(sb, person, seconds, label, assistGain = 1) {
  person.ctl.assistGain = assistGain;
  const tr = getUpTracker(person);
  let wasAble = false;
  run(sb, seconds, (i, t) => {
    tr.tick(t);
    if (person.ctl.mode === 'ground' && person.ctl.ableToGetUp()) wasAble = true;
  });
  const s = tr.summary();
  const inj = person.injury;
  const ph = s.phases.map((p) => p.split('@')[0]).join('>');
  console.log(
    `${label.padEnd(16)} ${s.standAt >= 0 ? `stood ${s.duration.toFixed(1)}s after starting (at ${s.standAt.toFixed(1)}s)` : 'never stood'.padEnd(30)} first=${s.firstOk} tries=${s.attempts} falls=${s.falls} ko=${s.ko}` +
      ` helper=${(100 * s.helperF).toFixed(1)}%/${s.helperT.toFixed(0)}Nm vmax=${s.maxComV.toFixed(2)} final=${person.ctl.mode} pain=${inj.pain.toFixed(2)} fx=${inj.fractures.map((f) => f.label).join('/') || '-'} | ${ph}`,
  );
  return { ...s, able: wasAble, stood: s.standAt >= 0 };
}

function summarize(list) {
  const stood = list.filter((r) => r.stood);
  const tried = list.filter((r) => r.attempts > 0);
  const mean = (f) => (tried.length ? tried.reduce((a, r) => a + f(r), 0) / tried.length : null);
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
    ko: list.reduce((a, r) => a + r.ko, 0),
    helperF: tried.length ? +mean((r) => r.helperF).toFixed(3) : null,
    helperFmax: tried.length ? +Math.max(...tried.map((r) => r.helperFmax)).toFixed(3) : null,
    helperT: tried.length ? +mean((r) => r.helperT).toFixed(1) : null,
    helperTmax: tried.length ? +Math.max(...tried.map((r) => r.helperTmax)).toFixed(0) : null,
    vmax: tried.length ? +Math.max(...tried.map((r) => r.maxComV)).toFixed(2) : null,
  };
}

function knock(nofrac) {
  const res = [];
  for (const d of ['back', 'fwd', 'side']) {
    for (const seed of seedList(FULL ? 12 : nofrac ? 3 : 6)) {
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

/** Each lying case at its own random heading (seeded). */
const yawOf = (seed, kind) => makeRng(seed * 97 + kind.length)() * Math.PI * 2;

function lying(assistGain = 1) {
  const res = [];
  for (const kind of KINDS) {
    for (let seed = 1; seed <= (FULL ? 6 : 2); seed++) {
      const { sb, person } = lyingScene(seed, kind, yawOf(seed, kind));
      res.push(runCase(sb, person, 20, `lying ${kind} ${seed}`, assistGain));
    }
  }
  return res;
}

if (sets.includes('knock')) {
  const res = knock(false);
  const able = res.filter((r) => r.able), injured = res.filter((r) => !r.able);
  out.knock = { ...summarize(res), able: summarize(able), injured: summarize(injured) };
}
if (sets.includes('nofrac')) out.nofrac = summarize(knock(true));
if (sets.includes('lying')) out.lying = summarize(lying());
if (sets.includes('onearm')) {
  const res = [];
  for (const arm of ['L', 'R']) {
    for (const kind of KINDS) {
      for (let seed = 1; seed <= (FULL ? 3 : 1); seed++) {
        const { sb, person } = lyingScene(seed, kind);
        run(sb, 0.05);
        person.injury.breakLongBone(person.rd.segments['forearm' + arm], 0.5, false);
        res.push(runCase(sb, person, 30, `onearm ${arm} ${kind} ${seed}`));
      }
    }
  }
  out.onearm = summarize(res);
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
if (sets.includes('assist')) out.assist05 = summarize(lying(0.5));
// headline numbers keep the original definition (knock-down set, all cases) for comparison
const k = out.knock || out.nofrac || out.lying || {};
report('getup', { stood: k.stood, total: k.n, meanTime: k.meanTime, extraFalls: k.extraFalls, ...out });
