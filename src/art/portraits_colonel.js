// STUB — replaced by the colonel agent. Export: getColonelPortrait(expr, opts) → 96×120 canvas.
import { makeCanvas, ctxOf, tinyText } from './util.js';
export async function initColonelPortraits() {}
export function getColonelPortrait(expr = 'serene') {
  const c = makeCanvas(96, 120); const x = ctxOf(c); x.fillStyle = '#5e4e4a'; x.fillRect(0, 0, 96, 120);
  x.fillStyle = '#bba79b'; x.fillRect(38, 40, 20, 24); tinyText(x, 4, 4, 'COLONEL ' + expr, '#fff'); return c;
}
