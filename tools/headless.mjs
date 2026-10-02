// Headless battle runner: simulates full battles without a browser to check
// stability (NaN, stuck AI, exceptions) and to tune balance.
//   node tools/headless.mjs [battles=6] [maxMinutes=8] [env=random]
import { Simulation } from '../src/sim/simulation.js';
import { DEFAULT_SETTINGS } from '../src/config.js';

const N = +(process.argv[2] || 6);
const MAXMIN = +(process.argv[3] || 8);
const ENV = process.argv[4] || 'random';
const extra = process.argv[5] ? JSON.parse(process.argv[5]) : {};

const results = [];
for (let i = 0; i < N; i++) {
  const seed = (0x9e3779b1 * (i + 1)) >>> 0;
  const settings = { ...DEFAULT_SETTINGS, environment: ENV, ...extra };
  const t0 = performance.now();
  const sim = new Simulation(settings, seed, i + 1);
  const maxSteps = MAXMIN * 60 * 60;
  let steps = 0;
  let peakFighters = 0;
  const causes = {};
  const heroDmg = {};
  const heroKD = {};
  let downTime = 0;
  let lastLog = 0;
  const hero = sim.hero;
  const origDamage = hero.damage.bind(hero);
  hero.damage = (amt, by, cause) => {
    heroDmg[cause] = (heroDmg[cause] || 0) + amt;
    return origDamage(amt, by, cause);
  };
  const origKD = hero.knockdown.bind(hero);
  hero.knockdown = (vx, vy, o) => {
    const why = hero.state === 'move' && hero.move ? 'during ' + hero.move.id : hero.state;
    heroKD[why] = (heroKD[why] || 0) + 1;
    return origKD(vx, vy, o);
  };
  while (steps < maxSteps) {
    sim.step();
    steps++;
    for (const e of sim.drainEvents()) {
      if (e.t === 'ko') causes[e.cause] = (causes[e.cause] || 0) + 1;
    }
    peakFighters = Math.max(peakFighters, sim.fighters.length);
    if (hero.ragdolled) downTime += sim.dt;
    if (sim.over && sim.overT > 2) break;
    if (process.env.VERBOSE && sim.time - lastLog >= 30) {
      lastLog = sim.time;
      const h = sim.hero;
      console.log(`  t=${sim.time.toFixed(0)}s hp=${h.hp.toFixed(0)} st=${h.stamina.toFixed(0)} fat=${h.fatigue.toFixed(2)} alive=${sim.enemiesAlive} ko=${sim.stats.defeated} mind="${h.brain.mind}" state=${h.state} x=${h.x.toFixed(0)},${h.y.toFixed(0)}`);
    }
  }
  const ms = performance.now() - t0;
  const r = {
    seed: seed.toString(16),
    env: sim.level.theme,
    cond: sim.level.condition,
    time: sim.time.toFixed(1),
    over: sim.over ? (sim.over.victory ? 'WIN ' + sim.over.reason : 'LOSS ' + sim.over.cause + (sim.over.by ? ' by ' + sim.over.by : '')) : 'timeout',
    kos: sim.stats.defeated,
    spawned: sim.stats.spawned,
    env_kos: sim.stats.envKOs,
    chain: sim.stats.bestChain,
    peak: peakFighters,
    hits: sim.hero.stats.hits,
    taken: sim.hero.stats.taken.toFixed(0),
    blocks: sim.hero.stats.blocks,
    dodges: sim.hero.stats.dodges,
    msPerSimSec: (ms / sim.time).toFixed(1),
    causes: JSON.stringify(causes),
    heroDmg: JSON.stringify(Object.fromEntries(Object.entries(heroDmg).map(([k, v]) => [k, Math.round(v)]))),
    heroKD: JSON.stringify(heroKD),
    downPct: ((downTime / sim.time) * 100).toFixed(0) + '%',
  };
  results.push(r);
  console.log(JSON.stringify(r));
}
const avg = (k) => (results.reduce((a, r) => a + +r[k], 0) / results.length).toFixed(1);
console.log(`avg survival ${avg('time')}s, avg KOs ${avg('kos')}, avg env KOs ${avg('env_kos')}, avg ms/simsec ${avg('msPerSimSec')}`);
