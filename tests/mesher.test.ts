import { describe, it, expect } from 'vitest';
import { Mesher, P, pidx, cidx } from '../src/render/mesher';
import { S } from '../src/world/blocks/registry';

function input(fill: (set: (x: number, y: number, z: number, s: number) => void) => void, bevels = 1) {
  const blocks = new Uint16Array(P * P * P);
  const light = new Uint16Array(P * P * P).fill(15 << 12);
  fill((x, y, z, s) => { blocks[pidx(x, y, z)] = s; });
  const col = new Uint32Array(P * P).fill(0x7fb238);
  return { blocks, light, grass: col, foliage: col, water: col, ox: 0, oy: 0, oz: 0, bevels, decorations: 0 };
}

describe('mesher', () => {
  it('single stone cube without bevels = 6 quads', () => {
    const out = new Mesher().mesh(input((set) => set(5, 5, 5, S('stone')), 0));
    expect(out.opaque!.vertexCount).toBe(24);
    expect(out.cutout).toBeNull();
  });
  it('single stone cube with bevels = 6 faces + 12 chamfers + 8 corners', () => {
    const out = new Mesher().mesh(input((set) => set(5, 5, 5, S('stone'))));
    expect(out.opaque!.vertexCount).toBe((6 + 12 + 8) * 4);
  });
  it('flat ground has no bevels on the top surface interior', () => {
    const out = new Mesher().mesh(input((set) => { for (let x = -1; x <= 16; x++) for (let z = -1; z <= 16; z++) set(x, 3, z, S('stone')); }));
    // 256 top faces only (sides culled by padding neighbours, bottom faces exposed: 256 more)
    expect(out.opaque!.vertexCount).toBe(512 * 4);
  });
  it('water source produces a translucent top', () => {
    const out = new Mesher().mesh(input((set) => set(2, 2, 2, S('water'))));
    expect(out.translucent!.vertexCount).toBeGreaterThan(4);
  });
  it('box models mesh (stairs, fence, torch, door)', () => {
    const out = new Mesher().mesh(input((set) => {
      set(1, 1, 1, S('oak_stairs', 0)); set(3, 1, 1, S('oak_fence')); set(4, 1, 1, S('oak_fence'));
      set(6, 1, 1, S('torch', 1)); set(7, 1, 1, S('torch', 3)); set(9, 1, 1, S('oak_door', 0)); set(9, 2, 1, S('oak_door', 8));
    }));
    expect(out.opaque!.vertexCount).toBeGreaterThan(40);
    expect(out.cutout!.vertexCount).toBeGreaterThan(20);
  });
});
