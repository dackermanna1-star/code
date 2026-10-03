// Cookbook: remembers every dish Mochi has eaten (persisted in localStorage when available).

export interface DiscoveryEntry {
  key: string; // dishId or generated name
  name: string;
  dishId: string | null;
  category: string;
  reaction: string;
  taste: number;
  count: number;
  first: number; // timestamp
  thumb?: string; // small data URL
}

const KEY = 'munchlab.cookbook.v1';

export class Discoveries {
  entries = new Map<string, DiscoveryEntry>();
  meals = 0;

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw) as { entries: DiscoveryEntry[]; meals: number };
        for (const e of data.entries ?? []) this.entries.set(e.key, e);
        this.meals = data.meals ?? 0;
      }
    } catch {
      /* private mode etc. */
    }
  }

  /** Record a meal. Returns true when it is a brand-new recognised dish. */
  record(a: { name: string; dishId: string | null; category: string; reaction: string; taste: number }, thumb?: string): { isNew: boolean; isNewDish: boolean; entry: DiscoveryEntry } {
    this.meals++;
    const key = a.dishId ?? 'x:' + a.name.toLowerCase();
    let e = this.entries.get(key);
    const isNew = !e;
    if (!e) {
      e = { key, name: a.name, dishId: a.dishId, category: a.category, reaction: a.reaction, taste: a.taste, count: 0, first: Date.now(), thumb };
      this.entries.set(key, e);
    }
    e.count++;
    if (a.taste > e.taste) {
      e.taste = a.taste;
      e.reaction = a.reaction;
      if (thumb) e.thumb = thumb;
    }
    this.save();
    return { isNew, isNewDish: isNew && !!a.dishId, entry: e };
  }

  get dishCount(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.dishId) n++;
    return n;
  }

  list(): DiscoveryEntry[] {
    return [...this.entries.values()].sort((a, b) => b.first - a.first);
  }

  clear() {
    this.entries.clear();
    this.meals = 0;
    this.save();
  }

  private save() {
    try {
      const entries = this.list().slice(0, 120);
      localStorage.setItem(KEY, JSON.stringify({ entries, meals: this.meals }));
    } catch {
      // quota: drop thumbnails and retry
      try {
        const entries = this.list().slice(0, 120).map((e) => ({ ...e, thumb: undefined }));
        localStorage.setItem(KEY, JSON.stringify({ entries, meals: this.meals }));
      } catch {
        /* ignore */
      }
    }
  }
}
