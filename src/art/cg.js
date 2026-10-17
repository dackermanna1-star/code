// STUB — replaced by the CG agent. Exports: initCg(), getCg(id) → { draw(ctx, t, params) }.
import { tinyText } from './util.js';
import { COLONEL_CG_IDS, getColonelCg, initColonelCg } from './cg_colonel.js';
export async function initCg() { await initColonelCg(); }
export function getCg(id) {
  if (COLONEL_CG_IDS.includes(id)) return getColonelCg(id);
  return { draw(ctx) { ctx.fillStyle = '#0b0c12'; ctx.fillRect(0, 0, 480, 270); tinyText(ctx, 8, 8, 'CG ' + id, '#888'); } };
}
