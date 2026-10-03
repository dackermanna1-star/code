/**
 * World saves in IndexedDB (per browser origin).
 *
 *  - `worlds`  : { id, info, data } — world info + game state (player, time, weather, gamerules,
 *                current dimension, system states)
 *  - `chunks`  : `${worldId}:${dim}:${cx},${cz}` -> chunk record (only chunks changed by play:
 *                placed/broken blocks, container contents); everything else regenerates from
 *                the seed
 *  - `entities`: `${worldId}:${dim}` -> serialized entities (mobs, items ...) grouped by chunk
 *
 * Autosaves every minute, when the tab is hidden, on dimension change and on "Save and Quit".
 * Worlds marked `transient` (title panorama, test harness) are never written.
 */
import type { Game, WorldInfo } from './game';
import type { GameSystem } from './systems';
import { Chunk, chunkFromGenerated } from '../world/chunk';
import type { DimensionId } from '../world/gen/generator';

const DB_NAME = 'voxelcraft';
const DB_VERSION = 1;
const AUTOSAVE_TICKS = 20 * 60;

interface ChunkRecord {
  cx: number;
  cz: number;
  blocks: (Uint16Array | null)[];
  light: (Uint16Array | null)[];
  lightFill: Uint16Array;
  biomes: Uint8Array;
  heightmap: Int16Array;
  grassColor: Uint32Array;
  foliageColor: Uint32Array;
  waterColor: Uint32Array;
  blockEntities: { x: number; y: number; z: number; data: any }[];
}

const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx: IDBTransaction) => new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
/** Plain JSON copy (drops functions/class instances that structured clone would reject). */
const plain = (v: any) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('worlds')) db.createObjectStore('worlds', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks');
        if (!db.objectStoreNames.contains('entities')) db.createObjectStore('entities');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function serializeChunk(c: Chunk): ChunkRecord {
  const blockEntities: ChunkRecord['blockEntities'] = [];
  for (const [k, data] of c.blockEntities) {
    try {
      blockEntities.push({ x: c.cx * 16 + (k & 15), y: k >> 8, z: c.cz * 16 + ((k >> 4) & 15), data: plain(data) });
    } catch {
      /* skip unserialisable */
    }
  }
  return {
    cx: c.cx, cz: c.cz,
    blocks: c.blocks.map((s) => (s ? s.slice() : null)),
    light: c.light.map((s) => (s ? s.slice() : null)),
    lightFill: c.lightFill.slice(),
    biomes: c.biomes.slice(), heightmap: c.heightmap.slice(),
    grassColor: c.grassColor.slice(), foliageColor: c.foliageColor.slice(), waterColor: c.waterColor.slice(),
    blockEntities,
  };
}

export function deserializeChunk(r: ChunkRecord): Chunk {
  const c = chunkFromGenerated(r as any);
  c.modified = false;
  return c;
}

export class WorldSaver {
  private db: Promise<IDBDatabase | null> = openDb();
  /** World/dimension whose chunks are loaded right now (what saveDimension writes). */
  private worldId: string | null = null;
  private dim: DimensionId = 'overworld';
  /** Chunk records written on unload but maybe not committed yet. */
  private pending = new Map<string, ChunkRecord>();
  /** Saved entities of the current dimension not yet handed to their chunk. */
  private entities = new Map<string, any[]>();
  private writing: Promise<void> = Promise.resolve();
  busy = false;

  get available() {
    return this.db.then((d) => !!d);
  }

  private chunkKey(world: string, dim: string, cx: number, cz: number) {
    return `${world}:${dim}:${cx},${cz}`;
  }

  // ------------------------------------------------------------------ world list
  async listWorlds(): Promise<WorldInfo[]> {
    const db = await this.db;
    if (!db) return [];
    const all = await req(db.transaction('worlds').objectStore('worlds').getAll());
    return all.map((w: any) => w.info).sort((a: WorldInfo, b: WorldInfo) => b.lastPlayed - a.lastPlayed);
  }

  async loadWorld(id: string): Promise<{ info: WorldInfo; data: any } | null> {
    const db = await this.db;
    if (!db) return null;
    const w = await req(db.transaction('worlds').objectStore('worlds').get(id));
    return w ? { info: w.info, data: w.data } : null;
  }

  async deleteWorld(id: string) {
    const db = await this.db;
    if (!db) return;
    const tx = db.transaction(['worlds', 'chunks', 'entities'], 'readwrite');
    tx.objectStore('worlds').delete(id);
    const range = IDBKeyRange.bound(`${id}:`, `${id}:￿`);
    tx.objectStore('chunks').delete(range);
    tx.objectStore('entities').delete(range);
    await done(tx);
  }

  // ------------------------------------------------------------------ dimension lifecycle
  /** Called by Game.enterDimension before chunks of `dim` are requested. */
  async enterDimension(game: Game, dim: DimensionId) {
    this.worldId = game.info?.transient ? null : game.info?.id ?? null;
    this.dim = dim;
    this.entities.clear();
    const db = await this.db;
    if (!db || !this.worldId) return;
    try {
      const rec = await req(db.transaction('entities').objectStore('entities').get(`${this.worldId}:${dim}`));
      for (const [k, list] of Object.entries((rec as any) ?? {})) this.entities.set(k, list as any[]);
    } catch (e) {
      console.warn('loading saved entities failed', e);
    }
  }

  /** Saved entities for a chunk that just became ready (once). */
  takeEntities(cx: number, cz: number): any[] | undefined {
    const k = `${cx},${cz}`;
    const list = this.entities.get(k);
    if (list) this.entities.delete(k);
    return list;
  }

  async loadChunk(game: Game, dim: DimensionId, cx: number, cz: number): Promise<Chunk | null> {
    if (!this.worldId || game.info?.id !== this.worldId) return null;
    const key = this.chunkKey(this.worldId, dim, cx, cz);
    const p = this.pending.get(key);
    if (p) return deserializeChunk(p);
    const db = await this.db;
    if (!db) return null;
    try {
      const r = await req(db.transaction('chunks').objectStore('chunks').get(key));
      return r ? deserializeChunk(r as ChunkRecord) : null;
    } catch (e) {
      console.warn('loading saved chunk failed', cx, cz, e);
      return null;
    }
  }

  /** A modified chunk is being unloaded: keep its record. */
  chunkUnloaded(c: Chunk) {
    if (!this.worldId || !c.modified) return;
    const key = this.chunkKey(this.worldId, this.dim, c.cx, c.cz);
    this.pending.set(key, serializeChunk(c));
    c.modified = false;
    this.queueWrite(async (db) => {
      const tx = db.transaction('chunks', 'readwrite');
      const st = tx.objectStore('chunks');
      for (const [k, r] of this.pending) st.put(r, k);
      const written = [...this.pending];
      await done(tx);
      for (const [k, r] of written) if (this.pending.get(k) === r) this.pending.delete(k);
    });
  }

  private queueWrite(fn: (db: IDBDatabase) => Promise<void>) {
    this.writing = this.writing.then(async () => {
      const db = await this.db;
      if (db) await fn(db);
    }).catch((e) => console.warn('save failed', e));
    return this.writing;
  }

  // ------------------------------------------------------------------ saving
  /** Write the loaded dimension (changed chunks + entities). */
  async saveDimension(game: Game) {
    const wid = this.worldId;
    if (!wid || !game.world || !game.entities) return;
    const dim = this.dim;
    const chunks: [string, ChunkRecord][] = [];
    for (const c of game.world.chunks.values()) {
      if (!c.modified) continue;
      chunks.push([this.chunkKey(wid, dim, c.cx, c.cz), serializeChunk(c)]);
      c.modified = false;
    }
    // entities grouped by chunk; ones not yet handed to a chunk stay as they were
    const ents: Record<string, any[]> = Object.fromEntries(this.entities);
    for (const e of game.entities.list) {
      if (e === game.player || e.removed || (e as any).dead) continue;
      let o: any;
      try {
        o = plain(e.serialize());
      } catch {
        continue;
      }
      if (!o?.type) continue;
      const k = `${Math.floor(e.pos.x) >> 4},${Math.floor(e.pos.z) >> 4}`;
      (ents[k] ??= []).push(o);
    }
    await this.queueWrite(async (db) => {
      const tx = db.transaction(['chunks', 'entities'], 'readwrite');
      const st = tx.objectStore('chunks');
      for (const [k, r] of chunks) st.put(r, k);
      const written = [...this.pending];
      for (const [k, r] of written) st.put(r, k);
      tx.objectStore('entities').put(ents, `${wid}:${dim}`);
      await done(tx);
      for (const [k, r] of written) if (this.pending.get(k) === r) this.pending.delete(k);
    });
  }

  /** Full save: game state + the loaded dimension. */
  async saveAll(game: Game) {
    const info = game.info;
    if (!this.worldId || !info || info.id !== this.worldId) return;
    this.busy = true;
    try {
      info.lastPlayed = Date.now();
      const systems: Record<string, any> = {};
      for (const s of game.systems) {
        try {
          const d = s.save?.(game);
          if (d !== undefined) systems[s.name] = plain(d);
        } catch (e) {
          console.warn('system save failed', s.name, e);
        }
      }
      const data = {
        ticks: game.ticks,
        dayTime: game.dayTime,
        weather: plain(game.weather),
        gamerules: plain(game.gamerules),
        player: plain(game.player.serialize()),
        dimension: game.dimension,
        systems,
      };
      await this.saveDimension(game);
      await this.queueWrite(async (db) => {
        const tx = db.transaction('worlds', 'readwrite');
        tx.objectStore('worlds').put({ id: info.id, info: plain(info), data });
        await done(tx);
      });
    } finally {
      this.busy = false;
    }
  }
}

/** Installs `game.saver`, autosaves and the save-on-hide hook. */
export class SaveSystem implements GameSystem {
  readonly name = 'saves';
  private saver = new WorldSaver();
  private game!: Game;

  init(game: Game) {
    this.game = game;
    game.saver = this.saver;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === "hidden") this.autosave();
      });
      window.addEventListener("pagehide", () => this.autosave());
    }
  }

  private autosave() {
    const g = this.game;
    if (!g.world || g.loading || this.saver.busy) return;
    this.saver.saveAll(g).catch((e) => console.warn('autosave failed', e));
  }

  tick(game: Game) {
    if (game.ticks > 0 && game.ticks % AUTOSAVE_TICKS === 0) this.autosave();
  }
}
