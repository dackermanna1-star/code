// Shared UI helpers: readable key names for bindings and STCFN text drawing
// with the extra options the menus and HUD need (alpha, clipping width).

const NAMES = {
  Space: 'SPACE', Enter: 'ENTER', Tab: 'TAB', Backspace: 'BACKSPACE', Escape: 'ESC', CapsLock: 'CAPS LOCK',
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  ShiftLeft: 'SHIFT', ShiftRight: 'RSHIFT', ControlLeft: 'CTRL', ControlRight: 'RCTRL',
  AltLeft: 'ALT', AltRight: 'RALT', MetaLeft: 'META', MetaRight: 'RMETA', ContextMenu: 'MENU',
  BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  Backslash: '\\', IntlBackslash: '\\', Minus: '-', Equal: '=', Backquote: 'TILDE',
  Insert: 'INS', Delete: 'DEL', Home: 'HOME', End: 'END', PageUp: 'PGUP', PageDown: 'PGDN',
  WheelUp: 'WHEEL UP', WheelDown: 'WHEEL DOWN', Pause: 'PAUSE', ScrollLock: 'SCROLL LOCK', NumLock: 'NUM LOCK',
  NumpadAdd: 'KP+', NumpadSubtract: 'KP-', NumpadMultiply: 'KP*', NumpadDivide: 'KP/', NumpadDecimal: 'KP.',
  NumpadEnter: 'KP ENTER', NumpadEqual: 'KP=',
};

// Browser mouse buttons: 0 left, 1 middle, 2 right, 3 back, 4 forward.
const MOUSE = { 0: 'MOUSE1', 1: 'MOUSE3', 2: 'MOUSE2', 3: 'MOUSE4', 4: 'MOUSE5' };

export function keyName(code) {
  if (!code) return '';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `KP${code.slice(6)}`;
  if (code.startsWith('Mouse')) return MOUSE[code.slice(5)] || `MOUSE${Number(code.slice(5)) + 1}`;
  return code.toUpperCase();
}

// STCFN text in virtual coordinates. opts: trans, level, alpha, scale,
// align ('left' | 'center' | 'right'), lineHeight. Returns the widest line.
export function drawText(r, font, text, vx, vy, opts = {}) {
  const scale = opts.scale || 1;
  const lh = (opts.lineHeight || 8) * scale;
  const lines = String(text).split('\n');
  // Honour patch offsets like V_DrawPatch: '.', ',', '-' etc. sit lower.
  const popts = { scale, trans: opts.trans || 0, level: opts.level };
  if (opts.alpha != null && opts.alpha < 1) {
    if (opts.alpha <= 0.02) return 0;
    popts.alpha = opts.alpha;
  }
  let maxw = 0;
  lines.forEach((line, li) => {
    const lw = font.width(line) * scale;
    maxw = Math.max(maxw, lw);
    let x = vx;
    if (opts.align === 'center') x = vx - lw / 2;
    else if (opts.align === 'right') x = vx - lw;
    x = Math.round(x);
    for (const ch of line) {
      const g = ch === ' ' ? null : font.glyph(ch);
      if (!g) { x += font.spaceWidth * scale; continue; }
      r.drawPatch(g, x, vy + li * lh, popts);
      x += g.width * scale;
    }
  });
  return maxw;
}

// Convert a mouse event position to the 320x200 virtual screen.
export function eventToVirtual(app, e) {
  const r = app.renderer;
  const canvas = app.canvas;
  if (!r || !canvas || !r.dest) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const dx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const dyTop = (e.clientY - rect.top) * (canvas.height / rect.height);
  const [x0, y0, w, h] = r.dest;
  const dyBottom = canvas.height - dyTop;
  const bx = ((dx - x0) / w) * r.W;
  const by = r.H - ((dyBottom - y0) / h) * r.H;
  return { x: (bx - r.vLeft) / r.vScaleX, y: by / r.vScaleY };
}
