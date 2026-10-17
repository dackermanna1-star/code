// Font comparison sheet for the UI agent (tools/preview/ui.html#fonttest).
import { loadFonts, FONT } from '../../src/ui/fonts.js';
import { font } from '../../src/ui/text.js';
export async function fontTest(ctx) {
  await loadFonts();
  ctx.fillStyle = '#2a3d30'; ctx.fillRect(0, 0, 960, 540);
  const line = "Dolan. Dolan. Look at this guy. He ate the Civil War. I'm serious, look at his *hands*, he's got rings on every finger — like, he ate the rings too.";
  const box = (y, f, label) => {
    ctx.fillStyle = 'rgba(12,13,17,0.9)'; ctx.fillRect(20, y, 920, 150);
    ctx.fillStyle = '#52525e'; ctx.fillRect(20, y, 920, 2);
    font({ family: FONT.ui, size: 20 }).draw(ctx, label, 40, y - 26, '#5fae6b');
    let yy = y + 26;
    for (const l of f.wrap(line, 860)) { f.draw(ctx, l, 50, yy, '#e4dbc2'); yy += f.lineHeight; }
  };
  box(40, font({ family: FONT.ui, size: 20, lineHeight: 30 }), 'Pixelify 20');
  box(220, font({ family: FONT.uiAlt, size: 32, lineHeight: 36 }), 'DotGothic 32');
  box(380, font({ family: FONT.uiAlt, size: 16, lineHeight: 24 }), 'DotGothic 16');
}
