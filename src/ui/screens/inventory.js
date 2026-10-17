// Inventory: the inside of Tess's olive canvas bag. Grid of items (HW.art.icon), a paper card
// with the selected item's name and her description, and Use / Examine actions.
import { HW } from '../../engine/hw.js';
import { Screen } from '../screen.js';
import { C, F, handFont } from '../theme.js';
import { rect, frame, dither, paperSheet, triangle, AP, clamp, ease, snap } from '../gfx.js';
import { headerTab, hints, bagCanvas, spaced } from '../widgets.js';
import { closeMenus } from './pause.js';
import * as svc from '../services.js';

const COLS = 5, ROWS = 4, SLOT = 72, GAP = 8;
const GX = 76, GY = 104;

export class InventoryScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.pausesGame = true; this.singleton = true;
    this.dimWorld = 0.66;
    this.sel = 0; this.menu = null; this.busy = false;
  }
  onOpen() { svc.sfx('ui_open'); svc.sfx('paper_rustle', { vol: 0.4 }); }
  get list() {
    const inv = svc.state().inv || {};
    const cat = svc.items();
    const ids = Object.keys(cat).filter((id) => (inv[id] | 0) > 0);
    for (const id of Object.keys(inv)) if ((inv[id] | 0) > 0 && !cat[id]) ids.push(id); // unknown ids still show
    return ids.map((id) => ({ id, n: inv[id] | 0, def: cat[id] || { name: id } }));
  }
  _actions(it) {
    const d = it.def;
    const acts = [];
    acts.push({ id: 'use', label: 'Use', disabled: !d.use });
    if (d.examine) acts.push({ id: 'examine', label: 'Examine' });
    acts.push({ id: 'back', label: 'Back' });
    return acts;
  }
  async _act(it, a) {
    if (a.disabled) { svc.sfx('door_locked', { vol: 0.4 }); return; }
    svc.sfx(a.id === 'back' ? 'ui_cancel' : 'ui_confirm');
    this.menu = null;
    if (a.id === 'back') return;
    const d = it.def;
    if (a.id === 'examine') {
      const ex = String(d.examine);
      if (ex.startsWith('doc:')) { this.busy = true; await this.open('doc', { id: ex.slice(4) }); this.busy = false; return; }
      closeMenus(this.ui);
      setTimeout(() => {
        try { if (HW.game?.examineItem) HW.game.examineItem(it.id); else HW.scripts?.run?.(ex); }
        catch (e) { console.error('[ui] examine script', ex, e); }
      }, 0);
      return;
    }
    // use
    if (d.use === 'engine:open_sketchbook') { this.busy = true; await this.open('sketchbook'); this.busy = false; return; }
    closeMenus(this.ui);
    setTimeout(() => {
      try {
        if (HW.game?.useItem) HW.game.useItem(it.id);
        else if (typeof d.use === 'string' && !d.use.startsWith('engine:')) HW.scripts?.run?.(d.use);
        else this.ui.toast('Nothing happens.');
      } catch (e) { console.error('[ui] useItem', it.id, e); }
    }, 0);
  }
  update(dt, input) {
    if (!input || this.busy) return;
    const list = this.list;
    if (this.sel >= list.length) this.sel = Math.max(0, list.length - 1);
    if (this.menu) {
      const acts = this.menu.acts;
      if (input.repeat('left') || input.repeat('up')) { this.menu.sel = (this.menu.sel + acts.length - 1) % acts.length; svc.sfx('ui_move'); }
      if (input.repeat('right') || input.repeat('down')) { this.menu.sel = (this.menu.sel + 1) % acts.length; svc.sfx('ui_move'); }
      if (input.pressed('confirm')) this._act(list[this.sel], acts[this.menu.sel]);
      else if (input.pressed('cancel')) { this.menu = null; svc.sfx('ui_cancel'); }
      return;
    }
    const n = list.length;
    if (n) {
      let s = this.sel;
      if (input.repeat('left')) s = s % COLS === 0 ? Math.min(n - 1, s + COLS - 1) : s - 1;
      if (input.repeat('right')) s = s % COLS === COLS - 1 || s + 1 >= n ? s - (s % COLS) : s + 1;
      if (input.repeat('up')) s = s - COLS >= 0 ? s - COLS : s;
      if (input.repeat('down')) s = s + COLS < n ? s + COLS : s;
      if (s !== this.sel) { this.sel = s; svc.sfx('ui_move'); }
      if (input.pressed('confirm')) { this.menu = { acts: this._actions(list[this.sel]), sel: 0 }; svc.sfx('ui_confirm'); if (this.menu.acts[0].disabled && this.menu.acts.length > 1) this.menu.sel = 1; }
    }
    if (input.pressed('cancel') || input.pressed('inventory') || input.pressed('pause')) { svc.sfx('ui_close'); this.close(null); }
  }
  render(ctx) {
    const k = ease.out(clamp(this.t / 0.2));
    const oy = snap((1 - k) * 20);
    const bx = 40, by = 48 + oy, bw = 880, bh = 448;
    dither(ctx, bx + 8, by + 8, bw, bh, 'rgba(0,0,0,1)', 0.5);
    ctx.drawImage(bagCanvas(bw, bh), bx, by);
    headerTab(ctx, bx + 24, by - 14, 'Bag');
    const list = this.list;
    // slots
    for (let i = 0; i < COLS * ROWS; i++) {
      const sx = GX + (i % COLS) * (SLOT + GAP), sy = GY + oy + Math.floor(i / COLS) * (SLOT + GAP);
      rect(ctx, sx, sy, SLOT, SLOT, 'rgba(20,22,12,0.55)');
      rect(ctx, sx, sy, SLOT, AP, 'rgba(0,0,0,0.5)'); rect(ctx, sx, sy, AP, SLOT, 'rgba(0,0,0,0.4)');
      rect(ctx, sx, sy + SLOT - AP, SLOT, AP, 'rgba(120,128,90,0.35)');
      const it = list[i];
      if (!it) continue;
      const sel = i === this.sel;
      const ic = svc.icon(it.id);
      const lift = sel ? -AP * 2 : 0;
      if (ic) { if (sel) dither(ctx, sx + 14, sy + 56, 44, 6, 'rgba(0,0,0,1)', 0.5); ctx.drawImage(ic, sx + 12, sy + 12 + lift, 48, 48); }
      else F.small.draw(ctx, it.def.name.slice(0, 6), sx + SLOT / 2, sy + 26, C.text, { align: 'center' });
      if (it.n > 1 || it.def.stack) {
        const s = `×${it.n}`;
        const w = F.small.width(s) + 8;
        rect(ctx, sx + SLOT - w - 2, sy + SLOT - 22, w, 20, 'rgba(10,10,8,0.85)');
        F.small.draw(ctx, s, sx + SLOT - 6, sy + SLOT - 22, C.text, { align: 'right' });
      }
      if (sel) {
        frame(ctx, sx - AP * 2, sy - AP * 2, SLOT + AP * 4, SLOT + AP * 4, C.red);
        const blink = Math.floor(this.t * 2) % 2;
        if (blink) frame(ctx, sx - AP * 3, sy - AP * 3, SLOT + AP * 6, SLOT + AP * 6, 'rgba(208,69,60,0.35)');
      }
    }
    if (!list.length) F.hand.draw(ctx, 'Lint. A gum wrapper. Nothing useful.', GX, GY + 120 + oy, '#bdb894');
    // detail card
    const it = list[this.sel];
    if (it) this._detail(ctx, it, 510, 84 + oy);
    hints(ctx, this.menu ? [['BACK', this.ui.input.keyLabel('cancel')], ['CHOOSE', this.ui.input.keyLabel('confirm')]]
      : [['CLOSE', this.ui.input.keyLabel('cancel')], ['ACTIONS', this.ui.input.keyLabel('confirm')]]);
  }
  _detail(ctx, it, x, y) {
    const w = 380, h = 380;
    dither(ctx, x + 8, y + 8, w, h, 'rgba(0,0,0,1)', 0.5);
    ctx.drawImage(paperSheet(w, h, { seed: 'itemcard', tone: '#dcd2b2', stains: 1, ruled: { top: 172, gap: 30 } }), x, y);
    const ic = svc.icon(it.id);
    rect(ctx, x + 22, y + 22, 104, 104, '#1c1d18');
    rect(ctx, x + 24, y + 24, 100, 100, '#2c2e24');
    if (ic) ctx.drawImage(ic, x + 26, y + 26, 96, 96);
    const name = it.def.name || it.id;
    const nf = F.typedL.width(name) > w - 160 ? F.typed : F.typedL;
    nf.draw(ctx, name, x + 142, y + 30, '#1e1d22');
    F.small.draw(ctx, spaced(it.def.key ? 'Key item' : it.def.stack ? `Supplies ×${it.n}` : 'Item'), x + 142, y + 74, '#6a6466');
    rect(ctx, x + 142, y + 100, 60, AP, C.red);
    const hf = handFont('tess');
    const lines = hf.font.wrap(svc.itemDesc(it.id) || '...', w - 48).slice(0, 6);
    lines.forEach((l, i) => hf.font.draw(ctx, l, x + 24, y + 142 + i * 30 + 6, hf.color));
    // action strip
    if (this.menu) {
      const acts = this.menu.acts;
      const ay = y + h - 56;
      rect(ctx, x + 12, ay - 6, w - 24, 48, 'rgba(14,15,18,0.94)');
      rect(ctx, x + 12, ay - 6, w - 24, AP, C.panelHi);
      const cw = (w - 24) / acts.length;
      acts.forEach((a, i) => {
        const cx = x + 12 + cw * i + cw / 2;
        const on = i === this.menu.sel;
        const s = spaced(a.label);
        F.small.draw(ctx, s, cx, ay + 8, a.disabled ? '#4a4850' : on ? C.textHi : C.textDim, { align: 'center' });
        if (on) triangle(ctx, snap(cx - F.small.width(s) / 2 - 20), ay + 11, 4, C.red, 'right');
      });
    }
  }
}
