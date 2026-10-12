// Headless balance simulation: runs the real game logic with the bot.
// Usage: npx vite-node tools/sim.ts -- [runs=10] [skill=0.85] [startLevel=1]
import { World } from '../src/core/World';
import { Bot } from '../src/core/Bot';
import { TICK_RATE } from '../src/config/constants';

const args = process.argv.slice(2).filter((a) => a !== '--');
const runs = Number(args[0] ?? 10);
const skill = Number(args[1] ?? 0.85);
const startLevel = Number(args[2] ?? 1);

interface Result {
  seed: number;
  phase: string;
  level: number;
  time: number;
  kills: number;
  money: number;
  earned: number;
  reason: string;
  buys: string[];
  levelTimes: number[];
  accuracy: number;
}

const results: Result[] = [];
for (let r = 0; r < runs; r++) {
  const seed = 1000 + r;
  const w = new World({ seed, startLevel, money: startLevel > 1 ? 2500 * (startLevel - 1) : 0 });
  const bot = new Bot(w.player, { skill, buyList: (process.env.BUY ?? 'magnum,mp5,mac10,m4,minigun').split(',') as never });
  const buys: string[] = [];
  const levelTimes: number[] = [];
  w.events.on('buy', (e) => buys.push(`${e.weapon}@${(w.tick / TICK_RATE).toFixed(0)}s`));
  w.events.on('levelComplete', () => levelTimes.push(Math.round(w.tick / TICK_RATE)));
  const maxTicks = TICK_RATE * 60 * 15;
  while (!w.gameEnded && w.tick < maxTicks) {
    bot.think(w);
    w.step();
  }
  const s = w.player.stats;
  results.push({
    seed,
    phase: w.phase,
    level: w.levelNum,
    time: Math.round(w.tick / TICK_RATE),
    kills: s.kills,
    money: w.player.money,
    earned: s.moneyEarned,
    reason: w.describeGameOver(),
    buys,
    levelTimes,
    accuracy: s.shots ? Math.round((100 * s.hits) / s.shots) : 0,
  });
}

for (const r of results) {
  console.log(
    `seed ${r.seed}: ${r.phase.padEnd(8)} L${r.level} t=${r.time}s kills=${r.kills} earned=$${r.earned} left=$${r.money} acc=${r.accuracy}% levels@${r.levelTimes.join(',')} ${r.reason}\n   buys: ${r.buys.join(' ')}`,
  );
}
const avg = (f: (r: Result) => number) => (results.reduce((a, r) => a + f(r), 0) / results.length).toFixed(1);
console.log(`\nskill ${skill}: victories ${results.filter((r) => r.phase === 'victory').length}/${runs}, avg level ${avg((r) => r.level)}, avg kills ${avg((r) => r.kills)}, avg time ${avg((r) => r.time)}s`);
