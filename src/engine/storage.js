// Safe key/value persistence. Wraps localStorage and silently falls back to an in-memory store
// when storage is unavailable (private modes, sandboxed file:// contexts, quota errors), so saving
// settings or games can never throw into the game loop.

const memory = new Map();
let native = null;
try {
  const probe = '__hallowell_probe__';
  window.localStorage.setItem(probe, '1');
  window.localStorage.removeItem(probe);
  native = window.localStorage;
} catch {
  native = null;
}

export const storage = {
  /** True when values survive a page reload (localStorage is usable). Exposed as HW.storage. */
  persistent: !!native,
  /** False when the most recent write could only be kept in memory (blocked storage, quota). */
  lastWriteOk: !!native,

  get(key) {
    // A memory entry only exists when a native write failed, so it is always the freshest value.
    if (memory.has(key)) return memory.get(key);
    if (native) {
      try { return native.getItem(key); } catch { /* fall through */ }
    }
    return null;
  },

  set(key, value) {
    if (native) {
      try {
        native.setItem(key, value);
        memory.delete(key);
        this.lastWriteOk = true;
        return true;
      } catch { /* quota or security error: keep it in memory for this session */ }
    }
    memory.set(key, value);
    this.lastWriteOk = false;
    return false;
  },

  remove(key) {
    memory.delete(key);
    if (native) {
      try { native.removeItem(key); } catch { /* ignore */ }
    }
  },
};

export default storage;
