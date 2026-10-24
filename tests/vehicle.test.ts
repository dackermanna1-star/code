// Vehicles carry fuel: a hard bump must not set them off, a bomb next to them must.
import { World } from '../src/world/world';
import { Game } from '../src/game/game';
import { Destruction } from '../src/game/destruction';
import { Fire } from '../src/game/fire';
import { makeProp } from '../src/map/props';
import { Rng } from '../src/engine/math';
let fails = 0;
const check = (name: string, ok: boolean, info: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${info}`); if (!ok) fails++; };
const setup = () => {
  const world = new World(256, 128, 256, 48);
  world.initTerrain();
  const game = new Game(null, world, {} as any, 0);
  const d = new Destruction(game);
  game.destruction = d;
  game.onImpactHook = (e) => d.impact(e.a, e.b, e.x, e.y, e.z, e.nx, e.ny, e.nz, e.speed, e.meff, e.matB);
  const fire = new Fire(game);
  d.ignite = (x, y, z) => fire.ignite(x, y, z);
  d.igniteSurface = (x, y, z) => fire.igniteSurface(x, y, z);
  let blasts = 0;
  d.onExplosion = () => { blasts++; };
  const car = makeProp('car', new Rng(5));
  const b = game.spawnGrid(car.vox, car.sx, car.sy, car.sz, 110, 68, 120)!;
  return { world, game, d, fire, b, blasts: () => blasts };
};
{
  const s = setup();
  for (let i = 0; i < 180; i++) { s.game.step(1 / 60); s.d.update(1 / 60); s.fire.update(1 / 60); }
  check('car dropped 2 m does not explode', s.blasts() === 0, `explosive voxels ${s.b.explosive}/${s.b.count}, blasts ${s.blasts()}, resting y ${s.b.pos.y.toFixed(2)}`);
}
{
  const s = setup();
  for (let i = 0; i < 120; i++) { s.game.step(1 / 60); s.d.update(1 / 60); }
  s.d.explode(s.b.pos.x + 2.6, 5.0, s.b.pos.z, 1.2);
  for (let i = 0; i < 120; i++) { s.game.step(1 / 60); s.d.update(1 / 60); s.fire.update(1 / 60); }
  check('pipe bomb next to the car sets off its fuel tank', s.blasts() >= 2, `blasts ${s.blasts()}, fires ${s.fire.count}`);
}
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
