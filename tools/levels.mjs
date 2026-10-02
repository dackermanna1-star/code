// Checks levels in Node: the arrival point stands on floor with headroom, there are doors within
// reach, and generation / chunk building stay inside the budget.
//   node tools/levels.mjs            all levels
//   node tools/levels.mjs 7 12 40    only these
import { textureIndex } from '../src/gfx/textures.js';
import { resolveMaterials } from '../src/world/materials.js';
import { setPropTextures } from '../src/world/props.js';
import { World } from '../src/world/world.js';
import '../src/world/gen/index.js';
import { LEVELS, levelNumbers, findDoors, storyOf } from '../src/world/levels.js';
import { ZT } from '../src/world/zonetypes.js';
import { buildChunkData } from '../src/world/chunk.js';
import { CHUNK, LEVEL_H, PLAYER_R } from '../src/config.js';

const index = textureIndex();   // layer numbers only; pixels are not needed here
resolveMaterials(index); setPropTextures(index);
const want = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const list = want.length ? want : levelNumbers();
let bad = 0;
for (const n of list) {
  const L = LEVELS[n];
  if (!L) { console.log(`level ${n}: not registered`); bad++; continue; }
  const problems = [];
  const w = new World(0x5eed0001, index, null);
  const E = L.entry, st = storyOf(E.y || 0);
  const t0 = performance.now();
  let zone;
  try { zone = w.zoneAt(L.dim, st, E.x, E.z); } catch (e) { problems.push('zoneAt failed: ' + e.message); }
  if (zone && n !== 0 && !ZT[zone.type]) problems.push('unknown zone type ' + zone.type);
  // generate the zones around the entry, timing each
  const times = [];
  const genT0 = performance.now();
  let doors = [];
  try {
    for (let z = E.z - 96; z <= E.z + 96; z += 8) for (let x = E.x - 96; x <= E.x + 96; x += 8) {
      const zn = w.zoneAt(L.dim, st, x, z);
      if (w.builders.has(zn.key)) continue;
      const a = performance.now(); w.builder(zn); times.push(performance.now() - a);
    }
    doors = findDoors(w, L.dim, st, E.x, E.z, 128).filter((d) => !d.arrival);
  } catch (e) { problems.push('generation failed: ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | ')); }
  const genMs = performance.now() - genT0;
  // the entry chunk: collision under the arrival point and room above it
  let tris = 0, chunkMs = 0;
  try {
    const cx = Math.floor(E.x / CHUNK), cz = Math.floor(E.z / CHUNK);
    const a = performance.now();
    const d = buildChunkData(w, L.dim, st, cx, cz);
    chunkMs = performance.now() - a;
    tris = d.tris;
    const b = d.boxes;
    let floorTop = -Infinity, blocked = false;
    for (let k = 0; k < b.length; k += 7) {
      const inside = E.x > b[k] - PLAYER_R && E.x < b[k + 3] + PLAYER_R && E.z > b[k + 2] - PLAYER_R && E.z < b[k + 5] + PLAYER_R;
      if (!inside) continue;
      const top = b[k + 4];
      if (top <= (E.y || 0) + 0.45 && top > floorTop && b[k + 1] < (E.y || 0) + 0.45) floorTop = Math.max(floorTop, top);
      if (b[k + 1] < (E.y || 0) + 1.7 && top > (E.y || 0) + 0.45) blocked = true;
    }
    if (!Number.isFinite(floorTop)) problems.push('no floor under the arrival point');
    else if (Math.abs(floorTop - (E.y || 0)) > 0.45) problems.push(`arrival y ${E.y} but floor at ${floorTop.toFixed(2)}`);
    if (blocked) problems.push('something solid at the arrival point');
    const arrival = d.doors.find((dr) => dr.arrival);
    if (n !== 0 && !L.noArrivalDoor && !arrival) problems.push('no arrival door in the entry chunk');
  } catch (e) { problems.push('chunk build failed: ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | ')); }
  const near = doors.map((d) => Math.hypot(d.x - E.x, d.z - E.z) + Math.abs(d.y - (E.y || 0)) * 4).sort((a, b) => a - b)[0];
  if (!doors.length) problems.push('no level doors within 128 m of the arrival point');
  const maxGen = times.length ? Math.max(...times) : 0, avgGen = times.length ? times.reduce((s, v) => s + v, 0) / times.length : 0;
  if (avgGen > 25) problems.push(`zone generation averages ${avgGen.toFixed(1)} ms (budget 25)`);
  if (chunkMs > 60) problems.push(`entry chunk took ${chunkMs.toFixed(0)} ms to build`);
  if (tris > 12000) problems.push(`entry chunk has ${tris} triangles (keep under ~8000)`);
  void genMs; void t0; void LEVEL_H;
  console.log(`level ${String(n).padStart(2)} ${L.name.padEnd(26)} zones ${String(times.length).padStart(3)} gen avg ${avgGen.toFixed(1)}ms max ${maxGen.toFixed(0)}ms | chunk ${chunkMs.toFixed(0)}ms ${tris} tris | doors ${doors.length} nearest ${near ? near.toFixed(0) + 'm' : '-'}${problems.length ? '\n    PROBLEM: ' + problems.join('\n    PROBLEM: ') : ''}`);
  if (problems.length) bad++;
}
console.log(`${list.length} levels checked, ${bad} with problems`);
process.exit(bad ? 1 : 0);
