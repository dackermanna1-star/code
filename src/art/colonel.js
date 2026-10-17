// STUB — replaced by the colonel agent. Export: getColonelSprite() → sprite sheet (64×64 frames). See TECH §12.
import { makeCanvas, ctxOf } from './util.js';
let sheet = null;
export async function initColonel() {}
export function getColonelSprite() {
  if (sheet) return sheet;
  const f = () => { const c = makeCanvas(64, 64); const x = ctxOf(c); x.fillStyle = '#232e52'; x.fillRect(6, 14, 52, 50); x.fillStyle = '#84101f'; x.fillRect(6, 34, 52, 4); x.fillStyle = '#bba79b'; x.fillRect(26, 18, 12, 10); return c; };
  const anims = {};
  for (const d of ['down', 'up', 'left', 'right']) for (const a of ['idle', 'drag', 'lunge', 'reach', 'peek']) anims[`${a}_${d}`] = { frames: [f(), f()], fps: 4, loop: true };
  for (const a of ['mound', 'rise', 'lectern_down', 'lectern_scan', 'sink', 'emerge', 'dissolve']) anims[a] = { frames: [f()], fps: 4, loop: false };
  sheet = { fw: 64, fh: 64, ax: 32, ay: 62, anims };
  return sheet;
}
