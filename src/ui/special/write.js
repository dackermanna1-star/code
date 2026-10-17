// 'write' — hold Confirm to keep writing (DESIGN §8: the expulsion; a variant of 'breath').
// args { label = 'Keep writing', seconds = 6, letters = '', onProgress(p), allowCancel = true, dim = 0 }
//   → 'done' | 'cancelled'.
// Holding fills the meter; letting go only pauses it (no failure). Cancel gives up (if allowed). The
// letters (e.g. H-A-L-L-O-W-E-L-L) are scrawled in red ink one by one as the meter fills, so the meter is
// the word being written. onProgress(p) fires whenever the progress changes (the Register uses it to
// write on the page, bring the hand in at ~70 % and stamp EXPELLED at 100 %).
import { Screen, Z_SPECIAL } from '../screen.js';
import { F, W, H } from '../theme.js';
import { font } from '../text.js';
import { FONT } from '../fonts.js';
import { rect, dither, keycap, keycapWidth, AP, clamp, snap } from '../gfx.js';
import { spaced, hints } from '../widgets.js';
import { hash2 } from '../../art/util.js';
import * as svc from '../services.js';

const INK = '#c0202c';
const INK_DK = '#5a0c12';
const SCRATCH_EVERY = 0.32;   // s between pen-scratch sfx while writing

const bigScript = () => font({ family: FONT.script, size: 56, lineHeight: 56, weight: 700, threshold: 0.45, skew: -0.14 });

export class WriteScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.z = Z_SPECIAL;
    this.fadeIn = 0.25; this.fadeOut = 0.4;
    this.dimWorld = Number(args.dim) || 0;
    this.seconds = Math.max(0.5, Number(args.seconds) || 6);
    this.label = args.label || 'Keep writing';
    this.letters = String(args.letters || '');
    this.p = 0;
    this.holding = false;
    this.started = false;
    this.scratchT = 0;
    this.done = false;
    this.heldFor = 0;       // continuous hold (for the hand tremor)
  }

  _progress(p) {
    if (p === this.p) return;
    this.p = p;
    try { this.args.onProgress?.(p); } catch (e) { console.error('[ui] write.onProgress', e); }
  }

  update(dt, input) {
    if (this.done) return;
    const down = !!input && input.down('confirm');
    if (down && !this.holding) svc.sfx('pen_scratch', { vol: 0.7 });
    this.holding = down;
    if (down) {
      this.started = true;
      this.heldFor += dt;
      this._progress(clamp(this.p + dt / this.seconds));
      this.scratchT += dt;
      if (this.scratchT >= SCRATCH_EVERY) { this.scratchT = 0; svc.sfx('pen_scratch', { vol: 0.45 + this.p * 0.4, rate: 0.92 + (hash2(Math.floor(this.t * 10), 3) % 9) * 0.02 }); }
      if (this.p >= 1) {
        this.done = true;
        this.after(0.35, () => this.close('done'));
      }
    } else {
      this.heldFor = 0;
      if (input && this.args.allowCancel !== false && input.pressed('cancel')) {
        this.done = true;
        svc.sfx('ui_cancel');
        this.close('cancelled');
      }
    }
  }

  render(ctx) {
    const p = this.p;
    // a dark band rising from the bottom edge, so the word reads over whatever is beneath
    for (let i = 0; i < 6; i++) dither(ctx, 0, H - 112 + i * 8, W, 8, 'rgba(0,0,0,1)', 0.12 + i * 0.1);
    rect(ctx, 0, H - 64, W, 64, 'rgba(0,0,0,0.72)');
    // the word, scrawled in red as the meter fills (letters appear one by one, the current one wipes in)
    if (this.letters) {
      const f = bigScript();
      const n = this.letters.length;
      const total = f.width(this.letters);
      const x0 = snap(W / 2 - total / 2), y0 = H - 104;
      let x = x0;
      for (let i = 0; i < n; i++) {
        const ch = this.letters[i];
        const cw = f.width(ch);
        const k = clamp(p * n - i);
        if (k > 0) {
          const jit = this.holding && k < 1 ? ((hash2(Math.floor(this.t * 24), i) % 3) - 1) * AP : 0;
          ctx.save();
          ctx.beginPath(); ctx.rect(x - 8, y0 - 10, (cw + 16) * k, 76); ctx.clip();
          f.draw(ctx, ch, x + AP, y0 + AP + jit, INK_DK);
          f.draw(ctx, ch, x, y0 + jit, INK);
          ctx.restore();
        } else {
          f.draw(ctx, ch, x, y0, 'rgba(192,32,44,0.12)');
        }
        x += cw;
      }
      // the nib: a bead of wet ink at the end of the stroke while writing
      if (this.holding && p < 1) rect(ctx, snap(x0 + total * p), y0 + 42 + ((hash2(Math.floor(this.t * 20), 1) % 3) - 1) * AP, AP * 3, AP * 3, INK);
    }
    // label: [key] Keep writing — pulses while paused, steady while writing
    const fs = F.small;
    const key = this.ui.input.keyLabel('confirm');
    const label = spaced(this.label);
    const lw = fs.width(label), kw = keycapWidth(key, fs);
    const lx = snap(W / 2 - (lw + kw + 16) / 2), ly = H - 44;
    const a = this.holding ? 0.55 : 0.6 + 0.4 * Math.abs(Math.sin(this.t * 3.2));
    keycap(ctx, lx, ly, key, fs);
    fs.draw(ctx, label, lx + kw + 16, ly, this.holding ? '#b9a8a0' : '#f0e2d0', { alpha: a });
    // the meter: a thin ink line filling left → right
    const mw = 420, mx = snap(W / 2 - mw / 2), my = H - 16;
    rect(ctx, mx, my, mw, 4, '#3a2a2a');
    rect(ctx, mx, my, snap(mw * p), 4, INK);
    for (let i = 1; i < 9; i++) rect(ctx, mx + snap(mw * i / 9), my, AP, 4, 'rgba(0,0,0,0.6)');
    if (this.args.allowCancel !== false && !this.holding && this.started) hints(ctx, [['PUT IT DOWN', this.ui.input.keyLabel('cancel')]], H - 44, W - 24);
  }
}
