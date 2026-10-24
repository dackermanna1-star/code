// Headless collapse test: blow up ground floor columns of the construction-site skeleton and check that
// the floors above come down (progressive collapse driven by stress + connectivity + rigid bodies).
import { World } from '../src/world/world';
import { generateFactory, MAP } from '../src/map/factory';
import { Game } from '../src/game/game';
import { Destruction } from '../src/game/destruction';
const world = new World(MAP.sx, MAP.sy, MAP.sz, MAP.G);
generateFactory(world);
const game = new Game(null, world, {} as any, 0);
const d = new Destruction(game);
game.destruction = d;
game.onImpactHook = (e) => d.impact(e.a, e.b, e.x, e.y, e.z, e.nx, e.ny, e.nz, e.speed, e.meff, e.matB);
const G = MAP.G;
const count = (y0: number, y1: number) => {
  let n = 0;
  world.forEachSolid(720, y0, 1820, 1004, y1, 2034, () => { n++; });
  return n;
};
const slabs = () => [count(G + 32, G + 34), count(G + 66, G + 68), count(G + 100, G + 102)];
const before = slabs();
console.log('slab voxels before (L1, L2, L3):', before.join(', '));
const blasts = [[79.2, 5.6, 189.2], [86.2, 5.6, 189.2], [79.2, 5.6, 196.2], [86.2, 5.6, 196.2]];
for (const [x, y, z] of blasts) d.explode(x, y, z, 3);
const t0 = performance.now();
let maxStep = 0;
for (let i = 0; i < 60 * (+(process.env.SECS || 12)); i++) {
  const ts = performance.now();
  game.step(1 / 60);
  d.update(1 / 60);
  maxStep = Math.max(maxStep, performance.now() - ts);
  if (i % 120 === 0) console.log(`t=${(i / 60).toFixed(1)}s bodies=${game.physics.bodies.length} awake=${game.physics.stats.awake} stress=${JSON.stringify(game.stress.stats)} pendingStress=${game.stress.pending} slabs=${slabs().join('/')}`);
}
const after = slabs();
console.log('slab voxels after:', after.join(', '), `sim ${(performance.now() - t0).toFixed(0)} ms, max step ${maxStep.toFixed(0)} ms`);
const lost = after.map((a, i) => 1 - a / before[i]);
console.log(lost.some((l) => l > 0.2) ? 'PASS upper floors collapsed (fraction lost: ' + lost.map((l) => l.toFixed(2)).join(', ') + ')' : 'FAIL structure still standing');
