// 'register' — the Register, open on the weigh-master's desk (DESIGN §8, §6 VIII.5; TECH §16).
//
// args { model, onWithdraw?: async (id, tool, text) => void }
//   model (game/endings.js buildRegisterModel): founder, lines [{ id, name, ink, status, by, reason, keepsake }],
//   tools [{ id, label, available, comment, unavailableText }], preview(tool, line) → { text, ok },
//   apply(tool, line, opts) → { ok, kind, say, need: 'confirm'|'grounds'|'write', prompt, options, write, voice },
//   startOver() → { say }, closeSummary() → { prompt, options }, grounds [{ id, rule }], refresh().
//   onWithdraw: the friend's real voice far above (ch8 scripts); default = a dim line of narration.
// Resolves (null) when the player closes the book — after a confirm that lists, in Tess's voice, what remains.
//
// Flow: pick a tool in the tray → pick a line (Tess predicts what will happen) → apply. Everything is
// provisional until the book is closed; [Start over] wipes the page back. The pen on the founder asks for
// grounds (the school's rules R1–R6), then the expulsion is written by holding Confirm (the 'write' screen);
// at ~70 % the Colonel's ringed hand slides in beside the book (CG colonel_hand, red light) and he says
// "Theresa. {p} Put down the pen." — letting go only pauses. At 100 % EXPELLED, and the hand withdraws.
import { Screen, Z_SPECIAL } from '../screen.js';
import { C, F, W, H, handFont } from '../theme.js';
import { font } from '../text.js';
import { FONT } from '../fonts.js';
import { canvas, ctx2d, rect, frame, dither, triangle, paperSheet, steelPanel, plate, AP, clamp, ease, snap } from '../gfx.js';
import { hints } from '../widgets.js';
import { stampCanvas } from '../screens/card.js';
import { rng, hashStr, hash2 } from '../../art/util.js';
import * as svc from '../services.js';

const PAGE = { x: 52, y: 18, w: 856, h: 420 };
const COL = { no: 70, name: 130, enrolled: 520, remarks: 660 };
const ROW0 = 92, ROW_H = 46, FOUNDER_H = 84;  // the founder's block has room for the expulsion under it
const TRAY_Y = 448;
const STAMP_INK = '#7a1f3a';
const RED = '#b4161f', RED_HI = '#d42a32';
const COLONEL_LINE = 'Theresa. {p} Put down the pen.';
const HAND_AT = 0.7;              // write progress at which the hand arrives

const TRAY_EXTRA = [
  { id: 'reset', label: 'Start over', comment: 'Okay. If I got it wrong, I can still start over. Until I close it.' },
  { id: 'close', label: 'Close the book', comment: "Close it. Whatever's written stays written." },
];
const DEFAULT_COMMENT = {
  stamp: 'WITHDRAWN. Like a transfer. It only takes on pencil.',
  form: "Mom already signed it. I'd just have to write a name.",
  pen: "Miss Adair's red pen. It still writes.",
};

const pencilFont = () => font({ family: FONT.hand, size: 28, lineHeight: 32, threshold: 0.45 });
const inkFont = () => font({ family: FONT.script, size: 34, lineHeight: 36, weight: 700, threshold: 0.45, skew: -0.06 });
const redFont = () => font({ family: FONT.script, size: 26, lineHeight: 28, weight: 700, threshold: 0.45, skew: -0.1 });
const keepFont = () => font({ family: FONT.hand, size: 22, lineHeight: 26, threshold: 0.45 });
const expelFont = () => font({ family: FONT.script, size: 44, lineHeight: 44, weight: 700, threshold: 0.45, skew: -0.2 });
/** Largest red-ink size that keeps the founder's name inside the name column. */
function founderFont(name) {
  for (const size of [34, 32, 30, 28, 26]) {
    const f = font({ family: FONT.script, size, lineHeight: size + 2, weight: 700, threshold: 0.45, skew: -0.06 });
    if (f.width(name) <= COL.remarks - COL.name - 24) return f;
  }
  return font({ family: FONT.script, size: 24, lineHeight: 26, weight: 700, threshold: 0.45, skew: -0.06 });
}

export class RegisterScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.z = Z_SPECIAL;
    this.dimWorld = 0.86;
    this.fadeIn = 0.6;
    this.model = args.model || { title: 'REGISTER OF PUPILS', founder: { id: 'founder', name: 'HALLOWELL, CYRUS — FIRST PUPIL', status: 'enrolled' }, lines: [], tools: [] };
    this.mode = 'tray';          // 'tray' | 'line' | 'grounds' | 'write'
    this.toolSel = 0; this.lineSel = 0; this.groundSel = 1;
    this.busy = false;
    this.anims = [];             // { kind: 'stamp'|'slip'|'expel', id, t }
    this.dust = [];              // pencil dust lifting off withdrawn names
    this.ghosts = [];            // marks fading after Start over
    this.shake = 0;
    this.write = null;           // { p, text, handT, lineT, done, out } while the expulsion is written
    this._sync();
  }
  onOpen() { svc.sfx('book_close', { rate: 0.8 }); svc.sfx('page_turn'); }

  // ---- model access (tolerant of the plain TECH §16 shape) ---------------------------------------------------
  // The page and the tray are snapshotted from the model after every change (not rebuilt per frame).
  get tray() { return this._trayItems; }
  get rows() { return this._rowItems; }
  _sync() {
    const m = this.model;
    this._rowItems = [{ ...m.founder, id: 'founder', founder: true }, ...(m.lines || [])];
    this._trayItems = [...(m.tools || []).map((t) => ({ ...t })), ...TRAY_EXTRA.map((t) => ({ ...t, available: t.id !== 'reset' || !!m.dirty }))];
    this._version = (this._version || 0) + 1;
  }
  _rowY(i) { return PAGE.y + (i === 0 ? ROW0 : ROW0 + FOUNDER_H + (i - 1) * ROW_H); }
  _refresh() {
    try { this.model = this.model.refresh?.() || this.model; } catch (e) { console.error('[ui] register.refresh', e); }
    this._sync();
  }
  /** Tess's note under the page (tool caption / prediction), memoised per selection and page version. */
  _note() {
    const key = `${this.mode}|${this.toolSel}|${this.lineSel}|${this._version}`;
    if (key === this._noteKey) return this._noteText;
    let text = '';
    const t = this.tray[this.toolSel];
    if (this.mode === 'tray') text = (t.available === false && t.id !== 'reset' && t.unavailableText) || t.comment || DEFAULT_COMMENT[t.id] || '';
    else if (this.mode === 'line') text = this.model.preview?.(t.id, this.rows[this.lineSel].id)?.text || '';
    this._noteKey = key;
    this._noteText = text.replace(/\{p(=[\d.]+)?\}/g, '').replace(/\s+/g, ' ').trim();
    return this._noteText;
  }

  async _say(lines) {
    for (const line of lines || []) {
      if (!Array.isArray(line)) continue;
      const [who, expr, text, o] = line;
      if (who === 'think') await this.ui.think(expr || 'neutral', text, { light: 'red', ...(o || {}) });
      else if (who === 'narrate') await this.ui.narrate(text, o || {});
      else await this.ui.say(who, expr || 'neutral', text, { light: 'red', ...(o || {}) });
    }
  }

  // ---- actions -------------------------------------------------------------------------------------------------
  async _apply(tool, row, opts = {}) {
    this.busy = true;
    let res = null;
    try { res = await this.model.apply?.(tool.id, row.id, opts); } catch (e) { console.error('[ui] register.apply', e); }
    res = res || { ok: false, say: [] };
    if (res.need === 'confirm') {
      const k = await this.ui.choice(res.options || ['Yes', 'No'], { prompt: res.prompt, expr: 'look_away', light: 'red' });
      if (k === 0) { await this._apply(tool, row, { ...opts, confirmed: true }); return; }
      this.busy = false; this.mode = 'line';
      return;
    }
    if (res.need === 'grounds' && !res.say?.length) { this.busy = false; this.mode = 'grounds'; return; }
    if (res.need === 'write') { this._startWrite(res, row); return; }
    this._refresh();
    if (res.ok) await this._land(res, row, tool.id);
    else {
      svc.sfx('door_locked', { vol: 0.35 });
      this.shake = 0.18;
      await this._say(res.say);
      if (res.need === 'grounds') { this.busy = false; this.mode = 'grounds'; return; }
    }
    this.busy = false;
    this.mode = res.ok ? 'tray' : 'line';
  }

  /** A stamp or a transfer slip lands; the name lifts off like pencil dust; the friend calls from above. */
  async _land(res, row, toolId) {
    const kind = res.kind === 'form' || toolId === 'form' ? 'slip' : 'stamp';
    this.anims.push({ kind, id: row.id, t: 0 });
    if (kind === 'slip') { svc.sfx('paper_rustle'); svc.sfx('pen_scratch', { vol: 0.6 }); }
    await this._wait(kind === 'slip' ? 0.7 : 0.55);
    this._lift(row);
    await this._wait(0.5);
    if (res.voice?.text) {
      if (this.args.onWithdraw) { try { await this.args.onWithdraw(row.id, toolId, res.voice.text); } catch (e) { console.error('[ui] register.onWithdraw', e); } }
      else await this.ui.narrate(`{dim}Far above, through the stone:{/dim} {p} ${res.voice.text}`);
    }
    await this._say(res.say);
  }

  _wait(sec) { return new Promise((r) => this.after(sec, r)); }

  /** Pencil (or ink) dust rising from a withdrawn name. */
  _lift(row) {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i < 0) return;
    const y = this._rowY(i);
    const f = row.ink === 'ink' ? inkFont() : pencilFont();
    const w = f.width(row.name);
    const r = rng(hashStr(row.id) + this.dust.length);
    const col = row.ink === 'ink' ? ['#141318', '#2a2830', '#3a3840'] : ['#5f5e66', '#7a7880', '#8f8e96'];
    for (let k = 0; k < 90; k++) {
      this.dust.push({ x: PAGE.x + COL.name + r() * w, y: y + 4 + r() * 22, vx: (r() - 0.5) * 14, vy: -12 - r() * 34, life: 1.2 + r() * 1.3, t: 0, c: col[k % 3] });
    }
    svc.sfx('husk_rustle', { vol: 0.25 });
  }

  _startOver() {
    const before = this.rows.filter((r) => r.status === 'withdrawn' || (r.founder && r.status === 'expelled'));
    const res = this.model.startOver?.() || { say: [] };
    this._refresh();
    for (const r of before) this.ghosts.push({ row: r, t: 0 });
    this.anims.length = 0;
    if (before.length) { svc.sfx('paper_rustle'); svc.sfx('page_turn', { vol: 0.5 }); }
    this.busy = true;
    this._say(res.say).then(() => { this.busy = false; });
  }

  async _close() {
    this.busy = true;
    let yes;
    const sum = this.model.closeSummary?.();
    if (sum) yes = (await this.ui.choice(sum.options || ['Close it.', 'Not yet.'], { prompt: sum.prompt, expr: 'exhausted', light: 'red' })) === 0;
    else yes = await this.open('confirm', { text: 'Close the book? Whatever is written stays written.', yes: 'Close it', no: 'Not yet', danger: true });
    this.busy = false;
    if (yes) { svc.sfx('book_close'); this.close(null); }
  }

  // ---- expulsion: grounds → hold to write → the hand → EXPELLED ------------------------------------------------
  _startWrite(res, row) {
    const w = res.write || { seconds: 6, text: 'HALLOWELL, CYRUS — EXPELLED.', letters: 'HALLOWELL' };
    this.mode = 'write';
    this.busy = true;
    this.write = { p: 0, text: w.text, handT: -1, handOut: -1, lineT: -1, done: false, grounds: res.grounds };
    svc.sfx('pen_scratch', { vol: 0.5 });
    this.open('write', {
      label: 'Keep writing', seconds: w.seconds || 6, letters: w.letters || 'HALLOWELL',
      onProgress: (p) => this._writeProgress(p),
    }).then((r) => this._endWrite(r, row));
  }

  _writeProgress(p) {
    const W8 = this.write;
    if (!W8) return;
    W8.p = p;
    if (p >= HAND_AT && W8.handT < 0) {
      W8.handT = 0;
      svc.sfx('colonel_breath', { vol: 0.6 });
      svc.sfx('desk_creak', { vol: 0.5 });
    }
  }

  async _endWrite(result, row) {
    const W8 = this.write;
    if (result !== 'done') {
      // put down the pen: the half-written line stays provisional and fades; the hand withdraws
      if (W8) { W8.handOut = 0; W8.cancelled = true; }
      svc.sfx('colonel_breath', { vol: 0.3 });
      await this._wait(0.7);
      this.write = null;
      this.busy = false; this.mode = 'tray';
      return;
    }
    let res = null;
    try { res = await this.model.apply?.('pen', 'founder', { grounds: W8?.grounds, written: true }); } catch (e) { console.error('[ui] register.apply(expel)', e); }
    this._refresh();
    if (W8) { W8.done = true; W8.handOut = 0; }
    this.anims.push({ kind: 'expel', id: 'founder', t: 0 });
    svc.sfx('stamp', { rate: 0.7 });
    this.shake = 0.35;
    await this._wait(1.8);
    this.write = null;
    await this._say(res?.say);
    this.busy = false; this.mode = 'tray';
  }

  // ---- input -----------------------------------------------------------------------------------------------------
  update(dt, input) {
    this.shake = Math.max(0, this.shake - dt);
    for (const a of this.anims) {
      const before = a.t;
      a.t += dt;
      if (a.kind === 'stamp' && before < 0.32 && a.t >= 0.32) { svc.sfx('stamp'); this.shake = 0.2; }
    }
    prune(this.anims, KEEP_ANIM);
    for (const g of this.ghosts) g.t += dt;
    prune(this.ghosts, KEEP_GHOST);
    for (const d of this.dust) { d.t += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy -= 6 * dt; }
    prune(this.dust, KEEP_DUST);
    const W8 = this.write;
    if (W8) {
      if (W8.handT >= 0) W8.handT += dt;
      if (W8.handOut >= 0) W8.handOut += dt;
      if (W8.handT > 0.7 && W8.lineT < 0 && !W8.done && !W8.cancelled) { W8.lineT = 0; svc.murmur(2.6); }
      if (W8.lineT >= 0) W8.lineT += dt;
    }
    if (!input || this.busy) return;
    const tray = this.tray;
    if (this.mode === 'tray') {
      if (input.repeat('left')) { this.toolSel = (this.toolSel + tray.length - 1) % tray.length; svc.sfx('ui_move'); }
      if (input.repeat('right')) { this.toolSel = (this.toolSel + 1) % tray.length; svc.sfx('ui_move'); }
      if (input.pressed('confirm')) {
        const t = tray[this.toolSel];
        if (t.id === 'close') { svc.sfx('ui_confirm'); this._close(); return; }
        if (t.id === 'reset') { if (t.available) { svc.sfx('ui_confirm'); this._startOver(); } else svc.sfx('ui_cancel', { vol: 0.5 }); return; }
        if (!t.available) {
          svc.sfx('door_locked', { vol: 0.4 });
          this.busy = true;
          this.ui.think('neutral', t.unavailableText || "I don't have that anymore.", { light: 'red' }).then(() => { this.busy = false; });
          return;
        }
        svc.sfx('ui_confirm');
        this.mode = 'line';
        const rows = this.rows;
        if (t.id === 'pen') this.lineSel = 0;
        else {
          const k = rows.findIndex((r) => !r.founder && r.status !== 'withdrawn');
          this.lineSel = k < 0 ? 1 : k;
        }
      }
    } else if (this.mode === 'line') {
      const n = this.rows.length;
      if (input.repeat('up')) { this.lineSel = (this.lineSel + n - 1) % n; svc.sfx('ui_move'); }
      if (input.repeat('down')) { this.lineSel = (this.lineSel + 1) % n; svc.sfx('ui_move'); }
      if (input.pressed('confirm')) { svc.sfx('ui_confirm'); this._apply(tray[this.toolSel], this.rows[this.lineSel]); }
      else if (input.pressed('cancel')) { this.mode = 'tray'; svc.sfx('ui_cancel'); }
    } else if (this.mode === 'grounds') {
      const G = this._grounds();
      if (input.repeat('up')) { this.groundSel = (this.groundSel + G.length - 1) % G.length; svc.sfx('ui_move'); }
      if (input.repeat('down')) { this.groundSel = (this.groundSel + 1) % G.length; svc.sfx('ui_move'); }
      if (input.pressed('confirm')) { svc.sfx('pen_scratch', { vol: 0.5 }); this._apply({ id: 'pen' }, this.rows[0], { grounds: G[this.groundSel].id }); }
      else if (input.pressed('cancel')) { this.mode = 'tray'; svc.sfx('ui_cancel'); }
    }
  }

  _grounds() {
    return this.model.grounds || [
      { id: 'R1', rule: 'No student may be in the halls when the bell rings.' },
      { id: 'R2', rule: 'Students will be seated and quiet during class.' },
      { id: 'R3', rule: 'No running in the halls.' },
      { id: 'R4', rule: 'Hall passes are required.' },
      { id: 'R5', rule: 'Attendance is mandatory.' },
      { id: 'R6', rule: 'No student may leave before dismissal.' },
    ];
  }

  // ---- rendering ---------------------------------------------------------------------------------------------
  render(ctx) {
    const k = ease.out(clamp(this.t / 0.5));
    const sx = this.shake > 0 ? ((hash2(Math.floor(this.t * 50), 2) % 3) - 1) * AP : 0;
    // the breaker's red seams light everything from below
    dither(ctx, 0, H - 200, W, 200, 'rgba(150,30,10,1)', 0.12);
    dither(ctx, 0, H - 120, W, 120, 'rgba(180,40,12,1)', 0.12);
    ctx.save(); ctx.translate(sx, snap((1 - k) * 30));
    this._book(ctx);
    const rows = this.rows;
    rows.forEach((r, i) => this._row(ctx, r, i));
    for (const g of this.ghosts) this._ghost(ctx, g);
    for (const a of this.anims) this._anim(ctx, a);
    this._dust(ctx);
    if (this.write) this._writing(ctx);
    if (this.mode === 'line' && !this.busy) this._lineCursor(ctx);
    ctx.restore();
    if (this.mode === 'grounds') this._groundsCard(ctx);
    if (this.write) this._hand(ctx);
    if (this.mode !== 'write') this._tray(ctx);
    if (!this.busy && this.mode !== 'write') {
      const h = this.mode === 'line' || this.mode === 'grounds'
        ? [['BACK', this.ui.input.keyLabel('cancel')], ['USE', this.ui.input.keyLabel('confirm')], [this.mode === 'grounds' ? 'RULE' : 'LINE', '↑ ↓']]
        : [['PICK UP', this.ui.input.keyLabel('confirm')], ['TOOL', '← →']];
      hints(ctx, h, H - 22);
    }
  }

  _book(ctx) {
    const { x, y, w, h } = PAGE;
    // leather boards peeking out around the page, and the stack of pages beneath
    rect(ctx, x - 14, y - 10, w + 28, h + 22, '#2a0f0c');
    rect(ctx, x - 12, y - 8, w + 24, h + 18, '#4a1c14');
    dither(ctx, x - 12, y - 8, w + 24, h + 18, 'rgba(20,6,4,1)', 0.35);
    for (const [cx, cy] of [[x - 12, y - 8], [x + w + 2, y - 8], [x - 12, y + h], [x + w + 2, y + h]]) { rect(ctx, cx, cy, 10, 10, '#8a6a2a'); rect(ctx, cx + 2, cy + 2, 6, 6, '#b8923e'); }
    for (let i = 3; i >= 1; i--) rect(ctx, x + i * 2, y + h + i * 2 - 2, w - i * 2, 2, i % 2 ? '#a89470' : '#c8b48a');
    dither(ctx, x + 10, y + 10, w, h, 'rgba(0,0,0,1)', 0.6);
    ctx.drawImage(ledgerPage(this.model.title), x, y);
    const flick = 0.06 + 0.04 * Math.sin(this.t * 5.3) + 0.03 * Math.sin(this.t * 13.1);
    ctx.fillStyle = `rgba(120,24,6,${flick.toFixed(3)})`;
    ctx.fillRect(x, y + h * 0.45, w, h * 0.55);
  }

  _row(ctx, r, i) {
    const x = PAGE.x, ry = this._rowY(i);
    const anim = this.anims.find((a) => a.id === r.id);
    if (r.founder) {
      const name = r.name || 'HALLOWELL, CYRUS — FIRST PUPIL';
      const fit = founderFont(name);
      F.typedS.draw(ctx, '1.', x + COL.no - 30, ry + 8, '#6a5a40');
      fit.draw(ctx, name, x + COL.name, ry - 6, '#8e1622');
      const expelled = r.status === 'expelled';
      if (expelled && !anim) this._expelMark(ctx, x, ry, 1, fit.width(name));
      // the written expulsion (full once expelled; while writing it is drawn by _writing)
      if (expelled && !this.write) redFont().draw(ctx, this._expelText(r), x + COL.name, ry + 38, RED);
      return;
    }
    F.typedS.draw(ctx, `${i + 1}.`, x + COL.no - 30, ry + 6, '#6a5a40');
    const withdrawn = r.status === 'withdrawn';
    const lifting = anim && withdrawn;
    // a withdrawn name has lifted off the page: only a faint impression remains
    const alpha = withdrawn ? (lifting ? 1 - clamp((anim.t - 0.35) / 0.45) * 0.82 : 0.18) : 1;
    const pencil = r.ink !== 'ink';
    const f = pencil ? pencilFont() : inkFont();
    const col = pencil ? '#5f5e66' : '#141318';
    const yy = pencil ? ry - 4 : ry - 8;
    if (pencil) f.draw(ctx, r.name, x + COL.name + 2, yy + 2, 'rgba(95,94,102,0.28)', { alpha }); // graphite smudge
    f.draw(ctx, r.name, x + COL.name, yy, col, { alpha });
    f.draw(ctx, '10-18-96', x + COL.enrolled + 12, yy, col, { alpha: withdrawn ? Math.max(alpha, 0.45) : 1 });
    if (!withdrawn) {
      // the ink tells: pencil is soft and shiny, ink sits in the paper
      F.small.draw(ctx, pencil ? 'pencil' : 'ink', x + COL.remarks + 14, ry + 10, pencil ? '#8a8890' : '#4a4038', { alpha: 0.75 });
      return;
    }
    if (anim) return;
    if (r.by === 'form') this._slip(ctx, r, x + COL.enrolled - 6, ry - 12, 1);
    else {
      this._stamp(ctx, x + COL.remarks + 98, ry + 10, 1, r.id);
      // the forwarding address: Tess pencils what she laid on the line, after the lifted name
      if (r.keepsake) keepFont().draw(ctx, `fwd: ${r.keepsake}`, x + COL.name + f.width(r.name) + 26, ry, '#4f4e55');
    }
  }

  _expelText(r) {
    const g = this._grounds().find((x) => x.id === r.grounds);
    return this.write?.text || (g?.phrase ? `HALLOWELL, CYRUS — EXPELLED — ${g.phrase}. Reported by T. Dolan.` : 'HALLOWELL, CYRUS — EXPELLED. Reported by T. Dolan.');
  }

  _stamp(ctx, cx, cy, k, id) {
    const st = stampCanvas('WITHDRAWN', STAMP_INK);
    const s = 1 + (1 - ease.out(k)) * 0.9;
    const w = st.width * 2 * s * 0.62, h = st.height * 2 * s * 0.62;
    ctx.save();
    ctx.globalAlpha *= 0.4 + 0.6 * k;
    ctx.translate(cx, cy);
    ctx.rotate(-0.06 + ((hashStr(String(id)) % 7) - 3) * 0.012);
    ctx.drawImage(st, Math.round(-w / 2), Math.round(-h / 2), Math.round(w), Math.round(h));
    ctx.restore();
  }

  _slip(ctx, r, x, y, k) {
    // Mom's transfer form, folded into a slip and clipped over the line; Tess wrote the reason
    const a = ease.out(k);
    const yy = snap(y - (1 - a) * 30);
    const w = 336, h = 50;
    ctx.save(); ctx.globalAlpha *= a;
    dither(ctx, x + 4, yy + 4, w, h, 'rgba(0,0,0,1)', 0.5);
    ctx.drawImage(paperSheet(w, h, { seed: 'slip' + r.id, tone: '#e6e2d4', hi: '#f0ede2', stains: 0 }), x, yy);
    rect(ctx, x, yy, AP * 3, h, '#9db0c8');
    F.typedS.draw(ctx, 'PA WITHDRAWAL / TRANSFER — M. DOLAN', x + 14, yy + 2, '#3a3a44');
    const hf = font({ family: FONT.hand, size: 22, lineHeight: 24, threshold: 0.45 });
    hf.draw(ctx, r.reason || 'Reason:', x + 14, yy + 22, '#2e3a6a');
    rect(ctx, x + w - 34, yy - 6, 8, 30, '#9a999e'); rect(ctx, x + w - 32, yy - 4, 4, 26, '#d6d5da');
    ctx.restore();
  }

  _expelMark(ctx, x, ry, k, nameW) {
    // red pen: the founder struck through, then EXPELLED scrawled in the remarks
    const strike = clamp(k / 0.4);
    const r = rng(17);
    for (let i = 0; i < nameW * strike; i += AP) rect(ctx, x + COL.name + i, ry + 12 + Math.round(Math.sin(i * 0.05) * 2 + (r() - 0.5) * 1.5), AP, AP * 2, RED_HI);
    const wk = clamp((k - 0.4) / 0.6);
    if (wk <= 0) return;
    const f = expelFont();
    const text = 'EXPELLED';
    const tw = f.width(text);
    ctx.save();
    ctx.beginPath(); ctx.rect(x + COL.remarks - 4, ry - 24, 24 + tw * wk, 80); ctx.clip();
    f.draw(ctx, text, x + COL.remarks + AP, ry - 16 + AP, '#4a0a10');
    f.draw(ctx, text, x + COL.remarks, ry - 16, RED_HI);
    ctx.restore();
    if (wk >= 1) for (let i = 0; i < tw; i += AP) rect(ctx, x + COL.remarks + i, ry + 26 + Math.round(Math.sin(i * 0.09) * 2), AP, AP, RED_HI);
  }

  _anim(ctx, a) {
    const i = this.rows.findIndex((r) => r.id === a.id);
    if (i < 0) return;
    const x = PAGE.x, ry = this._rowY(i), r = this.rows[i];
    if (a.kind === 'stamp') {
      // the stamp comes down from above and lands at 0.32 s
      const k = clamp(a.t / 0.32);
      this._stamp(ctx, x + COL.remarks + 98, ry + 10 - (1 - k) * 40, k, a.id);
    } else if (a.kind === 'slip') this._slip(ctx, r, x + COL.enrolled - 6, ry - 12, clamp(a.t / 0.5));
    else {
      const name = r.name || 'HALLOWELL, CYRUS — FIRST PUPIL';
      this._expelMark(ctx, x, ry, clamp(a.t / 1.6), founderFont(name).width(name));
      redFont().draw(ctx, this._expelText(r), x + COL.name, ry + 38, RED);
    }
  }

  _ghost(ctx, g) {
    // Start over: the marks blow away like eraser crumbs
    const i = this.rows.findIndex((r) => r.id === g.row.id);
    if (i < 0) return;
    const a = 1 - clamp(g.t / 0.7);
    ctx.save(); ctx.globalAlpha *= a;
    ctx.translate(0, -snap(g.t * 12));
    const ry = this._rowY(i);
    if (g.row.founder) redFont().draw(ctx, 'EXPELLED', PAGE.x + COL.remarks, ry, RED);
    else if (g.row.by === 'form') this._slip(ctx, g.row, PAGE.x + COL.enrolled - 6, ry - 12, 1);
    else this._stamp(ctx, PAGE.x + COL.remarks + 98, ry + 10, 1, g.row.id);
    ctx.restore();
  }

  _dust(ctx) {
    for (const d of this.dust) {
      const a = 1 - d.t / d.life;
      if (a <= 0) continue;
      ctx.globalAlpha = a * 0.9;
      rect(ctx, snap(d.x), snap(d.y), AP, AP, d.c);
    }
    ctx.globalAlpha = 1;
  }

  _lineCursor(ctx) {
    const x = PAGE.x, w = PAGE.w;
    const i = this.lineSel;
    const ry = this._rowY(i);
    const hh = i === 0 ? FOUNDER_H - 30 : ROW_H - 4;
    rect(ctx, x + 8, ry - 8, w - 16, hh, 'rgba(178,38,44,0.08)');
    triangle(ctx, x + 20 + (Math.floor(this.t * 3) % 2 ? AP : 0), ry + 8, 6, C.stampRed, 'right');
    const tool = this.tray[this.toolSel];
    const bob = Math.floor(this.t * 2) % 2 ? 0 : -AP;
    drawTool(ctx, tool.id, x + w - 72, ry - 18 + bob, 2);
  }

  /** While the expulsion is being written: the red line grows under the founder; the pen rides its end. */
  _writing(ctx) {
    const W8 = this.write;
    const x = PAGE.x + COL.name, y = this._rowY(0) + 38;
    const f = redFont();
    const tw = f.width(W8.text);
    const fade = W8.cancelled ? 1 - clamp(W8.handOut / 0.6) : 1;
    const p = W8.done ? 1 : W8.p;
    ctx.save();
    ctx.globalAlpha *= fade;
    ctx.beginPath(); ctx.rect(x - 4, y - 8, tw * p + 6, 40); ctx.clip();
    f.draw(ctx, W8.text, x, y, RED);
    ctx.restore();
    if (!W8.done && !W8.cancelled) {
      const jit = (hash2(Math.floor(this.t * 20), 5) % 3) - 1;
      drawTool(ctx, 'pen', x + tw * p - 10, y - 30 + jit * AP, 2);
    }
  }

  /** The ringed hand on the desk beside the book (CG colonel_hand, red light) and his line. */
  _hand(ctx) {
    const W8 = this.write;
    if (!W8 || W8.handT < 0) return;
    const inK = ease.out(clamp(W8.handT / 0.6));
    const outK = W8.handOut >= 0 ? ease.inOut(clamp(W8.handOut / 0.9)) : 0;
    const k = inK * (1 - outK);
    if (k <= 0) return;
    // the hand comes in from the left, over the names already cleared, leaving the line being written free
    const pw = 336, ph = 252;
    const px = snap(16 - pw * (1 - k)), py = 180 + snap(outK * 16);
    ctx.save();
    ctx.globalAlpha *= clamp(k * 1.4);
    dither(ctx, px + 8, py + 8, pw, ph, 'rgba(0,0,0,1)', 0.6);
    ctx.drawImage(handPanel(this.t, W8.done ? 1 : 0), px, py, pw, ph);
    frame(ctx, px - AP, py - AP, pw + AP * 2, ph + AP * 2, '#1a0406');
    frame(ctx, px, py, pw, ph, '#5a0c12');
    ctx.restore();
    // his line: the bust (this is one of its three beats) and slow text, beside the hand
    if (W8.lineT < 0 || W8.done || W8.cancelled) return;
    const la = clamp(W8.lineT / 0.4);
    const bx = 368, by = 360, bw = 576, bh = 76;
    ctx.save(); ctx.globalAlpha *= la;
    steelPanel(ctx, bx, by, bw, bh, { fill: 'rgba(12,6,8,0.94)', hi: '#4a2229', mid: '#331a1e', cornerColor: '#7a1a24', seed: 3 });
    const bust = svc.portrait('colonel', 'speaking', { light: 'red' });
    if (bust) {
      ctx.save(); ctx.beginPath(); ctx.rect(bx + AP * 2, by + AP * 2, 84, bh - AP * 4); ctx.clip();
      ctx.drawImage(bust, 24, 38, 48, 48, bx + AP * 2, by - 8, 96, 96);
      ctx.restore();
      rect(ctx, bx + 88, by + AP * 2, AP, bh - AP * 4, '#4a2229');
    }
    const name = svc.speakerName('colonel').toUpperCase().split('').join(' ');
    plate(ctx, bx + 104, by - 14, snap(F.small.width(name) + 24), 24, '#3d0910', '#9b1b2b');
    F.small.draw(ctx, name, bx + 116, by - 12, '#e9c9c0');
    typeLine(ctx, COLONEL_LINE, W8.lineT, bx + 108, by + 24, bw - 124);
    ctx.restore();
  }

  _groundsCard(ctx) {
    // the school's own rules, printed on a card from the principal's office: the grounds for expulsion
    const G = this._grounds();
    const w = 660, h = 74 + G.length * 40 + 20;
    const x = snap(W / 2 - w / 2), y = 48;
    dither(ctx, x + 10, y + 10, w, h, 'rgba(0,0,0,1)', 0.6);
    ctx.drawImage(paperSheet(w, h, { seed: 'rulescard', tone: '#e2dbc4', hi: '#ece6d2', lo: '#c8bfa4', stains: 1 }), x, y);
    rect(ctx, x, y + 50, w, AP, '#b3262c');
    F.typedS.draw(ctx, 'HALLOWELL CONSOLIDATED SCHOOL — RULES OF CONDUCT', x + w / 2, y + 12, '#2a2a30', { align: 'center' });
    G.forEach((g, i) => {
      const ry = y + 66 + i * 40;
      const on = i === this.groundSel;
      if (on) { rect(ctx, x + 12, ry - 4, w - 24, 34, 'rgba(178,38,44,0.10)'); triangle(ctx, x + 18 + (Math.floor(this.t * 3) % 2 ? AP : 0), ry + 6, 6, C.stampRed, 'right'); }
      F.typed.draw(ctx, `${g.id.replace('R', '')}.`, x + 44, ry, '#3a3a40');
      F.typed.draw(ctx, g.rule, x + 74, ry, on ? '#141318' : '#3a3a40');
    });
    // Tess's question, pencilled on a scrap clipped to the card
    const q = 'On what grounds?';
    const hf = handFont('tess');
    const qw = hf.font.width(q) + 40;
    ctx.drawImage(paperSheet(snap(qw), 40, { seed: 'groundsq', tone: '#e2dbc6', stains: 0, torn: 'bottom' }), x + w - qw + 24, y + h - 18);
    hf.font.draw(ctx, q, x + w - qw + 44, y + h - 14, hf.color);
  }

  _tray(ctx) {
    const tray = this.tray;
    // the desk edge: dark tarred wood
    rect(ctx, 0, TRAY_Y - 6, W, 100, '#1a120c');
    rect(ctx, 0, TRAY_Y - 6, W, AP, '#3a2818');
    for (let i = 0; i < W; i += 46) rect(ctx, i, TRAY_Y + 30 + ((i / 46) % 3) * 8, 30, AP, '#22170f');
    const cw = 176, x0 = snap(W / 2 - (cw * tray.length) / 2);
    tray.forEach((t, i) => {
      const cx = x0 + i * cw + cw / 2;
      const on = i === this.toolSel;
      const avail = t.available !== false;
      const lift = on && this.mode === 'tray' ? -AP * 2 : 0;
      ctx.save();
      if (!avail) ctx.globalAlpha *= 0.35;
      drawTool(ctx, t.id, cx - 24, TRAY_Y - 4 + lift, 2);
      ctx.restore();
      F.small.draw(ctx, t.label || t.id, cx, TRAY_Y + 44, on ? C.textHi : avail ? C.textDim : '#4a4850', { align: 'center' });
      if (on) frame(ctx, x0 + i * cw + 8, TRAY_Y - 4, cw - 16, 70, this.mode === 'tray' ? C.red : 'rgba(208,69,60,0.4)');
    });
    // Tess's note: the tool's caption in the tray, her prediction once a line is picked
    if (this.busy) return;
    const plain = this._note();
    if (!plain) return;
    const hf = handFont('tess');
    const tw = Math.min(820, hf.font.width(plain) + 44);
    const px = snap(W / 2 - tw / 2), py = PAGE.y + PAGE.h - 36;
    ctx.drawImage(paperSheet(snap(tw), 36, { seed: 'regnote', tone: '#e2dbc6', stains: 0, torn: 'bottom' }), px, py);
    hf.font.draw(ctx, plain, px + 22, py + 2, hf.color);
  }
}

// ---- helpers -------------------------------------------------------------------------------------------------

const KEEP_ANIM = (a) => a.t <= (a.kind === 'expel' ? 1.6 : 0.8);
const KEEP_GHOST = (g) => g.t < 0.7;
const KEEP_DUST = (d) => d.t < d.life;
/** Remove the items failing `keep`, in place (no per-frame garbage). */
function prune(arr, keep) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) if (keep(arr[i])) arr[j++] = arr[i];
  arr.length = j;
}

/** Type a short markup line ({p} pauses) at the Colonel's slow pace; red-black text. */
const lineParts = new Map();
function typeLine(ctx, text, t, x, y, maxW) {
  const f = F.body;
  let parts = lineParts.get(text);
  if (!parts) { parts = String(text).split(/\{p(?:=([\d.]+))?\}/); lineParts.set(text, parts); }
  let clock = 0.2, cx = x, cy = y;
  const cps = 11;
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) { clock += parts[i] ? parseFloat(parts[i]) : 0.6; continue; }
    const seg = parts[i];
    for (const ch of seg) {
      if (clock > t) return;
      const a = clamp((t - clock) / 0.3);
      if (cx + f.adv(ch) > x + maxW && ch === ' ') { cx = x; cy += 34; clock += 1 / cps; continue; }
      f.glyph(ctx, ch, cx, cy, '#e9dccb', a);
      cx += f.adv(ch);
      clock += 1 / cps;
    }
  }
}

let handCanvas = null, handCanvasKey = '', handFull = null;
const HAND_CROP = { x: 0, y: 14, w: 300, h: 225 };
/** The Ch2 hand, cropped to the hand and rings, re-lit red from below (the breaker), at 400×300 UI. */
function handPanel(t, slack) {
  const key = `${Math.floor(t * 8)}|${slack}`;
  if (handCanvas && handCanvasKey === key) return handCanvas;
  const full = handFull || (handFull = canvas(480, 270));
  const fx = ctx2d(full);
  fx.fillStyle = '#05060a'; fx.fillRect(0, 0, 480, 270);
  try { svc.cgArt('colonel_hand')?.draw?.(fx, slack ? 0 : t, {}); } catch (e) { svc.warnOnce('register.hand', e); }
  const c = handCanvas || canvas(HAND_CROP.w, HAND_CROP.h);
  const x = ctx2d(c);
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  x.drawImage(full, HAND_CROP.x, HAND_CROP.y, HAND_CROP.w, HAND_CROP.h, 0, 0, HAND_CROP.w, HAND_CROP.h);
  // red light from below: multiply a red ramp, then lift the highlights a touch
  const g = x.createLinearGradient(0, HAND_CROP.h, 0, 0);
  g.addColorStop(0, '#ff8a64'); g.addColorStop(0.55, '#d8483a'); g.addColorStop(1, '#5a1610');
  x.globalCompositeOperation = 'multiply'; x.fillStyle = g; x.fillRect(0, 0, HAND_CROP.w, HAND_CROP.h);
  x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.08; x.fillStyle = '#ff6040'; x.fillRect(0, HAND_CROP.h * 0.6, HAND_CROP.w, HAND_CROP.h * 0.4);
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  if (slack) { x.globalAlpha = 0.35; x.fillStyle = '#000'; x.fillRect(0, 0, HAND_CROP.w, HAND_CROP.h); x.globalAlpha = 1; }
  handCanvas = c; handCanvasKey = key;
  return c;
}

// The desk tools, drawn as small pixel illustrations (art px = 2 UI px × s/2). 24×24 art px each.
function drawTool(ctx, id, x, y, s = 2) {
  const P = (px, py, w, h, c) => rect(ctx, x + px * s, y + py * s, w * s, h * s, c);
  if (id === 'stamp') {
    // ink pad (behind), then the rubber stamp: turned knob, neck, block, steel ferrule, inked rubber
    P(13, 17, 11, 6, '#26262c'); P(13, 17, 11, 1, '#5a5a64'); P(14, 18, 9, 3, '#4a1a5a'); P(14, 18, 9, 1, '#6a2a7a');
    const knob = [[4, 6], [3, 8], [2, 10], [2, 10], [2, 10], [3, 8], [4, 6]];
    knob.forEach(([o, w], j) => { P(o, j, w, 1, '#9a6232'); P(o, j, 1, 1, '#c08850'); P(o + w - 2, j, 2, 1, '#6a3e1c'); });
    P(4, 1, 3, 2, '#e0b080');
    P(5, 7, 4, 6, '#7a4a24'); P(5, 7, 1, 6, '#a06838');
    P(0, 13, 14, 4, '#8a5a2c'); P(0, 13, 14, 1, '#b07a40'); P(0, 16, 14, 1, '#5a3618');
    P(0, 17, 14, 1, '#b8b8c0'); P(0, 18, 14, 1, '#6a6a72');
    P(1, 19, 12, 2, '#2a1a2a'); P(1, 21, 12, 1, '#7a2a8a');
  } else if (id === 'form') {
    P(3, 1, 18, 22, '#a8a090'); P(2, 0, 18, 22, '#e6e0cc');
    P(17, 0, 3, 3, '#c8c0aa'); P(17, 2, 1, 1, '#a8a090');
    P(4, 2, 10, 2, '#5a5a66');
    for (let j = 0; j < 6; j++) P(4, 6 + j * 2, j % 3 === 2 ? 9 : 13, 1, '#8a8a94');
    P(4, 18, 2, 1, '#2a3a8a'); P(6, 17, 2, 1, '#2a3a8a'); P(8, 18, 3, 1, '#2a3a8a'); P(11, 17, 2, 1, '#2a3a8a'); P(13, 18, 3, 1, '#2a3a8a');
    P(4, 20, 12, 1, '#6a6a74');
  } else if (id === 'pen') {
    // Miss Adair's red Flair, lying on the diagonal
    for (let i = 0; i < 20; i++) {
      const px = 2 + i, py = 21 - i;
      const cap = i >= 13;
      P(px, py - 1, 2, 1, cap ? '#e04048' : '#ff6a6a');
      P(px, py, 2, 2, cap ? '#a01822' : '#c8202c');
      P(px + 1, py + 1, 1, 1, '#701018');
    }
    for (let i = 14; i < 19; i++) P(3 + i, 19 - i, 1, 1, '#f0f0f0');
    P(1, 22, 2, 1, '#202020'); P(0, 23, 1, 1, '#c0202c');
  } else if (id === 'reset') {
    // a pink eraser, worn at one end, with crumbs
    P(3, 9, 18, 8, '#c27080'); P(3, 9, 18, 6, '#e8a0a8'); P(3, 9, 18, 1, '#f4c4c8'); P(3, 9, 3, 6, '#d48894');
    P(8, 11, 9, 2, '#c27080');
    P(1, 18, 1, 1, '#e8a0a8'); P(4, 19, 1, 1, '#d48894'); P(22, 18, 1, 1, '#e8a0a8');
  } else if (id === 'close') {
    // the Register itself, shut: oxblood leather, gilt rules
    P(2, 4, 20, 16, '#2a0f0c'); P(2, 3, 20, 16, '#5a1c16'); P(2, 3, 20, 1, '#7a2a20');
    P(4, 5, 16, 1, '#b8923e'); P(4, 16, 16, 1, '#b8923e'); P(6, 9, 12, 3, '#3a120e'); P(7, 10, 10, 1, '#8a6a2a');
    P(2, 19, 20, 1, '#d8c9a0');
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
  ghost.forEach((g, i) => bf.draw(x, g, 170, ROW0 + 30 + i * ROW_H, '#2a1a10'));
  x.restore();
  // header
  F.typed.draw(x, title || 'REGISTER OF PUPILS', w / 2, 8, '#2a2420', { align: 'center' });
  F.typedS.draw(x, 'ROLL OF 10-19-96', w - 30, 12, '#5a4a36', { align: 'right' });
  F.typedS.draw(x, 'p. 1996', 30, 12, '#5a4a36');
  const heads = [['NO.', COL.no - 34], ['NAME OF PUPIL', COL.name], ['ENROLLED', COL.enrolled + 12], ['STATUS · REMARKS', COL.remarks + 12]];
  for (const [t, cx] of heads) F.small.draw(x, t, cx, 46, '#5a4a36');
  // rules: under the founder's block, then one per line
  for (let ry = ROW0 + FOUNDER_H - 12; ry < h - 6; ry += ROW_H) rect(x, 8, ry, w - 16, AP / 2 + 1, '#8fa0b4');
  rect(x, 8, ROW0 + 32, w - 16, AP / 2 + 1, 'rgba(143,160,180,0.5)');
  rect(x, 8, 70, w - 16, AP, '#b3262c'); rect(x, 8, 74, w - 16, AP / 2 + 1, '#b3262c');
  for (const cx of [COL.no + 10, COL.enrolled, COL.remarks]) { rect(x, cx, 40, AP / 2 + 1, h - 46, '#c0606a'); rect(x, cx + 4, 40, AP / 2 + 1, h - 46, '#c0606a'); }
  // binding gutter shadow on the left
  for (let i = 0; i < 6; i++) rect(x, i * 2, 0, AP, h, `rgba(40,25,10,${0.3 - i * 0.05})`);
  pageCache = c; pageTitle = title;
  return c;
}
