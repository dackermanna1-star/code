/**
 * Discovery catalogue and bookmarks (persisted per universe seed).
 * Everything you come close to is recorded automatically; a scientific scan
 * upgrades an entry with full physical data.
 */
import { load, save } from '../ui/storage';
import type { SavedLocation } from './locations';

export type DiscoveryKind = 'system' | 'star' | 'planet' | 'moon' | 'dwarf' | 'small' | 'galaxy' | 'nebula' | 'event';

export interface Discovery {
  id: string;
  name: string;
  kind: DiscoveryKind;
  subtitle: string;
  systemId: string | null;
  place: string;
  firstSeen: number;
  simTime: number;
  scanned: boolean;
  life?: string;
  thumb?: string;
  location?: SavedLocation;
}

export interface Bookmark {
  id: string;
  name: string;
  created: number;
  place: string;
  location: SavedLocation;
  thumb?: string;
}

const MAX_THUMBS = 240;

export class Discoveries {
  entries = new Map<string, Discovery>();
  bookmarks: Bookmark[] = [];
  onChange: () => void = () => {};
  private timer = 0;

  constructor(readonly seed: string) {
    for (const d of load<Discovery[]>(`catalog:${seed}`, [])) this.entries.set(d.id, d);
    this.bookmarks = load<Bookmark[]>(`bookmarks:${seed}`, []);
  }

  has(id: string) {
    return this.entries.has(id);
  }

  get(id: string) {
    return this.entries.get(id);
  }

  isScanned(id: string) {
    return !!this.entries.get(id)?.scanned;
  }

  /** Record a new discovery; returns it if it was new. */
  discover(d: Omit<Discovery, 'firstSeen' | 'scanned'>): Discovery | null {
    if (this.entries.has(d.id)) return null;
    const e: Discovery = { ...d, firstSeen: Date.now(), scanned: false };
    this.entries.set(e.id, e);
    this.changed();
    return e;
  }

  markScanned(id: string, extra?: Partial<Discovery>) {
    const e = this.entries.get(id);
    if (!e) return;
    e.scanned = true;
    Object.assign(e, extra);
    this.changed();
  }

  setThumb(id: string, thumb: string) {
    const e = this.entries.get(id);
    if (!e || e.thumb) return;
    e.thumb = thumb;
    // keep storage bounded: drop the oldest thumbnails first
    const withThumb = [...this.entries.values()].filter((x) => x.thumb).sort((a, b) => a.firstSeen - b.firstSeen);
    for (let i = 0; i < withThumb.length - MAX_THUMBS; i++) delete withThumb[i].thumb;
    this.changed();
  }

  addBookmark(b: Omit<Bookmark, 'id' | 'created'>): Bookmark {
    const bm: Bookmark = { ...b, id: `bm${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, created: Date.now() };
    this.bookmarks.unshift(bm);
    this.changed();
    return bm;
  }

  removeBookmark(id: string) {
    this.bookmarks = this.bookmarks.filter((b) => b.id !== id);
    this.changed();
  }

  renameBookmark(id: string, name: string) {
    const b = this.bookmarks.find((x) => x.id === id);
    if (b) b.name = name;
    this.changed();
  }

  stats() {
    const s: Record<string, number> = { total: this.entries.size, scanned: 0, life: 0 };
    for (const e of this.entries.values()) {
      s[e.kind] = (s[e.kind] ?? 0) + 1;
      if (e.scanned) s.scanned++;
      if (e.life && e.life !== 'none') s.life++;
    }
    return s;
  }

  private changed() {
    this.onChange();
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), 800);
  }

  flush() {
    clearTimeout(this.timer);
    if (!save(`catalog:${this.seed}`, [...this.entries.values()])) {
      // quota exceeded: drop all thumbnails and retry
      for (const e of this.entries.values()) delete e.thumb;
      save(`catalog:${this.seed}`, [...this.entries.values()]);
    }
    save(`bookmarks:${this.seed}`, this.bookmarks);
  }
}
