// STUB — replaced by the colonel agent. Exports: COLONEL_CG_IDS, initColonelCg(), getColonelCg(id) → { draw(ctx, t, params) }.
import { tinyText } from './util.js';
export const COLONEL_CG_IDS = ['colonel_hand', 'colonel_face', 'locker_slits', 'vhs_frames'];
export async function initColonelCg() {}
export function getColonelCg(id) {
  return { draw(ctx, t, p = {}) { ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, 480, 270); tinyText(ctx, 8, 8, `CG ${id} ${JSON.stringify(p)}`, '#a33'); } };
}
