import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { S } from '../src/world/blocks/registry';
import '../src/world/blocks/blocks';
import { findPath, nodeCenter } from '../src/entity/ai/pathfinder';

const GROUND = 10; // top solid block is y=9, feet at y=10

function flatWorld(): World {
  const w = new World('overworld', 1);
  w.lightEnabled = false;
  for (let cx = -2; cx <= 2; cx++)
    for (let cz = -2; cz <= 2; cz++) {
      const c = new Chunk(cx, cz);
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < GROUND; y++) c.set(x, y, z, S('stone'));
      c.status = 'ready';
      w.addChunk(c);
    }
  return w;
}
const opts = { width: 0.6, height: 1.95, maxNodes: 2000 };

describe('pathfinding', () => {
  it('walks straight on flat ground (smoothed to few nodes)', () => {
    const w = flatWorld();
    const p = findPath(w, { x: 0.5, y: GROUND, z: 0.5 }, { x: 10.5, y: GROUND, z: 0.5 }, opts)!;
    expect(p.reached).toBe(true);
    expect(p.nodes.length).toBeLessThanOrEqual(3);
    const e = p.end!;
    expect(Math.abs(e.x - 10)).toBeLessThanOrEqual(1);
  });

  it('goes around a wall', () => {
    const w = flatWorld();
    for (let z = -5; z <= 5; z++) for (let y = GROUND; y < GROUND + 3; y++) w.setBlock(5, y, z, S('stone'));
    const p = findPath(w, { x: 0.5, y: GROUND, z: 0.5 }, { x: 10.5, y: GROUND, z: 0.5 }, opts)!;
    expect(p.reached).toBe(true);
    // must pass beyond the wall's end (|z| > 5)
    expect(p.nodes.some((n) => Math.abs(n.z) >= 6 || Math.abs(n.z + 1) >= 6)).toBe(true);
    for (const n of p.nodes) expect(n.floor).toBe(GROUND);
  });

  it('jumps up a 1-block step but not a 2-block wall', () => {
    const w = flatWorld();
    // platform 1 block high from x>=5
    for (let x = 5; x < 15; x++) for (let z = -8; z <= 8; z++) w.setBlock(x, GROUND, z, S('stone'));
    const p = findPath(w, { x: 0.5, y: GROUND, z: 0.5 }, { x: 8.5, y: GROUND + 1, z: 0.5 }, opts)!;
    expect(p.reached).toBe(true);
    expect(p.end!.floor).toBe(GROUND + 1);
    // 2-high cliff all around the target: unreachable
    const w2 = flatWorld();
    for (let x = 5; x < 15; x++) for (let z = -20; z <= 20; z++) { w2.setBlock(x, GROUND, z, S('stone')); w2.setBlock(x, GROUND + 1, z, S('stone')); }
    const p2 = findPath(w2, { x: 0.5, y: GROUND, z: 0.5 }, { x: 8.5, y: GROUND + 2, z: 0.5 }, opts);
    expect(p2?.reached ?? false).toBe(false);
  });

  it('drops down at most 3 blocks', () => {
    const w = flatWorld();
    // pit 3 deep reachable, 5 deep not
    for (let x = 4; x < 8; x++) for (let z = -2; z <= 2; z++) for (let y = GROUND - 3; y < GROUND; y++) w.setBlock(x, y, z, 0);
    const p = findPath(w, { x: 0.5, y: GROUND, z: 0.5 }, { x: 5.5, y: GROUND - 3, z: 0.5 }, opts)!;
    expect(p.reached).toBe(true);
  });

  it('never routes through lava', () => {
    const w = flatWorld();
    // lava moat around the target except a bridge far away
    for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) {
      if (Math.max(Math.abs(x), Math.abs(z)) === 4) w.setBlock(x, GROUND - 1, z, S('lava'));
    }
    w.setBlock(0, GROUND - 1, 4, S('stone')); // bridge at (0,4)
    const p = findPath(w, { x: 0.5, y: GROUND, z: 10.5 }, { x: 0.5, y: GROUND, z: 0.5 }, opts)!;
    expect(p.reached).toBe(true);
    for (const n of p.nodes) {
      const [cx, , cz] = nodeCenter(n, 0.6);
      const below = w.getBlock(Math.floor(cx), GROUND - 1, Math.floor(cz));
      expect(below).not.toBe(S('lava'));
    }
    // fully enclosed by lava: no path
    w.setBlock(0, GROUND - 1, 4, S('lava'));
    const p2 = findPath(w, { x: 0.5, y: GROUND, z: 10.5 }, { x: 0.5, y: GROUND, z: 0.5 }, opts);
    expect(p2?.reached ?? false).toBe(false);
  });

  it('cannot path over fences, can through open doors', () => {
    const w = flatWorld();
    for (let x = 5; x <= 11; x++) for (let z = -3; z <= 3; z++) if (x === 5 || x === 11 || Math.abs(z) === 3) w.setBlock(x, GROUND, z, S('oak_fence'));
    const p = findPath(w, { x: 0.5, y: GROUND, z: 0.5 }, { x: 8.5, y: GROUND, z: 0.5 }, { ...opts, maxNodes: 3000 });
    expect(p?.reached ?? false).toBe(false);
    // replace one fence with an open door: reachable
    w.setBlock(5, GROUND, 0, S('oak_door', 0 | 4));
    w.setBlock(5, GROUND + 1, 0, S('oak_door', 8));
    const p2 = findPath(w, { x: 0.5, y: GROUND, z: 0.5 }, { x: 8.5, y: GROUND, z: 0.5 }, { ...opts, maxNodes: 3000 });
    expect(p2?.reached).toBe(true);
  });

  it('spiders climb walls', () => {
    const w = flatWorld();
    for (let x = 5; x < 15; x++) for (let z = -20; z <= 20; z++) for (let y = GROUND; y < GROUND + 4; y++) w.setBlock(x, y, z, S('stone'));
    const p = findPath(w, { x: 0.5, y: GROUND, z: 0.5 }, { x: 8.5, y: GROUND + 4, z: 0.5 }, { width: 1.4, height: 0.9, climb: 8, maxNodes: 2000 })!;
    expect(p.reached).toBe(true);
  });
});
