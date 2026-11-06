// Run the world generator in Node: timings, stats, determinism + sanity checks, PNG renders.
//   node dev/worldgen-run.mjs [seed] [--no-determinism] [--no-png] [--plans]
import { World } from '../src/world/World.js';
import { generateWorld, NOTES } from '../src/world/gen/index.js';
import { LOOT_TABLES, OUTFITS, ZOMBIE_TYPES } from '../src/world/gen/util.js';
import { BLOCKS, B, SOLID, IS_DOOR, getCollisionBoxes } from '../src/world/blocks.js';
import { savePNG, renderMap, renderFloor, renderSection, scaleImage } from './worldgen-png.mjs';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const seed = Number(args.find((a) => /^\d+$/.test(a)) ?? 1337);
const OUT = new URL('./out/', import.meta.url).pathname;

const t0 = performance.now();
const world = new World();
const ctx = await generateWorld(world, seed, async () => {}, { debug: true });
const ms = performance.now() - t0;
console.log(`generated seed ${seed} in ${ms.toFixed(0)} ms`);
console.log('phase timings (ms):', ctx.timings);

function hashWorld(w) {
  const h = createHash('sha1');
  h.update(w.blocks);
  const meta = [...w.meta.entries()].sort((a, b) => a[0] - b[0]);
  h.update(JSON.stringify(meta));
  h.update(JSON.stringify([...w.containers.values()]));
  h.update(JSON.stringify([...w.doors.values()]));
  h.update(JSON.stringify([w.vehicles, w.pois, w.spawnPoints, w.zombieSpawns, w.floorLoot, w.notes, w.corpses]));
  h.update(w.zone);
  return h.digest('hex');
}
const hash1 = hashWorld(world);
console.log('world hash', hash1);

// ------------------------------------------------------------------ stats
const s = ctx.stats;
const vehTypes = {};
for (const v of world.vehicles) vehTypes[v.type] = (vehTypes[v.type] || 0) + 1;
console.log("buildings:", JSON.stringify(s.buildings));
console.log(`containers ${world.containers.size}  doors ${world.doors.size}  vehicles ${world.vehicles.length}  POIs ${world.pois.length}`);
console.log(`notes ${world.notes.length} (unique ${new Set(world.notes.map((n) => n.noteId)).size}, NOTES defined ${Object.keys(NOTES).length})  corpses ${world.corpses.length}  floorLoot ${world.floorLoot.length}`);
console.log(`zombieSpawns ${world.zombieSpawns.length} (total ${world.zombieSpawns.reduce((a, z) => a + z.count, 0)} zombies)  spawnPoints ${world.spawnPoints.length}`);
console.log('vehicle types:', vehTypes);
const lootUse = {};
for (const c of world.containers.values()) lootUse[c.loot] = (lootUse[c.loot] || 0) + 1;
console.log('registered container loot tables:', lootUse);
const blockCount = new Map();
for (let i = 0; i < world.blocks.length; i++) { const id = world.blocks[i]; if (BLOCKS[id].container) blockCount.set(id, (blockCount.get(id) || 0) + 1); }
console.log('container blocks:', Object.fromEntries([...blockCount].map(([id, n]) => [BLOCKS[id].name, n])));

// ------------------------------------------------------------------ checks
let errors = 0;
const fail = (msg) => { errors++; if (errors < 60) console.log('  FAIL', msg); };
const passable = (id) => !SOLID[id] || IS_DOOR[id];
const solidAt = (x, y, z) => SOLID[world.get(x, y, z)] === 1;
const standable = (x, y, z) => {
  // feet at y (float). floor cell = floor(y - 0.01)
  const bx = Math.floor(x), bz = Math.floor(z), fy = Math.floor(y - 0.01);
  const fid = world.get(bx, fy, bz);
  if (!SOLID[fid] && !BLOCKS[fid].climbable) return 'no floor';
  if (solidAt(bx, Math.floor(y + 0.05), bz) && Math.floor(y + 0.05) !== fy) return 'feet blocked ' + BLOCKS[world.get(bx, Math.floor(y + 0.05), bz)].name;
  if (solidAt(bx, Math.floor(y) + 1, bz)) return 'head blocked';
  return null;
};
// spawn points
for (const p of world.spawnPoints) {
  const r = standable(p.x, p.y, p.z);
  if (r) fail(`spawn point ${p.x},${p.y},${p.z}: ${r}`);
}
// doors: air on both sides (front/back) at both cells
for (const d of world.doors.values()) {
  const id = world.get(d.x, d.y, d.z), top = world.get(d.x, d.y + 1, d.z);
  if (!IS_DOOR[id] || !IS_DOOR[top]) { fail(`door ${d.x},${d.y},${d.z} missing block`); continue; }
  const [fx, fz] = [[0, 1], [-1, 0], [0, -1], [1, 0]][d.facing];
  for (const sgn of [1, -1]) {
    const x = d.x + fx * sgn, z = d.z + fz * sgn;
    if (!passable(world.get(x, d.y, z)) || !passable(world.get(x, d.y + 1, z))) {
      fail(`door ${d.kind} ${d.x},${d.y},${d.z} f${d.facing} blocked on side ${sgn} by ${BLOCKS[world.get(x, d.y, z)].name}/${BLOCKS[world.get(x, d.y + 1, z)].name}`);
      break;
    }
  }
}
// stairs: 2 air (non solid) cells above each stair, and approach cells
let stairCount = 0;
for (let x = 0; x < world.SX; x++) for (let z = 0; z < world.SZ; z++) {
  const base = (x + z * world.SX) * world.SY;
  for (let y = 1; y < world.SY - 2; y++) {
    const id = world.blocks[base + y];
    if (id !== B.stairs_wood && id !== B.stairs_concrete) continue;
    stairCount++;
    if (solidAt(x, y + 1, z) || solidAt(x, y + 2, z)) fail(`stair ${x},${y},${z} lacks headroom (${BLOCKS[world.get(x, y + 1, z)].name}, ${BLOCKS[world.get(x, y + 2, z)].name})`);
  }
}
// containers not inside other solids / registered on container blocks
for (const c of world.containers.values()) {
  const id = world.get(c.x, c.y, c.z);
  if (!BLOCKS[id].container) fail(`container registry at ${c.x},${c.y},${c.z} on ${BLOCKS[id].name}`);
  if (!LOOT_TABLES.has(c.loot)) fail(`unknown loot table ${c.loot}`);
  if (c.fixed) for (const f of c.fixed) if (f.id === 'note' && !NOTES[f.data?.noteId]) fail(`fixed note ${f.data?.noteId} missing`);
}
// container blocks must be reachable: at least one non-solid horizontal neighbour or air above
let buried = 0;
for (let i = 0; i < world.blocks.length; i++) {
  const id = world.blocks[i];
  if (!BLOCKS[id].container || id === B.floorboard_loose || id === B.hollow_log) continue;
  const y = i % world.SY, col = (i - y) / world.SY, x = col % world.SX, z = (col - x) / world.SX;
  let open = false;
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
    const n = world.get(x + dx, y + dy, z + dz);
    if (!BLOCKS[n].opaque || BLOCKS[n].render !== 'cube') { open = true; break; }
  }
  if (!open) { buried++; if (buried < 10) fail(`buried container ${BLOCKS[id].name} at ${x},${y},${z}`); }
}
// vehicles
for (const v of world.vehicles) {
  const id = world.get(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z));
  if (SOLID[id]) fail(`vehicle ${v.type} at ${v.x.toFixed(1)},${v.y},${v.z.toFixed(1)} inside ${BLOCKS[id].name}`);
  if (v.loot && !LOOT_TABLES.has(v.loot)) fail(`vehicle loot ${v.loot}`);
  if (v.gloveLoot && !LOOT_TABLES.has(v.gloveLoot)) fail(`vehicle glove loot ${v.gloveLoot}`);
}
for (const f of world.floorLoot) {
  if (!LOOT_TABLES.has(f.loot)) fail(`floor loot table ${f.loot}`);
  const id = world.get(Math.floor(f.x), Math.floor(f.y + 0.01), Math.floor(f.z));
  if (SOLID[id] && BLOCKS[id].render === 'cube') fail(`floor loot inside ${BLOCKS[id].name} at ${f.x},${f.y},${f.z}`);
}
for (const c of world.corpses) {
  if (!LOOT_TABLES.has(c.loot)) fail(`corpse loot ${c.loot}`);
  if (!OUTFITS.includes(c.outfit)) fail(`corpse outfit ${c.outfit}`);
  const r = standable(c.x, c.y, c.z);
  if (r && r !== 'head blocked') fail(`corpse at ${c.x},${c.y},${c.z}: ${r}`);
}
for (const n of world.notes) {
  if (!NOTES[n.noteId]) fail(`note id ${n.noteId} not in NOTES`);
  const id = world.get(Math.floor(n.x), Math.floor(n.y + 0.01), Math.floor(n.z));
  if (SOLID[id] && BLOCKS[id].render === 'cube') fail(`note ${n.noteId} inside ${BLOCKS[id].name}`);
}
for (const zs of world.zombieSpawns) {
  if (zs.types) for (const t of zs.types) if (!ZOMBIE_TYPES.includes(t)) fail(`zombie type ${t}`);
  if (zs.outfit && !OUTFITS.includes(zs.outfit)) fail(`zombie outfit ${zs.outfit}`);
  const r = standable(zs.x, zs.y, zs.z);
  if (r) fail(`zombie spawn ${zs.x},${zs.y},${zs.z} (${zs.outfit}): ${r}`);
}
// zone coverage
const zoneCount = {};
for (let i = 0; i < world.zone.length; i++) zoneCount[world.zone[i]] = (zoneCount[world.zone[i]] || 0) + 1;
console.log('zones:', zoneCount);
console.log(`stairs ${stairCount}; buried containers ${buried}`);
console.log(errors ? `CHECKS: ${errors} failures` : 'CHECKS: all passed');

// ------------------------------------------------------------------ determinism
if (!args.includes('--no-determinism')) {
  const w2 = new World();
  const t1 = performance.now();
  await generateWorld(w2, seed, async () => {});
  const hash2 = hashWorld(w2);
  console.log(`determinism: second run ${(performance.now() - t1).toFixed(0)} ms -> ${hash2 === hash1 ? 'IDENTICAL' : 'DIFFERENT!'}`);
  if (hash2 !== hash1) process.exitCode = 1;
}

// ------------------------------------------------------------------ renders
if (!args.includes('--no-png')) {
  savePNG(OUT + 'worldgen-map.png', renderMap(world, { scale: 1 }));
  savePNG(OUT + 'worldgen-map-half.png', renderMap(world, { scale: 2 }));
  const sitesToPlan = ctx.planViews || [];
  for (const v of sitesToPlan) {
    savePNG(OUT + `worldgen-plan-${v.name}.png`, renderFloor(world, v.x0, v.z0, v.x1, v.z1, v.y, v.s || 6, ctx.planLabels));
  }
  // cross sections
  for (const sec of ctx.sectionViews || []) {
    savePNG(OUT + `worldgen-section-${sec.name}.png`, renderSection(world, sec.axis, sec.c, sec.a0, sec.a1, sec.y0, sec.y1, sec.s || 4));
  }
  console.log('wrote PNGs to', OUT);
}
void getCollisionBoxes; void scaleImage;
