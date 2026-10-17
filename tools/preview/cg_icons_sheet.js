// Icon + glyph contact sheet: every item icon at 1×, 2×, 4× on the inventory's dark slot colours,
// every glyph at 1×, 2×, 4× on the UI panel colour.
import { initIcons, getIcon, getGlyph, GLYPH_NAMES } from '../../src/art/icons.js';
import { ITEMS } from '../../src/data/items.js';

export async function iconSheet(root) {
  const t0 = performance.now();
  await initIcons();
  const ms = performance.now() - t0;
  const h2 = (t) => { const d = document.createElement('h2'); d.textContent = t; root.appendChild(d); };
  const board = (w, h, bg) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; root.appendChild(c);
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = bg; x.fillRect(0, 0, w, h); return x;
  };
  const ids = [...Object.keys(ITEMS), 'unknown'];
  h2(`item icons — initIcons ${ms.toFixed(1)} ms (slot colour #23241a; detail card #2c2e24)`);
  const cols = 7, cw = 24 * 4 + 24 * 2 + 24 + 40, ch = 24 * 4 + 30;
  const x = board(cols * cw + 10, Math.ceil(ids.length / cols) * ch + 10, '#23241a');
  ids.forEach((id, i) => {
    const cx = 10 + (i % cols) * cw, cy = 10 + Math.floor(i / cols) * ch;
    const ic = getIcon(id);
    x.fillStyle = '#2c2e24'; x.fillRect(cx - 2, cy + 12, 24 * 4 + 4, 24 * 4 + 4);
    x.drawImage(ic, cx, cy + 14, 96, 96);
    x.drawImage(ic, cx + 104, cy + 14, 48, 48);
    x.drawImage(ic, cx + 104, cy + 70, 24, 24);
    x.fillStyle = '#c4bdb0'; x.font = '11px monospace'; x.fillText(id, cx, cy + 9);
  });
  h2('glyphs @1× / 2× / 4× (UI panel #0c0d11)');
  const g = board(GLYPH_NAMES.length * 76 + 10, 120, '#0c0d11');
  GLYPH_NAMES.forEach((n, i) => {
    const cx = 10 + i * 76, gl = getGlyph(n);
    g.drawImage(gl, cx, 22);
    g.drawImage(gl, cx, 44, gl.width * 2, gl.height * 2);
    g.drawImage(gl, cx + 30, 44, gl.width * 4, gl.height * 4);
    g.fillStyle = '#9c9888'; g.font = '10px monospace'; g.fillText(n, cx, 12);
  });
}
