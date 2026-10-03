/**
 * Mob spawning & lifecycle system (Minecraft 1.18+ rules, overworld):
 *  - monsters: block light 0 and dark enough (sky light minus night darkening <= 0..7), packs of
 *    up to 4, 24..128 blocks from the player, every tick, capped at 70 per 289 loaded chunks;
 *  - passive animals: on grass with light > 8, at chunk generation (10% of new chunks) and every
 *    400 ticks (cap 10 per 289 chunks);
 *  - despawning: monsters > 128 blocks instantly, > 32 randomly after 30 s idle; Peaceful removes
 *    monsters; `gamerules.doMobSpawning` gates natural spawning.
 *  - debug URL params: `summon=zombie,cow,...&summonDist=5`, `freeze=1` (no AI),
 *    `mobpose=walk|run|attack`, `difficulty=normal`.
 */
import * as THREE from 'three';
import type { Game } from './game';
import type { GameSystem } from './systems';
import type { World } from '../world/world';
import { createEntity } from '../entity/manager';
import { Mob, MOB_FLAGS } from '../entity/mobs/mob';
import { MONSTERS, CREATURES } from '../entity/mobs/index';
import { BLOCKS, T_FULL_CUBE, T_LIQUID, T_SOLID } from '../world/blocks/registry';
import { BIOMES } from '../world/biomes';
import { Zombie } from '../entity/mobs/monster';
import { chunkKey } from '../core/math';
import { pendingTextures } from '../entity/models/textures';

type Weighted = { type: string; weight: number; min: number; max: number };
const MONSTER_LIST: Weighted[] = [
  { type: 'spider', weight: 100, min: 4, max: 4 },
  { type: 'zombie', weight: 95, min: 4, max: 4 },
  { type: 'skeleton', weight: 100, min: 4, max: 4 },
  { type: 'creeper', weight: 100, min: 4, max: 4 },
];
const CREATURE_LIST: Weighted[] = [
  { type: 'sheep', weight: 12, min: 4, max: 4 },
  { type: 'pig', weight: 10, min: 4, max: 4 },
  { type: 'chicken', weight: 10, min: 4, max: 4 },
  { type: 'cow', weight: 8, min: 4, max: 4 },
];
const NO_ANIMALS = new Set(['ocean', 'river', 'beach', 'desert', 'badlands', 'mushroom', 'underground', 'nether', 'the_end']);
const SIZES: Record<string, [number, number]> = { zombie: [0.6, 1.95], skeleton: [0.6, 1.99], creeper: [0.6, 1.7], spider: [1.4, 0.9], cow: [0.9, 1.4], pig: [0.9, 0.9], sheep: [0.9, 1.3], chicken: [0.4, 0.7] };

// ------------------------------------------------------------------------- pure rules (tested)
/** Night darkening of sky light (0 day .. 11 night) from the sky brightness factor. */
export function skyDarkenFrom(factor: number): number {
  return Math.round((1 - Math.max(0, Math.min(1, factor))) * 11);
}

/** Minecraft 1.18 isDarkEnoughToSpawn (overworld). */
export function monsterLightOk(w: World, x: number, y: number, z: number, skyDarken: number, rand = Math.random): boolean {
  const sky = w.getSkyLight(x, y, z);
  if (sky > Math.floor(rand() * 32)) return false;
  const block = w.getBlockLight(x, y, z);
  if (block > 0) return false;
  const raw = Math.max(sky - skyDarken, block);
  return raw <= Math.floor(rand() * 8);
}

/** Animals: on grass, raw light > 8. */
export function animalSpawnOk(w: World, x: number, y: number, z: number, skyDarken = 0): boolean {
  const below = BLOCKS[w.getBlock(x, y - 1, z) >>> 4]?.name;
  if (below !== 'grass_block') return false;
  const raw = Math.max(w.getSkyLight(x, y, z) - skyDarken, w.getBlockLight(x, y, z));
  return raw > 8;
}

/** Solid full floor, and free space for the body (no collision, no liquid). */
export function spaceFree(w: World, x: number, y: number, z: number, width: number, height: number, inWater = false): boolean {
  const below = w.getBlock(x, y - 1, z);
  if (!inWater && !(below && T_FULL_CUBE[below >>> 4])) return false;
  const r = width > 1 ? 1 : 0;
  for (let dx = 0; dx <= r; dx++)
    for (let dz = 0; dz <= r; dz++)
      for (let yy = y; yy < y + Math.ceil(height); yy++) {
        const st = w.getBlock(x + dx, yy, z + dz);
        if (st === 0) continue;
        if (T_SOLID[st >>> 4] && BLOCKS[st >>> 4].shape !== 'cross') return false;
        if (T_LIQUID[st >>> 4] && !inWater) return false;
      }
  return true;
}

function pick(list: Weighted[], rand = Math.random): Weighted | null {
  let t = 0;
  for (const e of list) t += e.weight;
  let r = rand() * t;
  for (const e of list) if ((r -= e.weight) < 0) return e;
  return list[list.length - 1] ?? null;
}

// ------------------------------------------------------------------------- system
export class MobSpawningSystem implements GameSystem {
  readonly name = 'mobSpawning';
  private game!: Game;
  private populated = new Map<string, Set<number>>();
  private summonDone = false;
  private summonList: string[] = [];
  private summonHold = false;

  async init(game: Game) {
    this.game = game;
    // install the visual catalog (rigs, animators) — browser only
    await import('../entity/models/register');
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
    if (q.has('freeze')) MOB_FLAGS.freeze = q.get('freeze') !== '0';
    if (q.has('mobpose')) MOB_FLAGS.pose = q.get('mobpose') ?? '';
    this.summonList = (q.get('summon') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const dist = Number(q.get('summonDist') ?? 5);
    const diff = q.get('difficulty');
    game.events.on('worldReady', () => {
      if (diff) game.difficulty = diff as any;
      if (this.summonList.length && !this.summonDone) {
        this.summonDone = true;
        if (!diff && this.summonList.some((t) => MONSTERS.includes(t))) game.difficulty = 'normal';
        this.summon(this.summonList, dist);
        this.summonHold = true;
      }
    });
    game.events.on('chunkReady', ({ chunk }: any) => this.populateChunk(chunk.cx, chunk.cz));
    game.events.on('lightningStrike', ({ pos }: any) => {
      for (const e of game.entities?.list ?? []) if ((e as any).onLightning && e.pos.distanceTo(pos) < 4) (e as any).onLightning();
    });
  }

  onWorldChange() {
    this.summonHold = false;
  }

  /** Place mobs in a line in front of the player, facing it. */
  summon(types: string[], dist: number) {
    const g = this.game, p = g.player;
    const f = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    const spacing = 1.7;
    types.forEach((t, i) => {
      const [type, variant] = t.split(':');
      const e = createEntity(type);
      if (!(e instanceof Mob)) return;
      const off = (i - (types.length - 1) / 2) * spacing;
      const x = p.pos.x + f.x * dist + right.x * off, z = p.pos.z + f.z * dist + right.z * off;
      const y = this.groundY(Math.floor(x), Math.floor(z), Math.floor(p.pos.y));
      e.persistenceRequired = true;
      if (variant === 'baby') (e as any).setBaby?.(true) ?? (e as any).setBabyZombie?.(true);
      g.spawn(e, x, y, z);
      e.yaw = e.bodyYaw = e.prevBodyYaw = e.headYawW = e.targetYaw = Math.atan2(-(p.pos.x - x), -(p.pos.z - z));
      g.events.emit('mobSpawn', { entity: e, reason: 'summon' });
    });
  }

  private groundY(x: number, z: number, near: number): number {
    const w = this.game.world;
    for (let y = Math.min(250, near + 8); y > 1; y--) {
      const st = w.getBlock(x, y - 1, z);
      if (st && T_FULL_CUBE[st >>> 4] && !w.getBlock(x, y, z) && !w.getBlock(x, y + 1, z)) return y;
    }
    return w.getHeight(x, z);
  }

  update(game: Game) {
    // debug summon: hold the "frame counter" of screenshot runs until mob textures are painted
    if (this.summonHold) {
      if (pendingTextures() > 0) game.loading = true;
      else this.summonHold = false;
    }
  }

  tick(game: Game) {
    const g = game;
    if (!g.world || !g.player) return;
    this.despawn(g);
    if (!g.gamerules.doMobSpawning || g.dimension !== 'overworld') return;
    const counts = { monster: 0, creature: 0 };
    for (const e of g.entities.list) {
      if (!(e instanceof Mob) || e.removed) continue;
      if (e.category === 'monster') counts.monster++;
      else if (e.category === 'creature') counts.creature++;
    }
    const chunks = this.spawnableChunks(g);
    const scale = chunks.length / 289;
    if (g.difficulty !== 'peaceful' && counts.monster < 70 * scale) {
      for (let i = 0; i < 4; i++) this.spawnCycle(g, chunks, MONSTER_LIST, true);
    }
    if (g.ticks % 400 === 0 && counts.creature < 10 * scale) {
      for (let i = 0; i < 4; i++) this.spawnCycle(g, chunks, CREATURE_LIST, false);
    }
  }

  private spawnableChunks(g: Game): [number, number][] {
    const out: [number, number][] = [];
    const pcx = Math.floor(g.player.pos.x) >> 4, pcz = Math.floor(g.player.pos.z) >> 4;
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) if (g.world.getChunk(pcx + dx, pcz + dz)) out.push([pcx + dx, pcz + dz]);
    return out;
  }

  /** One NaturalSpawner attempt in a random spawnable chunk. */
  private spawnCycle(g: Game, chunks: [number, number][], list: Weighted[], monsters: boolean) {
    if (!chunks.length) return;
    const [cx, cz] = chunks[Math.floor(Math.random() * chunks.length)];
    const w = g.world;
    const x0 = cx * 16 + Math.floor(Math.random() * 16), z0 = cz * 16 + Math.floor(Math.random() * 16);
    const top = w.getHeight(x0, z0) + 1;
    const y0 = monsters ? 1 + Math.floor(Math.random() * Math.max(1, top)) : top;
    const st = w.getBlock(x0, y0, z0);
    if (st && T_FULL_CUBE[st >>> 4]) return;
    const darken = skyDarkenFrom(g.skyLightFactor);
    const p = g.player.pos;
    let entry: Weighted | null = null;
    let packLeft = 0;
    for (let group = 0; group < 3; group++) {
      let x = x0, z = z0;
      for (let k = 0; k < 4; k++) {
        x += Math.floor(Math.random() * 6) - Math.floor(Math.random() * 6);
        z += Math.floor(Math.random() * 6) - Math.floor(Math.random() * 6);
        const y = monsters ? y0 : w.getHeight(x, z);
        const d2 = (x + 0.5 - p.x) ** 2 + (y - p.y) ** 2 + (z + 0.5 - p.z) ** 2;
        if (d2 < 24 * 24 || d2 > 128 * 128) continue;
        if (!w.isLoaded(x, z)) continue;
        const biome = BIOMES[w.getBiome(x, z)];
        if (!monsters && NO_ANIMALS.has(biome?.category ?? '')) continue;
        if (!entry) { entry = pick(list); if (!entry) return; packLeft = entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1)); }
        const [wd, ht] = SIZES[entry.type] ?? [0.6, 1.8];
        if (!spaceFree(w, x, y, z, wd, ht)) continue;
        if (monsters ? !monsterLightOk(w, x, y, z, darken) : !animalSpawnOk(w, x, y, z, darken)) continue;
        if (this.spawnOne(g, entry.type, x + 0.5, y, z + 0.5, 'natural') && --packLeft <= 0) return;
      }
    }
  }

  spawnOne(g: Game, type: string, x: number, y: number, z: number, reason: string): Mob | null {
    const e = createEntity(type);
    if (!(e instanceof Mob)) return null;
    e.yaw = e.bodyYaw = e.headYawW = e.targetYaw = Math.random() * Math.PI * 2;
    if (e instanceof Zombie) e.finalizeSpawn();
    if (reason === 'chunk') e.persistenceRequired = false;
    g.spawn(e, x, y, z);
    g.events.emit('mobSpawn', { entity: e, reason });
    return e;
  }

  /** Animals at chunk generation (once per chunk, remembered in the save). */
  private populateChunk(cx: number, cz: number) {
    const g = this.game;
    if (!g?.world || g.dimension !== 'overworld') return;
    let set = this.populated.get(g.dimension);
    if (!set) this.populated.set(g.dimension, (set = new Set()));
    const k = chunkKey(cx, cz);
    if (set.has(k)) return;
    set.add(k);
    if (!g.gamerules.doMobSpawning || Math.random() >= 0.1) return;
    const w = g.world;
    const entry = pick(CREATURE_LIST);
    if (!entry) return;
    const n = entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1));
    const bx = cx * 16 + Math.floor(Math.random() * 16), bz = cz * 16 + Math.floor(Math.random() * 16);
    let spawned = 0;
    for (let i = 0; i < n * 4 && spawned < n; i++) {
      const x = bx + Math.floor(Math.random() * 5) - 2, z = bz + Math.floor(Math.random() * 5) - 2;
      if (!w.isLoaded(x, z)) continue;
      if (NO_ANIMALS.has(BIOMES[w.getBiome(x, z)]?.category ?? '')) return;
      const y = w.getHeight(x, z);
      const [wd, ht] = SIZES[entry.type];
      if (!spaceFree(w, x, y, z, wd, ht) || !animalSpawnOk(w, x, y, z)) continue;
      if (this.spawnOne(g, entry.type, x + 0.5, y, z + 0.5, 'chunk')) spawned++;
    }
  }

  private despawn(g: Game) {
    const p = g.player.pos;
    for (const e of g.entities.list) {
      if (!(e instanceof Mob) || e.removed || e.dead) continue;
      if (g.difficulty === 'peaceful' && e.despawnsInPeaceful()) { e.remove(); continue; }
      if (e.persistenceRequired || !e.removeWhenFarAway()) continue;
      const d2 = e.pos.distanceToSquared(p);
      if (d2 > 128 * 128) e.remove();
      else if (d2 > 32 * 32 && e.noActionTime > 600 && Math.floor(Math.random() * 800) === 0) e.remove();
      else if (d2 < 32 * 32) e.noActionTime = 0;
    }
  }

  save() {
    const o: Record<string, number[]> = {};
    for (const [d, s] of this.populated) o[d] = [...s];
    return { populated: o };
  }
  load(_g: Game, data: any) {
    for (const [d, arr] of Object.entries(data?.populated ?? {})) this.populated.set(d, new Set(arr as number[]));
  }
}

export { CREATURES };
