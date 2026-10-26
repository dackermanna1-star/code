// Headless collapse test. Collapse is purely about connectivity: a structure stands as long as some path
// of solid voxels links it to the ground. Blowing out a few columns of the construction-site skeleton
// leaves its floors standing; cutting through everything at ground-floor height brings it all down.
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
let maxStep = 0, worst = '';
const sim = (secs: number) => {
  for (let i = 0; i < 60 * secs; i++) {
    for (const k in game.prof) game.prof[k] = 0;
    const ts = performance.now();
    game.step(1 / 60);
    d.update(1 / 60);
    const ms = performance.now() - ts;
    if (ms > maxStep) { maxStep = ms; worst = Object.entries(game.prof).filter(([, v]) => v > 1).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', '); }
  }
};
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const before = slabs();
console.log('slab voxels before (L1, L2, L3):', before.join(', '));

// 1) four ground-floor columns of one bay: the slabs still hang on the remaining columns
for (const [x, y, z] of [[79.2, 5.6, 189.2], [86.2, 5.6, 189.2], [79.2, 5.6, 196.2], [86.2, 5.6, 196.2]]) d.explode(x, y, z, 3);
sim(4);
const lost1 = slabs().map((a, i) => 1 - a / before[i]);
check(lost1.every((l) => l < 0.1), `floors stand while any column still connects them (fraction lost: ${lost1.map((l) => l.toFixed(2)).join(', ')})`);

// 2) cut through every column, wall and stair at about 1 m height: nothing connects the skeleton any more
const t0 = performance.now();
for (let y = G + 10; y < G + 16; y++) for (let z = 1816; z <= 2038; z++) for (let x = 716; x <= 1008; x++) {
  if (!world.get(x, y, z)) continue;
  world.set(x, y, z, 0);
  game.structure.noteRemoved(x, y, z);
}
sim(6);
const lost2 = slabs().map((a, i) => 1 - a / before[i]);
const biggest = game.physics.bodies.reduce((m, b) => Math.max(m, b.count), 0);
check(lost2.every((l) => l > 0.9), `floors come down once nothing connects them to the ground (fraction lost: ${lost2.map((l) => l.toFixed(2)).join(', ')}, largest falling piece ${biggest} voxels)`);
console.log(`sim ${(performance.now() - t0).toFixed(0)} ms for 6 s after the cut, max step ${maxStep.toFixed(0)} ms (${worst})`);
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
if (fails) process.exit(1);
