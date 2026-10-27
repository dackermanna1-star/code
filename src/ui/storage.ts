/** Small, failure-tolerant localStorage wrapper (private windows may throw). */
const PREFIX = 'infinite-cosmos:';

export function load<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(PREFIX + key);
    if (!s) return fallback;
    return { ...fallback, ...JSON.parse(s) } as T;
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

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable or full: ignore */
  }
}

export function remove(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
