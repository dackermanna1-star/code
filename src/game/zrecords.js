// Zombie survival records: the most waves survived, one for every map, difficulty and squad
// size, in localStorage under BEST_KEY as JSON: { "<map>|<diff>|<squad>": waves, legacy?: n }.
//  - <diff> is the preset id, +hc when hardcore, +fixed with squad scaling off
//  - <squad> is how many guns the squad has (you and the bots), bucketed: 1, 2-3, 4-6, 7+
//  - legacy is the single record from before difficulties existed (a bare number under the
//    same key). Those runs had $16000 and bought anything, anywhere: Sandbox today. So it
//    stands as the best of every Sandbox setup until a Sandbox run there beats it, and every
//    other difficulty starts from nothing.
// ZombieMode keeps the API (best, bestBefore, isNewBest, loadBest, saveBest); this file is
// the storage. Nothing here runs per tick.

/* global localStorage */
export const BEST_KEY = 'cs16-zombies-best';

/** The squad-size part of a record's key, from how many guns the squad has. */
export function squadBucket(guns) {
  return guns <= 1 ? '1' : guns <= 3 ? '2-3' : guns <= 6 ? '4-6' : '7+';
}

/** The key of the record for a map, a run's difficulty (g.zombies.diff) and squad size. */
export function recordKey(map, diff, guns) {
  return `${map || 'map'}|${diff.id}${diff.hardcore ? '+hc' : ''}${diff.squadScaling === false ? '+fixed' : ''}|${squadBucket(guns)}`;
}

/** Every record ({ key: waves }, maybe legacy), the old single number migrated. {} if storage is blocked. */
export function loadRecords() {
  let raw = null;
  try { raw = localStorage.getItem(BEST_KEY); } catch { return {}; } // (storage blocked)
  if (!raw) return {};
  let v = null;
  try { v = JSON.parse(raw); } catch { v = null; }
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  // the old format: one number for everything
  const n = Math.floor(+raw) || 0;
  const recs = n > 0 ? { legacy: n } : {};
  store(recs);
  return recs;
}

/** The best for a key (see recordKey); Sandbox setups fall back on the legacy record. */
export function readRecord(key, recs = loadRecords()) {
  const v = +recs[key] || 0;
  const legacy = /^[^|]*\|sandbox(\+fixed)?\|/.test(key) ? +recs.legacy || 0 : 0;
  return Math.max(v, legacy);
}

/** Keep waves as the record for key if it beats what's there. Returns whether it did. */
export function writeRecord(key, waves) {
  const recs = loadRecords();
  if (!(waves > readRecord(key, recs))) return false;
  recs[key] = waves;
  return store(recs);
}

function store(recs) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(recs)); return true; } catch { return false; } // (storage blocked)
}
