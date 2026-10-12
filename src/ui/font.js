// Text drawing with DOOM's heads-up font (STCFNxxx patches), in the 320x200
// virtual screen. Lower case is drawn as upper case like the original.

export class DoomFont {
  constructor(res, prefix = 'STCFN') {
    this.res = res;
    this.prefix = prefix;
    this.glyphs = new Map();
    this.spaceWidth = 4;
    this.height = 8;
  }

  glyph(ch) {
    const c = ch.toUpperCase().charCodeAt(0);
    if (this.glyphs.has(c)) return this.glyphs.get(c);
    let g = null;
    if (c >= 33 && c <= 121) g = this.res.patch(`${this.prefix}${String(c).padStart(3, '0')}`);
    this.glyphs.set(c, g);
    return g;
  }

  // Width in virtual pixels of a single line.
  width(text) {
    let w = 0;
    for (const ch of text) {
      const g = ch === ' ' ? null : this.glyph(ch);
      w += g ? g.width : this.spaceWidth;
    }
    return w;
  }

  // Draws text at virtual coords; returns the width drawn.
  // opts: {trans, level, scale, align: 'left'|'center'|'right', lineHeight}
  draw(r, text, vx, vy, opts = {}) {
    const scale = opts.scale || 1;
    const lines = String(text).split('\n');
    const lh = (opts.lineHeight || 11) * scale;
    let maxw = 0;
    lines.forEach((line, li) => {
      const lw = this.width(line) * scale;
      maxw = Math.max(maxw, lw);
      let x = vx;
      if (opts.align === 'center') x = vx - lw / 2;
      else if (opts.align === 'right') x = vx - lw;
      for (const ch of line) {
        const g = ch === ' ' ? null : this.glyph(ch);
        if (!g) { x += this.spaceWidth * scale; continue; }
        // Glyph offsets matter for punctuation sitting on the baseline.
        r.drawPatch(g, x - g.leftOffset * scale, vy + li * lh - g.topOffset * scale, { noOffset: true, scale, trans: opts.trans || 0, level: opts.level });
        x += g.width * scale;
      }
    });
    return maxw;
  }
}
