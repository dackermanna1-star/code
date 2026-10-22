// Battle flow diagnostics (headless): squad states, objective control, support
// usage, kills by weapon, and units that stopped moving while under orders.
// Usage: node scripts/diag-battle.mjs [scenario] [sizePerSide] [seconds] [seed]

import { generateMap } from '../src/world/mapgen.js';
import { World } from '../src/sim/world.js';
import { attachAI, planForces } from '../src/ai/index.js';
import { rng } from '../src/core/rng.js';

const scenario = process.argv[2] || 'town';
const size = Number(process.argv[3] || 600);
const seconds = Number(process.argv[4] || 600);
const seed = Number(process.argv[5] || 5);

rng.seed(seed);
const map = generateMap(scenario, seed);
const forces = planForces(map, size);
const world = new World(map, { tickets: forces.tickets });
attachAI(world, forces.armies);
console.log(`${scenario} seed ${seed}: ${world.units.length} units, attacker ${map.attacker}`);

const dt = 1 / 30;
const kills = [{}, {}];
const fire = {};
const counts = {};
const last = new Map();
let wall = 0;
const inc = (o, k, n = 1) => (o[k] = (o[k] || 0) + n);
for (let i = 0; i < Math.round(seconds / dt); i++) {
  const a = performance.now();
  world.update(dt);
  wall += performance.now() - a;
  for (const e of world.events) {
    if (e.t === 'kill') inc(kills[e.victim.faction === 0 ? 1 : 0], `${e.killer ? e.killer.type : '?'}:${e.weapon ? e.weapon.id || e.weapon.name : '?'}>${e.victim.cat}`);
    else if (e.t === 'fire') inc(fire, `${e.unit.type}:${e.weapon.id || e.weapon.name}`, e.n || 1);
    else inc(counts, e.t);
  }
  world.events.length = 0;
  if (world.over) {
    console.log(`battle over at t=${world.time.toFixed(0)} winner ${world.winner}`);
    break;
  }
  if (i % 900 === 899) {
    const t = world.time;
    const lines = [`\n== t=${t.toFixed(0)}s  ${(wall / 900).toFixed(2)} ms/tick  tickets ${world.factions[0].tickets}/${world.factions[1].tickets}  objectives ${world.objectives.map((o) => `${o.letter}:${o.owner}(${o.control.toFixed(2)})`).join(' ')}`];
    wall = 0;
    for (const f of [0, 1]) {
      const fac = world.factions[f];
      const states = {};
      for (const sq of fac.squads) if (!sq.disbanded && sq.members.length) inc(states, `${sq.constructor.name === 'VehicleGroup' ? 'V' : ''}${sq.state}`);
      const st = world.strength(f);
      const air = {};
      for (const u of fac.units) if (u.alive && u.cat === 'air') inc(air, u.type);
      // Mean distance of ground units to the nearest objective not owned by f.
      const tgt = world.objectives.filter((o) => o.owner !== f);
      let dsum = 0;
      let dn = 0;
      let stuck = 0;
      for (const u of fac.units) {
        if (!u.alive || u.cat === 'air' || u.hidden) continue;
        if (tgt.length) {
          dsum += Math.min(...tgt.map((o) => Math.hypot(u.pos.x - o.x, u.pos.z - o.z)));
          dn++;
        }
        const p = last.get(u);
        const moving = u.cat === 'veh' ? u.path && u.path.length : u.path && u.pathIdx < u.path.length;
        if (p && moving && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 0.5) stuck++;
        last.set(u, { x: u.pos.x, z: u.pos.z });
      }
      lines.push(`  ${f ? 'FED' : 'COA'} inf ${st.inf} veh ${st.veh} air ${JSON.stringify(air)}  dist→obj ${dn ? (dsum / dn).toFixed(0) : '-'}  stuck ${stuck}  squads ${JSON.stringify(states)}`);
    }
    console.log(lines.join('\n'));
  }
}
const top = (o, n = 25) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}=${v}`).join('  ');
console.log('\nevents:', top(counts, 40));
console.log('\nrounds fired:', top(fire, 40));
console.log('\nCOA kills:', top(kills[0]));
console.log('\nFED kills:', top(kills[1]));
