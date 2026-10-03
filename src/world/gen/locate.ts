/**
 * Structure location helpers usable outside the generation worker (e.g. eyes of ender on the main
 * thread). They build (and cache) a lightweight overworld generator for the seed; only seed-derived
 * queries are evaluated, no chunks are generated.
 *
 *   locateStronghold(seed, x, z) -> { x, y, z } | null
 *     Centre of the nearest stronghold's End portal room (portal centre block, at the frame's y).
 *     Same result as `createGenerator('overworld', seed).locateStructure('stronghold', x, z)`.
 *   locateStructureFor(seed, dimension, id, x, z)
 *     Generic version for any registered structure id ('village', 'stronghold', ...).
 */
import { createGenerator } from './index';
import type { DimensionId, WorldGenerator } from './generator';

const gens = new Map<string, WorldGenerator>();

function gen(seed: number, dim: DimensionId): WorldGenerator {
  const k = `${dim}:${seed | 0}`;
  let g = gens.get(k);
  if (!g) {
    if (gens.size > 4) gens.clear();
    gens.set(k, (g = createGenerator(dim, seed | 0)));
  }
  return g;
}

export function locateStructureFor(seed: number, dim: DimensionId, id: string, x: number, z: number): { x: number; y: number; z: number } | null {
  return gen(seed, dim).locateStructure(id, x, z);
}

export function locateStronghold(seed: number, x: number, z: number): { x: number; y: number; z: number } | null {
  return locateStructureFor(seed, 'overworld', 'stronghold', x, z);
}
