/**
 * Benchmarks (Node, single thread). Measures the hot paths that bound the
 * game's performance: chunk generation, chunk meshing (lighting + greedy
 * faces), RLE size, simulation tick cost with a built base and creatures,
 * and save cost. Numbers are machine-dependent; see docs/VERIFICATION.md.
 */
import { WorldGenerator } from '../src/shared/world/worldgen';
import { rleEncode, chunkKey } from '../src/shared/world/chunk';
import { meshChunk } from '../src/client/render/mesher';
import { Game } from '../src/sim/game';
import { MemoryStorage } from '../src/sim/storage';
import { RecordingLink } from '../src/sim/link';
import { DEFAULT_CONFIG, mergeConfig } from '../src/shared/config';

const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const fmt = (n: number) => n.toFixed(2);

// 1. world generation
const gen = new WorldGenerator(12345);
const N = 10;
const chunks = new Map<number, Uint8Array>();
const genMs: number[] = [];
let rle = 0;
for (let cz = -N / 2; cz < N / 2; cz++) for (let cx = -N / 2; cx < N / 2; cx++) {
  const t = performance.now();
  const d = gen.generateChunk(cx, cz);
  genMs.push(performance.now() - t);
  chunks.set(chunkKey(cx, cz), d);
  rle += rleEncode(d).length;
}
console.log(`worldgen: ${N * N} chunks, mean ${fmt(genMs.reduce((a, b) => a + b) / genMs.length)} ms, p95 ${fmt(pct(genMs, 0.95))} ms, RLE avg ${(rle / genMs.length / 1024).toFixed(1)} KB/chunk`);

// 2. meshing (inner chunks with all neighbours)
const meshMs: number[] = [], lightMs: number[] = [];
let tris = 0, verts = 0, count = 0;
for (let cz = -N / 2 + 1; cz < N / 2 - 1; cz++) for (let cx = -N / 2 + 1; cx < N / 2 - 1; cx++) {
  const nb: Array<Uint8Array | null> = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) nb.push(chunks.get(chunkKey(cx + dx, cz + dz)) ?? null);
  const t = performance.now();
  const r = meshChunk(cx, cz, nb);
  meshMs.push(performance.now() - t);
  lightMs.push(r.ms[0]);
  tris += (r.opaque.idx.length + r.trans.idx.length) / 3;
  verts += r.opaque.pos.length / 4 + r.trans.pos.length / 4;
  count++;
}
console.log(`meshing: ${count} chunks, mean ${fmt(meshMs.reduce((a, b) => a + b) / count)} ms (light ${fmt(lightMs.reduce((a, b) => a + b) / count)} ms), p95 ${fmt(pct(meshMs, 0.95))} ms, avg ${Math.round(tris / count)} triangles & ${Math.round(verts / count)} vertices (${((verts / count) * 16 / 1024).toFixed(0)} KB) per chunk`);

// 3. simulation tick
const game = new Game(mergeConfig(DEFAULT_CONFIG, { seed: 'bench', cheats: true, animalDensity: 3 }), new MemoryStorage());
const p = game.join(new RecordingLink(), 'Bench');
let k = 0;
while (!p.ready && k++ < 2000) game.tick();
p.god = true;
// stream the full view distance, then spawn creatures and a base
for (let t = 0; t < 400; t++) game.tick();
for (let s = 0; s < 12; s++) game.wildlife.spawn(['stag', 'boar', 'wolf', 'bear'][s % 4], p.x + 10 + s, p.y + 5, p.z + 10);
for (let s = 0; s < 4; s++) game.wildlife.spawnNpc(p.x - 15 - s * 2, p.y + 5, p.z - 15);
const bi = Math.floor(p.x / 4) + 3, bj = Math.floor(p.z / 4) + 3, gy = 70;
for (let x = 4 * bi - 4; x < 4 * bi + 28; x++) for (let z = 4 * bj - 4; z < 4 * bj + 28; z++) {
  for (let y = gy - 2; y <= gy; y++) game.world.set(x, y, z, 2);
  for (let y = gy + 1; y < gy + 20; y++) game.world.set(x, y, z, 0);
}
let pieces = 0;
for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) {
  for (const s of [{ type: 'foundation', i: bi + a, j: bj + b, oy: gy + 1 }, { type: 'wall', i: bi + a, j: bj + b, oy: gy + 1, side: 'w' }, { type: 'wall', i: bi + a, j: bj + b, oy: gy + 1, side: 'n' }, { type: 'floor', i: bi + a, j: bj + b, oy: gy + 5 }] as const) {
    if (typeof game.building.buildAt(null, { ...s }, 2) !== 'string') pieces++;
  }
}
const tickMs: number[] = [];
for (let t = 0; t < 600; t++) {
  const t0 = performance.now();
  game.tick();
  tickMs.push(performance.now() - t0);
}
console.log(`simulation: ${pieces} building pieces, ${game.wildlife.animals.size} creatures, ${game.world.chunks.size} chunks loaded -> tick mean ${fmt(tickMs.reduce((a, b) => a + b) / tickMs.length)} ms, p99 ${fmt(pct(tickMs, 0.99))} ms, max ${fmt(Math.max(...tickMs))} ms (budget 50 ms)`);
const t0 = performance.now();
game.building.runUpkeep(60);
console.log(`upkeep pass: ${fmt(performance.now() - t0)} ms`);
const t1 = performance.now();
await game.save('bench');
console.log(`save: ${fmt(performance.now() - t1)} ms (${game.world.chunks.size} chunks loaded, ${pieces} pieces)`);
const t2 = performance.now();
const reload = new Game(game.config, game.storage);
console.log(`load: ${fmt(performance.now() - t2)} ms, pieces restored ${reload.building.pieces.size}/${game.building.pieces.size}`);
