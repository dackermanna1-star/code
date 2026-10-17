// Build-time benchmark: times each CG's static build (prep*) and initIcons in a fresh page, then
// average per-frame draw cost. ?only=id to time a single CG.
import * as cg from '../../src/art/cg.js';
import { initIcons } from '../../src/art/icons.js';
import { prepTitle } from '../../src/art/cg_title.js';
import { prepCar } from '../../src/art/cg_car.js';
import { prepRegister } from '../../src/art/cg_register.js';
import { prepBreaker } from '../../src/art/cg_breaker.js';
import { prepDawn } from '../../src/art/cg_dawn.js';
import { prepPresent } from '../../src/art/cg_present.js';
import { prepTruant } from '../../src/art/cg_truant.js';
import { prepCoda } from '../../src/art/cg_coda.js';

const out = [];
const time = (label, fn) => { const t = performance.now(); fn(); out.push(`${label}: ${(performance.now() - t).toFixed(1)} ms`); };
const c = document.createElement('canvas'); c.width = 480; c.height = 270; const x = c.getContext('2d');
time('initIcons', () => initIcons());
const P = { title_bg: prepTitle, car_interior: prepCar, register_book: prepRegister, breaker_reveal: prepBreaker, ending_dawn: prepDawn, ending_present: prepPresent, ending_truant: prepTruant, coda_2013: prepCoda };
let total = 0;
for (const [id, fn] of Object.entries(P)) {
  const t = performance.now(); fn(); const ms = performance.now() - t; total += ms;
  const t2 = performance.now(); for (let i = 0; i < 120; i++) cg.getCg(id).draw(x, 2 + i / 60, { who: ['tess', 'danny', 'leah', 'marcus'], uniform: true }); const fr = (performance.now() - t2) / 120;
  out.push(`${id}: build ${ms.toFixed(1)} ms · draw ${fr.toFixed(2)} ms/frame`);
}
out.push(`total CG builds: ${total.toFixed(0)} ms`);
document.body.style.cssText = 'background:#111;color:#ddd;font:14px monospace;padding:10px;white-space:pre';
document.body.textContent = out.join('\n');
console.log(out.join(' | '));
window.__ready = true;
