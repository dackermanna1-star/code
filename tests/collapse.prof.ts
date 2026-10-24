// Profiles the worst simulation steps of the construction-site collapse.
import { World } from '../src/world/world';
import { generateFactory, MAP } from '../src/map/factory';
import { Game } from '../src/game/game';
import { Destruction } from '../src/game/destruction';
const world = new World(MAP.sx, MAP.sy, MAP.sz, MAP.G);
generateFactory(world);
const game = new Game(null, world, {} as any, 0);
const d = new Destruction(game);
game.destruction = d;
// like the loading screen: analyse every intact structure once up front
{ const tb = performance.now(); while (game.stress.baselineStep(1280, 1280, 1e9)) { /* all tiles */ } console.log(`baselines ${(performance.now() - tb).toFixed(0)} ms`); }
game.onImpactHook = (e) => d.impact(e.a, e.b, e.x, e.y, e.z, e.nx, e.ny, e.nz, e.speed, e.meff, e.matB);
const blasts = [[79.2, 5.6, 189.2], [86.2, 5.6, 189.2], [79.2, 5.6, 196.2], [86.2, 5.6, 196.2]];
let t = performance.now();
for (const [x, y, z] of blasts) d.explode(x, y, z, 3);
console.log(`blasts ${(performance.now() - t).toFixed(1)} ms`, JSON.stringify(d.prof));
const worst: { i: number; ms: number; p: Record<string, number>; bodies: number; awake: number; pp: string }[] = [];
for (let i = 0; i < 60 * (+(process.env.SECS || 10)); i++) {
  for (const k in game.prof) game.prof[k] = 0;
  const ts = performance.now();
  game.step(1 / 60);
  d.update(1 / 60);
  const ms = performance.now() - ts;
  if (ms > 30) worst.push({ i, ms, p: { ...game.prof }, bodies: game.physics.bodies.length, awake: game.physics.stats.awake, pp: `[w ${game.physics.prof.world.toFixed(1)} b ${game.physics.prof.bodies.toFixed(1)} s ${game.physics.prof.solve.toFixed(1)} o ${game.physics.prof.other.toFixed(1)} contacts ${game.physics.stats.contacts} pairs ${game.physics.stats.pairs}]` });
}
worst.sort((a, b) => b.ms - a.ms);
for (const w of worst.slice(0, 15)) console.log(`step ${w.i} ${w.ms.toFixed(0)} ms bodies ${w.bodies} awake ${w.awake}`, Object.entries(w.p).map(([k, v]) => `${k}=${v.toFixed(1)}`).join(' '), w.pp);
console.log(`${worst.length} steps over 30 ms`);
const hist: Record<string, number> = {};
for (const b of game.physics.bodies) {
  const c = b.count, k = c <= 20 ? '<=20' : c <= 50 ? '<=50' : c <= 200 ? '<=200' : c <= 1000 ? '<=1000' : c <= 10000 ? '<=10k' : '>10k';
  hist[k] = (hist[k] || 0) + 1;
}
console.log('body sizes', JSON.stringify(hist), 'samples', game.physics.bodies.reduce((a, b) => a + b.nSamples, 0));
