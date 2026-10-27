/** Small, failure-tolerant localStorage wrapper (private windows may throw). */
const PREFIX = 'infinite-cosmos:';

export function load<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(PREFIX + key);
    if (!s) return fallback;
    const v = JSON.parse(s);
    if (Array.isArray(fallback) || typeof fallback !== 'object' || fallback === null) return v as T;
    return { ...fallback, ...v } as T;
  } catch {
    return fallback;
  }
}

export function loadRaw<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(PREFIX + key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

/** Returns false when storage is unavailable or full. */
export function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
