// STUB — replaced by the CG/icons agent. Exports: initIcons(), getIcon(itemId) → 24×24, getGlyph(name).
import { makeCanvas, ctxOf, hashStr, tinyText } from './util.js';
const cache = new Map();
export async function initIcons() {}
export function getIcon(id) {
  if (cache.has(id)) return cache.get(id);
  const c = makeCanvas(24, 24); const x = ctxOf(c);
  x.fillStyle = `hsl(${hashStr(id) % 360},40%,40%)`; x.fillRect(2, 2, 20, 20); tinyText(x, 3, 9, id.slice(0, 5), '#fff');
  cache.set(id, c); return c;
}
export function getGlyph(name) { return getIcon('g_' + name); }
