// 'register' — the Register, open on the weigh-master's desk (DESIGN §8, TECH §16).
// args { model } where model = { title, founder: { name, status }, lines: [{ id, name, ink, status }],
//   tools: [{ id: 'stamp'|'form'|'pen', label, available, comment? }],
//   apply: async (toolId, lineId | 'founder') => ({ ok, say: [[who, expr, text], ...] }), refresh: () => model }
// Pick a tool from the tray, then a line; the model decides what happens; the UI plays the lines
// and animates whatever changed (WITHDRAWN stamp, transfer slip, red EXPELLED). Resolves when the
// player closes the book (after a confirm).
import { Screen, Z_SPECIAL } from '../screen.js';
import { C, F, W, H, handFont } from '../theme.js';
import { font } from '../text.js';
import { FONT } from '../fonts.js';
import { canvas, ctx2d, rect, frame, dither, triangle, paperSheet, AP, clamp, ease, snap } from '../gfx.js';
import { hints, spaced } from '../widgets.js';
import { stampCanvas } from '../screens/card.js';
import { rng, hashStr, hash2 } from '../../art/util.js';
import * as svc from '../services.js';

const PAGE = { x: 52, y: 18, w: 856, h: 420 };
const COL = { no: 70, name: 130, enrolled: 520, remarks: 660 };
const ROW0 = 96, ROW_H = 46;
const TOOL_ICON = { stamp: 'withdrawn_stamp', form: 'transfer_form', pen: 'red_pen' };
const TOOL_COMMENT = {
  stamp: 'WITHDRAWN. Like a transfer. It only takes on pencil.',
  form: "Mom already signed it. I'd just have to write a name.",
  pen: "Miss Adair's red pen. It still writes.",
  close: "Close it. Whatever's written stays written.",
};
const STAMP_INK = '#7a1f3a';

const pencilFont = () => font({ family: FONT.hand, size: 28, lineHeight: 32, threshold: 0.45 });
const inkFont = () => font({ family: FONT.script, size: 34, lineHeight: 36, weight: 700, threshold: 0.45, skew: -0.06 });
/** Largest red-ink size that keeps the founder's line inside the name + enrolled columns. */
function founderFont(name) {
  for (const size of [32, 30, 28, 26, 24]) {
    const f = font({ family: FONT.script, size, lineHeight: size + 2, weight: 700, threshold: 0.45, skew: -0.06 });
    if (f.width(name) <= COL.remarks - COL.name - 24) return f;
  }
  return font({ family: FONT.script, size: 22, lineHeight: 24, weight: 700, threshold: 0.45, skew: -0.06 });
}

export class RegisterScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.z = Z_SPECIAL;
    this.dimWorld = 0.86;
    this.fadeIn = 0.6;
    this.model = args.model || { title: 'REGISTER', founder: { name: 'HALLOWELL, CYRUS', status: 'enrolled' }, lines: [], tools: [] };
    this.mode = 'tray';
    this.toolSel = 0; this.lineSel = 0;
    this.busy = false;
    this.anims = [];           // { kind: 'stamp'|'slip'|'expel', row, t }
    this.marks = new Map();    // rowKey → 'stamp' | 'slip' | 'expel'
    for (const l of this.model.lines || []) if (l.status === 'withdrawn') this.marks.set(l.id, 'stamp');
    if (this.model.founder?.status && this.model.founder.status !== 'enrolled') this.marks.set('founder', 'expel');
    this.shake = 0;
  }
  onOpen() { svc.sfx('book_close', { rate: 0.8 }); svc.sfx('page_turn'); }

  get tray() {
    const tools = (this.model.tools || []).map((t) => ({ ...t }));
    return [...tools, { id: 'close', label: 'Close the book', available: true }];
  }
  get rows() { return [{ id: 'founder', founder: true, ...this.model.founder }, ...(this.model.lines || [])]; }

  async _apply(tool, row) {
    this.busy = true;
    const before = new Map(this.rows.map((r) => [r.id, r.status]));
    let res = null;
    try { res = await this.model.apply?.(tool.id, row.id); } catch (e) { console.error('[ui] register.apply', e); }
    try { this.model = this.model.refresh?.() || this.model; } catch (e) { console.error('[ui] register.refresh', e); }
    // animate whatever changed
    for (const r of this.rows) {
      const was = before.get(r.id);
      if (was === r.status) continue;
      const kind = r.founder ? 'expel' : tool.id === 'form' ? 'slip' : 'stamp';
      this.anims.push({ kind, id: r.id, t: 0 });
      if (kind === 'expel') svc.sfx('pen_scratch');
      else if (kind === 'slip') { svc.sfx('paper_rustle'); svc.sfx('pen_scratch', { vol: 0.6 }); }
    }
    for (const line of res?.say || []) {
      if (!Array.isArray(line)) continue;
      const [who, expr, text] = line;
      await this.ui.say(who, expr, text);
    }
    this.busy = false;
    this.mode = 'tray';
  }

  update(dt, input) {
    this.shake = Math.max(0, this.shake - dt);
    for (const a of this.anims) {
      const before = a.t;
      a.t += dt;
      if (a.kind === 'stamp' && before < 0.32 && a.t >= 0.32) { svc.sfx('stamp'); this.shake = 0.2; }
      if (a.t > (a.kind === 'expel' ? 1.6 : 0.8)) this.marks.set(a.id, a.kind);
    }
    this.anims = this.anims.filter((a) => a.t <= (a.kind === 'expel' ? 1.6 : 0.8));
    if (!input || this.busy) return;
    const tray = this.tray;
    if (this.mode === 'tray') {
      if (input.repeat('left')) { this.toolSel = (this.toolSel + tray.length - 1) % tray.length; svc.sfx('ui_move'); }
      if (input.repeat('right')) { this.toolSel = (this.toolSel + 1) % tray.length; svc.sfx('ui_move'); }
      if (input.pressed('confirm')) {
        const t = tray[this.toolSel];
        if (t.id === 'close') { this._close(); return; }
        if (!t.available) { svc.sfx('door_locked', { vol: 0.4 }); this.busy = true; this.ui.think('neutral', t.unavailableText || "I don't have that anymore.").then(() => { this.busy = false; }); return; }
        svc.sfx('ui_confirm');
        this.mode = 'line';
        const rows = this.rows;
        const first = t.id === 'pen' ? 0 : Math.max(1, rows.findIndex((r) => !r.founder && r.status !== 'withdrawn'));
        this.lineSel = first < 0 ? 1 : first;
      }
    } else {
      const n = this.rows.length;
      if (input.repeat('up')) { this.lineSel = (this.lineSel + n - 1) % n; svc.sfx('ui_move'); }
      if (input.repeat('down')) { this.lineSel = (this.lineSel + 1) % n; svc.sfx('ui_move'); }
      if (input.pressed('confirm')) this._apply(tray[this.toolSel], this.rows[this.lineSel]);
      else if (input.pressed('cancel')) { this.mode = 'tray'; svc.sfx('ui_cancel'); }
    }
  }

  async _close() {
    this.busy = true;
    const yes = await this.open('confirm', { text: 'Close the book? Whatever is written stays written.', yes: 'Close it', no: 'Not yet', danger: true });
    this.busy = false;
    if (yes) { svc.sfx('book_close'); this.close(null); }
  }

  render(ctx) {
    const k = ease.out(clamp(this.t / 0.5));
    const sx = this.shake > 0 ? ((hash2(Math.floor(this.t * 50), 2) % 3) - 1) * AP : 0;
    ctx.save(); ctx.translate(sx, snap((1 - k) * 30));
    const { x, y, w, h } = PAGE;
    dither(ctx, x + 10, y + 10, w, h, 'rgba(0,0,0,1)', 0.6);
    ctx.drawImage(ledgerPage(this.model.title), x, y);
    const rows = this.rows;
    rows.forEach((r, i) => this._row(ctx, r, i));
    for (const a of this.anims) this._anim(ctx, a);
    // selection (line mode): red pencil arrow + faint band, the chosen tool hovering by the remarks
    if (this.mode === 'line' && !this.busy) {
      const ry = y + ROW0 + this.lineSel * ROW_H;
      rect(ctx, x + 8, ry - 6, w - 16, ROW_H - 4, 'rgba(178,38,44,0.08)');
      triangle(ctx, x + 20 + (Math.floor(this.t * 3) % 2 ? AP : 0), ry + 8, 6, C.stampRed, 'right');
      const tool = this.tray[this.toolSel];
      const ic = svc.icon(TOOL_ICON[tool.id]);
      const bob = Math.floor(this.t * 2) % 2 ? 0 : -AP;
      if (ic) ctx.drawImage(ic, x + w - 70, ry - 10 + bob, 48, 48);
    }
    ctx.restore();
    this._tray(ctx);
    hints(ctx, this.mode === 'line' ? [['BACK', this.ui.input.keyLabel('cancel')], ['USE', this.ui.input.keyLabel('confirm')], ['LINE', '↑ ↓']]
      : [['PICK UP', this.ui.input.keyLabel('confirm')], ['TOOL', '← →']], H - 26);
  }

  _row(ctx, r, i) {
    const { x, y } = PAGE;
    const ry = y + ROW0 + i * ROW_H;
    const mark = this.marks.get(r.id);
    if (r.founder) {
      // the founder's line runs across the name and enrolled columns, in red ink
      const name = r.name || 'HALLOWELL, CYRUS — FOUNDER — FIRST PUPIL';
      const fit = founderFont(name);
      fit.draw(ctx, name, x + COL.name, ry - 6, '#8e1622');
      F.typedS.draw(ctx, '1.', x + COL.no - 30, ry + 6, '#6a5a40');
      if (mark === 'expel') this._expel(ctx, x, ry, 1, fit.width(name));
      return;
    }
    F.typedS.draw(ctx, `${i + 1}.`, x + COL.no - 30, ry + 6, '#6a5a40');
    const pencil = r.ink !== 'ink';
    const f = pencil ? pencilFont() : inkFont();
    const col = pencil ? '#5f5e66' : '#141318';
    if (pencil) {
      f.draw(ctx, r.name, x + COL.name + 2, ry - 2, 'rgba(95,94,102,0.28)'); // graphite smudge
      f.draw(ctx, r.name, x + COL.name, ry - 4, col);
      f.draw(ctx, '10-18-96', x + COL.enrolled + 12, ry - 4, col);
    } else {
      f.draw(ctx, r.name, x + COL.name, ry - 8, col);
      f.draw(ctx, '10-18-96', x + COL.enrolled + 12, ry - 8, col);
    }
    if (mark === 'stamp') this._stamp(ctx, x + COL.remarks + 96, ry + 12, 1, r.id);
    if (mark === 'slip') this._slip(ctx, x + COL.remarks + 20, ry - 10, 1);
  }

  _stamp(ctx, cx, cy, k, id) {
    const st = stampCanvas('WITHDRAWN', STAMP_INK);
    const s = 1 + (1 - ease.out(k)) * 0.9;
    const w = st.width * 2 * s * 0.8, h = st.height * 2 * s * 0.8;
    ctx.save();
    ctx.globalAlpha *= 0.4 + 0.6 * k;
    ctx.translate(cx, cy);
    ctx.rotate(-0.06 + ((hashStr(String(id)) % 7) - 3) * 0.012);
    ctx.drawImage(st, Math.round(-w / 2), Math.round(-h / 2), Math.round(w), Math.round(h));
    ctx.restore();
  }
  _slip(ctx, x, y, k) {
    // the transfer form folded into a slip and clipped to the line
    const a = ease.out(k);
    const yy = snap(y - (1 - a) * 30);
    ctx.save(); ctx.globalAlpha *= a;
    dither(ctx, x + 4, yy + 4, 190, 40, 'rgba(0,0,0,1)', 0.5);
    ctx.drawImage(paperSheet(190, 40, { seed: 'slip', tone: '#e6e2d4', hi: '#f0ede2', stains: 0 }), x, yy);
    F.typedS.draw(ctx, 'TRANSFERRED', x + 14, yy + 10, '#2a2a30');
    rect(ctx, x + 150, yy - 6, 8, 28, '#9a999e'); rect(ctx, x + 152, yy - 4, 4, 22, '#d6d5da');
    ctx.restore();
  }
  _expel(ctx, x, ry, k, nameW) {
    // red pen: a line struck through the Founder, then EXPELLED scrawled in the remarks
    const strike = clamp(k / 0.4);
    const r = rng(17);
    for (let i = 0; i < nameW * strike; i += AP) rect(ctx, x + COL.name + i, ry + 10 + Math.round(Math.sin(i * 0.05) * 2 + (r() - 0.5) * 1.5), AP, AP * 2, '#c0202c');
    const wk = clamp((k - 0.4) / 0.6);
    if (wk <= 0) return;
    const f = font({ family: FONT.script, size: 40, lineHeight: 40, weight: 700, threshold: 0.45, skew: -0.2 });
    const text = 'EXPELLED';
    const tw = f.width(text);
    ctx.save();
    ctx.beginPath(); ctx.rect(x + COL.remarks, ry - 20, 20 + tw * wk, 70); ctx.clip();
    f.draw(ctx, text, x + COL.remarks + 12, ry - 14, '#c0202c');
    ctx.restore();
    if (wk >= 1) for (let i = 0; i < tw; i += AP) rect(ctx, x + COL.remarks + 12 + i, ry + 26 + Math.round(Math.sin(i * 0.09) * 2), AP, AP, '#c0202c');
  }
  _anim(ctx, a) {
    const i = this.rows.findIndex((r) => r.id === a.id);
    if (i < 0) return;
    const { x, y } = PAGE;
    const ry = y + ROW0 + i * ROW_H;
    if (a.kind === 'stamp') {
      // the stamp comes down from above, then lands at 0.32 s
      const k = clamp(a.t / 0.32);
      this._stamp(ctx, x + COL.remarks + 96, ry + 12 - (1 - k) * 40, k, a.id);
    } else if (a.kind === 'slip') this._slip(ctx, x + COL.remarks + 20, ry - 10, clamp(a.t / 0.5));
    else this._expel(ctx, x, ry, clamp(a.t / 1.6), this._founderW());
  }
  _founderW() {
    const name = this.model.founder?.name || 'HALLOWELL, CYRUS — FOUNDER — FIRST PUPIL';
    return founderFont(name).width(name);
  }

  _tray(ctx) {
    const y = 448, tray = this.tray;
    // the desk edge: dark tarred wood
    rect(ctx, 0, y - 6, W, 100, '#1a120c');
    rect(ctx, 0, y - 6, W, AP, '#3a2818');
    for (let i = 0; i < W; i += 46) rect(ctx, i, y + 30 + ((i / 46) % 3) * 8, 30, AP, '#22170f');
    const cw = 190, x0 = snap(W / 2 - (cw * tray.length) / 2);
    tray.forEach((t, i) => {
      const cx = x0 + i * cw + cw / 2;
      const on = i === this.toolSel;
      const avail = t.available !== false;
      if (t.id === 'close') {
        const s = spaced('Close the book');
        F.small.draw(ctx, s, cx, y + 26, on ? C.textHi : avail ? C.textDim : '#4a4850', { align: 'center' });
      } else {
        const ic = svc.icon(TOOL_ICON[t.id]);
        const lift = on && this.mode === 'tray' ? -AP * 2 : 0;
        if (ic) { ctx.save(); if (!avail) ctx.globalAlpha *= 0.35; ctx.drawImage(ic, cx - 24, y + 2 + lift, 48, 48); ctx.restore(); }
        F.small.draw(ctx, t.label || t.id, cx, y + 54, on ? C.textHi : avail ? C.textDim : '#4a4850', { align: 'center' });
        if (!avail) rect(ctx, cx - 30, y + 64, 60, AP, '#4a4850');
      }
      if (on) {
        const sel = this.mode === 'tray';
        frame(ctx, x0 + i * cw + 10, y - 2, cw - 20, 80, sel ? C.red : 'rgba(208,69,60,0.4)');
      }
    });
    // Tess's comment on the highlighted tool, pencilled on a scrap at the left
    if (this.mode === 'tray' && !this.busy) {
      const t = tray[this.toolSel];
      const text = t.comment || TOOL_COMMENT[t.id] || '';
      const hf = handFont('tess');
      const tw = Math.min(560, hf.font.width(text) + 40);
      const px = snap(W / 2 - tw / 2), py = PAGE.y + PAGE.h - 6;
      ctx.drawImage(paperSheet(snap(tw), 34, { seed: 'regnote', tone: '#e2dbc6', stains: 0, torn: 'bottom' }), px, py - 30);
      hf.font.draw(ctx, text, px + 20, py - 30, hf.color);
    }
  }
}

let pageCache = null, pageTitle = null;
/** The ledger page: aged paper, blue rules, double red column lines, typed headings, bleed-through. */
function ledgerPage(title) {
  if (pageCache && pageTitle === title) return pageCache;
  const { w, h } = PAGE;
  const c = canvas(w, h); const x = ctx2d(c);
  x.drawImage(paperSheet(w, h, { seed: 'register', tone: '#d8c9a0', hi: '#e3d6b0', lo: '#bfae84', edge: '#8f7f58', stains: 3 }), 0, 0);
  // bleed-through from the previous page: 1979 names, mirrored and faint
  const bf = font({ family: FONT.script, size: 30, lineHeight: 30, weight: 700, threshold: 0.45 });
  const ghost = ['WEBB, DENISE', 'HOYT, KEVIN', 'MRAZEK, CAROL ANN', 'DELVECCHIO, THOMAS', 'SZALAY, PATRICIA', 'OAKES, RAYMOND'];
  x.save(); x.translate(w, 0); x.scale(-1, 1); x.globalAlpha = 0.07;
  ghost.forEach((g, i) => bf.draw(x, g, 170, ROW0 + (i + 1) * ROW_H - 4, '#2a1a10'));
  x.restore();
  // header
  F.typed.draw(x, title || 'REGISTER OF PUPILS', w / 2, 10, '#2a2420', { align: 'center' });
  const heads = [['NO.', COL.no - 34], ['NAME OF PUPIL', COL.name], ['ENROLLED', COL.enrolled + 12], ['STATUS · REMARKS', COL.remarks + 12]];
  for (const [t, cx] of heads) F.small.draw(x, t, cx, 50, '#5a4a36');
  // rules
  for (let ry = ROW0 + ROW_H - 12; ry < h - 6; ry += ROW_H) rect(x, 8, ry, w - 16, AP / 2 + 1, '#8fa0b4');
  rect(x, 8, 74, w - 16, AP, '#b3262c'); rect(x, 8, 78, w - 16, AP / 2 + 1, '#b3262c');
  for (const cx of [COL.no + 10, COL.enrolled, COL.remarks]) { rect(x, cx, 40, AP / 2 + 1, h - 46, '#c0606a'); rect(x, cx + 4, 40, AP / 2 + 1, h - 46, '#c0606a'); }
  // binding gutter shadow on the left
  for (let i = 0; i < 6; i++) rect(x, i * 2, 0, AP, h, `rgba(40,25,10,${0.3 - i * 0.05})`);
  pageCache = c; pageTitle = title;
  return c;
}
