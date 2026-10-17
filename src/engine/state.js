// Game state (TECH §7) and save slots.
// HW.state is a plain JSON-safe object; everything that must survive a save lives in it.
import { storage } from './storage.js';

export const STATE_VERSION = 1;

/** Chapter title cards (DESIGN §6). Index = chapter number; 9 = epilogue. */
export const CHAPTER_TITLES = [
  'PROLOGUE — Kettle Run', 'I — After Hours', 'II — First Period', 'III — Custodial', 'IV — Attendance',
  'V — Upstairs', 'VI — Passing Time', 'VII — Assembly', 'VIII — The Register', 'EPILOGUE',
];

/** Tess's bag at the start of the night (DESIGN §3). */
export const STARTING_INVENTORY = Object.freeze({
  flashlight: 1, sketchbook: 1, compact: 1, transfer_form: 1, mixtape: 1, gum: 1, house_key: 1,
});

export function createState() {
  return {
    version: STATE_VERSION, chapter: 0, map: 'exterior', px: 0, py: 0, dir: 'down',
    flags: {},
    inv: { ...STARTING_INVENTORY },
    docs: {},
    objective: '',
    party: [],
    battery: 100,
    flashlightOn: true,
    rollAnswered: 0,
    bonds: { danny: false, leah: false, marcus: false },
    visited: {},
    mapState: {},
    playtime: 0,
    // Engine additions (DESIGN v2): last checkpoint label, assist multiplier (1 | 1.3),
    // active light source ('maglite' | 'danny'), lights attached to entities by id,
    // explicit light-group switches (group → bool; HW.lighting.setGroup, v2.2).
    checkpoint: '',
    assist: 1,
    lightSource: 'maglite',
    entityLights: {},
    lightGroups: {},
  };
}

/** Fill keys missing from an older/partial state so the rest of the engine can rely on them. */
export function normalizeState(s) {
  const base = createState();
  const out = { ...base, ...(s || {}) };
  for (const k of ['flags', 'inv', 'docs', 'visited', 'mapState', 'bonds', 'entityLights', 'lightGroups']) {
    if (!out[k] || typeof out[k] !== 'object' || Array.isArray(out[k])) out[k] = base[k];
  }
  if (!Array.isArray(out.party)) out.party = [];
  out.version = STATE_VERSION;
  return out;
}

export const cloneState = (s) => JSON.parse(JSON.stringify(s));

export const chapterTitle = (n) => CHAPTER_TITLES[n] ?? `Chapter ${n}`;

/** 'IV — Attendance' → ['IV', 'Attendance'] (title card: big title + subtitle). */
export function splitChapterTitle(n) {
  const t = chapterTitle(n);
  const i = t.indexOf(' — ');
  return i < 0 ? [t, ''] : [t.slice(0, i), t.slice(i + 3)];
}

// ---------------------------------------------------------------------------------------------
// Save slots: localStorage['hallowell.save.<slot>'] = JSON { v, summary, state }.

export const SAVE_SLOTS = ['auto', '1', '2', '3'];
const slotKey = (slot) => `hallowell.save.${slot}`;

export const saves = {
  write(slot, state, summary) {
    return storage.set(slotKey(slot), JSON.stringify({ v: STATE_VERSION, summary, state }));
  },

  /** → { summary, state } | null (missing or corrupt). */
  read(slot) {
    const raw = storage.get(slotKey(slot));
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || !data.state || typeof data.state !== 'object') return null;
      return { summary: data.summary || null, state: normalizeState(data.state) };
    } catch {
      console.warn(`[saves] slot ${slot} is corrupt`);
      return null;
    }
  },

  exists(slot) {
    return !!this.read(slot);
  },

  /** → [{ slot, summary | null }] for every slot, in display order. */
  list() {
    return SAVE_SLOTS.map((slot) => ({ slot, summary: this.read(slot)?.summary || null }));
  },

  remove(slot) {
    storage.remove(slotKey(slot));
  },
};
