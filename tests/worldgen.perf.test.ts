/**
 * Performance budget: logs ms per chunk column for each dimension (streaming order, after a
 * warm-up, like a player exploring) and for isolated chunks (no shared caches). The assertion is a
 * generous CI-safe ceiling; the target on a desktop core is <= 10-15 ms per overworld chunk.
 */
import { describe, expect, it } from 'vitest';
import { createGenerator } from '../src/world/gen/index';
import type { DimensionId } from '../src/world/gen/generator';

function measure(dim: DimensionId, seed: number, ox: number, oz: number, n: number, spacing: number): number {
  const g = createGenerator(dim, seed);
  // warm-up (JIT)
  for (let i = 0; i < 12; i++) g.generate(ox - 40 + i, oz - 40);
  const t = performance.now();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.generate(ox + i * spacing, oz + j * spacing);
  return (performance.now() - t) / (n * n);
}

describe('worldgen performance', () => {
  it('overworld stays within budget', () => {
    const streaming = measure('overworld', 123, 0, 0, 10, 1);
    const isolated = measure('overworld', 123, 200, 200, 6, 5);
    console.log(`[worldgen] overworld: ${streaming.toFixed(2)} ms/chunk streaming, ${isolated.toFixed(2)} ms/chunk isolated`);
    expect(streaming).toBeLessThan(60);
  });

  it('nether and end stay within budget', () => {
    const nether = measure('nether', 123, 0, 0, 8, 1);
    const end = measure('end', 123, -4, -4, 8, 1);
    const outer = measure('end', 123, 70, 70, 6, 1);
    console.log(`[worldgen] nether: ${nether.toFixed(2)} ms/chunk, end (main island): ${end.toFixed(2)} ms/chunk, end (outer islands): ${outer.toFixed(2)} ms/chunk`);
    expect(nether).toBeLessThan(60);
    expect(end).toBeLessThan(60);
  });
});
