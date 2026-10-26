// Chain reaction at the tank farm: shoot a rocket-sized blast at the first fuel tank and watch the cascade.
import { World } from '../src/world/world';
import { generateFactory, MAP } from '../src/map/factory';
import { Game } from '../src/game/game';
import { Destruction } from '../src/game/destruction';
import { Fire } from '../src/game/fire';
const world = new World(MAP.sx, MAP.sy, MAP.sz, MAP.G);
generateFactory(world);
const game = new Game(null, world, {} as any, 0);
const d = new Destruction(game);
game.destruction = d;
game.onImpactHook = (e) => d.impact(e.a, e.b, e.x, e.y, e.z, e.nx, e.ny, e.nz, e.speed, e.meff, e.matB);
const fire = new Fire(game);
d.ignite = (x, y, z) => fire.ignite(x, y, z);
d.igniteSurface = (x, y, z) => fire.igniteSurface(x, y, z);
let blasts = 0, maxPower = 0;
d.onExplosion = (x, y, z, p) => { blasts++; maxPower = Math.max(maxPower, p); if (blasts <= 12 || blasts % 10 === 0) console.log(`  t=${(game.time).toFixed(2)} blast #${blasts} at (${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}) power ${p.toFixed(1)}`); };
let t = performance.now();
// rocket hit on the side of the west fuel tank (centre 210,90 m; radius 5.2 m)
d.explode(204.6, 9.0, 90.0, 2.5);
console.log(`first blast ${(performance.now() - t).toFixed(0)} ms`);
let maxStep = 0, worst = '';
const secs = +(process.env.SECS || 12);
for (let i = 0; i < 60 * secs; i++) {
  for (const k in game.prof) game.prof[k] = 0;
  for (const k in d.prof) d.prof[k] = 0;
  const ts = performance.now();
  game.step(1 / 60);
  d.update(1 / 60);
  fire.update(1 / 60);
  const ms = performance.now() - ts;
  if (ms > 100) console.log(`  slow step ${i}: ${ms.toFixed(0)} ms phys ${JSON.stringify(game.physics.prof)} contacts ${game.physics.stats.contacts} pairs ${game.physics.stats.pairs} awake ${game.physics.stats.awake} bodies ${game.physics.bodies.length}`);
  if (ms > maxStep) { maxStep = ms; worst = `step ${i}: phys ${JSON.stringify(game.physics.prof)} contacts ${game.physics.stats.contacts} pairs ${game.physics.stats.pairs} awake ${game.physics.stats.awake} ` + JSON.stringify(Object.fromEntries(Object.entries({ ...game.prof, ...d.prof }).filter(([, v]) => v > 1).map(([k, v]) => [k, +v.toFixed(1)]))); }
  if (i % 120 === 0) console.log(`t=${(i / 60).toFixed(0)}s bodies=${game.physics.bodies.length} awake=${game.physics.stats.awake} fires=${fire.count} blasts=${blasts} removed=${d.totalRemoved}`);
}
console.log(`blasts ${blasts} (max power ${maxPower.toFixed(1)}), fires ${fire.count}, removed ${d.totalRemoved}, max step ${maxStep.toFixed(0)} ms ${worst}`);
