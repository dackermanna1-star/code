import { openDB } from '../sim/storage';

/** Saved-world directory (IndexedDB). Each world's data lives in its own database. */
export interface WorldEntry {
  id: string;
  name: string;
  seed: string;
  cheats: boolean;
  created: number;
  lastPlayed: number;
}

const DB = 'corrode-worlds';

async function db() {
  return openDB(DB, 1, (d) => {
    if (!d.objectStoreNames.contains('worlds')) d.createObjectStore('worlds', { keyPath: 'id' });
  });
}

export async function listWorlds(): Promise<WorldEntry[]> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction('worlds').objectStore('worlds').getAll();
    r.onsuccess = () => resolve((r.result as WorldEntry[]).sort((a, b) => b.lastPlayed - a.lastPlayed));
    r.onerror = () => reject(r.error);
  });
}

export async function putWorld(w: WorldEntry) {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction('worlds', 'readwrite');
    tx.objectStore('worlds').put(w);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteWorld(id: string) {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction('worlds', 'readwrite');
    tx.objectStore('worlds').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(`corrode-world-${id}`);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}

export function newWorldId() {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}
