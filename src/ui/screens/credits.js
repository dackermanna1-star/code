// Credits: slow scroll over black. Confirm/cancel leaves; holding confirm speeds it up.
import { Screen } from '../screen.js';
import { C, F, W, H } from '../theme.js';
import { rect, vignette, snap } from '../gfx.js';
import { logo } from '../logo.js';
import { spaced } from '../widgets.js';
import * as svc from '../services.js';

const LINES = [
  ['logo'],
  ['sub', 'the things left behind'],
  ['gap'],
  ['head', 'A game about a school that keeps what it is given'],
  ['gap'],
  ['role', 'Story, design & direction'], ['name', 'The Hallowell team'],
  ['role', 'Engine, lighting, audio, art, interface'], ['name', 'Written by hand in JavaScript, Canvas 2D and WebAudio'],
  ['role', 'Every sound'], ['name', 'Synthesized. No samples.'],
  ['gap'],
  ['head', 'Typefaces (SIL Open Font License)'],
  ['name', 'DotGothic16 — Fontworks'], ['name', 'VT323 — Peter Hull'], ['name', 'Special Elite — Astigmatic'],
  ['name', 'Patrick Hand — Patrick Wagesreiter'], ['name', 'Caveat — Impallari Type'], ['name', 'Pixelify Sans — Stefie Justprince'],
  ['gap'],
  ['head', 'In memory of'],
  ['name', 'Denise Webb · Kevin Hoyt · Carol Ann Mrazek'], ['name', 'Thomas Delvecchio · Patricia Szalay · Raymond Oakes'],
  ['name', 'Lisa Gorski · Anthony Burdick · Michelle Yancey'], ['name', 'Miss Ruth Adair'],
  ['name', 'Joseph Pruszynski, 1962'], ['name', 'and the seventeen boys of the Hallowell Breaker, 1894'],
  ['gap'],
  ['quote', 'Nemo relinquatur.'],
  ['gap'], ['gap'],
  ['small', 'Kettle Run, Schuylkill County, Pennsylvania is fictional.'],
  ['small', 'The cicadas are real. They come back every seventeen years.'],
];

export class CreditsScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.fadeIn = 0.8; this.fadeOut = 0.6;
    this.scroll = -H + 80;
    this.layout = [];
    let y = 0;
    for (const [kind, text] of LINES) {
      const h = { logo: 150, sub: 60, gap: 40, head: 44, role: 26, name: 40, quote: 60, small: 28 }[kind];
      this.layout.push({ kind, text, y });
      y += h;
    }
    this.total = y;
  }
  update(dt, input) {
    const fast = input && input.down('confirm') && this.t > 0.6;
    this.scroll += dt * (fast ? 160 : 34);
    if (this.scroll > this.total + 40) this.close(null);
    if (input && this.t > 0.4 && (input.pressed('cancel') || input.pressed('pause'))) { svc.sfx('ui_close'); this.close(null); }
  }
  render(ctx) {
    rect(ctx, 0, 0, W, H, '#030304');
    for (const l of this.layout) {
      const y = snap(l.y - this.scroll);
      if (y < -120 || y > H + 20) continue;
      if (l.kind === 'logo') { const L = logo(); ctx.drawImage(L.canvas, snap(W / 2 - L.w), y, L.w * 2, L.h * 2); }
      else if (l.kind === 'sub') F.typed.draw(ctx, l.text, W / 2, y, '#a39a84', { align: 'center' });
      else if (l.kind === 'head') F.small.draw(ctx, spaced(l.text), W / 2, y, '#8d877a', { align: 'center' });
      else if (l.kind === 'role') F.small.draw(ctx, l.text.toUpperCase(), W / 2, y, '#6c675e', { align: 'center' });
      else if (l.kind === 'name') F.typed.draw(ctx, l.text, W / 2, y, '#d8cfb6', { align: 'center' });
      else if (l.kind === 'quote') F.typedL.draw(ctx, l.text, W / 2, y, '#c8423b', { align: 'center' });
      else if (l.kind === 'small') F.small.draw(ctx, l.text, W / 2, y, '#5c5850', { align: 'center' });
    }
    vignette(ctx, 0.8, 0.6);
    F.small.draw(ctx, 'hold to hurry · back to leave', W - 24, H - 30, '#3e3c40', { align: 'right' });
  }
}
