/**
 * Run one headless battle and print a play-by-play summary.
 *   npm run fight -- [seedHex]
 */
import { createBattle } from '../src/sim/generator';
import { createSimulation } from '../src/game/battle';
import { codeToSeed, freshSeed, seedToCode } from '../src/core/rng';
import { ABILITIES } from '../src/sim/abilities';

const arg = process.argv[2];
const seed = arg ? codeToSeed(arg) ?? freshSeed() : freshSeed();
const setup = createBattle(seed);
const { sim } = createSimulation(setup, { headless: true });
const name = (s: number) => setup.fighters[s].name;

console.log(`Seed ${seedToCode(seed)} — ${sim.theme.name}`);
for (const f of setup.fighters) {
  const ab = Object.values(f.abilities).map((a) => ABILITIES[a].def.name).join(', ');
  console.log(`  ${f.name}, ${f.title} [${f.aspect} / ${f.weapon} / ${f.personality}] — ${ab}`);
}
const t0 = performance.now();
const verbose = process.argv.includes('-v');
while (!sim.over && sim.tick < 60 * 240) {
  sim.step();
  for (const e of sim.takeEvents()) {
    const t = sim.time.toFixed(1).padStart(5);
    switch (e.type) {
      case 'intent': console.log(`${t}s  ${name(e.side)} → ${e.intent} (${e.reason})`); break;
      case 'ultimate': console.log(`${t}s  ★ ${name(e.side)} unleashes ${e.name}!`); break;
      case 'lastStand': console.log(`${t}s  ‼ ${name(e.side)} refuses to fall — LAST STAND`); break;
      case 'guardBreak': console.log(`${t}s  ${name(e.attacker)} shatters ${name(e.defender)}'s guard`); break;
      case 'parry': if (e.perfect) console.log(`${t}s  ${name(e.parrier)} PERFECT PARRY`); break;
      case 'read': console.log(`${t}s  ${name(e.side)} reads the ${e.what}!`); break;
      case 'clash': if (e.lock || verbose) console.log(`${t}s  CLASH${e.lock ? ' — blades locked' : ''}`); break;
      case 'seq': if (e.beat === 'start' || e.beat === 'overpower' || e.beat === 'overwhelm' || e.beat === 'decisive' || e.beat === 'resolve' || e.beat === 'slip') console.log(`${t}s  [${e.kind}] ${e.beat}`); break;
      case 'ko': console.log(`${t}s  KO — ${name(e.winner)} defeats ${name(e.loser)} by ${e.method} (${e.source})`); break;
      case 'hit': if (verbose || e.level >= 4 || e.combo >= 6) console.log(`${t}s  ${name(e.attacker)} hits ${name(e.defender)} ${e.source} for ${e.damage.toFixed(0)} (combo ${e.combo})`); break;
      case 'phase': console.log(`${t}s  — phase: ${e.phase}`); break;
      default: break;
    }
  }
}
const ms = performance.now() - t0;
const [a, b] = sim.fighters;
console.log(`Winner: ${sim.winner !== null ? name(sim.winner) : 'NONE'} in ${sim.time.toFixed(1)}s (${sim.tick} ticks, ${ms.toFixed(0)}ms) — method ${sim.winMethod}`);
console.log(`HP: ${a.name} ${a.hp.toFixed(0)}  ${b.name} ${b.hp.toFixed(0)}`);
for (const f of [a, b]) {
  const s = f.stats;
  console.log(`  ${f.name}: dealt ${s.damageDealt.toFixed(0)} hits ${s.hitsLanded} blocks ${s.blocks} parries ${s.parries}(${s.perfectParries}) dodges ${s.dodges} tps ${s.teleports} abil ${s.abilitiesUsed} ult ${s.ultimatesUsed} combo ${s.longestCombo} reads ${s.reads} feints ${s.feints} wp ${s.whiffPunishes}`);
}
