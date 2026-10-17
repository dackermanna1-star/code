// STUB — replaced by the portraits agent. Exports: initPortraits(), getPortrait(char, expr, opts) → 96×120 canvas.
import { makeCanvas, ctxOf, hashStr, tinyText } from './util.js';
const cache = new Map();
export async function initPortraits() {}
export function getPortrait(char, expr = 'neutral', opts = {}) {
  const key = `${char}|${expr}|${opts.light || ''}|${opts.grime || 0}|${opts.enrolled ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const c = makeCanvas(96, 120); const x = ctxOf(c);
  x.fillStyle = `hsl(${hashStr(char) % 360},30%,30%)`; x.fillRect(0, 0, 96, 120);
  tinyText(x, 4, 4, char, '#fff'); tinyText(x, 4, 12, expr, '#ff0');
  cache.set(key, c); return c;
}
