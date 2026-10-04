import { describe, it, expect } from 'vitest';
import '../src/world/blocks/blocks';
import { World, SetFlags } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { lightChunkLocal } from '../src/world/light';
import { S, BLOCKS } from '../src/world/blocks/registry';
import { craterProfile, planImpact, lavaLakeRadius, type ImpactPlan } from '../src/game/disasters/asteroid/crater';
import { ringOffsets, RingScheduler, shockFront } from '../src/game/disasters/asteroid/rings';
import { processColumn, classify, Cls, newColumnInfo, type ColumnAccess } from '../src/game/disasters/asteroid/column';

function flatChunk(cx: number, cz: number, h: number) {
  const c = new Chunk(cx, cz);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < h; y++) c.set(x, y, z, S(y === 0 ? 'bedrock' : y === h - 1 ? 'grass_block' : y > h - 4 ? 'dirt' : 'stone'));
  lightChunkLocal(c);
  c.status = 'ready';
  return c;
}

const name = (st: number) => BLOCKS[st >>> 4]?.name ?? 'air';

function access(world: World): ColumnAccess {
  return {
    get: (x, y, z) => world.getBlock(x, y, z),
    set: (x, y, z, s) => world.setBlock(x, y, z, s, SetFlags.MODIFY),
    top: (x, z) => {
      const c = world.getChunk(x >> 4, z >> 4);
      return c ? c.topSection() * 16 - 1 : -1;
    },
  };
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

describe('asteroid crater profile', () => {
  it('is a bowl D deep with an H rim and a cube-law ejecta blanket', () => {
    const D = 40, H = 9;
    expect(craterProfile(0, D, H)).toBeCloseTo(-D, 6);
    expect(craterProfile(1, D, H)).toBeCloseTo(H, 6);
    expect(craterProfile(2, D, H)).toBeCloseTo(H / 8, 6);
    // monotonic: rising inside, falling outside
    let prev = -Infinity;
    for (let r = 0; r <= 1; r += 0.02) {
      const v = craterProfile(r, D, H);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    for (let r = 1; r < 4; r += 0.05) expect(craterProfile(r + 0.05, D, H)).toBeLessThan(craterProfile(r, D, H));
    // symmetric and continuous at the rim
    expect(craterProfile(-0.5, D, H)).toBeCloseTo(craterProfile(0.5, D, H), 9);
    expect(Math.abs(craterProfile(0.999, D, H) - craterProfile(1.001, D, H))).toBeLessThan(0.3);
  });

  it('plans a 60-90 block, 30-50 deep crater above bedrock', () => {
    for (let s = 1; s < 40; s++) {
      const p = planImpact(0, 0, 70, 160, rng(s));
      expect(p.R).toBeGreaterThanOrEqual(60);
      expect(p.R).toBeLessThanOrEqual(90);
      expect(p.D).toBeGreaterThanOrEqual(30);
      expect(p.D).toBeLessThanOrEqual(50);
      expect(p.lavaY).toBeGreaterThan(p.G - p.D);
      expect(lavaLakeRadius(p)).toBeGreaterThan(p.R * 0.3);
      expect(lavaLakeRadius(p)).toBeLessThan(p.R * 0.6);
      expect(p.evapR).toBeLessThanOrEqual(p.maxR);
    }
    // low ground: depth clamped so the floor stays above bedrock
    const low = planImpact(0, 0, 20, 160, rng(3));
    expect(low.G - low.D).toBeGreaterThanOrEqual(8);
  });
});

describe('asteroid ring scheduling', () => {
  it('ring offsets tile the disc exactly once, ordered by radius', () => {
    const R = 40;
    const seen = new Set<string>();
    for (let r = 0; r <= R; r++) {
      const o = ringOffsets(r);
      for (let i = 0; i < o.length; i += 2) {
        const d = Math.hypot(o[i], o[i + 1]);
        expect(d).toBeGreaterThanOrEqual(r);
        expect(d).toBeLessThan(r + 1);
        const k = `${o[i]},${o[i + 1]}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
    let n = 0;
    for (let x = -R - 1; x <= R + 1; x++) for (let z = -R - 1; z <= R + 1; z++) if (Math.hypot(x, z) < R + 1) n++;
    expect(seen.size).toBe(n);
  });

  it('waits for the shock front and visits rings outward', () => {
    const s = new RingScheduler(30, () => 0);
    let last = -1;
    const fn = (dx: number, dz: number, r: number) => {
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
      expect(Math.hypot(dx, dz)).toBeLessThan(r + 1);
      return 1;
    };
    s.run(10, { edits: 1e9, ms: 1e9 }, fn);
    expect(last).toBe(10);
    expect(s.ring).toBe(11);
    s.run(10, { edits: 1e9, ms: 1e9 }, fn); // front has not moved: nothing new
    expect(last).toBe(10);
    s.run(30, { edits: 1e9, ms: 1e9 }, fn);
    expect(s.done).toBe(true);
    expect(s.progress).toBe(1);
  });

  it('keeps edits within the per-tick budget (one column of overshoot, carried as debt)', () => {
    const s = new RingScheduler(60, () => 0);
    const budget = 500;
    let ticks = 0, total = 0, worst = 0;
    // uneven columns: some cost 0, some 90 edits
    const fn = (dx: number, dz: number) => ((dx * 7 + dz * 13) & 7) === 0 ? 90 : (dx + dz) & 3;
    while (!s.done && ticks < 10000) {
      const r = s.run(1e9, { edits: budget, ms: 1e9 }, fn);
      worst = Math.max(worst, r.edits);
      total += r.edits;
      ticks++;
    }
    expect(s.done).toBe(true);
    expect(worst).toBeLessThanOrEqual(budget + s.maxColumn);
    // long-run average stays within the budget
    expect(total).toBeLessThanOrEqual(ticks * budget + s.maxColumn);
    expect(s.totalEdits).toBe(total);
  });

  it('can start at an inner ring (outer leveling beside the crater)', () => {
    const s = new RingScheduler(20, () => 0, 11);
    let min = Infinity, n = 0;
    s.run(1e9, { edits: 1e9, ms: 1e9 }, (dx, dz) => { min = Math.min(min, Math.hypot(dx, dz)); n++; return 1; });
    expect(min).toBeGreaterThanOrEqual(11);
    expect(s.done).toBe(true);
    let m = 0;
    for (let r = 11; r <= 20; r++) m += ringOffsets(r).length / 2;
    expect(n).toBe(m);
  });

  it('stops on the time budget and on the column cap', () => {
    let t = 0;
    const s = new RingScheduler(100, () => t);
    const r = s.run(1e9, { edits: 1e9, ms: 5 }, () => { t += 1; return 1; });
    expect(r.columns).toBeLessThanOrEqual(16);
    const s2 = new RingScheduler(100, () => 0);
    expect(s2.run(1e9, { edits: 1e9, ms: 1e9, columns: 100 }, () => -1).columns).toBe(100);
  });

  it('the shock front decelerates outward from the crater', () => {
    expect(shockFront(0, 80)).toBe(80);
    expect(shockFront(1, 80)).toBeGreaterThan(80);
    const v1 = shockFront(1.1, 80) - shockFront(1, 80), v5 = shockFront(5.1, 80) - shockFront(5, 80);
    expect(v5).toBeLessThan(v1);
  });
});

describe('asteroid impact on terrain', () => {
  it('classifies ground, plants, buildings, water and ice', () => {
    expect(classify(S('stone'))).toBe(Cls.Terrain);
    expect(classify(S('grass_block'))).toBe(Cls.Terrain);
    expect(classify(S('iron_ore'))).toBe(Cls.Terrain);
    expect(classify(S('oak_log'))).toBe(Cls.Plant);
    expect(classify(S('oak_leaves'))).toBe(Cls.Plant);
    expect(classify(S('poppy'))).toBe(Cls.Plant);
    expect(classify(S('short_grass'))).toBe(Cls.Plant);
    expect(classify(S('oak_planks'))).toBe(Cls.Struct);
    expect(classify(S('cobblestone'))).toBe(Cls.Struct);
    expect(classify(S('glass'))).toBe(Cls.Struct);
    expect(classify(S('water'))).toBe(Cls.Water);
    expect(classify(S('ice'))).toBe(Cls.Melt);
    expect(classify(S('bedrock'))).toBe(Cls.Fixed);
    expect(classify(0)).toBe(Cls.Air);
  });

  it('digs a lava-floored crater with a raised rim and levels the land ring by ring', () => {
    const world = new World('overworld', 1);
    for (let cx = -5; cx <= 4; cx++) for (let cz = -5; cz <= 4; cz++) world.addChunk(flatChunk(cx, cz, 64));
    world.lightEnabled = false;
    const G = 63;
    // a tree, a house and a pond outside the crater
    const tree = [40, 5];
    for (let y = 64; y < 69; y++) world.setBlock(tree[0], y, tree[1], S('oak_log'));
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let y = 67; y < 70; y++) if (dx || dz) world.setBlock(tree[0] + dx, y, tree[1] + dz, S('oak_leaves'));
    for (let dx = 0; dx < 5; dx++) for (let dz = 0; dz < 5; dz++) for (let y = 64; y < 68; y++) if (dx === 0 || dx === 4 || dz === 0 || dz === 4) world.setBlock(-45 + dx, y, -10 + dz, S('oak_planks'));
    for (let dx = 0; dx < 4; dx++) for (let dz = 0; dz < 4; dz++) world.setBlock(10 + dx, G, -40 + dz, S('water'));
    world.setBlock(-30, 64, 30, S('poppy'));
    world.setBlock(-31, 64, 30, S('glass'));

    const P: ImpactPlan = { cx: 0, cz: 0, G, R: 18, D: 12, H: 3, lavaY: G - 12 + 3, evapR: 50, maxR: 70, seed: 42 };
    const acc = access(world);
    const sched = new RingScheduler(P.maxR, () => 0);
    const info = newColumnInfo();
    const budget = 2500;
    let worst = 0, ticks = 0, fires = 0;
    while (!sched.done && ticks < 5000) {
      const r = sched.run(shockFront(ticks / 20, P.R * 1.2), { edits: budget, ms: 1e9 }, (dx, dz) => {
        const e = processColumn(acc, P, P.cx + dx, P.cz + dz, info);
        if (info.fireY >= 0) fires++;
        return e;
      });
      worst = Math.max(worst, r.edits);
      ticks++;
    }
    expect(sched.done).toBe(true);
    expect(worst).toBeLessThanOrEqual(budget + sched.maxColumn);
    expect(sched.maxColumn).toBeLessThan(200);

    const top = (x: number, z: number) => {
      for (let y = 120; y > 0; y--) if (world.getBlock(x, y, z)) return y;
      return -1;
    };
    // centre: lava lake over a melt lining, deep below the old ground
    const c = top(0, 0);
    expect(name(world.getBlock(0, c, 0))).toMatch(/lava|magma_block|obsidian/);
    expect(c).toBeLessThanOrEqual(P.lavaY);
    const floor = (() => { for (let y = P.lavaY; y > 0; y--) { const n = name(world.getBlock(0, y, 0)); if (n !== 'lava') return y; } return -1; })();
    expect(floor).toBeLessThanOrEqual(G - P.D + 1);
    expect(['magma_block', 'obsidian', 'blackstone', 'basalt', 'crying_obsidian']).toContain(name(world.getBlock(0, floor, 0)));
    for (let y = P.lavaY + 1; y <= G; y++) expect(world.getBlock(0, y, 0)).toBe(0);
    // raised rim around the crater edge
    const rims = [[P.R, 0], [-P.R, 0], [0, P.R], [0, -P.R]].map(([x, z]) => top(x, z));
    expect(Math.max(...rims)).toBeGreaterThan(G);
    // the tree, the house and the flower are gone; the pond has boiled away
    for (let y = 64; y < 72; y++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) expect(['oak_log', 'oak_leaves']).not.toContain(name(world.getBlock(tree[0] + dx, y, tree[1] + dz)));
    for (let y = 66; y < 70; y++) for (let dx = 0; dx < 5; dx++) expect(world.getBlock(-45 + dx, y, -10)).toBe(0);
    expect(name(world.getBlock(-30, 64, 30))).not.toBe('poppy');
    expect(name(world.getBlock(-31, 64, 30))).not.toBe('glass');
    for (let dx = 0; dx < 4; dx++) for (let dz = 0; dz < 4; dz++) expect(name(world.getBlock(10 + dx, G, -40 + dz))).not.toBe('water');
    // scorched: no grass left anywhere in the leveled disc, some fires burning
    let grass = 0, scorched = 0;
    for (let x = -60; x <= 60; x += 3) for (let z = -60; z <= 60; z += 3) {
      if (Math.hypot(x, z) > P.maxR) continue;
      const n = name(world.getBlock(x, top(x, z) === -1 ? 0 : top(x, z), z));
      if (n === 'grass_block') grass++;
      if (['coarse_dirt', 'blackstone', 'gravel', 'tuff', 'fire', 'dirt', 'glass', 'cobblestone', 'magma_block', 'netherrack'].includes(n)) scorched++;
    }
    expect(grass).toBe(0);
    expect(scorched).toBeGreaterThan(100);
    expect(fires).toBeGreaterThan(5);
  });

  it('shaves hills down and leaves distant water alone', () => {
    const world = new World('overworld', 1);
    for (let cx = -1; cx <= 7; cx++) for (let cz = -1; cz <= 1; cz++) world.addChunk(flatChunk(cx, cz, 64));
    world.lightEnabled = false;
    // a 30-block stone hill at x=60 and a lake at x=110
    for (let y = 64; y < 94; y++) world.setBlock(60, y, 0, S('stone'));
    for (let y = 60; y < 64; y++) world.setBlock(110, y, 0, S('water'));
    const P: ImpactPlan = { cx: 0, cz: 0, G: 63, R: 18, D: 12, H: 3, lavaY: 54, evapR: 50, maxR: 120, seed: 7 };
    const acc = access(world);
    const info = newColumnInfo();
    processColumn(acc, P, 60, 0, info);
    expect(info.ground).toBe(93);
    expect(info.surface).toBeLessThan(93 - 4);
    processColumn(acc, P, 110, 0, info);
    expect(info.water).toBe(true);
    expect(name(world.getBlock(110, 63, 0))).toBe('water');
    // unloaded columns are skipped
    expect(processColumn(acc, P, 5000, 0, info)).toBe(-1);
  });
});

describe('asteroid disaster (headless, whole sequence)', () => {
  it('counts down, impacts, levels the loaded map within budget and cleans up', async () => {
    const THREE = await import('three');
    const { DISASTERS, DisasterFx } = await import('../src/game/disasters/kit');
    await import('../src/game/disasters/asteroid');
    const world = new World('overworld', 1);
    for (let cx = -7; cx <= 6; cx++) for (let cz = -7; cz <= 6; cz++) world.addChunk(flatChunk(cx, cz, 64));
    world.lightEnabled = false;
    for (let y = 64; y < 70; y++) world.setBlock(90, y, 3, S('oak_log'));
    const events: string[] = [], msgs: string[] = [];
    const debris = { x: 30, z: 30, removed: false, pos: new THREE.Vector3(10, 64, 10), vel: new THREE.Vector3(), remove() { this.removed = true; } };
    const game: any = {
      world,
      events: { emit: (n: string, e: any) => events.push(n === 'title' ? `title:${e.title}` : n) },
      message: (m: string) => msgs.push(m),
      renderer: {
        lightUniforms: { u_sh: { value: Array.from({ length: 9 }, () => new THREE.Vector3()) } },
        settings: { exposureBias: 1 },
        atmosphere: null, gl: null,
        translucentUniforms: { u_sceneColor: { value: null } },
        terrainUniforms: { u_resolution: { value: new THREE.Vector2(1, 1) } },
      },
      cameraCtl: { camera: new THREE.PerspectiveCamera(70, 1, 0.05, 600) },
      renderExtras: {},
      entities: { list: [debris] },
      player: null, particles: null, audio: null, chunks: null,
    };
    game.cameraCtl.camera.position.set(0, 80, 60);
    world.setBlock(0, 64, 0, 0);
    const d: any = DISASTERS.get('asteroid')!({ game, x: 0, y: 64, z: 0, fx: 0, fz: -1, effects: new DisasterFx() });
    expect(game.renderExtras.forward).toContain(d.scene);
    const P = d.plan;
    expect(P.G).toBe(63);
    let ticks = 0, alive = true;
    const times: number[] = [];
    while (alive && ticks < 20 * 400) {
      const t0 = performance.now();
      alive = d.tick(game);
      times.push(performance.now() - t0);
      d.update(game, 0.05);
      ticks++;
      if (ticks === 20 * 14) expect(world.getBlock(0, 40, 0)).not.toBe(0); // nothing dug before the impact
    }
    expect(alive).toBe(false);
    d.dispose(game);
    expect(game.renderExtras.forward).not.toContain(d.scene);
    // the timeline: countdown, impact, extinction title, ~4-5 minutes in all
    expect(events).toContain('title:IMPACT IMMINENT');
    expect(events).toContain('title:EXTINCTION EVENT');
    expect(ticks / 20).toBeGreaterThan(200);
    expect(msgs.length).toBeGreaterThan(4);
    // budgeted: ticks stay near the 5 ms leveling budget (percentile: robust to machine load)
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length * 0.98)]).toBeLessThan(20);
    expect(d.levelDone).toBe(true);
    // crater with lava at the impact, leveled tree far away, flung/removed debris entity
    let top = 0;
    for (let y = 120; y > 0; y--) if (world.getBlock(0, y, 0)) { top = y; break; }
    expect(top).toBeLessThanOrEqual(P.lavaY);
    expect(BLOCKS[world.getBlock(0, top, 0) >>> 4].name).toMatch(/lava|magma_block|obsidian/);
    for (let y = 64; y < 70; y++) expect(BLOCKS[world.getBlock(90, y, 3) >>> 4].name).not.toBe('oak_log');
    expect(debris.removed).toBe(true);
  }, 60000);
});
