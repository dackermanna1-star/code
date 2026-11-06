// Save games in IndexedDB (one slot) + settings in localStorage.
const DB = 'deadcounty';
const STORE = 'saves';
const KEY = 'slot1';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const r = fn(store);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export const SaveManager = {
  async save(data) {
    try {
      await tx('readwrite', (s) => s.put(data, KEY));
      return true;
    } catch (e) {
      console.warn('save failed', e);
      return false;
    }
  },
  async load() {
    try { return (await tx('readonly', (s) => s.get(KEY))) || null; } catch (e) { return null; }
  },
  async info() {
    const d = await this.load();
    if (!d) return null;
    return { name: d.player?.name, day: d.time?.day, hour: d.time?.hour, profession: d.player?.professionName, savedAt: d.savedAt };
  },
  async has() { return !!(await this.info()); },
  async clear() { try { await tx('readwrite', (s) => s.delete(KEY)); } catch (e) { /* ignore */ } },

  loadSettings(defaults) {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem('deadcounty.settings') || '{}') }; } catch (e) { return { ...defaults }; }
  },
  saveSettings(s) {
    try { localStorage.setItem('deadcounty.settings', JSON.stringify(s)); } catch (e) { /* ignore */ }
  },
};

/** Uint8Array <-> base64 helpers for compact saves */
export function u8ToB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64ToU8(b64, len) {
  const s = atob(b64);
  const u = new Uint8Array(len || s.length);
  for (let i = 0; i < s.length && i < u.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
