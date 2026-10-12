// Headless balance simulation: runs the real game logic with the bot.
// Usage: npx vite-node tools/sim.ts -- [runs=10] [skill=0.85] [startLevel=1]
// FP=1 plays the first-person rules instead: the bot still walks, but aims
// with a 3D aim (player.aim) at the most urgent creature and fires when the
// reticle is on it (Combat.aimTrace).
import { World } from '../src/core/World';
import { Bot } from '../src/core/Bot';
import type { Player } from '../src/core/Player';
import { TICK_RATE } from '../src/config/constants';

/** First-person aimbot: look at the creature closest to escaping, fire when it is under the reticle. */
function fpAim(w: World, p: Player, skill: number): void {
  const inp = p.input;
  inp.move = { x: (inp.right ? 1 : 0) - (inp.left ? 1 : 0), z: (inp.down ? 1 : 0) - (inp.up ? 1 : 0) };
  let best = null;
  for (const e of w.enemies) {
    if (!e.alive || (e.canLeave && e.type !== 'walrus')) continue;
    if (!best || e.x > best.x) best = e;
  }
  inp.fire = false;
  if (!best) return;
  let v = best.hitVolumes()[0];
  for (const h of best.hitVolumes()) {
    if (h.part === 'shell' || h.part === 'cub') continue;
    if (h.part === 'head' && (best.maxLife < 200 || best.type === 'turtle')) {
      v = h;
      break;
    }
    if (h.rx * h.ry > v.rx * v.ry || v.part === 'shell' || v.part === 'cub') v = h;
  }
  const eye = p.eye();
  const noise = (1 - skill) * 0.04;
  const dx = v.x - eye.x;
  const dz = v.z - eye.z;
  const target = { yaw: Math.atan2(dz, -dx) + w.rng.range(-noise, noise), pitch: Math.atan2(v.y - eye.y, Math.hypot(dx, dz)) };
  // Turn towards the target at a human-ish rate.
  const a = p.aim ?? { yaw: 0, pitch: 0 };
  const turn = 0.12 + 0.2 * skill;
  let dy = target.yaw - a.yaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  a.yaw += Math.max(-turn, Math.min(turn, dy));
  a.pitch += Math.max(-turn, Math.min(turn, target.pitch - a.pitch));
  p.aim = a;
  const tr = w.combat.aimTrace(p);
  inp.fire = !!tr?.enemy && !(tr.enemy.canLeave && tr.enemy.type !== 'walrus');
}

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
    if (process.env.FP) fpAim(w, w.player, skill);
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
console.log(`\n${process.env.FP ? 'first person, ' : ''}skill ${skill}: victories ${results.filter((r) => r.phase === 'victory').length}/${runs}, avg level ${avg((r) => r.level)}, avg kills ${avg((r) => r.kills)}, avg time ${avg((r) => r.time)}s`);
