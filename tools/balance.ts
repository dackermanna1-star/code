/**
 * Monte Carlo balance & fairness harness.
 *
 *   npm run balance -- [fights=2000] [--fit] [--seed=N]
 *
 * Runs many headless battles and reports: win rate by starting side and by fighter index
 * (fairness), win rates conditioned on weapon / aspect / personality / each ability (balance),
 * fight length distribution, finish methods, and how often the AI uses its tools.
 * With --fit, fits the live win-probability model by logistic regression on sampled states.
 */
import { runHeadless, createSimulation } from '../src/game/battle';
import { createBattle } from '../src/sim/generator';
import { Rng } from '../src/core/rng';
import { winProbFeatures } from '../src/sim/winprob';
import type { BattleResult } from '../src/game/battle';

const args = process.argv.slice(2);
const N = parseInt(args.find((a) => /^\d+$/.test(a)) ?? '2000', 10);
const fit = args.includes('--fit');
const seedArg = args.find((a) => a.startsWith('--seed='));
const master = new Rng(seedArg ? parseInt(seedArg.slice(7), 10) : 0xC0FFEE);

const results: BattleResult[] = [];
const t0 = performance.now();
for (let i = 0; i < N; i++) {
  results.push(runHeadless(master.nextU32()));
  if ((i + 1) % 250 === 0) process.stderr.write(`  ${i + 1}/${N} (${((performance.now() - t0) / 1000).toFixed(1)}s)\n`);
}
const secs = (performance.now() - t0) / 1000;

function pct(x: number) {
  return (100 * x).toFixed(1) + '%';
}
function ci(p: number, n: number) {
  return (196 * Math.sqrt((p * (1 - p)) / Math.max(1, n))).toFixed(1);
}

// Fairness.
const leftWins = results.filter((r) => r.startSide[r.winner] === -1).length;
const idx0Wins = results.filter((r) => r.winner === 0).length;
console.log(`\n=== ${N} battles in ${secs.toFixed(1)}s (${((secs / N) * 1000).toFixed(1)} ms/battle) ===`);
console.log(`Left-side win rate:  ${pct(leftWins / N)} ±${ci(leftWins / N, N)}`);
console.log(`Fighter-0 win rate:  ${pct(idx0Wins / N)} ±${ci(idx0Wins / N, N)}`);
const timeouts = results.filter((r) => r.timedOut).length;
console.log(`Timeouts (must be 0): ${timeouts}`);

// Duration.
const durs = results.map((r) => r.seconds).sort((a, b) => a - b);
const q = (p: number) => durs[Math.floor(p * (durs.length - 1))].toFixed(1);
console.log(`Duration s: p10 ${q(0.1)}  p25 ${q(0.25)}  median ${q(0.5)}  p75 ${q(0.75)}  p90 ${q(0.9)}  max ${q(1)}`);
const phaseCount: Record<string, number> = {};
for (const r of results) phaseCount[r.phase] = (phaseCount[r.phase] ?? 0) + 1;
console.log('End phase:', Object.entries(phaseCount).map(([k, v]) => `${k} ${pct(v / N)}`).join('  '));
const methods: Record<string, number> = {};
for (const r of results) methods[r.method] = (methods[r.method] ?? 0) + 1;
console.log('Finish methods:', Object.entries(methods).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v / N)}`).join('  '));
const hp = results.map((r) => r.hpLeft).sort((a, b) => a - b);
console.log(`Winner HP left: median ${hp[Math.floor(hp.length / 2)].toFixed(0)}  close (<20%) ${pct(hp.filter((h) => h < 200).length / N)}`);
const comebacks = results.filter((r) => r.stats[r.winner].minWinProb < 0.25).length;
console.log(`Comebacks (winner dipped below 25% win prob): ${pct(comebacks / N)}   last stands/fight ${(results.reduce((a, r) => a + r.lastStands, 0) / N).toFixed(2)}`);

// Per-fight averages of stats.
const keys = Object.keys(results[0].stats[0]) as (keyof BattleResult['stats'][0])[];
const avg: Record<string, number> = {};
for (const k of keys) avg[k] = results.reduce((a, r) => a + (r.stats[0][k] as number) + (r.stats[1][k] as number), 0) / (2 * N);
console.log('Per-fighter averages:', keys.filter((k) => !['lowestHp', 'minWinProb'].includes(k)).map((k) => `${k} ${avg[k].toFixed(1)}`).join(', '));

// Event frequency.
const ev: Record<string, number> = {};
for (const r of results) for (const [k, v] of Object.entries(r.events)) ev[k] = (ev[k] ?? 0) + v;
const interesting = ['clash', 'parry', 'guardBreak', 'read', 'feint', 'whiffPunish', 'ultimate', 'lastStand', 'burst', 'wallSplat', 'propBreak', 'reflect', 'projectileClash', 'projectileCut', 'tech', 'dodge',
  'seq:bladeLock:start', 'seq:beamStruggle:start', 'seq:blitz:start', 'seq:throw:grab', 'seq:throw:break', 'seq:counter:trigger', 'seq:thousandCuts:start', 'seq:transform:gather', 'seq:finalClash:start', 'timeStop', 'decoy'];
console.log('Events per fight:', interesting.map((k) => `${k} ${((ev[k] ?? 0) / N).toFixed(2)}`).join(', '));
const intents = Object.entries(ev).filter(([k]) => k.startsWith('intent:')).sort((a, b) => b[1] - a[1]);
console.log('Plans chosen per fight:', intents.map(([k, v]) => `${k.slice(7)} ${(v / N).toFixed(2)}`).join(', '));

// Balance by attribute: win rate of fighters having X (excluding mirror matchups on X).
function table(label: string, get: (d: BattleResult['winnerDef']) => string) {
  const w: Record<string, [number, number]> = {};
  for (const r of results) {
    const a = get(r.winnerDef), b = get(r.loserDef);
    if (a === b) continue;
    (w[a] ??= [0, 0])[0]++;
    w[a][1]++;
    (w[b] ??= [0, 0])[1]++;
  }
  const rows = Object.entries(w).sort((x, y) => y[1][0] / y[1][1] - x[1][0] / x[1][1]);
  console.log(`\n${label}:`);
  for (const [k, [wins, n]] of rows) {
    const p = wins / n;
    const flag = Math.abs(p - 0.5) > 0.06 ? (p > 0.5 ? '  ▲' : '  ▼') : '';
    console.log(`  ${k.padEnd(18)} ${pct(p).padStart(6)} ±${ci(p, n).padStart(4)}  (n=${n})${flag}`);
  }
}
table('Weapon', (d) => d.weapon);
table('Aspect', (d) => d.aspect);
table('Personality', (d) => d.personality);
for (const slot of ['mobility', 'ranged', 'special', 'defense', 'ultimate'] as const) table(`Ability (${slot})`, (d) => d.abilities[slot]);

if (fit) {
  // Logistic regression on sampled mid-fight states -> outcome.
  console.log('\nFitting win-probability model...');
  const X: number[][] = [], Y: number[] = [];
  const fr = new Rng(77);
  for (let i = 0; i < Math.min(N, 1500); i++) {
    const setup = createBattle(fr.nextU32());
    const { sim } = createSimulation(setup, { headless: true });
    const samples: number[][] = [];
    while (!sim.over && sim.tick < 60 * 240) {
      sim.step();
      sim.takeEvents();
      if (sim.tick % 90 === 0 && !sim.decided) samples.push(winProbFeatures(sim));
    }
    const y = sim.winner === 0 ? 1 : 0;
    for (const s of samples) {
      X.push(s);
      Y.push(y);
      // Mirror sample enforces antisymmetry.
      X.push(s.map((v) => -v));
      Y.push(1 - y);
    }
  }
  const w = new Array(X[0].length).fill(0);
  const lr = 0.5;
  for (let it = 0; it < 400; it++) {
    const g = new Array(w.length).fill(0);
    for (let i = 0; i < X.length; i++) {
      const z = X[i].reduce((a, v, j) => a + v * w[j], 0);
      const p = 1 / (1 + Math.exp(-z));
      for (let j = 0; j < w.length; j++) g[j] += (p - Y[i]) * X[i][j];
    }
    for (let j = 0; j < w.length; j++) w[j] -= (lr * g[j]) / X.length;
  }
  let ll = 0, acc = 0;
  for (let i = 0; i < X.length; i++) {
    const z = X[i].reduce((a, v, j) => a + v * w[j], 0);
    const p = 1 / (1 + Math.exp(-z));
    ll += Y[i] ? Math.log(p + 1e-9) : Math.log(1 - p + 1e-9);
    acc += (p > 0.5 ? 1 : 0) === Y[i] ? 1 : 0;
  }
  console.log('coefficients [hp, hpRatio, energy, wrath, guard, lastStand, ascended]:', w.map((v) => v.toFixed(3)).join(', '));
  console.log(`samples ${X.length}  logloss ${(-ll / X.length).toFixed(4)}  accuracy ${pct(acc / X.length)}`);
}
