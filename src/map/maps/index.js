// The built-in maps, in menu order: one module per map (src/map/maps/<id>.js), each owned by
// its builder. A module exports
//   MAP     - the map's definition: data only (see MAP_DEFAULTS below and /tmp/zm/m5-contracts.md)
//   build() - builds the brushes, lights and entities: returns a MapDSL / AreaMap with
//             { brushes, lights, entities, bounds: [x0, y0, x1, y1] } (deterministic: no
//             unseeded randomness, or the lightmap hash changes every load)
// DOM-free: tools/bake.mjs and tools/mapstats.mjs build maps in node.
import * as de_dust2 from './de_dust2.js';
import * as zm_fort_ember from './zm_fort_ember.js';
import * as zm_hollow_creek from './zm_hollow_creek.js';
import * as zm_sector9 from './zm_sector9.js';
import * as zm_blackwater from './zm_blackwater.js';

const MODULES = [de_dust2, zm_fort_ember, zm_hollow_creek, zm_sector9, zm_blackwater];

// Placeholder maps, unlisted until the maps work resumes: every player-facing list (New Game,
// Zombie Survival setup, the title, records) skips a `hidden` map (maps.js mapListed), but
// ?map=<id> and the `map` console command still load one for development. Remove an id here
// to ship that map.
export const HIDDEN_MAPS = new Set(['zm_fort_ember', 'zm_hollow_creek', 'zm_sector9', 'zm_blackwater']);

/** What a definition gets when it leaves a field out (lighting is never filled in: it is hashed). */
export const MAP_DEFAULTS = {
  mode: 'survival', // the classic briefing's kind ('bomb' | 'hostage'); survival maps have none
  modes: ['zombies'], // which game modes offer the map: 'zombies', 'classic'
  tagline: '', blurb: '', mood: [],
  squad: { min: 1, best: 4, max: 11 }, // you + bots: what the map is built for
  sky: { preset: 'dust' }, fog: null, grade: null,
  ambience: { loop: 'ambience_wind', volume: 0.35 },
  textures: 'shared', // its texture pack (src/assets/tex/<pack>.js)
  zones: null, // callout boxes [name, tag, x0, y0, x1, y1, zMin, zMax] (null: bots.js's dust2 table)
  fronts: null, // horde fronts (null: director.js's ZOMBIE_FRONTS for this id, else clustered)
  squadStart: null, buyArea: null, extraction: [], objectives: [], titleShots: [], thumbShot: null, hazards: [],
};

function normalize(mod) {
  const M = mod.MAP;
  if (!M?.id || typeof mod.build !== 'function') throw new Error('maps: a built-in map module needs MAP.id and build()');
  if (!M.lighting?.sunDir) throw new Error(`maps: ${M.id} needs MAP.lighting with sunDir`);
  return { ...MAP_DEFAULTS, ...M, builtin: true, hidden: HIDDEN_MAPS.has(M.id), build: mod.build, thumb: `maps/${M.id}.thumb.jpg` };
}

/** Normalised definitions, in menu order. */
export const BUILTIN_MAPS = MODULES.map(normalize);

/** id -> definition */
export const BUILTIN = Object.fromEntries(BUILTIN_MAPS.map((d) => [d.id, d]));
