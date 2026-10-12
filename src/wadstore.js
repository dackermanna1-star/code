// Stores a user-supplied IWAD (e.g. a registered DOOM.WAD or DOOM2.WAD) in
// IndexedDB so it is used on later visits. Nothing leaves the browser.

const DB = 'doom-modern';
const STORE = 'wads';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadStoredIwad() {
  if (!('indexedDB' in window)) return null;
  const db = await open();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get('iwad');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

export async function storeIwad(name, data) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ name, data }, 'iwad');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    // Quota failures abort the transaction without an error event.
    tx.onabort = () => reject(tx.error || new Error('storage was aborted'));
  });
}

export async function clearStoredIwad() {
  const db = await open();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete('iwad');
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}
