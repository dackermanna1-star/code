import { describe, it, expect } from 'vitest';
import { ParticlePool } from '../src/render/particles/pool';
import { EmitterScanner, scanSection, EmitterKind, torchFlamePos } from '../src/render/particles/emitters';
import { hmIndex, rainHeight, precipitationAt, RainHeightmap, Precip, HM_WATER } from '../src/render/particles/precip';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { lightChunkLocal } from '../src/world/light';
import { S } from '../src/world/blocks/registry';
import { biomeId } from '../src/world/biomes';
import { ParticleSystem } from '../src/render/particles/system';
import { PT } from '../src/render/particles/defs';
import '../src/world/blocks/blocks';

function flatChunk(cx: number, cz: number, h = 64) {
  const c = new Chunk(cx, cz);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
    for (let y = 0; y < h; y++) c.set(x, y, z, S('stone'));
    c.heightmap[z * 16 + x] = h;
    c.biomes[z * 16 + x] = biomeId('plains');
  }
  lightChunkLocal(c);
  c.status = 'ready';
  return c;
}
function flatWorld(h = 64) {
  const w = new World('overworld', 1);
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) w.addChunk(flatChunk(cx, cz, h));
  return w;
}

describe('particle pool', () => {
  it('allocates densely and rejects when full', () => {
    const p = new ParticlePool(4);
    for (let i = 0; i < 4; i++) expect(p.alloc(0, i, 0, 0, 1)).toBe(i);
    expect(p.alloc(0, 9, 0, 0, 1)).toBe(-1);
    expect(p.dropped).toBe(1);
    expect(p.count).toBe(4);
  });
  it('swap-removes and keeps data consistent', () => {
    const p = new ParticlePool(8);
    for (let i = 0; i < 5; i++) p.alloc(i, i * 10, 0, 0, 1);
    p.kill(1);
    expect(p.count).toBe(4);
    expect(p.px[1]).toBe(40);
    expect(p.type[1]).toBe(4);
    // freed slot is reused
    expect(p.alloc(7, 1, 2, 3, 1)).toBe(4);
  });
  it('expires particles by lifetime', () => {
    const p = new ParticlePool(16);
    const lives = [0.1, 0.5, 0.2, 1.0, 0.05];
    lives.forEach((l, i) => p.alloc(i, 0, 0, 0, l));
    const expired: number[] = [];
    p.step(0.15, (i) => expired.push(p.type[i]));
    expect(expired.sort()).toEqual([0, 4]);
    expect(p.count).toBe(3);
    p.step(0.1);
    expect(p.count).toBe(2);
    p.step(1);
    expect(p.count).toBe(0);
  });
  it('simulated particles die and fall under gravity (no GPU)', () => {
    const sys = new ParticleSystem('low');
    const w = flatWorld();
    sys.world = w;
    const cam = { position: { x: 0, y: 70, z: 0 } } as any;
    const i = sys.spawn(PT.block_crumb, 0.5, 66, 0.5, 0, 0, 0);
    expect(i).toBeGreaterThanOrEqual(0);
    const crumbs = sys.pools[0];
    crumbs.life[i] = 10;
    for (let k = 0; k < 120; k++) sys.update(1 / 60, cam);
    // landed on the stone floor (top at y = 64) and came to rest
    expect(crumbs.count).toBe(1);
    expect(crumbs.py[0]).toBeGreaterThanOrEqual(64);
    expect(crumbs.py[0]).toBeLessThan(64.1);
    const j = sys.spawn(PT.smoke, 0, 70, 0);
    expect(j).toBeGreaterThanOrEqual(0);
    for (let k = 0; k < 400; k++) sys.update(1 / 60, cam);
    expect(sys.pools[1].count).toBe(0);
  });
});

describe('emitter scanning', () => {
  it('finds torches, fire, campfires and exposed lava only', () => {
    const w = flatWorld();
    w.setBlock(3, 64, 3, S('torch', 1));
    w.setBlock(5, 64, 5, S('campfire'));
    w.setBlock(6, 63, 6, S('lava'));
    w.setBlock(7, 63, 7, S('lava'));
    w.setBlock(7, 64, 7, S('stone'));
    const sc = new EmitterScanner();
    let guard = 0;
    while (sc.update(w, 0, 64, 0, 8) > 0 && guard++ < 100);
    const found: number[][] = [];
    sc.forEach((x, y, z, k) => found.push([x, y, z, k]));
    expect(found).toContainEqual([3, 64, 3, EmitterKind.Torch]);
    expect(found).toContainEqual([5, 64, 5, EmitterKind.Campfire]);
    expect(found).toContainEqual([6, 63, 6, EmitterKind.Lava]);
    expect(found.find((f) => f[0] === 7 && f[2] === 7)).toBeUndefined();
    // invalidation picks up removals
    w.setBlock(3, 64, 3, 0);
    sc.invalidate(3, 64, 3);
    while (sc.update(w, 0, 64, 0, 8) > 0 && guard++ < 200);
    const after: number[][] = [];
    sc.forEach((x, y, z, k) => after.push([x, y, z, k]));
    expect(after.find((f) => f[0] === 3 && f[2] === 3)).toBeUndefined();
  });
  it('scanSection reports world coordinates', () => {
    const sec = new Uint16Array(4096);
    sec[(2 << 8) | (5 << 4) | 7] = S('torch', 3);
    const out: number[] = [];
    scanSection({ getBlock: () => 0, getChunk: () => undefined }, sec, 32, 64, -16, out);
    expect(out).toEqual([39, 66, -11, EmitterKind.Torch, 3]);
  });
  it('wall torch flames sit toward the wall', () => {
    const p = torchFlamePos(0, 0, 0, 2, [0, 0, 0]); // pointing north -> wall to the south
    expect(p[2]).toBeGreaterThan(0.5);
    expect(torchFlamePos(0, 0, 0, 1, [0, 0, 0])).toEqual([0.5, 0.68, 0.5]);
  });
});

describe('rain heightmap', () => {
  it('toroidal indexing wraps negative coordinates', () => {
    expect(hmIndex(0, 0, 128)).toBe(0);
    expect(hmIndex(-1, 0, 128)).toBe(127);
    expect(hmIndex(130, -129, 128)).toBe(127 * 128 + 2);
    expect(hmIndex(5, 7, 128)).toBe(hmIndex(5 + 128 * 3, 7 - 128 * 2, 128));
  });
  it('roofs, glass and leaves block rain; plants do not', () => {
    const w = flatWorld();
    expect(rainHeight(w, 2, 2)).toBe(64);
    w.setBlock(2, 70, 2, S('glass'));
    expect(rainHeight(w, 2, 2)).toBe(71);
    w.setBlock(3, 75, 3, S('oak_leaves'));
    expect(rainHeight(w, 3, 3)).toBe(76);
    w.setBlock(4, 64, 4, S('short_grass'));
    expect(rainHeight(w, 4, 4)).toBe(64);
    w.setBlock(5, 66, 5, S('oak_slab'));
    expect(rainHeight(w, 5, 5)).toBe(67);
  });
  it('heightmap window, exposure and water flag', () => {
    const w = flatWorld();
    w.setBlock(1, 63, 1, S('water'));
    w.setBlock(2, 68, 2, S('stone'));
    const hm = new RainHeightmap();
    hm.update(w, 0, 0, hm.size);
    expect(hm.height(2, 2)).toBe(69);
    expect(hm.exposed(2.5, 67, 2.5)).toBe(false);
    expect(hm.exposed(2.5, 70, 2.5)).toBe(true);
    expect(hm.flags(1, 1) & HM_WATER).toBeTruthy();
    expect(hm.flags(0, 0) & 3).toBe(Precip.Rain);
  });
  it('precipitation type by biome and altitude', () => {
    expect(precipitationAt(biomeId('plains'), 70)).toBe(Precip.Rain);
    expect(precipitationAt(biomeId('desert'), 70)).toBe(Precip.None);
    expect(precipitationAt(biomeId('snowy_plains'), 70)).toBe(Precip.Snow);
    // windswept hills (0.2) turn to snow high up
    expect(precipitationAt(biomeId('windswept_hills'), 90)).toBe(Precip.Rain);
    expect(precipitationAt(biomeId('windswept_hills'), 160)).toBe(Precip.Snow);
  });
});
