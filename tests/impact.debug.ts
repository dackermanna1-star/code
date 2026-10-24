// Which part of impact handling spikes during the tank farm cascade?
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
while (game.stress.baselineStep(1280, 1280, 1e9)) { /* all tiles */ }
game.onImpactHook = (e) => d.impact(e.a, e.b, e.x, e.y, e.z, e.nx, e.ny, e.nz, e.speed, e.meff, e.matB);
const fire = new Fire(game);
d.ignite = (x, y, z) => fire.ignite(x, y, z);
d.igniteSurface = (x, y, z) => fire.igniteSurface(x, y, z);
const dd: any = d;
for (const m of ['carveWorld', 'carveBody', 'shatterGlassNear', 'materialEffects', 'detonateBody', 'detonateRegion']) {
  const o = dd[m].bind(d);
  dd[m] = (...a: any[]) => {
    const t = performance.now();
    const r = o(...a);
    const ms = performance.now() - t;
    if (ms > 15) console.log(`  ${m} ${ms.toFixed(0)} ms args ${a.slice(0, 4).map((v: any) => typeof v === 'number' ? v.toFixed(2) : (v && v.count !== undefined ? 'body' + v.count : typeof v)).join(',')}`);
    return r;
  };
}
const gs: any = game.stress, st: any = game.structure;
for (const [obj, m] of [[gs, 'prepare'], [gs, 'analyze'], [st, 'process']] as const) {
  const o = (obj as any)[m].bind(obj);
  (obj as any)[m] = (...a: any[]) => { const t = performance.now(); const r = o(...a); const ms = performance.now() - t; if (ms > 15) console.log(`    ${m} ${ms.toFixed(0)} ms`); return r; };
}
d.explode(204.6, 9.0, 90.0, 2.5);
for (let i = 0; i < 60 * 12; i++) {
  const t = performance.now();
  game.step(1 / 60); d.update(1 / 60); fire.update(1 / 60);
  const ms = performance.now() - t;
  if (ms > 80) console.log(`step ${i} ${ms.toFixed(0)} ms ${JSON.stringify(game.physics.prof, (k, v) => typeof v === 'number' ? +v.toFixed(1) : v)}`);
}
