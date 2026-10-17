// Dialogue: VN-style box with portraits, typewriter text + markup, choices.
//
// Lines are queued; consecutive lines form a "session" — portraits stay up (the inactive speaker
// dims), the box doesn't flicker between lines, and a choice right after a line keeps that line on
// screen. A session ends a few frames after the last line if nothing new arrives.

import { C, F, W } from './theme.js';
import { parseMarkup, layoutMarkup, S_EM, S_SHAKE, S_SLOW, S_RED, S_DIM } from './text.js';
import { steelPanel, plate, triangle, rect, dither, frame, AP, ease, clamp, approach, canvas, ctx2d, snap } from './gfx.js';
import { hashStr, hash2 } from '../art/util.js';
import { mix } from '../art/palette.js';
import * as svc from './services.js';

export const BOX = { x: 20, y: 376, w: 920, h: 150 };
const PW = 192, PH = 240;              // portrait at 2×
const P_SINK = 56;                     // portrait px hidden behind the box
const GRACE = 0.14;                    // seconds a finished line lingers waiting for the next one
const LINE_H = 36;

const BASE_CPS = 40;                   // characters per second at textSpeed 1

// Per-kind text styles.
const STYLE = {
  say:     { font: () => F.body, em: () => F.bodyIt, color: C.text, colorEm: C.textHi, cpsMul: 1 },
  think:   { font: () => F.bodyIt, em: () => F.bodyIt, color: C.think, colorEm: C.thinkHi, cpsMul: 0.9 },
  narrate: { font: () => F.body, em: () => F.bodyIt, color: '#d6cfbb', colorEm: C.textHi, cpsMul: 1 },
  voice:   { font: () => F.mono, em: () => F.mono, color: '#c9d2c3', colorEm: '#f2f7ea', cpsMul: 0.8 },
  colonel: { font: () => F.body, em: () => F.bodyIt, color: '#e9dccb', colorEm: '#fff0e0', cpsMul: 0.42, fade: 0.55 },
};

const darkCache = new WeakMap();
function darkened(c) {
  let d = darkCache.get(c);
  if (!d) {
    d = canvas(c.width, c.height); const x = ctx2d(d);
    x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-atop';
    x.fillStyle = '#05060a'; x.fillRect(0, 0, c.width, c.height);
    darkCache.set(c, d);
  }
  return d;
}

let grilleCanvas = null;
/** Intercom speaker grille (Rauland wall speaker), 48×48 art px. */
function grille() {
  if (grilleCanvas) return grilleCanvas;
  const c = canvas(48, 48); const x = ctx2d(c);
  const cx = 24, cy = 24;
  for (let j = 0; j < 48; j++) for (let i = 0; i < 48; i++) {
    const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy);
    if (d > 23.5) continue;
    let col = d > 21.5 ? '#2a2b31' : d > 20 ? '#8d8a86' : '#56545a';
    if (d <= 19.5) {
      col = (i % 3 === 1 && j % 3 === 1) ? '#0b0b0e' : (j < 20 ? '#6b6a6e' : '#5a585d');
      if (i % 3 === 1 && j % 3 === 1 && d > 17.5) col = '#4b4a50';
    }
    if (d > 20 && d <= 21.5 && (i + j) < 40) col = '#b3afa6';
    x.fillStyle = col; x.fillRect(i, j, 1, 1);
  }
  // badge plate
  x.fillStyle = '#1b1b20'; x.fillRect(16, 37, 16, 5);
  x.fillStyle = '#a6a18f'; x.fillRect(17, 38, 14, 1); x.fillRect(17, 40, 9, 1);
  grilleCanvas = c;
  return c;
}

export class Dialogue {
  constructor(ui) {
    this.ui = ui;
    this.queue = [];
    this.cur = null;         // active line
    this.last = null;        // last finished line (held during grace / choices)
    this.choiceState = null;
    this.boxAlpha = 0;
    this.grace = 0;
    this.slots = { left: null, right: null };
    this.closeup = 0;        // letterbox amount 0..1
    this.t = 0;
  }

  get active() { return !!(this.cur || this.choiceState || this.queue.length); }
  /** Anything on screen (including fade-out). */
  get visible() { return this.active || this.boxAlpha > 0.01 || this.slots.left || this.slots.right; }

  // ---- public API (wrapped by ui.js) ----------------------------------------------------------
  say(who, expr, text, opts = {}) {
    const kind = who === 'voice' ? 'voice' : who === 'colonel' ? 'colonel' : 'say';
    return this._push({ kind, who, expr, text, opts });
  }
  think(expr, text, opts = {}) { return this._push({ kind: 'think', who: 'tess', expr: expr || 'neutral', text, opts }); }
  narrate(text, opts = {}) { return this._push({ kind: 'narrate', who: null, expr: null, text, opts }); }

  choice(options, opts = {}) {
    const list = (options || []).map((o, i) => {
      const text = typeof o === 'string' ? o : o?.text ?? '';
      let ok = true;
      if (o && typeof o === 'object' && 'cond' in o) {
        try { ok = typeof o.cond === 'function' ? !!o.cond(svc.state()) : !!o.cond; } catch { ok = false; }
      }
      return { text, idx: i, ok };
    }).filter((o) => o.ok);
    this.ui._log({ kind: 'choice', options: list.map((o) => o.text) });
    if (!list.length) return Promise.resolve(-1);
    if (svc.auto()) {
      let n = svc.nextChoice();
      if (!list.some((o) => o.idx === n)) n = (list[n] ?? list[0]).idx;
      this.ui._log({ kind: 'chose', index: n });
      return Promise.resolve(n);
    }
    return new Promise((resolve) => {
      const st = { list, sel: 0, resolve, t: 0, frame0: this.ui.frame, ready: !opts.prompt, opts };
      this.choiceState = st;
      if (opts.prompt) {
        // the prompt types out in the box; the list appears once it has finished
        this._push({ kind: opts.who === 'colonel' ? 'colonel' : opts.who ? 'say' : 'think', who: opts.who || 'tess', expr: opts.expr || 'neutral', text: opts.prompt, opts: { ...opts, hold: true } })
          .then(() => { st.ready = true; st.frame0 = this.ui.frame; });
      }
    });
  }

  /** Drop everything (new game / title). Pending promises resolve. */
  reset() {
    for (const l of this.queue) l.resolve?.();
    this.cur?.resolve?.();
    this.choiceState?.resolve?.(0);
    this.queue = []; this.cur = null; this.last = null; this.choiceState = null;
    this.slots = { left: null, right: null }; this.boxAlpha = 0; this.closeup = 0;
  }

  // ---- internals ------------------------------------------------------------------------------
  _push(line) {
    this.ui._log({ kind: line.kind, who: line.who, expr: line.expr, text: line.text });
    if (svc.auto() && !line.opts.hold) return Promise.resolve();
    return new Promise((resolve) => { line.resolve = resolve; this.queue.push(line); });
  }

  _start(line) {
    const o = line.opts || {};
    line.style = STYLE[line.kind];
    line.closeup = !!o.closeup && line.kind !== 'narrate' && line.kind !== 'voice';
    line.side = o.side || (line.who === 'tess' ? 'left' : 'right');
    line.portrait = (line.kind === 'say' || line.kind === 'colonel' || line.kind === 'think') ? svc.portrait(line.who, line.expr, o) : null;
    line.name = (line.kind === 'say' || line.kind === 'colonel' || line.kind === 'voice') ? svc.speakerName(line.who, o) : null;
    const def = svc.chars()[line.who];
    line.color = line.kind === 'colonel' ? '#7a0f1c' : def?.color || C.textDim;
    line.frame0 = this.ui.frame;
    line.page = 0; line.elapsed = 0; line.blips = 0; line.lastBlip = -1; line.revealed = 0;
    line.shake = o.shake || 0;
    // geometry
    let tx = BOX.x + 30, maxW = BOX.w - 60;
    if (line.kind === 'think') { tx = BOX.x + 156; maxW = BOX.w - 156 - 30; }
    if (line.kind === 'voice') { tx = BOX.x + 150; maxW = BOX.w - 150 - 30; }
    if (line.kind === 'narrate') maxW = 600;
    line.tx = tx; line.ty = BOX.y + 24; line.maxW = maxW;
    const fontFor = (s) => (s & S_EM ? line.style.em() : line.style.font());
    const { lines } = layoutMarkup(parseMarkup(line.text), fontFor, maxW);
    line.pages = [];
    for (let i = 0; i < lines.length; i += 3) line.pages.push(this._timeline(lines.slice(i, i + 3), line));
    if (line.kind === 'narrate') {
      const w = Math.max(...lines.map((l) => l.w), 120);
      line.nbox = { w: snap(Math.min(BOX.w, w + 88)) };
    }
    this._stage(line);
    this._pageStart(line);
    this.cur = line;
    this.grace = 0;
  }

  /** Assign appearance times to glyphs; returns { lines, total, end }. */
  _timeline(lines, line) {
    const speed = Math.max(0.2, Number(svc.settings.get('textSpeed')) || 1) * (line.opts.speed || 1);
    const cps = BASE_CPS * line.style.cpsMul * speed;
    const flat = [];
    for (const l of lines) for (const g of l.glyphs) flat.push(g);
    let t = 0.05;
    for (let i = 0; i < flat.length; i++) {
      const g = flat[i];
      t += g.pause || 0;
      g.t = t;
      t += (g.s & S_SLOW ? 3 : 1) / cps;
      const next = flat[i + 1];
      const endish = !next || next.ch === ' ' || next.ch === '"' || next.ch === '\'' || next.ch === ')';
      if ('.!?'.includes(g.ch) && endish && !(next && '.!?'.includes(next.ch))) t += 0.22 / speed;
      else if (g.ch === '.' && next?.ch === '.') t += 0.08 / speed;
      else if (',;:'.includes(g.ch) && endish) t += 0.09 / speed;
      else if (g.ch === '—' || g.ch === '–') t += 0.12 / speed;
    }
    for (const l of lines) if (l.tailPause) t += l.tailPause;
    const fade = line.style.fade || 0;
    return { lines, total: t, end: t + fade };
  }

  _pageStart(line) {
    line.elapsed = 0; line.revealed = 0;
    const page = line.pages[line.page];
    if (line.kind === 'colonel') svc.murmur(Math.max(0.6, page.total));
    if (line.kind === 'voice' && line.page === 0) svc.sfx('intercom_crackle', { vol: 0.5 });
    if (line.who === 'adair' && line.page === 0) svc.sfx('glass_tone', { vol: 0.4 }); // she only speaks through glass
  }

  /** Put the speaker's portrait on stage (slide in on change; dim the other side). */
  _stage(line) {
    const sides = ['left', 'right'];
    if (line.closeup || !line.portrait || line.kind === 'think') {
      for (const s of sides) if (this.slots[s]) this.slots[s].active = false;
      return;
    }
    const s = line.side, other = s === 'left' ? 'right' : 'left';
    const slot = this.slots[s];
    if (slot && slot.who === line.who && !slot.leaving) {
      slot.canvas = line.portrait; slot.active = true;
    } else {
      if (slot) { slot.leaving = true; slot.active = false; this.slots[s + '_old'] = slot; }
      this.slots[s] = { who: line.who, canvas: line.portrait, a: 0, dim: 0, active: true, leaving: false, phase: (hashStr(line.who) % 100) / 16 };
    }
    // the same character can't be on both sides
    const o = this.slots[other];
    if (o && o.who === line.who) { o.leaving = true; }
    else if (o) o.active = false;
  }

  _finishLine() {
    const l = this.cur;
    this.cur = null; this.last = l; this.grace = 0;
    l.resolve?.();
  }

  update(dt, input) {
    this.t += dt;
    if (!this.cur && this.queue.length) this._start(this.queue.shift());
    const l = this.cur;
    if (l) {
      const page = l.pages[l.page];
      l.elapsed += dt;
      this._blips(l, page);
      const done = l.elapsed >= page.end;
      const canInput = input && this.ui.frame > l.frame0;
      if (canInput && (input.pressed('confirm') || input.mouse.clicked)) {
        if (!done) l.elapsed = page.end + 1;
        else if (l.page < l.pages.length - 1) { l.page++; this._pageStart(l); svc.sfx('ui_move', { vol: 0.3 }); }
        else if (!l.opts.hold) this._finishLine();
      }
      if (l.opts.hold && l.elapsed >= page.end && l.page === l.pages.length - 1) this._finishLine();
    }
    const ch = this.choiceState;
    if (ch) {
      ch.t += dt;
      if (ch.ready && input && this.ui.frame > ch.frame0 && !this.cur) {
        const n = ch.list.length;
        if (input.repeat('up')) { ch.sel = (ch.sel + n - 1) % n; svc.sfx('ui_move'); }
        if (input.repeat('down')) { ch.sel = (ch.sel + 1) % n; svc.sfx('ui_move'); }
        if (input.pressed('confirm')) {
          svc.sfx('ui_confirm');
          this.choiceState = null;
          this.grace = 0;
          this.ui._log({ kind: 'chose', index: ch.list[ch.sel].idx });
          ch.resolve(ch.list[ch.sel].idx);
        }
      }
    }
    // session lifetime
    const active = this.active;
    if (!active) this.grace += dt;
    const show = active || this.grace < GRACE;
    this.boxAlpha = approach(this.boxAlpha, show && (this.cur || this.last) ? 1 : 0, dt / (show ? 0.12 : 0.2));
    if (!show && this.boxAlpha <= 0) this.last = null;
    const wantClose = (this.cur || (!show ? null : this.last))?.closeup ? 1 : 0;
    this.closeup = approach(this.closeup, show ? wantClose : 0, dt / 0.35);
    for (const k of ['left', 'right', 'left_old', 'right_old']) {
      const s = this.slots[k];
      if (!s) continue;
      const leaving = s.leaving || !show || k.endsWith('_old') || this.closeup > 0.5;
      s.a = approach(s.a, leaving ? 0 : 1, dt / (leaving ? 0.16 : 0.24));
      s.dim = approach(s.dim, s.active && this.cur ? 0 : (this.cur || this.choiceState ? 1 : s.dim), dt / 0.2);
      if (leaving && s.a <= 0) this.slots[k] = null;
    }
  }

  _blips(l, page) {
    if (l.kind === 'colonel' || l.kind === 'narrate') return;
    let n = 0;
    for (const ln of page.lines) for (const g of ln.glyphs) if (g.t <= l.elapsed) n++;
    if (n > l.revealed) {
      for (let i = l.revealed; i < n; i++) {
        const g = this._glyphAt(page, i);
        if (g && /[\p{L}\p{N}]/u.test(g.ch)) {
          l.blips++;
          if (l.blips % 2 === 1 && l.elapsed - l.lastBlip > 0.05) {
            l.lastBlip = l.elapsed;
            const who = l.kind === 'think' ? 'tess' : l.who;
            if (svc.chars()[who]?.blip !== null) svc.blip(who);
          }
        }
      }
      l.revealed = n;
    }
  }
  _glyphAt(page, i) {
    for (const ln of page.lines) { if (i < ln.glyphs.length) return ln.glyphs[i]; i -= ln.glyphs.length; }
    return null;
  }

  // ---- rendering --------------------------------------------------------------------------------
  render(ctx) {
    const line = this.cur || this.last;
    // closeup letterbox + big portrait
    if (this.closeup > 0) this._renderCloseup(ctx, line);
    for (const k of ['left_old', 'right_old', 'left', 'right']) {
      const s = this.slots[k];
      if (s && s.a > 0) this._renderSlot(ctx, s, k.startsWith('left') ? 'left' : 'right');
    }
    if (line && this.boxAlpha > 0) {
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * ease.out(this.boxAlpha);
      this._renderLine(ctx, line, line === this.cur);
      ctx.globalAlpha = a0;
    }
    if (this.choiceState?.ready) this._renderChoice(ctx, this.choiceState, !!line && this.boxAlpha > 0.5);
  }

  _renderSlot(ctx, s, side) {
    const a = ease.out(s.a);
    const slide = snap((1 - a) * 28) * (side === 'left' ? -1 : 1);
    const bob = snap(Math.sin(this.t * 1.9 + s.phase) * 1.2);
    const x = side === 'left' ? 32 : W - 32 - PW;
    const y = BOX.y + P_SINK - PH + bob;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, BOX.y + AP); ctx.clip();
    ctx.globalAlpha *= a;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s.canvas, x + slide, y, PW, PH);
    if (s.dim > 0) { ctx.globalAlpha = a * s.dim * 0.5; ctx.drawImage(darkened(s.canvas), x + slide, y, PW, PH); }
    ctx.restore();
  }

  _renderCloseup(ctx, line) {
    const k = ease.inOut(this.closeup);
    const bar = snap(64 * k);
    if (line?.portrait && line.closeup) {
      const s = 3, w = 96 * s, h = 120 * s;
      const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * k;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, BOX.y + AP); ctx.clip();
      ctx.drawImage(line.portrait, W / 2 - w / 2, BOX.y + 70 - h + snap(Math.sin(this.t * 1.6) * 1.2), w, h);
      ctx.restore();
      ctx.globalAlpha = a0;
    }
    rect(ctx, 0, 0, W, bar, '#000');
    rect(ctx, 0, 540 - bar, W, bar, '#000');
  }

  _box(line) {
    if (line.kind === 'narrate') {
      const page = line.pages[line.page];
      const h = page.lines.length * LINE_H + 48;
      const w = line.nbox.w;
      return { x: snap(W / 2 - w / 2), y: snap(BOX.y + BOX.h / 2 - h / 2), w, h };
    }
    return BOX;
  }

  _renderLine(ctx, line, live) {
    const page = line.pages[line.page];
    const b = this._box(line);
    let sx = 0, sy = 0;
    if (line.shake && live && line.elapsed < page.end + 0.4) {
      sx = ((hash2(Math.floor(this.t * 30), 1) % 3) - 1) * AP * line.shake;
      sy = ((hash2(Math.floor(this.t * 30), 2) % 3) - 1) * AP * line.shake;
    }
    ctx.save();
    ctx.translate(sx, sy);
    // box
    if (line.kind === 'colonel') {
      steelPanel(ctx, b.x, b.y, b.w, b.h, { fill: 'rgba(12,6,8,0.9)', hi: '#4a2229', mid: '#331a1e', cornerColor: '#7a1a24', seed: 3 });
      dither(ctx, b.x + AP, b.y + b.h - 18, b.w - 2 * AP, 16, 'rgba(120,16,28,0.5)', 0.25);
    } else if (line.kind === 'think') {
      steelPanel(ctx, b.x, b.y, b.w, b.h, { fill: 'rgba(10,12,12,0.84)', hi: '#3a3f3c', mid: '#2a2e2c', cornerColor: '#4d544f', seed: 2 });
    } else if (line.kind === 'narrate') {
      steelPanel(ctx, b.x, b.y, b.w, b.h, { fill: 'rgba(8,9,12,0.86)', seed: 4, corners: false });
    } else {
      steelPanel(ctx, b.x, b.y, b.w, b.h, { seed: 1 });
    }
    // speaker furniture
    if (line.kind === 'think' && line.portrait) this._renderInset(ctx, line, b);
    if (line.kind === 'voice') this._renderGrille(ctx, line, b);
    if (line.name) this._renderPlate(ctx, line, b);
    this._renderText(ctx, line, page, b, live);
    // continue marker
    const done = !live || line.elapsed >= page.end;
    if (done && live && !line.opts.hold && !this.choiceState) {
      const blink = Math.floor(this.t * 2.2) % 2 === 0;
      const more = line.page < line.pages.length - 1;
      const mx = b.x + b.w - 34, my = b.y + b.h - (line.kind === 'narrate' ? 18 : 26) + (blink ? 0 : AP);
      triangle(ctx, mx, my, 5, more ? C.textDim : (line.kind === 'colonel' ? C.crimson : C.red), 'down');
    }
    ctx.restore();
  }

  _renderPlate(ctx, line, b) {
    const f = F.small;
    const label = line.name.toUpperCase().split('').join(' ').replace(/ {3}/g, '   ');
    const tw = f.width(label);
    const w = snap(tw + 28), h = 28;
    const right = line.side === 'right' && line.kind !== 'voice';
    const x = right ? b.x + b.w - 28 - w : b.x + 28;
    const y = b.y - 18;
    let fill, edge, txt;
    if (line.kind === 'colonel') { fill = '#3d0910'; edge = '#9b1b2b'; txt = '#e9c9c0'; }
    else if (line.kind === 'voice') { fill = '#2a2b2f'; edge = '#77767a'; txt = '#cfcabd'; }
    else { fill = mix(line.color, '#0b0b10', 0.62); edge = line.color; txt = mix(line.color, '#f4ecd8', 0.55); }
    plate(ctx, x, y, w, h, fill, edge);
    f.draw(ctx, label, x + 14, y + 4, txt);
  }

  _renderInset(ctx, line, b) {
    // Tess's face, cropped from her portrait, in a small sunken frame (inner voice)
    const x = b.x + 22, y = b.y + 19, s = 112;
    rect(ctx, x - AP * 2, y - AP * 2, s + AP * 4, s + AP * 4, '#050607');
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, s, s); ctx.clip();
    ctx.drawImage(line.portrait, 20, 10, 56, 56, x, y, s, s);
    ctx.globalAlpha *= 0.28; rect(ctx, x, y, s, s, '#1b2420');
    ctx.restore();
    frame(ctx, x - AP, y - AP, s + AP * 2, s + AP * 2, '#3e4541');
  }

  _renderGrille(ctx, line, b) {
    const x = b.x + 28, y = b.y + 27;
    ctx.drawImage(grille(), x, y, 96, 96);
    // pulsing red "talk" lamp under the grille while text is coming in
    const live = this.cur === line && line.elapsed < line.pages[line.page].total;
    rect(ctx, x + 44, y + 100, 8, 4, live && Math.floor(this.t * 9) % 3 ? '#ff3b2e' : '#4a1612');
  }

  _renderText(ctx, line, page, b, live) {
    const st = line.style;
    const fade = st.fade || 0;
    const el = live ? line.elapsed : 1e9;
    const tick = Math.floor(this.t * 20);
    const voice = line.kind === 'voice';
    const flick = voice ? (!svc.reduceFlashing() && hash2(Math.floor(this.t * 12), 7) % 9 === 0 ? 0.55 : 0.92) : 1;
    page.lines.forEach((ln, li) => {
      let x0 = line.tx;
      if (line.kind === 'narrate') x0 = snap(b.x + b.w / 2 - ln.w / 2);
      const y0 = line.kind === 'narrate' ? b.y + 20 + li * LINE_H : line.ty + li * LINE_H + (voice ? 2 : 0);
      for (let i = 0; i < ln.glyphs.length; i++) {
        const g = ln.glyphs[i];
        if (g.ch === ' ' || g.t > el) continue;
        let alpha = fade ? clamp((el - g.t) / fade) : 1;
        let color = g.s & S_RED ? (line.kind === 'colonel' ? '#c22a35' : C.red) : g.s & S_DIM ? C.dim : g.s & S_EM ? st.colorEm : st.color;
        let gx = line.tx === x0 ? x0 + g.x : x0 + g.x, gy = y0;
        if (g.s & S_SHAKE) {
          gx += ((hash2(tick, i + li * 97) % 3) - 1) * AP;
          gy += ((hash2(tick, i + li * 97 + 5) % 3) - 1) * AP;
        }
        let ch = g.ch;
        if (voice) {
          alpha *= flick;
          const h = hash2(tick >> 1, i + li * 131);
          if (h % 509 === 0) ch = '#%&@/'[h % 5];
          if (h % 211 === 0) gx += AP * 2;
        }
        g.f.glyph(ctx, ch, gx, gy, color, alpha);
      }
    });
    if (voice) {
      // a faint rolling interference band across the box
      const by = b.y + ((this.t * 60) % (b.h + 40)) - 20;
      dither(ctx, b.x + AP, Math.max(b.y + AP, by), b.w - 2 * AP, 6, 'rgba(200,210,190,0.25)', 0.3);
    }
  }

  _renderChoice(ctx, ch, boxUp) {
    const f = F.body;
    const rows = ch.list.map((o) => ({ ...o, quiet: /^\(.*\)$/.test(o.text.trim()) }));
    const tw = Math.max(...rows.map((r) => (r.quiet ? F.bodyIt : f).width(r.text)));
    const w = snap(Math.min(900, tw + 92)), rowH = 42, h = rows.length * rowH + 24;
    const x = snap(W / 2 - w / 2);
    const bottom = boxUp ? BOX.y - 26 : BOX.y + BOX.h;
    const y = snap(bottom - h);
    const a = ease.out(clamp(ch.t / 0.16));
    const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * a;
    steelPanel(ctx, x, y + snap((1 - a) * 10), w, h, { fill: 'rgba(9,10,13,0.94)', seed: 5 });
    rows.forEach((r, i) => {
      const ry = y + 12 + i * rowH + snap((1 - a) * 10);
      const sel = i === ch.sel;
      if (sel) {
        rect(ctx, x + AP * 2, ry, w - AP * 4, rowH - AP, 'rgba(232,224,200,0.07)');
        rect(ctx, x + AP * 2, ry, AP, rowH - AP, C.red);
        const nudge = Math.floor(ch.t * 3) % 2 ? AP : 0;
        triangle(ctx, x + 18 + nudge, ry + 12, 6, C.red, 'right');
      }
      const ff = r.quiet ? F.bodyIt : f;
      const col = sel ? (r.quiet ? C.thinkHi : C.textHi) : (r.quiet ? C.textMute : C.textDim);
      ff.draw(ctx, r.text, x + 48, ry + 3, col);
    });
    ctx.globalAlpha = a0;
  }
}
