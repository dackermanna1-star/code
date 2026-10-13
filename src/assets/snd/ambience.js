// The map ambience loops (SOUND_GROUPS 'Map ambience', recipes.js): one module per map,
// each owned by its map's builder. These are synthesised lazily - only the loaded map's
// loop, when main.js asks for it (SoundEngine.ensure) - so more maps never slow the load.
// A recipe: { dur (s, the loop length), loop: 1.0 (crossfade s), stereo, rms, rate, fn(P) }.
import { AMB as fortember } from './amb_fortember.js';
import { AMB as hollowcreek } from './amb_hollowcreek.js';
import { AMB as sector9 } from './amb_sector9.js';
import { AMB as blackwater } from './amb_blackwater.js';

export const MAP_AMBIENCE = { ...fortember, ...hollowcreek, ...sector9, ...blackwater };
