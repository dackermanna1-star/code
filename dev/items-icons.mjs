// Icon contact sheets.  node dev/items-icons.mjs [category|shape-prefix ...] [--cols N] [--scale N]
// Always writes dev/out/items-icons.png (every item, ×4). With filters also writes dev/out/items-icons-<filter>.png.
import { ITEMS } from '../src/items/items.js';
import { renderIconPixels } from '../src/items/icons.js';
import { TEMPLATES } from '../src/items/iconArt.js';
import { Canvas } from './items-png.mjs';

const args = process.argv.slice(2);
let cols = 12, scale = 4;
const filters = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--cols') cols = +args[++i];
  else if (args[i] === '--scale') scale = +args[++i];
  else filters.push(args[i]);
}

function sheet(defs, path, ncols) {
  const cw = 16 * scale + 12, ch = 16 * scale + 16;
  const rows = Math.ceil(defs.length / ncols);
  const c = new Canvas(ncols * cw + 4, rows * ch + 4, [40, 40, 44, 255]);
  defs.forEach((d, k) => {
    const x = 4 + (k % ncols) * cw, y = 4 + Math.floor(k / ncols) * ch;
    c.rect(x, y, 16 * scale + 8, 16 * scale + 8, [139, 139, 139, 255]);
    c.rect(x, y, 16 * scale + 8, 2, [55, 55, 55, 255]);
    c.rect(x, y, 2, 16 * scale + 8, [55, 55, 55, 255]);
    c.rect(x, y + 16 * scale + 6, 16 * scale + 8, 2, [255, 255, 255, 255]);
    c.rect(x + 16 * scale + 6, y, 2, 16 * scale + 8, [255, 255, 255, 255]);
    c.blit(renderIconPixels(d), 16, 16, x + 4, y + 4, scale);
    const missing = !TEMPLATES[d.icon?.shape];
    c.text(x, y + 16 * scale + 9, d.id.slice(0, Math.floor(cw / 4)), missing ? [255, 80, 80, 255] : [230, 230, 230, 255]);
  });
  c.save(path);
  console.log('wrote', path, defs.length, 'icons');
}

const all = Object.values(ITEMS);
sheet(all, 'dev/out/items-icons.png', 16);
const match = (d, f) => d.category === f || d.icon.shape.startsWith(f) || d.id.startsWith(f) || (f === 'missing' && !TEMPLATES[d.icon.shape]);
if (filters.length) {
  // one combined sheet of everything matching any filter
  const defs = all.filter((d) => filters.some((f) => match(d, f)));
  sheet(defs, 'dev/out/items-icons-sel.png', cols);
}
const missing = [...new Set(all.filter((d) => !TEMPLATES[d.icon.shape]).map((d) => d.icon.shape))];
if (missing.length) console.log('missing templates (' + missing.length + '):', missing.join(' '));
