import { describe, it, expect } from 'vitest';
import '../src/world/blocks/blocks';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { lightChunkLocal } from '../src/world/light';
import { S, BLOCKS } from '../src/world/blocks/registry';
import { DisasterFx } from '../src/game/disasters/kit';
import { planVolcano, coneHeight, coneTop, coneColumns, rockAt, riseProgress, columnHeightAt, flowPath, ballisticRange } from '../src/game/disasters/fire/cone';
import { blockClass, groundTop, WEAK, STRONG, ERODIBLE } from '../src/game/disasters/fire/terrain';
import { Volcano, RISE_S, ERUPT_S } from '../src/game/disasters/volcano';

function flatChunk(cx: number, cz: number, h: number) {
  const c = new Chunk(cx, cz);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < h; y++) c.set(x, y, z, S(y === h - 1 ? 'grass_block' : 'stone'));
  c.heightmap.fill(h);
  lightChunkLocal(c);
  c.status = 'ready';
  return c;
}

const name = (w: World, x: number, y: number, z: number) => BLOCKS[w.getBlock(x, y, z) >>> 4].name;

describe('volcano cone', () => {
  it('plans a 40..70 block stratovolcano with a crater below the rim', () => {
    for (let s = 0; s < 40; s++) {
      const p = planVolcano(0, 64, 0, s);
      expect(p.H).toBeGreaterThanOrEqual(40);
      expect(p.H).toBeLessThanOrEqual(70);
      expect(p.R).toBeGreaterThan(p.H);
      expect(p.lakeY).toBeLessThan(p.baseY + p.H);
      expect(p.lakeY).toBeGreaterThan(p.baseY + p.H - p.craterDepth - 1);
    }
    // clamped to the world top
    const hi = planVolcano(0, 220, 0, 3);
    expect(hi.baseY + hi.H).toBeLessThanOrEqual(250);
  });

  it('profile: concave flanks falling to zero at the foot, a crater at the summit', () => {
    const p = planVolcano(0, 64, 0, 7);
    let prev = Infinity;
    let rises = 0;
    for (let r = p.craterR + 1; r < p.R * 1.2; r += 2) {
      // average around the circle (noise averages out)
      let s = 0;
      for (let k = 0; k < 64; k++) s += coneHeight(p, Math.cos((k / 64) * Math.PI * 2) * r, Math.sin((k / 64) * Math.PI * 2) * r);
      s /= 64;
      if (s > prev + 0.01) rises++;
      prev = s;
    }
    expect(rises).toBe(0);
    expect(coneHeight(p, p.R * 1.3, 0)).toBe(0);
    // concave: at half radius well below half the height
    let mid = 0;
    for (let k = 0; k < 64; k++) mid += coneHeight(p, Math.cos(k) * p.R * 0.5, Math.sin(k) * p.R * 0.5);
    expect(mid / 64).toBeLessThan(p.H * 0.45);
    // crater floor below the rim
    const rim = Math.max(...Array.from({ length: 32 }, (_, k) => coneHeight(p, Math.cos(k) * p.craterR, Math.sin(k) * p.craterR)));
    expect(coneHeight(p, 0, 0)).toBeLessThan(rim - p.craterDepth * 0.5);
    expect(coneTop(p, 0, 0)).toBeLessThan(p.lakeY);
  });

  it('strata are real blocks, darker near the summit', () => {
    const p = planVolcano(0, 64, 0, 11);
    const low = new Map<string, number>(), high = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const x = (i * 37) % 60 - 30, z = (i * 53) % 60 - 30;
      const lo = rockAt(p, x, p.baseY + 2 + (i % 5), z), hi = rockAt(p, x, p.baseY + p.H - 3 - (i % 5), z);
      expect(() => S(lo)).not.toThrow();
      expect(() => S(hi)).not.toThrow();
      low.set(lo, (low.get(lo) ?? 0) + 1);
      high.set(hi, (high.get(hi) ?? 0) + 1);
    }
    const dark = (m: Map<string, number>) => (m.get('basalt') ?? 0) + (m.get('blackstone') ?? 0) + (m.get('smooth_basalt') ?? 0);
    expect(dark(high)).toBeGreaterThan(dark(low));
  });

  it('uplift: columns ordered from the centre, heights grow monotonically to the final top', () => {
    const p = planVolcano(0, 64, 0, 5);
    const cols = coneColumns(p);
    expect(cols.length / 3).toBeGreaterThan(Math.PI * p.R * p.R * 0.5);
    const d0 = Math.hypot(cols[0], cols[1]), dn = Math.hypot(cols[cols.length - 3], cols[cols.length - 2]);
    expect(d0).toBeLessThan(dn);
    let prev = 0;
    for (let t = 0; t <= RISE_S; t += 0.5) {
      const f = riseProgress(t, RISE_S);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(riseProgress(RISE_S, RISE_S)).toBe(1);
    expect(columnHeightAt(p.baseY + 40, p.baseY, 1)).toBe(41);
    expect(columnHeightAt(p.baseY + 40, p.baseY, 0)).toBe(0);
  });

  it('lava flow paths go downhill and stop in pits', () => {
    const p = planVolcano(0, 64, 0, 9);
    const top = (x: number, z: number) => Math.max(63, coneTop(p, x, z));
    const path = flowPath(top, p.craterR + 1, 0, 1, 0, 400, 1);
    expect(path.length / 2).toBeGreaterThan(p.R * 0.6);
    for (let i = 2; i < path.length; i += 2) expect(top(path[i], path[i + 1])).toBeLessThanOrEqual(top(path[i - 2], path[i - 1]));
    // ends on the plain around the foot (flats are limited)
    const ex = path[path.length - 2], ez = path[path.length - 1];
    expect(Math.hypot(ex, ez)).toBeGreaterThan(p.R * 0.7);
    // a pit traps the flow immediately
    const pit = (x: number, z: number) => (x === 0 && z === 0 ? 10 : 20);
    expect(flowPath(pit, 0, 0, 1, 0, 50, 2).length).toBe(2);
  });

  it('bomb ranges reach the flanks and beyond', () => {
    expect(ballisticRange(30, Math.PI / 3, 18, 0)).toBeGreaterThan(30);
    expect(ballisticRange(45, Math.PI / 3, 18, 50)).toBeGreaterThan(90);
  });

  it('classifies blocks for burning and flooding', () => {
    expect(blockClass(S('oak_leaves'))).toBe(WEAK);
    expect(blockClass(S('oak_log'))).toBe(WEAK);
    expect(blockClass(S('short_grass'))).toBe(WEAK);
    expect(blockClass(S('glass'))).toBe(WEAK);
    expect(blockClass(S('sand'))).toBe(ERODIBLE);
    expect(blockClass(S('stone'))).toBe(STRONG);
    expect(blockClass(S('bedrock'))).toBe(STRONG);
  });
});

describe('volcano disaster', () => {
  it('rises, fills the crater with lava, erupts with flows and bombs, then cools, within the tick budget', () => {
    const world = new World('overworld', 1);
    const R = 7;
    for (let cx = -R; cx < R; cx++) for (let cz = -R; cz < R; cz++) world.addChunk(flatChunk(cx, cz, 40));
    // a small pond on the plain for the flows to quench in
    for (let x = 60; x < 75; x++) for (let z = -8; z < 8; z++) for (let y = 37; y < 40; y++) world.setBlock(x, y, z, S('water'), 0);
    expect(groundTop(world, 0, 0)).toBe(39);
    const player = { pos: { x: 0, y: 40, z: -100 }, vel: { x: 0, y: 0, z: 0 }, setPos(x: number, y: number, z: number) { this.pos = { x, y, z }; } };
    const game: any = { world, player, entities: { list: [] }, events: { emit() {} }, message() {}, paused: false, dimension: 'overworld' };
    const fx = new DisasterFx();
    const v = new Volcano({ game, x: 0, y: 40, z: 0, fx: 0, fz: 1, effects: fx });
    const p = v.plan;
    expect(p.baseY).toBe(40);
    let ticks = 0;
    const t0 = performance.now();
    while (v.phase === 'rise' && ticks < 2000) { v.tick(game); ticks++; }
    const riseMs = performance.now() - t0;
    expect(v.phase).toBe('pause');
    // the summit stands H blocks high, the crater holds a lava lake
    let maxTop = 0;
    for (let x = -p.craterR - 2; x <= p.craterR + 2; x++) for (let z = -p.craterR - 2; z <= p.craterR + 2; z++) maxTop = Math.max(maxTop, groundTop(world, x, z));
    expect(maxTop).toBeGreaterThanOrEqual(p.baseY + p.H - 3);
    expect(name(world, 0, p.lakeY, 0)).toBe('lava');
    const mid = groundTop(world, Math.round(p.R * 0.5), 0);
    expect(mid).toBeGreaterThan(p.baseY + 3);
    expect(mid).toBeLessThan(p.baseY + p.H * 0.6);
    expect(['basalt', 'blackstone', 'tuff', 'stone', 'smooth_basalt', 'andesite', 'magma_block', 'gravel', 'coarse_dirt', 'cobbled_deepslate']).toContain(name(world, Math.round(p.R * 0.5), mid, 0));
    // rise takes about RISE_S seconds (the budget may stretch it a little)
    expect(ticks).toBeGreaterThanOrEqual(RISE_S * 20);
    expect(ticks).toBeLessThan(RISE_S * 20 * 2.5);
    // eruption
    while (v.phase !== 'smoke' && ticks < 6000) { v.tick(game); ticks++; }
    expect(v.stats.bombsLaunched).toBeGreaterThan(40);
    expect(v.stats.bombsLanded).toBeGreaterThan(20);
    expect(v.stats.flowCells).toBeGreaterThan(60);
    const lavaCells = v.lavaCells.length / 3;
    expect(lavaCells).toBeGreaterThan(60);
    // flows reached the lower flanks
    let far = 0;
    for (let i = 0; i < v.lavaCells.length; i += 3) far = Math.max(far, Math.hypot(v.lavaCells[i], v.lavaCells[i + 2]));
    expect(far).toBeGreaterThan(p.R * 0.6);
    // aftermath: flows cool to rock, the crater keeps its lava
    while (v.tick(game) && ticks < 12000) ticks++;
    expect(v.phase).toBe('done');
    let lava = 0;
    for (let i = 0; i < v.lavaCells.length; i += 3) if (name(world, v.lavaCells[i], v.lavaCells[i + 1], v.lavaCells[i + 2]) === 'lava') lava++;
    expect(lava).toBe(0);
    expect(name(world, 0, p.lakeY, 0)).toBe('lava');
    v.dispose();
    console.log(`volcano H=${p.H} R=${p.R}: rise ${(riseMs / 1000).toFixed(1)} s cpu, ${v.stats.placed} blocks, worst tick ${v.stats.worstMs.toFixed(1)} ms, bombs ${v.stats.bombsLaunched}/${v.stats.bombsLanded}, flow cells ${v.stats.flowCells}, quenched ${v.stats.quenched}, ticks ${ticks} (eruption ${ERUPT_S} s)`);
    expect(v.stats.worstMs).toBeLessThan(40);
  }, 120000);
});
