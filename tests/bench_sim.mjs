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

// Full systems: run a simulated day at high speed and report what happened.
const { installSystems } = await import('../src/gameplay/systems.js');
const sim2 = new Simulation({ seed: 9 });
sim2.spawnItems();
installSystems(sim2, { sentence: { days: 10 } });
const p2 = sim2.addCharacter({ id: 'player', first: 'New', last: 'Fish', kind: 'inmate', stats: {} }, randomAppearance(77, { outfit: 'inmateA' }), { isPlayer: true });
const beds = sim2.world.spots.filter((s) => s.activity === 'sleep' && s.cell && !s.cell.startsWith('H'));
p2.place(38, 30); p2.cell = beds[0].cell; p2.bed = beds[0];
let bi = 1;
for (const d of defs) {
  const c = sim2.addCharacter({ ...d, seed: 300 + bi }, randomAppearance(300 + bi, d.app || {}));
  if (d.kind === 'inmate') { const b = beds[bi++]; c.bed = b; c.cell = b.cell; c.place(b.ax, b.az); }
  else c.place(38, 28);
}
sim2.clock.scale = 3; // fast day
const counts = {};
sim2.events.on('*', (t) => { counts[t] = (counts[t] || 0) + 1; });
const t0 = performance.now();
let lastP = '';
const where = {};
const crimes = {}; sim2.events.on('crime', (e) => { crimes[e.crime] = (crimes[e.crime] || 0) + 1; });
for (let k = 0; k < 60 * 60 * 6.2; k++) {
  sim2.step(1 / 60);
  const per = sim2.clock.period;
  const mid = sim2.clock.minutes >= per.start + Math.min(25, (per.end - per.start) / 2);
  if (per.id !== lastP && mid) {
    lastP = per.id;
    const rooms = {};
    for (const c of sim2.characters) if (c.kind === 'inmate' && !c.isPlayer) { const r = sim2.world.roomAt(c.x, c.z); const id = r ? (r.cell ? 'cell' : r.id) : '?'; rooms[id] = (rooms[id] || 0) + 1; }
    where[`${sim2.clock.hhmm} ${per.id}`] = rooms;
  }
}
console.log('simulated to', sim2.clock.hhmm, 'day', sim2.clock.day, 'in', ((performance.now() - t0) / 1000).toFixed(1), 's');
for (const [k, v] of Object.entries(where)) console.log(k.padEnd(18), JSON.stringify(v));
console.log('events', JSON.stringify(counts));
console.log('crimes', JSON.stringify(crimes));
