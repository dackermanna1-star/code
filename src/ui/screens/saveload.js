// Save / Load: four file-folder slots (AUTO, 1, 2, 3) with chapter, place, play time and date.
// args { mode: 'save' | 'load', fromTitle } → resolves the slot loaded (or saved), else null.

import { Screen } from '../screen.js';
import { C, F } from '../theme.js';
import { steelPanel, rect, frame, dither, triangle, AP, clamp, ease, snap } from '../gfx.js';
import { headerTab, hints } from '../widgets.js';
import { closeMenus } from './pause.js';
import * as svc from '../services.js';

export class SaveLoadScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.pausesGame = true;
    this.dimWorld = 0.7;
    this.mode = args.mode === 'save' ? 'save' : 'load';
    this.sel = this.mode === 'save' ? 1 : 0;
    this.busy = false; this.flash = 0;
    this.refresh();
    if (this.mode === 'load') { const i = this.slots.findIndex((s) => s.sum); if (i >= 0) this.sel = i; }
  }
  refresh() { this.slots = svc.SLOTS.map((slot) => ({ slot, sum: svc.saveSummary(slot) })); }
  onOpen() { svc.sfx('ui_open'); }
  _enabled(s) { return this.mode === 'save' ? s.slot !== 'auto' : !!s.sum; }
  async _pick(s) {
    if (!this._enabled(s)) { svc.sfx('door_locked', { vol: 0.4 }); return; }
    this.busy = true;
    try {
      if (this.mode === 'save') {
        if (s.sum) {
          const ok = await this.open('confirm', { text: `Write over slot ${s.slot}?`, yes: 'Overwrite', no: 'Cancel', danger: true });
          if (!ok) return;
        }
        const done = await svc.saveTo(s.slot);
        svc.sfx(done ? 'pen_scratch' : 'door_locked');
        if (!done) this.ui.toast("Couldn't save.");
        else { this.ui.toast('Saved.'); this.flash = 1; }
        this.refresh();
      } else {
        svc.sfx('ui_confirm');
        if (this.args.fromTitle) { this.close(s.slot); return; }
        const ok = await this.open('confirm', { text: 'Load this save? Anything since your last save will be lost.', yes: 'Load', no: 'Cancel' });
        if (!ok) return;
        closeMenus(this.ui);
        this.result = s.slot;
        setTimeout(() => { this.ui.reset(); svc.loadSave(s.slot); }, 0);
      }
    } finally { this.busy = false; }
  }
  update(dt, input) {
    this.flash = Math.max(0, this.flash - dt * 2);
    if (!input || this.busy) return;
    const n = this.slots.length;
    if (input.repeat('up')) { this.sel = (this.sel + n - 1) % n; svc.sfx('ui_move'); }
    if (input.repeat('down')) { this.sel = (this.sel + 1) % n; svc.sfx('ui_move'); }
    if (input.pressed('confirm')) this._pick(this.slots[this.sel]);
    else if (input.pressed('cancel') || input.pressed('pause')) { svc.sfx('ui_close'); this.close(null); }
  }
  render(ctx) {
    const k = ease.out(clamp(this.t / 0.2));
    const x = 150, y = snap(48 + (1 - k) * 20), w = 660, h = 440;
    steelPanel(ctx, x, y, w, h, { fill: 'rgba(10,11,14,0.96)', rivets: true, seed: 31 });
    headerTab(ctx, x + 24, y - 14, this.mode === 'save' ? 'Save' : 'Load');
    this.slots.forEach((s, i) => {
      const sy = y + 34 + i * 98;
      const on = i === this.sel;
      const en = this._enabled(s);
      // manila folder with a tab
      const fx = x + 40, fw = w - 80, fh = 84;
      const tone = en ? '#c9b383' : '#4e4638';
      rect(ctx, fx, sy + 10, fw, fh - 10, tone);
      rect(ctx, fx, sy, 120, 14, tone);
      rect(ctx, fx, sy + 10, fw, AP, 'rgba(255,255,255,0.25)');
      rect(ctx, fx, sy + fh - AP, fw, AP, 'rgba(0,0,0,0.3)');
      F.small.draw(ctx, s.slot === 'auto' ? 'AUTO' : `SLOT ${s.slot}`, fx + 12, sy - 2, en ? '#3a3020' : '#2a251c');
      if (s.sum) {
        F.typed.draw(ctx, s.sum.chapterTitle || '', fx + 20, sy + 22, '#1e1b16');
        F.typedS.draw(ctx, s.sum.map || '', fx + 20, sy + 52, '#3e362a');
        F.typedS.draw(ctx, svc.fmtTime(s.sum.playtime), fx + fw - 20, sy + 22, '#3e362a', { align: 'right' });
        F.typedS.draw(ctx, svc.fmtDate(s.sum.date), fx + fw - 20, sy + 52, '#5a5040', { align: 'right' });
      } else F.typedS.draw(ctx, s.slot === 'auto' ? '— no checkpoint yet —' : '— empty —', fx + 20, sy + 36, en ? '#5a5040' : '#2c2820');
      if (on) {
        frame(ctx, fx - AP * 3, sy - AP * 3, fw + AP * 6, fh + AP * 6, en ? C.red : '#5a2a28');
        triangle(ctx, fx - 26 + (Math.floor(this.t * 3) % 2 ? AP : 0), sy + 34, 6, C.red, 'right');
        if (this.flash > 0 && this.mode === 'save') dither(ctx, fx, sy, fw, fh, 'rgba(255,250,230,1)', this.flash * 0.4);
      }
    });
    const cur = this.slots[this.sel];
    if (this.mode === 'save' && cur.slot === 'auto') F.small.draw(ctx, 'The autosave is written at checkpoints.', x + 40, y + h - 26, C.textMute);
    hints(ctx, [['BACK', this.ui.input.keyLabel('cancel')], [this.mode === 'save' ? 'SAVE' : 'LOAD', this.ui.input.keyLabel('confirm')]]);
  }
}
