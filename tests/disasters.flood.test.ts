import { describe, it, expect } from 'vitest';
import '../src/world/blocks/blocks';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { lightChunkLocal } from '../src/world/light';
import { S, BLOCKS } from '../src/world/blocks/registry';
import { DisasterFx } from '../src/game/disasters/kit';
import { planWave, toLocal, toWorld, frontStart, advanceFront, arrivalTime, floodLevel, profileAt, solveBasins, packOrder, taper, S_CREST, S_LIP } from '../src/game/disasters/flood/wave';
import { Tsunami, RECEDE_S, DRAIN_S } from '../src/game/disasters/tsunami';

describe('tsunami wave logic', () => {
  it('comes from the facing direction toward the placement', () => {
    const p = planWave(10, 20, 0, -1, 62, 1);
    expect(p.dz).toBeCloseTo(1);
    expect(p.dx).toBeCloseTo(0);
    // the start is out in the facing direction
    const [sx, sz] = toWorld(p, p.sStart, 0);
    expect(sx).toBeCloseTo(10);
    expect(sz).toBeLessThan(20 - 100);
    const [s, u] = toLocal(p, 33, -7);
    const [x, z] = toWorld(p, s, u);
    expect(x).toBeCloseTo(33);
    expect(z).toBeCloseTo(-7);
    expect(p.H0).toBeGreaterThanOrEqual(20);
    expect(p.H0).toBeLessThanOrEqual(35);
  });

  it('front advances ~10 b/s at sea, slows and decays on land, then stops', () => {
    const p = planWave(0, 0, 1, 0, 62, 3);
    const f = frontStart(p);
    const coast = -10;
    let t = 0;
    let atCoast = -1, Hcoast = 0;
    while (!f.done && t < 60) {
      advanceFront(p, f, 0.05, coast);
      t += 0.05;
      if (atCoast < 0 && f.s >= coast) { atCoast = t; Hcoast = f.H; }
    }
    expect(f.done).toBe(true);
    // (coast - start) = 125 blocks at ~10 b/s with a slower emergence
    expect(atCoast).toBeGreaterThan(11);
    expect(atCoast).toBeLessThan(15);
    expect(Math.abs(arrivalTime(p, coast) - atCoast)).toBeLessThan(0.3);
    expect(Hcoast).toBeGreaterThan(p.H0 * 0.95);
    expect(f.H).toBeLessThan(3);
    expect(f.s).toBeGreaterThan(coast + 40);
    expect(f.s).toBeLessThanOrEqual(p.sMax + 1);
  });

  it('flood level: deepest at the coast, decaying inland, ramping out over the sea, none at the wave ends', () => {
    const p = planWave(0, 0, 1, 0, 62, 3);
    const H = 30;
    const atCoast = floodLevel(p, 0, 0, H, false);
    expect(atCoast - 62).toBeGreaterThanOrEqual(10);
    expect(atCoast - 62).toBeLessThanOrEqual(14);
    expect(floodLevel(p, 40, 0, H * 0.4, false)).toBeLessThan(atCoast);
    expect(floodLevel(p, 100, 0, 3, false) - 62).toBeLessThanOrEqual(3);
    expect(floodLevel(p, -10, 0, H, true)).toBeGreaterThan(62);
    expect(floodLevel(p, -30, 0, H, true)).toBe(62);
    expect(floodLevel(p, 0, 0, H * taper(p, p.halfW + 20), false)).toBe(62);
  });

  it('breaking-wave profile: back at sea level, crest at full height, lip thrown ahead of the toe', () => {
    expect(profileAt(0, 0)[1]).toBeCloseTo(0, 2);
    expect(profileAt(1, 1)[0]).toBeCloseTo(0, 2);
    expect(profileAt(1, 1)[1]).toBeCloseTo(0, 2);
    expect(profileAt(S_CREST, 0)[1]).toBeGreaterThan(0.95);
    const lip = profileAt(S_LIP, 1);
    expect(lip[0]).toBeGreaterThan(0.5);
    expect(lip[1]).toBeGreaterThan(0.4);
    // steep wave has no overhang beyond 0.25 H
    for (let s = 0; s <= 1; s += 0.02) expect(profileAt(s, 0)[0]).toBeLessThan(0.25);
  });

  it('puddles: enclosed basins keep their water, leaking ones drain', () => {
    // a row of columns 0..9; bottoms: basin 1..3 at y=5 walled by 0 and 4; basin 6..7 at y=5 open at 8
    const bottom = new Int16Array([-1, 5, 5, 5, -1, -1, 5, 5, -1, -1]);
    const walls = new Set([0, 4, 5]);
    const nb = (i: number, d: number) => (d === 0 ? (i < 9 ? i + 1 : -1) : d === 1 ? i - 1 : -1);
    // north/south (d 2,3) are solid; east/west: walls are solid, everything else leaks
    const sealed = (i: number, d: number) => d >= 2 || walls.has(d === 0 ? i + 1 : i - 1);
    const keep = solveBasins(10, bottom, nb, sealed);
    expect([...keep].map((k, i) => (k ? i : -1)).filter((i) => i >= 0)).toEqual([1, 2, 3]);
    // different heights do not hold each other
    const keep2 = solveBasins(10, new Int16Array([-1, 5, 6, 5, -1, -1, -1, -1, -1, -1]), nb, (i, d) => d >= 2 || walls.has(d === 0 ? i + 1 : i - 1));
    expect(keep2[1]).toBe(0);
  });

  it('orders columns by arrival with a native sort', () => {
    const k = new Float32Array([5.5, -100.25, 3, 3, 120, -7]);
    expect([...packOrder(k)]).toEqual([1, 5, 2, 3, 0, 4]);
  });
});

// --------------------------------------------------------------------------- full run
const SEA = 62;
/** Coast at z = -10: sea floor 54 for z < -10, a sand beach, then grass land rising inland. */
function column(x: number, z: number): { top: number; blocks: string[] } {
  if (z < -10) {
    const floor = z < -30 ? 50 : 58;
    const b: string[] = [];
    for (let y = 0; y <= SEA; y++) b.push(y <= floor ? (y === floor ? 'sand' : 'stone') : 'water');
    return { top: SEA, blocks: b };
  }
  const g = SEA + Math.floor((z + 10) / 14);
  const b: string[] = [];
  for (let y = 0; y <= g; y++) b.push(y === g ? (z < 4 ? 'sand' : 'grass_block') : y >= g - 3 ? (z < 4 ? 'sand' : 'dirt') : 'stone');
  // a 3x3 basin one block deep at (20, 30)
  if (Math.abs(x - 20) <= 1 && Math.abs(z - 30) <= 1) b[g] = 'air';
  return { top: g, blocks: b };
}

function buildWorld() {
  const world = new World('overworld', 7);
  for (let cx = -6; cx < 6; cx++)
    for (let cz = -11; cz < 9; cz++) {
      const c = new Chunk(cx, cz);
      for (let lx = 0; lx < 16; lx++)
        for (let lz = 0; lz < 16; lz++) {
          const { blocks } = column(cx * 16 + lx, cz * 16 + lz);
          let h = 0;
          for (let y = 0; y < blocks.length; y++) if (blocks[y] !== 'air') { c.set(lx, y, lz, S(blocks[y])); h = y + 1; }
          c.heightmap[lz * 16 + lx] = h;
        }
      lightChunkLocal(c);
      c.status = 'ready';
      world.addChunk(c);
    }
  // a few trees and a glass hut on the land
  for (const [tx, tz] of [[-20, 15], [5, 25], [30, 12], [-40, 40]]) {
    const g = column(tx, tz).top;
    for (let y = g + 1; y <= g + 5; y++) world.setBlock(tx, y, tz, S('oak_log'), 0);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let y = g + 4; y <= g + 6; y++) if (dx || dz) world.setBlock(tx + dx, y, tz + dz, S('oak_leaves'), 0);
  }
  for (let x = -5; x <= -2; x++) world.setBlock(x, column(x, 8).top + 1, 8, S('glass'), 0);
  return world;
}

const name = (w: World, x: number, y: number, z: number) => BLOCKS[w.getBlock(x, y, z) >>> 4].name;

describe('tsunami disaster', () => {
  it('recedes, floods the coast destroying weak blocks, then drains leaving puddles and deposits', () => {
    const world = buildWorld();
    const player = { pos: { x: 0, y: 64, z: 0 }, vel: { x: 0, y: 0, z: 0 }, hurt() { return true; } };
    const mob = { pos: { x: 10, y: 63, z: 2 }, vel: { x: 0, y: 0, z: 0 }, hurts: 0, hurt() { this.hurts++; return true; } };
    const game: any = { world, player, entities: { list: [mob] }, events: { emit() {} }, message() {}, paused: false };
    // the player stands on the beach looking out to sea (-z)
    const t = new Tsunami({ game, x: 0, y: 63, z: 0, fx: 0, fz: -1, effects: new DisasterFx() });
    const p = t.plan;
    expect(p.seaY).toBe(SEA);
    expect(p.dz).toBeCloseTo(1);
    let ticks = 0;
    while (t.phase === 'survey' && ticks < 100) { t.tick(game); ticks++; }
    expect(t.phase).toBe('approach');
    expect(t.coastS).toBeGreaterThan(-14);
    expect(t.coastS).toBeLessThan(-6);
    // recession: shallow water by the coast is drawn down
    while (t.front.t < RECEDE_S + 0.5) { t.tick(game); ticks++; }
    expect(t.receded).toBeGreaterThan(500);
    expect(world.getBlock(0, SEA, -15)).toBe(0);
    expect(name(world, 0, SEA, -60)).toBe('water'); // deep sea untouched
    // run-up
    let maxFlood = 0;
    while (t.phase === 'approach' && ticks < 4000) {
      t.tick(game);
      ticks++;
      if (t.front.s > 20) {
        const g = column(0, 10).top;
        let y = g + 1;
        while (name(world, 0, y, 10) === 'water') y++;
        maxFlood = Math.max(maxFlood, y - 1 - g);
      }
    }
    expect(t.phase).toBe('hold');
    expect(maxFlood).toBeGreaterThanOrEqual(5);
    expect(name(world, 0, SEA, -15)).toBe('water'); // recession refilled
    // trees and glass smashed
    expect(name(world, 5, column(5, 25).top + 2, 25)).not.toBe('oak_log');
    expect(name(world, -3, column(-3, 8).top + 1, 8)).not.toBe('glass');
    expect(t.stats.destroyed).toBeGreaterThan(10);
    // entities swept inland
    expect(mob.vel.z).toBeGreaterThan(0.5);
    expect(mob.hurts).toBe(1);
    // drain
    while (t.tick(game) && ticks < 8000) ticks++;
    expect(t.phase).toBe('done');
    expect(ticks * 0.05).toBeGreaterThan(DRAIN_S);
    let left = 0;
    for (let x = -50; x <= 50; x += 2)
      for (let z = -8; z < 100; z += 2) {
        const g = column(x, z).top;
        for (let y = SEA + 1; y <= g + 15; y++) if (name(world, x, y, z) === 'water') left++;
      }
    // only puddles remain above sea level: the basin at (20,30)
    expect(name(world, 20, column(20, 30).top, 30)).toBe('water');
    expect(t.stats.puddles).toBeGreaterThanOrEqual(9);
    expect(left).toBeLessThan(80);
    expect(name(world, 0, SEA, -40)).toBe('water');
    expect(t.stats.deposits).toBeGreaterThan(50);
    console.log(`tsunami H0=${p.H0} coast=${t.coastS.toFixed(1)}: placed ${t.stats.placed}, destroyed ${t.stats.destroyed}, drained ${t.stats.drained}, puddles ${t.stats.puddles}, deposits ${t.stats.deposits}, receded ${t.receded}, maxFlood ${maxFlood}, ticks ${ticks}, worst ${t.stats.worstMs.toFixed(1)} ms`);
    expect(t.stats.worstMs).toBeLessThan(40);
    t.dispose();
  }, 120000);
});
