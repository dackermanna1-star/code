import { describe, it, expect } from 'vitest';
import '../src/world/blocks/blocks';
import { Chunk } from '../src/world/chunk';
import { serializeChunk, deserializeChunk } from '../src/game/saves';

describe('world saves', () => {
  it('round-trips a modified chunk (blocks, light, block entities)', () => {
    const c = new Chunk(3, -2);
    c.set(1, 70, 2, (5 << 4) | 1);
    c.set(15, 0, 15, 1 << 4);
    c.setLight(1, 71, 2, 0xf123);
    c.blockEntities.set((70 << 8) | (2 << 4) | 1, { type: 'chest', items: [{ i: 'stone', c: 3 }] });
    c.modified = true;
    const r = deserializeChunk(structuredClone(serializeChunk(c)));
    expect(r.cx).toBe(3);
    expect(r.cz).toBe(-2);
    expect(r.get(1, 70, 2)).toBe((5 << 4) | 1);
    expect(r.get(15, 0, 15)).toBe(1 << 4);
    expect(r.getLight(1, 71, 2)).toBe(0xf123);
    expect(r.blockEntities.get((70 << 8) | (2 << 4) | 1)).toEqual({ type: 'chest', items: [{ i: 'stone', c: 3 }] });
    expect(r.modified).toBe(false);
  });
});
