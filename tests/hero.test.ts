import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../src/world/blocks/blocks';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { S, BLOCKS } from '../src/world/blocks/registry';
import { Carver, type EditSink } from '../src/game/saitama/carve';

/** Solid stone to y=79 (top 80) over 6×6 chunks, bedrock at y=0. */
function slab() {
  const w = new World('overworld', 1);
  w.lightEnabled = false;
  for (let cx = -3; cx <= 2; cx++)
    for (let cz = -3; cz <= 2; cz++) {
      const c = new Chunk(cx, cz);
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
        c.set(x, 0, z, S('bedrock'));
        for (let y = 1; y < 80; y++) c.set(x, y, z, S('stone'));
      }
      c.status = 'ready';
      w.addChunk(c);
    }
  return w;
}

function sink(w: World): EditSink & { destroyed: (...a: any[]) => void; n: number } {
  const s = {
    n: 0,
    get: (x: number, y: number, z: number) => w.getBlock(x, y, z),
    set: (x: number, y: number, z: number, st: number) => w.setBlock(x, y, z, st, 0),
    top: (x: number, z: number) => {
      for (let y = 255; y >= 0; y--) if (w.getBlock(x, y, z)) return y;
      return -1;
    },
    destroyed: () => { s.n++; },
  };
  return s;
}

const name = (w: World, x: number, y: number, z: number) => BLOCKS[w.getBlock(x, y, z) >>> 4]?.name ?? 'air';

describe('hero destruction', () => {
  it('a punch shockwave tunnels along the aim, widening, and stops at its length', () => {
    const w = slab();
    const s = sink(w);
    const c = new Carver(s);
    c.cone(new THREE.Vector3(0.5, 60.5, -30.5), new THREE.Vector3(0, 0, 1), 40, 1.5, 7, 400);
    c.finish();
    // the axis is open all the way, the tunnel is wide at the far end, and rock stays beyond it
    for (let z = -30; z < 8; z += 4) expect(name(w, 0, 60, z)).toBe('air');
    expect(name(w, 5, 60, 7)).toBe('air');
    expect(name(w, 6, 60, -29)).toBe('stone');
    expect(name(w, 0, 60, 12)).toBe('stone');
    expect(s.n).toBeGreaterThan(1500);
  });

  it('the wave front only cuts as far as it has travelled', () => {
    const w = slab();
    const c = new Carver(sink(w));
    c.cone(new THREE.Vector3(0.5, 60.5, -30.5), new THREE.Vector3(0, 0, 1), 40, 1.5, 7, 100);
    c.advance(0.1);
    c.work(1e9, 1e9);
    expect(name(w, 0, 60, -25)).toBe('air');
    expect(name(w, 0, 60, -15)).toBe('stone');
    c.finish();
    expect(name(w, 0, 60, -15)).toBe('air');
  });

  it('breaking the world: a crater to the edge of the radius, flattened, with lava fissures; bedrock survives', () => {
    const w = slab();
    // a mountain far from ground zero
    for (let y = 80; y < 110; y++) w.setBlock(30, y, 0, S('stone'), 0);
    const c = new Carver(sink(w));
    c.crater(new THREE.Vector3(0.5, 80, 0.5), 40, 60, 1000);
    c.finish();
    expect(name(w, 0, 40, 0)).toBe('air'); // deep at the centre
    expect(name(w, 30, 90, 0)).toBe('air'); // the mountain is gone
    expect(name(w, 0, 0, 0)).toBe('bedrock');
    let lava = 0;
    for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) if (name(w, x, 2, z) === 'lava') lava++;
    expect(lava).toBeGreaterThan(20);
    // beyond the radius nothing changed
    expect(name(w, 45, 79, 0)).toBe('stone');
  });

  it('respects a per-call edit budget', () => {
    const w = slab();
    const c = new Carver(sink(w));
    c.sphere(new THREE.Vector3(0, 60, 0), 8);
    const n = c.work(200, 1e9);
    expect(n).toBeLessThanOrEqual(200 + 400);
    expect(c.busy).toBe(true);
    c.finish();
    expect(c.busy).toBe(false);
    expect(name(w, 0, 60, 0)).toBe('air');
  });
});
