// Sounds contributed by other modules (the levels' own sound files in src/audio/levels/).
// sounds.js merges these into its tables, so the bank worker builds them like any other sound.
// Definitions use the same shape as the tables in sounds.js:
//   defineShot(name, { n, dur, sr?, peak?, gen(S, k) })   one-shot, k = variant 0..n-1
//   defineLoop(name, { L, sr?, norm?, gen(S, L) })        positional loop: zb.emitter(x, y, z, name)
//   defineBed(name,  { L, sr?, norm?, gen(S, L) })        room tone: name 'tone_<x>' is used by env.tone = '<x>'
//   defineUi(name,   { dur, gen(S) })                     interface blip
// gen may be a generator function that yields between heavy steps (see sounds.js).
export const EXTRA = { shots: {}, loops: {}, beds: {}, ui: {} };
export function defineShot(name, def) { EXTRA.shots[name] = def; }
export function defineLoop(name, def) { EXTRA.loops[name] = def; }
export function defineBed(name, def) { EXTRA.beds[name] = def; }
export function defineUi(name, def) { EXTRA.ui[name] = def; }
