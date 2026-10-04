import { describe, it, expect } from 'vitest';
import '../src/world/blocks/blocks';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { lightChunkLocal } from '../src/world/light';
import { S, BLOCKS } from '../src/world/blocks/registry';
import { defaultTimeline, quakeIntensity, shakeFalloff, planFissures, planFault } from '../src/game/disasters/quake/plan';
import { findTree, fallenPos } from '../src/game/disasters/quake/topple';
import { Earthquake } from '../src/game/disasters/earthquake';
import { DISASTERS } from '../src/game/disasters/kit';

const H = 64;
function flatChunk(cx: number, cz: number) {
  const c = new Chunk(cx, cz);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < H; y++) c.set(x, y, z, y === 0 ? S('bedrock') : S(y === H - 1 ? 'grass_block' : y > H - 4 ? 'dirt' : 'stone'));
  c.heightmap.fill(H);
  lightChunkLocal(c);
  c.status = 'ready';
  return c;
}

function tree(w: World, x: number, z: number, h = 5) {
  for (let y = H; y < H + h; y++) w.setBlock(x, y, z, S('oak_log'));
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let y = H + h - 2; y < H + h + 1; y++) {
    if ((dx || dz || y >= H + h) && !w.getBlock(x + dx, y, z + dz)) w.setBlock(x + dx, y, z + dz, S('oak_leaves'));
  }
}

const rnd = (() => {
  let s = 7;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();

describe('quake shaking envelope', () => {
  it('foreshock, violent main shock, aftershocks, then silence', () => {
    const tl = defaultTimeline(rnd);
    const I = (t: number) => quakeIntensity(t, tl);
    for (let t = 0; t < tl.main - 0.3; t += 0.25) expect(I(t)).toBeLessThan(0.45);
    expect(I(1)).toBeGreaterThan(0.05);
    for (let t = tl.main + 0.6; t < tl.mainEnd - 3.5; t += 0.25) expect(I(t)).toBeGreaterThan(0.65);
    for (const [c, p] of tl.after) {
      expect(I(c + 0.2)).toBeGreaterThan(p * 0.8);
      expect(I(c + 0.2)).toBeLessThan(0.7);
    }
    expect(I(tl.duration)).toBe(0);
    expect(tl.duration).toBeGreaterThanOrEqual(24);
    expect(tl.duration).toBeLessThanOrEqual(26);
  });

  it('is felt within about 100 blocks', () => {
    expect(shakeFalloff(0)).toBeGreaterThan(1);
    expect(shakeFalloff(50)).toBeGreaterThan(0.1);
    expect(shakeFalloff(95)).toBeLessThan(0.05);
    expect(shakeFalloff(110)).toBe(0);
  });
});

describe('fissure planning', () => {
  it('is deterministic and radiates branching cracks 40-60 blocks out', () => {
    for (const seed of [1, 2, 3, 77, 4242]) {
      const a = planFissures(seed, 100, 200);
      const b = planFissures(seed, 100, 200);
      expect(a.cols.length).toBe(b.cols.length);
      expect(a.cols[10]).toEqual(b.cols[10]);
      const arms = a.branches.filter((br) => br.level === 0);
      const subs = a.branches.filter((br) => br.level === 1);
      expect(arms.length).toBeGreaterThanOrEqual(3);
      expect(arms.length).toBeLessThanOrEqual(5);
      expect(subs.length).toBeGreaterThanOrEqual(arms.length);
      for (const br of arms) {
        const n = br.xs.length - 1;
        const reach = Math.hypot(br.xs[n] - 100.5, br.zs[n] - 200.5);
        expect(reach).toBeGreaterThan(28); // noisy paths are shorter than their arc length
        expect(n).toBeGreaterThanOrEqual(40);
        expect(n).toBeLessThanOrEqual(60);
        expect(Math.max(...br.width)).toBeGreaterThanOrEqual(2);
        expect(Math.max(...br.width)).toBeLessThanOrEqual(6);
        expect(Math.max(...br.depth)).toBeGreaterThanOrEqual(10);
        expect(Math.max(...br.depth)).toBeLessThanOrEqual(30);
        // tapering to the tip
        expect(br.width[n]).toBeLessThan(br.width[0]);
        // the rupture advances outward
        for (let i = 1; i < br.t.length; i++) expect(br.t[i]).toBeGreaterThan(br.t[i - 1]);
      }
      // columns are sorted by opening time; carved and rim columns
      for (let i = 1; i < a.cols.length; i++) expect(a.cols[i].t).toBeGreaterThanOrEqual(a.cols[i - 1].t);
      const carved = a.cols.filter((c) => !c.edge);
      expect(carved.length).toBeGreaterThan(300);
      expect(a.cols.some((c) => c.edge)).toBe(true);
      expect(Math.max(...carved.map((c) => c.depth))).toBeLessThanOrEqual(31);
      expect(carved.some((c) => c.lava)).toBe(true);
      // the farthest crack reaches 40-65 blocks out
      const far = Math.max(...carved.map((c) => Math.hypot(c.x - 100, c.z - 200)));
      expect(far).toBeGreaterThan(38);
      expect(far).toBeLessThan(68);
    }
  });

  it('plans an uplifted fault block on one side of the rupture', () => {
    const f = planFault(3, 0, 0, 0, { maxLift: 3 });
    expect(f.cols.length).toBeGreaterThan(400);
    for (const c of f.cols) {
      expect(c.lift).toBeGreaterThanOrEqual(1);
      expect(c.lift).toBeLessThanOrEqual(3);
      expect(c.z).toBeGreaterThan(-4); // +z side of a line along +x (with a wavy trace)
    }
    expect(f.cols.some((c) => c.lift === 3)).toBe(true);
    for (let i = 1; i < f.cols.length; i++) expect(f.cols[i].along).toBeGreaterThanOrEqual(f.cols[i - 1].along);
  });
});

describe('toppling trees', () => {
  it('finds a whole tree and lays it down along the fall direction', () => {
    const world = new World('overworld', 1);
    for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) world.addChunk(flatChunk(cx, cz));
    tree(world, 0, 0, 5);
    const t = findTree(world, 0, 0, H + 6)!;
    expect(t).not.toBeNull();
    expect(t.x).toBe(0);
    expect(t.y).toBe(H);
    expect(t.blocks.filter((b) => BLOCKS[b.state >>> 4].name === 'oak_log').length).toBe(5);
    expect(t.blocks.length).toBeGreaterThan(30);
    // trunk lies on the ground in the fall direction
    const logs = t.blocks.filter((b) => b.dx === 0 && b.dz === 0);
    for (const b of logs) expect(fallenPos(t, b, 0)).toEqual([1 + b.dy, H, 0]);
    for (const b of logs) expect(fallenPos(t, b, 3)).toEqual([0, H, -1 - b.dy]);
    // no trunk in this column
    expect(findTree(world, 5, 5, H + 3)).toBeNull();
  });
});

describe('earthquake (headless)', () => {
  it('cracks, lifts and collapses the terrain within the tick budget', () => {
    const world = new World('overworld', 1);
    for (let cx = -6; cx <= 5; cx++) for (let cz = -6; cz <= 5; cz++) world.addChunk(flatChunk(cx, cz));
    const trees: [number, number][] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, r = 10 + (i % 4) * 7;
      const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
      tree(world, x, z, 5);
      trees.push([x, z]);
    }
    // a glass-windowed hut and a sand pile
    for (let x = 30; x < 35; x++) for (let z = 30; z < 35; z++) for (let y = H; y < H + 4; y++) {
      const wall = x === 30 || x === 34 || z === 30 || z === 34 || y === H + 3;
      if (wall) world.setBlock(x, y, z, S(y === H + 1 && (x === 32 || z === 32) ? 'glass' : 'oak_planks'));
    }
    for (let x = -30; x < -26; x++) for (let z = -3; z < 3; z++) for (let y = H; y < H + 3; y++) world.setBlock(x, y, z, S('sand'));
    const before = new Map<string, number>();
    for (let x = -60; x < 60; x += 3) for (let z = -60; z < 60; z += 3) before.set(`${x},${z}`, world.getHeight(x, z));

    const list: any[] = [];
    const game: any = {
      world, dimension: 'overworld', renderExtras: {}, events: { emit() {} },
      entities: { list, add(e: any) { e.init(game, world); list.push(e); return e; } },
    };
    expect(DISASTERS.has('earthquake')).toBe(true);
    const q = new Earthquake(game, 0, H, 0, 1, 0, { seed: 11 });
    let ticks = 0, alive = true;
    const times: number[] = [];
    while (alive && ticks < 1000) {
      const a = performance.now();
      alive = q.tick(game);
      times.push(performance.now() - a);
      ticks++;
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)], worst = times[times.length - 1];
    q.dispose(game);
    console.log('quake', ticks, 'ticks, p95', p95.toFixed(2), 'worst', worst.toFixed(2), 'ms', JSON.stringify(q.stats));
    expect(ticks).toBeGreaterThanOrEqual(500);
    expect(ticks).toBeLessThan(800);
    expect(q.done).toBe(true);
    // edits run under a 5 ms budget per tick (wall-clock: allow for a loaded machine)
    expect(p95).toBeLessThan(12);
    expect(worst).toBeLessThan(150);
    expect(q.stats.carved).toBeGreaterThan(300);
    expect(q.stats.lifted).toBeGreaterThan(300);
    expect(q.stats.toppled).toBeGreaterThan(0);
    expect(q.stats.fell).toBeGreaterThan(5);
    // fissures: deep air along the first carved columns
    const deep = q.fissures.cols.filter((c) => !c.edge && c.depth >= 12).slice(0, 40);
    let open = 0;
    for (const c of deep) if (world.getBlock(c.x, H - 8, c.z) === 0 || BLOCKS[world.getBlock(c.x, H - 8, c.z) >>> 4].name === 'lava') open++;
    expect(open).toBeGreaterThan(deep.length * 0.6);
    // fault: some columns rose by 1-3 blocks
    let raised = 0;
    for (const c of q.fault.cols) {
      const isCrack = q.fissures.cols.some((f) => f.x === c.x && f.z === c.z);
      if (!isCrack && world.getBlock(c.x, H, c.z) && BLOCKS[world.getBlock(c.x, H + c.lift - 1, c.z) >>> 4].name === 'grass_block') raised++;
    }
    expect(raised).toBeGreaterThan(50);
    // fallen logs lie horizontally somewhere
    let lying = 0;
    for (let x = -50; x < 50; x++) for (let z = -50; z < 50; z++) for (let y = H; y < H + 6; y++) {
      const s = world.getBlock(x, y, z);
      if (s && BLOCKS[s >>> 4].name === 'oak_log' && (s & 3) !== 0) lying++;
    }
    expect(lying).toBeGreaterThan(2);
    // bedrock untouched
    for (let x = -60; x < 60; x += 2) for (let z = -60; z < 60; z += 2) expect(world.getBlock(x, 0, z)).toBe(S('bedrock'));
  });
});

describe('earthquake edit budget', () => {
  it('spreads the work over more ticks when the budget is small', () => {
    const world = new World('overworld', 1);
    for (let cx = -5; cx <= 4; cx++) for (let cz = -5; cz <= 4; cz++) world.addChunk(flatChunk(cx, cz));
    const list: any[] = [];
    const game: any = { world, dimension: 'overworld', renderExtras: {}, events: { emit() {} }, entities: { list, add(e: any) { e.init(game, world); list.push(e); return e; } } };
    const tight = new Earthquake(game, 0, H, 0, 0, 1, { seed: 3, budgetMs: 0.4 });
    const times: number[] = [];
    let alive = true, ticks = 0;
    while (alive && ticks < 2000) {
      const a = performance.now();
      alive = tight.tick(game);
      times.push(performance.now() - a);
      ticks++;
    }
    tight.dispose(game);
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length * 0.9)]).toBeLessThan(6);
    expect(tight.stats.carved).toBeGreaterThan(100);
    expect(tight.stats.lifted).toBeGreaterThan(100);
  });
});
