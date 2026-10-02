/**
 * Performance budget: logs ms per chunk column for each dimension (streaming order after a warm-up,
 * like a player exploring, and isolated chunks with no shared caches). Measured as process CPU time
 * (robust when other test files run in parallel) and wall time. The assertions are generous
 * CI-safe ceilings; the target on one desktop core is <= 10-15 ms per overworld chunk
 * (`npx tsx tools/worldmap.ts` prints the plain-Node figure, ~3-6 ms).
 */
import { describe, expect, it } from 'vitest';
import { createGenerator } from '../src/world/gen/index';
import type { DimensionId } from '../src/world/gen/generator';

function measure(dim: DimensionId, seed: number, ox: number, oz: number, n: number, spacing: number): { cpu: number; wall: number } {
  const g = createGenerator(dim, seed);
  for (let i = 0; i < 12; i++) g.generate(ox - 40 + i, oz - 40); // JIT warm-up
  const c0 = process.cpuUsage();
  const t0 = performance.now();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.generate(ox + i * spacing, oz + j * spacing);
  const wall = (performance.now() - t0) / (n * n);
  const c = process.cpuUsage(c0);
  return { cpu: (c.user + c.system) / 1000 / (n * n), wall };
}

const fmt = (m: { cpu: number; wall: number }) => `${m.cpu.toFixed(2)} ms cpu / ${m.wall.toFixed(2)} ms wall`;

describe('worldgen performance', () => {
  it('overworld stays within budget', () => {
    const streaming = measure('overworld', 123, 0, 0, 10, 1);
    const isolated = measure('overworld', 123, 200, 200, 6, 5);
    console.log(`[worldgen] overworld per chunk: streaming ${fmt(streaming)}; isolated ${fmt(isolated)}`);
    expect(streaming.cpu).toBeLessThan(50);
    expect(isolated.cpu).toBeLessThan(80);
  });

  it('nether and end stay within budget', () => {
    const nether = measure('nether', 123, 0, 0, 8, 1);
    const end = measure('end', 123, -4, -4, 8, 1);
    const outer = measure('end', 123, 70, 70, 6, 1);
    console.log(`[worldgen] per chunk: nether ${fmt(nether)}; end main island ${fmt(end)}; end outer islands ${fmt(outer)}`);
    expect(nether.cpu).toBeLessThan(50);
    expect(end.cpu).toBeLessThan(50);
    expect(outer.cpu).toBeLessThan(50);
  });
});
