export type QualityName = 'low' | 'medium' | 'high';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Settings {
  sensitivity: number;
  invertY: boolean;
  fov: number;
  master: number;
  music: number;
  sfx: number;
  quality: QualityName;
  shake: number;
  gore: number;
  showFps: boolean;
  difficulty: Difficulty;
  crowd: number;
  hints: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  invertY: false,
  fov: 82,
  master: 0.8,
  music: 0.7,
  sfx: 0.9,
  quality: 'medium',
  shake: 1,
  gore: 1,
  showFps: false,
  difficulty: 'normal',
  crowd: 32,
  hints: true,
};

const KEY = 'lc_settings_v1';

/** Player preferences persisted in localStorage (safe when storage is unavailable). */
export class SettingsStore {
  readonly value: Settings;
  private listeners: ((s: Settings, key: keyof Settings | null) => void)[] = [];

  constructor() {
    let stored: Partial<Settings> = {};
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {
      /* storage blocked */
    }
    this.value = { ...DEFAULT_SETTINGS };
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const v = stored[k];
      if (v !== undefined && typeof v === typeof DEFAULT_SETTINGS[k]) (this.value as any)[k] = v;
    }
  }

  set<K extends keyof Settings>(key: K, v: Settings[K]): void {
    if (this.value[key] === v) return;
    this.value[key] = v;
    this.save();
    for (const l of this.listeners) l(this.value, key);
  }

  onChange(fn: (s: Settings, key: keyof Settings | null) => void): void {
    this.listeners.push(fn);
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.value));
    } catch {
      /* ignore */
    }
  }
}

/** Best results per mode, also kept in localStorage. */
export class Records {
  private data: Record<string, { bestTime?: number; bestWave?: number; bestKills?: number; wins?: number; plays?: number }> = {};
  constructor() {
    try {
      const raw = localStorage.getItem('lc_records_v1');
      if (raw) this.data = JSON.parse(raw) ?? {};
    } catch {
      /* ignore */
    }
  }
  get(mode: string) {
    return (this.data[mode] ??= {});
  }
  save(): void {
    try {
      localStorage.setItem('lc_records_v1', JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
  }
}
