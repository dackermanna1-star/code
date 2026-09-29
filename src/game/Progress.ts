import { WEAPON_MAP, GRENADE } from '../weapons/defs';

export interface Settings {
  sensitivity: number;
  invertY: boolean;
  fov: number;
  volume: number;
  sfx: number;
  music: number;
  pixelSize: number;
  quality: 'low' | 'medium' | 'high';
  gore: boolean;
  showFps: boolean;
}

export interface Stats {
  kills: number;
  headshots: number;
  daysSurvived: number;
  moneyEarned: number;
  deaths: number;
  bestDay: number;
}

export interface SaveData {
  version: number;
  money: number;
  day: number;
  bestDay: number;
  owned: Record<string, number>;
  loadout: (string | null)[];
  inventory: Record<string, number[]>;
  grenades: number;
  stats: Stats;
  settings: Settings;
  seenIntro: boolean;
  /** Health carried into the next day (no free healing). */
  hp: number;
  /** A medkit bought in the shop, used at the start of the next day. */
  medkit: boolean;
  /** Kills since the last death (lifetime count lives in stats). */
  runKills: number;
}

export const MEDKIT = { id: 'medkit', name: 'Medkit', cost: 200, heal: 50 };

const KEY = 'bloodroad.save.v1';

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  invertY: false,
  fov: 78,
  volume: 0.8,
  sfx: 1,
  music: 0.5,
  pixelSize: 0,
  quality: 'high',
  gore: true,
  showFps: false,
};

function fresh(): SaveData {
  return {
    version: 1,
    money: 0,
    day: 1,
    bestDay: 1,
    owned: { m686: 0, shorty: 0 },
    loadout: ['m686', 'shorty', null, null],
    inventory: { woodBarrier: [1] },
    grenades: 1,
    stats: { kills: 0, headshots: 0, daysSurvived: 0, moneyEarned: 0, deaths: 0, bestDay: 1 },
    settings: { ...DEFAULT_SETTINGS },
    seenIntro: false,
    hp: 100,
    medkit: false,
    runKills: 0,
  };
}

/** Days 1-10: 3 waves, 11-20: 4 ... capped at 10 waves per day. */
export function wavesForDay(day: number) {
  return Math.min(10, 3 + Math.floor((day - 1) / 10));
}

/** Persistent progression. The ONLY money source is earn() from kills. */
export class Progress {
  data: SaveData;
  onChange: (() => void) | null = null;
  private saveTimer: any = null;

  constructor() {
    this.data = this.load();
  }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw) as SaveData;
        const f = fresh();
        return { ...f, ...d, stats: { ...f.stats, ...(d.stats ?? {}) }, settings: { ...f.settings, ...(d.settings ?? {}) } };
      }
    } catch {
      /* private mode / corrupted save */
    }
    return fresh();
  }

  hasSave() {
    try {
      return !!localStorage.getItem(KEY);
    } catch {
      return false;
    }
  }

  save(now = false) {
    const write = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch {
        /* ignore */
      }
    };
    if (now) {
      clearTimeout(this.saveTimer);
      write();
      return;
    }
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(write, 400);
  }

  /** Permadeath: the run is wiped back to Day 1; lifetime records and settings stay. */
  resetRun() {
    const { settings, stats, seenIntro } = this.data;
    this.data = fresh();
    this.data.settings = settings;
    this.data.stats = stats;
    this.data.seenIntro = seenIntro;
    this.save(true);
    this.onChange?.();
  }

  buyMedkit() {
    if (this.data.medkit || this.data.hp >= 100) return false;
    if (!this.spend(MEDKIT.cost)) return false;
    this.data.medkit = true;
    this.changed();
    return true;
  }

  reset() {
    const settings = this.data.settings;
    this.data = fresh();
    this.data.settings = settings;
    this.save(true);
    this.onChange?.();
  }

  get money() {
    return this.data.money;
  }

  /** Kill reward. */
  earn(amount: number) {
    this.data.money += amount;
    this.data.stats.moneyEarned += amount;
    this.changed();
  }

  spend(amount: number) {
    if (this.data.money < amount) return false;
    this.data.money -= amount;
    this.changed();
    return true;
  }

  private changed() {
    this.save();
    this.onChange?.();
  }

  owns(id: string) {
    return this.data.owned[id] !== undefined;
  }
  level(id: string) {
    return this.data.owned[id] ?? -1;
  }

  buyWeapon(id: string) {
    const w = WEAPON_MAP[id];
    if (!w || this.owns(id) || w.unlockDay > this.data.day) return false;
    if (!this.spend(w.cost)) return false;
    this.data.owned[id] = 0;
    // auto-equip into a free slot
    const free = this.data.loadout.indexOf(null);
    if (free >= 0) this.data.loadout[free] = id;
    this.changed();
    return true;
  }

  upgradeWeapon(id: string) {
    const w = WEAPON_MAP[id];
    const lvl = this.level(id);
    if (!w || lvl < 0 || !w.levels || lvl >= w.levels.length) return false;
    const L = w.levels[lvl];
    if (L.unlockDay > this.data.day) return false;
    if (!this.spend(L.cost)) return false;
    this.data.owned[id] = lvl + 1;
    this.changed();
    return true;
  }

  equip(id: string, slot: number) {
    if (!this.owns(id)) return;
    const lo = this.data.loadout;
    const cur = lo.indexOf(id);
    if (cur >= 0) lo[cur] = lo[slot];
    lo[slot] = id;
    this.changed();
  }

  unequip(slot: number) {
    const lo = this.data.loadout;
    if (lo.filter(Boolean).length <= 1) return;
    lo[slot] = null;
    this.changed();
  }

  itemCount(key: string) {
    return this.data.inventory[key]?.length ?? 0;
  }

  addItem(key: string, hp = 1) {
    (this.data.inventory[key] ??= []).push(hp);
    this.changed();
  }

  /** Takes the most damaged copy first (keeps fresh ones for later). */
  takeItem(key: string): number | null {
    const arr = this.data.inventory[key];
    if (!arr || arr.length === 0) return null;
    arr.sort((a, b) => a - b);
    const hp = arr.shift()!;
    if (arr.length === 0) delete this.data.inventory[key];
    this.changed();
    return hp;
  }

  buyItem(key: string, cost: number) {
    if (!this.spend(cost)) return false;
    this.addItem(key, 1);
    return true;
  }

  buyGrenade() {
    if (this.data.grenades >= GRENADE.max) return false;
    if (!this.spend(GRENADE.cost)) return false;
    this.data.grenades++;
    this.changed();
    return true;
  }

  useGrenade() {
    this.data.grenades = Math.max(0, this.data.grenades - 1);
    this.changed();
  }

  /** Strength grows with experience; scales bow damage. */
  get strength() {
    // earned within the current run: permadeath takes it away too
    return 1 + Math.min(3, (this.data.day - 1) * 0.035 + (this.data.runKills ?? 0) * 0.00004);
  }
}
