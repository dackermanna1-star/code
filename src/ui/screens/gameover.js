// Game over: an attendance index card. HALLOWELL CONSOLIDATED SCHOOL — ATTENDANCE — DOLAN, THERESA.
// The week's boxes are pencil-ticked, then a red PRESENT stamp slams down on Friday the 18th.
// Resolves 'retry' | 'title'.
import { Screen, Z_TOP } from '../screen.js';
import { C, F, W, H, handFont } from '../theme.js';
import { rect, frame, dither, paperSheet, triangle, vignette, canvas, ctx2d, AP, clamp, ease, snap } from '../gfx.js';
import { hash2 } from '../../art/util.js';
import { stampCanvas } from './card.js';
import { spaced } from '../widgets.js';
import * as svc from '../services.js';

// Remarks the attendance clerk (the school) writes in the margin, by game-over reason.
const REMARKS = {
  caught: 'Out of seat.', seen: 'Out of seat.', moved: 'Out of seat.', whistle: 'Running in the halls.',
  run: 'Running in the halls.', noise: 'Disruptive.', sat: 'Took her seat.', sit: 'Took her seat.',
  false_leah: 'Took her seat.', present: 'Answered.', breath: 'Answered.', hall: 'In hall without pass.',
  longhall: 'In hall without pass.', chase: 'Did not leave before dismissal.',
};

const CARD_W = 640, CARD_H = 368;
const STAMP_AT = 1.5;

export class GameOverScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.z = Z_TOP;
    this.fadeIn = 0.9; this.fadeOut = 0.6;
    this.sel = 0;
    this.stamped = false;
    this.remark = REMARKS[args.reason] ?? (args.reason && typeof args.reason === 'string' && args.reason.includes(' ') ? args.reason : 'Present.');
  }
  update(dt, input) {
    if (!this.stamped && this.t >= STAMP_AT) { this.stamped = true; svc.sfx('stamp'); }
    if (!input || this.t < STAMP_AT + 0.8) return;
    if (input.repeat('up') || input.repeat('down') || input.repeat('left') || input.repeat('right')) { this.sel ^= 1; svc.sfx('ui_move'); }
    if (input.pressed('confirm')) { svc.sfx('ui_confirm'); this.close(this.sel === 0 ? 'retry' : 'title'); }
  }
  render(ctx) {
    rect(ctx, 0, 0, W, H, '#020203');
    vignette(ctx, 0.45, 0.85);
    const k = ease.out(clamp(this.t / 0.8));
    const shake = this.t > STAMP_AT && this.t < STAMP_AT + 0.18 ? ((hash2(Math.floor(this.t * 60), 3) % 3) - 1) * AP * 2 : 0;
    const x = snap(W / 2 - CARD_W / 2) + shake, y = snap(70 + (1 - k) * 24);
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * k;
    dither(ctx, x + 10, y + 10, CARD_W, CARD_H, 'rgba(0,0,0,1)', 0.5);
    ctx.drawImage(indexCard(), x, y);
    // the week: pencil ticks appear one by one
    const days = ['MON 14', 'TUE 15', 'WED 16', 'THU 17', 'FRI 18'];
    const gx = x + 40, gy = y + 172, cw = 112;
    const hf = handFont('tess').font;
    days.forEach((d, i) => {
      const cx = gx + i * cw;
      frame(ctx, cx, gy, cw, 92, '#7c8aa0', AP / 2 + 0.5);
      F.typedS.draw(ctx, d, cx + cw / 2, gy + 6, '#3b3a40', { align: 'center' });
      const tk = clamp((this.t - 0.6 - i * 0.12) / 0.1);
      if (i < 4 && tk > 0) {
        if (i === 2) hf.draw(ctx, 'T', cx + cw / 2, gy + 36, '#55545c', { align: 'center', alpha: tk });
        else pencilTick(ctx, cx + cw / 2 - 12, gy + 44, tk);
      }
    });
    // the stamp
    const sk = clamp((this.t - STAMP_AT + 0.12) / 0.12);
    if (sk > 0) {
      const st = stampCanvas('PRESENT');
      const s = 1 + (1 - sk) * 1.4;
      const w = st.width * 2 * s, h = st.height * 2 * s;
      ctx.save();
      ctx.globalAlpha = a0 * k * (0.35 + 0.65 * sk);
      ctx.translate(gx + cw * 4 + cw / 2 - 8, gy + 48);
      ctx.rotate(-0.13);
      ctx.drawImage(st, Math.round(-w / 2), Math.round(-h / 2), Math.round(w), Math.round(h));
      ctx.restore();
    }
    // the school's remark, in red pen, after the stamp
    const rk = clamp((this.t - STAMP_AT - 0.5) / 0.4);
    if (rk > 0) handFont('adair').font.draw(ctx, this.remark, x + 44, y + CARD_H - 62, C.stampRed, { alpha: rk });
    ctx.globalAlpha = a0;

    // menu
    const mk = ease.out(clamp((this.t - STAMP_AT - 0.8) / 0.5));
    if (mk > 0) {
      ctx.globalAlpha = a0 * mk;
      const fs = F.small;
      ['Try again', 'Quit to title'].forEach((label, i) => {
        const yy = 470 + i * 30;
        const sel = i === this.sel;
        const s = spaced(label);
        fs.draw(ctx, s, W / 2, yy, sel ? '#f0e6cc' : '#7a746a', { align: 'center' });
        if (sel) triangle(ctx, snap(W / 2 - fs.width(s) / 2 - 26), yy + 3, 5, C.red, 'right');
      });
      ctx.globalAlpha = a0;
    }
  }
}

/** A hand-drawn pencil check mark (pixel strokes), revealed by k. */
function pencilTick(ctx, x, y, k) {
  const pts = [[0, 10], [2, 12], [4, 14], [6, 16], [8, 14], [10, 10], [12, 6], [14, 2], [16, -2], [18, -6], [20, -8], [22, -10]];
  const n = Math.ceil(pts.length * k);
  for (let i = 0; i < n; i++) { rect(ctx, x + pts[i][0], y + pts[i][1], 4, 4, '#55545c'); }
}

let cardCanvas = null;
function indexCard() {
  if (cardCanvas) return cardCanvas;
  const c = canvas(CARD_W, CARD_H);
  const x = ctx2d(c);
  x.drawImage(paperSheet(CARD_W, CARD_H, { seed: 'attendance', tone: '#e3dcc6', hi: '#efe9d6', lo: '#c9c1a8', stains: 1, ruled: { top: 300, gap: 28, color: '#9fb0c8' } }), 0, 0);
  rect(x, 0, 52, CARD_W, AP, '#c45a52');                     // red header rule
  F.typedS.draw(x, 'HALLOWELL CONSOLIDATED SCHOOL', 36, 16, '#2a2a30');
  F.typedS.draw(x, 'ATTENDANCE', CARD_W - 36, 16, '#2a2a30', { align: 'right' });
  F.typed.draw(x, 'DOLAN, THERESA', 36, 66, '#1e1d22');
  F.typedS.draw(x, 'GR. 11   HR. 103   1996–97', CARD_W - 36, 70, '#3b3a40', { align: 'right' });
  F.typedS.draw(x, 'WEEK OF OCT. 14', 36, 104, '#3b3a40');
  F.typedS.draw(x, 'REMARKS:', 36, CARD_H - 92, '#3b3a40');
  return (cardCanvas = c);
}
