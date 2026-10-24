// Cut four north-wall columns of the production hall at mid height: the truss roof over those bays
// should lose support and come down (progressive collapse), without the whole hall falling.
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
while (game.stress.baselineStep(1280, 1280, 1e9)) { /* all tiles */ }
const G = MAP.G, H = 140;
const roof = (x0: number, x1: number) => { let n = 0; world.forEachSolid(x0, G + H - 2, 470, x1, G + H + 40, 930, () => { n++; }); return n; };
const bays = () => [roof(1020, 1100), roof(1100, 1180), roof(1180, 1260), roof(1260, 1340), roof(1500, 1580)];
const before = bays();
console.log('roof voxels per bay before:', before.join(', '));
// cut the columns at x = 1100, 1180, 1260, 1340 between 4.5 m and 5.5 m height (like a torch / shaped charges)
for (const cx of [1100, 1180, 1260]) {
  game.stress.prepare(cx + 2, 483); // as any tool does before removing voxels
  for (let y = G + 45; y < G + 55; y++) for (let z = 478; z < 490; z++) for (let x = cx - 2; x < cx + 7; x++) {
    if (world.get(x, y, z)) { world.set(x, y, z, 0); game.structure.noteRemoved(x, y, z); }
  }
  game.stress.request(cx + 2, G + 50, 483, 0.05);
}
const t0 = performance.now();
let maxStep = 0;
for (let i = 0; i < 60 * (+(process.env.SECS || 12)); i++) {
  const ts = performance.now();
  game.step(1 / 60); d.update(1 / 60);
  maxStep = Math.max(maxStep, performance.now() - ts);
  if (i % 120 === 0) console.log(`t=${(i / 60).toFixed(0)}s bodies=${game.physics.bodies.length} awake=${game.physics.stats.awake} stress=${game.stress.stats.analyses}/${game.stress.stats.failures} bays=${bays().join('/')}`);
}
const after = bays();
console.log('roof voxels per bay after:', after.join(', '), `sim ${(performance.now() - t0).toFixed(0)} ms, max step ${maxStep.toFixed(0)} ms`);
const lost = after.map((a, i) => 1 - a / before[i]);
console.log(`lost fraction: ${lost.map((l) => l.toFixed(2)).join(', ')} (last bay is a control far from the cut)`);
