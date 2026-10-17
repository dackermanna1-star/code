// CG ending_present — work in progress.
import { tinyText } from './util.js';
export function prepPresent() {}
export const endingPresent = {
  draw(ctx) { ctx.fillStyle = '#0b0c12'; ctx.fillRect(0, 0, 480, 270); tinyText(ctx, 8, 8, 'CG ending_present', '#555'); },
};
