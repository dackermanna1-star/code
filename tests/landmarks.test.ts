import { describe, it, expect } from 'vitest';
import '../src/world/blocks/blocks';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { lightChunkLocal } from '../src/world/light';
import { S, BLOCKS } from '../src/world/blocks/registry';
import { planTower, insideTower, LandmarkSystem } from '../src/game/landmarks';

function flatChunk(cx: number, cz: number, h: number) {
  const c = new Chunk(cx, cz);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < h; y++) c.set(x, y, z, S(y === h - 1 ? 'grass_block' : 'stone'));
  lightChunkLocal(c);
  c.status = 'ready';
  return c;
}

describe('One World Trade Center', () => {
  it('scales to fit the world height above the placement', () => {
    for (const y of [5, 64, 70, 100, 140]) {
      const p = planTower(0, y, 0, 0, 1)!;
      expect(p).not.toBeNull();
      expect(y + p.top - 1).toBeLessThanOrEqual(255);
      // real proportions: roof / base width = 1368 / 200
      expect(p.roof / (2 * p.R)).toBeGreaterThan(6.2);
      expect(p.roof / (2 * p.R)).toBeLessThan(7.4);
    }
    expect(planTower(0, 70, 0, 0, 1)!.R).toBeGreaterThanOrEqual(9);
    expect(planTower(0, 230, 0, 0, 1)).toBeNull();
  });

  it('plan morphs from a square into a 45-degree square, octagonal mid-way', () => {
    const p = planTower(0, 64, 0, 0, 1)!;
    expect(insideTower(p, p.R, p.R, p.podium)).toBe(true); // square corners at the base of the shaft
    expect(insideTower(p, p.R, p.R, p.roof - 1)).toBe(false);
    expect(insideTower(p, p.R, 0, p.roof - 1)).toBe(true); // diamond tips at the face centres
    expect(insideTower(p, p.R, 1, p.roof - 1)).toBe(false);
    const mid = Math.round((p.podium + p.roof) / 2);
    expect(insideTower(p, p.R, p.R, mid)).toBe(false);
    expect(insideTower(p, p.R, Math.floor(p.R / 3), mid)).toBe(true);
  });

  it('builds a sealed tower with a spire in a few seconds of ticks', () => {
    const world = new World('overworld', 1);
    for (let cx = -3; cx <= 3; cx++) for (let cz = -1; cz <= 4; cz++) world.addChunk(flatChunk(cx, cz, 64));
    const msgs: string[] = [];
    const game: any = { world, dimension: 'overworld', loading: false, player: { yaw: Math.PI }, message: (m: string) => msgs.push(m), events: { emit() {} } };
    const sys = new LandmarkSystem();
    (sys as any).game = game;
    world.setBlock(0, 64, 0, S('one_world_trade_center'));
    sys.start(0, 64, 0); // player looks toward +z (yaw PI)
    let ticks = 0, worst = 0;
    const times: number[] = [];
    const t0 = performance.now();
    while ((sys as any).jobs.length && ticks < 2000) {
      const a = performance.now();
      sys.tick(game);
      const dt = performance.now() - a;
      times.push(dt);
      worst = Math.max(worst, dt);
      ticks++;
    }
    const total = performance.now() - t0;
    const p = planTower(0, 64, 0, 0, 1)!;
    console.log(`tower R=${p.R} top=${p.top}: ${ticks} ticks, ${total.toFixed(0)} ms total, worst tick ${worst.toFixed(1)} ms; ${msgs[0]}`);
    expect((sys as any).jobs.length).toBe(0);
    expect(world.getBlock(0, 64, 0)).toBe(0); // spawner replaced by the plaza
    const name = (x: number, y: number, z: number) => BLOCKS[world.getBlock(x, y, z) >>> 4].name;
    // the tower stands along +z, centred R + 4 blocks away
    const cz = p.cz;
    expect(name(0, 64 + p.top - 1, cz)).toBe('end_rod');
    expect(name(0, 64 + p.podium - 1, cz + p.R)).toBe('fin_wall');
    expect(name(0, 64 + p.podium + 5, cz + p.R)).toBe('curtain_wall');
    expect(name(0, 63, cz)).toBe('smooth_quartz');
    // parapet: glass ring above the roof deck, open behind it
    expect(name(0, 64 + p.roof - 1, cz + p.R)).toBe('curtain_wall');
    expect(name(0, 64 + p.deck, cz + 5)).toBe('gray_concrete');
    expect(world.getBlock(0, 64 + p.deck + 1, cz + 5)).toBe(0);
    // sealed: every ring cell of every layer below the deck is solid (except the entrance)
    let holes = 0;
    for (let i = 3; i < p.deck; i++) {
      for (let u = -p.R; u <= p.R; u++) for (let w = -p.R; w <= p.R; w++) {
        if (!insideTower(p, u, w, i)) continue;
        const ring = !insideTower(p, u + 1, w, i) || !insideTower(p, u - 1, w, i) || !insideTower(p, u, w + 1, i) || !insideTower(p, u, w - 1, i);
        if (ring && world.getBlock(-u, 64 + i, cz + w) === 0) holes++;
      }
    }
    expect(holes).toBe(0);
    // robust on a busy machine: most ticks must be cheap
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length * 0.9)]).toBeLessThan(120);
  });
});
