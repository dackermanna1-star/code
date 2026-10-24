// A pipe bomb against one wall of each building: how far do stress cracks spread, and what does it cost?
// A small hole should stay a local event (a few crumbles around the hole), not unravel the building.
import { World } from '../src/world/world';
import { generateFactory, MAP } from '../src/map/factory';
import { Game } from '../src/game/game';
import { Destruction } from '../src/game/destruction';
import { makeProp } from '../src/map/props';
import { Rng } from '../src/engine/math';
let crumbles = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
const onCrumble = (x: number, y: number, z: number) => { crumbles++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); };
const cases: [string, number, number, number][] = [
  ['office facade', 156.0, 5.8, 220.4],
  ['warehouse wall', 17.6, 6.0, 70.0],
  ['hall plinth', 110.0, 6.0, 47.6],
  ['boiler house', 200.0, 6.0, 29.6],
  ['office 2nd floor', 166.0, 9.6, 220.4],
];
const secs = +(process.env.SECS || 20);
const only = process.env.CASE;
for (const [name, x, y, z] of cases) {
  if (only && !name.startsWith(only)) continue;
  // fresh level per case so cascades cannot leak into the next measurement
  const world = new World(MAP.sx, MAP.sy, MAP.sz, MAP.G);
  const map = generateFactory(world);
  const game = new Game(null, world, {} as any, 0);
  // props as in the game (asleep until disturbed)
  const rng = new Rng(12345);
  for (const p of map.props) {
    const grid = makeProp(p.kind, p.seed !== undefined ? new Rng(p.seed) : rng).rotY(p.rot);
    game.spawnGrid(grid.vox, grid.sx, grid.sy, grid.sz, p.x, p.y, p.z, undefined, true);
  }
  for (let i = 0; i < 30; i++) game.step(1 / 60); // warm up
  const d = new Destruction(game);
  game.destruction = d;
  game.onImpactHook = (e) => d.impact(e.a, e.b, e.x, e.y, e.z, e.nx, e.ny, e.nz, e.speed, e.meff, e.matB);
  game.onCrumble = onCrumble;
  while (game.stress.baselineStep(1280, 1280, 1e9)) { /* all tiles */ }
  crumbles = 0; minX = minY = minZ = 1e9; maxX = maxY = maxZ = -1e9;
  const f0 = game.stress.stats.failures, r0 = d.totalRemoved, a0 = game.stress.stats.analyses;
  for (const k in d.prof) d.prof[k] = 0;
  const tb = performance.now();
  d.explode(x, y, z, 1.8);
  const dprof = Object.entries(d.prof).filter(([, v]) => v > 2).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ');
  const blastMs = performance.now() - tb;
  const blastRemoved = d.totalRemoved - r0;
  let maxStep = 0, total = 0, slow = 0, worst = '';
  for (let i = 0; i < 60 * secs; i++) {
    for (const k in game.prof) game.prof[k] = 0;
    const t = performance.now();
    game.step(1 / 60); d.update(1 / 60);
    const ms = performance.now() - t;
    total += ms; if (ms > 16) slow++;
    if (ms > maxStep) { maxStep = ms; worst = `step ${i}: ` + Object.entries({ ...game.prof }).filter(([, v]) => v > 2).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ') + ' | phys ' + Object.entries(game.physics.prof).filter(([, v]) => (v as number) > 2).map(([k, v]) => `${k} ${(v as number).toFixed(0)}`).join(', '); }
  }
  const span = crumbles ? `${(maxX - minX).toFixed(1)} x ${(maxY - minY).toFixed(1)} x ${(maxZ - minZ).toFixed(1)} m` : '-';
  console.log(`${name.padEnd(18)} blast ${blastRemoved} vox | failures ${game.stress.stats.failures - f0}, analyses ${game.stress.stats.analyses - a0}, crumbles ${crumbles} spanning ${span} | bodies ${game.physics.bodies.length} | blast ${blastMs.toFixed(0)} ms, sim ${total.toFixed(0)} ms for ${secs}s, max step ${maxStep.toFixed(0)} ms, steps>16ms ${slow}\n    blast: ${dprof}\n    worst ${worst}`);
}
