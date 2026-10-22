// Simulation throughput benchmark (no rendering).
// Usage: node scripts/bench-sim.mjs [scenario] [sizePerSide] [seconds]

import { generateMap } from '../src/world/mapgen.js';
import { World } from '../src/sim/world.js';
import { attachAI } from '../src/ai/index.js';
import { rng } from '../src/core/rng.js';

const scenario = process.argv[2] || 'town';
const size = Number(process.argv[3] || 1100);
const seconds = Number(process.argv[4] || 120);

rng.seed(5);
let t0 = performance.now();
const map = generateMap(scenario, 5);
const tMap = performance.now() - t0;
t0 = performance.now();
const world = new World(map, { tickets: size * 3 });
const army = { size, infantry: 1, armor: 1, air: 1, artillery: 1, drones: 1, reinforcements: true };
attachAI(world, [army, army]);
const tSetup = performance.now() - t0;
console.log(`map ${tMap.toFixed(0)} ms, world+AI ${tSetup.toFixed(0)} ms, units ${world.units.length}`);

const dt = 1 / 30;
const ticks = Math.round(seconds / dt);
const times = [];
let events = 0;
for (let i = 0; i < ticks; i++) {
  const a = performance.now();
  world.update(dt);
  times.push(performance.now() - a);
  events += world.events.length;
  world.events.length = 0;
  if (i % 300 === 299) {
    const recent = times.slice(-300);
    const avg = recent.reduce((s, x) => s + x, 0) / recent.length;
    const st = [world.strength(0), world.strength(1)];
    console.log(
      `t=${world.time.toFixed(0)}s avg ${avg.toFixed(2)} ms/tick max ${Math.max(...recent).toFixed(1)} ms · units ${world.units.length} (COA ${st[0].inf}i/${st[0].veh}v FED ${st[1].inf}i/${st[1].veh}v) · projectiles ${world.projectiles.active.length} · tickets ${world.factions[0].tickets}/${world.factions[1].tickets}`,
    );
  }
}
times.sort((a, b) => a - b);
const avg = times.reduce((s, x) => s + x, 0) / times.length;
console.log(`\n${ticks} ticks: avg ${avg.toFixed(2)} ms, p95 ${times[Math.floor(times.length * 0.95)].toFixed(2)} ms, p99 ${times[Math.floor(times.length * 0.99)].toFixed(2)} ms, events ${events}`);
console.log(`objectives: ${world.objectives.map((o) => `${o.letter}=${o.owner}`).join(' ')}  kills COA ${world.factions[0].kills} FED ${world.factions[1].kills}`);
