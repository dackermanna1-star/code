// Chapters — what is true for the whole of each chapter (TECH §11, CONTENT §5, DESIGN §4.1, §6, §14).
//
// chapterSetup(n) runs from g.chapter(n) (engine/script.js) after the title card and before the
// chapter's own start script: party composition, period config, the default objective, chapter-wide
// flags and the drone. Chapter-start scripts may override any of it right afterwards.
//
// Helpers the rest of the game reads (also on HW.chapters):
//   actFor(n) / HW.game.act       audio act 1 (Pro–Ch2) · 2 (Ch3–5) · 3 (Ch6–8): the intercom chime drops a
//                                 semitone per act → chimeRate(n) = 2 ** (-(act - 1) / 12)
//   droneFor(n) / wantDrone()     passing-time drone for the chapter (null = silence); periods suspend it
//   grimeFor(n)                   portrait grime 0 → 1 from Ch3 → 2 from Ch6
//   tessEnrolled(state)           Tess's `enrolled` portrait level 0 / 1 / 2 (rollAnswered: 1 = catchlight, ≥2 = sheen)
//
// installChapters() (called by game/index.js) also re-opens Ch5's free periods when the flag that opens
// them is set, and after a reload (HW.periods persists its config too; this is belt and braces).
import HW from '../engine/hw.js';

/** Free-period settings for Ch5 (DESIGN §4.1): east2 + west2, passing 150 s, period ≤ 60 s, max 3. */
export const CH5_PERIODS = Object.freeze({ maps: ['east2', 'west2'], passing: 150, length: 60, max: 3 });

/**
 * Per-chapter table. party: follower ids (null = leave as is) · objective: default when the chapter starts
 * · periods: free-period config or null (scripted / none) · periodsAfter: flag that must be set before the
 * free periods begin · flags: set at chapter start · drone: passing-time music.
 */
export const CHAPTERS = [
  /* 0 PROLOGUE — Kettle Run */ { party: ['danny', 'leah', 'marcus'], objective: 'Get inside.', periods: null, drone: null },
  /* 1 I — After Hours      */ { party: ['danny', 'leah', 'marcus'], objective: 'Look around.', periods: null, drone: null },
  /* 2 II — First Period    */ { party: ['leah', 'marcus'], objective: 'Get in a room. Sit down.', periods: null, drone: null },
  /* 3 III — Custodial      */ { party: ['marcus'], objective: "Find the janitor's keys.", periods: null, drone: 'drone_1' },
  /* 4 IV — Attendance      */ { party: ['marcus'], objective: 'The main office. The intercom.', periods: null, drone: 'drone_2' },
  /* 5 V — Upstairs         */ { party: ['marcus'], objective: "Danny's upstairs. Room 205.", periods: CH5_PERIODS, periodsAfter: 'ch5_205_period_done', drone: 'drone_2' },
  /* 6 VI — Passing Time    */ { party: ['marcus'], objective: "Haupt's office. The safe.", periods: null, drone: 'drone_3', droneOff: 'ch6_marcus_taken' },
  /* 7 VII — Assembly       */ { party: [], objective: 'The auditorium.', periods: null, drone: null, flags: { ch7_started: true } },
  /* 8 VIII — The Register  */ { party: [], objective: 'Go down.', periods: null, drone: null },
  /* 9 EPILOGUE             */ { party: null, objective: '', periods: null, drone: null },
];

const clampCh = (n) => Math.max(0, Math.min(CHAPTERS.length - 1, Number(n) | 0));
export const chapterConfig = (n) => CHAPTERS[clampCh(n)];

/** Audio act: 1 = Prologue–Ch2, 2 = Ch3–5, 3 = Ch6–8 (and the epilogue). */
export const actFor = (n) => (n <= 2 ? 1 : n <= 5 ? 2 : 3);
/** Playback rate for 'intercom_chime': one semitone lower per act. */
export const chimeRate = (n) => 2 ** (-(actFor(n) - 1) / 12);
export const droneFor = (n) => chapterConfig(n).drone;
/** The drone that should be playing right now in passing time (null after the chapter's `droneOff` flag). */
export function wantDrone(n = HW.state?.chapter ?? 0, s = HW.state) {
  const c = chapterConfig(n);
  if (!c.drone || (c.droneOff && s?.flags?.[c.droneOff])) return null;
  return c.drone;
}
/** Portrait grime by chapter (DESIGN §13). Matches engine/script.js and the UI's default. */
export const grimeFor = (n) => (n <= 2 ? 0 : n <= 5 ? 1 : 2);
/** Tess's `enrolled` portrait level from her answers: 0 none · 1 amber catchlight · 2 + husk sheen (DESIGN §7). */
export function tessEnrolled(s = HW.state) {
  const r = Number.isFinite(s?.rollAnswered) ? s.rollAnswered
    : ['roll1_answered', 'roll2_answered', 'roll3_answered'].filter((k) => s?.flags?.[k]).length;
  return Math.max(0, Math.min(2, r));
}

/**
 * Apply the chapter's free-period setting. At chapter start (authoritative) it enables or disables;
 * with `{ onlyOpen: true }` (reload, the opening flag) it only ever turns them on, so a period config a
 * script set for itself is never undone. Guarded if HW.periods is missing.
 */
export function applyPeriods(n = HW.state?.chapter ?? 0, { onlyOpen = false } = {}) {
  const P = HW.periods;
  if (!P) return false;
  const cfg = chapterConfig(n);
  const open = !!cfg.periods && (!cfg.periodsAfter || !!HW.state?.flags?.[cfg.periodsAfter]);
  try {
    if (open) { if (!(onlyOpen && P.enabled)) P.enable?.({ ...cfg.periods, maps: cfg.periods.maps.slice() }); }
    else if (!onlyOpen) P.disable?.();
  } catch (e) {
    console.error('[chapters] periods config failed', e);
  }
  return open;
}

/** True while a period has silenced the chapter's drone (it comes back at the dismissal). */
let droneSuspended = false;
function setMusic(id, fade) {
  try { HW.audio?.music?.(id || null, fade); } catch (e) { console.error('[chapters] drone', e); }
}

/** Party for the chapter (null = untouched). Followers are synced by g.chapter's refresh(). */
function applyParty(cfg) {
  if (!cfg.party || !HW.state) return;
  HW.state.party = cfg.party.slice();
  HW.entities?.syncParty?.();
}

/**
 * Chapter setup, run by g.chapter(n). Sets the default objective silently (no "Sketchbook updated"
 * notice — the chapter's start script usually sets its own right after).
 */
export function chapterSetup(n) {
  ensureInstalled();
  const s = HW.state;
  if (!s) return;
  const ch = clampCh(n);
  const cfg = CHAPTERS[ch];
  applyParty(cfg);
  if (cfg.flags) for (const [k, v] of Object.entries(cfg.flags)) if (s.flags[k] === undefined) s.flags[k] = v;
  if (cfg.objective !== undefined) s.objective = cfg.objective;
  applyPeriods(ch);
  // Drones play only in passing time from Ch3 (DESIGN §14); periods suspend them, scripts may silence them.
  droneSuspended = false;
  setMusic(wantDrone(ch), 3);
}

// ---------------------------------------------------------------------------------------------
// Installation: reactive bits that must also hold after a reload. Call installChapters() once at boot
// (game/index.js); chapterSetup() also installs lazily so nothing breaks if the index forgets.
let installed = false;

export function ensureInstalled() {
  if (installed || !HW.game?.on) return;
  installed = true;
  for (const [ev, fn] of [
    // HW.periods persists its own config in saves; this only re-opens what the chapter rules say is open.
    ['load', () => { applyPeriods(undefined, { onlyOpen: true }); droneSuspended = false; setMusic(wantDrone(), 2); }],
    // "Drones only in passing time": the chime silences the drone, the dismissal brings it back.
    ['periodWarning', () => { if (wantDrone()) { droneSuspended = true; setMusic(null, 2); } }],
    ['periodStart', () => { if (wantDrone() && !droneSuspended) { droneSuspended = true; setMusic(null, 1); } }],
    ['periodEnd', () => { if (droneSuspended) { droneSuspended = false; setMusic(wantDrone(), 4); } }],
    ['flag', (name, value) => {
      const cfg = chapterConfig(HW.state?.chapter ?? 0);
      if (value && cfg.periodsAfter && name === cfg.periodsAfter) applyPeriods(undefined, { onlyOpen: true });
    }],
  ]) HW.game.on(ev, fn);
  if (!Object.getOwnPropertyDescriptor(HW.game, 'act')) {
    Object.defineProperty(HW.game, 'act', { get: () => actFor(HW.state?.chapter ?? 0), configurable: true });
  }
  HW.chapters = { config: chapterConfig, actFor, chimeRate, droneFor, wantDrone, grimeFor, tessEnrolled, applyPeriods, setup: chapterSetup, CHAPTERS };
}

/** Boot hook for game/index.js: HW.game.chapterSetup + listeners + HW.chapters / HW.game.act. */
export function installChapters() {
  if (HW.game) HW.game.chapterSetup = chapterSetup;
  ensureInstalled();
}

export default { chapterSetup, installChapters, applyPeriods, actFor, chimeRate, droneFor, grimeFor, tessEnrolled, CHAPTERS };
