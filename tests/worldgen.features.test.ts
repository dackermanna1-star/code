/**
 * Feature correctness across chunk borders: trees are complete (every planned tree's logs and leaves
 * exist in every chunk they reach), no leaves without a trunk, no trees floating over water or air,
 * heightmaps follow the contract, dungeons carry block entities.
 */
import { describe, expect, it } from 'vitest';
import { OverworldGenerator } from '../src/world/gen/overworld/overworld';
import { growTree } from '../src/world/gen/overworld/trees';
import { BLOCKS, T_LIQUID, T_OPACITY, T_SOLID } from '../src/world/blocks/registry';
import '../src/world/blocks/blocks';
import { GenWorld, RecordingWriter, blockAt } from './worldgen.helpers';

const NAME = (s: number) => BLOCKS[s >>> 4]?.name ?? '?';
const isLog = (s: number) => s > 0 && (NAME(s).endsWith('_log') || NAME(s) === 'mushroom_stem');
const isLeaf = (s: number) => s > 0 && NAME(s).endsWith('_leaves');
/** Canopy blocks of any tree-like feature (leaves and huge-mushroom caps). */
const isCanopy = (s: number) => isLeaf(s) || (s > 0 && NAME(s).endsWith('_mushroom_block'));
/** Something a trunk can stand on: a solid, non-leaf, non-fluid, non-log block. */
const supports = (s: number) => s > 0 && T_SOLID[s >>> 4] === 1 && T_LIQUID[s >>> 4] === 0 && !isLeaf(s) && !isLog(s) && !NAME(s).endsWith('_mushroom_block');

// forest-heavy windows for seed 123 (centre chunk) — jungle on the coast, dark forest with huge
// mushrooms, old growth taiga with mega spruces, cherry grove, savanna with acacias, swamp
const WINDOWS: [number, number][] = [
  [25, -26],
  [-8, -23],
  [-9, -6],
  [-9, -33],
  [12, -18],
  [39, -29],
];

describe('worldgen trees and features', () => {
  const gen = new OverworldGenerator(123);
  const world = new GenWorld(gen);
  // generate 5x5 windows in a scrambled order so neighbours are generated before/after each other
  for (const [wx, wz] of WINDOWS) {
    const coords: [number, number][] = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) coords.push([wx + dx, wz + dz]);
    coords.sort((a, b) => ((a[0] * 7919 + a[1] * 104729) & 15) - ((b[0] * 7919 + b[1] * 104729) & 15));
    for (const [cx, cz] of coords) world.generate(cx, cz);
  }

  it('every planned tree is fully present in all chunks it reaches (cross-border completeness)', () => {
    let trees = 0, crossing = 0, checked = 0;
    const missing: string[] = [];
    for (const [wx, wz] of WINDOWS) {
      for (let sz = wz - 1; sz <= wz + 1; sz++)
        for (let sx = wx - 1; sx <= wx + 1; sx++) {
          for (const t of gen.debugTrees(sx, sz)) {
            trees++;
            const rec = new RecordingWriter();
            growTree(t.kind, rec, t.x, t.y, t.z, t.seed);
            let crosses = false;
            for (const [k, s] of rec.blocks) {
              if (!(isLog(s) || isCanopy(s))) continue; // vines/dirt depend on terrain
              const [x, y, z] = k.split(',').map(Number);
              if (!world.has(x, z)) continue;
              if (Math.floor(x / 16) !== sx || Math.floor(z / 16) !== sz) crosses = true;
              checked++;
              const got = world.get(x, y, z);
              // the block must be occupied (terrain, another tree or this tree); a log must stay a log
              // unless terrain was there first
              if (got === 0) missing.push(`${NAME(s)} of tree@${t.x},${t.y},${t.z} missing at ${x},${y},${z}`);
            }
            if (crosses) crossing++;
          }
        }
    }
    expect(trees).toBeGreaterThan(100);
    expect(crossing).toBeGreaterThan(20);
    expect(missing.slice(0, 10)).toEqual([]);
    console.log(`[worldgen] trees checked: ${trees} (${crossing} crossing chunk borders), ${checked} blocks verified`);
  });

  it('no leaves without a nearby trunk, no trunks floating over water or air', () => {
    let leaves = 0, orphan = 0, components = 0;
    const floating: string[] = [];
    for (const [wx, wz] of WINDOWS) {
      const x0 = (wx - 1) * 16, z0 = (wz - 1) * 16, x1 = x0 + 47, z1 = z0 + 47;
      // BFS distance from logs through leaves (like Minecraft leaf decay distance, max 7 for big trees)
      const dist = new Map<string, number>();
      const queue: [number, number, number, number][] = [];
      for (let x = x0 - 16; x <= x1 + 16; x++)
        for (let z = z0 - 16; z <= z1 + 16; z++)
          for (let y = 50; y < 256; y++) if (isLog(world.get(x, y, z))) queue.push([x, y, z, 0]);
      for (const q of queue) dist.set(`${q[0]},${q[1]},${q[2]}`, 0);
      for (let i = 0; i < queue.length; i++) {
        const [x, y, z, d] = queue[i];
        if (d >= 8) continue;
        for (const [ax, ay, az] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const nx = x + ax, ny = y + ay, nz = z + az;
          const k = `${nx},${ny},${nz}`;
          if (dist.has(k)) continue;
          if (!isLeaf(world.get(nx, ny, nz))) continue;
          dist.set(k, d + 1);
          queue.push([nx, ny, nz, d + 1]);
        }
      }
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++)
          for (let y = 50; y < 256; y++) {
            const s = world.get(x, y, z);
            if (!isLeaf(s)) continue;
            leaves++;
            if (!dist.has(`${x},${y},${z}`)) orphan++;
          }
      // log components (26-connected): the lowest log of each must stand on soil or a log
      const seen = new Set<string>();
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++)
          for (let y = 1; y < 255; y++) {
            if (!isLog(world.get(x, y, z)) || seen.has(`${x},${y},${z}`)) continue;
            components++;
            const stack: [number, number, number][] = [[x, y, z]];
            seen.add(`${x},${y},${z}`);
            let grounded = false;
            for (let i = 0; i < stack.length; i++) {
              const [px, py, pz] = stack[i];
              const below = world.get(px, py - 1, pz);
              if (supports(below)) grounded = true;
              for (let ax = -1; ax <= 1; ax++)
                for (let ay = -1; ay <= 1; ay++)
                  for (let az = -1; az <= 1; az++) {
                    const k = `${px + ax},${py + ay},${pz + az}`;
                    if (seen.has(k)) continue;
                    const s = world.get(px + ax, py + ay, pz + az);
                    if (!isLog(s)) continue;
                    seen.add(k);
                    stack.push([px + ax, py + ay, pz + az]);
                  }
            }
            if (!grounded) floating.push(`log component at ${x},${y},${z} (${stack.length} logs)`);
          }
    }
    console.log(`[worldgen] leaves ${leaves}, orphan ${orphan}, log components ${components}, floating ${floating.length}`);
    expect(leaves).toBeGreaterThan(1000);
    expect(orphan).toBe(0);
    expect(floating.slice(0, 10)).toEqual([]);
  });

  it('heightmap = highest light-blocking or liquid block + 1', () => {
    for (const ch of world.chunks.values()) {
      for (let c = 0; c < 256; c++) {
        let h = 0;
        for (let y = 255; y >= 0; y--) {
          const s = blockAt(ch, c & 15, y, c >> 4);
          const id = s >>> 4;
          if (s !== 0 && (T_OPACITY[id] > 0 || T_LIQUID[id] > 0) && NAME(s) !== 'cave_air') {
            h = y + 1;
            break;
          }
        }
        expect(ch.heightmap[c]).toBe(h);
      }
    }
  });

  it('dungeons have spawner/chest block entities matching their blocks', () => {
    const g = new OverworldGenerator(123);
    let spawners = 0, chests = 0;
    for (let cz = -6; cz < 6; cz++)
      for (let cx = -6; cx < 6; cx++) {
        const ch = g.generate(cx, cz);
        for (const be of ch.blockEntities ?? []) {
          const s = blockAt(ch, be.x - cx * 16, be.y, be.z - cz * 16);
          if (be.data.type === 'spawner') {
            spawners++;
            expect(NAME(s)).toBe('spawner');
            expect(['zombie', 'skeleton', 'spider']).toContain(be.data.mob);
          } else if (be.data.type === 'chest') {
            chests++;
            expect(NAME(s)).toBe('chest');
            expect(['dungeon', 'ruined_portal']).toContain(be.data.loot);
          }
        }
      }
    console.log(`[worldgen] 144 chunks: ${spawners} dungeon spawners, ${chests} chests`);
    expect(spawners).toBeGreaterThan(0);
  });

  it('biome colours are blended and valid', () => {
    for (const ch of world.chunks.values()) {
      for (let c = 0; c < 256; c++) {
        expect(ch.grassColor[c]).toBeGreaterThan(0);
        expect(ch.grassColor[c]).toBeLessThanOrEqual(0xffffff);
        expect(ch.waterColor[c]).toBeGreaterThan(0);
      }
    }
  });
});
