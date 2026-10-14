// Player options and run records, persisted in localStorage defensively
// (private mode, disabled storage and corrupt values all fall back to the
// defaults).
import type { WeaponId, ZombieKind } from '../config/ids';
import { clamp01, storageGet, storageSet } from './dom';

export type Quality = 'low' | 'medium' | 'high';
export type BloodAmount = 'low' | 'normal' | 'max';

export interface Options {
  /** 0..1 */
  masterVolume: number;
  /** 0..1 sound effects (and ambience). */
  sfxVolume: number;
  /** 0..1 adaptive music. */
  musicVolume: number;
  quality: Quality;
  blood: BloodAmount;
  /** 0..1 screen-shake multiplier (0 = off). */
  shake: number;
  showFps: boolean;
}

export const DEFAULT_OPTIONS: Readonly<Options> = {
  masterVolume: 0.8,
  sfxVolume: 1,
  musicVolume: 0.7,
  quality: 'high',
  blood: 'normal',
  shake: 1,
  showFps: false,
};

export const OPTIONS_KEY = 'lastferry.options';
export const RUNS_KEY = 'lastferry.runs';

const num01 = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? clamp01(v) : d);

export function loadOptions(): Options {
  const o: Options = { ...DEFAULT_OPTIONS };
  const raw = storageGet<Partial<Options>>(OPTIONS_KEY);
  if (!raw || typeof raw !== 'object') return o;
  o.masterVolume = num01(raw.masterVolume, o.masterVolume);
  o.sfxVolume = num01(raw.sfxVolume, o.sfxVolume);
  o.musicVolume = num01(raw.musicVolume, o.musicVolume);
  o.shake = num01(raw.shake, o.shake);
  if (raw.quality === 'low' || raw.quality === 'medium' || raw.quality === 'high') o.quality = raw.quality;
  if (raw.blood === 'low' || raw.blood === 'normal' || raw.blood === 'max') o.blood = raw.blood;
  if (typeof raw.showFps === 'boolean') o.showFps = raw.showFps;
  return o;
}

export function saveOptions(o: Options): void {
  storageSet(OPTIONS_KEY, o);
}

/** Everything the results screens show (the app fills it from the run). */
export interface RunStats {
  /** Chapter reached (1..3) and its name. */
  chapter: number;
  chapterName: string;
  /** Seconds played (game time). */
  timeSec: number;
  kills: number;
  headshots: number;
  /** Trigger pulls and pulls that hit something (accuracy). */
  shots: number;
  hits: number;
  moneyEarned: number;
  moneyLeft?: number;
  niceShots: number;
  /** Most kills with one trigger pull. */
  bestNiceShot: number;
  favouriteWeapon: WeaponId | null;
  /** Downed bodies / crawlers stomped for good. */
  corpsesStomped: number;
  /** Crawlers (risen bodies) put down. */
  risenKilled?: number;
  /** Bodies pinned by three nails. */
  bodiesNailed?: number;
  /** Survivors aboard across all chapters. */
  passengersSaved?: number;
  killsByKind?: Partial<Record<ZombieKind, number>>;
  weaponsBought?: WeaponId[];
  /** Horn blasts, cannon strikes, crane drops used. */
  hornsUsed?: number;
  cannonStrikes?: number;
  craneDrops?: number;
}

export interface RunRecord {
  kills: number;
  money: number;
  chapter: number;
  timeSec: number;
  victory: boolean;
  date: number;
}

export function loadRuns(): RunRecord[] {
  const raw = storageGet<RunRecord[]>(RUNS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r) => r && typeof r.kills === 'number' && typeof r.money === 'number' && typeof r.chapter === 'number' && isFinite(r.kills),
  );
}

export const byRun = (a: RunRecord, b: RunRecord) =>
  Number(b.victory) - Number(a.victory) || b.chapter - a.chapter || b.kills - a.kills || b.money - a.money;

export function saveRuns(runs: RunRecord[]): void {
  storageSet(RUNS_KEY, runs.sort(byRun).slice(0, 10));
}
