/**
 * Dimension-level contracts: overworld layers (bedrock, deepslate, sea level, ores by depth),
 * cheap queries vs generated chunks, spawn & structures; Nether bedrock floor/roof, lava sea, empty
 * above y = 127; End main island, spikes with crystals, unlit exit portal, outer islands.
 */
import { describe, expect, it } from 'vitest';
import { createGenerator } from '../src/world/gen/index';
import { EndGenerator } from '../src/world/gen/end/end';
import { BLOCKS } from '../src/world/blocks/registry';
import { BIOMES } from '../src/world/biomes';
import '../src/world/blocks/blocks';
import { GenWorld, blockAt } from './worldgen.helpers';

const NAME = (s: number) => BLOCKS[s >>> 4]?.name ?? '?';

describe('overworld contracts', () => {
  const g = createGenerator('overworld', 123);
  const chunks: [number, number, ReturnType<typeof g.generate>][] = [];
  for (let cz = -4; cz < 4; cz++) for (let cx = -4; cx < 4; cx++) chunks.push([cx, cz, g.generate(cx * 7, cz * 7)]);

  it('bedrock floor, deepslate below y 8, nothing natural above y 255', () => {
    for (const [, , ch] of chunks) {
      for (let c = 0; c < 256; c++) {
        expect(NAME(blockAt(ch, c & 15, 0, c >> 4))).toBe('bedrock');
        for (let y = 5; y < 8; y++) {
          const n = NAME(blockAt(ch, c & 15, y, c >> 4));
          // base stone at the bottom is deepslate (ores/tuff/fluids/caves/blobs allowed)
          expect(['stone', 'granite', 'diorite', 'andesite']).not.toContain(n);
        }
      }
    }
  });

  it('cheap queries agree with generated chunks', () => {
    for (const [cx, cz, ch] of chunks) {
      for (let c = 0; c < 256; c += 17) {
        const x = cx * 7 * 16 + (c & 15), z = cz * 7 * 16 + (c >> 4);
        expect(g.biomeAt(x, z)).toBe(ch.biomes[c]);
        const h = g.surfaceHeightAt(x, z);
        expect(h).toBeGreaterThan(0);
        expect(h).toBeLessThan(256);
      }
    }
  });

  it('oceans are filled with water up to y = 62, ores follow their height bands', () => {
    let oceanCols = 0;
    const oreY = new Map<string, number[]>();
    for (const [, , ch] of chunks) {
      for (let c = 0; c < 256; c++) {
        const top = NAME(blockAt(ch, c & 15, 62, c >> 4));
        if (BIOMES[ch.biomes[c]].category === 'ocean' && blockAt(ch, c & 15, 63, c >> 4) === 0 && (top === 'water' || top === 'ice') && NAME(blockAt(ch, c & 15, 55, c >> 4)) === 'water') oceanCols++;
        for (let y = 1; y < 256; y++) {
          const n = NAME(blockAt(ch, c & 15, y, c >> 4));
          if (n.endsWith('_ore')) {
            const key = n.replace('deepslate_', '');
            if (!oreY.has(key)) oreY.set(key, []);
            oreY.get(key)!.push(y);
          }
        }
      }
    }
    expect(oceanCols).toBeGreaterThan(100);
    const avg = (k: string) => {
      const a = oreY.get(k) ?? [];
      return a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
    };
    for (const k of ['coal_ore', 'iron_ore', 'copper_ore', 'gold_ore', 'redstone_ore', 'diamond_ore', 'lapis_ore']) expect(oreY.get(k)?.length ?? 0, k).toBeGreaterThan(0);
    expect(Math.max(...(oreY.get('diamond_ore') ?? [0]))).toBeLessThanOrEqual(24);
    expect(avg('coal_ore')).toBeGreaterThan(avg('iron_ore') - 30);
    expect(avg('diamond_ore')).toBeLessThan(avg('gold_ore'));
    expect(avg('redstone_ore')).toBeLessThan(avg('copper_ore'));
    console.log('[worldgen] ore counts (64 chunks):', [...oreY.entries()].map(([k, v]) => `${k}:${v.length}@y${Math.round(avg(k))}`).join(' '));
  });

  it('findSpawn returns dry, walkable ground with headroom', () => {
    for (const seed of [123, 1, 99]) {
      const gg = createGenerator('overworld', seed);
      const sp = gg.findSpawn();
      const w = new GenWorld(gg);
      const x = Math.floor(sp.x), z = Math.floor(sp.z);
      w.generate(Math.floor(x / 16), Math.floor(z / 16));
      const below = NAME(w.get(x, sp.y - 1, z));
      expect(['water', 'lava', 'air', 'cave_air'], `seed ${seed} below ${below}`).not.toContain(below);
      expect(below.endsWith('_leaves') || below.endsWith('_log')).toBe(false);
      for (const dy of [0, 1]) {
        const n = NAME(w.get(x, sp.y + dy, z));
        expect(['air', 'snow', 'short_grass', 'fern', 'cave_air', 'tall_grass', 'dandelion', 'poppy'].includes(n) || n.endsWith('_tulip'), `seed ${seed} head ${n}`).toBe(true);
      }
      expect(Math.hypot(sp.x, sp.z)).toBeLessThan(2000);
    }
  });

  it('structures: ruined portals are located and generated with loot chests', () => {
    const p = g.locateStructure('ruined_portal', 0, 0);
    expect(p).not.toBeNull();
    const w = new GenWorld(g);
    const cx = Math.floor(p!.x / 16), cz = Math.floor(p!.z / 16);
    let obsidian = 0, chests = 0;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const ch = w.generate(cx + dx, cz + dz);
        for (const s of ch.blocks) if (s) for (let i = 0; i < 4096; i++) if (NAME(s[i]).includes('obsidian')) obsidian++;
        chests += (ch.blockEntities ?? []).filter((b) => b.data.loot === 'ruined_portal').length;
      }
    expect(obsidian).toBeGreaterThan(5);
    expect(chests).toBe(1);
    expect(g.locateStructure('no_such_structure', 0, 0)).toBeNull();
  });
});

describe('nether contracts', () => {
  const g = createGenerator('nether', 123);
  const w = new GenWorld(g);
  for (let cz = -3; cz < 3; cz++) for (let cx = -3; cx < 3; cx++) w.generate(cx * 2, cz * 2);

  it('bedrock floor & roof, nothing above y 127, lava sea at y <= 31', () => {
    let lava = 0;
    const names = new Set<string>();
    for (const ch of w.chunks.values()) {
      for (let s = 8; s < 16; s++) expect(ch.blocks[s]).toBeNull();
      for (let c = 0; c < 256; c++) {
        expect(NAME(blockAt(ch, c & 15, 0, c >> 4))).toBe('bedrock');
        expect(NAME(blockAt(ch, c & 15, 127, c >> 4))).toBe('bedrock');
        if (NAME(blockAt(ch, c & 15, 31, c >> 4)) === 'lava') lava++;
        for (let y = 1; y < 127; y++) names.add(NAME(blockAt(ch, c & 15, y, c >> 4)));
        expect(BIOMES[ch.biomes[c]].dimension).toBe('nether');
      }
    }
    expect(lava).toBeGreaterThan(500);
    for (const n of ['netherrack', 'glowstone', 'nether_quartz_ore', 'nether_gold_ore', 'magma_block']) expect(names.has(n), n).toBe(true);
  });

  it('spawn is a safe floor', () => {
    const sp = g.findSpawn();
    const ww = new GenWorld(g);
    ww.generate(Math.floor(sp.x / 16), Math.floor(sp.z / 16));
    const x = Math.floor(sp.x), z = Math.floor(sp.z);
    expect(['air', 'lava']).not.toContain(NAME(ww.get(x, sp.y - 1, z)));
    expect(sp.y).toBeGreaterThan(31);
  });
});

describe('end contracts', () => {
  const g = new EndGenerator(123);
  const w = new GenWorld(g);
  for (let cz = -8; cz < 8; cz++) for (let cx = -8; cx < 8; cx++) w.generate(cx, cz);

  it('main island with ten crystal-topped obsidian spikes', () => {
    const crystals = [...w.chunks.values()].flatMap((c) => c.entities ?? []).filter((e) => e.type === 'end_crystal');
    expect(crystals.length).toBe(10);
    for (const c of crystals) {
      expect(NAME(w.get(Math.floor(c.x), c.y - 1, Math.floor(c.z)))).toBe('bedrock');
      expect(NAME(w.get(Math.floor(c.x), c.y - 2, Math.floor(c.z)))).toBe('obsidian');
      expect(Math.hypot(c.x, c.z)).toBeGreaterThan(36);
      expect(Math.hypot(c.x, c.z)).toBeLessThan(48);
      expect(c.y).toBeGreaterThanOrEqual(77);
      expect(c.y).toBeLessThanOrEqual(105);
    }
    const top = g.topSolid(20, 20);
    expect(top).toBeGreaterThan(50);
    expect(top).toBeLessThan(75);
    expect(g.topSolid(0, 140)).toBe(-1); // void beyond the island
  });

  it('unlit exit portal: bedrock bowl and pillar with torches, no end_portal blocks', () => {
    const y = g.portalY();
    for (let i = 0; i < 4; i++) expect(NAME(w.get(0, y + i, 0))).toBe('bedrock');
    expect(NAME(w.get(0, y + 2, 1))).toBe('torch');
    expect(NAME(w.get(3, y, 0))).toBe('bedrock');
    expect(NAME(w.get(1, y - 1, 1))).toBe('bedrock');
    expect(NAME(w.get(1, y, 1))).toBe('air');
    const portalId = BLOCKS.findIndex((b) => b.name === 'end_portal');
    let portals = 0;
    for (const ch of w.chunks.values()) for (const s of ch.blocks) if (s) for (let i = 0; i < 4096; i++) if (s[i] >>> 4 === portalId) portals++;
    expect(portals).toBe(0);
  });

  it('outer islands with chorus plants beyond 1000 blocks', () => {
    const ow = new GenWorld(g);
    let stone = 0, chorus = 0;
    const stoneId = BLOCKS.findIndex((b) => b.name === 'end_stone');
    const plantId = BLOCKS.findIndex((b) => b.name === 'chorus_plant');
    const flowerId = BLOCKS.findIndex((b) => b.name === 'chorus_flower');
    for (let cz = 64; cz < 80; cz++)
      for (let cx = 64; cx < 80; cx++) {
        const ch = ow.generate(cx, cz);
        for (const s of ch.blocks) if (s) for (let i = 0; i < 4096; i++) {
          const id = s[i] >>> 4;
          if (id === stoneId) stone++;
          else if (id === plantId || id === flowerId) chorus++;
        }
      }
    expect(stone).toBeGreaterThan(1000);
    expect(chorus).toBeGreaterThan(10);
  });
});
