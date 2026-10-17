// CG illustrations (480×270 full-screen moments). getCg(id) → { draw(ctx, t, params) }.
// The Colonel's CGs (COLONEL_CG_IDS) are delegated to cg_colonel.js (the Colonel agent's module).
// Ours live in cg_*.js; each builds its static layers lazily (once) and animates cheap overlays per frame.
// initCg() builds title_bg and car_interior up front and prebuilds the rest in idle time.
import { tinyText } from './util.js';
import { COLONEL_CG_IDS, getColonelCg, initColonelCg, warmColonelCg } from './cg_colonel.js';
import { background } from './cg_kit.js';
import { titleBg, prepTitle } from './cg_title.js';
import { carInterior, prepCar } from './cg_car.js';
import { registerBook, prepRegister } from './cg_register.js';
import { breakerReveal, prepBreaker } from './cg_breaker.js';
import { endingDawn, prepDawn } from './cg_dawn.js';
import { endingPresent, prepPresent } from './cg_present.js';
import { endingTruant, prepTruant } from './cg_truant.js';
import { coda2013, prepCoda } from './cg_coda.js';

export const CG_IDS = ['car_interior', 'title_bg', 'register_book', 'breaker_reveal', 'ending_dawn', 'ending_present', 'ending_truant', 'coda_2013'];
const MINE = {
  title_bg: titleBg, car_interior: carInterior, register_book: registerBook, breaker_reveal: breakerReveal,
  ending_dawn: endingDawn, ending_present: endingPresent, ending_truant: endingTruant, coda_2013: coda2013,
};
// late-game CGs: built in the background, one paint pass per idle period, once the title has settled
// (a CG asked to draw before its build finishes completes it on the spot)
const LATE = [prepRegister, prepBreaker, prepDawn, prepPresent, prepTruant, prepCoda];

export async function initCg() {
  await initColonelCg();
  prepTitle();          // on screen right after boot
  prepCar();            // the prologue's first image
  background(LATE, { delay: 2500 });
}

// Each CG's build ("prep") function: calling one finishes that CG's layers synchronously.
const PREP = {
  title_bg: prepTitle, car_interior: prepCar, register_book: prepRegister, breaker_reveal: prepBreaker,
  ending_dawn: prepDawn, ending_present: prepPresent, ending_truant: prepTruant, coda_2013: prepCoda,
};

/**
 * Pre-build one CG ahead of the scene that shows it (avoids a first-draw hitch): the Colonel's CGs
 * go to cg_colonel.js warmColonelCg(id); the others finish their staged build now. Unknown ids: no-op.
 */
export function warmCg(id) {
  try {
    if (COLONEL_CG_IDS.includes(id)) warmColonelCg?.(id);
    else if (typeof PREP[id] === 'function') PREP[id]();
  } catch (e) {
    console.error(`[cg] warm ${id} failed`, e);
  }
}

const fallback = new Map();
export function getCg(id) {
  if (COLONEL_CG_IDS.includes(id)) return getColonelCg(id);
  if (MINE[id]) return MINE[id];
  if (!fallback.has(id)) {
    fallback.set(id, { draw(ctx) { ctx.fillStyle = '#0b0c12'; ctx.fillRect(0, 0, 480, 270); tinyText(ctx, 8, 8, 'CG ' + id, '#555'); } });
  }
  return fallback.get(id);
}
