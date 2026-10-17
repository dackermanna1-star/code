// CG breaker_reveal — work in progress.
import { tinyText } from './util.js';
export function prepBreaker() {}
export const breakerReveal = {
  draw(ctx) { ctx.fillStyle = '#0b0c12'; ctx.fillRect(0, 0, 480, 270); tinyText(ctx, 8, 8, 'CG breaker_reveal', '#555'); },
};
