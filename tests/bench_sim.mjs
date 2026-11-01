// Headless simulation benchmark: spawns the full population and measures per-step cost.
import { Simulation } from '../src/sim.js';
import { randomAppearance } from '../src/characters/appearance.js';
import { NOTABLES, generateInmates } from '../src/characters/roster.js';

const sim = new Simulation({ seed: 5 });
sim.spawnItems();
const defs = [...NOTABLES, ...generateInmates(22, 9001)];
const pApp = randomAppearance(77, { outfit: 'inmateA' });
const p = sim.addCharacter({ id: 'player', first: 'New', last: 'Fish', kind: 'inmate', stats: {} }, pApp, { isPlayer: true });
p.place(38, 30);
let i = 0;
for (const d of defs) {
  const c = sim.addCharacter({ ...d, seed: 100 + i }, randomAppearance(100 + i, d.app || {}));
  const pt = sim.world.randomPointIn(['hall', 'mess', 'rec', 'blockA', 'blockB', 'gym', 'laundry'][i % 7], sim.rng, c);
  c.place(pt[0], pt[1]);
  i++;
}
const time = (label, fn, n) => { const t0 = performance.now(); for (let k = 0; k < n; k++) fn(); const ms = (performance.now() - t0) / n; console.log(label.padEnd(28), ms.toFixed(3), 'ms'); return ms; };
time('warmup step (first 60)', () => sim.step(1 / 60), 60);
time('sim.step', () => sim.step(1 / 60), 300);
time('  animators only', () => { for (const c of sim.characters) c.anim.update(1 / 60, { speed: 2, vf: 2, vs: 0 }); }, 200);
time('  brains only', () => { for (const b of sim.brains.values()) b.update(1 / 60); }, 200);
time('  doors only', () => sim._doors(1 / 60), 200);
time('  separate only', () => sim._separate(), 200);
const nav = sim.world.nav;
time('  A* hall->yard (staff)', () => nav.findPath(38, 12, 40, 90, { isStaff: true }), 20);
console.log('characters', sim.characters.length, 'items', sim.items.items.size);
