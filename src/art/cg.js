// STUB — replaced by the CG agent. Exports: initCg(), getCg(id) → { draw(ctx, t, params) }.
import { tinyText } from './util.js';
export async function initCg() {}
export function getCg(id) {
  return { draw(ctx) { ctx.fillStyle = '#0b0c12'; ctx.fillRect(0, 0, 480, 270); tinyText(ctx, 8, 8, 'CG ' + id, '#888'); } };
}
