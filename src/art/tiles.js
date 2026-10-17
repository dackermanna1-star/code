// STUB — replaced by the tiles agent. Exports: initTiles(), drawTile(ctx, key, px, py, opts).
import { TILES } from '../data/tiles.js';
import { PAL } from './palette.js';
const STUB = { floor: PAL.g2, wall: PAL.green_d, window: PAL.blue_d, door: PAL.wood, special: PAL.ink };
export async function initTiles() {}
export function drawTile(ctx, key, px, py, { kind } = {}) {
  const t = TILES[key];
  ctx.fillStyle = !t ? '#f0f' : t.kind === 'wall' || t.kind === 'window'
    ? (kind === 'top' ? PAL.ink : kind === 'face_high' ? PAL.cream_d : PAL.green_d)
    : (STUB[t.kind] || '#f0f');
  ctx.fillRect(px, py, 16, 16);
  if (t && t.kind === 'floor') { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px, py, 16, 1); ctx.fillRect(px, py, 1, 16); }
}
