/**
 * World persistence. The simulation reads from an in-memory mirror
 * (synchronous, fast) that is filled once when a world is opened; saves
 * are written as ONE atomic transaction so a crash or a closed tab during
 * a save leaves the previous consistent save intact.
 */

export const SCHEMA_VERSION = 1;

export interface SaveBundle {
  meta: Record<string, string>;
  /** Edited chunks (upserted). */
  chunks: Array<{ key: number; cx: number; cz: number; rev: number; data: Uint8Array }>;
  /** Full replacement set of dynamic objects (pieces, deployables, corpses, player). */
  objects: Array<{ id: number; kind: string; data: string }>;
}

export interface WorldStorage {
  getMeta(key: string): string | undefined;
  loadChunk(key: number): { rev: number; data: Uint8Array } | null;
  loadObjects(): Array<{ id: number; kind: string; data: string }>;
  /** Persist atomically. Resolves when durable. */
  save(b: SaveBundle): Promise<void>;
}

/** In-memory storage (tests, benchmarks, and the mirror used by IndexedDB storage). */
export class MemoryStorage implements WorldStorage {
  meta = new Map<string, string>();
  chunks = new Map<number, { rev: number; data: Uint8Array }>();
  objects: Array<{ id: number; kind: string; data: string }> = [];
  saves = 0;

  getMeta(key: string) {
    return this.meta.get(key);
  }

  loadChunk(key: number) {
    return this.chunks.get(key) ?? null;
  }

  loadObjects() {
    return this.objects.slice();
  }

  /** Apply a bundle to the in-memory mirror. */
  apply(b: SaveBundle) {
    for (const [k, v] of Object.entries(b.meta)) this.meta.set(k, v);
    for (const c of b.chunks) this.chunks.set(c.key, { rev: c.rev, data: c.data });
    this.objects = b.objects.slice();
    this.saves++;
  }

  async save(b: SaveBundle) {
    this.apply(b);
  }
}

// ------------------------------------------------------------------ IndexedDB
const STORES = ['meta', 'chunks', 'objects'] as const;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

export function openDB(name: string, version: number, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, version);
    r.onupgradeneeded = () => upgrade(r.result);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('World database is open in another tab'));
  });
}

/**
 * IndexedDB-backed world. `open()` loads everything into a MemoryStorage
 * mirror; `save()` updates the mirror and writes one readwrite transaction
 * spanning all stores (atomic: all-or-nothing).
 */
export class IDBStorage extends MemoryStorage {
  private constructor(private db: IDBDatabase) {
    super();
  }

  static async open(worldId: string): Promise<IDBStorage> {
    const db = await openDB(`corrode-world-${worldId}`, SCHEMA_VERSION, (d) => {
      for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
    });
    const st = new IDBStorage(db);
    const tx = db.transaction([...STORES], 'readonly');
    const metaStore = tx.objectStore('meta');
    const keys = (await req(metaStore.getAllKeys())) as string[];
    const vals = (await req(metaStore.getAll())) as string[];
    keys.forEach((k, i) => st.meta.set(k, vals[i]));
    const ckeys = (await req(tx.objectStore('chunks').getAllKeys())) as number[];
    const cvals = (await req(tx.objectStore('chunks').getAll())) as Array<{ rev: number; data: Uint8Array }>;
    ckeys.forEach((k, i) => st.chunks.set(k, cvals[i]));
    const objs = (await req(tx.objectStore('objects').get('all'))) as Array<{ id: number; kind: string; data: string }> | undefined;
    st.objects = objs ?? [];
    return st;
  }

  override async save(b: SaveBundle) {
    const tx = this.db.transaction([...STORES], 'readwrite');
    const meta = tx.objectStore('meta');
    for (const [k, v] of Object.entries(b.meta)) meta.put(v, k);
    const chunks = tx.objectStore('chunks');
    for (const c of b.chunks) chunks.put({ rev: c.rev, data: c.data }, c.key);
    tx.objectStore('objects').put(b.objects, 'all');
    await txDone(tx);
    this.apply(b);
  }

  close() {
    this.db.close();
  }

  static async destroy(worldId: string) {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.deleteDatabase(`corrode-world-${worldId}`);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
      r.onblocked = () => resolve();
    });
  }
}
