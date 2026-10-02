import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { lightChunkLocal } from '../src/world/light';
import { S } from '../src/world/blocks/registry';
import '../src/world/blocks/blocks';

function flatChunk(cx: number, cz: number, h = 10) {
  const c = new Chunk(cx, cz);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < h; y++) c.set(x, y, z, S('stone'));
  lightChunkLocal(c);
  c.status = 'ready';
  return c;
}

describe('light', () => {
  it('sky light above ground is 15, underground 0', () => {
    const w = new World('overworld', 1);
    w.addChunk(flatChunk(0, 0));
    expect(w.getSkyLight(3, 10, 3)).toBe(15);
    expect(w.getSkyLight(3, 50, 3)).toBe(15);
    expect(w.getSkyLight(3, 5, 3)).toBe(0);
  });
  it('torch emits coloured light that falls off', () => {
    const w = new World('overworld', 1);
    for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) w.addChunk(flatChunk(cx, cz));
    // dig a cave
    for (let x = 0; x < 10; x++) w.setBlock(x, 5, 5, 0);
    w.setBlock(0, 5, 5, S('torch', 1));
    const l0 = w.getLight(0, 5, 5);
    expect((l0 >> 8) & 15).toBe(15);
    const l5 = w.getLight(5, 5, 5);
    expect((l5 >> 8) & 15).toBe(10);
    // remove torch -> dark again
    w.setBlock(0, 5, 5, 0);
    expect(w.getBlockLight(5, 5, 5)).toBe(0);
  });
  it('placing a block casts a sky shadow column, removing restores', () => {
    const w = new World('overworld', 1);
    for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) w.addChunk(flatChunk(cx, cz));
    w.setBlock(4, 20, 4, S('stone'));
    expect(w.getSkyLight(4, 19, 4)).toBe(14);
    expect(w.getSkyLight(4, 10, 4)).toBe(14);
    w.setBlock(4, 20, 4, 0);
    expect(w.getSkyLight(4, 10, 4)).toBe(15);
  });
  it('light crosses chunk borders on integration', () => {
    const w = new World('overworld', 1);
    const a = flatChunk(0, 0, 10);
    // roof over chunk b: sky only enters from chunk a
    const b = new Chunk(1, 0);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { for (let y = 0; y < 10; y++) b.set(x, y, z, S('stone')); b.set(x, 14, z, S('stone')); }
    lightChunkLocal(b);
    w.addChunk(a);
    w.addChunk(b);
    expect(w.getSkyLight(16, 11, 5)).toBe(14);
    expect(w.getSkyLight(20, 11, 5)).toBe(10);
  });
});
