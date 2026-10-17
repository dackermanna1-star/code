// STUB — replaced by the sprites agent. Exports: initSprites(), getSprite(id).
import { makeCanvas, ctxOf, hashStr } from './util.js';
const cache = new Map();
const DIRS = ['down', 'up', 'left', 'right'];
export async function initSprites() {}
export function getSprite(id) {
  if (cache.has(id)) return cache.get(id);
  const big = id === 'colonel';
  const fw = big ? 64 : 24, fh = big ? 64 : 32;
  const hue = hashStr(id) % 360;
  const frame = (shade) => { const c = makeCanvas(fw, fh); const x = ctxOf(c);
    x.fillStyle = `hsl(${hue},45%,${shade}%)`; x.fillRect(big ? 8 : 6, big ? 8 : 6, fw - (big ? 16 : 12), fh - (big ? 8 : 6));
    x.fillStyle = '#000'; x.fillRect(fw / 2 - 1, big ? 14 : 10, 2, 2); return c; };
  const anims = {};
  for (const d of DIRS) for (const a of ['idle', 'walk', 'run', 'sit', 'drag', 'lunge', 'reach', 'peek', 'point', 'whistle', 'film'])
    anims[`${a}_${d}`] = { frames: [frame(45), frame(55)], fps: 6, loop: true };
  for (const a of ['heads_down', 'flinch_down', 'pickup_down', 'collapse', 'mound', 'rise', 'lectern_down', 'lectern_scan', 'sink', 'emerge', 'dissolve', 'hand_out_down', 'sit_play', 'wrong', 'write', 'turned', 'crumble'])
    anims[a] = { frames: [frame(40)], fps: 4, loop: false };
  const s = { fw, fh, ax: fw / 2, ay: fh - 2, anims };
  cache.set(id, s); return s;
}
