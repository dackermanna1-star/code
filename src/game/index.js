// Game systems entry point (CONTENT.md §5). main.js calls installGameSystems() once at boot, after the
// engine's own systems (flashlight, hiding, compact) are registered.
//
// Registers, in update order (HW.game.addSystem):
//   HW.noise     noise.js       sound events → listeners (first, so everyone hears this step's noises)
//   HW.periods   periods.js     bells, period lights, free-period schedule, followers sit, hall clocks
//   HW.colonel   colonel_ai.js  the Colonel: patrol / peeks / vision / hearing / chase / catch / shroud
//   HW.patrol    patrol.js      Kevin Hoyt, Safety Patrol sentinels (whistle on running)
//   HW.basement  basement.js    the sleeper in the coal heap (stir rules)
//   HW.longhall  longhall.js    the looping long hall (hall pass)
//   HW.assembly  assembly.js    the Assembly cycle (READ / telegraph / SCAN), roll #3 hook
//   HW.chase     chase.js       chase set pieces (gym, Ch8 escape)
//   HW.breaker   breaker.js     the breaker boys' cap-lamps
// Each file's header documents its API. Chapter setup lives in chapters.js (HW.game.chapterSetup);
// chapters.js / endings.js may export install hooks (installChapters / installEndings / install),
// which are called here when present.
import HW from '../engine/hw.js';
import * as chaptersModule from './chapters.js';
import * as endingsModule from './endings.js';
import { chapterSetup } from './chapters.js';
import noise from './noise.js';
import periods from './periods.js';
import colonel from './colonel_ai.js';
import patrol from './patrol.js';
import basement from './basement.js';
import longhall from './longhall.js';
import assembly from './assembly.js';
import chase from './chase.js';
import breaker from './breaker.js';

const SERVICES = { noise, periods, colonel, patrol, basement, longhall, assembly, chase, breaker };
const ORDER = [noise, periods, colonel, patrol, basement, longhall, assembly, chase, breaker];
const META_HOOKS = [
  [chaptersModule, ['installChapters', 'install']],
  [endingsModule, ['installEndings', 'install']],
];

let installed = false;

export function installGameSystems() {
  if (installed) return;
  installed = true;
  Object.assign(HW, SERVICES);
  for (const s of ORDER) HW.game.addSystem(s);
  HW.game.chapterSetup = chapterSetup;
  // Optional boot hooks of the chapter/ending modules (looked up by name: either may be absent).
  for (const [mod, names] of META_HOOKS) {
    for (const name of names) {
      const fn = mod[name];
      if (typeof fn !== 'function') continue;
      try { fn(HW); } catch (e) { console.error(`[game] ${name} failed`, e); }
      break;
    }
  }
  if (!HW.endings) HW.endings = endingsModule.default || endingsModule;
}

export default installGameSystems;
