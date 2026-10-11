// Map registry and map-file loading.
//
// de_dust2 is built into the game. Other maps are original GoldSrc .bsp files the
// player supplies (they are third-party / Valve content and never ship with this
// project): picked once in the New Game menu and kept in the browser (IndexedDB), or
// in development served from a folder with ?mapsrc=http://localhost:8898.
import { decodeTga } from '../bsp/tga.js';

export const MAPS = {
  de_dust2: { id: 'de_dust2', title: 'de_dust2', builtin: true, mode: 'bomb' },
  cs_mansion: {
    id: 'cs_mansion', title: 'cs_mansion', mode: 'hostage',
    bsp: 'cs_mansion.bsp',
    // the textures it uses live in Half-Life's own WADs (valve/halflife.wad, liquids.wad)
    wads: ['halflife.wad', 'liquids.wad', 'decals.wad', 'cstrike.wad'],
    sky: 'city',
    credit: 'cs_mansion by Magnus Lind',
    url: 'https://gamebanana.com/mods/92163',
  },
};

/** A map id that isn't registered but whose .bsp the player added: generic entry. */
export function mapDef(id) {
  if (MAPS[id]) return MAPS[id];
  return { id, title: id, mode: id.startsWith('cs_') ? 'hostage' : 'bomb', bsp: id + '.bsp', wads: ['halflife.wad', 'liquids.wad', 'decals.wad', 'cstrike.wad'], sky: null };
}

// ---------------------------------------------------------------- user files (IndexedDB)
const DB = 'cs16-usermaps', STORE = 'files';
function openDb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('no IndexedDB')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idb(mode, fn) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode);
    const out = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(out instanceof IDBRequest ? out.result : out);
    tx.onerror = () => rej(tx.error);
  });
}

/** Store picked files (.bsp / .wad / sky .tga) by lower-case base name. Returns the names. */
export async function storeUserFiles(files) {
  const names = [];
  for (const f of files) {
    const name = f.name.toLowerCase().split(/[\\/]/).pop();
    if (!/\.(bsp|wad|tga)$/.test(name)) continue;
    const buf = await f.arrayBuffer();
    await idb('readwrite', (s) => s.put(buf, name));
    names.push(name);
  }
  return names;
}

export async function listUserFiles() {
  try { return await idb('readonly', (s) => s.getAllKeys()); } catch { return []; }
}

async function getUserFile(name) {
  try { return (await idb('readonly', (s) => s.get(name))) || null; } catch { return null; }
}

export async function removeUserFiles(names) {
  for (const n of names) await idb('readwrite', (s) => s.delete(n));
}

/** Which of a map's files are available ({ bsp: bool, wads: [names present], sky: bool }). */
export async function mapAvailability(def) {
  if (def.builtin) return { ok: true };
  const have = new Set(await listUserFiles());
  return {
    ok: have.has(def.bsp),
    bsp: have.has(def.bsp),
    wads: def.wads.filter((w) => have.has(w)),
    sky: !!def.sky && ['rt', 'lf', 'bk', 'ft', 'up', 'dn'].every((s) => have.has(`${def.sky}${s}.tga`.toLowerCase())),
  };
}

/** Load a map's files: from ?mapsrc (dev server) first, else from IndexedDB. */
export async function loadMapFiles(def, mapsrc = null) {
  const get = async (name) => {
    if (mapsrc) {
      try {
        const r = await fetch(`${mapsrc}/${name}`);
        if (r.ok) return await r.arrayBuffer();
      } catch { /* fall through */ }
    }
    const b = await getUserFile(name.toLowerCase());
    return b instanceof ArrayBuffer ? b : null;
  };
  const bsp = await get(def.bsp);
  if (!bsp) throw new Error(`${def.bsp} not found`);
  const wads = [];
  for (const w of def.wads) { const b = await get(w); if (b) wads.push(b); }
  let sky = null;
  if (def.sky) {
    const faces = {};
    for (const s of ['rt', 'lf', 'bk', 'ft', 'up', 'dn']) {
      const b = await get(`${def.sky}${s}.tga`);
      if (!b) { faces.missing = true; break; }
      try { faces[s] = decodeTga(b); } catch { faces.missing = true; break; }
    }
    if (!faces.missing) sky = faces;
  }
  return { bsp, wads, sky };
}
