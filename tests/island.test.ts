/**
 * Tropical island world type: generator contracts (deterministic, island in an endless ocean,
 * beaches, lagoon, reef corals, palms, camp at the spawn) and the island wildlife.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createGenerator } from '../src/world/gen/index';
import { IslandGenerator, IslandShape, SEA, IB } from '../src/world/gen/island/island';
import { palm } from '../src/world/gen/island/palms';
import { ChunkWriter } from '../src/world/gen/common/writer';
import { BLOCKS, S } from '../src/world/blocks/registry';
import { BIOMES } from '../src/world/biomes';
import '../src/world/blocks/blocks';
import { blockAt } from './worldgen.helpers';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { lightChunkLocal } from '../src/world/light';
import { EntityManager, createEntity } from '../src/entity/manager';
import { Player } from '../src/entity/player';
import { Emitter } from '../src/core/events';
import '../src/entity/mobs/index';
import { ISLAND_SPAWNS } from '../src/game/spawning';
import type { Snake, Parrot, Crab } from '../src/entity/mobs/island';
import { getModelDef } from '../src/entity/models/defs/index';

const NAME = (s: number) => BLOCKS[s >>> 4]?.name ?? '?';

describe('island generator', { timeout: 120_000 }, () => {
  const g = createGenerator('overworld', 123, 'island') as IslandGenerator;

  it('is the island generator, deterministic per chunk', () => {
    expect(g).toBeInstanceOf(IslandGenerator);
    const a = g.generate(3, -7), b = new IslandGenerator(123).generate(3, -7);
    for (let s = 0; s < 16; s++) expect(a.blocks[s] ? Array.from(a.blocks[s]!) : null).toEqual(b.blocks[s] ? Array.from(b.blocks[s]!) : null);
    expect(Array.from(a.biomes)).toEqual(Array.from(b.biomes));
  });

  it('a big island surrounded by ocean in every direction', () => {
    const sh = new IslandShape(123);
    let land = 0;
    for (let x = -600; x <= 600; x += 20) for (let z = -600; z <= 600; z += 20) if (sh.heightAt(x, z) >= SEA) land++;
    // a few hundred metres across at least
    expect(land * 400).toBeGreaterThan(150_000);
    // nothing but deep ocean far away
    for (const [x, z] of [[3000, 0], [0, -3000], [-2500, 2500], [6000, 6000]]) {
      expect(sh.heightAt(x, z)).toBeLessThan(SEA - 20);
      expect(sh.biomeAt(x, z)).toBe(IB.ocean);
    }
    // the volcano is the high point, with a crater lake
    expect(sh.rawHeight(sh.vx + 60, sh.vz)).toBeGreaterThan(SEA + 50);
    expect(sh.lakeY).toBeGreaterThan(SEA + 20);
  });

  it('beaches of sand meet the lagoon, reefs carry corals, the land has palms and jungle', () => {
    const counts: Record<string, number> = {};
    let sandAtShore = 0, shore = 0;
    for (let cz = -32; cz < 32; cz += 3)
      for (let cx = -32; cx < 32; cx += 3) {
        const ch = g.generate(cx, cz);
        for (let c = 0; c < 256; c++) {
          const b = BIOMES[ch.biomes[c]].name;
          counts[b] = (counts[b] ?? 0) + 1;
          const top = ch.heightmap[c] - 1;
          if (b === 'tropical_beach') { shore++; if (NAME(blockAt(ch, c & 15, top, c >> 4)) === 'sand' || NAME(blockAt(ch, c & 15, top, c >> 4)) === 'jungle_log' || NAME(blockAt(ch, c & 15, top, c >> 4)).endsWith('leaves')) sandAtShore++; }
          for (let y = 40; y < 140; y++) {
            const n = NAME(blockAt(ch, c & 15, y, c >> 4));
            if (n.endsWith('_coral_block') || n.endsWith('_coral') || n.endsWith('_coral_fan')) counts.coral = (counts.coral ?? 0) + 1;
            if (n === 'jungle_log') counts.logs = (counts.logs ?? 0) + 1;
          }
        }
      }
    for (const b of ['tropical_ocean', 'tropical_lagoon', 'tropical_beach', 'palm_grove', 'jungle', 'volcanic_peak']) expect(counts[b] ?? 0, b).toBeGreaterThan(0);
    expect(sandAtShore / shore).toBeGreaterThan(0.8);
    expect(counts.coral ?? 0).toBeGreaterThan(20);
    expect(counts.logs ?? 0).toBeGreaterThan(50);
  });

  it('spawns on dry ground at the castaway camp, facing the sea; camp and wreck chests exist', () => {
    const s = g.findSpawn();
    expect(s.y).toBeGreaterThanOrEqual(SEA);
    expect(Math.hypot(s.x - g.camp.x, s.z - g.camp.z)).toBeLessThan(12);
    const f = { x: -Math.sin(s.yaw), z: -Math.cos(s.yaw) };
    // looking from the island centre outward
    expect(f.x * s.x + f.z * s.z).toBeGreaterThan(0);
    const chests: string[] = [];
    for (let cx = Math.floor(g.camp.x / 16) - 3; cx <= Math.floor(g.camp.x / 16) + 3; cx++)
      for (let cz = Math.floor(g.camp.z / 16) - 3; cz <= Math.floor(g.camp.z / 16) + 3; cz++)
        for (const be of g.generate(cx, cz).blockEntities ?? []) if ((be.data as any).type === 'chest') chests.push((be.data as any).lootTable);
    expect(chests.some((t) => t.includes('shipwreck_supply'))).toBe(true);
    expect(chests.some((t) => t.includes('shipwreck_treasure'))).toBe(true);
  });

  it('palms: a connected leaning trunk under a crown of fronds', () => {
    const w = new ChunkWriter();
    const work = new Uint16Array(65536);
    for (let seed = 1; seed < 30; seed++) {
      work.fill(0);
      w.reset(0, 0, work);
      palm(w, 8, 70, 8, seed);
      const logs: [number, number, number][] = [];
      let leaves = 0;
      for (let y = 70; y < 90; y++) for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
        const n = NAME(work[(y << 8) | (z << 4) | x]);
        if (n === 'jungle_log') logs.push([x, y, z]);
        if (n === 'palm_leaves') leaves++;
      }
      expect(logs.length).toBeGreaterThanOrEqual(7);
      expect(leaves).toBeGreaterThan(20);
      // every log touches another log (face-adjacent): the trunk never breaks
      for (const [x, y, z] of logs) {
        if (y === 70 && x === 8 && z === 8) continue;
        const n = logs.some(([a, b, c]) => Math.abs(a - x) + Math.abs(b - y) + Math.abs(c - z) === 1);
        expect(n).toBe(true);
      }
    }
  });

  it('normal worlds are unchanged by the world type option', () => {
    const a = createGenerator('overworld', 99).generate(0, 0), b = createGenerator('overworld', 99, 'default').generate(0, 0);
    expect(Array.from(a.heightmap)).toEqual(Array.from(b.heightmap));
  });
});

// ------------------------------------------------------------------------------- wildlife
const G = 10;
function world(ground = 'sand'): World {
  const w = new World('overworld', 1, 'island');
  for (let cx = -2; cx <= 2; cx++)
    for (let cz = -2; cz <= 2; cz++) {
      const c = new Chunk(cx, cz);
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
        for (let y = 0; y < G - 1; y++) c.set(x, y, z, S('stone'));
        c.set(x, G - 1, z, S(ground));
        c.heightmap[z * 16 + x] = G;
      }
      lightChunkLocal(c);
      c.status = 'ready';
      w.addChunk(c);
    }
  return w;
}
function game(w = world()) {
  const g: any = {
    world: w, events: new Emitter<any>(), difficulty: 'normal', gamerules: { doMobLoot: true, mobGriefing: true, doMobSpawning: true },
    ticks: 0, dimension: 'overworld', isDay: true, skyLightFactor: 1, weather: { raining: false, rain: 0 },
    spawnXp() {}, dropItem() {},
    spawn(e: any, x: number, y: number, z: number) { e.setPos(x, y, z); return g.entities.add(e); },
  };
  g.entities = new EntityManager(g, w);
  g.player = new Player();
  g.player.setGameMode('survival');
  g.spawn(g.player, 0.5, G, 30.5);
  return g;
}
function run(g: any, ticks: number) {
  for (let i = 0; i < ticks; i++) {
    g.ticks++;
    g.entities.tick();
    for (let k = 0; k < 3; k++) g.entities.physics(1 / 60);
  }
}

describe('island wildlife', { timeout: 60_000 }, () => {
  it('spawn tables only use registered creatures and island biomes', () => {
    for (const e of ISLAND_SPAWNS) {
      expect(createEntity(e.type), e.type).toBeTruthy();
      for (const b of e.biomes) expect(BIOMES.some((x) => x.name === b), b).toBe(true);
    }
    for (const [m, v] of [['crab', ''], ['snake', 'green'], ['snake', 'banded'], ['snake', 'python'], ['parrot', 'scarlet'], ['parrot', 'grey'], ['sea_turtle', '']]) {
      const d = getModelDef(m, v);
      expect(d.bones.length).toBeGreaterThan(3);
      expect(d.prims.length).toBeGreaterThan(5);
    }
  });

  it('a snake you walk up to warns, then bites with venom, then backs off', () => {
    const g = game(world('grass_block'));
    const s = createEntity('snake') as Snake;
    g.spawn(s, 0.5, G, 0.5);
    g.player.setPos(0.5, G, 4.5);
    run(g, 30);
    expect(s.warning).toBe(true);
    g.player.setPos(0.5, G, 1.3);
    let poisoned = false;
    for (let i = 0; i < 200 && !poisoned; i++) { run(g, 1); poisoned = (g.player as any).hasEffect?.('poison') ?? false; g.player.setPos(0.5, G, 1.3); }
    expect(poisoned).toBe(true);
    expect(s.calm).toBeGreaterThan(0);
  });

  it('sneaking past a snake does not provoke it', () => {
    const g = game(world('grass_block'));
    const s = createEntity('snake') as Snake;
    g.spawn(s, 0.5, G, 0.5);
    g.player.setPos(0.5, G, 3.5);
    (g.player as any).sneaking = true;
    run(g, 40);
    expect(s.warning).toBe(false);
    expect(s.target).toBeNull();
  });

  it('crabs raise their claws at a close player and pinch back when hit', () => {
    const g = game();
    const c = createEntity('crab') as Crab;
    g.spawn(c, 0.5, G, 0.5);
    g.player.setPos(0.5, G, 2.5);
    run(g, 20);
    expect(c.threat).toBe(true);
    c.hurt({ type: 'player', attacker: g.player, entity: g.player } as any, 1);
    run(g, 5);
    expect(c.target).toBe(g.player);
  });

  it('a perched parrot takes flight when approached and lands again somewhere', () => {
    const g = game();
    const p = createEntity('parrot') as Parrot;
    g.spawn(p, 0.5, G, 0.5);
    g.player.setPos(0.5, G, 2.5);
    run(g, 10);
    expect(p.flying).toBe(true);
    let maxY = 0;
    g.player.setPos(60.5, G, 60.5);
    for (let i = 0; i < 1200 && p.flying; i++) { run(g, 1); maxY = Math.max(maxY, p.pos.y); }
    expect(maxY).toBeGreaterThan(G + 2);
    expect(p.flying).toBe(false);
    expect(p.pos.y).toBeGreaterThanOrEqual(G - 0.1);
    expect(p.pos.distanceTo(new THREE.Vector3(0.5, G, 0.5))).toBeGreaterThan(3);
  });
});
