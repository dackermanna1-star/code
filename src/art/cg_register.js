// CG register_book — work in progress.
import { tinyText } from './util.js';
export function prepRegister() {}
export const registerBook = {
  draw(ctx) { ctx.fillStyle = '#0b0c12'; ctx.fillRect(0, 0, 480, 270); tinyText(ctx, 8, 8, 'CG register_book', '#555'); },
};
