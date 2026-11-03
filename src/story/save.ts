/**
 * The story's progress, kept in the browser: which chapters are open, the best grade and time in
 * each, and the checkpoint a chapter in progress was left at (with what the player had then).
 * A launch - a chapter at a checkpoint - goes through sessionStorage across the reload that builds
 * its map.
 */
export interface CheckpointState {
  chapter: number;
  cp: number;
  hp: number;
  /** Seconds played up to the checkpoint, retries so far, the player's stats then. */
  time: number;
  retries: number;
  stats: Record<string, number>;
  bestCombo: number;
  /** The pistol: taken yet, and the rounds in it. */
  pistol: boolean;
  specialCharges: number;
  specialKOs: number;
  charges: number;
  /** Where the bodies lay (x, z, variant, and the floor's height): the fallen are still there when you come back. */
  bodies: ([number, number, string] | [number, number, string, number])[];
  /** The chapter's own notes (where the doorman fell, what she's taken). */
  flags?: Record<string, unknown>;
}

export interface StoryProgress {
  /** Chapters open (0 is always). */
  unlocked: number;
  best: Record<number, { grade: string; time: number }>;
  /** A chapter left mid-way: CONTINUE picks it up here. */
  resume: CheckpointState | null;
  /** What she's found along the way (the journal: notes, photos, evidence) by id. */
  found: string[];
}

export interface StoryLaunch {
  chapter: number;
  cp: number;
  /** Retrying after a death: the state to restore (null: a fresh start of the chapter). */
  state: CheckpointState | null;
}

const KEY = 'last-stance-story-v1';
const LAUNCH = 'last-stance-story-launch';

export function loadProgress(): StoryProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<StoryProgress>;
      return { unlocked: Math.max(0, Number(p.unlocked ?? 0)), best: p.best ?? {}, resume: p.resume ?? null, found: Array.isArray(p.found) ? p.found : [] };
    }
  } catch {
    /* storage unavailable */
  }
  return { unlocked: 0, best: {}, resume: null, found: [] };
}

export function saveProgress(p: StoryProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Start a chapter (at a checkpoint, with a state to restore): the page reloads into it. */
export function launchStory(l: StoryLaunch) {
  try {
    sessionStorage.setItem(LAUNCH, JSON.stringify(l));
  } catch {
    /* ignore */
  }
  location.reload();
}

/** The launch this page was loaded for (consumed), or one asked for in the address (tests). */
export function takeLaunch(params: URLSearchParams): StoryLaunch | null {
  try {
    const raw = sessionStorage.getItem(LAUNCH);
    if (raw) {
      sessionStorage.removeItem(LAUNCH);
      const l = JSON.parse(raw) as StoryLaunch;
      if (typeof l.chapter === 'number') return { chapter: l.chapter, cp: Number(l.cp ?? 0), state: l.state ?? null };
    }
  } catch {
    /* ignore */
  }
  const s = params.get('story');
  if (s !== null && s !== '' && !Number.isNaN(Number(s))) return { chapter: Number(s), cp: Number(params.get('cp') ?? 0), state: null };
  return null;
}

/** Grade a chapter run: flow, clean defence, taking little damage, not dying, and pace. */
export function gradeRun(r: { time: number; par: number; bestCombo: number; perfectCounters: number; damageTaken: number; retries: number; finishers: number; envKills: number; takedowns: number }) {
  let pts = 0;
  pts += Math.min(28, r.bestCombo * 1.1);
  pts += Math.min(18, r.perfectCounters * 1.8);
  pts += Math.max(0, 26 - r.damageTaken * 0.09);
  pts += Math.min(10, (r.finishers + r.envKills + r.takedowns) * 1.25);
  pts += r.time <= r.par ? 18 : Math.max(0, 18 - ((r.time - r.par) / r.par) * 36);
  pts -= r.retries * 8;
  const grade = pts >= 84 ? 'S' : pts >= 68 ? 'A' : pts >= 50 ? 'B' : pts >= 32 ? 'C' : 'D';
  return { grade, pts: Math.round(pts) };
}

export const GRADE_ORDER = ['D', 'C', 'B', 'A', 'S'];
export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
