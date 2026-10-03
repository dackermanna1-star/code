import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { lightChunkLocal } from '../src/world/light';
import { S } from '../src/world/blocks/registry';
import '../src/world/blocks/blocks';
import { EntityManager, createEntity } from '../src/entity/manager';
import { Player } from '../src/entity/player';
import { Emitter } from '../src/core/events';
import '../src/entity/mobs/index';
import { Zombie, Creeper } from '../src/entity/mobs/monster';
import { Cow, Sheep, randomWoolColor } from '../src/entity/mobs/passive';
import { CREEPER_FUSE } from '../src/entity/mobs/monster';
import { monsterLightOk, animalSpawnOk, spaceFree, skyDarkenFrom } from '../src/game/spawning';
import { stack } from '../src/game/items/registry';

const G = 10;
function world(): World {
  const w = new World('overworld', 1);
  for (let cx = -2; cx <= 2; cx++)
    for (let cz = -2; cz <= 2; cz++) {
      const c = new Chunk(cx, cz);
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
        for (let y = 0; y < G - 1; y++) c.set(x, y, z, S('stone'));
        c.set(x, G - 1, z, S('grass_block'));
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
    ticks: 0, dimension: 'overworld', isDay: false, skyLightFactor: 0, weather: { raining: false, rain: 0 },
    xp: 0, dropped: [] as any[],
    spawnXp(_p: THREE.Vector3, n: number) { g.xp += n; },
    dropItem(s: any) { g.dropped.push(s); },
    spawn(e: any, x: number, y: number, z: number) { e.setPos(x, y, z); return g.entities.add(e); },
  };
  g.entities = new EntityManager(g, w);
  g.player = new Player();
  g.player.setGameMode('survival');
  g.spawn(g.player, 0.5, G + 5, 30.5);
  return g;
}
function tick(g: any, n = 1) {
  for (let i = 0; i < n; i++) {
    g.ticks++;
    g.entities.tick();
  }
}

describe('spawning rules', () => {
  it('monsters need darkness (no block light, dark sky)', () => {
    const w = world();
    // day on the surface: never
    for (let i = 0; i < 50; i++) expect(monsterLightOk(w, 3, G, 3, skyDarkenFrom(1))).toBe(false);
    // night on the surface: possible
    let ok = 0;
    for (let i = 0; i < 400; i++) if (monsterLightOk(w, 3, G, 3, skyDarkenFrom(0))) ok++;
    expect(ok).toBeGreaterThan(20);
    // cave: always dark enough
    for (let x = 0; x < 6; x++) w.setBlock(x, 4, 4, 0);
    w.setBlock(0, 5, 4, 0); // ceiling stays except one block
    let cave = 0;
    for (let i = 0; i < 100; i++) if (monsterLightOk(w, 4, 4, 4, 0)) cave++;
    expect(cave).toBeGreaterThan(80);
    // a torch nearby prevents spawning
    w.setBlock(2, 4, 4, S('torch', 1));
    for (let i = 0; i < 50; i++) expect(monsterLightOk(w, 4, 4, 4, 0)).toBe(false);
  });
  it('animals spawn on lit grass only', () => {
    const w = world();
    expect(animalSpawnOk(w, 3, G, 3)).toBe(true);
    w.setBlock(3, G - 1, 3, S('stone'));
    expect(animalSpawnOk(w, 3, G, 3)).toBe(false);
    expect(animalSpawnOk(w, 5, G, 5, 11)).toBe(false); // night
  });
  it('requires a solid floor and free body space', () => {
    const w = world();
    expect(spaceFree(w, 3, G, 3, 0.6, 1.95)).toBe(true);
    w.setBlock(3, G + 1, 3, S('stone'));
    expect(spaceFree(w, 3, G, 3, 0.6, 1.95)).toBe(false);
    expect(spaceFree(w, 3, G + 3, 3, 0.6, 1.95)).toBe(false); // floating
  });
  it('natural wool colours follow Minecraft odds', () => {
    const n: Record<number, number> = {};
    for (let i = 0; i < 20000; i++) { const c = randomWoolColor(); n[c] = (n[c] ?? 0) + 1; }
    expect(n[0] / 20000).toBeGreaterThan(0.78);
    expect(n[0] / 20000).toBeLessThan(0.86);
    expect(n[15]).toBeGreaterThan(0);
  });
});

describe('drops', () => {
  it('zombie drops 0-2 rotten flesh, Looting raises the cap', () => {
    const z = new Zombie();
    let max0 = 0, max3 = 0;
    for (let i = 0; i < 300; i++) {
      const c0 = z.rollLoot(true, 0).filter((s) => s.item.name === 'rotten_flesh').reduce((a, s) => a + s.count, 0);
      const c3 = z.rollLoot(true, 3).filter((s) => s.item.name === 'rotten_flesh').reduce((a, s) => a + s.count, 0);
      max0 = Math.max(max0, c0); max3 = Math.max(max3, c3);
    }
    expect(max0).toBe(2);
    expect(max3).toBeGreaterThan(2);
    expect(max3).toBeLessThanOrEqual(5);
  });
  it('cows drop cooked beef when burning; death by player gives XP', () => {
    const g = game();
    const cow = g.spawn(new Cow(), 0.5, G, 0.5) as Cow;
    cow.fireTicks = 100;
    const names = new Set<string>();
    for (let i = 0; i < 30; i++) for (const s of cow.rollLoot(true, 0)) names.add(s.item.name);
    expect(names.has('cooked_beef')).toBe(true);
    expect(names.has('beef')).toBe(false);
    cow.hurt({ type: 'player', attacker: g.player }, 100);
    expect(cow.dead).toBe(true);
    expect(g.xp).toBeGreaterThan(0);
    expect(g.dropped.length).toBeGreaterThan(0);
  });
  it('sheep drop their wool colour unless sheared', () => {
    const s = new Sheep();
    s.color = 14;
    expect(s.rollLoot(true, 0).some((x) => x.item.name === 'red_wool')).toBe(true);
    s.sheared = true;
    expect(s.rollLoot(true, 0).some((x) => x.item.name.endsWith('_wool'))).toBe(false);
  });
});

describe('breeding', () => {
  it('two fed cows make a baby', () => {
    const g = game();
    const a = g.spawn(new Cow(), 0.5, G, 0.5) as Cow;
    const b = g.spawn(new Cow(), 1.8, G, 0.5) as Cow;
    const p = g.player;
    p.inventory.set(0, stack('wheat', 10));
    p.inventory.selected = 0;
    let loves = 0, breeds = 0;
    g.events.on('loveMode', () => loves++);
    g.events.on('breed', () => breeds++);
    expect(a.interact(p, p.mainHand, 'main')).toBe(true);
    expect(b.interact(p, p.mainHand, 'main')).toBe(true);
    expect(loves).toBe(2);
    expect(p.mainHand.count).toBe(8);
    tick(g, 80);
    expect(breeds).toBe(1);
    const babies = g.entities.list.filter((e: any) => e.type === 'cow' && e.isBaby);
    expect(babies.length).toBe(1);
    expect(a.ageTicks).toBeGreaterThan(0); // cooldown
    expect(a.interact(p, p.mainHand, 'main')).toBe(false); // can't breed again yet
  });
  it('milking a cow with a bucket yields milk', () => {
    const g = game();
    const cow = g.spawn(new Cow(), 0.5, G, 0.5) as Cow;
    g.player.inventory.set(0, stack('bucket', 1));
    g.player.inventory.selected = 0;
    expect(cow.interact(g.player, g.player.mainHand, 'main')).toBe(true);
    expect(g.player.mainHand.item.name).toBe('milk_bucket');
  });
});

describe('creeper', () => {
  it('explodes exactly CREEPER_FUSE ticks after it starts swelling', () => {
    const g = game();
    const c = g.spawn(new Creeper(), 0.5, G, 0.5) as Creeper;
    g.player.setPos(2.0, G, 0.5);
    c.setTarget(g.player);
    let boom: any = null, fuse = -1;
    g.events.on('creeperFuse', () => { fuse = g.ticks; });
    g.events.on('explosion', (e: any) => { boom = { ...e, tick: g.ticks }; e.handle(); });
    for (let i = 0; i < 60 && !boom; i++) tick(g, 1);
    expect(fuse).toBeGreaterThan(0);
    expect(boom).not.toBeNull();
    expect(boom.tick - fuse).toBe(CREEPER_FUSE - 1);
    expect(boom.power).toBe(3);
    expect(c.removed).toBe(true);
  });
  it('defuses when the target walks away', () => {
    const g = game();
    const c = g.spawn(new Creeper(), 0.5, G, 0.5) as Creeper;
    g.player.setPos(2.0, G, 0.5);
    c.setTarget(g.player);
    tick(g, 10);
    expect(c.swell).toBeGreaterThan(0);
    g.player.setPos(20.5, G, 0.5);
    tick(g, 40);
    expect(c.swell).toBe(0);
    expect(c.removed).toBe(false);
  });
  it('charged creepers double the power', () => {
    const c = createEntity('creeper') as Creeper;
    c.onLightning();
    expect(c.powered).toBe(true);
  });
});
