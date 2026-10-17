// CG ending_dawn — work in progress.
import { tinyText } from './util.js';
export function prepDawn() {}
export const endingDawn = {
  draw(ctx) { ctx.fillStyle = '#0b0c12'; ctx.fillRect(0, 0, 480, 270); tinyText(ctx, 8, 8, 'CG ending_dawn', '#555'); },
};
