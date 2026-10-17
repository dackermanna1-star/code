// Game systems entry point (owner: systems agent — CONTENT.md §5). Called once at boot by main.js after the
// engine's own systems are registered. Register each system with HW.game.addSystem and expose its
// service on HW (HW.periods, HW.colonel, HW.noise, ...).
import HW from '../engine/hw.js';
import { chapterSetup } from './chapters.js';

export function installGameSystems() {
  HW.game.chapterSetup = chapterSetup;
}
export default installGameSystems;
