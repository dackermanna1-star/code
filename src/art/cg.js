// CG illustrations (480×270 full-screen moments). getCg(id) → { draw(ctx, t, params) }.
// The Colonel's CGs (COLONEL_CG_IDS) are delegated to cg_colonel.js (the Colonel agent's module).
// Ours live in cg_*.js; each builds its static layers lazily (once) and animates cheap overlays per frame.
// initCg() builds title_bg up front (it shows right after boot) and queues the rest on idle ticks.
import { tinyText } from './util.js';
import { COLONEL_CG_IDS, getColonelCg, initColonelCg } from './cg_colonel.js';
import { idle } from './cg_kit.js';
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
// prologue first: it is the first CG a new game shows
const PREP = [prepCar, prepRegister, prepBreaker, prepDawn, prepPresent, prepTruant, prepCoda];

export async function initCg() {
  await initColonelCg();
  prepTitle();
  for (const p of PREP) idle(p);
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
