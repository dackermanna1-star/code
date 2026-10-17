// 'terminal' — a TRS-80 Model I in the computer lab (Room 207).
// args { boot: [lines], handle: async (input) => [lines] | { lines, exit } } → resolves on exit.
// 64×16 upper-case screen in VT323, green-gray phosphor, blinking block cursor. Letters, digits,
// space, comma and period may be typed. `EXIT` or Esc leaves.
import { Screen, Z_SPECIAL } from '../screen.js';
import { C, F, W, H } from '../theme.js';
import { font } from '../text.js';
import { FONT } from '../fonts.js';
import { canvas, ctx2d, rect, frame, dither, vignette, AP, clamp, ease, snap } from '../gfx.js';
import { hints } from '../widgets.js';
import { tinyText, rng, hash2 } from '../../art/util.js';
import * as svc from '../services.js';

const COLS = 64, ROWS = 16;
const SCR = { x: 128, y: 74, w: 704, h: 368 };     // glass area (UI px)
const PRINT_CPS = 520;                              // ROM print speed, chars/s

export class TerminalScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.z = Z_SPECIAL;
    this.dimWorld = 0.85;
    this.f = font({ family: FONT.mono, size: 24, lineHeight: 22, threshold: 0.5 });
    this.cell = Math.floor((SCR.w - 32) / COLS);
    this.lines = [''];        // committed screen text
    this.queue = [];          // characters still to print
    this.input = '';
    this.waiting = false;
    this.exiting = false;
    for (const l of args.boot || ['READY']) this._print(l);
    this.printAcc = 0;
  }
  onOpen() { this.ui.input.beginText(); svc.sfx('trs80_beep'); }
  onClose() { this.ui.input.endText(); }
  onRemoved() { this.ui.input.endText(); }

  _print(line) { for (const ch of String(line).toUpperCase()) this.queue.push(ch); this.queue.push('\n'); }
  _emit(ch) {
    if (ch === '\n') { this.lines.push(''); }
    else {
      if (this.lines[this.lines.length - 1].length >= COLS) this.lines.push('');
      this.lines[this.lines.length - 1] += ch;
    }
    while (this.lines.length > 200) this.lines.shift();
  }

  async _submit() {
    const cmd = this.input.trim();
    // echo the command on the current line, then a newline
    for (const ch of this.input) this._emit(ch);
    this._emit('\n');
    this.input = '';
    svc.sfx('trs80_beep', { vol: 0.5 });
    if (cmd === 'EXIT') { this._exit(); return; }
    if (!cmd) { this._prompt(); return; }
    this.waiting = true;
    let res = null;
    try { res = await this.args.handle?.(cmd); } catch (e) { console.error('[ui] terminal.handle', e); res = ['?SN ERROR']; }
    this.waiting = false;
    const lines = Array.isArray(res) ? res : res?.lines || [];
    for (const l of lines) this._print(l);
    if (res && !Array.isArray(res) && res.exit) { this.exiting = true; this.after(0.9, () => this._exit()); return; }
    this._prompt();
  }
  _prompt() { this.queue.push('>'); }
  _exit() { if (!this.closing) { svc.sfx('ui_close'); this.close(null); } }

  update(dt, input) {
    // print queued output
    if (this.queue.length) {
      this.printAcc += dt * PRINT_CPS;
      while (this.printAcc >= 1 && this.queue.length) { this.printAcc -= 1; this._emit(this.queue.shift()); }
    } else this.printAcc = 0;
    if (!input || this.waiting || this.exiting) return;
    if (this.queue.length) return;     // can't type while the machine is printing
    if (this.lines[this.lines.length - 1] === '' && !this.prompted) { this._prompt(); this.prompted = true; return; }
    for (const k of input.typed()) {
      if (k === 'Escape') { this._exit(); return; }
      if (k === 'Enter') { this._submit(); return; }
      if (k === 'Backspace') { if (this.input.length) { this.input = this.input.slice(0, -1); svc.sfx('trs80_key', { vol: 0.5 }); } continue; }
      const ch = k.toUpperCase();
      if (/^[A-Z0-9 ,.]$/.test(ch) && this.lines[this.lines.length - 1].length + this.input.length < COLS - 1) {
        this.input += ch;
        svc.sfx('trs80_key', { rate: 0.95 + (ch.charCodeAt(0) % 7) * 0.02 });
      }
    }
    if (input.escPressed?.()) this._exit();
  }

  render(ctx) {
    const k = ease.out(clamp(this.t / 0.3));
    ctx.save(); ctx.translate(0, snap((1 - k) * 20));
    ctx.drawImage(monitorArt(), 64, 20, 832, 480);
    // phosphor screen
    const { x, y, w, h } = SCR;
    rect(ctx, x, y, w, h, '#050806');
    dither(ctx, x, y, w, h, '#0b120d', 0.5);
    const rows = this.lines.slice(-ROWS);
    const cur = rows.length - 1;
    const glow = '#2a3a30';
    rows.forEach((line, r) => {
      let s = line;
      if (r === cur) s += this.input;
      const ly = y + 18 + r * 21;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === ' ') continue;
        const gx = x + 16 + i * this.cell;
        this.f.glyph(ctx, ch, gx + 1, ly + 1, glow);
        this.f.glyph(ctx, ch, gx, ly, C.crt);
      }
    });
    // blinking block cursor
    if (!this.queue.length && Math.floor(this.t * 2.2) % 2 === 0) {
      const line = (rows[cur] || '') + this.input;
      rect(ctx, x + 16 + line.length * this.cell, y + 18 + cur * 21 + 2, this.cell - 2, 18, C.crt);
    }
    // scanlines, roll bar, curvature shading
    for (let sy = y; sy < y + h; sy += 4) rect(ctx, x, sy + 2, w, AP, 'rgba(0,0,0,0.28)');
    const by = y + ((this.t * 40) % (h + 60)) - 30;
    rect(ctx, x, Math.max(y, by), w, Math.max(0, Math.min(24, y + h - Math.max(y, by))), 'rgba(170,205,180,0.035)');
    dither(ctx, x, y, w, 10, 'rgba(0,0,0,1)', 0.3); dither(ctx, x, y + h - 10, w, 10, 'rgba(0,0,0,1)', 0.3);
    dither(ctx, x, y, 10, h, 'rgba(0,0,0,1)', 0.3); dither(ctx, x + w - 10, y, 10, h, 'rgba(0,0,0,1)', 0.3);
    ctx.restore();
    hints(ctx, [['LEAVE', 'ESC'], ['ENTER', 'ENTER']], H - 30);
    F.small.draw(ctx, 'type EXIT to log off', 24, H - 30, C.textMute);
  }
}

let monitorCanvas = null;
/** The Model I video display at art res (416×240): charcoal case, silver bezel, badge, controls. */
function monitorArt() {
  if (monitorCanvas) return monitorCanvas;
  const w = 416, h = 240;
  const c = canvas(w, h); const x = ctx2d(c);
  const r = rng(1978);
  rect(x, 6, 0, w - 12, h - 6, '#1d1d20');
  rect(x, 6, 0, w - 12, 2, '#3a3a40');
  for (let k = 0; k < 400; k++) { x.fillStyle = r() < 0.5 ? '#222226' : '#19191c'; x.fillRect(6 + Math.floor(r() * (w - 12)), Math.floor(r() * (h - 6)), 2, 1); }
  // silver bezel around the tube
  rect(x, 26, 14, 364, 200, '#8f8e92'); rect(x, 26, 14, 364, 2, '#cfced2'); rect(x, 26, 14, 2, 200, '#b4b3b7');
  rect(x, 28, 212, 362, 2, '#5d5c60'); rect(x, 388, 16, 2, 198, '#6d6c70');
  rect(x, 30, 18, 356, 192, '#121214');
  // badge + controls along the bottom
  rect(x, 30, 222, 64, 10, '#b8b7bb'); tinyText(x, 34, 224, 'TRS-80', '#1d1d20');
  tinyText(x, w - 120, 225, 'RADIO SHACK', '#77767c');
  for (const kx of [140, 160]) { rect(x, kx, 222, 10, 10, '#0d0d0f'); rect(x, kx + 2, 224, 6, 6, '#3a3a40'); }
  rect(x, 6, h - 6, w - 12, 6, '#0d0d0f');
  return (monitorCanvas = c);
}
