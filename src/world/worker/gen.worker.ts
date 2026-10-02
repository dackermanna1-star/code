/// <reference lib="webworker" />
/**
 * Generation worker: owns one generator per (dimension, seed) and answers chunk requests.
 * Messages in:  { type: 'gen', id, dimension, seed, cx, cz }
 *               { type: 'locate', id, dimension, seed, structure, x, z }
 *               { type: 'spawn', id, dimension, seed }
 * Messages out: { type: 'gen', id, chunk } (with transferables)
 *               { type: 'locate', id, result } / { type: 'spawn', id, result }
 */
import { createGenerator } from '../gen/index';
import type { DimensionId, WorldGenerator } from '../gen/generator';
import { Chunk } from '../chunk';
import { lightChunkLocal } from '../light';

const gens = new Map<string, WorldGenerator>();
function gen(dimension: DimensionId, seed: number): WorldGenerator {
  const k = `${dimension}:${seed}`;
  let g = gens.get(k);
  if (!g) gens.set(k, (g = createGenerator(dimension, seed)));
  return g;
}

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  try {
    if (m.type === 'gen') {
      const chunk = gen(m.dimension, m.seed).generate(m.cx, m.cz);
      // light the chunk locally (borders are fixed up on the main thread)
      const c = new Chunk(m.cx, m.cz);
      for (let i = 0; i < c.blocks.length; i++) c.blocks[i] = chunk.blocks[i] ?? null;
      lightChunkLocal(c);
      chunk.light = c.light.slice();
      chunk.lightFill = c.lightFill;
      const transfer: Transferable[] = [chunk.biomes.buffer, chunk.heightmap.buffer, chunk.grassColor.buffer, chunk.foliageColor.buffer, chunk.waterColor.buffer, chunk.lightFill.buffer];
      for (const s of chunk.blocks) if (s) transfer.push(s.buffer);
      for (const l of chunk.light) if (l) transfer.push(l.buffer);
      (self as any).postMessage({ type: 'gen', id: m.id, chunk }, transfer);
    } else if (m.type === 'locate') {
      const result = gen(m.dimension, m.seed).locateStructure(m.structure, m.x, m.z);
      (self as any).postMessage({ type: 'locate', id: m.id, result });
    } else if (m.type === 'spawn') {
      const result = gen(m.dimension, m.seed).findSpawn();
      (self as any).postMessage({ type: 'spawn', id: m.id, result });
    } else if (m.type === 'biome') {
      const g = gen(m.dimension, m.seed);
      (self as any).postMessage({ type: 'biome', id: m.id, result: g.biomeAt(m.x, m.z) });
    }
  } catch (err) {
    (self as any).postMessage({ type: 'error', id: m.id, error: String((err as Error)?.stack ?? err) });
  }
};
