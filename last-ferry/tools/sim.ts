// Headless balance simulation: the real Last Ferry logic played by the bot.
// Usage: npm run ferry:sim -- [runs=10] [skill=0.9] [startChapter=1]
// Env: SEED=1000 (first seed), MAXCH=N (stop after chapter N), BUY=nailgun,shotgun,flare,harpoon,outboard, VERBOSE=1,
//      NOHORN=1 / NOCRANE=1 / NOCANNON=1 / NOSTOMP=1 / NOFLARE=1 (switch a verb off),
//      QUIET=1 (summary only).
import { World } from '../src/core/World';
import { BOT_BUY_LIST, Bot } from '../src/core/Bot';
import { CHAPTER_START_MONEY } from '../src/config/chapters';
import type { WeaponId } from '../src/config/ids';
import { TICK_RATE } from '../src/config/world';

interface Result {
  seed: number;
  phase: string;
  chapter: number;
  time: number;
  kills: number;
  earned: number;
  money: number;
  reason: string;
  cause: string;
  buys: string[];
  chapterTimes: number[];
  accuracy: number;
  tricks: string;
  perChapter: string;
  peak: { zombies: number; corpses: number };
  msPerTick: number;
}

const env = (k: string) => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[k];
const argv = ((globalThis as { process?: { argv: string[] } }).process?.argv ?? []).slice(2).filter((a) => a !== '--');
const runs = Number(argv[0] ?? 10);
const skill = Number(argv[1] ?? 0.9);
const startChapter = Number(argv[2] ?? 1);
const seed0 = Number(env('SEED') ?? 1000);
const buyList = (env('BUY')?.split(',') ?? BOT_BUY_LIST) as WeaponId[];
const verbose = !!env('VERBOSE');
/** Stop once this chapter is won (MAXCH=1: chapter 1 only). */
const maxChapter = Number(env('MAXCH') ?? 3);

const results: Result[] = [];
const mopUps: number[] = [];
for (let r = 0; r < runs; r++) {
  const seed = seed0 + r;
  const startMoney = CHAPTER_START_MONEY[startChapter] ?? 0;
  const w = new World({ seed, startChapter, money: startMoney });
  const bot = new Bot(w.player, {
    skill,
    buyList,
    horn: !env('NOHORN'),
    crane: !env('NOCRANE'),
    cannon: !env('NOCANNON'),
    stomp: !env('NOSTOMP'),
    flare: !env('NOFLARE'),
  });
  const buys: string[] = [];
  const chapterTimes: number[] = [];
  w.events.on('buy', (e) => buys.push(`${e.weapon}@${Math.round(w.tick / TICK_RATE)}s`));
  w.events.on('chapterComplete', () => chapterTimes.push(Math.round(w.tick / TICK_RATE)));
  if (verbose) {
    w.events.on('bossSpawn', (e) => console.log(`  [${seed}] t=${(w.tick / TICK_RATE).toFixed(0)}s boss: ${e.name} (zombies ${w.zombies.length}, bodies ${w.corpses.length}, $${w.player.money})`));
    w.events.on('chapterStart', (e) => console.log(`  [${seed}] t=${(w.tick / TICK_RATE).toFixed(0)}s chapter ${e.num} start, $${w.player.money}`));
  }
  const peak = { zombies: 0, corpses: 0 };
  const perChapter: string[] = [];
  let rises = 0;
  let burns = 0;
  let mopUp = 0;
  let slowmos = 0;
  w.events.on('corpseRise', () => rises++);
  w.events.on('zombieDeath', (e) => e.deathKind === 'burn' && burns++);
  w.events.on('mopUp', () => (mopUp = w.tick));
  w.events.on('chapterComplete', () => {
    if (mopUp) mopUps.push((w.tick - mopUp) / TICK_RATE);
    mopUp = 0;
  });
  w.events.on('slowmo', () => slowmos++);
  let ch0 = { earned: 0, kills: 0, rises: 0, t: 0 };
  const chapterLine = (num: number, how: string) => {
    const st = w.player.stats;
    perChapter.push(`ch${num} ${how} ${Math.round((w.tick - ch0.t) / TICK_RATE)}s $${st.earned - ch0.earned} k${st.kills - ch0.kills} rise${rises - ch0.rises}`);
    ch0 = { earned: st.earned, kills: st.kills, rises, t: w.tick };
  };
  w.events.on('chapterComplete', (e) => chapterLine(e.num, 'won'));
  const maxTicks = TICK_RATE * 60 * 20;
  const t0 = performance.now();
  while (!w.gameEnded && w.tick < maxTicks && w.chapter <= maxChapter) {
    bot.think(w);
    w.step();
    if (w.tick % 25 === 0) {
      peak.zombies = Math.max(peak.zombies, w.zombies.length);
      peak.corpses = Math.max(peak.corpses, w.corpses.length);
    }
  }
  const ms = performance.now() - t0;
  if (w.phase !== 'victory' && w.chapter <= maxChapter) chapterLine(w.chapter, w.phase === 'gameover' ? 'lost' : 'timeout');
  const s = w.player.stats;
  const g = w.gameOverInfo;
  results.push({
    seed,
    phase: w.phase,
    chapter: w.chapter,
    time: Math.round(w.tick / TICK_RATE),
    kills: s.kills,
    earned: s.earned,
    money: w.player.money,
    reason: w.describeGameOver(),
    cause: g ? (g.reason === 'dead' ? 'dead' : `${g.risen ? 'crawler:' : ''}${g.kind}${g.boss ? '(boss)' : ''}`) : w.phase,
    buys,
    chapterTimes,
    accuracy: s.shots ? Math.round((100 * s.hits) / s.shots) : 0,
    perChapter: perChapter.join(' | '),
    tricks: `horn ${s.horns} crane ${s.craneDrops} cannon ${s.cannonStrikes} stomps ${s.stomps} kicks ${s.kicks} nice ${s.niceShots} slowmo ${slowmos} burned ${burns}`,
    peak,
    msPerTick: ms / Math.max(1, w.tick),
  });
}

for (const r of env('QUIET') ? [] : results) {
  console.log(
    `seed ${r.seed}: ${r.phase.padEnd(8)} ch${r.chapter} t=${r.time}s kills=${r.kills} earned=$${r.earned} left=$${r.money} acc=${r.accuracy}% ch-done@${r.chapterTimes.join(',') || '-'} cause=${r.cause}\n` +
      `   ${r.perChapter}\n   ${r.tricks} | peak zombies ${r.peak.zombies} bodies ${r.peak.corpses} | ${r.msPerTick.toFixed(3)} ms/tick\n   buys: ${r.buys.join(' ')}`,
  );
}
const n = results.length;
const avg = (f: (r: Result) => number) => (results.reduce((a, r) => a + f(r), 0) / n).toFixed(1);
const reached = (c: number) => results.filter((r) => r.phase === 'victory' || r.chapter > c).length;
const causes: Record<string, number> = {};
for (const r of results) if (r.phase === 'gameover') causes[r.cause] = (causes[r.cause] ?? 0) + 1;
console.log(
  `\nskill ${skill}, ${n} runs from chapter ${startChapter}: cleared ch1 ${reached(1)}/${n}, ch2 ${reached(2)}/${n}, ch3 (victory) ${results.filter((r) => r.phase === 'victory').length}/${n}` +
    `\n  avg chapter ${avg((r) => r.chapter)}, avg kills ${avg((r) => r.kills)}, avg earned $${avg((r) => r.earned)}, avg time ${avg((r) => r.time)}s, avg ${avg((r) => r.msPerTick)} ms/tick` +
    `\n  game over causes: ${Object.entries(causes).map(([k, v]) => `${k} ×${v}`).join(', ') || 'none'}` +
    `\n  mop-ups: ${mopUps.length ? `${mopUps.length}, avg ${(mopUps.reduce((a, b) => a + b, 0) / mopUps.length).toFixed(1)} s, max ${Math.max(...mopUps).toFixed(1)} s` : 'none'}`,
);
