/**
 * Persistent progress in localStorage. All access is wrapped in try/catch
 * so the game still runs (without saving) in private windows.
 */
import type { CarId } from "../data/cars";
import { EMPTY_LOADOUT, type Loadout } from "../data/parts";

export type GoreMode = "full" | "green" | "off";
export type Quality = "low" | "medium" | "high";

export interface Settings {
  masterVolume: number; // 0..1
  musicVolume: number;
  sfxVolume: number;
  gore: GoreMode;
  quality: Quality;
  cameraShake: boolean;
}

export interface SaveData {
  version: 1;
  cash: number;
  currentCar: CarId;
  ownedCars: CarId[];
  loadouts: Partial<Record<CarId, Loadout>>;
  levelsUnlocked: number; // highest playable level index
  levelsCleared: number[];
  selectedLevel: number;
  bestDistance: Record<number, number>; // level -> meters
  runs: number;
  totalKills: number;
  survivorsRescued: string[]; // survivor ids
  achievements: string[];
  settings: Settings;
}

const KEY = "deadmile.save.v1";

export function defaultSave(): SaveData {
  return {
    version: 1,
    cash: 0,
    currentCar: "hatchback",
    ownedCars: ["hatchback"],
    loadouts: { hatchback: { ...EMPTY_LOADOUT } },
    levelsUnlocked: 0,
    levelsCleared: [],
    selectedLevel: 0,
    bestDistance: {},
    runs: 0,
    totalKills: 0,
    survivorsRescued: [],
    achievements: [],
    settings: {
      masterVolume: 0.8,
      musicVolume: 0.6,
      sfxVolume: 0.9,
      gore: "full",
      quality: "medium",
      cameraShake: true,
    },
  };
}

export class Save {
  data: SaveData;

  constructor() {
    this.data = this.load();
  }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const def = defaultSave();
        return { ...def, ...parsed, settings: { ...def.settings, ...(parsed.settings ?? {}) } };
      }
    } catch {
      /* storage unavailable */
    }
    return defaultSave();
  }

  write(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable */
    }
  }

  reset(): void {
    this.data = defaultSave();
    this.write();
  }

  loadout(car: CarId = this.data.currentCar): Loadout {
    let l = this.data.loadouts[car];
    if (!l) {
      l = { ...EMPTY_LOADOUT };
      this.data.loadouts[car] = l;
    }
    return l;
  }
}
