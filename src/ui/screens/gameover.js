// Game over: the disciplinary referral (DESIGN §9.4). A pink carbon copy slides up out of the dark:
//   HALLOWELL CONSOLIDATED SCHOOL — DISCIPLINARY REFERRAL — Student: DOLAN, THERESA — Infraction: ____ —
//   Reported by: ____ — Disposition: DETAINED
// The reporter fills in the infraction and his name in his own hand, ticks DETAINED, and the office
// stamp slams down. Reason 'present' (the False Leah) is different: the slip just says PRESENT.
// Resolves 'retry' | 'title'.
//
// Speed (DESIGN §9.3 / Pillar 6: game over → playable in < 2 s): from 0.5 s a Confirm press skips the
// writing straight to the stamp and puts the menu up; the next press picks. A repeat death at the same
// checkpoint (HW.game.deathsAt() ≥ 1) opens with the slip already filled in, the stamp landing at once.
import { HW } from '../../engine/hw.js';
import { Screen, Z_TOP } from '../screen.js';
import { C, F, W, H, handFont } from '../theme.js';
import { font } from '../text.js';
import { FONT } from '../fonts.js';
import { rect, frame, dither, paperSheet, triangle, vignette, canvas, ctx2d, AP, clamp, ease, snap } from '../gfx.js';
import { hash2 } from '../../art/util.js';
import { stampCanvas } from './card.js';
import { spaced } from '../widgets.js';
import * as svc from '../services.js';

/** Reporters: who fills in the slip, and in what hand. */
const REPORTERS = {
  colonel: { name: 'Mr. H.', hand: () => handFont('colonel') },
  kevin: { name: 'K. Hoyt, Safety Patrol', hand: () => ({ font: font({ family: FONT.hand, size: 26, lineHeight: 30, threshold: 0.45, skew: 0.04 }), color: '#23305c' }) },
};

/** Game-over reasons → the referral (DESIGN §9.4). Aliases keep older reason ids readable. */
export const REFERRALS = {
  hall_after_bell: { infraction: 'In hall after bell (Rule 1)', by: 'colonel' },
  out_of_seat: { infraction: 'Out of seat during class (Rule 2)', by: 'colonel' },
  running: { infraction: 'Running in the halls (Rule 3)', by: 'kevin' },
  breath: { infraction: 'Disrupting attendance', by: 'colonel' },
  chase: { infraction: 'Leaving before dismissal (Rule 6)', by: 'colonel' },
  woke: { infraction: 'Disturbing the Founder', by: 'colonel' },
  present: { present: true },
};
const ALIASES = {
  caught: 'out_of_seat', seen: 'out_of_seat', moved: 'out_of_seat', seat: 'out_of_seat',
  whistle: 'running', run: 'running', hall: 'hall_after_bell', bell: 'hall_after_bell', longhall: 'hall_after_bell',
  false_leah: 'present', sat: 'present', sit: 'present', answered: 'present',
  noise: 'woke', heap: 'woke', escape: 'chase',
};
const FALLBACK = { infraction: 'Conduct unbecoming a pupil', by: 'colonel' };

/** The referral for a reason id (or a free-text infraction). */
export function referralFor(reason) {
  const id = ALIASES[reason] || reason;
  if (REFERRALS[id]) return { id, ...REFERRALS[id] };
  if (typeof reason === 'string' && reason.includes(' ')) return { id: 'custom', infraction: reason, by: 'colonel' };
  return { id: 'unknown', ...FALLBACK };
}

const SLIP_W = 660, SLIP_H = 390;
const T_INFRACTION = 0.85, T_REPORTER = 1.45, T_TICK = 1.95, STAMP_AT = 2.2, PRESENT_AT = 1.25;
const SKIP_FROM = 0.5;   // s: earlier presses are the panic of the moment before, not a choice
const MENU_DELAY = 0.8;  // s after the stamp before the menu comes up on its own
const MENU_FADE = 0.3;
const PINK = { tone: '#e9b9bc', hi: '#f2cdd0', lo: '#d29ea2', edge: '#b0787e' };

export class GameOverScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.z = Z_TOP;
    this.fadeIn = 0.9; this.fadeOut = 0.6;
    this.sel = 0;
    this.stamped = false;
    this.ref = referralFor(args.reason);
    this.stampAt = this.ref.present ? PRESENT_AT : STAMP_AT;
    this.scratched = new Set();
    this.reporter = REPORTERS[this.ref.by] || REPORTERS.colonel;
    this.hand = this.reporter.hand();
    this.menuAt = this.stampAt + MENU_DELAY;
    let repeat = false;
    try { repeat = (HW.game?.deathsAt?.() || 0) >= 1; } catch { /* stubs */ }
    this.age = 0; // real seconds open (t jumps when skipping)
    if (repeat) this._skip(0.12, 0.25);
  }

  /** Jump to just before the stamp lands (`lead` s), the writing done; the menu `menuIn` s after it. */
  _skip(lead, menuIn) {
    for (const k of ['inf', 'rep', 'tick']) this.scratched.add(k); // no pen sounds for writing we skip
    this.t = Math.max(this.t, this.stampAt - lead);
    this.menuAt = Math.min(this.menuAt, this.stampAt + menuIn);
    this.fadeIn = Math.min(this.fadeIn, 0.4);
  }

  update(dt, input) {
    this.age += dt;
    if (!this.stamped && this.t >= this.stampAt) { this.stamped = true; svc.sfx('stamp'); }
    if (!this.ref.present) {
      for (const [k, at] of [['inf', T_INFRACTION], ['rep', T_REPORTER], ['tick', T_TICK]]) {
        if (!this.scratched.has(k) && this.t >= at) { this.scratched.add(k); svc.sfx('pen_scratch', { vol: 0.5 }); }
      }
    }
    if (!input || this.age < SKIP_FROM) return;
    if (this.t < this.menuAt) {
      // Still writing: a press skips to the stamp, and the menu follows straight after.
      if (input.pressed('confirm') || input.pressed('cancel')) this._skip(0, 0.12);
      return;
    }
    if (input.repeat('up') || input.repeat('down') || input.repeat('left') || input.repeat('right')) { this.sel ^= 1; svc.sfx('ui_move'); }
    if (input.pressed('confirm')) { svc.sfx('ui_confirm'); this.close(this.sel === 0 ? 'retry' : 'title'); }
  }

  render(ctx) {
    rect(ctx, 0, 0, W, H, '#020203');
    vignette(ctx, 0.45, 0.85);
    const k = ease.out(clamp(this.t / 0.8));
    const shake = this.t > this.stampAt && this.t < this.stampAt + 0.18 ? ((hash2(Math.floor(this.t * 60), 3) % 3) - 1) * AP * 2 : 0;
    const x = snap(W / 2 - SLIP_W / 2) + shake, y = snap(46 + (1 - k) * 40);
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * k;
    dither(ctx, x + 10, y + 10, SLIP_W, SLIP_H, 'rgba(0,0,0,1)', 0.5);
    ctx.drawImage(referralSlip(this.ref.present), x, y);
    if (this.ref.present) this._present(ctx, x, y);
    else this._fields(ctx, x, y);
    ctx.globalAlpha = a0;
    this._menu(ctx, a0);
  }

  /** The reporter's hand fills the blanks; DETAINED is ticked; the office stamp lands on it. */
  _fields(ctx, x, y) {
    const R = this.reporter, hf = this.hand;
    const write = (text, tx, ty, t0, dur) => {
      const p = clamp((this.t - t0) / dur);
      if (p <= 0) return;
      const w = hf.font.width(text);
      ctx.save(); ctx.beginPath(); ctx.rect(tx - 4, ty - 10, (w + 8) * p, hf.font.lineHeight + 20); ctx.clip();
      hf.font.draw(ctx, text, tx, ty, hf.color);
      ctx.restore();
    };
    write(this.ref.infraction, x + 168, y + 190, T_INFRACTION, 0.5);
    write(R.name, x + 168, y + 240, T_REPORTER, 0.35);
    // the X in the DETAINED box
    const tk = clamp((this.t - T_TICK) / 0.15);
    if (tk > 0) {
      const bx = x + 482, by = y + 296;
      for (let i = 0; i < 9 * tk; i++) { rect(ctx, bx + 2 + i * 2, by + 2 + i * 2, 3, 3, hf.color); rect(ctx, bx + 18 - i * 2, by + 2 + i * 2, 3, 3, hf.color); }
    }
    this._stamp(ctx, 'DETAINED', x + SLIP_W - 150, y + 268, 1.05, -0.14);
  }

  /** False Leah: no infraction, no reporter. Just PRESENT. */
  _present(ctx, x, y) {
    this._stamp(ctx, 'PRESENT', x + SLIP_W / 2, y + 236, 2.2, -0.09);
  }

  _stamp(ctx, word, cx, cy, scale, rot) {
    const sk = clamp((this.t - this.stampAt + 0.12) / 0.12);
    if (sk <= 0) return;
    const st = stampCanvas(word);
    const s = scale * (1 + (1 - sk) * 1.4);
    const w = st.width * 2 * s, h = st.height * 2 * s;
    const a0 = ctx.globalAlpha;
    ctx.save();
    ctx.globalAlpha = a0 * (0.35 + 0.65 * sk);
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.drawImage(st, Math.round(-w / 2), Math.round(-h / 2), Math.round(w), Math.round(h));
    ctx.restore();
  }

  _menu(ctx, a0) {
    const mk = ease.out(clamp((this.t - this.menuAt + MENU_FADE) / MENU_FADE));
    if (mk <= 0) return;
    ctx.globalAlpha = a0 * mk;
    const fs = F.small;
    ['Try again', 'Quit to title'].forEach((label, i) => {
      const yy = 462 + i * 30;
      const sel = i === this.sel;
      const s = spaced(label);
      fs.draw(ctx, s, W / 2, yy, sel ? '#f0e6cc' : '#7a746a', { align: 'center' });
      if (sel) triangle(ctx, snap(W / 2 - fs.width(s) / 2 - 26), yy + 3, 5, C.red, 'right');
    });
    ctx.globalAlpha = a0;
  }
}

const slipCache = new Map();
/** The pink copy of form D-3: perforated top, typed headings, ruled blanks, disposition boxes. */
function referralSlip(present) {
  const key = present ? 'present' : 'full';
  if (slipCache.has(key)) return slipCache.get(key);
  const c = canvas(SLIP_W, SLIP_H);
  const x = ctx2d(c);
  x.drawImage(paperSheet(SLIP_W, SLIP_H, { seed: 'referral', ...PINK, stains: 1 }), 0, 0);
  // torn off the pad along the perforation
  for (let i = 6; i < SLIP_W - 6; i += 12) x.clearRect(i, 0, 6, 4);
  for (let i = 0; i < SLIP_W; i += 12) rect(x, i + 3, 10, 4, AP, 'rgba(140,90,96,0.5)');
  const ink = '#2c2228', dim = '#6a4a52';
  F.typedS.draw(x, 'HALLOWELL CONSOLIDATED SCHOOL', SLIP_W / 2, 20, ink, { align: 'center' });
  F.typedL.draw(x, 'DISCIPLINARY REFERRAL', SLIP_W / 2, 42, '#1e1418', { align: 'center' });
  rect(x, 24, 82, SLIP_W - 48, AP, '#8a3a44');
  rect(x, 24, 86, SLIP_W - 48, 1, '#8a3a44');
  const field = (label, ty, value) => {
    F.typed.draw(x, label, 32, ty, ink);
    for (let i = 166; i < SLIP_W - 40; i += 6) rect(x, i, ty + 26, 4, 1, '#8a5a62');
    if (value) F.typed.draw(x, value, 168, ty, '#141016');
  };
  field('Student:', 104, 'DOLAN, THERESA');
  F.typedS.draw(x, 'GR. 11   HR. 103   10-19-96', SLIP_W - 40, 110, dim, { align: 'right' });
  if (!present) {
    field('Infraction:', 186);
    field('Reported by:', 236);
    F.typed.draw(x, 'Disposition:', 32, 290, ink);
    const boxes = [['WARNING', 182], ['DETENTION', 330], ['DETAINED', 482]];
    for (const [label, bx] of boxes) {
      frame(x, bx, 296, 24, 24, ink);
      F.typedS.draw(x, label, bx + 32, 298, ink);
    }
    F.typedS.draw(x, 'Pupil will remain on the premises until dismissal.', 32, 336, dim);
  }
  F.typedS.draw(x, 'FORM D-3 (REV. 9/78) · PINK — PARENT COPY', SLIP_W - 28, SLIP_H - 30, dim, { align: 'right' });
  F.typedS.draw(x, 'PRINCIPAL __________', 28, SLIP_H - 30, dim);
  slipCache.set(key, c);
  return c;
}
