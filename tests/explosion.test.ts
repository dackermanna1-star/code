import { describe, it, expect } from 'vitest';
import { S } from '../src/world/blocks/registry';
import '../src/world/blocks/blocks';
import { Rng } from '../src/core/rng';
import { AABB } from '../src/physics/aabb';
import { explosionBlocks, explosionDamage, explosionExposure, explosionImpact, blastResistance, EXPLOSION_RAYS, segmentBlocked } from '../src/game/explosions';

const rng = (seed: number) => {
  const r = new Rng(seed);
  return () => r.next();
};
const solidBelow = (state: number, top = 64) => (_x: number, y: number, _z: number) => (y < top ? state : 0);
const triples = (a: number[]) => {
  const out: [number, number, number][] = [];
  for (let i = 0; i < a.length; i += 3) out.push([a[i], a[i + 1], a[i + 2]]);
  return out;
};

describe('explosion ray grid', () => {
  it('has the 1352 surface rays of a 16^3 grid', () => {
    expect(EXPLOSION_RAYS.length / 3).toBe(16 ** 3 - 14 ** 3);
  });
  it('uses Minecraft blast resistances', () => {
    expect(blastResistance(0)).toBe(-1);
    expect(blastResistance(S('stone'))).toBe(6);
    expect(blastResistance(S('dirt'))).toBe(0.5);
    expect(blastResistance(S('obsidian'))).toBe(1200);
    expect(blastResistance(S('water'))).toBe(100);
    expect(blastResistance(S('bedrock'))).toBeGreaterThanOrEqual(3600000);
  });
});

describe('explosion block destruction', () => {
  it('destroys nothing in open air', () => {
    expect(explosionBlocks(() => 0, 0.5, 100.5, 0.5, 4, rng(1))).toEqual([]);
  });
  it('is deterministic for a seeded RNG', () => {
    const a = explosionBlocks(solidBelow(S('dirt')), 0.5, 64.06, 0.5, 4, rng(42));
    const b = explosionBlocks(solidBelow(S('dirt')), 0.5, 64.06, 0.5, 4, rng(42));
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });
  it('creates a crater whose size depends on blast resistance', () => {
    const dirt = triples(explosionBlocks(solidBelow(S('dirt')), 0.5, 64.06, 0.5, 4, rng(7)));
    const stone = triples(explosionBlocks(solidBelow(S('stone')), 0.5, 64.06, 0.5, 4, rng(7)));
    const sand = triples(explosionBlocks(solidBelow(S('sand')), 0.5, 64.06, 0.5, 4, rng(7)));
    expect(dirt.length).toBeGreaterThan(stone.length * 2);
    expect(sand.length).toBeGreaterThan(30);
    // TNT on dirt: Minecraft crater ~ 3-4 blocks radius
    const maxD = Math.max(...dirt.map(([x, y, z]) => Math.hypot(x + 0.5 - 0.5, y + 0.5 - 64.06, z + 0.5 - 0.5)));
    expect(maxD).toBeGreaterThan(2.5);
    expect(maxD).toBeLessThan(5.5);
    // only blocks below the surface (air has nothing to destroy)
    for (const [, y] of dirt) expect(y).toBeLessThan(64);
  });
  it('never destroys obsidian or bedrock and is shielded by them', () => {
    const get = (x: number, y: number, z: number) => {
      if (Math.max(Math.abs(x), Math.abs(y - 64), Math.abs(z)) === 1) return S('obsidian');
      return y < 70 ? S('dirt') : 0;
    };
    const res = triples(explosionBlocks(get, 0.5, 64.5, 0.5, 4, rng(3)));
    for (const [x, y, z] of res) {
      expect(get(x, y, z)).not.toBe(S('obsidian'));
      expect(Math.max(Math.abs(x), Math.abs(y - 64), Math.abs(z))).toBeLessThanOrEqual(1);
    }
  });
  it('does nothing when the centre is under water', () => {
    const get = (_x: number, y: number) => (y < 60 ? S('dirt') : y < 70 ? S('water') : 0);
    expect(explosionBlocks(get, 0.5, 60.5, 0.5, 4, rng(5))).toEqual([]);
  });
});

describe('explosion damage', () => {
  it('follows (x²+x)/2·7·2p+1 with linear distance falloff', () => {
    expect(explosionDamage(1, 4)).toBe(57);
    expect(explosionDamage(explosionImpact(4, 4, 1), 4)).toBe(22);
    expect(explosionImpact(8.01, 4, 1)).toBe(0);
    let prev = Infinity;
    for (let d = 0; d <= 8; d += 0.5) {
      const dmg = explosionDamage(explosionImpact(d, 4, 1), 4);
      expect(dmg).toBeLessThanOrEqual(prev);
      prev = dmg;
    }
    expect(explosionDamage(explosionImpact(4, 4, 0.5), 4)).toBeLessThan(explosionDamage(explosionImpact(4, 4, 1), 4));
  });
  it('computes exposure through walls', () => {
    const box = AABB.fromCenter(4.5, 64, 0.5, 0.6, 1.8);
    expect(explosionExposure(() => 0, 0.5, 64.5, 0.5, box)).toBe(1);
    const wall = (x: number) => (x === 2 ? S('stone') : 0);
    expect(explosionExposure((x) => wall(x), 0.5, 64.5, 0.5, box)).toBe(0);
    const halfWall = (x: number, _y: number, z: number) => (x === 2 && z === 0 ? S('stone') : 0);
    const e = explosionExposure(halfWall, 0.5, 64.5, 1.0, AABB.fromCenter(4.5, 64, 1.0, 0.6, 1.8));
    expect(e).toBeGreaterThan(0);
    expect(e).toBeLessThan(1);
    expect(segmentBlocked(wall, 0.5, 64.5, 0.5, 4.5, 64.5, 0.5)).toBe(true);
  });
});
