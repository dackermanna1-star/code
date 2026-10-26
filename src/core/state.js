// Persistent game state + save/load.
import { G } from '../game.js';

const KEY = 'homebody.save.v1';
export const START_MINUTES = 9 * 60 + 30; // Day 1, 9:30 AM

export function defaultState() {
  return {
    version: 1,
    createdAt: Date.now(),
    money: 850,
    xp: 0,
    level: 1,
    time: START_MINUTES,
    weather: { kind: 'clear', intensity: 0, nextChange: START_MINUTES + 180 },
    needs: { hunger: 72, thirst: 65, energy: 85, hygiene: 70, fun: 60, comfort: 70 },
    buffs: [],
    items: [],
    outfit: { hat: null, top: null, bottom: null, shoes: null, glasses: null, accessory: null },
    orders: [],
    orderSeq: 1000,
    carts: {},
    messages: { threads: {}, unread: 0 },
    goals: { daily: [], dailyDay: 0, done: {}, counters: {} },
    discovered: {},
    collection: {},
    stats: { ordersPlaced: 0, spent: 0, earned: 0, eaten: 0, drank: 0, showers: 0, gigs: 0, gamesPlayed: 0, itemsPlaced: 0, slept: 0, boxesOpened: 0 },
    home: {
      lights: { living: true, kitchen: true, entry: false, bedroom: false, bath: false, closet: false },
      lightColor: { living: '#ffd8a8', kitchen: '#fff1dc', entry: '#ffe2bd', bedroom: '#ffd0a0', bath: '#f4f6ff', closet: '#fff0d8' },
      walls: { living: '#e9e4dc', kitchen: '#eeeae4', entry: '#e9e4dc', bedroom: '#d9dfe3', bath: '#eef1f2', closet: '#e7e1d8' },
      floors: { living: 'oak', kitchen: 'tile_white', entry: 'oak', bedroom: 'oak', bath: 'tile_terrazzo', closet: 'oak' },
      blinds: { living: 0, bedroom: 0 },
      thermostat: 21,
      unlockedFinishes: ['oak', 'tile_white', 'tile_terrazzo'],
    },
    settings: { quality: 'medium', sensitivity: 1, fov: 72, volumes: { master: 0.8, sfx: 0.9, music: 0.7, ambience: 0.7 }, timeScale: 1, invertY: false, showNeeds: true, autoStoreDeliveries: false },
    market: { seed: Math.floor(Math.random() * 1e9), day: 0 },
    games: [],
    phone: { wallpaper: 0, music: { station: 'lofi', playing: false } },
    tutorial: { step: 0, done: false },
    photos: [],
    flags: {},
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.version !== 1) return null;
    // merge with defaults so new fields get filled in
    return deepMerge(defaultState(), s);
  } catch (e) {
    console.warn('Failed to load save', e);
    return null;
  }
}

function deepMerge(base, over) {
  if (Array.isArray(base) || Array.isArray(over)) return over ?? base;
  if (typeof base !== 'object' || base === null) return over ?? base;
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    out[k] = (typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k])) ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}

export function hasSave() { try { return !!localStorage.getItem(KEY); } catch { return false; } }

let saveQueued = false;
export function saveState() {
  if (!G.state) return;
  try {
    G.events?.emit('beforeSave');
    localStorage.setItem(KEY, JSON.stringify(G.state));
    G.events?.emit('saved');
  } catch (e) { console.warn('save failed', e); }
}
export function queueSave() {
  if (saveQueued) return;
  saveQueued = true;
  setTimeout(() => { saveQueued = false; saveState(); }, 800);
}
export function wipeSave() { try { localStorage.removeItem(KEY); } catch { /* noop */ } }
