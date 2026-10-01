// 5x7 bitmap font used for UI and for painting text into textures.

const G = {
  ' ': [0, 0, 0, 0, 0, 0, 0], '!': [4, 4, 4, 4, 4, 0, 4], '"': [10, 10, 0, 0, 0, 0, 0],
  '#': [10, 10, 31, 10, 31, 10, 10], '$': [4, 15, 20, 14, 5, 30, 4], '%': [24, 25, 2, 4, 8, 19, 3],
  '&': [12, 18, 20, 8, 21, 18, 13], "'": [4, 4, 8, 0, 0, 0, 0], '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8], '*': [0, 4, 21, 14, 21, 4, 0], '+': [0, 4, 4, 31, 4, 4, 0],
  ',': [0, 0, 0, 0, 12, 4, 8], '-': [0, 0, 0, 31, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12],
  '/': [0, 1, 2, 4, 8, 16, 0], '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 2, 4, 8, 31], '3': [31, 2, 4, 2, 1, 17, 14], '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14], '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12], ':': [0, 12, 12, 0, 12, 12, 0],
  ';': [0, 12, 12, 0, 12, 4, 8], '<': [2, 4, 8, 16, 8, 4, 2], '=': [0, 0, 31, 0, 31, 0, 0],
  '>': [8, 4, 2, 1, 2, 4, 8], '?': [14, 17, 1, 2, 4, 0, 4], '@': [14, 17, 1, 13, 21, 21, 14],
  'A': [14, 17, 17, 17, 31, 17, 17], 'B': [30, 17, 17, 30, 17, 17, 30], 'C': [14, 17, 16, 16, 16, 17, 14],
  'D': [28, 18, 17, 17, 17, 18, 28], 'E': [31, 16, 16, 30, 16, 16, 31], 'F': [31, 16, 16, 30, 16, 16, 16],
  'G': [14, 17, 16, 23, 17, 17, 15], 'H': [17, 17, 17, 31, 17, 17, 17], 'I': [14, 4, 4, 4, 4, 4, 14],
  'J': [7, 2, 2, 2, 2, 18, 12], 'K': [17, 18, 20, 24, 20, 18, 17], 'L': [16, 16, 16, 16, 16, 16, 31],
  'M': [17, 27, 21, 21, 17, 17, 17], 'N': [17, 17, 25, 21, 19, 17, 17], 'O': [14, 17, 17, 17, 17, 17, 14],
  'P': [30, 17, 17, 30, 16, 16, 16], 'Q': [14, 17, 17, 17, 21, 18, 13], 'R': [30, 17, 17, 30, 20, 18, 17],
  'S': [15, 16, 16, 14, 1, 1, 30], 'T': [31, 4, 4, 4, 4, 4, 4], 'U': [17, 17, 17, 17, 17, 17, 14],
  'V': [17, 17, 17, 17, 17, 10, 4], 'W': [17, 17, 17, 21, 21, 21, 10], 'X': [17, 17, 10, 4, 10, 17, 17],
  'Y': [17, 17, 17, 10, 4, 4, 4], 'Z': [31, 1, 2, 4, 8, 16, 31], '[': [14, 8, 8, 8, 8, 8, 14],
  '\\': [0, 16, 8, 4, 2, 1, 0], ']': [14, 2, 2, 2, 2, 2, 14], '^': [4, 10, 17, 0, 0, 0, 0],
  '_': [0, 0, 0, 0, 0, 0, 31], '`': [8, 4, 2, 0, 0, 0, 0], 'a': [0, 0, 14, 1, 15, 17, 15],
  'b': [16, 16, 22, 25, 17, 17, 30], 'c': [0, 0, 14, 16, 16, 17, 14], 'd': [1, 1, 13, 19, 17, 17, 15],
  'e': [0, 0, 14, 17, 31, 16, 14], 'f': [6, 9, 8, 28, 8, 8, 8], 'g': [0, 15, 17, 17, 15, 1, 14],
  'h': [16, 16, 22, 25, 17, 17, 17], 'i': [4, 0, 12, 4, 4, 4, 14], 'j': [2, 0, 6, 2, 2, 18, 12],
  'k': [16, 16, 18, 20, 24, 20, 18], 'l': [12, 4, 4, 4, 4, 4, 14], 'm': [0, 0, 26, 21, 21, 17, 17],
  'n': [0, 0, 22, 25, 17, 17, 17], 'o': [0, 0, 14, 17, 17, 17, 14], 'p': [0, 0, 30, 17, 30, 16, 16],
  'q': [0, 0, 13, 19, 15, 1, 1], 'r': [0, 0, 22, 25, 16, 16, 16], 's': [0, 0, 14, 16, 14, 1, 30],
  't': [8, 8, 28, 8, 8, 9, 6], 'u': [0, 0, 17, 17, 17, 19, 13], 'v': [0, 0, 17, 17, 17, 10, 4],
  'w': [0, 0, 17, 17, 21, 21, 10], 'x': [0, 0, 17, 10, 4, 10, 17], 'y': [0, 0, 17, 17, 15, 1, 14],
  'z': [0, 0, 31, 2, 4, 8, 31], '{': [2, 4, 4, 8, 4, 4, 2], '|': [4, 4, 4, 4, 4, 4, 4],
  '}': [8, 4, 4, 2, 4, 4, 8], '~': [0, 0, 8, 21, 2, 0, 0],
  // a few extra symbols mapped to unused chars
  '■': [0, 31, 31, 31, 31, 31, 0], // filled square
  '▶': [8, 12, 14, 15, 14, 12, 8], // right triangle (cursor)
  '←': [0, 4, 8, 31, 8, 4, 0], '→': [0, 4, 2, 31, 2, 4, 0],
  '↑': [4, 14, 21, 4, 4, 4, 0], '↓': [0, 4, 4, 4, 21, 14, 4],
  '°': [12, 18, 12, 0, 0, 0, 0],
};

export const FONT_W = 5, FONT_H = 7, FONT_ADV = 6, FONT_LINE = 9;

export function glyph(ch) { return G[ch] || G['?']; }

export function textWidth(str, scale = 1) {
  return str.length * FONT_ADV * scale - (str.length ? scale : 0);
}

// Calls plot(x, y) for each set pixel of the string.
export function rasterText(str, x0, y0, scale, plot) {
  let x = x0;
  for (let i = 0; i < str.length; i++) {
    const g = glyph(str[i]);
    for (let r = 0; r < 7; r++) {
      const row = g[r];
      if (!row) continue;
      for (let c = 0; c < 5; c++) {
        if (row & (16 >> c)) {
          for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) plot(x + c * scale + sx, y0 + r * scale + sy);
        }
      }
    }
    x += FONT_ADV * scale;
  }
}

// Canvas text renderer with per-colour glyph atlases.
const atlasCache = new Map();
const CHARS = Object.keys(G);

function getAtlas(color) {
  let a = atlasCache.get(color);
  if (a) return a;
  const cv = document.createElement('canvas');
  cv.width = CHARS.length * 6; cv.height = 7;
  const cx = cv.getContext('2d');
  cx.fillStyle = color;
  const index = {};
  CHARS.forEach((ch, i) => {
    index[ch] = i;
    const g = G[ch];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r] & (16 >> c)) cx.fillRect(i * 6 + c, r, 1, 1);
  });
  a = { cv, index };
  atlasCache.set(color, a);
  return a;
}

export function drawText(ctx, str, x, y, color = '#fff', scale = 1, shadow = null) {
  if (shadow) drawText(ctx, str, x + scale, y + scale, shadow, scale, null);
  const a = getAtlas(color);
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (let i = 0; i < str.length; i++) {
    const idx = a.index[str[i]];
    if (idx !== undefined && str[i] !== ' ') ctx.drawImage(a.cv, idx * 6, 0, 5, 7, cx, cy, 5 * scale, 7 * scale);
    cx += FONT_ADV * scale;
  }
}

export function drawTextCentered(ctx, str, cx, y, color, scale = 1, shadow = null) {
  drawText(ctx, str, Math.round(cx - textWidth(str, scale) / 2), y, color, scale, shadow);
}

// Word-wrap a string into lines that fit maxChars.
export function wrapText(str, maxChars) {
  const out = [];
  for (const para of str.split('\n')) {
    if (!para.length) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(' ')) {
      if (!line.length) line = word;
      else if (line.length + 1 + word.length <= maxChars) line += ' ' + word;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}
