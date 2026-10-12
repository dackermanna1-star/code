// HU font text drawn like V_DrawPatch (patch offsets honoured), as used by
// the finale, the cast call and the automap overlays.

export function huWidth(font, text) {
  return font.width(String(text).toUpperCase());
}

// Draws one line at virtual (x, y); returns the width.
export function huText(r, font, text, x, y, opts = {}) {
  let cx = Math.round(x);
  for (const ch of String(text)) {
    const g = ch === ' ' ? null : font.glyph(ch);
    if (!g) {
      cx += font.spaceWidth;
      continue;
    }
    r.drawPatch(g, cx, y, opts);
    cx += g.width;
  }
  return cx - Math.round(x);
}
